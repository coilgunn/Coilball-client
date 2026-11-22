// ============================================================================
// COILBALL 3D — INTELLIGENCE ARTIFICIELLE (2 DIFFICULTÉS, TENAILLES, DASHS & ULTS)
// ============================================================================

import {
  COLORS,
  COLOR_KEYS,
  FIELD,
  DASH_BASE_DIST,
  DASH_SPEED,
  PAD_DASH_SPEED,
  PASS_CHARGE_SPEC,
  canPlayerPassOrThrow,
  state,
  mp,
  ctx,
  lerpAngle
} from './state.js';
import { players, balls } from './render3d.js';
import {
  PARK_LANDMARKS,
  CANOPY_SPEC,
  JUNGLE_OBSTACLES,
  JUNGLE_WALLS,
  JUNGLE_BUSHES,
  getCanopySurfaceY,
  hasClearLineOfSight,
  isPointInJungleBush
} from './world.js';
import {
  FIRE_ULT_DELAY,
  FIRE_ULT_BEAM_RADIUS,
  LEAF_ULT_SPEED_MULT,
  LEAF_ULT_WALL_RADIUS,
  WATER_ULT_RANGE,
  activeFireLasers,
  activeLeafWalls,
  hasPlayerUltEvo,
  isUltimateUnlocked,
  isPlayerChargingFireUlt,
  canReactivateWaterUlt,
  isPointProtectedByWaterWave,
  computeFireLaserMaxDist,
  triggerPlayerUltimate
} from './ultimates.js';
import {
  computeMobaPath,
  hasGridLOS,
  getNavVersion,
  projectToNearestWalkable,
  probeClearDistance,
  findEscapeCorridors,
  findBounceWallReflection
} from './nav.js';

const THREE = ctx.THREE;

// --- PROFILS DE DIFFICULTÉ ---
export const AI_PROFILES = {
  normal: {
    id: 'normal',
    enemySpeed: 8.15,
    allySpeed: 9.0,
    thinkIntervalMs: 260,
    navReplanMs: 420,
    memoryDurationMs: 1600,
    deduceThirdColor: false,
    usePincer: true,
    pincerMaxRange: 24,
    useRule1Trap: false,
    useBounceBankShot: false,
    useDashJump: false,
    useActiveSlideSteer: false,
    useBoomerangReturn: true,
    useAntiLaserCounter: false,
    useLeafArcWall: false,
    useClutchPass: false,
    dashDecisionCd: 1.05,
    dodgeReactionSec: 0.22,
    fireLeadFactor: 0.35,
    fireUltThreshold: 36,
    waterUltThreshold: 34,
    leafUltThreshold: 36,
    predatorAvoidDist: 7.4,
    predatorDashDist: 4.8,
    ultMinRoundTime: 3.4
  },
  hard: {
    id: 'hard',
    enemySpeed: 9.25,
    allySpeed: 9.35,
    thinkIntervalMs: 100,
    navReplanMs: 220,
    memoryDurationMs: 4500,
    deduceThirdColor: true,
    usePincer: true,
    pincerMaxRange: 44,
    useRule1Trap: true,
    useBounceBankShot: true,
    useDashJump: true,
    useActiveSlideSteer: true,
    useBoomerangReturn: true,
    useAntiLaserCounter: true,
    useLeafArcWall: true,
    useClutchPass: true,
    dashDecisionCd: 0.22,
    dodgeReactionSec: 0.06,
    fireLeadFactor: 0.88,
    fireUltThreshold: 24,
    waterUltThreshold: 22,
    leafUltThreshold: 25,
    predatorAvoidDist: 9.2,
    predatorDashDist: 6.6,
    ultMinRoundTime: 1.6
  }
};

export function getAIDifficulty() {
  return state.aiDifficulty === 'hard' ? 'hard' : 'normal';
}

function getAIProfile() {
  return AI_PROFILES[getAIDifficulty()] || AI_PROFILES.normal;
}

// --- MÉMOIRE DE VISION & CACHE DU COORDINATEUR D'ÉQUIPE ---
const teamEnemyMemory = { ally: {}, enemy: {} };
const teamPlanCache = { ally: null, enemy: null };
let lastMemRound = -1;
let lastMemMapId = '';
let lastMemPlayTime = 0;

export function resetAITacticalMemory() {
  teamEnemyMemory.ally = {};
  teamEnemyMemory.enemy = {};
  teamPlanCache.ally = null;
  teamPlanCache.enemy = null;
}

function ensureFreshMemoryForRound() {
  const curTime = state.roundPlayTime || 0;
  if (
    state.round !== lastMemRound ||
    state.mapId !== lastMemMapId ||
    curTime + 0.1 < lastMemPlayTime
  ) {
    resetAITacticalMemory();
    lastMemRound = state.round;
    lastMemMapId = state.mapId;
  }
  lastMemPlayTime = curTime;
}

export function initAI() {
  ctx.world.rebuildAIRouter = () => CANOPY_AI_ROUTER.rebuild(CANOPY_SPEC);
  ctx.api.resetAITacticalMemory = resetAITacticalMemory;
  CANOPY_AI_ROUTER.rebuild(CANOPY_SPEC);
}

// --- UTILITAIRES GÉOMÉTRIQUES & RÉSEAU ---
function isPlayerHumanControlled(p, nowMs) {
  if (p.team === state.myTeam && p.role === state.controlledRole) return true;
  if (mp.enabled) {
    for (const peerKey in mp.remoteInputs) {
      const inp = mp.remoteInputs[peerKey];
      if (inp && inp.team === p.team && inp.role === p.role && nowMs - inp.lastSeen < 10000) {
        return true;
      }
    }
  }
  return false;
}

function teamHasHumanPlayer(team) {
  return (
    team === state.myTeam ||
    (mp.enabled && mp.members.some((m) => m.team === team))
  );
}

function broadcastAIUltimate(p, aimAngle, reactivate = false) {
  if (mp.enabled && mp.isHost && ctx.api.sendNetMessage) {
    ctx.api.sendNetMessage({
      type: 'MP_ULT_TRIGGER',
      round: state.round,
      peerId: mp.myPeerId,
      team: p.team,
      role: p.role,
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      oc: p.onCanopy ? 1 : 0,
      aimAngle,
      reactivate
    });
  }
}

function getEffectiveDashDistance(p) {
  if (ctx.api.getPlayerDashParams) {
    const dp = ctx.api.getPlayerDashParams(p);
    return dp.speed * dp.duration;
  }
  const teamMeta = state.teams[p.team];
  const dashKind = state.vanillaMode ? null : teamMeta?.powers?.[p.role]?.dashEvo || null;
  const mult = !state.vanillaMode && teamMeta?.teamDashPlus ? 1.35 : 1.0;
  if (dashKind === 'bounce') return DASH_BASE_DIST * 2.0 * mult;
  if (dashKind === 'slide') return DASH_BASE_DIST * 3.0 * mult;
  if (dashKind === 'boomerang') return DASH_BASE_DIST * 1.5 * mult;
  return DASH_BASE_DIST * mult;
}

