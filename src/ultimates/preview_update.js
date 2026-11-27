import { state } from '../state.js';
import { getPlayer } from '../render3d.js';
import { getTerrainY } from '../world.js';
import {
  FIRE_ULT_MAX_LEN,
  FIRE_ULT_BEAM_RADIUS,
  WATER_ULT_WIDTH,
  WATER_ULT_RANGE,
  ultState,
  hasPlayerUltEvo,
  getUltimateAimAngle,
  canPlayerUseUltimate
} from './shared.js';
import {
  getUltPreviewSurfaceY,
  updateTerrainRibbonWorld,
  updateTerrainRingWorld,
  updateTerrainGridOriented
} from './geometry.js';
import { computeFireLaserMaxDist } from './fire.js';
import { ensureUltPreviewGroup } from './preview_build.js';
import { updateUltHudWidget } from './hud_widget.js';

const _previewFrame = {
  p: null,
  aimAngle: 0,
  dirX: 0,
  dirZ: 0,
  rightX: 0,
  rightZ: 0,
  evolved: false,
  onCanopy: false
};

function updateFirePreview(ud, frame) {
  const { p, dirX, dirZ, rightX, rightZ, evolved, onCanopy } = frame;
  const ox = p.pos.x + dirX * 0.85;
  const oy = (p.pos.y || 0) + 1.05;
  const oz = p.pos.z + dirZ * 0.85;
  const maxDist = computeFireLaserMaxDist(ox, oy, oz, dirX, dirZ, FIRE_ULT_MAX_LEN);
  const beamHalfW = FIRE_ULT_BEAM_RADIUS * (evolved ? 1.9 : 1.0);
  const coreHalfW = 0.12 * (evolved ? 1.8 : 1.0);

  updateTerrainRibbonWorld(ud.firePlane, { ox: p.pos.x, oz: p.pos.z, dirX, dirZ, rightX, rightZ, halfW: beamHalfW, length: maxDist, yOffset: 0.20, onCanopy });
  updateTerrainRibbonWorld(ud.fireCore, { ox: p.pos.x, oz: p.pos.z, dirX, dirZ, rightX, rightZ, halfW: coreHalfW, length: maxDist, yOffset: 0.23, onCanopy });
  ud.firePlane.material.opacity = 0.28 + 0.16 * Math.sin(ud.animTime * 8);

  const ringScale = (evolved ? 1.5 : 0.85) + 0.22 * Math.sin(ud.animTime * 10);
  updateTerrainRingWorld(ud.fireEndRing, {
    cx: p.pos.x + dirX * maxDist,
    cz: p.pos.z + dirZ * maxDist,
    rInner: 0.45 * ringScale,
    rOuter: 0.85 * ringScale,
    yOffset: 0.25,
    terrainOnly: false,
    onCanopy
  });
}

function updateWater360Area(ud, p, evoRange, rInner) {
  const angCount = ud.water360Ang;
  const radCount = ud.water360Rad;
  const areaPos = ud.water360Pos;
  for (let r = 0; r <= radCount; r++) {
    const radius = rInner + (evoRange - rInner) * (r / radCount);
    for (let a = 0; a < angCount; a++) {
      const theta = (a / angCount) * Math.PI * 2;
      const wx = p.pos.x + Math.cos(theta) * radius;
      const wz = p.pos.z + Math.sin(theta) * radius;
      const idx = (r * angCount + a) * 3;
      areaPos[idx] = wx;
      areaPos[idx + 1] = getTerrainY(wx, wz) + 0.20;
      areaPos[idx + 2] = wz;
    }
  }
  ud.water360Area.geometry.attributes.position.needsUpdate = true;
  ud.water360Area.material.opacity = 0.11 + 0.04 * Math.sin(ud.animTime * 4.5);
}

