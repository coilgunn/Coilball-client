// ============================================================================
// COILBALL 3D — RÉSEAU MULTIJOUEUR (SERVEUR WS, PEERJS WEBRTC, LOCAL & LOBBY)
// ============================================================================

import { createDefaultTeamMeta, state, mp, escapeHtml, setTeamPE, ctx, bus } from './state.js';

const Peer = ctx.Peer || globalThis.Peer;

function cloneTeamMeta(rawTeam, teamKey) {
  const defaults = createDefaultTeamMeta(!!state.vanillaMode);
  const base = defaults[teamKey === 'enemy' ? 'enemy' : 'ally'];
  if (!rawTeam || typeof rawTeam !== 'object') return base;
  const merged = Object.assign({}, base, rawTeam);
  merged.dossardStock = Object.assign({}, base.dossardStock, rawTeam.dossardStock || {});
  merged.extraDossardBought = Object.assign({}, base.extraDossardBought, rawTeam.extraDossardBought || {});
  merged.prepColors = Object.assign({}, base.prepColors, rawTeam.prepColors || {});
  merged.hasNotebook = rawTeam.hasNotebook === undefined ? base.hasNotebook : !!rawTeam.hasNotebook;
  merged.teamDashPlus = !!rawTeam.teamDashPlus;
  merged.teamJump = !!rawTeam.teamJump;
  merged.powers = {
    G: Object.assign({}, base.powers.G, (rawTeam.powers && rawTeam.powers.G) || {}),
    C: Object.assign({}, base.powers.C, (rawTeam.powers && rawTeam.powers.C) || {}),
    D: Object.assign({}, base.powers.D, (rawTeam.powers && rawTeam.powers.D) || {})
  };
  ['G', 'C', 'D'].forEach((r) => {
    const rawP = rawTeam.powers && rawTeam.powers[r];
    if (rawP && rawP.throwBall !== undefined) {
      merged.powers[r].throwBall = !!rawP.throwBall;
    }
  });
  return merged;
}

function cloneTeamsMeta(rawTeams) {
  return {
    ally: cloneTeamMeta(rawTeams && rawTeams.ally, 'ally'),
    enemy: cloneTeamMeta(rawTeams && rawTeams.enemy, 'enemy')
  };
}

export function initNet() {
  // Bus disponible pour les abonnements réseau éventuels des couches supérieures
  ctx.net.bus = bus;
  ctx.api.updateTransportBadgeUI = updateTransportBadgeUI;
  updateTransportBadgeUI();
}
export function getMemberControlledRole(member) {
  if (!member) return null;
  if (member.slot && member.slot !== 'ALL') return member.slot;
  return ['G', 'C', 'D'].includes(member.activeRole) ? member.activeRole : null;
}

export function getRoleHumanController(team, role, excludePeerId = mp.myPeerId) {
  if (!mp.enabled) return null;
  const direct = mp.members.find(
    (m) =>
      m.peerId !== excludePeerId &&
      m.team === team &&
      getMemberControlledRole(m) === role
  );
  if (direct) return direct;

  // Sécurité supplémentaire côté Hôte en jeu : vérifier les paquets d'entrée actifs récents
  if (mp.isHost && state.phase === 'play') {
    const now = performance.now();
    for (const [pid, inp] of Object.entries(mp.remoteInputs)) {
      if (pid === excludePeerId || !inp) continue;
      if (now - (inp.lastSeen || 0) < 5000 && inp.team === team && inp.role === role) {
        return (
          mp.members.find((m) => m.peerId === pid) || {
            peerId: pid,
            name: 'Joueuse distante',
            team,
            slot: role,
            activeRole: role
          }
        );
      }
    }
  }

  // Et si on exclut un client distant, vérifier aussi la joueuse locale de l'Hôte
  if (
    excludePeerId !== mp.myPeerId &&
    state.myTeam === team &&
    state.controlledRole === role &&
    (state.phase === 'play' || mp.members.some((m) => m.peerId === mp.myPeerId))
  ) {
    return (
      mp.members.find((m) => m.peerId === mp.myPeerId) || {
        peerId: mp.myPeerId,
        name: mp.myName || 'Hôte',
        team,
        slot: state.myLockedRole || 'ALL',
        activeRole: role
      }
    );
  }
  return null;
}

export function getAvailableRolesForTeam(team, excludePeerId = mp.myPeerId) {
  return ['G', 'C', 'D'].filter((r) => !getRoleHumanController(team, r, excludePeerId));
}

export function resolveTeamActiveRoles(team) {
  const teamMembers = mp.members.filter((m) => m.team === team);
  const taken = new Set();

  // 1. Les rôles fixes (G/C/D) ont toujours priorité absolue sur leur poste
  teamMembers.forEach((m) => {
    if (m.slot && m.slot !== 'ALL') {
      m.activeRole = m.slot;
      taken.add(m.slot);
    }
  });

  // 2. Attribuer aux Capitaines ('ALL') un rôle non occupé par un autre humain
  teamMembers.forEach((m) => {
    if (!m.slot || m.slot === 'ALL') {
      const cur = m.activeRole;
      if (['G', 'C', 'D'].includes(cur) && !taken.has(cur)) {
        taken.add(cur);
      } else {
        const fallback = ['G', 'C', 'D'].find((r) => !taken.has(r)) || 'G';
        m.activeRole = fallback;
        taken.add(fallback);
      }
    }
  });
}

export function canAssignMemberSlot(peerId, team, slot) {
  if (!['ally', 'enemy'].includes(team)) return { ok: false, reason: 'Équipe invalide.' };
  if (!['ALL', 'G', 'C', 'D'].includes(slot)) return { ok: false, reason: 'Poste invalide.' };

  const others = mp.members.filter((m) => m.team === team && m.peerId !== peerId);
  if (others.length >= 3) {
    return { ok: false, reason: 'Cette équipe compte déjà 3 humains (complet 3/3).' };
  }
  if (slot === 'ALL') {
    const cap = others.find((m) => m.slot === 'ALL');
    if (cap) {
      return { ok: false, reason: `Le poste Capitaine est déjà pris par ${cap.name}.` };
    }
    return { ok: true };
  }
  const fixedOwner = others.find((m) => m.slot === slot);
  if (fixedOwner) {
    return { ok: false, reason: `La joueuse ${slot} est déjà contrôlée par ${fixedOwner.name}.` };
  }
  return { ok: true };
}


// ============================================================================
// RÉSEAU MULTIJOUEUR P2P (OPTION A : PEERJS WEBRTC + BROADCASTCHANNEL LOCAL)
// ============================================================================
function stopMpHeartbeat() {
  if (mp.heartbeatTimerId) {
    clearInterval(mp.heartbeatTimerId);
    mp.heartbeatTimerId = null;
  }
}

function cleanupHostConnection(peer, conn) {
  if (!conn) return;
  if (conn._iceDropTimer) {
    clearTimeout(conn._iceDropTimer);
    conn._iceDropTimer = null;
  }
  if (mp.peer !== peer) return;
  mp.connections = mp.connections.filter((c) => c !== conn);
  if (conn._memberPeerId) {
    const stillConnected = mp.connections.some((c) => c._memberPeerId === conn._memberPeerId);
    if (!stillConnected) removeMpMember(conn._memberPeerId);
  }
  try {
    if (conn.open) conn.close();
  } catch (_) {}
}

function startMpHeartbeat(peer) {
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
      if (!hasConn) {
        const lastHeard = (mp.memberLastHeard && mp.memberLastHeard[m.peerId]) || 0;
        if (lastHeard > 0 && now - lastHeard > 15000) {
          removeMpMember(m.peerId);
        }
      }
    });
  }, 2500);
}

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

