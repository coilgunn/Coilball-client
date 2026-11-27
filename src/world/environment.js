import { DEFAULT_FIELD_CONFIG, FIELD, state, ctx } from '../state.js';
import { scene, darkenDecorHex, createToonMat, createBasicMat, addAnimeOutline, setWorldBuildActive } from '../render3d.js';
import { MONTREAL_MAPS, getActiveMapMeta } from './map_catalog.js';
import { applyArenaMapData } from './park_maps.js';
import { getTerrainY, getStructureSurfaceY } from './terrain.js';
import {
  mergeStaticWorldMeshes,
  disposeWorldGroup,
  createLaneConnectorSegment,
  createGrassTexture,
  registerCameraTreeOccluder
} from './mesh_utils.js';
import { createJungleObstacleMesh, createJungleBrushMesh } from './jungle_meshes.js';
import { createCanopyTreeNetwork } from './canopy_network.js';
import { buildMontrealParkLandmarks } from './montreal_landmarks.js';
import { THREE, worldState, JUNGLE_OBSTACLES, JUNGLE_BUSHES, cameraTreeOccluders } from './shared.js';

export function initWorld() {
  if (!worldState.worldGroup) {
    worldState.worldGroup = new THREE.Group();
    scene.add(worldState.worldGroup);
  }
  ctx.world.worldGroup = worldState.worldGroup;
  ctx.world.getTerrainY = getTerrainY;
  ctx.world.getStructureSurfaceY = getStructureSurfaceY;
  ctx.world.MONTREAL_MAPS = MONTREAL_MAPS;
  applyArenaMapData('classic');
  return { worldGroup: worldState.worldGroup };
}

function createGoalHoop(x, z, colorHex, labelText) {
  const hoopGroup = new THREE.Group();
  hoopGroup.position.set(x, 0.08, z);

  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(FIELD.goalRadius, 0.17, 16, 48),
    createToonMat(colorHex, { emissive: colorHex, emissiveIntensity: 0.3 })
  );
  torus.rotation.x = Math.PI / 2;
  torus.castShadow = true;
  addAnimeOutline(torus, 1.04, 0x0f172a);
  hoopGroup.add(torus);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(FIELD.goalRadius - 0.1, 32),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.22 })
  );
  disc.rotation.x = -Math.PI / 2;
  hoopGroup.add(disc);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const c2d = canvas.getContext('2d');
  c2d.fillStyle = 'rgba(15, 23, 42, 0.9)';
  c2d.fillRect(8, 8, 496, 80);
  c2d.strokeStyle = '#' + colorHex.toString(16).padStart(6, '0');
  c2d.lineWidth = 6;
  c2d.strokeRect(8, 8, 496, 80);
  c2d.fillStyle = '#ffffff';
  c2d.font = 'bold 28px Segoe UI, sans-serif';
  c2d.textAlign = 'center';
  c2d.textBaseline = 'middle';
  c2d.fillText(labelText, 256, 48);

  const signSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true })
  );
  signSprite.position.set(0, 3.6, 0);
  signSprite.scale.set(6.5, 1.25, 1);
  hoopGroup.add(signSprite);

  worldState.worldGroup.add(hoopGroup);
}

function createParkTree(x, z, isSakura = false, mapMeta = getActiveMapMeta()) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.65, 3.3, 8), createToonMat(0x5c4033));
  trunk.position.y = 1.65;
  trunk.castShadow = true;
  addAnimeOutline(trunk, 1.05, 0x1e1b18);
  tree.add(trunk);

  const foliageColor1 = isSakura ? (mapMeta.foliagePrimaryHex || 0xf9a8d4) : (mapMeta.foliageShrineHex || 0x22c55e);
  const foliageColor2 = isSakura ? (mapMeta.foliageSecondaryHex || 0xf472b6) : (mapMeta.foliageShrineSecHex || 0x4ade80);

  const crown1 = new THREE.Mesh(new THREE.DodecahedronGeometry(2.45, 1), createToonMat(foliageColor1));
  crown1.position.y = 4.25;
  crown1.castShadow = true;
  addAnimeOutline(crown1, 1.045, 0x111827);
  tree.add(crown1);

  const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.85, 1), createToonMat(foliageColor2));
  crown2.position.set(0.85, 5.45, 0.4);
  crown2.castShadow = true;
  addAnimeOutline(crown2, 1.045, 0x111827);
  tree.add(crown2);

  const crown3 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.55, 1), createToonMat(foliageColor1));
  crown3.position.set(-0.9, 4.9, -0.45);
  crown3.castShadow = true;
  addAnimeOutline(crown3, 1.045, 0x111827);
  tree.add(crown3);

  worldState.worldGroup.add(tree);
  registerCameraTreeOccluder(tree, x, 0, 6.8, z, 2.8);
}

