import { describe, it, expect } from 'vitest';
import { buildSystem } from '../src/sim/rails.js';
import { createAsteroidField, createSolarWind, createHazards, darkMassBody, DARK_MASS_RADIUS, rng, BUCKET_WIDTH } from '../src/sim/hazards.js';
import { posAt } from '../src/sim/rails.js';
import { vCirc } from '../src/sim/calc.js';
import { step, timeAt } from '../src/sim/gravity.js';
import { audioFrame } from '../src/audio/state.js';
import { humFreq } from '../src/audio/dsp.js';
import { accel } from '../src/sim/gravity.js';
import { validateLevel } from '../src/levels/schema.js';
import { createMission } from '../src/sim/missions.js';
import { closestOnSegment } from '../src/sim/geometry.js';
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

describe('solar wind', () => {
  const free = () => Object.assign(buildSystem([{ id: 'sun', kind: 'star', mu: 0, radius: 0 }]), { bounds: 1000 });
  const wind = (o = {}) => ({ type: 'solar_wind', x: 0, z: 0, radius: 50, strength: 0.5, angle0: 0, rotation: 0, edge: 0.5, ...o });
  const world = (spec) => { const sys = free(); return Object.assign(sys, { hazards: createHazards([spec], sys.byId) }); };

  it('pushes with a constant strength in its direction inside the zone, and not at all outside', () => {
    const w = createSolarWind(wind({ angle0: Math.PI / 2 }), free().byId);
    const [ax, az] = w.accel(3, 4, 0);
    expect(ax).toBeCloseTo(0, 12); expect(az).toBeCloseTo(0.5, 12);
    expect(Math.hypot(...w.accel(-10, 20, 7))).toBeCloseTo(0.5, 12);
    expect(w.accel(80, 0, 0)).toEqual([0, 0]);
  });
  it('the direction turns slowly and steadily with time, while the strength stays constant', () => {
    const w = createSolarWind(wind({ angle0: 0.3, rotation: 0.2 }), free().byId);
    for (const t of [0, 1, 5, 13]) {
      const [ax, az] = w.accel(1, 1, t);
      expect(Math.atan2(az, ax)).toBeCloseTo(0.3 + 0.2 * t, 9);
      expect(Math.hypot(ax, az)).toBeCloseTo(0.5, 12);
      expect(w.angleAt(t)).toBeCloseTo(0.3 + 0.2 * t, 12);
    }
  });
  it('fades out smoothly at the rim: no jump, never rises going outwards', () => {
    const w = createSolarWind(wind({ radius: 10, edge: 2 }), free().byId);
    expect(w.weight(7, 0, 0)).toBe(1);
    expect(w.weight(10, 0, 0)).toBe(0);
    let prev = 1;
    for (let d = 8; d <= 10.01; d += 0.05) { const x = w.weight(d, 0, 0); expect(x).toBeLessThanOrEqual(prev + 1e-12); expect(prev - x).toBeLessThan(0.1); prev = x; }
  });
  it('can follow a moving body', () => {
    const sys = buildSystem([{ id: 'sun', kind: 'star', mu: 1000, radius: 0 }, { id: 'p', kind: 'rocky', mu: 1, radius: 0, orbit: { a: 30, e: 0, phase: 0, parent: 'sun' } }]);
    const w = createSolarWind(wind({ parent: 'p', radius: 4 }), sys.byId);
    const [px, pz] = sys.byId.p.pos(6);
    expect(Math.hypot(...w.accel(px + 1, pz, 6))).toBeCloseTo(0.5, 12);
    expect(w.accel(0, 0, 6)).toEqual([0, 0]); // the star's position is far from the zone now
    expect(w.centreAt(6)).toEqual([px, pz]);
  });
  it('adds to the gravity step: accel() sums bodies and hazards', () => {
    const sys = world(wind({ strength: 0.25, angle0: 0 }));
    expect(accel(5, 5, 0, sys.bodies, sys.hazards)).toEqual([0.25, 0]);
  });
  it('a steady push gives exact constant-acceleration motion in flight (x = a t^2 / 2), and the preview matches the flight', () => {
    const sys = world(wind({ strength: 0.5 }));
    const probe = { x: 0, z: 0, vx: 0, vz: 0 };
    const f = new Flight(sys, probe, { t0: 0 });
    while (f.elapsed < 2 - 1e-9) f.advance(1 / 120);
    expect(f.probe.x).toBeCloseTo(0.5 * 0.5 * 4, 6);
    expect(Math.abs(f.probe.z)).toBeLessThan(1e-12);
    const pre = predict(sys, probe, { steps: f.i });
    const last = pre.points.at(-1);
    expect(Math.abs(last.x - f.probe.x)).toBeLessThan(1e-9);
    const plain = predict(free(), probe, { steps: f.i }).points.at(-1);
    expect(plain.x).toBe(0);                                     // without the wind the probe does not move
  });
  it('a rotating wind bends the path into a curve', () => {
    const sys = world(wind({ strength: 0.6, rotation: 0.8 })), probe = { x: 0, z: 0, vx: 2, vz: 0 };
    const pre = predict(sys, probe, { steps: 1200 });
    const end = pre.points.at(-1);
    expect(Math.abs(end.z)).toBeGreaterThan(1);                  // pushed sideways as the direction turned
    const straight = predict(free(), probe, { steps: 1200 }).points.at(-1);
    expect(straight.z).toBe(0);
  });
  it('a wind changes whether a gate run is won: it pushes the probe off a gate, and a compensating aim wins', () => {
    const mission = { type: 'gate_run', target: 'sun', gates: [{ x: 10, z: 0, angle: Math.PI / 2, half: 1 }] };
    const run = (sys, probe) => { const f = new Flight(sys, probe, { t0: 0, mission }); while (!f.done && f.elapsed < 8) f.advance(0.25); return f; };
    const straight = { x: 0, z: 0, vx: 2, vz: 0 };
    expect(run(free(), straight).outcome?.type).toBe('delivered');              // no wind: straight through
    const windy = world(wind({ strength: 0.5, angle0: Math.PI / 2 }));          // pushes +z: after 5 s it is 6.25 off the gate
    expect(run(windy, straight).done).toBe(false);
    expect(run(windy, { ...straight, vz: -1.25 }).outcome?.type).toBe('delivered'); // aimed to drift back onto the gate
    expect(createMission(mission).type).toBe('gate_run');
  });
  it('is built from level data and checked by the schema', () => {
    expect(createHazards([wind()], free().byId)[0].type).toBe('solar_wind');
    const base = LEVELS[0];
    expect(validateLevel({ ...base, hazards: [wind()] }).filter((e) => /hazard|wind/.test(e))).toEqual([]);
    expect(validateLevel({ ...base, hazards: [{ type: 'solar_wind', radius: 0, strength: 1 }] }).join('\n')).toMatch(/solar_wind needs/);
    expect(validateLevel({ ...base, hazards: [{ type: 'asteroids', parent: 'nowhere', rIn: 5, rOut: 3, count: 0 }] }).join('\n')).toMatch(/asteroids need/);
    expect(validateLevel({ ...base, hazards: [{ type: 'comet' }] }).join('\n')).toMatch(/unknown hazard type "comet"/);
  });
});

