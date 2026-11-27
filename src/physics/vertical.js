import { DASH_SPEED, DASH_EVO_META, state, ctx, lerpAngle } from '../state.js';
import { spawnParticles } from '../render3d.js';
import {
  CANOPY_SPEC,
  getTerrainY,
  getCanopySurfaceY,
  getStructureSurfaceY,
  getRiftRiverCurrent,
} from '../world.js';
import { isPlayerChargingFireUlt } from '../ultimates.js';
import { triggerGamepadRumble } from '../ui.js';
import { clampToField } from './collision.js';
import { isPointOnSlipperySurface, spawnSlidePatch } from './slide_patches.js';

const _velTmp = { vx: 0, vz: 0 };

function computeJumpAirVelocity(p, intendedVx, intendedVz, dt) {
  const momSpeed = Math.hypot(p.jumpMomentumVx || 0, p.jumpMomentumVz || 0);
  if (momSpeed <= 0.25) {
    _velTmp.vx = intendedVx;
    _velTmp.vz = intendedVz;
    return;
  }
  const drag = Math.exp(-1.25 * dt);
  p.jumpMomentumVx *= drag;
  p.jumpMomentumVz *= drag;
  const postMomSpeed = Math.hypot(p.jumpMomentumVx, p.jumpMomentumVz);
  const blendVx = p.jumpMomentumVx + intendedVx * 0.22;
  const blendVz = p.jumpMomentumVz + intendedVz * 0.22;
  const blendLen = Math.hypot(blendVx, blendVz);
  const maxAirSpeed = Math.max(postMomSpeed, Math.hypot(intendedVx, intendedVz));
  if (blendLen > maxAirSpeed && blendLen > 0.001) {
    const scale = maxAirSpeed / blendLen;
    _velTmp.vx = blendVx * scale;
    _velTmp.vz = blendVz * scale;
  } else {
    _velTmp.vx = blendVx;
    _velTmp.vz = blendVz;
  }
}

function stepAirbornePhysics(p, intendedVx, intendedVz, dt, isDash) {
  if (p.airSource === 'jump') {
    computeJumpAirVelocity(p, intendedVx, intendedVz, dt);
  } else {
    _velTmp.vx = isDash ? intendedVx : intendedVx * 0.74;
    _velTmp.vz = p.launchVz;
  }
  const airVx = _velTmp.vx;
  const airVz = _velTmp.vz;
  p.pos.x += airVx * dt;
  p.pos.z += airVz * dt;
  p.vy -= 22.0 * dt;
  p.pos.y += p.vy * dt;

  clampToField(p.pos, 0.72, null, {
    onCanopy: !!p.onCanopy,
    isAirborne: true,
    airSource: p.airSource || null,
  });
  const canopySurf = p.onCanopy ? getCanopySurfaceY(p.pos.x, p.pos.z) : null;
  const targetY = canopySurf
    ? canopySurf.y
    : getStructureSurfaceY(p.pos.x, p.pos.z, !!p.onCanopy).y;
  if (p.pos.y <= targetY) {
    p.pos.y = targetY;
    p.vy = 0;
    p.isAirborne = false;
    p.airSource = null;
    p.jumpMomentumVx = 0;
    p.jumpMomentumVz = 0;
    p.onCanopy = !!canopySurf;
    if (p.isLaunching) {
      p.isLaunching = false;
      p.launchBoostTimer = 0.85;
      spawnParticles(p.pos, 0x38bdf8, 16);
      ctx.api.playSfx?.('sky_land', { pos: p.pos });
      if (p.team === state.myTeam && p.role === state.controlledRole) {
        triggerGamepadRumble(70, 0.2, 0.35);
      }
    }
  }
  p.vel.set(airVx, p.vy, airVz);
}

function stepCanopyLaunchChute(p, intendedVx, intendedVz, dt, prevSurf) {
  const onLaunchZone =
    !!p.onCanopy && (prevSurf.zone === 'northLaunch' || prevSurf.zone === 'southLaunch');
  const signZ = p.pos.z < 0 ? -1 : 1;
  const shouldLaunch =
    onLaunchZone &&
    (p.isLaunching ||
      Math.abs(p.pos.z) >= CANOPY_SPEC.launchCommitZ ||
      (intendedVz * signZ > 0.35 && Math.abs(p.pos.z) >= CANOPY_SPEC.launchInnerZ));
  if (!shouldLaunch) return false;

  p.isLaunching = true;
  p.dashTimer = 0;
  const slideVx = Math.max(-4.5, Math.min(4.5, intendedVx * 0.55));
  const slideVz = signZ * 19.5;
  p.pos.x += slideVx * dt;
  p.pos.z += slideVz * dt;
  const maxChuteX = Math.max(0.4, CANOPY_SPEC.launchHalfX - 0.56);
  p.pos.x = Math.max(-maxChuteX, Math.min(maxChuteX, p.pos.x));

  if (Math.abs(p.pos.z) >= CANOPY_SPEC.launchOuterZ) {
    p.pos.z = signZ * CANOPY_SPEC.launchOuterZ;
    p.pos.y = CANOPY_SPEC.launchLipY;
    p.isAirborne = true;
    p.onCanopy = false;
    p.vy = CANOPY_SPEC.launchVy || 5.4;
    p.launchVz = signZ * (CANOPY_SPEC.launchVz || 16.8);
    p.vel.set(slideVx, p.vy, p.launchVz);
    spawnParticles(p.pos, 0x38bdf8, 14);
    spawnParticles(p.pos, 0xffffff, 8);
    ctx.api.playSfx?.('sky_launch', { pos: p.pos });
  } else {
    p.pos.y = getStructureSurfaceY(p.pos.x, p.pos.z, true).y;
    p.vel.set(slideVx, 0, slideVz);
    if (Math.random() < 0.45) {
      spawnParticles(p.pos, 0x38bdf8, 1);
    }
  }
  return true;
}

