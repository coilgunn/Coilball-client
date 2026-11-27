import { state, mp, setTeamPE, ctx } from '../state.js';
import {
  MP_ROLES,
  cloneTeamMeta,
  cloneTeamsMeta,
  syncMapFromNetwork,
  replaceMembersFromNetwork,
  getRoleHumanController,
  getAvailableRolesForTeam
} from './shared.js';
import { sendNetMessage } from './transport.js';

function refreshPlayHUD() {
  ctx.api.updateRosterHUD?.();
  ctx.api.updateUltHudWidget?.();
  ctx.api.updateMobileTouchHUD?.();
}

function buildMatchSyncPayload(type, targetPeerId) {
  return {
    type,
    targetPeerId,
    gameMode: state.mode,
    vanillaMode: !!state.vanillaMode,
    aiDifficulty: state.aiDifficulty || 'normal',
    mapId: state.mapId,
    round: state.round,
    allyPV: state.allyPV,
    allyPE: state.allyPE,
    enemyPV: state.enemyPV,
    enemyPE: state.enemyPE,
    teams: cloneTeamsMeta(state.teams),
    drawnBalls: state.drawnBalls,
    members: mp.members
  };
}

export function sendSyncStateToLateJoiner(targetConn = null, targetPeerId = null) {
  sendNetMessage(buildMatchSyncPayload('MP_START_MATCH', targetPeerId), targetConn);
  if (state.phase !== 'play') return;
  sendNetMessage(buildMatchSyncPayload('MP_START_PLAY', targetPeerId), targetConn);
  ctx.api.broadcastWorldState();
  const ults = ctx.api.serializeLateUltimates ? ctx.api.serializeLateUltimates() : null;
  const tools = ctx.api.serializeLateToolsAndPatches ? ctx.api.serializeLateToolsAndPatches() : null;
  if (ults || tools) {
    sendNetMessage(
      {
        type: 'MP_LATE_ENTITIES',
        targetPeerId,
        round: state.round,
        ults,
        tools
      },
      targetConn
    );
  }
}

function applyMsgPosToPlayer(p, msg) {
  if (
    typeof msg.x === 'number' &&
    typeof msg.z === 'number' &&
    Math.hypot(p.pos.x - msg.x, p.pos.z - msg.z) < 12
  ) {
    p.pos.set(msg.x, typeof msg.y === 'number' ? msg.y : p.pos.y, msg.z);
    if (typeof msg.oc === 'number' || typeof msg.oc === 'boolean') p.onCanopy = !!msg.oc;
  }
}

function applyRemoteReveals(msg, targetTeam) {
  if (!Array.isArray(msg.rev) || msg.rev.length === 0) return;
  const oppTeam = targetTeam === 'ally' ? 'enemy' : 'ally';
  let revHudDirty = false;
  for (let i = 0; i < msg.rev.length; i++) {
    const r = msg.rev[i];
    if (!MP_ROLES.includes(r)) continue;
    const ep = ctx.api.getPlayer(oppTeam, r);
    if (!ep) continue;
    if (!ep.revealedTo) ep.revealedTo = { ally: ep.team === 'ally', enemy: ep.team === 'enemy' };
    if (ep.revealedTo[targetTeam]) continue;
    ep.revealedTo[targetTeam] = true;
    if (targetTeam === state.myTeam && !ep.backRevealed) {
      ep.backRevealed = true;
      revHudDirty = true;
    }
  }
  if (revHudDirty) ctx.api.updateRosterHUD();
}

function recordRemoteInput(msg, targetTeam, targetRole, prev) {
  mp.remoteInputs[msg.peerId] = {
    team: targetTeam,
    role: targetRole,
    x: typeof msg.x === 'number' ? msg.x : prev ? prev.x : undefined,
    y: typeof msg.y === 'number' ? msg.y : prev ? prev.y : 0,
    z: typeof msg.z === 'number' ? msg.z : prev ? prev.z : undefined,
    vx: typeof msg.vx === 'number' ? msg.vx : 0,
    vy: typeof msg.vy === 'number' ? msg.vy : 0,
    vz: typeof msg.vz === 'number' ? msg.vz : 0,
    oc: typeof msg.oc === 'number' ? !!msg.oc : typeof msg.oc === 'boolean' ? msg.oc : prev ? prev.oc : false,
    facingAngle: typeof msg.facingAngle === 'number' ? msg.facingAngle : prev ? prev.facingAngle : undefined,
    moveForward: msg.moveForward || 0,
    moveRight: msg.moveRight || 0,
    camYaw: msg.camYaw,
    seq: typeof msg.seq === 'number' ? msg.seq : prev ? prev.seq : 0,
    lastSeen: performance.now()
  };
}

