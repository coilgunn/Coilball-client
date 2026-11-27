import { FIELD, state, mp, ctx, lerpAngle } from '../state.js';
import { scene, players, spawnParticles } from '../render3d.js';
import {
  CANOPY_SPEC,
  JUNGLE_OBSTACLES,
  JUNGLE_WALLS,
  PARK_LANDMARKS,
  rayToCapsuleDistance2D
} from '../world.js';
import {
  FIRE_ULT_DELAY,
  FIRE_ULT_MAX_LEN,
  FIRE_ULT_SPEED,
  FIRE_ULT_BEAM_RADIUS,
  FIRE_ULT_LINGER,
  LEAF_ULT_WALL_RADIUS,
  activeFireLasers,
  activeLeafWalls,
  activeWaterWaves,
  _ultRay,
  getUltimateAimAngle
} from './shared.js';
import {
  rayToCircleDistance2D,
  hitUltAABB,
  updateTerrainRibbonLocal
} from './geometry.js';
import { isPointProtectedByWaterWave } from './water.js';

const THREE = ctx.THREE;

function clipFireRayArena(ox, oz, dirX, dirZ, bestT) {
  const halfW = FIELD.width * 0.5 - 0.35;
  const halfD = FIELD.depth * 0.5 - 0.35;
  if (Math.abs(dirX) > 1e-5) {
    const tx = ((dirX > 0 ? halfW : -halfW) - ox) / dirX;
    if (tx > 0 && tx < bestT) bestT = tx;
  }
  if (Math.abs(dirZ) > 1e-5) {
    const tz = ((dirZ > 0 ? halfD : -halfD) - oz) / dirZ;
    if (tz > 0 && tz < bestT) bestT = tz;
  }
  return bestT;
}

function clipFireRayMapObstacles(oy, bestT) {
  const onHighCanopy = CANOPY_SPEC.hasCanopy && oy >= 3.8;
  for (let i = 0; i < JUNGLE_OBSTACLES.length; i++) {
    const obs = JUNGLE_OBSTACLES[i];
    if (onHighCanopy && obs.kind !== 'gazebo' && obs.kind !== 'waterfall') continue;
    const t = rayToCircleDistance2D(_ultRay, obs.x, obs.z, obs.radius + 0.15, bestT);
    if (t < bestT) bestT = t;
  }
  if (onHighCanopy) return bestT;

  for (let i = 0; i < JUNGLE_WALLS.length; i++) {
    const w = JUNGLE_WALLS[i];
    bestT = rayToCapsuleDistance2D(_ultRay, w, w.radius + 0.15, bestT, 0.2);
  }
  if (CANOPY_SPEC.hasCanopy) {
    for (let i = 0; i < CANOPY_SPEC.trunks.length; i++) {
      const tr = CANOPY_SPEC.trunks[i];
      const t = rayToCircleDistance2D(_ultRay, tr.x, tr.z, tr.radius + 0.15, bestT);
      if (t < bestT) bestT = t;
    }
    bestT = hitUltAABB(-CANOPY_SPEC.rampSkirtOuterX, -CANOPY_SPEC.rampSkirtInnerX, -CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ, bestT);
    bestT = hitUltAABB(CANOPY_SPEC.rampSkirtInnerX, CANOPY_SPEC.rampSkirtOuterX, -CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ, bestT);
    bestT = hitUltAABB(-1.9, 1.9, -CANOPY_SPEC.launchPierOuterZ, -CANOPY_SPEC.launchPierInnerZ, bestT);
    return hitUltAABB(-1.9, 1.9, CANOPY_SPEC.launchPierInnerZ, CANOPY_SPEC.launchPierOuterZ, bestT);
  }
  if (state.mapId === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    return hitUltAABB(sv.chaletMinX, sv.chaletMaxX, sv.chaletMinZ, sv.chaletMaxZ, bestT);
  }
  if (state.mapId === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    bestT = rayToCircleDistance2D(_ultRay, -lf.fountainX, 0, lf.fountainR, bestT);
    return rayToCircleDistance2D(_ultRay, lf.fountainX, 0, lf.fountainR, bestT);
  }
  if (state.mapId === 'mont-royal') {
    const mr = PARK_LANDMARKS.montRoyal;
    return rayToCircleDistance2D(_ultRay, mr.crossX, mr.crossZ, mr.crossRadius, bestT);
  }
  return bestT;
}

