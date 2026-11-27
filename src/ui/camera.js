import { FIELD, TUTORIAL_STEPS, escapeHtml, state, ctx } from '../state.js';
import { camera, players, scene, getPlayer } from '../render3d.js';
import { cameraTreeOccluders, distSqSegmentToVerticalCapsule, getActiveMapMeta, getTerrainY } from '../world.js';
import {
  THREE,
  uiState,
  occTargetPos,
  isControlDown,
  formatActionBindingText,
  isMenuOpen,
  isMobaCursorLockActive
} from './shared.js';
import { showToast } from './toast.js';
import { lockPointerIfPlaying, unlockPointer, updateMobaVirtualCursorUI } from './pointer_lock.js';
import { applyMobaMoveCommand, raycastScreenToWorld } from './raycast.js';
import { updateControlsHelpForCameraMode } from './controls_help.js';
import { updateRosterHUD } from './hud_top_roster.js';
import { mobileInput } from './mobile_aim.js';

export function recenterMobaCamera(instant = false) {
  const controlled = getPlayer(state.myTeam, state.controlledRole) || players[0];
  if (!controlled) return;
  state.mobaCamX = controlled.pos.x;
  state.mobaCamY = controlled.pos.y || 0;
  state.mobaCamZ = controlled.pos.z;
  state.mobaCamInitialized = true;
  if (instant && state.cameraMode === 'aerial' && camera) {
    const zoom = state.aerialZoom || 1.0;
    const height = 46 * zoom;
    const backZ = 21 * zoom;
    camera.position.set(state.mobaCamX, state.mobaCamY + height, state.mobaCamZ + backZ);
    camera.lookAt(state.mobaCamX, state.mobaCamY + 1.0, state.mobaCamZ);
    camera.updateMatrixWorld();
  }
}

function applyAerialCameraMode(silent) {
  if (typeof state.mouseClientX !== 'number' || typeof state.mouseClientY !== 'number') {
    state.mouseClientX = (window.innerWidth || 1280) * 0.5;
    state.mouseClientY = (window.innerHeight || 720) * 0.5;
  }
  if (isMobaCursorLockActive() && !isMenuOpen() && !(state.mode === 'practice' && state.practiceCursorFree)) {
    lockPointerIfPlaying();
  } else {
    unlockPointer();
    setTimeout(() => {
      if (state.cameraMode === 'aerial' && !isMobaCursorLockActive()) unlockPointer();
    }, 30);
  }
  recenterMobaCamera(true);
  if (typeof state.mouseClientX === 'number' && typeof state.mouseClientY === 'number') {
    state.mobaAimWorld = raycastScreenToWorld(state.mouseClientX, state.mouseClientY);
  }
  updateMobaVirtualCursorUI();
  if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.MOBA) {
    ctx.api.markTutorialCheck('mobaToggled');
  }
  if (!silent) {
    const recenterLbl = escapeHtml(formatActionBindingText('recenterCam'));
    const lockLbl = escapeHtml(formatActionBindingText('toggleCamLock'));
    const moveLbl = escapeHtml(formatActionBindingText('mobaMove'));
    showToast(
      `🛰️ Mode <strong>Aérien MOBA</strong> : ${moveLbl} pour bouger • [1/2/3] changer position • ${lockLbl} verrouiller • ${recenterLbl} recentrer !`,
      2600
    );
  }
}

function applyTpsCameraMode(silent) {
  state.mobaMoveTarget = null;
  if (uiState.mobaMoveMarker) uiState.mobaMoveMarker.visible = false;
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (p) state.camYaw = p.facingAngle + Math.PI;
  if (!isMenuOpen()) lockPointerIfPlaying();
  if (!silent) showToast('🎥 Mode <strong>3e Personne (TPS)</strong> activé !', 1800);
}

export function setCameraMode(mode, silent = false) {
  const normalized = mode === 'aerial' || mode === 'camp' ? 'aerial' : 'tps';
  state.cameraMode = normalized;
  state.mobaRightMouseDown = false;
  document.body.classList.toggle('moba-mode', normalized === 'aerial');

  const mapMeta = getActiveMapMeta();
  if (scene.fog) {
    scene.fog.density = normalized === 'aerial' ? 0 : (mapMeta.fogDensity || 0.0022);
  }
  const targetNear = normalized === 'aerial' ? 2.5 : 0.45;
  if (camera.near !== targetNear) {
    camera.near = targetNear;
    camera.far = 520;
    camera.updateProjectionMatrix();
  }

  const btnToggleCam = document.getElementById('btn-toggle-cam');
  if (btnToggleCam) {
    btnToggleCam.textContent =
      normalized === 'tps' ? '🎥 Vue : 3e Personne (TPS)' : '🎥 Vue : Aérienne (MOBA)';
  }
  updateControlsHelpForCameraMode();

  if (normalized === 'aerial') {
    applyAerialCameraMode(silent);
  } else {
    applyTpsCameraMode(silent);
  }
  updateRosterHUD();
  ctx.api.updateTutorialSequenceHUD?.();
  ctx.api.updateMobileTouchHUD?.();
  if (!silent) ctx.api.playSfx?.('cam_toggle', { mode: normalized });
}

