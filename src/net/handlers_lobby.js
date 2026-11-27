import { state, mp, escapeHtml, ctx } from '../state.js';
import {
  clearConnIceTimer,
  tryNetOp,
  syncMapFromNetwork,
  resolveTeamActiveRoles,
  canAssignMemberSlot,
  syncLocalRoleFromMembers,
  replaceMembersFromNetwork,
  getRoleHumanController,
  getAvailableRolesForTeam
} from './shared.js';
import { sendNetMessage } from './transport.js';
import { updateLobbyUI, updatePingUI } from './lobby_ui.js';
import { sendSyncStateToLateJoiner } from './handlers_game.js';
import { closeMultiplayerSession } from './session.js';

export function broadcastToast(html, duration = 4000) {
  ctx.api.showToast(html, duration);
  if (mp.enabled && mp.isHost) {
    sendNetMessage({ type: 'MP_TOAST', html, duration });
  }
}

export function broadcastLobbyState() {
  resolveTeamActiveRoles('ally');
  resolveTeamActiveRoles('enemy');
  syncLocalRoleFromMembers();
  sendNetMessage({
    type: 'MP_LOBBY_STATE',
    lobbyMode: mp.lobbyMode || 'multiplayer',
    lobbyVanilla: !!mp.lobbyVanilla,
    lobbyAiDifficulty: mp.lobbyAiDifficulty || state.aiDifficulty || 'normal',
    mapId: state.mapId,
    members: mp.members
  });
  updateLobbyUI(mp.isHost ? 'Salon actif (Hôte)' : undefined);
  if (state.phase === 'play') ctx.api.updateRosterHUD();
}

export function selectMultiplayerSlot(team, slot) {
  if (!mp.enabled) return;
  if (!mp.isHost) {
    sendNetMessage({ type: 'MP_SLOT_REQ', peerId: mp.myPeerId, team, slot });
    return;
  }
  const check = canAssignMemberSlot(mp.myPeerId, team, slot);
  if (!check.ok) {
    ctx.api.showToast(`⛔ <strong>${escapeHtml(check.reason)}</strong>`, 2800);
    return;
  }
  const me = mp.members.find((m) => m.peerId === mp.myPeerId);
  if (me) {
    me.team = team;
    me.slot = slot;
    me.activeRole = slot === 'ALL' ? me.activeRole || 'G' : slot;
    broadcastLobbyState();
  }
}

export function removeMpMember(peerId) {
  if (!peerId || peerId === mp.myPeerId) return;
  const prevLen = mp.members.length;
  const removed = mp.members.find((m) => m.peerId === peerId);
  mp.members = mp.members.filter((m) => m.peerId !== peerId);
  delete mp.remoteInputs[peerId];
  if (mp.memberLastHeard) delete mp.memberLastHeard[peerId];
  if (mp.members.length === prevLen) return;

  resolveTeamActiveRoles('ally');
  resolveTeamActiveRoles('enemy');
  broadcastLobbyState();
  ctx.api.updateRosterHUD();

  if (removed) {
    broadcastToast(`🔌 <strong>${escapeHtml(removed.name)}</strong> a quitté le salon (IA reprend le poste).`, 3000);
  }
  if (mp.isHost && state.phase === 'prep') {
    ctx.api.maybeStartRoundFromPrep();
  }
}

function findDefaultJoinAssignment(peerId) {
  const allyCount = mp.members.filter((m) => m.peerId !== peerId && m.team === 'ally').length;
  const enemyCount = mp.members.filter((m) => m.peerId !== peerId && m.team === 'enemy').length;
  const orderedTeams = enemyCount < allyCount ? ['enemy', 'ally'] : ['ally', 'enemy'];
  for (const t of orderedTeams) {
    for (const slot of ['ALL', 'G', 'C', 'D']) {
      if (canAssignMemberSlot(peerId, t, slot).ok) return { team: t, slot };
    }
  }
  return null;
}

