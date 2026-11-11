import { DT, EPS2 } from './constants.js';

/** Acceleration on a point mass from every body (mu > 0) and hazard at time t. */
export function accel(x, z, t, bodies, hazards = []) {
  let ax = 0, az = 0;
  for (const b of bodies) {
    if (!(b.mu > 0)) continue;
    const [bx, bz] = b.pos(t);
    const dx = bx - x, dz = bz - z;
    const r2 = dx * dx + dz * dz + EPS2;
    const inv = b.mu / (r2 * Math.sqrt(r2));
    ax += dx * inv; az += dz * inv;
  }
  for (const h of hazards) { const [hx, hz] = h.accel(x, z, t); ax += hx; az += hz; }
  return [ax, az];
}

/** Time at integration step i. Computed, not accumulated, so preview and flight agree exactly. */
export const timeAt = (t0, i) => t0 + i * DT;

/** One kick-drift-kick leapfrog step from time t. Used by BOTH the preview and the live flight. */
export function step(p, t, bodies, hazards = []) {
  let [ax, az] = accel(p.x, p.z, t, bodies, hazards);
  const vx = p.vx + (ax * DT) / 2, vz = p.vz + (az * DT) / 2;
  const x = p.x + vx * DT, z = p.z + vz * DT;
  [ax, az] = accel(x, z, t + DT, bodies, hazards);
  return { ...p, x, z, vx: vx + (ax * DT) / 2, vz: vz + (az * DT) / 2 };
}
