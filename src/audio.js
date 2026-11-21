// ============================================================================
// COILBALL 3D — AUDIO PROCÉDURAL : BRUITAGES & THÈMES EN BOUCLE (ARCADE / J-POP)
// Web Audio API pure : spatialisation, UI déléguée, 2 boucles & panneau d'options
// ============================================================================

import { state, ctx } from './state.js';

const AUDIO_STORAGE_KEY = 'coilball_audio_v2';
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// --- ÉTAT DU MOTEUR AUDIO ---
let audioCtx = null;
let masterGain = null;
let musicBus = null;
let musicFilter = null;
let sfxBus = null;
let uiBus = null;
let compressor = null;
let noiseBuffer = null;
let initialized = false;

const settings = {
  muted: false,
  masterVolume: 0.72,
  musicVolume: 0.42,
  sfxVolume: 0.9,
  uiVolume: 0.75
};

const lastPlayedMs = new Map();

// État du séquenceur musical
const musicState = {
  desiredTrack: 'none', // 'none' | 'prep' | 'play'
  activeTrack: 'none',
  ducked: false,
  tabHidden: false,
  step: 0,
  nextNoteTime: 0,
  timerId: null
};

// --- PERSISTANCE & MIXAGE ---
function loadAudioSettings() {
  try {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed.muted === 'boolean') settings.muted = parsed.muted;
    ['masterVolume', 'musicVolume', 'sfxVolume', 'uiVolume'].forEach((k) => {
      if (typeof parsed[k] === 'number' && Number.isFinite(parsed[k])) {
        settings[k] = Math.max(0, Math.min(1, parsed[k]));
      }
    });
  } catch (_) {}
}

function saveAudioSettings() {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
  } catch (_) {}
}

function applyGainSettings() {
  if (!audioCtx || !masterGain || !musicBus || !sfxBus || !uiBus) return;
  const now = audioCtx.currentTime;
  const master = settings.muted || musicState.tabHidden ? 0 : settings.masterVolume;
  const musicMult = musicState.ducked ? 0.42 : 1.0;

  masterGain.gain.setTargetAtTime(master, now, 0.02);
  musicBus.gain.setTargetAtTime(settings.musicVolume * musicMult, now, 0.06);
  sfxBus.gain.setTargetAtTime(settings.sfxVolume, now, 0.015);
  uiBus.gain.setTargetAtTime(settings.uiVolume, now, 0.015);

  if (musicFilter) {
    musicFilter.frequency.setTargetAtTime(musicState.ducked ? 920 : 18000, now, 0.08);
  }
}

function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return null;

  audioCtx = new Ctx();
  compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 18;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.14;

  masterGain = audioCtx.createGain();
  musicBus = audioCtx.createGain();
  musicFilter = audioCtx.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = 18000;
  musicFilter.Q.value = 0.7;

  sfxBus = audioCtx.createGain();
  uiBus = audioCtx.createGain();

  musicBus.connect(musicFilter);
  musicFilter.connect(compressor);
  sfxBus.connect(compressor);
  uiBus.connect(compressor);
  compressor.connect(masterGain);
  masterGain.connect(audioCtx.destination);

  applyGainSettings();
  buildNoiseBuffer();
  return audioCtx;
}

function buildNoiseBuffer() {
  if (!audioCtx || noiseBuffer) return;
  const length = Math.floor(audioCtx.sampleRate * 1.5);
  noiseBuffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
}

export function unlockAudio() {
  const ac = ensureAudioContext();
  if (!ac) return;
  if (ac.state === 'suspended') {
    ac.resume()
      .then(() => {
        if (musicState.desiredTrack !== 'none' && !musicState.timerId) {
          startMusicScheduler();
        }
      })
      .catch(() => {});
  } else if (ac.state === 'running' && musicState.desiredTrack !== 'none' && !musicState.timerId) {
    startMusicScheduler();
  }
}

