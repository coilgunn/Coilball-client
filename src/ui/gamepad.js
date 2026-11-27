import { escapeHtml, state, ctx } from '../state.js';
import { getPlayer } from '../render3d.js';
import { getVisibleModalId, isMenuOpen, isPointerLocked, uiState } from './shared.js';
import { showToast } from './toast.js';
import { cycleControlledRole } from './role_select.js';
import { showOnlyModal } from './modals_core.js';
import { closeOptionsModal, openArenaModal, openPauseMenu, resumeFromPauseMenu } from './modals_actions.js';

export const gamepadState = {
  connected: false,
  id: '',
  prevButtons: {},
  moveForward: 0,
  moveRight: 0,
  prepRoleIndex: 0
};

function applyDeadzone(val, threshold = 0.16) {
  if (Math.abs(val) < threshold) return 0;
  return (val - Math.sign(val) * threshold) / (1 - threshold);
}

export function triggerGamepadRumble(durationMs = 180, strongMag = 0.6, weakMag = 0.4) {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  for (let i = 0; i < pads.length; i++) {
    const gp = pads[i];
    if (gp && gp.vibrationActuator && gp.vibrationActuator.playEffect) {
      try {
        gp.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: weakMag,
          strongMagnitude: strongMag
        });
      } catch (_) { /* ignore */ }
    }
  }
}

export function registerGamepadListeners() {
  window.addEventListener('gamepadconnected', (e) => {
    gamepadState.connected = true;
    gamepadState.id = e.gamepad.id;
    const badge = document.getElementById('gamepad-status');
    if (badge) {
      badge.textContent = '🎮 Manette connectée';
      badge.style.color = '#4ade80';
    }
    showToast(`🎮 <strong>Manette connectée :</strong> ${escapeHtml(e.gamepad.id)}`, 3500);
  });

  window.addEventListener('gamepaddisconnected', () => {
    gamepadState.connected = false;
    const badge = document.getElementById('gamepad-status');
    if (badge) {
      badge.textContent = '🎮 Manette : appuyez sur un bouton';
      badge.style.color = '#94a3b8';
    }
  });
}

function updateGamepadCameraAndEdge(gp, dt) {
  if (state.cameraMode === 'tps' && !isMenuOpen() && !isPointerLocked() && uiState.lastMouseX !== null) {
    const edgeZone = 75;
    if (uiState.lastMouseX < edgeZone) {
      const factor = (edgeZone - uiState.lastMouseX) / edgeZone;
      state.camYaw += factor * 2.4 * dt;
    } else if (uiState.lastMouseX > window.innerWidth - edgeZone) {
      const factor = (uiState.lastMouseX - (window.innerWidth - edgeZone)) / edgeZone;
      state.camYaw -= factor * 2.4 * dt;
    }
  }
  if (!isMenuOpen()) {
    const rx = applyDeadzone(gp.axes[2] || 0);
    const ry = applyDeadzone(gp.axes[3] || 0);
    if (rx !== 0 || ry !== 0) {
      state.camYaw -= rx * 2.8 * dt;
      state.camPitch = Math.max(0.12, Math.min(1.15, state.camPitch + ry * 1.9 * dt));
    }
  }
}

function handleGamepadInPlay(gp) {
  const isPressed = (idx) => Boolean(gp.buttons[idx] && gp.buttons[idx].pressed);
  const justPressed = (idx) => isPressed(idx) && !gamepadState.prevButtons[idx];

  if (justPressed(4) || justPressed(6)) cycleControlledRole(-1);
  if (justPressed(5) || justPressed(7)) cycleControlledRole(1);

  const gpActionDown = isPressed(0) || isPressed(2);
  const gpActionJustPressed = justPressed(0) || justPressed(2);
  const controlled = getPlayer(state.myTeam, state.controlledRole);
  if (gpActionJustPressed) {
    if (controlled && controlled.state === 'standing' && controlled.carryingBall) {
      if (!state.passCharge || !state.passCharge.active) ctx.api.beginPassCharge?.('gp');
    } else {
      ctx.api.handleActionKey();
    }
  } else if (!gpActionDown && state.passCharge && state.passCharge.active && state.passCharge.source === 'gp') {
    ctx.api.releasePassCharge?.();
  }

  if (justPressed(1)) ctx.api.triggerDash();
  if (justPressed(3)) document.getElementById('btn-toggle-cam')?.click();
  if (justPressed(10)) ctx.api.triggerJump?.();
}

