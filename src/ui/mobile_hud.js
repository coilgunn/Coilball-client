import { TUTORIAL_STEPS, canPlayerPassOrThrow, state, ctx } from '../state.js';
import { getPlayer, renderer, scene, setParticlePoolLimit, sunLight } from '../render3d.js';
import { canReactivateWaterUlt, getUltimateMeta, isUltimateUnlocked, canPlayerUseUltimate } from '../ultimates.js';
import { getRoleHumanController } from '../net.js';
import { isMenuOpen, isPointerLocked, uiState } from './shared.js';
import { showToast } from './toast.js';
import { syncViewportSize } from './viewport.js';
import { unlockPointer } from './pointer_lock.js';
import { setCameraMode } from './camera.js';
import { computeMobileAutoAimAngle, mobileInput, resetMobileInput, syncMobileAimPreview3D } from './mobile_aim.js';

export function updateDeviceToggleButtonsUI() {
  const btnLow = document.getElementById('btn-toggle-low-spec');
  if (btnLow) {
    btnLow.textContent = state.lowSpecMode ? '⚡ Low Spec : ON' : '⚡ Low Spec : OFF';
    btnLow.classList.toggle('active-mode-pill', !!state.lowSpecMode);
  }
  const btnMob = document.getElementById('btn-toggle-mobile-mode');
  if (btnMob) {
    btnMob.textContent = state.mobileMode ? '📱 Mode Mobile : ON' : '📱 Mode Mobile : OFF';
    btnMob.classList.toggle('active-mode-pill', !!state.mobileMode);
  }
}

export function setLowSpecMode(enabled, opts = {}) {
  const on = !!enabled;
  state.lowSpecMode = on;
  document.body.classList.toggle('low-spec-mode', on);

  renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  syncViewportSize();

  const shadowsWanted = !on;
  if (renderer.shadowMap.enabled !== shadowsWanted || sunLight.castShadow !== shadowsWanted) {
    renderer.shadowMap.enabled = shadowsWanted;
    renderer.shadowMap.autoUpdate = shadowsWanted;
    renderer.shadowMap.needsUpdate = true;
    sunLight.castShadow = shadowsWanted;
    scene.traverse((obj) => {
      if (obj && obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m) m.needsUpdate = true;
        });
      }
    });
  }

  setParticlePoolLimit(on ? 70 : Infinity);
  uiState.aerialConeFrameCounter = 0;

  if (!opts.skipSave) {
    try {
      localStorage.setItem('coilball_low_spec', on ? '1' : '0');
    } catch (_) { /* ignore */ }
  }
  updateDeviceToggleButtonsUI();
  if (!opts.silent) {
    showToast(
      on
        ? '⚡ Mode <strong>Low Spec activé</strong> : ombres coupées, 60 FPS max et effets allégés.'
        : '✨ Mode <strong>Qualité standard</strong> rétabli.',
      2000
    );
  }
}

export function setMobileMode(enabled, opts = {}) {
  const on = !!enabled;
  state.mobileMode = on;
  document.body.classList.toggle('mobile-mode', on);
  resetMobileInput();

  state.hudLeftCollapsed = on;
  const rosterPanel = document.getElementById('roster-panel');
  const leftBody = document.getElementById('hud-left-body');
  const btnCollapse = document.getElementById('btn-hud-collapse-left');
  if (rosterPanel) rosterPanel.classList.toggle('hud-collapsed', on);
  if (leftBody) leftBody.classList.toggle('hidden', on);
  if (btnCollapse) btnCollapse.textContent = on ? '▸' : '▾';

  if (on) {
    document.body.classList.remove('play-cursor-hidden');
    if (isPointerLocked()) unlockPointer();
    if (!opts.keepCamera) setCameraMode('tps', true);
  }

  if (!opts.skipSave) {
    try {
      localStorage.setItem('coilball_mobile_mode', on ? '1' : '0');
    } catch (_) { /* ignore */ }
  }
  updateDeviceToggleButtonsUI();
  updateMobileTouchHUD();
  syncViewportSize();
  if (!opts.silent) {
    showToast(
      on
        ? '📱 <strong>Mode Mobile activé</strong> : contrôles tactiles prêts (vue TPS par défaut).'
        : '🖥️ <strong>Mode Bureau</strong> rétabli.',
      2000
    );
  }
}

