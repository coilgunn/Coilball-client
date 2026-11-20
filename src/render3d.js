// ============================================================================
// COILBALL 3D — SCÈNE THREE.JS, MATÉRIAUX ANIME, ENTITÉS 3D & PARTICULES
// ============================================================================

import {
  COLORS,
  FIELD,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_SPEED,
  PASS_CHARGE_SPEC,
  getPassSnapHalfAngle,
  state,
  mp,
  ctx
} from './state.js';

const THREE = ctx.THREE;

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

let _tmpProjVec = null;
let _tmpLeafCamFwd = null;

function getViewportDims() {
  if (ctx.api && typeof ctx.api.getViewportSize === 'function') {
    const vp = ctx.api.getViewportSize();
    if (vp && vp.w > 0 && vp.h > 0) return vp;
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

export function setWorldBuildActive(v) {
  worldBuildActive = !!v;
}

export function initRender3d() {
  container = document.getElementById('canvas-container');
  labelsContainer = document.getElementById('labels-container');
  container.innerHTML = '';
  labelsContainer.innerHTML = '';

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

  _tmpProjVec = new THREE.Vector3();
  _tmpLeafCamFwd = new THREE.Vector3();

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

  animeGradientMap = createAnimeGradientMap();
  initGpuParticleSystem();

  ctx.scene = scene;
  ctx.camera = camera;
  ctx.renderer = renderer;
  ctx.entities.players = players;
  ctx.entities.balls = balls;

  initPlayers();
  initBalls();
}
export const leafWallBadges = [];

/** Crée un badge flottant avec compte à rebours et barre de progression pour l'ultimate Feuille. */
function createLeafDurationBadge() {
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

export function updateLeafDurationBadge(badge, worldX, worldY, worldZ, labelText, ratio, mode = '') {
  if (!badge) return;
  _tmpProjVec.set(worldX, worldY, worldZ);
  _tmpProjVec.project(camera);
  if (
    _tmpProjVec.z > 1 ||
    _tmpProjVec.x < -1.08 ||
    _tmpProjVec.x > 1.08 ||
    _tmpProjVec.y < -1.08 ||
    _tmpProjVec.y > 1.08
  ) {
    hideLeafDurationBadge(badge);
    return;
  }

  const { w: vpW, h: vpH } = getViewportDims();
  const halfW = vpW / 2;
  const halfH = vpH / 2;
  const x = Math.round(Math.max(54, Math.min(vpW - 54, _tmpProjVec.x * halfW + halfW)) * 2) / 2;
  const y = Math.round(Math.max(36, Math.min(vpH - 44, -(_tmpProjVec.y * halfH) + halfH)) * 2) / 2;
  applyLeafDurationBadgeDOM(badge, x, y, labelText, ratio, mode);
}

export function updateLeafWallBadgeInView(badge, wall, labelText, ratio, mode = '') {
  if (!badge || !wall || !wall.nodes || wall.nodes.length === 0) return;

  camera.updateMatrixWorld();
  camera.getWorldDirection(_tmpLeafCamFwd);
  const camPos = camera.position;
  const isGrown = wall.phase === 'grown';
  const topH = isGrown ? (wall.evolved ? 4.45 : 2.45) : 1.15;
  const heights = isGrown ? (wall.evolved ? [0.6, 2.4, topH] : [0.4, 1.45, topH]) : [0.3, 1.15];

  const { w: vpW, h: vpH } = getViewportDims();
  const halfW = vpW / 2;
  const halfH = vpH / 2;
  const midIdx = (wall.nodes.length - 1) * 0.5;

  let visCount = 0;
  let sumX = 0;
  let sumY = 0;
  let bestScore = Infinity;
  let anchorX = 0;
  let anchorY = 0;

  const testSample = (wx, wy, wz, nodeDist, isTopSample) => {
    const dx = wx - camPos.x;
    const dy = wy - camPos.y;
    const dz = wz - camPos.z;
    if (dx * _tmpLeafCamFwd.x + dy * _tmpLeafCamFwd.y + dz * _tmpLeafCamFwd.z <= 0.15) return;

    _tmpProjVec.set(wx, wy, wz).project(camera);
    if (_tmpProjVec.z < -1.0 || _tmpProjVec.z > 1.0) return;
    if (Math.abs(_tmpProjVec.x) <= 1.04 && Math.abs(_tmpProjVec.y) <= 1.04) {
      const sx = _tmpProjVec.x * halfW + halfW;
      const sy = -(_tmpProjVec.y * halfH) + halfH;
      sumX += sx;
      sumY += sy;
      visCount++;

      const score = nodeDist + (isTopSample ? 0 : 1.5);
      if (score < bestScore) {
        bestScore = score;
        anchorX = sx;
        anchorY = sy;
      }
    }
  };

  for (let i = 0; i < wall.nodes.length; i++) {
    const nd = wall.nodes[i];
    const distMid = Math.abs(i - midIdx);
    for (let hIdx = 0; hIdx < heights.length; hIdx++) {
      testSample(nd.x, nd.y + heights[hIdx], nd.z, distMid, hIdx === heights.length - 1);
    }
    if (i < wall.nodes.length - 1) {
      const next = wall.nodes[i + 1];
      const mx = (nd.x + next.x) * 0.5;
      const my = (nd.y + next.y) * 0.5;
      const mz = (nd.z + next.z) * 0.5;
      testSample(mx, my + 0.5, mz, Math.abs(i + 0.5 - midIdx), false);
      testSample(mx, my + topH * 0.85, mz, Math.abs(i + 0.5 - midIdx), true);
    }
  }

  if (visCount === 0) {
    hideLeafDurationBadge(badge);
    return;
  }

  const avgX = sumX / visCount;
  const avgY = sumY / visCount;
  const targetX = anchorX * 0.7 + avgX * 0.3;
  const targetY = anchorY * 0.7 + avgY * 0.3 - (isGrown ? 14 : 10);
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

let worldBuildActive = false;
export const worldMaterialCache = new Map();

function getWorldCachedMaterial(key, factory) {
  let mat = worldMaterialCache.get(key);
  if (!mat) {
    mat = factory();
    worldMaterialCache.set(key, mat);
  }
  return mat;
}

const DECOR_DARKEN_FACTOR = 0.56;

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
    worldBuildActive && !matExtra.emissive && !keepBright ? darkenDecorHex(colorHex) : colorHex;
  const factory = () =>
    new THREE.MeshToonMaterial(
      Object.assign({ color: finalHex, gradientMap: animeGradientMap }, matExtra)
    );
  if (!worldBuildActive) return factory();
  return getWorldCachedMaterial(`toon|${finalHex}|${JSON.stringify(matExtra)}`, factory);
}

export function createBasicMat(props = {}) {
  const { keepBright, ...matProps } = props || {};
  if (
    worldBuildActive &&
    !keepBright &&
    typeof matProps.color === 'number' &&
    matProps.color !== 0xffffff
  ) {
    matProps.color = darkenDecorHex(matProps.color, 0.56);
  }
  const factory = () => new THREE.MeshBasicMaterial(matProps);
  if (!worldBuildActive) return factory();
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
    (worldBuildActive ? getWorldCachedMaterial(`outline|${outlineColor}`, factory) : factory());
  const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);
  if (typeof scaleFactor === 'number') {
    outlineMesh.scale.setScalar(scaleFactor);
  } else {
    outlineMesh.scale.copy(scaleFactor);
  }
  mesh.add(outlineMesh);
  return outlineMesh;
}

// --- TEXTURES DYNAMIQUES POUR DOSSARDS (DOS : FLAMME / GOUTTE / FEUILLE), POITRINE & VISAGE ANIME ---
const dossardTextures = {};

function drawDossardElementalSymbol(c2d, colorKey) {
  c2d.save();
  c2d.lineJoin = 'round';
  c2d.lineCap = 'round';

  if (colorKey === 'red') {
    // 🔥 SYMBOLE FLAMME (sur le Rouge) : Silhouette de flamme anime à 3 pointes + cœur ardent
    const drawFlamePath = () => {
      c2d.beginPath();
      c2d.moveTo(128, 44);
      // Langue principale droite
      c2d.bezierCurveTo(164, 78, 192, 114, 184, 152);
      // Pointe latérale droite
      c2d.bezierCurveTo(196, 138, 200, 122, 196, 108);
      c2d.bezierCurveTo(212, 136, 202, 178, 170, 198);
      // Base arrondie de la flamme
      c2d.bezierCurveTo(146, 212, 110, 212, 86, 198);
      // Flanc gauche avec langue latérale gauche
      c2d.bezierCurveTo(54, 178, 46, 134, 66, 102);
      c2d.bezierCurveTo(62, 120, 68, 136, 78, 144);
      c2d.bezierCurveTo(68, 108, 96, 76, 128, 44);
      c2d.closePath();
    };

    // Contour noir manga épais
    drawFlamePath();
    c2d.lineWidth = 14;
    c2d.strokeStyle = '#0f172a';
    c2d.stroke();

    // Corps de la flamme blanc/jaune très contrasté sur le fond rouge
    const grad = c2d.createLinearGradient(128, 44, 128, 206);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#fef08a');
    grad.addColorStop(1, '#facc15');
    c2d.fillStyle = grad;
    c2d.fill();

    // Cœur intérieur de la flamme
    c2d.beginPath();
    c2d.moveTo(128, 102);
    c2d.bezierCurveTo(150, 128, 158, 156, 146, 180);
    c2d.bezierCurveTo(136, 196, 120, 196, 110, 180);
    c2d.bezierCurveTo(98, 156, 106, 128, 128, 102);
    c2d.closePath();
    c2d.fillStyle = '#ffffff';
    c2d.fill();
    c2d.lineWidth = 5;
    c2d.strokeStyle = '#ea580c';
    c2d.stroke();
  } else if (colorKey === 'blue') {
    // 💧 SYMBOLE GOUTTE (sur le Bleu) : Goutte d'eau anime pure avec reflet croissant
    const drawDropPath = () => {
      c2d.beginPath();
      c2d.moveTo(128, 46);
      c2d.bezierCurveTo(154, 88, 186, 124, 186, 154);
      c2d.arc(128, 154, 58, 0, Math.PI, false);
      c2d.bezierCurveTo(70, 124, 102, 88, 128, 46);
      c2d.closePath();
    };

    // Contour noir manga épais
    drawDropPath();
    c2d.lineWidth = 14;
    c2d.strokeStyle = '#0f172a';
    c2d.stroke();

    // Remplissage goutte blanc glacé / cyan clair très lisible de loin
    const grad = c2d.createLinearGradient(96, 56, 160, 204);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.65, '#e0f2fe');
    grad.addColorStop(1, '#7dd3fc');
    c2d.fillStyle = grad;
    c2d.fill();

    // Reflet anime brillant en croissant sur le côté gauche de la goutte
    c2d.beginPath();
    c2d.arc(128, 154, 38, Math.PI * 0.58, Math.PI * 1.12, false);
    c2d.lineWidth = 11;
    c2d.strokeStyle = '#ffffff';
    c2d.stroke();

    // Petite bulle de lumière en haut du reflet
    c2d.beginPath();
    c2d.arc(104, 112, 6.5, 0, Math.PI * 2);
    c2d.fillStyle = '#ffffff';
    c2d.fill();
  } else {
    // 🌿 SYMBOLE FEUILLE (sur le Vert) : Feuille anime inclinée avec tige et nervures
    const drawLeafPath = () => {
      c2d.beginPath();
      // Pointe supérieure droite de la feuille
      c2d.moveTo(182, 56);
      // Courbe ventrale droite vers la base
      c2d.bezierCurveTo(192, 118, 162, 178, 92, 184);
      // Courbe dorsale gauche vers la pointe
      c2d.bezierCurveTo(76, 124, 118, 68, 182, 56);
      c2d.closePath();
    };

    // Tige (pétiole) en bas à gauche
    c2d.beginPath();
    c2d.moveTo(96, 180);
    c2d.quadraticCurveTo(74, 196, 62, 206);
    c2d.lineWidth = 18;
    c2d.strokeStyle = '#0f172a';
    c2d.stroke();
    c2d.lineWidth = 9;
    c2d.strokeStyle = '#fef08a';
    c2d.stroke();

    // Contour noir manga épais de la feuille
    drawLeafPath();
    c2d.lineWidth = 14;
    c2d.strokeStyle = '#0f172a';
    c2d.stroke();

    // Remplissage vert-citron / blanc lumineux très contrasté sur le dossard vert
    const grad = c2d.createLinearGradient(84, 184, 182, 56);
    grad.addColorStop(0, '#dcfce7');
    grad.addColorStop(0.55, '#fef9c3');
    grad.addColorStop(1, '#ffffff');
    c2d.fillStyle = grad;
    c2d.fill();

    // Nervure centrale et nervures latérales
    c2d.beginPath();
    c2d.moveTo(92, 182);
    c2d.quadraticCurveTo(136, 126, 174, 66);
    c2d.moveTo(116, 152);
    c2d.lineTo(152, 150);
    c2d.moveTo(116, 152);
    c2d.lineTo(106, 120);
    c2d.moveTo(140, 118);
    c2d.lineTo(168, 116);
    c2d.moveTo(140, 118);
    c2d.lineTo(132, 90);
    c2d.lineWidth = 6.5;
    c2d.strokeStyle = '#15803d';
    c2d.stroke();
  }

  c2d.restore();
}

export function getDossardTexture(colorKey) {
  if (dossardTextures[colorKey]) return dossardTextures[colorKey];
  const info = COLORS[colorKey];
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const c2d = canvas.getContext('2d');

  // Contour encre manga noir extérieur
  c2d.beginPath();
  c2d.arc(128, 128, 122, 0, Math.PI * 2);
  c2d.fillStyle = '#0f172a';
  c2d.fill();

  // Disque de couleur principal
  c2d.beginPath();
  c2d.arc(128, 128, 110, 0, Math.PI * 2);
  c2d.fillStyle = info.css;
  c2d.fill();
  c2d.lineWidth = 11;
  c2d.strokeStyle = '#ffffff';
  c2d.stroke();

  // Reflet cel-shaded anime en haut à gauche du dossard
  c2d.beginPath();
  c2d.arc(92, 84, 34, 0, Math.PI * 2);
  c2d.fillStyle = 'rgba(255, 255, 255, 0.18)';
  c2d.fill();

  // Symbole élémentaire anime (Flamme sur Rouge, Goutte sur Bleu, Feuille sur Vert)
  drawDossardElementalSymbol(c2d, colorKey);

  const tex = new THREE.CanvasTexture(canvas);
  dossardTextures[colorKey] = tex;
  return tex;
}

function createChestRoleTexture(roleLetter, isAlly) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const c2d = canvas.getContext('2d');

  c2d.fillStyle = isAlly ? '#fffbeb' : '#1e1b4b';
  c2d.fillRect(0, 0, 128, 128);

  c2d.strokeStyle = '#0f172a';
  c2d.lineWidth = 10;
  c2d.strokeRect(5, 5, 118, 118);

  c2d.strokeStyle = isAlly ? '#f59e0b' : '#c084fc';
  c2d.lineWidth = 6;
  c2d.strokeRect(14, 14, 100, 100);

  c2d.fillStyle = isAlly ? '#b45309' : '#f3e8ff';
  c2d.font = '900 72px Segoe UI, sans-serif';
  c2d.textAlign = 'center';
  c2d.textBaseline = 'middle';
  c2d.fillText(roleLetter, 64, 68);

  return new THREE.CanvasTexture(canvas);
}

