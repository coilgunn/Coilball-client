import { ctx } from '../state.js';
import { scene, spawnParticles } from '../render3d.js';
import {
  FIRE_ULT_DELAY,
  FIRE_ULT_MAX_LEN,
  FIRE_ULT_SPEED,
  FIRE_ULT_BEAM_RADIUS,
  FIRE_ULT_LINGER,
  activeFireLasers
} from './shared.js';
import { createTerrainRibbonMesh, updateTerrainRibbonLocal } from './geometry.js';
import { computeFireLaserMaxDist } from './fire.js';

const THREE = ctx.THREE;

function createFireElectricArcs(group, evolved, oy) {
  const arcSpecs = [
    { color: 0xe0f2fe, opacity: 0.95, radialBase: evolved ? 0.72 : 0.44, turns: 5.5, speed: 15.0, phaseOffset: 0.0 },
    { color: 0x38bdf8, opacity: 0.88, radialBase: evolved ? 0.88 : 0.56, turns: -4.8, speed: -18.5, phaseOffset: 2.1 },
    { color: 0xfde047, opacity: 0.86, radialBase: evolved ? 0.58 : 0.36, turns: 7.2, speed: 22.0, phaseOffset: 4.2 }
  ];
  const ptsCount = 34;
  return arcSpecs.map((spec) => {
    const positions = new Float32Array(ptsCount * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      depthWrite: false
    });
    const line = new THREE.Line(geo, mat);
    line.position.set(0, oy, 0);
    line.frustumCulled = false;
    line.visible = false;
    group.add(line);
    return {
      line,
      positions,
      ptsCount,
      baseOpacity: spec.opacity,
      radialBase: spec.radialBase,
      turns: spec.turns,
      speed: spec.speed,
      phaseOffset: spec.phaseOffset
    };
  });
}

function createFireBeamVisuals(group, evolved, oy) {
  const dangerMat = new THREE.MeshBasicMaterial({
    color: evolved ? 0xff2200 : 0xff4500,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  const dangerStrip = createTerrainRibbonMesh(44, dangerMat, 14);
  group.add(dangerStrip);

  const warnCoreGeo = new THREE.CylinderGeometry(evolved ? 0.11 : 0.06, evolved ? 0.11 : 0.06, 1.0, 8);
  warnCoreGeo.rotateX(Math.PI / 2);
  warnCoreGeo.translate(0, 0, 0.5);
  const warnCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffedd5,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });
  const warnCore = new THREE.Mesh(warnCoreGeo, warnCoreMat);
  group.add(warnCore);

  const outerRadius = evolved ? 0.54 : 0.28;
  const outerBeamGeo = new THREE.CylinderGeometry(outerRadius, outerRadius, 1.0, 12);
  outerBeamGeo.rotateX(Math.PI / 2);
  outerBeamGeo.translate(0, 0, 0.5);
  const outerBeam = new THREE.Mesh(
    outerBeamGeo,
    new THREE.MeshBasicMaterial({ color: 0xff6b00, transparent: true, opacity: 0.88, depthWrite: false })
  );
  outerBeam.visible = false;
  group.add(outerBeam);

  const innerRadius = evolved ? 0.22 : 0.11;
  const innerBeamGeo = new THREE.CylinderGeometry(innerRadius, innerRadius, 1.0, 10);
  innerBeamGeo.rotateX(Math.PI / 2);
  innerBeamGeo.translate(0, 0, 0.5);
  const innerBeam = new THREE.Mesh(
    innerBeamGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98, depthWrite: false })
  );
  innerBeam.visible = false;
  group.add(innerBeam);

  const electricArcs = createFireElectricArcs(group, evolved, oy);
  return { dangerStrip, warnCore, outerBeam, innerBeam, electricArcs };
}

function createFireChargeVisuals(group, evolved) {
  const muzzleRing = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.85, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffedd5,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  group.add(muzzleRing);

  const chargeBallGroup = new THREE.Group();
  const ballCore = new THREE.Mesh(
    new THREE.SphereGeometry(evolved ? 0.34 : 0.24, 14, 14),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.96, depthWrite: false })
  );
  chargeBallGroup.add(ballCore);

  const ballAuraMat = new THREE.MeshBasicMaterial({
    color: evolved ? 0xff3b00 : 0xff6b00,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  chargeBallGroup.add(new THREE.Mesh(new THREE.SphereGeometry(evolved ? 0.62 : 0.44, 16, 16), ballAuraMat));

  const ballHalo = new THREE.Mesh(
    new THREE.TorusGeometry(evolved ? 0.56 : 0.4, 0.045, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.88, depthWrite: false })
  );
  chargeBallGroup.add(ballHalo);
  group.add(chargeBallGroup);

  const impactSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })
  );
  impactSphere.visible = false;
  group.add(impactSphere);

  return { muzzleRing, chargeBallGroup, ballAuraMat, ballHalo, impactSphere };
}

export function spawnFireLaserUltimate(caster, aimAngle, evolved = false, lockAim = false) {
  const beamRadius = evolved ? FIRE_ULT_BEAM_RADIUS * 1.9 : FIRE_ULT_BEAM_RADIUS;
  const castDelay = FIRE_ULT_DELAY;
  const beamSpeed = evolved ? FIRE_ULT_SPEED * 1.8 : FIRE_ULT_SPEED;
  const dirX = Math.sin(aimAngle);
  const dirZ = Math.cos(aimAngle);
  const ox = caster.pos.x + dirX * 0.85;
  const oy = (caster.pos.y || 0) + 1.05;
  const oz = caster.pos.z + dirZ * 0.85;

  const group = new THREE.Group();
  scene.add(group);
  const beamVis = createFireBeamVisuals(group, evolved, oy);
  const chargeVis = createFireChargeVisuals(group, evolved);

  const maxLen = computeFireLaserMaxDist(ox, oy, oz, dirX, dirZ, FIRE_ULT_MAX_LEN);
  group.position.set(ox, 0, oz);
  group.rotation.y = aimAngle;

  updateTerrainRibbonLocal(beamVis.dangerStrip, {
    ox,
    oz,
    dirX,
    dirZ,
    halfW: beamRadius * 1.05,
    length: maxLen,
    yOffset: 0.2,
    onCanopy: !!caster.onCanopy
  });
  beamVis.warnCore.position.y = oy;
  beamVis.warnCore.scale.set(1, 1, maxLen);
  chargeVis.muzzleRing.position.set(0, oy, 0.28);
  chargeVis.chargeBallGroup.position.set(0, oy, 0.28);
  chargeVis.chargeBallGroup.scale.setScalar(0.18);

  spawnParticles(new THREE.Vector3(ox, oy, oz), 0xff6b00, 14);
  ctx.api.playSfx?.('ult_fire_charge', { pos: caster.pos, evolved, global: true });

  activeFireLasers.push({
    caster,
    casterId: caster.id,
    casterRole: caster.role,
    team: caster.team,
    evolved: !!evolved,
    ox,
    oy,
    oz,
    dirX,
    dirZ,
    aimAngle,
    lockedAimAngle: lockAim ? aimAngle : null,
    beamRadius,
    delay: castDelay,
    speed: beamSpeed,
    phase: 'telegraph',
    timer: castDelay,
    currentLen: 0,
    maxLen,
    lingerTimer: FIRE_ULT_LINGER,
    arcTime: 0,
    hitPlayers: new Set(),
    group,
    ...beamVis,
    ...chargeVis
  });
}
