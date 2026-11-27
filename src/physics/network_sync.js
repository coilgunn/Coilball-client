import { COLORS, state, mp, ctx, lerpAngle } from '../state.js';
import {
  players,
  balls,
  applyBallColor,
  applyPlayerColor,
} from '../render3d.js';
import { MONTREAL_MAPS, getStructureSurfaceY } from '../world.js';
import {
  getMemberControlledRole,
  sendNetMessage,
  syncLocalRoleFromMembers,
} from '../net.js';
import {
  showToast,
  selectArenaMap,
  updateTopHUD,
  updateRosterHUD,
} from '../ui.js';
import { THREE } from './shared.js';
import { applyHumanMovement } from './movement.js';

function serializePlayerSnapshot(p) {
  return {
    id: p.id,
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z,
    vx: p.vel.x,
    vy: p.vel.y,
    vz: p.vel.z,
    a: p.facingAngle,
    st: p.state,
    c: p.color,
    oc: p.onCanopy ? 1 : 0,
    cb: p.carryingBall ? p.carryingBall.id : null,
    r1: p.rule1Partner ? p.rule1Partner.id : null,
    su: !!(state.teams[p.team]?.powers?.[p.role]?.standUp),
    uu: p.ultUsed ? 1 : 0,
    fs: p.netForceSeq || 0,
    lt: p.leafUltTimer > 0 ? Number(p.leafUltTimer.toFixed(2)) : 0,
    ws: p.waterShieldTimer > 0 ? Number(p.waterShieldTimer.toFixed(2)) : 0,
    sl:
      p.state === 'standing' &&
      ((p.dashTimer > 0 && p.dashKind === 'slide' && !p.carryingBall) ||
        (p.slideGlideTimer > 0 && !p.carryingBall) ||
        p.onSlidePatch)
        ? 1
        : 0,
    ra: p.revealedTo ? (p.revealedTo.ally ? 1 : 0) : p.team === 'ally' ? 1 : 0,
    re: p.revealedTo ? (p.revealedTo.enemy ? 1 : 0) : p.team === 'enemy' ? 1 : 0,
    sa: p.teamSeeingBack ? (p.teamSeeingBack.ally ? 1 : 0) : p.team === 'ally' ? 1 : 0,
    se: p.teamSeeingBack ? (p.teamSeeingBack.enemy ? 1 : 0) : p.team === 'enemy' ? 1 : 0,
    bo:
      p.boomerangOrigin && p.boomerangWindow > 0
        ? [
            Number(p.boomerangOrigin.x.toFixed(2)),
            Number(p.boomerangOrigin.y.toFixed(2)),
            Number(p.boomerangOrigin.z.toFixed(2)),
            Number(p.boomerangWindow.toFixed(2)),
            p.boomerangOrigin.onCanopy ? 1 : 0,
          ]
        : null,
  };
}

export function broadcastWorldState() {
  sendNetMessage({
    type: 'MP_WORLD_STATE',
    mapId: state.mapId,
    round: state.round,
    seq: ++mp.worldSeq,
    allyPV: state.allyPV,
    allyPE: state.allyPE,
    enemyPV: state.enemyPV,
    enemyPE: state.enemyPE,
    roles: mp.members.map((m) => ({
      id: m.peerId,
      r: getMemberControlledRole(m),
    })),
    players: players.map(serializePlayerSnapshot),
    balls: balls.map((b) => ({
      id: b.id,
      x: b.pos.x,
      y: b.pos.y,
      z: b.pos.z,
      vx: b.vel.x,
      vy: b.vel.y,
      vz: b.vel.z,
      st: b.state,
      c: b.color,
      oc: b.onCanopy ? 1 : 0,
    })),
  });
}

function applySnapshotRolesAndScores(snapshot) {
  let rosterDirty = false;
  if (Array.isArray(snapshot.roles)) {
    snapshot.roles.forEach((entry) => {
      const m = mp.members.find((mem) => mem.peerId === entry.id);
      if (m && ['G', 'C', 'D'].includes(entry.r) && m.activeRole !== entry.r) {
        m.activeRole = entry.r;
        rosterDirty = true;
      }
    });
    if (rosterDirty) syncLocalRoleFromMembers();
  }

  if (typeof snapshot.allyPV === 'number') {
    if (
      state.allyPV !== snapshot.allyPV ||
      state.allyPE !== snapshot.allyPE ||
      state.enemyPV !== snapshot.enemyPV ||
      state.enemyPE !== snapshot.enemyPE
    ) {
      state.allyPV = snapshot.allyPV;
      state.allyPE = snapshot.allyPE;
      state.enemyPV = snapshot.enemyPV;
      state.enemyPE = snapshot.enemyPE;
      updateTopHUD();
    }
  }
  return rosterDirty;
}