describe('dark mass', () => {
  const MU = 200;
  const world = (extra = {}) => Object.assign(buildSystem([darkMassBody({ mu: MU, x: 0, z: 0, ...extra })]), { bounds: 500, hazards: [] });
  /** Fly past the mass on a straight-ish line with impact parameter b; returns the deflection angle of the velocity. */
  const deflection = (b, speed = 6) => {
    let p = { x: -30, z: b, vx: speed, vz: 0 }, t = 0, crashed = false;
    const sys = world();
    for (let i = 0; i < 12000; i++) {
      const prev = { x: p.x, z: p.z, t: timeAt(0, i) };
      p = step(p, timeAt(0, i), sys.bodies, []);
      t = timeAt(0, i + 1);
      if (detectOutcome(p, t, sys.bodies, 500, { prev })?.type === 'crash') { crashed = true; break; }
      if (p.x > 30) break;
    }
    return { crashed, angle: Math.abs(Math.atan2(p.vz, p.vx)) };
  };

  it('is a tiny body with a huge pull, fixed where it is put', () => {
    const d = darkMassBody({ mu: MU, x: 12, z: -3 });
    expect(d).toMatchObject({ kind: 'dark', mu: MU, radius: DARK_MASS_RADIUS, name: 'Dark mass' });
    expect(DARK_MASS_RADIUS).toBeLessThan(0.3);
    expect(posAt(d, 5, {})).toEqual([12, -3]);                 // never moves
    expect(posAt(d, 500, {})).toEqual([12, -3]);
    expect(posAt({ id: 'x', mu: 1, radius: 1 }, 0, {})).toEqual([0, 0]); // other fixed bodies still default to the origin
    const orbiting = darkMassBody({ mu: MU, orbit: { a: 20, e: 0, phase: 0, parent: 'sun' } });
    expect(orbiting.at).toBeUndefined();
    expect(orbiting.orbit.parent).toBe('sun');
  });
  it('is added to the level system as a body, so gravity, crashes and the preview all see it', () => {
    const level = { ...LEVELS[0], hazards: [{ type: 'dark_mass', mu: 150, x: 40, z: 40 }] };
    const sys = buildLevelSystem(level);
    expect(sys.byId.dark).toBeTruthy();
    expect(sys.bodies).toHaveLength(LEVELS[0].system.bodies.length + 1);
    expect(sys.hazards).toEqual([]);
    expect(sys.byId.dark.pos(3)).toEqual([40, 40]);
    expect(buildLevelSystem(LEVELS[0]).byId.dark).toBeUndefined();
  });
  it('pulls hard: the closer a probe passes, the more its path bends (strong assist)', () => {
    // Passes closer than about 2 units reach tens of units per second, faster than the fixed 1/120 s step resolves, so
    // their exact bend is only as good as the integrator (preview and flight still agree: see below). Level design keeps
    // intended assists in the range checked here.
    const angles = [20, 10, 6, 4, 3].map((b) => deflection(b));
    for (const a of angles) expect(a.crashed).toBe(false);
    for (let i = 1; i < angles.length; i++) expect(angles[i].angle).toBeGreaterThan(angles[i - 1].angle);
    expect(angles.at(-1).angle).toBeGreaterThan(1.5);            // a close pass swings it round by more than 85 degrees
  });
  it('flybys conserve energy and angular momentum through a strong pull, for passes the step can resolve', () => {
    const sys = world();
    for (const b of [10, 6, 4, 3]) {
      let p = { x: -30, z: b, vx: 6, vz: 0 };
      const energy = (q) => (q.vx ** 2 + q.vz ** 2) / 2 - MU / Math.sqrt(q.x ** 2 + q.z ** 2 + 1e-4), L = (q) => q.x * q.vz - q.z * q.vx;
      const e0 = energy(p), l0 = L(p);
      for (let i = 0; i < 12000 && p.x < 30; i++) p = step(p, timeAt(0, i), sys.bodies, []);
      expect(Math.abs((energy(p) - e0) / e0), `energy, b=${b}`).toBeLessThan(0.03);
      expect(Math.abs((L(p) - l0) / l0), `angular momentum, b=${b}`).toBeLessThan(0.03);
    }
  });
  it('a path through the body is death: a crash at its tiny radius, reported as the dark mass', () => {
    const sys = world(), probe = { x: -30, z: 0, vx: 6, vz: 0 };
    const f = new Flight(sys, probe, { t0: 0 });
    while (!f.done && f.elapsed < 20) f.advance(0.25);
    expect(f.outcome).toMatchObject({ type: 'crash', bodyId: 'dark' });
    expect(deflection(0).crashed).toBe(true);
    expect(deflection(0.05).crashed).toBe(true);
  });
  it('a fast probe cannot tunnel through it between two steps', () => {
    // At 60 units/s one step is 0.5 units, more than four times the body's diameter.
    const sys = world(), a = { x: -0.25, z: 0, t: 0 }, b = { x: 0.25, z: 0, vx: 60, vz: 0 };
    expect(detectOutcome(b, 0, sys.bodies, 500)).toBeNull();                               // end point alone sees nothing
    expect(detectOutcome(b, 0, sys.bodies, 500, { prev: a })).toMatchObject({ type: 'crash', bodyId: 'dark' });
    const miss = detectOutcome({ x: 0.25, z: 0.5, vx: 60, vz: 0 }, 0, sys.bodies, 500, { prev: { x: -0.25, z: 0.5, t: 0 } });
    expect(miss).toBeNull();                                                                // a segment passing 0.5 away is safe
    const hit = detectOutcome(b, 0, sys.bodies, 500, { prev: a });
    expect(Math.hypot(hit.x, hit.z)).toBeLessThan(DARK_MASS_RADIUS);                        // reported at the closest point on the path
  });
  it('the preview matches the flight past it, step for step', () => {
    const sys = world(), probe = { x: -30, z: 3, vx: 6, vz: 0 };
    const pre = predict(sys, probe, { steps: 900 });
    const f = new Flight(sys, probe, { t0: 0 });
    while (f.i < 900 && !f.done) f.advance(1 / 60);
    const ref = predict(sys, probe, { steps: f.i }).points.at(-1);
    expect(Math.abs(ref.x - f.probe.x)).toBeLessThan(1e-9);
    expect(Math.abs(ref.z - f.probe.z)).toBeLessThan(1e-9);
    expect(pre.closest.dark.dist).toBeGreaterThan(0.5);
  });
  it('holds a stable circular orbit with small energy drift despite the strong pull', () => {
    const sys = world(), r = 4;
    let p = { x: r, z: 0, vx: 0, vz: vCirc(MU, r) };
    const energy = (q) => (q.vx ** 2 + q.vz ** 2) / 2 - MU / Math.sqrt(q.x ** 2 + q.z ** 2 + 1e-4);
    const e0 = energy(p);
    let worst = 0;
    for (let i = 0; i < 20 * 120; i++) { p = step(p, timeAt(0, i), sys.bodies, []); if (i % 50 === 0) worst = Math.max(worst, Math.abs((energy(p) - e0) / e0)); }
    expect(worst).toBeLessThan(0.005);
  });
  it('is finite and bounded even if the probe starts right on top of it', () => {
    const sys = world();
    const p = step({ x: 0, z: 0, vx: 0, vz: 0 }, 0, sys.bodies, []);
    expect(Number.isFinite(p.x) && Number.isFinite(p.vx)).toBe(true);
  });
  it('is heard as a deep sub tone, lower than any other body', () => {
    const sys = Object.assign(buildSystem([{ id: 'home', kind: 'rocky', mu: 20, radius: 0.8, at: [20, 0] }, darkMassBody({ mu: MU, x: 0, z: 0 })]), { hazards: [] });
    const f = audioFrame(sys, { x: 3, z: 0, vx: 0, vz: 0 }, 0, 'home');
    expect(f.hum[0].id).toBe('dark');                            // by far the strongest pull
    expect(humFreq(f.hum[0].accel, 'dark')).toBeLessThan(humFreq(f.hum[0].accel, 'star'));
    expect(humFreq(1, 'dark')).toBeLessThan(humFreq(1, 'gas'));
  });
  it('schema: needs a positive mu and a free id', () => {
    const base = LEVELS[0];
    expect(validateLevel({ ...base, hazards: [{ type: 'dark_mass', mu: 100, x: 5, z: 5 }] }).filter((e) => /dark|hazard/.test(e))).toEqual([]);
    expect(validateLevel({ ...base, hazards: [{ type: 'dark_mass', mu: 0 }] }).join('\n')).toMatch(/dark_mass needs/);
    expect(validateLevel({ ...base, hazards: [{ type: 'dark_mass', mu: 100, id: 'home' }] }).join('\n')).toMatch(/dark_mass needs/);
  });
});