// --- SPATIALISATION LÉGÈRE (DISTANCE + PANORAMIQUE STÉRÉO) ---
function createSpatialTarget(bus, opts = {}) {
  const ac = audioCtx;
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

// --- BRIQUES DE SYNTHÈSE (HORODATAGE ABSOLU OU RELATIF) ---
function toneAt(dest, t0, {
  type = 'triangle',
  freq = 440,
  freqEnd = null,
  dur = 0.12,
  vol = 0.2,
  attack = 0.005,
  detune = 0,
  filterType = null,
  filterFreq = 3200,
  filterEnd = null,
  filterQ = 1.0
}) {
  const ac = audioCtx;
  const t1 = t0 + Math.max(0.015, dur);

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(Math.max(20, freq), t0);
  if (freqEnd !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t1);
  }

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(attack, dur * 0.4));
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);

  if (filterType) {
    const flt = ac.createBiquadFilter();
    flt.type = filterType;
    flt.Q.value = filterQ;
    flt.frequency.setValueAtTime(Math.max(40, filterFreq), t0);
    if (filterEnd !== null) {
      flt.frequency.exponentialRampToValueAtTime(Math.max(40, filterEnd), t1);
    }
    osc.connect(flt);
    flt.connect(gain);
  } else {
    osc.connect(gain);
  }

  gain.connect(dest);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

function noiseAt(dest, t0, {
  dur = 0.14,
  vol = 0.18,
  attack = 0.004,
  filterType = 'bandpass',
  filterFreq = 1800,
  filterEnd = null,
  filterQ = 1.4
}) {
  const ac = audioCtx;
  if (!noiseBuffer) buildNoiseBuffer();
  if (!noiseBuffer) return;

  const t1 = t0 + Math.max(0.02, dur);
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;

  const flt = ac.createBiquadFilter();
  flt.type = filterType;
  flt.Q.value = filterQ;
  flt.frequency.setValueAtTime(Math.max(60, filterFreq), t0);
  if (filterEnd !== null) {
    flt.frequency.exponentialRampToValueAtTime(Math.max(60, filterEnd), t1);
  }

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(attack, dur * 0.35));
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);

  src.connect(flt);
  flt.connect(gain);
  gain.connect(dest);

  src.start(t0, Math.random() * 0.4, dur + 0.03);
  src.stop(t1 + 0.03);
}

const tone = (dest, opts) => toneAt(dest, audioCtx.currentTime + (opts.start || 0), opts);
const noise = (dest, opts) => noiseAt(dest, audioCtx.currentTime + (opts.start || 0), opts);

function arpeggio(dest, notes, {
  step = 0.048,
  dur = 0.16,
  vol = 0.15,
  type = 'triangle',
  shimmer = true,
  start = 0
} = {}) {
  notes.forEach((midi, idx) => {
    const f = midiToHz(midi);
    const t = start + idx * step;
    tone(dest, { type, freq: f, start: t, dur, vol });
    if (shimmer) {
      tone(dest, {
        type: 'square',
        freq: f * 2,
        start: t,
        dur: dur * 0.65,
        vol: vol * 0.22,
        detune: 7,
        filterType: 'lowpass',
        filterFreq: 4200
      });
    }
  });
}

// ============================================================================
// DEUX THÈMES D'AMBIANCE EN BOUCLE (PHASE PRÉPARATOIRE & PHASE D'ACTION)
// Progression « Royal Road » J-pop (IVMaj7 → V7 → IIIm7 → VIm7) en Mi majeur
// ============================================================================

const PREP_BARS = [
  { bass: 45, chord: [57, 61, 64, 68], arp: [76, 80, 81, 83, 88, 83, 81, 80] }, // AMaj7
  { bass: 47, chord: [59, 63, 66, 69], arp: [78, 81, 83, 87, 90, 87, 83, 81] }, // B7
  { bass: 44, chord: [56, 59, 63, 66], arp: [75, 78, 80, 83, 87, 83, 80, 78] }, // G#m7
  { bass: 49, chord: [61, 64, 68, 71], arp: [76, 80, 83, 85, 88, 85, 83, 80] }  // C#m7
];

// Motif mélodique léger pour le lobby / boutique (64 doubles-croches = 4 mesures)
const PREP_LEAD = [
  80, null, null, 83, null, null, 88, null, null, 85, 83, null, 80, null, null, null,
  78, null, null, 83, null, null, 87, null, null, 83, 81, null, 78, null, null, null,
  75, null, null, 80, null, null, 83, null, null, 87, 83, null, 80, null, 78, null,
  76, null, 80, null, 83, null, 85, null, 88, null, null, 85, 83, null, null, null
];

const PLAY_BARS = [
  { bass: 45, chord: [61, 64, 69] },     // A
  { bass: 47, chord: [63, 66, 71] },     // B
  { bass: 44, chord: [59, 63, 68] },     // G#m
  { bass: 49, chord: [61, 64, 68] },     // C#m
  { bass: 42, chord: [61, 64, 66, 69] }, // F#m7
  { bass: 44, chord: [59, 63, 66, 68] }, // G#m7
  { bass: 45, chord: [61, 64, 68, 69] }, // AMaj7
  { bass: 47, chord: [63, 66, 71] }      // B7 (relance)
];

