// ============================================================================
// COILBALL 3D — MODES DE JEU (PRÉPARATION, MAGASIN, TUTORIEL & PRATIQUE)
// ============================================================================

import {
  COLORS,
  COLOR_KEYS,
  TUTORIAL_TOTAL_STEPS,
  TUTORIAL_STEPS,
  DEFAULT_FIELD_CONFIG,
  FIELD,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_SPEED,
  DASH_EVO_META,
  TOOL_EVO_META,
  INDIVIDUAL_POWERS,
  createEmptyRolePowers,
  hasRoleEvolutionItem,
  isRoleEvolutionSlotBlocked,
  grantRolePowerItem,
  createDefaultTeamMeta,
  state,
  mp,
  getTeamPE,
  setTeamPE,
  ctx
} from './state.js';
import {
  scene,
  players,
  balls,
  getPlayer,
  applyBallColor,
  applyPlayerColor,
  spawnParticles,
  syncPlayerPowerVisuals
} from './render3d.js';
import {
  MONTREAL_MAPS,
  getTerrainY,
  updateTeamVisionState
} from './world.js';
import {
  clearAllUltimates,
  updateUltHudWidget,
  hideUltimatePreview
} from './ultimates.js';
import {
  getMemberControlledRole,
  getRoleHumanController,
  getAvailableRolesForTeam,
  resolveTeamActiveRoles,
  closeMultiplayerSession,
  sendNetMessage,
  updateLobbyUI,
  broadcastToast
} from './net.js';
import {
  isMenuOpen,
  lockPointerIfPlaying,
  unlockPointer,
  setCameraMode,
  recenterMobaCamera,
  updateMobileTouchHUD,
  showOnlyModal,
  clearInputKeys,
  selectControlledRole,
  showToast,
  updateMapLockUI,
  selectArenaMap,
  updateTopHUD,
  updateRosterHUD,
  applyPrepShopCategoryFilter,
  switchPrepSubmenu,
  renderMinimap,
  resetPointerLockFlags
} from './ui.js';

const THREE = ctx.THREE;

let pendingTutorialIntro = false;
let tutorialIntroKind = 'welcome';
let tutorialUltRecoverTimer = null;

export function initModes() {
  ctx.api.dismissTutorialIntro = dismissTutorialIntro;
  ctx.api.completeTutorialToPractice = completeTutorialToPractice;
  ctx.api.advanceTutorialStep = advanceTutorialStep;
  ctx.api.updateTutorialSequenceHUD = updateTutorialSequenceHUD;
  ctx.api.setTutorialShopGuideStep = setTutorialShopGuideStep;
}

export function resetMatchStateToMenu() {
  if (tutorialAutoAdvanceTimer) {
    clearTimeout(tutorialAutoAdvanceTimer);
    tutorialAutoAdvanceTimer = null;
  }
  if (typeof tutorialFinishTimer !== 'undefined' && tutorialFinishTimer) {
    clearTimeout(tutorialFinishTimer);
    tutorialFinishTimer = null;
  }
  if (typeof tutorialShopAutoReturnTimer !== 'undefined' && tutorialShopAutoReturnTimer) {
    clearTimeout(tutorialShopAutoReturnTimer);
    tutorialShopAutoReturnTimer = null;
  }
  if (tutorialUltRecoverTimer) {
    clearTimeout(tutorialUltRecoverTimer);
    tutorialUltRecoverTimer = null;
  }
  if (state.prepInterval) {
    clearInterval(state.prepInterval);
    state.prepInterval = null;
  }
  if (state.mapId === 'tutorial' || state.restoreMapAfterTutorial) {
    const restoreId =
      state.preTutorialMapId && MONTREAL_MAPS[state.preTutorialMapId] && state.preTutorialMapId !== 'tutorial'
        ? state.preTutorialMapId
        : 'classic';
    state.restoreMapAfterTutorial = false;
    selectArenaMap(restoreId, false, { force: true });
  }

  clearInputKeys();
  clearAllUltimates();
  ctx.api.clearAllDeployedTools?.();
  ctx.api.clearAllSlidePatches?.();
  if (tutorialBeaconGroup) tutorialBeaconGroup.visible = false;

  pendingTutorialIntro = false;
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

  document.body.classList.remove('mode-tutorial', 'mode-practice', 'game-paused', 'play-cursor-hidden');
  const practiceBar = document.getElementById('practice-menu-bar');
  if (practiceBar) practiceBar.classList.add('hidden');
  const tutHud = document.getElementById('tutorial-sequence-hud');
  if (tutHud) tutHud.classList.add('hidden');
  const tutIntro = document.getElementById('tutorial-intro-overlay');
  if (tutIntro) tutIntro.classList.add('hidden');
  const tutOh = document.getElementById('tut-overhead-objective');
  if (tutOh) tutOh.classList.add('hidden');
  const controlsHelp = document.getElementById('controls-help');
  if (controlsHelp) controlsHelp.classList.add('collapsed-submenu');
  const ultWidget = document.getElementById('ult-hud-widget');
  if (ultWidget) ultWidget.classList.add('hidden');
  const r1Alert = document.getElementById('rule1-alert');
  if (r1Alert) r1Alert.classList.add('hidden');
  const pausePracticeStrip = document.getElementById('pause-practice-strip');
  if (pausePracticeStrip) pausePracticeStrip.classList.add('hidden');
  const endRoundBtn = document.getElementById('btn-end-round');
  if (endRoundBtn) endRoundBtn.classList.remove('hidden');

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
      if (p) {
        applyPlayerColor(p, meta.prepColors[role]);
      }
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
    p.ultUsed = false;
    p.ultShotsUsed = 0;
    p.ultCooldown = 0;
    p.activeReactivableWave = null;
    p.leafUltTimer = 0;
    p.leafUltMaxDuration = 2.0;
    p.leafUltSpeedMult = 3.0;
    p.waterShieldTimer = 0;
    p.dashKind = null;
    p.dashIsSuper = false;
    p.dashSpeed = DASH_SPEED;
    p.dashMaxDuration = DASH_DURATION;
    p.dashBouncesLeft = 0;
    p.boomerangWindow = 0;
    p.boomerangOrigin = null;
    p.jumpMomentumVx = 0;
    p.jumpMomentumVz = 0;
    p.dashMomentumGrace = 0;
    p.lastDashVx = 0;
    p.lastDashVz = 0;
    p.toolCooldown = 0;
    p.jumpCooldown = 0;
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

export function executePracticeAction(action, payload = {}, fromNetwork = false) {
  if (state.mode !== 'practice') return false;

  if (action === 'refresh_ult') {
    clearAllUltimates();
    players.forEach((p) => {
      p.ultUsed = false;
      p.ultShotsUsed = 0;
      p.ultCooldown = 0;
      p.dashCooldown = 0;
      p.dashTimer = 0;
      p.toolCooldown = 0;
      p.jumpCooldown = 0;
      syncPlayerPowerVisuals(p, 0);
    });
    state.ultPreviewActive = false;
    hideUltimatePreview();
    updateRosterHUD();
    updateUltHudWidget();
    const msg = '⚡ <strong>Ultimates et Dashs rechargés</strong> pour toutes les joueuses !';
    if (mp.enabled && mp.isHost && !fromNetwork) broadcastToast(msg, 2400);
    else showToast(msg, 2400);
    return true;
  }

  if (action === 'standup_all') {
    players.forEach((p) => {
      if (p.rule1Partner) ctx.api.freeFromRule1(p);
      if (p.state === 'sitting' || p.state === 'rule1') {
        p.state = 'standing';
        p.rule1Partner = null;
        p.vel.set(0, 0, 0);
        spawnParticles(p.pos, 0xfacc15, 10);
      }
    });
    const r1Alert = document.getElementById('rule1-alert');
    if (r1Alert) r1Alert.classList.add('hidden');
    updateRosterHUD();
    const msg = '⬆️ <strong>Toutes les joueuses ont été relevées !</strong>';
    if (mp.enabled && mp.isHost && !fromNetwork) broadcastToast(msg, 2200);
    else showToast(msg, 2200);
    return true;
  }

  if (action === 'change_map' && payload && payload.mapId) {
    const meta = selectArenaMap(payload.mapId, false, { force: true, fromNetwork: true });
    const msg = `🗺️ <strong>Arène changée en cours de pratique :</strong> ${meta.icon} ${meta.name}`;
    if (mp.enabled && mp.isHost && !fromNetwork) broadcastToast(msg, 2600);
    else showToast(msg, 2600);
    return true;
  }

  if (action === 'reset_pos') {
    applyRoundSetupPositions();
    updateTopHUD();
    updateRosterHUD();
    updateUltHudWidget();
    const msg = '🔄 <strong>Positions et ballons réinitialisés</strong> au centre !';
    if (mp.enabled && mp.isHost && !fromNetwork) broadcastToast(msg, 2200);
    else showToast(msg, 2200);
    return true;
  }

  if (action === 'swap_team' && !mp.enabled) {
    state.myTeam = state.myTeam === 'ally' ? 'enemy' : 'ally';
    state.myLockedRole = null;
    const ctrlP = getPlayer(state.myTeam, state.controlledRole);
    state.camYaw =
      state.mapId === 'rift' && ctrlP
        ? ctrlP.facingAngle + Math.PI
        : state.myTeam === 'ally'
        ? -Math.PI / 2
        : Math.PI / 2;
    players.forEach((p) => {
      p.backRevealed = p.team === state.myTeam;
      p.currentlySeeingBack = p.team === state.myTeam;
      p.teamSeeingBack = { ally: p.team === 'ally', enemy: p.team === 'enemy' };
    });
    updateTeamVisionState();
    recenterMobaCamera(true);
    updateTopHUD();
    updateRosterHUD();
    const teamLabel = state.myTeam === 'ally' ? 'Équipe Or' : 'Équipe Violette';
    showToast(`⇄ <strong>Camp basculé :</strong> vous contrôlez maintenant <strong>${teamLabel}</strong> !`, 2200);
    return true;
  }

  if (action === 'reset_powers') {
    const targetTeam = mp.enabled
      ? payload && ['ally', 'enemy'].includes(payload.team)
        ? payload.team
        : state.myTeam
      : null;
    resetTeamPurchasedPowers(targetTeam);
    const msg =
      '🧹 <strong>Pouvoirs achetés réinitialisés</strong> (évolutions, outils, dossards et bonus remis à zéro) !';
    if (mp.enabled && mp.isHost && !fromNetwork) broadcastToast(msg, 2600);
    else showToast(msg, 2600);
    return true;
  }

  return false;
}

export function requestPracticeAction(action, payload = {}) {
  if (state.mode !== 'practice') return false;
  const finalPayload =
    action === 'reset_powers' ? { team: state.myTeam, ...(payload || {}) } : payload;
  if (mp.enabled) {
    if (mp.isHost) {
      const ok = executePracticeAction(action, finalPayload, false);
      if (ok) {
        sendNetMessage({ type: 'MP_PRACTICE_ACTION', action, payload: finalPayload });
        if (state.phase === 'play') ctx.api.broadcastWorldState();
      }
      return ok;
    }
    sendNetMessage({ type: 'MP_PRACTICE_ACTION', peerId: mp.myPeerId, action, payload: finalPayload });
    return true;
  }
  return executePracticeAction(action, finalPayload, false);
}

// --- PRÉPARATION DE LA RONDE (TIRAGE DES BALLES, TRIANGLE ÉQUILATÉRAL) ---
export function applyRoundSetupPositions() {
  balls.forEach((b, idx) => {
    b.state = 'ground';
    b.carrier = null;
    b.thrownByTeam = null;
    b.thrownById = null;
    b.passTargetId = null;
    b.passIgnoreTimer = 0;
    b.onCanopy = false;
    const customSpawn = Array.isArray(FIELD.ballSpawns) && FIELD.ballSpawns[idx];
    const spawnX = customSpawn ? customSpawn.x : 0;
    const spawnZ = customSpawn ? customSpawn.z : (idx === 0 ? FIELD.laneTopZ : FIELD.laneBotZ);
    b.pos.set(spawnX, 0.52, spawnZ);
    b.targetPos.copy(b.pos);
    b.vel.set(0, 0, 0);
    applyBallColor(b, state.drawnBalls[idx]);
  });

  const customSpawns = FIELD.playerSpawns;
  const wingX = Math.round(FIELD.width * (46 / DEFAULT_FIELD_CONFIG.width));
  const centerX = Math.round(FIELD.width * (74 / DEFAULT_FIELD_CONFIG.width));
  const allyPos = {
    G: customSpawns ? new THREE.Vector3(customSpawns.ally.G.x, 0, customSpawns.ally.G.z) : new THREE.Vector3(-wingX, 0, FIELD.laneTopZ),
    D: customSpawns ? new THREE.Vector3(customSpawns.ally.D.x, 0, customSpawns.ally.D.z) : new THREE.Vector3(-wingX, 0, FIELD.laneBotZ),
    C: customSpawns ? new THREE.Vector3(customSpawns.ally.C.x, 0, customSpawns.ally.C.z) : new THREE.Vector3(-centerX, 0, 0)
  };
  const enemyPos = {
    D: customSpawns ? new THREE.Vector3(customSpawns.enemy.D.x, 0, customSpawns.enemy.D.z) : new THREE.Vector3(wingX, 0, FIELD.laneTopZ),
    G: customSpawns ? new THREE.Vector3(customSpawns.enemy.G.x, 0, customSpawns.enemy.G.z) : new THREE.Vector3(wingX, 0, FIELD.laneBotZ),
    C: customSpawns ? new THREE.Vector3(customSpawns.enemy.C.x, 0, customSpawns.enemy.C.z) : new THREE.Vector3(centerX, 0, 0)
  };

  players.forEach((p) => {
    p.state = 'standing';
    p.rule1Partner = null;
    p.carryingBall = null;
    p.vel.set(0, 0, 0);
    p.vy = 0;
    p.onCanopy = false;
    p.isAirborne = false;
    p.airSource = null;
    p.isLaunching = false;
    p.jumpCooldown = 0;
    p.launchVz = 0;
    p.launchBoostTimer = 0;
    p.dashTimer = 0;
    p.dashCooldown = 0;
    p.dashCooldownMax = DASH_COOLDOWN;
    p.dashIsSuper = false;
    p.dashKind = null;
    p.dashSpeed = DASH_SPEED;
    p.dashMaxDuration = DASH_DURATION;
    p.dashBouncesLeft = 0;
    p.boomerangWindow = 0;
    p.boomerangOrigin = null;
    p.jumpMomentumVx = 0;
    p.jumpMomentumVz = 0;
    p.dashMomentumGrace = 0;
    p.lastDashVx = 0;
    p.lastDashVz = 0;
    p.slidePatchDist = 0;
    p.slideGlideTimer = 0;
    p.slideGlideVx = 0;
    p.slideGlideVz = 0;
    p.onSlidePatch = false;
    p.iceSlideDirX = 0;
    p.iceSlideDirZ = 0;
    p.iceSlideSpeed = 0;
    p.isSlidingNet = false;
    p.padBoostTimer = 0;
    p.padDirX = 0;
    p.padDirZ = 0;
    p.toolCooldown = 0;
    p.dashDirX = 0;
    p.dashDirZ = 0;
    p.ultUsed = false;
    p.ultShotsUsed = 0;
    p.ultCooldown = 0;
    p.activeReactivableWave = null;
    p.leafUltTimer = 0;
    p.leafUltMaxDuration = 2.0;
    p.leafUltSpeedMult = 3.0;
    p.waterShieldTimer = 0;
    if (p.team === 'ally') {
      p.pos.copy(allyPos[p.role]);
      p.targetPos.copy(p.pos);
      p.facingAngle = customSpawns ? customSpawns.ally[p.role].facing : Math.PI / 2;
      p.targetFacingAngle = p.facingAngle;
    } else {
      p.pos.copy(enemyPos[p.role]);
      p.targetPos.copy(p.pos);
      p.facingAngle = customSpawns ? customSpawns.enemy[p.role].facing : -Math.PI / 2;
      p.targetFacingAngle = p.facingAngle;
    }
    // On ne connaît au départ que les dos de sa propre équipe !
    p.revealedTo = {
      ally: p.team === 'ally',
      enemy: p.team === 'enemy'
    };
    p.visibleTo = {
      ally: p.team === 'ally',
      enemy: p.team === 'enemy'
    };
    p.backRevealed = p.team === state.myTeam;
    p.currentlySeeingBack = p.team === state.myTeam;
  });
  state.ultPreviewActive = false;
  state.roundPlayTime = 0;
  clearAllUltimates();
  ctx.api.clearAllDeployedTools();
  ctx.api.clearAllSlidePatches();
  syncTutorialEntityVisibility();
  updateTeamVisionState(true);
  recenterMobaCamera(true);
}

export function maybeStartRoundFromPrep() {
  if (!mp.enabled || !mp.isHost || state.phase !== 'prep') return;
  const allMembersReady =
    mp.members.length > 0
      ? mp.members.every((m) => !!m.prepReady)
      : !!(state.teams.ally.prepReady && state.teams.enemy.prepReady);
  if (allMembersReady) {
    startRoundExecution();
  }
}

export function updatePrepConfirmButtonUI() {
  const confirmBtn = document.getElementById('btn-confirm-prep');
  if (!confirmBtn) return;
  if (state.mode === 'practice' && state.practiceShopPreservePlay) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = '✅ Retourner en Pratique (Tester vos achats)';
    return;
  }
  if (!mp.enabled) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = '✅ Au jeu ! (Lancer la ronde)';
    return;
  }
  const me = mp.members.find((m) => m.peerId === mp.myPeerId);
  const iAmReady = me ? !!me.prepReady : !!state.teams[state.myTeam].prepReady;
  const readyCount = mp.members.filter((m) => !!m.prepReady).length;
  const total = Math.max(1, mp.members.length);
  confirmBtn.disabled = iAmReady;
  confirmBtn.textContent = iAmReady
    ? `⏳ Prêt ! En attente (${readyCount}/${total} joueur·se·s)...`
    : `✅ Prêt ! (${readyCount}/${total} prêt·e·s)`;
}