function clipFireRayDynamicBlockers(bestT) {
  for (let w = 0; w < activeLeafWalls.length; w++) {
    const wall = activeLeafWalls[w];
    if (wall.phase !== 'grown') continue;
    for (let i = 0; i < wall.nodes.length; i++) {
      const nd = wall.nodes[i];
      const t = rayToCircleDistance2D(_ultRay, nd.x, nd.z, LEAF_ULT_WALL_RADIUS + 0.18, bestT);
      if (t < bestT) bestT = t;
    }
    for (let i = 0; i < wall.nodes.length - 1; i++) {
      const a = wall.nodes[i];
      const b = wall.nodes[i + 1];
      const t = rayToCircleDistance2D(_ultRay, (a.x + b.x) * 0.5, (a.z + b.z) * 0.5, LEAF_ULT_WALL_RADIUS, bestT);
      if (t < bestT) bestT = t;
    }
  }
  const toolWalls = ctx.entities.activeToolWalls || [];
  for (let w = 0; w < toolWalls.length; w++) {
    const tw = toolWalls[w];
    for (let s = 0; s < 5; s++) {
      const u = 0.1 + s * 0.2;
      const t = rayToCircleDistance2D(_ultRay, tw.ax + (tw.bx - tw.ax) * u, tw.az + (tw.bz - tw.az) * u, 0.45, bestT);
      if (t < bestT) bestT = t;
    }
  }
  for (let w = 0; w < activeWaterWaves.length; w++) {
    const wave = activeWaterWaves[w];
    for (let i = 0; i < wave.segments.length; i++) {
      const seg = wave.segments[i];
      if (!seg.active) continue;
      const t = rayToCircleDistance2D(_ultRay, seg.x, seg.z, seg.radius + 0.35, bestT);
      if (t < bestT) bestT = t;
    }
  }
  return bestT;
}

export function computeFireLaserMaxDist(ox, oy, oz, dirX, dirZ, maxLen = FIRE_ULT_MAX_LEN) {
  _ultRay.ox = ox;
  _ultRay.oz = oz;
  _ultRay.dirX = dirX;
  _ultRay.dirZ = dirZ;
  let bestT = clipFireRayArena(ox, oz, dirX, dirZ, maxLen);
  bestT = clipFireRayMapObstacles(oy, bestT);
  bestT = clipFireRayDynamicBlockers(bestT);
  return Math.max(0.8, bestT);
}

function updateFireLaserElectricArcs(f, beamLen, alpha) {
  if (!f.electricArcs || f.electricArcs.length === 0) return;
  const len = Math.max(0.2, beamLen);
  const flickerFrame = Math.floor(f.arcTime * 38);

  for (let aIdx = 0; aIdx < f.electricArcs.length; aIdx++) {
    const arc = f.electricArcs[aIdx];
    arc.line.visible = true;
    arc.line.position.y = f.oy;
    arc.line.material.opacity = arc.baseOpacity * alpha;

    const pos = arc.positions;
    const pts = arc.ptsCount;
    for (let k = 0; k < pts; k++) {
      const t = k / (pts - 1);
      const env = Math.sin(t * Math.PI);
      const theta =
        arc.phaseOffset +
        f.arcTime * arc.speed +
        t * Math.PI * 2 * arc.turns * Math.max(1, len / 18);
      const jag =
        k === 0 || k === pts - 1
          ? 0
          : Math.sin(k * 12.9898 + flickerFrame * 78.233 + arc.phaseOffset * 5.7);
      const radius =
        (arc.radialBase + jag * 0.22) *
        (0.25 + 0.75 * env) *
        (0.4 + 0.6 * alpha);
      const idx3 = k * 3;
      pos[idx3] = Math.cos(theta) * radius;
      pos[idx3 + 1] = Math.sin(theta) * radius;
      pos[idx3 + 2] = t * len;
    }
    arc.line.geometry.attributes.position.needsUpdate = true;
  }
}

