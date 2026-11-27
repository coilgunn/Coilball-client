import { darkenDecorHex, createToonMat, createBasicMat, addAnimeOutline } from '../render3d.js';
import { PARK_LANDMARKS } from './map_catalog.js';
import { getTerrainY } from './terrain.js';
import { registerCameraTreeOccluder } from './mesh_utils.js';
import { buildLaFontaineLandmarks, buildJarryLandmarks } from './montreal_props.js';
import { buildSaintViateurLandmarks } from './saint_viateur.js';
import { buildRiftArenaLandmarks } from './rift_landmarks.js';
import { THREE, worldState } from './shared.js';

function createLandmarkMaterials() {
  return {
    waterMat: new THREE.MeshBasicMaterial({
      color: darkenDecorHex(0x0284c7, 0.56),
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    }),
    waterShimmerMat: new THREE.MeshBasicMaterial({
      color: darkenDecorHex(0x38bdf8, 0.56),
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    }),
    waterEdgeMat: new THREE.MeshBasicMaterial({
      color: darkenDecorHex(0xbae6fd, 0.56),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    }),
    stoneMat: createToonMat(0xe2e8f0),
    darkStoneMat: createToonMat(0x64748b)
  };
}

function buildMontRoyalHillMesh() {
  const hillGeo = new THREE.PlaneGeometry(76, 76, 56, 56);
  hillGeo.rotateX(-Math.PI / 2);
  const posAttr = hillGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const colGrass = new THREE.Color(darkenDecorHex(0x15803d, 0.56));
  const colMidSlope = new THREE.Color(darkenDecorHex(0x22c55e, 0.56));
  const colRock = new THREE.Color(darkenDecorHex(0x64748b, 0.56));
  const colPlateau = new THREE.Color(darkenDecorHex(0xcbd5e1, 0.56));
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = getTerrainY(vx, vz, 'mont-royal');
    posAttr.setY(i, vy > 0.001 ? vy : -0.04);
    const dist = Math.hypot(vx, vz);
    if (dist <= 13.8) tmpColor.copy(colPlateau);
    else if (dist <= 19.5) tmpColor.copy(colRock).lerp(colMidSlope, (dist - 13.8) / 5.7);
    else tmpColor.copy(colMidSlope).lerp(colGrass, Math.min(1, (dist - 19.5) / 15.5));
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  hillGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  hillGeo.computeVertexNormals();

  const hillMesh = new THREE.Mesh(hillGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  hillMesh.receiveShadow = true;
  hillMesh.castShadow = true;
  worldState.worldGroup.add(hillMesh);
}

function addMontRoyalChord(crossGroup, p1, p2, r, steelMat) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  const len = Math.hypot(dx, dy, dz);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), steelMat);
  bar.position.set((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2);
  bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
  crossGroup.add(bar);
}

function buildMontRoyalCrossStructure(crossGroup) {
  const pedMat = createToonMat(0x334155);
  const collarMat = createToonMat(0x1e293b);
  const steelMat = createToonMat(0x475569);
  const innerCrossGlowMat = createToonMat(0xfef08a, { emissive: 0xfacc15, emissiveIntensity: 0.45 });

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 1.2, 1.45, 8), pedMat);
  pedestal.rotation.y = Math.PI / 8;
  pedestal.position.y = 0.72;
  pedestal.castShadow = true;
  addAnimeOutline(pedestal, 1.03, 0x0f172a);
  crossGroup.add(pedestal);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 0.92, 0.36, 8), collarMat);
  collar.rotation.y = Math.PI / 8;
  collar.position.y = 1.54;
  addAnimeOutline(collar, 1.03, 0x0f172a);
  crossGroup.add(collar);

  const mastTopY = 7.4;
  const mastBaseY = 1.68;
  const innerMast = new THREE.Mesh(new THREE.BoxGeometry(0.28, mastTopY - mastBaseY - 0.2, 0.24), innerCrossGlowMat);
  innerMast.position.set(0, (mastBaseY + mastTopY) * 0.5, 0);
  crossGroup.add(innerMast);

  const armY0 = 4.95;
  const armY1 = 5.75;
  const armHalfX = 2.45;
  const armD = 0.34;
  const innerArm = new THREE.Mesh(new THREE.BoxGeometry(armHalfX * 2 - 0.16, 0.28, 0.24), innerCrossGlowMat);
  innerArm.position.set(0, (armY0 + armY1) * 0.5, 0);
  crossGroup.add(innerArm);

  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
    addMontRoyalChord(crossGroup, { x: sx * 0.56, y: mastBaseY, z: sz * 0.42 }, { x: sx * 0.4, y: mastTopY, z: sz * 0.34 }, 0.055, steelMat);
  });
  for (let i = 0; i < 5; i++) {
    const t0 = i / 5;
    const t1 = (i + 1) / 5;
    const y0 = mastBaseY + t0 * (mastTopY - mastBaseY);
    const y1 = mastBaseY + t1 * (mastTopY - mastBaseY);
    const w0 = 0.56 - t0 * 0.16;
    const w1 = 0.56 - t1 * 0.16;
    const d0 = 0.42 - t0 * 0.08;
    const d1 = 0.42 - t1 * 0.08;
    [-d0, d0].forEach((zd, idx) => {
      const zd1 = idx === 0 ? -d1 : d1;
      addMontRoyalChord(crossGroup, { x: -w0, y: y0, z: zd }, { x: w1, y: y1, z: zd1 }, 0.032, steelMat);
      addMontRoyalChord(crossGroup, { x: w0, y: y0, z: zd }, { x: -w1, y: y1, z: zd1 }, 0.032, steelMat);
      addMontRoyalChord(crossGroup, { x: -w1, y: y1, z: zd1 }, { x: w1, y: y1, z: zd1 }, 0.038, steelMat);
    });
  }

  [[armY0, -armD], [armY0, armD], [armY1, -armD], [armY1, armD]].forEach(([ay, az]) => {
    addMontRoyalChord(crossGroup, { x: -armHalfX, y: ay, z: az }, { x: armHalfX, y: ay, z: az }, 0.055, steelMat);
  });
  for (let i = 0; i < 6; i++) {
    const ax0 = -armHalfX + (i / 6) * armHalfX * 2;
    const ax1 = -armHalfX + ((i + 1) / 6) * armHalfX * 2;
    [-armD, armD].forEach((az) => {
      addMontRoyalChord(crossGroup, { x: ax0, y: armY0, z: az }, { x: ax1, y: armY1, z: az }, 0.032, steelMat);
      addMontRoyalChord(crossGroup, { x: ax0, y: armY1, z: az }, { x: ax1, y: armY0, z: az }, 0.032, steelMat);
      addMontRoyalChord(crossGroup, { x: ax0, y: armY0, z: az }, { x: ax0, y: armY1, z: az }, 0.038, steelMat);
    });
  }
  [-armD, armD].forEach((az) => addMontRoyalChord(crossGroup, { x: armHalfX, y: armY0, z: az }, { x: armHalfX, y: armY1, z: az }, 0.038, steelMat));
}

