import {
  COLORS,
  TUTORIAL_TOTAL_STEPS,
  TUTORIAL_STEPS,
  DEFAULT_FIELD_CONFIG,
  FIELD,
  state,
  mp,
  ctx
} from '../state.js';
import {
  players,
  balls,
  getPlayer,
  applyPlayerColor,
  spawnParticles,
  syncPlayerPowerVisuals
} from '../render3d.js';
import {
  getTerrainY,
  updateTeamVisionState
} from '../world.js';
import {
  clearAllUltimates,
  updateUltHudWidget,
  hideUltimatePreview
} from '../ultimates.js';
import {
  isMenuOpen,
  lockPointerIfPlaying,
  updateMobileTouchHUD,
  showOnlyModal,
  showToast,
  updateMapLockUI,
  updateTopHUD,
  updateRosterHUD,
  renderMinimap
} from '../ui.js';
import {
  modesState,
  clearTutorialTimers,
  hideElementsById,
  placePlayerAt,
  resetPlayerDashAndUltState,
  resetPlayerVisibility,
  resetBallToSpawn,
  syncTutorialEntityVisibility
} from './shared.js';
import { getTutorialStepDef } from './tutorial_defs.js';
import {
  ensureTutorialBeacon,
  updateTutorialBeaconTarget,
  updateTutorialSequenceHUD
} from './tutorial_hud.js';
import {
  enterTutorialStep,
  setTutorialShopGuideStep
} from './tutorial_steps.js';
import { startRoundExecution } from './round.js';

function resetPracticePlayersAndBalls(prevHiddenIds) {
  const customSpawns = FIELD.playerSpawns;
  const wingX = Math.round(FIELD.width * (46 / DEFAULT_FIELD_CONFIG.width));
  const centerX = Math.round(FIELD.width * (74 / DEFAULT_FIELD_CONFIG.width));
  const resetSpawnPos = (teamKey, roleKey, defaultX, defaultZ, defaultFacing) => {
    const pl = getPlayer(teamKey, roleKey);
    if (!pl) return null;
    const cs = customSpawns && customSpawns[teamKey] && customSpawns[teamKey][roleKey];
    const rx = cs ? cs.x : defaultX;
    const rz = cs ? cs.z : defaultZ;
    placePlayerAt(pl, rx, getTerrainY(rx, rz, state.mapId), rz, cs ? cs.facing : defaultFacing);
    return pl;
  };

  const enemyD = resetSpawnPos('enemy', 'D', wingX, FIELD.laneTopZ, -Math.PI / 2);
  resetSpawnPos('enemy', 'C', centerX, 0, -Math.PI / 2);
  resetSpawnPos('ally', 'C', -centerX, 0, Math.PI / 2);
  resetSpawnPos('ally', 'D', -wingX, FIELD.laneBotZ, Math.PI / 2);

  players.forEach((p) => {
    p.state = 'standing';
    p.rule1Partner = null;
    p.carryingBall = null;
    p.vel.set(0, 0, 0);
    p.vy = 0;
    p.isAirborne = false;
    p.airSource = null;
    p.isLaunching = false;
    p.launchBoostTimer = 0;
    p.dashCooldown = 0;
    p.dashTimer = 0;
    resetPlayerDashAndUltState(p);

    const teamMeta = state.teams[p.team];
    if (teamMeta && teamMeta.prepColors && teamMeta.prepColors[p.role]) {
      applyPlayerColor(p, teamMeta.prepColors[p.role]);
    }
    resetPlayerVisibility(p);
    syncPlayerPowerVisuals(p, 0);
    if (prevHiddenIds.has(p.id) || p === enemyD) {
      spawnParticles(p.pos, COLORS[p.color].hex, 14);
    }
  });

  balls.forEach((b, idx) => {
    resetBallToSpawn(b, idx, true);
    if (b.mesh && b.mesh.group) b.mesh.group.position.copy(b.pos);
    spawnParticles(b.pos, COLORS[b.color].hex, 14);
  });
}

function showPracticeTransitionToast(withCongrats) {
  if (withCongrats) {
    showToast(
      state.mobileMode
        ? '🎉 <strong>Tutoriel terminé — Mode Pratique activé !</strong> Toutes les joueuses et ballons sont actifs. Utilisez <strong>🛒 Boutique</strong> (🪙 ∞) ou <strong>⏸ Menu</strong> !'
        : '🎉 <strong>Tutoriel terminé — Mode Pratique activé !</strong> Toutes les joueuses et ballons sont prêts. <strong>[B]</strong> Magasin (🪙 ∞) • <strong>[1/2/3]</strong> Changer de perso • <strong>[Échap]</strong> Commandes Pratique & changement d’arène.',
      6000,
      true
    );
  } else {
    showToast(
      state.mobileMode
        ? '🧪 <strong>Mode Pratique activé !</strong> <strong>🛒 Boutique</strong> (🪙 ∞) • <strong>⏸ Menu</strong> pour changer d’arène.'
        : '🧪 <strong>Mode Pratique activé !</strong> <strong>[B]</strong> Magasin (🪙 ∞) • <strong>[Échap]</strong> Commandes Pratique & changement d’arène.',
      4500,
      true
    );
  }
}

