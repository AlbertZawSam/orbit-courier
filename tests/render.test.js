import { describe, it, expect } from 'vitest';
import { buildSystem } from '../src/sim/rails.js';
import { launchProbe } from '../src/sim/probe.js';
import { predict } from '../src/sim/predict.js';
import { vCirc } from '../src/sim/calc.js';
import { Flight } from '../src/game/flight.js';
import { Plan, hitTest } from '../src/game/plan.js';
import { createBus } from '../src/state/events.js';
import { fillRibbon, ribbonIndex, timeTicks, pickPins, findExtrema, speedColor, STEPS_PER_SECOND } from '../src/render/ribbon.js';
import { ParticlePool, fade, thrustParticles, burstParticles, MIN_LIFE } from '../src/render/particles.js';
import { LEVELS } from '../src/levels/levels.js';
import { buildLevelSystem, levelLaunch } from '../src/game/replay.js';
import { sandbox } from './fixtures/sandbox.js';

const make = () => Object.assign(buildSystem(sandbox.bodies.map((b) => ({ ...b }))), { bounds: sandbox.bounds });
const seeded = (s = 1) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const buffers = (n) => ({ pos: new Float32Array(n * 6), normal: new Float32Array(n * 4), side: new Float32Array(n * 2), dist: new Float32Array(n * 2), danger: new Float32Array(n * 2) });

describe('ghost and mission-aware previews', () => {
  const sys = make();
  const crashing = launchProbe(sys.byId.home, sys.byId, { angle: 0, power: 0, t0: 0 });
  it('ghost mode keeps drawing past a crash but reports the same first crash', () => {
    const plain = predict(sys, crashing, { steps: 600 }), ghost = predict(sys, crashing, { steps: 600, ghost: true });
    expect(plain.points.length).toBe(plain.crash.i + 1);
    expect(ghost.points.length).toBe(601);
    expect(ghost.crash).toEqual(plain.crash);
    for (let k = 0; k <= plain.crash.i; k++) expect(ghost.points[k]).toEqual(plain.points[k]);
  });
  for (const level of LEVELS) {
    it(`${level.id}: the preview delivers on exactly the step the flight does, burns included`, () => {
      const lsys = buildLevelSystem(level), sol = level.solution;
      const p0 = levelLaunch(level, lsys, sol.launch);
      const pre = predict(lsys, p0, { t0: 0, steps: 4000, nodes: sol.nodes, mission: level.mission, ghost: true });
      const f = new Flight(lsys, p0, { t0: 0, mission: level.mission, nodes: sol.nodes });
      while (!f.done && f.elapsed < 60) f.advance(1);
      expect(f.outcome.type).toBe('delivered');
      expect(pre.delivered).not.toBeNull();
      expect(pre.delivered.i).toBe(f.i);
      expect(pre.delivered.t).toBeCloseTo(f.t, 12);
      expect(pre.points.length).toBe(pre.delivered.i + 1); // the path stops at delivery
      expect(pre.crash).toBeNull();
    });
  }
  it('a preview restarted mid-flight keeps the mission hold already earned', () => {
    const level = LEVELS[0], lsys = buildLevelSystem(level);
    const p0 = levelLaunch(level, lsys, level.solution.launch);
    const f = new Flight(lsys, p0, { t0: 0, mission: level.mission });
    while (f.missionState.held < 1 && !f.done) f.advance(0.05);
    const full = predict(lsys, p0, { steps: 4000, mission: level.mission });
    const again = predict(lsys, f.probe, { startIndex: f.i, steps: 4000, mission: level.mission, missionResume: f.missionState });
    expect(again.delivered.i).toBe(full.delivered.i);
  });
  it('no mission means no delivery', () => {
    expect(predict(sys, crashing, { steps: 50 }).delivered).toBeNull();
  });
});

