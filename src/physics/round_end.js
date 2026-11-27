import { state, mp, ctx } from '../state.js';
import { players, balls } from '../render3d.js';
import { getStructureSurfaceY } from '../world.js';
import { cancelUltimatePreview } from '../ultimates.js';
import { sendNetMessage } from '../net.js';
import {
  unlockPointer,
  showOnlyModal,
  updateTopHUD,
  hideMobaMoveMarker,
} from '../ui.js';
import {
  setupRoundPrep,
  completeTutorialToPractice,
  startNewMatch,
} from '../modes.js';
import { cancelPassCharge } from './pass.js';
import { setMobaMoveGoal } from './movement.js';

export function sitDownPlayer(player) {
  if (player.rule1Partner) {
    const partner = player.rule1Partner;
    partner.state = 'standing';
    partner.rule1Partner = null;
    player.rule1Partner = null;
  }
  const surf = getStructureSurfaceY(player.pos.x, player.pos.z, !!player.onCanopy);
  const surfY = surf.y;
  player.onCanopy = surf.zone !== 'ground';
  player.pos.y = surfY;
  player.state = 'sitting';
  player.vel.set(0, 0, 0);
  player.vy = 0;
  player.isAirborne = false;
  player.airSource = null;
  player.isLaunching = false;
  player.launchBoostTimer = 0;
  player.leafUltTimer = 0;
  if (player.team === state.myTeam && player.role === state.controlledRole) {
    if (state.ultPreviewActive) cancelUltimatePreview(false);
    cancelPassCharge();
    setMobaMoveGoal(null);
    hideMobaMoveMarker();
  }
  if (player.carryingBall) {
    const ball = player.carryingBall;
    player.carryingBall = null;
    ball.state = 'ground';
    ball.carrier = null;
    ball.onCanopy = !!player.onCanopy;
    ball.pos.set(player.pos.x, surfY + 0.52, player.pos.z);
  }
}

export function freeFromRule1(player) {
  if (player.rule1Partner) {
    if (player.rule1Partner.state === 'rule1') {
      player.rule1Partner.state = 'standing';
    }
    player.rule1Partner.rule1Partner = null;
  }
  player.state = 'standing';
  player.rule1Partner = null;
}

export function checkRoundEndConditions() {
  if (state.phase !== 'play') return;
  if (state.mode === 'tutorial' || state.mode === 'practice') return;

  const allBallsScored = balls.every((b) => b.state === 'scored');
  let allAlliesSitting = true;
  let allEnemiesSitting = true;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.state !== 'sitting') {
      if (p.team === 'ally') allAlliesSitting = false;
      else allEnemiesSitting = false;
    }
  }

  const teamCanPickup = (team) =>
    balls.some((b) => b.state !== 'scored' && players.some((p) => p.team === team && p.state === 'standing' && p.color === b.color));

  if (allBallsScored) {
    finishRound('Les 2 ballons ont été marqués dans les cerceaux !');
  } else if (allEnemiesSitting && !teamCanPickup('ally')) {
    finishRound("Toute l'Équipe Violette est assise et aucun ballon restant ne peut être ramassé !");
  } else if (allAlliesSitting && !teamCanPickup('enemy')) {
    finishRound("Toute l'Équipe Or est assise !");
  }
}

function evaluateRoundBounties() {
  const bountyNotes = [];
  const allyWonRound =
    state.roundAllyGoals > state.roundEnemyGoals ||
    (state.roundAllyGoals === state.roundEnemyGoals && state.roundAllyKills > state.roundEnemyKills);
  const enemyWonRound =
    state.roundEnemyGoals > state.roundAllyGoals ||
    (state.roundEnemyGoals === state.roundAllyGoals && state.roundEnemyKills > state.roundAllyKills);

  const settleTeamBounty = (teamKey, wonRound, teamLabel) => {
    const t = state.teams[teamKey];
    if (t.activeBountyPE) {
      if (wonRound) {
        if (teamKey === 'ally') state.allyPE += 3;
        else state.enemyPE += 3;
        bountyNotes.push(`🎉 Pari ${teamLabel} +3 🪙 PO réussi !`);
      }
      t.activeBountyPE = false;
    }
    if (t.activeBountyPV) {
      if (wonRound) {
        if (teamKey === 'ally') state.allyPV += 2;
        else state.enemyPV += 2;
        bountyNotes.push(`🏆 Pari ${teamLabel} +2 pts réussi !`);
      }
      t.activeBountyPV = false;
    }
  };
  settleTeamBounty('ally', allyWonRound, 'Or');
  settleTeamBounty('enemy', enemyWonRound, 'Violette');
  return bountyNotes;
}

