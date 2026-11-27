import { state } from '../state.js';
import { renderer } from '../render3d.js';
import {
  uiState,
  mouseButtonsDown,
  mobaCursorDomCache,
  isMenuOpen,
  isMobaCursorLockActive,
  isPointerLocked
} from './shared.js';
import { showToast } from './toast.js';

export function updateMobaVirtualCursorUI() {
  const el = document.getElementById('moba-virtual-cursor');
  if (!el) return;
  const visible = !!(
    isMobaCursorLockActive() &&
    state.phase === 'play' &&
    !isMenuOpen() &&
    isPointerLocked() &&
    !(state.mode === 'practice' && state.practiceCursorFree)
  );
  if (mobaCursorDomCache.visible !== visible) {
    el.classList.toggle('hidden', !visible);
    mobaCursorDomCache.visible = visible;
  }
  if (!visible) return;
  const vw = Math.max(1, window.innerWidth || 1280);
  const vh = Math.max(1, window.innerHeight || 720);
  const cx = typeof state.mouseClientX === 'number' ? Math.max(0, Math.min(vw - 1, state.mouseClientX)) : vw * 0.5;
  const cy = typeof state.mouseClientY === 'number' ? Math.max(0, Math.min(vh - 1, state.mouseClientY)) : vh * 0.5;
  const leftStr = `${Math.round(cx)}px`;
  const topStr = `${Math.round(cy)}px`;
  if (mobaCursorDomCache.left !== leftStr) {
    el.style.left = leftStr;
    mobaCursorDomCache.left = leftStr;
  }
  if (mobaCursorDomCache.top !== topStr) {
    el.style.top = topStr;
    mobaCursorDomCache.top = topStr;
  }
  const aiming = !!state.ultPreviewActive;
  if (mobaCursorDomCache.aiming !== aiming) {
    el.classList.toggle('aiming-ult', aiming);
    mobaCursorDomCache.aiming = aiming;
  }
  const pressing = !!(state.mobaRightMouseDown || mouseButtonsDown['Mouse0']);
  if (mobaCursorDomCache.pressing !== pressing) {
    el.classList.toggle('pressing', pressing);
    mobaCursorDomCache.pressing = pressing;
  }
}

function markPointerLocked(initMobaCenter) {
  uiState.wasPointerLockedInPlay = true;
  uiState.pointerLockAcquiredAt = performance.now();
  document.body.classList.add('play-cursor-hidden');
  if (initMobaCenter && isMobaCursorLockActive()) {
    const vw = Math.max(1, window.innerWidth || 1280);
    const vh = Math.max(1, window.innerHeight || 720);
    if (typeof state.mouseClientX !== 'number') state.mouseClientX = vw * 0.5;
    if (typeof state.mouseClientY !== 'number') state.mouseClientY = vh * 0.5;
  }
  updateMobaVirtualCursorUI();
}

function handlePointerLockResolved(forceEvenIfModalClosing) {
  const stillAllowed = state.cameraMode === 'tps' || isMobaCursorLockActive();
  if (!stillAllowed || (state.mode === 'practice' && state.practiceCursorFree) || isMenuOpen()) {
    if (isPointerLocked()) unlockPointer();
    document.body.classList.remove('play-cursor-hidden');
    updateMobaVirtualCursorUI();
    return;
  }
  if ((forceEvenIfModalClosing || !isMenuOpen()) && isPointerLocked()) {
    markPointerLocked(true);
  }
}

function notifyIfIframeBlocked(forceEvenIfModalClosing) {
  document.body.classList.remove('play-cursor-hidden');
  updateMobaVirtualCursorUI();
  if (window.self !== window.top && !uiState.warnedIframeLockInRound && (forceEvenIfModalClosing || !isMenuOpen())) {
    uiState.warnedIframeLockInRound = true;
    showToast(
      '⚠️ Le verrouillage souris est bloqué dans ce cadre — passez en <strong>Plein écran (F)</strong> ou ouvrez le jeu directement.',
      4500
    );
  }
}

export function lockPointerIfPlaying(forceEvenIfModalClosing = false) {
  if (uiState.escapeKeyHeld || uiState.pendingPointerLockOnEscapeKeyup) return;
  const canLockMode = state.cameraMode === 'tps' || isMobaCursorLockActive();
  if (state.mobileMode || !canLockMode || (state.mode === 'practice' && state.practiceCursorFree)) {
    document.body.classList.remove('play-cursor-hidden');
    if (isPointerLocked()) unlockPointer();
    updateMobaVirtualCursorUI();
    return;
  }
  if (!forceEvenIfModalClosing && isMenuOpen()) {
    document.body.classList.remove('play-cursor-hidden');
    updateMobaVirtualCursorUI();
    return;
  }
  if (isPointerLocked()) {
    markPointerLocked(false);
    return;
  }
  try {
    window.focus();
  } catch (_) { /* ignore */ }
  try {
    if (renderer.domElement && typeof renderer.domElement.focus === 'function') {
      renderer.domElement.focus({ preventScroll: true });
    }
  } catch (_) { /* ignore */ }

  try {
    const lockPromise = renderer.domElement.requestPointerLock();
    if (isPointerLocked()) markPointerLocked(false);
    if (lockPromise && typeof lockPromise.then === 'function') {
      lockPromise
        .then(() => handlePointerLockResolved(forceEvenIfModalClosing))
        .catch(() => notifyIfIframeBlocked(forceEvenIfModalClosing));
    }
  } catch (_) {
    notifyIfIframeBlocked(forceEvenIfModalClosing);
  }
}

export function unlockPointer() {
  uiState.wasPointerLockedInPlay = false;
  uiState.programmaticPointerUnlockUntil = performance.now() + 260;
  document.body.classList.remove('play-cursor-hidden');
  const exitFn =
    document.exitPointerLock ||
    document.mozExitPointerLock ||
    document.webkitExitPointerLock;
  const hasLock =
    document.pointerLockElement ||
    document.mozPointerLockElement ||
    document.webkitPointerLockElement;
  if (hasLock && exitFn) {
    try {
      exitFn.call(document);
    } catch (_) { /* ignore */ }
  }
  uiState.lastMouseX = null;
  uiState.lastMouseY = null;
  updateMobaVirtualCursorUI();
}
