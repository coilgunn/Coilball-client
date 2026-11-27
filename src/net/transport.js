import { state, mp, ctx } from '../state.js';
import { netShared, getMpWsServerUrl, tryNetOp } from './shared.js';
import { encodeNetPacket } from './codec.js';
import { updatePingUI } from './lobby_ui.js';
import { onNetworkMessage } from './sync.js';
import { removeMpMember } from './handlers_lobby.js';
import { cleanupHostConnection } from './peer.js';

function sendOverWs(ws, wireData) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  tryNetOp(() => {
    if (wireData instanceof ArrayBuffer || ArrayBuffer.isView(wireData)) {
      ws.send(wireData);
    } else {
      ws.send(JSON.stringify(wireData));
    }
  });
}

export function sendNetMessage(payload, targetConn = null) {
  const isHotBinaryType = payload && (payload.type === 'MP_PLAYER_INPUT' || payload.type === 'MP_WORLD_STATE');
  const binId = isHotBinaryType ? (netShared.binMsgSeq = (netShared.binMsgSeq + 1) >>> 0) : 0;
  const msg = Object.assign({}, payload, {
    _msgId: isHotBinaryType ? 'b_' + binId : Math.random().toString(36).slice(2, 11) + '_' + Math.random().toString(36).slice(2, 5),
    _binMsgId: binId,
    _sender: mp.myPeerId
  });
  mp.seenMsgIds.add(msg._msgId);
  const wireData = isHotBinaryType ? encodeNetPacket(msg) : msg;

  if (targetConn) {
    if (targetConn === mp.ws) {
      if (mp.wsReady) sendOverWs(mp.ws, wireData);
    } else if (targetConn.open) {
      tryNetOp(() => targetConn.send(wireData));
    }
    return;
  }

  // 1. Envoi via serveur WebSocket dédié (si actif)
  if (mp.ws && mp.wsReady) {
    sendOverWs(mp.ws, wireData);
  }

  // 2. Envoi via WebRTC PeerJS
  mp.connections.forEach((conn) => {
    if (conn && conn.open) {
      tryNetOp(() => conn.send(wireData));
    }
  });

  // 3. Envoi via BroadcastChannel (onglets locaux)
  if (mp.bc) {
    tryNetOp(() => mp.bc.postMessage(wireData));
  }
}

export function setupBroadcastChannel(code) {
  if (mp.bc) {
    mp.bc.onmessage = null;
    tryNetOp(() => mp.bc.close());
  }
  if (typeof BroadcastChannel !== 'undefined') {
    mp.bc = new BroadcastChannel('coilball_p2p_' + code);
    mp.bc.onmessage = (ev) => {
      if (ev.data) onNetworkMessage(ev.data, null);
    };
  }
}

export function stopMpHeartbeat() {
  if (mp.heartbeatTimerId) {
    clearInterval(mp.heartbeatTimerId);
    mp.heartbeatTimerId = null;
  }
}

function tickHostHeartbeat(peer, now) {
  // Hôte : détecter les connexions WebRTC mortes ou les onglets fermés sans MP_LEAVE
  mp.connections.slice().forEach((conn) => {
    if (!conn) return;
    const iceState = conn.peerConnection ? conn.peerConnection.iceConnectionState : null;
    if (iceState === 'failed' || iceState === 'closed') {
      cleanupHostConnection(peer, conn);
      return;
    }
    if (!conn.open && conn._createdAt && now - conn._createdAt > 12000) {
      cleanupHostConnection(peer, conn);
      return;
    }
    if (conn.open && conn._lastHeardAt && now - conn._lastHeardAt > 15000) {
      cleanupHostConnection(peer, conn);
    }
  });

  mp.members.slice().forEach((m) => {
    if (!m || m.peerId === mp.myPeerId) return;
    const hasConn = mp.connections.some((c) => c && c._memberPeerId === m.peerId && c.open);
    if (hasConn) return;
    const lastHeard = (mp.memberLastHeard && mp.memberLastHeard[m.peerId]) || 0;
    if (lastHeard > 0 && now - lastHeard > 15000) {
      removeMpMember(m.peerId);
    }
  });
}

