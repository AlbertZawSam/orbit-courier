import { PAD_CLEARANCE } from './constants.js';
import { posAt, velAt } from './rails.js';

/**
 * Probe state at launch: starts just above the pad body's surface with the body's velocity
 * plus the launch vector. `angle` is in radians, `power` is speed relative to the body.
 */
export function launchProbe(padBody, byId, { angle, power, t0 = 0 }) {
  const [bx, bz] = posAt(padBody, t0, byId);
  const [bvx, bvz] = velAt(padBody, t0, byId);
  const c = Math.cos(angle), s = Math.sin(angle);
  const r = padBody.radius * PAD_CLEARANCE;
  return { x: bx + c * r, z: bz + s * r, vx: bvx + c * power, vz: bvz + s * power };
}

/** The body pulling hardest on (x, z) at time t. */
export function dominantBody(x, z, t, bodies) {
  let best = null, bestA = -1;
  for (const b of bodies) {
    if (!(b.mu > 0)) continue;
    const [bx, bz] = b.pos(t);
    const a = b.mu / ((bx - x) ** 2 + (bz - z) ** 2 + 1e-12);
    if (a > bestA) { bestA = a; best = b; }
  }
  return best;
}
