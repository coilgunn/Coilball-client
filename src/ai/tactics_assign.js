import { COLORS, state, ctx } from '../state.js';
import { balls } from '../render3d.js';
import { isUltimateUnlocked } from '../ultimates.js';
import { projectToNearestWalkable, findEscapeCorridors } from '../nav.js';
import { teamHasHumanPlayer, getMatchup } from './shared.js';

const THREE = ctx.THREE;

export function getFreeAIMates(tctx) {
  return tctx.standingMates.filter((m) => !tctx.assignedIds.has(m.id));
}

export function analyzePreyEscape(preyPos, preyVel, hammerPos, goalBiasX, goalBiasZ) {
  const esc = findEscapeCorridors(preyPos.x, preyPos.z, 14.0, 12);
  let awayX = 0;
  let awayZ = 0;
  if (hammerPos) {
    const dx = preyPos.x - hammerPos.x;
    const dz = preyPos.z - hammerPos.z;
    const d = Math.hypot(dx, dz) || 1;
    awayX = dx / d;
    awayZ = dz / d;
  }

  let goalX = 0;
  let goalZ = 0;
  let hasGoalBias = false;
  if (Number.isFinite(goalBiasX) && Number.isFinite(goalBiasZ)) {
    const gx = goalBiasX - preyPos.x;
    const gz = goalBiasZ - preyPos.z;
    const gd = Math.hypot(gx, gz);
    if (gd > 0.5) {
      goalX = gx / gd;
      goalZ = gz / gd;
      hasGoalBias = true;
    }
  }

  const velLen = Math.hypot(preyVel?.x || 0, preyVel?.z || 0);
  const velX = velLen > 0.5 ? preyVel.x / velLen : 0;
  const velZ = velLen > 0.5 ? preyVel.z / velLen : 0;

  const scored = esc.corridors.map((c) => {
    const openScore = (c.clearDist / 14.0) * 1.9;
    const awayScore = hammerPos ? (c.dirX * awayX + c.dirZ * awayZ) * 1.45 : 0;
    const goalScore = hasGoalBias ? (c.dirX * goalX + c.dirZ * goalZ) * 1.65 : 0;
    const velScore = velLen > 0.5 ? (c.dirX * velX + c.dirZ * velZ) * 0.95 : 0;
    return {
      ...c,
      score: openScore + awayScore + goalScore + velScore
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const primary = scored[0] || { dirX: 1, dirZ: 0, clearDist: 8 };
  const secondary =
    scored.find((c) => c.dirX * primary.dirX + c.dirZ * primary.dirZ < 0.35 && c.clearDist > 4.0) ||
    scored[1] ||
    primary;
  const tightest = scored[scored.length - 1] || primary;

  return {
    primary,
    secondary,
    tightest,
    openness: esc.openness,
    corneredScore: esc.corneredScore
  };
}

function computeHammerInterceptPos(hunter, preyPos, preyVel, escapeInfo, profile) {
  const dist = Math.hypot(preyPos.x - hunter.pos.x, preyPos.z - hunter.pos.z);
  const mySpeed = hunter.team === 'ally' ? profile.allySpeed : profile.enemySpeed;
  const leadTime = Math.min(0.8, dist / Math.max(8, mySpeed * 1.45));
  let tx = preyPos.x + (preyVel?.x || 0) * leadTime;
  let tz = preyPos.z + (preyVel?.z || 0) * leadTime;

  if (profile.usePincer && escapeInfo && dist > 3.5 && dist < 18) {
    tx += escapeInfo.primary.dirX * 1.45;
    tz += escapeInfo.primary.dirZ * 1.45;
  }

  const proj = projectToNearestWalkable(tx, tz, hunter.pos.x, hunter.pos.z);
  return new THREE.Vector3(proj.x, 0, proj.z);
}

function computeAnvilCutoffPos(flanker, preyPos, escapeDir, distToPrey) {
  const leadDist = Math.max(4.5, Math.min(escapeDir.clearDist - 1.2, distToPrey * 0.52, 12.5));
  const rawX = preyPos.x + escapeDir.dirX * Math.max(3.2, leadDist);
  const rawZ = preyPos.z + escapeDir.dirZ * Math.max(3.2, leadDist);
  const proj = projectToNearestWalkable(rawX, rawZ, flanker.pos.x, flanker.pos.z);
  return new THREE.Vector3(proj.x, 0, proj.z);
}

function canMateZoneEnemy(team, mate, allowSlide) {
  if (teamHasHumanPlayer(team) || state.vanillaMode) return false;
  const powers = state.teams[team]?.powers?.[mate.role];
  const hasZoneUlt = !mate.ultUsed && isUltimateUnlocked() && (mate.color === 'green' || mate.color === 'blue');
  return hasZoneUlt || powers?.toolEvo === 'wall' || (allowSlide && powers?.dashEvo === 'slide');
}

function assignAnvilForCarrier(tctx, ec, escInfo) {
  const { team, profile, assignedIds, assignments } = tctx;
  const remaining = getFreeAIMates(tctx);
  let anvil = null;
  let bestAnvilScore = Infinity;
  for (let j = 0; j < remaining.length; j++) {
    const m = remaining[j];
    const mu = getMatchup(m.color, ec.knownColor, ec.waterShield);
    const d = Math.hypot(ec.pos.x - m.pos.x, ec.pos.z - m.pos.z);
    if (d > profile.pincerMaxRange + 14) continue;
    if (mu === 'loses' && !canMateZoneEnemy(team, m, true)) continue;
    const pen = mu === 'beats' ? 0 : mu === 'same' ? 6 : mu === 'unknown' ? 14 : 20;
    if (d + pen < bestAnvilScore) {
      bestAnvilScore = d + pen;
      anvil = m;
    }
  }
  if (!anvil) return;

  const dAnvil = Math.hypot(ec.pos.x - anvil.pos.x, ec.pos.z - anvil.pos.z);
  const muAnvil = getMatchup(anvil.color, ec.knownColor, ec.waterShield);
  assignedIds.add(anvil.id);
  assignments.set(anvil.id, {
    type: muAnvil === 'same' && profile.useRule1Trap ? 'rule1_trap' : 'pincer_anvil',
    targetPos: computeAnvilCutoffPos(anvil, ec.pos, escInfo.primary, dAnvil),
    lookAtPos: ec.pos.clone(),
    targetEnemy: ec.player,
    targetContact: ec,
    escapeInfo: escInfo,
    safeStandoff: muAnvil === 'loses' ? 7.8 : 0,
    isCarrierTarget: true
  });
}

export function assignEnemyCarrierPincers(tctx) {
  const { contacts, goals, profile, humanChasedTargets, assignedIds, assignments } = tctx;
  const enemyCarriers = contacts
    .filter((c) => c.carryingBall && c.state === 'standing')
    .sort(
      (a, b) =>
        Math.hypot(a.pos.x - goals.ownGoalX, a.pos.z - goals.ownGoalZ) -
        Math.hypot(b.pos.x - goals.ownGoalX, b.pos.z - goals.ownGoalZ)
    );

  for (let i = 0; i < enemyCarriers.length; i++) {
    const ec = enemyCarriers[i];
    const free = getFreeAIMates(tctx);
    if (free.length === 0) break;

    const distToGoal = Math.hypot(ec.pos.x - goals.ownGoalX, ec.pos.z - goals.ownGoalZ);
    let hammer = humanChasedTargets.get(ec.player.id) || null;
    if (!hammer) {
      let bestScore = Infinity;
      for (let j = 0; j < free.length; j++) {
        const m = free[j];
        const mu = getMatchup(m.color, ec.knownColor, ec.waterShield);
        if (mu !== 'beats' && !(mu === 'same' && (profile.useRule1Trap || distToGoal < 36)) && mu !== 'unknown') {
          continue;
        }
        const d = Math.hypot(ec.pos.x - m.pos.x, ec.pos.z - m.pos.z);
        const typePenalty = mu === 'beats' ? 0 : mu === 'same' ? 10 : 18;
        if (d + typePenalty < bestScore) {
          bestScore = d + typePenalty;
          hammer = m;
        }
      }
    }

    const escInfo = analyzePreyEscape(ec.pos, ec.vel, hammer ? hammer.pos : null, goals.ownGoalX, goals.ownGoalZ);
    if (hammer && !assignedIds.has(hammer.id)) {
      assignedIds.add(hammer.id);
      assignments.set(hammer.id, {
        type: 'pincer_hammer',
        targetPos: computeHammerInterceptPos(hammer, ec.pos, ec.vel, escInfo, profile),
        targetEnemy: ec.player,
        targetContact: ec,
        escapeInfo: escInfo,
        isCarrierTarget: true
      });
    }
    if (profile.usePincer) assignAnvilForCarrier(tctx, ec, escInfo);
  }
}

export function assignGroundBallPickups(tctx) {
  const { contacts, assignedIds, assignments } = tctx;
  const groundBalls = balls.filter((b) => !b.tutorialHidden && b.state === 'ground');
  for (let i = 0; i < groundBalls.length; i++) {
    const b = groundBalls[i];
    const free = getFreeAIMates(tctx).filter((m) => m.color === b.color);
    if (free.length === 0) continue;

    let bestMate = null;
    let bestDist = Infinity;
    for (let j = 0; j < free.length; j++) {
      const m = free[j];
      const d = Math.hypot(b.pos.x - m.pos.x, b.pos.z - m.pos.z);
      if (d < bestDist) {
        bestDist = d;
        bestMate = m;
      }
    }

    if (bestMate) {
      const contested = contacts.some(
        (c) =>
          (c.knownColor === b.color || c.knownColor === null) &&
          Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z) < bestDist + 12
      );
      assignedIds.add(bestMate.id);
      assignments.set(bestMate.id, {
        type: 'grab_ball',
        targetPos: b.pos.clone(),
        targetBall: b,
        contested
      });
    }
  }
}

export function assignCarrierEscorts(tctx) {
  const { allyCarriers, contacts, assignedIds, assignments } = tctx;
  for (let i = 0; i < allyCarriers.length; i++) {
    const carrier = allyCarriers[i];
    const free = getFreeAIMates(tctx);
    if (free.length === 0) break;

    let mainThreat = null;
    let bestThreatDist = 26;
    for (let j = 0; j < contacts.length; j++) {
      const c = contacts[j];
      if (c.state !== 'standing') continue;
      const d = Math.hypot(c.pos.x - carrier.pos.x, c.pos.z - carrier.pos.z);
      const threatensCarrier =
        !c.knownColor || COLORS[c.knownColor].beats === carrier.color || c.knownColor === carrier.color;
      if (threatensCarrier && d < bestThreatDist) {
        bestThreatDist = d;
        mainThreat = c;
      }
    }
    if (!mainThreat) continue;

    let bodyguard = null;
    let bestBgScore = Infinity;
    for (let j = 0; j < free.length; j++) {
      const m = free[j];
      const mu = getMatchup(m.color, mainThreat.knownColor, mainThreat.waterShield);
      if (mu !== 'beats' && mu !== 'same') continue;
      const d = Math.hypot(mainThreat.pos.x - m.pos.x, mainThreat.pos.z - m.pos.z);
      const pen = mu === 'beats' ? 0 : 12;
      if (d + pen < bestBgScore) {
        bestBgScore = d + pen;
        bodyguard = m;
      }
    }
    if (bodyguard) {
      assignedIds.add(bodyguard.id);
      const mu = getMatchup(bodyguard.color, mainThreat.knownColor, mainThreat.waterShield);
      const intercept =
        mu === 'beats'
          ? mainThreat.pos.clone()
          : new THREE.Vector3(
              (carrier.pos.x + mainThreat.pos.x) * 0.5,
              0,
              (carrier.pos.z + mainThreat.pos.z) * 0.5
            );
      assignments.set(bodyguard.id, {
        type: 'escort_carrier',
        targetPos: intercept,
        targetEnemy: mainThreat.player,
        targetContact: mainThreat
      });
    }
  }
}

export function assignHumanFlankers(tctx, targetedPreyIds) {
  const { profile, humanChasedTargets, contacts, assignedIds, assignments } = tctx;
  if (!profile.usePincer || humanChasedTargets.size === 0) return;

  for (const [enemyId, humanMate] of humanChasedTargets.entries()) {
    const contact = contacts.find((c) => c.player.id === enemyId);
    if (!contact || targetedPreyIds.has(enemyId)) continue;
    const free = getFreeAIMates(tctx);
    let flanker = null;
    let bestD = profile.pincerMaxRange;
    for (let j = 0; j < free.length; j++) {
      const m = free[j];
      const mu = getMatchup(m.color, contact.knownColor, contact.waterShield);
      if (mu !== 'beats' && !(mu === 'same' && profile.useRule1Trap)) continue;
      const d = Math.hypot(contact.pos.x - m.pos.x, contact.pos.z - m.pos.z);
      if (d < bestD) {
        bestD = d;
        flanker = m;
      }
    }
    if (flanker) {
      const escInfo = analyzePreyEscape(contact.pos, contact.vel, humanMate.pos, NaN, NaN);
      const cutoff = computeAnvilCutoffPos(flanker, contact.pos, escInfo.primary, bestD);
      const mu = getMatchup(flanker.color, contact.knownColor, contact.waterShield);
      assignedIds.add(flanker.id);
      targetedPreyIds.add(enemyId);
      assignments.set(flanker.id, {
        type: mu === 'same' ? 'rule1_trap' : 'pincer_anvil',
        targetPos: cutoff,
        lookAtPos: contact.pos.clone(),
        targetEnemy: contact.player,
        targetContact: contact,
        escapeInfo: escInfo
      });
    }
  }
}

export function assignFreePincerHunts(tctx, targetedPreyIds) {
  const { team, profile, contacts, assignedIds, assignments } = tctx;
  const freeForHunt = getFreeAIMates(tctx);

  for (let i = 0; i < freeForHunt.length; i++) {
    const m = freeForHunt[i];
    if (assignedIds.has(m.id)) continue;

    let bestPrey = null;
    let bestPreyScore = Infinity;
    for (let j = 0; j < contacts.length; j++) {
      const c = contacts[j];
      if (c.state !== 'standing') continue;
      if (getMatchup(m.color, c.knownColor, c.waterShield) !== 'beats') continue;
      const d = Math.hypot(c.pos.x - m.pos.x, c.pos.z - m.pos.z);
      const alreadyBonus = targetedPreyIds.has(c.player.id) ? 14 : 0;
      if (d + alreadyBonus < bestPreyScore) {
        bestPreyScore = d + alreadyBonus;
        bestPrey = c;
      }
    }
    if (!bestPrey) continue;

    const escInfo = analyzePreyEscape(bestPrey.pos, bestPrey.vel, m.pos, NaN, NaN);
    assignedIds.add(m.id);
    targetedPreyIds.add(bestPrey.player.id);
    assignments.set(m.id, {
      type: 'pincer_hammer',
      targetPos: computeHammerInterceptPos(m, bestPrey.pos, bestPrey.vel, escInfo, profile),
      targetEnemy: bestPrey.player,
      targetContact: bestPrey,
      escapeInfo: escInfo
    });

    if (!profile.usePincer) continue;
    const matesLeft = getFreeAIMates(tctx);
    let anvil = null;
    let bestD = profile.pincerMaxRange;
    for (let k = 0; k < matesLeft.length; k++) {
      const cand = matesLeft[k];
      const muCand = getMatchup(cand.color, bestPrey.knownColor, bestPrey.waterShield);
      const dCand = Math.hypot(bestPrey.pos.x - cand.pos.x, bestPrey.pos.z - cand.pos.z);
      if (dCand >= bestD) continue;
      if (muCand === 'beats' || (muCand === 'same' && profile.useRule1Trap) || canMateZoneEnemy(team, cand, false)) {
        bestD = dCand;
        anvil = cand;
      }
    }
    if (anvil) {
      const muAnvil = getMatchup(anvil.color, bestPrey.knownColor, bestPrey.waterShield);
      assignedIds.add(anvil.id);
      assignments.set(anvil.id, {
        type: muAnvil === 'same' && profile.useRule1Trap ? 'rule1_trap' : 'pincer_anvil',
        targetPos: computeAnvilCutoffPos(anvil, bestPrey.pos, escInfo.primary, bestD),
        lookAtPos: bestPrey.pos.clone(),
        targetEnemy: bestPrey.player,
        targetContact: bestPrey,
        escapeInfo: escInfo,
        safeStandoff: muAnvil === 'loses' ? 8.2 : 0
      });
    }
  }
}
