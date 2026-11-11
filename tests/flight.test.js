import { describe, it, expect } from 'vitest';
import { buildSystem } from '../src/sim/rails.js';
import { launchProbe } from '../src/sim/probe.js';
import { predict } from '../src/sim/predict.js';
import { Flight } from '../src/game/flight.js';
import { createBus } from '../src/state/events.js';
import { sandbox } from '../src/levels/sandbox.js';

const make = () => Object.assign(buildSystem(sandbox.bodies.map((b) => ({ ...b }))), { bounds: sandbox.bounds });

describe('event bus', () => {
  it('delivers typed and wildcard events', () => {
    const bus = createBus(), seen = [];
    bus.on('a', (e) => seen.push(['a', e.x])); bus.on('*', (e) => seen.push(['*', e.type]));
    bus.emit('a', { x: 1 }); bus.emit('b');
    expect(seen).toEqual([['a', 1], ['*', 'a'], ['*', 'b']]);
  });
  it('unsubscribes', () => {
    const bus = createBus(); let n = 0;
    const off = bus.on('a', () => n++); bus.emit('a'); off(); bus.emit('a');
    expect(n).toBe(1);
  });
});

describe('flight', () => {
  it('follows the preview exactly regardless of frame pacing', () => {
    const sys = make(), pad = sys.byId.home;
    const p0 = launchProbe(pad, sys.byId, { angle: 0.6, power: 5, t0: 0 });
    const pre = predict(sys, p0, { t0: 0, steps: 400 });
    for (const frame of [1 / 60, 1 / 13, 0.1]) {
      const f = new Flight(sys, p0, { t0: 0 });
      while (f.i < pre.steps && !f.done) f.advance(frame);
      const k = Math.min(f.i, pre.steps);
      if (f.i === k && f.i > 0) {
        // compare at the step the flight actually reached
        const ref = predict(sys, p0, { t0: 0, steps: f.i });
        const last = ref.points[ref.points.length - 1];
        expect(Math.abs(f.probe.x - last.x)).toBeLessThan(1e-9);
        expect(Math.abs(f.probe.z - last.z)).toBeLessThan(1e-9);
      }
    }
  });
  it('emits crash and stops, like the preview', () => {
    const sys = make(), bus = createBus(), events = [];
    bus.on('*', (e) => events.push(e.type));
    const p0 = launchProbe(sys.byId.home, sys.byId, { angle: 0, power: 0, t0: 0 });
    const pre = predict(sys, p0, { t0: 0, steps: 1800 });
    const f = new Flight(sys, p0, { t0: 0, bus });
    for (let k = 0; k < 600 && !f.done; k++) f.advance(0.05);
    expect(pre.crash).not.toBeNull();
    expect(f.outcome.type).toBe('crash');
    expect(f.outcome.bodyId).toBe(pre.crash.bodyId);
    expect(f.i).toBe(pre.crash.i);
    expect(events).toContain('crash');
  });
});