function configureRoundEndModal(reasonText, bountyNotes, allyWinsGame, enemyWinsGame) {
  const titleEl = document.getElementById('end-modal-title');
  const summaryEl = document.getElementById('end-modal-summary');
  const detailsEl = document.getElementById('end-modal-details');
  const nextBtn = document.getElementById('btn-next-round');

  if (state.mode === 'tutorial') {
    titleEl.textContent = '🎉 Bravo ! Tutoriel terminé !';
    summaryEl.textContent = reasonText || 'Vous avez maîtrisé toutes les bases du Coilball.';
    detailsEl.textContent = 'Continuez librement en mode Pratique (« Un tour pour rien ») pour tester les pouvoirs, les arènes et les modes de jeu !';
    nextBtn.disabled = false;
    nextBtn.textContent = '🧪 Continuer en Mode Pratique';
    nextBtn.onclick = () => completeTutorialToPractice(false);
    return;
  }
  if (state.mode === 'practice') {
    titleEl.textContent = '🧘 Fin du "Tour pour rien"';
    summaryEl.textContent = reasonText;
    detailsEl.textContent = 'Vous pouvez relancer une ronde de pratique ou revenir à l’accueil.';
    nextBtn.disabled = mp.enabled && !mp.isHost;
    nextBtn.textContent = mp.enabled && !mp.isHost ? "⏳ En attente de l'Hôte..." : '🔄 Nouvelle ronde de Pratique';
    nextBtn.onclick = () => {
      state.round += 1;
      setupRoundPrep();
    };
    return;
  }
  if (allyWinsGame || enemyWinsGame) {
    state.phase = 'game_over';
    titleEl.textContent = allyWinsGame ? '🏆 VICTOIRE ÉQUIPE OR !' : '🏆 VICTOIRE ÉQUIPE VIOLETTE !';
    summaryEl.textContent = `Score final : Équipe Or ${state.allyPV} pts — Équipe Violette ${state.enemyPV} pts.`;
    detailsEl.textContent = bountyNotes.join(' • ');
    nextBtn.disabled = mp.enabled && !mp.isHost;
    nextBtn.textContent = mp.enabled && !mp.isHost ? "En attente de l'Hôte..." : '🔄 Rejouer une Partie';
    nextBtn.onclick = () => startNewMatch(mp.enabled ? 'multiplayer' : 'pedagogical');
    return;
  }

  titleEl.textContent = `Fin de la Ronde ${state.round}`;
  summaryEl.textContent = `${reasonText}`;
  const nextRoundUnlockNote =
    state.round + 1 === 2 && !state.vanillaMode
      ? '⚡ Les Ultimates Élémentaires ([R] + Clic Gauche) sont maintenant DÉBLOQUÉS pour la Ronde 2 !'
      : state.round + 1 === 3
      ? '🛒 Le Magasin ouvre ses portes à la prochaine ronde (Ronde 3) !'
      : '';
  const baseRoundNotes =
    bountyNotes.length > 0
      ? bountyNotes.join(' • ')
      : `Score : Équipe Or ${state.allyPV} pts (${state.allyPE} 🪙 PO) — Équipe Violette ${state.enemyPV} pts (${state.enemyPE} 🪙 PO)`;
  detailsEl.textContent = nextRoundUnlockNote ? `${nextRoundUnlockNote} • ${baseRoundNotes}` : baseRoundNotes;
  nextBtn.disabled = mp.enabled && !mp.isHost;
  nextBtn.textContent =
    mp.enabled && !mp.isHost
      ? `⏳ En attente de l'Hôte pour la Ronde ${state.round + 1}...`
      : `▶️ Passer à la Ronde ${state.round + 1}`;
  nextBtn.onclick = () => {
    state.round += 1;
    setupRoundPrep();
  };
}

export function finishRound(reasonText, fromNetwork = false, networkBounties = []) {
  if (state.phase === 'round_end' || state.phase === 'game_over') return;
  if (state.prepInterval) {
    clearInterval(state.prepInterval);
    state.prepInterval = null;
  }
  state.phase = 'round_end';
  ctx.api.resetAITacticalMemory?.();
  unlockPointer();

  let bountyNotes = Array.isArray(networkBounties) ? [...networkBounties] : [];
  if (!fromNetwork) {
    bountyNotes = evaluateRoundBounties();
    if (mp.enabled && mp.isHost) {
      sendNetMessage({
        type: 'MP_ROUND_END',
        mapId: state.mapId,
        reason: reasonText,
        allyPV: state.allyPV,
        allyPE: state.allyPE,
        enemyPV: state.enemyPV,
        enemyPE: state.enemyPE,
        roundAllyGoals: state.roundAllyGoals,
        roundEnemyGoals: state.roundEnemyGoals,
        roundAllyKills: state.roundAllyKills,
        roundEnemyKills: state.roundEnemyKills,
        teams: state.teams,
        bountyNotes,
      });
    }
  }

  updateTopHUD();
  const allyWinsGame = state.allyPV >= 7 && state.allyPV - state.enemyPV >= 2;
  const enemyWinsGame = state.enemyPV >= 7 && state.enemyPV - state.allyPV >= 2;
  configureRoundEndModal(reasonText, bountyNotes, allyWinsGame, enemyWinsGame);

  if (allyWinsGame || enemyWinsGame) {
    ctx.api.playSfx?.((allyWinsGame && state.myTeam === 'ally') || (enemyWinsGame && state.myTeam === 'enemy') ? 'victory' : 'defeat');
  } else {
    ctx.api.playSfx?.('round_end');
  }
  showOnlyModal('round-end-modal');
}
