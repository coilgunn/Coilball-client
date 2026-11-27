import { state, ctx } from '../state.js';
import {
  PARK_LANDMARKS,
  CANOPY_SPEC,
  JUNGLE_OBSTACLES,
  JUNGLE_WALLS
} from '../world.js';
import { LEAF_ULT_WALL_RADIUS, activeLeafWalls } from '../ultimates.js';
import { computeMobaPath, hasGridLOS, getNavVersion } from '../nav.js';

const THREE = ctx.THREE;
const _steerDir = { x: 0, z: 0 };
const _steerBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
const _aiSteerVec = { sx: 0, sz: 0 };
const _parkSteerVec = { sx: 0, sz: 0 };

function setSteerBox(minX, maxX, minZ, maxZ) {
  _steerBox.minX = minX;
  _steerBox.maxX = maxX;
  _steerBox.minZ = minZ;
  _steerBox.maxZ = maxZ;
  return _steerBox;
}

function steerAroundBoxObstacle(pos, dir, box, pad) {
  const cx = Math.max(box.minX, Math.min(box.maxX, pos.x));
  const cz = Math.max(box.minZ, Math.min(box.maxZ, pos.z));
  const toBoxX = cx - pos.x;
  const toBoxZ = cz - pos.z;
  const dist = Math.hypot(toBoxX, toBoxZ);
  if (dist <= 0.001 || dist >= pad) return { sx: 0, sz: 0 };

  const pushW = (pad - dist) * 1.6;
  let sx = -(toBoxX / dist) * pushW;
  let sz = -(toBoxZ / dist) * pushW;
  const rx = -toBoxX / dist;
  const rz = -toBoxZ / dist;
  const t1x = -rz;
  const t1z = rx;
  const t2x = rz;
  const t2z = -rx;
  const d1 = t1x * dir.x + t1z * dir.z;
  const d2 = t2x * dir.x + t2z * dir.z;
  const chosenX = d1 >= d2 ? t1x : t2x;
  const chosenZ = d1 >= d2 ? t1z : t2z;
  const tanW = ((pad - dist) / pad) * 2.2;
  sx += chosenX * tanW;
  sz += chosenZ * tanW;
  return { sx, sz };
}

function steerAroundWallSegments(px, pz, baseDirX, baseDirZ, walls) {
  if (!walls || walls.length === 0) return { sx: 0, sz: 0 };
  const proxies = [];
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const vx = w.bx - w.ax;
    const vz = w.bz - w.az;
    const lenSq = vx * vx + vz * vz;
    const t =
      lenSq > 0.0001
        ? Math.max(0, Math.min(1, ((px - w.ax) * vx + (pz - w.az) * vz) / lenSq))
        : 0;
    proxies.push({ x: w.ax + t * vx, z: w.az + t * vz, radius: w.radius });
  }
  return steerAroundCircleObstacles(px, pz, baseDirX, baseDirZ, proxies);
}

function steerAroundCircleObstacles(px, pz, baseDirX, baseDirZ, list) {
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < list.length; i++) {
    const obs = list[i];
    const toObsX = obs.x - px;
    const toObsZ = obs.z - pz;
    const obsDist = Math.hypot(toObsX, toObsZ);
    const avoidR = obs.radius + 1.85;

    if (obsDist < avoidR && obsDist > 0.001) {
      const pushWeight = (avoidR - obsDist) * 1.35;
      sx -= (toObsX / obsDist) * pushWeight;
      sz -= (toObsZ / obsDist) * pushWeight;
    }

    const proj = toObsX * baseDirX + toObsZ * baseDirZ;
    if (proj <= 0 || proj >= 5.0) continue;

    const latX = px + baseDirX * proj - obs.x;
    const latZ = pz + baseDirZ * proj - obs.z;
    const latDist = Math.hypot(latX, latZ);
    const safeCorridor = obs.radius + 1.25;
    if (latDist >= safeCorridor) continue;

    const rx = obsDist > 0.001 ? -toObsX / obsDist : 1;
    const rz = obsDist > 0.001 ? -toObsZ / obsDist : 0;
    const t1x = -rz;
    const t1z = rx;
    const t2x = rz;
    const t2z = -rx;
    const d1 = t1x * baseDirX + t1z * baseDirZ;
    const d2 = t2x * baseDirX + t2z * baseDirZ;
    let chosenX = d1 >= d2 ? t1x : t2x;
    let chosenZ = d1 >= d2 ? t1z : t2z;
    if (Math.abs(d1 - d2) < 0.12) {
      const preferOuterZ = pz >= obs.z ? 1 : -1;
      const pickT2 = t1z * preferOuterZ < t2z * preferOuterZ;
      chosenX = pickT2 ? t2x : t1x;
      chosenZ = pickT2 ? t2z : t1z;
    }
    const tangentWeight = ((safeCorridor - latDist) / safeCorridor) * 2.1;
    sx += chosenX * tangentWeight;
    sz += chosenZ * tangentWeight;
  }
  return { sx, sz };
}