// Texture de visage Anime Haute Définition (Style Star Ocean / SAO / Phantasy Star)
function createAnimeFaceTexture(irisHexCss, browHexCss, irisGlowCss = '#7dd3fc') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const c2d = canvas.getContext('2d');

  // Fond peau anime lumineux
  c2d.fillStyle = '#fff0db';
  c2d.fillRect(0, 0, 512, 512);

  function drawAnimeEye(cx, cy, isLeft) {
    c2d.save();

    // Sclera (blanc de l'œil) + légère ombre supérieure sous les cils
    c2d.beginPath();
    c2d.ellipse(cx, cy, 56, 68, 0, 0, Math.PI * 2);
    c2d.fillStyle = '#ffffff';
    c2d.fill();

    c2d.save();
    c2d.clip();
    c2d.fillStyle = 'rgba(148, 163, 184, 0.25)';
    c2d.fillRect(cx - 60, cy - 70, 120, 32);

    // Iris multi-dégradé très saturé
    const irisGrad = c2d.createLinearGradient(cx, cy - 48, cx, cy + 56);
    irisGrad.addColorStop(0, '#0f172a');
    irisGrad.addColorStop(0.42, irisHexCss);
    irisGrad.addColorStop(1, irisGlowCss);

    c2d.beginPath();
    c2d.ellipse(cx, cy + 5, 41, 55, 0, 0, Math.PI * 2);
    c2d.fillStyle = irisGrad;
    c2d.fill();

    // Anneau lumineux interne dans l'iris
    c2d.beginPath();
    c2d.ellipse(cx, cy + 12, 29, 36, 0, 0.1 * Math.PI, 0.9 * Math.PI);
    c2d.lineWidth = 4;
    c2d.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    c2d.stroke();

    // Pupille losange / elliptique style Star Ocean
    c2d.beginPath();
    c2d.ellipse(cx, cy + 8, 16, 23, 0, 0, Math.PI * 2);
    c2d.fillStyle = '#090d16';
    c2d.fill();

    // Grand reflet spéculaire blanc (haut-gauche)
    c2d.beginPath();
    c2d.ellipse(cx - 16, cy - 19, 15, 19, -0.25, 0, Math.PI * 2);
    c2d.fillStyle = '#ffffff';
    c2d.fill();

    // Reflet secondaire stellaire (bas-droite)
    c2d.beginPath();
    c2d.arc(cx + 17, cy + 25, 8.5, 0, Math.PI * 2);
    c2d.fillStyle = '#ffffff';
    c2d.fill();

    // Micro-étincelle supérieure droite
    c2d.beginPath();
    c2d.arc(cx + 18, cy - 22, 4.5, 0, Math.PI * 2);
    c2d.fillStyle = '#ffffff';
    c2d.fill();
    c2d.restore();

    // Cil supérieur épais ailé (Eyeliner anime JRPG)
    const wingDir = isLeft ? -1 : 1;
    c2d.beginPath();
    c2d.arc(cx, cy - 4, 60, Math.PI * 1.07, Math.PI * 1.93);
    c2d.lineWidth = 17;
    c2d.lineCap = 'round';
    c2d.strokeStyle = '#0f1020';
    c2d.stroke();

    // Pointe externe relevée du cil
    c2d.beginPath();
    c2d.moveTo(cx + wingDir * 52, cy - 22);
    c2d.quadraticCurveTo(cx + wingDir * 72, cy - 30, cx + wingDir * 78, cy - 44);
    c2d.lineWidth = 10;
    c2d.lineCap = 'round';
    c2d.strokeStyle = '#0f1020';
    c2d.stroke();

    // Cils inférieurs délicats
    c2d.beginPath();
    c2d.arc(cx, cy + 8, 52, Math.PI * 0.22, Math.PI * 0.78);
    c2d.lineWidth = 4;
    c2d.strokeStyle = '#334155';
    c2d.stroke();

    // Pli de paupière supérieur (Eyelid crease)
    c2d.beginPath();
    c2d.arc(cx, cy - 16, 62, Math.PI * 1.18, Math.PI * 1.82);
    c2d.lineWidth = 3.5;
    c2d.strokeStyle = '#d97706';
    c2d.stroke();

    // Sourcil expressif assorti aux cheveux
    c2d.beginPath();
    c2d.moveTo(cx - 48, cy - 88);
    c2d.quadraticCurveTo(cx, cy - 106, cx + 48, cy - 86);
    c2d.lineWidth = 10;
    c2d.lineCap = 'round';
    c2d.strokeStyle = browHexCss;
    c2d.stroke();

    c2d.restore();
  }

  drawAnimeEye(154, 242, true);
  drawAnimeEye(358, 242, false);

  // Blush anime chaleureux + traits de lumière sur les joues
  [98, 414].forEach((bx) => {
    c2d.beginPath();
    c2d.ellipse(bx, 326, 35, 16, 0, 0, Math.PI * 2);
    c2d.fillStyle = 'rgba(251, 113, 133, 0.42)';
    c2d.fill();

    c2d.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    c2d.lineWidth = 3.5;
    c2d.lineCap = 'round';
    c2d.beginPath();
    c2d.moveTo(bx - 12, 322);
    c2d.lineTo(bx - 4, 330);
    c2d.moveTo(bx + 2, 322);
    c2d.lineTo(bx + 10, 330);
    c2d.stroke();
  });

  // Nez anime fin + léger point d'ombre
  c2d.beginPath();
  c2d.moveTo(256, 290);
  c2d.lineTo(249, 308);
  c2d.lineTo(260, 312);
  c2d.lineWidth = 5;
  c2d.lineCap = 'round';
  c2d.strokeStyle = '#d97706';
  c2d.stroke();

  // Sourire confiant d'aventurier JRPG
  c2d.beginPath();
  c2d.arc(256, 344, 30, 0.16 * Math.PI, 0.84 * Math.PI);
  c2d.lineWidth = 8;
  c2d.lineCap = 'round';
  c2d.strokeStyle = '#9a3412';
  c2d.stroke();

  return new THREE.CanvasTexture(canvas);
}


