import {
  CONTROL_ACTIONS_META,
  CONTROL_CATEGORIES,
  DEFAULT_CONTROLS,
  cloneDefaultControls,
  formatInputCode,
  state
} from '../state.js';
import { isPointerLocked } from './shared.js';
import { unlockPointer, updateMobaVirtualCursorUI } from './pointer_lock.js';
import { setCameraMode } from './camera.js';
import { updateControlsHelpForCameraMode } from './controls_help.js';
import {
  cancelControlRebind,
  resetControlsToDefault,
  saveControlsConfig,
  startControlRebind,
  syncControlsSettingsUI
} from './controls_config.js';

function createControlBindRow(meta) {
  const row = document.createElement('div');
  row.className = 'controls-bind-row';

  const lbl = document.createElement('span');
  lbl.className = 'controls-bind-label';
  lbl.textContent = meta.label;
  row.appendChild(lbl);

  const slotsWrap = document.createElement('div');
  slotsWrap.className = 'controls-bind-slots';
  const slots = (state.controls && state.controls[meta.key]) || DEFAULT_CONTROLS[meta.key] || [null, null];

  [0, 1].forEach((slotIdx) => {
    const code = slots[slotIdx] || null;
    const isListening = !!(
      state.rebindingState &&
      state.rebindingState.actionKey === meta.key &&
      state.rebindingState.slotIndex === slotIdx
    );
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ctrl-bind-btn${isListening ? ' listening' : ''}${!code && !isListening ? ' empty' : ''}`;
    btn.textContent = isListening ? 'Appuyez...' : formatInputCode(code);
    btn.title = `Cliquer pour modifier l'emplacement ${slotIdx + 1} (${meta.label})`;
    btn.onclick = (e) => {
      if (e) e.stopPropagation();
      btn.blur();
      startControlRebind(meta.key, slotIdx);
    };
    slotsWrap.appendChild(btn);
  });

  row.appendChild(slotsWrap);
  return row;
}

export function renderControlsCustomizer() {
  const grid = document.getElementById('controls-bindings-grid');
  if (!grid) return;
  grid.replaceChildren();

  CONTROL_CATEGORIES.forEach((cat) => {
    const items = CONTROL_ACTIONS_META.filter((m) => m.category === cat.id);
    if (items.length === 0) return;

    const section = document.createElement('div');
    section.className = 'controls-cat-section';
    const hdr = document.createElement('div');
    hdr.className = 'controls-cat-header';
    hdr.textContent = cat.label;
    section.appendChild(hdr);
    items.forEach((meta) => section.appendChild(createControlBindRow(meta)));
    grid.appendChild(section);
  });
}

function bindControlsToggleButtons() {
  const defaultCamBtn = document.getElementById('btn-opt-default-cam');
  if (defaultCamBtn) {
    defaultCamBtn.onclick = () => {
      defaultCamBtn.blur();
      state.defaultCameraMode = state.defaultCameraMode === 'aerial' ? 'tps' : 'aerial';
      saveControlsConfig();
      syncControlsSettingsUI();
      if (state.phase === 'menu' && !state.mobileMode) setCameraMode(state.defaultCameraMode, true);
    };
  }
  const mobaClickBtn = document.getElementById('btn-opt-moba-click');
  if (mobaClickBtn) {
    mobaClickBtn.onclick = () => {
      mobaClickBtn.blur();
      state.mobaMoveButton = state.mobaMoveButton === 'left' ? 'right' : 'left';
      const nextCode = state.mobaMoveButton === 'left' ? 'Mouse0' : 'Mouse2';
      if (!state.controls) state.controls = cloneDefaultControls();
      const prevSlots = Array.isArray(state.controls.mobaMove) ? state.controls.mobaMove : [nextCode, null];
      const slot1 = prevSlots[1] && prevSlots[1] !== nextCode ? prevSlots[1] : null;
      state.controls.mobaMove = [nextCode, slot1];
      saveControlsConfig();
      syncControlsSettingsUI();
      renderControlsCustomizer();
      updateControlsHelpForCameraMode();
    };
  }
  const edgeBtn = document.getElementById('btn-ctrl-edge-pan');
  if (edgeBtn) {
    edgeBtn.onclick = () => {
      edgeBtn.blur();
      state.mobaEdgePan = !state.mobaEdgePan;
      saveControlsConfig();
      syncControlsSettingsUI();
    };
  }
  const lockBtn = document.getElementById('btn-ctrl-moba-cursor-lock');
  if (lockBtn) {
    lockBtn.onclick = () => {
      lockBtn.blur();
      state.mobaCursorLock = !state.mobaCursorLock;
      saveControlsConfig();
      syncControlsSettingsUI();
      if (!state.mobaCursorLock && state.cameraMode === 'aerial' && isPointerLocked()) unlockPointer();
      updateMobaVirtualCursorUI();
    };
  }
}

function bindControlsSlidersAndActions() {
  const mobaSlider = document.getElementById('input-ctrl-moba-speed');
  if (mobaSlider) {
    mobaSlider.oninput = () => {
      state.mobaCamSpeed = Math.max(50, Math.min(160, Number(mobaSlider.value) || 100)) / 100;
      syncControlsSettingsUI();
      saveControlsConfig();
    };
  }
  const tpsSlider = document.getElementById('input-ctrl-tps-sens');
  if (tpsSlider) {
    tpsSlider.oninput = () => {
      state.tpsSensitivity = Math.max(50, Math.min(160, Number(tpsSlider.value) || 100)) / 100;
      syncControlsSettingsUI();
      saveControlsConfig();
    };
  }
  const mobaCursorSlider = document.getElementById('input-ctrl-moba-cursor-sens');
  if (mobaCursorSlider) {
    mobaCursorSlider.oninput = () => {
      state.mobaCursorSensitivity = Math.max(40, Math.min(200, Number(mobaCursorSlider.value) || 100)) / 100;
      syncControlsSettingsUI();
      saveControlsConfig();
    };
  }
  const resetBtn = document.getElementById('btn-reset-controls');
  if (resetBtn) {
    resetBtn.onclick = () => {
      resetBtn.blur();
      resetControlsToDefault();
    };
  }
  const cancelBtn = document.getElementById('btn-cancel-rebind');
  if (cancelBtn) {
    cancelBtn.onclick = (e) => {
      if (e) e.stopPropagation();
      cancelBtn.blur();
      cancelControlRebind();
    };
  }
}

export function bindControlsCustomizerUI() {
  bindControlsToggleButtons();
  bindControlsSlidersAndActions();
}
