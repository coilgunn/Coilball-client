import { state, ctx } from '../state.js';
import {
  audioState,
  settings,
  lastPlayedMs,
  midiToHz,
  ensureAudioContext,
  tone,
  noise,
  arpeggio
} from './shared.js';

function createSpatialTarget(bus, opts = {}) {
  const ac = audioState.audioCtx;
  const pos = opts && opts.pos;
  if (!pos || typeof pos.x !== 'number' || typeof pos.z !== 'number') {
    return { dest: bus, gainMult: 1.0 };
  }

  const refPlayer = ctx.api.getPlayer?.(state.myTeam, state.controlledRole);
  const refX =
    state.cameraMode === 'aerial' && state.mobaCamInitialized
      ? state.mobaCamX
      : refPlayer
      ? refPlayer.pos.x
      : 0;
  const refZ =
    state.cameraMode === 'aerial' && state.mobaCamInitialized
      ? state.mobaCamZ
      : refPlayer
      ? refPlayer.pos.z
      : 0;

  const dx = pos.x - refX;
  const dz = pos.z - refZ;
  const dist = Math.hypot(dx, dz);

  const maxDist = opts.global ? 180 : 105;
  const minFloor = opts.global ? 0.28 : 0.08;
  let gainMult = 1.0;
  if (dist > 14) {
    const t = Math.min(1, (dist - 14) / Math.max(1, maxDist - 14));
    gainMult = Math.max(minFloor, 1 - t * (1 - minFloor));
  }
  if (!opts.global && dist > maxDist + 20) {
    return { dest: null, gainMult: 0 };
  }

  if (typeof ac.createStereoPanner !== 'function' || dist < 1.5) {
    return { dest: bus, gainMult };
  }

  const rightX = state.cameraMode === 'aerial' ? 1 : Math.cos(state.camYaw || 0);
  const rightZ = state.cameraMode === 'aerial' ? 0 : -Math.sin(state.camYaw || 0);
  const panRaw = (dx * rightX + dz * rightZ) / Math.max(18, dist);
  const panner = ac.createStereoPanner();
  panner.pan.value = Math.max(-0.82, Math.min(0.82, panRaw));
  panner.connect(bus);
  return { dest: panner, gainMult };
}

const COOLDOWNS_MS = {
  ui_hover: 45,
  ui_click: 35,
  ice_slide: 180,
  dash_wall_bounce: 70,
  pad_boost: 160,
  back_reveal: 220
};

