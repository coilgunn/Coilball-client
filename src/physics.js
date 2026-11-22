// ============================================================================
// COILBALL 3D — PHYSIQUE, GAMEPLAY, OUTILS, COLLISIONS, RÈGLE 1 & SYNC MONDE
// ============================================================================

import {
  COLORS,
  TUTORIAL_STEPS,
  FIELD,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_SPEED,
  PAD_DASH_SPEED,
  PAD_DASH_DURATION,
  DASH_EVO_META,
  TOOL_EVO_META,
  PASS_CHARGE_SPEC,
  getPassSnapHalfAngle,
  canPlayerPassOrThrow,
  state,
  mp,
  getTeamPE,
  setTeamPE,
  getTeamPV,
  setTeamPV,
  ctx,
  lerpAngle
} from './state.js';
import {
  scene,
  camera,
  players,
  balls,
  getPlayer,
  applyBallColor,
  applyPlayerColor,
  createToonMat,
  addAnimeOutline,
  spawnParticles
} from './render3d.js';
import {
  PARK_LANDMARKS,
  MONTREAL_MAPS,
  CANOPY_SPEC,
  JUNGLE_OBSTACLES,
  JUNGLE_WALLS,
  VISION_SPEC,
  getTerrainY,
  isPointInJungleBush,
  hasClearLineOfSight,
  hasAllyVisionNear,
  updateTeamVisionState,
  getCanopySurfaceY,
  getStructureSurfaceY,
  getRiftRiverCurrent,
  enforceCanopyRails,
  pushOutAABB,
  pushOutEllipse
} from './world.js';
import {
  computeMobaPath,
  projectToNearestWalkable,
  markNavDynamicDirty,
  getNavVersion,
  routeCanopyPath
} from './nav.js';
import {
  LEAF_ULT_SPRINT_DURATION,
  LEAF_ULT_SPEED_MULT,
  LEAF_ULT_WALL_RADIUS,
  activeLeafWalls,
  getUltimateAimAngle,
  canPlayerUseUltimate,
  isPlayerChargingFireUlt,
  triggerPlayerUltimate,
  pushOutFromLeafWalls,
  isPointProtectedByWaterWave,
  updateUltimates,
  cancelUltimatePreview,
  updateUltHudWidget
} from './ultimates.js';
import {
  getMemberControlledRole,
  getRoleHumanController,
  sendNetMessage,
  syncLocalRoleFromMembers,
  broadcastToast
} from './net.js';
import {
  keys,
  isControlDown,
  gamepadState,
  mobileInput,
  triggerGamepadRumble,
  isMenuOpen,
  unlockPointer,
  raycastScreenToWorld,
  getVisibleModalId,
  showOnlyModal,
  showToast,
  updateMapLockUI,
  selectArenaMap,
  setMpLobbyMode,
  syncPlayerMeshes,
  updateTopHUD,
  updateRosterHUD,
  hideMobaMoveMarker,
  updateMobaMoveMarkerAnim
} from './ui.js';
import { updateAIPlayer } from './ai.js';
import {
  resetMatchStateToMenu,
  executePracticeAction,
  applyRoundSetupPositions,
  maybeStartRoundFromPrep,
  updatePrepConfirmButtonUI,
  setupRoundPrep,
  openPrepModal,
  renderPrepColorPickers,
  handleHostPrepAction,
  renderShopItems,
  isDashUnlocked,
  completeTutorialToPractice,
  markTutorialCheck,
  startRoundExecution,
  startNewMatch
} from './modes.js';

const THREE = ctx.THREE;

export function initPhysics() {
  ctx.entities.activeToolBeacons = activeToolBeacons;
  ctx.entities.activeToolWalls = activeToolWalls;
  ctx.entities.activeToolPads = activeToolPads;
  ctx.entities.activeSlidePatches = activeSlidePatches;
  ctx.api.setMobaMoveGoal = setMobaMoveGoal;
  ctx.api.beginPassCharge = beginPassCharge;
  ctx.api.updatePassCharge = updatePassCharge;
  ctx.api.releasePassCharge = releasePassCharge;
  ctx.api.cancelPassCharge = cancelPassCharge;
  ctx.api.handleRemoteBallPass = handleRemoteBallPass;
  ctx.api.triggerJump = triggerJump;
  ctx.api.handleRemotePlayerJump = handleRemotePlayerJump;
}
// --- PATHING MOBA (GRILLE A* + CANOPÉE) ---
let mobaPathNavVersion = -1;

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
  const navChanged = curNavVer !== mobaPathNavVersion;

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
  if (targetCanopy) {
    if (!CANOPY_SPEC.hasCanopy || !getCanopySurfaceY(targetX, targetZ)) {
      targetCanopy = false;
    }
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
  mobaPathNavVersion = curNavVer;

  return { x: finalWp.x, z: finalWp.z, onCanopy: targetCanopy };
}

// --- PASSE CHARGÉE + TIR LIBRE (GRATUIT DÈS RONDE 1) ---
function resolveLocalActionAimAngle(p, overrideAngle = null) {
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

function findBestPassAllyInRange(p, radius, aimAngle) {
  if (!p) return null;
  const resolvedAngle = Number.isFinite(aimAngle) ? aimAngle : p.facingAngle || 0;
  const dirX = Math.sin(resolvedAngle);
  const dirZ = Math.cos(resolvedAngle);
  const snapHalfAngle = getPassSnapHalfAngle(!!state.mobileMode);
  const minCos = Math.cos(snapHalfAngle);

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

function executeBallPassOrThrow(p, targetAlly, aimAngle, chargeRatio = 0) {
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

  if (validTarget) {
    const dx = validTarget.pos.x - p.pos.x;
    const dz = validTarget.pos.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    const dirX = dist > 0.01 ? dx / dist : Math.sin(Number.isFinite(aimAngle) ? aimAngle : p.facingAngle || 0);
    const dirZ = dist > 0.01 ? dz / dist : Math.cos(Number.isFinite(aimAngle) ? aimAngle : p.facingAngle || 0);
    p.facingAngle = Math.atan2(dirX, dirZ);

    const startX = p.pos.x + dirX * 1.05;
    const startY = p.pos.y + 1.25;
    const startZ = p.pos.z + dirZ * 1.05;
    ball.pos.set(startX, startY, startZ);

    const flightTime = Math.max(0.20, Math.min(0.75, dist / 32.0));
    const dy = validTarget.pos.y + 1.05 - startY;
    const g = 9.8;
    const vx = (validTarget.pos.x - startX) / flightTime;
    const vz = (validTarget.pos.z - startZ) / flightTime;
    const vy = (dy + 0.5 * g * flightTime * flightTime) / flightTime;
    ball.vel.set(vx, vy, vz);
    ball.passTargetId = validTarget.id;
    ball.passFlightRemaining = flightTime;

    spawnParticles(ball.pos, COLORS[ball.color].hex, 10);
    broadcastToast(`🎯 <strong>${p.role} passe le ballon à ${validTarget.role} !</strong>`, 2200);
  } else {
    const ang = Number.isFinite(aimAngle) ? aimAngle : p.facingAngle || 0;
    const dirX = Math.sin(ang);
    const dirZ = Math.cos(ang);
    p.facingAngle = ang;

    ball.pos.set(p.pos.x + dirX * 1.1, p.pos.y + 1.15, p.pos.z + dirZ * 1.1);
    const hSpeed = 21.5 + 10.5 * cr;
    const vSpeed = 2.4 + 1.1 * cr;
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
      isMobile: !!state.mobileMode
    });
    return true;
  }

  const ok = executeBallPassOrThrow(p, bestAlly, aimAngle, chargeRatio);
  if (ok && mp.enabled && mp.isHost) {
    broadcastWorldState();
  }
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
    if (
      cand &&
      !cand.tutorialHidden &&
      cand.state === 'standing' &&
      !cand.carryingBall
    ) {
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

// --- ACTION [E] : PASSE / TIR LIBRE, DÉPLOYER UN OUTIL (SANS BALLE) OU SE RELEVER ---
export function handleActionKey(overrideAngle = null) {
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!p) return;

  if (p.state === 'standing' && p.carryingBall) {
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
        isMobile: !!state.mobileMode
      });
      return;
    }
    const ok = executeBallPassOrThrow(p, nearAlly, aimAngle, 0);
    if (ok && mp.enabled && mp.isHost) {
      broadcastWorldState();
    }
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
    teamPowers &&
    teamPowers.toolEvo
  ) {
    const adx = state.mobaAimWorld.x - p.pos.x;
    const adz = state.mobaAimWorld.z - p.pos.z;
    if (Math.hypot(adx, adz) > 0.25) {
      p.facingAngle = Math.atan2(adx, adz);
    }
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
      actionTriggered: true
    });
    return;
  }

  triggerPlayerAction(p);
}

export function triggerPlayerAction(p) {
  const teamMeta = state.teams[p.team];
  const pwr = teamMeta?.powers?.[p.role] || {};

  // 1. Pouvoir "Se relever" (5 🪙 PO, usage unique)
  if (p.state === 'sitting' && pwr.standUp) {
    pwr.standUp = false;
    p.state = 'standing';
    spawnParticles(p.pos, 0xfacc15, 20);
    ctx.api.playSfx?.('stand_up', { pos: p.pos });
    broadcastToast(`⚡ <strong>${p.role} utilise "Se relever" !</strong> Elle reprend le jeu !`, 3500);
    updateRosterHUD();
    return;
  }

  // 2. Passe / Tir libre (actif dès Ronde 1, ou à débloquer en Mode Vanille)
  if (p.state === 'standing' && p.carryingBall) {
    if (!canPlayerPassOrThrow(p)) return;
    executeBallPassOrThrow(p, null, p.facingAngle, 0);
    return;
  }

  // 3. Outil déployable ([E] sans balle, désactivé en Mode Vanille)
  if (!state.vanillaMode && p.state === 'standing' && !p.carryingBall && pwr.toolEvo) {
    deployPlayerTool(p, pwr.toolEvo, p.pos.x, p.pos.y, p.pos.z, p.facingAngle, !!p.onCanopy, false);
  }
}

function getPlayerDashParams(p) {
  if (state.vanillaMode) {
    return {
      isSuper: false,
      kind: null,
      duration: DASH_DURATION,
      cooldown: DASH_COOLDOWN,
      speed: DASH_SPEED
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
    speed
  };
}

function triggerBoomerangReturn(p) {
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
    const returnDur = 0.2;
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
  triggerGamepadRumble(100, 0.45, 0.6);
  showToast('🪃 <strong>Retour Boomerang !</strong>', 1200);
  return true;
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

  // Réactivation Boomerang pendant la fenêtre de 2s pour revenir à l'emplacement d'origine
  if (p.boomerangWindow > 0 && p.boomerangOrigin) {
    if (triggerBoomerangReturn(p)) return;
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
    const { moveForward, moveRight } = getLocalMoveVector();
    const stickLen = Math.hypot(moveForward, moveRight);
    if (stickLen > 0.05) {
      // Stick manette ou joystick mobile actif : dash dans la direction du stick en vue MOBA (Nord = -Z, Est = +X)
      dx = moveRight / stickLen;
      dz = -moveForward / stickLen;
      setMobaMoveGoal(null);
      hideMobaMoveMarker();
    } else if (state.mobileMode) {
      // Sur mobile sans incliner le stick, suivre l'éventuelle cible tapée ou l'orientation actuelle (jamais le bouton dash)
      if (state.mobaMoveTarget) {
        dx = state.mobaMoveTarget.x - p.pos.x;
        dz = state.mobaMoveTarget.z - p.pos.z;
      }
      const len = Math.hypot(dx, dz);
      if (len > 0.05) {
        dx /= len;
        dz /= len;
      } else {
        dx = Math.sin(p.facingAngle);
        dz = Math.cos(p.facingAngle);
      }
      setMobaMoveGoal(null);
      hideMobaMoveMarker();
    } else {
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
      const len = Math.hypot(dx, dz);
      if (len > 0.05) {
        dx /= len;
        dz /= len;
      } else {
        dx = Math.sin(p.facingAngle);
        dz = Math.cos(p.facingAngle);
      }
      if (!state.mobaRightMouseDown) {
        setMobaMoveGoal(null);
        hideMobaMoveMarker();
      }
    }
  } else {
    const { moveForward, moveRight } = getLocalMoveVector();
    const camForwardX = -Math.sin(state.camYaw);
    const camForwardZ = -Math.cos(state.camYaw);
    const camRightX = -camForwardZ;
    const camRightZ = camForwardX;

    dx = camForwardX * moveForward + camRightX * moveRight;
    dz = camForwardZ * moveForward + camRightZ * moveRight;
    const len = Math.hypot(dx, dz);

    if (len > 0.01) {
      dx /= len;
      dz /= len;
    } else {
      dx = camForwardX;
      dz = camForwardZ;
    }
  }

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
  triggerGamepadRumble(dp.isSuper ? 130 : 90, dp.isSuper ? 0.5 : 0.35, dp.isSuper ? 0.7 : 0.5);
  if (state.mode === 'tutorial' && state.tutorialStep === 1) {
    markTutorialCheck('dashed');
  }
}

// --- SAUT D'ÉQUIPE (DÉBLOQUÉ PAR teamJump) ---
const MAX_JUMP_MOMENTUM = 36.0;

function clampMomentum2D(vx, vz, maxSpeed = MAX_JUMP_MOMENTUM) {
  const len = Math.hypot(vx || 0, vz || 0);
  if (len > maxSpeed && len > 0.001) {
    const s = maxSpeed / len;
    return [vx * s, vz * s];
  }
  return [vx || 0, vz || 0];
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
      mvz
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
  if (Math.hypot(mvx, mvz) > 12) {
    spawnParticles(p.pos, 0xffffff, 8);
  }
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

// --- OUTILS DÉPLOYABLES ([ESPACE] SANS BALLE) & SURFACES GLISSANTES ---
export const activeToolBeacons = [];
export const activeToolWalls = [];
export const activeToolPads = [];
export const activeSlidePatches = [];

function removePlayerExistingTools(ownerId) {
  let removedWall = false;
  const prune = (arr, isWall = false) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].ownerId === ownerId) {
        if (arr[i].group) scene.remove(arr[i].group);
        arr.splice(i, 1);
        if (isWall) removedWall = true;
      }
    }
  };
  prune(activeToolBeacons);
  prune(activeToolWalls, true);
  prune(activeToolPads);
  if (removedWall) markNavDynamicDirty();
}

