import { state } from '../state.js';
import { PARK_LANDMARKS } from './map_catalog.js';
import { CANOPY_SPEC, JUNGLE_BUSHES } from './shared.js';

export function getTerrainY(x, z, mapId = typeof state !== 'undefined' && state ? state.mapId : 'classic') {
  if (mapId === 'mont-royal') {
    const mr = PARK_LANDMARKS.montRoyal;
    const r = Math.hypot(x, z);
    if (r <= mr.plateauR) return mr.hillHeight;
    if (r < mr.hillR) {
      const u = (r - mr.plateauR) / (mr.hillR - mr.plateauR);
      const s = u * u * (3 - 2 * u);
      return mr.hillHeight * (1 - s);
    }
    return 0;
  }
  if (mapId === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    if (Math.abs(x) <= lf.bridgeHalfX + 0.15 && Math.abs(z) <= lf.bridgeHalfZ) {
      return lf.bridgeMaxY * Math.cos((Math.abs(z) / lf.bridgeHalfZ) * Math.PI * 0.5);
    }
    return 0;
  }
  if (mapId === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    const ax = Math.abs(x);
    if (ax >= sv.bridgeInnerX && ax <= sv.bridgeOuterX && Math.abs(z) <= sv.bridgeHalfZ + 0.15) {
      const u = (ax - sv.bridgeInnerX) / (sv.bridgeOuterX - sv.bridgeInnerX);
      return sv.bridgeMaxY * Math.sin(u * Math.PI);
    }
    return 0;
  }
  return 0;
}

export function getCanopySurfaceY(x, z) {
  for (let i = 0; i < CANOPY_SPEC.decks.length; i++) {
    const d = CANOPY_SPEC.decks[i];
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) {
      return { zone: d.id === 'center' ? 'centerDeck' : d.id, deckId: d.id, y: CANOPY_SPEC.deckY };
    }
  }

  for (let i = 0; i < CANOPY_SPEC.bridges.length; i++) {
    const b = CANOPY_SPEC.bridges[i];
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) {
      const rawU =
        b.axis === 'x'
          ? (x - b.x0) / Math.max(0.001, b.x1 - b.x0)
          : (z - b.z0) / Math.max(0.001, b.z1 - b.z0);
      const u = Math.max(0, Math.min(1, rawU));
      return { zone: b.id, bridge: b, y: CANOPY_SPEC.deckY - b.sag * Math.sin(Math.PI * u) };
    }
  }

  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax > CANOPY_SPEC.ascentInnerX && ax <= CANOPY_SPEC.ascentOuterX && az <= CANOPY_SPEC.ascentHalfZ) {
    const span = CANOPY_SPEC.ascentOuterX - CANOPY_SPEC.ascentInnerX;
    const t = Math.max(0, Math.min(1, (CANOPY_SPEC.ascentOuterX - ax) / span));
    return { zone: x < 0 ? 'westRamp' : 'eastRamp', y: CANOPY_SPEC.deckY * t };
  }

  if (az > CANOPY_SPEC.launchInnerZ && az <= CANOPY_SPEC.launchOuterZ && ax <= CANOPY_SPEC.launchHalfX) {
    const span = CANOPY_SPEC.launchOuterZ - CANOPY_SPEC.launchInnerZ;
    const u = Math.max(0, Math.min(1, (az - CANOPY_SPEC.launchInnerZ) / span));
    return {
      zone: z < 0 ? 'northLaunch' : 'southLaunch',
      y: CANOPY_SPEC.deckY - (CANOPY_SPEC.deckY - CANOPY_SPEC.launchLipY) * u
    };
  }

  return null;
}

export function getStructureSurfaceY(x, z, onCanopy = false) {
  if (!onCanopy || !CANOPY_SPEC.hasCanopy) return { zone: 'ground', y: getTerrainY(x, z) };
  return getCanopySurfaceY(x, z) || { zone: 'ground', y: getTerrainY(x, z) };
}

export function getRiftRiverCurrent(x, z) {
  if (typeof state === 'undefined' || state.mapId !== 'rift') return null;
  const rf = PARK_LANDMARKS.rift;
  const INV_SQRT2 = Math.SQRT1_2;
  if (Math.hypot(x, z) <= 10.2) return null;

  const s = (x + z) * INV_SQRT2;
  const absS = Math.abs(s);
  const perp = Math.abs(x - z) * INV_SQRT2;
  if (absS < 10.0 || absS > 86.0 || perp > rf.riverHalfWidth) return null;

  if (
    Math.hypot(x - rf.baronPit.x, z - rf.baronPit.z) <= rf.baronPit.r * 0.9 ||
    Math.hypot(x - rf.dragonPit.x, z - rf.dragonPit.z) <= rf.dragonPit.r * 0.9
  ) {
    return null;
  }

  let strength = 1.0;
  if (absS < 15.0) strength = (absS - 10.0) / 5.0;
  else if (absS > 76.0) strength = (86.0 - absS) / 10.0;

  const edgeRatio = perp / rf.riverHalfWidth;
  if (edgeRatio > 0.72) {
    strength *= Math.max(0.25, 1.0 - ((edgeRatio - 0.72) / 0.28) * 0.75);
  }

  const speed = 4.8 * strength;
  const sign = s >= 0 ? 1 : -1;
  return { vx: sign * INV_SQRT2 * speed, vz: sign * INV_SQRT2 * speed, speed };
}

export function isPointInJungleBush(pos) {
  if (!pos || (pos.y || 0) > 1.6) return null;
  for (let i = 0; i < JUNGLE_BUSHES.length; i++) {
    const b = JUNGLE_BUSHES[i];
    const dx = pos.x - b.x;
    const dz = pos.z - b.z;
    if (dx * dx + dz * dz < b.radius * b.radius) return b;
  }
  return null;
}
