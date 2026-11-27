const AUDIO_STORAGE_KEY = 'coilball_audio_v2';
const VOLUME_KEYS = ['masterVolume', 'musicVolume', 'sfxVolume', 'uiVolume'];

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const audioState = {
  audioCtx: null,
  masterGain: null,
  musicBus: null,
  musicFilter: null,
  sfxBus: null,
  uiBus: null,
  compressor: null,
  noiseBuffer: null,
  initialized: false
};

export const settings = {
  muted: false,
  masterVolume: 0.72,
  musicVolume: 0.42,
  sfxVolume: 0.9,
  uiVolume: 0.75
};

export const lastPlayedMs = new Map();

// État du séquenceur musical
export const musicState = {
  desiredTrack: 'none', // 'none' | 'prep' | 'play'
  activeTrack: 'none',
  ducked: false,
  tabHidden: false,
  step: 0,
  nextNoteTime: 0,
  timerId: null
};

export function applySettingFields(source) {
  if (!source || typeof source !== 'object') return;
  if (typeof source.muted === 'boolean') settings.muted = source.muted;
  VOLUME_KEYS.forEach((k) => {
    if (typeof source[k] === 'number' && Number.isFinite(source[k])) {
      settings[k] = Math.max(0, Math.min(1, source[k]));
    }
  });
}

export function loadAudioSettings() {
  try {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return;
    applySettingFields(JSON.parse(raw));
  } catch (err) {
    void err;
  }
}

export function saveAudioSettings() {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    void err;
  }
}

export function applyGainSettings() {
  const { audioCtx, masterGain, musicBus, musicFilter, sfxBus, uiBus } = audioState;
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

export function buildNoiseBuffer() {
  const { audioCtx, noiseBuffer } = audioState;
  if (!audioCtx || noiseBuffer) return;
  const length = Math.floor(audioCtx.sampleRate * 1.5);
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  audioState.noiseBuffer = buffer;
}

export function ensureAudioContext() {
  if (audioState.audioCtx) return audioState.audioCtx;
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return null;

  const ac = new Ctx();
  const compressor = ac.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 18;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.14;

  const masterGain = ac.createGain();
  const musicBus = ac.createGain();
  const musicFilter = ac.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = 18000;
  musicFilter.Q.value = 0.7;

  const sfxBus = ac.createGain();
  const uiBus = ac.createGain();

  musicBus.connect(musicFilter);
  musicFilter.connect(compressor);
  sfxBus.connect(compressor);
  uiBus.connect(compressor);
  compressor.connect(masterGain);
  masterGain.connect(ac.destination);

  audioState.audioCtx = ac;
  audioState.compressor = compressor;
  audioState.masterGain = masterGain;
  audioState.musicBus = musicBus;
  audioState.musicFilter = musicFilter;
  audioState.sfxBus = sfxBus;
  audioState.uiBus = uiBus;

  applyGainSettings();
  buildNoiseBuffer();
  return ac;
}

export function toneAt(dest, t0, {
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
  const ac = audioState.audioCtx;
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

export function noiseAt(dest, t0, {
  dur = 0.14,
  vol = 0.18,
  attack = 0.004,
  filterType = 'bandpass',
  filterFreq = 1800,
  filterEnd = null,
  filterQ = 1.4
}) {
  const ac = audioState.audioCtx;
  if (!audioState.noiseBuffer) buildNoiseBuffer();
  if (!audioState.noiseBuffer) return;

  const t1 = t0 + Math.max(0.02, dur);
  const src = ac.createBufferSource();
  src.buffer = audioState.noiseBuffer;

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

export const tone = (dest, opts) => toneAt(dest, audioState.audioCtx.currentTime + (opts.start || 0), opts);
export const noise = (dest, opts) => noiseAt(dest, audioState.audioCtx.currentTime + (opts.start || 0), opts);

export function arpeggio(dest, notes, {
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
