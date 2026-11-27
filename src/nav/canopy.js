import { CANOPY_SPEC, getCanopySurfaceY } from '../world.js';
import { CANOPY_EXIT_IDS, canopyGraph } from './shared.js';
import { syncDynamicObstaclesIfDirty, projectToNearestWalkable } from './grid.js';
import { computeMobaPath } from './pathfinding.js';
import { getCanopyNodesForSurface, buildCanopyHopWaypoints } from './canopy-graph.js';

function appendHopWaypoints(waypoints, hops, startX, startZ) {
  for (let i = 0; i < hops.length; i++) {
    const h = hops[i];
    if (i === 0 && Math.hypot(h.x - startX, h.z - startZ) < 1.8) continue;
    waypoints.push({ x: h.x, z: h.z, onCanopy: true });
  }
}

function routeGroundToCanopy(startX, startZ, goalX, goalZ) {
  const rampEntries = [
    { enterX: -(CANOPY_SPEC.ascentOuterX + 0.6), attachX: -(CANOPY_SPEC.ascentAttachMinX + 0.5) },
    { enterX: CANOPY_SPEC.ascentOuterX + 0.6, attachX: CANOPY_SPEC.ascentAttachMinX + 0.5 }
  ];
  const dW = Math.hypot(startX - rampEntries[0].enterX, startZ) + Math.hypot(goalX - rampEntries[0].attachX, goalZ);
  const dE = Math.hypot(startX - rampEntries[1].enterX, startZ) + Math.hypot(goalX - rampEntries[1].attachX, goalZ);
  const chosenRamp = dE < dW ? rampEntries[1] : rampEntries[0];

  const groundPart = computeMobaPath(startX, startZ, chosenRamp.enterX, 0);
  const attachSurf = getCanopySurfaceY(chosenRamp.attachX, 0);
  const canopyPart = attachSurf
    ? routeCanopyPath(chosenRamp.attachX, 0, goalX, goalZ, true)
    : [{ x: goalX, z: goalZ, onCanopy: true }];

  return [...groundPart, { x: chosenRamp.attachX, z: 0, onCanopy: false }, ...canopyPart];
}

function routeFromLaunchSlide(startSurf, goalX, goalZ, goalOnCanopy) {
  const signZ = startSurf.zone === 'northLaunch' ? -1 : 1;
  const out = [{ x: 0, z: signZ * CANOPY_SPEC.launchOuterZ, onCanopy: true }];
  if (!goalOnCanopy) {
    const groundPart = computeMobaPath(0, signZ * CANOPY_SPEC.launchLandingZ, goalX, goalZ);
    for (let i = 0; i < groundPart.length; i++) out.push(groundPart[i]);
  }
  return out;
}

function findNearestCanopyDeckId(goalX, goalZ) {
  let nearestDeckId = null;
  let bestD = Infinity;
  for (let i = 0; i < CANOPY_SPEC.decks.length; i++) {
    const d = CANOPY_SPEC.decks[i];
    const dd = Math.hypot(d.cx - goalX, d.cz - goalZ);
    if (dd < bestD) {
      bestD = dd;
      nearestDeckId = d.id;
    }
  }
  return nearestDeckId;
}

function selectBestCanopyPair(startIds, goalIds, startX, startZ, goalX, goalZ) {
  const { nodes, nodeIndex, dist } = canopyGraph;
  let bestStartIdx = -1;
  let bestGoalIdx = -1;
  let bestCost = Infinity;

  for (let si = 0; si < startIds.length; si++) {
    const sIdx = nodeIndex.get(startIds[si]);
    if (sIdx === undefined) continue;
    const toS = Math.hypot(nodes[sIdx].x - startX, nodes[sIdx].z - startZ);
    for (let gi = 0; gi < goalIds.length; gi++) {
      const gIdx = nodeIndex.get(goalIds[gi]);
      if (gIdx === undefined) continue;
      const pathD = dist[sIdx][gIdx];
      if (!Number.isFinite(pathD)) continue;
      const fromG = Math.hypot(goalX - nodes[gIdx].x, goalZ - nodes[gIdx].z);
      const total = toS + pathD + fromG;
      if (total < bestCost) {
        bestCost = total;
        bestStartIdx = sIdx;
        bestGoalIdx = gIdx;
      }
    }
  }

  return { bestStartIdx, bestGoalIdx };
}

