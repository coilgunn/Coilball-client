import { AI_DIFFICULTIES, mp, state, ctx } from '../state.js';
import { getActiveMapMeta } from '../world.js';
import { probeMpServerPing, updatePingUI, updateTransportBadgeUI } from '../net.js';
import { MODAL_IDS, getVisibleModalId, uiState } from './shared.js';
import { unlockPointer } from './pointer_lock.js';

export function showOnlyModal(modalId) {
  const prevVisible = getVisibleModalId();
  if (modalId !== 'options-modal') {
    ctx.api.cancelControlRebind?.();
  }
  MODAL_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden', id !== modalId);
  });
  const nextVisible = getVisibleModalId();
  if (nextVisible !== prevVisible) {
    ctx.api.playSfx?.(nextVisible ? 'ui_modal_open' : 'ui_modal_close');
  }
  if (modalId) {
    uiState.pendingPointerLockOnEscapeKeyup = false;
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
    const aiMeta = AI_DIFFICULTIES[state.aiDifficulty === 'hard' ? 'hard' : 'normal'];
    const aiTag = ` • ${aiMeta.icon} ${aiMeta.shortLabel}`;
    const modeLabel =
      state.mode === 'tutorial'
        ? 'Mode Tutoriel'
        : state.mode === 'practice'
        ? mp.enabled
          ? `Pratique Multijoueur${vanillaTag} • Salon ${mp.roomCode}`
          : `Mode Pratique (Solo)${vanillaTag}`
        : mp.enabled
        ? `Match Multijoueur${vanillaTag}${aiTag} • Salon ${mp.roomCode}`
        : `Match Solo vs IA${vanillaTag}${aiTag}`;
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
