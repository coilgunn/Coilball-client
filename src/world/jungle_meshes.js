import { state } from '../state.js';
import { createToonMat, createBasicMat, addAnimeOutline } from '../render3d.js';
import { getActiveMapMeta } from './map_catalog.js';
import { getTerrainY } from './terrain.js';
import { registerCameraTreeOccluder } from './mesh_utils.js';
import { THREE, worldState } from './shared.js';

function addJungleRockAndRing(group, obs, mapMeta, rockHeight, runeHex) {
  const baseRock = new THREE.Mesh(
    new THREE.CylinderGeometry(obs.radius * 0.86, obs.radius * 0.98, rockHeight, 9),
    createToonMat(mapMeta.rockHex || 0x334155)
  );
  baseRock.position.y = rockHeight / 2;
  baseRock.castShadow = true;
  baseRock.receiveShadow = true;
  addAnimeOutline(baseRock, 1.04, 0x0f172a);
  group.add(baseRock);

  const mossCap = new THREE.Mesh(
    new THREE.CylinderGeometry(obs.radius * 0.89, obs.radius * 0.89, 0.34, 9),
    createToonMat(0x16a34a)
  );
  mossCap.position.y = rockHeight + 0.14;
  mossCap.receiveShadow = true;
  addAnimeOutline(mossCap, 1.03, 0x0f172a);
  group.add(mossCap);

  const rimRing = new THREE.Mesh(
    new THREE.RingGeometry(obs.radius - 0.16, obs.radius + 0.04, 28),
    createBasicMat({ color: runeHex, side: THREE.DoubleSide, transparent: true, opacity: 0.72 })
  );
  rimRing.rotation.x = -Math.PI / 2;
  rimRing.position.y = 0.035;
  group.add(rimRing);
}

function addJungleTreeCrown(group, obs, mapMeta, rockHeight, runeHex) {
  const trunkBaseH = 1.65;
  const trunkBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.56, trunkBaseH, 7),
    createToonMat(0x5c4033)
  );
  trunkBase.position.y = rockHeight + trunkBaseH / 2 + 0.12;
  trunkBase.castShadow = true;
  addAnimeOutline(trunkBase, 1.05, 0x1e1b18);
  group.add(trunkBase);

  const upperTrunkStartY = rockHeight + trunkBaseH + 0.12;
  const upperTrunkH = 11.0;
  const trunkUpper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.42, upperTrunkH, 7),
    createToonMat(0x5c4033)
  );
  trunkUpper.position.y = upperTrunkStartY + upperTrunkH / 2;
  trunkUpper.castShadow = true;
  addAnimeOutline(trunkUpper, 1.05, 0x1e1b18);
  group.add(trunkUpper);
  registerCameraTreeOccluder(trunkUpper, obs.x, upperTrunkStartY, upperTrunkStartY + upperTrunkH, obs.z, 0.85);

  const isShrine = obs.kind === 'shrine';
  const foliagePrimary = isShrine ? (mapMeta.foliageShrineHex || 0x10b981) : (mapMeta.foliagePrimaryHex || 0xf472b6);
  const foliageSecondary = isShrine ? (mapMeta.foliageShrineSecHex || 0x34d399) : (mapMeta.foliageSecondaryHex || 0xf9a8d4);
  const crownY = upperTrunkStartY + upperTrunkH + 1.05;
  const crownR = obs.radius * 0.92;
  const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(crownR, 1), createToonMat(foliagePrimary));
  crown.position.y = crownY;
  crown.scale.set(1.08, 0.68, 1.08);
  crown.castShadow = true;
  addAnimeOutline(crown, 1.045, 0x0f172a);
  group.add(crown);
  registerCameraTreeOccluder(crown, obs.x, crownY, crownY, obs.z, crownR * 1.12);

  const crownTopY = crownY + 1.15;
  const crownTopR = obs.radius * 0.62;
  const crownTop = new THREE.Mesh(new THREE.DodecahedronGeometry(crownTopR, 1), createToonMat(foliageSecondary));
  crownTop.position.set(0.55, crownTopY, -0.35);
  crownTop.scale.set(1.05, 0.68, 1.05);
  crownTop.castShadow = true;
  addAnimeOutline(crownTop, 1.045, 0x0f172a);
  group.add(crownTop);
  registerCameraTreeOccluder(crownTop, obs.x + 0.55, crownTopY, crownTopY, obs.z - 0.35, crownTopR * 1.1);

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.45, 0),
    createToonMat(runeHex, { emissive: runeHex, emissiveIntensity: 0.5 })
  );
  crystal.position.set(obs.x > 0 ? -obs.radius * 0.45 : obs.radius * 0.45, rockHeight + 0.8, 0);
  crystal.scale.set(0.8, 1.5, 0.8);
  addAnimeOutline(crystal, 1.08, 0x0f172a);
  group.add(crystal);
}

