import {
  COLOR_KEYS,
  createEmptyRolePowers,
  createDefaultTeamMeta,
  state,
  mp,
  ctx
} from '../state.js';
import {
  players,
  getPlayer,
  applyPlayerColor,
  syncPlayerPowerVisuals
} from '../render3d.js';
import { MONTREAL_MAPS } from '../world.js';
import {
  clearAllUltimates,
  updateUltHudWidget
} from '../ultimates.js';
import { closeMultiplayerSession } from '../net.js';
import {
  updateMobileTouchHUD,
  clearInputKeys,
  updateMapLockUI,
  selectArenaMap,
  updateTopHUD,
  updateRosterHUD,
  renderMinimap
} from '../ui.js';
import {
  modesState,
  clearTutorialTimers,
  clearPrepInterval,
  hideElementsById,
  resetPlayerDashAndUltState,
  applyRoundSetupPositions,
  syncTutorialEntityVisibility
} from './shared.js';
import { renderPrepColorPickers, renderShopItems } from './shop_ui.js';
import {
  dismissTutorialIntro,
  updateTutorialSequenceHUD
} from './tutorial_hud.js';
import {
  completeTutorialToPractice,
  advanceTutorialStep
} from './tutorial_flow.js';
import { setTutorialShopGuideStep } from './tutorial_steps.js';
import { setupRoundPrep } from './prep.js';

export function initModes() {
  ctx.api.dismissTutorialIntro = dismissTutorialIntro;
  ctx.api.completeTutorialToPractice = completeTutorialToPractice;
  ctx.api.advanceTutorialStep = advanceTutorialStep;
  ctx.api.updateTutorialSequenceHUD = updateTutorialSequenceHUD;
  ctx.api.setTutorialShopGuideStep = setTutorialShopGuideStep;
}

function restoreMapFromTutorialIfNeeded() {
  if (state.mapId !== 'tutorial' && !state.restoreMapAfterTutorial) return;
  const restoreId =
    state.preTutorialMapId && MONTREAL_MAPS[state.preTutorialMapId] && state.preTutorialMapId !== 'tutorial'
      ? state.preTutorialMapId
      : 'classic';
  state.restoreMapAfterTutorial = false;
  selectArenaMap(restoreId, false, { force: true });
}

function resetMatchDOMToMenu() {
  document.body.classList.remove('mode-tutorial', 'mode-practice', 'game-paused', 'play-cursor-hidden');
  hideElementsById([
    'practice-menu-bar',
    'tutorial-sequence-hud',
    'tutorial-intro-overlay',
    'tut-overhead-objective',
    'ult-hud-widget',
    'rule1-alert',
    'pause-practice-strip'
  ]);
  const controlsHelp = document.getElementById('controls-help');
  if (controlsHelp) controlsHelp.classList.add('collapsed-submenu');
  const endRoundBtn = document.getElementById('btn-end-round');
  if (endRoundBtn) endRoundBtn.classList.remove('hidden');
}

export function resetMatchStateToMenu() {
  clearTutorialTimers();
  clearPrepInterval();
  restoreMapFromTutorialIfNeeded();

  clearInputKeys();
  clearAllUltimates();
  ctx.api.clearAllDeployedTools?.();
  ctx.api.clearAllSlidePatches?.();
  if (modesState.tutorialBeaconGroup) modesState.tutorialBeaconGroup.visible = false;

  modesState.pendingTutorialIntro = false;
  state.phase = 'menu';
  state.mode = 'pedagogical';
  state.vanillaMode = false;
  state.mobaCamLocked = false;
  state.myTeam = 'ally';
  state.myLockedRole = null;
  state.controlledRole = 'G';
  state.tutorialStep = 1;
  state.tutorialChecklist = {};
  state.tutorialAwaitingConfirm = false;
  state.tutorialPreserveStep = false;
  state.tutorialIntroVisible = false;
  setTutorialShopGuideStep(0);
  state.restoreMapAfterTutorial = false;
  state.practiceShopPreservePlay = false;
  state.practiceCursorFree = false;
  state.ultPreviewActive = false;
  state.mobaMoveTarget = null;
  if (Array.isArray(state.mobaPath)) state.mobaPath = [];
  state.mobaPathIndex = 0;
  state.mobaPathGoal = null;
  if (state.passCharge) {
    state.passCharge.active = false;
    state.passCharge.targetRole = null;
  }

  resetMatchDOMToMenu();
  syncTutorialEntityVisibility();
  applyRoundSetupPositions();
  ctx.api.updateTransportBadgeUI?.();
  updateMapLockUI();
  updateTopHUD();
  updateRosterHUD();
  renderMinimap();
}

