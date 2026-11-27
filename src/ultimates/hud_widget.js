import { TUTORIAL_TOTAL_STEPS, TUTORIAL_STEPS, state } from '../state.js';
import { getPlayer } from '../render3d.js';
import {
  LEAF_ULT_SPEED_MULT,
  hasPlayerUltEvo,
  getUltimateMeta,
  isUltimateUnlocked,
  canReactivateWaterUlt
} from './shared.js';

function resolveUltHudDisplay(p, meta) {
  if (!isUltimateUnlocked()) {
    return {
      classes: ['ult-locked'],
      title: `Ultimate (${p.role}) : ${meta.name}`,
      sub: state.mode === 'tutorial'
        ? `🔒 Débloqué à l’étape ${TUTORIAL_STEPS.ULTIMATE}/${TUTORIAL_TOTAL_STEPS} du tutoriel • 1x/ronde`
        : '🔒 Débloqué dès la Ronde 2 • 1x/ronde (sauf 🔥 évo)'
    };
  }
  if (canReactivateWaterUlt(p)) {
    return {
      classes: ['ult-ready-blue', 'ult-preview-active'],
      title: `💧 [R] RÉACTIVER : Ramener (${p.activeReactivableWave.pullWindowTimer.toFixed(1)}s)`,
      sub: 'Appuyez sur R pour ramener les joueuses touchées !'
    };
  }
  if (p.leafUltTimer > 0) {
    const mult = p.leafUltSpeedMult || LEAF_ULT_SPEED_MULT;
    return {
      classes: ['ult-ready-green', 'ult-preview-active'],
      title: `🌿 Sprint ${mult}x en cours (${p.leafUltTimer.toFixed(1)}s)`,
      sub: 'Sème des germes → Mur organique 1s après la fin !'
    };
  }
  if (p.ultCooldown > 0) {
    return {
      classes: ['ult-locked'],
      title: `🔥 2e charge Feu (${p.ultCooldown.toFixed(1)}s)`,
      sub: 'Bref cooldown de 3s entre les 2 charges...'
    };
  }
  if (p.ultUsed) {
    return {
      classes: ['ult-used'],
      title: `Ultimate (${p.role}) : ${meta.name}`,
      sub: p.color === 'red' && hasPlayerUltEvo(p)
        ? '✔ 2/2 charges utilisées pour cette ronde'
        : '✔ Utilisé pour cette ronde (1x/ronde)'
    };
  }
  if (p.carryingBall) {
    return {
      classes: ['ult-locked'],
      title: `Ultimate (${p.role}) : ${meta.name}`,
      sub: '⚽ Indisponible en portant le ballon'
    };
  }
  if (p.state !== 'standing') {
    return {
      classes: ['ult-locked'],
      title: `Ultimate (${p.role}) : ${meta.name}`,
      sub: '⚠️ Joueuse immobilisée'
    };
  }
  if (state.ultPreviewActive) {
    return {
      classes: [`ult-ready-${p.color}`, 'ult-preview-active'],
      title: `🎯 VISÉE ACTIVE : ${meta.name}`,
      sub: 'Clic Gauche : Confirmer & Tirer • [R] : Annuler'
    };
  }
  const freqHint = p.color === 'red' && hasPlayerUltEvo(p) ? '2 charges (Évo 🔥)' : '1x/ronde';
  return {
    classes: [`ult-ready-${p.color}`],
    title: `[R] Ultimate (${p.role}) : ${meta.name}`,
    sub: `${freqHint} • [R] puis Clic Gauche`
  };
}

export function updateUltHudWidget() {
  const widget = document.getElementById('ult-hud-widget');
  if (!widget) return;
  if (state.phase !== 'play' || state.vanillaMode) {
    widget.classList.add('hidden');
    return;
  }
  widget.classList.remove('hidden');

  const p = getPlayer(state.myTeam, state.controlledRole);
  if (!p) return;

  const iconEl = document.getElementById('ult-hud-icon');
  const titleEl = document.getElementById('ult-hud-title');
  const subEl = document.getElementById('ult-hud-sub');
  const meta = getUltimateMeta(p.color, p);

  widget.classList.remove(
    'ult-locked',
    'ult-used',
    'ult-ready-red',
    'ult-ready-green',
    'ult-ready-blue',
    'ult-preview-active'
  );

  if (iconEl) iconEl.textContent = meta.icon;
  const display = resolveUltHudDisplay(p, meta);
  widget.classList.add(...display.classes);
  if (titleEl) titleEl.textContent = display.title;
  if (subEl) subEl.textContent = display.sub;
}
