import { COLORS, FIELD, state, ctx } from '../state.js';
import { balls, camera, players } from '../render3d.js';
import {
  VISION_SPEC,
  castVisionRay2D,
  fillPlayerVisionPolygonFlat,
  getActiveMapMeta,
  updateTeamVisionState
} from '../world.js';
import { activeFireLasers, activeLeafWalls, activeWaterWaves } from '../ultimates.js';
import { minimapConeXY, uiState } from './shared.js';
import { buildMinimapStaticLayers, syncMinimapCanvasDimensions } from './minimap_static.js';

const toX = (wx, W) => ((wx + FIELD.width / 2) / FIELD.width) * W;
const toY = (wz, H) => ((wz + FIELD.depth / 2) / FIELD.depth) * H;
const toR = (wr, W) => (wr / FIELD.width) * W;

const FRUSTUM_CORNER_X = [-1, 1, 1, -1];
const FRUSTUM_CORNER_Y = [1, 1, -1, -1];
const FRUSTUM_PTS_X = new Float64Array(4);
const FRUSTUM_PTS_Y = new Float64Array(4);

export function cycleMinimapVisionMode() {
  const order = ['both', 'myTeam', 'omniscient'];
  const idx = order.indexOf(state.minimapVisionMode);
  state.minimapVisionMode = order[(idx + 1) % order.length];
  const btn = document.getElementById('btn-minimap-vision');
  if (btn) {
    btn.textContent =
      state.minimapVisionMode === 'both'
        ? '👁️ 2 Équipes'
        : state.minimapVisionMode === 'myTeam'
        ? '👁️ Mon Équipe'
        : '👁️ Omniscient';
  }
  renderMinimap();
}

export function toggleMinimapSize() {
  state.minimapExpanded = !state.minimapExpanded;
  const panel = document.getElementById('minimap-panel');
  if (panel) panel.classList.toggle('minimap-expanded', state.minimapExpanded);
  syncMinimapCanvasDimensions();
  renderMinimap();
}

function drawMinimapPlayerVisionCone(mCtx, W, H, p) {
  const count = fillPlayerVisionPolygonFlat(p, 26, 8, minimapConeXY);
  if (count < 3) return;
  const px = toX(p.pos.x, W);
  const py = toY(p.pos.z, H);
  const maxRange = p.pos.y >= 3.8 ? VISION_SPEC.canopyRange : VISION_SPEC.groundRange;
  const radPx = Math.max(8, toR(maxRange, W));

  const grad = mCtx.createRadialGradient(px, py, 2, px, py, radPx);
  if (p.team === 'ally') {
    grad.addColorStop(0, 'rgba(250, 204, 21, 0.36)');
    grad.addColorStop(0.75, 'rgba(250, 204, 21, 0.16)');
    grad.addColorStop(1, 'rgba(250, 204, 21, 0.07)');
  } else {
    grad.addColorStop(0, 'rgba(192, 132, 252, 0.34)');
    grad.addColorStop(0.75, 'rgba(192, 132, 252, 0.15)');
    grad.addColorStop(1, 'rgba(192, 132, 252, 0.06)');
  }

  mCtx.beginPath();
  mCtx.moveTo(toX(minimapConeXY[0], W), toY(minimapConeXY[1], H));
  for (let i = 1; i < count; i++) {
    mCtx.lineTo(toX(minimapConeXY[i * 2], W), toY(minimapConeXY[i * 2 + 1], H));
  }
  mCtx.closePath();
  mCtx.fillStyle = grad;
  mCtx.fill();
  mCtx.strokeStyle = p.team === 'ally' ? 'rgba(250, 204, 21, 0.72)' : 'rgba(192, 132, 252, 0.70)';
  mCtx.lineWidth = 1.35;
  mCtx.stroke();
}

