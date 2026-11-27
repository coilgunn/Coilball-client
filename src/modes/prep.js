import {
  COLORS,
  state,
  mp,
  getTeamPE,
  setSafeHtml,
  ctx
} from '../state.js';
import {
  resolveTeamActiveRoles,
  sendNetMessage
} from '../net.js';
import {
  showOnlyModal,
  switchPrepSubmenu
} from '../ui.js';
import {
  clearPrepInterval,
  applyRoundSetupPositions,
  isShopAvailable
} from './shared.js';
import { chooseAIPrepColors, runTeamAIShopPurchases } from './shop_ai.js';
import { renderPrepColorPickers, renderShopItems } from './shop_ui.js';
import {
  setTutorialShopGuideStep,
  updateTutorialShopGuideUI
} from './tutorial_steps.js';
import { startRoundExecution } from './round.js';

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

export function syncOrSendPrepAction(payload) {
  if (mp.enabled && !mp.isHost) {
    sendNetMessage({
      type: 'MP_PREP_ACTION',
      peerId: mp.myPeerId,
      team: state.myTeam,
      ...payload
    });
  } else {
    syncMyTeamPrep();
  }
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

function setupAITeamPrep(teamKey, canAIShop) {
  if (canAIShop) runTeamAIShopPurchases(teamKey);
  state.teams[teamKey].prepColors = chooseAIPrepColors(teamKey);
  state.teams[teamKey].prepReady = true;
}

function broadcastHostMatchStart() {
  resolveTeamActiveRoles('ally');
  resolveTeamActiveRoles('enemy');
  sendNetMessage({
    type: 'MP_START_MATCH',
    gameMode: state.mode,
    vanillaMode: !!state.vanillaMode,
    aiDifficulty: state.aiDifficulty || 'normal',
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

    const canAIShop =
      (state.mode === 'pedagogical' || state.mode === 'multiplayer') && isShopAvailable();
    const enemyHasHuman = mp.enabled && mp.members.some((m) => m.team === 'enemy');
    if (!enemyHasHuman) setupAITeamPrep('enemy', canAIShop);

    const allyHasHuman = !mp.enabled || mp.members.some((m) => m.team === 'ally');
    if (!allyHasHuman) setupAITeamPrep('ally', canAIShop);
  }

  applyRoundSetupPositions();
  if (mp.enabled && mp.isHost) broadcastHostMatchStart();

  if (state.mode === 'tutorial' || (state.mode === 'practice' && !mp.enabled)) {
    startRoundExecution();
    return;
  }
  openPrepModal();
}

function buildPrepModalDescHtml() {
  const baseDesc =
    'Observez la couleur des <strong>2 ballons</strong> tirés sur la ligne centrale et répartissez secrètement vos dossards dans le dos de vos 3 joueuses (<strong>Gauche G</strong>, <strong>Centre C</strong>, <strong>Droit D</strong>).';
  if (state.mode === 'tutorial' || state.mode === 'practice') return baseDesc;
  if (state.round === 1) {
    const r1Note = state.vanillaMode
      ? '🔒 <strong>Rappel Ronde 1 (Mode Vanille) :</strong> les <strong>Ultimates</strong> sont désactivés et le <strong>Magasin</strong> (débloqué à la <strong>Ronde 3</strong>) est <strong>verrouillé</strong> pour cette première ronde.'
      : '🔒 <strong>Rappel Ronde 1 :</strong> les <strong>Ultimates</strong> (débloqués à la <strong>2e ronde</strong>) et le <strong>Magasin</strong> (débloqué à la <strong>3e ronde</strong>) sont <strong>verrouillés</strong> pour cette première ronde !';
    return `${baseDesc}<div style="margin-top:8px; padding:7px 12px; border-radius:10px; background:rgba(245,158,11,0.16); border:1px solid rgba(250,204,21,0.55); color:#fef08a; font-size:0.84rem;">${r1Note}</div>`;
  }
  if (state.round === 2 && !state.vanillaMode) {
    return `${baseDesc}<div style="margin-top:8px; padding:7px 12px; border-radius:10px; background:rgba(14,165,233,0.18); border:1px solid rgba(56,189,248,0.65); color:#e0f2fe; font-size:0.84rem;">⚡ <strong>Ronde 2 — Ultimates débloqués !</strong> Chaque joueuse peut désormais utiliser son <strong>Ultimate 1x par ronde</strong> (<strong>[R]</strong> puis <strong>Clic Gauche</strong>, sans ballon). <em>(🔒 Magasin à la Ronde 3)</em></div>`;
  }
  if (state.round === 3) {
    return `${baseDesc}<div style="margin-top:8px; padding:7px 12px; border-radius:10px; background:rgba(34,197,94,0.16); border:1px solid rgba(74,222,128,0.55); color:#dcfce7; font-size:0.84rem;">🛒 <strong>Ronde 3 — Magasin débloqué !</strong> Dépensez vos <strong>🪙 PO</strong> dans les onglets <strong>Pouvoirs Individuels</strong> et <strong>Bonus d’Équipe</strong>.</div>`;
  }
  return baseDesc;
}

function startPrepCountdown(timerBadge) {
  state.prepTimer = 30;
  timerBadge.textContent = `⏱️ ${state.prepTimer}s`;
  state.prepInterval = setInterval(() => {
    if (document.getElementById('prep-modal').classList.contains('hidden')) return;
    state.prepTimer--;
    timerBadge.textContent = `⏱️ ${state.prepTimer}s`;
    if (state.prepTimer > 0 && state.prepTimer <= 5) {
      ctx.api.playSfx?.('prep_tick', { urgent: state.prepTimer <= 2 });
    }
    if (state.prepTimer <= 0) {
      clearPrepInterval();
      if (!mp.enabled || mp.isHost) {
        startRoundExecution();
      }
    }
  }, 1000);
}

export function openPrepModal(options = {}) {
  const preservePhase = !!(options && options.preservePhase);
  if (!preservePhase) state.phase = 'prep';
  showOnlyModal('prep-modal');

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
  if (prepDescEl) setSafeHtml(prepDescEl, buildPrepModalDescHtml());

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
    if (confirmBtn) confirmBtn.textContent = '✅ Retourner au Tutoriel (Tester vos achats)';
  }

  renderPrepColorPickers();
  renderShopItems();
  if (options && options.defaultTab) switchPrepSubmenu(options.defaultTab);
  else if (state.mode === 'tutorial' && state.tutorialPreserveStep) switchPrepSubmenu('individual');
  else if (state.mode === 'practice' && preservePhase) switchPrepSubmenu('individual');
  else switchPrepSubmenu(state.prepTab || 'dossards');

  if (state.mode !== 'tutorial') setTutorialShopGuideStep(0);
  else updateTutorialShopGuideUI();

  const timerBadge = document.getElementById('prep-timer-badge');
  clearPrepInterval();
  if (state.mode === 'tutorial' || state.mode === 'practice') {
    timerBadge.textContent =
      state.mode === 'tutorial' ? '🎓 Tutoriel (Sans limite)' : '🧘 Pratique (Sans limite)';
    return;
  }
  startPrepCountdown(timerBadge);
}
