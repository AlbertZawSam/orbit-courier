// Stage 2 sandbox system (real levels arrive in stage 4). Not a level: no stored solution.
export const sandbox = {
  name: 'Sandbox',
  bodies: [
    { id: 'sol', name: 'Sol', kind: 'star', mu: 1000, radius: 2 },
    { id: 'home', name: 'Home', kind: 'rocky', mu: 20, radius: 0.8, orbit: { a: 30, e: 0, phase: 0, parent: 'sol' } },
    { id: 'kepi', name: 'Kepi', kind: 'moon', mu: 2, radius: 0.4, orbit: { a: 5, e: 0, phase: 1.2, parent: 'home' } },
  ],
  bounds: 120,
  launch: { padBody: 'home', maxSpeed: 7 },
  mission: { type: 'deliver_orbit', target: 'kepi', rMin: 0.8, rMax: 2.0, holdSeconds: 4 },
  fuel: 10,
};
