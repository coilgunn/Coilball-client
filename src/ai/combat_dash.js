import {
  DASH_SPEED,
  PASS_CHARGE_SPEC,
  canPlayerPassOrThrow,
  state,
  ctx,
  lerpAngle
} from '../state.js';
import { players } from '../render3d.js';
import { hasClearLineOfSight } from '../world.js';
import { FIRE_ULT_BEAM_RADIUS, isPlayerChargingFireUlt } from '../ultimates.js';
import {
  probeClearDistance,
  findEscapeCorridors,
  findBounceWallReflection
} from '../nav.js';
import {
  teamHasHumanPlayer,
  getEffectiveDashDistance,
  getEffectiveDashKind,
  getMatchup
} from './shared.js';

export function stepAIDashPhysics(p, dt, profile, plan) {
  p.dashTimer = Math.max(0, p.dashTimer - dt);

  if (p.dashKind === 'slide' && profile.useActiveSlideSteer) {
    const task = plan.assignments.get(p.id);
    const aimPt = task?.targetEnemy?.pos || p._aiSlideTarget || task?.targetPos;
    if (aimPt) {
      const adx = aimPt.x - p.pos.x;
      const adz = aimPt.z - p.pos.z;
      if (Math.hypot(adx, adz) > 0.4) {
        const curAng = Math.atan2(p.dashDirX, p.dashDirZ);
        const nextAng = lerpAngle(curAng, Math.atan2(adx, adz), 5.5 * dt);
        p.dashDirX = Math.sin(nextAng);
        p.dashDirZ = Math.cos(nextAng);
      }
    }
  }

  const dashSpeed = p.dashSpeed || DASH_SPEED;
  const vx = p.dashDirX * dashSpeed;
  const vz = p.dashDirZ * dashSpeed;
  p.lastDashVx = vx;
  p.lastDashVz = vz;
  p.dashMomentumGrace = 0.12;
  if (!isPlayerChargingFireUlt(p)) {
    p.facingAngle = lerpAngle(p.facingAngle, Math.atan2(vx, vz), 25 * dt);
  }

  if (p.dashKind === 'slide' && p.dashTimer <= 0) {
    p.slideGlideTimer = 0.4;
    p.slideGlideVx = vx * 0.72;
    p.slideGlideVz = vz * 0.72;
  }

  ctx.api.stepCharacterVerticalPhysics(p, vx, vz, dt, true);

  if (
    profile.useDashJump &&
    p.dashTimer <= 0.045 &&
    state.teams[p.team]?.teamJump &&
    (p.jumpCooldown || 0) <= 0 &&
    !p.onCanopy &&
    probeClearDistance(p.pos.x, p.pos.z, p.dashDirX, p.dashDirZ, 10.0, 1.0) >= 8.5
  ) {
    ctx.api.triggerJump?.(false, p);
  }
}

export function tryAIBoomerangReturn(p, profile, plan, laserThreat) {
  if (!profile.useBoomerangReturn) return false;
  if (!p.boomerangOrigin || p.boomerangWindow <= 0 || p.dashTimer > 0) return false;
  if (p.state !== 'standing' || p.carryingBall) return false;

  const orig = p.boomerangOrigin;

  if (laserThreat) {
    const f = laserThreat.laser;
    const oToX = orig.x - f.ox;
    const oToZ = orig.z - f.oz;
    const oProj = oToX * f.dirX + oToZ * f.dirZ;
    const oPerp = Math.hypot(oToX - f.dirX * oProj, oToZ - f.dirZ * oProj);
    if (oPerp > (f.beamRadius || FIRE_ULT_BEAM_RADIUS) + 2.2) {
      return !!ctx.api.triggerBoomerangReturn?.(p);
    }
  }

  const preds = plan.contacts.filter(
    (c) =>
      c.visible &&
      c.state === 'standing' &&
      getMatchup(p.color, c.knownColor, c.waterShield) === 'loses'
  );
  for (let i = 0; i < preds.length; i++) {
    const pred = preds[i];
    const dNow = Math.hypot(pred.pos.x - p.pos.x, pred.pos.z - p.pos.z);
    const dOrig = Math.hypot(pred.pos.x - orig.x, pred.pos.z - orig.z);
    if (dNow < 5.6 && dOrig > dNow + 3.2) {
      return !!ctx.api.triggerBoomerangReturn?.(p);
    }
  }

  const task = plan.assignments.get(p.id);
  if (task && task.targetPos) {
    const dNow = Math.hypot(task.targetPos.x - p.pos.x, task.targetPos.z - p.pos.z);
    const dOrig = Math.hypot(task.targetPos.x - orig.x, task.targetPos.z - orig.z);
    if (dOrig + 6.0 < dNow && p.boomerangWindow < 1.35) {
      return !!ctx.api.triggerBoomerangReturn?.(p);
    }
  }

  return false;
}

