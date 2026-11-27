import { state } from '../state.js';
import {
  audioState,
  settings,
  musicState,
  applyGainSettings,
  ensureAudioContext
} from './shared.js';
import { schedulePrepStep, schedulePlayStep } from './music.js';

function runMusicSchedulerTick() {
  const ac = audioState.audioCtx;
  if (!ac || ac.state !== 'running') return;
  if (musicState.desiredTrack === 'none' || musicState.tabHidden) return;

  if (musicState.activeTrack !== musicState.desiredTrack) {
    musicState.activeTrack = musicState.desiredTrack;
    musicState.step = 0;
    musicState.nextNoteTime = ac.currentTime + 0.04;
  }

  const bpm = musicState.activeTrack === 'play' ? 144 : 116;
  const stepDur = 60 / bpm / 4; // Double-croche
  const totalSteps = musicState.activeTrack === 'play' ? 128 : 64;
  const lookahead = 0.14;

  // Rattrapage propre si le navigateur a gelé l'onglet
  if (musicState.nextNoteTime < ac.currentTime - 0.25) {
    musicState.nextNoteTime = ac.currentTime + 0.04;
  }

  while (musicState.nextNoteTime < ac.currentTime + lookahead) {
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
  if (audioState.audioCtx) {
    musicState.nextNoteTime = audioState.audioCtx.currentTime + 0.05;
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
      .catch((err) => {
        void err;
      });
  } else if (ac.state === 'running' && musicState.desiredTrack !== 'none' && !musicState.timerId) {
    startMusicScheduler();
  }
}

export function setMusicTrack(trackId = 'none') {
  const next = trackId === 'prep' || trackId === 'play' ? trackId : 'none';
  if (musicState.desiredTrack === next) return;
  musicState.desiredTrack = next;

  if (next === 'none') {
    stopMusicScheduler();
    return;
  }

  const ac = audioState.audioCtx;
  if (ac && ac.state === 'running') {
    musicState.step = 0;
    musicState.nextNoteTime = ac.currentTime + 0.05;
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