export function clearAllDeployedTools() {
  const hadWalls = activeToolWalls.length > 0;
  while (activeToolBeacons.length > 0) {
    const b = activeToolBeacons.pop();
    if (b.group) scene.remove(b.group);
  }
  while (activeToolWalls.length > 0) {
    const w = activeToolWalls.pop();
    if (w.group) scene.remove(w.group);
  }
  while (activeToolPads.length > 0) {
    const pad = activeToolPads.pop();
    if (pad.group) scene.remove(pad.group);
  }
  if (hadWalls) markNavDynamicDirty();
}

export function clearAllSlidePatches() {
  while (activeSlidePatches.length > 0) {
    const sp = activeSlidePatches.pop();
    if (sp.mesh) scene.remove(sp.mesh);
  }
}

export function serializeLateToolsAndPatches() {
  const serializeTool = (t) => ({
    ownerId: t.ownerId,
    toolKey: t.toolKey,
    ox: t.ox,
    oy: t.oy,
    oz: t.oz,
    facingAngle: t.facingAngle,
    onCanopy: !!t.onCanopy
  });
  return {
    tools: [
      ...activeToolBeacons.map(serializeTool),
      ...activeToolWalls.map(serializeTool),
      ...activeToolPads.map(serializeTool)
    ],
    slides: activeSlidePatches.map((sp) => ({
      ownerId: sp.ownerId,
      team: sp.team,
      x: sp.x,
      y: sp.y,
      z: sp.z,
      timer: Number(sp.timer.toFixed(2))
    }))
  };
}

export function applyLateToolsAndPatches(data) {
  if (!data) return;
  clearAllDeployedTools();
  clearAllSlidePatches();
  (data.tools || []).forEach((t) => {
    const owner = players.find((pl) => pl.id === t.ownerId);
    if (!owner) return;
    deployPlayerTool(owner, t.toolKey, t.ox, t.oy, t.oz, t.facingAngle, !!t.onCanopy, true);
  });
  (data.slides || []).forEach((sp) => {
    spawnSlidePatch(sp.ownerId, sp.team, sp.x, sp.y, sp.z, false);
    const created = activeSlidePatches[activeSlidePatches.length - 1];
    if (created && typeof sp.timer === 'number') {
      created.timer = Math.max(0.05, sp.timer);
    }
  });
  markNavDynamicDirty();
}

export function spawnSlidePatch(ownerId, team, x, y, z, broadcast = true) {
  const patchGeo = new THREE.CircleGeometry(1.28, 18);
  patchGeo.rotateX(-Math.PI / 2);
  const patchMat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(patchGeo, patchMat);
  const rimGeo = new THREE.RingGeometry(1.06, 1.28, 18);
  rimGeo.rotateX(-Math.PI / 2);
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.y = 0.005;
  mesh.add(rimMesh);
  const surfY = getStructureSurfaceY(x, z, y >= 3.8).y;
  mesh.position.set(x, surfY + 0.045, z);
  scene.add(mesh);
  activeSlidePatches.push({ ownerId, team, x, y: surfY, z, radius: 1.28, timer: 6.0, mesh, mat: patchMat, rimMat });
  if (activeSlidePatches.length > 48) {
    const oldest = activeSlidePatches.shift();
    if (oldest && oldest.mesh) scene.remove(oldest.mesh);
  }
  if (broadcast && mp.enabled) {
    sendNetMessage({ type: 'MP_SLIDE_PATCH', peerId: mp.myPeerId, ownerId, team, x, y: surfY, z });
  }
}

function isPointOnSlipperySurface(pos, viewerTeam = null, ownerId = null) {
  for (let i = 0; i < activeSlidePatches.length; i++) {
    const sp = activeSlidePatches[i];
    if (ownerId && sp.ownerId === ownerId) continue;
    if (Math.abs((pos.y || 0) - sp.y) > 2.2) continue;
    const dx = pos.x - sp.x;
    const dz = pos.z - sp.z;
    if (dx * dx + dz * dz <= sp.radius * sp.radius) return true;
  }
  return false;
}

export function deployPlayerTool(p, toolKey, ox, oy, oz, facingAngle, onCanopy = false, fromNetwork = false) {
  if (state.vanillaMode) return false;
  if (!p || !toolKey || !TOOL_EVO_META[toolKey]) return false;
  if (!fromNetwork && p.toolCooldown > 0) {
    showToast(`⏳ <strong>Outil en recharge</strong> (${p.toolCooldown.toFixed(1)}s) !`, 1300);
    return false;
  }

  if (!fromNetwork) {
    p.toolCooldown = 4.0;
  }

  const dirX = Math.sin(facingAngle);
  const dirZ = Math.cos(facingAngle);
  const placeDist = toolKey === 'beacon' ? 2.5 : 2.2;
  const rawPos = new THREE.Vector3(ox + dirX * placeDist, oy, oz + dirZ * placeDist);
  clampToField(rawPos, 0.75, null, { onCanopy: !!onCanopy, isAirborne: false });
  const px = rawPos.x;
  const pz = rawPos.z;
  const py = getStructureSurfaceY(px, pz, !!onCanopy).y;

  removePlayerExistingTools(p.id);

  const isAlly = p.team === 'ally';
  const accentHex = isAlly ? 0xfacc15 : 0xc084fc;
  const group = new THREE.Group();
  group.position.set(px, py, pz);
  scene.add(group);

  if (toolKey === 'beacon') {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.45, 0.24, 12),
      createToonMat(0x1e293b)
    );
    base.position.y = 0.12;
    group.add(base);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 1.35, 8),
      createToonMat(0x64748b)
    );
    mast.position.y = 0.8;
    group.add(mast);

    const orb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshBasicMaterial({ color: accentHex })
    );
    orb.position.y = 1.62;
    group.add(orb);

    const radarMat = new THREE.MeshBasicMaterial({
      color: accentHex,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const radarRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 28), radarMat);
    radarRing.rotation.x = -Math.PI / 2;
    radarRing.position.y = 0.05;
    group.add(radarRing);

    activeToolBeacons.push({
      ownerId: p.id,
      team: p.team,
      toolKey: 'beacon',
      ox,
      oy,
      oz,
      facingAngle,
      onCanopy: !!onCanopy,
      pos: new THREE.Vector3(px, py, pz),
      x: px,
      y: py,
      z: pz,
      visionRadius: 17.5,
      group,
      orb,
      radarRing,
      animTime: 0
    });
    updateTeamVisionState(true);
  } else if (toolKey === 'wall') {
    const halfLen = 1.5; // 3 m de long exactement
    const rightX = Math.cos(facingAngle);
    const rightZ = -Math.sin(facingAngle);
    const ax = px - rightX * halfLen;
    const az = pz - rightZ * halfLen;
    const bx = px + rightX * halfLen;
    const bz = pz + rightZ * halfLen;

    group.rotation.y = facingAngle;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 2.25, 0.62),
      createToonMat(0x334155)
    );
    body.position.y = 1.125;
    addAnimeOutline(body, 1.03, 0x0f172a);
    group.add(body);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(2.86, 0.24, 0.7),
      new THREE.MeshBasicMaterial({ color: accentHex })
    );
    trim.position.y = 1.78;
    group.add(trim);

    activeToolWalls.push({
      ownerId: p.id,
      team: p.team,
      toolKey: 'wall',
      ox,
      oy,
      oz,
      facingAngle,
      onCanopy: !!onCanopy,
      cx: px,
      cy: py,
      cz: pz,
      ax,
      az,
      bx,
      bz,
      halfLen,
      thickness: 0.36,
      height: 2.35,
      group
    });
    markNavDynamicDirty();
    // Repousser immédiatement les entités qui chevauchent le mur posé
    players.forEach((pl) => {
      if (!pl.tutorialHidden) clampToField(pl.pos, 0.72, pl.vel, { onCanopy: !!pl.onCanopy });
    });
  } else if (toolKey === 'pad') {
    group.rotation.y = facingAngle;
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.1, 2.8),
      createToonMat(0x0f172a)
    );
    plate.position.y = 0.05;
    group.add(plate);

    const glowStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(1.65, 2.5),
      new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    glowStrip.rotation.x = -Math.PI / 2;
    glowStrip.position.y = 0.11;
    group.add(glowStrip);

    const chevronShape = new THREE.Shape();
    chevronShape.moveTo(0, 0.35);
    chevronShape.lineTo(-0.55, -0.15);
    chevronShape.lineTo(-0.35, -0.32);
    chevronShape.lineTo(0, 0.02);
    chevronShape.lineTo(0.35, -0.32);
    chevronShape.lineTo(0.55, -0.15);
    chevronShape.closePath();
    const chevGeo = new THREE.ShapeGeometry(chevronShape);
    chevGeo.rotateX(-Math.PI / 2);
    chevGeo.rotateY(Math.PI);

    const arrows = [];
    for (let k = -1; k <= 1; k++) {
      const chevMat = new THREE.MeshBasicMaterial({
        color: k === 1 ? accentHex : 0x38bdf8,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const chev = new THREE.Mesh(chevGeo, chevMat);
      chev.position.set(0, 0.12, k * 0.68);
      group.add(chev);
      arrows.push(chev);
    }

    activeToolPads.push({
      ownerId: p.id,
      team: p.team,
      toolKey: 'pad',
      ox,
      oy,
      oz,
      facingAngle,
      onCanopy: !!onCanopy,
      x: px,
      y: py,
      z: pz,
      dirX,
      dirZ,
      radius: 1.35,
      cooldownByPlayer: {},
      group,
      arrows,
      animTime: 0
    });
  }

  spawnParticles(new THREE.Vector3(px, py + 0.5, pz), accentHex, 14);
  ctx.api.playSfx?.('tool_' + toolKey, { pos: { x: px, y: py, z: pz } });
  if (!fromNetwork) {
    const tMeta = TOOL_EVO_META[toolKey];
    broadcastToast(`${tMeta.icon} <strong>${p.role}</strong> déploie : <strong>${tMeta.shortLabel}</strong> !`, 2200);
    if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.TOOLS && p.team === 'ally') {
      markTutorialCheck('toolBought');
      markTutorialCheck('toolDeployed');
    }
    if (mp.enabled) {
      sendNetMessage({
        type: 'MP_TOOL_DEPLOY',
        peerId: mp.myPeerId,
        team: p.team,
        role: p.role,
        toolKey,
        x: ox,
        y: oy,
        z: oz,
        facingAngle,
        onCanopy: !!onCanopy
      });
    }
  }
  return true;
}

