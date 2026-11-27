import { canPlayerPassOrThrow, state, ctx } from '../state.js';
import { getPlayer } from '../render3d.js';
import {
  cancelUltimatePreview,
  canPlayerUseUltimate,
  canReactivateWaterUlt,
  confirmUltimateTrigger,
  toggleUltimatePreview,
  updateUltHudWidget
} from '../ultimates.js';
import { isMenuOpen } from './shared.js';
import {
  AIM_DRAG_THRESHOLD_PX,
  AIM_HOLD_DELAY_MS,
  AIM_MAX_RADIUS_PX,
  clearMobileAimState,
  computeMobileAutoAimAngle,
  mobileInput,
  stickToWorldAngle,
  syncMobileAimPreview3D
} from './mobile_aim.js';
import { updateMobileTouchHUD } from './mobile_hud.js';

export function bindMobileTap(el, handler) {
  if (!el) return;
  let lastTriggerMs = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    lastTriggerMs = performance.now();
    handler();
  });
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (performance.now() - lastTriggerMs < 420) return;
    handler();
  });
}

function getAimRingMetrics() {
  const ringSize = Math.round(Math.max(100, mobileInput.aimBtnRadius * 2 + 34));
  const maxKnobR = Math.max(AIM_MAX_RADIUS_PX, Math.round(ringSize * 0.5 - 6));
  return { ringSize, maxKnobR };
}

function enterWildRiftAimMode(actionType) {
  if (mobileInput.aimAction !== actionType || mobileInput.aimMode === 'aiming') return;
  mobileInput.aimMode = 'aiming';

  const ringEl = document.getElementById('mob-aim-ring');
  const knobEl = document.getElementById('mob-aim-knob');
  const { ringSize, maxKnobR } = getAimRingMetrics();
  if (ringEl) {
    ringEl.style.left = `${mobileInput.aimCenterX.toFixed(1)}px`;
    ringEl.style.top = `${mobileInput.aimCenterY.toFixed(1)}px`;
    ringEl.style.width = `${ringSize}px`;
    ringEl.style.height = `${ringSize}px`;
    ringEl.classList.remove('hidden');
    ringEl.classList.toggle('cancel-armed', !!mobileInput.aimCancelled);
  }
  if (knobEl) {
    knobEl.style.transform = `translate(${(mobileInput.aimNx * maxKnobR).toFixed(1)}px, ${(-mobileInput.aimNy * maxKnobR).toFixed(1)}px)`;
  }
  if (actionType === 'ult') {
    const p = getPlayer(state.myTeam, state.controlledRole);
    if (p && canPlayerUseUltimate(p, false)) {
      state.ultPreviewActive = true;
      state.ultPreviewAimAngle = mobileInput.aimAngle;
      updateUltHudWidget();
    }
  }
  syncMobileAimPreview3D();
}

function validateWildRiftAimStart(p, actionType) {
  const pwr = state.teams[p.team]?.powers?.[p.role] || {};
  if (actionType === 'ult') {
    if (canReactivateWaterUlt(p)) {
      toggleUltimatePreview();
      return false;
    }
    return !!canPlayerUseUltimate(p, true);
  }
  if (actionType === 'dash') {
    if (ctx.api.isDashUnlocked && !ctx.api.isDashUnlocked()) {
      ctx.api.triggerDash?.();
      return false;
    }
    if (p.state !== 'standing') return false;
    if (p.carryingBall || (p.boomerangWindow > 0 && p.boomerangOrigin)) {
      ctx.api.triggerDash?.();
      return false;
    }
    return !((p.dashCooldown || 0) > 0 || (p.dashTimer || 0) > 0);
  }
  if (actionType === 'action') {
    if (p.state === 'sitting') {
      if (pwr.standUp) ctx.api.handleActionKey?.();
      return false;
    }
    if (p.state !== 'standing') return false;
    if (p.carryingBall) {
      if (!canPlayerPassOrThrow(p)) {
        ctx.api.handleActionKey?.();
        return false;
      }
      return true;
    }
    if (state.vanillaMode || !pwr.toolEvo) return false;
    if ((p.toolCooldown || 0) > 0) {
      ctx.api.handleActionKey?.();
      return false;
    }
  }
  return true;
}

