// ============================================================================
// COILBALL 3D — ULTIMATES ÉLÉMENTAIRES (FEU, FEUILLE, EAU & PREVIEW 3D)
// ============================================================================

import { FIELD, COLORS, state, mp, ctx } from './state.js';
import { scene, players, getPlayer, spawnParticles } from './render3d.js';
import {
  CANOPY_SPEC,
  JUNGLE_OBSTACLES,
  JUNGLE_WALLS,
  PARK_LANDMARKS,
  getTerrainY,
  getStructureSurfaceY,
  pushOutAABB,
  distSqPointToSegment2D,
  rayToCapsuleDistance2D
} from './world.js';

const THREE = ctx.THREE;

export function initUltimates() {
  ctx.entities.activeLeafWalls = activeLeafWalls;
  ctx.entities.activeFireLasers = activeFireLasers;
  ctx.entities.activeWaterWaves = activeWaterWaves;
}

export function hideUltimatePreview() {
  if (ultPreviewGroup) ultPreviewGroup.visible = false;
}
// --- SYSTÈME D'ULTIMATES ÉLÉMENTAIRES (RONDE 2+, 1x PAR JOUEUSE PAR RONDE, [R] + CLIC GAUCHE) ---
export const FIRE_ULT_DELAY = 0.5;
export const FIRE_ULT_MAX_LEN = 115.0;
export const FIRE_ULT_SPEED = 520.0; // Voyage quasi instantané
export const FIRE_ULT_BEAM_RADIUS = 0.78;
export const FIRE_ULT_LINGER = 0.28;

export const LEAF_ULT_SPRINT_DURATION = 2.0;
export const LEAF_ULT_SPEED_MULT = 3.0;
export const LEAF_ULT_GROW_DELAY = 1.0;
export const LEAF_ULT_WALL_DURATION = 4.0;
export const LEAF_ULT_NODE_SPACING = 1.45;
export const LEAF_ULT_WALL_RADIUS = 0.85;

export const WATER_ULT_WIDTH = 20.0;
export const WATER_ULT_SEGMENTS = 17;
export const WATER_ULT_RANGE = 42.0;
export const WATER_ULT_SPEED = 24.0;
export const WATER_ULT_PUSH_SPEED = 28.5;

export const activeFireLasers = [];
export const activeLeafWalls = [];
export const activeWaterWaves = [];
let ultPreviewGroup = null;

export function hasPlayerUltEvo(p) {
  return !!(p && state.teams[p.team]?.powers?.[p.role]?.ultEvo);
}

export function clearAllUltimates() {
  while (activeFireLasers.length > 0) {
    const f = activeFireLasers.pop();
    if (f.group) scene.remove(f.group);
  }
  while (activeLeafWalls.length > 0) {
    const w = activeLeafWalls.pop();
    if (w.group) scene.remove(w.group);
  }
  while (activeWaterWaves.length > 0) {
    const w = activeWaterWaves.pop();
    if (w.group) scene.remove(w.group);
  }
  if (typeof activeWaterPulls !== 'undefined') {
    activeWaterPulls.length = 0;
  }
  if (ultPreviewGroup) {
    ultPreviewGroup.visible = false;
  }
  ctx.api.markNavDynamicDirty?.();
}

export function getUltimateMeta(colorKey, p = null) {
  const evo = hasPlayerUltEvo(p);
  if (colorKey === 'red') {
    return {
      name: evo ? 'Rayon Plasma Évolué (2 charges)' : 'Rayon Plasma',
      icon: '🔥',
      desc: evo
        ? 'Plus large, plus rapide, visée libre pendant 0.5s et 2 charges (3s entre chaque tir) !'
        : 'Charge 0.5s (visée libre) → snipe de loin (assoit toute cible, bloqué par obstacles/bois/eau)',
      hex: 0xff6b1a
    };
  }
  if (colorKey === 'green') {
    return {
      name: evo ? 'Sprint Sylvestre Évolué' : 'Sprint Sylvestre & Mur de Bois',
      icon: '🌿',
      desc: evo
        ? 'Vitesse 4.2x (3.5s) → mur géant densément noué bloquant totalement la vue (8s) !'
        : 'Vitesse 3x (2s) semant des germes → +1s pousse un mur de branches (4s)',
      hex: 0x22c55e
    };
  }
  return {
    name: evo ? 'Raz-de-Marée 360° Évolué' : 'Vague Déferlante',
    icon: '💧',
    desc: evo
      ? 'Vague tout autour (360°), portée accrue & réactivable [R] pour ramener les cibles touchées !'
      : 'Large vague qui repousse tout devant soi, protège du feu et contourne les obstacles (sauf mur de bois)',
    hex: 0x38bdf8
  };
}

export function getUltimateAimAngle(p, overrideAngle = null) {
  if (!p) return 0;
  if (typeof overrideAngle === 'number' && Number.isFinite(overrideAngle)) {
    return overrideAngle;
  }
  const mobileOverride = ctx.api.getMobileAimOverride?.('ult');
  if (typeof mobileOverride === 'number' && Number.isFinite(mobileOverride)) {
    return mobileOverride;
  }
  if (state.cameraMode === 'aerial') {
    let aimHit = null;
    if (typeof state.mouseClientX === 'number' && typeof state.mouseClientY === 'number') {
      aimHit = ctx.api.raycastScreenToWorld(state.mouseClientX, state.mouseClientY);
      if (aimHit) state.mobaAimWorld = aimHit;
    }
    if (!aimHit) aimHit = state.mobaAimWorld;
    if (aimHit) {
      const dx = aimHit.x - p.pos.x;
      const dz = aimHit.z - p.pos.z;
      if (Math.hypot(dx, dz) > 0.15) {
        return Math.atan2(dx, dz);
      }
    }
    return p.facingAngle;
  }
  const camForwardX = -Math.sin(state.camYaw);
  const camForwardZ = -Math.cos(state.camYaw);
  return Math.atan2(camForwardX, camForwardZ);
}

export function isUltimateUnlocked() {
  if (state.vanillaMode) return false;
  return (
    state.round >= 2 ||
    state.mode === 'practice' ||
    (state.mode === 'tutorial' && state.tutorialStep >= 4)
  );
}

export function canReactivateWaterUlt(p) {
  if (state.vanillaMode) return false;
  return !!(
    p &&
    state.phase === 'play' &&
    p.state === 'standing' &&
    !p.carryingBall &&
    p.activeReactivableWave &&
    !p.activeReactivableWave.pullTriggered &&
    p.activeReactivableWave.pullWindowTimer > 0
  );
}

export function canPlayerUseUltimate(p, showReasonToast = false) {
  if (!p) return false;
  if (state.phase !== 'play') return false;
  if (state.vanillaMode) {
    if (showReasonToast) {
      ctx.api.showToast('🍦 <strong>Mode Vanille</strong> : les Ultimates sont désactivés.', 2000);
    }
    return false;
  }
  if (!isUltimateUnlocked()) {
    if (showReasonToast) {
      if (state.mode === 'tutorial') {
        ctx.api.showToast('🔒 <strong>Ultimate verrouillé</strong> : il sera débloqué à l’<strong>étape 4/5</strong> du tutoriel !', 2400);
      } else {
        ctx.api.showToast('🔒 <strong>Ultimate verrouillé</strong> : disponible à partir de la <strong>2e ronde</strong> (ou en mode Un tour pour rien) !', 2400);
      }
    }
    return false;
  }
  if (p.ultCooldown > 0) {
    if (showReasonToast) {
      ctx.api.showToast(`⏳ <strong>2e charge en recharge</strong> (${p.ultCooldown.toFixed(1)}s) !`, 1600);
    }
    return false;
  }
  if (p.ultUsed) {
    if (showReasonToast) {
      ctx.api.showToast(`⏳ <strong>Ultimate déjà utilisé</strong> par <strong>Joueuse ${p.role}</strong> durant cette ronde !`, 2200);
    }
    return false;
  }
  if (p.state !== 'standing') {
    if (showReasonToast) {
      ctx.api.showToast('⚠️ <strong>Ultimate indisponible</strong> : la joueuse doit être debout et libre !', 2000);
    }
    return false;
  }
  if (p.carryingBall) {
    if (showReasonToast) {
      ctx.api.showToast('⚽ <strong>Impossible d’utiliser un Ultimate</strong> en portant le ballon !', 2200);
    }
    return false;
  }
  return true;
}

export function toggleUltimatePreview() {
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!p) return;
  if (canReactivateWaterUlt(p)) {
    state.ultPreviewActive = false;
    if (ultPreviewGroup) ultPreviewGroup.visible = false;
    const msg = {
      type: 'MP_ULT_TRIGGER',
      round: state.round,
      peerId: mp.myPeerId,
      team: p.team,
      role: p.role,
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      oc: p.onCanopy ? 1 : 0,
      aimAngle: p.facingAngle,
      reactivate: true
    };
    if (mp.enabled) ctx.api.sendNetMessage(msg);
    triggerPlayerUltimate(p, p.facingAngle, false, true);
    return;
  }
  if (state.ultPreviewActive) {
    cancelUltimatePreview(true);
    return;
  }
  if (!canPlayerUseUltimate(p, true)) return;
  state.ultPreviewActive = true;
  state.ultPreviewAimAngle = getUltimateAimAngle(p);
  ctx.api.playSfx?.('ult_aim');
  const meta = getUltimateMeta(p.color, p);
  ctx.api.showToast(
    `${meta.icon} <strong>Visée Ultimate : ${meta.name}</strong> — <strong>Clic Gauche</strong> pour déclencher (<strong>R</strong> pour annuler)`,
    2600
  );
  if (state.mode === 'tutorial' && state.tutorialStep === 4) {
    ctx.api.markTutorialCheck('ultAimed');
  }
  updateUltHudWidget();
}

export function cancelUltimatePreview(showFeedback = false) {
  if (!state.ultPreviewActive) return;
  state.ultPreviewActive = false;
  if (ultPreviewGroup) ultPreviewGroup.visible = false;
  if (showFeedback) {
    ctx.api.playSfx?.('ult_cancel');
    ctx.api.showToast('✖️ <strong>Visée Ultimate annulée.</strong>', 1300);
  }
  updateUltHudWidget();
}

export function confirmUltimateTrigger(overrideAngle = null) {
  const hasExplicitOverride = typeof overrideAngle === 'number' && Number.isFinite(overrideAngle);
  if (!state.ultPreviewActive && !hasExplicitOverride) return false;
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!canPlayerUseUltimate(p, true)) {
    state.ultPreviewActive = false;
    if (ultPreviewGroup) ultPreviewGroup.visible = false;
    updateUltHudWidget();
    return false;
  }
  const aimAngle = getUltimateAimAngle(p, hasExplicitOverride ? overrideAngle : null);
  state.ultPreviewActive = false;
  if (ultPreviewGroup) ultPreviewGroup.visible = false;
  p.facingAngle = aimAngle;

  if (mp.enabled) {
    ctx.api.sendNetMessage({
      type: 'MP_ULT_TRIGGER',
      round: state.round,
      peerId: mp.myPeerId,
      team: p.team,
      role: p.role,
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      oc: p.onCanopy ? 1 : 0,
      aimAngle
    });
  }

  triggerPlayerUltimate(p, aimAngle, false, false, hasExplicitOverride ? aimAngle : null);
  return true;
}

function rayToCircleDistance2D(ox, oz, dirX, dirZ, cx, cz, radius, maxLen) {
  const fx = ox - cx;
  const fz = oz - cz;
  const b = 2 * (fx * dirX + fz * dirZ);
  const c = fx * fx + fz * fz - radius * radius;
  if (c <= 0) return 0;
  const disc = b * b - 4 * c;
  if (disc < 0) return maxLen;
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) * 0.5;
  if (t1 >= 0 && t1 < maxLen) return t1;
  const t2 = (-b + sqrtD) * 0.5;
  if (t2 >= 0 && t2 < maxLen) return t2;
  return maxLen;
}

function rayToAABB2D(ox, oz, dirX, dirZ, minX, maxX, minZ, maxZ, maxLen) {
  let tmin = 0;
  let tmax = maxLen;
  if (Math.abs(dirX) < 1e-6) {
    if (ox < minX || ox > maxX) return maxLen;
  } else {
    const invX = 1 / dirX;
    let t1 = (minX - ox) * invX;
    let t2 = (maxX - ox) * invX;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return maxLen;
  }

  if (Math.abs(dirZ) < 1e-6) {
    if (oz < minZ || oz > maxZ) return maxLen;
  } else {
    const invZ = 1 / dirZ;
    let t1 = (minZ - oz) * invZ;
    let t2 = (maxZ - oz) * invZ;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return maxLen;
  }

  return tmin >= 0 && tmin < maxLen ? tmin : maxLen;
}