const SOUND_LIBRARY = {
  ui_hover(dest, g) {
    tone(dest, { type: 'triangle', freq: midiToHz(88), freqEnd: midiToHz(92), dur: 0.032, vol: 0.065 * g });
  },
  ui_click(dest, g) {
    tone(dest, { type: 'square', freq: midiToHz(76), freqEnd: midiToHz(83), dur: 0.048, vol: 0.095 * g, filterType: 'lowpass', filterFreq: 2600 });
    tone(dest, { type: 'triangle', freq: midiToHz(88), dur: 0.06, start: 0.012, vol: 0.09 * g });
  },
  ui_confirm(dest, g) {
    arpeggio(dest, [76, 80, 83, 88], { step: 0.038, dur: 0.19, vol: 0.14 * g, type: 'triangle', shimmer: true });
  },
  ui_cancel(dest, g) {
    arpeggio(dest, [83, 80, 76], { step: 0.036, dur: 0.11, vol: 0.11 * g, type: 'triangle', shimmer: false });
  },
  ui_tab(dest, g) {
    tone(dest, { type: 'triangle', freq: midiToHz(78), freqEnd: midiToHz(83), dur: 0.065, vol: 0.11 * g });
    tone(dest, { type: 'sine', freq: midiToHz(90), start: 0.02, dur: 0.075, vol: 0.07 * g });
  },
  ui_modal_open(dest, g) {
    arpeggio(dest, [71, 76, 80, 83], { step: 0.028, dur: 0.14, vol: 0.1 * g, type: 'triangle', shimmer: true });
  },
  ui_modal_close(dest, g) {
    tone(dest, { type: 'triangle', freq: midiToHz(80), freqEnd: midiToHz(71), dur: 0.1, vol: 0.095 * g });
  },
  ui_color_pick(dest, g, opts) {
    const baseMidi = opts.color === 'green' ? 76 : opts.color === 'red' ? 80 : 83;
    arpeggio(dest, [baseMidi, baseMidi + 7, baseMidi + 12], { step: 0.032, dur: 0.14, vol: 0.12 * g, type: 'triangle', shimmer: true });
  },
  ui_error(dest, g) {
    tone(dest, { type: 'sawtooth', freq: midiToHz(65), dur: 0.08, vol: 0.11 * g, filterType: 'lowpass', filterFreq: 1300 });
    tone(dest, { type: 'sawtooth', freq: midiToHz(62), start: 0.085, dur: 0.12, vol: 0.11 * g, filterType: 'lowpass', filterFreq: 1100 });
  },
  shop_buy(dest, g) {
    tone(dest, { type: 'square', freq: midiToHz(83), dur: 0.06, vol: 0.11 * g, filterType: 'lowpass', filterFreq: 3800 });
    tone(dest, { type: 'square', freq: midiToHz(88), start: 0.055, dur: 0.2, vol: 0.12 * g, filterType: 'lowpass', filterFreq: 4200 });
    arpeggio(dest, [76, 80, 83, 86, 88], { start: 0.055, step: 0.035, dur: 0.22, vol: 0.11 * g, type: 'triangle', shimmer: true });
  },
  prep_tick(dest, g, opts) {
    const urgent = !!opts.urgent;
    tone(dest, { type: 'square', freq: midiToHz(urgent ? 88 : 81), dur: urgent ? 0.09 : 0.055, vol: (urgent ? 0.13 : 0.08) * g, filterType: 'lowpass', filterFreq: 2800 });
  },

  role_switch(dest, g, opts) {
    const pitch = opts.role === 'G' ? 76 : opts.role === 'C' ? 79 : 83;
    tone(dest, { type: 'triangle', freq: midiToHz(pitch - 5), freqEnd: midiToHz(pitch), dur: 0.06, vol: 0.13 * g });
    tone(dest, { type: 'square', freq: midiToHz(pitch + 12), start: 0.025, dur: 0.065, vol: 0.05 * g, filterType: 'lowpass', filterFreq: 3400 });
  },
  cam_toggle(dest, g, opts) {
    const aerial = opts.mode === 'aerial';
    tone(dest, { type: 'sine', freq: aerial ? 420 : 880, freqEnd: aerial ? 960 : 440, dur: 0.12, vol: 0.11 * g });
    noise(dest, { dur: 0.1, vol: 0.06 * g, filterType: 'bandpass', filterFreq: aerial ? 1200 : 2600, filterEnd: aerial ? 2800 : 1100 });
  },
  dash(dest, g, opts) {
    const isSuper = !!opts.isSuper;
    noise(dest, { dur: isSuper ? 0.22 : 0.16, vol: (isSuper ? 0.22 : 0.17) * g, filterType: 'bandpass', filterFreq: 2600, filterEnd: 620, filterQ: 1.8 });
    tone(dest, { type: 'square', freq: isSuper ? 780 : 620, freqEnd: 210, dur: 0.13, vol: 0.12 * g, filterType: 'lowpass', filterFreq: 2200 });
    if (isSuper) arpeggio(dest, [83, 88], { step: 0.03, dur: 0.12, vol: 0.09 * g, shimmer: true });
  },
  dash_bounce(dest, g) {
    tone(dest, { type: 'triangle', freq: 320, freqEnd: 860, dur: 0.14, vol: 0.16 * g });
    noise(dest, { dur: 0.14, vol: 0.14 * g, filterFreq: 2200, filterEnd: 900 });
  },
  dash_wall_bounce(dest, g, opts) {
    const idx = Math.max(0, Math.min(3, Number(opts.bounceIndex) || 1));
    const root = 74 + idx * 3;
    tone(dest, { type: 'triangle', freq: midiToHz(root - 7), freqEnd: midiToHz(root + 5), dur: 0.13, vol: 0.22 * g });
    tone(dest, { type: 'square', freq: midiToHz(root + 12), start: 0.025, dur: 0.11, vol: 0.09 * g, filterType: 'lowpass', filterFreq: 3600 });
  },
  dash_slide(dest, g) {
    noise(dest, { dur: 0.34, vol: 0.18 * g, filterType: 'highpass', filterFreq: 2600, filterEnd: 4600, filterQ: 2.2 });
    arpeggio(dest, [88, 91, 95, 98], { step: 0.035, dur: 0.14, vol: 0.08 * g, type: 'sine', shimmer: false });
  },
  ice_slide(dest, g) {
    noise(dest, { dur: 0.18, vol: 0.11 * g, filterType: 'bandpass', filterFreq: 4200, filterEnd: 2400, filterQ: 3.5 });
    tone(dest, { type: 'sine', freq: midiToHz(95), freqEnd: midiToHz(91), dur: 0.1, vol: 0.07 * g });
  },
  dash_boomerang(dest, g) {
    tone(dest, { type: 'triangle', freq: 520, freqEnd: 980, dur: 0.11, vol: 0.15 * g });
    tone(dest, { type: 'triangle', freq: 980, freqEnd: 640, start: 0.1, dur: 0.12, vol: 0.12 * g });
    noise(dest, { dur: 0.18, vol: 0.13 * g, filterFreq: 1800, filterEnd: 3200 });
  },
  dash_boomerang_return(dest, g) {
    tone(dest, { type: 'triangle', freq: 440, freqEnd: 1320, dur: 0.18, vol: 0.18 * g });
    arpeggio(dest, [80, 83, 88], { step: 0.032, dur: 0.14, vol: 0.11 * g, shimmer: true });
  },
  jump(dest, g, opts) {
    const isSuper = !!opts.super;
    tone(dest, { type: 'square', freq: isSuper ? 290 : 250, freqEnd: isSuper ? 880 : 620, dur: isSuper ? 0.19 : 0.14, vol: 0.13 * g, filterType: 'lowpass', filterFreq: 2400 });
    if (isSuper) tone(dest, { type: 'triangle', freq: midiToHz(88), start: 0.05, dur: 0.14, vol: 0.1 * g });
  },
  sky_launch(dest, g) {
    tone(dest, { type: 'sawtooth', freq: 240, freqEnd: 1080, dur: 0.34, vol: 0.14 * g, filterType: 'lowpass', filterFreq: 2800 });
    noise(dest, { dur: 0.38, vol: 0.2 * g, filterType: 'bandpass', filterFreq: 900, filterEnd: 3600, filterQ: 1.5 });
    arpeggio(dest, [76, 80, 83, 88, 92], { step: 0.04, dur: 0.18, vol: 0.11 * g, shimmer: true });
  },
  sky_land(dest, g) {
    tone(dest, { type: 'sine', freq: 170, freqEnd: 52, dur: 0.16, vol: 0.26 * g });
    noise(dest, { dur: 0.11, vol: 0.16 * g, filterType: 'lowpass', filterFreq: 1200, filterEnd: 280 });
    tone(dest, { type: 'triangle', freq: midiToHz(83), start: 0.02, dur: 0.1, vol: 0.09 * g });
  },

  ball_pickup(dest, g) {
    arpeggio(dest, [76, 83, 88], { step: 0.032, dur: 0.12, vol: 0.15 * g, type: 'triangle', shimmer: true });
  },
  pass_charge(dest, g) {
    tone(dest, { type: 'sine', freq: midiToHz(71), freqEnd: midiToHz(83), dur: 0.22, vol: 0.09 * g });
  },
  ball_pass(dest, g) {
    tone(dest, { type: 'triangle', freq: 480, freqEnd: 1180, dur: 0.14, vol: 0.17 * g });
    tone(dest, { type: 'sine', freq: midiToHz(88), start: 0.04, dur: 0.14, vol: 0.12 * g });
    noise(dest, { dur: 0.1, vol: 0.11 * g, filterFreq: 2400, filterEnd: 1200 });
  },
  ball_throw(dest, g) {
    tone(dest, { type: 'square', freq: 520, freqEnd: 220, dur: 0.11, vol: 0.12 * g, filterType: 'lowpass', filterFreq: 2200 });
    noise(dest, { dur: 0.13, vol: 0.16 * g, filterFreq: 2000, filterEnd: 700 });
  },
  stand_up(dest, g) {
    arpeggio(dest, [71, 76, 80, 83, 88, 92], { step: 0.038, dur: 0.22, vol: 0.16 * g, type: 'triangle', shimmer: true });
  },
  tool_beacon(dest, g) {
    tone(dest, { type: 'sine', freq: midiToHz(86), dur: 0.11, vol: 0.16 * g });
    tone(dest, { type: 'sine', freq: midiToHz(93), start: 0.09, dur: 0.24, vol: 0.15 * g });
    tone(dest, { type: 'triangle', freq: midiToHz(74), start: 0.09, dur: 0.18, vol: 0.08 * g });
  },
  tool_wall(dest, g) {
    tone(dest, { type: 'sine', freq: 150, freqEnd: 48, dur: 0.18, vol: 0.26 * g });
    tone(dest, { type: 'square', freq: 240, freqEnd: 120, dur: 0.12, vol: 0.12 * g, filterType: 'lowpass', filterFreq: 1100 });
    noise(dest, { dur: 0.14, vol: 0.19 * g, filterType: 'lowpass', filterFreq: 1300, filterEnd: 260 });
  },
  tool_pad(dest, g) {
    arpeggio(dest, [72, 79, 84, 91], { step: 0.032, dur: 0.14, vol: 0.14 * g, type: 'square', shimmer: false });
  },
  pad_boost(dest, g) {
    tone(dest, { type: 'sawtooth', freq: 330, freqEnd: 1320, dur: 0.28, vol: 0.14 * g, filterType: 'lowpass', filterFreq: 3400 });
    arpeggio(dest, [76, 80, 83, 88, 92], { step: 0.03, dur: 0.16, vol: 0.11 * g, shimmer: true });
    noise(dest, { dur: 0.24, vol: 0.15 * g, filterFreq: 1600, filterEnd: 4200 });
  },

  back_reveal(dest, g) {
    tone(dest, { type: 'triangle', freq: midiToHz(83), dur: 0.06, vol: 0.14 * g });
    tone(dest, { type: 'triangle', freq: midiToHz(90), start: 0.048, dur: 0.15, vol: 0.15 * g });
    tone(dest, { type: 'sine', freq: midiToHz(95), start: 0.048, dur: 0.18, vol: 0.09 * g });
  },
  intercept_ally(dest, g) {
    tone(dest, { type: 'sine', freq: 190, freqEnd: 55, dur: 0.16, vol: 0.28 * g });
    noise(dest, { dur: 0.12, vol: 0.2 * g, filterType: 'bandpass', filterFreq: 1500, filterEnd: 400 });
    arpeggio(dest, [80, 83, 88, 92], { start: 0.04, step: 0.036, dur: 0.18, vol: 0.14 * g, shimmer: true });
  },
  intercept_enemy(dest, g) {
    tone(dest, { type: 'sine', freq: 165, freqEnd: 48, dur: 0.18, vol: 0.26 * g });
    noise(dest, { dur: 0.13, vol: 0.18 * g, filterType: 'lowpass', filterFreq: 1100, filterEnd: 240 });
    arpeggio(dest, [74, 71, 67], { start: 0.04, step: 0.05, dur: 0.15, vol: 0.12 * g, type: 'sawtooth', shimmer: false });
  },
  water_shield_block(dest, g) {
    tone(dest, { type: 'sine', freq: 920, freqEnd: 1680, dur: 0.16, vol: 0.16 * g });
    arpeggio(dest, [84, 88, 91, 96], { step: 0.03, dur: 0.16, vol: 0.1 * g, type: 'sine', shimmer: false });
    noise(dest, { dur: 0.16, vol: 0.13 * g, filterType: 'bandpass', filterFreq: 3200, filterEnd: 1400, filterQ: 2.2 });
  },
  rule1_lock(dest, g) {
    tone(dest, { type: 'sawtooth', freq: 220, freqEnd: 440, dur: 0.18, vol: 0.15 * g, filterType: 'bandpass', filterFreq: 1400, filterQ: 3 });
    tone(dest, { type: 'square', freq: 311, freqEnd: 622, start: 0.06, dur: 0.2, vol: 0.12 * g, filterType: 'lowpass', filterFreq: 2400 });
    noise(dest, { dur: 0.22, vol: 0.18 * g, filterType: 'highpass', filterFreq: 2200, filterEnd: 900 });
  },

  ult_aim(dest, g) {
    arpeggio(dest, [76, 83, 87], { step: 0.028, dur: 0.11, vol: 0.11 * g, type: 'triangle', shimmer: true });
  },
  ult_cancel(dest, g) {
    tone(dest, { type: 'triangle', freq: midiToHz(83), freqEnd: midiToHz(74), dur: 0.1, vol: 0.1 * g });
  },
  ult_fire_charge(dest, g, opts) {
    const evo = !!opts.evolved;
    tone(dest, { type: 'sawtooth', freq: evo ? 180 : 210, freqEnd: evo ? 1240 : 980, dur: 0.48, vol: (evo ? 0.18 : 0.14) * g, attack: 0.08, filterType: 'lowpass', filterFreq: 700, filterEnd: 4600 });
    tone(dest, { type: 'square', freq: 420, freqEnd: 1680, start: 0.12, dur: 0.36, vol: 0.08 * g, detune: 10, filterType: 'bandpass', filterFreq: 1800, filterEnd: 4200 });
  },
  ult_fire_beam(dest, g, opts) {
    const evo = !!opts.evolved;
    tone(dest, { type: 'sine', freq: 180, freqEnd: 38, dur: 0.32, vol: (evo ? 0.34 : 0.28) * g });
    tone(dest, { type: 'sawtooth', freq: evo ? 920 : 780, freqEnd: 140, dur: 0.34, vol: (evo ? 0.2 : 0.16) * g, filterType: 'lowpass', filterFreq: 4800, filterEnd: 600 });
    noise(dest, { dur: evo ? 0.42 : 0.32, vol: (evo ? 0.28 : 0.22) * g, filterType: 'bandpass', filterFreq: 2800, filterEnd: 450, filterQ: 1.1 });
  },
  ult_fire_hit(dest, g, opts) {
    tone(dest, { type: 'sine', freq: 210, freqEnd: 52, dur: 0.22, vol: 0.3 * g });
    noise(dest, { dur: 0.18, vol: 0.22 * g, filterFreq: 2200, filterEnd: 380 });
    arpeggio(dest, opts.ally ? [80, 83, 88, 95] : [74, 71, 67], { start: 0.03, step: 0.035, dur: 0.2, vol: 0.14 * g, shimmer: !!opts.ally });
  },
  ult_leaf_sprint(dest, g, opts) {
    const notes = opts.evolved ? [74, 78, 81, 86, 90, 93] : [74, 78, 81, 86, 90];
    arpeggio(dest, notes, { step: 0.04, dur: 0.22, vol: 0.15 * g, type: 'triangle', shimmer: true });
    noise(dest, { dur: 0.36, vol: 0.16 * g, filterType: 'bandpass', filterFreq: 1400, filterEnd: 3400, filterQ: 1.6 });
  },
  ult_leaf_grow(dest, g, opts) {
    const evo = !!opts.evolved;
    tone(dest, { type: 'sine', freq: 115, freqEnd: 58, dur: 0.26, vol: (evo ? 0.28 : 0.22) * g });
    noise(dest, { dur: 0.3, vol: 0.2 * g, filterType: 'bandpass', filterFreq: 680, filterEnd: 2100, filterQ: 1.4 });
    arpeggio(dest, [69, 74, 78, 81], { start: 0.04, step: 0.038, dur: 0.22, vol: 0.12 * g, shimmer: evo });
  },
  ult_water_wave(dest, g, opts) {
    const evo = !!opts.evolved;
    noise(dest, { dur: evo ? 0.72 : 0.55, vol: (evo ? 0.26 : 0.22) * g, attack: 0.04, filterType: 'bandpass', filterFreq: 650, filterEnd: 2600, filterQ: 1.3 });
    arpeggio(dest, evo ? [72, 76, 79, 83, 86, 91] : [72, 76, 79, 84], { step: 0.048, dur: 0.24, vol: 0.12 * g, type: 'sine', shimmer: false });
  },
  ult_water_pull(dest, g) {
    noise(dest, { dur: 0.34, vol: 0.22 * g, filterType: 'bandpass', filterFreq: 3200, filterEnd: 520, filterQ: 2.0 });
    tone(dest, { type: 'sine', freq: 1120, freqEnd: 320, dur: 0.26, vol: 0.18 * g });
    arpeggio(dest, [88, 83, 79, 76], { step: 0.035, dur: 0.16, vol: 0.11 * g, type: 'triangle', shimmer: true });
  },

  round_start(dest, g) {
    arpeggio(dest, [76, 78, 80, 83, 88], { step: 0.062, dur: 0.26, vol: 0.15 * g, type: 'triangle', shimmer: true });
    tone(dest, { type: 'square', freq: midiToHz(64), start: 0.248, dur: 0.28, vol: 0.09 * g, filterType: 'lowpass', filterFreq: 1600 });
  },
  goal_ally(dest, g) {
    const melody = [
      { m: 76, t: 0.0, d: 0.13 }, { m: 80, t: 0.08, d: 0.13 }, { m: 83, t: 0.16, d: 0.14 },
      { m: 88, t: 0.25, d: 0.42 }, { m: 90, t: 0.34, d: 0.34 }, { m: 92, t: 0.42, d: 0.48 }
    ];
    melody.forEach((n) => {
      tone(dest, { type: 'triangle', freq: midiToHz(n.m), start: n.t, dur: n.d, vol: 0.17 * g });
      tone(dest, { type: 'square', freq: midiToHz(n.m + 12), start: n.t, dur: n.d * 0.65, vol: 0.055 * g, detune: 8, filterType: 'lowpass', filterFreq: 4400 });
    });
    tone(dest, { type: 'sine', freq: midiToHz(52), start: 0.25, dur: 0.45, vol: 0.22 * g });
  },
  goal_enemy(dest, g) {
    arpeggio(dest, [76, 75, 71, 68], { step: 0.085, dur: 0.26, vol: 0.14 * g, type: 'sawtooth', shimmer: false });
    tone(dest, { type: 'sine', freq: midiToHz(52), start: 0.25, dur: 0.35, vol: 0.18 * g });
  },
  tut_check(dest, g) {
    arpeggio(dest, [81, 88], { step: 0.045, dur: 0.18, vol: 0.14 * g, type: 'triangle', shimmer: true });
  },
  tut_step_clear(dest, g) {
    arpeggio(dest, [76, 80, 83, 88, 92], { step: 0.05, dur: 0.24, vol: 0.15 * g, type: 'triangle', shimmer: true });
  },
  round_end(dest, g) {
    arpeggio(dest, [83, 80, 76, 83], { step: 0.075, dur: 0.26, vol: 0.14 * g, type: 'triangle', shimmer: true });
  },
  victory(dest, g) {
    const seq = [
      { m: 73, t: 0.0, d: 0.14 }, { m: 76, t: 0.09, d: 0.14 }, { m: 80, t: 0.18, d: 0.14 },
      { m: 81, t: 0.28, d: 0.16 }, { m: 83, t: 0.4, d: 0.16 },
      { m: 88, t: 0.52, d: 0.55 }, { m: 90, t: 0.56, d: 0.52 }, { m: 92, t: 0.6, d: 0.6 }
    ];
    seq.forEach((n) => {
      tone(dest, { type: 'triangle', freq: midiToHz(n.m), start: n.t, dur: n.d, vol: 0.16 * g });
      tone(dest, { type: 'square', freq: midiToHz(n.m), start: n.t, dur: n.d * 0.75, vol: 0.07 * g, detune: 9, filterType: 'lowpass', filterFreq: 3800 });
    });
    tone(dest, { type: 'sine', freq: midiToHz(52), start: 0.52, dur: 0.65, vol: 0.22 * g });
  },
  defeat(dest, g) {
    [
      { m: 76, t: 0.0, d: 0.2 }, { m: 74, t: 0.18, d: 0.2 },
      { m: 71, t: 0.36, d: 0.22 }, { m: 69, t: 0.56, d: 0.48 }
    ].forEach((n) => {
      tone(dest, { type: 'triangle', freq: midiToHz(n.m), start: n.t, dur: n.d, vol: 0.15 * g });
    });
  }
};

export function playSfx(name, opts = {}) {
  const fn = SOUND_LIBRARY[name];
  if (!fn || settings.muted || settings.masterVolume <= 0.001) return;

  const ac = ensureAudioContext();
  if (!ac || ac.state !== 'running') return;

  const cd = COOLDOWNS_MS[name] || 0;
  if (cd > 0) {
    const now = performance.now();
    const prev = lastPlayedMs.get(name) || 0;
    if (now - prev < cd) return;
    lastPlayedMs.set(name, now);
  }

  const isUi = name.startsWith('ui_') || name === 'shop_buy' || name === 'prep_tick';
  const bus = isUi ? audioState.uiBus : audioState.sfxBus;
  const { dest, gainMult } = isUi ? { dest: bus, gainMult: 1.0 } : createSpatialTarget(bus, opts);
  if (!dest || gainMult <= 0.001) return;

  const volMult = typeof opts.volume === 'number' ? opts.volume : 1.0;
  fn(dest, gainMult * volMult, opts);
}
