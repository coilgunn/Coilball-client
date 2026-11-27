import { FIELD, state } from '../state.js';
import {
  PARK_LANDMARKS,
  CANOPY_SPEC,
  JUNGLE_OBSTACLES,
  JUNGLE_WALLS,
  getTerrainY,
  enforceCanopyRails,
  pushOutAABB,
  pushOutEllipse,
} from '../world.js';
import { pushOutFromLeafWalls } from '../ultimates.js';
import { activeToolWalls } from './shared.js';

const _aabbTmp = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
const _ellipseTmp = { cx: 0, cz: 0, rx: 0, rz: 0 };

function setAabbTmp(minX, maxX, minZ, maxZ) {
  _aabbTmp.minX = minX;
  _aabbTmp.maxX = maxX;
  _aabbTmp.minZ = minZ;
  _aabbTmp.maxZ = maxZ;
  return _aabbTmp;
}

function setEllipseTmp(cx, cz, rx, rz) {
  _ellipseTmp.cx = cx;
  _ellipseTmp.cz = cz;
  _ellipseTmp.rx = rx;
  _ellipseTmp.rz = rz;
  return _ellipseTmp;
}

function reflectBounceVel(bounceVel, nx, nz) {
  if (!bounceVel) return;
  const vn = bounceVel.x * nx + bounceVel.z * nz;
  if (vn < 0) {
    bounceVel.x -= 1.55 * vn * nx;
    bounceVel.z -= 1.55 * vn * nz;
  }
}

function pushOutFromCircleObstacle(pos, cx, cz, minDist, bounceVel) {
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const distSq = dx * dx + dz * dz;
  if (distSq >= minDist * minDist) return;
  const dist = Math.sqrt(distSq);
  const nx = dist > 0.0001 ? dx / dist : 1;
  const nz = dist > 0.0001 ? dz / dist : 0;
  pos.x = cx + nx * minDist;
  pos.z = cz + nz * minDist;
  reflectBounceVel(bounceVel, nx, nz);
}

function pushOutFromSegment(pos, seg, segRadius, entityRadius, bounceVel) {
  const { ax, az, bx, bz } = seg;
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
  if (dSq >= minDist * minDist) return;
  const d = Math.sqrt(dSq) || 0.001;
  const nx = dx / d;
  const nz = dz / d;
  pos.x = cx + nx * minDist;
  pos.z = cz + nz * minDist;
  reflectBounceVel(bounceVel, nx, nz);
}

function pushOutSaintViateurPondRing(pos, sv, entityRadius, bounceVel) {
  const inRx = Math.max(1, sv.islandRx - entityRadius);
  const inRz = Math.max(1, sv.islandRz - entityRadius);
  const outRx = sv.pondRx + entityRadius;
  const outRz = sv.pondRz + entityRadius;
  const dIn = Math.hypot(pos.x / inRx, pos.z / inRz);
  const dOut = Math.hypot(pos.x / outRx, pos.z / outRz);
  if (dIn <= 1.0 || dOut >= 1.0) return;
  const ix = pos.x / dIn;
  const iz = pos.z / dIn;
  const ox = pos.x / dOut;
  const oz = pos.z / dOut;
  const useInner = Math.hypot(pos.x - ix, pos.z - iz) <= Math.hypot(pos.x - ox, pos.z - oz);
  const tx = useInner ? ix : ox;
  const tz = useInner ? iz : oz;
  const nx = tx - pos.x;
  const nz = tz - pos.z;
  const nLen = Math.hypot(nx, nz) || 1;
  pos.x = tx;
  pos.z = tz;
  reflectBounceVel(bounceVel, nx / nLen, nz / nLen);
}

function pushOutSaintViateur(pos, entityRadius, bounceVel, skipGroundLandmarks) {
  const sv = PARK_LANDMARKS.saintViateur;
  pushOutAABB(pos, setAabbTmp(sv.chaletMinX, sv.chaletMaxX, sv.chaletMinZ, sv.chaletMaxZ), entityRadius, bounceVel);
  if (skipGroundLandmarks) return;
  const onSvBridge =
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
    return;
  }
  for (let side = -1; side <= 1; side += 2) {
    const bx0 = side < 0 ? -sv.bridgeOuterX : sv.bridgeInnerX;
    const bx1 = side < 0 ? -sv.bridgeInnerX : sv.bridgeOuterX;
    pushOutAABB(pos, setAabbTmp(bx0, bx1, -sv.bridgeParapetOuterZ, -sv.bridgeHalfZ), entityRadius, bounceVel);
    pushOutAABB(pos, setAabbTmp(bx0, bx1, sv.bridgeHalfZ, sv.bridgeParapetOuterZ), entityRadius, bounceVel);
  }
  pushOutSaintViateurPondRing(pos, sv, entityRadius, bounceVel);
}

function pushOutLafontaine(pos, entityRadius, bounceVel) {
  const lf = PARK_LANDMARKS.lafontaine;
  const onBridge = Math.abs(pos.x) <= lf.bridgeHalfX && Math.abs(pos.z) <= lf.bridgeHalfZ;
  if (onBridge) {
    const maxBridgeX = lf.bridgeHalfX - entityRadius;
    if (pos.x < -maxBridgeX) {
      pos.x = -maxBridgeX;
      if (bounceVel && bounceVel.x < 0) bounceVel.x *= -0.55;
    } else if (pos.x > maxBridgeX) {
      pos.x = maxBridgeX;
      if (bounceVel && bounceVel.x > 0) bounceVel.x *= -0.55;
    }
    return;
  }
  pushOutAABB(pos, setAabbTmp(-lf.bridgeParapetOuterX, -lf.bridgeHalfX, -lf.bridgeHalfZ, lf.bridgeHalfZ), entityRadius, bounceVel);
  pushOutAABB(pos, setAabbTmp(lf.bridgeHalfX, lf.bridgeParapetOuterX, -lf.bridgeHalfZ, lf.bridgeHalfZ), entityRadius, bounceVel);
  pushOutEllipse(pos, setEllipseTmp(0, 0, lf.pondRx, lf.pondRz), entityRadius, bounceVel);
}