export function completeTutorialToPractice(withCongrats = true) {
  clearTutorialTimers();
  modesState.pendingTutorialIntro = false;
  setTutorialShopGuideStep(0);
  if (modesState.tutorialBeaconGroup) modesState.tutorialBeaconGroup.visible = false;

  hideElementsById([
    'tutorial-sequence-hud',
    'tut-overhead-objective',
    'tutorial-intro-overlay',
    'rule1-alert',
    'practice-menu-bar',
    'btn-end-round'
  ]);
  const controlsHelp = document.getElementById('controls-help');
  if (controlsHelp) controlsHelp.classList.add('collapsed-submenu');
  const swapTeamBtn = document.getElementById('btn-practice-swap-team');
  if (swapTeamBtn) swapTeamBtn.style.display = mp.enabled ? 'none' : '';

  document.body.classList.remove('mode-tutorial', 'game-paused');
  document.body.classList.add('mode-practice');

  const prevHiddenIds = new Set(players.filter((p) => p.tutorialHidden).map((p) => p.id));
  state.mode = 'practice';
  state.phase = 'play';
  state.myLockedRole = null;
  state.tutorialAwaitingConfirm = false;
  state.tutorialPreserveStep = false;
  state.practiceShopPreservePlay = false;
  state.practiceCursorFree = false;
  state.restoreMapAfterTutorial = true;
  state.tutorialIntroVisible = false;
  state.ultPreviewActive = false;
  hideUltimatePreview();

  state.allyPV = 0;
  state.enemyPV = 0;
  state.roundAllyGoals = 0;
  state.roundEnemyGoals = 0;
  state.roundAllyKills = 0;
  state.roundEnemyKills = 0;
  state.mobaMoveTarget = null;
  if (Array.isArray(state.mobaPath)) state.mobaPath = [];
  state.mobaPathIndex = 0;
  state.mobaPathGoal = null;
  if (state.passCharge) {
    state.passCharge.active = false;
    state.passCharge.targetRole = null;
  }

  clearAllUltimates();
  ctx.api.clearAllDeployedTools?.();
  ctx.api.clearAllSlidePatches?.();
  syncTutorialEntityVisibility();
  resetPracticePlayersAndBalls(prevHiddenIds);

  updateTeamVisionState(true);
  updateTutorialSequenceHUD();
  updateMapLockUI();
  updateTopHUD();
  updateRosterHUD();
  updateUltHudWidget();
  updateMobileTouchHUD();
  renderMinimap();
  showOnlyModal(null);
  lockPointerIfPlaying();
  showPracticeTransitionToast(withCongrats);
}

export function advanceTutorialStep() {
  if (state.mode !== 'tutorial' || state.phase !== 'play') return false;
  if (state.tutorialStep < TUTORIAL_TOTAL_STEPS) {
    enterTutorialStep(state.tutorialStep + 1);
  } else {
    completeTutorialToPractice(true);
  }
  return true;
}

export function evaluateTutorialStepCompletion() {
  if (state.mode !== 'tutorial' || state.phase !== 'play') return;
  const step = state.tutorialStep;
  const def = getTutorialStepDef(step);
  if (!def) return;
  const allDone = def.items.every((it) => !!state.tutorialChecklist[it.key]);
  if (!allDone || state.tutorialAwaitingConfirm) return;

  state.tutorialAwaitingConfirm = true;
  ctx.api.playSfx?.(step < TUTORIAL_TOTAL_STEPS ? 'tut_step_clear' : 'victory');
  if (step < TUTORIAL_TOTAL_STEPS) {
    showToast(
      state.mobileMode
        ? `✨ <strong>${def.title} validée !</strong> Appuyez sur <strong>Continuer ▶</strong> pour passer à l’étape ${step + 1}/${TUTORIAL_TOTAL_STEPS}.`
        : `✨ <strong>${def.title} validée !</strong> Appuyez sur <strong>[Espace]</strong> (ou <strong>Continuer ▶</strong>) pour passer à l’étape ${step + 1}/${TUTORIAL_TOTAL_STEPS}.`,
      8000
    );
  } else {
    showToast(
      state.mobileMode
        ? '🎉 <strong>Bravo, tutoriel terminé !</strong> Appuyez sur <strong>Mode Pratique ▶</strong> pour continuer.'
        : '🎉 <strong>Bravo, tutoriel terminé !</strong> Appuyez sur <strong>[Espace]</strong> (ou <strong>Mode Pratique ▶</strong>) pour continuer.',
      8000
    );
  }
  updateTutorialSequenceHUD();
}

