import './styles.css';
import { createStage, createCamera } from './render/scene.js';
import { createBodies } from './render/bodies.js';
import { createTrajectory } from './render/trajectory.js';
import { createProbeView } from './render/probe.js';
import { createNodeView } from './render/nodes.js';
import { createInput } from './input/input.js';
import { createControls, AIM_RANGE } from './input/controls.js';
import { createHud } from './ui/hud.js';
import { createResultCard } from './ui/resultCard.js';
import { createCoachPanel } from './ui/coachPanel.js';
import { createCoach } from './coach/coach.js';
import kb from './coach/kb.generated.json';
import { createStorage } from './state/storage.js';
import { createTelemetry } from './state/telemetry.js';
import { createBus } from './state/events.js';
import { velAt } from './sim/rails.js';
import { dominantBody } from './sim/probe.js';
import { predict } from './sim/predict.js';
import { scoreAttempt } from './sim/scoring.js';
import { Flight } from './game/flight.js';
import { Plan } from './game/plan.js';
import { SlowMo } from './game/slowmo.js';
import { buildLevelSystem, levelLaunch } from './game/replay.js';
import { LEVELS } from './levels/levels.js';

const bus = createBus();
const telemetry = createTelemetry({ bus, storage: createStorage('') });
const stage = createStage(document.getElementById('stage'));
const cam = createCamera(stage.camera);
const trajectory = createTrajectory(stage.scene);
const probeView = createProbeView(stage.scene);
const nodeView = createNodeView(stage.scene);

let levelIndex = 0, level, sys, pad, bodies, plan, slow, controls;
let phase = 'planning'; // planning | flying | ended
let flight = null, pred = null, lastU = 0, sinceReplan = 0;
let prevAim = null, prevNodes = [], slowWasActive = false, slowSpent = 0;
const t0 = 0; // planning time is frozen; launch windows arrive in stage 27

const u = () => cam.dist * 0.05;
const launchSpec = () => ({ angle: plan.aim.angle, power: plan.aim.power * level.launch.maxSpeed, t0 });
const launchState = () => levelLaunch(level, sys, launchSpec());
const bodyName = (id) => sys.byId[id].name ?? id;

const coach = createCoach({ chunks: kb, getContext: () => ({ level, sys, attempts: telemetry.attempts(), skill: 'beginner' }) });
const coachPanel = createCoachPanel(document.getElementById('coach'), { coach, bus });
const hud = createHud(document.getElementById('hud'), { onLaunch: () => launch(), onReset: () => reset(), onSlow: () => toggleSlow(), onCoach: () => coachPanel.toggle() });
const card = createResultCard(document.getElementById('card'), {
  onRetry: () => reset(), onNext: () => loadLevel(levelIndex + 1),
  onAsk: () => { coachPanel.open(); coachPanel.ask('What went wrong?'); },
});

function relSpeed(p, t) {
  const dom = dominantBody(p.x, p.z, t, sys.bodies), [vx, vz] = velAt(dom, t, sys.byId);
  return Math.hypot(p.vx - vx, p.vz - vz);
}

function loadLevel(i) {
  levelIndex = ((i % LEVELS.length) + LEVELS.length) % LEVELS.length;
  level = LEVELS[levelIndex];
  location.hash = level.id;
  sys = buildLevelSystem(level);
  pad = sys.byId[level.launch.padBody];
  bodies?.dispose();
  bodies = createBodies(stage.scene, sys.bodies);
  plan = new Plan({ fuel: level.fuel, maxNodes: level.maxNodes, angleRange: level.launch.angleRange });
  slow = new SlowMo(level.slowMoSeconds);
  controls = createControls({
    plan, phase: () => phase, pred: () => pred, u, t0: () => t0, changed, launch, reset, toggleSlow, toggleCoach: () => coachPanel.toggle(),
    pad: () => { const [x, z] = pad.pos(t0); return { x, z }; },
    nodeTimeDefault: () => (phase === 'flying' ? flight.elapsed + 1 : (pred.points[pred.points.length - 1].t - t0) / 2),
  });
  prevAim = JSON.stringify(plan.aim); prevNodes = [];
  coach.resetHints(level.id);
  bus.emit('level_start', { levelId: level.id, mode: 'easy', tutorial: false });
  const m = level.mission;
  hud.set({ mission: `${level.name}: orbit ${bodyName(m.target)} at ${m.rMin}-${m.rMax} for ${m.holdSeconds} s` });
  const [px, pz] = pad.pos(t0);
  cam.snap(px, pz);
  reset();
}

function recompute() {
  if (phase === 'flying') {
    plan.elapsed = flight.elapsed;
    pred = predict(sys, flight.probe, { t0, startIndex: flight.i, nodes: plan.nodes });
  } else {
    plan.elapsed = 0;
    pred = predict(sys, launchState(), { t0, nodes: plan.nodes });
  }
  trajectory.set(pred);
  lastU = u();
  nodeView.update(plan, pred, lastU);
  hud.set({ fuel: `${plan.fuelLeft().toFixed(2)} / ${level.fuel.toFixed(2)}` });
  hud.setNodes(plan);
  sinceReplan = 0;
}

