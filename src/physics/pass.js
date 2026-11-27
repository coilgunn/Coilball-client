import {
  COLORS,
  TUTORIAL_STEPS,
  PASS_CHARGE_SPEC,
  getPassSnapHalfAngle,
  canPlayerPassOrThrow,
  state,
  mp,
  ctx,
} from '../state.js';
import { players, getPlayer, spawnParticles } from '../render3d.js';
import { updateUltHudWidget } from '../ultimates.js';
import { sendNetMessage, broadcastToast } from '../net.js';
import { isMenuOpen, showToast, updateRosterHUD } from '../ui.js';
import { getLocalMoveVector, resolveLocalActionAimAngle } from './shared.js';
import { deployPlayerTool } from './tools.js';
import { broadcastWorldState } from './network_sync.js';

function findBestPassAllyInRange(p, radius, aimAngle) {
  if (!p) return null;
  const resolvedAngle = Number.isFinite(aimAngle) ? aimAngle : p.facingAngle || 0;
  const dirX = Math.sin(resolvedAngle);
  const dirZ = Math.cos(resolvedAngle);
  const minCos = Math.cos(getPassSnapHalfAngle(!!state.mobileMode));

  let bestAlly = null;
  let bestScore = -Infinity;
  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    if (
      !a ||
      a.team !== p.team ||
      a.id === p.id ||
      a.tutorialHidden ||
      a.state !== 'standing' ||
      a.carryingBall
    ) {
      continue;
    }
    const dx = a.pos.x - p.pos.x;
    const dz = a.pos.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > radius) continue;

    const dot = dist > 0.001 ? (dx / dist) * dirX + (dz / dist) * dirZ : 1;
    if (dot < minCos) continue;

    const score = dot - dist * 0.002;
    if (score > bestScore) {
      bestScore = score;
      bestAlly = a;
    }
  }
  return bestAlly;
}

export function cancelPassCharge() {
  if (!state.passCharge) return;
  state.passCharge.active = false;
  state.passCharge.elapsed = 0;
  state.passCharge.radius = PASS_CHARGE_SPEC.minR;
  state.passCharge.targetRole = null;
  state.passCharge.aimAngle = null;
  state.passCharge.source = null;
}

export function beginPassCharge(source = 'kb') {
  if (state.phase !== 'play' || isMenuOpen()) return false;
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!p || p.state !== 'standing' || !p.carryingBall) return false;
  if (!canPlayerPassOrThrow(p)) {
    showToast('🔒 <strong>Passe verrouillée (Mode Vanille)</strong> : achetez 🎯 Passe au magasin (Ronde 3) !', 2200);
    return false;
  }
  if (state.passCharge.active) return true;

  const aimAngle = resolveLocalActionAimAngle(p, null);
  const bestAlly = findBestPassAllyInRange(p, PASS_CHARGE_SPEC.minR, aimAngle);

  state.passCharge.active = true;
  state.passCharge.elapsed = 0;
  state.passCharge.radius = PASS_CHARGE_SPEC.minR;
  state.passCharge.aimAngle = aimAngle;
  state.passCharge.targetRole = bestAlly ? bestAlly.role : null;
  state.passCharge.source = source;
  ctx.api.playSfx?.('pass_charge');
  return true;
}

export function updatePassCharge(dt) {
  if (!state.passCharge || !state.passCharge.active) return;
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (state.phase !== 'play' || isMenuOpen() || !p || p.state !== 'standing' || !p.carryingBall) {
    cancelPassCharge();
    return;
  }

  state.passCharge.elapsed = (state.passCharge.elapsed || 0) + (dt || 0);
  const t = Math.max(0, Math.min(1, state.passCharge.elapsed / PASS_CHARGE_SPEC.chargeTime));
  const radius = PASS_CHARGE_SPEC.minR + (PASS_CHARGE_SPEC.maxR - PASS_CHARGE_SPEC.minR) * t;
  state.passCharge.radius = radius;

  const aimAngle = resolveLocalActionAimAngle(p, null);
  state.passCharge.aimAngle = aimAngle;

  const bestAlly = findBestPassAllyInRange(p, radius, aimAngle);
  state.passCharge.targetRole = bestAlly ? bestAlly.role : null;
}

function executeTargetedPass(p, ball, validTarget, aimAngle) {
  const dx = validTarget.pos.x - p.pos.x;
  const dz = validTarget.pos.z - p.pos.z;
  const dist = Math.hypot(dx, dz);
  const fallbackAng = Number.isFinite(aimAngle) ? aimAngle : p.facingAngle || 0;
  const dirX = dist > 0.01 ? dx / dist : Math.sin(fallbackAng);
  const dirZ = dist > 0.01 ? dz / dist : Math.cos(fallbackAng);
  p.facingAngle = Math.atan2(dirX, dirZ);

  const startX = p.pos.x + dirX * 1.05;
  const startY = p.pos.y + 1.25;
  const startZ = p.pos.z + dirZ * 1.05;
  ball.pos.set(startX, startY, startZ);

  const flightTime = Math.max(0.20, Math.min(0.75, dist / 32.0));
  const dy = validTarget.pos.y + 1.05 - startY;
  const vx = (validTarget.pos.x - startX) / flightTime;
  const vz = (validTarget.pos.z - startZ) / flightTime;
  const vy = (dy + 0.5 * 9.8 * flightTime * flightTime) / flightTime;
  ball.vel.set(vx, vy, vz);
  ball.passTargetId = validTarget.id;
  ball.passFlightRemaining = flightTime;

  spawnParticles(ball.pos, COLORS[ball.color].hex, 10);
  broadcastToast(`🎯 <strong>${p.role} passe le ballon à ${validTarget.role} !</strong>`, 2200);
}

