import {
  TUTORIAL_STEPS,
  DASH_SPEED,
  PAD_DASH_SPEED,
  state,
  lerpAngle,
} from '../state.js';
import { getPlayer } from '../render3d.js';
import { CANOPY_SPEC, getCanopySurfaceY } from '../world.js';
import {
  computeMobaPath,
  projectToNearestWalkable,
  getNavVersion,
  routeCanopyPath,
} from '../nav.js';
import {
  LEAF_ULT_SPEED_MULT,
  getUltimateAimAngle,
  isPlayerChargingFireUlt,
  updateUltHudWidget,
} from '../ultimates.js';
import { mobileInput, raycastScreenToWorld, hideMobaMoveMarker } from '../ui.js';
import { markTutorialCheck } from '../modes.js';
import { physicsState } from './shared.js';
import { stepCharacterVerticalPhysics } from './vertical.js';

const _moveTmp = { vx: 0, vz: 0, len: 0 };

export function setMobaMoveGoal(worldPos, { immediate = false, onCanopy = false } = {}) {
  if (!worldPos || !Number.isFinite(worldPos.x) || !Number.isFinite(worldPos.z)) {
    state.mobaPath = [];
    state.mobaPathIndex = 0;
    state.mobaMoveTarget = null;
    state.mobaPathGoal = null;
    state.mobaTargetOnCanopy = false;
    state.mobaPathStuckTimer = 0;
    state.mobaPathLastPos = null;
    return null;
  }

  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!p) return null;

  const now = performance.now();
  const minIntervalMs = state.lowSpecMode ? 130 : 85;
  const curNavVer = getNavVersion();
  const prevGoal = state.mobaPathGoal;
  const goalMoved =
    !prevGoal || Math.hypot(worldPos.x - prevGoal.x, worldPos.z - prevGoal.z) >= 1.0;
  const canopyChanged = !!onCanopy !== !!state.mobaTargetOnCanopy;
  const navChanged = curNavVer !== physicsState.mobaPathNavVersion;

  if (
    !immediate &&
    !goalMoved &&
    !canopyChanged &&
    !navChanged &&
    now - (state.mobaPathLastPlanMs || 0) < minIntervalMs &&
    Array.isArray(state.mobaPath) &&
    state.mobaPath.length > 0
  ) {
    return { x: prevGoal.x, z: prevGoal.z, onCanopy: !!state.mobaTargetOnCanopy };
  }

  let targetX = worldPos.x;
  let targetZ = worldPos.z;
  let targetCanopy = !!onCanopy;
  if (targetCanopy && (!CANOPY_SPEC.hasCanopy || !getCanopySurfaceY(targetX, targetZ))) {
    targetCanopy = false;
  }
  if (!targetCanopy) {
    const proj = projectToNearestWalkable(targetX, targetZ, p.pos.x, p.pos.z);
    targetX = proj.x;
    targetZ = proj.z;
  }

  const path =
    p.onCanopy || targetCanopy
      ? routeCanopyPath(p.pos.x, p.pos.z, targetX, targetZ, targetCanopy)
      : computeMobaPath(p.pos.x, p.pos.z, targetX, targetZ);

  const safePath =
    Array.isArray(path) && path.length > 0
      ? path
      : [{ x: targetX, z: targetZ, onCanopy: targetCanopy }];
  const finalWp = safePath[safePath.length - 1];

  state.mobaPath = safePath;
  state.mobaPathIndex = 0;
  state.mobaPathGoal = { x: finalWp.x, z: finalWp.z };
  state.mobaMoveTarget = { x: finalWp.x, z: finalWp.z };
  state.mobaTargetOnCanopy = targetCanopy;
  state.mobaPathLastPlanMs = now;
  state.mobaPathStuckTimer = 0;
  state.mobaPathLastPos = { x: p.pos.x, z: p.pos.z };
  physicsState.mobaPathNavVersion = curNavVer;

  return { x: finalWp.x, z: finalWp.z, onCanopy: targetCanopy };
}