function handleGamepadPrepModal(justPressed) {
  const roles = ['G', 'C', 'D'];
  if (justPressed(4)) {
    gamepadState.prepRoleIndex = (gamepadState.prepRoleIndex + 2) % 3;
    showToast(`🎮 Rôle sélectionné : <strong>Joueuse ${roles[gamepadState.prepRoleIndex]}</strong> (Y=Vert, B=Rouge, X=Bleu)`, 2000);
  }
  if (justPressed(5)) {
    gamepadState.prepRoleIndex = (gamepadState.prepRoleIndex + 1) % 3;
    showToast(`🎮 Rôle sélectionné : <strong>Joueuse ${roles[gamepadState.prepRoleIndex]}</strong> (Y=Vert, B=Rouge, X=Bleu)`, 2000);
  }
  const activeRole = roles[gamepadState.prepRoleIndex];
  if (justPressed(3)) ctx.api.assignPrepColor(activeRole, 'green');
  if (justPressed(1)) ctx.api.assignPrepColor(activeRole, 'red');
  if (justPressed(2)) ctx.api.assignPrepColor(activeRole, 'blue');
  if (justPressed(0)) {
    const btn = document.getElementById('btn-confirm-prep');
    if (btn && !btn.disabled) btn.click();
  }
}

function handleGamepadInModals(justPressed) {
  const tutIntroEl = document.getElementById('tutorial-intro-overlay');
  if (tutIntroEl && !tutIntroEl.classList.contains('hidden')) {
    if (justPressed(0)) ctx.api.dismissTutorialIntro?.();
    return;
  }
  const visibleId = getVisibleModalId();
  if (visibleId === 'prep-modal') {
    handleGamepadPrepModal(justPressed);
  } else if (visibleId === 'round-end-modal') {
    if (justPressed(0)) {
      const btn = document.getElementById('btn-next-round');
      if (btn && !btn.disabled) btn.click();
    }
  } else if (visibleId === 'pause-modal') {
    if (justPressed(0) && state.phase !== 'menu') resumeFromPauseMenu();
  } else if (visibleId === 'options-modal') {
    if (justPressed(1)) closeOptionsModal();
  } else if (visibleId === 'arena-modal') {
    if (justPressed(0)) {
      const btn = document.getElementById('btn-arena-launch');
      if (btn && !btn.disabled) btn.click();
    } else if (justPressed(1)) {
      showOnlyModal('welcome-modal');
    }
  } else if (visibleId === 'welcome-modal' && justPressed(0)) {
    openArenaModal('pedagogical');
  }
}

export function pollGamepad(dt) {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  let gp = null;
  for (let i = 0; i < pads.length; i++) {
    if (pads[i] && pads[i].connected) {
      gp = pads[i];
      break;
    }
  }
  if (!gp) {
    gamepadState.moveForward = 0;
    gamepadState.moveRight = 0;
    return;
  }
  if (!gamepadState.connected) {
    gamepadState.connected = true;
    const badge = document.getElementById('gamepad-status');
    if (badge) {
      badge.textContent = '🎮 Manette active';
      badge.style.color = '#4ade80';
    }
  }

  const isPressed = (idx) => Boolean(gp.buttons[idx] && gp.buttons[idx].pressed);
  const justPressed = (idx) => isPressed(idx) && !gamepadState.prevButtons[idx];

  let lx = applyDeadzone(gp.axes[0] || 0);
  let ly = applyDeadzone(gp.axes[1] || 0);
  if (isPressed(12)) ly = -1;
  if (isPressed(13)) ly = 1;
  if (isPressed(14)) lx = -1;
  if (isPressed(15)) lx = 1;
  gamepadState.moveRight = lx;
  gamepadState.moveForward = -ly;

  updateGamepadCameraAndEdge(gp, dt);

  if (justPressed(9)) {
    const visibleId = getVisibleModalId();
    if (visibleId === 'options-modal') closeOptionsModal();
    else if (visibleId === 'pause-modal' && state.phase !== 'menu') resumeFromPauseMenu();
    else if (state.phase !== 'menu') openPauseMenu();
  }

  if (!isMenuOpen()) handleGamepadInPlay(gp);
  else handleGamepadInModals(justPressed);

  for (let i = 0; i < gp.buttons.length; i++) {
    gamepadState.prevButtons[i] = isPressed(i);
  }
}
