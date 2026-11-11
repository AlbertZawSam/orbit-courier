import { describe, it, expect } from 'vitest';
import { buildSystem } from '../src/sim/rails.js';
import { launchProbe } from '../src/sim/probe.js';
import { predict } from '../src/sim/predict.js';
import { Plan, handlePos } from '../src/game/plan.js';
import { createControls } from '../src/input/controls.js';
import { sandbox } from './fixtures/sandbox.js';

function rig(phase = 'planning') {
  const sys = Object.assign(buildSystem(sandbox.bodies.map((b) => ({ ...b }))), { bounds: sandbox.bounds });
  const plan = new Plan({ fuel: 2, maxNodes: 3 });
  const calls = { changed: 0, launch: 0, reset: 0, slow: 0 };
  let pred;
  const redo = () => { pred = predict(sys, launchProbe(sys.byId.home, sys.byId, { angle: plan.aim.angle, power: plan.aim.power * 7, t0: 0 }), { nodes: plan.nodes }); };
  redo();
  const controls = createControls({
    plan, phase: () => phase, pred: () => pred, u: () => 1, t0: () => 0,
    changed: () => { calls.changed++; redo(); }, launch: () => calls.launch++, reset: () => calls.reset++, toggleSlow: () => calls.slow++,
    pad: () => ({ x: 30, z: 0 }), nodeTimeDefault: () => 2,
  });
  return { plan, controls, calls, get pred() { return pred; } };
}
const key = (k, extra = {}) => ({ key: k, shiftKey: false, ...extra });

describe('controls', () => {
  it('keyboard adds, adjusts, and removes a node', () => {
    const { plan, controls } = rig();
    expect(controls.onKey(key('n'))).toBe(true);
    expect(plan.nodes.length).toBe(1);
    controls.onKey(key('+')); controls.onKey(key('+'));
    expect(plan.nodes[0].dv[0]).toBeCloseTo(0.1, 12);
    controls.onKey(key('.', { shiftKey: true }));
    expect(plan.nodes[0].dv[1]).toBeCloseTo(0.01, 12);
    controls.onKey(key('Delete'));
    expect(plan.nodes.length).toBe(0);
  });
  it('arrows aim only while planning; Enter launches; S and R delegate', () => {
    const planning = rig('planning'), flying = rig('flying');
    const a0 = planning.plan.aim.angle;
    planning.controls.onKey(key('ArrowRight'));
    expect(planning.plan.aim.angle).toBeCloseTo(a0 + 0.05, 12);
    expect(flying.controls.onKey(key('ArrowRight'))).toBe(false);
    planning.controls.onKey(key('Enter')); planning.controls.onKey(key('s')); planning.controls.onKey(key('r'));
    expect(planning.calls).toMatchObject({ launch: 1, slow: 1, reset: 1 });
  });
  it('dragging empty space aims; clicking the path adds a node; dragging a handle sets dv', () => {
    const r = rig();
    const drag = r.controls.onDown([30, 5]);
    expect(typeof drag).toBe('function');
    expect(r.plan.aim.angle).toBeCloseTo(Math.PI / 2, 9);
    const q = r.pred.points[200];
    expect(r.controls.onDown([q.x, q.z])).not.toBeNull();
    expect(r.plan.nodes.length).toBe(1);
    const info = r.pred.nodeInfo[0];
    const [hx, hz] = handlePos(info, 0, 0, 1);
    const dragHandle = r.controls.onDown([hx, hz]);
    const [tx, tz] = handlePos(info, 0, 0.4, 1);
    dragHandle([tx, tz]);
    expect(r.plan.nodes[0].dv[0]).toBeCloseTo(0.4, 9);
  });
  it('does not aim or edit nodes after the flight ends', () => {
    const r = rig('ended');
    expect(r.controls.onDown([30, 5])).toBeNull();
    expect(r.controls.onKey(key('ArrowLeft'))).toBe(false);
  });
});
