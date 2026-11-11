/**
 * Where segment a-b crosses segment c-d, as the fraction t (0..1) along a-b, or null. Endpoints count; parallel
 * segments never cross. Used for gates, where the order of crossings within one step matters.
 */
export function segmentCrossing(a, b, c, d) {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z;
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-14) return null;
  const qx = c.x - a.x, qz = c.z - a.z;
  const t = (qx * sz - qz * sx) / denom, u = (qx * rz - qz * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
export const segmentsIntersect = (a, b, c, d) => segmentCrossing(a, b, c, d) !== null;

/** End points of a gate: a segment through (x, z) along `angle`, with half-length `half`. */
export function gateEnds(g) {
  const dx = Math.cos(g.angle) * g.half, dz = Math.sin(g.angle) * g.half;
  return [{ x: g.x - dx, z: g.z - dz }, { x: g.x + dx, z: g.z + dz }];
}
