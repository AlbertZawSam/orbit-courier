import './styles.css';
import { createStage, createCamera } from './render/scene.js';
import { createBodies } from './render/bodies.js';
import { createTrajectory } from './render/trajectory.js';
import { createProbeView } from './render/probe.js';
import { createInput, AIM_RANGE } from './input/input.js';
import { createHud } from './ui/hud.js';
import { createBus } from './state/events.js';
import { buildSystem } from './sim/rails.js';
import { launchProbe, dominantBody } from './sim/probe.js';
import { predict } from './sim/predict.js';
import { velAt } from './sim/rails.js';
import { Flight } from './game/flight.js';
import { sandbox } from './levels/sandbox.js';

const level = sandbox;
const sys = Object.assign(buildSystem(level.bodies.map((b) => ({ ...b }))), { bounds: level.bounds });
const pad = sys.byId[level.launch.padBody];

const bus = createBus();
const stage = createStage(document.getElementById('stage'));
const cam = createCamera(stage.camera);
const bodies = createBodies(stage.scene, sys.bodies);
const trajectory = createTrajectory(stage.scene);
const probeView = createProbeView(stage.scene);

let phase = 'planning';              // planning | flying | ended
let aim = { angle: 0.6, power: 0.7 }; // power is 0..1 of launch.maxSpeed
let flight = null;
let t0 = 0;                          // planning time is frozen; launch windows arrive in stage 27

const launchSpec = () => ({ angle: aim.angle, power: aim.power * level.launch.maxSpeed, t0 });

const hud = createHud(document.getElementById('hud'), { onLaunch: launch, onReset: reset });
hud.set({ fuel: `${level.fuel.toFixed(2)} / ${level.fuel.toFixed(2)}`, mission: `Orbit Kepi for ${level.mission.holdSeconds} s` });

function replan() {
  const probe0 = launchProbe(pad, sys.byId, launchSpec());
  const pred = predict(sys, probe0, { t0 });
  trajectory.set(pred);
  const [px, pz] = pad.pos(t0);
  probeView.setAim({ x: px, z: pz }, aim.angle, 0.5 + aim.power * AIM_RANGE);
  const dom = dominantBody(probe0.x, probe0.z, t0, sys.bodies);
  const [bvx, bvz] = velAt(dom, t0, sys.byId);
  hud.set({ speed: Math.hypot(probe0.vx - bvx, probe0.vz - bvz).toFixed(2), progress: '0%' });
  hud.message(pred.crash ? `This launch hits ${pred.crash.bodyId} after ${pred.crash.t.toFixed(1)} s` : pred.lost ? 'This launch leaves the map' : 'Aim, then launch');
}

function launch() {
  if (phase !== 'planning') return;
  flight = new Flight(sys, launchProbe(pad, sys.byId, launchSpec()), { t0, mission: level.mission, bus });
  phase = 'flying';
  probeView.resetTrail(); probeView.hideAim(); trajectory.setVisible(false);
  hud.setPhase(phase); hud.message('');
  bus.emit('launch', launchSpec());
}

function reset() {
  phase = 'planning'; flight = null;
  probeView.hide(); probeView.resetTrail(); trajectory.setVisible(true);
  bodies.update(t0);
  const [px, pz] = pad.pos(t0); cam.setTarget(px, pz);
  hud.setPhase(phase); replan();
}

bus.on('crash', (e) => { phase = 'ended'; hud.message(`Crashed into ${e.bodyId} at t = ${e.t.toFixed(1)} s. Press R to retry.`); });
bus.on('lost', (e) => { phase = 'ended'; hud.message(`Left the map after ${e.t.toFixed(1)} s. Press R to retry.`); });
bus.on('mission_complete', () => { phase = 'ended'; hud.message('Delivered. Press R to fly again.'); });

createInput({
  canvas: document.getElementById('stage'), camera: stage.camera,
  getPad: () => { const [x, z] = pad.pos(t0); return { x, z }; },
  getAim: () => aim, setAim: (a) => { aim = a; replan(); },
  canAim: () => phase === 'planning', onLaunch: launch, onZoom: (f) => cam.zoom(f), onReset: reset,
});

bodies.update(t0);
{ const [px, pz] = pad.pos(t0); cam.snap(px, pz); }
hud.setPhase(phase);
replan();

let last = performance.now();
stage.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (flight && phase === 'flying') {
    flight.advance(dt);
    bodies.update(flight.t);
    probeView.place(flight.probe.x, flight.probe.z);
    cam.setTarget(flight.probe.x, flight.probe.z);
    const dom = dominantBody(flight.probe.x, flight.probe.z, flight.t, sys.bodies);
    const [bvx, bvz] = velAt(dom, flight.t, sys.byId);
    hud.set({ speed: Math.hypot(flight.probe.vx - bvx, flight.probe.vz - bvz).toFixed(2), progress: `${Math.round((flight.missionState?.progress ?? 0) * 100)}%` });
  } else if (flight) {
    bodies.update(flight.t);
    probeView.place(flight.probe.x, flight.probe.z);
  }
  cam.update(dt);
  stage.render();
});
