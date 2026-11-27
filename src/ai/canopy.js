import { ctx } from '../state.js';
import { CANOPY_SPEC } from '../world.js';

const THREE = ctx.THREE;
const CANOPY_EXIT_IDS = ['nLaunchExit', 'sLaunchExit', 'wRampExit', 'eRampExit'];

function buildCanopyNodes(spec) {
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
  return { nodes, nodeIndex };
}

function connectCanopyEdge(graph, aId, bId, oneWay = false) {
  const a = graph.nodeIndex.get(aId);
  const b = graph.nodeIndex.get(bId);
  if (a === undefined || b === undefined) return;
  const w = Math.hypot(graph.nodes[b].x - graph.nodes[a].x, graph.nodes[b].z - graph.nodes[a].z);
  graph.dist[a][b] = w;
  graph.nextHop[a][b] = b;
  if (!oneWay) {
    graph.dist[b][a] = w;
    graph.nextHop[b][a] = a;
  }
}

function runCanopyFloydWarshall(dist, nextHop, n) {
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
}

function rebuildCanopyRouter(router, spec = CANOPY_SPEC) {
  if (!spec || !Array.isArray(spec.decks)) {
    router.nodes = [];
    router.nodeIndex = new Map();
    router.dist = [];
    router.nextHop = [];
    return router;
  }

  const { nodes, nodeIndex } = buildCanopyNodes(spec);
  const n = nodes.length;
  const dist = Array.from({ length: n }, () => new Float64Array(n).fill(Infinity));
  const nextHop = Array.from({ length: n }, () => new Int16Array(n).fill(-1));
  for (let i = 0; i < n; i++) {
    dist[i][i] = 0;
    nextHop[i][i] = i;
  }

  const graph = { nodes, nodeIndex, dist, nextHop };
  spec.bridges.forEach((b) => connectCanopyEdge(graph, b.from, b.to, false));
  connectCanopyEdge(graph, 'westGate', 'wRampExit', false);
  connectCanopyEdge(graph, 'eastGate', 'eRampExit', false);
  connectCanopyEdge(graph, 'northHub', 'nLaunchExit', true);
  connectCanopyEdge(graph, 'southHub', 'sLaunchExit', true);

  runCanopyFloydWarshall(dist, nextHop, n);

  router.nodes = nodes;
  router.nodeIndex = nodeIndex;
  router.dist = dist;
  router.nextHop = nextHop;
  return router;
}

function selectCanopyStartCandidates(curSurf) {
  if (curSurf.deckId) return [curSurf.deckId];
  if (curSurf.bridge) return [curSurf.bridge.from, curSurf.bridge.to];
  if (curSurf.zone === 'westRamp') return ['westGate', 'wRampExit'];
  return ['eastGate', 'eRampExit'];
}

function findBestCanopyExit(router, p, startCandidates, gx, gz) {
  const { nodes, nodeIndex, dist } = router;
  let bestStartIdx = nodeIndex.get(startCandidates[0]);
  let bestExitIdx = nodeIndex.get(CANOPY_EXIT_IDS[0]);
  let bestScore = Infinity;

  for (let si = 0; si < startCandidates.length; si++) {
    const sIdx = nodeIndex.get(startCandidates[si]);
    if (sIdx === undefined) continue;
    const sn = nodes[sIdx];
    const toStart = Math.hypot(sn.x - p.pos.x, sn.z - p.pos.z);

    for (let ei = 0; ei < CANOPY_EXIT_IDS.length; ei++) {
      const eIdx = nodeIndex.get(CANOPY_EXIT_IDS[ei]);
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
  return { bestStartIdx, bestExitIdx };
}

function getCanopySteerTarget(router, p, curSurf, targetPos) {
  if (!curSurf) return targetPos;
  if (curSurf.zone === 'northLaunch' || curSurf.zone === 'southLaunch') {
    const outZ =
      curSurf.zone === 'northLaunch' ? -CANOPY_SPEC.launchOuterZ : CANOPY_SPEC.launchOuterZ;
    return new THREE.Vector3(0, CANOPY_SPEC.launchLipY, outZ);
  }

  const { nodes, nodeIndex, nextHop } = router;
  const gx = targetPos ? targetPos.x : p.pos.x;
  const gz = targetPos ? targetPos.z : p.pos.z;
  const startCandidates = selectCanopyStartCandidates(curSurf);
  const { bestStartIdx, bestExitIdx } = findBestCanopyExit(router, p, startCandidates, gx, gz);

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

export const CANOPY_AI_ROUTER = {
  nodes: [],
  nodeIndex: new Map(),
  dist: [],
  nextHop: [],
  exitIds: CANOPY_EXIT_IDS,
  rebuild(spec = CANOPY_SPEC) {
    return rebuildCanopyRouter(CANOPY_AI_ROUTER, spec);
  },
  getSteerTarget(p, curSurf, targetPos) {
    return getCanopySteerTarget(CANOPY_AI_ROUTER, p, curSurf, targetPos);
  }
};