describe('ribbon geometry', () => {
  const sys = make();
  const pred = predict(sys, launchProbe(sys.byId.home, sys.byId, { angle: 0.6, power: 6.3, t0: 0 }), { steps: 600, ghost: true });
  it('has two vertices per point, unit normals perpendicular to the path, and growing arc length', () => {
    const out = buffers(pred.points.length), v = fillRibbon(pred.points, null, out);
    expect(v).toBe(pred.points.length * 2);
    for (let k = 1; k < pred.points.length - 1; k += 37) {
      const nx = out.normal[k * 4], nz = out.normal[k * 4 + 1];
      expect(Math.hypot(nx, nz)).toBeCloseTo(1, 5);
      const dx = pred.points[k + 1].x - pred.points[k - 1].x, dz = pred.points[k + 1].z - pred.points[k - 1].z;
      expect(Math.abs(nx * dx + nz * dz) / Math.hypot(dx, dz)).toBeLessThan(1e-5);
      expect(out.side[k * 2]).toBe(-1); expect(out.side[k * 2 + 1]).toBe(1);
      expect(out.dist[k * 2]).toBeGreaterThan(out.dist[(k - 1) * 2]);
    }
    expect(out.dist[2 * (pred.points.length - 1)]).toBeGreaterThan(5);
  });
  it('marks only points after the crash as danger', () => {
    const crashing = predict(sys, launchProbe(sys.byId.home, sys.byId, { angle: 0, power: 0, t0: 0 }), { steps: 400, ghost: true });
    const out = buffers(crashing.points.length);
    fillRibbon(crashing.points, crashing.crash.i, out);
    for (let k = 0; k < crashing.points.length; k++) expect(out.danger[k * 2]).toBe(k > crashing.crash.i ? 1 : 0);
  });
  it('builds a valid triangle index', () => {
    const idx = ribbonIndex(5);
    expect(idx.length).toBe(24);
    expect(Math.max(...idx)).toBe(9);
    expect(ribbonIndex(1).length).toBe(0);
  });
  it('puts one tick per sim-second at absolute step multiples, including mid-flight previews', () => {
    expect(timeTicks(pred.points).map((t) => t.second)).toEqual([1, 2, 3, 4, 5]);
    const mid = predict(sys, launchProbe(sys.byId.home, sys.byId, { angle: 0.6, power: 6.3, t0: 0 }), { startIndex: 60, steps: 300 });
    expect(timeTicks(mid.points).map((t) => t.second)).toEqual([1, 2, 3]);
    expect(STEPS_PER_SECOND).toBe(120);
  });
});

describe('pins and extrema', () => {
  it('pins bodies the path passes near, skipping the start and far bodies', () => {
    const level = LEVELS[0], lsys = buildLevelSystem(level);
    const pred = predict(lsys, levelLaunch(level, lsys, level.solution.launch), { steps: 900, mission: level.mission, ghost: true });
    const pins = pickPins(pred, lsys);
    expect(pins.map((p) => p.bodyId)).toContain('kepi');
    expect(pins.map((p) => p.bodyId)).not.toContain('sol');
    const kepi = pins.find((p) => p.bodyId === 'kepi');
    expect(kepi.dist).toBeCloseTo(pred.closest.kepi.dist, 12);
    expect(kepi.name).toBe('Kepi');
    expect(pickPins(pred, lsys, { maxDist: 0.01 })).toEqual([]);
  });
  it('finds periapsis and apoapsis of an ellipse within a few percent of the orbit elements', () => {
    const iso = buildSystem([{ id: 'h', mu: 1000, radius: 1 }]);
    const p0 = { x: 10, z: 0, vx: 0, vz: vCirc(1000, 10) * 1.2 };
    const pre = predict(iso, p0, { steps: 2200 }); // the orbit starts at periapsis and takes ~15 s (1800 steps) per lap
    const e = findExtrema(pre.points, iso.byId.h);
    const el = pre.orbit;
    expect(e.peri.d).toBeCloseTo(10, 0);
    expect(e.apo.d / el.apoapsis).toBeGreaterThan(0.97);
    expect(e.apo.d / el.apoapsis).toBeLessThan(1.03);
  });
  it('finds no extrema on a path that only falls or only climbs', () => {
    const iso = buildSystem([{ id: 'h', mu: 1000, radius: 1 }]);
    const climb = predict(iso, { x: 5, z: 0, vx: 40, vz: 0 }, { steps: 100 });
    expect(findExtrema(climb.points, iso.byId.h).peri).toBeNull();
  });
});

describe('trail colour', () => {
  it('runs teal to ivory to gold and clamps', () => {
    const [r0, g0, b0] = speedColor(0), mid = speedColor(0.5), [r1, g1, b1] = speedColor(1);
    expect(b0).toBeGreaterThan(r0);                       // teal: more blue than red
    expect(mid.every((c) => c > 0.8)).toBe(true);          // ivory
    expect(r1).toBeGreaterThan(b1);                        // gold: more red than blue
    expect(speedColor(-5)).toEqual(speedColor(0));
    expect(speedColor(9)).toEqual(speedColor(1));
    void g0; void g1;
  });
});

