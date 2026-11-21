// ============================================================================
// COILBALL 3D — INTERFACE, MODALES, ENTRÉES, CAMÉRA MOBA, HUD & MINIMAP
// ============================================================================

import {
  COLORS,
  FIELD,
  DASH_COOLDOWN,
  PASS_CHARGE_SPEC,
  getPassSnapHalfAngle,
  canPlayerPassOrThrow,
  INDIVIDUAL_POWERS,
  hasRoleEvolutionItem,
  DEFAULT_CONTROLS,
  CONTROL_CATEGORIES,
  CONTROL_ACTIONS_META,
  cloneDefaultControls,
  formatInputCode,
  matchesControl,
  state,
  mp,
  escapeHtml,
  getTeamPE,
  getTeamPV,
  ctx,
  lerpAngle
} from './state.js';
import {
  dashCooldownEl,
  dashCooldownPieEl,
  dashCooldownTextEl,
  leafWallBadges,
  hideLeafDurationBadge,
  updateLeafDurationBadge,
  updateLeafWallBadgeInView,
  getLeafWallBadge,
  scene,
  camera,
  renderer,
  sunLight,
  players,
  balls,
  setParticlePoolLimit,
  getPlayer,
  spawnParticles,
  applyMeshStealthAlpha,
  syncPlayerPowerVisuals
} from './render3d.js';
import {
  PARK_LANDMARKS,
  MONTREAL_MAPS,
  CANOPY_SPEC,
  JUNGLE_OBSTACLES,
  JUNGLE_BUSHES,
  VISION_SPEC,
  getTerrainY,
  applyArenaMapData,
  isPointInJungleBush,
  hasClearLineOfSight,
  hasAllyVisionNear,
  updateTeamVisionState,
  castVisionRay2D,
  fillPlayerVisionPolygonFlat,
  getCanopySurfaceY,
  getStructureSurfaceY,
  cameraTreeOccluders,
  distSqSegmentToVerticalCapsule,
  getActiveMapMeta,
  buildParkEnvironment
} from './world.js';
import {
  LEAF_ULT_SPRINT_DURATION,
  LEAF_ULT_SPEED_MULT,
  LEAF_ULT_GROW_DELAY,
  LEAF_ULT_WALL_DURATION,
  activeFireLasers,
  activeLeafWalls,
  activeWaterWaves,
  clearAllUltimates,
  getUltimateMeta,
  isUltimateUnlocked,
  canReactivateWaterUlt,
  toggleUltimatePreview,
  cancelUltimatePreview,
  confirmUltimateTrigger,
  canPlayerUseUltimate,
  updateUltHudWidget,
  hideUltimatePreview
} from './ultimates.js';
import {
  getMemberControlledRole,
  getRoleHumanController,
  closeMultiplayerSession,
  sendNetMessage,
  hostRoom,
  joinRoom,
  broadcastLobbyState,
  updateLobbyUI,
  updatePingUI,
  updateTransportBadgeUI,
  probeMpServerPing
} from './net.js';

const THREE = ctx.THREE;
const MODAL_IDS = [
  'welcome-modal',
  'pause-modal',
  'options-modal',
  'arena-modal',
  'mp-modal',
  'prep-modal',
  'round-end-modal'
];
let optionsReturnModal = null;
let pendingArenaMode = 'pedagogical';
let pendingArenaVanilla = false;

const STEALTH_EYE_SVG =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.73-2.06 1.98-3.87 3.6-5.27"/>' +
  '<path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.06 11.06 0 0 1-2.16 3.19"/>' +
  '<path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>' +
  '<line x1="2" y1="2" x2="22" y2="22"/>' +
  '</svg>';
const STEALTH_BADGE_HTML = `<span class="stealth-status-badge" title="Cachée dans un buisson">${STEALTH_EYE_SVG}</span>`;

function buildPowerIconsHtml(teamKey, role) {
  const teamMeta = state.teams && state.teams[teamKey];
  const pwr = (teamMeta && teamMeta.powers && teamMeta.powers[role]) || {};
  let icons = '';
  if (state.vanillaMode) {
    if (pwr.throwBall) icons += '🎯';
    if (pwr.standUp) icons += '⚡';
    if (teamMeta && teamMeta.teamJump) icons += '🦘';
  } else {
    if (pwr.ultEvo) icons += '🌟';
    if (pwr.dashEvo === 'bounce') icons += '🌀';
    else if (pwr.dashEvo === 'slide') icons += '🧊';
    else if (pwr.dashEvo === 'boomerang') icons += '🪃';
    if (pwr.toolEvo === 'beacon') icons += '📡';
    else if (pwr.toolEvo === 'wall') icons += '🧱';
    else if (pwr.toolEvo === 'pad') icons += '🚀';
    if (pwr.standUp) icons += '⚡';
    if (teamMeta && teamMeta.teamDashPlus) icons += '👟';
    if (teamMeta && teamMeta.teamJump) icons += '🦘';
  }
  return icons ? `<span class="label-power-icons">${icons}</span>` : '';
}
// --- GESTION DES MODALES, PAUSE & ENTRÉES (CLAVIER, SOURIS & MANETTE) ---
export const keys = {};
export const mouseButtonsDown = {};
let minimapDragging = false;
let lastMouseX = null;
let lastMouseY = null;

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

function formatActionBindingText(actionKey, sep = ' / ') {
  const slots = (state.controls && state.controls[actionKey]) || DEFAULT_CONTROLS[actionKey] || [];
  const active = slots.filter(Boolean).map((c) => formatInputCode(c));
  return active.length > 0 ? active.join(sep) : '—';
}

function formatActionKbdHtml(actionKey) {
  const slots = (state.controls && state.controls[actionKey]) || DEFAULT_CONTROLS[actionKey] || [];
  const active = slots.filter(Boolean);
  if (active.length === 0) return '<kbd>—</kbd>';
  return active.map((c) => `<kbd>${escapeHtml(formatInputCode(c))}</kbd>`).join(' / ');
}

// État Manette (Gamepad API)
export const gamepadState = {
  connected: false,
  id: '',
  prevButtons: {},
  moveForward: 0,
  moveRight: 0,
  prepRoleIndex: 0 // 0='G', 1='C', 2='D' pour choisir les dossards à la manette
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
      } catch (_) {}
    }
  }
}

window.addEventListener('gamepadconnected', (e) => {
  gamepadState.connected = true;
  gamepadState.id = e.gamepad.id;
  const badge = document.getElementById('gamepad-status');
  if (badge) {
    badge.textContent = '🎮 Manette connectée';
    badge.style.color = '#4ade80';
  }
  showToast(`🎮 <strong>Manette connectée :</strong> ${e.gamepad.id}`, 3500);
});

window.addEventListener('gamepaddisconnected', () => {
  gamepadState.connected = false;
  const badge = document.getElementById('gamepad-status');
  if (badge) {
    badge.textContent = '🎮 Manette : appuyez sur un bouton';
    badge.style.color = '#94a3b8';
  }
});

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

  // Stick Gauche + D-Pad (12=Haut, 13=Bas, 14=Gauche, 15=Droite)
  let lx = applyDeadzone(gp.axes[0] || 0);
  let ly = applyDeadzone(gp.axes[1] || 0);
  if (isPressed(12)) ly = -1;
  if (isPressed(13)) ly = 1;
  if (isPressed(14)) lx = -1;
  if (isPressed(15)) lx = 1;

  gamepadState.moveRight = lx;
  gamepadState.moveForward = -ly;

  // Rotation continue au bord de l'écran si Pointer Lock est bloqué (uniquement en vue TPS)
  if (
    state.cameraMode === 'tps' &&
    !isMenuOpen() &&
    !isPointerLocked() &&
    lastMouseX !== null
  ) {
    const edgeZone = 75;
    if (lastMouseX < edgeZone) {
      const factor = (edgeZone - lastMouseX) / edgeZone;
      state.camYaw += factor * 2.4 * dt;
    } else if (lastMouseX > window.innerWidth - edgeZone) {
      const factor = (lastMouseX - (window.innerWidth - edgeZone)) / edgeZone;
      state.camYaw -= factor * 2.4 * dt;
    }
  }

  // Stick Droit : Orienter l'angle de vision en continu pendant le jeu
  if (!isMenuOpen()) {
    const rx = applyDeadzone(gp.axes[2] || 0);
    const ry = applyDeadzone(gp.axes[3] || 0);
    if (rx !== 0 || ry !== 0) {
      state.camYaw -= rx * 2.8 * dt;
      state.camPitch = Math.max(0.12, Math.min(1.15, state.camPitch + ry * 1.9 * dt));
    }
  }

  // Bouton Start / Options (9) : Pause & Menu (comme Échap)
  if (justPressed(9)) {
    const visibleId = getVisibleModalId();
    if (visibleId === 'options-modal') {
      closeOptionsModal();
    } else if (visibleId === 'pause-modal' && state.phase !== 'menu') {
      resumeFromPauseMenu();
    } else if (state.phase !== 'menu') {
      openPauseMenu();
    }
  }

  if (!isMenuOpen()) {
    // EN JEU :
    // LB (4) ou LT (6) -> Joueuse précédente (comme Clic Gauche)
    if (justPressed(4) || justPressed(6)) {
      cycleControlledRole(-1);
    }
    // RB (5) ou RT (7) -> Joueuse suivante (comme Clic Droit)
    if (justPressed(5) || justPressed(7)) {
      cycleControlledRole(1);
    }
    // A / Croix (0) ou X / Carré (2) -> Passe chargée (si ballon) / Outil / Se relever
    const gpActionDown = isPressed(0) || isPressed(2);
    const gpActionJustPressed = justPressed(0) || justPressed(2);
    const controlled = getPlayer(state.myTeam, state.controlledRole);
    if (gpActionJustPressed) {
      if (controlled && controlled.state === 'standing' && controlled.carryingBall) {
        if (!state.passCharge || !state.passCharge.active) {
          ctx.api.beginPassCharge?.('gp');
        }
      } else {
        ctx.api.handleActionKey();
      }
    } else if (!gpActionDown && state.passCharge && state.passCharge.active && state.passCharge.source === 'gp') {
      ctx.api.releasePassCharge?.();
    }
    // B / Rond (1) -> Dash (3s cooldown, impossible en tenant un ballon)
    if (justPressed(1)) {
      ctx.api.triggerDash();
    }
    // Y / Triangle (3) -> Changer de vue caméra
    if (justPressed(3)) {
      document.getElementById('btn-toggle-cam').click();
    }
    // L3 (10) -> Saut (si débloqué pour l'équipe)
    if (justPressed(10)) {
      ctx.api.triggerJump?.();
    }
  } else {
    // DANS LES MODALES :
    const tutIntroEl = document.getElementById('tutorial-intro-overlay');
    const tutIntroOpen = !!(tutIntroEl && !tutIntroEl.classList.contains('hidden'));
    const visibleId = getVisibleModalId();

    if (tutIntroOpen) {
      if (justPressed(0)) {
        ctx.api.dismissTutorialIntro?.();
      }
    } else if (visibleId === 'prep-modal') {
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
      // Y (3) = Vert, B (1) = Rouge, X (2) = Bleu
      if (justPressed(3)) ctx.api.assignPrepColor(activeRole, 'green');
      if (justPressed(1)) ctx.api.assignPrepColor(activeRole, 'red');
      if (justPressed(2)) ctx.api.assignPrepColor(activeRole, 'blue');
      // A (0) = Valider la préparation ("Au jeu !")
      if (justPressed(0)) {
        const btn = document.getElementById('btn-confirm-prep');
        if (btn && !btn.disabled) btn.click();
      }
    } else if (visibleId === 'round-end-modal') {
      if (justPressed(0)) {
        const btn = document.getElementById('btn-next-round');
        if (btn && !btn.disabled) btn.click();
      }
    } else if (visibleId === 'pause-modal') {
      if (justPressed(0) && state.phase !== 'menu') {
        resumeFromPauseMenu();
      }
    } else if (visibleId === 'options-modal') {
      if (justPressed(1)) {
        closeOptionsModal();
      }
    } else if (visibleId === 'arena-modal') {
      if (justPressed(0)) {
        const btn = document.getElementById('btn-arena-launch');
        if (btn && !btn.disabled) btn.click();
      } else if (justPressed(1)) {
        showOnlyModal('welcome-modal');
      }
    } else if (visibleId === 'welcome-modal') {
      if (justPressed(0)) {
        openArenaModal('pedagogical');
      }
    }
  }

  // Mémoriser l'état des boutons pour le prochain frame
  for (let i = 0; i < gp.buttons.length; i++) {
    gamepadState.prevButtons[i] = isPressed(i);
  }
}

let isTransitioningFullscreen = false;
let fullscreenTransitionUntil = 0;
let fullscreenTransitionTimer = null;
let wasPointerLockedInPlay = false;
let programmaticPointerUnlockUntil = 0;
let lastEscapePauseMs = 0;
let resumePointerLockGraceUntil = 0;
let pendingPointerLockOnEscapeKeyup = false;
let warnedIframeLockInRound = false;
let lastViewportW = 1280;
let lastViewportH = 720;

function markFullscreenTransition(durationMs = 2500) {
  isTransitioningFullscreen = true;
  fullscreenTransitionUntil = performance.now() + durationMs;
  if (fullscreenTransitionTimer) clearTimeout(fullscreenTransitionTimer);
  fullscreenTransitionTimer = setTimeout(() => {
    if (performance.now() >= fullscreenTransitionUntil) {
      isTransitioningFullscreen = false;
    }
  }, durationMs + 50);
}

function isPointerLocked() {
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

let portraitHintDismissed = false;
let viewportSyncTimers = [];

export function updateMobilePortraitHintUI(wArg = null, hArg = null) {
  const el = document.getElementById('mobile-portrait-hint');
  if (!el) return;
  const dims =
    typeof wArg === 'number' && typeof hArg === 'number' && wArg > 0 && hArg > 0
      ? { w: wArg, h: hArg }
      : getViewportSize();
  const showHint = !!(state.mobileMode && !portraitHintDismissed && dims.h > dims.w);
  el.classList.toggle('hidden', !showHint);
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

export function syncViewportSize() {
  const { w, h } = getViewportSize();
  lastViewportW = w;
  lastViewportH = h;
  const aspect = w / Math.max(1, h);
  camera.aspect = aspect;
  const targetFov =
    aspect < 1 ? Math.min(82, Math.round(60 / Math.max(0.55, Math.pow(aspect, 0.45)))) : 60;
  if (camera.fov !== targetFov) {
    camera.fov = targetFov;
  }
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  updateMobilePortraitHintUI(w, h);
}

function scheduleViewportSync(withReset = false) {
  if (withReset) {
    resetMobileInput();
    try {
      window.scrollTo(0, 0);
    } catch (_) {}
  }
  while (viewportSyncTimers.length > 0) {
    clearTimeout(viewportSyncTimers.pop());
  }
  syncViewportSize();
  [80, 220, 500].forEach((ms) => {
    viewportSyncTimers.push(
      setTimeout(() => {
        if (withReset && state.mobileMode) {
          try {
            window.scrollTo(0, 0);
          } catch (_) {}
        }
        syncViewportSize();
      }, ms)
    );
  });
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

const _mobaCursorDomCache = { visible: false, left: '', top: '', aiming: false, pressing: false };
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
  if (_mobaCursorDomCache.visible !== visible) {
    el.classList.toggle('hidden', !visible);
    _mobaCursorDomCache.visible = visible;
  }
  if (!visible) return;
  const vw = Math.max(1, window.innerWidth || 1280);
  const vh = Math.max(1, window.innerHeight || 720);
  const cx = typeof state.mouseClientX === 'number' ? Math.max(0, Math.min(vw - 1, state.mouseClientX)) : vw * 0.5;
  const cy = typeof state.mouseClientY === 'number' ? Math.max(0, Math.min(vh - 1, state.mouseClientY)) : vh * 0.5;
  const leftStr = `${Math.round(cx)}px`;
  const topStr = `${Math.round(cy)}px`;
  if (_mobaCursorDomCache.left !== leftStr) {
    el.style.left = leftStr;
    _mobaCursorDomCache.left = leftStr;
  }
  if (_mobaCursorDomCache.top !== topStr) {
    el.style.top = topStr;
    _mobaCursorDomCache.top = topStr;
  }
  const aiming = !!state.ultPreviewActive;
  if (_mobaCursorDomCache.aiming !== aiming) {
    el.classList.toggle('aiming-ult', aiming);
    _mobaCursorDomCache.aiming = aiming;
  }
  const pressing = !!(state.mobaRightMouseDown || mouseButtonsDown['Mouse0']);
  if (_mobaCursorDomCache.pressing !== pressing) {
    el.classList.toggle('pressing', pressing);
    _mobaCursorDomCache.pressing = pressing;
  }
}

export function lockPointerIfPlaying(forceEvenIfModalClosing = false) {
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
    wasPointerLockedInPlay = true;
    document.body.classList.add('play-cursor-hidden');
    updateMobaVirtualCursorUI();
    return;
  }

  try {
    window.focus();
  } catch (_) {}
  try {
    if (renderer.domElement && typeof renderer.domElement.focus === 'function') {
      renderer.domElement.focus({ preventScroll: true });
    }
  } catch (_) {}

  const notifyIfIframeBlocked = () => {
    document.body.classList.remove('play-cursor-hidden');
    updateMobaVirtualCursorUI();
    if (window.self !== window.top && !warnedIframeLockInRound && (forceEvenIfModalClosing || !isMenuOpen())) {
      warnedIframeLockInRound = true;
      showToast(
        '⚠️ Le verrouillage souris est bloqué dans ce cadre — passez en <strong>Plein écran (F)</strong> ou ouvrez le jeu directement.',
        4500
      );
    }
  };

  try {
    const lockPromise = renderer.domElement.requestPointerLock();
    if (isPointerLocked()) {
      wasPointerLockedInPlay = true;
      document.body.classList.add('play-cursor-hidden');
      updateMobaVirtualCursorUI();
    }
    if (lockPromise && typeof lockPromise.then === 'function') {
      lockPromise
        .then(() => {
          const stillAllowed = state.cameraMode === 'tps' || isMobaCursorLockActive();
          if (!stillAllowed || (state.mode === 'practice' && state.practiceCursorFree) || isMenuOpen()) {
            if (isPointerLocked()) unlockPointer();
            document.body.classList.remove('play-cursor-hidden');
            updateMobaVirtualCursorUI();
            return;
          }
          if ((forceEvenIfModalClosing || !isMenuOpen()) && isPointerLocked()) {
            wasPointerLockedInPlay = true;
            document.body.classList.add('play-cursor-hidden');
            if (isMobaCursorLockActive()) {
              const vw = Math.max(1, window.innerWidth || 1280);
              const vh = Math.max(1, window.innerHeight || 720);
              if (typeof state.mouseClientX !== 'number') state.mouseClientX = vw * 0.5;
              if (typeof state.mouseClientY !== 'number') state.mouseClientY = vh * 0.5;
            }
            updateMobaVirtualCursorUI();
          }
        })
        .catch(notifyIfIframeBlocked);
    }
  } catch (_) {
    notifyIfIframeBlocked();
  }
}

export function unlockPointer() {
  wasPointerLockedInPlay = false;
  programmaticPointerUnlockUntil = performance.now() + 260;
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
    } catch (_) {}
  }
  lastMouseX = null;
  lastMouseY = null;
  updateMobaVirtualCursorUI();
}

// --- RAYCAST & CONTRÔLES MOBA (VUE AÉRIENNE) ---
let mobaRaycaster = null;
let mobaPointerNDC = null;
let mobaTmpVec = null;
let mobaMoveMarker = null;
let mobaMoveMarkerRing = null;
let mobaMoveMarkerDot = null;
let mobaMoveMarkerPulse = 0;
let _markerUpVec = null;
let _markerNormVec = null;

function ensureMobaMoveMarker() {
  if (mobaMoveMarker) return mobaMoveMarker;
  _markerUpVec = new THREE.Vector3(0, 1, 0);
  _markerNormVec = new THREE.Vector3(0, 1, 0);
  mobaMoveMarker = new THREE.Group();
  mobaMoveMarkerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.88, 28),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5
    })
  );
  mobaMoveMarkerRing.rotation.x = -Math.PI / 2;
  mobaMoveMarkerRing.renderOrder = 24;
  mobaMoveMarker.add(mobaMoveMarkerRing);

  mobaMoveMarkerDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 18),
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5
    })
  );
  mobaMoveMarkerDot.rotation.x = -Math.PI / 2;
  mobaMoveMarkerDot.position.y = 0.025;
  mobaMoveMarkerDot.renderOrder = 25;
  mobaMoveMarker.add(mobaMoveMarkerDot);
  mobaMoveMarker.visible = false;
  scene.add(mobaMoveMarker);
  return mobaMoveMarker;
}

function showMobaMoveMarker(wx, wz, onCanopy = false) {
  const marker = ensureMobaMoveMarker();
  if (onCanopy && CANOPY_SPEC.hasCanopy) {
    const canopyY = getCanopySurfaceY(wx, wz);
    const wy = (canopyY !== null ? canopyY : CANOPY_SPEC.deckY) + 0.16;
    marker.quaternion.identity();
    marker.position.set(wx, wy, wz);
  } else {
    const wy = getTerrainY(wx, wz) + 0.22;
    const eps = 0.45;
    const hL = getTerrainY(wx - eps, wz);
    const hR = getTerrainY(wx + eps, wz);
    const hD = getTerrainY(wx, wz - eps);
    const hU = getTerrainY(wx, wz + eps);
    _markerNormVec.set(hL - hR, 2 * eps, hD - hU).normalize();
    marker.quaternion.setFromUnitVectors(_markerUpVec, _markerNormVec);
    marker.position.set(wx, wy, wz);
  }
  marker.visible = true;
  mobaMoveMarkerPulse = 1.0;
}

function applyMobaMoveCommand(hit, immediate = true) {
  if (!hit) return null;
  const onCanopy = !!hit.onCanopy;
  const validGoal = ctx.api.setMobaMoveGoal
    ? ctx.api.setMobaMoveGoal(hit, { immediate, onCanopy })
    : { x: hit.x, z: hit.z, onCanopy };
  if (validGoal && Number.isFinite(validGoal.x) && Number.isFinite(validGoal.z)) {
    showMobaMoveMarker(validGoal.x, validGoal.z, !!validGoal.onCanopy);
    return validGoal;
  }
  return null;
}

