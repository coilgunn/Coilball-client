import {
  state,
  mp,
  ctx
} from '../state.js';
import {
  getPlayer,
  applyPlayerColor,
  syncPlayerPowerVisuals
} from '../render3d.js';
import {
  getMemberControlledRole,
  getRoleHumanController,
  getAvailableRolesForTeam,
  resolveTeamActiveRoles,
  sendNetMessage
} from '../net.js';
import {
  lockPointerIfPlaying,
  recenterMobaCamera,
  updateMobileTouchHUD,
  showOnlyModal,
  selectControlledRole,
  showToast,
  updateMapLockUI,
  updateTopHUD,
  updateRosterHUD,
  resetPointerLockFlags
} from '../ui.js';
import {
  modesState,
  clearPrepInterval
} from './shared.js';
import {
  showTutorialIntroOverlay,
  updateTutorialSequenceHUD
} from './tutorial_hud.js';
import {
  enterTutorialStep,
  setTutorialShopGuideStep,
  resumeTutorialStep3AfterShop
} from './tutorial_steps.js';

function broadcastHostPlayStart() {
  resolveTeamActiveRoles('ally');
  resolveTeamActiveRoles('enemy');
  sendNetMessage({
    type: 'MP_START_PLAY',
    gameMode: state.mode,
    vanillaMode: !!state.vanillaMode,
    aiDifficulty: state.aiDifficulty || 'normal',
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

function initHostRemoteInputs() {
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

function applyInitialControlledRole() {
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
}

function applyPlayPhaseDOMState() {
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

  const showTutIntro = state.mode === 'tutorial' && !state.tutorialPreserveStep && modesState.pendingTutorialIntro;
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
}

function showRoundStartToast() {
  if (state.mode === 'practice') {
    showToast(
      mp.enabled
        ? `🧘 <strong>Un tour pour rien (Pratique Multijoueur — Salon ${mp.roomCode})</strong> : Aucune IA ! <strong>[B]</strong> Magasin (🪙 ∞) • <strong>[Échap]</strong> Menu Pratique.`
        : '🧘 <strong>Un tour pour rien (Mode Pratique Solo)</strong> : Aucune IA ! Appuyez sur <strong>[B]</strong> pour le Magasin (🪙 ∞) ou <strong>[Échap]</strong> pour le Menu Pratique.',
      5500
    );
    return;
  }
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

export function startRoundExecution(fromNetwork = false) {
  if (modesState.tutorialShopAutoReturnTimer) {
    clearTimeout(modesState.tutorialShopAutoReturnTimer);
    modesState.tutorialShopAutoReturnTimer = null;
  }
  clearPrepInterval();

  if (mp.enabled && mp.isHost && !fromNetwork) {
    broadcastHostPlayStart();
  } else if (mp.enabled && mp.isHost) {
    resolveTeamActiveRoles('ally');
    resolveTeamActiveRoles('enemy');
  }

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

  if (mp.enabled && mp.isHost) initHostRemoteInputs();

  applyInitialControlledRole();
  applyPlayPhaseDOMState();
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
  } else {
    updateTutorialSequenceHUD();
    showRoundStartToast();
  }
}
