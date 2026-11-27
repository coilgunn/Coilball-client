import { state, ctx } from '../state.js';
import { players } from '../render3d.js';
import {
  FIRE_ULT_DELAY,
  FIRE_ULT_BEAM_RADIUS,
  WATER_ULT_RANGE,
  activeLeafWalls,
  hasPlayerUltEvo,
  isUltimateUnlocked,
  canReactivateWaterUlt,
  isPointProtectedByWaterWave,
  computeFireLaserMaxDist,
  triggerPlayerUltimate
} from '../ultimates.js';
import {
  projectToNearestWalkable,
  probeClearDistance,
  findEscapeCorridors
} from '../nav.js';
import {
  teamHasHumanPlayer,
  broadcastAIUltimate,
  getKnownEnemyColor,
  getMatchup
} from './shared.js';

const THREE = ctx.THREE;
const _aiLaserRay = { ox: 0, oz: 0, dx: 0, dz: 0, len: 0, radius: 0 };

function scoreExtraLaserBeamHits(visibleEnemies, skipIndex, ray) {
  let bonus = 0;
  for (let j = 0; j < visibleEnemies.length; j++) {
    if (j === skipIndex) continue;
    const other = visibleEnemies[j].player;
    const oToX = other.pos.x - ray.ox;
    const oToZ = other.pos.z - ray.oz;
    const oProj = oToX * ray.dx + oToZ * ray.dz;
    if (oProj <= 1 || oProj >= ray.len) continue;
    const oPerp = Math.hypot(oToX - ray.dx * oProj, oToZ - ray.dz * oProj);
    if (oPerp <= ray.radius) bonus += 30;
  }
  return bonus;
}

function isRayBlockedByLeafWalls(origin, ux, uz, maxDist) {
  for (let w = 0; w < activeLeafWalls.length; w++) {
    const wall = activeLeafWalls[w];
    if (wall.phase !== 'grown') continue;
    for (let n = 0; n < wall.nodes.length; n++) {
      const nd = wall.nodes[n];
      const pDot = (nd.x - origin.x) * ux + (nd.z - origin.z) * uz;
      if (pDot <= 0 || pDot >= maxDist) continue;
      const perp = Math.hypot(nd.x - origin.x - ux * pDot, nd.z - origin.z - uz * pDot);
      if (perp < 2.5) return true;
    }
  }
  return false;
}

function tryReactivateWaterUltAI(p, profile, plan) {
  if (!canReactivateWaterUlt(p)) return false;
  const wave = p.activeReactivableWave;
  const matesNearMe = players.filter(
    (m) =>
      m.team === p.team &&
      m.id !== p.id &&
      m.state === 'standing' &&
      Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 12.5
  );
  let netScore = 0;
  wave.hitPlayerIds.forEach((pid) => {
    const target = players.find((pl) => pl.id === pid);
    if (!target || target.team === p.team || target.state === 'sitting') return;
    if (Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z) < 4.5) return;

    const knownColor = getKnownEnemyColor(p.team, target, profile);
    const myMu = getMatchup(p.color, knownColor, (target.waterShieldTimer || 0) > 0);
    const mateCanBeat = matesNearMe.some(
      (m) => getMatchup(m.color, knownColor, (target.waterShieldTimer || 0) > 0) === 'beats'
    );

    if (myMu === 'beats' || mateCanBeat) {
      netScore += 34;
    } else if (myMu === 'loses' && !mateCanBeat) {
      netScore -= 55;
    } else if (target.carryingBall) {
      const myDistGoal = Math.hypot(p.pos.x - plan.goals.ownGoalX, p.pos.z - plan.goals.ownGoalZ);
      const enemyDistGoal = Math.hypot(
        target.pos.x - plan.goals.ownGoalX,
        target.pos.z - plan.goals.ownGoalZ
      );
      if (myDistGoal > enemyDistGoal + 4) netScore += 30;
    }
  });

  const urgentPull = wave.pullWindowTimer < 0.55 && netScore > 8;
  if ((wave.traveled >= 9.5 && netScore >= 24) || urgentPull) {
    broadcastAIUltimate(p, p.facingAngle, true);
    triggerPlayerUltimate(p, p.facingAngle, false, true);
    return true;
  }
  return false;
}

