import { mp } from '../state.js';
import { NO_RELAY_MSG_TYPES, netShared, tryNetOp } from './shared.js';
import { decodeNetPacket } from './codec.js';
import { LOBBY_MESSAGE_HANDLERS } from './handlers_lobby.js';
import { GAME_MESSAGE_HANDLERS } from './handlers_game.js';

function relayHostMessage(msg, rawWireData, sourceConn) {
  const senderId = msg.peerId || msg._sender;
  if (senderId) {
    if (!mp.memberLastHeard) mp.memberLastHeard = {};
    mp.memberLastHeard[senderId] = performance.now();
  }
  if (NO_RELAY_MSG_TYPES.has(msg.type)) return;
  const relayData = rawWireData !== msg ? rawWireData : msg;
  for (let i = 0; i < mp.connections.length; i++) {
    const c = mp.connections[i];
    if (c !== sourceConn && c.open && c._memberPeerId !== msg._sender) {
      tryNetOp(() => c.send(relayData));
    }
  }
  if (sourceConn && mp.bc) {
    tryNetOp(() => mp.bc.postMessage(relayData));
  }
}

function getMessageHandler(type) {
  if (!netShared.messageHandlers) {
    netShared.messageHandlers = Object.assign({}, LOBBY_MESSAGE_HANDLERS, GAME_MESSAGE_HANDLERS);
  }
  return netShared.messageHandlers[type] || null;
}

export function onNetworkMessage(msg, sourceConn) {
  const rawWireData = msg;
  msg = decodeNetPacket(msg);
  if (!msg || !msg.type) return;
  if (sourceConn && (msg.peerId || msg._sender)) {
    sourceConn._memberPeerId = msg.peerId || msg._sender;
  }
  if (msg._sender === mp.myPeerId) return;
  if (msg._msgId) {
    if (mp.seenMsgIds.has(msg._msgId)) return;
    mp.seenMsgIds.add(msg._msgId);
    if (mp.seenMsgIds.size > 1000) {
      const first = mp.seenMsgIds.values().next().value;
      mp.seenMsgIds.delete(first);
    }
  }

  // Relais par l'Hôte entre WebRTC et onglets locaux BroadcastChannel
  if (mp.isHost) {
    relayHostMessage(msg, rawWireData, sourceConn);
  }

  const handler = getMessageHandler(msg.type);
  if (handler) handler(msg, sourceConn);
}