export function createJungleObstacleMesh(obs) {
  if (obs && (obs.kind === 'gazebo' || obs.kind === 'chalet' || obs.kind === 'cross' || obs.kind === 'waterfall')) return;
  const mapMeta = getActiveMapMeta();
  const group = new THREE.Group();
  group.position.set(obs.x, 0, obs.z);

  const isGate = obs.kind === 'gate';
  const isShrine = obs.kind === 'shrine';
  const teamAccentHex = obs.teamSide === 'ally' ? 0xfacc15 : 0xc084fc;
  const runeHex = isGate ? teamAccentHex : isShrine ? 0x38bdf8 : mapMeta.jungleBorderHex;
  const rockHeight = isGate ? 3.2 : 2.35;

  addJungleRockAndRing(group, obs, mapMeta, rockHeight, runeHex);

  if (isGate) {
    const spire = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.68, 0),
      createToonMat(teamAccentHex, { emissive: teamAccentHex, emissiveIntensity: 0.45 })
    );
    spire.position.y = rockHeight + 1.05;
    spire.scale.set(0.85, 1.45, 0.85);
    spire.castShadow = true;
    addAnimeOutline(spire, 1.07, 0x0f172a);
    group.add(spire);
  } else {
    addJungleTreeCrown(group, obs, mapMeta, rockHeight, runeHex);
  }

  worldState.worldGroup.add(group);
}

const BUSH_PALETTES = {
  rift: { padHex: 0x102813, ringHex: 0x65a30d, darkHex: 0x1e4d23, midHex: 0x2f6b2f, lightHex: 0x528f38, outlineHex: 0x091c0b },
  'mont-royal': { padHex: 0x064e3b, ringHex: 0x4ade80, darkHex: 0x14532d, midHex: 0x16a34a, lightHex: 0x65a30d, outlineHex: 0x052e16 },
  'saint-viateur': { padHex: 0x064e3b, ringHex: 0x5eead4, darkHex: 0x15803d, midHex: 0x22c55e, lightHex: 0x84cc16, outlineHex: 0x052e16 },
  lafontaine: { padHex: 0x064e3b, ringHex: 0x4ade80, darkHex: 0x15803d, midHex: 0x16a34a, lightHex: 0x4ade80, outlineHex: 0x052e16 },
  classic: { padHex: 0x064e3b, ringHex: 0x4ade80, darkHex: 0x15803d, midHex: 0x16a34a, lightHex: 0x34d399, outlineHex: 0x052e16 }
};

