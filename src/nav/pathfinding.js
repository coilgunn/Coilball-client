import { state } from '../state.js';
import {
  NEAR_OBSTACLE_PENALTY,
  OCTILE_D2_MINUS_D1,
  NEIGHBOR_DX,
  NEIGHBOR_DZ,
  NEIGHBOR_COST,
  navState,
  worldToGridX,
  worldToGridZ,
  cellCenterX,
  cellCenterZ,
  isCellWalkable
} from './shared.js';
import { syncDynamicObstaclesIfDirty, projectToNearestWalkable, hasGridLOS } from './grid.js';

function heapReset() {
  navState.heapSize = 0;
}

function heapSiftUp(pos) {
  const { heapNodes, heapF, heapPos } = navState;
  const node = heapNodes[pos];
  const f = heapF[pos];
  while (pos > 0) {
    const p = (pos - 1) >> 1;
    if (heapF[p] <= f) break;
    const pNode = heapNodes[p];
    heapNodes[pos] = pNode;
    heapF[pos] = heapF[p];
    heapPos[pNode] = pos;
    pos = p;
  }
  heapNodes[pos] = node;
  heapF[pos] = f;
  heapPos[node] = pos;
}

function heapSiftDown(pos) {
  const { heapNodes, heapF, heapPos, heapSize } = navState;
  const node = heapNodes[pos];
  const f = heapF[pos];
  const half = heapSize >> 1;
  while (pos < half) {
    let child = (pos << 1) + 1;
    const right = child + 1;
    if (right < heapSize && heapF[right] < heapF[child]) {
      child = right;
    }
    if (heapF[child] >= f) break;
    const cNode = heapNodes[child];
    heapNodes[pos] = cNode;
    heapF[pos] = heapF[child];
    heapPos[cNode] = pos;
    pos = child;
  }
  heapNodes[pos] = node;
  heapF[pos] = f;
  heapPos[node] = pos;
}

function heapPush(node, f) {
  const { heapNodes, heapF, heapPos } = navState;
  const pos = navState.heapSize++;
  heapNodes[pos] = node;
  heapF[pos] = f;
  heapPos[node] = pos;
  heapSiftUp(pos);
}

function heapUpdate(node, f) {
  const { heapNodes, heapF, heapPos, heapSize } = navState;
  const pos = heapPos[node];
  if (pos < 0 || pos >= heapSize || heapNodes[pos] !== node) {
    heapPush(node, f);
    return;
  }
  const oldF = heapF[pos];
  heapF[pos] = f;
  if (f < oldF) heapSiftUp(pos);
  else if (f > oldF) heapSiftDown(pos);
}

function heapPop() {
  const { heapNodes, heapF, heapPos } = navState;
  const top = heapNodes[0];
  heapPos[top] = -1;
  navState.heapSize--;
  if (navState.heapSize > 0) {
    const lastNode = heapNodes[navState.heapSize];
    heapNodes[0] = lastNode;
    heapF[0] = heapF[navState.heapSize];
    heapPos[lastNode] = 0;
    heapSiftDown(0);
  }
  return top;
}

function smoothPathLOS(rawPoints) {
  const n = rawPoints.length;
  if (n <= 2) return rawPoints;
  const out = [rawPoints[0]];
  let anchor = 0;
  while (anchor < n - 1) {
    let furthest = anchor + 1;
    const a = rawPoints[anchor];
    while (furthest + 1 < n && hasGridLOS(a.x, a.z, rawPoints[furthest + 1].x, rawPoints[furthest + 1].z)) {
      furthest++;
    }
    out.push(rawPoints[furthest]);
    anchor = furthest;
  }
  return out;
}

function octileHeuristic(ax, az, gxGoal, gzGoal) {
  const dx = ax > gxGoal ? ax - gxGoal : gxGoal - ax;
  const dz = az > gzGoal ? az - gzGoal : gzGoal - az;
  return dx > dz ? dx + OCTILE_D2_MINUS_D1 * dz : dz + OCTILE_D2_MINUS_D1 * dx;
}

