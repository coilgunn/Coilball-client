import { COLORS, FIELD, getPassSnapHalfAngle, state, ctx } from '../state.js';
import { players, balls, getPlayer } from '../render3d.js';
import { VISION_SPEC, isPointInJungleBush, hasClearLineOfSight, hasAllyVisionNear } from '../world.js';
import { canPlayerUseUltimate, cancelUltimatePreview, hideUltimatePreview } from '../ultimates.js';
import { isMenuOpen } from './shared.js';

export const AIM_DRAG_THRESHOLD_PX = 14;
export const AIM_HOLD_DELAY_MS = 160;
export const AIM_MAX_RADIUS_PX = 46;

export const mobileInput = {
  joyPointerId: null,
  joyTouchId: null,
  joyMouseDown: false,
  joyForward: 0,
  joyRight: 0,
  camPointerId: null,
  camX: 0,
  camY: 0,
  camRight: 0,
  camForward: 0,
  aimAction: null,
  aimPointerId: null,
  aimMode: 'idle',
  aimStartX: 0,
  aimStartY: 0,
  aimCenterX: 0,
  aimCenterY: 0,
  aimStartMs: 0,
  aimNx: 0,
  aimNy: 0,
  aimLen: 0,
  aimAngle: null,
  aimBtnRadius: 0,
  aimLeftButton: false,
  aimCancelled: false,
  aimHoldTimer: null
};

export function detectDefaultMobileDevice() {
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const maxTouch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
  const smallViewport = (window.innerWidth || 1280) <= 900 || (window.innerHeight || 720) <= 540;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobi/i.test(ua) || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  return mobileUa || ((coarse || maxTouch) && smallViewport);
}

export function stickToWorldAngle(nx, ny) {
  const refYaw = state.cameraMode === 'aerial' ? 0 : state.camYaw;
  const fwdX = -Math.sin(refYaw);
  const fwdZ = -Math.cos(refYaw);
  const rightX = -fwdZ;
  const rightZ = fwdX;
  return Math.atan2(fwdX * ny + rightX * nx, fwdZ * ny + rightZ * nx);
}

export function getDefaultMobileForwardAngle(p) {
  const joyLen = Math.hypot(mobileInput.joyRight || 0, mobileInput.joyForward || 0);
  if (joyLen > 0.15) {
    return stickToWorldAngle(mobileInput.joyRight / joyLen, mobileInput.joyForward / joyLen);
  }
  if (state.cameraMode === 'tps') {
    return Math.atan2(-Math.sin(state.camYaw), -Math.cos(state.camYaw));
  }
  return p ? p.facingAngle || 0 : 0;
}

function isEnemyValidMobileAutoAimTarget(p, enemy, maxDist) {
  if (!p || !enemy || enemy.team === p.team || enemy.id === p.id) return false;
  if (enemy.tutorialHidden || enemy.state !== 'standing') return false;
  if (Boolean(enemy.onCanopy) !== Boolean(p.onCanopy)) return false;
  if (Math.abs((enemy.pos.y || 0) - (p.pos.y || 0)) > 2.35) return false;
  const inStealthBush =
    !!isPointInJungleBush(enemy.pos) &&
    !hasAllyVisionNear(enemy.pos, VISION_SPEC.bushSpotRange, state.myTeam);
  if (inStealthBush) return false;
  if (enemy.mesh && enemy.mesh.root && enemy.mesh.root.visible === false) return false;
  if (enemy.visibleTo && enemy.visibleTo[state.myTeam] === false) return false;
  const dist = Math.hypot(enemy.pos.x - p.pos.x, enemy.pos.z - p.pos.z);
  return dist >= 0.05 && dist <= maxDist;
}