function buildParkJungleBiome(style, mapMeta, sx, sz) {
  const worldGroup = worldState.worldGroup;
  if (style !== 'tutorial' && style !== 'rift') {
    const jungleW = Math.round(132 * sx);
    const jungleD = Math.round(68 * sz);
    const jungleFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(jungleW, jungleD),
      new THREE.MeshLambertMaterial({
        color: darkenDecorHex(mapMeta.jungleFloorHex || 0x065f46, 0.56),
        transparent: true,
        opacity: style === 'jarry' ? 0.16 : 0.72,
        depthWrite: false
      })
    );
    jungleFloor.rotation.x = -Math.PI / 2;
    jungleFloor.position.set(0, 0.015, 0);
    jungleFloor.receiveShadow = true;
    worldGroup.add(jungleFloor);

    if (style !== 'jarry') {
      const jungleBorderMat = createBasicMat({ color: mapMeta.jungleBorderHex || 0x34d399, transparent: true, opacity: 0.55, depthWrite: false });
      [jungleD * 0.5, -jungleD * 0.5].forEach((zBorder) => {
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(jungleW, 0.42), jungleBorderMat);
        strip.rotation.x = -Math.PI / 2;
        strip.position.set(0, 0.05, zBorder);
        worldGroup.add(strip);
      });
    }
  }

  if (style === 'classic') {
    const riverStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, FIELD.depth - 0.6),
      createBasicMat({ color: 0x38bdf8, transparent: true, opacity: 0.32, depthWrite: false })
    );
    riverStrip.rotation.x = -Math.PI / 2;
    riverStrip.position.set(0, 0.028, 0);
    worldGroup.add(riverStrip);
  }
}

function buildParkLanesAndLines(style, sx, sz, lineMat) {
  const worldGroup = worldState.worldGroup;
  if (style !== 'rift') {
    const laneTrackLength = Math.round(FIELD.width * (156 / DEFAULT_FIELD_CONFIG.width));
    const connX = laneTrackLength * 0.5;
    const laneWidth = style === 'tutorial' ? 12 : 20;
    const laneHalfW = laneWidth * 0.5;
    [FIELD.laneTopZ, FIELD.laneBotZ].forEach((zPos) => {
      const laneCarpet = new THREE.Mesh(
        new THREE.PlaneGeometry(laneTrackLength, laneWidth),
        createBasicMat({ color: 0x34d399, transparent: true, opacity: 0.16, depthWrite: false })
      );
      laneCarpet.rotation.x = -Math.PI / 2;
      laneCarpet.position.set(0, 0.024, zPos);
      worldGroup.add(laneCarpet);

      const laneCenterLine = new THREE.Mesh(new THREE.PlaneGeometry(laneTrackLength, 0.28), lineMat);
      laneCenterLine.rotation.x = -Math.PI / 2;
      laneCenterLine.position.set(0, 0.058, zPos);
      worldGroup.add(laneCenterLine);

      [-laneHalfW, laneHalfW].forEach((dz) => {
        const rail = new THREE.Mesh(
          new THREE.PlaneGeometry(laneTrackLength, 0.2),
          createBasicMat({ color: 0xffffff, transparent: true, opacity: 0.34, depthWrite: false })
        );
        rail.rotation.x = -Math.PI / 2;
        rail.position.set(0, 0.052, zPos + dz);
        worldGroup.add(rail);
      });

      const ringMesh = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 36), lineMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.set(0, 0.068, zPos);
      worldGroup.add(ringMesh);

      createLaneConnectorSegment({ x: -connX, z: zPos }, { x: FIELD.allyGoalX, z: FIELD.allyGoalZ || 0 }, Math.max(8.5, 13.0 * sz), 0xfef08a, 0.18);
      createLaneConnectorSegment({ x: connX, z: zPos }, { x: FIELD.enemyGoalX, z: FIELD.enemyGoalZ || 0 }, Math.max(8.5, 13.0 * sz), 0xd8b4fe, 0.18);
    });
  }

  const plazaRadius = Math.max(7.2, 10.5 * sx);
  [
    [FIELD.allyGoalX, FIELD.allyGoalZ || 0, 0xfacc15],
    [FIELD.enemyGoalX, FIELD.enemyGoalZ || 0, 0xc084fc]
  ].forEach(([gx, gz, col]) => {
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(plazaRadius, 36),
      createBasicMat({ color: col, transparent: true, opacity: 0.18, depthWrite: false })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(gx, 0.032, gz);
    worldGroup.add(plaza);
  });

  if (style !== 'rift') {
    const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(0.34, FIELD.depth), lineMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, 0.062, 0);
    worldGroup.add(centerLine);
  }

  [
    { w: FIELD.width, d: 0.34, x: 0, y: 0.064, z: -FIELD.depth / 2 },
    { w: FIELD.width, d: 0.34, x: 0, y: 0.064, z: FIELD.depth / 2 },
    { w: 0.34, d: FIELD.depth, x: -FIELD.width / 2, y: 0.066, z: 0 },
    { w: 0.34, d: FIELD.depth, x: FIELD.width / 2, y: 0.066, z: 0 }
  ].forEach((b) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.d), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(b.x, b.y, b.z);
    worldGroup.add(line);
  });
}

