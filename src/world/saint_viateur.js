import { createToonMat, addAnimeOutline } from '../render3d.js';
import { PARK_LANDMARKS } from './map_catalog.js';
import { getTerrainY } from './terrain.js';
import { registerCameraTreeOccluder } from './mesh_utils.js';
import { THREE, worldState } from './shared.js';

function buildSaintViateurPondAndCurbs(sv, mats) {
  const worldGroup = worldState.worldGroup;

  const svPond = new THREE.Mesh(new THREE.CircleGeometry(1, 56), mats.waterMat);
  svPond.rotation.x = -Math.PI / 2;
  svPond.scale.set(sv.pondRx, sv.pondRz, 1);
  svPond.position.set(0, 0.036, 0);
  worldGroup.add(svPond);

  const svPondShimmer = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mats.waterShimmerMat);
  svPondShimmer.rotation.x = -Math.PI / 2;
  svPondShimmer.scale.set((sv.islandRx + sv.pondRx) * 0.5, (sv.islandRz + sv.pondRz) * 0.5, 1);
  svPondShimmer.position.set(0, 0.044, 0);
  worldGroup.add(svPondShimmer);

  const islandDeck = new THREE.Mesh(new THREE.CircleGeometry(1, 48), createToonMat(0x22c55e));
  islandDeck.rotation.x = -Math.PI / 2;
  islandDeck.scale.set(sv.islandRx, sv.islandRz, 1);
  islandDeck.position.set(0, 0.056, 0);
  islandDeck.receiveShadow = true;
  worldGroup.add(islandDeck);

  const plazaRing = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.92, 44), mats.stoneMat);
  plazaRing.rotation.x = -Math.PI / 2;
  plazaRing.scale.set(sv.islandRx, sv.islandRz, 1);
  plazaRing.position.set(0, 0.064, 0);
  worldGroup.add(plazaRing);

  [
    { rx: sv.pondRx + 0.35, rz: sv.pondRz + 0.35, count: 56 },
    { rx: sv.islandRx - 0.25, rz: sv.islandRz - 0.25, count: 40 }
  ].forEach(({ rx, rz, count }) => {
    for (let i = 0; i < count; i++) {
      const theta = (i / count) * Math.PI * 2;
      const px = Math.cos(theta) * rx;
      const pz = Math.sin(theta) * rz;
      if (Math.abs(pz) < sv.bridgeHalfZ + 0.72) continue;
      const curb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.38, 0.9), mats.stoneMat);
      curb.position.set(px, 0.2, pz);
      curb.rotation.y = Math.atan2(Math.cos(theta) * rz, -Math.sin(theta) * rx);
      addAnimeOutline(curb, 1.03, 0x334155);
      worldGroup.add(curb);
    }
  });
}

function buildSaintViateurBridges(sv, stoneMat) {
  const worldGroup = worldState.worldGroup;
  const svBridgeDeckMat = createToonMat(0xb45309);
  const svLampMat = createToonMat(0xfef08a, { emissive: 0xfacc15, emissiveIntensity: 0.8 });

  [-1, 1].forEach((sideX) => {
    const steps = 9;
    const stepSpan = (sv.bridgeOuterX - sv.bridgeInnerX) / steps;
    for (let i = 0; i < steps; i++) {
      const ax = sv.bridgeInnerX + (i + 0.5) * stepSpan;
      const sx = sideX * ax;
      const sy = getTerrainY(sx, 0, 'saint-viateur');
      const slope = Math.atan2(
        getTerrainY(sideX * (sv.bridgeInnerX + (i + 1) * stepSpan), 0, 'saint-viateur') -
          getTerrainY(sideX * (sv.bridgeInnerX + i * stepSpan), 0, 'saint-viateur'),
        stepSpan
      );
      const plank = new THREE.Mesh(new THREE.BoxGeometry(stepSpan + 0.16, 0.34, sv.bridgeHalfZ * 2), svBridgeDeckMat);
      plank.position.set(sx, sy - 0.12, 0);
      plank.rotation.z = sideX * slope;
      plank.receiveShadow = true;
      plank.castShadow = true;
      worldGroup.add(plank);

      [-sv.bridgeHalfZ - 0.2, sv.bridgeHalfZ + 0.2].forEach((pz) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(stepSpan + 0.12, 0.88, 0.4), stoneMat);
        wall.position.set(sx, sy + 0.28, pz);
        wall.rotation.z = sideX * slope;
        addAnimeOutline(wall, 1.03, 0x334155);
        worldGroup.add(wall);
      });
    }
    [sv.bridgeInnerX + 0.35, sv.bridgeOuterX - 0.35].forEach((ax) => {
      const px = sideX * ax;
      const py = getTerrainY(px, 0, 'saint-viateur');
      [-sv.bridgeHalfZ - 0.22, sv.bridgeHalfZ + 0.22].forEach((pz) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.65, 0.65), stoneMat);
        post.position.set(px, py + 0.72, pz);
        addAnimeOutline(post, 1.04, 0x1e293b);
        worldGroup.add(post);
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), svLampMat);
        lantern.position.set(px, py + 1.72, pz);
        worldGroup.add(lantern);
      });
    });
  });
}

