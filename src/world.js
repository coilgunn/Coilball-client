// ============================================================================
// COILBALL 3D — MONDE, CARTES DE MONTRÉAL, CANOPÉE, VISION & LIGNE DE VUE
// ============================================================================

import { DEFAULT_FIELD_CONFIG, TUTORIAL_FIELD_CONFIG, RIFT_FIELD_CONFIG, FIELD, state, ctx } from './state.js';
import {
  scene,
  animeGradientMap,
  worldMaterialCache,
  darkenDecorHex,
  createToonMat,
  createBasicMat,
  addAnimeOutline,
  setWorldBuildActive
} from './render3d.js';

const THREE = ctx.THREE;

let worldGroup = null;

export function initWorld() {
  if (!worldGroup) {
    worldGroup = new THREE.Group();
    scene.add(worldGroup);
  }
  ctx.world.worldGroup = worldGroup;
  ctx.world.getTerrainY = getTerrainY;
  ctx.world.getStructureSurfaceY = getStructureSurfaceY;
  ctx.world.MONTREAL_MAPS = MONTREAL_MAPS;
  applyArenaMapData('classic');
  return { worldGroup };
}
// --- CATALOGUE D'ARÈNES : CLASSIQUE + 4 PARCS DE MONTRÉAL ---
function buildClassicArenaSpec() {
  const deckY = 5.6;
  const bridgeHalf = 1.7;
  const sagDepth = 0.34;
  const ascentInnerX = 45.0;
  const ascentOuterX = 58.0;
  const ascentAttachMinX = 55.6;
  const ascentHalfZ = 1.7;
  const rampSkirtInnerX = 51.5;
  const rampSkirtOuterX = 56.0;
  const launchInnerZ = 16.4;
  const launchCommitZ = 17.4;
  const launchOuterZ = 36.5;
  const launchHalfX = 1.7;
  const launchLipY = 2.8;
  const launchPierInnerZ = 31.8;
  const launchPierOuterZ = 36.6;
  const launchLandingZ = 50.0;

  const decks = [
    { id: 'center', x0: -4.4, x1: 4.4, z0: -4.4, z1: 4.4, kind: 'spirit', doors: { n: bridgeHalf, s: bridgeHalf } },
    { id: 'northHub', x0: -3.4, x1: 3.4, z0: -16.4, z1: -9.6, kind: 'hub', doors: { n: launchHalfX, s: bridgeHalf, w: bridgeHalf, e: bridgeHalf } },
    { id: 'southHub', x0: -3.4, x1: 3.4, z0: 9.6, z1: 16.4, kind: 'hub', doors: { n: bridgeHalf, s: launchHalfX, w: bridgeHalf, e: bridgeHalf } },
    { id: 'westGate', x0: -45.0, x1: -38.6, z0: -3.0, z1: 3.0, kind: 'gate', doors: { w: ascentHalfZ, n: bridgeHalf, s: bridgeHalf } },
    { id: 'eastGate', x0: 38.6, x1: 45.0, z0: -3.0, z1: 3.0, kind: 'gate', doors: { e: ascentHalfZ, n: bridgeHalf, s: bridgeHalf } }
  ];

  const bridges = [
    { id: 'northSpine', from: 'center', to: 'northHub', axis: 'z', x0: -bridgeHalf, x1: bridgeHalf, z0: -9.6, z1: -4.4, sag: 0.24 },
    { id: 'southSpine', from: 'center', to: 'southHub', axis: 'z', x0: -bridgeHalf, x1: bridgeHalf, z0: 4.4, z1: 9.6, sag: 0.24 }
  ];

  const trunks = [{ x: 0, z: 0, radius: 2.1, kind: 'spirit' }];
  [-1, 1].forEach((sx) => {
    const side = sx < 0 ? 'w' : 'e';
    const inDirX = sx < 0 ? 'e' : 'w';
    const outDirX = sx < 0 ? 'w' : 'e';
    const gateId = sx < 0 ? 'westGate' : 'eastGate';
    trunks.push({ x: sx * 37.8, z: 0, radius: 0.85, kind: 'gate' });

    [-1, 1].forEach((sz) => {
      const ns = sz < 0 ? 'n' : 's';
      const q = `${ns}${side}`;
      const hubId = sz < 0 ? 'northHub' : 'southHub';
      const inDirZ = sz < 0 ? 's' : 'n';
      const outDirZ = sz < 0 ? 'n' : 's';

      const outerId = `${q}Outer`;
      const bendId = `${q}Bend`;
      const innerId = `${q}Inner`;

      decks.push(
        {
          id: outerId,
          x0: sx < 0 ? -45.0 : 38.6,
          x1: sx < 0 ? -38.6 : 45.0,
          z0: sz < 0 ? -29.7 : 23.3,
          z1: sz < 0 ? -23.3 : 29.7,
          kind: 'outer',
          doors: { [inDirX]: bridgeHalf, [inDirZ]: bridgeHalf }
        },
        {
          id: bendId,
          x0: sx < 0 ? -21.2 : 14.8,
          x1: sx < 0 ? -14.8 : 21.2,
          z0: sz < 0 ? -29.7 : 23.3,
          z1: sz < 0 ? -23.3 : 29.7,
          kind: 'bend',
          doors: { [outDirX]: bridgeHalf, [inDirZ]: bridgeHalf }
        },
        {
          id: innerId,
          x0: sx < 0 ? -21.2 : 14.8,
          x1: sx < 0 ? -14.8 : 21.2,
          z0: sz < 0 ? -16.2 : 9.8,
          z1: sz < 0 ? -9.8 : 16.2,
          kind: 'inner',
          doors: { [outDirZ]: bridgeHalf, [inDirX]: bridgeHalf }
        }
      );

      const forkId = `${sx < 0 ? 'west' : 'east'}Fork${sz < 0 ? 'N' : 'S'}`;
      bridges.push(
        {
          id: forkId,
          from: gateId,
          to: outerId,
          axis: 'z',
          x0: sx * 41.8 - bridgeHalf,
          x1: sx * 41.8 + bridgeHalf,
          z0: sz < 0 ? -23.3 : 3.0,
          z1: sz < 0 ? -3.0 : 23.3,
          sag: 0.46
        },
        {
          id: `${q}OuterBridge`,
          from: outerId,
          to: bendId,
          axis: 'x',
          x0: sx < 0 ? -38.6 : 21.2,
          x1: sx < 0 ? -21.2 : 38.6,
          z0: sz * 26.5 - bridgeHalf,
          z1: sz * 26.5 + bridgeHalf,
          sag: 0.42
        },
        {
          id: `${q}StepBridge`,
          from: bendId,
          to: innerId,
          axis: 'z',
          x0: sx * 18.0 - bridgeHalf,
          x1: sx * 18.0 + bridgeHalf,
          z0: sz < 0 ? -23.3 : 16.2,
          z1: sz < 0 ? -16.2 : 23.3,
          sag: 0.28
        },
        {
          id: `${q}InnerBridge`,
          from: innerId,
          to: hubId,
          axis: 'x',
          x0: sx < 0 ? -14.8 : 3.4,
          x1: sx < 0 ? -3.4 : 14.8,
          z0: sz * 13.0 - bridgeHalf,
          z1: sz * 13.0 + bridgeHalf,
          sag: 0.34
        }
      );

      trunks.push(
        { x: sx * 4.3, z: sz * 17.2, radius: 0.78, kind: 'hub' },
        { x: sx * 22.0, z: sz * 9.0, radius: 0.85, kind: 'inner' },
        { x: sx * 14.0, z: sz * 30.5, radius: 0.88, kind: 'bend' },
        { x: sx * 45.8, z: sz * 30.5, radius: 0.88, kind: 'outer' },
        { x: sx * 2.45, z: sz * 36.0, radius: 0.56, kind: 'bough' }
      );
    });
  });

  decks.forEach((d) => {
    d.cx = (d.x0 + d.x1) / 2;
    d.cz = (d.z0 + d.z1) / 2;
  });

  const walkBoxes = [];
  decks.forEach((d) => {
    walkBoxes.push({ minX: d.x0, maxX: d.x1, minZ: d.z0, maxZ: d.z1, sW: 1, sE: 1, sN: 1, sS: 1 });
  });
  bridges.forEach((b) => {
    if (b.axis === 'x') {
      walkBoxes.push({ minX: b.x0 - 3.2, maxX: b.x1 + 3.2, minZ: b.z0, maxZ: b.z1, sW: 0, sE: 0, sN: 1, sS: 1 });
    } else {
      walkBoxes.push({ minX: b.x0, maxX: b.x1, minZ: b.z0 - 3.2, maxZ: b.z1 + 3.2, sW: 1, sE: 1, sN: 0, sS: 0 });
    }
  });
  walkBoxes.push(
    { minX: -(ascentOuterX + 0.55), maxX: -41.8, minZ: -ascentHalfZ, maxZ: ascentHalfZ, sW: 0, sE: 0, sN: 1, sS: 1 },
    { minX: 41.8, maxX: ascentOuterX + 0.55, minZ: -ascentHalfZ, maxZ: ascentHalfZ, sW: 0, sE: 0, sN: 1, sS: 1 },
    { minX: -launchHalfX, maxX: launchHalfX, minZ: -(launchOuterZ + 0.55), maxZ: -13.0, sW: 1, sE: 1, sN: 0, sS: 0 },
    { minX: -launchHalfX, maxX: launchHalfX, minZ: 13.0, maxZ: launchOuterZ + 0.55, sW: 1, sE: 1, sN: 0, sS: 0 }
  );

  const obstacles = [];
  [-1, 1].forEach((sx) => {
    [-1, 1].forEach((sz) => {
      const side = sx < 0 ? 'ally' : 'enemy';
      obstacles.push(
        { x: sx * 60.0, z: sz * 10.8, radius: 2.6, kind: 'gate', teamSide: side },
        { x: sx * 52.5, z: sz * 23.5, radius: 3.1, kind: 'shrine', teamSide: side },
        { x: sx * 48.8, z: sz * 11.2, radius: 2.8, kind: 'grove', teamSide: side },
        { x: sx * 33.0, z: sz * 18.5, radius: 3.1, kind: 'shrine', teamSide: side },
        { x: sx * 30.0, z: sz * 5.6, radius: 2.6, kind: 'grove', teamSide: side },
        { x: sx * 29.5, z: sz * 31.5, radius: 2.3, kind: 'grove', teamSide: side },
        { x: sx * 9.8, z: sz * 5.8, radius: 2.4, kind: 'gate', teamSide: side },
        { x: sx * 8.5, z: sz * 24.2, radius: 2.6, kind: 'grove', teamSide: side }
      );
    });
  });

  const bushes = [];
  [-1, 1].forEach((sx) => {
    [-1, 1].forEach((sz) => {
      bushes.push(
        { x: sx * 54.0, z: sz * 15.5, radius: 2.4 },
        { x: sx * 37.5, z: sz * 23.5, radius: 2.4 },
        { x: sx * 29.5, z: sz * 11.5, radius: 2.3 },
        { x: sx * 16.2, z: sz * 16.8, radius: 2.4 },
        { x: sx * 5.5, z: sz * 28.5, radius: 2.3 }
      );
    });
  });

  return {
    spec: {
      hasCanopy: true,
      deckY,
      centerHalfX: 4.4,
      centerHalfZ: 4.4,
      bridgeHalf,
      bridgeHalfZ: bridgeHalf,
      sagDepth,
      ascentInnerX,
      ascentOuterX,
      ascentAttachMinX,
      ascentHalfZ,
      rampSkirtInnerX,
      rampSkirtOuterX,
      launchInnerZ,
      launchCommitZ,
      launchOuterZ,
      launchHalfX,
      launchLipY,
      launchPierInnerZ,
      launchPierOuterZ,
      launchLandingZ,
      launchVy: 5.4,
      launchVz: 16.8,
      decks,
      bridges,
      walkBoxes,
      trunks
    },
    obstacles,
    bushes
  };
}

function buildEmptyCanopySpec() {
  return {
    hasCanopy: false,
    deckY: 0,
    centerHalfX: 0,
    centerHalfZ: 0,
    bridgeHalf: 0,
    bridgeHalfZ: 0,
    sagDepth: 0,
    ascentInnerX: 999,
    ascentOuterX: 999,
    ascentAttachMinX: 999,
    ascentHalfZ: 0,
    rampSkirtInnerX: 999,
    rampSkirtOuterX: 999,
    launchInnerZ: 999,
    launchCommitZ: 999,
    launchOuterZ: 999,
    launchHalfX: 0,
    launchLipY: 0,
    launchPierInnerZ: 999,
    launchPierOuterZ: 999,
    launchLandingZ: 50,
    launchVy: 0,
    launchVz: 0,
    decks: [],
    bridges: [],
    walkBoxes: [],
    trunks: []
  };
}

export const PARK_LANDMARKS = {
  lafontaine: {
    pondRx: 32.0,
    pondRz: 13.5,
    bridgeHalfX: 3.4,
    bridgeHalfZ: 14.8,
    bridgeParapetOuterX: 3.85,
    bridgeMaxY: 0.95,
    fountainX: 17.5,
    fountainR: 3.2
  },
  saintViateur: {
    chaletMinX: -8.6,
    chaletMaxX: 8.6,
    chaletMinZ: -6.2,
    chaletMaxZ: 6.2,
    chaletHeight: 6.8,
    islandRx: 14.5,
    islandRz: 11.8,
    pondRx: 23.5,
    pondRz: 19.5,
    bridgeInnerX: 13.4,
    bridgeOuterX: 24.6,
    bridgeHalfZ: 3.2,
    bridgeParapetOuterZ: 3.65,
    bridgeMaxY: 0.78
  },
  jarry: {
    gazeboRadius: 4.7,
    gazeboHeight: 6.9
  },
  montRoyal: {
    plateauR: 13.5,
    hillR: 35.0,
    hillHeight: 7.6,
    crossX: 0,
    crossZ: -5.2,
    crossRadius: 1.5,
    lakeX: 0,
    lakeZ: 4.2,
    lakeRx: 5.8,
    lakeRz: 3.8
  },
  rift: {
    baseRadius: 54.5,
    allyFountainX: -82,
    allyFountainZ: 82,
    enemyFountainX: 82,
    enemyFountainZ: -82,
    centerLakeRadius: 11.5,
    waterfallRadius: 2.05,
    riverHalfWidth: 7.4,
    baronPit: { x: -30, z: -42, r: 8.6 },
    dragonPit: { x: 30, z: 42, r: 8.6 },
    wallChains: (() => {
      const allyChains = [
        // Remparts courbes de la base Or (Sud-Ouest) laissant 3 portes nettes (Top, Mid, Bot)
        { kind: 'base', teamSide: 'ally', radius: 2.05, height: 3.85, pts: [[-69, 36], [-62, 39], [-55, 43]] },
        { kind: 'base', teamSide: 'ally', radius: 2.05, height: 3.85, pts: [[-43, 55], [-39, 62], [-36, 69]] },
        // Bordure extérieure Top Lane (3 tronçons Ouest, dégageant l'embouchure de la rivière NO)
        { kind: 'cliff', teamSide: 'ally', radius: 2.05, height: 3.85, pts: [[-67, 25], [-67, 13]] },
        { kind: 'cliff', teamSide: 'ally', radius: 2.05, height: 3.85, trees: [[1]], pts: [[-67, 1], [-67, -13]] },
        { kind: 'cliff', teamSide: 'ally', radius: 2.0, height: 3.85, pts: [[-67, -24], [-67, -43], [-64, -49]] },
        // Couloir court spécial Dash Rebondissant (quadrant Bleu Or & son symétrique Violet Bot-Est : largeur libre 6.6u)
        { kind: 'cliff', teamSide: 'ally', radius: 1.9, height: 3.85, trees: [[1]], pts: [[-56.5, -24], [-56.5, -43]] },
        // Jungle Or côté Top (Bleu) : anneau en C du Bleu, arc des Loups & banane Mid-Rivière hors du lit de la rivière
        { kind: 'cliff', teamSide: 'ally', radius: 1.95, height: 3.85, trees: [[2]], pts: [[-48, -9], [-40, -11], [-36, -18], [-40, -25], [-48, -26]] },
        { kind: 'cliff', teamSide: 'ally', radius: 1.95, height: 3.85, trees: [[1]], pts: [[-50, 21], [-40, 18], [-35, 10], [-42, 3]] },
        { kind: 'cliff', teamSide: 'ally', radius: 1.9, height: 3.85, pts: [[-22, 8], [-17, -1], [-22, -8]] },
        // Bordure extérieure Bot Lane (3 tronçons Sud symétriques)
        { kind: 'cliff', teamSide: 'ally', radius: 2.05, height: 3.85, pts: [[-25, 67], [-13, 67]] },
        { kind: 'cliff', teamSide: 'ally', radius: 2.05, height: 3.85, trees: [[1]], pts: [[-1, 67], [13, 67]] },
        { kind: 'cliff', teamSide: 'ally', radius: 2.0, height: 3.85, pts: [[24, 67], [43, 67], [49, 64]] },
        // Jungle Or côté Bot (Rouge) : Raptors près du Mid, grand C du Rouge, Krugs & banane Sud-Est hors du lit de la rivière
        { kind: 'cliff', teamSide: 'ally', radius: 1.95, height: 3.85, trees: [[1]], pts: [[-28, 43], [-21, 35], [-12, 37], [-10, 46]] },
        { kind: 'cliff', teamSide: 'ally', radius: 2.0, height: 3.85, trees: [[2]], pts: [[4, 37], [15, 38], [20, 46], [15, 54], [4, 55]] },
        { kind: 'cliff', teamSide: 'ally', radius: 1.95, height: 3.85, trees: [[1]], pts: [[30, 54], [38, 57], [44, 57]] },
        { kind: 'cliff', teamSide: 'ally', radius: 1.9, height: 3.85, pts: [[-8, 22], [1, 17], [8, 22]] },
        // Fosse du Dragon sur le bord Sud-Ouest de la rivière SE (sans empiéter sur le chemin de la rivière)
        { kind: 'pit', teamSide: 'neutral', radius: 1.9, height: 3.85, pts: [[24.5, 36.5], [22.5, 44.0], [28.0, 49.5], [35.5, 47.5]] },
        // Coin arrondi Nord-Ouest (alcôve extérieure)
        { kind: 'cliff', teamSide: 'neutral', radius: 2.0, height: 3.85, pts: [[-87, -76], [-83, -83], [-76, -87]] }
      ];
      // Symétrie rotationnelle 180° (x, z) -> (-x, -z) pour le camp Violet & la fosse du Baron
      const enemyChains = allyChains.map((c) => ({
        kind: c.kind,
        teamSide: c.teamSide === 'ally' ? 'enemy' : c.teamSide === 'enemy' ? 'ally' : 'neutral',
        radius: c.radius,
        height: c.height,
        trees: c.trees,
        pts: c.pts.map(([x, z]) => [-x, -z])
      }));
      return [...allyChains, ...enemyChains];
    })()
  }
};

export function getTerrainY(x, z, mapId = typeof state !== 'undefined' && state ? state.mapId : 'classic') {
  if (mapId === 'mont-royal') {
    const mr = PARK_LANDMARKS.montRoyal;
    const r = Math.hypot(x, z);
    if (r <= mr.plateauR) return mr.hillHeight;
    if (r < mr.hillR) {
      const u = (r - mr.plateauR) / (mr.hillR - mr.plateauR);
      const s = u * u * (3 - 2 * u);
      return mr.hillHeight * (1 - s);
    }
    return 0;
  }
  if (mapId === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    const ax = Math.abs(x);
    const az = Math.abs(z);
    if (ax <= lf.bridgeHalfX + 0.15 && az <= lf.bridgeHalfZ) {
      return lf.bridgeMaxY * Math.cos((az / lf.bridgeHalfZ) * Math.PI * 0.5);
    }
    return 0;
  }
  if (mapId === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    const ax = Math.abs(x);
    const az = Math.abs(z);
    if (ax >= sv.bridgeInnerX && ax <= sv.bridgeOuterX && az <= sv.bridgeHalfZ + 0.15) {
      const u = (ax - sv.bridgeInnerX) / (sv.bridgeOuterX - sv.bridgeInnerX);
      return sv.bridgeMaxY * Math.sin(u * Math.PI);
    }
    return 0;
  }
  return 0;
}

