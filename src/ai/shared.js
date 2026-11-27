import {
  COLORS,
  COLOR_KEYS,
  FIELD,
  DASH_BASE_DIST,
  state,
  mp,
  ctx
} from '../state.js';
import { players } from '../render3d.js';

export const AI_PROFILES = {
  normal: {
    id: 'normal',
    enemySpeed: 8.15,
    allySpeed: 9.0,
    thinkIntervalMs: 260,
    navReplanMs: 420,
    memoryDurationMs: 1600,
    deduceThirdColor: false,
    usePincer: true,
    pincerMaxRange: 24,
    useRule1Trap: false,
    useBounceBankShot: false,
    useDashJump: false,
    useActiveSlideSteer: false,
    useBoomerangReturn: true,
    useAntiLaserCounter: false,
    useLeafArcWall: false,
    useClutchPass: false,
    dashDecisionCd: 1.05,
    dodgeReactionSec: 0.22,
    fireLeadFactor: 0.35,
    fireUltThreshold: 36,
    waterUltThreshold: 34,
    leafUltThreshold: 36,
    predatorAvoidDist: 7.4,
    predatorDashDist: 4.8,
    ultMinRoundTime: 3.4
  },
  hard: {
    id: 'hard',
    enemySpeed: 9.25,
    allySpeed: 9.35,
    thinkIntervalMs: 100,
    navReplanMs: 220,
    memoryDurationMs: 4500,
    deduceThirdColor: true,
    usePincer: true,
    pincerMaxRange: 44,
    useRule1Trap: true,
    useBounceBankShot: true,
    useDashJump: true,
    useActiveSlideSteer: true,
    useBoomerangReturn: true,
    useAntiLaserCounter: true,
    useLeafArcWall: true,
    useClutchPass: true,
    dashDecisionCd: 0.22,
    dodgeReactionSec: 0.06,
    fireLeadFactor: 0.88,
    fireUltThreshold: 24,
    waterUltThreshold: 22,
    leafUltThreshold: 25,
    predatorAvoidDist: 9.2,
    predatorDashDist: 6.6,
    ultMinRoundTime: 1.6
  }
};

export function getAIDifficulty() {
  return state.aiDifficulty === 'hard' ? 'hard' : 'normal';
}

export function getAIProfile() {
  return AI_PROFILES[getAIDifficulty()] || AI_PROFILES.normal;
}

export const teamEnemyMemory = { ally: {}, enemy: {} };
export const teamPlanCache = { ally: null, enemy: null };
let lastMemRound = -1;
let lastMemMapId = '';
let lastMemPlayTime = 0;

export function resetAITacticalMemory() {
  teamEnemyMemory.ally = {};
  teamEnemyMemory.enemy = {};
  teamPlanCache.ally = null;
  teamPlanCache.enemy = null;
}

export function ensureFreshMemoryForRound() {
  const curTime = state.roundPlayTime || 0;
  if (
    state.round !== lastMemRound ||
    state.mapId !== lastMemMapId ||
    curTime + 0.1 < lastMemPlayTime
  ) {
    resetAITacticalMemory();
    lastMemRound = state.round;
    lastMemMapId = state.mapId;
  }
  lastMemPlayTime = curTime;
}

export function isPlayerHumanControlled(p, nowMs) {
  if (p.team === state.myTeam && p.role === state.controlledRole) return true;
  if (mp.enabled) {
    for (const peerKey in mp.remoteInputs) {
      const inp = mp.remoteInputs[peerKey];
      if (inp && inp.team === p.team && inp.role === p.role && nowMs - inp.lastSeen < 10000) {
        return true;
      }
    }
  }
  return false;
}

export function teamHasHumanPlayer(team) {
  return (
    team === state.myTeam ||
    (mp.enabled && mp.members.some((m) => m.team === team))
  );
}

export function broadcastAIUltimate(p, aimAngle, reactivate = false) {
  if (mp.enabled && mp.isHost && ctx.api.sendNetMessage) {
    ctx.api.sendNetMessage({
      type: 'MP_ULT_TRIGGER',
      round: state.round,
      peerId: mp.myPeerId,
      team: p.team,
      role: p.role,
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      oc: p.onCanopy ? 1 : 0,
      aimAngle,
      reactivate
    });
  }
}

export function getEffectiveDashDistance(p) {
  if (ctx.api.getPlayerDashParams) {
    const dp = ctx.api.getPlayerDashParams(p);
    return dp.speed * dp.duration;
  }
  const teamMeta = state.teams[p.team];
  const dashKind = state.vanillaMode ? null : teamMeta?.powers?.[p.role]?.dashEvo || null;
  const mult = !state.vanillaMode && teamMeta?.teamDashPlus ? 1.35 : 1.0;
  if (dashKind === 'bounce') return DASH_BASE_DIST * 2.0 * mult;
  if (dashKind === 'slide') return DASH_BASE_DIST * 3.0 * mult;
  if (dashKind === 'boomerang') return DASH_BASE_DIST * 1.5 * mult;
  return DASH_BASE_DIST * mult;
}

export function getEffectiveDashKind(p) {
  if (state.vanillaMode) return null;
  return state.teams[p.team]?.powers?.[p.role]?.dashEvo || null;
}

export function getKnownEnemyColor(team, enemy, profile) {
  if (!enemy) return null;
  if (enemy.revealedTo?.[team] || enemy.state === 'rule1' || enemy.state === 'sitting') {
    return enemy.color;
  }
  if (!profile.deduceThirdColor) return null;

  const oppMeta = state.teams[enemy.team];
  const extra = oppMeta?.extraDossardBought;
  if (extra && (extra.green || extra.red || extra.blue)) return null;

  const oppPlayers = players.filter((pl) => pl.team === enemy.team && !pl.tutorialHidden);
  const revealedColors = [];
  for (let i = 0; i < oppPlayers.length; i++) {
    const op = oppPlayers[i];
    if (op.id === enemy.id) continue;
    if (op.revealedTo?.[team] || op.state === 'rule1' || op.state === 'sitting') {
      revealedColors.push(op.color);
    }
  }
  if (revealedColors.length === 2 && revealedColors[0] !== revealedColors[1]) {
    const remaining = COLOR_KEYS.find((c) => !revealedColors.includes(c));
    return remaining || null;
  }
  return null;
}

export function getMatchup(myColor, knownEnemyColor, enemyWaterShield = false) {
  if (!knownEnemyColor) return 'unknown';
  if (COLORS[myColor].beats === knownEnemyColor) {
    if (myColor === 'red' && enemyWaterShield) return 'shielded';
    return 'beats';
  }
  if (COLORS[knownEnemyColor].beats === myColor) return 'loses';
  return 'same';
}

export function getTeamGoals(team) {
  const isAlly = team === 'ally';
  return {
    targetGoalX: isAlly ? FIELD.enemyGoalX : FIELD.allyGoalX,
    targetGoalZ: isAlly ? FIELD.enemyGoalZ || 0 : FIELD.allyGoalZ || 0,
    ownGoalX: isAlly ? FIELD.allyGoalX : FIELD.enemyGoalX,
    ownGoalZ: isAlly ? FIELD.allyGoalZ || 0 : FIELD.enemyGoalZ || 0
  };
}