function fireAIDash(p, profile, dx, dz, slideTargetPos = null) {
  const dashKind = getEffectiveDashKind(p);
  p._aiDashThinkCd = profile.dashDecisionCd;
  if (dashKind === 'slide' && slideTargetPos) {
    p._aiSlideTarget = { x: slideTargetPos.x, z: slideTargetPos.z };
  } else {
    p._aiSlideTarget = null;
  }
  return !!ctx.api.executePlayerDash?.(p, dx, dz, { isHuman: false });
}

function tryPredatorEscapeDash(p, profile, predators, dashDist, isAllyOfHuman) {
  if (predators.length === 0) return false;
  const closestPred = predators[0];
  const dPred = Math.hypot(p.pos.x - closestPred.pos.x, p.pos.z - closestPred.pos.z);
  const threshold = isAllyOfHuman ? 4.3 : profile.predatorDashDist;
  if (dPred >= threshold) return false;

  const esc = findEscapeCorridors(p.pos.x, p.pos.z, Math.min(12, dashDist + 2), 12);
  const awayX = (p.pos.x - closestPred.pos.x) / Math.max(0.1, dPred);
  const awayZ = (p.pos.z - closestPred.pos.z) / Math.max(0.1, dPred);
  let bestDir = null;
  let bestScore = -Infinity;
  for (let i = 0; i < esc.corridors.length; i++) {
    const c = esc.corridors[i];
    if (c.clearDist < 4.2) continue;
    const s = (c.dirX * awayX + c.dirZ * awayZ) * 2.2 + (c.clearDist / 12.0) * 1.4;
    if (s > bestScore) {
      bestScore = s;
      bestDir = c;
    }
  }
  return bestDir ? fireAIDash(p, profile, bestDir.dirX, bestDir.dirZ) : false;
}

function tryOffensiveStrikeDash(p, profile, task, dashDist, isAllyOfHuman) {
  if (
    !task.targetEnemy ||
    (task.type !== 'pincer_hammer' &&
      task.type !== 'rescue_rule1' &&
      task.type !== 'rule1_trap' &&
      task.type !== 'escort_carrier')
  ) {
    return false;
  }

  const dashKind = getEffectiveDashKind(p);
  const te = task.targetEnemy;
  const teVel = te.vel || { x: 0, z: 0 };
  const predTime = profile.id === 'hard' ? 0.24 : 0.1;
  const tx = te.pos.x + teVel.x * predTime;
  const tz = te.pos.z + teVel.z * predTime;
  const dx = tx - p.pos.x;
  const dz = tz - p.pos.z;
  const dist = Math.hypot(dx, dz);

  const maxStrikeRange = isAllyOfHuman ? dashDist + 1.5 : dashDist + (dashKind === 'slide' ? 4.5 : 3.2);
  if (dist < 2.8 || dist > maxStrikeRange) return false;

  const ux = dx / dist;
  const uz = dz / dist;
  const clear = probeClearDistance(p.pos.x, p.pos.z, ux, uz, Math.min(dist, dashDist), 0.9);
  if (clear >= Math.min(dist - 1.1, dashDist * 0.72)) {
    return fireAIDash(p, profile, ux, uz, { x: tx, z: tz });
  }
  if (profile.useBounceBankShot && dashKind === 'bounce') {
    const bank = findBounceWallReflection(p.pos.x, p.pos.z, tx, tz, dashDist);
    if (bank) return fireAIDash(p, profile, bank.dirX, bank.dirZ);
  }
  return false;
}

function tryClearTargetDash(p, profile, targetPos, dashDist, rangeSpec) {
  const dx = targetPos.x - p.pos.x;
  const dz = targetPos.z - p.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < rangeSpec.minDist || dist > dashDist + rangeSpec.extraRange) return false;

  const ux = dx / dist;
  const uz = dz / dist;
  const clear = probeClearDistance(p.pos.x, p.pos.z, ux, uz, Math.min(dist, dashDist), 1.0);
  if (clear >= Math.min(dist - 1.0, dashDist * rangeSpec.clearRatio)) {
    return fireAIDash(p, profile, ux, uz, targetPos);
  }
  return false;
}