export function buildParkEnvironment() {
  disposeWorldGroup();
  cameraTreeOccluders.length = 0;

  const mapMeta = getActiveMapMeta();
  const darkerSkyHex = darkenDecorHex(mapMeta.skyHex || 0x7dd3fc, 0.54);
  if (scene.background) scene.background.setHex(darkerSkyHex);
  if (scene.fog) {
    scene.fog.color.setHex(darkerSkyHex);
    scene.fog.density = state.cameraMode === 'aerial' ? 0 : (mapMeta.fogDensity || 0.0022);
  }

  setWorldBuildActive(true);
  try {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(620, 620),
      new THREE.MeshLambertMaterial({ map: createGrassTexture(mapMeta) })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    worldState.worldGroup.add(ground);

    const lineMat = createBasicMat({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false });
    const style = mapMeta.decorStyle || 'classic';
    const sx = FIELD.width / DEFAULT_FIELD_CONFIG.width;
    const sz = FIELD.depth / DEFAULT_FIELD_CONFIG.depth;

    buildParkJungleBiome(style, mapMeta, sx, sz);
    buildMontrealParkLandmarks(mapMeta);
    createCanopyTreeNetwork();
    buildParkLanesAndLines(style, sx, sz, lineMat);

    JUNGLE_OBSTACLES.forEach(createJungleObstacleMesh);
    JUNGLE_BUSHES.forEach(createJungleBrushMesh);

    createGoalHoop(FIELD.allyGoalX, FIELD.allyGoalZ || 0, 0xfacc15, style === 'rift' ? 'CERCEAU CAMP OR (Sud-Ouest)' : 'CERCEAU CAMP OR (Gauche)');
    createGoalHoop(FIELD.enemyGoalX, FIELD.enemyGoalZ || 0, 0xc084fc, style === 'rift' ? 'CERCEAU CAMP VIOLET (Nord-Est)' : 'CERCEAU CAMP VIOLET (Droite)');

    if (style !== 'rift') {
      const treePositions = [
        [-110 * sx, -80 * sz, true], [-76 * sx, -81 * sz, false], [-42 * sx, -80 * sz, true], [0, -82 * sz, false], [42 * sx, -80 * sz, true], [76 * sx, -81 * sz, false], [110 * sx, -80 * sz, true],
        [-110 * sx, 80 * sz, true], [-76 * sx, 81 * sz, false], [-42 * sx, 80 * sz, true], [0, 82 * sz, false], [42 * sx, 80 * sz, true], [76 * sx, 81 * sz, false], [110 * sx, 80 * sz, true],
        [-130 * sx, -60 * sz, false], [-130 * sx, -36 * sz, true], [-130 * sx, 36 * sz, true], [-130 * sx, 60 * sz, false],
        [130 * sx, -60 * sz, false], [130 * sx, -36 * sz, true], [130 * sx, 36 * sz, true], [130 * sx, 60 * sz, false]
      ];
      treePositions.forEach(([tx, tz, isSakura]) => createParkTree(tx, tz, isSakura, mapMeta));
    }
  } finally {
    setWorldBuildActive(false);
  }

  worldState.worldGroup.userData.batchStats = mergeStaticWorldMeshes();
}
