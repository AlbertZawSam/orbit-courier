import { describe, it, expect, afterEach } from 'vitest';
import { createBus } from '../src/state/events.js';
import { createStorage } from '../src/state/storage.js';
import { createTelemetry } from '../src/state/telemetry.js';
import { summarize, angleSpreadDeg } from '../src/coach/stats.js';
import { LEVELS } from '../src/levels/levels.js';

const att = (o = {}) => ({ levelId: 'L1', tutorial: false, launchAngle: 1.4, launchPower: 5.4, outcome: 'delivered', fuelUsed: 0, planEdits: 2, previewUsed: true, mapUsed: false, slowmoSeconds: 0, nodes: [], assisted: false, closestApproaches: { kepi: 1.5 }, ...o });

describe('storage', () => {
  afterEach(() => { delete globalThis.localStorage; });
  it('falls back to memory when localStorage is missing', () => {
    const s = createStorage('t.');
    expect(s.persistent).toBe(false);
    s.set('a', { x: 1 });
    expect(s.get('a')).toEqual({ x: 1 });
    expect(s.get('missing', 'fb')).toBe('fb');
    s.remove('a');
    expect(s.get('a')).toBeNull();
  });
  it('falls back to memory when localStorage throws', () => {
    globalThis.localStorage = { setItem() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    const s = createStorage('');
    s.set('k', [1, 2]);
    expect(s.get('k')).toEqual([1, 2]);
  });
});

describe('telemetry', () => {
  const run = (bus, outcome = 'delivered') => {
    bus.emit('level_start', { levelId: 'L1' });
    bus.emit('aim_changed', {}); bus.emit('node_added', {}); bus.emit('node_moved', {});
    bus.emit('launch', { angle: 1.4, power: 5.4, nodes: [{ t: 1, dv: [0.2, 0] }] });
    bus.emit('slowmo_end', { seconds: 1.5 });
    bus.emit('attempt_end', { outcome, fuelUsed: 0.2, seconds: 6, closestApproaches: { kepi: 1.1 } });
  };
  it('builds one attempt record per attempt from events', () => {
    const bus = createBus(), t = createTelemetry({ bus, storage: createStorage('') });
    run(bus);
    expect(t.attempts()).toHaveLength(1);
    expect(t.attempts()[0]).toMatchObject({ levelId: 'L1', outcome: 'delivered', launchAngle: 1.4, launchPower: 5.4, fuelUsed: 0.2, slowmoSeconds: 1.5, planEdits: 3, tutorial: false, assisted: false });
    expect(t.attempts()[0].nodes).toHaveLength(1);
    expect(t.attempts()[0].closestApproaches.kepi).toBe(1.1);
  });
  it('starts the next attempt clean and keeps only the last 300 events', () => {
    const bus = createBus(), t = createTelemetry({ bus, storage: createStorage('') });
    run(bus); run(bus, 'crash:home');
    expect(t.attempts()[1].planEdits).toBe(3);
    for (let i = 0; i < 400; i++) bus.emit('ui_click');
    expect(t.events().length).toBe(300);
  });
  it('persists through storage and reloads', () => {
    const storage = createStorage('');
    const bus = createBus(); createTelemetry({ bus, storage }); run(bus);
    const again = createTelemetry({ bus: createBus(), storage });
    expect(again.attempts()).toHaveLength(1);
  });
  it('marks assisted attempts', () => {
    const bus = createBus(), t = createTelemetry({ bus, storage: createStorage('') });
    bus.emit('level_start', { levelId: 'L1' }); bus.emit('assist_used'); bus.emit('attempt_end', { outcome: 'delivered', fuelUsed: 0, seconds: 1 });
    expect(t.attempts()[0].assisted).toBe(true);
  });
});

describe('summarize', () => {
  const l1 = LEVELS[0];
  it('excludes tutorial attempts and other levels', () => {
    const s = summarize('L1', [att(), att({ tutorial: true }), att({ levelId: 'L2' })], l1);
    expect(s.attempts).toBe(1);
  });
  it('computes outcomes, repeated failures, and last outcome', () => {
    const s = summarize('L1', [att({ outcome: 'crash:home' }), att({ outcome: 'crash:home' }), att({ outcome: 'lost' }), att()], l1);
    expect(s).toMatchObject({ attempts: 4, delivered: 1, failures: 3, lastOutcome: 'delivered' });
    expect(s.repeatedOutcome).toEqual({ outcome: 'crash:home', count: 2 });
    expect(s.outcomes).toEqual({ 'crash:home': 2, lost: 1 });
  });
  it('parRatio is fuel over max(par, 0.02), using the best delivered run', () => {
    expect(summarize('L1', [att({ fuelUsed: 0.5 }), att({ fuelUsed: 0.2 })], l1).parRatio).toBeCloseTo(0.2 / 0.02, 12);
    expect(summarize('L3', [att({ levelId: 'L3', fuelUsed: 0.6 })], LEVELS[2]).parRatio).toBeCloseTo(2, 12);
    expect(summarize('L1', [att({ outcome: 'lost' })], l1).parRatio).toBeNull();
  });
  it('scrubChurn is the average edits per attempt', () => {
    expect(summarize('L1', [att({ planEdits: 2 }), att({ planEdits: 6 })], l1).scrubChurn).toBe(4);
    expect(summarize('L1', [], l1).scrubChurn).toBe(0);
  });
  it('angle spread handles wraparound and closest approach picks the minimum', () => {
    expect(angleSpreadDeg([0.05, 2 * Math.PI - 0.05])).toBeCloseTo((0.1 * 180) / Math.PI, 6);
    expect(angleSpreadDeg([1])).toBe(0);
    expect(summarize('L1', [att({ closestApproaches: { kepi: 3 } }), att({ closestApproaches: { kepi: 1.2 } })], l1).closestToTarget).toBe(1.2);
  });
  it('tracks previews, slow motion, nodes and assists', () => {
    const s = summarize('L1', [att({ slowmoSeconds: 1 }), att({ slowmoSeconds: 2, nodes: [{}], assisted: true })], l1);
    expect(s).toMatchObject({ slowmoSeconds: 3, nodeAttempts: 1, assistedAttempts: 1, previewUsed: true, mapUsed: false });
  });
});
