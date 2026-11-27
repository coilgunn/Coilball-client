import { COLORS, DASH_COOLDOWN, TUTORIAL_TOTAL_STEPS, state, ctx } from '../state.js';
import {
  camera,
  dashCooldownEl,
  dashCooldownPieEl,
  dashCooldownTextEl,
  getLeafWallBadge,
  getPlayer,
  hideLeafDurationBadge,
  leafWallBadges,
  players,
  updateLeafDurationBadge,
  updateLeafWallBadgeInView
} from '../render3d.js';
import {
  VISION_SPEC,
  hasAllyVisionNear,
  hasClearLineOfSight,
  isPointInJungleBush,
  updateTeamVisionState
} from '../world.js';
import { LEAF_ULT_GROW_DELAY, LEAF_ULT_SPEED_MULT, LEAF_ULT_SPRINT_DURATION, LEAF_ULT_WALL_DURATION, activeLeafWalls } from '../ultimates.js';
import { getRoleHumanController } from '../net.js';
import {
  uiState,
  badgePos,
  dashDomCache,
  tutObjCache,
  formatActionBindingText,
  getViewportSize,
  isMenuOpen
} from './shared.js';
import { createStealthBadgeEl, getPowerIconsText } from './hud_top_roster.js';

function renderFloatingLabelDOM(lbl, data) {
  const frag = document.createDocumentFragment();
  const dot = document.createElement('span');
  dot.className = 'mini-dot';
  dot.style.background = data.dotColor;
  const sym = document.createElement('span');
  sym.textContent = data.dotSymbol;
  const main = document.createElement('span');
  main.textContent = data.mainText;
  frag.append(dot, sym, ' ', main);
  if (data.inBush) frag.append(' ', createStealthBadgeEl());
  if (data.powerIconsText) {
    const icons = document.createElement('span');
    icons.className = 'label-power-icons';
    icons.textContent = data.powerIconsText;
    frag.append(' ', icons);
  }
  lbl.replaceChildren(frag);
}

function updatePlayerLeafOrBoomerangBadge(p, controlled, showInPlay) {
  if (showInPlay && p.leafUltTimer > 0 && p.state === 'standing' && !p.carryingBall) {
    const sMult = p.leafUltSpeedMult || LEAF_ULT_SPEED_MULT;
    const sMax = p.leafUltMaxDuration || LEAF_ULT_SPRINT_DURATION;
    badgePos.x = p.pos.x;
    badgePos.y = p.pos.y + 1.55;
    badgePos.z = p.pos.z;
    updateLeafDurationBadge(
      p.mesh.leafBadge,
      badgePos,
      `🌿 x${sMult} · ${p.leafUltTimer.toFixed(1)}s`,
      p.leafUltTimer / sMax,
      p.leafUltTimer <= 0.6 ? 'expiring' : ''
    );
    return;
  }
  if (
    showInPlay &&
    controlled &&
    p === controlled &&
    p.boomerangWindow > 0 &&
    p.dashTimer <= 0 &&
    p.state === 'standing' &&
    !p.carryingBall
  ) {
    badgePos.x = p.pos.x;
    badgePos.y = p.pos.y + 1.55;
    badgePos.z = p.pos.z;
    updateLeafDurationBadge(
      p.mesh.leafBadge,
      badgePos,
      `🪃 Retour [${formatActionBindingText('dash')}] ${p.boomerangWindow.toFixed(1)}s`,
      p.boomerangWindow / 2.0,
      p.boomerangWindow <= 0.6 ? 'expiring' : 'sprouting'
    );
    return;
  }
  hideLeafDurationBadge(p.mesh.leafBadge);
}

function hidePlayerLabel(p) {
  if (p.mesh._lblDisplay !== 'none') {
    p.mesh.labelEl.style.display = 'none';
    p.mesh._lblDisplay = 'none';
  }
}

