/**
 * Quality tiers (AGENTS.md 10.4). Pure data and logic: no three.js, so it is testable.
 * Later stages read the feature flags below; stage 7 uses bloom and pixelRatio.
 */
export const TIER_NAMES = ['low', 'medium', 'high'];

export const TIERS = {
  low:    { bloom: 'off',  pixelRatio: 1,   nebula: 'gradient', planetDetail: 'lit',   eclipseOccluders: 0, clouds: false, aurora: false, lensing: false, godRays: false, dof: false, flowField: 0,   speedDust: false, autoExposure: false, flare: false, particles: 200 },
  medium: { bloom: 'half', pixelRatio: 1.5, nebula: 'layers',   planetDetail: 'fewer', eclipseOccluders: 1, clouds: true,  aurora: false, lensing: true,  godRays: false, dof: false, flowField: 400, speedDust: true,  autoExposure: true,  flare: true,  particles: 600 },
  high:   { bloom: 'full', pixelRatio: 2,   nebula: 'raymarch', planetDetail: 'full',  eclipseOccluders: 2, clouds: true,  aurora: true,  lensing: true,  godRays: true,  dof: true,  flowField: 800, speedDust: true,  autoExposure: true,  flare: true,  particles: 1500 },
};

export const QUALITY_CHOICES = ['auto', ...TIER_NAMES];

/** Settings for a tier name (auto starts at high until the governor steps it down). */
export const tierSettings = (tier) => TIERS[tier] ?? TIERS.high;
export const nextChoice = (choice) => QUALITY_CHOICES[(QUALITY_CHOICES.indexOf(choice) + 1) % QUALITY_CHOICES.length];

export const AUTO_WINDOW_MS = 2000;  // measure for 2 s after load, then after each step down
export const SLOW_FRAME_MS = 22;     // above this average the tier steps down
const MAX_SANE_FRAME_MS = 250;       // ignore stalls such as a hidden tab

/**
 * Auto quality: average the frame time over a 2 s window; if it is slower than ~22 ms, step down one
 * tier and measure again. Settles (stops adapting) once a window is fast enough or the tier is low.
 */
export class AutoQuality {
  constructor(start = 'high') { this.tier = start; this.settled = false; this.#reset(); }
  #reset() { this.elapsed = 0; this.sum = 0; this.frames = 0; }
  /** Feed one frame time in ms. Returns {from, to, avg} when the tier drops, otherwise null. */
  push(frameMs) {
    if (this.settled || !(frameMs > 0) || frameMs > MAX_SANE_FRAME_MS) return null;
    this.elapsed += frameMs; this.sum += frameMs; this.frames++;
    if (this.elapsed < AUTO_WINDOW_MS) return null;
    const avg = this.sum / this.frames;
    this.#reset();
    if (avg <= SLOW_FRAME_MS || this.tier === 'low') { this.settled = true; return null; }
    const from = this.tier;
    this.tier = TIER_NAMES[TIER_NAMES.indexOf(from) - 1];
    return { from, to: this.tier, avg };
  }
}