function applySnapshotBalls(snapshot) {
  if (!snapshot.balls) return;
  snapshot.balls.forEach((sb) => {
    const b = balls.find((item) => item.id === sb.id);
    if (!b) return;
    b.state = sb.st;
    if (b.state !== 'carried') b.carrier = null;
    if (b.color !== sb.c) applyBallColor(b, sb.c);
    b.onCanopy = !!sb.oc;
    b.vel.set(sb.vx || 0, sb.vy || 0, sb.vz || 0);
    b.targetPos.set(sb.x, sb.y, sb.z);
    if (b.pos.distanceTo(b.targetPos) > 10 || b.state === 'scored') {
      b.pos.copy(b.targetPos);
      b.mesh.group.position.copy(b.pos);
    }
  });
}

function applySnapshotPlayerStatus(p, sp) {
  let dirty = false;
  if (p.color !== sp.c) {
    applyPlayerColor(p, sp.c);
    dirty = true;
  }
  if (p.state !== sp.st) dirty = true;
  p.state = sp.st;
  const nextBall = sp.cb !== null ? balls.find((b) => b.id === sp.cb) : null;
  if (p.carryingBall !== nextBall) dirty = true;
  p.carryingBall = nextBall;
  if (p.carryingBall) p.carryingBall.carrier = p;
  p.rule1Partner = sp.r1 ? players.find((item) => item.id === sp.r1) || null : null;
  if (typeof sp.su === 'boolean' && state.teams[p.team]?.powers?.[p.role]) {
    if (state.teams[p.team].powers[p.role].standUp !== sp.su) {
      state.teams[p.team].powers[p.role].standUp = sp.su;
      dirty = true;
    }
  }
  const localCtl = p.team === state.myTeam && p.role === state.controlledRole;
  if (typeof sp.uu === 'number') {
    const nextUltUsed = !!sp.uu;
    if (p.ultUsed !== nextUltUsed && !(localCtl && p.ultUsed && !nextUltUsed)) {
      p.ultUsed = nextUltUsed;
      dirty = true;
    }
  }
  if (typeof sp.lt === 'number' && !(localCtl && sp.lt === 0 && p.leafUltTimer > 0 && !nextBall)) {
    p.leafUltTimer = sp.lt;
  }
  if (typeof sp.ws === 'number') p.waterShieldTimer = sp.ws;
  if (typeof sp.sl === 'number') p.isSlidingNet = !!sp.sl;
  if (!localCtl) {
    if (Array.isArray(sp.bo) && sp.bo.length >= 4) {
      p.boomerangOrigin = { x: sp.bo[0], y: sp.bo[1], z: sp.bo[2], onCanopy: !!sp.bo[4] };
      p.boomerangWindow = sp.bo[3];
    } else if (sp.bo === null) {
      p.boomerangOrigin = null;
      p.boomerangWindow = 0;
    }
  }
  return dirty;
}

function applySnapshotPlayerVision(p, sp) {
  let dirty = false;
  if (!p.teamSeeingBack) p.teamSeeingBack = { ally: p.team === 'ally', enemy: p.team === 'enemy' };
  if (typeof sp.sa === 'number') p.teamSeeingBack.ally = !!sp.sa;
  if (typeof sp.se === 'number') p.teamSeeingBack.enemy = !!sp.se;
  const hostTeamSeesBack = state.myTeam === 'ally' ? !!p.teamSeeingBack.ally : !!p.teamSeeingBack.enemy;
  if (p.team !== state.myTeam && hostTeamSeesBack !== p.currentlySeeingBack) {
    p.currentlySeeingBack = hostTeamSeesBack;
    dirty = true;
  }
  if (!p.revealedTo) p.revealedTo = { ally: p.team === 'ally', enemy: p.team === 'enemy' };
  if (typeof sp.ra === 'number') p.revealedTo.ally = !!sp.ra;
  if (typeof sp.re === 'number') p.revealedTo.enemy = !!sp.re;
  const teamKnowsBack = state.myTeam === 'ally' ? p.revealedTo.ally : p.revealedTo.enemy;
  if (teamKnowsBack && !p.backRevealed) {
    p.backRevealed = true;
    dirty = true;
    if (p.team !== state.myTeam && state.phase === 'play') {
      ctx.api.playSfx?.('back_reveal');
      const cInfo = COLORS[p.color];
      if (cInfo) {
        showToast(
          `👁️ <strong>Dos de Adversaire ${p.role} découvert : ${cInfo.name} (${cInfo.symbol}) !</strong>`,
          3000
        );
      }
    }
  }
  return dirty;
}

