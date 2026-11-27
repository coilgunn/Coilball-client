import { state, ctx } from '../state.js';
import {
  audioState,
  settings,
  musicState,
  applySettingFields,
  loadAudioSettings,
  saveAudioSettings,
  applyGainSettings
} from './shared.js';
import { unlockAudio, setMusicTrack, syncMusicState } from './sequencer.js';
import { playSfx } from './sfx.js';

export function setAudioSettings(partial = {}) {
  applySettingFields(partial);
  applyGainSettings();
  saveAudioSettings();
  syncAudioControlsUI();
}

export function toggleAudioMute() {
  setAudioSettings({ muted: !settings.muted });
  if (!settings.muted) {
    unlockAudio();
    playSfx('ui_confirm');
  }
  return settings.muted;
}

export function getAudioSettings() {
  return { ...settings };
}

export function syncAudioControlsUI() {
  if (typeof document === 'undefined') return;
  const muteBtn = document.getElementById('btn-audio-mute');
  if (muteBtn) {
    muteBtn.textContent = settings.muted ? '🔇 Son : COUPÉ' : '🔊 Son : ACTIVÉ';
    muteBtn.classList.toggle('active-mode-pill', !settings.muted);
  }

  const sliders = [
    ['input-audio-master', 'audio-master-val', settings.masterVolume],
    ['input-audio-music', 'audio-music-val', settings.musicVolume],
    ['input-audio-sfx', 'audio-sfx-val', settings.sfxVolume],
    ['input-audio-ui', 'audio-ui-val', settings.uiVolume]
  ];
  sliders.forEach(([inputId, valId, val]) => {
    const pct = Math.round(val * 100);
    const inputEl = document.getElementById(inputId);
    const valEl = document.getElementById(valId);
    if (inputEl) inputEl.value = String(pct);
    if (valEl) valEl.textContent = `${pct}%`;
  });
}

function bindAudioControlsUI() {
  if (typeof document === 'undefined') return;

  const muteBtn = document.getElementById('btn-audio-mute');
  if (muteBtn) {
    muteBtn.onclick = () => {
      muteBtn.blur();
      toggleAudioMute();
    };
  }

  const testBtn = document.getElementById('btn-audio-test');
  if (testBtn) {
    testBtn.onclick = () => {
      testBtn.blur();
      unlockAudio();
      playSfx('goal_ally');
    };
  }

  const bindSlider = (inputId, settingKey, previewSfx) => {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.oninput = () => {
      unlockAudio();
      const pct = Math.max(0, Math.min(100, Number(el.value) || 0));
      setAudioSettings({ [settingKey]: pct / 100, muted: pct > 0 ? false : settings.muted });
    };
    el.onchange = () => {
      if (previewSfx) playSfx(previewSfx);
    };
  };

  bindSlider('input-audio-master', 'masterVolume', 'ui_confirm');
  bindSlider('input-audio-music', 'musicVolume', null);
  bindSlider('input-audio-sfx', 'sfxVolume', 'ball_pickup');
  bindSlider('input-audio-ui', 'uiVolume', 'ui_click');

  syncAudioControlsUI();
}

function attachDelegatedUISounds() {
  if (typeof document === 'undefined') return;

  ['pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, unlockAudio, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    musicState.tabHidden = !!document.hidden;
    applyGainSettings();
  });

  let lastHovered = null;
  document.addEventListener(
    'pointerover',
    (e) => {
      if (state.mobileMode || e.pointerType === 'touch') return;
      const el = e.target?.closest?.('button:not(:disabled), .player-row');
      if (!el || el === lastHovered) return;
      lastHovered = el;
      if (el.closest('#mobile-touch-controls')) return;
      playSfx('ui_hover');
    },
    { passive: true }
  );

  document.addEventListener('click', (e) => {
    const el = e.target?.closest?.('button, .player-row, select');
    if (!el || el.closest('#mobile-touch-controls')) return;
    unlockAudio();

    if (el.disabled) {
      playSfx('ui_error');
      return;
    }
    if (
      el.classList.contains('color-pick-btn') ||
      el.classList.contains('shop-role-btn') ||
      el.classList.contains('player-row') ||
      el.id === 'btn-audio-mute' ||
      el.id === 'btn-audio-test'
    ) {
      return;
    }

    if (el.hasAttribute('data-welcome-tab') || el.hasAttribute('data-prep-tab') || el.id.startsWith('btn-hud-tab-')) {
      playSfx('ui_tab');
    } else if (
      el.classList.contains('primary') ||
      el.id === 'btn-confirm-prep' ||
      el.id === 'btn-arena-launch' ||
      el.id === 'btn-mp-start' ||
      el.id === 'btn-next-round' ||
      el.id === 'btn-pause-resume'
    ) {
      playSfx('ui_confirm');
    } else if (
      el.id.includes('back') ||
      el.id.includes('cancel') ||
      el.id.includes('leave') ||
      el.id.includes('close')
    ) {
      playSfx('ui_cancel');
    } else {
      playSfx('ui_click');
    }
  });
}

export function initAudio() {
  if (audioState.initialized) return;
  audioState.initialized = true;
  loadAudioSettings();
  attachDelegatedUISounds();
  bindAudioControlsUI();

  ctx.api.playSfx = playSfx;
  ctx.api.setMusicTrack = setMusicTrack;
  ctx.api.syncMusicState = syncMusicState;
  ctx.api.setAudioSettings = setAudioSettings;
  ctx.api.toggleAudioMute = toggleAudioMute;
  ctx.api.getAudioSettings = getAudioSettings;
  ctx.api.syncAudioControlsUI = syncAudioControlsUI;
}