export function toggleCameraMode() {
  setCameraMode(state.cameraMode === 'tps' ? 'aerial' : 'tps');
}

export function toggleMobaCamLock() {
  state.mobaCamLocked = !state.mobaCamLocked;
  if (state.mobaCamLocked) recenterMobaCamera(false);
  ctx.api.updateMobileTouchHUD?.();
  showToast(
    state.mobaCamLocked
      ? '🔒 <strong>Caméra MOBA verrouillée</strong> sur votre joueuse !'
      : '🔓 <strong>Caméra MOBA libre</strong> !',
    1500
  );
}

function updateTpsCamera(controlled, mobCamCurveX, mobCamCurveY, dt) {
  if (mobCamCurveX !== 0 || mobCamCurveY !== 0) {
    const sens = state.tpsSensitivity || 1.0;
    state.camYaw -= mobCamCurveX * 3.0 * sens * dt;
    state.camPitch = Math.max(0.12, Math.min(1.15, state.camPitch - mobCamCurveY * 1.8 * sens * dt));
  }
  const dist = 8.0;
  const baseY = controlled.pos.y || 0;
  const pivotY = baseY + 1.45;
  const lookY = baseY + 2.45;
  const horizDist = Math.cos(state.camPitch) * dist;
  const vertOffset = Math.sin(state.camPitch) * dist;
  const sinY = Math.sin(state.camYaw);
  const cosY = Math.cos(state.camYaw);

  camera.position.set(
    controlled.pos.x + sinY * horizDist,
    pivotY + vertOffset,
    controlled.pos.z + cosY * horizDist
  );
  uiState.tmpCamLook.set(controlled.pos.x, lookY, controlled.pos.z);
  camera.lookAt(uiState.tmpCamLook);
  camera.updateMatrixWorld();
}

function panAerialCamera(controlled, mobCamCurveX, mobCamCurveY, zoom, dt) {
  let panX = mobCamCurveX;
  let panZ = -mobCamCurveY;
  if (
    state.mobaEdgePan &&
    !state.mobileMode &&
    !uiState.minimapDragging &&
    state.mouseInWindow &&
    typeof state.mouseClientX === 'number' &&
    typeof state.mouseClientY === 'number'
  ) {
    const edgeMargin = 32;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    if (state.mouseClientX <= edgeMargin) panX -= Math.min(1, (edgeMargin - state.mouseClientX) / edgeMargin);
    else if (state.mouseClientX >= vw - edgeMargin) panX += Math.min(1, (state.mouseClientX - (vw - edgeMargin)) / edgeMargin);
    if (state.mouseClientY <= edgeMargin) panZ -= Math.min(1, (edgeMargin - state.mouseClientY) / edgeMargin);
    else if (state.mouseClientY >= vh - edgeMargin) panZ += Math.min(1, (state.mouseClientY - (vh - edgeMargin)) / edgeMargin);
  }
  if (isControlDown('camPanLeft')) panX -= 1;
  if (isControlDown('camPanRight')) panX += 1;
  if (isControlDown('camPanUp')) panZ -= 1;
  if (isControlDown('camPanDown')) panZ += 1;

  const panLen = Math.hypot(panX, panZ);
  if (panLen > 0.001) {
    if (panLen > 1) {
      panX /= panLen;
      panZ /= panLen;
    }
    const camSpeed = 62 * zoom * (state.mobaCamSpeed || 1.0);
    state.mobaCamX += panX * camSpeed * dt;
    state.mobaCamZ += panZ * camSpeed * dt;
  }
  const halfW = FIELD.width / 2;
  const halfD = FIELD.depth / 2;
  state.mobaCamX = Math.max(-halfW, Math.min(halfW, state.mobaCamX));
  state.mobaCamZ = Math.max(-halfD, Math.min(halfD, state.mobaCamZ));
  const distToControlled = Math.hypot(state.mobaCamX - controlled.pos.x, state.mobaCamZ - controlled.pos.z);
  const targetCamY = distToControlled < 4.0 ? controlled.pos.y || 0 : getTerrainY(state.mobaCamX, state.mobaCamZ);
  state.mobaCamY = THREE.MathUtils.lerp(state.mobaCamY || 0, targetCamY, Math.min(1, 8 * dt));
}

