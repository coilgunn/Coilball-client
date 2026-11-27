import { FIELD, TUTORIAL_STEPS, escapeHtml, matchesControl, mp, state, ctx } from '../state.js';
import { getPlayer } from '../render3d.js';
import { toggleUltimatePreview } from '../ultimates.js';
import { closeMultiplayerSession, hostRoom, joinRoom, sendNetMessage, updateLobbyUI } from '../net.js';
import {
  attachLockFocusPrep,
  isMenuOpen,
  isMobaCursorLockActive,
  isPointerLocked,
  uiState
} from './shared.js';
import { showToast } from './toast.js';
import { toggleFullscreen } from './viewport.js';
import { applyMobaMoveCommand } from './raycast.js';
import { toggleCameraMode } from './camera.js';
import { selectControlledRole } from './role_select.js';
import { showOnlyModal } from './modals_core.js';
import { selectArenaMap } from './arena_lobby.js';
import { openOptionsModal, openPauseMenu, resumeFromPauseMenu } from './modals_actions.js';
import {
  switchHudLeftSubmenu,
  switchPrepSubmenu,
  switchWelcomeSubmenu,
  toggleControlsHelpSubmenu,
  toggleHudLeftCollapse
} from './hud_submenus.js';
import { cycleMinimapVisionMode, renderMinimap, toggleMinimapSize } from './minimap_render.js';
import { bindControlsCustomizerUI } from './controls_ui.js';

export function minimapClientToWorld(clientX, clientY) {
  const c = uiState.minimapCanvas;
  if (!c || !c.getBoundingClientRect) return null;
  const rect = c.getBoundingClientRect();
  if (!rect || !rect.width || !rect.height) return null;
  const u = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const v = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  return { wx: (u - 0.5) * FIELD.width, wz: (v - 0.5) * FIELD.depth };
}

export function handleMinimapPress(clientX, clientY) {
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
    uiState.minimapDragging = true;
    state.mobaCamX = pos.wx;
    state.mobaCamZ = pos.wz;
    state.mobaCamInitialized = true;
    renderMinimap();
  }
}

function bindMpRoomAndPrepButtons() {
  document.getElementById('btn-mp-back').onclick = () => {
    if (state.mode === 'practice' && state.phase === 'play') resumeFromPauseMenu();
    else if (state.phase !== 'menu') openPauseMenu();
    else showOnlyModal('welcome-modal');
  };
  document.getElementById('btn-host-room').onclick = () => hostRoom();
  document.getElementById('btn-join-room').onclick = () => joinRoom(document.getElementById('mp-room-input').value);
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
      if (oldCode) showToast(`🔌 Vous avez quitté le salon <strong>${escapeHtml(oldCode)}</strong>.`, 2500);
    };
  }
  document.getElementById('btn-mp-start').onclick = () => {
    if (!mp.enabled || !mp.isHost) return;
    if (mp.lobbyMode === 'practice') {
      ctx.api.startNewMatch('practice', { keepMp: true, vanillaMode: !!mp.lobbyVanilla });
    } else {
      ctx.api.startNewMatch('multiplayer', {
        keepMp: true,
        vanillaMode: !!mp.lobbyVanilla,
        aiDifficulty: mp.lobbyAiDifficulty || state.aiDifficulty || 'normal'
      });
    }
  };
  const btnConfirmPrep = document.getElementById('btn-confirm-prep');
  attachLockFocusPrep(btnConfirmPrep);
  btnConfirmPrep.onclick = () => {
    if (state.mode === 'practice' && state.practiceShopPreservePlay) {
      ctx.api.closePracticeShopAndReturn();
      return;
    }
    if (!mp.enabled) {
      ctx.api.startRoundExecution();
      return;
    }
    const me = mp.members.find((m) => m.peerId === mp.myPeerId);
    if (me) me.prepReady = true;
    if (mp.isHost) {
      const myTeamMembers = mp.members.filter((m) => m.team === state.myTeam);
      state.teams[state.myTeam].prepReady = myTeamMembers.every((m) => !!m.prepReady);
      ctx.api.updatePrepConfirmButtonUI();
      ctx.api.syncMyTeamPrep();
      ctx.api.maybeStartRoundFromPrep();
    } else {
      ctx.api.updatePrepConfirmButtonUI();
      sendNetMessage({ type: 'MP_PREP_ACTION', peerId: mp.myPeerId, team: state.myTeam, action: 'ready' });
    }
  };
  window.addEventListener('beforeunload', () => {
    if (mp.enabled) closeMultiplayerSession(true);
  });
}

