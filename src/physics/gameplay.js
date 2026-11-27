import { state, mp, ctx, lerpAngle } from '../state.js';
import { players, balls, getPlayer } from '../render3d.js';
import { CANOPY_SPEC } from '../world.js';
import { updateUltimates } from '../ultimates.js';
import { sendNetMessage } from '../net.js';
import {
  isMenuOpen,
  syncPlayerMeshes,
  updateMobaMoveMarkerAnim,
} from '../ui.js';
import { updateAIPlayer, updateSittingAI } from '../ai.js';
import {
  THREE,
  activeToolBeacons,
  activeToolWalls,
  activeToolPads,
  activeSlidePatches,
  getLocalMoveVector,
  updateBallGroupVisibility,
} from './shared.js';
import { clampToField } from './collision.js';
import {
  setMobaMoveGoal,
  applyHumanMovement,
  stepPlayerCooldowns,
  stepMobaPathSteering,
} from './movement.js';
import {
  beginPassCharge,
  updatePassCharge,
  releasePassCharge,
  cancelPassCharge,
  handleRemoteBallPass,
  executeBallPassOrThrow,
} from './pass.js';
import {
  getPlayerDashParams,
  executePlayerDash,
  triggerBoomerangReturn,
  triggerJump,
  handleRemotePlayerJump,
} from './dash.js';
import {
  broadcastWorldState,
  findRemoteInputForPlayer,
  applyRemotePlayerSnapshot,
} from './network_sync.js';
import { updateBackVisibility } from './vision.js';
import { updateBalls } from './balls.js';
import { checkPlayerCollisions } from './contact.js';
import { checkRoundEndConditions } from './round_end.js';

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
  ctx.api.getPlayerDashParams = getPlayerDashParams;
  ctx.api.executePlayerDash = executePlayerDash;
  ctx.api.triggerBoomerangReturn = triggerBoomerangReturn;
  ctx.api.executeBallPassOrThrow = executeBallPassOrThrow;
}

function stepClientWorldInterpolation(myPlayer, moveVec, dt, isAerialLocal) {
  if (myPlayer && myPlayer.state === 'standing') {
    applyHumanMovement(myPlayer, moveVec.moveForward, moveVec.moveRight, moveVec.moveYaw, dt, isAerialLocal);
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
      b.pos.set(c.pos.x + Math.sin(c.facingAngle) * 0.75, c.pos.y + 1.25, c.pos.z + Math.cos(c.facingAngle) * 0.75);
    } else if (b.state === 'ground' || b.state === 'thrown') {
      if (b.state === 'thrown') {
        b.targetPos.addScaledVector(b.vel, dt);
        clampToField(b.targetPos, 0.55, null, { onCanopy: false, isAirborne: b.targetPos.y >= CANOPY_SPEC.launchLipY });
      }
      b.pos.lerp(b.targetPos, ballSmooth);
    }
    b.mesh.group.position.copy(b.pos);
    updateBallGroupVisibility(b);
  });

  mp.syncAccumulator += dt;
  if (mp.syncAccumulator >= 0.03) {
    mp.syncAccumulator = 0;
    const seenEnemyRoles = players.filter((ep) => ep.team !== state.myTeam && ep.backRevealed).map((ep) => ep.role);
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
      moveForward: moveVec.moveForward,
      moveRight: moveVec.moveRight,
      camYaw: state.camYaw,
      rev: seenEnemyRoles,
      actionTriggered: false,
    });
  }

  updateUltimates(dt);
  updateBackVisibility();
  syncPlayerMeshes(dt);
  balls.forEach(updateBallGroupVisibility);
}

function stepHostPlayer(p, moveVec, dt, now, isAerialLocal) {
  if (p.tutorialHidden) return;
  if (p.state === 'sitting') {
    p.mesh.bodyGroup.position.y = THREE.MathUtils.lerp(p.mesh.bodyGroup.position.y, -0.55, 8 * dt);
    p.mesh.leftLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.leftLeg.rotation.x, -Math.PI / 2, 8 * dt);
    p.mesh.rightLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.rightLeg.rotation.x, -Math.PI / 2, 8 * dt);
    const isHumanSitting = (p.team === state.myTeam && p.role === state.controlledRole) || !!findRemoteInputForPlayer(p, now);
    if (!isHumanSitting) updateSittingAI(p, dt);
    return;
  }

  p.mesh.bodyGroup.position.y = THREE.MathUtils.lerp(p.mesh.bodyGroup.position.y, 0, 10 * dt);
  if (p.state === 'rule1') {
    p.vel.set(0, 0, 0);
    if (p.rule1Partner) p.facingAngle = Math.atan2(p.rule1Partner.pos.x - p.pos.x, p.rule1Partner.pos.z - p.pos.z);
    return;
  }
  if (p.team === state.myTeam && p.role === state.controlledRole) {
    applyHumanMovement(p, moveVec.moveForward, moveVec.moveRight, moveVec.moveYaw, dt, isAerialLocal);
    return;
  }
  const remote = findRemoteInputForPlayer(p, now);
  if (remote) {
    applyRemotePlayerSnapshot(p, remote, dt, now);
    return;
  }
  updateAIPlayer(p, dt);
}

const _frameMoveVec = { moveForward: 0, moveRight: 0, moveYaw: 0 };

export function updateGameplay(dt) {
  if (state.phase !== 'play') return;
  if (!mp.enabled && isMenuOpen()) return;

  state.roundPlayTime = (state.roundPlayTime || 0) + dt;
  players.forEach((p) => stepPlayerCooldowns(p, dt));
  updatePassCharge(dt);

  const rawMove = isMenuOpen() ? { moveForward: 0, moveRight: 0 } : getLocalMoveVector();
  let moveForward = rawMove.moveForward;
  let moveRight = rawMove.moveRight;
  let moveYaw = state.camYaw;
  const isAerialLocal = state.cameraMode === 'aerial' && !isMenuOpen();
  const myControlled = getPlayer(state.myTeam, state.controlledRole);

  if (isAerialLocal) {
    moveYaw = 0;
    const steered = stepMobaPathSteering(myControlled, moveForward, moveRight, dt);
    moveForward = steered.moveForward;
    moveRight = steered.moveRight;
  }

  _frameMoveVec.moveForward = moveForward;
  _frameMoveVec.moveRight = moveRight;
  _frameMoveVec.moveYaw = moveYaw;

  updateMobaMoveMarkerAnim(dt);

  if (mp.enabled && !mp.isHost) {
    stepClientWorldInterpolation(myControlled, _frameMoveVec, dt, isAerialLocal);
    return;
  }

  const now = performance.now();
  players.forEach((p) => stepHostPlayer(p, _frameMoveVec, dt, now, isAerialLocal));

  updateUltimates(dt);
  updateBackVisibility();
  updateBalls(dt);
  checkPlayerCollisions();
  syncPlayerMeshes(dt);
  balls.forEach(updateBallGroupVisibility);
  checkRoundEndConditions();

  if (mp.enabled && mp.isHost) {
    mp.syncAccumulator += dt;
    if (mp.syncAccumulator >= 0.032) {
      mp.syncAccumulator = 0;
      broadcastWorldState();
    }
  }
}
