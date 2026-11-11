import { buildSystem } from '../sim/rails.js';
import { launchProbe } from '../sim/probe.js';
import { Flight } from './flight.js';

/** Fresh simulation system for a level (bodies are copied so levels stay plain data). */
export function buildLevelSystem(level) {
  const sys = buildSystem(level.system.bodies.map((b) => ({ ...b })));
  return Object.assign(sys, { hazards: [], bounds: level.bounds ?? 120 });
}

/** The probe state a launch produces on this level. */
export function levelLaunch(level, sys, launch) {
  return launchProbe(sys.byId[level.launch.padBody], sys.byId, launch);
}

/**
 * Headless replay of a launch plan: the same Flight the game uses, run to an outcome.
 * @returns {{outcome:string, t:number, fuelUsed:number, closest?:object}}
 */
export function replay(level, plan, { maxSeconds = level.timeLimit ?? 120 } = {}) {
  const sys = buildLevelSystem(level);
  const t0 = plan.launch.t0 ?? 0;
  const flight = new Flight(sys, levelLaunch(level, sys, { ...plan.launch, t0 }), { t0, mission: level.mission, nodes: plan.nodes ?? [] });
  while (!flight.done && flight.elapsed < maxSeconds) flight.advance(1);
  return { outcome: flight.outcome?.type ?? 'timeout', t: flight.elapsed, fuelUsed: flight.fuelUsed, bodyId: flight.outcome?.bodyId };
}