function computeSlideDashSteerAngle(p, camYaw, isAerialLocal) {
  if (state.mobileMode) {
    const joyF = mobileInput.joyForward || 0;
    const joyR = mobileInput.joyRight || 0;
    const camX = mobileInput.camX || mobileInput.camRight || 0;
    const camY = mobileInput.camY || mobileInput.camForward || 0;
    if (isAerialLocal) {
      if (Math.hypot(camX, camY) > 0.14) return Math.atan2(camX, -camY);
      if (Math.hypot(joyF, joyR) > 0.14) return Math.atan2(joyR, -joyF);
      return null;
    }
    if (Math.hypot(joyF, joyR) > 0.14) {
      const cfX = -Math.sin(camYaw);
      const cfZ = -Math.cos(camYaw);
      return Math.atan2(cfX * joyF - cfZ * joyR, cfZ * joyF + cfX * joyR);
    }
    return Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
  }
  if (!isAerialLocal) {
    return Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
  }
  let aimHit = null;
  if (typeof state.mouseClientX === 'number' && typeof state.mouseClientY === 'number') {
    aimHit = raycastScreenToWorld(state.mouseClientX, state.mouseClientY);
    if (aimHit) state.mobaAimWorld = aimHit;
  }
  if (!aimHit) aimHit = state.mobaAimWorld;
  if (!aimHit) return null;
  const adx = aimHit.x - p.pos.x;
  const adz = aimHit.z - p.pos.z;
  return Math.hypot(adx, adz) > 0.25 ? Math.atan2(adx, adz) : null;
}

function applySlideDashSteer(p, camYaw, dt, isAerialLocal) {
  const steerAngle = computeSlideDashSteerAngle(p, camYaw, isAerialLocal);
  if (steerAngle === null) return;
  const curAng = Math.atan2(p.dashDirX, p.dashDirZ);
  const nextAng = lerpAngle(curAng, steerAngle, 5.5 * dt);
  p.dashDirX = Math.sin(nextAng);
  p.dashDirZ = Math.cos(nextAng);
}

function applyHumanFacing(p, moveVec, camYaw, dt, isAerialLocal) {
  if (isAerialLocal) {
    if (
      (state.ultPreviewActive || isPlayerChargingFireUlt(p)) &&
      p.team === state.myTeam &&
      p.role === state.controlledRole
    ) {
      p.facingAngle = lerpAngle(p.facingAngle, getUltimateAimAngle(p), 28 * dt);
    } else if (!p.onSlidePatch && moveVec.len > 0.01) {
      p.facingAngle = lerpAngle(p.facingAngle, Math.atan2(moveVec.vx, moveVec.vz), 20 * dt);
    } else if (!p.onSlidePatch && state.mobaAimWorld) {
      const adx = state.mobaAimWorld.x - p.pos.x;
      const adz = state.mobaAimWorld.z - p.pos.z;
      if (Math.hypot(adx, adz) > 0.25) {
        p.facingAngle = lerpAngle(p.facingAngle, Math.atan2(adx, adz), 18 * dt);
      }
    }
  } else if (!p.onSlidePatch) {
    const lookAngle = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
    p.facingAngle = lerpAngle(p.facingAngle, lookAngle, 20 * dt);
  }
}