function handleMovementTutorialCheck(key) {
  if (key === 'movedToBeacon') {
    showToast(
      state.mobileMode
        ? '💨 <strong>Dash débloqué !</strong> Appuyez sur <strong>💨 Dash</strong> pour faire un Dash !'
        : '💨 <strong>Dash débloqué !</strong> Appuyez sur <strong>[Shift]</strong> pour faire un Dash !',
      3000
    );
  } else if (key === 'dashed') {
    syncTutorialEntityVisibility();
    updateTeamVisionState(true);
    const allyC = getPlayer('ally', 'C');
    const allyD = getPlayer('ally', 'D');
    if (allyC && !allyC.tutorialHidden) spawnParticles(allyC.pos, COLORS[allyC.color].hex, 14);
    if (allyD && !allyD.tutorialHidden) spawnParticles(allyD.pos, COLORS[allyD.color].hex, 14);
    updateRosterHUD();
    updateMobileTouchHUD();
    const isMoba = state.cameraMode === 'aerial';
    showToast(
      state.mobileMode
        ? '👥 <strong>Coéquipières apparues !</strong> Tapez <strong>Centre (C)</strong> ou <strong>Droit (D)</strong> en bas pour changer de position !'
        : isMoba
        ? '👥 <strong>Coéquipières apparues !</strong> Utilisez <strong>[2]</strong> (Centre C) ou <strong>[3]</strong> (Droit D) — sans clic en mode MOBA !'
        : '👥 <strong>Coéquipières apparues !</strong> Changez de position : <strong>[2] Centre (C)</strong> ou <strong>[3] Droit (D)</strong> (ou Clic) !',
      3400
    );
  } else if (key === 'switchedRole' && !state.tutorialChecklist.returnedToFirstRole) {
    const isMoba = state.cameraMode === 'aerial';
    showToast(
      state.mobileMode
        ? '🔄 <strong>Bien joué !</strong> Revenez maintenant sur <strong>Gauche (G 🔥)</strong> en tapant <strong>G</strong> en bas !'
        : isMoba
        ? '🔄 <strong>Bien joué !</strong> Revenez maintenant sur <strong>Gauche (G 🔥)</strong> avec <strong>[1]</strong> !'
        : '🔄 <strong>Bien joué !</strong> Revenez maintenant sur <strong>Gauche (G 🔥)</strong> avec <strong>[1]</strong> ou Clic !',
      3600
    );
  }
}

function scheduleTutorialUltEnemyRecover() {
  if (modesState.tutorialUltRecoverTimer) clearTimeout(modesState.tutorialUltRecoverTimer);
  modesState.tutorialUltRecoverTimer = setTimeout(() => {
    modesState.tutorialUltRecoverTimer = null;
    if (state.mode !== 'tutorial' || state.phase !== 'play' || state.tutorialStep !== TUTORIAL_STEPS.ULTIMATE) return;
    const enemyD = getPlayer('enemy', 'D');
    if (enemyD && enemyD.state === 'sitting') {
      enemyD.state = 'standing';
      placePlayerAt(enemyD, 10, getTerrainY(10, 0, state.mapId), 0, enemyD.facingAngle);
      enemyD.vel.set(0, 0, 0);
      spawnParticles(enemyD.pos, 0xfacc15, 12);
      updateRosterHUD();
    }
  }, 1800);
}

