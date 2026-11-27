import { FIELD, mp, ctx } from '../state.js';
import { scene, players, spawnParticles } from '../render3d.js';
import { getStructureSurfaceY } from '../world.js';
import {
  WATER_ULT_WIDTH,
  WATER_ULT_SEGMENTS,
  WATER_ULT_RANGE,
  WATER_ULT_SPEED,
  WATER_ULT_PUSH_SPEED,
  activeWaterWaves,
  activeWaterPulls,
  _waterStepDir,
  _waterPushedInStep,
  hasPlayerUltEvo
} from './shared.js';
import { hitsGrownLeafWall } from './leaf.js';
import { deflectWaveSegmentAroundMapObstacles } from './water_deflect.js';
import { updateUltHudWidget } from './hud_widget.js';

const THREE = ctx.THREE;

function createWaterWaveAssets(segStep) {
  const sharedLipGeo = new THREE.CylinderGeometry(0.28, 0.36, segStep * 1.18, 8);
  sharedLipGeo.rotateZ(Math.PI / 2);
  return {
    waveBodyMat: new THREE.MeshToonMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.80,
      depthWrite: false
    }),
    waveCrestMat: new THREE.MeshToonMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.76,
      depthWrite: false
    }),
    foamMat: new THREE.MeshBasicMaterial({
      color: 0xf0f9ff,
      transparent: true,
      opacity: 0.96
    }),
    foamLightMat: new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.84
    }),
    sharedBodyGeo: new THREE.CylinderGeometry(segStep * 0.5, segStep * 0.76, 1.0, 9),
    sharedLipGeo,
    foamSphereGeo: new THREE.SphereGeometry(0.26, 7, 6)
  };
}

function buildWaterWaveSegment(i, cfg, caster, assets) {
  const { is360, segCount, segStep, segRadius, aimAngle, dirX, dirZ, rightX, rightZ } = cfg;
  let sx, sz, sDirX, sDirZ, sYaw, centerPeak, leftPeak, rightPeak, pillarH, fwdBow;

  if (is360) {
    const theta = (i / segCount) * Math.PI * 2;
    sDirX = Math.sin(theta);
    sDirZ = Math.cos(theta);
    sYaw = theta;
    sx = caster.pos.x + sDirX * 1.85;
    sz = caster.pos.z + sDirZ * 1.85;
    centerPeak = i % 3 === 0 ? 0.82 : 0.36;
    leftPeak = 0.25;
    rightPeak = 0.25;
    pillarH = 1.35 + 1.35 * centerPeak;
    fwdBow = 0.25;
  } else {
    const latOffset = (i - (WATER_ULT_SEGMENTS - 1) * 0.5) * segStep;
    const normLat = latOffset / (WATER_ULT_WIDTH * 0.5);
    centerPeak = Math.exp(-Math.pow(normLat / 0.25, 2));
    leftPeak = Math.exp(-Math.pow((normLat + 0.58) / 0.17, 2));
    rightPeak = Math.exp(-Math.pow((normLat - 0.58) / 0.17, 2));
    pillarH = 1.15 + 2.30 * centerPeak + 1.00 * (leftPeak + rightPeak);
    fwdBow = centerPeak * 0.36;
    sDirX = dirX;
    sDirZ = dirZ;
    sYaw = aimAngle;
    sx = caster.pos.x + dirX * 1.55 + rightX * latOffset;
    sz = caster.pos.z + dirZ * 1.55 + rightZ * latOffset;
  }

  const sy = getStructureSurfaceY(sx, sz, !!caster.onCanopy).y;
  const segGroup = new THREE.Group();
  segGroup.position.set(sx, sy, sz);
  segGroup.rotation.y = sYaw;

  const bodyMesh = new THREE.Mesh(assets.sharedBodyGeo, assets.waveBodyMat);
  bodyMesh.scale.set(1.12, pillarH * 0.92, 1.55);
  bodyMesh.position.set(0, pillarH * 0.44, fwdBow);
  bodyMesh.rotation.x = 0.24;
  segGroup.add(bodyMesh);

  const lipMesh = new THREE.Mesh(assets.sharedLipGeo, assets.waveCrestMat);
  lipMesh.position.set(0, pillarH * 0.87, fwdBow + 0.42);
  lipMesh.scale.set(1.0, 0.85 + centerPeak * 0.45, 0.95);
  segGroup.add(lipMesh);

  if (centerPeak > 0.45) {
    const mainFoam = new THREE.Mesh(assets.sharedLipGeo, assets.foamMat);
    mainFoam.position.set(0, pillarH * 0.95, fwdBow + 0.48);
    mainFoam.scale.set(1.02, 0.72 + centerPeak * 0.48, 0.95);
    segGroup.add(mainFoam);
    for (let fIdx = 0; fIdx < 3; fIdx++) {
      const tuff = new THREE.Mesh(assets.foamSphereGeo, assets.foamMat);
      const oxFoam = (fIdx - 1) * segStep * 0.36;
      tuff.position.set(oxFoam, pillarH * (0.94 + (fIdx === 1 ? 0.09 : 0.02)), fwdBow + 0.56);
      tuff.scale.set(1.15, 0.82, 1.05);
      segGroup.add(tuff);
    }
  } else if (leftPeak > 0.45 || rightPeak > 0.45) {
    const sideFoam = new THREE.Mesh(assets.sharedLipGeo, assets.foamLightMat);
    sideFoam.position.set(0, pillarH * 0.92, fwdBow + 0.44);
    sideFoam.scale.set(0.95, 0.48, 0.65);
    segGroup.add(sideFoam);
  }

  return {
    index: i,
    x: sx,
    y: sy,
    z: sz,
    dirX: sDirX,
    dirZ: sDirZ,
    radius: segRadius,
    active: true,
    mesh: segGroup
  };
}

