const TIERS = ['tutorial', 'training', 'inner', 'outer', 'deep', 'lab'];

/** Returns a list of problems with a level definition (empty when valid). */
export function validateLevel(l) {
  const e = [];
  const need = (cond, msg) => { if (!cond) e.push(`${l?.id ?? '?'}: ${msg}`); };
  need(/^(L|T)\d+$/.test(l.id ?? ''), 'id must look like L1 or T1');
  need(typeof l.name === 'string' && l.name.length > 0, 'name required');
  need(TIERS.includes(l.tier), 'unknown tier');
  const bodies = l.system?.bodies ?? [];
  need(bodies.length > 0, 'system.bodies required');
  const ids = new Set(bodies.map((b) => b.id));
  need(ids.size === bodies.length, 'duplicate body ids');
  for (const b of bodies) {
    need(b.mu >= 0 && b.radius >= 0, `body ${b.id} needs mu and radius`);
    if (b.orbit) need(ids.has(b.orbit.parent), `body ${b.id} has unknown parent ${b.orbit.parent}`);
  }
  need(Array.isArray(l.hazards), 'hazards must be an array');
  need(ids.has(l.launch?.padBody), 'launch.padBody must be a body');
  need(l.launch?.maxSpeed > 0, 'launch.maxSpeed must be positive');
  need(l.mission && ids.has(l.mission.target), 'mission.target must be a body');
  need(l.fuel >= 0 && Number.isInteger(l.maxNodes) && l.maxNodes >= 0, 'fuel and maxNodes required');
  need(l.slowMoSeconds >= 0, 'slowMoSeconds required');
  need(l.timeLimit === null || l.timeLimit > 0, 'timeLimit must be null or positive');
  need(l.par && l.par.fuel >= 0, 'par.fuel required');
  need(Array.isArray(l.hints) && l.hints.length === 3 && l.hints.every((h) => h.length > 0), 'exactly 3 non-empty hints');
  need(Array.isArray(l.tags) && l.tags.length > 0, 'tags required');
  need(l.solution?.launch && Number.isFinite(l.solution.launch.angle) && Number.isFinite(l.solution.launch.power), 'solution.launch required');
  need(Array.isArray(l.solution?.nodes), 'solution.nodes must be an array');
  if (l.solution) {
    need(l.solution.nodes.length <= l.maxNodes, 'solution uses more nodes than maxNodes');
    need(l.solution.launch.power <= l.launch.maxSpeed, 'solution power exceeds launch.maxSpeed');
  }
  return e;
}