// Mélodie énergique anime sportif / arcade (128 doubles-croches = 8 mesures)
const PLAY_LEAD = [
  // Mesure 1 (A)
  80, null, 81, null, 83, null, 88, null, null, 85, 83, null, 81, null, 80, null,
  // Mesure 2 (B)
  78, null, 83, null, 87, null, 83, null, null, 81, 80, null, 78, null, 80, null,
  // Mesure 3 (G#m)
  83, null, 80, null, 76, null, 80, null, null, 83, 87, null, 83, null, 80, null,
  // Mesure 4 (C#m)
  85, null, 83, null, 80, null, 83, null, 88, null, null, null, 85, null, 83, null,
  // Mesure 5 (F#m7)
  81, null, 80, null, 78, null, 81, null, null, 85, 83, null, 81, null, 80, null,
  // Mesure 6 (G#m7)
  83, null, 80, null, 78, null, 83, null, null, 87, 85, null, 83, null, 80, null,
  // Mesure 7 (AMaj7)
  88, null, 85, null, 83, null, 88, null, 90, null, 88, null, 85, null, 83, null,
  // Mesure 8 (B7 — montée héroïque vers la boucle)
  87, null, 83, null, 87, null, 90, null, 92, null, null, 90, 87, null, 83, null
];

function schedulePrepStep(step, t0, stepDur) {
  const barIdx = Math.floor(step / 16) % PREP_BARS.length;
  const beatStep = step % 16;
  const bar = PREP_BARS[barIdx];

  // 1. Nappe Rhodes / synthé électrique douce sur temps 1 et syncope sur le « et » du 3
  if (beatStep === 0 || beatStep === 10) {
    const dur = beatStep === 0 ? stepDur * 9.5 : stepDur * 5.8;
    bar.chord.forEach((m, i) => {
      toneAt(musicBus, t0, {
        type: 'triangle',
        freq: midiToHz(m),
        dur,
        vol: 0.048,
        attack: 0.025,
        detune: (i - 1.5) * 4,
        filterType: 'lowpass',
        filterFreq: 2100
      });
    });
  }

  // 2. Basse groovy ronde façon lobby J-pop
  if (beatStep === 0 || beatStep === 6 || beatStep === 10 || beatStep === 14) {
    const oct = beatStep === 14 ? 12 : 0;
    toneAt(musicBus, t0, {
      type: 'triangle',
      freq: midiToHz(bar.bass + oct),
      dur: stepDur * (beatStep === 0 ? 3.2 : 1.7),
      vol: 0.13,
      attack: 0.008
    });
  }

  // 3. Arpège kirakira discret en croches
  if (beatStep % 2 === 0) {
    const arpMidi = bar.arp[(beatStep / 2) % bar.arp.length];
    toneAt(musicBus, t0, {
      type: 'sine',
      freq: midiToHz(arpMidi),
      dur: stepDur * 1.5,
      vol: 0.036,
      attack: 0.006
    });
  }

  // 4. Petite mélodie clochette rétro
  const lead = PREP_LEAD[step % PREP_LEAD.length];
  if (lead !== null) {
    toneAt(musicBus, t0, {
      type: 'square',
      freq: midiToHz(lead),
      dur: stepDur * 2.2,
      vol: 0.04,
      attack: 0.008,
      filterType: 'lowpass',
      filterFreq: 2400
    });
  }

  // 5. Percussions légères (kick feutré + rim / shaker)
  if (beatStep === 0 || beatStep === 10) {
    toneAt(musicBus, t0, { type: 'sine', freq: 118, freqEnd: 46, dur: 0.09, vol: 0.11, attack: 0.002 });
  }
  if (beatStep === 4 || beatStep === 12) {
    noiseAt(musicBus, t0, { dur: 0.045, vol: 0.035, filterType: 'bandpass', filterFreq: 2800, filterQ: 2.2 });
  }
  if (beatStep % 2 === 1) {
    noiseAt(musicBus, t0, { dur: 0.025, vol: 0.018, filterType: 'highpass', filterFreq: 6500, filterQ: 1.0 });
  }
}

