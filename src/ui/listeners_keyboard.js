import { TUTORIAL_STEPS, matchesControl, state, ctx } from '../state.js';
import { getPlayer } from '../render3d.js';
import { confirmUltimateTrigger, toggleUltimatePreview } from '../ultimates.js';
import {
  clearInputKeys,
  getVisibleModalId,
  isControlDown,
  isKeyFEvent,
  isMenuOpen,
  isMobaCursorLockActive,
  isPointerLocked,
  keys,
  uiState
} from './shared.js';
import { showToast } from './toast.js';
import { toggleFullscreen } from './viewport.js';
import { lockPointerIfPlaying, unlockPointer } from './pointer_lock.js';
import { applyMobaMoveCommand, raycastScreenToWorld } from './raycast.js';
import { recenterMobaCamera, toggleCameraMode, toggleMobaCamLock } from './camera.js';
import { cycleControlledRole, selectControlledRole } from './role_select.js';
import { showOnlyModal } from './modals_core.js';
import { closeOptionsModal, openPauseMenu, resumeFromPauseMenu } from './modals_actions.js';
import { toggleControlsHelpSubmenu } from './hud_submenus.js';
import { cycleMinimapVisionMode, toggleMinimapSize } from './minimap_render.js';
import { cancelControlRebind, setControlBinding } from './controls_config.js';

export function triggerOrChargeAction(source = 'kb') {
  const controlled = getPlayer(state.myTeam, state.controlledRole);
  if (controlled && controlled.state === 'standing' && controlled.carryingBall) {
    if (!state.passCharge || !state.passCharge.active) ctx.api.beginPassCharge?.(source);
    return;
  }
  ctx.api.handleActionKey();
}

export function handleMobaActionAndRecenter(inputCode, isRepeat, source = 'kb') {
  const isAerial = state.cameraMode === 'aerial';
  const isRecenter = isAerial && matchesControl('recenterCam', inputCode);
  const isAction = matchesControl('action', inputCode);
  const controlled = getPlayer(state.myTeam, state.controlledRole);
  const carryingOrCharging = !!(
    controlled &&
    controlled.state === 'standing' &&
    (controlled.carryingBall || (state.passCharge && state.passCharge.active))
  );

  if (isAction && carryingOrCharging) {
    if (!isRepeat && !(state.passCharge && state.passCharge.active)) ctx.api.beginPassCharge?.(source);
    return true;
  }
  if (isRecenter) {
    if (!isRepeat) {
      const camDistBefore = controlled
        ? Math.hypot((state.mobaCamX || 0) - controlled.pos.x, (state.mobaCamZ || 0) - controlled.pos.z)
        : 0;
      recenterMobaCamera(false);
      if (isAction) {
        const hasUrgentAction = !!(controlled && (controlled.carryingBall || controlled.state === 'sitting'));
        if (camDistBefore <= 8.0 || hasUrgentAction) triggerOrChargeAction(source);
      }
    }
    return true;
  }
  if (isAction && !isRepeat) {
    triggerOrChargeAction(source);
    return true;
  }
  return false;
}

function handleRebindKeydown(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  const { actionKey, slotIndex } = state.rebindingState;
  if (e.code === 'Escape') {
    cancelControlRebind();
    return;
  }
  if (e.code === 'Delete' || e.code === 'Backspace') {
    setControlBinding(actionKey, slotIndex, null);
    cancelControlRebind();
    return;
  }
  if (e.code && e.code !== 'Unidentified') {
    setControlBinding(actionKey, slotIndex, e.code);
    cancelControlRebind();
  }
}