export function raycastScreenToWorld(clientX, clientY) {
  if (!renderer || !renderer.domElement || typeof clientX !== 'number' || typeof clientY !== 'number') {
    return null;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect || !rect.width || !rect.height) return null;
  mobaPointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mobaPointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  mobaRaycaster.setFromCamera(mobaPointerNDC, camera);
  const ray = mobaRaycaster.ray;
  if (Math.abs(ray.direction.y) < 0.02 && ray.direction.y >= 0) return null;

  const maxX = FIELD.width / 2 - 0.5;
  const maxZ = FIELD.depth / 2 - 0.5;
  const controlled = getPlayer(state.myTeam, state.controlledRole);

  // Si la joueuse contrôlée est sur la canopée, tester d'abord le plan deckY ;
  // retomber au sol (y = 0) si le point ne se trouve pas sur une surface canopée.
  if (controlled && controlled.onCanopy && CANOPY_SPEC.hasCanopy && Math.abs(ray.direction.y) >= 0.001) {
    const deckY = CANOPY_SPEC.deckY;
    const tCanopy = (deckY - ray.origin.y) / ray.direction.y;
    if (tCanopy > 0 && tCanopy <= 380) {
      const cx = ray.origin.x + ray.direction.x * tCanopy;
      const cz = ray.origin.z + ray.direction.z * tCanopy;
      if (Number.isFinite(cx) && Number.isFinite(cz)) {
        const canopySurfaceY = getCanopySurfaceY(cx, cz);
        if (canopySurfaceY !== null) {
          return {
            x: Math.max(-maxX, Math.min(maxX, cx)),
            y: canopySurfaceY,
            z: Math.max(-maxZ, Math.min(maxZ, cz)),
            onCanopy: true
          };
        }
      }
    }
  }

  let hitX = null;
  let hitY = 0;
  let hitZ = null;

  if (state.mapId === 'mont-royal' || state.mapId === 'lafontaine' || state.mapId === 'saint-viateur') {
    // Marche le long du rayon + recherche binaire pour épouser le relief (colline du Mont-Royal / pont)
    let prevT = 4;
    let foundBracket = false;
    for (let t = 5; t <= 280; t += 2.0) {
      const px = ray.origin.x + ray.direction.x * t;
      const py = ray.origin.y + ray.direction.y * t;
      const pz = ray.origin.z + ray.direction.z * t;
      if (py <= getTerrainY(px, pz)) {
        let lo = prevT;
        let hi = t;
        for (let it = 0; it < 10; it++) {
          const mid = (lo + hi) * 0.5;
          const mx = ray.origin.x + ray.direction.x * mid;
          const my = ray.origin.y + ray.direction.y * mid;
          const mz = ray.origin.z + ray.direction.z * mid;
          if (my <= getTerrainY(mx, mz)) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        const finalT = (lo + hi) * 0.5;
        hitX = ray.origin.x + ray.direction.x * finalT;
        hitZ = ray.origin.z + ray.direction.z * finalT;
        hitY = getTerrainY(hitX, hitZ);
        foundBracket = true;
        break;
      }
      prevT = t;
    }
    if (!foundBracket) return null;
  } else {
    if (Math.abs(ray.direction.y) < 0.001) return null;
    const t = (0 - ray.origin.y) / ray.direction.y;
    if (t <= 0 || t > 380) return null;
    hitX = ray.origin.x + ray.direction.x * t;
    hitZ = ray.origin.z + ray.direction.z * t;
    hitY = 0;
  }

  if (hitX === null || hitZ === null || !Number.isFinite(hitX) || !Number.isFinite(hitZ)) {
    return null;
  }
  hitX = Math.max(-maxX, Math.min(maxX, hitX));
  hitZ = Math.max(-maxZ, Math.min(maxZ, hitZ));
  return { x: hitX, y: hitY, z: hitZ, onCanopy: false };
}

function pickAlliedPlayerNearClick(clientX, clientY, worldHit) {
  let bestRole = null;
  let bestScore = Infinity;
  const rect =
    renderer && renderer.domElement ? renderer.domElement.getBoundingClientRect() : null;
  ['G', 'C', 'D'].forEach((role) => {
    const p = getPlayer(state.myTeam, role);
    if (!p) return;
    if (worldHit) {
      const d3 = Math.hypot(p.pos.x - worldHit.x, p.pos.z - worldHit.z);
      if (d3 < 3.2 && d3 < bestScore) {
        bestScore = d3;
        bestRole = role;
      }
    }
    if (rect && rect.width && rect.height && typeof clientX === 'number') {
      mobaTmpVec.set(p.pos.x, p.pos.y + 1.2, p.pos.z).project(camera);
      if (mobaTmpVec.z >= -1 && mobaTmpVec.z <= 1) {
        const sx = rect.left + (mobaTmpVec.x * 0.5 + 0.5) * rect.width;
        const sy = rect.top + (-mobaTmpVec.y * 0.5 + 0.5) * rect.height;
        const pxDist = Math.hypot(sx - clientX, sy - clientY);
        if (pxDist < 34 && pxDist * 0.05 < bestScore) {
          bestScore = pxDist * 0.05;
          bestRole = role;
        }
      }
    }
  });
  return bestRole;
}

function updateControlsHelpForCameraMode() {
  const titleEl = document.getElementById('controls-help-title');
  const bodyEl = document.getElementById('controls-help-body');
  const recenterTxt = formatActionKbdHtml('recenterCam');
  const camLockTxt = formatActionKbdHtml('toggleCamLock');
  const mobaMoveTxt = formatActionKbdHtml('mobaMove');
  const dashTxt = formatActionKbdHtml('dash');
  const actionTxt = formatActionKbdHtml('action');
  const jumpTxt = formatActionKbdHtml('jump');
  const ultTxt = formatActionKbdHtml('ultimate');
  const ultConfirmTxt = formatActionKbdHtml('ultConfirm');
  const toggleCamTxt = formatActionKbdHtml('toggleCam');
  const minimapTxt = `${formatActionKbdHtml('minimapSize')} / ${formatActionKbdHtml('minimapVision')}`;
  const fsTxt = formatActionKbdHtml('fullscreen');
  const rolesTxt = `${formatActionKbdHtml('roleG')} ${formatActionKbdHtml('roleC')} ${formatActionKbdHtml('roleD')} / ${formatActionKbdHtml('cycleRoleNext')}`;
  const ultLine = state.vanillaMode
    ? ''
    : `• ${ultTxt} puis ${ultConfirmTxt} : Viser &amp; lancer l’<strong>Ultimate</strong> (Ronde 2+)<br>`;
  const actionLabel = state.vanillaMode
    ? 'Passe (si débloquée) / Se relever'
    : 'Passe / Outil / Se relever';

  if (state.cameraMode === 'aerial') {
    if (titleEl) titleEl.textContent = 'Contrôles MOBA (Vue Aérienne)';
    if (bodyEl) {
      bodyEl.innerHTML =
        `• ${mobaMoveTxt} (clic ou maintenu) : Déplacement au curseur<br>` +
        `• <strong>Bords d’écran / Flèches / Minimap</strong> : Caméra libre • ${camLockTxt} : Verrouiller • ${recenterTxt} : Recentrer<br>` +
        ultLine +
        `• ${dashTxt} : Dash (vers curseur) • ${actionTxt} : ${actionLabel} • ${jumpTxt} : Saut<br>` +
        `• <kbd>Clic Gauche</kbd> / ${rolesTxt} : Changer G/C/D • ${toggleCamTxt} : TPS • ${minimapTxt} : Minimap • ${fsTxt} : Plein écran`;
    }
  } else {
    const fwdTxt = formatActionKbdHtml('moveForward');
    const bwdTxt = formatActionKbdHtml('moveBackward');
    const leftTxt = formatActionKbdHtml('moveLeft');
    const rightTxt = formatActionKbdHtml('moveRight');
    if (titleEl) titleEl.textContent = 'Contrôles (TPS 3e Personne)';
    if (bodyEl) {
      bodyEl.innerHTML =
        `• ${fwdTxt} ${leftTxt} ${bwdTxt} ${rightTxt} : Déplacer • <kbd>Souris</kbd> : Viser (caméra)<br>` +
        ultLine +
        `• ${actionTxt} : ${actionLabel} • ${dashTxt} : Dash • ${jumpTxt} : Saut<br>` +
        `• <kbd>Clic G / D</kbd> / ${rolesTxt} : Changer de joueuse (G / C / D)<br>` +
        `• ${toggleCamTxt} : Caméra (TPS / MOBA) • ${minimapTxt} : Minimap • ${fsTxt} : Plein écran`;
    }
  }
}

export function setCameraMode(mode, silent = false) {
  const normalized = mode === 'aerial' || mode === 'camp' ? 'aerial' : 'tps';
  state.cameraMode = normalized;
  state.mobaRightMouseDown = false;
  document.body.classList.toggle('moba-mode', normalized === 'aerial');

  const mapMeta = getActiveMapMeta();
  if (scene.fog) {
    scene.fog.density = normalized === 'aerial' ? 0 : (mapMeta.fogDensity || 0.0022);
  }
  const targetNear = normalized === 'aerial' ? 2.5 : 0.45;
  if (camera.near !== targetNear) {
    camera.near = targetNear;
    camera.far = 520;
    camera.updateProjectionMatrix();
  }

  const btnToggleCam = document.getElementById('btn-toggle-cam');
  if (btnToggleCam) {
    btnToggleCam.textContent =
      normalized === 'tps' ? '🎥 Vue : 3e Personne (TPS)' : '🎥 Vue : Aérienne (MOBA)';
  }
  updateControlsHelpForCameraMode();

  if (normalized === 'aerial') {
    if (typeof state.mouseClientX !== 'number' || typeof state.mouseClientY !== 'number') {
      state.mouseClientX = (window.innerWidth || 1280) * 0.5;
      state.mouseClientY = (window.innerHeight || 720) * 0.5;
    }
    if (isMobaCursorLockActive() && !isMenuOpen() && !(state.mode === 'practice' && state.practiceCursorFree)) {
      lockPointerIfPlaying();
    } else {
      unlockPointer();
      setTimeout(() => {
        if (state.cameraMode === 'aerial' && !isMobaCursorLockActive()) unlockPointer();
      }, 30);
    }
    recenterMobaCamera(true);
    if (typeof state.mouseClientX === 'number' && typeof state.mouseClientY === 'number') {
      state.mobaAimWorld = raycastScreenToWorld(state.mouseClientX, state.mouseClientY);
    }
    updateMobaVirtualCursorUI();
    if (state.mode === 'tutorial' && state.tutorialStep === 5) {
      ctx.api.markTutorialCheck('mobaToggled');
    }
    if (!silent) {
      const recenterLbl = escapeHtml(formatActionBindingText('recenterCam'));
      const lockLbl = escapeHtml(formatActionBindingText('toggleCamLock'));
      const moveLbl = escapeHtml(formatActionBindingText('mobaMove'));
      showToast(
        `🛰️ Mode <strong>Aérien MOBA</strong> : ${moveLbl} pour bouger • ${lockLbl} verrouiller • ${recenterLbl} recentrer !`,
        2600
      );
    }
  } else {
    state.mobaMoveTarget = null;
    if (mobaMoveMarker) mobaMoveMarker.visible = false;
    const p = getPlayer(state.myTeam, state.controlledRole);
    if (p) {
      state.camYaw = p.facingAngle + Math.PI;
    }
    if (!isMenuOpen()) {
      lockPointerIfPlaying();
    }
    if (!silent) {
      showToast('🎥 Mode <strong>3e Personne (TPS)</strong> activé !', 1800);
    }
  }
  if (typeof updateMobileTouchHUD === 'function') {
    updateMobileTouchHUD();
  }
  if (!silent) ctx.api.playSfx?.('cam_toggle', { mode: normalized });
}

export function toggleCameraMode() {
  setCameraMode(state.cameraMode === 'tps' ? 'aerial' : 'tps');
}

export function toggleMobaCamLock() {
  state.mobaCamLocked = !state.mobaCamLocked;
  if (state.mobaCamLocked) {
    recenterMobaCamera(false);
  }
  updateMobileTouchHUD();
  showToast(
    state.mobaCamLocked
      ? '🔒 <strong>Caméra MOBA verrouillée</strong> sur votre joueuse !'
      : '🔓 <strong>Caméra MOBA libre</strong> !',
    1500
  );
}

// --- MODE LOW SPEC & MODE MOBILE / ÉCRAN RESTREINT ---
export const mobileInput = {
  joyPointerId: null,
  joyTouchId: null,
  joyMouseDown: false,
  joyForward: 0,
  joyRight: 0,
  camPointerId: null,
  camX: 0,
  camY: 0,
  camRight: 0,
  camForward: 0,
  aimAction: null,
  aimPointerId: null,
  aimMode: 'idle',
  aimStartX: 0,
  aimStartY: 0,
  aimCenterX: 0,
  aimCenterY: 0,
  aimStartMs: 0,
  aimNx: 0,
  aimNy: 0,
  aimLen: 0,
  aimAngle: null,
  aimBtnRadius: 0,
  aimLeftButton: false,
  aimCancelled: false,
  aimHoldTimer: null
};

const AIM_DRAG_THRESHOLD_PX = 14;
const AIM_HOLD_DELAY_MS = 160;
const AIM_MAX_RADIUS_PX = 46;

export function detectDefaultMobileDevice() {
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const maxTouch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
  const smallViewport = (window.innerWidth || 1280) <= 900 || (window.innerHeight || 720) <= 540;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobi/i.test(ua) || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  return mobileUa || ((coarse || maxTouch) && smallViewport);
}

function stickToWorldAngle(nx, ny) {
  const refYaw = state.cameraMode === 'aerial' ? 0 : state.camYaw;
  const fwdX = -Math.sin(refYaw);
  const fwdZ = -Math.cos(refYaw);
  const rightX = -fwdZ;
  const rightZ = fwdX;
  return Math.atan2(fwdX * ny + rightX * nx, fwdZ * ny + rightZ * nx);
}

function getDefaultMobileForwardAngle(p) {
  const joyLen = Math.hypot(mobileInput.joyRight || 0, mobileInput.joyForward || 0);
  if (joyLen > 0.15) {
    return stickToWorldAngle(mobileInput.joyRight / joyLen, mobileInput.joyForward / joyLen);
  }
  if (state.cameraMode === 'tps') {
    return Math.atan2(-Math.sin(state.camYaw), -Math.cos(state.camYaw));
  }
  return p ? p.facingAngle || 0 : 0;
}

function isEnemyValidMobileAutoAimTarget(p, enemy, maxDist) {
  if (!p || !enemy || enemy.team === p.team || enemy.id === p.id) return false;
  if (enemy.tutorialHidden || enemy.state !== 'standing') return false;
  if (Boolean(enemy.onCanopy) !== Boolean(p.onCanopy)) return false;
  if (Math.abs((enemy.pos.y || 0) - (p.pos.y || 0)) > 2.35) return false;
  const inStealthBush =
    !!isPointInJungleBush(enemy.pos) &&
    !hasAllyVisionNear(enemy.pos, VISION_SPEC.bushSpotRange, state.myTeam);
  if (inStealthBush) return false;
  if (enemy.mesh && enemy.mesh.root && enemy.mesh.root.visible === false) return false;
  if (enemy.visibleTo && enemy.visibleTo[state.myTeam] === false) return false;
  const dist = Math.hypot(enemy.pos.x - p.pos.x, enemy.pos.z - p.pos.z);
  return dist >= 0.05 && dist <= maxDist;
}

export function computeMobileAutoAimAngle(actionType, p = null) {
  const actor = p || getPlayer(state.myTeam, state.controlledRole);
  if (!actor) return 0;

  if (actionType === 'ult') {
    if (actor.color === 'red' || actor.color === 'blue') {
      const maxRange = actor.color === 'red' ? 58.0 : 42.0;
      let bestEnemy = null;
      let bestScore = Infinity;
      for (let i = 0; i < players.length; i++) {
        const e = players[i];
        if (!isEnemyValidMobileAutoAimTarget(actor, e, maxRange)) continue;
        const dist = Math.hypot(e.pos.x - actor.pos.x, e.pos.z - actor.pos.z);
        const losBonus = hasClearLineOfSight(actor.pos, e.pos, false) ? -6.0 : 0;
        const ballBonus = e.carryingBall ? -10.0 : 0;
        const score = dist + losBonus + ballBonus;
        if (score < bestScore) {
          bestScore = score;
          bestEnemy = e;
        }
      }
      if (bestEnemy) {
        return Math.atan2(bestEnemy.pos.x - actor.pos.x, bestEnemy.pos.z - actor.pos.z);
      }
      return getDefaultMobileForwardAngle(actor);
    }

    // Feuille (sprint + mur) : priorité au stick de mouvement, sinon ballon libre de sa couleur
    const joyLen = Math.hypot(mobileInput.joyRight || 0, mobileInput.joyForward || 0);
    if (joyLen > 0.15) {
      return stickToWorldAngle(mobileInput.joyRight / joyLen, mobileInput.joyForward / joyLen);
    }
    let bestBall = null;
    let bestBallDist = 36.0;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b || b.tutorialHidden || b.state !== 'ground' || b.color !== actor.color) continue;
      if (Boolean(b.onCanopy) !== Boolean(actor.onCanopy)) continue;
      const d = Math.hypot(b.pos.x - actor.pos.x, b.pos.z - actor.pos.z);
      if (d < bestBallDist && d > 0.1) {
        bestBallDist = d;
        bestBall = b;
      }
    }
    if (bestBall) {
      return Math.atan2(bestBall.pos.x - actor.pos.x, bestBall.pos.z - actor.pos.z);
    }
    return getDefaultMobileForwardAngle(actor);
  }

  if (actionType === 'dash') {
    const joyLen = Math.hypot(mobileInput.joyRight || 0, mobileInput.joyForward || 0);
    if (joyLen > 0.15) {
      return stickToWorldAngle(mobileInput.joyRight / joyLen, mobileInput.joyForward / joyLen);
    }
    const dashKind = state.teams[actor.team]?.powers?.[actor.role]?.dashEvo || null;
    const teamMult = state.teams[actor.team]?.teamDashPlus ? 1.35 : 1.0;
    const baseDist =
      dashKind === 'bounce'
        ? 12.15
        : dashKind === 'slide'
          ? 18.22
          : dashKind === 'boomerang'
            ? 9.11
            : 6.08;
    const dashRange = baseDist * teamMult;

    let bestBall = null;
    let bestBallDist = dashRange * 2.2;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b || b.tutorialHidden || b.state !== 'ground' || b.color !== actor.color) continue;
      if (Boolean(b.onCanopy) !== Boolean(actor.onCanopy)) continue;
      const d = Math.hypot(b.pos.x - actor.pos.x, b.pos.z - actor.pos.z);
      if (d < bestBallDist && d > 0.1) {
        bestBallDist = d;
        bestBall = b;
      }
    }
    if (bestBall) {
      return Math.atan2(bestBall.pos.x - actor.pos.x, bestBall.pos.z - actor.pos.z);
    }

    const beatsColor = COLORS[actor.color]?.beats;
    let bestEnemy = null;
    let bestEnemyDist = dashRange * 1.8;
    for (let i = 0; i < players.length; i++) {
      const e = players[i];
      if (!isEnemyValidMobileAutoAimTarget(actor, e, bestEnemyDist)) continue;
      const isRevealed = !!(e.backRevealed || (e.revealedTo && e.revealedTo[state.myTeam]));
      if (!isRevealed || e.color !== beatsColor) continue;
      const d = Math.hypot(e.pos.x - actor.pos.x, e.pos.z - actor.pos.z);
      if (d < bestEnemyDist) {
        bestEnemyDist = d;
        bestEnemy = e;
      }
    }
    if (bestEnemy) {
      return Math.atan2(bestEnemy.pos.x - actor.pos.x, bestEnemy.pos.z - actor.pos.z);
    }
    return getDefaultMobileForwardAngle(actor);
  }

  if (actionType === 'action') {
    if (actor.carryingBall) {
      const fwdAngle = getDefaultMobileForwardAngle(actor);
      const goalX = actor.team === 'ally' ? FIELD.enemyGoalX : FIELD.allyGoalX;
      const goalZ = (actor.team === 'ally' ? FIELD.enemyGoalZ : FIELD.allyGoalZ) || 0;
      const gx = goalX - actor.pos.x;
      const gz = goalZ - actor.pos.z;
      const distToGoal = Math.hypot(gx, gz);
      if (!actor.onCanopy && distToGoal > 0.1 && distToGoal <= 18.0) {
        const fwdX = Math.sin(fwdAngle);
        const fwdZ = Math.cos(fwdAngle);
        const goalDot = (gx / distToGoal) * fwdX + (gz / distToGoal) * fwdZ;
        const snapMinCos = Math.cos(getPassSnapHalfAngle(true));
        const joyLen = Math.hypot(mobileInput.joyRight || 0, mobileInput.joyForward || 0);
        const standingStill = joyLen <= 0.15;
        if (goalDot >= snapMinCos || (standingStill && goalDot >= 0.35)) {
          return Math.atan2(gx, gz);
        }
      }
      return fwdAngle;
    }

    const toolKey = state.teams[actor.team]?.powers?.[actor.role]?.toolEvo || null;
    if (toolKey === 'wall') {
      let bestEnemy = null;
      let bestDist = 15.0;
      for (let i = 0; i < players.length; i++) {
        const e = players[i];
        if (!isEnemyValidMobileAutoAimTarget(actor, e, bestDist)) continue;
        const d = Math.hypot(e.pos.x - actor.pos.x, e.pos.z - actor.pos.z);
        if (d < bestDist) {
          bestDist = d;
          bestEnemy = e;
        }
      }
      if (bestEnemy) {
        return Math.atan2(bestEnemy.pos.x - actor.pos.x, bestEnemy.pos.z - actor.pos.z);
      }
    }
    return getDefaultMobileForwardAngle(actor);
  }

  return getDefaultMobileForwardAngle(actor);
}

export function getMobileAimOverride(actionType = null) {
  if (!state.mobileMode || !mobileInput.aimAction) return null;
  if (actionType && mobileInput.aimAction !== actionType) return null;
  if (typeof mobileInput.aimAngle === 'number' && Number.isFinite(mobileInput.aimAngle)) {
    return mobileInput.aimAngle;
  }
  return null;
}

export function isMobileAimCancelled() {
  return !!(state.mobileMode && mobileInput.aimAction && mobileInput.aimCancelled);
}

function clearMobileAimState(cancelActivePreviews = false) {
  if (mobileInput.aimHoldTimer) {
    clearTimeout(mobileInput.aimHoldTimer);
    mobileInput.aimHoldTimer = null;
  }
  const prevAction = mobileInput.aimAction;
  mobileInput.aimAction = null;
  mobileInput.aimPointerId = null;
  mobileInput.aimMode = 'idle';
  mobileInput.aimNx = 0;
  mobileInput.aimNy = 0;
  mobileInput.aimLen = 0;
  mobileInput.aimAngle = null;
  mobileInput.aimBtnRadius = 0;
  mobileInput.aimLeftButton = false;
  mobileInput.aimCancelled = false;

  const ringEl = document.getElementById('mob-aim-ring');
  const knobEl = document.getElementById('mob-aim-knob');
  if (ringEl) {
    ringEl.classList.add('hidden');
    ringEl.classList.remove('cancel-armed');
  }
  if (knobEl) {
    knobEl.style.transform = 'translate(0px, 0px)';
  }
  ['mob-btn-action', 'mob-btn-dash', 'mob-btn-ult'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('aiming', 'aim-cancel-target', 'cancel-armed');
  });

  ctx.api.updateMobileActionAimPreview3D?.(null);

  if (cancelActivePreviews) {
    if (prevAction === 'ult' && state.ultPreviewActive) {
      cancelUltimatePreview(false);
    }
    if (prevAction === 'action' && state.passCharge && state.passCharge.active) {
      ctx.api.cancelPassCharge?.();
    }
  }
}

function syncMobileAimPreview3D() {
  if (!state.mobileMode || mobileInput.aimMode !== 'aiming' || !mobileInput.aimAction) {
    ctx.api.updateMobileActionAimPreview3D?.(null);
    return;
  }
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!p || state.phase !== 'play' || isMenuOpen()) {
    clearMobileAimState(true);
    return;
  }

  const action = mobileInput.aimAction;
  if (action === 'ult' && !canPlayerUseUltimate(p, false)) {
    clearMobileAimState(true);
    return;
  }
  if (action === 'dash' && (p.state !== 'standing' || p.carryingBall)) {
    clearMobileAimState(true);
    return;
  }
  if (action === 'action' && p.state !== 'standing') {
    clearMobileAimState(true);
    return;
  }

  if (!mobileInput.aimLeftButton) {
    mobileInput.aimAngle = computeMobileAutoAimAngle(action, p);
  }
  const angle = Number.isFinite(mobileInput.aimAngle)
    ? mobileInput.aimAngle
    : computeMobileAutoAimAngle(action, p);
  mobileInput.aimAngle = angle;

  const cancelled = !!mobileInput.aimCancelled;
  if (!cancelled) {
    p.facingAngle = angle;
  }
  const onCanopy = !!p.onCanopy;

  if (action === 'ult') {
    state.ultPreviewAimAngle = angle;
    if (cancelled) {
      state.ultPreviewActive = false;
      hideUltimatePreview();
      ctx.api.updateMobileActionAimPreview3D?.('ult', angle, p.pos, {
        cancelled: true,
        onCanopy,
        range: 12.0
      });
    } else {
      state.ultPreviewActive = true;
      ctx.api.updateMobileActionAimPreview3D?.(null);
    }
    return;
  }

  if (action === 'dash') {
    const dashKind = state.teams[p.team]?.powers?.[p.role]?.dashEvo || null;
    const teamMult = state.teams[p.team]?.teamDashPlus ? 1.35 : 1.0;
    const baseDist =
      dashKind === 'bounce'
        ? 12.15
        : dashKind === 'slide'
          ? 18.22
          : dashKind === 'boomerang'
            ? 9.11
            : 6.08;
    ctx.api.updateMobileActionAimPreview3D?.('dash', angle, p.pos, {
      cancelled,
      onCanopy,
      dashKind,
      range: baseDist * teamMult
    });
    return;
  }

  if (action === 'action') {
    if (p.carryingBall) {
      if (state.passCharge && state.passCharge.active) {
        ctx.api.updateMobileActionAimPreview3D?.(null);
      } else {
        ctx.api.updateMobileActionAimPreview3D?.('pass', angle, p.pos, {
          cancelled,
          onCanopy,
          range: 16.0
        });
      }
    } else {
      const toolKey = state.teams[p.team]?.powers?.[p.role]?.toolEvo || null;
      ctx.api.updateMobileActionAimPreview3D?.('tool', angle, p.pos, {
        cancelled,
        onCanopy,
        toolKey,
        range: toolKey === 'beacon' ? 2.5 : 2.2
      });
    }
  }
}

function resetMobileInput() {
  mobileInput.joyPointerId = null;
  mobileInput.joyTouchId = null;
  mobileInput.joyMouseDown = false;
  mobileInput.joyForward = 0;
  mobileInput.joyRight = 0;
  mobileInput.camPointerId = null;
  mobileInput.camX = 0;
  mobileInput.camY = 0;
  mobileInput.camRight = 0;
  mobileInput.camForward = 0;
  const stick = document.getElementById('mobile-joystick-stick');
  if (stick) stick.style.transform = 'translate(0px, 0px)';
  const camStick = document.getElementById('mobile-cam-stick');
  if (camStick) camStick.style.transform = 'translate(0px, 0px)';
  clearMobileAimState(true);
}

function updateDeviceToggleButtonsUI() {
  const btnLow = document.getElementById('btn-toggle-low-spec');
  if (btnLow) {
    btnLow.textContent = state.lowSpecMode ? '⚡ Low Spec : ON' : '⚡ Low Spec : OFF';
    btnLow.classList.toggle('active-mode-pill', !!state.lowSpecMode);
  }
  const btnMob = document.getElementById('btn-toggle-mobile-mode');
  if (btnMob) {
    btnMob.textContent = state.mobileMode ? '📱 Mode Mobile : ON' : '📱 Mode Mobile : OFF';
    btnMob.classList.toggle('active-mode-pill', !!state.mobileMode);
  }
}

export function setLowSpecMode(enabled, opts = {}) {
  const on = !!enabled;
  state.lowSpecMode = on;
  document.body.classList.toggle('low-spec-mode', on);

  renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  syncViewportSize();

  const shadowsWanted = !on;
  if (renderer.shadowMap.enabled !== shadowsWanted || sunLight.castShadow !== shadowsWanted) {
    renderer.shadowMap.enabled = shadowsWanted;
    renderer.shadowMap.autoUpdate = shadowsWanted;
    renderer.shadowMap.needsUpdate = true;
    sunLight.castShadow = shadowsWanted;
    scene.traverse((obj) => {
      if (obj && obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m) m.needsUpdate = true;
        });
      }
    });
  }

  setParticlePoolLimit(on ? 70 : Infinity);
  aerialConeFrameCounter = 0;

  if (!opts.skipSave) {
    try {
      localStorage.setItem('coilball_low_spec', on ? '1' : '0');
    } catch (_) {}
  }
  updateDeviceToggleButtonsUI();
  if (!opts.silent) {
    showToast(
      on
        ? '⚡ Mode <strong>Low Spec activé</strong> : ombres coupées, 60 FPS max et effets allégés.'
        : '✨ Mode <strong>Qualité standard</strong> rétabli.',
      2000
    );
  }
}

export function setMobileMode(enabled, opts = {}) {
  const on = !!enabled;
  state.mobileMode = on;
  document.body.classList.toggle('mobile-mode', on);
  resetMobileInput();

  state.hudLeftCollapsed = on;
  const rosterPanel = document.getElementById('roster-panel');
  const leftBody = document.getElementById('hud-left-body');
  const btnCollapse = document.getElementById('btn-hud-collapse-left');
  if (rosterPanel) rosterPanel.classList.toggle('hud-collapsed', on);
  if (leftBody) leftBody.classList.toggle('hidden', on);
  if (btnCollapse) btnCollapse.textContent = on ? '▸' : '▾';

  if (on) {
    document.body.classList.remove('play-cursor-hidden');
    if (isPointerLocked()) unlockPointer();
    if (!opts.keepCamera) {
      setCameraMode('tps', true);
    }
  }

  if (!opts.skipSave) {
    try {
      localStorage.setItem('coilball_mobile_mode', on ? '1' : '0');
    } catch (_) {}
  }
  updateDeviceToggleButtonsUI();
  updateMobileTouchHUD();
  syncViewportSize();
  if (!opts.silent) {
    showToast(
      on
        ? '📱 <strong>Mode Mobile activé</strong> : contrôles tactiles prêts (vue TPS par défaut).'
        : '🖥️ <strong>Mode Bureau</strong> rétabli.',
      2000
    );
  }
}

export function updateMobileTouchHUD() {
  const root = document.getElementById('mobile-touch-controls');
  if (!root) return;
  const visible = !!(state.mobileMode && state.phase === 'play' && !isMenuOpen());
  root.classList.toggle('hidden', !visible);
  if (!visible) {
    if (
      mobileInput.joyPointerId !== null ||
      mobileInput.joyTouchId !== null ||
      mobileInput.joyMouseDown ||
      mobileInput.camPointerId !== null ||
      mobileInput.aimAction !== null
    ) {
      resetMobileInput();
    }
    return;
  }

  const camBtn = document.getElementById('mob-btn-cam');
  if (camBtn) {
    camBtn.textContent = state.cameraMode === 'aerial' ? '🦅 MOBA' : '🎥 TPS';
  }

  const recenterBtn = document.getElementById('mob-btn-recenter');
  if (recenterBtn) {
    recenterBtn.classList.toggle('hidden', state.cameraMode !== 'aerial');
    recenterBtn.textContent = state.mobaCamLocked ? '🔒 Centré' : '🎯 Centrer';
    recenterBtn.classList.toggle('active-mode-pill', !!state.mobaCamLocked);
  }

  const shopBtn = document.getElementById('mob-btn-shop');
  if (shopBtn) {
    const canOpenShop =
      (state.mode === 'tutorial' && state.tutorialStep === 3) || state.mode === 'practice';
    shopBtn.classList.toggle('hidden', !canOpenShop);
  }

  const roleBar = document.getElementById('mobile-role-bar');
  const canSwitchRoles = !state.myLockedRole && ctx.api.isTutorialRoleSwitchAllowed();
  if (roleBar) {
    roleBar.classList.toggle('hidden', !canSwitchRoles);
    if (canSwitchRoles) {
      ['G', 'C', 'D'].forEach((role) => {
        const btn = document.getElementById(`mob-role-${role}`);
        if (!btn) return;
        const cand = getPlayer(state.myTeam, role);
        const blocker = getRoleHumanController(state.myTeam, role);
        btn.classList.toggle('active', state.controlledRole === role);
        btn.disabled = !!(blocker || (cand && cand.tutorialHidden));
      });
    }
  }

  const p = getPlayer(state.myTeam, state.controlledRole);
  if (mobileInput.aimAction && !mobileInput.aimLeftButton && p) {
    mobileInput.aimAngle = computeMobileAutoAimAngle(mobileInput.aimAction, p);
  }
  const teamMeta = (p && state.teams[p.team]) || state.teams[state.myTeam];
  const pwr = (p && teamMeta?.powers?.[p.role]) || {};

  const jumpBtn = document.getElementById('mob-btn-jump');
  if (jumpBtn) {
    const hasTeamJump = !!(teamMeta && teamMeta.teamJump);
    jumpBtn.classList.toggle('hidden', !hasTeamJump);
    if (hasTeamJump) {
      const jumpCd = p && p.jumpCooldown > 0 ? p.jumpCooldown : 0;
      const canJump = !!(p && p.state === 'standing' && !p.isAirborne && jumpCd <= 0);
      jumpBtn.disabled = !canJump;
      jumpBtn.textContent = jumpCd > 0 ? `⏳ ${jumpCd.toFixed(1)}s` : '⬆️ Saut';
    }
  }

  const dashBtn = document.getElementById('mob-btn-dash');
  if (dashBtn) {
    const dashAiming = mobileInput.aimAction === 'dash';
    const dashCancelTarget = dashAiming && mobileInput.aimLeftButton && !mobileInput.aimCancelled;
    const dashCancelArmed = dashAiming && !!mobileInput.aimCancelled;
    dashBtn.classList.toggle('aiming', dashAiming);
    dashBtn.classList.toggle('aim-cancel-target', dashCancelTarget);
    dashBtn.classList.toggle('cancel-armed', dashCancelArmed);

    const dashUnlocked = !!(ctx.api.isDashUnlocked ? ctx.api.isDashUnlocked() : true);
    const boomerangReady = !!(
      p &&
      p.state === 'standing' &&
      !p.carryingBall &&
      p.boomerangWindow > 0 &&
      p.boomerangOrigin
    );
    const dashCd = p && p.dashCooldown > 0 ? p.dashCooldown : 0;
    const canDash =
      dashUnlocked &&
      !!(p && p.state === 'standing' && !p.carryingBall && (boomerangReady || (dashCd <= 0 && (p.dashTimer || 0) <= 0)));
    if (dashCancelArmed) {
      dashBtn.disabled = false;
      dashBtn.textContent = '✖ Annuler';
    } else if (dashCancelTarget) {
      dashBtn.disabled = false;
      dashBtn.textContent = '✖';
    } else {
      dashBtn.disabled = !canDash;
      if (!dashUnlocked) {
        dashBtn.textContent = '🔒 Dash';
      } else if (boomerangReady) {
        dashBtn.textContent = '🪃 Retour';
      } else if (dashCd > 0) {
        dashBtn.textContent = `⏳ ${dashCd.toFixed(1)}s`;
      } else {
        dashBtn.textContent = '💨 Dash';
      }
    }
  }

  const actionBtn = document.getElementById('mob-btn-action');
  if (actionBtn) {
    const actionAiming = mobileInput.aimAction === 'action';
    const actionCancelTarget = actionAiming && mobileInput.aimLeftButton && !mobileInput.aimCancelled;
    const actionCancelArmed = actionAiming && !!mobileInput.aimCancelled;
    actionBtn.classList.toggle('aiming', actionAiming);
    actionBtn.classList.toggle('aim-cancel-target', actionCancelTarget);
    actionBtn.classList.toggle('cancel-armed', actionCancelArmed);

    if (actionCancelArmed) {
      actionBtn.disabled = false;
      actionBtn.textContent = '✖ Annuler';
    } else if (actionCancelTarget) {
      actionBtn.disabled = false;
      actionBtn.textContent = '✖';
    } else if (p && p.state === 'sitting' && pwr.standUp) {
      actionBtn.disabled = false;
      actionBtn.textContent = '⚡ Relever';
    } else if (p && p.state === 'standing' && p.carryingBall) {
      if (!canPlayerPassOrThrow(p)) {
        actionBtn.disabled = true;
        actionBtn.textContent = '🔒 Passe';
      } else {
        actionBtn.disabled = false;
        if (state.passCharge && state.passCharge.active && state.passCharge.targetRole) {
          actionBtn.textContent = `⚽ → ${state.passCharge.targetRole}`;
        } else {
          actionBtn.textContent = '⚽ Passe';
        }
      }
    } else if (!state.vanillaMode && p && p.state === 'standing' && !p.carryingBall && pwr.toolEvo) {
      const toolCd = p.toolCooldown > 0 ? p.toolCooldown : 0;
      const toolLabels = {
        beacon: '📡 Balise',
        wall: '🧱 Mur',
        pad: '⚡ Tapis'
      };
      actionBtn.disabled = toolCd > 0;
      actionBtn.textContent =
        toolCd > 0 ? `⏳ ${toolCd.toFixed(1)}s` : toolLabels[pwr.toolEvo] || '🔧 Outil';
    } else {
      actionBtn.disabled = true;
      actionBtn.textContent = '🖐️ Action';
    }
  }

  const ultBtn = document.getElementById('mob-btn-ult');
  if (ultBtn) {
    ultBtn.classList.toggle('hidden', !!state.vanillaMode);
    if (!state.vanillaMode) {
      const ultAiming = mobileInput.aimAction === 'ult';
      const ultCancelTarget = ultAiming && mobileInput.aimLeftButton && !mobileInput.aimCancelled;
      const ultCancelArmed = ultAiming && !!mobileInput.aimCancelled;
      ultBtn.classList.toggle('aiming', ultAiming);
      ultBtn.classList.toggle('aim-cancel-target', ultCancelTarget);
      ultBtn.classList.toggle('cancel-armed', ultCancelArmed);

      if (ultCancelArmed) {
        ultBtn.disabled = false;
        ultBtn.classList.remove('ult-aiming');
        ultBtn.textContent = '✖ Annuler';
      } else if (ultCancelTarget) {
        ultBtn.disabled = false;
        ultBtn.classList.remove('ult-aiming');
        ultBtn.textContent = '✖';
      } else if (p && canReactivateWaterUlt(p)) {
        ultBtn.disabled = false;
        ultBtn.classList.add('ult-aiming');
        ultBtn.textContent = '🔄 Rappel';
      } else if (ultAiming && mobileInput.aimMode === 'aiming') {
        ultBtn.disabled = false;
        ultBtn.classList.add('ult-aiming');
        ultBtn.textContent = '🎯 Visée';
      } else {
        ultBtn.classList.remove('ult-aiming');
        const ultReady = !!(p && canPlayerUseUltimate(p, false));
        ultBtn.disabled = !ultReady;
        if (!p) {
          ultBtn.textContent = '⚡ Ult';
        } else if (!isUltimateUnlocked()) {
          ultBtn.textContent = '🔒 Ult R2';
        } else if ((p.ultCooldown || 0) > 0) {
          ultBtn.textContent = `⏳ ${p.ultCooldown.toFixed(1)}s`;
        } else if (p.ultUsed) {
          ultBtn.textContent = '⏳ Ult';
        } else {
          const meta = getUltimateMeta(p.color, p);
          ultBtn.textContent = `${meta.icon} Ult`;
        }
      }
    }
  }

  if (mobileInput.aimMode === 'aiming') {
    syncMobileAimPreview3D();
  }
}

