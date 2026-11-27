import {
  COLORS,
  INDIVIDUAL_POWERS,
  TUTORIAL_TOTAL_STEPS,
  hasRoleEvolutionItem,
  mp,
  state,
  ctx
} from '../state.js';
import { getPlayer } from '../render3d.js';
import { isPointInJungleBush } from '../world.js';
import { getUltimateMeta, isUltimateUnlocked, updateUltHudWidget } from '../ultimates.js';
import { getRoleHumanController } from '../net.js';
import { uiState } from './shared.js';
import { updateControlsHelpForCameraMode } from './controls_help.js';

const STEALTH_EYE_PATHS = [
  'M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.73-2.06 1.98-3.87 3.6-5.27',
  'M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.06 11.06 0 0 1-2.16 3.19',
  'M14.12 14.12a3 3 0 1 1-4.24-4.24'
];

const ROLE_POS_LABELS = { G: 'Gauche (G)', C: 'Centre (C)', D: 'Droit (D)' };

export function createStealthBadgeEl() {
  const badge = document.createElement('span');
  badge.className = 'stealth-status-badge';
  badge.title = 'Cachée dans un buisson';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const attrs = {
    width: '11', height: '11', viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round',
    'stroke-linejoin': 'round', 'aria-hidden': 'true'
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const d of STEALTH_EYE_PATHS) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '2');
  line.setAttribute('y1', '2');
  line.setAttribute('x2', '22');
  line.setAttribute('y2', '22');
  svg.appendChild(line);
  badge.appendChild(svg);
  return badge;
}

export function getPowerIconsText(teamKey, role) {
  const teamMeta = state.teams && state.teams[teamKey];
  const pwr = (teamMeta && teamMeta.powers && teamMeta.powers[role]) || {};
  let icons = '';
  if (state.vanillaMode) {
    if (pwr.throwBall) icons += '🎯';
    if (pwr.standUp) icons += '⚡';
    if (teamMeta && teamMeta.teamJump) icons += '🦘';
  } else {
    if (pwr.ultEvo) icons += '🌟';
    if (pwr.dashEvo === 'bounce') icons += '🌀';
    else if (pwr.dashEvo === 'slide') icons += '🧊';
    else if (pwr.dashEvo === 'boomerang') icons += '🪃';
    if (pwr.toolEvo === 'beacon') icons += '📡';
    else if (pwr.toolEvo === 'wall') icons += '🧱';
    else if (pwr.toolEvo === 'pad') icons += '🚀';
    if (pwr.standUp) icons += '⚡';
    if (teamMeta && teamMeta.teamDashPlus) icons += '👟';
    if (teamMeta && teamMeta.teamJump) icons += '🦘';
  }
  return icons;
}

function isPauseUIActive() {
  if (state.phase !== 'play') return false;
  const pauseEl = document.getElementById('pause-modal');
  const optsEl = document.getElementById('options-modal');
  return !!(
    (pauseEl && !pauseEl.classList.contains('hidden')) ||
    (optsEl && !optsEl.classList.contains('hidden'))
  );
}

