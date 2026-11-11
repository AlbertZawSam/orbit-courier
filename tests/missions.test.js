import { describe, it, expect } from 'vitest';
import { buildSystem, velAt } from '../src/sim/rails.js';
import { predict } from '../src/sim/predict.js';
import { createMission, createRendezvous, createSoftLanding, landingOf } from '../src/sim/missions.js';
import { detectOutcome } from '../src/sim/outcome.js';
import { missionGoal, describeProgress } from '../src/sim/missionText.js';
import { validateLevel } from '../src/levels/schema.js';
import { Flight } from '../src/game/flight.js';
import { createBus } from '../src/state/events.js';
import { LEVELS } from '../src/levels/levels.js';

/** A system with one static station and nothing else: free flight, so every path is a straight line. */
const station = () => Object.assign(buildSystem([{ id: 'stn', name: 'Vex', kind: 'station', mu: 0, radius: 0 }]), { bounds: 200 });
const RV = { type: 'rendezvous', target: 'stn', captureDist: 0.5, maxRelSpeed: 1 };
const fly = (sys, probe, mission, seconds = 30) => {
  const f = new Flight(sys, probe, { t0: 0, mission });
  while (!f.done && f.elapsed < seconds) f.advance(0.5);
  return f;
};

describe('rendezvous', () => {
  it('wins when the probe is close and matching speed', () => {
    const sys = station(), m = createRendezvous(RV);
    const st = m.update({ x: 0.3, z: 0, vx: 0.2, vz: 0 }, 0, sys.byId);
    expect(st.done).toBe(true);
    expect(st.progress).toBe(1);
  });
  it('does not win on a fast pass, even right on top of the station', () => {
    const sys = station(), m = createRendezvous(RV);
    const st = m.update({ x: 0.1, z: 0, vx: 4, vz: 0 }, 0, sys.byId);
    expect(st.done).toBe(false);
    expect(st.relSpeed).toBeCloseTo(4, 9);
    expect(st.progress).toBeLessThan(0.5); // being fast caps the progress
  });
  it('does not win when slow but too far away', () => {
    const m = createRendezvous(RV);
    expect(m.update({ x: 3, z: 0, vx: 0, vz: 0 }, 0, station().byId).done).toBe(false);
  });
  it('measures speed relative to a moving station, not to the sky', () => {
    const sun = { id: 'sun', kind: 'star', mu: 100, radius: 0 };
    const stn = { id: 'stn', kind: 'station', mu: 0, radius: 0, orbit: { a: 10, e: 0, phase: 0, parent: 'sun' } };
    const sys = buildSystem([sun, stn]);
    const [sx, sz] = stn.pos(0), [vx, vz] = velAt(stn, 0, sys.byId);
    expect(Math.hypot(vx, vz)).toBeGreaterThan(3);
    expect(createRendezvous(RV).update({ x: sx + 0.2, z: sz, vx: 0, vz: 0 }, 0, sys.byId).done).toBe(false);       // at rest in the sky: flying past the station at ~3
    expect(createRendezvous(RV).update({ x: sx + 0.2, z: sz, vx, vz }, 0, sys.byId).done).toBe(true);              // co-moving: captured
  });
  it('progress rises as the gap closes', () => {
    const sys = station();
    let prev = -1;
    for (const d of [20, 8, 6, 4, 2, 1, 0.6]) {
      const p = createRendezvous(RV).update({ x: d, z: 0, vx: 0, vz: 0 }, 0, sys.byId).progress;
      expect(p).toBeGreaterThanOrEqual(prev); prev = p;
    }
    expect(prev).toBeGreaterThan(0.9);
  });
  it('stays done once captured', () => {
    const sys = station(), m = createRendezvous(RV);
    m.update({ x: 0.2, z: 0, vx: 0, vz: 0 }, 0, sys.byId);
    expect(m.update({ x: 50, z: 0, vx: 9, vz: 0 }, 1, sys.byId).done).toBe(true);
  });
  it('a slow approach is captured in flight, and the preview delivers on the same step', () => {
    const sys = station(), probe = { x: -10, z: 0.2, vx: 0.8, vz: 0 };
    const f = fly(sys, probe, RV);
    expect(f.outcome.type).toBe('delivered');
    const pre = predict(sys, probe, { steps: 4000, mission: RV });
    expect(pre.delivered.i).toBe(f.i);
    expect(pre.crash).toBeNull();
  });
  it('a fast approach flies through without capturing, and the game does not end the attempt', () => {
    const sys = station(), probe = { x: -10, z: 0.2, vx: 3, vz: 0 };
    const f = fly(sys, probe, RV, 8);
    expect(f.done).toBe(false);
    expect(f.missionState.done).toBe(false);
    expect(f.probe.x).toBeGreaterThan(5); // it kept flying
    expect(predict(sys, probe, { steps: 1200, mission: RV }).delivered).toBeNull();
  });
  it('can be created through createMission and emits mission_complete', () => {
    expect(createMission(RV).type).toBe('rendezvous');
    const sys = station(), bus = createBus(), seen = [];
    bus.on('mission_complete', (e) => seen.push(e));
    const f = new Flight(sys, { x: -3, z: 0.1, vx: 0.8, vz: 0 }, { t0: 0, mission: RV, bus });
    while (!f.done && f.elapsed < 10) f.advance(0.5);
    expect(seen).toHaveLength(1);
  });
});

