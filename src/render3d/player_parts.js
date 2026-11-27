import { THREE, addAnimeOutline } from './shared.js';
import { getDossardTexture, createChestRoleTexture } from './textures_dossard.js';
import { createAnimeFaceTexture } from './textures_face.js';

// Palettes ultra-saturées JRPG par équipe et rôle (G, C, D)
export const ANIME_CHAR_STYLES = {
  ally: {
    G: {
      hairHex: 0xff2a85,
      hairHighlightHex: 0xff9ebb,
      irisCss: '#00bbf9',
      irisGlowCss: '#90e0ef',
      browCss: '#9d174d',
      photonHex: 0x00f5d4,
      style: 'twintails'
    },
    C: {
      hairHex: 0xffbe0b,
      hairHighlightHex: 0xfff3b0,
      irisCss: '#10b981',
      irisGlowCss: '#6ee7b7',
      browCss: '#92400e',
      photonHex: 0x00f5d4,
      style: 'spiky'
    },
    D: {
      hairHex: 0x00bbf9,
      hairHighlightHex: 0x90e0ef,
      irisCss: '#ff006e',
      irisGlowCss: '#ff758f',
      browCss: '#0369a1',
      photonHex: 0xffbe0b,
      style: 'ponytail'
    }
  },
  enemy: {
    G: {
      hairHex: 0xf1f5f9,
      hairHighlightHex: 0x38bdf8,
      irisCss: '#9d4edd',
      irisGlowCss: '#e0aaff',
      browCss: '#475569',
      photonHex: 0xf72585,
      style: 'twintails'
    },
    C: {
      hairHex: 0x9d4edd,
      hairHighlightHex: 0xe0aaff,
      irisCss: '#00f5d4',
      irisGlowCss: '#99f6e4',
      browCss: '#3b0764',
      photonHex: 0x00f5d4,
      style: 'spiky'
    },
    D: {
      hairHex: 0xff1654,
      hairHighlightHex: 0xff8fa3,
      irisCss: '#ffbe0b',
      irisGlowCss: '#fde047',
      browCss: '#881337',
      photonHex: 0xf72585,
      style: 'ponytail'
    }
  }
};

export function buildAnimeLeg(ctxParts, xOffset) {
  const { skinMat, bootMat, outlineMat } = ctxParts;
  const hipPivot = new THREE.Group();
  hipPivot.position.set(xOffset, 0.88, 0);

  const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.11, 0.42, 14), skinMat);
  thigh.position.set(0, -0.20, 0);
  thigh.castShadow = true;
  addAnimeOutline(thigh, 1.07, 0x0f1020, outlineMat);
  hipPivot.add(thigh);

  const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.098, 0.44, 14), bootMat);
  bootShaft.position.set(0, -0.59, 0);
  bootShaft.castShadow = true;
  addAnimeOutline(bootShaft, 1.07, 0x0f1020, outlineMat);
  hipPivot.add(bootShaft);

  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.13, 0.32), bootMat);
  shoe.position.set(0, -0.81, 0.05);
  shoe.castShadow = true;
  addAnimeOutline(shoe, 1.07, 0x0f1020, outlineMat);
  hipPivot.add(shoe);

  return hipPivot;
}

export function buildAnimeArm(ctxParts, xOffset) {
  const { tunicMat, skinMat, bootMat, outlineMat } = ctxParts;
  const shoulderPivot = new THREE.Group();
  shoulderPivot.position.set(xOffset, 1.79, 0.02);

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.095, 0.16, 12), tunicMat);
  sleeve.position.set(0, -0.07, 0);
  sleeve.castShadow = true;
  addAnimeOutline(sleeve, 1.07, 0x0f1020, outlineMat);
  shoulderPivot.add(sleeve);

  const armSkin = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.44, 12), skinMat);
  armSkin.position.set(0, -0.34, 0);
  armSkin.castShadow = true;
  addAnimeOutline(armSkin, 1.07, 0x0f1020, outlineMat);
  shoulderPivot.add(armSkin);

  const wristBand = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.086, 0.065, 12), bootMat);
  wristBand.position.set(0, -0.55, 0);
  shoulderPivot.add(wristBand);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), bootMat);
  hand.position.set(0, -0.64, 0);
  addAnimeOutline(hand, 1.08, 0x0f1020, outlineMat);
  shoulderPivot.add(hand);

  return shoulderPivot;
}