function handleWildRiftAimMove(btnEl, actionType, e) {
  if (mobileInput.aimAction !== actionType || e.pointerId !== mobileInput.aimPointerId) return;
  e.preventDefault();
  e.stopPropagation();

  const prevLeft = mobileInput.aimLeftButton;
  const prevCancelled = mobileInput.aimCancelled;
  const rawDx = e.clientX - mobileInput.aimCenterX;
  const rawDy = e.clientY - mobileInput.aimCenterY;
  const distFromCenter = Math.hypot(rawDx, rawDy);

  if (!mobileInput.aimLeftButton && distFromCenter > mobileInput.aimBtnRadius + 2) {
    mobileInput.aimLeftButton = true;
    if (mobileInput.aimHoldTimer) {
      clearTimeout(mobileInput.aimHoldTimer);
      mobileInput.aimHoldTimer = null;
    }
    enterWildRiftAimMode(actionType);
  } else {
    const distFromStart = Math.hypot(e.clientX - mobileInput.aimStartX, e.clientY - mobileInput.aimStartY);
    if (mobileInput.aimMode === 'pressed' && distFromStart >= AIM_DRAG_THRESHOLD_PX) {
      if (mobileInput.aimHoldTimer) {
        clearTimeout(mobileInput.aimHoldTimer);
        mobileInput.aimHoldTimer = null;
      }
      enterWildRiftAimMode(actionType);
    }
  }

  const { maxKnobR } = getAimRingMetrics();
  const scale = distFromCenter > maxKnobR ? maxKnobR / distFromCenter : 1;
  const kx = rawDx * scale;
  const ky = rawDy * scale;
  mobileInput.aimNx = kx / maxKnobR;
  mobileInput.aimNy = -ky / maxKnobR;
  mobileInput.aimLen = Math.min(1, Math.hypot(mobileInput.aimNx, mobileInput.aimNy));

  const knobEl = document.getElementById('mob-aim-knob');
  if (knobEl && mobileInput.aimMode === 'aiming') {
    knobEl.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
  }

  const overCancel = mobileInput.aimLeftButton
    ? mobileInput.aimCancelled ? distFromCenter <= mobileInput.aimBtnRadius + 2 : distFromCenter <= mobileInput.aimBtnRadius
    : false;
  mobileInput.aimCancelled = overCancel;

  const ringEl = document.getElementById('mob-aim-ring');
  if (ringEl) ringEl.classList.toggle('cancel-armed', overCancel);
  btnEl.classList.toggle('aim-cancel-target', mobileInput.aimLeftButton && !overCancel);
  btnEl.classList.toggle('cancel-armed', overCancel);

  const p = getPlayer(state.myTeam, state.controlledRole);
  if (mobileInput.aimLeftButton && !overCancel && distFromCenter > 0.5) {
    mobileInput.aimAngle = stickToWorldAngle(rawDx / distFromCenter, -rawDy / distFromCenter);
  } else if (!mobileInput.aimLeftButton && p) {
    mobileInput.aimAngle = computeMobileAutoAimAngle(actionType, p);
  }

  if (mobileInput.aimLeftButton !== prevLeft || mobileInput.aimCancelled !== prevCancelled) {
    updateMobileTouchHUD();
  } else if (mobileInput.aimMode === 'aiming') {
    syncMobileAimPreview3D();
  }
}