function handleHostPlayerInputMsg(msg, sourceConn) {
  if (!mp.isHost) return;
  if (typeof msg.round === 'number' && msg.round !== state.round) return;
  const member = mp.members.find((m) => m.peerId === msg.peerId);
  const targetTeam = member ? member.team : msg.team;
  const targetRole = member && member.slot !== 'ALL' ? member.slot : msg.role;
  if (!['ally', 'enemy'].includes(targetTeam) || !MP_ROLES.includes(targetRole)) return;

  const prev = mp.remoteInputs[msg.peerId];
  if (typeof msg.seq === 'number' && prev && typeof prev.seq === 'number' && msg.seq < prev.seq) return;

  const existingOwner = getRoleHumanController(targetTeam, targetRole, msg.peerId);
  if (existingOwner) {
    const fallback =
      (member && !getRoleHumanController(targetTeam, member.activeRole, msg.peerId)
        ? member.activeRole
        : null) || getAvailableRolesForTeam(targetTeam, msg.peerId)[0] || null;
    sendNetMessage(
      {
        type: 'MP_ROLE_DENIED',
        peerId: msg.peerId,
        team: targetTeam,
        blockedRole: targetRole,
        ownerName: existingOwner.name,
        fallbackRole: fallback
      },
      sourceConn
    );
    return;
  }

  let roleChanged = false;
  if (member && member.activeRole !== targetRole) {
    member.activeRole = targetRole;
    roleChanged = true;
  }
  applyRemoteReveals(msg, targetTeam);
  recordRemoteInput(msg, targetTeam, targetRole, prev);

  if (roleChanged) {
    ctx.api.updateRosterHUD();
    sendNetMessage({ type: 'MP_ROLES_SYNC', members: mp.members });
  }
  if (!msg.actionTriggered) return;
  const p = ctx.api.getPlayer(targetTeam, targetRole);
  if (!p) return;
  applyMsgPosToPlayer(p, msg);
  if (typeof msg.facingAngle === 'number') p.facingAngle = msg.facingAngle;
  ctx.api.triggerPlayerAction(p);
  ctx.api.broadcastWorldState();
}

function handlePrepSyncMsg(msg) {
  if (!mp.isHost) syncMapFromNetwork(msg.mapId);
  if (!msg.team || !msg.teamData) return;
  state.teams[msg.team] = cloneTeamMeta(msg.teamData, msg.team);
  if (typeof msg.teamPE === 'number') setTeamPE(msg.team, msg.teamPE);
  replaceMembersFromNetwork(msg.members);

  const prepEl = document.getElementById('prep-modal');
  const prepVisible = prepEl && !prepEl.classList.contains('hidden');
  if (state.mode === 'practice' && state.phase === 'play' && state.teams[msg.team]?.prepColors) {
    MP_ROLES.forEach((role) => {
      const pl = ctx.api.getPlayer(msg.team, role);
      const nextCol = state.teams[msg.team].prepColors[role];
      if (pl && nextCol) ctx.api.applyPlayerColor(pl, nextCol);
    });
    refreshPlayHUD();
  }
  if (state.phase === 'prep' || prepVisible) {
    if (msg.team === state.myTeam) {
      ctx.api.renderPrepColorPickers();
      ctx.api.renderShopItems();
    }
    ctx.api.updatePrepConfirmButtonUI();
  }
  ctx.api.updateTopHUD();
  if (mp.isHost) ctx.api.maybeStartRoundFromPrep();
}

function applyMatchConfigFromMsg(msg) {
  if (msg.aiDifficulty === 'hard' || msg.aiDifficulty === 'normal') {
    ctx.api.setAIDifficulty?.(msg.aiDifficulty, { silent: true, skipSave: true, broadcast: false, fromNetwork: true });
  }
  syncMapFromNetwork(msg.mapId);
}

