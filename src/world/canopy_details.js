import { createToonMat, addAnimeOutline } from '../render3d.js';
import { registerCameraTreeOccluder } from './mesh_utils.js';
import { THREE, CANOPY_SPEC, worldState } from './shared.js';

export function createCanopyMaterials(mapMeta) {
  return {
    barkMat: createToonMat(0x5c4033),
    boughMat: createToonMat(0x78350f),
    plankLightMat: createToonMat(0xd97706),
    plankDarkMat: createToonMat(0xb45309),
    canopyTurfMat: createToonMat(0x10b981),
    ropeMat: createToonMat(0xfde047, { emissive: 0xfacc15, emissiveIntensity: 0.15 }),
    crystalMat: createToonMat(0x38bdf8, { emissive: 0x38bdf8, emissiveIntensity: 0.55 }),
    bambooLaunchMat: createToonMat(0x0284c7, { emissive: 0x0ea5e9, emissiveIntensity: 0.35 }),
    warnArchMat: createToonMat(0xf59e0b, { emissive: 0xfbbf24, emissiveIntensity: 0.55 }),
    sakuraMat: createToonMat(mapMeta.foliagePrimaryHex || 0xf472b6, {
      emissive: mapMeta.foliagePrimaryHex || 0xf472b6,
      emissiveIntensity: 0.14
    }),
    sakuraLightMat: createToonMat(mapMeta.foliageSecondaryHex || 0xf9a8d4),
    leafMat: createToonMat(mapMeta.foliageShrineHex || 0x10b981),
    leafLightMat: createToonMat(mapMeta.foliageShrineSecHex || 0x34d399)
  };
}

export function addCanopyRopeSegment(ptA, ptB, rad, mat) {
  const p1 = new THREE.Vector3(ptA.x, ptA.y, ptA.z);
  const p2 = new THREE.Vector3(ptB.x, ptB.y, ptB.z);
  const len = p1.distanceTo(p2);
  if (len < 0.01) return;
  const seg = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 6), mat);
  seg.position.copy(p1).add(p2).multiplyScalar(0.5);
  seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
  seg.castShadow = true;
  worldState.worldGroup.add(seg);
  return seg;
}

export function addCanopyPost(x, yBase, z, height, rad, mat) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.85, rad, height, 6), mat);
  post.position.set(x, yBase + height / 2, z);
  post.castShadow = true;
  addAnimeOutline(post, 1.05, 0x0f172a);
  worldState.worldGroup.add(post);
}

function addCanopyDeckEdgeRail(railCfg, pH, mats) {
  const { a0, a1, fixedCoord, doorHalf, isHorizontal } = railCfg;
  const mid = (a0 + a1) / 2;
  const drawSpan = (s0, s1) => {
    if (s1 - s0 < 0.15) return;
    const x0 = isHorizontal ? s0 : fixedCoord;
    const z0 = isHorizontal ? fixedCoord : s0;
    const x1 = isHorizontal ? s1 : fixedCoord;
    const z1 = isHorizontal ? fixedCoord : s1;
    addCanopyRopeSegment({ x: x0, y: pH + 0.85, z: z0 }, { x: x1, y: pH + 0.85, z: z1 }, 0.06, mats.ropeMat);
    addCanopyRopeSegment({ x: x0, y: pH + 0.45, z: z0 }, { x: x1, y: pH + 0.45, z: z1 }, 0.06, mats.ropeMat);
  };
  if (!doorHalf) {
    drawSpan(a0, a1);
    return;
  }
  const gapHalf = doorHalf + 0.08;
  const d0 = mid - gapHalf;
  const d1 = mid + gapHalf;
  addCanopyPost(isHorizontal ? d0 : fixedCoord, pH, isHorizontal ? fixedCoord : d0, 1.25, 0.12, mats.boughMat);
  addCanopyPost(isHorizontal ? d1 : fixedCoord, pH, isHorizontal ? fixedCoord : d1, 1.25, 0.12, mats.boughMat);
  drawSpan(a0, d0);
  drawSpan(d1, a1);
}