describe('mission text', () => {
  const nameOf = (id) => ({ stn: 'Vex', kepi: 'Kepi' }[id] ?? id);
  it('describes the goal of each mission type in plain words', () => {
    expect(missionGoal({ type: 'deliver_orbit', target: 'kepi', rMin: 0.8, rMax: 2.5, holdSeconds: 4 }, nameOf)).toBe('orbit Kepi at 0.8-2.5 for 4 s');
    expect(missionGoal(RV, nameOf)).toBe('rendezvous with Vex: get within 0.5 at under 1 relative speed');
  });
  it('shows live progress per mission type, and a dash before launch', () => {
    expect(describeProgress(RV, null)).toBe('-');
    expect(describeProgress(RV, { dist: Infinity, relSpeed: Infinity })).toBe('-');
    expect(describeProgress(RV, { dist: 3.21, relSpeed: 1.46 })).toBe('gap 3.2, rel 1.5 (max 1)');
    expect(describeProgress({ type: 'deliver_orbit', holdSeconds: 4 }, { held: 2.04 })).toBe('2.0 / 4 s');
  });
});

describe('level schema checks mission fields', () => {
  it('accepts a good rendezvous level and rejects a malformed one', () => {
    const base = LEVELS[0];
    const good = { ...base, mission: RV, system: { bodies: [...base.system.bodies, { id: 'stn', kind: 'station', mu: 0, radius: 0 }] } };
    good.mission = { ...RV };
    expect(validateLevel(good).filter((e) => /mission|rendezvous/.test(e))).toEqual([]);
    const bad = { ...good, mission: { ...RV, captureDist: 0 } };
    expect(validateLevel(bad).join('\n')).toMatch(/rendezvous needs captureDist/);
    expect(validateLevel({ ...good, mission: { ...RV, type: 'teleport' } }).join('\n')).toMatch(/unknown mission type/);
  });
});

/** A massless, static moon of radius 1 at the origin: free flight, so a straight path decides everything. */
const moon = (extra = {}) => Object.assign(buildSystem([{ id: 'moon', name: 'Pip', kind: 'moon', mu: 0, radius: 1, ...extra }]), { bounds: 200 });
const SL = { type: 'soft_landing', target: 'moon', maxLandSpeed: 1 };
const probeAt = (x, vx, extra = {}) => ({ x, z: 0, vx, vz: 0, ...extra });