function applyIceSlidePatch(p, moveVx, moveVz, dt) {
  const wasOnSlidePatch = !!p.onSlidePatch;
  p.onSlidePatch = isPointOnSlipperySurface(p.pos, p.id);
  if (p.onSlidePatch) {
    if (!wasOnSlidePatch || p.iceSlideSpeed <= 0.1) {
      if (!wasOnSlidePatch) ctx.api.playSfx?.('ice_slide', { pos: p.pos });
      let entryVx = p.vel.x;
      let entryVz = p.vel.z;
      if (Math.hypot(entryVx, entryVz) < 0.6) {
        entryVx = moveVx;
        entryVz = moveVz;
      }
      if (Math.hypot(entryVx, entryVz) < 0.6) {
        entryVx = Math.sin(p.facingAngle || 0) * 9.84;
        entryVz = Math.cos(p.facingAngle || 0) * 9.84;
      }
      const entryLen = Math.hypot(entryVx, entryVz) || 1;
      p.iceSlideDirX = entryVx / entryLen;
      p.iceSlideDirZ = entryVz / entryLen;
      p.iceSlideSpeed = Math.max(12.2, Math.min(20.0, entryLen * 1.3));
    }
    _velTmp.vx = p.iceSlideDirX * p.iceSlideSpeed;
    _velTmp.vz = p.iceSlideDirZ * p.iceSlideSpeed;
    if (p.iceSlideSpeed > 0.1 && !isPlayerChargingFireUlt(p)) {
      p.facingAngle = lerpAngle(p.facingAngle, Math.atan2(p.iceSlideDirX, p.iceSlideDirZ), 18 * dt);
    }
    return;
  }
  if (wasOnSlidePatch) {
    p.iceSlideDirX = 0;
    p.iceSlideDirZ = 0;
    p.iceSlideSpeed = 0;
    p.slideGlideTimer = 0.22;
    p.slideGlideVx = p.vel.x * 0.65;
    p.slideGlideVz = p.vel.z * 0.65;
  }
  _velTmp.vx = moveVx;
  _velTmp.vz = moveVz;
}

function applyGroundSlopeAndCurrent(p, intendedVx, intendedVz, dt, prevSurf, isDash) {
  if (!isDash) {
    let slopeScale = 1.0;
    if (p.onCanopy && (prevSurf.zone === 'westRamp' || prevSurf.zone === 'eastRamp')) {
      const inwardDir = -Math.sign(p.pos.x);
      if (intendedVx * inwardDir > 0.25) slopeScale = 0.8;
      else if (intendedVx * inwardDir < -0.25) slopeScale = 1.08;
    }
    if (p.launchBoostTimer > 0) slopeScale *= 1.25;
    applyIceSlidePatch(p, intendedVx * slopeScale, intendedVz * slopeScale, dt);
  } else {
    p.onSlidePatch = false;
    p.iceSlideDirX = 0;
    p.iceSlideDirZ = 0;
    p.iceSlideSpeed = 0;
    _velTmp.vx = intendedVx;
    _velTmp.vz = intendedVz;
  }

  if (!p.onCanopy && p.state === 'standing' && !p.onSlidePatch) {
    const riverCur = getRiftRiverCurrent(p.pos.x, p.pos.z);
    if (riverCur) {
      _velTmp.vx += riverCur.vx;
      _velTmp.vz += riverCur.vz;
      if (!state.lowSpecMode && Math.random() < 7.5 * dt) {
        spawnParticles(p.pos, 0x7dd3fc, 1);
      }
    }
  }
}

function deflectIceSlideOnClamp(p, preClampX, preClampZ) {
  const corX = p.pos.x - preClampX;
  const corZ = p.pos.z - preClampZ;
  const corLen = Math.hypot(corX, corZ);
  if (corLen <= 0.015) return;
  const nx = corX / corLen;
  const nz = corZ / corLen;
  const dot = p.iceSlideDirX * nx + p.iceSlideDirZ * nz;
  if (dot >= -0.1) return;
  const tx = p.iceSlideDirX - dot * nx;
  const tz = p.iceSlideDirZ - dot * nz;
  const tLen = Math.hypot(tx, tz);
  if (tLen > 0.15) {
    p.iceSlideDirX = tx / tLen;
    p.iceSlideDirZ = tz / tLen;
  } else {
    p.iceSlideSpeed = 0;
  }
}

