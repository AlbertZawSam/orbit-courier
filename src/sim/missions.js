import { DT } from './constants.js';

/**
 * Tracks a deliver_orbit mission: win when the probe stays inside the radius band around the
 * target for `holdSeconds` (default 4) of continuous sim time. Leaving the band resets the hold.
 */
export function createDeliverOrbit(mission, held0 = 0) {
  const { target, rMin, rMax, holdSeconds = 4 } = mission;
  let held = held0, done = false;
  return {
    type: 'deliver_orbit',
    update(p, t, byId) {
      if (done) return this.state();
      const [bx, bz] = byId[target].pos(t);
      const r = Math.hypot(p.x - bx, p.z - bz);
      held = r >= rMin && r <= rMax ? held + DT : 0;
      if (held >= holdSeconds) done = true;
      return this.state();
    },
    state: () => ({ done, held, progress: Math.min(1, held / holdSeconds) }),
  };
}

export function createMission(mission, held0 = 0) {
  if (mission.type === 'deliver_orbit') return createDeliverOrbit(mission, held0);
  throw new Error(`mission type not implemented yet: ${mission.type}`);
}