// --- ENTITÉS JOUEUSES (STYLE STAR OCEAN / PHANTASY STAR / SWORD ART ONLINE — CEL-SHADED VIF) ---
export const players = [];
export const balls = [];

// Palettes ultra-saturées JRPG par équipe et rôle (G, C, D)
const ANIME_CHAR_STYLES = {
  ally: {
    G: {
      hairHex: 0xff2a85,
      hairHighlightHex: 0xff9ebb,
      irisCss: '#00bbf9',
      irisGlowCss: '#90e0ef',
      browCss: '#9d174d',
      photonHex: 0x00f5d4,
      style: 'twintails'
    },
    C: {
      hairHex: 0xffbe0b,
      hairHighlightHex: 0xfff3b0,
      irisCss: '#10b981',
      irisGlowCss: '#6ee7b7',
      browCss: '#92400e',
      photonHex: 0x00f5d4,
      style: 'spiky'
    },
    D: {
      hairHex: 0x00bbf9,
      hairHighlightHex: 0x90e0ef,
      irisCss: '#ff006e',
      irisGlowCss: '#ff758f',
      browCss: '#0369a1',
      photonHex: 0xffbe0b,
      style: 'ponytail'
    }
  },
  enemy: {
    G: {
      hairHex: 0xf1f5f9,
      hairHighlightHex: 0x38bdf8,
      irisCss: '#9d4edd',
      irisGlowCss: '#e0aaff',
      browCss: '#475569',
      photonHex: 0xf72585,
      style: 'twintails'
    },
    C: {
      hairHex: 0x9d4edd,
      hairHighlightHex: 0xe0aaff,
      irisCss: '#00f5d4',
      irisGlowCss: '#99f6e4',
      browCss: '#3b0764',
      photonHex: 0x00f5d4,
      style: 'spiky'
    },
    D: {
      hairHex: 0xff1654,
      hairHighlightHex: 0xff8fa3,
      irisCss: '#ffbe0b',
      irisGlowCss: '#fde047',
      browCss: '#881337',
      photonHex: 0xf72585,
      style: 'ponytail'
    }
  }
};

