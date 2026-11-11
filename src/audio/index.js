import { createAudioEngine } from './engine.js';
import { createAmbience } from './ambience.js';
import { wireAudio } from './events.js';

/** The audio system: engine, continuous layers, and the bus wiring. Silent (and safe) until `unlock()`. */
export function createAudio({ bus, createContext } = {}) {
  const engine = createAudioEngine(createContext ? { createContext } : {});
  const ambience = createAmbience(engine);
  const audio = { engine, ambience };
  const off = wireAudio(bus, audio);
  return {
    engine, ambience,
    unlock: () => engine.unlock(),
    update: (state) => ambience.update(state),
    toggleMute() { engine.setMuted(!engine.muted); return engine.muted; },
    dispose: off,
  };
}
