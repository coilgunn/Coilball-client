import { darkenDecorHex, createToonMat, createBasicMat, addAnimeOutline } from '../render3d.js';
import { PARK_LANDMARKS } from './map_catalog.js';
import { getTerrainY } from './terrain.js';
import { registerCameraTreeOccluder } from './mesh_utils.js';
import { THREE, worldState } from './shared.js';

function buildLaFontaineFountain(fx, mats) {
  const fountainMat = createToonMat(0xf1f5f9);
  const sprayMat = createBasicMat({ color: 0xe0f2fe, transparent: true, opacity: 0.78 });
  const fg = new THREE.Group();
  fg.position.set(fx, 0, 0);

  const outerBasin = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.25, 0.55, 20), mats.stoneMat);
  outerBasin.position.y = 0.28;
  addAnimeOutline(outerBasin, 1.03, 0x334155);
  fg.add(outerBasin);

  const basinWater = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.75, 0.14, 20), mats.waterShimmerMat);
  basinWater.position.y = 0.54;
  fg.add(basinWater);

  const colLower = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.92, 1.4, 14), fountainMat);
  colLower.position.y = 1.2;
  addAnimeOutline(colLower, 1.04, 0x334155);
  fg.add(colLower);

  const bowlMid = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 0.95, 0.46, 18), fountainMat);
  bowlMid.position.y = 1.95;
  addAnimeOutline(bowlMid, 1.04, 0x334155);
  fg.add(bowlMid);

  const colUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 1.15, 12), fountainMat);
  colUpper.position.y = 2.65;
  fg.add(colUpper);

  const bowlTop = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 0.5, 0.36, 16), fountainMat);
  bowlTop.position.y = 3.28;
  addAnimeOutline(bowlTop, 1.04, 0x334155);
  fg.add(bowlTop);

  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.1, 14), sprayMat);
  plume.position.y = 4.25;
  fg.add(plume);

  const splashRing = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.45, 24), mats.waterEdgeMat);
  splashRing.rotation.x = -Math.PI / 2;
  splashRing.position.y = 0.04;
  fg.add(splashRing);

  worldState.worldGroup.add(fg);
}

function buildLaFontaineBridge(lf) {
  const worldGroup = worldState.worldGroup;
  const bridgeDeckMat = createToonMat(0xb45309);
  const bridgeTrimMat = createToonMat(0xe2e8f0);
  const lampGlowMat = createToonMat(0xfef08a, { emissive: 0xfacc15, emissiveIntensity: 0.8 });
  const deckSteps = 16;
  const stepSpan = (lf.bridgeHalfZ * 2) / deckSteps;

  for (let i = 0; i < deckSteps; i++) {
    const sz = -lf.bridgeHalfZ + (i + 0.5) * stepSpan;
    const sy = getTerrainY(0, sz, 'lafontaine');
    const slope = Math.atan2(
      getTerrainY(0, -lf.bridgeHalfZ + (i + 1) * stepSpan, 'lafontaine') -
        getTerrainY(0, -lf.bridgeHalfZ + i * stepSpan, 'lafontaine'),
      stepSpan
    );
    const plank = new THREE.Mesh(new THREE.BoxGeometry(lf.bridgeHalfX * 2, 0.36, stepSpan + 0.16), bridgeDeckMat);
    plank.position.set(0, sy - 0.14, sz);
    plank.rotation.x = -slope;
    plank.receiveShadow = true;
    plank.castShadow = true;
    worldGroup.add(plank);

    [-lf.bridgeHalfX - 0.2, lf.bridgeHalfX + 0.2].forEach((px) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.95, stepSpan + 0.12), bridgeTrimMat);
      wall.position.set(px, sy + 0.32, sz);
      wall.rotation.x = -slope;
      addAnimeOutline(wall, 1.03, 0x334155);
      worldGroup.add(wall);
    });
  }

  [-lf.bridgeHalfZ + 0.4, lf.bridgeHalfZ - 0.4].forEach((pz) => {
    const py = getTerrainY(0, pz, 'lafontaine');
    [-lf.bridgeHalfX - 0.25, lf.bridgeHalfX + 0.25].forEach((px) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.75, 0.7), bridgeTrimMat);
      post.position.set(px, py + 0.75, pz);
      addAnimeOutline(post, 1.04, 0x1e293b);
      worldGroup.add(post);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), lampGlowMat);
      lantern.position.set(px, py + 1.82, pz);
      worldGroup.add(lantern);
    });
  });
}