function schedulePlayStep(step, t0, stepDur) {
  const barIdx = Math.floor(step / 16) % PLAY_BARS.length;
  const beatStep = step % 16;
  const bar = PLAY_BARS[barIdx];

  // 1. Basse arcade en octaves bondissantes (énergie anime opening)
  if (beatStep % 2 === 0) {
    const upOct = beatStep % 4 === 2 ? 12 : 0;
    const accent = beatStep === 0 || beatStep === 8 ? 1.15 : 0.92;
    toneAt(musicBus, t0, {
      type: 'sawtooth',
      freq: midiToHz(bar.bass + upOct),
      dur: stepDur * 1.55,
      vol: 0.092 * accent,
      attack: 0.004,
      filterType: 'lowpass',
      filterFreq: 780
    });
  }

  // 2. Stabs d'accords J-pop syncopés (temps 1, contretemps 6, temps 3 et contretemps 14)
  if (beatStep === 0 || beatStep === 6 || beatStep === 8 || beatStep === 14) {
    bar.chord.forEach((m, idx) => {
      toneAt(musicBus, t0, {
        type: 'triangle',
        freq: midiToHz(m),
        dur: stepDur * (beatStep === 8 ? 2.4 : 1.5),
        vol: 0.048,
        detune: (idx - 1) * 5,
        filterType: 'lowpass',
        filterFreq: 3200
      });
    });
  }

  // 3. Arpège chiptune rapide en arrière-plan sur les temps pairs
  if (beatStep % 2 === 0) {
    const chNote = bar.chord[(beatStep / 2) % bar.chord.length] + 12;
    toneAt(musicBus, t0, {
      type: 'square',
      freq: midiToHz(chNote),
      dur: stepDur * 0.9,
      vol: 0.024,
      filterType: 'lowpass',
      filterFreq: 3600
    });
  }

  // 4. Mélodie principale lead 16-bit (square filtrée + léger doublage)
  const lead = PLAY_LEAD[step % PLAY_LEAD.length];
  if (lead !== null) {
    const nextIsRest = PLAY_LEAD[(step + 1) % PLAY_LEAD.length] === null;
    const noteDur = stepDur * (nextIsRest ? 2.15 : 1.15);
    toneAt(musicBus, t0, {
      type: 'square',
      freq: midiToHz(lead),
      dur: noteDur,
      vol: 0.068,
      attack: 0.005,
      filterType: 'lowpass',
      filterFreq: 3400
    });
    toneAt(musicBus, t0, {
      type: 'triangle',
      freq: midiToHz(lead),
      dur: noteDur,
      vol: 0.042,
      detune: 6
    });
  }

  // 5. Batterie arcade punchy (kick syncopé, caisse claire brillante, charleston en croches)
  if (beatStep === 0 || beatStep === 6 || beatStep === 8 || beatStep === 14) {
    toneAt(musicBus, t0, { type: 'sine', freq: 145, freqEnd: 44, dur: 0.1, vol: 0.16, attack: 0.002 });
  }
  if (beatStep === 4 || beatStep === 12) {
    toneAt(musicBus, t0, { type: 'triangle', freq: 210, freqEnd: 115, dur: 0.07, vol: 0.08, attack: 0.002 });
    noiseAt(musicBus, t0, { dur: 0.095, vol: 0.095, filterType: 'bandpass', filterFreq: 2100, filterEnd: 950, filterQ: 1.1 });
  }
  if (beatStep % 2 === 0) {
    const openHat = beatStep === 10 || (barIdx === 7 && beatStep === 14);
    noiseAt(musicBus, t0, {
      dur: openHat ? 0.085 : 0.028,
      vol: openHat ? 0.045 : 0.026,
      filterType: 'highpass',
      filterFreq: 7200,
      filterQ: 0.9
    });
  }
}

function runMusicSchedulerTick() {
  if (!audioCtx || audioCtx.state !== 'running') return;
  if (musicState.desiredTrack === 'none' || musicState.tabHidden) return;

  if (musicState.activeTrack !== musicState.desiredTrack) {
    musicState.activeTrack = musicState.desiredTrack;
    musicState.step = 0;
    musicState.nextNoteTime = audioCtx.currentTime + 0.04;
  }

  const bpm = musicState.activeTrack === 'play' ? 144 : 116;
  const stepDur = 60 / bpm / 4; // Double-croche
  const totalSteps = musicState.activeTrack === 'play' ? 128 : 64;
  const lookahead = 0.14;

  // Rattrapage propre si le navigateur a gelé l'onglet
  if (musicState.nextNoteTime < audioCtx.currentTime - 0.25) {
    musicState.nextNoteTime = audioCtx.currentTime + 0.04;
  }

  while (musicState.nextNoteTime < audioCtx.currentTime + lookahead) {
    if (!settings.muted && settings.masterVolume > 0.001 && settings.musicVolume > 0.001) {
      if (musicState.activeTrack === 'play') {
        schedulePlayStep(musicState.step, musicState.nextNoteTime, stepDur);
      } else if (musicState.activeTrack === 'prep') {
        schedulePrepStep(musicState.step, musicState.nextNoteTime, stepDur);
      }
    }
    musicState.nextNoteTime += stepDur;
    musicState.step = (musicState.step + 1) % totalSteps;
  }
}

