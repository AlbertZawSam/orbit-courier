import { describe, it, expect } from 'vitest';
import { buildSystem } from '../src/sim/rails.js';
import { launchProbe } from '../src/sim/probe.js';
import { predict } from '../src/sim/predict.js';
import { applyBurn, burnCost, nodeBasis } from '../src/sim/nodes.js';
import { Flight } from '../src/game/flight.js';
import { SlowMo, SLOW_SCALE } from '../src/game/slowmo.js';
import { Plan, hitTest, handlePos, dvFromPointer } from '../src/game/plan.js';
import { sandbox } from '../src/levels/sandbox.js';

const make = () => Object.assign(buildSystem(sandbox.bodies.map((b) => ({ ...b }))), { bounds: sandbox.bounds });
const start = (sys) => launchProbe(sys.byId.home, sys.byId, { angle: 0.6, power: 6.3, t0: 0 });

describe('burn nodes', () => {
  it('basis is orthonormal and burn changes speed by exactly |dv|', () => {
    const sys = make(), p = start(sys);
    const { pro, rad } = nodeBasis(p, 0, sys);
    expect(Math.hypot(...pro)).toBeCloseTo(1, 12);
    expect(Math.hypot(...rad)).toBeCloseTo(1, 12);
    expect(pro[0] * rad[0] + pro[1] * rad[1]).toBeCloseTo(0, 12);
    for (const dv of [[0.3, 0], [0, 0.4], [-0.2, 0.15]]) {
      const q = applyBurn(p, 0, dv, sys).p;
      expect(Math.hypot(q.vx - p.vx, q.vz - p.vz)).toBeCloseTo(burnCost(dv), 12);
    }
  });
  it('a prograde burn raises relative speed; a retrograde burn lowers it', () => {
    const sys = make(), p = start(sys);
    const before = nodeBasis(p, 0, sys);
    const fwd = applyBurn(p, 0, [0.5, 0], sys).p, back = applyBurn(p, 0, [-0.5, 0], sys).p;
    const along = (q) => (q.vx - p.vx) * before.pro[0] + (q.vz - p.vz) * before.pro[1];
    expect(along(fwd)).toBeCloseTo(0.5, 12);
    expect(along(back)).toBeCloseTo(-0.5, 12);
  });
  it('nodes change the predicted path', () => {
    const sys = make(), p = start(sys);
    const plain = predict(sys, p, { steps: 600 });
    const burned = predict(sys, p, { steps: 600, nodes: [{ t: 1, dv: [0.6, 0] }] });
    expect(burned.nodeInfo.length).toBe(1);
    const a = plain.points[600], b = burned.points[600];
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.05);
    expect(burned.fuelUsed).toBeCloseTo(0.6, 12);
  });
  it('fuel used by the flight is exactly the sum of |dv|', () => {
    const sys = make(), p = start(sys);
    const nodes = [{ t: 1, dv: [0.3, 0.1] }, { t: 2.5, dv: [-0.2, 0] }];
    const f = new Flight(sys, p, { t0: 0, nodes });
    while (f.elapsed < 4 && !f.done) f.advance(0.05);
    expect(f.fuelUsed).toBeCloseTo(Math.hypot(0.3, 0.1) + 0.2, 12);
  });
  it('flight with nodes equals the preview with the same nodes', () => {
    const sys = make(), p = start(sys);
    const nodes = [{ t: 1, dv: [0.4, 0.2] }];
    const f = new Flight(sys, p, { t0: 0, nodes });
    while (f.i < 480 && !f.done) f.advance(1 / 30);
    const ref = predict(sys, p, { steps: f.i, nodes });
    const last = ref.points[ref.points.length - 1];
    expect(Math.abs(f.probe.x - last.x)).toBeLessThan(1e-9);
    expect(Math.abs(f.probe.z - last.z)).toBeLessThan(1e-9);
  });
  it('a preview restarted mid-flight matches the original preview', () => {
    const sys = make(), p = start(sys);
    const nodes = [{ t: 3, dv: [0.5, 0] }];
    const full = predict(sys, p, { steps: 600, nodes });
    const f = new Flight(sys, p, { t0: 0, nodes });
    while (f.i < 120) f.advance(1 / 60);
    const again = predict(sys, f.probe, { startIndex: f.i, steps: 480, nodes });
    const a = full.points[600], b = again.points[again.points.length - 1];
    expect(b.i).toBe(600);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1e-9);
    expect(Math.abs(a.z - b.z)).toBeLessThan(1e-9);
  });
});

