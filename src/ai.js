// ============================================================================
// COILBALL 3D — INTELLIGENCE ARTIFICIELLE & ROUTAGE CANOPÉE
// ============================================================================

import { COLORS, FIELD, PAD_DASH_SPEED, state, mp, ctx, lerpAngle } from './state.js';
import { players, balls } from './render3d.js';
import {
  PARK_LANDMARKS,
  CANOPY_SPEC,
  JUNGLE_OBSTACLES,
  JUNGLE_WALLS,
  getCanopySurfaceY,
  hasClearLineOfSight
} from './world.js';
import {
  LEAF_ULT_SPEED_MULT,
  LEAF_ULT_WALL_RADIUS,
  activeLeafWalls,
  canReactivateWaterUlt,
  triggerPlayerUltimate
} from './ultimates.js';
import { computeMobaPath, hasGridLOS, getNavVersion } from './nav.js';

const THREE = ctx.THREE;

function pickClosestEntity(list, px, pz) {
  let best = null;
  let bestDistSq = Infinity;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const dx = item.pos.x - px;
    const dz = item.pos.z - pz;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = item;
    }
  }
  return best;
}

export function initAI() {
  ctx.world.rebuildAIRouter = () => CANOPY_AI_ROUTER.rebuild(CANOPY_SPEC);
  CANOPY_AI_ROUTER.rebuild(CANOPY_SPEC);
}
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
    const t = lenSq > 0.0001
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