function startMusicScheduler() {
  if (musicState.timerId) return;
  if (audioCtx) {
    musicState.nextNoteTime = audioCtx.currentTime + 0.05;
  }
  musicState.timerId = setInterval(runMusicSchedulerTick, 45);
}

function stopMusicScheduler() {
  if (musicState.timerId) {
    clearInterval(musicState.timerId);
    musicState.timerId = null;
  }
  musicState.activeTrack = 'none';
}

export function setMusicTrack(trackId = 'none') {
  const next = trackId === 'prep' || trackId === 'play' ? trackId : 'none';
  if (musicState.desiredTrack === next) return;
  musicState.desiredTrack = next;

  if (next === 'none') {
    stopMusicScheduler();
    return;
  }

  if (audioCtx && audioCtx.state === 'running') {
    musicState.step = 0;
    musicState.nextNoteTime = audioCtx.currentTime + 0.05;
    startMusicScheduler();
  }
}

export function syncMusicState(phase = state.phase, paused = false) {
  let targetTrack = 'none';
  if (phase === 'prep') {
    targetTrack = 'prep';
  } else if (phase === 'play') {
    targetTrack = state.practiceShopPreservePlay ? 'prep' : 'play';
  }

  const nextDuck = !!(paused && targetTrack === 'play');
  if (musicState.ducked !== nextDuck) {
    musicState.ducked = nextDuck;
    applyGainSettings();
  }
  setMusicTrack(targetTrack);
}

// ============================================================================
// CATALOGUE DES BRUITAGES (INTERFACE & JOUABILITÉ)
// ============================================================================
const COOLDOWNS_MS = {
  ui_hover: 45,
  ui_click: 35,
  ice_slide: 180,
  dash_wall_bounce: 70,
  pad_boost: 160,
  back_reveal: 220
};

const SOUND_LIBRARY = {
  // --- 1. INTERFACE ---
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

  // --- 2. CONTRÔLES, CAMÉRA & DÉPLACEMENTS ---
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

  // --- 3. BALLON, PASSES & OUTILS ---
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

  // --- 4. TACTIQUE, INTERCEPTIONS & RÈGLE 1 ---
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

  // --- 5. ULTIMATES ÉLÉMENTAIRES ---
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

  // --- 6. BUTS, RONDES & TUTORIEL ---
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

// --- API PUBLIQUE ---
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
  const bus = isUi ? uiBus : sfxBus;
  const { dest, gainMult } = isUi ? { dest: bus, gainMult: 1.0 } : createSpatialTarget(bus, opts);
  if (!dest || gainMult <= 0.001) return;

  const volMult = typeof opts.volume === 'number' ? opts.volume : 1.0;
  fn(dest, gainMult * volMult, opts);
}

export function setAudioSettings(partial = {}) {
  if (typeof partial.muted === 'boolean') settings.muted = partial.muted;
  ['masterVolume', 'musicVolume', 'sfxVolume', 'uiVolume'].forEach((k) => {
    if (typeof partial[k] === 'number' && Number.isFinite(partial[k])) {
      settings[k] = Math.max(0, Math.min(1, partial[k]));
    }
  });
  applyGainSettings();
  saveAudioSettings();
  syncAudioControlsUI();
}

export function toggleAudioMute() {
  setAudioSettings({ muted: !settings.muted });
  if (!settings.muted) {
    unlockAudio();
    playSfx('ui_confirm');
  }
  return settings.muted;
}

export function getAudioSettings() {
  return { ...settings };
}

