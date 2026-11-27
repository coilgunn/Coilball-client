import { TUTORIAL_STEPS, escapeHtml, mp, state, ctx } from '../state.js';
import { getPlayer } from '../render3d.js';
import { getRoleHumanController, sendNetMessage } from '../net.js';
import { uiState } from './shared.js';
import { showToast } from './toast.js';
import { recenterMobaCamera } from './camera.js';
import { updateRosterHUD } from './hud_top_roster.js';

function notifyTutorialRoleSwitch(prevRole, role) {
  if (state.mode !== 'tutorial' || prevRole === role) return;
  if (state.tutorialStep === TUTORIAL_STEPS.MOVEMENT) {
    if (!state.tutorialChecklist.switchedRole && role !== 'G') {
      ctx.api.markTutorialCheck('switchedRole');
    } else if (state.tutorialChecklist.switchedRole && role === 'G') {
      ctx.api.markTutorialCheck('returnedToFirstRole');
    }
    return;
  }
  if (state.tutorialStep === TUTORIAL_STEPS.RULE1) {
    if (role === 'C') {
      ctx.api.markTutorialCheck('rule1Switched');
      showToast('💧 <strong>Bon élément (💧 > 🔥) !</strong> Touchez <strong>Adv C (🔥)</strong> avec <strong>Centre (C)</strong> pour libérer Gauche (G) !', 3800);
    } else if (role === 'D' && !state.tutorialChecklist.rule1Broken) {
      showToast('⚠️ <strong>Mauvais élément :</strong> Droit (D) est Feuille (🌿) et perd contre 🔥 ! Prenez <strong>Centre (C · 💧)</strong> pour débloquer la Règle 1 !', 3800);
    }
    return;
  }
  if (state.tutorialStep === TUTORIAL_STEPS.ULTIMATE) {
    ctx.api.updateTutorialSequenceHUD?.();
    if (role === 'G' && !state.tutorialChecklist.ultFireFired) {
      showToast(
        state.mobileMode
          ? '🔥 <strong>Ultimate Feu (Gauche G) :</strong> Maintenez <strong>⚡ Ult</strong> vers <strong>Adv D</strong> pour tirer le Rayon Plasma !'
          : '🔥 <strong>Ultimate Feu (Gauche G) :</strong> Appuyez sur <strong>[R]</strong> puis <strong>Clic Gauche</strong> vers <strong>Adv D</strong> !',
        4200
      );
    } else if (role === 'C' && !state.tutorialChecklist.ultWaterFired) {
      showToast(
        state.mobileMode
          ? '💧 <strong>Ultimate Eau (Centre C) :</strong> Maintenez <strong>⚡ Ult</strong> pour lancer la <strong>Vague Déferlante</strong> (repousse + bouclier Feu) !'
          : '💧 <strong>Ultimate Eau (Centre C) :</strong> Appuyez sur <strong>[R]</strong> puis <strong>Clic Gauche</strong> pour lancer la <strong>Vague Déferlante</strong> (repousse + bouclier Feu) !',
        4500
      );
    } else if (role === 'D' && !state.tutorialChecklist.ultLeafFired) {
      showToast(
        state.mobileMode
          ? '🌿 <strong>Ultimate Feuille (Droit D) :</strong> Lancez <strong>⚡ Ult</strong> puis courez : vous tracez un <strong>mur de branches</strong> !'
          : '🌿 <strong>Ultimate Feuille (Droit D) :</strong> Lancez <strong>[R] + Clic Gauche</strong> puis déplacez-vous pour tracer un <strong>mur de branches</strong> !',
        4500
      );
    }
  }
}

function syncRoleSelectionToNetwork(p) {
  if (!mp.enabled || state.phase !== 'play') return;
  if (mp.isHost) {
    sendNetMessage({ type: 'MP_ROLES_SYNC', members: mp.members });
    return;
  }
  sendNetMessage({
    type: 'MP_PLAYER_INPUT',
    round: state.round,
    peerId: mp.myPeerId,
    seq: ++mp.inputSeq,
    team: state.myTeam,
    role: state.controlledRole,
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z,
    vx: 0,
    vy: 0,
    vz: 0,
    oc: p.onCanopy ? 1 : 0,
    facingAngle: p.facingAngle,
    moveForward: 0,
    moveRight: 0,
    camYaw: state.camYaw,
    actionTriggered: false
  });
}

export function selectControlledRole(role, options = {}) {
  if (!['G', 'C', 'D'].includes(role)) return false;
  if (state.myLockedRole && state.myLockedRole !== role) return false;
  if (!options.force && !ctx.api.isTutorialRoleSwitchAllowed()) return false;

  const targetCandidate = getPlayer(state.myTeam, role);
  if (!options.force && targetCandidate && targetCandidate.tutorialHidden) return false;

  const blocker = getRoleHumanController(state.myTeam, role);
  if (blocker) {
    if (!options.silent) {
      showToast(`⛔ <strong>Joueuse ${role}</strong> est déjà contrôlée par <strong>${escapeHtml(blocker.name)}</strong> !`, 2000);
    }
    return false;
  }

  const prevRole = state.controlledRole;
  state.controlledRole = role;
  if (!options.silent && prevRole !== role) ctx.api.playSfx?.('role_switch', { role });
  state.ultPreviewActive = false;
  if (state.passCharge && state.passCharge.active) ctx.api.cancelPassCharge?.();
  if (!options.silent) notifyTutorialRoleSwitch(prevRole, role);

  const me = mp.members.find((m) => m.peerId === mp.myPeerId);
  if (me && me.slot === 'ALL') me.activeRole = role;

  const p = getPlayer(state.myTeam, role);
  if (ctx.api.setMobaMoveGoal) ctx.api.setMobaMoveGoal(null);
  else state.mobaMoveTarget = null;
  if (uiState.mobaMoveMarker) uiState.mobaMoveMarker.visible = false;

  if (p) {
    p.vel.set(0, 0, 0);
    p.targetPos.copy(p.pos);
    p.targetFacingAngle = p.facingAngle;
    if (state.cameraMode === 'tps') state.camYaw = p.facingAngle + Math.PI;
    else if (state.cameraMode === 'aerial') recenterMobaCamera(true);
    syncRoleSelectionToNetwork(p);
  }
  updateRosterHUD();
  return true;
}

export function cycleControlledRole(direction = 1) {
  if (state.myLockedRole || !ctx.api.isTutorialRoleSwitchAllowed()) return false;
  const order = ['G', 'C', 'D'];
  const idx = Math.max(0, order.indexOf(state.controlledRole));
  const step = direction >= 0 ? 1 : 2;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const nextRole = order[(idx + step * attempt) % 3];
    if (nextRole === state.controlledRole || getRoleHumanController(state.myTeam, nextRole)) continue;
    const p = getPlayer(state.myTeam, nextRole);
    if (p && !p.tutorialHidden && p.state === 'standing') return selectControlledRole(nextRole);
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const nextRole = order[(idx + step * attempt) % 3];
    if (nextRole === state.controlledRole || getRoleHumanController(state.myTeam, nextRole)) continue;
    const p = getPlayer(state.myTeam, nextRole);
    if (p && !p.tutorialHidden) return selectControlledRole(nextRole);
  }
  return false;
}
