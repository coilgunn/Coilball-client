import { FIELD } from '../state.js';
import { darkenDecorHex, createToonMat, createBasicMat, addAnimeOutline } from '../render3d.js';
import { PARK_LANDMARKS } from './map_catalog.js';
import { createLaneConnectorSegment } from './mesh_utils.js';
import { createRiftPineTree, createFlowTexture, buildRiftWaterfall, createCelticPitRuneTexture } from './rift_props.js';
import { THREE, worldState, animatedWaterTextures } from './shared.js';

function buildRiftLanesAndRiver(rf, mats) {
  const worldGroup = worldState.worldGroup;
  const dirtColor = darkenDecorHex(0x8c673e, 0.72);
  const dirtBorderColor = darkenDecorHex(0x5c4226, 0.75);
  const addDirtRoad = (x1, z1, x2, z2, width) => {
    createLaneConnectorSegment(x1, z1, x2, z2, width + 1.8, dirtBorderColor, 0.42);
    createLaneConnectorSegment(x1, z1, x2, z2, width, dirtColor, 0.78);
  };
  addDirtRoad(-76, 44, -76, -54, 15.5);
  addDirtRoad(-76, -54, -71, -69, 15.5);
  addDirtRoad(-71, -69, -54, -76, 15.5);
  addDirtRoad(-54, -76, 44, -76, 15.5);
  addDirtRoad(-44, 76, 54, 76, 15.5);
  addDirtRoad(54, 76, 69, 71, 15.5);
  addDirtRoad(69, 71, 76, 54, 15.5);
  addDirtRoad(76, 54, 76, -44, 15.5);
  addDirtRoad(-56, 56, 56, -56, 15.0);

  const spawnRingMat = createBasicMat({ color: 0xfde047, side: THREE.DoubleSide, transparent: true, opacity: 0.78, depthWrite: false });
  [[-68, -68], [68, 68]].forEach(([bx, bz]) => {
    const rOuter = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.75, 32), spawnRingMat);
    rOuter.rotation.x = -Math.PI / 2;
    rOuter.position.set(bx, 0.055, bz);
    worldGroup.add(rOuter);
  });

  createLaneConnectorSegment({ x: -85, z: -85 }, { x: 85, z: 85 }, rf.riverHalfWidth * 2 + 3.2, darkenDecorHex(0x4b5c34, 0.72), 0.72);
  createLaneConnectorSegment({ x: -85, z: -85 }, { x: 85, z: 85 }, rf.riverHalfWidth * 2, darkenDecorHex(0x0c4a6e, 0.74), 0.76);
  createLaneConnectorSegment({ x: -84, z: -84 }, { x: 84, z: 84 }, rf.riverHalfWidth * 1.1, darkenDecorHex(0x0284c7, 0.68), 0.42);

  [
    { x1: -8.2, z1: -8.2, x2: -65, z2: -65 },
    { x1: 8.2, z1: 8.2, x2: 65, z2: 65 }
  ].forEach(({ x1, z1, x2, z2 }) => {
    const tex = createFlowTexture();
    const dx = x2 - x1;
    const dz = z2 - z1;
    const ribbon = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.hypot(dx, dz), rf.riverHalfWidth * 1.45),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false, fog: false })
    );
    ribbon.rotation.x = -Math.PI / 2;
    ribbon.rotation.z = -Math.atan2(dz, dx);
    ribbon.position.set((x1 + x2) * 0.5, 0.056, (z1 + z2) * 0.5);
    worldGroup.add(ribbon);
    animatedWaterTextures.push({ tex, speedX: -1.1, speedY: 0 });
  });

  const lakeShore = new THREE.Mesh(
    new THREE.CircleGeometry(rf.centerLakeRadius + 1.4, 40),
    createBasicMat({ color: darkenDecorHex(0x4b5c34, 0.72), transparent: true, opacity: 0.72, depthWrite: false })
  );
  lakeShore.rotation.x = -Math.PI / 2;
  lakeShore.position.set(0, 0.022, 0);
  worldGroup.add(lakeShore);

  const centerLake = new THREE.Mesh(
    new THREE.CircleGeometry(rf.centerLakeRadius, 40),
    createBasicMat({ color: darkenDecorHex(0x0c4a6e, 0.7), transparent: true, opacity: 0.82, depthWrite: false })
  );
  centerLake.rotation.x = -Math.PI / 2;
  centerLake.position.set(0, 0.036, 0);
  worldGroup.add(centerLake);

  const centerLakeShimmer = new THREE.Mesh(new THREE.CircleGeometry(rf.centerLakeRadius * 0.78, 36), mats.waterShimmerMat);
  centerLakeShimmer.rotation.x = -Math.PI / 2;
  centerLakeShimmer.position.set(0, 0.044, 0);
  worldGroup.add(centerLakeShimmer);

  [3.4, 5.4, 8.2].forEach((rr, idx) => {
    const foamRing = new THREE.Mesh(
      new THREE.RingGeometry(rr - 0.25, rr + 0.28, 32),
      createBasicMat({ color: 0xe0f2fe, side: THREE.DoubleSide, transparent: true, opacity: 0.58 - idx * 0.14, depthWrite: false })
    );
    foamRing.rotation.x = -Math.PI / 2;
    foamRing.position.set(0, 0.052, 0);
    worldGroup.add(foamRing);
  });
}

