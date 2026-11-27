import { getPassSnapHalfAngle, state, ctx } from '../state.js';
import {
  THREE,
  renderState,
  tmpRingCfg,
  tmpSectorCfg,
  getPlayer,
  getPreviewSurfaceY,
  createGroundRingBufferMesh,
  updateGroundRingBufferMesh,
  createGroundSectorBufferMesh,
  updateGroundSectorBufferMesh,
  createAimArrowMesh
} from './shared.js';
import { scene } from './scene.js';

function createSnapConeOutlineMesh() {
  const radSegs = 6;
  const angSegs = 16;
  const verts = 1 + radSegs + angSegs + radSegs;
  const positions = new Float32Array(verts * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.36,
    depthWrite: false
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.renderOrder = 15;
  return { line, mat, positions, radSegs, angSegs };
}

function createPassArcLineMesh() {
  const steps = 18;
  const positions = new Float32Array((steps + 1) * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xfde047,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.renderOrder = 16;
  line.visible = false;
  return { line, mat, positions, steps };
}

function ensurePassChargePreview3D() {
  if (renderState.passPreviewGroup || !scene) return renderState.passPreviewGroup;
  const group = new THREE.Group();
  group.visible = false;

  const rangeRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const rangeRing = createGroundRingBufferMesh(44, rangeRingMat, 14);
  group.add(rangeRing);

  const rangeFillMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const rangeFill = createGroundRingBufferMesh(44, rangeFillMat, 13);
  group.add(rangeFill);

  const snapConeFillMat = new THREE.MeshBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.13,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const snapConeFill = createGroundSectorBufferMesh(16, 4, snapConeFillMat, 14);
  group.add(snapConeFill);

  const coneOut = createSnapConeOutlineMesh();
  group.add(coneOut.line);

  const targetRingMat = new THREE.MeshBasicMaterial({
    color: 0x4ade80,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const targetRing = createGroundRingBufferMesh(28, targetRingMat, 15);
  targetRing.visible = false;
  group.add(targetRing);

  const arc = createPassArcLineMesh();
  group.add(arc.line);

  const freeArrow = createAimArrowMesh(0.95, 0.55, -0.35, 15, false);
  group.add(freeArrow);

  group.userData = {
    rangeRing,
    rangeRingMat,
    rangeFill,
    rangeFillMat,
    snapConeFill,
    snapConeFillMat,
    snapConeOutline: coneOut.line,
    snapConeOutlineMat: coneOut.mat,
    snapConeOutlinePositions: coneOut.positions,
    snapConeOutlineRadSegs: coneOut.radSegs,
    snapConeOutlineAngSegs: coneOut.angSegs,
    targetRing,
    targetRingMat,
    arcLine: arc.line,
    arcMat: arc.mat,
    arcPositions: arc.positions,
    arcSteps: arc.steps,
    freeArrow,
    arrowMat: freeArrow.material
  };
  scene.add(group);
  renderState.passPreviewGroup = group;
  return group;
}

function updatePassRangeRings(ud, carrier, radius, isCancelled, hasLock) {
  const lowSpec = !!state.lowSpecMode;
  const onCanopy = !!carrier.onCanopy;
  const mainHex = isCancelled ? 0xef4444 : hasLock ? 0x4ade80 : 0x38bdf8;
  const bandW = Math.min(0.75, Math.max(0.32, radius * 0.035));

  ud.rangeRingMat.color.setHex(mainHex);
  ud.rangeRingMat.opacity = isCancelled ? 0.85 : hasLock ? 0.9 : 0.72;
  tmpRingCfg.cx = carrier.pos.x;
  tmpRingCfg.cz = carrier.pos.z;
  tmpRingCfg.rInner = Math.max(0.25, radius - bandW);
  tmpRingCfg.rOuter = radius;
  tmpRingCfg.yOffset = 0.16;
  tmpRingCfg.onCanopy = onCanopy;
  updateGroundRingBufferMesh(ud.rangeRing, tmpRingCfg);

  ud.rangeFill.visible = !lowSpec;
  if (!lowSpec) {
    ud.rangeFillMat.color.setHex(mainHex);
    ud.rangeFillMat.opacity = isCancelled ? 0.09 : hasLock ? 0.08 : 0.06;
    tmpRingCfg.rInner = 0.85;
    tmpRingCfg.rOuter = Math.max(0.95, radius - bandW);
    tmpRingCfg.yOffset = 0.13;
    updateGroundRingBufferMesh(ud.rangeFill, tmpRingCfg);
  }
}

function updatePassSnapConeColors(ud, isCancelled, hasLock) {
  ud.snapConeFill.visible = true;
  ud.snapConeOutline.visible = true;
  if (isCancelled) {
    ud.snapConeFillMat.color.setHex(0xf87171);
    ud.snapConeFillMat.opacity = 0.13;
    ud.snapConeOutlineMat.color.setHex(0xfca5a5);
    ud.snapConeOutlineMat.opacity = 0.45;
  } else if (hasLock) {
    ud.snapConeFillMat.color.setHex(0x86efac);
    ud.snapConeFillMat.opacity = 0.16;
    ud.snapConeOutlineMat.color.setHex(0xbbf7d0);
    ud.snapConeOutlineMat.opacity = 0.46;
  } else {
    ud.snapConeFillMat.color.setHex(0xbae6fd);
    ud.snapConeFillMat.opacity = 0.13;
    ud.snapConeOutlineMat.color.setHex(0xe0f2fe);
    ud.snapConeOutlineMat.opacity = 0.36;
  }
}

function updatePassSnapConeGeometry(ud, carrier, aimAngle, snapHalfAngle, radius) {
  const onCanopy = !!carrier.onCanopy;
  const coneInner = Math.min(0.85, radius * 0.25);
  const coneOuter = Math.max(coneInner + 0.25, radius);

  tmpSectorCfg.cx = carrier.pos.x;
  tmpSectorCfg.cz = carrier.pos.z;
  tmpSectorCfg.centerAngle = aimAngle;
  tmpSectorCfg.halfAngle = snapHalfAngle;
  tmpSectorCfg.rInner = coneInner;
  tmpSectorCfg.rOuter = coneOuter;
  tmpSectorCfg.yOffset = 0.145;
  tmpSectorCfg.onCanopy = onCanopy;
  updateGroundSectorBufferMesh(ud.snapConeFill, tmpSectorCfg);

  const outPos = ud.snapConeOutlinePositions;
  const rSegs = ud.snapConeOutlineRadSegs;
  const aSegs = ud.snapConeOutlineAngSegs;
  const leftTheta = aimAngle - snapHalfAngle;
  const rightTheta = aimAngle + snapHalfAngle;
  const leftSin = Math.sin(leftTheta);
  const leftCos = Math.cos(leftTheta);
  const rightSin = Math.sin(rightTheta);
  const rightCos = Math.cos(rightTheta);
  let vIdx = 0;

  for (let i = 0; i <= rSegs; i++) {
    const r = coneInner + (coneOuter - coneInner) * (i / rSegs);
    const px = carrier.pos.x + leftSin * r;
    const pz = carrier.pos.z + leftCos * r;
    outPos[vIdx * 3] = px;
    outPos[vIdx * 3 + 1] = getPreviewSurfaceY(px, pz, onCanopy) + 0.17;
    outPos[vIdx * 3 + 2] = pz;
    vIdx++;
  }
  for (let a = 1; a <= aSegs; a++) {
    const theta = leftTheta + 2 * snapHalfAngle * (a / aSegs);
    const px = carrier.pos.x + Math.sin(theta) * coneOuter;
    const pz = carrier.pos.z + Math.cos(theta) * coneOuter;
    outPos[vIdx * 3] = px;
    outPos[vIdx * 3 + 1] = getPreviewSurfaceY(px, pz, onCanopy) + 0.17;
    outPos[vIdx * 3 + 2] = pz;
    vIdx++;
  }
  for (let i = 1; i <= rSegs; i++) {
    const r = coneOuter - (coneOuter - coneInner) * (i / rSegs);
    const px = carrier.pos.x + rightSin * r;
    const pz = carrier.pos.z + rightCos * r;
    outPos[vIdx * 3] = px;
    outPos[vIdx * 3 + 1] = getPreviewSurfaceY(px, pz, onCanopy) + 0.17;
    outPos[vIdx * 3 + 2] = pz;
    vIdx++;
  }
  ud.snapConeOutline.geometry.attributes.position.needsUpdate = true;
}

function updatePassLockedArc(ud, carrier, targetPlayer) {
  const pulse = 1.0 + 0.08 * Math.sin(renderState.passPreviewAnimTime * 10);
  ud.targetRing.visible = true;
  ud.targetRingMat.color.setHex(0xfde047);
  tmpRingCfg.cx = targetPlayer.pos.x;
  tmpRingCfg.cz = targetPlayer.pos.z;
  tmpRingCfg.rInner = 0.85 * pulse;
  tmpRingCfg.rOuter = 1.24 * pulse;
  tmpRingCfg.yOffset = 0.19;
  tmpRingCfg.onCanopy = !!targetPlayer.onCanopy;
  updateGroundRingBufferMesh(ud.targetRing, tmpRingCfg);

  ud.arcLine.visible = true;
  ud.arcMat.color.setHex(0xfde047);
  const sx = carrier.pos.x;
  const sy = carrier.pos.y + 1.25;
  const sz = carrier.pos.z;
  const ex = targetPlayer.pos.x;
  const ey = targetPlayer.pos.y + 1.15;
  const ez = targetPlayer.pos.z;
  const dist = Math.hypot(ex - sx, ez - sz);
  const peak = Math.min(4.2, 0.65 + dist * 0.10);
  const steps = ud.arcSteps;
  const arr = ud.arcPositions;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    arr[i * 3] = sx + (ex - sx) * t;
    arr[i * 3 + 1] = sy + (ey - sy) * t + 4 * peak * t * (1 - t);
    arr[i * 3 + 2] = sz + (ez - sz) * t;
  }
  ud.arcLine.geometry.attributes.position.needsUpdate = true;
  ud.freeArrow.visible = false;
}

function updatePassFreeArrow(ud, carrier, aimAngle, radius, isCancelled) {
  const onCanopy = !!carrier.onCanopy;
  ud.targetRing.visible = false;
  const dirX = Math.sin(aimAngle);
  const dirZ = Math.cos(aimAngle);
  const arrowLen = Math.min(radius, 18.0);

  ud.arcLine.visible = true;
  ud.arcMat.color.setHex(isCancelled ? 0xef4444 : 0x7dd3fc);
  const steps = ud.arcSteps;
  const arr = ud.arcPositions;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = carrier.pos.x + dirX * arrowLen * t;
    const pz = carrier.pos.z + dirZ * arrowLen * t;
    arr[i * 3] = px;
    arr[i * 3 + 1] = getPreviewSurfaceY(px, pz, onCanopy) + 0.22;
    arr[i * 3 + 2] = pz;
  }
  ud.arcLine.geometry.attributes.position.needsUpdate = true;

  const tipX = carrier.pos.x + dirX * arrowLen;
  const tipZ = carrier.pos.z + dirZ * arrowLen;
  ud.freeArrow.visible = true;
  ud.arrowMat.color.setHex(isCancelled ? 0xf87171 : 0xe0f2fe);
  ud.freeArrow.position.set(tipX, getPreviewSurfaceY(tipX, tipZ, onCanopy) + 0.24, tipZ);
  ud.freeArrow.rotation.y = aimAngle;
}

export function updatePassChargePreview3D(dt = 0.016) {
  const pc = state && state.passCharge;
  if (!pc || !pc.active || state.phase !== 'play') {
    if (renderState.passPreviewGroup) renderState.passPreviewGroup.visible = false;
    return;
  }
  const carrier = getPlayer(state.myTeam, state.controlledRole);
  if (!carrier || !carrier.carryingBall || carrier.state !== 'standing') {
    if (renderState.passPreviewGroup) renderState.passPreviewGroup.visible = false;
    return;
  }

  const pg = ensurePassChargePreview3D();
  if (!pg) return;
  pg.visible = true;
  renderState.passPreviewAnimTime += Math.min(0.05, dt || 0.016);

  const ud = pg.userData;
  const radius = Math.max(1.2, Number(pc.radius) || 4.5);
  const isCancelled = !!(pc.source === 'mobile' && ctx.api.isMobileAimCancelled?.());
  const targetPlayer = pc.targetRole ? getPlayer(state.myTeam, pc.targetRole) : null;
  const hasLock = !isCancelled && !!(targetPlayer && !targetPlayer.tutorialHidden && targetPlayer !== carrier);
  const aimAngle =
    typeof pc.aimAngle === 'number' && Number.isFinite(pc.aimAngle)
      ? pc.aimAngle
      : carrier.facingAngle || 0;
  const snapHalfAngle = getPassSnapHalfAngle(!!state.mobileMode);

  updatePassRangeRings(ud, carrier, radius, isCancelled, hasLock);
  updatePassSnapConeColors(ud, isCancelled, hasLock);
  updatePassSnapConeGeometry(ud, carrier, aimAngle, snapHalfAngle, radius);

  if (hasLock) {
    updatePassLockedArc(ud, carrier, targetPlayer);
  } else {
    updatePassFreeArrow(ud, carrier, aimAngle, radius, isCancelled);
  }
}
