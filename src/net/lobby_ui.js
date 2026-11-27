import { state, mp, ctx } from '../state.js';
import { canAssignMemberSlot, getMpWsServerUrl } from './shared.js';
import { selectMultiplayerSlot } from './handlers_lobby.js';

function applyPingBadgeStyle(el, ms) {
  if (!el) return;
  el.classList.remove('ping-good', 'ping-warn', 'ping-bad');
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    el.textContent = 'Ping: -- ms';
    return;
  }
  const rounded = Math.max(0, Math.round(ms));
  el.textContent = `Ping: ${rounded} ms`;
  if (rounded < 60) el.classList.add('ping-good');
  else if (rounded <= 130) el.classList.add('ping-warn');
  else el.classList.add('ping-bad');
}

export function updateTransportBadgeUI() {
  const badges = [
    document.getElementById('mp-transport-badge'),
    document.getElementById('pause-transport-badge')
  ];
  badges.forEach((el) => {
    if (!el) return;
    if (!mp.enabled) {
      el.className = 'mp-transport-badge hidden';
      el.textContent = '';
      el.title = '';
      return;
    }
    if (mp.wsReady || mp.transport === 'ws') {
      el.className = 'mp-transport-badge transport-server';
      el.textContent = '🖥️ Serveur';
      el.title = 'Connexion via serveur dédié';
    } else if (mp.transport === 'peerjs') {
      el.className = 'mp-transport-badge transport-p2p';
      el.textContent = '🔗 P2P';
      el.title = 'Connexion directe Pair-à-Pair (P2P)';
    } else {
      el.className = 'mp-transport-badge transport-local';
      el.textContent = '🪟 Local';
      el.title = 'Connexion locale entre onglets';
    }
  });
}

export function updatePingUI() {
  const mpBadge = document.getElementById('mp-ping-badge');
  const pauseBadge = document.getElementById('pause-ping-badge');
  applyPingBadgeStyle(mpBadge, mp.pingMs);
  if (pauseBadge) {
    pauseBadge.classList.toggle('hidden', !mp.enabled);
    applyPingBadgeStyle(pauseBadge, mp.pingMs);
  }
  updateTransportBadgeUI();
}

export function probeMpServerPing() {
  const wsUrl = getMpWsServerUrl();
  if (!wsUrl || typeof fetch !== 'function') {
    mp.pingMs = null;
    updatePingUI();
    return;
  }
  const httpUrl = wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:').replace(/\/$/, '') + '/health';
  const t0 = performance.now();
  fetch(httpUrl, { cache: 'no-store' })
    .then((res) => {
      if (!res.ok || mp.enabled) return;
      mp.pingMs = Math.max(1, Math.round(performance.now() - t0));
      updatePingUI();
    })
    .catch(() => {
      if (!mp.enabled) {
        mp.pingMs = null;
        updatePingUI();
      }
    });
}

function updateLobbyBannerAndMap(statusText) {
  const badge = document.getElementById('mp-status-badge');
  if (badge) {
    if (statusText) badge.textContent = statusText;
    else if (!mp.enabled) badge.textContent = 'Non connecté';
  }
  updateTransportBadgeUI();

  const banner = document.getElementById('mp-room-banner');
  const codeEl = document.getElementById('mp-room-code-display');
  const countEl = document.getElementById('mp-peer-count');
  const startBtn = document.getElementById('btn-mp-start');

  if (mp.enabled && mp.roomCode) {
    banner.classList.remove('hidden');
    codeEl.textContent = mp.roomCode;
    countEl.textContent = `${mp.members.length} joueur(s) dans le salon`;
    startBtn.disabled = !mp.isHost;
  } else {
    banner.classList.add('hidden');
    startBtn.disabled = true;
  }

  const mpGrid = document.getElementById('mp-map-grid');
  if (mpGrid && mpGrid.children) {
    Array.from(mpGrid.children).forEach((btn) => {
      if (btn.classList) btn.classList.toggle('active', btn.getAttribute('data-map-id') === state.mapId);
    });
  }
  return startBtn;
}

function syncToggleBtn(id, active, disabled) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.classList.toggle('active', active);
  btn.disabled = disabled;
}

