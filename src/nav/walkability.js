import { FIELD, state, ctx } from '../state.js';
import {
  PARK_LANDMARKS,
  CANOPY_SPEC,
  JUNGLE_OBSTACLES,
  JUNGLE_WALLS,
  distSqPointToSegment2D,
  getTerrainY
} from '../world.js';
import {
  NAV_ENTITY_RADIUS,
  LEAF_WALL_NAV_RADIUS,
  setNavBox,
  pointNearAABB,
  isActiveGroundLeafWall
} from './shared.js';

function isBlockedByJungleGeometry(x, z, rNav) {
  const yRef = getTerrainY(x, z);

  for (let i = 0; i < JUNGLE_WALLS.length; i++) {
    const w = JUNGLE_WALLS[i];
    if (yRef >= (w.height || 3.85)) continue;
    const minDist = w.radius + rNav;
    if (distSqPointToSegment2D(x, z, w.ax, w.az, w.bx, w.bz) < minDist * minDist) {
      return true;
    }
  }

  for (let i = 0; i < JUNGLE_OBSTACLES.length; i++) {
    const obs = JUNGLE_OBSTACLES[i];
    const minDist = obs.radius + rNav;
    const dx = x - obs.x;
    const dz = z - obs.z;
    if (dx * dx + dz * dz < minDist * minDist) {
      return true;
    }
  }

  return false;
}

function isBlockedBySaintViateur(x, z, rNav) {
  const sv = PARK_LANDMARKS.saintViateur;
  if (pointNearAABB(x, z, setNavBox(sv.chaletMinX, sv.chaletMaxX, sv.chaletMinZ, sv.chaletMaxZ), rNav)) {
    return true;
  }
  const ax = Math.abs(x);
  const az = Math.abs(z);
  const onSvBridge = ax >= sv.bridgeInnerX && ax <= sv.bridgeOuterX && az <= sv.bridgeHalfZ;
  if (onSvBridge) {
    return az > sv.bridgeHalfZ - rNav;
  }
  if (
    pointNearAABB(x, z, setNavBox(-sv.bridgeOuterX, -sv.bridgeInnerX, -sv.bridgeParapetOuterZ, -sv.bridgeHalfZ), rNav) ||
    pointNearAABB(x, z, setNavBox(-sv.bridgeOuterX, -sv.bridgeInnerX, sv.bridgeHalfZ, sv.bridgeParapetOuterZ), rNav) ||
    pointNearAABB(x, z, setNavBox(sv.bridgeInnerX, sv.bridgeOuterX, -sv.bridgeParapetOuterZ, -sv.bridgeHalfZ), rNav) ||
    pointNearAABB(x, z, setNavBox(sv.bridgeInnerX, sv.bridgeOuterX, sv.bridgeHalfZ, sv.bridgeParapetOuterZ), rNav)
  ) {
    return true;
  }
  const inRx = Math.max(1, sv.islandRx - rNav);
  const inRz = Math.max(1, sv.islandRz - rNav);
  const outRx = sv.pondRx + rNav;
  const outRz = sv.pondRz + rNav;
  const dIn = Math.hypot(x / inRx, z / inRz);
  const dOut = Math.hypot(x / outRx, z / outRz);
  return dIn > 1.0 && dOut < 1.0;
}

function isBlockedByLafontaine(x, z, rNav) {
  const lf = PARK_LANDMARKS.lafontaine;
  const ax = Math.abs(x);
  const az = Math.abs(z);
  const onBridge = ax <= lf.bridgeHalfX && az <= lf.bridgeHalfZ;
  if (onBridge) {
    return ax > lf.bridgeHalfX - rNav;
  }
  if (
    pointNearAABB(x, z, setNavBox(-lf.bridgeParapetOuterX, -lf.bridgeHalfX, -lf.bridgeHalfZ, lf.bridgeHalfZ), rNav) ||
    pointNearAABB(x, z, setNavBox(lf.bridgeHalfX, lf.bridgeParapetOuterX, -lf.bridgeHalfZ, lf.bridgeHalfZ), rNav)
  ) {
    return true;
  }
  const ex = x / (lf.pondRx + rNav);
  const ez = z / (lf.pondRz + rNav);
  return ex * ex + ez * ez < 1.0;
}