function addChaletArcadeBay(chaletGroup, cfg, stuccoMat) {
  const { bx, bz, rotY, width, isWideArch } = cfg;
  const bay = new THREE.Group();
  bay.position.set(bx, 0.9, bz);
  bay.rotation.y = rotY;
  const pierW = isWideArch ? width * 0.16 : width * 0.28;
  const pillarH = 3.55;

  [-width / 2 + pierW / 2, width / 2 - pierW / 2].forEach((px) => {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(pierW, pillarH, 0.65), stuccoMat);
    pier.position.set(px, pillarH / 2, 0);
    pier.castShadow = true;
    pier.receiveShadow = true;
    bay.add(pier);
  });

  const lintelH = isWideArch ? 0.85 : 1.05;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(width, lintelH, 0.65), stuccoMat);
  lintel.position.set(0, pillarH - lintelH / 2, 0);
  lintel.castShadow = true;
  bay.add(lintel);

  const archShoulderW = width * 0.22;
  [-width * 0.26, width * 0.26].forEach((ax) => {
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(archShoulderW, 0.35, 0.6), stuccoMat);
    shoulder.position.set(ax, pillarH - lintelH - 0.12, 0);
    bay.add(shoulder);
  });
  chaletGroup.add(bay);
}

function buildChaletPlinthAndWalls(chaletGroup, stuccoMat) {
  const plinthMat = createToonMat(0x9ca3af);
  const interiorShadowMat = createToonMat(0x1f2428);
  const lanternLightMat = createToonMat(0xfde68a, { emissive: 0xfbbf24, emissiveIntensity: 0.75 });

  const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.9, 12.4), plinthMat);
  basePlinth.position.y = 0.45;
  basePlinth.castShadow = true;
  basePlinth.receiveShadow = true;
  addAnimeOutline(basePlinth, 1.02, 0x334155);
  chaletGroup.add(basePlinth);

  [-1, 1].forEach((sideZ) => {
    for (let s = 0; s < 3; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(15.6 + s * 0.45, 0.24, 0.75), plinthMat);
      step.position.set(0, 0.62 - s * 0.24, sideZ * (6.45 + s * 0.62));
      step.receiveShadow = true;
      chaletGroup.add(step);
    }
    [-8.15, 8.15].forEach((cx) => {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.72, 2.25), plinthMat);
      cheek.position.set(cx, 0.36, sideZ * 7.15);
      chaletGroup.add(cheek);
    });
  });

  const coreBlock = new THREE.Mesh(new THREE.BoxGeometry(14.4, 3.6, 9.6), interiorShadowMat);
  coreBlock.position.y = 2.7;
  chaletGroup.add(coreBlock);

  [-5.9, 5.9].forEach((fz) => {
    const rotY = fz > 0 ? 0 : Math.PI;
    [-6.0, -3.0, 0, 3.0, 6.0].forEach((ax) => addChaletArcadeBay(chaletGroup, { bx: ax, bz: fz, rotY, width: 2.55, isWideArch: true }, stuccoMat));
    [-7.75, 7.75].forEach((cx) => addChaletArcadeBay(chaletGroup, { bx: cx, bz: fz, rotY, width: 0.95, isWideArch: false }, stuccoMat));
    const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.32), lanternLightMat);
    sconce.position.set(0, 4.12, fz + (fz > 0 ? 0.45 : -0.45));
    chaletGroup.add(sconce);
  });

  [-8.25, 8.25].forEach((fx) => {
    const rotY = fx > 0 ? Math.PI / 2 : -Math.PI / 2;
    [-3.4, 0, 3.4].forEach((az) => addChaletArcadeBay(chaletGroup, { bx: fx, bz: az, rotY, width: 2.85, isWideArch: true }, stuccoMat));
    [-5.1, 5.1].forEach((cz) => addChaletArcadeBay(chaletGroup, { bx: fx, bz: cz, rotY, width: 1.1, isWideArch: false }, stuccoMat));
    const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.32), lanternLightMat);
    sconce.position.set(fx + (fx > 0 ? 0.45 : -0.45), 4.12, 0);
    chaletGroup.add(sconce);
  });
}

