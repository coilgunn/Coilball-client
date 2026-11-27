import {
  COLORS,
  DASH_EVO_META,
  TOOL_EVO_META,
  createEmptyRolePowers,
  state,
  getTeamPE
} from '../state.js';

function createEvoPill(cls, title, text) {
  const pill = document.createElement('span');
  pill.className = cls;
  pill.title = title;
  pill.textContent = text;
  return pill;
}

function buildShopEvoTeamHeader(tc, meta) {
  const header = document.createElement('div');
  header.className = 'evo-team-title';
  const teamCoinsTxt = state.mode === 'practice' ? '∞' : getTeamPE(tc.key);
  const leftSpan = document.createElement('span');
  leftSpan.textContent = tc.title;
  const teamBonusBadges = [];
  if (!state.vanillaMode && meta && meta.teamDashPlus) {
    teamBonusBadges.push({
      cls: 'evo-slot-pill lit-dash',
      title: 'Dash + Équipe (+35% distance, +15% vitesse)',
      text: '👟 Dash+'
    });
  }
  if (meta && meta.teamJump) {
    teamBonusBadges.push({
      cls: 'evo-slot-pill lit-base',
      title: 'Saut Équipe débloqué [Espace]',
      text: '🦘 Saut'
    });
  }
  if (teamBonusBadges.length > 0) {
    const bonusWrap = document.createElement('span');
    bonusWrap.style.cssText = 'display:inline-flex; gap:4px; margin-left:4px;';
    teamBonusBadges.forEach((b) => {
      bonusWrap.appendChild(createEvoPill(b.cls, b.title, b.text));
    });
    leftSpan.append(' ', bonusWrap);
  }
  const coinsSpan = document.createElement('span');
  coinsSpan.style.cssText = 'font-size:0.68rem; color:#94a3b8; font-weight:700;';
  coinsSpan.textContent = `${teamCoinsTxt} 🪙 PO`;
  header.append(leftSpan, coinsSpan);
  return header;
}

function buildShopEvoRoleRow(role, meta, tc, myTeamKey) {
  const pwr = (meta && meta.powers && meta.powers[role]) || createEmptyRolePowers(state.vanillaMode);
  const colKey = meta && meta.prepColors ? meta.prepColors[role] : 'blue';
  const colSym = tc.showColor && COLORS[colKey] ? COLORS[colKey].symbol : '👤';

  const row = document.createElement('div');
  row.className = 'evo-role-row';
  const roleId = document.createElement('span');
  roleId.className = 'evo-role-id';
  roleId.textContent = `${colSym} ${tc.key === myTeamKey ? role : 'Adv ' + role}`;
  const slotsWrap = document.createElement('div');
  slotsWrap.className = 'evo-slots-wrap';

  if (state.vanillaMode) {
    slotsWrap.appendChild(
      pwr.throwBall
        ? createEvoPill('evo-slot-pill lit-base', 'Passe / Tir libre débloqué [E]', '🎯 Passe')
        : createEvoPill('evo-slot-pill', 'Passe verrouillée', 'Passe —')
    );
  } else {
    slotsWrap.appendChild(
      pwr.ultEvo
        ? createEvoPill('evo-slot-pill lit-ult', 'Ultimate Évolué (persiste tous éléments)', '🌟 Ult')
        : createEvoPill('evo-slot-pill', 'Ultimate standard', 'Ult —')
    );
    const dashMeta = pwr.dashEvo ? DASH_EVO_META[pwr.dashEvo] : null;
    slotsWrap.appendChild(
      dashMeta
        ? createEvoPill('evo-slot-pill lit-dash', dashMeta.desc, dashMeta.shortLabel)
        : createEvoPill('evo-slot-pill', 'Dash standard', 'Dash —')
    );
    const toolMeta = pwr.toolEvo ? TOOL_EVO_META[pwr.toolEvo] : null;
    slotsWrap.appendChild(
      toolMeta
        ? createEvoPill('evo-slot-pill lit-tool', toolMeta.desc, toolMeta.shortLabel)
        : createEvoPill('evo-slot-pill', 'Aucun outil', 'Outil —')
    );
  }
  if (pwr.standUp) slotsWrap.appendChild(createEvoPill('evo-slot-pill lit-base', 'Se relever [E]', '⚡'));
  row.append(roleId, slotsWrap);
  return row;
}

export function renderShopEvoStatusBar() {
  const bar = document.getElementById('shop-evo-status-bar');
  if (!bar) return;
  bar.replaceChildren();

  const myTeamKey = state.myTeam;
  const oppTeamKey = myTeamKey === 'ally' ? 'enemy' : 'ally';
  const teamConfigs = [
    { key: myTeamKey, title: `Votre équipe (${myTeamKey === 'ally' ? 'Or' : 'Violette'})`, showColor: true },
    { key: oppTeamKey, title: `Adversaires (${oppTeamKey === 'ally' ? 'Or' : 'Violette'})`, showColor: false }
  ];

  teamConfigs.forEach((tc) => {
    const meta = state.teams[tc.key];
    const panel = document.createElement('div');
    panel.className = `evo-team-panel ${tc.key}`;
    panel.appendChild(buildShopEvoTeamHeader(tc, meta));
    ['G', 'C', 'D'].forEach((role) => {
      panel.appendChild(buildShopEvoRoleRow(role, meta, tc, myTeamKey));
    });
    bar.appendChild(panel);
  });
}