function dropStaleJoinConns(peerId, sourceConn) {
  if (!sourceConn) return;
  sourceConn._memberPeerId = peerId;
  const staleConns = mp.connections.filter((c) => c !== sourceConn && c._memberPeerId === peerId);
  if (staleConns.length === 0) return;
  mp.connections = mp.connections.filter((c) => c === sourceConn || c._memberPeerId !== peerId);
  for (let i = 0; i < staleConns.length; i++) {
    const c = staleConns[i];
    if (c) clearConnIceTimer(c);
    tryNetOp(() => {
      if (c && c.open) c.close();
    });
  }
}

function handleJoinReqMsg(msg, sourceConn) {
  if (!mp.isHost) return;
  dropStaleJoinConns(msg.peerId, sourceConn);
  let existing = mp.members.find((m) => m.peerId === msg.peerId);
  if (mp.remoteInputs) delete mp.remoteInputs[msg.peerId];
  if (!existing) {
    const assignment = findDefaultJoinAssignment(msg.peerId);
    if (!assignment) {
      sendNetMessage(
        { type: 'MP_JOIN_DENIED', peerId: msg.peerId, reason: 'Ce salon est complet (6/6 joueuses humaines).' },
        sourceConn
      );
      return;
    }
    existing = {
      peerId: msg.peerId,
      name: (msg.name || 'Joueuse').slice(0, 24),
      team: assignment.team,
      slot: assignment.slot,
      activeRole: assignment.slot === 'ALL' ? 'G' : assignment.slot,
      prepReady: false
    };
    mp.members.push(existing);
  } else if (msg.name) {
    existing.name = String(msg.name).slice(0, 24);
  }
  resolveTeamActiveRoles('ally');
  resolveTeamActiveRoles('enemy');
  broadcastLobbyState();
  if (state.phase !== 'prep' && state.phase !== 'play') return;
  if (!mp._lateSyncAt) mp._lateSyncAt = {};
  const syncKey = `${msg.peerId}_${state.phase}_${state.round}`;
  const nowSync = performance.now();
  if (!mp._lateSyncAt[syncKey] || nowSync - mp._lateSyncAt[syncKey] > 2500) {
    mp._lateSyncAt[syncKey] = nowSync;
    sendSyncStateToLateJoiner(sourceConn, msg.peerId);
  }
}

function handlePingMsg(msg, sourceConn) {
  if (typeof msg.t !== 'number') return;
  sendNetMessage(
    { type: 'MP_PONG', targetPeerId: msg.peerId || msg._sender, t: msg.t },
    sourceConn || null
  );
}

function handlePongMsg(msg) {
  if (msg.targetPeerId !== mp.myPeerId || typeof msg.t !== 'number') return;
  mp.pingMs = Math.max(1, Math.round(performance.now() - msg.t));
  updatePingUI();
}

function handleJoinDeniedMsg(msg) {
  if (msg.peerId !== mp.myPeerId) return;
  closeMultiplayerSession(false);
  updateLobbyUI(`❌ ${msg.reason || 'Salon complet'}`);
  ctx.api.showToast(`⛔ <strong>${escapeHtml(msg.reason || 'Impossible de rejoindre le salon.')}</strong>`, 4000);
}

function handleLeaveMsg(msg) {
  if (mp.isHost) {
    removeMpMember(msg.peerId);
    return;
  }
  if (!msg.isHost) return;
  const closedCode = mp.roomCode;
  const inMpModal = ctx.api.getVisibleModalId() === 'mp-modal';
  closeMultiplayerSession(false);
  if (state.phase !== 'menu') {
    ctx.api.resetMatchStateToMenu();
    ctx.api.showOnlyModal(inMpModal ? 'mp-modal' : 'welcome-modal');
  }
  updateLobbyUI(`🔌 Salon ${closedCode} fermé par l'Hôte`);
  ctx.api.showToast(`⚠️ <strong>L'Hôte a fermé le salon ${escapeHtml(closedCode)}.</strong>`, 4500);
}

