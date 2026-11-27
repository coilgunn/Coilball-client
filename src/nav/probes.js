import { worldToGridX, worldToGridZ, isCellWalkable } from './shared.js';
import { syncDynamicObstaclesIfDirty } from './grid.js';

const BOUNCE_ANGLE_OFFSETS = [0.35, -0.35, 0.58, -0.58, 0.82, -0.82, 1.08, -1.08, 1.32, -1.32];

export function probeClearDistance(x, z, dirX, dirZ, maxDist = 14.0, step = 1.0) {
  syncDynamicObstaclesIfDirty();
  const len = Math.hypot(dirX, dirZ);
  if (len < 1e-5 || maxDist <= 0) return 0;
  const ux = dirX / len;
  const uz = dirZ / len;
  let lastClear = 0;

  for (let d = step; d <= maxDist + 1e-4; d += step) {
    const curD = Math.min(d, maxDist);
    const px = x + ux * curD;
    const pz = z + uz * curD;
    const gx = worldToGridX(px);
    const gz = worldToGridZ(pz);
    if (!isCellWalkable(gx, gz)) {
      const midD = lastClear + (curD - lastClear) * 0.5;
      const mgx = worldToGridX(x + ux * midD);
      const mgz = worldToGridZ(z + uz * midD);
      return isCellWalkable(mgx, mgz) ? midD : lastClear;
    }
    lastClear = curD;
  }
  return lastClear;
}

export function findEscapeCorridors(x, z, probeDist = 14.0, numDirs = 12) {
  syncDynamicObstaclesIfDirty();
  const corridors = [];
  let sumRatio = 0;
  for (let i = 0; i < numDirs; i++) {
    const angle = (i / numDirs) * Math.PI * 2;
    const dirX = Math.sin(angle);
    const dirZ = Math.cos(angle);
    const clearDist = probeClearDistance(x, z, dirX, dirZ, probeDist, 1.0);
    corridors.push({ angle, dirX, dirZ, clearDist });
    sumRatio += clearDist / Math.max(0.01, probeDist);
  }
  const openness = sumRatio / Math.max(1, numDirs);
  return {
    corridors,
    openness,
    corneredScore: Math.max(0, Math.min(1, 1 - openness))
  };
}

function estimateWallNormalAt(hx, hz, dx, dz) {
  const gx = worldToGridX(hx + dx * 0.85);
  const gz = worldToGridZ(hz + dz * 0.85);
  let nx = 0;
  let nz = 0;
  for (let ozg = -1; ozg <= 1; ozg++) {
    for (let oxg = -1; oxg <= 1; oxg++) {
      if (oxg === 0 && ozg === 0) continue;
      if (isCellWalkable(gx + oxg, gz + ozg)) {
        nx += oxg;
        nz += ozg;
      }
    }
  }
  const nLen = Math.hypot(nx, nz);
  if (nLen < 0.25) return null;
  return { nx: nx / nLen, nz: nz / nLen };
}

function evaluateBounceRay(ox, oz, targetX, targetZ, ang, maxDashDist) {
  const dx = Math.sin(ang);
  const dz = Math.cos(ang);
  const dHit = probeClearDistance(ox, oz, dx, dz, maxDashDist * 0.9, 0.75);
  if (dHit < 1.8 || dHit >= maxDashDist * 0.88) return null;

  const hx = ox + dx * dHit;
  const hz = oz + dz * dHit;
  const normal = estimateWallNormalAt(hx, hz, dx, dz);
  if (!normal) return null;

  const dot = dx * normal.nx + dz * normal.nz;
  if (dot >= -0.18) return null;

  let rx = dx - 2 * dot * normal.nx;
  let rz = dz - 2 * dot * normal.nz;
  const rLen = Math.hypot(rx, rz);
  if (rLen < 0.01) return null;
  rx /= rLen;
  rz /= rLen;

  const toTx = targetX - hx;
  const toTz = targetZ - hz;
  const proj = toTx * rx + toTz * rz;
  if (proj < 1.0 || proj > maxDashDist + 1.5) return null;

  const perp = Math.hypot(toTx - rx * proj, toTz - rz * proj);
  if (perp > 1.85) return null;

  const clearAfter = probeClearDistance(hx, hz, rx, rz, Math.min(proj, maxDashDist), 0.9);
  if (clearAfter < proj - 1.3) return null;

  return {
    dirX: dx,
    dirZ: dz,
    hitX: hx,
    hitZ: hz,
    totalDist: dHit + proj,
    score: dHit + proj + perp * 2.5
  };
}

export function findBounceWallReflection(ox, oz, targetX, targetZ, maxDashDist) {
  syncDynamicObstaclesIfDirty();
  const baseAng = Math.atan2(targetX - ox, targetZ - oz);
  let best = null;
  let bestScore = Infinity;

  for (let i = 0; i < BOUNCE_ANGLE_OFFSETS.length; i++) {
    const candidate = evaluateBounceRay(ox, oz, targetX, targetZ, baseAng + BOUNCE_ANGLE_OFFSETS[i], maxDashDist);
    if (candidate && candidate.score < bestScore) {
      bestScore = candidate.score;
      best = {
        dirX: candidate.dirX,
        dirZ: candidate.dirZ,
        hitX: candidate.hitX,
        hitZ: candidate.hitZ,
        totalDist: candidate.totalDist
      };
    }
  }
  return best;
}
