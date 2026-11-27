import { ctx } from '../state.js';
import { players } from '../render3d.js';
import {
  LEAF_ULT_SPEED_MULT,
  activeFireLasers,
  activeLeafWalls,
  activeWaterWaves,
  clearAllUltimates
} from './shared.js';
import { updateFireLasers } from './fire.js';
import { spawnFireLaserUltimate } from './fire_spawn.js';
import { createLeafWallRecord, plantLeafSproutNode, growLeafWallMesh } from './leaf_mesh.js';
import { updateLeafWalls } from './leaf.js';
import { spawnWaterWaveUltimate, updateWaterWaves, updateWaterPulls } from './water.js';

export function updateUltimates(dt) {
  updateFireLasers(dt);
  updateLeafWalls(dt);
  updateWaterWaves(dt);
  updateWaterPulls(dt);
  ctx.api.updateDeployedToolsAndPatches(dt);
}

export function serializeLateUltimates() {
  return {
    fireLasers: activeFireLasers.map((f) => ({
      casterId: f.casterId,
      evolved: !!f.evolved,
      ox: f.ox,
      oy: f.oy,
      oz: f.oz,
      aimAngle: f.aimAngle,
      phase: f.phase,
      timer: f.timer,
      currentLen: f.currentLen,
      maxLen: f.maxLen,
      lingerTimer: f.lingerTimer,
      arcTime: f.arcTime || 0,
      hitPlayers: Array.from(f.hitPlayers || [])
    })),
    leafWalls: activeLeafWalls.map((w) => ({
      casterId: w.casterId,
      evolved: !!w.evolved,
      phase: w.phase,
      sprintTimer: w.sprintTimer,
      sprintMaxDuration: w.sprintMaxDuration,
      growDelayTimer: w.growDelayTimer,
      wallTimer: w.wallTimer,
      wallMaxDuration: w.wallMaxDuration,
      growAnim: w.growAnim || 0,
      nodes: (w.nodes || []).map((n) => ({ x: n.x, y: n.y, z: n.z }))
    })),
    waterWaves: activeWaterWaves.map((w) => ({
      casterId: w.casterId,
      onCanopy: !!w.onCanopy,
      evolved: !!w.evolved,
      aimAngle: w.aimAngle,
      traveled: w.traveled,
      maxRange: w.maxRange,
      finishedWave: !!w.finishedWave,
      pullWindowTimer: w.pullWindowTimer,
      pullTriggered: !!w.pullTriggered,
      hitPlayerIds: Array.from(w.hitPlayerIds || []),
      segments: (w.segments || []).map((s) => ({
        x: s.x,
        y: s.y,
        z: s.z,
        dirX: s.dirX,
        dirZ: s.dirZ,
        active: !!s.active
      }))
    }))
  };
}

function applyLateFireLasers(fireLasers) {
  for (let idx = 0; idx < fireLasers.length; idx++) {
    const sf = fireLasers[idx];
    const caster = players.find((pl) => pl.id === sf.casterId);
    if (!caster) continue;
    spawnFireLaserUltimate(caster, sf.aimAngle, !!sf.evolved);
    const f = activeFireLasers[activeFireLasers.length - 1];
    if (!f) continue;
    f.ox = sf.ox;
    f.oy = sf.oy;
    f.oz = sf.oz;
    f.dirX = Math.sin(sf.aimAngle);
    f.dirZ = Math.cos(sf.aimAngle);
    f.group.position.set(f.ox, 0, f.oz);
    f.group.rotation.y = f.aimAngle;
    f.phase = sf.phase;
    f.timer = sf.timer;
    f.currentLen = sf.currentLen;
    f.maxLen = sf.maxLen;
    f.lingerTimer = sf.lingerTimer;
    f.arcTime = sf.arcTime || 0;
    f.hitPlayers = new Set(sf.hitPlayers || []);
    if (f.phase === 'firing' || f.phase === 'linger') {
      f.outerBeam.visible = true;
      f.innerBeam.visible = true;
      f.impactSphere.visible = true;
      f.warnCore.visible = false;
      if (f.chargeBallGroup) f.chargeBallGroup.visible = false;
      f.outerBeam.position.y = f.oy;
      f.outerBeam.scale.set(1, 1, f.currentLen);
      f.innerBeam.position.y = f.oy;
      f.innerBeam.scale.set(1, 1, f.currentLen);
      f.impactSphere.position.set(0, f.oy, f.currentLen);
    }
  }
}