function tryFireUltAI(p, profile, visibleEnemies, evolved) {
  let bestTarget = null;
  let bestAngle = 0;
  let bestScore = 0;
  const beamRadius = evolved ? FIRE_ULT_BEAM_RADIUS * 1.9 : FIRE_ULT_BEAM_RADIUS;

  for (let i = 0; i < visibleEnemies.length; i++) {
    const c = visibleEnemies[i];
    const e = c.player;
    if (c.waterShield || isPointProtectedByWaterWave(e.pos.x, e.pos.z, 1.5)) continue;
    if (Math.abs((e.pos.y || 0) - (p.pos.y || 0)) > 2.2) continue;

    const predX = e.pos.x + c.vel.x * FIRE_ULT_DELAY * profile.fireLeadFactor;
    const predZ = e.pos.z + c.vel.z * FIRE_ULT_DELAY * profile.fireLeadFactor;
    const dx = predX - p.pos.x;
    const dz = predZ - p.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < (e.state === 'rule1' ? 3.0 : 6.0) || dist > 78) continue;

    const aimAngle = Math.atan2(dx, dz);
    const dirX = Math.sin(aimAngle);
    const dirZ = Math.cos(aimAngle);
    const ox = p.pos.x + dirX * 0.85;
    const oy = (p.pos.y || 0) + 1.05;
    const oz = p.pos.z + dirZ * 0.85;
    const clearLen = computeFireLaserMaxDist(ox, oy, oz, dirX, dirZ, dist + 2.5);
    if (clearLen < dist - 0.9) continue;

    let score = 20;
    if (dist >= 10 && dist <= 46) score += 10;
    else if (dist > 56) score -= 8;
    if (e.state === 'rule1') score += 48;
    if (c.carryingBall) score += 36;
    if (e.onSlidePatch) score += 24;

    const latSpeed = Math.abs(c.vel.x * -dirZ + c.vel.z * dirX);
    if (latSpeed < 2.2) score += 14;
    else if (latSpeed > 7.5 && dist > 26) score -= 12;

    if (findEscapeCorridors(e.pos.x, e.pos.z, 8.0, 8).corneredScore > 0.45) score += 16;

    _aiLaserRay.ox = ox;
    _aiLaserRay.oz = oz;
    _aiLaserRay.dx = dirX;
    _aiLaserRay.dz = dirZ;
    _aiLaserRay.len = clearLen;
    _aiLaserRay.radius = beamRadius + 1.4;
    score += scoreExtraLaserBeamHits(visibleEnemies, i, _aiLaserRay);
    if (evolved) score += 6;

    if (score > bestScore) {
      bestScore = score;
      bestTarget = e;
      bestAngle = aimAngle;
    }
  }

  if (bestTarget && bestScore >= profile.fireUltThreshold) {
    p._aiFireTargetId = bestTarget.id;
    p._aiFireAimAngle = bestAngle;
    broadcastAIUltimate(p, bestAngle, false);
    triggerPlayerUltimate(p, bestAngle, false);
    return true;
  }
  return false;
}

function tryEvolvedWaterUltAI(p, profile, visibleEnemies, maxRange) {
  let totalScore = 0;
  for (let i = 0; i < visibleEnemies.length; i++) {
    const c = visibleEnemies[i];
    const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
    if (d > maxRange || Math.abs((c.pos.y || 0) - (p.pos.y || 0)) > 2.4) continue;
    totalScore += c.carryingBall ? 34 : 18;
    if (c.knownColor === 'green' && d < 10) totalScore += 18;
  }
  if (totalScore >= profile.waterUltThreshold) {
    broadcastAIUltimate(p, p.facingAngle, false);
    triggerPlayerUltimate(p, p.facingAngle, false);
    return true;
  }
  return false;
}

function tryWaterUltAI(p, profile, visibleEnemies, evolved, laserThreat) {
  if (profile.useAntiLaserCounter && laserThreat && laserThreat.timeLeft <= 0.36) {
    const f = laserThreat.laser;
    const angToCaster = Math.atan2(f.ox - p.pos.x, f.oz - p.pos.z);
    broadcastAIUltimate(p, angToCaster, false);
    triggerPlayerUltimate(p, angToCaster, false);
    return true;
  }

  const maxRange = evolved ? WATER_ULT_RANGE * 1.35 : WATER_ULT_RANGE * 0.78;
  if (evolved) return tryEvolvedWaterUltAI(p, profile, visibleEnemies, maxRange);

  let bestAngle = p.facingAngle;
  let bestScore = 0;
  for (let i = 0; i < visibleEnemies.length; i++) {
    const e = visibleEnemies[i].player;
    if (Math.abs((e.pos.y || 0) - (p.pos.y || 0)) > 2.4) continue;
    const dx = e.pos.x - p.pos.x;
    const dz = e.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > maxRange || d < 1.5) continue;

    const ang = Math.atan2(dx, dz);
    const ux = Math.sin(ang);
    const uz = Math.cos(ang);
    if (isRayBlockedByLeafWalls(p.pos, ux, uz, Math.min(d, 9.0))) continue;

    let score = 0;
    for (let j = 0; j < visibleEnemies.length; j++) {
      const other = visibleEnemies[j];
      const ox = other.pos.x - p.pos.x;
      const oz = other.pos.z - p.pos.z;
      const proj = ox * ux + oz * uz;
      if (proj < 0.5 || proj > maxRange) continue;
      if (Math.abs(ox * -uz + oz * ux) > 10.5) continue;

      score += 18;
      if (other.carryingBall) score += 28;
      if (other.knownColor === 'green' && proj < 12) score += 22;
      if (probeClearDistance(other.pos.x, other.pos.z, ux, uz, 8.0, 1.0) < 4.0) score += 12;
    }

    if (score > bestScore) {
      bestScore = score;
      bestAngle = ang;
    }
  }

  if (bestScore >= profile.waterUltThreshold) {
    broadcastAIUltimate(p, bestAngle, false);
    triggerPlayerUltimate(p, bestAngle, false);
    return true;
  }
  return false;
}

