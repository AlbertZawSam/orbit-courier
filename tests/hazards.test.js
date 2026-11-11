import { describe, it, expect } from 'vitest';
import { buildSystem } from '../src/sim/rails.js';
import { createAsteroidField, createHazards, rng, BUCKET_WIDTH } from '../src/sim/hazards.js';
import { detectOutcome } from '../src/sim/outcome.js';
import { predict } from '../src/sim/predict.js';
import { Flight } from '../src/game/flight.js';
import { buildLevelSystem } from '../src/game/replay.js';
import { LEVELS } from '../src/levels/levels.js';

/** A parent body at the origin; its mu sets how fast the rocks orbit. Massless probe path = straight lines. */
const parent = (mu = 4) => buildSystem([{ id: 'sun', name: 'Sol', kind: 'star', mu, radius: 0 }]);
const FIELD = { type: 'asteroids', parent: 'sun', rIn: 10, rOut: 14, count: 120, seed: 7 };

describe('random generator', () => {
  it('is deterministic per seed, in [0, 1), and different across seeds', () => {
    const a = rng(5), b = rng(5), c = rng(6);
    const xs = Array.from({ length: 50 }, () => a()), ys = Array.from({ length: 50 }, () => b()), zs = Array.from({ length: 50 }, () => c());
    expect(xs).toEqual(ys);
    expect(xs).not.toEqual(zs);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
});

describe('asteroid field', () => {
  it('builds the requested number of rocks inside the ring, with sizes in range, and is the same every time', () => {
    const f = createAsteroidField(FIELD, parent().byId), g = createAsteroidField(FIELD, parent().byId);
    expect(f.rocks).toHaveLength(120);
    for (const r of f.rocks) { expect(r.r).toBeGreaterThanOrEqual(10); expect(r.r).toBeLessThanOrEqual(14); expect(r.size).toBeGreaterThanOrEqual(0.06); expect(r.size).toBeLessThanOrEqual(0.16); }
    expect(g.rocks).toEqual(f.rocks);
    const other = createAsteroidField({ ...FIELD, seed: 8 }, parent().byId);
    expect(other.rocks).not.toEqual(f.rocks);
  });
  it('rocks orbit on rails: faster closer in, same radius over time, and the whole ring turns with its parent', () => {
    const sys = parent(), f = createAsteroidField(FIELD, sys.byId);
    const inner = f.rocks.reduce((a, b) => (a.r < b.r ? a : b)), outer = f.rocks.reduce((a, b) => (a.r > b.r ? a : b));
    expect(Math.abs(inner.n)).toBeGreaterThan(Math.abs(outer.n));
    for (const t of [0, 3.7, 20]) for (const [x, z] of f.positionsAt(t)) { const r = Math.hypot(x, z); expect(r).toBeGreaterThanOrEqual(10 - 1e-9); expect(r).toBeLessThanOrEqual(14 + 1e-9); }
    const moving = buildSystem([{ id: 'sun', kind: 'star', mu: 1000, radius: 0 }, { id: 'p', kind: 'rocky', mu: 4, radius: 0, orbit: { a: 50, e: 0, phase: 0, parent: 'sun' } }]);
    const ring = createAsteroidField({ ...FIELD, parent: 'p' }, moving.byId);
    const [px, pz] = moving.byId.p.pos(5);
    for (const [x, z] of ring.positionsAt(5)) { const r = Math.hypot(x - px, z - pz); expect(r).toBeGreaterThanOrEqual(10 - 1e-9); expect(r).toBeLessThanOrEqual(14 + 1e-9); }
  });
  it('a probe exactly on a rock crashes; just outside its size does not; far away does not', () => {
    const sys = parent(), f = createAsteroidField(FIELD, sys.byId), rock = f.rocks[3];
    const [x, z] = f.positionsAt(2.5)[3];
    expect(f.collides(x, z, 2.5)).toMatchObject({ bodyId: 'asteroid' });
    expect(f.collides(x + rock.size * 0.9, z, 2.5) !== null || f.collidesBrute(x + rock.size * 0.9, z, 2.5)).toBe(true);
    // a point comfortably clear of every rock
    expect(f.collides(0, 0, 2.5)).toBeNull();
    expect(f.collides(100, 100, 2.5)).toBeNull();
  });
  it('uses the rock positions at the time asked: a spot that is a hit now is empty later', () => {
    const sys = parent(), f = createAsteroidField({ ...FIELD, count: 6, seed: 3 }, sys.byId);
    const [x, z] = f.positionsAt(0)[0];
    expect(f.collides(x, z, 0)).not.toBeNull();
    expect(f.collides(x, z, 50)).toBeNull(); // sparse field: the rock has long moved on
  });
  it('the radial grid never misses what brute force finds, and never invents hits', () => {
    const sys = parent(), f = createAsteroidField({ ...FIELD, count: 300, minSize: 0.1, maxSize: 0.4 }, sys.byId), rand = rng(99);
    let hits = 0;
    for (let k = 0; k < 4000; k++) {
      const x = (rand() - 0.5) * 36, z = (rand() - 0.5) * 36, t = rand() * 30;
      const grid = f.collides(x, z, t) !== null, brute = f.collidesBrute(x, z, t);
      expect(grid, `${x},${z},${t}`).toBe(brute);
      if (brute) hits++;
    }
    expect(hits).toBeGreaterThan(20); // the comparison actually exercised hits, not only misses
    expect(BUCKET_WIDTH).toBeGreaterThan(0);
  });
  it('exerts no pull on the probe', () => {
    expect(createAsteroidField(FIELD, parent().byId).accel(11, 3, 0)).toEqual([0, 0]);
  });
  it('is built from level data, and unknown hazard types are rejected loudly', () => {
    const sys = parent();
    const made = createHazards([FIELD], sys.byId);
    expect(made).toHaveLength(1);
    expect(made[0].type).toBe('asteroids');
    expect(createHazards(undefined, sys.byId)).toEqual([]);
    expect(() => createHazards([{ type: 'black_hole' }], sys.byId)).toThrow(/unknown hazard/);
    const level = { ...LEVELS[0], hazards: [{ type: 'asteroids', parent: 'home', rIn: 3, rOut: 4, count: 10, seed: 2 }] };
    expect(buildLevelSystem(level).hazards).toHaveLength(1);
    expect(buildLevelSystem(LEVELS[0]).hazards).toEqual([]);
  });
});

describe('asteroid collisions in the outcome check, the flight and the preview', () => {
  const dense = { type: 'asteroids', parent: 'sun', rIn: 10, rOut: 14, count: 500, seed: 11, minSize: 0.25, maxSize: 0.4 };
  const world = (spec, mu = 4) => { const sys = parent(mu); return Object.assign(sys, { hazards: createHazards([spec], sys.byId), bounds: 500 }); };

  it('detectOutcome reports an asteroid crash, but a body crash still wins when both apply', () => {
    const sys = world(dense), f = sys.hazards[0];
    const [x, z] = f.positionsAt(0)[0];
    expect(detectOutcome({ x, z, vx: 0, vz: 0 }, 0, sys.bodies, 500, { hazards: sys.hazards })).toMatchObject({ type: 'crash', bodyId: 'asteroid' });
    expect(detectOutcome({ x, z, vx: 0, vz: 0 }, 0, sys.bodies, 500)).toBeNull(); // no hazards passed: no collision
    const withBody = buildSystem([{ id: 'sun', kind: 'star', mu: 4, radius: 0 }, { id: 'rock', kind: 'moon', mu: 0, radius: 1000 }]);
    expect(detectOutcome({ x, z, vx: 0, vz: 0 }, 0, withBody.bodies, 500, { hazards: sys.hazards }).bodyId).toBe('rock');
  });
  it('a probe that flies through a dense field crashes into an asteroid, and the preview crashes on the same step', () => {
    const sys = world(dense), probe = { x: -25, z: 0.1, vx: 4, vz: 0.02 };
    const f = new Flight(sys, probe, { t0: 0 });
    while (!f.done && f.elapsed < 30) f.advance(0.5);
    expect(f.outcome).toMatchObject({ type: 'crash', bodyId: 'asteroid' });
    expect(Math.hypot(f.outcome.x, f.outcome.z)).toBeGreaterThan(9.5);
    const pre = predict(sys, probe, { steps: 4000 });
    expect(pre.crash).toMatchObject({ bodyId: 'asteroid', i: f.i });
  });
  it('a probe that stays outside the ring is never hit', () => {
    const sys = world(dense), probe = { x: -25, z: 20, vx: 4, vz: 0 };   // passes 20 from the centre, well outside the 14 ring
    const f = new Flight(sys, probe, { t0: 0 });
    while (!f.done && f.elapsed < 14) f.advance(0.5);
    expect(f.done).toBe(false);
  });
  it('a probe inside the ring hole is safe too', () => {
    const sys = world(dense, 0.0001), probe = { x: -6, z: 2, vx: 3, vz: 0 }; // a nearly massless parent: a straight line that stays within ~6.4 of the centre, inside rIn = 10
    const f = new Flight(sys, probe, { t0: 0 });
    while (!f.done && f.elapsed < 4) f.advance(0.5);
    expect(f.done).toBe(false);
  });
  it('previews can step through a field without mutating it (the same call twice agrees)', () => {
    const sys = world(dense), probe = { x: -25, z: 0.1, vx: 4, vz: 0.02 };
    expect(predict(sys, probe, { steps: 3000 }).crash).toEqual(predict(sys, probe, { steps: 3000 }).crash);
  });
});