describe('particles', () => {
  it('spawns, moves, ages out, and reuses slots', () => {
    const pool = new ParticlePool(4);
    for (let i = 0; i < 4; i++) expect(pool.spawn({ x: 0, z: 0, vx: 1, vz: 0, life: 1, size: 0.1, color: [1, 1, 1], drag: 0 })).toBe(true);
    expect(pool.spawn({ x: 0, z: 0, vx: 0, vz: 0, life: 1, size: 0.1, color: [1, 1, 1] })).toBe(false); // full: dropped, never overwritten
    pool.update(0.5);
    expect(pool.x[0]).toBeCloseTo(0.5, 6);
    expect(pool.count).toBe(4);
    pool.update(0.6);
    expect(pool.count).toBe(0);
    expect(pool.spawn({ x: 1, z: 1, vx: 0, vz: 0, life: 1, size: 0.1, color: [1, 0, 0] })).toBe(true);
    expect(pool.count).toBe(1);
  });
  it('drag slows particles and setMax keeps live ones within the new cap', () => {
    const pool = new ParticlePool(8);
    for (let i = 0; i < 6; i++) pool.spawn({ x: 0, z: 0, vx: 4, vz: 0, life: 2, size: 0.1, color: [1, 1, 1], drag: 2 });
    pool.update(1);
    expect(pool.vx[0]).toBeLessThan(1);
    const smaller = pool.setMax(3);
    expect(smaller.max).toBe(3);
    expect(smaller.count).toBe(3);
  });
  it('fades monotonically from 1 to 0 so nothing can flash', () => {
    let prev = Infinity;
    for (let u = 0; u <= 1.0001; u += 0.01) { const a = fade(u); expect(a).toBeLessThanOrEqual(prev + 1e-12); expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThanOrEqual(1); prev = a; }
    expect(fade(0)).toBeCloseTo(1, 12);
    expect(fade(1)).toBe(0);
    expect(fade(-1)).toBeCloseTo(1, 12);
  });
  it('thrust goes opposite the burn direction in a narrow cone', () => {
    const ps = thrustParticles({ x: 3, z: 4, dir: [1, 0] }, 200, seeded(7));
    expect(ps).toHaveLength(200);
    for (const p of ps) {
      expect(p.x).toBe(3); expect(p.z).toBe(4);
      expect(p.vx).toBeLessThan(0);
      expect(Math.abs(Math.atan2(p.vz, -p.vx))).toBeLessThan(0.36);
    }
  });
  it('bursts are soft and slow: bounded speeds, long lives, never under the minimum life', () => {
    for (const kind of ['crash', 'delivery']) {
      const ps = burstParticles(kind, { x: 0, z: 0 }, 300, seeded(11));
      expect(ps).toHaveLength(300);
      for (const p of ps) {
        expect(Math.hypot(p.vx, p.vz)).toBeLessThan(5);
        expect(p.life).toBeGreaterThanOrEqual(MIN_LIFE);
        expect(Math.max(...p.color)).toBeLessThanOrEqual(1);
      }
    }
  });
  it('the pool never lets a particle live shorter than the photosensitivity minimum', () => {
    const pool = new ParticlePool(1);
    pool.spawn({ x: 0, z: 0, vx: 0, vz: 0, life: 0.01, size: 0.1, color: [1, 1, 1] });
    expect(pool.life[0]).toBe(MIN_LIFE);
  });
});

describe('burn events and node placement', () => {
  it('node_burn carries the burn position and a unit direction', () => {
    const sys = make(), bus = createBus(), seen = [];
    bus.on('node_burn', (e) => seen.push(e));
    const p0 = launchProbe(sys.byId.home, sys.byId, { angle: 0.6, power: 6.3, t0: 0 });
    const f = new Flight(sys, p0, { t0: 0, bus, nodes: [{ t: 1, dv: [0.3, 0.4] }] });
    while (f.elapsed < 1.5) f.advance(0.05);
    expect(seen).toHaveLength(1);
    expect(Math.hypot(...seen[0].dir)).toBeCloseTo(1, 12);
    expect(Number.isFinite(seen[0].x) && Number.isFinite(seen[0].z)).toBe(true);
    expect(seen[0].cost).toBeCloseTo(0.5, 12);
  });
  it('a node cannot be picked on the ghost part of a path past the crash', () => {
    const sys = make(), plan = new Plan({ fuel: 5, maxNodes: 3 });
    const pred = predict(sys, launchProbe(sys.byId.home, sys.byId, { angle: 0, power: 0, t0: 0 }), { steps: 600, ghost: true });
    const late = pred.points[Math.min(pred.points.length - 1, pred.crash.i + 100)];
    expect(hitTest(plan, pred, [late.x, late.z], 0.2)).toBeNull();
    const early = pred.points[Math.max(1, pred.crash.i - 20)];
    expect(hitTest(plan, pred, [early.x, early.z], 1)?.kind).toBe('path');
  });
});
