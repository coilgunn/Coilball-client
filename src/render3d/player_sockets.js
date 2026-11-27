import { THREE, createToonMat } from './shared.js';

function makeMultiPartSocket(parts) {
  for (let i = 0; i < parts.length; i++) parts[i].visible = false;
  return {
    _visible: false,
    parts,
    get visible() {
      return this._visible;
    },
    set visible(v) {
      const next = !!v;
      if (this._visible === next) return;
      this._visible = next;
      for (let i = 0; i < this.parts.length; i++) {
        this.parts[i].visible = next;
      }
    }
  };
}

function buildDashBounceSocket(leftLeg, rightLeg, regStealthMat) {
  const bounceSpringMat = regStealthMat(
    createToonMat(0xf97316, { emissive: 0xea580c, emissiveIntensity: 0.25 })
  );
  const bounceGlowMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xfdba74 }));
  const parts = [leftLeg, rightLeg].map((leg) => {
    const g = new THREE.Group();
    [-0.63, -0.71, -0.79].forEach((cy) => {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.025, 6, 14), bounceSpringMat);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(0, cy, 0.01);
      g.add(coil);
    });
    const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.075, 10), bounceSpringMat);
    sole.position.set(0, -0.885, 0.055);
    g.add(sole);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.09), bounceGlowMat);
    bumper.position.set(0, -0.83, 0.21);
    g.add(bumper);
    leg.add(g);
    return g;
  });
  return makeMultiPartSocket(parts);
}

function buildDashSlideSocket(leftLeg, rightLeg, regStealthMat) {
  const slideIceMat = regStealthMat(
    createToonMat(0x38bdf8, { emissive: 0x0284c7, emissiveIntensity: 0.3 })
  );
  const slideEdgeMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xe0f2fe }));
  const parts = [leftLeg, rightLeg].map((leg, idx) => {
    const dir = idx === 0 ? -1 : 1;
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.095, 0.46), slideEdgeMat);
    blade.position.set(0, -0.895, 0.09);
    g.add(blade);
    const prow = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 4), slideIceMat);
    prow.rotation.x = Math.PI / 2 - 0.32;
    prow.position.set(0, -0.855, 0.31);
    g.add(prow);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0), slideIceMat);
    crystal.scale.set(0.85, 1.15, 1.15);
    crystal.position.set(dir * 0.11, -0.73, 0.11);
    g.add(crystal);
    leg.add(g);
    return g;
  });
  return makeMultiPartSocket(parts);
}

function buildDashBoomerangSocket(leftLeg, rightLeg, bodyGroup, regStealthMat) {
  const boomTealMat = regStealthMat(
    createToonMat(0x14b8a6, { emissive: 0x0d9488, emissiveIntensity: 0.22 })
  );
  const boomGoldMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
  const parts = [leftLeg, rightLeg].map((leg, idx) => {
    const dir = idx === 0 ? -1 : 1;
    const g = new THREE.Group();
    const finA = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.28, 4), boomTealMat);
    finA.scale.set(0.36, 1.0, 1.0);
    finA.position.set(dir * 0.16, -0.66, 0.02);
    finA.rotation.set(-0.45, 0, -dir * 0.55);
    g.add(finA);
    const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.12), boomGoldMat);
    finTip.position.set(dir * 0.20, -0.60, 0.08);
    g.add(finTip);
    leg.add(g);
    return g;
  });

  const hipBoomGroup = new THREE.Group();
  hipBoomGroup.position.set(0.43, 1.06, 0.14);
  hipBoomGroup.rotation.set(0.18, -0.25, -0.35);
  const boomArm1 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.24, 0.085), boomTealMat);
  boomArm1.position.set(0.02, 0.08, 0.04);
  boomArm1.rotation.x = 0.55;
  hipBoomGroup.add(boomArm1);
  const boomArm2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.24, 0.085), boomTealMat);
  boomArm2.position.set(0.02, -0.07, 0.06);
  boomArm2.rotation.x = -0.65;
  hipBoomGroup.add(boomArm2);
  const boomTip = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.07, 0.092), boomGoldMat);
  boomTip.position.set(0.02, 0.17, 0.09);
  hipBoomGroup.add(boomTip);
  bodyGroup.add(hipBoomGroup);
  parts.push(hipBoomGroup);

  return makeMultiPartSocket(parts);
}