export function createPlayerMesh(team, role) {
  const isAlly = team === 'ally';
  const charStyle = ANIME_CHAR_STYLES[team][role];

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Tenue de base identique et épurée pour toutes les joueuses + fin galon d'équipe (Or / Violet)
  const tunicColor = 0xf1f5f9;
  const skirtColor = 0x334155;
  const bootColor = 0x1e293b;
  const teamTrimColor = isAlly ? 0xfacc15 : 0xc084fc;
  const skinColor = 0xfff0db;

  // 1 seul matériau d'outline partagé PAR personnage (masqué instantanément en furtivité buisson)
  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x0f1020,
    side: THREE.BackSide
  });

  const stealthMaterials = [];
  const _stealthMatSet = new Set();
  const regStealthMat = (mat, isOverlay = false) => {
    if (!mat || _stealthMatSet.has(mat)) return mat;
    _stealthMatSet.add(mat);
    stealthMaterials.push({
      mat,
      baseTransparent: !!mat.transparent,
      baseOpacity: typeof mat.opacity === 'number' ? mat.opacity : 1.0,
      baseDepthWrite: mat.depthWrite !== false,
      isOverlay
    });
    return mat;
  };
  const overlayMeshes = [];

  const skinMat = regStealthMat(createToonMat(skinColor));
  const tunicMat = regStealthMat(createToonMat(tunicColor));
  const accentMat = regStealthMat(createToonMat(teamTrimColor));
  const skirtMat = regStealthMat(createToonMat(skirtColor));
  const bootMat = regStealthMat(createToonMat(bootColor));
  const hairMat = regStealthMat(createToonMat(charStyle.hairHex));
  const hairHighlightMat = regStealthMat(
    createToonMat(charStyle.hairHighlightHex, {
      emissive: charStyle.hairHighlightHex,
      emissiveIntensity: 0.35
    })
  );

  // Collecte des éléments dynamiques (coiffure)
  const hairBouncers = [];

  // --- 1. JAMBES & BOTTINES ATHLÉTIQUES UNIFORMES (SOCKETS DASH / SAUT DÉGAGÉS) ---
  function buildAnimeLeg(xOffset) {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(xOffset, 0.88, 0);

    // Cuisse (peau)
    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.132, 0.11, 0.42, 14),
      skinMat
    );
    thigh.position.set(0, -0.20, 0);
    thigh.castShadow = true;
    addAnimeOutline(thigh, 1.07, 0x0f1020, outlineMat);
    hipPivot.add(thigh);

    // Bottine sportive sombre uniforme
    const bootShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115, 0.098, 0.44, 14),
      bootMat
    );
    bootShaft.position.set(0, -0.59, 0);
    bootShaft.castShadow = true;
    addAnimeOutline(bootShaft, 1.07, 0x0f1020, outlineMat);
    hipPivot.add(bootShaft);

    // Pied de bottine sobre
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.21, 0.13, 0.32),
      bootMat
    );
    shoe.position.set(0, -0.81, 0.05);
    shoe.castShadow = true;
    addAnimeOutline(shoe, 1.07, 0x0f1020, outlineMat);
    hipPivot.add(shoe);

    return hipPivot;
  }

  const leftLeg = buildAnimeLeg(-0.205);
  const rightLeg = buildAnimeLeg(0.205);
  bodyGroup.add(leftLeg, rightLeg);

  // --- 2. BAS ATHLÉTIQUE ARDOISE & FINE CEINTURE D'ÉQUIPE ---
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.295, 0.45, 0.36, 16),
    skirtMat
  );
  skirt.position.set(0, 0.94, 0);
  skirt.castShadow = true;
  addAnimeOutline(skirt, 1.055, 0x0f1020, outlineMat);
  bodyGroup.add(skirt);

  // Fin liseré d'ourlet couleur d'équipe (Or / Violet)
  const skirtTrim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.442, 0.462, 0.042, 16),
    accentMat
  );
  skirtTrim.position.set(0, 0.775, 0);
  bodyGroup.add(skirtTrim);

  // Fine ceinture couleur d'équipe (libère z=+0.29 pour le socket standUp)
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.305, 0.315, 0.075, 16),
    accentMat
  );
  belt.position.set(0, 1.09, 0);
  belt.scale.set(1.04, 1, 0.78);
  addAnimeOutline(belt, 1.055, 0x0f1020, outlineMat);
  bodyGroup.add(belt);

  // --- 3. TUNIQUE SOBRE IDENTIQUE, FIN GALON COL & BADGE DE RÔLE POITRINE ---
  const waist = new THREE.Mesh(
    new THREE.CylinderGeometry(0.255, 0.295, 0.38, 16),
    skirtMat
  );
  waist.position.set(0, 1.24, 0);
  waist.scale.set(1.06, 1, 0.74);
  waist.castShadow = true;
  addAnimeOutline(waist, 1.055, 0x0f1020, outlineMat);
  bodyGroup.add(waist);

  const upperChest = new THREE.Mesh(
    new THREE.CylinderGeometry(0.385, 0.255, 0.52, 16),
    tunicMat
  );
  upperChest.position.set(0, 1.60, 0);
  upperChest.scale.set(1.08, 1, 0.70);
  upperChest.castShadow = true;
  addAnimeOutline(upperChest, 1.055, 0x0f1020, outlineMat);
  bodyGroup.add(upperChest);

  // Cou élancé (peau)
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.13, 0.24, 14),
    skinMat
  );
  neck.position.set(0, 1.94, 0);
  addAnimeOutline(neck, 1.07, 0x0f1020, outlineMat);
  bodyGroup.add(neck);

  // Fin galon de col couleur d'équipe (Or / Violet)
  const collarRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.19, 0.036, 8, 22),
    accentMat
  );
  collarRing.position.set(0, 1.87, 0);
  collarRing.rotation.x = Math.PI / 2;
  addAnimeOutline(collarRing, 1.06, 0x0f1020, outlineMat);
  bodyGroup.add(collarRing);

  // Badge de Rôle sur la poitrine (avant uniquement : Z = +0.258)
  const chestPlaneMat = regStealthMat(
    new THREE.MeshBasicMaterial({ map: createChestRoleTexture(role, isAlly) }),
    true
  );
  const chestPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), chestPlaneMat);
  chestPlane.position.set(0, 1.48, 0.258);
  bodyGroup.add(chestPlane);
  overlayMeshes.push(chestPlane);

  // --- 4. DOSSARD ÉLÉMENTAIRE DANS LE DOS UNIQUEMENT (ARRIÈRE : Z = -0.305) ---
  // Totalement dégagé derrière le haut du buste et visible uniquement lorsqu'on passe derrière le personnage !
  const backDiscGeo = new THREE.CircleGeometry(0.45, 32);
  const backDiscMat = regStealthMat(
    new THREE.MeshBasicMaterial({
      map: getDossardTexture('blue'),
      side: THREE.FrontSide
    }),
    true
  );
  const backDisc = new THREE.Mesh(backDiscGeo, backDiscMat);
  backDisc.rotation.y = Math.PI;
  backDisc.position.set(0, 1.48, -0.305);
  bodyGroup.add(backDisc);
  overlayMeshes.push(backDisc);

  // --- 5. BRAS ARTICULÉS ÉPURÉS (SANS GANTELETS DE BASE) ---
  function buildAnimeArm(xOffset) {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(xOffset, 1.79, 0.02);

    // Manche courte de tunique
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.095, 0.16, 12),
      tunicMat
    );
    sleeve.position.set(0, -0.07, 0);
    sleeve.castShadow = true;
    addAnimeOutline(sleeve, 1.07, 0x0f1020, outlineMat);
    shoulderPivot.add(sleeve);

    // Bras & avant-bras dégagés (peau)
    const armSkin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.078, 0.44, 12),
      skinMat
    );
    armSkin.position.set(0, -0.34, 0);
    armSkin.castShadow = true;
    addAnimeOutline(armSkin, 1.07, 0x0f1020, outlineMat);
    shoulderPivot.add(armSkin);

    // Poignet athlétique sobre
    const wristBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.084, 0.086, 0.065, 12),
      bootMat
    );
    wristBand.position.set(0, -0.55, 0);
    shoulderPivot.add(wristBand);

    // Main gantée sobre
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), bootMat);
    hand.position.set(0, -0.64, 0);
    addAnimeOutline(hand, 1.08, 0x0f1020, outlineMat);
    shoulderPivot.add(hand);

    return shoulderPivot;
  }

  const leftArm = buildAnimeArm(-0.48);
  const rightArm = buildAnimeArm(0.48);
  bodyGroup.add(leftArm, rightArm);

  // --- 6. TÊTE ANIME AFFINÉE, REFLET "ANGEL RING" & COIFFURE PAR RÔLE (G / C / D) ---
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 2.26, 0);
  bodyGroup.add(headGroup);

  const headGeo = new THREE.SphereGeometry(0.40, 24, 24);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.scale.set(0.96, 1.02, 0.95);
  head.castShadow = true;
  addAnimeOutline(head, 1.055, 0x0f1020, outlineMat);
  headGroup.add(head);

  // Petites oreilles anime
  [-0.375, 0.375].forEach((ex) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), skinMat);
    ear.position.set(ex, -0.02, -0.02);
    ear.scale.set(0.55, 1.15, 0.8);
    addAnimeOutline(ear, 1.08, 0x0f1020, outlineMat);
    headGroup.add(ear);
  });

  // Patch facial incurvé à l'avant (+Z) portant les grands yeux JRPG HD
  const facePatchGeo = new THREE.CylinderGeometry(
    0.404,
    0.404,
    0.48,
    24,
    1,
    true,
    -Math.PI * 0.32,
    Math.PI * 0.64
  );
  const facePatchMat = regStealthMat(
    new THREE.MeshBasicMaterial({
      map: createAnimeFaceTexture(charStyle.irisCss, charStyle.browCss, charStyle.irisGlowCss),
      transparent: false
    }),
    true
  );
  const facePatch = new THREE.Mesh(facePatchGeo, facePatchMat);
  facePatch.scale.set(0.96, 1.02, 0.95);
  facePatch.position.set(0, -0.015, 0);
  headGroup.add(facePatch);
  overlayMeshes.push(facePatch);

  // Calotte capillaire volumineuse (reste strictement au-dessus de la nuque pour laisser le dos libre)
  const hairCapGeo = new THREE.SphereGeometry(
    0.432,
    22,
    18,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.58
  );
  const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
  hairCap.position.set(0, 0.035, -0.02);
  hairCap.rotation.x = -0.18;
  addAnimeOutline(hairCap, 1.05, 0x0f1020, outlineMat);
  headGroup.add(hairCap);

  // Anneau spéculaire anime ("Angel Ring" fixé sur le galbe de la calotte capillaire)
  const angelRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.024, 8, 28),
    hairHighlightMat
  );
  angelRing.rotation.x = Math.PI / 2;
  angelRing.position.set(0, 0.27, 0);
  hairCap.add(angelRing);

  // Frange sculptée multi-mèches (5 mèches asymétriques)
  const frontBangSpecs = [
    [-0.24, 0.20, 0.31, 0.42, -0.11],
    [-0.12, 0.22, 0.36, 0.20, -0.04],
    [0.01, 0.21, 0.375, 0.04, 0.09],
    [0.13, 0.22, 0.355, -0.18, 0.05],
    [0.24, 0.20, 0.305, -0.40, -0.10]
  ];
  frontBangSpecs.forEach(([bx, by, bz, rz, rotXAdj]) => {
    const bang = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.34, 6), hairMat);
    bang.position.set(bx, by, bz);
    bang.rotation.x = Math.PI - 0.36 + rotXAdj;
    bang.rotation.z = rz;
    addAnimeOutline(bang, 1.07, 0x0f1020, outlineMat);
    headGroup.add(bang);
  });

  // Longues mèches latérales encadrant les joues (Sidelocks doubles effilées)
  [-1, 1].forEach((dir) => {
    const outerLock = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.48, 6), hairMat);
    outerLock.position.set(dir * 0.36, -0.06, 0.19);
    outerLock.rotation.x = Math.PI - 0.12;
    outerLock.rotation.z = -dir * 0.14;
    addAnimeOutline(outerLock, 1.07, 0x0f1020, outlineMat);
    headGroup.add(outerLock);

    const innerLock = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.36, 6), hairMat);
    innerLock.position.set(dir * 0.29, -0.02, 0.28);
    innerLock.rotation.x = Math.PI - 0.22;
    innerLock.rotation.z = -dir * 0.06;
    addAnimeOutline(innerLock, 1.07, 0x0f1020, outlineMat);
    headGroup.add(innerLock);
  });

  // Coiffures dynamiques par rôle (jamais devant backDisc !)
  if (charStyle.style === 'twintails') {
    // Rôle G : Doubles couettes latérales volumineuses en 2 segments
    [-1, 1].forEach((dir) => {
      const tailPivot = new THREE.Group();
      tailPivot.position.set(dir * 0.41, 0.19, -0.04);

      const mechTie = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.065, 10), accentMat);
      mechTie.rotation.z = Math.PI / 2;
      addAnimeOutline(mechTie, 1.08, 0x0f1020, outlineMat);
      tailPivot.add(mechTie);

      const tailUpper = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, 8), hairMat);
      tailUpper.position.set(dir * 0.19, -0.15, -0.03);
      tailUpper.rotation.z = -dir * 2.25;
      addAnimeOutline(tailUpper, 1.06, 0x0f1020, outlineMat);
      tailPivot.add(tailUpper);

      const tailLower = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.66, 8), hairMat);
      tailLower.position.set(dir * 0.37, -0.47, -0.04);
      tailLower.rotation.z = -dir * 2.65;
      addAnimeOutline(tailLower, 1.06, 0x0f1020, outlineMat);
      tailPivot.add(tailLower);

      headGroup.add(tailPivot);
      hairBouncers.push({ pivot: tailPivot, baseRotZ: 0, dir });
    });
  } else if (charStyle.style === 'spiky') {
    // Rôle C : Couronne d'épis JRPG multi-couches
    const spikeSpecs = [
      [0, 0.50, 0.06, 0.24, 0, 0.11, 0.44],
      [-0.22, 0.44, -0.02, -0.15, 0.42, 0.125, 0.40],
      [0.22, 0.44, -0.02, -0.15, -0.42, 0.125, 0.40],
      [-0.36, 0.28, -0.06, -0.22, 0.85, 0.115, 0.38],
      [0.36, 0.28, -0.06, -0.22, -0.85, 0.115, 0.38],
      [-0.28, 0.34, -0.22, -0.68, 0.55, 0.12, 0.36],
      [0.28, 0.34, -0.22, -0.68, -0.55, 0.12, 0.36],
      [0, 0.42, -0.24, -0.78, 0, 0.13, 0.38],
      [0.14, 0.46, 0.18, 0.42, -0.28, 0.09, 0.30]
    ];
    spikeSpecs.forEach(([sx, sy, sz, rx, rz, r, h], idx) => {
      const spikePivot = new THREE.Group();
      spikePivot.position.set(sx, sy, sz);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), hairMat);
      spike.rotation.set(rx, 0, rz);
      addAnimeOutline(spike, 1.07, 0x0f1020, outlineMat);
      spikePivot.add(spike);
      headGroup.add(spikePivot);
      if (idx === 0 || idx === 7) {
        hairBouncers.push({ pivot: spikePivot, baseRotZ: 0, dir: idx === 0 ? 1 : -1 });
      }
    });
  } else {
    // Rôle D : Haute queue de cheval dynamique (orientée haut & droite)
    const ponyPivot = new THREE.Group();
    ponyPivot.position.set(0.20, 0.36, -0.14);

    const mechTie = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 10), accentMat);
    addAnimeOutline(mechTie, 1.08, 0x0f1020, outlineMat);
    ponyPivot.add(mechTie);

    const ponyMain = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.68, 8), hairMat);
    ponyMain.position.set(0.28, 0.11, -0.08);
    ponyMain.rotation.z = -1.25;
    ponyMain.rotation.x = -0.25;
    addAnimeOutline(ponyMain, 1.06, 0x0f1020, outlineMat);
    ponyPivot.add(ponyMain);

    const ponyTip = new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.56, 7), hairMat);
    ponyTip.position.set(0.56, -0.02, -0.15);
    ponyTip.rotation.z = -2.45;
    ponyTip.rotation.x = -0.16;
    addAnimeOutline(ponyTip, 1.06, 0x0f1020, outlineMat);
    ponyPivot.add(ponyTip);

    headGroup.add(ponyPivot);
    hairBouncers.push({ pivot: ponyPivot, baseRotZ: 0, dir: 1 });
  }

  // --- 6B. SOCKETS 3D POWERUPS VISIBLES DE FACE (0 OUTLINE, 0 SHADOW, MATÉRIAUX PROPRES) ---
  const makeMultiPartSocket = (parts) => {
    for (let i = 0; i < parts.length; i++) parts[i].visible = false;
    return {
      _visible: false,
      parts,
      get visible() {
        return this._visible;
      },
      set visible(v) {
        const next = !!v;
        if (this._visible === next) return;
        this._visible = next;
        for (let i = 0; i < this.parts.length; i++) {
          this.parts[i].visible = next;
        }
      }
    };
  };

  // A) DASH EVOS (pieds / chevilles sur leftLeg & rightLeg)
  const bounceSpringMat = regStealthMat(
    createToonMat(0xf97316, { emissive: 0xea580c, emissiveIntensity: 0.25 })
  );
  const bounceGlowMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xfdba74 }));
  const dashBounceParts = [leftLeg, rightLeg].map((leg) => {
    const g = new THREE.Group();
    [-0.63, -0.71, -0.79].forEach((cy) => {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.025, 6, 14), bounceSpringMat);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(0, cy, 0.01);
      g.add(coil);
    });
    const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.075, 10), bounceSpringMat);
    sole.position.set(0, -0.885, 0.055);
    g.add(sole);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.09), bounceGlowMat);
    bumper.position.set(0, -0.83, 0.21);
    g.add(bumper);
    leg.add(g);
    return g;
  });
  const dashBounceSocket = makeMultiPartSocket(dashBounceParts);

  const slideIceMat = regStealthMat(
    createToonMat(0x38bdf8, { emissive: 0x0284c7, emissiveIntensity: 0.3 })
  );
  const slideEdgeMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xe0f2fe }));
  const dashSlideParts = [leftLeg, rightLeg].map((leg, idx) => {
    const dir = idx === 0 ? -1 : 1;
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.095, 0.46), slideEdgeMat);
    blade.position.set(0, -0.895, 0.09);
    g.add(blade);
    const prow = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 4), slideIceMat);
    prow.rotation.x = Math.PI / 2 - 0.32;
    prow.position.set(0, -0.855, 0.31);
    g.add(prow);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0), slideIceMat);
    crystal.scale.set(0.85, 1.15, 1.15);
    crystal.position.set(dir * 0.11, -0.73, 0.11);
    g.add(crystal);
    leg.add(g);
    return g;
  });
  const dashSlideSocket = makeMultiPartSocket(dashSlideParts);

  const boomTealMat = regStealthMat(
    createToonMat(0x14b8a6, { emissive: 0x0d9488, emissiveIntensity: 0.22 })
  );
  const boomGoldMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
  const dashBoomParts = [leftLeg, rightLeg].map((leg, idx) => {
    const dir = idx === 0 ? -1 : 1;
    const g = new THREE.Group();
    const finA = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.28, 4), boomTealMat);
    finA.scale.set(0.36, 1.0, 1.0);
    finA.position.set(dir * 0.16, -0.66, 0.02);
    finA.rotation.set(-0.45, 0, -dir * 0.55);
    g.add(finA);
    const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.12), boomGoldMat);
    finTip.position.set(dir * 0.20, -0.60, 0.08);
    g.add(finTip);
    leg.add(g);
    return g;
  });
  // Mini-boomerang courbe sur la hanche droite (visible de face & profil, dos libre)
  const hipBoomGroup = new THREE.Group();
  hipBoomGroup.position.set(0.43, 1.06, 0.14);
  hipBoomGroup.rotation.set(0.18, -0.25, -0.35);
  const boomArm1 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.24, 0.085), boomTealMat);
  boomArm1.position.set(0.02, 0.08, 0.04);
  boomArm1.rotation.x = 0.55;
  hipBoomGroup.add(boomArm1);
  const boomArm2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.24, 0.085), boomTealMat);
  boomArm2.position.set(0.02, -0.07, 0.06);
  boomArm2.rotation.x = -0.65;
  hipBoomGroup.add(boomArm2);
  const boomTip = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.07, 0.092), boomGoldMat);
  boomTip.position.set(0.02, 0.17, 0.09);
  hipBoomGroup.add(boomTip);
  bodyGroup.add(hipBoomGroup);
  dashBoomParts.push(hipBoomGroup);
  const dashBoomerangSocket = makeMultiPartSocket(dashBoomParts);

  // B) TOOL EVOS (épaule droite x = +0.42..+0.48, jamais au centre du dos)
  const beaconMastMat = regStealthMat(createToonMat(0x64748b));
  const beaconOrbMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  const beaconRingMat = regStealthMat(
    new THREE.MeshBasicMaterial({ color: teamTrimColor, side: THREE.DoubleSide })
  );
  const toolBeaconGroup = new THREE.Group();
  toolBeaconGroup.position.set(0.42, 1.84, 0.05);
  toolBeaconGroup.visible = false;
  const beaconClamp = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.10, 10), beaconMastMat);
  toolBeaconGroup.add(beaconClamp);
  const beaconMast = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 0.54, 8), beaconMastMat);
  beaconMast.position.y = 0.30;
  toolBeaconGroup.add(beaconMast);
  const beaconOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.135, 0), beaconOrbMat);
  beaconOrb.position.y = 0.62;
  toolBeaconGroup.add(beaconOrb);
  const beaconRadarRing = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 6, 16), beaconRingMat);
  beaconRadarRing.position.y = 0.62;
  beaconRadarRing.rotation.x = Math.PI / 2 - 0.35;
  toolBeaconGroup.add(beaconRadarRing);
  bodyGroup.add(toolBeaconGroup);

  const wallArmorMat = regStealthMat(createToonMat(0x475569));
  const wallTrimMat = regStealthMat(new THREE.MeshBasicMaterial({ color: teamTrimColor }));
  const toolWallGroup = new THREE.Group();
  toolWallGroup.position.set(0.48, 1.74, 0.09);
  toolWallGroup.rotation.set(0.08, -0.22, -0.14);
  toolWallGroup.visible = false;
  const wallSlab = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.44, 0.38), wallArmorMat);
  toolWallGroup.add(wallSlab);
  const wallTopTrim = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.08, 0.40), wallTrimMat);
  wallTopTrim.position.y = 0.14;
  toolWallGroup.add(wallTopTrim);
  const wallRidge = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.06, 0.32), wallArmorMat);
  wallRidge.position.y = -0.06;
  toolWallGroup.add(wallRidge);
  bodyGroup.add(toolWallGroup);

  const padBaseMat = regStealthMat(createToonMat(0x0f172a));
  const padGlowMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0x06b6d4 }));
  const padChevronMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  const toolPadGroup = new THREE.Group();
  toolPadGroup.position.set(0.45, 1.80, 0.06);
  toolPadGroup.rotation.set(0.12, -0.18, -0.28);
  toolPadGroup.visible = false;
  const padPod = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.40, 0.26), padBaseMat);
  toolPadGroup.add(padPod);
  const padCore = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.30, 0.12), padGlowMat);
  padCore.position.z = 0.06;
  toolPadGroup.add(padCore);
  [-0.08, 0.08].forEach((cy) => {
    const chevL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.05), padChevronMat);
    chevL.position.set(0.08, cy, 0.12);
    chevL.rotation.z = 0.48;
    toolPadGroup.add(chevL);
    const chevR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.05), padChevronMat);
    chevR.position.set(0.08, cy + 0.07, 0.12);
    chevR.rotation.z = -0.48;
    toolPadGroup.add(chevR);
  });
  bodyGroup.add(toolPadGroup);

  // C) ULT EVO (au-dessus du front, or-blanc STRICTEMENT NEUTRE : jamais R/V/B !)
  const ultEvoMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xfde047 }));
  const ultEvoCoreMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const ultEvoGroup = new THREE.Group();
  ultEvoGroup.position.set(0, 0.49, 0.09);
  ultEvoGroup.visible = false;
  const ultCrownRing = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.026, 6, 20), ultEvoMat);
  ultCrownRing.rotation.x = Math.PI / 2 - 0.14;
  ultEvoGroup.add(ultCrownRing);
  [
    [0, 0.11, 0.26, 0.18, 0, 0.058, 0.24],
    [-0.18, 0.07, 0.20, 0.14, 0.36, 0.045, 0.18],
    [0.18, 0.07, 0.20, 0.14, -0.36, 0.045, 0.18]
  ].forEach(([sx, sy, sz, rx, rz, r, h]) => {
    const spk = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), ultEvoMat);
    spk.position.set(sx, sy, sz);
    spk.rotation.set(rx, 0, rz);
    ultEvoGroup.add(spk);
  });
  const ultEvoStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.115, 0), ultEvoCoreMat);
  ultEvoStar.position.set(0, 0.24, 0.05);
  ultEvoGroup.add(ultEvoStar);
  headGroup.add(ultEvoGroup);

  // D) STAND UP (ceinture avant z = +0.29, médaillon éclair jaune électrique, disparaît si consommé)
  const standUpRimMat = regStealthMat(createToonMat(0x0f172a));
  const standUpMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
  const standUpGroup = new THREE.Group();
  standUpGroup.position.set(0, 1.10, 0.29);
  standUpGroup.visible = false;
  const standPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.04, 6), standUpRimMat);
  standPlate.rotation.x = Math.PI / 2;
  standUpGroup.add(standPlate);
  const boltTop = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.14, 4), standUpMat);
  boltTop.position.set(0.015, 0.045, 0.032);
  boltTop.rotation.z = -0.35;
  standUpGroup.add(boltTop);
  const boltBot = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.14, 4), standUpMat);
  boltBot.position.set(-0.015, -0.045, 0.032);
  boltBot.rotation.z = Math.PI - 0.35;
  standUpGroup.add(boltBot);
  bodyGroup.add(standUpGroup);

  // E) BONUS D'ÉQUIPE (micro-accents très légers aux chevilles/haut de bottine)
  const teamDashPlusMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  const teamDashPlusParts = [leftLeg, rightLeg].map((leg) => {
    const g = new THREE.Group();
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.124, 0.122, 0.042, 12),
      teamDashPlusMat
    );
    band.position.set(0, -0.52, 0);
    g.add(band);
    leg.add(g);
    return g;
  });
  const teamDashPlusSocket = makeMultiPartSocket(teamDashPlusParts);

  const teamJumpMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xecfeff }));
  const teamJumpParts = [leftLeg, rightLeg].map((leg, idx) => {
    const dir = idx === 0 ? -1 : 1;
    const g = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.12, 0.19), teamJumpMat);
    wing.position.set(dir * 0.135, -0.44, -0.03);
    wing.rotation.set(0.32, dir * 0.22, -dir * 0.25);
    g.add(wing);
    leg.add(g);
    return g;
  });
  const teamJumpSocket = makeMultiPartSocket(teamJumpParts);

  const powerSockets = {
    dash: {
      bounce: dashBounceSocket,
      slide: dashSlideSocket,
      boomerang: dashBoomerangSocket
    },
    tool: {
      beacon: toolBeaconGroup,
      wall: toolWallGroup,
      pad: toolPadGroup
    },
    ultEvo: ultEvoGroup,
    standUp: standUpGroup,
    teamDashPlus: teamDashPlusSocket,
    teamJump: teamJumpSocket
  };

  // --- 7. ANNEAU AU SOL & FLÈCHE DE DIRECTION ---
  const ringGroup = new THREE.Group();
  ringGroup.position.y = 0.03;

  const ringGeo = new THREE.RingGeometry(0.68, 0.88, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isAlly ? 0xffbe0b : 0xc084fc,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.78
  });
  const floorRing = new THREE.Mesh(ringGeo, ringMat);
  floorRing.rotation.x = -Math.PI / 2;
  ringGroup.add(floorRing);

  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 1.2);
  arrowShape.lineTo(-0.3, 0.78);
  arrowShape.lineTo(0.3, 0.78);
  arrowShape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  const arrowMesh = new THREE.Mesh(arrowGeo, ringMat);
  arrowMesh.rotation.x = -Math.PI / 2;
  ringGroup.add(arrowMesh);

  // Aura émeraude d'accélération (Ultimate Feuille) autour du personnage
  const leafAuraGroup = new THREE.Group();
  leafAuraGroup.position.y = 0.05;
  leafAuraGroup.visible = false;
  const leafAuraMat = new THREE.MeshBasicMaterial({
    color: 0x4ade80,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.78,
    depthWrite: false
  });
  const leafAuraOuter = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.2, 24), leafAuraMat);
  leafAuraOuter.rotation.x = -Math.PI / 2;
  leafAuraGroup.add(leafAuraOuter);
  const leafAuraSpoke = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.72, 6), leafAuraMat);
  leafAuraSpoke.rotation.x = -Math.PI / 2;
  leafAuraGroup.add(leafAuraSpoke);
  root.add(leafAuraGroup);

  root.add(ringGroup);
  scene.add(root);

  const labelEl = document.createElement('div');
  labelEl.className = `player-3d-label ${team}`;
  labelsContainer.appendChild(labelEl);
  const leafBadge = createLeafDurationBadge();

  return {
    root,
    bodyGroup,
    headGroup,
    hairBouncers,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    backDisc,
    backDiscMat,
    floorRing: ringGroup,
    ringMat,
    leafAuraGroup,
    leafAuraMat,
    labelEl,
    leafBadge,
    outlineMat,
    stealthMaterials,
    overlayMeshes,
    stealthAlpha: 1.0,
    _lastStealthBlend: false,
    powerSockets,
    ultEvoMat,
    ultEvoCoreMat,
    ultEvoStar,
    beaconOrb,
    _powerVisSig: -1
  };
}

