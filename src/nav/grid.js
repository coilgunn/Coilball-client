import { FIELD, state, ctx } from '../state.js';
import { distSqPointToSegment2D } from '../world.js';
import {
  NAV_CELL_SIZE,
  NAV_ENTITY_RADIUS,
  LEAF_WALL_NAV_RADIUS,
  navState,
  worldToGridX,
  worldToGridZ,
  cellCenterX,
  cellCenterZ,
  isCellWalkable,
  isActiveGroundLeafWall,
  ensureNavBuffers
} from './shared.js';
import { isStaticPointWalkable, isDynamicPointBlocked } from './walkability.js';
import { rebuildCanopyGraph } from './canopy-graph.js';

function hasBlockedNeighbor(staticGrid, w, h, gx, gz) {
  const zMin = gz > 0 ? gz - 1 : 0;
  const zMax = gz < h - 1 ? gz + 1 : h - 1;
  const xMin = gx > 0 ? gx - 1 : 0;
  const xMax = gx < w - 1 ? gx + 1 : w - 1;
  for (let nz = zMin; nz <= zMax; nz++) {
    const nRow = nz * w;
    for (let nx = xMin; nx <= xMax; nx++) {
      if (staticGrid[nRow + nx] === 0) return true;
    }
  }
  return false;
}

function markStaticNearObstacles(staticGrid, w, h) {
  for (let gz = 0; gz < h; gz++) {
    const rowOff = gz * w;
    for (let gx = 0; gx < w; gx++) {
      const idx = rowOff + gx;
      if (staticGrid[idx] === 1 && hasBlockedNeighbor(staticGrid, w, h, gx, gz)) {
        staticGrid[idx] = 2;
      }
    }
  }
}

export function initNav() {
  ctx.api.rebuildNavGrid = rebuildNavGrid;
  ctx.api.markNavDynamicDirty = markNavDynamicDirty;
  if (FIELD && FIELD.width > 0 && FIELD.depth > 0) {
    rebuildNavGrid();
  }
}

export function rebuildNavGrid() {
  const w = Math.max(1, Math.ceil(FIELD.width / NAV_CELL_SIZE));
  const h = Math.max(1, Math.ceil(FIELD.depth / NAV_CELL_SIZE));
  navState.cols = w;
  navState.rows = h;
  navState.originX = -FIELD.width * 0.5;
  navState.originZ = -FIELD.depth * 0.5;
  navState.mapId = state.mapId || 'classic';

  ensureNavBuffers(w * h);
  const { staticGrid, originX, originZ } = navState;

  // Passe 1 : bake binaire statique (0 = bloqué, 1 = libre)
  for (let gz = 0; gz < h; gz++) {
    const wz = originZ + (gz + 0.5) * NAV_CELL_SIZE;
    const rowOff = gz * w;
    for (let gx = 0; gx < w; gx++) {
      const wx = originX + (gx + 0.5) * NAV_CELL_SIZE;
      staticGrid[rowOff + gx] = isStaticPointWalkable(wx, wz, NAV_ENTITY_RADIUS) ? 1 : 0;
    }
  }

  // Passe 2 : marquer à 2 les cellules libres adjacentes (8-voisinage) à un obstacle statique (+0.35)
  markStaticNearObstacles(staticGrid, w, h);

  rebuildCanopyGraph();
  navState.dynDirty = true;
  navState.navVersion++;
}

export function markNavDynamicDirty() {
  navState.dynDirty = true;
  navState.navVersion++;
}

export function getNavVersion() {
  return navState.navVersion;
}

function stampCapsuleDynamic(ax, az, bx, bz, radius) {
  const rSq = radius * radius;
  const minX = worldToGridX(Math.min(ax, bx) - radius - NAV_CELL_SIZE * 0.5);
  const maxX = worldToGridX(Math.max(ax, bx) + radius + NAV_CELL_SIZE * 0.5);
  const minZ = worldToGridZ(Math.min(az, bz) - radius - NAV_CELL_SIZE * 0.5);
  const maxZ = worldToGridZ(Math.max(az, bz) + radius + NAV_CELL_SIZE * 0.5);
  const { cols, staticGrid, dynGrid, dynStamp } = navState;
  for (let gz = minZ; gz <= maxZ; gz++) {
    const wz = cellCenterZ(gz);
    const rowOff = gz * cols;
    for (let gx = minX; gx <= maxX; gx++) {
      const idx = rowOff + gx;
      if (staticGrid[idx] === 0 || dynGrid[idx] === dynStamp) continue;
      const wx = cellCenterX(gx);
      if (distSqPointToSegment2D(wx, wz, ax, az, bx, bz) < rSq) {
        dynGrid[idx] = dynStamp;
      }
    }
  }
}

