import { ctx } from '../state.js';
import { createTerrainRingMesh } from './geometry.js';

const THREE = ctx.THREE;

function createHoloTreeUnit(fillMat, wireMat, ringMat) {
  const g = new THREE.Group();
  const baseRingGeo = new THREE.RingGeometry(0.42, 0.72, 16);
  baseRingGeo.rotateX(-Math.PI / 2);
  const baseRing = new THREE.Mesh(baseRingGeo, ringMat);
  baseRing.position.y = 0.04;
  baseRing.renderOrder = 16;
  g.add(baseRing);

  const addHoloMesh = (geo, pos = null, scale = null) => {
    const fill = new THREE.Mesh(geo, fillMat);
    const wire = new THREE.Mesh(geo, wireMat);
    fill.renderOrder = 17;
    wire.renderOrder = 18;
    if (pos) {
      fill.position.copy(pos);
      wire.position.copy(pos);
    }
    if (scale) {
      fill.scale.copy(scale);
      wire.scale.copy(scale);
    }
    g.add(fill);
    g.add(wire);
  };

  const trunkCurveA = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.28, 0, -0.14),
    new THREE.Vector3(0.24, 0.75, 0.16),
    new THREE.Vector3(-0.18, 1.48, -0.08),
    new THREE.Vector3(0.08, 2.05, 0.05)
  ]);
  const trunkCurveB = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.28, 0, 0.14),
    new THREE.Vector3(-0.22, 0.82, -0.14),
    new THREE.Vector3(0.18, 1.52, 0.12),
    new THREE.Vector3(-0.08, 2.0, -0.04)
  ]);
  addHoloMesh(new THREE.TubeGeometry(trunkCurveA, 8, 0.13, 5, false));
  addHoloMesh(new THREE.TubeGeometry(trunkCurveB, 8, 0.11, 5, false));

  const crownGeo = new THREE.IcosahedronGeometry(0.66, 1);
  addHoloMesh(crownGeo, new THREE.Vector3(0, 2.18, 0), new THREE.Vector3(1.22, 0.68, 1.08));
  addHoloMesh(crownGeo, new THREE.Vector3(-0.34, 1.72, 0.14), new THREE.Vector3(0.84, 0.62, 0.84));
  addHoloMesh(crownGeo, new THREE.Vector3(0.36, 1.65, -0.14), new THREE.Vector3(0.82, 0.62, 0.82));
  return g;
}

function buildLeafArrowMeshes(leafGroup) {
  const leafShaftRows = 14;
  const leafHeadRows = 6;
  const vertCount = (leafShaftRows + 1 + leafHeadRows + 1) * 2;
  const leafArrowPos = new Float32Array(vertCount * 3);
  const idx = [];
  for (let r = 0; r < leafShaftRows; r++) {
    const a = r * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const headOffset = (leafShaftRows + 1) * 2;
  for (let r = 0; r < leafHeadRows; r++) {
    const a = headOffset + r * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const arrowGeo = new THREE.BufferGeometry();
  arrowGeo.setAttribute('position', new THREE.BufferAttribute(leafArrowPos, 3));
  arrowGeo.setIndex(idx);
  const leafArrowFill = new THREE.Mesh(
    arrowGeo,
    new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.30,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    })
  );
  leafArrowFill.frustumCulled = false;
  leafArrowFill.renderOrder = 13;
  leafGroup.add(leafArrowFill);

  const leafArrowOutlinePos = new Float32Array(52 * 3);
  const outlineGeo = new THREE.BufferGeometry();
  outlineGeo.setAttribute('position', new THREE.BufferAttribute(leafArrowOutlinePos, 3));
  const leafArrowOutline = new THREE.LineLoop(
    outlineGeo,
    new THREE.LineBasicMaterial({
      color: 0x86efac,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5
    })
  );
  leafArrowOutline.frustumCulled = false;
  leafArrowOutline.renderOrder = 14;
  leafGroup.add(leafArrowOutline);

  return {
    leafArrowFill,
    leafArrowPos,
    leafShaftRows,
    leafHeadRows,
    leafArrowOutline,
    leafArrowOutlinePos
  };
}

function buildLeafHolograms(leafGroup) {
  const holoTreeFillMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const holoTreeWireMat = new THREE.MeshBasicMaterial({
    color: 0x86efac,
    wireframe: true,
    transparent: true,
    opacity: 0.58,
    depthWrite: false
  });
  const holoTreeBaseRingMat = new THREE.MeshBasicMaterial({
    color: 0x4ade80,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5
  });
  const leafTreeHolograms = [];
  for (let t = 0; t < 6; t++) {
    const unit = createHoloTreeUnit(holoTreeFillMat, holoTreeWireMat, holoTreeBaseRingMat);
    leafGroup.add(unit);
    leafTreeHolograms.push(unit);
  }
  return { leafTreeHolograms, holoTreeFillMat, holoTreeWireMat, holoTreeBaseRingMat };
}

export function buildLeafPreview() {
  const leafGroup = new THREE.Group();
  const leafRing = createTerrainRingMesh(
    32,
    new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    }),
    13
  );
  leafGroup.add(leafRing);

  return {
    leafGroup,
    leafRing,
    ...buildLeafArrowMeshes(leafGroup),
    ...buildLeafHolograms(leafGroup)
  };
}