export function initPlayers() {
  const createPlayerRecord = (team, role) => {
    const isAlly = team === 'ally';
    return {
      id: `${team}_${role}`,
      team,
      role,
      color: isAlly ? 'blue' : 'red',
      state: 'standing',
      rule1Partner: null,
      carryingBall: null,
      pos: new THREE.Vector3(),
      targetPos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      vy: 0,
      onCanopy: false,
      isAirborne: false,
      isLaunching: false,
      launchVz: 0,
      launchBoostTimer: 0,
      jumpMomentumVx: 0,
      jumpMomentumVz: 0,
      dashMomentumGrace: 0,
      lastDashVx: 0,
      lastDashVz: 0,
      facingAngle: isAlly ? Math.PI / 2 : -Math.PI / 2,
      targetFacingAngle: isAlly ? Math.PI / 2 : -Math.PI / 2,
      dashTimer: 0,
      dashCooldown: 0,
      dashCooldownMax: DASH_COOLDOWN,
      dashIsSuper: false,
      dashKind: null,
      dashSpeed: DASH_SPEED,
      dashMaxDuration: DASH_DURATION,
      dashBouncesLeft: 0,
      boomerangWindow: 0,
      boomerangOrigin: null,
      slidePatchDist: 0,
      slideGlideTimer: 0,
      slideGlideVx: 0,
      slideGlideVz: 0,
      onSlidePatch: false,
      iceSlideDirX: 0,
      iceSlideDirZ: 0,
      iceSlideSpeed: 0,
      isSlidingNet: false,
      padBoostTimer: 0,
      padDirX: 0,
      padDirZ: 0,
      toolCooldown: 0,
      dashDirX: 0,
      dashDirZ: 0,
      ultUsed: false,
      ultShotsUsed: 0,
      ultCooldown: 0,
      activeReactivableWave: null,
      leafUltTimer: 0,
      leafUltMaxDuration: 2.0,
      leafUltSpeedMult: 3.0,
      waterShieldTimer: 0,
      animTime: Math.random() * 10,
      revealedTo: { ally: isAlly, enemy: !isAlly },
      teamSeeingBack: { ally: isAlly, enemy: !isAlly },
      visibleTo: { ally: true, enemy: true },
      backRevealed: isAlly,
      currentlySeeingBack: isAlly,
      mesh: createPlayerMesh(team, role)
    };
  };

  const roles = ['G', 'C', 'D'];
  roles.forEach((role) => players.push(createPlayerRecord('ally', role)));
  roles.forEach((role) => players.push(createPlayerRecord('enemy', role)));
}

