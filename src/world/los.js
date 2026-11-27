import { state, ctx } from '../state.js';
import { PARK_LANDMARKS } from './map_catalog.js';
import { getTerrainY } from './terrain.js';
import { rayToCapsuleDistance2D, segmentIntersectsCircle2D, segmentIntersectsAABB2D } from './geometry.js';
import { CANOPY_SPEC, JUNGLE_OBSTACLES, JUNGLE_WALLS, JUNGLE_BUSHES, _losSeg, _losRay } from './shared.js';

export const VISION_SPEC = {
  groundRange: 64,
  canopyRange: 102,
  sittingRange: 26,
  fovHalfAngle: (65 * Math.PI) / 180,
  cosFovHalf: Math.cos((65 * Math.PI) / 180),
  proximityRadius: 9.5,
  bushSpotRange: 8.5
};

export function isElevatedObserver(oy) {
  if (CANOPY_SPEC.hasCanopy) return oy >= 3.8;
  if (typeof state !== 'undefined' && state.mapId === 'mont-royal') return oy >= 6.0;
  return false;
}

function isLosBlockedByLeafWalls(seg, eyeA, eyeB, evolvedOnly) {
  const activeLeafWalls = ctx.entities.activeLeafWalls || [];
  if (activeLeafWalls.length === 0) return false;
  const rNode = evolvedOnly ? 1.08 : 0.92;
  const rMid = evolvedOnly ? 1.05 : 0.92;
  const hOff = evolvedOnly ? 7.5 : 3.85;
  for (let w = 0; w < activeLeafWalls.length; w++) {
    const wall = activeLeafWalls[w];
    if (wall.phase !== 'grown' || Boolean(wall.evolved) !== evolvedOnly) continue;
    const nodes = wall.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const t = segmentIntersectsCircle2D(seg, n.x, n.z, rNode);
      if (t >= 0 && eyeA + (eyeB - eyeA) * t < (n.y || 0) + hOff) return true;
      if (i >= nodes.length - 1) continue;
      const n2 = nodes[i + 1];
      const tm = segmentIntersectsCircle2D(seg, (n.x + n2.x) * 0.5, (n.z + n2.z) * 0.5, rMid);
      if (tm >= 0 && eyeA + (eyeB - eyeA) * tm < ((n.y || 0) + (n2.y || 0)) * 0.5 + hOff) return true;
    }
  }
  return false;
}

function isLosBlockedByLandmark(seg, eyeA, eyeB, activeMapId) {
  if (activeMapId === 'mont-royal') {
    const mr = PARK_LANDMARKS.montRoyal;
    const dx = seg.bx - seg.ax;
    const dz = seg.bz - seg.az;
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      if (getTerrainY(seg.ax + dx * t, seg.az + dz * t, 'mont-royal') > eyeA + (eyeB - eyeA) * t + 0.15) {
        return true;
      }
    }
    const crossT = segmentIntersectsCircle2D(seg, mr.crossX, mr.crossZ, mr.crossRadius - 0.1);
    return crossT >= 0 && eyeA + (eyeB - eyeA) * crossT < mr.hillHeight + 3.8;
  }
  if (activeMapId === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    const chaletT = segmentIntersectsAABB2D(seg, sv.chaletMinX, sv.chaletMaxX, sv.chaletMinZ, sv.chaletMaxZ);
    return chaletT >= 0 && eyeA + (eyeB - eyeA) * chaletT < sv.chaletHeight;
  }
  if (activeMapId === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    for (let s = -1; s <= 1; s += 2) {
      const ft = segmentIntersectsCircle2D(seg, s * lf.fountainX, 0, lf.fountainR * 0.72);
      if (ft >= 0 && eyeA + (eyeB - eyeA) * ft < 3.4) return true;
    }
  }
  return false;
}