function bindMobileTap(el, handler) {
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

function bindWildRiftAimButton(btnEl, actionType) {
  if (!btnEl) return;

  const getRingMetrics = () => {
    const ringSize = Math.round(Math.max(100, mobileInput.aimBtnRadius * 2 + 34));
    const maxKnobR = Math.max(AIM_MAX_RADIUS_PX, Math.round(ringSize * 0.5 - 6));
    return { ringSize, maxKnobR };
  };

  const enterAimingMode = () => {
    if (mobileInput.aimAction !== actionType || mobileInput.aimMode === 'aiming') return;
    mobileInput.aimMode = 'aiming';

    const ringEl = document.getElementById('mob-aim-ring');
    const knobEl = document.getElementById('mob-aim-knob');
    const { ringSize, maxKnobR } = getRingMetrics();
    if (ringEl) {
      ringEl.style.left = `${mobileInput.aimCenterX.toFixed(1)}px`;
      ringEl.style.top = `${mobileInput.aimCenterY.toFixed(1)}px`;
      ringEl.style.width = `${ringSize}px`;
      ringEl.style.height = `${ringSize}px`;
      ringEl.classList.remove('hidden');
      ringEl.classList.toggle('cancel-armed', !!mobileInput.aimCancelled);
    }
    if (knobEl) {
      const kx = mobileInput.aimNx * maxKnobR;
      const ky = -mobileInput.aimNy * maxKnobR;
      knobEl.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
    }

    if (actionType === 'ult') {
      const p = getPlayer(state.myTeam, state.controlledRole);
      if (p && canPlayerUseUltimate(p, false)) {
        state.ultPreviewActive = true;
        state.ultPreviewAimAngle = mobileInput.aimAngle;
        if (state.mode === 'tutorial' && state.tutorialStep === 4) {
          ctx.api.markTutorialCheck?.('ultAimed');
        }
        updateUltHudWidget();
      }
    }
    syncMobileAimPreview3D();
  };

  btnEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (state.phase !== 'play' || isMenuOpen()) return;

    const p = getPlayer(state.myTeam, state.controlledRole);
    if (!p) return;
    const pwr = state.teams[p.team]?.powers?.[p.role] || {};

    // Actions non-directionnelles ou vérifications d'éligibilité immédiates
    if (actionType === 'ult') {
      if (canReactivateWaterUlt(p)) {
        toggleUltimatePreview();
        return;
      }
      if (!canPlayerUseUltimate(p, true)) return;
    } else if (actionType === 'dash') {
      if (ctx.api.isDashUnlocked && !ctx.api.isDashUnlocked()) {
        ctx.api.triggerDash?.();
        return;
      }
      if (p.state !== 'standing') return;
      if (p.carryingBall) {
        ctx.api.triggerDash?.();
        return;
      }
      if (p.boomerangWindow > 0 && p.boomerangOrigin) {
        ctx.api.triggerDash?.();
        return;
      }
      if ((p.dashCooldown || 0) > 0 || (p.dashTimer || 0) > 0) return;
    } else if (actionType === 'action') {
      if (p.state === 'sitting') {
        if (pwr.standUp) {
          ctx.api.handleActionKey?.();
        }
        return;
      }
      if (p.state !== 'standing') return;
      if (p.carryingBall) {
        if (!canPlayerPassOrThrow(p)) {
          ctx.api.handleActionKey?.();
          return;
        }
      } else {
        if (state.vanillaMode || !pwr.toolEvo) return;
        if ((p.toolCooldown || 0) > 0) {
          ctx.api.handleActionKey?.();
          return;
        }
      }
    }

    if (mobileInput.aimAction !== null) {
      clearMobileAimState(true);
    }

    try {
      btnEl.setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = btnEl.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const btnRadius = Math.max(20, Math.min(rect.width, rect.height) * 0.5);

    btnEl.classList.add('aiming');

    mobileInput.aimAction = actionType;
    mobileInput.aimPointerId = e.pointerId;
    mobileInput.aimMode = 'pressed';
    mobileInput.aimStartX = e.clientX;
    mobileInput.aimStartY = e.clientY;
    mobileInput.aimCenterX = cx;
    mobileInput.aimCenterY = cy;
    mobileInput.aimBtnRadius = btnRadius;
    mobileInput.aimLeftButton = false;
    mobileInput.aimStartMs = performance.now();
    mobileInput.aimNx = 0;
    mobileInput.aimNy = 0;
    mobileInput.aimLen = 0;
    mobileInput.aimAngle = computeMobileAutoAimAngle(actionType, p);
    mobileInput.aimCancelled = false;

    if (actionType === 'action' && p.carryingBall) {
      ctx.api.beginPassCharge?.('mobile');
    }

    mobileInput.aimHoldTimer = setTimeout(() => {
      mobileInput.aimHoldTimer = null;
      if (mobileInput.aimAction === actionType && mobileInput.aimMode === 'pressed') {
        enterAimingMode();
      }
    }, AIM_HOLD_DELAY_MS);
  });

  btnEl.addEventListener('pointermove', (e) => {
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
      enterAimingMode();
    } else {
      const distFromStart = Math.hypot(
        e.clientX - mobileInput.aimStartX,
        e.clientY - mobileInput.aimStartY
      );
      if (mobileInput.aimMode === 'pressed' && distFromStart >= AIM_DRAG_THRESHOLD_PX) {
        if (mobileInput.aimHoldTimer) {
          clearTimeout(mobileInput.aimHoldTimer);
          mobileInput.aimHoldTimer = null;
        }
        enterAimingMode();
      }
    }

    const { maxKnobR } = getRingMetrics();
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

    let overCancel = false;
    if (mobileInput.aimLeftButton) {
      overCancel = mobileInput.aimCancelled
        ? distFromCenter <= mobileInput.aimBtnRadius + 2
        : distFromCenter <= mobileInput.aimBtnRadius;
    }
    mobileInput.aimCancelled = overCancel;

    const ringEl = document.getElementById('mob-aim-ring');
    if (ringEl) {
      ringEl.classList.toggle('cancel-armed', overCancel);
    }
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
  });

  const finishAimPointer = (e, forceCancel = false) => {
    if (mobileInput.aimAction !== actionType || e.pointerId !== mobileInput.aimPointerId) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      if (btnEl.hasPointerCapture && btnEl.hasPointerCapture(e.pointerId)) {
        btnEl.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    const stickAngle = mobileInput.aimAngle;
    const distFromCenter = Math.hypot(
      e.clientX - mobileInput.aimCenterX,
      e.clientY - mobileInput.aimCenterY
    );
    const cancelled =
      forceCancel ||
      mobileInput.aimCancelled ||
      (mobileInput.aimLeftButton && distFromCenter <= mobileInput.aimBtnRadius);

    if (cancelled) {
      if (actionType === 'ult' && state.ultPreviewActive) {
        cancelUltimatePreview(true);
      }
      if (actionType === 'action' && state.passCharge && state.passCharge.active) {
        ctx.api.cancelPassCharge?.();
      }
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
    if (p && Number.isFinite(finalAngle)) {
      p.facingAngle = finalAngle;
    }

    if (actionType === 'ult') {
      if (state.mode === 'tutorial' && state.tutorialStep === 4) {
        ctx.api.markTutorialCheck?.('ultAimed');
      }
      confirmUltimateTrigger(finalAngle);
    } else if (actionType === 'dash') {
      ctx.api.triggerDash?.(finalAngle);
    } else if (actionType === 'action') {
      if (p && p.carryingBall && state.passCharge && state.passCharge.active) {
        ctx.api.releasePassCharge?.(finalAngle);
      } else {
        ctx.api.handleActionKey?.(finalAngle);
      }
    }

    clearMobileAimState(false);
    updateMobileTouchHUD();
  };

  btnEl.addEventListener('pointerup', (e) => finishAimPointer(e, false));
  btnEl.addEventListener('pointercancel', (e) => finishAimPointer(e, true));
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

function initMobileAndDeviceControls() {
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
      portraitHintDismissed = true;
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

  // 1. Joystick Gauche (Mouvement) en PointerEvent + setPointerCapture
  const joyZone = document.getElementById('mobile-joystick-zone');
  const joyBase = document.getElementById('mobile-joystick-base');
  const joyStick = document.getElementById('mobile-joystick-stick');

  const updateJoystickFromClient = (clientX, clientY) => {
    if (!joyBase) return;
    const rect = joyBase.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = Math.max(24, rect.width * 0.42);
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      const s = maxR / dist;
      dx *= s;
      dy *= s;
    }
    if (joyStick) {
      joyStick.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }
    const nx = dx / maxR;
    const ny = -dy / maxR;
    if (Math.hypot(nx, ny) < 0.12) {
      mobileInput.joyForward = 0;
      mobileInput.joyRight = 0;
    } else {
      mobileInput.joyRight = nx;
      mobileInput.joyForward = ny;
      if (state.cameraMode === 'aerial' && state.mode === 'tutorial' && state.tutorialStep === 5) {
        ctx.api.markTutorialCheck?.('mobaToggled');
        ctx.api.markTutorialCheck?.('mobaMoved');
      }
    }
  };

  const releaseJoyPointer = (pointerId) => {
    if (mobileInput.joyPointerId === null) return;
    if (pointerId !== undefined && pointerId !== mobileInput.joyPointerId) return;
    try {
      if (joyZone && joyZone.hasPointerCapture && joyZone.hasPointerCapture(mobileInput.joyPointerId)) {
        joyZone.releasePointerCapture(mobileInput.joyPointerId);
      }
    } catch (_) {}
    mobileInput.joyPointerId = null;
    mobileInput.joyTouchId = null;
    mobileInput.joyMouseDown = false;
    mobileInput.joyForward = 0;
    mobileInput.joyRight = 0;
    if (joyStick) joyStick.style.transform = 'translate(0px, 0px)';
  };

  if (joyZone) {
    joyZone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (mobileInput.joyPointerId !== null) return;
      mobileInput.joyPointerId = e.pointerId;
      mobileInput.joyTouchId = e.pointerId;
      try {
        joyZone.setPointerCapture(e.pointerId);
      } catch (_) {}
      updateJoystickFromClient(e.clientX, e.clientY);
    });
    joyZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== mobileInput.joyPointerId) return;
      e.preventDefault();
      e.stopPropagation();
      updateJoystickFromClient(e.clientX, e.clientY);
    });
    joyZone.addEventListener('pointerup', (e) => {
      if (e.pointerId !== mobileInput.joyPointerId) return;
      e.preventDefault();
      e.stopPropagation();
      releaseJoyPointer(e.pointerId);
    });
    joyZone.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== mobileInput.joyPointerId) return;
      releaseJoyPointer(e.pointerId);
    });
    joyZone.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === mobileInput.joyPointerId) {
        releaseJoyPointer(e.pointerId);
      }
    });
  }

  // 2. Joystick Droit (Caméra TPS & Panoramique MOBA) en PointerEvent + setPointerCapture
  const camZone = document.getElementById('mobile-cam-zone');
  const camBase = document.getElementById('mobile-cam-base');
  const camStick = document.getElementById('mobile-cam-stick');

  const updateCamStickFromClient = (clientX, clientY) => {
    if (!camBase) return;
    const rect = camBase.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = Math.max(20, rect.width * 0.42);
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      const s = maxR / dist;
      dx *= s;
      dy *= s;
    }
    if (camStick) {
      camStick.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }
    const nx = dx / maxR;
    const ny = -dy / maxR;
    if (Math.hypot(nx, ny) < 0.10) {
      mobileInput.camX = 0;
      mobileInput.camY = 0;
      mobileInput.camRight = 0;
      mobileInput.camForward = 0;
    } else {
      mobileInput.camX = nx;
      mobileInput.camY = ny;
      mobileInput.camRight = nx;
      mobileInput.camForward = ny;
    }
  };

  const releaseCamPointer = (pointerId) => {
    if (mobileInput.camPointerId === null) return;
    if (pointerId !== undefined && pointerId !== mobileInput.camPointerId) return;
    try {
      if (camZone && camZone.hasPointerCapture && camZone.hasPointerCapture(mobileInput.camPointerId)) {
        camZone.releasePointerCapture(mobileInput.camPointerId);
      }
    } catch (_) {}
    mobileInput.camPointerId = null;
    mobileInput.camX = 0;
    mobileInput.camY = 0;
    mobileInput.camRight = 0;
    mobileInput.camForward = 0;
    if (camStick) camStick.style.transform = 'translate(0px, 0px)';
  };

  if (camZone) {
    camZone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (mobileInput.camPointerId !== null) return;
      mobileInput.camPointerId = e.pointerId;
      try {
        camZone.setPointerCapture(e.pointerId);
      } catch (_) {}
      updateCamStickFromClient(e.clientX, e.clientY);
    });
    camZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== mobileInput.camPointerId) return;
      e.preventDefault();
      e.stopPropagation();
      updateCamStickFromClient(e.clientX, e.clientY);
    });
    camZone.addEventListener('pointerup', (e) => {
      if (e.pointerId !== mobileInput.camPointerId) return;
      e.preventDefault();
      e.stopPropagation();
      releaseCamPointer(e.pointerId);
    });
    camZone.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== mobileInput.camPointerId) return;
      releaseCamPointer(e.pointerId);
    });
    camZone.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === mobileInput.camPointerId) {
        releaseCamPointer(e.pointerId);
      }
    });
  }

  window.addEventListener('blur', resetMobileInput);
}

function isKeyFEvent(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (matchesControl('fullscreen', e.code)) return true;
  return !e.code && typeof e.key === 'string' && e.key.toLowerCase() === 'f' && matchesControl('fullscreen', 'KeyF');
}

export function updateFullscreenButtonsUI() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  const fsBind = formatActionBindingText('fullscreen');
  const btnQuick = document.getElementById('btn-fullscreen');
  const btnWelcome = document.getElementById('btn-welcome-fullscreen');
  const btnPause = document.getElementById('btn-pause-fullscreen');
  if (btnQuick) {
    btnQuick.textContent = isFs ? `🗗 Quitter plein écran (${fsBind})` : `⛶ Plein écran (${fsBind})`;
  }
  if (btnWelcome) {
    btnWelcome.textContent = isFs ? `🗗 Quitter le Plein Écran (${fsBind})` : `⛶ Mode Plein Écran (${fsBind})`;
  }
  if (btnPause) {
    btnPause.textContent = isFs ? `🗗 Quitter le Plein Écran (${fsBind})` : `⛶ Mode Plein Écran (${fsBind})`;
  }
}

export function getVisibleModalId() {
  for (let i = 0; i < MODAL_IDS.length; i++) {
    const el = document.getElementById(MODAL_IDS[i]);
    if (el && !el.classList.contains('hidden')) return MODAL_IDS[i];
  }
  return null;
}

function tryLockLandscapeOrientation() {
  if (
    state.mobileMode &&
    typeof screen !== 'undefined' &&
    screen.orientation &&
    typeof screen.orientation.lock === 'function'
  ) {
    try {
      const p = screen.orientation.lock('landscape');
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }
}

function toggleFullscreen() {
  markFullscreenTransition(2500);

  const docEl = document.documentElement;
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);

  if (!isFs) {
    const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
    if (req) {
      try {
        const p = req.call(docEl);
        if (p && typeof p.then === 'function') {
          p.then(() => {
            tryLockLandscapeOrientation();
            scheduleViewportSync(true);
            updateFullscreenButtonsUI();
            if (!isMenuOpen()) lockPointerIfPlaying();
          }).catch(() => {
            showToast('⚠️ <strong>Plein écran refusé</strong> par le navigateur.', 2500);
          });
        } else {
          tryLockLandscapeOrientation();
          scheduleViewportSync(true);
          updateFullscreenButtonsUI();
          if (!isMenuOpen()) lockPointerIfPlaying();
        }
      } catch (_) {
        showToast('⚠️ <strong>Plein écran indisponible</strong> dans ce navigateur.', 2500);
      }
    } else {
      tryLockLandscapeOrientation();
      scheduleViewportSync(true);
      showToast(
        '📱 <strong>iPhone / iOS :</strong> tournez l’appareil en <strong>paysage</strong> (désactivez le verrouillage portrait) ou utilisez <strong>Partager → Sur l’écran d’accueil</strong> pour le plein écran.',
        4800,
        true
      );
    }
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) {
      try {
        const p = exit.call(document);
        if (p && typeof p.then === 'function') {
          p.then(() => {
            scheduleViewportSync(true);
            updateFullscreenButtonsUI();
            if (!isMenuOpen()) lockPointerIfPlaying();
          }).catch(() => {});
        } else {
          scheduleViewportSync(true);
          updateFullscreenButtonsUI();
          if (!isMenuOpen()) lockPointerIfPlaying();
        }
      } catch (_) {}
    }
  }
}

function onFullscreenChange() {
  markFullscreenTransition(2500);
  scheduleViewportSync();
  updateFullscreenButtonsUI();
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (isFs) {
    const banner = document.getElementById('banner-toast');
    if (banner && banner.classList.contains('priority-toast')) {
      banner.classList.add('hidden');
      banner.classList.remove('priority-toast');
    }
  }
  if (!isMenuOpen()) {
    lockPointerIfPlaying();
    setTimeout(() => {
      if (!isMenuOpen()) lockPointerIfPlaying();
    }, 150);
  }
}
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

export function showOnlyModal(modalId) {
  const prevVisible = getVisibleModalId();
  if (modalId !== 'options-modal') {
    cancelControlRebind();
  }
  MODAL_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === modalId) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
  const nextVisible = getVisibleModalId();
  if (nextVisible !== prevVisible) {
    ctx.api.playSfx?.(nextVisible ? 'ui_modal_open' : 'ui_modal_close');
  }
  if (modalId) {
    pendingPointerLockOnEscapeKeyup = false;
    unlockPointer();
  }
  if (modalId === 'mp-modal') {
    updatePingUI();
    updateTransportBadgeUI();
    if (!mp.enabled) probeMpServerPing();
  } else if (modalId === 'pause-modal') {
    updatePingUI();
    updateTransportBadgeUI();
  }
}

export function openOptionsModal(returnTarget = null) {
  optionsReturnModal = returnTarget;
  clearInputKeys();
  syncControlsSettingsUI();
  ctx.api.syncAudioControlsUI?.();
  renderControlsCustomizer();
  updateDeviceToggleButtonsUI();
  showOnlyModal('options-modal');
  updateTopHUD();
}

function closeOptionsModal() {
  const target = optionsReturnModal;
  optionsReturnModal = null;
  cancelControlRebind();
  if (target === 'welcome-modal') {
    showOnlyModal('welcome-modal');
  } else if (target === 'pause-modal') {
    openPauseMenu();
  } else if (state.phase !== 'menu') {
    resumeFromPauseMenu();
  } else {
    showOnlyModal('welcome-modal');
  }
  updateTopHUD();
}

function syncArenaRulesetUI() {
  const titleEl = document.getElementById('arena-modal-title');
  const subEl = document.getElementById('arena-modal-subtitle');
  const launchBtn = document.getElementById('btn-arena-launch');
  const stdBtn = document.getElementById('btn-arena-rule-standard');
  const vanBtn = document.getElementById('btn-arena-rule-vanilla');

  if (stdBtn) stdBtn.classList.toggle('active', !pendingArenaVanilla);
  if (vanBtn) vanBtn.classList.toggle('active', !!pendingArenaVanilla);

  const vanillaSuffix = pendingArenaVanilla ? ' (Vanille)' : '';
  if (titleEl) {
    titleEl.textContent =
      pendingArenaMode === 'practice'
        ? `🧪 Choisir une Arène — Pratique${vanillaSuffix}`
        : `🚀 Choisir une Arène — Solo vs IA${vanillaSuffix}`;
  }
  if (subEl) {
    subEl.textContent = pendingArenaVanilla
      ? '🍦 Mode Vanille : sans Ultimate, Dash+, Évo Dash ni Outil • Passe débloquée au magasin'
      : pendingArenaMode === 'practice'
      ? "Sélectionnez votre terrain d'entraînement (modifiable ensuite dans le menu Pause)"
      : 'Sélectionnez le terrain avant de lancer votre match 3v3 (objectif 7 pts)';
  }
  if (launchBtn) {
    launchBtn.textContent =
      pendingArenaMode === 'practice'
        ? pendingArenaVanilla
          ? '🍦 Lancer Pratique Vanille'
          : '🧪 Lancer la Pratique'
        : pendingArenaVanilla
        ? '🍦 Lancer Solo Vanille'
        : '🚀 Lancer Solo vs IA';
  }
}

export function openArenaModal(mode = 'pedagogical', vanilla = false) {
  pendingArenaMode = mode === 'practice' ? 'practice' : 'pedagogical';
  pendingArenaVanilla = !!vanilla;
  const meta = getActiveMapMeta();
  const summaryEl = document.getElementById('arena-map-summary');

  syncArenaRulesetUI();
  if (summaryEl && meta) {
    summaryEl.textContent = `${meta.icon} ${meta.name}`;
  }
  updateMapLockUI();
  showOnlyModal('arena-modal');
}

export function updateWelcomePauseBanner(isPausedFlag = state.phase !== 'menu') {
  const inGamePause = !!isPausedFlag && state.phase !== 'menu';
  const msgEl = document.getElementById('pause-status-message');
  const modeInfoEl = document.getElementById('pause-mode-info');
  const practiceStrip = document.getElementById('pause-practice-strip');
  const pauseSwapBtn = document.getElementById('btn-pause-practice-swap-team');
  const pauseMapSelect = document.getElementById('pause-practice-map-select');
  const pauseUltsBtn = document.getElementById('btn-pause-practice-ults');

  document.body.classList.toggle('game-paused', inGamePause);

  updatePingUI();
  updateTransportBadgeUI();

  if (msgEl) {
    msgEl.textContent = mp.enabled ? 'Le jeu continue' : 'Le jeu est arrêté';
  }
  if (modeInfoEl) {
    const meta = getActiveMapMeta();
    const mapLabel = meta ? `${meta.icon} ${meta.shortName}` : '';
    const vanillaTag = state.vanillaMode ? ' • 🍦 Vanille' : '';
    const modeLabel =
      state.mode === 'tutorial'
        ? 'Mode Tutoriel'
        : state.mode === 'practice'
        ? mp.enabled
          ? `Pratique Multijoueur${vanillaTag} • Salon ${mp.roomCode}`
          : `Mode Pratique (Solo)${vanillaTag}`
        : mp.enabled
        ? `Match Multijoueur${vanillaTag} • Salon ${mp.roomCode}`
        : `Match Solo vs IA${vanillaTag}`;
    modeInfoEl.textContent = mapLabel ? `${modeLabel} • ${mapLabel}` : modeLabel;
  }
  if (pauseUltsBtn) {
    pauseUltsBtn.textContent = state.vanillaMode ? '💨 Refresh Dash' : '⚡ Refresh Ultimates';
  }
  if (practiceStrip) {
    practiceStrip.classList.toggle('hidden', !(inGamePause && state.mode === 'practice'));
  }
  if (pauseSwapBtn) {
    pauseSwapBtn.classList.toggle('hidden', !!mp.enabled);
  }
  if (pauseMapSelect) {
    pauseMapSelect.value = state.mapId;
    pauseMapSelect.disabled = !!(mp.enabled && !mp.isHost);
  }
}

export function clearInputKeys() {
  Object.keys(keys).forEach((k) => {
    keys[k] = false;
  });
  Object.keys(mouseButtonsDown).forEach((b) => {
    mouseButtonsDown[b] = false;
  });
  state.mobaRightMouseDown = false;
  minimapDragging = false;
  if (state.passCharge && state.passCharge.active) {
    ctx.api.cancelPassCharge?.();
  }
}

export function returnToMainMenu(options = {}) {
  void options;
  optionsReturnModal = null;
  cancelControlRebind();
  if (state.passCharge && state.passCharge.active) {
    ctx.api.cancelPassCharge?.();
  }
  if (mp.enabled) {
    closeMultiplayerSession(true);
  }
  ctx.api.resetMatchStateToMenu();
  switchWelcomeSubmenu('play');
  showOnlyModal('welcome-modal');
}

export function openPauseMenu() {
  clearInputKeys();
  cancelControlRebind();
  pendingPointerLockOnEscapeKeyup = false;
  lastEscapePauseMs = performance.now();
  const rulesPanel = document.getElementById('pause-rules-panel');
  if (rulesPanel) rulesPanel.classList.add('hidden');
  const rulesBtn = document.getElementById('btn-pause-rules');
  if (rulesBtn) rulesBtn.classList.remove('active-mode-pill');
  updateWelcomePauseBanner(state.phase !== 'menu');
  updateMapLockUI();
  updateFullscreenButtonsUI();
  showOnlyModal('pause-modal');
  updateTopHUD();
}

export function resumeFromPauseMenu(opts = {}) {
  if (state.phase === 'menu') return;
  const fromEscape = !!(opts && opts.fromEscape);
  optionsReturnModal = null;
  cancelControlRebind();
  updateWelcomePauseBanner(false);
  lastEscapePauseMs = performance.now();
  if (state.phase === 'prep') {
    pendingPointerLockOnEscapeKeyup = false;
    showOnlyModal('prep-modal');
  } else if (state.phase === 'round_end' || state.phase === 'game_over') {
    pendingPointerLockOnEscapeKeyup = false;
    showOnlyModal('round-end-modal');
  } else {
    resumePointerLockGraceUntil = performance.now() + 120;
    showOnlyModal(null);
    if (fromEscape) {
      // Sous Linux (X11/Wayland), reverrouiller le pointeur pendant que Échap est encore enfoncé
      // peut déclencher un déverrouillage immédiat qui réouvre aussitôt le menu pause.
      pendingPointerLockOnEscapeKeyup = true;
    } else {
      pendingPointerLockOnEscapeKeyup = false;
      lockPointerIfPlaying();
    }
  }
  updateTopHUD();
}

export function selectControlledRole(role, options = {}) {
  if (!['G', 'C', 'D'].includes(role)) return false;
  if (state.myLockedRole && state.myLockedRole !== role) return false;
  if (!options.force && !ctx.api.isTutorialRoleSwitchAllowed()) return false;

  const targetCandidate = getPlayer(state.myTeam, role);
  if (!options.force && targetCandidate && targetCandidate.tutorialHidden) return false;

  const blocker = getRoleHumanController(state.myTeam, role);
  if (blocker) {
    if (!options.silent) {
      showToast(
        `⛔ <strong>Joueuse ${role}</strong> est déjà contrôlée par <strong>${escapeHtml(blocker.name)}</strong> !`,
        2000
      );
    }
    return false;
  }

  const prevRole = state.controlledRole;
  state.controlledRole = role;
  if (!options.silent && prevRole !== role) ctx.api.playSfx?.('role_switch', { role });
  state.ultPreviewActive = false;
  if (state.passCharge && state.passCharge.active) {
    ctx.api.cancelPassCharge?.();
  }
  if (state.mode === 'tutorial' && state.tutorialStep === 1 && !options.silent && prevRole !== role) {
    if (!state.tutorialChecklist.switchedRole && role !== 'G') {
      ctx.api.markTutorialCheck('switchedRole');
    } else if (state.tutorialChecklist.switchedRole && role === 'G') {
      ctx.api.markTutorialCheck('returnedToFirstRole');
    }
  }
  const me = mp.members.find((m) => m.peerId === mp.myPeerId);
  if (me && me.slot === 'ALL') {
    me.activeRole = role;
  }

  const p = getPlayer(state.myTeam, role);
  if (ctx.api.setMobaMoveGoal) {
    ctx.api.setMobaMoveGoal(null);
  } else {
    state.mobaMoveTarget = null;
  }
  if (mobaMoveMarker) mobaMoveMarker.visible = false;
  if (p) {
    p.vel.set(0, 0, 0);
    p.targetPos.copy(p.pos);
    p.targetFacingAngle = p.facingAngle;
    if (state.cameraMode === 'tps') {
      state.camYaw = p.facingAngle + Math.PI;
    } else if (state.cameraMode === 'aerial') {
      recenterMobaCamera(true);
    }
    if (mp.enabled && state.phase === 'play') {
      if (mp.isHost) {
        sendNetMessage({
          type: 'MP_ROLES_SYNC',
          members: mp.members
        });
      } else {
        sendNetMessage({
          type: 'MP_PLAYER_INPUT',
          round: state.round,
          peerId: mp.myPeerId,
          seq: ++mp.inputSeq,
          team: state.myTeam,
          role: state.controlledRole,
          x: p.pos.x,
          y: p.pos.y,
          z: p.pos.z,
          vx: 0,
          vy: 0,
          vz: 0,
          oc: p.onCanopy ? 1 : 0,
          facingAngle: p.facingAngle,
          moveForward: 0,
          moveRight: 0,
          camYaw: state.camYaw,
          actionTriggered: false
        });
      }
    }
  }
  updateRosterHUD();
  return true;
}

export function cycleControlledRole(direction = 1) {
  if (state.myLockedRole || !ctx.api.isTutorialRoleSwitchAllowed()) return false;
  const order = ['G', 'C', 'D'];
  const idx = Math.max(0, order.indexOf(state.controlledRole));
  const step = direction >= 0 ? 1 : 2;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const nextRole = order[(idx + step * attempt) % 3];
    if (nextRole === state.controlledRole) continue;
    if (getRoleHumanController(state.myTeam, nextRole)) continue;
    const p = getPlayer(state.myTeam, nextRole);
    if (p && !p.tutorialHidden && p.state === 'standing') {
      return selectControlledRole(nextRole);
    }
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const nextRole = order[(idx + step * attempt) % 3];
    if (nextRole === state.controlledRole) continue;
    const p = getPlayer(state.myTeam, nextRole);
    if (p && !p.tutorialHidden && !getRoleHumanController(state.myTeam, nextRole)) {
      return selectControlledRole(nextRole);
    }
  }
  return false;
}


let toastTimeout = null;
export function showToast(htmlText, durationMs = 4500, isPriority = false) {
  const banner = document.getElementById('banner-toast');
  if (!banner) return;
  let displayHtml = htmlText;
  let effectiveDuration = durationMs;
  if (state.mobileMode && !isPriority) {
    if (effectiveDuration > 0) {
      effectiveDuration = Math.min(effectiveDuration, 1800);
    }
    const str = String(htmlText || '');
    const strongMatch = str.match(/^([\s\S]*?<strong>[\s\S]*?<\/strong>)/i);
    if (strongMatch) {
      displayHtml = strongMatch[1].replace(/\s*[:—–]\s*<\/strong>$/i, '</strong>').trim();
    } else {
      const stripped = str.replace(/<br\s*\/?>[\s\S]*$/i, '').split(/\s+[—–]\s+|:\s+/)[0];
      displayHtml = stripped.trim() || str;
    }
  }
  banner.innerHTML = displayHtml;
  banner.classList.toggle('priority-toast', !!isPriority);
  banner.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  if (effectiveDuration > 0) {
    toastTimeout = setTimeout(() => {
      banner.classList.add('hidden');
      banner.classList.remove('priority-toast');
    }, effectiveDuration);
  }
}