function stopPingLoop() {
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
    try { mp.ws.send(JSON.stringify({ type: 'WS_PING', t: now })); } catch (_) {}
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

function startPingLoop() {
  stopPingLoop();
  sendPingMeasure();
  mp.pingTimerId = setInterval(sendPingMeasure, 2000);
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

  oldConns.forEach((c) => {
    if (c && c._iceDropTimer) {
      clearTimeout(c._iceDropTimer);
      c._iceDropTimer = null;
    }
  });

  if (notifyPeers && mp.enabled) {
    try {
      sendNetMessage({ type: 'MP_LEAVE', peerId: mp.myPeerId, isHost: mp.isHost });
    } catch (_) {}
  }

  if (oldBc) {
    oldBc.onmessage = null;
  }
  if (oldWs) {
    oldWs.onopen = null;
    oldWs.onmessage = null;
    oldWs.onerror = null;
    oldWs.onclose = null;
  }
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
  updatePingUI();

  if (oldWs) {
    if (notifyPeers) {
      setTimeout(() => {
        try { oldWs.close(); } catch (_) {}
      }, 80);
    } else {
      try { oldWs.close(); } catch (_) {}
    }
  }

  if (oldPeer) {
    try { oldPeer.disconnect(); } catch (_) {}
    if (notifyPeers && (oldConns.length > 0 || oldBc)) {
      setTimeout(() => {
        oldConns.forEach((c) => {
          try { if (c && c.open) c.close(); } catch (_) {}
        });
        try { oldPeer.destroy(); } catch (_) {}
        if (oldBc) {
          try { oldBc.close(); } catch (_) {}
        }
      }, 120);
    } else {
      try { oldPeer.destroy(); } catch (_) {}
      if (oldBc) {
        try { oldBc.close(); } catch (_) {}
      }
    }
  } else if (oldBc) {
    if (notifyPeers) {
      setTimeout(() => {
        try { oldBc.close(); } catch (_) {}
      }, 120);
    } else {
      try { oldBc.close(); } catch (_) {}
    }
  }

  if (typeof updateLobbyUI === 'function') updateLobbyUI();
}

function setupBroadcastChannel(code) {
  if (mp.bc) {
    mp.bc.onmessage = null;
    try { mp.bc.close(); } catch (_) {}
  }
  if (typeof BroadcastChannel !== 'undefined') {
    mp.bc = new BroadcastChannel('coilball_p2p_' + code);
    mp.bc.onmessage = (ev) => {
      if (ev.data) onNetworkMessage(ev.data, null);
    };
  }
}

// =========================================================================
// CODEC BINAIRE RÉSEAU (MP_PLAYER_INPUT & MP_WORLD_STATE à ~30 Hz)
// Les autres messages (lobby, chat, fin de manche...) restent en JSON lisible.
// =========================================================================
const NET_MAGIC_0 = 0xCB;
const NET_TYPE_PLAYER_INPUT = 1;
const NET_TYPE_WORLD_STATE = 2;
const MP_ROLES = ['G', 'C', 'D'];
const MP_PLAYER_IDS = ['ally_G', 'ally_C', 'ally_D', 'enemy_G', 'enemy_C', 'enemy_D'];
const MP_PLAYER_STATES = ['standing', 'grounded', 'eliminated'];
const MP_BALL_STATES = ['ground', 'free', 'carried', 'scored', 'respawning'];
const MP_COLORS = ['blue', 'red', 'green', 'yellow', 'gold', 'purple', 'white', 'neutral'];
const netTextEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const netTextDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
let mpBinMsgSeq = (Math.random() * 0x7fffffff) >>> 0;

class NetBinWriter {
  constructor(initialSize = 512) {
    this.buf = new ArrayBuffer(initialSize);
    this.u8 = new Uint8Array(this.buf);
    this.view = new DataView(this.buf);
    this.pos = 0;
  }
  ensure(bytes) {
    if (this.pos + bytes <= this.buf.byteLength) return;
    let nextSize = this.buf.byteLength * 2;
    while (nextSize < this.pos + bytes) nextSize *= 2;
    const nextBuf = new ArrayBuffer(nextSize);
    new Uint8Array(nextBuf).set(this.u8.subarray(0, this.pos));
    this.buf = nextBuf;
    this.u8 = new Uint8Array(this.buf);
    this.view = new DataView(this.buf);
  }
  u8v(v) { this.ensure(1); this.view.setUint8(this.pos++, v & 0xff); }
  i16(v) { this.ensure(2); this.view.setInt16(this.pos, v | 0, true); this.pos += 2; }
  u16(v) { this.ensure(2); this.view.setUint16(this.pos, v >>> 0, true); this.pos += 2; }
  u32(v) { this.ensure(4); this.view.setUint32(this.pos, v >>> 0, true); this.pos += 4; }
  f32(v) { this.ensure(4); this.view.setFloat32(this.pos, Number.isFinite(v) ? v : 0, true); this.pos += 4; }
  str(s) {
    const text = s ? String(s) : '';
    const bytes = netTextEncoder ? netTextEncoder.encode(text) : Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);
    const len = Math.min(255, bytes.length);
    this.u8v(len);
    this.ensure(len);
    for (let i = 0; i < len; i++) this.u8[this.pos + i] = bytes[i];
    this.pos += len;
  }
  enumStr(val, list) {
    const idx = list.indexOf(val);
    if (idx >= 0 && idx < 255) {
      this.u8v(idx);
    } else {
      this.u8v(255);
      this.str(val);
    }
  }
  toBuffer() {
    return this.buf.slice(0, this.pos);
  }
}

class NetBinReader {
  constructor(data) {
    if (data instanceof ArrayBuffer) {
      this.view = new DataView(data);
      this.u8 = new Uint8Array(data);
    } else {
      this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      this.u8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    this.pos = 0;
  }
  u8v() { return this.view.getUint8(this.pos++); }
  i16() { const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
  u16() { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  u32() { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  f32() { const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }
  str() {
    const len = this.u8v();
    const slice = this.u8.subarray(this.pos, this.pos + len);
    this.pos += len;
    if (netTextDecoder) return netTextDecoder.decode(slice);
    let out = '';
    for (let i = 0; i < slice.length; i++) out += String.fromCharCode(slice[i]);
    return out;
  }
  enumStr(list) {
    const idx = this.u8v();
    return idx < 255 && idx < list.length ? list[idx] : this.str();
  }
}

function encodeNetPacket(msg) {
  const MONTREAL_MAPS = ctx.world.MONTREAL_MAPS || {};
  if (!msg || !msg.type) return msg;
  if (msg.type === 'MP_PLAYER_INPUT') {
    const w = new NetBinWriter(80);
    w.u8v(NET_MAGIC_0);
    w.u8v(NET_TYPE_PLAYER_INPUT);
    w.u32(msg._binMsgId >>> 0);
    w.str(msg.peerId || msg._sender || '');
    w.u16(msg.round || 0);
    w.u32(msg.seq || 0);
    const roleIdx = Math.max(0, MP_ROLES.indexOf(msg.role));
    let flags = (msg.team === 'enemy' ? 1 : 0) | ((roleIdx & 3) << 1) | (msg.oc ? 8 : 0) | (msg.actionTriggered ? 16 : 0);
    if (Array.isArray(msg.rev)) {
      if (msg.rev.includes('G')) flags |= 32;
      if (msg.rev.includes('C')) flags |= 64;
      if (msg.rev.includes('D')) flags |= 128;
    }
    w.u8v(flags);
    w.f32(msg.x);
    w.f32(msg.y);
    w.f32(msg.z);
    w.f32(msg.vx);
    w.f32(msg.vy);
    w.f32(msg.vz);
    w.f32(msg.facingAngle);
    w.f32(msg.moveForward);
    w.f32(msg.moveRight);
    w.f32(msg.camYaw);
    return w.toBuffer();
  }

  if (msg.type === 'MP_WORLD_STATE') {
    const mapKeys = Object.keys(MONTREAL_MAPS);
    const w = new NetBinWriter(480);
    w.u8v(NET_MAGIC_0);
    w.u8v(NET_TYPE_WORLD_STATE);
    w.u32(msg._binMsgId >>> 0);
    w.str(msg._sender || '');
    w.enumStr(msg.mapId || '', mapKeys);
    w.u16(msg.round || 0);
    w.u32(msg.seq || 0);
    w.f32(msg.allyPV);
    w.f32(msg.allyPE);
    w.f32(msg.enemyPV);
    w.f32(msg.enemyPE);

    const roles = Array.isArray(msg.roles) ? msg.roles : [];
    w.u8v(roles.length);
    for (let i = 0; i < roles.length; i++) {
      w.str(roles[i].id || '');
      w.u8v(Math.max(0, MP_ROLES.indexOf(roles[i].r)));
    }

    const pList = Array.isArray(msg.players) ? msg.players : [];
    w.u8v(pList.length);
    for (let i = 0; i < pList.length; i++) {
      const p = pList[i];
      w.enumStr(p.id || '', MP_PLAYER_IDS);
      w.f32(p.x);
      w.f32(p.y);
      w.f32(p.z);
      w.f32(p.vx);
      w.f32(p.vy);
      w.f32(p.vz);
      w.f32(p.a);
      w.enumStr(p.st || 'standing', MP_PLAYER_STATES);
      w.enumStr(p.c || 'blue', MP_COLORS);
      w.i16(p.cb === null || p.cb === undefined ? -1 : Number(p.cb));
      w.enumStr(p.r1 || '', MP_PLAYER_IDS);
      w.u16(Math.min(65535, Math.max(0, Math.round((p.lt || 0) * 100))));
      w.u16(Math.min(65535, Math.max(0, Math.round((p.ws || 0) * 100))));
      const pFlags =
        (p.oc ? 1 : 0) |
        (p.su ? 2 : 0) |
        (p.uu ? 4 : 0) |
        (p.ra ? 8 : 0) |
        (p.re ? 16 : 0) |
        (p.sa ? 32 : 0) |
        (p.se ? 64 : 0);
      w.u8v(pFlags);
      w.u16((p.fs || 0) & 0xffff);
    }

    const bList = Array.isArray(msg.balls) ? msg.balls : [];
    w.u8v(bList.length);
    for (let i = 0; i < bList.length; i++) {
      const b = bList[i];
      w.u16(Number(b.id) || 0);
      w.f32(b.x);
      w.f32(b.y);
      w.f32(b.z);
      w.f32(b.vx);
      w.f32(b.vy);
      w.f32(b.vz);
      w.enumStr(b.st || 'ground', MP_BALL_STATES);
      w.enumStr(b.c || 'green', MP_COLORS);
      w.u8v(b.oc ? 1 : 0);
    }
    return w.toBuffer();
  }

  return msg;
}

function decodeNetPacket(data) {
  const MONTREAL_MAPS = ctx.world.MONTREAL_MAPS || {};
  if (!(data instanceof ArrayBuffer || ArrayBuffer.isView(data))) return data;
  try {
    const r = new NetBinReader(data);
    if (r.u8v() !== NET_MAGIC_0) return null;
    const packetType = r.u8v();

    if (packetType === NET_TYPE_PLAYER_INPUT) {
      const binMsgId = r.u32();
      const peerId = r.str();
      const round = r.u16();
      const seq = r.u32();
      const flags = r.u8v();
      const rev = [];
      if (flags & 32) rev.push('G');
      if (flags & 64) rev.push('C');
      if (flags & 128) rev.push('D');
      return {
        type: 'MP_PLAYER_INPUT',
        _msgId: 'b_' + binMsgId,
        _sender: peerId,
        peerId,
        round,
        seq,
        team: flags & 1 ? 'enemy' : 'ally',
        role: MP_ROLES[(flags >> 1) & 3] || 'G',
        oc: flags & 8 ? 1 : 0,
        actionTriggered: !!(flags & 16),
        rev,
        x: r.f32(),
        y: r.f32(),
        z: r.f32(),
        vx: r.f32(),
        vy: r.f32(),
        vz: r.f32(),
        facingAngle: r.f32(),
        moveForward: r.f32(),
        moveRight: r.f32(),
        camYaw: r.f32()
      };
    }

    if (packetType === NET_TYPE_WORLD_STATE) {
      const mapKeys = Object.keys(MONTREAL_MAPS);
      const binMsgId = r.u32();
      const _sender = r.str();
      const mapId = r.enumStr(mapKeys);
      const round = r.u16();
      const seq = r.u32();
      const allyPV = r.f32();
      const allyPE = r.f32();
      const enemyPV = r.f32();
      const enemyPE = r.f32();

      const roleCount = r.u8v();
      const roles = [];
      for (let i = 0; i < roleCount; i++) {
        roles.push({ id: r.str(), r: MP_ROLES[r.u8v()] || 'G' });
      }

      const pCount = r.u8v();
      const playersArr = [];
      for (let i = 0; i < pCount; i++) {
        const id = r.enumStr(MP_PLAYER_IDS);
        const x = r.f32();
        const y = r.f32();
        const z = r.f32();
        const vx = r.f32();
        const vy = r.f32();
        const vz = r.f32();
        const a = r.f32();
        const st = r.enumStr(MP_PLAYER_STATES);
        const c = r.enumStr(MP_COLORS);
        const cbVal = r.i16();
        const r1Str = r.enumStr(MP_PLAYER_IDS);
        const lt = r.u16() / 100;
        const ws = r.u16() / 100;
        const pFlags = r.u8v();
        const fs = r.u16();
        playersArr.push({
          id,
          x,
          y,
          z,
          vx,
          vy,
          vz,
          a,
          st,
          c,
          cb: cbVal >= 0 ? cbVal : null,
          r1: r1Str || null,
          su: !!(pFlags & 2),
          uu: pFlags & 4 ? 1 : 0,
          lt,
          ws,
          fs,
          oc: pFlags & 1 ? 1 : 0,
          ra: pFlags & 8 ? 1 : 0,
          re: pFlags & 16 ? 1 : 0,
          sa: pFlags & 32 ? 1 : 0,
          se: pFlags & 64 ? 1 : 0
        });
      }

      const bCount = r.u8v();
      const ballsArr = [];
      for (let i = 0; i < bCount; i++) {
        ballsArr.push({
          id: r.u16(),
          x: r.f32(),
          y: r.f32(),
          z: r.f32(),
          vx: r.f32(),
          vy: r.f32(),
          vz: r.f32(),
          st: r.enumStr(MP_BALL_STATES),
          c: r.enumStr(MP_COLORS),
          oc: r.u8v()
        });
      }

      return {
        type: 'MP_WORLD_STATE',
        _msgId: 'b_' + binMsgId,
        _sender,
        mapId,
        round,
        seq,
        allyPV,
        allyPE,
        enemyPV,
        enemyPE,
        roles,
        players: playersArr,
        balls: ballsArr
      };
    }
  } catch (_) {}
  return null;
}

const MP_WS_SERVERS = {
  production: 'wss://symphonia.tail69ad79.ts.net',
  local: 'ws://localhost:3000'
};

function getMpWsServerUrl() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('p2p') === '1') return null;
    const custom = params.get('server');
    if (custom) return custom;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return MP_WS_SERVERS.local;
  } catch (_) {}
  return MP_WS_SERVERS.production;
}

function sendOverWs(ws, wireData) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    if (wireData instanceof ArrayBuffer || ArrayBuffer.isView(wireData)) {
      ws.send(wireData);
    } else {
      ws.send(JSON.stringify(wireData));
    }
  } catch (_) {}
}

