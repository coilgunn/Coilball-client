import { TUTORIAL_STEPS, matchesControl, state, ctx } from '../state.js';
import { cancelUltimatePreview, confirmUltimateTrigger, toggleUltimatePreview } from '../ultimates.js';
import {
  clearInputKeys,
  isControlDown,
  isMenuOpen,
  isMobaCursorLockActive,
  isPointerLocked,
  mouseButtonsDown,
  uiState
} from './shared.js';
import { onFullscreenChange, scheduleViewportSync } from './viewport.js';
import { lockPointerIfPlaying, unlockPointer, updateMobaVirtualCursorUI } from './pointer_lock.js';
import { applyMobaMoveCommand, raycastScreenToWorld } from './raycast.js';
import { toggleCameraMode, toggleMobaCamLock } from './camera.js';
import { cycleControlledRole, selectControlledRole } from './role_select.js';
import { openPauseMenu } from './modals_actions.js';
import { cancelControlRebind, setControlBinding } from './controls_config.js';
import { handleMinimapPress, minimapClientToWorld } from './bindings_hud.js';
import { handleMobaActionAndRecenter, triggerOrChargeAction } from './listeners_keyboard.js';
import { resetMobileInput } from './mobile_aim.js';

function handleLockedMobaMinimapClick(virtualTarget, ptrX, ptrY, e, mouseCode) {
  if (virtualTarget !== uiState.minimapCanvas) return false;
  if (e.button === 2 || (matchesControl('mobaMove', mouseCode) && e.button !== 0)) {
    e.preventDefault();
    const pos = minimapClientToWorld(ptrX, ptrY);
    if (pos) {
      applyMobaMoveCommand({ x: pos.wx, z: pos.wz, onCanopy: false }, true);
      if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.MOBA) {
        ctx.api.markTutorialCheck('mobaToggled');
        ctx.api.markTutorialCheck('mobaMoved');
      }
    }
    updateMobaVirtualCursorUI();
    return true;
  }
  if (e.button === 0) {
    e.preventDefault();
    handleMinimapPress(ptrX, ptrY);
    updateMobaVirtualCursorUI();
    return true;
  }
  return false;
}

function handleLockedMobaVirtualTarget(ptrX, ptrY, e, mouseCode) {
  if (typeof document.elementFromPoint !== 'function') return false;
  const virtualTarget = document.elementFromPoint(ptrX, ptrY);
  if (!virtualTarget) return false;
  if (handleLockedMobaMinimapClick(virtualTarget, ptrX, ptrY, e, mouseCode)) return true;

  const interactive = virtualTarget.closest && virtualTarget.closest('button, a, select, input, .player-row, #ult-hud-widget');
  if (interactive && e.button === 0) {
    e.preventDefault();
    if (interactive.tagName === 'SELECT') {
      state.practiceCursorFree = true;
      unlockPointer();
      interactive.focus();
    } else {
      interactive.click();
    }
    updateMobaVirtualCursorUI();
    return true;
  }
  if (
    virtualTarget.closest &&
    virtualTarget.closest('#minimap-panel, #roster-panel, #quick-actions, #practice-menu-bar, #tutorial-sequence-hud, #controls-help')
  ) {
    updateMobaVirtualCursorUI();
    return true;
  }
  return false;
}

