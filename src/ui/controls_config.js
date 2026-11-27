import {
  CONTROL_ACTIONS_META,
  DEFAULT_CONTROLS,
  cloneDefaultControls,
  state,
  ctx
} from '../state.js';
import { CONTROLS_STORAGE_KEY, LEGACY_CONTROLS_STORAGE_KEY } from './shared.js';
import { showToast } from './toast.js';
import { updateFullscreenButtonsUI } from './viewport.js';
import { updateControlsHelpForCameraMode } from './controls_help.js';

export function saveControlsConfig() {
  try {
    localStorage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({
        controls: state.controls,
        mobaEdgePan: !!state.mobaEdgePan,
        mobaCursorLock: !!state.mobaCursorLock,
        mobaCamSpeed: state.mobaCamSpeed,
        mobaCursorSensitivity: state.mobaCursorSensitivity,
        tpsSensitivity: state.tpsSensitivity,
        defaultCameraMode: state.defaultCameraMode === 'aerial' ? 'aerial' : 'tps',
        mobaMoveButton: state.mobaMoveButton === 'left' ? 'left' : 'right'
      })
    );
  } catch (_) { /* ignore */ }
}

function applyLoadedControlsPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.controls && typeof parsed.controls === 'object') {
    for (const key in DEFAULT_CONTROLS) {
      const arr = parsed.controls[key];
      if (!Array.isArray(arr)) continue;
      state.controls[key] = [
        typeof arr[0] === 'string' && arr[0] ? arr[0] : null,
        typeof arr[1] === 'string' && arr[1] ? arr[1] : null
      ];
    }
  }
  if (typeof parsed.mobaEdgePan === 'boolean') state.mobaEdgePan = parsed.mobaEdgePan;
  if (typeof parsed.mobaCursorLock === 'boolean') state.mobaCursorLock = parsed.mobaCursorLock;
  if (typeof parsed.mobaCamSpeed === 'number' && Number.isFinite(parsed.mobaCamSpeed)) {
    state.mobaCamSpeed = Math.max(0.5, Math.min(1.6, parsed.mobaCamSpeed));
  }
  if (typeof parsed.mobaCursorSensitivity === 'number' && Number.isFinite(parsed.mobaCursorSensitivity)) {
    state.mobaCursorSensitivity = Math.max(0.4, Math.min(2.0, parsed.mobaCursorSensitivity));
  }
  if (typeof parsed.tpsSensitivity === 'number' && Number.isFinite(parsed.tpsSensitivity)) {
    state.tpsSensitivity = Math.max(0.5, Math.min(1.6, parsed.tpsSensitivity));
  }
  if (parsed.defaultCameraMode === 'aerial' || parsed.defaultCameraMode === 'tps') {
    state.defaultCameraMode = parsed.defaultCameraMode;
  }
  return parsed.mobaMoveButton === 'left' || parsed.mobaMoveButton === 'right' ? parsed.mobaMoveButton : null;
}

export function syncControlsSettingsUI() {
  const defaultCamBtn = document.getElementById('btn-opt-default-cam');
  if (defaultCamBtn) {
    const isMoba = state.defaultCameraMode === 'aerial';
    defaultCamBtn.textContent = isMoba ? '🎥 Caméra par défaut : MOBA' : '🎥 Caméra par défaut : TPS';
    defaultCamBtn.classList.toggle('active-mode-pill', isMoba);
  }
  const mobaClickBtn = document.getElementById('btn-opt-moba-click');
  if (mobaClickBtn) {
    const isLeft = state.mobaMoveButton === 'left';
    mobaClickBtn.textContent = isLeft ? '🖱️ Déplacement MOBA : Clic Gauche' : '🖱️ Déplacement MOBA : Clic Droit';
    mobaClickBtn.classList.toggle('active-mode-pill', !isLeft);
  }
  const edgeBtn = document.getElementById('btn-ctrl-edge-pan');
  if (edgeBtn) {
    edgeBtn.textContent = state.mobaEdgePan ? "🖥️ Défilement bord d'écran MOBA : ON" : "🖥️ Défilement bord d'écran MOBA : OFF";
    edgeBtn.classList.toggle('active-mode-pill', !!state.mobaEdgePan);
  }
  const lockBtn = document.getElementById('btn-ctrl-moba-cursor-lock');
  if (lockBtn) {
    lockBtn.textContent = state.mobaCursorLock ? '🔒 Curseur confiné en MOBA : ON' : '🔓 Curseur confiné en MOBA : OFF';
    lockBtn.classList.toggle('active-mode-pill', !!state.mobaCursorLock);
  }
  const mobaSlider = document.getElementById('input-ctrl-moba-speed');
  const mobaVal = document.getElementById('ctrl-moba-speed-val');
  const mobaPct = Math.round((state.mobaCamSpeed || 1.0) * 100);
  if (mobaSlider) mobaSlider.value = String(mobaPct);
  if (mobaVal) mobaVal.textContent = `${mobaPct}%`;

  const tpsSlider = document.getElementById('input-ctrl-tps-sens');
  const tpsVal = document.getElementById('ctrl-tps-sens-val');
  const tpsPct = Math.round((state.tpsSensitivity || 1.0) * 100);
  if (tpsSlider) tpsSlider.value = String(tpsPct);
  if (tpsVal) tpsVal.textContent = `${tpsPct}%`;

  const mobaCursorSlider = document.getElementById('input-ctrl-moba-cursor-sens');
  const mobaCursorVal = document.getElementById('ctrl-moba-cursor-sens-val');
  const mobaCursorPct = Math.round((state.mobaCursorSensitivity || 1.0) * 100);
  if (mobaCursorSlider) mobaCursorSlider.value = String(mobaCursorPct);
  if (mobaCursorVal) mobaCursorVal.textContent = `${mobaCursorPct}%`;
}

