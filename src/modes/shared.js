import {
  TUTORIAL_TOTAL_STEPS,
  TUTORIAL_STEPS,
  DEFAULT_FIELD_CONFIG,
  FIELD,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_SPEED,
  DASH_EVO_META,
  TOOL_EVO_META,
  state,
  ctx
} from '../state.js';
import {
  players,
  balls,
  applyBallColor
} from '../render3d.js';
import {
  getTerrainY,
  updateTeamVisionState
} from '../world.js';
import { clearAllUltimates } from '../ultimates.js';
import { recenterMobaCamera } from '../ui.js';

const THREE = ctx.THREE;

export const modesState = {
  pendingTutorialIntro: false,
  tutorialIntroKind: 'welcome',
  tutorialUltRecoverTimer: null,
  tutorialBeaconGroup: null,
  tutorialAutoAdvanceTimer: null,
  tutorialFinishTimer: null,
  tutorialShopAutoReturnTimer: null
};

export function clearTutorialTimers() {
  const keys = [
    'tutorialAutoAdvanceTimer',
    'tutorialFinishTimer',
    'tutorialShopAutoReturnTimer',
    'tutorialUltRecoverTimer'
  ];
  keys.forEach((k) => {
    if (modesState[k]) {
      clearTimeout(modesState[k]);
      modesState[k] = null;
    }
  });
}

export function clearPrepInterval() {
  if (state.prepInterval) {
    clearInterval(state.prepInterval);
    state.prepInterval = null;
  }
}

export function hideElementsById(ids) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

export function placePlayerAt(p, x, y, z, facing) {
  if (!p) return;
  p.pos.set(x, y, z);
  p.targetPos.copy(p.pos);
  p.facingAngle = facing;
  p.targetFacingAngle = facing;
}

export function resetPlayerDashAndUltState(p) {
  p.ultUsed = false;
  p.ultShotsUsed = 0;
  p.ultCooldown = 0;
  p.activeReactivableWave = null;
  p.leafUltTimer = 0;
  p.leafUltMaxDuration = 2.0;
  p.leafUltSpeedMult = 3.0;
  p.waterShieldTimer = 0;
  p.dashKind = null;
  p.dashIsSuper = false;
  p.dashSpeed = DASH_SPEED;
  p.dashMaxDuration = DASH_DURATION;
  p.dashBouncesLeft = 0;
  p.boomerangWindow = 0;
  p.boomerangOrigin = null;
  p.jumpMomentumVx = 0;
  p.jumpMomentumVz = 0;
  p.dashMomentumGrace = 0;
  p.lastDashVx = 0;
  p.lastDashVz = 0;
  p.toolCooldown = 0;
  p.jumpCooldown = 0;
}

export function resetPlayerVisibility(p) {
  p.revealedTo = { ally: p.team === 'ally', enemy: p.team === 'enemy' };
  p.visibleTo = { ally: p.team === 'ally', enemy: p.team === 'enemy' };
  p.backRevealed = p.team === state.myTeam;
  p.currentlySeeingBack = p.team === state.myTeam;
}

export function resetBallToSpawn(b, idx, useTerrainY) {
  b.state = 'ground';
  b.carrier = null;
  b.thrownByTeam = null;
  b.thrownById = null;
  b.passTargetId = null;
  b.passIgnoreTimer = 0;
  b.onCanopy = false;
  const customSpawn = Array.isArray(FIELD.ballSpawns) && FIELD.ballSpawns[idx];
  const spawnX = customSpawn ? customSpawn.x : 0;
  const spawnZ = customSpawn ? customSpawn.z : (idx === 0 ? FIELD.laneTopZ : FIELD.laneBotZ);
  const spawnY = useTerrainY ? getTerrainY(spawnX, spawnZ, state.mapId) + 0.52 : 0.52;
  b.pos.set(spawnX, spawnY, spawnZ);
  b.targetPos.copy(b.pos);
  b.vel.set(0, 0, 0);
  applyBallColor(b, state.drawnBalls[idx]);
}

function isTutorialPlayerHidden(p, step) {
  if (step === TUTORIAL_STEPS.MOVEMENT) {
    return p.team !== 'ally' || (p.role !== 'G' && !state.tutorialChecklist.dashed);
  }
  if (step === TUTORIAL_STEPS.GOAL) {
    return !(p.team === 'ally' && p.role === 'G');
  }
  if (step === TUTORIAL_STEPS.PASS) {
    return !(p.team === 'ally' && (p.role === 'G' || p.role === 'C'));
  }
  if (step === TUTORIAL_STEPS.RULE1) {
    return !(p.team === 'ally' || (p.team === 'enemy' && p.role === 'C'));
  }
  if (step === TUTORIAL_STEPS.ULTIMATE) {
    return !(p.team === 'ally' || (p.team === 'enemy' && p.role === 'D'));
  }
  return !((p.team === 'ally' && p.role === 'G') || (p.team === 'enemy' && p.role === 'D'));
}

