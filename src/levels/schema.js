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
  for (const h of l.hazards ?? []) {
    if (h.type === 'asteroids') need(ids.has(h.parent) && h.rIn > 0 && h.rOut > h.rIn && h.count > 0, 'asteroids need a parent body, rIn < rOut and a count');
    else if (h.type === 'dark_mass') need(h.mu > 0 && !ids.has(h.id ?? 'dark') && (h.radius ?? 0.12) > 0, 'dark_mass needs a positive mu and an id not used by a body');
    else if (h.type === 'solar_wind') need(h.radius > 0 && Number.isFinite(h.strength), 'solar_wind needs radius and strength');
    else need(false, `unknown hazard type "${h.type}"`);
  }
  need(ids.has(l.launch?.padBody), 'launch.padBody must be a body');
  need(l.launch?.maxSpeed > 0, 'launch.maxSpeed must be positive');
  need(l.mission && ids.has(l.mission.target), 'mission.target must be a body');
  const m = l.mission ?? {};
  if (m.type === 'deliver_orbit') need(m.rMin > 0 && m.rMax > m.rMin && m.holdSeconds > 0, 'deliver_orbit needs rMin < rMax and holdSeconds');
  else if (m.type === 'rendezvous') need(m.captureDist > 0 && m.maxRelSpeed > 0, 'rendezvous needs captureDist and maxRelSpeed');
  else if (m.type === 'gate_run') need(Array.isArray(m.gates) && m.gates.length > 0 && m.gates.every((g) => Number.isFinite(g.x) && Number.isFinite(g.z) && Number.isFinite(g.angle) && g.half > 0), 'gate_run needs gates with x, z, angle and half');
  else if (m.type === 'soft_landing') need(m.maxLandSpeed > 0, 'soft_landing needs maxLandSpeed');
  else need(false, `unknown mission type "${m.type}"`);
  need(l.fuel >= 0 && Number.isInteger(l.maxNodes) && l.maxNodes >= 0, 'fuel and maxNodes required');
  need(l.slowMoSeconds >= 0, 'slowMoSeconds required');
  need(l.launchWindow === undefined || (l.launchWindow >= 0 && Number.isFinite(l.launchWindow)), 'launchWindow must be a number of seconds');
  need(l.timeLimit === null || l.timeLimit > 0, 'timeLimit must be null or positive');
  need(l.par && l.par.fuel >= 0, 'par.fuel required');
  need(Array.isArray(l.hints) && l.hints.length === 3 && l.hints.every((h) => h.length > 0), 'exactly 3 non-empty hints');
  need(Array.isArray(l.tags) && l.tags.length > 0, 'tags required');
  need(l.solution?.launch && Number.isFinite(l.solution.launch.angle) && Number.isFinite(l.solution.launch.power), 'solution.launch required');
  need(Array.isArray(l.solution?.nodes), 'solution.nodes must be an array');
  if (l.solution) {
    need(l.solution.nodes.length <= l.maxNodes, 'solution uses more nodes than maxNodes');
    need(l.solution.launch.power <= l.launch.maxSpeed, 'solution power exceeds launch.maxSpeed');
    need((l.solution.launch.t0 ?? 0) >= 0 && (l.solution.launch.t0 ?? 0) <= (l.launchWindow ?? 0) + 1e-9, 'solution launch time is outside launchWindow');
    const r = l.launch.angleRange;
    if (r) need(l.solution.launch.angle >= r[0] - 1e-9 && l.solution.launch.angle <= r[1] + 1e-9, 'solution angle is outside launch.angleRange');
  }
  return e;
}
