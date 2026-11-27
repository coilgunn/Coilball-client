import { state } from '../state.js';
import {
  THREE,
  players,
  renderState,
  boomerangMarkerPool,
  tmpRingCfg,
  getPreviewSurfaceY,
  createGroundRingBufferMesh,
  updateGroundRingBufferMesh,
  createAimArrowMesh
} from './shared.js';
import { scene } from './scene.js';

const _aimStyle = { hex: 0x38bdf8, range: 6.5 };

function ensureMobileActionAimPreview3D() {
  if (renderState.mobileAimGroup || !scene) return renderState.mobileAimGroup;
  const group = new THREE.Group();
  group.visible = false;

  const lineSteps = 12;
  const linePositions = new Float32Array((lineSteps + 1) * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  });
  const line = new THREE.Line(lineGeo, lineMat);
  line.frustumCulled = false;
  line.renderOrder = 15;
  group.add(line);

  const arrow = createAimArrowMesh(0.9, 0.5, -0.3, 16, true);
  group.add(arrow);

  const destRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const destRing = createGroundRingBufferMesh(24, destRingMat, 15);
  group.add(destRing);

  const wallBarGeo = new THREE.PlaneGeometry(3.0, 0.62);
  wallBarGeo.rotateX(-Math.PI / 2);
  const wallBarMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const wallBar = new THREE.Mesh(wallBarGeo, wallBarMat);
  wallBar.renderOrder = 15;
  wallBar.visible = false;
  group.add(wallBar);

  group.userData = {
    line,
    lineMat,
    linePositions,
    lineSteps,
    arrow,
    arrowMat: arrow.material,
    destRing,
    destRingMat,
    wallBar,
    wallBarMat
  };
  scene.add(group);
  renderState.mobileAimGroup = group;
  return group;
}

function resolveMobileAimStyle(actionType, extra, toolKey) {
  let hex = 0x38bdf8;
  let range = Number(extra && extra.range) || 6.5;
  const hasExplicitRange = !!(extra && extra.range);
  const dashKind = extra && extra.dashKind;

  if (actionType === 'dash') {
    if (dashKind === 'bounce') {
      hex = 0xf97316;
      if (!hasExplicitRange) range = 12.1;
    } else if (dashKind === 'slide') {
      hex = 0x7dd3fc;
      if (!hasExplicitRange) range = 18.2;
    } else if (dashKind === 'boomerang') {
      hex = 0x14b8a6;
      if (!hasExplicitRange) range = 9.1;
    }
  } else if (actionType === 'tool' || toolKey) {
    hex = toolKey === 'pad' ? 0x06b6d4 : 0xfacc15;
    if (!hasExplicitRange) range = toolKey === 'beacon' ? 2.5 : 2.2;
  } else if (actionType === 'throw' || actionType === 'pass' || actionType === 'action') {
    hex = 0xfde047;
    if (!hasExplicitRange) range = 16.0;
  }
  if (extra && extra.cancelled) hex = 0xef4444;

  _aimStyle.hex = hex;
  _aimStyle.range = range;
  return _aimStyle;
}

