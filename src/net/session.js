import { state, mp, escapeHtml, ctx, bus } from '../state.js';
import { Peer, clearConnIceTimer, tryNetOp, syncLocalRoleFromMembers } from './shared.js';
import {
  sendNetMessage,
  setupBroadcastChannel,
  stopMpHeartbeat,
  startMpHeartbeat,
  stopPingLoop,
  startPingLoop,
  connectRoomWebSocket
} from './transport.js';
import { updateTransportBadgeUI, updatePingUI, updateLobbyUI } from './lobby_ui.js';
import {
  attachHostPeerConn,
  handleHostPeerError,
  scheduleHostPeerReconnect,
  attachJoinPeerConn
} from './peer.js';
import { broadcastLobbyState } from './handlers_lobby.js';

export function initNet() {
  // Bus disponible pour les abonnements réseau éventuels des couches supérieures
  ctx.net.bus = bus;
  ctx.api.updateTransportBadgeUI = updateTransportBadgeUI;
  updateTransportBadgeUI();
}

function closeWsHandle(oldWs, notifyPeers) {
  if (!oldWs) return;
  if (notifyPeers) {
    setTimeout(() => tryNetOp(() => oldWs.close()), 80);
  } else {
    tryNetOp(() => oldWs.close());
  }
}

function closePeerAndBcHandles(oldPeer, oldBc, oldConns, notifyPeers) {
  if (oldPeer) {
    tryNetOp(() => oldPeer.disconnect());
    const finishDestroy = () => {
      oldConns.forEach((c) => {
        tryNetOp(() => { if (c && c.open) c.close(); });
      });
      tryNetOp(() => oldPeer.destroy());
      if (oldBc) tryNetOp(() => oldBc.close());
    };
    if (notifyPeers && (oldConns.length > 0 || oldBc)) {
      setTimeout(finishDestroy, 120);
    } else {
      finishDestroy();
    }
    return;
  }
  if (!oldBc) return;
  if (notifyPeers) {
    setTimeout(() => tryNetOp(() => oldBc.close()), 120);
  } else {
    tryNetOp(() => oldBc.close());
  }
}

function resetMpSessionState() {
  mp.peer = null;
  mp.ws = null;
  mp.wsReady = false;
  mp.transport = 'none';
  mp.bc = null;
  mp.connections = [];
  mp.members = [];
  mp.remoteInputs = {};
  mp.memberLastHeard = {};
  mp.enabled = false;
  mp.isHost = false;
  mp.joinedAcked = false;
  mp.roomCode = '';
  mp.worldSeq = 0;
  mp.lastHostWorldSeq = 0;
  mp.inputSeq = 0;
  mp.syncAccumulator = 0;
  mp.hostRetries = 0;
  mp.seenMsgIds.clear();
}

export function closeMultiplayerSession(notifyPeers = false) {
  if (mp.joinTimeoutId) {
    clearTimeout(mp.joinTimeoutId);
    mp.joinTimeoutId = null;
  }
  if (mp.hostReconnectTimerId) {
    clearTimeout(mp.hostReconnectTimerId);
    mp.hostReconnectTimerId = null;
  }
  stopMpHeartbeat();
  stopPingLoop();

  const oldPeer = mp.peer;
  const oldWs = mp.ws;
  const oldBc = mp.bc;
  const oldConns = mp.connections.slice();
  oldConns.forEach((c) => clearConnIceTimer(c));

  if (notifyPeers && mp.enabled) {
    tryNetOp(() => sendNetMessage({ type: 'MP_LEAVE', peerId: mp.myPeerId, isHost: mp.isHost }));
  }
  if (oldBc) oldBc.onmessage = null;
  if (oldWs) {
    oldWs.onopen = null;
    oldWs.onmessage = null;
    oldWs.onerror = null;
    oldWs.onclose = null;
  }
  resetMpSessionState();
  updatePingUI();
  closeWsHandle(oldWs, notifyPeers);
  closePeerAndBcHandles(oldPeer, oldBc, oldConns, notifyPeers);
  updateLobbyUI();
}

function prepareRoomSession(cfg) {
  closeMultiplayerSession(!cfg.restoreOpts);
  mp.openedFromPracticeBar = false;
  mp.myName = (document.getElementById('mp-player-name').value || cfg.defaultName).trim().slice(0, 24) || cfg.defaultName;
  mp.roomCode = cfg.code;
  mp.enabled = true;
  mp.isHost = cfg.isHost;
  mp.joinedAcked = cfg.isHost;
  mp.memberLastHeard = {};
}

function handleHostRoomTaken(ws, retryCount, restoreOpts, startPeerHost) {
  if (retryCount >= 5) {
    mp.ws = null;
    startPeerHost();
    return;
  }
  if (restoreOpts && retryCount < 3) {
    setTimeout(() => {
      if (mp.enabled && mp.isHost && mp.ws === ws) hostRoom(retryCount + 1, restoreOpts);
    }, 1500);
    return;
  }
  hostRoom(retryCount + 1, restoreOpts);
}

