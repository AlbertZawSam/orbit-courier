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

// One test-bench level per mission type and hazard: dist/index.html#gallery-rendezvous, -landing, -gate, -asteroids, -wind, -dark.
const variant = (id, name, over) => ({
  ...GALLERY, id, name, ...over,
  system: { bodies: over.bodies ?? GALLERY.system.bodies },
});
const homeAndMoons = GALLERY.system.bodies.filter((b) => ['sol', 'home', 'kepi'].includes(b.id));
export const GALLERIES = {
  gallery: GALLERY,
  'gallery-rendezvous': variant('G1', 'Rendezvous', {
    bodies: [...homeAndMoons, { id: 'vex', name: 'Vex', kind: 'station', mu: 0, radius: 0.12, orbit: { a: 6, e: 0, phase: 2.4, parent: 'home' } }],
    mission: { type: 'rendezvous', target: 'vex', captureDist: 0.9, maxRelSpeed: 1.2 },
  }),
  'gallery-landing': variant('G2', 'Soft landing', {
    bodies: homeAndMoons, mission: { type: 'soft_landing', target: 'kepi', maxLandSpeed: 1.2 },
  }),
  'gallery-gate': variant('G3', 'Gate run', {
    bodies: homeAndMoons,
    mission: { type: 'gate_run', target: 'kepi', gates: [
      { x: 19.5, z: 2.4, angle: 0.3, half: 1.2 }, { x: 21.5, z: 5, angle: 0.7, half: 1.2 }, { x: 22.4, z: 8.2, angle: 1.4, half: 1.2 }, { x: 20, z: 11, angle: 2.0, half: 1.2 },
    ] },
  }),
  'gallery-asteroids': variant('G4', 'Asteroid field', {
    bodies: homeAndMoons, hazards: [{ type: 'asteroids', parent: 'home', rIn: 7, rOut: 9.5, count: 90, seed: 5, minSize: 0.12, maxSize: 0.3 }],
  }),
  'gallery-wind': variant('G5', 'Solar wind', {
    bodies: homeAndMoons, hazards: [{ type: 'solar_wind', x: 21.5, z: 5.5, radius: 4.5, strength: 0.6, angle0: 0.6, rotation: 0.15 }],
  }),
  'gallery-dark': variant('G6', 'Dark mass', {
    bodies: homeAndMoons, hazards: [{ type: 'dark_mass', mu: 120, x: 21, z: 8 }],
  }),
};
