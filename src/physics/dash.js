import {
  COLORS,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_SPEED,
  PAD_DASH_SPEED,
  DASH_EVO_META,
  state,
  mp,
  ctx,
} from '../state.js';
import { getPlayer, spawnParticles } from '../render3d.js';
import { sendNetMessage } from '../net.js';
import {
  triggerGamepadRumble,
  raycastScreenToWorld,
  showToast,
  hideMobaMoveMarker,
} from '../ui.js';
import { isDashUnlocked, markTutorialCheck } from '../modes.js';
import { THREE, getLocalMoveVector, normalizeOrFacing } from './shared.js';
import { setMobaMoveGoal } from './movement.js';
import { broadcastWorldState } from './network_sync.js';

const MAX_JUMP_MOMENTUM = 36.0;

function clampMomentum2D(vx, vz, maxSpeed = MAX_JUMP_MOMENTUM) {
  const len = Math.hypot(vx || 0, vz || 0);
  if (len > maxSpeed && len > 0.001) {
    const s = maxSpeed / len;
    return [vx * s, vz * s];
  }
  return [vx || 0, vz || 0];
}

export function getPlayerDashParams(p) {
  if (state.vanillaMode) {
    return {
      isSuper: false,
      kind: null,
      duration: DASH_DURATION,
      cooldown: DASH_COOLDOWN,
      speed: DASH_SPEED,
    };
  }
  const teamMeta = p ? state.teams[p.team] : null;
  const dashKind = (teamMeta?.powers?.[p.role]?.dashEvo) || null;
  const meta = dashKind ? DASH_EVO_META[dashKind] : null;
  const hasTeamDashPlus = !!(teamMeta && teamMeta.teamDashPlus);

  const baseSpeed = meta ? meta.speed : DASH_SPEED;
  const baseDuration = meta ? meta.duration : DASH_DURATION;
  const baseCooldown = meta ? meta.cooldown : DASH_COOLDOWN;

  const speed = hasTeamDashPlus ? baseSpeed * 1.15 : baseSpeed;
  const duration = hasTeamDashPlus ? baseDuration * (1.35 / 1.15) : baseDuration;

  return {
    isSuper: !!meta || hasTeamDashPlus,
    kind: meta ? dashKind : null,
    duration,
    cooldown: baseCooldown,
    speed,
  };
}

export function triggerBoomerangReturn(p) {
  if (!p || !p.boomerangOrigin || p.boomerangWindow <= 0 || p.state !== 'standing' || p.carryingBall) {
    return false;
  }
  const orig = p.boomerangOrigin;
  p.boomerangWindow = 0;
  p.boomerangOrigin = null;
  const dx = orig.x - p.pos.x;
  const dz = orig.z - p.pos.z;
  const dist = Math.hypot(dx, dz);
  spawnParticles(p.pos, 0x38bdf8, 14);
  if (dist > 0.35) {
    const returnDur = Math.max(0.2, dist / 65);
    p.dashKind = 'boomerang_return';
    p.dashTimer = returnDur;
    p.dashMaxDuration = returnDur;
    p.dashSpeed = dist / returnDur;
    p.dashIsSuper = true;
    p.dashDirX = dx / dist;
    p.dashDirZ = dz / dist;
    p.facingAngle = Math.atan2(p.dashDirX, p.dashDirZ);
  } else {
    p.dashTimer = 0;
  }
  spawnParticles(new THREE.Vector3(orig.x, orig.y + 0.5, orig.z), 0xfacc15, 14);
  ctx.api.playSfx?.('dash_boomerang_return', { pos: p.pos });
  if (p.team === state.myTeam && p.role === state.controlledRole) {
    triggerGamepadRumble(100, 0.45, 0.6);
    showToast('🪃 <strong>Retour Boomerang !</strong>', 1200);
  }
  return true;
}

