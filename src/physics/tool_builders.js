import { players, createToonMat, addAnimeOutline } from '../render3d.js';
import { updateTeamVisionState } from '../world.js';
import { markNavDynamicDirty } from '../nav.js';
import {
  THREE,
  activeToolBeacons,
  activeToolWalls,
  activeToolPads,
} from './shared.js';
import { clampToField } from './collision.js';

export function deployBeaconTool(p, pl, group, accentHex) {
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.45, 0.24, 12),
    createToonMat(0x1e293b)
  );
  base.position.y = 0.12;
  group.add(base);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 1.35, 8),
    createToonMat(0x64748b)
  );
  mast.position.y = 0.8;
  group.add(mast);

  const orb = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28, 0),
    new THREE.MeshBasicMaterial({ color: accentHex })
  );
  orb.position.y = 1.62;
  group.add(orb);

  const radarMat = new THREE.MeshBasicMaterial({
    color: accentHex,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const radarRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 28), radarMat);
  radarRing.rotation.x = -Math.PI / 2;
  radarRing.position.y = 0.05;
  group.add(radarRing);

  activeToolBeacons.push({
    ownerId: p.id,
    team: p.team,
    toolKey: 'beacon',
    ox: pl.ox,
    oy: pl.oy,
    oz: pl.oz,
    facingAngle: pl.facingAngle,
    onCanopy: !!pl.onCanopy,
    pos: new THREE.Vector3(pl.px, pl.py, pl.pz),
    x: pl.px,
    y: pl.py,
    z: pl.pz,
    visionRadius: 17.5,
    group,
    orb,
    radarRing,
    animTime: 0,
  });
  updateTeamVisionState(true);
}

export function deployWallTool(p, pl, group, accentHex) {
  const halfLen = 1.5;
  const rightX = Math.cos(pl.facingAngle);
  const rightZ = -Math.sin(pl.facingAngle);
  group.rotation.y = pl.facingAngle;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 2.25, 0.62),
    createToonMat(0x334155)
  );
  body.position.y = 1.125;
  addAnimeOutline(body, 1.03, 0x0f172a);
  group.add(body);

  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(2.86, 0.24, 0.7),
    new THREE.MeshBasicMaterial({ color: accentHex })
  );
  trim.position.y = 1.78;
  group.add(trim);

  activeToolWalls.push({
    ownerId: p.id,
    team: p.team,
    toolKey: 'wall',
    ox: pl.ox,
    oy: pl.oy,
    oz: pl.oz,
    facingAngle: pl.facingAngle,
    onCanopy: !!pl.onCanopy,
    cx: pl.px,
    cy: pl.py,
    cz: pl.pz,
    ax: pl.px - rightX * halfLen,
    az: pl.pz - rightZ * halfLen,
    bx: pl.px + rightX * halfLen,
    bz: pl.pz + rightZ * halfLen,
    halfLen,
    thickness: 0.36,
    height: 2.35,
    group,
  });
  markNavDynamicDirty();
  players.forEach((other) => {
    if (!other.tutorialHidden) clampToField(other.pos, 0.72, other.vel, { onCanopy: !!other.onCanopy });
  });
}

export function deployPadTool(p, pl, group, accentHex) {
  group.rotation.y = pl.facingAngle;
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.1, 2.8),
    createToonMat(0x0f172a)
  );
  plate.position.y = 0.05;
  group.add(plate);

  const glowStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(1.65, 2.5),
    new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  glowStrip.rotation.x = -Math.PI / 2;
  glowStrip.position.y = 0.11;
  group.add(glowStrip);

  const chevronShape = new THREE.Shape();
  chevronShape.moveTo(0, 0.35);
  chevronShape.lineTo(-0.55, -0.15);
  chevronShape.lineTo(-0.35, -0.32);
  chevronShape.lineTo(0, 0.02);
  chevronShape.lineTo(0.35, -0.32);
  chevronShape.lineTo(0.55, -0.15);
  chevronShape.closePath();
  const chevGeo = new THREE.ShapeGeometry(chevronShape);
  chevGeo.rotateX(-Math.PI / 2);
  chevGeo.rotateY(Math.PI);

  const arrows = [];
  for (let k = -1; k <= 1; k++) {
    const chevMat = new THREE.MeshBasicMaterial({
      color: k === 1 ? accentHex : 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const chev = new THREE.Mesh(chevGeo, chevMat);
    chev.position.set(0, 0.12, k * 0.68);
    group.add(chev);
    arrows.push(chev);
  }

  activeToolPads.push({
    ownerId: p.id,
    team: p.team,
    toolKey: 'pad',
    ox: pl.ox,
    oy: pl.oy,
    oz: pl.oz,
    facingAngle: pl.facingAngle,
    onCanopy: !!pl.onCanopy,
    x: pl.px,
    y: pl.py,
    z: pl.pz,
    dirX: pl.dirX,
    dirZ: pl.dirZ,
    radius: 1.35,
    cooldownByPlayer: {},
    group,
    arrows,
    animTime: 0,
  });
}