function pushOutGroundLandmarks(pos, entityRadius, bounceVel, skipGroundLandmarks, yRef) {
  pushOutFromLeafWalls(pos, entityRadius, bounceVel);

  const groundY = getTerrainY(pos.x, pos.z);
  for (let w = 0; w < activeToolWalls.length; w++) {
    const tw = activeToolWalls[w];
    const wallBaseY = tw.cy || 0;
    if (Math.abs(yRef - wallBaseY) > 2.3) continue;
    if (skipGroundLandmarks && yRef >= Math.max(groundY, wallBaseY) + 1.35) continue;
    pushOutFromSegment(pos, tw, tw.thickness || 0.36, entityRadius, bounceVel);
  }

  for (let i = 0; i < JUNGLE_WALLS.length; i++) {
    const w = JUNGLE_WALLS[i];
    if (yRef >= (w.height || 3.85)) continue;
    pushOutFromSegment(pos, w, w.radius, entityRadius, bounceVel);
  }

  for (let i = 0; i < JUNGLE_OBSTACLES.length; i++) {
    const obs = JUNGLE_OBSTACLES[i];
    const obsMaxY = obs.kind === 'gazebo' ? 999 : obs.kind === 'waterfall' ? 25.0 : groundY + 3.8;
    if (yRef >= obsMaxY) continue;
    pushOutFromCircleObstacle(pos, obs.x, obs.z, obs.radius + entityRadius, bounceVel);
  }

  if (state.mapId === 'saint-viateur') {
    pushOutSaintViateur(pos, entityRadius, bounceVel, skipGroundLandmarks);
  } else if (state.mapId === 'lafontaine' && !skipGroundLandmarks) {
    pushOutLafontaine(pos, entityRadius, bounceVel);
  } else if (state.mapId === 'mont-royal' && !skipGroundLandmarks) {
    const mr = PARK_LANDMARKS.montRoyal;
    pushOutFromCircleObstacle(pos, mr.crossX, mr.crossZ, mr.crossRadius + entityRadius, bounceVel);
    pushOutEllipse(pos, setEllipseTmp(mr.lakeX, mr.lakeZ, mr.lakeRx, mr.lakeRz), entityRadius, bounceVel);
  }
}

function clampArenaBounds(pos, maxX, maxZ, bounceVel) {
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
}

export function clampToField(pos, entityRadius = 0.72, bounceVel = null, opts = null) {
  const maxX = FIELD.width / 2 - entityRadius;
  const maxZ = FIELD.depth / 2 - entityRadius;
  clampArenaBounds(pos, maxX, maxZ, bounceVel);

  const onCanopy = !!(opts && opts.onCanopy);
  const isAir = !!(opts && opts.isAirborne);
  const isJumpAir = isAir && !!(opts && opts.airSource === 'jump');
  const skipGroundLandmarks = isAir && !isJumpAir;
  const yRef = typeof pos.y === 'number' ? pos.y : 0;

  if (!onCanopy) {
    pushOutGroundLandmarks(pos, entityRadius, bounceVel, skipGroundLandmarks, yRef);
  }

  if (onCanopy && CANOPY_SPEC.hasCanopy) {
    if (!bounceVel && !skipGroundLandmarks) {
      enforceCanopyRails(pos, Math.min(entityRadius, 0.56));
    }
    clampArenaBounds(pos, maxX, maxZ, bounceVel);
    return;
  }

  if (!CANOPY_SPEC.hasCanopy) {
    clampArenaBounds(pos, maxX, maxZ, bounceVel);
    return;
  }

  if (yRef < CANOPY_SPEC.deckY - 0.5) {
    for (let i = 0; i < CANOPY_SPEC.trunks.length; i++) {
      const tr = CANOPY_SPEC.trunks[i];
      pushOutFromCircleObstacle(pos, tr.x, tr.z, tr.radius + entityRadius, bounceVel);
    }
  }

  if (!skipGroundLandmarks && yRef < CANOPY_SPEC.deckY * 0.4) {
    pushOutAABB(pos, setAabbTmp(-CANOPY_SPEC.rampSkirtOuterX, -CANOPY_SPEC.rampSkirtInnerX, -CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ), entityRadius, bounceVel);
    pushOutAABB(pos, setAabbTmp(CANOPY_SPEC.rampSkirtInnerX, CANOPY_SPEC.rampSkirtOuterX, -CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ), entityRadius, bounceVel);
  }
  if (!skipGroundLandmarks && yRef < CANOPY_SPEC.launchLipY) {
    pushOutAABB(pos, setAabbTmp(-1.9, 1.9, -CANOPY_SPEC.launchPierOuterZ, -CANOPY_SPEC.launchPierInnerZ), entityRadius, bounceVel);
    pushOutAABB(pos, setAabbTmp(-1.9, 1.9, CANOPY_SPEC.launchPierInnerZ, CANOPY_SPEC.launchPierOuterZ), entityRadius, bounceVel);
  }
  clampArenaBounds(pos, maxX, maxZ, bounceVel);
}