export function buildLaFontaineLandmarks(mats) {
  const worldGroup = worldState.worldGroup;
  const lf = PARK_LANDMARKS.lafontaine;

  const pondSurface = new THREE.Mesh(new THREE.CircleGeometry(1, 56), mats.waterMat);
  pondSurface.rotation.x = -Math.PI / 2;
  pondSurface.scale.set(lf.pondRx, lf.pondRz, 1);
  pondSurface.position.set(0, 0.036, 0);
  worldGroup.add(pondSurface);

  const innerWater = new THREE.Mesh(new THREE.CircleGeometry(1, 44), mats.waterShimmerMat);
  innerWater.rotation.x = -Math.PI / 2;
  innerWater.scale.set(lf.pondRx * 0.82, lf.pondRz * 0.76, 1);
  innerWater.position.set(0, 0.044, 0);
  worldGroup.add(innerWater);

  for (let i = 0; i < 64; i++) {
    const theta = (i / 64) * Math.PI * 2;
    const px = Math.cos(theta) * (lf.pondRx + 0.35);
    const pz = Math.sin(theta) * (lf.pondRz + 0.35);
    if (Math.abs(px) < lf.bridgeHalfX + 0.85) continue;
    const block = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 1.45), mats.stoneMat);
    block.position.set(px, 0.21, pz);
    block.rotation.y = Math.atan2(Math.cos(theta) * lf.pondRz, -Math.sin(theta) * lf.pondRx);
    addAnimeOutline(block, 1.03, 0x334155);
    worldGroup.add(block);
  }

  buildLaFontaineFountain(-lf.fountainX, mats);
  buildLaFontaineFountain(lf.fountainX, mats);
  buildLaFontaineBridge(lf);

  [-69, 69].forEach((pz) => {
    const amphFloor = new THREE.Mesh(new THREE.CircleGeometry(14, 24, 0, Math.PI), mats.stoneMat);
    amphFloor.rotation.x = -Math.PI / 2;
    if (pz > 0) amphFloor.rotation.z = Math.PI;
    amphFloor.position.set(0, 0.01, pz);
    worldGroup.add(amphFloor);
  });
}

function buildJarryGazeboWalls(gaz, whiteWoodMat, benchWoodMat, filigreeBlueMat, gazRoofGroup) {
  const postRadius = 4.18;
  const sideCount = 8;
  for (let i = 0; i < sideCount; i++) {
    const a0 = ((i + 0.5) / sideCount) * Math.PI * 2;
    const a1 = ((i + 1.5) / sideCount) * Math.PI * 2;
    const x0 = Math.cos(a0) * postRadius;
    const z0 = Math.sin(a0) * postRadius;
    const x1 = Math.cos(a1) * postRadius;
    const z1 = Math.sin(a1) * postRadius;

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.25, 8), whiteWoodMat);
    post.position.set(x0, 2.65, z0);
    post.castShadow = true;
    addAnimeOutline(post, 1.05, 0x334155);
    gaz.add(post);

    const midX = (x0 + x1) / 2;
    const midZ = (z0 + z1) / 2;
    const span = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);

    const frieze = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, span), filigreeBlueMat);
    frieze.position.set(midX, 3.98, midZ);
    frieze.rotation.y = yaw;
    addAnimeOutline(frieze, 1.02, 0x475569);
    gaz.add(frieze);

    if (Math.abs(midZ) > 1.2) {
      [1.48, 1.98].forEach((ry) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, span), whiteWoodMat);
        rail.position.set(midX, ry, midZ);
        rail.rotation.y = yaw;
        gaz.add(rail);
      });
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, span * 0.84), benchWoodMat);
      bench.position.set(midX * 0.86, 1.44, midZ * 0.86);
      bench.rotation.y = yaw;
      gaz.add(bench);
    }

    const hip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 5.3), whiteWoodMat);
    hip.position.set(x0 * 0.55, 5.75, z0 * 0.55);
    hip.rotation.y = Math.atan2(x0, z0);
    hip.rotation.x = 0.57;
    gazRoofGroup.add(hip);
  }
}