export function updateTopHUD() {
  document.getElementById('ally-pv').textContent = state.allyPV;
  document.getElementById('ally-pe').textContent = state.mode === 'practice' ? '∞' : state.allyPE;
  document.getElementById('enemy-pv').textContent = state.enemyPV;
  document.getElementById('enemy-pe').textContent = state.mode === 'practice' ? '∞' : state.enemyPE;

  const tagAlly = document.getElementById('hud-tag-ally');
  const tagEnemy = document.getElementById('hud-tag-enemy');
  if (tagAlly && tagEnemy) {
    tagAlly.textContent = state.myTeam === 'ally' ? 'Équipe Or (Vous)' : 'Équipe Or';
    tagEnemy.textContent = state.myTeam === 'enemy' ? 'Équipe Violette (Vous)' : 'Équipe Violette';
  }

  document.getElementById('round-label').textContent =
    state.mode === 'tutorial'
      ? `TUTORIEL (${Math.min(TUTORIAL_TOTAL_STEPS, Math.max(1, state.tutorialStep || 1))}/${TUTORIAL_TOTAL_STEPS})`
      : state.mode === 'practice'
      ? mp.enabled
        ? `PRATIQUE MULTI • SALON ${mp.roomCode}`
        : 'UN TOUR POUR RIEN (PRATIQUE)'
      : mp.enabled
      ? `SALON ${mp.roomCode} • RONDE ${state.round}`
      : `RONDE ${state.round}`;

  const isPaused = isPauseUIActive();
  document.getElementById('phase-label').textContent = isPaused
    ? mp.enabled
      ? '⏸️ Pause • Le jeu continue'
      : '⏸️ Pause • Le jeu est arrêté'
    : state.phase === 'prep'
    ? 'Préparation'
    : 'Exécution';

  const myMeta = state.teams[state.myTeam];
  const bounties = [];
  if (myMeta.activeBountyPE) bounties.push('Pari +3 🪙 PO');
  if (myMeta.activeBountyPV) bounties.push('Pari +2 pts');
  document.getElementById('bounty-status').textContent =
    state.mode === 'practice'
      ? 'Mode Pratique : Sans IA • [B] Magasin (🪙 ∞) • [Échap] Menu'
      : state.mode === 'tutorial'
      ? '🏆 Ballons → Cerceau (Pts) • 💥 Interceptions → 🪙 Pièces (Améliorations)'
      : bounties.length > 0
      ? `Actif : ${bounties.join(', ')}`
      : 'Objectif : 7 pts (écart de 2)';

  const quickShopBtn = document.getElementById('btn-quick-practice-shop');
  if (quickShopBtn) {
    quickShopBtn.classList.toggle('hidden', !(state.mode === 'practice' && state.phase === 'play'));
  }

  const endRoundBtn = document.getElementById('btn-end-round');
  if (endRoundBtn) {
    endRoundBtn.classList.toggle('hidden', state.mode === 'tutorial' || state.mode === 'practice');
  }
}

function createPowerBadgesSpan(pwr, fontSize) {
  const matched = INDIVIDUAL_POWERS.filter(
    (pw) =>
      (!pw.vanillaOnly || state.vanillaMode) &&
      (!state.vanillaMode || pw.key === 'throwBall' || pw.key === 'standUp') &&
      hasRoleEvolutionItem(pwr, pw)
  );
  if (matched.length === 0) return null;
  const wrap = document.createElement('span');
  wrap.style.fontSize = fontSize;
  for (const pw of matched) {
    const icon = document.createElement('span');
    icon.title = pw.shortLabel;
    icon.textContent = pw.icon;
    wrap.appendChild(icon);
  }
  return wrap;
}

function buildAllyRosterRow(role, idx, myTeamKey, myMeta) {
  const p = getPlayer(myTeamKey, role);
  if (!p || p.tutorialHidden) return null;
  const c = COLORS[p.color];
  const humanOwner = getRoleHumanController(myTeamKey, role);
  const isMine = state.controlledRole === role && !humanOwner;
  const row = document.createElement('div');
  row.className = `player-row ${isMine ? 'active-controlled' : ''} ${humanOwner ? 'locked-by-human' : ''} ${p.state === 'sitting' ? 'sitting' : ''}`;
  row.onclick = () => ctx.api.selectControlledRole?.(role);

  let status = 'Debout';
  if (p.state === 'sitting') status = '🪑 Assise';
  else if (p.state === 'rule1') status = '⚡ Règle 1';
  else if (p.carryingBall) status = '⚽ Ballon';

  const roleKeyDiv = document.createElement('div');
  roleKeyDiv.className = 'player-role-key';
  const hint = document.createElement('span');
  hint.className = 'key-hint';
  hint.textContent = humanOwner ? '🔒' : String(idx + 1);
  const posLbl = document.createElement('span');
  posLbl.textContent = ROLE_POS_LABELS[role] || role;
  roleKeyDiv.append(hint, posLbl);

  const iconsDiv = document.createElement('div');
  iconsDiv.className = 'player-status-icons';
  if (humanOwner) {
    const ownerSpan = document.createElement('span');
    ownerSpan.style.cssText = 'font-size:0.72rem; color:#38bdf8; font-weight:800;';
    ownerSpan.textContent = `👤 ${humanOwner.name}`;
    iconsDiv.appendChild(ownerSpan);
  }
  if (p.state === 'standing' && isPointInJungleBush(p.pos)) iconsDiv.appendChild(createStealthBadgeEl());
  const pwrWrap = createPowerBadgesSpan((myMeta.powers && myMeta.powers[role]) || {}, '0.78rem');
  if (pwrWrap) iconsDiv.appendChild(pwrWrap);
  if (isUltimateUnlocked()) {
    const ultMeta = getUltimateMeta(p.color, p);
    const ultBadge = document.createElement('span');
    ultBadge.className = p.ultUsed ? 'ult-mini-badge used' : 'ult-mini-badge ready';
    ultBadge.title = p.ultUsed ? `Ultimate utilisé (${ultMeta.name})` : `Ultimate prêt : ${ultMeta.name} ([R] puis Clic Gauche)`;
    ultBadge.textContent = p.ultUsed ? '✔ Ult' : `${ultMeta.icon} R`;
    iconsDiv.appendChild(ultBadge);
  }
  const statusSpan = document.createElement('span');
  statusSpan.textContent = status;
  const colorBadge = document.createElement('span');
  colorBadge.className = `color-badge ${c.id}`;
  colorBadge.textContent = `${c.name} (${c.symbol})`;
  iconsDiv.append(statusSpan, colorBadge);

  row.append(roleKeyDiv, iconsDiv);
  return row;
}