function tryLeafUltAI(p, profile, plan, visibleEnemies) {
  const task = plan.assignments.get(p.id);
  let score = 0;
  let wallMode = null;
  let wallTarget = null;

  if (
    task &&
    (task.isCarrierTarget || task.type === 'pincer_anvil' || task.type === 'pincer_hammer') &&
    task.targetEnemy
  ) {
    const te = task.targetEnemy;
    const d = Math.hypot(te.pos.x - p.pos.x, te.pos.z - p.pos.z);
    if (d > 6 && d < 36) {
      score += task.isCarrierTarget ? 42 : 28;
      wallMode = 'cutoff';
      wallTarget = te;
    }
  }

  if (task && task.type === 'grab_ball' && task.contested && task.targetBall) {
    const d = Math.hypot(task.targetBall.pos.x - p.pos.x, task.targetBall.pos.z - p.pos.z);
    if (d > 14 && d < 52) {
      score = Math.max(score, 32);
      wallMode = 'sprint';
    }
  }

  const closePred = visibleEnemies.find(
    (c) => c.knownColor === 'red' && Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 8.5
  );
  if (closePred && p.dashCooldown > 0.6) {
    score = Math.max(score, 38);
    wallMode = 'escape';
  }

  if (score >= profile.leafUltThreshold) {
    p._aiLeafWallMode = wallMode;
    p._aiLeafWallTargetId = wallTarget ? wallTarget.id : null;
    broadcastAIUltimate(p, p.facingAngle, false);
    triggerPlayerUltimate(p, p.facingAngle, false);
    return true;
  }
  return false;
}

export function tryAIUltimate(p, profile, plan, laserThreat) {
  if (state.vanillaMode || teamHasHumanPlayer(p.team) || !isUltimateUnlocked()) return false;
  if (p.state !== 'standing' || p.carryingBall) return false;

  if (tryReactivateWaterUltAI(p, profile, plan)) return true;

  if (p.ultUsed || p.ultCooldown > 0 || state.roundPlayTime < profile.ultMinRoundTime) return false;
  if ((p._aiUltThinkCd || 0) > 0) return false;
  p._aiUltThinkCd = profile.thinkIntervalMs * 0.001;

  const visibleEnemies = plan.contacts.filter((c) => c.visible && c.player.state !== 'sitting');
  const evolved = hasPlayerUltEvo(p);

  if (p.color === 'red') return tryFireUltAI(p, profile, visibleEnemies, evolved);
  if (p.color === 'blue') return tryWaterUltAI(p, profile, visibleEnemies, evolved, laserThreat);
  if (p.color === 'green') return tryLeafUltAI(p, profile, plan, visibleEnemies);
  return false;
}

export function computeLeafSprintArcTarget(p, profile, plan) {
  if (!profile.useLeafArcWall || p.leafUltTimer <= 0 || p._aiLeafWallMode !== 'cutoff') return null;
  const te = players.find((pl) => pl.id === p._aiLeafWallTargetId && pl.state === 'standing');
  if (!te) return null;

  const task = plan.assignments.get(p.id);
  const escDir = task?.escapeInfo?.primary || {
    dirX: Math.sin(te.facingAngle || 0),
    dirZ: Math.cos(te.facingAngle || 0)
  };
  const perpX = -escDir.dirZ;
  const perpZ = escDir.dirX;

  const frontX = te.pos.x + escDir.dirX * 5.2;
  const frontZ = te.pos.z + escDir.dirZ * 5.2;
  const sideSign = (p.pos.x - frontX) * perpX + (p.pos.z - frontZ) * perpZ >= 0 ? -1 : 1;
  const sweepDist = p.leafUltTimer > (p.leafUltMaxDuration || 2.0) * 0.5 ? 5.5 : 8.5;
  const goalX = frontX + perpX * sideSign * sweepDist;
  const goalZ = frontZ + perpZ * sideSign * sweepDist;
  const proj = projectToNearestWalkable(goalX, goalZ, p.pos.x, p.pos.z);
  return new THREE.Vector3(proj.x, 0, proj.z);
}