function tryBounceDashOnClamp(p, preClampX, preClampZ) {
  const corX = p.pos.x - preClampX;
  const corZ = p.pos.z - preClampZ;
  const corLen = Math.hypot(corX, corZ);
  if (corLen <= 0.015) return false;
  const nx = corX / corLen;
  const nz = corZ / corLen;
  const dot = p.dashDirX * nx + p.dashDirZ * nz;
  if (dot >= -0.18) return false;
  const rx = p.dashDirX - 2 * dot * nx;
  const rz = p.dashDirZ - 2 * dot * nz;
  const rLen = Math.hypot(rx, rz) || 1;
  p.dashDirX = rx / rLen;
  p.dashDirZ = rz / rLen;
  p.facingAngle = Math.atan2(p.dashDirX, p.dashDirZ);
  p.dashTimer = p.dashMaxDuration || DASH_EVO_META.bounce.duration;
  p.dashBouncesLeft -= 1;
  spawnParticles(p.pos, 0xfacc15, 14);
  ctx.api.playSfx?.('dash_wall_bounce', { pos: p.pos, bounceIndex: 3 - p.dashBouncesLeft });
  return true;
}

function stepGroundSubsteps(p, moveVx, moveVz, dt, isDash) {
  const totalMove = Math.hypot(moveVx, moveVz) * dt;
  const subSteps = Math.min(8, Math.max(1, Math.ceil(totalMove / 0.65)));
  const stepDt = dt / subSteps;
  let curVx = moveVx;
  let curVz = moveVz;
  let bouncedThisFrame = false;

  for (let s = 0; s < subSteps; s++) {
    if (s > 0) {
      if (isDash && p.dashKind === 'bounce' && bouncedThisFrame) {
        const dSpeed = p.dashSpeed || DASH_SPEED;
        curVx = p.dashDirX * dSpeed;
        curVz = p.dashDirZ * dSpeed;
      } else if (!isDash && p.onSlidePatch && p.iceSlideSpeed > 0.1) {
        curVx = p.iceSlideDirX * p.iceSlideSpeed;
        curVz = p.iceSlideDirZ * p.iceSlideSpeed;
      }
    }

    p.pos.x += curVx * stepDt;
    p.pos.z += curVz * stepDt;
    const preClampX = p.pos.x;
    const preClampZ = p.pos.z;

    if (!p.onCanopy) {
      const entrySurf = getCanopySurfaceY(p.pos.x, p.pos.z);
      if (
        entrySurf &&
        (entrySurf.zone === 'westRamp' || entrySurf.zone === 'eastRamp') &&
        Math.abs(p.pos.x) >= CANOPY_SPEC.ascentAttachMinX &&
        Math.abs(p.pos.z) <= CANOPY_SPEC.ascentHalfZ
      ) {
        p.onCanopy = true;
      }
    }

    clampToField(p.pos, 0.72, null, { onCanopy: !!p.onCanopy, isAirborne: false });

    if (!isDash && p.onSlidePatch && p.iceSlideSpeed > 0.1) {
      deflectIceSlideOnClamp(p, preClampX, preClampZ);
    }
    if (isDash && p.dashKind === 'bounce' && p.dashBouncesLeft > 0 && !bouncedThisFrame) {
      bouncedThisFrame = tryBounceDashOnClamp(p, preClampX, preClampZ);
    }
  }
  _velTmp.vx = curVx;
  _velTmp.vz = curVz;
}

export function stepCharacterVerticalPhysics(p, intendedVx, intendedVz, dt, isDash = false) {
  if (p.isAirborne) {
    stepAirbornePhysics(p, intendedVx, intendedVz, dt, isDash);
    return;
  }

  const prevSurf = getStructureSurfaceY(p.pos.x, p.pos.z, !!p.onCanopy);
  if (stepCanopyLaunchChute(p, intendedVx, intendedVz, dt, prevSurf)) {
    return;
  }

  p.isLaunching = false;
  applyGroundSlopeAndCurrent(p, intendedVx, intendedVz, dt, prevSurf, isDash);
  stepGroundSubsteps(p, _velTmp.vx, _velTmp.vz, dt, isDash);
  const moveVx = _velTmp.vx;
  const moveVz = _velTmp.vz;

  if (isDash && p.dashKind === 'slide') {
    p.slidePatchDist = (p.slidePatchDist || 0) + Math.hypot(moveVx, moveVz) * dt;
    if (p.slidePatchDist >= 1.15) {
      p.slidePatchDist -= 1.15;
      spawnSlidePatch(p.id, p.team, p.pos.x, p.pos.y, p.pos.z, true);
    }
  }

  if (p.onCanopy) {
    const afterSurf = getCanopySurfaceY(p.pos.x, p.pos.z);
    if (!afterSurf) {
      p.onCanopy = false;
      p.pos.y = getTerrainY(p.pos.x, p.pos.z);
    } else {
      p.pos.y = afterSurf.y;
    }
  } else {
    p.pos.y = getTerrainY(p.pos.x, p.pos.z);
  }
  p.vel.set(moveVx, 0, moveVz);
}