export function updateDeployedToolsAndPatches(dt) {
  for (let i = activeSlidePatches.length - 1; i >= 0; i--) {
    const sp = activeSlidePatches[i];
    sp.timer -= dt;
    if (sp.mat && sp.timer < 1.5) {
      const fade = Math.max(0.05, sp.timer / 1.5);
      sp.mat.opacity = fade * 0.62;
      if (sp.rimMat) sp.rimMat.opacity = fade * 0.72;
    }
    if (sp.timer <= 0) {
      if (sp.mesh) scene.remove(sp.mesh);
      activeSlidePatches.splice(i, 1);
    }
  }

  for (let i = 0; i < activeToolBeacons.length; i++) {
    const b = activeToolBeacons[i];
    b.animTime += dt;
    if (b.orb) {
      b.orb.rotation.y += dt * 2.2;
      b.orb.position.y = 1.62 + Math.sin(b.animTime * 3.2) * 0.08;
    }
    if (b.radarRing) {
      const sc = 0.8 + ((b.animTime * 0.85) % 1.0) * 1.4;
      b.radarRing.scale.setScalar(sc);
      b.radarRing.material.opacity = 0.45 * (1 - ((b.animTime * 0.85) % 1.0));
    }
  }

  for (let i = 0; i < activeToolPads.length; i++) {
    const pad = activeToolPads[i];
    pad.animTime += dt;
    if (pad.arrows) {
      pad.arrows.forEach((arr, idx) => {
        const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(pad.animTime * 7 - idx * 1.1));
        arr.material.opacity = pulse;
      });
    }
    for (const pid in pad.cooldownByPlayer) {
      pad.cooldownByPlayer[pid] -= dt;
      if (pad.cooldownByPlayer[pid] <= 0) delete pad.cooldownByPlayer[pid];
    }

    for (let pIdx = 0; pIdx < players.length; pIdx++) {
      const pl = players[pIdx];
      if (pl.tutorialHidden || pl.state !== 'standing') continue;
      if (pad.cooldownByPlayer[pl.id] > 0) continue;
      if (Math.abs((pl.pos.y || 0) - pad.y) > 2.2) continue;
      const dx = pl.pos.x - pad.x;
      const dz = pl.pos.z - pad.z;
      if (dx * dx + dz * dz <= pad.radius * pad.radius) {
        pad.cooldownByPlayer[pl.id] = 1.0;
        pl.padBoostTimer = PAD_DASH_DURATION;
        pl.padDirX = pad.dirX;
        pl.padDirZ = pad.dirZ;
        pl.facingAngle = Math.atan2(pad.dirX, pad.dirZ);
        spawnParticles(pl.pos, 0x38bdf8, 12);
        ctx.api.playSfx?.('pad_boost', { pos: pl.pos });
      }
    }
  }
}