export function loadControlsConfig() {
  state.controls = cloneDefaultControls();
  state.defaultCameraMode = 'tps';
  state.mobaMoveButton = 'right';
  let loadedMobaBtn = null;
  try {
    const raw = localStorage.getItem(CONTROLS_STORAGE_KEY);
    if (raw) {
      loadedMobaBtn = applyLoadedControlsPayload(JSON.parse(raw));
    } else {
      const legacyRaw = localStorage.getItem(LEGACY_CONTROLS_STORAGE_KEY);
      if (legacyRaw) loadedMobaBtn = applyLoadedControlsPayload(JSON.parse(legacyRaw));
    }
  } catch (_) { /* ignore */ }

  if (loadedMobaBtn) {
    state.mobaMoveButton = loadedMobaBtn;
    const expectedCode = loadedMobaBtn === 'left' ? 'Mouse0' : 'Mouse2';
    const slots = Array.isArray(state.controls.mobaMove) ? state.controls.mobaMove : [expectedCode, null];
    slots[0] = expectedCode;
    if (slots[1] === expectedCode) slots[1] = null;
    state.controls.mobaMove = slots;
  } else {
    state.mobaMoveButton = state.controls.mobaMove && state.controls.mobaMove[0] === 'Mouse0' ? 'left' : 'right';
  }

  syncControlsSettingsUI();
  ctx.api.renderControlsCustomizer?.();
  updateControlsHelpForCameraMode();
  updateFullscreenButtonsUI();
}

export function cancelControlRebind() {
  if (!state.rebindingState) return;
  state.rebindingState = null;
  const banner = document.getElementById('controls-rebind-banner');
  if (banner) banner.classList.add('hidden');
  ctx.api.renderControlsCustomizer?.();
}

export function setControlBinding(actionKey, slotIndex, code) {
  if (!state.controls) state.controls = cloneDefaultControls();
  if (!Array.isArray(state.controls[actionKey])) {
    state.controls[actionKey] = [...(DEFAULT_CONTROLS[actionKey] || [null, null])];
  }
  const slots = state.controls[actionKey];
  if (code) {
    const otherIdx = slotIndex === 0 ? 1 : 0;
    if (slots[otherIdx] === code) slots[otherIdx] = null;
  }
  slots[slotIndex] = code || null;
  if (actionKey === 'mobaMove' && slotIndex === 0) {
    if (code === 'Mouse0') state.mobaMoveButton = 'left';
    else if (code === 'Mouse2') state.mobaMoveButton = 'right';
  }
  saveControlsConfig();
  syncControlsSettingsUI();
  updateControlsHelpForCameraMode();
  updateFullscreenButtonsUI();
  ctx.api.renderControlsCustomizer?.();
}

export function startControlRebind(actionKey, slotIndex) {
  const meta = CONTROL_ACTIONS_META.find((m) => m.key === actionKey);
  if (!meta) return;
  state.rebindingState = { actionKey, slotIndex };
  const banner = document.getElementById('controls-rebind-banner');
  const labelEl = document.getElementById('controls-rebind-label');
  if (labelEl) labelEl.textContent = `Modification : ${meta.label} (Touche ${slotIndex + 1})`;
  if (banner) banner.classList.remove('hidden');
  ctx.api.renderControlsCustomizer?.();
}

export function resetControlsToDefault() {
  cancelControlRebind();
  state.controls = cloneDefaultControls();
  state.mobaEdgePan = true;
  state.mobaCursorLock = true;
  state.mobaCamSpeed = 1.0;
  state.mobaCursorSensitivity = 1.0;
  state.tpsSensitivity = 1.0;
  state.defaultCameraMode = 'tps';
  state.mobaMoveButton = 'right';
  saveControlsConfig();
  syncControlsSettingsUI();
  ctx.api.renderControlsCustomizer?.();
  updateControlsHelpForCameraMode();
  updateFullscreenButtonsUI();
  showToast('🔄 <strong>Contrôles réinitialisés par défaut !</strong>', 2000);
}