function buildRiftPitsAndStones(rf, mats) {
  const worldGroup = worldState.worldGroup;
  [
    { kind: 'baron', pit: rf.baronPit, primary: 'rgba(168, 85, 247, 0.88)', highlight: 'rgba(233, 213, 255, 0.94)', shadow: 'rgba(88, 28, 135, 0.55)' },
    { kind: 'dragon', pit: rf.dragonPit, primary: 'rgba(245, 158, 11, 0.88)', highlight: 'rgba(254, 240, 138, 0.94)', shadow: 'rgba(146, 64, 14, 0.55)' }
  ].forEach(({ kind, pit, primary, highlight, shadow }) => {
    const pitWater = new THREE.Mesh(new THREE.CircleGeometry(pit.r, 32), mats.waterMat);
    pitWater.rotation.x = -Math.PI / 2;
    pitWater.position.set(pit.x, 0.032, pit.z);
    worldGroup.add(pitWater);

    const pitShimmer = new THREE.Mesh(new THREE.CircleGeometry(pit.r * 0.82, 28), mats.waterShimmerMat);
    pitShimmer.rotation.x = -Math.PI / 2;
    pitShimmer.position.set(pit.x, 0.04, pit.z);
    worldGroup.add(pitShimmer);

    const runeTex = createCelticPitRuneTexture(kind, primary, highlight, shadow);
    const pitRune = new THREE.Mesh(
      new THREE.CircleGeometry(pit.r * 0.78, 48),
      new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, opacity: 0.92, depthWrite: false, fog: false })
    );
    pitRune.rotation.x = -Math.PI / 2;
    pitRune.rotation.z = kind === 'baron' ? Math.PI * 0.25 : -Math.PI * 0.25;
    pitRune.position.set(pit.x, 0.049, pit.z);
    worldGroup.add(pitRune);
  });

  [[-7.2, 3.2], [-3.2, 7.2], [7.2, -3.2], [3.2, -7.2]].forEach(([sx, sz]) => {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.09, 7), mats.darkStoneMat);
    stone.position.set(sx, 0.03, sz);
    worldGroup.add(stone);
  });
}

