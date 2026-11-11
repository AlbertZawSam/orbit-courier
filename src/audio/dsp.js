// Pure sound-design maths (no Web Audio): testable without an AudioContext. Game units, same simplified physics.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Major pentatonic: every pitch the game makes is snapped to it, so nothing ever sounds out of tune. */
export const PENT = [0, 2, 4, 7, 9];
export const ROOT_MIDI = 45; // A2
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);

export function quantizeMidi(m, root = ROOT_MIDI) {
  let best = m, bestD = Infinity;
  const base = Math.floor((m - root) / 12);
  for (let o = base - 1; o <= base + 1; o++) for (const s of PENT) {
    const c = root + o * 12 + s, d = Math.abs(c - m);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
export const quantizeHz = (f, root = ROOT_MIDI) => midiToHz(quantizeMidi(hzToMidi(f), root));
/** True when `freq` is exactly a pentatonic note of `root` (any octave). */
export function inScale(freq, root = ROOT_MIDI) {
  const m = hzToMidi(freq), r = Math.round(m);
  return Math.abs(m - r) < 1e-6 && PENT.includes((((r - root) % 12) + 12) % 12);
}

/** Gravity hum: heavy bodies drone low, small ones sing high. */
export const HUM_BASE = { star: 33, gas: 36, rocky: 45, ice: 52, moon: 57, station: 60 };
/** Pitch rises with the log of the pull (about 8 semitones per decade above 0.05), quantized to the scale. */
export function humMidi(accel, kind, root = ROOT_MIDI) {
  const base = HUM_BASE[kind] ?? 52;
  const decades = clamp(Math.log10(Math.max(accel, 1e-4) / 0.05), 0, 2.5);
  return quantizeMidi(base + decades * 8, root);
}
export const humFreq = (accel, kind, root = ROOT_MIDI) => midiToHz(humMidi(accel, kind, root));
/** Loudness by proximity: 0 when far, rising smoothly with the pull. */
export const humGain = (accel) => clamp(Math.log10(1 + Math.max(0, accel) * 6) / 1.3, 0, 1);

/** Doppler: approaching raises the pitch, receding lowers it. `c` is the game's "speed of sound". */
export const SOUND_SPEED = 14;
export function dopplerFactor(closing, c = SOUND_SPEED) {
  const v = clamp(closing, -c * 0.8, c * 0.8);
  return c / (c - v);
}
/** Swoosh loudness: needs real speed and a close pass (distance measured from the surface). */
export function dopplerGain(speed, surfaceDist) {
  return clamp(speed / 6, 0, 1) * clamp(1 - surfaceDist / 6, 0, 1);
}

/** Target beacon: pings faster and higher as the probe closes in. */
export const pingInterval = (d) => clamp(0.22 + d * 0.09, 0.22, 2.2);
export const pingFreq = (d, root = ROOT_MIDI) => quantizeHz(330 + 900 / (1 + Math.max(0, d) / 4), root);

/** Node tick pitch follows the size of the burn. */
export const nodeTickFreq = (dv, root = ROOT_MIDI) => quantizeHz(500 + 1500 * clamp(dv / 1.5, 0, 1), root);

/** Thruster envelope: quick attack, steady, soft release. Returns 0..1. */
export function thrustEnvelope(age, duration, attack = 0.05, release = 0.2) {
  if (age < 0 || age > duration + release) return 0;
  if (age < attack) return age / attack;
  if (age <= duration) return 1;
  return 1 - (age - duration) / release;
}
export const thrustCutoff = (level) => 300 + 2200 * clamp(level, 0, 1);

/** Orbit-lock shimmer climbs with progress through the hold. */
export const shimmerFreq = (progress, root = ROOT_MIDI) => quantizeHz(midiToHz(57 + 12 * clamp(progress, 0, 1)), root);

/** Delivery: a rising pentatonic arpeggio, then one bell per star. */
export function deliveryNotes(stars, root = ROOT_MIDI) {
  const shift = root - ROOT_MIDI; // transpose into the current key
  const arp = [0, 2, 4, 7, 9].map((s) => midiToHz(57 + shift + s));
  const bells = [0, 4, 7].slice(0, clamp(Math.round(stars), 0, 3)).map((s) => midiToHz(81 + shift + s));
  return { arp, bells };
}

/** Low-fuel warning: a gentle pulse once under 20% of the tank. */
export const LOW_FUEL = 0.2;
export const lowFuel = (fraction, tank) => tank > 0 && fraction < LOW_FUEL;

/** Time dilation: the master lowpass closes in slow motion. */
export const dilationCutoff = (slow) => (slow ? 700 : 18000);

/** Minimum gap between repeats of the same sound (for example coach blips every 300 ms). */
export function createThrottle(minMs, now = () => Date.now()) {
  const last = new Map();
  return (key = '') => {
    const t = now();
    if (t - (last.get(key) ?? -Infinity) < minMs) return false;
    last.set(key, t);
    return true;
  };
}