function getMaxExpansions(options) {
  if (typeof options.maxExpansions === 'number') return options.maxExpansions;
  if (state.mapId === 'rift') return state.lowSpecMode ? 4500 : 9000;
  return state.lowSpecMode ? 2500 : 4500;
}

const _astarReq = {
  sx: 0,
  sz: 0,
  gxGoal: 0,
  gzGoal: 0,
  startIdx: 0,
  goalIdx: 0,
  startWalkX: 0,
  startWalkZ: 0,
  startWasProjected: false,
  projGoalX: 0,
  projGoalZ: 0,
  fastPath: null
};

const _astarRes = { reached: false, bestIdx: 0 };
const _revIndices = [];

function prepareAStarEndpoints(startX, startZ, goalX, goalZ) {
  const projGoal = projectToNearestWalkable(goalX, goalZ, startX, startZ);
  const directDist = Math.hypot(projGoal.x - startX, projGoal.z - startZ);
  if (directDist <= 0.45) {
    _astarReq.fastPath = [{ x: projGoal.x, z: projGoal.z, onCanopy: false }];
    return;
  }

  let sx = worldToGridX(startX);
  let sz = worldToGridZ(startZ);
  let startWalkX = startX;
  let startWalkZ = startZ;
  let startWasProjected = false;

  if (!isCellWalkable(sx, sz)) {
    const projStart = projectToNearestWalkable(startX, startZ, projGoal.x, projGoal.z);
    sx = projStart.gx;
    sz = projStart.gz;
    startWalkX = projStart.x;
    startWalkZ = projStart.z;
    startWasProjected = true;
  }

  // Fast-path ligne droite sans A*
  if (hasGridLOS(startWalkX, startWalkZ, projGoal.x, projGoal.z)) {
    if (startWasProjected && Math.hypot(startWalkX - startX, startWalkZ - startZ) > 0.35) {
      _astarReq.fastPath = [
        { x: startWalkX, z: startWalkZ, onCanopy: false },
        { x: projGoal.x, z: projGoal.z, onCanopy: false }
      ];
      return;
    }
    _astarReq.fastPath = [{ x: projGoal.x, z: projGoal.z, onCanopy: false }];
    return;
  }

  const cols = navState.cols;
  _astarReq.fastPath = null;
  _astarReq.sx = sx;
  _astarReq.sz = sz;
  _astarReq.gxGoal = projGoal.gx;
  _astarReq.gzGoal = projGoal.gz;
  _astarReq.startIdx = sz * cols + sx;
  _astarReq.goalIdx = projGoal.gz * cols + projGoal.gx;
  _astarReq.startWalkX = startWalkX;
  _astarReq.startWalkZ = startWalkZ;
  _astarReq.startWasProjected = startWasProjected;
  _astarReq.projGoalX = projGoal.x;
  _astarReq.projGoalZ = projGoal.z;
}

function initAStarSearch() {
  const { sx, sz, gxGoal, gzGoal, startIdx } = _astarReq;
  const { gScore, fScore, parentCell, openStamp, closedStamp } = navState;
  navState.searchStamp++;
  if (navState.searchStamp >= 65530) {
    openStamp.fill(0);
    closedStamp.fill(0);
    navState.searchStamp = 1;
  }
  const stamp = navState.searchStamp;
  heapReset();
  const h0 = octileHeuristic(sx, sz, gxGoal, gzGoal);
  gScore[startIdx] = 0;
  fScore[startIdx] = h0;
  parentCell[startIdx] = -1;
  openStamp[startIdx] = stamp;
  heapPush(startIdx, h0);
  return h0;
}