function handleMobaAerialMouseDown(ptrX, ptrY, e, mouseCode) {
  if (isMobaCursorLockActive() && !isPointerLocked()) lockPointerIfPlaying();
  const hit = raycastScreenToWorld(ptrX, ptrY);
  if (hit) state.mobaAimWorld = hit;

  if (state.ultPreviewActive && matchesControl('ultConfirm', mouseCode)) {
    e.preventDefault();
    confirmUltimateTrigger();
    updateMobaVirtualCursorUI();
    return;
  }
  if (matchesControl('mobaMove', mouseCode)) {
    state.mobaRightMouseDown = true;
    if (hit) {
      applyMobaMoveCommand(hit, true);
      if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.MOBA) {
        ctx.api.markTutorialCheck('mobaToggled');
        ctx.api.markTutorialCheck('mobaMoved');
      }
    }
  }
  handleMobaActionAndRecenter(mouseCode, false, 'mouse');
  if (matchesControl('dash', mouseCode)) ctx.api.triggerDash();
  if (matchesControl('jump', mouseCode)) ctx.api.triggerJump?.();
  if (matchesControl('ultimate', mouseCode)) toggleUltimatePreview();
  if (matchesControl('toggleCamLock', mouseCode)) toggleMobaCamLock();
  if (matchesControl('toggleCam', mouseCode)) toggleCameraMode();
  if (!state.myLockedRole && ctx.api.isTutorialRoleSwitchAllowed()) {
    if (matchesControl('roleG', mouseCode)) selectControlledRole('G');
    else if (matchesControl('roleC', mouseCode)) selectControlledRole('C');
    else if (matchesControl('roleD', mouseCode)) selectControlledRole('D');
    else if (matchesControl('cycleRoleNext', mouseCode)) cycleControlledRole(1);
  }
  updateMobaVirtualCursorUI();
}

function handleTpsMouseDown(e, mouseCode) {
  if (!state.mobileMode) lockPointerIfPlaying();
  if (state.ultPreviewActive) {
    if (matchesControl('ultConfirm', mouseCode)) {
      e.preventDefault();
      confirmUltimateTrigger();
      return;
    }
    if (e.button === 2) {
      e.preventDefault();
      cancelUltimatePreview(true);
      return;
    }
  }
  if (state.mobileMode) return;
  let tpsBoundHandled = false;
  if (matchesControl('action', mouseCode)) {
    tpsBoundHandled = true;
    triggerOrChargeAction('mouse');
  }
  if (matchesControl('dash', mouseCode)) {
    tpsBoundHandled = true;
    ctx.api.triggerDash();
  }
  if (matchesControl('jump', mouseCode)) {
    tpsBoundHandled = true;
    ctx.api.triggerJump?.();
  }
  if (matchesControl('ultimate', mouseCode)) {
    tpsBoundHandled = true;
    toggleUltimatePreview();
  }
  if (matchesControl('toggleCam', mouseCode)) {
    tpsBoundHandled = true;
    toggleCameraMode();
  }
  if (!tpsBoundHandled && !state.myLockedRole && ctx.api.isTutorialRoleSwitchAllowed()) {
    if (e.button === 0) cycleControlledRole(-1);
    else if (e.button === 2) cycleControlledRole(1);
  }
}

function onDocumentMouseDown(e) {
  if (state.rebindingState) {
    if (e.target && e.target.closest && e.target.closest('#btn-cancel-rebind')) return;
    e.preventDefault();
    e.stopPropagation();
    const { actionKey, slotIndex } = state.rebindingState;
    setControlBinding(actionKey, slotIndex, `Mouse${e.button}`);
    cancelControlRebind();
    return;
  }
  const mouseCode = `Mouse${e.button}`;
  mouseButtonsDown[mouseCode] = true;
  if (e.button === 1 && !isMenuOpen()) e.preventDefault();
  if (
    e.target &&
    e.target.closest &&
    e.target.closest(
      '.modal-overlay:not(.hidden), .tutorial-intro-overlay:not(.hidden), #mobile-portrait-hint:not(.hidden), #mobile-touch-controls, #quick-actions, #practice-menu-bar, #tutorial-sequence-hud, #minimap-panel, #roster-panel, #controls-help, #ult-hud-widget, .player-row, button, input, select, textarea, a'
    )
  ) {
    return;
  }
  window.focus();
  if (isMenuOpen()) return;
  if (state.mode === 'practice' && state.practiceCursorFree) state.practiceCursorFree = false;
  if (state.mobileMode) return;

  const mobaLockedActive = isPointerLocked() && isMobaCursorLockActive();
  const ptrX = mobaLockedActive
    ? typeof state.mouseClientX === 'number' ? state.mouseClientX : (window.innerWidth || 1280) * 0.5
    : e.clientX;
  const ptrY = mobaLockedActive
    ? typeof state.mouseClientY === 'number' ? state.mouseClientY : (window.innerHeight || 720) * 0.5
    : e.clientY;
  state.mouseClientX = ptrX;
  state.mouseClientY = ptrY;
  state.mouseInWindow = true;

  if (mobaLockedActive && handleLockedMobaVirtualTarget(ptrX, ptrY, e, mouseCode)) return;
  if (state.cameraMode === 'aerial') {
    handleMobaAerialMouseDown(ptrX, ptrY, e, mouseCode);
    return;
  }
  handleTpsMouseDown(e, mouseCode);
}