export function isShopAvailable() {
  return state.round >= 3 || state.mode === 'practice' || (state.mode === 'tutorial' && state.tutorialStep >= TUTORIAL_STEPS.TOOLS);
}

export function setupRoundPrep() {
  state.phase = 'prep';
  state.roundAllyGoals = 0;
  state.roundEnemyGoals = 0;
  state.roundAllyKills = 0;
  state.roundEnemyKills = 0;

  state.teams.ally.pauseUsedThisRound = false;
  state.teams.enemy.pauseUsedThisRound = false;
  state.teams.ally.prepReady = false;
  state.teams.enemy.prepReady = false;
  mp.members.forEach((m) => {
    m.prepReady = false;
  });

  if (state.mode === 'tutorial') {
    state.drawnBalls = ['red', 'green'];
    state.teams.ally.prepColors = { G: 'red', C: 'blue', D: 'green' };
    state.teams.enemy.prepColors = { D: 'green', G: 'blue', C: 'red' };
  } else {
    const bag = ['green', 'red', 'blue'];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    state.drawnBalls = [bag[0], bag[1]];

    // Si l'équipe Violette n'a aucun joueur humain, lui tirer des couleurs aléatoires + achats tactiques IA (Ronde 3+)
    const enemyHasHuman =
      mp.enabled && mp.members.some((m) => m.team === 'enemy');
    if (!enemyHasHuman) {
      const eBag = ['green', 'red', 'blue'];
      for (let i = eBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [eBag[i], eBag[j]] = [eBag[j], eBag[i]];
      }
      state.teams.enemy.prepColors = { G: eBag[0], C: eBag[1], D: eBag[2] };
      state.teams.enemy.prepReady = true;
      if (state.mode === 'pedagogical' && isShopAvailable()) {
        runEnemyAIShopPurchases();
      }
    }

    const allyHasHuman =
      !mp.enabled || mp.members.some((m) => m.team === 'ally');
    if (!allyHasHuman) {
      state.teams.ally.prepReady = true;
    }
  }

  applyRoundSetupPositions();

  if (mp.enabled && mp.isHost) {
    resolveTeamActiveRoles('ally');
    resolveTeamActiveRoles('enemy');
    sendNetMessage({
      type: 'MP_START_MATCH',
      gameMode: state.mode,
      vanillaMode: !!state.vanillaMode,
      mapId: state.mapId,
      round: state.round,
      allyPV: state.allyPV,
      allyPE: state.allyPE,
      enemyPV: state.enemyPV,
      enemyPE: state.enemyPE,
      teams: state.teams,
      drawnBalls: state.drawnBalls,
      members: mp.members
    });
  }

  if (state.mode === 'tutorial' || (state.mode === 'practice' && !mp.enabled)) {
    startRoundExecution();
    return;
  }

  openPrepModal();
}

// --- INTERFACE DE PHASE PRÉPARATOIRE & MAGASIN ---
export function openPracticeShop() {
  if (state.mode !== 'practice' || state.phase === 'menu') return;
  state.practiceShopPreservePlay = state.phase === 'play';
  clearInputKeys();
  unlockPointer();
  document.body.classList.remove('game-paused');
  openPrepModal({
    preservePhase: state.practiceShopPreservePlay,
    defaultTab: 'individual'
  });
}

export function closePracticeShopAndReturn() {
  if (state.mode !== 'practice') return;
  const myMeta = state.teams[state.myTeam];
  if (myMeta && myMeta.prepColors) {
    ['G', 'C', 'D'].forEach((role) => {
      const pl = getPlayer(state.myTeam, role);
      if (pl && myMeta.prepColors[role]) applyPlayerColor(pl, myMeta.prepColors[role]);
    });
  }
  state.practiceShopPreservePlay = false;
  if (mp.enabled && !mp.isHost) {
    // Déjà synchronisé à chaque achat/changement de couleur via MP_PREP_ACTION
  } else if (mp.enabled && mp.isHost) {
    syncMyTeamPrep();
    ctx.api.broadcastWorldState();
  }
  if (state.mode === 'practice' && !state.practiceCursorFree) {
    lockPointerIfPlaying(true);
  }
  showOnlyModal(null);
  if (state.mode === 'practice' && !state.practiceCursorFree) {
    lockPointerIfPlaying();
  }
  updateTopHUD();
  updateRosterHUD();
  updateUltHudWidget();
  updateMobileTouchHUD();
  showToast('🛒 <strong>Boutique appliquée</strong> — testez vos pouvoirs et évolutions !', 2200);
}

export function openShopShortcut() {
  if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.TOOLS) {
    openTutorialShopStep3();
  } else if (state.mode === 'practice') {
    openPracticeShop();
  }
}

export function openPrepModal(options = {}) {
  const preservePhase = !!(options && options.preservePhase);
  if (!preservePhase) {
    state.phase = 'prep';
  }
  showOnlyModal('prep-modal');

  const myMeta = state.teams[state.myTeam];
  const myPE = getTeamPE(state.myTeam);
  const unlimitedCoins = state.mode === 'practice';
  const teamLabel = state.myTeam === 'ally' ? 'Équipe Or' : 'Équipe Violette';

  document.getElementById('prep-modal-title').textContent =
    state.mode === 'tutorial'
      ? "Magasin Pièces d'or (🪙 PO) — Tutoriel Étape 6 (Outils)"
      : state.mode === 'practice'
      ? preservePhase
        ? `🛒 Magasin Pratique (Pièces d'or ∞) — ${teamLabel}`
        : `Préparation Pratique — Un tour pour rien (${teamLabel})`
      : `Phase Préparatoire — Ronde ${state.round} (${teamLabel})`;
  document.getElementById('prep-pe-display').textContent = unlimitedCoins
    ? 'Or : ∞ 🪙 PO (Pratique)'
    : `Or : ${myPE} 🪙 PO`;

  const prepDescEl = document.getElementById('prep-modal-desc');
  if (prepDescEl) {
    const baseDesc =
      'Observez la couleur des <strong>2 ballons</strong> tirés sur la ligne centrale et répartissez secrètement vos dossards dans le dos de vos 3 joueuses (<strong>Gauche G</strong>, <strong>Centre C</strong>, <strong>Droit D</strong>).';
    if (state.mode === 'tutorial' || state.mode === 'practice') {
      prepDescEl.innerHTML = baseDesc;
    } else if (state.round === 1) {
      const r1Note = state.vanillaMode
        ? '🔒 <strong>Rappel Ronde 1 (Mode Vanille) :</strong> les <strong>Ultimates</strong> sont désactivés et le <strong>Magasin</strong> (débloqué à la <strong>Ronde 3</strong>) est <strong>verrouillé</strong> pour cette première ronde.'
        : '🔒 <strong>Rappel Ronde 1 :</strong> les <strong>Ultimates</strong> (débloqués à la <strong>2e ronde</strong>) et le <strong>Magasin</strong> (débloqué à la <strong>3e ronde</strong>) sont <strong>verrouillés</strong> pour cette première ronde !';
      prepDescEl.innerHTML =
        `${baseDesc}<div style="margin-top:8px; padding:7px 12px; border-radius:10px; background:rgba(245,158,11,0.16); border:1px solid rgba(250,204,21,0.55); color:#fef08a; font-size:0.84rem;">${r1Note}</div>`;
    } else if (state.round === 2 && !state.vanillaMode) {
      prepDescEl.innerHTML =
        `${baseDesc}<div style="margin-top:8px; padding:7px 12px; border-radius:10px; background:rgba(14,165,233,0.18); border:1px solid rgba(56,189,248,0.65); color:#e0f2fe; font-size:0.84rem;">⚡ <strong>Ronde 2 — Ultimates débloqués !</strong> Chaque joueuse peut désormais utiliser son <strong>Ultimate 1x par ronde</strong> (<strong>[R]</strong> puis <strong>Clic Gauche</strong>, sans ballon). <em>(🔒 Magasin à la Ronde 3)</em></div>`;
    } else if (state.round === 3) {
      prepDescEl.innerHTML =
        `${baseDesc}<div style="margin-top:8px; padding:7px 12px; border-radius:10px; background:rgba(34,197,94,0.16); border:1px solid rgba(74,222,128,0.55); color:#dcfce7; font-size:0.84rem;">🛒 <strong>Ronde 3 — Magasin débloqué !</strong> Dépensez vos <strong>🪙 PO</strong> dans les onglets <strong>Pouvoirs Individuels</strong> et <strong>Bonus d’Équipe</strong>.</div>`;
    } else {
      prepDescEl.innerHTML = baseDesc;
    }
  }

  const topBadge = document.getElementById('preview-ball-top');
  const botBadge = document.getElementById('preview-ball-bottom');
  const cTop = COLORS[state.drawnBalls[0]];
  const cBot = COLORS[state.drawnBalls[1]];

  topBadge.className = `color-badge ${cTop.id}`;
  topBadge.textContent = `${cTop.name} (${cTop.symbol})`;

  botBadge.className = `color-badge ${cBot.id}`;
  botBadge.textContent = `${cBot.name} (${cBot.symbol})`;

  updatePrepConfirmButtonUI();
  if (state.mode === 'tutorial') {
    const confirmBtn = document.getElementById('btn-confirm-prep');
    if (confirmBtn) {
      confirmBtn.textContent = '✅ Retourner au Tutoriel (Tester vos achats)';
    }
  }

  renderPrepColorPickers();
  renderShopItems();
  if (options && options.defaultTab) {
    switchPrepSubmenu(options.defaultTab);
  } else if (state.mode === 'tutorial' && state.tutorialPreserveStep) {
    switchPrepSubmenu('individual');
  } else if (state.mode === 'practice' && preservePhase) {
    switchPrepSubmenu('individual');
  } else {
    switchPrepSubmenu(state.prepTab || 'dossards');
  }
  if (state.mode !== 'tutorial') {
    setTutorialShopGuideStep(0);
  } else {
    updateTutorialShopGuideUI();
  }

  const timerBadge = document.getElementById('prep-timer-badge');
  if (state.prepInterval) clearInterval(state.prepInterval);
  state.prepInterval = null;

  if (state.mode === 'tutorial' || state.mode === 'practice') {
    timerBadge.textContent =
      state.mode === 'tutorial' ? '🎓 Tutoriel (Sans limite)' : '🧘 Pratique (Sans limite)';
    return;
  }

  state.prepTimer = 30;
  timerBadge.textContent = `⏱️ ${state.prepTimer}s`;
  state.prepInterval = setInterval(() => {
    if (document.getElementById('prep-modal').classList.contains('hidden')) return;
    state.prepTimer--;
    timerBadge.textContent = `⏱️ ${state.prepTimer}s`;
    if (state.prepTimer > 0 && state.prepTimer <= 5) ctx.api.playSfx?.('prep_tick', { urgent: state.prepTimer <= 2 });
    if (state.prepTimer <= 0) {
      clearInterval(state.prepInterval);
      state.prepInterval = null;
      if (!mp.enabled || mp.isHost) {
        startRoundExecution();
      }
    }
  }, 1000);
}

export function syncMyTeamPrep(teamKey = state.myTeam) {
  if (!mp.enabled) return;
  sendNetMessage({
    type: 'MP_PREP_SYNC',
    mapId: state.mapId,
    team: teamKey,
    teamData: state.teams[teamKey],
    teamPE: getTeamPE(teamKey),
    members: mp.members
  });
}

function formatRolePowerSummary(pwr) {
  if (!pwr) return [];
  const tags = [];
  if (state.vanillaMode && pwr.throwBall) tags.push('🎯 Passe');
  if (!state.vanillaMode && pwr.ultEvo) tags.push('🌟 Ult Évolué');
  if (!state.vanillaMode && pwr.dashEvo && DASH_EVO_META[pwr.dashEvo]) tags.push(DASH_EVO_META[pwr.dashEvo].shortLabel);
  if (!state.vanillaMode && pwr.toolEvo && TOOL_EVO_META[pwr.toolEvo]) tags.push(TOOL_EVO_META[pwr.toolEvo].shortLabel);
  if (pwr.standUp) tags.push('⚡ Relever');
  return tags;
}

function isPowerItemAllowedInCurrentMode(def) {
  if (!def) return false;
  if (state.vanillaMode) {
    return def.key === 'throwBall' || def.key === 'standUp';
  }
  return !def.vanillaOnly;
}

