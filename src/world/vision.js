import { FIELD, state, ctx } from '../state.js';
import { PARK_LANDMARKS } from './map_catalog.js';
import { getTerrainY } from './terrain.js';
import { rayToCapsuleDistance2D } from './geometry.js';
import { VISION_SPEC, isElevatedObserver } from './los.js';
import { CANOPY_SPEC, JUNGLE_OBSTACLES, JUNGLE_WALLS, JUNGLE_BUSHES, _visionRay, _rayState } from './shared.js';

function castCircleHit(cx, cz, r, minHitDist = 0.15) {
  const vx = cx - _rayState.ox;
  const vz = cz - _rayState.oz;
  const distSq = vx * vx + vz * vz;
  if (distSq <= r * r) return;
  const proj = vx * _rayState.dirX + vz * _rayState.dirZ;
  if (proj <= minHitDist || proj - r >= _rayState.minDist) return;
  const perpSq = distSq - proj * proj;
  if (perpSq >= r * r) return;
  const hitDist = proj - Math.sqrt(r * r - perpSq);
  if (hitDist > minHitDist && hitDist < _rayState.minDist) {
    _rayState.minDist = hitDist;
  }
}

function castAABBHit(minX, maxX, minZ, maxZ) {
  const { ox, oz, dirX, dirZ } = _rayState;
  if (ox >= minX && ox <= maxX && oz >= minZ && oz <= maxZ) return;
  let tMin = 0;
  let tMax = _rayState.minDist;

  if (Math.abs(dirX) < 1e-6) {
    if (ox < minX || ox > maxX) return;
  } else {
    let t1 = (minX - ox) / dirX;
    let t2 = (maxX - ox) / dirX;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return;
  }

  if (Math.abs(dirZ) < 1e-6) {
    if (oz < minZ || oz > maxZ) return;
  } else {
    let t1 = (minZ - oz) / dirZ;
    let t2 = (maxZ - oz) / dirZ;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return;
  }

  if (tMin > 0.15 && tMin < _rayState.minDist) {
    _rayState.minDist = tMin;
  }
}

function castRayAgainstLeafWalls(activeLeafWalls, evolvedOnly) {
  if (!activeLeafWalls || activeLeafWalls.length === 0) return;
  const rNode = evolvedOnly ? 1.08 : 0.92;
  const rMid = evolvedOnly ? 1.05 : 0.92;
  for (let w = 0; w < activeLeafWalls.length; w++) {
    const wall = activeLeafWalls[w];
    if (wall.phase !== 'grown' || Boolean(wall.evolved) !== evolvedOnly) continue;
    const nodes = wall.nodes;
    for (let i = 0; i < nodes.length; i++) {
      castCircleHit(nodes[i].x, nodes[i].z, rNode, 0.2);
      if (i < nodes.length - 1) {
        castCircleHit((nodes[i].x + nodes[i + 1].x) * 0.5, (nodes[i].z + nodes[i + 1].z) * 0.5, rMid, 0.2);
      }
    }
  }
}

function castVisionAgainstLandmarks(oy, activeMapId) {
  if (activeMapId === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    castAABBHit(sv.chaletMinX, sv.chaletMaxX, sv.chaletMinZ, sv.chaletMaxZ);
  } else if (activeMapId === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    castCircleHit(-lf.fountainX, 0, lf.fountainR * 0.72, 0.2);
    castCircleHit(lf.fountainX, 0, lf.fountainR * 0.72, 0.2);
  } else if (activeMapId === 'mont-royal') {
    const mr = PARK_LANDMARKS.montRoyal;
    castCircleHit(mr.crossX, mr.crossZ, mr.crossRadius - 0.1, 0.2);
    if (oy < mr.hillHeight - 1.4) {
      const marchMax = Math.min(_rayState.minDist, 52);
      for (let d = 2.0; d < marchMax; d += 2.0) {
        if (getTerrainY(_rayState.ox + _rayState.dirX * d, _rayState.oz + _rayState.dirZ * d, 'mont-royal') > oy + 1.55) {
          _rayState.minDist = Math.min(_rayState.minDist, d);
          break;
        }
      }
    }
  }
}