function handleUltTutorialCheck(key) {
  const isMob = !!state.mobileMode;
  const isMoba = state.cameraMode === 'aerial';
  const clickHint = isMoba ? '' : ' (ou Clic)';
  const waterPrompt = isMob
    ? '💧 <strong>2/3 — Ultimate Eau (Centre C) :</strong> Tapez <strong>C</strong> en bas puis maintenez <strong>⚡ Ult</strong> pour lancer la <strong>Vague Déferlante</strong> (repousse + bouclier contre le Feu) !'
    : `💧 <strong>2/3 — Ultimate Eau (Centre C) :</strong> Appuyez sur <strong>[2]</strong>${clickHint} puis <strong>[R] + Clic Gauche</strong> pour lancer la <strong>Vague Déferlante</strong> (repousse + bouclier contre le Feu) !`;
  const leafPrompt = isMob
    ? '🌿 <strong>3/3 — Ultimate Feuille (Droit D) :</strong> Tapez <strong>D</strong> en bas, lancez <strong>⚡ Ult</strong> puis courez pour tracer un <strong>mur de branches</strong> !'
    : `🌿 <strong>3/3 — Ultimate Feuille (Droit D) :</strong> Appuyez sur <strong>[3]</strong>${clickHint}, lancez <strong>[R] + Clic Gauche</strong> puis bougez pour tracer un <strong>mur de branches</strong> !`;
  const firePrompt = isMob
    ? '🔥 <strong>Ultimate Feu (Gauche G) :</strong> Tapez <strong>G</strong> en bas puis maintenez <strong>⚡ Ult</strong> vers <strong>Adv D</strong> !'
    : `🔥 <strong>Ultimate Feu (Gauche G) :</strong> Appuyez sur <strong>[1]</strong>${clickHint} puis <strong>[R] + Clic Gauche</strong> vers <strong>Adv D</strong> !`;

  if (key === 'ultFireFired') {
    scheduleTutorialUltEnemyRecover();
    if (!state.tutorialChecklist.ultWaterFired) showToast(waterPrompt, 5500);
    else if (!state.tutorialChecklist.ultLeafFired) showToast(leafPrompt, 5500);
  } else if (key === 'ultWaterFired') {
    if (!state.tutorialChecklist.ultLeafFired) showToast(leafPrompt, 5500);
    else if (!state.tutorialChecklist.ultFireFired) showToast(firePrompt, 5500);
  } else if (key === 'ultLeafFired') {
    if (!state.tutorialChecklist.ultFireFired) showToast(firePrompt, 5500);
    else if (!state.tutorialChecklist.ultWaterFired) showToast(waterPrompt, 5500);
  }
}

export function markTutorialCheck(key) {
  if (state.mode !== 'tutorial') return;
  if (state.phase !== 'play' && key !== 'toolBought') return;
  const wasAlreadyDone = !!state.tutorialChecklist[key];
  state.tutorialChecklist[key] = true;
  if (!wasAlreadyDone) ctx.api.playSfx?.('tut_check');

  if (!wasAlreadyDone && state.tutorialStep === TUTORIAL_STEPS.MOVEMENT) {
    handleMovementTutorialCheck(key);
  } else if (!wasAlreadyDone && state.tutorialStep === TUTORIAL_STEPS.TRIANGLE && key === 'backSeen' && !state.tutorialChecklist.intercepted) {
    showToast(
      '👀 <strong>Dos vu : 🌿 Feuille !</strong> Votre <strong>🔥 Feu</strong> gagne contre 🌿 Feuille : <strong>touchez-la pour l’intercepter</strong> (+1 🪙 PO) !',
      4200
    );
  } else if (!wasAlreadyDone && state.tutorialStep === TUTORIAL_STEPS.ULTIMATE) {
    handleUltTutorialCheck(key);
  }

  if (key === 'rule1Locked' && state.tutorialStep === TUTORIAL_STEPS.RULE1) {
    updateRosterHUD();
    updateMobileTouchHUD();
  }

  if (key === 'toolBought' && state.tutorialStep === TUTORIAL_STEPS.TOOLS && state.phase === 'prep') {
    setTutorialShopGuideStep(0);
    if (modesState.tutorialShopAutoReturnTimer) clearTimeout(modesState.tutorialShopAutoReturnTimer);
    showToast('✔ <strong>Outil acheté !</strong> Retour sur le terrain...', 1400);
    modesState.tutorialShopAutoReturnTimer = setTimeout(() => {
      modesState.tutorialShopAutoReturnTimer = null;
      if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.TOOLS && state.phase === 'prep') {
        startRoundExecution();
      }
    }, 650);
  }

  updateTutorialSequenceHUD();
  updateTutorialBeaconTarget();
  evaluateTutorialStepCompletion();
}

export function updateTutorialSequence(_dt) {
  if (state.mode !== 'tutorial' || state.phase !== 'play') return;
  if (state.tutorialIntroVisible) return;
  if (!mp.enabled && isMenuOpen()) return;
  const beacon = ensureTutorialBeacon();
  if (beacon.visible) {
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.09;
    beacon.scale.set(pulse, 1, pulse);
  }
  if (state.tutorialStep === TUTORIAL_STEPS.MOVEMENT && !state.tutorialChecklist.movedToBeacon) {
    const me = getPlayer('ally', state.controlledRole);
    if (me && Math.hypot(me.pos.x - (-12), me.pos.z - FIELD.laneTopZ) < 3.4) {
      markTutorialCheck('movedToBeacon');
    }
  } else if (state.tutorialStep === TUTORIAL_STEPS.TRIANGLE && !state.tutorialChecklist.backSeen) {
    const anyBack = players.some((p) => !p.tutorialHidden && p.team === 'enemy' && (p.backRevealed || p.currentlySeeingBack));
    if (anyBack) {
      markTutorialCheck('backSeen');
    }
  }
}