function stampDynamicWalls() {
  const toolWalls = ctx.entities.activeToolWalls;
  if (toolWalls && toolWalls.length > 0) {
    for (let i = 0; i < toolWalls.length; i++) {
      const tw = toolWalls[i];
      if (!tw || tw.onCanopy) continue;
      stampCapsuleDynamic(tw.ax, tw.az, tw.bx, tw.bz, (tw.thickness || 0.36) + NAV_ENTITY_RADIUS);
    }
  }

  const leafWalls = ctx.entities.activeLeafWalls;
  if (leafWalls && leafWalls.length > 0) {
    const rad = LEAF_WALL_NAV_RADIUS + NAV_ENTITY_RADIUS;
    for (let w = 0; w < leafWalls.length; w++) {
      const wall = leafWalls[w];
      if (!isActiveGroundLeafWall(wall)) continue;
      for (let i = 0; i < wall.nodes.length; i++) {
        const a = wall.nodes[i];
        const b = i < wall.nodes.length - 1 ? wall.nodes[i + 1] : a;
        stampCapsuleDynamic(a.x, a.z, b.x, b.z, rad);
      }
    }
  }
}

export function syncDynamicObstaclesIfDirty() {
  if (navState.cols === 0 || navState.rows === 0 || navState.mapId !== (state.mapId || 'classic')) {
    rebuildNavGrid();
  }
  if (!navState.dynDirty) return;
  navState.dynDirty = false;

  navState.dynStamp++;
  if (navState.dynStamp >= 65530) {
    navState.dynGrid.fill(0);
    navState.dynStamp = 1;
  }

  stampDynamicWalls();
}

export function isNavPointWalkable(x, z) {
  syncDynamicObstaclesIfDirty();
  return isStaticPointWalkable(x, z, NAV_ENTITY_RADIUS) && !isDynamicPointBlocked(x, z, NAV_ENTITY_RADIUS);
}

const _projState = {
  bestGx: -1,
  bestGz: -1,
  bestScore: Infinity,
  bestRawDistSq: Infinity,
  clampedX: 0,
  clampedZ: 0,
  fromX: 0,
  fromZ: 0,
  hasBias: false
};

function testProjectionCell(gx, gz) {
  if (!isCellWalkable(gx, gz)) return;
  const wx = cellCenterX(gx);
  const wz = cellCenterZ(gz);
  const dx = wx - _projState.clampedX;
  const dz = wz - _projState.clampedZ;
  const dSq = dx * dx + dz * dz;
  let score = dSq;
  if (_projState.hasBias) {
    const fx = wx - _projState.fromX;
    const fz = wz - _projState.fromZ;
    score += (fx * fx + fz * fz) * 0.08;
  }
  if (score < _projState.bestScore) {
    _projState.bestScore = score;
    _projState.bestRawDistSq = dSq;
    _projState.bestGx = gx;
    _projState.bestGz = gz;
  }
}

