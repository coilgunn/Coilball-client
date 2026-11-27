import { ctx } from '../state.js';
import { scene } from '../render3d.js';
import { ultState } from './shared.js';
import {
  createTerrainRibbonMesh,
  createTerrainRingMesh,
  createTerrainGridMesh
} from './geometry.js';
import { buildLeafPreview } from './preview_build_leaf.js';

const THREE = ctx.THREE;

function createPreviewBasicMat(color, opacity, offset) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset
  });
}

function buildFirePreview() {
  const fireGroup = new THREE.Group();
  const firePlane = createTerrainRibbonMesh(44, createPreviewBasicMat(0xff6b00, 0.38, -4), 14);
  fireGroup.add(firePlane);

  const fireCore = createTerrainRibbonMesh(44, createPreviewBasicMat(0xffffff, 0.82, -5), 15);
  fireGroup.add(fireCore);

  const fireEndRing = createTerrainRingMesh(28, createPreviewBasicMat(0xffedd5, 0.9, -5), 16);
  fireGroup.add(fireEndRing);
  return { fireGroup, firePlane, fireCore, fireEndRing };
}

function buildWaterStandardPreview(waterGroup) {
  const waterArea = createTerrainGridMesh(10, 20, createPreviewBasicMat(0x38bdf8, 0.24, -4), 12);
  waterGroup.add(waterArea);

  const waterOutlinePos = new Float32Array((10 + 20) * 2 * 3);
  const waterOutlineGeo = new THREE.BufferGeometry();
  waterOutlineGeo.setAttribute('position', new THREE.BufferAttribute(waterOutlinePos, 3));
  const waterOutline = new THREE.LineLoop(
    waterOutlineGeo,
    new THREE.LineBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5
    })
  );
  waterOutline.frustumCulled = false;
  waterOutline.renderOrder = 14;
  waterGroup.add(waterOutline);

  const waterSweep = createTerrainGridMesh(12, 2, createPreviewBasicMat(0xe0f2fe, 0.78, -5), 15);
  waterGroup.add(waterSweep);
  return { waterArea, waterOutline, waterOutlinePos, waterSweep };
}

function buildWater360Filigree(waterGroup) {
  const waterFiligreeSpokes = 24;
  const waterFiligreeSpokeSegs = 20;
  const waterFiligreeRingFracs = [0.03, 0.22, 0.44, 0.66, 0.84];
  const waterFiligreeRingSegs = 56;
  const segCount =
    waterFiligreeSpokes * waterFiligreeSpokeSegs +
    waterFiligreeRingFracs.length * waterFiligreeRingSegs;
  const water360FiligreePos = new Float32Array(segCount * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(water360FiligreePos, 3));
  const water360Filigree = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5
    })
  );
  water360Filigree.frustumCulled = false;
  water360Filigree.renderOrder = 14;
  water360Filigree.visible = false;
  waterGroup.add(water360Filigree);

  return {
    water360Filigree,
    water360FiligreePos,
    waterFiligreeSpokes,
    waterFiligreeSpokeSegs,
    waterFiligreeRingFracs,
    waterFiligreeRingSegs
  };
}

function buildWater360Preview(waterGroup) {
  const water360Ang = 56;
  const water360Rad = 22;
  const water360Pos = new Float32Array((water360Rad + 1) * water360Ang * 3);
  const water360Idx = [];
  for (let r = 0; r < water360Rad; r++) {
    for (let a = 0; a < water360Ang; a++) {
      const an = (a + 1) % water360Ang;
      const v00 = r * water360Ang + a;
      const v01 = r * water360Ang + an;
      const v10 = (r + 1) * water360Ang + a;
      const v11 = (r + 1) * water360Ang + an;
      water360Idx.push(v00, v10, v11, v00, v11, v01);
    }
  }
  const areaGeo = new THREE.BufferGeometry();
  areaGeo.setAttribute('position', new THREE.BufferAttribute(water360Pos, 3));
  areaGeo.setIndex(water360Idx);
  const water360Area = new THREE.Mesh(
    areaGeo,
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    })
  );
  water360Area.frustumCulled = false;
  water360Area.renderOrder = 12;
  water360Area.visible = false;
  waterGroup.add(water360Area);

  const water360OuterBand = createTerrainRingMesh(
    56,
    new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    }),
    13
  );
  water360OuterBand.visible = false;
  waterGroup.add(water360OuterBand);

  const waterOuterLineSegs = 96;
  const water360OuterLinePos = new Float32Array(waterOuterLineSegs * 3);
  const olGeo = new THREE.BufferGeometry();
  olGeo.setAttribute('position', new THREE.BufferAttribute(water360OuterLinePos, 3));
  const water360OuterLine = new THREE.LineLoop(
    olGeo,
    new THREE.LineBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5
    })
  );
  water360OuterLine.frustumCulled = false;
  water360OuterLine.renderOrder = 15;
  water360OuterLine.visible = false;
  waterGroup.add(water360OuterLine);

  return {
    water360Area,
    water360Pos,
    water360Ang,
    water360Rad,
    water360OuterBand,
    water360OuterLine,
    water360OuterLinePos,
    waterOuterLineSegs,
    ...buildWater360Filigree(waterGroup)
  };
}

export function ensureUltPreviewGroup() {
  if (ultState.previewGroup) return ultState.previewGroup;
  const pg = new THREE.Group();
  pg.visible = false;

  const fireData = buildFirePreview();
  pg.add(fireData.fireGroup);

  const waterGroup = new THREE.Group();
  const waterStd = buildWaterStandardPreview(waterGroup);
  const water360 = buildWater360Preview(waterGroup);
  pg.add(waterGroup);

  const leafData = buildLeafPreview();
  pg.add(leafData.leafGroup);

  pg.userData = {
    ...fireData,
    waterGroup,
    ...waterStd,
    ...water360,
    ...leafData,
    animTime: 0
  };
  scene.add(pg);
  ultState.previewGroup = pg;
  return pg;
}
