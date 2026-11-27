import { state, ctx } from '../state.js';
import {
  CANOPY_SPEC,
  JUNGLE_OBSTACLES,
  JUNGLE_WALLS,
  PARK_LANDMARKS,
  pushOutAABB
} from '../world.js';
import { _ultBox, _waterDeflectTmpPos } from './shared.js';

const _deflectSlide = { dirX: 0, dirZ: 0, step: 0 };

function pushWaveSegFromCircle(seg, cx, cz, minR, slide = null) {
  const dx = seg.x - cx;
  const dz = seg.z - cz;
  const dSq = dx * dx + dz * dz;
  if (dSq >= minR * minR) return;
  const d = Math.sqrt(dSq) || 0.001;
  const nx = dx / d;
  const nz = dz / d;
  let tx = 0;
  let tz = 0;
  if (slide && slide.step > 0) {
    const useT1 = -nz * slide.dirX + nx * slide.dirZ >= nz * slide.dirX - nx * slide.dirZ;
    tx = (useT1 ? -nz : nz) * slide.step;
    tz = (useT1 ? nx : -nx) * slide.step;
  }
  seg.x = cx + nx * minR + tx;
  seg.z = cz + nz * minR + tz;
}

function deflectFromJungleWalls(seg, dirX, dirZ, pad) {
  _deflectSlide.dirX = dirX;
  _deflectSlide.dirZ = dirZ;
  _deflectSlide.step = 0.35;
  for (let i = 0; i < JUNGLE_WALLS.length; i++) {
    const w = JUNGLE_WALLS[i];
    const vx = w.bx - w.ax;
    const vz = w.bz - w.az;
    const lenSq = vx * vx + vz * vz;
    const t = lenSq > 0.0001
      ? Math.max(0, Math.min(1, ((seg.x - w.ax) * vx + (seg.z - w.az) * vz) / lenSq))
      : 0;
    const cx = w.ax + t * vx;
    const cz = w.az + t * vz;
    pushWaveSegFromCircle(seg, cx, cz, w.radius + pad, _deflectSlide);
  }
}

function deflectFromLandmarks(seg, pad) {
  if (CANOPY_SPEC.hasCanopy) {
    for (let i = 0; i < CANOPY_SPEC.trunks.length; i++) {
      const tr = CANOPY_SPEC.trunks[i];
      pushWaveSegFromCircle(seg, tr.x, tr.z, tr.radius + pad);
    }
    return;
  }
  if (state.mapId === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    _waterDeflectTmpPos.x = seg.x;
    _waterDeflectTmpPos.z = seg.z;
    _ultBox.minX = sv.chaletMinX;
    _ultBox.maxX = sv.chaletMaxX;
    _ultBox.minZ = sv.chaletMinZ;
    _ultBox.maxZ = sv.chaletMaxZ;
    pushOutAABB(_waterDeflectTmpPos, _ultBox, pad, null);
    seg.x = _waterDeflectTmpPos.x;
    seg.z = _waterDeflectTmpPos.z;
    return;
  }
  if (state.mapId === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    const minR = lf.fountainR + pad;
    pushWaveSegFromCircle(seg, -lf.fountainX, 0, minR);
    pushWaveSegFromCircle(seg, lf.fountainX, 0, minR);
    return;
  }
  if (state.mapId === 'mont-royal') {
    const mr = PARK_LANDMARKS.montRoyal;
    pushWaveSegFromCircle(seg, mr.crossX, mr.crossZ, mr.crossRadius + pad);
  }
}

function deflectFromToolWalls(seg, pad) {
  const toolWalls = ctx.entities.activeToolWalls || [];
  const minR = 0.45 + pad;
  for (let w = 0; w < toolWalls.length; w++) {
    const tw = toolWalls[w];
    for (let s = 0; s < 5; s++) {
      const u = 0.1 + s * 0.2;
      const cx = tw.ax + (tw.bx - tw.ax) * u;
      const cz = tw.az + (tw.bz - tw.az) * u;
      pushWaveSegFromCircle(seg, cx, cz, minR);
    }
  }
}

export function deflectWaveSegmentAroundMapObstacles(seg, dirX, dirZ) {
  const pad = 0.65;
  _deflectSlide.dirX = dirX;
  _deflectSlide.dirZ = dirZ;
  _deflectSlide.step = 0.45;
  for (let i = 0; i < JUNGLE_OBSTACLES.length; i++) {
    const obs = JUNGLE_OBSTACLES[i];
    pushWaveSegFromCircle(seg, obs.x, obs.z, obs.radius + pad, _deflectSlide);
  }
  deflectFromJungleWalls(seg, dirX, dirZ, pad);
  deflectFromLandmarks(seg, pad);
  deflectFromToolWalls(seg, pad);
}