export function isMapChangeLocked() {
  return state.phase !== 'menu' && state.mode !== 'practice';
}

export function updateMapLockUI() {
  const lockedInMatch = isMapChangeLocked();
  const guestLocked = mp.enabled && !mp.isHost && !lockedInMatch;
  const disablePick = lockedInMatch || guestLocked;

  const arenaGrid = document.getElementById('arena-map-grid');
  if (arenaGrid && arenaGrid.children) {
    arenaGrid.classList.toggle('map-locked', lockedInMatch);
    Array.from(arenaGrid.children).forEach((btn) => {
      const mId = btn.getAttribute && (btn.getAttribute('data-map') || btn.getAttribute('data-map-id'));
      if (btn.classList) btn.classList.toggle('active', mId === state.mapId);
      btn.disabled = disablePick;
    });
  }
  const arenaSummary = document.getElementById('arena-map-summary');
  if (arenaSummary) {
    const meta = getActiveMapMeta();
    if (meta) arenaSummary.textContent = `${meta.icon} ${meta.name}`;
  }

  const mpGrid = document.getElementById('mp-map-grid');
  const mpDisablePick = lockedInMatch || (mp.enabled && !mp.isHost);
  if (mpGrid && mpGrid.children) {
    mpGrid.classList.toggle('map-locked', lockedInMatch);
    Array.from(mpGrid.children).forEach((btn) => {
      if (btn.classList) btn.classList.toggle('active', btn.getAttribute('data-map-id') === state.mapId);
      btn.disabled = mpDisablePick;
    });
  }
  const mpHint = document.getElementById('mp-map-lock-hint');
  if (mpHint) {
    mpHint.textContent = lockedInMatch
      ? '🔒 Verrouillée en cours de match (modifiable uniquement en Pratique)'
      : !mp.enabled || mp.isHost
      ? "Modifiable par l'Hôte"
      : `Arène choisie par l'Hôte (${getActiveMapMeta().shortName})`;
  }

  const pausePracticeMapSelect = document.getElementById('pause-practice-map-select');
  if (pausePracticeMapSelect) {
    pausePracticeMapSelect.value = state.mapId;
    pausePracticeMapSelect.disabled = !!(mp.enabled && !mp.isHost);
  }

  const practiceMapSelect = document.getElementById('practice-map-select');
  if (practiceMapSelect) {
    practiceMapSelect.value = state.mapId;
    practiceMapSelect.disabled = !!(mp.enabled && !mp.isHost);
  }
}

export function selectArenaMap(mapId, broadcast = true, options = {}) {
  if (isMapChangeLocked() && !options.force && !options.fromNetwork) {
    showToast('🔒 Changement de carte verrouillé en cours de partie (autorisé uniquement en mode Pratique).', 2500);
    updateMapLockUI();
    return getActiveMapMeta();
  }

  if (broadcast && mp.enabled && state.phase !== 'menu' && state.mode === 'practice' && !options.fromNetwork) {
    ctx.api.requestPracticeAction('change_map', { mapId });
    return getActiveMapMeta();
  }

  if (broadcast && mp.enabled && !mp.isHost && !options.fromNetwork) {
    showToast('🔒 Seule l\'Hôte peut changer d\'arène en multijoueur.', 2200);
    return getActiveMapMeta();
  }
  const mapMeta = applyArenaMapData(mapId);
  state.mapId = mapMeta.id;
  VISION_SPEC.canopyRange = mapMeta.canopyVisionRange || 102;
  minimapStaticKey = '';
  syncMinimapCanvasDimensions();

  if (ctx.world.rebuildAIRouter) ctx.world.rebuildAIRouter();
  buildParkEnvironment();
  if (players && players.length > 0) {
    players.forEach((p) => {
      if (!p.onCanopy && !p.isAirborne) {
        ctx.api.clampToField(p.pos, 0.72, null, { onCanopy: false, isAirborne: false });
        p.pos.y = getTerrainY(p.pos.x, p.pos.z, state.mapId);
        if (p.mesh && p.mesh.root) p.mesh.root.position.copy(p.pos);
      }
    });
  }
  if (balls && balls.length > 0) {
    balls.forEach((b) => {
      if (b.state === 'ground') {
        ctx.api.clampToField(b.pos, 0.55, null, { onCanopy: false, isAirborne: false });
        b.pos.y = getTerrainY(b.pos.x, b.pos.z, state.mapId) + 0.55;
        if (b.mesh && b.mesh.group) b.mesh.group.position.copy(b.pos);
      }
    });
  }

  const arenaSummaryEl = document.getElementById('arena-map-summary');
  if (arenaSummaryEl) arenaSummaryEl.textContent = `${mapMeta.icon} ${mapMeta.name}`;

  const minimapTitleEl = document.getElementById('minimap-map-name');
  if (minimapTitleEl) minimapTitleEl.textContent = `${mapMeta.icon} ${mapMeta.shortName} • Visions`;

  updateMapLockUI();
  if (state.phase !== 'menu') {
    updateWelcomePauseBanner(getVisibleModalId() === 'pause-modal');
  }

  if (typeof renderMinimap === 'function' && players && players.length > 0) {
    renderMinimap();
  }
  if (broadcast && mp.enabled && mp.isHost && !options.fromNetwork) {
    broadcastLobbyState();
  }
  return mapMeta;
}

export function setMpLobbyMode(mode, broadcast = true) {
  const target = mode === 'practice' ? 'practice' : 'multiplayer';
  mp.lobbyMode = target;

  const btnMatch = document.getElementById('btn-mp-mode-match');
  const btnPractice = document.getElementById('btn-mp-mode-practice');
  const hint = document.getElementById('mp-mode-hint');
  const startBtn = document.getElementById('btn-mp-start');

  if (btnMatch) btnMatch.classList.toggle('active', target === 'multiplayer');
  if (btnPractice) btnPractice.classList.toggle('active', target === 'practice');
  if (hint) {
    hint.textContent =
      target === 'practice'
        ? '🧘 Pratique Multijoueur : aucune IA, commandes Pratique en pause [Échap] (ultis, relever, changer carte)'
        : '⚔️ Partie complète 7 pts : les postes vides sont gérés par l’IA';
  }
  if (startBtn) {
    startBtn.textContent =
      target === 'practice'
        ? mp.lobbyVanilla
          ? '🧘 Lancer Pratique Vanille Multijoueur'
          : '🧘 Lancer "Un tour pour rien" Multijoueur'
        : mp.lobbyVanilla
        ? '🍦 Lancer le Match Vanille Multijoueur !'
        : '🚀 Lancer le Match Multijoueur !';
  }

  if (broadcast && mp.enabled && mp.isHost) {
    broadcastLobbyState();
  } else if (typeof updateLobbyUI === 'function') {
    updateLobbyUI();
  }
}

export function setMpLobbyVanilla(enabled, broadcast = true) {
  mp.lobbyVanilla = !!enabled;
  if (broadcast && mp.enabled && mp.isHost) {
    broadcastLobbyState();
  } else if (typeof updateLobbyUI === 'function') {
    updateLobbyUI();
  }
}


// --- SYNCHRONISATION DES MODÈLES 3D ANIME, CAMÉRA & ÉTIQUETTES ---
export function syncPlayerMeshes(dt) {
  const nowSec = performance.now() * 0.001;
  players.forEach((p) => {
    if (p.tutorialHidden) {
      p.mesh.root.visible = false;
      if (p.mesh.leafAuraGroup) p.mesh.leafAuraGroup.visible = false;
      return;
    }

    const isMyTeam = p.team === state.myTeam;
    const inBush = p.state === 'standing' && !!isPointInJungleBush(p.pos);

    if (!isMyTeam) {
      const hiddenEnemy = inBush && !hasAllyVisionNear(p.pos, VISION_SPEC.bushSpotRange, state.myTeam);
      if (hiddenEnemy) {
        p.mesh.root.visible = false;
        if (p.mesh.leafAuraGroup) p.mesh.leafAuraGroup.visible = false;
        return;
      }
      p.mesh.root.visible = true;
      applyMeshStealthAlpha(p.mesh, 1.0);
    } else {
      p.mesh.root.visible = true;
      const targetAlpha = inBush ? 0.45 : 1.0;
      const curAlpha = typeof p.mesh.stealthAlpha === 'number' ? p.mesh.stealthAlpha : 1.0;
      const lerped = THREE.MathUtils.lerp(curAlpha, targetAlpha, Math.min(1, 12 * (dt || 0.016)));
      const nextAlpha = Math.abs(lerped - targetAlpha) < 0.01 ? targetAlpha : lerped;
      applyMeshStealthAlpha(p.mesh, nextAlpha);
    }

    p.mesh.root.position.copy(p.pos);
    p.mesh.bodyGroup.rotation.y = p.facingAngle;
    p.mesh.floorRing.rotation.y = p.facingAngle;
    const groundUnderY = getStructureSurfaceY(p.pos.x, p.pos.z, !!p.onCanopy).y;
    p.mesh.floorRing.position.y = groundUnderY + 0.03 - p.pos.y;

    const isSlidePose =
      p.state === 'standing' &&
      !p.isAirborne &&
      !p.isLaunching &&
      ((p.dashTimer > 0 && p.dashKind === 'slide' && !p.carryingBall) ||
        (p.slideGlideTimer > 0 && !p.carryingBall) ||
        p.onSlidePatch ||
        p.isSlidingNet);

    if (p.state === 'sitting') {
      p.mesh.bodyGroup.position.y = THREE.MathUtils.lerp(p.mesh.bodyGroup.position.y, -0.52, 8 * dt);
      p.mesh.leftLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.leftLeg.rotation.x, -Math.PI / 2, 8 * dt);
      p.mesh.rightLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.rightLeg.rotation.x, -Math.PI / 2, 8 * dt);
      p.mesh.leftArm.rotation.x = THREE.MathUtils.lerp(p.mesh.leftArm.rotation.x, 0.25, 8 * dt);
      p.mesh.rightArm.rotation.x = THREE.MathUtils.lerp(p.mesh.rightArm.rotation.x, 0.25, 8 * dt);
      p.mesh.leftArm.rotation.z = THREE.MathUtils.lerp(p.mesh.leftArm.rotation.z, 0, 10 * dt);
      p.mesh.rightArm.rotation.z = THREE.MathUtils.lerp(p.mesh.rightArm.rotation.z, 0, 10 * dt);
    } else if (isSlidePose) {
      // Pose de glissade basse : jambe avant tendue, jambe arrière pliée, buste incliné en arrière & bras écartés
      p.mesh.bodyGroup.position.y = THREE.MathUtils.lerp(p.mesh.bodyGroup.position.y, -0.36, 18 * dt);
      p.mesh.leftLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.leftLeg.rotation.x, -1.22, 20 * dt);
      p.mesh.rightLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.rightLeg.rotation.x, 0.78, 20 * dt);
      p.mesh.leftArm.rotation.x = THREE.MathUtils.lerp(p.mesh.leftArm.rotation.x, 0.52, 18 * dt);
      p.mesh.rightArm.rotation.x = THREE.MathUtils.lerp(p.mesh.rightArm.rotation.x, -0.45, 18 * dt);
      p.mesh.leftArm.rotation.z = THREE.MathUtils.lerp(p.mesh.leftArm.rotation.z, -0.62, 18 * dt);
      p.mesh.rightArm.rotation.z = THREE.MathUtils.lerp(p.mesh.rightArm.rotation.z, 0.58, 18 * dt);
      if (p.mesh.hairBouncers) {
        p.mesh.hairBouncers.forEach((hb) => {
          hb.pivot.rotation.z = THREE.MathUtils.lerp(
            hb.pivot.rotation.z,
            hb.baseRotZ + 0.28 * hb.dir,
            14 * dt
          );
          hb.pivot.rotation.x = THREE.MathUtils.lerp(hb.pivot.rotation.x, -0.35, 14 * dt);
        });
      }
      if (Math.random() < 0.85) {
        spawnParticles(p.pos, Math.random() < 0.55 ? 0xe0f2fe : 0x7dd3fc, 1);
      }
    } else {
      const speed = p.vel.length();
      p.mesh.leftArm.rotation.z = THREE.MathUtils.lerp(p.mesh.leftArm.rotation.z, 0, 12 * dt);
      p.mesh.rightArm.rotation.z = THREE.MathUtils.lerp(p.mesh.rightArm.rotation.z, 0, 12 * dt);
      if (p.state === 'standing' && speed > 0.2) {
        p.animTime += dt * speed * 1.85;
        // Rebelle / course anime dynamique avec léger rebond vertical
        p.mesh.bodyGroup.position.y = Math.abs(Math.sin(p.animTime * 2)) * 0.09;
        p.mesh.leftLeg.rotation.x = Math.sin(p.animTime) * 0.65;
        p.mesh.rightLeg.rotation.x = -Math.sin(p.animTime) * 0.65;
        p.mesh.leftArm.rotation.x = -Math.sin(p.animTime) * 0.55;
        p.mesh.rightArm.rotation.x = Math.sin(p.animTime) * 0.55;

        if (p.mesh.hairBouncers) {
          p.mesh.hairBouncers.forEach((hb) => {
            hb.pivot.rotation.z = hb.baseRotZ + Math.sin(p.animTime * 2) * 0.18 * hb.dir;
            hb.pivot.rotation.x = -0.15 - Math.abs(Math.cos(p.animTime)) * 0.14;
          });
        }
      } else {
        // Respiration anime au repos
        p.mesh.bodyGroup.position.y = THREE.MathUtils.lerp(
          p.mesh.bodyGroup.position.y,
          Math.sin(nowSec * 3 + p.animTime) * 0.025,
          10 * dt
        );
        p.mesh.leftLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.leftLeg.rotation.x, 0, 10 * dt);
        p.mesh.rightLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.rightLeg.rotation.x, 0, 10 * dt);
        p.mesh.leftArm.rotation.x = THREE.MathUtils.lerp(p.mesh.leftArm.rotation.x, 0, 10 * dt);
        p.mesh.rightArm.rotation.x = THREE.MathUtils.lerp(p.mesh.rightArm.rotation.x, 0, 10 * dt);

        if (p.mesh.hairBouncers) {
          p.mesh.hairBouncers.forEach((hb) => {
            hb.pivot.rotation.z = THREE.MathUtils.lerp(
              hb.pivot.rotation.z,
              hb.baseRotZ + Math.sin(nowSec * 2.2) * 0.04 * hb.dir,
              8 * dt
            );
            hb.pivot.rotation.x = THREE.MathUtils.lerp(hb.pivot.rotation.x, 0, 8 * dt);
          });
        }
      }
    }

    if (p.carryingBall) {
      p.mesh.leftArm.rotation.x = -Math.PI / 2.8;
      p.mesh.rightArm.rotation.x = -Math.PI / 2.8;
    }

    const isDashing =
      (p.dashTimer > 0 || p.isAirborne || p.isLaunching || Math.hypot(p.vel.x, p.vel.z) > 14) &&
      p.state === 'standing' &&
      (!p.carryingBall || p.isAirborne || p.isLaunching);
    if (isSlidePose) {
      p.mesh.bodyGroup.rotation.x = THREE.MathUtils.lerp(p.mesh.bodyGroup.rotation.x, -0.48, 18 * dt);
      p.mesh.bodyGroup.rotation.z = THREE.MathUtils.lerp(p.mesh.bodyGroup.rotation.z, -0.1, 14 * dt);
    } else if (isDashing) {
      p.mesh.bodyGroup.rotation.x = THREE.MathUtils.lerp(
        p.mesh.bodyGroup.rotation.x,
        p.isAirborne ? 0.45 : 0.38,
        20 * dt
      );
      p.mesh.bodyGroup.rotation.z = THREE.MathUtils.lerp(p.mesh.bodyGroup.rotation.z, 0, 14 * dt);
      const trailChance = p.dashTimer > 0 && p.dashIsSuper ? 0.75 : 0.45;
      if (Math.random() < trailChance) {
        const trailHex = p.isAirborne || p.isLaunching || p.dashIsSuper ? 0x38bdf8 : 0xffffff;
        spawnParticles(p.pos, trailHex, 1);
      }
    } else {
      p.mesh.bodyGroup.rotation.x = THREE.MathUtils.lerp(p.mesh.bodyGroup.rotation.x, 0, 14 * dt);
      p.mesh.bodyGroup.rotation.z = THREE.MathUtils.lerp(p.mesh.bodyGroup.rotation.z, 0, 14 * dt);
    }

    if (p.mesh.leafAuraGroup) {
      if (p.leafUltTimer > 0 && p.state === 'standing' && !p.carryingBall) {
        p.mesh.leafAuraGroup.visible = true;
        p.mesh.leafAuraGroup.position.y = groundUnderY + 0.055 - p.pos.y;
        p.mesh.leafAuraGroup.rotation.y += dt * 5.0;
        const auraPulse = 1.0 + 0.09 * Math.sin(nowSec * 15);
        p.mesh.leafAuraGroup.scale.setScalar(auraPulse);
        p.mesh.leafAuraMat.color.setHex(p.leafUltTimer <= 0.6 ? 0xfacc15 : 0x4ade80);
        p.mesh.leafAuraMat.opacity = 0.82 * Math.min(1, p.leafUltTimer / 0.35 + 0.25);
        if (Math.random() < 0.4) {
          spawnParticles(p.pos, 0x4ade80, 1);
        }
      } else {
        p.mesh.leafAuraGroup.visible = false;
      }
    }

    const stealthRingMult = isMyTeam && inBush ? 0.68 : 1.0;
    if (isMyTeam && p.role === state.controlledRole) {
      p.mesh.ringMat.color.setHex(0x38bdf8);
      p.mesh.ringMat.opacity = 0.95 * stealthRingMult;
      p.mesh.floorRing.scale.setScalar(1.18);
    } else if (p.state === 'rule1') {
      p.mesh.ringMat.color.setHex(0xf97316);
      p.mesh.ringMat.opacity = 0.9;
      p.mesh.floorRing.scale.setScalar(1.1);
    } else {
      p.mesh.ringMat.color.setHex(p.team === 'ally' ? 0xfef08a : 0xc084fc);
      p.mesh.ringMat.opacity = (p.state === 'sitting' ? 0.25 : 0.55) * stealthRingMult;
      p.mesh.floorRing.scale.setScalar(1.0);
    }

    syncPlayerPowerVisuals(p, nowSec);
  });

  // Synchroniser visibilité & translucidité des ballons portés avec leur porteuse
  for (let bi = 0; bi < balls.length; bi++) {
    const b = balls[bi];
    if (!b || !b.mesh || !b.mesh.group) continue;
    if (b.state === 'carried' && b.carrier && b.carrier.mesh) {
      b.mesh.group.visible = !b.carrier.tutorialHidden && !!b.carrier.mesh.root.visible;
      const alpha =
        b.carrier.team === state.myTeam && typeof b.carrier.mesh.stealthAlpha === 'number'
          ? b.carrier.mesh.stealthAlpha
          : 1.0;
      applyMeshStealthAlpha(b.mesh, alpha);
    } else {
      applyMeshStealthAlpha(b.mesh, 1.0);
    }
  }
}

let _tmpCamDesired = null;
let _tmpCamLook = null;
let _tmpProjVec = null;
const _dashDomCache = { visible: false, left: '', top: '', bg: '', text: '' };

export function recenterMobaCamera(instant = false) {
  const controlled = getPlayer(state.myTeam, state.controlledRole) || players[0];
  if (!controlled) return;
  state.mobaCamX = controlled.pos.x;
  state.mobaCamY = controlled.pos.y || 0;
  state.mobaCamZ = controlled.pos.z;
  state.mobaCamInitialized = true;
  if (instant && state.cameraMode === 'aerial' && camera) {
    const zoom = state.aerialZoom || 1.0;
    const height = 46 * zoom;
    const backZ = 21 * zoom;
    camera.position.set(state.mobaCamX, state.mobaCamY + height, state.mobaCamZ + backZ);
    camera.lookAt(state.mobaCamX, state.mobaCamY + 1.0, state.mobaCamZ);
  }
}

export function updateCamera(dt) {
  const controlled = getPlayer(state.myTeam, state.controlledRole) || players[0];
  let occTargetX = controlled.pos.x;
  let occTargetY = (controlled.pos.y || 0) + 1.45;
  let occTargetZ = controlled.pos.z;

  const menuOpen = isMenuOpen();
  let mobCamCurveX = 0;
  let mobCamCurveY = 0;
  if (state.mobileMode && !menuOpen) {
    const rawCamLen = Math.hypot(mobileInput.camX || 0, mobileInput.camY || 0);
    if (rawCamLen > 0.10) {
      const camMag = Math.pow(Math.min(1, (rawCamLen - 0.10) / 0.90), 1.65);
      mobCamCurveX = ((mobileInput.camX || 0) / rawCamLen) * camMag;
      mobCamCurveY = ((mobileInput.camY || 0) / rawCamLen) * camMag;
    }
  }

  if (state.cameraMode === 'tps') {
    if (mobCamCurveX !== 0 || mobCamCurveY !== 0) {
      const sens = state.tpsSensitivity || 1.0;
      state.camYaw -= mobCamCurveX * 3.0 * sens * dt;
      state.camPitch = Math.max(0.12, Math.min(1.15, state.camPitch - mobCamCurveY * 1.8 * sens * dt));
    }
    const dist = 7.8;
    const baseY = controlled.pos.y || 0;
    const height = baseY + 3.6 + Math.sin(state.camPitch) * 3.2;
    const horizDist = Math.cos(state.camPitch) * dist;

    _tmpCamDesired.set(
      controlled.pos.x + Math.sin(state.camYaw) * horizDist,
      height,
      controlled.pos.z + Math.cos(state.camYaw) * horizDist
    );

    camera.position.lerp(_tmpCamDesired, Math.min(1, 12 * dt));

    _tmpCamLook.set(
      controlled.pos.x - Math.sin(state.camYaw) * 6,
      baseY + 1.4,
      controlled.pos.z - Math.cos(state.camYaw) * 6
    );
    camera.lookAt(_tmpCamLook);
  } else {
    const zoom = state.aerialZoom || 1.0;
    if (!state.mobaCamInitialized) {
      recenterMobaCamera(true);
    }

    const blockRecenterForPass = !!(
      controlled &&
      (controlled.carryingBall || (state.passCharge && state.passCharge.active)) &&
      isControlDown('action')
    );
    if (!menuOpen && ((state.mobaCamLocked && !minimapDragging) || (isControlDown('recenterCam') && !blockRecenterForPass))) {
      state.mobaCamX = controlled.pos.x;
      state.mobaCamY = controlled.pos.y || 0;
      state.mobaCamZ = controlled.pos.z;
    } else if (!menuOpen) {
      let panX = mobCamCurveX;
      let panZ = -mobCamCurveY;

      if (
        state.mobaEdgePan &&
        !state.mobileMode &&
        !minimapDragging &&
        state.mouseInWindow &&
        typeof state.mouseClientX === 'number' &&
        typeof state.mouseClientY === 'number'
      ) {
        const edgeMargin = 32;
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 720;
        if (state.mouseClientX <= edgeMargin) {
          panX -= Math.min(1, (edgeMargin - state.mouseClientX) / edgeMargin);
        } else if (state.mouseClientX >= vw - edgeMargin) {
          panX += Math.min(1, (state.mouseClientX - (vw - edgeMargin)) / edgeMargin);
        }
        if (state.mouseClientY <= edgeMargin) {
          panZ -= Math.min(1, (edgeMargin - state.mouseClientY) / edgeMargin);
        } else if (state.mouseClientY >= vh - edgeMargin) {
          panZ += Math.min(1, (state.mouseClientY - (vh - edgeMargin)) / edgeMargin);
        }
      }

      if (isControlDown('camPanLeft')) panX -= 1;
      if (isControlDown('camPanRight')) panX += 1;
      if (isControlDown('camPanUp')) panZ -= 1;
      if (isControlDown('camPanDown')) panZ += 1;

      const panLen = Math.hypot(panX, panZ);
      if (panLen > 0.001) {
        if (panLen > 1) {
          panX /= panLen;
          panZ /= panLen;
        }
        const camSpeed = 62 * zoom * (state.mobaCamSpeed || 1.0);
        state.mobaCamX += panX * camSpeed * dt;
        state.mobaCamZ += panZ * camSpeed * dt;
      }

      const halfW = FIELD.width / 2;
      const halfD = FIELD.depth / 2;
      state.mobaCamX = Math.max(-halfW, Math.min(halfW, state.mobaCamX));
      state.mobaCamZ = Math.max(-halfD, Math.min(halfD, state.mobaCamZ));

      const distToControlled = Math.hypot(
        state.mobaCamX - controlled.pos.x,
        state.mobaCamZ - controlled.pos.z
      );
      const targetCamY =
        distToControlled < 4.0 ? controlled.pos.y || 0 : getTerrainY(state.mobaCamX, state.mobaCamZ);
      state.mobaCamY = THREE.MathUtils.lerp(state.mobaCamY || 0, targetCamY, Math.min(1, 8 * dt));
    }

    const baseY = state.mobaCamY || 0;
    const height = 46 * zoom;
    const backZ = 21 * zoom;
    camera.position.set(state.mobaCamX, baseY + height, state.mobaCamZ + backZ);
    _tmpCamLook.set(state.mobaCamX, baseY + 1.0, state.mobaCamZ);
    camera.lookAt(_tmpCamLook);
    occTargetX = state.mobaCamX;
    occTargetY = baseY + 1.45;
    occTargetZ = state.mobaCamZ;

    if (
      !menuOpen &&
      !state.mobileMode &&
      typeof state.mouseClientX === 'number' &&
      typeof state.mouseClientY === 'number'
    ) {
      const hit = raycastScreenToWorld(state.mouseClientX, state.mouseClientY);
      if (hit) {
        state.mobaAimWorld = hit;
        if (state.mobaRightMouseDown || isControlDown('mobaMove')) {
          applyMobaMoveCommand(hit, false);
        }
      }
    }
  }
  updateMobaVirtualCursorUI();

  // Rend automatiquement semi-transparent tout arbre / toit / décor qui coupe la vue caméra -> cible
  const ax = camera.position.x;
  const ay = camera.position.y;
  const az = camera.position.z;
  const bx = occTargetX;
  const by = occTargetY;
  const bz = occTargetZ;
  const fadeStep = Math.min(1, 14 * (dt || 0.016));
  for (let i = 0; i < cameraTreeOccluders.length; i++) {
    const occ = cameraTreeOccluders[i];
    const clearRadius = occ.r + 1.25;
    const dSq = distSqSegmentToVerticalCapsule(ax, ay, az, bx, by, bz, occ.x, occ.y0, occ.y1, occ.z);
    const isOccluded = dSq < clearRadius * clearRadius;
    const targetAlpha = isOccluded ? 0.24 : 1.0;
    occ.fadeAlpha = occ.fadeAlpha + (targetAlpha - occ.fadeAlpha) * fadeStep;
    occ.node.visible = true;

    if (occ.matStates && occ.matStates.length > 0) {
      const useBlend = occ.fadeAlpha < 0.992;
      for (let mIdx = 0; mIdx < occ.matStates.length; mIdx++) {
        const ms = occ.matStates[mIdx];
        if (useBlend) {
          ms.mat.transparent = true;
          ms.mat.opacity = Math.max(
            0.08,
            ms.baseOpacity * (ms.isOutline ? occ.fadeAlpha * 0.45 : occ.fadeAlpha)
          );
          ms.mat.depthWrite = false;
        } else {
          ms.mat.transparent = ms.baseTransparent;
          ms.mat.opacity = ms.baseOpacity;
          ms.mat.depthWrite = ms.baseDepthWrite;
        }
      }
    }
  }
}

// --- CÔNES DE VISION 3D CLAIRS AU SOL EN VUE AÉRIENNE (MOBA) ---
const AERIAL_CONE_PROFILE_HIGH = { steps: 42, backSteps: 12, rings: 24, lineSubdiv: 10 };
const AERIAL_CONE_PROFILE_LOW = { steps: 22, backSteps: 6, rings: 5, lineSubdiv: 2 };
const AERIAL_CONE_MAX_RAYS = AERIAL_CONE_PROFILE_HIGH.steps + AERIAL_CONE_PROFILE_HIGH.backSteps;
const _aerialConeXY = new Float64Array((AERIAL_CONE_MAX_RAYS + 2) * 2);
let aerialVisionGroup = null;
let aerialConeFrameCounter = 0;
let _lastControlsHelpVanilla = null;
const aerialConePool = [];

function ensureAerialConeEntry(idx, team, profile = AERIAL_CONE_PROFILE_HIGH) {
  if (!aerialVisionGroup) {
    aerialVisionGroup = new THREE.Group();
    scene.add(aerialVisionGroup);
  }
  const rays = profile.steps + profile.backSteps;
  const rings = profile.rings;
  const lineSubdiv = profile.lineSubdiv;
  const profileKey = `${rays}x${rings}x${lineSubdiv}`;

  if (aerialConePool[idx]) {
    const existing = aerialConePool[idx];
    if (existing.profileKey === profileKey) {
      if (existing.team !== team) {
        existing.team = team;
        existing.fillMat.color.setHex(team === 'ally' ? 0xfef08a : 0xe9d5ff);
        existing.lineMat.color.setHex(team === 'ally' ? 0xfacc15 : 0xc084fc);
      }
      return existing;
    }
    if (aerialVisionGroup && existing.root) {
      aerialVisionGroup.remove(existing.root);
    }
    existing.fillGeo?.dispose?.();
    existing.lineGeo?.dispose?.();
    existing.fillMat?.dispose?.();
    existing.lineMat?.dispose?.();
  }

  const vertCount = 1 + rays * rings;
  const fillPos = new Float32Array(vertCount * 3);
  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));

  const indices = [];
  for (let k = 0; k < rays; k++) {
    const kn = (k + 1) % rays;
    indices.push(0, 1 + kn, 1 + k);
    for (let r = 0; r < rings - 1; r++) {
      const a = 1 + r * rays + k;
      const b = 1 + r * rays + kn;
      const c = 1 + (r + 1) * rays + kn;
      const d = 1 + (r + 1) * rays + k;
      indices.push(a, b, c, a, c, d);
    }
  }
  fillGeo.setIndex(indices);

  const fillMat = new THREE.MeshBasicMaterial({
    color: team === 'ally' ? 0xfef08a : 0xe9d5ff,
    transparent: true,
    opacity: team === 'ally' ? 0.22 : 0.20,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  fillMesh.frustumCulled = false;
  fillMesh.renderOrder = 4 + idx * 2;

  const linePos = new Float32Array(rays * lineSubdiv * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: team === 'ally' ? 0xfacc15 : 0xc084fc,
    transparent: true,
    opacity: team === 'ally' ? 0.78 : 0.74,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5
  });
  const lineMesh = new THREE.LineLoop(lineGeo, lineMat);
  lineMesh.frustumCulled = false;
  lineMesh.renderOrder = 5 + idx * 2;

  const root = new THREE.Group();
  root.add(fillMesh);
  root.add(lineMesh);
  aerialVisionGroup.add(root);

  const entry = {
    team,
    profileKey,
    rays,
    rings,
    lineSubdiv,
    hasGeometryData: false,
    root,
    fillGeo,
    fillPos,
    fillMat,
    lineGeo,
    linePos,
    lineMat
  };
  aerialConePool[idx] = entry;
  return entry;
}