function buildChaletRoof(chaletRoofGroup, stuccoMat) {
  const slateRoofMat = createToonMat(0x475569);
  const roofTrimMat = createToonMat(0x334155);
  const woodWindowMat = createToonMat(0x7c4a2d);
  const windowGlassMat = createToonMat(0x1e293b, { emissive: 0x334155, emissiveIntensity: 0.22 });

  const eaveTrim = new THREE.Mesh(new THREE.BoxGeometry(18.1, 0.24, 13.3), roofTrimMat);
  eaveTrim.position.y = 4.55;
  addAnimeOutline(eaveTrim, 1.02, 0x0f172a);
  chaletRoofGroup.add(eaveTrim);

  const mainRoof = new THREE.Mesh(new THREE.ConeGeometry(10.8, 2.35, 4), slateRoofMat);
  mainRoof.rotation.y = Math.PI / 4;
  mainRoof.scale.set(1.22, 1, 0.92);
  mainRoof.position.y = 5.75;
  mainRoof.castShadow = true;
  addAnimeOutline(mainRoof, 1.02, 0x0f172a);
  chaletRoofGroup.add(mainRoof);

  [-6.55, 6.55].forEach((gz) => {
    const brow = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 1.8, 12, 1, false, -Math.PI / 2, Math.PI), slateRoofMat);
    brow.rotation.x = Math.PI / 2;
    brow.scale.set(1.35, 1, 0.38);
    brow.position.set(0, 4.68, gz > 0 ? 5.65 : -5.65);
    chaletRoofGroup.add(brow);
  });
  [-8.8, 8.8].forEach((gx) => {
    const brow = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.3, 1.6, 12, 1, false, -Math.PI / 2, Math.PI), slateRoofMat);
    brow.rotation.z = Math.PI / 2;
    brow.rotation.y = Math.PI / 2;
    brow.scale.set(1.3, 1, 0.36);
    brow.position.set(gx > 0 ? 7.9 : -7.9, 4.68, 0);
    chaletRoofGroup.add(brow);
  });

  const cupolaBase = new THREE.Mesh(new THREE.BoxGeometry(6.3, 2.4, 5.3), stuccoMat);
  cupolaBase.position.y = 7.25;
  cupolaBase.castShadow = true;
  addAnimeOutline(cupolaBase, 1.02, 0x334155);
  chaletRoofGroup.add(cupolaBase);

  [
    [0, 7.35, 2.68, 0, 3.6],
    [0, 7.35, -2.68, Math.PI, 3.6],
    [3.18, 7.35, 0, Math.PI / 2, 2.8],
    [-3.18, 7.35, 0, -Math.PI / 2, 2.8]
  ].forEach(([wx, wy, wz, wrot, ww]) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.25, 1.45, 0.14), woodWindowMat);
    frame.position.set(wx, wy, wz);
    frame.rotation.y = wrot;
    chaletRoofGroup.add(frame);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(ww - 0.08, 1.18, 0.18), windowGlassMat);
    glass.position.set(wx, wy, wz);
    glass.rotation.y = wrot;
    chaletRoofGroup.add(glass);
  });

  const cupolaRoof = new THREE.Mesh(new THREE.ConeGeometry(4.7, 1.35, 4), slateRoofMat);
  cupolaRoof.rotation.y = Math.PI / 4;
  cupolaRoof.scale.set(1.12, 1, 0.95);
  cupolaRoof.position.y = 9.05;
  addAnimeOutline(cupolaRoof, 1.03, 0x0f172a);
  chaletRoofGroup.add(cupolaRoof);

  [-4.2, 4.2].forEach((chx) => {
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.6, 0.92), stuccoMat);
    chimney.position.set(chx, 7.25, -1.65);
    addAnimeOutline(chimney, 1.03, 0x334155);
    chaletRoofGroup.add(chimney);
  });
}

export function buildSaintViateurLandmarks(mats) {
  const worldGroup = worldState.worldGroup;
  const sv = PARK_LANDMARKS.saintViateur;

  buildSaintViateurPondAndCurbs(sv, mats);
  buildSaintViateurBridges(sv, mats.stoneMat);

  const chaletGroup = new THREE.Group();
  const chaletRoofGroup = new THREE.Group();
  const stuccoMat = createToonMat(0xf1efe6);

  buildChaletPlinthAndWalls(chaletGroup, stuccoMat);
  buildChaletRoof(chaletRoofGroup, stuccoMat);

  chaletGroup.add(chaletRoofGroup);
  worldGroup.add(chaletGroup);
  registerCameraTreeOccluder(chaletRoofGroup, 0, 4.5, 9.8, 0, 8.2);

  [-74, 74].forEach((px) => {
    [-64, 64].forEach((pz) => {
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.5, 5.5), mats.stoneMat);
      plinth.position.set(px, 0.25, pz);
      worldGroup.add(plinth);
      [-1.8, 1.8].forEach((cx) => {
        [-1.8, 1.8].forEach((cz) => {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 4.2, 8), mats.stoneMat);
          col.position.set(px + cx, 2.6, pz + cz);
          addAnimeOutline(col, 1.04, 0x334155);
          worldGroup.add(col);
        });
      });
    });
  });
}