export function spawnWaterWaveUltimate(caster, aimAngle, evolvedOverride = null, preserveShield = false) {
  const evolved = typeof evolvedOverride === 'boolean' ? evolvedOverride : hasPlayerUltEvo(caster);
  const is360 = evolved;
  const segCount = is360 ? 140 : WATER_ULT_SEGMENTS;
  const maxRange = evolved ? WATER_ULT_RANGE * 1.45 : WATER_ULT_RANGE;
  const dirX = Math.sin(aimAngle);
  const dirZ = Math.cos(aimAngle);
  const rightX = Math.cos(aimAngle);
  const rightZ = -Math.sin(aimAngle);

  if (!preserveShield) {
    caster.waterShieldTimer = evolved ? 5.2 : 4.2;
  }

  const group = new THREE.Group();
  scene.add(group);
  const segStep = is360 ? 2.65 : WATER_ULT_WIDTH / (WATER_ULT_SEGMENTS - 1);
  const segCfg = {
    is360,
    segCount,
    segStep,
    segRadius: segStep * 0.72,
    aimAngle,
    dirX,
    dirZ,
    rightX,
    rightZ
  };
  const assets = createWaterWaveAssets(segStep);
  const segments = [];
  for (let i = 0; i < segCount; i++) {
    const seg = buildWaterWaveSegment(i, segCfg, caster, assets);
    group.add(seg.mesh);
    segments.push(seg);
  }

  spawnParticles(caster.pos, 0x38bdf8, 26);
  spawnParticles(caster.pos, 0xe0f2fe, 16);
  ctx.api.playSfx?.('ult_water_wave', { pos: caster.pos, evolved, global: true });

  const waveObj = {
    caster,
    casterId: caster.id,
    casterRole: caster.role,
    team: caster.team,
    onCanopy: !!caster.onCanopy,
    evolved,
    is360,
    dirX,
    dirZ,
    rightX,
    rightZ,
    aimAngle,
    traveled: 0,
    maxRange,
    hitPlayerIds: new Set(),
    pullWindowTimer: evolved ? 4.5 : 0,
    pullTriggered: false,
    segments,
    group
  };
  activeWaterWaves.push(waveObj);
  if (evolved) {
    caster.activeReactivableWave = waveObj;
  }
}

