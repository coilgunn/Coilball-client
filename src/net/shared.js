import { createDefaultTeamMeta, state, mp, ctx } from '../state.js';

export const Peer = ctx.Peer || globalThis.Peer;

export const NET_MAGIC_0 = 0xCB;
export const NET_TYPE_PLAYER_INPUT = 1;
export const NET_TYPE_WORLD_STATE = 2;
export const MP_ROLES = ['G', 'C', 'D'];
export const MP_PLAYER_IDS = ['ally_G', 'ally_C', 'ally_D', 'enemy_G', 'enemy_C', 'enemy_D'];
export const MP_PLAYER_STATES = ['standing', 'grounded', 'eliminated'];
export const MP_BALL_STATES = ['ground', 'free', 'carried', 'scored', 'respawning'];
export const MP_COLORS = ['blue', 'red', 'green', 'yellow', 'gold', 'purple', 'white', 'neutral'];

export const MP_WS_SERVERS = {
  production: 'wss://symphonia.tail69ad79.ts.net',
  local: 'ws://localhost:3000'
};

export const NO_RELAY_MSG_TYPES = new Set([
  'MP_PING',
  'MP_PRACTICE_ACTION',
  'MP_ULT_TRIGGER',
  'MP_TOOL_DEPLOY',
  'MP_SLIDE_PATCH',
  'MP_BALL_PASS',
  'MP_PLAYER_JUMP'
]);

/** Mutable module-level state shared across net submodules. */
export const netShared = {
  binMsgSeq: (Math.random() * 0x7fffffff) >>> 0,
  messageHandlers: null
};

/** Run a best-effort side effect, returning fallback if it throws. */
export function tryNetOp(fn, fallback = undefined) {
  try {
    return fn();
  } catch (err) {
    return err ? fallback : fallback;
  }
}

export function clearConnIceTimer(conn) {
  if (!conn || !conn._iceDropTimer) return;
  clearTimeout(conn._iceDropTimer);
  conn._iceDropTimer = null;
}

export function getMpWsServerUrl() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('p2p') === '1') return null;
    const custom = params.get('server');
    if (custom) return custom;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return MP_WS_SERVERS.local;
  } catch (err) {
    return err ? MP_WS_SERVERS.production : MP_WS_SERVERS.production;
  }
  return MP_WS_SERVERS.production;
}

export function cloneTeamMeta(rawTeam, teamKey) {
  const defaults = createDefaultTeamMeta(!!state.vanillaMode);
  const base = defaults[teamKey === 'enemy' ? 'enemy' : 'ally'];
  if (!rawTeam || typeof rawTeam !== 'object') return base;
  const merged = Object.assign({}, base, rawTeam);
  merged.dossardStock = Object.assign({}, base.dossardStock, rawTeam.dossardStock || {});
  merged.extraDossardBought = Object.assign({}, base.extraDossardBought, rawTeam.extraDossardBought || {});
  merged.prepColors = Object.assign({}, base.prepColors, rawTeam.prepColors || {});
  merged.hasNotebook = rawTeam.hasNotebook === undefined ? base.hasNotebook : !!rawTeam.hasNotebook;
  merged.teamDashPlus = !!rawTeam.teamDashPlus;
  merged.teamJump = !!rawTeam.teamJump;
  merged.powers = {
    G: Object.assign({}, base.powers.G, (rawTeam.powers && rawTeam.powers.G) || {}),
    C: Object.assign({}, base.powers.C, (rawTeam.powers && rawTeam.powers.C) || {}),
    D: Object.assign({}, base.powers.D, (rawTeam.powers && rawTeam.powers.D) || {})
  };
  MP_ROLES.forEach((r) => {
    const rawP = rawTeam.powers && rawTeam.powers[r];
    if (rawP && rawP.throwBall !== undefined) {
      merged.powers[r].throwBall = !!rawP.throwBall;
    }
  });
  return merged;
}

export function cloneTeamsMeta(rawTeams) {
  return {
    ally: cloneTeamMeta(rawTeams && rawTeams.ally, 'ally'),
    enemy: cloneTeamMeta(rawTeams && rawTeams.enemy, 'enemy')
  };
}

export function syncMapFromNetwork(mapId) {
  const maps = ctx.world.MONTREAL_MAPS || {};
  if (mapId && maps[mapId] && mapId !== state.mapId) {
    ctx.api.selectArenaMap(mapId, false, { force: true, fromNetwork: true });
  }
}

export function getMemberControlledRole(member) {
  if (!member) return null;
  if (member.slot && member.slot !== 'ALL') return member.slot;
  return MP_ROLES.includes(member.activeRole) ? member.activeRole : null;
}