function createBushPrng(x, z) {
  let seed = (Math.abs(Math.round(x * 73856093)) ^ Math.abs(Math.round(z * 19349663)) ^ 0x9e3779b9) >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function addBushGroundPad(group, bush, pal) {
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(bush.radius, 24),
    createBasicMat({ color: pal.padHex, transparent: true, opacity: 0.72, depthWrite: false })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.028;
  group.add(pad);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(bush.radius - 0.14, bush.radius, 28),
    createBasicMat({ color: pal.ringHex, side: THREE.DoubleSide, transparent: true, opacity: 0.65, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.032;
  group.add(ring);
}

function addBushFoliage(group, ctxObj) {
  const { bush, pal, leafMats, nextRand, lowSpec } = ctxObj;
  const rScale = bush.radius / 2.35;
  const outerPuffCount = lowSpec ? 6 : 7;
  const outlineLimit = lowSpec ? 4 : 6;

  for (let i = 0; i < outerPuffCount; i++) {
    const ang = (i / outerPuffCount) * Math.PI * 2 + (nextRand() - 0.5) * 0.32;
    const dist = (0.56 + nextRand() * 0.2) * bush.radius;
    const puffR = (0.64 + nextRand() * 0.2) * rScale;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(puffR, 0), leafMats[i % 3]);
    const sy = 0.76 + nextRand() * 0.32;
    puff.scale.set(1.12 + nextRand() * 0.18, sy, 0.96 + nextRand() * 0.16);
    puff.position.set(Math.cos(ang) * dist, puffR * sy * 0.78 + 0.14 + nextRand() * 0.18, Math.sin(ang) * dist);
    puff.rotation.set((nextRand() - 0.5) * 0.5, ang + nextRand() * 1.2, (nextRand() - 0.5) * 0.5);
    if (i < outlineLimit) {
      puff.castShadow = true;
      addAnimeOutline(puff, 1.055, pal.outlineHex);
    }
    group.add(puff);
  }

  const innerPuffCount = lowSpec ? 0 : 2;
  for (let i = 0; i < innerPuffCount; i++) {
    const ang = (i / innerPuffCount) * Math.PI * 2 + nextRand() * 1.4;
    const dist = (0.2 + nextRand() * 0.16) * bush.radius;
    const puffR = (0.62 + nextRand() * 0.14) * rScale;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(puffR, 0), leafMats[i]);
    const sy = 0.68 + nextRand() * 0.22;
    puff.scale.set(1.16, sy, 1.08);
    puff.position.set(Math.cos(ang) * dist, puffR * sy * 0.72 + 0.08, Math.sin(ang) * dist);
    puff.rotation.set(nextRand() * 0.4, ang, nextRand() * 0.4);
    group.add(puff);
  }

  const leafCount = lowSpec ? 6 : 12;
  for (let i = 0; i < leafCount; i++) {
    const ang = (i / leafCount) * Math.PI * 2 + (nextRand() - 0.5) * 0.24;
    const dist = (i % 3 === 0 ? 0.34 : 0.62 + nextRand() * 0.22) * bush.radius;
    const h = (1.45 + nextRand() * 0.55) * Math.max(0.88, rScale);
    const w = (0.4 + nextRand() * 0.12) * Math.max(0.88, rScale);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4), leafMats[(i + 1) % 3]);
    leaf.scale.set(1.22, 1.0, 0.34);
    leaf.position.set(Math.cos(ang) * dist, h * 0.46 + 0.06, Math.sin(ang) * dist);
    leaf.rotation.order = 'YXZ';
    leaf.rotation.y = Math.atan2(Math.cos(ang), Math.sin(ang));
    leaf.rotation.x = 0.24 + nextRand() * 0.28;
    leaf.rotation.z = (nextRand() - 0.5) * 0.22;
    group.add(leaf);
  }
}

export function createJungleBrushMesh(bush) {
  const mapMeta = getActiveMapMeta();
  const pal = BUSH_PALETTES[(mapMeta && mapMeta.decorStyle) || 'classic'] || BUSH_PALETTES.classic;
  const lowSpec = !!(state && state.lowSpecMode);
  const group = new THREE.Group();
  group.position.set(bush.x, getTerrainY(bush.x, bush.z), bush.z);

  const nextRand = createBushPrng(bush.x, bush.z);
  addBushGroundPad(group, bush, pal);
  const leafMats = [createToonMat(pal.darkHex), createToonMat(pal.midHex), createToonMat(pal.lightHex)];
  addBushFoliage(group, { bush, pal, leafMats, nextRand, lowSpec });

  worldState.worldGroup.add(group);
}