function applySnapshotPlayerPosition(p, sp) {
  const isLocalControlled =
    p.team === state.myTeam && p.role === state.controlledRole && p.state === 'standing';
  if (isLocalControlled) {
    const distErr = Math.hypot(p.pos.x - sp.x, p.pos.z - sp.z);
    const maxTolerance =
      p.dashTimer > 0 || p.padBoostTimer > 0 || p.leafUltTimer > 0 || p.isAirborne || p.isLaunching ? 30 : 14;
    const forced = typeof sp.fs === 'number' && sp.fs !== (p.netForceSeqSeen || 0);
    if (typeof sp.fs === 'number') p.netForceSeqSeen = sp.fs;
    if (forced || distErr > maxTolerance) {
      p.onCanopy = !!sp.oc;
      p.pos.set(sp.x, typeof sp.y === 'number' ? sp.y : 0, sp.z);
    }
    p.targetPos.copy(p.pos);
    return;
  }
  p.onCanopy = !!sp.oc;
  const sy = typeof sp.y === 'number' ? sp.y : 0;
  p.targetPos.set(sp.x, sy, sp.z);
  p.targetFacingAngle = sp.a;
  p.vel.set(sp.vx || 0, sp.vy || 0, sp.vz || 0);
  if (Math.hypot(p.pos.x - sp.x, p.pos.z - sp.z) > 10) {
    p.pos.set(sp.x, sy, sp.z);
    p.facingAngle = sp.a;
  }
}

export function applyWorldStateFromHost(snapshot) {
  if (typeof snapshot.round === 'number' && snapshot.round !== state.round) return;
  if (typeof snapshot.seq === 'number') {
    if (snapshot.seq < mp.lastHostWorldSeq) return;
    mp.lastHostWorldSeq = snapshot.seq;
  }
  if (snapshot.mapId && MONTREAL_MAPS[snapshot.mapId] && snapshot.mapId !== state.mapId) {
    selectArenaMap(snapshot.mapId, false, { force: true, fromNetwork: true });
  }

  let rosterDirty = applySnapshotRolesAndScores(snapshot);
  applySnapshotBalls(snapshot);

  if (snapshot.players) {
    snapshot.players.forEach((sp) => {
      const p = players.find((item) => item.id === sp.id);
      if (!p) return;
      if (applySnapshotPlayerStatus(p, sp)) rosterDirty = true;
      if (applySnapshotPlayerVision(p, sp)) rosterDirty = true;
      applySnapshotPlayerPosition(p, sp);
    });
  }

  if (rosterDirty) updateRosterHUD();
  const anyRule1 = players.some((p) => p.state === 'rule1');
  document.getElementById('rule1-alert').classList.toggle('hidden', !anyRule1);
}

export function findRemoteInputForPlayer(p, now) {
  if (!mp.enabled) return null;
  for (const peerKey in mp.remoteInputs) {
    const inp = mp.remoteInputs[peerKey];
    if (inp && inp.team === p.team && inp.role === p.role && now - inp.lastSeen < 10000) {
      return inp;
    }
  }
  return null;
}

export function applyRemotePlayerSnapshot(p, remote, dt, now) {
  if (typeof remote.x !== 'number' || typeof remote.z !== 'number') {
    applyHumanMovement(p, remote.moveForward, remote.moveRight, remote.camYaw, dt);
    return;
  }
  if (typeof remote.oc === 'boolean') p.onCanopy = remote.oc;
  const age = Math.min(0.15, Math.max(0, (now - remote.lastSeen) * 0.001));
  const targetX = remote.x + (remote.vx || 0) * age;
  const targetY =
    typeof remote.y === 'number'
      ? remote.y + (remote.vy || 0) * age
      : getStructureSurfaceY(targetX, remote.z, !!p.onCanopy).y;
  const targetZ = remote.z + (remote.vz || 0) * age;
  const snapAlpha = Math.min(1, 22 * dt);
  p.pos.x = THREE.MathUtils.lerp(p.pos.x, targetX, snapAlpha);
  p.pos.y = THREE.MathUtils.lerp(p.pos.y, targetY, snapAlpha);
  p.pos.z = THREE.MathUtils.lerp(p.pos.z, targetZ, snapAlpha);
  p.vel.set(remote.vx || 0, remote.vy || 0, remote.vz || 0);
  if (typeof remote.facingAngle === 'number') {
    p.facingAngle = lerpAngle(p.facingAngle, remote.facingAngle, snapAlpha);
  }
}
