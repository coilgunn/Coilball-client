import { state } from '../state.js';
import { players, scene } from '../render3d.js';
import { fillPlayerVisionPolygonFlat, getTerrainY } from '../world.js';
import {
  THREE,
  AERIAL_CONE_PROFILE_HIGH,
  AERIAL_CONE_PROFILE_LOW,
  aerialConePool,
  aerialConeXY,
  uiState
} from './shared.js';

function createConeFillMesh(idx, team, rays, rings) {
  const vertCount = 1 + rays * rings;
  const fillPos = new Float32Array(vertCount * 3);
  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));

  const indices = [];
  for (let k = 0; k < rays; k++) {
    const kn = (k + 1) % rays;
    indices.push(0, 1 + kn, 1 + k);
    for (let r = 0; r < rings - 1; r++) {
      const a = 1 + r * rays + k;
      const b = 1 + r * rays + kn;
      const c = 1 + (r + 1) * rays + kn;
      const d = 1 + (r + 1) * rays + k;
      indices.push(a, b, c, a, c, d);
    }
  }
  fillGeo.setIndex(indices);

  const fillMat = new THREE.MeshBasicMaterial({
    color: team === 'ally' ? 0xfef08a : 0xe9d5ff,
    transparent: true,
    opacity: team === 'ally' ? 0.22 : 0.20,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  fillMesh.frustumCulled = false;
  fillMesh.renderOrder = 4 + idx * 2;
  return { fillMesh, fillGeo, fillPos, fillMat };
}

function createConeLineMesh(idx, team, rays, lineSubdiv) {
  const linePos = new Float32Array(rays * lineSubdiv * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: team === 'ally' ? 0xfacc15 : 0xc084fc,
    transparent: true,
    opacity: team === 'ally' ? 0.78 : 0.74,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5
  });
  const lineMesh = new THREE.LineLoop(lineGeo, lineMat);
  lineMesh.frustumCulled = false;
  lineMesh.renderOrder = 5 + idx * 2;
  return { lineMesh, lineGeo, linePos, lineMat };
}

function ensureAerialConeEntry(idx, team, profile = AERIAL_CONE_PROFILE_HIGH) {
  if (!uiState.aerialVisionGroup) {
    uiState.aerialVisionGroup = new THREE.Group();
    scene.add(uiState.aerialVisionGroup);
  }
  const rays = profile.steps + profile.backSteps;
  const rings = profile.rings;
  const lineSubdiv = profile.lineSubdiv;
  const profileKey = `${rays}x${rings}x${lineSubdiv}`;

  if (aerialConePool[idx]) {
    const existing = aerialConePool[idx];
    if (existing.profileKey === profileKey) {
      if (existing.team !== team) {
        existing.team = team;
        existing.fillMat.color.setHex(team === 'ally' ? 0xfef08a : 0xe9d5ff);
        existing.lineMat.color.setHex(team === 'ally' ? 0xfacc15 : 0xc084fc);
      }
      return existing;
    }
    if (uiState.aerialVisionGroup && existing.root) {
      uiState.aerialVisionGroup.remove(existing.root);
    }
    existing.fillGeo?.dispose?.();
    existing.lineGeo?.dispose?.();
    existing.fillMat?.dispose?.();
    existing.lineMat?.dispose?.();
  }

  const fill = createConeFillMesh(idx, team, rays, rings);
  const line = createConeLineMesh(idx, team, rays, lineSubdiv);
  const root = new THREE.Group();
  root.add(fill.fillMesh);
  root.add(line.lineMesh);
  uiState.aerialVisionGroup.add(root);

  const entry = {
    team,
    profileKey,
    rays,
    rings,
    lineSubdiv,
    hasGeometryData: false,
    root,
    fillGeo: fill.fillGeo,
    fillPos: fill.fillPos,
    fillMat: fill.fillMat,
    lineGeo: line.lineGeo,
    linePos: line.linePos,
    lineMat: line.lineMat
  };
  aerialConePool[idx] = entry;
  return entry;
}

function writeAerialConeVertices(entry, p, yBase) {
  const { rays, rings, lineSubdiv, fillPos: fp, linePos: lp } = entry;
  const ox = p.pos.x;
  const oz = p.pos.z;
  fp[0] = ox;
  fp[1] = getTerrainY(ox, oz) + yBase;
  fp[2] = oz;

  for (let k = 0; k < rays; k++) {
    const px = aerialConeXY[k * 2];
    const pz = aerialConeXY[k * 2 + 1];
    for (let r = 0; r < rings; r++) {
      const frac = (r + 1) / rings;
      const rx = ox + (px - ox) * frac;
      const rz = oz + (pz - oz) * frac;
      const vOff = (1 + r * rays + k) * 3;
      fp[vOff] = rx;
      fp[vOff + 1] = getTerrainY(rx, rz) + yBase;
      fp[vOff + 2] = rz;
    }
    const kn = (k + 1) % rays;
    const nx = aerialConeXY[kn * 2];
    const nz = aerialConeXY[kn * 2 + 1];
    for (let s = 0; s < lineSubdiv; s++) {
      const u = s / lineSubdiv;
      const lx = px + (nx - px) * u;
      const lz = pz + (nz - pz) * u;
      const lOff = (k * lineSubdiv + s) * 3;
      lp[lOff] = lx;
      lp[lOff + 1] = getTerrainY(lx, lz) + yBase + 0.045;
      lp[lOff + 2] = lz;
    }
  }
  entry.fillGeo.attributes.position.needsUpdate = true;
  entry.lineGeo.attributes.position.needsUpdate = true;
  entry.hasGeometryData = true;
}

export function updateAerialVisionCones3D() {
  if (state.cameraMode !== 'aerial' || state.phase !== 'play') {
    if (uiState.aerialVisionGroup) uiState.aerialVisionGroup.visible = false;
    return;
  }
  if (!uiState.aerialVisionGroup) {
    uiState.aerialVisionGroup = new THREE.Group();
    scene.add(uiState.aerialVisionGroup);
  }
  uiState.aerialVisionGroup.visible = true;

  const isLowSpec = !!state.lowSpecMode;
  const profile = isLowSpec ? AERIAL_CONE_PROFILE_LOW : AERIAL_CONE_PROFILE_HIGH;
  uiState.aerialConeFrameCounter = (uiState.aerialConeFrameCounter + 1) % 2;
  const rebuildThisFrame = !isLowSpec || uiState.aerialConeFrameCounter === 1;
  const visionMode = state.minimapVisionMode || 'both';

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const entry = ensureAerialConeEntry(i, p.team, profile);
    const wasVisible = !!entry.root.visible;
    const isMyTeam = p.team === state.myTeam;
    const showCone =
      !p.tutorialHidden &&
      (isMyTeam || visionMode === 'omniscient' || (visionMode === 'both' && p.visibleTo && p.visibleTo[state.myTeam]));
    if (!showCone) {
      entry.root.visible = false;
      continue;
    }
    if (!rebuildThisFrame && entry.hasGeometryData && wasVisible) {
      entry.root.visible = true;
      continue;
    }
    const count = fillPlayerVisionPolygonFlat(p, profile.steps, profile.backSteps, aerialConeXY);
    if (count !== entry.rays) {
      entry.root.visible = false;
      continue;
    }
    entry.root.visible = true;
    writeAerialConeVertices(entry, p, 0.20 + i * 0.036);
  }
  for (let i = players.length; i < aerialConePool.length; i++) {
    if (aerialConePool[i]) aerialConePool[i].root.visible = false;
  }
}