function buildMontrealParkData(mapId) {
  if (mapId === 'tutorial') {
    // Petite arène d'initiation complètement dégagée : sans canopée, sans obstacles ni buissons
    return {
      spec: buildEmptyCanopySpec(),
      obstacles: [],
      bushes: []
    };
  }

  if (mapId === 'classic') return buildClassicArenaSpec();

  if (mapId === 'lafontaine') {
    // Grand étang horizontal (O-E) avec fontaines décoratives & pont central vertical (N-S)
    const obstacles = [];
    const bushes = [];
    [-1, 1].forEach((sx) => {
      [-1, 1].forEach((sz) => {
        const side = sx < 0 ? 'ally' : 'enemy';
        obstacles.push(
          { x: sx * 56.0, z: sz * 11.0, radius: 2.5, kind: 'gate', teamSide: side },
          { x: sx * 47.0, z: sz * 22.5, radius: 2.8, kind: 'shrine', teamSide: side },
          { x: sx * 36.0, z: sz * 10.0, radius: 2.5, kind: 'grove', teamSide: side },
          { x: sx * 25.5, z: sz * 21.5, radius: 2.7, kind: 'shrine', teamSide: side }
        );
        bushes.push(
          { x: sx * 52.0, z: sz * 17.5, radius: 2.4 },
          { x: sx * 39.5, z: sz * 25.5, radius: 2.4 },
          { x: sx * 26.5, z: sz * 16.5, radius: 2.3 },
          { x: sx * 19.5, z: sz * 27.5, radius: 2.3 }
        );
      });
    });
    return {
      spec: buildEmptyCanopySpec(),
      obstacles,
      bushes
    };
  }

  if (mapId === 'saint-viateur') {
    // Chalet sur île centrale entourée d'un étang, reliée par deux ponts Est-Ouest
    const obstacles = [];
    const bushes = [];
    [-1, 1].forEach((sx) => {
      [-1, 1].forEach((sz) => {
        const side = sx < 0 ? 'ally' : 'enemy';
        obstacles.push(
          { x: sx * 55.0, z: sz * 11.5, radius: 2.5, kind: 'gate', teamSide: side },
          { x: sx * 44.5, z: sz * 23.0, radius: 2.8, kind: 'shrine', teamSide: side },
          { x: sx * 31.5, z: sz * 10.5, radius: 2.5, kind: 'grove', teamSide: side },
          { x: sx * 22.5, z: sz * 25.0, radius: 2.7, kind: 'shrine', teamSide: side }
        );
        bushes.push(
          { x: sx * 52.0, z: sz * 20.5, radius: 2.5 },
          { x: sx * 42.0, z: sz * 12.0, radius: 2.4 },
          { x: sx * 34.0, z: sz * 27.5, radius: 2.5 },
          { x: sx * 28.0, z: sz * 16.5, radius: 2.4 },
          { x: sx * 12.5, z: sz * 24.5, radius: 2.4 }
        );
      });
    });
    return {
      spec: buildEmptyCanopySpec(),
      obstacles,
      bushes
    };
  }

  if (mapId === 'jarry') {
    // Parc plat avec le Gazebo octogonal central et quelques arbres dispersés
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
    return {
      spec: buildEmptyCanopySpec(),
      obstacles,
      bushes: []
    };
  }

  if (mapId === 'rift') {
    // Faille de l'Invocateur (League of Legends) : 3 couloirs, 2 bases en coin, rivière diagonale traversable & murs de jungle
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
      // Couloir Top (côté Ouest & Nord)
      { x: -81, z: -26, radius: 2.35 },
      { x: -81, z: -14, radius: 2.35 },
      { x: -24, z: -81, radius: 2.35 },
      { x: -12, z: -81, radius: 2.35 },
      // Tri-bush Top-Left (sortie Nord du couloir rebond) & rivière
      { x: -55, z: -51, radius: 2.35 },
      { x: -37, z: -26, radius: 2.2 },
      // Buisson banane Mid-Top & buisson côté Mid
      { x: -12, z: -6, radius: 2.15 },
      { x: -13, z: 9, radius: 2.15 },
      // Buissons des buffs Bleu & Rouge
      { x: -44, z: -18, radius: 2.35 },
      { x: 11, z: 46, radius: 2.35 }
    ];
    allyBushes.forEach((b) => {
      bushes.push(b);
      // Symétrie centrale exacte (x, z) -> (-x, -z)
      bushes.push({ x: -b.x, z: -b.z, radius: b.radius });
    });

    return {
      spec: buildEmptyCanopySpec(),
      obstacles: [{ x: 0, z: 0, radius: PARK_LANDMARKS.rift.waterfallRadius, kind: 'waterfall', teamSide: 'neutral' }],
      walls,
      bushes
    };
  }

  // Mont-Royal ('mont-royal') : Grande colline centrale + Croix du Mont-Royal + petit lac au sommet
  const obstacles = [];
  const bushes = [];
  [-1, 1].forEach((sx) => {
    [-1, 1].forEach((sz) => {
      const side = sx < 0 ? 'ally' : 'enemy';
      obstacles.push(
        { x: sx * 57.5, z: sz * 11.5, radius: 2.5, kind: 'gate', teamSide: side },
        { x: sx * 47.5, z: sz * 23.5, radius: 2.8, kind: 'shrine', teamSide: side },
        { x: sx * 41.5, z: sz * 10.5, radius: 2.4, kind: 'grove', teamSide: side }
      );
      bushes.push(
        { x: sx * 53.5, z: sz * 18.0, radius: 2.3 },
        { x: sx * 42.0, z: sz * 25.5, radius: 2.3 },
        { x: sx * 38.5, z: sz * 18.5, radius: 2.2 }
      );
    });
  });
  return {
    spec: buildEmptyCanopySpec(),
    obstacles,
    bushes
  };
}

export const MONTREAL_MAPS = {
  classic: {
    id: 'classic',
    icon: '🌳',
    name: 'Arbre-Esprit (Classique)',
    shortName: 'Classique',
    summary: 'Arène Classique • Canopée H 5.6u',
    canopyVisionRange: 102,
    skyHex: 0x7dd3fc,
    fogDensity: 0.0022,
    grassMain: '#34d399',
    grassStripe: '#2dd4bf',
    grassTuftA: '#6ee7b7',
    grassTuftB: '#10b981',
    jungleFloorHex: 0x065f46,
    jungleBorderHex: 0x34d399,
    rockHex: 0x334155,
    foliagePrimaryHex: 0xf472b6,
    foliageSecondaryHex: 0xf9a8d4,
    foliageShrineHex: 0x10b981,
    foliageShrineSecHex: 0x34d399,
    minimapBg: '#071122',
    decorStyle: 'classic'
  },
  lafontaine: {
    id: 'lafontaine',
    icon: '⛲',
    name: 'Parc La Fontaine',
    shortName: 'La Fontaine',
    summary: 'Étang horizontal, fontaines & pont N-S',
    canopyVisionRange: 96,
    skyHex: 0x93c5fd,
    fogDensity: 0.0020,
    grassMain: '#4ade80',
    grassStripe: '#22c55e',
    grassTuftA: '#86efac',
    grassTuftB: '#15803d',
    jungleFloorHex: 0x047857,
    jungleBorderHex: 0x38bdf8,
    rockHex: 0x475569,
    foliagePrimaryHex: 0xf97316,
    foliageSecondaryHex: 0xfbbf24,
    foliageShrineHex: 0x10b981,
    foliageShrineSecHex: 0x34d399,
    minimapBg: '#081829',
    decorStyle: 'lafontaine'
  },
  'saint-viateur': {
    id: 'saint-viateur',
    icon: '🏛️',
    name: 'Parc Saint-Viateur',
    shortName: 'Saint-Viateur',
    summary: 'Chalet sur île centrale & 2 ponts E-O',
    canopyVisionRange: 94,
    skyHex: 0xa5f3fc,
    fogDensity: 0.0021,
    grassMain: '#4ade80',
    grassStripe: '#86efac',
    grassTuftA: '#bbf7d0',
    grassTuftB: '#22c55e',
    jungleFloorHex: 0x065f46,
    jungleBorderHex: 0x2dd4bf,
    rockHex: 0xe2e8f0,
    foliagePrimaryHex: 0x84cc16,
    foliageSecondaryHex: 0xbef264,
    foliageShrineHex: 0x14b8a6,
    foliageShrineSecHex: 0x5eead4,
    minimapBg: '#071722',
    decorStyle: 'saint-viateur'
  },
  jarry: {
    id: 'jarry',
    icon: '🎾',
    name: 'Parc Jarry',
    shortName: 'Jarry',
    summary: 'Terrain plat, Gazebo & arbres dispersés',
    canopyVisionRange: 100,
    skyHex: 0xbae6fd,
    fogDensity: 0.0018,
    grassMain: '#4ade80',
    grassStripe: '#16a34a',
    grassTuftA: '#86efac',
    grassTuftB: '#15803d',
    jungleFloorHex: 0x15803d,
    jungleBorderHex: 0xf97316,
    rockHex: 0xe2e8f0,
    foliagePrimaryHex: 0x22c55e,
    foliageSecondaryHex: 0x4ade80,
    foliageShrineHex: 0x0ea5e9,
    foliageShrineSecHex: 0x38bdf8,
    minimapBg: '#0b192c',
    decorStyle: 'jarry'
  },
  'mont-royal': {
    id: 'mont-royal',
    icon: '⛰️',
    name: 'Parc du Mont-Royal',
    shortName: 'Mont-Royal',
    summary: 'Grande colline, Croix & lac au sommet',
    canopyVisionRange: 116,
    skyHex: 0xcffafe,
    fogDensity: 0.0023,
    grassMain: '#16a34a',
    grassStripe: '#15803d',
    grassTuftA: '#4ade80',
    grassTuftB: '#14532d',
    jungleFloorHex: 0x064e3b,
    jungleBorderHex: 0xfbbf24,
    rockHex: 0x64748b,
    foliagePrimaryHex: 0x15803d,
    foliageSecondaryHex: 0x22c55e,
    foliageShrineHex: 0xd97706,
    foliageShrineSecHex: 0xf59e0b,
    minimapBg: '#06151c',
    decorStyle: 'mont-royal'
  },
  rift: {
    id: 'rift',
    icon: '⚔️',
    name: "Faille de l'Invocateur (LoL)",
    shortName: 'Faille LoL',
    summary: '3 Lanes, Bases en coin & Rivière traversable',
    canopyVisionRange: 102,
    skyHex: 0x3b6e6c,
    fogDensity: 0.0019,
    grassMain: '#2d5a27',
    grassStripe: '#264d21',
    grassTuftA: '#4d7c38',
    grassTuftB: '#1e3f1b',
    jungleFloorHex: 0x1d3b1e,
    jungleBorderHex: 0x65a30d,
    rockHex: 0x334155,
    foliagePrimaryHex: 0x2f6b2f,
    foliageSecondaryHex: 0x4d7c38,
    foliageShrineHex: 0x1e4d2b,
    foliageShrineSecHex: 0x36692b,
    minimapBg: '#111f13',
    decorStyle: 'rift'
  },
  tutorial: {
    id: 'tutorial',
    icon: '🎓',
    name: 'Terrain d’Initiation',
    shortName: 'Initiation',
    summary: 'Petite arène de base sans obstacles',
    canopyVisionRange: 96,
    skyHex: 0x93c5fd,
    fogDensity: 0.0014,
    grassMain: '#4ade80',
    grassStripe: '#34d399',
    grassTuftA: '#bbf7d0',
    grassTuftB: '#22c55e',
    jungleFloorHex: 0x065f46,
    jungleBorderHex: 0x34d399,
    rockHex: 0x475569,
    foliagePrimaryHex: 0x22c55e,
    foliageSecondaryHex: 0x86efac,
    foliageShrineHex: 0x10b981,
    foliageShrineSecHex: 0x34d399,
    minimapBg: '#071b24',
    decorStyle: 'tutorial'
  }
};

// Références stables mutées sur place lors d'un changement d'arène
export const CANOPY_SPEC = {};
export const JUNGLE_OBSTACLES = [];
export const JUNGLE_WALLS = [];
export const JUNGLE_BUSHES = [];

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
  _visionCacheMapId = '';
  ctx.api.rebuildNavGrid?.();
  return MONTREAL_MAPS[id];
}


export function isPointInJungleBush(pos) {
  if (!pos || (pos.y || 0) > 1.6) return null;
  for (let i = 0; i < JUNGLE_BUSHES.length; i++) {
    const b = JUNGLE_BUSHES[i];
    const dx = pos.x - b.x;
    const dz = pos.z - b.z;
    if (dx * dx + dz * dz < b.radius * b.radius) return b;
  }
  return null;
}

// --- SYSTÈME DE VISION DYNAMIQUE PAR ÉQUIPE & OCCLUSION PAR LE DÉCOR ---
export const VISION_SPEC = {
  groundRange: 64,
  canopyRange: 102,
  sittingRange: 26,
  fovHalfAngle: (65 * Math.PI) / 180, // Cône de vision frontal de 130° (±65°)
  cosFovHalf: Math.cos((65 * Math.PI) / 180),
  proximityRadius: 9.5,              // Perception périphérique immédiate (si non bloquée par un mur)
  bushSpotRange: 8.5
};

export function distSqPointToSegment2D(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  let t = 0;
  if (lenSq > 0.0001) {
    t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lenSq));
  }
  const cx = ax + t * vx;
  const cz = az + t * vz;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
}

export function rayToCapsuleDistance2D(ox, oz, dirX, dirZ, ax, az, bx, bz, r, maxDist, minHitDist = 0.15) {
  if (distSqPointToSegment2D(ox, oz, ax, az, bx, bz) <= r * r) return maxDist;
  let best = maxDist;
  const checkEnd = (cx, cz) => {
    const vx = cx - ox;
    const vz = cz - oz;
    const distSq = vx * vx + vz * vz;
    const proj = vx * dirX + vz * dirZ;
    if (proj <= minHitDist || proj - r >= best) return;
    const perpSq = distSq - proj * proj;
    if (perpSq >= r * r) return;
    const hitDist = proj - Math.sqrt(r * r - perpSq);
    if (hitDist > minHitDist && hitDist < best) best = hitDist;
  };
  checkEnd(ax, az);
  checkEnd(bx, bz);

  const sx = bx - ax;
  const sz = bz - az;
  const segLen = Math.hypot(sx, sz);
  if (segLen > 1e-4) {
    const ux = sx / segLen;
    const uz = sz / segLen;
    const nx = -uz;
    const nz = ux;
    const dN = dirX * nx + dirZ * nz;
    if (Math.abs(dN) > 1e-6) {
      const oN = (ox - ax) * nx + (oz - az) * nz;
      for (let side = -1; side <= 1; side += 2) {
        const t = (side * r - oN) / dN;
        if (t > minHitDist && t < best) {
          const hx = ox + dirX * t - ax;
          const hz = oz + dirZ * t - az;
          const u = hx * ux + hz * uz;
          if (u >= 0 && u <= segLen) best = t;
        }
      }
    }
  }
  return best;
}

// Retourne le scalaire t dans [0, 1] si collision, ou -1 sinon (zéro allocation d'objet)
function segmentIntersectsCircle2D(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.0001) return -1;

  // Si l'observateur est déjà à l'intérieur du rayon (ex: positionné au centre d'un deck), ne pas auto-bloquer
  const startDx = ax - cx;
  const startDz = az - cz;
  if (startDx * startDx + startDz * startDz <= r * r) {
    return -1;
  }

  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / lenSq));
  if (t <= 0.02 || t >= 0.98) return -1;
  const px = ax + t * dx;
  const pz = az + t * dz;
  const distSq = (cx - px) * (cx - px) + (cz - pz) * (cz - pz);
  return distSq < r * r ? t : -1;
}

function segmentIntersectsAABB2D(ax, az, bx, bz, minX, maxX, minZ, maxZ) {
  if (ax >= minX && ax <= maxX && az >= minZ && az <= maxZ) {
    return -1;
  }
  const dx = bx - ax;
  const dz = bz - az;
  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < 1e-6) {
    if (ax < minX || ax > maxX) return -1;
  } else {
    let t1 = (minX - ax) / dx;
    let t2 = (maxX - ax) / dx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }

  if (Math.abs(dz) < 1e-6) {
    if (az < minZ || az > maxZ) return -1;
  } else {
    let t1 = (minZ - az) / dz;
    let t2 = (maxZ - az) / dz;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }

  if (tMin >= 0.98 || tMax <= 0.02) return -1;
  return Math.max(0, Math.min(1, (tMin + tMax) * 0.5));
}

function isElevatedObserver(oy) {
  if (CANOPY_SPEC.hasCanopy) return oy >= 3.8;
  if (typeof state !== 'undefined' && state.mapId === 'mont-royal') return oy >= 6.0;
  return false;
}

export function hasClearLineOfSight(fromPos, toPos, isCameraRay = false) {
  const players = ctx.entities.players || [];
  const balls = ctx.entities.balls || [];
  const activeLeafWalls = ctx.entities.activeLeafWalls || [];
  const activeToolWalls = ctx.entities.activeToolWalls || [];
  const activeToolBeacons = ctx.entities.activeToolBeacons || [];
  if (!fromPos || !toPos) return false;
  const ax = fromPos.x || 0;
  const ay = fromPos.y || 0;
  const az = fromPos.z || 0;
  const bx = toPos.x || 0;
  const by = toPos.y || 0;
  const bz = toPos.z || 0;

  const dx = bx - ax;
  const dz = bz - az;
  const distSq = dx * dx + dz * dz;
  if (distSq < 0.64) return true;

  const eyeA = isCameraRay ? ay : ay + 1.45;
  const eyeB = by + 1.45;

  // 0. Murs de Feuille ÉVOLUÉS : si hauts et densément noués qu'ils bloquent entièrement la vue (même depuis la hauteur)
  if (typeof activeLeafWalls !== 'undefined' && activeLeafWalls.length > 0) {
    for (let w = 0; w < activeLeafWalls.length; w++) {
      const wall = activeLeafWalls[w];
      if (wall.phase !== 'grown' || !wall.evolved) continue;
      const nodes = wall.nodes;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const t = segmentIntersectsCircle2D(ax, az, bx, bz, n.x, n.z, 1.08);
        if (t >= 0) {
          const rayY = eyeA + (eyeB - eyeA) * t;
          if (rayY < (n.y || 0) + 7.5) return false;
        }
        if (i < nodes.length - 1) {
          const n2 = nodes[i + 1];
          const mx = (n.x + n2.x) * 0.5;
          const my = ((n.y || 0) + (n2.y || 0)) * 0.5;
          const mz = (n.z + n2.z) * 0.5;
          const tm = segmentIntersectsCircle2D(ax, az, bx, bz, mx, mz, 1.05);
          if (tm >= 0) {
            const rayYm = eyeA + (eyeB - eyeA) * tm;
            if (rayYm < my + 7.5) return false;
          }
        }
      }
    }
  }

  // Un observateur perché sur la canopée (Y >= 3.8) bénéficie d'une vue plongeante panoramique au-dessus des obstacles du sol
  if (CANOPY_SPEC.hasCanopy && ay >= 3.8) {
    return true;
  }

  const activeMapId = typeof state !== 'undefined' && state ? state.mapId : 'classic';

  // Relief de la colline du Mont-Royal : la crête bloque la ligne de visée rasante d'un versant à l'autre
  if (activeMapId === 'mont-royal') {
    const mr = PARK_LANDMARKS.montRoyal;
    const samples = 7;
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      const sx = ax + dx * t;
      const sz = az + dz * t;
      const rayY = eyeA + (eyeB - eyeA) * t;
      if (getTerrainY(sx, sz, 'mont-royal') > rayY + 0.15) return false;
    }
    const crossT = segmentIntersectsCircle2D(ax, az, bx, bz, mr.crossX, mr.crossZ, mr.crossRadius - 0.1);
    if (crossT >= 0) {
      const rayY = eyeA + (eyeB - eyeA) * crossT;
      if (rayY < mr.hillHeight + 3.8) return false;
    }
  }

  // Chalet central du Parc Saint-Viateur
  if (activeMapId === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    const chaletT = segmentIntersectsAABB2D(ax, az, bx, bz, sv.chaletMinX, sv.chaletMaxX, sv.chaletMinZ, sv.chaletMaxZ);
    if (chaletT >= 0) {
      const rayY = eyeA + (eyeB - eyeA) * chaletT;
      if (rayY < sv.chaletHeight) return false;
    }
  }

  // Fontaines décoratives dans le grand étang horizontal de La Fontaine
  if (activeMapId === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    for (const fx of [-lf.fountainX, lf.fountainX]) {
      const ft = segmentIntersectsCircle2D(ax, az, bx, bz, fx, 0, lf.fountainR * 0.72);
      if (ft >= 0) {
        const rayY = eyeA + (eyeB - eyeA) * ft;
        if (rayY < 3.4) return false;
      }
    }
  }

  // 1. Troncs des grands arbres (bloquent la vue sous la canopée Y < 5.3)
  const trunks = CANOPY_SPEC.trunks;
  for (let i = 0; i < trunks.length; i++) {
    const tr = trunks[i];
    const t = segmentIntersectsCircle2D(ax, az, bx, bz, tr.x, tr.z, tr.radius + 0.08);
    if (t >= 0) {
      const rayY = eyeA + (eyeB - eyeA) * t;
      if (rayY < CANOPY_SPEC.deckY - 0.3) return false;
    }
  }

  // 2. Obstacles solides de la jungle / Gazebo de Jarry / Chute d'eau centrale
  for (let i = 0; i < JUNGLE_OBSTACLES.length; i++) {
    const obs = JUNGLE_OBSTACLES[i];
    const obsHeight = obs.kind === 'gazebo' ? PARK_LANDMARKS.jarry.gazeboHeight : obs.kind === 'waterfall' ? 25.0 : 3.85;
    const t = segmentIntersectsCircle2D(ax, az, bx, bz, obs.x, obs.z, obs.radius - 0.08);
    if (t >= 0) {
      const rayY = eyeA + (eyeB - eyeA) * t;
      if (rayY < obsHeight) return false;
    }
  }

  // 2b. Falaises & murs de jungle (Faille de l'Invocateur)
  if (JUNGLE_WALLS.length > 0) {
    const segLen = Math.sqrt(distSq);
    const invLen = 1 / Math.max(0.0001, segLen);
    const dirX = dx * invLen;
    const dirZ = dz * invLen;
    for (let i = 0; i < JUNGLE_WALLS.length; i++) {
      const w = JUNGLE_WALLS[i];
      const hitD = rayToCapsuleDistance2D(ax, az, dirX, dirZ, w.ax, w.az, w.bx, w.bz, w.radius - 0.08, segLen, 0.02 * segLen);
      if (hitD < segLen * 0.98) {
        const t = hitD * invLen;
        const rayY = eyeA + (eyeB - eyeA) * t;
        if (rayY < (w.height || 3.85)) return false;
      }
    }
  }

  // 3. Soubassements pleins des rampes Ouest/Est & culées Nord/Sud des Sky-Launches
  const groundBoxes = CANOPY_SPEC.losGroundBoxes;
  for (let i = 0; i < groundBoxes.length; i++) {
    const box = groundBoxes[i];
    const t = segmentIntersectsAABB2D(ax, az, bx, bz, box[0], box[1], box[2], box[3]);
    if (t >= 0) {
      const rayY = eyeA + (eyeB - eyeA) * t;
      if (rayY < box[4]) return false;
    }
  }

  // 4. Rideau de hautes herbes : totalement dégagé quand l'observateur (ou cible/ward) y est, bloque la vue venant de l'extérieur
  for (let i = 0; i < JUNGLE_BUSHES.length; i++) {
    const b = JUNGLE_BUSHES[i];
    const startR = b.radius + 0.15;
    const startInBush = (ax - b.x) * (ax - b.x) + (az - b.z) * (az - b.z) <= startR * startR;
    const endInBush = (bx - b.x) * (bx - b.x) + (bz - b.z) * (bz - b.z) <= startR * startR;
    if (startInBush || endInBush) continue;
    const t = segmentIntersectsCircle2D(ax, az, bx, bz, b.x, b.z, b.radius * 0.9);
    if (t >= 0) {
      const rayY = eyeA + (eyeB - eyeA) * t;
      if (rayY < 2.15) return false;
    }
  }

  // 5. Murs d'arbres & branches entrelacées (Ultimate de Feuille)
  if (typeof activeLeafWalls !== 'undefined' && activeLeafWalls.length > 0) {
    for (let w = 0; w < activeLeafWalls.length; w++) {
      const wall = activeLeafWalls[w];
      if (wall.phase !== 'grown' || wall.evolved) continue;
      const nodes = wall.nodes;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const t = segmentIntersectsCircle2D(ax, az, bx, bz, n.x, n.z, 0.92);
        if (t >= 0) {
          const rayY = eyeA + (eyeB - eyeA) * t;
          if (rayY < (n.y || 0) + 3.85) return false;
        }
        if (i < nodes.length - 1) {
          const n2 = nodes[i + 1];
          const mx = (n.x + n2.x) * 0.5;
          const my = ((n.y || 0) + (n2.y || 0)) * 0.5;
          const mz = (n.z + n2.z) * 0.5;
          const tm = segmentIntersectsCircle2D(ax, az, bx, bz, mx, mz, 0.92);
          if (tm >= 0) {
            const rayYm = eyeA + (eyeB - eyeA) * tm;
            if (rayYm < my + 3.85) return false;
          }
        }
      }
    }
  }

  // 6. Murs déployables 3 m (Outil)
  if (typeof activeToolWalls !== 'undefined' && activeToolWalls.length > 0) {
    for (let w = 0; w < activeToolWalls.length; w++) {
      const tw = activeToolWalls[w];
      for (let s = 0; s < 5; s++) {
        const u = 0.1 + s * 0.2;
        const cx = tw.ax + (tw.bx - tw.ax) * u;
        const cz = tw.az + (tw.bz - tw.az) * u;
        const t = segmentIntersectsCircle2D(ax, az, bx, bz, cx, cz, 0.45);
        if (t >= 0) {
          const rayY = eyeA + (eyeB - eyeA) * t;
          if (rayY < (tw.cy || 0) + tw.height) return false;
        }
      }
    }
  }

  return true;
}