function handleEscapeKeydown(e) {
  e.preventDefault();
  uiState.escapeKeyHeld = true;
  if (e.repeat || performance.now() - uiState.lastEscapePauseMs < 220) return;
  if (state.passCharge && state.passCharge.active) ctx.api.cancelPassCharge?.();
  const visibleId = getVisibleModalId();
  if (visibleId === 'options-modal') {
    closeOptionsModal();
    return;
  }
  if (visibleId === 'arena-modal') {
    showOnlyModal('welcome-modal');
    return;
  }
  if (visibleId === 'mp-modal') {
    const backBtn = document.getElementById('btn-mp-back');
    if (backBtn) backBtn.click();
    else showOnlyModal('welcome-modal');
    return;
  }
  if (state.mode === 'practice' && state.practiceShopPreservePlay && visibleId === 'prep-modal') {
    ctx.api.closePracticeShopAndReturn();
    return;
  }
  if (visibleId === 'pause-modal' && state.phase !== 'menu') resumeFromPauseMenu({ fromEscape: true });
  else if (state.phase !== 'menu') openPauseMenu();
}

function handleInPlaySpecialShortcuts(e) {
  if (e.code === 'Tab' || matchesControl('recenterCam', e.code)) e.preventDefault();
  if (e.code === 'KeyP' && !e.repeat && state.mode === 'practice') {
    e.preventDefault();
    state.practiceCursorFree = !state.practiceCursorFree;
    if (state.practiceCursorFree) {
      unlockPointer();
      showToast('🖱️ <strong>Curseur libéré</strong> : utilisez le menu Pratique en haut (cliquez sur le terrain ou <strong>[P]</strong> pour reverrouiller).', 2600);
    } else {
      lockPointerIfPlaying();
      showToast('🎯 <strong>Caméra verrouillée</strong> !', 1500);
    }
    return true;
  }
  if (
    matchesControl('openShop', e.code) &&
    !e.repeat &&
    ((state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.TOOLS) || state.mode === 'practice')
  ) {
    e.preventDefault();
    ctx.api.openShopShortcut();
    return true;
  }
  if (
    (state.cameraMode === 'tps' || isMobaCursorLockActive()) &&
    !matchesControl('toggleCam', e.code) &&
    e.code !== 'KeyP' &&
    !matchesControl('openShop', e.code) &&
    !(state.mode === 'practice' && state.practiceCursorFree)
  ) {
    lockPointerIfPlaying();
  }
  return false;
}

function handleInPlayKeydown(e) {
  if (handleInPlaySpecialShortcuts(e)) return;

  if (
    state.cameraMode === 'aerial' &&
    (matchesControl('camPanUp', e.code) ||
      matchesControl('camPanDown', e.code) ||
      matchesControl('camPanLeft', e.code) ||
      matchesControl('camPanRight', e.code))
  ) {
    e.preventDefault();
  }
  if (state.cameraMode === 'aerial' && matchesControl('mobaMove', e.code)) {
    state.mobaRightMouseDown = true;
    if (typeof state.mouseClientX === 'number' && typeof state.mouseClientY === 'number') {
      const hit = raycastScreenToWorld(state.mouseClientX, state.mouseClientY);
      if (hit) {
        state.mobaAimWorld = hit;
        applyMobaMoveCommand(hit, true);
      }
    }
  }
  if (state.ultPreviewActive && matchesControl('ultConfirm', e.code) && !e.repeat) {
    e.preventDefault();
    confirmUltimateTrigger();
    return;
  }
  if (state.mode === 'tutorial' && state.phase === 'play' && !state.tutorialIntroVisible && state.tutorialAwaitingConfirm && e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    ctx.api.advanceTutorialStep?.();
    return;
  }
  if (!state.myLockedRole && ctx.api.isTutorialRoleSwitchAllowed() && !e.repeat) {
    if (matchesControl('roleG', e.code)) selectControlledRole('G');
    else if (matchesControl('roleC', e.code)) selectControlledRole('C');
    else if (matchesControl('roleD', e.code)) selectControlledRole('D');
    else if (matchesControl('cycleRoleNext', e.code)) {
      e.preventDefault();
      cycleControlledRole(1);
    }
  }
  if (handleMobaActionAndRecenter(e.code, e.repeat, 'kb')) e.preventDefault();
  if (!e.repeat) {
    if (matchesControl('dash', e.code)) {
      e.preventDefault();
      ctx.api.triggerDash();
    }
    if (matchesControl('jump', e.code)) {
      e.preventDefault();
      ctx.api.triggerJump?.();
    }
    if (matchesControl('ultimate', e.code)) {
      e.preventDefault();
      toggleUltimatePreview();
    }
    if (matchesControl('minimapSize', e.code)) {
      e.preventDefault();
      toggleMinimapSize();
    }
    if (matchesControl('minimapVision', e.code)) {
      e.preventDefault();
      cycleMinimapVisionMode();
    }
    if (matchesControl('controlsHelp', e.code)) {
      e.preventDefault();
      toggleControlsHelpSubmenu();
    }
    if (state.cameraMode === 'aerial' && matchesControl('toggleCamLock', e.code)) {
      e.preventDefault();
      toggleMobaCamLock();
    }
    if (matchesControl('toggleCam', e.code)) {
      e.preventDefault();
      toggleCameraMode();
    }
  }
}