function buildToolBeacon(bodyGroup, teamTrimColor, regStealthMat) {
  const mastMat = regStealthMat(createToonMat(0x64748b));
  const orbMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  const ringMat = regStealthMat(
    new THREE.MeshBasicMaterial({ color: teamTrimColor, side: THREE.DoubleSide })
  );
  const group = new THREE.Group();
  group.position.set(0.42, 1.84, 0.05);
  group.visible = false;

  const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.10, 10), mastMat);
  group.add(clamp);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 0.54, 8), mastMat);
  mast.position.y = 0.30;
  group.add(mast);
  const beaconOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.135, 0), orbMat);
  beaconOrb.position.y = 0.62;
  group.add(beaconOrb);
  const radarRing = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 6, 16), ringMat);
  radarRing.position.y = 0.62;
  radarRing.rotation.x = Math.PI / 2 - 0.35;
  group.add(radarRing);
  bodyGroup.add(group);
  return { group, beaconOrb };
}

function buildToolWall(bodyGroup, teamTrimColor, regStealthMat) {
  const armorMat = regStealthMat(createToonMat(0x475569));
  const trimMat = regStealthMat(new THREE.MeshBasicMaterial({ color: teamTrimColor }));
  const group = new THREE.Group();
  group.position.set(0.48, 1.74, 0.09);
  group.rotation.set(0.08, -0.22, -0.14);
  group.visible = false;

  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.44, 0.38), armorMat));
  const topTrim = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.08, 0.40), trimMat);
  topTrim.position.y = 0.14;
  group.add(topTrim);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.06, 0.32), armorMat);
  ridge.position.y = -0.06;
  group.add(ridge);
  bodyGroup.add(group);
  return group;
}

function buildToolPad(bodyGroup, regStealthMat) {
  const baseMat = regStealthMat(createToonMat(0x0f172a));
  const glowMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0x06b6d4 }));
  const chevronMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  const group = new THREE.Group();
  group.position.set(0.45, 1.80, 0.06);
  group.rotation.set(0.12, -0.18, -0.28);
  group.visible = false;

  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.40, 0.26), baseMat));
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.30, 0.12), glowMat);
  core.position.z = 0.06;
  group.add(core);
  [-0.08, 0.08].forEach((cy) => {
    const chevL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.05), chevronMat);
    chevL.position.set(0.08, cy, 0.12);
    chevL.rotation.z = 0.48;
    group.add(chevL);
    const chevR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.05), chevronMat);
    chevR.position.set(0.08, cy + 0.07, 0.12);
    chevR.rotation.z = -0.48;
    group.add(chevR);
  });
  bodyGroup.add(group);
  return group;
}

function buildUltEvoSocket(headGroup, regStealthMat) {
  const ultEvoMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xfde047 }));
  const ultEvoCoreMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const ultEvoGroup = new THREE.Group();
  ultEvoGroup.position.set(0, 0.49, 0.09);
  ultEvoGroup.visible = false;

  const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.026, 6, 20), ultEvoMat);
  crownRing.rotation.x = Math.PI / 2 - 0.14;
  ultEvoGroup.add(crownRing);
  [
    [0, 0.11, 0.26, 0.18, 0, 0.058, 0.24],
    [-0.18, 0.07, 0.20, 0.14, 0.36, 0.045, 0.18],
    [0.18, 0.07, 0.20, 0.14, -0.36, 0.045, 0.18]
  ].forEach(([sx, sy, sz, rx, rz, r, h]) => {
    const spk = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), ultEvoMat);
    spk.position.set(sx, sy, sz);
    spk.rotation.set(rx, 0, rz);
    ultEvoGroup.add(spk);
  });
  const ultEvoStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.115, 0), ultEvoCoreMat);
  ultEvoStar.position.set(0, 0.24, 0.05);
  ultEvoGroup.add(ultEvoStar);
  headGroup.add(ultEvoGroup);
  return { ultEvoGroup, ultEvoMat, ultEvoCoreMat, ultEvoStar };
}

