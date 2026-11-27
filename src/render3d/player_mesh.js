import { DASH_DURATION, DASH_COOLDOWN, DASH_SPEED, state } from '../state.js';
import { THREE, players, createToonMat } from './shared.js';
import { scene, labelsContainer, createLeafDurationBadge } from './scene.js';
import { getDossardTexture } from './textures_dossard.js';
import {
  ANIME_CHAR_STYLES,
  buildAnimeLeg,
  buildAnimeArm,
  buildTorso,
  buildHeadAndHair
} from './player_parts.js';
import { buildPlayerPowerSockets } from './player_sockets.js';

function createStealthRegistry() {
  const stealthMaterials = [];
  const matSet = new Set();
  const regStealthMat = (mat, isOverlay = false) => {
    if (!mat || matSet.has(mat)) return mat;
    matSet.add(mat);
    stealthMaterials.push({
      mat,
      baseTransparent: !!mat.transparent,
      baseOpacity: typeof mat.opacity === 'number' ? mat.opacity : 1.0,
      baseDepthWrite: mat.depthWrite !== false,
      isOverlay
    });
    return mat;
  };
  return { stealthMaterials, regStealthMat };
}

function buildFloorRingAndArrow(root, isAlly) {
  const ringGroup = new THREE.Group();
  ringGroup.position.y = 0.03;

  const ringMat = new THREE.MeshBasicMaterial({
    color: isAlly ? 0xffbe0b : 0xc084fc,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.78
  });
  const floorRing = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.88, 32), ringMat);
  floorRing.rotation.x = -Math.PI / 2;
  ringGroup.add(floorRing);

  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, -1.2);
  arrowShape.lineTo(0.3, -0.78);
  arrowShape.lineTo(-0.3, -0.78);
  arrowShape.closePath();
  const arrowMesh = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), ringMat);
  arrowMesh.rotation.x = -Math.PI / 2;
  ringGroup.add(arrowMesh);

  root.add(ringGroup);
  return { floorRing: ringGroup, ringMat };
}

function buildLeafAura(root) {
  const leafAuraGroup = new THREE.Group();
  leafAuraGroup.position.y = 0.05;
  leafAuraGroup.visible = false;
  const leafAuraMat = new THREE.MeshBasicMaterial({
    color: 0x4ade80,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.78,
    depthWrite: false
  });
  const outer = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.2, 24), leafAuraMat);
  outer.rotation.x = -Math.PI / 2;
  leafAuraGroup.add(outer);
  const spoke = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.72, 6), leafAuraMat);
  spoke.rotation.x = -Math.PI / 2;
  leafAuraGroup.add(spoke);
  root.add(leafAuraGroup);
  return { leafAuraGroup, leafAuraMat };
}

function createPlayerPartMaterials(charStyle, teamTrimColor, regStealthMat, outlineMat) {
  return {
    outlineMat,
    skinMat: regStealthMat(createToonMat(0xfff0db)),
    tunicMat: regStealthMat(createToonMat(0xf1f5f9)),
    accentMat: regStealthMat(createToonMat(teamTrimColor)),
    skirtMat: regStealthMat(createToonMat(0x334155)),
    bootMat: regStealthMat(createToonMat(0x1e293b)),
    hairMat: regStealthMat(createToonMat(charStyle.hairHex)),
    hairHighlightMat: regStealthMat(
      createToonMat(charStyle.hairHighlightHex, {
        emissive: charStyle.hairHighlightHex,
        emissiveIntensity: 0.35
      })
    ),
    regStealthMat,
    overlayMeshes: [],
    hairBouncers: []
  };
}

