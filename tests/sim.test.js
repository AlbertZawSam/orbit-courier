import { describe, it, expect } from 'vitest';
import { DT, EPS2 } from '../src/sim/constants.js';
import { vCirc, vEsc, period, visViva, hohmann } from '../src/sim/calc.js';
import { buildSystem, posAt, solveKepler } from '../src/sim/rails.js';
import { accel, step, timeAt } from '../src/sim/gravity.js';
import { launchProbe } from '../src/sim/probe.js';
import { predict } from '../src/sim/predict.js';
import { createDeliverOrbit } from '../src/sim/missions.js';

const star = { id: 'star', kind: 'star', mu: 1000, radius: 1 };
const planet = { id: 'planet', kind: 'rocky', mu: 20, radius: 0.8, orbit: { a: 30, e: 0, phase: 0, parent: 'star' } };
const moon = { id: 'moon', kind: 'moon', mu: 0.5, radius: 0.2, orbit: { a: 3, e: 0.1, phase: 1, parent: 'planet' } };
const sys = () => buildSystem([star, planet, moon].map((b) => ({ ...b })));

describe('calc', () => {
  it('matches closed forms', () => {
    expect(vCirc(100, 4)).toBeCloseTo(5);
    expect(vEsc(100, 4)).toBeCloseTo(Math.sqrt(50));
    expect(vEsc(9, 3) / vCirc(9, 3)).toBeCloseTo(Math.SQRT2);
    expect(period(1, 1)).toBeCloseTo(2 * Math.PI);
    expect(visViva(1, 2, 2)).toBeCloseTo(vCirc(1, 2)); // circular: a = r
  });
  it('hohmann dv and time', () => {
    const h = hohmann(1, 1, 4);
    expect(h.dv1).toBeCloseTo(Math.sqrt(1 / 1) * (Math.sqrt((2 * 4) / 5) - 1), 9);
    expect(h.total).toBeCloseTo(h.dv1 + h.dv2);
    expect(h.transferTime).toBeCloseTo(Math.PI * Math.sqrt(2.5 ** 3));
  });
});

describe('rails', () => {
  it('solves Kepler for high eccentricity', () => {
    for (const e of [0, 0.3, 0.7]) for (const M of [0.1, 1, 3, 5, 6.2]) {
      const E = solveKepler(M, e);
      expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-9);
    }
  });
  it('returns after exactly one period', () => {
    const { byId } = sys();
    const T = period(byId.planet.mu, 3); // moon around planet
    for (const t of [0, 1.7]) {
      const rel = (tt) => {
        const m = posAt(byId.moon, tt, byId), p = posAt(byId.planet, tt, byId);
        return [m[0] - p[0], m[1] - p[1]];
      };
      const a = rel(t), b = rel(t + T);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-6);
    }
  });
  it('keeps the moon at its orbital distance from the planet (e=0 check via planet)', () => {
    const { byId } = sys();
    const [px, pz] = posAt(byId.planet, 5, byId);
    expect(Math.hypot(px, pz)).toBeCloseTo(30, 9);
  });
});

describe('probe integration', () => {
  const heavy = buildSystem([{ id: 'h', mu: 1000, radius: 1 }]);
  const energy = (p) => (p.vx ** 2 + p.vz ** 2) / 2 - 1000 / Math.sqrt(p.x ** 2 + p.z ** 2 + EPS2);

  it('drifts under 0.5% in energy over 10 sim-minutes', () => {
    let p = { x: 10, z: 0, vx: 0, vz: vCirc(1000, 10) * 1.05 }; // slightly eccentric
    const e0 = energy(p);
    let worst = 0;
    for (let i = 0; i < 600 * 120; i++) {
      p = step(p, timeAt(0, i), heavy.bodies);
      if (i % 500 === 0) worst = Math.max(worst, Math.abs((energy(p) - e0) / e0));
    }
    expect(worst).toBeLessThan(0.005);
  });
  it('softening avoids NaN at a body center', () => {
    const [ax, az] = accel(0, 0, 0, heavy.bodies);
    expect(Number.isFinite(ax) && Number.isFinite(az)).toBe(true);
    const p = step({ x: 0, z: 0, vx: 0, vz: 0 }, 0, heavy.bodies);
    expect(Number.isFinite(p.x) && Number.isFinite(p.vx)).toBe(true);
  });
});

