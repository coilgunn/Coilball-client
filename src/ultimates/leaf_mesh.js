import { ctx } from '../state.js';
import { scene, spawnParticles } from '../render3d.js';
import { getStructureSurfaceY } from '../world.js';
import {
  LEAF_ULT_SPRINT_DURATION,
  LEAF_ULT_GROW_DELAY,
  LEAF_ULT_WALL_DURATION,
  LEAF_ULT_WALL_RADIUS
} from './shared.js';

const THREE = ctx.THREE;

const BASE_BOUGH_SPECS = [
  { radius: 0.145, baseY: 0.72, ampY: 0.34, ampLat: 0.42, freq: 1.35, phase: 0.0, matIdx: 0 },
  { radius: 0.125, baseY: 1.28, ampY: 0.42, ampLat: 0.46, freq: 1.45, phase: Math.PI, matIdx: 1 },
  { radius: 0.09, baseY: 1.72, ampY: 0.38, ampLat: 0.38, freq: 1.85, phase: 1.1, matIdx: 2 },
  { radius: 0.072, baseY: 0.42, ampY: 0.28, ampLat: 0.5, freq: 2.15, phase: 2.7, matIdx: 3 },
  { radius: 0.06, baseY: 1.05, ampY: 0.52, ampLat: 0.44, freq: 2.6, phase: 4.1, matIdx: 1 }
];

const EVO_BOUGH_SPECS = [
  { radius: 0.22, baseY: 0.55, ampY: 0.26, ampLat: 0.68, freq: 1.4, phase: 0.0, matIdx: 0 },
  { radius: 0.21, baseY: 1.15, ampY: 0.32, ampLat: 0.72, freq: 1.55, phase: Math.PI, matIdx: 1 },
  { radius: 0.20, baseY: 1.80, ampY: 0.36, ampLat: 0.74, freq: 1.65, phase: 1.2, matIdx: 2 },
  { radius: 0.19, baseY: 2.45, ampY: 0.38, ampLat: 0.72, freq: 1.75, phase: 3.9, matIdx: 3 },
  { radius: 0.175, baseY: 3.08, ampY: 0.42, ampLat: 0.70, freq: 1.9, phase: 2.1, matIdx: 0 },
  { radius: 0.155, baseY: 3.58, ampY: 0.35, ampLat: 0.66, freq: 2.1, phase: 5.0, matIdx: 1 },
  { radius: 0.15, baseY: 0.85, ampY: 0.46, ampLat: 0.64, freq: 2.35, phase: 0.8, matIdx: 2 },
  { radius: 0.145, baseY: 1.48, ampY: 0.52, ampLat: 0.66, freq: 2.45, phase: 3.4, matIdx: 3 },
  { radius: 0.14, baseY: 2.12, ampY: 0.54, ampLat: 0.64, freq: 2.65, phase: 1.9, matIdx: 0 },
  { radius: 0.135, baseY: 2.82, ampY: 0.48, ampLat: 0.62, freq: 2.8, phase: 4.5, matIdx: 1 }
];

function detRand(seed) {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function createSproutMesh() {
  const g = new THREE.Group();
  const stemMat = new THREE.MeshToonMaterial({ color: 0x4ade80 });
  const leafMat = new THREE.MeshToonMaterial({ color: 0x22c55e });

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.48, 6), stemMat);
  stem.position.y = 0.24;
  g.add(stem);

  const leafGeo = new THREE.SphereGeometry(0.18, 7, 6);
  leafGeo.scale(1.5, 0.55, 0.9);
  const leftLeaf = new THREE.Mesh(leafGeo, leafMat);
  leftLeaf.position.set(-0.16, 0.42, 0);
  leftLeaf.rotation.z = 0.45;
  g.add(leftLeaf);

  const rightLeaf = new THREE.Mesh(leafGeo, leafMat);
  rightLeaf.position.set(0.16, 0.42, 0);
  rightLeaf.rotation.z = -0.45;
  g.add(rightLeaf);
  return g;
}

export function plantLeafSproutNode(wall, x, y, z) {
  const sprout = createSproutMesh();
  const groundY = getStructureSurfaceY(x, z, false).y;
  const nodeY = Math.max(groundY, y || 0);
  sprout.position.set(x, nodeY, z);
  sprout.rotation.y = Math.random() * Math.PI * 2;
  wall.sproutGroup.add(sprout);
  wall.nodes.push({ x, y: nodeY, z, sprout });
}