// --- MISE À JOUR PHYSIQUE & GAMEPLAY ---
function getLocalMoveVector() {
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

export function stepCharacterVerticalPhysics(p, intendedVx, intendedVz, dt, isDash = false) {
  if (p.isAirborne) {
    const isJump = p.airSource === 'jump';
    let airVx;
    let airVz;
    if (isJump) {
      const momSpeed = Math.hypot(p.jumpMomentumVx || 0, p.jumpMomentumVz || 0);
      if (momSpeed > 0.25) {
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
          airVx = blendVx * scale;
          airVz = blendVz * scale;
        } else {
          airVx = blendVx;
          airVz = blendVz;
        }
      } else {
        airVx = intendedVx;
        airVz = intendedVz;
      }
    } else {
      airVx = isDash ? intendedVx : intendedVx * 0.74;
      airVz = p.launchVz;
    }
    p.pos.x += airVx * dt;
    p.pos.z += airVz * dt;
    p.vy -= 22.0 * dt;
    p.pos.y += p.vy * dt;

    clampToField(p.pos, 0.72, null, {
      onCanopy: !!p.onCanopy,
      isAirborne: true,
      airSource: p.airSource || null
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
    return;
  }

  const prevSurf = getStructureSurfaceY(p.pos.x, p.pos.z, !!p.onCanopy);
  const onLaunchZone =
    !!p.onCanopy && (prevSurf.zone === 'northLaunch' || prevSurf.zone === 'southLaunch');
  const signZ = p.pos.z < 0 ? -1 : 1;

  if (
    onLaunchZone &&
    (p.isLaunching ||
      Math.abs(p.pos.z) >= CANOPY_SPEC.launchCommitZ ||
      (intendedVz * signZ > 0.35 && Math.abs(p.pos.z) >= CANOPY_SPEC.launchInnerZ))
  ) {
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
    return;
  }

  p.isLaunching = false;
  let moveVx = intendedVx;
  let moveVz = intendedVz;

  if (!isDash) {
    let slopeScale = 1.0;
    if (p.onCanopy && (prevSurf.zone === 'westRamp' || prevSurf.zone === 'eastRamp')) {
      const inwardDir = -Math.sign(p.pos.x);
      if (moveVx * inwardDir > 0.25) {
        slopeScale = 0.8; // Montée étroite vers la canopée
      } else if (moveVx * inwardDir < -0.25) {
        slopeScale = 1.08;
      }
    }
    if (p.launchBoostTimer > 0) {
      slopeScale *= 1.25; // Élan de réception dans la lane
    }
    moveVx *= slopeScale;
    moveVz *= slopeScale;
    const wasOnSlidePatch = !!p.onSlidePatch;
    p.onSlidePatch = isPointOnSlipperySurface(p.pos, p.team, p.id);
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
      // Impossible de changer de direction tant qu'on glisse sur la plaque de givre
      moveVx = p.iceSlideDirX * p.iceSlideSpeed;
      moveVz = p.iceSlideDirZ * p.iceSlideSpeed;
      if (p.iceSlideSpeed > 0.1 && !isPlayerChargingFireUlt(p)) {
        p.facingAngle = lerpAngle(p.facingAngle, Math.atan2(p.iceSlideDirX, p.iceSlideDirZ), 18 * dt);
      }
    } else if (wasOnSlidePatch) {
      p.iceSlideDirX = 0;
      p.iceSlideDirZ = 0;
      p.iceSlideSpeed = 0;
      p.slideGlideTimer = 0.22;
      p.slideGlideVx = p.vel.x * 0.65;
      p.slideGlideVz = p.vel.z * 0.65;
    }
  } else {
    p.onSlidePatch = false;
    p.iceSlideDirX = 0;
    p.iceSlideDirZ = 0;
    p.iceSlideSpeed = 0;
  }

  if (!p.onCanopy && p.state === 'standing' && !p.onSlidePatch) {
    const riverCur = getRiftRiverCurrent(p.pos.x, p.pos.z);
    if (riverCur) {
      moveVx += riverCur.vx;
      moveVz += riverCur.vz;
      if (!state.lowSpecMode && Math.random() < 7.5 * dt) {
        spawnParticles(p.pos, 0x7dd3fc, 1);
      }
    }
  }

  p.pos.x += moveVx * dt;
  p.pos.z += moveVz * dt;

  const preClampX = p.pos.x;
  const preClampZ = p.pos.z;

  // Accrochage à l'entrée basse d'une rampe de corde/bois (|X| : 55,6..58,0)
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

  clampToField(p.pos, 0.72, null, {
    onCanopy: !!p.onCanopy,
    isAirborne: false
  });

  // Glissement le long d'un mur / obstacle si une plaque de givre y pousse la joueuse
  if (!isDash && p.onSlidePatch && p.iceSlideSpeed > 0.1) {
    const corX = p.pos.x - preClampX;
    const corZ = p.pos.z - preClampZ;
    const corLen = Math.hypot(corX, corZ);
    if (corLen > 0.015) {
      const nx = corX / corLen;
      const nz = corZ / corLen;
      const dot = p.iceSlideDirX * nx + p.iceSlideDirZ * nz;
      if (dot < -0.1) {
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
    }
  }

  // Dash Rebondissant : rebondit sur les murs/obstacles et réinitialise la distance
  if (isDash && p.dashKind === 'bounce' && p.dashBouncesLeft > 0) {
    const corX = p.pos.x - preClampX;
    const corZ = p.pos.z - preClampZ;
    const corLen = Math.hypot(corX, corZ);
    if (corLen > 0.015) {
      const nx = corX / corLen;
      const nz = corZ / corLen;
      const dot = p.dashDirX * nx + p.dashDirZ * nz;
      if (dot < -0.18) {
        let rx = p.dashDirX - 2 * dot * nx;
        let rz = p.dashDirZ - 2 * dot * nz;
        const rLen = Math.hypot(rx, rz) || 1;
        p.dashDirX = rx / rLen;
        p.dashDirZ = rz / rLen;
        p.facingAngle = Math.atan2(p.dashDirX, p.dashDirZ);
        p.dashTimer = p.dashMaxDuration || DASH_EVO_META.bounce.duration;
        p.dashBouncesLeft -= 1;
        spawnParticles(p.pos, 0xfacc15, 14);
        ctx.api.playSfx?.('dash_wall_bounce', { pos: p.pos, bounceIndex: 3 - p.dashBouncesLeft });
      }
    }
  }

  // Dash Glissant : laisse des plaques de surface glissante derrière soi
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

function applyHumanMovement(p, moveForward, moveRight, camYaw, dt, isAerialLocal = false) {
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
    // Dash Glissant : dirigeable à la caméra/curseur (pas WASD) avec inertie de glisse
    if (p.dashKind === 'slide') {
      let steerAngle = null;
      if (state.mobileMode) {
        const joyF = mobileInput.joyForward || 0;
        const joyR = mobileInput.joyRight || 0;
        const camX = mobileInput.camX || mobileInput.camRight || 0;
        const camY = mobileInput.camY || mobileInput.camForward || 0;
        if (isAerialLocal) {
          if (Math.hypot(camX, camY) > 0.14) {
            steerAngle = Math.atan2(camX, -camY);
          } else if (Math.hypot(joyF, joyR) > 0.14) {
            steerAngle = Math.atan2(joyR, -joyF);
          }
        } else if (Math.hypot(joyF, joyR) > 0.14) {
          const cfX = -Math.sin(camYaw);
          const cfZ = -Math.cos(camYaw);
          const crX = -cfZ;
          const crZ = cfX;
          steerAngle = Math.atan2(cfX * joyF + crX * joyR, cfZ * joyF + crZ * joyR);
        } else {
          steerAngle = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
        }
      } else if (isAerialLocal) {
        let aimHit = null;
        if (typeof state.mouseClientX === 'number' && typeof state.mouseClientY === 'number') {
          aimHit = raycastScreenToWorld(state.mouseClientX, state.mouseClientY);
          if (aimHit) state.mobaAimWorld = aimHit;
        }
        if (!aimHit) aimHit = state.mobaAimWorld;
        if (aimHit) {
          const adx = aimHit.x - p.pos.x;
          const adz = aimHit.z - p.pos.z;
          if (Math.hypot(adx, adz) > 0.25) steerAngle = Math.atan2(adx, adz);
        }
      } else {
        steerAngle = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
      }
      if (steerAngle !== null) {
        const curAng = Math.atan2(p.dashDirX, p.dashDirZ);
        const nextAng = lerpAngle(curAng, steerAngle, 5.5 * dt);
        p.dashDirX = Math.sin(nextAng);
        p.dashDirZ = Math.cos(nextAng);
      }
    }
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
  const camRightX = -camForwardZ;
  const camRightZ = camForwardX;

  let vx = camForwardX * moveForward + camRightX * moveRight;
  let vz = camForwardZ * moveForward + camRightZ * moveRight;
  const len = Math.hypot(vx, vz);

  if (isAerialLocal) {
    if (
      (state.ultPreviewActive || isPlayerChargingFireUlt(p)) &&
      p.team === state.myTeam &&
      p.role === state.controlledRole
    ) {
      p.facingAngle = lerpAngle(p.facingAngle, getUltimateAimAngle(p), 28 * dt);
    } else if (!p.onSlidePatch && len > 0.01) {
      p.facingAngle = lerpAngle(p.facingAngle, Math.atan2(vx, vz), 20 * dt);
    } else if (!p.onSlidePatch && state.mobaAimWorld) {
      const adx = state.mobaAimWorld.x - p.pos.x;
      const adz = state.mobaAimWorld.z - p.pos.z;
      if (Math.hypot(adx, adz) > 0.25) {
        p.facingAngle = lerpAngle(p.facingAngle, Math.atan2(adx, adz), 18 * dt);
      }
    }
  } else if (!p.onSlidePatch) {
    const lookAngle = Math.atan2(camForwardX, camForwardZ);
    p.facingAngle = lerpAngle(p.facingAngle, lookAngle, 20 * dt);
  }

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

export function updateGameplay(dt) {
  if (state.phase !== 'play') return;
  if (!mp.enabled && isMenuOpen()) return;

  state.roundPlayTime = (state.roundPlayTime || 0) + dt;

  players.forEach((p) => {
    if (p.dashCooldown > 0) {
      p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    }
    if (p.jumpCooldown > 0) {
      p.jumpCooldown = Math.max(0, p.jumpCooldown - dt);
    }
    if (p.ultCooldown > 0) {
      p.ultCooldown = Math.max(0, p.ultCooldown - dt);
      if (p.ultCooldown <= 0 && p.team === state.myTeam && p.role === state.controlledRole) {
        updateUltHudWidget();
      }
    }
    if (p.toolCooldown > 0) {
      p.toolCooldown = Math.max(0, p.toolCooldown - dt);
    }
    if (p.boomerangWindow > 0 && p.dashTimer <= 0) {
      p.boomerangWindow = Math.max(0, p.boomerangWindow - dt);
      if (p.boomerangWindow <= 0) p.boomerangOrigin = null;
    }
    if (p.dashMomentumGrace > 0) {
      p.dashMomentumGrace = Math.max(0, p.dashMomentumGrace - dt);
    }
    if (p.state !== 'standing') {
      p.jumpMomentumVx = 0;
      p.jumpMomentumVz = 0;
      p.dashMomentumGrace = 0;
    }
    if (p.launchBoostTimer > 0) {
      p.launchBoostTimer = Math.max(0, p.launchBoostTimer - dt);
    }
    if (p.leafUltTimer > 0) {
      p.leafUltTimer = Math.max(0, p.leafUltTimer - dt);
      if (p.carryingBall || p.state !== 'standing') {
        p.leafUltTimer = 0;
      }
    }
    if (p.waterShieldTimer > 0) {
      p.waterShieldTimer = Math.max(0, p.waterShieldTimer - dt);
    }
    if (!(p.team === state.myTeam && p.role === state.controlledRole && p.state === 'standing' && !p.carryingBall)) {
      p.dashTimer = 0;
      if (p.carryingBall || p.state !== 'standing') {
        p.boomerangWindow = 0;
        p.boomerangOrigin = null;
      }
    }
  });

  updatePassCharge(dt);

  const rawMove = isMenuOpen() ? { moveForward: 0, moveRight: 0 } : getLocalMoveVector();
  let moveForward = rawMove.moveForward;
  let moveRight = rawMove.moveRight;
  let moveYaw = state.camYaw;
  const isAerialLocal = state.cameraMode === 'aerial' && !isMenuOpen();
  const myControlled = getPlayer(state.myTeam, state.controlledRole);

  if (isAerialLocal) {
    moveYaw = 0; // Nord (-Z) en haut de l'écran, Est (+X) à droite
    if (Math.hypot(moveForward, moveRight) > 0.05) {
      // Stick manette ou joystick mobile actif uniquement (WASD/ZQSD clavier désactivés en mode MOBA)
      setMobaMoveGoal(null);
      hideMobaMoveMarker();
      if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.MOBA) {
        markTutorialCheck('mobaToggled');
        markTutorialCheck('mobaMoved');
      }
    } else if (myControlled && myControlled.state === 'standing') {
      if (state.mobaMoveTarget && (!Array.isArray(state.mobaPath) || state.mobaPath.length === 0)) {
        setMobaMoveGoal(state.mobaMoveTarget, {
          immediate: true,
          onCanopy: !!state.mobaTargetOnCanopy
        });
      }

      if (Array.isArray(state.mobaPath) && state.mobaPath.length > 0) {
        // Replanification auto si un mur dynamique vient de changer
        if (state.mobaPathGoal && getNavVersion() !== mobaPathNavVersion) {
          setMobaMoveGoal(state.mobaPathGoal, {
            immediate: true,
            onCanopy: !!state.mobaTargetOnCanopy
          });
        }

        while (state.mobaPathIndex < state.mobaPath.length) {
          const wp = state.mobaPath[state.mobaPathIndex];
          const isLast = state.mobaPathIndex >= state.mobaPath.length - 1;
          const tol = isLast ? 0.48 : 0.75;
          const distWp = Math.hypot(wp.x - myControlled.pos.x, wp.z - myControlled.pos.z);
          if (distWp <= tol) {
            state.mobaPathIndex++;
          } else {
            break;
          }
        }

        if (state.mobaPathIndex >= state.mobaPath.length) {
          setMobaMoveGoal(null);
          hideMobaMoveMarker();
          moveForward = 0;
          moveRight = 0;
        } else {
          const wp = state.mobaPath[state.mobaPathIndex];
          const dx = wp.x - myControlled.pos.x;
          const dz = wp.z - myControlled.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.001) {
            moveForward = -dz / dist;
            moveRight = dx / dist;
          }

          // Détection anti-blocage (replanification si la joueuse n'avance plus sur 0.25s)
          const busySpecial =
            myControlled.dashTimer > 0 ||
            myControlled.padBoostTimer > 0 ||
            myControlled.isAirborne ||
            myControlled.isLaunching ||
            myControlled.onSlidePatch;
          if (!busySpecial) {
            if (!state.mobaPathLastPos) {
              state.mobaPathLastPos = { x: myControlled.pos.x, z: myControlled.pos.z };
              state.mobaPathStuckTimer = 0;
            } else {
              const moved = Math.hypot(
                myControlled.pos.x - state.mobaPathLastPos.x,
                myControlled.pos.z - state.mobaPathLastPos.z
              );
              if (moved < 0.08) {
                state.mobaPathStuckTimer = (state.mobaPathStuckTimer || 0) + dt;
                if (state.mobaPathStuckTimer >= 0.25 && state.mobaPathGoal) {
                  setMobaMoveGoal(state.mobaPathGoal, {
                    immediate: true,
                    onCanopy: !!state.mobaTargetOnCanopy
                  });
                }
              } else {
                state.mobaPathLastPos.x = myControlled.pos.x;
                state.mobaPathLastPos.z = myControlled.pos.z;
                state.mobaPathStuckTimer = 0;
              }
            }
          }
        }
      }
    }
  }

  updateMobaMoveMarkerAnim(dt);

  // Si Client en multijoueur : mouvement 100% local de notre joueuse + interpolation fluide des autres entités
  if (mp.enabled && !mp.isHost) {
    const myPlayer = myControlled;
    if (myPlayer && myPlayer.state === 'standing') {
      applyHumanMovement(myPlayer, moveForward, moveRight, moveYaw, dt, isAerialLocal);
    } else if (myPlayer) {
      myPlayer.vel.set(0, 0, 0);
    }

    const smooth = 1 - Math.exp(-15 * dt);
    players.forEach((p) => {
      if (p === myPlayer && p.state === 'standing') return;
      p.targetPos.x += p.vel.x * dt;
      p.targetPos.y += p.vel.y * dt;
      p.targetPos.z += p.vel.z * dt;
      p.pos.lerp(p.targetPos, smooth);
      if (typeof p.targetFacingAngle === 'number') {
        p.facingAngle = lerpAngle(p.facingAngle, p.targetFacingAngle, smooth);
      }
    });

    const ballSmooth = 1 - Math.exp(-18 * dt);
    balls.forEach((b) => {
      if (b.state === 'carried' && b.carrier) {
        const c = b.carrier;
        const fx = Math.sin(c.facingAngle);
        const fz = Math.cos(c.facingAngle);
        b.pos.set(c.pos.x + fx * 0.75, c.pos.y + 1.25, c.pos.z + fz * 0.75);
      } else if (b.state === 'ground' || b.state === 'thrown') {
        if (b.state === 'thrown') {
          b.targetPos.addScaledVector(b.vel, dt);
          clampToField(b.targetPos, 0.55, null, {
            onCanopy: false,
            isAirborne: b.targetPos.y >= CANOPY_SPEC.launchLipY
          });
        }
        b.pos.lerp(b.targetPos, ballSmooth);
      }
      b.mesh.group.position.copy(b.pos);
      if (b.state === 'carried' && b.carrier) {
        b.mesh.group.visible = !b.tutorialHidden && !b.carrier.tutorialHidden && !!b.carrier.mesh?.root?.visible;
      } else {
        b.mesh.group.visible = !b.tutorialHidden;
      }
    });

    mp.syncAccumulator += dt;
    if (mp.syncAccumulator >= 0.03) {
      mp.syncAccumulator = 0;
      const seenEnemyRoles = players
        .filter((ep) => ep.team !== state.myTeam && ep.backRevealed)
        .map((ep) => ep.role);
      sendNetMessage({
        type: 'MP_PLAYER_INPUT',
        round: state.round,
        peerId: mp.myPeerId,
        seq: ++mp.inputSeq,
        team: state.myTeam,
        role: state.controlledRole,
        x: myPlayer ? myPlayer.pos.x : 0,
        y: myPlayer ? myPlayer.pos.y : 0,
        z: myPlayer ? myPlayer.pos.z : 0,
        vx: myPlayer ? myPlayer.vel.x : 0,
        vy: myPlayer ? myPlayer.vel.y : 0,
        vz: myPlayer ? myPlayer.vel.z : 0,
        oc: myPlayer && myPlayer.onCanopy ? 1 : 0,
        facingAngle: myPlayer ? myPlayer.facingAngle : 0,
        moveForward,
        moveRight,
        camYaw: state.camYaw,
        rev: seenEnemyRoles,
        actionTriggered: false
      });
    }

    updateUltimates(dt);
    updateBackVisibility();
    syncPlayerMeshes(dt);
    balls.forEach((b) => {
      if (b.state === 'carried' && b.carrier) {
        b.mesh.group.visible = !b.tutorialHidden && !b.carrier.tutorialHidden && !!b.carrier.mesh?.root?.visible;
      }
    });
    return;
  }

  // --- EXÉCUTION MAÎTRE (SOLO OU HÔTE MULTIJOUEUR) ---
  const now = performance.now();

  players.forEach((p) => {
    if (p.tutorialHidden) return;
    if (p.state === 'sitting') {
      p.mesh.bodyGroup.position.y = THREE.MathUtils.lerp(p.mesh.bodyGroup.position.y, -0.55, 8 * dt);
      p.mesh.leftLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.leftLeg.rotation.x, -Math.PI / 2, 8 * dt);
      p.mesh.rightLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.rightLeg.rotation.x, -Math.PI / 2, 8 * dt);
      return;
    }

    p.mesh.bodyGroup.position.y = THREE.MathUtils.lerp(p.mesh.bodyGroup.position.y, 0, 10 * dt);

    if (p.state === 'rule1') {
      p.vel.set(0, 0, 0);
      if (p.rule1Partner) {
        const dx = p.rule1Partner.pos.x - p.pos.x;
        const dz = p.rule1Partner.pos.z - p.pos.z;
        p.facingAngle = Math.atan2(dx, dz);
      }
      return;
    }

    // 1. Contrôlée par l'Hôte local ?
    if (p.team === state.myTeam && p.role === state.controlledRole) {
      applyHumanMovement(p, moveForward, moveRight, moveYaw, dt, isAerialLocal);
      return;
    }

    // 2. Contrôlée par un joueur distant connecté en P2P ?
    if (mp.enabled) {
      let remote = null;
      for (const peerKey in mp.remoteInputs) {
        const inp = mp.remoteInputs[peerKey];
        if (inp && inp.team === p.team && inp.role === p.role && now - inp.lastSeen < 10000) {
          remote = inp;
          break;
        }
      }
      if (remote) {
        if (typeof remote.x === 'number' && typeof remote.z === 'number') {
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
        } else {
          applyHumanMovement(p, remote.moveForward, remote.moveRight, remote.camYaw, dt);
        }
        return;
      }
    }

    // 3. Sinon, contrôlée par l'IA
    updateAIPlayer(p, dt);
  });

  updateUltimates(dt);
  updateBackVisibility();
  updateBalls(dt);
  checkPlayerCollisions();
  syncPlayerMeshes(dt);
  balls.forEach((b) => {
    if (b.state === 'carried' && b.carrier) {
      b.mesh.group.visible = !b.tutorialHidden && !b.carrier.tutorialHidden && !!b.carrier.mesh?.root?.visible;
    }
  });
  checkRoundEndConditions();

  // Diffusion de l'état 3D aux clients (30 Hz)
  if (mp.enabled && mp.isHost) {
    mp.syncAccumulator += dt;
    if (mp.syncAccumulator >= 0.032) {
      mp.syncAccumulator = 0;
      broadcastWorldState();
    }
  }
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
      r: getMemberControlledRole(m)
    })),
    players: players.map((p) => ({
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
              p.boomerangOrigin.onCanopy ? 1 : 0
            ]
          : null
    })),
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
      oc: b.onCanopy ? 1 : 0
    }))
  });
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

  if (snapshot.balls) {
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

  if (snapshot.players) {
    snapshot.players.forEach((sp) => {
      const p = players.find((item) => item.id === sp.id);
      if (!p) return;
      if (p.color !== sp.c) {
        applyPlayerColor(p, sp.c);
        rosterDirty = true;
      }
      if (p.state !== sp.st) rosterDirty = true;
      p.state = sp.st;
      const nextBall = sp.cb !== null ? balls.find((b) => b.id === sp.cb) : null;
      if (p.carryingBall !== nextBall) rosterDirty = true;
      p.carryingBall = nextBall;
      if (p.carryingBall) {
        p.carryingBall.carrier = p;
      }
      p.rule1Partner = sp.r1 ? players.find((item) => item.id === sp.r1) || null : null;
      if (typeof sp.su === 'boolean' && state.teams[p.team]?.powers?.[p.role]) {
        if (state.teams[p.team].powers[p.role].standUp !== sp.su) {
          state.teams[p.team].powers[p.role].standUp = sp.su;
          rosterDirty = true;
        }
      }
      const localCtl = p.team === state.myTeam && p.role === state.controlledRole;
      if (typeof sp.uu === 'number') {
        const nextUltUsed = !!sp.uu;
        if (p.ultUsed !== nextUltUsed && !(localCtl && p.ultUsed && !nextUltUsed)) {
          p.ultUsed = nextUltUsed;
          rosterDirty = true;
        }
      }
      if (typeof sp.lt === 'number' && !(localCtl && sp.lt === 0 && p.leafUltTimer > 0 && !nextBall)) {
        p.leafUltTimer = sp.lt;
      }
      if (typeof sp.ws === 'number') {
        p.waterShieldTimer = sp.ws;
      }
      if (typeof sp.sl === 'number') {
        p.isSlidingNet = !!sp.sl;
      }
      if (!localCtl) {
        if (Array.isArray(sp.bo) && sp.bo.length >= 4) {
          p.boomerangOrigin = {
            x: sp.bo[0],
            y: sp.bo[1],
            z: sp.bo[2],
            onCanopy: !!sp.bo[4]
          };
          p.boomerangWindow = sp.bo[3];
        } else if (sp.bo === null) {
          p.boomerangOrigin = null;
          p.boomerangWindow = 0;
        }
      }
      if (!p.teamSeeingBack) p.teamSeeingBack = { ally: p.team === 'ally', enemy: p.team === 'enemy' };
      if (typeof sp.sa === 'number') p.teamSeeingBack.ally = !!sp.sa;
      if (typeof sp.se === 'number') p.teamSeeingBack.enemy = !!sp.se;
      const hostTeamSeesBack = state.myTeam === 'ally' ? !!p.teamSeeingBack.ally : !!p.teamSeeingBack.enemy;
      if (p.team !== state.myTeam && hostTeamSeesBack !== p.currentlySeeingBack) {
        p.currentlySeeingBack = hostTeamSeesBack;
        rosterDirty = true;
      }
      if (!p.revealedTo) p.revealedTo = { ally: p.team === 'ally', enemy: p.team === 'enemy' };
      if (typeof sp.ra === 'number') p.revealedTo.ally = !!sp.ra;
      if (typeof sp.re === 'number') p.revealedTo.enemy = !!sp.re;
      const teamKnowsBack = state.myTeam === 'ally' ? p.revealedTo.ally : p.revealedTo.enemy;
      if (teamKnowsBack && !p.backRevealed) {
        p.backRevealed = true;
        rosterDirty = true;
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

      const isLocalControlled =
        p.team === state.myTeam && p.role === state.controlledRole && p.state === 'standing';

      if (isLocalControlled) {
        // Autorité 100% locale sur la position du personnage contrôlé (tolère Turbo Dash / Sky Launch / Sprint Feuille 3x)
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
      } else {
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
    });
  }

  if (rosterDirty) {
    updateRosterHUD();
  }

  const anyRule1 = players.some((p) => p.state === 'rule1');
  document.getElementById('rule1-alert').classList.toggle('hidden', !anyRule1);
}


// --- VISIBILITÉ DU DOS PARTAGÉE PAR ÉQUIPE (MINIMAP & HUD) + PASTILLE 3D ---
function doesTeamSeePlayerBack(target, observerTeam) {
  if (!target || target.tutorialHidden || target.team === observerTeam) return false;
  if (!(target.visibleTo && target.visibleTo[observerTeam])) return false;

  const inStealthBrush =
    target.state === 'standing' &&
    !!isPointInJungleBush(target.pos) &&
    !hasAllyVisionNear(target.pos, VISION_SPEC.bushSpotRange, observerTeam);
  if (inStealthBrush) return false;

  const tFwdX = Math.sin(target.facingAngle);
  const tFwdZ = Math.cos(target.facingAngle);

  for (let i = 0; i < players.length; i++) {
    const obs = players[i];
    if (obs.tutorialHidden || obs.team !== observerTeam || obs.state === 'sitting') continue;
    const toX = target.pos.x - obs.pos.x;
    const toZ = target.pos.z - obs.pos.z;
    const dist = Math.hypot(toX, toZ);
    const maxSpotDist = obs.pos.y >= 3.8 ? VISION_SPEC.canopyRange : VISION_SPEC.groundRange;
    if (dist >= maxSpotDist) continue;

    const normX = toX / Math.max(0.001, dist);
    const normZ = toZ / Math.max(0.001, dist);
    const backDot = tFwdX * normX + tFwdZ * normZ;
    if (backDot <= 0.22) continue;

    const obsFwdX = Math.sin(obs.facingAngle);
    const obsFwdZ = Math.cos(obs.facingAngle);
    const lookDot = obsFwdX * normX + obsFwdZ * normZ;
    if (lookDot <= 0.35) continue;

    if (hasClearLineOfSight(obs.pos, target.pos, false)) {
      return true;
    }
  }
  return false;
}

function updateBackVisibility() {
  updateTeamVisionState();
  let hudNeedsRefresh = false;
  const controlled = getPlayer(state.myTeam, state.controlledRole);

  players.forEach((p) => {
    if (!p.teamSeeingBack) p.teamSeeingBack = { ally: p.team === 'ally', enemy: p.team === 'enemy' };
    if (!p.revealedTo) p.revealedTo = { ally: p.team === 'ally', enemy: p.team === 'enemy' };

    if (p.tutorialHidden) {
      p.mesh.backDisc.visible = false;
      p.currentlySeeingBack = false;
      return;
    }

    if (!mp.enabled || mp.isHost) {
      p.teamSeeingBack.ally = p.team === 'ally' ? true : doesTeamSeePlayerBack(p, 'ally');
      p.teamSeeingBack.enemy = p.team === 'enemy' ? true : doesTeamSeePlayerBack(p, 'enemy');
      if (p.teamSeeingBack.ally) p.revealedTo.ally = true;
      if (p.teamSeeingBack.enemy) p.revealedTo.enemy = true;
    }

    if (p.team === state.myTeam) {
      p.mesh.backDisc.visible = true;
      p.currentlySeeingBack = true;
      return;
    }

    const inTeamSight = !!(p.visibleTo && p.visibleTo[state.myTeam]);
    const clearFromControlled = controlled
      ? hasClearLineOfSight(controlled.pos, p.pos, false)
      : hasClearLineOfSight(camera.position, p.pos, true);

    const inStealthBrush =
      p.state === 'standing' &&
      !!isPointInJungleBush(p.pos) &&
      !hasAllyVisionNear(p.pos, VISION_SPEC.bushSpotRange, state.myTeam);

    let clearlySeen = false;
    let showBackDisc3D = false;

    if (!inStealthBrush && inTeamSight && clearFromControlled) {
      const forwardX = Math.sin(p.facingAngle);
      const forwardZ = Math.cos(p.facingAngle);

      const obsRef = state.cameraMode === 'aerial' && controlled ? controlled.pos : camera.position;
      const camToPlayerX = p.pos.x - obsRef.x;
      const camToPlayerZ = p.pos.z - obsRef.z;
      const dist = Math.hypot(camToPlayerX, camToPlayerZ);
      const normX = camToPlayerX / Math.max(0.001, dist);
      const normZ = camToPlayerZ / Math.max(0.001, dist);

      const dot = forwardX * normX + forwardZ * normZ;
      showBackDisc3D = dot > 0.05;

      const maxSpotDist = controlled && controlled.pos.y >= 3.8 ? VISION_SPEC.canopyRange : VISION_SPEC.groundRange;
      clearlySeen = dot > 0.22 && dist < maxSpotDist;
    }

    p.mesh.backDisc.visible = showBackDisc3D;

    if (clearlySeen && (!mp.enabled || mp.isHost)) {
      p.teamSeeingBack[state.myTeam] = true;
      p.revealedTo[state.myTeam] = true;
    }

    const teamSeesBack =
      !inStealthBrush && inTeamSight && (!!p.teamSeeingBack[state.myTeam] || clearlySeen);

    if (teamSeesBack !== p.currentlySeeingBack) {
      p.currentlySeeingBack = teamSeesBack;
      hudNeedsRefresh = true;
    }

    if (teamSeesBack && !p.backRevealed) {
      p.backRevealed = true;
      p.revealedTo[state.myTeam] = true;
      hudNeedsRefresh = true;
      ctx.api.playSfx?.('back_reveal');
      const cInfo = COLORS[p.color];
      if (cInfo) {
        showToast(
          `👁️ <strong>Dos de Adversaire ${p.role} découvert : ${cInfo.name} (${cInfo.symbol}) !</strong>`,
          3000
        );
      }
    } else if (teamSeesBack && !p.revealedTo[state.myTeam]) {
      p.revealedTo[state.myTeam] = true;
    }
  });

  if (hudNeedsRefresh) {
    updateRosterHUD();
  }
}

// --- MISE À JOUR DES BALLONS ---
function updateBalls(dt) {
  balls.forEach((ball) => {
    if (ball.tutorialHidden || ball.state === 'scored') return;

    if (ball.passIgnoreTimer > 0) {
      ball.passIgnoreTimer = Math.max(0, ball.passIgnoreTimer - dt);
    }

    if (ball.state === 'thrown') {
      const prevBallY = ball.pos.y;
      if (ball.passTargetId) {
        const target = players.find((pl) => pl.id === ball.passTargetId);
        if (target && target.state === 'standing' && !target.carryingBall && !target.tutorialHidden) {
          ball.passFlightRemaining = Math.max(0.05, (ball.passFlightRemaining || 0.30) - dt);
          const rem = ball.passFlightRemaining;
          const desiredVx = (target.pos.x - ball.pos.x) / rem;
          const desiredVz = (target.pos.z - ball.pos.z) / rem;
          const dSpeed = Math.hypot(desiredVx, desiredVz);
          const clampScale = dSpeed > 42 ? 42 / dSpeed : 1;
          const steerAlpha = Math.min(1, 9.0 * dt);
          ball.vel.x = THREE.MathUtils.lerp(ball.vel.x, desiredVx * clampScale, steerAlpha);
          ball.vel.z = THREE.MathUtils.lerp(ball.vel.z, desiredVz * clampScale, steerAlpha);
        } else {
          ball.passTargetId = null;
        }
      }

      ball.pos.addScaledVector(ball.vel, dt);
      ball.vel.y -= 9.8 * dt;
      clampToField(ball.pos, 0.55, ball.vel, {
        onCanopy: false,
        isAirborne: ball.pos.y >= CANOPY_SPEC.launchLipY
      });
      const canopySurf = getCanopySurfaceY(ball.pos.x, ball.pos.z);
      const landsOnCanopy =
        !!canopySurf &&
        ((ball.onCanopy && ball.pos.y >= canopySurf.y - 0.45) ||
          (prevBallY >= canopySurf.y + 0.35 && ball.vel.y <= 0));
      if (!landsOnCanopy && ball.onCanopy) {
        ball.onCanopy = false;
      }
      const groundY = (landsOnCanopy ? canopySurf.y : getTerrainY(ball.pos.x, ball.pos.z)) + 0.52;
      if (ball.pos.y <= groundY) {
        ball.pos.y = groundY;
        ball.vel.y = 0;
        ball.onCanopy = landsOnCanopy;
        ball.passTargetId = null;
        const groundDamp = Math.exp(-7.5 * dt);
        ball.vel.x *= groundDamp;
        ball.vel.z *= groundDamp;
        if (ball.vel.length() < 1.2) {
          ball.state = 'ground';
          ball.thrownByTeam = null;
          ball.thrownById = null;
          ball.passTargetId = null;
          ball.passIgnoreTimer = 0;
        }
      }
    } else if (ball.state === 'ground') {
      const surf = getStructureSurfaceY(ball.pos.x, ball.pos.z, !!ball.onCanopy);
      ball.onCanopy = surf.zone !== 'ground';
      if (!ball.onCanopy) {
        const riverCur = getRiftRiverCurrent(ball.pos.x, ball.pos.z);
        if (riverCur) {
          ball.pos.x += riverCur.vx * 0.72 * dt;
          ball.pos.z += riverCur.vz * 0.72 * dt;
          clampToField(ball.pos, 0.55, null, { onCanopy: false, isAirborne: false });
        }
      }
      ball.pos.y = surf.y + 0.52;
    }

    if (ball.state === 'ground' || ball.state === 'thrown') {
      for (const p of players) {
        if (p.tutorialHidden || p.state !== 'standing' || p.carryingBall) continue;
        if (ball.state === 'thrown' && ball.thrownById === p.id && (ball.passIgnoreTimer || 0) > 0) {
          continue;
        }
        const dist = Math.hypot(p.pos.x - ball.pos.x, p.pos.z - ball.pos.z);
        if (dist < 1.35 && Math.abs(p.pos.y + 0.6 - ball.pos.y) < 1.85) {
          const canReceivePass =
            ball.state === 'thrown' &&
            ball.thrownByTeam === p.team;

          if (p.color === ball.color || canReceivePass) {
            ball.state = 'carried';
            ball.carrier = p;
            ball.thrownByTeam = null;
            ball.thrownById = null;
            ball.passTargetId = null;
            ball.passIgnoreTimer = 0;
            ball.onCanopy = !!p.onCanopy;
            p.carryingBall = ball;
            p.dashTimer = 0;
            p.leafUltTimer = 0;
            if (p.team === state.myTeam && p.role === state.controlledRole && state.ultPreviewActive) {
              cancelUltimatePreview(false);
            }
            spawnParticles(ball.pos, COLORS[ball.color].hex, 10);
            ctx.api.playSfx?.('ball_pickup', { pos: ball.pos });
            updateRosterHUD();
            updateUltHudWidget();

            if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.GOAL && p.team === 'ally') {
              markTutorialCheck('pickedBall');
              showToast(
                `🎓 <strong>Étape 2/8 :</strong> Bravo ! Apportez maintenant ce ballon jusqu'au <strong>cerceau adverse (à droite)</strong> pour marquer +1 pt !`,
                3500
              );
            } else if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.PASS && p.team === 'ally') {
              if (p.role === 'G') {
                markTutorialCheck('pickedPassBall');
                showToast(
                  state.mobileMode
                    ? '🎯 <strong>Ballon pris !</strong> Maintenez <strong>⚽ Passe</strong> et visez <strong>💧 C</strong> (même d’une autre couleur) pour lui passer !'
                    : '🎯 <strong>Ballon pris !</strong> Visez <strong>💧 C</strong> et maintenez <strong>[E]</strong> jusqu’à verrouiller la passe (même d’une autre couleur) !',
                  4200
                );
              } else if (p.role === 'C') {
                markTutorialCheck('pickedPassBall');
                markTutorialCheck('passedBall');
                showToast(
                  '🎯 <strong>Superbe passe !</strong> Même si <strong>C (💧)</strong> n’a pas la couleur du ballon, elle peut réceptionner votre passe !',
                  4000
                );
              }
            }
            break;
          }
        }
      }
    }

    if (ball.state === 'carried' && ball.carrier) {
      const c = ball.carrier;
      const fx = Math.sin(c.facingAngle);
      const fz = Math.cos(c.facingAngle);
      ball.pos.set(c.pos.x + fx * 0.75, c.pos.y + 1.25, c.pos.z + fz * 0.75);
    }

    checkBallGoal(ball);
    ball.mesh.group.position.copy(ball.pos);
    if (ball.state === 'carried' && ball.carrier) {
      ball.mesh.group.visible =
        !ball.tutorialHidden && !ball.carrier.tutorialHidden && !!ball.carrier.mesh?.root?.visible;
    } else {
      ball.mesh.group.visible = !ball.tutorialHidden;
    }
  });
}

