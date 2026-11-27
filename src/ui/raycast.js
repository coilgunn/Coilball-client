import { FIELD, state, ctx } from '../state.js';
import { scene, camera, renderer, getPlayer } from '../render3d.js';
import { CANOPY_SPEC, getTerrainY, getCanopySurfaceY } from '../world.js';
import { THREE, uiState } from './shared.js';

function ensureMobaMoveMarker() {
  if (uiState.mobaMoveMarker) return uiState.mobaMoveMarker;
  uiState.markerUpVec = new THREE.Vector3(0, 1, 0);
  uiState.markerNormVec = new THREE.Vector3(0, 1, 0);
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.88, 28),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 24;
  group.add(ring);

  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 18),
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5
    })
  );
  dot.rotation.x = -Math.PI / 2;
  dot.position.y = 0.025;
  dot.renderOrder = 25;
  group.add(dot);
  group.visible = false;
  scene.add(group);

  uiState.mobaMoveMarker = group;
  uiState.mobaMoveMarkerRing = ring;
  uiState.mobaMoveMarkerDot = dot;
  return group;
}

export function showMobaMoveMarker(wx, wz, onCanopy = false) {
  const marker = ensureMobaMoveMarker();
  if (onCanopy && CANOPY_SPEC.hasCanopy) {
    const canopyY = getCanopySurfaceY(wx, wz);
    const wy = (canopyY !== null ? canopyY : CANOPY_SPEC.deckY) + 0.16;
    marker.quaternion.identity();
    marker.position.set(wx, wy, wz);
  } else {
    const wy = getTerrainY(wx, wz) + 0.22;
    const eps = 0.45;
    const hL = getTerrainY(wx - eps, wz);
    const hR = getTerrainY(wx + eps, wz);
    const hD = getTerrainY(wx, wz - eps);
    const hU = getTerrainY(wx, wz + eps);
    uiState.markerNormVec.set(hL - hR, 2 * eps, hD - hU).normalize();
    marker.quaternion.setFromUnitVectors(uiState.markerUpVec, uiState.markerNormVec);
    marker.position.set(wx, wy, wz);
  }
  marker.visible = true;
  uiState.mobaMoveMarkerPulse = 1.0;
}

export function applyMobaMoveCommand(hit, immediate = true) {
  if (!hit) return null;
  const onCanopy = !!hit.onCanopy;
  const validGoal = ctx.api.setMobaMoveGoal
    ? ctx.api.setMobaMoveGoal(hit, { immediate, onCanopy })
    : { x: hit.x, z: hit.z, onCanopy };
  if (validGoal && Number.isFinite(validGoal.x) && Number.isFinite(validGoal.z)) {
    showMobaMoveMarker(validGoal.x, validGoal.z, !!validGoal.onCanopy);
    return validGoal;
  }
  return null;
}

export function hideMobaMoveMarker() {
  if (uiState.mobaMoveMarker) uiState.mobaMoveMarker.visible = false;
}

export function updateMobaMoveMarkerAnim(dt) {
  const marker = uiState.mobaMoveMarker;
  if (marker && marker.visible) {
    uiState.mobaMoveMarkerPulse = (uiState.mobaMoveMarkerPulse + dt * 2.2) % 1.0;
    const ringScale = 0.8 + uiState.mobaMoveMarkerPulse * 0.55;
    if (uiState.mobaMoveMarkerRing) {
      uiState.mobaMoveMarkerRing.scale.setScalar(ringScale);
      uiState.mobaMoveMarkerRing.material.opacity = 0.9 * (1 - uiState.mobaMoveMarkerPulse * 0.65);
    }
  }
}

function raycastCanopyPlane(ray, maxX, maxZ) {
  if (Math.abs(ray.direction.y) < 0.001) return null;
  const tCanopy = (CANOPY_SPEC.deckY - ray.origin.y) / ray.direction.y;
  if (tCanopy <= 0 || tCanopy > 380) return null;
  const cx = ray.origin.x + ray.direction.x * tCanopy;
  const cz = ray.origin.z + ray.direction.z * tCanopy;
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null;
  const canopySurfaceY = getCanopySurfaceY(cx, cz);
  if (canopySurfaceY === null) return null;
  return {
    x: Math.max(-maxX, Math.min(maxX, cx)),
    y: canopySurfaceY,
    z: Math.max(-maxZ, Math.min(maxZ, cz)),
    onCanopy: true
  };
}

function raycastTerrainMarch(ray) {
  let prevT = 4;
  for (let t = 5; t <= 280; t += 2.0) {
    const px = ray.origin.x + ray.direction.x * t;
    const py = ray.origin.y + ray.direction.y * t;
    const pz = ray.origin.z + ray.direction.z * t;
    if (py <= getTerrainY(px, pz)) {
      let lo = prevT;
      let hi = t;
      for (let it = 0; it < 10; it++) {
        const mid = (lo + hi) * 0.5;
        const mx = ray.origin.x + ray.direction.x * mid;
        const my = ray.origin.y + ray.direction.y * mid;
        const mz = ray.origin.z + ray.direction.z * mid;
        if (my <= getTerrainY(mx, mz)) hi = mid;
        else lo = mid;
      }
      const finalT = (lo + hi) * 0.5;
      const hx = ray.origin.x + ray.direction.x * finalT;
      const hz = ray.origin.z + ray.direction.z * finalT;
      return { x: hx, y: getTerrainY(hx, hz), z: hz };
    }
    prevT = t;
  }
  return null;
}

function raycastFlatGround(ray) {
  if (Math.abs(ray.direction.y) < 0.001) return null;
  const t = (0 - ray.origin.y) / ray.direction.y;
  if (t <= 0 || t > 380) return null;
  return {
    x: ray.origin.x + ray.direction.x * t,
    y: 0,
    z: ray.origin.z + ray.direction.z * t
  };
}

export function raycastScreenToWorld(clientX, clientY) {
  if (!renderer || !renderer.domElement || typeof clientX !== 'number' || typeof clientY !== 'number') {
    return null;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect || !rect.width || !rect.height) return null;
  uiState.mobaPointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  uiState.mobaPointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  uiState.mobaRaycaster.setFromCamera(uiState.mobaPointerNDC, camera);
  const ray = uiState.mobaRaycaster.ray;
  if (Math.abs(ray.direction.y) < 0.02 && ray.direction.y >= 0) return null;

  const maxX = FIELD.width / 2 - 0.5;
  const maxZ = FIELD.depth / 2 - 0.5;
  const controlled = getPlayer(state.myTeam, state.controlledRole);

  if (controlled && controlled.onCanopy && CANOPY_SPEC.hasCanopy) {
    const canopyHit = raycastCanopyPlane(ray, maxX, maxZ);
    if (canopyHit) return canopyHit;
  }

  const isReliefMap =
    state.mapId === 'mont-royal' || state.mapId === 'lafontaine' || state.mapId === 'saint-viateur';
  const hit = isReliefMap ? raycastTerrainMarch(ray) : raycastFlatGround(ray);
  if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.z)) return null;

  return {
    x: Math.max(-maxX, Math.min(maxX, hit.x)),
    y: hit.y,
    z: Math.max(-maxZ, Math.min(maxZ, hit.z)),
    onCanopy: false
  };
}
