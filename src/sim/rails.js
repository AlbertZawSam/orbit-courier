import { TAU } from './constants.js';

/** Solve Kepler's equation M = E - e sin E with Newton's method. */
export function solveKepler(M, e) {
  M = ((M % TAU) + TAU) % TAU;
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/** Position of a body on rails at time t. `byId` maps ids to body specs (needs `mu` and `orbit`). */
export function posAt(body, t, byId) {
  if (!body.orbit) return body.at ?? [0, 0]; // a fixed body sits at `at` (the origin by default)
  const { a, e = 0, phase = 0, parent, dir = 1 } = body.orbit;
  const n = Math.sqrt(byId[parent].mu / a ** 3);
  const E = solveKepler(phase + dir * n * t, e);
  const x = a * (Math.cos(E) - e);
  const z = dir * a * Math.sqrt(1 - e * e) * Math.sin(E);
  const [px, pz] = posAt(byId[parent], t, byId);
  return [px + x, pz + z];
}

/** Body velocity by central difference (rails are analytic, so this is smooth and deterministic). */
export function velAt(body, t, byId, h = 1e-4) {
  const [x0, z0] = posAt(body, t - h, byId);
  const [x1, z1] = posAt(body, t + h, byId);
  return [(x1 - x0) / (2 * h), (z1 - z0) / (2 * h)];
}

/**
 * Turn plain body specs into simulation bodies with a `pos(t)` function.
 * @returns {{bodies: object[], byId: Record<string, object>}}
 */
export function buildSystem(specs) {
  const byId = {};
  for (const s of specs) byId[s.id] = s;
  const bodies = specs.map((s) => Object.assign(s, { pos: (t) => posAt(s, t, byId) }));
  return { bodies, byId };
}
