import { DT } from './constants.js';
import { velAt } from './rails.js';

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

/**
 * Rendezvous: win when within `captureDist` of the (moving) target with a relative speed under `maxRelSpeed`.
 * A fast pass is not a capture: the probe keeps flying and may try again.
 * Progress rises as the gap closes, and once inside the capture distance it is capped by how slow you are.
 */
export const RENDEZVOUS_RANGE = 8; // gap at which progress starts to rise
export function createRendezvous(mission) {
  const { target, captureDist, maxRelSpeed } = mission;
  let done = false, dist = Infinity, relSpeed = Infinity;
  return {
    type: 'rendezvous',
    update(p, t, byId) {
      if (done) return this.state();
      const b = byId[target], [bx, bz] = b.pos(t), [vx, vz] = velAt(b, t, byId);
      dist = Math.hypot(p.x - bx, p.z - bz);
      relSpeed = Math.hypot(p.vx - vx, p.vz - vz);
      if (dist <= captureDist && relSpeed <= maxRelSpeed) done = true;
      return this.state();
    },
    state() {
      const near = Math.min(1, Math.max(0, (RENDEZVOUS_RANGE - dist) / (RENDEZVOUS_RANGE - captureDist)));
      const slow = dist <= captureDist ? Math.min(1, maxRelSpeed / Math.max(relSpeed, 1e-9)) : 1;
      return { done, dist, relSpeed, progress: done ? 1 : Math.min(0.99, near * slow) };
    },
  };
}

/**
 * Soft landing: touch the target's surface slower than `maxLandSpeed` (relative to the body). The touchdown itself is
 * decided by detectOutcome (a slow touch is a win, a fast one a crash); this tracker reports how the approach is going.
 */
export const LANDING_RANGE = 6; // altitude at which progress starts to rise
export const landingOf = (mission) => (mission?.type === 'soft_landing' ? { target: mission.target, maxLandSpeed: mission.maxLandSpeed } : null);
export function createSoftLanding(mission) {
  const { target, maxLandSpeed } = mission;
  let altitude = Infinity, speed = Infinity;
  return {
    type: 'soft_landing',
    update(p, t, byId) {
      const b = byId[target], [bx, bz] = b.pos(t), [vx, vz] = velAt(b, t, byId);
      altitude = Math.hypot(p.x - bx, p.z - bz) - b.radius;
      speed = Math.hypot(p.vx - vx, p.vz - vz);
      return this.state();
    },
    state() {
      const near = Math.min(1, Math.max(0, 1 - altitude / LANDING_RANGE)), soft = Math.min(1, maxLandSpeed / Math.max(speed, 1e-9));
      return { done: false, altitude, speed, progress: Number.isFinite(altitude) ? Math.min(0.99, near * soft) : 0 };
    },
  };
}

export function createMission(mission, held0 = 0) {
  if (mission.type === 'deliver_orbit') return createDeliverOrbit(mission, held0);
  if (mission.type === 'rendezvous') return createRendezvous(mission);
  if (mission.type === 'soft_landing') return createSoftLanding(mission);
  throw new Error(`mission type not implemented yet: ${mission.type}`);
}
