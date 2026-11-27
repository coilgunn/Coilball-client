import { TUTORIAL_STEPS, state, mp, ctx } from '../state.js';
import { getPlayer } from '../render3d.js';
import {
  ultState,
  hideUltimatePreview,
  hasPlayerUltEvo,
  getUltimateMeta,
  getUltimateAimAngle,
  canReactivateWaterUlt,
  canPlayerUseUltimate
} from './shared.js';
import { spawnFireLaserUltimate } from './fire_spawn.js';
import { spawnLeafWallUltimate } from './leaf.js';
import { spawnWaterWaveUltimate, triggerWaterWavePull } from './water.js';
import { updateUltHudWidget } from './hud_widget.js';

export function toggleUltimatePreview() {
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!p) return;
  if (canReactivateWaterUlt(p)) {
    state.ultPreviewActive = false;
    hideUltimatePreview();
    const msg = {
      type: 'MP_ULT_TRIGGER',
      round: state.round,
      peerId: mp.myPeerId,
      team: p.team,
      role: p.role,
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      oc: p.onCanopy ? 1 : 0,
      aimAngle: p.facingAngle,
      reactivate: true
    };
    if (mp.enabled) ctx.api.sendNetMessage(msg);
    triggerPlayerUltimate(p, p.facingAngle, false, true);
    return;
  }
  if (state.ultPreviewActive) {
    cancelUltimatePreview(true);
    return;
  }
  if (!canPlayerUseUltimate(p, true)) return;
  state.ultPreviewActive = true;
  state.ultPreviewAimAngle = getUltimateAimAngle(p);
  ctx.api.playSfx?.('ult_aim');
  if (state.mode === 'tutorial') {
    const meta = getUltimateMeta(p.color, p);
    ctx.api.showToast(
      `${meta.icon} <strong>Visée Ultimate : ${meta.name}</strong> — <strong>Clic Gauche</strong> pour déclencher (<strong>R</strong> pour annuler)`,
      2600
    );
  }
  updateUltHudWidget();
}

export function cancelUltimatePreview(showFeedback = false) {
  if (!state.ultPreviewActive) return;
  state.ultPreviewActive = false;
  if (ultState.previewGroup) ultState.previewGroup.visible = false;
  if (showFeedback) {
    ctx.api.playSfx?.('ult_cancel');
    if (state.mode === 'tutorial') {
      ctx.api.showToast('✖️ <strong>Visée Ultimate annulée.</strong>', 1300);
    }
  }
  updateUltHudWidget();
}

export function confirmUltimateTrigger(overrideAngle = null) {
  const hasExplicitOverride = typeof overrideAngle === 'number' && Number.isFinite(overrideAngle);
  if (!state.ultPreviewActive && !hasExplicitOverride) return false;
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!canPlayerUseUltimate(p, true)) {
    state.ultPreviewActive = false;
    hideUltimatePreview();
    updateUltHudWidget();
    return false;
  }
  const aimAngle = getUltimateAimAngle(p, hasExplicitOverride ? overrideAngle : null);
  state.ultPreviewActive = false;
  hideUltimatePreview();
  p.facingAngle = aimAngle;

  if (mp.enabled) {
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
      aimAngle
    });
  }

  triggerPlayerUltimate(p, aimAngle, false, false, hasExplicitOverride ? aimAngle : null);
  return true;
}

function dispatchUltByColor(p, resolvedAimAngle, evolved, lockFireAim, teamLabel) {
  if (p.color === 'red') {
    if (evolved) {
      p.ultShotsUsed = (p.ultShotsUsed || 0) + 1;
      if (p.ultShotsUsed < 2) {
        p.ultUsed = false;
        p.ultCooldown = 3.0;
      } else {
        p.ultUsed = true;
        p.ultCooldown = 0;
      }
    } else {
      p.ultUsed = true;
    }
    spawnFireLaserUltimate(p, resolvedAimAngle, evolved, lockFireAim);
    ctx.api.broadcastToast(
      evolved
        ? `🔥🌟 <strong>ULTIMATE FEU ÉVOLUÉ !</strong> ${teamLabel} ${p.role} charge un <strong>Large Plasma</strong> (0.5s, ${p.ultShotsUsed}/2) !`
        : `🔥 <strong>ULTIMATE FEU !</strong> ${teamLabel} ${p.role} charge son <strong>Rayon Plasma</strong> (0.5s) !`,
      3000
    );
    return;
  }
  if (p.color === 'green') {
    p.ultUsed = true;
    spawnLeafWallUltimate(p, resolvedAimAngle);
    ctx.api.broadcastToast(
      evolved
        ? `🌿🌟 <strong>ULTIMATE FEUILLE ÉVOLUÉ !</strong> ${teamLabel} ${p.role} sprinte à <strong>4.2x (3.5s)</strong> et sème un grand <strong>Mur Organique (8s)</strong> !`
        : `🌿 <strong>ULTIMATE FEUILLE !</strong> ${teamLabel} ${p.role} sprinte à <strong>3x vitesse (2s)</strong> et sème un <strong>Mur de Bois (4s)</strong> !`,
      3400
    );
    return;
  }
  p.ultUsed = true;
  spawnWaterWaveUltimate(p, resolvedAimAngle);
  ctx.api.broadcastToast(
    evolved
      ? `💧🌟 <strong>ULTIMATE EAU ÉVOLUÉ !</strong> ${teamLabel} ${p.role} déchaîne une <strong>Onde 360°</strong> (réactiver <strong>[R]</strong> pour ramener) !`
      : `💧 <strong>ULTIMATE EAU !</strong> ${teamLabel} ${p.role} déchaîne une <strong>Vague Déferlante</strong> !`,
    3400
  );
}

export function triggerPlayerUltimate(p, aimAngle = p.facingAngle, fromNetwork = false, reactivate = false, overrideAngle = null) {
  if (!p || state.phase !== 'play' || state.vanillaMode) return;
  if (reactivate) {
    triggerWaterWavePull(p);
    return;
  }
  if (!fromNetwork && !canPlayerUseUltimate(p, false)) return;

  const hasOverride = typeof overrideAngle === 'number' && Number.isFinite(overrideAngle);
  const resolvedAimAngle = hasOverride ? overrideAngle : aimAngle;
  const isLocalControlled = p.team === state.myTeam && p.role === state.controlledRole;
  const lockFireAim = !fromNetwork && (hasOverride || (state.mobileMode && isLocalControlled));
  const evolved = hasPlayerUltEvo(p);
  p.facingAngle = resolvedAimAngle;
  const teamLabel = p.team === 'ally' ? 'Équipe Or' : 'Équipe Violette';

  dispatchUltByColor(p, resolvedAimAngle, evolved, lockFireAim, teamLabel);

  if (p.team === state.myTeam && p.role === state.controlledRole) {
    ctx.api.triggerGamepadRumble(210, 0.75, 0.85);
    if (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.ULTIMATE) {
      if (p.color === 'red') ctx.api.markTutorialCheck('ultFireFired');
      else if (p.color === 'blue') ctx.api.markTutorialCheck('ultWaterFired');
      else if (p.color === 'green') ctx.api.markTutorialCheck('ultLeafFired');
    }
  }
  ctx.api.updateRosterHUD();
  updateUltHudWidget();
}