export function sendNetMessage(payload, targetConn = null) {
  const isHotBinaryType = payload && (payload.type === 'MP_PLAYER_INPUT' || payload.type === 'MP_WORLD_STATE');
  const binId = isHotBinaryType ? (mpBinMsgSeq = (mpBinMsgSeq + 1) >>> 0) : 0;
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
      try { targetConn.send(wireData); } catch (_) {}
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
      try { conn.send(wireData); } catch (_) {}
    }
  });

  // 3. Envoi via BroadcastChannel (onglets locaux)
  if (mp.bc) {
    try { mp.bc.postMessage(wireData); } catch (_) {}
  }
}

function removeMpMember(peerId) {
  if (!peerId || peerId === mp.myPeerId) return;
  const prevLen = mp.members.length;
  const removed = mp.members.find((m) => m.peerId === peerId);
  mp.members = mp.members.filter((m) => m.peerId !== peerId);
  delete mp.remoteInputs[peerId];
  if (mp.memberLastHeard) delete mp.memberLastHeard[peerId];
  if (mp.members.length === prevLen) return;

  resolveTeamActiveRoles('ally');
  resolveTeamActiveRoles('enemy');
  broadcastLobbyState();
  ctx.api.updateRosterHUD();

  if (removed) {
    broadcastToast(`🔌 <strong>${escapeHtml(removed.name)}</strong> a quitté le salon (IA reprend le poste).`, 3000);
  }

  if (mp.isHost && state.phase === 'prep') {
    ctx.api.maybeStartRoundFromPrep();
  }
}