function bindQuickAndMapGridButtons() {
  ['pause-practice-map-select', 'practice-map-select'].forEach((id) => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.onchange = () => {
        const nextMapId = sel.value;
        sel.blur();
        selectArenaMap(nextMapId, true);
      };
    }
  });
  ['btn-fullscreen', 'btn-welcome-fullscreen'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.onclick = () => {
        btn.blur();
        toggleFullscreen();
      };
    }
  });
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
  [
    { id: 'arena-map-grid', broadcast: false },
    { id: 'mp-map-grid', broadcast: true }
  ].forEach(({ id, broadcast }) => {
    const grid = document.getElementById(id);
    if (!grid || !grid.children) return;
    Array.from(grid.children).forEach((btn) => {
      btn.onclick = () => {
        const mapId = btn.getAttribute && (btn.getAttribute('data-map') || btn.getAttribute('data-map-id'));
        if (mapId) selectArenaMap(mapId, broadcast);
      };
    });
  });
}

function bindSubmenuAndHudButtons() {
  const welcomeSubmenuBar = document.getElementById('welcome-submenu-tabs');
  if (welcomeSubmenuBar && welcomeSubmenuBar.children) {
    Array.from(welcomeSubmenuBar.children).forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.getAttribute && btn.getAttribute('data-welcome-tab');
        if (tab) switchWelcomeSubmenu(tab);
      };
    });
  }
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
      if (state.prepTab === 'dossards') switchPrepSubmenu('individual');
      else if (state.prepTab === 'individual') switchPrepSubmenu('collective');
      else switchPrepSubmenu('dossards');
    };
  }

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
}

function issueMinimapMobaMove(e) {
  e.preventDefault();
  e.stopPropagation();
  const pos = minimapClientToWorld(e.clientX, e.clientY);
  if (!pos) return;
  applyMobaMoveCommand({ x: pos.wx, z: pos.wz, onCanopy: false }, true);
  if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.MOBA) {
    ctx.api.markTutorialCheck('mobaToggled');
    ctx.api.markTutorialCheck('mobaMoved');
  }
}

function bindMinimapEvents() {
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
  const c = uiState.minimapCanvas;
  if (c) {
    c.addEventListener('pointerdown', (e) => {
      const mouseCode = `Mouse${e.button}`;
      const isMobaMoveBtn =
        !state.mobileMode &&
        e.pointerType === 'mouse' &&
        state.cameraMode === 'aerial' &&
        !isMenuOpen() &&
        matchesControl('mobaMove', mouseCode) &&
        (e.button !== 0 || state.mobaMoveButton === 'left');
      if ((isMobaMoveBtn && e.button !== 0) || (!state.mobileMode && e.pointerType === 'mouse' && e.button === 2 && state.cameraMode === 'aerial' && !isMenuOpen())) {
        issueMinimapMobaMove(e);
        return;
      }
      if ((e.pointerType === 'mouse' && e.button !== 0) || minimapPointerId !== null) return;
      e.preventDefault();
      e.stopPropagation();
      minimapPointerId = e.pointerId;
      try {
        c.setPointerCapture(e.pointerId);
      } catch (_) { /* ignore */ }
      handleMinimapPress(e.clientX, e.clientY);
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerId !== minimapPointerId || !uiState.minimapDragging || state.cameraMode !== 'aerial') return;
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
        if (c.hasPointerCapture && c.hasPointerCapture(minimapPointerId)) c.releasePointerCapture(minimapPointerId);
      } catch (_) { /* ignore */ }
      minimapPointerId = null;
      uiState.minimapDragging = false;
    };
    c.addEventListener('pointerup', stopMinimapPointer);
    c.addEventListener('pointercancel', stopMinimapPointer);
    c.addEventListener('lostpointercapture', stopMinimapPointer);
  }
  window.addEventListener('mousemove', (e) => {
    if (!uiState.minimapDragging || state.cameraMode !== 'aerial' || minimapPointerId !== null) return;
    if (isPointerLocked() && isMobaCursorLockActive()) return;
    const pos = minimapClientToWorld(e.clientX, e.clientY);
    if (pos) {
      state.mobaCamX = pos.wx;
      state.mobaCamZ = pos.wz;
      state.mobaCamInitialized = true;
    }
  });
  window.addEventListener('mouseup', () => {
    if (minimapPointerId === null) uiState.minimapDragging = false;
  });
}

export function bindHudUI() {
  bindMpRoomAndPrepButtons();
  bindQuickAndMapGridButtons();
  bindSubmenuAndHudButtons();
  bindMinimapEvents();
  bindControlsCustomizerUI();
}