describe('swept contact', () => {
  const P = (x, z) => ({ x, z });
  const PT = (x, z) => ({ x, z, t: 0 });
  it('finds the closest point on a segment, clamped to its ends, and handles a zero-length segment', () => {
    expect(closestOnSegment(P(0, 0), P(10, 0), P(4, 3))).toEqual({ x: 4, z: 0, dist: 3 });
    expect(closestOnSegment(P(0, 0), P(10, 0), P(-5, 0))).toEqual({ x: 0, z: 0, dist: 5 });
    expect(closestOnSegment(P(0, 0), P(10, 0), P(14, 3)).dist).toBeCloseTo(5, 12);
    expect(closestOnSegment(P(2, 2), P(2, 2), P(5, 6)).dist).toBeCloseTo(5, 12);
  });
  it('without a previous position the old end-point test is unchanged', () => {
    const sys = Object.assign(buildSystem([{ id: 'm', kind: 'moon', mu: 0, radius: 1 }]), { bounds: 500 });
    expect(detectOutcome({ x: 0.5, z: 0, vx: 0, vz: 0 }, 0, sys.bodies).type).toBe('crash');
    expect(detectOutcome({ x: 3, z: 0, vx: 0, vz: 0 }, 0, sys.bodies)).toBeNull();
  });
  it('a swept path that only grazes outside the radius is safe, and one that clips it crashes', () => {
    const sys = Object.assign(buildSystem([{ id: 'm', kind: 'moon', mu: 0, radius: 1 }]), { bounds: 500 });
    const run = (z) => detectOutcome({ x: 5, z, vx: 9, vz: 0 }, 0, sys.bodies, 500, { prev: PT(-5, z) });
    expect(run(1.01)).toBeNull();
    expect(run(0.99)).toMatchObject({ type: 'crash' });
  });
  it('landing still works with swept contact: the touchdown point is on the path and the speed is judged as before', () => {
    const sys = Object.assign(buildSystem([{ id: 'm', kind: 'moon', mu: 0, radius: 1 }]), { bounds: 500 });
    const out = detectOutcome({ x: -0.9, z: 0, vx: 0.5, vz: 0 }, 0, sys.bodies, 500, { landing: { target: 'm', maxLandSpeed: 1 }, byId: sys.byId, prev: PT(-1.2, 0) });
    expect(out).toMatchObject({ type: 'landed', speed: 0.5 });
  });
});

