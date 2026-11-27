import {
  COLOR_KEYS,
  INDIVIDUAL_POWERS,
  grantRolePowerItem,
  state,
  mp,
  getTeamPE,
  setTeamPE,
  ctx
} from '../state.js';
import {
  getPlayer,
  applyPlayerColor,
  syncPlayerPowerVisuals
} from '../render3d.js';
import { updateUltHudWidget } from '../ultimates.js';
import { sendNetMessage } from '../net.js';
import {
  updateMobileTouchHUD,
  updateTopHUD,
  updateRosterHUD
} from '../ui.js';
import {
  isShopAvailable,
  isPowerItemAllowedInCurrentMode
} from './shared.js';
import {
  maybeStartRoundFromPrep,
  updatePrepConfirmButtonUI,
  syncMyTeamPrep
} from './prep.js';
import { renderPrepColorPickers, renderShopItems } from './shop_ui.js';

export function applyTeamColorChange(teamKey, role, newColor) {
  const meta = state.teams[teamKey];
  if (!meta || !COLOR_KEYS.includes(newColor) || !['G', 'C', 'D'].includes(role)) return false;
  const oldColor = meta.prepColors[role];
  if (oldColor === newColor) return false;

  const otherRoles = ['G', 'C', 'D'].filter((r) => r !== role);
  const usedCount = otherRoles.filter((r) => meta.prepColors[r] === newColor).length;
  if (usedCount < meta.dossardStock[newColor]) {
    meta.prepColors[role] = newColor;
    return true;
  }
  const swapRole = otherRoles.find((r) => meta.prepColors[r] === newColor);
  if (swapRole) {
    meta.prepColors[swapRole] = oldColor;
    meta.prepColors[role] = newColor;
    return true;
  }
  return false;
}

export function applyTeamCollectivePurchase(teamKey, itemKey) {
  if (!isShopAvailable()) return false;
  const meta = state.teams[teamKey];
  const pe = getTeamPE(teamKey);
  const unlimited = state.mode === 'practice';
  if (!meta) return false;

  const teamItems = {
    teamDashPlus: { cost: 2, allowed: !state.vanillaMode },
    teamJump: { cost: 3, allowed: true }
  };
  const spec = teamItems[itemKey];
  if (!spec || !spec.allowed || (!unlimited && pe < spec.cost) || meta[itemKey]) return false;

  if (!unlimited) setTeamPE(teamKey, pe - spec.cost);
  meta[itemKey] = true;
  ['G', 'C', 'D'].forEach((r) => {
    const pl = getPlayer(teamKey, r);
    if (pl) syncPlayerPowerVisuals(pl, 0);
  });
  if (itemKey === 'teamJump' && teamKey === state.myTeam) updateMobileTouchHUD();
  return true;
}

function executeHostBuyPower(msg, teamKey, unlimited) {
  const def = INDIVIDUAL_POWERS.find((pw) => pw.key === msg.powerKey);
  if (
    !def ||
    !isPowerItemAllowedInCurrentMode(def) ||
    !isShopAvailable() ||
    (!unlimited && getTeamPE(teamKey) < def.cost)
  ) {
    return false;
  }
  const targetRole = ['G', 'C', 'D'].includes(msg.targetRole) ? msg.targetRole : 'G';
  const meta = state.teams[teamKey];
  if (!meta.powers[targetRole] || !grantRolePowerItem(meta.powers[targetRole], def)) return false;
  if (!unlimited) setTeamPE(teamKey, getTeamPE(teamKey) - def.cost);
  const pl = getPlayer(teamKey, targetRole);
  if (pl) syncPlayerPowerVisuals(pl, 0);
  return true;
}

function executeHostBuyDossard(msg, teamKey, unlimited) {
  const meta = state.teams[teamKey];
  const pe = getTeamPE(teamKey);
  if (
    !isShopAvailable() ||
    (!unlimited && pe < 1) ||
    !COLOR_KEYS.includes(msg.color) ||
    meta.extraDossardBought[msg.color]
  ) {
    return false;
  }
  if (!unlimited) setTeamPE(teamKey, pe - 1);
  meta.extraDossardBought[msg.color] = true;
  meta.dossardStock[msg.color] += 1;
  return true;
}

export function handleHostPrepAction(msg, sourceConn) {
  if (!mp.isHost) return;
  const member = mp.members.find((m) => m.peerId === msg.peerId);
  const teamKey = member ? member.team : msg.team;
  if (!['ally', 'enemy'].includes(teamKey)) return;

  const unlimited = state.mode === 'practice';
  let ok = true;
  if (msg.action === 'assignColor') ok = applyTeamColorChange(teamKey, msg.role, msg.newColor);
  else if (msg.action === 'buyPower') ok = executeHostBuyPower(msg, teamKey, unlimited);
  else if (msg.action === 'buyDossard') ok = executeHostBuyDossard(msg, teamKey, unlimited);
  else if (msg.action === 'buyTeamItem') ok = applyTeamCollectivePurchase(teamKey, msg.itemKey);
  else if (msg.action === 'ready') {
    if (member) member.prepReady = true;
    const teamMembers = mp.members.filter((m) => m.team === teamKey);
    state.teams[teamKey].prepReady = teamMembers.every((m) => !!m.prepReady);
  }

  if (!ok && sourceConn) {
    sendNetMessage(
      {
        type: 'MP_TOAST',
        html: "⚠️ Achat ou action impossible (pièces d'or insuffisantes ou déjà acquis).",
        duration: 2400
      },
      sourceConn
    );
  }

  if (state.mode === 'practice' && state.phase === 'play' && state.teams[teamKey]?.prepColors) {
    ['G', 'C', 'D'].forEach((role) => {
      const pl = getPlayer(teamKey, role);
      const nextCol = state.teams[teamKey].prepColors[role];
      if (pl && nextCol) applyPlayerColor(pl, nextCol);
      if (pl) syncPlayerPowerVisuals(pl, 0);
    });
    ctx.api.broadcastWorldState();
  }

  syncMyTeamPrep(teamKey);
  const prepEl = document.getElementById('prep-modal');
  if (teamKey === state.myTeam && (state.phase === 'prep' || (prepEl && !prepEl.classList.contains('hidden')))) {
    renderPrepColorPickers();
    renderShopItems();
  }
  updatePrepConfirmButtonUI();
  updateTopHUD();
  updateRosterHUD();
  updateUltHudWidget();
  if (teamKey === state.myTeam) updateMobileTouchHUD();
  maybeStartRoundFromPrep();
}
