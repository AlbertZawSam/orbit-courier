import { nodeTickFreq, pingFreq, deliveryNotes, midiToHz, createThrottle } from './dsp.js';

// One-shot sounds. Each goes through engine.voice() so the 24-voice budget always applies.

function tone(engine, { freq, freqEnd = null, dur, type = 'sine', gain = 0.15, attack = 0.004, bus = 'sfx', priority = 1, delay = 0 }) {
  return engine.voice(dur, priority, (ctx, t, buses) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(buses[bus]); o.start(t); o.stop(t + dur + 0.02);
    return [o];
  }, delay);
}

function noiseBurst(engine, { dur, gain = 0.2, freq = 900, q = 0.7, type = 'lowpass', bus = 'sfx', priority = 1, delay = 0 }) {
  return engine.voice(dur, priority, (ctx, t, buses) => {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = engine.noiseBuffer(); src.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(buses[bus]); src.start(t); src.stop(t + dur + 0.02);
    return [src];
  }, delay);
}

/** A struck-bell timbre: two inharmonic partials with a long decay. */
function bell(engine, freq, { dur = 1.2, gain = 0.12, delay = 0, bus = 'sfx', priority = 2 } = {}) {
  tone(engine, { freq, dur, gain, delay, bus, priority });
  tone(engine, { freq: freq * 2.76, dur: dur * 0.6, gain: gain * 0.4, delay, bus, priority });
}

// Throttles belong to an engine instance (not the module), so separate engines and tests never block each other.
const gates = new WeakMap();
function allow(engine, key, ms) {
  let g = gates.get(engine);
  if (!g) { g = new Map(); gates.set(engine, g); }
  if (!g.has(ms)) g.set(ms, createThrottle(ms));
  return g.get(ms)(key);
}

export const sfx = {
  /** Node tick, pitched by the burn's size. */
  tick(engine, dv = 0.2) { if (allow(engine, 'tick', 45)) tone(engine, { freq: nodeTickFreq(dv, engine.key), dur: 0.06, type: 'triangle', gain: 0.1 }); },
  nodeRemoved(engine) { tone(engine, { freq: 330, freqEnd: 220, dur: 0.08, type: 'triangle', gain: 0.09 }); },
  /** A dull buzz: the burn was refused or scaled down because the tank is empty. */
  buzz(engine) { tone(engine, { freq: 110, dur: 0.2, type: 'sawtooth', gain: 0.07 }); },
  ping(engine, distance) { tone(engine, { freq: pingFreq(distance, engine.key), dur: 0.18, gain: 0.07, bus: 'sfx', priority: 0 }); },
  lowFuel(engine) { tone(engine, { freq: 220, dur: 0.35, gain: 0.08, attack: 0.08 }); },
  /** Sub thump plus a burst of noise. */
  crash(engine) {
    tone(engine, { freq: 58, freqEnd: 26, dur: 0.9, gain: 0.5, priority: 3 });
    noiseBurst(engine, { dur: 0.7, gain: 0.28, freq: 700, priority: 3 });
  },
  lost(engine) { tone(engine, { freq: 247, freqEnd: 110, dur: 1.1, type: 'triangle', gain: 0.16, priority: 3 }); },
  timeout(engine) { tone(engine, { freq: 196, dur: 0.18, gain: 0.12 }); tone(engine, { freq: 165, dur: 0.3, gain: 0.12, delay: 0.22 }); },
  /** Rising pentatonic arpeggio. Star bells follow when the result is known. */
  delivery(engine) {
    deliveryNotes(0, engine.key).arp.forEach((f, k) => tone(engine, { freq: f, dur: 0.55, type: 'triangle', gain: 0.13, delay: k * 0.11, priority: 3 }));
  },
  stars(engine, n) { deliveryNotes(n, engine.key).bells.forEach((f, k) => bell(engine, f, { delay: 0.2 + k * 0.28, priority: 3 })); },
  click(engine) { tone(engine, { freq: 880, freqEnd: 640, dur: 0.045, gain: 0.07, bus: 'ui', priority: 0 }); },
  error(engine) { tone(engine, { freq: 150, dur: 0.16, type: 'square', gain: 0.06, bus: 'ui' }); },
  hint(engine) { bell(engine, midiToHz(88), { dur: 1.0, gain: 0.1, bus: 'ui' }); },
  /** Coach blip, throttled to one per 300 ms. */
  blip(engine) { if (allow(engine, 'blip', 300)) tone(engine, { freq: 1046, dur: 0.07, gain: 0.06, bus: 'ui', priority: 0 }); },
  soft(engine) { tone(engine, { freq: 660, dur: 0.05, gain: 0.05, bus: 'ui', priority: 0 }); },
};
