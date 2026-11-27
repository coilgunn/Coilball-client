import { DEFAULT_CONTROLS, escapeHtml, formatInputCode, setSafeHtml, state } from '../state.js';

export function formatActionKbdHtml(actionKey) {
  const slots = (state.controls && state.controls[actionKey]) || DEFAULT_CONTROLS[actionKey] || [];
  const active = slots.filter(Boolean);
  if (active.length === 0) return '<kbd>—</kbd>';
  return active.map((c) => `<kbd>${escapeHtml(formatInputCode(c))}</kbd>`).join(' / ');
}

function buildAerialControlsHelpHtml(ultLine, actionLabel, rolesTxt, toggleCamTxt, minimapTxt, fsTxt) {
  const recenterTxt = formatActionKbdHtml('recenterCam');
  const camLockTxt = formatActionKbdHtml('toggleCamLock');
  const mobaMoveTxt = formatActionKbdHtml('mobaMove');
  const dashTxt = formatActionKbdHtml('dash');
  const actionTxt = formatActionKbdHtml('action');
  const jumpTxt = formatActionKbdHtml('jump');
  return (
    `• ${mobaMoveTxt} (clic ou maintenu) : Déplacement au curseur<br>` +
    `• <strong>Bords d’écran / Flèches / Minimap</strong> : Caméra libre • ${camLockTxt} : Verrouiller • ${recenterTxt} : Recentrer<br>` +
    ultLine +
    `• ${dashTxt} : Dash (vers curseur) • ${actionTxt} : ${actionLabel} • ${jumpTxt} : Saut<br>` +
    `• ${rolesTxt} : Changer de position (Gauche G · Centre C · Droit D) • ${toggleCamTxt} : TPS • ${minimapTxt} : Minimap • ${fsTxt} : Plein écran`
  );
}

function buildTpsControlsHelpHtml(ultLine, actionLabel, rolesTxt, toggleCamTxt, minimapTxt, fsTxt) {
  const fwdTxt = formatActionKbdHtml('moveForward');
  const bwdTxt = formatActionKbdHtml('moveBackward');
  const leftTxt = formatActionKbdHtml('moveLeft');
  const rightTxt = formatActionKbdHtml('moveRight');
  const dashTxt = formatActionKbdHtml('dash');
  const actionTxt = formatActionKbdHtml('action');
  const jumpTxt = formatActionKbdHtml('jump');
  return (
    `• ${fwdTxt} ${leftTxt} ${bwdTxt} ${rightTxt} : Déplacer • <kbd>Souris</kbd> : Viser (caméra)<br>` +
    ultLine +
    `• ${actionTxt} : ${actionLabel} • ${dashTxt} : Dash • ${jumpTxt} : Saut<br>` +
    `• <kbd>Clic G / D</kbd> / ${rolesTxt} : Changer de position (Gauche G · Centre C · Droit D)<br>` +
    `• ${toggleCamTxt} : Caméra (TPS / MOBA) • ${minimapTxt} : Minimap • ${fsTxt} : Plein écran`
  );
}

export function updateControlsHelpForCameraMode() {
  const titleEl = document.getElementById('controls-help-title');
  const bodyEl = document.getElementById('controls-help-body');
  const ultTxt = formatActionKbdHtml('ultimate');
  const ultConfirmTxt = formatActionKbdHtml('ultConfirm');
  const toggleCamTxt = formatActionKbdHtml('toggleCam');
  const minimapTxt = `${formatActionKbdHtml('minimapSize')} / ${formatActionKbdHtml('minimapVision')}`;
  const fsTxt = formatActionKbdHtml('fullscreen');
  const rolesTxt = `${formatActionKbdHtml('roleG')} ${formatActionKbdHtml('roleC')} ${formatActionKbdHtml('roleD')} / ${formatActionKbdHtml('cycleRoleNext')}`;
  const ultLine = state.vanillaMode
    ? ''
    : `• ${ultTxt} puis ${ultConfirmTxt} : Viser &amp; lancer l’<strong>Ultimate</strong> (Ronde 2+, 1x/ronde sauf 🔥 évo)<br>`;
  const actionLabel = state.vanillaMode
    ? 'Passe (si débloquée) / Se relever'
    : 'Passe / Outil / Se relever';

  if (state.cameraMode === 'aerial') {
    if (titleEl) titleEl.textContent = 'Contrôles MOBA (Vue Aérienne)';
    if (bodyEl) {
      setSafeHtml(
        bodyEl,
        buildAerialControlsHelpHtml(ultLine, actionLabel, rolesTxt, toggleCamTxt, minimapTxt, fsTxt)
      );
    }
  } else {
    if (titleEl) titleEl.textContent = 'Contrôles (TPS 3e Personne)';
    if (bodyEl) {
      setSafeHtml(
        bodyEl,
        buildTpsControlsHelpHtml(ultLine, actionLabel, rolesTxt, toggleCamTxt, minimapTxt, fsTxt)
      );
    }
  }
}
