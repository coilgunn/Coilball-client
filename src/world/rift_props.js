import { createToonMat, createBasicMat, addAnimeOutline } from '../render3d.js';
import { getActiveMapMeta } from './map_catalog.js';
import { registerCameraTreeOccluder } from './mesh_utils.js';
import { THREE, worldState, animatedWaterTextures } from './shared.js';

export function createRiftPineTree(x, yBase, z, scale = 1.0, mapMeta = getActiveMapMeta()) {
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

  [
    { r: 2.05 * scale, h: 2.6 * scale, y: trunkH + 0.85 * scale, mat: pineDarkMat },
    { r: 1.55 * scale, h: 2.3 * scale, y: trunkH + 2.25 * scale, mat: pineMidMat },
    { r: 1.05 * scale, h: 1.9 * scale, y: trunkH + 3.5 * scale, mat: pineLightMat }
  ].forEach((t) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 7), t.mat);
    cone.position.y = t.y;
    cone.castShadow = true;
    addAnimeOutline(cone, 1.045, 0x052e16);
    tree.add(cone);
  });

  worldState.worldGroup.add(tree);
  registerCameraTreeOccluder(tree, x, yBase, yBase + trunkH + 4.5 * scale, z, 2.2 * scale);
}

export function createFlowTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.lineCap = 'round';
  g.lineJoin = 'round';
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
}

function buildWaterfallRockCore(waterfallGroup, cliffRockMat, mossCapMat) {
  const specs = [
    { rTop: 1.88, rBot: 2.22, h: 6.6, y: 3.3, mat: cliffRockMat, outline: 0x0f172a, shadow: true },
    { rTop: 1.56, rBot: 1.9, h: 8.2, y: 10.5, mat: cliffRockMat, outline: 0x0f172a, shadow: true },
    { rTop: 2.22, rBot: 1.72, h: 1.0, y: 13.85, mat: mossCapMat, outline: 0x052e16, shadow: true },
    { rTop: 1.26, rBot: 1.62, h: 9.8, y: 19.3, mat: cliffRockMat, outline: 0x0f172a, shadow: true },
    { rTop: 2.45, rBot: 1.48, h: 1.15, y: 24.45, mat: mossCapMat, outline: 0x052e16, shadow: true }
  ];
  specs.forEach((s) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(s.rTop, s.rBot, s.h, 8), s.mat);
    m.position.y = s.y;
    m.castShadow = s.shadow;
    m.receiveShadow = true;
    addAnimeOutline(m, 1.04, s.outline);
    waterfallGroup.add(m);
  });

  const wfMidPool = new THREE.Mesh(
    new THREE.CylinderGeometry(1.96, 1.96, 0.2, 16),
    createToonMat(0x38bdf8, { emissive: 0x0ea5e9, emissiveIntensity: 0.48 })
  );
  wfMidPool.position.y = 14.38;
  waterfallGroup.add(wfMidPool);

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
}

function buildWaterfallStreamsAndSplash(waterfallGroup) {
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

  const wfMat = new THREE.MeshBasicMaterial({ map: wfTex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const wfSubMat = new THREE.MeshBasicMaterial({ map: wfSubTex, transparent: true, opacity: 0.84, side: THREE.DoubleSide, depthWrite: false });
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
}

export function buildRiftWaterfall(cliffRockMat, mossCapMat) {
  const waterfallGroup = new THREE.Group();
  buildWaterfallRockCore(waterfallGroup, cliffRockMat, mossCapMat);
  buildWaterfallStreamsAndSplash(waterfallGroup);
  worldState.worldGroup.add(waterfallGroup);
  registerCameraTreeOccluder(waterfallGroup, 0, 2.0, 26.0, 0, 3.6);
}

function drawCelticBraidAndRings(g, cx, cy, primaryRgba, highlightRgba) {
  const drawBraidStrand = (phase, strokeColor, lineWidth) => {
    g.strokeStyle = strokeColor;
    g.lineWidth = lineWidth;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      const r = 204 + Math.sin(a * 16 + phase) * 14;
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

  [226, 178, 134].forEach((r, idx) => {
    g.strokeStyle = idx === 1 ? primaryRgba : highlightRgba;
    g.lineWidth = idx === 1 ? 2.6 : 1.8;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  });
}

function drawCelticRuneGlyphs(g, cx, cy, highlightRgba) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.cos(ang) * 156, cy + Math.sin(ang) * 156);
    g.rotate(ang + Math.PI * 0.5);
    g.strokeStyle = highlightRgba;
    g.lineWidth = 2.8;
    g.beginPath();
    g.moveTo(0, -13);
    g.lineTo(0, 13);
    const pattern = k % 4;
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
}

function drawCelticCentralKnot(g, cx, cy, kind, primaryRgba, highlightRgba) {
  const lobes = kind === 'baron' ? 4 : 3;
  const knotCount = lobes * 2;
  for (let i = 0; i < knotCount; i++) {
    g.save();
    g.translate(cx, cy);
    g.rotate((i / knotCount) * Math.PI * 2);
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

  [0, Math.PI / lobes].forEach((rot, idx) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.strokeStyle = idx === 0 ? highlightRgba : primaryRgba;
    g.lineWidth = 3.2;
    g.beginPath();
    for (let v = 0; v <= lobes; v++) {
      const va = (v / lobes) * Math.PI * 2;
      const vx = Math.cos(va) * 124;
      const vy = Math.sin(va) * 124;
      if (v === 0) g.moveTo(vx, vy);
      else g.lineTo(vx, vy);
    }
    g.stroke();
    g.restore();
  });

  for (let s = 0; s < 3; s++) {
    g.save();
    g.translate(cx, cy);
    g.rotate((s / 3) * Math.PI * 2);
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
}

export function createCelticPitRuneTexture(kind, primaryRgba, highlightRgba, shadowRgba) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const cx = size * 0.5;
  const cy = size * 0.5;
  g.clearRect(0, 0, size, size);

  const radGrad = g.createRadialGradient(cx, cy, 14, cx, cy, 240);
  radGrad.addColorStop(0, shadowRgba);
  radGrad.addColorStop(0.55, primaryRgba.replace(/[\d.]+\)$/, '0.24)'));
  radGrad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = radGrad;
  g.beginPath();
  g.arc(cx, cy, 244, 0, Math.PI * 2);
  g.fill();

  drawCelticBraidAndRings(g, cx, cy, primaryRgba, highlightRgba);
  drawCelticRuneGlyphs(g, cx, cy, highlightRgba);
  drawCelticCentralKnot(g, cx, cy, kind, primaryRgba, highlightRgba);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return tex;
}