function computeFireLaserMaxDist(ox, oy, oz, dirX, dirZ, maxLen = FIRE_ULT_MAX_LEN) {
  let bestT = maxLen;

  // 1. Limites de l'arène
  const halfW = FIELD.width * 0.5 - 0.35;
  const halfD = FIELD.depth * 0.5 - 0.35;
  if (Math.abs(dirX) > 1e-5) {
    const tx = ((dirX > 0 ? halfW : -halfW) - ox) / dirX;
    if (tx > 0 && tx < bestT) bestT = tx;
  }
  if (Math.abs(dirZ) > 1e-5) {
    const tz = ((dirZ > 0 ? halfD : -halfD) - oz) / dirZ;
    if (tz > 0 && tz < bestT) bestT = tz;
  }

  // 2. Obstacles statiques du parc
  const onHighCanopy = oy >= 3.8;
  for (let i = 0; i < JUNGLE_OBSTACLES.length; i++) {
    const obs = JUNGLE_OBSTACLES[i];
    if (onHighCanopy && obs.kind !== 'gazebo') continue;
    const t = rayToCircleDistance2D(ox, oz, dirX, dirZ, obs.x, obs.z, obs.radius + 0.15, bestT);
    if (t < bestT) bestT = t;
  }

  if (!onHighCanopy) {
    for (let i = 0; i < JUNGLE_WALLS.length; i++) {
      const w = JUNGLE_WALLS[i];
      bestT = rayToCapsuleDistance2D(ox, oz, dirX, dirZ, w.ax, w.az, w.bx, w.bz, w.radius + 0.15, bestT, 0.2);
    }
  }

  if (CANOPY_SPEC.hasCanopy && !onHighCanopy) {
    for (let i = 0; i < CANOPY_SPEC.trunks.length; i++) {
      const tr = CANOPY_SPEC.trunks[i];
      const t = rayToCircleDistance2D(ox, oz, dirX, dirZ, tr.x, tr.z, tr.radius + 0.15, bestT);
      if (t < bestT) bestT = t;
    }
    bestT = rayToAABB2D(
      ox, oz, dirX, dirZ,
      -CANOPY_SPEC.rampSkirtOuterX, -CANOPY_SPEC.rampSkirtInnerX,
      -CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ, bestT
    );
    bestT = rayToAABB2D(
      ox, oz, dirX, dirZ,
      CANOPY_SPEC.rampSkirtInnerX, CANOPY_SPEC.rampSkirtOuterX,
      -CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ, bestT
    );
    bestT = rayToAABB2D(
      ox, oz, dirX, dirZ,
      -1.9, 1.9, -CANOPY_SPEC.launchPierOuterZ, -CANOPY_SPEC.launchPierInnerZ, bestT
    );
    bestT = rayToAABB2D(
      ox, oz, dirX, dirZ,
      -1.9, 1.9, CANOPY_SPEC.launchPierInnerZ, CANOPY_SPEC.launchPierOuterZ, bestT
    );
  } else if (state.mapId === 'saint-viateur' && !onHighCanopy) {
    const sv = PARK_LANDMARKS.saintViateur;
    bestT = rayToAABB2D(
      ox, oz, dirX, dirZ,
      sv.chaletMinX, sv.chaletMaxX, sv.chaletMinZ, sv.chaletMaxZ, bestT
    );
  } else if (state.mapId === 'lafontaine' && !onHighCanopy) {
    const lf = PARK_LANDMARKS.lafontaine;
    bestT = rayToCircleDistance2D(ox, oz, dirX, dirZ, -lf.fountainX, 0, lf.fountainR, bestT);
    bestT = rayToCircleDistance2D(ox, oz, dirX, dirZ, lf.fountainX, 0, lf.fountainR, bestT);
  } else if (state.mapId === 'mont-royal' && !onHighCanopy) {
    const mr = PARK_LANDMARKS.montRoyal;
    bestT = rayToCircleDistance2D(ox, oz, dirX, dirZ, mr.crossX, mr.crossZ, mr.crossRadius, bestT);
  }

  // 3. Mur de bois (Ultimate Feuille poussé) bloque le rayon de feu !
  for (let w = 0; w < activeLeafWalls.length; w++) {
    const wall = activeLeafWalls[w];
    if (wall.phase !== 'grown') continue;
    for (let i = 0; i < wall.nodes.length; i++) {
      const nd = wall.nodes[i];
      const t = rayToCircleDistance2D(ox, oz, dirX, dirZ, nd.x, nd.z, LEAF_ULT_WALL_RADIUS + 0.18, bestT);
      if (t < bestT) bestT = t;
    }
    // Échantillonnage des branches entrelacées entre deux noeuds consécutifs
    for (let i = 0; i < wall.nodes.length - 1; i++) {
      const a = wall.nodes[i];
      const b = wall.nodes[i + 1];
      const mx = (a.x + b.x) * 0.5;
      const mz = (a.z + b.z) * 0.5;
      const t = rayToCircleDistance2D(ox, oz, dirX, dirZ, mx, mz, LEAF_ULT_WALL_RADIUS, bestT);
      if (t < bestT) bestT = t;
    }
  }

  // 3b. Murs déployables 3 m (Outil) bloquent aussi le rayon de feu !
  for (let w = 0; w < (ctx.entities.activeToolWalls || []).length; w++) {
    const tw = (ctx.entities.activeToolWalls || [])[w];
    for (let s = 0; s < 5; s++) {
      const u = 0.1 + s * 0.2;
      const cx = tw.ax + (tw.bx - tw.ax) * u;
      const cz = tw.az + (tw.bz - tw.az) * u;
      const t = rayToCircleDistance2D(ox, oz, dirX, dirZ, cx, cz, 0.45, bestT);
      if (t < bestT) bestT = t;
    }
  }

  // 4. Vague d'eau (Ultimate Eau) bloque le rayon de feu !
  for (let w = 0; w < activeWaterWaves.length; w++) {
    const wave = activeWaterWaves[w];
    for (let i = 0; i < wave.segments.length; i++) {
      const seg = wave.segments[i];
      if (!seg.active) continue;
      const t = rayToCircleDistance2D(ox, oz, dirX, dirZ, seg.x, seg.z, seg.radius + 0.35, bestT);
      if (t < bestT) bestT = t;
    }
  }

  return Math.max(0.8, bestT);
}

export function triggerPlayerUltimate(p, aimAngle = p.facingAngle, fromNetwork = false, reactivate = false, overrideAngle = null) {
  if (!p || state.phase !== 'play' || state.vanillaMode) return;
  if (reactivate) {
    triggerWaterWavePull(p);
    return;
  }
  if (!fromNetwork && !canPlayerUseUltimate(p, false)) return;

  const hasOverride = typeof overrideAngle === 'number' && Number.isFinite(overrideAngle);
  const resolvedAimAngle = hasOverride ? overrideAngle : aimAngle;
  const isLocalControlled = p.team === state.myTeam && p.role === state.controlledRole;
  const lockFireAim = !fromNetwork && (hasOverride || (state.mobileMode && isLocalControlled));
  const evolved = hasPlayerUltEvo(p);
  p.facingAngle = resolvedAimAngle;
  const teamLabel = p.team === 'ally' ? 'Équipe Or' : 'Équipe Violette';

  if (p.color === 'red') {
    if (evolved) {
      p.ultShotsUsed = (p.ultShotsUsed || 0) + 1;
      if (p.ultShotsUsed < 2) {
        p.ultUsed = false;
        p.ultCooldown = 3.0;
      } else {
        p.ultUsed = true;
        p.ultCooldown = 0;
      }
    } else {
      p.ultUsed = true;
    }
    spawnFireLaserUltimate(p, resolvedAimAngle, evolved, lockFireAim);
    ctx.api.broadcastToast(
      evolved
        ? `🔥🌟 <strong>ULTIMATE FEU ÉVOLUÉ !</strong> ${teamLabel} ${p.role} charge un <strong>Large Plasma</strong> (0.5s, ${p.ultShotsUsed}/2) !`
        : `🔥 <strong>ULTIMATE FEU !</strong> ${teamLabel} ${p.role} charge son <strong>Rayon Plasma</strong> (0.5s) !`,
      3000
    );
  } else if (p.color === 'green') {
    p.ultUsed = true;
    spawnLeafWallUltimate(p, resolvedAimAngle);
    ctx.api.broadcastToast(
      evolved
        ? `🌿🌟 <strong>ULTIMATE FEUILLE ÉVOLUÉ !</strong> ${teamLabel} ${p.role} sprinte à <strong>4.2x (3.5s)</strong> et sème un grand <strong>Mur Organique (8s)</strong> !`
        : `🌿 <strong>ULTIMATE FEUILLE !</strong> ${teamLabel} ${p.role} sprinte à <strong>3x vitesse (2s)</strong> et sème un <strong>Mur de Bois (4s)</strong> !`,
      3400
    );
  } else {
    p.ultUsed = true;
    spawnWaterWaveUltimate(p, resolvedAimAngle);
    ctx.api.broadcastToast(
      evolved
        ? `💧🌟 <strong>ULTIMATE EAU ÉVOLUÉ !</strong> ${teamLabel} ${p.role} déchaîne une <strong>Onde 360°</strong> (réactiver <strong>[R]</strong> pour ramener) !`
        : `💧 <strong>ULTIMATE EAU !</strong> ${teamLabel} ${p.role} déchaîne une <strong>Vague Déferlante</strong> !`,
      3400
    );
  }

  if (p.team === state.myTeam && p.role === state.controlledRole) {
    ctx.api.triggerGamepadRumble(210, 0.75, 0.85);
    if (state.mode === 'tutorial' && state.tutorialStep === 4) {
      ctx.api.markTutorialCheck('ultAimed');
      ctx.api.markTutorialCheck('ultFired');
    }
  }
  ctx.api.updateRosterHUD();
  updateUltHudWidget();
}

// --- 1. ULTIMATE FEU : LASER / MINCE PLASMA ORANGE ET BLANC ---
export function isPlayerChargingFireUlt(p) {
  if (!p) return false;
  for (let i = 0; i < activeFireLasers.length; i++) {
    const f = activeFireLasers[i];
    if (f.phase === 'telegraph' && f.casterId === p.id) return true;
  }
  return false;
}

function getUltPreviewSurfaceY(wx, wz, onCanopy = false) {
  if (onCanopy && CANOPY_SPEC.hasCanopy) {
    return getStructureSurfaceY(wx, wz, true).y;
  }
  return getTerrainY(wx, wz);
}