function isEntityInsideSameBushOrCanopy(obsPos, targetBush) {
  if (!obsPos || !targetBush) return false;
  if (CANOPY_SPEC.hasCanopy && (obsPos.y || 0) >= 3.8) return true;
  const revealR = targetBush.radius + 0.45;
  const dx = obsPos.x - targetBush.x;
  const dz = obsPos.z - targetBush.z;
  return dx * dx + dz * dz <= revealR * revealR;
}

export function hasAllyVisionNear(pos, maxDist = VISION_SPEC.bushSpotRange, observerTeam = state.myTeam) {
  const players = ctx.entities.players || [];
  const activeToolBeacons = ctx.entities.activeToolBeacons || [];
  const targetBush = isPointInJungleBush(pos);
  const maxDistSq = maxDist * maxDist;
  for (let i = 0; i < players.length; i++) {
    const mate = players[i];
    if (mate.tutorialHidden || mate.team !== observerTeam || mate.state === 'sitting') continue;
    if (targetBush) {
      if (isEntityInsideSameBushOrCanopy(mate.pos, targetBush) && hasClearLineOfSight(mate.pos, pos, false)) {
        return true;
      }
      continue;
    }
    const dx = mate.pos.x - pos.x;
    const dz = mate.pos.z - pos.z;
    if (dx * dx + dz * dz < maxDistSq && hasClearLineOfSight(mate.pos, pos, false)) {
      return true;
    }
  }
  if (typeof activeToolBeacons !== 'undefined') {
    for (let i = 0; i < activeToolBeacons.length; i++) {
      const b = activeToolBeacons[i];
      if (b.team !== observerTeam) continue;
      if (targetBush) {
        if (isEntityInsideSameBushOrCanopy(b.pos, targetBush) && hasClearLineOfSight(b.pos, pos, false)) {
          return true;
        }
        continue;
      }
      const dx = b.x - pos.x;
      const dz = b.z - pos.z;
      if (dx * dx + dz * dz < maxDistSq && hasClearLineOfSight(b.pos, pos, false)) {
        return true;
      }
    }
  }
  return false;
}

export function canPlayerSeePoint(observer, targetPos, targetStealthBush = null) {
  if (!observer || !targetPos) return false;
  const ox = observer.pos.x;
  const oy = observer.pos.y || 0;
  const oz = observer.pos.z;
  const tx = targetPos.x;
  const tz = targetPos.z;

  const dx = tx - ox;
  const dz = tz - oz;
  const dist = Math.hypot(dx, dz);

  if (targetStealthBush) {
    if (observer.state === 'sitting') return false;
    const bushObj = typeof targetStealthBush === 'object' ? targetStealthBush : isPointInJungleBush(targetPos);
    if (bushObj) {
      return isEntityInsideSameBushOrCanopy(observer.pos, bushObj) && hasClearLineOfSight(observer.pos, targetPos, false);
    }
    return dist <= VISION_SPEC.bushSpotRange && hasClearLineOfSight(observer.pos, targetPos, false);
  }

  const maxRange =
    observer.state === 'sitting'
      ? VISION_SPEC.sittingRange
      : isElevatedObserver(oy)
      ? VISION_SPEC.canopyRange
      : VISION_SPEC.groundRange;
  if (dist > maxRange) return false;

  if (dist > VISION_SPEC.proximityRadius || observer.state === 'sitting') {
    const fx = Math.sin(observer.facingAngle || 0);
    const fz = Math.cos(observer.facingAngle || 0);
    const cosAngle = (dx * fx + dz * fz) / Math.max(0.0001, dist);
    if (cosAngle < VISION_SPEC.cosFovHalf) {
      return false;
    }
  }

  return hasClearLineOfSight(observer.pos, targetPos, false);
}

export function isPlayerVisibleToTeam(targetPlayer, observerTeam = state.myTeam) {
  const players = ctx.entities.players || [];
  const activeToolBeacons = ctx.entities.activeToolBeacons || [];
  if (!targetPlayer || targetPlayer.tutorialHidden) return false;
  if (targetPlayer.team === observerTeam) return true;
  if (
    targetPlayer.state === 'rule1' &&
    targetPlayer.rule1Partner &&
    targetPlayer.rule1Partner.team === observerTeam
  ) {
    return true;
  }

  const targetBush =
    targetPlayer.state === 'standing' ? isPointInJungleBush(targetPlayer.pos) : null;

  for (let i = 0; i < players.length; i++) {
    const obs = players[i];
    if (obs.tutorialHidden || obs.team !== observerTeam) continue;
    if (canPlayerSeePoint(obs, targetPlayer.pos, targetBush)) {
      return true;
    }
  }
  if (typeof activeToolBeacons !== 'undefined') {
    for (let i = 0; i < activeToolBeacons.length; i++) {
      const b = activeToolBeacons[i];
      if (b.team !== observerTeam) continue;
      if (targetBush) {
        if (isEntityInsideSameBushOrCanopy(b.pos, targetBush) && hasClearLineOfSight(b.pos, targetPlayer.pos, false)) {
          return true;
        }
        continue;
      }
      const dist = Math.hypot(targetPlayer.pos.x - b.x, targetPlayer.pos.z - b.z);
      if (dist <= b.visionRadius && hasClearLineOfSight(b.pos, targetPlayer.pos, false)) {
        return true;
      }
    }
  }
  return false;
}

let _visionCacheMapId = '';
let _visionCacheLen = -1;
let _visionCacheNums = new Float64Array(64);

export function updateTeamVisionState(force = false) {
  const players = ctx.entities.players || [];
  const balls = ctx.entities.balls || [];
  const activeLeafWalls = ctx.entities.activeLeafWalls || [];
  const activeToolWalls = ctx.entities.activeToolWalls || [];
  const activeToolBeacons = ctx.entities.activeToolBeacons || [];
  const beaconsLen = typeof activeToolBeacons !== 'undefined' ? activeToolBeacons.length : 0;
  const wallsLen =
    (typeof activeLeafWalls !== 'undefined' ? activeLeafWalls.length : 0) +
    (typeof activeToolWalls !== 'undefined' ? activeToolWalls.length : 0);
  const neededLen = players.length * 7 + balls.length * 3 + 4;
  if (_visionCacheNums.length < neededLen) {
    _visionCacheNums = new Float64Array(neededLen);
    _visionCacheLen = -1;
  }

  let same = !force && _visionCacheMapId === state.mapId && _visionCacheLen === neededLen;
  let idx = 0;

  const checkWrite = (val) => {
    if (same && _visionCacheNums[idx] !== val) same = false;
    _visionCacheNums[idx++] = val;
  };

  checkWrite(players.length);
  checkWrite(balls.length);
  checkWrite(beaconsLen);
  checkWrite(wallsLen);
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    checkWrite(p.pos.x);
    checkWrite(p.pos.y || 0);
    checkWrite(p.pos.z);
    checkWrite(p.facingAngle || 0);
    checkWrite(p.state === 'sitting' ? 1 : p.state === 'rule1' ? 2 : 0);
    checkWrite(p.rule1Partner ? players.indexOf(p.rule1Partner) : -1);
    checkWrite(p.tutorialHidden ? 1 : 0);
  }
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    checkWrite(b.state === 'carried' ? 1 : b.state === 'scored' ? 2 : 0);
    checkWrite(b.carrier ? players.indexOf(b.carrier) : -1);
    checkWrite(b.tutorialHidden ? 1 : 0);
  }

  if (same) return;
  _visionCacheMapId = state.mapId;
  _visionCacheLen = neededLen;

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p.visibleTo) p.visibleTo = { ally: true, enemy: true };
    if (p.tutorialHidden) {
      p.visibleTo.ally = false;
      p.visibleTo.enemy = false;
      continue;
    }
    p.visibleTo.ally = isPlayerVisibleToTeam(p, 'ally');
    p.visibleTo.enemy = isPlayerVisibleToTeam(p, 'enemy');
  }
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (!b.visibleTo) b.visibleTo = { ally: true, enemy: true };
    if (b.tutorialHidden) {
      b.visibleTo.ally = false;
      b.visibleTo.enemy = false;
      continue;
    }
    if (b.state === 'carried' && b.carrier) {
      b.visibleTo.ally = !!b.carrier.visibleTo.ally;
      b.visibleTo.enemy = !!b.carrier.visibleTo.enemy;
    } else {
      b.visibleTo.ally = true;
      b.visibleTo.enemy = true;
    }
  }
}

export function castVisionRay2D(ox, oy, oz, dirX, dirZ, maxLen) {
  const players = ctx.entities.players || [];
  const balls = ctx.entities.balls || [];
  const activeLeafWalls = ctx.entities.activeLeafWalls || [];
  const activeToolWalls = ctx.entities.activeToolWalls || [];
  const activeToolBeacons = ctx.entities.activeToolBeacons || [];
  let minDist = maxLen;
  const halfW = FIELD.width / 2;
  const halfD = FIELD.depth / 2;

  if (dirX > 1e-5) minDist = Math.min(minDist, (halfW - ox) / dirX);
  else if (dirX < -1e-5) minDist = Math.min(minDist, (-halfW - ox) / dirX);
  if (dirZ > 1e-5) minDist = Math.min(minDist, (halfD - oz) / dirZ);
  else if (dirZ < -1e-5) minDist = Math.min(minDist, (-halfD - oz) / dirZ);

  const checkCircle = (cx, cz, r, minHitDist = 0.15) => {
    const vx = cx - ox;
    const vz = cz - oz;
    const distSq = vx * vx + vz * vz;
    if (distSq <= r * r) return;
    const proj = vx * dirX + vz * dirZ;
    if (proj <= minHitDist || proj - r >= minDist) return;
    const perpSq = distSq - proj * proj;
    if (perpSq >= r * r) return;
    const hitDist = proj - Math.sqrt(r * r - perpSq);
    if (hitDist > minHitDist && hitDist < minDist) {
      minDist = hitDist;
    }
  };

  const checkAABB = (minX, maxX, minZ, maxZ) => {
    if (ox >= minX && ox <= maxX && oz >= minZ && oz <= maxZ) return;
    let tMin = 0;
    let tMax = minDist;
    if (Math.abs(dirX) < 1e-6) {
      if (ox < minX || ox > maxX) return;
    } else {
      let t1 = (minX - ox) / dirX;
      let t2 = (maxX - ox) / dirX;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return;
    }
    if (Math.abs(dirZ) < 1e-6) {
      if (oz < minZ || oz > maxZ) return;
    } else {
      let t1 = (minZ - oz) / dirZ;
      let t2 = (maxZ - oz) / dirZ;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return;
    }
    if (tMin > 0.15 && tMin < minDist) {
      minDist = tMin;
    }
  };

  const activeMapId = typeof state !== 'undefined' && state ? state.mapId : 'classic';
  const isCanopyElevated = CANOPY_SPEC.hasCanopy && oy >= 3.8;

  if (activeMapId === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;
    checkAABB(sv.chaletMinX, sv.chaletMaxX, sv.chaletMinZ, sv.chaletMaxZ);
  }
  if (activeMapId === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    checkCircle(-lf.fountainX, 0, lf.fountainR * 0.72, 0.2);
    checkCircle(lf.fountainX, 0, lf.fountainR * 0.72, 0.2);
  }
  if (activeMapId === 'mont-royal') {
    const mr = PARK_LANDMARKS.montRoyal;
    checkCircle(mr.crossX, mr.crossZ, mr.crossRadius - 0.1, 0.2);
    if (oy < mr.hillHeight - 1.4) {
      const marchMax = Math.min(minDist, 52);
      for (let d = 2.0; d < marchMax; d += 2.0) {
        if (getTerrainY(ox + dirX * d, oz + dirZ * d, 'mont-royal') > oy + 1.55) {
          minDist = Math.min(minDist, d);
          break;
        }
      }
    }
  }

  // Murs de Feuille ÉVOLUÉS : bloquent toujours entièrement la vision (sol & canopée)
  if (typeof activeLeafWalls !== 'undefined' && activeLeafWalls.length > 0) {
    for (let w = 0; w < activeLeafWalls.length; w++) {
      const wall = activeLeafWalls[w];
      if (wall.phase !== 'grown' || !wall.evolved) continue;
      const nodes = wall.nodes;
      for (let i = 0; i < nodes.length; i++) {
        checkCircle(nodes[i].x, nodes[i].z, 1.08, 0.2);
        if (i < nodes.length - 1) {
          checkCircle(
            (nodes[i].x + nodes[i + 1].x) * 0.5,
            (nodes[i].z + nodes[i + 1].z) * 0.5,
            1.05,
            0.2
          );
        }
      }
    }
  }

  if (!isCanopyElevated) {
    for (let i = 0; i < CANOPY_SPEC.trunks.length; i++) {
      const tr = CANOPY_SPEC.trunks[i];
      checkCircle(tr.x, tr.z, tr.radius + 0.08, 0.2);
    }
    for (let i = 0; i < JUNGLE_OBSTACLES.length; i++) {
      const obs = JUNGLE_OBSTACLES[i];
      checkCircle(obs.x, obs.z, obs.radius - 0.05, 0.2);
    }
    for (let i = 0; i < JUNGLE_WALLS.length; i++) {
      const w = JUNGLE_WALLS[i];
      minDist = rayToCapsuleDistance2D(ox, oz, dirX, dirZ, w.ax, w.az, w.bx, w.bz, w.radius - 0.05, minDist, 0.2);
    }
    for (let i = 0; i < JUNGLE_BUSHES.length; i++) {
      const b = JUNGLE_BUSHES[i];
      const dxB = ox - b.x;
      const dzB = oz - b.z;
      const inR = b.radius + 0.15;
      // Observateur ou balise (ward) à l'intérieur du buisson : vue 100 % dégagée
      if (dxB * dxB + dzB * dzB <= inR * inR) continue;
      checkCircle(b.x, b.z, b.radius * 0.9, 0.2);
    }
    if (typeof activeLeafWalls !== 'undefined' && activeLeafWalls.length > 0) {
      for (let w = 0; w < activeLeafWalls.length; w++) {
        const wall = activeLeafWalls[w];
        if (wall.phase !== 'grown' || wall.evolved) continue;
        const nodes = wall.nodes;
        for (let i = 0; i < nodes.length; i++) {
          checkCircle(nodes[i].x, nodes[i].z, 0.92, 0.2);
          if (i < nodes.length - 1) {
            checkCircle(
              (nodes[i].x + nodes[i + 1].x) * 0.5,
              (nodes[i].z + nodes[i + 1].z) * 0.5,
              0.92,
              0.2
            );
          }
        }
      }
    }
    if (typeof activeToolWalls !== 'undefined' && activeToolWalls.length > 0) {
      for (let w = 0; w < activeToolWalls.length; w++) {
        const tw = activeToolWalls[w];
        for (let s = 0; s < 5; s++) {
          const u = 0.1 + s * 0.2;
          checkCircle(tw.ax + (tw.bx - tw.ax) * u, tw.az + (tw.bz - tw.az) * u, 0.45, 0.2);
        }
      }
    }
  }

  return Math.max(0.5, minDist);
}

export function fillPlayerVisionPolygonFlat(p, coneSteps, backSteps, outXY) {
  if (!p) return 0;
  const ox = p.pos.x;
  const oy = p.pos.y || 0;
  const oz = p.pos.z;
  const facing = p.facingAngle || 0;
  const maxRange =
    p.state === 'sitting'
      ? VISION_SPEC.sittingRange
      : isElevatedObserver(oy)
      ? VISION_SPEC.canopyRange
      : VISION_SPEC.groundRange;
  const fovHalf = VISION_SPEC.fovHalfAngle;
  const prox = p.state === 'sitting' ? 4.5 : VISION_SPEC.proximityRadius;

  let count = 0;
  for (let i = 0; i <= coneSteps; i++) {
    const u = i / coneSteps;
    const ang = facing - fovHalf + u * (fovHalf * 2);
    const dx = Math.sin(ang);
    const dz = Math.cos(ang);
    const d = castVisionRay2D(ox, oy, oz, dx, dz, maxRange);
    outXY[count * 2] = ox + dx * d;
    outXY[count * 2 + 1] = oz + dz * d;
    count++;
  }

  const backArc = Math.PI * 2 - fovHalf * 2;
  for (let i = 1; i < backSteps; i++) {
    const u = i / backSteps;
    const ang = facing + fovHalf + u * backArc;
    const dx = Math.sin(ang);
    const dz = Math.cos(ang);
    const d = castVisionRay2D(ox, oy, oz, dx, dz, prox);
    outXY[count * 2] = ox + dx * d;
    outXY[count * 2 + 1] = oz + dz * d;
    count++;
  }
  return count;
}

export function computePlayerVisionPolygon(p, coneSteps = 28, backSteps = 10) {
  if (!p) return [];
  const buf = new Float64Array((coneSteps + backSteps + 2) * 2);
  const count = fillPlayerVisionPolygonFlat(p, coneSteps, backSteps, buf);
  const pts = new Array(count);
  for (let i = 0; i < count; i++) {
    pts[i] = { x: buf[i * 2], z: buf[i * 2 + 1] };
  }
  return pts;
}

export function getCanopySurfaceY(x, z) {
  for (let i = 0; i < CANOPY_SPEC.decks.length; i++) {
    const d = CANOPY_SPEC.decks[i];
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) {
      return {
        zone: d.id === 'center' ? 'centerDeck' : d.id,
        deckId: d.id,
        y: CANOPY_SPEC.deckY
      };
    }
  }

  for (let i = 0; i < CANOPY_SPEC.bridges.length; i++) {
    const b = CANOPY_SPEC.bridges[i];
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) {
      const rawU =
        b.axis === 'x'
          ? (x - b.x0) / Math.max(0.001, b.x1 - b.x0)
          : (z - b.z0) / Math.max(0.001, b.z1 - b.z0);
      const u = Math.max(0, Math.min(1, rawU));
      return {
        zone: b.id,
        bridge: b,
        y: CANOPY_SPEC.deckY - b.sag * Math.sin(Math.PI * u)
      };
    }
  }

  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax > CANOPY_SPEC.ascentInnerX && ax <= CANOPY_SPEC.ascentOuterX && az <= CANOPY_SPEC.ascentHalfZ) {
    const span = CANOPY_SPEC.ascentOuterX - CANOPY_SPEC.ascentInnerX;
    const t = Math.max(0, Math.min(1, (CANOPY_SPEC.ascentOuterX - ax) / span));
    return {
      zone: x < 0 ? 'westRamp' : 'eastRamp',
      y: CANOPY_SPEC.deckY * t
    };
  }

  if (az > CANOPY_SPEC.launchInnerZ && az <= CANOPY_SPEC.launchOuterZ && ax <= CANOPY_SPEC.launchHalfX) {
    const span = CANOPY_SPEC.launchOuterZ - CANOPY_SPEC.launchInnerZ;
    const u = Math.max(0, Math.min(1, (az - CANOPY_SPEC.launchInnerZ) / span));
    return {
      zone: z < 0 ? 'northLaunch' : 'southLaunch',
      y: CANOPY_SPEC.deckY - (CANOPY_SPEC.deckY - CANOPY_SPEC.launchLipY) * u
    };
  }

  return null;
}

export function getStructureSurfaceY(x, z, onCanopy = false) {
  if (!onCanopy || !CANOPY_SPEC.hasCanopy) return { zone: 'ground', y: getTerrainY(x, z) };
  return getCanopySurfaceY(x, z) || { zone: 'ground', y: getTerrainY(x, z) };
}

export function enforceCanopyRails(pos, railRadius = 0.56) {
  const boxes = CANOPY_SPEC.walkBoxes;
  let bestDistSq = Infinity;
  let bestX = pos.x;
  let bestZ = pos.z;

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const minX = b.minX + b.sW * railRadius;
    const maxX = b.maxX - b.sE * railRadius;
    const minZ = b.minZ + b.sN * railRadius;
    const maxZ = b.maxZ - b.sS * railRadius;
    const clampedMinX = Math.min(minX, maxX);
    const clampedMaxX = Math.max(minX, maxX);
    const clampedMinZ = Math.min(minZ, maxZ);
    const clampedMaxZ = Math.max(minZ, maxZ);

    if (
      pos.x >= clampedMinX &&
      pos.x <= clampedMaxX &&
      pos.z >= clampedMinZ &&
      pos.z <= clampedMaxZ
    ) {
      return;
    }

    const cx = Math.max(clampedMinX, Math.min(clampedMaxX, pos.x));
    const cz = Math.max(clampedMinZ, Math.min(clampedMaxZ, pos.z));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestX = cx;
      bestZ = cz;
    }
  }

  pos.x = bestX;
  pos.z = bestZ;
}

export function pushOutAABB(pos, minX, maxX, minZ, maxZ, radius, bounceVel = null) {
  const cX = Math.max(minX, Math.min(maxX, pos.x));
  const cZ = Math.max(minZ, Math.min(maxZ, pos.z));
  const dx = pos.x - cX;
  const dz = pos.z - cZ;
  const distSq = dx * dx + dz * dz;
  if (distSq >= radius * radius) return;

  let nx = 0;
  let nz = 0;
  if (distSq > 0.00001) {
    const dist = Math.sqrt(distSq);
    nx = dx / dist;
    nz = dz / dist;
    pos.x = cX + nx * radius;
    pos.z = cZ + nz * radius;
  } else {
    const toLeft = pos.x - minX;
    const toRight = maxX - pos.x;
    const toTop = pos.z - minZ;
    const toBot = maxZ - pos.z;
    const m = Math.min(toLeft, toRight, toTop, toBot);
    if (m === toLeft) {
      pos.x = minX - radius;
      nx = -1;
    } else if (m === toRight) {
      pos.x = maxX + radius;
      nx = 1;
    } else if (m === toTop) {
      pos.z = minZ - radius;
      nz = -1;
    } else {
      pos.z = maxZ + radius;
      nz = 1;
    }
  }

  if (bounceVel) {
    const vn = bounceVel.x * nx + bounceVel.z * nz;
    if (vn < 0) {
      bounceVel.x -= 1.55 * vn * nx;
      bounceVel.z -= 1.55 * vn * nz;
    }
  }
}