describe('plan', () => {
  it('caps total fuel and scales a request down', () => {
    const plan = new Plan({ fuel: 1, maxNodes: 3 });
    plan.addNode(1); plan.addNode(2);
    plan.setDv(0, [0.8, 0]);
    plan.setDv(1, [0.8, 0]);
    expect(plan.fuelUsed()).toBeCloseTo(1, 12);
    expect(plan.nodes[1].dv[0]).toBeCloseTo(0.2, 12);
  });
  it('limits node count, keeps nodes sorted, and locks past nodes', () => {
    const plan = new Plan({ fuel: 5, maxNodes: 2 });
    expect(plan.addNode(5)).toBe(0);
    expect(plan.addNode(2)).toBe(0);
    expect(plan.nodes.map((n) => n.t)).toEqual([2, 5]);
    expect(plan.addNode(3)).toBe(-1);
    plan.elapsed = 2.5;
    expect(plan.setDv(0, [1, 0])).toBe(false);
    expect(plan.removeNode(0)).toBe(false);
    expect(plan.addNode(2.4)).toBe(-1);
  });
  it('handle drag round-trips through dvFromPointer', () => {
    const info = { x: 3, z: 4, pro: [1, 0], rad: [0, 1] };
    for (const comp of [-0.5, 0, 0.7]) {
      const [hx, hz] = handlePos(info, 0, comp, 1.3);
      expect(dvFromPointer(info, 0, [hx, hz], 1.3)).toBeCloseTo(comp, 12);
    }
  });
  it('hitTest prefers handles, then markers, then the path', () => {
    const sys = make(), p = start(sys), plan = new Plan({ fuel: 5, maxNodes: 3 });
    plan.addNode(1);
    const pred = predict(sys, p, { steps: 600, nodes: plan.nodes });
    const info = pred.nodeInfo[0];
    expect(hitTest(plan, pred, [info.x, info.z], 1)).toEqual({ kind: 'node', node: 0 });
    const [hx, hz] = handlePos(info, 0, 0, 1);
    expect(hitTest(plan, pred, [hx, hz], 1)).toEqual({ kind: 'handle', node: 0, axis: 0 });
    const q = pred.points[300];
    expect(hitTest(plan, pred, [q.x, q.z], 1).kind).toBe('path');
    expect(hitTest(plan, pred, [1e4, 1e4], 1)).toBeNull();
  });
});

describe('slow motion', () => {
  it('runs at 0.1x, spends budget, and stops when empty', () => {
    const s = new SlowMo(1);
    expect(s.tick(0.5)).toBe(1);
    s.toggle();
    expect(s.tick(0.4)).toBe(SLOW_SCALE);
    expect(s.left).toBeCloseTo(0.6, 12);
    s.tick(1);
    expect(s.active).toBe(false);
    expect(s.left).toBe(0);
    expect(s.toggle()).toBe(false);
    s.reset();
    expect(s.left).toBe(1);
  });
  it('does not change the number of sim steps per unit of scaled time', () => {
    const sys = make(), p = start(sys);
    const a = new Flight(sys, p), b = new Flight(sys, p);
    a.advance(1, 0.1); b.advance(0.1, 1);
    expect(a.i).toBe(b.i);
    expect(a.probe.x).toBe(b.probe.x);
  });
});