function handleSlotReqMsg(msg, sourceConn) {
  if (!mp.isHost) return;
  const member = mp.members.find((m) => m.peerId === msg.peerId);
  if (!member) return;
  const check = canAssignMemberSlot(msg.peerId, msg.team, msg.slot);
  if (!check.ok) {
    sendNetMessage({ type: 'MP_SLOT_DENIED', peerId: msg.peerId, reason: check.reason }, sourceConn);
    return;
  }
  member.team = msg.team;
  member.slot = msg.slot;
  member.activeRole = msg.slot === 'ALL' ? member.activeRole || 'G' : msg.slot;
  resolveTeamActiveRoles('ally');
  resolveTeamActiveRoles('enemy');
  broadcastLobbyState();
}

function handleSlotDeniedMsg(msg) {
  if (msg.peerId !== mp.myPeerId) return;
  ctx.api.showToast(`⛔ <strong>${escapeHtml(msg.reason || 'Poste déjà occupé.')}</strong>`, 2800);
  updateLobbyUI();
}

function handleLobbyStateMsg(msg) {
  if (mp.joinTimeoutId) {
    clearTimeout(mp.joinTimeoutId);
    mp.joinTimeoutId = null;
  }
  mp.joinedAcked = true;
  if (msg.lobbyMode === 'practice' || msg.lobbyMode === 'multiplayer') {
    ctx.api.setMpLobbyMode(msg.lobbyMode, false);
  }
  if (typeof msg.lobbyVanilla === 'boolean') {
    ctx.api.setMpLobbyVanilla?.(!!msg.lobbyVanilla, false);
  }
  if (msg.lobbyAiDifficulty === 'hard' || msg.lobbyAiDifficulty === 'normal') {
    ctx.api.setMpLobbyAiDifficulty?.(msg.lobbyAiDifficulty, false);
  }
  syncMapFromNetwork(msg.mapId);
  mp.members = (msg.members || []).map((m) => Object.assign({}, m));
  syncLocalRoleFromMembers();
  updateLobbyUI(mp.isHost ? 'Salon actif (Hôte)' : `Connecté au salon ${mp.roomCode}`);
  if (state.phase === 'play') ctx.api.updateRosterHUD();
}

function handleRolesSyncMsg(msg) {
  if (!replaceMembersFromNetwork(msg.members)) return;
  ctx.api.updateRosterHUD();
}

function handleRoleDeniedMsg(msg) {
  if (msg.peerId !== mp.myPeerId) return;
  const safeRole =
    msg.fallbackRole && !getRoleHumanController(state.myTeam, msg.fallbackRole)
      ? msg.fallbackRole
      : getAvailableRolesForTeam(state.myTeam)[0];
  if (safeRole) {
    state.controlledRole = safeRole;
    const me = mp.members.find((m) => m.peerId === mp.myPeerId);
    if (me && me.slot === 'ALL') me.activeRole = safeRole;
  }
  ctx.api.showToast(
    `⛔ <strong>Joueuse ${msg.blockedRole}</strong> est déjà contrôlée par <strong>${escapeHtml(msg.ownerName || 'une autre joueuse')}</strong> !`,
    2200
  );
  ctx.api.updateRosterHUD();
}

function handleToastMsg(msg) {
  if (!mp.isHost) ctx.api.showToast(msg.html, msg.duration);
}

export const LOBBY_MESSAGE_HANDLERS = {
  MP_PING: handlePingMsg,
  MP_PONG: handlePongMsg,
  MP_JOIN_REQ: handleJoinReqMsg,
  MP_JOIN_DENIED: handleJoinDeniedMsg,
  MP_LEAVE: handleLeaveMsg,
  MP_SLOT_REQ: handleSlotReqMsg,
  MP_SLOT_DENIED: handleSlotDeniedMsg,
  MP_LOBBY_STATE: handleLobbyStateMsg,
  MP_ROLES_SYNC: handleRolesSyncMsg,
  MP_ROLE_DENIED: handleRoleDeniedMsg,
  MP_TOAST: handleToastMsg
};