function buildStandUpSocket(bodyGroup, regStealthMat) {
  const rimMat = regStealthMat(createToonMat(0x0f172a));
  const boltMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
  const group = new THREE.Group();
  group.position.set(0, 1.10, 0.29);
  group.visible = false;

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.04, 6), rimMat);
  plate.rotation.x = Math.PI / 2;
  group.add(plate);
  const boltTop = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.14, 4), boltMat);
  boltTop.position.set(0.015, 0.045, 0.032);
  boltTop.rotation.z = -0.35;
  group.add(boltTop);
  const boltBot = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.14, 4), boltMat);
  boltBot.position.set(-0.015, -0.045, 0.032);
  boltBot.rotation.z = Math.PI - 0.35;
  group.add(boltBot);
  bodyGroup.add(group);
  return group;
}

function buildTeamBonusSockets(leftLeg, rightLeg, regStealthMat) {
  const dashPlusMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  const teamDashPlusParts = [leftLeg, rightLeg].map((leg) => {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.124, 0.122, 0.042, 12), dashPlusMat);
    band.position.set(0, -0.52, 0);
    g.add(band);
    leg.add(g);
    return g;
  });

  const jumpMat = regStealthMat(new THREE.MeshBasicMaterial({ color: 0xecfeff }));
  const teamJumpParts = [leftLeg, rightLeg].map((leg, idx) => {
    const dir = idx === 0 ? -1 : 1;
    const g = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.12, 0.19), jumpMat);
    wing.position.set(dir * 0.135, -0.44, -0.03);
    wing.rotation.set(0.32, dir * 0.22, -dir * 0.25);
    g.add(wing);
    leg.add(g);
    return g;
  });

  return {
    teamDashPlus: makeMultiPartSocket(teamDashPlusParts),
    teamJump: makeMultiPartSocket(teamJumpParts)
  };
}

export function buildPlayerPowerSockets(ctxSockets) {
  const { bodyGroup, headGroup, leftLeg, rightLeg, teamTrimColor, regStealthMat } = ctxSockets;

  const beacon = buildToolBeacon(bodyGroup, teamTrimColor, regStealthMat);
  const ult = buildUltEvoSocket(headGroup, regStealthMat);
  const teamBonuses = buildTeamBonusSockets(leftLeg, rightLeg, regStealthMat);

  return {
    powerSockets: {
      dash: {
        bounce: buildDashBounceSocket(leftLeg, rightLeg, regStealthMat),
        slide: buildDashSlideSocket(leftLeg, rightLeg, regStealthMat),
        boomerang: buildDashBoomerangSocket(leftLeg, rightLeg, bodyGroup, regStealthMat)
      },
      tool: {
        beacon: beacon.group,
        wall: buildToolWall(bodyGroup, teamTrimColor, regStealthMat),
        pad: buildToolPad(bodyGroup, regStealthMat)
      },
      ultEvo: ult.ultEvoGroup,
      standUp: buildStandUpSocket(bodyGroup, regStealthMat),
      teamDashPlus: teamBonuses.teamDashPlus,
      teamJump: teamBonuses.teamJump
    },
    ultEvoMat: ult.ultEvoMat,
    ultEvoCoreMat: ult.ultEvoCoreMat,
    ultEvoStar: ult.ultEvoStar,
    beaconOrb: beacon.beaconOrb
  };
}
