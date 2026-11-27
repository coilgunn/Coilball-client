import { createToonMat, addAnimeOutline } from '../render3d.js';
import { getActiveMapMeta } from './map_catalog.js';
import { THREE, CANOPY_SPEC, worldState } from './shared.js';
import {
  createCanopyMaterials,
  addCanopyRopeSegment,
  addCanopyPost,
  buildSpiritTreeBase,
  buildCanopyDecks,
  buildCanopyTrunks
} from './canopy_details.js';

function buildSuspendedBridge(b, mats, pH) {
  const worldGroup = worldState.worldGroup;
  const isX = b.axis === 'x';
  const span = isX ? b.x1 - b.x0 : b.z1 - b.z0;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const halfW = CANOPY_SPEC.bridgeHalf;
  const plankCount = Math.max(7, Math.round(span / 0.78));

  for (let i = 0; i < plankCount; i++) {
    const u = (i + 0.5) / plankCount;
    const surfY = pH - b.sag * Math.sin(Math.PI * u);
    const plank = new THREE.Mesh(
      isX ? new THREE.BoxGeometry(0.62, 0.15, halfW * 2) : new THREE.BoxGeometry(halfW * 2, 0.15, 0.62),
      i % 2 === 0 ? mats.plankLightMat : mats.plankDarkMat
    );
    plank.position.set(isX ? b.x0 + u * span : cx, surfY - 0.075, isX ? cz : b.z0 + u * span);
    plank.castShadow = true;
    plank.receiveShadow = true;
    addAnimeOutline(plank, new THREE.Vector3(1.03, 1.06, 1.02), 0x0f172a);
    worldGroup.add(plank);
  }

  const anchorPostH = 1.95;
  const segs = Math.max(8, Math.round(span / 1.1));
  [-halfW, halfW].forEach((offset) => {
    if (isX) {
      addCanopyPost(b.x0, pH, cz + offset, anchorPostH, 0.13, mats.boughMat);
      addCanopyPost(b.x1, pH, cz + offset, anchorPostH, 0.13, mats.boughMat);
    } else {
      addCanopyPost(cx + offset, pH, b.z0, anchorPostH, 0.13, mats.boughMat);
      addCanopyPost(cx + offset, pH, b.z1, anchorPostH, 0.13, mats.boughMat);
    }

    for (let s = 0; s < segs; s++) {
      const u1 = s / segs;
      const u2 = (s + 1) / segs;
      const a1 = (isX ? b.x0 : b.z0) + u1 * span;
      const a2 = (isX ? b.x0 : b.z0) + u2 * span;
      const x1 = isX ? a1 : cx + offset;
      const z1 = isX ? cz + offset : a1;
      const x2 = isX ? a2 : cx + offset;
      const z2 = isX ? cz + offset : a2;

      const cy1 = pH + anchorPostH - 0.1 - 1.15 * Math.sin(Math.PI * u1);
      const cy2 = pH + anchorPostH - 0.1 - 1.15 * Math.sin(Math.PI * u2);
      addCanopyRopeSegment({ x: x1, y: cy1, z: z1 }, { x: x2, y: cy2, z: z2 }, 0.06, mats.ropeMat);

      const dy1 = pH - b.sag * Math.sin(Math.PI * u1) + 0.85;
      const dy2 = pH - b.sag * Math.sin(Math.PI * u2) + 0.85;
      addCanopyRopeSegment({ x: x1, y: dy1, z: z1 }, { x: x2, y: dy2, z: z2 }, 0.048, mats.ropeMat);

      if (s > 0 && s < segs && s % 2 === 0) {
        addCanopyRopeSegment({ x: x1, y: cy1, z: z1 }, { x: x1, y: pH - b.sag * Math.sin(Math.PI * u1), z: z1 }, 0.032, mats.ropeMat);
      }
    }
  });
}