export function buildSpiritTreeBase(mats, pH, cH, crownTopOffset) {
  const worldGroup = worldState.worldGroup;
  const spiritTrunk = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 2.35, pH - 0.12, 10), mats.barkMat);
  spiritTrunk.position.set(0, (pH - 0.12) / 2, 0);
  spiritTrunk.castShadow = true;
  spiritTrunk.receiveShadow = true;
  addAnimeOutline(spiritTrunk, 1.04, 0x1e1b18);
  worldGroup.add(spiritTrunk);

  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 2.1, 6), mats.barkMat);
    root.position.set(Math.cos(ang) * 1.85, 0.72, Math.sin(ang) * 1.85);
    root.rotation.z = -Math.cos(ang) * 0.68;
    root.rotation.x = Math.sin(ang) * 0.68;
    root.castShadow = true;
    worldGroup.add(root);
  }
  const trunkRing = new THREE.Mesh(
    new THREE.RingGeometry(1.95, 2.2, 28),
    new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide, transparent: true, opacity: 0.72 })
  );
  trunkRing.rotation.x = -Math.PI / 2;
  trunkRing.position.set(0, 0.032, 0);
  worldGroup.add(trunkRing);

  [-1, 1].forEach((sx) => {
    [-1, 1].forEach((sz) => {
      const boughSeg = addCanopyRopeSegment(
        { x: sx * (cH - 0.15), y: pH + 0.6, z: sz * (cH - 0.15) },
        { x: sx * 6.5, y: 15.8 + crownTopOffset, z: sz * 6.5 },
        0.18,
        mats.barkMat
      );
      if (boughSeg) {
        registerCameraTreeOccluder(boughSeg, sx * 5.4, pH + 0.6, 15.8 + crownTopOffset, sz * 5.4, 1.6);
      }
      const blossom = new THREE.Mesh(new THREE.IcosahedronGeometry(2.65, 1), mats.sakuraMat);
      blossom.position.set(sx * 6.8, 16.6 + crownTopOffset, sz * 6.8);
      blossom.scale.set(1.15, 0.65, 1.15);
      blossom.castShadow = true;
      addAnimeOutline(blossom, 1.04, 0x3b0764);
      worldGroup.add(blossom);
      registerCameraTreeOccluder(blossom, sx * 6.8, 16.6 + crownTopOffset, 16.6 + crownTopOffset, sz * 6.8, 3.05);

      const blossomTop = new THREE.Mesh(new THREE.IcosahedronGeometry(1.75, 1), mats.sakuraLightMat);
      blossomTop.position.set(sx * 6.4, 17.9 + crownTopOffset, sz * 6.4);
      blossomTop.scale.set(1.1, 0.65, 1.1);
      worldGroup.add(blossomTop);
      registerCameraTreeOccluder(blossomTop, sx * 6.4, 17.9 + crownTopOffset, 17.9 + crownTopOffset, sz * 6.4, 2.0);
    });
  });
}

export function buildCanopyDecks(mats, pH) {
  const worldGroup = worldState.worldGroup;
  CANOPY_SPEC.decks.forEach((d) => {
    const w = d.x1 - d.x0;
    const depth = d.z1 - d.z0;
    const isMain = d.kind === 'spirit' || d.kind === 'hub';
    const deckMesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.34, depth), isMain ? mats.boughMat : mats.plankDarkMat);
    deckMesh.position.set(d.cx, pH - 0.17, d.cz);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    addAnimeOutline(deckMesh, new THREE.Vector3(1.02, 1.04, 1.02), 0x0f172a);
    worldGroup.add(deckMesh);

    const topPad = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.65, depth - 0.65), isMain ? mats.canopyTurfMat : mats.plankLightMat);
    topPad.rotation.x = -Math.PI / 2;
    topPad.position.set(d.cx, pH + 0.015, d.cz);
    topPad.receiveShadow = true;
    worldGroup.add(topPad);

    const inset = 0.16;
    const rx0 = d.x0 + inset;
    const rx1 = d.x1 - inset;
    const rz0 = d.z0 + inset;
    const rz1 = d.z1 - inset;
    addCanopyPost(rx0, pH, rz0, 1.28, 0.13, mats.boughMat);
    addCanopyPost(rx1, pH, rz0, 1.28, 0.13, mats.boughMat);
    addCanopyPost(rx0, pH, rz1, 1.28, 0.13, mats.boughMat);
    addCanopyPost(rx1, pH, rz1, 1.28, 0.13, mats.boughMat);

    addCanopyDeckEdgeRail({ a0: rx0, a1: rx1, fixedCoord: rz0, doorHalf: d.doors.n, isHorizontal: true }, pH, mats);
    addCanopyDeckEdgeRail({ a0: rx0, a1: rx1, fixedCoord: rz1, doorHalf: d.doors.s, isHorizontal: true }, pH, mats);
    addCanopyDeckEdgeRail({ a0: rz0, a1: rz1, fixedCoord: rx0, doorHalf: d.doors.w, isHorizontal: false }, pH, mats);
    addCanopyDeckEdgeRail({ a0: rz0, a1: rz1, fixedCoord: rx1, doorHalf: d.doors.e, isHorizontal: false }, pH, mats);
  });

  const centerSeal = new THREE.Mesh(
    new THREE.RingGeometry(2.45, 2.9, 36),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  centerSeal.rotation.x = -Math.PI / 2;
  centerSeal.position.set(0, pH + 0.028, 0);
  worldGroup.add(centerSeal);

  const centerHex = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.3, 6),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
  );
  centerHex.rotation.x = -Math.PI / 2;
  centerHex.position.set(0, pH + 0.032, 0);
  worldGroup.add(centerHex);
}

