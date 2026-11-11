// Visual test bench for the renderer (open dist/index.html#gallery). Not a level: no solution, never in LEVELS.
export const GALLERY = {
  id: 'G0', name: 'Gallery', tier: 'training',
  system: { bodies: [
    { id: 'sol', name: 'Sol', kind: 'star', mu: 1000, radius: 2 },
    { id: 'home', name: 'Home', kind: 'rocky', style: 'earthlike', mu: 20, radius: 0.8, orbit: { a: 17, e: 0, phase: 0, parent: 'sol' } },
    { id: 'kepi', name: 'Kepi', kind: 'moon', mu: 14, radius: 0.5, orbit: { a: 5, e: 0, phase: 1.2, parent: 'home' } },
    { id: 'jove', name: 'Jove', kind: 'gas', mu: 6, radius: 2.0, rings: { inner: 1.45, outer: 2.4, tilt: 0.35 }, orbit: { a: 11, e: 0, phase: 4.0, parent: 'home' } },
    { id: 'rime', name: 'Rime', kind: 'ice', mu: 4, radius: 1.0, orbit: { a: 7.5, e: 0, phase: 2.6, parent: 'home' } },
  ] },
  hazards: [], bounds: 120,
  launch: { padBody: 'home', angleRange: [0, Math.PI * 2], maxSpeed: 7 },
  mission: { type: 'deliver_orbit', target: 'kepi', rMin: 0.8, rMax: 2.5, holdSeconds: 4 },
  fuel: 1, maxNodes: 1, slowMoSeconds: 4, tugCount: 0, tugMuMax: 0, timeLimit: null,
  par: { fuel: 0 }, hints: ['Look around.', 'Zoom with the wheel.', 'This is the renderer test bench.'], tags: ['launch'],
  solution: { launch: { angle: 0, power: 0, t0: 0 }, nodes: [] },
};
