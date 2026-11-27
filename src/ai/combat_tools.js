import { state, ctx } from '../state.js';
import { JUNGLE_BUSHES } from '../world.js';
import {
  FIRE_ULT_BEAM_RADIUS,
  activeFireLasers,
  isPointProtectedByWaterWave
} from '../ultimates.js';
import { probeClearDistance } from '../nav.js';
import { teamHasHumanPlayer, getMatchup } from './shared.js';

export function findIncomingFireLaserThreat(p) {
  let best = null;
  let bestTime = Infinity;

  for (let i = 0; i < activeFireLasers.length; i++) {
    const f = activeFireLasers[i];
    if (f.team === p.team || f.phase !== 'telegraph') continue;
    if (p.waterShieldTimer > 0 || isPointProtectedByWaterWave(p.pos.x, p.pos.z, 1.25)) continue;
    if (Math.abs((p.pos.y || 0) + 1.0 - f.oy) > 2.35) continue;

    const toX = p.pos.x - f.ox;
    const toZ = p.pos.z - f.oz;
    const proj = toX * f.dirX + toZ * f.dirZ;
    if (proj < 0 || proj > f.maxLen + 1.5) continue;

    const perpX = toX - f.dirX * proj;
    const perpZ = toZ - f.dirZ * proj;
    const perpDist = Math.hypot(perpX, perpZ);
    const dangerR = (f.beamRadius || FIRE_ULT_BEAM_RADIUS) + 1.45;
    if (perpDist <= dangerR && f.timer < bestTime) {
      bestTime = f.timer;
      const side1X = -f.dirZ;
      const side1Z = f.dirX;
      const side2X = f.dirZ;
      const side2Z = -f.dirX;
      const c1 = probeClearDistance(p.pos.x, p.pos.z, side1X, side1Z, 8.0, 1.0);
      const c2 = probeClearDistance(p.pos.x, p.pos.z, side2X, side2Z, 8.0, 1.0);
      const dot1 = perpX * side1X + perpZ * side1Z;
      const pick1 = c1 + (dot1 >= 0 ? 1.8 : 0) >= c2 + (dot1 < 0 ? 1.8 : 0);
      best = {
        laser: f,
        timeLeft: f.timer,
        dodgeX: pick1 ? side1X : side2X,
        dodgeZ: pick1 ? side1Z : side2Z,
        clearDist: pick1 ? c1 : c2
      };
    }
  }
  return best;
}

export function updateActiveFireUltTracking(p, profile, plan) {
  let activeBeam = null;
  for (let i = 0; i < activeFireLasers.length; i++) {
    const f = activeFireLasers[i];
    if (f.casterId === p.id && f.phase === 'telegraph') {
      activeBeam = f;
      break;
    }
  }
  if (!activeBeam) {
    p._aiFireAimAngle = null;
    return;
  }
  const target =
    (p._aiFireTargetId &&
      plan.contacts.find((c) => c.player.id === p._aiFireTargetId && c.visible && c.player.state !== 'sitting')) ||
    null;
  if (!target) return;

  const lead = Math.max(0, activeBeam.timer) * profile.fireLeadFactor;
  const tx = target.pos.x + target.vel.x * lead;
  const tz = target.pos.z + target.vel.z * lead;
  p._aiFireAimAngle = Math.atan2(tx - p.pos.x, tz - p.pos.z);
}

function deployAITool(p, aiToolEvo, angle) {
  p.facingAngle = angle;
  ctx.api.deployPlayerTool?.(p, aiToolEvo, {
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z,
    facingAngle: angle,
    onCanopy: !!p.onCanopy,
    fromNetwork: false
  });
  return true;
}

export function tryAIToolDeploy(p, profile, plan, laserThreat) {
  if (state.vanillaMode || teamHasHumanPlayer(p.team)) return false;
  const aiToolEvo = state.teams[p.team]?.powers?.[p.role]?.toolEvo;
  if (!aiToolEvo || p.toolCooldown > 0 || p.state !== 'standing' || p.carryingBall) return false;
  if (state.roundPlayTime < 2.2) return false;

  if (aiToolEvo === 'wall') {
    if (profile.useAntiLaserCounter && laserThreat && laserThreat.timeLeft <= 0.38) {
      return deployAITool(p, aiToolEvo, Math.atan2(laserThreat.laser.ox - p.pos.x, laserThreat.laser.oz - p.pos.z));
    }
    const closeThreat = plan.contacts.find(
      (c) =>
        c.visible &&
        c.state === 'standing' &&
        Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 9.5 &&
        (c.carryingBall || getMatchup(p.color, c.knownColor, c.waterShield) === 'loses')
    );
    if (closeThreat) {
      return deployAITool(p, aiToolEvo, Math.atan2(closeThreat.pos.x - p.pos.x, closeThreat.pos.z - p.pos.z));
    }
    return false;
  }

  if (aiToolEvo === 'beacon') {
    const existing = (ctx.entities.activeToolBeacons || []).find((b) => b.ownerId === p.id);
    if (existing) return false;
    const nearBush = JUNGLE_BUSHES.some((b) => Math.hypot(b.x - p.pos.x, b.z - p.pos.z) < 7.5);
    const nearMid = Math.hypot(p.pos.x, p.pos.z) < 34;
    return nearBush || nearMid ? deployAITool(p, aiToolEvo, p.facingAngle) : false;
  }

  if (aiToolEvo === 'pad') {
    const existing = (ctx.entities.activeToolPads || []).find((pad) => pad.ownerId === p.id);
    if (existing) return false;
    const toGoalAng = Math.atan2(plan.goals.targetGoalX - p.pos.x, plan.goals.targetGoalZ - p.pos.z);
    const dirX = Math.sin(toGoalAng);
    const dirZ = Math.cos(toGoalAng);
    if (!p.onCanopy && probeClearDistance(p.pos.x, p.pos.z, dirX, dirZ, 16.0, 1.0) >= 14.0) {
      return deployAITool(p, aiToolEvo, toGoalAng);
    }
  }
  return false;
}