export function createLeafWallRecord(caster, evolved) {
  const sprintDur = evolved ? 3.5 : LEAF_ULT_SPRINT_DURATION;
  const wallDur = evolved ? 8.0 : LEAF_ULT_WALL_DURATION;
  const group = new THREE.Group();
  const sproutGroup = new THREE.Group();
  const treeWallGroup = new THREE.Group();
  treeWallGroup.visible = false;
  group.add(sproutGroup);
  group.add(treeWallGroup);
  scene.add(group);

  return {
    caster,
    casterId: caster.id,
    team: caster.team,
    evolved: !!evolved,
    phase: 'sprinting',
    sprintTimer: sprintDur,
    sprintMaxDuration: sprintDur,
    growDelayTimer: LEAF_ULT_GROW_DELAY,
    wallTimer: wallDur,
    wallMaxDuration: wallDur,
    growAnim: 0,
    nodes: [],
    group,
    sproutGroup,
    treeWallGroup,
    ringGroup: null,
    ringMat: null
  };
}

function ensureMinimumLeafNodes(wall) {
  if (wall.nodes.length >= 2 || !wall.caster) return;
  const base = wall.nodes[0] || {
    x: wall.caster.pos.x,
    y: wall.caster.pos.y || 0,
    z: wall.caster.pos.z
  };
  const orient =
    typeof wall.aimAngle === 'number' && Number.isFinite(wall.aimAngle)
      ? wall.aimAngle
      : wall.caster.facingAngle;
  const perpX = Math.cos(orient);
  const perpZ = -Math.sin(orient);
  plantLeafSproutNode(wall, base.x - perpX * 1.65, base.y, base.z - perpZ * 1.65);
  plantLeafSproutNode(wall, base.x + perpX * 1.65, base.y, base.z + perpZ * 1.65);
}

function createLeafWallAssets() {
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x4ade80,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const nodeRingGeo = new THREE.RingGeometry(
    LEAF_ULT_WALL_RADIUS - 0.14,
    LEAF_ULT_WALL_RADIUS + 0.06,
    18
  );
  nodeRingGeo.rotateX(-Math.PI / 2);

  return {
    ringMat,
    nodeRingGeo,
    barkMats: [
      new THREE.MeshToonMaterial({ color: 0x7c6855 }),
      new THREE.MeshToonMaterial({ color: 0x635141 }),
      new THREE.MeshToonMaterial({ color: 0x8c7762 }),
      new THREE.MeshToonMaterial({ color: 0x4c3b2c })
    ],
    foliageMats: [
      new THREE.MeshToonMaterial({ color: 0x16a34a }),
      new THREE.MeshToonMaterial({ color: 0x22c55e }),
      new THREE.MeshToonMaterial({ color: 0x15803d })
    ],
    denseHedgeMats: [
      new THREE.MeshToonMaterial({ color: 0x14532d }),
      new THREE.MeshToonMaterial({ color: 0x166534 }),
      new THREE.MeshToonMaterial({ color: 0x15803d }),
      new THREE.MeshToonMaterial({ color: 0x16a34a })
    ],
    vineLeafGeo: new THREE.IcosahedronGeometry(0.46, 0),
    canopyTuftGeo: new THREE.IcosahedronGeometry(0.72, 1),
    denseHedgePuffGeo: new THREE.IcosahedronGeometry(0.72, 1)
  };
}

