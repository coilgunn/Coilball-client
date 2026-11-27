import { state } from '../state.js';
import {
  applyMeshStealthAlpha,
  balls,
  players,
  spawnParticles,
  syncPlayerPowerVisuals
} from '../render3d.js';
import {
  VISION_SPEC,
  getStructureSurfaceY,
  hasAllyVisionNear,
  isPointInJungleBush
} from '../world.js';
import { THREE } from './shared.js';

function updatePlayerStealthVisibility(p, isMyTeam, inBush, dt) {
  if (!isMyTeam) {
    const hiddenEnemy = inBush && !hasAllyVisionNear(p.pos, VISION_SPEC.bushSpotRange, state.myTeam);
    if (hiddenEnemy) {
      p.mesh.root.visible = false;
      if (p.mesh.leafAuraGroup) p.mesh.leafAuraGroup.visible = false;
      return false;
    }
    p.mesh.root.visible = true;
    applyMeshStealthAlpha(p.mesh, 1.0);
    return true;
  }
  p.mesh.root.visible = true;
  const targetAlpha = inBush ? 0.45 : 1.0;
  const curAlpha = typeof p.mesh.stealthAlpha === 'number' ? p.mesh.stealthAlpha : 1.0;
  const lerped = THREE.MathUtils.lerp(curAlpha, targetAlpha, Math.min(1, 12 * (dt || 0.016)));
  const nextAlpha = Math.abs(lerped - targetAlpha) < 0.01 ? targetAlpha : lerped;
  applyMeshStealthAlpha(p.mesh, nextAlpha);
  return true;
}

function updateHairBouncersSlide(p, dt) {
  if (!p.mesh.hairBouncers) return;
  for (let i = 0; i < p.mesh.hairBouncers.length; i++) {
    const hb = p.mesh.hairBouncers[i];
    hb.pivot.rotation.z = THREE.MathUtils.lerp(hb.pivot.rotation.z, hb.baseRotZ + 0.28 * hb.dir, 14 * dt);
    hb.pivot.rotation.x = THREE.MathUtils.lerp(hb.pivot.rotation.x, -0.35, 14 * dt);
  }
}

function updateHairBouncersRunOrIdle(p, running, nowSec, dt) {
  if (!p.mesh.hairBouncers) return;
  for (let i = 0; i < p.mesh.hairBouncers.length; i++) {
    const hb = p.mesh.hairBouncers[i];
    if (running) {
      hb.pivot.rotation.z = hb.baseRotZ + Math.sin(p.animTime * 2) * 0.18 * hb.dir;
      hb.pivot.rotation.x = -0.15 - Math.abs(Math.cos(p.animTime)) * 0.14;
    } else {
      hb.pivot.rotation.z = THREE.MathUtils.lerp(
        hb.pivot.rotation.z,
        hb.baseRotZ + Math.sin(nowSec * 2.2) * 0.04 * hb.dir,
        8 * dt
      );
      hb.pivot.rotation.x = THREE.MathUtils.lerp(hb.pivot.rotation.x, 0, 8 * dt);
    }
  }
}