function buildSingleRiftBase(b, rf, mats, baseMats) {
  const worldGroup = worldState.worldGroup;
  const terrace = new THREE.Mesh(new THREE.CircleGeometry(rf.baseRadius, 28, b.thetaStart, Math.PI / 2), baseMats.baseFloorMat);
  terrace.rotation.x = -Math.PI / 2;
  terrace.position.set(b.cornerX, 0.028, b.cornerZ);
  terrace.receiveShadow = true;
  worldGroup.add(terrace);

  const rim = new THREE.Mesh(new THREE.RingGeometry(rf.baseRadius - 1.6, rf.baseRadius + 0.4, 28, 1, b.thetaStart, Math.PI / 2), mats.stoneMat);
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(b.cornerX, 0.042, b.cornerZ);
  worldGroup.add(rim);

  [20, 34, 46].forEach((rr) => {
    const arc = new THREE.Mesh(new THREE.RingGeometry(rr - 0.38, rr + 0.38, 28, 1, b.thetaStart, Math.PI / 2), baseMats.baseTileLineMat);
    arc.rotation.x = -Math.PI / 2;
    arc.position.set(b.cornerX, 0.046, b.cornerZ);
    worldGroup.add(arc);
  });
  const dirSign = b.cornerX < 0 ? 1 : -1;
  [
    [b.cornerX + dirSign * 12, b.cornerZ - dirSign * 44],
    [b.cornerX + dirSign * 34, b.cornerZ - dirSign * 34],
    [b.cornerX + dirSign * 44, b.cornerZ - dirSign * 12]
  ].forEach(([tx, tz]) => {
    createLaneConnectorSegment(b.cornerX, b.cornerZ, tx, tz, 0.72, 0x1e293b, 0.52);
  });

  const nexusRing = new THREE.Mesh(
    new THREE.RingGeometry(4.4, 5.2, 32),
    createBasicMat({ color: b.accentHex, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false })
  );
  nexusRing.rotation.x = -Math.PI / 2;
  nexusRing.position.set(b.goalX, 0.052, b.goalZ);
  worldGroup.add(nexusRing);

  const altarBase = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 0.45, 12), mats.darkStoneMat);
  altarBase.position.set(b.fountainX, 0.225, b.fountainZ);
  addAnimeOutline(altarBase, 1.03, 0x0f172a);
  worldGroup.add(altarBase);

  const altarGlow = new THREE.Mesh(
    new THREE.RingGeometry(2.3, 3.1, 24),
    createBasicMat({ color: b.accentHex, side: THREE.DoubleSide, transparent: true, opacity: 0.65, depthWrite: false })
  );
  altarGlow.rotation.x = -Math.PI / 2;
  altarGlow.position.set(b.fountainX, 0.47, b.fountainZ);
  worldGroup.add(altarGlow);

  const obelisk = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.95, 0),
    createToonMat(b.accentHex, { emissive: b.accentHex, emissiveIntensity: 0.48 })
  );
  obelisk.position.set(b.fountainX, 1.95, b.fountainZ);
  obelisk.scale.set(0.85, 1.55, 0.85);
  addAnimeOutline(obelisk, 1.06, 0x0f172a);
  worldGroup.add(obelisk);
}

function buildRiftBases(rf, mats) {
  const baseMats = {
    baseFloorMat: createToonMat(0x3f4c5e),
    baseTileLineMat: createBasicMat({ color: 0x1e293b, transparent: true, opacity: 0.52, depthWrite: false })
  };
  [
    { cornerX: -88, cornerZ: 88, thetaStart: 0, goalX: FIELD.allyGoalX, goalZ: FIELD.allyGoalZ, fountainX: rf.allyFountainX, fountainZ: rf.allyFountainZ, accentHex: 0xfacc15 },
    { cornerX: 88, cornerZ: -88, thetaStart: Math.PI, goalX: FIELD.enemyGoalX, goalZ: FIELD.enemyGoalZ, fountainX: rf.enemyFountainX, fountainZ: rf.enemyFountainZ, accentHex: 0xc084fc }
  ].forEach((b) => buildSingleRiftBase(b, rf, mats, baseMats));
}

function addRiftWallNode(idx, chain, wallMats) {
  const worldGroup = worldState.worldGroup;
  const isBase = chain.kind === 'base';
  const h = chain.height || 3.85;
  const r = chain.radius || 2.1;
  const postH = isBase ? h + 0.25 : h;
  const [px, pz] = chain.pts[idx];
  const accentHex = chain.teamSide === 'ally' ? 0xfacc15 : chain.teamSide === 'enemy' ? 0xc084fc : 0x38bdf8;

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 1.02, postH, 8), isBase ? wallMats.bastionStoneMat : wallMats.cliffRockMat);
  pillar.position.set(px, postH * 0.5, pz);
  pillar.castShadow = true;
  pillar.receiveShadow = true;
  addAnimeOutline(pillar, 1.035, 0x0f172a);
  worldGroup.add(pillar);

  if (isBase) {
    const trimRing = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.24, 8),
      createToonMat(accentHex, { emissive: accentHex, emissiveIntensity: 0.35 })
    );
    trimRing.position.set(px, postH + 0.08, pz);
    worldGroup.add(trimRing);

    if (idx === 0 || idx === chain.pts.length - 1) {
      const spire = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.65, 0),
        createToonMat(accentHex, { emissive: accentHex, emissiveIntensity: 0.5 })
      );
      spire.position.set(px, postH + 1.05, pz);
      spire.scale.set(0.85, 1.45, 0.85);
      addAnimeOutline(spire, 1.06, 0x0f172a);
      worldGroup.add(spire);
    }
  } else {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r * 0.96, 0.42, 8), wallMats.mossCapMat);
    cap.position.set(px, postH + 0.14, pz);
    cap.receiveShadow = true;
    addAnimeOutline(cap, 1.03, 0x052e16);
    worldGroup.add(cap);
  }
}

