import { mp, escapeHtml, ctx } from '../state.js';
import { clearConnIceTimer, tryNetOp } from './shared.js';
import { sendNetMessage, startPingLoop } from './transport.js';
import { updateTransportBadgeUI, updateLobbyUI } from './lobby_ui.js';
import { onNetworkMessage } from './sync.js';
import { broadcastLobbyState, removeMpMember } from './handlers_lobby.js';
import { hostRoom } from './session.js';

export function cleanupHostConnection(peer, conn) {
  if (!conn) return;
  clearConnIceTimer(conn);
  if (mp.peer !== peer) return;
  mp.connections = mp.connections.filter((c) => c !== conn);
  if (conn._memberPeerId) {
    const stillConnected = mp.connections.some((c) => c._memberPeerId === conn._memberPeerId);
    if (!stillConnected) removeMpMember(conn._memberPeerId);
  }
  tryNetOp(() => {
    if (conn.open) conn.close();
  });
}

export function scheduleHostPeerReconnect(peer, code) {
  if (mp.peer !== peer || !mp.enabled || !mp.isHost || peer.destroyed) return;
  updateLobbyUI(`🔄 Reconnexion du salon ${code}...`);
  if (mp.hostReconnectTimerId) clearTimeout(mp.hostReconnectTimerId);
  mp.hostReconnectTimerId = setTimeout(() => {
    if (mp.peer === peer && mp.enabled && mp.isHost && !peer.destroyed && peer.disconnected) {
      tryNetOp(() => peer.reconnect());
    }
  }, 450);
}

export function attachHostPeerConn(peer, conn) {
  if (mp.peer !== peer) {
    tryNetOp(() => conn.close());
    return;
  }
  conn._createdAt = performance.now();
  conn._lastHeardAt = performance.now();
  mp.connections.push(conn);
  conn.on('open', () => {
    if (mp.peer !== peer) return;
    conn._lastHeardAt = performance.now();
    broadcastLobbyState();
  });
  conn.on('data', (data) => {
    if (mp.peer !== peer) return;
    conn._lastHeardAt = performance.now();
    onNetworkMessage(data, conn);
  });
  conn.on('iceStateChanged', (iceState) => {
    if (mp.peer !== peer) return;
    if (iceState === 'failed' || iceState === 'closed') {
      cleanupHostConnection(peer, conn);
      return;
    }
    if (iceState === 'connected' || iceState === 'completed') {
      clearConnIceTimer(conn);
      return;
    }
    if (iceState !== 'disconnected') return;
    clearConnIceTimer(conn);
    conn._iceDropTimer = setTimeout(() => {
      const ice = conn.peerConnection && conn.peerConnection.iceConnectionState;
      if (mp.peer === peer && (ice === 'disconnected' || ice === 'failed')) {
        cleanupHostConnection(peer, conn);
      }
    }, 5000);
  });
  conn.on('close', () => cleanupHostConnection(peer, conn));
  conn.on('error', () => cleanupHostConnection(peer, conn));
}

export function handleHostPeerError(peer, err, hostState) {
  if (mp.peer !== peer) return;
  const errType = err && err.type;
  if (!hostState.opened && errType === 'unavailable-id' && hostState.retryCount < 5) {
    if (hostState.restoreOpts && hostState.retryCount < 3) {
      setTimeout(() => {
        if (mp.peer === peer) hostRoom(hostState.retryCount + 1, hostState.restoreOpts);
      }, 1500);
    } else {
      hostRoom(hostState.retryCount + 1, hostState.restoreOpts);
    }
    return;
  }
  const canReconnect =
    hostState.opened &&
    !peer.destroyed &&
    peer.disconnected &&
    (errType === 'network' || errType === 'socket-error' || errType === 'socket-closed' || errType === 'server-error');
  if (canReconnect) {
    if (mp.hostReconnectTimerId) clearTimeout(mp.hostReconnectTimerId);
    mp.hostReconnectTimerId = setTimeout(() => {
      if (mp.peer === peer && !peer.destroyed && peer.disconnected) {
        tryNetOp(() => peer.reconnect());
      }
    }, 1000);
    return;
  }
  if (!hostState.opened) {
    mp.transport = 'local';
    updateTransportBadgeUI();
  }
  updateLobbyUI(!hostState.opened ? '⚠️ Salon en ligne indisponible (Local)' : '⚠️ Connexion au salon interrompue');
  if (!hostState.opened) {
    ctx.api.showToast(
      "⚠️ <strong>Impossible d'ouvrir le salon en ligne</strong> (mode onglets locaux uniquement). Réessayez dans un instant.",
      4000
    );
  }
}

function dropClientConn(peer, conn) {
  if (mp.peer !== peer) return false;
  clearConnIceTimer(conn);
  mp.connections = mp.connections.filter((c) => c !== conn);
  return mp.enabled && !mp.isHost && mp.connections.length === 0;
}

export function attachJoinPeerConn(peer, conn, code, handleClientDisconnect) {
  mp.connections.push(conn);
  conn.on('open', () => {
    if (mp.peer !== peer) return;
    mp.transport = 'peerjs';
    updateTransportBadgeUI();
    updateLobbyUI('Connecté au salon ' + code);
    startPingLoop();
    sendNetMessage({ type: 'MP_JOIN_REQ', peerId: mp.myPeerId, name: mp.myName });
    setTimeout(() => {
      if (mp.peer === peer && mp.enabled && !mp.isHost && !mp.joinedAcked && conn.open) {
        sendNetMessage({ type: 'MP_JOIN_REQ', peerId: mp.myPeerId, name: mp.myName });
      }
    }, 1000);
  });
  conn.on('data', (data) => {
    if (mp.peer !== peer) return;
    onNetworkMessage(data, conn);
  });
  conn.on('iceStateChanged', (iceState) => {
    if (mp.peer !== peer) return;
    if (iceState === 'failed' || iceState === 'closed') {
      handleClientDisconnect(
        mp.joinedAcked ? `🔌 Déconnecté du salon ${code}` : `❌ Impossible de joindre ${code}`,
        `🔌 <strong>Connexion au salon ${escapeHtml(code)} perdue.</strong>`
      );
      return;
    }
    if (iceState === 'connected' || iceState === 'completed') {
      clearConnIceTimer(conn);
      return;
    }
    if (iceState !== 'disconnected') return;
    clearConnIceTimer(conn);
    conn._iceDropTimer = setTimeout(() => {
      const ice = conn.peerConnection && conn.peerConnection.iceConnectionState;
      if (mp.peer === peer && (ice === 'disconnected' || ice === 'failed')) {
        handleClientDisconnect(
          `🔌 Déconnecté du salon ${code}`,
          `🔌 <strong>Connexion à l'Hôte perdue.</strong>`
        );
      }
    }, 5000);
  });
  conn.on('close', () => {
    if (!dropClientConn(peer, conn)) return;
    handleClientDisconnect(
      mp.joinedAcked ? `🔌 Déconnecté du salon ${code}` : `❌ Impossible de joindre ${code}`,
      mp.joinedAcked
        ? `🔌 <strong>Connexion à l'Hôte fermée.</strong>`
        : `❌ <strong>Impossible de joindre le salon ${escapeHtml(code)}.</strong>`
    );
  });
  conn.on('error', () => {
    if (!dropClientConn(peer, conn)) return;
    handleClientDisconnect(
      mp.joinedAcked ? `🔌 Déconnecté du salon ${code}` : `❌ Impossible de joindre ${code}`,
      `⚠️ <strong>Erreur de connexion au salon ${escapeHtml(code)}.</strong>`
    );
  });
}