export function executePlayerDash(p, dirX, dirZ, { isHuman = false } = {}) {
  if (!p || p.state !== 'standing' || p.carryingBall || p.isAirborne || p.isLaunching) return false;
  if (p.dashCooldown > 0 || p.dashTimer > 0) return false;
  const len = Math.hypot(dirX, dirZ);
  if (len < 0.001) return false;
  const dx = dirX / len;
  const dz = dirZ / len;

  const dp = getPlayerDashParams(p);
  p.dashTimer = dp.duration;
  p.dashMaxDuration = dp.duration;
  p.dashSpeed = dp.speed;
  p.dashKind = dp.kind;
  p.dashCooldown = dp.cooldown;
  p.dashCooldownMax = dp.cooldown;
  p.dashIsSuper = dp.isSuper;
  p.dashBouncesLeft = dp.kind === 'bounce' ? 3 : 0;
  p.slidePatchDist = 0;
  p.slideGlideTimer = 0;
  p.slideGlideVx = 0;
  p.slideGlideVz = 0;
  if (dp.kind === 'boomerang') {
    p.boomerangOrigin = { x: p.pos.x, y: p.pos.y, z: p.pos.z, onCanopy: !!p.onCanopy };
    p.boomerangWindow = 2.0;
  } else {
    p.boomerangOrigin = null;
    p.boomerangWindow = 0;
  }
  p.dashDirX = dx;
  p.dashDirZ = dz;
  p.facingAngle = Math.atan2(dx, dz);

  spawnParticles(p.pos, COLORS[p.color].hex, dp.isSuper ? 16 : 12);
  spawnParticles(p.pos, dp.isSuper ? 0x38bdf8 : 0xffffff, dp.isSuper ? 14 : 8);
  if (dp.isSuper) spawnParticles(p.pos, 0xfacc15, 8);
  ctx.api.playSfx?.(dp.kind ? 'dash_' + dp.kind : 'dash', { pos: p.pos, isSuper: dp.isSuper });
  if (isHuman && p.team === state.myTeam && p.role === state.controlledRole) {
    triggerGamepadRumble(dp.isSuper ? 130 : 90, dp.isSuper ? 0.5 : 0.35, dp.isSuper ? 0.7 : 0.5);
  }
  return true;
}

function resolveAerialDashDirection(p) {
  const { moveForward, moveRight } = getLocalMoveVector();
  const stickLen = Math.hypot(moveForward, moveRight);
  if (stickLen > 0.05) {
    setMobaMoveGoal(null);
    hideMobaMoveMarker();
    return [moveRight / stickLen, -moveForward / stickLen];
  }
  let dx = 0;
  let dz = 0;
  if (state.mobileMode) {
    if (state.mobaMoveTarget) {
      dx = state.mobaMoveTarget.x - p.pos.x;
      dz = state.mobaMoveTarget.z - p.pos.z;
    }
    setMobaMoveGoal(null);
    hideMobaMoveMarker();
    return normalizeOrFacing(dx, dz, p.facingAngle);
  }
  let aimHit = null;
  if (typeof state.mouseClientX === 'number' && typeof state.mouseClientY === 'number') {
    aimHit = raycastScreenToWorld(state.mouseClientX, state.mouseClientY);
    if (aimHit) state.mobaAimWorld = aimHit;
  }
  if (!aimHit) aimHit = state.mobaAimWorld;
  if (aimHit) {
    dx = aimHit.x - p.pos.x;
    dz = aimHit.z - p.pos.z;
  }
  if (Math.hypot(dx, dz) <= 0.05 && state.mobaMoveTarget) {
    dx = state.mobaMoveTarget.x - p.pos.x;
    dz = state.mobaMoveTarget.z - p.pos.z;
  }
  if (!state.mobaRightMouseDown) {
    setMobaMoveGoal(null);
    hideMobaMoveMarker();
  }
  return normalizeOrFacing(dx, dz, p.facingAngle);
}

function resolveCameraDashDirection() {
  const { moveForward, moveRight } = getLocalMoveVector();
  const camForwardX = -Math.sin(state.camYaw);
  const camForwardZ = -Math.cos(state.camYaw);
  const dx = camForwardX * moveForward - camForwardZ * moveRight;
  const dz = camForwardZ * moveForward + camForwardX * moveRight;
  const len = Math.hypot(dx, dz);
  if (len > 0.01) return [dx / len, dz / len];
  return [camForwardX, camForwardZ];
}

