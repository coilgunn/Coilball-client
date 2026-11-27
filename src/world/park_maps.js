import { DEFAULT_FIELD_CONFIG, TUTORIAL_FIELD_CONFIG, RIFT_FIELD_CONFIG, FIELD, ctx } from '../state.js';
import { buildClassicArenaSpec, buildEmptyCanopySpec } from './classic_spec.js';
import { PARK_LANDMARKS, MONTREAL_MAPS } from './map_catalog.js';
import { CANOPY_SPEC, JUNGLE_OBSTACLES, JUNGLE_WALLS, JUNGLE_BUSHES, worldState } from './shared.js';

function buildSymmetricParkLayout(obstacleTuples, bushTuples, initialObstacles = []) {
  const obstacles = [...initialObstacles];
  const bushes = [];
  [-1, 1].forEach((sx) => {
    [-1, 1].forEach((sz) => {
      const side = sx < 0 ? 'ally' : 'enemy';
      for (const [x, z, radius, kind] of obstacleTuples) {
        obstacles.push({ x: sx * x, z: sz * z, radius, kind, teamSide: side });
      }
      for (const [x, z, radius] of bushTuples) {
        bushes.push({ x: sx * x, z: sz * z, radius });
      }
    });
  });
  return { spec: buildEmptyCanopySpec(), obstacles, bushes };
}

function buildJarryParkData() {
  const obstacles = [
    { x: 0, z: 0, radius: PARK_LANDMARKS.jarry.gazeboRadius, kind: 'gazebo', teamSide: 'neutral' }
  ];
  [-1, 1].forEach((sx) => {
    [-1, 1].forEach((sz) => {
      const side = sx < 0 ? 'ally' : 'enemy';
      obstacles.push(
        { x: sx * 49.0, z: sz * 18.0, radius: 2.5, kind: 'grove', teamSide: side },
        { x: sx * 25.5, z: sz * 23.0, radius: 2.4, kind: 'grove', teamSide: side }
      );
    });
  });
  return { spec: buildEmptyCanopySpec(), obstacles, bushes: [] };
}

function buildRiftParkData() {
  const walls = [];
  PARK_LANDMARKS.rift.wallChains.forEach((chain) => {
    for (let i = 0; i < chain.pts.length - 1; i++) {
      const a = chain.pts[i];
      const b = chain.pts[i + 1];
      walls.push({
        ax: a[0],
        az: a[1],
        bx: b[0],
        bz: b[1],
        radius: chain.radius,
        height: chain.height || 3.85,
        kind: chain.kind,
        teamSide: chain.teamSide || 'neutral'
      });
    }
  });

  const bushes = [];
  const allyBushes = [
    { x: -81, z: -26, radius: 2.35 },
    { x: -81, z: -14, radius: 2.35 },
    { x: -24, z: -81, radius: 2.35 },
    { x: -12, z: -81, radius: 2.35 },
    { x: -55, z: -51, radius: 2.35 },
    { x: -37, z: -26, radius: 2.2 },
    { x: -12, z: -6, radius: 2.15 },
    { x: -13, z: 9, radius: 2.15 },
    { x: -44, z: -18, radius: 2.35 },
    { x: 11, z: 46, radius: 2.35 }
  ];
  allyBushes.forEach((b) => {
    bushes.push(b);
    bushes.push({ x: -b.x, z: -b.z, radius: b.radius });
  });

  return {
    spec: buildEmptyCanopySpec(),
    obstacles: [{ x: 0, z: 0, radius: PARK_LANDMARKS.rift.waterfallRadius, kind: 'waterfall', teamSide: 'neutral' }],
    walls,
    bushes
  };
}