function buildAscentRampSide(sx, mats, pH) {
  const worldGroup = worldState.worldGroup;
  const ascentSpan = CANOPY_SPEC.ascentOuterX - CANOPY_SPEC.ascentInnerX;
  const slopeAngle = Math.atan2(pH, ascentSpan);
  for (let i = 0; i < 18; i++) {
    const u = (i + 0.5) / 18;
    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.15, CANOPY_SPEC.ascentHalfZ * 2),
      i % 2 === 0 ? mats.plankDarkMat : mats.plankLightMat
    );
    tread.position.set(sx * (CANOPY_SPEC.ascentInnerX + u * ascentSpan), pH * (1 - u) - 0.075, 0);
    tread.rotation.z = -sx * slopeAngle;
    tread.castShadow = true;
    tread.receiveShadow = true;
    addAnimeOutline(tread, new THREE.Vector3(1.03, 1.06, 1.02), 0x0f172a);
    worldGroup.add(tread);
  }

  const gateZ = CANOPY_SPEC.ascentHalfZ + 0.1;
  [-CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ].forEach((rz, idx) => {
    const xTop = sx * CANOPY_SPEC.ascentInnerX;
    const xBot = sx * CANOPY_SPEC.ascentOuterX;
    addCanopyRopeSegment({ x: xTop, y: pH + 0.9, z: rz }, { x: xBot, y: 0.9, z: rz }, 0.055, mats.ropeMat);
    addCanopyRopeSegment({ x: xTop, y: pH + 0.45, z: rz }, { x: xBot, y: 0.45, z: rz }, 0.04, mats.ropeMat);
    [0, 0.35, 0.7].forEach((u) => {
      addCanopyPost(sx * (CANOPY_SPEC.ascentInnerX + u * ascentSpan), pH * (1 - u), rz, 1.05, 0.1, mats.boughMat);
    });
    addCanopyPost(sx * CANOPY_SPEC.ascentOuterX, 0, idx === 0 ? -gateZ : gateZ, 3.55, 0.16, mats.boughMat);
  });

  addCanopyRopeSegment(
    { x: sx * CANOPY_SPEC.ascentOuterX, y: 3.42, z: -gateZ },
    { x: sx * CANOPY_SPEC.ascentOuterX, y: 3.42, z: gateZ },
    0.13,
    mats.boughMat
  );
  const teamLampHex = sx < 0 ? 0xfacc15 : 0xc084fc;
  const lanternMat = createToonMat(teamLampHex, { emissive: teamLampHex, emissiveIntensity: 0.7 });
  [-gateZ, gateZ].forEach((lz) => {
    const sideLantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), lanternMat);
    sideLantern.position.set(sx * CANOPY_SPEC.ascentOuterX, 3.74, lz);
    addAnimeOutline(sideLantern, 1.06, 0x0f172a);
    worldGroup.add(sideLantern);
  });

  const entryPad = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.07, CANOPY_SPEC.ascentHalfZ * 2), mats.plankLightMat);
  entryPad.position.set(sx * (CANOPY_SPEC.ascentOuterX + 0.9), 0.025, 0);
  entryPad.receiveShadow = true;
  addAnimeOutline(entryPad, new THREE.Vector3(1.02, 1.04, 1.02), 0x0f172a);
  worldGroup.add(entryPad);

  const arrowMat = new THREE.MeshBasicMaterial({ color: teamLampHex, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  [0, 1].forEach((aIdx) => {
    const chevron = new THREE.Mesh(new THREE.CircleGeometry(0.58, 3), arrowMat);
    chevron.rotation.x = -Math.PI / 2;
    chevron.rotation.z = sx < 0 ? 0 : Math.PI;
    chevron.position.set(sx * (CANOPY_SPEC.ascentOuterX + 1.3 - aIdx * 0.9), 0.068, 0);
    worldGroup.add(chevron);
  });

  const rockCribMat = createToonMat(0x475569);
  const skirtSpan = CANOPY_SPEC.rampSkirtOuterX - CANOPY_SPEC.rampSkirtInnerX;
  for (let cIdx = 0; cIdx < 3; cIdx++) {
    const x0 = CANOPY_SPEC.rampSkirtInnerX + (cIdx / 3) * skirtSpan;
    const x1 = CANOPY_SPEC.rampSkirtInnerX + ((cIdx + 1) / 3) * skirtSpan;
    const tMid = Math.max(0.05, (CANOPY_SPEC.ascentOuterX - x1) / Math.max(1, ascentSpan));
    const h = Math.max(0.55, pH * tMid * 0.96);
    const crib = new THREE.Mesh(
      new THREE.BoxGeometry(x1 - x0, h, CANOPY_SPEC.ascentHalfZ * 2 - 0.16),
      cIdx % 2 === 0 ? mats.boughMat : rockCribMat
    );
    crib.position.set(sx * ((x0 + x1) / 2), h / 2, 0);
    crib.castShadow = true;
    crib.receiveShadow = true;
    addAnimeOutline(crib, new THREE.Vector3(1.02, 1.03, 1.02), 0x0f172a);
    worldGroup.add(crib);
  }
}

function buildSkyLaunchPierAndBoughs(sz, mats, pH, launchRun, launchDrop) {
  const worldGroup = worldState.worldGroup;
  const pierRockMat = createToonMat(0x475569);
  const pierTrimMat = createToonMat(0x10b981);
  const pierSpan = CANOPY_SPEC.launchPierOuterZ - CANOPY_SPEC.launchPierInnerZ;
  const pierW = CANOPY_SPEC.launchHalfX * 2 + 0.16;

  for (let tIdx = 0; tIdx < 3; tIdx++) {
    const z0 = CANOPY_SPEC.launchPierInnerZ + (tIdx / 3) * pierSpan;
    const z1 = CANOPY_SPEC.launchPierInnerZ + ((tIdx + 1) / 3) * pierSpan;
    const uAtZ = Math.min(1, (z1 - CANOPY_SPEC.launchInnerZ) / Math.max(1, launchRun));
    const h = Math.max(0.8, pH - launchDrop * uAtZ - 0.14);
    const tier = new THREE.Mesh(new THREE.BoxGeometry(pierW, h, z1 - z0), pierRockMat);
    tier.position.set(0, h / 2, sz * ((z0 + z1) / 2));
    tier.castShadow = true;
    tier.receiveShadow = true;
    addAnimeOutline(tier, new THREE.Vector3(1.02, 1.03, 1.02), 0x0f172a);
    worldGroup.add(tier);
  }
  const pierPlinth = new THREE.Mesh(new THREE.BoxGeometry(pierW + 0.28, 0.72, pierSpan + 0.1), pierTrimMat);
  pierPlinth.position.set(0, 0.36, sz * ((CANOPY_SPEC.launchPierInnerZ + CANOPY_SPEC.launchPierOuterZ) / 2));
  pierPlinth.castShadow = true;
  pierPlinth.receiveShadow = true;
  worldGroup.add(pierPlinth);

  [-CANOPY_SPEC.launchHalfX, CANOPY_SPEC.launchHalfX].forEach((rx) => {
    addCanopyRopeSegment(
      { x: rx, y: pH + 0.85, z: sz * CANOPY_SPEC.launchInnerZ },
      { x: rx, y: CANOPY_SPEC.launchLipY + 0.85, z: sz * CANOPY_SPEC.launchOuterZ },
      0.05,
      mats.ropeMat
    );
  });

  [-1, 1].forEach((sx) => {
    const boughX = sx * 2.45;
    const boughZ = sz * (CANOPY_SPEC.launchOuterZ - 0.5);
    const anchorH = Math.max(1.8, CANOPY_SPEC.launchLipY + 0.65);
    const anchorTree = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, anchorH, 8), mats.barkMat);
    anchorTree.position.set(boughX, anchorH / 2, boughZ);
    anchorTree.castShadow = true;
    anchorTree.receiveShadow = true;
    addAnimeOutline(anchorTree, 1.05, 0x1e1b18);
    worldGroup.add(anchorTree);

    addCanopyRopeSegment(
      { x: boughX, y: CANOPY_SPEC.launchLipY - 0.15, z: boughZ },
      { x: 0, y: CANOPY_SPEC.launchLipY - 0.15, z: sz * CANOPY_SPEC.launchOuterZ },
      0.22,
      mats.barkMat
    );

    const thruster = new THREE.Mesh(new THREE.OctahedronGeometry(0.44, 0), mats.crystalMat);
    thruster.position.set(sx * 1.85, CANOPY_SPEC.launchLipY + 0.8, sz * (CANOPY_SPEC.launchOuterZ - 0.2));
    thruster.castShadow = true;
    addAnimeOutline(thruster, 1.07, 0x0f172a);
    worldGroup.add(thruster);

    const twigLeaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.88, 0), mats.leafLightMat);
    twigLeaf.position.set(boughX + sx * 0.45, 0.8, boughZ);
    twigLeaf.scale.set(1.0, 0.65, 1.0);
    worldGroup.add(twigLeaf);
  });
}