function updateAerialCamera(controlled, mobCamCurveX, mobCamCurveY, menuOpen, dt) {
  const zoom = state.aerialZoom || 1.0;
  if (!state.mobaCamInitialized) recenterMobaCamera(true);

  const blockRecenterForPass = !!(
    controlled &&
    (controlled.carryingBall || (state.passCharge && state.passCharge.active)) &&
    isControlDown('action')
  );
  const shouldLockOnPlayer =
    (state.mobaCamLocked && !uiState.minimapDragging) ||
    (isControlDown('recenterCam') && !blockRecenterForPass);
  if (!menuOpen && shouldLockOnPlayer) {
    state.mobaCamX = controlled.pos.x;
    state.mobaCamY = controlled.pos.y || 0;
    state.mobaCamZ = controlled.pos.z;
  } else if (!menuOpen) {
    panAerialCamera(controlled, mobCamCurveX, mobCamCurveY, zoom, dt);
  }

  const baseY = state.mobaCamY || 0;
  camera.position.set(state.mobaCamX, baseY + 46 * zoom, state.mobaCamZ + 21 * zoom);
  uiState.tmpCamLook.set(state.mobaCamX, baseY + 1.0, state.mobaCamZ);
  camera.lookAt(uiState.tmpCamLook);
  camera.updateMatrixWorld();
  occTargetPos.x = state.mobaCamX;
  occTargetPos.y = baseY + 1.45;
  occTargetPos.z = state.mobaCamZ;

  if (
    !menuOpen &&
    !state.mobileMode &&
    typeof state.mouseClientX === 'number' &&
    typeof state.mouseClientY === 'number'
  ) {
    const hit = raycastScreenToWorld(state.mouseClientX, state.mouseClientY);
    if (hit) {
      state.mobaAimWorld = hit;
      if (state.mobaRightMouseDown || isControlDown('mobaMove')) {
        applyMobaMoveCommand(hit, false);
      }
    }
  }
}

function updateCameraOccluders(dt) {
  const fadeStep = Math.min(1, 14 * (dt || 0.016));
  for (let i = 0; i < cameraTreeOccluders.length; i++) {
    const occ = cameraTreeOccluders[i];
    const clearRadius = occ.r + 1.25;
    const dSq = distSqSegmentToVerticalCapsule(camera.position, occTargetPos, occ);
    const targetAlpha = dSq < clearRadius * clearRadius ? 0.24 : 1.0;
    occ.fadeAlpha = occ.fadeAlpha + (targetAlpha - occ.fadeAlpha) * fadeStep;
    occ.node.visible = true;
    if (!occ.matStates || occ.matStates.length === 0) continue;

    const useBlend = occ.fadeAlpha < 0.992;
    for (let mIdx = 0; mIdx < occ.matStates.length; mIdx++) {
      const ms = occ.matStates[mIdx];
      if (useBlend) {
        ms.mat.transparent = true;
        ms.mat.opacity = Math.max(0.08, ms.baseOpacity * (ms.isOutline ? occ.fadeAlpha * 0.45 : occ.fadeAlpha));
        ms.mat.depthWrite = false;
      } else {
        ms.mat.transparent = ms.baseTransparent;
        ms.mat.opacity = ms.baseOpacity;
        ms.mat.depthWrite = ms.baseDepthWrite;
      }
    }
  }
}

export function updateCamera(dt) {
  const controlled = getPlayer(state.myTeam, state.controlledRole) || players[0];
  occTargetPos.x = controlled.pos.x;
  occTargetPos.y = (controlled.pos.y || 0) + 1.45;
  occTargetPos.z = controlled.pos.z;

  const menuOpen = isMenuOpen();
  let mobCamCurveX = 0;
  let mobCamCurveY = 0;
  if (state.mobileMode && !menuOpen) {
    const rawCamLen = Math.hypot(mobileInput.camX || 0, mobileInput.camY || 0);
    if (rawCamLen > 0.10) {
      const camMag = Math.pow(Math.min(1, (rawCamLen - 0.10) / 0.90), 1.65);
      mobCamCurveX = ((mobileInput.camX || 0) / rawCamLen) * camMag;
      mobCamCurveY = ((mobileInput.camY || 0) / rawCamLen) * camMag;
    }
  }

  if (state.cameraMode === 'tps') {
    updateTpsCamera(controlled, mobCamCurveX, mobCamCurveY, dt);
  } else {
    updateAerialCamera(controlled, mobCamCurveX, mobCamCurveY, menuOpen, dt);
  }
  updateMobaVirtualCursorUI();
  updateCameraOccluders(dt);
}