describe('soft landing', () => {
  it('a slow touchdown wins', () => {
    const f = fly(moon(), probeAt(-8, 0.6), SL);
    expect(f.outcome).toMatchObject({ type: 'delivered', how: 'landed' });
    expect(f.outcome.speed).toBeCloseTo(0.6, 9);
    expect(f.missionState).toMatchObject({ done: true, progress: 1 });
  });
  it('a fast touchdown is a crash', () => {
    const f = fly(moon(), probeAt(-8, 2.5), SL);
    expect(f.outcome.type).toBe('crash');
    expect(f.outcome.bodyId).toBe('moon');
    expect(f.outcome.speed).toBeCloseTo(2.5, 9);
  });
  it('the limit is inclusive and the boundary behaves on both sides', () => {
    expect(fly(moon(), probeAt(-8, 1), SL).outcome.type).toBe('delivered');
    expect(fly(moon(), probeAt(-8, 1.05), SL).outcome.type).toBe('crash');
  });
  it('touching a different body is a crash however slowly, and without a landing mission a slow touch also crashes', () => {
    const other = Object.assign(buildSystem([{ id: 'moon', kind: 'moon', mu: 0, radius: 1 }, { id: 'rock', kind: 'moon', mu: 0, radius: 1 }]), { bounds: 200 });
    other.byId.rock.pos = () => [-5, 0]; // a second, static body in the way
    const f = fly(other, probeAt(-12, 0.3), SL);
    expect(f.outcome).toMatchObject({ type: 'crash', bodyId: 'rock' });
    const plain = fly(moon(), probeAt(-8, 0.3), { type: 'rendezvous', target: 'moon', captureDist: 0.01, maxRelSpeed: 0.01 });
    expect(plain.outcome.type).toBe('crash');
  });
  it('speed is measured relative to a moving surface', () => {
    const sun = { id: 'sun', kind: 'star', mu: 0, radius: 0 };
    const moving = Object.assign(buildSystem([sun, { id: 'moon', kind: 'moon', mu: 0, radius: 1, orbit: { a: 12, e: 0, phase: 0, parent: 'sun' } }]), { bounds: 500 });
    // give the sun mass so the moon really moves on its rails
    moving.byId.sun.mu = 100;
    const [mx, mz] = moving.byId.moon.pos(0), [vx, vz] = velAt(moving.byId.moon, 0, moving.byId);
    expect(Math.hypot(vx, vz)).toBeGreaterThan(2);
    const co = detectOutcome({ x: mx + 0.5, z: mz, vx, vz }, 0, moving.bodies, 500, { landing: landingOf(SL), byId: moving.byId });
    const still = detectOutcome({ x: mx + 0.5, z: mz, vx: 0, vz: 0 }, 0, moving.bodies, 500, { landing: landingOf(SL), byId: moving.byId });
    expect(co.type).toBe('landed');
    expect(still.type).toBe('crash');
  });
  it('the preview agrees with the flight: lands on the same step, or crashes on the same step', () => {
    for (const [v, kind] of [[0.7, 'landed'], [3, 'crash']]) {
      const sys = moon(), p = probeAt(-9, v);
      const f = fly(sys, p, SL), pre = predict(sys, p, { steps: 2000, mission: SL });
      if (kind === 'landed') { expect(f.outcome.type).toBe('delivered'); expect(pre.delivered.i).toBe(f.i); expect(pre.delivered.how).toBe('landed'); expect(pre.crash).toBeNull(); }
      else { expect(f.outcome.type).toBe('crash'); expect(pre.crash.i).toBe(f.i); expect(pre.delivered).toBeNull(); }
    }
  });
  it('detectOutcome without landing context keeps the old behaviour', () => {
    const sys = moon();
    expect(detectOutcome({ x: 0.5, z: 0, vx: 0, vz: 0 }, 0, sys.bodies).type).toBe('crash');
    expect(detectOutcome({ x: 5, z: 0, vx: 0, vz: 0 }, 0, sys.bodies)).toBeNull();
    expect(detectOutcome({ x: 500, z: 0, vx: 0, vz: 0 }, 0, sys.bodies, 100).type).toBe('lost');
    expect(landingOf(RV)).toBeNull();
    expect(landingOf(SL)).toEqual({ target: 'moon', maxLandSpeed: 1 });
  });
  it('reports the approach: progress rises as altitude falls, and is capped when too fast', () => {
    const sys = moon();
    const at = (x, v) => createSoftLanding(SL).update({ x, z: 0, vx: v, vz: 0 }, 0, sys.byId);
    let prev = -1; for (const x of [-20, -9, -6, -4, -2, -1.2]) { const p = at(x, 0.5).progress; expect(p).toBeGreaterThanOrEqual(prev); prev = p; }
    expect(at(-2, 5).progress).toBeLessThan(at(-2, 0.5).progress);
    expect(at(-6, 0).altitude).toBeCloseTo(5, 9);
    expect(createSoftLanding(SL).state().progress).toBe(0);
    expect(createMission(SL).type).toBe('soft_landing');
  });
  it('has its own goal text and progress readout, and a schema rule', () => {
    expect(missionGoal(SL, () => 'Pip')).toBe('land on Pip slower than 1');
    expect(describeProgress(SL, { altitude: 3.456, speed: 1.23 })).toBe('altitude 3.5, speed 1.2 (max 1)');
    expect(describeProgress(SL, { altitude: Infinity, speed: Infinity })).toBe('-');
    const base = LEVELS[0];
    expect(validateLevel({ ...base, mission: { ...SL, target: 'kepi', maxLandSpeed: 0 } }).join('\n')).toMatch(/soft_landing needs maxLandSpeed/);
  });
});