function schedulePracticeBallRespawn(ball) {
  const respawnIdx = ball.id === 0 ? 0 : 1;
  setTimeout(() => {
    if (state.mode !== 'practice' || state.phase !== 'play') return;
    ball.state = 'ground';
    ball.carrier = null;
    ball.thrownByTeam = null;
    ball.thrownById = null;
    ball.passTargetId = null;
    ball.passIgnoreTimer = 0;
    ball.onCanopy = false;
    const customSpawn = Array.isArray(FIELD.ballSpawns) && FIELD.ballSpawns[respawnIdx];
    const spawnX = customSpawn ? customSpawn.x : 0;
    const spawnZ = customSpawn ? customSpawn.z : (respawnIdx === 0 ? FIELD.laneTopZ : FIELD.laneBotZ);
    ball.pos.set(spawnX, 0.52, spawnZ);
    ball.targetPos.copy(ball.pos);
    ball.vel.set(0, 0, 0);
    spawnParticles(ball.pos, COLORS[ball.color].hex, 14);
    if (ball.mesh && ball.mesh.group) {
      ball.mesh.group.position.copy(ball.pos);
    }
    if (mp.enabled && mp.isHost) broadcastWorldState();
  }, 1200);
}

function scheduleTutorialPassBallRespawn(ball) {
  setTimeout(() => {
    if (state.mode !== 'tutorial' || state.tutorialStep !== TUTORIAL_STEPS.PASS) return;
    ball.state = 'ground';
    ball.carrier = null;
    ball.thrownByTeam = null;
    ball.thrownById = null;
    ball.passTargetId = null;
    ball.passIgnoreTimer = 0;
    ball.onCanopy = false;
    ball.pos.set(-14, 0.52, FIELD.laneTopZ);
    ball.targetPos.copy(ball.pos);
    ball.vel.set(0, 0, 0);
    if (ball.mesh && ball.mesh.group) {
      ball.mesh.group.position.copy(ball.pos);
    }
    spawnParticles(ball.pos, COLORS[ball.color].hex, 14);
    showToast(
      state.mobileMode
        ? '🎯 <strong>Ballon replacé !</strong> Reprenez-le et maintenez <strong>⚽ Passe</strong> pour viser <strong>💧 C</strong> !'
        : '🎯 <strong>Ballon replacé !</strong> Reprenez-le et maintenez <strong>[E]</strong> pour passer à <strong>💧 C</strong> !',
      3200
    );
  }, 800);
}