function getEffectiveDashKind(p) {
  if (state.vanillaMode) return null;
  return state.teams[p.team]?.powers?.[p.role]?.dashEvo || null;
}

function getKnownEnemyColor(team, enemy, profile) {
  if (!enemy) return null;
  if (enemy.revealedTo?.[team] || enemy.state === 'rule1' || enemy.state === 'sitting') {
    return enemy.color;
  }
  if (!profile.deduceThirdColor) return null;

  const oppMeta = state.teams[enemy.team];
  const extra = oppMeta?.extraDossardBought;
  if (extra && (extra.green || extra.red || extra.blue)) return null;

  const oppPlayers = players.filter((pl) => pl.team === enemy.team && !pl.tutorialHidden);
  const revealedColors = [];
  for (let i = 0; i < oppPlayers.length; i++) {
    const op = oppPlayers[i];
    if (op.id === enemy.id) continue;
    if (op.revealedTo?.[team] || op.state === 'rule1' || op.state === 'sitting') {
      revealedColors.push(op.color);
    }
  }
  if (revealedColors.length === 2 && revealedColors[0] !== revealedColors[1]) {
    const remaining = COLOR_KEYS.find((c) => !revealedColors.includes(c));
    return remaining || null;
  }
  return null;
}

function getMatchup(myColor, knownEnemyColor, enemyWaterShield = false) {
  if (!knownEnemyColor) return 'unknown';
  if (COLORS[myColor].beats === knownEnemyColor) {
    if (myColor === 'red' && enemyWaterShield) return 'shielded';
    return 'beats';
  }
  if (COLORS[knownEnemyColor].beats === myColor) return 'loses';
  return 'same';
}

function getTeamGoals(team) {
  const isAlly = team === 'ally';
  return {
    targetGoalX: isAlly ? FIELD.enemyGoalX : FIELD.allyGoalX,
    targetGoalZ: isAlly ? FIELD.enemyGoalZ || 0 : FIELD.allyGoalZ || 0,
    ownGoalX: isAlly ? FIELD.allyGoalX : FIELD.enemyGoalX,
    ownGoalZ: isAlly ? FIELD.allyGoalZ || 0 : FIELD.enemyGoalZ || 0
  };
}

// --- ÉVITEMENT LOCAL D'OBSTACLES ---
function steerAroundBoxObstacle(px, pz, baseDirX, baseDirZ, minX, maxX, minZ, maxZ, pad) {
  const cx = Math.max(minX, Math.min(maxX, px));
  const cz = Math.max(minZ, Math.min(maxZ, pz));
  const toBoxX = cx - px;
  const toBoxZ = cz - pz;
  const dist = Math.hypot(toBoxX, toBoxZ);
  if (dist <= 0.001 || dist >= pad) return { sx: 0, sz: 0 };

  const pushW = (pad - dist) * 1.6;
  let sx = -(toBoxX / dist) * pushW;
  let sz = -(toBoxZ / dist) * pushW;
  const rx = -toBoxX / dist;
  const rz = -toBoxZ / dist;
  const t1x = -rz;
  const t1z = rx;
  const t2x = rz;
  const t2z = -rx;
  const d1 = t1x * baseDirX + t1z * baseDirZ;
  const d2 = t2x * baseDirX + t2z * baseDirZ;
  const chosenX = d1 >= d2 ? t1x : t2x;
  const chosenZ = d1 >= d2 ? t1z : t2z;
  const tanW = ((pad - dist) / pad) * 2.2;
  sx += chosenX * tanW;
  sz += chosenZ * tanW;
  return { sx, sz };
}

function steerAroundWallSegments(px, pz, baseDirX, baseDirZ, walls) {
  if (!walls || walls.length === 0) return { sx: 0, sz: 0 };
  const proxies = [];
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const vx = w.bx - w.ax;
    const vz = w.bz - w.az;
    const lenSq = vx * vx + vz * vz;
    const t =
      lenSq > 0.0001
        ? Math.max(0, Math.min(1, ((px - w.ax) * vx + (pz - w.az) * vz) / lenSq))
        : 0;
    proxies.push({ x: w.ax + t * vx, z: w.az + t * vz, radius: w.radius });
  }
  return steerAroundCircleObstacles(px, pz, baseDirX, baseDirZ, proxies);
}

function steerAroundCircleObstacles(px, pz, baseDirX, baseDirZ, list) {
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < list.length; i++) {
    const obs = list[i];
    const toObsX = obs.x - px;
    const toObsZ = obs.z - pz;
    const obsDist = Math.hypot(toObsX, toObsZ);
    const avoidR = obs.radius + 1.85;

    if (obsDist < avoidR && obsDist > 0.001) {
      const pushWeight = (avoidR - obsDist) * 1.35;
      sx -= (toObsX / obsDist) * pushWeight;
      sz -= (toObsZ / obsDist) * pushWeight;
    }

    const proj = toObsX * baseDirX + toObsZ * baseDirZ;
    if (proj > 0 && proj < 5.0) {
      const latX = px + baseDirX * proj - obs.x;
      const latZ = pz + baseDirZ * proj - obs.z;
      const latDist = Math.hypot(latX, latZ);
      const safeCorridor = obs.radius + 1.25;
      if (latDist < safeCorridor) {
        const rx = obsDist > 0.001 ? -toObsX / obsDist : 1;
        const rz = obsDist > 0.001 ? -toObsZ / obsDist : 0;
        const t1x = -rz;
        const t1z = rx;
        const t2x = rz;
        const t2z = -rx;
        const d1 = t1x * baseDirX + t1z * baseDirZ;
        const d2 = t2x * baseDirX + t2z * baseDirZ;
        let chosenX = d1 >= d2 ? t1x : t2x;
        let chosenZ = d1 >= d2 ? t1z : t2z;
        if (Math.abs(d1 - d2) < 0.12) {
          const preferOuterZ = pz >= obs.z ? 1 : -1;
          if (t1z * preferOuterZ < t2z * preferOuterZ) {
            chosenX = t2x;
            chosenZ = t2z;
          } else {
            chosenX = t1x;
            chosenZ = t1z;
          }
        }
        const tangentWeight = ((safeCorridor - latDist) / safeCorridor) * 2.1;
        sx += chosenX * tangentWeight;
        sz += chosenZ * tangentWeight;
      }
    }
  }
  return { sx, sz };
}