export function hostRoom(retryCount = 0, restoreOpts = null) {
  const wasMpEnabled = mp.enabled;
  const keepLivePractice = !!(mp.openedFromPracticeBar && state.mode === 'practice' && state.phase === 'play' && !wasMpEnabled);
  if (!restoreOpts && state.phase !== 'menu' && !keepLivePractice) {
    ctx.api.resetMatchStateToMenu();
  }
  closeMultiplayerSession(!restoreOpts);
  mp.openedFromPracticeBar = false;
  mp.myName = (document.getElementById('mp-player-name').value || 'Hôte').trim().slice(0, 24) || 'Hôte';
  const code =
    restoreOpts && restoreOpts.roomCode && retryCount < 3
      ? String(restoreOpts.roomCode)
      : String(Math.floor(1000 + Math.random() * 9000));
  mp.roomCode = code;
  mp.enabled = true;
  mp.isHost = true;
  mp.joinedAcked = true;
  mp.hostRetries = retryCount;
  mp.memberLastHeard = {};
  if (restoreOpts && Array.isArray(restoreOpts.members) && restoreOpts.members.length > 0) {
    mp.members = restoreOpts.members.map((m) => Object.assign({}, m));
    syncLocalRoleFromMembers();
  } else {
    mp.members = [
      {
        peerId: mp.myPeerId,
        name: mp.myName,
        team: 'ally',
        slot: 'ALL',
        activeRole: 'G',
        prepReady: false
      }
    ];
    state.myTeam = 'ally';
    state.myLockedRole = null;
  }

  setupBroadcastChannel(code);
  mp.transport = 'local';
  updateTransportBadgeUI();
  updateLobbyUI('Création du salon...');
  if (restoreOpts) {
    broadcastLobbyState();
  }

  const startPeerHost = () => {
    if (!mp.enabled || !mp.isHost || mp.roomCode !== code || mp.wsReady) return;
    if (typeof Peer !== 'undefined') {
      try {
        let peerOpened = false;
        const peer = new Peer('coilball-room-' + code);
        mp.peer = peer;
        startMpHeartbeat(peer);
        peer.on('open', () => {
          if (mp.peer !== peer) return;
          peerOpened = true;
          mp.transport = 'peerjs';
          updateTransportBadgeUI();
          updateLobbyUI('Salon actif (Hôte prêt)');
          startPingLoop();
        });
        peer.on('connection', (conn) => {
          if (mp.peer !== peer) {
            try { conn.close(); } catch (_) {}
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
            } else if (iceState === 'disconnected') {
              if (conn._iceDropTimer) clearTimeout(conn._iceDropTimer);
              conn._iceDropTimer = setTimeout(() => {
                if (
                  mp.peer === peer &&
                  conn.peerConnection &&
                  (conn.peerConnection.iceConnectionState === 'disconnected' ||
                    conn.peerConnection.iceConnectionState === 'failed')
                ) {
                  cleanupHostConnection(peer, conn);
                }
              }, 5000);
            } else if (iceState === 'connected' || iceState === 'completed') {
              if (conn._iceDropTimer) {
                clearTimeout(conn._iceDropTimer);
                conn._iceDropTimer = null;
              }
            }
          });
          conn.on('close', () => cleanupHostConnection(peer, conn));
          conn.on('error', () => cleanupHostConnection(peer, conn));
        });
        peer.on('disconnected', () => {
          if (mp.peer !== peer || !mp.enabled || !mp.isHost || peer.destroyed) return;
          updateLobbyUI(`🔄 Reconnexion du salon ${code}...`);
          if (mp.hostReconnectTimerId) clearTimeout(mp.hostReconnectTimerId);
          mp.hostReconnectTimerId = setTimeout(() => {
            if (mp.peer === peer && mp.enabled && mp.isHost && !peer.destroyed && peer.disconnected) {
              try { peer.reconnect(); } catch (_) {}
            }
          }, 450);
        });
        peer.on('error', (err) => {
          if (mp.peer !== peer) return;
          if (!peerOpened && err && err.type === 'unavailable-id' && retryCount < 5) {
            if (restoreOpts && retryCount < 3) {
              setTimeout(() => {
                if (mp.peer === peer) hostRoom(retryCount + 1, restoreOpts);
              }, 1500);
            } else {
              hostRoom(retryCount + 1, restoreOpts);
            }
            return;
          }
          if (
            peerOpened &&
            !peer.destroyed &&
            peer.disconnected &&
            err &&
            (err.type === 'network' || err.type === 'socket-error' || err.type === 'socket-closed' || err.type === 'server-error')
          ) {
            if (mp.hostReconnectTimerId) clearTimeout(mp.hostReconnectTimerId);
            mp.hostReconnectTimerId = setTimeout(() => {
              if (mp.peer === peer && !peer.destroyed && peer.disconnected) {
                try { peer.reconnect(); } catch (_) {}
              }
            }, 1000);
            return;
          }
          if (!peerOpened) {
            mp.transport = 'local';
            updateTransportBadgeUI();
          }
          updateLobbyUI(!peerOpened ? '⚠️ Salon en ligne indisponible (Local)' : '⚠️ Connexion au salon interrompue');
          if (!peerOpened) {
            ctx.api.showToast(
              "⚠️ <strong>Impossible d'ouvrir le salon en ligne</strong> (mode onglets locaux uniquement). Réessayez dans un instant.",
              4000
            );
          }
        });
      } catch (_) {
        mp.transport = 'local';
        updateTransportBadgeUI();
        updateLobbyUI('Salon actif (Mode local)');
      }
    } else {
      mp.transport = 'local';
      updateTransportBadgeUI();
      updateLobbyUI('Salon actif (Mode local)');
    }
  };

  const wsUrl = getMpWsServerUrl();
  if (wsUrl && typeof WebSocket !== 'undefined') {
    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      mp.ws = ws;
      mp.wsReady = false;
      let settled = false;
      const fallbackTimer = setTimeout(() => {
        if (settled || mp.ws !== ws) return;
        settled = true;
        mp.ws = null;
        mp.wsReady = false;
        try { ws.close(); } catch (_) {}
        startPeerHost();
      }, 6000);

      ws.onopen = () => {
        if (settled || mp.ws !== ws) return;
        try {
          ws.send(JSON.stringify({ type: 'WS_HOST_OPEN', code, peerId: mp.myPeerId }));
        } catch (_) {}
      };
      ws.onmessage = (ev) => {
        if (mp.ws !== ws) return;
        if (typeof ev.data === 'string') {
          let parsed = null;
          try { parsed = JSON.parse(ev.data); } catch (_) {}
          if (!parsed) return;
          if (parsed.type === 'WS_HOST_OK') {
            settled = true;
            clearTimeout(fallbackTimer);
            mp.wsReady = true;
            mp.transport = 'ws';
            updateTransportBadgeUI();
            updateLobbyUI('Salon actif (Hôte prêt)');
            startPingLoop();
            if (restoreOpts) broadcastLobbyState();
            return;
          }
          if (parsed.type === 'WS_PONG') {
            if (typeof parsed.t === 'number') {
              mp.pingMs = Math.max(1, Math.round(performance.now() - parsed.t));
              updatePingUI();
            }
            return;
          }
          if (parsed.type === 'WS_ROOM_TAKEN') {
            settled = true;
            clearTimeout(fallbackTimer);
            if (retryCount < 5) {
              if (restoreOpts && retryCount < 3) {
                setTimeout(() => {
                  if (mp.enabled && mp.isHost && mp.ws === ws) hostRoom(retryCount + 1, restoreOpts);
                }, 1500);
              } else {
                hostRoom(retryCount + 1, restoreOpts);
              }
            } else {
              mp.ws = null;
              startPeerHost();
            }
            return;
          }
          onNetworkMessage(parsed, ws);
          return;
        }
        onNetworkMessage(ev.data, ws);
      };
      ws.onerror = () => {
        if (settled || mp.ws !== ws) return;
        settled = true;
        clearTimeout(fallbackTimer);
        mp.ws = null;
        mp.wsReady = false;
        try { ws.close(); } catch (_) {}
        startPeerHost();
      };
      ws.onclose = () => {
        if (mp.ws !== ws) return;
        clearTimeout(fallbackTimer);
        if (!settled) {
          settled = true;
          mp.ws = null;
          mp.wsReady = false;
          startPeerHost();
          return;
        }
        if (mp.wsReady && mp.enabled && mp.isHost) {
          mp.wsReady = false;
          mp.ws = null;
          mp.transport = 'local';
          updateTransportBadgeUI();
          updateLobbyUI('⚠️ Serveur déconnecté — bascule...');
          startPeerHost();
        }
      };
      return;
    } catch (_) {
      mp.ws = null;
      mp.wsReady = false;
    }
  }

  startPeerHost();
}

