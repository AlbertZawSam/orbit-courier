import { Vector3 } from 'three';
import { gateEnds } from '../sim/geometry.js';

/**
 * Keeps the previewed path on screen while planning: an exact fit on reset, afterwards the view only
 * zooms out when the path leaves it (so aiming never makes the picture jump).
 */
export function createFraming({ camera, cam, getState }) {
  const corner = new Vector3();
  function bounds() {
    const { pred, pad, sys, level, t0 } = getState();
    const [px, pz] = pad.pos(t0), [tx, tz] = sys.byId[level.mission.target].pos(t0);
    const b = { minX: Math.min(px, tx), maxX: Math.max(px, tx), minZ: Math.min(pz, tz), maxZ: Math.max(pz, tz) };
    let end = pred.delivered?.i ?? pred.crash?.i ?? pred.lost?.i ?? Infinity;
    for (const g of level.mission.gates ?? []) {           // a gate run must show every gate
      const [a, c] = gateEnds(g);
      for (const q of [a, c]) { b.minX = Math.min(b.minX, q.x); b.maxX = Math.max(b.maxX, q.x); b.minZ = Math.min(b.minZ, q.z); b.maxZ = Math.max(b.maxZ, q.z); }
    }
    const enc = pred.closest[level.mission.target];
    if (enc) end = Math.min(end, enc.i + 180); // frame the approach to the target, not a long loop after it
    for (const p of pred.points) {
      if (p.i > end) break;
      b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x); b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
    }
    return b;
  }
  const inView = (b) => [[b.minX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.minZ], [b.maxX, b.maxZ]].every(([x, z]) => {
    corner.set(x, 0, z).project(camera);
    return Math.abs(corner.x) <= 0.8 && corner.y <= 0.75 && corner.y >= -0.7;
  });
  return { fit(reset) { const b = bounds(); if (reset || !inView(b)) cam.frame(b, reset); } };
}