export function createBallMesh(colorKey) {
  const group = new THREE.Group();
  const sphereGeo = new THREE.SphereGeometry(0.52, 24, 24);
  const sphereMat = createToonMat(COLORS[colorKey].hex);
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.castShadow = true;
  const outlineMesh = addAnimeOutline(sphere, 1.07, 0x0f172a);
  group.add(sphere);

  const ringGeo = new THREE.RingGeometry(0.58, 0.74, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: COLORS[colorKey].hex,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.48;
  group.add(ring);

  const stealthMaterials = [
    { mat: sphereMat, baseTransparent: false, baseOpacity: 1.0, baseDepthWrite: true, isOverlay: false },
    { mat: ringMat, baseTransparent: false, baseOpacity: 1.0, baseDepthWrite: true, isOverlay: false }
  ];

  scene.add(group);
  return {
    group,
    sphere,
    sphereMat,
    ring,
    ringMat,
    outlineMesh,
    outlineMat: outlineMesh.material,
    stealthMaterials,
    stealthAlpha: 1.0,
    _lastStealthBlend: false
  };
}

export function initBalls() {
  for (let i = 0; i < 2; i++) {
    const customSpawn = Array.isArray(FIELD.ballSpawns) && FIELD.ballSpawns[i];
    const startX = customSpawn ? customSpawn.x : 0;
    const startZ = customSpawn ? customSpawn.z : (i === 0 ? FIELD.laneTopZ : FIELD.laneBotZ);
    const meshData = createBallMesh('green');
    balls.push({
      id: i,
      color: 'green',
      state: 'ground',
      carrier: null,
      onCanopy: false,
      pos: new THREE.Vector3(startX, 0.52, startZ),
      targetPos: new THREE.Vector3(startX, 0.52, startZ),
      vel: new THREE.Vector3(),
      thrownByTeam: null,
      mesh: meshData
    });
  }
}


const PARTICLE_POOL_MAX = 260;
const PARTICLE_LOW_SPEC_MAX = 70;
let particleInstancedGeo = null;
let particleStartPosAttr = null;
let particleVelAttr = null;
let particleTimingAttr = null;
let particleColorAttr = null;
let particleUniforms = null;
let particleMesh = null;
let particleCursor = 0;
let particleSimTime = 0;
const _tmpParticleColor = new THREE.Color();

/**
 * Initialise le système de particules instanciées sur GPU (1 seul draw call,
 * intégration balistique et échelle calculées dans le vertex shader).
 */
function initGpuParticleSystem() {
  if (particleMesh) {
    scene.remove(particleMesh);
    if (particleInstancedGeo) particleInstancedGeo.dispose();
    if (particleMesh.material) particleMesh.material.dispose();
  }

  const baseSphere = new THREE.SphereGeometry(0.14, 6, 6);
  particleInstancedGeo = new THREE.InstancedBufferGeometry();
  particleInstancedGeo.index = baseSphere.index;
  particleInstancedGeo.attributes.position = baseSphere.attributes.position;
  particleInstancedGeo.instanceCount = state.lowSpecMode ? PARTICLE_LOW_SPEC_MAX : PARTICLE_POOL_MAX;

  particleStartPosAttr = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_POOL_MAX * 3), 3);
  particleVelAttr = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_POOL_MAX * 3), 3);
  particleTimingAttr = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_POOL_MAX * 2), 2);
  particleColorAttr = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_POOL_MAX * 3), 3);

  particleStartPosAttr.setUsage(THREE.DynamicDrawUsage);
  particleVelAttr.setUsage(THREE.DynamicDrawUsage);
  particleTimingAttr.setUsage(THREE.DynamicDrawUsage);
  particleColorAttr.setUsage(THREE.DynamicDrawUsage);

  particleInstancedGeo.setAttribute('aStartPos', particleStartPosAttr);
  particleInstancedGeo.setAttribute('aVelocity', particleVelAttr);
  particleInstancedGeo.setAttribute('aTiming', particleTimingAttr);
  particleInstancedGeo.setAttribute('aColor', particleColorAttr);

  particleUniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { uTime: { value: particleSimTime } }
  ]);

  const mat = new THREE.ShaderMaterial({
    uniforms: particleUniforms,
    fog: true,
    vertexShader: `
      attribute vec3 aStartPos;
      attribute vec3 aVelocity;
      attribute vec2 aTiming;
      attribute vec3 aColor;
      uniform float uTime;
      varying vec3 vColor;
      varying float vAlive;
      #include <fog_pars_vertex>

      void main() {
        float age = uTime - aTiming.x;
        float dur = aTiming.y;
        if (dur <= 0.0 || age < 0.0 || age >= dur) {
          vAlive = 0.0;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
        vAlive = 1.0;
        vColor = aColor;
        float sc = max(0.1, dur - age);
        vec3 worldCenter = aStartPos + aVelocity * age + vec3(0.0, -6.0 * age * age, 0.0);
        vec3 transformed = worldCenter + position * sc;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlive;
      #include <fog_pars_fragment>

      void main() {
        if (vAlive < 0.5) discard;
        gl_FragColor = vec4(vColor, 1.0);
        #include <fog_fragment>
      }
    `
  });

  particleMesh = new THREE.Mesh(particleInstancedGeo, mat);
  particleMesh.frustumCulled = false;
  particleMesh.name = 'gpu-particles';
  scene.add(particleMesh);
  particleCursor = 0;
}

/** Ajuste la capacité active du buffer GPU de particules (ex. passage Low Spec). */
export function setParticlePoolLimit(limit) {
  if (!particleInstancedGeo || !particleTimingAttr) return;
  const clamped = Math.max(1, Math.min(PARTICLE_POOL_MAX, Math.floor(limit)));
  if (clamped < particleInstancedGeo.instanceCount) {
    const arr = particleTimingAttr.array;
    for (let i = clamped; i < PARTICLE_POOL_MAX; i++) {
      arr[i * 2] = 0;
      arr[i * 2 + 1] = 0;
    }
    particleTimingAttr.needsUpdate = true;
  }
  particleInstancedGeo.instanceCount = clamped;
  particleCursor = particleCursor % clamped;
}

export function spawnParticles(pos, colorHex, count = 18) {
  if (!particleInstancedGeo || !pos) return;
  const effCount = state.lowSpecMode ? Math.max(1, Math.ceil(count * 0.3)) : count;
  const poolLimit = state.lowSpecMode ? PARTICLE_LOW_SPEC_MAX : PARTICLE_POOL_MAX;
  if (particleInstancedGeo.instanceCount !== poolLimit) {
    setParticlePoolLimit(poolLimit);
  }
  _tmpParticleColor.setHex(colorHex);

  const startArr = particleStartPosAttr.array;
  const velArr = particleVelAttr.array;
  const timingArr = particleTimingAttr.array;
  const colorArr = particleColorAttr.array;

  for (let i = 0; i < effCount; i++) {
    const idx = particleCursor;
    particleCursor = (particleCursor + 1) % poolLimit;
    const i3 = idx * 3;
    const i2 = idx * 2;

    startArr[i3] = pos.x;
    startArr[i3 + 1] = pos.y;
    startArr[i3 + 2] = pos.z;

    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    const vy = 3 + Math.random() * 5;
    velArr[i3] = Math.cos(angle) * speed;
    velArr[i3 + 1] = vy;
    velArr[i3 + 2] = Math.sin(angle) * speed;

    timingArr[i2] = particleSimTime;
    timingArr[i2 + 1] = 0.8 + Math.random() * 0.4;

    colorArr[i3] = _tmpParticleColor.r;
    colorArr[i3 + 1] = _tmpParticleColor.g;
    colorArr[i3 + 2] = _tmpParticleColor.b;
  }

  particleStartPosAttr.needsUpdate = true;
  particleVelAttr.needsUpdate = true;
  particleTimingAttr.needsUpdate = true;
  particleColorAttr.needsUpdate = true;
}

