import { animeGradientMap, worldMaterialCache, createBasicMat } from '../render3d.js';
import { getActiveMapMeta } from './map_catalog.js';
import { THREE, worldState, animatedWaterTextures, cameraTreeOccluders } from './shared.js';

export function registerCameraTreeOccluder(node, x, y0, y1, z, r) {
  const matStates = [];
  const clonedMap = new Map();
  node.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const cloneSingle = (srcMat) => {
      if (!srcMat) return srcMat;
      let cloned = clonedMap.get(srcMat);
      if (!cloned) {
        cloned = srcMat.clone();
        clonedMap.set(srcMat, cloned);
        matStates.push({
          mat: cloned,
          baseTransparent: !!srcMat.transparent,
          baseOpacity: typeof srcMat.opacity === 'number' ? srcMat.opacity : 1.0,
          baseDepthWrite: srcMat.depthWrite !== false,
          isOutline: srcMat.side === THREE.BackSide
        });
      }
      return cloned;
    };
    child.material = Array.isArray(child.material)
      ? child.material.map(cloneSingle)
      : cloneSingle(child.material);
  });
  cameraTreeOccluders.push({ node, x, y0, y1, z, r, matStates, fadeAlpha: 1.0 });
}

function getMaterialMergeSignature(m) {
  if (!m || Array.isArray(m) || m.map || m.alphaMap || m.envMap || m.vertexColors) return null;
  return [
    m.type,
    m.color ? m.color.getHex() : '',
    m.emissive ? m.emissive.getHex() : '',
    m.emissiveIntensity !== undefined ? m.emissiveIntensity : '',
    m.opacity,
    m.transparent ? 1 : 0,
    m.side,
    m.depthWrite ? 1 : 0,
    m.gradientMap ? m.gradientMap.uuid : ''
  ].join('|');
}

function isMergeableStaticMesh(obj, keepSet, tmpBox) {
  if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh || keepSet.has(obj) || !obj.visible) return false;
  const g = obj.geometry;
  if (!g || !g.isBufferGeometry || !g.attributes.position || !g.attributes.normal) return false;
  if (obj.matrixWorld.determinant() <= 0) return false;
  if (!getMaterialMergeSignature(obj.material)) return false;
  if (obj.material.transparent) {
    if (!g.boundingBox) g.computeBoundingBox();
    tmpBox.copy(g.boundingBox).applyMatrix4(obj.matrixWorld);
    if (tmpBox.max.y - tmpBox.min.y > 0.12 || tmpBox.max.y > 0.2) return false;
  }
  return true;
}

