import { ctx } from '../state.js';
import {
  NET_MAGIC_0,
  NET_TYPE_PLAYER_INPUT,
  NET_TYPE_WORLD_STATE,
  MP_ROLES,
  MP_PLAYER_IDS,
  MP_PLAYER_STATES,
  MP_BALL_STATES,
  MP_COLORS
} from './shared.js';

const netTextEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const netTextDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

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

function encodePlayerInputPacket(msg) {
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

function encodeWorldPlayer(w, p) {
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

function encodeWorldBall(w, b) {
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

function encodeWorldStatePacket(msg, mapKeys) {
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
    encodeWorldPlayer(w, pList[i]);
  }

  const bList = Array.isArray(msg.balls) ? msg.balls : [];
  w.u8v(bList.length);
  for (let i = 0; i < bList.length; i++) {
    encodeWorldBall(w, bList[i]);
  }
  return w.toBuffer();
}

export function encodeNetPacket(msg) {
  if (!msg || !msg.type) return msg;
  if (msg.type === 'MP_PLAYER_INPUT') return encodePlayerInputPacket(msg);
  if (msg.type === 'MP_WORLD_STATE') {
    const mapKeys = Object.keys(ctx.world.MONTREAL_MAPS || {});
    return encodeWorldStatePacket(msg, mapKeys);
  }
  return msg;
}

function decodePlayerInputPacket(r) {
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

function decodeWorldPlayer(r) {
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
  return {
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
  };
}

function decodeWorldBall(r) {
  return {
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
  };
}

function decodeWorldStatePacket(r, mapKeys) {
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
  const players = [];
  for (let i = 0; i < pCount; i++) players.push(decodeWorldPlayer(r));

  const bCount = r.u8v();
  const balls = [];
  for (let i = 0; i < bCount; i++) balls.push(decodeWorldBall(r));

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
    players,
    balls
  };
}

export function decodeNetPacket(data) {
  if (!(data instanceof ArrayBuffer || ArrayBuffer.isView(data))) return data;
  try {
    const r = new NetBinReader(data);
    if (r.u8v() !== NET_MAGIC_0) return null;
    const packetType = r.u8v();
    if (packetType === NET_TYPE_PLAYER_INPUT) return decodePlayerInputPacket(r);
    if (packetType === NET_TYPE_WORLD_STATE) {
      const mapKeys = Object.keys(ctx.world.MONTREAL_MAPS || {});
      return decodeWorldStatePacket(r, mapKeys);
    }
  } catch (err) {
    return err ? null : null;
  }
  return null;
}
