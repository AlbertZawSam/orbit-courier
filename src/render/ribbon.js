// Pure geometry helpers for the trajectory ribbon (no three.js): testable without a GPU.
import { DT } from '../sim/constants.js';

export const STEPS_PER_SECOND = Math.round(1 / DT);

/**
 * Fill ribbon vertex data: two vertices per path point (side -1 and +1) with the path's
 * perpendicular, arc length, and a danger flag for points after the crash. Writes into the
 * preallocated arrays in `out` and returns the vertex count.
 */
export function fillRibbon(points, crashI, out) {
  let dist = 0, nx = 0, nz = 1, v = 0;
  for (let k = 0; k < points.length; k++) {
    const a = points[Math.max(0, k - 1)], b = points[Math.min(points.length - 1, k + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len > 1e-12) { nx = -dz / len; nz = dx / len; }
    if (k > 0) dist += Math.hypot(points[k].x - points[k - 1].x, points[k].z - points[k - 1].z);
    const danger = crashI !== null && points[k].i > crashI ? 1 : 0;
    for (const side of [-1, 1]) {
      out.pos.set([points[k].x, 0, points[k].z], v * 3);
      out.normal.set([nx, nz], v * 2);
      out.side[v] = side; out.dist[v] = dist; out.danger[v] = danger;
      v++;
    }
  }
  return v;
}

/** Index buffer for a strip of `n` path points (two triangles per segment). */
export function ribbonIndex(n) {
  const idx = new Uint32Array(Math.max(0, n - 1) * 6);
  for (let k = 0; k < n - 1; k++) idx.set([2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2], k * 6);
  return idx;
}

/** One tick per sim-second of flight time (absolute step index a multiple of STEPS_PER_SECOND). */
export function timeTicks(points) {
  const ticks = [];
  for (let k = 0; k < points.length; k++) {
    const p = points[k];
    if (p.i > 0 && p.i % STEPS_PER_SECOND === 0) {
      const a = points[Math.max(0, k - 1)], b = points[Math.min(points.length - 1, k + 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      ticks.push({ x: p.x, z: p.z, nx: -(b.z - a.z) / len, nz: (b.x - a.x) / len, second: p.i / STEPS_PER_SECOND });
    }
  }
  return ticks;
}

/** Closest-approach pins worth drawing: bodies the path comes near after the start, with their distance. */
export function pickPins(pred, sys, { maxDist = 10, minSteps = 30 } = {}) {
  const pins = [];
  const start = pred.points[0].i;
  for (const [id, c] of Object.entries(pred.closest)) {
    const k = c.i - start;
    if (k < minSteps || k >= pred.points.length || c.dist > maxDist) continue;
    if (pred.crash && c.i > pred.crash.i) continue;
    const body = sys.byId[id];
    if (body.kind === 'star' && c.dist > body.radius * 4) continue;
    const [bx, bz] = body.pos(c.t);
    pins.push({ bodyId: id, name: body.name ?? id, dist: c.dist, x: pred.points[k].x, z: pred.points[k].z, bx, bz, t: c.t });
  }
  return pins.sort((a, b) => a.t - b.t);
}

/** Periapsis and apoapsis along the preview relative to `body`: interior local extrema only. */
export function findExtrema(points, body) {
  const d = points.map((p) => Math.hypot(p.x - body.pos(p.t)[0], p.z - body.pos(p.t)[1]));
  let peri = null, apo = null;
  for (let k = 1; k < d.length - 1; k++) {
    if (d[k] < d[k - 1] && d[k] <= d[k + 1] && (!peri || d[k] < peri.d)) peri = { k, d: d[k] };
    if (d[k] > d[k - 1] && d[k] >= d[k + 1] && (!apo || d[k] > apo.d)) apo = { k, d: d[k] };
  }
  const at = (e) => e && { x: points[e.k].x, z: points[e.k].z, d: e.d, t: points[e.k].t };
  return { peri: at(peri), apo: at(apo) };
}

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((c) => c / 255);
const SLOW = hex(0x4fd1c5), MID = hex(0xefe8d8), FAST = hex(0xf2c14e);
/** Trail colour by speed (0..1): teal when slow, ivory in the middle, gold when fast. Returns sRGB components. */
export function speedColor(norm) {
  const t = Math.min(1, Math.max(0, norm));
  const [a, b, u] = t < 0.5 ? [SLOW, MID, t * 2] : [MID, FAST, (t - 0.5) * 2];
  return a.map((c, i) => c + (b[i] - c) * u);
}