function findNearestGroundBallOfColor(actor, maxDist) {
  let bestBall = null;
  let bestDist = maxDist;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (!b || b.tutorialHidden || b.state !== 'ground' || b.color !== actor.color) continue;
    if (Boolean(b.onCanopy) !== Boolean(actor.onCanopy)) continue;
    const d = Math.hypot(b.pos.x - actor.pos.x, b.pos.z - actor.pos.z);
    if (d < bestDist && d > 0.1) {
      bestDist = d;
      bestBall = b;
    }
  }
  return bestBall;
}

function getMobileDashRange(actor) {
  const dashKind = state.teams[actor.team]?.powers?.[actor.role]?.dashEvo || null;
  const teamMult = state.teams[actor.team]?.teamDashPlus ? 1.35 : 1.0;
  const baseDist =
    dashKind === 'bounce'
      ? 12.15
      : dashKind === 'slide'
        ? 18.22
        : dashKind === 'boomerang'
          ? 9.11
          : 6.08;
  return { dashKind, range: baseDist * teamMult };
}

function computeMobileUltAutoAim(actor) {
  if (actor.color === 'red' || actor.color === 'blue') {
    const maxRange = actor.color === 'red' ? 58.0 : 42.0;
    let bestEnemy = null;
    let bestScore = Infinity;
    for (let i = 0; i < players.length; i++) {
      const e = players[i];
      if (!isEnemyValidMobileAutoAimTarget(actor, e, maxRange)) continue;
      const dist = Math.hypot(e.pos.x - actor.pos.x, e.pos.z - actor.pos.z);
      const losBonus = hasClearLineOfSight(actor.pos, e.pos, false) ? -6.0 : 0;
      const ballBonus = e.carryingBall ? -10.0 : 0;
      const score = dist + losBonus + ballBonus;
      if (score < bestScore) {
        bestScore = score;
        bestEnemy = e;
      }
    }
    if (bestEnemy) return Math.atan2(bestEnemy.pos.x - actor.pos.x, bestEnemy.pos.z - actor.pos.z);
    return getDefaultMobileForwardAngle(actor);
  }
  const joyLen = Math.hypot(mobileInput.joyRight || 0, mobileInput.joyForward || 0);
  if (joyLen > 0.15) {
    return stickToWorldAngle(mobileInput.joyRight / joyLen, mobileInput.joyForward / joyLen);
  }
  const bestBall = findNearestGroundBallOfColor(actor, 36.0);
  return bestBall
    ? Math.atan2(bestBall.pos.x - actor.pos.x, bestBall.pos.z - actor.pos.z)
    : getDefaultMobileForwardAngle(actor);
}

function computeMobileDashAutoAim(actor) {
  const joyLen = Math.hypot(mobileInput.joyRight || 0, mobileInput.joyForward || 0);
  if (joyLen > 0.15) {
    return stickToWorldAngle(mobileInput.joyRight / joyLen, mobileInput.joyForward / joyLen);
  }
  const { range: dashRange } = getMobileDashRange(actor);
  const bestBall = findNearestGroundBallOfColor(actor, dashRange * 2.2);
  if (bestBall) {
    return Math.atan2(bestBall.pos.x - actor.pos.x, bestBall.pos.z - actor.pos.z);
  }
  const beatsColor = COLORS[actor.color]?.beats;
  let bestEnemy = null;
  let bestEnemyDist = dashRange * 1.8;
  for (let i = 0; i < players.length; i++) {
    const e = players[i];
    if (!isEnemyValidMobileAutoAimTarget(actor, e, bestEnemyDist)) continue;
    const isRevealed = !!(e.backRevealed || (e.revealedTo && e.revealedTo[state.myTeam]));
    if (!isRevealed || e.color !== beatsColor) continue;
    const d = Math.hypot(e.pos.x - actor.pos.x, e.pos.z - actor.pos.z);
    if (d < bestEnemyDist) {
      bestEnemyDist = d;
      bestEnemy = e;
    }
  }
  return bestEnemy
    ? Math.atan2(bestEnemy.pos.x - actor.pos.x, bestEnemy.pos.z - actor.pos.z)
    : getDefaultMobileForwardAngle(actor);
}

