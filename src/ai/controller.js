import { COLORS, PAD_DASH_SPEED, state, ctx, lerpAngle } from '../state.js';
import { players } from '../render3d.js';
import { CANOPY_SPEC, getCanopySurfaceY } from '../world.js';
import { LEAF_ULT_SPEED_MULT, isPlayerChargingFireUlt } from '../ultimates.js';
import { projectToNearestWalkable, findEscapeCorridors } from '../nav.js';
import {
  getAIProfile,
  resetAITacticalMemory,
  teamHasHumanPlayer,
  getMatchup
} from './shared.js';
import { CANOPY_AI_ROUTER } from './canopy.js';
import { resolveAINavSteerTarget, computeGroundObstacleSteering } from './steering.js';
import { getTeamTacticalPlan } from './tactics.js';
import {
  findIncomingFireLaserThreat,
  updateActiveFireUltTracking,
  tryAIToolDeploy
} from './combat_tools.js';
import { tryAIUltimate, computeLeafSprintArcTarget } from './combat_ult.js';
import {
  stepAIDashPhysics,
  tryAIBoomerangReturn,
  tryAIDash,
  tryAIBallPassOrShot
} from './combat_dash.js';

const THREE = ctx.THREE;

export function initAI() {
  ctx.world.rebuildAIRouter = () => CANOPY_AI_ROUTER.rebuild(CANOPY_SPEC);
  ctx.api.resetAITacticalMemory = resetAITacticalMemory;
  CANOPY_AI_ROUTER.rebuild(CANOPY_SPEC);
}

export function updateSittingAI(p, dt) {
  if (state.mode === 'tutorial' || state.mode === 'practice') return;
  if (teamHasHumanPlayer(p.team)) return;
  const pwr = state.teams[p.team]?.powers?.[p.role];
  if (!pwr || !pwr.standUp) return;

  p._aiStandUpTimer = (p._aiStandUpTimer || 0) + dt;
  const profile = getAIProfile();
  if (p._aiStandUpTimer < (profile.id === 'hard' ? 0.6 : 1.4)) return;

  const campingPred = players.some(
    (e) =>
      e.team !== p.team &&
      e.state === 'standing' &&
      COLORS[e.color].beats === p.color &&
      Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < (profile.id === 'hard' ? 6.5 : 4.5)
  );
  if (campingPred) return;

  p._aiStandUpTimer = 0;
  ctx.api.triggerPlayerAction?.(p);
}

function stepInactiveOrBoostedAI(p, dt) {
  if (state.mode === 'tutorial' || state.mode === 'practice') {
    p.vel.set(0, 0, 0);
    ctx.api.stepCharacterVerticalPhysics(p, 0, 0, dt, false);
    return true;
  }

  if (p.isAirborne || p.isLaunching) {
    ctx.api.stepCharacterVerticalPhysics(p, 0, 0, dt, false);
    return true;
  }

  if (p.padBoostTimer > 0) {
    p.padBoostTimer = Math.max(0, p.padBoostTimer - dt);
    const vx = p.padDirX * PAD_DASH_SPEED;
    const vz = p.padDirZ * PAD_DASH_SPEED;
    p.lastDashVx = vx;
    p.lastDashVz = vz;
    p.dashMomentumGrace = 0.12;
    p.facingAngle = lerpAngle(p.facingAngle, Math.atan2(vx, vz), 25 * dt);
    ctx.api.stepCharacterVerticalPhysics(p, vx, vz, dt, true);
    return true;
  }
  return false;
}

function collectNearbyPredators(p, profile, plan) {
  return plan.contacts
    .filter(
      (c) =>
        c.visible &&
        c.state === 'standing' &&
        getMatchup(p.color, c.knownColor, c.waterShield) === 'loses' &&
        Math.abs((c.pos.y || 0) - (p.pos.y || 0)) < 2.2 &&
        Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < profile.predatorAvoidDist
    )
    .sort(
      (a, b) =>
        Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) -
        Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z)
    );
}