function runEnemyAIShopPurchases() {
  const meta = state.teams.enemy;
  if (!meta || !meta.powers) return;
  const candidates = state.vanillaMode
    ? [
        { key: 'throwBall', roles: ['C', 'G', 'D'] },
        { key: 'standUp', roles: ['G', 'C', 'D'] },
        { teamItem: 'teamJump', cost: 3 }
      ]
    : [
        { key: 'ultEvo', roles: ['G', 'C', 'D'] },
        { key: 'dash_bounce', roles: ['G', 'D', 'C'] },
        { key: 'dash_slide', roles: ['C', 'G', 'D'] },
        { key: 'dash_boomerang', roles: ['D', 'C', 'G'] },
        { key: 'tool_beacon', roles: ['C', 'G'] },
        { key: 'tool_wall', roles: ['C', 'D'] },
        { key: 'tool_pad', roles: ['G', 'D'] },
        { key: 'standUp', roles: ['G', 'C', 'D'] },
        { teamItem: 'teamDashPlus', cost: 2 },
        { teamItem: 'teamJump', cost: 3 }
      ];
  // Mélange léger pour que l'IA varie ses achats d'une partie à l'autre
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  let guard = 0;
  while (state.enemyPE >= 2 && guard < 4) {
    guard++;
    let bought = false;
    for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
      const cand = candidates[cIdx];
      if (cand.teamItem) {
        if (!meta[cand.teamItem] && state.enemyPE >= cand.cost) {
          meta[cand.teamItem] = true;
          state.enemyPE -= cand.cost;
          bought = true;
          break;
        }
        continue;
      }
      const def = INDIVIDUAL_POWERS.find((pw) => pw.key === cand.key);
      if (!def || state.enemyPE < def.cost) continue;
      for (let rIdx = 0; rIdx < cand.roles.length; rIdx++) {
        const r = cand.roles[rIdx];
        if (grantRolePowerItem(meta.powers[r], def)) {
          state.enemyPE -= def.cost;
          bought = true;
          break;
        }
      }
      if (bought) break;
    }
    if (!bought) break;
  }
}

export function renderPrepColorPickers() {
  const myMeta = state.teams[state.myTeam];

  ['G', 'C', 'D'].forEach((role) => {
    const containerEl =
      document.getElementById(`color-picker-${role}`) ||
      document.querySelector(`.color-picker-btns[data-role="${role}"]`);
    const buttons = containerEl ? containerEl.querySelectorAll('.color-pick-btn') : [];
    buttons.forEach((btn) => {
      const cKey = btn.getAttribute('data-color');
      btn.classList.toggle('selected', myMeta.prepColors[role] === cKey);
      btn.onclick = (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        assignPrepColor(role, cKey);
      };
    });

    const tags = formatRolePowerSummary(myMeta.powers[role]);
    const tagsEl = document.getElementById(`power-tags-${role}`);
    if (tagsEl) {
      tagsEl.textContent = tags.length ? `Équipement : ${tags.join(' • ')}` : 'Aucune évolution / pouvoir';
    }
  });

  const s = myMeta.dossardStock;
  document.getElementById('stock-warning').textContent =
    `Stock de dossards (${state.myTeam === 'ally' ? 'Équipe Or' : 'Équipe Violette'}) : ${s.green} Vert (🌿 Feuille), ${s.red} Rouge (🔥 Flamme), ${s.blue} Bleu (💧 Goutte)`;
}

function applyTeamColorChange(teamKey, role, newColor) {
  const meta = state.teams[teamKey];
  if (!meta || !COLOR_KEYS.includes(newColor) || !['G', 'C', 'D'].includes(role)) return false;
  const oldColor = meta.prepColors[role];
  if (oldColor === newColor) return false;

  const otherRoles = ['G', 'C', 'D'].filter((r) => r !== role);
  const usedCount = otherRoles.filter((r) => meta.prepColors[r] === newColor).length;
  if (usedCount < meta.dossardStock[newColor]) {
    meta.prepColors[role] = newColor;
    return true;
  }
  const swapRole = otherRoles.find((r) => meta.prepColors[r] === newColor);
  if (swapRole) {
    meta.prepColors[swapRole] = oldColor;
    meta.prepColors[role] = newColor;
    return true;
  }
  return false;
}

function applyTeamCollectivePurchase(teamKey, itemKey) {
  if (!isShopAvailable()) return false;
  const meta = state.teams[teamKey];
  const pe = getTeamPE(teamKey);
  const unlimited = state.mode === 'practice';
  if (!meta) return false;

  if (itemKey === 'teamDashPlus') {
    if (state.vanillaMode || (!unlimited && pe < 2) || meta.teamDashPlus) return false;
    if (!unlimited) setTeamPE(teamKey, pe - 2);
    meta.teamDashPlus = true;
    ['G', 'C', 'D'].forEach((r) => {
      const pl = getPlayer(teamKey, r);
      if (pl) syncPlayerPowerVisuals(pl, 0);
    });
    return true;
  }
  if (itemKey === 'teamJump') {
    if ((!unlimited && pe < 3) || meta.teamJump) return false;
    if (!unlimited) setTeamPE(teamKey, pe - 3);
    meta.teamJump = true;
    ['G', 'C', 'D'].forEach((r) => {
      const pl = getPlayer(teamKey, r);
      if (pl) syncPlayerPowerVisuals(pl, 0);
    });
    if (teamKey === state.myTeam) {
      updateMobileTouchHUD();
    }
    return true;
  }
  return false;
}

export function handleHostPrepAction(msg, sourceConn) {
  if (!mp.isHost) return;
  const member = mp.members.find((m) => m.peerId === msg.peerId);
  const teamKey = member ? member.team : msg.team;
  if (!['ally', 'enemy'].includes(teamKey)) return;

  const unlimited = state.mode === 'practice';
  let ok = true;
  if (msg.action === 'assignColor') {
    ok = applyTeamColorChange(teamKey, msg.role, msg.newColor);
  } else if (msg.action === 'buyPower') {
    const def = INDIVIDUAL_POWERS.find((pw) => pw.key === msg.powerKey);
    if (
      !def ||
      !isPowerItemAllowedInCurrentMode(def) ||
      !isShopAvailable() ||
      (!unlimited && getTeamPE(teamKey) < def.cost)
    ) {
      ok = false;
    } else {
      const targetRole = ['G', 'C', 'D'].includes(msg.targetRole) ? msg.targetRole : 'G';
      const meta = state.teams[teamKey];
      if (!meta.powers[targetRole] || !grantRolePowerItem(meta.powers[targetRole], def)) {
        ok = false;
      } else {
        if (!unlimited) setTeamPE(teamKey, getTeamPE(teamKey) - def.cost);
        const pl = getPlayer(teamKey, targetRole);
        if (pl) syncPlayerPowerVisuals(pl, 0);
      }
    }
  } else if (msg.action === 'buyDossard') {
    const meta = state.teams[teamKey];
    const pe = getTeamPE(teamKey);
    if (!isShopAvailable() || (!unlimited && pe < 1) || !COLOR_KEYS.includes(msg.color) || meta.extraDossardBought[msg.color]) {
      ok = false;
    } else {
      if (!unlimited) setTeamPE(teamKey, pe - 1);
      meta.extraDossardBought[msg.color] = true;
      meta.dossardStock[msg.color] += 1;
    }
  } else if (msg.action === 'buyTeamItem') {
    ok = applyTeamCollectivePurchase(teamKey, msg.itemKey);
  } else if (msg.action === 'ready') {
    if (member) member.prepReady = true;
    const teamMembers = mp.members.filter((m) => m.team === teamKey);
    state.teams[teamKey].prepReady =
      teamMembers.length === 0 || teamMembers.every((m) => !!m.prepReady);
  }

  if (!ok && sourceConn) {
    sendNetMessage(
      {
        type: 'MP_TOAST',
        html: "⚠️ Achat ou action impossible (pièces d'or insuffisantes ou déjà acquis).",
        duration: 2400
      },
      sourceConn
    );
  }

  if (state.mode === 'practice' && state.phase === 'play' && state.teams[teamKey]?.prepColors) {
    ['G', 'C', 'D'].forEach((role) => {
      const pl = getPlayer(teamKey, role);
      const nextCol = state.teams[teamKey].prepColors[role];
      if (pl && nextCol) applyPlayerColor(pl, nextCol);
      if (pl) syncPlayerPowerVisuals(pl, 0);
    });
    ctx.api.broadcastWorldState();
  }

  syncMyTeamPrep(teamKey);
  const prepEl = document.getElementById('prep-modal');
  if (teamKey === state.myTeam && (state.phase === 'prep' || (prepEl && !prepEl.classList.contains('hidden')))) {
    renderPrepColorPickers();
    renderShopItems();
  }
  updatePrepConfirmButtonUI();
  updateTopHUD();
  updateRosterHUD();
  updateUltHudWidget();
  if (teamKey === state.myTeam) updateMobileTouchHUD();
  maybeStartRoundFromPrep();
}

export function assignPrepColor(role, newColor) {
  if (!applyTeamColorChange(state.myTeam, role, newColor)) return;
  ctx.api.playSfx?.('ui_color_pick', { color: newColor });
  if (state.mode === 'practice' && state.phase === 'play') {
    const pl = getPlayer(state.myTeam, role);
    if (pl) applyPlayerColor(pl, newColor);
    updateRosterHUD();
    updateUltHudWidget();
  }
  renderPrepColorPickers();
  if (mp.enabled && !mp.isHost) {
    sendNetMessage({
      type: 'MP_PREP_ACTION',
      peerId: mp.myPeerId,
      team: state.myTeam,
      action: 'assignColor',
      role,
      newColor
    });
  } else {
    syncMyTeamPrep();
  }
}

// --- MAGASIN & STATUT DES ÉVOLUTIONS (RONDE 3+) ---
function renderShopEvoStatusBar() {
  const bar = document.getElementById('shop-evo-status-bar');
  if (!bar) return;
  bar.innerHTML = '';

  const myTeamKey = state.myTeam;
  const oppTeamKey = myTeamKey === 'ally' ? 'enemy' : 'ally';
  const teamConfigs = [
    { key: myTeamKey, title: `Votre équipe (${myTeamKey === 'ally' ? 'Or' : 'Violette'})`, showColor: true },
    { key: oppTeamKey, title: `Adversaires (${oppTeamKey === 'ally' ? 'Or' : 'Violette'})`, showColor: false }
  ];

  teamConfigs.forEach((tc) => {
    const meta = state.teams[tc.key];
    const panel = document.createElement('div');
    panel.className = `evo-team-panel ${tc.key}`;

    const header = document.createElement('div');
    header.className = 'evo-team-title';
    const teamCoinsTxt = state.mode === 'practice' ? '∞' : getTeamPE(tc.key);
    const teamBonusBadges = [];
    if (!state.vanillaMode && meta && meta.teamDashPlus) {
      teamBonusBadges.push('<span class="evo-slot-pill lit-dash" title="Dash + Équipe (+35% distance, +15% vitesse)">👟 Dash+</span>');
    }
    if (meta && meta.teamJump) {
      teamBonusBadges.push('<span class="evo-slot-pill lit-base" title="Saut Équipe débloqué [Espace]">🦘 Saut</span>');
    }
    const teamBonusHtml = teamBonusBadges.length ? ` <span style="display:inline-flex; gap:4px; margin-left:4px;">${teamBonusBadges.join('')}</span>` : '';
    header.innerHTML = `<span>${tc.title}${teamBonusHtml}</span><span style="font-size:0.68rem; color:#94a3b8; font-weight:700;">${teamCoinsTxt} 🪙 PO</span>`;
    panel.appendChild(header);

    ['G', 'C', 'D'].forEach((role) => {
      const pwr = (meta && meta.powers && meta.powers[role]) || createEmptyRolePowers(state.vanillaMode);
      const colKey = meta && meta.prepColors ? meta.prepColors[role] : 'blue';
      const colSym = tc.showColor && COLORS[colKey] ? COLORS[colKey].symbol : '👤';

      const extras = [];
      if (pwr.standUp) extras.push('<span class="evo-slot-pill lit-base" title="Se relever [E]">⚡</span>');

      const row = document.createElement('div');
      row.className = 'evo-role-row';
      if (state.vanillaMode) {
        const passHtml = pwr.throwBall
          ? '<span class="evo-slot-pill lit-base" title="Passe / Tir libre débloqué [E]">🎯 Passe</span>'
          : '<span class="evo-slot-pill" title="Passe verrouillée">Passe —</span>';
        row.innerHTML = `
          <span class="evo-role-id">${colSym} ${tc.key === myTeamKey ? role : 'Adv ' + role}</span>
          <div class="evo-slots-wrap">${passHtml}${extras.join('')}</div>
        `;
      } else {
        const ultHtml = pwr.ultEvo
          ? '<span class="evo-slot-pill lit-ult" title="Ultimate Évolué (persiste tous éléments)">🌟 Ult</span>'
          : '<span class="evo-slot-pill" title="Ultimate standard">Ult —</span>';

        const dashMeta = pwr.dashEvo ? DASH_EVO_META[pwr.dashEvo] : null;
        const dashHtml = dashMeta
          ? `<span class="evo-slot-pill lit-dash" title="${dashMeta.desc}">${dashMeta.shortLabel}</span>`
          : '<span class="evo-slot-pill" title="Dash standard">Dash —</span>';

        const toolMeta = pwr.toolEvo ? TOOL_EVO_META[pwr.toolEvo] : null;
        const toolHtml = toolMeta
          ? `<span class="evo-slot-pill lit-tool" title="${toolMeta.desc}">${toolMeta.shortLabel}</span>`
          : '<span class="evo-slot-pill" title="Aucun outil">Outil —</span>';

        row.innerHTML = `
          <span class="evo-role-id">${colSym} ${tc.key === myTeamKey ? role : 'Adv ' + role}</span>
          <div class="evo-slots-wrap">${ultHtml}${dashHtml}${toolHtml}${extras.join('')}</div>
        `;
      }
      panel.appendChild(row);
    });

    bar.appendChild(panel);
  });
}