// --- ROUTAGE CANOPÉE ---
export const CANOPY_AI_ROUTER = (() => {
  const exitIds = ['nLaunchExit', 'sLaunchExit', 'wRampExit', 'eRampExit'];
  const router = {
    nodes: [],
    nodeIndex: new Map(),
    dist: [],
    nextHop: [],
    exitIds,
    rebuild(spec = CANOPY_SPEC) {
      if (!spec || !Array.isArray(spec.decks)) {
        this.nodes = [];
        this.nodeIndex = new Map();
        this.dist = [];
        this.nextHop = [];
        return this;
      }
      const nodes = [];
      const nodeIndex = new Map();
      const addNode = (id, x, z, y, landX = x, landZ = z) => {
        nodeIndex.set(id, nodes.length);
        nodes.push({ id, x, z, y, landX, landZ });
      };

      spec.decks.forEach((d) => addNode(d.id, d.cx, d.cz, spec.deckY));
      addNode('wRampExit', -(spec.ascentOuterX + 2.0), 0, 0);
      addNode('eRampExit', spec.ascentOuterX + 2.0, 0, 0);
      addNode('nLaunchExit', 0, -spec.launchOuterZ, spec.launchLipY, 0, -spec.launchLandingZ);
      addNode('sLaunchExit', 0, spec.launchOuterZ, spec.launchLipY, 0, spec.launchLandingZ);

      const n = nodes.length;
      const dist = Array.from({ length: n }, () => new Array(n).fill(Infinity));
      const nextHop = Array.from({ length: n }, () => new Array(n).fill(-1));
      for (let i = 0; i < n; i++) {
        dist[i][i] = 0;
        nextHop[i][i] = i;
      }

      const connect = (aId, bId, oneWay = false) => {
        const a = nodeIndex.get(aId);
        const b = nodeIndex.get(bId);
        if (a === undefined || b === undefined) return;
        const w = Math.hypot(nodes[b].x - nodes[a].x, nodes[b].z - nodes[a].z);
        dist[a][b] = w;
        nextHop[a][b] = b;
        if (!oneWay) {
          dist[b][a] = w;
          nextHop[b][a] = a;
        }
      };

      spec.bridges.forEach((b) => connect(b.from, b.to, false));
      connect('westGate', 'wRampExit', false);
      connect('eastGate', 'eRampExit', false);
      connect('northHub', 'nLaunchExit', true);
      connect('southHub', 'sLaunchExit', true);

      for (let k = 0; k < n; k++) {
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            const alt = dist[i][k] + dist[k][j];
            if (alt < dist[i][j]) {
              dist[i][j] = alt;
              nextHop[i][j] = nextHop[i][k];
            }
          }
        }
      }

      router.nodes = nodes;
      router.nodeIndex = nodeIndex;
      router.dist = dist;
      router.nextHop = nextHop;
      return router;
    },
    getSteerTarget(p, curSurf, targetPos) {
      if (!curSurf) return targetPos;
      if (curSurf.zone === 'northLaunch' || curSurf.zone === 'southLaunch') {
        const outZ =
          curSurf.zone === 'northLaunch' ? -CANOPY_SPEC.launchOuterZ : CANOPY_SPEC.launchOuterZ;
        return new THREE.Vector3(0, CANOPY_SPEC.launchLipY, outZ);
      }

      const { nodes, nodeIndex, dist, nextHop } = router;
      const gx = targetPos ? targetPos.x : p.pos.x;
      const gz = targetPos ? targetPos.z : p.pos.z;

      let startCandidates;
      if (curSurf.deckId) {
        startCandidates = [curSurf.deckId];
      } else if (curSurf.bridge) {
        startCandidates = [curSurf.bridge.from, curSurf.bridge.to];
      } else if (curSurf.zone === 'westRamp') {
        startCandidates = ['westGate', 'wRampExit'];
      } else {
        startCandidates = ['eastGate', 'eRampExit'];
      }

      let bestStartIdx = nodeIndex.get(startCandidates[0]);
      let bestExitIdx = nodeIndex.get(exitIds[0]);
      let bestScore = Infinity;

      for (let si = 0; si < startCandidates.length; si++) {
        const sIdx = nodeIndex.get(startCandidates[si]);
        if (sIdx === undefined) continue;
        const sn = nodes[sIdx];
        const toStart = Math.hypot(sn.x - p.pos.x, sn.z - p.pos.z);
        for (let ei = 0; ei < exitIds.length; ei++) {
          const eIdx = nodeIndex.get(exitIds[ei]);
          if (eIdx === undefined) continue;
          const en = nodes[eIdx];
          const pathLen = dist[sIdx][eIdx];
          if (!Number.isFinite(pathLen)) continue;
          const afterLand = Math.hypot(gx - en.landX, gz - en.landZ);
          const launchBias =
            (en.id === 'nLaunchExit' || en.id === 'sLaunchExit') && Math.abs(gz) > 22 ? -4.5 : 0;
          const score = toStart + pathLen + afterLand + launchBias;
          if (score < bestScore) {
            bestScore = score;
            bestStartIdx = sIdx;
            bestExitIdx = eIdx;
          }
        }
      }

      const nextNodeIdx = curSurf.deckId ? nextHop[bestStartIdx][bestExitIdx] : bestStartIdx;
      const wp = nodes[nextNodeIdx >= 0 ? nextNodeIdx : bestStartIdx];

      if (curSurf.deckId) {
        const deckNode = nodes[nodeIndex.get(curSurf.deckId)];
        const dx = Math.abs(wp.x - deckNode.x);
        const dz = Math.abs(wp.z - deckNode.z);
        const offCenter =
          dx > dz ? Math.abs(p.pos.z - deckNode.z) : Math.abs(p.pos.x - deckNode.x);
        if (offCenter > 0.72) {
          return new THREE.Vector3(deckNode.x, CANOPY_SPEC.deckY, deckNode.z);
        }
      }

      return new THREE.Vector3(wp.x, wp.y, wp.z);
    }
  };

  return router;
})();