export function createTerrainRibbonMesh(lengthSegs, material, renderOrder = 14) {
  const vertCount = (lengthSegs + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const indices = [];
  for (let s = 0; s < lengthSegs; s++) {
    const a = s * 2;
    const b = s * 2 + 1;
    const c = (s + 1) * 2 + 1;
    const d = (s + 1) * 2;
    indices.push(a, b, c, a, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.userData.lengthSegs = lengthSegs;
  mesh.userData.positions = positions;
  return mesh;
}

function updateTerrainRibbonLocal(mesh, ox, oz, dirX, dirZ, halfW, length, yOffset, onCanopy = false) {
  const segs = mesh.userData.lengthSegs;
  const pos = mesh.userData.positions;
  // Local (lx, lz) inside a group at (ox, 0, oz) rotated by aimAngle:
  // worldX = ox + dirZ * lx + dirX * lz, worldZ = oz - dirX * lx + dirZ * lz
  for (let s = 0; s <= segs; s++) {
    const dist = (s / segs) * length;
    const cx = ox + dirX * dist;
    const cz = oz + dirZ * dist;
    const wxL = cx - dirZ * halfW;
    const wzL = cz + dirX * halfW;
    const wxR = cx + dirZ * halfW;
    const wzR = cz - dirX * halfW;
    const yL = getUltPreviewSurfaceY(wxL, wzL, onCanopy) + yOffset;
    const yR = getUltPreviewSurfaceY(wxR, wzR, onCanopy) + yOffset;
    const i0 = s * 6;
    pos[i0] = -halfW;
    pos[i0 + 1] = yL;
    pos[i0 + 2] = dist;
    pos[i0 + 3] = halfW;
    pos[i0 + 4] = yR;
    pos[i0 + 5] = dist;
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}

export function updateTerrainRibbonWorld(mesh, ox, oz, dirX, dirZ, rightX, rightZ, halfW, length, yOffset, onCanopy = false) {
  const segs = mesh.userData.lengthSegs;
  const pos = mesh.userData.positions;
  for (let s = 0; s <= segs; s++) {
    const dist = (s / segs) * length;
    const cx = ox + dirX * dist;
    const cz = oz + dirZ * dist;
    const wxL = cx - rightX * halfW;
    const wzL = cz - rightZ * halfW;
    const wxR = cx + rightX * halfW;
    const wzR = cz + rightZ * halfW;
    const yL = getUltPreviewSurfaceY(wxL, wzL, onCanopy) + yOffset;
    const yR = getUltPreviewSurfaceY(wxR, wzR, onCanopy) + yOffset;
    const i0 = s * 6;
    pos[i0] = wxL;
    pos[i0 + 1] = yL;
    pos[i0 + 2] = wzL;
    pos[i0 + 3] = wxR;
    pos[i0 + 4] = yR;
    pos[i0 + 5] = wzR;
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}

function spawnFireLaserUltimate(caster, aimAngle, evolved = false, lockAim = false) {
  const beamRadius = evolved ? FIRE_ULT_BEAM_RADIUS * 1.9 : FIRE_ULT_BEAM_RADIUS;
  const castDelay = FIRE_ULT_DELAY;
  const beamSpeed = evolved ? FIRE_ULT_SPEED * 1.8 : FIRE_ULT_SPEED;
  const dirX = Math.sin(aimAngle);
  const dirZ = Math.cos(aimAngle);
  const ox = caster.pos.x + dirX * 0.85;
  const oy = (caster.pos.y || 0) + 1.05;
  const oz = caster.pos.z + dirZ * 0.85;

  const group = new THREE.Group();
  scene.add(group);

  // Zone de danger au sol pendant le pré-tir (suit le relief)
  const dangerWidth = beamRadius * 2.1;
  const dangerMat = new THREE.MeshBasicMaterial({
    color: evolved ? 0xff2200 : 0xff4500,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const dangerStrip = createTerrainRibbonMesh(44, dangerMat, 14);
  group.add(dangerStrip);

  const warnCoreGeo = new THREE.CylinderGeometry(evolved ? 0.11 : 0.06, evolved ? 0.11 : 0.06, 1.0, 8);
  warnCoreGeo.rotateX(Math.PI / 2);
  warnCoreGeo.translate(0, 0, 0.5);
  const warnCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffedd5,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });
  const warnCore = new THREE.Mesh(warnCoreGeo, warnCoreMat);
  group.add(warnCore);

  // Faisceau plasma orange externe + coeur blanc incandescent + arcs électriques hélicoïdaux
  const outerRadius = evolved ? 0.54 : 0.28;
  const innerRadius = evolved ? 0.22 : 0.11;
  const outerBeamGeo = new THREE.CylinderGeometry(outerRadius, outerRadius, 1.0, 12);
  outerBeamGeo.rotateX(Math.PI / 2);
  outerBeamGeo.translate(0, 0, 0.5);
  const outerBeamMat = new THREE.MeshBasicMaterial({
    color: 0xff6b00,
    transparent: true,
    opacity: 0.88,
    depthWrite: false
  });
  const outerBeam = new THREE.Mesh(outerBeamGeo, outerBeamMat);
  outerBeam.visible = false;
  group.add(outerBeam);

  const innerBeamGeo = new THREE.CylinderGeometry(innerRadius, innerRadius, 1.0, 10);
  innerBeamGeo.rotateX(Math.PI / 2);
  innerBeamGeo.translate(0, 0, 0.5);
  const innerBeamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.98,
    depthWrite: false
  });
  const innerBeam = new THREE.Mesh(innerBeamGeo, innerBeamMat);
  innerBeam.visible = false;
  group.add(innerBeam);

  // 3 arcs électriques hélicoïdaux purement visuels entourant le faisceau
  const FIRE_ARC_SPECS = [
    { color: 0xe0f2fe, opacity: 0.95, radialBase: evolved ? 0.72 : 0.44, turns: 5.5, speed: 15.0, phaseOffset: 0.0 },
    { color: 0x38bdf8, opacity: 0.88, radialBase: evolved ? 0.88 : 0.56, turns: -4.8, speed: -18.5, phaseOffset: 2.1 },
    { color: 0xfde047, opacity: 0.86, radialBase: evolved ? 0.58 : 0.36, turns: 7.2, speed: 22.0, phaseOffset: 4.2 }
  ];
  const FIRE_ARC_PTS = 34;
  const electricArcs = FIRE_ARC_SPECS.map((spec) => {
    const positions = new Float32Array(FIRE_ARC_PTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      depthWrite: false
    });
    const line = new THREE.Line(geo, mat);
    line.position.set(0, oy, 0);
    line.frustumCulled = false;
    line.visible = false;
    group.add(line);
    return {
      line,
      positions,
      ptsCount: FIRE_ARC_PTS,
      baseOpacity: spec.opacity,
      radialBase: spec.radialBase,
      turns: spec.turns,
      speed: spec.speed,
      phaseOffset: spec.phaseOffset
    };
  });

  const muzzleRingGeo = new THREE.RingGeometry(0.25, 0.85, 24);
  const muzzleRingMat = new THREE.MeshBasicMaterial({
    color: 0xffedd5,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const muzzleRing = new THREE.Mesh(muzzleRingGeo, muzzleRingMat);
  group.add(muzzleRing);

  // Boule d'énergie qui se forme devant le personnage pendant le délai de charge (0.5s)
  const chargeBallGroup = new THREE.Group();
  const ballCoreGeo = new THREE.SphereGeometry(evolved ? 0.34 : 0.24, 14, 14);
  const ballCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.96,
    depthWrite: false
  });
  const ballCore = new THREE.Mesh(ballCoreGeo, ballCoreMat);
  chargeBallGroup.add(ballCore);

  const ballAuraGeo = new THREE.SphereGeometry(evolved ? 0.62 : 0.44, 16, 16);
  const ballAuraMat = new THREE.MeshBasicMaterial({
    color: evolved ? 0xff3b00 : 0xff6b00,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  const ballAura = new THREE.Mesh(ballAuraGeo, ballAuraMat);
  chargeBallGroup.add(ballAura);

  const ballHaloGeo = new THREE.TorusGeometry(evolved ? 0.56 : 0.4, 0.045, 8, 24);
  const ballHaloMat = new THREE.MeshBasicMaterial({
    color: 0xfde047,
    transparent: true,
    opacity: 0.88,
    depthWrite: false
  });
  const ballHalo = new THREE.Mesh(ballHaloGeo, ballHaloMat);
  chargeBallGroup.add(ballHalo);
  group.add(chargeBallGroup);

  const impactSphereGeo = new THREE.SphereGeometry(0.55, 12, 12);
  const impactSphereMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });
  const impactSphere = new THREE.Mesh(impactSphereGeo, impactSphereMat);
  impactSphere.visible = false;
  group.add(impactSphere);

  const maxLen = computeFireLaserMaxDist(ox, oy, oz, dirX, dirZ, FIRE_ULT_MAX_LEN);
  group.position.set(ox, 0, oz);
  group.rotation.y = aimAngle;

  updateTerrainRibbonLocal(
    dangerStrip,
    ox,
    oz,
    dirX,
    dirZ,
    dangerWidth * 0.5,
    maxLen,
    0.2,
    !!caster.onCanopy
  );
  warnCore.position.y = oy;
  warnCore.scale.set(1, 1, maxLen);
  muzzleRing.position.set(0, oy, 0.28);
  chargeBallGroup.position.set(0, oy, 0.28);
  chargeBallGroup.scale.setScalar(0.18);

  spawnParticles(new THREE.Vector3(ox, oy, oz), 0xff6b00, 14);
  ctx.api.playSfx?.('ult_fire_charge', { pos: caster.pos, evolved, global: true });

  activeFireLasers.push({
    caster,
    casterId: caster.id,
    casterRole: caster.role,
    team: caster.team,
    evolved: !!evolved,
    ox,
    oy,
    oz,
    dirX,
    dirZ,
    aimAngle,
    lockedAimAngle: lockAim ? aimAngle : null,
    beamRadius,
    delay: castDelay,
    speed: beamSpeed,
    phase: 'telegraph',
    timer: castDelay,
    currentLen: 0,
    maxLen,
    lingerTimer: FIRE_ULT_LINGER,
    arcTime: 0,
    hitPlayers: new Set(),
    group,
    dangerStrip,
    warnCore,
    outerBeam,
    innerBeam,
    electricArcs,
    muzzleRing,
    chargeBallGroup,
    ballAuraMat,
    ballHalo,
    impactSphere
  });
}

function updateFireLaserElectricArcs(f, beamLen, alpha) {
  if (!f.electricArcs || f.electricArcs.length === 0) return;
  const len = Math.max(0.2, beamLen);
  const flickerFrame = Math.floor(f.arcTime * 38);

  for (let aIdx = 0; aIdx < f.electricArcs.length; aIdx++) {
    const arc = f.electricArcs[aIdx];
    arc.line.visible = true;
    arc.line.position.y = f.oy;
    arc.line.material.opacity = arc.baseOpacity * alpha;

    const pos = arc.positions;
    const pts = arc.ptsCount;
    for (let k = 0; k < pts; k++) {
      const t = k / (pts - 1);
      const env = Math.sin(t * Math.PI);
      const theta =
        arc.phaseOffset +
        f.arcTime * arc.speed +
        t * Math.PI * 2 * arc.turns * Math.max(1, len / 18);
      const jag =
        k === 0 || k === pts - 1
          ? 0
          : Math.sin(k * 12.9898 + flickerFrame * 78.233 + arc.phaseOffset * 5.7);
      const radius =
        (arc.radialBase + jag * 0.22) *
        (0.25 + 0.75 * env) *
        (0.4 + 0.6 * alpha);
      const idx3 = k * 3;
      pos[idx3] = Math.cos(theta) * radius;
      pos[idx3 + 1] = Math.sin(theta) * radius;
      pos[idx3 + 2] = t * len;
    }
    arc.line.geometry.attributes.position.needsUpdate = true;
  }
}

function updateFireLasers(dt) {
  for (let i = activeFireLasers.length - 1; i >= 0; i--) {
    const f = activeFireLasers[i];
    f.arcTime = (f.arcTime || 0) + dt;
    // Recalcule la distance max en continu (au cas où un mur de bois ou une vague d'eau s'interpose)
    f.maxLen = computeFireLaserMaxDist(f.ox, f.oy, f.oz, f.dirX, f.dirZ, FIRE_ULT_MAX_LEN);

    if (f.phase === 'telegraph') {
      f.timer -= dt;
      const c = f.caster;
      if (c && c.state !== 'sitting' && !c.tutorialHidden) {
        const isLocalCaster = c.team === state.myTeam && c.role === state.controlledRole;
        if (isLocalCaster) {
          if (typeof f.lockedAimAngle === 'number' && Number.isFinite(f.lockedAimAngle)) {
            f.aimAngle = f.lockedAimAngle;
          } else {
            f.aimAngle = getUltimateAimAngle(c);
          }
          c.facingAngle = f.aimAngle;
        } else if (mp.enabled) {
          const isHumanRemote =
            !mp.isHost ||
            mp.members.some((m) => m.team === c.team && (m.activeRole === c.role || m.slot === c.role));
          if (isHumanRemote) {
            f.aimAngle = c.facingAngle;
          } else {
            c.facingAngle = f.aimAngle;
          }
        } else {
          c.facingAngle = f.aimAngle;
        }
        f.dirX = Math.sin(f.aimAngle);
        f.dirZ = Math.cos(f.aimAngle);
        f.ox = c.pos.x + f.dirX * 0.85;
        f.oy = (c.pos.y || 0) + 1.05;
        f.oz = c.pos.z + f.dirZ * 0.85;
        f.group.position.set(f.ox, 0, f.oz);
        f.group.rotation.y = f.aimAngle;
        f.warnCore.position.y = f.oy;
        f.muzzleRing.position.set(0, f.oy, 0.28);
        if (f.chargeBallGroup) f.chargeBallGroup.position.set(0, f.oy, 0.28);
        f.maxLen = computeFireLaserMaxDist(f.ox, f.oy, f.oz, f.dirX, f.dirZ, FIRE_ULT_MAX_LEN);
      }

      const prog = 1 - Math.max(0, f.timer / (f.delay || FIRE_ULT_DELAY));
      const pulse = 0.45 + 0.45 * Math.sin(prog * Math.PI * 10);
      const dangerHalfW = (f.beamRadius || FIRE_ULT_BEAM_RADIUS) * 1.05 * (1 + prog * 0.2);
      updateTerrainRibbonLocal(
        f.dangerStrip,
        f.ox,
        f.oz,
        f.dirX,
        f.dirZ,
        dangerHalfW,
        f.maxLen,
        0.2,
        !!(c && c.onCanopy)
      );
      f.dangerStrip.material.opacity = 0.35 + pulse * 0.45;
      f.warnCore.scale.set(1 + prog * 1.4, 1 + prog * 1.4, f.maxLen);
      f.warnCore.material.opacity = 0.55 + prog * 0.45;
      f.muzzleRing.scale.setScalar(0.45 + prog * 1.15);

      if (f.chargeBallGroup) {
        const ballScale = 0.18 + prog * 0.92 + 0.09 * Math.sin(prog * Math.PI * 14);
        f.chargeBallGroup.scale.setScalar(ballScale);
        if (f.ballAuraMat) f.ballAuraMat.opacity = 0.45 + prog * 0.44;
        if (f.ballHalo) {
          f.ballHalo.rotation.x += dt * 11;
          f.ballHalo.rotation.y += dt * 8.5;
        }
        if (Math.random() < 0.45) {
          spawnParticles(
            new THREE.Vector3(f.ox + f.dirX * 0.28, f.oy, f.oz + f.dirZ * 0.28),
            Math.random() < 0.5 ? 0xff6b00 : 0xfde047,
            1
          );
        }
      }

      if (f.timer <= 0) {
        f.phase = 'firing';
        f.currentLen = Math.min(f.maxLen, 18.0);
        f.outerBeam.visible = true;
        f.innerBeam.visible = true;
        f.impactSphere.visible = true;
        f.warnCore.visible = false;
        if (f.chargeBallGroup) f.chargeBallGroup.visible = false;
        updateFireLaserElectricArcs(f, f.currentLen, 1.0);
        spawnParticles(new THREE.Vector3(f.ox, f.oy, f.oz), 0xffffff, 18);
        spawnParticles(new THREE.Vector3(f.ox, f.oy, f.oz), 0xff6b00, 22);
        ctx.api.playSfx?.('ult_fire_beam', { pos: { x: f.ox, y: f.oy, z: f.oz }, evolved: f.evolved, global: true });
      }
      continue;
    }

    if (f.phase === 'firing') {
      f.currentLen = Math.min(f.maxLen, f.currentLen + (f.speed || FIRE_ULT_SPEED) * dt);
      f.outerBeam.position.y = f.oy;
      f.outerBeam.scale.set(1, 1, f.currentLen);
      f.innerBeam.position.y = f.oy;
      f.innerBeam.scale.set(1, 1, f.currentLen);
      updateTerrainRibbonLocal(
        f.dangerStrip,
        f.ox,
        f.oz,
        f.dirX,
        f.dirZ,
        (f.beamRadius || FIRE_ULT_BEAM_RADIUS) * 1.05,
        f.currentLen,
        0.2,
        !!(f.caster && f.caster.onCanopy)
      );
      f.impactSphere.position.set(0, f.oy, f.currentLen);
      updateFireLaserElectricArcs(f, f.currentLen, 1.0);

      // Vérifier les joueuses touchées sur le segment [0, f.currentLen]
      if (!mp.enabled || mp.isHost) {
        for (let pIdx = 0; pIdx < players.length; pIdx++) {
          const target = players[pIdx];
          if (target.tutorialHidden || target.id === f.casterId || target.team === f.team || target.state === 'sitting') continue;
          if (f.hitPlayers.has(target.id)) continue;
          if (Math.abs((target.pos.y || 0) + 1.0 - f.oy) > 2.35) continue;

          const toX = target.pos.x - f.ox;
          const toZ = target.pos.z - f.oz;
          const proj = toX * f.dirX + toZ * f.dirZ;
          if (proj < -0.4 || proj > f.currentLen + 0.65) continue;

          const perpX = toX - f.dirX * proj;
          const perpZ = toZ - f.dirZ * proj;
          const perpDist = Math.hypot(perpX, perpZ);
          if (perpDist <= (f.beamRadius || FIRE_ULT_BEAM_RADIUS) + 0.45) {
            f.hitPlayers.add(target.id);
            // Protection contre le feu par l'Ultimate d'Eau !
            if (target.waterShieldTimer > 0 || isPointProtectedByWaterWave(target.pos.x, target.pos.z, 1.35)) {
              spawnParticles(target.pos, 0x38bdf8, 22);
              spawnParticles(target.pos, 0xffffff, 14);
              ctx.api.playSfx?.('water_shield_block', { pos: target.pos });
              ctx.api.broadcastToast(
                `🛡️💧 <strong>Protégée par l'Eau !</strong> ${target.role} résiste au Rayon Plasma de ${f.casterRole} !`,
                3000
              );
              continue;
            }

            ctx.api.sitDownPlayer(target);
            if (f.team === 'ally') {
              state.allyPE += 1;
              state.roundAllyKills += 1;
            } else {
              state.enemyPE += 1;
              state.roundEnemyKills += 1;
            }
            spawnParticles(target.pos, 0xff6b00, 26);
            spawnParticles(target.pos, 0xffffff, 18);
            ctx.api.playSfx?.('ult_fire_hit', { pos: target.pos, ally: f.team === state.myTeam, global: true });
            const teamName = f.team === 'ally' ? 'Équipe Or' : 'Équipe Violette';
            ctx.api.broadcastToast(
              `🔥🎯 <strong>SNIPE PLASMA !</strong> ${teamName} ${f.casterRole} assoit ${target.role} à distance → <strong>+1 🪙 PO !</strong>`,
              3800
            );
            ctx.api.updateTopHUD();
            ctx.api.updateRosterHUD();
          }
        }
      }

      if (f.currentLen >= f.maxLen - 0.05) {
        const hitPos = new THREE.Vector3(
          f.ox + f.dirX * f.maxLen,
          f.oy,
          f.oz + f.dirZ * f.maxLen
        );
        spawnParticles(hitPos, 0xff6b00, 18);
        spawnParticles(hitPos, 0xffffff, 12);
        f.phase = 'linger';
      }
      continue;
    }

    if (f.phase === 'linger') {
      f.lingerTimer -= dt;
      const alpha = Math.max(0, f.lingerTimer / FIRE_ULT_LINGER);
      f.outerBeam.scale.set(alpha * 1.35, alpha * 1.35, f.maxLen);
      f.outerBeam.material.opacity = alpha * 0.85;
      f.innerBeam.scale.set(alpha, alpha, f.maxLen);
      f.innerBeam.material.opacity = alpha;
      f.dangerStrip.material.opacity = alpha * 0.35;
      f.muzzleRing.material.opacity = alpha * 0.8;
      f.impactSphere.scale.setScalar(0.6 + (1 - alpha) * 1.4);
      f.impactSphere.material.opacity = alpha;
      updateFireLaserElectricArcs(f, f.maxLen, alpha);

      if (f.lingerTimer <= 0) {
        scene.remove(f.group);
        activeFireLasers.splice(i, 1);
      }
    }
  }
}

// --- 2. ULTIMATE FEUILLE : ACCÉLÉRATION 3x (2s) + GERMES -> MUR DE PLESSIS & BRANCHES ENTRELACÉES (4s) ---
function createSproutMesh() {
  const g = new THREE.Group();
  const stemMat = new THREE.MeshToonMaterial({ color: 0x4ade80 });
  const leafMat = new THREE.MeshToonMaterial({ color: 0x22c55e });

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.48, 6), stemMat);
  stem.position.y = 0.24;
  g.add(stem);

  const leafGeo = new THREE.SphereGeometry(0.18, 7, 6);
  leafGeo.scale(1.5, 0.55, 0.9);
  const leftLeaf = new THREE.Mesh(leafGeo, leafMat);
  leftLeaf.position.set(-0.16, 0.42, 0);
  leftLeaf.rotation.z = 0.45;
  g.add(leftLeaf);

  const rightLeaf = new THREE.Mesh(leafGeo, leafMat);
  rightLeaf.position.set(0.16, 0.42, 0);
  rightLeaf.rotation.z = -0.45;
  g.add(rightLeaf);

  return g;
}