function applyFireLaserPlayerHits(f) {
  if (mp.enabled && !mp.isHost) return;
  for (let pIdx = 0; pIdx < players.length; pIdx++) {
    const target = players[pIdx];
    if (target.tutorialHidden || target.id === f.casterId || target.team === f.team || target.state === 'sitting') continue;
    if (f.hitPlayers.has(target.id)) continue;
    if (Math.abs((target.pos.y || 0) + 1.0 - f.oy) > 2.35) continue;

    const toX = target.pos.x - f.ox;
    const toZ = target.pos.z - f.oz;
    const proj = toX * f.dirX + toZ * f.dirZ;
    if (proj < -0.4 || proj > f.currentLen + 0.65) continue;

    const perpDist = Math.hypot(toX - f.dirX * proj, toZ - f.dirZ * proj);
    if (perpDist > (f.beamRadius || FIRE_ULT_BEAM_RADIUS) + 0.45) continue;

    f.hitPlayers.add(target.id);
    if (target.waterShieldTimer > 0 || isPointProtectedByWaterWave(target.pos.x, target.pos.z, 1.35)) {
      spawnParticles(target.pos, 0x38bdf8, 22);
      spawnParticles(target.pos, 0xffffff, 14);
      ctx.api.playSfx?.('water_shield_block', { pos: target.pos });
      ctx.api.broadcastToast(
        `🛡️💧 <strong>Protégée par l'Eau !</strong> ${target.role} résiste au Rayon Plasma de ${f.casterRole} !`,
        3000
      );
      continue;
    }

    ctx.api.sitDownPlayer(target);
    if (f.team === 'ally') {
      state.allyPE += 1;
      state.roundAllyKills += 1;
    } else {
      state.enemyPE += 1;
      state.roundEnemyKills += 1;
    }
    spawnParticles(target.pos, 0xff6b00, 26);
    spawnParticles(target.pos, 0xffffff, 18);
    ctx.api.playSfx?.('ult_fire_hit', { pos: target.pos, ally: f.team === state.myTeam, global: true });
    const teamName = f.team === 'ally' ? 'Équipe Or' : 'Équipe Violette';
    ctx.api.broadcastToast(
      `🔥🎯 <strong>SNIPE PLASMA !</strong> ${teamName} ${f.casterRole} assoit ${target.role} à distance → <strong>+1 🪙 PO !</strong>`,
      3800
    );
    ctx.api.updateTopHUD();
    ctx.api.updateRosterHUD();
  }
}

function updateFireLaserTelegraphAim(f, c, dt) {
  const isLocalCaster = c.team === state.myTeam && c.role === state.controlledRole;
  const isHumanRemote =
    mp.enabled &&
    (!mp.isHost || mp.members.some((m) => m.team === c.team && (m.activeRole === c.role || m.slot === c.role)));
  if (isLocalCaster) {
    f.aimAngle = typeof f.lockedAimAngle === 'number' && Number.isFinite(f.lockedAimAngle)
      ? f.lockedAimAngle
      : getUltimateAimAngle(c);
    c.facingAngle = f.aimAngle;
  } else if (isHumanRemote) {
    f.aimAngle = c.facingAngle;
  } else {
    if (typeof c._aiFireAimAngle === 'number' && Number.isFinite(c._aiFireAimAngle)) {
      const turnRate = state.aiDifficulty === 'hard' ? 3.8 : 1.35;
      f.aimAngle = lerpAngle(f.aimAngle, c._aiFireAimAngle, Math.min(1, turnRate * dt));
    }
    c.facingAngle = f.aimAngle;
  }
  f.dirX = Math.sin(f.aimAngle);
  f.dirZ = Math.cos(f.aimAngle);
  f.ox = c.pos.x + f.dirX * 0.85;
  f.oy = (c.pos.y || 0) + 1.05;
  f.oz = c.pos.z + f.dirZ * 0.85;
  f.group.position.set(f.ox, 0, f.oz);
  f.group.rotation.y = f.aimAngle;
  f.warnCore.position.y = f.oy;
  f.muzzleRing.position.set(0, f.oy, 0.28);
  if (f.chargeBallGroup) f.chargeBallGroup.position.set(0, f.oy, 0.28);
  f.maxLen = computeFireLaserMaxDist(f.ox, f.oy, f.oz, f.dirX, f.dirZ, FIRE_ULT_MAX_LEN);
}

function stepFireTelegraph(f, dt) {
  f.timer -= dt;
  const c = f.caster;
  if (!c || c.state === 'sitting' || c.tutorialHidden) return false;
  updateFireLaserTelegraphAim(f, c, dt);

  const prog = 1 - Math.max(0, f.timer / (f.delay || FIRE_ULT_DELAY));
  const pulse = 0.45 + 0.45 * Math.sin(prog * Math.PI * 10);
  const dangerHalfW = (f.beamRadius || FIRE_ULT_BEAM_RADIUS) * 1.05 * (1 + prog * 0.2);
  updateTerrainRibbonLocal(f.dangerStrip, {
    ox: f.ox,
    oz: f.oz,
    dirX: f.dirX,
    dirZ: f.dirZ,
    halfW: dangerHalfW,
    length: f.maxLen,
    yOffset: 0.2,
    onCanopy: !!c.onCanopy
  });
  f.dangerStrip.material.opacity = 0.35 + pulse * 0.45;
  f.warnCore.scale.set(1 + prog * 1.4, 1 + prog * 1.4, f.maxLen);
  f.warnCore.material.opacity = 0.55 + prog * 0.45;
  f.muzzleRing.scale.setScalar(0.45 + prog * 1.15);

  if (f.chargeBallGroup) {
    const ballScale = 0.18 + prog * 0.92 + 0.09 * Math.sin(prog * Math.PI * 14);
    f.chargeBallGroup.scale.setScalar(ballScale);
    if (f.ballAuraMat) f.ballAuraMat.opacity = 0.45 + prog * 0.44;
    if (f.ballHalo) {
      f.ballHalo.rotation.x += dt * 11;
      f.ballHalo.rotation.y += dt * 8.5;
    }
    if (Math.random() < 0.45) {
      spawnParticles(
        new THREE.Vector3(f.ox + f.dirX * 0.28, f.oy, f.oz + f.dirZ * 0.28),
        Math.random() < 0.5 ? 0xff6b00 : 0xfde047,
        1
      );
    }
  }

  if (f.timer <= 0) {
    f.phase = 'firing';
    f.currentLen = Math.min(f.maxLen, 18.0);
    f.outerBeam.visible = true;
    f.innerBeam.visible = true;
    f.impactSphere.visible = true;
    f.warnCore.visible = false;
    if (f.chargeBallGroup) f.chargeBallGroup.visible = false;
    updateFireLaserElectricArcs(f, f.currentLen, 1.0);
    spawnParticles(new THREE.Vector3(f.ox, f.oy, f.oz), 0xffffff, 18);
    spawnParticles(new THREE.Vector3(f.ox, f.oy, f.oz), 0xff6b00, 22);
    ctx.api.playSfx?.('ult_fire_beam', { pos: { x: f.ox, y: f.oy, z: f.oz }, evolved: f.evolved, global: true });
  }
  return true;
}