export function resetTeamPurchasedPowers(targetTeam = null) {
  const teamKeys =
    targetTeam === 'ally' || targetTeam === 'enemy' ? [targetTeam] : ['ally', 'enemy'];

  teamKeys.forEach((tKey) => {
    const meta = state.teams[tKey];
    if (!meta) return;

    meta.powers = {
      G: createEmptyRolePowers(state.vanillaMode),
      C: createEmptyRolePowers(state.vanillaMode),
      D: createEmptyRolePowers(state.vanillaMode)
    };
    meta.extraDossardBought = { green: false, red: false, blue: false };
    meta.dossardStock = { green: 1, red: 1, blue: 1 };
    meta.hasNotebook = true;
    meta.teamDashPlus = false;
    meta.teamJump = false;
    meta.pauseUsedThisRound = false;
    meta.activeBountyPE = false;
    meta.activeBountyPV = false;

    const curCols = ['G', 'C', 'D'].map((r) => meta.prepColors && meta.prepColors[r]);
    if (new Set(curCols).size < 3 || curCols.some((c) => !COLOR_KEYS.includes(c))) {
      meta.prepColors =
        tKey === 'ally'
          ? { G: 'blue', C: 'green', D: 'red' }
          : { G: 'red', C: 'green', D: 'blue' };
    }

    ['G', 'C', 'D'].forEach((role) => {
      const p = getPlayer(tKey, role);
      if (p) applyPlayerColor(p, meta.prepColors[role]);
    });

    if (tKey === state.myTeam) {
      const nbBadge = document.getElementById('notebook-badge');
      if (nbBadge) nbBadge.textContent = '👁️ 0/3 repérés';
    }
  });

  clearAllUltimates();
  ctx.api.clearAllDeployedTools?.();
  ctx.api.clearAllSlidePatches?.();
  state.ultPreviewActive = false;

  players.forEach((p) => {
    if (!teamKeys.includes(p.team)) return;
    resetPlayerDashAndUltState(p);
    syncPlayerPowerVisuals(p, 0);
  });

  const prepEl = document.getElementById('prep-modal');
  if (prepEl && !prepEl.classList.contains('hidden')) {
    renderPrepColorPickers();
    renderShopItems();
  }
  updateTopHUD();
  updateRosterHUD();
  updateUltHudWidget();
  updateMobileTouchHUD();
}

function syncMapForNewMatch(mode) {
  if (mode === 'tutorial') {
    if (state.mapId !== 'tutorial') {
      state.preTutorialMapId = state.mapId || 'classic';
    }
    selectArenaMap('tutorial', false, { force: true });
    return;
  }
  if (state.mode === 'tutorial' && state.mapId === 'tutorial') {
    const restoreId =
      state.preTutorialMapId && MONTREAL_MAPS[state.preTutorialMapId] && state.preTutorialMapId !== 'tutorial'
        ? state.preTutorialMapId
        : 'classic';
    selectArenaMap(restoreId, false, { force: true });
  }
}

export function startNewMatch(mode, options = {}) {
  clearTutorialTimers();
  document.body.classList.remove('game-paused');
  hideElementsById(['tutorial-intro-overlay', 'pause-practice-strip']);

  const keepMp = !!(options && options.keepMp && mp.enabled);
  if (mode !== 'multiplayer' && !keepMp) {
    closeMultiplayerSession(true);
    state.myTeam = 'ally';
    state.myLockedRole = null;
  }

  syncMapForNewMatch(mode);

  const isVanilla = mode === 'tutorial' ? false : Boolean(options && options.vanillaMode);
  if (options && (options.aiDifficulty === 'hard' || options.aiDifficulty === 'normal')) {
    state.aiDifficulty = options.aiDifficulty;
  }
  ctx.api.resetAITacticalMemory?.();
  modesState.pendingTutorialIntro = mode === 'tutorial';
  state.mode = mode;
  state.vanillaMode = isVanilla;
  state.mobaCamLocked = false;
  state.round = 1;
  state.allyPV = 0;
  state.allyPE = 0;
  state.enemyPV = 0;
  state.enemyPE = 0;
  state.tutorialStep = 1;
  state.tutorialChecklist = {};
  state.tutorialAwaitingConfirm = false;
  state.tutorialPreserveStep = false;
  state.tutorialIntroVisible = false;
  setTutorialShopGuideStep(0);
  state.restoreMapAfterTutorial = false;
  state.practiceShopPreservePlay = false;
  state.practiceCursorFree = false;
  state.prepShopTargetRole = state.myLockedRole || 'G';
  state.teams = createDefaultTeamMeta(isVanilla);

  document.body.classList.toggle('mode-practice', mode === 'practice');
  document.body.classList.toggle('mode-tutorial', mode === 'tutorial');
  hideElementsById(['practice-menu-bar', 'tutorial-sequence-hud']);
  const nbBadge = document.getElementById('notebook-badge');
  if (nbBadge) nbBadge.textContent = '👁️ 0/3 repérés';

  updateMapLockUI();
  updateTopHUD();
  setupRoundPrep();
}