export function projectToNearestWalkable(x, z, fromX = NaN, fromZ = NaN) {
  syncDynamicObstaclesIfDirty();

  const maxX = FIELD.width * 0.5 - NAV_ENTITY_RADIUS;
  const maxZ = FIELD.depth * 0.5 - NAV_ENTITY_RADIUS;
  const clampedX = x < -maxX ? -maxX : x > maxX ? maxX : x;
  const clampedZ = z < -maxZ ? -maxZ : z > maxZ ? maxZ : z;

  const gx0 = worldToGridX(clampedX);
  const gz0 = worldToGridZ(clampedZ);
  if (
    isCellWalkable(gx0, gz0) &&
    isStaticPointWalkable(clampedX, clampedZ, NAV_ENTITY_RADIUS) &&
    !isDynamicPointBlocked(clampedX, clampedZ, NAV_ENTITY_RADIUS)
  ) {
    return { x: clampedX, z: clampedZ, gx: gx0, gz: gz0, projected: false };
  }

  _projState.bestGx = -1;
  _projState.bestGz = -1;
  _projState.bestScore = Infinity;
  _projState.bestRawDistSq = Infinity;
  _projState.clampedX = clampedX;
  _projState.clampedZ = clampedZ;
  _projState.fromX = fromX;
  _projState.fromZ = fromZ;
  _projState.hasBias = Number.isFinite(fromX) && Number.isFinite(fromZ);

  if (isCellWalkable(gx0, gz0)) {
    testProjectionCell(gx0, gz0);
  }

  let maxRing = Math.min(48, Math.max(navState.cols, navState.rows));
  for (let r = 1; r <= maxRing; r++) {
    const xMin = gx0 - r;
    const xMax = gx0 + r;
    const zMin = gz0 - r;
    const zMax = gz0 + r;

    for (let gx = xMin; gx <= xMax; gx++) {
      testProjectionCell(gx, zMin);
      testProjectionCell(gx, zMax);
    }
    for (let gz = zMin + 1; gz <= zMax - 1; gz++) {
      testProjectionCell(xMin, gz);
      testProjectionCell(xMax, gz);
    }

    if (_projState.bestGx !== -1) {
      // Continuer au plus quelques anneaux pour garantir l'optimum euclidien malgré le carré Chebyshev
      const euclideanLimit = Math.ceil(Math.sqrt(_projState.bestRawDistSq) / NAV_CELL_SIZE) + 1;
      if (euclideanLimit < maxRing) maxRing = euclideanLimit;
    }
  }

  if (_projState.bestGx !== -1) {
    return {
      x: cellCenterX(_projState.bestGx),
      z: cellCenterZ(_projState.bestGz),
      gx: _projState.bestGx,
      gz: _projState.bestGz,
      projected: true
    };
  }

  return { x: clampedX, z: clampedZ, gx: gx0, gz: gz0, projected: true };
}

export function hasGridLOS(x0, z0, x1, z1) {
  syncDynamicObstaclesIfDirty();

  let gx = worldToGridX(x0);
  let gz = worldToGridZ(z0);
  const gx1 = worldToGridX(x1);
  const gz1 = worldToGridZ(z1);

  if (!isCellWalkable(gx, gz) || !isCellWalkable(gx1, gz1)) return false;
  if (gx === gx1 && gz === gz1) return true;

  const { cols, rows, originX, originZ } = navState;
  const fx0 = Math.max(0, Math.min(cols - 1e-4, (x0 - originX) / NAV_CELL_SIZE));
  const fz0 = Math.max(0, Math.min(rows - 1e-4, (z0 - originZ) / NAV_CELL_SIZE));
  const fx1 = Math.max(0, Math.min(cols - 1e-4, (x1 - originX) / NAV_CELL_SIZE));
  const fz1 = Math.max(0, Math.min(rows - 1e-4, (z1 - originZ) / NAV_CELL_SIZE));

  const dx = fx1 - fx0;
  const dz = fz1 - fz0;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1.0 / dx) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1.0 / dz) : Infinity;

  let tMaxX =
    stepX > 0 ? (Math.floor(fx0) + 1.0 - fx0) * tDeltaX : stepX < 0 ? (fx0 - Math.floor(fx0)) * tDeltaX : Infinity;
  let tMaxZ =
    stepZ > 0 ? (Math.floor(fz0) + 1.0 - fz0) * tDeltaZ : stepZ < 0 ? (fz0 - Math.floor(fz0)) * tDeltaZ : Infinity;

  const maxSteps = Math.abs(gx1 - gx) + Math.abs(gz1 - gz) + 4;
  for (let s = 0; s < maxSteps; s++) {
    if (gx === gx1 && gz === gz1) return true;
    const diff = tMaxX - tMaxZ;
    if (Math.abs(diff) < 1e-6) {
      // Passage exact par un coin : les 2 cellules adjacentes ET la diagonale doivent être libres
      const nx = gx + stepX;
      const nz = gz + stepZ;
      if (!isCellWalkable(nx, gz) || !isCellWalkable(gx, nz) || !isCellWalkable(nx, nz)) {
        return false;
      }
      gx = nx;
      gz = nz;
      tMaxX += tDeltaX;
      tMaxZ += tDeltaZ;
    } else if (diff < 0) {
      gx += stepX;
      tMaxX += tDeltaX;
      if (!isCellWalkable(gx, gz)) return false;
    } else {
      gz += stepZ;
      tMaxZ += tDeltaZ;
      if (!isCellWalkable(gx, gz)) return false;
    }
  }
  return gx === gx1 && gz === gz1;
}
