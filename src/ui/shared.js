import {
  DEFAULT_CONTROLS,
  formatInputCode,
  matchesControl,
  state,
  ctx
} from '../state.js';
import { renderer } from '../render3d.js';

export const THREE = ctx.THREE;

export const MODAL_IDS = [
  'welcome-modal',
  'pause-modal',
  'options-modal',
  'arena-modal',
  'mp-modal',
  'prep-modal',
  'round-end-modal'
];

export const AI_DIFF_STORAGE_KEY = 'coilball_ai_difficulty';
export const CONTROLS_STORAGE_KEY = 'coilball_controls_v2';
export const LEGACY_CONTROLS_STORAGE_KEY = 'coilball_controls_v1';

export const AERIAL_CONE_PROFILE_HIGH = { steps: 42, backSteps: 12, rings: 24, lineSubdiv: 10 };
export const AERIAL_CONE_PROFILE_LOW = { steps: 22, backSteps: 6, rings: 5, lineSubdiv: 2 };
export const AERIAL_CONE_MAX_RAYS = AERIAL_CONE_PROFILE_HIGH.steps + AERIAL_CONE_PROFILE_HIGH.backSteps;
export const aerialConeXY = new Float64Array((AERIAL_CONE_MAX_RAYS + 2) * 2);
export const minimapConeXY = new Float64Array(80);
export const aerialConePool = [];

export const keys = {};
export const mouseButtonsDown = {};

export const occTargetPos = { x: 0, y: 0, z: 0 };
export const badgePos = { x: 0, y: 0, z: 0 };
export const mobaCursorDomCache = { visible: false, left: '', top: '', aiming: false, pressing: false };
export const dashDomCache = { visible: false, left: '', top: '', bg: '', text: '' };
export const tutObjCache = { visible: false, kicker: '', main: '', done: false };

export const uiState = {
  optionsReturnModal: null,
  pendingArenaMode: 'pedagogical',
  pendingArenaVanilla: false,
  minimapDragging: false,
  lastMouseX: null,
  lastMouseY: null,
  wasPointerLockedInPlay: false,
  pointerLockAcquiredAt: 0,
  programmaticPointerUnlockUntil: 0,
  lastEscapePauseMs: 0,
  resumePointerLockGraceUntil: 0,
  fullscreenUnlockGraceUntil: 0,
  pendingPointerLockOnEscapeKeyup: false,
  escapeKeyHeld: false,
  warnedIframeLockInRound: false,
  lastViewportW: 1280,
  lastViewportH: 720,
  portraitHintDismissed: false,
  viewportSyncTimers: [],
  mobaRaycaster: null,
  mobaPointerNDC: null,
  mobaMoveMarker: null,
  mobaMoveMarkerRing: null,
  mobaMoveMarkerDot: null,
  mobaMoveMarkerPulse: 0,
  markerUpVec: null,
  markerNormVec: null,
  tmpCamDesired: null,
  tmpCamLook: null,
  tmpProjVec: null,
  aerialVisionGroup: null,
  aerialConeFrameCounter: 0,
  lastControlsHelpVanilla: null,
  minimapCanvas: null,
  minimapCtx: null,
  minimapSpottedEl: null,
  minimapStaticBgCanvas: null,
  minimapStaticFgCanvas: null,
  minimapStaticKey: '',
  minimapLastSpottedTxt: '',
  toastTimeout: null
};

export function isInputCodeDown(code) {
  if (!code) return false;
  if (code.startsWith('Mouse')) return !!mouseButtonsDown[code];
  if (code === 'ShiftLeft' || code === 'ShiftRight') {
    return !!(keys['ShiftLeft'] || keys['ShiftRight']);
  }
  return !!keys[code];
}

export function isControlDown(actionKey) {
  const slots = (state.controls && state.controls[actionKey]) || DEFAULT_CONTROLS[actionKey];
  if (!Array.isArray(slots)) return false;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] && isInputCodeDown(slots[i])) return true;
  }
  return false;
}

export function formatActionBindingText(actionKey, sep = ' / ') {
  const slots = (state.controls && state.controls[actionKey]) || DEFAULT_CONTROLS[actionKey] || [];
  const active = slots.filter(Boolean).map((c) => formatInputCode(c));
  return active.length > 0 ? active.join(sep) : '—';
}

export function isKeyFEvent(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (matchesControl('fullscreen', e.code)) return true;
  return !e.code && typeof e.key === 'string' && e.key.toLowerCase() === 'f' && matchesControl('fullscreen', 'KeyF');
}

export function isPointerLocked() {
  const lockEl =
    document.pointerLockElement ||
    document.mozPointerLockElement ||
    document.webkitPointerLockElement ||
    null;
  return (
    lockEl === renderer.domElement ||
    lockEl === document.body ||
    lockEl === document.documentElement
  );
}

export function getViewportSize() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const docEl = typeof document !== 'undefined' ? document.documentElement : null;
  const rawW =
    (vv && vv.width > 0 ? vv.width : 0) ||
    (typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 0) ||
    (docEl && docEl.clientWidth > 0 ? docEl.clientWidth : 1280);
  const rawH =
    (vv && vv.height > 0 ? vv.height : 0) ||
    (typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 0) ||
    (docEl && docEl.clientHeight > 0 ? docEl.clientHeight : 720);
  return {
    w: Math.max(1, Math.round(rawW)),
    h: Math.max(1, Math.round(rawH))
  };
}

export function isMenuOpen() {
  if (state.phase !== 'play') return true;
  const tutIntroEl = document.getElementById('tutorial-intro-overlay');
  if (tutIntroEl && !tutIntroEl.classList.contains('hidden')) return true;
  return MODAL_IDS.some((id) => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
}

export function isMobaCursorLockActive() {
  return !!(state.cameraMode === 'aerial' && state.mobaCursorLock && !state.mobileMode);
}

export function getVisibleModalId() {
  for (let i = 0; i < MODAL_IDS.length; i++) {
    const el = document.getElementById(MODAL_IDS[i]);
    if (el && !el.classList.contains('hidden')) return MODAL_IDS[i];
  }
  return null;
}

export function isMapChangeLocked() {
  return state.phase !== 'menu' && state.mode !== 'practice';
}

export function clearInputKeys() {
  Object.keys(keys).forEach((k) => {
    keys[k] = false;
  });
  Object.keys(mouseButtonsDown).forEach((b) => {
    mouseButtonsDown[b] = false;
  });
  state.mobaRightMouseDown = false;
  uiState.minimapDragging = false;
  if (state.passCharge && state.passCharge.active) {
    ctx.api.cancelPassCharge?.();
  }
}

export function attachLockFocusPrep(btnEl) {
  if (!btnEl) return;
  btnEl.addEventListener('mousedown', () => {
    try {
      if (renderer.domElement && typeof renderer.domElement.focus === 'function') {
        renderer.domElement.focus({ preventScroll: true });
      }
    } catch (_) { /* ignore */ }
  });
}

export function resetPointerLockFlags() {
  uiState.warnedIframeLockInRound = false;
  uiState.wasPointerLockedInPlay = false;
  uiState.pointerLockAcquiredAt = 0;
  uiState.escapeKeyHeld = false;
  uiState.pendingPointerLockOnEscapeKeyup = false;
  uiState.resumePointerLockGraceUntil = 0;
  uiState.fullscreenUnlockGraceUntil = 0;
}
