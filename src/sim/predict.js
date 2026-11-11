import { DEFAULT_PREVIEW_STEPS, DT } from './constants.js';
import { timeAt } from './gravity.js';
import { dominantBody } from './probe.js';
import { velAt } from './rails.js';
import { detectOutcome } from './outcome.js';
import { advanceProbe } from './advance.js';
import { indexNodes } from './nodes.js';
import { createMission, landingOf } from './missions.js';

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
 * Integrate the probe forward with the exact same step (and burns) the live flight uses.
 * `startIndex` lets a preview begin mid-flight: step indices stay absolute from launch.
 * @param {{bodies:object[], byId:object, hazards?:object[], bounds?:number}} sys
 * @param {{x:number,z:number,vx:number,vz:number}} probe0
  * `mission` makes the preview run the same mission tracker as the flight (restored from `missionResume`, normally the
 * flight's `missionState`, when previewing mid-flight),
 * so it can report `delivered` and stop there, exactly when the flight would.
 * `ghost` keeps integrating after a crash or leaving the map (display only: the first crash and loss are still reported).
 * @param {{t0?:number, steps?:number, nodes?:{t:number,dv:number[]}[], startIndex?:number, ghost?:boolean, mission?:object, missionResume?:object}} opts
 */
export function predict(sys, probe0, { t0 = 0, steps = DEFAULT_PREVIEW_STEPS, nodes = [], startIndex = 0, ghost = false, mission = null, missionResume = {} } = {}) {
  const { bodies, byId, bounds = Infinity } = sys;
  const nodeMap = indexNodes(nodes);
  const points = [{ i: startIndex, t: timeAt(t0, startIndex), x: probe0.x, z: probe0.z }];
  const closest = {};
  const nodeInfo = [];
  let fuelUsed = 0;
  const note = (p, t, i) => {
    for (const b of bodies) {
      const [bx, bz] = b.pos(t);
      const d = Math.hypot(p.x - bx, p.z - bz);
      if (!closest[b.id] || d < closest[b.id].dist) closest[b.id] = { dist: d, t, i };
    }
  };
  let p = probe0, crash = null, lost = null, delivered = null;
  const tracker = mission ? createMission(mission, missionResume) : null;
  const landing = landingOf(mission);
  note(p, points[0].t, startIndex);
  for (let k = 0; k < steps; k++) {
    const i = startIndex + k;
    const r = advanceProbe(p, i, t0, sys, nodeMap);
    p = r.p;
    for (const b of r.burns) { nodeInfo.push({ idx: i, t: timeAt(t0, i), ...b }); fuelUsed += b.cost; }
    const t = timeAt(t0, i + 1);
    points.push({ i: i + 1, t, x: p.x, z: p.z });
    note(p, t, i + 1);
    if (crash || lost) continue; // ghost mode: already ended, keep drawing
    const out = detectOutcome(p, t, bodies, bounds, { landing, byId });
    if (out?.type === 'landed') { delivered = { t, i: i + 1, x: p.x, z: p.z, how: 'landed' }; break; }
    if (out?.type === 'crash') { crash = { bodyId: out.bodyId, t, i: i + 1, x: out.x, z: out.z }; if (!ghost) break; }
    else if (out?.type === 'lost') { lost = { t, i: i + 1 }; if (!ghost) break; }
    if (!out && tracker && tracker.update(p, t, byId).done) { delivered = { t, i: i + 1, x: p.x, z: p.z }; break; }
  }
  const last = points[points.length - 1];
  const dom = dominantBody(p.x, p.z, last.t, bodies);
  const orbit = dom ? elementsAbout(p, dom, last.t, byId) : null;
  return { points, closest, crash, lost, delivered, escape: orbit ? orbit.escape : false, orbit, final: p, steps: points.length - 1, dt: DT, nodeInfo, fuelUsed };
}