const SYMMETRIC_PARK_PRESETS = {
  lafontaine: {
    obstacles: [[56.0, 11.0, 2.5, 'gate'], [47.0, 22.5, 2.8, 'shrine'], [36.0, 10.0, 2.5, 'grove'], [25.5, 21.5, 2.7, 'shrine']],
    bushes: [[52.0, 17.5, 2.4], [39.5, 25.5, 2.4], [26.5, 16.5, 2.3], [19.5, 27.5, 2.3]]
  },
  'saint-viateur': {
    obstacles: [[55.0, 11.5, 2.5, 'gate'], [44.5, 23.0, 2.8, 'shrine'], [31.5, 10.5, 2.5, 'grove'], [22.5, 25.0, 2.7, 'shrine']],
    bushes: [[52.0, 20.5, 2.5], [42.0, 12.0, 2.4], [34.0, 27.5, 2.5], [28.0, 16.5, 2.4], [12.5, 24.5, 2.4]]
  },
  'mont-royal': {
    obstacles: [[57.5, 11.5, 2.5, 'gate'], [47.5, 23.5, 2.8, 'shrine'], [41.5, 10.5, 2.4, 'grove']],
    bushes: [[53.5, 18.0, 2.3], [42.0, 25.5, 2.3], [38.5, 18.5, 2.2]]
  }
};

function buildMontrealParkData(mapId) {
  if (mapId === 'tutorial') return { spec: buildEmptyCanopySpec(), obstacles: [], bushes: [] };
  if (mapId === 'classic') return buildClassicArenaSpec();
  if (mapId === 'jarry') return buildJarryParkData();
  if (mapId === 'rift') return buildRiftParkData();
  const preset = SYMMETRIC_PARK_PRESETS[mapId] || SYMMETRIC_PARK_PRESETS['mont-royal'];
  return buildSymmetricParkLayout(preset.obstacles, preset.bushes);
}

export function applyArenaMapData(mapId) {
  const id = MONTREAL_MAPS[mapId] ? mapId : 'classic';
  Object.assign(
    FIELD,
    id === 'tutorial' ? TUTORIAL_FIELD_CONFIG : id === 'rift' ? RIFT_FIELD_CONFIG : DEFAULT_FIELD_CONFIG
  );
  const data = buildMontrealParkData(id);
  Object.assign(CANOPY_SPEC, data.spec);
  if (CANOPY_SPEC.hasCanopy) {
    const skirtMaxH = CANOPY_SPEC.deckY * 0.4;
    CANOPY_SPEC.losGroundBoxes = [
      [-CANOPY_SPEC.rampSkirtOuterX, -CANOPY_SPEC.rampSkirtInnerX, -CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ, skirtMaxH],
      [CANOPY_SPEC.rampSkirtInnerX, CANOPY_SPEC.rampSkirtOuterX, -CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ, skirtMaxH],
      [-1.9, 1.9, -CANOPY_SPEC.launchPierOuterZ, -CANOPY_SPEC.launchPierInnerZ, CANOPY_SPEC.launchLipY + 0.05],
      [-1.9, 1.9, CANOPY_SPEC.launchPierInnerZ, CANOPY_SPEC.launchPierOuterZ, CANOPY_SPEC.launchLipY + 0.05]
    ];
    CANOPY_SPEC.aiPierBoxes = [
      [-1.9, 1.9, -CANOPY_SPEC.launchPierOuterZ, -CANOPY_SPEC.launchPierInnerZ, 1.8],
      [-1.9, 1.9, CANOPY_SPEC.launchPierInnerZ, CANOPY_SPEC.launchPierOuterZ, 1.8]
    ];
    CANOPY_SPEC.aiRampSkirtBoxes = [
      [-CANOPY_SPEC.rampSkirtOuterX, -CANOPY_SPEC.rampSkirtInnerX, -CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ, 1.6],
      [CANOPY_SPEC.rampSkirtInnerX, CANOPY_SPEC.rampSkirtOuterX, -CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ, 1.6]
    ];
  } else {
    CANOPY_SPEC.losGroundBoxes = [];
    CANOPY_SPEC.aiPierBoxes = [];
    CANOPY_SPEC.aiRampSkirtBoxes = [];
  }
  JUNGLE_OBSTACLES.length = 0;
  data.obstacles.forEach((o) => JUNGLE_OBSTACLES.push(o));
  JUNGLE_WALLS.length = 0;
  if (data.walls) data.walls.forEach((w) => JUNGLE_WALLS.push(w));
  JUNGLE_BUSHES.length = 0;
  data.bushes.forEach((b) => JUNGLE_BUSHES.push(b));
  worldState.visionCacheMapId = '';
  ctx.api.rebuildNavGrid?.();
  return MONTREAL_MAPS[id];
}