function onWindowKeyDown(e) {
  if (state.rebindingState) {
    handleRebindKeydown(e);
    return;
  }
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable)) {
    return;
  }
  const tutIntroEl = document.getElementById('tutorial-intro-overlay');
  if (tutIntroEl && !tutIntroEl.classList.contains('hidden')) {
    if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
      e.preventDefault();
      ctx.api.dismissTutorialIntro?.();
    }
    return;
  }
  if (e.code === 'Escape') {
    handleEscapeKeydown(e);
    return;
  }
  if (matchesControl('openShop', e.code) && !e.repeat) {
    const prepEl = document.getElementById('prep-modal');
    if (state.mode === 'practice' && state.practiceShopPreservePlay && prepEl && !prepEl.classList.contains('hidden')) {
      e.preventDefault();
      ctx.api.closePracticeShopAndReturn();
      return;
    }
  }
  if (isKeyFEvent(e)) {
    e.preventDefault();
    if (!e.repeat) toggleFullscreen();
    return;
  }
  keys[e.code] = true;
  if (!isMenuOpen()) handleInPlayKeydown(e);
}

function onWindowKeyUp(e) {
  keys[e.code] = false;
  if (matchesControl('action', e.code) && state.passCharge && state.passCharge.active) {
    ctx.api.releasePassCharge?.();
  }
  if (matchesControl('mobaMove', e.code)) {
    state.mobaRightMouseDown = isControlDown('mobaMove');
  }
  const shouldLockNow =
    (state.cameraMode === 'tps' || isMobaCursorLockActive()) &&
    state.phase === 'play' &&
    !isMenuOpen() &&
    !isPointerLocked() &&
    !(state.mode === 'practice' && state.practiceCursorFree);
  if (e.code === 'Escape') {
    uiState.escapeKeyHeld = false;
    if (uiState.pendingPointerLockOnEscapeKeyup) {
      uiState.pendingPointerLockOnEscapeKeyup = false;
      if (shouldLockNow) {
        uiState.resumePointerLockGraceUntil = performance.now() + 650;
        lockPointerIfPlaying();
      }
    }
    return;
  }
  if (isKeyFEvent(e) || e.code === 'KeyP' || matchesControl('openShop', e.code)) return;
  if (shouldLockNow) lockPointerIfPlaying();
}

export function registerKeyboardListeners() {
  window.addEventListener('keydown', onWindowKeyDown);
  window.addEventListener('keyup', onWindowKeyUp);
  window.addEventListener('blur', () => {
    state.mouseInWindow = false;
    uiState.escapeKeyHeld = false;
    uiState.pendingPointerLockOnEscapeKeyup = false;
    clearInputKeys();
  });
  document.addEventListener('mouseleave', () => {
    state.mouseInWindow = false;
  });
  document.addEventListener('mouseenter', () => {
    state.mouseInWindow = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      state.mouseInWindow = false;
      uiState.escapeKeyHeld = false;
      uiState.pendingPointerLockOnEscapeKeyup = false;
      clearInputKeys();
    }
  });
}
