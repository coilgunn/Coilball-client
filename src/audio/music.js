import { audioState, midiToHz, toneAt, noiseAt } from './shared.js';

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

export function schedulePrepStep(step, t0, stepDur) {
  const { musicBus } = audioState;
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

function schedulePlayBassAndStabs(bar, beatStep, t0, stepDur) {
  const { musicBus } = audioState;
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
}

function schedulePlayLeadAndArp(bar, step, beatStep, t0, stepDur) {
  const { musicBus } = audioState;
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
}

function schedulePlayDrums(barIdx, beatStep, t0) {
  const { musicBus } = audioState;
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

export function schedulePlayStep(step, t0, stepDur) {
  const barIdx = Math.floor(step / 16) % PLAY_BARS.length;
  const beatStep = step % 16;
  const bar = PLAY_BARS[barIdx];

  schedulePlayBassAndStabs(bar, beatStep, t0, stepDur);
  schedulePlayLeadAndArp(bar, step, beatStep, t0, stepDur);
  schedulePlayDrums(barIdx, beatStep, t0);
}
