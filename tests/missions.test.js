import { describe, it, expect } from 'vitest';
import { buildSystem, velAt } from '../src/sim/rails.js';
import { predict } from '../src/sim/predict.js';
import { createMission, createRendezvous } from '../src/sim/missions.js';
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