function plantLeafSproutNode(wall, x, y, z) {
  const sprout = createSproutMesh();
  const groundY = getStructureSurfaceY(x, z, false).y;
  const nodeY = Math.max(groundY, y || 0);
  sprout.position.set(x, nodeY, z);
  sprout.rotation.y = Math.random() * Math.PI * 2;
  wall.sproutGroup.add(sprout);
  wall.nodes.push({ x, y: nodeY, z, sprout });
}

function createLeafWallRecord(caster, evolved) {
  const sprintDur = evolved ? 3.5 : LEAF_ULT_SPRINT_DURATION;
  const wallDur = evolved ? 8.0 : LEAF_ULT_WALL_DURATION;
  const group = new THREE.Group();
  const sproutGroup = new THREE.Group();
  const treeWallGroup = new THREE.Group();
  treeWallGroup.visible = false;
  group.add(sproutGroup);
  group.add(treeWallGroup);
  scene.add(group);

  return {
    caster,
    casterId: caster.id,
    team: caster.team,
    evolved: !!evolved,
    phase: 'sprinting',
    sprintTimer: sprintDur,
    sprintMaxDuration: sprintDur,
    growDelayTimer: LEAF_ULT_GROW_DELAY,
    wallTimer: wallDur,
    wallMaxDuration: wallDur,
    growAnim: 0,
    nodes: [],
    group,
    sproutGroup,
    treeWallGroup,
    ringGroup: null,
    ringMat: null
  };
}

function spawnLeafWallUltimate(caster, aimAngle = null) {
  const evolved = hasPlayerUltEvo(caster);
  const sprintDur = evolved ? 3.5 : LEAF_ULT_SPRINT_DURATION;
  const speedMult = evolved ? 4.2 : LEAF_ULT_SPEED_MULT;

  if (typeof aimAngle === 'number' && Number.isFinite(aimAngle)) {
    caster.facingAngle = aimAngle;
  }

  caster.leafUltTimer = sprintDur;
  caster.leafUltMaxDuration = sprintDur;
  caster.leafUltSpeedMult = speedMult;

  const wall = createLeafWallRecord(caster, evolved);
  if (typeof aimAngle === 'number' && Number.isFinite(aimAngle)) {
    wall.aimAngle = aimAngle;
  }
  plantLeafSproutNode(wall, caster.pos.x, caster.pos.y, caster.pos.z);
  spawnParticles(caster.pos, 0x22c55e, 22);
  spawnParticles(caster.pos, 0x86efac, 14);
  ctx.api.playSfx?.('ult_leaf_sprint', { pos: caster.pos, evolved, global: true });
  activeLeafWalls.push(wall);
}

function growLeafWallMesh(wall) {
  // Si la joueuse est restée sur place, générer au moins une arche organique de 3 arbres tressés
  if (wall.nodes.length < 2 && wall.caster) {
    const base = wall.nodes[0] || {
      x: wall.caster.pos.x,
      y: wall.caster.pos.y || 0,
      z: wall.caster.pos.z
    };
    const orient =
      typeof wall.aimAngle === 'number' && Number.isFinite(wall.aimAngle)
        ? wall.aimAngle
        : wall.caster.facingAngle;
    const perpX = Math.cos(orient);
    const perpZ = -Math.sin(orient);
    plantLeafSproutNode(wall, base.x - perpX * 1.65, base.y, base.z - perpZ * 1.65);
    plantLeafSproutNode(wall, base.x + perpX * 1.65, base.y, base.z + perpZ * 1.65);
  }

  wall.sproutGroup.visible = false;
  wall.treeWallGroup.visible = true;

  const ringGroup = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x4ade80,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const nodeRingGeo = new THREE.RingGeometry(
    LEAF_ULT_WALL_RADIUS - 0.14,
    LEAF_ULT_WALL_RADIUS + 0.06,
    18
  );
  nodeRingGeo.rotateX(-Math.PI / 2);
  wall.group.add(ringGroup);
  wall.ringGroup = ringGroup;
  wall.ringMat = ringMat;

  // Palette naturelle d'écorce et feuillage façon arbres noués & lianes tressées
  const barkMats = [
    new THREE.MeshToonMaterial({ color: 0x7c6855 }),
    new THREE.MeshToonMaterial({ color: 0x635141 }),
    new THREE.MeshToonMaterial({ color: 0x8c7762 }),
    new THREE.MeshToonMaterial({ color: 0x4c3b2c })
  ];
  const foliageMats = [
    new THREE.MeshToonMaterial({ color: 0x16a34a }),
    new THREE.MeshToonMaterial({ color: 0x22c55e }),
    new THREE.MeshToonMaterial({ color: 0x15803d })
  ];
  const denseHedgeMats = [
    new THREE.MeshToonMaterial({ color: 0x14532d }),
    new THREE.MeshToonMaterial({ color: 0x166534 }),
    new THREE.MeshToonMaterial({ color: 0x15803d }),
    new THREE.MeshToonMaterial({ color: 0x16a34a })
  ];
  const vineLeafGeo = new THREE.IcosahedronGeometry(0.46, 0);
  const canopyTuftGeo = new THREE.IcosahedronGeometry(0.72, 1);
  const denseHedgePuffGeo = new THREE.IcosahedronGeometry(0.72, 1);

  const detRand = (seed) => {
    const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const nodeTangents = [];
  for (let i = 0; i < wall.nodes.length; i++) {
    const nd = wall.nodes[i];
    const baseRing = new THREE.Mesh(nodeRingGeo, ringMat);
    baseRing.position.set(nd.x, nd.y + 0.04, nd.z);
    ringGroup.add(baseRing);

    const prev = wall.nodes[Math.max(0, i - 1)];
    const next = wall.nodes[Math.min(wall.nodes.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tLen = Math.hypot(tx, tz) || 1;
    tx /= tLen;
    tz /= tLen;
    nodeTangents.push({ tx, tz, nx: -tz, nz: tx });
    spawnParticles(new THREE.Vector3(nd.x, nd.y + 0.8, nd.z), 0x22c55e, 3);
  }

  const evo = !!wall.evolved;

  // 1. Troncs courbes noueux & arches entrelacées jaillissant du sol (style troncs torsadés)
  const trunkStep = evo || wall.nodes.length <= 5 ? 1 : 2;
  for (let i = 0; i < wall.nodes.length; i += trunkStep) {
    const nd = wall.nodes[i];
    const tang = nodeTangents[i];
    const nextNd = wall.nodes[Math.min(wall.nodes.length - 1, i + 1)];
    const leanDir = i % 2 === 0 ? 1 : -1;
    const archX = (nextNd.x - nd.x) * (evo ? 0.55 : 0.42);
    const archZ = (nextNd.z - nd.z) * (evo ? 0.55 : 0.42);
    const sideBow = leanDir * ((evo ? 0.58 : 0.28) + detRand(i * 17) * (evo ? 0.24 : 0.25));
    const topH = (evo ? 3.85 : 2.15) + detRand(i * 19) * (evo ? 0.78 : 0.55);
    const trunkR = (evo ? 0.28 : 0.19) + detRand(i * 5) * 0.07;

    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(nd.x - tang.nx * sideBow * 0.45, nd.y - 0.05, nd.z - tang.nz * sideBow * 0.45),
      new THREE.Vector3(nd.x + tang.nx * sideBow * 0.95 + archX * 0.22, nd.y + topH * 0.34, nd.z + tang.nz * sideBow * 0.95 + archZ * 0.22),
      new THREE.Vector3(nd.x - tang.nx * sideBow * 0.85 + archX * 0.72, nd.y + topH * 0.72, nd.z - tang.nz * sideBow * 0.85 + archZ * 0.72),
      new THREE.Vector3(nd.x + archX * 1.15 + tang.nx * sideBow * 0.52, nd.y + topH, nd.z + archZ * 1.15 + tang.nz * sideBow * 0.52)
    ]);
    const trunkGeo = new THREE.TubeGeometry(trunkCurve, evo ? 12 : 10, trunkR, 5, false);
    wall.treeWallGroup.add(new THREE.Mesh(trunkGeo, barkMats[i % barkMats.length]));

    // En version évoluée, une seconde colonne noueuse s'enroule en sens inverse à l'extérieur du feuillage
    if (evo && i < wall.nodes.length - 1) {
      const counterCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(nd.x + tang.nx * sideBow * 0.65, nd.y - 0.05, nd.z + tang.nz * sideBow * 0.65),
        new THREE.Vector3(nd.x - tang.nx * sideBow * 0.9 + archX * 0.45, nd.y + topH * 0.38, nd.z - tang.nz * sideBow * 0.9 + archZ * 0.45),
        new THREE.Vector3(nd.x + tang.nx * sideBow * 0.82 + archX * 0.85, nd.y + topH * 0.76, nd.z + tang.nz * sideBow * 0.82 + archZ * 0.85),
        new THREE.Vector3(nextNd.x - tang.nx * sideBow * 0.45, nextNd.y + topH * 0.94, nextNd.z - tang.nz * sideBow * 0.45)
      ]);
      const counterGeo = new THREE.TubeGeometry(counterCurve, 10, 0.21, 5, false);
      wall.treeWallGroup.add(new THREE.Mesh(counterGeo, barkMats[(i + 2) % barkMats.length]));
    }

    // Racines sinueuses ancrées dans le sol
    const rootCount = evo ? 3 : 2;
    for (let rIdx = 0; rIdx < rootCount; rIdx++) {
      const ang = detRand(i * 29 + rIdx * 11) * Math.PI * 2;
      const rootCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(nd.x, nd.y + (evo ? 0.78 : 0.55), nd.z),
        new THREE.Vector3(nd.x + Math.cos(ang) * 0.36, nd.y + 0.18, nd.z + Math.sin(ang) * 0.36),
        new THREE.Vector3(nd.x + Math.cos(ang) * 0.74, nd.y - 0.02, nd.z + Math.sin(ang) * 0.74)
      ]);
      const rootGeo = new THREE.TubeGeometry(rootCurve, 5, evo ? 0.115 : 0.09, 4, false);
      wall.treeWallGroup.add(new THREE.Mesh(rootGeo, barkMats[(i + rIdx + 1) % barkMats.length]));
    }

    // Touffes de canopée aérées et irrégulières au sommet des arches
    const canopy = new THREE.Mesh(canopyTuftGeo, foliageMats[i % foliageMats.length]);
    canopy.position.set(
      nd.x + archX * 0.95 + (detRand(i * 31) - 0.5) * 0.35,
      nd.y + topH + 0.14,
      nd.z + archZ * 0.95 + (detRand(i * 37) - 0.5) * 0.35
    );
    const canopyMult = evo ? 1.28 : 1.0;
    canopy.scale.set(
      (1.45 + detRand(i * 41) * 0.45) * canopyMult,
      (0.44 + detRand(i * 43) * 0.18) * canopyMult,
      (1.15 + detRand(i * 47) * 0.35) * canopyMult
    );
    canopy.rotation.y = detRand(i * 53) * Math.PI;
    wall.treeWallGroup.add(canopy);

    // En version évoluée : noyau feuillu dense au centre, laissant les troncs et grosses branches bien apparents à l'extérieur
    if (evo) {
      const nodeTiers = [0.6, 1.5, 2.4, 3.3];
      for (let tIdx = 0; tIdx < nodeTiers.length; tIdx++) {
        const puff = new THREE.Mesh(
          denseHedgePuffGeo,
          denseHedgeMats[(i + tIdx) % denseHedgeMats.length]
        );
        puff.position.set(nd.x, nd.y + nodeTiers[tIdx], nd.z);
        puff.scale.set(0.88, 0.85, 0.88);
        puff.rotation.set(detRand(i * 11 + tIdx) * 0.5, detRand(i * 23 + tIdx) * Math.PI, 0);
        wall.treeWallGroup.add(puff);
      }
      if (i < wall.nodes.length - 1) {
        const mx = (nd.x + nextNd.x) * 0.5;
        const my = (nd.y + nextNd.y) * 0.5;
        const mz = (nd.z + nextNd.z) * 0.5;
        const midTiers = [1.05, 1.95, 2.85, 3.75];
        for (let tIdx = 0; tIdx < midTiers.length; tIdx++) {
          const midPuff = new THREE.Mesh(
            denseHedgePuffGeo,
            denseHedgeMats[(i + tIdx + 2) % denseHedgeMats.length]
          );
          midPuff.position.set(mx, my + midTiers[tIdx], mz);
          midPuff.scale.set(0.88, 0.85, 0.88);
          midPuff.rotation.set(detRand(i * 19 + tIdx) * 0.5, detRand(i * 31 + tIdx) * Math.PI, 0);
          wall.treeWallGroup.add(midPuff);
        }
      }
    }
  }

  // 2. Grosses branches et lianes organiques continues qui s'entrelacent en torsades sur tout le mur
  const baseBoughSpecs = [
    { radius: 0.145, baseY: 0.72, ampY: 0.34, ampLat: 0.42, freq: 1.35, phase: 0.0, matIdx: 0 },
    { radius: 0.125, baseY: 1.28, ampY: 0.42, ampLat: 0.46, freq: 1.45, phase: Math.PI, matIdx: 1 },
    { radius: 0.09, baseY: 1.72, ampY: 0.38, ampLat: 0.38, freq: 1.85, phase: 1.1, matIdx: 2 },
    { radius: 0.072, baseY: 0.42, ampY: 0.28, ampLat: 0.5, freq: 2.15, phase: 2.7, matIdx: 3 },
    { radius: 0.06, baseY: 1.05, ampY: 0.52, ampLat: 0.44, freq: 2.6, phase: 4.1, matIdx: 1 }
  ];
  const boughSpecs = evo
    ? [
        { radius: 0.22, baseY: 0.55, ampY: 0.26, ampLat: 0.68, freq: 1.4, phase: 0.0, matIdx: 0 },
        { radius: 0.21, baseY: 1.15, ampY: 0.32, ampLat: 0.72, freq: 1.55, phase: Math.PI, matIdx: 1 },
        { radius: 0.20, baseY: 1.80, ampY: 0.36, ampLat: 0.74, freq: 1.65, phase: 1.2, matIdx: 2 },
        { radius: 0.19, baseY: 2.45, ampY: 0.38, ampLat: 0.72, freq: 1.75, phase: 3.9, matIdx: 3 },
        { radius: 0.175, baseY: 3.08, ampY: 0.42, ampLat: 0.70, freq: 1.9, phase: 2.1, matIdx: 0 },
        { radius: 0.155, baseY: 3.58, ampY: 0.35, ampLat: 0.66, freq: 2.1, phase: 5.0, matIdx: 1 },
        { radius: 0.15, baseY: 0.85, ampY: 0.46, ampLat: 0.64, freq: 2.35, phase: 0.8, matIdx: 2 },
        { radius: 0.145, baseY: 1.48, ampY: 0.52, ampLat: 0.66, freq: 2.45, phase: 3.4, matIdx: 3 },
        { radius: 0.14, baseY: 2.12, ampY: 0.54, ampLat: 0.64, freq: 2.65, phase: 1.9, matIdx: 0 },
        { radius: 0.135, baseY: 2.82, ampY: 0.48, ampLat: 0.62, freq: 2.8, phase: 4.5, matIdx: 1 }
      ]
    : baseBoughSpecs;

  const subSteps = 2;
  const totalSamples = (wall.nodes.length - 1) * subSteps + 1;
  const tubularSegs = Math.min(evo ? 64 : 72, Math.max(16, wall.nodes.length * (evo ? 3 : 4)));

  for (let bIdx = 0; bIdx < boughSpecs.length; bIdx++) {
    const spec = boughSpecs[bIdx];
    const pts = [];
    for (let s = 0; s < totalSamples; s++) {
      const uNode = s / subSteps;
      const i0 = Math.min(wall.nodes.length - 1, Math.floor(uNode));
      const i1 = Math.min(wall.nodes.length - 1, i0 + 1);
      const frac = uNode - i0;
      const n0 = wall.nodes[i0];
      const n1 = wall.nodes[i1];
      const t0 = nodeTangents[i0];
      const t1 = nodeTangents[i1];

      const bx = n0.x + (n1.x - n0.x) * frac;
      const by = n0.y + (n1.y - n0.y) * frac;
      const bz = n0.z + (n1.z - n0.z) * frac;
      const nx = t0.nx + (t1.nx - t0.nx) * frac;
      const nz = t0.nz + (t1.nz - t0.nz) * frac;

      const theta = uNode * spec.freq * Math.PI + spec.phase;
      const jitterLat = (detRand(s * 17 + bIdx * 31) - 0.5) * (evo ? 0.16 : 0.18);
      const jitterY = (detRand(s * 23 + bIdx * 41) - 0.5) * (evo ? 0.18 : 0.16);
      const lat = Math.sin(theta) * spec.ampLat + jitterLat;
      const py = by + Math.max(0.14, spec.baseY + Math.cos(theta * 0.92) * spec.ampY + jitterY);

      pts.push(new THREE.Vector3(bx + nx * lat, py, bz + nz * lat));

      // Quelques bouquets de feuilles glissés dans les boucles de lianes
      if (bIdx < (evo ? 6 : 3) && s % 3 === 1 && detRand(s * 13 + bIdx * 7) > 0.35) {
        const leafSprig = new THREE.Mesh(vineLeafGeo, foliageMats[(s + bIdx) % foliageMats.length]);
        leafSprig.position.set(bx + nx * (lat * 1.15), py + 0.14, bz + nz * (lat * 1.15));
        leafSprig.scale.set(1.05, 0.52, 0.88);
        leafSprig.rotation.set(detRand(s * 3) * 0.7, detRand(s * 5) * 3.1, detRand(s * 7) * 0.7);
        wall.treeWallGroup.add(leafSprig);
      }
    }

    if (pts.length >= 2) {
      const boughCurve = new THREE.CatmullRomCurve3(pts);
      const radialSegs = evo && bIdx >= 6 ? 4 : 5;
      const boughGeo = new THREE.TubeGeometry(boughCurve, tubularSegs, spec.radius, radialSegs, false);
      wall.treeWallGroup.add(new THREE.Mesh(boughGeo, barkMats[spec.matIdx % barkMats.length]));
    }
  }
}