export function joinRoom(rawCode, restoreOpts = null) {
  const code = (rawCode || '').replace(/[^0-9A-Za-z]/g, '').slice(-4).toUpperCase();
  if (code.length < 4) {
    ctx.api.showToast('⚠️ Veuillez entrer un code de salon à 4 chiffres.', 3000);
    return;
  }

  if (!restoreOpts && state.phase !== 'menu') {
    ctx.api.resetMatchStateToMenu();
  }
  closeMultiplayerSession(!restoreOpts);
  mp.openedFromPracticeBar = false;
  mp.myName = (document.getElementById('mp-player-name').value || 'Joueuse 2').trim().slice(0, 24) || 'Joueuse 2';
  mp.roomCode = code;
  mp.enabled = true;
  mp.isHost = false;
  mp.joinedAcked = false;
  mp.memberLastHeard = {};
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
  sendNetMessage({
    type: 'MP_JOIN_REQ',
    peerId: mp.myPeerId,
    name: mp.myName
  });

  const armJoinTimeout = () => {
    if (mp.joinTimeoutId) clearTimeout(mp.joinTimeoutId);
    mp.joinTimeoutId = setTimeout(() => {
      if (mp.enabled && !mp.isHost && !mp.joinedAcked && mp.roomCode === code) {
        const hasOpenConn = mp.wsReady || mp.connections.some((c) => c && c.open);
        if (!hasOpenConn) {
          closeMultiplayerSession(false);
          const inputEl = document.getElementById('mp-room-input');
          if (inputEl) inputEl.value = code;
          updateLobbyUI(`⏳ Salon ${code} sans réponse`);
          ctx.api.showToast(
            `⏳ <strong>Salon ${escapeHtml(code)} sans réponse</strong> — vérifiez le code ou demandez à l'Hôte de recréer un salon.`,
            4500
          );
        }
      }
    }, 9000);
  };
  armJoinTimeout();

  const handleClientDisconnect = (statusLabel, toastHtml) => {
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
  };

  const startPeerJoin = () => {
    if (!mp.enabled || mp.isHost || mp.roomCode !== code || mp.wsReady) return;
    armJoinTimeout();
    if (typeof Peer !== 'undefined') {
      try {
        const peer = new Peer();
        mp.peer = peer;
        startMpHeartbeat(peer);

        peer.on('open', () => {
          if (mp.peer !== peer || !mp.enabled || mp.isHost || mp.roomCode !== code) return;
          const conn = peer.connect('coilball-room-' + code, { reliable: true });
          if (!conn) return;
          mp.connections.push(conn);
          conn.on('open', () => {
            if (mp.peer !== peer) return;
            mp.transport = 'peerjs';
            updateTransportBadgeUI();
            updateLobbyUI('Connecté au salon ' + code);
            startPingLoop();
            sendNetMessage({
              type: 'MP_JOIN_REQ',
              peerId: mp.myPeerId,
              name: mp.myName
            });
            setTimeout(() => {
              if (mp.peer === peer && mp.enabled && !mp.isHost && !mp.joinedAcked && conn.open) {
                sendNetMessage({
                  type: 'MP_JOIN_REQ',
                  peerId: mp.myPeerId,
                  name: mp.myName
                });
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
              const wasJoined = mp.joinedAcked;
              handleClientDisconnect(
                wasJoined ? `🔌 Déconnecté du salon ${code}` : `❌ Impossible de joindre ${code}`,
                `🔌 <strong>Connexion au salon ${escapeHtml(code)} perdue.</strong>`
              );
            } else if (iceState === 'disconnected') {
              if (conn._iceDropTimer) clearTimeout(conn._iceDropTimer);
              conn._iceDropTimer = setTimeout(() => {
                if (
                  mp.peer === peer &&
                  conn.peerConnection &&
                  (conn.peerConnection.iceConnectionState === 'disconnected' ||
                    conn.peerConnection.iceConnectionState === 'failed')
                ) {
                  handleClientDisconnect(
                    `🔌 Déconnecté du salon ${code}`,
                    `🔌 <strong>Connexion à l'Hôte perdue.</strong>`
                  );
                }
              }, 5000);
            } else if (iceState === 'connected' || iceState === 'completed') {
              if (conn._iceDropTimer) {
                clearTimeout(conn._iceDropTimer);
                conn._iceDropTimer = null;
              }
            }
          });
          conn.on('close', () => {
            if (mp.peer !== peer) return;
            if (conn._iceDropTimer) {
              clearTimeout(conn._iceDropTimer);
              conn._iceDropTimer = null;
            }
            mp.connections = mp.connections.filter((c) => c !== conn);
            if (mp.enabled && !mp.isHost && mp.connections.length === 0) {
              const wasJoined = mp.joinedAcked;
              handleClientDisconnect(
                wasJoined ? `🔌 Déconnecté du salon ${code}` : `❌ Impossible de joindre ${code}`,
                wasJoined
                  ? `🔌 <strong>Connexion à l'Hôte fermée.</strong>`
                  : `❌ <strong>Impossible de joindre le salon ${escapeHtml(code)}.</strong>`
              );
            }
          });
          conn.on('error', () => {
            if (mp.peer !== peer) return;
            if (conn._iceDropTimer) {
              clearTimeout(conn._iceDropTimer);
              conn._iceDropTimer = null;
            }
            mp.connections = mp.connections.filter((c) => c !== conn);
            if (mp.enabled && !mp.isHost && mp.connections.length === 0) {
              handleClientDisconnect(
                mp.joinedAcked ? `🔌 Déconnecté du salon ${code}` : `❌ Impossible de joindre ${code}`,
                `⚠️ <strong>Erreur de connexion au salon ${escapeHtml(code)}.</strong>`
              );
            }
          });
        });
        peer.on('error', (err) => {
          if (mp.peer !== peer) return;
          if (!mp.joinedAcked && mp.enabled && !mp.isHost) {
            const label =
              err && err.type === 'peer-unavailable'
                ? `❌ Salon ${code} introuvable`
                : `⚠️ Erreur réseau (${err ? err.type : 'Connexion'})`;
            handleClientDisconnect(label, `⚠️ <strong>${escapeHtml(label)}</strong>`);
          } else if (mp.joinedAcked && mp.enabled && !mp.isHost && !peer.destroyed && peer.disconnected) {
            try { peer.reconnect(); } catch (_) {}
          }
        });
      } catch (_) {}
    }
  };

  const wsUrl = getMpWsServerUrl();
  if (wsUrl && typeof WebSocket !== 'undefined') {
    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      mp.ws = ws;
      mp.wsReady = false;
      let settled = false;
      const fallbackTimer = setTimeout(() => {
        if (settled || mp.ws !== ws) return;
        settled = true;
        mp.ws = null;
        mp.wsReady = false;
        try { ws.close(); } catch (_) {}
        startPeerJoin();
      }, 6000);

      ws.onopen = () => {
        if (settled || mp.ws !== ws) return;
        try {
          ws.send(JSON.stringify({ type: 'WS_JOIN_OPEN', code, peerId: mp.myPeerId }));
        } catch (_) {}
      };
      ws.onmessage = (ev) => {
        if (mp.ws !== ws) return;
        if (typeof ev.data === 'string') {
          let parsed = null;
          try { parsed = JSON.parse(ev.data); } catch (_) {}
          if (!parsed) return;
          if (parsed.type === 'WS_JOIN_OK') {
            settled = true;
            clearTimeout(fallbackTimer);
            mp.wsReady = true;
            mp.transport = 'ws';
            updateTransportBadgeUI();
            updateLobbyUI('Connecté au salon ' + code);
            startPingLoop();
            sendNetMessage({
              type: 'MP_JOIN_REQ',
              peerId: mp.myPeerId,
              name: mp.myName
            });
            return;
          }
          if (parsed.type === 'WS_PONG') {
            if (typeof parsed.t === 'number') {
              mp.pingMs = Math.max(1, Math.round(performance.now() - parsed.t));
              updatePingUI();
            }
            return;
          }
          if (parsed.type === 'WS_ROOM_NOT_FOUND') {
            settled = true;
            clearTimeout(fallbackTimer);
            mp.ws = null;
            mp.wsReady = false;
            try { ws.close(); } catch (_) {}
            startPeerJoin();
            return;
          }
          if (parsed.type === 'WS_ROOM_FULL') {
            settled = true;
            clearTimeout(fallbackTimer);
            handleClientDisconnect(
              `⛔ Salon ${code} complet`,
              '⛔ <strong>Ce salon est complet (6/6 joueuses humaines).</strong>'
            );
            return;
          }
          onNetworkMessage(parsed, ws);
          return;
        }
        onNetworkMessage(ev.data, ws);
      };
      ws.onerror = () => {
        if (settled || mp.ws !== ws) return;
        settled = true;
        clearTimeout(fallbackTimer);
        mp.ws = null;
        mp.wsReady = false;
        try { ws.close(); } catch (_) {}
        startPeerJoin();
      };
      ws.onclose = () => {
        if (mp.ws !== ws) return;
        clearTimeout(fallbackTimer);
        if (!settled) {
          settled = true;
          mp.ws = null;
          mp.wsReady = false;
          startPeerJoin();
          return;
        }
        if (mp.wsReady && mp.enabled && !mp.isHost) {
          handleClientDisconnect(
            `🔌 Déconnecté du salon ${code}`,
            `🔌 <strong>Connexion au salon ${escapeHtml(code)} perdue.</strong>`
          );
        }
      };
      return;
    } catch (_) {
      mp.ws = null;
      mp.wsReady = false;
    }
  }

  startPeerJoin();
}

function findDefaultJoinAssignment(peerId) {
  const allyCount = mp.members.filter((m) => m.peerId !== peerId && m.team === 'ally').length;
  const enemyCount = mp.members.filter((m) => m.peerId !== peerId && m.team === 'enemy').length;
  const orderedTeams = enemyCount < allyCount ? ['enemy', 'ally'] : ['ally', 'enemy'];
  for (const t of orderedTeams) {
    for (const slot of ['ALL', 'G', 'C', 'D']) {
      if (canAssignMemberSlot(peerId, t, slot).ok) return { team: t, slot };
    }
  }
  return null;
}


export function sendSyncStateToLateJoiner(targetConn = null, targetPeerId = null) {
  const matchMsg = {
    type: 'MP_START_MATCH',
    targetPeerId,
    gameMode: state.mode,
    vanillaMode: !!state.vanillaMode,
    mapId: state.mapId,
    round: state.round,
    allyPV: state.allyPV,
    allyPE: state.allyPE,
    enemyPV: state.enemyPV,
    enemyPE: state.enemyPE,
    teams: cloneTeamsMeta(state.teams),
    drawnBalls: state.drawnBalls,
    members: mp.members
  };
  sendNetMessage(matchMsg, targetConn);
  if (state.phase === 'play') {
    sendNetMessage(
      {
        type: 'MP_START_PLAY',
        targetPeerId,
        gameMode: state.mode,
        vanillaMode: !!state.vanillaMode,
        mapId: state.mapId,
        round: state.round,
        teams: cloneTeamsMeta(state.teams),
        drawnBalls: state.drawnBalls,
        allyPV: state.allyPV,
        enemyPV: state.enemyPV,
        allyPE: state.allyPE,
        enemyPE: state.enemyPE,
        members: mp.members
      },
      targetConn
    );
    ctx.api.broadcastWorldState();
    const ults = ctx.api.serializeLateUltimates ? ctx.api.serializeLateUltimates() : null;
    const tools = ctx.api.serializeLateToolsAndPatches ? ctx.api.serializeLateToolsAndPatches() : null;
    if (ults || tools) {
      sendNetMessage(
        {
          type: 'MP_LATE_ENTITIES',
          targetPeerId,
          round: state.round,
          ults,
          tools
        },
        targetConn
      );
    }
  }
}

export function onNetworkMessage(msg, sourceConn) {
  const MONTREAL_MAPS = ctx.world.MONTREAL_MAPS || {};
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
    const senderId = msg.peerId || msg._sender;
    if (senderId) {
      if (!mp.memberLastHeard) mp.memberLastHeard = {};
      mp.memberLastHeard[senderId] = performance.now();
    }
    if (
      msg.type !== 'MP_PING' &&
      msg.type !== 'MP_PRACTICE_ACTION' &&
      msg.type !== 'MP_ULT_TRIGGER' &&
      msg.type !== 'MP_TOOL_DEPLOY' &&
      msg.type !== 'MP_SLIDE_PATCH' &&
      msg.type !== 'MP_BALL_PASS' &&
      msg.type !== 'MP_PLAYER_JUMP'
    ) {
      const relayData = rawWireData !== msg ? rawWireData : msg;
      mp.connections.forEach((c) => {
        if (c !== sourceConn && c.open && c._memberPeerId !== msg._sender) {
          try { c.send(relayData); } catch (_) {}
        }
      });
      if (sourceConn && mp.bc) {
        try { mp.bc.postMessage(relayData); } catch (_) {}
      }
    }
  }

  switch (msg.type) {
    case 'MP_PING': {
      if (typeof msg.t === 'number') {
        sendNetMessage(
          { type: 'MP_PONG', targetPeerId: msg.peerId || msg._sender, t: msg.t },
          sourceConn || null
        );
      }
      break;
    }

    case 'MP_PONG': {
      if (msg.targetPeerId === mp.myPeerId && typeof msg.t === 'number') {
        mp.pingMs = Math.max(1, Math.round(performance.now() - msg.t));
        updatePingUI();
      }
      break;
    }

    case 'MP_JOIN_REQ': {
      if (!mp.isHost) return;
      if (sourceConn) {
        sourceConn._memberPeerId = msg.peerId;
        // Fermer toute ancienne connexion morte/dupliquée du même peerId
        const staleConns = mp.connections.filter((c) => c !== sourceConn && c._memberPeerId === msg.peerId);
        if (staleConns.length > 0) {
          mp.connections = mp.connections.filter((c) => c === sourceConn || c._memberPeerId !== msg.peerId);
          staleConns.forEach((c) => {
            if (c && c._iceDropTimer) {
              clearTimeout(c._iceDropTimer);
              c._iceDropTimer = null;
            }
            try { if (c && c.open) c.close(); } catch (_) {}
          });
        }
      }
      let existing = mp.members.find((m) => m.peerId === msg.peerId);
      if (mp.remoteInputs) delete mp.remoteInputs[msg.peerId];
      if (!existing) {
        const assignment = findDefaultJoinAssignment(msg.peerId);
        if (!assignment) {
          sendNetMessage(
            {
              type: 'MP_JOIN_DENIED',
              peerId: msg.peerId,
              reason: 'Ce salon est complet (6/6 joueuses humaines).'
            },
            sourceConn
          );
          return;
        }
        existing = {
          peerId: msg.peerId,
          name: (msg.name || 'Joueuse').slice(0, 24),
          team: assignment.team,
          slot: assignment.slot,
          activeRole: assignment.slot === 'ALL' ? 'G' : assignment.slot,
          prepReady: false
        };
        mp.members.push(existing);
      } else if (msg.name) {
        existing.name = String(msg.name).slice(0, 24);
      }
      resolveTeamActiveRoles('ally');
      resolveTeamActiveRoles('enemy');
      broadcastLobbyState();
      if (state.phase === 'prep' || state.phase === 'play') {
        if (!mp._lateSyncAt) mp._lateSyncAt = {};
        const syncKey = `${msg.peerId}_${state.phase}_${state.round}`;
        const nowSync = performance.now();
        if (!mp._lateSyncAt[syncKey] || nowSync - mp._lateSyncAt[syncKey] > 2500) {
          mp._lateSyncAt[syncKey] = nowSync;
          sendSyncStateToLateJoiner(sourceConn, msg.peerId);
        }
      }
      break;
    }

    case 'MP_JOIN_DENIED': {
      if (msg.peerId !== mp.myPeerId) return;
      closeMultiplayerSession(false);
      updateLobbyUI(`❌ ${msg.reason || 'Salon complet'}`);
      ctx.api.showToast(`⛔ <strong>${escapeHtml(msg.reason || 'Impossible de rejoindre le salon.')}</strong>`, 4000);
      break;
    }

    case 'MP_LEAVE': {
      if (mp.isHost) {
        removeMpMember(msg.peerId);
      } else if (msg.isHost) {
        const closedCode = mp.roomCode;
        const inMpModal = ctx.api.getVisibleModalId() === 'mp-modal';
        closeMultiplayerSession(false);
        if (state.phase !== 'menu') {
          ctx.api.resetMatchStateToMenu();
          ctx.api.showOnlyModal(inMpModal ? 'mp-modal' : 'welcome-modal');
        }
        updateLobbyUI(`🔌 Salon ${closedCode} fermé par l'Hôte`);
        ctx.api.showToast(`⚠️ <strong>L'Hôte a fermé le salon ${escapeHtml(closedCode)}.</strong>`, 4500);
      }
      break;
    }

    case 'MP_SLOT_REQ': {
      if (!mp.isHost) return;
      const member = mp.members.find((m) => m.peerId === msg.peerId);
      if (!member) return;
      const check = canAssignMemberSlot(msg.peerId, msg.team, msg.slot);
      if (!check.ok) {
        sendNetMessage(
          {
            type: 'MP_SLOT_DENIED',
            peerId: msg.peerId,
            reason: check.reason
          },
          sourceConn
        );
        return;
      }
      member.team = msg.team;
      member.slot = msg.slot;
      member.activeRole = msg.slot === 'ALL' ? member.activeRole || 'G' : msg.slot;
      resolveTeamActiveRoles('ally');
      resolveTeamActiveRoles('enemy');
      broadcastLobbyState();
      break;
    }

    case 'MP_SLOT_DENIED': {
      if (msg.peerId !== mp.myPeerId) return;
      ctx.api.showToast(`⛔ <strong>${escapeHtml(msg.reason || 'Poste déjà occupé.')}</strong>`, 2800);
      updateLobbyUI();
      break;
    }

    case 'MP_LOBBY_STATE': {
      if (mp.joinTimeoutId) {
        clearTimeout(mp.joinTimeoutId);
        mp.joinTimeoutId = null;
      }
      mp.joinedAcked = true;
      if (msg.lobbyMode === 'practice' || msg.lobbyMode === 'multiplayer') {
        ctx.api.setMpLobbyMode(msg.lobbyMode, false);
      }
      if (typeof msg.lobbyVanilla === 'boolean') {
        ctx.api.setMpLobbyVanilla?.(!!msg.lobbyVanilla, false);
      }
      if (msg.mapId && MONTREAL_MAPS[msg.mapId] && msg.mapId !== state.mapId) {
        ctx.api.selectArenaMap(msg.mapId, false, { force: true, fromNetwork: true });
      }
      mp.members = (msg.members || []).map((m) => Object.assign({}, m));
      syncLocalRoleFromMembers();
      updateLobbyUI(mp.isHost ? 'Salon actif (Hôte)' : `Connecté au salon ${mp.roomCode}`);
      if (state.phase === 'play') ctx.api.updateRosterHUD();
      break;
    }

    case 'MP_ROLES_SYNC': {
      if (msg.members) {
        mp.members = msg.members.map((m) => Object.assign({}, m));
        syncLocalRoleFromMembers();
        ctx.api.updateRosterHUD();
      }
      break;
    }

    case 'MP_ROLE_DENIED': {
      if (msg.peerId !== mp.myPeerId) return;
      const safeRole =
        msg.fallbackRole && !getRoleHumanController(state.myTeam, msg.fallbackRole)
          ? msg.fallbackRole
          : getAvailableRolesForTeam(state.myTeam)[0];
      if (safeRole) {
        state.controlledRole = safeRole;
        const me = mp.members.find((m) => m.peerId === mp.myPeerId);
        if (me && me.slot === 'ALL') me.activeRole = safeRole;
      }
      ctx.api.showToast(
        `⛔ <strong>Joueuse ${msg.blockedRole}</strong> est déjà contrôlée par <strong>${escapeHtml(msg.ownerName || 'une autre joueuse')}</strong> !`,
        2200
      );
      ctx.api.updateRosterHUD();
      break;
    }

    case 'MP_START_MATCH': {
      if (mp.isHost) return;
      if (msg.targetPeerId) {
        if (msg.targetPeerId !== mp.myPeerId) return;
        if ((state.phase === 'prep' || state.phase === 'play') && state.round === msg.round) return;
      }
      const targetMode = msg.gameMode === 'practice' ? 'practice' : 'multiplayer';
      state.mode = targetMode;
      state.vanillaMode = !!msg.vanillaMode;
      if (msg.mapId && MONTREAL_MAPS[msg.mapId] && msg.mapId !== state.mapId) {
        ctx.api.selectArenaMap(msg.mapId, false, { force: true, fromNetwork: true });
      }
      state.round = msg.round || 1;
      state.allyPV = msg.allyPV || 0;
      state.allyPE = msg.allyPE || 0;
      state.enemyPV = msg.enemyPV || 0;
      state.enemyPE = msg.enemyPE || 0;
      state.teams = cloneTeamsMeta(msg.teams);
      state.drawnBalls = msg.drawnBalls || ['green', 'red'];
      if (msg.members) {
        mp.members = msg.members.map((m) => Object.assign({}, m));
        syncLocalRoleFromMembers();
      }
      ctx.api.applyRoundSetupPositions();
      ctx.api.openPrepModal();
      break;
    }

    case 'MP_PREP_ACTION': {
      if (!mp.isHost) return;
      ctx.api.handleHostPrepAction(msg, sourceConn);
      break;
    }

    case 'MP_PREP_SYNC': {
      if (!mp.isHost && msg.mapId && MONTREAL_MAPS[msg.mapId] && msg.mapId !== state.mapId) {
        ctx.api.selectArenaMap(msg.mapId, false, { force: true, fromNetwork: true });
      }
      if (msg.team && msg.teamData) {
        state.teams[msg.team] = cloneTeamMeta(msg.teamData, msg.team);
        if (typeof msg.teamPE === 'number') {
          setTeamPE(msg.team, msg.teamPE);
        }
        if (Array.isArray(msg.members)) {
          mp.members = msg.members.map((m) => Object.assign({}, m));
          syncLocalRoleFromMembers();
        }
        const prepEl = document.getElementById('prep-modal');
        const prepVisible = prepEl && !prepEl.classList.contains('hidden');
        if (state.mode === 'practice' && state.phase === 'play' && state.teams[msg.team]?.prepColors) {
          ['G', 'C', 'D'].forEach((role) => {
            const pl = ctx.api.getPlayer(msg.team, role);
            const nextCol = state.teams[msg.team].prepColors[role];
            if (pl && nextCol) ctx.api.applyPlayerColor(pl, nextCol);
          });
          ctx.api.updateRosterHUD();
          ctx.api.updateUltHudWidget();
          ctx.api.updateMobileTouchHUD?.();
        }
        if (state.phase === 'prep' || prepVisible) {
          if (msg.team === state.myTeam) {
            ctx.api.renderPrepColorPickers();
            ctx.api.renderShopItems();
          }
          ctx.api.updatePrepConfirmButtonUI();
        }
        ctx.api.updateTopHUD();
        if (mp.isHost) {
          ctx.api.maybeStartRoundFromPrep();
        }
      }
      break;
    }

    case 'MP_START_PLAY': {
      if (mp.isHost) return;
      if (msg.targetPeerId) {
        if (msg.targetPeerId !== mp.myPeerId) return;
        if (state.phase === 'play' && state.round === msg.round) return;
      }
      if (msg.gameMode === 'practice' || msg.gameMode === 'multiplayer') {
        state.mode = msg.gameMode;
      }
      if (typeof msg.vanillaMode === 'boolean') {
        state.vanillaMode = !!msg.vanillaMode;
      }
      if (msg.mapId && MONTREAL_MAPS[msg.mapId] && msg.mapId !== state.mapId) {
        ctx.api.selectArenaMap(msg.mapId, false, { force: true, fromNetwork: true });
      }
      if (typeof msg.round === 'number') state.round = msg.round;
      if (typeof msg.allyPV === 'number') state.allyPV = msg.allyPV;
      if (typeof msg.enemyPV === 'number') state.enemyPV = msg.enemyPV;
      state.teams = msg.teams ? cloneTeamsMeta(msg.teams) : state.teams;
      if (Array.isArray(msg.drawnBalls) && msg.drawnBalls.length >= 2) {
        state.drawnBalls = msg.drawnBalls;
      }
      state.allyPE = msg.allyPE;
      state.enemyPE = msg.enemyPE;
      if (Array.isArray(msg.members)) {
        mp.members = msg.members.map((m) => Object.assign({}, m));
        syncLocalRoleFromMembers();
      }
      ctx.api.applyRoundSetupPositions();
      ctx.api.startRoundExecution(true);
      break;
    }

    case 'MP_PRACTICE_ACTION': {
      if (state.mode !== 'practice') return;
      if (mp.isHost) {
        if (msg.action === 'reset_powers' && !msg.payload?.team) {
          const req = mp.members.find((m) => m.peerId === (msg.peerId || msg._sender));
          msg.payload = Object.assign({}, msg.payload, { team: req ? req.team : state.myTeam });
        }
        if (ctx.api.executePracticeAction(msg.action, msg.payload, false)) {
          sendNetMessage({
            type: 'MP_PRACTICE_ACTION',
            action: msg.action,
            payload: msg.payload,
            teams: cloneTeamsMeta(state.teams)
          });
          if (state.phase === 'play') ctx.api.broadcastWorldState();
        }
      } else {
        ctx.api.executePracticeAction(msg.action, msg.payload, true);
        if (msg.teams) {
          state.teams = cloneTeamsMeta(msg.teams);
          ctx.api.updateTopHUD?.();
          ctx.api.updateRosterHUD?.();
          ctx.api.updateUltHudWidget?.();
          ctx.api.updateMobileTouchHUD?.();
        }
      }
      break;
    }

    case 'MP_PLAYER_INPUT': {
      if (!mp.isHost) return;
      if (typeof msg.round === 'number' && msg.round !== state.round) return;
      const member = mp.members.find((m) => m.peerId === msg.peerId);
      const targetTeam = member ? member.team : msg.team;
      const targetRole = member && member.slot !== 'ALL' ? member.slot : msg.role;
      if (!['ally', 'enemy'].includes(targetTeam) || !['G', 'C', 'D'].includes(targetRole)) {
        return;
      }

      const prev = mp.remoteInputs[msg.peerId];
      if (typeof msg.seq === 'number' && prev && typeof prev.seq === 'number' && msg.seq < prev.seq) {
        return;
      }

      const existingOwner = getRoleHumanController(targetTeam, targetRole, msg.peerId);
      if (existingOwner) {
        const fallback =
          (member && !getRoleHumanController(targetTeam, member.activeRole, msg.peerId)
            ? member.activeRole
            : null) || getAvailableRolesForTeam(targetTeam, msg.peerId)[0] || null;
        sendNetMessage(
          {
            type: 'MP_ROLE_DENIED',
            peerId: msg.peerId,
            team: targetTeam,
            blockedRole: targetRole,
            ownerName: existingOwner.name,
            fallbackRole: fallback
          },
          sourceConn
        );
        return;
      }

      let roleChanged = false;
      if (member && member.activeRole !== targetRole) {
        member.activeRole = targetRole;
        roleChanged = true;
      }

      if (Array.isArray(msg.rev) && msg.rev.length > 0) {
        const oppTeam = targetTeam === 'ally' ? 'enemy' : 'ally';
        let revHudDirty = false;
        msg.rev.forEach((r) => {
          if (!['G', 'C', 'D'].includes(r)) return;
          const ep = ctx.api.getPlayer(oppTeam, r);
          if (ep) {
            if (!ep.revealedTo) ep.revealedTo = { ally: ep.team === 'ally', enemy: ep.team === 'enemy' };
            if (!ep.revealedTo[targetTeam]) {
              ep.revealedTo[targetTeam] = true;
              if (targetTeam === state.myTeam && !ep.backRevealed) {
                ep.backRevealed = true;
                revHudDirty = true;
              }
            }
          }
        });
        if (revHudDirty) ctx.api.updateRosterHUD();
      }

      mp.remoteInputs[msg.peerId] = {
        team: targetTeam,
        role: targetRole,
        x: typeof msg.x === 'number' ? msg.x : prev ? prev.x : undefined,
        y: typeof msg.y === 'number' ? msg.y : prev ? prev.y : 0,
        z: typeof msg.z === 'number' ? msg.z : prev ? prev.z : undefined,
        vx: typeof msg.vx === 'number' ? msg.vx : 0,
        vy: typeof msg.vy === 'number' ? msg.vy : 0,
        vz: typeof msg.vz === 'number' ? msg.vz : 0,
        oc: typeof msg.oc === 'number' ? !!msg.oc : typeof msg.oc === 'boolean' ? msg.oc : prev ? prev.oc : false,
        facingAngle: typeof msg.facingAngle === 'number' ? msg.facingAngle : prev ? prev.facingAngle : undefined,
        moveForward: msg.moveForward || 0,
        moveRight: msg.moveRight || 0,
        camYaw: msg.camYaw,
        seq: typeof msg.seq === 'number' ? msg.seq : prev ? prev.seq : 0,
        lastSeen: performance.now()
      };

      if (roleChanged) {
        ctx.api.updateRosterHUD();
        sendNetMessage({ type: 'MP_ROLES_SYNC', members: mp.members });
      }

      if (msg.actionTriggered) {
        const p = ctx.api.getPlayer(targetTeam, targetRole);
        if (p) {
          if (
            typeof msg.x === 'number' &&
            typeof msg.z === 'number' &&
            Math.hypot(p.pos.x - msg.x, p.pos.z - msg.z) < 12
          ) {
            p.pos.set(msg.x, typeof msg.y === 'number' ? msg.y : p.pos.y, msg.z);
            if (typeof msg.oc === 'number' || typeof msg.oc === 'boolean') p.onCanopy = !!msg.oc;
          }
          if (typeof msg.facingAngle === 'number') {
            p.facingAngle = msg.facingAngle;
          }
          ctx.api.triggerPlayerAction(p);
          ctx.api.broadcastWorldState();
        }
      }
      break;
    }

    case 'MP_WORLD_STATE': {
      if (mp.isHost || state.phase !== 'play') return;
      ctx.api.applyWorldStateFromHost(msg);
      break;
    }

    case 'MP_ULT_TRIGGER': {
      if (state.phase !== 'play') return;
      if (typeof msg.round === 'number' && msg.round !== state.round) return;
      if (!mp.isHost && msg.peerId && msg.peerId === mp.myPeerId) return;
      const p = ctx.api.getPlayer(msg.team, msg.role);
      if (!p) return;
      if (
        typeof msg.x === 'number' &&
        typeof msg.z === 'number' &&
        Math.hypot(p.pos.x - msg.x, p.pos.z - msg.z) < 12
      ) {
        p.pos.set(msg.x, typeof msg.y === 'number' ? msg.y : p.pos.y, msg.z);
        if (typeof msg.oc === 'number' || typeof msg.oc === 'boolean') p.onCanopy = !!msg.oc;
      }
      const aimAngle = typeof msg.aimAngle === 'number' ? msg.aimAngle : p.facingAngle;
      ctx.api.triggerPlayerUltimate(p, aimAngle, true, !!msg.reactivate);
      if (mp.isHost) {
        sendNetMessage({
          type: 'MP_ULT_TRIGGER',
          round: state.round,
          peerId: msg.peerId || msg._sender,
          team: msg.team,
          role: msg.role,
          x: p.pos.x,
          y: p.pos.y,
          z: p.pos.z,
          oc: p.onCanopy ? 1 : 0,
          aimAngle,
          reactivate: !!msg.reactivate
        });
        ctx.api.broadcastWorldState();
      }
      break;
    }

    case 'MP_TOOL_DEPLOY': {
      if (state.phase !== 'play') return;
      if (!mp.isHost && msg.peerId && msg.peerId === mp.myPeerId) return;
      const p = ctx.api.getPlayer(msg.team, msg.role);
      if (!p) return;
      ctx.api.deployPlayerTool(p, msg.toolKey, msg.x, msg.y, msg.z, msg.facingAngle, !!msg.onCanopy, true);
      if (mp.isHost) {
        sendNetMessage({
          type: 'MP_TOOL_DEPLOY',
          peerId: msg.peerId || msg._sender,
          team: msg.team,
          role: msg.role,
          toolKey: msg.toolKey,
          x: msg.x,
          y: msg.y,
          z: msg.z,
          facingAngle: msg.facingAngle,
          onCanopy: !!msg.onCanopy
        });
      }
      break;
    }

    case 'MP_SLIDE_PATCH': {
      if (state.phase !== 'play') return;
      if (!mp.isHost && msg.peerId && msg.peerId === mp.myPeerId) return;
      ctx.api.spawnSlidePatch(msg.ownerId, msg.team, msg.x, msg.y, msg.z, false);
      if (mp.isHost) {
        sendNetMessage({
          type: 'MP_SLIDE_PATCH',
          peerId: msg.peerId || msg._sender,
          ownerId: msg.ownerId,
          team: msg.team,
          x: msg.x,
          y: msg.y,
          z: msg.z
        });
      }
      break;
    }

    case 'MP_BALL_PASS': {
      if (state.phase !== 'play') return;
      if (typeof msg.round === 'number' && msg.round !== state.round) return;
      if (mp.isHost) ctx.api.handleRemoteBallPass?.(msg);
      break;
    }

    case 'MP_PLAYER_JUMP': {
      if (state.phase !== 'play') return;
      if (typeof msg.round === 'number' && msg.round !== state.round) return;
      if (mp.isHost) ctx.api.handleRemotePlayerJump?.(msg);
      break;
    }

    case 'MP_LATE_ENTITIES': {
      if (mp.isHost || state.phase !== 'play') return;
      if (msg.targetPeerId && msg.targetPeerId !== mp.myPeerId) return;
      if (typeof msg.round === 'number' && msg.round !== state.round) return;
      if (msg.ults && ctx.api.applyLateUltimates) ctx.api.applyLateUltimates(msg.ults);
      if (msg.tools && ctx.api.applyLateToolsAndPatches) ctx.api.applyLateToolsAndPatches(msg.tools);
      break;
    }

    case 'MP_TOAST': {
      if (!mp.isHost) ctx.api.showToast(msg.html, msg.duration);
      break;
    }

    case 'MP_ROUND_END': {
      if (mp.isHost) return;
      if (msg.mapId && MONTREAL_MAPS[msg.mapId] && msg.mapId !== state.mapId) {
        ctx.api.selectArenaMap(msg.mapId, false, { force: true, fromNetwork: true });
      }
      state.allyPV = msg.allyPV;
      state.allyPE = msg.allyPE;
      state.enemyPV = msg.enemyPV;
      state.enemyPE = msg.enemyPE;
      state.roundAllyGoals = msg.roundAllyGoals;
      state.roundEnemyGoals = msg.roundEnemyGoals;
      state.roundAllyKills = msg.roundAllyKills;
      state.roundEnemyKills = msg.roundEnemyKills;
      if (msg.teams) state.teams = cloneTeamsMeta(msg.teams);
      ctx.api.finishRound(msg.reason, true, msg.bountyNotes || []);
      break;
    }
  }
}