export function buildTorso(ctxParts, bodyGroup, role, isAlly) {
  const { skirtMat, accentMat, tunicMat, skinMat, outlineMat, regStealthMat, overlayMeshes } = ctxParts;

  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.45, 0.36, 16), skirtMat);
  skirt.position.set(0, 0.94, 0);
  skirt.castShadow = true;
  addAnimeOutline(skirt, 1.055, 0x0f1020, outlineMat);
  bodyGroup.add(skirt);

  const skirtTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.442, 0.462, 0.042, 16), accentMat);
  skirtTrim.position.set(0, 0.775, 0);
  bodyGroup.add(skirtTrim);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.315, 0.075, 16), accentMat);
  belt.position.set(0, 1.09, 0);
  belt.scale.set(1.04, 1, 0.78);
  addAnimeOutline(belt, 1.055, 0x0f1020, outlineMat);
  bodyGroup.add(belt);

  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.295, 0.38, 16), skirtMat);
  waist.position.set(0, 1.24, 0);
  waist.scale.set(1.06, 1, 0.74);
  waist.castShadow = true;
  addAnimeOutline(waist, 1.055, 0x0f1020, outlineMat);
  bodyGroup.add(waist);

  const upperChest = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.255, 0.52, 16), tunicMat);
  upperChest.position.set(0, 1.60, 0);
  upperChest.scale.set(1.08, 1, 0.70);
  upperChest.castShadow = true;
  addAnimeOutline(upperChest, 1.055, 0x0f1020, outlineMat);
  bodyGroup.add(upperChest);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.13, 0.24, 14), skinMat);
  neck.position.set(0, 1.94, 0);
  addAnimeOutline(neck, 1.07, 0x0f1020, outlineMat);
  bodyGroup.add(neck);

  const collarRing = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.036, 8, 22), accentMat);
  collarRing.position.set(0, 1.87, 0);
  collarRing.rotation.x = Math.PI / 2;
  addAnimeOutline(collarRing, 1.06, 0x0f1020, outlineMat);
  bodyGroup.add(collarRing);

  const chestPlaneMat = regStealthMat(
    new THREE.MeshBasicMaterial({ map: createChestRoleTexture(role, isAlly) }),
    true
  );
  const chestPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), chestPlaneMat);
  chestPlane.position.set(0, 1.48, 0.258);
  bodyGroup.add(chestPlane);
  overlayMeshes.push(chestPlane);

  const backDiscMat = regStealthMat(
    new THREE.MeshBasicMaterial({ map: getDossardTexture('blue'), side: THREE.FrontSide }),
    true
  );
  const backDisc = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), backDiscMat);
  backDisc.rotation.y = Math.PI;
  backDisc.position.set(0, 1.48, -0.305);
  bodyGroup.add(backDisc);
  overlayMeshes.push(backDisc);

  return { backDisc, backDiscMat };
}

function buildHeadBase(ctxParts, headGroup, charStyle) {
  const { skinMat, hairMat, hairHighlightMat, outlineMat, regStealthMat, overlayMeshes } = ctxParts;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.40, 24, 24), skinMat);
  head.scale.set(0.96, 1.02, 0.95);
  head.castShadow = true;
  addAnimeOutline(head, 1.055, 0x0f1020, outlineMat);
  headGroup.add(head);

  [-0.375, 0.375].forEach((ex) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), skinMat);
    ear.position.set(ex, -0.02, -0.02);
    ear.scale.set(0.55, 1.15, 0.8);
    addAnimeOutline(ear, 1.08, 0x0f1020, outlineMat);
    headGroup.add(ear);
  });

  const facePatchGeo = new THREE.CylinderGeometry(
    0.404, 0.404, 0.48, 24, 1, true, -Math.PI * 0.32, Math.PI * 0.64
  );
  const facePatchMat = regStealthMat(
    new THREE.MeshBasicMaterial({
      map: createAnimeFaceTexture(charStyle.irisCss, charStyle.browCss, charStyle.irisGlowCss),
      transparent: false
    }),
    true
  );
  const facePatch = new THREE.Mesh(facePatchGeo, facePatchMat);
  facePatch.scale.set(0.96, 1.02, 0.95);
  facePatch.position.set(0, -0.015, 0);
  headGroup.add(facePatch);
  overlayMeshes.push(facePatch);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.432, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairMat
  );
  hairCap.position.set(0, 0.035, -0.02);
  hairCap.rotation.x = -0.18;
  addAnimeOutline(hairCap, 1.05, 0x0f1020, outlineMat);
  headGroup.add(hairCap);

  const angelRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.024, 8, 28), hairHighlightMat);
  angelRing.rotation.x = Math.PI / 2;
  angelRing.position.set(0, 0.27, 0);
  hairCap.add(angelRing);
}

function buildHairBangsAndLocks(ctxParts, headGroup) {
  const { hairMat, outlineMat } = ctxParts;
  const frontBangSpecs = [
    [-0.24, 0.20, 0.31, 0.42, -0.11],
    [-0.12, 0.22, 0.36, 0.20, -0.04],
    [0.01, 0.21, 0.375, 0.04, 0.09],
    [0.13, 0.22, 0.355, -0.18, 0.05],
    [0.24, 0.20, 0.305, -0.40, -0.10]
  ];
  frontBangSpecs.forEach(([bx, by, bz, rz, rotXAdj]) => {
    const bang = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.34, 6), hairMat);
    bang.position.set(bx, by, bz);
    bang.rotation.x = Math.PI - 0.36 + rotXAdj;
    bang.rotation.z = rz;
    addAnimeOutline(bang, 1.07, 0x0f1020, outlineMat);
    headGroup.add(bang);
  });

  [-1, 1].forEach((dir) => {
    const outerLock = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.48, 6), hairMat);
    outerLock.position.set(dir * 0.36, -0.06, 0.19);
    outerLock.rotation.x = Math.PI - 0.12;
    outerLock.rotation.z = -dir * 0.14;
    addAnimeOutline(outerLock, 1.07, 0x0f1020, outlineMat);
    headGroup.add(outerLock);

    const innerLock = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.36, 6), hairMat);
    innerLock.position.set(dir * 0.29, -0.02, 0.28);
    innerLock.rotation.x = Math.PI - 0.22;
    innerLock.rotation.z = -dir * 0.06;
    addAnimeOutline(innerLock, 1.07, 0x0f1020, outlineMat);
    headGroup.add(innerLock);
  });
}