function isLosBlockedByStaticObstacles(seg, eyeA, eyeB, distSq) {
  const trunks = CANOPY_SPEC.trunks;
  for (let i = 0; i < trunks.length; i++) {
    const tr = trunks[i];
    const t = segmentIntersectsCircle2D(seg, tr.x, tr.z, tr.radius + 0.08);
    if (t >= 0 && eyeA + (eyeB - eyeA) * t < CANOPY_SPEC.deckY - 0.3) return true;
  }
  for (let i = 0; i < JUNGLE_OBSTACLES.length; i++) {
    const obs = JUNGLE_OBSTACLES[i];
    const obsH = obs.kind === 'gazebo' ? PARK_LANDMARKS.jarry.gazeboHeight : obs.kind === 'waterfall' ? 25.0 : 3.85;
    const t = segmentIntersectsCircle2D(seg, obs.x, obs.z, obs.radius - 0.08);
    if (t >= 0 && eyeA + (eyeB - eyeA) * t < obsH) return true;
  }
  if (JUNGLE_WALLS.length > 0) {
    const segLen = Math.sqrt(distSq);
    const invLen = 1 / Math.max(0.0001, segLen);
    _losRay.ox = seg.ax;
    _losRay.oz = seg.az;
    _losRay.dirX = (seg.bx - seg.ax) * invLen;
    _losRay.dirZ = (seg.bz - seg.az) * invLen;
    for (let i = 0; i < JUNGLE_WALLS.length; i++) {
      const w = JUNGLE_WALLS[i];
      const hitD = rayToCapsuleDistance2D(_losRay, w, w.radius - 0.08, segLen, 0.02 * segLen);
      if (hitD < segLen * 0.98 && eyeA + (eyeB - eyeA) * (hitD * invLen) < (w.height || 3.85)) return true;
    }
  }
  const groundBoxes = CANOPY_SPEC.losGroundBoxes;
  for (let i = 0; i < groundBoxes.length; i++) {
    const box = groundBoxes[i];
    const t = segmentIntersectsAABB2D(seg, box[0], box[1], box[2], box[3]);
    if (t >= 0 && eyeA + (eyeB - eyeA) * t < box[4]) return true;
  }
  return false;
}

function isLosBlockedByCoverAndTools(seg, eyeA, eyeB) {
  for (let i = 0; i < JUNGLE_BUSHES.length; i++) {
    const b = JUNGLE_BUSHES[i];
    const startR = b.radius + 0.15;
    const startIn = (seg.ax - b.x) * (seg.ax - b.x) + (seg.az - b.z) * (seg.az - b.z) <= startR * startR;
    const endIn = (seg.bx - b.x) * (seg.bx - b.x) + (seg.bz - b.z) * (seg.bz - b.z) <= startR * startR;
    if (startIn || endIn) continue;
    const t = segmentIntersectsCircle2D(seg, b.x, b.z, b.radius * 0.9);
    if (t >= 0 && eyeA + (eyeB - eyeA) * t < 2.15) return true;
  }
  if (isLosBlockedByLeafWalls(seg, eyeA, eyeB, false)) return true;

  const activeToolWalls = ctx.entities.activeToolWalls || [];
  for (let w = 0; w < activeToolWalls.length; w++) {
    const tw = activeToolWalls[w];
    for (let s = 0; s < 5; s++) {
      const u = 0.1 + s * 0.2;
      const t = segmentIntersectsCircle2D(seg, tw.ax + (tw.bx - tw.ax) * u, tw.az + (tw.bz - tw.az) * u, 0.45);
      if (t >= 0 && eyeA + (eyeB - eyeA) * t < (tw.cy || 0) + tw.height) return true;
    }
  }
  return false;
}

export function hasClearLineOfSight(fromPos, toPos, isCameraRay = false) {
  if (!fromPos || !toPos) return false;
  const ax = fromPos.x || 0;
  const ay = fromPos.y || 0;
  const az = fromPos.z || 0;
  const bx = toPos.x || 0;
  const by = toPos.y || 0;
  const bz = toPos.z || 0;

  const distSq = (bx - ax) * (bx - ax) + (bz - az) * (bz - az);
  if (distSq < 0.64) return true;

  _losSeg.ax = ax;
  _losSeg.az = az;
  _losSeg.bx = bx;
  _losSeg.bz = bz;
  const eyeA = isCameraRay ? ay : ay + 1.45;
  const eyeB = by + 1.45;

  if (isLosBlockedByLeafWalls(_losSeg, eyeA, eyeB, true)) return false;
  if (CANOPY_SPEC.hasCanopy && ay >= 3.8) return true;

  const activeMapId = typeof state !== 'undefined' && state ? state.mapId : 'classic';
  if (isLosBlockedByLandmark(_losSeg, eyeA, eyeB, activeMapId)) return false;
  if (isLosBlockedByStaticObstacles(_losSeg, eyeA, eyeB, distSq)) return false;
  if (isLosBlockedByCoverAndTools(_losSeg, eyeA, eyeB)) return false;
  return true;
}