function resolveLaFontaineFallback(p, targetPos) {
  const lf = PARK_LANDMARKS.lafontaine;
  const crossesPondZ =
    (p.pos.z < -11.5 && targetPos.z > 11.5) || (p.pos.z > 11.5 && targetPos.z < -11.5);
  const onBridgeCorridor =
    Math.abs(p.pos.x) <= lf.bridgeHalfX - 0.3 && Math.abs(p.pos.z) <= lf.bridgeHalfZ;
  if (!crossesPondZ || onBridgeCorridor) return targetPos;

  const crossings = [
    { x: 0, z: 0 },
    { x: -35.5, z: 0 },
    { x: 35.5, z: 0 }
  ];
  let bestWp = crossings[0];
  let bestLen = Infinity;
  for (let ci = 0; ci < crossings.length; ci++) {
    const wp = crossings[ci];
    const totalLen =
      Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z) +
      Math.hypot(targetPos.x - wp.x, targetPos.z - wp.z);
    if (totalLen < bestLen) {
      bestLen = totalLen;
      bestWp = wp;
    }
  }
  return new THREE.Vector3(bestWp.x, 0, bestWp.z);
}

function resolveSaintViateurFallback(p, targetPos) {
  const sv = PARK_LANDMARKS.saintViateur;
  const onBridge =
    Math.abs(p.pos.x) >= sv.bridgeInnerX - 0.5 &&
    Math.abs(p.pos.x) <= sv.bridgeOuterX + 0.5 &&
    Math.abs(p.pos.z) <= sv.bridgeHalfZ;
  const targetOnIsland = Math.hypot(targetPos.x / sv.islandRx, targetPos.z / sv.islandRz) < 1.0;
  const selfOutsideMoat = Math.hypot(p.pos.x / sv.pondRx, p.pos.z / sv.pondRz) > 1.0;
  const selfOnIsland = Math.hypot(p.pos.x / sv.islandRx, p.pos.z / sv.islandRz) < 1.0;
  const targetOutsideMoat = Math.hypot(targetPos.x / sv.pondRx, targetPos.z / sv.pondRz) > 1.0;
  const crossesWholePondX =
    Math.abs(p.pos.z) < sv.pondRz &&
    ((p.pos.x < -sv.islandRx && targetPos.x > sv.islandRx) ||
      (p.pos.x > sv.islandRx && targetPos.x < -sv.islandRx));

  if (!onBridge && ((targetOnIsland && selfOutsideMoat) || (selfOnIsland && targetOutsideMoat))) {
    const bx =
      p.pos.x >= 0
        ? (sv.bridgeInnerX + sv.bridgeOuterX) * 0.5
        : -(sv.bridgeInnerX + sv.bridgeOuterX) * 0.5;
    return new THREE.Vector3(bx, 0, 0);
  }
  if (!onBridge && crossesWholePondX && !selfOnIsland) {
    const edgeZ = p.pos.z >= 0 ? sv.pondRz + 2.8 : -(sv.pondRz + 2.8);
    return new THREE.Vector3(0, 0, edgeZ);
  }
  return targetPos;
}

function resolveParkNavFallback(p, targetPos) {
  if (state.mapId === 'lafontaine' && Math.abs(p.pos.x) < 33) {
    return resolveLaFontaineFallback(p, targetPos);
  }
  if (state.mapId === 'saint-viateur') {
    return resolveSaintViateurFallback(p, targetPos);
  }
  return targetPos;
}

