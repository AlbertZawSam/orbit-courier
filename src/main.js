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
import { createSettings } from './state/settings.js';
import { AutoQuality, tierSettings, nextChoice } from './render/quality.js';
import { prefersReducedMotion } from './a11y/motion.js';
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
import { GALLERY } from './levels/gallery.js';
import { createSky } from './render/sky.js';

const GALLERY_MODE = location.hash === '#gallery'; // renderer test bench: dist/index.html#gallery
const LIST = GALLERY_MODE ? [GALLERY] : LEVELS;
const bus = createBus();
const storage = createStorage('');
const settings = createSettings(storage);
const telemetry = createTelemetry({ bus, storage });
const stage = createStage(document.getElementById('stage'));
const cam = createCamera(stage.camera);
const sky = createSky(stage.scene, { reducedMotion: () => prefersReducedMotion(settings.get('reducedMotion')) });
const trajectory = createTrajectory(stage.scene);
const probeView = createProbeView(stage.scene, { reducedMotion: () => prefersReducedMotion(settings.get('reducedMotion')) });
const nodeView = createNodeView(stage.scene);

let levelIndex = 0, level, sys, pad, bodies, plan, slow, controls;
let phase = 'planning'; // planning | flying | ended
let flight = null, pred = null, lastU = 0, sinceReplan = 0;
let auto = new AutoQuality('high');
let tierName = settings.get('quality') === 'auto' ? 'high' : settings.get('quality');
let frameMs = 16, qualityShown = 0;
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

function applyQuality() {
  const tier = tierSettings(tierName);
  stage.post.apply(tier); sky.setTier(tier); bodies?.setDetail(tier.planetDetail);
}
function cycleQuality() {
  const choice = nextChoice(settings.get('quality'));
  settings.set('quality', choice);
  if (choice === 'auto') { auto = new AutoQuality('high'); tierName = 'high'; } else tierName = choice;
  applyQuality();
  hud.notice(`Graphics quality: ${choice}${choice === 'auto' ? ' (adjusts to your device)' : ''}`, 3000);
}

function relSpeed(p, t) {
  const dom = dominantBody(p.x, p.z, t, sys.bodies), [vx, vz] = velAt(dom, t, sys.byId);
  return Math.hypot(p.vx - vx, p.vz - vz);
}

function loadLevel(i) {
  levelIndex = ((i % LIST.length) + LIST.length) % LIST.length;
  level = LIST[levelIndex];
  if (!GALLERY_MODE) location.hash = level.id;
  sys = buildLevelSystem(level);
  pad = sys.byId[level.launch.padBody];
  bodies?.dispose();
  bodies = createBodies(stage.scene, sys.bodies, { reducedMotion: () => prefersReducedMotion(settings.get('reducedMotion')) });
  bodies.setDetail(tierSettings(tierName).planetDetail);
  const [tx, tz] = sys.byId[level.mission.target].pos(t0), [px0, pz0] = pad.pos(t0);
  plan = new Plan({ fuel: level.fuel, maxNodes: level.maxNodes, angleRange: level.launch.angleRange, defaultAim: { angle: Math.atan2(tz - pz0, tx - px0), power: 0.8 } });
  slow = new SlowMo(level.slowMoSeconds);
  controls = createControls({
    plan, phase: () => phase, pred: () => pred, u, t0: () => t0, changed, launch, reset, toggleSlow, toggleCoach: () => coachPanel.toggle(), cycleQuality,
    pad: () => { const [x, z] = pad.pos(t0); return { x, z }; },
    nodeTimeDefault: () => (phase === 'flying' ? flight.elapsed + 1 : (pred.points[pred.points.length - 1].t - t0) / 2),
  });
  prevAim = JSON.stringify(plan.aim); prevNodes = [];
  coach.resetHints(level.id);
  bus.emit('level_start', { levelId: level.id, mode: 'easy', tutorial: false });
  const m = level.mission;
  hud.set({ mission: `${level.name}: orbit ${bodyName(m.target)} at ${m.rMin}-${m.rMax} for ${m.holdSeconds} s` });
  cam.snap((px0 + tx) / 2, (pz0 + tz) / 2);
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
  frameCamera();
  hud.setPhase(phase); changed();
}

function endSlow() {
  if (slowWasActive) { bus.emit('slowmo_end', { seconds: slowSpent }); slowWasActive = false; slowSpent = 0; }
}

/** While planning, centre the view between the launch pad and the target so both are on screen. */
function frameCamera() {
  const [px, pz] = pad.pos(t0), [tx, tz] = sys.byId[level.mission.target].pos(t0);
  cam.setTarget((px + tx) / 2, (pz + tz) / 2);
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
    card.win({ level, ...s, fuelUsed: flight.fuelUsed, seconds: flight.elapsed, hasNext: levelIndex + 1 < LIST.length });
  } else card.lose({ level, reason });
}
bus.on('crash', (e) => finish(`crash:${e.bodyId}`, `Crashed into ${bodyName(e.bodyId)} at t = ${(e.t - t0).toFixed(1)} s.`));
bus.on('lost', (e) => finish('lost', `Left the map after ${(e.t - t0).toFixed(1)} s.`));
bus.on('mission_complete', () => finish('delivered'));

createInput({
  canvas: document.getElementById('stage'), camera: stage.camera, onZoom: (f) => cam.zoom(f),
  controls: { onDown: (p) => controls.onDown(p), onKey: (e) => controls.onKey(e) },
});

applyQuality();
const fromHash = LIST.findIndex((l) => l.id === location.hash.slice(1));
loadLevel(fromHash >= 0 ? fromHash : 0);
if (GALLERY_MODE) cam.zoom(2.1);

let last = performance.now();
stage.renderer.setAnimationLoop((now) => {
  const rawMs = now - last;
  const dt = Math.min(0.1, rawMs / 1000); last = now;
  if (rawMs > 0 && rawMs < 250) frameMs += (rawMs - frameMs) * 0.05;
  if (settings.get('quality') === 'auto') {
    const drop = auto.push(rawMs);
    if (drop) { tierName = drop.to; applyQuality(); hud.notice(`Lowered graphics to ${drop.to} to keep play smooth. Press Q to choose a quality.`); }
  }
  if (now - qualityShown > 500) { qualityShown = now; hud.set({ quality: `${settings.get('quality')}${settings.get('quality') === 'auto' ? ` (${tierName})` : ''}, ${frameMs.toFixed(1)} ms` }); }
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
  sky.update(stage.camera, now / 1000);
  if (pred && Math.abs(u() - lastU) / lastU > 0.03) { lastU = u(); nodeView.update(plan, pred, lastU); }
  stage.render();
});