function addRiftWallSegment(p1, p2, chain, wallMats) {
  const worldGroup = worldState.worldGroup;
  const dx = p2[0] - p1[0];
  const dz = p2[1] - p1[1];
  const len = Math.hypot(dx, dz);
  if (len <= 0.2) return;

  const isBase = chain.kind === 'base';
  const h = chain.height || 3.85;
  const r = chain.radius || 2.1;
  const mx = (p1[0] + p2[0]) * 0.5;
  const mz = (p1[1] + p2[1]) * 0.5;
  const yaw = Math.atan2(dx, dz);
  const segH = h - 0.12;
  const accentHex = chain.teamSide === 'ally' ? 0xfacc15 : chain.teamSide === 'enemy' ? 0xc084fc : 0x38bdf8;

  const wallBody = new THREE.Mesh(new THREE.BoxGeometry(r * 1.88, segH, len), isBase ? wallMats.bastionStoneMat : wallMats.cliffRockMat);
  wallBody.position.set(mx, segH * 0.5, mz);
  wallBody.rotation.y = yaw;
  wallBody.castShadow = true;
  wallBody.receiveShadow = true;
  addAnimeOutline(wallBody, 1.025, 0x0f172a);
  worldGroup.add(wallBody);

  if (!isBase) {
    const segCap = new THREE.Mesh(new THREE.BoxGeometry(r * 1.94, 0.38, len + 0.1), wallMats.mossCapMat);
    segCap.position.set(mx, segH + 0.12, mz);
    segCap.rotation.y = yaw;
    segCap.receiveShadow = true;
    worldGroup.add(segCap);
  } else {
    const segTrim = new THREE.Mesh(
      new THREE.BoxGeometry(r * 1.4, 0.2, len),
      createToonMat(accentHex, { emissive: accentHex, emissiveIntensity: 0.28 })
    );
    segTrim.position.set(mx, segH + 0.08, mz);
    segTrim.rotation.y = yaw;
    worldGroup.add(segTrim);
  }
}

function buildRiftWallChains(rf, mapMeta, wallMats) {
  const worldGroup = worldState.worldGroup;
  rf.wallChains.forEach((chain) => {
    const h = chain.height || 3.85;
    for (let i = 0; i < chain.pts.length; i++) {
      addRiftWallNode(i, chain, wallMats);
      if (i < chain.pts.length - 1) {
        addRiftWallSegment(chain.pts[i], chain.pts[i + 1], chain, wallMats);
      }
    }
    if (Array.isArray(chain.trees)) {
      chain.trees.forEach(([idx]) => {
        if (chain.pts[idx]) {
          createRiftPineTree(chain.pts[idx][0], h + 0.2, chain.pts[idx][1], 0.92, mapMeta);
        }
      });
    }
    if (chain.kind === 'pit' && chain.pts[1]) {
      const pitHex = chain.pts[1][0] < 0 ? 0xa855f7 : 0xf59e0b;
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.68, 0),
        createToonMat(pitHex, { emissive: pitHex, emissiveIntensity: 0.55 })
      );
      crystal.position.set(chain.pts[1][0], h + 1.0, chain.pts[1][1]);
      crystal.scale.set(0.85, 1.5, 0.85);
      addAnimeOutline(crystal, 1.07, 0x0f172a);
      worldGroup.add(crystal);
    }
  });
}

export function buildRiftArenaLandmarks(mapMeta, mats) {
  const rf = PARK_LANDMARKS.rift;
  const wallMats = {
    mossCapMat: createToonMat(0x36692b),
    cliffRockMat: createToonMat(0x334155),
    bastionStoneMat: createToonMat(0x475569)
  };

  buildRiftLanesAndRiver(rf, mats);
  buildRiftWaterfall(wallMats.cliffRockMat, wallMats.mossCapMat);
  buildRiftPitsAndStones(rf, mats);
  buildRiftBases(rf, mats);
  buildRiftWallChains(rf, mapMeta, wallMats);

  for (let s = -84; s <= 84; s += 21) {
    createRiftPineTree(s, 0, -96, 1.15, mapMeta);
    createRiftPineTree(s, 0, 96, 1.15, mapMeta);
    createRiftPineTree(-96, 0, s, 1.15, mapMeta);
    createRiftPineTree(96, 0, s, 1.15, mapMeta);
  }
}