export function updateMobileActionAimPreview3D(actionType = null, angle = 0, origin = null, extra = null) {
  if (!actionType || !origin || state.phase !== 'play') {
    if (renderState.mobileAimGroup) renderState.mobileAimGroup.visible = false;
    return;
  }
  const mg = ensureMobileActionAimPreview3D();
  if (!mg) return;
  mg.visible = true;

  const ud = mg.userData;
  const onCanopy = !!(extra && extra.onCanopy);
  const toolKey =
    (extra && extra.toolKey) ||
    (actionType === 'beacon' || actionType === 'wall' || actionType === 'pad' ? actionType : null);
  const { hex, range } = resolveMobileAimStyle(actionType, extra, toolKey);

  const dirX = Math.sin(angle);
  const dirZ = Math.cos(angle);
  const ox = origin.x || 0;
  const oz = origin.z || 0;
  const endX = ox + dirX * range;
  const endZ = oz + dirZ * range;
  const endY = getPreviewSurfaceY(endX, endZ, onCanopy) + 0.22;

  ud.lineMat.color.setHex(hex);
  ud.arrowMat.color.setHex(hex);
  ud.destRingMat.color.setHex(hex);
  ud.wallBarMat.color.setHex(hex);

  const steps = ud.lineSteps;
  const arr = ud.linePositions;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = ox + dirX * range * t;
    const pz = oz + dirZ * range * t;
    arr[i * 3] = px;
    arr[i * 3 + 1] = getPreviewSurfaceY(px, pz, onCanopy) + 0.20;
    arr[i * 3 + 2] = pz;
  }
  ud.line.geometry.attributes.position.needsUpdate = true;

  ud.arrow.position.set(endX, endY, endZ);
  ud.arrow.rotation.y = angle;
  ud.arrow.visible = toolKey !== 'wall';

  const showWallBar = toolKey === 'wall';
  ud.wallBar.visible = showWallBar;
  if (showWallBar) {
    ud.wallBar.position.set(endX, endY, endZ);
    ud.wallBar.rotation.y = angle;
  }

  ud.destRing.visible = !state.lowSpecMode && !showWallBar;
  if (ud.destRing.visible) {
    const ringR = toolKey === 'beacon' ? 1.05 : 0.78;
    tmpRingCfg.cx = endX;
    tmpRingCfg.cz = endZ;
    tmpRingCfg.rInner = ringR - 0.22;
    tmpRingCfg.rOuter = ringR;
    tmpRingCfg.yOffset = 0.19;
    tmpRingCfg.onCanopy = onCanopy;
    updateGroundRingBufferMesh(ud.destRing, tmpRingCfg);
  }
}

function createBoomerangAnchor() {
  const anchor = new THREE.Group();
  const innerRingGeo = new THREE.RingGeometry(0.18, 0.36, 20);
  innerRingGeo.rotateX(-Math.PI / 2);
  const innerRingMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
  innerRing.position.y = 0.20;
  innerRing.renderOrder = 15;
  anchor.add(innerRing);

  const beaconCylGeo = new THREE.CylinderGeometry(0.10, 0.16, 2.2, 10, 1, true);
  const beaconCylMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const beaconCyl = new THREE.Mesh(beaconCylGeo, beaconCylMat);
  beaconCyl.position.y = 1.1;
  beaconCyl.renderOrder = 15;
  anchor.add(beaconCyl);

  const octaMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.92
  });
  const octa = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), octaMat);
  octa.position.y = 1.25;
  octa.renderOrder = 16;
  anchor.add(octa);

  return { anchor, innerRingMat, beaconCylMat, octa, octaMat };
}

function ensureBoomerangMarkerEntry(idx) {
  if (!renderState.boomerangMarkersGroup) {
    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);
    renderState.boomerangMarkersGroup = group;
  }
  if (boomerangMarkerPool[idx]) return boomerangMarkerPool[idx];

  const root = new THREE.Group();
  root.visible = false;

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x14b8a6,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const groundRing = createGroundRingBufferMesh(28, ringMat, 15);
  root.add(groundRing);

  const anch = createBoomerangAnchor();
  root.add(anch.anchor);

  const tetherPos = new Float32Array(6);
  const tetherGeo = new THREE.BufferGeometry();
  tetherGeo.setAttribute('position', new THREE.BufferAttribute(tetherPos, 3));
  const tetherMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.45,
    depthWrite: false
  });
  const tetherLine = new THREE.Line(tetherGeo, tetherMat);
  tetherLine.frustumCulled = false;
  tetherLine.renderOrder = 15;
  tetherLine.visible = false;
  root.add(tetherLine);

  renderState.boomerangMarkersGroup.add(root);
  const entry = {
    root,
    groundRing,
    ringMat,
    anchor: anch.anchor,
    innerRingMat: anch.innerRingMat,
    beaconCylMat: anch.beaconCylMat,
    octa: anch.octa,
    octaMat: anch.octaMat,
    tetherLine,
    tetherPos,
    tetherMat
  };
  boomerangMarkerPool[idx] = entry;
  return entry;
}