function drawMinimapBeacons(mCtx, W, H, visionMode) {
  const beacons = ctx.entities.activeToolBeacons;
  if (!beacons || beacons.length === 0) return;
  for (let i = 0; i < beacons.length; i++) {
    const b = beacons[i];
    if (b.team !== state.myTeam && visionMode !== 'omniscient') continue;
    const bx = toX(b.x, W);
    const bz = toY(b.z, H);
    const steps = 20;
    mCtx.save();
    mCtx.beginPath();
    for (let s = 0; s < steps; s++) {
      const ang = (s / steps) * Math.PI * 2;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      const d = castVisionRay2D(b.x, b.y, b.z, dx, dz, b.visionRadius);
      const px = toX(b.x + dx * d, W);
      const py = toY(b.z + dz * d, H);
      if (s === 0) mCtx.moveTo(px, py);
      else mCtx.lineTo(px, py);
    }
    mCtx.closePath();
    mCtx.fillStyle = b.team === 'ally' ? 'rgba(250, 204, 21, 0.16)' : 'rgba(192, 132, 252, 0.16)';
    mCtx.fill();
    mCtx.strokeStyle = b.team === 'ally' ? 'rgba(250, 204, 21, 0.55)' : 'rgba(192, 132, 252, 0.55)';
    mCtx.lineWidth = 1;
    mCtx.stroke();
    mCtx.fillStyle = b.team === 'ally' ? '#facc15' : '#c084fc';
    mCtx.beginPath();
    mCtx.arc(bx, bz, 3.2, 0, Math.PI * 2);
    mCtx.fill();
    mCtx.restore();
  }
}

function drawMinimapToolFX(mCtx, W, H) {
  const patches = ctx.entities.activeSlidePatches;
  if (patches) {
    for (let i = 0; i < patches.length; i++) {
      const sp = patches[i];
      mCtx.save();
      mCtx.fillStyle = 'rgba(125, 211, 252, 0.45)';
      mCtx.beginPath();
      mCtx.arc(toX(sp.x, W), toY(sp.z, H), Math.max(1.8, toR(sp.radius, W)), 0, Math.PI * 2);
      mCtx.fill();
      mCtx.restore();
    }
  }
  const pads = ctx.entities.activeToolPads;
  if (pads) {
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      mCtx.save();
      mCtx.strokeStyle = '#38bdf8';
      mCtx.lineWidth = 2.5;
      mCtx.beginPath();
      mCtx.moveTo(toX(pad.x - pad.dirX * 1.1, W), toY(pad.z - pad.dirZ * 1.1, H));
      mCtx.lineTo(toX(pad.x + pad.dirX * 1.3, W), toY(pad.z + pad.dirZ * 1.3, H));
      mCtx.stroke();
      mCtx.restore();
    }
  }
  const walls = ctx.entities.activeToolWalls;
  if (walls) {
    for (let i = 0; i < walls.length; i++) {
      const tw = walls[i];
      mCtx.save();
      mCtx.strokeStyle = tw.team === 'ally' ? '#facc15' : '#c084fc';
      mCtx.lineWidth = 3.2;
      mCtx.beginPath();
      mCtx.moveTo(toX(tw.ax, W), toY(tw.az, H));
      mCtx.lineTo(toX(tw.bx, W), toY(tw.bz, H));
      mCtx.stroke();
      mCtx.restore();
    }
  }
}

function drawMinimapUltFX(mCtx, W, H) {
  for (let w = 0; w < activeLeafWalls.length; w++) {
    const wall = activeLeafWalls[w];
    if (wall.nodes.length === 0) continue;
    mCtx.save();
    mCtx.strokeStyle = wall.phase === 'grown' ? '#22c55e' : 'rgba(74, 222, 128, 0.65)';
    mCtx.lineWidth = wall.phase === 'grown' ? 3.5 : 1.8;
    mCtx.beginPath();
    for (let i = 0; i < wall.nodes.length; i++) {
      const nd = wall.nodes[i];
      if (i === 0) mCtx.moveTo(toX(nd.x, W), toY(nd.z, H));
      else mCtx.lineTo(toX(nd.x, W), toY(nd.z, H));
    }
    mCtx.stroke();
    mCtx.restore();
  }
  for (let w = 0; w < activeWaterWaves.length; w++) {
    const wave = activeWaterWaves[w];
    mCtx.save();
    mCtx.fillStyle = 'rgba(56, 189, 248, 0.85)';
    for (let i = 0; i < wave.segments.length; i++) {
      const seg = wave.segments[i];
      if (!seg.active) continue;
      mCtx.beginPath();
      mCtx.arc(toX(seg.x, W), toY(seg.z, H), 2.3, 0, Math.PI * 2);
      mCtx.fill();
    }
    mCtx.restore();
  }
  for (let i = 0; i < activeFireLasers.length; i++) {
    const f = activeFireLasers[i];
    mCtx.save();
    mCtx.strokeStyle = f.phase === 'telegraph' ? 'rgba(255, 107, 0, 0.6)' : '#ffffff';
    mCtx.lineWidth = f.phase === 'telegraph' ? 1.5 : 2.6;
    mCtx.beginPath();
    mCtx.moveTo(toX(f.ox, W), toY(f.oz, H));
    const len = f.phase === 'telegraph' ? f.maxLen : f.currentLen;
    mCtx.lineTo(toX(f.ox + f.dirX * len, W), toY(f.oz + f.dirZ * len, H));
    mCtx.stroke();
    mCtx.restore();
  }
}

