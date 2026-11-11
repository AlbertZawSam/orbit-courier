import { velAt } from './rails.js';

/**
 * Crash, landing or lost check shared by predict() and the live flight, so both end the same way.
 * Touching a body is a crash, except the landing target of a soft_landing mission when slower than its limit.
 * @param {{landing?: {target:string, maxLandSpeed:number}|null, byId?: object}} [opts]
 * @returns {{type:'crash', bodyId:string, x:number, z:number, speed?:number}|{type:'landed', bodyId:string, x:number, z:number, speed:number}|{type:'lost'}|null}
 */
export function detectOutcome(p, t, bodies, bounds = Infinity, { landing = null, byId = null } = {}) {
  for (const b of bodies) {
    if (!(b.radius > 0)) continue;
    const [bx, bz] = b.pos(t);
    if (Math.hypot(p.x - bx, p.z - bz) >= b.radius) continue;
    if (landing && byId && b.id === landing.target) {
      const [vx, vz] = velAt(b, t, byId), speed = Math.hypot(p.vx - vx, p.vz - vz);
      return { type: speed <= landing.maxLandSpeed ? 'landed' : 'crash', bodyId: b.id, x: p.x, z: p.z, speed };
    }
    return { type: 'crash', bodyId: b.id, x: p.x, z: p.z };
  }
  if (Math.hypot(p.x, p.z) > bounds) return { type: 'lost' };
  return null;
}
