import { CANOPY_SPEC } from './shared.js';

export function distSqPointToSegment2D(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  let t = 0;
  if (lenSq > 0.0001) {
    t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lenSq));
  }
  const cx = ax + t * vx;
  const cz = az + t * vz;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
}

function rayToEndCircleDist(ray, endPt, r, best, minHitDist) {
  const vx = endPt.x - ray.ox;
  const vz = endPt.z - ray.oz;
  const distSq = vx * vx + vz * vz;
  const proj = vx * ray.dirX + vz * ray.dirZ;
  if (proj <= minHitDist || proj - r >= best) return best;
  const perpSq = distSq - proj * proj;
  if (perpSq >= r * r) return best;
  const hitDist = proj - Math.sqrt(r * r - perpSq);
  return hitDist > minHitDist && hitDist < best ? hitDist : best;
}

const _endScratch = { x: 0, z: 0 };

export function rayToCapsuleDistance2D(ray, cap, r, maxDist, minHitDist = 0.15) {
  const { ox, oz, dirX, dirZ } = ray;
  const { ax, az, bx, bz } = cap;
  if (distSqPointToSegment2D(ox, oz, ax, az, bx, bz) <= r * r) return Math.min(minHitDist, maxDist);

  _endScratch.x = ax;
  _endScratch.z = az;
  let best = rayToEndCircleDist(ray, _endScratch, r, maxDist, minHitDist);
  _endScratch.x = bx;
  _endScratch.z = bz;
  best = rayToEndCircleDist(ray, _endScratch, r, best, minHitDist);

  const sx = bx - ax;
  const sz = bz - az;
  const segLen = Math.hypot(sx, sz);
  if (segLen <= 1e-4) return best;

  const ux = sx / segLen;
  const uz = sz / segLen;
  const nx = -uz;
  const nz = ux;
  const dN = dirX * nx + dirZ * nz;
  if (Math.abs(dN) <= 1e-6) return best;

  const oN = (ox - ax) * nx + (oz - az) * nz;
  for (let side = -1; side <= 1; side += 2) {
    const t = (side * r - oN) / dN;
    if (t > minHitDist && t < best) {
      const hx = ox + dirX * t - ax;
      const hz = oz + dirZ * t - az;
      const u = hx * ux + hz * uz;
      if (u >= 0 && u <= segLen) best = t;
    }
  }
  return best;
}

// Retourne le scalaire t dans [0, 1] si collision, ou -1 sinon (zéro allocation d'objet)
export function segmentIntersectsCircle2D(seg, cx, cz, r) {
  const { ax, az, bx, bz } = seg;
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.0001) return -1;

  const startDx = ax - cx;
  const startDz = az - cz;
  if (startDx * startDx + startDz * startDz <= r * r) return -1;

  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / lenSq));
  if (t <= 0.02 || t >= 0.98) return -1;
  const px = ax + t * dx;
  const pz = az + t * dz;
  const distSq = (cx - px) * (cx - px) + (cz - pz) * (cz - pz);
  return distSq < r * r ? t : -1;
}

export function segmentIntersectsAABB2D(seg, minX, maxX, minZ, maxZ) {
  const { ax, az, bx, bz } = seg;
  if (ax >= minX && ax <= maxX && az >= minZ && az <= maxZ) return -1;

  const dx = bx - ax;
  const dz = bz - az;
  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < 1e-6) {
    if (ax < minX || ax > maxX) return -1;
  } else {
    let t1 = (minX - ax) / dx;
    let t2 = (maxX - ax) / dx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }

  if (Math.abs(dz) < 1e-6) {
    if (az < minZ || az > maxZ) return -1;
  } else {
    let t1 = (minZ - az) / dz;
    let t2 = (maxZ - az) / dz;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }

  if (tMin >= 0.98 || tMax <= 0.02) return -1;
  return Math.max(0, Math.min(1, (tMin + tMax) * 0.5));
}

function evalSegToVertCapsuleAt(a, b, cap, t, fixedY) {
  const clampedT = Math.max(0, Math.min(1, t));
  const pyLine = a.y + clampedT * (b.y - a.y);
  const sy = fixedY === null ? Math.max(cap.y0, Math.min(cap.y1, pyLine)) : fixedY;
  const ox = a.x + clampedT * (b.x - a.x) - cap.x;
  const oy = pyLine - sy;
  const oz = a.z + clampedT * (b.z - a.z) - cap.z;
  return ox * ox + oy * oy + oz * oz;
}