function checkBallGoal(ball) {
  if (ball.state === 'scored') return;

  const enemyGoalZ = FIELD.enemyGoalZ || 0;
  const allyGoalZ = FIELD.allyGoalZ || 0;

  // 1. But pour l'Équipe Or ('ally') dans le cerceau adverse
  const distToEnemyGoal = Math.hypot(ball.pos.x - FIELD.enemyGoalX, ball.pos.z - enemyGoalZ);
  if (
    distToEnemyGoal < FIELD.goalRadius &&
    ((ball.state === 'carried' && ball.carrier && ball.carrier.team === 'ally') ||
      (ball.state === 'thrown' && ball.thrownByTeam === 'ally'))
  ) {
    if (ball.carrier) ball.carrier.carryingBall = null;
    ball.carrier = null;
    ball.state = 'scored';
    ball.pos.set(FIELD.enemyGoalX + (ball.id === 0 ? -0.6 : 0.6), 0.52, enemyGoalZ);
    state.allyPV += 1;
    state.roundAllyGoals += 1;
    spawnParticles(ball.pos, 0x38bdf8, 30);
    ctx.api.playSfx?.(state.myTeam === 'ally' ? 'goal_ally' : 'goal_enemy');
    triggerGamepadRumble(320, 0.9, 0.7);
    broadcastToast(`🥅 <strong>BUT ! +1 Point (pt) pour l'Équipe Or !</strong>`, 4000);
    updateTopHUD();
    updateRosterHUD();
    if (state.mode === 'practice') {
      schedulePracticeBallRespawn(ball);
    } else if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.GOAL) {
      markTutorialCheck('pickedBall');
      markTutorialCheck('scoredGoal');
    } else if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.PASS) {
      scheduleTutorialPassBallRespawn(ball);
    }
    return;
  }

  // 2. But pour l'Équipe Violette ('enemy') dans le cerceau allié
  const distToAllyGoal = Math.hypot(ball.pos.x - FIELD.allyGoalX, ball.pos.z - allyGoalZ);
  if (
    distToAllyGoal < FIELD.goalRadius &&
    ((ball.state === 'carried' && ball.carrier && ball.carrier.team === 'enemy') ||
      (ball.state === 'thrown' && ball.thrownByTeam === 'enemy'))
  ) {
    if (ball.carrier) ball.carrier.carryingBall = null;
    ball.carrier = null;
    ball.state = 'scored';
    ball.pos.set(FIELD.allyGoalX + (ball.id === 0 ? -0.6 : 0.6), 0.52, allyGoalZ);
    state.enemyPV += 1;
    state.roundEnemyGoals += 1;
    spawnParticles(ball.pos, 0xc084fc, 30);
    ctx.api.playSfx?.(state.myTeam === 'enemy' ? 'goal_ally' : 'goal_enemy');
    triggerGamepadRumble(320, 0.9, 0.7);
    broadcastToast(`🥅 <strong>BUT ! +1 Point (pt) pour l'Équipe Violette !</strong>`, 4000);
    updateTopHUD();
    updateRosterHUD();
    if (state.mode === 'practice') {
      schedulePracticeBallRespawn(ball);
    } else if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.PASS) {
      scheduleTutorialPassBallRespawn(ball);
    }
  }
}

// --- INTERCEPTIONS ("ASSOYAGE") & RÈGLE 1 DE ROCKET LEAGUE ---
function checkPlayerCollisions() {
  const allies = players.filter((p) => !p.tutorialHidden && p.team === 'ally' && p.state !== 'sitting');
  const enemies = players.filter((p) => !p.tutorialHidden && p.team === 'enemy' && p.state !== 'sitting');

  for (const ally of allies) {
    for (const enemy of enemies) {
      if (ally.state === 'rule1' && ally.rule1Partner === enemy) continue;
      if (Math.abs(ally.pos.y - enemy.pos.y) >= 1.85) continue;
      const dist = Math.hypot(ally.pos.x - enemy.pos.x, ally.pos.z - enemy.pos.z);
      if (dist < 1.32) {
        resolveContact(ally, enemy);
      }
    }
  }

  const anyRule1 = players.some((p) => p.state === 'rule1');
  document.getElementById('rule1-alert').classList.toggle('hidden', !anyRule1);
}