function updateMobileTopAndRoleBar() {
  const camBtn = document.getElementById('mob-btn-cam');
  if (camBtn) camBtn.textContent = state.cameraMode === 'aerial' ? '🦅 MOBA' : '🎥 TPS';

  const recenterBtn = document.getElementById('mob-btn-recenter');
  if (recenterBtn) {
    recenterBtn.classList.toggle('hidden', state.cameraMode !== 'aerial');
    recenterBtn.textContent = state.mobaCamLocked ? '🔒 Centré' : '🎯 Centrer';
    recenterBtn.classList.toggle('active-mode-pill', !!state.mobaCamLocked);
  }

  const shopBtn = document.getElementById('mob-btn-shop');
  if (shopBtn) {
    const canOpenShop =
      (state.mode === 'tutorial' && state.tutorialStep === TUTORIAL_STEPS.TOOLS) || state.mode === 'practice';
    shopBtn.classList.toggle('hidden', !canOpenShop);
  }

  const roleBar = document.getElementById('mobile-role-bar');
  const canSwitchRoles = !state.myLockedRole && ctx.api.isTutorialRoleSwitchAllowed();
  if (roleBar) {
    roleBar.classList.toggle('hidden', !canSwitchRoles);
    if (canSwitchRoles) {
      ['G', 'C', 'D'].forEach((role) => {
        const btn = document.getElementById(`mob-role-${role}`);
        if (!btn) return;
        const cand = getPlayer(state.myTeam, role);
        const blocker = getRoleHumanController(state.myTeam, role);
        btn.classList.toggle('active', state.controlledRole === role);
        btn.disabled = !!(blocker || (cand && cand.tutorialHidden));
      });
    }
  }
}

function applyAimClasses(btn, actionType) {
  const aiming = mobileInput.aimAction === actionType;
  const cancelTarget = aiming && mobileInput.aimLeftButton && !mobileInput.aimCancelled;
  const cancelArmed = aiming && !!mobileInput.aimCancelled;
  btn.classList.toggle('aiming', aiming);
  btn.classList.toggle('aim-cancel-target', cancelTarget);
  btn.classList.toggle('cancel-armed', cancelArmed);
  return { aiming, cancelTarget, cancelArmed };
}

function updateMobileJumpAndDashButtons(p, teamMeta) {
  const jumpBtn = document.getElementById('mob-btn-jump');
  if (jumpBtn) {
    const hasTeamJump = !!(teamMeta && teamMeta.teamJump);
    jumpBtn.classList.toggle('hidden', !hasTeamJump);
    if (hasTeamJump) {
      const jumpCd = p && p.jumpCooldown > 0 ? p.jumpCooldown : 0;
      jumpBtn.disabled = !(p && p.state === 'standing' && !p.isAirborne && jumpCd <= 0);
      jumpBtn.textContent = jumpCd > 0 ? `⏳ ${jumpCd.toFixed(1)}s` : '⬆️ Saut';
    }
  }

  const dashBtn = document.getElementById('mob-btn-dash');
  if (!dashBtn) return;
  const { cancelTarget, cancelArmed } = applyAimClasses(dashBtn, 'dash');
  const dashUnlocked = !!(ctx.api.isDashUnlocked ? ctx.api.isDashUnlocked() : true);
  const boomerangReady = !!(p && p.state === 'standing' && !p.carryingBall && p.boomerangWindow > 0 && p.boomerangOrigin);
  const dashCd = p && p.dashCooldown > 0 ? p.dashCooldown : 0;
  const canDash =
    dashUnlocked &&
    !!(p && p.state === 'standing' && !p.carryingBall && (boomerangReady || (dashCd <= 0 && (p.dashTimer || 0) <= 0)));

  if (cancelArmed) {
    dashBtn.disabled = false;
    dashBtn.textContent = '✖ Annuler';
  } else if (cancelTarget) {
    dashBtn.disabled = false;
    dashBtn.textContent = '✖';
  } else {
    dashBtn.disabled = !canDash;
    if (!dashUnlocked) dashBtn.textContent = '🔒 Dash';
    else if (boomerangReady) dashBtn.textContent = '🪃 Retour';
    else if (dashCd > 0) dashBtn.textContent = `⏳ ${dashCd.toFixed(1)}s`;
    else dashBtn.textContent = '💨 Dash';
  }
}