export function tryAIDash(p, dt, profile, plan, laserThreat, predators) {
  if (p.state !== 'standing' || p.carryingBall || p.isAirborne || p.isLaunching) return false;
  if (p.dashCooldown > 0 || p.dashTimer > 0 || p.onCanopy) return false;

  if ((p._aiDashThinkCd || 0) > 0) {
    p._aiDashThinkCd = Math.max(0, p._aiDashThinkCd - dt);
    return false;
  }

  const dashDist = getEffectiveDashDistance(p);
  const isAllyOfHuman = teamHasHumanPlayer(p.team);

  if (laserThreat && laserThreat.timeLeft <= Math.max(0.14, 0.42 - profile.dodgeReactionSec)) {
    if (laserThreat.clearDist >= 3.4) {
      return fireAIDash(p, profile, laserThreat.dodgeX, laserThreat.dodgeZ);
    }
  }

  if (tryPredatorEscapeDash(p, profile, predators, dashDist, isAllyOfHuman)) return true;

  const task = plan.assignments.get(p.id);
  if (!task) return false;

  if (tryOffensiveStrikeDash(p, profile, task, dashDist, isAllyOfHuman)) return true;

  if (
    !isAllyOfHuman &&
    profile.id === 'hard' &&
    task.type === 'pincer_anvil' &&
    task.targetPos &&
    (task.safeStandoff || 0) === 0
  ) {
    return tryClearTargetDash(p, profile, task.targetPos, dashDist, {
      minDist: 5.5,
      extraRange: 5.0,
      clearRatio: 0.78
    });
  }

  if (task.type === 'grab_ball' && task.contested && task.targetBall) {
    return tryClearTargetDash(p, profile, task.targetBall.pos, dashDist, {
      minDist: 4.2,
      extraRange: 6.5,
      clearRatio: 0.8
    });
  }

  return false;
}

export function tryAIBallPassOrShot(p, profile, plan, predators) {
  if (!profile.useClutchPass || !p.carryingBall || !canPlayerPassOrThrow(p)) return false;
  if (teamHasHumanPlayer(p.team) || predators.length === 0) return false;

  const closestPred = predators[0];
  if (Math.hypot(p.pos.x - closestPred.pos.x, p.pos.z - closestPred.pos.z) > 5.4) return false;

  const gx = plan.goals.targetGoalX - p.pos.x;
  const gz = plan.goals.targetGoalZ - p.pos.z;
  const distGoal = Math.hypot(gx, gz);
  if (
    distGoal <= 16.5 &&
    !p.onCanopy &&
    hasClearLineOfSight(p.pos, { x: plan.goals.targetGoalX, y: 0.8, z: plan.goals.targetGoalZ }, false)
  ) {
    return !!ctx.api.executeBallPassOrThrow?.(p, null, Math.atan2(gx, gz), Math.min(1, distGoal / 18));
  }

  const allies = players.filter(
    (a) =>
      a.team === p.team &&
      a.id !== p.id &&
      !a.tutorialHidden &&
      a.state === 'standing' &&
      !a.carryingBall
  );
  let bestAlly = null;
  let bestScore = -Infinity;
  for (let i = 0; i < allies.length; i++) {
    const a = allies[i];
    const dist = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z);
    if (dist < 4.0 || dist > PASS_CHARGE_SPEC.maxR - 2.0) continue;
    if (!hasClearLineOfSight(p.pos, a.pos, false)) continue;

    const allyDistGoal = Math.hypot(a.pos.x - plan.goals.targetGoalX, a.pos.z - plan.goals.targetGoalZ);
    const allyClosestPred = plan.contacts.reduce((minD, c) => {
      if (getMatchup(a.color, c.knownColor, c.waterShield) !== 'loses') return minD;
      return Math.min(minD, Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z));
    }, 99);
    if (allyClosestPred < 6.5) continue;

    const score = (distGoal - allyDistGoal) * 0.8 + Math.min(18, allyClosestPred);
    if (score > bestScore) {
      bestScore = score;
      bestAlly = a;
    }
  }

  if (bestAlly) {
    const aim = Math.atan2(bestAlly.pos.x - p.pos.x, bestAlly.pos.z - p.pos.z);
    const d = Math.hypot(bestAlly.pos.x - p.pos.x, bestAlly.pos.z - p.pos.z);
    const cr = Math.max(
      0,
      Math.min(1, (d - PASS_CHARGE_SPEC.minR) / (PASS_CHARGE_SPEC.maxR - PASS_CHARGE_SPEC.minR))
    );
    return !!ctx.api.executeBallPassOrThrow?.(p, bestAlly, aim, cr);
  }
  return false;
}
