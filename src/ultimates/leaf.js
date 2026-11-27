import { ctx } from '../state.js';
import { scene, players, spawnParticles } from '../render3d.js';
import { distSqPointToSegment2D } from '../world.js';
import {
  LEAF_ULT_SPRINT_DURATION,
  LEAF_ULT_SPEED_MULT,
  LEAF_ULT_GROW_DELAY,
  LEAF_ULT_NODE_SPACING,
  LEAF_ULT_WALL_RADIUS,
  activeLeafWalls,
  hasPlayerUltEvo
} from './shared.js';
import {
  plantLeafSproutNode,
  createLeafWallRecord,
  growLeafWallMesh
} from './leaf_mesh.js';

export function spawnLeafWallUltimate(caster, aimAngle = null) {
  const evolved = hasPlayerUltEvo(caster);
  const sprintDur = evolved ? 3.5 : LEAF_ULT_SPRINT_DURATION;
  const speedMult = evolved ? 4.2 : LEAF_ULT_SPEED_MULT;

  if (typeof aimAngle === 'number' && Number.isFinite(aimAngle)) {
    caster.facingAngle = aimAngle;
  }

  caster.leafUltTimer = sprintDur;
  caster.leafUltMaxDuration = sprintDur;
  caster.leafUltSpeedMult = speedMult;

  const wall = createLeafWallRecord(caster, evolved);
  if (typeof aimAngle === 'number' && Number.isFinite(aimAngle)) {
    wall.aimAngle = aimAngle;
  }
  plantLeafSproutNode(wall, caster.pos.x, caster.pos.y, caster.pos.z);
  spawnParticles(caster.pos, 0x22c55e, 22);
  spawnParticles(caster.pos, 0x86efac, 14);
  ctx.api.playSfx?.('ult_leaf_sprint', { pos: caster.pos, evolved, global: true });
  activeLeafWalls.push(wall);
}

function stepLeafSprinting(wall, dt) {
  wall.sprintTimer -= dt;
  const c = wall.caster;
  if (!c || c.state !== 'standing' || c.carryingBall || c.leafUltTimer <= 0 || wall.sprintTimer <= 0) {
    if (c) c.leafUltTimer = 0;
    wall.phase = 'germinating';
    wall.growDelayTimer = LEAF_ULT_GROW_DELAY;
    return;
  }

  const last = wall.nodes[wall.nodes.length - 1];
  const dist = last ? Math.hypot(c.pos.x - last.x, c.pos.z - last.z) : 999;
  if (dist >= LEAF_ULT_NODE_SPACING) {
    plantLeafSproutNode(wall, c.pos.x, c.pos.y, c.pos.z);
    if (Math.random() < 0.7) {
      spawnParticles(c.pos, 0x4ade80, 3);
    }
  }
}

function stepLeafGerminating(wall, dt) {
  wall.growDelayTimer -= dt;
  const pulse = 1 + 0.35 * Math.sin((1 - wall.growDelayTimer / LEAF_ULT_GROW_DELAY) * Math.PI * 6);
  for (let n = 0; n < wall.nodes.length; n++) {
    const sp = wall.nodes[n].sprout;
    if (sp) sp.scale.set(pulse, 1 + (1 - wall.growDelayTimer) * 0.85, pulse);
  }
  if (wall.growDelayTimer > 0) return;

  wall.phase = 'grown';
  wall.growAnim = 0.01;
  growLeafWallMesh(wall);
  wall.treeWallGroup.scale.set(1, 0.05, 1);
  ctx.api.playSfx?.('ult_leaf_grow', { pos: wall.nodes[0], evolved: wall.evolved, global: true });
  ctx.api.markNavDynamicDirty?.();

  for (let pIdx = 0; pIdx < players.length; pIdx++) {
    const p = players[pIdx];
    if (p.tutorialHidden) continue;
    pushOutFromLeafWalls(p.pos, 0.75, p.vel);
    ctx.api.clampToField(p.pos, 0.72, null, {
      onCanopy: !!p.onCanopy,
      isAirborne: !!p.isAirborne,
      airSource: p.airSource || null
    });
  }
}

