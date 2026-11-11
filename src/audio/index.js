import { createAudioEngine } from './engine.js';
import { createAmbience } from './ambience.js';
import { createMusic } from './music.js';
import { wireAudio } from './events.js';

/** The audio system: engine, continuous layers, music, and the bus wiring. Silent (and safe) until `unlock()`. */
export function createAudio({ bus, createContext } = {}) {
  const engine = createAudioEngine(createContext ? { createContext } : {});
  const ambience = createAmbience(engine);
  const music = createMusic(engine);
  const off = wireAudio(bus, { engine, ambience, music });
  return {
    engine, ambience, music,
    unlock: () => engine.unlock(),
    /** Per frame. `state` is the ambience state plus `dt` and `musicInput` ({surfaceDist, speed, fuelFraction, tank}). */
    update(state) { ambience.update(state); music.update(state.dt ?? 0.016, state.musicInput ?? {}); },
    /** Apply the saved sound settings: master level, mute, per-layer switches, and "reduce sound". */
    applySettings(s) {
      engine.setVolume(s.volume);
      engine.setMuted(!s.soundOn);
      const calm = s.reduceSound;
      engine.setBusGain('sfx', s.sfxOn ? 1 : 0);
      engine.setBusGain('thrust', s.sfxOn ? 1 : 0);
      engine.setBusGain('hum', s.humOn && !calm ? 1 : 0);
      engine.setBusGain('music', s.musicOn ? 1 : 0);
      ambience.setPing(s.pingOn && !calm);
      music.setArpeggio(!calm);
    },
    toggleMute() { engine.setMuted(!engine.muted); return engine.muted; },
    dispose: off,
  };
}