function updateWater360Filigree(ud, p, evoRange, rInner) {
  const fPos = ud.water360FiligreePos;
  let fPtr = 0;
  const spokes = ud.waterFiligreeSpokes;
  const spokeSegs = ud.waterFiligreeSpokeSegs;
  for (let s = 0; s < spokes; s++) {
    const theta = (s / spokes) * Math.PI * 2;
    const cs = Math.cos(theta);
    const sn = Math.sin(theta);
    for (let k = 0; k < spokeSegs; k++) {
      const r0 = rInner + (evoRange - rInner) * (k / spokeSegs);
      const r1 = rInner + (evoRange - rInner) * ((k + 1) / spokeSegs);
      const x0 = p.pos.x + cs * r0;
      const z0 = p.pos.z + sn * r0;
      const x1 = p.pos.x + cs * r1;
      const z1 = p.pos.z + sn * r1;
      fPos[fPtr] = x0;
      fPos[fPtr + 1] = getTerrainY(x0, z0) + 0.22;
      fPos[fPtr + 2] = z0;
      fPos[fPtr + 3] = x1;
      fPos[fPtr + 4] = getTerrainY(x1, z1) + 0.22;
      fPos[fPtr + 5] = z1;
      fPtr += 6;
    }
  }
  const ringFracs = ud.waterFiligreeRingFracs;
  const ringSegs = ud.waterFiligreeRingSegs;
  for (let rf = 0; rf < ringFracs.length; rf++) {
    const rad = evoRange * ringFracs[rf];
    for (let k = 0; k < ringSegs; k++) {
      const a0 = (k / ringSegs) * Math.PI * 2;
      const a1 = ((k + 1) / ringSegs) * Math.PI * 2;
      const x0 = p.pos.x + Math.cos(a0) * rad;
      const z0 = p.pos.z + Math.sin(a0) * rad;
      const x1 = p.pos.x + Math.cos(a1) * rad;
      const z1 = p.pos.z + Math.sin(a1) * rad;
      fPos[fPtr] = x0;
      fPos[fPtr + 1] = getTerrainY(x0, z0) + 0.22;
      fPos[fPtr + 2] = z0;
      fPos[fPtr + 3] = x1;
      fPos[fPtr + 4] = getTerrainY(x1, z1) + 0.22;
      fPos[fPtr + 5] = z1;
      fPtr += 6;
    }
  }
  ud.water360Filigree.geometry.attributes.position.needsUpdate = true;
  ud.water360Filigree.material.opacity = 0.40 + 0.14 * Math.sin(ud.animTime * 4.5);
}

function updateWater360Outer(ud, p, evoRange) {
  updateTerrainRingWorld(ud.water360OuterBand, {
    cx: p.pos.x,
    cz: p.pos.z,
    rInner: evoRange - 0.85,
    rOuter: evoRange,
    yOffset: 0.22,
    terrainOnly: true,
    onCanopy: false
  });
  ud.water360OuterBand.material.opacity = 0.34 + 0.14 * Math.sin(ud.animTime * 5.0);

  const olPos = ud.water360OuterLinePos;
  const olSegs = ud.waterOuterLineSegs;
  for (let k = 0; k < olSegs; k++) {
    const theta = (k / olSegs) * Math.PI * 2;
    const wx = p.pos.x + Math.cos(theta) * evoRange;
    const wz = p.pos.z + Math.sin(theta) * evoRange;
    const idx = k * 3;
    olPos[idx] = wx;
    olPos[idx + 1] = getTerrainY(wx, wz) + 0.25;
    olPos[idx + 2] = wz;
  }
  ud.water360OuterLine.geometry.attributes.position.needsUpdate = true;
  ud.water360OuterLine.material.opacity = 0.84 + 0.12 * Math.sin(ud.animTime * 5.0);
}

function updateWaterStandardPreview(ud, frame) {
  const { p, dirX, dirZ, rightX, rightZ } = frame;
  const halfW = WATER_ULT_WIDTH * 0.5;
  const zStart = 1.2;
  const zEnd = zStart + WATER_ULT_RANGE;
  updateTerrainGridOriented(ud.waterArea, { ox: p.pos.x, oz: p.pos.z, dirX, dirZ, rightX, rightZ, halfW, zStart, zEnd, yOffset: 0.20 });
  ud.waterArea.material.opacity = 0.20 + 0.08 * Math.sin(ud.animTime * 6);

  const olPos = ud.waterOutlinePos;
  let oPtr = 0;
  const pushOutlinePt = (lx, lz) => {
    const wx = p.pos.x + dirX * lz + rightX * lx;
    const wz = p.pos.z + dirZ * lz + rightZ * lx;
    olPos[oPtr] = wx;
    olPos[oPtr + 1] = getTerrainY(wx, wz) + 0.24;
    olPos[oPtr + 2] = wz;
    oPtr += 3;
  };
  for (let i = 0; i < 10; i++) pushOutlinePt(-halfW + WATER_ULT_WIDTH * (i / 10), zStart);
  for (let i = 0; i < 20; i++) pushOutlinePt(halfW, zStart + WATER_ULT_RANGE * (i / 20));
  for (let i = 0; i < 10; i++) pushOutlinePt(halfW - WATER_ULT_WIDTH * (i / 10), zEnd);
  for (let i = 0; i < 20; i++) pushOutlinePt(-halfW, zEnd - WATER_ULT_RANGE * (i / 20));
  ud.waterOutline.geometry.attributes.position.needsUpdate = true;

  const sweepZ = 1.5 + ((ud.animTime * 18) % WATER_ULT_RANGE);
  updateTerrainGridOriented(ud.waterSweep, { ox: p.pos.x, oz: p.pos.z, dirX, dirZ, rightX, rightZ, halfW, zStart: sweepZ - 0.55, zEnd: sweepZ + 0.55, yOffset: 0.25 });
}