function handleStartMatchMsg(msg) {
  if (mp.isHost) return;
  if (msg.targetPeerId) {
    if (msg.targetPeerId !== mp.myPeerId) return;
    if ((state.phase === 'prep' || state.phase === 'play') && state.round === msg.round) return;
  }
  state.mode = msg.gameMode === 'practice' ? 'practice' : 'multiplayer';
  state.vanillaMode = !!msg.vanillaMode;
  applyMatchConfigFromMsg(msg);
  state.round = msg.round || 1;
  state.allyPV = msg.allyPV || 0;
  state.allyPE = msg.allyPE || 0;
  state.enemyPV = msg.enemyPV || 0;
  state.enemyPE = msg.enemyPE || 0;
  state.teams = cloneTeamsMeta(msg.teams);
  state.drawnBalls = msg.drawnBalls || ['green', 'red'];
  replaceMembersFromNetwork(msg.members);
  ctx.api.applyRoundSetupPositions();
  ctx.api.openPrepModal();
}

function handlePrepActionMsg(msg, sourceConn) {
  if (!mp.isHost) return;
  ctx.api.handleHostPrepAction(msg, sourceConn);
}

function handleStartPlayMsg(msg) {
  if (mp.isHost) return;
  if (msg.targetPeerId) {
    if (msg.targetPeerId !== mp.myPeerId) return;
    if (state.phase === 'play' && state.round === msg.round) return;
  }
  if (msg.gameMode === 'practice' || msg.gameMode === 'multiplayer') state.mode = msg.gameMode;
  if (typeof msg.vanillaMode === 'boolean') state.vanillaMode = !!msg.vanillaMode;
  applyMatchConfigFromMsg(msg);
  if (typeof msg.round === 'number') state.round = msg.round;
  if (typeof msg.allyPV === 'number') state.allyPV = msg.allyPV;
  if (typeof msg.enemyPV === 'number') state.enemyPV = msg.enemyPV;
  state.teams = msg.teams ? cloneTeamsMeta(msg.teams) : state.teams;
  if (Array.isArray(msg.drawnBalls) && msg.drawnBalls.length >= 2) state.drawnBalls = msg.drawnBalls;
  state.allyPE = msg.allyPE;
  state.enemyPE = msg.enemyPE;
  replaceMembersFromNetwork(msg.members);
  ctx.api.applyRoundSetupPositions();
  ctx.api.startRoundExecution(true);
}

function handlePracticeActionMsg(msg) {
  if (state.mode !== 'practice') return;
  if (mp.isHost) {
    if (msg.action === 'reset_powers' && !msg.payload?.team) {
      const req = mp.members.find((m) => m.peerId === (msg.peerId || msg._sender));
      msg.payload = Object.assign({}, msg.payload, { team: req ? req.team : state.myTeam });
    }
    if (ctx.api.executePracticeAction(msg.action, msg.payload, false)) {
      sendNetMessage({
        type: 'MP_PRACTICE_ACTION',
        action: msg.action,
        payload: msg.payload,
        teams: cloneTeamsMeta(state.teams)
      });
      if (state.phase === 'play') ctx.api.broadcastWorldState();
    }
    return;
  }
  ctx.api.executePracticeAction(msg.action, msg.payload, true);
  if (msg.teams) {
    state.teams = cloneTeamsMeta(msg.teams);
    ctx.api.updateTopHUD?.();
    refreshPlayHUD();
  }
}

function handleWorldStateMsg(msg) {
  if (mp.isHost || state.phase !== 'play') return;
  ctx.api.applyWorldStateFromHost(msg);
}

function handleUltTriggerMsg(msg) {
  if (state.phase !== 'play') return;
  if (typeof msg.round === 'number' && msg.round !== state.round) return;
  if (!mp.isHost && msg.peerId && msg.peerId === mp.myPeerId) return;
  const p = ctx.api.getPlayer(msg.team, msg.role);
  if (!p) return;
  applyMsgPosToPlayer(p, msg);
  const aimAngle = typeof msg.aimAngle === 'number' ? msg.aimAngle : p.facingAngle;
  ctx.api.triggerPlayerUltimate(p, aimAngle, true, !!msg.reactivate);
  if (mp.isHost) {
    sendNetMessage({
      type: 'MP_ULT_TRIGGER',
      round: state.round,
      peerId: msg.peerId || msg._sender,
      team: msg.team,
      role: msg.role,
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      oc: p.onCanopy ? 1 : 0,
      aimAngle,
      reactivate: !!msg.reactivate
    });
    ctx.api.broadcastWorldState();
  }
}