export function distSqSegmentToVerticalCapsule(a, b, cap) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq < 1e-8) {
    const cy = Math.max(cap.y0, Math.min(cap.y1, a.y));
    const px = a.x - cap.x;
    const py = a.y - cy;
    const pz = a.z - cap.z;
    return px * px + py * py + pz * pz;
  }
  const horizLenSq = dx * dx + dz * dz;
  const tHoriz = horizLenSq > 1e-8 ? ((cap.x - a.x) * dx + (cap.z - a.z) * dz) / horizLenSq : 0;
  const tLow = ((cap.x - a.x) * dx + (cap.y0 - a.y) * dy + (cap.z - a.z) * dz) / lenSq;
  const tHigh = ((cap.x - a.x) * dx + (cap.y1 - a.y) * dy + (cap.z - a.z) * dz) / lenSq;
  return Math.min(
    evalSegToVertCapsuleAt(a, b, cap, tHoriz, null),
    evalSegToVertCapsuleAt(a, b, cap, tLow, cap.y0),
    evalSegToVertCapsuleAt(a, b, cap, tHigh, cap.y1)
  );
}

export function enforceCanopyRails(pos, railRadius = 0.56) {
  const boxes = CANOPY_SPEC.walkBoxes;
  let bestDistSq = Infinity;
  let bestX = pos.x;
  let bestZ = pos.z;

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const minX = b.minX + b.sW * railRadius;
    const maxX = b.maxX - b.sE * railRadius;
    const minZ = b.minZ + b.sN * railRadius;
    const maxZ = b.maxZ - b.sS * railRadius;
    const cMinX = Math.min(minX, maxX);
    const cMaxX = Math.max(minX, maxX);
    const cMinZ = Math.min(minZ, maxZ);
    const cMaxZ = Math.max(minZ, maxZ);

    if (pos.x >= cMinX && pos.x <= cMaxX && pos.z >= cMinZ && pos.z <= cMaxZ) return;

    const cx = Math.max(cMinX, Math.min(cMaxX, pos.x));
    const cz = Math.max(cMinZ, Math.min(cMaxZ, pos.z));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestX = cx;
      bestZ = cz;
    }
  }

  pos.x = bestX;
  pos.z = bestZ;
}

export function pushOutAABB(pos, box, radius, bounceVel = null) {
  const { minX, maxX, minZ, maxZ } = box;
  const cX = Math.max(minX, Math.min(maxX, pos.x));
  const cZ = Math.max(minZ, Math.min(maxZ, pos.z));
  const dx = pos.x - cX;
  const dz = pos.z - cZ;
  const distSq = dx * dx + dz * dz;
  if (distSq >= radius * radius) return;

  let nx = 0;
  let nz = 0;
  if (distSq > 0.00001) {
    const dist = Math.sqrt(distSq);
    nx = dx / dist;
    nz = dz / dist;
    pos.x = cX + nx * radius;
    pos.z = cZ + nz * radius;
  } else {
    const toLeft = pos.x - minX;
    const toRight = maxX - pos.x;
    const toTop = pos.z - minZ;
    const toBot = maxZ - pos.z;
    const m = Math.min(toLeft, toRight, toTop, toBot);
    if (m === toLeft) { pos.x = minX - radius; nx = -1; }
    else if (m === toRight) { pos.x = maxX + radius; nx = 1; }
    else if (m === toTop) { pos.z = minZ - radius; nz = -1; }
    else { pos.z = maxZ + radius; nz = 1; }
  }

  if (bounceVel) {
    const vn = bounceVel.x * nx + bounceVel.z * nz;
    if (vn < 0) {
      bounceVel.x -= 1.55 * vn * nx;
      bounceVel.z -= 1.55 * vn * nz;
    }
  }
}

export function pushOutEllipse(pos, ellipse, entityRadius, bounceVel = null) {
  const { cx, cz, rx, rz } = ellipse;
  const erx = rx + entityRadius;
  const erz = rz + entityRadius;
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const sx = dx / erx;
  const sz = dz / erz;
  const ellSq = sx * sx + sz * sz;
  if (ellSq >= 1) return;

  const ellLen = Math.sqrt(ellSq);
  if (ellLen <= 0.0001) {
    pos.x = cx + erx;
    return;
  }
  const ux = sx / ellLen;
  const uz = sz / ellLen;
  pos.x = cx + ux * erx;
  pos.z = cz + uz * erz;
  if (!bounceVel) return;

  let nx = ux / erx;
  let nz = uz / erz;
  const nLen = Math.hypot(nx, nz) || 1;
  nx /= nLen;
  nz /= nLen;
  const vn = bounceVel.x * nx + bounceVel.z * nz;
  if (vn < 0) {
    bounceVel.x -= 1.55 * vn * nx;
    bounceVel.z -= 1.55 * vn * nz;
  }
}
