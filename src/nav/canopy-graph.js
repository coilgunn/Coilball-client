import { CANOPY_SPEC } from '../world.js';
import { canopyGraph } from './shared.js';

function addCanopyGraphNodes(nodes, nodeIndex) {
  const addNode = (id, x, z, y, landX = x, landZ = z) => {
    nodeIndex.set(id, nodes.length);
    nodes.push({ id, x, z, y, landX, landZ });
  };

  for (let i = 0; i < CANOPY_SPEC.decks.length; i++) {
    const d = CANOPY_SPEC.decks[i];
    addNode(d.id, d.cx, d.cz, CANOPY_SPEC.deckY);
  }
  addNode('wRampExit', -(CANOPY_SPEC.ascentOuterX + 2.0), 0, 0);
  addNode('eRampExit', CANOPY_SPEC.ascentOuterX + 2.0, 0, 0);
  addNode('nLaunchExit', 0, -CANOPY_SPEC.launchOuterZ, CANOPY_SPEC.launchLipY, 0, -CANOPY_SPEC.launchLandingZ);
  addNode('sLaunchExit', 0, CANOPY_SPEC.launchOuterZ, CANOPY_SPEC.launchLipY, 0, CANOPY_SPEC.launchLandingZ);
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

function runFloydWarshall(dist, nextHop, n) {
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const dik = dist[i][k];
      if (!Number.isFinite(dik)) continue;
      for (let j = 0; j < n; j++) {
        const alt = dik + dist[k][j];
        if (alt < dist[i][j]) {
          dist[i][j] = alt;
          nextHop[i][j] = nextHop[i][k];
        }
      }
    }
  }
}

export function rebuildCanopyGraph() {
  canopyGraph.nodes = [];
  canopyGraph.nodeIndex = new Map();
  canopyGraph.dist = [];
  canopyGraph.nextHop = [];

  if (!CANOPY_SPEC || !CANOPY_SPEC.hasCanopy || !Array.isArray(CANOPY_SPEC.decks)) {
    return;
  }

  const nodes = [];
  const nodeIndex = new Map();
  addCanopyGraphNodes(nodes, nodeIndex);

  const n = nodes.length;
  const dist = Array.from({ length: n }, () => new Float64Array(n).fill(Infinity));
  const nextHop = Array.from({ length: n }, () => new Int16Array(n).fill(-1));
  for (let i = 0; i < n; i++) {
    dist[i][i] = 0;
    nextHop[i][i] = i;
  }

  const graph = { nodes, nodeIndex, dist, nextHop };
  const bridges = CANOPY_SPEC.bridges || [];
  for (let i = 0; i < bridges.length; i++) {
    connectCanopyEdge(graph, bridges[i].from, bridges[i].to, false);
  }
  connectCanopyEdge(graph, 'westGate', 'wRampExit', false);
  connectCanopyEdge(graph, 'eastGate', 'eRampExit', false);
  connectCanopyEdge(graph, 'northHub', 'nLaunchExit', true);
  connectCanopyEdge(graph, 'southHub', 'sLaunchExit', true);

  runFloydWarshall(dist, nextHop, n);

  canopyGraph.nodes = nodes;
  canopyGraph.nodeIndex = nodeIndex;
  canopyGraph.dist = dist;
  canopyGraph.nextHop = nextHop;
}

export function getCanopyNodesForSurface(surf) {
  if (!surf) return [];
  if (surf.deckId) return [surf.deckId];
  if (surf.bridge) return [surf.bridge.from, surf.bridge.to];
  if (surf.zone === 'westRamp') return ['westGate', 'wRampExit'];
  if (surf.zone === 'eastRamp') return ['eastGate', 'eRampExit'];
  if (surf.zone === 'northLaunch') return ['northHub', 'nLaunchExit'];
  if (surf.zone === 'southLaunch') return ['southHub', 'sLaunchExit'];
  return [];
}

export function buildCanopyHopWaypoints(fromIdx, toIdx) {
  const { nodes, nextHop } = canopyGraph;
  const out = [];
  if (fromIdx === undefined || toIdx === undefined || fromIdx < 0 || toIdx < 0) return out;
  let cur = fromIdx;
  let guard = 0;
  out.push(nodes[cur]);
  while (cur !== toIdx && guard++ < 32) {
    const nxt = nextHop[cur] ? nextHop[cur][toIdx] : -1;
    if (nxt === -1 || nxt === cur) break;
    cur = nxt;
    out.push(nodes[cur]);
  }
  return out;
}
