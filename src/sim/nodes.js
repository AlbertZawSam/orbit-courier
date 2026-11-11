import { DT } from './constants.js';
import { dominantBody } from './probe.js';
import { velAt } from './rails.js';

/**
 * A burn node: `t` is seconds after launch, `dv` is [prograde, radial] in game units.
 * Prograde is along the probe's velocity relative to the dominant body; radial is
 * perpendicular to it, pointing away from that body. The two axes are orthonormal,
 * so a burn's fuel cost is exactly |dv|.
 */
export const burnCost = (dv) => Math.hypot(dv[0], dv[1]);
export const nodeIndex = (t) => Math.round(t / DT);

export function normalizeNodes(nodes) {
  return nodes.map((n) => ({ idx: nodeIndex(n.t), dv: n.dv })).sort((a, b) => a.idx - b.idx);
}
export function indexNodes(nodes) {
  const map = new Map();
  for (const n of normalizeNodes(nodes)) {
    if (!map.has(n.idx)) map.set(n.idx, []);
    map.get(n.idx).push(n.dv);
  }
  return map;
}

/** Prograde and radial unit vectors for a probe at time t. */
export function nodeBasis(p, t, sys) {
  const dom = dominantBody(p.x, p.z, t, sys.bodies);
  const [bx, bz] = dom.pos(t);
  const [bvx, bvz] = velAt(dom, t, sys.byId);
  const rvx = p.vx - bvx, rvz = p.vz - bvz, speed = Math.hypot(rvx, rvz);
  const pro = speed > 1e-12 ? [rvx / speed, rvz / speed] : [1, 0];
  let rad = [-pro[1], pro[0]];
  // Point the radial axis away from the body. When flying straight at or away from it the two are
  // nearly perpendicular and the sign would flip on noise, so keep the counter-clockwise axis then.
  const away = rad[0] * (p.x - bx) + rad[1] * (p.z - bz);
  if (away < -1e-6) rad = [-rad[0], -rad[1]];
  return { pro, rad, bodyId: dom.id };
}

/** Apply an instantaneous burn. Returns the new probe state and the basis used. */
export function applyBurn(p, t, dv, sys) {
  const basis = nodeBasis(p, t, sys);
  const vx = p.vx + basis.pro[0] * dv[0] + basis.rad[0] * dv[1];
  const vz = p.vz + basis.pro[1] * dv[0] + basis.rad[1] * dv[1];
  return { p: { ...p, vx, vz }, basis };
}