function updateLeafWalls(dt) {
  for (let i = activeLeafWalls.length - 1; i >= 0; i--) {
    const wall = activeLeafWalls[i];

    if (wall.phase === 'sprinting') {
      wall.sprintTimer -= dt;
      const c = wall.caster;
      if (!c || c.state !== 'standing' || c.carryingBall || c.leafUltTimer <= 0 || wall.sprintTimer <= 0) {
        if (c) c.leafUltTimer = 0;
        wall.phase = 'germinating';
        wall.growDelayTimer = LEAF_ULT_GROW_DELAY;
        continue;
      }

      // Semer une petite plante régulièrement le long de la trajectoire
      const last = wall.nodes[wall.nodes.length - 1];
      const dist = last ? Math.hypot(c.pos.x - last.x, c.pos.z - last.z) : 999;
      if (dist >= LEAF_ULT_NODE_SPACING) {
        plantLeafSproutNode(wall, c.pos.x, c.pos.y, c.pos.z);
        if (Math.random() < 0.7) {
          spawnParticles(c.pos, 0x4ade80, 3);
        }
      }
      continue;
    }

    if (wall.phase === 'germinating') {
      wall.growDelayTimer -= dt;
      const pulse = 1 + 0.35 * Math.sin((1 - wall.growDelayTimer / LEAF_ULT_GROW_DELAY) * Math.PI * 6);
      for (let n = 0; n < wall.nodes.length; n++) {
        const sp = wall.nodes[n].sprout;
        if (sp) sp.scale.set(pulse, 1 + (1 - wall.growDelayTimer) * 0.85, pulse);
      }

      if (wall.growDelayTimer <= 0) {
        wall.phase = 'grown';
        wall.growAnim = 0.01;
        growLeafWallMesh(wall);
        wall.treeWallGroup.scale.set(1, 0.05, 1);
        ctx.api.playSfx?.('ult_leaf_grow', { pos: wall.nodes[0], evolved: wall.evolved, global: true });
        ctx.api.markNavDynamicDirty?.();

        // Repousser immédiatement les joueuses qui se trouveraient dans le mur au moment où il pousse
        players.forEach((p) => {
          if (p.tutorialHidden) return;
          pushOutFromLeafWalls(p.pos, 0.75, p.vel);
        });
      }
      continue;
    }

    if (wall.phase === 'grown') {
      if (wall.growAnim < 1) {
        wall.growAnim = Math.min(1, wall.growAnim + dt * 6.5);
        wall.treeWallGroup.scale.set(1, wall.growAnim, 1);
      }
      wall.wallTimer -= dt;
      if (wall.ringMat) {
        if (wall.wallTimer <= 1.4) {
          wall.ringMat.color.setHex(0xf97316);
          const pulse = 0.45 + 0.4 * Math.abs(Math.sin(wall.wallTimer * Math.PI * 3.5));
          wall.ringMat.opacity = Math.min(0.85, pulse) * Math.min(1, wall.wallTimer / 0.6);
        } else {
          wall.ringMat.color.setHex(0x4ade80);
          wall.ringMat.opacity = 0.65;
        }
      }
      if (wall.wallTimer < 1.2) {
        const shrink = Math.max(0.05, wall.wallTimer / 1.2);
        wall.treeWallGroup.scale.set(1, shrink, 1);
      }
      if (wall.wallTimer <= 0) {
        scene.remove(wall.group);
        activeLeafWalls.splice(i, 1);
        ctx.api.markNavDynamicDirty?.();
      }
    }
  }
}

function hitsGrownLeafWall(x, z, extraRadius = 0.5) {
  const r = LEAF_ULT_WALL_RADIUS + extraRadius;
  const rSq = r * r;
  for (let w = 0; w < activeLeafWalls.length; w++) {
    const wall = activeLeafWalls[w];
    if (wall.phase !== 'grown') continue;
    for (let i = 0; i < wall.nodes.length; i++) {
      const nd = wall.nodes[i];
      const dx = x - nd.x;
      const dz = z - nd.z;
      if (dx * dx + dz * dz <= rSq) return true;
    }
    for (let i = 0; i < wall.nodes.length - 1; i++) {
      const a = wall.nodes[i];
      const b = wall.nodes[i + 1];
      if (distSqPointToSegment2D(x, z, a.x, a.z, b.x, b.z) <= rSq) return true;
    }
  }
  return false;
}

export function pushOutFromLeafWalls(pos, entityRadius = 0.72, bounceVel = null) {
  const minDist = LEAF_ULT_WALL_RADIUS + entityRadius;
  const minDistSq = minDist * minDist;

  for (let w = 0; w < activeLeafWalls.length; w++) {
    const wall = activeLeafWalls[w];
    if (wall.phase !== 'grown') continue;

    for (let i = 0; i < wall.nodes.length; i++) {
      const a = wall.nodes[i];
      const b = i < wall.nodes.length - 1 ? wall.nodes[i + 1] : a;
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const lenSq = vx * vx + vz * vz;
      let t = 0;
      if (lenSq > 0.0001) {
        t = Math.max(0, Math.min(1, ((pos.x - a.x) * vx + (pos.z - a.z) * vz) / lenSq));
      }
      const cx = a.x + t * vx;
      const cz = a.z + t * vz;
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        const d = Math.sqrt(dSq);
        const nx = d > 0.0001 ? dx / d : 1;
        const nz = d > 0.0001 ? dz / d : 0;
        pos.x = cx + nx * minDist;
        pos.z = cz + nz * minDist;
        if (bounceVel) {
          const vn = bounceVel.x * nx + bounceVel.z * nz;
          if (vn < 0) {
            bounceVel.x -= 1.5 * vn * nx;
            bounceVel.z -= 1.5 * vn * nz;
          }
        }
      }
    }
  }
}

const activeWaterPulls = [];

// --- 3. ULTIMATE EAU : LARGE VAGUE (OU ONDE 360° ÉVOLUÉE + RAPPEL [R]) ---
function spawnWaterWaveUltimate(caster, aimAngle, evolvedOverride = null, preserveShield = false) {
  const evolved = typeof evolvedOverride === 'boolean' ? evolvedOverride : hasPlayerUltEvo(caster);
  const is360 = evolved;
  const segCount = is360 ? 140 : WATER_ULT_SEGMENTS;
  const maxRange = evolved ? WATER_ULT_RANGE * 1.45 : WATER_ULT_RANGE;
  const dirX = Math.sin(aimAngle);
  const dirZ = Math.cos(aimAngle);
  const rightX = Math.cos(aimAngle);
  const rightZ = -Math.sin(aimAngle);

  if (!preserveShield) {
    caster.waterShieldTimer = evolved ? 5.2 : 4.2;
  }

  const group = new THREE.Group();
  scene.add(group);

  const segments = [];
  const segStep = is360 ? 2.65 : WATER_ULT_WIDTH / (WATER_ULT_SEGMENTS - 1);
  const segRadius = segStep * 0.72;

  const waveBodyMat = new THREE.MeshToonMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.80,
    depthWrite: false
  });
  const waveCrestMat = new THREE.MeshToonMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.76,
    depthWrite: false
  });
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xf0f9ff,
    transparent: true,
    opacity: 0.96
  });
  const foamLightMat = new THREE.MeshBasicMaterial({
    color: 0xdbeafe,
    transparent: true,
    opacity: 0.84
  });

  const sharedBodyGeo = new THREE.CylinderGeometry(segStep * 0.5, segStep * 0.76, 1.0, 9);
  const sharedLipGeo = new THREE.CylinderGeometry(0.28, 0.36, segStep * 1.18, 8);
  sharedLipGeo.rotateZ(Math.PI / 2);
  const foamSphereGeo = new THREE.SphereGeometry(0.26, 7, 6);

  for (let i = 0; i < segCount; i++) {
    let sx, sz, sDirX, sDirZ, sYaw, centerPeak, leftPeak, rightPeak, pillarH, fwdBow;
    if (is360) {
      const theta = (i / segCount) * Math.PI * 2;
      sDirX = Math.sin(theta);
      sDirZ = Math.cos(theta);
      sYaw = theta;
      sx = caster.pos.x + sDirX * 1.85;
      sz = caster.pos.z + sDirZ * 1.85;
      centerPeak = i % 3 === 0 ? 0.82 : 0.36;
      leftPeak = 0.25;
      rightPeak = 0.25;
      pillarH = 1.35 + 1.35 * centerPeak;
      fwdBow = 0.25;
    } else {
      const latOffset = (i - (WATER_ULT_SEGMENTS - 1) * 0.5) * segStep;
      const normLat = latOffset / (WATER_ULT_WIDTH * 0.5);
      centerPeak = Math.exp(-Math.pow(normLat / 0.25, 2));
      leftPeak = Math.exp(-Math.pow((normLat + 0.58) / 0.17, 2));
      rightPeak = Math.exp(-Math.pow((normLat - 0.58) / 0.17, 2));
      pillarH = 1.15 + 2.30 * centerPeak + 1.00 * (leftPeak + rightPeak);
      fwdBow = centerPeak * 0.36;
      sDirX = dirX;
      sDirZ = dirZ;
      sYaw = aimAngle;
      sx = caster.pos.x + dirX * 1.55 + rightX * latOffset;
      sz = caster.pos.z + dirZ * 1.55 + rightZ * latOffset;
    }
    const sy = getStructureSurfaceY(sx, sz, !!caster.onCanopy).y;

    const segGroup = new THREE.Group();
    segGroup.position.set(sx, sy, sz);
    segGroup.rotation.y = sYaw;

    const bodyMesh = new THREE.Mesh(sharedBodyGeo, waveBodyMat);
    bodyMesh.scale.set(1.12, pillarH * 0.92, 1.55);
    bodyMesh.position.set(0, pillarH * 0.44, fwdBow);
    bodyMesh.rotation.x = 0.24;
    segGroup.add(bodyMesh);

    const lipMesh = new THREE.Mesh(sharedLipGeo, waveCrestMat);
    lipMesh.position.set(0, pillarH * 0.87, fwdBow + 0.42);
    lipMesh.scale.set(1.0, 0.85 + centerPeak * 0.45, 0.95);
    segGroup.add(lipMesh);

    if (centerPeak > 0.45) {
      const mainFoam = new THREE.Mesh(sharedLipGeo, foamMat);
      mainFoam.position.set(0, pillarH * 0.95, fwdBow + 0.48);
      mainFoam.scale.set(1.02, 0.72 + centerPeak * 0.48, 0.95);
      segGroup.add(mainFoam);

      for (let fIdx = 0; fIdx < 3; fIdx++) {
        const tuff = new THREE.Mesh(foamSphereGeo, foamMat);
        const oxFoam = (fIdx - 1) * segStep * 0.36;
        tuff.position.set(oxFoam, pillarH * (0.94 + (fIdx === 1 ? 0.09 : 0.02)), fwdBow + 0.56);
        tuff.scale.set(1.15, 0.82, 1.05);
        segGroup.add(tuff);
      }
    } else if (leftPeak > 0.45 || rightPeak > 0.45) {
      const sideFoam = new THREE.Mesh(sharedLipGeo, foamLightMat);
      sideFoam.position.set(0, pillarH * 0.92, fwdBow + 0.44);
      sideFoam.scale.set(0.95, 0.48, 0.65);
      segGroup.add(sideFoam);
    }

    group.add(segGroup);
    segments.push({
      index: i,
      x: sx,
      y: sy,
      z: sz,
      dirX: sDirX,
      dirZ: sDirZ,
      radius: segRadius,
      active: true,
      mesh: segGroup
    });
  }

  spawnParticles(caster.pos, 0x38bdf8, 26);
  spawnParticles(caster.pos, 0xe0f2fe, 16);
  ctx.api.playSfx?.('ult_water_wave', { pos: caster.pos, evolved, global: true });

  const waveObj = {
    caster,
    casterId: caster.id,
    casterRole: caster.role,
    team: caster.team,
    evolved,
    is360,
    dirX,
    dirZ,
    rightX,
    rightZ,
    aimAngle,
    traveled: 0,
    maxRange,
    hitPlayerIds: new Set(),
    pullWindowTimer: evolved ? 4.5 : 0,
    pullTriggered: false,
    segments,
    group
  };
  activeWaterWaves.push(waveObj);
  if (evolved) {
    caster.activeReactivableWave = waveObj;
  }
}

