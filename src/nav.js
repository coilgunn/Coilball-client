// ============================================================================
// COILBALL 3D — NAVIGATION & PATHFINDING MOBA (GRILLE 2D A* + CANOPÉE)
// ============================================================================

import { FIELD, state, ctx } from './state.js';
import {
  PARK_LANDMARKS,
  CANOPY_SPEC,
  JUNGLE_OBSTACLES,
  JUNGLE_WALLS,
  distSqPointToSegment2D,
  getTerrainY,
  getCanopySurfaceY,
  getStructureSurfaceY,
  pushOutAABB
} from './world.js';

export const NAV_CELL_SIZE = 1.0;
export const NAV_ENTITY_RADIUS = 0.90; // 0.72 physique + 0.18 marge anti-frottement
const LEAF_WALL_NAV_RADIUS = 0.85;
const NEAR_OBSTACLE_PENALTY = 0.35;
const SQRT2 = Math.SQRT2;
const OCTILE_D2_MINUS_D1 = Math.SQRT2 - 1.0;

// --- ÉTAT DE LA GRILLE 2D STATIQUE + OVERLAY DYNAMIQUE ---
let navCols = 0;
let navRows = 0;
let navCellCount = 0;
let navOriginX = 0;
let navOriginZ = 0;
let navMapId = '';

let staticGrid = new Uint8Array(0); // 0 = bloqué, 1 = libre, 2 = libre proche obstacle (+0.35)
let dynGrid = new Uint16Array(0);   // stamp == dynStamp => bloqué dynamiquement
let dynStamp = 1;
let dynDirty = true;
let navVersion = 0;

// --- TAMPONS A* PRÉ-ALLOUÉS (ZÉRO ALLOCATION GC PAR REQUÊTE) ---
let gScore = new Float32Array(0);
let fScore = new Float32Array(0);
let parentCell = new Int32Array(0);
let openStamp = new Uint16Array(0);
let closedStamp = new Uint16Array(0);
let searchStamp = 1;

// Min-Heap binaire indexé
let heapNodes = new Int32Array(0);
let heapF = new Float32Array(0);
let heapPos = new Int32Array(0);
let heapSize = 0;

// --- GRAPHE CANOPÉE (CLASSIC) ---
const CANOPY_EXIT_IDS = ['nLaunchExit', 'sLaunchExit', 'wRampExit', 'eRampExit'];
const canopyGraph = {
  nodes: [],
  nodeIndex: new Map(),
  dist: [],
  nextHop: []
};

// Référence non mutante vers pushOutAABB pour compatibilité d'import et géométrie AABB
const _unusedRefs = { getStructureSurfaceY, pushOutAABB };
void _unusedRefs;