function computeMobileActionAutoAim(actor) {
  if (actor.carryingBall) {
    const fwdAngle = getDefaultMobileForwardAngle(actor);
    const goalX = actor.team === 'ally' ? FIELD.enemyGoalX : FIELD.allyGoalX;
    const goalZ = (actor.team === 'ally' ? FIELD.enemyGoalZ : FIELD.allyGoalZ) || 0;
    const gx = goalX - actor.pos.x;
    const gz = goalZ - actor.pos.z;
    const distToGoal = Math.hypot(gx, gz);
    if (!actor.onCanopy && distToGoal > 0.1 && distToGoal <= 18.0) {
      const goalDot = (gx / distToGoal) * Math.sin(fwdAngle) + (gz / distToGoal) * Math.cos(fwdAngle);
      const snapMinCos = Math.cos(getPassSnapHalfAngle(true));
      const standingStill = Math.hypot(mobileInput.joyRight || 0, mobileInput.joyForward || 0) <= 0.15;
      if (goalDot >= snapMinCos || (standingStill && goalDot >= 0.35)) {
        return Math.atan2(gx, gz);
      }
    }
    return fwdAngle;
  }
  const toolKey = state.teams[actor.team]?.powers?.[actor.role]?.toolEvo || null;
  if (toolKey === 'wall') {
    let bestEnemy = null;
    let bestDist = 15.0;
    for (let i = 0; i < players.length; i++) {
      const e = players[i];
      if (!isEnemyValidMobileAutoAimTarget(actor, e, bestDist)) continue;
      const d = Math.hypot(e.pos.x - actor.pos.x, e.pos.z - actor.pos.z);
      if (d < bestDist) {
        bestDist = d;
        bestEnemy = e;
      }
    }
    if (bestEnemy) return Math.atan2(bestEnemy.pos.x - actor.pos.x, bestEnemy.pos.z - actor.pos.z);
  }
  return getDefaultMobileForwardAngle(actor);
}

export function computeMobileAutoAimAngle(actionType, p = null) {
  const actor = p || getPlayer(state.myTeam, state.controlledRole);
  if (!actor) return 0;
  if (actionType === 'ult') return computeMobileUltAutoAim(actor);
  if (actionType === 'dash') return computeMobileDashAutoAim(actor);
  if (actionType === 'action') return computeMobileActionAutoAim(actor);
  return getDefaultMobileForwardAngle(actor);
}

export function getMobileAimOverride(actionType = null) {
  if (!state.mobileMode || !mobileInput.aimAction) return null;
  if (actionType && mobileInput.aimAction !== actionType) return null;
  if (typeof mobileInput.aimAngle === 'number' && Number.isFinite(mobileInput.aimAngle)) {
    return mobileInput.aimAngle;
  }
  return null;
}

export function isMobileAimCancelled() {
  return !!(state.mobileMode && mobileInput.aimAction && mobileInput.aimCancelled);
}

export function clearMobileAimState(cancelActivePreviews = false) {
  if (mobileInput.aimHoldTimer) {
    clearTimeout(mobileInput.aimHoldTimer);
    mobileInput.aimHoldTimer = null;
  }
  const prevAction = mobileInput.aimAction;
  mobileInput.aimAction = null;
  mobileInput.aimPointerId = null;
  mobileInput.aimMode = 'idle';
  mobileInput.aimNx = 0;
  mobileInput.aimNy = 0;
  mobileInput.aimLen = 0;
  mobileInput.aimAngle = null;
  mobileInput.aimBtnRadius = 0;
  mobileInput.aimLeftButton = false;
  mobileInput.aimCancelled = false;

  const ringEl = document.getElementById('mob-aim-ring');
  const knobEl = document.getElementById('mob-aim-knob');
  if (ringEl) {
    ringEl.classList.add('hidden');
    ringEl.classList.remove('cancel-armed');
  }
  if (knobEl) knobEl.style.transform = 'translate(0px, 0px)';
  ['mob-btn-action', 'mob-btn-dash', 'mob-btn-ult'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('aiming', 'aim-cancel-target', 'cancel-armed');
  });

  ctx.api.updateMobileActionAimPreview3D?.(null);
  if (cancelActivePreviews) {
    if (prevAction === 'ult' && state.ultPreviewActive) cancelUltimatePreview(false);
    if (prevAction === 'action' && state.passCharge && state.passCharge.active) ctx.api.cancelPassCharge?.();
  }
}