export function renderShopItems() {
  const shopGrid = document.getElementById('shop-items-grid');
  const unlockNote = document.getElementById('shop-unlock-note');
  const myMeta = state.teams[state.myTeam];
  const myPE = getTeamPE(state.myTeam);
  const unlimitedCoins = state.mode === 'practice';

  document.getElementById('prep-pe-display').textContent = unlimitedCoins
    ? 'Or : ∞ 🪙 PO (Pratique)'
    : `Or : ${myPE} 🪙 PO`;

  const isShopOpen = isShopAvailable();
  unlockNote.textContent = unlimitedCoins
    ? '🧪 Mode Pratique : Pièces d’or illimitées (∞ 🪙 PO) — achetez et testez librement !'
    : isShopOpen
    ? `Magasin ouvert ! Attribuez directement à G, C ou D (${myPE} 🪙 PO disponibles)`
    : `S'ouvre à la Ronde 3 (Ronde actuelle : ${state.round}/3)`;

  const btnShopReset = document.getElementById('btn-shop-reset-powers');
  if (btnShopReset) {
    btnShopReset.classList.toggle('hidden', state.mode !== 'practice');
  }

  renderShopEvoStatusBar();
  shopGrid.innerHTML = '';

  const isTutToolStep = state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.TOOLS;
  const freeBasicsNote = document.createElement('div');
  if (isTutToolStep) {
    freeBasicsNote.style.cssText =
      'grid-column:1 / -1; background:rgba(245,158,11,0.16); border:1px solid rgba(250,204,21,0.65); border-radius:10px; padding:8px 11px; font-size:0.78rem; color:#fef08a; line-height:1.35;';
    freeBasicsNote.innerHTML =
      '🛠️ <strong>Tutoriel Étape 6/8 — Outils :</strong> Suivez le guide ci-dessus puis achetez un <strong>Outil</strong> (📡 Balise, 🧱 Mur 3m ou ⚡ Tapis — 3 🪙 PO) pour <strong>Gauche (G)</strong> et déployez-le avec <strong>[E]</strong> (sans balle) !';
  } else {
    freeBasicsNote.style.cssText =
      'grid-column:1 / -1; background:rgba(14,165,233,0.12); border:1px solid rgba(56,189,248,0.35); border-radius:10px; padding:7px 11px; font-size:0.75rem; color:#bae6fd; line-height:1.35;';
    freeBasicsNote.innerHTML = state.vanillaMode
      ? '🍦 <strong>Mode Vanille :</strong> Ultimates, évolutions de Dash, Dash+ et Outils désactivés. Débloquez 🎯 <strong>Passe</strong> (<code>[E]</code>), ⚡ <strong>Se relever</strong> (<code>[E]</code>), 🎽 <strong>Dossards</strong> et 🦘 <strong>Saut</strong> (<code>[Espace]</code>) dès la Ronde 3 !'
      : 'ℹ️ <strong>Actifs gratuitement dès la Ronde 1 :</strong> 🎯 <strong>Passe chargée / Tir libre</strong> (<code>[E]</code>) et 📝 <strong>Papier / Marqueurs</strong> (les dos adverses vus sont mémorisés automatiquement).';
  }
  shopGrid.appendChild(freeBasicsNote);

  const categorySections = [
    { id: 'base', label: '🎯 Actions de Base' },
    { id: 'ult', label: "🌟 Évolution d'Ultimate (1/perso • s'applique quel que soit l'élément)" },
    { id: 'dash', label: '💨 Évolutions de Dash (1 max/perso • réachetable pour G, C, D • cumulable avec 👟 Dash+ Équipe)' },
    { id: 'tool', label: '🛠️ Outils [E sans balle] (1 max/perso • demeurent indéfiniment)' }
  ];

  // 1) Pouvoirs individuels & Évolutions groupés par catégorie (sélecteur G/C/D sur chaque item)
  categorySections.forEach((sec) => {
    const itemsInSec = INDIVIDUAL_POWERS.filter(
      (pw) => pw.category === sec.id && isPowerItemAllowedInCurrentMode(pw)
    );
    if (itemsInSec.length === 0) return;

    const hdr = document.createElement('div');
    hdr.className = 'shop-cat-header';
    hdr.setAttribute('data-shop-cat', 'individual');
    hdr.setAttribute('data-shop-section', sec.id);
    hdr.textContent = sec.label;
    shopGrid.appendChild(hdr);

    itemsInSec.forEach((pw) => {
      const div = document.createElement('div');
      div.className = 'shop-item' + (isTutToolStep && pw.category === 'tool' ? ' tut-shop-focus' : '');
      div.setAttribute('data-shop-cat', 'individual');
      div.innerHTML = `
        <div class="shop-item-info">
          <h4>${pw.title}</h4>
          <p>${pw.desc}</p>
        </div>
      `;

      const btnWrap = document.createElement('div');
      btnWrap.className = 'shop-role-btns';
      ['G', 'C', 'D'].forEach((r) => {
        const rolePwr = myMeta.powers[r];
        const owned = hasRoleEvolutionItem(rolePwr, pw);
        const blocked = !owned && isRoleEvolutionSlotBlocked(rolePwr, pw);
        const lockedByTut = isTutToolStep && (pw.category !== 'tool' || r !== 'G');
        const btn = document.createElement('button');
        btn.className =
          'shop-role-btn' +
          (owned ? ' owned' : blocked ? ' blocked' : '');
        btn.setAttribute('data-power', pw.key);
        btn.setAttribute('data-role', r);
        btn.textContent = owned ? `${r} ✔` : blocked ? `${r} ✖` : r;
        let blockedTitle = `Joueuse ${r} a déjà une évolution dans ce slot (1 max/perso)`;
        if (blocked && pw.slotType === 'dashEvo' && rolePwr.dashEvo && DASH_EVO_META[rolePwr.dashEvo]) {
          blockedTitle = `Joueuse ${r} possède déjà ${DASH_EVO_META[rolePwr.dashEvo].shortLabel} (1 max/perso, cumulable avec 👟 Dash+ Équipe)`;
        } else if (blocked && pw.slotType === 'toolEvo' && rolePwr.toolEvo && TOOL_EVO_META[rolePwr.toolEvo]) {
          blockedTitle = `Joueuse ${r} possède déjà ${TOOL_EVO_META[rolePwr.toolEvo].shortLabel} (1 max/perso)`;
        }
        btn.title = lockedByTut
          ? 'Étape Outils : achetez un Outil (📡 / 🧱 / ⚡) pour G !'
          : owned
          ? `Joueuse ${r} possède déjà ${pw.shortLabel}`
          : blocked
          ? blockedTitle
          : `Attribuer ${pw.shortLabel} à Joueuse ${r} (${pw.cost} 🪙 PO)`;
        btn.disabled = lockedByTut || owned || blocked || !isShopOpen || (!unlimitedCoins && myPE < pw.cost);
        btn.onclick = () => buyIndividualPower(pw.key, pw.cost, r);
        btnWrap.appendChild(btn);
      });

      div.appendChild(btnWrap);
      shopGrid.appendChild(div);
    });
  });

  const colHdr = document.createElement('div');
  colHdr.className = 'shop-cat-header';
  colHdr.setAttribute('data-shop-cat', 'collective');
  colHdr.textContent = "🛡️ Bonus d'Équipe & Dossards";
  shopGrid.appendChild(colHdr);

  // 2) Amélioration dossard avec choix explicite de couleur
  const dossardDiv = document.createElement('div');
  dossardDiv.className = 'shop-item';
  dossardDiv.setAttribute('data-shop-cat', 'collective');
  dossardDiv.innerHTML = `
    <div class="shop-item-info">
      <h4>🎽 Dossard Supplémentaire (Collectif — 1 🪙 PO)</h4>
      <p>Ajoute +1 dossard de la couleur choisie (permet 2 joueuses identiques).</p>
    </div>
  `;
  const dossardWrap = document.createElement('div');
  dossardWrap.className = 'shop-role-btns';
  const shortColorLabels = { green: '🌿 V', red: '🔥 R', blue: '💧 B' };
  COLOR_KEYS.forEach((cKey) => {
    const bought = !!myMeta.extraDossardBought[cKey];
    const btn = document.createElement('button');
    btn.className = `shop-role-btn dossard-${cKey}${bought ? ' owned' : ''}`;
    btn.setAttribute('data-dossard-color', cKey);
    btn.textContent = bought ? `${COLORS[cKey].symbol} ✔` : `+1 ${shortColorLabels[cKey]}`;
    btn.title = isTutToolStep
      ? 'Étape Outils : achetez un Outil (📡 / 🧱 / ⚡) pour G !'
      : bought
      ? `Dossard ${COLORS[cKey].name} supplémentaire déjà acquis`
      : `+1 dossard ${COLORS[cKey].name} (1 🪙 PO)`;
    btn.disabled = isTutToolStep || bought || !isShopOpen || (!unlimitedCoins && myPE < 1);
    btn.onclick = () => buyExtraDossard(cKey);
    dossardWrap.appendChild(btn);
  });
  dossardDiv.appendChild(dossardWrap);
  shopGrid.appendChild(dossardDiv);

  // 3) Améliorations collectives d'équipe (Option B Hybride)
  const commitTeamShopPurchase = (itemKey) => {
    if (!applyTeamCollectivePurchase(state.myTeam, itemKey)) return;
    ctx.api.playSfx?.('shop_buy');
    renderShopItems();
    updateTopHUD();
    updateRosterHUD();
    updateMobileTouchHUD();
    if (mp.enabled && !mp.isHost) {
      sendNetMessage({
        type: 'MP_PREP_ACTION',
        peerId: mp.myPeerId,
        team: state.myTeam,
        action: 'buyTeamItem',
        itemKey
      });
    } else {
      syncMyTeamPrep();
    }
  };

  const teamItems = [
    ...(!state.vanillaMode
      ? [
          {
            title: '👟 Dash + (Équipe — 2 🪙 PO)',
            desc: `+35 % distance et +15 % vitesse de Dash pour vos 3 joueuses (cumulable avec les évolutions).`,
            actionLabel: myMeta.teamDashPlus ? 'Acquis ✔' : 'Acheter (2 🪙 PO)',
            canBuy: !isTutToolStep && isShopOpen && (unlimitedCoins || myPE >= 2) && !myMeta.teamDashPlus,
            onBuy: () => commitTeamShopPurchase('teamDashPlus')
          }
        ]
      : []),
    {
      title: '🦘 Débloquer Saut (Équipe — 3 🪙 PO)',
      desc: `Autorise vos 3 joueuses à sauter ([Espace] / bouton Saut) pour franchir murs déployés et plaques de givre.`,
      actionLabel: myMeta.teamJump ? 'Acquis ✔' : 'Acheter (3 🪙 PO)',
      canBuy: !isTutToolStep && isShopOpen && (unlimitedCoins || myPE >= 3) && !myMeta.teamJump,
      onBuy: () => commitTeamShopPurchase('teamJump')
    }
  ];

  teamItems.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.setAttribute('data-shop-cat', 'collective');
    div.innerHTML = `
      <div class="shop-item-info">
        <h4>${item.title}</h4>
        <p>${item.desc}</p>
      </div>
    `;
    const btn = document.createElement('button');
    btn.className = 'action-btn primary';
    btn.textContent = item.actionLabel;
    btn.disabled = !item.canBuy;
    btn.onclick = item.onBuy;
    div.appendChild(btn);
    shopGrid.appendChild(div);
  });

  applyPrepShopCategoryFilter();
  if (state.mode === 'tutorial' && state.tutorialShopGuideStep > 0) {
    updateTutorialShopGuideUI();
  }
}

function buyIndividualPower(powerKey, cost, targetRole = null) {
  const myMeta = state.teams[state.myTeam];
  const myPE = getTeamPE(state.myTeam);
  const unlimited = state.mode === 'practice';
  const def = INDIVIDUAL_POWERS.find((pw) => pw.key === powerKey);
  if (!def || !isPowerItemAllowedInCurrentMode(def) || (!unlimited && myPE < def.cost)) return false;

  const grantToRole = (r) => {
    if (!myMeta.powers[r] || !grantRolePowerItem(myMeta.powers[r], def)) return false;
    if (!unlimited) setTeamPE(state.myTeam, myPE - def.cost);
    const pl = getPlayer(state.myTeam, r);
    if (pl) syncPlayerPowerVisuals(pl, 0);
    renderPrepColorPickers();
    renderShopItems();
    updateTopHUD();
    updateRosterHUD();
    updateUltHudWidget();
    updateMobileTouchHUD();
    if (mp.enabled && !mp.isHost) {
      sendNetMessage({
        type: 'MP_PREP_ACTION',
        peerId: mp.myPeerId,
        team: state.myTeam,
        action: 'buyPower',
        powerKey,
        cost: def.cost,
        targetRole: r
      });
    } else {
      syncMyTeamPrep();
    }
    if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.TOOLS && def.category === 'tool' && r === 'G') {
      markTutorialCheck('toolBought');
    }
    ctx.api.playSfx?.('shop_buy');
    return true;
  };

  if (targetRole !== null) {
    return ['G', 'C', 'D'].includes(targetRole) ? grantToRole(targetRole) : false;
  }

  const preferred = ['G', 'C', 'D'].includes(state.controlledRole) ? state.controlledRole : 'G';
  const order = [preferred, ...['G', 'C', 'D'].filter((r) => r !== preferred)];
  for (const r of order) {
    if (grantToRole(r)) return true;
  }
  return false;
}

function buyExtraDossard(targetColor = null) {
  const myMeta = state.teams[state.myTeam];
  const myPE = getTeamPE(state.myTeam);
  const unlimited = state.mode === 'practice';
  if (!unlimited && myPE < 1) return false;
  const colorsToTry =
    targetColor && COLOR_KEYS.includes(targetColor) ? [targetColor] : COLOR_KEYS;
  for (const cKey of colorsToTry) {
    if (!myMeta.extraDossardBought[cKey]) {
      if (!unlimited) setTeamPE(state.myTeam, myPE - 1);
      myMeta.extraDossardBought[cKey] = true;
      myMeta.dossardStock[cKey] += 1;
      renderPrepColorPickers();
      renderShopItems();
      updateTopHUD();
      if (mp.enabled && !mp.isHost) {
        sendNetMessage({
          type: 'MP_PREP_ACTION',
          peerId: mp.myPeerId,
          team: state.myTeam,
          action: 'buyDossard',
          color: cKey
        });
      } else {
        syncMyTeamPrep();
      }
      ctx.api.playSfx?.('shop_buy');
      return true;
    }
  }
  return false;
}

// --- CONTRÔLEUR SÉQUENCE TUTORIEL (8 ÉTAPES GUIDÉES) ---
let tutorialBeaconGroup = null;
let tutorialAutoAdvanceTimer = null;
let tutorialFinishTimer = null;
let tutorialShopAutoReturnTimer = null;

export function isDashUnlocked() {
  if (state.mode !== 'tutorial') return true;
  return state.tutorialStep >= 2 || !!state.tutorialChecklist.movedToBeacon;
}

export function isTutorialRoleSwitchAllowed() {
  if (state.mode !== 'tutorial') return true;
  if (state.tutorialStep === TUTORIAL_STEPS.MOVEMENT) return !!state.tutorialChecklist.dashed;
  if (state.tutorialStep === TUTORIAL_STEPS.RULE1) return !!state.tutorialChecklist.rule1Locked;
  if (state.tutorialStep === TUTORIAL_STEPS.ULTIMATE) return true;
  return false;
}

function syncTutorialEntityVisibility() {
  const isTut = state.mode === 'tutorial';
  const step = Math.min(TUTORIAL_TOTAL_STEPS, Math.max(1, state.tutorialStep || 1));

  players.forEach((p) => {
    let hidden = false;
    if (isTut) {
      if (step === TUTORIAL_STEPS.MOVEMENT) {
        hidden =
          p.team !== 'ally' ||
          (p.role !== 'G' && !state.tutorialChecklist.dashed);
      } else if (step === TUTORIAL_STEPS.GOAL) {
        hidden = !(p.team === 'ally' && p.role === 'G');
      } else if (step === TUTORIAL_STEPS.PASS) {
        hidden = !(p.team === 'ally' && (p.role === 'G' || p.role === 'C'));
      } else if (step === TUTORIAL_STEPS.RULE1) {
        hidden = !(p.team === 'ally' || (p.team === 'enemy' && p.role === 'C'));
      } else if (step === TUTORIAL_STEPS.ULTIMATE) {
        hidden = !(p.team === 'ally' || (p.team === 'enemy' && p.role === 'D'));
      } else {
        // Étapes Triangle (4), Outils (6) & MOBA (8) : Feu (G) et Adv D
        hidden = !((p.team === 'ally' && p.role === 'G') || (p.team === 'enemy' && p.role === 'D'));
      }
    }
    p.tutorialHidden = hidden;
    if (p.mesh && p.mesh.root) {
      p.mesh.root.visible = !hidden;
    }
    if (hidden && p.mesh && p.mesh.labelEl) {
      p.mesh.labelEl.style.display = 'none';
      p.mesh._lblDisplay = 'none';
    }
  });

  balls.forEach((b) => {
    const hidden = isTut
      ? !((step === TUTORIAL_STEPS.GOAL || step === TUTORIAL_STEPS.PASS) && b.id === 0)
      : false;
    b.tutorialHidden = hidden;
    if (b.mesh && b.mesh.group) {
      b.mesh.group.visible = !hidden;
    }
  });
}