// --- HELPERS GÉOMÉTRIQUES ---
function clampInt(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function worldToGridX(x) {
  return clampInt(Math.floor((x - navOriginX) / NAV_CELL_SIZE), 0, navCols - 1);
}

function worldToGridZ(z) {
  return clampInt(Math.floor((z - navOriginZ) / NAV_CELL_SIZE), 0, navRows - 1);
}

function cellCenterX(gx) {
  return navOriginX + (gx + 0.5) * NAV_CELL_SIZE;
}

function cellCenterZ(gz) {
  return navOriginZ + (gz + 0.5) * NAV_CELL_SIZE;
}

function pointNearAABB(x, z, minX, maxX, minZ, maxZ, radius) {
  const cx = x < minX ? minX : x > maxX ? maxX : x;
  const cz = z < minZ ? minZ : z > maxZ ? maxZ : z;
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}

function isStaticPointWalkable(x, z, rNav = NAV_ENTITY_RADIUS) {
  const maxX = FIELD.width * 0.5 - rNav;
  const maxZ = FIELD.depth * 0.5 - rNav;
  if (x < -maxX || x > maxX || z < -maxZ || z > maxZ) return false;

  const yRef = getTerrainY(x, z);

  // 1. Murs capsules (Faille de l'Invocateur)
  for (let i = 0; i < JUNGLE_WALLS.length; i++) {
    const w = JUNGLE_WALLS[i];
    if (yRef >= (w.height || 3.85)) continue;
    const minDist = w.radius + rNav;
    if (distSqPointToSegment2D(x, z, w.ax, w.az, w.bx, w.bz) < minDist * minDist) {
      return false;
    }
  }

  // 2. Obstacles circulaires (piliers, bosquets, gazebo, chute d'eau)
  for (let i = 0; i < JUNGLE_OBSTACLES.length; i++) {
    const obs = JUNGLE_OBSTACLES[i];
    const obsMaxY = obs.kind === 'gazebo' ? 999 : obs.kind === 'waterfall' ? 25.0 : 3.8;
    if (yRef >= obsMaxY) continue;
    const minDist = obs.radius + rNav;
    const dx = x - obs.x;
    const dz = z - obs.z;
    if (dx * dx + dz * dz < minDist * minDist) {
      return false;
    }
  }

  // 3. Repères & plans d'eau spécifiques à chaque parc
  const mapId = state.mapId;
  if (mapId === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    if (pointNearAABB(x, z, sv.chaletMinX, sv.chaletMaxX, sv.chaletMinZ, sv.chaletMaxZ, rNav)) {
      return false;
    }
    const ax = Math.abs(x);
    const az = Math.abs(z);
    const onSvBridge = ax >= sv.bridgeInnerX && ax <= sv.bridgeOuterX && az <= sv.bridgeHalfZ;
    if (onSvBridge) {
      if (az > sv.bridgeHalfZ - rNav) return false;
    } else {
      if (
        pointNearAABB(x, z, -sv.bridgeOuterX, -sv.bridgeInnerX, -sv.bridgeParapetOuterZ, -sv.bridgeHalfZ, rNav) ||
        pointNearAABB(x, z, -sv.bridgeOuterX, -sv.bridgeInnerX, sv.bridgeHalfZ, sv.bridgeParapetOuterZ, rNav) ||
        pointNearAABB(x, z, sv.bridgeInnerX, sv.bridgeOuterX, -sv.bridgeParapetOuterZ, -sv.bridgeHalfZ, rNav) ||
        pointNearAABB(x, z, sv.bridgeInnerX, sv.bridgeOuterX, sv.bridgeHalfZ, sv.bridgeParapetOuterZ, rNav)
      ) {
        return false;
      }
      const inRx = Math.max(1, sv.islandRx - rNav);
      const inRz = Math.max(1, sv.islandRz - rNav);
      const outRx = sv.pondRx + rNav;
      const outRz = sv.pondRz + rNav;
      const dIn = Math.hypot(x / inRx, z / inRz);
      const dOut = Math.hypot(x / outRx, z / outRz);
      if (dIn > 1.0 && dOut < 1.0) return false;
    }
  } else if (mapId === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    const ax = Math.abs(x);
    const az = Math.abs(z);
    const onBridge = ax <= lf.bridgeHalfX && az <= lf.bridgeHalfZ;
    if (onBridge) {
      if (ax > lf.bridgeHalfX - rNav) return false;
    } else {
      if (
        pointNearAABB(x, z, -lf.bridgeParapetOuterX, -lf.bridgeHalfX, -lf.bridgeHalfZ, lf.bridgeHalfZ, rNav) ||
        pointNearAABB(x, z, lf.bridgeHalfX, lf.bridgeParapetOuterX, -lf.bridgeHalfZ, lf.bridgeHalfZ, rNav)
      ) {
        return false;
      }
      const ex = x / (lf.pondRx + rNav);
      const ez = z / (lf.pondRz + rNav);
      if (ex * ex + ez * ez < 1.0) return false;
    }
  } else if (mapId === 'mont-royal') {
    const mr = PARK_LANDMARKS.montRoyal;
    const minDist = mr.crossRadius + rNav;
    const dx = x - mr.crossX;
    const dz = z - mr.crossZ;
    if (dx * dx + dz * dz < minDist * minDist) return false;
    const lx = (x - mr.lakeX) / (mr.lakeRx + rNav);
    const lz = (z - mr.lakeZ) / (mr.lakeRz + rNav);
    if (lx * lx + lz * lz < 1.0) return false;
  }

  // 4. Classique : troncs de la canopée + soubassements de rampes + culées Sky-Launch
  if (CANOPY_SPEC && CANOPY_SPEC.hasCanopy) {
    const trunks = CANOPY_SPEC.trunks || [];
    for (let i = 0; i < trunks.length; i++) {
      const tr = trunks[i];
      const minDist = tr.radius + rNav;
      const dx = x - tr.x;
      const dz = z - tr.z;
      if (dx * dx + dz * dz < minDist * minDist) return false;
    }
    if (
      pointNearAABB(
        x,
        z,
        -CANOPY_SPEC.rampSkirtOuterX,
        -CANOPY_SPEC.rampSkirtInnerX,
        -CANOPY_SPEC.ascentHalfZ,
        CANOPY_SPEC.ascentHalfZ,
        rNav
      ) ||
      pointNearAABB(
        x,
        z,
        CANOPY_SPEC.rampSkirtInnerX,
        CANOPY_SPEC.rampSkirtOuterX,
        -CANOPY_SPEC.ascentHalfZ,
        CANOPY_SPEC.ascentHalfZ,
        rNav
      )
    ) {
      return false;
    }
    if (
      pointNearAABB(
        x,
        z,
        -1.9,
        1.9,
        -CANOPY_SPEC.launchPierOuterZ,
        -CANOPY_SPEC.launchPierInnerZ,
        rNav
      ) ||
      pointNearAABB(
        x,
        z,
        -1.9,
        1.9,
        CANOPY_SPEC.launchPierInnerZ,
        CANOPY_SPEC.launchPierOuterZ,
        rNav
      )
    ) {
      return false;
    }
  }

  return true;
}

function isDynamicPointBlocked(x, z, rNav = NAV_ENTITY_RADIUS) {
  const toolWalls = ctx.entities.activeToolWalls;
  if (toolWalls && toolWalls.length > 0) {
    for (let i = 0; i < toolWalls.length; i++) {
      const tw = toolWalls[i];
      if (!tw || Math.abs(tw.cy || 0) > 2.3) continue;
      const minDist = (tw.thickness || 0.36) + rNav;
      if (distSqPointToSegment2D(x, z, tw.ax, tw.az, tw.bx, tw.bz) < minDist * minDist) {
        return true;
      }
    }
  }

  const leafWalls = ctx.entities.activeLeafWalls;
  if (leafWalls && leafWalls.length > 0) {
    const minDist = LEAF_WALL_NAV_RADIUS + rNav;
    const minDistSq = minDist * minDist;
    for (let w = 0; w < leafWalls.length; w++) {
      const wall = leafWalls[w];
      if (!wall || wall.phase !== 'grown' || !wall.nodes || wall.nodes.length === 0) continue;
      for (let i = 0; i < wall.nodes.length; i++) {
        const a = wall.nodes[i];
        const b = i < wall.nodes.length - 1 ? wall.nodes[i + 1] : a;
        if (distSqPointToSegment2D(x, z, a.x, a.z, b.x, b.z) < minDistSq) {
          return true;
        }
      }
    }
  }

  return false;
}

function ensureBuffers(count) {
  if (navCellCount === count && staticGrid.length === count) return;
  navCellCount = count;
  staticGrid = new Uint8Array(count);
  dynGrid = new Uint16Array(count);
  dynStamp = 1;
  gScore = new Float32Array(count);
  fScore = new Float32Array(count);
  parentCell = new Int32Array(count);
  openStamp = new Uint16Array(count);
  closedStamp = new Uint16Array(count);
  searchStamp = 1;
  heapNodes = new Int32Array(count);
  heapF = new Float32Array(count);
  heapPos = new Int32Array(count);
}

// --- CONSTRUCTION DU GRAPHE CANOPÉE (CLASSIC) ---
function rebuildCanopyGraph() {
  canopyGraph.nodes = [];
  canopyGraph.nodeIndex = new Map();
  canopyGraph.dist = [];
  canopyGraph.nextHop = [];

  if (!CANOPY_SPEC || !CANOPY_SPEC.hasCanopy || !Array.isArray(CANOPY_SPEC.decks)) {
    return;
  }

  const nodes = [];
  const nodeIndex = new Map();
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

  const bridges = CANOPY_SPEC.bridges || [];
  for (let i = 0; i < bridges.length; i++) {
    connect(bridges[i].from, bridges[i].to, false);
  }
  connect('westGate', 'wRampExit', false);
  connect('eastGate', 'eRampExit', false);
  connect('northHub', 'nLaunchExit', true);
  connect('southHub', 'sLaunchExit', true);

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

  canopyGraph.nodes = nodes;
  canopyGraph.nodeIndex = nodeIndex;
  canopyGraph.dist = dist;
  canopyGraph.nextHop = nextHop;
}

// --- API PUBLIQUE : INIT, REBUILD & DYNAMIQUE ---
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
  navCols = w;
  navRows = h;
  navOriginX = -FIELD.width * 0.5;
  navOriginZ = -FIELD.depth * 0.5;
  navMapId = state.mapId || 'classic';

  ensureBuffers(w * h);

  // Passe 1 : bake binaire statique (0 = bloqué, 1 = libre)
  for (let gz = 0; gz < h; gz++) {
    const wz = navOriginZ + (gz + 0.5) * NAV_CELL_SIZE;
    const rowOff = gz * w;
    for (let gx = 0; gx < w; gx++) {
      const wx = navOriginX + (gx + 0.5) * NAV_CELL_SIZE;
      staticGrid[rowOff + gx] = isStaticPointWalkable(wx, wz, NAV_ENTITY_RADIUS) ? 1 : 0;
    }
  }

  // Passe 2 : marquer à 2 les cellules libres adjacentes (8-voisinage) à un obstacle statique (+0.35)
  for (let gz = 0; gz < h; gz++) {
    const rowOff = gz * w;
    const zMin = gz > 0 ? gz - 1 : 0;
    const zMax = gz < h - 1 ? gz + 1 : h - 1;
    for (let gx = 0; gx < w; gx++) {
      const idx = rowOff + gx;
      if (staticGrid[idx] !== 1) continue;
      const xMin = gx > 0 ? gx - 1 : 0;
      const xMax = gx < w - 1 ? gx + 1 : w - 1;
      let nearBlocked = false;
      for (let nz = zMin; nz <= zMax && !nearBlocked; nz++) {
        const nRow = nz * w;
        for (let nx = xMin; nx <= xMax; nx++) {
          if (staticGrid[nRow + nx] === 0) {
            nearBlocked = true;
            break;
          }
        }
      }
      if (nearBlocked) staticGrid[idx] = 2;
    }
  }

  rebuildCanopyGraph();
  dynDirty = true;
  navVersion++;
}