// ---------- gate run ----------
import { segmentsIntersect, gateEnds } from '../src/sim/geometry.js';
import { createGateRun } from '../src/sim/missions.js';

const gate = (x, half = 1, angle = Math.PI / 2, z = 0) => ({ x, z, angle, half }); // a vertical wall at x
const GR = (xs) => ({ type: 'gate_run', target: 'stn', gates: xs.map((x) => gate(x)) });
const through = (m, pts) => { let st; for (const [x, z] of pts) st = m.update({ x, z, vx: 0, vz: 0 }); return st; };

describe('segment geometry', () => {
  const P = (x, z) => ({ x, z });
  it('detects crossings, misses, endpoint touches, and ignores parallel segments', () => {
    expect(segmentsIntersect(P(0, 0), P(2, 2), P(0, 2), P(2, 0))).toBe(true);
    expect(segmentsIntersect(P(0, 0), P(1, 0), P(2, -1), P(2, 1))).toBe(false);   // stops short
    expect(segmentsIntersect(P(0, 0), P(2, 0), P(2, -1), P(2, 1))).toBe(true);    // touches the wall exactly
    expect(segmentsIntersect(P(0, 0), P(4, 0), P(2, 0.5), P(2, 3))).toBe(false);  // passes below the wall
    expect(segmentsIntersect(P(0, 0), P(1, 0), P(0, 1), P(1, 1))).toBe(false);    // parallel
    expect(segmentsIntersect(P(0, 0), P(1, 1), P(0, 0), P(1, 1))).toBe(false);    // collinear
  });
  it('builds gate end points from centre, angle and half-length', () => {
    const [a, b] = gateEnds({ x: 5, z: 2, angle: 0, half: 3 });
    expect(a).toEqual({ x: 2, z: 2 }); expect(b).toEqual({ x: 8, z: 2 });
    const [c, d] = gateEnds({ x: 0, z: 0, angle: Math.PI / 2, half: 1 });
    expect(c.z).toBeCloseTo(-1, 12); expect(d.z).toBeCloseTo(1, 12); expect(Math.abs(c.x)).toBeLessThan(1e-12);
  });
});

