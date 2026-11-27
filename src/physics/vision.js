import { COLORS, state, mp, ctx } from '../state.js';
import { camera, players, getPlayer } from '../render3d.js';
import {
  VISION_SPEC,
  isPointInJungleBush,
  hasClearLineOfSight,
  hasAllyVisionNear,
  updateTeamVisionState,
} from '../world.js';
import { showToast, updateRosterHUD } from '../ui.js';

function doesTeamSeePlayerBack(target, observerTeam) {
  if (!target || target.tutorialHidden || target.team === observerTeam) return false;
  if (!(target.visibleTo && target.visibleTo[observerTeam])) return false;

  const inStealthBrush =
    target.state === 'standing' &&
    !!isPointInJungleBush(target.pos) &&
    !hasAllyVisionNear(target.pos, VISION_SPEC.bushSpotRange, observerTeam);
  if (inStealthBrush) return false;

  const tFwdX = Math.sin(target.facingAngle);
  const tFwdZ = Math.cos(target.facingAngle);

  for (let i = 0; i < players.length; i++) {
    const obs = players[i];
    if (obs.tutorialHidden || obs.team !== observerTeam || obs.state === 'sitting') continue;
    const toX = target.pos.x - obs.pos.x;
    const toZ = target.pos.z - obs.pos.z;
    const dist = Math.hypot(toX, toZ);
    const maxSpotDist = obs.pos.y >= 3.8 ? VISION_SPEC.canopyRange : VISION_SPEC.groundRange;
    if (dist >= maxSpotDist) continue;

    const normX = toX / Math.max(0.001, dist);
    const normZ = toZ / Math.max(0.001, dist);
    if (tFwdX * normX + tFwdZ * normZ <= 0.22) continue;

    const obsFwdX = Math.sin(obs.facingAngle);
    const obsFwdZ = Math.cos(obs.facingAngle);
    if (obsFwdX * normX + obsFwdZ * normZ <= 0.35) continue;

    if (hasClearLineOfSight(obs.pos, target.pos, false)) return true;
  }
  return false;
}

function updateEnemyBackVisibility(p, controlled) {
  const inTeamSight = !!(p.visibleTo && p.visibleTo[state.myTeam]);
  const clearFromControlled = controlled
    ? hasClearLineOfSight(controlled.pos, p.pos, false)
    : hasClearLineOfSight(camera.position, p.pos, true);

  const inStealthBrush =
    p.state === 'standing' &&
    !!isPointInJungleBush(p.pos) &&
    !hasAllyVisionNear(p.pos, VISION_SPEC.bushSpotRange, state.myTeam);

  let clearlySeen = false;
  let showBackDisc3D = false;

  if (!inStealthBrush && inTeamSight && clearFromControlled) {
    const forwardX = Math.sin(p.facingAngle);
    const forwardZ = Math.cos(p.facingAngle);
    const obsRef = state.cameraMode === 'aerial' && controlled ? controlled.pos : camera.position;
    const camToPlayerX = p.pos.x - obsRef.x;
    const camToPlayerZ = p.pos.z - obsRef.z;
    const dist = Math.hypot(camToPlayerX, camToPlayerZ);
    const normX = camToPlayerX / Math.max(0.001, dist);
    const normZ = camToPlayerZ / Math.max(0.001, dist);

    const dot = forwardX * normX + forwardZ * normZ;
    showBackDisc3D = dot > 0.05;

    const maxSpotDist = controlled && controlled.pos.y >= 3.8 ? VISION_SPEC.canopyRange : VISION_SPEC.groundRange;
    clearlySeen = dot > 0.22 && dist < maxSpotDist;
  }

  p.mesh.backDisc.visible = showBackDisc3D;

  if (clearlySeen && (!mp.enabled || mp.isHost)) {
    p.teamSeeingBack[state.myTeam] = true;
    p.revealedTo[state.myTeam] = true;
  }

  const teamSeesBack =
    !inStealthBrush && inTeamSight && (!!p.teamSeeingBack[state.myTeam] || clearlySeen);

  let hudNeedsRefresh = false;
  if (teamSeesBack !== p.currentlySeeingBack) {
    p.currentlySeeingBack = teamSeesBack;
    hudNeedsRefresh = true;
  }

  if (teamSeesBack && !p.backRevealed) {
    p.backRevealed = true;
    p.revealedTo[state.myTeam] = true;
    hudNeedsRefresh = true;
    ctx.api.playSfx?.('back_reveal');
    const cInfo = COLORS[p.color];
    if (cInfo) {
      showToast(
        `👁️ <strong>Dos de Adversaire ${p.role} découvert : ${cInfo.name} (${cInfo.symbol}) !</strong>`,
        3000
      );
    }
  } else if (teamSeesBack && !p.revealedTo[state.myTeam]) {
    p.revealedTo[state.myTeam] = true;
  }
  return hudNeedsRefresh;
}

export function updateBackVisibility() {
  updateTeamVisionState();
  let hudNeedsRefresh = false;
  const controlled = getPlayer(state.myTeam, state.controlledRole);

  players.forEach((p) => {
    if (!p.teamSeeingBack) p.teamSeeingBack = { ally: p.team === 'ally', enemy: p.team === 'enemy' };
    if (!p.revealedTo) p.revealedTo = { ally: p.team === 'ally', enemy: p.team === 'enemy' };

    if (p.tutorialHidden) {
      p.mesh.backDisc.visible = false;
      p.currentlySeeingBack = false;
      return;
    }

    if (!mp.enabled || mp.isHost) {
      p.teamSeeingBack.ally = p.team === 'ally' ? true : doesTeamSeePlayerBack(p, 'ally');
      p.teamSeeingBack.enemy = p.team === 'enemy' ? true : doesTeamSeePlayerBack(p, 'enemy');
      if (p.teamSeeingBack.ally) p.revealedTo.ally = true;
      if (p.teamSeeingBack.enemy) p.revealedTo.enemy = true;
    }

    if (p.team === state.myTeam) {
      p.mesh.backDisc.visible = true;
      p.currentlySeeingBack = true;
      return;
    }

    if (updateEnemyBackVisibility(p, controlled)) {
      hudNeedsRefresh = true;
    }
  });

  if (hudNeedsRefresh) {
    updateRosterHUD();
  }
}