function buildMontRoyalCrossLeds(crossGroup) {
  const ledPalette = [0xfde047, 0xf59e0b, 0xef4444, 0x22c55e, 0x38bdf8, 0xfef08a];
  const ledMats = ledPalette.map((hex) => createBasicMat({ color: hex, keepBright: true }));
  let ledIdx = 0;
  const addLed = (lx, ly, lz) => {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), ledMats[ledIdx % ledMats.length]);
    bulb.position.set(lx, ly, lz);
    crossGroup.add(bulb);
    ledIdx++;
  };
  const mastTopY = 7.4;
  const mastBaseY = 1.68;
  for (let ly = 2.0; ly <= mastTopY; ly += 0.65) {
    const wx = 0.56 - ((ly - mastBaseY) / (mastTopY - mastBaseY)) * 0.16;
    addLed(-wx, ly, 0.42);
    addLed(wx, ly, 0.42);
    addLed(-wx, ly, -0.42);
    addLed(wx, ly, -0.42);
  }
  for (let lx = -2.45; lx <= 2.46; lx += 0.49) {
    addLed(lx, 4.95, 0.36);
    addLed(lx, 5.75, 0.36);
    addLed(lx, 4.95, -0.36);
    addLed(lx, 5.75, -0.36);
  }
  addLed(-0.38, mastTopY + 0.05, 0);
  addLed(0, mastTopY + 0.05, 0);
  addLed(0.38, mastTopY + 0.05, 0);
}

function buildMontRoyalLandmarks(mats) {
  const worldGroup = worldState.worldGroup;
  buildMontRoyalHillMesh();

  const mr = PARK_LANDMARKS.montRoyal;
  const summitY = mr.hillHeight;
  const summitLake = new THREE.Mesh(new THREE.CircleGeometry(1, 32), mats.waterMat);
  summitLake.rotation.x = -Math.PI / 2;
  summitLake.scale.set(mr.lakeRx, mr.lakeRz, 1);
  summitLake.position.set(mr.lakeX, summitY + 0.03, mr.lakeZ);
  worldGroup.add(summitLake);

  const lakeRim = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 32), mats.waterEdgeMat);
  lakeRim.rotation.x = -Math.PI / 2;
  lakeRim.scale.set(mr.lakeRx, mr.lakeRz, 1);
  lakeRim.position.set(mr.lakeX, summitY + 0.045, mr.lakeZ);
  worldGroup.add(lakeRim);

  const crossGroup = new THREE.Group();
  crossGroup.position.set(mr.crossX, summitY, mr.crossZ);
  buildMontRoyalCrossStructure(crossGroup);
  buildMontRoyalCrossLeds(crossGroup);
  worldGroup.add(crossGroup);
  registerCameraTreeOccluder(crossGroup, mr.crossX, summitY + 1.5, summitY + 7.6, mr.crossZ, 2.8);

  const olmstedMat = new THREE.MeshBasicMaterial({
    color: darkenDecorHex(0xfde68a, 0.56),
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  });
  [
    [-38, -14, 24, 2.4, 0.45],
    [-34, 14, 24, 2.4, -0.45],
    [34, -14, 24, 2.4, -0.45],
    [38, 14, 24, 2.4, 0.45]
  ].forEach(([ox, oz, w, d, rot]) => {
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(w, d), olmstedMat);
    trail.rotation.x = -Math.PI / 2;
    trail.rotation.z = rot;
    trail.position.set(ox, 0.03, oz);
    worldGroup.add(trail);
  });
}

export function buildMontrealParkLandmarks(mapMeta) {
  const style = mapMeta.decorStyle || 'classic';
  const mats = createLandmarkMaterials();

  if (style === 'lafontaine') buildLaFontaineLandmarks(mats);
  else if (style === 'saint-viateur') buildSaintViateurLandmarks(mats);
  else if (style === 'jarry') buildJarryLandmarks();
  else if (style === 'mont-royal') buildMontRoyalLandmarks(mats);
  else if (style === 'rift') buildRiftArenaLandmarks(mapMeta, mats);
}