function startPeerHostRoom(code, retryCount, restoreOpts) {
  if (!mp.enabled || !mp.isHost || mp.roomCode !== code || mp.wsReady) return;
  if (typeof Peer === 'undefined') {
    mp.transport = 'local';
    updateTransportBadgeUI();
    updateLobbyUI('Salon actif (Mode local)');
    return;
  }
  try {
    const hostState = { opened: false, code, retryCount, restoreOpts };
    const peer = new Peer('coilball-room-' + code);
    mp.peer = peer;
    startMpHeartbeat(peer);
    peer.on('open', () => {
      if (mp.peer !== peer) return;
      hostState.opened = true;
      mp.transport = 'peerjs';
      updateTransportBadgeUI();
      updateLobbyUI('Salon actif (Hôte prêt)');
      startPingLoop();
    });
    peer.on('connection', (conn) => attachHostPeerConn(peer, conn));
    peer.on('disconnected', () => scheduleHostPeerReconnect(peer, code));
    peer.on('error', (err) => handleHostPeerError(peer, err, hostState));
  } catch (err) {
    if (err) mp.transport = 'local';
    else mp.transport = 'local';
    updateTransportBadgeUI();
    updateLobbyUI('Salon actif (Mode local)');
  }
}

export function hostRoom(retryCount = 0, restoreOpts = null) {
  const wasMpEnabled = mp.enabled;
  const keepLivePractice = !!(mp.openedFromPracticeBar && state.mode === 'practice' && state.phase === 'play' && !wasMpEnabled);
  if (!restoreOpts && state.phase !== 'menu' && !keepLivePractice) {
    ctx.api.resetMatchStateToMenu();
  }
  const code =
    restoreOpts && restoreOpts.roomCode && retryCount < 3
      ? String(restoreOpts.roomCode)
      : String(Math.floor(1000 + Math.random() * 9000));
  prepareRoomSession({ code, isHost: true, defaultName: 'Hôte', restoreOpts });
  mp.hostRetries = retryCount;
  if (restoreOpts && Array.isArray(restoreOpts.members) && restoreOpts.members.length > 0) {
    mp.members = restoreOpts.members.map((m) => Object.assign({}, m));
    syncLocalRoleFromMembers();
  } else {
    mp.members = [
      { peerId: mp.myPeerId, name: mp.myName, team: 'ally', slot: 'ALL', activeRole: 'G', prepReady: false }
    ];
    state.myTeam = 'ally';
    state.myLockedRole = null;
  }

  setupBroadcastChannel(code);
  mp.transport = 'local';
  updateTransportBadgeUI();
  updateLobbyUI('Création du salon...');
  if (restoreOpts) broadcastLobbyState();

  const startPeerHost = () => startPeerHostRoom(code, retryCount, restoreOpts);
  const connected = connectRoomWebSocket({
    code,
    openMsgType: 'WS_HOST_OPEN',
    onFallback: startPeerHost,
    onControlMessage: (parsed, ws, markSettled) => {
      if (parsed.type === 'WS_HOST_OK') {
        markSettled();
        mp.wsReady = true;
        mp.transport = 'ws';
        updateTransportBadgeUI();
        updateLobbyUI('Salon actif (Hôte prêt)');
        startPingLoop();
        if (restoreOpts) broadcastLobbyState();
        return true;
      }
      if (parsed.type === 'WS_ROOM_TAKEN') {
        markSettled();
        handleHostRoomTaken(ws, retryCount, restoreOpts, startPeerHost);
        return true;
      }
      return false;
    },
    onClosedAfterReady: () => {
      if (mp.wsReady && mp.enabled && mp.isHost) {
        mp.wsReady = false;
        mp.ws = null;
        mp.transport = 'local';
        updateTransportBadgeUI();
        updateLobbyUI('⚠️ Serveur déconnecté — bascule...');
        startPeerHost();
      }
    }
  });
  if (!connected) startPeerHost();
}

function armJoinTimeout(code) {
  if (mp.joinTimeoutId) clearTimeout(mp.joinTimeoutId);
  mp.joinTimeoutId = setTimeout(() => {
    if (!mp.enabled || mp.isHost || mp.joinedAcked || mp.roomCode !== code) return;
    const hasOpenConn = mp.wsReady || mp.connections.some((c) => c && c.open);
    if (hasOpenConn) return;
    closeMultiplayerSession(false);
    const inputEl = document.getElementById('mp-room-input');
    if (inputEl) inputEl.value = code;
    updateLobbyUI(`⏳ Salon ${code} sans réponse`);
    ctx.api.showToast(
      `⏳ <strong>Salon ${escapeHtml(code)} sans réponse</strong> — vérifiez le code ou demandez à l'Hôte de recréer un salon.`,
      4500
    );
  }, 9000);
}

