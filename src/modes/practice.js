import {
  TUTORIAL_STEPS,
  state,
  mp,
  ctx
} from '../state.js';
import {
  players,
  getPlayer,
  applyPlayerColor,
  spawnParticles,
  syncPlayerPowerVisuals
} from '../render3d.js';
import { updateTeamVisionState } from '../world.js';
import {
  clearAllUltimates,
  updateUltHudWidget,
  hideUltimatePreview
} from '../ultimates.js';
import {
  sendNetMessage,
  broadcastToast
} from '../net.js';
import {
  lockPointerIfPlaying,
  unlockPointer,
  recenterMobaCamera,
  updateMobileTouchHUD,
  showOnlyModal,
  clearInputKeys,
  showToast,
  selectArenaMap,
  updateTopHUD,
  updateRosterHUD
} from '../ui.js';
import { applyRoundSetupPositions } from './shared.js';
import { resetTeamPurchasedPowers } from './lifecycle.js';
import { openPrepModal, syncMyTeamPrep } from './prep.js';
import { openTutorialShopStep3 } from './tutorial_steps.js';

function notifyPracticeToast(msg, duration, fromNetwork) {
  if (mp.enabled && mp.isHost && !fromNetwork) broadcastToast(msg, duration);
  else showToast(msg, duration);
}

function practiceRefreshUlt(fromNetwork) {
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
  notifyPracticeToast('⚡ <strong>Ultimates et Dashs rechargés</strong> pour toutes les joueuses !', 2400, fromNetwork);
  return true;
}

function practiceStandupAll(fromNetwork) {
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
  notifyPracticeToast('⬆️ <strong>Toutes les joueuses ont été relevées !</strong>', 2200, fromNetwork);
  return true;
}

function practiceSwapTeam() {
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

function practiceResetPowers(payload, fromNetwork) {
  const targetTeam = mp.enabled
    ? payload && ['ally', 'enemy'].includes(payload.team)
      ? payload.team
      : state.myTeam
    : null;
  resetTeamPurchasedPowers(targetTeam);
  notifyPracticeToast(
    '🧹 <strong>Pouvoirs achetés réinitialisés</strong> (évolutions, outils, dossards et bonus remis à zéro) !',
    2600,
    fromNetwork
  );
  return true;
}

export function executePracticeAction(action, payload = {}, fromNetwork = false) {
  if (state.mode !== 'practice') return false;
  if (action === 'refresh_ult') return practiceRefreshUlt(fromNetwork);
  if (action === 'standup_all') return practiceStandupAll(fromNetwork);
  if (action === 'change_map' && payload && payload.mapId) {
    const meta = selectArenaMap(payload.mapId, false, { force: true, fromNetwork: true });
    notifyPracticeToast(`🗺️ <strong>Arène changée en cours de pratique :</strong> ${meta.icon} ${meta.name}`, 2600, fromNetwork);
    return true;
  }
  if (action === 'reset_pos') {
    applyRoundSetupPositions();
    updateTopHUD();
    updateRosterHUD();
    updateUltHudWidget();
    notifyPracticeToast('🔄 <strong>Positions et ballons réinitialisés</strong> au centre !', 2200, fromNetwork);
    return true;
  }
  if (action === 'swap_team' && !mp.enabled) return practiceSwapTeam();
  if (action === 'reset_powers') return practiceResetPowers(payload, fromNetwork);
  return false;
}

export function requestPracticeAction(action, payload = {}) {
  if (state.mode !== 'practice') return false;
  const finalPayload =
    action === 'reset_powers' ? { team: state.myTeam, ...payload } : payload;
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
  if (mp.enabled && mp.isHost) {
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
