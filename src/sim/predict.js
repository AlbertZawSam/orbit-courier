import { DEFAULT_PREVIEW_STEPS, DT } from './constants.js';
import { step, timeAt } from './gravity.js';
import { dominantBody } from './probe.js';
import { velAt } from './rails.js';
import { detectOutcome } from './outcome.js';

/** Two-body orbital elements of the probe relative to `body` at time t. */
export function elementsAbout(p, body, t, byId) {
  const [bx, bz] = body.pos(t);
  const [bvx, bvz] = velAt(body, t, byId);
  const rx = p.x - bx, rz = p.z - bz, vx = p.vx - bvx, vz = p.vz - bvz;
  const r = Math.hypot(rx, rz), v2 = vx * vx + vz * vz;
  const energy = v2 / 2 - body.mu / r;
  const h = rx * vz - rz * vx;
  const ecc = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (body.mu * body.mu)));
  if (energy >= 0) return { bodyId: body.id, r, ecc, a: Infinity, periapsis: (h * h) / (body.mu * (1 + ecc)), apoapsis: Infinity, escape: true };
  const a = -body.mu / (2 * energy);
  return { bodyId: body.id, r, ecc, a, periapsis: a * (1 - ecc), apoapsis: a * (1 + ecc), escape: false };
}

/**
 * Integrate the probe forward with the exact same `step` the live flight uses.
 * @param {{bodies:object[], byId:object, hazards?:object[], bounds?:number}} sys
 * @param {{x:number,z:number,vx:number,vz:number}} probe0
 * @param {{t0?:number, steps?:number}} opts
 */
export function predict(sys, probe0, { t0 = 0, steps = DEFAULT_PREVIEW_STEPS } = {}) {
  const { bodies, byId, hazards = [], bounds = Infinity } = sys;
  const points = [{ i: 0, t: t0, x: probe0.x, z: probe0.z }];
  const closest = {};
  const note = (p, t, i) => {
    for (const b of bodies) {
      const [bx, bz] = b.pos(t);
      const d = Math.hypot(p.x - bx, p.z - bz);
      if (!closest[b.id] || d < closest[b.id].dist) closest[b.id] = { dist: d, t, i };
    }
  };
  let p = probe0, crash = null, lost = null;
  note(p, t0, 0);
  for (let i = 0; i < steps; i++) {
    p = step(p, timeAt(t0, i), bodies, hazards);
    const t = timeAt(t0, i + 1);
    points.push({ i: i + 1, t, x: p.x, z: p.z });
    note(p, t, i + 1);
    const out = detectOutcome(p, t, bodies, bounds);
    if (out?.type === 'crash') { crash = { bodyId: out.bodyId, t, i: i + 1, x: out.x, z: out.z }; break; }
    if (out?.type === 'lost') { lost = { t, i: i + 1 }; break; }
  }
  const tEnd = points[points.length - 1].t;
  const dom = dominantBody(p.x, p.z, tEnd, bodies);
  const orbit = dom ? elementsAbout(p, dom, tEnd, byId) : null;
  return { points, closest, crash, lost, escape: orbit ? orbit.escape : false, orbit, final: p, steps: points.length - 1, dt: DT };
}