function resolveAIStandoffAndSteerTarget(p, profile, task, leafArcTarget) {
  let targetPos = leafArcTarget || (task ? task.targetPos : null);
  if (task && (task.safeStandoff || 0) > 0 && task.targetEnemy && targetPos) {
    const dEnemy = Math.hypot(p.pos.x - task.targetEnemy.pos.x, p.pos.z - task.targetEnemy.pos.z);
    if (dEnemy < task.safeStandoff) {
      const awayX = (p.pos.x - task.targetEnemy.pos.x) / Math.max(0.1, dEnemy);
      const awayZ = (p.pos.z - task.targetEnemy.pos.z) / Math.max(0.1, dEnemy);
      const safeX = task.targetEnemy.pos.x + awayX * (task.safeStandoff + 1.2);
      const safeZ = task.targetEnemy.pos.z + awayZ * (task.safeStandoff + 1.2);
      const proj = projectToNearestWalkable(safeX, safeZ, p.pos.x, p.pos.z);
      targetPos = new THREE.Vector3(proj.x, 0, proj.z);
    }
  }

  if (CANOPY_SPEC.hasCanopy && p.onCanopy) {
    const curSurf = getCanopySurfaceY(p.pos.x, p.pos.z);
    if (curSurf) return CANOPY_AI_ROUTER.getSteerTarget(p, curSurf, targetPos);
  } else if (targetPos && state.mapId !== 'tutorial') {
    return resolveAINavSteerTarget(p, profile, targetPos);
  }
  return targetPos;
}

function accumulateAIMoveVector(p, profile, steerTarget, laserThreat, predators) {
  let moveX = 0;
  let moveZ = 0;

  if (steerTarget) {
    const dx = steerTarget.x - p.pos.x;
    const dz = steerTarget.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.35) {
      moveX += dx / dist;
      moveZ += dz / dist;
    }
  }

  if (laserThreat) {
    moveX += laserThreat.dodgeX * 2.6;
    moveZ += laserThreat.dodgeZ * 2.6;
  }

  if (predators.length > 0) {
    let repelX = 0;
    let repelZ = 0;
    for (let i = 0; i < predators.length; i++) {
      const pred = predators[i];
      const dx = p.pos.x - pred.pos.x;
      const dz = p.pos.z - pred.pos.z;
      const dist = Math.max(0.5, Math.hypot(dx, dz));
      const urgency =
        1.0 + Math.max(0, (profile.predatorAvoidDist - dist) / profile.predatorAvoidDist) * 1.45;
      repelX += (dx / dist) * urgency;
      repelZ += (dz / dist) * urgency;
    }

    if (!p.onCanopy && profile.id === 'hard') {
      const esc = findEscapeCorridors(p.pos.x, p.pos.z, 10.0, 8);
      let bestEsc = null;
      let bestEscScore = -Infinity;
      const rLen = Math.hypot(repelX, repelZ) || 1;
      const rux = repelX / rLen;
      const ruz = repelZ / rLen;
      for (let i = 0; i < esc.corridors.length; i++) {
        const c = esc.corridors[i];
        const s = (c.dirX * rux + c.dirZ * ruz) * 1.6 + (c.clearDist / 10.0) * 1.3;
        if (s > bestEscScore) {
          bestEscScore = s;
          bestEsc = c;
        }
      }
      moveX += bestEsc ? bestEsc.dirX * 1.75 : repelX;
      moveZ += bestEsc ? bestEsc.dirZ * 1.75 : repelZ;
    } else {
      moveX += repelX;
      moveZ += repelZ;
    }
  }

  return { moveX, moveZ };
}