export function updateAerialVisionCones3D() {
  if (state.cameraMode !== 'aerial' || state.phase !== 'play') {
    if (aerialVisionGroup) aerialVisionGroup.visible = false;
    return;
  }
  if (!aerialVisionGroup) {
    aerialVisionGroup = new THREE.Group();
    scene.add(aerialVisionGroup);
  }
  aerialVisionGroup.visible = true;

  const isLowSpec = !!state.lowSpecMode;
  const profile = isLowSpec ? AERIAL_CONE_PROFILE_LOW : AERIAL_CONE_PROFILE_HIGH;
  aerialConeFrameCounter = (aerialConeFrameCounter + 1) % 2;
  const rebuildThisFrame = !isLowSpec || aerialConeFrameCounter === 1;

  const visionMode = state.minimapVisionMode || 'both';
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const entry = ensureAerialConeEntry(i, p.team, profile);
    const wasVisible = !!entry.root.visible;
    if (p.tutorialHidden) {
      entry.root.visible = false;
      continue;
    }
    const isMyTeam = p.team === state.myTeam;
    const showCone =
      isMyTeam ||
      visionMode === 'omniscient' ||
      (visionMode === 'both' && p.visibleTo && p.visibleTo[state.myTeam]);

    if (!showCone) {
      entry.root.visible = false;
      continue;
    }

    if (!rebuildThisFrame && entry.hasGeometryData && wasVisible) {
      entry.root.visible = true;
      continue;
    }

    const rays = entry.rays;
    const rings = entry.rings;
    const lineSubdiv = entry.lineSubdiv;
    const count = fillPlayerVisionPolygonFlat(p, profile.steps, profile.backSteps, _aerialConeXY);
    if (count !== rays) {
      entry.root.visible = false;
      continue;
    }

    entry.root.visible = true;
    const yBase = 0.20 + i * 0.036;
    const ox = p.pos.x;
    const oz = p.pos.z;
    const oy = getTerrainY(ox, oz) + yBase;

    const fp = entry.fillPos;
    const lp = entry.linePos;
    fp[0] = ox;
    fp[1] = oy;
    fp[2] = oz;

    for (let k = 0; k < rays; k++) {
      const px = _aerialConeXY[k * 2];
      const pz = _aerialConeXY[k * 2 + 1];
      for (let r = 0; r < rings; r++) {
        const frac = (r + 1) / rings;
        const rx = ox + (px - ox) * frac;
        const rz = oz + (pz - oz) * frac;
        const ry = getTerrainY(rx, rz) + yBase;
        const vOff = (1 + r * rays + k) * 3;
        fp[vOff] = rx;
        fp[vOff + 1] = ry;
        fp[vOff + 2] = rz;
      }

      const kn = (k + 1) % rays;
      const nx = _aerialConeXY[kn * 2];
      const nz = _aerialConeXY[kn * 2 + 1];
      for (let s = 0; s < lineSubdiv; s++) {
        const u = s / lineSubdiv;
        const lx = px + (nx - px) * u;
        const lz = pz + (nz - pz) * u;
        const ly = getTerrainY(lx, lz) + yBase + 0.045;
        const lOff = (k * lineSubdiv + s) * 3;
        lp[lOff] = lx;
        lp[lOff + 1] = ly;
        lp[lOff + 2] = lz;
      }
    }

    entry.fillGeo.attributes.position.needsUpdate = true;
    entry.lineGeo.attributes.position.needsUpdate = true;
    entry.hasGeometryData = true;
  }

  for (let i = players.length; i < aerialConePool.length; i++) {
    if (aerialConePool[i]) aerialConePool[i].root.visible = false;
  }
}

export function updateFloatingLabels() {
  updateTeamVisionState();
  const vp = getViewportSize();
  const halfW = vp.w / 2;
  const halfH = vp.h / 2;
  const controlled = getPlayer(state.myTeam, state.controlledRole);

  const showInPlay = state.phase === 'play' && !isMenuOpen();

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const lbl = p.mesh.labelEl;
    if (p.tutorialHidden) {
      if (p.mesh._lblDisplay !== 'none') {
        lbl.style.display = 'none';
        p.mesh._lblDisplay = 'none';
      }
      hideLeafDurationBadge(p.mesh.leafBadge);
      continue;
    }
    const isMyTeam = p.team === state.myTeam;
    if (!isMyTeam) {
      const visibleToMyTeam = !!(p.visibleTo && p.visibleTo[state.myTeam]);
      const lineOfSightFromMe = controlled
        ? hasClearLineOfSight(controlled.pos, p.pos, false)
        : hasClearLineOfSight(camera.position, p.pos, true);
      const hiddenInBrush =
        p.state === 'standing' &&
        !!isPointInJungleBush(p.pos) &&
        !hasAllyVisionNear(p.pos, VISION_SPEC.bushSpotRange, state.myTeam);

      // Si le personnage adverse est hors de vue de toute l'équipe ou caché derrière un élément du décor,
      // son étiquette ne doit pas apparaître au-dessus de sa tête à travers le décor !
      if (hiddenInBrush || !visibleToMyTeam || !lineOfSightFromMe) {
        if (p.mesh._lblDisplay !== 'none') {
          lbl.style.display = 'none';
          p.mesh._lblDisplay = 'none';
        }
        hideLeafDurationBadge(p.mesh.leafBadge);
        continue;
      }
    }

    if (showInPlay && p.leafUltTimer > 0 && p.state === 'standing' && !p.carryingBall) {
      const sMult = p.leafUltSpeedMult || LEAF_ULT_SPEED_MULT;
      const sMax = p.leafUltMaxDuration || LEAF_ULT_SPRINT_DURATION;
      updateLeafDurationBadge(
        p.mesh.leafBadge,
        p.pos.x,
        p.pos.y + 1.55,
        p.pos.z,
        `🌿 x${sMult} · ${p.leafUltTimer.toFixed(1)}s`,
        p.leafUltTimer / sMax,
        p.leafUltTimer <= 0.6 ? 'expiring' : ''
      );
    } else if (
      showInPlay &&
      controlled &&
      p === controlled &&
      p.boomerangWindow > 0 &&
      p.dashTimer <= 0 &&
      p.state === 'standing' &&
      !p.carryingBall
    ) {
      updateLeafDurationBadge(
        p.mesh.leafBadge,
        p.pos.x,
        p.pos.y + 1.55,
        p.pos.z,
        `🪃 Retour [${formatActionBindingText('dash')}] ${p.boomerangWindow.toFixed(1)}s`,
        p.boomerangWindow / 2.0,
        p.boomerangWindow <= 0.6 ? 'expiring' : 'sprouting'
      );
    } else {
      hideLeafDurationBadge(p.mesh.leafBadge);
    }

    _tmpProjVec.set(p.pos.x, p.pos.y + (p.state === 'sitting' ? 2.1 : 2.95), p.pos.z);
    _tmpProjVec.project(camera);

    if (_tmpProjVec.z > 1) {
      if (p.mesh._lblDisplay !== 'none') {
        lbl.style.display = 'none';
        p.mesh._lblDisplay = 'none';
      }
      continue;
    }

    const x = Math.round((_tmpProjVec.x * halfW + halfW) * 2) / 2;
    const y = Math.round((-(_tmpProjVec.y * halfH) + halfH) * 2) / 2;
    if (p.mesh._lblDisplay !== 'flex') {
      lbl.style.display = 'flex';
      p.mesh._lblDisplay = 'flex';
    }
    if (p.mesh._lblLeft !== x) {
      lbl.style.left = `${x}px`;
      p.mesh._lblLeft = x;
    }
    if (p.mesh._lblTop !== y) {
      lbl.style.top = `${y}px`;
      p.mesh._lblTop = y;
    }

    const showColor =
      isMyTeam ||
      p.currentlySeeingBack ||
      p.backRevealed ||
      p.state === 'sitting' ||
      p.state === 'rule1';

    const cInfo = COLORS[p.color];
    const dotHtml = showColor
      ? `<span class="mini-dot" style="background:${cInfo.css}"></span><span>${cInfo.symbol}</span>`
      : `<span class="mini-dot" style="background:#64748b"></span><span>?</span>`;

    const inBush = p.state === 'standing' && !!isPointInJungleBush(p.pos);
    lbl.classList.toggle('in-bush', inBush);

    let statusTag = '';
    if (p.state === 'sitting') statusTag = ' (Assise)';
    else if (p.state === 'rule1') statusTag = ' ⚡ RÈGLE 1';
    else if (p.isAirborne || p.isLaunching) statusTag = p.carryingBall ? ' 🚀⚽' : ' 🚀';
    else if (p.carryingBall) statusTag = ' ⚽';

    const stealthTag = inBush ? ` ${STEALTH_BADGE_HTML}` : '';
    const powerIconsHtml = buildPowerIconsHtml(p.team, p.role);

    const allyHuman = isMyTeam ? getRoleHumanController(p.team, p.role) : null;
    const roleOwnerTag = allyHuman ? ` • 👤 ${escapeHtml(allyHuman.name)}` : '';
    const nextHtml = `${dotHtml} <span>${isMyTeam ? p.role + roleOwnerTag : 'Adv ' + p.role}${statusTag}</span>${stealthTag}${powerIconsHtml ? ' ' + powerIconsHtml : ''}`;
    if (p.mesh._lblHtml !== nextHtml) {
      lbl.innerHTML = nextHtml;
      p.mesh._lblHtml = nextHtml;
    }
  }

  let wallBadgeIdx = 0;
  if (showInPlay && activeLeafWalls.length > 0) {
    for (let w = 0; w < activeLeafWalls.length; w++) {
      const wall = activeLeafWalls[w];
      if (!wall || wall.nodes.length === 0 || wall.phase === 'sprinting') continue;
      if (wall.phase === 'germinating') {
        const rem = Math.max(0, wall.growDelayTimer);
        const badge = getLeafWallBadge(wallBadgeIdx++);
        updateLeafWallBadgeInView(
          badge,
          wall,
          `🌱 Mur ${rem.toFixed(1)}s`,
          1 - rem / LEAF_ULT_GROW_DELAY,
          'sprouting'
        );
      } else if (wall.phase === 'grown') {
        const rem = Math.max(0, wall.wallTimer);
        const maxWall = wall.wallMaxDuration || LEAF_ULT_WALL_DURATION;
        const badge = getLeafWallBadge(wallBadgeIdx++);
        updateLeafWallBadgeInView(
          badge,
          wall,
          `🌳 Mur · ${rem.toFixed(1)}s`,
          rem / maxWall,
          rem <= 1.4 ? 'expiring' : ''
        );
      }
    }
  }
  for (let b = wallBadgeIdx; b < leafWallBadges.length; b++) {
    hideLeafDurationBadge(leafWallBadges[b]);
  }

  if (
    showInPlay &&
    controlled &&
    controlled.state === 'standing' &&
    !controlled.carryingBall &&
    controlled.dashCooldown > 0
  ) {
    _tmpProjVec.copy(controlled.pos);
    _tmpProjVec.project(camera);
    if (_tmpProjVec.z <= 1) {
      const rawX = _tmpProjVec.x * halfW + halfW;
      const rawY = -(_tmpProjVec.y * halfH) + halfH;
      const clampedX = Math.round(Math.max(40, Math.min(window.innerWidth - 40, rawX)) * 2) / 2;
      const clampedY = Math.round(Math.max(24, Math.min(window.innerHeight - 72, rawY)) * 2) / 2;
      const maxCd = controlled.dashCooldownMax || DASH_COOLDOWN;
      const ratio = Math.max(0, Math.min(1, controlled.dashCooldown / maxCd));
      const deg = (ratio * 360).toFixed(1);

      if (!_dashDomCache.visible) {
        dashCooldownEl.classList.remove('hidden');
        _dashDomCache.visible = true;
      }
      const leftStr = `${clampedX}px`;
      const topStr = `${clampedY}px`;
      if (_dashDomCache.left !== leftStr) {
        dashCooldownEl.style.left = leftStr;
        _dashDomCache.left = leftStr;
      }
      if (_dashDomCache.top !== topStr) {
        dashCooldownEl.style.top = topStr;
        _dashDomCache.top = topStr;
      }
      const fillCol = controlled.dashIsSuper ? '#38bdf8' : '#12d612';
      const bgCol = controlled.dashIsSuper ? 'rgba(8, 47, 73, 0.82)' : 'rgba(10, 48, 16, 0.78)';
      const pieBg = `conic-gradient(${fillCol} 0deg ${deg}deg, ${bgCol} ${deg}deg 360deg)`;
      if (_dashDomCache.bg !== pieBg) {
        dashCooldownPieEl.style.background = pieBg;
        _dashDomCache.bg = pieBg;
      }
      const cdTxt = controlled.dashCooldown.toFixed(1);
      if (_dashDomCache.text !== cdTxt) {
        dashCooldownTextEl.textContent = cdTxt;
        _dashDomCache.text = cdTxt;
      }
    } else if (_dashDomCache.visible) {
      dashCooldownEl.classList.add('hidden');
      _dashDomCache.visible = false;
    }
  } else if (_dashDomCache.visible) {
    dashCooldownEl.classList.add('hidden');
    _dashDomCache.visible = false;
  }

  const tutOverheadEl = document.getElementById('tut-overhead-objective');
  if (tutOverheadEl) {
    const nextItem =
      state.mode === 'tutorial' && state.phase === 'play' && !isMenuOpen() && controlled
        ? ctx.api.getNextTutorialObjectiveItem()
        : null;
    if (nextItem) {
      _tmpProjVec.set(
        controlled.pos.x,
        controlled.pos.y + (controlled.state === 'sitting' ? 2.1 : 2.95),
        controlled.pos.z
      );
      _tmpProjVec.project(camera);
      if (_tmpProjVec.z <= 1) {
        const ohX = Math.round(Math.max(110, Math.min(window.innerWidth - 110, _tmpProjVec.x * halfW + halfW)) * 2) / 2;
        const ohY = Math.round(Math.max(104, -(_tmpProjVec.y * halfH) + halfH - 28) * 2) / 2;
        tutOverheadEl.classList.remove('hidden');
        tutOverheadEl.style.left = `${ohX}px`;
        tutOverheadEl.style.top = `${ohY}px`;
        if (tutOverheadEl.textContent !== nextItem.overhead) {
          tutOverheadEl.textContent = nextItem.overhead;
        }
      } else {
        tutOverheadEl.classList.add('hidden');
      }
    } else if (state.mode === 'tutorial' && state.phase === 'play' && state.tutorialStep === 5 && !isMenuOpen() && controlled) {
      _tmpProjVec.set(controlled.pos.x, controlled.pos.y + 2.95, controlled.pos.z);
      _tmpProjVec.project(camera);
      if (_tmpProjVec.z <= 1) {
        const ohX = Math.round(Math.max(110, Math.min(window.innerWidth - 110, _tmpProjVec.x * halfW + halfW)) * 2) / 2;
        const ohY = Math.round(Math.max(104, -(_tmpProjVec.y * halfH) + halfH - 28) * 2) / 2;
        const doneMsg = '🎉 Bravo ! Tutoriel terminé — retour au menu...';
        tutOverheadEl.classList.remove('hidden');
        tutOverheadEl.style.left = `${ohX}px`;
        tutOverheadEl.style.top = `${ohY}px`;
        if (tutOverheadEl.textContent !== doneMsg) tutOverheadEl.textContent = doneMsg;
      } else {
        tutOverheadEl.classList.add('hidden');
      }
    } else {
      tutOverheadEl.classList.add('hidden');
    }
  }
}


function isPauseUIActive() {
  if (state.phase !== 'play') return false;
  const pauseEl = document.getElementById('pause-modal');
  const optsEl = document.getElementById('options-modal');
  return !!(
    (pauseEl && !pauseEl.classList.contains('hidden')) ||
    (optsEl && !optsEl.classList.contains('hidden'))
  );
}

export function updateTopHUD() {
  document.getElementById('ally-pv').textContent = state.allyPV;
  document.getElementById('ally-pe').textContent = state.mode === 'practice' ? '∞' : state.allyPE;
  document.getElementById('enemy-pv').textContent = state.enemyPV;
  document.getElementById('enemy-pe').textContent = state.mode === 'practice' ? '∞' : state.enemyPE;

  const tagAlly = document.getElementById('hud-tag-ally');
  const tagEnemy = document.getElementById('hud-tag-enemy');
  if (tagAlly && tagEnemy) {
    tagAlly.textContent = state.myTeam === 'ally' ? 'Équipe Or (Vous)' : 'Équipe Or';
    tagEnemy.textContent = state.myTeam === 'enemy' ? 'Équipe Violette (Vous)' : 'Équipe Violette';
  }

  document.getElementById('round-label').textContent =
    state.mode === 'tutorial'
      ? `TUTORIEL (${Math.min(5, Math.max(1, state.tutorialStep || 1))}/5)`
      : state.mode === 'practice'
      ? mp.enabled
        ? `PRATIQUE MULTI • SALON ${mp.roomCode}`
        : 'UN TOUR POUR RIEN (PRATIQUE)'
      : mp.enabled
      ? `SALON ${mp.roomCode} • RONDE ${state.round}`
      : `RONDE ${state.round}`;

  const isPaused = isPauseUIActive();
  document.getElementById('phase-label').textContent = isPaused
    ? mp.enabled
      ? '⏸️ Pause • Le jeu continue'
      : '⏸️ Pause • Le jeu est arrêté'
    : state.phase === 'prep'
    ? 'Préparation'
    : 'Exécution';

  const myMeta = state.teams[state.myTeam];
  const bounties = [];
  if (myMeta.activeBountyPE) bounties.push('Pari +3 🪙 PO');
  if (myMeta.activeBountyPV) bounties.push('Pari +2 pts');
  document.getElementById('bounty-status').textContent =
    state.mode === 'practice'
      ? 'Mode Pratique : Sans IA • [B] Magasin (🪙 ∞) • [Échap] Menu'
      : state.mode === 'tutorial'
      ? '🏆 Ballons → Cerceau (Pts) • 💥 Interceptions → 🪙 Pièces (Améliorations)'
      : bounties.length > 0
      ? `Actif : ${bounties.join(', ')}`
      : 'Objectif : 7 pts (écart de 2)';

  const quickShopBtn = document.getElementById('btn-quick-practice-shop');
  if (quickShopBtn) {
    quickShopBtn.classList.toggle('hidden', !(state.mode === 'practice' && state.phase === 'play'));
  }

  const endRoundBtn = document.getElementById('btn-end-round');
  if (endRoundBtn) {
    endRoundBtn.classList.toggle('hidden', state.mode === 'tutorial' || state.mode === 'practice');
  }
}

export function updateRosterHUD() {
  const allyList = document.getElementById('ally-roster-list');
  const enemyList = document.getElementById('enemy-roster-list');
  allyList.innerHTML = '';
  enemyList.innerHTML = '';

  const myTeamKey = state.myTeam;
  const oppTeamKey = state.myTeam === 'ally' ? 'enemy' : 'ally';
  const myMeta = state.teams[myTeamKey];

  ['G', 'C', 'D'].forEach((role, idx) => {
    const p = getPlayer(myTeamKey, role);
    if (!p || p.tutorialHidden) return;
    const c = COLORS[p.color];
    const humanOwner = getRoleHumanController(myTeamKey, role);
    const isMine = state.controlledRole === role && !humanOwner;
    const row = document.createElement('div');
    row.className = `player-row ${isMine ? 'active-controlled' : ''} ${humanOwner ? 'locked-by-human' : ''} ${p.state === 'sitting' ? 'sitting' : ''}`;
    row.onclick = () => selectControlledRole(role);

    let status = 'Debout';
    if (p.state === 'sitting') status = '🪑 Assise';
    else if (p.state === 'rule1') status = '⚡ Règle 1';
    else if (p.carryingBall) status = '⚽ Ballon';

    const inBush = p.state === 'standing' && !!isPointInJungleBush(p.pos);

    const pwr = (myMeta.powers && myMeta.powers[role]) || {};
    const pwrBadges = INDIVIDUAL_POWERS.filter(
      (pw) =>
        (!pw.vanillaOnly || state.vanillaMode) &&
        (!state.vanillaMode || pw.key === 'throwBall' || pw.key === 'standUp') &&
        hasRoleEvolutionItem(pwr, pw)
    )
      .map((pw) => `<span title="${pw.shortLabel}">${pw.icon}</span>`)
      .join('');

    const ultMeta = getUltimateMeta(p.color, p);
    const ultBadgeHtml =
      isUltimateUnlocked()
        ? p.ultUsed
          ? `<span class="ult-mini-badge used" title="Ultimate utilisé (${ultMeta.name})">✔ Ult</span>`
          : `<span class="ult-mini-badge ready" title="Ultimate prêt : ${ultMeta.name} ([R] puis Clic Gauche)">${ultMeta.icon} R</span>`
        : '';

    row.innerHTML = `
      <div class="player-role-key">
        <span class="key-hint">${humanOwner ? '🔒' : idx + 1}</span>
        <span>Joueuse ${role}</span>
      </div>
      <div class="player-status-icons">
        ${humanOwner ? `<span style="font-size:0.72rem; color:#38bdf8; font-weight:800;">👤 ${escapeHtml(humanOwner.name)}</span>` : ''}
        ${inBush ? STEALTH_BADGE_HTML : ''}
        ${pwrBadges ? `<span style="font-size:0.78rem;">${pwrBadges}</span>` : ''}
        ${ultBadgeHtml}
        <span>${status}</span>
        <span class="color-badge ${c.id}">${c.name} (${c.symbol})</span>
      </div>
    `;
    allyList.appendChild(row);
  });

  let revealedCount = 0;
  let totalEnemies = 0;

  ['G', 'C', 'D'].forEach((role) => {
    const p = getPlayer(oppTeamKey, role);
    if (!p || p.tutorialHidden) return;
    totalEnemies++;
    const c = COLORS[p.color];
    const inSight = !!(p.visibleTo && p.visibleTo[myTeamKey]);
    const isKnown =
      p.currentlySeeingBack ||
      p.backRevealed ||
      p.state === 'sitting' ||
      p.state === 'rule1';
    if (isKnown) revealedCount++;

    const row = document.createElement('div');
    row.className = `player-row ${p.state === 'sitting' ? 'sitting' : ''}`;

    let status = !inSight
      ? '🌫️ Hors vue'
      : p.currentlySeeingBack
      ? '👁️ Dos visible'
      : '👁️ En vue';
    if (p.state === 'sitting') status = '🪑 Assise';
    else if (p.state === 'rule1') status = '⚡ Règle 1';
    else if (inSight && p.carryingBall) status = '⚽ Ballon';

    const oppInBushSpotted = inSight && p.state === 'standing' && !!isPointInJungleBush(p.pos);

    const oppMeta = state.teams[oppTeamKey];
    const oppPwr = (oppMeta && oppMeta.powers && oppMeta.powers[role]) || {};
    const oppBadges = INDIVIDUAL_POWERS.filter(
      (pw) =>
        (!pw.vanillaOnly || state.vanillaMode) &&
        (!state.vanillaMode || pw.key === 'throwBall' || pw.key === 'standUp') &&
        hasRoleEvolutionItem(oppPwr, pw)
    )
      .map((pw) => `<span title="${pw.shortLabel}">${pw.icon}</span>`)
      .join('');

    row.innerHTML = `
      <div class="player-role-key">
        <span>Adversaire ${role}</span>
      </div>
      <div class="player-status-icons">
        ${oppInBushSpotted ? STEALTH_BADGE_HTML : ''}
        ${oppBadges ? `<span style="font-size:0.75rem;">${oppBadges}</span>` : ''}
        <span>${status}</span>
        ${
          isKnown
            ? `<span class="color-badge ${c.id}">${c.name} (${c.symbol})</span>`
            : `<span class="color-badge unknown">Dos caché (?)</span>`
        }
      </div>
    `;
    enemyList.appendChild(row);
  });

  const nbBadge = document.getElementById('notebook-badge');
  if (nbBadge) {
    nbBadge.textContent = `👁️ ${revealedCount}/${totalEnemies || 3} repérés`;
  }
  updateUltHudWidget();
  if (_lastControlsHelpVanilla !== !!state.vanillaMode) {
    _lastControlsHelpVanilla = !!state.vanillaMode;
    updateControlsHelpForCameraMode();
  }
}

// --- SOUS-MENUS UI (ACCUEIL, PHASE PRÉPARATOIRE & HUD) ---
export function switchWelcomeSubmenu(tabId = 'play') {
  const valid = ['play', 'rules'];
  const target = valid.includes(tabId) ? tabId : 'play';
  state.welcomeTab = target;

  valid.forEach((id) => {
    const pane = document.getElementById(`welcome-pane-${id}`);
    if (pane) pane.classList.toggle('hidden', id !== target);
  });

  const tabBar = document.getElementById('welcome-submenu-tabs');
  if (tabBar && tabBar.children) {
    Array.from(tabBar.children).forEach((btn) => {
      const bTab = btn.getAttribute && btn.getAttribute('data-welcome-tab');
      if (bTab) btn.classList.toggle('active', bTab === target);
    });
  }
}

export function applyPrepShopCategoryFilter() {
  const tab = state.prepTab || 'dossards';
  const dossardsEl = document.getElementById('prep-dossards-section');
  const shopEl = document.getElementById('shop-container');
  const evoStatusBar = document.getElementById('shop-evo-status-bar');
  const headingEl = document.getElementById('shop-category-heading');
  const shopGrid = document.getElementById('shop-items-grid');
  const openShopBtn = document.getElementById('btn-prep-open-shop');

  if (dossardsEl) {
    dossardsEl.classList.toggle('hidden', tab === 'individual' || tab === 'collective');
  }
  if (shopEl) {
    shopEl.classList.toggle('hidden', tab === 'dossards');
  }
  if (evoStatusBar) {
    evoStatusBar.style.display = tab === 'collective' ? 'none' : 'grid';
  }
  if (headingEl) {
    headingEl.textContent =
      tab === 'individual'
        ? '⚡ Pouvoirs Individuels (Attribution à G, C ou D)'
        : tab === 'collective'
        ? "🛡️ Bonus Collectifs d'Équipe & Dossards"
        : '🛒 Magasin Complet (Individuels & Équipe)';
  }
  if (shopGrid && shopGrid.children) {
    Array.from(shopGrid.children).forEach((itemEl) => {
      const cat = itemEl.getAttribute && itemEl.getAttribute('data-shop-cat');
      const hide =
        (tab === 'individual' && cat === 'collective') ||
        (tab === 'collective' && cat === 'individual');
      itemEl.classList.toggle('hidden-by-tab', !!hide);
    });
  }
  if (openShopBtn) {
    if (tab === 'dossards') {
      openShopBtn.textContent =
        state.mode === 'practice'
          ? '🛒 Ouvrir le Magasin (🪙 ∞) →'
          : ctx.api.isShopAvailable()
          ? `🛒 Ouvrir le Magasin (${getTeamPE(state.myTeam)} 🪙 PO) →`
          : '🛒 Aperçu du Magasin (Ronde 3) →';
    } else if (tab === 'individual') {
      openShopBtn.textContent = "🛡️ Voir Bonus d'Équipe →";
    } else {
      openShopBtn.textContent = '🎽 Retour aux Dossards (G / C / D)';
    }
  }
}

export function switchPrepSubmenu(tabId = 'dossards') {
  const valid = ['dossards', 'individual', 'collective', 'all'];
  const target = valid.includes(tabId) ? tabId : 'dossards';
  state.prepTab = target;

  const tabBar = document.getElementById('prep-submenu-tabs');
  if (tabBar && tabBar.children) {
    Array.from(tabBar.children).forEach((btn) => {
      const bTab = btn.getAttribute && btn.getAttribute('data-prep-tab');
      if (bTab) btn.classList.toggle('active', bTab === target);
    });
  }
  applyPrepShopCategoryFilter();
}

export function switchHudLeftSubmenu(tabId = 'roster') {
  const target = tabId === 'rps' ? 'rps' : 'roster';
  state.hudLeftTab = target;
  state.hudLeftCollapsed = false;

  const rosterPanel = document.getElementById('roster-panel');
  const leftBody = document.getElementById('hud-left-body');
  const rosterPane = document.getElementById('hud-pane-roster');
  const rpsPane = document.getElementById('rps-widget');
  const btnRoster = document.getElementById('btn-hud-tab-roster');
  const btnRps = document.getElementById('btn-hud-tab-rps');
  const btnCollapse = document.getElementById('btn-hud-collapse-left');

  if (rosterPanel) rosterPanel.classList.remove('hud-collapsed');
  if (leftBody) leftBody.classList.remove('hidden');
  if (rosterPane) rosterPane.classList.toggle('hidden', target !== 'roster');
  if (rpsPane) rpsPane.classList.toggle('hidden', target !== 'rps');
  if (btnRoster) btnRoster.classList.toggle('active', target === 'roster');
  if (btnRps) btnRps.classList.toggle('active', target === 'rps');
  if (btnCollapse) btnCollapse.textContent = '▾';
}

export function toggleHudLeftCollapse() {
  state.hudLeftCollapsed = !state.hudLeftCollapsed;
  const rosterPanel = document.getElementById('roster-panel');
  const leftBody = document.getElementById('hud-left-body');
  const btnCollapse = document.getElementById('btn-hud-collapse-left');
  if (rosterPanel) rosterPanel.classList.toggle('hud-collapsed', state.hudLeftCollapsed);
  if (leftBody) leftBody.classList.toggle('hidden', state.hudLeftCollapsed);
  if (btnCollapse) btnCollapse.textContent = state.hudLeftCollapsed ? '▸' : '▾';
}

export function toggleControlsHelpSubmenu() {
  const el = document.getElementById('controls-help');
  if (!el) return;
  el.classList.toggle('collapsed-submenu');
}

// --- MINIMAP DYNAMIQUE & CÔNES DE VISION PAR ÉQUIPE ---
let minimapCanvas = null;
let minimapCtx = null;
let minimapSpottedEl = null;
let minimapStaticBgCanvas = null;
let minimapStaticFgCanvas = null;
let minimapStaticKey = '';
let minimapLastSpottedTxt = '';
const _minimapConeXY = new Float64Array(80);