function drawMinimapBalls(mCtx, W, H, visionMode) {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.tutorialHidden || b.state === 'scored') continue;
    if (
      b.state === 'carried' &&
      b.carrier &&
      b.carrier.team !== state.myTeam &&
      !(b.carrier.visibleTo && b.carrier.visibleTo[state.myTeam]) &&
      visionMode !== 'omniscient'
    ) {
      continue;
    }
    mCtx.beginPath();
    mCtx.arc(toX(b.pos.x, W), toY(b.pos.z, H), 3.6, 0, Math.PI * 2);
    mCtx.fillStyle = COLORS[b.color] ? COLORS[b.color].css : '#fff';
    mCtx.fill();
    mCtx.strokeStyle = '#ffffff';
    mCtx.lineWidth = 1.2;
    mCtx.stroke();
  }
}

function drawMinimapPlayers(mCtx, W, H, visionMode) {
  let spottedCount = 0;
  let totalVisibleEnemies = 0;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.tutorialHidden) continue;
    const isMyTeam = p.team === state.myTeam;
    if (!isMyTeam) totalVisibleEnemies++;
    const isVisibleToTeam = isMyTeam || !!(p.visibleTo && p.visibleTo[state.myTeam]);
    if (!isMyTeam && isVisibleToTeam) spottedCount++;
    if (!isVisibleToTeam && visionMode !== 'omniscient') continue;

    const px = toX(p.pos.x, W);
    const py = toY(p.pos.z, H);
    const isControlled = isMyTeam && p.role === state.controlledRole;
    const markerR = isControlled ? 6.2 : 5.2;
    const fx = Math.sin(p.facingAngle || 0);
    const fz = Math.cos(p.facingAngle || 0);

    mCtx.beginPath();
    mCtx.moveTo(px + fx * (markerR + 4.2), py + fz * (markerR + 4.2));
    mCtx.lineTo(px - fz * 3.0 + fx * (markerR - 1), py + fx * 3.0 + fz * (markerR - 1));
    mCtx.lineTo(px + fz * 3.0 + fx * (markerR - 1), py - fx * 3.0 + fz * (markerR - 1));
    mCtx.closePath();
    mCtx.fillStyle = p.team === 'ally' ? '#fde047' : '#d8b4fe';
    mCtx.fill();

    const showColor = isMyTeam || p.currentlySeeingBack || p.backRevealed || p.state === 'sitting' || p.state === 'rule1';
    mCtx.beginPath();
    mCtx.arc(px, py, markerR, 0, Math.PI * 2);
    mCtx.fillStyle = showColor && COLORS[p.color] ? COLORS[p.color].css : '#475569';
    mCtx.fill();
    mCtx.lineWidth = isControlled ? 2.2 : 1.5;
    mCtx.strokeStyle = isControlled ? '#38bdf8' : p.team === 'ally' ? '#fde047' : '#c084fc';
    mCtx.stroke();

    mCtx.fillStyle = '#ffffff';
    mCtx.font = 'bold 7.5px sans-serif';
    mCtx.textAlign = 'center';
    mCtx.textBaseline = 'middle';
    mCtx.fillText(p.role, px, py + 0.5);
  }
  return { spottedCount, totalVisibleEnemies };
}