function castVisionAgainstGroundObstacles(activeLeafWalls, activeToolWalls) {
  for (let i = 0; i < CANOPY_SPEC.trunks.length; i++) {
    const tr = CANOPY_SPEC.trunks[i];
    castCircleHit(tr.x, tr.z, tr.radius + 0.08, 0.2);
  }
  for (let i = 0; i < JUNGLE_OBSTACLES.length; i++) {
    const obs = JUNGLE_OBSTACLES[i];
    castCircleHit(obs.x, obs.z, obs.radius - 0.05, 0.2);
  }
  _visionRay.ox = _rayState.ox;
  _visionRay.oz = _rayState.oz;
  _visionRay.dirX = _rayState.dirX;
  _visionRay.dirZ = _rayState.dirZ;
  for (let i = 0; i < JUNGLE_WALLS.length; i++) {
    const w = JUNGLE_WALLS[i];
    _rayState.minDist = rayToCapsuleDistance2D(_visionRay, w, w.radius - 0.05, _rayState.minDist, 0.2);
  }
  for (let i = 0; i < JUNGLE_BUSHES.length; i++) {
    const b = JUNGLE_BUSHES[i];
    const dxB = _rayState.ox - b.x;
    const dzB = _rayState.oz - b.z;
    const inR = b.radius + 0.15;
    if (dxB * dxB + dzB * dzB <= inR * inR) continue;
    castCircleHit(b.x, b.z, b.radius * 0.9, 0.2);
  }
  castRayAgainstLeafWalls(activeLeafWalls, false);
  for (let w = 0; w < activeToolWalls.length; w++) {
    const tw = activeToolWalls[w];
    for (let s = 0; s < 5; s++) {
      const u = 0.1 + s * 0.2;
      castCircleHit(tw.ax + (tw.bx - tw.ax) * u, tw.az + (tw.bz - tw.az) * u, 0.45, 0.2);
    }
  }
}

export function castVisionRay2D(ox, oy, oz, dirX, dirZ, maxLen) {
  const activeLeafWalls = ctx.entities.activeLeafWalls || [];
  const activeToolWalls = ctx.entities.activeToolWalls || [];
  let minDist = maxLen;
  const halfW = FIELD.width / 2;
  const halfD = FIELD.depth / 2;

  if (dirX > 1e-5) minDist = Math.min(minDist, (halfW - ox) / dirX);
  else if (dirX < -1e-5) minDist = Math.min(minDist, (-halfW - ox) / dirX);
  if (dirZ > 1e-5) minDist = Math.min(minDist, (halfD - oz) / dirZ);
  else if (dirZ < -1e-5) minDist = Math.min(minDist, (-halfD - oz) / dirZ);

  _rayState.ox = ox;
  _rayState.oz = oz;
  _rayState.dirX = dirX;
  _rayState.dirZ = dirZ;
  _rayState.minDist = minDist;

  const activeMapId = typeof state !== 'undefined' && state ? state.mapId : 'classic';
  castVisionAgainstLandmarks(oy, activeMapId);
  castRayAgainstLeafWalls(activeLeafWalls, true);

  if (!(CANOPY_SPEC.hasCanopy && oy >= 3.8)) {
    castVisionAgainstGroundObstacles(activeLeafWalls, activeToolWalls);
  }

  return Math.max(0.5, _rayState.minDist);
}

export function fillPlayerVisionPolygonFlat(p, coneSteps, backSteps, outXY) {
  if (!p) return 0;
  const ox = p.pos.x;
  const oy = p.pos.y || 0;
  const oz = p.pos.z;
  const facing = p.facingAngle || 0;
  const maxRange =
    p.state === 'sitting'
      ? VISION_SPEC.sittingRange
      : isElevatedObserver(oy)
      ? VISION_SPEC.canopyRange
      : VISION_SPEC.groundRange;
  const fovHalf = VISION_SPEC.fovHalfAngle;
  const prox = p.state === 'sitting' ? 4.5 : VISION_SPEC.proximityRadius;

  let count = 0;
  for (let i = 0; i <= coneSteps; i++) {
    const ang = facing - fovHalf + (i / coneSteps) * (fovHalf * 2);
    const dx = Math.sin(ang);
    const dz = Math.cos(ang);
    const d = castVisionRay2D(ox, oy, oz, dx, dz, maxRange);
    outXY[count * 2] = ox + dx * d;
    outXY[count * 2 + 1] = oz + dz * d;
    count++;
  }

  const backArc = Math.PI * 2 - fovHalf * 2;
  for (let i = 1; i < backSteps; i++) {
    const ang = facing + fovHalf + (i / backSteps) * backArc;
    const dx = Math.sin(ang);
    const dz = Math.cos(ang);
    const d = castVisionRay2D(ox, oy, oz, dx, dz, prox);
    outXY[count * 2] = ox + dx * d;
    outXY[count * 2 + 1] = oz + dz * d;
    count++;
  }
  return count;
}

export function computePlayerVisionPolygon(p, coneSteps = 28, backSteps = 10) {
  if (!p) return [];
  const buf = new Float64Array((coneSteps + backSteps + 2) * 2);
  const count = fillPlayerVisionPolygonFlat(p, coneSteps, backSteps, buf);
  return Array.from({ length: count }, (_, i) => ({ x: buf[i * 2], z: buf[i * 2 + 1] }));
}
