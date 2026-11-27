import { FIELD, state, ctx } from '../state.js';
import { players } from '../render3d.js';
import { isPointInJungleBush } from '../world.js';
import { projectToNearestWalkable } from '../nav.js';
import {
  teamEnemyMemory,
  teamPlanCache,
  ensureFreshMemoryForRound,
  isPlayerHumanControlled,
  getKnownEnemyColor,
  getMatchup,
  getTeamGoals
} from './shared.js';
import {
  getFreeAIMates,
  assignEnemyCarrierPincers,
  assignGroundBallPickups,
  assignCarrierEscorts,
  assignHumanFlankers,
  assignFreePincerHunts
} from './tactics_assign.js';

const THREE = ctx.THREE;

function updateTeamVisionContacts(team, rawEnemies, memMap, profile, nowMs) {
  const contacts = [];
  for (let i = 0; i < rawEnemies.length; i++) {
    const e = rawEnemies[i];
    const visible = !!(e.visibleTo && e.visibleTo[team]);
    const knownColor = getKnownEnemyColor(team, e, profile);
    if (visible) {
      memMap[e.id] = {
        x: e.pos.x,
        y: e.pos.y || 0,
        z: e.pos.z,
        vx: e.vel?.x || 0,
        vz: e.vel?.z || 0,
        seenAt: nowMs,
        carryingBall: !!e.carryingBall,
        inBush: !!isPointInJungleBush(e.pos)
      };
      contacts.push({
        player: e,
        pos: e.pos.clone(),
        vel: { x: e.vel?.x || 0, z: e.vel?.z || 0 },
        knownColor,
        visible: true,
        isGhost: false,
        carryingBall: !!e.carryingBall,
        waterShield: (e.waterShieldTimer || 0) > 0,
        state: e.state
      });
      continue;
    }

    const mem = memMap[e.id];
    if (mem && nowMs - mem.seenAt <= profile.memoryDurationMs) {
      const ageSec = Math.min(1.1, (nowMs - mem.seenAt) * 0.001);
      const ex = mem.x + mem.vx * ageSec * 0.65;
      const ez = mem.z + mem.vz * ageSec * 0.65;
      const proj = projectToNearestWalkable(ex, ez, mem.x, mem.z);
      contacts.push({
        player: e,
        pos: new THREE.Vector3(proj.x, mem.y, proj.z),
        vel: { x: mem.vx, z: mem.vz },
        knownColor,
        visible: false,
        isGhost: true,
        carryingBall: mem.carryingBall,
        waterShield: (e.waterShieldTimer || 0) > 0,
        state: e.state
      });
    }
  }
  return contacts;
}

function assignBallCarriers(tctx) {
  const { standingMates, goals, assignedIds, assignments, allyCarriers } = tctx;
  for (let i = 0; i < standingMates.length; i++) {
    const m = standingMates[i];
    if (!m.carryingBall) continue;
    allyCarriers.push(m);
    assignedIds.add(m.id);
    assignments.set(m.id, {
      type: 'carry_goal',
      targetPos: new THREE.Vector3(goals.targetGoalX, 0, goals.targetGoalZ)
    });
  }
}

function collectHumanChasedTargets(tctx, nowMs) {
  const { standingMates, contacts, assignedIds, humanChasedTargets } = tctx;
  for (let i = 0; i < standingMates.length; i++) {
    const m = standingMates[i];
    if (!isPlayerHumanControlled(m, nowMs)) continue;
    assignedIds.add(m.id);
    if (m.carryingBall || contacts.length === 0) continue;

    let bestE = null;
    let bestD = 26;
    for (let j = 0; j < contacts.length; j++) {
      const c = contacts[j];
      const d = Math.hypot(c.pos.x - m.pos.x, c.pos.z - m.pos.z);
      const mu = getMatchup(m.color, c.knownColor, c.waterShield);
      if (d < bestD && (mu === 'beats' || c.carryingBall)) {
        bestD = d;
        bestE = c;
      }
    }
    if (bestE) humanChasedTargets.set(bestE.player.id, m);
  }
}