export function pushOutEllipse(pos, cx, cz, rx, rz, entityRadius, bounceVel = null) {
  const erx = rx + entityRadius;
  const erz = rz + entityRadius;
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const sx = dx / erx;
  const sz = dz / erz;
  const ellSq = sx * sx + sz * sz;
  if (ellSq >= 1) return;

  const ellLen = Math.sqrt(ellSq);
  if (ellLen > 0.0001) {
    const ux = sx / ellLen;
    const uz = sz / ellLen;
    pos.x = cx + ux * erx;
    pos.z = cz + uz * erz;
    if (bounceVel) {
      let nx = ux / erx;
      let nz = uz / erz;
      const nLen = Math.hypot(nx, nz) || 1;
      nx /= nLen;
      nz /= nLen;
      const vn = bounceVel.x * nx + bounceVel.z * nz;
      if (vn < 0) {
        bounceVel.x -= 1.55 * vn * nx;
        bounceVel.z -= 1.55 * vn * nz;
      }
    }
  } else {
    pos.x = cx + erx;
  }
}


// Signature d'un matériau : deux matériaux de même signature sont visuellement identiques
function getMaterialMergeSignature(m) {
  if (!m || Array.isArray(m) || m.map || m.alphaMap || m.envMap || m.vertexColors) return null;
  return [
    m.type,
    m.color ? m.color.getHex() : '',
    m.emissive ? m.emissive.getHex() : '',
    m.emissiveIntensity !== undefined ? m.emissiveIntensity : '',
    m.opacity,
    m.transparent ? 1 : 0,
    m.side,
    m.depthWrite ? 1 : 0,
    m.gradientMap ? m.gradientMap.uuid : ''
  ].join('|');
}