// --- ANALYSE DES COULOIRS DE FUITE & POINTS DE TENAILLE ---
function analyzePreyEscape(preyPos, preyVel, hammerPos, goalBiasX, goalBiasZ) {
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

// --- COORDINATEUR D'ÉQUIPE (VISION, RÔLES & TENAILLES) ---
function getTeamTacticalPlan(team, profile) {
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
  const memMap = teamEnemyMemory[team];
  const mates = players.filter((pl) => pl.team === team && !pl.tutorialHidden && pl.state !== 'sitting');
  const standingMates = mates.filter((pl) => pl.state === 'standing');
  const rawEnemies = players.filter((pl) => pl.team !== team && !pl.tutorialHidden && pl.state !== 'sitting');

  // 1. Mise à jour de la mémoire de vision (sans tricher sur les buissons)
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
    } else {
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
  }

  const assignments = new Map();
  const assignedIds = new Set();

  // Porteuses de ballon : foncer vers le cerceau adverse
  const allyCarriers = [];
  for (let i = 0; i < standingMates.length; i++) {
    const m = standingMates[i];
    if (m.carryingBall) {
      allyCarriers.push(m);
      assignedIds.add(m.id);
      assignments.set(m.id, {
        type: 'carry_goal',
        targetPos: new THREE.Vector3(goals.targetGoalX, 0, goals.targetGoalZ)
      });
    }
  }

  // Observer les cibles chassées par les joueuses humaines de l'équipe pour les flanquer
  const humanChasedTargets = new Map();
  for (let i = 0; i < standingMates.length; i++) {
    const m = standingMates[i];
    if (!isPlayerHumanControlled(m, nowMs)) continue;
    assignedIds.add(m.id);
    if (!m.carryingBall && contacts.length > 0) {
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

  const getFreeAIMates = () => standingMates.filter((m) => !assignedIds.has(m.id));

  // 2. Sauvetage prioritaire Règle 1
  const lockedMates = mates.filter((m) => m.state === 'rule1' && m.rule1Partner);
  for (let i = 0; i < lockedMates.length; i++) {
    const enemyInLock = lockedMates[i].rule1Partner;
    const free = getFreeAIMates();
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

  // 3. Interception & Tenaille sur les porteuses de ballon adverses
  const enemyCarriers = contacts
    .filter((c) => c.carryingBall && c.state === 'standing')
    .sort(
      (a, b) =>
        Math.hypot(a.pos.x - goals.ownGoalX, a.pos.z - goals.ownGoalZ) -
        Math.hypot(b.pos.x - goals.ownGoalX, b.pos.z - goals.ownGoalZ)
    );

  for (let i = 0; i < enemyCarriers.length; i++) {
    const ec = enemyCarriers[i];
    const free = getFreeAIMates();
    if (free.length === 0) break;

    const distToGoal = Math.hypot(ec.pos.x - goals.ownGoalX, ec.pos.z - goals.ownGoalZ);
    const humanHammer = humanChasedTargets.get(ec.player.id) || null;

    let hammer = humanHammer;
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

    if (profile.usePincer) {
      const remaining = getFreeAIMates();
      let anvil = null;
      let bestAnvilScore = Infinity;
      for (let j = 0; j < remaining.length; j++) {
        const m = remaining[j];
        const mu = getMatchup(m.color, ec.knownColor, ec.waterShield);
        const d = Math.hypot(ec.pos.x - m.pos.x, ec.pos.z - m.pos.z);
        if (d > profile.pincerMaxRange + 14) continue;
        const canZone =
          !teamHasHumanPlayer(team) &&
          !state.vanillaMode &&
          ((!m.ultUsed && isUltimateUnlocked() && (m.color === 'green' || m.color === 'blue')) ||
            state.teams[team]?.powers?.[m.role]?.toolEvo === 'wall' ||
            state.teams[team]?.powers?.[m.role]?.dashEvo === 'slide');
        if (mu === 'loses' && !canZone) continue;
        const pen = mu === 'beats' ? 0 : mu === 'same' ? 6 : mu === 'unknown' ? 14 : 20;
        if (d + pen < bestAnvilScore) {
          bestAnvilScore = d + pen;
          anvil = m;
        }
      }
      if (anvil) {
        const dAnvil = Math.hypot(ec.pos.x - anvil.pos.x, ec.pos.z - anvil.pos.z);
        const muAnvil = getMatchup(anvil.color, ec.knownColor, ec.waterShield);
        const cutoffPos = computeAnvilCutoffPos(anvil, ec.pos, escInfo.primary, dAnvil);
        assignedIds.add(anvil.id);
        assignments.set(anvil.id, {
          type: muAnvil === 'same' && profile.useRule1Trap ? 'rule1_trap' : 'pincer_anvil',
          targetPos: cutoffPos,
          lookAtPos: ec.pos.clone(),
          targetEnemy: ec.player,
          targetContact: ec,
          escapeInfo: escInfo,
          safeStandoff: muAnvil === 'loses' ? 7.8 : 0,
          isCarrierTarget: true
        });
      }
    }
  }

  // 4. Attribution des ballons au sol sans doublon
  const groundBalls = balls.filter((b) => !b.tutorialHidden && b.state === 'ground');
  for (let i = 0; i < groundBalls.length; i++) {
    const b = groundBalls[i];
    const free = getFreeAIMates().filter((m) => m.color === b.color);
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

  // 5. Escorte défensive des porteuses alliées
  for (let i = 0; i < allyCarriers.length; i++) {
    const carrier = allyCarriers[i];
    const free = getFreeAIMates();
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

    if (mainThreat) {
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

  // 6. Chasse coordonnée & Encerclement en tenaille sur les proies adverses
  const freeForHunt = getFreeAIMates();
  const targetedPreyIds = new Set();

  if (profile.usePincer && humanChasedTargets.size > 0) {
    for (const [enemyId, humanMate] of humanChasedTargets.entries()) {
      const contact = contacts.find((c) => c.player.id === enemyId);
      if (!contact || targetedPreyIds.has(enemyId)) continue;
      const free = getFreeAIMates();
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

  for (let i = 0; i < freeForHunt.length; i++) {
    const m = freeForHunt[i];
    if (assignedIds.has(m.id)) continue;

    let bestPrey = null;
    let bestPreyScore = Infinity;
    for (let j = 0; j < contacts.length; j++) {
      const c = contacts[j];
      if (c.state !== 'standing') continue;
      const mu = getMatchup(m.color, c.knownColor, c.waterShield);
      if (mu !== 'beats') continue;
      const d = Math.hypot(c.pos.x - m.pos.x, c.pos.z - m.pos.z);
      const alreadyBonus = targetedPreyIds.has(c.player.id) ? 14 : 0;
      if (d + alreadyBonus < bestPreyScore) {
        bestPreyScore = d + alreadyBonus;
        bestPrey = c;
      }
    }

    if (bestPrey) {
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

      if (profile.usePincer) {
        const matesLeft = getFreeAIMates();
        let anvil = null;
        let bestD = profile.pincerMaxRange;
        for (let k = 0; k < matesLeft.length; k++) {
          const cand = matesLeft[k];
          const muCand = getMatchup(cand.color, bestPrey.knownColor, bestPrey.waterShield);
          const dCand = Math.hypot(bestPrey.pos.x - cand.pos.x, bestPrey.pos.z - cand.pos.z);
          if (dCand >= bestD) continue;
          const canZone =
            !teamHasHumanPlayer(team) &&
            !state.vanillaMode &&
            ((!cand.ultUsed && isUltimateUnlocked() && (cand.color === 'green' || cand.color === 'blue')) ||
              state.teams[team]?.powers?.[cand.role]?.toolEvo === 'wall');
          if (muCand === 'beats' || (muCand === 'same' && profile.useRule1Trap) || canZone) {
            bestD = dCand;
            anvil = cand;
          }
        }
        if (anvil) {
          const muAnvil = getMatchup(anvil.color, bestPrey.knownColor, bestPrey.waterShield);
          const cutoff = computeAnvilCutoffPos(anvil, bestPrey.pos, escInfo.primary, bestD);
          assignedIds.add(anvil.id);
          assignments.set(anvil.id, {
            type: muAnvil === 'same' && profile.useRule1Trap ? 'rule1_trap' : 'pincer_anvil',
            targetPos: cutoff,
            lookAtPos: bestPrey.pos.clone(),
            targetEnemy: bestPrey.player,
            targetContact: bestPrey,
            escapeInfo: escInfo,
            safeStandoff: muAnvil === 'loses' ? 8.2 : 0
          });
        }
      }
    }
  }

  // 7. Reconnaissance des dos cachés ou contrôle de zone pour les IA restantes
  const stillFree = getFreeAIMates();
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

  const plan = {
    at: nowMs,
    round: state.round,
    mapId: state.mapId,
    diff: profile.id,
    contacts,
    assignments,
    goals
  };
  teamPlanCache[team] = plan;
  return plan;
}

// --- DÉTECTION DE MENACE RAYON PLASMA (FEU EN CHARGE) ---
function findIncomingFireLaserThreat(p) {
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

// --- DÉCISION DES ULTIMATES (FEU, EAU, FEUILLE + ÉVOLUTIONS) ---
function updateActiveFireUltTracking(p, profile, plan) {
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

function tryAIUltimate(p, profile, plan, laserThreat) {
  const teamHasHuman = teamHasHumanPlayer(p.team);
  if (state.vanillaMode || teamHasHuman || !isUltimateUnlocked()) return false;
  if (p.state !== 'standing' || p.carryingBall) return false;

  // 1. Réactivation Rappel d'Eau Évoluée (intelligent)
  if (canReactivateWaterUlt(p)) {
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
      const distNow = Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
      if (distNow < 4.5) return;

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
  }

  if (p.ultUsed || p.ultCooldown > 0 || state.roundPlayTime < profile.ultMinRoundTime) return false;
  if ((p._aiUltThinkCd || 0) > 0) return false;
  p._aiUltThinkCd = profile.thinkIntervalMs * 0.001;

  const visibleEnemies = plan.contacts.filter((c) => c.visible && c.player.state !== 'sitting');
  const evolved = hasPlayerUltEvo(p);

  // --- A. ULTIMATE FEU (RAYON PLASMA) ---
  if (p.color === 'red') {
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

      const esc = findEscapeCorridors(e.pos.x, e.pos.z, 8.0, 8);
      if (esc.corneredScore > 0.45) score += 16;

      for (let j = 0; j < visibleEnemies.length; j++) {
        if (i === j) continue;
        const other = visibleEnemies[j].player;
        const oToX = other.pos.x - ox;
        const oToZ = other.pos.z - oz;
        const oProj = oToX * dirX + oToZ * dirZ;
        if (oProj > 1 && oProj < clearLen) {
          const oPerp = Math.hypot(oToX - dirX * oProj, oToZ - dirZ * oProj);
          if (oPerp <= beamRadius + 1.4) score += 30;
        }
      }

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

  // --- B. ULTIMATE EAU (VAGUE DÉFERLANTE / 360°) ---
  if (p.color === 'blue') {
    if (profile.useAntiLaserCounter && laserThreat && laserThreat.timeLeft <= 0.36) {
      const f = laserThreat.laser;
      const angToCaster = Math.atan2(f.ox - p.pos.x, f.oz - p.pos.z);
      broadcastAIUltimate(p, angToCaster, false);
      triggerPlayerUltimate(p, angToCaster, false);
      return true;
    }

    const maxRange = evolved ? WATER_ULT_RANGE * 1.35 : WATER_ULT_RANGE * 0.78;
    let bestAngle = p.facingAngle;
    let bestScore = 0;

    if (evolved) {
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

    for (let i = 0; i < visibleEnemies.length; i++) {
      const c = visibleEnemies[i];
      const e = c.player;
      if (Math.abs((e.pos.y || 0) - (p.pos.y || 0)) > 2.4) continue;
      const dx = e.pos.x - p.pos.x;
      const dz = e.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > maxRange || d < 1.5) continue;

      const ang = Math.atan2(dx, dz);
      const ux = Math.sin(ang);
      const uz = Math.cos(ang);

      let blockedByLeaf = false;
      for (let w = 0; w < activeLeafWalls.length; w++) {
        const wall = activeLeafWalls[w];
        if (wall.phase !== 'grown') continue;
        for (let n = 0; n < wall.nodes.length; n++) {
          const nd = wall.nodes[n];
          const pDot = (nd.x - p.pos.x) * ux + (nd.z - p.pos.z) * uz;
          if (pDot > 0 && pDot < Math.min(d, 9.0)) {
            const perp = Math.hypot(nd.x - p.pos.x - ux * pDot, nd.z - p.pos.z - uz * pDot);
            if (perp < 2.5) {
              blockedByLeaf = true;
              break;
            }
          }
        }
        if (blockedByLeaf) break;
      }
      if (blockedByLeaf) continue;

      let score = 0;
      for (let j = 0; j < visibleEnemies.length; j++) {
        const other = visibleEnemies[j];
        const ox = other.pos.x - p.pos.x;
        const oz = other.pos.z - p.pos.z;
        const proj = ox * ux + oz * uz;
        if (proj < 0.5 || proj > maxRange) continue;
        const perp = Math.abs(ox * -uz + oz * ux);
        if (perp > 10.5) continue;

        score += 18;
        if (other.carryingBall) score += 28;
        if (other.knownColor === 'green' && proj < 12) score += 22;
        const behindClear = probeClearDistance(other.pos.x, other.pos.z, ux, uz, 8.0, 1.0);
        if (behindClear < 4.0) score += 12;
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

  // --- C. ULTIMATE FEUILLE (SPRINT SYLVESTRE + MUR DE BOIS) ---
  if (p.color === 'green') {
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
  }

  return false;
}

function computeLeafSprintArcTarget(p, profile, plan) {
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

// --- DÉPLOIEMENT D'OUTILS (MUR 3M, BALISE, TAPIS) ---
function tryAIToolDeploy(p, profile, plan, laserThreat) {
  const teamHasHuman = teamHasHumanPlayer(p.team);
  if (state.vanillaMode || teamHasHuman) return false;
  const aiToolEvo = state.teams[p.team]?.powers?.[p.role]?.toolEvo;
  if (!aiToolEvo || p.toolCooldown > 0 || p.state !== 'standing' || p.carryingBall) return false;
  if (state.roundPlayTime < 2.2) return false;

  const deploy = (angle) => {
    p.facingAngle = angle;
    ctx.api.deployPlayerTool?.(p, aiToolEvo, p.pos.x, p.pos.y, p.pos.z, angle, !!p.onCanopy, false);
    return true;
  };

  if (aiToolEvo === 'wall') {
    if (profile.useAntiLaserCounter && laserThreat && laserThreat.timeLeft <= 0.38) {
      const ang = Math.atan2(laserThreat.laser.ox - p.pos.x, laserThreat.laser.oz - p.pos.z);
      return deploy(ang);
    }
    const closeThreat = plan.contacts.find(
      (c) =>
        c.visible &&
        c.state === 'standing' &&
        Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 9.5 &&
        (c.carryingBall || getMatchup(p.color, c.knownColor, c.waterShield) === 'loses')
    );
    if (closeThreat) {
      const ang = Math.atan2(closeThreat.pos.x - p.pos.x, closeThreat.pos.z - p.pos.z);
      return deploy(ang);
    }
    return false;
  }

  if (aiToolEvo === 'beacon') {
    const existing = (ctx.entities.activeToolBeacons || []).find((b) => b.ownerId === p.id);
    if (existing) return false;
    const nearBush = JUNGLE_BUSHES.some((b) => Math.hypot(b.x - p.pos.x, b.z - p.pos.z) < 7.5);
    const nearMid = Math.hypot(p.pos.x, p.pos.z) < 34;
    if (nearBush || nearMid) {
      return deploy(p.facingAngle);
    }
    return false;
  }

  if (aiToolEvo === 'pad') {
    const existing = (ctx.entities.activeToolPads || []).find((pad) => pad.ownerId === p.id);
    if (existing) return false;
    const toGoalAng = Math.atan2(plan.goals.targetGoalX - p.pos.x, plan.goals.targetGoalZ - p.pos.z);
    const dirX = Math.sin(toGoalAng);
    const dirZ = Math.cos(toGoalAng);
    if (!p.onCanopy && probeClearDistance(p.pos.x, p.pos.z, dirX, dirZ, 16.0, 1.0) >= 14.0) {
      return deploy(toGoalAng);
    }
  }
  return false;
}

// --- MOTEUR DE DASH & RETOUR BOOMERANG ---
function stepAIDashPhysics(p, dt, profile, plan) {
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

function tryAIBoomerangReturn(p, profile, plan, laserThreat) {
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

function tryAIDash(p, dt, profile, plan, laserThreat, predators) {
  if (p.state !== 'standing' || p.carryingBall || p.isAirborne || p.isLaunching) return false;
  if (p.dashCooldown > 0 || p.dashTimer > 0) return false;
  if (p.onCanopy) return false;

  if ((p._aiDashThinkCd || 0) > 0) {
    p._aiDashThinkCd = Math.max(0, p._aiDashThinkCd - dt);
    return false;
  }

  const dashDist = getEffectiveDashDistance(p);
  const dashKind = getEffectiveDashKind(p);
  const isAllyOfHuman = teamHasHumanPlayer(p.team);

  const fireDash = (dx, dz, slideTargetPos = null) => {
    p._aiDashThinkCd = profile.dashDecisionCd;
    if (dashKind === 'slide' && slideTargetPos) {
      p._aiSlideTarget = { x: slideTargetPos.x, z: slideTargetPos.z };
    } else {
      p._aiSlideTarget = null;
    }
    return !!ctx.api.executePlayerDash?.(p, dx, dz, { isHuman: false });
  };

  if (laserThreat && laserThreat.timeLeft <= Math.max(0.14, 0.42 - profile.dodgeReactionSec)) {
    if (laserThreat.clearDist >= 3.4) {
      return fireDash(laserThreat.dodgeX, laserThreat.dodgeZ);
    }
  }

  if (predators.length > 0) {
    const closestPred = predators[0];
    const dPred = Math.hypot(p.pos.x - closestPred.pos.x, p.pos.z - closestPred.pos.z);
    const threshold = isAllyOfHuman ? 4.3 : profile.predatorDashDist;
    if (dPred < threshold) {
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
      if (bestDir) {
        return fireDash(bestDir.dirX, bestDir.dirZ);
      }
    }
  }

  const task = plan.assignments.get(p.id);
  if (!task) return false;

  if (
    task.targetEnemy &&
    (task.type === 'pincer_hammer' ||
      task.type === 'rescue_rule1' ||
      task.type === 'rule1_trap' ||
      task.type === 'escort_carrier')
  ) {
    const te = task.targetEnemy;
    const teVel = te.vel || { x: 0, z: 0 };
    const predTime = profile.id === 'hard' ? 0.24 : 0.1;
    const tx = te.pos.x + teVel.x * predTime;
    const tz = te.pos.z + teVel.z * predTime;
    const dx = tx - p.pos.x;
    const dz = tz - p.pos.z;
    const dist = Math.hypot(dx, dz);

    const maxStrikeRange = isAllyOfHuman ? dashDist + 1.5 : dashDist + (dashKind === 'slide' ? 4.5 : 3.2);
    if (dist >= 2.8 && dist <= maxStrikeRange) {
      const ux = dx / dist;
      const uz = dz / dist;
      const clear = probeClearDistance(p.pos.x, p.pos.z, ux, uz, Math.min(dist, dashDist), 0.9);
      if (clear >= Math.min(dist - 1.1, dashDist * 0.72)) {
        return fireDash(ux, uz, { x: tx, z: tz });
      }
      if (profile.useBounceBankShot && dashKind === 'bounce') {
        const bank = findBounceWallReflection(p.pos.x, p.pos.z, tx, tz, dashDist);
        if (bank) {
          return fireDash(bank.dirX, bank.dirZ);
        }
      }
    }
  }

  if (
    !isAllyOfHuman &&
    profile.id === 'hard' &&
    task.type === 'pincer_anvil' &&
    task.targetPos &&
    (task.safeStandoff || 0) === 0
  ) {
    const dx = task.targetPos.x - p.pos.x;
    const dz = task.targetPos.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist >= 5.5 && dist <= dashDist + 5.0) {
      const ux = dx / dist;
      const uz = dz / dist;
      if (
        probeClearDistance(p.pos.x, p.pos.z, ux, uz, Math.min(dist, dashDist), 1.0) >=
        Math.min(dist - 1.0, dashDist * 0.78)
      ) {
        return fireDash(ux, uz, task.targetPos);
      }
    }
  }

  if (task.type === 'grab_ball' && task.contested && task.targetBall) {
    const dx = task.targetBall.pos.x - p.pos.x;
    const dz = task.targetBall.pos.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist >= 4.2 && dist <= dashDist + 6.5) {
      const ux = dx / dist;
      const uz = dz / dist;
      if (
        probeClearDistance(p.pos.x, p.pos.z, ux, uz, Math.min(dist, dashDist), 1.0) >=
        Math.min(dist - 1.0, dashDist * 0.8)
      ) {
        return fireDash(ux, uz, task.targetBall.pos);
      }
    }
  }

  return false;
}

// --- PASSE TACTIQUE / TIR AU CERCEAU SOUS PRESSION ---
function tryAIBallPassOrShot(p, profile, plan, predators) {
  if (!profile.useClutchPass || !p.carryingBall || !canPlayerPassOrThrow(p)) return false;
  if (teamHasHumanPlayer(p.team)) return false;
  if (predators.length === 0) return false;

  const closestPred = predators[0];
  const dPred = Math.hypot(p.pos.x - closestPred.pos.x, p.pos.z - closestPred.pos.z);
  if (dPred > 5.4) return false;

  const gx = plan.goals.targetGoalX - p.pos.x;
  const gz = plan.goals.targetGoalZ - p.pos.z;
  const distGoal = Math.hypot(gx, gz);
  if (
    distGoal <= 16.5 &&
    !p.onCanopy &&
    hasClearLineOfSight(p.pos, { x: plan.goals.targetGoalX, y: 0.8, z: plan.goals.targetGoalZ }, false)
  ) {
    const aim = Math.atan2(gx, gz);
    return !!ctx.api.executeBallPassOrThrow?.(p, null, aim, Math.min(1, distGoal / 18));
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

// --- IA ASSISE : UTILISATION TACTIQUE DE "SE RELEVER" (standUp) ---
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

// --- BOUCLE PRINCIPALE DE MISE À JOUR IA ---
export function updateAIPlayer(p, dt) {
  if (state.mode === 'tutorial' || state.mode === 'practice') {
    p.vel.set(0, 0, 0);
    ctx.api.stepCharacterVerticalPhysics(p, 0, 0, dt, false);
    return;
  }

  if (p.isAirborne || p.isLaunching) {
    ctx.api.stepCharacterVerticalPhysics(p, 0, 0, dt, false);
    return;
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
    return;
  }

  const profile = getAIProfile();
  const plan = getTeamTacticalPlan(p.team, profile);

  if (p.dashTimer > 0) {
    stepAIDashPhysics(p, dt, profile, plan);
    return;
  }

  if ((p._aiUltThinkCd || 0) > 0) {
    p._aiUltThinkCd = Math.max(0, p._aiUltThinkCd - dt);
  }

  const isAlly = p.team === 'ally';
  const leafMult =
    p.leafUltTimer > 0 && !p.carryingBall ? p.leafUltSpeedMult || LEAF_ULT_SPEED_MULT : 1.0;
  const speed = (isAlly ? profile.allySpeed : profile.enemySpeed) * leafMult;

  updateActiveFireUltTracking(p, profile, plan);

  const laserThreat = findIncomingFireLaserThreat(p);
  const predators = plan.contacts
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
  let targetPos = leafArcTarget || (task ? task.targetPos : null);
  let lookAtPos = task ? task.lookAtPos || null : null;

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

  let steerTarget = targetPos;
  if (CANOPY_SPEC.hasCanopy && p.onCanopy) {
    const curSurf = getCanopySurfaceY(p.pos.x, p.pos.z);
    if (curSurf) {
      steerTarget = CANOPY_AI_ROUTER.getSteerTarget(p, curSurf, targetPos);
    }
  } else if (targetPos && state.mapId !== 'tutorial') {
    if (hasGridLOS(p.pos.x, p.pos.z, targetPos.x, targetPos.z)) {
      p._aiNavPath = null;
    } else {
      const nowMs = performance.now();
      const navVer = getNavVersion();
      const goalMoved =
        !p._aiNavGoal ||
        Math.hypot(targetPos.x - p._aiNavGoal.x, targetPos.z - p._aiNavGoal.z) > 3.2;
      const needRecompute =
        !Array.isArray(p._aiNavPath) ||
        p._aiNavPath.length === 0 ||
        (p._aiNavIndex || 0) >= p._aiNavPath.length ||
        nowMs - (p._aiNavAt || 0) > profile.navReplanMs ||
        navVer !== p._aiNavVer ||
        goalMoved;
      if (needRecompute) {
        p._aiNavPath = computeMobaPath(p.pos.x, p.pos.z, targetPos.x, targetPos.z, {
          maxExpansions: state.mapId === 'rift' ? 3600 : 2400
        });
        p._aiNavIndex = 0;
        p._aiNavAt = nowMs;
        p._aiNavVer = navVer;
        p._aiNavGoal = { x: targetPos.x, z: targetPos.z };
      }

      if (Array.isArray(p._aiNavPath) && p._aiNavPath.length > 0) {
        while (p._aiNavIndex < p._aiNavPath.length) {
          const wp = p._aiNavPath[p._aiNavIndex];
          if (Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z) <= 1.15) {
            p._aiNavIndex++;
          } else {
            break;
          }
        }
        if (p._aiNavIndex < p._aiNavPath.length) {
          const wp = p._aiNavPath[p._aiNavIndex];
          steerTarget = new THREE.Vector3(wp.x, 0, wp.z);
        }
      } else if (state.mapId === 'lafontaine' && Math.abs(p.pos.x) < 33) {
        const lf = PARK_LANDMARKS.lafontaine;
        const sideA = p.pos.z;
        const sideB = targetPos.z;
        const crossesPondZ =
          (sideA < -11.5 && sideB > 11.5) || (sideA > 11.5 && sideB < -11.5);
        const onBridgeCorridor =
          Math.abs(p.pos.x) <= lf.bridgeHalfX - 0.3 && Math.abs(p.pos.z) <= lf.bridgeHalfZ;
        if (crossesPondZ && !onBridgeCorridor) {
          const crossings = [
            { x: 0, z: 0 },
            { x: -35.5, z: 0 },
            { x: 35.5, z: 0 }
          ];
          let bestWp = crossings[0];
          let bestLen = Infinity;
          for (let ci = 0; ci < crossings.length; ci++) {
            const wp = crossings[ci];
            const totalLen =
              Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z) +
              Math.hypot(targetPos.x - wp.x, targetPos.z - wp.z);
            if (totalLen < bestLen) {
              bestLen = totalLen;
              bestWp = wp;
            }
          }
          steerTarget = new THREE.Vector3(bestWp.x, 0, bestWp.z);
        }
      } else if (state.mapId === 'saint-viateur') {
        const sv = PARK_LANDMARKS.saintViateur;
        const onBridge =
          Math.abs(p.pos.x) >= sv.bridgeInnerX - 0.5 &&
          Math.abs(p.pos.x) <= sv.bridgeOuterX + 0.5 &&
          Math.abs(p.pos.z) <= sv.bridgeHalfZ;
        const targetOnIsland = Math.hypot(targetPos.x / sv.islandRx, targetPos.z / sv.islandRz) < 1.0;
        const selfOutsideMoat = Math.hypot(p.pos.x / sv.pondRx, p.pos.z / sv.pondRz) > 1.0;
        const selfOnIsland = Math.hypot(p.pos.x / sv.islandRx, p.pos.z / sv.islandRz) < 1.0;
        const targetOutsideMoat = Math.hypot(targetPos.x / sv.pondRx, targetPos.z / sv.pondRz) > 1.0;
        const crossesWholePondX =
          Math.abs(p.pos.z) < sv.pondRz &&
          ((p.pos.x < -sv.islandRx && targetPos.x > sv.islandRx) ||
            (p.pos.x > sv.islandRx && targetPos.x < -sv.islandRx));

        if (!onBridge && ((targetOnIsland && selfOutsideMoat) || (selfOnIsland && targetOutsideMoat))) {
          const bx =
            p.pos.x >= 0
              ? (sv.bridgeInnerX + sv.bridgeOuterX) * 0.5
              : -(sv.bridgeInnerX + sv.bridgeOuterX) * 0.5;
          steerTarget = new THREE.Vector3(bx, 0, 0);
        } else if (!onBridge && crossesWholePondX && !selfOnIsland) {
          const edgeZ = p.pos.z >= 0 ? sv.pondRz + 2.8 : -(sv.pondRz + 2.8);
          steerTarget = new THREE.Vector3(0, 0, edgeZ);
        }
      }
    }
  }

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
      if (bestEsc) {
        moveX += bestEsc.dirX * 1.75;
        moveZ += bestEsc.dirZ * 1.75;
      } else {
        moveX += repelX;
        moveZ += repelZ;
      }
    } else {
      moveX += repelX;
      moveZ += repelZ;
    }
  }

  let mLen = Math.hypot(moveX, moveZ);
  if (mLen > 0.05) {
    const baseDirX = moveX / mLen;
    const baseDirZ = moveZ / mLen;
    let steerX = baseDirX;
    let steerZ = baseDirZ;

    if (!p.onCanopy) {
      const jungleSteer = steerAroundCircleObstacles(p.pos.x, p.pos.z, baseDirX, baseDirZ, JUNGLE_OBSTACLES);
      steerX += jungleSteer.sx;
      steerZ += jungleSteer.sz;

      if (JUNGLE_WALLS.length > 0) {
        const riftSteer = steerAroundWallSegments(p.pos.x, p.pos.z, baseDirX, baseDirZ, JUNGLE_WALLS);
        steerX += riftSteer.sx;
        steerZ += riftSteer.sz;
      }

      for (let w = 0; w < activeLeafWalls.length; w++) {
        const wall = activeLeafWalls[w];
        if (wall.phase !== 'grown') continue;
        const wallCircles = wall.nodes.map((nd) => ({ x: nd.x, z: nd.z, radius: LEAF_ULT_WALL_RADIUS }));
        const wallSteer = steerAroundCircleObstacles(p.pos.x, p.pos.z, baseDirX, baseDirZ, wallCircles);
        steerX += wallSteer.sx;
        steerZ += wallSteer.sz;
      }

      const toolWalls = (ctx.entities.activeToolWalls || [])
        .filter((tw) => tw && !tw.onCanopy)
        .map((tw) => ({ ax: tw.ax, az: tw.az, bx: tw.bx, bz: tw.bz, radius: tw.thickness || 0.36 }));
      if (toolWalls.length > 0) {
        const toolSteer = steerAroundWallSegments(p.pos.x, p.pos.z, baseDirX, baseDirZ, toolWalls);
        steerX += toolSteer.sx;
        steerZ += toolSteer.sz;
      }

      if (CANOPY_SPEC.hasCanopy) {
        const trunkSteer = steerAroundCircleObstacles(p.pos.x, p.pos.z, baseDirX, baseDirZ, CANOPY_SPEC.trunks);
        steerX += trunkSteer.sx;
        steerZ += trunkSteer.sz;
        if (p.pos.y < CANOPY_SPEC.launchLipY) {
          for (let i = 0; i < CANOPY_SPEC.aiPierBoxes.length; i++) {
            const box = CANOPY_SPEC.aiPierBoxes[i];
            const bSteer = steerAroundBoxObstacle(p.pos.x, p.pos.z, baseDirX, baseDirZ, box[0], box[1], box[2], box[3], box[4]);
            steerX += bSteer.sx;
            steerZ += bSteer.sz;
          }
          if (p.pos.y < 2.2) {
            for (let i = 0; i < CANOPY_SPEC.aiRampSkirtBoxes.length; i++) {
              const box = CANOPY_SPEC.aiRampSkirtBoxes[i];
              const bSteer = steerAroundBoxObstacle(p.pos.x, p.pos.z, baseDirX, baseDirZ, box[0], box[1], box[2], box[3], box[4]);
              steerX += bSteer.sx;
              steerZ += bSteer.sz;
            }
          }
        }
      } else if (state.mapId === 'saint-viateur') {
        const sv = PARK_LANDMARKS.saintViateur;
        const bSteer = steerAroundBoxObstacle(
          p.pos.x, p.pos.z, baseDirX, baseDirZ,
          sv.chaletMinX - 0.3, sv.chaletMaxX + 0.3, sv.chaletMinZ - 0.3, sv.chaletMaxZ + 0.3, 2.8
        );
        steerX += bSteer.sx;
        steerZ += bSteer.sz;
        const onBridgeBand =
          Math.abs(p.pos.x) >= sv.bridgeInnerX &&
          Math.abs(p.pos.x) <= sv.bridgeOuterX &&
          Math.abs(p.pos.z) <= sv.bridgeHalfZ;
        if (!onBridgeBand && Math.hypot(p.pos.x / sv.pondRx, p.pos.z / sv.pondRz) > 0.96) {
          const pW = steerAroundBoxObstacle(p.pos.x, p.pos.z, baseDirX, baseDirZ, -sv.bridgeOuterX, -sv.bridgeInnerX, -sv.bridgeParapetOuterZ, -sv.bridgeHalfZ, 1.3);
          const pW2 = steerAroundBoxObstacle(p.pos.x, p.pos.z, baseDirX, baseDirZ, -sv.bridgeOuterX, -sv.bridgeInnerX, sv.bridgeHalfZ, sv.bridgeParapetOuterZ, 1.3);
          const pE = steerAroundBoxObstacle(p.pos.x, p.pos.z, baseDirX, baseDirZ, sv.bridgeInnerX, sv.bridgeOuterX, -sv.bridgeParapetOuterZ, -sv.bridgeHalfZ, 1.3);
          const pE2 = steerAroundBoxObstacle(p.pos.x, p.pos.z, baseDirX, baseDirZ, sv.bridgeInnerX, sv.bridgeOuterX, sv.bridgeHalfZ, sv.bridgeParapetOuterZ, 1.3);
          steerX += pW.sx + pW2.sx + pE.sx + pE2.sx;
          steerZ += pW.sz + pW2.sz + pE.sz + pE2.sz;
        }
      } else if (state.mapId === 'lafontaine') {
        const lf = PARK_LANDMARKS.lafontaine;
        const parapetW = steerAroundBoxObstacle(p.pos.x, p.pos.z, baseDirX, baseDirZ, -lf.bridgeParapetOuterX, -lf.bridgeHalfX, -lf.bridgeHalfZ, lf.bridgeHalfZ, 1.4);
        const parapetE = steerAroundBoxObstacle(p.pos.x, p.pos.z, baseDirX, baseDirZ, lf.bridgeHalfX, lf.bridgeParapetOuterX, -lf.bridgeHalfZ, lf.bridgeHalfZ, 1.4);
        steerX += parapetW.sx + parapetE.sx;
        steerZ += parapetW.sz + parapetE.sz;
        if (Math.abs(p.pos.x) > lf.bridgeHalfX) {
          const pondSteer = steerAroundCircleObstacles(p.pos.x, p.pos.z, baseDirX, baseDirZ, [
            { x: -17.5, z: 0, radius: 11.4 },
            { x: 17.5, z: 0, radius: 11.4 },
            { x: -9.0, z: 0, radius: 11.8 },
            { x: 9.0, z: 0, radius: 11.8 }
          ]);
          steerX += pondSteer.sx;
          steerZ += pondSteer.sz;
        }
      } else if (state.mapId === 'mont-royal') {
        const mrSteer = steerAroundCircleObstacles(p.pos.x, p.pos.z, baseDirX, baseDirZ, [
          { x: 0, z: -5.2, radius: 2.4 },
          { x: 0, z: 4.2, radius: 5.5 }
        ]);
        steerX += mrSteer.sx;
        steerZ += mrSteer.sz;
      }
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
  } else {
    ctx.api.stepCharacterVerticalPhysics(p, 0, 0, dt, false);
    if (!p.onSlidePatch && !isPlayerChargingFireUlt(p) && lookAtPos) {
      const desiredAngle = Math.atan2(lookAtPos.x - p.pos.x, lookAtPos.z - p.pos.z);
      p.facingAngle = lerpAngle(p.facingAngle, desiredAngle, 7 * dt);
    }
  }
}
