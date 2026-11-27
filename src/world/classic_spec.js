const CLASSIC_CFG = {
  deckY: 5.6,
  bridgeHalf: 1.7,
  sagDepth: 0.34,
  ascentInnerX: 45.0,
  ascentOuterX: 58.0,
  ascentAttachMinX: 55.6,
  ascentHalfZ: 1.7,
  rampSkirtInnerX: 51.5,
  rampSkirtOuterX: 56.0,
  launchInnerZ: 16.4,
  launchCommitZ: 17.4,
  launchOuterZ: 36.5,
  launchHalfX: 1.7,
  launchLipY: 2.8,
  launchPierInnerZ: 31.8,
  launchPierOuterZ: 36.6,
  launchLandingZ: 50.0
};

function appendClassicQuadrantDecks(decks, sx, sz, q) {
  const bh = CLASSIC_CFG.bridgeHalf;
  const inDirX = sx < 0 ? 'e' : 'w';
  const outDirX = sx < 0 ? 'w' : 'e';
  const inDirZ = sz < 0 ? 's' : 'n';
  const outDirZ = sz < 0 ? 'n' : 's';

  decks.push(
    {
      id: `${q}Outer`,
      x0: sx < 0 ? -45.0 : 38.6,
      x1: sx < 0 ? -38.6 : 45.0,
      z0: sz < 0 ? -29.7 : 23.3,
      z1: sz < 0 ? -23.3 : 29.7,
      kind: 'outer',
      doors: { [inDirX]: bh, [inDirZ]: bh }
    },
    {
      id: `${q}Bend`,
      x0: sx < 0 ? -21.2 : 14.8,
      x1: sx < 0 ? -14.8 : 21.2,
      z0: sz < 0 ? -29.7 : 23.3,
      z1: sz < 0 ? -23.3 : 29.7,
      kind: 'bend',
      doors: { [outDirX]: bh, [inDirZ]: bh }
    },
    {
      id: `${q}Inner`,
      x0: sx < 0 ? -21.2 : 14.8,
      x1: sx < 0 ? -14.8 : 21.2,
      z0: sz < 0 ? -16.2 : 9.8,
      z1: sz < 0 ? -9.8 : 16.2,
      kind: 'inner',
      doors: { [outDirZ]: bh, [inDirX]: bh }
    }
  );
}

function appendClassicQuadrantBridges(bridges, sx, sz, q) {
  const bh = CLASSIC_CFG.bridgeHalf;
  const gateId = sx < 0 ? 'westGate' : 'eastGate';
  const hubId = sz < 0 ? 'northHub' : 'southHub';
  const outerId = `${q}Outer`;
  const bendId = `${q}Bend`;
  const innerId = `${q}Inner`;
  const forkId = `${sx < 0 ? 'west' : 'east'}Fork${sz < 0 ? 'N' : 'S'}`;

  bridges.push(
    {
      id: forkId,
      from: gateId,
      to: outerId,
      axis: 'z',
      x0: sx * 41.8 - bh,
      x1: sx * 41.8 + bh,
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
      z0: sz * 26.5 - bh,
      z1: sz * 26.5 + bh,
      sag: 0.42
    },
    {
      id: `${q}StepBridge`,
      from: bendId,
      to: innerId,
      axis: 'z',
      x0: sx * 18.0 - bh,
      x1: sx * 18.0 + bh,
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
      z0: sz * 13.0 - bh,
      z1: sz * 13.0 + bh,
      sag: 0.34
    }
  );
}

function appendClassicQuadrant(decks, bridges, trunks, sx, sz) {
  const q = `${sz < 0 ? 'n' : 's'}${sx < 0 ? 'w' : 'e'}`;
  appendClassicQuadrantDecks(decks, sx, sz, q);
  appendClassicQuadrantBridges(bridges, sx, sz, q);
  trunks.push(
    { x: sx * 4.3, z: sz * 17.2, radius: 0.78, kind: 'hub' },
    { x: sx * 22.0, z: sz * 9.0, radius: 0.85, kind: 'inner' },
    { x: sx * 14.0, z: sz * 30.5, radius: 0.88, kind: 'bend' },
    { x: sx * 45.8, z: sz * 30.5, radius: 0.88, kind: 'outer' },
    { x: sx * 2.45, z: sz * 36.0, radius: 0.56, kind: 'bough' }
  );
}

function buildClassicDecksAndBridges() {
  const { bridgeHalf, ascentHalfZ, launchHalfX } = CLASSIC_CFG;
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
    trunks.push({ x: sx * 37.8, z: 0, radius: 0.85, kind: 'gate' });
    [-1, 1].forEach((sz) => {
      appendClassicQuadrant(decks, bridges, trunks, sx, sz);
    });
  });

  decks.forEach((d) => {
    d.cx = (d.x0 + d.x1) / 2;
    d.cz = (d.z0 + d.z1) / 2;
  });
  return { decks, bridges, trunks };
}

function buildClassicWalkBoxes(decks, bridges) {
  const { ascentOuterX, ascentHalfZ, launchOuterZ, launchHalfX } = CLASSIC_CFG;
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
  return walkBoxes;
}

function buildClassicObstaclesAndBushes() {
  const obstacles = [];
  const bushes = [];
  [-1, 1].forEach((sx) => {
    const side = sx < 0 ? 'ally' : 'enemy';
    [-1, 1].forEach((sz) => {
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
      bushes.push(
        { x: sx * 54.0, z: sz * 15.5, radius: 2.4 },
        { x: sx * 37.5, z: sz * 23.5, radius: 2.4 },
        { x: sx * 29.5, z: sz * 11.5, radius: 2.3 },
        { x: sx * 16.2, z: sz * 16.8, radius: 2.4 },
        { x: sx * 5.5, z: sz * 28.5, radius: 2.3 }
      );
    });
  });
  return { obstacles, bushes };
}

export function buildClassicArenaSpec() {
  const { decks, bridges, trunks } = buildClassicDecksAndBridges();
  const walkBoxes = buildClassicWalkBoxes(decks, bridges);
  const { obstacles, bushes } = buildClassicObstaclesAndBushes();

  return {
    spec: {
      hasCanopy: true,
      ...CLASSIC_CFG,
      centerHalfX: 4.4,
      centerHalfZ: 4.4,
      bridgeHalfZ: CLASSIC_CFG.bridgeHalf,
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

export function buildEmptyCanopySpec() {
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
