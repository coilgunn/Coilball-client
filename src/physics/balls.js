import { COLORS, TUTORIAL_STEPS, FIELD, state, mp, ctx } from '../state.js';
import { players, balls, spawnParticles } from '../render3d.js';
import {
  CANOPY_SPEC,
  getTerrainY,
  getCanopySurfaceY,
  getStructureSurfaceY,
  getRiftRiverCurrent,
} from '../world.js';
import { cancelUltimatePreview, updateUltHudWidget } from '../ultimates.js';
import { broadcastToast } from '../net.js';
import {
  triggerGamepadRumble,
  showToast,
  updateTopHUD,
  updateRosterHUD,
} from '../ui.js';
import { markTutorialCheck } from '../modes.js';
import { THREE, updateBallGroupVisibility } from './shared.js';
import { clampToField } from './collision.js';
import { broadcastWorldState } from './network_sync.js';

function stepThrownBall(ball, dt) {
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
  clampToField(ball.pos, 0.55, ball.vel, { onCanopy: false, isAirborne: ball.pos.y >= CANOPY_SPEC.launchLipY });
  const canopySurf = getCanopySurfaceY(ball.pos.x, ball.pos.z);
  const landsOnCanopy =
    !!canopySurf &&
    ((ball.onCanopy && ball.pos.y >= canopySurf.y - 0.45) ||
      (prevBallY >= canopySurf.y + 0.35 && ball.vel.y <= 0));
  if (!landsOnCanopy && ball.onCanopy) ball.onCanopy = false;
  const groundY = (landsOnCanopy ? canopySurf.y : getTerrainY(ball.pos.x, ball.pos.z)) + 0.52;
  if (ball.pos.y > groundY) return;

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

function notifyTutorialBallPickup(p) {
  if (state.mode !== 'tutorial' || p.team !== 'ally') return;
  if (state.tutorialStep === TUTORIAL_STEPS.GOAL) {
    markTutorialCheck('pickedBall');
    showToast(
      `🎓 <strong>Étape 2/8 :</strong> Bravo ! Apportez maintenant ce ballon jusqu'au <strong>cerceau adverse (à droite)</strong> pour marquer +1 pt !`,
      3500
    );
    return;
  }
  if (state.tutorialStep !== TUTORIAL_STEPS.PASS) return;
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

function tryPickupBall(ball) {
  for (const p of players) {
    if (p.tutorialHidden || p.state !== 'standing' || p.carryingBall) continue;
    if (ball.state === 'thrown' && ball.thrownById === p.id && (ball.passIgnoreTimer || 0) > 0) continue;
    const dist = Math.hypot(p.pos.x - ball.pos.x, p.pos.z - ball.pos.z);
    if (dist >= 1.35 || Math.abs(p.pos.y + 0.6 - ball.pos.y) >= 1.85) continue;
    const canReceivePass = ball.state === 'thrown' && ball.thrownByTeam === p.team;
    if (p.color !== ball.color && !canReceivePass) continue;

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
    notifyTutorialBallPickup(p);
    return;
  }
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
    if (ball.mesh?.group) ball.mesh.group.position.copy(ball.pos);
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
    if (ball.mesh?.group) ball.mesh.group.position.copy(ball.pos);
    spawnParticles(ball.pos, COLORS[ball.color].hex, 14);
    showToast(
      state.mobileMode
        ? '🎯 <strong>Ballon replacé !</strong> Reprenez-le et maintenez <strong>⚽ Passe</strong> pour viser <strong>💧 C</strong> !'
        : '🎯 <strong>Ballon replacé !</strong> Reprenez-le et maintenez <strong>[E]</strong> pour passer à <strong>💧 C</strong> !',
      3200
    );
  }, 800);
}

function scoreGoalForTeam(ball, team, goalX, goalZ) {
  if (ball.carrier) ball.carrier.carryingBall = null;
  ball.carrier = null;
  ball.state = 'scored';
  ball.pos.set(goalX + (ball.id === 0 ? -0.6 : 0.6), 0.52, goalZ);
  if (team === 'ally') {
    state.allyPV += 1;
    state.roundAllyGoals += 1;
  } else {
    state.enemyPV += 1;
    state.roundEnemyGoals += 1;
  }
  spawnParticles(ball.pos, team === 'ally' ? 0x38bdf8 : 0xc084fc, 30);
  ctx.api.playSfx?.(state.myTeam === team ? 'goal_ally' : 'goal_enemy');
  triggerGamepadRumble(320, 0.9, 0.7);
  const label = team === 'ally' ? "l'Équipe Or" : "l'Équipe Violette";
  broadcastToast(`🥅 <strong>BUT ! +1 Point (pt) pour ${label} !</strong>`, 4000);
  updateTopHUD();
  updateRosterHUD();
  if (state.mode === 'practice') {
    schedulePracticeBallRespawn(ball);
  } else if (team === 'ally' && state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.GOAL) {
    markTutorialCheck('pickedBall');
    markTutorialCheck('scoredGoal');
  } else if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.PASS) {
    scheduleTutorialPassBallRespawn(ball);
  }
}

function checkBallGoal(ball) {
  if (ball.state === 'scored') return;
  const enemyGoalZ = FIELD.enemyGoalZ || 0;
  const allyGoalZ = FIELD.allyGoalZ || 0;

  const canTeamScore = (team) =>
    (ball.state === 'carried' && ball.carrier && ball.carrier.team === team) ||
    (ball.state === 'thrown' && ball.thrownByTeam === team);

  const distToEnemyGoal = Math.hypot(ball.pos.x - FIELD.enemyGoalX, ball.pos.z - enemyGoalZ);
  if (distToEnemyGoal < FIELD.goalRadius && canTeamScore('ally')) {
    scoreGoalForTeam(ball, 'ally', FIELD.enemyGoalX, enemyGoalZ);
    return;
  }

  const distToAllyGoal = Math.hypot(ball.pos.x - FIELD.allyGoalX, ball.pos.z - allyGoalZ);
  if (distToAllyGoal < FIELD.goalRadius && canTeamScore('enemy')) {
    scoreGoalForTeam(ball, 'enemy', FIELD.allyGoalX, allyGoalZ);
  }
}

export function updateBalls(dt) {
  balls.forEach((ball) => {
    if (ball.tutorialHidden || ball.state === 'scored') return;
    if (ball.passIgnoreTimer > 0) ball.passIgnoreTimer = Math.max(0, ball.passIgnoreTimer - dt);

    if (ball.state === 'thrown') {
      stepThrownBall(ball, dt);
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
      tryPickupBall(ball);
    }
    if (ball.state === 'carried' && ball.carrier) {
      const c = ball.carrier;
      ball.pos.set(c.pos.x + Math.sin(c.facingAngle) * 0.75, c.pos.y + 1.25, c.pos.z + Math.cos(c.facingAngle) * 0.75);
    }

    checkBallGoal(ball);
    ball.mesh.group.position.copy(ball.pos);
    updateBallGroupVisibility(ball);
  });
}