export function createPlayerMesh(team, role) {
  const isAlly = team === 'ally';
  const charStyle = ANIME_CHAR_STYLES[team][role];
  const teamTrimColor = isAlly ? 0xfacc15 : 0xc084fc;

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0f1020, side: THREE.BackSide });
  const { stealthMaterials, regStealthMat } = createStealthRegistry();
  const ctxParts = createPlayerPartMaterials(charStyle, teamTrimColor, regStealthMat, outlineMat);

  const leftLeg = buildAnimeLeg(ctxParts, -0.205);
  const rightLeg = buildAnimeLeg(ctxParts, 0.205);
  bodyGroup.add(leftLeg, rightLeg);

  const { backDisc, backDiscMat } = buildTorso(ctxParts, bodyGroup, role, isAlly);
  const leftArm = buildAnimeArm(ctxParts, -0.48);
  const rightArm = buildAnimeArm(ctxParts, 0.48);
  bodyGroup.add(leftArm, rightArm);

  const headGroup = buildHeadAndHair(ctxParts, bodyGroup, charStyle);
  const socketBundle = buildPlayerPowerSockets({
    bodyGroup,
    headGroup,
    leftLeg,
    rightLeg,
    teamTrimColor,
    regStealthMat
  });

  const { floorRing, ringMat } = buildFloorRingAndArrow(root, isAlly);
  const { leafAuraGroup, leafAuraMat } = buildLeafAura(root);
  scene.add(root);

  const labelEl = document.createElement('div');
  labelEl.className = `player-3d-label ${team}`;
  labelsContainer.appendChild(labelEl);

  return {
    root,
    bodyGroup,
    headGroup,
    hairBouncers: ctxParts.hairBouncers,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    backDisc,
    backDiscMat,
    floorRing,
    ringMat,
    leafAuraGroup,
    leafAuraMat,
    labelEl,
    leafBadge: createLeafDurationBadge(),
    outlineMat,
    stealthMaterials,
    overlayMeshes: ctxParts.overlayMeshes,
    stealthAlpha: 1.0,
    _lastStealthBlend: false,
    powerSockets: socketBundle.powerSockets,
    ultEvoMat: socketBundle.ultEvoMat,
    ultEvoCoreMat: socketBundle.ultEvoCoreMat,
    ultEvoStar: socketBundle.ultEvoStar,
    beaconOrb: socketBundle.beaconOrb,
    _powerVisSig: -1
  };
}

function createPlayerRecord(team, role) {
  const isAlly = team === 'ally';
  return {
    id: `${team}_${role}`,
    team,
    role,
    color: isAlly ? 'blue' : 'red',
    state: 'standing',
    rule1Partner: null,
    carryingBall: null,
    pos: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    vy: 0,
    onCanopy: false,
    isAirborne: false,
    isLaunching: false,
    launchVz: 0,
    launchBoostTimer: 0,
    jumpMomentumVx: 0,
    jumpMomentumVz: 0,
    dashMomentumGrace: 0,
    lastDashVx: 0,
    lastDashVz: 0,
    facingAngle: isAlly ? Math.PI / 2 : -Math.PI / 2,
    targetFacingAngle: isAlly ? Math.PI / 2 : -Math.PI / 2,
    dashTimer: 0,
    dashCooldown: 0,
    dashCooldownMax: DASH_COOLDOWN,
    dashIsSuper: false,
    dashKind: null,
    dashSpeed: DASH_SPEED,
    dashMaxDuration: DASH_DURATION,
    dashBouncesLeft: 0,
    boomerangWindow: 0,
    boomerangOrigin: null,
    slidePatchDist: 0,
    slideGlideTimer: 0,
    slideGlideVx: 0,
    slideGlideVz: 0,
    onSlidePatch: false,
    iceSlideDirX: 0,
    iceSlideDirZ: 0,
    iceSlideSpeed: 0,
    isSlidingNet: false,
    padBoostTimer: 0,
    padDirX: 0,
    padDirZ: 0,
    toolCooldown: 0,
    dashDirX: 0,
    dashDirZ: 0,
    ultUsed: false,
    ultShotsUsed: 0,
    ultCooldown: 0,
    activeReactivableWave: null,
    leafUltTimer: 0,
    leafUltMaxDuration: 2.0,
    leafUltSpeedMult: 3.0,
    waterShieldTimer: 0,
    animTime: Math.random() * 10,
    revealedTo: { ally: isAlly, enemy: !isAlly },
    teamSeeingBack: { ally: isAlly, enemy: !isAlly },
    visibleTo: { ally: true, enemy: true },
    backRevealed: isAlly,
    currentlySeeingBack: isAlly,
    mesh: createPlayerMesh(team, role)
  };
}