function triggerWaterWavePull(caster) {
  if (!caster || !caster.activeReactivableWave) return false;
  const wave = caster.activeReactivableWave;
  if (wave.pullTriggered || wave.pullWindowTimer <= 0) return false;

  wave.pullTriggered = true;
  caster.activeReactivableWave = null;

  let pulledCount = 0;
  wave.hitPlayerIds.forEach((pid) => {
    const target = players.find((pl) => pl.id === pid);
    if (!target || target.tutorialHidden || target.id === caster.id || target.state === 'sitting') return;
    if (target.state === 'rule1') ctx.api.freeFromRule1(target);

    const dx = target.pos.x - caster.pos.x;
    const dz = target.pos.z - caster.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const stopDist = target.team === caster.team ? 1.85 : 2.35;
    const destPos = new THREE.Vector3(
      caster.pos.x + (dx / d) * Math.min(d, stopDist),
      target.pos.y || 0,
      caster.pos.z + (dz / d) * Math.min(d, stopDist)
    );
    ctx.api.clampToField(destPos, 0.72, null, { onCanopy: !!caster.onCanopy });
    activeWaterPulls.push({
      target,
      startX: target.pos.x,
      startZ: target.pos.z,
      destX: destPos.x,
      destZ: destPos.z,
      timer: 0.28,
      duration: 0.28
    });
    spawnParticles(target.pos, 0x38bdf8, 18);
    pulledCount++;
  });

  spawnParticles(caster.pos, 0x0ea5e9, 24);
  ctx.api.playSfx?.('ult_water_pull', { pos: caster.pos, global: true });
  ctx.api.broadcastToast(
    pulledCount > 0
      ? `💧🔄 <strong>REFLUX MARIN !</strong> ${caster.role} ramène <strong>${pulledCount}</strong> joueuse(s) touchée(s) !`
      : `💧🔄 <strong>Reflux activé</strong> par ${caster.role} (aucune cible à ramener).`,
    2400
  );
  updateUltHudWidget();
  return true;
}

function updateWaterPulls(dt) {
  for (let i = activeWaterPulls.length - 1; i >= 0; i--) {
    const pull = activeWaterPulls[i];
    pull.timer -= dt;
    const prog = 1 - Math.max(0, pull.timer / pull.duration);
    const t = 1 - Math.pow(1 - prog, 2);
    const pl = pull.target;
    if (!pl || pl.state === 'sitting') {
      activeWaterPulls.splice(i, 1);
      continue;
    }
    pl.pos.x = pull.startX + (pull.destX - pull.startX) * t;
    pl.pos.z = pull.startZ + (pull.destZ - pull.startZ) * t;
    ctx.api.clampToField(pl.pos, 0.72, null, { onCanopy: !!pl.onCanopy });
    pl.pos.y = getStructureSurfaceY(pl.pos.x, pl.pos.z, !!pl.onCanopy).y;
    pl.targetPos.copy(pl.pos);
    if (mp.enabled && mp.isHost) pl.netForceSeq = ((pl.netForceSeq || 0) + 1) & 0xffff;
    if (Math.random() < 0.5) spawnParticles(pl.pos, 0x38bdf8, 2);
    if (pull.timer <= 0) {
      activeWaterPulls.splice(i, 1);
    }
  }
}

function deflectWaveSegmentAroundMapObstacles(seg, dirX, dirZ) {
  // La vague contourne tous les obstacles normaux de la carte (rochers, arbres, fontaines, chalet...)
  const pad = 0.65;
  for (let i = 0; i < JUNGLE_OBSTACLES.length; i++) {
    const obs = JUNGLE_OBSTACLES[i];
    const minR = obs.radius + pad;
    const dx = seg.x - obs.x;
    const dz = seg.z - obs.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < minR * minR) {
      const d = Math.sqrt(dSq) || 0.001;
      const nx = dx / d;
      const nz = dz / d;
      // Glissement tangentiel autour de l'obstacle pour le contourner sans annuler la vague
      const t1x = -nz;
      const t1z = nx;
      const t2x = nz;
      const t2z = -nx;
      const useT1 = t1x * dirX + t1z * dirZ >= t2x * dirX + t2z * dirZ;
      const tx = useT1 ? t1x : t2x;
      const tz = useT1 ? t1z : t2z;
      seg.x = obs.x + nx * minR + tx * 0.45;
      seg.z = obs.z + nz * minR + tz * 0.45;
    }
  }

  for (let i = 0; i < JUNGLE_WALLS.length; i++) {
    const w = JUNGLE_WALLS[i];
    const vx = w.bx - w.ax;
    const vz = w.bz - w.az;
    const lenSq = vx * vx + vz * vz;
    const t = lenSq > 0.0001
      ? Math.max(0, Math.min(1, ((seg.x - w.ax) * vx + (seg.z - w.az) * vz) / lenSq))
      : 0;
    const cx = w.ax + t * vx;
    const cz = w.az + t * vz;
    const minR = w.radius + pad;
    const dx = seg.x - cx;
    const dz = seg.z - cz;
    const dSq = dx * dx + dz * dz;
    if (dSq < minR * minR) {
      const d = Math.sqrt(dSq) || 0.001;
      const nx = dx / d;
      const nz = dz / d;
      const tx = -nz;
      const tz = nx;
      seg.x = cx + nx * minR + tx * 0.35;
      seg.z = cz + nz * minR + tz * 0.35;
    }
  }

  if (CANOPY_SPEC.hasCanopy) {
    for (let i = 0; i < CANOPY_SPEC.trunks.length; i++) {
      const tr = CANOPY_SPEC.trunks[i];
      const minR = tr.radius + pad;
      const dx = seg.x - tr.x;
      const dz = seg.z - tr.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minR * minR) {
        const d = Math.sqrt(dSq) || 0.001;
        seg.x = tr.x + (dx / d) * minR;
        seg.z = tr.z + (dz / d) * minR;
      }
    }
  } else if (state.mapId === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    const tmpPos = { x: seg.x, z: seg.z };
    pushOutAABB(tmpPos, sv.chaletMinX, sv.chaletMaxX, sv.chaletMinZ, sv.chaletMaxZ, pad, null);
    seg.x = tmpPos.x;
    seg.z = tmpPos.z;
  } else if (state.mapId === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    [-lf.fountainX, lf.fountainX].forEach((fx) => {
      const minR = lf.fountainR + pad;
      const dx = seg.x - fx;
      const dz = seg.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minR * minR) {
        const d = Math.sqrt(dSq) || 0.001;
        seg.x = fx + (dx / d) * minR;
        seg.z = (dz / d) * minR;
      }
    });
  } else if (state.mapId === 'mont-royal') {
    const mr = PARK_LANDMARKS.montRoyal;
    const minR = mr.crossRadius + pad;
    const dx = seg.x - mr.crossX;
    const dz = seg.z - mr.crossZ;
    const dSq = dx * dx + dz * dz;
    if (dSq < minR * minR) {
      const d = Math.sqrt(dSq) || 0.001;
      seg.x = mr.crossX + (dx / d) * minR;
      seg.z = mr.crossZ + (dz / d) * minR;
    }
  }

  // Murs déployables 3 m : la vague les contourne aussi
  for (let w = 0; w < (ctx.entities.activeToolWalls || []).length; w++) {
    const tw = (ctx.entities.activeToolWalls || [])[w];
    for (let s = 0; s < 5; s++) {
      const u = 0.1 + s * 0.2;
      const cx = tw.ax + (tw.bx - tw.ax) * u;
      const cz = tw.az + (tw.bz - tw.az) * u;
      const minR = 0.45 + pad;
      const dx = seg.x - cx;
      const dz = seg.z - cz;
      const dSq = dx * dx + dz * dz;
      if (dSq < minR * minR) {
        const d = Math.sqrt(dSq) || 0.001;
        seg.x = cx + (dx / d) * minR;
        seg.z = cz + (dz / d) * minR;
      }
    }
  }
}

function updateWaterWaves(dt) {
  for (let w = activeWaterWaves.length - 1; w >= 0; w--) {
    const wave = activeWaterWaves[w];
    if (wave.pullWindowTimer > 0) {
      wave.pullWindowTimer = Math.max(0, wave.pullWindowTimer - dt);
      if (wave.pullWindowTimer <= 0 && wave.caster && wave.caster.activeReactivableWave === wave) {
        wave.caster.activeReactivableWave = null;
        updateUltHudWidget();
      }
    }

    const stepDist = WATER_ULT_SPEED * dt;
    const stillTraveling = !wave.finishedWave && wave.traveled < wave.maxRange;
    if (stillTraveling) {
      wave.traveled += stepDist;
    }

    let activeCount = 0;
    const pushedInStep = new Set();
    const maxX = FIELD.width * 0.5 - 0.8;
    const maxZ = FIELD.depth * 0.5 - 0.8;

    if (stillTraveling) {
      for (let i = 0; i < wave.segments.length; i++) {
        const seg = wave.segments[i];
        if (!seg.active) continue;

        const sdx = typeof seg.dirX === 'number' ? seg.dirX : wave.dirX;
        const sdz = typeof seg.dirZ === 'number' ? seg.dirZ : wave.dirZ;
        seg.x += sdx * stepDist;
        seg.z += sdz * stepDist;

        // 1. Le mur de bois (Ultimate Feuille) ANNULE la partie de la vague touchée !
        if (hitsGrownLeafWall(seg.x, seg.z, 0.72)) {
          seg.active = false;
          seg.mesh.visible = false;
          spawnParticles(new THREE.Vector3(seg.x, seg.y + 0.9, seg.z), 0x38bdf8, 10);
          spawnParticles(new THREE.Vector3(seg.x, seg.y + 0.9, seg.z), 0x22c55e, 6);
          continue;
        }

        // 2. Hors limites de l'arène -> ce segment s'éteint contre la paroi
        if (Math.abs(seg.x) > maxX || Math.abs(seg.z) > maxZ) {
          seg.active = false;
          seg.mesh.visible = false;
          continue;
        }

        // 3. Contournement fluide des obstacles normaux de la carte
        deflectWaveSegmentAroundMapObstacles(seg, sdx, sdz);

        seg.y = getTerrainY(seg.x, seg.z);
        const swellBob = Math.sin(wave.traveled * 0.55 + seg.index * 0.45) * 0.07;
        seg.mesh.position.set(seg.x, seg.y + swellBob, seg.z);
        seg.mesh.rotation.x = 0.05 * Math.sin(wave.traveled * 0.6 + seg.index * 0.4);
        if (wave.is360) {
          seg.mesh.scale.x = Math.min(1.0, 0.45 + (wave.traveled / 15.0) * 0.55);
        }
        activeCount++;

        // 4. Repousse tout le monde devant soi (ou tout autour si 360°) + mémorise cibles pour rappel [R]
        for (let pIdx = 0; pIdx < players.length; pIdx++) {
          const other = players[pIdx];
          if (other.tutorialHidden || other.id === wave.casterId || other.state === 'sitting') continue;
          if (pushedInStep.has(other.id)) continue;
          if (Math.abs((other.pos.y || 0) - seg.y) > 2.4) continue;

          const dx = other.pos.x - seg.x;
          const dz = other.pos.z - seg.z;
          const dist = Math.hypot(dx, dz);
          if (dist < seg.radius + 1.15) {
            pushedInStep.add(other.id);
            if (wave.hitPlayerIds) wave.hitPlayerIds.add(other.id);
            if (other.team === wave.team) {
              other.waterShieldTimer = Math.max(other.waterShieldTimer || 0, 3.2);
            }
            if (other.state === 'rule1') {
              ctx.api.freeFromRule1(other);
            }
            const pushMult = other.team === wave.team ? 0.72 : 1.0;
            other.pos.x += sdx * WATER_ULT_PUSH_SPEED * pushMult * dt;
            other.pos.z += sdz * WATER_ULT_PUSH_SPEED * pushMult * dt;
            ctx.api.clampToField(other.pos, 0.72, other.vel, {
              onCanopy: !!other.onCanopy,
              isAirborne: !!other.isAirborne
            });
            other.targetPos.copy(other.pos);
            if (mp.enabled && mp.isHost) other.netForceSeq = ((other.netForceSeq || 0) + 1) & 0xffff;
            if (Math.random() < 0.35) {
              spawnParticles(other.pos, 0x38bdf8, 2);
            }
          }
        }
      }

      if (wave.traveled > wave.maxRange - 5.0) {
        const fade = Math.max(0.1, (wave.maxRange - wave.traveled) / 5.0);
        for (let i = 0; i < wave.segments.length; i++) {
          wave.segments[i].mesh.scale.y = fade;
        }
      }

      if (activeCount === 0 || wave.traveled >= wave.maxRange) {
        wave.finishedWave = true;
        wave.group.visible = false;
        wave.segments.forEach((s) => { s.active = false; });
      }
    }

    const keepForPull = wave.evolved && !wave.pullTriggered && wave.pullWindowTimer > 0;
    if (wave.finishedWave && !keepForPull) {
      scene.remove(wave.group);
      activeWaterWaves.splice(w, 1);
    }
  }
}

export function isPointProtectedByWaterWave(x, z, extraR = 1.2) {
  for (let w = 0; w < activeWaterWaves.length; w++) {
    const wave = activeWaterWaves[w];
    for (let i = 0; i < wave.segments.length; i++) {
      const seg = wave.segments[i];
      if (!seg.active) continue;
      const r = seg.radius + extraR;
      const dx = x - seg.x;
      const dz = z - seg.z;
      if (dx * dx + dz * dz <= r * r) return true;
    }
  }
  return false;
}