export function resetMobileInput() {
  mobileInput.joyPointerId = null;
  mobileInput.joyTouchId = null;
  mobileInput.joyMouseDown = false;
  mobileInput.joyForward = 0;
  mobileInput.joyRight = 0;
  mobileInput.camPointerId = null;
  mobileInput.camX = 0;
  mobileInput.camY = 0;
  mobileInput.camRight = 0;
  mobileInput.camForward = 0;
  const stick = document.getElementById('mobile-joystick-stick');
  if (stick) stick.style.transform = 'translate(0px, 0px)';
  const camStick = document.getElementById('mobile-cam-stick');
  if (camStick) camStick.style.transform = 'translate(0px, 0px)';
  clearMobileAimState(true);
}

function applyMobileAimPreview(p, action, angle, cancelled) {
  const onCanopy = !!p.onCanopy;
  if (action === 'ult') {
    state.ultPreviewAimAngle = angle;
    if (cancelled) {
      state.ultPreviewActive = false;
      hideUltimatePreview();
      ctx.api.updateMobileActionAimPreview3D?.('ult', angle, p.pos, { cancelled: true, onCanopy, range: 12.0 });
    } else {
      state.ultPreviewActive = true;
      ctx.api.updateMobileActionAimPreview3D?.(null);
    }
    return;
  }
  if (action === 'dash') {
    const { dashKind, range } = getMobileDashRange(p);
    ctx.api.updateMobileActionAimPreview3D?.('dash', angle, p.pos, { cancelled, onCanopy, dashKind, range });
    return;
  }
  if (action === 'action') {
    if (p.carryingBall) {
      if (state.passCharge && state.passCharge.active) {
        ctx.api.updateMobileActionAimPreview3D?.(null);
      } else {
        ctx.api.updateMobileActionAimPreview3D?.('pass', angle, p.pos, { cancelled, onCanopy, range: 16.0 });
      }
    } else {
      const toolKey = state.teams[p.team]?.powers?.[p.role]?.toolEvo || null;
      ctx.api.updateMobileActionAimPreview3D?.('tool', angle, p.pos, {
        cancelled,
        onCanopy,
        toolKey,
        range: toolKey === 'beacon' ? 2.5 : 2.2
      });
    }
  }
}

export function syncMobileAimPreview3D() {
  if (!state.mobileMode || mobileInput.aimMode !== 'aiming' || !mobileInput.aimAction) {
    ctx.api.updateMobileActionAimPreview3D?.(null);
    return;
  }
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!p || state.phase !== 'play' || isMenuOpen()) {
    clearMobileAimState(true);
    return;
  }
  const action = mobileInput.aimAction;
  const invalidAction =
    (action === 'ult' && !canPlayerUseUltimate(p, false)) ||
    (action === 'dash' && (p.state !== 'standing' || p.carryingBall)) ||
    (action === 'action' && p.state !== 'standing');
  if (invalidAction) {
    clearMobileAimState(true);
    return;
  }
  if (!mobileInput.aimLeftButton) {
    mobileInput.aimAngle = computeMobileAutoAimAngle(action, p);
  }
  const angle = Number.isFinite(mobileInput.aimAngle)
    ? mobileInput.aimAngle
    : computeMobileAutoAimAngle(action, p);
  mobileInput.aimAngle = angle;

  const cancelled = !!mobileInput.aimCancelled;
  if (!cancelled) p.facingAngle = angle;
  applyMobileAimPreview(p, action, angle, cancelled);
}
