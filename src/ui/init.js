import { mp, state, ctx } from '../state.js';
import { AI_DIFF_STORAGE_KEY, THREE, getViewportSize, uiState } from './shared.js';
import { updateControlsHelpForCameraMode } from './controls_help.js';
import {
  computeMobileAutoAimAngle,
  getMobileAimOverride,
  isMobileAimCancelled
} from './mobile_aim.js';
import { updateMobileTouchHUD } from './mobile_hud.js';
import { initMobileAndDeviceControls } from './mobile_sticks.js';
import { toggleMobaCamLock } from './camera.js';
import { selectControlledRole } from './role_select.js';
import { setAIDifficulty, setMpLobbyAiDifficulty, setMpLobbyVanilla, syncAIDifficultyUI } from './arena_lobby.js';
import { syncMinimapCanvasDimensions } from './minimap_static.js';
import { cancelControlRebind, loadControlsConfig } from './controls_config.js';
import { renderControlsCustomizer } from './controls_ui.js';
import { registerGamepadListeners } from './gamepad.js';
import { bindMenusUI } from './bindings_menus.js';
import { bindHudUI } from './bindings_hud.js';
import { registerKeyboardListeners } from './listeners_keyboard.js';
import { registerMouseAndViewportListeners } from './listeners_mouse.js';

function bindUIButtons() {
  bindMenusUI();
  bindHudUI();
}

function registerUIGlobalListeners() {
  registerGamepadListeners();
  registerKeyboardListeners();
  registerMouseAndViewportListeners();
}

export function initUI() {
  uiState.mobaRaycaster = new THREE.Raycaster();
  uiState.mobaPointerNDC = new THREE.Vector2();
  uiState.tmpCamDesired = new THREE.Vector3();
  uiState.tmpCamLook = new THREE.Vector3();
  uiState.tmpProjVec = new THREE.Vector3();
  const vp = getViewportSize();
  uiState.lastViewportW = vp.w;
  uiState.lastViewportH = vp.h;

  ctx.api.getMobileAimOverride = getMobileAimOverride;
  ctx.api.isMobileAimCancelled = isMobileAimCancelled;
  ctx.api.computeMobileAutoAimAngle = computeMobileAutoAimAngle;
  ctx.api.setMpLobbyVanilla = setMpLobbyVanilla;
  ctx.api.setMpLobbyAiDifficulty = setMpLobbyAiDifficulty;
  ctx.api.toggleMobaCamLock = toggleMobaCamLock;
  ctx.api.updateControlsHelpForCameraMode = updateControlsHelpForCameraMode;
  ctx.api.selectControlledRole = selectControlledRole;
  ctx.api.updateMobileTouchHUD = updateMobileTouchHUD;
  ctx.api.cancelControlRebind = cancelControlRebind;
  ctx.api.renderControlsCustomizer = renderControlsCustomizer;

  uiState.minimapCanvas = document.getElementById('minimap-canvas');
  uiState.minimapCtx = uiState.minimapCanvas ? uiState.minimapCanvas.getContext('2d') : null;
  uiState.minimapSpottedEl = document.getElementById('minimap-spotted-count');
  syncMinimapCanvasDimensions();
  initMobileAndDeviceControls();
  loadControlsConfig();
  registerUIGlobalListeners();
  bindUIButtons();
  try {
    const savedDiff = localStorage.getItem(AI_DIFF_STORAGE_KEY);
    if (savedDiff === 'hard' || savedDiff === 'normal') {
      state.aiDifficulty = savedDiff;
      mp.lobbyAiDifficulty = savedDiff;
    }
  } catch (_) { /* ignore */ }
  syncAIDifficultyUI();
  ctx.api.setAIDifficulty = setAIDifficulty;
}
