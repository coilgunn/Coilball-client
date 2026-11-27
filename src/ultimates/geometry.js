import { ctx } from '../state.js';
import { CANOPY_SPEC, getTerrainY, getStructureSurfaceY } from '../world.js';
import { _ultRay, _ultBox } from './shared.js';

const THREE = ctx.THREE;

export function rayToCircleDistance2D(ray, cx, cz, radius, maxLen) {
  const { ox, oz, dirX, dirZ } = ray;
  const fx = ox - cx;
  const fz = oz - cz;
  const b = 2 * (fx * dirX + fz * dirZ);
  const c = fx * fx + fz * fz - radius * radius;
  if (c <= 0) return 0;
  const disc = b * b - 4 * c;
  if (disc < 0) return maxLen;
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) * 0.5;
  if (t1 >= 0 && t1 < maxLen) return t1;
  const t2 = (-b + sqrtD) * 0.5;
  if (t2 >= 0 && t2 < maxLen) return t2;
  return maxLen;
}

export function rayToAABB2D(ray, box, maxLen) {
  const { ox, oz, dirX, dirZ } = ray;
  const { minX, maxX, minZ, maxZ } = box;
  let tmin = 0;
  let tmax = maxLen;

  if (Math.abs(dirX) < 1e-6) {
    if (ox < minX || ox > maxX) return maxLen;
  } else {
    const invX = 1 / dirX;
    let t1 = (minX - ox) * invX;
    let t2 = (maxX - ox) * invX;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return maxLen;
  }

  if (Math.abs(dirZ) < 1e-6) {
    if (oz < minZ || oz > maxZ) return maxLen;
  } else {
    const invZ = 1 / dirZ;
    let t1 = (minZ - oz) * invZ;
    let t2 = (maxZ - oz) * invZ;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return maxLen;
  }

  return tmin >= 0 && tmin < maxLen ? tmin : maxLen;
}

export function hitUltAABB(minX, maxX, minZ, maxZ, maxLen) {
  _ultBox.minX = minX;
  _ultBox.maxX = maxX;
  _ultBox.minZ = minZ;
  _ultBox.maxZ = maxZ;
  return rayToAABB2D(_ultRay, _ultBox, maxLen);
}

export function getUltPreviewSurfaceY(wx, wz, onCanopy = false) {
  if (onCanopy && CANOPY_SPEC.hasCanopy) {
    return getStructureSurfaceY(wx, wz, true).y;
  }
  return getTerrainY(wx, wz);
}