function buildLeafNodeRingsAndTangents(wall, ringGroup, ringMat, nodeRingGeo) {
  const nodeTangents = [];
  for (let i = 0; i < wall.nodes.length; i++) {
    const nd = wall.nodes[i];
    const baseRing = new THREE.Mesh(nodeRingGeo, ringMat);
    baseRing.position.set(nd.x, nd.y + 0.04, nd.z);
    ringGroup.add(baseRing);

    const prev = wall.nodes[Math.max(0, i - 1)];
    const next = wall.nodes[Math.min(wall.nodes.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tLen = Math.hypot(tx, tz) || 1;
    tx /= tLen;
    tz /= tLen;
    nodeTangents.push({ tx, tz, nx: -tz, nz: tx });
    spawnParticles(new THREE.Vector3(nd.x, nd.y + 0.8, nd.z), 0x22c55e, 3);
  }
  return nodeTangents;
}

function addCorePuffColumn(treeWallGroup, pos, tiers, assets, seedBase) {
  for (let tIdx = 0; tIdx < tiers.length; tIdx++) {
    const puff = new THREE.Mesh(
      assets.denseHedgePuffGeo,
      assets.denseHedgeMats[(seedBase + tIdx) % assets.denseHedgeMats.length]
    );
    puff.position.set(pos.x, pos.y + tiers[tIdx], pos.z);
    puff.scale.set(0.88, 0.85, 0.88);
    puff.rotation.set(detRand(seedBase * 11 + tIdx) * 0.5, detRand(seedBase * 23 + tIdx) * Math.PI, 0);
    treeWallGroup.add(puff);
  }
}

function buildLeafTrunkAndCanopy(wall, i, tang, assets) {
  const evo = !!wall.evolved;
  const nd = wall.nodes[i];
  const nextNd = wall.nodes[Math.min(wall.nodes.length - 1, i + 1)];
  const leanDir = i % 2 === 0 ? 1 : -1;
  const archX = (nextNd.x - nd.x) * (evo ? 0.55 : 0.42);
  const archZ = (nextNd.z - nd.z) * (evo ? 0.55 : 0.42);
  const sideBow = leanDir * ((evo ? 0.58 : 0.28) + detRand(i * 17) * (evo ? 0.24 : 0.25));
  const topH = (evo ? 3.85 : 2.15) + detRand(i * 19) * (evo ? 0.78 : 0.55);
  const trunkR = (evo ? 0.28 : 0.19) + detRand(i * 5) * 0.07;

  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(nd.x - tang.nx * sideBow * 0.45, nd.y - 0.05, nd.z - tang.nz * sideBow * 0.45),
    new THREE.Vector3(nd.x + tang.nx * sideBow * 0.95 + archX * 0.22, nd.y + topH * 0.34, nd.z + tang.nz * sideBow * 0.95 + archZ * 0.22),
    new THREE.Vector3(nd.x - tang.nx * sideBow * 0.85 + archX * 0.72, nd.y + topH * 0.72, nd.z - tang.nz * sideBow * 0.85 + archZ * 0.72),
    new THREE.Vector3(nd.x + archX * 1.15 + tang.nx * sideBow * 0.52, nd.y + topH, nd.z + archZ * 1.15 + tang.nz * sideBow * 0.52)
  ]);
  const trunkGeo = new THREE.TubeGeometry(trunkCurve, evo ? 12 : 10, trunkR, 5, false);
  wall.treeWallGroup.add(new THREE.Mesh(trunkGeo, assets.barkMats[i % assets.barkMats.length]));

  if (evo && i < wall.nodes.length - 1) {
    const counterCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(nd.x + tang.nx * sideBow * 0.65, nd.y - 0.05, nd.z + tang.nz * sideBow * 0.65),
      new THREE.Vector3(nd.x - tang.nx * sideBow * 0.9 + archX * 0.45, nd.y + topH * 0.38, nd.z - tang.nz * sideBow * 0.9 + archZ * 0.45),
      new THREE.Vector3(nd.x + tang.nx * sideBow * 0.82 + archX * 0.85, nd.y + topH * 0.76, nd.z + tang.nz * sideBow * 0.82 + archZ * 0.85),
      new THREE.Vector3(nextNd.x - tang.nx * sideBow * 0.45, nextNd.y + topH * 0.94, nextNd.z - tang.nz * sideBow * 0.45)
    ]);
    const counterGeo = new THREE.TubeGeometry(counterCurve, 10, 0.21, 5, false);
    wall.treeWallGroup.add(new THREE.Mesh(counterGeo, assets.barkMats[(i + 2) % assets.barkMats.length]));
  }

  const rootCount = evo ? 3 : 2;
  for (let rIdx = 0; rIdx < rootCount; rIdx++) {
    const ang = detRand(i * 29 + rIdx * 11) * Math.PI * 2;
    const rootCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(nd.x, nd.y + (evo ? 0.78 : 0.55), nd.z),
      new THREE.Vector3(nd.x + Math.cos(ang) * 0.36, nd.y + 0.18, nd.z + Math.sin(ang) * 0.36),
      new THREE.Vector3(nd.x + Math.cos(ang) * 0.74, nd.y - 0.02, nd.z + Math.sin(ang) * 0.74)
    ]);
    const rootGeo = new THREE.TubeGeometry(rootCurve, 5, evo ? 0.115 : 0.09, 4, false);
    wall.treeWallGroup.add(new THREE.Mesh(rootGeo, assets.barkMats[(i + rIdx + 1) % assets.barkMats.length]));
  }

  const canopy = new THREE.Mesh(assets.canopyTuftGeo, assets.foliageMats[i % assets.foliageMats.length]);
  canopy.position.set(
    nd.x + archX * 0.95 + (detRand(i * 31) - 0.5) * 0.35,
    nd.y + topH + 0.14,
    nd.z + archZ * 0.95 + (detRand(i * 37) - 0.5) * 0.35
  );
  const canopyMult = evo ? 1.28 : 1.0;
  canopy.scale.set(
    (1.45 + detRand(i * 41) * 0.45) * canopyMult,
    (0.44 + detRand(i * 43) * 0.18) * canopyMult,
    (1.15 + detRand(i * 47) * 0.35) * canopyMult
  );
  canopy.rotation.y = detRand(i * 53) * Math.PI;
  wall.treeWallGroup.add(canopy);

  if (evo) {
    addCorePuffColumn(wall.treeWallGroup, nd, [0.6, 1.5, 2.4, 3.3], assets, i);
    if (i < wall.nodes.length - 1) {
      const midPos = {
        x: (nd.x + nextNd.x) * 0.5,
        y: (nd.y + nextNd.y) * 0.5,
        z: (nd.z + nextNd.z) * 0.5
      };
      addCorePuffColumn(wall.treeWallGroup, midPos, [1.05, 1.95, 2.85, 3.75], assets, i + 2);
    }
  }
}