export function buildCanopyTrunks(mats, pH, crownBaseY, crownTopOffset) {
  const worldGroup = worldState.worldGroup;
  CANOPY_SPEC.trunks.forEach((tr) => {
    if (tr.kind === 'spirit' || tr.kind === 'bough') return;
    const lowTrunkH = pH + 0.45;
    const treeTrunkLow = new THREE.Mesh(new THREE.CylinderGeometry(tr.radius * 0.72, tr.radius * 0.98, lowTrunkH, 9), mats.barkMat);
    treeTrunkLow.position.set(tr.x, lowTrunkH / 2, tr.z);
    treeTrunkLow.castShadow = true;
    treeTrunkLow.receiveShadow = true;
    addAnimeOutline(treeTrunkLow, 1.05, 0x1e1b18);
    worldGroup.add(treeTrunkLow);

    const highTrunkH = Math.max(2.2, 15.6 + crownTopOffset - lowTrunkH);
    const treeTrunkHigh = new THREE.Mesh(new THREE.CylinderGeometry(tr.radius * 0.46, tr.radius * 0.7, highTrunkH, 9), mats.barkMat);
    treeTrunkHigh.position.set(tr.x, lowTrunkH + highTrunkH / 2, tr.z);
    treeTrunkHigh.castShadow = true;
    addAnimeOutline(treeTrunkHigh, 1.05, 0x1e1b18);
    worldGroup.add(treeTrunkHigh);
    registerCameraTreeOccluder(treeTrunkHigh, tr.x, lowTrunkH, lowTrunkH + highTrunkH, tr.z, tr.radius + 0.25);

    const baseRing = new THREE.Mesh(
      new THREE.RingGeometry(tr.radius - 0.1, tr.radius + 0.12, 22),
      new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide, transparent: true, opacity: 0.72 })
    );
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.set(tr.x, 0.032, tr.z);
    worldGroup.add(baseRing);

    const useSakura = tr.kind === 'hub' || tr.kind === 'bend';
    const crownA = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5, 1), useSakura ? mats.sakuraMat : mats.leafMat);
    crownA.position.set(tr.x, crownBaseY, tr.z);
    crownA.scale.set(1.15, 0.68, 1.15);
    crownA.castShadow = true;
    addAnimeOutline(crownA, 1.04, useSakura ? 0x3b0764 : 0x064e3b);
    worldGroup.add(crownA);
    registerCameraTreeOccluder(crownA, tr.x, crownBaseY, crownBaseY, tr.z, 2.9);

    const crownB = new THREE.Mesh(new THREE.IcosahedronGeometry(1.72, 1), useSakura ? mats.sakuraLightMat : mats.leafLightMat);
    crownB.position.set(tr.x + (tr.x >= 0 ? -0.35 : 0.35), crownBaseY + 1.4, tr.z);
    crownB.scale.set(1.05, 0.65, 1.05);
    worldGroup.add(crownB);
    registerCameraTreeOccluder(crownB, tr.x + (tr.x >= 0 ? -0.35 : 0.35), crownBaseY + 1.4, crownBaseY + 1.4, tr.z, 1.9);
  });
}
