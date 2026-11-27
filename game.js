
import { state, ctx } from './src/state.js';
import {
  scene,
  camera,
  renderer,
  applyPlayerColor,
  updateParticles,
  initRender3d,
  getPlayer,
  updatePassChargePreview3D,
  updateBoomerangMarkers3D,
  updateMobileActionAimPreview3D,
  syncPlayerPowerVisuals
} from './src/render3d.js';
import { initNav } from './src/nav.js';
import { getActiveMapMeta, buildParkEnvironment, updateWorldAnimations, initWorld } from './src/world.js';
import {
  triggerPlayerUltimate,
  updateUltimatePreview3D,
  updateUltHudWidget,
  serializeLateUltimates,
  applyLateUltimates,
  initUltimates
} from './src/ultimates.js';
import { sendNetMessage, broadcastToast, updateTransportBadgeUI, initNet } from './src/net.js';
import {
  pollGamepad,
  isMenuOpen,
  raycastScreenToWorld,
  triggerGamepadRumble,
  recenterMobaCamera,
  setCameraMode,
  detectDefaultMobileDevice,
  setLowSpecMode,
  setMobileMode,
  updateMobileTouchHUD,
  updateFullscreenButtonsUI,
  getVisibleModalId,
  showOnlyModal,
  showToast,
  updateMapLockUI,
  selectArenaMap,
  setMpLobbyMode,
  updateCamera,
  updateAerialVisionCones3D,
  updateFloatingLabels,
  updateTopHUD,
  updateRosterHUD,
  renderMinimap,
  syncViewportIfResized,
  getViewportSize,
  openOptionsModal,
  openArenaModal,
  setAIDifficulty,
  setMpLobbyAiDifficulty,
  initUI
} from './src/ui.js';
import { initAI, resetAITacticalMemory } from './src/ai.js';
import { initAudio, playSfx, syncMusicState } from './src/audio.js';
import {
  resetMatchStateToMenu,
  executePracticeAction,
  requestPracticeAction,
  applyRoundSetupPositions,
  maybeStartRoundFromPrep,
  updatePrepConfirmButtonUI,
  isShopAvailable,
  openPracticeShop,
  closePracticeShopAndReturn,
  openShopShortcut,
  openPrepModal,
  syncMyTeamPrep,
  renderPrepColorPickers,
  handleHostPrepAction,
  assignPrepColor,
  renderShopItems,
  isTutorialRoleSwitchAllowed,
  getNextTutorialObjectiveItem,
  completeTutorialToPractice,
  dismissTutorialIntro,
  markTutorialCheck,
  enterTutorialStep,
  openTutorialShopStep3,
  updateTutorialSequence,
  startRoundExecution,
  startNewMatch,
  initModes
} from './src/modes.js';
import {
  handleActionKey,
  triggerPlayerAction,
  triggerDash,
  clearAllDeployedTools,
  clearAllSlidePatches,
  spawnSlidePatch,
  deployPlayerTool,
  updateDeployedToolsAndPatches,
  stepCharacterVerticalPhysics,
  updateGameplay,
  broadcastWorldState,
  applyWorldStateFromHost,
  freeFromRule1,
  sitDownPlayer,
  finishRound,
  clampToField,
  serializeLateToolsAndPatches,
  applyLateToolsAndPatches,
  setMobaMoveGoal,
  beginPassCharge,
  updatePassCharge,
  releasePassCharge,
  cancelPassCharge,
  handleRemoteBallPass,
  triggerJump,
  handleRemotePlayerJump,
  getPlayerDashParams,
  executePlayerDash,
  triggerBoomerangReturn,
  executeBallPassOrThrow,
  initPhysics
} from './src/physics.js';

initRender3d();
initNet();
initNav();
initWorld();
buildParkEnvironment();
initUltimates();
initAI();
initPhysics();
initAudio();
initUI();
initModes();