export function markNavDynamicDirty() {
  dynDirty = true;
  navVersion++;
}

export function getNavVersion() {
  return navVersion;
}

function stampCapsuleDynamic(ax, az, bx, bz, radius) {
  const rSq = radius * radius;
  const minX = worldToGridX(Math.min(ax, bx) - radius - NAV_CELL_SIZE * 0.5);
  const maxX = worldToGridX(Math.max(ax, bx) + radius + NAV_CELL_SIZE * 0.5);
  const minZ = worldToGridZ(Math.min(az, bz) - radius - NAV_CELL_SIZE * 0.5);
  const maxZ = worldToGridZ(Math.max(az, bz) + radius + NAV_CELL_SIZE * 0.5);
  for (let gz = minZ; gz <= maxZ; gz++) {
    const wz = cellCenterZ(gz);
    const rowOff = gz * navCols;
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

function syncDynamicObstaclesIfDirty() {
  if (navCols === 0 || navRows === 0 || navMapId !== (state.mapId || 'classic')) {
    rebuildNavGrid();
  }
  if (!dynDirty) return;
  dynDirty = false;

  dynStamp++;
  if (dynStamp >= 65530) {
    dynGrid.fill(0);
    dynStamp = 1;
  }

  const toolWalls = ctx.entities.activeToolWalls;
  if (toolWalls && toolWalls.length > 0) {
    for (let i = 0; i < toolWalls.length; i++) {
      const tw = toolWalls[i];
      if (!tw || Math.abs(tw.cy || 0) > 2.3) continue;
      stampCapsuleDynamic(tw.ax, tw.az, tw.bx, tw.bz, (tw.thickness || 0.36) + NAV_ENTITY_RADIUS);
    }
  }

  const leafWalls = ctx.entities.activeLeafWalls;
  if (leafWalls && leafWalls.length > 0) {
    const rad = LEAF_WALL_NAV_RADIUS + NAV_ENTITY_RADIUS;
    for (let w = 0; w < leafWalls.length; w++) {
      const wall = leafWalls[w];
      if (!wall || wall.phase !== 'grown' || !wall.nodes || wall.nodes.length === 0) continue;
      for (let i = 0; i < wall.nodes.length; i++) {
        const a = wall.nodes[i];
        const b = i < wall.nodes.length - 1 ? wall.nodes[i + 1] : a;
        stampCapsuleDynamic(a.x, a.z, b.x, b.z, rad);
      }
    }
  }
}

function isCellWalkable(gx, gz) {
  if (gx < 0 || gx >= navCols || gz < 0 || gz >= navRows) return false;
  const idx = gz * navCols + gx;
  return staticGrid[idx] !== 0 && dynGrid[idx] !== dynStamp;
}

export function isNavPointWalkable(x, z) {
  syncDynamicObstaclesIfDirty();
  return isStaticPointWalkable(x, z, NAV_ENTITY_RADIUS) && !isDynamicPointBlocked(x, z, NAV_ENTITY_RADIUS);
}

// --- PROJECTION SUR LA CELLULE PRATICABLE LA PLUS PROCHE ---
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

  const hasBias = Number.isFinite(fromX) && Number.isFinite(fromZ);
  let bestGx = -1;
  let bestGz = -1;
  let bestScore = Infinity;
  let bestRawDistSq = Infinity;
  let maxRing = Math.min(48, Math.max(navCols, navRows));

  const testCell = (gx, gz) => {
    if (!isCellWalkable(gx, gz)) return;
    const wx = cellCenterX(gx);
    const wz = cellCenterZ(gz);
    const dx = wx - clampedX;
    const dz = wz - clampedZ;
    const dSq = dx * dx + dz * dz;
    let score = dSq;
    if (hasBias) {
      const fx = wx - fromX;
      const fz = wz - fromZ;
      score += (fx * fx + fz * fz) * 0.08;
    }
    if (score < bestScore) {
      bestScore = score;
      bestRawDistSq = dSq;
      bestGx = gx;
      bestGz = gz;
    }
  };

  if (isCellWalkable(gx0, gz0)) {
    testCell(gx0, gz0);
  }

  for (let r = 1; r <= maxRing; r++) {
    const xMin = gx0 - r;
    const xMax = gx0 + r;
    const zMin = gz0 - r;
    const zMax = gz0 + r;

    for (let gx = xMin; gx <= xMax; gx++) {
      testCell(gx, zMin);
      testCell(gx, zMax);
    }
    for (let gz = zMin + 1; gz <= zMax - 1; gz++) {
      testCell(xMin, gz);
      testCell(xMax, gz);
    }

    if (bestGx !== -1) {
      // Continuer au plus quelques anneaux pour garantir l'optimum euclidien malgré le carré Chebyshev
      const euclideanLimit = Math.ceil(Math.sqrt(bestRawDistSq) / NAV_CELL_SIZE) + 1;
      if (euclideanLimit < maxRing) maxRing = euclideanLimit;
    }
  }

  if (bestGx !== -1) {
    return {
      x: cellCenterX(bestGx),
      z: cellCenterZ(bestGz),
      gx: bestGx,
      gz: bestGz,
      projected: true
    };
  }

  return { x: clampedX, z: clampedZ, gx: gx0, gz: gz0, projected: true };
}

// --- RAYCAST GRILLE SUPERCOVER (DDA ANTI-COUPURE DE COIN) ---
export function hasGridLOS(x0, z0, x1, z1) {
  syncDynamicObstaclesIfDirty();

  let gx = worldToGridX(x0);
  let gz = worldToGridZ(z0);
  const gx1 = worldToGridX(x1);
  const gz1 = worldToGridZ(z1);

  if (!isCellWalkable(gx, gz) || !isCellWalkable(gx1, gz1)) return false;
  if (gx === gx1 && gz === gz1) return true;

  const fx0 = Math.max(0, Math.min(navCols - 1e-4, (x0 - navOriginX) / NAV_CELL_SIZE));
  const fz0 = Math.max(0, Math.min(navRows - 1e-4, (z0 - navOriginZ) / NAV_CELL_SIZE));
  const fx1 = Math.max(0, Math.min(navCols - 1e-4, (x1 - navOriginX) / NAV_CELL_SIZE));
  const fz1 = Math.max(0, Math.min(navRows - 1e-4, (z1 - navOriginZ) / NAV_CELL_SIZE));

  const dx = fx1 - fx0;
  const dz = fz1 - fz0;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1.0 / dx) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1.0 / dz) : Infinity;

  let tMaxX =
    stepX > 0
      ? (Math.floor(fx0) + 1.0 - fx0) * tDeltaX
      : stepX < 0
      ? (fx0 - Math.floor(fx0)) * tDeltaX
      : Infinity;
  let tMaxZ =
    stepZ > 0
      ? (Math.floor(fz0) + 1.0 - fz0) * tDeltaZ
      : stepZ < 0
      ? (fz0 - Math.floor(fz0)) * tDeltaZ
      : Infinity;

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

