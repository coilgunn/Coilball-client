import { AI_DIFFICULTIES, mp, state, ctx } from '../state.js';
import { balls, players } from '../render3d.js';
import { VISION_SPEC, applyArenaMapData, buildParkEnvironment, getActiveMapMeta, getTerrainY } from '../world.js';
import { broadcastLobbyState, updateLobbyUI } from '../net.js';
import { AI_DIFF_STORAGE_KEY, getVisibleModalId, isMapChangeLocked, uiState } from './shared.js';
import { showToast } from './toast.js';
import { updateWelcomePauseBanner } from './modals_core.js';
import { syncMinimapCanvasDimensions } from './minimap_static.js';
import { renderMinimap } from './minimap_render.js';

export function syncAIDifficultyUI() {
  const diff = state.aiDifficulty === 'hard' ? 'hard' : 'normal';
  const meta = AI_DIFFICULTIES[diff];

  const btnNorm = document.getElementById('btn-arena-ai-normal');
  const btnHard = document.getElementById('btn-arena-ai-hard');
  if (btnNorm) btnNorm.classList.toggle('active', diff === 'normal');
  if (btnHard) btnHard.classList.toggle('active', diff === 'hard');

  const arenaRow = document.getElementById('arena-ai-diff-row');
  if (arenaRow) arenaRow.classList.toggle('hidden', uiState.pendingArenaMode === 'practice');

  const arenaHint = document.getElementById('arena-ai-diff-hint');
  if (arenaHint) arenaHint.textContent = meta.desc;

  const optBtn = document.getElementById('btn-toggle-ai-difficulty');
  if (optBtn) {
    optBtn.textContent = `${meta.icon} Difficulté IA : ${meta.label}`;
    optBtn.classList.toggle('active-mode-pill', diff === 'hard');
    optBtn.disabled = !!(mp.enabled && !mp.isHost);
  }
}

export function setAIDifficulty(diff, opts = {}) {
  const next = diff === 'hard' ? 'hard' : 'normal';
  state.aiDifficulty = next;
  if (!mp.enabled || mp.isHost || opts.syncLobby) mp.lobbyAiDifficulty = next;
  if (!opts.skipSave) {
    try {
      localStorage.setItem(AI_DIFF_STORAGE_KEY, next);
    } catch (_) { /* ignore */ }
  }
  syncAIDifficultyUI();
  if (mp.enabled && mp.isHost && !opts.fromNetwork && opts.broadcast !== false && state.phase === 'menu') {
    broadcastLobbyState();
  }
  if (state.phase !== 'menu') {
    updateWelcomePauseBanner(getVisibleModalId() === 'pause-modal');
  }
  if (!opts.silent) {
    const meta = AI_DIFFICULTIES[next];
    showToast(`${meta.icon} <strong>Difficulté IA : ${meta.label}</strong> — ${meta.desc}`, 2400);
  }
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

  ['pause-practice-map-select', 'practice-map-select'].forEach((id) => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.value = state.mapId;
      sel.disabled = !!(mp.enabled && !mp.isHost);
    }
  });
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
    showToast("🔒 Seule l'Hôte peut changer d'arène en multijoueur.", 2200);
    return getActiveMapMeta();
  }

  const mapMeta = applyArenaMapData(mapId);
  state.mapId = mapMeta.id;
  VISION_SPEC.canopyRange = mapMeta.canopyVisionRange || 102;
  uiState.minimapStaticKey = '';
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
  if (state.phase !== 'menu') updateWelcomePauseBanner(getVisibleModalId() === 'pause-modal');
  if (players && players.length > 0) renderMinimap();
  if (broadcast && mp.enabled && mp.isHost && !options.fromNetwork) broadcastLobbyState();
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
  if (broadcast && mp.enabled && mp.isHost) broadcastLobbyState();
  else if (typeof updateLobbyUI === 'function') updateLobbyUI();
}

export function setMpLobbyVanilla(enabled, broadcast = true) {
  mp.lobbyVanilla = !!enabled;
  if (broadcast && mp.enabled && mp.isHost) broadcastLobbyState();
  else if (typeof updateLobbyUI === 'function') updateLobbyUI();
}

export function setMpLobbyAiDifficulty(diff, broadcast = true) {
  const next = diff === 'hard' ? 'hard' : 'normal';
  mp.lobbyAiDifficulty = next;
  state.aiDifficulty = next;
  syncAIDifficultyUI();
  if (broadcast && mp.enabled && mp.isHost) {
    try {
      localStorage.setItem(AI_DIFF_STORAGE_KEY, next);
    } catch (_) { /* ignore */ }
    broadcastLobbyState();
  } else if (typeof updateLobbyUI === 'function') {
    updateLobbyUI();
  }
}