describe('swept contact in the body\'s own frame', () => {
  it('does not mistake a launch from a fast-moving planet for a crash (the planet moves further per step than the pad clearance)', () => {
    const sun = { id: 'sun', kind: 'star', mu: 1000, radius: 2 };
    const home = { id: 'home', kind: 'rocky', mu: 20, radius: 0.8, orbit: { a: 30, e: 0, phase: 0, parent: 'sun' } };
    const sys = Object.assign(buildSystem([sun, home]), { bounds: 500, hazards: [] });
    const [hx, hz] = sys.byId.home.pos(0), [vx, vz] = [0, 5.7735];
    // the pad is 0.04 above the surface; Home itself moves ~0.048 per step. Launch 'backwards' so the new Home position is nearest.
    const probe = { x: hx, z: hz + 0.8 * 1.05, vx, vz: vz + 5 };
    const pre = predict(sys, probe, { steps: 60 });
    expect(pre.crash).toBeNull();
  });
  it('still catches a genuine hit on a moving body', () => {
    const sun = { id: 'sun', kind: 'star', mu: 1000, radius: 2 };
    const home = { id: 'home', kind: 'rocky', mu: 20, radius: 0.8, orbit: { a: 30, e: 0, phase: 0, parent: 'sun' } };
    const sys = Object.assign(buildSystem([sun, home]), { bounds: 500, hazards: [] });
    const [hx, hz] = sys.byId.home.pos(0);
    const probe = { x: hx, z: hz + 4, vx: 0, vz: 5.7735 - 3 };            // heading down onto Home at 3 units/s relative
    expect(predict(sys, probe, { steps: 600 }).crash?.bodyId).toBe('home');
  });
});