function buildSkyLaunchSide(sz, mats, pH, oneWayArrowMat) {
  const worldGroup = worldState.worldGroup;
  const launchRun = CANOPY_SPEC.launchOuterZ - CANOPY_SPEC.launchInnerZ;
  const launchDrop = pH - CANOPY_SPEC.launchLipY;
  const launchAngle = Math.atan2(launchDrop, launchRun);

  for (let i = 0; i < 24; i++) {
    const u = (i + 0.5) / 24;
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(CANOPY_SPEC.launchHalfX * 2, 0.14, 0.72),
      i % 2 === 0 ? mats.bambooLaunchMat : mats.crystalMat
    );
    slat.position.set(0, pH - launchDrop * u - 0.07, sz * (CANOPY_SPEC.launchInnerZ + u * launchRun));
    slat.rotation.x = sz * launchAngle;
    slat.castShadow = true;
    slat.receiveShadow = true;
    addAnimeOutline(slat, new THREE.Vector3(1.02, 1.06, 1.03), 0x0f172a);
    worldGroup.add(slat);
  }

  const archZ = sz * (CANOPY_SPEC.launchInnerZ + 0.08);
  [-CANOPY_SPEC.launchHalfX, CANOPY_SPEC.launchHalfX].forEach((ax) => {
    addCanopyPost(ax, pH, archZ, 2.5, 0.12, mats.warnArchMat);
  });
  addCanopyRopeSegment(
    { x: -CANOPY_SPEC.launchHalfX, y: pH + 2.45, z: archZ },
    { x: CANOPY_SPEC.launchHalfX, y: pH + 2.45, z: archZ },
    0.1,
    mats.warnArchMat
  );
  [0.14, 0.38, 0.62, 0.86].forEach((u) => {
    const chev = new THREE.Mesh(new THREE.CircleGeometry(0.55, 3), oneWayArrowMat);
    chev.rotation.x = -Math.PI / 2 - sz * launchAngle;
    chev.rotation.z = sz < 0 ? Math.PI / 2 : -Math.PI / 2;
    chev.position.set(0, pH - launchDrop * u + 0.055, sz * (CANOPY_SPEC.launchInnerZ + u * launchRun));
    worldGroup.add(chev);
  });

  buildSkyLaunchPierAndBoughs(sz, mats, pH, launchRun, launchDrop);

  const landingRingOuter = new THREE.Mesh(
    new THREE.RingGeometry(2.55, 3.25, 36),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.78, depthWrite: false })
  );
  landingRingOuter.rotation.x = -Math.PI / 2;
  landingRingOuter.position.set(0, 0.072, sz * CANOPY_SPEC.launchLandingZ);
  worldGroup.add(landingRingOuter);

  const landingRingInner = new THREE.Mesh(
    new THREE.RingGeometry(1.35, 1.75, 24),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false })
  );
  landingRingInner.rotation.x = -Math.PI / 2;
  landingRingInner.position.set(0, 0.076, sz * CANOPY_SPEC.launchLandingZ);
  worldGroup.add(landingRingInner);
}

export function createCanopyTreeNetwork() {
  if (!CANOPY_SPEC.hasCanopy) return;
  const mats = createCanopyMaterials(getActiveMapMeta());
  const pH = CANOPY_SPEC.deckY;
  const cH = CANOPY_SPEC.centerHalfX;
  const crownBaseY = Math.max(16.2, pH + 9.4);
  const crownTopOffset = crownBaseY - 16.2;

  buildSpiritTreeBase(mats, pH, cH, crownTopOffset);
  buildCanopyDecks(mats, pH);
  buildCanopyTrunks(mats, pH, crownBaseY, crownTopOffset);
  CANOPY_SPEC.bridges.forEach((b) => buildSuspendedBridge(b, mats, pH));
  [-1, 1].forEach((sx) => buildAscentRampSide(sx, mats, pH));

  const oneWayArrowMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92
  });
  [-1, 1].forEach((sz) => buildSkyLaunchSide(sz, mats, pH, oneWayArrowMat));
}
