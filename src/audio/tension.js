// Pure music logic: the tension function, arpeggio timing and notes, and the key for each tier.
import { midiToHz, PENT, ROOT_MIDI } from './dsp.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, u) => a + (b - a) * u;

/** Tension from three things: how close the probe is to a body, how fast it moves, and how low the fuel is. */
export const TENSION_WEIGHTS = { proximity: 0.5, speed: 0.3, fuel: 0.2 };
export const proximityTerm = (surfaceDist) => clamp(1 - surfaceDist / 8, 0, 1);
export const speedTerm = (speed) => clamp(speed / 9, 0, 1);
/** Zero while the tank is at least 40% full, rising to 1 when empty. A level with no fuel has no fuel tension. */
export const fuelTerm = (fraction, tank) => (tank > 0 ? clamp((0.4 - fraction) / 0.4, 0, 1) : 0);

export function tension({ surfaceDist = Infinity, speed = 0, fuelFraction = 1, tank = 0 } = {}) {
  const w = TENSION_WEIGHTS;
  return clamp(w.proximity * proximityTerm(surfaceDist) + w.speed * speedTerm(speed) + w.fuel * fuelTerm(fuelFraction, tank), 0, 1);
}

/** Exponential smoothing toward the target, independent of frame rate (time constant `tau` seconds). */
export const smoothTension = (prev, target, dt, tau = 1.5) => prev + (target - prev) * (1 - Math.exp(-dt / tau));

/** Seconds between arpeggio notes: sparse when calm, busy when tense. Strictly falls as tension rises. */
export const ARP_SLOW = 2.6, ARP_FAST = 0.2;
export const arpInterval = (t) => lerp(ARP_SLOW, ARP_FAST, Math.pow(clamp(t, 0, 1), 1.3));

/** Positions along a ping-pong walk 0..len-1..0 (so the melody rises and falls). */
export function pingPong(step, len) {
  if (len <= 1) return 0;
  const period = 2 * (len - 1), k = ((step % period) + period) % period;
  return k < len ? k : period - k;
}
/** The arpeggio's pentatonic positions widen with tension: 5 notes (one octave) up to 10 (two octaves). */
export const arpRange = (t) => 5 + Math.round(clamp(t, 0, 1) * 5);
/** MIDI note for an arpeggio step in the key `root`; always a pentatonic degree of that key. */
export function arpMidi(root, step, t) {
  const pos = pingPong(step, arpRange(t));
  return root + 12 + PENT[pos % 5] + 12 * Math.floor(pos / 5);
}
export const arpFreq = (root, step, t) => midiToHz(arpMidi(root, step, t));

/** Drone key per tier (MIDI root). Each is a different note, so the world sounds different as you go deeper. */
export const TIER_KEYS = { tutorial: 45, training: 45, inner: 50, outer: 43, deep: 40, lab: 47 };
export const tierKey = (tier) => TIER_KEYS[tier] ?? ROOT_MIDI;
/** Pad chord: root, fifth and octave. */
export const padFreqs = (root) => [root, root + 7, root + 12].map(midiToHz);