export function applyHumanMovement(p, moveForward, moveRight, camYaw, dt, isAerialLocal = false) {
  if (p.carryingBall) {
    p.dashTimer = 0;
    p.slideGlideTimer = 0;
    p.leafUltTimer = 0;
    p.boomerangWindow = 0;
    p.boomerangOrigin = null;
  }

  if (p.padBoostTimer > 0 && !p.isAirborne && !p.isLaunching) {
    p.padBoostTimer = Math.max(0, p.padBoostTimer - dt);
    p.slideGlideTimer = 0;
    const vx = p.padDirX * PAD_DASH_SPEED;
    const vz = p.padDirZ * PAD_DASH_SPEED;
    p.lastDashVx = vx;
    p.lastDashVz = vz;
    p.dashMomentumGrace = 0.12;
    p.facingAngle = lerpAngle(p.facingAngle, Math.atan2(vx, vz), 25 * dt);
    stepCharacterVerticalPhysics(p, vx, vz, dt, true);
    return;
  }

  if (p.dashTimer > 0 && !p.isAirborne && !p.isLaunching) {
    p.dashTimer = Math.max(0, p.dashTimer - dt);
    if (p.dashKind === 'slide') applySlideDashSteer(p, camYaw, dt, isAerialLocal);
    const dashSpeed = p.dashSpeed || DASH_SPEED;
    const vx = p.dashDirX * dashSpeed;
    const vz = p.dashDirZ * dashSpeed;
    p.lastDashVx = vx;
    p.lastDashVz = vz;
    p.dashMomentumGrace = 0.12;
    p.facingAngle = lerpAngle(p.facingAngle, Math.atan2(vx, vz), 25 * dt);
    if (p.dashKind === 'slide' && p.dashTimer <= 0) {
      p.slideGlideTimer = 0.4;
      p.slideGlideVx = vx * 0.72;
      p.slideGlideVz = vz * 0.72;
    }
    stepCharacterVerticalPhysics(p, vx, vz, dt, true);
    return;
  }

  const camForwardX = -Math.sin(camYaw);
  const camForwardZ = -Math.cos(camYaw);
  const vx = camForwardX * moveForward - camForwardZ * moveRight;
  const vz = camForwardZ * moveForward + camForwardX * moveRight;
  const len = Math.hypot(vx, vz);
  _moveTmp.vx = vx;
  _moveTmp.vz = vz;
  _moveTmp.len = len;
  applyHumanFacing(p, _moveTmp, camYaw, dt, isAerialLocal);

  const leafSpeedMult =
    p.leafUltTimer > 0 && !p.carryingBall ? p.leafUltSpeedMult || LEAF_ULT_SPEED_MULT : 1.0;
  const baseSpeed = (!isAerialLocal && moveForward < 0 ? 8.16 : 9.84) * leafSpeedMult;
  const analogScale = Math.min(1, len);
  let targetVx = len > 0.01 ? (vx / len) * baseSpeed * analogScale : 0;
  let targetVz = len > 0.01 ? (vz / len) * baseSpeed * analogScale : 0;

  if (p.slideGlideTimer > 0) {
    p.slideGlideTimer = Math.max(0, p.slideGlideTimer - dt);
    const damp = Math.exp(-5.0 * dt);
    p.slideGlideVx *= damp;
    p.slideGlideVz *= damp;
    targetVx = targetVx * 0.45 + p.slideGlideVx;
    targetVz = targetVz * 0.45 + p.slideGlideVz;
  }

  stepCharacterVerticalPhysics(p, targetVx, targetVz, dt, false);
}

export function stepPlayerCooldowns(p, dt) {
  if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  if (p.jumpCooldown > 0) p.jumpCooldown = Math.max(0, p.jumpCooldown - dt);
  if (p.ultCooldown > 0) {
    p.ultCooldown = Math.max(0, p.ultCooldown - dt);
    if (p.ultCooldown <= 0 && p.team === state.myTeam && p.role === state.controlledRole) {
      updateUltHudWidget();
    }
  }
  if (p.toolCooldown > 0) p.toolCooldown = Math.max(0, p.toolCooldown - dt);
  if (p.boomerangWindow > 0 && p.dashTimer <= 0) {
    p.boomerangWindow = Math.max(0, p.boomerangWindow - dt);
    if (p.boomerangWindow <= 0) p.boomerangOrigin = null;
  }
  if (p.dashMomentumGrace > 0) p.dashMomentumGrace = Math.max(0, p.dashMomentumGrace - dt);
  if (p.state !== 'standing') {
    p.jumpMomentumVx = 0;
    p.jumpMomentumVz = 0;
    p.dashMomentumGrace = 0;
  }
  if (p.launchBoostTimer > 0) p.launchBoostTimer = Math.max(0, p.launchBoostTimer - dt);
  if (p.leafUltTimer > 0) {
    p.leafUltTimer = Math.max(0, p.leafUltTimer - dt);
    if (p.carryingBall || p.state !== 'standing') p.leafUltTimer = 0;
  }
  if (p.waterShieldTimer > 0) p.waterShieldTimer = Math.max(0, p.waterShieldTimer - dt);
  if (p.carryingBall || p.state !== 'standing') {
    p.dashTimer = 0;
    p.slideGlideTimer = 0;
    p.boomerangWindow = 0;
    p.boomerangOrigin = null;
  }
}