function updateLobbyModeAndRulesUI(startBtn) {
  const isPracticeLobby = mp.lobbyMode === 'practice';
  const isVanillaLobby = !!mp.lobbyVanilla;
  const clientLocked = mp.enabled && !mp.isHost;
  const lobbyAiDiff = (mp.lobbyAiDifficulty || state.aiDifficulty) === 'hard' ? 'hard' : 'normal';
  const isHardAiLobby = lobbyAiDiff === 'hard';

  syncToggleBtn('btn-mp-mode-match', !isPracticeLobby, clientLocked);
  syncToggleBtn('btn-mp-mode-practice', isPracticeLobby, clientLocked);
  syncToggleBtn('btn-mp-rule-standard', !isVanillaLobby, clientLocked);
  syncToggleBtn('btn-mp-rule-vanilla', isVanillaLobby, clientLocked);

  const rulesHintEl = document.getElementById('mp-ruleset-hint');
  if (rulesHintEl) {
    rulesHintEl.textContent = isVanillaLobby
      ? '🍦 Vanille : sans Ult, Dash+, Évos Dash ni Outils • 🎯 Passe au magasin'
      : '⚡ Standard : Ultimates (R2), Évos Dash, Dash+ & Outils actifs';
  }
  const mpAiBar = document.getElementById('mp-ai-diff-bar');
  if (mpAiBar) mpAiBar.classList.toggle('hidden', isPracticeLobby);

  syncToggleBtn('btn-mp-ai-normal', !isHardAiLobby, clientLocked);
  syncToggleBtn('btn-mp-ai-hard', isHardAiLobby, clientLocked);

  const mpAiHint = document.getElementById('mp-ai-diff-hint');
  if (mpAiHint) {
    mpAiHint.textContent = isHardAiLobby
      ? '🧠 Difficile : tenailles, dashs avancés, combos d’ultimates et achats optimisés'
      : '🤖 Normale : IA équilibrée pour les postes libres';
  }
  const modeHintEl = document.getElementById('mp-mode-hint');
  if (modeHintEl) {
    modeHintEl.textContent = isPracticeLobby
      ? '🧘 Pratique Multijoueur : aucune IA, commandes Pratique en pause [Échap] (ultis, relever, changer carte)'
      : '⚔️ Partie complète 7 pts : les postes vides sont gérés par l’IA';
  }
  if (startBtn) {
    startBtn.textContent = isPracticeLobby
      ? (isVanillaLobby ? '🧘 Lancer Pratique Vanille Multijoueur' : '🧘 Lancer "Un tour pour rien" Multijoueur')
      : (isVanillaLobby ? '🍦 Lancer le Match Vanille Multijoueur !' : '🚀 Lancer le Match Multijoueur !');
  }
  return { isPracticeLobby, isHardAiLobby };
}

function buildTeamSlotRow(teamKey, def, flags) {
  const occupants = mp.members.filter((m) => m.team === teamKey && m.slot === def.slot);
  const isMine = occupants.some((m) => m.peerId === mp.myPeerId);
  const check = isMine ? { ok: true } : canAssignMemberSlot(mp.myPeerId, teamKey, def.slot);
  const isTakenByOther = occupants.length > 0 && !isMine;

  const row = document.createElement('div');
  row.className = `mp-slot-row ${isMine ? 'mine' : isTakenByOther || !check.ok ? 'occupied' : ''}`;

  const infoCol = document.createElement('div');
  const titleDiv = document.createElement('div');
  titleDiv.style.fontWeight = '700';
  titleDiv.textContent = def.label;
  const statusDiv = document.createElement('div');
  statusDiv.style.fontSize = '0.75rem';
  statusDiv.style.color = occupants.length > 0 ? '#fde047' : check.ok ? '#94a3b8' : '#fca5a5';
  const freeLabel = flags.isPracticeLobby
    ? '🧘 Libre (Aucune IA)'
    : (flags.isHardAiLobby ? '🧠 IA Difficile (Libre)' : '🤖 IA Normale (Libre)');
  statusDiv.textContent = occupants.length > 0
    ? occupants.map((o) => `👤 ${o.name}`).join(', ')
    : (check.ok ? freeLabel : `🔒 ${check.reason}`);
  infoCol.append(titleDiv, statusDiv);
  row.appendChild(infoCol);

  const joinSlotBtn = document.createElement('button');
  joinSlotBtn.className = 'action-btn';
  joinSlotBtn.style.padding = '5px 10px';
  joinSlotBtn.style.fontSize = '0.74rem';
  if (isMine) joinSlotBtn.textContent = 'Choisi ✔';
  else if (isTakenByOther) joinSlotBtn.textContent = `Pris (${occupants[0].name})`;
  else if (!check.ok) joinSlotBtn.textContent = 'Complet (3/3)';
  else joinSlotBtn.textContent = 'Choisir';
  joinSlotBtn.disabled = !mp.enabled || isMine || !check.ok;
  joinSlotBtn.onclick = () => selectMultiplayerSlot(teamKey, def.slot);
  row.appendChild(joinSlotBtn);
  return row;
}

const SLOT_DEFS = [
  { slot: 'ALL', label: '👑 Capitaine (G / C / D libres)' },
  { slot: 'G', label: 'Joueuse Gauche (G fixe)' },
  { slot: 'C', label: 'Joueuse Centre (C fixe)' },
  { slot: 'D', label: 'Joueuse Droite (D fixe)' }
];

export function updateLobbyUI(statusText) {
  const startBtn = updateLobbyBannerAndMap(statusText);
  const flags = updateLobbyModeAndRulesUI(startBtn);
  ctx.api.updateMapLockUI();

  ['ally', 'enemy'].forEach((teamKey) => {
    const containerEl = document.getElementById(`mp-slots-${teamKey}`);
    if (!containerEl) return;
    containerEl.replaceChildren();
    SLOT_DEFS.forEach((def) => {
      containerEl.appendChild(buildTeamSlotRow(teamKey, def, flags));
    });
  });
}