function onWindowMouseUp(e) {
  const mouseCode = `Mouse${e.button}`;
  mouseButtonsDown[mouseCode] = false;
  if (matchesControl('action', mouseCode) && state.passCharge && state.passCharge.active) {
    ctx.api.releasePassCharge?.();
  }
  if (matchesControl('mobaMove', mouseCode) || e.button === 2) {
    state.mobaRightMouseDown = isControlDown('mobaMove');
  }
  if (
    (state.cameraMode === 'tps' || isMobaCursorLockActive()) &&
    state.phase === 'play' &&
    !isMenuOpen() &&
    !isPointerLocked() &&
    !(state.mode === 'practice' && state.practiceCursorFree)
  ) {
    lockPointerIfPlaying();
  }
  updateMobaVirtualCursorUI();
}

function onWindowMouseMove(e) {
  if (state.mobileMode) return;
  const mobaLockedActive = isPointerLocked() && isMobaCursorLockActive();
  if (mobaLockedActive) {
    const vw = Math.max(1, window.innerWidth || 1280);
    const vh = Math.max(1, window.innerHeight || 720);
    const curX = typeof state.mouseClientX === 'number' ? state.mouseClientX : vw * 0.5;
    const curY = typeof state.mouseClientY === 'number' ? state.mouseClientY : vh * 0.5;
    const mobaSens = state.mobaCursorSensitivity || 1.0;
    state.mouseClientX = Math.max(0, Math.min(vw - 1, curX + (e.movementX || 0) * mobaSens));
    state.mouseClientY = Math.max(0, Math.min(vh - 1, curY + (e.movementY || 0) * mobaSens));
  } else {
    state.mouseClientX = e.clientX;
    state.mouseClientY = e.clientY;
  }
  state.mouseInWindow = true;

  if (isMenuOpen()) {
    uiState.lastMouseX = null;
    uiState.lastMouseY = null;
    state.mobaRightMouseDown = false;
    updateMobaVirtualCursorUI();
    return;
  }
  if (state.cameraMode === 'aerial') {
    updateMobaVirtualCursorUI();
    if (uiState.minimapDragging && mobaLockedActive) {
      const pos = minimapClientToWorld(state.mouseClientX, state.mouseClientY);
      if (pos) {
        state.mobaCamX = pos.wx;
        state.mobaCamZ = pos.wz;
        state.mobaCamInitialized = true;
      }
      return;
    }
    const hit = raycastScreenToWorld(state.mouseClientX, state.mouseClientY);
    if (hit) {
      state.mobaAimWorld = hit;
      if (state.mobaRightMouseDown) applyMobaMoveCommand(hit, false);
    }
    uiState.lastMouseX = state.mouseClientX;
    uiState.lastMouseY = state.mouseClientY;
    return;
  }

  let dx = 0;
  let dy = 0;
  if (isPointerLocked()) {
    dx = e.movementX || 0;
    dy = e.movementY || 0;
  } else if (typeof e.movementX === 'number' && (e.movementX !== 0 || e.movementY !== 0)) {
    dx = e.movementX;
    dy = e.movementY;
    uiState.lastMouseX = e.clientX;
    uiState.lastMouseY = e.clientY;
  } else {
    if (uiState.lastMouseX !== null && uiState.lastMouseY !== null) {
      dx = e.clientX - uiState.lastMouseX;
      dy = e.clientY - uiState.lastMouseY;
    }
    uiState.lastMouseX = e.clientX;
    uiState.lastMouseY = e.clientY;
  }
  const sens = state.tpsSensitivity || 1.0;
  state.camYaw -= dx * 0.0055 * sens;
  state.camPitch = Math.max(0.12, Math.min(1.15, state.camPitch + dy * 0.0045 * sens));
}