function executeFreeThrow(p, ball, aimAngle, chargeRatio) {
  const ang = Number.isFinite(aimAngle) ? aimAngle : p.facingAngle || 0;
  const dirX = Math.sin(ang);
  const dirZ = Math.cos(ang);
  p.facingAngle = ang;

  ball.pos.set(p.pos.x + dirX * 1.1, p.pos.y + 1.15, p.pos.z + dirZ * 1.1);
  const hSpeed = 21.5 + 10.5 * chargeRatio;
  const vSpeed = 2.4 + 1.1 * chargeRatio;
  ball.vel.set(dirX * hSpeed, vSpeed, dirZ * hSpeed);
  ball.passTargetId = null;
  ball.passFlightRemaining = 0;

  spawnParticles(ball.pos, COLORS[ball.color].hex, 8);
  broadcastToast(`🎯 <strong>${p.role} lance le ballon !</strong>`, 2200);
  if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.PASS && p.team === 'ally') {
    showToast(
      state.mobileMode
        ? '💡 <strong>Tir libre !</strong> Maintenez <strong>⚽ Passe</strong> et visez <strong>💧 C</strong> pour verrouiller la passe !'
        : '💡 <strong>Tir libre !</strong> Maintenez <strong>[E]</strong> en visant <strong>💧 C</strong> jusqu’à ce que le cercle l’atteigne, puis relâchez !',
      3600
    );
  }
}

export function executeBallPassOrThrow(p, targetAlly, aimAngle, chargeRatio = 0) {
  if (!p || p.state !== 'standing' || !p.carryingBall) return false;

  const ball = p.carryingBall;
  p.carryingBall = null;
  ball.state = 'thrown';
  ball.carrier = null;
  ball.thrownByTeam = p.team;
  ball.thrownById = p.id;
  ball.passIgnoreTimer = 0.22;
  ball.onCanopy = !!p.onCanopy;

  const cr = Math.max(0, Math.min(1, Number(chargeRatio) || 0));
  const validTarget =
    targetAlly &&
    targetAlly.id !== p.id &&
    targetAlly.team === p.team &&
    !targetAlly.tutorialHidden &&
    targetAlly.state === 'standing' &&
    !targetAlly.carryingBall
      ? targetAlly
      : null;

  if (validTarget) executeTargetedPass(p, ball, validTarget, aimAngle);
  else executeFreeThrow(p, ball, aimAngle, cr);

  ctx.api.playSfx?.(validTarget ? 'ball_pass' : 'ball_throw', { pos: p.pos });
  updateRosterHUD();
  updateUltHudWidget();
  return true;
}

export function releasePassCharge(overrideAngle = null) {
  if (!state.passCharge || !state.passCharge.active) return false;
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!p || p.state !== 'standing' || !p.carryingBall || !canPlayerPassOrThrow(p)) {
    cancelPassCharge();
    return false;
  }

  const aimAngle = resolveLocalActionAimAngle(p, overrideAngle);
  const chargeRatio = Math.max(
    0,
    Math.min(1, (state.passCharge.elapsed || 0) / PASS_CHARGE_SPEC.chargeTime)
  );
  const radius = state.passCharge.radius || PASS_CHARGE_SPEC.minR;
  const bestAlly = findBestPassAllyInRange(p, radius, aimAngle);
  const targetRole = bestAlly ? bestAlly.role : null;

  cancelPassCharge();

  if (mp.enabled && !mp.isHost) {
    sendNetMessage({
      type: 'MP_BALL_PASS',
      round: state.round,
      peerId: mp.myPeerId,
      team: p.team,
      role: p.role,
      targetRole,
      aimAngle,
      chargeRatio,
      isMobile: !!state.mobileMode,
    });
    return true;
  }

  const ok = executeBallPassOrThrow(p, bestAlly, aimAngle, chargeRatio);
  if (ok && mp.enabled && mp.isHost) broadcastWorldState();
  return ok;
}