function applyAIMovementAndFacing(p, dt, profile, moveCfg, lookAtPos) {
  const { moveX, moveZ, speed } = moveCfg;
  const mLen = Math.hypot(moveX, moveZ);
  if (mLen <= 0.05) {
    ctx.api.stepCharacterVerticalPhysics(p, 0, 0, dt, false);
    if (!p.onSlidePatch && !isPlayerChargingFireUlt(p) && lookAtPos) {
      const desiredAngle = Math.atan2(lookAtPos.x - p.pos.x, lookAtPos.z - p.pos.z);
      p.facingAngle = lerpAngle(p.facingAngle, desiredAngle, 7 * dt);
    }
    return;
  }

  const baseDirX = moveX / mLen;
  const baseDirZ = moveZ / mLen;
  let steerX = baseDirX;
  let steerZ = baseDirZ;
  if (!p.onCanopy) {
    const groundSteer = computeGroundObstacleSteering(p, baseDirX, baseDirZ);
    steerX = groundSteer.sx;
    steerZ = groundSteer.sz;
  }

  const sLen = Math.hypot(steerX, steerZ);
  let vx = (sLen > 0.01 ? steerX / sLen : baseDirX) * speed;
  let vz = (sLen > 0.01 ? steerZ / sLen : baseDirZ) * speed;

  if (p.slideGlideTimer > 0) {
    p.slideGlideTimer = Math.max(0, p.slideGlideTimer - dt);
    const damp = Math.exp(-5.0 * dt);
    p.slideGlideVx *= damp;
    p.slideGlideVz *= damp;
    vx = vx * 0.45 + p.slideGlideVx;
    vz = vz * 0.45 + p.slideGlideVz;
  }

  ctx.api.stepCharacterVerticalPhysics(p, vx, vz, dt, false);

  if (!p.onSlidePatch && !isPlayerChargingFireUlt(p)) {
    const desiredAngle = lookAtPos
      ? Math.atan2(lookAtPos.x - p.pos.x, lookAtPos.z - p.pos.z)
      : Math.atan2(vx, vz);
    p.facingAngle = lerpAngle(p.facingAngle, desiredAngle, (profile.id === 'hard' ? 12 : 8) * dt);
  }
}

export function updateAIPlayer(p, dt) {
  if (stepInactiveOrBoostedAI(p, dt)) return;

  const profile = getAIProfile();
  const plan = getTeamTacticalPlan(p.team, profile);

  if (p.dashTimer > 0) {
    stepAIDashPhysics(p, dt, profile, plan);
    return;
  }

  if ((p._aiUltThinkCd || 0) > 0) {
    p._aiUltThinkCd = Math.max(0, p._aiUltThinkCd - dt);
  }

  const leafMult =
    p.leafUltTimer > 0 && !p.carryingBall ? p.leafUltSpeedMult || LEAF_ULT_SPEED_MULT : 1.0;
  const speed = (p.team === 'ally' ? profile.allySpeed : profile.enemySpeed) * leafMult;

  updateActiveFireUltTracking(p, profile, plan);
  const laserThreat = findIncomingFireLaserThreat(p);
  const predators = collectNearbyPredators(p, profile, plan);

  tryAIUltimate(p, profile, plan, laserThreat);
  if (tryAIBoomerangReturn(p, profile, plan, laserThreat)) {
    if (p.dashTimer > 0) stepAIDashPhysics(p, dt, profile, plan);
    return;
  }
  tryAIBallPassOrShot(p, profile, plan, predators);
  tryAIToolDeploy(p, profile, plan, laserThreat);
  if (tryAIDash(p, dt, profile, plan, laserThreat, predators)) {
    if (p.dashTimer > 0) stepAIDashPhysics(p, dt, profile, plan);
    return;
  }

  const task = plan.assignments.get(p.id);
  const leafArcTarget = computeLeafSprintArcTarget(p, profile, plan);
  const steerTarget = resolveAIStandoffAndSteerTarget(p, profile, task, leafArcTarget);
  const { moveX, moveZ } = accumulateAIMoveVector(p, profile, steerTarget, laserThreat, predators);
  applyAIMovementAndFacing(
    p,
    dt,
    profile,
    { moveX, moveZ, speed },
    task ? task.lookAtPos || null : null
  );
}