function stepFireFiring(f, dt) {
  f.currentLen = Math.min(f.maxLen, f.currentLen + (f.speed || FIRE_ULT_SPEED) * dt);
  f.outerBeam.position.y = f.oy;
  f.outerBeam.scale.set(1, 1, f.currentLen);
  f.innerBeam.position.y = f.oy;
  f.innerBeam.scale.set(1, 1, f.currentLen);
  updateTerrainRibbonLocal(f.dangerStrip, {
    ox: f.ox,
    oz: f.oz,
    dirX: f.dirX,
    dirZ: f.dirZ,
    halfW: (f.beamRadius || FIRE_ULT_BEAM_RADIUS) * 1.05,
    length: f.currentLen,
    yOffset: 0.2,
    onCanopy: !!(f.caster && f.caster.onCanopy)
  });
  f.impactSphere.position.set(0, f.oy, f.currentLen);
  updateFireLaserElectricArcs(f, f.currentLen, 1.0);
  applyFireLaserPlayerHits(f);

  if (f.currentLen >= f.maxLen - 0.05) {
    const hitPos = new THREE.Vector3(f.ox + f.dirX * f.maxLen, f.oy, f.oz + f.dirZ * f.maxLen);
    spawnParticles(hitPos, 0xff6b00, 18);
    spawnParticles(hitPos, 0xffffff, 12);
    f.phase = 'linger';
  }
}

function stepFireLinger(f, dt) {
  f.lingerTimer -= dt;
  const alpha = Math.max(0, f.lingerTimer / FIRE_ULT_LINGER);
  f.outerBeam.scale.set(alpha * 1.35, alpha * 1.35, f.maxLen);
  f.outerBeam.material.opacity = alpha * 0.85;
  f.innerBeam.scale.set(alpha, alpha, f.maxLen);
  f.innerBeam.material.opacity = alpha;
  f.dangerStrip.material.opacity = alpha * 0.35;
  f.muzzleRing.material.opacity = alpha * 0.8;
  f.impactSphere.scale.setScalar(0.6 + (1 - alpha) * 1.4);
  f.impactSphere.material.opacity = alpha;
  updateFireLaserElectricArcs(f, f.maxLen, alpha);
  return f.lingerTimer > 0;
}

export function updateFireLasers(dt) {
  for (let i = activeFireLasers.length - 1; i >= 0; i--) {
    const f = activeFireLasers[i];
    f.arcTime = (f.arcTime || 0) + dt;
    f.maxLen = computeFireLaserMaxDist(f.ox, f.oy, f.oz, f.dirX, f.dirZ, FIRE_ULT_MAX_LEN);

    if (f.phase === 'telegraph') {
      if (!stepFireTelegraph(f, dt)) {
        scene.remove(f.group);
        activeFireLasers.splice(i, 1);
      }
    } else if (f.phase === 'firing') {
      stepFireFiring(f, dt);
    } else if (f.phase === 'linger' && !stepFireLinger(f, dt)) {
      scene.remove(f.group);
      activeFireLasers.splice(i, 1);
    }
  }
}

export function isPlayerChargingFireUlt(p) {
  if (!p) return false;
  for (let i = 0; i < activeFireLasers.length; i++) {
    const f = activeFireLasers[i];
    if (f.phase === 'telegraph' && f.casterId === p.id) return true;
  }
  return false;
}
