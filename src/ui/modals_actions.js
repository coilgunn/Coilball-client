import { mp, state, ctx } from '../state.js';
import { getActiveMapMeta } from '../world.js';
import { closeMultiplayerSession } from '../net.js';
import { clearInputKeys, uiState } from './shared.js';
import { lockPointerIfPlaying } from './pointer_lock.js';
import { updateFullscreenButtonsUI } from './viewport.js';
import { cancelControlRebind, syncControlsSettingsUI } from './controls_config.js';
import { renderControlsCustomizer } from './controls_ui.js';
import { updateTopHUD } from './hud_top_roster.js';
import { switchWelcomeSubmenu } from './hud_submenus.js';
import { showOnlyModal, updateWelcomePauseBanner } from './modals_core.js';
import { syncAIDifficultyUI, updateMapLockUI } from './arena_lobby.js';
import { updateDeviceToggleButtonsUI } from './mobile_hud.js';

export function openOptionsModal(returnTarget = null) {
  uiState.optionsReturnModal = returnTarget;
  clearInputKeys();
  syncControlsSettingsUI();
  ctx.api.syncAudioControlsUI?.();
  renderControlsCustomizer();
  updateDeviceToggleButtonsUI();
  syncAIDifficultyUI();
  showOnlyModal('options-modal');
  updateTopHUD();
}

export function closeOptionsModal() {
  const target = uiState.optionsReturnModal;
  uiState.optionsReturnModal = null;
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

export function syncArenaRulesetUI() {
  const titleEl = document.getElementById('arena-modal-title');
  const subEl = document.getElementById('arena-modal-subtitle');
  const launchBtn = document.getElementById('btn-arena-launch');
  const stdBtn = document.getElementById('btn-arena-rule-standard');
  const vanBtn = document.getElementById('btn-arena-rule-vanilla');

  if (stdBtn) stdBtn.classList.toggle('active', !uiState.pendingArenaVanilla);
  if (vanBtn) vanBtn.classList.toggle('active', !!uiState.pendingArenaVanilla);

  const vanillaSuffix = uiState.pendingArenaVanilla ? ' (Vanille)' : '';
  if (titleEl) {
    titleEl.textContent =
      uiState.pendingArenaMode === 'practice'
        ? `🧪 Choisir une Arène — Pratique${vanillaSuffix}`
        : `🚀 Choisir une Arène — Solo vs IA${vanillaSuffix}`;
  }
  if (subEl) {
    subEl.textContent = uiState.pendingArenaVanilla
      ? '🍦 Mode Vanille : sans Ultimate, Dash+, Évo Dash ni Outil • Passe débloquée au magasin'
      : uiState.pendingArenaMode === 'practice'
      ? "Sélectionnez votre terrain d'entraînement (modifiable ensuite dans le menu Pause)"
      : 'Sélectionnez le terrain avant de lancer votre match 3v3 (objectif 7 pts)';
  }
  if (launchBtn) {
    launchBtn.textContent =
      uiState.pendingArenaMode === 'practice'
        ? uiState.pendingArenaVanilla ? '🍦 Lancer Pratique Vanille' : '🧪 Lancer la Pratique'
        : uiState.pendingArenaVanilla ? '🍦 Lancer Solo Vanille' : '🚀 Lancer Solo vs IA';
  }
}

export function openArenaModal(mode = 'pedagogical', vanilla = false) {
  uiState.pendingArenaMode = mode === 'practice' ? 'practice' : 'pedagogical';
  uiState.pendingArenaVanilla = !!vanilla;
  const meta = getActiveMapMeta();
  const summaryEl = document.getElementById('arena-map-summary');

  syncArenaRulesetUI();
  syncAIDifficultyUI();
  if (summaryEl && meta) summaryEl.textContent = `${meta.icon} ${meta.name}`;
  updateMapLockUI();
  showOnlyModal('arena-modal');
}

export function returnToMainMenu(options = {}) {
  void options;
  uiState.optionsReturnModal = null;
  cancelControlRebind();
  if (state.passCharge && state.passCharge.active) ctx.api.cancelPassCharge?.();
  if (mp.enabled) closeMultiplayerSession(true);
  ctx.api.resetMatchStateToMenu();
  switchWelcomeSubmenu('play');
  showOnlyModal('welcome-modal');
}

export function openPauseMenu() {
  clearInputKeys();
  cancelControlRebind();
  uiState.pendingPointerLockOnEscapeKeyup = false;
  uiState.lastEscapePauseMs = performance.now();
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
  uiState.optionsReturnModal = null;
  cancelControlRebind();
  updateWelcomePauseBanner(false);
  uiState.lastEscapePauseMs = performance.now();
  if (state.phase === 'prep') {
    uiState.pendingPointerLockOnEscapeKeyup = false;
    showOnlyModal('prep-modal');
  } else if (state.phase === 'round_end' || state.phase === 'game_over') {
    uiState.pendingPointerLockOnEscapeKeyup = false;
    showOnlyModal('round-end-modal');
  } else {
    uiState.resumePointerLockGraceUntil = performance.now() + 650;
    showOnlyModal(null);
    if (fromEscape) {
      uiState.pendingPointerLockOnEscapeKeyup = true;
    } else {
      uiState.pendingPointerLockOnEscapeKeyup = false;
      lockPointerIfPlaying();
    }
  }
  updateTopHUD();
}