export function createTerrainRingMesh(angSegs, material, renderOrder = 14) {
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

export function updateTerrainRingWorld(mesh, cx, cz, rInner, rOuter, yOffset, terrainOnly = false, onCanopy = false) {
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
    const iy = (terrainOnly ? getTerrainY(ix, iz) : getUltPreviewSurfaceY(ix, iz, onCanopy)) + yOffset;
    const oy = (terrainOnly ? getTerrainY(ox, oz) : getUltPreviewSurfaceY(ox, oz, onCanopy)) + yOffset;
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

function createTerrainGridMesh(cols, rows, material, renderOrder = 12) {
  const vertCount = (cols + 1) * (rows + 1);
  const positions = new Float32Array(vertCount * 3);
  const indices = [];
  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * stride + c;
      const b = a + 1;
      const d = (r + 1) * stride + c;
      const e = d + 1;
      indices.push(a, b, e, a, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.userData.cols = cols;
  mesh.userData.rows = rows;
  mesh.userData.positions = positions;
  return mesh;
}

function updateTerrainGridOriented(mesh, ox, oz, dirX, dirZ, rightX, rightZ, halfW, zStart, zEnd, yOffset) {
  const cols = mesh.userData.cols;
  const rows = mesh.userData.rows;
  const pos = mesh.userData.positions;
  let ptr = 0;
  for (let r = 0; r <= rows; r++) {
    const lz = zStart + (zEnd - zStart) * (r / rows);
    const cx = ox + dirX * lz;
    const cz = oz + dirZ * lz;
    for (let c = 0; c <= cols; c++) {
      const lx = -halfW + halfW * 2 * (c / cols);
      const wx = cx + rightX * lx;
      const wz = cz + rightZ * lx;
      pos[ptr] = wx;
      pos[ptr + 1] = getTerrainY(wx, wz) + yOffset;
      pos[ptr + 2] = wz;
      ptr += 3;
    }
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}

function createHoloTreeUnit(fillMat, wireMat, ringMat) {
  const g = new THREE.Group();

  const baseRingGeo = new THREE.RingGeometry(0.42, 0.72, 16);
  baseRingGeo.rotateX(-Math.PI / 2);
  const baseRing = new THREE.Mesh(baseRingGeo, ringMat);
  baseRing.position.y = 0.04;
  baseRing.renderOrder = 16;
  g.add(baseRing);

  const addHoloMesh = (geo, pos = null, scale = null) => {
    const fill = new THREE.Mesh(geo, fillMat);
    const wire = new THREE.Mesh(geo, wireMat);
    fill.renderOrder = 17;
    wire.renderOrder = 18;
    if (pos) {
      fill.position.copy(pos);
      wire.position.copy(pos);
    }
    if (scale) {
      fill.scale.copy(scale);
      wire.scale.copy(scale);
    }
    g.add(fill);
    g.add(wire);
  };

  // Deux troncs torsadés façon arches nouées du mur de bois
  const trunkCurveA = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.28, 0, -0.14),
    new THREE.Vector3(0.24, 0.75, 0.16),
    new THREE.Vector3(-0.18, 1.48, -0.08),
    new THREE.Vector3(0.08, 2.05, 0.05)
  ]);
  const trunkCurveB = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.28, 0, 0.14),
    new THREE.Vector3(-0.22, 0.82, -0.14),
    new THREE.Vector3(0.18, 1.52, 0.12),
    new THREE.Vector3(-0.08, 2.0, -0.04)
  ]);
  addHoloMesh(new THREE.TubeGeometry(trunkCurveA, 8, 0.13, 5, false));
  addHoloMesh(new THREE.TubeGeometry(trunkCurveB, 8, 0.11, 5, false));

  // Couronnes de feuillage en hologramme
  const crownGeo = new THREE.IcosahedronGeometry(0.66, 1);
  addHoloMesh(crownGeo, new THREE.Vector3(0, 2.18, 0), new THREE.Vector3(1.22, 0.68, 1.08));
  addHoloMesh(crownGeo, new THREE.Vector3(-0.34, 1.72, 0.14), new THREE.Vector3(0.84, 0.62, 0.84));
  addHoloMesh(crownGeo, new THREE.Vector3(0.36, 1.65, -0.14), new THREE.Vector3(0.82, 0.62, 0.82));

  return g;
}

// --- PREVIEW 3D DE L'AIRE VISÉE ([R] PUIS CLIC GAUCHE) ---
function ensureUltPreviewGroup() {
  if (ultPreviewGroup) return ultPreviewGroup;
  ultPreviewGroup = new THREE.Group();
  ultPreviewGroup.visible = false;

  // 1. Preview Feu : longue ligne de tir conforme au relief + réticule d'impact
  const fireGroup = new THREE.Group();
  const firePlaneMat = new THREE.MeshBasicMaterial({
    color: 0xff6b00,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const firePlane = createTerrainRibbonMesh(44, firePlaneMat, 14);
  fireGroup.add(firePlane);

  const fireCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5
  });
  const fireCore = createTerrainRibbonMesh(44, fireCoreMat, 15);
  fireGroup.add(fireCore);

  const fireEndRingMat = new THREE.MeshBasicMaterial({
    color: 0xffedd5,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5
  });
  const fireEndRing = createTerrainRingMesh(28, fireEndRingMat, 16);
  fireGroup.add(fireEndRing);
  ultPreviewGroup.add(fireGroup);

  // 2. Preview Eau : zone de vague conforme au relief + filigrane 360° pour l'Eau Évoluée
  const waterGroup = new THREE.Group();
  const waterAreaMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const waterArea = createTerrainGridMesh(10, 20, waterAreaMat, 12);
  waterGroup.add(waterArea);

  const waterOutlineVertCount = (10 + 20) * 2;
  const waterOutlinePos = new Float32Array(waterOutlineVertCount * 3);
  const waterOutlineGeo = new THREE.BufferGeometry();
  waterOutlineGeo.setAttribute('position', new THREE.BufferAttribute(waterOutlinePos, 3));
  const waterOutlineMat = new THREE.LineBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5
  });
  const waterOutline = new THREE.LineLoop(waterOutlineGeo, waterOutlineMat);
  waterOutline.frustumCulled = false;
  waterOutline.renderOrder = 14;
  waterGroup.add(waterOutline);

  const waterFrontMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5
  });
  const waterSweep = createTerrainGridMesh(12, 2, waterFrontMat, 15);
  waterGroup.add(waterSweep);

  // Aperçu Eau Évoluée (360°) : couverture en filigrane sur toute la portée + bordure extérieure nette
  const WATER_360_ANG = 56;
  const WATER_360_RAD = 22;
  const water360Pos = new Float32Array((WATER_360_RAD + 1) * WATER_360_ANG * 3);
  const water360Idx = [];
  for (let r = 0; r < WATER_360_RAD; r++) {
    for (let a = 0; a < WATER_360_ANG; a++) {
      const an = (a + 1) % WATER_360_ANG;
      const v00 = r * WATER_360_ANG + a;
      const v01 = r * WATER_360_ANG + an;
      const v10 = (r + 1) * WATER_360_ANG + a;
      const v11 = (r + 1) * WATER_360_ANG + an;
      water360Idx.push(v00, v10, v11, v00, v11, v01);
    }
  }
  const water360Geo = new THREE.BufferGeometry();
  water360Geo.setAttribute('position', new THREE.BufferAttribute(water360Pos, 3));
  water360Geo.setIndex(water360Idx);
  const water360AreaMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const water360Area = new THREE.Mesh(water360Geo, water360AreaMat);
  water360Area.frustumCulled = false;
  water360Area.renderOrder = 12;
  water360Area.visible = false;
  waterGroup.add(water360Area);

  const WATER_FILIGREE_SPOKES = 24;
  const WATER_FILIGREE_SPOKE_SEGS = 20;
  const WATER_FILIGREE_RING_FRACS = [0.03, 0.22, 0.44, 0.66, 0.84];
  const WATER_FILIGREE_RING_SEGS = 56;
  const waterFiligreeSegCount =
    WATER_FILIGREE_SPOKES * WATER_FILIGREE_SPOKE_SEGS +
    WATER_FILIGREE_RING_FRACS.length * WATER_FILIGREE_RING_SEGS;
  const water360FiligreePos = new Float32Array(waterFiligreeSegCount * 2 * 3);
  const water360FiligreeGeo = new THREE.BufferGeometry();
  water360FiligreeGeo.setAttribute('position', new THREE.BufferAttribute(water360FiligreePos, 3));
  const water360FiligreeMat = new THREE.LineBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5
  });
  const water360Filigree = new THREE.LineSegments(water360FiligreeGeo, water360FiligreeMat);
  water360Filigree.frustumCulled = false;
  water360Filigree.renderOrder = 14;
  water360Filigree.visible = false;
  waterGroup.add(water360Filigree);

  const water360OuterBandMat = new THREE.MeshBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const water360OuterBand = createTerrainRingMesh(56, water360OuterBandMat, 13);
  water360OuterBand.visible = false;
  waterGroup.add(water360OuterBand);

  const WATER_OUTER_LINE_SEGS = 96;
  const water360OuterLinePos = new Float32Array(WATER_OUTER_LINE_SEGS * 3);
  const water360OuterLineGeo = new THREE.BufferGeometry();
  water360OuterLineGeo.setAttribute('position', new THREE.BufferAttribute(water360OuterLinePos, 3));
  const water360OuterLineMat = new THREE.LineBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5
  });
  const water360OuterLine = new THREE.LineLoop(water360OuterLineGeo, water360OuterLineMat);
  water360OuterLine.frustumCulled = false;
  water360OuterLine.renderOrder = 15;
  water360OuterLine.visible = false;
  waterGroup.add(water360OuterLine);

  ultPreviewGroup.add(waterGroup);

  // 3. Preview Feuille : halo + flèche directionnelle conforme au relief + hologramme de mur d'arbres
  const leafGroup = new THREE.Group();
  const leafRingMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const leafRing = createTerrainRingMesh(32, leafRingMat, 13);
  leafGroup.add(leafRing);

  const LEAF_SHAFT_ROWS = 14;
  const LEAF_HEAD_ROWS = 6;
  const leafArrowVertCount = (LEAF_SHAFT_ROWS + 1 + LEAF_HEAD_ROWS + 1) * 2;
  const leafArrowPos = new Float32Array(leafArrowVertCount * 3);
  const leafArrowIdx = [];
  for (let r = 0; r < LEAF_SHAFT_ROWS; r++) {
    const a = r * 2;
    const b = a + 1;
    const c = (r + 1) * 2 + 1;
    const d = (r + 1) * 2;
    leafArrowIdx.push(a, b, c, a, c, d);
  }
  const headVertOffset = (LEAF_SHAFT_ROWS + 1) * 2;
  for (let r = 0; r < LEAF_HEAD_ROWS; r++) {
    const a = headVertOffset + r * 2;
    const b = a + 1;
    const c = headVertOffset + (r + 1) * 2 + 1;
    const d = headVertOffset + (r + 1) * 2;
    leafArrowIdx.push(a, b, c, a, c, d);
  }
  const leafArrowGeo = new THREE.BufferGeometry();
  leafArrowGeo.setAttribute('position', new THREE.BufferAttribute(leafArrowPos, 3));
  leafArrowGeo.setIndex(leafArrowIdx);
  const leafArrowMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.30,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const leafArrowFill = new THREE.Mesh(leafArrowGeo, leafArrowMat);
  leafArrowFill.frustumCulled = false;
  leafArrowFill.renderOrder = 13;
  leafGroup.add(leafArrowFill);

  const LEAF_OUTLINE_SEGS = [4, 14, 3, 7, 7, 3, 14]; // 52 points périmétriques
  const leafOutlineCount = LEAF_OUTLINE_SEGS.reduce((acc, n) => acc + n, 0);
  const leafArrowOutlinePos = new Float32Array(leafOutlineCount * 3);
  const leafArrowOutlineGeo = new THREE.BufferGeometry();
  leafArrowOutlineGeo.setAttribute('position', new THREE.BufferAttribute(leafArrowOutlinePos, 3));
  const leafArrowOutlineMat = new THREE.LineBasicMaterial({
    color: 0x86efac,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5
  });
  const leafArrowOutline = new THREE.LineLoop(leafArrowOutlineGeo, leafArrowOutlineMat);
  leafArrowOutline.frustumCulled = false;
  leafArrowOutline.renderOrder = 14;
  leafGroup.add(leafArrowOutline);

  const holoTreeFillMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const holoTreeWireMat = new THREE.MeshBasicMaterial({
    color: 0x86efac,
    wireframe: true,
    transparent: true,
    opacity: 0.58,
    depthWrite: false
  });
  const holoTreeBaseRingMat = new THREE.MeshBasicMaterial({
    color: 0x4ade80,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5
  });
  const leafTreeHolograms = [];
  for (let t = 0; t < 6; t++) {
    const unit = createHoloTreeUnit(holoTreeFillMat, holoTreeWireMat, holoTreeBaseRingMat);
    leafGroup.add(unit);
    leafTreeHolograms.push(unit);
  }
  ultPreviewGroup.add(leafGroup);

  ultPreviewGroup.userData = {
    fireGroup,
    firePlane,
    fireCore,
    fireEndRing,
    waterGroup,
    waterArea,
    waterOutline,
    waterOutlinePos,
    waterSweep,
    water360Area,
    water360Pos,
    water360Ang: WATER_360_ANG,
    water360Rad: WATER_360_RAD,
    water360Filigree,
    water360FiligreePos,
    waterFiligreeSpokes: WATER_FILIGREE_SPOKES,
    waterFiligreeSpokeSegs: WATER_FILIGREE_SPOKE_SEGS,
    waterFiligreeRingFracs: WATER_FILIGREE_RING_FRACS,
    waterFiligreeRingSegs: WATER_FILIGREE_RING_SEGS,
    water360OuterBand,
    water360OuterLine,
    water360OuterLinePos,
    waterOuterLineSegs: WATER_OUTER_LINE_SEGS,
    leafGroup,
    leafRing,
    leafArrowFill,
    leafArrowPos,
    leafShaftRows: LEAF_SHAFT_ROWS,
    leafHeadRows: LEAF_HEAD_ROWS,
    leafArrowOutline,
    leafArrowOutlinePos,
    leafTreeHolograms,
    holoTreeFillMat,
    holoTreeWireMat,
    holoTreeBaseRingMat,
    animTime: 0
  };
  scene.add(ultPreviewGroup);
  return ultPreviewGroup;
}