function isBoomerangOriginVisible(p) {
  return !!(
    p &&
    !p.tutorialHidden &&
    p.state === 'standing' &&
    !p.carryingBall &&
    p.boomerangOrigin &&
    p.boomerangWindow > 0 &&
    (p.team === state.myTeam ||
      state.minimapVisionMode === 'omniscient' ||
      (p.visibleTo && p.visibleTo[state.myTeam]))
  );
}

function updateSingleBoomerangMarker(entry, p) {
  const orig = p.boomerangOrigin;
  const ox = orig.x;
  const oz = orig.z;
  const onCanopy = !!orig.onCanopy;
  const groundY = getPreviewSurfaceY(ox, oz, onCanopy);
  const ratio = Math.max(0.15, Math.min(1, p.boomerangWindow / 2.0));
  const urgent = p.boomerangWindow <= 0.6;

  const rOuter = 0.45 + 0.65 * ratio;
  tmpRingCfg.cx = ox;
  tmpRingCfg.cz = oz;
  tmpRingCfg.rInner = Math.max(0.18, rOuter - 0.18);
  tmpRingCfg.rOuter = rOuter;
  tmpRingCfg.yOffset = 0.18;
  tmpRingCfg.onCanopy = onCanopy;
  updateGroundRingBufferMesh(entry.groundRing, tmpRingCfg);

  entry.ringMat.color.setHex(urgent ? 0xfacc15 : 0x14b8a6);
  entry.ringMat.opacity = 0.45 + 0.45 * ratio;
  entry.innerRingMat.opacity = 0.45 + 0.45 * ratio;
  entry.beaconCylMat.opacity = 0.22 + 0.24 * ratio;
  entry.octaMat.color.setHex(urgent ? 0xfb923c : 0xfacc15);
  entry.octaMat.opacity = 0.55 + 0.4 * ratio;

  const tNow = renderState.boomerangMarkerTime;
  entry.anchor.position.set(ox, groundY, oz);
  entry.octa.rotation.y = tNow * 3.6;
  entry.octa.position.y = 1.25 + Math.sin(tNow * 6.0) * 0.14;

  const isControlled = p.team === state.myTeam && p.role === state.controlledRole;
  entry.tetherLine.visible = isControlled;
  if (isControlled) {
    const tp = entry.tetherPos;
    tp[0] = p.pos.x;
    tp[1] = p.pos.y + 0.85;
    tp[2] = p.pos.z;
    tp[3] = ox;
    tp[4] = groundY + 0.85;
    tp[5] = oz;
    entry.tetherLine.geometry.attributes.position.needsUpdate = true;
    entry.tetherMat.opacity = 0.28 + 0.24 * ratio;
  }
}

export function updateBoomerangMarkers3D(dt = 0.016) {
  if (!scene) return;
  if (state.phase !== 'play') {
    if (renderState.boomerangMarkersGroup) renderState.boomerangMarkersGroup.visible = false;
    return;
  }

  renderState.boomerangMarkerTime += Math.min(0.05, dt || 0.016);
  let anyVisible = false;

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!isBoomerangOriginVisible(p)) {
      if (boomerangMarkerPool[i]) boomerangMarkerPool[i].root.visible = false;
      continue;
    }
    anyVisible = true;
    const entry = ensureBoomerangMarkerEntry(i);
    entry.root.visible = true;
    updateSingleBoomerangMarker(entry, p);
  }

  for (let i = players.length; i < boomerangMarkerPool.length; i++) {
    if (boomerangMarkerPool[i]) boomerangMarkerPool[i].root.visible = false;
  }

  if (renderState.boomerangMarkersGroup) {
    renderState.boomerangMarkersGroup.visible = anyVisible;
  }
}