function getTutorialStepDef(stepNum) {
  const step = Math.min(TUTORIAL_TOTAL_STEPS, Math.max(1, Number(stepNum) || 1));
  const isMob = !!state.mobileMode;
  const isMoba = state.cameraMode === 'aerial';
  const moveClickLbl = state.mobaMoveButton === 'left' ? 'Clic Gauche' : 'Clic Droit';
  const r1Locked = !!state.tutorialChecklist.rule1Locked;

  const defs = {
    1: {
      title: '1/8 — Mouvement',
      desc: isMob
        ? 'Stick gauche vers la balise → Dash → changer de position (Gauche G · Centre C · Droit D) puis revenir sur G.'
        : isMoba
        ? 'Déplacez-vous vers la balise → Dash [Shift] → changer de position ([2]/[3] sans clic : Gauche G · Centre C · Droit D) puis revenir sur G [1].'
        : 'Bougez vers la balise → Dash [Shift] → changer de position (Gauche G [1] · Centre C [2] · Droit D [3]) puis revenir sur G.',
      items: [
        { key: 'movedToBeacon', label: 'Rejoindre la balise', overhead: '🎯 Rejoindre la balise bleue' },
        {
          key: 'dashed',
          label: isMob ? 'Faire un Dash (💨 Dash)' : 'Dash ([Shift])',
          overhead: isMob ? '🎯 Appuyer sur 💨 Dash' : '🎯 Faire un Dash [Shift]'
        },
        {
          key: 'switchedRole',
          label: isMob
            ? 'Changer de position (Taper C ou D)'
            : isMoba
            ? 'Changer de position ([2] Centre C ou [3] Droit D)'
            : 'Changer de position ([2 / 3] ou Clic)',
          overhead: isMob
            ? '🎯 Taper Centre (C) ou Droit (D) en bas'
            : isMoba
            ? '🎯 Changer de position : [2] (C) ou [3] (D)'
            : '🎯 Changer de position [2 / 3 ou Clic]'
        },
        {
          key: 'returnedToFirstRole',
          label: isMob
            ? 'Revenir à Gauche (G) 🔥 (Taper G en bas)'
            : isMoba
            ? 'Revenir à Gauche (G) 🔥 ([1])'
            : 'Revenir à Gauche (G) 🔥 ([1] ou Clic)',
          overhead: isMob
            ? '🎯 Revenir à Gauche (G) 🔥 (Taper G en bas)'
            : isMoba
            ? '🎯 Revenir à Gauche (G) 🔥 [1]'
            : '🎯 Revenir à Gauche (G) 🔥 [1 ou Clic]'
        }
      ]
    },
    2: {
      title: '2/8 — But du jeu',
      desc: 'Prenez le ballon 🔥 Rouge et marquez au cerceau droit (+1 pt de victoire).',
      items: [
        { key: 'pickedBall', label: 'Prendre le ballon 🔥 Rouge', overhead: '🎯 Prendre le ballon 🔥 Rouge' },
        { key: 'scoredGoal', label: 'Marquer au cerceau droit', overhead: '🎯 Marquer au cerceau droit' }
      ]
    },
    3: {
      title: '3/8 — Passes 🎯',
      desc: isMob
        ? 'Prenez le ballon 🔥 Rouge, maintenez ⚽ Passe et visez 💧 Centre (C) (même d’une autre couleur) !'
        : 'Prenez le ballon 🔥 Rouge, maintenez [E] pour charger la portée et passez à 💧 Centre (C) (même d’une autre couleur) !',
      items: [
        { key: 'pickedPassBall', label: 'Prendre le ballon 🔥 Rouge', overhead: '🎯 Prendre le ballon 🔥 Rouge' },
        {
          key: 'passedBall',
          label: isMob ? 'Passer à 💧 Centre (C) (Maintenir ⚽ Passe)' : 'Passer à 💧 Centre (C) (Maintenir [E])',
          overhead: isMob ? '🎯 Maintenir ⚽ Passe et viser 💧 Centre (C)' : '🎯 Viser 💧 Centre (C) et maintenir [E] pour passer'
        }
      ]
    },
    4: {
      title: '4/8 — Triangle & 🪙 PO',
      desc: '🔥 Feu gagne contre 🌿 Feuille (🌿 > 💧 > 🔥 > 🌿). Passez derrière Adv D pour voir son dos (?), puis touchez-la avec le bon élément pour l’intercepter (+🪙 PO) !',
      items: [
        { key: 'backSeen', label: 'Contourner Adv D pour voir son dos (?)', overhead: '🎯 Passez derrière Adv D pour voir son dos (?)' },
        { key: 'intercepted', label: 'Touchez Adv D pour l’intercepter (🔥 gagne contre 🌿)', overhead: '🎯 🔥 bat 🌿 : touchez-la pour l’intercepter !' }
      ]
    },
    5: {
      title: r1Locked ? '5/8 — Règle 1 ⚡' : '5/8 — Même couleur ? ⚡',
      desc: !r1Locked
        ? 'Voyez ce qui se passe si vous touchez quelqu’un de la même couleur : allez toucher Adv C (🔥) !'
        : isMob
        ? 'Règle 1 ! Même couleur = blocage face à face. Seul le bon élément (💧 > 🔥) libère Gauche (G) : tapez Centre (C) puis touchez Adv C.'
        : 'Règle 1 ! Même couleur = blocage face à face. Seul le bon élément (💧 > 🔥) libère Gauche (G) : passez sur Centre (C) [2] puis touchez Adv C.',
      items: [
        { key: 'rule1Locked', label: 'Toucher Adv C (🔥 = 🔥) — même couleur', overhead: '🎯 Voyez ce qui se passe si vous touchez Adv C (🔥) !' },
        {
          key: 'rule1Switched',
          label: isMob
            ? 'Prendre Centre (C) 💧 (Taper C)'
            : isMoba
            ? 'Prendre Centre (C) 💧 ([2])'
            : 'Prendre Centre (C) 💧 ([2] ou Clic)',
          overhead: isMob ? '🎯 Seule 💧 > 🔥 libère G ! Tapez Centre (C)' : '🎯 Seule 💧 > 🔥 libère G ! Touche [2] (Centre C)'
        },
        { key: 'rule1Broken', label: 'Touchez Adv C avec 💧 Centre (C) pour libérer G', overhead: '🎯 💧 bat 🔥 : touchez Adv C pour libérer G !' }
      ]
    },
    6: {
      title: '6/8 — Outils 🛠️',
      desc: isMob
        ? 'Ouvrez 🛒 Boutique, suivez le guide (corridors, sections, outils), achetez un outil pour Gauche (G) puis déployez-le (sans balle) !'
        : 'Ouvrez Boutique [B] pour suivre le guide (corridors, sections, outils), achetez un outil pour Gauche (G) puis déployez-le avec [E] (sans balle) !',
      items: [
        {
          key: 'toolBought',
          label: isMob ? 'Acheter un Outil pour Gauche (G) (🛒 Boutique)' : 'Acheter un Outil pour Gauche (G) (Boutique [B])',
          overhead: isMob ? '🎯 Taper 🛒 Boutique : guide + Outil pour G' : '🎯 Boutique [B] : guide + Outil pour Gauche (G)'
        },
        {
          key: 'toolDeployed',
          label: isMob ? 'Déployer l’outil (Bouton 📡/🧱/⚡)' : 'Déployer l’outil ([E] sans balle)',
          overhead: isMob ? '🎯 Taper le bouton Outil (📡/🧱/⚡) !' : '🎯 Appuyer sur [E] (sans balle) pour déployer !'
        }
      ]
    },
    7: {
      title: '7/8 — Les 3 Ultimates (2e Ronde) ⚡',
      desc: isMob
        ? 'Débloqués à la 2e ronde en match normal (1x/ronde, sauf 🔥 évolué : 2 charges, sans ballon). Essayez les 3 éléments : 🔥 G, 💧 C et 🌿 D !'
        : 'Débloqués à la 2e ronde en match normal (1x/ronde, sauf 🔥 évolué : 2 charges, sans ballon). Essayez les 3 éléments : 🔥 Gauche (G), 💧 Centre (C) et 🌿 Droit (D) !',
      extraHtml:
        '<div><strong>🔥 Feu :</strong> Laser plasma sniper (0.5s). <em>🌟 Évo :</em> +large/rapide + <strong>2 charges/ronde</strong> (3s CD).</div>' +
        '<div><strong>🌿 Feuille :</strong> Sprint 3x (2s) + mur de branches (4s). <em>🌟 Évo :</em> sprint <strong>4.2x (3.5s)</strong> + mur géant <strong>8s</strong> qui <strong>bloque totalement la vue</strong>.</div>' +
        '<div><strong>💧 Eau :</strong> Vague frontale (repousse + bouclier Feu). <em>🌟 Évo :</em> <strong>360°</strong>, portée +45% + <strong>rappel [R]</strong>.</div>',
      items: [
        {
          key: 'ultFireFired',
          label: '🔥 Feu : Rayon Plasma (Gauche G · [1])',
          overhead:
            state.controlledRole !== 'G'
              ? isMob
                ? 'Tapez Gauche (G) pour 🔥 Feu'
                : isMoba
                ? 'Appuyez sur [1] pour 🔥 Gauche (G)'
                : 'Prenez 🔥 Gauche (G · [1])'
              : isMob
              ? 'Maintenez ⚡ Ult et visez Adv D'
              : '🔥 Feu : [R] puis Clic Gauche vers Adv D'
        },
        {
          key: 'ultWaterFired',
          label: '💧 Eau : Vague Déferlante (Centre C · [2])',
          overhead:
            state.controlledRole !== 'C'
              ? isMob
                ? 'Tapez Centre (C) pour 💧 Eau'
                : isMoba
                ? 'Appuyez sur [2] pour 💧 Centre (C)'
                : 'Prenez 💧 Centre (C · [2])'
              : isMob
              ? 'Maintenez ⚡ Ult et visez Adv D'
              : '💧 Eau : [R] puis Clic Gauche (Vague)'
        },
        {
          key: 'ultLeafFired',
          label: '🌿 Feuille : Sprint + Mur (Droit D · [3])',
          overhead:
            state.controlledRole !== 'D'
              ? isMob
                ? 'Tapez Droit (D) pour 🌿 Feuille'
                : isMoba
                ? 'Appuyez sur [3] pour 🌿 Droit (D)'
                : 'Prenez 🌿 Droit (D · [3])'
              : isMob
              ? 'Lancez ⚡ Ult puis courez pour tracer un mur !'
              : '🌿 Feuille : [R] + Clic G puis bougez pour tracer un mur !'
        }
      ]
    },
    8: {
      title: '8/8 — Vue MOBA 🦅',
      desc: isMob
        ? 'Basculez en vue MOBA (🎥 TPS → 🦅 MOBA) puis utilisez le stick gauche pour bouger !'
        : `Basculez en vue MOBA [M] (ou 🎥 Vue), déplacez-vous au ${moveClickLbl} — et utilisez [1/2/3] (sans clic) pour Gauche / Centre / Droit !`,
      items: [
        {
          key: 'mobaToggled',
          label: isMob ? 'Activer Vue MOBA (🎥 TPS)' : 'Activer Vue MOBA ([M] / 🎥 Vue)',
          overhead: isMob ? '🎯 Taper 🎥 TPS pour passer en 🦅 MOBA' : '🎯 Activer la Vue MOBA [M] ou [🎥 Vue]'
        },
        {
          key: 'mobaMoved',
          label: isMob ? 'Déplacer au stick gauche' : `Se déplacer au [${moveClickLbl}]`,
          overhead: isMob ? '🎯 Utiliser le stick gauche pour bouger !' : `🎯 ${moveClickLbl} au sol pour vous déplacer !`
        }
      ]
    }
  };
  return defs[step];
}

export function getNextTutorialObjectiveItem() {
  if (state.mode !== 'tutorial' || state.phase !== 'play' || state.tutorialIntroVisible) return null;
  const step = Math.min(TUTORIAL_TOTAL_STEPS, Math.max(1, state.tutorialStep || 1));
  const def = getTutorialStepDef(step);
  if (!def) return null;
  const next = def.items.find((it) => !state.tutorialChecklist[it.key]);
  return next ? { ...next, stepTitle: def.title } : null;
}

function showTutorialIntroOverlay(kind = 'welcome') {
  tutorialIntroKind = kind === 'ult' ? 'ult' : 'welcome';
  pendingTutorialIntro = false;
  state.tutorialIntroVisible = true;
  unlockPointer();

  const introEl = document.getElementById('tutorial-intro-overlay');
  const cardEl = introEl ? introEl.querySelector('.tutorial-intro-card') : null;
  const welcomePane = document.getElementById('tut-intro-pane-welcome');
  const ultPane = document.getElementById('tut-intro-pane-ult');
  const startBtn = document.getElementById('btn-tut-intro-start');

  if (welcomePane) welcomePane.classList.toggle('hidden', tutorialIntroKind !== 'welcome');
  if (ultPane) ultPane.classList.toggle('hidden', tutorialIntroKind !== 'ult');
  if (cardEl) cardEl.classList.toggle('tut-intro-ult', tutorialIntroKind === 'ult');
  if (startBtn) {
    startBtn.textContent =
      tutorialIntroKind === 'ult' ? '⚡ Essayer les 3 Ultimates !' : "▶ C'est parti !";
  }
  if (introEl) introEl.classList.remove('hidden');
}

export function dismissTutorialIntro() {
  pendingTutorialIntro = false;
  const introEl = document.getElementById('tutorial-intro-overlay');
  if (introEl) introEl.classList.add('hidden');
  const wasVisible = !!state.tutorialIntroVisible;
  state.tutorialIntroVisible = false;
  if (state.mode === 'tutorial' && state.phase === 'play') {
    if (!state.mobileMode) {
      const controlsHelp = document.getElementById('controls-help');
      if (controlsHelp) controlsHelp.classList.remove('collapsed-submenu');
    }
    if (wasVisible && tutorialIntroKind === 'ult' && state.tutorialStep === TUTORIAL_STEPS.ULTIMATE) {
      showToast(
        state.mobileMode
          ? '🔥 <strong>1/3 — Ultimate Feu (Gauche G) :</strong> (Débloqué à la <strong>2e ronde</strong> en match) Maintenez <strong>⚡ Ult</strong> pour viser vers <strong>Adv D</strong> puis relâchez !'
          : '🔥 <strong>1/3 — Ultimate Feu (Gauche G) :</strong> (Débloqué à la <strong>2e ronde</strong> en match) Appuyez sur <strong>[R]</strong> pour viser le Rayon Plasma vers <strong>Adv D</strong> puis <strong>Clic Gauche</strong> !',
        5000
      );
    } else if (wasVisible && state.tutorialStep === 1) {
      showToast(
        state.mobileMode
          ? '🎓 <strong>Étape 1/8 :</strong> Avancez au stick gauche jusqu’à la balise bleue pour débloquer le <strong>Dash</strong> !'
          : '🎓 <strong>Étape 1/8 :</strong> Avancez jusqu’à la balise bleue pour débloquer le <strong>Dash</strong> !',
        3400
      );
    }
    if (!state.mobileMode && state.cameraMode === 'tps') {
      lockPointerIfPlaying(true);
      lockPointerIfPlaying();
    }
    updateTutorialSequenceHUD();
    updateTopHUD();
  }
}