function resolveContact(ally, enemy) {
  enemy.backRevealed = true;
  ally.backRevealed = true;
  if (!enemy.revealedTo) enemy.revealedTo = { ally: false, enemy: true };
  if (!ally.revealedTo) ally.revealedTo = { ally: true, enemy: false };
  enemy.revealedTo.ally = true;
  ally.revealedTo.enemy = true;

  if (COLORS[ally.color].beats === enemy.color) {
    if (
      ally.color === 'red' &&
      (enemy.waterShieldTimer > 0 || isPointProtectedByWaterWave(enemy.pos.x, enemy.pos.z, 1.35))
    ) {
      spawnParticles(enemy.pos, 0x38bdf8, 16);
      ctx.api.playSfx?.('water_shield_block', { pos: enemy.pos });
      broadcastToast(
        `🛡️💧 <strong>Protection d'Eau !</strong> Violette ${enemy.role} est protégée contre le Feu de Or ${ally.role} !`,
        2600
      );
      return;
    }
    sitDownPlayer(enemy);
    if (ally.state === 'rule1') freeFromRule1(ally);
    state.allyPE += 1;
    state.roundAllyKills += 1;
    spawnParticles(enemy.pos, COLORS[ally.color].hex, 22);
    ctx.api.playSfx?.(state.myTeam === 'ally' ? 'intercept_ally' : 'intercept_enemy', { pos: enemy.pos });
    triggerGamepadRumble(200, 0.7, 0.5);
    broadcastToast(
      `💥 <strong>Interception !</strong> Équipe Or ${ally.role} (${COLORS[ally.color].name}) fait asseoir Violette ${enemy.role} (${COLORS[enemy.color].name}) → <strong>+1 🪙 PO Or !</strong>`,
      4000
    );

    if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.TRIANGLE) {
      state.allyPE = Math.max(3, state.allyPE);
      markTutorialCheck('backSeen');
      markTutorialCheck('intercepted');
      showToast(
        '💥 <strong>Superbe interception (+🪙 PO) !</strong> Vous maîtrisez le triangle élémentaire (🔥 > 🌿) !',
        4000
      );
    } else if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.RULE1) {
      markTutorialCheck('rule1Locked');
      markTutorialCheck('rule1Switched');
      markTutorialCheck('rule1Broken');
      const r1Alert = document.getElementById('rule1-alert');
      if (r1Alert) r1Alert.classList.add('hidden');
      showToast(
        '💧⚡ <strong>Situation débloquée !</strong> Seul le bon élément (<strong>💧 > 🔥</strong>) pouvait intercepter Adv C et libérer G !',
        4800
      );
    }

    updateTopHUD();
    updateRosterHUD();
    return;
  }

  if (COLORS[enemy.color].beats === ally.color) {
    if (
      enemy.color === 'red' &&
      (ally.waterShieldTimer > 0 || isPointProtectedByWaterWave(ally.pos.x, ally.pos.z, 1.35))
    ) {
      spawnParticles(ally.pos, 0x38bdf8, 16);
      ctx.api.playSfx?.('water_shield_block', { pos: ally.pos });
      broadcastToast(
        `🛡️💧 <strong>Protection d'Eau !</strong> Or ${ally.role} est protégée contre le Feu de Violette ${enemy.role} !`,
        2600
      );
      return;
    }
    sitDownPlayer(ally);
    if (enemy.state === 'rule1' && !(state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.RULE1)) {
      freeFromRule1(enemy);
    }
    state.enemyPE += 1;
    state.roundEnemyKills += 1;
    spawnParticles(ally.pos, COLORS[enemy.color].hex, 22);
    ctx.api.playSfx?.(state.myTeam === 'enemy' ? 'intercept_ally' : 'intercept_enemy', { pos: ally.pos });
    triggerGamepadRumble(200, 0.7, 0.5);
    broadcastToast(
      `🛑 <strong>Interception !</strong> Équipe Violette ${enemy.role} (${COLORS[enemy.color].name}) fait asseoir Or ${ally.role} (${COLORS[ally.color].name}) → <strong>+1 🪙 PO Violette !</strong>`,
      4000
    );
    if (state.mode === 'tutorial') {
      const recoverTarget = ally;
      if (state.tutorialStep === TUTORIAL_STEPS.RULE1) {
        showToast(
          `❌ <strong>Mauvais élément !</strong> 🔥 bat 🌿 : <strong>${ally.role}</strong> s'assoit et <strong>G reste bloquée</strong> ! Seul le bon élément (<strong>💧 C</strong>, car 💧 > 🔥) peut débloquer la situation !`,
          4200
        );
        setTimeout(() => {
          if (state.mode === 'tutorial' && state.phase === 'play' && recoverTarget.state === 'sitting') {
            recoverTarget.state = 'standing';
            spawnParticles(recoverTarget.pos, 0xfacc15, 12);
            updateRosterHUD();
          }
        }, 1500);
      } else {
        setTimeout(() => {
          if (state.mode === 'tutorial' && state.phase === 'play' && recoverTarget.state === 'sitting') {
            recoverTarget.state = 'standing';
            spawnParticles(recoverTarget.pos, 0xfacc15, 12);
            updateRosterHUD();
            showToast('💡 <strong>Astuce Triangle :</strong> Choisissez une joueuse dont l’élément bat celui de l’adversaire (🌿 > 💧 > 🔥 > 🌿) !', 3400);
          }
        }, 1500);
      }
    }
    updateTopHUD();
    updateRosterHUD();
    return;
  }

  if (ally.color === enemy.color && ally.state === 'standing' && enemy.state === 'standing') {
    ally.state = 'rule1';
    enemy.state = 'rule1';
    ally.rule1Partner = enemy;
    enemy.rule1Partner = ally;
    spawnParticles(ally.pos, 0xfacc15, 16);
    ctx.api.playSfx?.('rule1_lock', { pos: ally.pos });
    broadcastToast(
      `⚡ <strong>RÈGLE 1 DE ROCKET LEAGUE !</strong> Or ${ally.role} et Violette ${enemy.role} ont toutes deux la couleur ${COLORS[ally.color].name} : elles restent bloquées jusqu'à l'intervention d'une 3e joueuse du bon élément !`,
      5000
    );
    if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.RULE1) {
      markTutorialCheck('rule1Locked');
      showToast(
        state.mobileMode
          ? '⚡ <strong>RÈGLE 1 !</strong> Même couleur = blocage ! 🔥 Gauche (G) et 🔥 Adv C sont bloquées face à face. <strong>Seul le bon élément (💧 > 🔥)</strong> libère G — tapez <strong>Centre (C)</strong> puis touchez Adv C !'
          : '⚡ <strong>RÈGLE 1 !</strong> Même couleur = blocage ! 🔥 Gauche (G) et 🔥 Adv C sont bloquées face à face. <strong>Seul le bon élément (💧 > 🔥)</strong> libère G — passez sur <strong>💧 Centre (C) [2]</strong> puis touchez Adv C !',
        5500
      );
    } else if (state.mode === 'tutorial') {
      setTimeout(() => {
        if (state.mode === 'tutorial' && state.phase === 'play' && ally.state === 'rule1') {
          freeFromRule1(ally);
          const r1Alert = document.getElementById('rule1-alert');
          if (r1Alert) r1Alert.classList.add('hidden');
          updateRosterHUD();
        }
      }, 1800);
    }
    updateRosterHUD();
  }
}

export function sitDownPlayer(player) {
  if (player.rule1Partner) {
    const partner = player.rule1Partner;
    partner.state = 'standing';
    partner.rule1Partner = null;
    player.rule1Partner = null;
  }
  const surf = getStructureSurfaceY(player.pos.x, player.pos.z, !!player.onCanopy);
  const surfY = surf.y;
  player.onCanopy = surf.zone !== 'ground';
  player.pos.y = surfY;
  player.state = 'sitting';
  player.vel.set(0, 0, 0);
  player.vy = 0;
  player.isAirborne = false;
  player.airSource = null;
  player.isLaunching = false;
  player.launchBoostTimer = 0;
  player.leafUltTimer = 0;
  if (player.team === state.myTeam && player.role === state.controlledRole) {
    if (state.ultPreviewActive) cancelUltimatePreview(false);
    cancelPassCharge();
    setMobaMoveGoal(null);
    hideMobaMoveMarker();
  }

  if (player.carryingBall) {
    const ball = player.carryingBall;
    player.carryingBall = null;
    ball.state = 'ground';
    ball.carrier = null;
    ball.onCanopy = !!player.onCanopy;
    ball.pos.set(player.pos.x, surfY + 0.52, player.pos.z);
  }
}

export function freeFromRule1(player) {
  if (player.rule1Partner) {
    if (player.rule1Partner.state === 'rule1') {
      player.rule1Partner.state = 'standing';
    }
    player.rule1Partner.rule1Partner = null;
  }
  player.state = 'standing';
  player.rule1Partner = null;
}


// --- VÉRIFICATION DE FIN DE RONDE & FIN DE PARTIE ---
function checkRoundEndConditions() {
  if (state.phase !== 'play') return;
  if (state.mode === 'tutorial' || state.mode === 'practice') return;

  let allBallsScored = true;
  for (let i = 0; i < balls.length; i++) {
    if (balls[i].state !== 'scored') {
      allBallsScored = false;
      break;
    }
  }
  let allAlliesSitting = true;
  let allEnemiesSitting = true;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.state !== 'sitting') {
      if (p.team === 'ally') allAlliesSitting = false;
      else allEnemiesSitting = false;
    }
  }

  if (allBallsScored) {
    finishRound('Les 2 ballons ont été marqués dans les cerceaux !');
  } else if (
    allEnemiesSitting &&
    !balls.some((b) => b.state !== 'scored' && players.some((p) => p.team === 'ally' && p.state === 'standing' && p.color === b.color))
  ) {
    finishRound("Toute l'Équipe Violette est assise et aucun ballon restant ne peut être ramassé !");
  } else if (
    allAlliesSitting &&
    !balls.some((b) => b.state !== 'scored' && players.some((p) => p.team === 'enemy' && p.state === 'standing' && p.color === b.color))
  ) {
    finishRound("Toute l'Équipe Or est assise !");
  }
}

export function finishRound(reasonText, fromNetwork = false, networkBounties = []) {
  if (state.phase === 'round_end' || state.phase === 'game_over') return;
  if (state.prepInterval) {
    clearInterval(state.prepInterval);
    state.prepInterval = null;
  }
  state.phase = 'round_end';
  unlockPointer();

  let bountyNotes = Array.isArray(networkBounties) ? [...networkBounties] : [];

  if (!fromNetwork) {
    bountyNotes = [];
    // Évaluation des Bounties pour les 2 équipes
    const allyWonRound =
      state.roundAllyGoals > state.roundEnemyGoals ||
      (state.roundAllyGoals === state.roundEnemyGoals && state.roundAllyKills > state.roundEnemyKills);
    const enemyWonRound =
      state.roundEnemyGoals > state.roundAllyGoals ||
      (state.roundEnemyGoals === state.roundAllyGoals && state.roundEnemyKills > state.roundAllyKills);

    if (state.teams.ally.activeBountyPE) {
      if (allyWonRound) {
        state.allyPE += 3;
        bountyNotes.push('🎉 Pari Or +3 🪙 PO réussi !');
      }
      state.teams.ally.activeBountyPE = false;
    }
    if (state.teams.ally.activeBountyPV) {
      if (allyWonRound) {
        state.allyPV += 2;
        bountyNotes.push('🏆 Pari Or +2 pts réussi !');
      }
      state.teams.ally.activeBountyPV = false;
    }
    if (state.teams.enemy.activeBountyPE) {
      if (enemyWonRound) {
        state.enemyPE += 3;
        bountyNotes.push('🎉 Pari Violette +3 🪙 PO réussi !');
      }
      state.teams.enemy.activeBountyPE = false;
    }
    if (state.teams.enemy.activeBountyPV) {
      if (enemyWonRound) {
        state.enemyPV += 2;
        bountyNotes.push('🏆 Pari Violette +2 pts réussi !');
      }
      state.teams.enemy.activeBountyPV = false;
    }

    if (mp.enabled && mp.isHost) {
      sendNetMessage({
        type: 'MP_ROUND_END',
        mapId: state.mapId,
        reason: reasonText,
        allyPV: state.allyPV,
        allyPE: state.allyPE,
        enemyPV: state.enemyPV,
        enemyPE: state.enemyPE,
        roundAllyGoals: state.roundAllyGoals,
        roundEnemyGoals: state.roundEnemyGoals,
        roundAllyKills: state.roundAllyKills,
        roundEnemyKills: state.roundEnemyKills,
        teams: state.teams,
        bountyNotes
      });
    }
  }

  updateTopHUD();

  const titleEl = document.getElementById('end-modal-title');
  const summaryEl = document.getElementById('end-modal-summary');
  const detailsEl = document.getElementById('end-modal-details');
  const nextBtn = document.getElementById('btn-next-round');

  const allyWinsGame = state.allyPV >= 7 && state.allyPV - state.enemyPV >= 2;
  const enemyWinsGame = state.enemyPV >= 7 && state.enemyPV - state.allyPV >= 2;

  if (state.mode === 'tutorial') {
    titleEl.textContent = '🎉 Bravo ! Tutoriel terminé !';
    summaryEl.textContent = reasonText || 'Vous avez maîtrisé toutes les bases du Coilball.';
    detailsEl.textContent = 'Continuez librement en mode Pratique (« Un tour pour rien ») pour tester les pouvoirs, les arènes et les modes de jeu !';
    nextBtn.disabled = false;
    nextBtn.textContent = '🧪 Continuer en Mode Pratique';
    nextBtn.onclick = () => completeTutorialToPractice(false);
  } else if (state.mode === 'practice') {
    titleEl.textContent = '🧘 Fin du "Tour pour rien"';
    summaryEl.textContent = reasonText;
    detailsEl.textContent = 'Vous pouvez relancer une ronde de pratique ou revenir à l’accueil.';
    nextBtn.disabled = mp.enabled && !mp.isHost;
    nextBtn.textContent =
      mp.enabled && !mp.isHost
        ? "⏳ En attente de l'Hôte..."
        : '🔄 Nouvelle ronde de Pratique';
    nextBtn.onclick = () => {
      state.round += 1;
      setupRoundPrep();
    };
  } else if (allyWinsGame || enemyWinsGame) {
    state.phase = 'game_over';
    titleEl.textContent = allyWinsGame ? '🏆 VICTOIRE ÉQUIPE OR !' : '🏆 VICTOIRE ÉQUIPE VIOLETTE !';
    summaryEl.textContent = `Score final : Équipe Or ${state.allyPV} pts — Équipe Violette ${state.enemyPV} pts.`;
    detailsEl.textContent = bountyNotes.join(' • ');
    nextBtn.disabled = mp.enabled && !mp.isHost;
    nextBtn.textContent = mp.enabled && !mp.isHost ? "En attente de l'Hôte..." : '🔄 Rejouer une Partie';
    nextBtn.onclick = () => startNewMatch(mp.enabled ? 'multiplayer' : 'pedagogical');
  } else {
    titleEl.textContent = `Fin de la Ronde ${state.round}`;
    summaryEl.textContent = `${reasonText}`;
    const nextRoundUnlockNote =
      state.round + 1 === 2 && !state.vanillaMode
        ? '⚡ Les Ultimates Élémentaires ([R] + Clic Gauche) sont maintenant DÉBLOQUÉS pour la Ronde 2 !'
        : state.round + 1 === 3
        ? '🛒 Le Magasin ouvre ses portes à la prochaine ronde (Ronde 3) !'
        : '';
    const baseRoundNotes =
      bountyNotes.length > 0
        ? bountyNotes.join(' • ')
        : `Score : Équipe Or ${state.allyPV} pts (${state.allyPE} 🪙 PO) — Équipe Violette ${state.enemyPV} pts (${state.enemyPE} 🪙 PO)`;
    detailsEl.textContent = nextRoundUnlockNote
      ? `${nextRoundUnlockNote} • ${baseRoundNotes}`
      : baseRoundNotes;
    nextBtn.disabled = mp.enabled && !mp.isHost;
    nextBtn.textContent =
      mp.enabled && !mp.isHost
        ? `⏳ En attente de l'Hôte pour la Ronde ${state.round + 1}...`
        : `▶️ Passer à la Ronde ${state.round + 1}`;
    nextBtn.onclick = () => {
      state.round += 1;
      setupRoundPrep();
    };
  }

  if (allyWinsGame || enemyWinsGame) {
    ctx.api.playSfx?.((allyWinsGame && state.myTeam === 'ally') || (enemyWinsGame && state.myTeam === 'enemy') ? 'victory' : 'defeat');
  } else {
    ctx.api.playSfx?.('round_end');
  }
  showOnlyModal('round-end-modal');
}


