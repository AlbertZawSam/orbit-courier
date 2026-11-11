import { step, timeAt } from './gravity.js';
import { applyBurn, burnCost } from './nodes.js';

/**
 * One integration step at index i, applying any burn nodes scheduled for that index first.
 * Both predict() and the live Flight call this, which is what keeps preview equal to flight.
 * @returns {{p: object, burns: {dv:number[], cost:number, x:number, z:number, pro:number[], rad:number[]}[]}}
 */
export function advanceProbe(p, i, t0, sys, nodeMap) {
  const t = timeAt(t0, i);
  const burns = [];
  const scheduled = nodeMap?.get(i);
  if (scheduled) {
    for (const dv of scheduled) {
      const r = applyBurn(p, t, dv, sys);
      burns.push({ dv, cost: burnCost(dv), x: p.x, z: p.z, ...r.basis });
      p = r.p;
    }
  }
  return { p: step(p, t, sys.bodies, sys.hazards ?? []), burns };
}