function updateSinglePlayerLabel(p, controlled, showInPlay, halfW, halfH) {
  const lbl = p.mesh.labelEl;
  if (p.tutorialHidden) {
    hidePlayerLabel(p);
    hideLeafDurationBadge(p.mesh.leafBadge);
    return;
  }
  const isMyTeam = p.team === state.myTeam;
  if (!isMyTeam) {
    const visibleToMyTeam = !!(p.visibleTo && p.visibleTo[state.myTeam]);
    const lineOfSightFromMe = controlled
      ? hasClearLineOfSight(controlled.pos, p.pos, false)
      : hasClearLineOfSight(camera.position, p.pos, true);
    const hiddenInBrush =
      p.state === 'standing' &&
      !!isPointInJungleBush(p.pos) &&
      !hasAllyVisionNear(p.pos, VISION_SPEC.bushSpotRange, state.myTeam);
    if (hiddenInBrush || !visibleToMyTeam || !lineOfSightFromMe) {
      hidePlayerLabel(p);
      hideLeafDurationBadge(p.mesh.leafBadge);
      return;
    }
  }

  updatePlayerLeafOrBoomerangBadge(p, controlled, showInPlay);
  uiState.tmpProjVec.set(p.pos.x, p.pos.y + (p.state === 'sitting' ? 2.1 : 2.95), p.pos.z);
  uiState.tmpProjVec.project(camera);
  if (uiState.tmpProjVec.z > 1) {
    hidePlayerLabel(p);
    return;
  }

  const x = Math.round((uiState.tmpProjVec.x * halfW + halfW) * 2) / 2;
  const y = Math.round((-(uiState.tmpProjVec.y * halfH) + halfH) * 2) / 2;
  if (p.mesh._lblDisplay !== 'flex') {
    lbl.style.display = 'flex';
    p.mesh._lblDisplay = 'flex';
  }
  if (p.mesh._lblLeft !== x) {
    lbl.style.left = `${x}px`;
    p.mesh._lblLeft = x;
  }
  if (p.mesh._lblTop !== y) {
    lbl.style.top = `${y}px`;
    p.mesh._lblTop = y;
  }

  const showColor = isMyTeam || p.currentlySeeingBack || p.backRevealed || p.state === 'sitting' || p.state === 'rule1';
  const cInfo = COLORS[p.color];
  const dotColor = showColor ? cInfo.css : '#64748b';
  const dotSymbol = showColor ? cInfo.symbol : '?';
  const inBush = p.state === 'standing' && !!isPointInJungleBush(p.pos);
  lbl.classList.toggle('is-ally', isMyTeam);
  lbl.classList.toggle('is-enemy', !isMyTeam);
  lbl.classList.toggle('in-bush', inBush);

  let statusTag = '';
  if (p.state === 'sitting') statusTag = ' (Assise)';
  else if (p.state === 'rule1') statusTag = ' ⚡ RÈGLE 1';
  else if (p.isAirborne || p.isLaunching) statusTag = p.carryingBall ? ' 🚀⚽' : ' 🚀';
  else if (p.carryingBall) statusTag = ' ⚽';

  const powerIconsText = getPowerIconsText(p.team, p.role);
  const allyHuman = isMyTeam ? getRoleHumanController(p.team, p.role) : null;
  const roleOwnerTag = allyHuman ? ` • 👤 ${allyHuman.name}` : '';
  const mainText = `${isMyTeam ? p.role + roleOwnerTag : 'Adv ' + p.role}${statusTag}`;
  const nextLblKey = `${dotColor}|${dotSymbol}|${mainText}|${inBush ? 1 : 0}|${powerIconsText}`;
  if (p.mesh._lblHtml !== nextLblKey) {
    renderFloatingLabelDOM(lbl, { dotColor, dotSymbol, mainText, inBush, powerIconsText });
    p.mesh._lblHtml = nextLblKey;
  }
}

function updateLeafWallBadges(showInPlay) {
  let wallBadgeIdx = 0;
  if (showInPlay && activeLeafWalls.length > 0) {
    for (let w = 0; w < activeLeafWalls.length; w++) {
      const wall = activeLeafWalls[w];
      if (!wall || wall.nodes.length === 0 || wall.phase === 'sprinting') continue;
      if (wall.phase === 'germinating') {
        const rem = Math.max(0, wall.growDelayTimer);
        updateLeafWallBadgeInView(getLeafWallBadge(wallBadgeIdx++), wall, `🌱 Mur ${rem.toFixed(1)}s`, 1 - rem / LEAF_ULT_GROW_DELAY, 'sprouting');
      } else if (wall.phase === 'grown') {
        const rem = Math.max(0, wall.wallTimer);
        const maxWall = wall.wallMaxDuration || LEAF_ULT_WALL_DURATION;
        updateLeafWallBadgeInView(getLeafWallBadge(wallBadgeIdx++), wall, `🌳 Mur · ${rem.toFixed(1)}s`, rem / maxWall, rem <= 1.4 ? 'expiring' : '');
      }
    }
  }
  for (let b = wallBadgeIdx; b < leafWallBadges.length; b++) {
    hideLeafDurationBadge(leafWallBadges[b]);
  }
}

