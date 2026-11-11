import { velAt } from './rails.js';
import { closestOnSegment } from './geometry.js';

/**
 * Crash, landing or lost check shared by predict() and the live flight, so both end the same way.
 * Touching a body or a hazard (an asteroid) is a crash, except the landing target of a soft_landing mission when slower than its limit.
 * `prev` ({x, z, t}: the probe before this step) makes contact swept, so a fast probe cannot tunnel through a small body
 * between two steps. It is judged in each body's own frame (the probe's path relative to the body, which itself moves
 * during the step); without `prev` only the end point is tested.
 * @param {{landing?: {target:string, maxLandSpeed:number}|null, byId?: object, hazards?: object[], prev?: {x:number,z:number,t:number}|null}} [opts]
 * @returns {{type:'crash', bodyId:string, x:number, z:number, speed?:number}|{type:'landed', bodyId:string, x:number, z:number, speed:number}|{type:'lost'}|null}
 */
export function detectOutcome(p, t, bodies, bounds = Infinity, { landing = null, byId = null, hazards = [], prev = null } = {}) {
  for (const b of bodies) {
    if (!(b.radius > 0)) continue;
    const [bx, bz] = b.pos(t);
    let c;
    if (prev) {
      const [ox, oz] = b.pos(prev.t);
      const rel = closestOnSegment({ x: prev.x - ox, z: prev.z - oz }, { x: p.x - bx, z: p.z - bz }, { x: 0, z: 0 });
      c = { x: bx + rel.x, z: bz + rel.z, dist: rel.dist };
    } else c = { x: p.x, z: p.z, dist: Math.hypot(p.x - bx, p.z - bz) };
    if (c.dist >= b.radius) continue;
    if (landing && byId && b.id === landing.target) {
      const [vx, vz] = velAt(b, t, byId), speed = Math.hypot(p.vx - vx, p.vz - vz);
      return { type: speed <= landing.maxLandSpeed ? 'landed' : 'crash', bodyId: b.id, x: c.x, z: c.z, speed };
    }
    return { type: 'crash', bodyId: b.id, x: c.x, z: c.z };
  }
  for (const h of hazards) {
    const hit = h.collides?.(p.x, p.z, t);
    if (hit) return { type: 'crash', bodyId: hit.bodyId ?? h.type, x: p.x, z: p.z };
  }
  if (Math.hypot(p.x, p.z) > bounds) return { type: 'lost' };
  return null;
}