export function startMpHeartbeat(peer) {
  stopMpHeartbeat();
  mp.heartbeatTimerId = setInterval(() => {
    if (!mp.enabled || mp.peer !== peer) {
      stopMpHeartbeat();
      return;
    }
    const now = performance.now();
    if (!mp.isHost) {
      if (mp.joinedAcked && (state.phase !== 'play' || ctx.api.isMenuOpen())) {
        sendNetMessage({ type: 'MP_PING', peerId: mp.myPeerId });
      }
      return;
    }
    tickHostHeartbeat(peer, now);
  }, 2500);
}

export function stopPingLoop() {
  if (mp.pingTimerId) {
    clearInterval(mp.pingTimerId);
    mp.pingTimerId = null;
  }
  mp.pingMs = null;
}

function sendPingMeasure() {
  if (!mp.enabled) return;
  const now = performance.now();
  if (mp.ws && mp.wsReady && mp.ws.readyState === WebSocket.OPEN) {
    tryNetOp(() => mp.ws.send(JSON.stringify({ type: 'WS_PING', t: now })));
    return;
  }
  if (!mp.isHost) {
    if (mp.joinedAcked && mp.connections.some((c) => c && c.open)) {
      sendNetMessage({ type: 'MP_PING', peerId: mp.myPeerId, t: now });
    }
  } else if (mp.connections.some((c) => c && c.open)) {
    sendNetMessage({ type: 'MP_PING', peerId: mp.myPeerId, t: now });
  } else {
    mp.pingMs = 0;
    updatePingUI();
  }
}

export function startPingLoop() {
  stopPingLoop();
  sendPingMeasure();
  mp.pingTimerId = setInterval(sendPingMeasure, 2000);
}

function handleWsIncomingMessage(ev, ws, cfg, markSettled) {
  if (mp.ws !== ws) return;
  if (typeof ev.data !== 'string') {
    onNetworkMessage(ev.data, ws);
    return;
  }
  const parsed = tryNetOp(() => JSON.parse(ev.data), null);
  if (!parsed) return;
  if (parsed.type === 'WS_PONG') {
    if (typeof parsed.t === 'number') {
      mp.pingMs = Math.max(1, Math.round(performance.now() - parsed.t));
      updatePingUI();
    }
    return;
  }
  if (cfg.onControlMessage(parsed, ws, markSettled)) return;
  onNetworkMessage(parsed, ws);
}

export function connectRoomWebSocket(cfg) {
  const wsUrl = getMpWsServerUrl();
  if (!wsUrl || typeof WebSocket === 'undefined') return false;
  try {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    mp.ws = ws;
    mp.wsReady = false;
    let settled = false;
    const settleFallback = () => {
      settled = true;
      clearTimeout(fallbackTimer);
      mp.ws = null;
      mp.wsReady = false;
      tryNetOp(() => ws.close());
      cfg.onFallback();
    };
    const fallbackTimer = setTimeout(() => {
      if (!settled && mp.ws === ws) settleFallback();
    }, 6000);
    const markSettled = () => {
      settled = true;
      clearTimeout(fallbackTimer);
    };
    ws.onopen = () => {
      if (settled || mp.ws !== ws) return;
      tryNetOp(() => ws.send(JSON.stringify({ type: cfg.openMsgType, code: cfg.code, peerId: mp.myPeerId })));
    };
    ws.onmessage = (ev) => handleWsIncomingMessage(ev, ws, cfg, markSettled);
    ws.onerror = () => {
      if (!settled && mp.ws === ws) settleFallback();
    };
    ws.onclose = () => {
      if (mp.ws !== ws) return;
      clearTimeout(fallbackTimer);
      if (!settled) {
        settled = true;
        mp.ws = null;
        mp.wsReady = false;
        cfg.onFallback();
        return;
      }
      cfg.onClosedAfterReady();
    };
    return true;
  } catch (err) {
    mp.ws = null;
    mp.wsReady = false;
    return err ? false : false;
  }
}
