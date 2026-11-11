import { EPS2 } from '../sim/constants.js';
import { velAt } from '../sim/rails.js';

/**
 * What the sound layers need to know about the probe at time t: every body's pull, distance and closing speed,
 * the two strongest pulls (gravity hum), the strongest (Doppler), and the mission target (ping).
 * Pure, so it can be tested without audio.
 */
export function audioFrame(sys, probe, t, targetId) {
  const list = [];
  for (const b of sys.bodies) {
    if (!(b.mu > 0)) continue;
    const [bx, bz] = b.pos(t), [bvx, bvz] = velAt(b, t, sys.byId);
    const dx = probe.x - bx, dz = probe.z - bz, r = Math.hypot(dx, dz);
    const rvx = probe.vx - bvx, rvz = probe.vz - bvz;
    const away = r > 1e-9 ? (dx * rvx + dz * rvz) / r : 0;
    list.push({ id: b.id, kind: b.kind, radius: b.radius, r, accel: b.mu / (r * r + EPS2), closing: -away, speed: Math.hypot(rvx, rvz) });
  }
  list.sort((a, b) => b.accel - a.accel);
  return { hum: list.slice(0, 2), doppler: list[0] ?? null, target: list.find((x) => x.id === targetId) ?? null, all: list };
}