function emitPlanEvents() {
  const aim = JSON.stringify(plan.aim);
  if (aim !== prevAim) { prevAim = aim; bus.emit('aim_changed', { angle: plan.aim.angle, power: plan.aim.power }); }
  const now = plan.nodes;
  if (now.length > prevNodes.length) bus.emit('node_added', { count: now.length });
  else if (now.length < prevNodes.length) bus.emit('node_removed', { count: now.length });
  else if (JSON.stringify(now) !== JSON.stringify(prevNodes)) bus.emit('node_moved', { count: now.length });
  prevNodes = now.map((n) => ({ t: n.t, dv: [...n.dv] }));
}

function changed() {
  emitPlanEvents();
  recompute();
  if (phase === 'flying') flight.setNodes(plan.nodes);
  if (phase === 'planning') {
    const [px, pz] = pad.pos(t0);
    probeView.setAim({ x: px, z: pz }, plan.aim.angle, 0.5 + plan.aim.power * AIM_RANGE);
    hud.set({ speed: relSpeed(launchState(), t0).toFixed(2), progress: '0%' });
    hud.message(pred.crash ? `This launch hits ${bodyName(pred.crash.bodyId)} after ${(pred.crash.t - t0).toFixed(1)} s` : pred.lost ? 'This launch leaves the map' : 'Aim, add burn nodes if needed, then launch');
  }
}

function launch() {
  if (phase !== 'planning') return;
  flight = new Flight(sys, launchState(), { t0, mission: level.mission, bus, nodes: plan.nodes });
  phase = 'flying';
  probeView.resetTrail(); probeView.hideAim();
  hud.setPhase(phase); hud.message('');
  bus.emit('launch', { ...launchSpec(), nodes: plan.nodes.map((n) => ({ t: n.t, dv: [...n.dv] })) });
  recompute();
}

function reset() {
  endSlow();
  phase = 'planning'; flight = null; plan.elapsed = 0; slow.reset();
  card.hide();
  probeView.hide(); probeView.resetTrail(); trajectory.setVisible(true);
  bodies.update(t0);
  const [px, pz] = pad.pos(t0); cam.setTarget(px, pz);
  hud.setPhase(phase); changed();
}

function endSlow() {
  if (slowWasActive) { bus.emit('slowmo_end', { seconds: slowSpent }); slowWasActive = false; slowSpent = 0; }
}

function toggleSlow() {
  if (phase !== 'flying') return;
  const on = slow.toggle();
  hud.message(on ? 'Slow motion on' : slow.left > 0 ? '' : 'Slow-mo budget used up');
}

function finish(outcome, reason) {
  phase = 'ended'; trajectory.setVisible(false); hud.message('');
  endSlow();
  bus.emit('attempt_end', { outcome, fuelUsed: flight.fuelUsed, seconds: flight.elapsed, closestApproaches: { ...flight.closest } });
  if (outcome === 'delivered') {
    const s = scoreAttempt(level, { outcome: 'delivered', fuelUsed: flight.fuelUsed, seconds: flight.elapsed });
    card.win({ level, ...s, fuelUsed: flight.fuelUsed, seconds: flight.elapsed, hasNext: levelIndex + 1 < LEVELS.length });
  } else card.lose({ level, reason });
}
bus.on('crash', (e) => finish(`crash:${e.bodyId}`, `Crashed into ${bodyName(e.bodyId)} at t = ${(e.t - t0).toFixed(1)} s.`));
bus.on('lost', (e) => finish('lost', `Left the map after ${(e.t - t0).toFixed(1)} s.`));
bus.on('mission_complete', () => finish('delivered'));

createInput({
  canvas: document.getElementById('stage'), camera: stage.camera, onZoom: (f) => cam.zoom(f),
  controls: { onDown: (p) => controls.onDown(p), onKey: (e) => controls.onKey(e) },
});

const fromHash = LEVELS.findIndex((l) => l.id === location.hash.slice(1));
loadLevel(fromHash >= 0 ? fromHash : 0);

let last = performance.now();
stage.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (flight) {
    if (phase === 'flying') {
      const scale = slow.tick(dt);
      if (slow.active) { slowSpent += dt; if (!slowWasActive) { slowWasActive = true; bus.emit('slowmo_start'); } }
      else endSlow();
      flight.advance(dt, scale);
      sinceReplan += dt;
      if (phase === 'flying' && sinceReplan > 0.2) recompute();
      hud.set({ speed: relSpeed(flight.probe, flight.t).toFixed(2), progress: `${Math.round((flight.missionState?.progress ?? 0) * 100)}%`, slow: slow.active ? `${slow.left.toFixed(1)} s (on)` : `${slow.left.toFixed(1)} s` });
      cam.setTarget(flight.probe.x, flight.probe.z);
    }
    bodies.update(flight.t);
    probeView.place(flight.probe.x, flight.probe.z);
  } else hud.set({ slow: `${slow.left.toFixed(1)} s` });
  cam.update(dt);
  if (pred && Math.abs(u() - lastU) / lastU > 0.03) { lastU = u(); nodeView.update(plan, pred, lastU); }
  stage.render();
});