export function syncTutorialEntityVisibility() {
  const isTut = state.mode === 'tutorial';
  const step = Math.min(TUTORIAL_TOTAL_STEPS, Math.max(1, state.tutorialStep || 1));

  players.forEach((p) => {
    const hidden = isTut ? isTutorialPlayerHidden(p, step) : false;
    p.tutorialHidden = hidden;
    if (p.mesh && p.mesh.root) {
      p.mesh.root.visible = !hidden;
    }
    if (hidden && p.mesh && p.mesh.labelEl) {
      p.mesh.labelEl.style.display = 'none';
      p.mesh._lblDisplay = 'none';
    }
  });

  balls.forEach((b) => {
    const hidden = isTut
      ? !((step === TUTORIAL_STEPS.GOAL || step === TUTORIAL_STEPS.PASS) && b.id === 0)
      : false;
    b.tutorialHidden = hidden;
    if (b.mesh && b.mesh.group) {
      b.mesh.group.visible = !hidden;
    }
  });
}

function resetPlayerMovementProps(p) {
  p.state = 'standing';
  p.rule1Partner = null;
  p.carryingBall = null;
  p.vel.set(0, 0, 0);
  p.vy = 0;
  p.onCanopy = false;
  p.isAirborne = false;
  p.airSource = null;
  p.isLaunching = false;
  p.launchVz = 0;
  p.launchBoostTimer = 0;
  p.dashTimer = 0;
  p.dashCooldown = 0;
  p.dashCooldownMax = DASH_COOLDOWN;
  p.slidePatchDist = 0;
  p.slideGlideTimer = 0;
  p.slideGlideVx = 0;
  p.slideGlideVz = 0;
  p.onSlidePatch = false;
  p.iceSlideDirX = 0;
  p.iceSlideDirZ = 0;
  p.iceSlideSpeed = 0;
  p.isSlidingNet = false;
  p.padBoostTimer = 0;
  p.padDirX = 0;
  p.padDirZ = 0;
  p.dashDirX = 0;
  p.dashDirZ = 0;
}

function getRoundSetupSpawnMaps(customSpawns) {
  const wingX = Math.round(FIELD.width * (46 / DEFAULT_FIELD_CONFIG.width));
  const centerX = Math.round(FIELD.width * (74 / DEFAULT_FIELD_CONFIG.width));
  const mk = (x, z) => new THREE.Vector3(x, 0, z);
  return {
    ally: {
      G: customSpawns ? mk(customSpawns.ally.G.x, customSpawns.ally.G.z) : mk(-wingX, FIELD.laneTopZ),
      D: customSpawns ? mk(customSpawns.ally.D.x, customSpawns.ally.D.z) : mk(-wingX, FIELD.laneBotZ),
      C: customSpawns ? mk(customSpawns.ally.C.x, customSpawns.ally.C.z) : mk(-centerX, 0)
    },
    enemy: {
      D: customSpawns ? mk(customSpawns.enemy.D.x, customSpawns.enemy.D.z) : mk(wingX, FIELD.laneTopZ),
      G: customSpawns ? mk(customSpawns.enemy.G.x, customSpawns.enemy.G.z) : mk(wingX, FIELD.laneBotZ),
      C: customSpawns ? mk(customSpawns.enemy.C.x, customSpawns.enemy.C.z) : mk(centerX, 0)
    }
  };
}

export function applyRoundSetupPositions() {
  balls.forEach((b, idx) => resetBallToSpawn(b, idx, false));
  const customSpawns = FIELD.playerSpawns;
  const spawnMaps = getRoundSetupSpawnMaps(customSpawns);

  players.forEach((p) => {
    resetPlayerMovementProps(p);
    resetPlayerDashAndUltState(p);
    const pos = spawnMaps[p.team][p.role];
    const defaultFacing = p.team === 'ally' ? Math.PI / 2 : -Math.PI / 2;
    const facing = customSpawns ? customSpawns[p.team][p.role].facing : defaultFacing;
    placePlayerAt(p, pos.x, pos.y, pos.z, facing);
    resetPlayerVisibility(p);
  });

  state.ultPreviewActive = false;
  state.roundPlayTime = 0;
  clearAllUltimates();
  ctx.api.clearAllDeployedTools();
  ctx.api.clearAllSlidePatches();
  ctx.api.resetAITacticalMemory?.();
  syncTutorialEntityVisibility();
  updateTeamVisionState(true);
  recenterMobaCamera(true);
}

export function isShopAvailable() {
  return state.round >= 3 || state.mode === 'practice' || (state.mode === 'tutorial' && state.tutorialStep >= TUTORIAL_STEPS.TOOLS);
}

export function isPowerItemAllowedInCurrentMode(def) {
  if (!def) return false;
  if (state.vanillaMode) {
    return def.key === 'throwBall' || def.key === 'standUp';
  }
  return !def.vanillaOnly;
}

export function formatRolePowerSummary(pwr) {
  if (!pwr) return [];
  const tags = [];
  if (state.vanillaMode && pwr.throwBall) tags.push('🎯 Passe');
  if (!state.vanillaMode && pwr.ultEvo) tags.push('🌟 Ult Évolué');
  if (!state.vanillaMode && pwr.dashEvo && DASH_EVO_META[pwr.dashEvo]) tags.push(DASH_EVO_META[pwr.dashEvo].shortLabel);
  if (!state.vanillaMode && pwr.toolEvo && TOOL_EVO_META[pwr.toolEvo]) tags.push(TOOL_EVO_META[pwr.toolEvo].shortLabel);
  if (pwr.standUp) tags.push('⚡ Relever');
  return tags;
}
