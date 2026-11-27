import { mp } from '../state.js';
import { scene } from '../render3d.js';
import { getStructureSurfaceY } from '../world.js';
import { sendNetMessage } from '../net.js';
import { THREE, activeSlidePatches } from './shared.js';

export function clearAllSlidePatches() {
  while (activeSlidePatches.length > 0) {
    const sp = activeSlidePatches.pop();
    if (sp.mesh) scene.remove(sp.mesh);
  }
}

export function spawnSlidePatch(ownerId, team, x, y, z, broadcast = true) {
  const patchGeo = new THREE.CircleGeometry(1.28, 18);
  patchGeo.rotateX(-Math.PI / 2);
  const patchMat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(patchGeo, patchMat);
  const rimGeo = new THREE.RingGeometry(1.06, 1.28, 18);
  rimGeo.rotateX(-Math.PI / 2);
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.y = 0.005;
  mesh.add(rimMesh);
  const surfY = getStructureSurfaceY(x, z, y >= 3.8).y;
  mesh.position.set(x, surfY + 0.045, z);
  scene.add(mesh);
  activeSlidePatches.push({
    ownerId,
    team,
    x,
    y: surfY,
    z,
    radius: 1.28,
    timer: 6.0,
    mesh,
    mat: patchMat,
    rimMat,
  });
  if (activeSlidePatches.length > 48) {
    const oldest = activeSlidePatches.shift();
    if (oldest && oldest.mesh) scene.remove(oldest.mesh);
  }
  if (broadcast && mp.enabled) {
    sendNetMessage({ type: 'MP_SLIDE_PATCH', peerId: mp.myPeerId, ownerId, team, x, y: surfY, z });
  }
}

export function isPointOnSlipperySurface(pos, ownerId = null) {
  for (let i = 0; i < activeSlidePatches.length; i++) {
    const sp = activeSlidePatches[i];
    if (ownerId && sp.ownerId === ownerId) continue;
    if (Math.abs((pos.y || 0) - sp.y) > 2.2) continue;
    const dx = pos.x - sp.x;
    const dz = pos.z - sp.z;
    if (dx * dx + dz * dz <= sp.radius * sp.radius) return true;
  }
  return false;
}

export function updateSlidePatches(dt) {
  for (let i = activeSlidePatches.length - 1; i >= 0; i--) {
    const sp = activeSlidePatches[i];
    sp.timer -= dt;
    if (sp.mat && sp.timer < 1.5) {
      const fade = Math.max(0.05, sp.timer / 1.5);
      sp.mat.opacity = fade * 0.62;
      if (sp.rimMat) sp.rimMat.opacity = fade * 0.72;
    }
    if (sp.timer <= 0) {
      if (sp.mesh) scene.remove(sp.mesh);
      activeSlidePatches.splice(i, 1);
    }
  }
}