// --- LIAISON AVEC LE BLOC DE CONTRÔLES DANS #options-modal ---
export function syncAudioControlsUI() {
  if (typeof document === 'undefined') return;
  const muteBtn = document.getElementById('btn-audio-mute');
  if (muteBtn) {
    muteBtn.textContent = settings.muted ? '🔇 Son : COUPÉ' : '🔊 Son : ACTIVÉ';
    muteBtn.classList.toggle('active-mode-pill', !settings.muted);
  }

  const sliders = [
    ['input-audio-master', 'audio-master-val', settings.masterVolume],
    ['input-audio-music', 'audio-music-val', settings.musicVolume],
    ['input-audio-sfx', 'audio-sfx-val', settings.sfxVolume],
    ['input-audio-ui', 'audio-ui-val', settings.uiVolume]
  ];
  sliders.forEach(([inputId, valId, val]) => {
    const pct = Math.round(val * 100);
    const inputEl = document.getElementById(inputId);
    const valEl = document.getElementById(valId);
    if (inputEl) inputEl.value = String(pct);
    if (valEl) valEl.textContent = `${pct}%`;
  });
}

function bindAudioControlsUI() {
  if (typeof document === 'undefined') return;

  const muteBtn = document.getElementById('btn-audio-mute');
  if (muteBtn) {
    muteBtn.onclick = () => {
      muteBtn.blur();
      toggleAudioMute();
    };
  }

  const testBtn = document.getElementById('btn-audio-test');
  if (testBtn) {
    testBtn.onclick = () => {
      testBtn.blur();
      unlockAudio();
      playSfx('goal_ally');
    };
  }

  const bindSlider = (inputId, settingKey, previewSfx) => {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.oninput = () => {
      unlockAudio();
      const pct = Math.max(0, Math.min(100, Number(el.value) || 0));
      setAudioSettings({ [settingKey]: pct / 100, muted: pct > 0 ? false : settings.muted });
    };
    el.onchange = () => {
      if (previewSfx) playSfx(previewSfx);
    };
  };

  bindSlider('input-audio-master', 'masterVolume', 'ui_confirm');
  bindSlider('input-audio-music', 'musicVolume', null);
  bindSlider('input-audio-sfx', 'sfxVolume', 'ball_pickup');
  bindSlider('input-audio-ui', 'uiVolume', 'ui_click');

  syncAudioControlsUI();
}

// --- SONORISATION DÉLÉGUÉE AUTOMATIQUE DE L'INTERFACE ---
function attachDelegatedUISounds() {
  if (typeof document === 'undefined') return;

  ['pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, unlockAudio, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    musicState.tabHidden = !!document.hidden;
    applyGainSettings();
  });

  let lastHovered = null;
  document.addEventListener(
    'pointerover',
    (e) => {
      if (state.mobileMode || e.pointerType === 'touch') return;
      const el = e.target?.closest?.('button:not(:disabled), .player-row');
      if (!el || el === lastHovered) return;
      lastHovered = el;
      if (el.closest('#mobile-touch-controls')) return;
      playSfx('ui_hover');
    },
    { passive: true }
  );

  document.addEventListener('click', (e) => {
    const el = e.target?.closest?.('button, .player-row, select');
    if (!el || el.closest('#mobile-touch-controls')) return;
    unlockAudio();

    if (el.disabled) {
      playSfx('ui_error');
      return;
    }
    if (
      el.classList.contains('color-pick-btn') ||
      el.classList.contains('shop-role-btn') ||
      el.classList.contains('player-row') ||
      el.id === 'btn-audio-mute' ||
      el.id === 'btn-audio-test'
    ) {
      return;
    }

    if (el.hasAttribute('data-welcome-tab') || el.hasAttribute('data-prep-tab') || el.id.startsWith('btn-hud-tab-')) {
      playSfx('ui_tab');
    } else if (
      el.classList.contains('primary') ||
      el.id === 'btn-confirm-prep' ||
      el.id === 'btn-arena-launch' ||
      el.id === 'btn-mp-start' ||
      el.id === 'btn-next-round' ||
      el.id === 'btn-pause-resume'
    ) {
      playSfx('ui_confirm');
    } else if (
      el.id.includes('back') ||
      el.id.includes('cancel') ||
      el.id.includes('leave') ||
      el.id.includes('close')
    ) {
      playSfx('ui_cancel');
    } else {
      playSfx('ui_click');
    }
  });
}

export function initAudio() {
  if (initialized) return;
  initialized = true;
  loadAudioSettings();
  attachDelegatedUISounds();
  bindAudioControlsUI();

  ctx.api.playSfx = playSfx;
  ctx.api.setMusicTrack = setMusicTrack;
  ctx.api.syncMusicState = syncMusicState;
  ctx.api.setAudioSettings = setAudioSettings;
  ctx.api.toggleAudioMute = toggleAudioMute;
  ctx.api.getAudioSettings = getAudioSettings;
  ctx.api.syncAudioControlsUI = syncAudioControlsUI;
}