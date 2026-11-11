/**
 * Crash or lost check shared by predict() and the live flight, so both end the same way.
 * @returns {{type:'crash', bodyId:string, x:number, z:number}|{type:'lost'}|null}
 */
export function detectOutcome(p, t, bodies, bounds = Infinity) {
  for (const b of bodies) {
    if (!(b.radius > 0)) continue;
    const [bx, bz] = b.pos(t);
    if (Math.hypot(p.x - bx, p.z - bz) < b.radius) return { type: 'crash', bodyId: b.id, x: p.x, z: p.z };
  }
  if (Math.hypot(p.x, p.z) > bounds) return { type: 'lost' };
  return null;
}