export function syncLocalRoleFromMembers() {
  const me = mp.members.find((m) => m.peerId === mp.myPeerId);
  if (!me) return;
  state.myTeam = me.team;
  state.myLockedRole = me.slot === 'ALL' ? null : me.slot;
  if (state.myLockedRole) {
    state.controlledRole = state.myLockedRole;
  } else if (getRoleHumanController(state.myTeam, state.controlledRole)) {
    const nextFree = me.activeRole && !getRoleHumanController(state.myTeam, me.activeRole)
      ? me.activeRole
      : getAvailableRolesForTeam(state.myTeam)[0];
    if (nextFree) state.controlledRole = nextFree;
  }
}

export function broadcastLobbyState() {
  resolveTeamActiveRoles('ally');
  resolveTeamActiveRoles('enemy');
  syncLocalRoleFromMembers();
  sendNetMessage({
    type: 'MP_LOBBY_STATE',
    lobbyMode: mp.lobbyMode || 'multiplayer',
    lobbyVanilla: !!mp.lobbyVanilla,
    mapId: state.mapId,
    members: mp.members
  });
  updateLobbyUI(mp.isHost ? 'Salon actif (Hôte)' : undefined);
  if (state.phase === 'play') ctx.api.updateRosterHUD();
}

export function selectMultiplayerSlot(team, slot) {
  if (!mp.enabled) return;
  if (mp.isHost) {
    const check = canAssignMemberSlot(mp.myPeerId, team, slot);
    if (!check.ok) {
      ctx.api.showToast(`⛔ <strong>${escapeHtml(check.reason)}</strong>`, 2800);
      return;
    }
    const me = mp.members.find((m) => m.peerId === mp.myPeerId);
    if (me) {
      me.team = team;
      me.slot = slot;
      me.activeRole = slot === 'ALL' ? me.activeRole || 'G' : slot;
      broadcastLobbyState();
    }
  } else {
    sendNetMessage({
      type: 'MP_SLOT_REQ',
      peerId: mp.myPeerId,
      team,
      slot
    });
  }
}