function updateMobileActionButton(p, pwr) {
  const actionBtn = document.getElementById('mob-btn-action');
  if (!actionBtn) return;
  const { cancelTarget, cancelArmed } = applyAimClasses(actionBtn, 'action');

  if (cancelArmed) {
    actionBtn.disabled = false;
    actionBtn.textContent = '✖ Annuler';
  } else if (cancelTarget) {
    actionBtn.disabled = false;
    actionBtn.textContent = '✖';
  } else if (p && p.state === 'sitting' && pwr.standUp) {
    actionBtn.disabled = false;
    actionBtn.textContent = '⚡ Relever';
  } else if (p && p.state === 'standing' && p.carryingBall) {
    if (!canPlayerPassOrThrow(p)) {
      actionBtn.disabled = true;
      actionBtn.textContent = '🔒 Passe';
    } else {
      actionBtn.disabled = false;
      actionBtn.textContent =
        state.passCharge && state.passCharge.active && state.passCharge.targetRole
          ? `⚽ → ${state.passCharge.targetRole}`
          : '⚽ Passe';
    }
  } else if (!state.vanillaMode && p && p.state === 'standing' && !p.carryingBall && pwr.toolEvo) {
    const toolCd = p.toolCooldown > 0 ? p.toolCooldown : 0;
    const toolLabels = { beacon: '📡 Balise', wall: '🧱 Mur', pad: '⚡ Tapis' };
    actionBtn.disabled = toolCd > 0;
    actionBtn.textContent = toolCd > 0 ? `⏳ ${toolCd.toFixed(1)}s` : toolLabels[pwr.toolEvo] || '🔧 Outil';
  } else {
    actionBtn.disabled = true;
    actionBtn.textContent = '🖐️ Action';
  }
}

function updateMobileUltButton(p) {
  const ultBtn = document.getElementById('mob-btn-ult');
  if (!ultBtn) return;
  ultBtn.classList.toggle('hidden', !!state.vanillaMode);
  if (state.vanillaMode) return;

  const { aiming, cancelTarget, cancelArmed } = applyAimClasses(ultBtn, 'ult');
  if (cancelArmed) {
    ultBtn.disabled = false;
    ultBtn.classList.remove('ult-aiming');
    ultBtn.textContent = '✖ Annuler';
  } else if (cancelTarget) {
    ultBtn.disabled = false;
    ultBtn.classList.remove('ult-aiming');
    ultBtn.textContent = '✖';
  } else if (p && canReactivateWaterUlt(p)) {
    ultBtn.disabled = false;
    ultBtn.classList.add('ult-aiming');
    ultBtn.textContent = '🔄 Rappel';
  } else if (aiming && mobileInput.aimMode === 'aiming') {
    ultBtn.disabled = false;
    ultBtn.classList.add('ult-aiming');
    ultBtn.textContent = '🎯 Visée';
  } else {
    ultBtn.classList.remove('ult-aiming');
    ultBtn.disabled = !(p && canPlayerUseUltimate(p, false));
    if (!p) ultBtn.textContent = '⚡ Ult';
    else if (!isUltimateUnlocked()) ultBtn.textContent = '🔒 Ult R2';
    else if ((p.ultCooldown || 0) > 0) ultBtn.textContent = `⏳ ${p.ultCooldown.toFixed(1)}s`;
    else if (p.ultUsed) ultBtn.textContent = '⏳ Ult';
    else ultBtn.textContent = `${getUltimateMeta(p.color, p).icon} Ult`;
  }
}

export function updateMobileTouchHUD() {
  const root = document.getElementById('mobile-touch-controls');
  if (!root) return;
  const visible = !!(state.mobileMode && state.phase === 'play' && !isMenuOpen());
  root.classList.toggle('hidden', !visible);
  if (!visible) {
    if (
      mobileInput.joyPointerId !== null ||
      mobileInput.joyTouchId !== null ||
      mobileInput.joyMouseDown ||
      mobileInput.camPointerId !== null ||
      mobileInput.aimAction !== null
    ) {
      resetMobileInput();
    }
    return;
  }

  updateMobileTopAndRoleBar();
  const p = getPlayer(state.myTeam, state.controlledRole);
  if (mobileInput.aimAction && !mobileInput.aimLeftButton && p) {
    mobileInput.aimAngle = computeMobileAutoAimAngle(mobileInput.aimAction, p);
  }
  const teamMeta = (p && state.teams[p.team]) || state.teams[state.myTeam];
  const pwr = (p && teamMeta?.powers?.[p.role]) || {};

  updateMobileJumpAndDashButtons(p, teamMeta);
  updateMobileActionButton(p, pwr);
  updateMobileUltButton(p);

  if (mobileInput.aimMode === 'aiming') syncMobileAimPreview3D();
}