export function triggerDash(overrideAngle = null) {
  if (!isDashUnlocked()) {
    showToast('🔒 <strong>Dash verrouillé</strong> : rejoignez d’abord la balise bleue pour le débloquer !', 2200);
    return;
  }
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!p || p.state !== 'standing') return;
  if (p.carryingBall) {
    showToast('⚠️ <strong>Impossible de faire un dash</strong> en tenant un ballon !', 1600);
    return;
  }
  if (p.boomerangWindow > 0 && p.boomerangOrigin && triggerBoomerangReturn(p)) {
    return;
  }
  if (p.dashCooldown > 0 || p.dashTimer > 0) return;

  const resolvedOverride = Number.isFinite(overrideAngle)
    ? overrideAngle
    : ctx.api.getMobileAimOverride?.('dash');

  let dx = 0;
  let dz = 0;
  if (Number.isFinite(resolvedOverride)) {
    dx = Math.sin(resolvedOverride);
    dz = Math.cos(resolvedOverride);
    if (state.cameraMode === 'aerial' && !state.mobaRightMouseDown) {
      setMobaMoveGoal(null);
      hideMobaMoveMarker();
    }
  } else if (state.cameraMode === 'aerial') {
    [dx, dz] = resolveAerialDashDirection(p);
  } else {
    [dx, dz] = resolveCameraDashDirection();
  }

  if (executePlayerDash(p, dx, dz, { isHuman: true })) {
    if (state.mode === 'tutorial' && state.tutorialStep === 1) {
      markTutorialCheck('dashed');
    }
  }
}

export function triggerJump(fromNetwork = false, targetPlayer = null, remoteMomentum = null) {
  if (state.phase !== 'play') return false;
  const p = targetPlayer || getPlayer(state.myTeam, state.controlledRole);
  if (!p || p.state !== 'standing' || p.isAirborne || p.isLaunching) return false;
  if ((p.jumpCooldown || 0) > 0) return false;
  if (!state.teams[p.team]?.teamJump) return false;

  let mvx = 0;
  let mvz = 0;
  if (
    fromNetwork &&
    remoteMomentum &&
    Number.isFinite(remoteMomentum.mvx) &&
    Number.isFinite(remoteMomentum.mvz)
  ) {
    [mvx, mvz] = clampMomentum2D(remoteMomentum.mvx, remoteMomentum.mvz);
    p.dashTimer = 0;
    p.padBoostTimer = 0;
    p.dashMomentumGrace = 0;
  } else if ((p.dashTimer || 0) > 0) {
    const dashSpeed = p.dashSpeed || DASH_SPEED;
    [mvx, mvz] = clampMomentum2D(p.dashDirX * dashSpeed * 0.9, p.dashDirZ * dashSpeed * 0.9);
    p.dashTimer = 0;
    p.dashMomentumGrace = 0;
  } else if ((p.padBoostTimer || 0) > 0) {
    [mvx, mvz] = clampMomentum2D(p.padDirX * PAD_DASH_SPEED * 0.85, p.padDirZ * PAD_DASH_SPEED * 0.85);
    p.padBoostTimer = 0;
    p.dashMomentumGrace = 0;
  } else if ((p.dashMomentumGrace || 0) > 0) {
    [mvx, mvz] = clampMomentum2D((p.lastDashVx || 0) * 0.88, (p.lastDashVz || 0) * 0.88);
    p.dashMomentumGrace = 0;
  }

  if (mp.enabled && !mp.isHost && !fromNetwork) {
    sendNetMessage({
      type: 'MP_PLAYER_JUMP',
      round: state.round,
      peerId: mp.myPeerId,
      team: p.team,
      role: p.role,
      mvx,
      mvz,
    });
  }

  p.isAirborne = true;
  p.airSource = 'jump';
  p.vy = 10.5;
  p.jumpMomentumVx = mvx;
  p.jumpMomentumVz = mvz;
  p.jumpCooldown = 1.6;
  p.onSlidePatch = false;
  p.iceSlideDirX = 0;
  p.iceSlideDirZ = 0;
  p.iceSlideSpeed = 0;
  spawnParticles(p.pos, 0x38bdf8, 10);
  if (Math.hypot(mvx, mvz) > 12) spawnParticles(p.pos, 0xffffff, 8);
  ctx.api.playSfx?.('jump', { pos: p.pos, super: Math.hypot(mvx, mvz) > 12 });
  if (!fromNetwork && p.team === state.myTeam && p.role === state.controlledRole) {
    triggerGamepadRumble(60, 0.25, 0.35);
  }
  return true;
}

export function handleRemotePlayerJump(msg) {
  if (!mp.isHost || !msg) return;
  if (typeof msg.round === 'number' && msg.round !== state.round) return;
  const p = getPlayer(msg.team, msg.role);
  if (!p) return;
  const remoteMom =
    typeof msg.mvx === 'number' && typeof msg.mvz === 'number'
      ? { mvx: msg.mvx, mvz: msg.mvz }
      : null;
  if (triggerJump(true, p, remoteMom)) {
    broadcastWorldState();
  }
}