function drawMinimapCameraFrustum(mCtx, W, H) {
  if (state.cameraMode !== 'aerial' || !camera || !uiState.mobaRaycaster || !uiState.mobaPointerNDC) return;
  camera.updateMatrixWorld();
  const planeY = state.mobaCamY || 0;
  for (let cIdx = 0; cIdx < 4; cIdx++) {
    uiState.mobaPointerNDC.set(FRUSTUM_CORNER_X[cIdx], FRUSTUM_CORNER_Y[cIdx]);
    uiState.mobaRaycaster.setFromCamera(uiState.mobaPointerNDC, camera);
    const ray = uiState.mobaRaycaster.ray;
    if (ray.direction.y >= -0.02) return;
    const t = (planeY - ray.origin.y) / ray.direction.y;
    if (!Number.isFinite(t) || t <= 0) return;
    const wx = Math.max(-FIELD.width / 2, Math.min(FIELD.width / 2, ray.origin.x + ray.direction.x * t));
    const wz = Math.max(-FIELD.depth / 2, Math.min(FIELD.depth / 2, ray.origin.z + ray.direction.z * t));
    FRUSTUM_PTS_X[cIdx] = toX(wx, W);
    FRUSTUM_PTS_Y[cIdx] = toY(wz, H);
  }
  mCtx.save();
  mCtx.beginPath();
  mCtx.moveTo(FRUSTUM_PTS_X[0], FRUSTUM_PTS_Y[0]);
  for (let cIdx = 1; cIdx < 4; cIdx++) mCtx.lineTo(FRUSTUM_PTS_X[cIdx], FRUSTUM_PTS_Y[cIdx]);
  mCtx.closePath();
  mCtx.fillStyle = 'rgba(248, 250, 252, 0.06)';
  mCtx.fill();
  mCtx.strokeStyle = 'rgba(248, 250, 252, 0.92)';
  mCtx.lineWidth = 1.4;
  mCtx.stroke();
  mCtx.restore();
}

export function renderMinimap() {
  if (!uiState.minimapCanvas || !uiState.minimapCtx) return;
  updateTeamVisionState();

  const mCtx = uiState.minimapCtx;
  const W = uiState.minimapCanvas.width || 268;
  const H = uiState.minimapCanvas.height || 174;
  const mapMeta = getActiveMapMeta();
  const cacheKey = `${state.mapId}|${W}x${H}`;
  let hasCachedLayers = uiState.minimapStaticKey === cacheKey;
  if (!hasCachedLayers) {
    hasCachedLayers = buildMinimapStaticLayers(W, H, mapMeta);
    if (hasCachedLayers) uiState.minimapStaticKey = cacheKey;
  }

  mCtx.clearRect(0, 0, W, H);
  if (hasCachedLayers && typeof mCtx.drawImage === 'function') {
    mCtx.drawImage(uiState.minimapStaticBgCanvas, 0, 0);
  } else {
    mCtx.fillStyle = mapMeta.minimapBg || '#071122';
    mCtx.fillRect(0, 0, W, H);
  }

  const visionMode = state.minimapVisionMode || 'both';
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.tutorialHidden) continue;
    const show = p.team === state.myTeam || visionMode === 'omniscient' || (visionMode === 'both' && p.visibleTo && p.visibleTo[state.myTeam]);
    if (show) drawMinimapPlayerVisionCone(mCtx, W, H, p);
  }
  drawMinimapBeacons(mCtx, W, H, visionMode);
  if (hasCachedLayers && typeof mCtx.drawImage === 'function') {
    mCtx.drawImage(uiState.minimapStaticFgCanvas, 0, 0);
  }
  drawMinimapToolFX(mCtx, W, H);
  drawMinimapUltFX(mCtx, W, H);
  drawMinimapBalls(mCtx, W, H, visionMode);
  const { spottedCount, totalVisibleEnemies } = drawMinimapPlayers(mCtx, W, H, visionMode);
  drawMinimapCameraFrustum(mCtx, W, H);

  if (uiState.minimapSpottedEl) {
    const nextSpottedTxt = `👁️ ${spottedCount}/${totalVisibleEnemies} vus`;
    if (uiState.minimapLastSpottedTxt !== nextSpottedTxt) {
      uiState.minimapSpottedEl.textContent = nextSpottedTxt;
      uiState.minimapLastSpottedTxt = nextSpottedTxt;
    }
  }
}
