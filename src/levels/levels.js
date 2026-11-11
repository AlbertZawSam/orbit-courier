// Level definitions (schema: AGENTS.md 8.1). Every level carries a stored `solution` that
// `npm run levels` replays headlessly; a failing solution means the level is broken.
const SOL = { id: 'sol', name: 'Sol', kind: 'star', mu: 1000, radius: 2 };
const home = { id: 'home', name: 'Home', kind: 'rocky', style: 'earthlike', mu: 20, radius: 0.8, orbit: { a: 30, e: 0, phase: 0, parent: 'sol' } };
const kepi = (phase, mu = 14) => ({ id: 'kepi', name: 'Kepi', kind: 'moon', mu, radius: 0.5, orbit: { a: 5, e: 0, phase, parent: 'home' } });

export const LEVELS = [
  {
    id: 'L1', name: 'First Light', tier: 'training',
    system: { bodies: [SOL, home, kepi(1.2)] }, hazards: [],
    bounds: 120,
    launch: { padBody: 'home', angleRange: [0, Math.PI * 2], maxSpeed: 7 },
    mission: { type: 'deliver_orbit', target: 'kepi', rMin: 0.8, rMax: 2.5, holdSeconds: 4 },
    fuel: 1, maxNodes: 1, slowMoSeconds: 4, tugCount: 0, tugMuMax: 0, timeLimit: null,
    par: { fuel: 0 },
    hints: [
      'Kepi is close. You only need to arrive slowly enough for its gravity to catch you.',
      'Aim a little ahead of Kepi, not straight at it, and use about 80% power.',
      'Try an angle near 82 degrees at power 5.5, then fine-tune with Shift and the arrow keys.',
    ],
    tags: ['launch', 'capture', 'preview'],
    solution: { launch: { angle: 1.431, power: 5.483, t0: 0 }, nodes: [] },
  },
  {
    id: 'L2', name: 'Falling Around', tier: 'training',
    system: { bodies: [SOL, home, kepi(4.4, 30)] }, hazards: [],
    bounds: 120,
    launch: { padBody: 'home', angleRange: [0, Math.PI * 2], maxSpeed: 7 },
    mission: { type: 'deliver_orbit', target: 'kepi', rMin: 0.8, rMax: 3.5, holdSeconds: 6 },
    fuel: 1, maxNodes: 1, slowMoSeconds: 4, tugCount: 0, tugMuMax: 0, timeLimit: null,
    par: { fuel: 0 },
    hints: [
      'Kepi is heavier here, so it holds on to you longer. The goal is to stay near it, not just pass it.',
      'Kepi starts on the far side of Home from where it was in the last level. Aim past it and let its pull bend your path.',
      'Try an angle near 246 degrees at power 5.4, then use the preview to adjust until the path loops around Kepi.',
    ],
    tags: ['launch', 'capture', 'orbit'],
    solution: { launch: { angle: 4.294, power: 5.417, t0: 0 }, nodes: [] },
  },
  {
    id: 'L3', name: 'Burn Nodes', tier: 'training',
    system: { bodies: [SOL, home, kepi(4.4, 30)] }, hazards: [],
    bounds: 120,
    launch: { padBody: 'home', angleRange: [0, Math.PI * 2], maxSpeed: 7 },
    mission: { type: 'deliver_orbit', target: 'kepi', rMin: 0.8, rMax: 3.5, holdSeconds: 12 },
    fuel: 1, maxNodes: 1, slowMoSeconds: 4, tugCount: 0, tugMuMax: 0, timeLimit: null,
    par: { fuel: 0.3 },
    hints: [
      'Holding the orbit for 12 seconds is long. A launch alone swings you past Kepi and out of range.',
      'Slow down near Kepi with a retrograde burn. Click the path close to where you pass it, then drag the brass handle backward.',
      'Launch near 156 degrees at power 6.25, then add a node about 5.6 s in with a small retrograde burn of 0.3.',
    ],
    tags: ['burn-node', 'retrograde', 'capture', 'fuel'],
    solution: { launch: { angle: 2.723, power: 6.252, t0: 0 }, nodes: [{ t: 5.6, dv: [-0.3, 0] }] },
  },
];