function finishWildRiftAimPointer(btnEl, actionType, e, forceCancel = false) {
  if (mobileInput.aimAction !== actionType || e.pointerId !== mobileInput.aimPointerId) return;
  e.preventDefault();
  e.stopPropagation();
  try {
    if (btnEl.hasPointerCapture && btnEl.hasPointerCapture(e.pointerId)) btnEl.releasePointerCapture(e.pointerId);
  } catch (_) { /* ignore */ }

  const stickAngle = mobileInput.aimAngle;
  const distFromCenter = Math.hypot(e.clientX - mobileInput.aimCenterX, e.clientY - mobileInput.aimCenterY);
  const cancelled =
    forceCancel ||
    mobileInput.aimCancelled ||
    (mobileInput.aimLeftButton && distFromCenter <= mobileInput.aimBtnRadius);

  if (cancelled) {
    if (actionType === 'ult' && state.ultPreviewActive) cancelUltimatePreview(true);
    if (actionType === 'action' && state.passCharge && state.passCharge.active) ctx.api.cancelPassCharge?.();
    clearMobileAimState(true);
    updateMobileTouchHUD();
    return;
  }

  const p = getPlayer(state.myTeam, state.controlledRole);
  const finalAngle =
    mobileInput.aimLeftButton && Number.isFinite(stickAngle)
      ? stickAngle
      : computeMobileAutoAimAngle(actionType, p);
  mobileInput.aimAngle = finalAngle;
  if (p && Number.isFinite(finalAngle)) p.facingAngle = finalAngle;

  if (actionType === 'ult') confirmUltimateTrigger(finalAngle);
  else if (actionType === 'dash') ctx.api.triggerDash?.(finalAngle);
  else if (actionType === 'action') {
    if (p && p.carryingBall && state.passCharge && state.passCharge.active) ctx.api.releasePassCharge?.(finalAngle);
    else ctx.api.handleActionKey?.(finalAngle);
  }
  clearMobileAimState(false);
  updateMobileTouchHUD();
}

export function bindWildRiftAimButton(btnEl, actionType) {
  if (!btnEl) return;
  btnEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (state.phase !== 'play' || isMenuOpen()) return;
    const p = getPlayer(state.myTeam, state.controlledRole);
    if (!p || !validateWildRiftAimStart(p, actionType)) return;
    if (mobileInput.aimAction !== null) clearMobileAimState(true);
    try {
      btnEl.setPointerCapture(e.pointerId);
    } catch (_) { /* ignore */ }

    const rect = btnEl.getBoundingClientRect();
    btnEl.classList.add('aiming');
    mobileInput.aimAction = actionType;
    mobileInput.aimPointerId = e.pointerId;
    mobileInput.aimMode = 'pressed';
    mobileInput.aimStartX = e.clientX;
    mobileInput.aimStartY = e.clientY;
    mobileInput.aimCenterX = rect.left + rect.width * 0.5;
    mobileInput.aimCenterY = rect.top + rect.height * 0.5;
    mobileInput.aimBtnRadius = Math.max(20, Math.min(rect.width, rect.height) * 0.5);
    mobileInput.aimLeftButton = false;
    mobileInput.aimStartMs = performance.now();
    mobileInput.aimNx = 0;
    mobileInput.aimNy = 0;
    mobileInput.aimLen = 0;
    mobileInput.aimAngle = computeMobileAutoAimAngle(actionType, p);
    mobileInput.aimCancelled = false;
    if (actionType === 'action' && p.carryingBall) ctx.api.beginPassCharge?.('mobile');

    mobileInput.aimHoldTimer = setTimeout(() => {
      mobileInput.aimHoldTimer = null;
      if (mobileInput.aimAction === actionType && mobileInput.aimMode === 'pressed') {
        enterWildRiftAimMode(actionType);
      }
    }, AIM_HOLD_DELAY_MS);
  });

  btnEl.addEventListener('pointermove', (e) => handleWildRiftAimMove(btnEl, actionType, e));
  btnEl.addEventListener('pointerup', (e) => finishWildRiftAimPointer(btnEl, actionType, e, false));
  btnEl.addEventListener('pointercancel', (e) => finishWildRiftAimPointer(btnEl, actionType, e, true));
  btnEl.addEventListener('lostpointercapture', (e) => {
    if (mobileInput.aimAction === actionType && e.pointerId === mobileInput.aimPointerId) {
      clearMobileAimState(true);
      updateMobileTouchHUD();
    }
  });
  btnEl.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}