function buildRoleHairstyle(ctxParts, headGroup, style) {
  const { accentMat, hairMat, outlineMat, hairBouncers } = ctxParts;
  if (style === 'twintails') {
    [-1, 1].forEach((dir) => {
      const tailPivot = new THREE.Group();
      tailPivot.position.set(dir * 0.41, 0.19, -0.04);
      const mechTie = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.065, 10), accentMat);
      mechTie.rotation.z = Math.PI / 2;
      addAnimeOutline(mechTie, 1.08, 0x0f1020, outlineMat);
      tailPivot.add(mechTie);

      const tailUpper = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, 8), hairMat);
      tailUpper.position.set(dir * 0.19, -0.15, -0.03);
      tailUpper.rotation.z = -dir * 2.25;
      addAnimeOutline(tailUpper, 1.06, 0x0f1020, outlineMat);
      tailPivot.add(tailUpper);

      const tailLower = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.66, 8), hairMat);
      tailLower.position.set(dir * 0.37, -0.47, -0.04);
      tailLower.rotation.z = -dir * 2.65;
      addAnimeOutline(tailLower, 1.06, 0x0f1020, outlineMat);
      tailPivot.add(tailLower);

      headGroup.add(tailPivot);
      hairBouncers.push({ pivot: tailPivot, baseRotZ: 0, dir });
    });
    return;
  }

  if (style === 'spiky') {
    const spikeSpecs = [
      [0, 0.50, 0.06, 0.24, 0, 0.11, 0.44],
      [-0.22, 0.44, -0.02, -0.15, 0.42, 0.125, 0.40],
      [0.22, 0.44, -0.02, -0.15, -0.42, 0.125, 0.40],
      [-0.36, 0.28, -0.06, -0.22, 0.85, 0.115, 0.38],
      [0.36, 0.28, -0.06, -0.22, -0.85, 0.115, 0.38],
      [-0.28, 0.34, -0.22, -0.68, 0.55, 0.12, 0.36],
      [0.28, 0.34, -0.22, -0.68, -0.55, 0.12, 0.36],
      [0, 0.42, -0.24, -0.78, 0, 0.13, 0.38],
      [0.14, 0.46, 0.18, 0.42, -0.28, 0.09, 0.30]
    ];
    spikeSpecs.forEach(([sx, sy, sz, rx, rz, r, h], idx) => {
      const spikePivot = new THREE.Group();
      spikePivot.position.set(sx, sy, sz);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), hairMat);
      spike.rotation.set(rx, 0, rz);
      addAnimeOutline(spike, 1.07, 0x0f1020, outlineMat);
      spikePivot.add(spike);
      headGroup.add(spikePivot);
      if (idx === 0 || idx === 7) {
        hairBouncers.push({ pivot: spikePivot, baseRotZ: 0, dir: idx === 0 ? 1 : -1 });
      }
    });
    return;
  }

  const ponyPivot = new THREE.Group();
  ponyPivot.position.set(0.20, 0.36, -0.14);
  const mechTie = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 10), accentMat);
  addAnimeOutline(mechTie, 1.08, 0x0f1020, outlineMat);
  ponyPivot.add(mechTie);

  const ponyMain = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.68, 8), hairMat);
  ponyMain.position.set(0.28, 0.11, -0.08);
  ponyMain.rotation.z = -1.25;
  ponyMain.rotation.x = -0.25;
  addAnimeOutline(ponyMain, 1.06, 0x0f1020, outlineMat);
  ponyPivot.add(ponyMain);

  const ponyTip = new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.56, 7), hairMat);
  ponyTip.position.set(0.56, -0.02, -0.15);
  ponyTip.rotation.z = -2.45;
  ponyTip.rotation.x = -0.16;
  addAnimeOutline(ponyTip, 1.06, 0x0f1020, outlineMat);
  ponyPivot.add(ponyTip);

  headGroup.add(ponyPivot);
  hairBouncers.push({ pivot: ponyPivot, baseRotZ: 0, dir: 1 });
}

export function buildHeadAndHair(ctxParts, bodyGroup, charStyle) {
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 2.26, 0);
  bodyGroup.add(headGroup);

  buildHeadBase(ctxParts, headGroup, charStyle);
  buildHairBangsAndLocks(ctxParts, headGroup);
  buildRoleHairstyle(ctxParts, headGroup, charStyle.style);

  return headGroup;
}