function buildMinimapStaticLayers(W, H, mapMeta) {
  const toX = (wx) => ((wx + FIELD.width / 2) / FIELD.width) * W;
  const toY = (wz) => ((wz + FIELD.depth / 2) / FIELD.depth) * H;
  const toR = (wr) => (wr / FIELD.width) * W;

  if (!minimapStaticBgCanvas) minimapStaticBgCanvas = document.createElement('canvas');
  if (!minimapStaticFgCanvas) minimapStaticFgCanvas = document.createElement('canvas');
  minimapStaticBgCanvas.width = W;
  minimapStaticBgCanvas.height = H;
  minimapStaticFgCanvas.width = W;
  minimapStaticFgCanvas.height = H;

  const bgCtx = minimapStaticBgCanvas.getContext('2d');
  const fgCtx = minimapStaticFgCanvas.getContext('2d');
  if (!bgCtx || !fgCtx) return false;

  // Couche 1 : Fond du parc + repères aquatiques/pistes + couloirs
  bgCtx.clearRect(0, 0, W, H);
  bgCtx.fillStyle = mapMeta.minimapBg || '#071122';
  bgCtx.fillRect(0, 0, W, H);

  if (mapMeta.decorStyle === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    bgCtx.fillStyle = 'rgba(14, 165, 233, 0.34)';
    bgCtx.beginPath();
    bgCtx.ellipse(toX(0), toY(0), Math.max(8, toR(lf.pondRx)), Math.max(4, (lf.pondRz / FIELD.depth) * H), 0, 0, Math.PI * 2);
    bgCtx.fill();

    // Pont vertical Nord-Sud au milieu de l'étang horizontal + 2 fontaines Ouest/Est
    bgCtx.fillStyle = 'rgba(217, 119, 6, 0.72)';
    const bx0 = toX(-lf.bridgeHalfX);
    const bx1 = toX(lf.bridgeHalfX);
    const bz0 = toY(-lf.bridgeHalfZ);
    const bz1 = toY(lf.bridgeHalfZ);
    bgCtx.fillRect(bx0, bz0, bx1 - bx0, bz1 - bz0);
    bgCtx.strokeStyle = '#e2e8f0';
    bgCtx.lineWidth = 1.2;
    bgCtx.strokeRect(bx0, bz0, bx1 - bx0, bz1 - bz0);

    [-lf.fountainX, lf.fountainX].forEach((fx) => {
      bgCtx.beginPath();
      bgCtx.arc(toX(fx), toY(0), Math.max(2.5, toR(lf.fountainR)), 0, Math.PI * 2);
      bgCtx.fillStyle = 'rgba(224, 242, 254, 0.65)';
      bgCtx.fill();
    });
  } else if (mapMeta.decorStyle === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    // Étang autour de l'île centrale + 2 ponts Est-Ouest
    bgCtx.fillStyle = 'rgba(14, 165, 233, 0.34)';
    bgCtx.beginPath();
    bgCtx.ellipse(toX(0), toY(0), Math.max(8, toR(sv.pondRx)), Math.max(6, (sv.pondRz / FIELD.depth) * H), 0, 0, Math.PI * 2);
    bgCtx.fill();

    bgCtx.fillStyle = '#15803d';
    bgCtx.beginPath();
    bgCtx.ellipse(toX(0), toY(0), Math.max(5, toR(sv.islandRx)), Math.max(4, (sv.islandRz / FIELD.depth) * H), 0, 0, Math.PI * 2);
    bgCtx.fill();
    bgCtx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
    bgCtx.lineWidth = 1.2;
    bgCtx.stroke();

    bgCtx.fillStyle = 'rgba(217, 119, 6, 0.8)';
    const bz0 = toY(-sv.bridgeHalfZ);
    const bh = toY(sv.bridgeHalfZ) - bz0;
    [
      [-sv.bridgeOuterX, -sv.bridgeInnerX],
      [sv.bridgeInnerX, sv.bridgeOuterX]
    ].forEach(([x0, x1]) => {
      const px0 = toX(x0);
      const pw = toX(x1) - px0;
      bgCtx.fillRect(px0, bz0, pw, bh);
      bgCtx.strokeRect(px0, bz0, pw, bh);
    });
  } else if (mapMeta.decorStyle === 'jarry') {
    // Parc Jarry : vaste boucle extérieure 5 km, centre plat et dégagé autour du gazebo
    bgCtx.strokeStyle = 'rgba(234, 88, 12, 0.3)';
    bgCtx.lineWidth = Math.max(2, toR(3.4));
    bgCtx.strokeRect(toX(-72), toY(-61), toX(72) - toX(-72), toY(61) - toY(-61));
  } else if (mapMeta.decorStyle === 'mont-royal') {
    // Courbes de niveau de la grande colline centrale + sentier Olmsted
    [34, 24, 14].forEach((r, idx) => {
      bgCtx.strokeStyle = idx === 2 ? 'rgba(226, 232, 240, 0.42)' : 'rgba(52, 211, 153, 0.25)';
      bgCtx.lineWidth = idx === 2 ? 1.5 : 1.0;
      bgCtx.beginPath();
      bgCtx.arc(toX(0), toY(0), Math.max(4, toR(r)), 0, Math.PI * 2);
      bgCtx.stroke();
    });
    const mr = PARK_LANDMARKS.montRoyal;
    bgCtx.fillStyle = 'rgba(14, 165, 233, 0.48)';
    bgCtx.beginPath();
    bgCtx.ellipse(toX(mr.lakeX), toY(mr.lakeZ), Math.max(3, toR(mr.lakeRx)), Math.max(2.5, (mr.lakeRz / FIELD.depth) * H), 0, 0, Math.PI * 2);
    bgCtx.fill();
  } else if (mapMeta.decorStyle === 'rift') {
    const rf = PARK_LANDMARKS.rift;
    // Couloirs terre battue (Top courbe, Mid diagonal, Bot courbe)
    bgCtx.strokeStyle = 'rgba(161, 120, 74, 0.44)';
    bgCtx.lineWidth = Math.max(8, toR(14.5));
    bgCtx.lineCap = 'round';
    bgCtx.lineJoin = 'round';
    bgCtx.beginPath();
    bgCtx.moveTo(toX(-76), toY(44));
    bgCtx.lineTo(toX(-76), toY(-56));
    bgCtx.quadraticCurveTo(toX(-76), toY(-76), toX(-56), toY(-76));
    bgCtx.lineTo(toX(44), toY(-76));
    bgCtx.stroke();

    bgCtx.beginPath();
    bgCtx.moveTo(toX(-44), toY(76));
    bgCtx.lineTo(toX(56), toY(76));
    bgCtx.quadraticCurveTo(toX(76), toY(76), toX(76), toY(56));
    bgCtx.lineTo(toX(76), toY(-44));
    bgCtx.stroke();

    bgCtx.beginPath();
    bgCtx.moveTo(toX(-56), toY(56));
    bgCtx.lineTo(toX(56), toY(-56));
    bgCtx.stroke();

    // Rivière transversale diagonale (NO -> SE) + Fosses Baron & Dragon
    bgCtx.strokeStyle = 'rgba(14, 116, 144, 0.65)';
    bgCtx.lineWidth = Math.max(10, toR(rf.riverHalfWidth * 2));
    bgCtx.beginPath();
    bgCtx.moveTo(toX(-85), toY(-85));
    bgCtx.lineTo(toX(85), toY(85));
    bgCtx.stroke();

    bgCtx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
    bgCtx.lineWidth = Math.max(4, toR(rf.riverHalfWidth * 0.9));
    bgCtx.beginPath();
    bgCtx.moveTo(toX(-85), toY(-85));
    bgCtx.lineTo(toX(85), toY(85));
    bgCtx.stroke();

    // Petit lac central inondant le Mid + chute d'eau centrale + chevrons de courant sortant
    bgCtx.fillStyle = 'rgba(14, 116, 144, 0.78)';
    bgCtx.beginPath();
    bgCtx.arc(toX(0), toY(0), Math.max(7, toR(rf.centerLakeRadius)), 0, Math.PI * 2);
    bgCtx.fill();
    bgCtx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
    bgCtx.lineWidth = 1.1;
    bgCtx.stroke();

    // Flèches de courant partant du centre vers les sidelanes NO (Toplane) & SE (Botlane)
    bgCtx.strokeStyle = 'rgba(224, 242, 254, 0.92)';
    bgCtx.lineWidth = 1.8;
    bgCtx.lineCap = 'round';
    bgCtx.lineJoin = 'round';
    [-1, 1].forEach((dir) => {
      [20, 38, 56].forEach((d) => {
        const cx = toX(dir * d);
        const cy = toY(dir * d);
        const s = 4.2;
        const ux = dir * 0.7071;
        const uy = dir * 0.7071;
        const nx = -0.7071;
        const ny = 0.7071;
        bgCtx.beginPath();
        bgCtx.moveTo(cx - ux * s * 0.65 + nx * s, cy - uy * s * 0.65 + ny * s);
        bgCtx.lineTo(cx + ux * s, cy + uy * s);
        bgCtx.lineTo(cx - ux * s * 0.65 - nx * s, cy - uy * s * 0.65 - ny * s);
        bgCtx.stroke();
      });
    });

    [
      { pit: rf.baronPit, glow: 'rgba(168, 85, 247, 0.72)', pts: 4 },
      { pit: rf.dragonPit, glow: 'rgba(245, 158, 11, 0.72)', pts: 3 }
    ].forEach(({ pit, glow, pts }) => {
      const px = toX(pit.x);
      const py = toY(pit.z);
      bgCtx.fillStyle = 'rgba(14, 116, 144, 0.68)';
      bgCtx.beginPath();
      bgCtx.arc(px, py, Math.max(5, toR(pit.r)), 0, Math.PI * 2);
      bgCtx.fill();

      // Sceau celtique miniature sur la minicarte (double polygone entrelacé + cercle)
      const rSigil = Math.max(3.2, toR(pit.r * 0.56));
      bgCtx.strokeStyle = glow;
      bgCtx.lineWidth = 1.2;
      bgCtx.beginPath();
      bgCtx.arc(px, py, rSigil, 0, Math.PI * 2);
      bgCtx.stroke();

      [0, Math.PI / pts].forEach((rot) => {
        bgCtx.beginPath();
        for (let v = 0; v <= pts; v++) {
          const a = rot + (v / pts) * Math.PI * 2;
          const vx = px + Math.cos(a) * rSigil;
          const vy = py + Math.sin(a) * rSigil;
          if (v === 0) bgCtx.moveTo(vx, vy);
          else bgCtx.lineTo(vx, vy);
        }
        bgCtx.stroke();
      });
    });

    // Bases en coin (Sud-Ouest Or & Nord-Est Violet) avec rayons & arcs inspirés des schémas
    [
      { cx: -88, cz: 88, a0: -Math.PI / 2, a1: 0, dir: 1, fill: 'rgba(100, 116, 139, 0.52)', ring: 'rgba(250, 204, 21, 0.55)' },
      { cx: 88, cz: -88, a0: Math.PI / 2, a1: Math.PI, dir: -1, fill: 'rgba(100, 116, 139, 0.52)', ring: 'rgba(192, 132, 252, 0.55)' }
    ].forEach((b) => {
      bgCtx.fillStyle = b.fill;
      bgCtx.beginPath();
      bgCtx.moveTo(toX(b.cx), toY(b.cz));
      bgCtx.arc(toX(b.cx), toY(b.cz), toR(rf.baseRadius), b.a0, b.a1);
      bgCtx.closePath();
      bgCtx.fill();
      bgCtx.strokeStyle = b.ring;
      bgCtx.lineWidth = 1.4;
      bgCtx.stroke();

      bgCtx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
      bgCtx.lineWidth = 1.0;
      [20, 34, 46].forEach((rr) => {
        bgCtx.beginPath();
        bgCtx.arc(toX(b.cx), toY(b.cz), toR(rr), b.a0, b.a1);
        bgCtx.stroke();
      });
      [
        [b.cx + b.dir * 12, b.cz - b.dir * 44],
        [b.cx + b.dir * 34, b.cz - b.dir * 34],
        [b.cx + b.dir * 44, b.cz - b.dir * 12]
      ].forEach(([tx, tz]) => {
        bgCtx.beginPath();
        bgCtx.moveTo(toX(b.cx), toY(b.cz));
        bgCtx.lineTo(toX(tx), toY(tz));
        bgCtx.stroke();
      });
    });
  }

  if (mapMeta.decorStyle !== 'rift') {
    bgCtx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    bgCtx.lineWidth = 5;
    [FIELD.laneTopZ, FIELD.laneBotZ].forEach((lz) => {
      bgCtx.beginPath();
      bgCtx.moveTo(toX(FIELD.allyGoalX), toY(lz));
      bgCtx.lineTo(toX(FIELD.enemyGoalX), toY(lz));
      bgCtx.stroke();
    });

    bgCtx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    bgCtx.lineWidth = 1;
    bgCtx.beginPath();
    bgCtx.moveTo(toX(0), 0);
    bgCtx.lineTo(toX(0), H);
    bgCtx.stroke();
  }

  // Couche 2 : Canopée (classique), monuments centraux, buissons, obstacles & cerceaux
  fgCtx.clearRect(0, 0, W, H);
  if (CANOPY_SPEC.hasCanopy) {
    fgCtx.fillStyle = 'rgba(180, 120, 60, 0.32)';
    CANOPY_SPEC.bridges.forEach((b) => {
      const x0 = toX(b.x0);
      const y0 = toY(b.z0);
      fgCtx.fillRect(x0, y0, Math.max(1.5, toX(b.x1) - x0), Math.max(1.5, toY(b.z1) - y0));
    });
    fgCtx.fillStyle = 'rgba(217, 119, 6, 0.42)';
    CANOPY_SPEC.decks.forEach((d) => {
      const x0 = toX(d.x0);
      const y0 = toY(d.z0);
      fgCtx.fillRect(x0, y0, Math.max(2, toX(d.x1) - x0), Math.max(2, toY(d.z1) - y0));
    });
  }

  if (mapMeta.decorStyle === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    const cx0 = toX(sv.chaletMinX);
    const cy0 = toY(sv.chaletMinZ);
    const cw = toX(sv.chaletMaxX) - cx0;
    const chH = toY(sv.chaletMaxZ) - cy0;
    fgCtx.fillStyle = '#e7e5e4';
    fgCtx.strokeStyle = '#475569';
    fgCtx.lineWidth = 1.4;
    fgCtx.fillRect(cx0, cy0, cw, chH);
    fgCtx.strokeRect(cx0, cy0, cw, chH);
    fgCtx.fillStyle = '#475569';
    fgCtx.fillRect(cx0 + cw * 0.25, cy0 + chH * 0.25, cw * 0.5, chH * 0.5);
  } else if (mapMeta.decorStyle === 'jarry') {
    const gr = Math.max(4.5, toR(PARK_LANDMARKS.jarry.gazeboRadius));
    fgCtx.fillStyle = '#2d6a4f';
    fgCtx.strokeStyle = '#f8fafc';
    fgCtx.lineWidth = 1.3;
    fgCtx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const px = toX(0) + Math.cos(ang) * gr;
      const py = toY(0) + Math.sin(ang) * gr;
      if (i === 0) fgCtx.moveTo(px, py);
      else fgCtx.lineTo(px, py);
    }
    fgCtx.closePath();
    fgCtx.fill();
    fgCtx.stroke();
  } else if (mapMeta.decorStyle === 'mont-royal') {
    const mr = PARK_LANDMARKS.montRoyal;
    const cx = toX(mr.crossX);
    const cy = toY(mr.crossZ);
    fgCtx.strokeStyle = '#fde047';
    fgCtx.lineWidth = 2.2;
    fgCtx.beginPath();
    fgCtx.moveTo(cx - 4.5, cy);
    fgCtx.lineTo(cx + 4.5, cy);
    fgCtx.moveTo(cx, cy - 4.5);
    fgCtx.lineTo(cx, cy + 4.5);
    fgCtx.stroke();
  } else if (mapMeta.decorStyle === 'rift') {
    const rf = PARK_LANDMARKS.rift;
    fgCtx.lineCap = 'round';
    fgCtx.lineJoin = 'round';
    // Piton de la chute d'eau au centre (0, 0)
    fgCtx.fillStyle = '#0ea5e9';
    fgCtx.strokeStyle = '#e0f2fe';
    fgCtx.lineWidth = 1.5;
    fgCtx.beginPath();
    fgCtx.arc(toX(0), toY(0), Math.max(3.2, toR(rf.waterfallRadius + 0.6)), 0, Math.PI * 2);
    fgCtx.fill();
    fgCtx.stroke();
    rf.wallChains.forEach((chain) => {
      if (!chain.pts || chain.pts.length < 2) return;
      const isBase = chain.kind === 'base';
      fgCtx.beginPath();
      chain.pts.forEach(([px, pz], idx) => {
        if (idx === 0) fgCtx.moveTo(toX(px), toY(pz));
        else fgCtx.lineTo(toX(px), toY(pz));
      });
      fgCtx.strokeStyle = isBase ? '#64748b' : '#1e293b';
      fgCtx.lineWidth = Math.max(3.5, toR(chain.radius * 2));
      fgCtx.stroke();

      fgCtx.strokeStyle = isBase
        ? chain.teamSide === 'ally'
          ? 'rgba(250, 204, 21, 0.78)'
          : 'rgba(192, 132, 252, 0.78)'
        : '#36692b';
      fgCtx.lineWidth = Math.max(1.8, toR(chain.radius * 1.15));
      fgCtx.stroke();
    });
  }

  fgCtx.fillStyle = 'rgba(16, 185, 129, 0.34)';
  fgCtx.strokeStyle = 'rgba(16, 185, 129, 0.72)';
  fgCtx.lineWidth = 0.9;
  JUNGLE_BUSHES.forEach((b) => {
    fgCtx.beginPath();
    fgCtx.arc(toX(b.x), toY(b.z), Math.max(2.2, toR(b.radius)), 0, Math.PI * 2);
    fgCtx.fill();
    fgCtx.stroke();
  });

  fgCtx.fillStyle = '#334155';
  fgCtx.strokeStyle = '#64748b';
  fgCtx.lineWidth = 0.9;
  JUNGLE_OBSTACLES.forEach((obs) => {
    if (obs.kind === 'gazebo') return;
    fgCtx.beginPath();
    fgCtx.arc(toX(obs.x), toY(obs.z), Math.max(2.2, toR(obs.radius)), 0, Math.PI * 2);
    fgCtx.fill();
    fgCtx.stroke();
  });
  if (CANOPY_SPEC.hasCanopy) {
    fgCtx.fillStyle = '#475569';
    CANOPY_SPEC.trunks.forEach((tr) => {
      fgCtx.beginPath();
      fgCtx.arc(toX(tr.x), toY(tr.z), Math.max(1.6, toR(tr.radius)), 0, Math.PI * 2);
      fgCtx.fill();
    });
  }

  [
    { x: FIELD.allyGoalX, z: FIELD.allyGoalZ || 0, col: '#facc15' },
    { x: FIELD.enemyGoalX, z: FIELD.enemyGoalZ || 0, col: '#c084fc' }
  ].forEach((g) => {
    fgCtx.beginPath();
    fgCtx.arc(toX(g.x), toY(g.z), Math.max(4, toR(FIELD.goalRadius * 1.25)), 0, Math.PI * 2);
    fgCtx.strokeStyle = g.col;
    fgCtx.lineWidth = 1.8;
    fgCtx.stroke();
  });

  return true;
}

function syncMinimapCanvasDimensions() {
  if (!minimapCanvas) return;
  const isSquare = Math.abs(FIELD.width - FIELD.depth) < 1;
  if (isSquare) {
    minimapCanvas.width = state.minimapExpanded ? 344 : 238;
    minimapCanvas.height = state.minimapExpanded ? 344 : 238;
  } else {
    minimapCanvas.width = state.minimapExpanded ? 368 : 268;
    minimapCanvas.height = state.minimapExpanded ? 238 : 174;
  }
  minimapStaticKey = '';
}

export function cycleMinimapVisionMode() {
  const order = ['both', 'myTeam', 'omniscient'];
  const idx = order.indexOf(state.minimapVisionMode);
  state.minimapVisionMode = order[(idx + 1) % order.length];
  const btn = document.getElementById('btn-minimap-vision');
  if (btn) {
    btn.textContent =
      state.minimapVisionMode === 'both'
        ? '👁️ 2 Équipes'
        : state.minimapVisionMode === 'myTeam'
        ? '👁️ Mon Équipe'
        : '👁️ Omniscient';
  }
  renderMinimap();
}

export function toggleMinimapSize() {
  state.minimapExpanded = !state.minimapExpanded;
  const panel = document.getElementById('minimap-panel');
  if (panel) panel.classList.toggle('minimap-expanded', state.minimapExpanded);
  syncMinimapCanvasDimensions();
  renderMinimap();
}

export function renderMinimap() {
  if (!minimapCanvas || !minimapCtx) return;
  updateTeamVisionState();

  const mCtx = minimapCtx;
  const W = minimapCanvas.width || 268;
  const H = minimapCanvas.height || 174;
  const toX = (wx) => ((wx + FIELD.width / 2) / FIELD.width) * W;
  const toY = (wz) => ((wz + FIELD.depth / 2) / FIELD.depth) * H;
  const toR = (wr) => (wr / FIELD.width) * W;

  const mapMeta = getActiveMapMeta();
  const cacheKey = `${state.mapId}|${W}x${H}`;
  let hasCachedLayers = minimapStaticKey === cacheKey;
  if (!hasCachedLayers) {
    hasCachedLayers = buildMinimapStaticLayers(W, H, mapMeta);
    if (hasCachedLayers) minimapStaticKey = cacheKey;
  }

  // 1. Fond & repères statiques mis en cache (recalculés uniquement au changement de carte ou taille)
  mCtx.clearRect(0, 0, W, H);
  if (hasCachedLayers && typeof mCtx.drawImage === 'function') {
    mCtx.drawImage(minimapStaticBgCanvas, 0, 0);
  } else {
    mCtx.fillStyle = mapMeta.minimapBg || '#071122';
    mCtx.fillRect(0, 0, W, H);
  }

  // 2. Cônes de vision dynamiques (Raycasting 2D/3D sur obstacles & buissons)
  const visionMode = state.minimapVisionMode || 'both';
  const drawTeamVisionCone = (p) => {
    const count = fillPlayerVisionPolygonFlat(p, 26, 8, _minimapConeXY);
    if (count < 3) return;
    const px = toX(p.pos.x);
    const py = toY(p.pos.z);
    const maxRange = p.pos.y >= 3.8 ? VISION_SPEC.canopyRange : VISION_SPEC.groundRange;
    const radPx = Math.max(8, toR(maxRange));

    const grad = mCtx.createRadialGradient(px, py, 2, px, py, radPx);
    if (p.team === 'ally') {
      grad.addColorStop(0, 'rgba(250, 204, 21, 0.36)');
      grad.addColorStop(0.75, 'rgba(250, 204, 21, 0.16)');
      grad.addColorStop(1, 'rgba(250, 204, 21, 0.07)');
    } else {
      grad.addColorStop(0, 'rgba(192, 132, 252, 0.34)');
      grad.addColorStop(0.75, 'rgba(192, 132, 252, 0.15)');
      grad.addColorStop(1, 'rgba(192, 132, 252, 0.06)');
    }

    mCtx.beginPath();
    mCtx.moveTo(toX(_minimapConeXY[0]), toY(_minimapConeXY[1]));
    for (let i = 1; i < count; i++) {
      mCtx.lineTo(toX(_minimapConeXY[i * 2]), toY(_minimapConeXY[i * 2 + 1]));
    }
    mCtx.closePath();
    mCtx.fillStyle = grad;
    mCtx.fill();
    mCtx.strokeStyle =
      p.team === 'ally' ? 'rgba(250, 204, 21, 0.72)' : 'rgba(192, 132, 252, 0.70)';
    mCtx.lineWidth = 1.35;
    mCtx.stroke();
  };

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.tutorialHidden) continue;
    const isMineTeam = p.team === state.myTeam;
    if (isMineTeam) {
      drawTeamVisionCone(p);
    } else if (visionMode === 'omniscient') {
      drawTeamVisionCone(p);
    } else if (visionMode === 'both' && p.visibleTo && p.visibleTo[state.myTeam]) {
      // Affiche dynamiquement le champ de vision des adversaires repérés par l'équipe
      drawTeamVisionCone(p);
    }
  }

  // 2b. Vision 360° des Balises déployées sur la minimap
  for (let i = 0; i < (ctx.entities.activeToolBeacons || []).length; i++) {
    const b = (ctx.entities.activeToolBeacons || [])[i];
    if (b.team !== state.myTeam && visionMode !== 'omniscient') continue;
    const bx = toX(b.x);
    const bz = toY(b.z);
    const steps = 20;
    mCtx.save();
    mCtx.beginPath();
    for (let s = 0; s < steps; s++) {
      const ang = (s / steps) * Math.PI * 2;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      const d = castVisionRay2D(b.x, b.y, b.z, dx, dz, b.visionRadius);
      const px = toX(b.x + dx * d);
      const py = toY(b.z + dz * d);
      if (s === 0) mCtx.moveTo(px, py);
      else mCtx.lineTo(px, py);
    }
    mCtx.closePath();
    mCtx.fillStyle = b.team === 'ally' ? 'rgba(250, 204, 21, 0.16)' : 'rgba(192, 132, 252, 0.16)';
    mCtx.fill();
    mCtx.strokeStyle = b.team === 'ally' ? 'rgba(250, 204, 21, 0.55)' : 'rgba(192, 132, 252, 0.55)';
    mCtx.lineWidth = 1;
    mCtx.stroke();
    mCtx.fillStyle = b.team === 'ally' ? '#facc15' : '#c084fc';
    mCtx.beginPath();
    mCtx.arc(bx, bz, 3.2, 0, Math.PI * 2);
    mCtx.fill();
    mCtx.restore();
  }

  // 3-6. Décors statiques en avant-plan (canopée, buissons, rochers, troncs, cerceaux)
  if (hasCachedLayers && typeof mCtx.drawImage === 'function') {
    mCtx.drawImage(minimapStaticFgCanvas, 0, 0);
  }

  // 6b. Ultimates actifs (Murs de bois, Vagues d'eau, Rayons plasma) & Outils déployés
  for (let i = 0; i < (ctx.entities.activeSlidePatches || []).length; i++) {
    const sp = (ctx.entities.activeSlidePatches || [])[i];
    mCtx.save();
    mCtx.fillStyle = 'rgba(125, 211, 252, 0.45)';
    mCtx.beginPath();
    mCtx.arc(toX(sp.x), toY(sp.z), Math.max(1.8, toR(sp.radius)), 0, Math.PI * 2);
    mCtx.fill();
    mCtx.restore();
  }

  for (let i = 0; i < (ctx.entities.activeToolPads || []).length; i++) {
    const pad = (ctx.entities.activeToolPads || [])[i];
    mCtx.save();
    mCtx.strokeStyle = '#38bdf8';
    mCtx.lineWidth = 2.5;
    mCtx.beginPath();
    mCtx.moveTo(toX(pad.x - pad.dirX * 1.1), toY(pad.z - pad.dirZ * 1.1));
    mCtx.lineTo(toX(pad.x + pad.dirX * 1.3), toY(pad.z + pad.dirZ * 1.3));
    mCtx.stroke();
    mCtx.restore();
  }

  for (let i = 0; i < (ctx.entities.activeToolWalls || []).length; i++) {
    const tw = (ctx.entities.activeToolWalls || [])[i];
    mCtx.save();
    mCtx.strokeStyle = tw.team === 'ally' ? '#facc15' : '#c084fc';
    mCtx.lineWidth = 3.2;
    mCtx.beginPath();
    mCtx.moveTo(toX(tw.ax), toY(tw.az));
    mCtx.lineTo(toX(tw.bx), toY(tw.bz));
    mCtx.stroke();
    mCtx.restore();
  }

  for (let w = 0; w < activeLeafWalls.length; w++) {
    const wall = activeLeafWalls[w];
    if (wall.nodes.length === 0) continue;
    mCtx.save();
    mCtx.strokeStyle = wall.phase === 'grown' ? '#22c55e' : 'rgba(74, 222, 128, 0.65)';
    mCtx.lineWidth = wall.phase === 'grown' ? 3.5 : 1.8;
    mCtx.beginPath();
    for (let i = 0; i < wall.nodes.length; i++) {
      const nd = wall.nodes[i];
      if (i === 0) mCtx.moveTo(toX(nd.x), toY(nd.z));
      else mCtx.lineTo(toX(nd.x), toY(nd.z));
    }
    mCtx.stroke();
    mCtx.restore();
  }

  for (let w = 0; w < activeWaterWaves.length; w++) {
    const wave = activeWaterWaves[w];
    mCtx.save();
    mCtx.fillStyle = 'rgba(56, 189, 248, 0.85)';
    for (let i = 0; i < wave.segments.length; i++) {
      const seg = wave.segments[i];
      if (!seg.active) continue;
      mCtx.beginPath();
      mCtx.arc(toX(seg.x), toY(seg.z), 2.3, 0, Math.PI * 2);
      mCtx.fill();
    }
    mCtx.restore();
  }

  for (let i = 0; i < activeFireLasers.length; i++) {
    const f = activeFireLasers[i];
    mCtx.save();
    mCtx.strokeStyle = f.phase === 'telegraph' ? 'rgba(255, 107, 0, 0.6)' : '#ffffff';
    mCtx.lineWidth = f.phase === 'telegraph' ? 1.5 : 2.6;
    mCtx.beginPath();
    mCtx.moveTo(toX(f.ox), toY(f.oz));
    const len = f.phase === 'telegraph' ? f.maxLen : f.currentLen;
    mCtx.lineTo(toX(f.ox + f.dirX * len), toY(f.oz + f.dirZ * len));
    mCtx.stroke();
    mCtx.restore();
  }

  // 7. Ballons (masqués si portés par une adversaire hors de vue)
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.tutorialHidden || b.state === 'scored') continue;
    if (
      b.state === 'carried' &&
      b.carrier &&
      b.carrier.team !== state.myTeam &&
      !(b.carrier.visibleTo && b.carrier.visibleTo[state.myTeam]) &&
      visionMode !== 'omniscient'
    ) {
      continue;
    }
    const bx = toX(b.pos.x);
    const by = toY(b.pos.z);
    mCtx.beginPath();
    mCtx.arc(bx, by, 3.6, 0, Math.PI * 2);
    mCtx.fillStyle = COLORS[b.color] ? COLORS[b.color].css : '#fff';
    mCtx.fill();
    mCtx.strokeStyle = '#ffffff';
    mCtx.lineWidth = 1.2;
    mCtx.stroke();
  }

  // 8. Joueuses (les adversaires hors de vue de toute l'équipe n'apparaissent PAS sur la minimap)
  const myMeta = state.teams[state.myTeam];
  let spottedCount = 0;
  let totalVisibleEnemies = 0;

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.tutorialHidden) continue;
    const isMyTeam = p.team === state.myTeam;
    if (!isMyTeam) totalVisibleEnemies++;
    const isVisibleToTeam = isMyTeam || !!(p.visibleTo && p.visibleTo[state.myTeam]);
    if (!isMyTeam && isVisibleToTeam) {
      spottedCount++;
    }

    if (!isVisibleToTeam && visionMode !== 'omniscient') {
      continue;
    }

    const px = toX(p.pos.x);
    const py = toY(p.pos.z);
    const isControlled = isMyTeam && p.role === state.controlledRole;
    const markerR = isControlled ? 6.2 : 5.2;

    // Flèche directionnelle du regard
    const fx = Math.sin(p.facingAngle || 0);
    const fz = Math.cos(p.facingAngle || 0);
    mCtx.beginPath();
    mCtx.moveTo(px + fx * (markerR + 4.2), py + fz * (markerR + 4.2));
    mCtx.lineTo(px - fz * 3.0 + fx * (markerR - 1), py + fx * 3.0 + fz * (markerR - 1));
    mCtx.lineTo(px + fz * 3.0 + fx * (markerR - 1), py - fx * 3.0 + fz * (markerR - 1));
    mCtx.closePath();
    mCtx.fillStyle = p.team === 'ally' ? '#fde047' : '#d8b4fe';
    mCtx.fill();

    // Couleur du dossard (connue ou '?')
    const showColor =
      isMyTeam ||
      p.currentlySeeingBack ||
      p.backRevealed ||
      p.state === 'sitting' ||
      p.state === 'rule1';
    const fillCol = showColor && COLORS[p.color] ? COLORS[p.color].css : '#475569';

    mCtx.beginPath();
    mCtx.arc(px, py, markerR, 0, Math.PI * 2);
    mCtx.fillStyle = fillCol;
    mCtx.fill();
    mCtx.lineWidth = isControlled ? 2.2 : 1.5;
    mCtx.strokeStyle = isControlled
      ? '#38bdf8'
      : p.team === 'ally'
      ? '#fde047'
      : '#c084fc';
    mCtx.stroke();

    // Lettre du poste (G / C / D)
    mCtx.fillStyle = '#ffffff';
    mCtx.font = 'bold 7.5px sans-serif';
    mCtx.textAlign = 'center';
    mCtx.textBaseline = 'middle';
    mCtx.fillText(p.role, px, py + 0.5);
  }

  if (state.cameraMode === 'aerial' && camera && mobaRaycaster && mobaPointerNDC) {
    camera.updateMatrixWorld();
    const planeY = state.mobaCamY || 0;
    const corners = [
      [-1, 1],
      [1, 1],
      [1, -1],
      [-1, -1]
    ];
    const camPts = [];
    let validCorners = true;
    for (let cIdx = 0; cIdx < 4; cIdx++) {
      mobaPointerNDC.set(corners[cIdx][0], corners[cIdx][1]);
      mobaRaycaster.setFromCamera(mobaPointerNDC, camera);
      const ray = mobaRaycaster.ray;
      if (ray.direction.y >= -0.02) {
        validCorners = false;
        break;
      }
      const t = (planeY - ray.origin.y) / ray.direction.y;
      if (!Number.isFinite(t) || t <= 0) {
        validCorners = false;
        break;
      }
      const wx = Math.max(-FIELD.width / 2, Math.min(FIELD.width / 2, ray.origin.x + ray.direction.x * t));
      const wz = Math.max(-FIELD.depth / 2, Math.min(FIELD.depth / 2, ray.origin.z + ray.direction.z * t));
      camPts.push([toX(wx), toY(wz)]);
    }
    if (validCorners && camPts.length === 4) {
      mCtx.save();
      mCtx.beginPath();
      mCtx.moveTo(camPts[0][0], camPts[0][1]);
      for (let cIdx = 1; cIdx < 4; cIdx++) mCtx.lineTo(camPts[cIdx][0], camPts[cIdx][1]);
      mCtx.closePath();
      mCtx.fillStyle = 'rgba(248, 250, 252, 0.06)';
      mCtx.fill();
      mCtx.strokeStyle = 'rgba(248, 250, 252, 0.92)';
      mCtx.lineWidth = 1.4;
      mCtx.stroke();
      mCtx.restore();
    }
  }

  if (minimapSpottedEl) {
    const nextSpottedTxt = `👁️ ${spottedCount}/${totalVisibleEnemies} vus`;
    if (minimapLastSpottedTxt !== nextSpottedTxt) {
      minimapSpottedEl.textContent = nextSpottedTxt;
      minimapLastSpottedTxt = nextSpottedTxt;
    }
  }
}


