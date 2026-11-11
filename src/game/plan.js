import { DT } from '../sim/constants.js';
import { burnCost, nodeIndex } from '../sim/nodes.js';

export const HANDLE_BASE = 1.5; // handle distance from its node, in screen-scaled units u
export const DV_SCALE = 2;      // u of handle travel per 1.0 of delta-v

const TAU = Math.PI * 2;
/** Clamp an angle into [lo, hi] (radians); a full circle, or no range, leaves it unchanged. */
export function clampAngle(angle, range) {
  if (!range || range[1] - range[0] >= TAU - 1e-9) return angle;
  const [lo, hi] = range, mid = (lo + hi) / 2;
  const a = angle - TAU * Math.round((angle - mid) / TAU); // nearest representative to the arc's middle
  return Math.min(hi, Math.max(lo, a));
}

const quantize = (t) => nodeIndex(t) * DT;

/** Launch aim, burn nodes, selection, and the fuel budget. Pure: no three.js, no DOM. */
export class Plan {
  constructor({ fuel, maxNodes, angleRange = null }) {
    this.fuel = fuel; this.maxNodes = maxNodes; this.angleRange = angleRange;
    this.aim = { angle: angleRange ? (angleRange[0] + angleRange[1]) / 2 : 0.6, power: 0.7 };
    this.nodes = [];      // { t: seconds after launch, dv: [prograde, radial] }, sorted by t
    this.selected = -1;
    this.elapsed = 0;     // seconds since launch; nodes at or before this are locked
  }
  /** Set the launch aim; the angle is clamped to the level's allowed launch arc (radians). */
  setAim({ angle, power }) {
    this.aim = { angle: clampAngle(angle, this.angleRange), power: Math.min(1, Math.max(0, power)) };
  }
  fuelUsed() { return this.nodes.reduce((s, n) => s + burnCost(n.dv), 0); }
  fuelLeft() { return this.fuel - this.fuelUsed(); }
  locked(i) { return this.nodes[i].t <= this.elapsed + 1e-9; }

  /** Add a zero-dv node at time t (seconds after launch). Returns its index, or -1 if refused. */
  addNode(t) {
    t = quantize(t);
    if (this.nodes.length >= this.maxNodes || t <= this.elapsed + 0.05) return -1;
    this.nodes.push({ t, dv: [0, 0] });
    this.nodes.sort((a, b) => a.t - b.t);
    this.selected = this.nodes.findIndex((n) => n.t === t);
    return this.selected;
  }
  removeNode(i) {
    if (i < 0 || i >= this.nodes.length || this.locked(i)) return false;
    this.nodes.splice(i, 1);
    this.selected = Math.min(this.selected, this.nodes.length - 1);
    return true;
  }
  /** Set a node's [prograde, radial] delta-v, scaled down so the total never exceeds the fuel. */
  setDv(i, dv) {
    if (i < 0 || i >= this.nodes.length || this.locked(i)) return false;
    const others = this.fuelUsed() - burnCost(this.nodes[i].dv);
    const allowed = Math.max(0, this.fuel - others), cost = burnCost(dv);
    const k = cost > allowed && cost > 0 ? allowed / cost : 1;
    this.nodes[i].dv = [dv[0] * k, dv[1] * k];
    return true;
  }
  nudge(i, axis, amount) {
    if (i < 0 || i >= this.nodes.length) return false;
    const dv = [...this.nodes[i].dv]; dv[axis] += amount;
    return this.setDv(i, dv);
  }
  select(i) { this.selected = i >= 0 && i < this.nodes.length ? i : -1; }
  selectStep(d) { if (this.nodes.length) this.selected = (this.selected + d + this.nodes.length) % this.nodes.length; }
}

/** World position of a node's handle. `info` is a predict() nodeInfo entry; axis 0 prograde, 1 radial. */
export function handlePos(info, axis, comp, u) {
  const dir = axis === 0 ? info.pro : info.rad, d = u * (HANDLE_BASE + comp * DV_SCALE);
  return [info.x + dir[0] * d, info.z + dir[1] * d];
}
/** Delta-v component implied by a pointer at world point `pt` dragging `info`'s axis handle. */
export function dvFromPointer(info, axis, pt, u) {
  const dir = axis === 0 ? info.pro : info.rad;
  const along = (pt[0] - info.x) * dir[0] + (pt[1] - info.z) * dir[1];
  return (along / u - HANDLE_BASE) / DV_SCALE;
}

/**
 * What is under the pointer? Priority: selected node's handles, node markers, then the path.
 * @returns {{kind:'handle',node:number,axis:number}|{kind:'node',node:number}|{kind:'path',t:number}|null}
 */
export function hitTest(plan, pred, pt, u, t0 = 0) {
  const infoFor = (i) => pred.nodeInfo.find((n) => n.idx === nodeIndex(plan.nodes[i].t));
  const near = (x, z, r) => Math.hypot(pt[0] - x, pt[1] - z) < r;
  const sel = plan.selected;
  if (sel >= 0 && infoFor(sel) && !plan.locked(sel)) {
    const info = infoFor(sel);
    for (const axis of [0, 1]) {
      const [hx, hz] = handlePos(info, axis, plan.nodes[sel].dv[axis], u);
      if (near(hx, hz, 0.7 * u)) return { kind: 'handle', node: sel, axis };
    }
  }
  for (let i = 0; i < plan.nodes.length; i++) {
    const info = infoFor(i);
    if (info && near(info.x, info.z, 0.8 * u)) return { kind: 'node', node: i };
  }
  let best = null, bestD = 0.6 * u;
  for (const p of pred.points) {
    if (p.t - t0 <= plan.elapsed + 0.05) continue;
    const d = Math.hypot(pt[0] - p.x, pt[1] - p.z);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best ? { kind: 'path', t: best.t - t0 } : null;
}