function ensureTutorialBeacon() {
  if (tutorialBeaconGroup) return tutorialBeaconGroup;
  tutorialBeaconGroup = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 3.0, 40),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 2.2, 6.5, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 3.25;
  tutorialBeaconGroup.add(ring);
  tutorialBeaconGroup.add(beam);
  tutorialBeaconGroup.visible = false;
  scene.add(tutorialBeaconGroup);
  return tutorialBeaconGroup;
}

function updateTutorialBeaconTarget() {
  const beacon = ensureTutorialBeacon();
  if (state.mode !== 'tutorial' || state.phase !== 'play') {
    beacon.visible = false;
    return;
  }
  if (state.tutorialStep === TUTORIAL_STEPS.MOVEMENT) {
    if (!state.tutorialChecklist.movedToBeacon) {
      beacon.visible = true;
      beacon.position.set(-12, 0.1, FIELD.laneTopZ);
    } else if (state.tutorialChecklist.switchedRole && !state.tutorialChecklist.returnedToFirstRole) {
      const allyG = getPlayer('ally', 'G');
      if (allyG) {
        beacon.visible = true;
        beacon.position.set(allyG.pos.x, Math.max(0.1, allyG.pos.y + 0.1), allyG.pos.z);
      } else {
        beacon.visible = false;
      }
    } else {
      beacon.visible = false;
    }
  } else if (state.tutorialStep === TUTORIAL_STEPS.GOAL) {
    const me = getPlayer('ally', state.controlledRole);
    if (me && me.carryingBall) {
      beacon.visible = true;
      beacon.position.set(FIELD.enemyGoalX, 0.1, 0);
    } else {
      beacon.visible = true;
      const targetBall = balls.find((b) => !b.tutorialHidden && b.state !== 'scored' && me && b.color === me.color) || balls[0];
      beacon.position.set(targetBall ? targetBall.pos.x : 0, 0.1, targetBall ? targetBall.pos.z : FIELD.laneTopZ);
    }
  } else if (state.tutorialStep === TUTORIAL_STEPS.PASS) {
    if (!state.tutorialChecklist.pickedPassBall) {
      beacon.visible = true;
      const targetBall = balls[0];
      beacon.position.set(targetBall ? targetBall.pos.x : -14, 0.1, targetBall ? targetBall.pos.z : FIELD.laneTopZ);
    } else if (!state.tutorialChecklist.passedBall) {
      const allyC = getPlayer('ally', 'C');
      if (allyC) {
        beacon.visible = true;
        beacon.position.set(allyC.pos.x, Math.max(0.1, allyC.pos.y + 0.1), allyC.pos.z);
      } else {
        beacon.visible = false;
      }
    } else {
      beacon.visible = false;
    }
  } else if (state.tutorialStep === TUTORIAL_STEPS.TRIANGLE && !state.tutorialChecklist.intercepted) {
    beacon.visible = true;
    const eTarget = getPlayer('enemy', 'D') || players.find((p) => !p.tutorialHidden && p.team === 'enemy' && p.state === 'standing');
    beacon.position.set(eTarget ? eTarget.pos.x : 12, 0.1, eTarget ? eTarget.pos.z : FIELD.laneTopZ);
  } else if (state.tutorialStep === TUTORIAL_STEPS.RULE1) {
    if (!state.tutorialChecklist.rule1Locked) {
      const enemyC = getPlayer('enemy', 'C');
      beacon.visible = !!enemyC;
      if (enemyC) beacon.position.set(enemyC.pos.x, Math.max(0.1, enemyC.pos.y + 0.1), enemyC.pos.z);
    } else if (!state.tutorialChecklist.rule1Switched) {
      const allyC = getPlayer('ally', 'C');
      beacon.visible = !!allyC;
      if (allyC) beacon.position.set(allyC.pos.x, Math.max(0.1, allyC.pos.y + 0.1), allyC.pos.z);
    } else if (!state.tutorialChecklist.rule1Broken) {
      const enemyC = getPlayer('enemy', 'C');
      beacon.visible = !!enemyC;
      if (enemyC) beacon.position.set(enemyC.pos.x, Math.max(0.1, enemyC.pos.y + 0.1), enemyC.pos.z);
    } else {
      beacon.visible = false;
    }
  } else {
    beacon.visible = false;
  }
}

function updateTutorialSequenceHUD() {
  const hud = document.getElementById('tutorial-sequence-hud');
  if (!hud) return;
  const active = state.mode === 'tutorial' && state.phase === 'play';
  hud.classList.toggle('hidden', !active);
  if (!active) {
    const oh = document.getElementById('tut-overhead-objective');
    if (oh) oh.classList.add('hidden');
    return;
  }

  const step = Math.min(TUTORIAL_TOTAL_STEPS, Math.max(1, state.tutorialStep || 1));
  const def = getTutorialStepDef(step);
  const titleEl = document.getElementById('tut-step-title');
  const descEl = document.getElementById('tut-step-desc');
  const extraEl = document.getElementById('tut-step-extra');
  const listEl = document.getElementById('tut-checklist');
  const pillsEl = document.getElementById('tut-steps-bar');
  const btnShop = document.getElementById('btn-tut-open-shop');
  const btnRefUlt = document.getElementById('btn-tut-refresh-ult');
  const btnToPractice = document.getElementById('btn-tut-to-practice');
  const btnNext = document.getElementById('btn-tut-next');

  if (titleEl) titleEl.textContent = def.title;
  if (descEl) descEl.textContent = def.desc;
  if (extraEl) {
    if (def.extraHtml) {
      extraEl.innerHTML = def.extraHtml;
      extraEl.classList.remove('hidden');
    } else {
      extraEl.innerHTML = '';
      extraEl.classList.add('hidden');
    }
  }

  if (pillsEl && pillsEl.children) {
    Array.from(pillsEl.children).forEach((pill) => {
      const pStep = Number(pill.getAttribute('data-tut-step'));
      pill.classList.toggle('active', pStep === step);
      pill.classList.toggle('completed', pStep < step);
    });
  }

  if (listEl) {
    listEl.innerHTML = '';
    const nextIdx = def.items.findIndex((it) => !state.tutorialChecklist[it.key]);
    def.items.forEach((item, idx) => {
      const done = !!state.tutorialChecklist[item.key];
      const isCurrent = idx === nextIdx;
      const row = document.createElement('div');
      row.className = `tut-check-item${done ? ' done' : isCurrent ? ' current' : ''}`;
      row.textContent = `${done ? '✔' : isCurrent ? '▶' : '○'} ${item.label}`;
      listEl.appendChild(row);
    });
  }

  if (btnShop) btnShop.classList.toggle('hidden', !(step === TUTORIAL_STEPS.TOOLS && !state.tutorialChecklist.toolBought));
  if (btnRefUlt) btnRefUlt.classList.toggle('hidden', step !== TUTORIAL_STEPS.ULTIMATE);
  if (btnToPractice) btnToPractice.classList.toggle('hidden', step === TUTORIAL_TOTAL_STEPS);
  if (btnNext) {
    const ready = !!state.tutorialAwaitingConfirm;
    btnNext.classList.toggle('tut-next-ready', ready);
    if (ready) {
      btnNext.textContent =
        step < TUTORIAL_TOTAL_STEPS
          ? state.mobileMode
            ? 'Continuer ▶'
            : 'Continuer [Espace] ▶'
          : state.mobileMode
          ? 'Mode Pratique ▶'
          : 'Mode Pratique [Espace] ▶';
    } else {
      btnNext.textContent = step < TUTORIAL_TOTAL_STEPS ? 'Suivant ▶' : '🧪 Mode Pratique ▶';
    }
  }
}

export function completeTutorialToPractice(withCongrats = true) {
  if (tutorialAutoAdvanceTimer) {
    clearTimeout(tutorialAutoAdvanceTimer);
    tutorialAutoAdvanceTimer = null;
  }
  if (tutorialFinishTimer) {
    clearTimeout(tutorialFinishTimer);
    tutorialFinishTimer = null;
  }
  if (tutorialShopAutoReturnTimer) {
    clearTimeout(tutorialShopAutoReturnTimer);
    tutorialShopAutoReturnTimer = null;
  }
  if (tutorialUltRecoverTimer) {
    clearTimeout(tutorialUltRecoverTimer);
    tutorialUltRecoverTimer = null;
  }
  pendingTutorialIntro = false;
  setTutorialShopGuideStep(0);
  if (tutorialBeaconGroup) tutorialBeaconGroup.visible = false;

  const tutHud = document.getElementById('tutorial-sequence-hud');
  if (tutHud) tutHud.classList.add('hidden');
  const tutOh = document.getElementById('tut-overhead-objective');
  if (tutOh) tutOh.classList.add('hidden');
  const controlsHelp = document.getElementById('controls-help');
  if (controlsHelp) controlsHelp.classList.add('collapsed-submenu');
  const tutIntro = document.getElementById('tutorial-intro-overlay');
  if (tutIntro) tutIntro.classList.add('hidden');
  const r1Alert = document.getElementById('rule1-alert');
  if (r1Alert) r1Alert.classList.add('hidden');
  const practiceBar = document.getElementById('practice-menu-bar');
  if (practiceBar) practiceBar.classList.add('hidden');
  const endRoundBtn = document.getElementById('btn-end-round');
  if (endRoundBtn) endRoundBtn.classList.add('hidden');
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

  const customSpawns = FIELD.playerSpawns;
  const wingX = Math.round(FIELD.width * (46 / DEFAULT_FIELD_CONFIG.width));
  const centerX = Math.round(FIELD.width * (74 / DEFAULT_FIELD_CONFIG.width));
  const resetSpawnPos = (teamKey, roleKey, defaultX, defaultZ, defaultFacing) => {
    const pl = getPlayer(teamKey, roleKey);
    if (!pl) return null;
    const cs = customSpawns && customSpawns[teamKey] && customSpawns[teamKey][roleKey];
    const rx = cs ? cs.x : defaultX;
    const rz = cs ? cs.z : defaultZ;
    const ry = getTerrainY(rx, rz, state.mapId);
    pl.pos.set(rx, ry, rz);
    pl.targetPos.copy(pl.pos);
    pl.facingAngle = cs ? cs.facing : defaultFacing;
    pl.targetFacingAngle = pl.facingAngle;
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
    p.ultUsed = false;
    p.ultShotsUsed = 0;
    p.ultCooldown = 0;
    p.activeReactivableWave = null;
    p.leafUltTimer = 0;
    p.waterShieldTimer = 0;
    p.dashCooldown = 0;
    p.dashTimer = 0;
    p.jumpCooldown = 0;
    p.toolCooldown = 0;
    p.boomerangWindow = 0;
    p.boomerangOrigin = null;
    p.jumpMomentumVx = 0;
    p.jumpMomentumVz = 0;
    p.dashMomentumGrace = 0;
    p.lastDashVx = 0;
    p.lastDashVz = 0;

    const teamMeta = state.teams[p.team];
    if (teamMeta && teamMeta.prepColors && teamMeta.prepColors[p.role]) {
      applyPlayerColor(p, teamMeta.prepColors[p.role]);
    }
    p.revealedTo = {
      ally: p.team === 'ally',
      enemy: p.team === 'enemy'
    };
    p.visibleTo = {
      ally: p.team === 'ally',
      enemy: p.team === 'enemy'
    };
    p.backRevealed = p.team === state.myTeam;
    p.currentlySeeingBack = p.team === state.myTeam;
    syncPlayerPowerVisuals(p, 0);

    if (prevHiddenIds.has(p.id) || p === enemyD) {
      spawnParticles(p.pos, COLORS[p.color].hex, 14);
    }
  });

  balls.forEach((b, idx) => {
    b.state = 'ground';
    b.carrier = null;
    b.thrownByTeam = null;
    b.thrownById = null;
    b.passTargetId = null;
    b.passIgnoreTimer = 0;
    b.onCanopy = false;
    const customSpawn = Array.isArray(FIELD.ballSpawns) && FIELD.ballSpawns[idx];
    const spawnX = customSpawn ? customSpawn.x : 0;
    const spawnZ = customSpawn ? customSpawn.z : (idx === 0 ? FIELD.laneTopZ : FIELD.laneBotZ);
    const spawnY = getTerrainY(spawnX, spawnZ, state.mapId) + 0.52;
    b.pos.set(spawnX, spawnY, spawnZ);
    b.targetPos.copy(b.pos);
    b.vel.set(0, 0, 0);
    applyBallColor(b, state.drawnBalls[idx]);
    if (b.mesh && b.mesh.group) b.mesh.group.position.copy(b.pos);
    spawnParticles(b.pos, COLORS[b.color].hex, 14);
  });

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

export function advanceTutorialStep() {
  if (state.mode !== 'tutorial' || state.phase !== 'play') return false;
  if (state.tutorialStep < TUTORIAL_TOTAL_STEPS) {
    enterTutorialStep(state.tutorialStep + 1);
  } else {
    completeTutorialToPractice(true);
  }
  return true;
}