function updatePlayerLimbPose(p, isSlidePose, nowSec, dt) {
  if (p.state === 'sitting') {
    p.mesh.bodyGroup.position.y = THREE.MathUtils.lerp(p.mesh.bodyGroup.position.y, -0.52, 8 * dt);
    p.mesh.leftLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.leftLeg.rotation.x, -Math.PI / 2, 8 * dt);
    p.mesh.rightLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.rightLeg.rotation.x, -Math.PI / 2, 8 * dt);
    p.mesh.leftArm.rotation.x = THREE.MathUtils.lerp(p.mesh.leftArm.rotation.x, 0.25, 8 * dt);
    p.mesh.rightArm.rotation.x = THREE.MathUtils.lerp(p.mesh.rightArm.rotation.x, 0.25, 8 * dt);
    p.mesh.leftArm.rotation.z = THREE.MathUtils.lerp(p.mesh.leftArm.rotation.z, 0, 10 * dt);
    p.mesh.rightArm.rotation.z = THREE.MathUtils.lerp(p.mesh.rightArm.rotation.z, 0, 10 * dt);
  } else if (isSlidePose) {
    p.mesh.bodyGroup.position.y = THREE.MathUtils.lerp(p.mesh.bodyGroup.position.y, -0.36, 18 * dt);
    p.mesh.leftLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.leftLeg.rotation.x, -1.22, 20 * dt);
    p.mesh.rightLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.rightLeg.rotation.x, 0.78, 20 * dt);
    p.mesh.leftArm.rotation.x = THREE.MathUtils.lerp(p.mesh.leftArm.rotation.x, 0.52, 18 * dt);
    p.mesh.rightArm.rotation.x = THREE.MathUtils.lerp(p.mesh.rightArm.rotation.x, -0.45, 18 * dt);
    p.mesh.leftArm.rotation.z = THREE.MathUtils.lerp(p.mesh.leftArm.rotation.z, -0.62, 18 * dt);
    p.mesh.rightArm.rotation.z = THREE.MathUtils.lerp(p.mesh.rightArm.rotation.z, 0.58, 18 * dt);
    updateHairBouncersSlide(p, dt);
    if (Math.random() < 0.85) {
      spawnParticles(p.pos, Math.random() < 0.55 ? 0xe0f2fe : 0x7dd3fc, 1);
    }
  } else {
    const speed = p.vel.length();
    p.mesh.leftArm.rotation.z = THREE.MathUtils.lerp(p.mesh.leftArm.rotation.z, 0, 12 * dt);
    p.mesh.rightArm.rotation.z = THREE.MathUtils.lerp(p.mesh.rightArm.rotation.z, 0, 12 * dt);
    const running = p.state === 'standing' && speed > 0.2;
    if (running) {
      p.animTime += dt * speed * 1.85;
      p.mesh.bodyGroup.position.y = Math.abs(Math.sin(p.animTime * 2)) * 0.09;
      p.mesh.leftLeg.rotation.x = Math.sin(p.animTime) * 0.65;
      p.mesh.rightLeg.rotation.x = -Math.sin(p.animTime) * 0.65;
      p.mesh.leftArm.rotation.x = -Math.sin(p.animTime) * 0.55;
      p.mesh.rightArm.rotation.x = Math.sin(p.animTime) * 0.55;
    } else {
      p.mesh.bodyGroup.position.y = THREE.MathUtils.lerp(
        p.mesh.bodyGroup.position.y,
        Math.sin(nowSec * 3 + p.animTime) * 0.025,
        10 * dt
      );
      p.mesh.leftLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.leftLeg.rotation.x, 0, 10 * dt);
      p.mesh.rightLeg.rotation.x = THREE.MathUtils.lerp(p.mesh.rightLeg.rotation.x, 0, 10 * dt);
      p.mesh.leftArm.rotation.x = THREE.MathUtils.lerp(p.mesh.leftArm.rotation.x, 0, 10 * dt);
      p.mesh.rightArm.rotation.x = THREE.MathUtils.lerp(p.mesh.rightArm.rotation.x, 0, 10 * dt);
    }
    updateHairBouncersRunOrIdle(p, running, nowSec, dt);
  }
  if (p.carryingBall) {
    p.mesh.leftArm.rotation.x = -Math.PI / 2.8;
    p.mesh.rightArm.rotation.x = -Math.PI / 2.8;
  }
}

function updatePlayerBodyTiltAndTrail(p, isSlidePose, dt) {
  const isDashing =
    (p.dashTimer > 0 || p.isAirborne || p.isLaunching || Math.hypot(p.vel.x, p.vel.z) > 14) &&
    p.state === 'standing' &&
    (!p.carryingBall || p.isAirborne || p.isLaunching);
  if (isSlidePose) {
    p.mesh.bodyGroup.rotation.x = THREE.MathUtils.lerp(p.mesh.bodyGroup.rotation.x, -0.48, 18 * dt);
    p.mesh.bodyGroup.rotation.z = THREE.MathUtils.lerp(p.mesh.bodyGroup.rotation.z, -0.1, 14 * dt);
  } else if (isDashing) {
    p.mesh.bodyGroup.rotation.x = THREE.MathUtils.lerp(
      p.mesh.bodyGroup.rotation.x,
      p.isAirborne ? 0.45 : 0.38,
      20 * dt
    );
    p.mesh.bodyGroup.rotation.z = THREE.MathUtils.lerp(p.mesh.bodyGroup.rotation.z, 0, 14 * dt);
    const trailChance = p.dashTimer > 0 && p.dashIsSuper ? 0.75 : 0.45;
    if (Math.random() < trailChance) {
      const trailHex = p.isAirborne || p.isLaunching || p.dashIsSuper ? 0x38bdf8 : 0xffffff;
      spawnParticles(p.pos, trailHex, 1);
    }
  } else {
    p.mesh.bodyGroup.rotation.x = THREE.MathUtils.lerp(p.mesh.bodyGroup.rotation.x, 0, 14 * dt);
    p.mesh.bodyGroup.rotation.z = THREE.MathUtils.lerp(p.mesh.bodyGroup.rotation.z, 0, 14 * dt);
  }
}