function buildBoughSplinePoints(wall, nodeTangents, spec, bIdx, assets) {
  const evo = !!wall.evolved;
  const subSteps = 2;
  const totalSamples = (wall.nodes.length - 1) * subSteps + 1;
  const pts = [];

  for (let s = 0; s < totalSamples; s++) {
    const uNode = s / subSteps;
    const i0 = Math.min(wall.nodes.length - 1, Math.floor(uNode));
    const i1 = Math.min(wall.nodes.length - 1, i0 + 1);
    const frac = uNode - i0;
    const n0 = wall.nodes[i0];
    const n1 = wall.nodes[i1];
    const t0 = nodeTangents[i0];
    const t1 = nodeTangents[i1];

    const bx = n0.x + (n1.x - n0.x) * frac;
    const by = n0.y + (n1.y - n0.y) * frac;
    const bz = n0.z + (n1.z - n0.z) * frac;
    const nx = t0.nx + (t1.nx - t0.nx) * frac;
    const nz = t0.nz + (t1.nz - t0.nz) * frac;

    const theta = uNode * spec.freq * Math.PI + spec.phase;
    const jitterLat = (detRand(s * 17 + bIdx * 31) - 0.5) * (evo ? 0.16 : 0.18);
    const jitterY = (detRand(s * 23 + bIdx * 41) - 0.5) * (evo ? 0.18 : 0.16);
    const lat = Math.sin(theta) * spec.ampLat + jitterLat;
    const py = by + Math.max(0.14, spec.baseY + Math.cos(theta * 0.92) * spec.ampY + jitterY);
    pts.push(new THREE.Vector3(bx + nx * lat, py, bz + nz * lat));

    if (bIdx < (evo ? 6 : 3) && s % 3 === 1 && detRand(s * 13 + bIdx * 7) > 0.35) {
      const leafSprig = new THREE.Mesh(
        assets.vineLeafGeo,
        assets.foliageMats[(s + bIdx) % assets.foliageMats.length]
      );
      leafSprig.position.set(bx + nx * (lat * 1.15), py + 0.14, bz + nz * (lat * 1.15));
      leafSprig.scale.set(1.05, 0.52, 0.88);
      leafSprig.rotation.set(detRand(s * 3) * 0.7, detRand(s * 5) * 3.1, detRand(s * 7) * 0.7);
      wall.treeWallGroup.add(leafSprig);
    }
  }
  return pts;
}

export function growLeafWallMesh(wall) {
  ensureMinimumLeafNodes(wall);
  wall.sproutGroup.visible = false;
  wall.treeWallGroup.visible = true;

  const ringGroup = new THREE.Group();
  const assets = createLeafWallAssets();
  wall.group.add(ringGroup);
  wall.ringGroup = ringGroup;
  wall.ringMat = assets.ringMat;

  const nodeTangents = buildLeafNodeRingsAndTangents(wall, ringGroup, assets.ringMat, assets.nodeRingGeo);
  const evo = !!wall.evolved;
  const trunkStep = evo || wall.nodes.length <= 5 ? 1 : 2;
  for (let i = 0; i < wall.nodes.length; i += trunkStep) {
    buildLeafTrunkAndCanopy(wall, i, nodeTangents[i], assets);
  }

  const boughSpecs = evo ? EVO_BOUGH_SPECS : BASE_BOUGH_SPECS;
  const tubularSegs = Math.min(evo ? 64 : 72, Math.max(16, wall.nodes.length * (evo ? 3 : 4)));
  for (let bIdx = 0; bIdx < boughSpecs.length; bIdx++) {
    const spec = boughSpecs[bIdx];
    const pts = buildBoughSplinePoints(wall, nodeTangents, spec, bIdx, assets);
    if (pts.length >= 2) {
      const boughCurve = new THREE.CatmullRomCurve3(pts);
      const radialSegs = evo && bIdx >= 6 ? 4 : 5;
      const boughGeo = new THREE.TubeGeometry(boughCurve, tubularSegs, spec.radius, radialSegs, false);
      wall.treeWallGroup.add(new THREE.Mesh(boughGeo, assets.barkMats[spec.matIdx % assets.barkMats.length]));
    }
  }
}
