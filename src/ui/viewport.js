import { state } from '../state.js';
import { camera, renderer } from '../render3d.js';
import {
  uiState,
  formatActionBindingText,
  getViewportSize,
  isMenuOpen
} from './shared.js';
import { showToast } from './toast.js';
import { lockPointerIfPlaying } from './pointer_lock.js';
import { resetMobileInput } from './mobile_aim.js';

export function updateMobilePortraitHintUI(wArg = null, hArg = null) {
  const el = document.getElementById('mobile-portrait-hint');
  if (!el) return;
  const dims =
    typeof wArg === 'number' && typeof hArg === 'number' && wArg > 0 && hArg > 0
      ? { w: wArg, h: hArg }
      : getViewportSize();
  const showHint = !!(state.mobileMode && !uiState.portraitHintDismissed && dims.h > dims.w);
  el.classList.toggle('hidden', !showHint);
}

export function syncViewportSize() {
  const { w, h } = getViewportSize();
  uiState.lastViewportW = w;
  uiState.lastViewportH = h;
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

export function scheduleViewportSync(withReset = false) {
  if (withReset) {
    resetMobileInput();
    try {
      window.scrollTo(0, 0);
    } catch (_) { /* ignore */ }
  }
  while (uiState.viewportSyncTimers.length > 0) {
    clearTimeout(uiState.viewportSyncTimers.pop());
  }
  syncViewportSize();
  [80, 220, 500].forEach((ms) => {
    uiState.viewportSyncTimers.push(
      setTimeout(() => {
        if (withReset && state.mobileMode) {
          try {
            window.scrollTo(0, 0);
          } catch (_) { /* ignore */ }
        }
        syncViewportSize();
      }, ms)
    );
  });
}

export function syncViewportIfResized() {
  const { w, h } = getViewportSize();
  if (w !== uiState.lastViewportW || h !== uiState.lastViewportH) {
    syncViewportSize();
  }
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
    } catch (_) { /* ignore */ }
  }
}

function finalizeFullscreenToggle(lockLandscape) {
  if (lockLandscape) tryLockLandscapeOrientation();
  scheduleViewportSync(true);
  updateFullscreenButtonsUI();
  if (!isMenuOpen()) lockPointerIfPlaying();
}

function enterFullscreen(docEl) {
  const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
  if (!req) {
    tryLockLandscapeOrientation();
    scheduleViewportSync(true);
    showToast(
      '📱 <strong>iPhone / iOS :</strong> tournez l’appareil en <strong>paysage</strong> (désactivez le verrouillage portrait) ou utilisez <strong>Partager → Sur l’écran d’accueil</strong> pour le plein écran.',
      4800,
      true
    );
    return;
  }
  try {
    const p = req.call(docEl);
    if (p && typeof p.then === 'function') {
      p.then(() => finalizeFullscreenToggle(true)).catch(() => {
        showToast('⚠️ <strong>Plein écran refusé</strong> par le navigateur.', 2500);
      });
    } else {
      finalizeFullscreenToggle(true);
    }
  } catch (_) {
    showToast('⚠️ <strong>Plein écran indisponible</strong> dans ce navigateur.', 2500);
  }
}

function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (!exit) return;
  try {
    const p = exit.call(document);
    if (p && typeof p.then === 'function') {
      p.then(() => finalizeFullscreenToggle(false)).catch(() => {});
    } else {
      finalizeFullscreenToggle(false);
    }
  } catch (_) { /* ignore */ }
}

export function toggleFullscreen() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (isFs) {
    exitFullscreen();
  } else {
    enterFullscreen(document.documentElement);
  }
}

export function onFullscreenChange() {
  uiState.fullscreenUnlockGraceUntil = performance.now() + 450;
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
  if (!isMenuOpen() && !uiState.escapeKeyHeld && !uiState.pendingPointerLockOnEscapeKeyup) {
    lockPointerIfPlaying();
    setTimeout(() => {
      if (!isMenuOpen() && !uiState.escapeKeyHeld && !uiState.pendingPointerLockOnEscapeKeyup) {
        lockPointerIfPlaying();
      }
    }, 150);
  }
}