describe('gate run', () => {
  it('passing every gate in order wins, in either direction of travel', () => {
    expect(through(createGateRun(GR([2, 5, 8])), [[0, 0], [3, 0], [6, 0], [9, 0]]).done).toBe(true);
    expect(through(createGateRun(GR([8, 5, 2])), [[10, 0], [7, 0], [4, 0], [1, 0]]).done).toBe(true);
  });
  it('counts progress gate by gate', () => {
    const m = createGateRun(GR([2, 5, 8]));
    expect(through(m, [[0, 0]]).passed).toBe(0);
    expect(through(m, [[3, 0]])).toMatchObject({ passed: 1, total: 3 });
    expect(m.state().progress).toBeCloseTo(1 / 3, 12);
    expect(through(m, [[6, 0]]).passed).toBe(2);
    expect(through(m, [[9, 0]])).toMatchObject({ passed: 3, done: true, progress: 1 });
  });
  it('a gate crossed out of order does not count, the attempt goes on, and later crossings in order still win', () => {
    const m = createGateRun(GR([2, 5, 8]));
    const st = through(m, [[3, 0], [6, 0]]);                 // starts after gate 1 and crosses gate 2 first
    expect(st.passed).toBe(0);
    expect(st.missed).toEqual([1]);
    expect(st.done).toBe(false);
    expect(through(m, [[1, 0]]).passed).toBe(1);             // back through gate 1 (and gate 2 on the way: out of order again)
    const again = through(m, [[4, 0], [6, 0]]);              // gate 2, now in order
    expect(again.passed).toBe(2);
    expect(again.missed).toEqual([]);
    expect(through(m, [[9, 0]]).done).toBe(true);
  });
  it('when one step crosses several gates they are taken in the order the path crosses them', () => {
    expect(through(createGateRun(GR([2, 5])), [[0, 0], [6, 0]])).toMatchObject({ passed: 2, done: true });   // 2 then 5: in order
    const rev = through(createGateRun(GR([2, 5])), [[6, 0], [0, 0]]);                                          // 5 then 2: out of order
    expect(rev.passed).toBe(1);
    expect(rev.missed).toEqual([1]);
    expect(rev.done).toBe(false);
  });
  it('a path that goes around the end of a gate does not count; one through the gap does', () => {
    const m = createGateRun(GR([5]));                                  // a wall at x = 5 spanning z from -1 to 1
    expect(through(m, [[0, 3], [10, 3]]).passed).toBe(0);              // flies above the wall
    expect(through(createGateRun(GR([5])), [[0, -3], [10, -3]]).passed).toBe(0);   // flies below it
    expect(through(createGateRun(GR([5])), [[0, 0.9], [10, 0.9]]).done).toBe(true); // crosses within its half-length
    expect(through(createGateRun(GR([5])), [[0, 1.1], [10, 1.1]]).done).toBe(false); // just outside it
  });
  it('a first sample sitting on the far side does not count as a crossing', () => {
    const m = createGateRun(GR([2]));
    expect(through(m, [[5, 0]]).passed).toBe(0);            // no previous point yet
    expect(through(m, [[6, 0]]).passed).toBe(0);            // still no crossing
  });
  it('stays done after the last gate', () => {
    const m = createGateRun(GR([2]));
    through(m, [[0, 0], [3, 0]]);
    expect(through(m, [[-5, 0], [10, 0]]).done).toBe(true);
  });
  it('flying through all gates wins in flight and the preview delivers on the same step; skipping one does not end the attempt', () => {
    const sys = station(), mission = { ...GR([-6, -2, 3]), target: 'stn' };
    const probe = { x: -10, z: 0, vx: 2, vz: 0 };
    const f = fly(sys, probe, mission);
    expect(f.outcome.type).toBe('delivered');
    const pre = predict(sys, probe, { steps: 4000, mission });
    expect(pre.delivered.i).toBe(f.i);
    // a probe that misses the middle gate by passing well above it never finishes, and keeps flying
    const high = { x: -10, z: 5, vx: 2, vz: 0 };
    const g = fly(sys, high, mission, 12);
    expect(g.done).toBe(false);
    expect(g.missionState.passed).toBe(0);
  });
  it('a mid-flight preview resumes the gates already passed, including the segment it is standing on', () => {
    const sys = station(), mission = GR([-6, -2, 3]), probe = { x: -10, z: 0, vx: 2, vz: 0 };
    const full = predict(sys, probe, { steps: 4000, mission });
    for (const stop of [1, 2.5, 4.9, 6.1]) {              // just before, on, and after each gate
      const f = new Flight(sys, probe, { t0: 0, mission });
      while (f.elapsed < stop) f.advance(1 / 120);
      const again = predict(sys, f.probe, { startIndex: f.i, steps: 4000, mission, missionResume: f.missionState });
      expect(again.delivered.i, `stopped at ${stop}`).toBe(full.delivered.i);
    }
  });
  it('is created by createMission and has goal text, progress text and a schema rule', () => {
    expect(createMission(GR([1, 2])).type).toBe('gate_run');
    expect(missionGoal(GR([1, 2, 3]))).toBe('fly through 3 gates in order');
    expect(missionGoal(GR([1]))).toBe('fly through 1 gate in order');
    expect(describeProgress(GR([1, 2, 3]), { passed: 1, total: 3, missed: [] })).toBe('gate 2 of 3');
    expect(describeProgress(GR([1, 2, 3]), { passed: 1, total: 3, missed: [2] })).toBe('gate 2 of 3, 1 missed');
    expect(describeProgress(GR([1]), { done: true, passed: 1, total: 1, missed: [] })).toBe('all 1');
    const base = LEVELS[0], tgt = 'kepi';
    expect(validateLevel({ ...base, mission: { type: 'gate_run', target: tgt, gates: [] } }).join('\n')).toMatch(/gate_run needs gates/);
    expect(validateLevel({ ...base, mission: { type: 'gate_run', target: tgt, gates: [gate(1)] } }).filter((e) => /gate_run|mission/.test(e))).toEqual([]);
  });
});
