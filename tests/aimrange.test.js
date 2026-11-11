import { describe, it, expect } from 'vitest';
import { Plan, clampAngle } from '../src/game/plan.js';

describe('launch arc', () => {
  const arc = [4.75, 5.45];
  it('leaves angles inside the arc alone and clamps outside ones to the nearer edge', () => {
    expect(clampAngle(5.0, arc)).toBe(5.0);
    expect(clampAngle(3.0, arc)).toBe(4.75);
    expect(clampAngle(0.0, arc)).toBeCloseTo(5.45, 12); // 0 is the same direction as 2*pi, which is nearer the high edge
    expect(clampAngle(5.0 + 2 * Math.PI, arc)).toBeCloseTo(5.0, 12);
  });
  it('handles arcs that straddle zero and full circles', () => {
    expect(clampAngle(2 * Math.PI - 0.1, [-0.5, 0.5])).toBeCloseTo(-0.1, 12);
    expect(clampAngle(1.0, [-0.5, 0.5])).toBe(0.5);
    expect(clampAngle(7, [0, 2 * Math.PI])).toBe(7);
    expect(clampAngle(7, null)).toBe(7);
  });
  it('a plan keeps its aim inside the arc and clamps power to 0..1', () => {
    const plan = new Plan({ fuel: 1, maxNodes: 1, angleRange: arc });
    expect(plan.aim.angle).toBeCloseTo(5.1, 12);
    plan.setAim({ angle: 1.0, power: 3 });
    expect(plan.aim.angle).toBeGreaterThanOrEqual(arc[0]);
    expect(plan.aim.angle).toBeLessThanOrEqual(arc[1]);
    expect(plan.aim.power).toBe(1);
    plan.setAim({ angle: 5, power: -1 });
    expect(plan.aim.power).toBe(0);
  });
});

describe('default aim', () => {
  it('starts from the supplied aim, clamped to the launch arc', () => {
    const p = new Plan({ fuel: 1, maxNodes: 1, defaultAim: { angle: 1.2, power: 0.8 } });
    expect(p.aim).toEqual({ angle: 1.2, power: 0.8 });
    const arc = new Plan({ fuel: 1, maxNodes: 1, angleRange: [4.75, 5.45], defaultAim: { angle: 1.0, power: 0.8 } });
    expect(arc.aim.angle).toBeGreaterThanOrEqual(4.75);
    expect(arc.aim.angle).toBeLessThanOrEqual(5.45);
  });
  it('a full-circle level no longer defaults to pointing at an arbitrary angle', () => {
    const p = new Plan({ fuel: 1, maxNodes: 1, angleRange: [0, 2 * Math.PI] });
    expect(p.aim.angle).toBeCloseTo(0.6, 12);
    expect(p.aim.power).toBe(0.8);
  });
});
