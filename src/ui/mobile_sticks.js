import { TUTORIAL_STEPS, state, ctx } from '../state.js';
import { uiState } from './shared.js';
import { updateMobilePortraitHintUI } from './viewport.js';
import { toggleCameraMode, toggleMobaCamLock } from './camera.js';
import { selectControlledRole } from './role_select.js';
import { openPauseMenu } from './modals_actions.js';
import { mobileInput, resetMobileInput } from './mobile_aim.js';
import { setLowSpecMode, setMobileMode } from './mobile_hud.js';
import { bindMobileTap, bindWildRiftAimButton } from './mobile_buttons.js';

function computeStickDelta(baseEl, stickEl, clientX, clientY, minMaxR) {
  if (!baseEl) return null;
  const rect = baseEl.getBoundingClientRect();
  const maxR = Math.max(minMaxR, rect.width * 0.42);
  let dx = clientX - (rect.left + rect.width * 0.5);
  let dy = clientY - (rect.top + rect.height * 0.5);
  const dist = Math.hypot(dx, dy);
  if (dist > maxR) {
    const s = maxR / dist;
    dx *= s;
    dy *= s;
  }
  if (stickEl) stickEl.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  return { nx: dx / maxR, ny: -dy / maxR };
}

function bindMobileStickZone(cfg) {
  const { zone, base, stick, minMaxR, getPtrId, setPtrId, onDelta, onReset } = cfg;
  if (!zone) return;
  const updateFromClient = (cx, cy) => {
    const delta = computeStickDelta(base, stick, cx, cy, minMaxR);
    if (delta) onDelta(delta.nx, delta.ny);
  };
  const release = (pointerId) => {
    const activeId = getPtrId();
    if (activeId === null) return;
    if (pointerId !== undefined && pointerId !== activeId) return;
    try {
      if (zone.hasPointerCapture && zone.hasPointerCapture(activeId)) zone.releasePointerCapture(activeId);
    } catch (_) { /* ignore */ }
    setPtrId(null);
    onReset();
    if (stick) stick.style.transform = 'translate(0px, 0px)';
  };

  zone.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (getPtrId() !== null) return;
    setPtrId(e.pointerId);
    try {
      zone.setPointerCapture(e.pointerId);
    } catch (_) { /* ignore */ }
    updateFromClient(e.clientX, e.clientY);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== getPtrId()) return;
    e.preventDefault();
    e.stopPropagation();
    updateFromClient(e.clientX, e.clientY);
  });
  zone.addEventListener('pointerup', (e) => {
    if (e.pointerId !== getPtrId()) return;
    e.preventDefault();
    e.stopPropagation();
    release(e.pointerId);
  });
  zone.addEventListener('pointercancel', (e) => {
    if (e.pointerId === getPtrId()) release(e.pointerId);
  });
  zone.addEventListener('lostpointercapture', (e) => {
    if (e.pointerId === getPtrId()) release(e.pointerId);
  });
}

function bindMobileDeviceAndActionButtons() {
  const btnLow = document.getElementById('btn-toggle-low-spec');
  if (btnLow) {
    btnLow.onclick = () => {
      btnLow.blur();
      setLowSpecMode(!state.lowSpecMode);
    };
  }
  const btnMob = document.getElementById('btn-toggle-mobile-mode');
  if (btnMob) {
    btnMob.onclick = () => {
      btnMob.blur();
      setMobileMode(!state.mobileMode);
    };
  }
  const btnDismissPortrait = document.getElementById('btn-dismiss-portrait-hint');
  if (btnDismissPortrait) {
    bindMobileTap(btnDismissPortrait, () => {
      uiState.portraitHintDismissed = true;
      updateMobilePortraitHintUI();
    });
  }

  bindWildRiftAimButton(document.getElementById('mob-btn-ult'), 'ult');
  bindWildRiftAimButton(document.getElementById('mob-btn-dash'), 'dash');
  bindWildRiftAimButton(document.getElementById('mob-btn-action'), 'action');
  bindMobileTap(document.getElementById('mob-btn-jump'), () => ctx.api.triggerJump?.());
  bindMobileTap(document.getElementById('mob-btn-pause'), () => openPauseMenu());
  bindMobileTap(document.getElementById('mob-btn-cam'), () => toggleCameraMode());
  bindMobileTap(document.getElementById('mob-btn-recenter'), () => toggleMobaCamLock());
  bindMobileTap(document.getElementById('mob-btn-shop'), () => ctx.api.openShopShortcut());
  ['G', 'C', 'D'].forEach((role) => {
    bindMobileTap(document.getElementById(`mob-role-${role}`), () => selectControlledRole(role));
  });
}

function bindMobileSticks() {
  bindMobileStickZone({
    zone: document.getElementById('mobile-joystick-zone'),
    base: document.getElementById('mobile-joystick-base'),
    stick: document.getElementById('mobile-joystick-stick'),
    minMaxR: 24,
    getPtrId: () => mobileInput.joyPointerId,
    setPtrId: (id) => {
      mobileInput.joyPointerId = id;
      mobileInput.joyTouchId = id;
    },
    onDelta: (nx, ny) => {
      if (Math.hypot(nx, ny) < 0.12) {
        mobileInput.joyForward = 0;
        mobileInput.joyRight = 0;
        return;
      }
      mobileInput.joyRight = nx;
      mobileInput.joyForward = ny;
      if (state.cameraMode === 'aerial' && state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.MOBA) {
        ctx.api.markTutorialCheck?.('mobaToggled');
        ctx.api.markTutorialCheck?.('mobaMoved');
      }
    },
    onReset: () => {
      mobileInput.joyTouchId = null;
      mobileInput.joyMouseDown = false;
      mobileInput.joyForward = 0;
      mobileInput.joyRight = 0;
    }
  });

  bindMobileStickZone({
    zone: document.getElementById('mobile-cam-zone'),
    base: document.getElementById('mobile-cam-base'),
    stick: document.getElementById('mobile-cam-stick'),
    minMaxR: 20,
    getPtrId: () => mobileInput.camPointerId,
    setPtrId: (id) => {
      mobileInput.camPointerId = id;
    },
    onDelta: (nx, ny) => {
      const zero = Math.hypot(nx, ny) < 0.10;
      mobileInput.camX = zero ? 0 : nx;
      mobileInput.camY = zero ? 0 : ny;
      mobileInput.camRight = zero ? 0 : nx;
      mobileInput.camForward = zero ? 0 : ny;
    },
    onReset: () => {
      mobileInput.camX = 0;
      mobileInput.camY = 0;
      mobileInput.camRight = 0;
      mobileInput.camForward = 0;
    }
  });
}

export function initMobileAndDeviceControls() {
  bindMobileDeviceAndActionButtons();
  bindMobileSticks();
  window.addEventListener('blur', resetMobileInput);
}