function applyLateLeafWalls(leafWalls) {
  for (let idx = 0; idx < leafWalls.length; idx++) {
    const sw = leafWalls[idx];
    const caster = players.find((pl) => pl.id === sw.casterId);
    if (!caster) continue;
    const wall = createLeafWallRecord(caster, !!sw.evolved);
    const nodes = sw.nodes || [];
    for (let n = 0; n < nodes.length; n++) {
      plantLeafSproutNode(wall, nodes[n].x, nodes[n].y, nodes[n].z);
    }
    wall.phase = sw.phase;
    wall.sprintTimer = sw.sprintTimer;
    wall.sprintMaxDuration = sw.sprintMaxDuration;
    wall.growDelayTimer = sw.growDelayTimer;
    wall.wallTimer = sw.wallTimer;
    wall.wallMaxDuration = sw.wallMaxDuration;
    wall.growAnim = sw.growAnim || 0;
    if (wall.phase === 'sprinting') {
      caster.leafUltTimer = Math.max(0, sw.sprintTimer);
      caster.leafUltMaxDuration = sw.sprintMaxDuration;
      caster.leafUltSpeedMult = sw.evolved ? 4.2 : LEAF_ULT_SPEED_MULT;
    } else if (wall.phase === 'grown') {
      growLeafWallMesh(wall);
      wall.treeWallGroup.scale.set(1, Math.max(0.05, wall.growAnim || 1), 1);
    }
    activeLeafWalls.push(wall);
    if (wall.phase === 'grown') {
      ctx.api.markNavDynamicDirty?.();
    }
  }
}

function applyLateWaterWaves(waterWaves) {
  for (let idx = 0; idx < waterWaves.length; idx++) {
    const sw = waterWaves[idx];
    const caster = players.find((pl) => pl.id === sw.casterId);
    if (!caster) continue;
    spawnWaterWaveUltimate(caster, sw.aimAngle, !!sw.evolved, true);
    const wave = activeWaterWaves[activeWaterWaves.length - 1];
    if (!wave) continue;
    if (typeof sw.onCanopy === 'boolean') wave.onCanopy = sw.onCanopy;
    wave.traveled = sw.traveled;
    wave.maxRange = sw.maxRange;
    wave.finishedWave = !!sw.finishedWave;
    wave.pullWindowTimer = sw.pullWindowTimer;
    wave.pullTriggered = !!sw.pullTriggered;
    wave.hitPlayerIds = new Set(sw.hitPlayerIds || []);
    wave.group.visible = !wave.finishedWave;
    const segSnaps = sw.segments || [];
    for (let i = 0; i < wave.segments.length && i < segSnaps.length; i++) {
      const seg = wave.segments[i];
      const ss = segSnaps[i];
      seg.x = ss.x;
      seg.y = ss.y;
      seg.z = ss.z;
      seg.dirX = ss.dirX;
      seg.dirZ = ss.dirZ;
      seg.active = !!ss.active;
      seg.mesh.visible = seg.active;
      seg.mesh.position.set(seg.x, seg.y, seg.z);
      if (wave.is360) {
        seg.mesh.scale.x = Math.min(1.0, 0.45 + (wave.traveled / 15.0) * 0.55);
      }
    }
    if (wave.evolved && !wave.pullTriggered && wave.pullWindowTimer > 0) {
      caster.activeReactivableWave = wave;
    } else if (caster.activeReactivableWave === wave) {
      caster.activeReactivableWave = null;
    }
  }
}

export function applyLateUltimates(data) {
  if (!data) return;
  clearAllUltimates();
  applyLateFireLasers(data.fireLasers || []);
  applyLateLeafWalls(data.leafWalls || []);
  applyLateWaterWaves(data.waterWaves || []);
}
