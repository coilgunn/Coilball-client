import { ctx } from '../state.js';
import {
  THREE,
  renderState,
  leafWallBadges,
  players,
  balls,
  getViewportDims
} from './shared.js';
import { initGpuParticleSystem, initBalls } from './ball_fx.js';
import { initPlayers } from './player_mesh.js';

export let container = null;
export let labelsContainer = null;
export let dashCooldownEl = null;
export let dashCooldownPieEl = null;
export let dashCooldownTextEl = null;
export let scene = null;
export let camera = null;
export let renderer = null;
export let ambientLight = null;
export let sunLight = null;
export let rimLight = null;
export let animeGradientMap = null;

function createAnimeGradientMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 6;
  canvas.height = 1;
  const c2d = canvas.getContext('2d');
  // 3 bandes cel-shading franches : ombre anime froide, demi-teinte vive, éclat maximal
  const shades = ['#232946', '#232946', '#9fb3d9', '#9fb3d9', '#ffffff', '#ffffff'];
  shades.forEach((col, i) => {
    c2d.fillStyle = col;
    c2d.fillRect(i, 0, 1, 1);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function initHudElements() {
  container = document.getElementById('canvas-container');
  labelsContainer = document.getElementById('labels-container');
  container.replaceChildren();
  labelsContainer.replaceChildren();

  dashCooldownEl = document.createElement('div');
  dashCooldownEl.id = 'dash-cooldown-widget';
  dashCooldownEl.className = 'hidden';
  dashCooldownPieEl = document.createElement('div');
  dashCooldownPieEl.className = 'dash-cd-pie';
  dashCooldownTextEl = document.createElement('span');
  dashCooldownTextEl.className = 'dash-cd-text';
  dashCooldownTextEl.textContent = '0.0';
  dashCooldownEl.appendChild(dashCooldownPieEl);
  dashCooldownEl.appendChild(dashCooldownTextEl);
  labelsContainer.appendChild(dashCooldownEl);
}

function setupSceneLighting() {
  ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  sunLight = new THREE.DirectionalLight(0xffffff, 1.12);
  sunLight.position.set(-60, 110, 68);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 15;
  sunLight.shadow.camera.far = 280;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.045;
  const d = 128;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  scene.add(sunLight);

  rimLight = new THREE.DirectionalLight(0x38bdf8, 0.38);
  rimLight.position.set(58, 66, -62);
  scene.add(rimLight);
}

export function initRender3d() {
  initHudElements();

  renderState.tmpProjVec = new THREE.Vector3();
  renderState.tmpLeafCamFwd = new THREE.Vector3();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3a6484);
  scene.fog = new THREE.FogExp2(0x3a6484, 0.0022);

  const initVp = getViewportDims();
  camera = new THREE.PerspectiveCamera(60, initVp.w / Math.max(1, initVp.h), 0.45, 520);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(initVp.w, initVp.h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('tabindex', '-1');
  container.appendChild(renderer.domElement);

  setupSceneLighting();

  animeGradientMap = createAnimeGradientMap();
  renderState.animeGradientMap = animeGradientMap;
  initGpuParticleSystem();

  ctx.scene = scene;
  ctx.camera = camera;
  ctx.renderer = renderer;
  ctx.entities.players = players;
  ctx.entities.balls = balls;

  initPlayers();
  initBalls();
}

/** Crée un badge flottant avec compte à rebours et barre de progression pour l'ultimate Feuille. */
export function createLeafDurationBadge() {
  const el = document.createElement('div');
  el.className = 'leaf-duration-badge hidden';
  const topEl = document.createElement('div');
  topEl.className = 'leaf-duration-top';
  const trackEl = document.createElement('div');
  trackEl.className = 'leaf-duration-bar-track';
  const fillEl = document.createElement('div');
  fillEl.className = 'leaf-duration-bar-fill';
  trackEl.appendChild(fillEl);
  el.appendChild(topEl);
  el.appendChild(trackEl);
  labelsContainer.appendChild(el);
  return {
    el,
    topEl,
    fillEl,
    cache: { visible: false, left: '', top: '', text: '', width: '', mode: '' }
  };
}

export function hideLeafDurationBadge(badge) {
  if (!badge || !badge.cache.visible) return;
  badge.el.classList.add('hidden');
  badge.cache.visible = false;
}

function applyLeafDurationBadgeDOM(badge, x, y, labelText, ratio, mode = '') {
  if (!badge) return;
  const leftStr = `${x}px`;
  const topStr = `${y}px`;
  const widthStr = `${(Math.max(0, Math.min(1, ratio)) * 100).toFixed(1)}%`;

  if (!badge.cache.visible) {
    badge.el.classList.remove('hidden');
    badge.cache.visible = true;
  }
  if (badge.cache.mode !== mode) {
    badge.el.classList.toggle('is-sprouting', mode === 'sprouting');
    badge.el.classList.toggle('is-expiring', mode === 'expiring');
    badge.cache.mode = mode;
  }
  if (badge.cache.left !== leftStr) {
    badge.el.style.left = leftStr;
    badge.cache.left = leftStr;
  }
  if (badge.cache.top !== topStr) {
    badge.el.style.top = topStr;
    badge.cache.top = topStr;
  }
  if (badge.cache.text !== labelText) {
    badge.topEl.textContent = labelText;
    badge.cache.text = labelText;
  }
  if (badge.cache.width !== widthStr) {
    badge.fillEl.style.width = widthStr;
    badge.cache.width = widthStr;
  }
}

export function updateLeafDurationBadge(badge, pos, labelText, ratio, mode = '') {
  if (!badge) return;
  const proj = renderState.tmpProjVec;
  proj.set(pos.x, pos.y, pos.z);
  proj.project(camera);
  if (proj.z > 1 || proj.x < -1.08 || proj.x > 1.08 || proj.y < -1.08 || proj.y > 1.08) {
    hideLeafDurationBadge(badge);
    return;
  }

  const { w: vpW, h: vpH } = getViewportDims();
  const halfW = vpW / 2;
  const halfH = vpH / 2;
  const x = Math.round(Math.max(54, Math.min(vpW - 54, proj.x * halfW + halfW)) * 2) / 2;
  const y = Math.round(Math.max(36, Math.min(vpH - 44, -(proj.y * halfH) + halfH)) * 2) / 2;
  applyLeafDurationBadgeDOM(badge, x, y, labelText, ratio, mode);
}

const _leafAcc = {
  camX: 0,
  camY: 0,
  camZ: 0,
  halfW: 0,
  halfH: 0,
  visCount: 0,
  sumX: 0,
  sumY: 0,
  bestScore: Infinity,
  anchorX: 0,
  anchorY: 0
};

function testLeafWallSample(wx, wy, wz, nodeDist, isTopSample, acc) {
  const fwd = renderState.tmpLeafCamFwd;
  const proj = renderState.tmpProjVec;
  const dx = wx - acc.camX;
  const dy = wy - acc.camY;
  const dz = wz - acc.camZ;
  if (dx * fwd.x + dy * fwd.y + dz * fwd.z <= 0.15) return;

  proj.set(wx, wy, wz).project(camera);
  if (proj.z < -1.0 || proj.z > 1.0) return;
  if (Math.abs(proj.x) > 1.04 || Math.abs(proj.y) > 1.04) return;

  const sx = proj.x * acc.halfW + acc.halfW;
  const sy = -(proj.y * acc.halfH) + acc.halfH;
  acc.sumX += sx;
  acc.sumY += sy;
  acc.visCount++;

  const score = nodeDist + (isTopSample ? 0 : 1.5);
  if (score < acc.bestScore) {
    acc.bestScore = score;
    acc.anchorX = sx;
    acc.anchorY = sy;
  }
}

export function updateLeafWallBadgeInView(badge, wall, labelText, ratio, mode = '') {
  if (!badge || !wall || !wall.nodes || wall.nodes.length === 0) return;

  camera.updateMatrixWorld();
  camera.getWorldDirection(renderState.tmpLeafCamFwd);
  const camPos = camera.position;
  const isGrown = wall.phase === 'grown';
  const topH = isGrown ? (wall.evolved ? 4.45 : 2.45) : 1.15;
  const heights = isGrown ? (wall.evolved ? [0.6, 2.4, topH] : [0.4, 1.45, topH]) : [0.3, 1.15];

  const { w: vpW, h: vpH } = getViewportDims();
  const midIdx = (wall.nodes.length - 1) * 0.5;
  _leafAcc.camX = camPos.x;
  _leafAcc.camY = camPos.y;
  _leafAcc.camZ = camPos.z;
  _leafAcc.halfW = vpW / 2;
  _leafAcc.halfH = vpH / 2;
  _leafAcc.visCount = 0;
  _leafAcc.sumX = 0;
  _leafAcc.sumY = 0;
  _leafAcc.bestScore = Infinity;
  _leafAcc.anchorX = 0;
  _leafAcc.anchorY = 0;

  for (let i = 0; i < wall.nodes.length; i++) {
    const nd = wall.nodes[i];
    const distMid = Math.abs(i - midIdx);
    for (let hIdx = 0; hIdx < heights.length; hIdx++) {
      testLeafWallSample(nd.x, nd.y + heights[hIdx], nd.z, distMid, hIdx === heights.length - 1, _leafAcc);
    }
    if (i < wall.nodes.length - 1) {
      const next = wall.nodes[i + 1];
      const mx = (nd.x + next.x) * 0.5;
      const my = (nd.y + next.y) * 0.5;
      const mz = (nd.z + next.z) * 0.5;
      testLeafWallSample(mx, my + 0.5, mz, Math.abs(i + 0.5 - midIdx), false, _leafAcc);
      testLeafWallSample(mx, my + topH * 0.85, mz, Math.abs(i + 0.5 - midIdx), true, _leafAcc);
    }
  }

  if (_leafAcc.visCount === 0) {
    hideLeafDurationBadge(badge);
    return;
  }

  const avgX = _leafAcc.sumX / _leafAcc.visCount;
  const avgY = _leafAcc.sumY / _leafAcc.visCount;
  const targetX = _leafAcc.anchorX * 0.7 + avgX * 0.3;
  const targetY = _leafAcc.anchorY * 0.7 + avgY * 0.3 - (isGrown ? 14 : 10);
  const x = Math.round(Math.max(60, Math.min(vpW - 60, targetX)) * 2) / 2;
  const y = Math.round(Math.max(62, Math.min(vpH - 46, targetY)) * 2) / 2;
  applyLeafDurationBadgeDOM(badge, x, y, labelText, ratio, mode);
}

export function getLeafWallBadge(index) {
  while (leafWallBadges.length <= index) {
    leafWallBadges.push(createLeafDurationBadge());
  }
  return leafWallBadges[index];
}
