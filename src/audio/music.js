import { tension as tensionOf, smoothTension, arpInterval, arpFreq, tierKey, padFreqs } from './tension.js';

const PAD_GAIN = 0.05, CROSSFADE_TC = 0.5; // time constant 0.5 s: about 1.5 s to settle
const PAD_SLOTS = 6;                       // two chords (old and new) of three oscillators during a crossfade

/**
 * Generative music: a drone pad in the tier's key, plus a pentatonic arpeggio whose density follows tension.
 * Changing tier crossfades the pad over ~1.5 s. Slow motion pitches everything down.
 */
export function createMusic(engine) {
  let tier = 'training', pad = null, padKey = null, reserved = false;
  let tens = 0, nextArp = 0, step = 0, arps = true, cap = 1, slow = false;

  function makePad(root) {
    const ctx = engine.context, now = ctx.currentTime;
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    lp.connect(g); g.connect(engine.buses.music);
    const oscs = padFreqs(root).map((f, k) => {
      const o = ctx.createOscillator(); o.type = k === 0 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (k - 1) * 4;
      o.connect(lp); o.start(now); return o;
    });
    g.gain.setTargetAtTime(PAD_GAIN, now, CROSSFADE_TC);
    return { g, oscs };
  }
  function retire(p) {
    const ctx = engine.context, now = ctx.currentTime;
    p.g.gain.setTargetAtTime(0, now, CROSSFADE_TC);
    p.oscs.forEach((o) => o.stop(now + 2));
  }
  function ensurePad() {
    if (!engine.ready) return;
    const key = tierKey(tier);
    if (padKey === key) return;
    if (!reserved) { engine.pool.reserve(PAD_SLOTS); reserved = true; }
    if (pad) retire(pad);
    pad = makePad(key); padKey = key;
  }

  return {
    /** Choose the drone key for a tier. Crossfades if it changes. */
    setTier(t) { tier = t; engine.setKey(tierKey(t)); ensurePad(); },
    /** Reduce sound turns the arpeggio off (the pad stays). */
    setArpeggio(on) { arps = !!on; },
    /** Cap tension (Flight School keeps the music calm). */
    setCap(c) { cap = Math.min(1, Math.max(0, c)); },
    setSlow(on) { slow = !!on; },
    get tension() { return tens; },
    get tier() { return tier; },
    get pad() { return pad; },
    /**
     * @param {number} dt real seconds since the last call
     * @param {{surfaceDist:number, speed:number, fuelFraction:number, tank:number}} input
     */
    update(dt, input) {
      if (!engine.ready) return;
      ensurePad();
      const ctx = engine.context, now = ctx.currentTime;
      tens = smoothTension(tens, Math.min(cap, tensionOf(input)), dt);
      pad.oscs.forEach((o, k) => o.detune.setTargetAtTime((slow ? -300 : 0) + (k - 1) * 4, now, 0.2)); // pitches down in slow motion
      if (!arps || now < nextArp) return;
      const f = arpFreq(tierKey(tier), step++, tens);
      engine.voice(0.55, 0, (c, t, buses) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.detune.setValueAtTime(slow ? -300 : 0, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035 + 0.03 * tens, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g); g.connect(buses.music); o.start(t); o.stop(t + 0.55);
        return [o];
      });
      nextArp = now + arpInterval(tens);
    },
  };
}