export function updateMobaStuckDetection(myControlled, dt) {
  const busy =
    myControlled.dashTimer > 0 ||
    myControlled.padBoostTimer > 0 ||
    myControlled.isAirborne ||
    myControlled.isLaunching ||
    myControlled.onSlidePatch;
  if (busy) return;
  if (!state.mobaPathLastPos) {
    state.mobaPathLastPos = { x: myControlled.pos.x, z: myControlled.pos.z };
    state.mobaPathStuckTimer = 0;
    return;
  }
  const moved = Math.hypot(
    myControlled.pos.x - state.mobaPathLastPos.x,
    myControlled.pos.z - state.mobaPathLastPos.z
  );
  if (moved >= 0.08) {
    state.mobaPathLastPos.x = myControlled.pos.x;
    state.mobaPathLastPos.z = myControlled.pos.z;
    state.mobaPathStuckTimer = 0;
    return;
  }
  state.mobaPathStuckTimer = (state.mobaPathStuckTimer || 0) + dt;
  if (state.mobaPathStuckTimer >= 0.25 && state.mobaPathGoal) {
    setMobaMoveGoal(state.mobaPathGoal, { immediate: true, onCanopy: !!state.mobaTargetOnCanopy });
  }
}

export function stepMobaPathSteering(myControlled, moveForward, moveRight, dt) {
  if (Math.hypot(moveForward, moveRight) > 0.05) {
    setMobaMoveGoal(null);
    hideMobaMoveMarker();
    if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.MOBA) {
      markTutorialCheck('mobaToggled');
      markTutorialCheck('mobaMoved');
    }
    return { moveForward, moveRight };
  }
  if (!myControlled || myControlled.state !== 'standing') return { moveForward, moveRight };

  if (state.mobaMoveTarget && (!Array.isArray(state.mobaPath) || state.mobaPath.length === 0)) {
    setMobaMoveGoal(state.mobaMoveTarget, { immediate: true, onCanopy: !!state.mobaTargetOnCanopy });
  }
  if (!Array.isArray(state.mobaPath) || state.mobaPath.length === 0) return { moveForward, moveRight };

  if (state.mobaPathGoal && getNavVersion() !== physicsState.mobaPathNavVersion) {
    setMobaMoveGoal(state.mobaPathGoal, { immediate: true, onCanopy: !!state.mobaTargetOnCanopy });
  }
  while (state.mobaPathIndex < state.mobaPath.length) {
    const wp = state.mobaPath[state.mobaPathIndex];
    const tol = state.mobaPathIndex >= state.mobaPath.length - 1 ? 0.48 : 0.75;
    if (Math.hypot(wp.x - myControlled.pos.x, wp.z - myControlled.pos.z) > tol) break;
    state.mobaPathIndex++;
  }
  if (state.mobaPathIndex >= state.mobaPath.length) {
    setMobaMoveGoal(null);
    hideMobaMoveMarker();
    return { moveForward: 0, moveRight: 0 };
  }
  const wp = state.mobaPath[state.mobaPathIndex];
  const dx = wp.x - myControlled.pos.x;
  const dz = wp.z - myControlled.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.001) {
    moveForward = -dz / dist;
    moveRight = dx / dist;
  }
  updateMobaStuckDetection(myControlled, dt);
  return { moveForward, moveRight };
}