function runAStarSearch(maxExpansions) {
  const h0 = initAStarSearch();
  const { gxGoal, gzGoal, startIdx, goalIdx } = _astarReq;
  const { cols, rows, staticGrid, dynGrid, dynStamp, gScore, fScore, parentCell, openStamp, closedStamp } = navState;
  const stamp = navState.searchStamp;
  let bestIdx = startIdx;
  let bestH = h0;
  let reached = false;
  let expansions = 0;

  while (navState.heapSize > 0 && expansions < maxExpansions) {
    const cur = heapPop();
    if (cur === goalIdx) {
      bestIdx = cur;
      reached = true;
      break;
    }

    closedStamp[cur] = stamp;
    expansions++;

    const cx = cur % cols;
    const cz = (cur - cx) / cols;
    const curG = gScore[cur];

    for (let dir = 0; dir < 8; dir++) {
      const nx = cx + NEIGHBOR_DX[dir];
      const nz = cz + NEIGHBOR_DZ[dir];
      if (nx < 0 || nx >= cols || nz < 0 || nz >= rows) continue;

      const nIdx = nz * cols + nx;
      if (closedStamp[nIdx] === stamp) continue;
      if (staticGrid[nIdx] === 0 || dynGrid[nIdx] === dynStamp) continue;

      // Prévention stricte du corner-cutting en diagonale
      if (dir >= 4) {
        const adjA = cz * cols + nx;
        const adjB = nz * cols + cx;
        if (staticGrid[adjA] === 0 || dynGrid[adjA] === dynStamp || staticGrid[adjB] === 0 || dynGrid[adjB] === dynStamp) {
          continue;
        }
      }

      const penalty = staticGrid[nIdx] === 2 ? NEAR_OBSTACLE_PENALTY : 0;
      const tentativeG = curG + NEIGHBOR_COST[dir] + penalty;

      if (openStamp[nIdx] !== stamp) {
        const h = octileHeuristic(nx, nz, gxGoal, gzGoal);
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + h;
        parentCell[nIdx] = cur;
        openStamp[nIdx] = stamp;
        heapPush(nIdx, tentativeG + h);
        if (h < bestH) {
          bestH = h;
          bestIdx = nIdx;
        }
      } else if (tentativeG < gScore[nIdx]) {
        const h = fScore[nIdx] - gScore[nIdx];
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + h;
        parentCell[nIdx] = cur;
        heapUpdate(nIdx, tentativeG + h);
      }
    }
  }

  _astarRes.reached = reached;
  _astarRes.bestIdx = bestIdx;
}

function buildSmoothedAStarPath(startX, startZ) {
  const { startIdx, goalIdx, startWalkX, startWalkZ, startWasProjected, projGoalX, projGoalZ } = _astarReq;
  const { reached, bestIdx } = _astarRes;
  const { cols, parentCell } = navState;

  _revIndices.length = 0;
  let trace = reached ? goalIdx : bestIdx;
  while (trace !== -1 && trace !== startIdx) {
    _revIndices.push(trace);
    trace = parentCell[trace];
  }

  const rawPoints = [{ x: startWalkX, z: startWalkZ, onCanopy: false }];
  for (let i = _revIndices.length - 1; i >= 0; i--) {
    const idx = _revIndices[i];
    const gx = idx % cols;
    const gz = (idx - gx) / cols;
    rawPoints.push({ x: cellCenterX(gx), z: cellCenterZ(gz), onCanopy: false });
  }

  if (reached && rawPoints.length > 1) {
    rawPoints[rawPoints.length - 1] = { x: projGoalX, z: projGoalZ, onCanopy: false };
  }

  const smoothed = smoothPathLOS(rawPoints);

  // Retirer le point d'ancrage de départ pour ne renvoyer que les waypoints à parcourir
  const result = [];
  const startOffset = startWasProjected && Math.hypot(startWalkX - startX, startWalkZ - startZ) > 0.45 ? 0 : 1;
  for (let i = startOffset; i < smoothed.length; i++) {
    result.push({ x: smoothed[i].x, z: smoothed[i].z, onCanopy: false });
  }

  if (result.length === 0) {
    result.push({ x: projGoalX, z: projGoalZ, onCanopy: false });
  }
  return result;
}

export function computeMobaPath(startX, startZ, goalX, goalZ, options = {}) {
  syncDynamicObstaclesIfDirty();
  prepareAStarEndpoints(startX, startZ, goalX, goalZ);
  if (_astarReq.fastPath) return _astarReq.fastPath;
  runAStarSearch(getMaxExpansions(options));
  return buildSmoothedAStarPath(startX, startZ);
}
