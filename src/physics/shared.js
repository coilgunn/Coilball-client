import { state, ctx } from '../state.js';
import {
  isControlDown,
  gamepadState,
  mobileInput,
  raycastScreenToWorld,
} from '../ui.js';

export const THREE = ctx.THREE;

export const physicsState = {
  mobaPathNavVersion: -1,
};

export const activeToolBeacons = [];
export const activeToolWalls = [];
export const activeToolPads = [];
export const activeSlidePatches = [];

export function getLocalMoveVector() {
  let moveForward = gamepadState.moveForward || 0;
  let moveRight = gamepadState.moveRight || 0;
  if (state.mobileMode) {
    moveForward += mobileInput.joyForward || 0;
    moveRight += mobileInput.joyRight || 0;
  }
  if (state.cameraMode !== 'aerial') {
    if (isControlDown('moveForward')) moveForward += 1;
    if (isControlDown('moveBackward')) moveForward -= 1;
    if (isControlDown('moveLeft')) moveRight -= 1;
    if (isControlDown('moveRight')) moveRight += 1;
  }
  moveForward = Math.max(-1, Math.min(1, moveForward));
  moveRight = Math.max(-1, Math.min(1, moveRight));
  return { moveForward, moveRight };
}

export function resolveLocalActionAimAngle(p, overrideAngle = null) {
  if (Number.isFinite(overrideAngle)) return overrideAngle;
  const mobOverride = ctx.api.getMobileAimOverride?.('action');
  if (Number.isFinite(mobOverride)) return mobOverride;

  if (state.cameraMode === 'aerial') {
    let aimHit = null;
    if (
      !state.mobileMode &&
      typeof state.mouseClientX === 'number' &&
      typeof state.mouseClientY === 'number'
    ) {
      aimHit = raycastScreenToWorld(state.mouseClientX, state.mouseClientY);
      if (aimHit) state.mobaAimWorld = aimHit;
    }
    if (!aimHit) aimHit = state.mobaAimWorld;
    if (aimHit && p) {
      const adx = aimHit.x - p.pos.x;
      const adz = aimHit.z - p.pos.z;
      if (Math.hypot(adx, adz) > 0.2) {
        return Math.atan2(adx, adz);
      }
    }
    return p ? p.facingAngle || 0 : 0;
  }

  return Math.atan2(-Math.sin(state.camYaw), -Math.cos(state.camYaw));
}

export function normalizeOrFacing(dx, dz, facingAngle) {
  const len = Math.hypot(dx, dz);
  if (len > 0.05) return [dx / len, dz / len];
  return [Math.sin(facingAngle), Math.cos(facingAngle)];
}

export function updateBallGroupVisibility(b) {
  b.mesh.group.visible =
    b.state === 'carried' && b.carrier
      ? !b.tutorialHidden && !b.carrier.tutorialHidden && !!b.carrier.mesh?.root?.visible
      : !b.tutorialHidden;
}