function updateWaterPreview(ud, frame) {
  const { p, evolved } = frame;
  ud.waterArea.visible = !evolved;
  ud.waterOutline.visible = !evolved;
  ud.waterSweep.visible = !evolved;
  ud.water360Area.visible = evolved;
  ud.water360Filigree.visible = evolved;
  ud.water360OuterBand.visible = evolved;
  ud.water360OuterLine.visible = evolved;

  if (evolved) {
    const evoRange = WATER_ULT_RANGE * 1.45;
    const rInner = 1.6;
    updateWater360Area(ud, p, evoRange, rInner);
    updateWater360Filigree(ud, p, evoRange, rInner);
    updateWater360Outer(ud, p, evoRange);
  } else {
    updateWaterStandardPreview(ud, frame);
  }
}

function updateLeafArrowPreview(ud, frame) {
  const { p, dirX, dirZ, rightX, rightZ, evolved, onCanopy } = frame;
  const shaftStartZ = 1.3;
  const headBaseZ = evolved ? 20.0 : 15.0;
  const tipZ = evolved ? 24.8 : 19.2;
  const shaftHalfW = evolved ? 1.12 : 0.92;
  const headHalfW = evolved ? 2.85 : 2.35;

  const arrPos = ud.leafArrowPos;
  let aPtr = 0;
  const writeArrowVert = (lx, lz, yOff) => {
    const wx = p.pos.x + dirX * lz + rightX * lx;
    const wz = p.pos.z + dirZ * lz + rightZ * lx;
    arrPos[aPtr] = wx;
    arrPos[aPtr + 1] = getUltPreviewSurfaceY(wx, wz, onCanopy) + yOff;
    arrPos[aPtr + 2] = wz;
    aPtr += 3;
  };
  for (let r = 0; r <= ud.leafShaftRows; r++) {
    const lz = shaftStartZ + (headBaseZ - shaftStartZ) * (r / ud.leafShaftRows);
    writeArrowVert(-shaftHalfW, lz, 0.20);
    writeArrowVert(shaftHalfW, lz, 0.20);
  }
  for (let r = 0; r <= ud.leafHeadRows; r++) {
    const u = r / ud.leafHeadRows;
    const lz = headBaseZ + (tipZ - headBaseZ) * u;
    const hw = headHalfW * (1 - u) + 0.02 * u;
    writeArrowVert(-hw, lz, 0.20);
    writeArrowVert(hw, lz, 0.20);
  }
  ud.leafArrowFill.geometry.attributes.position.needsUpdate = true;
  ud.leafArrowFill.material.opacity = 0.24 + 0.10 * Math.sin(ud.animTime * 6);

  const loPos = ud.leafArrowOutlinePos;
  let loPtr = 0;
  const pushArrowEdge = (x0, z0, x1, z1, steps) => {
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      const lx = x0 + (x1 - x0) * u;
      const lz = z0 + (z1 - z0) * u;
      const wx = p.pos.x + dirX * lz + rightX * lx;
      const wz = p.pos.z + dirZ * lz + rightZ * lx;
      loPos[loPtr] = wx;
      loPos[loPtr + 1] = getUltPreviewSurfaceY(wx, wz, onCanopy) + 0.24;
      loPos[loPtr + 2] = wz;
      loPtr += 3;
    }
  };
  pushArrowEdge(-shaftHalfW, shaftStartZ, shaftHalfW, shaftStartZ, 4);
  pushArrowEdge(shaftHalfW, shaftStartZ, shaftHalfW, headBaseZ, 14);
  pushArrowEdge(shaftHalfW, headBaseZ, headHalfW, headBaseZ, 3);
  pushArrowEdge(headHalfW, headBaseZ, 0, tipZ, 7);
  pushArrowEdge(0, tipZ, -headHalfW, headBaseZ, 7);
  pushArrowEdge(-headHalfW, headBaseZ, -shaftHalfW, headBaseZ, 3);
  pushArrowEdge(-shaftHalfW, headBaseZ, -shaftHalfW, shaftStartZ, 14);
  ud.leafArrowOutline.geometry.attributes.position.needsUpdate = true;
  return headBaseZ;
}