function handleClientDisconnect(code, statusLabel, toastHtml) {
  if (!mp.enabled || mp.isHost || mp.roomCode !== code) return;
  const wasInGame = state.phase !== 'menu';
  closeMultiplayerSession(false);
  const inputEl = document.getElementById('mp-room-input');
  if (inputEl) inputEl.value = code;
  if (wasInGame) {
    ctx.api.resetMatchStateToMenu();
    ctx.api.showOnlyModal('mp-modal');
  }
  updateLobbyUI(statusLabel);
  if (toastHtml) ctx.api.showToast(toastHtml, 4000);
}

function startPeerJoinRoom(code) {
  if (!mp.enabled || mp.isHost || mp.roomCode !== code || mp.wsReady) return;
  armJoinTimeout(code);
  if (typeof Peer === 'undefined') return;
  const onDisconnect = (label, toast) => handleClientDisconnect(code, label, toast);
  try {
    const peer = new Peer();
    mp.peer = peer;
    startMpHeartbeat(peer);
    peer.on('open', () => {
      if (mp.peer !== peer || !mp.enabled || mp.isHost || mp.roomCode !== code) return;
      const conn = peer.connect('coilball-room-' + code, { reliable: true });
      if (conn) attachJoinPeerConn(peer, conn, code, onDisconnect);
    });
    peer.on('error', (err) => {
      if (mp.peer !== peer) return;
      if (!mp.joinedAcked && mp.enabled && !mp.isHost) {
        const label = err && err.type === 'peer-unavailable'
          ? `❌ Salon ${code} introuvable`
          : `⚠️ Erreur réseau (${err ? err.type : 'Connexion'})`;
        onDisconnect(label, `⚠️ <strong>${escapeHtml(label)}</strong>`);
      } else if (mp.joinedAcked && mp.enabled && !mp.isHost && !peer.destroyed && peer.disconnected) {
        tryNetOp(() => peer.reconnect());
      }
    });
  } catch (err) {
    if (err) mp.transport = 'local';
  }
}

export function joinRoom(rawCode, restoreOpts = null) {
  const code = (rawCode || '').replace(/[^0-9A-Za-z]/g, '').slice(-4).toUpperCase();
  if (code.length < 4) {
    ctx.api.showToast('⚠️ Veuillez entrer un code de salon à 4 chiffres.', 3000);
    return;
  }
  if (!restoreOpts && state.phase !== 'menu') ctx.api.resetMatchStateToMenu();
  prepareRoomSession({ code, isHost: false, defaultName: 'Joueuse 2', restoreOpts });
  mp.lastHostWorldSeq = 0;
  if (restoreOpts && Array.isArray(restoreOpts.members) && restoreOpts.members.length > 0) {
    mp.members = restoreOpts.members.map((m) => Object.assign({}, m));
    syncLocalRoleFromMembers();
  }

  setupBroadcastChannel(code);
  mp.transport = 'local';
  updateTransportBadgeUI();
  updateLobbyUI('Connexion au salon ' + code + '...');
  // Envoyer immédiatement une requête JOIN sur le canal local
  sendNetMessage({ type: 'MP_JOIN_REQ', peerId: mp.myPeerId, name: mp.myName });
  armJoinTimeout(code);

  const startPeerJoin = () => startPeerJoinRoom(code);
  const connected = connectRoomWebSocket({
    code,
    openMsgType: 'WS_JOIN_OPEN',
    onFallback: startPeerJoin,
    onControlMessage: (parsed, ws, markSettled) => {
      if (parsed.type === 'WS_JOIN_OK') {
        markSettled();
        mp.wsReady = true;
        mp.transport = 'ws';
        updateTransportBadgeUI();
        updateLobbyUI('Connecté au salon ' + code);
        startPingLoop();
        sendNetMessage({ type: 'MP_JOIN_REQ', peerId: mp.myPeerId, name: mp.myName });
        return true;
      }
      if (parsed.type === 'WS_ROOM_NOT_FOUND') {
        markSettled();
        mp.ws = null;
        mp.wsReady = false;
        tryNetOp(() => ws.close());
        startPeerJoin();
        return true;
      }
      if (parsed.type === 'WS_ROOM_FULL') {
        markSettled();
        handleClientDisconnect(code, `⛔ Salon ${code} complet`, '⛔ <strong>Ce salon est complet (6/6 joueuses humaines).</strong>');
        return true;
      }
      return false;
    },
    onClosedAfterReady: () => {
      if (mp.wsReady && mp.enabled && !mp.isHost) {
        handleClientDisconnect(code, `🔌 Déconnecté du salon ${code}`, `🔌 <strong>Connexion au salon ${escapeHtml(code)} perdue.</strong>`);
      }
    }
  });
  if (!connected) startPeerJoin();
}