function handleToolDeployMsg(msg) {
  if (state.phase !== 'play') return;
  if (!mp.isHost && msg.peerId && msg.peerId === mp.myPeerId) return;
  const p = ctx.api.getPlayer(msg.team, msg.role);
  if (!p) return;
  ctx.api.deployPlayerTool(p, msg.toolKey, {
    x: msg.x,
    y: msg.y,
    z: msg.z,
    facingAngle: msg.facingAngle,
    onCanopy: !!msg.onCanopy,
    fromNetwork: true
  });
  if (mp.isHost) {
    sendNetMessage({
      type: 'MP_TOOL_DEPLOY',
      peerId: msg.peerId || msg._sender,
      team: msg.team,
      role: msg.role,
      toolKey: msg.toolKey,
      x: msg.x,
      y: msg.y,
      z: msg.z,
      facingAngle: msg.facingAngle,
      onCanopy: !!msg.onCanopy
    });
  }
}

function handleSlidePatchMsg(msg) {
  if (state.phase !== 'play') return;
  if (!mp.isHost && msg.peerId && msg.peerId === mp.myPeerId) return;
  ctx.api.spawnSlidePatch(msg.ownerId, msg.team, msg.x, msg.y, msg.z, false);
  if (mp.isHost) {
    sendNetMessage({
      type: 'MP_SLIDE_PATCH',
      peerId: msg.peerId || msg._sender,
      ownerId: msg.ownerId,
      team: msg.team,
      x: msg.x,
      y: msg.y,
      z: msg.z
    });
  }
}

function handleBallPassMsg(msg) {
  if (state.phase !== 'play') return;
  if (typeof msg.round === 'number' && msg.round !== state.round) return;
  if (mp.isHost) ctx.api.handleRemoteBallPass?.(msg);
}

function handlePlayerJumpMsg(msg) {
  if (state.phase !== 'play') return;
  if (typeof msg.round === 'number' && msg.round !== state.round) return;
  if (mp.isHost) ctx.api.handleRemotePlayerJump?.(msg);
}

function handleLateEntitiesMsg(msg) {
  if (mp.isHost || state.phase !== 'play') return;
  if (msg.targetPeerId && msg.targetPeerId !== mp.myPeerId) return;
  if (typeof msg.round === 'number' && msg.round !== state.round) return;
  if (msg.ults && ctx.api.applyLateUltimates) ctx.api.applyLateUltimates(msg.ults);
  if (msg.tools && ctx.api.applyLateToolsAndPatches) ctx.api.applyLateToolsAndPatches(msg.tools);
}

function handleRoundEndMsg(msg) {
  if (mp.isHost) return;
  syncMapFromNetwork(msg.mapId);
  state.allyPV = msg.allyPV;
  state.allyPE = msg.allyPE;
  state.enemyPV = msg.enemyPV;
  state.enemyPE = msg.enemyPE;
  state.roundAllyGoals = msg.roundAllyGoals;
  state.roundEnemyGoals = msg.roundEnemyGoals;
  state.roundAllyKills = msg.roundAllyKills;
  state.roundEnemyKills = msg.roundEnemyKills;
  if (msg.teams) state.teams = cloneTeamsMeta(msg.teams);
  ctx.api.finishRound(msg.reason, true, msg.bountyNotes || []);
}

export const GAME_MESSAGE_HANDLERS = {
  MP_START_MATCH: handleStartMatchMsg,
  MP_PREP_ACTION: handlePrepActionMsg,
  MP_PREP_SYNC: handlePrepSyncMsg,
  MP_START_PLAY: handleStartPlayMsg,
  MP_PRACTICE_ACTION: handlePracticeActionMsg,
  MP_PLAYER_INPUT: handleHostPlayerInputMsg,
  MP_WORLD_STATE: handleWorldStateMsg,
  MP_ULT_TRIGGER: handleUltTriggerMsg,
  MP_TOOL_DEPLOY: handleToolDeployMsg,
  MP_SLIDE_PATCH: handleSlidePatchMsg,
  MP_BALL_PASS: handleBallPassMsg,
  MP_PLAYER_JUMP: handlePlayerJumpMsg,
  MP_LATE_ENTITIES: handleLateEntitiesMsg,
  MP_ROUND_END: handleRoundEndMsg
};