export function createTerrainRibbonMesh(lengthSegs, material, renderOrder = 14) {
  const vertCount = (lengthSegs + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const indices = [];
  for (let s = 0; s < lengthSegs; s++) {
    const a = s * 2;
    const b = s * 2 + 1;
    const c = (s + 1) * 2 + 1;
    const d = (s + 1) * 2;
    indices.push(a, b, c, a, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.userData.lengthSegs = lengthSegs;
  mesh.userData.positions = positions;
  return mesh;
}

export function updateTerrainRibbonLocal(mesh, cfg) {
  const { ox, oz, dirX, dirZ, halfW, length, yOffset, onCanopy = false } = cfg;
  const segs = mesh.userData.lengthSegs;
  const pos = mesh.userData.positions;
  for (let s = 0; s <= segs; s++) {
    const dist = (s / segs) * length;
    const cx = ox + dirX * dist;
    const cz = oz + dirZ * dist;
    const wxL = cx - dirZ * halfW;
    const wzL = cz + dirX * halfW;
    const wxR = cx + dirZ * halfW;
    const wzR = cz - dirX * halfW;
    const yL = getUltPreviewSurfaceY(wxL, wzL, onCanopy) + yOffset;
    const yR = getUltPreviewSurfaceY(wxR, wzR, onCanopy) + yOffset;
    const i0 = s * 6;
    pos[i0] = -halfW;
    pos[i0 + 1] = yL;
    pos[i0 + 2] = dist;
    pos[i0 + 3] = halfW;
    pos[i0 + 4] = yR;
    pos[i0 + 5] = dist;
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}

export function updateTerrainRibbonWorld(mesh, cfg) {
  const { ox, oz, dirX, dirZ, rightX, rightZ, halfW, length, yOffset, onCanopy = false } = cfg;
  const segs = mesh.userData.lengthSegs;
  const pos = mesh.userData.positions;
  for (let s = 0; s <= segs; s++) {
    const dist = (s / segs) * length;
    const cx = ox + dirX * dist;
    const cz = oz + dirZ * dist;
    const wxL = cx - rightX * halfW;
    const wzL = cz - rightZ * halfW;
    const wxR = cx + rightX * halfW;
    const wzR = cz + rightZ * halfW;
    const yL = getUltPreviewSurfaceY(wxL, wzL, onCanopy) + yOffset;
    const yR = getUltPreviewSurfaceY(wxR, wzR, onCanopy) + yOffset;
    const i0 = s * 6;
    pos[i0] = wxL;
    pos[i0 + 1] = yL;
    pos[i0 + 2] = wzL;
    pos[i0 + 3] = wxR;
    pos[i0 + 4] = yR;
    pos[i0 + 5] = wzR;
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}

export function createTerrainRingMesh(angSegs, material, renderOrder = 14) {
  const positions = new Float32Array(angSegs * 2 * 3);
  const indices = [];
  for (let a = 0; a < angSegs; a++) {
    const an = (a + 1) % angSegs;
    const inA = a * 2;
    const outA = a * 2 + 1;
    const inB = an * 2;
    const outB = an * 2 + 1;
    indices.push(inA, outA, outB, inA, outB, inB);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.userData.angSegs = angSegs;
  mesh.userData.positions = positions;
  return mesh;
}

export function updateTerrainRingWorld(mesh, cfg) {
  const { cx, cz, rInner, rOuter, yOffset, terrainOnly = false, onCanopy = false } = cfg;
  const angSegs = mesh.userData.angSegs;
  const pos = mesh.userData.positions;
  for (let a = 0; a < angSegs; a++) {
    const theta = (a / angSegs) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const ix = cx + cosT * rInner;
    const iz = cz + sinT * rInner;
    const ox = cx + cosT * rOuter;
    const oz = cz + sinT * rOuter;
    const iy = (terrainOnly ? getTerrainY(ix, iz) : getUltPreviewSurfaceY(ix, iz, onCanopy)) + yOffset;
    const oy = (terrainOnly ? getTerrainY(ox, oz) : getUltPreviewSurfaceY(ox, oz, onCanopy)) + yOffset;
    const idx = a * 6;
    pos[idx] = ix;
    pos[idx + 1] = iy;
    pos[idx + 2] = iz;
    pos[idx + 3] = ox;
    pos[idx + 4] = oy;
    pos[idx + 5] = oz;
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}

export function createTerrainGridMesh(cols, rows, material, renderOrder = 12) {
  const vertCount = (cols + 1) * (rows + 1);
  const positions = new Float32Array(vertCount * 3);
  const indices = [];
  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * stride + c;
      const b = a + 1;
      const d = (r + 1) * stride + c;
      const e = d + 1;
      indices.push(a, b, e, a, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.userData.cols = cols;
  mesh.userData.rows = rows;
  mesh.userData.positions = positions;
  return mesh;
}

export function updateTerrainGridOriented(mesh, cfg) {
  const { ox, oz, dirX, dirZ, rightX, rightZ, halfW, zStart, zEnd, yOffset } = cfg;
  const cols = mesh.userData.cols;
  const rows = mesh.userData.rows;
  const pos = mesh.userData.positions;
  let ptr = 0;
  for (let r = 0; r <= rows; r++) {
    const lz = zStart + (zEnd - zStart) * (r / rows);
    const cx = ox + dirX * lz;
    const cz = oz + dirZ * lz;
    for (let c = 0; c <= cols; c++) {
      const lx = -halfW + halfW * 2 * (c / cols);
      const wx = cx + rightX * lx;
      const wz = cz + rightZ * lx;
      pos[ptr] = wx;
      pos[ptr + 1] = getTerrainY(wx, wz) + yOffset;
      pos[ptr + 2] = wz;
      ptr += 3;
    }
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}