function buildJarryGazeboRoof(gazRoofGroup, whiteWoodMat, greenRoofMat) {
  const gazRoof = new THREE.Mesh(new THREE.ConeGeometry(4.95, 3.05, 8), greenRoofMat);
  gazRoof.rotation.y = Math.PI / 8;
  gazRoof.position.y = 5.72;
  gazRoof.castShadow = true;
  addAnimeOutline(gazRoof, 1.02, 0x0f172a);
  gazRoofGroup.add(gazRoof);

  const roofEaveRim = new THREE.Mesh(new THREE.CylinderGeometry(4.88, 4.92, 0.16, 8), whiteWoodMat);
  roofEaveRim.rotation.y = Math.PI / 8;
  roofEaveRim.position.y = 4.24;
  gazRoofGroup.add(roofEaveRim);

  const finialPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, 0.95, 8), whiteWoodMat);
  finialPole.position.y = 7.62;
  addAnimeOutline(finialPole, 1.05, 0x334155);
  gazRoofGroup.add(finialPole);

  const finialBall = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), whiteWoodMat);
  finialBall.position.y = 7.72;
  gazRoofGroup.add(finialBall);
}

export function buildJarryLandmarks() {
  const worldGroup = worldState.worldGroup;
  const clayMat = new THREE.MeshBasicMaterial({
    color: darkenDecorHex(0xea580c, 0.56),
    transparent: true,
    opacity: 0.26,
    depthWrite: false
  });
  [
    [0, -61, 148, 3.6],
    [0, 61, 148, 3.6],
    [-72, 0, 3.6, 125.6],
    [72, 0, 3.6, 125.6]
  ].forEach(([tx, tz, tw, td]) => {
    const trackSeg = new THREE.Mesh(new THREE.PlaneGeometry(tw, td), clayMat);
    trackSeg.rotation.x = -Math.PI / 2;
    trackSeg.position.set(tx, 0.02, tz);
    worldGroup.add(trackSeg);
  });

  const gaz = new THREE.Group();
  const gazRoofGroup = new THREE.Group();
  const whiteWoodMat = createToonMat(0xf8fafc);
  const deckWoodMat = createToonMat(0x78716c);
  const latticeDarkMat = createToonMat(0x475569);
  const benchWoodMat = createToonMat(0x78350f);
  const filigreeBlueMat = createToonMat(0xb8d4dc);
  const greenRoofMat = createToonMat(0x2d6a4f);

  const gazPlinth = new THREE.Mesh(new THREE.CylinderGeometry(4.55, 4.65, 0.92, 8), latticeDarkMat);
  gazPlinth.rotation.y = Math.PI / 8;
  gazPlinth.position.y = 0.46;
  gazPlinth.castShadow = true;
  gazPlinth.receiveShadow = true;
  addAnimeOutline(gazPlinth, 1.03, 0x1e293b);
  gaz.add(gazPlinth);

  const deckFloor = new THREE.Mesh(new THREE.CylinderGeometry(4.58, 4.58, 0.14, 8), deckWoodMat);
  deckFloor.rotation.y = Math.PI / 8;
  deckFloor.position.y = 0.98;
  deckFloor.receiveShadow = true;
  gaz.add(deckFloor);

  [-1, 1].forEach((sx) => {
    for (let st = 0; st < 3; st++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 2.2), deckWoodMat);
      step.position.set(sx * (4.55 + st * 0.45), 0.72 - st * 0.24, 0);
      gaz.add(step);
    }
  });

  buildJarryGazeboWalls(gaz, whiteWoodMat, benchWoodMat, filigreeBlueMat, gazRoofGroup);
  buildJarryGazeboRoof(gazRoofGroup, whiteWoodMat, greenRoofMat);

  gaz.add(gazRoofGroup);
  worldGroup.add(gaz);
  registerCameraTreeOccluder(gazRoofGroup, 0, 4.1, 8.2, 0, 4.8);
}