Object.assign(ctx.api, {
  playSfx,
  syncMusicState,
  getPlayerDashParams,
  executePlayerDash,
  triggerBoomerangReturn,
  executeBallPassOrThrow,
  setAIDifficulty,
  setMpLobbyAiDifficulty,
  resetAITacticalMemory,
  isMenuOpen,
  showToast,
  broadcastToast,
  sendNetMessage,
  updateTransportBadgeUI,
  markTutorialCheck,
  raycastScreenToWorld,
  triggerGamepadRumble,
  updateTopHUD,
  updateRosterHUD,
  updateMobileTouchHUD,
  clampToField,
  sitDownPlayer,
  freeFromRule1,
  updateDeployedToolsAndPatches,
  applyPlayerColor,
  applyRoundSetupPositions,
  applyWorldStateFromHost,
  broadcastWorldState,
  deployPlayerTool,
  executePracticeAction,
  finishRound,
  getActiveMapMeta,
  getPlayer,
  getVisibleModalId,
  getViewportSize,
  handleHostPrepAction,
  maybeStartRoundFromPrep,
  openPrepModal,
  openOptionsModal,
  openArenaModal,
  renderPrepColorPickers,
  renderShopItems,
  resetMatchStateToMenu,
  selectArenaMap,
  setMpLobbyMode,
  showOnlyModal,
  spawnSlidePatch,
  startRoundExecution,
  triggerPlayerAction,
  triggerPlayerUltimate,
  updateMapLockUI,
  updatePrepConfirmButtonUI,
  updateUltHudWidget,
  updatePassChargePreview3D,
  updateBoomerangMarkers3D,
  updateMobileActionAimPreview3D,
  syncPlayerPowerVisuals,
  requestPracticeAction,
  isShopAvailable,
  openPracticeShop,
  closePracticeShopAndReturn,
  openShopShortcut,
  syncMyTeamPrep,
  assignPrepColor,
  isTutorialRoleSwitchAllowed,
  getNextTutorialObjectiveItem,
  completeTutorialToPractice,
  dismissTutorialIntro,
  enterTutorialStep,
  openTutorialShopStep3,
  startNewMatch,
  handleActionKey,
  triggerDash,
  setMobaMoveGoal,
  beginPassCharge,
  updatePassCharge,
  releasePassCharge,
  cancelPassCharge,
  handleRemoteBallPass,
  triggerJump,
  handleRemotePlayerJump,
  clearAllDeployedTools,
  clearAllSlidePatches,
  stepCharacterVerticalPhysics,
  serializeLateUltimates,
  applyLateUltimates,
  serializeLateToolsAndPatches,
  applyLateToolsAndPatches,
  recenterMobaCamera
});

const MAX_FPS = 120;
const FRAME_MIN_MS = 1000 / MAX_FPS;
const FRAME_EPS_MS = 0.5; // Tolérance vsync 120 Hz pour éviter de sauter une frame à ~8.3 ms
let lastTime = performance.now();
let lowSpecFrameCounter = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const elapsedMs = now - lastTime;
  const targetMinMs = state.lowSpecMode ? 1000 / 60 : FRAME_MIN_MS;
  if (elapsedMs + FRAME_EPS_MS < targetMinMs) return;
  const dt = Math.min(0.05, Math.max(0, elapsedMs) / 1000);
  lastTime = now;
  lowSpecFrameCounter++;

  pollGamepad(dt);
  syncMusicState(state.phase, isMenuOpen());
  updateGameplay(dt);
  updateTutorialSequence(dt);
  updateUltimatePreview3D(dt);
  updatePassChargePreview3D(dt);
  updateBoomerangMarkers3D(dt);
  updateUltHudWidget();
  updateMobileTouchHUD();
  updateParticles(dt);
  updateWorldAnimations(dt);
  syncViewportIfResized();
  updateCamera(dt);
  updateFloatingLabels();
  updateAerialVisionCones3D();
  if (!state.lowSpecMode || lowSpecFrameCounter % 3 === 0) {
    renderMinimap();
  }

  renderer.render(scene, camera);
}

let savedLowSpec = null;
let savedMobileMode = null;
try {
  savedLowSpec = localStorage.getItem('coilball_low_spec');
  savedMobileMode = localStorage.getItem('coilball_mobile_mode');
} catch (_) { /* ignore */ }
const autoMobileDevice = detectDefaultMobileDevice();
const initialMobile = savedMobileMode !== null ? savedMobileMode === '1' : autoMobileDevice;
const initialLowSpec = savedLowSpec !== null ? savedLowSpec === '1' : initialMobile;
setMobileMode(initialMobile, { silent: true, skipSave: true, keepCamera: state.phase !== 'menu' });
if (!initialMobile && state.defaultCameraMode === 'aerial') {
  setCameraMode('aerial', true);
}
setLowSpecMode(initialLowSpec, { silent: true, skipSave: true });

updateFullscreenButtonsUI();
updateTopHUD();
updateRosterHUD();
renderMinimap();
requestAnimationFrame(animate);