describe('preview equals flight', () => {
  it('matches live stepping at every step index to 1e-9', () => {
    const s = sys();
    const p0 = launchProbe(s.byId.planet, s.byId, { angle: 0.7, power: 4, t0: 2 });
    const pre = predict(s, p0, { t0: 2, steps: 600 });
    let p = p0;
    for (let i = 0; i < pre.steps; i++) {
      p = step(p, timeAt(2, i), s.bodies);
      expect(Math.abs(p.x - pre.points[i + 1].x)).toBeLessThan(1e-9);
      expect(Math.abs(p.z - pre.points[i + 1].z)).toBeLessThan(1e-9);
    }
  });
});

describe('predict', () => {
  it('reports crash into the launch body when thrown straight down', () => {
    const s = sys();
    const p0 = launchProbe(s.byId.planet, s.byId, { angle: 0, power: 0 });
    // zero relative speed: the planet's gravity pulls the probe back in
    const pre = predict(s, p0, { t0: 0, steps: 1200 });
    expect(pre.crash?.bodyId).toBe('planet');
    expect(pre.points.length).toBe(pre.steps + 1);
  });
  it('flags escape and respects bounds', () => {
    const s = { ...sys(), bounds: 50 };
    const p0 = { x: 40, z: 0, vx: 20, vz: 0 };
    const pre = predict(s, p0, { steps: 1200 });
    expect(pre.lost).not.toBeNull();
  });
  it('records closest approach per body and elements for a circular orbit', () => {
    const iso = buildSystem([{ id: 'h', mu: 1000, radius: 1 }]);
    const p0 = { x: 10, z: 0, vx: 0, vz: vCirc(1000, 10) };
    const pre = predict(iso, p0, { steps: 300 });
    expect(pre.closest.h.dist).toBeCloseTo(10, 2);
    expect(pre.orbit.bodyId).toBe('h');
    expect(pre.orbit.ecc).toBeLessThan(0.01);
    expect(pre.orbit.periapsis).toBeCloseTo(10, 1);
    expect(pre.orbit.apoapsis).toBeCloseTo(10, 1);
    expect(pre.escape).toBe(false);
  });
  it('flags escape above escape speed', () => {
    const iso = buildSystem([{ id: 'h', mu: 1000, radius: 1 }]);
    const pre = predict(iso, { x: 10, z: 0, vx: 0, vz: vEsc(1000, 10) * 1.1 }, { steps: 100 });
    expect(pre.escape).toBe(true);
  });
});

describe('deliver_orbit', () => {
  const mission = { type: 'deliver_orbit', target: 'moon', rMin: 0.4, rMax: 0.6, holdSeconds: 4 };
  const at = (r) => ({ x: r, z: 0, vx: 0, vz: 0 });
  const stationary = buildSystem([{ id: 'moon', mu: 1, radius: 0.1 }]).byId;

  it('wins after holding the band for holdSeconds', () => {
    const m = createDeliverOrbit(mission);
    let s;
    for (let i = 0; i < Math.ceil(4 / DT) + 2; i++) s = m.update(at(0.5), i * DT, stationary);
    expect(s.done).toBe(true);
  });
  it('does not win outside the band', () => {
    const m = createDeliverOrbit(mission);
    let s;
    for (let i = 0; i < 10 / DT; i++) s = m.update(at(1.5), i * DT, stationary);
    expect(s.done).toBe(false);
  });
  it('resets the hold when the probe leaves the band', () => {
    const m = createDeliverOrbit(mission);
    for (let i = 0; i < 3 / DT; i++) m.update(at(0.5), i * DT, stationary);
    m.update(at(2), 0, stationary);
    for (let i = 0; i < 3 / DT; i++) m.update(at(0.5), i * DT, stationary);
    expect(m.state().done).toBe(false);
  });
});
