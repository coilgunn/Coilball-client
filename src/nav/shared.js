import { CANOPY_SPEC } from '../world.js';

export const NAV_CELL_SIZE = 1.0;
export const NAV_ENTITY_RADIUS = 0.90; // 0.72 physique + 0.18 marge anti-frottement
export const LEAF_WALL_NAV_RADIUS = 0.85;
export const NEAR_OBSTACLE_PENALTY = 0.35;
export const SQRT2 = Math.SQRT2;
export const OCTILE_D2_MINUS_D1 = Math.SQRT2 - 1.0;

export const CANOPY_EXIT_IDS = ['nLaunchExit', 'sLaunchExit', 'wRampExit', 'eRampExit'];
export const NEIGHBOR_DX = [1, -1, 0, 0, 1, 1, -1, -1];
export const NEIGHBOR_DZ = [0, 0, 1, -1, 1, -1, 1, -1];
export const NEIGHBOR_COST = [1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2];

export const navState = {
  cols: 0,
  rows: 0,
  cellCount: 0,
  originX: 0,
  originZ: 0,
  mapId: '',
  staticGrid: new Uint8Array(0), // 0 = bloqué, 1 = libre, 2 = libre proche obstacle (+0.35)
  dynGrid: new Uint16Array(0),   // stamp == dynStamp => bloqué dynamiquement
  dynStamp: 1,
  dynDirty: true,
  navVersion: 0,
  gScore: new Float32Array(0),
  fScore: new Float32Array(0),
  parentCell: new Int32Array(0),
  openStamp: new Uint16Array(0),
  closedStamp: new Uint16Array(0),
  searchStamp: 1,
  heapNodes: new Int32Array(0),
  heapF: new Float32Array(0),
  heapPos: new Int32Array(0),
  heapSize: 0
};

export const canopyGraph = {
  nodes: [],
  nodeIndex: new Map(),
  dist: [],
  nextHop: []
};

const _navBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

export function clampInt(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function worldToGridX(x) {
  return clampInt(Math.floor((x - navState.originX) / NAV_CELL_SIZE), 0, navState.cols - 1);
}

export function worldToGridZ(z) {
  return clampInt(Math.floor((z - navState.originZ) / NAV_CELL_SIZE), 0, navState.rows - 1);
}

export function cellCenterX(gx) {
  return navState.originX + (gx + 0.5) * NAV_CELL_SIZE;
}

export function cellCenterZ(gz) {
  return navState.originZ + (gz + 0.5) * NAV_CELL_SIZE;
}

export function setNavBox(minX, maxX, minZ, maxZ) {
  _navBox.minX = minX;
  _navBox.maxX = maxX;
  _navBox.minZ = minZ;
  _navBox.maxZ = maxZ;
  return _navBox;
}

export function pointNearAABB(x, z, box, radius) {
  const cx = x < box.minX ? box.minX : x > box.maxX ? box.maxX : x;
  const cz = z < box.minZ ? box.minZ : z > box.maxZ ? box.maxZ : z;
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}

export function isCellWalkable(gx, gz) {
  const { cols, rows, staticGrid, dynGrid, dynStamp } = navState;
  if (gx < 0 || gx >= cols || gz < 0 || gz >= rows) return false;
  const idx = gz * cols + gx;
  return staticGrid[idx] !== 0 && dynGrid[idx] !== dynStamp;
}

export function isActiveGroundLeafWall(wall) {
  if (!wall || wall.phase !== 'grown' || !wall.nodes || wall.nodes.length === 0) return false;
  if (CANOPY_SPEC && CANOPY_SPEC.hasCanopy && (wall.nodes[0].y || 0) >= 3.8) return false;
  return true;
}

export function ensureNavBuffers(count) {
  if (navState.cellCount === count && navState.staticGrid.length === count) return;
  navState.cellCount = count;
  navState.staticGrid = new Uint8Array(count);
  navState.dynGrid = new Uint16Array(count);
  navState.dynStamp = 1;
  navState.gScore = new Float32Array(count);
  navState.fScore = new Float32Array(count);
  navState.parentCell = new Int32Array(count);
  navState.openStamp = new Uint16Array(count);
  navState.closedStamp = new Uint16Array(count);
  navState.searchStamp = 1;
  navState.heapNodes = new Int32Array(count);
  navState.heapF = new Float32Array(count);
  navState.heapPos = new Int32Array(count);
}