export function updateParticles(dt) {
  if (!particleUniforms) return;
  if (ctx.api.isMenuOpen && ctx.api.isMenuOpen() && !mp.enabled) return;
  particleSimTime += dt;
  particleUniforms.uTime.value = particleSimTime;
}


export function getPlayer(team, role) {
  return players.find((p) => p.team === team && p.role === role);
}

export function applyBallColor(ball, colorKey) {
  ball.color = colorKey;
  ball.mesh.sphereMat.color.setHex(COLORS[colorKey].hex);
  ball.mesh.ringMat.color.setHex(COLORS[colorKey].hex);
}

export function applyPlayerColor(player, colorKey) {
  player.color = colorKey;
  player.mesh.backDiscMat.map = getDossardTexture(colorKey);
  player.mesh.backDiscMat.needsUpdate = true;
}

// --- TRANSLUCIDITÉ BUISSON (PERSONNAGES & BALLONS PORTÉS) ---
export function applyMeshStealthAlpha(meshData, alpha) {
  if (!meshData) return;
  const clamped = Math.max(0.05, Math.min(1.0, typeof alpha === 'number' ? alpha : 1.0));
  meshData.stealthAlpha = clamped;

  const useBlend = clamped < 0.985;
  const stateChanged = !!meshData._lastStealthBlend !== useBlend;
  meshData._lastStealthBlend = useBlend;

  const showOutline = clamped >= 0.92;
  if (meshData.outlineMat) meshData.outlineMat.visible = showOutline;
  if (meshData.outlineMesh) meshData.outlineMesh.visible = showOutline;

  const mats = meshData.stealthMaterials;
  if (Array.isArray(mats)) {
    for (let i = 0; i < mats.length; i++) {
      const ms = mats[i];
      if (!ms || !ms.mat) continue;
      if (useBlend) {
        if (stateChanged) {
          ms.mat.transparent = true;
          ms.mat.depthWrite = ms.isOverlay ? false : true;
          if (ms.isOverlay) {
            ms.mat.polygonOffset = true;
            ms.mat.polygonOffsetFactor = -1;
            ms.mat.polygonOffsetUnits = -1;
          }
          ms.mat.needsUpdate = true;
        }
        ms.mat.opacity = ms.baseOpacity * clamped;
      } else if (stateChanged) {
        ms.mat.transparent = ms.baseTransparent;
        ms.mat.opacity = ms.baseOpacity;
        ms.mat.depthWrite = ms.baseDepthWrite;
        if (ms.isOverlay) {
          ms.mat.polygonOffset = false;
          ms.mat.polygonOffsetFactor = 0;
          ms.mat.polygonOffsetUnits = 0;
        }
        ms.mat.needsUpdate = true;
      }
    }
  }

  if (stateChanged && Array.isArray(meshData.overlayMeshes)) {
    const ro = useBlend ? 2 : 0;
    for (let i = 0; i < meshData.overlayMeshes.length; i++) {
      if (meshData.overlayMeshes[i]) meshData.overlayMeshes[i].renderOrder = ro;
    }
  }
}

// --- SYNCHRONISATION DES SOCKETS 3D POWERUPS (CACHE BITMASK LÉGER) ---
export function syncPlayerPowerVisuals(player, nowSec = 0) {
  if (!player || !player.mesh || !player.mesh.powerSockets) return;
  const mesh = player.mesh;
  const teamMeta = state.teams && state.teams[player.team];
  const pwr = (teamMeta && teamMeta.powers && teamMeta.powers[player.role]) || {};
  const dashEvo = pwr.dashEvo || null;
  const toolEvo = pwr.toolEvo || null;
  const ultEvo = !!pwr.ultEvo;
  const standUp = !!pwr.standUp;
  const teamDashPlus = !!(teamMeta && teamMeta.teamDashPlus);
  const teamJump = !!(teamMeta && teamMeta.teamJump);
  const ultUsed = !!player.ultUsed;

  const sig =
    (ultEvo ? 1 : 0) |
    (standUp ? 2 : 0) |
    (teamDashPlus ? 4 : 0) |
    (teamJump ? 8 : 0) |
    (ultUsed ? 16 : 0) |
    (dashEvo === 'bounce' ? 32 : dashEvo === 'slide' ? 64 : dashEvo === 'boomerang' ? 128 : 0) |
    (toolEvo === 'beacon' ? 256 : toolEvo === 'wall' ? 512 : toolEvo === 'pad' ? 1024 : 0);

  if (mesh._powerVisSig !== sig) {
    mesh._powerVisSig = sig;
    const ps = mesh.powerSockets;
    ps.dash.bounce.visible = dashEvo === 'bounce';
    ps.dash.slide.visible = dashEvo === 'slide';
    ps.dash.boomerang.visible = dashEvo === 'boomerang';
    ps.tool.beacon.visible = toolEvo === 'beacon';
    ps.tool.wall.visible = toolEvo === 'wall';
    ps.tool.pad.visible = toolEvo === 'pad';
    ps.ultEvo.visible = ultEvo;
    ps.standUp.visible = standUp;
    ps.teamDashPlus.visible = teamDashPlus;
    ps.teamJump.visible = teamJump;

    if (mesh.ultEvoMat) {
      mesh.ultEvoMat.color.setHex(ultUsed ? 0x64748b : 0xfde047);
    }
    if (mesh.ultEvoCoreMat) {
      mesh.ultEvoCoreMat.color.setHex(ultUsed ? 0x94a3b8 : 0xffffff);
    }
  }

  if (!state.lowSpecMode && nowSec > 0) {
    if (mesh.ultEvoStar && mesh.powerSockets.ultEvo.visible) {
      mesh.ultEvoStar.rotation.y = nowSec * 2.4;
      mesh.ultEvoStar.position.y = 0.24 + Math.sin(nowSec * 3.6) * 0.03;
    }
    if (mesh.beaconOrb && mesh.powerSockets.tool.beacon.visible) {
      mesh.beaconOrb.rotation.y = nowSec * 2.8;
    }
  }
}

// --- INDICATEURS 3D : PASSE CHARGÉE & VISÉE MOBILE WILD RIFT ---
function getPreviewSurfaceY(x, z, onCanopy = false) {
  if (onCanopy && ctx.world && typeof ctx.world.getStructureSurfaceY === 'function') {
    const s = ctx.world.getStructureSurfaceY(x, z, true);
    if (s && typeof s.y === 'number') return s.y;
  }
  if (ctx.world && typeof ctx.world.getTerrainY === 'function') {
    return ctx.world.getTerrainY(x, z);
  }
  return 0;
}