function assignRule1Rescues(tctx) {
  const { mates, assignedIds, assignments } = tctx;
  const lockedMates = mates.filter((m) => m.state === 'rule1' && m.rule1Partner);
  for (let i = 0; i < lockedMates.length; i++) {
    const enemyInLock = lockedMates[i].rule1Partner;
    const free = getFreeAIMates(tctx);
    let bestRescuer = null;
    let bestDist = Infinity;
    for (let j = 0; j < free.length; j++) {
      const m = free[j];
      const mu = getMatchup(m.color, enemyInLock.color, (enemyInLock.waterShieldTimer || 0) > 0);
      if (mu !== 'beats') continue;
      const d = Math.hypot(enemyInLock.pos.x - m.pos.x, enemyInLock.pos.z - m.pos.z);
      if (d < bestDist) {
        bestDist = d;
        bestRescuer = m;
      }
    }
    if (bestRescuer) {
      assignedIds.add(bestRescuer.id);
      assignments.set(bestRescuer.id, {
        type: 'rescue_rule1',
        targetPos: enemyInLock.pos.clone(),
        targetEnemy: enemyInLock
      });
    }
  }
}

function assignReconAndHoldZones(tctx) {
  const { team, contacts, goals, assignments } = tctx;
  const stillFree = getFreeAIMates(tctx);
  for (let i = 0; i < stillFree.length; i++) {
    const m = stillFree[i];
    const unrevealed = contacts.find((c) => !c.knownColor && c.visible);
    if (unrevealed) {
      const fwdX = Math.sin(unrevealed.player.facingAngle || 0);
      const fwdZ = Math.cos(unrevealed.player.facingAngle || 0);
      const behindX = unrevealed.pos.x - fwdX * 8.5;
      const behindZ = unrevealed.pos.z - fwdZ * 8.5;
      const proj = projectToNearestWalkable(behindX, behindZ, m.pos.x, m.pos.z);
      assignments.set(m.id, {
        type: 'scout_back',
        targetPos: new THREE.Vector3(proj.x, 0, proj.z),
        lookAtPos: unrevealed.pos.clone(),
        targetEnemy: unrevealed.player,
        safeStandoff: 7.5
      });
      continue;
    }

    const isAlly = team === 'ally';
    let holdPos;
    let lookAt;
    if (state.mapId === 'rift') {
      const spot = isAlly
        ? m.role === 'G'
          ? { x: -58, z: -12 }
          : m.role === 'D'
          ? { x: 12, z: 58 }
          : { x: -24, z: 24 }
        : m.role === 'D'
        ? { x: 58, z: 12 }
        : m.role === 'G'
        ? { x: -12, z: -58 }
        : { x: 24, z: -24 };
      holdPos = new THREE.Vector3(spot.x, 0, spot.z);
      lookAt = new THREE.Vector3(0, 0, 0);
    } else {
      const zLane = m.role === 'G' ? FIELD.laneTopZ * 0.72 : m.role === 'D' ? FIELD.laneBotZ * 0.72 : 0;
      holdPos = new THREE.Vector3(goals.ownGoalX * 0.42, 0, zLane);
      lookAt = new THREE.Vector3(0, 0, zLane);
    }
    assignments.set(m.id, {
      type: 'hold_zone',
      targetPos: holdPos,
      lookAtPos: lookAt
    });
  }
}

export function getTeamTacticalPlan(team, profile) {
  ensureFreshMemoryForRound();
  const nowMs = performance.now();
  const cached = teamPlanCache[team];
  if (
    cached &&
    cached.round === state.round &&
    cached.mapId === state.mapId &&
    cached.diff === profile.id &&
    nowMs - cached.at < profile.thinkIntervalMs
  ) {
    return cached;
  }

  const goals = getTeamGoals(team);
  const mates = players.filter((pl) => pl.team === team && !pl.tutorialHidden && pl.state !== 'sitting');
  const rawEnemies = players.filter((pl) => pl.team !== team && !pl.tutorialHidden && pl.state !== 'sitting');
  const contacts = updateTeamVisionContacts(team, rawEnemies, teamEnemyMemory[team], profile, nowMs);

  const tctx = {
    team,
    profile,
    goals,
    mates,
    standingMates: mates.filter((pl) => pl.state === 'standing'),
    contacts,
    assignments: new Map(),
    assignedIds: new Set(),
    allyCarriers: [],
    humanChasedTargets: new Map()
  };

  assignBallCarriers(tctx);
  collectHumanChasedTargets(tctx, nowMs);
  assignRule1Rescues(tctx);
  assignEnemyCarrierPincers(tctx);
  assignGroundBallPickups(tctx);
  assignCarrierEscorts(tctx);

  const targetedPreyIds = new Set();
  assignHumanFlankers(tctx, targetedPreyIds);
  assignFreePincerHunts(tctx, targetedPreyIds);
  assignReconAndHoldZones(tctx);

  const plan = {
    at: nowMs,
    round: state.round,
    mapId: state.mapId,
    diff: profile.id,
    contacts,
    assignments: tctx.assignments,
    goals
  };
  teamPlanCache[team] = plan;
  return plan;
}