function stepLeafGrown(wall, dt) {
  if (wall.growAnim < 1) {
    wall.growAnim = Math.min(1, wall.growAnim + dt * 6.5);
    wall.treeWallGroup.scale.set(1, wall.growAnim, 1);
  }
  wall.wallTimer -= dt;
  if (wall.ringMat) {
    if (wall.wallTimer <= 1.4) {
      wall.ringMat.color.setHex(0xf97316);
      const pulse = 0.45 + 0.4 * Math.abs(Math.sin(wall.wallTimer * Math.PI * 3.5));
      wall.ringMat.opacity = Math.min(0.85, pulse) * Math.min(1, wall.wallTimer / 0.6);
    } else {
      wall.ringMat.color.setHex(0x4ade80);
      wall.ringMat.opacity = 0.65;
    }
  }
  if (wall.wallTimer < 1.2) {
    const shrink = Math.max(0.05, wall.wallTimer / 1.2);
    wall.treeWallGroup.scale.set(1, shrink, 1);
  }
  return wall.wallTimer > 0;
}

export function updateLeafWalls(dt) {
  for (let i = activeLeafWalls.length - 1; i >= 0; i--) {
    const wall = activeLeafWalls[i];
    if (wall.phase === 'sprinting') {
      stepLeafSprinting(wall, dt);
    } else if (wall.phase === 'germinating') {
      stepLeafGerminating(wall, dt);
    } else if (wall.phase === 'grown' && !stepLeafGrown(wall, dt)) {
      scene.remove(wall.group);
      activeLeafWalls.splice(i, 1);
      ctx.api.markNavDynamicDirty?.();
    }
  }
}

export function hitsGrownLeafWall(x, z, extraRadius = 0.5, yRef = null) {
  const r = LEAF_ULT_WALL_RADIUS + extraRadius;
  const rSq = r * r;
  for (let w = 0; w < activeLeafWalls.length; w++) {
    const wall = activeLeafWalls[w];
    if (wall.phase !== 'grown') continue;
    const maxH = wall.evolved ? 7.5 : 3.85;
    for (let i = 0; i < wall.nodes.length; i++) {
      const nd = wall.nodes[i];
      if (yRef !== null && Math.abs(yRef - (nd.y || 0)) > maxH) continue;
      const dx = x - nd.x;
      const dz = z - nd.z;
      if (dx * dx + dz * dz <= rSq) return true;
    }
    for (let i = 0; i < wall.nodes.length - 1; i++) {
      const a = wall.nodes[i];
      const b = wall.nodes[i + 1];
      if (yRef !== null && Math.abs(yRef - (a.y || 0)) > maxH) continue;
      if (distSqPointToSegment2D(x, z, a.x, a.z, b.x, b.z) <= rSq) return true;
    }
  }
  return false;
}

export function pushOutFromLeafWalls(pos, entityRadius = 0.72, bounceVel = null) {
  const minDist = LEAF_ULT_WALL_RADIUS + entityRadius;
  const minDistSq = minDist * minDist;
  const posY = typeof pos.y === 'number' ? pos.y : 0;

  for (let w = 0; w < activeLeafWalls.length; w++) {
    const wall = activeLeafWalls[w];
    if (wall.phase !== 'grown') continue;
    const maxH = wall.evolved ? 7.5 : 3.85;

    for (let i = 0; i < wall.nodes.length; i++) {
      const a = wall.nodes[i];
      if (Math.abs(posY - (a.y || 0)) > maxH) continue;
      const b = i < wall.nodes.length - 1 ? wall.nodes[i + 1] : a;
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const lenSq = vx * vx + vz * vz;
      const t = lenSq > 0.0001
        ? Math.max(0, Math.min(1, ((pos.x - a.x) * vx + (pos.z - a.z) * vz) / lenSq))
        : 0;
      const cx = a.x + t * vx;
      const cz = a.z + t * vz;
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const dSq = dx * dx + dz * dz;
      if (dSq >= minDistSq) continue;

      const d = Math.sqrt(dSq);
      const nx = d > 0.0001 ? dx / d : 1;
      const nz = d > 0.0001 ? dz / d : 0;
      pos.x = cx + nx * minDist;
      pos.z = cz + nz * minDist;
      if (bounceVel) {
        const vn = bounceVel.x * nx + bounceVel.z * nz;
        if (vn < 0) {
          bounceVel.x -= 1.5 * vn * nx;
          bounceVel.z -= 1.5 * vn * nz;
        }
      }
    }
  }
}