export function handleRemoteBallPass(msg) {
  if (!mp.isHost || !msg) return;
  if (typeof msg.round === 'number' && msg.round !== state.round) return;
  const p = getPlayer(msg.team, msg.role);
  if (!p || p.state !== 'standing' || !p.carryingBall || !canPlayerPassOrThrow(p)) return;

  const aimAngle = Number.isFinite(msg.aimAngle) ? msg.aimAngle : p.facingAngle;
  const chargeRatio = Math.max(0, Math.min(1, Number(msg.chargeRatio) || 0));
  let targetAlly = null;

  if (msg.targetRole && ['G', 'C', 'D'].includes(msg.targetRole) && msg.targetRole !== p.role) {
    const cand = getPlayer(p.team, msg.targetRole);
    const maxAllowedR =
      PASS_CHARGE_SPEC.minR +
      (PASS_CHARGE_SPEC.maxR - PASS_CHARGE_SPEC.minR) * chargeRatio +
      2.5;
    if (cand && !cand.tutorialHidden && cand.state === 'standing' && !cand.carryingBall) {
      const dx = cand.pos.x - p.pos.x;
      const dz = cand.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      const hostMinCos = Math.cos(getPassSnapHalfAngle(!!msg.isMobile) + 0.18);
      const dot = dist > 0.001 ? (dx / dist) * Math.sin(aimAngle) + (dz / dist) * Math.cos(aimAngle) : 1;
      if (dist <= maxAllowedR && (dist <= 0.001 || dot >= hostMinCos)) {
        targetAlly = cand;
      }
    }
  }

  if (executeBallPassOrThrow(p, targetAlly, aimAngle, chargeRatio)) {
    broadcastWorldState();
  }
}

function handleStandingBallAction(p, overrideAngle) {
  if (!canPlayerPassOrThrow(p)) {
    cancelPassCharge();
    showToast('🔒 <strong>Passe verrouillée (Mode Vanille)</strong> : achetez 🎯 Passe au magasin (Ronde 3) !', 2200);
    return;
  }
  if (state.passCharge && state.passCharge.active) {
    releasePassCharge(overrideAngle);
    return;
  }
  const aimAngle = resolveLocalActionAimAngle(p, overrideAngle);
  const nearAlly = findBestPassAllyInRange(p, PASS_CHARGE_SPEC.minR, aimAngle);
  const targetRole = nearAlly ? nearAlly.role : null;
  if (mp.enabled && !mp.isHost) {
    sendNetMessage({
      type: 'MP_BALL_PASS',
      round: state.round,
      peerId: mp.myPeerId,
      team: p.team,
      role: p.role,
      targetRole,
      aimAngle,
      chargeRatio: 0,
      isMobile: !!state.mobileMode,
    });
    return;
  }
  const ok = executeBallPassOrThrow(p, nearAlly, aimAngle, 0);
  if (ok && mp.enabled && mp.isHost) broadcastWorldState();
}

export function handleActionKey(overrideAngle = null) {
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!p) return;

  if (p.state === 'standing' && p.carryingBall) {
    handleStandingBallAction(p, overrideAngle);
    return;
  }

  const teamPowers = state.teams[p.team]?.powers?.[p.role];
  if (Number.isFinite(overrideAngle)) {
    p.facingAngle = overrideAngle;
  } else if (
    state.cameraMode === 'aerial' &&
    state.mobaAimWorld &&
    !p.carryingBall &&
    p.state === 'standing' &&
    !state.vanillaMode &&
    teamPowers?.toolEvo
  ) {
    const adx = state.mobaAimWorld.x - p.pos.x;
    const adz = state.mobaAimWorld.z - p.pos.z;
    if (Math.hypot(adx, adz) > 0.25) p.facingAngle = Math.atan2(adx, adz);
  }

  if (mp.enabled && !mp.isHost) {
    const { moveForward, moveRight } = getLocalMoveVector();
    sendNetMessage({
      type: 'MP_PLAYER_INPUT',
      round: state.round,
      peerId: mp.myPeerId,
      seq: ++mp.inputSeq,
      team: state.myTeam,
      role: state.controlledRole,
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      vx: p.vel.x,
      vy: p.vel.y,
      vz: p.vel.z,
      oc: p.onCanopy ? 1 : 0,
      facingAngle: p.facingAngle,
      moveForward,
      moveRight,
      camYaw: state.cameraMode === 'aerial' ? 0 : state.camYaw,
      actionTriggered: true,
    });
    return;
  }

  triggerPlayerAction(p);
}

export function triggerPlayerAction(p) {
  const teamMeta = state.teams[p.team];
  const pwr = teamMeta?.powers?.[p.role] || {};

  if (p.state === 'sitting' && pwr.standUp) {
    pwr.standUp = false;
    p.state = 'standing';
    spawnParticles(p.pos, 0xfacc15, 20);
    ctx.api.playSfx?.('stand_up', { pos: p.pos });
    broadcastToast(`⚡ <strong>${p.role} utilise "Se relever" !</strong> Elle reprend le jeu !`, 3500);
    updateRosterHUD();
    return;
  }

  if (p.state === 'standing' && p.carryingBall) {
    if (!canPlayerPassOrThrow(p)) return;
    executeBallPassOrThrow(p, null, p.facingAngle, 0);
    return;
  }

  if (!state.vanillaMode && p.state === 'standing' && !p.carryingBall && pwr.toolEvo) {
    deployPlayerTool(p, pwr.toolEvo, {
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      facingAngle: p.facingAngle,
      onCanopy: !!p.onCanopy,
      fromNetwork: false,
    });
  }
}