function updateLeafPreview(ud, frame) {
  const { p, aimAngle, dirX, dirZ, rightX, rightZ, evolved, onCanopy } = frame;
  const ringScale = 1 + 0.14 * Math.sin(ud.animTime * 8);
  updateTerrainRingWorld(ud.leafRing, {
    cx: p.pos.x,
    cz: p.pos.z,
    rInner: 1.15 * ringScale,
    rOuter: 1.65 * ringScale,
    yOffset: 0.21,
    terrainOnly: false,
    onCanopy
  });

  const headBaseZ = updateLeafArrowPreview(ud, frame);
  const treeCount = evolved ? 6 : 5;
  const firstTreeZ = 3.1;
  const lastTreeZ = headBaseZ - 0.55;
  const shimmer = 0.85 + 0.15 * Math.sin(ud.animTime * 6.5);
  ud.holoTreeFillMat.opacity = 0.20 * shimmer;
  ud.holoTreeWireMat.opacity = 0.56 * shimmer;
  ud.holoTreeBaseRingMat.opacity = 0.65 * shimmer;

  for (let t = 0; t < ud.leafTreeHolograms.length; t++) {
    const unit = ud.leafTreeHolograms[t];
    if (t >= treeCount) {
      unit.visible = false;
      continue;
    }
    unit.visible = true;
    const frac = treeCount > 1 ? t / (treeCount - 1) : 0.5;
    const tz = firstTreeZ + (lastTreeZ - firstTreeZ) * frac;
    const lat = (t % 2 === 0 ? -0.18 : 0.18) * (evolved ? 1.15 : 1.0);
    const wx = p.pos.x + dirX * tz + rightX * lat;
    const wz = p.pos.z + dirZ * tz + rightZ * lat;
    unit.position.set(wx, getUltPreviewSurfaceY(wx, wz, onCanopy) + 0.18, wz);
    unit.rotation.y = aimAngle + (t % 2 === 0 ? 0.18 : -0.18);

    const cycle = ((ud.animTime * 0.72 - t * 0.11) % 1 + 1) % 1;
    const emerge =
      cycle < 0.55
        ? 0.36 + 0.64 * Math.sin((cycle / 0.55) * Math.PI * 0.5)
        : 1.0 - 0.08 * ((cycle - 0.55) / 0.45);
    const xzScale = (0.86 + 0.14 * emerge) * (evolved ? 1.20 : 1.0);
    unit.scale.set(xzScale, emerge * (evolved ? 1.48 : 1.0), xzScale);
  }
}

export function updateUltimatePreview3D(dt) {
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!state.ultPreviewActive || !canPlayerUseUltimate(p, false)) {
    if (state.ultPreviewActive) {
      state.ultPreviewActive = false;
      updateUltHudWidget();
    }
    if (ultState.previewGroup) ultState.previewGroup.visible = false;
    return;
  }

  const pg = ensureUltPreviewGroup();
  pg.visible = true;
  pg.position.set(0, 0, 0);
  pg.rotation.set(0, 0, 0);
  const ud = pg.userData;
  ud.animTime += dt;

  const aimAngle = getUltimateAimAngle(p);
  state.ultPreviewAimAngle = aimAngle;
  _previewFrame.p = p;
  _previewFrame.aimAngle = aimAngle;
  _previewFrame.dirX = Math.sin(aimAngle);
  _previewFrame.dirZ = Math.cos(aimAngle);
  _previewFrame.rightX = Math.cos(aimAngle);
  _previewFrame.rightZ = -Math.sin(aimAngle);
  _previewFrame.evolved = hasPlayerUltEvo(p);
  _previewFrame.onCanopy = !!p.onCanopy;

  ud.fireGroup.visible = p.color === 'red';
  ud.waterGroup.visible = p.color === 'blue';
  ud.leafGroup.visible = p.color === 'green';

  if (p.color === 'red') updateFirePreview(ud, _previewFrame);
  else if (p.color === 'blue') updateWaterPreview(ud, _previewFrame);
  else updateLeafPreview(ud, _previewFrame);
}