// Fusionne toutes les meshes statiques du décor partageant le même matériau en une seule géométrie.
// Les arbres/feuillages masquables par la caméra (cameraTreeOccluders) restent des objets distincts.
function mergeStaticWorldMeshes() {
  worldGroup.updateMatrixWorld(true);
  const keepSet = new Set();
  cameraTreeOccluders.forEach((occ) => occ.node.traverse((n) => keepSet.add(n)));

  const invRoot = new THREE.Matrix4().copy(worldGroup.matrixWorld).invert();
  const tmpMatrix = new THREE.Matrix4();
  const tmpBox = new THREE.Box3();
  const buckets = new Map();
  const removable = new Set();

  const isMergeableMesh = (obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh || keepSet.has(obj) || !obj.visible) return false;
    const g = obj.geometry;
    if (!g || !g.isBufferGeometry || !g.attributes.position || !g.attributes.normal) return false;
    if (obj.matrixWorld.determinant() <= 0) return false;
    const sig = getMaterialMergeSignature(obj.material);
    if (!sig) return false;
    if (obj.material.transparent) {
      // Seuls les décalques plats au sol (anneaux, eau, pistes) sont fusionnés pour préserver le tri de transparence
      if (!g.boundingBox) g.computeBoundingBox();
      tmpBox.copy(g.boundingBox).applyMatrix4(obj.matrixWorld);
      if (tmpBox.max.y - tmpBox.min.y > 0.12 || tmpBox.max.y > 0.2) return false;
    }
    return true;
  };

  // Parcours post-ordre : une mesh n'est retirée que si tous ses descendants le sont aussi
  const visit = (obj) => {
    let allChildrenRemovable = true;
    for (let i = 0; i < obj.children.length; i++) {
      if (!visit(obj.children[i])) allChildrenRemovable = false;
    }
    if (obj === worldGroup) return false;
    if (allChildrenRemovable && isMergeableMesh(obj)) {
      const key = `${getMaterialMergeSignature(obj.material)}|${obj.castShadow ? 1 : 0}${obj.receiveShadow ? 1 : 0}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material: obj.material, castShadow: obj.castShadow, receiveShadow: obj.receiveShadow, items: [] };
        buckets.set(key, bucket);
      }
      bucket.items.push(obj);
      removable.add(obj);
      return true;
    }
    if (allChildrenRemovable && obj.type === 'Group' && !keepSet.has(obj)) {
      removable.add(obj);
      return true;
    }
    return false;
  };
  visit(worldGroup);

  const unmarkRemovableAncestors = (obj) => {
    let cur = obj;
    while (cur && cur !== worldGroup) {
      removable.delete(cur);
      cur = cur.parent;
    }
  };

  const mergedMeshes = [];
  buckets.forEach((bucket) => {
    if (bucket.items.length < 2) {
      bucket.items.forEach(unmarkRemovableAncestors);
      return;
    }
    let vertexCount = 0;
    const parts = bucket.items.map((mesh) => {
      const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      tmpMatrix.multiplyMatrices(invRoot, mesh.matrixWorld);
      src.applyMatrix4(tmpMatrix);
      vertexCount += src.attributes.position.count;
      return src;
    });
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    let offset = 0;
    parts.forEach((g) => {
      positions.set(g.attributes.position.array, offset * 3);
      normals.set(g.attributes.normal.array, offset * 3);
      offset += g.attributes.position.count;
      g.dispose();
    });
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.computeBoundingSphere();
    const mergedMesh = new THREE.Mesh(merged, bucket.material);
    mergedMesh.castShadow = bucket.castShadow;
    mergedMesh.receiveShadow = bucket.receiveShadow;
    mergedMesh.userData.staticBatch = true;
    mergedMesh.userData.batchedCount = bucket.items.length;
    mergedMeshes.push(mergedMesh);
  });

  // Retire du graphe les objets fusionnés (uniquement les racines retirables) et libère leurs ressources
  const keptGeometries = new Set();
  const usedMaterials = new Set();
  buckets.forEach((bucket) => usedMaterials.add(bucket.material));
  worldGroup.traverse((o) => {
    if (removable.has(o)) return;
    if (o.geometry) keptGeometries.add(o.geometry);
    if (o.material) usedMaterials.add(o.material);
  });
  const removedGeometries = new Set();
  const removedMaterials = new Set();
  removable.forEach((obj) => {
    if (obj.geometry) removedGeometries.add(obj.geometry);
    if (obj.material) removedMaterials.add(obj.material);
    if (obj.parent && !removable.has(obj.parent)) obj.parent.remove(obj);
  });
  removedGeometries.forEach((g) => {
    if (!keptGeometries.has(g)) g.dispose();
  });
  removedMaterials.forEach((m) => {
    if (!usedMaterials.has(m)) m.dispose();
  });

  mergedMeshes.forEach((m) => worldGroup.add(m));

  // Décor 100 % statique : plus aucun recalcul de matrices locales à chaque frame
  worldGroup.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
  worldGroup.updateMatrixWorld(true);

  let batchedSources = 0;
  mergedMeshes.forEach((m) => (batchedSources += m.userData.batchedCount));
  return { mergedMeshes: mergedMeshes.length, batchedSources };
}

// Libère proprement géométries, matériaux et textures du décor avant reconstruction (changement de carte)
function disposeWorldGroup() {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  worldGroup.traverse((o) => {
    if (o.geometry && !o.isSprite) geometries.add(o.geometry);
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        materials.add(m);
        if (m.map && m.map !== animeGradientMap) textures.add(m.map);
      });
    }
  });
  while (worldGroup.children.length > 0) {
    worldGroup.remove(worldGroup.children[0]);
  }
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
  worldMaterialCache.clear();
  animatedWaterTextures.length = 0;
}

const animatedWaterTextures = [];

export function updateWorldAnimations(dt) {
  if (!dt || animatedWaterTextures.length === 0) return;
  for (let i = 0; i < animatedWaterTextures.length; i++) {
    const entry = animatedWaterTextures[i];
    if (!entry || !entry.tex) continue;
    entry.tex.offset.x = (entry.tex.offset.x + entry.speedX * dt) % 1;
    entry.tex.offset.y = (entry.tex.offset.y + entry.speedY * dt) % 1;
  }
}

export function getRiftRiverCurrent(x, z) {
  if (typeof state === 'undefined' || state.mapId !== 'rift') return null;
  const rf = PARK_LANDMARKS.rift;
  const INV_SQRT2 = Math.SQRT1_2;
  const r = Math.hypot(x, z);
  // À l'intérieur du lac central (r <= 10.2), eau calme traversable autour de la chute
  if (r <= 10.2) return null;

  const s = (x + z) * INV_SQRT2;
  const absS = Math.abs(s);
  const perp = Math.abs(x - z) * INV_SQRT2;
  if (absS < 10.0 || absS > 86.0 || perp > rf.riverHalfWidth) return null;

  // Eaux calmes à l'intérieur des fosses Baron & Dragon
  if (
    Math.hypot(x - rf.baronPit.x, z - rf.baronPit.z) <= rf.baronPit.r * 0.9 ||
    Math.hypot(x - rf.dragonPit.x, z - rf.dragonPit.z) <= rf.dragonPit.r * 0.9
  ) {
    return null;
  }

  let strength = 1.0;
  if (absS < 15.0) strength = (absS - 10.0) / 5.0;
  else if (absS > 76.0) strength = (86.0 - absS) / 10.0;

  const edgeRatio = perp / rf.riverHalfWidth;
  if (edgeRatio > 0.72) {
    strength *= Math.max(0.25, 1.0 - ((edgeRatio - 0.72) / 0.28) * 0.75);
  }

  const speed = 4.8 * strength;
  const sign = s >= 0 ? 1 : -1;
  return {
    vx: sign * INV_SQRT2 * speed,
    vz: sign * INV_SQRT2 * speed,
    speed
  };
}

// --- CRÉATION DU PARC & DU TERRAIN 3D (STYLE ANIME / SAKURA) ---

// Arbres / feuillages enregistrés pour masquage dynamique s'ils croisent la ligne de visée caméra
export const cameraTreeOccluders = [];

function registerCameraTreeOccluder(node, x, y0, y1, z, r) {
  const matStates = [];
  const clonedMap = new Map();
  node.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const cloneSingle = (srcMat) => {
      if (!srcMat) return srcMat;
      let cloned = clonedMap.get(srcMat);
      if (!cloned) {
        cloned = srcMat.clone();
        clonedMap.set(srcMat, cloned);
        matStates.push({
          mat: cloned,
          baseTransparent: !!srcMat.transparent,
          baseOpacity: typeof srcMat.opacity === 'number' ? srcMat.opacity : 1.0,
          baseDepthWrite: srcMat.depthWrite !== false,
          isOutline: srcMat.side === THREE.BackSide
        });
      }
      return cloned;
    };
    if (Array.isArray(child.material)) {
      child.material = child.material.map(cloneSingle);
    } else {
      child.material = cloneSingle(child.material);
    }
  });
  cameraTreeOccluders.push({ node, x, y0, y1, z, r, matStates, fadeAlpha: 1.0 });
}

export function distSqSegmentToVerticalCapsule(ax, ay, az, bx, by, bz, cx, y0, y1, cz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq < 1e-8) {
    const cy = Math.max(y0, Math.min(y1, ay));
    const px = ax - cx;
    const py = ay - cy;
    const pz = az - cz;
    return px * px + py * py + pz * pz;
  }
  const evalAt = (t, fixedY) => {
    const clampedT = Math.max(0, Math.min(1, t));
    const pyLine = ay + clampedT * dy;
    const sy = fixedY === null ? Math.max(y0, Math.min(y1, pyLine)) : fixedY;
    const ox = ax + clampedT * dx - cx;
    const oy = pyLine - sy;
    const oz = az + clampedT * dz - cz;
    return ox * ox + oy * oy + oz * oz;
  };
  const horizLenSq = dx * dx + dz * dz;
  const tHoriz = horizLenSq > 1e-8 ? ((cx - ax) * dx + (cz - az) * dz) / horizLenSq : 0;
  const tLow = ((cx - ax) * dx + (y0 - ay) * dy + (cz - az) * dz) / lenSq;
  const tHigh = ((cx - ax) * dx + (y1 - ay) * dy + (cz - az) * dz) / lenSq;
  return Math.min(evalAt(tHoriz, null), evalAt(tLow, y0), evalAt(tHigh, y1));
}

export function getActiveMapMeta() {
  return MONTREAL_MAPS[state && state.mapId ? state.mapId : 'classic'] || MONTREAL_MAPS.classic;
}

function createGrassTexture(mapMeta = getActiveMapMeta()) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const c2d = canvas.getContext('2d');
  // Pelouse anime vibrante à bandes de stade selon le parc sélectionné
  c2d.fillStyle = mapMeta.grassMain || '#34d399';
  c2d.fillRect(0, 0, 256, 256);
  c2d.fillStyle = mapMeta.grassStripe || '#2dd4bf';
  c2d.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 650; i++) {
    c2d.fillStyle = i % 3 === 0 ? (mapMeta.grassTuftA || '#6ee7b7') : (mapMeta.grassTuftB || '#10b981');
    c2d.fillRect(Math.random() * 256, Math.random() * 256, 2, 6);
  }
  c2d.fillStyle = 'rgba(2, 6, 23, 0.45)';
  c2d.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  return tex;
}

function createJungleObstacleMesh(obs) {
  if (obs && (obs.kind === 'gazebo' || obs.kind === 'chalet' || obs.kind === 'cross' || obs.kind === 'waterfall')) return;
  const mapMeta = getActiveMapMeta();
  const group = new THREE.Group();
  group.position.set(obs.x, 0, obs.z);

  const isGate = obs.kind === 'gate';
  const isShrine = obs.kind === 'shrine';
  const teamAccentHex = obs.teamSide === 'ally' ? 0xfacc15 : 0xc084fc;
  const runeHex = isGate ? teamAccentHex : isShrine ? 0x38bdf8 : mapMeta.jungleBorderHex;

  // Socle rocheux moussue (collision circulaire exacte sur obs.radius)
  const rockHeight = isGate ? 3.2 : 2.35;
  const baseRock = new THREE.Mesh(
    new THREE.CylinderGeometry(obs.radius * 0.86, obs.radius * 0.98, rockHeight, 9),
    createToonMat(mapMeta.rockHex || 0x334155)
  );
  baseRock.position.y = rockHeight / 2;
  baseRock.castShadow = true;
  baseRock.receiveShadow = true;
  addAnimeOutline(baseRock, 1.04, 0x0f172a);
  group.add(baseRock);

  // Chapeau de mousse verte au sommet du rocher
  const mossCap = new THREE.Mesh(
    new THREE.CylinderGeometry(obs.radius * 0.89, obs.radius * 0.89, 0.34, 9),
    createToonMat(0x16a34a)
  );
  mossCap.position.y = rockHeight + 0.14;
  mossCap.receiveShadow = true;
  addAnimeOutline(mossCap, 1.03, 0x0f172a);
  group.add(mossCap);

  // Anneau lumineux à la base pour lire facilement le rayon de collision au sol
  const rimRing = new THREE.Mesh(
    new THREE.RingGeometry(obs.radius - 0.16, obs.radius + 0.04, 28),
    createBasicMat({
      color: runeHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72
    })
  );
  rimRing.rotation.x = -Math.PI / 2;
  rimRing.position.y = 0.035;
  group.add(rimRing);

  if (isGate) {
    // Obélisque porte d'entrée de jungle avec cristal aux couleurs du camp
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
    // Arbre jungle élancé : souche solide en bas + fût haut et canopée au-dessus de la caméra en hauteur
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

    const foliagePrimary = isShrine
      ? (mapMeta.foliageShrineHex || 0x10b981)
      : (mapMeta.foliagePrimaryHex || 0xf472b6);
    const foliageSecondary = isShrine
      ? (mapMeta.foliageShrineSecHex || 0x34d399)
      : (mapMeta.foliageSecondaryHex || 0xf9a8d4);
    const crownY = upperTrunkStartY + upperTrunkH + 1.05;
    const crownR = obs.radius * 0.92;
    const crown = new THREE.Mesh(
      new THREE.DodecahedronGeometry(crownR, 1),
      createToonMat(foliagePrimary)
    );
    crown.position.y = crownY;
    crown.scale.set(1.08, 0.68, 1.08);
    crown.castShadow = true;
    addAnimeOutline(crown, 1.045, 0x0f172a);
    group.add(crown);
    registerCameraTreeOccluder(crown, obs.x, crownY, crownY, obs.z, crownR * 1.12);

    const crownTopY = crownY + 1.15;
    const crownTopR = obs.radius * 0.62;
    const crownTop = new THREE.Mesh(
      new THREE.DodecahedronGeometry(crownTopR, 1),
      createToonMat(foliageSecondary)
    );
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

  worldGroup.add(group);
}

function getJungleBushPalette(mapMeta) {
  const style = (mapMeta && mapMeta.decorStyle) || 'classic';
  if (style === 'rift') {
    return {
      padHex: 0x102813,
      ringHex: 0x65a30d,
      darkHex: 0x1e4d23,
      midHex: 0x2f6b2f,
      lightHex: 0x528f38,
      outlineHex: 0x091c0b
    };
  }
  if (style === 'mont-royal') {
    return {
      padHex: 0x064e3b,
      ringHex: 0x4ade80,
      darkHex: 0x14532d,
      midHex: 0x16a34a,
      lightHex: 0x65a30d,
      outlineHex: 0x052e16
    };
  }
  if (style === 'saint-viateur') {
    return {
      padHex: 0x064e3b,
      ringHex: 0x5eead4,
      darkHex: 0x15803d,
      midHex: 0x22c55e,
      lightHex: 0x84cc16,
      outlineHex: 0x052e16
    };
  }
  if (style === 'lafontaine') {
    return {
      padHex: 0x064e3b,
      ringHex: 0x4ade80,
      darkHex: 0x15803d,
      midHex: 0x16a34a,
      lightHex: 0x4ade80,
      outlineHex: 0x052e16
    };
  }
  return {
    padHex: 0x064e3b,
    ringHex: 0x4ade80,
    darkHex: 0x15803d,
    midHex: 0x16a34a,
    lightHex: 0x34d399,
    outlineHex: 0x052e16
  };
}

function createJungleBrushMesh(bush) {
  const mapMeta = getActiveMapMeta();
  const pal = getJungleBushPalette(mapMeta);
  const lowSpec = !!(state && state.lowSpecMode);
  const baseY = getTerrainY(bush.x, bush.z);

  const group = new THREE.Group();
  group.position.set(bush.x, baseY, bush.z);

  // Seed déterministe basé sur (bush.x, bush.z) pour un rendu 100 % identique en multijoueur
  let seed = (Math.abs(Math.round(bush.x * 73856093)) ^ Math.abs(Math.round(bush.z * 19349663)) ^ 0x9e3779b9) >>> 0;
  const nextRand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // 1. Base sombre furtive & anneau de délimitation exact au sol (depthWrite: false)
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(bush.radius, 24),
    createBasicMat({ color: pal.padHex, transparent: true, opacity: 0.72, depthWrite: false })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.028;
  group.add(pad);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(bush.radius - 0.14, bush.radius, 28),
    createBasicMat({
      color: pal.ringHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.032;
  group.add(ring);

  // 3 matériaux cel-shaded opaques sans texture (fusionnés en ~4 draw calls par mergeStaticWorldMeshes)
  const darkLeafMat = createToonMat(pal.darkHex);
  const midLeafMat = createToonMat(pal.midHex);
  const lightLeafMat = createToonMat(pal.lightHex);
  const leafMats = [darkLeafMat, midLeafMat, lightLeafMat];
  const rScale = bush.radius / 2.35;

  // 2. Strate de coussins foliaires volumineux (8-10 en standard, 6 en Low Spec)
  const outerPuffCount = lowSpec ? 6 : 7;
  const innerPuffCount = lowSpec ? 0 : 2;
  const outlineLimit = lowSpec ? 4 : 6;
  for (let i = 0; i < outerPuffCount; i++) {
    const ang = (i / outerPuffCount) * Math.PI * 2 + (nextRand() - 0.5) * 0.32;
    const dist = (0.56 + nextRand() * 0.2) * bush.radius;
    const puffR = (0.64 + nextRand() * 0.2) * rScale;
    const mat = i % 3 === 0 ? darkLeafMat : i % 3 === 1 ? midLeafMat : lightLeafMat;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(puffR, 0), mat);
    const sy = 0.76 + nextRand() * 0.32;
    puff.scale.set(1.12 + nextRand() * 0.18, sy, 0.96 + nextRand() * 0.16);
    puff.position.set(
      Math.cos(ang) * dist,
      puffR * sy * 0.78 + 0.14 + nextRand() * 0.18,
      Math.sin(ang) * dist
    );
    puff.rotation.set((nextRand() - 0.5) * 0.5, ang + nextRand() * 1.2, (nextRand() - 0.5) * 0.5);
    if (i < outlineLimit) {
      puff.castShadow = true;
      addAnimeOutline(puff, 1.055, pal.outlineHex);
    }
    group.add(puff);
  }

  for (let i = 0; i < innerPuffCount; i++) {
    const ang = (i / innerPuffCount) * Math.PI * 2 + nextRand() * 1.4;
    const dist = (0.2 + nextRand() * 0.16) * bush.radius;
    const puffR = (0.62 + nextRand() * 0.14) * rScale;
    const puff = new THREE.Mesh(
      new THREE.IcosahedronGeometry(puffR, 0),
      i === 0 ? darkLeafMat : midLeafMat
    );
    const sy = 0.68 + nextRand() * 0.22;
    puff.scale.set(1.16, sy, 1.08);
    puff.position.set(Math.cos(ang) * dist, puffR * sy * 0.72 + 0.08, Math.sin(ang) * dist);
    puff.rotation.set(nextRand() * 0.4, ang, nextRand() * 0.4);
    group.add(puff);
  }

  // 3. Strate haute : larges feuilles inclinées (12 en standard, 6 en Low Spec) enveloppant le perso
  const leafCount = lowSpec ? 6 : 12;
  for (let i = 0; i < leafCount; i++) {
    const ang = (i / leafCount) * Math.PI * 2 + (nextRand() - 0.5) * 0.24;
    const dist = (i % 3 === 0 ? 0.34 : 0.62 + nextRand() * 0.22) * bush.radius;
    const h = (1.45 + nextRand() * 0.55) * Math.max(0.88, rScale);
    const w = (0.4 + nextRand() * 0.12) * Math.max(0.88, rScale);
    const mat = leafMats[(i + 1) % 3];
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4), mat);
    leaf.scale.set(1.22, 1.0, 0.34);
    leaf.position.set(Math.cos(ang) * dist, h * 0.46 + 0.06, Math.sin(ang) * dist);
    // Orientation radiale vers l'extérieur pour former une couronne de feuillage ouverte et touffue
    const tilt = 0.24 + nextRand() * 0.28;
    leaf.rotation.order = 'YXZ';
    leaf.rotation.y = Math.atan2(Math.cos(ang), Math.sin(ang));
    leaf.rotation.x = tilt;
    leaf.rotation.z = (nextRand() - 0.5) * 0.22;
    group.add(leaf);
  }

  worldGroup.add(group);
}

function createLaneConnectorSegment(x1, z1, x2, z2, width, colorHex, opacity = 0.36) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(length, width),
    createBasicMat({ color: colorHex, transparent: true, opacity, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -Math.atan2(dz, dx);
  mesh.position.set((x1 + x2) / 2, 0.022, (z1 + z2) / 2);
  worldGroup.add(mesh);
}

function createCanopyTreeNetwork() {
  if (!CANOPY_SPEC.hasCanopy) return;
  const mapMeta = getActiveMapMeta();
  const barkMat = createToonMat(0x5c4033);
  const boughMat = createToonMat(0x78350f);
  const plankLightMat = createToonMat(0xd97706);
  const plankDarkMat = createToonMat(0xb45309);
  const canopyTurfMat = createToonMat(0x10b981);
  const ropeMat = createToonMat(0xfde047, { emissive: 0xfacc15, emissiveIntensity: 0.15 });
  const crystalMat = createToonMat(0x38bdf8, { emissive: 0x38bdf8, emissiveIntensity: 0.55 });
  const bambooLaunchMat = createToonMat(0x0284c7, { emissive: 0x0ea5e9, emissiveIntensity: 0.35 });
  const warnArchMat = createToonMat(0xf59e0b, { emissive: 0xfbbf24, emissiveIntensity: 0.55 });
  const sakuraMat = createToonMat(mapMeta.foliagePrimaryHex || 0xf472b6, {
    emissive: mapMeta.foliagePrimaryHex || 0xf472b6,
    emissiveIntensity: 0.14
  });
  const sakuraLightMat = createToonMat(mapMeta.foliageSecondaryHex || 0xf9a8d4);
  const leafMat = createToonMat(mapMeta.foliageShrineHex || 0x10b981);
  const leafLightMat = createToonMat(mapMeta.foliageShrineSecHex || 0x34d399);

  const pH = CANOPY_SPEC.deckY;
  const cH = CANOPY_SPEC.centerHalfX;
  const crownBaseY = Math.max(16.2, pH + 9.4);
  const crownTopOffset = crownBaseY - 16.2;

  function addRopeSegment(x1, y1, z1, x2, y2, z2, rad = 0.06, mat = ropeMat) {
    const p1 = new THREE.Vector3(x1, y1, z1);
    const p2 = new THREE.Vector3(x2, y2, z2);
    const len = p1.distanceTo(p2);
    if (len < 0.01) return;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 6), mat);
    seg.position.copy(p1).add(p2).multiplyScalar(0.5);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
    seg.castShadow = true;
    worldGroup.add(seg);
    return seg;
  }

  function addPost(x, yBase, z, height = 1.15, rad = 0.11, mat = boughMat) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.85, rad, height, 6), mat);
    post.position.set(x, yBase + height / 2, z);
    post.castShadow = true;
    addAnimeOutline(post, 1.05, 0x0f172a);
    worldGroup.add(post);
  }

  function addDeckEdgeRail(a0, a1, fixedCoord, doorHalf, isHorizontal) {
    const mid = (a0 + a1) / 2;
    const drawSpan = (s0, s1) => {
      if (s1 - s0 < 0.15) return;
      const x0 = isHorizontal ? s0 : fixedCoord;
      const z0 = isHorizontal ? fixedCoord : s0;
      const x1 = isHorizontal ? s1 : fixedCoord;
      const z1 = isHorizontal ? fixedCoord : s1;
      addRopeSegment(x0, pH + 0.85, z0, x1, pH + 0.85, z1);
      addRopeSegment(x0, pH + 0.45, z0, x1, pH + 0.45, z1);
    };
    if (!doorHalf) {
      drawSpan(a0, a1);
      return;
    }
    const gapHalf = doorHalf + 0.08;
    const d0 = mid - gapHalf;
    const d1 = mid + gapHalf;
    addPost(isHorizontal ? d0 : fixedCoord, pH, isHorizontal ? fixedCoord : d0, 1.25, 0.12);
    addPost(isHorizontal ? d1 : fixedCoord, pH, isHorizontal ? fixedCoord : d1, 1.25, 0.12);
    drawSpan(a0, d0);
    drawSpan(d1, a1);
  }

  // 1. GRAND ARBRE ESPRIT CENTRAL (0, 0) & TOUTES LES 17 PLATEFORMES CANOPÉE
  const spiritTrunk = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 2.35, pH - 0.12, 10), barkMat);
  spiritTrunk.position.set(0, (pH - 0.12) / 2, 0);
  spiritTrunk.castShadow = true;
  spiritTrunk.receiveShadow = true;
  addAnimeOutline(spiritTrunk, 1.04, 0x1e1b18);
  worldGroup.add(spiritTrunk);

  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 2.1, 6), barkMat);
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

  CANOPY_SPEC.decks.forEach((d) => {
    const w = d.x1 - d.x0;
    const depth = d.z1 - d.z0;
    const isMain = d.kind === 'spirit' || d.kind === 'hub';
    const deckMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.34, depth),
      isMain ? boughMat : plankDarkMat
    );
    deckMesh.position.set(d.cx, pH - 0.17, d.cz);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    addAnimeOutline(deckMesh, new THREE.Vector3(1.02, 1.04, 1.02), 0x0f172a);
    worldGroup.add(deckMesh);

    const topPad = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.65, depth - 0.65),
      isMain ? canopyTurfMat : plankLightMat
    );
    topPad.rotation.x = -Math.PI / 2;
    topPad.position.set(d.cx, pH + 0.015, d.cz);
    topPad.receiveShadow = true;
    worldGroup.add(topPad);

    const inset = 0.16;
    const rx0 = d.x0 + inset;
    const rx1 = d.x1 - inset;
    const rz0 = d.z0 + inset;
    const rz1 = d.z1 - inset;
    addPost(rx0, pH, rz0, 1.28, 0.13);
    addPost(rx1, pH, rz0, 1.28, 0.13);
    addPost(rx0, pH, rz1, 1.28, 0.13);
    addPost(rx1, pH, rz1, 1.28, 0.13);

    addDeckEdgeRail(rx0, rx1, rz0, d.doors.n, true);
    addDeckEdgeRail(rx0, rx1, rz1, d.doors.s, true);
    addDeckEdgeRail(rz0, rz1, rx0, d.doors.w, false);
    addDeckEdgeRail(rz0, rz1, rx1, d.doors.e, false);
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

  [-1, 1].forEach((sx) => {
    [-1, 1].forEach((sz) => {
      const boughSeg = addRopeSegment(
        sx * (cH - 0.15),
        pH + 0.6,
        sz * (cH - 0.15),
        sx * 6.5,
        15.8 + crownTopOffset,
        sz * 6.5,
        0.18,
        barkMat
      );
      if (boughSeg) {
        registerCameraTreeOccluder(boughSeg, sx * 5.4, pH + 0.6, 15.8 + crownTopOffset, sz * 5.4, 1.6);
      }
      const blossom = new THREE.Mesh(new THREE.IcosahedronGeometry(2.65, 1), sakuraMat);
      blossom.position.set(sx * 6.8, 16.6 + crownTopOffset, sz * 6.8);
      blossom.scale.set(1.15, 0.65, 1.15);
      blossom.castShadow = true;
      addAnimeOutline(blossom, 1.04, 0x3b0764);
      worldGroup.add(blossom);
      registerCameraTreeOccluder(blossom, sx * 6.8, 16.6 + crownTopOffset, 16.6 + crownTopOffset, sz * 6.8, 3.05);

      const blossomTop = new THREE.Mesh(new THREE.IcosahedronGeometry(1.75, 1), sakuraLightMat);
      blossomTop.position.set(sx * 6.4, 17.9 + crownTopOffset, sz * 6.4);
      blossomTop.scale.set(1.1, 0.65, 1.1);
      worldGroup.add(blossomTop);
      registerCameraTreeOccluder(blossomTop, sx * 6.4, 17.9 + crownTopOffset, 17.9 + crownTopOffset, sz * 6.4, 2.0);
    });
  });

  // 2. ARBRES PORTEURS HAUTS DES CABANES & CARREFOURS (fut bas solide + fût haut & cimes anti-occlusion)
  CANOPY_SPEC.trunks.forEach((tr) => {
    if (tr.kind === 'spirit' || tr.kind === 'bough') return;
    const lowTrunkH = pH + 0.45;
    const treeTrunkLow = new THREE.Mesh(
      new THREE.CylinderGeometry(tr.radius * 0.72, tr.radius * 0.98, lowTrunkH, 9),
      barkMat
    );
    treeTrunkLow.position.set(tr.x, lowTrunkH / 2, tr.z);
    treeTrunkLow.castShadow = true;
    treeTrunkLow.receiveShadow = true;
    addAnimeOutline(treeTrunkLow, 1.05, 0x1e1b18);
    worldGroup.add(treeTrunkLow);

    const highTrunkH = Math.max(2.2, 15.6 + crownTopOffset - lowTrunkH);
    const treeTrunkHigh = new THREE.Mesh(
      new THREE.CylinderGeometry(tr.radius * 0.46, tr.radius * 0.7, highTrunkH, 9),
      barkMat
    );
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
    const crownA = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5, 1), useSakura ? sakuraMat : leafMat);
    crownA.position.set(tr.x, crownBaseY, tr.z);
    crownA.scale.set(1.15, 0.68, 1.15);
    crownA.castShadow = true;
    addAnimeOutline(crownA, 1.04, useSakura ? 0x3b0764 : 0x064e3b);
    worldGroup.add(crownA);
    registerCameraTreeOccluder(crownA, tr.x, crownBaseY, crownBaseY, tr.z, 2.9);

    const crownB = new THREE.Mesh(new THREE.IcosahedronGeometry(1.72, 1), useSakura ? sakuraLightMat : leafLightMat);
    crownB.position.set(tr.x + (tr.x >= 0 ? -0.35 : 0.35), crownBaseY + 1.4, tr.z);
    crownB.scale.set(1.05, 0.65, 1.05);
    worldGroup.add(crownB);
    registerCameraTreeOccluder(crownB, tr.x + (tr.x >= 0 ? -0.35 : 0.35), crownBaseY + 1.4, crownBaseY + 1.4, tr.z, 1.9);
  });

  // 3. 18 PONTS SUSPENDUS ÉTROITS (3,4 u DE LARGE, DÉGAGÉS DESSOUS)
  function buildSuspendedBridge(b) {
    const isX = b.axis === 'x';
    const span = isX ? b.x1 - b.x0 : b.z1 - b.z0;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const halfW = CANOPY_SPEC.bridgeHalf;
    const plankCount = Math.max(7, Math.round(span / 0.78));

    for (let i = 0; i < plankCount; i++) {
      const u = (i + 0.5) / plankCount;
      const surfY = pH - b.sag * Math.sin(Math.PI * u);
      const plank = new THREE.Mesh(
        isX ? new THREE.BoxGeometry(0.62, 0.15, halfW * 2) : new THREE.BoxGeometry(halfW * 2, 0.15, 0.62),
        i % 2 === 0 ? plankLightMat : plankDarkMat
      );
      plank.position.set(isX ? b.x0 + u * span : cx, surfY - 0.075, isX ? cz : b.z0 + u * span);
      plank.castShadow = true;
      plank.receiveShadow = true;
      addAnimeOutline(plank, new THREE.Vector3(1.03, 1.06, 1.02), 0x0f172a);
      worldGroup.add(plank);
    }

    const anchorPostH = 1.95;
    const segs = Math.max(8, Math.round(span / 1.1));
    [-halfW, halfW].forEach((offset) => {
      if (isX) {
        addPost(b.x0, pH, cz + offset, anchorPostH, 0.13);
        addPost(b.x1, pH, cz + offset, anchorPostH, 0.13);
      } else {
        addPost(cx + offset, pH, b.z0, anchorPostH, 0.13);
        addPost(cx + offset, pH, b.z1, anchorPostH, 0.13);
      }

      for (let s = 0; s < segs; s++) {
        const u1 = s / segs;
        const u2 = (s + 1) / segs;
        const a1 = (isX ? b.x0 : b.z0) + u1 * span;
        const a2 = (isX ? b.x0 : b.z0) + u2 * span;
        const x1 = isX ? a1 : cx + offset;
        const z1 = isX ? cz + offset : a1;
        const x2 = isX ? a2 : cx + offset;
        const z2 = isX ? cz + offset : a2;

        const cy1 = pH + anchorPostH - 0.1 - 1.15 * Math.sin(Math.PI * u1);
        const cy2 = pH + anchorPostH - 0.1 - 1.15 * Math.sin(Math.PI * u2);
        addRopeSegment(x1, cy1, z1, x2, cy2, z2, 0.06);

        const dy1 = pH - b.sag * Math.sin(Math.PI * u1) + 0.85;
        const dy2 = pH - b.sag * Math.sin(Math.PI * u2) + 0.85;
        addRopeSegment(x1, dy1, z1, x2, dy2, z2, 0.048);

        if (s > 0 && s < segs && s % 2 === 0) {
          const deckYAtU = pH - b.sag * Math.sin(Math.PI * u1);
          addRopeSegment(x1, cy1, z1, x1, deckYAtU, z1, 0.032);
        }
      }
    });
  }
  CANOPY_SPEC.bridges.forEach(buildSuspendedBridge);

  // 4. RAMPES D'ASCENSION OUEST & EST (|X|: 45,0..58,0 -> Y: 5,6..0)
  [-1, 1].forEach((sx) => {
    const ascentSpan = CANOPY_SPEC.ascentOuterX - CANOPY_SPEC.ascentInnerX;
    const slopeAngle = Math.atan2(pH, ascentSpan);
    const stepCount = 18;
    for (let i = 0; i < stepCount; i++) {
      const u = (i + 0.5) / stepCount;
      const absX = CANOPY_SPEC.ascentInnerX + u * ascentSpan;
      const stepY = pH * (1 - u);
      const tread = new THREE.Mesh(
        new THREE.BoxGeometry(0.66, 0.15, CANOPY_SPEC.ascentHalfZ * 2),
        i % 2 === 0 ? plankDarkMat : plankLightMat
      );
      tread.position.set(sx * absX, stepY - 0.075, 0);
      tread.rotation.z = -sx * slopeAngle;
      tread.castShadow = true;
      tread.receiveShadow = true;
      addAnimeOutline(tread, new THREE.Vector3(1.03, 1.06, 1.02), 0x0f172a);
      worldGroup.add(tread);
    }

    const gateZ = CANOPY_SPEC.ascentHalfZ + 0.1;
    [-CANOPY_SPEC.ascentHalfZ, CANOPY_SPEC.ascentHalfZ].forEach((rz, idx) => {
      const xTop = sx * CANOPY_SPEC.ascentInnerX;
      const xBot = sx * CANOPY_SPEC.ascentOuterX;
      addRopeSegment(xTop, pH + 0.9, rz, xBot, 0.9, rz, 0.055);
      addRopeSegment(xTop, pH + 0.45, rz, xBot, 0.45, rz, 0.04);
      [0, 0.35, 0.7].forEach((u) => {
        const px = sx * (CANOPY_SPEC.ascentInnerX + u * ascentSpan);
        const py = pH * (1 - u);
        addPost(px, py, rz, 1.05, 0.1);
      });
      const postZ = idx === 0 ? -gateZ : gateZ;
      addPost(sx * CANOPY_SPEC.ascentOuterX, 0, postZ, 3.55, 0.16);
    });

    addRopeSegment(
      sx * CANOPY_SPEC.ascentOuterX,
      3.42,
      -gateZ,
      sx * CANOPY_SPEC.ascentOuterX,
      3.42,
      gateZ,
      0.13,
      boughMat
    );
    const teamLampHex = sx < 0 ? 0xfacc15 : 0xc084fc;
    const lanternMat = createToonMat(teamLampHex, { emissive: teamLampHex, emissiveIntensity: 0.7 });
    [-gateZ, gateZ].forEach((lz) => {
      const sideLantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), lanternMat);
      sideLantern.position.set(sx * CANOPY_SPEC.ascentOuterX, 3.74, lz);
      addAnimeOutline(sideLantern, 1.06, 0x0f172a);
      worldGroup.add(sideLantern);
    });

    const entryPad = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.07, CANOPY_SPEC.ascentHalfZ * 2),
      plankLightMat
    );
    entryPad.position.set(sx * (CANOPY_SPEC.ascentOuterX + 0.9), 0.025, 0);
    entryPad.receiveShadow = true;
    addAnimeOutline(entryPad, new THREE.Vector3(1.02, 1.04, 1.02), 0x0f172a);
    worldGroup.add(entryPad);

    const arrowMat = new THREE.MeshBasicMaterial({
      color: teamLampHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    [0, 1].forEach((aIdx) => {
      const chevron = new THREE.Mesh(new THREE.CircleGeometry(0.58, 3), arrowMat);
      chevron.rotation.x = -Math.PI / 2;
      chevron.rotation.z = sx < 0 ? 0 : Math.PI;
      chevron.position.set(sx * (CANOPY_SPEC.ascentOuterX + 1.3 - aIdx * 0.9), 0.068, 0);
      worldGroup.add(chevron);
    });

    // Soubassements solides exactement sous [rampSkirtInnerX..rampSkirtOuterX]
    const rockCribMat = createToonMat(0x475569);
    const skirtSpan = CANOPY_SPEC.rampSkirtOuterX - CANOPY_SPEC.rampSkirtInnerX;
    const skirtSteps = 3;
    for (let cIdx = 0; cIdx < skirtSteps; cIdx++) {
      const x0 = CANOPY_SPEC.rampSkirtInnerX + (cIdx / skirtSteps) * skirtSpan;
      const x1 = CANOPY_SPEC.rampSkirtInnerX + ((cIdx + 1) / skirtSteps) * skirtSpan;
      const tMid = Math.max(0.05, (CANOPY_SPEC.ascentOuterX - x1) / Math.max(1, ascentSpan));
      const h = Math.max(0.55, pH * tMid * 0.96);
      const crib = new THREE.Mesh(
        new THREE.BoxGeometry(x1 - x0, h, CANOPY_SPEC.ascentHalfZ * 2 - 0.16),
        cIdx % 2 === 0 ? boughMat : rockCribMat
      );
      crib.position.set(sx * ((x0 + x1) / 2), h / 2, 0);
      crib.castShadow = true;
      crib.receiveShadow = true;
      addAnimeOutline(crib, new THREE.Vector3(1.02, 1.03, 1.02), 0x0f172a);
      worldGroup.add(crib);
    }
  });

  // 5. TOBOGGANS SKY-LAUNCH ONE-WAY NORD & SUD -> chute directe sur Lanes ±50
  const launchRun = CANOPY_SPEC.launchOuterZ - CANOPY_SPEC.launchInnerZ;
  const launchDrop = pH - CANOPY_SPEC.launchLipY;
  const launchAngle = Math.atan2(launchDrop, launchRun);
  const pierRockMat = createToonMat(0x475569);
  const pierTrimMat = createToonMat(0x10b981);
  const oneWayArrowMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92
  });

  [-1, 1].forEach((sz) => {
    const slatCount = 24;
    for (let i = 0; i < slatCount; i++) {
      const u = (i + 0.5) / slatCount;
      const absZ = CANOPY_SPEC.launchInnerZ + u * launchRun;
      const surfY = pH - launchDrop * u;
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(CANOPY_SPEC.launchHalfX * 2, 0.14, 0.72),
        i % 2 === 0 ? bambooLaunchMat : crystalMat
      );
      slat.position.set(0, surfY - 0.07, sz * absZ);
      slat.rotation.x = sz * launchAngle;
      slat.castShadow = true;
      slat.receiveShadow = true;
      addAnimeOutline(slat, new THREE.Vector3(1.02, 1.06, 1.03), 0x0f172a);
      worldGroup.add(slat);
    }

    // Portique d'avertissement "SENS UNIQUE" à l'entrée du Sky-Launch (|Z| = 16,45) + chevrons directionnels
    const archZ = sz * (CANOPY_SPEC.launchInnerZ + 0.08);
    [-CANOPY_SPEC.launchHalfX, CANOPY_SPEC.launchHalfX].forEach((ax) => {
      addPost(ax, pH, archZ, 2.5, 0.12, warnArchMat);
    });
    addRopeSegment(
      -CANOPY_SPEC.launchHalfX,
      pH + 2.45,
      archZ,
      CANOPY_SPEC.launchHalfX,
      pH + 2.45,
      archZ,
      0.1,
      warnArchMat
    );
    [0.14, 0.38, 0.62, 0.86].forEach((u) => {
      const absZ = CANOPY_SPEC.launchInnerZ + u * launchRun;
      const surfY = pH - launchDrop * u;
      const chev = new THREE.Mesh(new THREE.CircleGeometry(0.55, 3), oneWayArrowMat);
      chev.rotation.x = -Math.PI / 2 - sz * launchAngle;
      chev.rotation.z = sz < 0 ? Math.PI / 2 : -Math.PI / 2;
      chev.position.set(0, surfY + 0.055, sz * absZ);
      worldGroup.add(chev);
    });

    // Culée / pilier plein sous l'extrémité basse de sortie -> raccord exact clampToField
    const pierSpan = CANOPY_SPEC.launchPierOuterZ - CANOPY_SPEC.launchPierInnerZ;
    const pierSteps = 3;
    const pierW = CANOPY_SPEC.launchHalfX * 2 + 0.16;
    for (let tIdx = 0; tIdx < pierSteps; tIdx++) {
      const z0 = CANOPY_SPEC.launchPierInnerZ + (tIdx / pierSteps) * pierSpan;
      const z1 = CANOPY_SPEC.launchPierInnerZ + ((tIdx + 1) / pierSteps) * pierSpan;
      const uAtZ = Math.min(1, (z1 - CANOPY_SPEC.launchInnerZ) / Math.max(1, launchRun));
      const h = Math.max(0.8, pH - launchDrop * uAtZ - 0.14);
      const tier = new THREE.Mesh(new THREE.BoxGeometry(pierW, h, z1 - z0), pierRockMat);
      tier.position.set(0, h / 2, sz * ((z0 + z1) / 2));
      tier.castShadow = true;
      tier.receiveShadow = true;
      addAnimeOutline(tier, new THREE.Vector3(1.02, 1.03, 1.02), 0x0f172a);
      worldGroup.add(tier);
    }
    const pierPlinth = new THREE.Mesh(new THREE.BoxGeometry(pierW + 0.28, 0.72, pierSpan + 0.1), pierTrimMat);
    pierPlinth.position.set(0, 0.36, sz * ((CANOPY_SPEC.launchPierInnerZ + CANOPY_SPEC.launchPierOuterZ) / 2));
    pierPlinth.castShadow = true;
    pierPlinth.receiveShadow = true;
    worldGroup.add(pierPlinth);

    [-CANOPY_SPEC.launchHalfX, CANOPY_SPEC.launchHalfX].forEach((rx) => {
      addRopeSegment(
        rx,
        pH + 0.85,
        sz * CANOPY_SPEC.launchInnerZ,
        rx,
        CANOPY_SPEC.launchLipY + 0.85,
        sz * CANOPY_SPEC.launchOuterZ,
        0.05
      );
    });

    [-1, 1].forEach((sx) => {
      const boughX = sx * 2.45;
      const boughZ = sz * (CANOPY_SPEC.launchOuterZ - 0.5);
      const anchorH = Math.max(1.8, CANOPY_SPEC.launchLipY + 0.65);
      const anchorTree = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, anchorH, 8), barkMat);
      anchorTree.position.set(boughX, anchorH / 2, boughZ);
      anchorTree.castShadow = true;
      anchorTree.receiveShadow = true;
      addAnimeOutline(anchorTree, 1.05, 0x1e1b18);
      worldGroup.add(anchorTree);

      addRopeSegment(
        boughX,
        CANOPY_SPEC.launchLipY - 0.15,
        boughZ,
        0,
        CANOPY_SPEC.launchLipY - 0.15,
        sz * CANOPY_SPEC.launchOuterZ,
        0.22,
        barkMat
      );

      const thruster = new THREE.Mesh(new THREE.OctahedronGeometry(0.44, 0), crystalMat);
      thruster.position.set(sx * 1.85, CANOPY_SPEC.launchLipY + 0.8, sz * (CANOPY_SPEC.launchOuterZ - 0.2));
      thruster.castShadow = true;
      addAnimeOutline(thruster, 1.07, 0x0f172a);
      worldGroup.add(thruster);

      const twigLeaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.88, 0), leafLightMat);
      twigLeaf.position.set(boughX + sx * 0.45, 0.8, boughZ);
      twigLeaf.scale.set(1.0, 0.65, 1.0);
      worldGroup.add(twigLeaf);
    });

    // Cible d'atterrissage prévisible Sky-Launch au sol sur Top/Bot Lane (Z ≈ ±50,0)
    const landingRingOuter = new THREE.Mesh(
      new THREE.RingGeometry(2.55, 3.25, 36),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.78, depthWrite: false })
    );
    landingRingOuter.rotation.x = -Math.PI / 2;
    landingRingOuter.position.set(0, 0.072, sz * CANOPY_SPEC.launchLandingZ);
    worldGroup.add(landingRingOuter);

    const landingRingInner = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 1.75, 24),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false })
    );
    landingRingInner.rotation.x = -Math.PI / 2;
    landingRingInner.position.set(0, 0.076, sz * CANOPY_SPEC.launchLandingZ);
    worldGroup.add(landingRingInner);
  });
}

function buildMontrealParkLandmarks(mapMeta) {
  const style = mapMeta.decorStyle || 'classic';
  const waterMat = new THREE.MeshBasicMaterial({
    color: darkenDecorHex(0x0284c7, 0.56),
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  });
  const waterShimmerMat = new THREE.MeshBasicMaterial({
    color: darkenDecorHex(0x38bdf8, 0.56),
    transparent: true,
    opacity: 0.45,
    depthWrite: false
  });
  const waterEdgeMat = new THREE.MeshBasicMaterial({
    color: darkenDecorHex(0xbae6fd, 0.56),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  });
  const stoneMat = createToonMat(0xe2e8f0);
  const darkStoneMat = createToonMat(0x64748b);

  if (style === 'lafontaine') {
    const lf = PARK_LANDMARKS.lafontaine;
    const pondSpec = { rx: lf.pondRx, rz: lf.pondRz };
    const bridgeSpec = { halfX: lf.bridgeHalfX, halfZ: lf.bridgeHalfZ };

    // Grand étang horizontal Ouest-Est du Parc La Fontaine (ellipse rx=32.0, rz=13.5)
    const pondSurface = new THREE.Mesh(new THREE.CircleGeometry(1, 56), waterMat);
    pondSurface.rotation.x = -Math.PI / 2;
    pondSurface.scale.set(pondSpec.rx, pondSpec.rz, 1);
    pondSurface.position.set(0, 0.036, 0);
    worldGroup.add(pondSurface);

    const innerWater = new THREE.Mesh(new THREE.CircleGeometry(1, 44), waterShimmerMat);
    innerWater.rotation.x = -Math.PI / 2;
    innerWater.scale.set(pondSpec.rx * 0.82, pondSpec.rz * 0.76, 1);
    innerWater.position.set(0, 0.044, 0);
    worldGroup.add(innerWater);

    // Bordure de pierre tout autour de l'étang (interrompue au niveau du pont vertical Nord-Sud)
    const rimSegments = 64;
    for (let i = 0; i < rimSegments; i++) {
      const theta = (i / rimSegments) * Math.PI * 2;
      const px = Math.cos(theta) * (pondSpec.rx + 0.35);
      const pz = Math.sin(theta) * (pondSpec.rz + 0.35);
      if (Math.abs(px) < bridgeSpec.halfX + 0.85) continue;
      const block = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 1.45), stoneMat);
      block.position.set(px, 0.21, pz);
      block.rotation.y = Math.atan2(
        Math.cos(theta) * pondSpec.rz,
        -Math.sin(theta) * pondSpec.rx
      );
      addAnimeOutline(block, 1.03, 0x334155);
      worldGroup.add(block);
    }

    // 2 Fontaines décoratives à plusieurs vasques à l'Ouest et à l'Est dans le grand étang horizontal
    const fountainMat = createToonMat(0xf1f5f9);
    const sprayMat = createBasicMat({ color: 0xe0f2fe, transparent: true, opacity: 0.78 });
    [
      { x: -lf.fountainX, z: 0 },
      { x: lf.fountainX, z: 0 }
    ].forEach((f) => {
      const fg = new THREE.Group();
      fg.position.set(f.x, 0, f.z);

      const outerBasin = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.25, 0.55, 20), stoneMat);
      outerBasin.position.y = 0.28;
      addAnimeOutline(outerBasin, 1.03, 0x334155);
      fg.add(outerBasin);

      const basinWater = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.75, 0.14, 20), waterShimmerMat);
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

      const splashRing = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.45, 24), waterEdgeMat);
      splashRing.rotation.x = -Math.PI / 2;
      splashRing.position.y = 0.04;
      fg.add(splashRing);

      worldGroup.add(fg);
    });

    // Pont central arqué vertical reliant la rive Nord (-Z) et la rive Sud (+Z)
    const bridgeDeckMat = createToonMat(0xb45309);
    const bridgeTrimMat = createToonMat(0xe2e8f0);
    const lampGlowMat = createToonMat(0xfef08a, { emissive: 0xfacc15, emissiveIntensity: 0.8 });
    const deckSteps = 16;
    const stepSpan = (bridgeSpec.halfZ * 2) / deckSteps;
    for (let i = 0; i < deckSteps; i++) {
      const sz = -bridgeSpec.halfZ + (i + 0.5) * stepSpan;
      const sy = getTerrainY(0, sz, 'lafontaine');
      const nextSz = -bridgeSpec.halfZ + (i + 1) * stepSpan;
      const prevSz = -bridgeSpec.halfZ + i * stepSpan;
      const slope = Math.atan2(
        getTerrainY(0, nextSz, 'lafontaine') - getTerrainY(0, prevSz, 'lafontaine'),
        stepSpan
      );
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(bridgeSpec.halfX * 2, 0.36, stepSpan + 0.16),
        bridgeDeckMat
      );
      plank.position.set(0, sy - 0.14, sz);
      plank.rotation.x = -slope;
      plank.receiveShadow = true;
      plank.castShadow = true;
      worldGroup.add(plank);

      // Parapets en pierre Ouest et Est du pont
      [-bridgeSpec.halfX - 0.2, bridgeSpec.halfX + 0.2].forEach((px) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.95, stepSpan + 0.12), bridgeTrimMat);
        wall.position.set(px, sy + 0.32, sz);
        wall.rotation.x = -slope;
        addAnimeOutline(wall, 1.03, 0x334155);
        worldGroup.add(wall);
      });
    }
    // Piliers & lanternes aux 4 coins du pont Nord-Sud
    [-bridgeSpec.halfZ + 0.4, bridgeSpec.halfZ - 0.4].forEach((pz) => {
      const py = getTerrainY(0, pz, 'lafontaine');
      [-bridgeSpec.halfX - 0.25, bridgeSpec.halfX + 0.25].forEach((px) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.75, 0.7), bridgeTrimMat);
        post.position.set(px, py + 0.75, pz);
        addAnimeOutline(post, 1.04, 0x1e293b);
        worldGroup.add(post);
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), lampGlowMat);
        lantern.position.set(px, py + 1.82, pz);
        worldGroup.add(lantern);
      });
    });

    // Pergola du Théâtre de Verdure hors zone de jeu (Nord & Sud Z = ±69)
    [-69, 69].forEach((pz) => {
      const amphFloor = new THREE.Mesh(new THREE.CircleGeometry(14, 24, 0, Math.PI), stoneMat);
      amphFloor.rotation.x = -Math.PI / 2;
      if (pz > 0) amphFloor.rotation.z = Math.PI;
      amphFloor.position.set(0, 0.01, pz);
      worldGroup.add(amphFloor);
    });
  } else if (style === 'saint-viateur') {
    const sv = PARK_LANDMARKS.saintViateur;

    // Étang entourant l'île centrale du Chalet Saint-Viateur
    const svPond = new THREE.Mesh(new THREE.CircleGeometry(1, 56), waterMat);
    svPond.rotation.x = -Math.PI / 2;
    svPond.scale.set(sv.pondRx, sv.pondRz, 1);
    svPond.position.set(0, 0.036, 0);
    worldGroup.add(svPond);

    const svPondShimmer = new THREE.Mesh(new THREE.CircleGeometry(1, 48), waterShimmerMat);
    svPondShimmer.rotation.x = -Math.PI / 2;
    svPondShimmer.scale.set((sv.islandRx + sv.pondRx) * 0.5, (sv.islandRz + sv.pondRz) * 0.5, 1);
    svPondShimmer.position.set(0, 0.044, 0);
    worldGroup.add(svPondShimmer);

    // Île centrale verte et esplanade du chalet (opaque par-dessus l'eau au centre)
    const islandTurfMat = createToonMat(0x22c55e);
    const islandDeck = new THREE.Mesh(new THREE.CircleGeometry(1, 48), islandTurfMat);
    islandDeck.rotation.x = -Math.PI / 2;
    islandDeck.scale.set(sv.islandRx, sv.islandRz, 1);
    islandDeck.position.set(0, 0.056, 0);
    islandDeck.receiveShadow = true;
    worldGroup.add(islandDeck);

    const plazaRing = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.92, 44), stoneMat);
    plazaRing.rotation.x = -Math.PI / 2;
    plazaRing.scale.set(sv.islandRx, sv.islandRz, 1);
    plazaRing.position.set(0, 0.064, 0);
    worldGroup.add(plazaRing);

    // Bordures de pierre de la rive extérieure et de l'île centrale (interrompues aux 2 ponts Est-Ouest)
    [
      { rx: sv.pondRx + 0.35, rz: sv.pondRz + 0.35, count: 56 },
      { rx: sv.islandRx - 0.25, rz: sv.islandRz - 0.25, count: 40 }
    ].forEach(({ rx, rz, count }) => {
      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2;
        const px = Math.cos(theta) * rx;
        const pz = Math.sin(theta) * rz;
        if (Math.abs(pz) < sv.bridgeHalfZ + 0.72) continue;
        const curb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.38, 0.9), stoneMat);
        curb.position.set(px, 0.2, pz);
        curb.rotation.y = Math.atan2(Math.cos(theta) * rz, -Math.sin(theta) * rx);
        addAnimeOutline(curb, 1.03, 0x334155);
        worldGroup.add(curb);
      }
    });

    // Deux ponts arqués Est & Ouest reliant les berges à l'île centrale
    const svBridgeDeckMat = createToonMat(0xb45309);
    const svLampMat = createToonMat(0xfef08a, { emissive: 0xfacc15, emissiveIntensity: 0.8 });
    [-1, 1].forEach((sideX) => {
      const steps = 9;
      const bridgeSpan = sv.bridgeOuterX - sv.bridgeInnerX;
      const stepSpan = bridgeSpan / steps;
      for (let i = 0; i < steps; i++) {
        const ax = sv.bridgeInnerX + (i + 0.5) * stepSpan;
        const sx = sideX * ax;
        const sy = getTerrainY(sx, 0, 'saint-viateur');
        const nextAx = sv.bridgeInnerX + (i + 1) * stepSpan;
        const prevAx = sv.bridgeInnerX + i * stepSpan;
        const slope = Math.atan2(
          getTerrainY(sideX * nextAx, 0, 'saint-viateur') - getTerrainY(sideX * prevAx, 0, 'saint-viateur'),
          stepSpan
        );
        const plank = new THREE.Mesh(
          new THREE.BoxGeometry(stepSpan + 0.16, 0.34, sv.bridgeHalfZ * 2),
          svBridgeDeckMat
        );
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

    // Chalet central du parc Saint-Viateur d'Outremont (d'après la photo de référence 1)
    const chaletGroup = new THREE.Group();
    const chaletRoofGroup = new THREE.Group();
    const stuccoMat = createToonMat(0xf1efe6);
    const plinthMat = createToonMat(0x9ca3af);
    const interiorShadowMat = createToonMat(0x1f2428);
    const slateRoofMat = createToonMat(0x475569);
    const roofTrimMat = createToonMat(0x334155);
    const woodWindowMat = createToonMat(0x7c4a2d);
    const windowGlassMat = createToonMat(0x1e293b, { emissive: 0x334155, emissiveIntensity: 0.22 });
    const lanternLightMat = createToonMat(0xfde68a, { emissive: 0xfbbf24, emissiveIntensity: 0.75 });

    // Socle en béton + marches de perron avant & arrière avec murets latéraux (cheek walls)
    const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.9, 12.4), plinthMat);
    basePlinth.position.y = 0.45;
    basePlinth.castShadow = true;
    basePlinth.receiveShadow = true;
    addAnimeOutline(basePlinth, 1.02, 0x334155);
    chaletGroup.add(basePlinth);

    [-1, 1].forEach((sideZ) => {
      for (let s = 0; s < 3; s++) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(15.6 + s * 0.45, 0.24, 0.75),
          plinthMat
        );
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

    // Cœur sombre en retrait derrière l'arcade ouverte
    const coreBlock = new THREE.Mesh(new THREE.BoxGeometry(14.4, 3.6, 9.6), interiorShadowMat);
    coreBlock.position.y = 2.7;
    chaletGroup.add(coreBlock);

    // Façades arcade en stuc crème : larges arches cintrées et fentes étroites jumelées
    const addArcadeBay = (bx, bz, rotY, width, isWideArch) => {
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

      // Voussoir cintré léger sous le linteau
      const archShoulderW = width * 0.22;
      [-width * 0.26, width * 0.26].forEach((ax) => {
        const shoulder = new THREE.Mesh(new THREE.BoxGeometry(archShoulderW, 0.35, 0.6), stuccoMat);
        shoulder.position.set(ax, pillarH - lintelH - 0.12, 0);
        bay.add(shoulder);
      });
      chaletGroup.add(bay);
    };

    // Façades longues Nord (-6.0) et Sud (+6.0) : 5 grandes arches + 4 piliers étroits
    [-5.9, 5.9].forEach((fz) => {
      const rot = fz > 0 ? 0 : Math.PI;
      [-6.0, -3.0, 0, 3.0, 6.0].forEach((ax) => {
        addArcadeBay(ax, fz, rot, 2.55, true);
      });
      // Piliers d'angle à doubles fenêtres étroites
      [-7.75, 7.75].forEach((cx) => {
        addArcadeBay(cx, fz, rot, 0.95, false);
      });
      // Lanterne murale au-dessus de l'arche centrale
      const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.32), lanternLightMat);
      sconce.position.set(0, 4.12, fz + (fz > 0 ? 0.45 : -0.45));
      chaletGroup.add(sconce);
    });

    // Façades courtes Est (+8.25) et Ouest (-8.25) : 3 arches + angles
    [-8.25, 8.25].forEach((fx) => {
      const rot = fx > 0 ? Math.PI / 2 : -Math.PI / 2;
      [-3.4, 0, 3.4].forEach((az) => {
        addArcadeBay(fx, az, rot, 2.85, true);
      });
      [-5.1, 5.1].forEach((cz) => {
        addArcadeBay(fx, cz, rot, 1.1, false);
      });
      const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.32), lanternLightMat);
      sconce.position.set(fx + (fx > 0 ? 0.45 : -0.45), 4.12, 0);
      chaletGroup.add(sconce);
    });

    // Toit principal en croupe en ardoise foncée + légères vagues cintrées (transparent au passage caméra)
    const eaveTrim = new THREE.Mesh(new THREE.BoxGeometry(18.1, 0.24, 13.3), roofTrimMat);
    eaveTrim.position.y = 4.55;
    addAnimeOutline(eaveTrim, 1.02, 0x0f172a);
    chaletRoofGroup.add(eaveTrim);

    const mainRoofGeo = new THREE.ConeGeometry(10.8, 2.35, 4);
    const mainRoof = new THREE.Mesh(mainRoofGeo, slateRoofMat);
    mainRoof.rotation.y = Math.PI / 4;
    mainRoof.scale.set(1.22, 1, 0.92);
    mainRoof.position.y = 5.75;
    mainRoof.castShadow = true;
    addAnimeOutline(mainRoof, 1.02, 0x0f172a);
    chaletRoofGroup.add(mainRoof);

    // Frontons ondulés caractéristiques du toit au-dessus des entrées principales (4 côtés)
    [-6.55, 6.55].forEach((gz) => {
      const brow = new THREE.Mesh(
        new THREE.CylinderGeometry(2.3, 2.6, 1.8, 12, 1, false, -Math.PI / 2, Math.PI),
        slateRoofMat
      );
      brow.rotation.x = Math.PI / 2;
      brow.scale.set(1.35, 1, 0.38);
      brow.position.set(0, 4.68, gz > 0 ? 5.65 : -5.65);
      chaletRoofGroup.add(brow);
    });
    [-8.8, 8.8].forEach((gx) => {
      const brow = new THREE.Mesh(
        new THREE.CylinderGeometry(2.0, 2.3, 1.6, 12, 1, false, -Math.PI / 2, Math.PI),
        slateRoofMat
      );
      brow.rotation.z = Math.PI / 2;
      brow.rotation.y = Math.PI / 2;
      brow.scale.set(1.3, 1, 0.36);
      brow.position.set(gx > 0 ? 7.9 : -7.9, 4.68, 0);
      chaletRoofGroup.add(brow);
    });

    // Lanterneau carré central surélevé avec grandes fenêtres cintrées à meneaux bruns
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

    // 2 cheminées blanches de part et d'autre du lanterneau
    [-4.2, 4.2].forEach((chx) => {
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.6, 0.92), stuccoMat);
      chimney.position.set(chx, 7.25, -1.65);
      addAnimeOutline(chimney, 1.03, 0x334155);
      chaletRoofGroup.add(chimney);
    });

    chaletGroup.add(chaletRoofGroup);
    worldGroup.add(chaletGroup);
    registerCameraTreeOccluder(chaletRoofGroup, 0, 4.5, 9.8, 0, 8.2);

    // Colonnes d'Outremont en coin hors terrain de jeu
    [-74, 74].forEach((px) => {
      [-64, 64].forEach((pz) => {
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.5, 5.5), stoneMat);
        plinth.position.set(px, 0.25, pz);
        worldGroup.add(plinth);
        [-1.8, 1.8].forEach((cx) => {
          [-1.8, 1.8].forEach((cz) => {
            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 4.2, 8), stoneMat);
            col.position.set(px + cx, 2.6, pz + cz);
            addAnimeOutline(col, 1.04, 0x334155);
            worldGroup.add(col);
          });
        });
      });
    });
  } else if (style === 'jarry') {
    // Parc Jarry : terrain vaste et plat avec uniquement le Gazebo octogonal central (photo 2) + piste périphérique
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

    // Socle octogonal surélevé à croisillons
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

    // Escaliers d'accès Ouest & Est (-X / +X)
    [-1, 1].forEach((sx) => {
      for (let st = 0; st < 3; st++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 2.2), deckWoodMat);
        step.position.set(sx * (4.55 + st * 0.45), 0.72 - st * 0.24, 0);
        gaz.add(step);
      }
    });

    // 8 poteaux blancs, doubles garde-corps, bancs intérieurs & frise dentelée bleu-gris pâle
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

      // Frise filigrane bleu-gris pâle sous l'avant-toit (tous les 8 côtés)
      const frieze = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, span), filigreeBlueMat);
      frieze.position.set(midX, 3.98, midZ);
      frieze.rotation.y = yaw;
      addAnimeOutline(frieze, 1.02, 0x475569);
      gaz.add(frieze);

      // Garde-corps blancs et bancs (ouverts aux entrées Est/Ouest où |midZ| < 1.2)
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

      // Arête crème le long des 8 arêtiers du toit
      const hip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 5.3), whiteWoodMat);
      hip.position.set(x0 * 0.55, 5.75, z0 * 0.55);
      const hipYaw = Math.atan2(x0, z0);
      hip.rotation.y = hipYaw;
      hip.rotation.x = 0.57;
      gazRoofGroup.add(hip);
    }

    // Toit pyramidal octogonal vert forêt à bardeaux + épi de faîtage blanc
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

    gaz.add(gazRoofGroup);
    worldGroup.add(gaz);
    registerCameraTreeOccluder(gazRoofGroup, 0, 4.1, 8.2, 0, 4.8);
  } else if (style === 'mont-royal') {
    // Grande colline centrale praticable du Mont-Royal avec sommet plateau (r<=13.5, y=7.6)
    const hillSize = 76;
    const hillSegs = 56;
    const hillGeo = new THREE.PlaneGeometry(hillSize, hillSize, hillSegs, hillSegs);
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
      if (dist <= 13.8) {
        tmpColor.copy(colPlateau);
      } else if (dist <= 19.5) {
        tmpColor.copy(colRock).lerp(colMidSlope, (dist - 13.8) / 5.7);
      } else {
        tmpColor.copy(colMidSlope).lerp(colGrass, Math.min(1, (dist - 19.5) / 15.5));
      }
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    hillGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    hillGeo.computeVertexNormals();

    const hillMesh = new THREE.Mesh(
      hillGeo,
      new THREE.MeshLambertMaterial({ vertexColors: true })
    );
    hillMesh.receiveShadow = true;
    hillMesh.castShadow = true;
    worldGroup.add(hillMesh);

    // Petit lac ovale au sommet de la colline (0, 4.2) à y = 7.62
    const mr = PARK_LANDMARKS.montRoyal;
    const summitY = mr.hillHeight;
    const lakeSpec = { x: mr.lakeX, z: mr.lakeZ, rx: mr.lakeRx, rz: mr.lakeRz };
    const summitLake = new THREE.Mesh(new THREE.CircleGeometry(1, 32), waterMat);
    summitLake.rotation.x = -Math.PI / 2;
    summitLake.scale.set(lakeSpec.rx, lakeSpec.rz, 1);
    summitLake.position.set(lakeSpec.x, summitY + 0.03, lakeSpec.z);
    worldGroup.add(summitLake);

    const lakeRim = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 32), waterEdgeMat);
    lakeRim.rotation.x = -Math.PI / 2;
    lakeRim.scale.set(lakeSpec.rx, lakeSpec.rz, 1);
    lakeRim.position.set(lakeSpec.x, summitY + 0.045, lakeSpec.z);
    worldGroup.add(lakeRim);

    // Croix du Mont-Royal plus compacte et bien proportionnée pour reconnaître immédiatement sa silhouette
    const crossSpec = { x: mr.crossX, z: mr.crossZ, radius: mr.crossRadius };
    const crossGroup = new THREE.Group();
    crossGroup.position.set(crossSpec.x, summitY, crossSpec.z);

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

    // Treillis métallique ajouré en X du mât et de la large traverse horizontale
    const addChord = (x1, y1, z1, x2, y2, z2, r) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dy, dz);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), steelMat);
      bar.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      crossGroup.add(bar);
    };

    const mastTopY = 7.4;
    const mastBaseY = 1.68;
    // Âme lumineuse fine à l'intérieur du treillis pour rendre la croix lisible de dessus comme de face
    const innerMast = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, mastTopY - mastBaseY - 0.2, 0.24),
      innerCrossGlowMat
    );
    innerMast.position.set(0, (mastBaseY + mastTopY) * 0.5, 0);
    crossGroup.add(innerMast);

    const armY0 = 4.95;
    const armY1 = 5.75;
    const armHalfX = 2.45;
    const armD = 0.34;
    const innerArm = new THREE.Mesh(
      new THREE.BoxGeometry(armHalfX * 2 - 0.16, 0.28, 0.24),
      innerCrossGlowMat
    );
    innerArm.position.set(0, (armY0 + armY1) * 0.5, 0);
    crossGroup.add(innerArm);

    // 4 montants d'angle du mât finement effilés
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1]
    ].forEach(([sx, sz]) => {
      addChord(sx * 0.56, mastBaseY, sz * 0.42, sx * 0.4, mastTopY, sz * 0.34, 0.055);
    });
    const mastLevels = 5;
    for (let i = 0; i < mastLevels; i++) {
      const t0 = i / mastLevels;
      const t1 = (i + 1) / mastLevels;
      const y0 = mastBaseY + t0 * (mastTopY - mastBaseY);
      const y1 = mastBaseY + t1 * (mastTopY - mastBaseY);
      const w0 = 0.56 - t0 * 0.16;
      const w1 = 0.56 - t1 * 0.16;
      const d0 = 0.42 - t0 * 0.08;
      const d1 = 0.42 - t1 * 0.08;
      [-d0, d0].forEach((zd, idx) => {
        const zd1 = idx === 0 ? -d1 : d1;
        addChord(-w0, y0, zd, w1, y1, zd1, 0.032);
        addChord(w0, y0, zd, -w1, y1, zd1, 0.032);
        addChord(-w1, y1, zd1, w1, y1, zd1, 0.038);
      });
    }

    // Traverse horizontale bien large (armHalfX = 2.45) pour une croix immédiatement identifiable
    [
      [armY0, -armD],
      [armY0, armD],
      [armY1, -armD],
      [armY1, armD]
    ].forEach(([ay, az]) => {
      addChord(-armHalfX, ay, az, armHalfX, ay, az, 0.055);
    });
    const armSegs = 6;
    for (let i = 0; i < armSegs; i++) {
      const ax0 = -armHalfX + (i / armSegs) * armHalfX * 2;
      const ax1 = -armHalfX + ((i + 1) / armSegs) * armHalfX * 2;
      [-armD, armD].forEach((az) => {
        addChord(ax0, armY0, az, ax1, armY1, az, 0.032);
        addChord(ax0, armY1, az, ax1, armY0, az, 0.032);
        addChord(ax0, armY0, az, ax0, armY1, az, 0.038);
      });
    }
    [-armD, armD].forEach((az) => addChord(armHalfX, armY0, az, armHalfX, armY1, az, 0.038));

    // Guirlande de LED multicolores emblématiques sur le pourtour de la Croix
    const ledPalette = [0xfde047, 0xf59e0b, 0xef4444, 0x22c55e, 0x38bdf8, 0xfef08a];
    const ledMats = ledPalette.map((hex) =>
      createBasicMat({ color: hex, keepBright: true })
    );
    let ledIdx = 0;
    const addLed = (lx, ly, lz) => {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), ledMats[ledIdx % ledMats.length]);
      bulb.position.set(lx, ly, lz);
      crossGroup.add(bulb);
      ledIdx++;
    };
    for (let ly = 2.0; ly <= mastTopY; ly += 0.65) {
      const t = (ly - mastBaseY) / (mastTopY - mastBaseY);
      const wx = 0.56 - t * 0.16;
      addLed(-wx, ly, 0.42);
      addLed(wx, ly, 0.42);
      addLed(-wx, ly, -0.42);
      addLed(wx, ly, -0.42);
    }
    for (let lx = -armHalfX; lx <= armHalfX + 0.01; lx += 0.49) {
      addLed(lx, armY0, 0.36);
      addLed(lx, armY1, 0.36);
      addLed(lx, armY0, -0.36);
      addLed(lx, armY1, -0.36);
    }
    addLed(-0.38, mastTopY + 0.05, 0);
    addLed(0, mastTopY + 0.05, 0);
    addLed(0.38, mastTopY + 0.05, 0);

    worldGroup.add(crossGroup);
    registerCameraTreeOccluder(crossGroup, crossSpec.x, summitY + 1.5, summitY + 7.6, crossSpec.z, 2.8);

    // Chemin Olmsted en lacets autour des approches Ouest & Est de la colline
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
  } else if (style === 'rift') {
    buildRiftArenaLandmarks(mapMeta, waterMat, waterShimmerMat, waterEdgeMat, stoneMat, darkStoneMat);
  }
}

function createRiftPineTree(x, yBase, z, scale = 1.0, mapMeta = getActiveMapMeta()) {
  const tree = new THREE.Group();
  tree.position.set(x, yBase, z);

  const trunkMat = createToonMat(0x4a3525);
  const pineDarkMat = createToonMat(mapMeta.foliageShrineHex || 0x1e4d2b);
  const pineMidMat = createToonMat(mapMeta.foliagePrimaryHex || 0x2f6b2f);
  const pineLightMat = createToonMat(mapMeta.foliageSecondaryHex || 0x4d7c38);

  const trunkH = 2.1 * scale;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * scale, 0.44 * scale, trunkH, 7), trunkMat);
  trunk.position.y = trunkH * 0.5;
  trunk.castShadow = true;
  addAnimeOutline(trunk, 1.05, 0x0f172a);
  tree.add(trunk);

  const tiers = [
    { r: 2.05 * scale, h: 2.6 * scale, y: trunkH + 0.85 * scale, mat: pineDarkMat },
    { r: 1.55 * scale, h: 2.3 * scale, y: trunkH + 2.25 * scale, mat: pineMidMat },
    { r: 1.05 * scale, h: 1.9 * scale, y: trunkH + 3.5 * scale, mat: pineLightMat }
  ];
  tiers.forEach((t) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 7), t.mat);
    cone.position.y = t.y;
    cone.castShadow = true;
    addAnimeOutline(cone, 1.045, 0x052e16);
    tree.add(cone);
  });

  worldGroup.add(tree);
  registerCameraTreeOccluder(tree, x, yBase, yBase + trunkH + 4.5 * scale, z, 2.2 * scale);
}

function buildRiftArenaLandmarks(mapMeta, waterMat, waterShimmerMat, waterEdgeMat, stoneMat, darkStoneMat) {
  const rf = PARK_LANDMARKS.rift;
  const dirtColor = darkenDecorHex(0x8c673e, 0.72);
  const dirtBorderColor = darkenDecorHex(0x5c4226, 0.75);
  const mossCapMat = createToonMat(0x36692b);
  const cliffRockMat = createToonMat(0x334155);
  const bastionStoneMat = createToonMat(0x475569);
  const baseFloorMat = createToonMat(0x3f4c5e);
  const baseTileLineMat = createBasicMat({ color: 0x1e293b, transparent: true, opacity: 0.52, depthWrite: false });

  // 1. Trois couloirs terre battue (Top courbe, Mid diagonal, Bot courbe) + rives de jungle
  const addDirtRoad = (x1, z1, x2, z2, width) => {
    createLaneConnectorSegment(x1, z1, x2, z2, width + 1.8, dirtBorderColor, 0.42);
    createLaneConnectorSegment(x1, z1, x2, z2, width, dirtColor, 0.78);
  };
  // Top Lane (Ouest -> angle Nord-Ouest -> Nord)
  addDirtRoad(-76, 44, -76, -54, 15.5);
  addDirtRoad(-76, -54, -71, -69, 15.5);
  addDirtRoad(-71, -69, -54, -76, 15.5);
  addDirtRoad(-54, -76, 44, -76, 15.5);
  // Bot Lane (Sud -> angle Sud-Est -> Est)
  addDirtRoad(-44, 76, 54, 76, 15.5);
  addDirtRoad(54, 76, 69, 71, 15.5);
  addDirtRoad(69, 71, 76, 54, 15.5);
  addDirtRoad(76, 54, 76, -44, 15.5);
  // Mid Lane (diagonale Sud-Ouest -> Nord-Est)
  addDirtRoad(-56, 56, 56, -56, 15.0);

  // Anneaux de spawn des 2 ballons (Top-Left et Bot-Right)
  const spawnRingMat = createBasicMat({ color: 0xfde047, side: THREE.DoubleSide, transparent: true, opacity: 0.78, depthWrite: false });
  [
    [-68, -68],
    [68, 68]
  ].forEach(([bx, bz]) => {
    const rOuter = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.75, 32), spawnRingMat);
    rOuter.rotation.x = -Math.PI / 2;
    rOuter.position.set(bx, 0.055, bz);
    worldGroup.add(rOuter);
  });

  // 2. Deux rivières sortantes (Centre -> Sidelane NO & Centre -> Sidelane SE) + Lac central inondant le Mid + Grande Chute d'eau
  createLaneConnectorSegment(-85, -85, 85, 85, rf.riverHalfWidth * 2 + 3.2, darkenDecorHex(0x4b5c34, 0.72), 0.72);
  createLaneConnectorSegment(-85, -85, 85, 85, rf.riverHalfWidth * 2, darkenDecorHex(0x0c4a6e, 0.74), 0.76);
  createLaneConnectorSegment(-84, -84, 84, 84, rf.riverHalfWidth * 1.1, darkenDecorHex(0x0284c7, 0.68), 0.42);

  // Rubans animés de courant partant du lac central vers chaque sidelane (NO Toplane & SE Botlane)
  const createFlowTexture = () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // Chevrons élancés (~60°) alignés le long de +U pour indiquer clairement le sens du courant
    [48, 176].forEach((cx) => {
      [68, 188].forEach((cy) => {
        g.strokeStyle = 'rgba(12, 74, 110, 0.55)';
        g.lineWidth = 14;
        g.beginPath();
        g.moveTo(cx - 28, cy - 26);
        g.lineTo(cx + 28, cy);
        g.lineTo(cx - 28, cy + 26);
        g.stroke();

        g.strokeStyle = 'rgba(224, 242, 254, 0.92)';
        g.lineWidth = 8.5;
        g.beginPath();
        g.moveTo(cx - 28, cy - 26);
        g.lineTo(cx + 28, cy);
        g.lineTo(cx - 28, cy + 26);
        g.stroke();
      });
    });
    g.fillStyle = 'rgba(186, 230, 253, 0.45)';
    for (let i = 0; i < 12; i++) {
      g.fillRect((i * 47) % 210, (i * 73) % 244, 34, 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(7, 1);
    tex.anisotropy = 8;
    return tex;
  };
  [
    { x1: -8.2, z1: -8.2, x2: -65, z2: -65 },
    { x1: 8.2, z1: 8.2, x2: 65, z2: 65 }
  ].forEach(({ x1, z1, x2, z2 }) => {
    const tex = createFlowTexture();
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ribbon = new THREE.Mesh(
      new THREE.PlaneGeometry(len, rf.riverHalfWidth * 1.45),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false, fog: false })
    );
    ribbon.rotation.x = -Math.PI / 2;
    ribbon.rotation.z = -Math.atan2(dz, dx);
    ribbon.position.set((x1 + x2) * 0.5, 0.056, (z1 + z2) * 0.5);
    worldGroup.add(ribbon);
    animatedWaterTextures.push({ tex, speedX: -1.1, speedY: 0 });
  });

  // Petit lac circulaire au centre de la midlane (inondé par la grande chute d'eau)
  const lakeShore = new THREE.Mesh(
    new THREE.CircleGeometry(rf.centerLakeRadius + 1.4, 40),
    createBasicMat({ color: darkenDecorHex(0x4b5c34, 0.72), transparent: true, opacity: 0.72, depthWrite: false })
  );
  lakeShore.rotation.x = -Math.PI / 2;
  lakeShore.position.set(0, 0.022, 0);
  worldGroup.add(lakeShore);

  const centerLake = new THREE.Mesh(
    new THREE.CircleGeometry(rf.centerLakeRadius, 40),
    createBasicMat({ color: darkenDecorHex(0x0c4a6e, 0.7), transparent: true, opacity: 0.82, depthWrite: false })
  );
  centerLake.rotation.x = -Math.PI / 2;
  centerLake.position.set(0, 0.036, 0);
  worldGroup.add(centerLake);

  const centerLakeShimmer = new THREE.Mesh(new THREE.CircleGeometry(rf.centerLakeRadius * 0.78, 36), waterShimmerMat);
  centerLakeShimmer.rotation.x = -Math.PI / 2;
  centerLakeShimmer.position.set(0, 0.044, 0);
  worldGroup.add(centerLakeShimmer);

  [3.4, 5.4, 8.2].forEach((rr, idx) => {
    const foamRing = new THREE.Mesh(
      new THREE.RingGeometry(rr - 0.25, rr + 0.28, 32),
      createBasicMat({ color: 0xe0f2fe, side: THREE.DoubleSide, transparent: true, opacity: 0.58 - idx * 0.14, depthWrite: false })
    );
    foamRing.rotation.x = -Math.PI / 2;
    foamRing.position.set(0, 0.052, 0);
    worldGroup.add(foamRing);
  });

  // Grande chute d'eau centrale imposante (piton rocheux à deux paliers + bassin céleste + 8 cascades animées + brume)
  const waterfallGroup = new THREE.Group();
  const wfBaseRock = new THREE.Mesh(new THREE.CylinderGeometry(1.88, 2.22, 6.6, 8), cliffRockMat);
  wfBaseRock.position.y = 3.3;
  wfBaseRock.castShadow = true;
  wfBaseRock.receiveShadow = true;
  addAnimeOutline(wfBaseRock, 1.04, 0x0f172a);
  waterfallGroup.add(wfBaseRock);

  const wfMidCliff = new THREE.Mesh(new THREE.CylinderGeometry(1.56, 1.9, 8.2, 8), cliffRockMat);
  wfMidCliff.position.y = 10.5;
  wfMidCliff.castShadow = true;
  addAnimeOutline(wfMidCliff, 1.04, 0x0f172a);
  waterfallGroup.add(wfMidCliff);

  const wfMidLedge = new THREE.Mesh(new THREE.CylinderGeometry(2.22, 1.72, 1.0, 8), mossCapMat);
  wfMidLedge.position.y = 13.85;
  wfMidLedge.castShadow = true;
  addAnimeOutline(wfMidLedge, 1.04, 0x052e16);
  waterfallGroup.add(wfMidLedge);

  const wfMidPool = new THREE.Mesh(
    new THREE.CylinderGeometry(1.96, 1.96, 0.2, 16),
    createToonMat(0x38bdf8, { emissive: 0x0ea5e9, emissiveIntensity: 0.48 })
  );
  wfMidPool.position.y = 14.38;
  waterfallGroup.add(wfMidPool);

  const wfSpire = new THREE.Mesh(new THREE.CylinderGeometry(1.26, 1.62, 9.8, 8), cliffRockMat);
  wfSpire.position.y = 19.3;
  wfSpire.castShadow = true;
  addAnimeOutline(wfSpire, 1.04, 0x0f172a);
  waterfallGroup.add(wfSpire);

  const wfTopRim = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 1.48, 1.15, 8), mossCapMat);
  wfTopRim.position.y = 24.45;
  wfTopRim.castShadow = true;
  addAnimeOutline(wfTopRim, 1.04, 0x052e16);
  waterfallGroup.add(wfTopRim);

  const wfTopPool = new THREE.Mesh(
    new THREE.CylinderGeometry(2.05, 2.05, 0.26, 20),
    createToonMat(0x38bdf8, { emissive: 0x0ea5e9, emissiveIntensity: 0.65 })
  );
  wfTopPool.position.y = 25.08;
  waterfallGroup.add(wfTopPool);

  const wfCrestMist = new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 12, 10),
    createToonMat(0xe0f2fe, { emissive: 0x7dd3fc, emissiveIntensity: 0.45 })
  );
  wfCrestMist.scale.set(1.35, 0.55, 1.35);
  wfCrestMist.position.y = 25.35;
  waterfallGroup.add(wfCrestMist);

  const wfCanvas = document.createElement('canvas');
  wfCanvas.width = 64;
  wfCanvas.height = 128;
  const wfCtx = wfCanvas.getContext('2d');
  wfCtx.fillStyle = 'rgba(14, 165, 233, 0.78)';
  wfCtx.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 20; i++) {
    wfCtx.fillStyle = i % 2 === 0 ? 'rgba(224, 242, 254, 0.9)' : 'rgba(125, 211, 252, 0.74)';
    wfCtx.fillRect((i * 11) % 56, (i * 19) % 110, 4 + (i % 3) * 2, 26 + (i % 4) * 8);
  }
  const wfTex = new THREE.CanvasTexture(wfCanvas);
  wfTex.wrapS = THREE.RepeatWrapping;
  wfTex.wrapT = THREE.RepeatWrapping;
  wfTex.repeat.set(1, 5.2);
  animatedWaterTextures.push({ tex: wfTex, speedX: 0, speedY: 2.15 });

  const wfSubTex = wfTex.clone();
  wfSubTex.needsUpdate = true;
  wfSubTex.repeat.set(1, 3.0);
  animatedWaterTextures.push({ tex: wfSubTex, speedX: 0, speedY: 2.45 });

  const wfMat = new THREE.MeshBasicMaterial({
    map: wfTex,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const wfSubMat = new THREE.MeshBasicMaterial({
    map: wfSubTex,
    transparent: true,
    opacity: 0.84,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.08, 24.5), wfMat);
    sheet.position.set(Math.sin(ang) * 2.05, 12.28, Math.cos(ang) * 2.05);
    sheet.rotation.y = ang;
    sheet.rotation.x = -0.045;
    waterfallGroup.add(sheet);

    const subAng = ang + Math.PI / 4;
    const subSheet = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 13.8), wfSubMat);
    subSheet.position.set(Math.sin(subAng) * 2.08, 6.95, Math.cos(subAng) * 2.08);
    subSheet.rotation.y = subAng;
    subSheet.rotation.x = -0.06;
    waterfallGroup.add(subSheet);
  }
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const splashDome = new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 10, 8),
      createToonMat(0xe0f2fe, { emissive: 0xbae6fd, emissiveIntensity: 0.42 })
    );
    splashDome.scale.set(1.3, 0.56, 1.3);
    splashDome.position.set(Math.sin(ang) * 2.35, 0.3, Math.cos(ang) * 2.35);
    waterfallGroup.add(splashDome);
  }
  const plungeMistRing = new THREE.Mesh(
    new THREE.RingGeometry(2.15, 3.85, 32),
    createBasicMat({ color: 0xe0f2fe, side: THREE.DoubleSide, transparent: true, opacity: 0.52, depthWrite: false })
  );
  plungeMistRing.rotation.x = -Math.PI / 2;
  plungeMistRing.position.y = 0.08;
  waterfallGroup.add(plungeMistRing);

  worldGroup.add(waterfallGroup);
  registerCameraTreeOccluder(waterfallGroup, 0, 2.0, 26.0, 0, 3.6);

  // Fosses aquatiques élargies pour Baron (NO) et Dragon (SE) avec sceaux runiques celtiques entrelacés
  const createCelticPitRuneTexture = (kind, primaryRgba, highlightRgba, shadowRgba) => {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const cx = size * 0.5;
    const cy = size * 0.5;
    g.clearRect(0, 0, size, size);

    // Halo mystique sombre sous l'eau de la fosse
    const radGrad = g.createRadialGradient(cx, cy, 14, cx, cy, 240);
    radGrad.addColorStop(0, shadowRgba);
    radGrad.addColorStop(0.55, primaryRgba.replace(/[\d.]+\)$/, '0.24)'));
    radGrad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = radGrad;
    g.beginPath();
    g.arc(cx, cy, 244, 0, Math.PI * 2);
    g.fill();

    // Tresse celtique circulaire externe (2 rubans sinusoïdaux entrelacés + bordure sombre)
    const braidR = 204;
    const braidAmp = 14;
    const braidLobes = 16;
    const steps = 360;
    const drawBraidStrand = (phase, strokeColor, lineWidth) => {
      g.strokeStyle = strokeColor;
      g.lineWidth = lineWidth;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const r = braidR + Math.sin(a * braidLobes + phase) * braidAmp;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.stroke();
    };
    drawBraidStrand(0, 'rgba(15, 23, 42, 0.72)', 11);
    drawBraidStrand(0, primaryRgba, 6.2);
    drawBraidStrand(Math.PI, 'rgba(15, 23, 42, 0.72)', 11);
    drawBraidStrand(Math.PI, highlightRgba, 4.8);

    // Double anneau runique contenant 12 glyphes géométriques gravés
    [226, 178, 134].forEach((r, idx) => {
      g.strokeStyle = idx === 1 ? primaryRgba : highlightRgba;
      g.lineWidth = idx === 1 ? 2.6 : 1.8;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
    });

    const glyphCount = 12;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let k = 0; k < glyphCount; k++) {
      const ang = (k / glyphCount) * Math.PI * 2;
      g.save();
      g.translate(cx + Math.cos(ang) * 156, cy + Math.sin(ang) * 156);
      g.rotate(ang + Math.PI * 0.5);
      g.strokeStyle = highlightRgba;
      g.lineWidth = 2.8;
      g.beginPath();
      const pattern = k % 4;
      // Traits angulaires inspirés d'ogham et de runes gravées
      g.moveTo(0, -13);
      g.lineTo(0, 13);
      if (pattern === 0) {
        g.moveTo(-8, -7);
        g.lineTo(8, 0);
        g.lineTo(-8, 7);
      } else if (pattern === 1) {
        g.moveTo(-7, -10);
        g.lineTo(7, -2);
        g.moveTo(0, 2);
        g.lineTo(8, 10);
      } else if (pattern === 2) {
        g.moveTo(-7, -4);
        g.lineTo(0, -12);
        g.lineTo(7, -4);
        g.lineTo(0, 4);
        g.closePath();
      } else {
        g.moveTo(-8, -9);
        g.lineTo(8, -9);
        g.moveTo(-6, 1);
        g.lineTo(7, 9);
      }
      g.stroke();
      g.restore();
    }

    // Grand nœud celtique central : entrelacs 4-lobes + Triquetra / Triskèle selon le pit
    const lobes = kind === 'baron' ? 4 : 3;
    const knotCount = lobes * 2;
    for (let i = 0; i < knotCount; i++) {
      const a = (i / knotCount) * Math.PI * 2;
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      g.strokeStyle = 'rgba(15, 23, 42, 0.78)';
      g.lineWidth = 11;
      g.beginPath();
      g.ellipse(62, 0, 56, 26, 0, 0, Math.PI * 2);
      g.stroke();

      g.strokeStyle = i % 2 === 0 ? primaryRgba : highlightRgba;
      g.lineWidth = 5.4;
      g.beginPath();
      g.ellipse(62, 0, 56, 26, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }

    // Étoile géométrique entrelacée (deux carrés / triangles superposés)
    const polyVerts = kind === 'baron' ? 4 : 3;
    [0, Math.PI / polyVerts].forEach((rot, idx) => {
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.strokeStyle = idx === 0 ? highlightRgba : primaryRgba;
      g.lineWidth = 3.2;
      g.beginPath();
      for (let v = 0; v <= polyVerts; v++) {
        const va = (v / polyVerts) * Math.PI * 2;
        const vx = Math.cos(va) * 124;
        const vy = Math.sin(va) * 124;
        if (v === 0) g.moveTo(vx, vy);
        else g.lineTo(vx, vy);
      }
      g.stroke();
      g.restore();
    });

    // Triskèle / spirale sacrée au cœur du sceau
    for (let s = 0; s < 3; s++) {
      const sa = (s / 3) * Math.PI * 2;
      g.save();
      g.translate(cx, cy);
      g.rotate(sa);
      g.strokeStyle = highlightRgba;
      g.lineWidth = 3.8;
      g.beginPath();
      for (let t = 0; t <= 42; t++) {
        const u = t / 42;
        const spiralA = u * Math.PI * 2.15;
        const spiralR = 6 + u * 30;
        const sx = 12 + Math.cos(spiralA) * spiralR;
        const sy = Math.sin(spiralA) * spiralR;
        if (t === 0) g.moveTo(sx, sy);
        else g.lineTo(sx, sy);
      }
      g.stroke();
      g.restore();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    return tex;
  };

  [
    {
      kind: 'baron',
      pit: rf.baronPit,
      primary: 'rgba(168, 85, 247, 0.88)',
      highlight: 'rgba(233, 213, 255, 0.94)',
      shadow: 'rgba(88, 28, 135, 0.55)'
    },
    {
      kind: 'dragon',
      pit: rf.dragonPit,
      primary: 'rgba(245, 158, 11, 0.88)',
      highlight: 'rgba(254, 240, 138, 0.94)',
      shadow: 'rgba(146, 64, 14, 0.55)'
    }
  ].forEach(({ kind, pit, primary, highlight, shadow }) => {
    const pitWater = new THREE.Mesh(new THREE.CircleGeometry(pit.r, 32), waterMat);
    pitWater.rotation.x = -Math.PI / 2;
    pitWater.position.set(pit.x, 0.032, pit.z);
    worldGroup.add(pitWater);

    const pitShimmer = new THREE.Mesh(new THREE.CircleGeometry(pit.r * 0.82, 28), waterShimmerMat);
    pitShimmer.rotation.x = -Math.PI / 2;
    pitShimmer.position.set(pit.x, 0.04, pit.z);
    worldGroup.add(pitShimmer);

    const runeTex = createCelticPitRuneTexture(kind, primary, highlight, shadow);
    const pitRune = new THREE.Mesh(
      new THREE.CircleGeometry(pit.r * 0.78, 48),
      new THREE.MeshBasicMaterial({
        map: runeTex,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        fog: false
      })
    );
    pitRune.rotation.x = -Math.PI / 2;
    pitRune.rotation.z = kind === 'baron' ? Math.PI * 0.25 : -Math.PI * 0.25;
    pitRune.position.set(pit.x, 0.049, pit.z);
    worldGroup.add(pitRune);
  });

  // Pierres de gué visuelles autour du lac central
  [
    [-7.2, 3.2],
    [-3.2, 7.2],
    [7.2, -3.2],
    [3.2, -7.2]
  ].forEach(([sx, sz]) => {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.09, 7), darkStoneMat);
    stone.position.set(sx, 0.03, sz);
    worldGroup.add(stone);
  });

  // 3. Deux bases en coin (Sud-Ouest Or & Nord-Est Violet) avec dallage de pierre & fontaine d'angle
  const baseConfigs = [
    {
      cornerX: -88,
      cornerZ: 88,
      thetaStart: 0,
      goalX: FIELD.allyGoalX,
      goalZ: FIELD.allyGoalZ,
      fountainX: rf.allyFountainX,
      fountainZ: rf.allyFountainZ,
      accentHex: 0xfacc15
    },
    {
      cornerX: 88,
      cornerZ: -88,
      thetaStart: Math.PI,
      goalX: FIELD.enemyGoalX,
      goalZ: FIELD.enemyGoalZ,
      fountainX: rf.enemyFountainX,
      fountainZ: rf.enemyFountainZ,
      accentHex: 0xc084fc
    }
  ];
  baseConfigs.forEach((b) => {
    const terrace = new THREE.Mesh(new THREE.CircleGeometry(rf.baseRadius, 28, b.thetaStart, Math.PI / 2), baseFloorMat);
    terrace.rotation.x = -Math.PI / 2;
    terrace.position.set(b.cornerX, 0.028, b.cornerZ);
    terrace.receiveShadow = true;
    worldGroup.add(terrace);

    const rim = new THREE.Mesh(
      new THREE.RingGeometry(rf.baseRadius - 1.6, rf.baseRadius + 0.4, 28, 1, b.thetaStart, Math.PI / 2),
      stoneMat
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(b.cornerX, 0.042, b.cornerZ);
    worldGroup.add(rim);

    // Lignes radiales & cercles du dallage (inspirés des cartes bleue et orange)
    [20, 34, 46].forEach((rr) => {
      const arc = new THREE.Mesh(
        new THREE.RingGeometry(rr - 0.38, rr + 0.38, 28, 1, b.thetaStart, Math.PI / 2),
        baseTileLineMat
      );
      arc.rotation.x = -Math.PI / 2;
      arc.position.set(b.cornerX, 0.046, b.cornerZ);
      worldGroup.add(arc);
    });
    const dirSign = b.cornerX < 0 ? 1 : -1;
    [
      [b.cornerX + dirSign * 12, b.cornerZ - dirSign * 44],
      [b.cornerX + dirSign * 34, b.cornerZ - dirSign * 34],
      [b.cornerX + dirSign * 44, b.cornerZ - dirSign * 12]
    ].forEach(([tx, tz]) => {
      createLaneConnectorSegment(b.cornerX, b.cornerZ, tx, tz, 0.72, 0x1e293b, 0.52);
    });

    // Parvis Nexus sous le cerceau
    const nexusRing = new THREE.Mesh(
      new THREE.RingGeometry(4.4, 5.2, 32),
      createBasicMat({ color: b.accentHex, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false })
    );
    nexusRing.rotation.x = -Math.PI / 2;
    nexusRing.position.set(b.goalX, 0.052, b.goalZ);
    worldGroup.add(nexusRing);

    // Fontaine / Autel d'angle en retrait du cerceau
    const altarBase = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 0.45, 12), darkStoneMat);
    altarBase.position.set(b.fountainX, 0.225, b.fountainZ);
    addAnimeOutline(altarBase, 1.03, 0x0f172a);
    worldGroup.add(altarBase);

    const altarGlow = new THREE.Mesh(
      new THREE.RingGeometry(2.3, 3.1, 24),
      createBasicMat({ color: b.accentHex, side: THREE.DoubleSide, transparent: true, opacity: 0.65, depthWrite: false })
    );
    altarGlow.rotation.x = -Math.PI / 2;
    altarGlow.position.set(b.fountainX, 0.47, b.fountainZ);
    worldGroup.add(altarGlow);

    const obelisk = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.95, 0),
      createToonMat(b.accentHex, { emissive: b.accentHex, emissiveIntensity: 0.48 })
    );
    obelisk.position.set(b.fountainX, 1.95, b.fountainZ);
    obelisk.scale.set(0.85, 1.55, 0.85);
    addAnimeOutline(obelisk, 1.06, 0x0f172a);
    worldGroup.add(obelisk);
  });

  // 4. Murs de jungle sculptés (falaises rocheuses + chapeau mousseux) & remparts des bases
  rf.wallChains.forEach((chain) => {
    const isBase = chain.kind === 'base';
    const isPit = chain.kind === 'pit';
    const h = chain.height || 3.85;
    const r = chain.radius || 2.1;
    const wallMat = isBase ? bastionStoneMat : cliffRockMat;
    const accentHex = chain.teamSide === 'ally' ? 0xfacc15 : chain.teamSide === 'enemy' ? 0xc084fc : 0x38bdf8;

    for (let i = 0; i < chain.pts.length; i++) {
      const [px, pz] = chain.pts[i];
      const postH = isBase ? h + 0.25 : h;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 1.02, postH, 8), wallMat);
      pillar.position.set(px, postH * 0.5, pz);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      addAnimeOutline(pillar, 1.035, 0x0f172a);
      worldGroup.add(pillar);

      if (isBase) {
        const trimRing = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.24, 8),
          createToonMat(accentHex, { emissive: accentHex, emissiveIntensity: 0.35 })
        );
        trimRing.position.set(px, postH + 0.08, pz);
        worldGroup.add(trimRing);

        // Cristal de porte aux deux extrémités des remparts de base
        if (i === 0 || i === chain.pts.length - 1) {
          const spire = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.65, 0),
            createToonMat(accentHex, { emissive: accentHex, emissiveIntensity: 0.5 })
          );
          spire.position.set(px, postH + 1.05, pz);
          spire.scale.set(0.85, 1.45, 0.85);
          addAnimeOutline(spire, 1.06, 0x0f172a);
          worldGroup.add(spire);
        }
      } else {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r * 0.96, 0.42, 8), mossCapMat);
        cap.position.set(px, postH + 0.14, pz);
        cap.receiveShadow = true;
        addAnimeOutline(cap, 1.03, 0x052e16);
        worldGroup.add(cap);
      }

      if (i < chain.pts.length - 1) {
        const [nx, nz] = chain.pts[i + 1];
        const dx = nx - px;
        const dz = nz - pz;
        const len = Math.hypot(dx, dz);
        if (len > 0.2) {
          const mx = (px + nx) * 0.5;
          const mz = (pz + nz) * 0.5;
          const yaw = Math.atan2(dx, dz);
          const segH = h - 0.12;
          const wallBody = new THREE.Mesh(new THREE.BoxGeometry(r * 1.88, segH, len), wallMat);
          wallBody.position.set(mx, segH * 0.5, mz);
          wallBody.rotation.y = yaw;
          wallBody.castShadow = true;
          wallBody.receiveShadow = true;
          addAnimeOutline(wallBody, 1.025, 0x0f172a);
          worldGroup.add(wallBody);

          if (!isBase) {
            const segCap = new THREE.Mesh(new THREE.BoxGeometry(r * 1.94, 0.38, len + 0.1), mossCapMat);
            segCap.position.set(mx, segH + 0.12, mz);
            segCap.rotation.y = yaw;
            segCap.receiveShadow = true;
            worldGroup.add(segCap);
          } else {
            const segTrim = new THREE.Mesh(
              new THREE.BoxGeometry(r * 1.4, 0.2, len),
              createToonMat(accentHex, { emissive: accentHex, emissiveIntensity: 0.28 })
            );
            segTrim.position.set(mx, segH + 0.08, mz);
            segTrim.rotation.y = yaw;
            worldGroup.add(segTrim);
          }
        }
      }
    }

    // Pins & cristaux décoratifs perchés sur les falaises intérieures
    if (Array.isArray(chain.trees)) {
      chain.trees.forEach(([idx]) => {
        if (chain.pts[idx]) {
          const [tx, tz] = chain.pts[idx];
          createRiftPineTree(tx, h + 0.2, tz, 0.92, mapMeta);
        }
      });
    }
    if (isPit && chain.pts[1]) {
      const pitHex = chain.pts[1][0] < 0 ? 0xa855f7 : 0xf59e0b;
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.68, 0),
        createToonMat(pitHex, { emissive: pitHex, emissiveIntensity: 0.55 })
      );
      crystal.position.set(chain.pts[1][0], h + 1.0, chain.pts[1][1]);
      crystal.scale.set(0.85, 1.5, 0.85);
      addAnimeOutline(crystal, 1.07, 0x0f172a);
      worldGroup.add(crystal);
    }
  });

  // 5. Bordure extérieure de conifères & falaises encadrant la Faille (hors terrain 176x176)
  for (let s = -84; s <= 84; s += 21) {
    createRiftPineTree(s, 0, -96, 1.15, mapMeta);
    createRiftPineTree(s, 0, 96, 1.15, mapMeta);
    createRiftPineTree(-96, 0, s, 1.15, mapMeta);
    createRiftPineTree(96, 0, s, 1.15, mapMeta);
  }
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
    const groundGeo = new THREE.PlaneGeometry(620, 620);
    const groundMat = new THREE.MeshLambertMaterial({ map: createGrassTexture(mapMeta) });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    worldGroup.add(ground);

    const lineMat = createBasicMat({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false });

    const style = mapMeta.decorStyle || 'classic';
    const sx = FIELD.width / DEFAULT_FIELD_CONFIG.width;
    const sz = FIELD.depth / DEFAULT_FIELD_CONFIG.depth;

    // 1. BIOME JUNGLE MOBA SINUEUSE AU MILIEU (absente sur la carte d'Initiation et remplacée sur la Faille)
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

      // Bordures de jungle Nord / Sud dégageant complètement les 2 lanes
      if (style !== 'jarry') {
        const jungleBorderMat = createBasicMat({
          color: mapMeta.jungleBorderHex || 0x34d399,
          transparent: true,
          opacity: 0.55,
          depthWrite: false
        });
        [jungleD * 0.5, -jungleD * 0.5].forEach((zBorder) => {
          const strip = new THREE.Mesh(new THREE.PlaneGeometry(jungleW, 0.42), jungleBorderMat);
          strip.rotation.x = -Math.PI / 2;
          strip.position.set(0, 0.05, zBorder);
          worldGroup.add(strip);
        });
      }
    }

    // Rivière centrale (uniquement sur l'Arène Classique)
    if (style === 'classic') {
      const riverMat = createBasicMat({ color: 0x38bdf8, transparent: true, opacity: 0.32, depthWrite: false });
      const riverStrip = new THREE.Mesh(new THREE.PlaneGeometry(5.6, FIELD.depth - 0.6), riverMat);
      riverStrip.rotation.x = -Math.PI / 2;
      riverStrip.position.set(0, 0.028, 0);
      worldGroup.add(riverStrip);
    }

    // Monuments et repères propres à chaque parc de Montréal (et Faille de l'Invocateur)
    buildMontrealParkLandmarks(mapMeta);

    // Réseau canopée d'arbre en arbre + ponts suspendus étroits + tremplins Sky-Launch One-Way
    createCanopyTreeNetwork();

    // 2. DEUX LANES DÉGAGÉES DEVANT LES BALLONS (cartes classiques/parcs uniquement)
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

        // Anneau central de spawn du ballon sur chaque lane
        const ringMesh = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 36), lineMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.set(0, 0.068, zPos);
        worldGroup.add(ringMesh);

        // Raccordements symétriques des lanes vers chaque camp (Or à gauche, Violet à droite)
        createLaneConnectorSegment(-connX, zPos, FIELD.allyGoalX, FIELD.allyGoalZ || 0, Math.max(8.5, 13.0 * sz), 0xfef08a, 0.18);
        createLaneConnectorSegment(connX, zPos, FIELD.enemyGoalX, FIELD.enemyGoalZ || 0, Math.max(8.5, 13.0 * sz), 0xd8b4fe, 0.18);
      });
    }

    // Parvis lumineux devant les deux cerceaux
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

    // Ligne centrale (axe Z, à X = 0) pour les arènes symétriques horizontales
    if (style !== 'rift') {
      const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(0.34, FIELD.depth), lineMat);
      centerLine.rotation.x = -Math.PI / 2;
      centerLine.position.set(0, 0.062, 0);
      worldGroup.add(centerLine);
    }

    const borderTop = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.width, 0.34), lineMat);
    borderTop.rotation.x = -Math.PI / 2;
    borderTop.position.set(0, 0.064, -FIELD.depth / 2);
    worldGroup.add(borderTop);

    const borderBot = borderTop.clone();
    borderBot.position.set(0, 0.064, FIELD.depth / 2);
    worldGroup.add(borderBot);

    const borderLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.34, FIELD.depth), lineMat);
    borderLeft.rotation.x = -Math.PI / 2;
    borderLeft.position.set(-FIELD.width / 2, 0.066, 0);
    worldGroup.add(borderLeft);

    const borderRight = borderLeft.clone();
    borderRight.position.set(FIELD.width / 2, 0.066, 0);
    worldGroup.add(borderRight);

    // 3. OBSTACLES & HAUTES HERBES DE LA JUNGLE CENTRALE
    JUNGLE_OBSTACLES.forEach(createJungleObstacleMesh);
    JUNGLE_BUSHES.forEach(createJungleBrushMesh);

    // LES DEUX BUTS (CERCEAUX)
    createGoalHoop(
      FIELD.allyGoalX,
      FIELD.allyGoalZ || 0,
      0xfacc15,
      style === 'rift' ? 'CERCEAU CAMP OR (Sud-Ouest)' : 'CERCEAU CAMP OR (Gauche)'
    );
    createGoalHoop(
      FIELD.enemyGoalX,
      FIELD.enemyGoalZ || 0,
      0xc084fc,
      style === 'rift' ? 'CERCEAU CAMP VIOLET (Nord-Est)' : 'CERCEAU CAMP VIOLET (Droite)'
    );

    // Arbres sakura/émeraude symétriques autour du grand stade (hors Faille qui possède déjà sa forêt de conifères)
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

  worldGroup.userData.batchStats = mergeStaticWorldMeshes();
}

function createGoalHoop(x, z, colorHex, labelText) {
  const hoopGroup = new THREE.Group();
  hoopGroup.position.set(x, 0.08, z);

  const torusGeo = new THREE.TorusGeometry(FIELD.goalRadius, 0.17, 16, 48);
  const torusMat = createToonMat(colorHex, {
    emissive: colorHex,
    emissiveIntensity: 0.3
  });
  const torus = new THREE.Mesh(torusGeo, torusMat);
  torus.rotation.x = Math.PI / 2;
  torus.castShadow = true;
  addAnimeOutline(torus, 1.04, 0x0f172a);
  hoopGroup.add(torus);

  const discGeo = new THREE.CircleGeometry(FIELD.goalRadius - 0.1, 32);
  const discMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.22
  });
  const disc = new THREE.Mesh(discGeo, discMat);
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

  const signTex = new THREE.CanvasTexture(canvas);
  const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true });
  const signSprite = new THREE.Sprite(signMat);
  signSprite.position.set(0, 3.6, 0);
  signSprite.scale.set(6.5, 1.25, 1);
  hoopGroup.add(signSprite);

  worldGroup.add(hoopGroup);
}

function createParkTree(x, z, isSakura = false, mapMeta = getActiveMapMeta()) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.65, 3.3, 8),
    createToonMat(0x5c4033)
  );
  trunk.position.y = 1.65;
  trunk.castShadow = true;
  addAnimeOutline(trunk, 1.05, 0x1e1b18);
  tree.add(trunk);

  const foliageColor1 = isSakura
    ? (mapMeta.foliagePrimaryHex || 0xf9a8d4)
    : (mapMeta.foliageShrineHex || 0x22c55e);
  const foliageColor2 = isSakura
    ? (mapMeta.foliageSecondaryHex || 0xf472b6)
    : (mapMeta.foliageShrineSecHex || 0x4ade80);

  const crown1 = new THREE.Mesh(
    new THREE.DodecahedronGeometry(2.45, 1),
    createToonMat(foliageColor1)
  );
  crown1.position.y = 4.25;
  crown1.castShadow = true;
  addAnimeOutline(crown1, 1.045, 0x111827);
  tree.add(crown1);

  const crown2 = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.85, 1),
    createToonMat(foliageColor2)
  );
  crown2.position.set(0.85, 5.45, 0.4);
  crown2.castShadow = true;
  addAnimeOutline(crown2, 1.045, 0x111827);
  tree.add(crown2);

  const crown3 = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.55, 1),
    createToonMat(foliageColor1)
  );
  crown3.position.set(-0.9, 4.9, -0.45);
  crown3.castShadow = true;
  addAnimeOutline(crown3, 1.045, 0x111827);
  tree.add(crown3);

  worldGroup.add(tree);
  registerCameraTreeOccluder(tree, x, 0, 6.8, z, 2.8);
}