// --- MIN-HEAP BINAIRE INDEXÉ POUR A* ---
function heapReset() {
  heapSize = 0;
}

function heapSiftUp(pos) {
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
  const pos = heapSize++;
  heapNodes[pos] = node;
  heapF[pos] = f;
  heapPos[node] = pos;
  heapSiftUp(pos);
}

function heapUpdate(node, f) {
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
  const top = heapNodes[0];
  heapPos[top] = -1;
  heapSize--;
  if (heapSize > 0) {
    const lastNode = heapNodes[heapSize];
    heapNodes[0] = lastNode;
    heapF[0] = heapF[heapSize];
    heapPos[lastNode] = 0;
    heapSiftDown(0);
  }
  return top;
}

// --- LISSAGE STRING-PULLING LINE-OF-SIGHT (O(K)) ---
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

// --- PATHFINDING A* 8 DIRECTIONS + LISSAGE ---
const NEIGHBOR_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NEIGHBOR_DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const NEIGHBOR_COST = [1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2];

export function computeMobaPath(startX, startZ, goalX, goalZ, options = {}) {
  syncDynamicObstaclesIfDirty();

  const projGoal = projectToNearestWalkable(goalX, goalZ, startX, startZ);
  const directDist = Math.hypot(projGoal.x - startX, projGoal.z - startZ);
  if (directDist <= 0.45) {
    return [{ x: projGoal.x, z: projGoal.z, onCanopy: false }];
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

  const gxGoal = projGoal.gx;
  const gzGoal = projGoal.gz;

  // Fast-path ligne droite sans A*
  if (hasGridLOS(startWalkX, startWalkZ, projGoal.x, projGoal.z)) {
    if (startWasProjected && Math.hypot(startWalkX - startX, startWalkZ - startZ) > 0.35) {
      return [
        { x: startWalkX, z: startWalkZ, onCanopy: false },
        { x: projGoal.x, z: projGoal.z, onCanopy: false }
      ];
    }
    return [{ x: projGoal.x, z: projGoal.z, onCanopy: false }];
  }

  const startIdx = sz * navCols + sx;
  const goalIdx = gzGoal * navCols + gxGoal;

  searchStamp++;
  if (searchStamp >= 65530) {
    openStamp.fill(0);
    closedStamp.fill(0);
    searchStamp = 1;
  }

  const maxExpansions =
    typeof options.maxExpansions === 'number'
      ? options.maxExpansions
      : state.lowSpecMode
      ? 2500
      : 4500;

  heapReset();

  const octile = (ax, az) => {
    const dx = ax > gxGoal ? ax - gxGoal : gxGoal - ax;
    const dz = az > gzGoal ? az - gzGoal : gzGoal - az;
    return dx > dz ? dx + OCTILE_D2_MINUS_D1 * dz : dz + OCTILE_D2_MINUS_D1 * dx;
  };

  const h0 = octile(sx, sz);
  gScore[startIdx] = 0;
  fScore[startIdx] = h0;
  parentCell[startIdx] = -1;
  openStamp[startIdx] = searchStamp;
  heapPush(startIdx, h0);

  let bestIdx = startIdx;
  let bestH = h0;
  let reached = false;
  let expansions = 0;

  while (heapSize > 0 && expansions < maxExpansions) {
    const cur = heapPop();
    if (cur === goalIdx) {
      bestIdx = cur;
      reached = true;
      break;
    }

    closedStamp[cur] = searchStamp;
    expansions++;

    const cx = cur % navCols;
    const cz = (cur - cx) / navCols;
    const curG = gScore[cur];

    for (let dir = 0; dir < 8; dir++) {
      const dx = NEIGHBOR_DX[dir];
      const dz = NEIGHBOR_DZ[dir];
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= navCols || nz < 0 || nz >= navRows) continue;

      const nIdx = nz * navCols + nx;
      if (closedStamp[nIdx] === searchStamp) continue;
      if (staticGrid[nIdx] === 0 || dynGrid[nIdx] === dynStamp) continue;

      // Prévention stricte du corner-cutting en diagonale
      if (dir >= 4) {
        const adjA = cz * navCols + nx;
        const adjB = nz * navCols + cx;
        if (
          staticGrid[adjA] === 0 ||
          dynGrid[adjA] === dynStamp ||
          staticGrid[adjB] === 0 ||
          dynGrid[adjB] === dynStamp
        ) {
          continue;
        }
      }

      const penalty = staticGrid[nIdx] === 2 ? NEAR_OBSTACLE_PENALTY : 0;
      const tentativeG = curG + NEIGHBOR_COST[dir] + penalty;

      if (openStamp[nIdx] !== searchStamp) {
        const h = octile(nx, nz);
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + h;
        parentCell[nIdx] = cur;
        openStamp[nIdx] = searchStamp;
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

  // Reconstruction du chemin brut (start -> reached/bestIdx)
  const revIndices = [];
  let trace = reached ? goalIdx : bestIdx;
  while (trace !== -1 && trace !== startIdx) {
    revIndices.push(trace);
    trace = parentCell[trace];
  }

  const rawPoints = [{ x: startWalkX, z: startWalkZ, onCanopy: false }];
  for (let i = revIndices.length - 1; i >= 0; i--) {
    const idx = revIndices[i];
    const gx = idx % navCols;
    const gz = (idx - gx) / navCols;
    rawPoints.push({ x: cellCenterX(gx), z: cellCenterZ(gz), onCanopy: false });
  }

  if (reached && rawPoints.length > 1) {
    rawPoints[rawPoints.length - 1] = { x: projGoal.x, z: projGoal.z, onCanopy: false };
  }

  const smoothed = smoothPathLOS(rawPoints);

  // Retirer le point d'ancrage de départ pour ne renvoyer que les waypoints à parcourir
  const result = [];
  const startOffset = startWasProjected && Math.hypot(startWalkX - startX, startWalkZ - startZ) > 0.45 ? 0 : 1;
  for (let i = startOffset; i < smoothed.length; i++) {
    result.push({ x: smoothed[i].x, z: smoothed[i].z, onCanopy: false });
  }

  if (result.length === 0) {
    result.push({ x: projGoal.x, z: projGoal.z, onCanopy: false });
  }
  return result;
}

// --- ROUTAGE CANOPÉE (CLASSIC) + CONTINUATION A* AU SOL ---
function getCanopyNodesForSurface(surf) {
  if (!surf) return [];
  if (surf.deckId) return [surf.deckId];
  if (surf.bridge) return [surf.bridge.from, surf.bridge.to];
  if (surf.zone === 'westRamp') return ['westGate', 'wRampExit'];
  if (surf.zone === 'eastRamp') return ['eastGate', 'eRampExit'];
  if (surf.zone === 'northLaunch') return ['northHub', 'nLaunchExit'];
  if (surf.zone === 'southLaunch') return ['southHub', 'sLaunchExit'];
  return [];
}

function buildCanopyHopWaypoints(fromIdx, toIdx) {
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

export function routeCanopyPath(startX, startZ, goalX, goalZ, goalOnCanopy = false) {
  syncDynamicObstaclesIfDirty();

  if (!CANOPY_SPEC || !CANOPY_SPEC.hasCanopy || canopyGraph.nodes.length === 0) {
    return computeMobaPath(startX, startZ, goalX, goalZ);
  }

  const startSurf = getCanopySurfaceY(startX, startZ);

  // Cas 1 : Départ AU SOL
  if (!startSurf) {
    if (!goalOnCanopy) {
      return computeMobaPath(startX, startZ, goalX, goalZ);
    }

    // Joueuse au sol cliquant sur un deck/pont de la canopée : rejoindre la rampe la plus proche
    const rampEntries = [
      { gate: 'westGate', enterX: -(CANOPY_SPEC.ascentOuterX + 0.6), attachX: -(CANOPY_SPEC.ascentAttachMinX + 0.5) },
      { gate: 'eastGate', enterX: CANOPY_SPEC.ascentOuterX + 0.6, attachX: CANOPY_SPEC.ascentAttachMinX + 0.5 }
    ];
    let chosenRamp = rampEntries[0];
    const dW = Math.hypot(startX - rampEntries[0].enterX, startZ) + Math.hypot(goalX - rampEntries[0].attachX, goalZ);
    const dE = Math.hypot(startX - rampEntries[1].enterX, startZ) + Math.hypot(goalX - rampEntries[1].attachX, goalZ);
    if (dE < dW) chosenRamp = rampEntries[1];

    const groundPart = computeMobaPath(startX, startZ, chosenRamp.enterX, 0);
    const attachSurf = getCanopySurfaceY(chosenRamp.attachX, 0);
    const canopyPart = attachSurf
      ? routeCanopyPath(chosenRamp.attachX, 0, goalX, goalZ, true)
      : [{ x: goalX, z: goalZ, onCanopy: true }];
    return [
      ...groundPart,
      { x: chosenRamp.attachX, z: 0, onCanopy: false },
      ...canopyPart
    ];
  }

  // Cas 2 : Déjà engagée sur une glissière Sky-Launch (one-way)
  if (startSurf.zone === 'northLaunch' || startSurf.zone === 'southLaunch') {
    const signZ = startSurf.zone === 'northLaunch' ? -1 : 1;
    const out = [{ x: 0, z: signZ * CANOPY_SPEC.launchOuterZ, onCanopy: true }];
    if (!goalOnCanopy) {
      const groundPart = computeMobaPath(0, signZ * CANOPY_SPEC.launchLandingZ, goalX, goalZ);
      for (let i = 0; i < groundPart.length; i++) out.push(groundPart[i]);
    }
    return out;
  }

  const { nodes, nodeIndex, dist } = canopyGraph;
  const startIds = getCanopyNodesForSurface(startSurf);

  // Cas 3 : Départ CANOPÉE -> Destination CANOPÉE
  if (goalOnCanopy) {
    const goalSurf = getCanopySurfaceY(goalX, goalZ);
    if (goalSurf && goalSurf.zone === startSurf.zone) {
      return [{ x: goalX, z: goalZ, onCanopy: true }];
    }

    const goalIds = goalSurf ? getCanopyNodesForSurface(goalSurf) : [];
    if (goalIds.length === 0) {
      // Destination cliquée hors deck : choisir le deck le plus proche
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
      if (nearestDeckId) goalIds.push(nearestDeckId);
    }

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

    if (bestStartIdx === -1 || bestGoalIdx === -1) {
      return [{ x: goalX, z: goalZ, onCanopy: true }];
    }

    const hops = buildCanopyHopWaypoints(bestStartIdx, bestGoalIdx);
    const waypoints = [];
    for (let i = 0; i < hops.length; i++) {
      const h = hops[i];
      if (i === 0 && Math.hypot(h.x - startX, h.z - startZ) < 1.8) continue;
      waypoints.push({ x: h.x, z: h.z, onCanopy: true });
    }
    if (goalSurf) {
      waypoints.push({ x: goalX, z: goalZ, onCanopy: true });
    }
    return waypoints.length > 0 ? waypoints : [{ x: goalX, z: goalZ, onCanopy: true }];
  }

  // Cas 4 : Départ CANOPÉE -> Destination AU SOL (sortie optimale rampe/Sky-Launch + A* au sol)
  const projGoal = projectToNearestWalkable(goalX, goalZ, startX, startZ);
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

  if (bestStartIdx === -1 || bestExitIdx === -1) {
    return computeMobaPath(startX, startZ, projGoal.x, projGoal.z);
  }

  const exitNode = nodes[bestExitIdx];
  const hops = buildCanopyHopWaypoints(bestStartIdx, bestExitIdx);
  const waypoints = [];
  for (let i = 0; i < hops.length; i++) {
    const h = hops[i];
    if (i === 0 && Math.hypot(h.x - startX, h.z - startZ) < 1.8) continue;
    waypoints.push({ x: h.x, z: h.z, onCanopy: true });
  }

  // Suite du trajet au sol à partir du point de sortie / réception Sky-Launch
  const groundTail = computeMobaPath(exitNode.landX, exitNode.landZ, projGoal.x, projGoal.z);
  for (let i = 0; i < groundTail.length; i++) {
    waypoints.push(groundTail[i]);
  }

  return waypoints;
}