function updatePlayerRingAndAura(p, isMyTeam, inBush, groundUnderY, nowSec, dt) {
  if (p.mesh.leafAuraGroup) {
    if (p.leafUltTimer > 0 && p.state === 'standing' && !p.carryingBall) {
      p.mesh.leafAuraGroup.visible = true;
      p.mesh.leafAuraGroup.position.y = groundUnderY + 0.055 - p.pos.y;
      p.mesh.leafAuraGroup.rotation.y += dt * 5.0;
      p.mesh.leafAuraGroup.scale.setScalar(1.0 + 0.09 * Math.sin(nowSec * 15));
      p.mesh.leafAuraMat.color.setHex(p.leafUltTimer <= 0.6 ? 0xfacc15 : 0x4ade80);
      p.mesh.leafAuraMat.opacity = 0.82 * Math.min(1, p.leafUltTimer / 0.35 + 0.25);
      if (Math.random() < 0.4) spawnParticles(p.pos, 0x4ade80, 1);
    } else {
      p.mesh.leafAuraGroup.visible = false;
    }
  }
  const stealthRingMult = isMyTeam && inBush ? 0.68 : 1.0;
  if (isMyTeam && p.role === state.controlledRole) {
    p.mesh.ringMat.color.setHex(0x38bdf8);
    p.mesh.ringMat.opacity = 0.95 * stealthRingMult;
    p.mesh.floorRing.scale.setScalar(1.18);
  } else if (p.state === 'rule1') {
    p.mesh.ringMat.color.setHex(0xf97316);
    p.mesh.ringMat.opacity = 0.9;
    p.mesh.floorRing.scale.setScalar(1.1);
  } else {
    p.mesh.ringMat.color.setHex(p.team === 'ally' ? 0xfef08a : 0xc084fc);
    p.mesh.ringMat.opacity = (p.state === 'sitting' ? 0.25 : 0.55) * stealthRingMult;
    p.mesh.floorRing.scale.setScalar(1.0);
  }
}

function syncSinglePlayerMesh(p, nowSec, dt) {
  if (p.tutorialHidden) {
    p.mesh.root.visible = false;
    if (p.mesh.leafAuraGroup) p.mesh.leafAuraGroup.visible = false;
    return;
  }
  const isMyTeam = p.team === state.myTeam;
  const inBush = p.state === 'standing' && !!isPointInJungleBush(p.pos);
  if (!updatePlayerStealthVisibility(p, isMyTeam, inBush, dt)) return;

  p.mesh.root.position.copy(p.pos);
  p.mesh.bodyGroup.rotation.y = p.facingAngle;
  p.mesh.floorRing.rotation.y = p.facingAngle;
  const groundUnderY = getStructureSurfaceY(p.pos.x, p.pos.z, !!p.onCanopy).y;
  p.mesh.floorRing.position.y = groundUnderY + 0.03 - p.pos.y;

  const isSlidePose =
    p.state === 'standing' &&
    !p.isAirborne &&
    !p.isLaunching &&
    ((p.dashTimer > 0 && p.dashKind === 'slide' && !p.carryingBall) ||
      (p.slideGlideTimer > 0 && !p.carryingBall) ||
      p.onSlidePatch ||
      p.isSlidingNet);

  updatePlayerLimbPose(p, isSlidePose, nowSec, dt);
  updatePlayerBodyTiltAndTrail(p, isSlidePose, dt);
  updatePlayerRingAndAura(p, isMyTeam, inBush, groundUnderY, nowSec, dt);
  syncPlayerPowerVisuals(p, nowSec);
}

export function syncPlayerMeshes(dt) {
  const nowSec = performance.now() * 0.001;
  for (let i = 0; i < players.length; i++) {
    syncSinglePlayerMesh(players[i], nowSec, dt);
  }
  for (let bi = 0; bi < balls.length; bi++) {
    const b = balls[bi];
    if (!b || !b.mesh || !b.mesh.group) continue;
    if (b.state === 'carried' && b.carrier && b.carrier.mesh) {
      b.mesh.group.visible = !b.carrier.tutorialHidden && !!b.carrier.mesh.root.visible;
      const alpha =
        b.carrier.team === state.myTeam && typeof b.carrier.mesh.stealthAlpha === 'number'
          ? b.carrier.mesh.stealthAlpha
          : 1.0;
      applyMeshStealthAlpha(b.mesh, alpha);
    } else {
      applyMeshStealthAlpha(b.mesh, 1.0);
    }
  }
}