function evaluateTutorialStepCompletion() {
  if (state.mode !== 'tutorial' || state.phase !== 'play') return;
  const step = state.tutorialStep;
  const def = getTutorialStepDef(step);
  if (!def) return;
  const allDone = def.items.every((it) => !!state.tutorialChecklist[it.key]);
  if (allDone && !state.tutorialAwaitingConfirm) {
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
}

export function markTutorialCheck(key) {
  if (state.mode !== 'tutorial') return;
  if (state.phase !== 'play' && key !== 'toolBought') return;
  const wasAlreadyDone = !!state.tutorialChecklist[key];
  state.tutorialChecklist[key] = true;
  if (!wasAlreadyDone) ctx.api.playSfx?.('tut_check');

  if (!wasAlreadyDone && state.tutorialStep === TUTORIAL_STEPS.MOVEMENT) {
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
  } else if (!wasAlreadyDone && state.tutorialStep === TUTORIAL_STEPS.TRIANGLE && key === 'backSeen' && !state.tutorialChecklist.intercepted) {
    showToast(
      '👀 <strong>Dos vu : 🌿 Feuille !</strong> Votre <strong>🔥 Feu</strong> gagne contre 🌿 Feuille : <strong>touchez-la pour l’intercepter</strong> (+1 🪙 PO) !',
      4200
    );
  } else if (!wasAlreadyDone && state.tutorialStep === TUTORIAL_STEPS.ULTIMATE) {
    const isMob = !!state.mobileMode;
    const isMoba = state.cameraMode === 'aerial';
    const waterPrompt = isMob
      ? '💧 <strong>2/3 — Ultimate Eau (Centre C) :</strong> Tapez <strong>C</strong> en bas puis maintenez <strong>⚡ Ult</strong> pour lancer la <strong>Vague Déferlante</strong> (repousse + bouclier contre le Feu) !'
      : `💧 <strong>2/3 — Ultimate Eau (Centre C) :</strong> Appuyez sur <strong>[2]</strong>${isMoba ? '' : ' (ou Clic)'} puis <strong>[R] + Clic Gauche</strong> pour lancer la <strong>Vague Déferlante</strong> (repousse + bouclier contre le Feu) !`;
    const leafPrompt = isMob
      ? '🌿 <strong>3/3 — Ultimate Feuille (Droit D) :</strong> Tapez <strong>D</strong> en bas, lancez <strong>⚡ Ult</strong> puis courez pour tracer un <strong>mur de branches</strong> !'
      : `🌿 <strong>3/3 — Ultimate Feuille (Droit D) :</strong> Appuyez sur <strong>[3]</strong>${isMoba ? '' : ' (ou Clic)'}, lancez <strong>[R] + Clic Gauche</strong> puis bougez pour tracer un <strong>mur de branches</strong> !`;
    const firePrompt = isMob
      ? '🔥 <strong>Ultimate Feu (Gauche G) :</strong> Tapez <strong>G</strong> en bas puis maintenez <strong>⚡ Ult</strong> vers <strong>Adv D</strong> !'
      : `🔥 <strong>Ultimate Feu (Gauche G) :</strong> Appuyez sur <strong>[1]</strong>${isMoba ? '' : ' (ou Clic)'} puis <strong>[R] + Clic Gauche</strong> vers <strong>Adv D</strong> !`;

    if (key === 'ultFireFired') {
      if (tutorialUltRecoverTimer) clearTimeout(tutorialUltRecoverTimer);
      tutorialUltRecoverTimer = setTimeout(() => {
        tutorialUltRecoverTimer = null;
        if (state.mode === 'tutorial' && state.phase === 'play' && state.tutorialStep === TUTORIAL_STEPS.ULTIMATE) {
          const enemyD = getPlayer('enemy', 'D');
          if (enemyD && enemyD.state === 'sitting') {
            enemyD.state = 'standing';
            enemyD.pos.set(10, getTerrainY(10, 0, state.mapId), 0);
            enemyD.vel.set(0, 0, 0);
            enemyD.targetPos.copy(enemyD.pos);
            spawnParticles(enemyD.pos, 0xfacc15, 12);
            updateRosterHUD();
          }
        }
      }, 1800);
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

  if (key === 'rule1Locked' && state.tutorialStep === TUTORIAL_STEPS.RULE1) {
    updateRosterHUD();
    updateMobileTouchHUD();
  }

  if (key === 'toolBought' && state.tutorialStep === TUTORIAL_STEPS.TOOLS && state.phase === 'prep') {
    setTutorialShopGuideStep(0);
    if (tutorialShopAutoReturnTimer) clearTimeout(tutorialShopAutoReturnTimer);
    showToast('✔ <strong>Outil acheté !</strong> Retour sur le terrain...', 1400);
    tutorialShopAutoReturnTimer = setTimeout(() => {
      tutorialShopAutoReturnTimer = null;
      if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.TOOLS && state.phase === 'prep') {
        startRoundExecution();
      }
    }, 650);
  }

  updateTutorialSequenceHUD();
  updateTutorialBeaconTarget();
  evaluateTutorialStepCompletion();
}

export function enterTutorialStep(stepNum) {
  if (tutorialAutoAdvanceTimer) {
    clearTimeout(tutorialAutoAdvanceTimer);
    tutorialAutoAdvanceTimer = null;
  }
  if (tutorialFinishTimer) {
    clearTimeout(tutorialFinishTimer);
    tutorialFinishTimer = null;
  }
  if (tutorialShopAutoReturnTimer) {
    clearTimeout(tutorialShopAutoReturnTimer);
    tutorialShopAutoReturnTimer = null;
  }
  if (tutorialUltRecoverTimer) {
    clearTimeout(tutorialUltRecoverTimer);
    tutorialUltRecoverTimer = null;
  }
  const step = Math.min(TUTORIAL_TOTAL_STEPS, Math.max(1, Number(stepNum) || 1));
  state.tutorialStep = step;
  state.tutorialChecklist = {};
  state.tutorialAwaitingConfirm = false;
  state.ultPreviewActive = false;
  hideUltimatePreview();

  const r1Alert = document.getElementById('rule1-alert');
  if (r1Alert) r1Alert.classList.add('hidden');

  if (step > 1 && state.tutorialIntroVisible) {
    state.tutorialIntroVisible = false;
    pendingTutorialIntro = false;
    const introEl = document.getElementById('tutorial-intro-overlay');
    if (introEl) introEl.classList.add('hidden');
  }

  if (step < TUTORIAL_STEPS.MOBA && state.cameraMode === 'aerial') {
    setCameraMode('tps', true);
  }

  applyRoundSetupPositions();
  const allyG = getPlayer('ally', 'G');
  const allyC = getPlayer('ally', 'C');
  const allyD = getPlayer('ally', 'D');
  const enemyD = getPlayer('enemy', 'D');
  const enemyC = getPlayer('enemy', 'C');
  state.teams.ally.prepColors = { G: 'red', C: 'blue', D: 'green' };
  state.teams.enemy.prepColors = { D: 'green', G: 'blue', C: 'red' };
  if (allyG) applyPlayerColor(allyG, 'red');
  if (allyC) applyPlayerColor(allyC, 'blue');
  if (allyD) applyPlayerColor(allyD, 'green');
  if (enemyD) applyPlayerColor(enemyD, 'green');
  if (enemyC) applyPlayerColor(enemyC, 'red');

  const moveClickLbl = state.mobaMoveButton === 'left' ? 'Clic Gauche' : 'Clic Droit';

  if (step === TUTORIAL_STEPS.MOVEMENT) {
    selectControlledRole('G', { silent: true, force: true });
    state.camYaw = -Math.PI / 2;
    if (!state.tutorialIntroVisible) {
      showToast(
        state.mobileMode
          ? '🎓 <strong>Étape 1/8 :</strong> Avancez au stick gauche jusqu’à la balise bleue pour débloquer le <strong>Dash</strong> !'
          : '🎓 <strong>Étape 1/8 :</strong> Avancez jusqu’à la balise bleue pour débloquer le <strong>Dash</strong> !',
        3400
      );
    }
  } else if (step === TUTORIAL_STEPS.GOAL) {
    if (state.controlledRole !== 'G') {
      selectControlledRole('G', { silent: true, force: true });
    }
    state.camYaw = -Math.PI / 2;
    showToast('⚽ <strong>Étape 2/8 :</strong> Prenez le ballon <strong>🔥 Rouge</strong> devant vous et marquez à droite !', 3600);
  } else if (step === TUTORIAL_STEPS.PASS) {
    const ball0 = balls[0];
    if (ball0) {
      ball0.state = 'ground';
      ball0.carrier = null;
      ball0.thrownByTeam = null;
      ball0.thrownById = null;
      ball0.passTargetId = null;
      ball0.passIgnoreTimer = 0;
      ball0.onCanopy = false;
      ball0.pos.set(-14, 0.52, FIELD.laneTopZ);
      ball0.targetPos.copy(ball0.pos);
      ball0.vel.set(0, 0, 0);
    }
    if (allyC) {
      allyC.pos.set(8, 0, FIELD.laneTopZ + 5);
      allyC.targetPos.copy(allyC.pos);
      allyC.facingAngle = -Math.PI / 2;
      allyC.targetFacingAngle = allyC.facingAngle;
    }
    if (state.controlledRole !== 'G') {
      selectControlledRole('G', { silent: true, force: true });
    }
    state.camYaw = -Math.PI / 2;
    showToast(
      state.mobileMode
        ? '🎯 <strong>Étape 3/8 — Passes :</strong> Prenez le ballon <strong>🔥 Rouge</strong>, puis maintenez <strong>⚽ Passe</strong> et visez <strong>💧 Centre (C)</strong> !'
        : '🎯 <strong>Étape 3/8 — Passes :</strong> Prenez le ballon <strong>🔥 Rouge</strong>, puis maintenez <strong>[E]</strong> en visant <strong>💧 Centre (C)</strong> !',
      4400
    );
  } else if (step === TUTORIAL_STEPS.TRIANGLE) {
    state.allyPE = 0;
    if (enemyD) {
      enemyD.pos.set(12, 0, FIELD.laneTopZ);
      enemyD.targetPos.copy(enemyD.pos);
      enemyD.facingAngle = -Math.PI / 2;
      enemyD.targetFacingAngle = enemyD.facingAngle;
    }
    if (state.controlledRole !== 'G') {
      selectControlledRole('G', { silent: true, force: true });
    }
    state.camYaw = -Math.PI / 2;
    showToast(
      '🔺 <strong>Étape 4/8 — Interception :</strong> Passez derrière <strong>Adv D</strong> pour voir son dos (?). Comme <strong>🔥 Feu gagne contre 🌿 Feuille</strong>, il suffit ensuite de la <strong>toucher</strong> (+1 🪙 PO) !',
      4600
    );
  } else if (step === TUTORIAL_STEPS.RULE1) {
    if (allyG) {
      allyG.pos.set(-16, 0, FIELD.laneTopZ);
      allyG.targetPos.copy(allyG.pos);
      allyG.facingAngle = Math.PI / 2;
      allyG.targetFacingAngle = allyG.facingAngle;
    }
    if (enemyC) {
      enemyC.pos.set(-4, 0, FIELD.laneTopZ);
      enemyC.targetPos.copy(enemyC.pos);
      enemyC.facingAngle = -Math.PI / 2;
      enemyC.targetFacingAngle = enemyC.facingAngle;
    }
    if (allyC) {
      allyC.pos.set(-22, 0, FIELD.laneTopZ + 12);
      allyC.targetPos.copy(allyC.pos);
      allyC.facingAngle = Math.atan2(-4 - (-22), FIELD.laneTopZ - (FIELD.laneTopZ + 12));
      allyC.targetFacingAngle = allyC.facingAngle;
    }
    if (allyD) {
      allyD.pos.set(-22, 0, FIELD.laneTopZ - 8);
      allyD.targetPos.copy(allyD.pos);
      allyD.facingAngle = Math.atan2(-4 - (-22), FIELD.laneTopZ - (FIELD.laneTopZ - 8));
      allyD.targetFacingAngle = allyD.facingAngle;
    }
    if (state.controlledRole !== 'G') {
      selectControlledRole('G', { silent: true, force: true });
    }
    state.camYaw = -Math.PI / 2;
    showToast(
      '❓ <strong>Étape 5/8 :</strong> Voyez ce qui se passe si vous touchez quelqu’un de la <strong>même couleur</strong> : allez toucher <strong>Adv C (🔥)</strong> !',
      4800
    );
  } else if (step === TUTORIAL_STEPS.TOOLS) {
    state.teams.ally.powers.G.toolEvo = null;
    if (allyG) syncPlayerPowerVisuals(allyG, 0);
    state.allyPE = Math.max(3, state.allyPE);
    if (enemyD) {
      enemyD.pos.set(12, 0, FIELD.laneTopZ);
      enemyD.targetPos.copy(enemyD.pos);
      enemyD.facingAngle = -Math.PI / 2;
      enemyD.targetFacingAngle = enemyD.facingAngle;
    }
    if (state.controlledRole !== 'G') {
      selectControlledRole('G', { silent: true, force: true });
    }
    state.camYaw = -Math.PI / 2;
    showToast(
      state.mobileMode
        ? '🛠️ <strong>Étape 6/8 — Outils :</strong> Ouvrez <strong>🛒 Boutique</strong> pour découvrir le magasin, achetez un outil pour <strong>Gauche (G)</strong> puis déployez-le (sans balle) !'
        : '🛠️ <strong>Étape 6/8 — Outils :</strong> Ouvrez la Boutique <strong>[B]</strong> pour suivre le guide du magasin, achetez un outil pour <strong>Gauche (G)</strong> puis déployez-le avec <strong>[E]</strong> !',
      4800
    );
  } else if (step === TUTORIAL_STEPS.ULTIMATE) {
    clearAllUltimates();
    [allyG, allyC, allyD, enemyD].forEach((pl) => {
      if (!pl) return;
      pl.ultUsed = false;
      pl.ultCooldown = 0;
      pl.ultShotsUsed = 0;
      pl.leafUltTimer = 0;
      pl.waterShieldTimer = 0;
      pl.state = 'standing';
    });
    if (allyG) {
      allyG.pos.set(-12, 0, -6);
      allyG.targetPos.copy(allyG.pos);
      allyG.facingAngle = Math.atan2(22, 6);
      allyG.targetFacingAngle = allyG.facingAngle;
    }
    if (allyC) {
      allyC.pos.set(-12, 0, 0);
      allyC.targetPos.copy(allyC.pos);
      allyC.facingAngle = Math.PI / 2;
      allyC.targetFacingAngle = allyC.facingAngle;
    }
    if (allyD) {
      allyD.pos.set(-12, 0, 6);
      allyD.targetPos.copy(allyD.pos);
      allyD.facingAngle = Math.atan2(22, -6);
      allyD.targetFacingAngle = allyD.facingAngle;
    }
    if (enemyD) {
      enemyD.pos.set(10, 0, 0);
      enemyD.targetPos.copy(enemyD.pos);
      enemyD.facingAngle = -Math.PI / 2;
      enemyD.targetFacingAngle = enemyD.facingAngle;
    }
    if (state.controlledRole !== 'G') {
      selectControlledRole('G', { silent: true, force: true });
    }
    state.camYaw = -Math.PI / 2;
    showTutorialIntroOverlay('ult');
  } else if (step === TUTORIAL_STEPS.MOBA) {
    clearAllUltimates();
    if (state.cameraMode === 'aerial') {
      setCameraMode('tps', true);
    }
    if (enemyD) {
      enemyD.pos.set(12, 0, FIELD.laneTopZ);
      enemyD.targetPos.copy(enemyD.pos);
      enemyD.facingAngle = -Math.PI / 2;
      enemyD.targetFacingAngle = enemyD.facingAngle;
    }
    if (state.controlledRole !== 'G') {
      selectControlledRole('G', { silent: true, force: true });
    }
    state.camYaw = -Math.PI / 2;
    showToast(
      state.mobileMode
        ? '🦅 <strong>Étape 8/8 — Vue MOBA !</strong> Tapez <strong>🎥 TPS</strong> en haut puis déplacez-vous avec le <strong>stick gauche</strong> !'
        : `🦅 <strong>Étape 8/8 — Vue MOBA !</strong> Appuyez sur <strong>[M]</strong> (ou <strong>🎥 Vue</strong>) puis faites un <strong>${moveClickLbl}</strong> au sol !`,
      4200
    );
  }

  syncTutorialEntityVisibility();
  updateTeamVisionState(true);
  updateTutorialSequenceHUD();
  updateTutorialBeaconTarget();
  updateTopHUD();
  updateRosterHUD();
  updateUltHudWidget();
  updateMobileTouchHUD();
}

function clearTutorialShopHighlights() {
  document.querySelectorAll('#prep-modal .tut-shop-highlight').forEach((el) => {
    el.classList.remove('tut-shop-highlight');
  });
}

export function updateTutorialShopGuideUI() {
  const guideEl = document.getElementById('tutorial-shop-guide');
  if (!guideEl) return;
  clearTutorialShopHighlights();

  const step = state.mode === 'tutorial' ? Number(state.tutorialShopGuideStep) || 0 : 0;
  if (step < 1 || step > 3) {
    guideEl.classList.add('hidden');
    return;
  }

  guideEl.classList.remove('hidden');
  const badgeEl = document.getElementById('tut-shop-guide-badge');
  const titleEl = document.getElementById('tut-shop-guide-title');
  const bodyEl = document.getElementById('tut-shop-guide-body');
  const prevBtn = document.getElementById('btn-tut-shop-prev');
  const nextBtn = document.getElementById('btn-tut-shop-next');

  const steps = {
    1: {
      badge: '🎓 Guide du Magasin (1/3)',
      title: '⚽ Corridors des ballons',
      body: 'En haut, vous voyez la couleur des <strong>2 ballons</strong> tirés pour la ronde : le <strong>Couloir Gauche</strong> (en face de <strong>Gauche G</strong>) et le <strong>Couloir Droit</strong> (en face de <strong>Droit D</strong>). Répartissez vos dossards ci-dessous selon ces corridors !',
      nextLabel: 'Suivant (Sections) ▶'
    },
    2: {
      badge: '🎓 Guide du Magasin (2/3)',
      title: '📑 Sections du Magasin',
      body: 'Le menu est divisé en <strong>3 sections</strong> : <strong>🎽 1. Dossards (G / C / D)</strong> pour choisir vos éléments, <strong>⚡ 2. Pouvoirs Individuels</strong> (Actions de base, <strong>🌟 Ult Évolué</strong>, <strong>💨 Évos Dash</strong> et <strong>🛠️ Outils</strong>) et <strong>🛡️ 3. Bonus d’Équipe</strong> (Dossard +, Dash+, Saut).',
      nextLabel: 'Suivant (Trouver les Outils) ▶'
    },
    3: {
      badge: '🎓 Guide du Magasin (3/3)',
      title: '🛠️ Où trouver les Outils',
      body: 'Les <strong>🛠️ Outils</strong> se trouvent dans l’onglet <strong>⚡ 2. Pouvoirs Individuels</strong>, tout en bas de la liste ! Cliquez sur le bouton <strong>G</strong> d’un outil en surbrillance (<strong>📡 Balise</strong>, <strong>🧱 Mur 3m</strong> ou <strong>⚡ Tapis</strong> — 3 🪙 PO) pour l’équiper sur <strong>Gauche (G)</strong>.',
      nextLabel: 'Compris ✔'
    }
  };

  const info = steps[step];
  if (badgeEl) badgeEl.textContent = info.badge;
  if (titleEl) titleEl.textContent = info.title;
  if (bodyEl) bodyEl.innerHTML = info.body;
  if (prevBtn) prevBtn.classList.toggle('hidden', step <= 1);
  if (nextBtn) nextBtn.textContent = info.nextLabel;

  if (step === 1) {
    const ballsBar = document.getElementById('prep-balls-preview-bar');
    if (ballsBar) ballsBar.classList.add('tut-shop-highlight');
  } else if (step === 2) {
    const tabsBar = document.getElementById('prep-submenu-tabs');
    if (tabsBar) tabsBar.classList.add('tut-shop-highlight');
  } else if (step === 3) {
    const toolHdr = document.querySelector('#shop-items-grid [data-shop-section="tool"]');
    if (toolHdr) {
      toolHdr.classList.add('tut-shop-highlight');
      setTimeout(() => {
        if (state.tutorialShopGuideStep === 3 && toolHdr.isConnected) {
          toolHdr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 60);
    }
    document.querySelectorAll('#shop-items-grid .shop-item.tut-shop-focus').forEach((el) => {
      el.classList.add('tut-shop-highlight');
    });
  }
}

export function setTutorialShopGuideStep(stepNum) {
  const step = Math.max(0, Math.min(3, Number(stepNum) || 0));
  state.tutorialShopGuideStep = step;
  if (step === 1) {
    switchPrepSubmenu('dossards');
  } else if (step === 3) {
    switchPrepSubmenu('individual');
  }
  updateTutorialShopGuideUI();
}

export function openTutorialShopStep3() {
  if (state.mode !== 'tutorial' || state.phase !== 'play' || state.tutorialStep !== TUTORIAL_STEPS.TOOLS) return;
  if (!state.teams.ally.powers.G.toolEvo) {
    state.allyPE = Math.max(3, state.allyPE);
  }
  state.tutorialPreserveStep = true;
  unlockPointer();
  if (!state.tutorialChecklist.toolBought) {
    state.tutorialShopGuideStep = 1;
    openPrepModal({ defaultTab: 'dossards' });
  } else {
    state.tutorialShopGuideStep = 0;
    openPrepModal({ defaultTab: 'individual' });
  }
}

function resumeTutorialStep3AfterShop() {
  syncTutorialEntityVisibility();
  updateTeamVisionState(true);
  updateTutorialSequenceHUD();
  updateTutorialBeaconTarget();
  updateRosterHUD();
  updateMobileTouchHUD();
  evaluateTutorialStepCompletion();
  if (
    state.mode === 'tutorial' &&
    state.tutorialStep === TUTORIAL_STEPS.TOOLS &&
    state.tutorialChecklist.toolBought &&
    !state.tutorialChecklist.toolDeployed
  ) {
    showToast(
      state.mobileMode
        ? '🛠️ <strong>Outil équipé !</strong> Appuyez sur le <strong>bouton Outil (📡/🧱/⚡)</strong> sans balle pour le déployer !'
        : '🛠️ <strong>Outil équipé !</strong> Appuyez sur <strong>[E]</strong> (sans balle) pour le déployer sur le terrain !',
      4200
    );
  }
}

export function updateTutorialSequence(dt) {
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

// --- DÉMARRAGE DE LA PHASE D'EXÉCUTION ("AU JEU !") ---
export function startRoundExecution(fromNetwork = false) {
  if (tutorialShopAutoReturnTimer) {
    clearTimeout(tutorialShopAutoReturnTimer);
    tutorialShopAutoReturnTimer = null;
  }
  if (state.prepInterval) {
    clearInterval(state.prepInterval);
    state.prepInterval = null;
  }

  if (mp.enabled && mp.isHost) {
    resolveTeamActiveRoles('ally');
    resolveTeamActiveRoles('enemy');
    if (!fromNetwork) {
      sendNetMessage({
        type: 'MP_START_PLAY',
        gameMode: state.mode,
        vanillaMode: !!state.vanillaMode,
        mapId: state.mapId,
        round: state.round,
        teams: state.teams,
        drawnBalls: state.drawnBalls,
        allyPV: state.allyPV,
        enemyPV: state.enemyPV,
        allyPE: state.allyPE,
        enemyPE: state.enemyPE,
        members: mp.members
      });
    }
  }

  // Appliquer les couleurs choisies aux 2 équipes
  ['G', 'C', 'D'].forEach((role) => {
    const aPl = getPlayer('ally', role);
    const ePl = getPlayer('enemy', role);
    applyPlayerColor(aPl, state.teams.ally.prepColors[role]);
    applyPlayerColor(ePl, state.teams.enemy.prepColors[role]);
    if (aPl) syncPlayerPowerVisuals(aPl, 0);
    if (ePl) syncPlayerPowerVisuals(ePl, 0);
  });

  resetPointerLockFlags();
  setTutorialShopGuideStep(0);
  state.practiceShopPreservePlay = false;
  state.phase = 'play';
  ctx.api.playSfx?.('round_start');
  mp.worldSeq = 0;
  mp.lastHostWorldSeq = 0;
  mp.inputSeq = 0;

  if (mp.enabled && mp.isHost) {
    mp.remoteInputs = {};
    const initTime = performance.now();
    mp.members.forEach((m) => {
      if (m.peerId === mp.myPeerId) return;
      const initRole = getMemberControlledRole(m) || 'G';
      const rp = getPlayer(m.team, initRole);
      mp.remoteInputs[m.peerId] = {
        team: m.team,
        role: initRole,
        x: rp ? rp.pos.x : 0,
        y: rp ? rp.pos.y : 0,
        z: rp ? rp.pos.z : 0,
        vx: 0,
        vy: 0,
        vz: 0,
        oc: false,
        facingAngle: rp ? rp.facingAngle : 0,
        moveForward: 0,
        moveRight: 0,
        camYaw: rp ? rp.facingAngle + Math.PI : 0,
        seq: 0,
        lastSeen: initTime
      };
    });
  }

  const me = mp.members.find((m) => m.peerId === mp.myPeerId);
  let initialRole = state.myLockedRole;
  if (!initialRole) {
    const candidate = me && ['G', 'C', 'D'].includes(me.activeRole) ? me.activeRole : 'G';
    initialRole = !getRoleHumanController(state.myTeam, candidate)
      ? candidate
      : getAvailableRolesForTeam(state.myTeam)[0] || 'G';
  }
  state.camYaw = state.myTeam === 'ally' ? -Math.PI / 2 : Math.PI / 2;
  if (!selectControlledRole(initialRole, { silent: true, force: true })) {
    state.controlledRole = initialRole;
  }
  recenterMobaCamera(true);
  // Verrouiller la souris AVANT de masquer la modale cliquée pour conserver l'activation utilisateur, puis re-vérifier après
  state.practiceCursorFree = false;
  document.body.classList.toggle('mode-practice', state.mode === 'practice');
  document.body.classList.toggle('mode-tutorial', state.mode === 'tutorial');
  document.body.classList.remove('game-paused');

  const practiceBar = document.getElementById('practice-menu-bar');
  if (practiceBar) practiceBar.classList.add('hidden');
  const swapTeamBtn = document.getElementById('btn-practice-swap-team');
  if (swapTeamBtn) swapTeamBtn.style.display = mp.enabled ? 'none' : '';
  const endRoundBtn = document.getElementById('btn-end-round');
  if (endRoundBtn) {
    endRoundBtn.classList.toggle('hidden', state.mode === 'tutorial' || state.mode === 'practice');
  }

  const showTutIntro = state.mode === 'tutorial' && !state.tutorialPreserveStep && pendingTutorialIntro;
  const introEl = document.getElementById('tutorial-intro-overlay');
  if (showTutIntro) {
    showTutorialIntroOverlay('welcome');
    showOnlyModal(null);
  } else {
    state.tutorialIntroVisible = false;
    if (introEl) introEl.classList.add('hidden');
    lockPointerIfPlaying(true);
    showOnlyModal(null);
    lockPointerIfPlaying();
  }
  updateMapLockUI();
  updateTopHUD();
  updateRosterHUD();
  updateMobileTouchHUD();

  if (state.mode === 'tutorial') {
    if (!state.tutorialPreserveStep && !state.mobileMode) {
      const controlsHelp = document.getElementById('controls-help');
      if (controlsHelp) controlsHelp.classList.remove('collapsed-submenu');
    }
    if (state.tutorialPreserveStep) {
      state.tutorialPreserveStep = false;
      resumeTutorialStep3AfterShop();
    } else {
      enterTutorialStep(1);
    }
  } else if (state.mode === 'practice') {
    updateTutorialSequenceHUD();
    showToast(
      mp.enabled
        ? `🧘 <strong>Un tour pour rien (Pratique Multijoueur — Salon ${mp.roomCode})</strong> : Aucune IA ! <strong>[B]</strong> Magasin (🪙 ∞) • <strong>[Échap]</strong> Menu Pratique.`
        : `🧘 <strong>Un tour pour rien (Mode Pratique Solo)</strong> : Aucune IA ! Appuyez sur <strong>[B]</strong> pour le Magasin (🪙 ∞) ou <strong>[Échap]</strong> pour le Menu Pratique.`,
      5500
    );
  } else {
    updateTutorialSequenceHUD();
    if (state.round === 1) {
      showToast(
        state.vanillaMode
          ? '🚀 <strong>🍦 Vanille • Ronde 1 — Au jeu !</strong> (🔒 <strong>Magasin verrouillé</strong> jusqu’à la Ronde 3) Contournez les adversaires pour voir leur dossard (🌿 / 💧 / 🔥), ramassez votre ballon et marquez !'
          : '🚀 <strong>Ronde 1 — Au jeu !</strong> (🔒 <strong>Ultimates</strong> [Ronde 2] et <strong>Magasin</strong> [Ronde 3] verrouillés pour cette 1re ronde) Contournez les adversaires, ramassez votre ballon et marquez !',
        5500
      );
    } else if (state.round === 2 && !state.vanillaMode) {
      showToast(
        state.mobileMode
          ? '⚡ <strong>Ronde 2 — ULTIMATES DÉBLOQUÉS !</strong> Maintenez <strong>⚡ Ult</strong> (1x/ronde par joueuse, sans ballon) pour lancer vos Ultimates élémentaires (🔥 / 💧 / 🌿) !'
          : '⚡ <strong>Ronde 2 — ULTIMATES DÉBLOQUÉS !</strong> Appuyez sur <strong>[R]</strong> puis <strong>Clic Gauche</strong> (1x/ronde par joueuse, sans ballon) pour lancer vos Ultimates élémentaires (🔥 / 💧 / 🌿) !',
        5800
      );
    } else {
      showToast(
        `🚀 <strong>${state.vanillaMode ? '🍦 Vanille • ' : ''}Ronde ${state.round} — Au jeu !</strong> Contournez les adversaires pour voir leur dossard (🌿 / 💧 / 🔥) dans leur dos, ramassez les ballons de votre couleur et marquez dans le cerceau adverse !`,
        5000
      );
    }
  }
}


// --- DÉMARRAGE D'UN MATCH ---
export function startNewMatch(mode, options = {}) {
  if (tutorialFinishTimer) {
    clearTimeout(tutorialFinishTimer);
    tutorialFinishTimer = null;
  }
  if (tutorialShopAutoReturnTimer) {
    clearTimeout(tutorialShopAutoReturnTimer);
    tutorialShopAutoReturnTimer = null;
  }
  if (tutorialUltRecoverTimer) {
    clearTimeout(tutorialUltRecoverTimer);
    tutorialUltRecoverTimer = null;
  }
  document.body.classList.remove('game-paused');
  const tutIntro = document.getElementById('tutorial-intro-overlay');
  if (tutIntro) tutIntro.classList.add('hidden');
  const pausePracticeStrip = document.getElementById('pause-practice-strip');
  if (pausePracticeStrip) pausePracticeStrip.classList.add('hidden');

  const keepMp = !!(options && options.keepMp && mp.enabled);
  if (mode !== 'multiplayer' && !keepMp) {
    closeMultiplayerSession(true);
    state.myTeam = 'ally';
    state.myLockedRole = null;
  }

  if (mode === 'tutorial') {
    if (state.mapId !== 'tutorial') {
      state.preTutorialMapId = state.mapId || 'classic';
    }
    selectArenaMap('tutorial', false, { force: true });
  } else if (state.mode === 'tutorial' && state.mapId === 'tutorial') {
    const restoreId =
      state.preTutorialMapId && MONTREAL_MAPS[state.preTutorialMapId] && state.preTutorialMapId !== 'tutorial'
        ? state.preTutorialMapId
        : 'classic';
    selectArenaMap(restoreId, false, { force: true });
  }

  const isVanilla = mode === 'tutorial' ? false : Boolean(options && options.vanillaMode);
  pendingTutorialIntro = mode === 'tutorial';
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
  const practiceBar = document.getElementById('practice-menu-bar');
  if (practiceBar) practiceBar.classList.add('hidden');
  const tutHud = document.getElementById('tutorial-sequence-hud');
  if (tutHud) tutHud.classList.add('hidden');
  const nbBadge = document.getElementById('notebook-badge');
  if (nbBadge) nbBadge.textContent = '👁️ 0/3 repérés';
  updateMapLockUI();
  updateTopHUD();
  setupRoundPrep();
}