export function resolveAINavSteerTarget(p, profile, targetPos) {
  if (hasGridLOS(p.pos.x, p.pos.z, targetPos.x, targetPos.z)) {
    p._aiNavPath = null;
    return targetPos;
  }
  const nowMs = performance.now();
  const navVer = getNavVersion();
  const goalMoved =
    !p._aiNavGoal ||
    Math.hypot(targetPos.x - p._aiNavGoal.x, targetPos.z - p._aiNavGoal.z) > 3.2;
  const needRecompute =
    !Array.isArray(p._aiNavPath) ||
    p._aiNavPath.length === 0 ||
    (p._aiNavIndex || 0) >= p._aiNavPath.length ||
    nowMs - (p._aiNavAt || 0) > profile.navReplanMs ||
    navVer !== p._aiNavVer ||
    goalMoved;
  if (needRecompute) {
    p._aiNavPath = computeMobaPath(p.pos.x, p.pos.z, targetPos.x, targetPos.z, {
      maxExpansions: state.mapId === 'rift' ? 3600 : 2400
    });
    p._aiNavIndex = 0;
    p._aiNavAt = nowMs;
    p._aiNavVer = navVer;
    p._aiNavGoal = { x: targetPos.x, z: targetPos.z };
  }

  if (Array.isArray(p._aiNavPath) && p._aiNavPath.length > 0) {
    while (p._aiNavIndex < p._aiNavPath.length) {
      const wp = p._aiNavPath[p._aiNavIndex];
      if (Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z) > 1.15) break;
      p._aiNavIndex++;
    }
    if (p._aiNavIndex < p._aiNavPath.length) {
      const wp = p._aiNavPath[p._aiNavIndex];
      return new THREE.Vector3(wp.x, 0, wp.z);
    }
    return targetPos;
  }

  return resolveParkNavFallback(p, targetPos);
}

function computeParkLandmarkSteering(p, baseDirX, baseDirZ) {
  let sx = 0;
  let sz = 0;
  if (state.mapId === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    const bSteer = steerAroundBoxObstacle(
      p.pos, _steerDir,
      setSteerBox(sv.chaletMinX - 0.3, sv.chaletMaxX + 0.3, sv.chaletMinZ - 0.3, sv.chaletMaxZ + 0.3), 2.8
    );
    sx += bSteer.sx;
    sz += bSteer.sz;
    const onBridgeBand =
      Math.abs(p.pos.x) >= sv.bridgeInnerX &&
      Math.abs(p.pos.x) <= sv.bridgeOuterX &&
      Math.abs(p.pos.z) <= sv.bridgeHalfZ;
    if (!onBridgeBand && Math.hypot(p.pos.x / sv.pondRx, p.pos.z / sv.pondRz) > 0.96) {
      const pW = steerAroundBoxObstacle(p.pos, _steerDir, setSteerBox(-sv.bridgeOuterX, -sv.bridgeInnerX, -sv.bridgeParapetOuterZ, -sv.bridgeHalfZ), 1.3);
      const pW2 = steerAroundBoxObstacle(p.pos, _steerDir, setSteerBox(-sv.bridgeOuterX, -sv.bridgeInnerX, sv.bridgeHalfZ, sv.bridgeParapetOuterZ), 1.3);
      const pE = steerAroundBoxObstacle(p.pos, _steerDir, setSteerBox(sv.bridgeInnerX, sv.bridgeOuterX, -sv.bridgeParapetOuterZ, -sv.bridgeHalfZ), 1.3);
      const pE2 = steerAroundBoxObstacle(p.pos, _steerDir, setSteerBox(sv.bridgeInnerX, sv.bridgeOuterX, sv.bridgeHalfZ, sv.bridgeParapetOuterZ), 1.3);
      sx += pW.sx + pW2.sx + pE.sx + pE2.sx;
      sz += pW.sz + pW2.sz + pE.sz + pE2.sz;
    }
  } else if (state.mapId === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    const parapetW = steerAroundBoxObstacle(p.pos, _steerDir, setSteerBox(-lf.bridgeParapetOuterX, -lf.bridgeHalfX, -lf.bridgeHalfZ, lf.bridgeHalfZ), 1.4);
    const parapetE = steerAroundBoxObstacle(p.pos, _steerDir, setSteerBox(lf.bridgeHalfX, lf.bridgeParapetOuterX, -lf.bridgeHalfZ, lf.bridgeHalfZ), 1.4);
    sx += parapetW.sx + parapetE.sx;
    sz += parapetW.sz + parapetE.sz;
    if (Math.abs(p.pos.x) > lf.bridgeHalfX) {
      const pondSteer = steerAroundCircleObstacles(p.pos.x, p.pos.z, baseDirX, baseDirZ, [
        { x: -17.5, z: 0, radius: 11.4 },
        { x: 17.5, z: 0, radius: 11.4 },
        { x: -9.0, z: 0, radius: 11.8 },
        { x: 9.0, z: 0, radius: 11.8 }
      ]);
      sx += pondSteer.sx;
      sz += pondSteer.sz;
    }
  } else if (state.mapId === 'mont-royal') {
    const mrSteer = steerAroundCircleObstacles(p.pos.x, p.pos.z, baseDirX, baseDirZ, [
      { x: 0, z: -5.2, radius: 2.4 },
      { x: 0, z: 4.2, radius: 5.5 }
    ]);
    sx += mrSteer.sx;
    sz += mrSteer.sz;
  }
  _parkSteerVec.sx = sx;
  _parkSteerVec.sz = sz;
  return _parkSteerVec;
}

