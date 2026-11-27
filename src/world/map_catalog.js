import { state } from '../state.js';

function buildRiftWallChains() {
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
    wallChains: buildRiftWallChains()
  }
};

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

export function getActiveMapMeta() {
  return MONTREAL_MAPS[state && state.mapId ? state.mapId : 'classic'] || MONTREAL_MAPS.classic;
}