function buildEnemyRosterRow(role, oppTeamKey) {
  const p = getPlayer(oppTeamKey, role);
  if (!p || p.tutorialHidden) return null;
  const c = COLORS[p.color];
  const inSight = !!(p.visibleTo && p.visibleTo[state.myTeam]);
  const isKnown = p.currentlySeeingBack || p.backRevealed || p.state === 'sitting' || p.state === 'rule1';

  const row = document.createElement('div');
  row.className = `player-row ${p.state === 'sitting' ? 'sitting' : ''}`;
  let status = !inSight ? '🌫️ Hors vue' : p.currentlySeeingBack ? '👁️ Dos visible' : '👁️ En vue';
  if (p.state === 'sitting') status = '🪑 Assise';
  else if (p.state === 'rule1') status = '⚡ Règle 1';
  else if (inSight && p.carryingBall) status = '⚽ Ballon';

  const roleKeyDiv = document.createElement('div');
  roleKeyDiv.className = 'player-role-key';
  const posLbl = document.createElement('span');
  posLbl.textContent = `Adv. ${ROLE_POS_LABELS[role] || role}`;
  roleKeyDiv.appendChild(posLbl);

  const iconsDiv = document.createElement('div');
  iconsDiv.className = 'player-status-icons';
  if (inSight && p.state === 'standing' && isPointInJungleBush(p.pos)) iconsDiv.appendChild(createStealthBadgeEl());
  const oppMeta = state.teams[oppTeamKey];
  const oppWrap = createPowerBadgesSpan((oppMeta && oppMeta.powers && oppMeta.powers[role]) || {}, '0.75rem');
  if (oppWrap) iconsDiv.appendChild(oppWrap);
  const statusSpan = document.createElement('span');
  statusSpan.textContent = status;
  const colorBadge = document.createElement('span');
  colorBadge.className = isKnown ? `color-badge ${c.id}` : 'color-badge unknown';
  colorBadge.textContent = isKnown ? `${c.name} (${c.symbol})` : 'Dos caché (?)';
  iconsDiv.append(statusSpan, colorBadge);

  row.append(roleKeyDiv, iconsDiv);
  return { row, isKnown };
}

export function updateRosterHUD() {
  const allyList = document.getElementById('ally-roster-list');
  const enemyList = document.getElementById('enemy-roster-list');
  const allyTitleEl = document.getElementById('ally-roster-title');
  if (allyTitleEl) {
    allyTitleEl.textContent =
      state.cameraMode === 'aerial'
        ? 'Vos Joueuses ([1] [2] [3])'
        : 'Vos Joueuses ([1/2/3] / Clic)';
  }
  allyList.replaceChildren();
  enemyList.replaceChildren();

  const myTeamKey = state.myTeam;
  const oppTeamKey = state.myTeam === 'ally' ? 'enemy' : 'ally';
  const myMeta = state.teams[myTeamKey];

  ['G', 'C', 'D'].forEach((role, idx) => {
    const row = buildAllyRosterRow(role, idx, myTeamKey, myMeta);
    if (row) allyList.appendChild(row);
  });

  let revealedCount = 0;
  let totalEnemies = 0;

  ['G', 'C', 'D'].forEach((role) => {
    const built = buildEnemyRosterRow(role, oppTeamKey);
    if (!built) return;
    totalEnemies++;
    if (built.isKnown) revealedCount++;
    enemyList.appendChild(built.row);
  });

  const nbBadge = document.getElementById('notebook-badge');
  if (nbBadge) {
    nbBadge.textContent = `👁️ ${revealedCount}/${totalEnemies || 3} repérés`;
  }
  updateUltHudWidget();
  if (uiState.lastControlsHelpVanilla !== !!state.vanillaMode) {
    uiState.lastControlsHelpVanilla = !!state.vanillaMode;
    updateControlsHelpForCameraMode();
  }
}