function pushOutFromSegment(pos, ax, az, bx, bz, segRadius, entityRadius, bounceVel) {
  const vx = bx - ax;
  const vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 0.0001
    ? Math.max(0, Math.min(1, ((pos.x - ax) * vx + (pos.z - az) * vz) / lenSq))
    : 0;
  const cx = ax + t * vx;
  const cz = az + t * vz;
  const minDist = segRadius + entityRadius;
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const dSq = dx * dx + dz * dz;
  if (dSq < minDist * minDist) {
    const d = Math.sqrt(dSq) || 0.001;
    const nx = dx / d;
    const nz = dz / d;
    pos.x = cx + nx * minDist;
    pos.z = cz + nz * minDist;
    if (bounceVel) {
      const vn = bounceVel.x * nx + bounceVel.z * nz;
      if (vn < 0) {
        bounceVel.x -= 1.55 * vn * nx;
        bounceVel.z -= 1.55 * vn * nz;
      }
    }
  }
}

export function clampToField(pos, entityRadius = 0.72, bounceVel = null, opts = null) {
  const maxX = FIELD.width / 2 - entityRadius;
  const maxZ = FIELD.depth / 2 - entityRadius;

  if (pos.x < -maxX) {
    pos.x = -maxX;
    if (bounceVel && bounceVel.x < 0) bounceVel.x *= -0.55;
  } else if (pos.x > maxX) {
    pos.x = maxX;
    if (bounceVel && bounceVel.x > 0) bounceVel.x *= -0.55;
  }

  if (pos.z < -maxZ) {
    pos.z = -maxZ;
    if (bounceVel && bounceVel.z < 0) bounceVel.z *= -0.55;
  } else if (pos.z > maxZ) {
    pos.z = maxZ;
    if (bounceVel && bounceVel.z > 0) bounceVel.z *= -0.55;
  }

  // Réseau canopée : rambardes aériennes si onCanopy, sinon obstacles sol + troncs réels + soubassements bas
  const onCanopy = !!(opts && opts.onCanopy);
  const isAir = !!(opts && opts.isAirborne);
  const isJumpAir = isAir && !!(opts && opts.airSource === 'jump');
  const skipGroundLandmarks = isAir && !isJumpAir;
  const yRef = typeof pos.y === 'number' ? pos.y : 0;

  if (!onCanopy) {
    pushOutFromLeafWalls(pos, entityRadius, bounceVel);

    const groundY = getTerrainY(pos.x, pos.z);
    for (let w = 0; w < activeToolWalls.length; w++) {
      const tw = activeToolWalls[w];
      const wallBaseY = tw.cy || 0;
      if (Math.abs(yRef - wallBaseY) > 2.3) continue;
      if (isAir && yRef >= Math.max(groundY, wallBaseY) + 1.35) continue;
      pushOutFromSegment(pos, tw.ax, tw.az, tw.bx, tw.bz, tw.thickness || 0.36, entityRadius, bounceVel);
    }

    for (let i = 0; i < JUNGLE_WALLS.length; i++) {
      const w = JUNGLE_WALLS[i];
      if (yRef >= (w.height || 3.85)) continue;
      pushOutFromSegment(pos, w.ax, w.az, w.bx, w.bz, w.radius, entityRadius, bounceVel);
    }

    for (let i = 0; i < JUNGLE_OBSTACLES.length; i++) {
      const obs = JUNGLE_OBSTACLES[i];
      const obsMaxY = obs.kind === 'gazebo' ? 999 : obs.kind === 'waterfall' ? 25.0 : 3.8;
      if (yRef >= obsMaxY) continue;
      const minDist = obs.radius + entityRadius;
      const dx = pos.x - obs.x;
      const dz = pos.z - obs.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        const nx = dist > 0.0001 ? dx / dist : 1;
        const nz = dist > 0.0001 ? dz / dist : 0;
        pos.x = obs.x + nx * minDist;
        pos.z = obs.z + nz * minDist;
        if (bounceVel) {
          const vn = bounceVel.x * nx + bounceVel.z * nz;
          if (vn < 0) {
            bounceVel.x -= 1.55 * vn * nx;
            bounceVel.z -= 1.55 * vn * nz;
          }
        }
      }
    }

    if (state.mapId === 'saint-viateur') {
      const sv = PARK_LANDMARKS.saintViateur;
      pushOutAABB(pos, sv.chaletMinX, sv.chaletMaxX, sv.chaletMinZ, sv.chaletMaxZ, entityRadius, bounceVel);

      const onSvBridge =
        !skipGroundLandmarks &&
        Math.abs(pos.x) >= sv.bridgeInnerX &&
        Math.abs(pos.x) <= sv.bridgeOuterX &&
        Math.abs(pos.z) <= sv.bridgeHalfZ;
      if (onSvBridge) {
        const maxBz = sv.bridgeHalfZ - entityRadius;
        if (pos.z < -maxBz) {
          pos.z = -maxBz;
          if (bounceVel && bounceVel.z < 0) bounceVel.z *= -0.55;
        } else if (pos.z > maxBz) {
          pos.z = maxBz;
          if (bounceVel && bounceVel.z > 0) bounceVel.z *= -0.55;
        }
      } else if (!skipGroundLandmarks) {
        // Parapets des deux ponts Est-Ouest
        [-1, 1].forEach((sx) => {
          const bx0 = sx < 0 ? -sv.bridgeOuterX : sv.bridgeInnerX;
          const bx1 = sx < 0 ? -sv.bridgeInnerX : sv.bridgeOuterX;
          pushOutAABB(pos, bx0, bx1, -sv.bridgeParapetOuterZ, -sv.bridgeHalfZ, entityRadius, bounceVel);
          pushOutAABB(pos, bx0, bx1, sv.bridgeHalfZ, sv.bridgeParapetOuterZ, entityRadius, bounceVel);
        });

        // Anneau d'eau entourant l'île centrale : repousse vers l'île ou la berge la plus proche
        const inRx = Math.max(1, sv.islandRx - entityRadius);
        const inRz = Math.max(1, sv.islandRz - entityRadius);
        const outRx = sv.pondRx + entityRadius;
        const outRz = sv.pondRz + entityRadius;
        const dIn = Math.hypot(pos.x / inRx, pos.z / inRz);
        const dOut = Math.hypot(pos.x / outRx, pos.z / outRz);
        if (dIn > 1.0 && dOut < 1.0) {
          const ix = pos.x / dIn;
          const iz = pos.z / dIn;
          const ox = pos.x / dOut;
          const oz = pos.z / dOut;
          const distIn = Math.hypot(pos.x - ix, pos.z - iz);
          const distOut = Math.hypot(pos.x - ox, pos.z - oz);
          const useInner = distIn <= distOut;
          const tx = useInner ? ix : ox;
          const tz = useInner ? iz : oz;
          const nx = tx - pos.x;
          const nz = tz - pos.z;
          const nLen = Math.hypot(nx, nz) || 1;
          pos.x = tx;
          pos.z = tz;
          if (bounceVel) {
            const ux = nx / nLen;
            const uz = nz / nLen;
            const vn = bounceVel.x * ux + bounceVel.z * uz;
            if (vn < 0) {
              bounceVel.x -= 1.55 * vn * ux;
              bounceVel.z -= 1.55 * vn * uz;
            }
          }
        }
      }
    } else if (state.mapId === 'lafontaine') {
      const lf = PARK_LANDMARKS.lafontaine;
      const onBridge = Math.abs(pos.x) <= lf.bridgeHalfX && Math.abs(pos.z) <= lf.bridgeHalfZ;
      if (onBridge && !skipGroundLandmarks) {
        const maxBridgeX = lf.bridgeHalfX - entityRadius;
        if (pos.x < -maxBridgeX) {
          pos.x = -maxBridgeX;
          if (bounceVel && bounceVel.x < 0) bounceVel.x *= -0.55;
        } else if (pos.x > maxBridgeX) {
          pos.x = maxBridgeX;
          if (bounceVel && bounceVel.x > 0) bounceVel.x *= -0.55;
        }
      } else if (!skipGroundLandmarks) {
        pushOutAABB(pos, -lf.bridgeParapetOuterX, -lf.bridgeHalfX, -lf.bridgeHalfZ, lf.bridgeHalfZ, entityRadius, bounceVel);
        pushOutAABB(pos, lf.bridgeHalfX, lf.bridgeParapetOuterX, -lf.bridgeHalfZ, lf.bridgeHalfZ, entityRadius, bounceVel);
        pushOutEllipse(pos, 0, 0, lf.pondRx, lf.pondRz, entityRadius, bounceVel);
      }
    } else if (state.mapId === 'mont-royal' && !skipGroundLandmarks) {
      const mr = PARK_LANDMARKS.montRoyal;
      const minDist = mr.crossRadius + entityRadius;
      const dx = pos.x - mr.crossX;
      const dz = pos.z - mr.crossZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        const nx = dist > 0.0001 ? dx / dist : 1;
        const nz = dist > 0.0001 ? dz / dist : 0;
        pos.x = mr.crossX + nx * minDist;
        pos.z = mr.crossZ + nz * minDist;
        if (bounceVel) {
          const vn = bounceVel.x * nx + bounceVel.z * nz;
          if (vn < 0) {
            bounceVel.x -= 1.55 * vn * nx;
            bounceVel.z -= 1.55 * vn * nz;
          }
        }
      }
      pushOutEllipse(pos, mr.lakeX, mr.lakeZ, mr.lakeRx, mr.lakeRz, entityRadius, bounceVel);
    }
  }

  if (onCanopy && CANOPY_SPEC.hasCanopy) {
    if (!bounceVel && !skipGroundLandmarks) {
      enforceCanopyRails(pos, Math.min(entityRadius, 0.56));
    }
    return;
  }

  if (!CANOPY_SPEC.hasCanopy) return;

  // Troncs des grands arbres (solides au sol et sous la canopée ; dégagés au-dessus du deck ou en Sky-Launch)
  if (yRef < CANOPY_SPEC.deckY - 0.5) {
    for (let i = 0; i < CANOPY_SPEC.trunks.length; i++) {
      const tr = CANOPY_SPEC.trunks[i];
      const minDist = tr.radius + entityRadius;
      const dx = pos.x - tr.x;
      const dz = pos.z - tr.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        const nx = dist > 0.0001 ? dx / dist : 1;
        const nz = dist > 0.0001 ? dz / dist : 0;
        pos.x = tr.x + nx * minDist;
        pos.z = tr.z + nz * minDist;
        if (bounceVel) {
          const vn = bounceVel.x * nx + bounceVel.z * nz;
          if (vn < 0) {
            bounceVel.x -= 1.55 * vn * nx;
            bounceVel.z -= 1.55 * vn * nz;
          }
        }
      }
    }
  }

  // Soubassements de l'approche basse des rampes + culées pleines sous la sortie basse des tremplins Sky-Launch
  if (!skipGroundLandmarks && yRef < CANOPY_SPEC.deckY * 0.4) {
    pushOutAABB(
      pos,
      -CANOPY_SPEC.rampSkirtOuterX,
      -CANOPY_SPEC.rampSkirtInnerX,
      -CANOPY_SPEC.ascentHalfZ,
      CANOPY_SPEC.ascentHalfZ,
      entityRadius,
      bounceVel
    );
    pushOutAABB(
      pos,
      CANOPY_SPEC.rampSkirtInnerX,
      CANOPY_SPEC.rampSkirtOuterX,
      -CANOPY_SPEC.ascentHalfZ,
      CANOPY_SPEC.ascentHalfZ,
      entityRadius,
      bounceVel
    );
  }
  if (!skipGroundLandmarks && yRef < CANOPY_SPEC.launchLipY) {
    pushOutAABB(
      pos,
      -1.9,
      1.9,
      -CANOPY_SPEC.launchPierOuterZ,
      -CANOPY_SPEC.launchPierInnerZ,
      entityRadius,
      bounceVel
    );
    pushOutAABB(
      pos,
      -1.9,
      1.9,
      CANOPY_SPEC.launchPierInnerZ,
      CANOPY_SPEC.launchPierOuterZ,
      entityRadius,
      bounceVel
    );
  }
}