function collectStaticMergeState(worldGroup, keepSet) {
  const tmpBox = new THREE.Box3();
  const buckets = new Map();
  const removable = new Set();

  const visit = (obj) => {
    let allChildrenRemovable = true;
    for (let i = 0; i < obj.children.length; i++) {
      if (!visit(obj.children[i])) allChildrenRemovable = false;
    }
    if (obj === worldGroup) return false;
    if (allChildrenRemovable && isMergeableStaticMesh(obj, keepSet, tmpBox)) {
      const key = `${getMaterialMergeSignature(obj.material)}|${obj.castShadow ? 1 : 0}${obj.receiveShadow ? 1 : 0}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material: obj.material, castShadow: obj.castShadow, receiveShadow: obj.receiveShadow, items: [] };
        buckets.set(key, bucket);
      }
      bucket.items.push(obj);
      removable.add(obj);
      return true;
    }
    if (allChildrenRemovable && obj.type === 'Group' && !keepSet.has(obj)) {
      removable.add(obj);
      return true;
    }
    return false;
  };
  visit(worldGroup);
  return { buckets, removable };
}

function buildMergedBatchMeshes(worldGroup, buckets, removable, invRoot) {
  const tmpMatrix = new THREE.Matrix4();
  const mergedMeshes = [];
  const unmarkAncestors = (obj) => {
    let cur = obj;
    while (cur && cur !== worldGroup) {
      removable.delete(cur);
      cur = cur.parent;
    }
  };

  buckets.forEach((bucket) => {
    if (bucket.items.length < 2) {
      bucket.items.forEach(unmarkAncestors);
      return;
    }
    let vertexCount = 0;
    const parts = bucket.items.map((mesh) => {
      const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      tmpMatrix.multiplyMatrices(invRoot, mesh.matrixWorld);
      src.applyMatrix4(tmpMatrix);
      vertexCount += src.attributes.position.count;
      return src;
    });
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    let offset = 0;
    parts.forEach((g) => {
      positions.set(g.attributes.position.array, offset * 3);
      normals.set(g.attributes.normal.array, offset * 3);
      offset += g.attributes.position.count;
      g.dispose();
    });
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.computeBoundingSphere();
    const mergedMesh = new THREE.Mesh(merged, bucket.material);
    mergedMesh.castShadow = bucket.castShadow;
    mergedMesh.receiveShadow = bucket.receiveShadow;
    mergedMesh.userData.staticBatch = true;
    mergedMesh.userData.batchedCount = bucket.items.length;
    mergedMeshes.push(mergedMesh);
  });
  return mergedMeshes;
}

function cleanupMergedSources(worldGroup, buckets, removable) {
  const keptGeometries = new Set();
  const usedMaterials = new Set();
  buckets.forEach((bucket) => usedMaterials.add(bucket.material));
  worldGroup.traverse((o) => {
    if (removable.has(o)) return;
    if (o.geometry) keptGeometries.add(o.geometry);
    if (o.material) usedMaterials.add(o.material);
  });
  const removedGeometries = new Set();
  const removedMaterials = new Set();
  removable.forEach((obj) => {
    if (obj.geometry) removedGeometries.add(obj.geometry);
    if (obj.material) removedMaterials.add(obj.material);
    if (obj.parent && !removable.has(obj.parent)) obj.parent.remove(obj);
  });
  removedGeometries.forEach((g) => { if (!keptGeometries.has(g)) g.dispose(); });
  removedMaterials.forEach((m) => { if (!usedMaterials.has(m)) m.dispose(); });
}

export function mergeStaticWorldMeshes() {
  const worldGroup = worldState.worldGroup;
  worldGroup.updateMatrixWorld(true);
  const keepSet = new Set();
  cameraTreeOccluders.forEach((occ) => occ.node.traverse((n) => keepSet.add(n)));

  const invRoot = new THREE.Matrix4().copy(worldGroup.matrixWorld).invert();
  const { buckets, removable } = collectStaticMergeState(worldGroup, keepSet);
  const mergedMeshes = buildMergedBatchMeshes(worldGroup, buckets, removable, invRoot);
  cleanupMergedSources(worldGroup, buckets, removable);

  mergedMeshes.forEach((m) => worldGroup.add(m));
  worldGroup.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
  worldGroup.updateMatrixWorld(true);

  let batchedSources = 0;
  mergedMeshes.forEach((m) => (batchedSources += m.userData.batchedCount));
  return { mergedMeshes: mergedMeshes.length, batchedSources };
}

export function disposeWorldGroup() {
  const worldGroup = worldState.worldGroup;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  worldGroup.traverse((o) => {
    if (o.geometry && !o.isSprite) geometries.add(o.geometry);
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        materials.add(m);
        if (m.map && m.map !== animeGradientMap) textures.add(m.map);
      });
    }
  });
  while (worldGroup.children.length > 0) {
    worldGroup.remove(worldGroup.children[0]);
  }
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
  worldMaterialCache.clear();
  animatedWaterTextures.length = 0;
}

export function updateWorldAnimations(dt) {
  if (!dt || animatedWaterTextures.length === 0) return;
  for (let i = 0; i < animatedWaterTextures.length; i++) {
    const entry = animatedWaterTextures[i];
    if (!entry || !entry.tex) continue;
    entry.tex.offset.x = (entry.tex.offset.x + entry.speedX * dt) % 1;
    entry.tex.offset.y = (entry.tex.offset.y + entry.speedY * dt) % 1;
  }
}

export function createLaneConnectorSegment(p1, p2, width, colorHex, opacity = 0.36) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const length = Math.hypot(dx, dz);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(length, width),
    createBasicMat({ color: colorHex, transparent: true, opacity, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -Math.atan2(dz, dx);
  mesh.position.set((p1.x + p2.x) / 2, 0.022, (p1.z + p2.z) / 2);
  worldState.worldGroup.add(mesh);
}

export function createGrassTexture(mapMeta = getActiveMapMeta()) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const c2d = canvas.getContext('2d');
  c2d.fillStyle = mapMeta.grassMain || '#34d399';
  c2d.fillRect(0, 0, 256, 256);
  c2d.fillStyle = mapMeta.grassStripe || '#2dd4bf';
  c2d.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 650; i++) {
    c2d.fillStyle = i % 3 === 0 ? (mapMeta.grassTuftA || '#6ee7b7') : (mapMeta.grassTuftB || '#10b981');
    c2d.fillRect(Math.random() * 256, Math.random() * 256, 2, 6);
  }
  c2d.fillStyle = 'rgba(2, 6, 23, 0.45)';
  c2d.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  return tex;
}
