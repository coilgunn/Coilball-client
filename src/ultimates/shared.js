import { TUTORIAL_TOTAL_STEPS, TUTORIAL_STEPS, state, ctx } from '../state.js';
import { scene } from '../render3d.js';

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
export const activeWaterPulls = [];
export const ultState = { previewGroup: null };

// Zero-allocation scratch objects for per-frame raycasts & wave collision steps
export const _ultRay = { ox: 0, oz: 0, dirX: 0, dirZ: 0 };
export const _ultBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
export const _waterStepDir = { x: 0, z: 0 };
export const _waterDeflectTmpPos = { x: 0, z: 0 };
export const _waterPushedInStep = new Set();

export function initUltimates() {
  ctx.entities.activeLeafWalls = activeLeafWalls;
  ctx.entities.activeFireLasers = activeFireLasers;
  ctx.entities.activeWaterWaves = activeWaterWaves;
}

export function hideUltimatePreview() {
  if (ultState.previewGroup) ultState.previewGroup.visible = false;
}

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
  activeWaterPulls.length = 0;
  hideUltimatePreview();
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
    (state.mode === 'tutorial' && state.tutorialStep >= TUTORIAL_STEPS.ULTIMATE)
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
  if (!p || state.phase !== 'play') return false;
  if (state.vanillaMode) {
    if (showReasonToast) {
      ctx.api.showToast('🍦 <strong>Mode Vanille</strong> : les Ultimates sont désactivés.', 2000);
    }
    return false;
  }
  if (!isUltimateUnlocked()) {
    if (showReasonToast) {
      const msg = state.mode === 'tutorial'
        ? `🔒 <strong>Ultimate verrouillé</strong> : il sera débloqué à l’<strong>étape ${TUTORIAL_STEPS.ULTIMATE}/${TUTORIAL_TOTAL_STEPS}</strong> du tutoriel !`
        : '🔒 <strong>Ultimate verrouillé</strong> : disponible à partir de la <strong>2e ronde</strong> (ou en mode Un tour pour rien) !';
      ctx.api.showToast(msg, 2400);
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