export function triggerWaterWavePull(caster) {
  if (!caster || !caster.activeReactivableWave) return false;
  const wave = caster.activeReactivableWave;
  if (wave.pullTriggered || wave.pullWindowTimer <= 0) return false;

  wave.pullTriggered = true;
  caster.activeReactivableWave = null;

  let pulledCount = 0;
  wave.hitPlayerIds.forEach((pid) => {
    const target = players.find((pl) => pl.id === pid);
    if (!target || target.tutorialHidden || target.id === caster.id || target.state === 'sitting') return;
    if (target.state === 'rule1') ctx.api.freeFromRule1(target);

    const dx = target.pos.x - caster.pos.x;
    const dz = target.pos.z - caster.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const stopDist = target.team === caster.team ? 1.85 : 2.35;
    const destPos = new THREE.Vector3(
      caster.pos.x + (dx / d) * Math.min(d, stopDist),
      target.pos.y || 0,
      caster.pos.z + (dz / d) * Math.min(d, stopDist)
    );
    ctx.api.clampToField(destPos, 0.72, null, { onCanopy: !!caster.onCanopy });
    activeWaterPulls.push({
      target,
      startX: target.pos.x,
      startZ: target.pos.z,
      destX: destPos.x,
      destZ: destPos.z,
      timer: 0.28,
      duration: 0.28
    });
    spawnParticles(target.pos, 0x38bdf8, 18);
    pulledCount++;
  });

  spawnParticles(caster.pos, 0x0ea5e9, 24);
  ctx.api.playSfx?.('ult_water_pull', { pos: caster.pos, global: true });
  ctx.api.broadcastToast(
    pulledCount > 0
      ? `💧🔄 <strong>REFLUX MARIN !</strong> ${caster.role} ramène <strong>${pulledCount}</strong> joueuse(s) touchée(s) !`
      : `💧🔄 <strong>Reflux activé</strong> par ${caster.role} (aucune cible à ramener).`,
    2400
  );
  updateUltHudWidget();
  return true;
}

export function updateWaterPulls(dt) {
  for (let i = activeWaterPulls.length - 1; i >= 0; i--) {
    const pull = activeWaterPulls[i];
    pull.timer -= dt;
    const prog = 1 - Math.max(0, pull.timer / pull.duration);
    const t = 1 - Math.pow(1 - prog, 2);
    const pl = pull.target;
    if (!pl || pl.state === 'sitting') {
      activeWaterPulls.splice(i, 1);
      continue;
    }
    pl.pos.x = pull.startX + (pull.destX - pull.startX) * t;
    pl.pos.z = pull.startZ + (pull.destZ - pull.startZ) * t;
    ctx.api.clampToField(pl.pos, 0.72, null, { onCanopy: !!pl.onCanopy });
    pl.pos.y = getStructureSurfaceY(pl.pos.x, pl.pos.z, !!pl.onCanopy).y;
    pl.targetPos.copy(pl.pos);
    if (mp.enabled && mp.isHost) pl.netForceSeq = ((pl.netForceSeq || 0) + 1) & 0xffff;
    if (Math.random() < 0.5) spawnParticles(pl.pos, 0x38bdf8, 2);
    if (pull.timer <= 0) {
      activeWaterPulls.splice(i, 1);
    }
  }
}

function applyWaterWaveSegmentHits(wave, seg, dir, dt, pushedInStep) {
  for (let pIdx = 0; pIdx < players.length; pIdx++) {
    const other = players[pIdx];
    if (other.tutorialHidden || other.id === wave.casterId || other.state === 'sitting') continue;
    if (pushedInStep.has(other.id)) continue;
    if (Math.abs((other.pos.y || 0) - seg.y) > 2.4) continue;
    if (Math.hypot(other.pos.x - seg.x, other.pos.z - seg.z) >= seg.radius + 1.15) continue;

    pushedInStep.add(other.id);
    if (wave.hitPlayerIds) wave.hitPlayerIds.add(other.id);
    if (other.team === wave.team) {
      other.waterShieldTimer = Math.max(other.waterShieldTimer || 0, 3.2);
    }
    if (other.state === 'rule1') ctx.api.freeFromRule1(other);
    const pushMult = other.team === wave.team ? 0.72 : 1.0;
    other.pos.x += dir.x * WATER_ULT_PUSH_SPEED * pushMult * dt;
    other.pos.z += dir.z * WATER_ULT_PUSH_SPEED * pushMult * dt;
    ctx.api.clampToField(other.pos, 0.72, other.vel, {
      onCanopy: !!other.onCanopy,
      isAirborne: !!other.isAirborne,
      airSource: other.airSource || null
    });
    if (!other.isAirborne) {
      other.pos.y = getStructureSurfaceY(other.pos.x, other.pos.z, !!other.onCanopy).y;
    }
    other.targetPos.copy(other.pos);
    if (mp.enabled && mp.isHost) other.netForceSeq = ((other.netForceSeq || 0) + 1) & 0xffff;
    if (Math.random() < 0.35) spawnParticles(other.pos, 0x38bdf8, 2);
  }
}