// --- BOUTONS INTERFACE ---
function attachLockFocusPrep(btnEl) {
  if (!btnEl) return;
  btnEl.addEventListener('mousedown', () => {
    try {
      if (renderer.domElement && typeof renderer.domElement.focus === 'function') {
        renderer.domElement.focus({ preventScroll: true });
      }
    } catch (_) {}
  });
}

function bindUIButtons() {
  const btnWelcomeOptions = document.getElementById('btn-welcome-options');
  if (btnWelcomeOptions) {
    btnWelcomeOptions.onclick = () => {
      btnWelcomeOptions.blur();
      openOptionsModal('welcome-modal');
    };
  }
  const btnPauseOptions = document.getElementById('btn-pause-options');
  if (btnPauseOptions) {
    btnPauseOptions.onclick = () => {
      btnPauseOptions.blur();
      openOptionsModal('pause-modal');
    };
  }
  const btnOptionsClose = document.getElementById('btn-options-close');
  if (btnOptionsClose) {
    btnOptionsClose.onclick = () => {
      btnOptionsClose.blur();
      closeOptionsModal();
    };
  }

  const btnStartTutorial = document.getElementById('btn-start-tutorial');
  attachLockFocusPrep(btnStartTutorial);
  if (btnStartTutorial) {
    btnStartTutorial.onclick = () => {
      ctx.api.startNewMatch('tutorial');
    };
  }

  const btnStartPractice = document.getElementById('btn-start-practice');
  if (btnStartPractice) {
    btnStartPractice.onclick = () => {
      openArenaModal('practice', false);
    };
  }

  const btnStartGame = document.getElementById('btn-start-game');
  if (btnStartGame) {
    btnStartGame.onclick = () => {
      openArenaModal('pedagogical', false);
    };
  }

  const btnStartVanilla = document.getElementById('btn-start-vanilla');
  if (btnStartVanilla) {
    btnStartVanilla.onclick = () => {
      openArenaModal('pedagogical', true);
    };
  }

  const btnArenaRuleStd = document.getElementById('btn-arena-rule-standard');
  if (btnArenaRuleStd) {
    btnArenaRuleStd.onclick = () => {
      pendingArenaVanilla = false;
      syncArenaRulesetUI();
    };
  }

  const btnArenaRuleVanilla = document.getElementById('btn-arena-rule-vanilla');
  if (btnArenaRuleVanilla) {
    btnArenaRuleVanilla.onclick = () => {
      pendingArenaVanilla = true;
      syncArenaRulesetUI();
    };
  }

  const btnArenaBack = document.getElementById('btn-arena-back');
  if (btnArenaBack) {
    btnArenaBack.onclick = () => {
      btnArenaBack.blur();
      showOnlyModal('welcome-modal');
    };
  }

  const btnArenaLaunch = document.getElementById('btn-arena-launch');
  attachLockFocusPrep(btnArenaLaunch);
  if (btnArenaLaunch) {
    btnArenaLaunch.onclick = () => {
      ctx.api.startNewMatch(pendingArenaMode || 'pedagogical', {
        vanillaMode: !!pendingArenaVanilla
      });
    };
  }

  const btnPauseResume = document.getElementById('btn-pause-resume');
  attachLockFocusPrep(btnPauseResume);
  if (btnPauseResume) {
    btnPauseResume.onclick = () => resumeFromPauseMenu();
  }

  const btnPauseRules = document.getElementById('btn-pause-rules');
  if (btnPauseRules) {
    btnPauseRules.onclick = () => {
      btnPauseRules.blur();
      const panel = document.getElementById('pause-rules-panel');
      if (panel) {
        const nowHidden = panel.classList.toggle('hidden');
        btnPauseRules.classList.toggle('active-mode-pill', !nowHidden);
      }
    };
  }

  const btnPauseFullscreen = document.getElementById('btn-pause-fullscreen');
  if (btnPauseFullscreen) {
    btnPauseFullscreen.onclick = () => {
      btnPauseFullscreen.blur();
      toggleFullscreen();
    };
  }

  const btnPauseReturnMenu = document.getElementById('btn-pause-return-menu');
  if (btnPauseReturnMenu) {
    btnPauseReturnMenu.onclick = () => returnToMainMenu({ withCongrats: false });
  }

  const btnOpenMp = document.getElementById('btn-open-mp');
  if (btnOpenMp) {
    btnOpenMp.onclick = () => {
      mp.openedFromPracticeBar = false;
      if (!mp.enabled || mp.isHost) {
        setMpLobbyMode('multiplayer', mp.enabled && mp.isHost);
      }
      showOnlyModal('mp-modal');
      updateLobbyUI(mp.enabled ? undefined : 'Non connecté');
    };
  }

  const btnOpenPracticeMp = document.getElementById('btn-open-practice-mp');
  if (btnOpenPracticeMp) {
    btnOpenPracticeMp.onclick = () => {
      mp.openedFromPracticeBar = false;
      if (!mp.enabled || mp.isHost) {
        setMpLobbyMode('practice', mp.enabled && mp.isHost);
      }
      showOnlyModal('mp-modal');
      updateLobbyUI(mp.enabled ? undefined : 'Non connecté');
    };
  }

  const btnMpModeMatch = document.getElementById('btn-mp-mode-match');
  if (btnMpModeMatch) {
    btnMpModeMatch.onclick = () => {
      if (mp.enabled && !mp.isHost) return;
      setMpLobbyMode('multiplayer', true);
    };
  }
  const btnMpModePractice = document.getElementById('btn-mp-mode-practice');
  if (btnMpModePractice) {
    btnMpModePractice.onclick = () => {
      if (mp.enabled && !mp.isHost) return;
      setMpLobbyMode('practice', true);
    };
  }

  const btnMpRuleStd = document.getElementById('btn-mp-rule-standard');
  if (btnMpRuleStd) {
    btnMpRuleStd.onclick = () => {
      if (mp.enabled && !mp.isHost) return;
      setMpLobbyVanilla(false, true);
    };
  }

  const btnMpRuleVanilla = document.getElementById('btn-mp-rule-vanilla');
  if (btnMpRuleVanilla) {
    btnMpRuleVanilla.onclick = () => {
      if (mp.enabled && !mp.isHost) return;
      setMpLobbyVanilla(true, true);
    };
  }

  // Menu Pratique en jeu + Pause Pratique
  const bindPracticeBtn = (id, action) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onclick = () => {
      el.blur();
      ctx.api.requestPracticeAction(action);
    };
  };
  bindPracticeBtn('btn-practice-refresh-ults', 'refresh_ult');
  bindPracticeBtn('btn-practice-standup', 'standup_all');
  bindPracticeBtn('btn-practice-reset', 'reset_pos');
  bindPracticeBtn('btn-practice-swap-team', 'swap_team');
  bindPracticeBtn('btn-practice-reset-powers', 'reset_powers');
  bindPracticeBtn('btn-pause-practice-ults', 'refresh_ult');
  bindPracticeBtn('btn-pause-practice-standup', 'standup_all');
  bindPracticeBtn('btn-pause-practice-reset', 'reset_pos');
  bindPracticeBtn('btn-pause-practice-swap-team', 'swap_team');
  bindPracticeBtn('btn-pause-practice-reset-powers', 'reset_powers');

  const bindPracticeShopBtn = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onclick = () => {
      el.blur();
      ctx.api.openPracticeShop();
    };
  };
  bindPracticeShopBtn('btn-practice-open-shop');
  bindPracticeShopBtn('btn-pause-practice-shop');
  const btnQuickPracticeShop = document.getElementById('btn-quick-practice-shop');
  attachLockFocusPrep(btnQuickPracticeShop);
  bindPracticeShopBtn('btn-quick-practice-shop');

  const btnShopResetPowers = document.getElementById('btn-shop-reset-powers');
  if (btnShopResetPowers) {
    btnShopResetPowers.onclick = () => {
      btnShopResetPowers.blur();
      ctx.api.requestPracticeAction('reset_powers', { team: state.myTeam });
    };
  }

  const btnPausePracticeMp = document.getElementById('btn-pause-practice-mp');
  if (btnPausePracticeMp) {
    btnPausePracticeMp.onclick = () => {
      btnPausePracticeMp.blur();
      mp.openedFromPracticeBar = true;
      if (!mp.enabled || mp.isHost) {
        setMpLobbyMode('practice', mp.enabled && mp.isHost);
      }
      showOnlyModal('mp-modal');
      updateLobbyUI(mp.enabled ? undefined : 'Non connecté');
    };
  }

  const pausePracticeMapSelect = document.getElementById('pause-practice-map-select');
  if (pausePracticeMapSelect) {
    pausePracticeMapSelect.onchange = () => {
      const nextMapId = pausePracticeMapSelect.value;
      pausePracticeMapSelect.blur();
      selectArenaMap(nextMapId, true);
    };
  }

  const practiceMapSelect = document.getElementById('practice-map-select');
  if (practiceMapSelect) {
    practiceMapSelect.onchange = () => {
      const nextMapId = practiceMapSelect.value;
      practiceMapSelect.blur();
      selectArenaMap(nextMapId, true);
    };
  }

  const btnPracticeMp = document.getElementById('btn-practice-mp');
  if (btnPracticeMp) {
    btnPracticeMp.onclick = () => {
      btnPracticeMp.blur();
      mp.openedFromPracticeBar = true;
      if (!mp.enabled || mp.isHost) {
        setMpLobbyMode('practice', mp.enabled && mp.isHost);
      }
      showOnlyModal('mp-modal');
      updateLobbyUI(mp.enabled ? undefined : 'Non connecté');
    };
  }

  // Overlay Intro Tutoriel + Boutons HUD Séquence Tutoriel
  const btnTutIntroStart = document.getElementById('btn-tut-intro-start');
  attachLockFocusPrep(btnTutIntroStart);
  if (btnTutIntroStart) {
    btnTutIntroStart.onclick = () => {
      btnTutIntroStart.blur();
      ctx.api.dismissTutorialIntro?.();
    };
  }

  const tutStepsBar = document.getElementById('tut-steps-bar');
  if (tutStepsBar && tutStepsBar.children) {
    Array.from(tutStepsBar.children).forEach((pill) => {
      pill.onclick = () => {
        if (state.mode !== 'tutorial') return;
        const step = Number(pill.getAttribute('data-tut-step'));
        if (step >= 1 && step <= 5) ctx.api.enterTutorialStep(step);
      };
    });
  }
  const btnTutShop = document.getElementById('btn-tut-open-shop');
  if (btnTutShop) btnTutShop.onclick = () => ctx.api.openTutorialShopStep3();
  const btnTutRefUlt = document.getElementById('btn-tut-refresh-ult');
  if (btnTutRefUlt) {
    btnTutRefUlt.onclick = () => {
      clearAllUltimates();
      players.forEach((p) => {
        p.ultUsed = false;
        p.dashCooldown = 0;
        p.carryingBall = null;
        if (p.state !== 'standing') {
          p.state = 'standing';
          p.rule1Partner = null;
        }
      });
      updateRosterHUD();
      updateUltHudWidget();
      showToast('🔄 <strong>Ultimates rechargés !</strong> Essayez les touches <strong>1 / 2 / 3</strong> + <strong>[R]</strong> !', 2600);
    };
  }
  const btnTutToPractice = document.getElementById('btn-tut-to-practice');
  if (btnTutToPractice) {
    btnTutToPractice.onclick = () => ctx.api.completeTutorialToPractice?.(false);
  }
  const btnTutNext = document.getElementById('btn-tut-next');
  if (btnTutNext) {
    btnTutNext.onclick = () => {
      if (state.mode !== 'tutorial') return;
      if (state.tutorialStep < 5) {
        ctx.api.enterTutorialStep(state.tutorialStep + 1);
      } else {
        ctx.api.completeTutorialToPractice?.(true);
      }
    };
  }

  document.getElementById('btn-mp-back').onclick = () => {
    if (state.mode === 'practice' && state.phase === 'play') {
      resumeFromPauseMenu();
    } else if (state.phase !== 'menu') {
      openPauseMenu();
    } else {
      showOnlyModal('welcome-modal');
    }
  };

  document.getElementById('btn-host-room').onclick = () => {
    hostRoom();
  };

  document.getElementById('btn-join-room').onclick = () => {
    const code = document.getElementById('mp-room-input').value;
    joinRoom(code);
  };

  document.getElementById('btn-copy-code').onclick = () => {
    if (mp.roomCode && navigator.clipboard) {
      navigator.clipboard.writeText(mp.roomCode);
      showToast(`📋 Code du salon <strong>${mp.roomCode}</strong> copié dans le presse-papier !`, 3000);
    }
  };

  const btnLeaveRoom = document.getElementById('btn-leave-room');
  if (btnLeaveRoom) {
    btnLeaveRoom.onclick = () => {
      const oldCode = mp.roomCode;
      if (state.phase !== 'menu' && !(state.mode === 'practice' && state.phase === 'play' && mp.openedFromPracticeBar)) {
        ctx.api.resetMatchStateToMenu();
        showOnlyModal('mp-modal');
      }
      closeMultiplayerSession(true);
      updateLobbyUI('Non connecté');
      if (oldCode) {
        showToast(`🔌 Vous avez quitté le salon <strong>${escapeHtml(oldCode)}</strong>.`, 2500);
      }
    };
  }

  document.getElementById('btn-mp-start').onclick = () => {
    if (mp.enabled && mp.isHost) {
      if (mp.lobbyMode === 'practice') {
        ctx.api.startNewMatch('practice', { keepMp: true, vanillaMode: !!mp.lobbyVanilla });
      } else {
        ctx.api.startNewMatch('multiplayer', { keepMp: true, vanillaMode: !!mp.lobbyVanilla });
      }
    }
  };

  const btnConfirmPrep = document.getElementById('btn-confirm-prep');
  attachLockFocusPrep(btnConfirmPrep);
  btnConfirmPrep.onclick = () => {
    if (state.mode === 'practice' && state.practiceShopPreservePlay) {
      ctx.api.closePracticeShopAndReturn();
      return;
    }
    if (mp.enabled) {
      const me = mp.members.find((m) => m.peerId === mp.myPeerId);
      if (me) me.prepReady = true;

      if (mp.isHost) {
        const myTeamMembers = mp.members.filter((m) => m.team === state.myTeam);
        state.teams[state.myTeam].prepReady =
          myTeamMembers.length === 0 || myTeamMembers.every((m) => !!m.prepReady);
        ctx.api.updatePrepConfirmButtonUI();
        ctx.api.syncMyTeamPrep();
        ctx.api.maybeStartRoundFromPrep();
      } else {
        ctx.api.updatePrepConfirmButtonUI();
        sendNetMessage({
          type: 'MP_PREP_ACTION',
          peerId: mp.myPeerId,
          team: state.myTeam,
          action: 'ready'
        });
      }
    } else {
      ctx.api.startRoundExecution();
    }
  };

  window.addEventListener('beforeunload', () => {
    if (mp.enabled) {
      closeMultiplayerSession(true);
    }
  });

  const btnFullscreen = document.getElementById('btn-fullscreen');
  if (btnFullscreen) {
    btnFullscreen.onclick = () => {
      btnFullscreen.blur();
      toggleFullscreen();
    };
  }
  const btnWelcomeFullscreen = document.getElementById('btn-welcome-fullscreen');
  if (btnWelcomeFullscreen) {
    btnWelcomeFullscreen.onclick = () => {
      btnWelcomeFullscreen.blur();
      toggleFullscreen();
    };
  }

  const btnToggleCam = document.getElementById('btn-toggle-cam');
  btnToggleCam.onclick = () => {
    btnToggleCam.blur();
    toggleCameraMode();
  };

  const btnEndRound = document.getElementById('btn-end-round');
  btnEndRound.onclick = () => {
    btnEndRound.blur();
    if (state.phase === 'play' && (!mp.enabled || mp.isHost)) {
      ctx.api.finishRound('Fin de séquence déclenchée manuellement.');
    }
  };

  const btnOpenRules = document.getElementById('btn-open-rules');
  btnOpenRules.onclick = () => {
    btnOpenRules.blur();
    openPauseMenu();
  };

  // Sélecteur d'arène (Modale Choix d'Arène & Salon Multijoueur)
  const arenaMapGrid = document.getElementById('arena-map-grid');
  if (arenaMapGrid && arenaMapGrid.children) {
    Array.from(arenaMapGrid.children).forEach((btn) => {
      btn.onclick = () => {
        const mapId = btn.getAttribute && (btn.getAttribute('data-map') || btn.getAttribute('data-map-id'));
        if (mapId) selectArenaMap(mapId, false);
      };
    });
  }
  const mpMapGrid = document.getElementById('mp-map-grid');
  if (mpMapGrid && mpMapGrid.children) {
    Array.from(mpMapGrid.children).forEach((btn) => {
      btn.onclick = () => {
        const mapId = btn.getAttribute && (btn.getAttribute('data-map-id') || btn.getAttribute('data-map'));
        if (mapId) selectArenaMap(mapId, true);
      };
    });
  }

  const welcomeSubmenuBar = document.getElementById('welcome-submenu-tabs');
  if (welcomeSubmenuBar && welcomeSubmenuBar.children) {
    Array.from(welcomeSubmenuBar.children).forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.getAttribute && btn.getAttribute('data-welcome-tab');
        if (tab) switchWelcomeSubmenu(tab);
      };
    });
  }

  // Sous-menus Phase Préparatoire & Magasin
  const prepSubmenuBar = document.getElementById('prep-submenu-tabs');
  if (prepSubmenuBar && prepSubmenuBar.children) {
    Array.from(prepSubmenuBar.children).forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.getAttribute && btn.getAttribute('data-prep-tab');
        if (tab) switchPrepSubmenu(tab);
      };
    });
  }
  const btnPrepOpenShop = document.getElementById('btn-prep-open-shop');
  if (btnPrepOpenShop) {
    btnPrepOpenShop.onclick = () => {
      if (state.prepTab === 'dossards') {
        switchPrepSubmenu('individual');
      } else if (state.prepTab === 'individual') {
        switchPrepSubmenu('collective');
      } else {
        switchPrepSubmenu('dossards');
      }
    };
  }

  // Sous-menus HUD Gauche (Équipes / Triangle) & Bas (Contrôles)
  const btnHudTabRoster = document.getElementById('btn-hud-tab-roster');
  if (btnHudTabRoster) btnHudTabRoster.onclick = () => switchHudLeftSubmenu('roster');
  const btnHudTabRps = document.getElementById('btn-hud-tab-rps');
  if (btnHudTabRps) btnHudTabRps.onclick = () => switchHudLeftSubmenu('rps');
  const btnHudCollapseLeft = document.getElementById('btn-hud-collapse-left');
  if (btnHudCollapseLeft) btnHudCollapseLeft.onclick = () => toggleHudLeftCollapse();
  const btnToggleControls = document.getElementById('btn-toggle-controls');
  if (btnToggleControls) {
    btnToggleControls.onclick = () => {
      btnToggleControls.blur();
      toggleControlsHelpSubmenu();
    };
  }
  const btnOpenControlsConfig = document.getElementById('btn-open-controls-config');
  if (btnOpenControlsConfig) {
    btnOpenControlsConfig.onclick = () => {
      btnOpenControlsConfig.blur();
      openOptionsModal(null);
    };
  }
  const ultHudWidgetEl = document.getElementById('ult-hud-widget');
  if (ultHudWidgetEl) {
    ultHudWidgetEl.onclick = (e) => {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      toggleUltimatePreview();
    };
  }

  // Contrôles de la Minimap Tactique
  const btnMinimapVision = document.getElementById('btn-minimap-vision');
  if (btnMinimapVision) {
    btnMinimapVision.onclick = () => {
      btnMinimapVision.blur();
      cycleMinimapVisionMode();
    };
  }
  const btnMinimapSize = document.getElementById('btn-minimap-size');
  if (btnMinimapSize) {
    btnMinimapSize.onclick = () => {
      btnMinimapSize.blur();
      toggleMinimapSize();
    };
  }
  let minimapPointerId = null;
  if (minimapCanvas) {
    minimapCanvas.addEventListener('pointerdown', (e) => {
      const mouseCode = `Mouse${e.button}`;
      const isMobaMoveBtn =
        !state.mobileMode &&
        e.pointerType === 'mouse' &&
        state.cameraMode === 'aerial' &&
        !isMenuOpen() &&
        matchesControl('mobaMove', mouseCode) &&
        (e.button !== 0 || state.mobaMoveButton === 'left');
      if (isMobaMoveBtn && e.button !== 0) {
        e.preventDefault();
        e.stopPropagation();
        const pos = minimapClientToWorld(e.clientX, e.clientY);
        if (pos) {
          applyMobaMoveCommand({ x: pos.wx, z: pos.wz, onCanopy: false }, true);
          if (state.mode === 'tutorial' && state.tutorialStep === 5) {
            ctx.api.markTutorialCheck('mobaToggled');
            ctx.api.markTutorialCheck('mobaMoved');
          }
        }
        return;
      }
      if (!state.mobileMode && e.pointerType === 'mouse' && e.button === 2 && state.cameraMode === 'aerial' && !isMenuOpen()) {
        e.preventDefault();
        e.stopPropagation();
        const pos = minimapClientToWorld(e.clientX, e.clientY);
        if (pos) {
          applyMobaMoveCommand({ x: pos.wx, z: pos.wz, onCanopy: false }, true);
          if (state.mode === 'tutorial' && state.tutorialStep === 5) {
            ctx.api.markTutorialCheck('mobaToggled');
            ctx.api.markTutorialCheck('mobaMoved');
          }
        }
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (minimapPointerId !== null) return;
      e.preventDefault();
      e.stopPropagation();
      minimapPointerId = e.pointerId;
      try {
        minimapCanvas.setPointerCapture(e.pointerId);
      } catch (_) {}
      handleMinimapPress(e.clientX, e.clientY);
    });
    minimapCanvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== minimapPointerId) return;
      if (!minimapDragging || state.cameraMode !== 'aerial') return;
      if (isPointerLocked() && isMobaCursorLockActive()) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = minimapClientToWorld(e.clientX, e.clientY);
      if (pos) {
        state.mobaCamX = pos.wx;
        state.mobaCamZ = pos.wz;
        state.mobaCamInitialized = true;
      }
    });
    const stopMinimapPointer = (e) => {
      if (minimapPointerId === null) return;
      if (e && e.pointerId !== undefined && e.pointerId !== minimapPointerId) return;
      try {
        if (minimapCanvas.hasPointerCapture && minimapCanvas.hasPointerCapture(minimapPointerId)) {
          minimapCanvas.releasePointerCapture(minimapPointerId);
        }
      } catch (_) {}
      minimapPointerId = null;
      minimapDragging = false;
    };
    minimapCanvas.addEventListener('pointerup', stopMinimapPointer);
    minimapCanvas.addEventListener('pointercancel', stopMinimapPointer);
    minimapCanvas.addEventListener('lostpointercapture', stopMinimapPointer);
  }
  window.addEventListener('mousemove', (e) => {
    if (!minimapDragging || state.cameraMode !== 'aerial' || minimapPointerId !== null) return;
    if (isPointerLocked() && isMobaCursorLockActive()) return;
    const pos = minimapClientToWorld(e.clientX, e.clientY);
    if (pos) {
      state.mobaCamX = pos.wx;
      state.mobaCamZ = pos.wz;
      state.mobaCamInitialized = true;
    }
  });
  window.addEventListener('mouseup', () => {
    if (minimapPointerId === null) {
      minimapDragging = false;
    }
  });

  bindControlsCustomizerUI();
}

function minimapClientToWorld(clientX, clientY) {
  if (!minimapCanvas || !minimapCanvas.getBoundingClientRect) return null;
  const rect = minimapCanvas.getBoundingClientRect();
  if (!rect || !rect.width || !rect.height) return null;
  const u = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const v = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  return {
    wx: (u - 0.5) * FIELD.width,
    wz: (v - 0.5) * FIELD.depth
  };
}

function handleMinimapPress(clientX, clientY) {
  const pos = minimapClientToWorld(clientX, clientY);
  if (!pos) return;
  const isAerial = state.cameraMode === 'aerial';
  const canSwitch = !state.myLockedRole && ctx.api.isTutorialRoleSwitchAllowed();
  let closestRole = null;
  let bestDist = isAerial ? 10 : 18;
  if (canSwitch) {
    ['G', 'C', 'D'].forEach((role) => {
      const p = getPlayer(state.myTeam, role);
      if (!p || p.tutorialHidden) return;
      if (isAerial && role === state.controlledRole) return;
      const d = Math.hypot(p.pos.x - pos.wx, p.pos.z - pos.wz);
      if (d < bestDist) {
        bestDist = d;
        closestRole = role;
      }
    });
  }
  if (closestRole) {
    selectControlledRole(closestRole);
    renderMinimap();
    return;
  }
  if (isAerial) {
    minimapDragging = true;
    state.mobaCamX = pos.wx;
    state.mobaCamZ = pos.wz;
    state.mobaCamInitialized = true;
    renderMinimap();
  }
}

// --- PERSONNALISATION DES CONTRÔLES & PERSISTANCE ---
const CONTROLS_STORAGE_KEY = 'coilball_controls_v2';
const LEGACY_CONTROLS_STORAGE_KEY = 'coilball_controls_v1';

export function saveControlsConfig() {
  try {
    localStorage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({
        controls: state.controls,
        mobaEdgePan: !!state.mobaEdgePan,
        mobaCursorLock: !!state.mobaCursorLock,
        mobaCamSpeed: state.mobaCamSpeed,
        tpsSensitivity: state.tpsSensitivity,
        defaultCameraMode: state.defaultCameraMode === 'aerial' ? 'aerial' : 'tps',
        mobaMoveButton: state.mobaMoveButton === 'left' ? 'left' : 'right'
      })
    );
  } catch (_) {}
}