function onPointerLockChange() {
  const locked = isPointerLocked();
  const hadPlayLock = uiState.wasPointerLockedInPlay;
  const canLockNow = state.cameraMode === 'tps' || isMobaCursorLockActive();
  if (locked && (!canLockNow || (state.mode === 'practice' && state.practiceCursorFree))) {
    unlockPointer();
    return;
  }
  document.body.classList.toggle(
    'play-cursor-hidden',
    locked && !isMenuOpen() && canLockNow && !(state.mode === 'practice' && state.practiceCursorFree)
  );
  if (locked) {
    if (!isMenuOpen()) {
      uiState.wasPointerLockedInPlay = true;
      uiState.pointerLockAcquiredAt = performance.now();
      if (isMobaCursorLockActive()) {
        const vw = Math.max(1, window.innerWidth || 1280);
        const vh = Math.max(1, window.innerHeight || 720);
        if (typeof state.mouseClientX !== 'number') state.mouseClientX = vw * 0.5;
        if (typeof state.mouseClientY !== 'number') state.mouseClientY = vh * 0.5;
        state.mouseInWindow = true;
      }
    }
    updateMobaVirtualCursorUI();
    return;
  }
  uiState.wasPointerLockedInPlay = false;
  uiState.lastMouseX = null;
  uiState.lastMouseY = null;
  clearInputKeys();
  updateMobaVirtualCursorUI();

  const now = performance.now();
  if (
    hadPlayLock &&
    state.phase === 'play' &&
    !isMenuOpen() &&
    canLockNow &&
    !(state.mode === 'practice' && state.practiceCursorFree) &&
    now > uiState.programmaticPointerUnlockUntil &&
    now > uiState.resumePointerLockGraceUntil &&
    now > uiState.fullscreenUnlockGraceUntil &&
    now - uiState.pointerLockAcquiredAt > 350
  ) {
    uiState.lastEscapePauseMs = now;
    openPauseMenu();
  }
}

export function registerMouseAndViewportListeners() {
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('pointerlockerror', () => {
    document.body.classList.remove('play-cursor-hidden');
    updateMobaVirtualCursorUI();
  });
  window.addEventListener('auxclick', (e) => {
    if (e.button === 1 && !isMenuOpen()) e.preventDefault();
  });
  document.addEventListener('mousedown', onDocumentMouseDown);
  window.addEventListener('mouseup', onWindowMouseUp);
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener(
    'wheel',
    (e) => {
      if (state.cameraMode !== 'aerial' || isMenuOpen()) return;
      state.aerialZoom = Math.max(0.7, Math.min(1.45, (state.aerialZoom || 1.0) + e.deltaY * 0.0008));
    },
    { passive: true }
  );
  window.addEventListener('resize', () => scheduleViewportSync(false));
  window.addEventListener('orientationchange', () => scheduleViewportSync(true));
  if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.addEventListener === 'function') {
    screen.orientation.addEventListener('change', () => scheduleViewportSync(true));
  }
  if (typeof window !== 'undefined' && window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => scheduleViewportSync(false));
    window.visualViewport.addEventListener('scroll', () => {
      if (state.mobileMode) {
        try {
          window.scrollTo(0, 0);
        } catch (_) { /* ignore */ }
      }
      scheduleViewportSync(false);
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetMobileInput();
  });
}