export function initPlayers() {
  const roles = ['G', 'C', 'D'];
  roles.forEach((role) => players.push(createPlayerRecord('ally', role)));
  roles.forEach((role) => players.push(createPlayerRecord('enemy', role)));
}

export function applyPlayerColor(player, colorKey) {
  player.color = colorKey;
  player.mesh.backDiscMat.map = getDossardTexture(colorKey);
  player.mesh.backDiscMat.needsUpdate = true;
}

export function syncPlayerPowerVisuals(player, nowSec = 0) {
  if (!player || !player.mesh || !player.mesh.powerSockets) return;
  const mesh = player.mesh;
  const teamMeta = state.teams && state.teams[player.team];
  const pwr = (teamMeta && teamMeta.powers && teamMeta.powers[player.role]) || {};
  const dashEvo = pwr.dashEvo || null;
  const toolEvo = pwr.toolEvo || null;
  const ultEvo = !!pwr.ultEvo;
  const standUp = !!pwr.standUp;
  const teamDashPlus = !!(teamMeta && teamMeta.teamDashPlus);
  const teamJump = !!(teamMeta && teamMeta.teamJump);
  const ultUsed = !!player.ultUsed;

  const sig =
    (ultEvo ? 1 : 0) |
    (standUp ? 2 : 0) |
    (teamDashPlus ? 4 : 0) |
    (teamJump ? 8 : 0) |
    (ultUsed ? 16 : 0) |
    (dashEvo === 'bounce' ? 32 : dashEvo === 'slide' ? 64 : dashEvo === 'boomerang' ? 128 : 0) |
    (toolEvo === 'beacon' ? 256 : toolEvo === 'wall' ? 512 : toolEvo === 'pad' ? 1024 : 0);

  if (mesh._powerVisSig !== sig) {
    mesh._powerVisSig = sig;
    const ps = mesh.powerSockets;
    ps.dash.bounce.visible = dashEvo === 'bounce';
    ps.dash.slide.visible = dashEvo === 'slide';
    ps.dash.boomerang.visible = dashEvo === 'boomerang';
    ps.tool.beacon.visible = toolEvo === 'beacon';
    ps.tool.wall.visible = toolEvo === 'wall';
    ps.tool.pad.visible = toolEvo === 'pad';
    ps.ultEvo.visible = ultEvo;
    ps.standUp.visible = standUp;
    ps.teamDashPlus.visible = teamDashPlus;
    ps.teamJump.visible = teamJump;

    if (mesh.ultEvoMat) {
      mesh.ultEvoMat.color.setHex(ultUsed ? 0x64748b : 0xfde047);
    }
    if (mesh.ultEvoCoreMat) {
      mesh.ultEvoCoreMat.color.setHex(ultUsed ? 0x94a3b8 : 0xffffff);
    }
  }

  if (!state.lowSpecMode && nowSec > 0) {
    if (mesh.ultEvoStar && mesh.powerSockets.ultEvo.visible) {
      mesh.ultEvoStar.rotation.y = nowSec * 2.4;
      mesh.ultEvoStar.position.y = 0.24 + Math.sin(nowSec * 3.6) * 0.03;
    }
    if (mesh.beaconOrb && mesh.powerSockets.tool.beacon.visible) {
      mesh.beaconOrb.rotation.y = nowSec * 2.8;
    }
  }
}