function updateDashCooldownHud(controlled, showInPlay, halfW, halfH) {
  const canShow =
    showInPlay &&
    controlled &&
    controlled.state === 'standing' &&
    !controlled.carryingBall &&
    controlled.dashCooldown > 0;
  if (!canShow) {
    if (dashDomCache.visible) {
      dashCooldownEl.classList.add('hidden');
      dashDomCache.visible = false;
    }
    return;
  }
  uiState.tmpProjVec.copy(controlled.pos);
  uiState.tmpProjVec.project(camera);
  if (uiState.tmpProjVec.z > 1) {
    if (dashDomCache.visible) {
      dashCooldownEl.classList.add('hidden');
      dashDomCache.visible = false;
    }
    return;
  }
  const rawX = uiState.tmpProjVec.x * halfW + halfW;
  const rawY = -(uiState.tmpProjVec.y * halfH) + halfH;
  const clampedX = Math.round(Math.max(40, Math.min(window.innerWidth - 40, rawX)) * 2) / 2;
  const clampedY = Math.round(Math.max(24, Math.min(window.innerHeight - 72, rawY)) * 2) / 2;
  const ratio = Math.max(0, Math.min(1, controlled.dashCooldown / (controlled.dashCooldownMax || DASH_COOLDOWN)));
  const deg = (ratio * 360).toFixed(1);

  if (!dashDomCache.visible) {
    dashCooldownEl.classList.remove('hidden');
    dashDomCache.visible = true;
  }
  const leftStr = `${clampedX}px`;
  const topStr = `${clampedY}px`;
  if (dashDomCache.left !== leftStr) {
    dashCooldownEl.style.left = leftStr;
    dashDomCache.left = leftStr;
  }
  if (dashDomCache.top !== topStr) {
    dashCooldownEl.style.top = topStr;
    dashDomCache.top = topStr;
  }
  const fillCol = controlled.dashIsSuper ? '#38bdf8' : '#12d612';
  const bgCol = controlled.dashIsSuper ? 'rgba(8, 47, 73, 0.82)' : 'rgba(10, 48, 16, 0.78)';
  const pieBg = `conic-gradient(${fillCol} 0deg ${deg}deg, ${bgCol} ${deg}deg 360deg)`;
  if (dashDomCache.bg !== pieBg) {
    dashCooldownPieEl.style.background = pieBg;
    dashDomCache.bg = pieBg;
  }
  const cdTxt = controlled.dashCooldown.toFixed(1);
  if (dashDomCache.text !== cdTxt) {
    dashCooldownTextEl.textContent = cdTxt;
    dashDomCache.text = cdTxt;
  }
}

function updateTutorialOverheadHud() {
  const tutOverheadEl = document.getElementById('tut-overhead-objective');
  if (!tutOverheadEl) return;
  const tutKickerEl = document.getElementById('tut-obj-kicker');
  const tutMainEl = document.getElementById('tut-obj-main');
  const canShowTutObj = state.mode === 'tutorial' && state.phase === 'play' && !isMenuOpen();
  const nextItem = canShowTutObj ? ctx.api.getNextTutorialObjectiveItem() : null;

  let show = false;
  let kickerTxt = '';
  let mainTxt = '';
  let isDone = false;
  if (nextItem) {
    show = true;
    kickerTxt = nextItem.stepTitle || 'Objectif actuel';
    mainTxt = String(nextItem.overhead || '').replace(/^🎯\s*/, '');
  } else if (canShowTutObj && state.tutorialAwaitingConfirm) {
    show = true;
    isDone = true;
    kickerTxt = state.tutorialStep < TUTORIAL_TOTAL_STEPS ? 'Étape validée' : 'Tutoriel terminé';
    mainTxt =
      state.tutorialStep < TUTORIAL_TOTAL_STEPS
        ? state.mobileMode ? 'Tapez Continuer' : '[Espace] pour continuer'
        : state.mobileMode ? 'Tapez Mode Pratique' : '[Espace] : Mode Pratique';
  }

  if (show) {
    if (!tutObjCache.visible || tutOverheadEl.classList.contains('hidden')) {
      tutOverheadEl.classList.remove('hidden');
      tutOverheadEl.style.left = '';
      tutOverheadEl.style.top = '';
      tutObjCache.visible = true;
    }
    if (tutObjCache.done !== isDone) {
      tutOverheadEl.classList.toggle('tut-obj-done', isDone);
      tutObjCache.done = isDone;
    }
    if (tutKickerEl && tutObjCache.kicker !== kickerTxt) {
      tutKickerEl.textContent = kickerTxt;
      tutObjCache.kicker = kickerTxt;
    }
    if (tutMainEl && tutObjCache.main !== mainTxt) {
      tutMainEl.textContent = mainTxt;
      tutObjCache.main = mainTxt;
    }
  } else if (tutObjCache.visible || !tutOverheadEl.classList.contains('hidden')) {
    tutOverheadEl.classList.add('hidden');
    tutObjCache.visible = false;
  }
}

export function updateFloatingLabels() {
  updateTeamVisionState();
  camera.updateMatrixWorld();
  const vp = getViewportSize();
  const halfW = vp.w / 2;
  const halfH = vp.h / 2;
  const controlled = getPlayer(state.myTeam, state.controlledRole);
  const showInPlay = state.phase === 'play' && !isMenuOpen();

  for (let i = 0; i < players.length; i++) {
    updateSinglePlayerLabel(players[i], controlled, showInPlay, halfW, halfH);
  }
  updateLeafWallBadges(showInPlay);
  updateDashCooldownHud(controlled, showInPlay, halfW, halfH);
  updateTutorialOverheadHud();
}