function createGroundRingBufferMesh(angSegs, material, renderOrder = 14) {
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

function updateGroundRingBufferMesh(mesh, cx, cz, rInner, rOuter, yOffset, onCanopy = false) {
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

function createGroundSectorBufferMesh(angSegs, radSegs, material, renderOrder = 14) {
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

function updateGroundSectorBufferMesh(
  mesh,
  cx,
  cz,
  centerAngle,
  halfAngle,
  rInner,
  rOuter,
  yOffset,
  onCanopy = false
) {
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

let passPreviewGroup = null;
let passPreviewAnimTime = 0;

function ensurePassChargePreview3D() {
  if (passPreviewGroup || !scene) return passPreviewGroup;
  passPreviewGroup = new THREE.Group();
  passPreviewGroup.visible = false;

  const rangeRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const rangeRing = createGroundRingBufferMesh(44, rangeRingMat, 14);
  passPreviewGroup.add(rangeRing);

  const rangeFillMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const rangeFill = createGroundRingBufferMesh(44, rangeFillMat, 13);
  passPreviewGroup.add(rangeFill);

  const snapConeFillMat = new THREE.MeshBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.13,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const snapConeFill = createGroundSectorBufferMesh(16, 4, snapConeFillMat, 14);
  passPreviewGroup.add(snapConeFill);

  const snapConeOutlineRadSegs = 6;
  const snapConeOutlineAngSegs = 16;
  const snapConeOutlineVerts = 1 + snapConeOutlineRadSegs + snapConeOutlineAngSegs + snapConeOutlineRadSegs;
  const snapConeOutlinePositions = new Float32Array(snapConeOutlineVerts * 3);
  const snapConeOutlineGeo = new THREE.BufferGeometry();
  snapConeOutlineGeo.setAttribute('position', new THREE.BufferAttribute(snapConeOutlinePositions, 3));
  const snapConeOutlineMat = new THREE.LineBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.36,
    depthWrite: false
  });
  const snapConeOutline = new THREE.Line(snapConeOutlineGeo, snapConeOutlineMat);
  snapConeOutline.frustumCulled = false;
  snapConeOutline.renderOrder = 15;
  passPreviewGroup.add(snapConeOutline);

  const targetRingMat = new THREE.MeshBasicMaterial({
    color: 0x4ade80,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const targetRing = createGroundRingBufferMesh(28, targetRingMat, 15);
  targetRing.visible = false;
  passPreviewGroup.add(targetRing);

  const arcSteps = 18;
  const arcPositions = new Float32Array((arcSteps + 1) * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
  const arcMat = new THREE.LineBasicMaterial({
    color: 0xfde047,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });
  const arcLine = new THREE.Line(arcGeo, arcMat);
  arcLine.frustumCulled = false;
  arcLine.renderOrder = 16;
  arcLine.visible = false;
  passPreviewGroup.add(arcLine);

  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0.95);
  arrowShape.lineTo(-0.55, -0.35);
  arrowShape.lineTo(0.55, -0.35);
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
  const freeArrow = new THREE.Mesh(arrowGeo, arrowMat);
  freeArrow.renderOrder = 15;
  freeArrow.visible = false;
  passPreviewGroup.add(freeArrow);

  passPreviewGroup.userData = {
    rangeRing,
    rangeRingMat,
    rangeFill,
    rangeFillMat,
    snapConeFill,
    snapConeFillMat,
    snapConeOutline,
    snapConeOutlineMat,
    snapConeOutlinePositions,
    snapConeOutlineRadSegs,
    snapConeOutlineAngSegs,
    targetRing,
    targetRingMat,
    arcLine,
    arcMat,
    arcPositions,
    arcSteps,
    freeArrow,
    arrowMat
  };
  scene.add(passPreviewGroup);
  return passPreviewGroup;
}

export function updatePassChargePreview3D(dt = 0.016) {
  const pc = state && state.passCharge;
  if (!pc || !pc.active || state.phase !== 'play') {
    if (passPreviewGroup) passPreviewGroup.visible = false;
    return;
  }
  const carrier = getPlayer(state.myTeam, state.controlledRole);
  if (!carrier || !carrier.carryingBall || carrier.state !== 'standing') {
    if (passPreviewGroup) passPreviewGroup.visible = false;
    return;
  }

  const pg = ensurePassChargePreview3D();
  if (!pg) return;
  pg.visible = true;
  passPreviewAnimTime += Math.min(0.05, dt || 0.016);

  const ud = pg.userData;
  const radius = Math.max(1.2, Number(pc.radius) || 4.5);
  const onCanopy = !!carrier.onCanopy;
  const isCancelled = !!(pc.source === 'mobile' && ctx.api.isMobileAimCancelled?.());
  const targetPlayer = pc.targetRole ? getPlayer(state.myTeam, pc.targetRole) : null;
  const hasLock = !isCancelled && !!(targetPlayer && !targetPlayer.tutorialHidden && targetPlayer !== carrier);
  const lowSpec = !!state.lowSpecMode;
  const aimAngle =
    typeof pc.aimAngle === 'number' && Number.isFinite(pc.aimAngle)
      ? pc.aimAngle
      : carrier.facingAngle || 0;
  const snapHalfAngle = getPassSnapHalfAngle(!!state.mobileMode);

  const mainHex = isCancelled ? 0xef4444 : hasLock ? 0x4ade80 : 0x38bdf8;
  ud.rangeRingMat.color.setHex(mainHex);
  ud.rangeRingMat.opacity = isCancelled ? 0.85 : hasLock ? 0.9 : 0.72;
  const bandW = Math.min(0.75, Math.max(0.32, radius * 0.035));
  updateGroundRingBufferMesh(
    ud.rangeRing,
    carrier.pos.x,
    carrier.pos.z,
    Math.max(0.25, radius - bandW),
    radius,
    0.16,
    onCanopy
  );

  ud.rangeFill.visible = !lowSpec;
  if (!lowSpec) {
    ud.rangeFillMat.color.setHex(mainHex);
    ud.rangeFillMat.opacity = isCancelled ? 0.09 : hasLock ? 0.08 : 0.06;
    updateGroundRingBufferMesh(
      ud.rangeFill,
      carrier.pos.x,
      carrier.pos.z,
      0.85,
      Math.max(0.95, radius - bandW),
      0.13,
      onCanopy
    );
  }

  // Cône filigrane de snap de passe (±30°), toujours visible même en lowSpecMode / mobile
  const coneInner = Math.min(0.85, radius * 0.25);
  const coneOuter = Math.max(coneInner + 0.25, radius);
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

  updateGroundSectorBufferMesh(
    ud.snapConeFill,
    carrier.pos.x,
    carrier.pos.z,
    aimAngle,
    snapHalfAngle,
    coneInner,
    coneOuter,
    0.145,
    onCanopy
  );

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
  const writeOutlineVert = (px, pz) => {
    outPos[vIdx * 3] = px;
    outPos[vIdx * 3 + 1] = getPreviewSurfaceY(px, pz, onCanopy) + 0.17;
    outPos[vIdx * 3 + 2] = pz;
    vIdx++;
  };
  for (let i = 0; i <= rSegs; i++) {
    const r = coneInner + (coneOuter - coneInner) * (i / rSegs);
    writeOutlineVert(carrier.pos.x + leftSin * r, carrier.pos.z + leftCos * r);
  }
  for (let a = 1; a <= aSegs; a++) {
    const theta = leftTheta + 2 * snapHalfAngle * (a / aSegs);
    writeOutlineVert(carrier.pos.x + Math.sin(theta) * coneOuter, carrier.pos.z + Math.cos(theta) * coneOuter);
  }
  for (let i = 1; i <= rSegs; i++) {
    const r = coneOuter - (coneOuter - coneInner) * (i / rSegs);
    writeOutlineVert(carrier.pos.x + rightSin * r, carrier.pos.z + rightCos * r);
  }
  ud.snapConeOutline.geometry.attributes.position.needsUpdate = true;

  if (hasLock) {
    const pulse = 1.0 + 0.08 * Math.sin(passPreviewAnimTime * 10);
    ud.targetRing.visible = true;
    ud.targetRingMat.color.setHex(0xfde047);
    updateGroundRingBufferMesh(
      ud.targetRing,
      targetPlayer.pos.x,
      targetPlayer.pos.z,
      0.85 * pulse,
      1.24 * pulse,
      0.19,
      !!targetPlayer.onCanopy
    );

    // Arc parabolique lumineux du porteur vers l'alliée verrouillée
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
  } else {
    // Aucune alliée dans le cône de snap : flèche directionnelle de tir / dribble libre
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
}

let mobileAimGroup = null;

function ensureMobileActionAimPreview3D() {
  if (mobileAimGroup || !scene) return mobileAimGroup;
  mobileAimGroup = new THREE.Group();
  mobileAimGroup.visible = false;

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
  mobileAimGroup.add(line);

  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0.9);
  arrowShape.lineTo(-0.5, -0.3);
  arrowShape.lineTo(0.5, -0.3);
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
  arrow.renderOrder = 16;
  mobileAimGroup.add(arrow);

  const destRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const destRing = createGroundRingBufferMesh(24, destRingMat, 15);
  mobileAimGroup.add(destRing);

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
  mobileAimGroup.add(wallBar);

  mobileAimGroup.userData = {
    line,
    lineMat,
    linePositions,
    lineSteps,
    arrow,
    arrowMat,
    destRing,
    destRingMat,
    wallBar,
    wallBarMat
  };
  scene.add(mobileAimGroup);
  return mobileAimGroup;
}

export function updateMobileActionAimPreview3D(actionType = null, angle = 0, origin = null, extra = null) {
  if (!actionType || !origin || state.phase !== 'play') {
    if (mobileAimGroup) mobileAimGroup.visible = false;
    return;
  }
  const mg = ensureMobileActionAimPreview3D();
  if (!mg) return;
  mg.visible = true;

  const ud = mg.userData;
  const cancelled = !!(extra && extra.cancelled);
  const onCanopy = !!(extra && extra.onCanopy);
  const toolKey = (extra && extra.toolKey) || (['beacon', 'wall', 'pad'].includes(actionType) ? actionType : null);
  const dashKind = extra && extra.dashKind;

  let hex = 0x38bdf8;
  let range = Number(extra && extra.range) || 6.5;
  if (actionType === 'dash') {
    if (dashKind === 'bounce') {
      hex = 0xf97316;
      if (!(extra && extra.range)) range = 12.1;
    } else if (dashKind === 'slide') {
      hex = 0x7dd3fc;
      if (!(extra && extra.range)) range = 18.2;
    } else if (dashKind === 'boomerang') {
      hex = 0x14b8a6;
      if (!(extra && extra.range)) range = 9.1;
    }
  } else if (actionType === 'tool' || toolKey) {
    hex = toolKey === 'pad' ? 0x06b6d4 : 0xfacc15;
    if (!(extra && extra.range)) range = toolKey === 'beacon' ? 2.5 : 2.2;
  } else if (actionType === 'throw' || actionType === 'pass' || actionType === 'action') {
    hex = 0xfde047;
    if (!(extra && extra.range)) range = 16.0;
  }
  if (cancelled) hex = 0xef4444;

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
    updateGroundRingBufferMesh(ud.destRing, endX, endZ, ringR - 0.22, ringR, 0.19, onCanopy);
  }
}

let boomerangMarkersGroup = null;
const boomerangMarkerPool = [];
let boomerangMarkerTime = 0;

function ensureBoomerangMarkerEntry(idx) {
  if (!boomerangMarkersGroup) {
    boomerangMarkersGroup = new THREE.Group();
    boomerangMarkersGroup.visible = false;
    scene.add(boomerangMarkersGroup);
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

  const octaGeo = new THREE.OctahedronGeometry(0.32, 0);
  const octaMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.92
  });
  const octa = new THREE.Mesh(octaGeo, octaMat);
  octa.position.y = 1.25;
  octa.renderOrder = 16;
  anchor.add(octa);

  root.add(anchor);

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

  boomerangMarkersGroup.add(root);
  const entry = {
    root,
    groundRing,
    ringMat,
    anchor,
    innerRingMat,
    beaconCylMat,
    octa,
    octaMat,
    tetherLine,
    tetherPos,
    tetherMat
  };
  boomerangMarkerPool[idx] = entry;
  return entry;
}

export function updateBoomerangMarkers3D(dt = 0.016) {
  if (!scene) return;
  if (state.phase !== 'play') {
    if (boomerangMarkersGroup) boomerangMarkersGroup.visible = false;
    return;
  }

  boomerangMarkerTime += Math.min(0.05, dt || 0.016);
  let anyVisible = false;

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const isVisibleOrigin =
      p &&
      !p.tutorialHidden &&
      p.state === 'standing' &&
      !p.carryingBall &&
      p.boomerangOrigin &&
      p.boomerangWindow > 0 &&
      (p.team === state.myTeam ||
        state.minimapVisionMode === 'omniscient' ||
        (p.visibleTo && p.visibleTo[state.myTeam]));

    if (!isVisibleOrigin) {
      if (boomerangMarkerPool[i]) boomerangMarkerPool[i].root.visible = false;
      continue;
    }

    anyVisible = true;
    const entry = ensureBoomerangMarkerEntry(i);
    entry.root.visible = true;

    const orig = p.boomerangOrigin;
    const ox = orig.x;
    const oz = orig.z;
    const onCanopy = !!orig.onCanopy;
    const groundY = getPreviewSurfaceY(ox, oz, onCanopy);
    const ratio = Math.max(0.15, Math.min(1, p.boomerangWindow / 2.0));
    const urgent = p.boomerangWindow <= 0.6;

    const rOuter = 0.45 + 0.65 * ratio;
    const rInner = Math.max(0.18, rOuter - 0.18);
    updateGroundRingBufferMesh(entry.groundRing, ox, oz, rInner, rOuter, 0.18, onCanopy);

    entry.ringMat.color.setHex(urgent ? 0xfacc15 : 0x14b8a6);
    entry.ringMat.opacity = 0.45 + 0.45 * ratio;
    entry.innerRingMat.opacity = 0.45 + 0.45 * ratio;
    entry.beaconCylMat.opacity = 0.22 + 0.24 * ratio;
    entry.octaMat.color.setHex(urgent ? 0xfb923c : 0xfacc15);
    entry.octaMat.opacity = 0.55 + 0.4 * ratio;

    entry.anchor.position.set(ox, groundY, oz);
    entry.octa.rotation.y = boomerangMarkerTime * 3.6;
    entry.octa.position.y = 1.25 + Math.sin(boomerangMarkerTime * 6.0) * 0.14;

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

  for (let i = players.length; i < boomerangMarkerPool.length; i++) {
    if (boomerangMarkerPool[i]) boomerangMarkerPool[i].root.visible = false;
  }

  if (boomerangMarkersGroup) {
    boomerangMarkersGroup.visible = anyVisible;
  }
}