function isBlockedByMontRoyal(x, z, rNav) {
  const mr = PARK_LANDMARKS.montRoyal;
  const minDist = mr.crossRadius + rNav;
  const dx = x - mr.crossX;
  const dz = z - mr.crossZ;
  if (dx * dx + dz * dz < minDist * minDist) return true;
  const lx = (x - mr.lakeX) / (mr.lakeRx + rNav);
  const lz = (z - mr.lakeZ) / (mr.lakeRz + rNav);
  return lx * lx + lz * lz < 1.0;
}

function isBlockedByParkLandmarks(x, z, rNav) {
  const mapId = state.mapId;
  if (mapId === 'saint-viateur') return isBlockedBySaintViateur(x, z, rNav);
  if (mapId === 'lafontaine') return isBlockedByLafontaine(x, z, rNav);
  if (mapId === 'mont-royal') return isBlockedByMontRoyal(x, z, rNav);
  return false;
}

function isBlockedByCanopyGround(x, z, rNav) {
  if (!CANOPY_SPEC || !CANOPY_SPEC.hasCanopy) return false;
  const trunks = CANOPY_SPEC.trunks || [];
  for (let i = 0; i < trunks.length; i++) {
    const tr = trunks[i];
    const minDist = tr.radius + rNav;
    const dx = x - tr.x;
    const dz = z - tr.z;
    if (dx * dx + dz * dz < minDist * minDist) return true;
  }
  if (
    pointNearAABB(x, z, setNavBox(-CANOPY_SPEC.rampSkirtOuterX, -CANOPY_SPEC.rampSkirtInnerX, -CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ), rNav) ||
    pointNearAABB(x, z, setNavBox(CANOPY_SPEC.rampSkirtInnerX, CANOPY_SPEC.rampSkirtOuterX, -CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ), rNav)
  ) {
    return true;
  }
  return (
    pointNearAABB(x, z, setNavBox(-1.9, 1.9, -CANOPY_SPEC.launchPierOuterZ, -CANOPY_SPEC.launchPierInnerZ), rNav) ||
    pointNearAABB(x, z, setNavBox(-1.9, 1.9, CANOPY_SPEC.launchPierInnerZ, CANOPY_SPEC.launchPierOuterZ), rNav)
  );
}

export function isStaticPointWalkable(x, z, rNav = NAV_ENTITY_RADIUS) {
  const maxX = FIELD.width * 0.5 - rNav;
  const maxZ = FIELD.depth * 0.5 - rNav;
  if (x < -maxX || x > maxX || z < -maxZ || z > maxZ) return false;
  if (isBlockedByJungleGeometry(x, z, rNav)) return false;
  if (isBlockedByParkLandmarks(x, z, rNav)) return false;
  if (isBlockedByCanopyGround(x, z, rNav)) return false;
  return true;
}

export function isDynamicPointBlocked(x, z, rNav = NAV_ENTITY_RADIUS) {
  const toolWalls = ctx.entities.activeToolWalls;
  if (toolWalls && toolWalls.length > 0) {
    for (let i = 0; i < toolWalls.length; i++) {
      const tw = toolWalls[i];
      if (!tw || tw.onCanopy) continue;
      const minDist = (tw.thickness || 0.36) + rNav;
      if (distSqPointToSegment2D(x, z, tw.ax, tw.az, tw.bx, tw.bz) < minDist * minDist) {
        return true;
      }
    }
  }

  const leafWalls = ctx.entities.activeLeafWalls;
  if (leafWalls && leafWalls.length > 0) {
    const minDist = LEAF_WALL_NAV_RADIUS + rNav;
    const minDistSq = minDist * minDist;
    for (let w = 0; w < leafWalls.length; w++) {
      const wall = leafWalls[w];
      if (!isActiveGroundLeafWall(wall)) continue;
      for (let i = 0; i < wall.nodes.length; i++) {
        const a = wall.nodes[i];
        const b = i < wall.nodes.length - 1 ? wall.nodes[i + 1] : a;
        if (distSqPointToSegment2D(x, z, a.x, a.z, b.x, b.z) < minDistSq) {
          return true;
        }
      }
    }
  }

  return false;
}