export function updateLobbyUI(statusText) {
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

  const isPracticeLobby = mp.lobbyMode === 'practice';
  const isVanillaLobby = !!mp.lobbyVanilla;
  const btnMatchMode = document.getElementById('btn-mp-mode-match');
  const btnPracticeMode = document.getElementById('btn-mp-mode-practice');
  if (btnMatchMode) {
    btnMatchMode.classList.toggle('active', !isPracticeLobby);
    btnMatchMode.disabled = mp.enabled && !mp.isHost;
  }
  if (btnPracticeMode) {
    btnPracticeMode.classList.toggle('active', isPracticeLobby);
    btnPracticeMode.disabled = mp.enabled && !mp.isHost;
  }
  const btnRuleStd = document.getElementById('btn-mp-rule-standard');
  const btnRuleVan = document.getElementById('btn-mp-rule-vanilla');
  if (btnRuleStd) {
    btnRuleStd.classList.toggle('active', !isVanillaLobby);
    btnRuleStd.disabled = mp.enabled && !mp.isHost;
  }
  if (btnRuleVan) {
    btnRuleVan.classList.toggle('active', isVanillaLobby);
    btnRuleVan.disabled = mp.enabled && !mp.isHost;
  }
  const rulesHintEl = document.getElementById('mp-ruleset-hint');
  if (rulesHintEl) {
    rulesHintEl.textContent = isVanillaLobby
      ? '🍦 Vanille : sans Ult, Dash+, Évos Dash ni Outils • 🎯 Passe au magasin'
      : '⚡ Standard : Ultimates (R2), Évos Dash, Dash+ & Outils actifs';
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

  ctx.api.updateMapLockUI();

  ['ally', 'enemy'].forEach((teamKey) => {
    const containerEl = document.getElementById(`mp-slots-${teamKey}`);
    if (!containerEl) return;
    containerEl.innerHTML = '';

    const slotDefs = [
      { slot: 'ALL', label: '👑 Capitaine (G / C / D libres)' },
      { slot: 'G', label: 'Joueuse Gauche (G fixe)' },
      { slot: 'C', label: 'Joueuse Centre (C fixe)' },
      { slot: 'D', label: 'Joueuse Droite (D fixe)' }
    ];

    slotDefs.forEach((def) => {
      const occupants = mp.members.filter(
        (m) => m.team === teamKey && m.slot === def.slot
      );
      const isMine = occupants.some((m) => m.peerId === mp.myPeerId);
      const check = isMine ? { ok: true } : canAssignMemberSlot(mp.myPeerId, teamKey, def.slot);
      const isTakenByOther = occupants.length > 0 && !isMine;

      const row = document.createElement('div');
      row.className = `mp-slot-row ${isMine ? 'mine' : isTakenByOther || !check.ok ? 'occupied' : ''}`;

      const occNames =
        occupants.length > 0
          ? occupants.map((o) => `👤 ${escapeHtml(o.name)}`).join(', ')
          : check.ok
          ? (mp.lobbyMode === 'practice' ? '🧘 Libre (Aucune IA)' : '🤖 IA (Libre)')
          : `🔒 ${escapeHtml(check.reason)}`;

      row.innerHTML = `
        <div>
          <div style="font-weight:700;">${def.label}</div>
          <div style="font-size:0.75rem; color:${occupants.length > 0 ? '#fde047' : check.ok ? '#94a3b8' : '#fca5a5'};">${occNames}</div>
        </div>
      `;

      const joinSlotBtn = document.createElement('button');
      joinSlotBtn.className = 'action-btn';
      joinSlotBtn.style.padding = '5px 10px';
      joinSlotBtn.style.fontSize = '0.74rem';
      if (isMine) {
        joinSlotBtn.textContent = 'Choisi ✔';
      } else if (isTakenByOther) {
        joinSlotBtn.textContent = `Pris (${occupants[0].name})`;
      } else if (!check.ok) {
        joinSlotBtn.textContent = 'Complet (3/3)';
      } else {
        joinSlotBtn.textContent = 'Choisir';
      }
      joinSlotBtn.disabled = !mp.enabled || isMine || !check.ok;
      joinSlotBtn.onclick = () => selectMultiplayerSlot(teamKey, def.slot);

      row.appendChild(joinSlotBtn);
      containerEl.appendChild(row);
    });
  });
}


export function broadcastToast(html, duration = 4000) {
  ctx.api.showToast(html, duration);
  if (mp.enabled && mp.isHost) {
    sendNetMessage({ type: 'MP_TOAST', html, duration });
  }
}