function routeCanopyToCanopy(startSurf, startX, startZ, goalX, goalZ) {
  const goalSurf = getCanopySurfaceY(goalX, goalZ);
  if (goalSurf && goalSurf.zone === startSurf.zone) {
    return [{ x: goalX, z: goalZ, onCanopy: true }];
  }

  const startIds = getCanopyNodesForSurface(startSurf);
  const goalIds = goalSurf ? getCanopyNodesForSurface(goalSurf) : [];
  if (goalIds.length === 0) {
    const nearestDeckId = findNearestCanopyDeckId(goalX, goalZ);
    if (nearestDeckId) goalIds.push(nearestDeckId);
  }

  const { bestStartIdx, bestGoalIdx } = selectBestCanopyPair(startIds, goalIds, startX, startZ, goalX, goalZ);
  if (bestStartIdx === -1 || bestGoalIdx === -1) {
    return [{ x: goalX, z: goalZ, onCanopy: true }];
  }

  const hops = buildCanopyHopWaypoints(bestStartIdx, bestGoalIdx);
  const waypoints = [];
  appendHopWaypoints(waypoints, hops, startX, startZ);
  if (goalSurf) {
    waypoints.push({ x: goalX, z: goalZ, onCanopy: true });
  }
  return waypoints.length > 0 ? waypoints : [{ x: goalX, z: goalZ, onCanopy: true }];
}

function selectBestCanopyExit(startIds, startX, startZ, projGoal) {
  const { nodes, nodeIndex, dist } = canopyGraph;
  let bestStartIdx = -1;
  let bestExitIdx = -1;
  let bestScore = Infinity;

  for (let si = 0; si < startIds.length; si++) {
    const sIdx = nodeIndex.get(startIds[si]);
    if (sIdx === undefined) continue;
    const toStart = Math.hypot(nodes[sIdx].x - startX, nodes[sIdx].z - startZ);
    for (let ei = 0; ei < CANOPY_EXIT_IDS.length; ei++) {
      const eIdx = nodeIndex.get(CANOPY_EXIT_IDS[ei]);
      if (eIdx === undefined) continue;
      const pathLen = dist[sIdx][eIdx];
      if (!Number.isFinite(pathLen)) continue;
      const exitNode = nodes[eIdx];
      const afterLand = Math.hypot(projGoal.x - exitNode.landX, projGoal.z - exitNode.landZ);
      const isLaunch = exitNode.id === 'nLaunchExit' || exitNode.id === 'sLaunchExit';
      const launchBonus = isLaunch && Math.abs(projGoal.z) > 22 ? -4.5 : 0;
      const score = toStart + pathLen + afterLand + launchBonus;
      if (score < bestScore) {
        bestScore = score;
        bestStartIdx = sIdx;
        bestExitIdx = eIdx;
      }
    }
  }

  return { bestStartIdx, bestExitIdx };
}

function routeCanopyToGround(startSurf, startX, startZ, goalX, goalZ) {
  const projGoal = projectToNearestWalkable(goalX, goalZ, startX, startZ);
  const startIds = getCanopyNodesForSurface(startSurf);
  const { bestStartIdx, bestExitIdx } = selectBestCanopyExit(startIds, startX, startZ, projGoal);

  if (bestStartIdx === -1 || bestExitIdx === -1) {
    return computeMobaPath(startX, startZ, projGoal.x, projGoal.z);
  }

  const exitNode = canopyGraph.nodes[bestExitIdx];
  const hops = buildCanopyHopWaypoints(bestStartIdx, bestExitIdx);
  const waypoints = [];
  appendHopWaypoints(waypoints, hops, startX, startZ);

  // Suite du trajet au sol à partir du point de sortie / réception Sky-Launch
  const groundTail = computeMobaPath(exitNode.landX, exitNode.landZ, projGoal.x, projGoal.z);
  for (let i = 0; i < groundTail.length; i++) {
    waypoints.push(groundTail[i]);
  }
  return waypoints;
}

export function routeCanopyPath(startX, startZ, goalX, goalZ, goalOnCanopy = false) {
  syncDynamicObstaclesIfDirty();

  if (!CANOPY_SPEC || !CANOPY_SPEC.hasCanopy || canopyGraph.nodes.length === 0) {
    return computeMobaPath(startX, startZ, goalX, goalZ);
  }

  const startSurf = getCanopySurfaceY(startX, startZ);
  if (!startSurf) {
    return goalOnCanopy ? routeGroundToCanopy(startX, startZ, goalX, goalZ) : computeMobaPath(startX, startZ, goalX, goalZ);
  }

  if (startSurf.zone === 'northLaunch' || startSurf.zone === 'southLaunch') {
    return routeFromLaunchSlide(startSurf, goalX, goalZ, goalOnCanopy);
  }

  return goalOnCanopy
    ? routeCanopyToCanopy(startSurf, startX, startZ, goalX, goalZ)
    : routeCanopyToGround(startSurf, startX, startZ, goalX, goalZ);
}
