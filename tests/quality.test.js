import { describe, it, expect } from 'vitest';
import { TIERS, TIER_NAMES, tierSettings, nextChoice, AutoQuality, AUTO_WINDOW_MS, SLOW_FRAME_MS } from '../src/render/quality.js';
import { createSettings, DEFAULTS } from '../src/state/settings.js';
import { createStorage } from '../src/state/storage.js';
import { prefersReducedMotion } from '../src/a11y/motion.js';

const feed = (aq, ms, seconds) => { let r = null; for (let t = 0; t < seconds * 1000; t += ms) r = aq.push(ms) ?? r; return r; };

describe('quality tiers (AGENTS.md 10.4)', () => {
  it('matches the spec table for bloom, pixel ratio, particles, flow field and occluders', () => {
    expect(TIERS.low).toMatchObject({ bloom: 'off', pixelRatio: 1, particles: 200, flowField: 0, eclipseOccluders: 0, nebula: 'gradient' });
    expect(TIERS.medium).toMatchObject({ bloom: 'half', pixelRatio: 1.5, particles: 600, flowField: 400, eclipseOccluders: 1, nebula: 'layers' });
    expect(TIERS.high).toMatchObject({ bloom: 'full', pixelRatio: 2, particles: 1500, flowField: 800, eclipseOccluders: 2, nebula: 'raymarch', godRays: true, dof: true });
  });
  it('gets richer with each tier and never exceeds the pixel-ratio cap of 2', () => {
    const order = TIER_NAMES.map((n) => TIERS[n]);
    for (let i = 1; i < order.length; i++) {
      expect(order[i].particles).toBeGreaterThan(order[i - 1].particles);
      expect(order[i].pixelRatio).toBeGreaterThanOrEqual(order[i - 1].pixelRatio);
      expect(order[i].flowField).toBeGreaterThanOrEqual(order[i - 1].flowField);
    }
    expect(Math.max(...order.map((t) => t.pixelRatio))).toBeLessThanOrEqual(2);
  });
  it('falls back to high for an unknown tier and cycles the choices', () => {
    expect(tierSettings('nope')).toBe(TIERS.high);
    expect(['auto', 'low', 'medium', 'high', 'auto'].map((c, i, a) => nextChoice(c)).slice(0, 4)).toEqual(['low', 'medium', 'high', 'auto']);
  });
});

describe('auto quality', () => {
  it('stays on high when the first 2 s window is fast enough, then settles', () => {
    const aq = new AutoQuality('high');
    expect(feed(aq, 12, AUTO_WINDOW_MS / 1000 + 0.1)).toBeNull();
    expect(aq.tier).toBe('high');
    expect(aq.settled).toBe(true);
    expect(feed(aq, 60, 5)).toBeNull(); // settled: later slowness is ignored
    expect(aq.tier).toBe('high');
  });
  it('steps down one tier per slow window, and stops at low', () => {
    const aq = new AutoQuality('high');
    const first = feed(aq, 30, 2.1);
    expect(first).toMatchObject({ from: 'high', to: 'medium' });
    expect(first.avg).toBeGreaterThan(SLOW_FRAME_MS);
    expect(feed(aq, 30, 2.1)).toMatchObject({ from: 'medium', to: 'low' });
    expect(feed(aq, 30, 5)).toBeNull();
    expect(aq.tier).toBe('low');
    expect(aq.settled).toBe(true);
  });
  it('uses the average, not a single spike, and ignores stalls', () => {
    const aq = new AutoQuality('high');
    for (let t = 0; t < 2000; t += 10) aq.push(10);
    expect(aq.tier).toBe('high');
    const b = new AutoQuality('high');
    expect(b.push(5000)).toBeNull();      // a hidden-tab stall is not counted
    expect(b.elapsed).toBe(0);
    expect(b.push(-1)).toBeNull();
    expect(b.push(NaN)).toBeNull();
  });
  it('can start from any tier', () => {
    const aq = new AutoQuality('medium');
    expect(feed(aq, 40, 2.1)).toMatchObject({ from: 'medium', to: 'low' });
  });
});

describe('settings', () => {
  it('has defaults, persists changes, and reloads', () => {
    const storage = createStorage('');
    const a = createSettings(storage);
    expect(a.all()).toEqual(DEFAULTS);
    a.set('quality', 'low');
    expect(createSettings(storage).get('quality')).toBe('low');
  });
  it('rejects unknown keys, ignores unknown stored keys, and notifies listeners once per change', () => {
    const storage = createStorage('');
    storage.set('orbit.settings.v1', { quality: 'high', junk: 1 });
    const s = createSettings(storage);
    expect(s.all()).not.toHaveProperty('junk');
    expect(() => s.set('nope', 1)).toThrow();
    const seen = [];
    s.onChange((k, v) => seen.push([k, v]));
    s.set('quality', 'high'); // unchanged
    s.set('quality', 'medium');
    expect(seen).toEqual([['quality', 'medium']]);
  });
});

describe('reduced motion', () => {
  it('honors an explicit override and defaults to false without matchMedia', () => {
    expect(prefersReducedMotion(true)).toBe(true);
    expect(prefersReducedMotion(false)).toBe(false);
    expect(prefersReducedMotion(null)).toBe(false);
  });
});