export function updateUltimatePreview3D(dt) {
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!state.ultPreviewActive || !canPlayerUseUltimate(p, false)) {
    if (state.ultPreviewActive) {
      state.ultPreviewActive = false;
      updateUltHudWidget();
    }
    if (ultPreviewGroup) ultPreviewGroup.visible = false;
    return;
  }

  const pg = ensureUltPreviewGroup();
  pg.visible = true;
  pg.position.set(0, 0, 0);
  pg.rotation.set(0, 0, 0);
  const ud = pg.userData;
  ud.animTime += dt;

  const evolved = hasPlayerUltEvo(p);
  const aimAngle = getUltimateAimAngle(p);
  state.ultPreviewAimAngle = aimAngle;
  const dirX = Math.sin(aimAngle);
  const dirZ = Math.cos(aimAngle);
  const rightX = Math.cos(aimAngle);
  const rightZ = -Math.sin(aimAngle);
  const onCanopy = !!p.onCanopy;

  ud.fireGroup.visible = p.color === 'red';
  ud.waterGroup.visible = p.color === 'blue';
  ud.leafGroup.visible = p.color === 'green';

  if (p.color === 'red') {
    const ox = p.pos.x + dirX * 0.85;
    const oy = (p.pos.y || 0) + 1.05;
    const oz = p.pos.z + dirZ * 0.85;
    const maxDist = computeFireLaserMaxDist(ox, oy, oz, dirX, dirZ, FIRE_ULT_MAX_LEN);
    const beamHalfW = FIRE_ULT_BEAM_RADIUS * (evolved ? 1.9 : 1.0);
    const coreHalfW = 0.12 * (evolved ? 1.8 : 1.0);
    updateTerrainRibbonWorld(ud.firePlane, p.pos.x, p.pos.z, dirX, dirZ, rightX, rightZ, beamHalfW, maxDist, 0.20, onCanopy);
    updateTerrainRibbonWorld(ud.fireCore, p.pos.x, p.pos.z, dirX, dirZ, rightX, rightZ, coreHalfW, maxDist, 0.23, onCanopy);
    ud.firePlane.material.opacity = 0.28 + 0.16 * Math.sin(ud.animTime * 8);
    const ringScale = (evolved ? 1.5 : 0.85) + 0.22 * Math.sin(ud.animTime * 10);
    const endX = p.pos.x + dirX * maxDist;
    const endZ = p.pos.z + dirZ * maxDist;
    updateTerrainRingWorld(ud.fireEndRing, endX, endZ, 0.45 * ringScale, 0.85 * ringScale, 0.25, false, onCanopy);
  } else if (p.color === 'blue') {
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
      const angCount = ud.water360Ang;
      const radCount = ud.water360Rad;
      const areaPos = ud.water360Pos;
      for (let r = 0; r <= radCount; r++) {
        const radius = rInner + (evoRange - rInner) * (r / radCount);
        for (let a = 0; a < angCount; a++) {
          const theta = (a / angCount) * Math.PI * 2;
          const wx = p.pos.x + Math.cos(theta) * radius;
          const wz = p.pos.z + Math.sin(theta) * radius;
          const wy = getTerrainY(wx, wz) + 0.20;
          const idx = (r * angCount + a) * 3;
          areaPos[idx] = wx;
          areaPos[idx + 1] = wy;
          areaPos[idx + 2] = wz;
        }
      }
      ud.water360Area.geometry.attributes.position.needsUpdate = true;
      ud.water360Area.material.opacity = 0.11 + 0.04 * Math.sin(ud.animTime * 4.5);

      // Filigrane polaire couvrant toute l'aire jusqu'à evoRange
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

      updateTerrainRingWorld(ud.water360OuterBand, p.pos.x, p.pos.z, evoRange - 0.85, evoRange, 0.22, true, false);
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
    } else {
      const halfW = WATER_ULT_WIDTH * 0.5;
      const zStart = 1.2;
      const zEnd = zStart + WATER_ULT_RANGE;
      updateTerrainGridOriented(ud.waterArea, p.pos.x, p.pos.z, dirX, dirZ, rightX, rightZ, halfW, zStart, zEnd, 0.20);
      ud.waterArea.material.opacity = 0.20 + 0.08 * Math.sin(ud.animTime * 6);

      // Contour net de la vague rectangulaire
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
      updateTerrainGridOriented(ud.waterSweep, p.pos.x, p.pos.z, dirX, dirZ, rightX, rightZ, halfW, sweepZ - 0.55, sweepZ + 0.55, 0.25);
    }
  } else {
    const ringScale = 1 + 0.14 * Math.sin(ud.animTime * 8);
    updateTerrainRingWorld(ud.leafRing, p.pos.x, p.pos.z, 1.15 * ringScale, 1.65 * ringScale, 0.21, false, onCanopy);

    // Flèche directionnelle conforme au relief
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

    // Hologramme de mur d'arbres émergeant de la flèche
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
      const wy = getUltPreviewSurfaceY(wx, wz, onCanopy) + 0.18;
      unit.position.set(wx, wy, wz);
      unit.rotation.y = aimAngle + (t % 2 === 0 ? 0.18 : -0.18);

      const cycle = ((ud.animTime * 0.72 - t * 0.11) % 1 + 1) % 1;
      const emerge =
        cycle < 0.55
          ? 0.36 + 0.64 * Math.sin((cycle / 0.55) * Math.PI * 0.5)
          : 1.0 - 0.08 * ((cycle - 0.55) / 0.45);
      const xzScale = (0.86 + 0.14 * emerge) * (evolved ? 1.20 : 1.0);
      const yScale = emerge * (evolved ? 1.48 : 1.0);
      unit.scale.set(xzScale, yScale, xzScale);
    }
  }
}

export function updateUltHudWidget() {
  const widget = document.getElementById('ult-hud-widget');
  if (!widget) return;
  if (state.phase !== 'play' || state.vanillaMode) {
    widget.classList.add('hidden');
    return;
  }
  widget.classList.remove('hidden');

  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!p) return;

  const iconEl = document.getElementById('ult-hud-icon');
  const titleEl = document.getElementById('ult-hud-title');
  const subEl = document.getElementById('ult-hud-sub');
  const meta = getUltimateMeta(p.color, p);

  widget.classList.remove(
    'ult-locked',
    'ult-used',
    'ult-ready-red',
    'ult-ready-green',
    'ult-ready-blue',
    'ult-preview-active'
  );

  if (iconEl) iconEl.textContent = meta.icon;

  if (!isUltimateUnlocked()) {
    widget.classList.add('ult-locked');
    if (titleEl) titleEl.textContent = `Ultimate (${p.role}) : ${meta.name}`;
    if (subEl) {
      subEl.textContent =
        state.mode === 'tutorial'
          ? '🔒 Débloqué à l’étape 4/5 du tutoriel'
          : '🔒 Débloqué à partir de la Ronde 2';
    }
    return;
  }

  if (canReactivateWaterUlt(p)) {
    widget.classList.add('ult-ready-blue', 'ult-preview-active');
    if (titleEl) {
      titleEl.textContent = `💧 [R] RÉACTIVER : Ramener (${p.activeReactivableWave.pullWindowTimer.toFixed(1)}s)`;
    }
    if (subEl) subEl.textContent = 'Appuyez sur R pour ramener les joueuses touchées !';
    return;
  }

  if (p.leafUltTimer > 0) {
    const mult = p.leafUltSpeedMult || LEAF_ULT_SPEED_MULT;
    widget.classList.add('ult-ready-green', 'ult-preview-active');
    if (titleEl) titleEl.textContent = `🌿 Sprint ${mult}x en cours (${p.leafUltTimer.toFixed(1)}s)`;
    if (subEl) subEl.textContent = 'Sème des germes → Mur organique 1s après la fin !';
    return;
  }

  if (p.ultCooldown > 0) {
    widget.classList.add('ult-locked');
    if (titleEl) titleEl.textContent = `🔥 2e charge Feu (${p.ultCooldown.toFixed(1)}s)`;
    if (subEl) subEl.textContent = 'Bref cooldown de 3s entre les 2 charges...';
    return;
  }

  if (p.ultUsed) {
    widget.classList.add('ult-used');
    if (titleEl) titleEl.textContent = `Ultimate (${p.role}) : ${meta.name}`;
    if (subEl) subEl.textContent = '✔ Utilisé pour cette ronde';
    return;
  }

  if (p.carryingBall) {
    widget.classList.add('ult-locked');
    if (titleEl) titleEl.textContent = `Ultimate (${p.role}) : ${meta.name}`;
    if (subEl) subEl.textContent = '⚽ Indisponible en portant le ballon';
    return;
  }

  if (p.state !== 'standing') {
    widget.classList.add('ult-locked');
    if (titleEl) titleEl.textContent = `Ultimate (${p.role}) : ${meta.name}`;
    if (subEl) subEl.textContent = '⚠️ Joueuse immobilisée';
    return;
  }

  widget.classList.add(`ult-ready-${p.color}`);
  if (state.ultPreviewActive) {
    widget.classList.add('ult-preview-active');
    if (titleEl) titleEl.textContent = `🎯 VISÉE ACTIVE : ${meta.name}`;
    if (subEl) subEl.textContent = 'Clic Gauche : Confirmer & Tirer • [R] : Annuler';
  } else {
    if (titleEl) titleEl.textContent = `[R] Ultimate (${p.role}) : ${meta.name}`;
    if (subEl) {
      const chargesHint = p.color === 'red' && hasPlayerUltEvo(p) ? ' (2 charges)' : '';
      subEl.textContent = `Appuyez sur R (visée) puis Clic Gauche${chargesHint}`;
    }
  }
}

export function updateUltimates(dt) {
  updateFireLasers(dt);
  updateLeafWalls(dt);
  updateWaterWaves(dt);
  updateWaterPulls(dt);
  ctx.api.updateDeployedToolsAndPatches(dt);
}

export function serializeLateUltimates() {
  return {
    fireLasers: activeFireLasers.map((f) => ({
      casterId: f.casterId,
      evolved: !!f.evolved,
      ox: f.ox,
      oy: f.oy,
      oz: f.oz,
      aimAngle: f.aimAngle,
      phase: f.phase,
      timer: f.timer,
      currentLen: f.currentLen,
      maxLen: f.maxLen,
      lingerTimer: f.lingerTimer,
      arcTime: f.arcTime || 0,
      hitPlayers: Array.from(f.hitPlayers || [])
    })),
    leafWalls: activeLeafWalls.map((w) => ({
      casterId: w.casterId,
      evolved: !!w.evolved,
      phase: w.phase,
      sprintTimer: w.sprintTimer,
      sprintMaxDuration: w.sprintMaxDuration,
      growDelayTimer: w.growDelayTimer,
      wallTimer: w.wallTimer,
      wallMaxDuration: w.wallMaxDuration,
      growAnim: w.growAnim || 0,
      nodes: (w.nodes || []).map((n) => ({ x: n.x, y: n.y, z: n.z }))
    })),
    waterWaves: activeWaterWaves.map((w) => ({
      casterId: w.casterId,
      evolved: !!w.evolved,
      aimAngle: w.aimAngle,
      traveled: w.traveled,
      maxRange: w.maxRange,
      finishedWave: !!w.finishedWave,
      pullWindowTimer: w.pullWindowTimer,
      pullTriggered: !!w.pullTriggered,
      hitPlayerIds: Array.from(w.hitPlayerIds || []),
      segments: (w.segments || []).map((s) => ({
        x: s.x,
        y: s.y,
        z: s.z,
        dirX: s.dirX,
        dirZ: s.dirZ,
        active: !!s.active
      }))
    }))
  };
}

export function applyLateUltimates(data) {
  if (!data) return;
  clearAllUltimates();

  (data.fireLasers || []).forEach((sf) => {
    const caster = players.find((pl) => pl.id === sf.casterId);
    if (!caster) return;
    spawnFireLaserUltimate(caster, sf.aimAngle, !!sf.evolved);
    const f = activeFireLasers[activeFireLasers.length - 1];
    if (!f) return;
    f.ox = sf.ox;
    f.oy = sf.oy;
    f.oz = sf.oz;
    f.dirX = Math.sin(sf.aimAngle);
    f.dirZ = Math.cos(sf.aimAngle);
    f.group.position.set(f.ox, 0, f.oz);
    f.group.rotation.y = f.aimAngle;
    f.phase = sf.phase;
    f.timer = sf.timer;
    f.currentLen = sf.currentLen;
    f.maxLen = sf.maxLen;
    f.lingerTimer = sf.lingerTimer;
    f.arcTime = sf.arcTime || 0;
    f.hitPlayers = new Set(sf.hitPlayers || []);
    if (f.phase === 'firing' || f.phase === 'linger') {
      f.outerBeam.visible = true;
      f.innerBeam.visible = true;
      f.impactSphere.visible = true;
      f.warnCore.visible = false;
      if (f.chargeBallGroup) f.chargeBallGroup.visible = false;
      f.outerBeam.position.y = f.oy;
      f.outerBeam.scale.set(1, 1, f.currentLen);
      f.innerBeam.position.y = f.oy;
      f.innerBeam.scale.set(1, 1, f.currentLen);
      f.impactSphere.position.set(0, f.oy, f.currentLen);
    }
  });

  (data.leafWalls || []).forEach((sw) => {
    const caster = players.find((pl) => pl.id === sw.casterId);
    if (!caster) return;
    const wall = createLeafWallRecord(caster, !!sw.evolved);
    (sw.nodes || []).forEach((nd) => plantLeafSproutNode(wall, nd.x, nd.y, nd.z));
    wall.phase = sw.phase;
    wall.sprintTimer = sw.sprintTimer;
    wall.sprintMaxDuration = sw.sprintMaxDuration;
    wall.growDelayTimer = sw.growDelayTimer;
    wall.wallTimer = sw.wallTimer;
    wall.wallMaxDuration = sw.wallMaxDuration;
    wall.growAnim = sw.growAnim || 0;
    if (wall.phase === 'sprinting') {
      caster.leafUltTimer = Math.max(0, sw.sprintTimer);
      caster.leafUltMaxDuration = sw.sprintMaxDuration;
      caster.leafUltSpeedMult = sw.evolved ? 4.2 : LEAF_ULT_SPEED_MULT;
    } else if (wall.phase === 'grown') {
      growLeafWallMesh(wall);
      wall.treeWallGroup.scale.set(1, Math.max(0.05, wall.growAnim || 1), 1);
    }
    activeLeafWalls.push(wall);
    if (wall.phase === 'grown') {
      ctx.api.markNavDynamicDirty?.();
    }
  });

  (data.waterWaves || []).forEach((sw) => {
    const caster = players.find((pl) => pl.id === sw.casterId);
    if (!caster) return;
    spawnWaterWaveUltimate(caster, sw.aimAngle, !!sw.evolved, true);
    const wave = activeWaterWaves[activeWaterWaves.length - 1];
    if (!wave) return;
    wave.traveled = sw.traveled;
    wave.maxRange = sw.maxRange;
    wave.finishedWave = !!sw.finishedWave;
    wave.pullWindowTimer = sw.pullWindowTimer;
    wave.pullTriggered = !!sw.pullTriggered;
    wave.hitPlayerIds = new Set(sw.hitPlayerIds || []);
    wave.group.visible = !wave.finishedWave;
    const segSnaps = sw.segments || [];
    for (let i = 0; i < wave.segments.length && i < segSnaps.length; i++) {
      const seg = wave.segments[i];
      const ss = segSnaps[i];
      seg.x = ss.x;
      seg.y = ss.y;
      seg.z = ss.z;
      seg.dirX = ss.dirX;
      seg.dirZ = ss.dirZ;
      seg.active = !!ss.active;
      seg.mesh.visible = seg.active;
      seg.mesh.position.set(seg.x, seg.y, seg.z);
      if (wave.is360) {
        seg.mesh.scale.x = Math.min(1.0, 0.45 + (wave.traveled / 15.0) * 0.55);
      }
    }
    if (wave.evolved && !wave.pullTriggered && wave.pullWindowTimer > 0) {
      caster.activeReactivableWave = wave;
    } else if (caster.activeReactivableWave === wave) {
      caster.activeReactivableWave = null;
    }
  });
}