export function loadControlsConfig() {
  state.controls = cloneDefaultControls();
  state.defaultCameraMode = 'tps';
  state.mobaMoveButton = 'right';
  let loadedMobaBtn = null;
  try {
    const raw = localStorage.getItem(CONTROLS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.controls && typeof parsed.controls === 'object') {
          for (const key in DEFAULT_CONTROLS) {
            const arr = parsed.controls[key];
            if (Array.isArray(arr)) {
              state.controls[key] = [
                typeof arr[0] === 'string' && arr[0] ? arr[0] : null,
                typeof arr[1] === 'string' && arr[1] ? arr[1] : null
              ];
            }
          }
        }
        if (typeof parsed.mobaEdgePan === 'boolean') {
          state.mobaEdgePan = parsed.mobaEdgePan;
        }
        if (typeof parsed.mobaCursorLock === 'boolean') {
          state.mobaCursorLock = parsed.mobaCursorLock;
        }
        if (typeof parsed.mobaCamSpeed === 'number' && Number.isFinite(parsed.mobaCamSpeed)) {
          state.mobaCamSpeed = Math.max(0.5, Math.min(1.6, parsed.mobaCamSpeed));
        }
        if (typeof parsed.tpsSensitivity === 'number' && Number.isFinite(parsed.tpsSensitivity)) {
          state.tpsSensitivity = Math.max(0.5, Math.min(1.6, parsed.tpsSensitivity));
        }
        if (parsed.defaultCameraMode === 'aerial' || parsed.defaultCameraMode === 'tps') {
          state.defaultCameraMode = parsed.defaultCameraMode;
        }
        if (parsed.mobaMoveButton === 'left' || parsed.mobaMoveButton === 'right') {
          loadedMobaBtn = parsed.mobaMoveButton;
        }
      }
    } else {
      // Migration douce depuis v1 : conserver caméra/sensibilités tout en adoptant les nouvelles touches v2
      const legacyRaw = localStorage.getItem(LEGACY_CONTROLS_STORAGE_KEY);
      if (legacyRaw) {
        const legacyParsed = JSON.parse(legacyRaw);
        if (legacyParsed && typeof legacyParsed === 'object') {
          if (typeof legacyParsed.mobaEdgePan === 'boolean') {
            state.mobaEdgePan = legacyParsed.mobaEdgePan;
          }
          if (typeof legacyParsed.mobaCursorLock === 'boolean') {
            state.mobaCursorLock = legacyParsed.mobaCursorLock;
          }
          if (typeof legacyParsed.mobaCamSpeed === 'number' && Number.isFinite(legacyParsed.mobaCamSpeed)) {
            state.mobaCamSpeed = Math.max(0.5, Math.min(1.6, legacyParsed.mobaCamSpeed));
          }
          if (typeof legacyParsed.tpsSensitivity === 'number' && Number.isFinite(legacyParsed.tpsSensitivity)) {
            state.tpsSensitivity = Math.max(0.5, Math.min(1.6, legacyParsed.tpsSensitivity));
          }
          if (legacyParsed.defaultCameraMode === 'aerial' || legacyParsed.defaultCameraMode === 'tps') {
            state.defaultCameraMode = legacyParsed.defaultCameraMode;
          }
          if (legacyParsed.mobaMoveButton === 'left' || legacyParsed.mobaMoveButton === 'right') {
            loadedMobaBtn = legacyParsed.mobaMoveButton;
          }
        }
      }
    }
  } catch (_) {}

  if (loadedMobaBtn) {
    state.mobaMoveButton = loadedMobaBtn;
    const expectedCode = loadedMobaBtn === 'left' ? 'Mouse0' : 'Mouse2';
    const slots = Array.isArray(state.controls.mobaMove) ? state.controls.mobaMove : [expectedCode, null];
    slots[0] = expectedCode;
    if (slots[1] === expectedCode) slots[1] = null;
    state.controls.mobaMove = slots;
  } else {
    state.mobaMoveButton =
      state.controls.mobaMove && state.controls.mobaMove[0] === 'Mouse0' ? 'left' : 'right';
  }

  syncControlsSettingsUI();
  renderControlsCustomizer();
  updateControlsHelpForCameraMode();
  updateFullscreenButtonsUI();
}

export function cancelControlRebind() {
  if (!state.rebindingState) return;
  state.rebindingState = null;
  const banner = document.getElementById('controls-rebind-banner');
  if (banner) banner.classList.add('hidden');
  renderControlsCustomizer();
}

function setControlBinding(actionKey, slotIndex, code) {
  if (!state.controls) state.controls = cloneDefaultControls();
  if (!Array.isArray(state.controls[actionKey])) {
    state.controls[actionKey] = [...(DEFAULT_CONTROLS[actionKey] || [null, null])];
  }
  const slots = state.controls[actionKey];
  if (code) {
    const otherIdx = slotIndex === 0 ? 1 : 0;
    if (slots[otherIdx] === code) slots[otherIdx] = null;
  }
  slots[slotIndex] = code || null;
  if (actionKey === 'mobaMove' && slotIndex === 0) {
    if (code === 'Mouse0') state.mobaMoveButton = 'left';
    else if (code === 'Mouse2') state.mobaMoveButton = 'right';
  }
  saveControlsConfig();
  syncControlsSettingsUI();
  updateControlsHelpForCameraMode();
  updateFullscreenButtonsUI();
  renderControlsCustomizer();
}

function startControlRebind(actionKey, slotIndex) {
  const meta = CONTROL_ACTIONS_META.find((m) => m.key === actionKey);
  if (!meta) return;
  state.rebindingState = { actionKey, slotIndex };
  const banner = document.getElementById('controls-rebind-banner');
  const labelEl = document.getElementById('controls-rebind-label');
  if (labelEl) {
    labelEl.textContent = `Modification : ${meta.label} (Touche ${slotIndex + 1})`;
  }
  if (banner) banner.classList.remove('hidden');
  renderControlsCustomizer();
}

export function resetControlsToDefault() {
  cancelControlRebind();
  state.controls = cloneDefaultControls();
  state.mobaEdgePan = true;
  state.mobaCursorLock = true;
  state.mobaCamSpeed = 1.0;
  state.tpsSensitivity = 1.0;
  state.defaultCameraMode = 'tps';
  state.mobaMoveButton = 'right';
  saveControlsConfig();
  syncControlsSettingsUI();
  renderControlsCustomizer();
  updateControlsHelpForCameraMode();
  updateFullscreenButtonsUI();
  showToast('🔄 <strong>Contrôles réinitialisés par défaut !</strong>', 2000);
}

function syncControlsSettingsUI() {
  const defaultCamBtn = document.getElementById('btn-opt-default-cam');
  if (defaultCamBtn) {
    const isMoba = state.defaultCameraMode === 'aerial';
    defaultCamBtn.textContent = isMoba
      ? '🎥 Caméra par défaut : MOBA'
      : '🎥 Caméra par défaut : TPS';
    defaultCamBtn.classList.toggle('active-mode-pill', isMoba);
  }
  const mobaClickBtn = document.getElementById('btn-opt-moba-click');
  if (mobaClickBtn) {
    const isLeft = state.mobaMoveButton === 'left';
    mobaClickBtn.textContent = isLeft
      ? '🖱️ Déplacement MOBA : Clic Gauche'
      : '🖱️ Déplacement MOBA : Clic Droit';
    mobaClickBtn.classList.toggle('active-mode-pill', !isLeft);
  }
  const edgeBtn = document.getElementById('btn-ctrl-edge-pan');
  if (edgeBtn) {
    edgeBtn.textContent = state.mobaEdgePan
      ? "🖥️ Défilement bord d'écran MOBA : ON"
      : "🖥️ Défilement bord d'écran MOBA : OFF";
    edgeBtn.classList.toggle('active-mode-pill', !!state.mobaEdgePan);
  }
  const lockBtn = document.getElementById('btn-ctrl-moba-cursor-lock');
  if (lockBtn) {
    lockBtn.textContent = state.mobaCursorLock
      ? '🔒 Curseur confiné en MOBA : ON'
      : '🔓 Curseur confiné en MOBA : OFF';
    lockBtn.classList.toggle('active-mode-pill', !!state.mobaCursorLock);
  }
  const mobaSlider = document.getElementById('input-ctrl-moba-speed');
  const mobaVal = document.getElementById('ctrl-moba-speed-val');
  const mobaPct = Math.round((state.mobaCamSpeed || 1.0) * 100);
  if (mobaSlider) mobaSlider.value = String(mobaPct);
  if (mobaVal) mobaVal.textContent = `${mobaPct}%`;

  const tpsSlider = document.getElementById('input-ctrl-tps-sens');
  const tpsVal = document.getElementById('ctrl-tps-sens-val');
  const tpsPct = Math.round((state.tpsSensitivity || 1.0) * 100);
  if (tpsSlider) tpsSlider.value = String(tpsPct);
  if (tpsVal) tpsVal.textContent = `${tpsPct}%`;
}

export function renderControlsCustomizer() {
  const grid = document.getElementById('controls-bindings-grid');
  if (!grid) return;
  grid.innerHTML = '';

  CONTROL_CATEGORIES.forEach((cat) => {
    const items = CONTROL_ACTIONS_META.filter((m) => m.category === cat.id);
    if (items.length === 0) return;

    const section = document.createElement('div');
    section.className = 'controls-cat-section';

    const hdr = document.createElement('div');
    hdr.className = 'controls-cat-header';
    hdr.textContent = cat.label;
    section.appendChild(hdr);

    items.forEach((meta) => {
      const row = document.createElement('div');
      row.className = 'controls-bind-row';

      const lbl = document.createElement('span');
      lbl.className = 'controls-bind-label';
      lbl.textContent = meta.label;
      row.appendChild(lbl);

      const slotsWrap = document.createElement('div');
      slotsWrap.className = 'controls-bind-slots';
      const slots = (state.controls && state.controls[meta.key]) || DEFAULT_CONTROLS[meta.key] || [null, null];

      [0, 1].forEach((slotIdx) => {
        const code = slots[slotIdx] || null;
        const isListening =
          !!(
            state.rebindingState &&
            state.rebindingState.actionKey === meta.key &&
            state.rebindingState.slotIndex === slotIdx
          );
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `ctrl-bind-btn${isListening ? ' listening' : ''}${!code && !isListening ? ' empty' : ''}`;
        btn.textContent = isListening ? 'Appuyez...' : formatInputCode(code);
        btn.title = `Cliquer pour modifier l'emplacement ${slotIdx + 1} (${meta.label})`;
        btn.onclick = (e) => {
          if (e) e.stopPropagation();
          btn.blur();
          startControlRebind(meta.key, slotIdx);
        };
        slotsWrap.appendChild(btn);
      });

      row.appendChild(slotsWrap);
      section.appendChild(row);
    });

    grid.appendChild(section);
  });
}

function bindControlsCustomizerUI() {
  const defaultCamBtn = document.getElementById('btn-opt-default-cam');
  if (defaultCamBtn) {
    defaultCamBtn.onclick = () => {
      defaultCamBtn.blur();
      state.defaultCameraMode = state.defaultCameraMode === 'aerial' ? 'tps' : 'aerial';
      saveControlsConfig();
      syncControlsSettingsUI();
      if (state.phase === 'menu' && !state.mobileMode) {
        setCameraMode(state.defaultCameraMode, true);
      }
    };
  }
  const mobaClickBtn = document.getElementById('btn-opt-moba-click');
  if (mobaClickBtn) {
    mobaClickBtn.onclick = () => {
      mobaClickBtn.blur();
      state.mobaMoveButton = state.mobaMoveButton === 'left' ? 'right' : 'left';
      const nextCode = state.mobaMoveButton === 'left' ? 'Mouse0' : 'Mouse2';
      if (!state.controls) state.controls = cloneDefaultControls();
      const prevSlots = Array.isArray(state.controls.mobaMove) ? state.controls.mobaMove : [nextCode, null];
      const slot1 = prevSlots[1] && prevSlots[1] !== nextCode ? prevSlots[1] : null;
      state.controls.mobaMove = [nextCode, slot1];
      saveControlsConfig();
      syncControlsSettingsUI();
      renderControlsCustomizer();
      updateControlsHelpForCameraMode();
    };
  }
  const edgeBtn = document.getElementById('btn-ctrl-edge-pan');
  if (edgeBtn) {
    edgeBtn.onclick = () => {
      edgeBtn.blur();
      state.mobaEdgePan = !state.mobaEdgePan;
      saveControlsConfig();
      syncControlsSettingsUI();
    };
  }
  const lockBtn = document.getElementById('btn-ctrl-moba-cursor-lock');
  if (lockBtn) {
    lockBtn.onclick = () => {
      lockBtn.blur();
      state.mobaCursorLock = !state.mobaCursorLock;
      saveControlsConfig();
      syncControlsSettingsUI();
      if (!state.mobaCursorLock && state.cameraMode === 'aerial' && isPointerLocked()) {
        unlockPointer();
      }
      updateMobaVirtualCursorUI();
    };
  }
  const mobaSlider = document.getElementById('input-ctrl-moba-speed');
  if (mobaSlider) {
    mobaSlider.oninput = () => {
      const pct = Math.max(50, Math.min(160, Number(mobaSlider.value) || 100));
      state.mobaCamSpeed = pct / 100;
      syncControlsSettingsUI();
      saveControlsConfig();
    };
  }
  const tpsSlider = document.getElementById('input-ctrl-tps-sens');
  if (tpsSlider) {
    tpsSlider.oninput = () => {
      const pct = Math.max(50, Math.min(160, Number(tpsSlider.value) || 100));
      state.tpsSensitivity = pct / 100;
      syncControlsSettingsUI();
      saveControlsConfig();
    };
  }
  const resetBtn = document.getElementById('btn-reset-controls');
  if (resetBtn) {
    resetBtn.onclick = () => {
      resetBtn.blur();
      resetControlsToDefault();
    };
  }
  const cancelBtn = document.getElementById('btn-cancel-rebind');
  if (cancelBtn) {
    cancelBtn.onclick = (e) => {
      if (e) e.stopPropagation();
      cancelBtn.blur();
      cancelControlRebind();
    };
  }
}

function triggerOrChargeAction(source = 'kb') {
  const controlled = getPlayer(state.myTeam, state.controlledRole);
  if (controlled && controlled.state === 'standing' && controlled.carryingBall) {
    if (!state.passCharge || !state.passCharge.active) {
      ctx.api.beginPassCharge?.(source);
    }
    return;
  }
  ctx.api.handleActionKey();
}

function handleMobaActionAndRecenter(inputCode, isRepeat, source = 'kb') {
  const isAerial = state.cameraMode === 'aerial';
  const isRecenter = isAerial && matchesControl('recenterCam', inputCode);
  const isAction = matchesControl('action', inputCode);
  const controlled = getPlayer(state.myTeam, state.controlledRole);
  const carryingOrCharging = !!(
    controlled &&
    controlled.state === 'standing' &&
    (controlled.carryingBall || (state.passCharge && state.passCharge.active))
  );

  // Empêcher recenterCam si lié à la même touche pendant que la joueuse porte un ballon ou charge une passe
  if (isAction && carryingOrCharging) {
    if (!isRepeat && !(state.passCharge && state.passCharge.active)) {
      ctx.api.beginPassCharge?.(source);
    }
    return true;
  }

  if (isRecenter) {
    if (!isRepeat) {
      const camDistBefore = controlled
        ? Math.hypot((state.mobaCamX || 0) - controlled.pos.x, (state.mobaCamZ || 0) - controlled.pos.z)
        : 0;
      recenterMobaCamera(false);
      if (isAction) {
        const hasUrgentAction = !!(
          controlled &&
          (controlled.carryingBall || controlled.state === 'sitting')
        );
        if (camDistBefore <= 8.0 || hasUrgentAction) {
          triggerOrChargeAction(source);
        }
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

function registerUIGlobalListeners() {
  document.addEventListener('pointerlockchange', () => {
    const locked = isPointerLocked();
    const hadPlayLock = wasPointerLockedInPlay;
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
        wasPointerLockedInPlay = true;
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
    wasPointerLockedInPlay = false;
    lastMouseX = null;
    lastMouseY = null;
    clearInputKeys();
    updateMobaVirtualCursorUI();

    if (
      hadPlayLock &&
      state.phase === 'play' &&
      !isMenuOpen() &&
      canLockNow &&
      !(state.mode === 'practice' && state.practiceCursorFree) &&
      performance.now() > programmaticPointerUnlockUntil &&
      performance.now() > resumePointerLockGraceUntil
    ) {
      lastEscapePauseMs = performance.now();
      openPauseMenu();
    }
  });

  document.addEventListener('pointerlockerror', () => {
    document.body.classList.remove('play-cursor-hidden');
    updateMobaVirtualCursorUI();
  });

  window.addEventListener('keydown', (e) => {
    if (state.rebindingState) {
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
      return;
    }

    if (
      e.target &&
      (e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'SELECT' ||
        e.target.isContentEditable)
    ) {
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
      e.preventDefault();
      if (e.repeat) return;
      if (performance.now() - lastEscapePauseMs < 140) {
        return;
      }
      if (state.passCharge && state.passCharge.active) {
        ctx.api.cancelPassCharge?.();
      }
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
      if (
        state.mode === 'practice' &&
        state.practiceShopPreservePlay &&
        visibleId === 'prep-modal'
      ) {
        ctx.api.closePracticeShopAndReturn();
        return;
      }
      if (visibleId === 'pause-modal' && state.phase !== 'menu') {
        resumeFromPauseMenu({ fromEscape: true });
      } else if (state.phase !== 'menu') {
        openPauseMenu();
      }
      return;
    }

    if (matchesControl('openShop', e.code) && !e.repeat) {
      const prepEl = document.getElementById('prep-modal');
      if (
        state.mode === 'practice' &&
        state.practiceShopPreservePlay &&
        prepEl &&
        !prepEl.classList.contains('hidden')
      ) {
        e.preventDefault();
        ctx.api.closePracticeShopAndReturn();
        return;
      }
    }

    if (isKeyFEvent(e)) {
      e.preventDefault();
      if (!e.repeat) {
        toggleFullscreen();
      }
      return;
    }

    keys[e.code] = true;

    if (!isMenuOpen()) {
      if (e.code === 'Tab' || matchesControl('recenterCam', e.code)) {
        e.preventDefault();
      }
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
        return;
      }

      if (
        matchesControl('openShop', e.code) &&
        !e.repeat &&
        ((state.mode === 'tutorial' && state.tutorialStep === 3) || state.mode === 'practice')
      ) {
        e.preventDefault();
        ctx.api.openShopShortcut();
        return;
      }

      // Verrouiller automatiquement le curseur dès la première touche pressée en TPS ou en MOBA confiné (hors bascule caméra, P ou Boutique)
      if (
        (state.cameraMode === 'tps' || isMobaCursorLockActive()) &&
        !matchesControl('toggleCam', e.code) &&
        e.code !== 'KeyP' &&
        !matchesControl('openShop', e.code) &&
        !(state.mode === 'practice' && state.practiceCursorFree)
      ) {
        lockPointerIfPlaying();
      }

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

      if (!state.myLockedRole && ctx.api.isTutorialRoleSwitchAllowed()) {
        if (matchesControl('roleG', e.code) && !e.repeat) selectControlledRole('G');
        if (matchesControl('roleC', e.code) && !e.repeat) selectControlledRole('C');
        if (matchesControl('roleD', e.code) && !e.repeat) selectControlledRole('D');
        if (matchesControl('cycleRoleNext', e.code) && !e.repeat) {
          e.preventDefault();
          cycleControlledRole(1);
        }
      }
      if (handleMobaActionAndRecenter(e.code, e.repeat, 'kb')) {
        e.preventDefault();
      }
      if (matchesControl('dash', e.code) && !e.repeat) {
        e.preventDefault();
        ctx.api.triggerDash();
      }
      if (matchesControl('jump', e.code) && !e.repeat) {
        e.preventDefault();
        ctx.api.triggerJump?.();
      }
      if (matchesControl('ultimate', e.code) && !e.repeat) {
        e.preventDefault();
        toggleUltimatePreview();
      }
      if (matchesControl('minimapSize', e.code) && !e.repeat) {
        e.preventDefault();
        toggleMinimapSize();
      }
      if (matchesControl('minimapVision', e.code) && !e.repeat) {
        e.preventDefault();
        cycleMinimapVisionMode();
      }
      if (matchesControl('controlsHelp', e.code) && !e.repeat) {
        e.preventDefault();
        toggleControlsHelpSubmenu();
      }
      if (state.cameraMode === 'aerial' && matchesControl('toggleCamLock', e.code) && !e.repeat) {
        e.preventDefault();
        toggleMobaCamLock();
      }
      if (matchesControl('toggleCam', e.code) && !e.repeat) {
        e.preventDefault();
        toggleCameraMode();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
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
      if (pendingPointerLockOnEscapeKeyup) {
        pendingPointerLockOnEscapeKeyup = false;
        if (shouldLockNow) {
          resumePointerLockGraceUntil = performance.now() + 120;
          lockPointerIfPlaying();
        }
      }
      return;
    }
    if (
      isKeyFEvent(e) ||
      e.code === 'KeyP' ||
      matchesControl('openShop', e.code)
    ) {
      return;
    }
    if (shouldLockNow) {
      lockPointerIfPlaying();
    }
  });

  window.addEventListener('blur', () => {
    state.mouseInWindow = false;
    pendingPointerLockOnEscapeKeyup = false;
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
      clearInputKeys();
    }
  });

  window.addEventListener('auxclick', (e) => {
    if (e.button === 1 && !isMenuOpen()) {
      e.preventDefault();
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (state.rebindingState) {
      if (e.target && e.target.closest && e.target.closest('#btn-cancel-rebind')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const { actionKey, slotIndex } = state.rebindingState;
      setControlBinding(actionKey, slotIndex, `Mouse${e.button}`);
      cancelControlRebind();
      return;
    }

    const mouseCode = `Mouse${e.button}`;
    mouseButtonsDown[mouseCode] = true;
    if (e.button === 1 && !isMenuOpen()) {
      e.preventDefault();
    }

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
    if (state.mode === 'practice' && state.practiceCursorFree) {
      state.practiceCursorFree = false;
    }
    if (state.mobileMode) {
      return;
    }

    const mobaLockedActive = isPointerLocked() && isMobaCursorLockActive();
    const ptrX = mobaLockedActive
      ? (typeof state.mouseClientX === 'number' ? state.mouseClientX : (window.innerWidth || 1280) * 0.5)
      : e.clientX;
    const ptrY = mobaLockedActive
      ? (typeof state.mouseClientY === 'number' ? state.mouseClientY : (window.innerHeight || 720) * 0.5)
      : e.clientY;

    state.mouseClientX = ptrX;
    state.mouseClientY = ptrY;
    state.mouseInWindow = true;

    if (mobaLockedActive && typeof document.elementFromPoint === 'function') {
      const virtualTarget = document.elementFromPoint(ptrX, ptrY);
      if (virtualTarget) {
        if (virtualTarget === minimapCanvas) {
          if (e.button === 2 || (matchesControl('mobaMove', mouseCode) && e.button !== 0)) {
            e.preventDefault();
            const pos = minimapClientToWorld(ptrX, ptrY);
            if (pos) {
              applyMobaMoveCommand({ x: pos.wx, z: pos.wz, onCanopy: false }, true);
              if (state.mode === 'tutorial' && state.tutorialStep === 5) {
                ctx.api.markTutorialCheck('mobaToggled');
                ctx.api.markTutorialCheck('mobaMoved');
              }
            }
            updateMobaVirtualCursorUI();
            return;
          }
          if (e.button === 0) {
            e.preventDefault();
            handleMinimapPress(ptrX, ptrY);
            updateMobaVirtualCursorUI();
            return;
          }
        }
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
          return;
        }
        if (
          virtualTarget.closest &&
          virtualTarget.closest('#minimap-panel, #roster-panel, #quick-actions, #practice-menu-bar, #tutorial-sequence-hud, #controls-help')
        ) {
          updateMobaVirtualCursorUI();
          return;
        }
      }
    }

    if (state.cameraMode === 'aerial') {
      if (isMobaCursorLockActive() && !isPointerLocked()) {
        lockPointerIfPlaying();
      }
      const hit = raycastScreenToWorld(ptrX, ptrY);
      if (hit) state.mobaAimWorld = hit;

      if (state.ultPreviewActive && matchesControl('ultConfirm', mouseCode)) {
        e.preventDefault();
        confirmUltimateTrigger();
        updateMobaVirtualCursorUI();
        return;
      }

      let handledByBinding = false;
      if (matchesControl('mobaMove', mouseCode)) {
        handledByBinding = true;
        state.mobaRightMouseDown = true;
        if (hit) {
          applyMobaMoveCommand(hit, true);
          if (state.mode === 'tutorial' && state.tutorialStep === 5) {
            ctx.api.markTutorialCheck('mobaToggled');
            ctx.api.markTutorialCheck('mobaMoved');
          }
        }
      }

      if (handleMobaActionAndRecenter(mouseCode, false, 'mouse')) {
        handledByBinding = true;
      }
      if (matchesControl('dash', mouseCode)) {
        handledByBinding = true;
        ctx.api.triggerDash();
      }
      if (matchesControl('jump', mouseCode)) {
        handledByBinding = true;
        ctx.api.triggerJump?.();
      }
      if (matchesControl('ultimate', mouseCode)) {
        handledByBinding = true;
        toggleUltimatePreview();
      }
      if (matchesControl('toggleCamLock', mouseCode)) {
        handledByBinding = true;
        toggleMobaCamLock();
      }
      if (matchesControl('toggleCam', mouseCode)) {
        handledByBinding = true;
        toggleCameraMode();
      }
      if (!state.myLockedRole && ctx.api.isTutorialRoleSwitchAllowed()) {
        if (matchesControl('roleG', mouseCode)) {
          handledByBinding = true;
          selectControlledRole('G');
        } else if (matchesControl('roleC', mouseCode)) {
          handledByBinding = true;
          selectControlledRole('C');
        } else if (matchesControl('roleD', mouseCode)) {
          handledByBinding = true;
          selectControlledRole('D');
        } else if (matchesControl('cycleRoleNext', mouseCode)) {
          handledByBinding = true;
          cycleControlledRole(1);
        }
      }

      if (!handledByBinding && e.button === 0 && !state.myLockedRole && ctx.api.isTutorialRoleSwitchAllowed()) {
        const pickedRole = pickAlliedPlayerNearClick(ptrX, ptrY, hit);
        if (pickedRole && pickedRole !== state.controlledRole) {
          selectControlledRole(pickedRole);
        }
      }
      updateMobaVirtualCursorUI();
      return;
    }

    if (!state.mobileMode) {
      lockPointerIfPlaying();
    }

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

    if (!state.mobileMode) {
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
      if (
        !tpsBoundHandled &&
        !state.myLockedRole &&
        ctx.api.isTutorialRoleSwitchAllowed()
      ) {
        if (e.button === 0) {
          cycleControlledRole(-1);
        } else if (e.button === 2) {
          cycleControlledRole(1);
        }
      }
    }
  });

  window.addEventListener('mouseup', (e) => {
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
  });

  window.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('mousemove', (e) => {
    if (state.mobileMode) {
      return;
    }
    const mobaLockedActive = isPointerLocked() && isMobaCursorLockActive();
    if (mobaLockedActive) {
      const vw = Math.max(1, window.innerWidth || 1280);
      const vh = Math.max(1, window.innerHeight || 720);
      const curX = typeof state.mouseClientX === 'number' ? state.mouseClientX : vw * 0.5;
      const curY = typeof state.mouseClientY === 'number' ? state.mouseClientY : vh * 0.5;
      state.mouseClientX = Math.max(0, Math.min(vw - 1, curX + (e.movementX || 0)));
      state.mouseClientY = Math.max(0, Math.min(vh - 1, curY + (e.movementY || 0)));
    } else {
      state.mouseClientX = e.clientX;
      state.mouseClientY = e.clientY;
    }
    state.mouseInWindow = true;

    if (isMenuOpen()) {
      lastMouseX = null;
      lastMouseY = null;
      state.mobaRightMouseDown = false;
      updateMobaVirtualCursorUI();
      return;
    }

    if (state.cameraMode === 'aerial') {
      updateMobaVirtualCursorUI();
      if (minimapDragging && mobaLockedActive) {
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
        if (state.mobaRightMouseDown) {
          applyMobaMoveCommand(hit, false);
        }
      }
      lastMouseX = state.mouseClientX;
      lastMouseY = state.mouseClientY;
      return;
    }

    if (state.mobileMode) {
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
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    } else {
      if (lastMouseX !== null && lastMouseY !== null) {
        dx = e.clientX - lastMouseX;
        dy = e.clientY - lastMouseY;
      }
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }

    const sens = state.tpsSensitivity || 1.0;
    state.camYaw -= dx * 0.0055 * sens;
    state.camPitch = Math.max(0.12, Math.min(1.15, state.camPitch + dy * 0.0045 * sens));
  });

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
  if (
    typeof screen !== 'undefined' &&
    screen.orientation &&
    typeof screen.orientation.addEventListener === 'function'
  ) {
    screen.orientation.addEventListener('change', () => scheduleViewportSync(true));
  }
  if (typeof window !== 'undefined' && window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => scheduleViewportSync(false));
    window.visualViewport.addEventListener('scroll', () => {
      if (state.mobileMode) {
        try {
          window.scrollTo(0, 0);
        } catch (_) {}
      }
      scheduleViewportSync(false);
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resetMobileInput();
    }
  });
}

export function resetPointerLockFlags() {
  warnedIframeLockInRound = false;
  wasPointerLockedInPlay = false;
}

export function hideMobaMoveMarker() {
  if (mobaMoveMarker) mobaMoveMarker.visible = false;
}

export function updateMobaMoveMarkerAnim(dt) {
  if (mobaMoveMarker && mobaMoveMarker.visible) {
    mobaMoveMarkerPulse = (mobaMoveMarkerPulse + dt * 2.2) % 1.0;
    const ringScale = 0.8 + mobaMoveMarkerPulse * 0.55;
    if (mobaMoveMarkerRing) {
      mobaMoveMarkerRing.scale.setScalar(ringScale);
      mobaMoveMarkerRing.material.opacity = 0.9 * (1 - mobaMoveMarkerPulse * 0.65);
    }
  }
}

export function syncViewportIfResized() {
  const { w, h } = getViewportSize();
  if (w !== lastViewportW || h !== lastViewportH) {
    syncViewportSize();
  }
}

export function initUI() {
  mobaRaycaster = new THREE.Raycaster();
  mobaPointerNDC = new THREE.Vector2();
  mobaTmpVec = new THREE.Vector3();
  _tmpCamDesired = new THREE.Vector3();
  _tmpCamLook = new THREE.Vector3();
  _tmpProjVec = new THREE.Vector3();
  const vp = getViewportSize();
  lastViewportW = vp.w;
  lastViewportH = vp.h;
  ctx.api.getMobileAimOverride = getMobileAimOverride;
  ctx.api.isMobileAimCancelled = isMobileAimCancelled;
  ctx.api.computeMobileAutoAimAngle = computeMobileAutoAimAngle;
  ctx.api.setMpLobbyVanilla = setMpLobbyVanilla;
  ctx.api.toggleMobaCamLock = toggleMobaCamLock;
  ctx.api.updateControlsHelpForCameraMode = updateControlsHelpForCameraMode;
  minimapCanvas = document.getElementById('minimap-canvas');
  minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
  minimapSpottedEl = document.getElementById('minimap-spotted-count');
  syncMinimapCanvasDimensions();
  initMobileAndDeviceControls();
  loadControlsConfig();
  registerUIGlobalListeners();
  bindUIButtons();
}