function findRemoteInputController(team, role, excludePeerId) {
  if (!mp.isHost || state.phase !== 'play') return null;
  const now = performance.now();
  for (const [pid, inp] of Object.entries(mp.remoteInputs)) {
    if (pid === excludePeerId || !inp) continue;
    if (now - (inp.lastSeen || 0) < 5000 && inp.team === team && inp.role === role) {
      return (
        mp.members.find((m) => m.peerId === pid) || {
          peerId: pid,
          name: 'Joueuse distante',
          team,
          slot: role,
          activeRole: role
        }
      );
    }
  }
  return null;
}

export function getRoleHumanController(team, role, excludePeerId = mp.myPeerId) {
  if (!mp.enabled) return null;
  const direct = mp.members.find(
    (m) => m.peerId !== excludePeerId && m.team === team && getMemberControlledRole(m) === role
  );
  if (direct) return direct;

  // Sécurité supplémentaire côté Hôte en jeu : vérifier les paquets d'entrée actifs récents
  const remoteMatch = findRemoteInputController(team, role, excludePeerId);
  if (remoteMatch) return remoteMatch;

  // Et si on exclut un client distant, vérifier aussi la joueuse locale de l'Hôte
  if (
    excludePeerId !== mp.myPeerId &&
    state.myTeam === team &&
    state.controlledRole === role &&
    (state.phase === 'play' || mp.members.some((m) => m.peerId === mp.myPeerId))
  ) {
    return (
      mp.members.find((m) => m.peerId === mp.myPeerId) || {
        peerId: mp.myPeerId,
        name: mp.myName || 'Hôte',
        team,
        slot: state.myLockedRole || 'ALL',
        activeRole: role
      }
    );
  }
  return null;
}

export function getAvailableRolesForTeam(team, excludePeerId = mp.myPeerId) {
  return MP_ROLES.filter((r) => !getRoleHumanController(team, r, excludePeerId));
}

export function resolveTeamActiveRoles(team) {
  const teamMembers = mp.members.filter((m) => m.team === team);
  const taken = new Set();

  // 1. Les rôles fixes (G/C/D) ont toujours priorité absolue sur leur poste
  teamMembers.forEach((m) => {
    if (m.slot && m.slot !== 'ALL') {
      m.activeRole = m.slot;
      taken.add(m.slot);
    }
  });

  // 2. Attribuer aux Capitaines ('ALL') un rôle non occupé par un autre humain
  teamMembers.forEach((m) => {
    if (!m.slot || m.slot === 'ALL') {
      const cur = m.activeRole;
      if (MP_ROLES.includes(cur) && !taken.has(cur)) {
        taken.add(cur);
      } else {
        const fallback = MP_ROLES.find((r) => !taken.has(r)) || 'G';
        m.activeRole = fallback;
        taken.add(fallback);
      }
    }
  });
}

export function canAssignMemberSlot(peerId, team, slot) {
  if (!['ally', 'enemy'].includes(team)) return { ok: false, reason: 'Équipe invalide.' };
  if (!['ALL', 'G', 'C', 'D'].includes(slot)) return { ok: false, reason: 'Poste invalide.' };

  const others = mp.members.filter((m) => m.team === team && m.peerId !== peerId);
  if (others.length >= 3) {
    return { ok: false, reason: 'Cette équipe compte déjà 3 humains (complet 3/3).' };
  }
  if (slot === 'ALL') {
    const cap = others.find((m) => m.slot === 'ALL');
    if (cap) {
      return { ok: false, reason: `Le poste Capitaine est déjà pris par ${cap.name}.` };
    }
    return { ok: true };
  }
  const fixedOwner = others.find((m) => m.slot === slot);
  if (fixedOwner) {
    return { ok: false, reason: `La joueuse ${slot} est déjà contrôlée par ${fixedOwner.name}.` };
  }
  return { ok: true };
}

export function syncLocalRoleFromMembers() {
  const me = mp.members.find((m) => m.peerId === mp.myPeerId);
  if (!me) return;
  state.myTeam = me.team;
  state.myLockedRole = me.slot === 'ALL' ? null : me.slot;
  if (state.myLockedRole) {
    state.controlledRole = state.myLockedRole;
  } else if (getRoleHumanController(state.myTeam, state.controlledRole)) {
    const nextFree = me.activeRole && !getRoleHumanController(state.myTeam, me.activeRole)
      ? me.activeRole
      : getAvailableRolesForTeam(state.myTeam)[0];
    if (nextFree) state.controlledRole = nextFree;
  }
}

export function replaceMembersFromNetwork(members) {
  if (!Array.isArray(members)) return false;
  mp.members = members.map((m) => Object.assign({}, m));
  syncLocalRoleFromMembers();
  return true;
}