function stepWaterWaveTravel(wave, dt) {
  const stepDist = WATER_ULT_SPEED * dt;
  wave.traveled += stepDist;
  let activeCount = 0;
  _waterPushedInStep.clear();
  const maxX = FIELD.width * 0.5 - 0.8;
  const maxZ = FIELD.depth * 0.5 - 0.8;

  for (let i = 0; i < wave.segments.length; i++) {
    const seg = wave.segments[i];
    if (!seg.active) continue;
    const sdx = typeof seg.dirX === 'number' ? seg.dirX : wave.dirX;
    const sdz = typeof seg.dirZ === 'number' ? seg.dirZ : wave.dirZ;
    seg.x += sdx * stepDist;
    seg.z += sdz * stepDist;

    if (hitsGrownLeafWall(seg.x, seg.z, 0.72, seg.y)) {
      seg.active = false;
      seg.mesh.visible = false;
      spawnParticles(new THREE.Vector3(seg.x, seg.y + 0.9, seg.z), 0x38bdf8, 10);
      spawnParticles(new THREE.Vector3(seg.x, seg.y + 0.9, seg.z), 0x22c55e, 6);
      continue;
    }
    if (Math.abs(seg.x) > maxX || Math.abs(seg.z) > maxZ) {
      seg.active = false;
      seg.mesh.visible = false;
      continue;
    }
    deflectWaveSegmentAroundMapObstacles(seg, sdx, sdz);
    seg.y = getStructureSurfaceY(seg.x, seg.z, !!wave.onCanopy).y;
    const swellBob = Math.sin(wave.traveled * 0.55 + seg.index * 0.45) * 0.07;
    seg.mesh.position.set(seg.x, seg.y + swellBob, seg.z);
    seg.mesh.rotation.x = 0.05 * Math.sin(wave.traveled * 0.6 + seg.index * 0.4);
    if (wave.is360) seg.mesh.scale.x = Math.min(1.0, 0.45 + (wave.traveled / 15.0) * 0.55);
    activeCount++;
    _waterStepDir.x = sdx;
    _waterStepDir.z = sdz;
    applyWaterWaveSegmentHits(wave, seg, _waterStepDir, dt, _waterPushedInStep);
  }

  if (wave.traveled > wave.maxRange - 5.0) {
    const fade = Math.max(0.1, (wave.maxRange - wave.traveled) / 5.0);
    for (let i = 0; i < wave.segments.length; i++) wave.segments[i].mesh.scale.y = fade;
  }
  if (activeCount === 0 || wave.traveled >= wave.maxRange) {
    wave.finishedWave = true;
    wave.group.visible = false;
    for (let i = 0; i < wave.segments.length; i++) wave.segments[i].active = false;
  }
}

export function updateWaterWaves(dt) {
  for (let w = activeWaterWaves.length - 1; w >= 0; w--) {
    const wave = activeWaterWaves[w];
    if (wave.pullWindowTimer > 0) {
      wave.pullWindowTimer = Math.max(0, wave.pullWindowTimer - dt);
      if (wave.pullWindowTimer <= 0 && wave.caster && wave.caster.activeReactivableWave === wave) {
        wave.caster.activeReactivableWave = null;
        updateUltHudWidget();
      }
    }
    if (!wave.finishedWave && wave.traveled < wave.maxRange) {
      stepWaterWaveTravel(wave, dt);
    }
    const keepForPull = wave.evolved && !wave.pullTriggered && wave.pullWindowTimer > 0;
    if (wave.finishedWave && !keepForPull) {
      scene.remove(wave.group);
      activeWaterWaves.splice(w, 1);
    }
  }
}

export function isPointProtectedByWaterWave(x, z, extraR = 1.2) {
  for (let w = 0; w < activeWaterWaves.length; w++) {
    const wave = activeWaterWaves[w];
    for (let i = 0; i < wave.segments.length; i++) {
      const seg = wave.segments[i];
      if (!seg.active) continue;
      const r = seg.radius + extraR;
      const dx = x - seg.x;
      const dz = z - seg.z;
      if (dx * dx + dz * dz <= r * r) return true;
    }
  }
  return false;
}