// --- INTELLIGENCE ARTIFICIELLE & ROUTAGE CANOPÉE ---
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
      connect('northHub', 'nLaunchExit', true); // One-way sortie vers Lane Haut (-50)
      connect('southHub', 'sLaunchExit', true); // One-way sortie vers Lane Bas (+50)

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
        const outZ = curSurf.zone === 'northLaunch' ? -CANOPY_SPEC.launchOuterZ : CANOPY_SPEC.launchOuterZ;
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
          const launchBias = (en.id === 'nLaunchExit' || en.id === 'sLaunchExit') && Math.abs(gz) > 22 ? -4.5 : 0;
          const score = toStart + pathLen + afterLand + launchBias;
          if (score < bestScore) {
            bestScore = score;
            bestStartIdx = sIdx;
            bestExitIdx = eIdx;
          }
        }
      }

      const nextNodeIdx = curSurf.deckId
        ? nextHop[bestStartIdx][bestExitIdx]
        : bestStartIdx;
      const wp = nodes[nextNodeIdx >= 0 ? nextNodeIdx : bestStartIdx];

      if (curSurf.deckId) {
        const deckNode = nodes[nodeIndex.get(curSurf.deckId)];
        const dx = Math.abs(wp.x - deckNode.x);
        const dz = Math.abs(wp.z - deckNode.z);
        const offCenter = dx > dz ? Math.abs(p.pos.z - deckNode.z) : Math.abs(p.pos.x - deckNode.x);
        if (offCenter > 0.72) {
          return new THREE.Vector3(deckNode.x, CANOPY_SPEC.deckY, deckNode.z);
        }
      }

      return new THREE.Vector3(wp.x, wp.y, wp.z);
    }
  };

  return router;
})();

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
    p.facingAngle = lerpAngle(p.facingAngle, Math.atan2(vx, vz), 25 * dt);
    ctx.api.stepCharacterVerticalPhysics(p, vx, vz, dt, true);
    return;
  }

  const isAlly = p.team === 'ally';
  const targetGoalX = isAlly ? FIELD.enemyGoalX : FIELD.allyGoalX;
  const targetGoalZ = isAlly ? (FIELD.enemyGoalZ || 0) : (FIELD.allyGoalZ || 0);
  const ownGoalX = isAlly ? FIELD.allyGoalX : FIELD.enemyGoalX;
  const ownGoalZ = isAlly ? (FIELD.allyGoalZ || 0) : (FIELD.enemyGoalZ || 0);
  const leafMult =
    p.leafUltTimer > 0 && !p.carryingBall ? p.leafUltSpeedMult || LEAF_ULT_SPEED_MULT : 1.0;
  const speed = (isAlly ? 8.88 : 7.8) * leafMult;

  // IA adverse uniquement (ne jamais consommer les ultimates de l'équipe du joueur humain) : utilisation tactique en Ronde 2+
  const teamHasHuman =
    p.team === state.myTeam ||
    (mp.enabled && mp.members.some((m) => m.team === p.team));
  if (
    !state.vanillaMode &&
    !teamHasHuman &&
    state.round >= 2 &&
    state.roundPlayTime > 3.8 &&
    !p.ultUsed &&
    p.ultCooldown <= 0 &&
    p.state === 'standing' &&
    !p.carryingBall &&
    Math.random() < 0.35 * dt
  ) {
    const oppList = players.filter((e) => e.team !== p.team && e.state === 'standing');
    if (p.color === 'red') {
      const snipeTarget = oppList.find((e) => {
        const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
        return (
          d > 10 &&
          d < 62 &&
          Math.abs((e.pos.y || 0) - (p.pos.y || 0)) < 2.2 &&
          !(e.waterShieldTimer > 0) &&
          hasClearLineOfSight(p.pos, e.pos, false)
        );
      });
      if (snipeTarget) {
        const aim = Math.atan2(snipeTarget.pos.x - p.pos.x, snipeTarget.pos.z - p.pos.z);
        triggerPlayerUltimate(p, aim, false);
      }
    } else if (p.color === 'blue') {
      const waveTarget = oppList.find((e) => {
        const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
        return (
          d < 22 &&
          Math.abs((e.pos.y || 0) - (p.pos.y || 0)) < 2.2 &&
          hasClearLineOfSight(p.pos, e.pos, false)
        );
      });
      if (waveTarget) {
        const aim = Math.atan2(waveTarget.pos.x - p.pos.x, waveTarget.pos.z - p.pos.z);
        triggerPlayerUltimate(p, aim, false);
      }
    } else if (p.color === 'green') {
      const hasCloseEnemy = oppList.some((e) => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 32);
      const hasCloseBall = balls.some(
        (b) =>
          b.state === 'ground' &&
          b.color === p.color &&
          Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < 45
      );
      if (hasCloseEnemy || hasCloseBall) {
        triggerPlayerUltimate(p, p.facingAngle, false);
      }
    }
  }
  if (
    !state.vanillaMode &&
    !teamHasHuman &&
    canReactivateWaterUlt(p) &&
    p.activeReactivableWave.hitPlayerIds.size > 0 &&
    p.activeReactivableWave.traveled > 12 &&
    Math.random() < 1.2 * dt
  ) {
    triggerPlayerUltimate(p, p.facingAngle, false, true);
  }
  const aiToolEvo = state.teams[p.team]?.powers?.[p.role]?.toolEvo;
  if (
    !state.vanillaMode &&
    !teamHasHuman &&
    aiToolEvo &&
    p.toolCooldown <= 0 &&
    p.state === 'standing' &&
    !p.carryingBall &&
    state.roundPlayTime > 3.0 &&
    Math.random() < 0.25 * dt
  ) {
    ctx.api.deployPlayerTool(p, aiToolEvo, p.pos.x, p.pos.y, p.pos.z, p.facingAngle, !!p.onCanopy, false);
  }

  let targetPos = null;
  let lookAtPos = null;

  if (p.carryingBall) {
    targetPos = new THREE.Vector3(targetGoalX, 0, targetGoalZ);
  } else {
    const lockedMate = players.find(
      (other) => other.team === p.team && other.state === 'rule1' && other.rule1Partner
    );
    if (lockedMate && lockedMate.rule1Partner) {
      const enemyInLock = lockedMate.rule1Partner;
      if (COLORS[p.color].beats === enemyInLock.color) {
        targetPos = enemyInLock.pos.clone();
      }
    }

    if (!targetPos) {
      const matchingBalls = balls.filter(
        (b) => b.state === 'ground' && b.color === p.color
      );
      const matchingBall = pickClosestEntity(matchingBalls, p.pos.x, p.pos.z);
      if (matchingBall) {
        targetPos = matchingBall.pos.clone();
      }
    }

    if (!targetPos) {
      const enemies = players.filter(
        (e) => e.team !== p.team && e.state === 'standing'
      );
      const beatenEnemies = enemies.filter((e) => COLORS[p.color].beats === e.color);
      const unshielded =
        p.color === 'red' ? beatenEnemies.filter((e) => !(e.waterShieldTimer > 0)) : beatenEnemies;
      const prey = pickClosestEntity(unshielded.length > 0 ? unshielded : beatenEnemies, p.pos.x, p.pos.z);
      if (prey) {
        targetPos = prey.pos.clone();
      } else if (enemies.length > 0) {
        if (state.mapId === 'rift') {
          const homeSpot = isAlly
            ? p.role === 'G' ? { x: -76, z: 32 } : p.role === 'D' ? { x: -32, z: 76 } : { x: -46, z: 46 }
            : p.role === 'D' ? { x: 32, z: -76 } : p.role === 'G' ? { x: 76, z: -32 } : { x: 46, z: -46 };
          targetPos = new THREE.Vector3(homeSpot.x, 0, homeSpot.z);
          lookAtPos = new THREE.Vector3(0, 0, 0);
        } else {
          const homeZ = p.role === 'G' ? FIELD.laneTopZ * 0.72 : p.role === 'D' ? FIELD.laneBotZ * 0.72 : 0;
          targetPos = new THREE.Vector3(ownGoalX * 0.65, 0, homeZ);
          lookAtPos = new THREE.Vector3(0, 0, homeZ);
        }
      }
    }
  }

  // Si l'IA évolue sur la canopée, elle emprunte le graphe d'arbre en arbre, vers le Sky-Launch One-Way ou une rampe
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
        Math.hypot(targetPos.x - p._aiNavGoal.x, targetPos.z - p._aiNavGoal.z) > 4.0;
      const needRecompute =
        !Array.isArray(p._aiNavPath) ||
        p._aiNavPath.length === 0 ||
        (p._aiNavIndex || 0) >= p._aiNavPath.length ||
        nowMs - (p._aiNavAt || 0) > 450 ||
        navVer !== p._aiNavVer ||
        goalMoved;
      if (needRecompute) {
        p._aiNavPath = computeMobaPath(p.pos.x, p.pos.z, targetPos.x, targetPos.z, {
          maxExpansions: state.mapId === 'rift' ? 3500 : 2200
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
        const onBridgeCorridor = Math.abs(p.pos.x) <= lf.bridgeHalfX - 0.3 && Math.abs(p.pos.z) <= lf.bridgeHalfZ;
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
        const onBridge = Math.abs(p.pos.x) >= sv.bridgeInnerX - 0.5 && Math.abs(p.pos.x) <= sv.bridgeOuterX + 0.5 && Math.abs(p.pos.z) <= sv.bridgeHalfZ;
        const targetOnIsland = Math.hypot(targetPos.x / sv.islandRx, targetPos.z / sv.islandRz) < 1.0;
        const selfOutsideMoat = Math.hypot(p.pos.x / sv.pondRx, p.pos.z / sv.pondRz) > 1.0;
        const selfOnIsland = Math.hypot(p.pos.x / sv.islandRx, p.pos.z / sv.islandRz) < 1.0;
        const targetOutsideMoat = Math.hypot(targetPos.x / sv.pondRx, targetPos.z / sv.pondRz) > 1.0;
        const crossesWholePondX =
          Math.abs(p.pos.z) < sv.pondRz &&
          ((p.pos.x < -sv.islandRx && targetPos.x > sv.islandRx) ||
            (p.pos.x > sv.islandRx && targetPos.x < -sv.islandRx));

        if (!onBridge && ((targetOnIsland && selfOutsideMoat) || (selfOnIsland && targetOutsideMoat))) {
          const bx = p.pos.x >= 0 ? (sv.bridgeInnerX + sv.bridgeOuterX) * 0.5 : -(sv.bridgeInnerX + sv.bridgeOuterX) * 0.5;
          steerTarget = new THREE.Vector3(bx, 0, 0);
        } else if (!onBridge && crossesWholePondX && !selfOnIsland) {
          const edgeZ = p.pos.z >= 0 ? sv.pondRz + 2.8 : -(sv.pondRz + 2.8);
          steerTarget = new THREE.Vector3(0, 0, edgeZ);
        }
      }
    }
  }

  const predators = players.filter(
    (e) =>
      e.team !== p.team &&
      e.state === 'standing' &&
      COLORS[e.color].beats === p.color &&
      !(e.color === 'red' && p.waterShieldTimer > 0) &&
      Math.abs(e.pos.y - p.pos.y) < 2.2 &&
      e.pos.distanceTo(p.pos) < 7.5
  );

  let moveX = 0;
  let moveZ = 0;

  if (steerTarget) {
    const dx = steerTarget.x - p.pos.x;
    const dz = steerTarget.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.4) {
      moveX += dx / dist;
      moveZ += dz / dist;
    }
  }

  predators.forEach((pred) => {
    const dx = p.pos.x - pred.pos.x;
    const dz = p.pos.z - pred.pos.z;
    const dist = Math.max(0.5, Math.hypot(dx, dz));
    moveX += (dx / dist) * 1.15;
    moveZ += (dz / dist) * 1.15;
  });

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

        // Contournement des soubassements bas sous les rampes & des culées de sortie Sky-Launch au sol
        if (p.pos.y < CANOPY_SPEC.launchLipY) {
          const pierBoxes = CANOPY_SPEC.aiPierBoxes;
          for (let i = 0; i < pierBoxes.length; i++) {
            const box = pierBoxes[i];
            const bSteer = steerAroundBoxObstacle(p.pos.x, p.pos.z, baseDirX, baseDirZ, box[0], box[1], box[2], box[3], box[4]);
            steerX += bSteer.sx;
            steerZ += bSteer.sz;
          }
          if (p.pos.y < 2.2) {
            const skirtBoxes = CANOPY_SPEC.aiRampSkirtBoxes;
            for (let i = 0; i < skirtBoxes.length; i++) {
              const box = skirtBoxes[i];
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
        const onBridgeBand = Math.abs(p.pos.x) >= sv.bridgeInnerX && Math.abs(p.pos.x) <= sv.bridgeOuterX && Math.abs(p.pos.z) <= sv.bridgeHalfZ;
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
    const vx = ((sLen > 0.01 ? steerX / sLen : baseDirX)) * speed;
    const vz = ((sLen > 0.01 ? steerZ / sLen : baseDirZ)) * speed;
    ctx.api.stepCharacterVerticalPhysics(p, vx, vz, dt, false);

    if (!p.onSlidePatch) {
      const desiredAngle = lookAtPos
        ? Math.atan2(lookAtPos.x - p.pos.x, lookAtPos.z - p.pos.z)
        : Math.atan2(vx, vz);
      p.facingAngle = lerpAngle(p.facingAngle, desiredAngle, 7 * dt);
    }
  } else {
    ctx.api.stepCharacterVerticalPhysics(p, 0, 0, dt, false);
    if (!p.onSlidePatch && lookAtPos) {
      const desiredAngle = Math.atan2(lookAtPos.x - p.pos.x, lookAtPos.z - p.pos.z);
      p.facingAngle = lerpAngle(p.facingAngle, desiredAngle, 6 * dt);
    }
  }
}