export function computeGroundObstacleSteering(p, baseDirX, baseDirZ) {
  let steerX = baseDirX;
  let steerZ = baseDirZ;
  const jungleSteer = steerAroundCircleObstacles(p.pos.x, p.pos.z, baseDirX, baseDirZ, JUNGLE_OBSTACLES);
  steerX += jungleSteer.sx;
  steerZ += jungleSteer.sz;

  if (JUNGLE_WALLS.length > 0) {
    const riftSteer = steerAroundWallSegments(p.pos.x, p.pos.z, baseDirX, baseDirZ, JUNGLE_WALLS);
    steerX += riftSteer.sx;
    steerZ += riftSteer.sz;
  }

  for (let w = 0; w < activeLeafWalls.length; w++) {
    const wall = activeLeafWalls[w];
    if (wall.phase !== 'grown') continue;
    const wallCircles = wall.nodes.map((nd) => ({ x: nd.x, z: nd.z, radius: LEAF_ULT_WALL_RADIUS }));
    const wallSteer = steerAroundCircleObstacles(p.pos.x, p.pos.z, baseDirX, baseDirZ, wallCircles);
    steerX += wallSteer.sx;
    steerZ += wallSteer.sz;
  }

  const toolWalls = (ctx.entities.activeToolWalls || [])
    .filter((tw) => tw && !tw.onCanopy)
    .map((tw) => ({ ax: tw.ax, az: tw.az, bx: tw.bx, bz: tw.bz, radius: tw.thickness || 0.36 }));
  if (toolWalls.length > 0) {
    const toolSteer = steerAroundWallSegments(p.pos.x, p.pos.z, baseDirX, baseDirZ, toolWalls);
    steerX += toolSteer.sx;
    steerZ += toolSteer.sz;
  }

  _steerDir.x = baseDirX;
  _steerDir.z = baseDirZ;
  if (CANOPY_SPEC.hasCanopy) {
    const trunkSteer = steerAroundCircleObstacles(p.pos.x, p.pos.z, baseDirX, baseDirZ, CANOPY_SPEC.trunks);
    steerX += trunkSteer.sx;
    steerZ += trunkSteer.sz;
    if (p.pos.y < CANOPY_SPEC.launchLipY) {
      for (let i = 0; i < CANOPY_SPEC.aiPierBoxes.length; i++) {
        const box = CANOPY_SPEC.aiPierBoxes[i];
        const bSteer = steerAroundBoxObstacle(p.pos, _steerDir, setSteerBox(box[0], box[1], box[2], box[3]), box[4]);
        steerX += bSteer.sx;
        steerZ += bSteer.sz;
      }
    }
    if (p.pos.y < 2.2) {
      for (let i = 0; i < CANOPY_SPEC.aiRampSkirtBoxes.length; i++) {
        const box = CANOPY_SPEC.aiRampSkirtBoxes[i];
        const bSteer = steerAroundBoxObstacle(p.pos, _steerDir, setSteerBox(box[0], box[1], box[2], box[3]), box[4]);
        steerX += bSteer.sx;
        steerZ += bSteer.sz;
      }
    }
  } else {
    const parkSteer = computeParkLandmarkSteering(p, baseDirX, baseDirZ);
    steerX += parkSteer.sx;
    steerZ += parkSteer.sz;
  }
  _aiSteerVec.sx = steerX;
  _aiSteerVec.sz = steerZ;
  return _aiSteerVec;
}
