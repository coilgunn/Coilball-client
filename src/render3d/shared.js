import { ctx } from '../state.js';

export const THREE = ctx.THREE;

export const leafWallBadges = [];
export const worldMaterialCache = new Map();
export const players = [];
export const balls = [];
export const boomerangMarkerPool = [];
export const dossardTextures = {};

export const renderState = {
  worldBuildActive: false,
  animeGradientMap: null,
  tmpProjVec: null,
  tmpLeafCamFwd: null,
  passPreviewGroup: null,
  passPreviewAnimTime: 0,
  mobileAimGroup: null,
  boomerangMarkersGroup: null,
  boomerangMarkerTime: 0,
  particleInstancedGeo: null,
  particleStartPosAttr: null,
  particleVelAttr: null,
  particleTimingAttr: null,
  particleColorAttr: null,
  particleUniforms: null,
  particleMesh: null,
  particleCursor: 0,
  particleSimTime: 0
};

export const tmpRingCfg = {
  cx: 0,
  cz: 0,
  rInner: 0,
  rOuter: 0,
  yOffset: 0,
  onCanopy: false
};

export const tmpSectorCfg = {
  cx: 0,
  cz: 0,
  centerAngle: 0,
  halfAngle: 0,
  rInner: 0,
  rOuter: 0,
  yOffset: 0,
  onCanopy: false
};

const DECOR_DARKEN_FACTOR = 0.56;

export function getViewportDims() {
  if (ctx.api && typeof ctx.api.getViewportSize === 'function') {
    const vp = ctx.api.getViewportSize();
    if (vp && vp.w > 0 && vp.h > 0) return vp;
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

export function setWorldBuildActive(v) {
  renderState.worldBuildActive = !!v;
}

export function getWorldCachedMaterial(key, factory) {
  let mat = worldMaterialCache.get(key);
  if (!mat) {
    mat = factory();
    worldMaterialCache.set(key, mat);
  }
  return mat;
}

export function darkenDecorHex(hex, factor = DECOR_DARKEN_FACTOR) {
  if (typeof hex !== 'number') return hex;
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * factor)));
  return (r << 16) | (g << 8) | b;
}

export function createToonMat(colorHex, extra = {}) {
  const { keepBright, ...matExtra } = extra || {};
  const finalHex =
    renderState.worldBuildActive && !matExtra.emissive && !keepBright
      ? darkenDecorHex(colorHex)
      : colorHex;
  const factory = () =>
    new THREE.MeshToonMaterial(
      Object.assign({ color: finalHex, gradientMap: renderState.animeGradientMap }, matExtra)
    );
  if (!renderState.worldBuildActive) return factory();
  return getWorldCachedMaterial(`toon|${finalHex}|${JSON.stringify(matExtra)}`, factory);
}

export function createBasicMat(props = {}) {
  const { keepBright, ...matProps } = props || {};
  if (
    renderState.worldBuildActive &&
    !keepBright &&
    typeof matProps.color === 'number' &&
    matProps.color !== 0xffffff
  ) {
    matProps.color = darkenDecorHex(matProps.color, 0.56);
  }
  const factory = () => new THREE.MeshBasicMaterial(matProps);
  if (!renderState.worldBuildActive) return factory();
  return getWorldCachedMaterial(`basic|${JSON.stringify(matProps)}`, factory);
}

export function createPhotonMat(colorHex) {
  return new THREE.MeshBasicMaterial({ color: colorHex });
}

export function addAnimeOutline(mesh, scaleFactor = 1.06, outlineColor = 0x0f1020, sharedMat = null) {
  const factory = () =>
    new THREE.MeshBasicMaterial({
      color: outlineColor,
      side: THREE.BackSide
    });
  const outlineMat =
    sharedMat ||
    (renderState.worldBuildActive
      ? getWorldCachedMaterial(`outline|${outlineColor}`, factory)
      : factory());
  const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);
  if (typeof scaleFactor === 'number') {
    outlineMesh.scale.setScalar(scaleFactor);
  } else {
    outlineMesh.scale.copy(scaleFactor);
  }
  mesh.add(outlineMesh);
  return outlineMesh;
}

export function getPlayer(team, role) {
  return players.find((p) => p.team === team && p.role === role);
}

export function getPreviewSurfaceY(x, z, onCanopy = false) {
  if (onCanopy && ctx.world && typeof ctx.world.getStructureSurfaceY === 'function') {
    const s = ctx.world.getStructureSurfaceY(x, z, true);
    if (s && typeof s.y === 'number') return s.y;
  }
  if (ctx.world && typeof ctx.world.getTerrainY === 'function') {
    return ctx.world.getTerrainY(x, z);
  }
  return 0;
}

export function createGroundRingBufferMesh(angSegs, material, renderOrder = 14) {
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

export function updateGroundRingBufferMesh(mesh, cfg) {
  const { cx, cz, rInner, rOuter, yOffset, onCanopy = false } = cfg;
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
    const iy = getPreviewSurfaceY(ix, iz, onCanopy) + yOffset;
    const oy = getPreviewSurfaceY(ox, oz, onCanopy) + yOffset;
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

export function createGroundSectorBufferMesh(angSegs, radSegs, material, renderOrder = 14) {
  const cols = angSegs + 1;
  const rows = radSegs + 1;
  const positions = new Float32Array(rows * cols * 3);
  const indices = [];
  for (let r = 0; r < radSegs; r++) {
    for (let a = 0; a < angSegs; a++) {
      const v00 = r * cols + a;
      const v01 = v00 + 1;
      const v10 = (r + 1) * cols + a;
      const v11 = v10 + 1;
      indices.push(v00, v10, v11, v00, v11, v01);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.userData.angSegs = angSegs;
  mesh.userData.radSegs = radSegs;
  mesh.userData.positions = positions;
  return mesh;
}

export function updateGroundSectorBufferMesh(mesh, cfg) {
  const { cx, cz, centerAngle, halfAngle, rInner, rOuter, yOffset, onCanopy = false } = cfg;
  const angSegs = mesh.userData.angSegs;
  const radSegs = mesh.userData.radSegs;
  const cols = angSegs + 1;
  const pos = mesh.userData.positions;
  for (let r = 0; r <= radSegs; r++) {
    const rad = rInner + (rOuter - rInner) * (r / radSegs);
    for (let a = 0; a <= angSegs; a++) {
      const theta = centerAngle - halfAngle + 2 * halfAngle * (a / angSegs);
      const px = cx + Math.sin(theta) * rad;
      const pz = cz + Math.cos(theta) * rad;
      const py = getPreviewSurfaceY(px, pz, onCanopy) + yOffset;
      const idx = (r * cols + a) * 3;
      pos[idx] = px;
      pos[idx + 1] = py;
      pos[idx + 2] = pz;
    }
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}

export function createAimArrowMesh(tipY, wingX, tailY, renderOrder, visible) {
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, tipY);
  arrowShape.lineTo(-wingX, tailY);
  arrowShape.lineTo(wingX, tailY);
  arrowShape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  arrowGeo.rotateX(-Math.PI / 2);
  arrowGeo.rotateY(Math.PI);
  const arrowMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const arrow = new THREE.Mesh(arrowGeo, arrowMat);
  arrow.renderOrder = renderOrder;
  arrow.visible = visible;
  return arrow;
}
