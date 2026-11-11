import './styles.css';
import { Vector3 } from 'three';
import { createStage, createCamera } from './render/scene.js';
import { createBodies } from './render/bodies.js';
import { createTrajectory } from './render/trajectory.js';
import { createProbeView } from './render/probe.js';
import { createNodeView } from './render/nodes.js';
import { createLabels } from './render/labels.js';
import { createTargetBand } from './render/band.js';
import { createEffects } from './render/effects.js';
import { MODES_BY_PHASE } from './render/cameraRig.js';
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
import { createQualityLoop } from './render/qualityLoop.js';
import { installDebugHook } from './game/debugHook.js';
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
const reduced = () => prefersReducedMotion(settings.get('reducedMotion'));
const cam = createCamera(stage.camera, { reducedMotion: reduced });
const sky = createSky(stage.scene, { reducedMotion: () => prefersReducedMotion(settings.get('reducedMotion')) });
const labels = createLabels(document.getElementById('labels'), stage.camera, new Vector3());
const trajectory = createTrajectory(stage.scene, { labels });
const probeView = createProbeView(stage.scene, { reducedMotion: () => prefersReducedMotion(settings.get('reducedMotion')) });
const nodeView = createNodeView(stage.scene);
// Visual effects and camera shake listen to fxBus: it mirrors the main bus, and the Replay flight publishes to it directly
// so a replay shows bursts and shake without touching telemetry, the coach, or the result card.
const fxBus = createBus();
bus.on('*', (e) => fxBus.emit(e.type, e));
const effects = createEffects(stage.scene, fxBus, { reducedMotion: reduced });
fxBus.on('crash', () => cam.rig.shake(1));
fxBus.on('node_burn', () => cam.rig.shake(0.15));

let levelIndex = 0, level, sys, pad, bodies, band, plan, slow, controls;
let phase = 'planning'; // planning | flying | replaying | ended
let flight = null, pred = null, lastU = 0, sinceReplan = 0;
let replayFlight = null, replayEnding = false, lastRun = null, lastShow = null;
let cardTimer = null, runSpec = null, cameraShown = 0;
const RESULT_DELAY_MS = 1100;
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
  onRetry: () => reset(), onNext: () => loadLevel(levelIndex + 1), onReplay: () => startReplay(),
  onAsk: () => { coachPanel.open(); coachPanel.ask('What went wrong?'); },
});

const quality = createQualityLoop({
  settings, hud,
  apply: (tier) => { stage.post.apply(tier); sky.setTier(tier); bodies?.setDetail(tier.planetDetail); effects.setMax(Math.min(tier.particles, 400)); },
});

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
  bodies.setDetail(quality.settings.planetDetail);
  band?.dispose();
  band = createTargetBand(stage.scene, level.mission, { reducedMotion: reduced });
  const [tx, tz] = sys.byId[level.mission.target].pos(t0), [px0, pz0] = pad.pos(t0);
  plan = new Plan({ fuel: level.fuel, maxNodes: level.maxNodes, angleRange: level.launch.angleRange, defaultAim: { angle: Math.atan2(tz - pz0, tx - px0), power: 0.8 } });
  slow = new SlowMo(level.slowMoSeconds);
  controls = createControls({
    plan, phase: () => phase, pred: () => pred, u, t0: () => t0, changed, launch, reset, toggleSlow, toggleCoach: () => coachPanel.toggle(), cycleQuality: () => quality.cycle(),
    cycleCamera, focusTarget, orbit: (dx, dy) => cam.rig.orbitBy(dx, dy), escape: () => { if (phase === 'replaying') endReplay(true); },
    pad: () => { const [x, z] = pad.pos(t0); return { x, z }; },
    nodeTimeDefault: () => (phase === 'flying' ? flight.elapsed + 1 : ((pred.crash ? pred.crash.t : pred.points[pred.points.length - 1].t) - t0) / 2),
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
    pred = predict(sys, flight.probe, { t0, startIndex: flight.i, nodes: plan.nodes, ghost: true, mission: level.mission, missionHeld: flight.missionState?.held ?? 0 });
  } else {
    plan.elapsed = 0;
    pred = predict(sys, launchState(), { t0, nodes: plan.nodes, ghost: true, mission: level.mission });
  }
  trajectory.set(pred, sys);
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
  if (phase === 'planning') fitCamera(false);
  if (phase === 'flying') flight.setNodes(plan.nodes);
  if (phase === 'planning') {
    const [px, pz] = pad.pos(t0);
    probeView.setAim({ x: px, z: pz }, plan.aim.angle, 0.5 + plan.aim.power * AIM_RANGE);
    hud.set({ speed: relSpeed(launchState(), t0).toFixed(2), progress: '0%' });
    hud.message(pred.delivered ? `This launch delivers after ${(pred.delivered.t - t0).toFixed(1)} s` : pred.crash ? `This launch hits ${bodyName(pred.crash.bodyId)} after ${(pred.crash.t - t0).toFixed(1)} s` : pred.lost ? 'This launch leaves the map' : 'Aim, add burn nodes if needed, then launch');
  }
}

function launch() {
  if (phase !== 'planning') return;
  flight = new Flight(sys, launchState(), { t0, mission: level.mission, bus, nodes: plan.nodes });
  phase = 'flying';
  runSpec = launchSpec();
  cam.rig.setMode('cinematic');
  probeView.resetTrail(); probeView.hideAim();
  hud.setPhase(phase); hud.message('');
  bus.emit('launch', { ...launchSpec(), nodes: plan.nodes.map((n) => ({ t: n.t, dv: [...n.dv] })) });
  recompute();
}

function reset() {
  clearTimeout(cardTimer);
  endSlow();
  phase = 'planning'; flight = null; replayFlight = null; replayEnding = false; plan.elapsed = 0; slow.reset();
  cam.rig.setMode('plan');
  card.hide();
  probeView.hide(); probeView.resetTrail(); trajectory.setVisible(true); effects.clear();
  bodies.update(t0);
  hud.setPhase(phase); changed(); fitCamera(true);
}

function endSlow() {
  if (slowWasActive) { bus.emit('slowmo_end', { seconds: slowSpent }); slowWasActive = false; slowSpent = 0; }
}

/** Bounds of what the player needs to see while planning: pad, target, and the previewed path up to its end. */
function previewBounds() {
  const [px, pz] = pad.pos(t0), [tx, tz] = sys.byId[level.mission.target].pos(t0);
  const b = { minX: Math.min(px, tx), maxX: Math.max(px, tx), minZ: Math.min(pz, tz), maxZ: Math.max(pz, tz) };
  let end = pred.delivered?.i ?? pred.crash?.i ?? pred.lost?.i ?? Infinity;
  const enc = pred.closest[level.mission.target];
  if (enc) end = Math.min(end, enc.i + 180); // frame the approach to the target, not a long loop after it
  for (const p of pred.points) {
    if (p.i > end) break;
    b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x); b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
  }
  return b;
}
const corner = new Vector3();
function boundsInView(b) {
  for (const [x, z] of [[b.minX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.minZ], [b.maxX, b.maxZ]]) {
    corner.set(x, 0, z).project(stage.camera);
    if (Math.abs(corner.x) > 0.8 || corner.y > 0.75 || corner.y < -0.7) return false;
  }
  return true;
}
/** Keep the previewed path on screen: an exact fit on reset, afterwards only zoom out when the path leaves the view. */
function fitCamera(reset) {
  const b = previewBounds();
  if (reset || !boundsInView(b)) cam.frame(b, reset);
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
  // Show the result after the burst has had a moment to play; the attempt itself is already recorded above.
  const show = outcome === 'delivered'
    ? (() => { const s = scoreAttempt(level, { outcome: 'delivered', fuelUsed: flight.fuelUsed, seconds: flight.elapsed }); const fuel = flight.fuelUsed, secs = flight.elapsed; return () => card.win({ level, ...s, fuelUsed: fuel, seconds: secs, hasNext: levelIndex + 1 < LIST.length }); })()
    : () => card.lose({ level, reason });
  lastRun = { spec: runSpec, nodes: plan.nodes.map((n) => ({ t: n.t, dv: [...n.dv] })) };
  lastShow = show;
  clearTimeout(cardTimer);
  cardTimer = setTimeout(show, RESULT_DELAY_MS);
}

/** Camera keys: C cycles the modes for this phase, F focuses the mission target. */
const camPhase = () => (phase === 'replaying' ? 'flying' : phase);
function cycleCamera() { if (phase !== 'replaying') cam.rig.cycle(camPhase(), level.mission.target); }
function focusTarget() { if (phase !== 'replaying') cam.rig.setMode(cam.mode === 'focus' ? MODES_BY_PHASE[camPhase()][0] : 'focus', { focusId: level.mission.target }); }

/** Replay the last attempt exactly (the sim is deterministic) with the replay camera. Nothing is recorded again. */
function startReplay() {
  if (phase !== 'ended' || !lastRun) return;
  clearTimeout(cardTimer); card.hide();
  replayFlight = new Flight(sys, levelLaunch(level, sys, lastRun.spec), { t0, mission: level.mission, nodes: lastRun.nodes, bus: fxBus });
  phase = 'replaying'; replayEnding = false;
  probeView.resetTrail(); effects.clear();
  cam.rig.setMode('replay');
  hud.message('Replay. Esc stops it, R retries.');
  fxBus.emit('launch', { angle: lastRun.spec.angle, power: lastRun.spec.power, nodes: [] });
}
function endReplay(immediately = false) {
  if (phase !== 'replaying') return;
  clearTimeout(cardTimer);
  const done = () => { phase = 'ended'; replayFlight = null; replayEnding = false; effects.clear(); cam.rig.setMode('follow'); hud.message(''); lastShow?.(); };
  if (immediately) done(); else cardTimer = setTimeout(done, RESULT_DELAY_MS);
}
bus.on('crash', (e) => finish(`crash:${e.bodyId}`, `Crashed into ${bodyName(e.bodyId)} at t = ${(e.t - t0).toFixed(1)} s.`));
bus.on('lost', (e) => finish('lost', `Left the map after ${(e.t - t0).toFixed(1)} s.`));
bus.on('mission_complete', () => finish('delivered'));

createInput({
  canvas: document.getElementById('stage'), camera: stage.camera, onZoom: (f) => cam.zoom(f),
  controls: { onDown: (p, s) => controls.onDown(p, s), onKey: (e) => controls.onKey(e) },
});

quality.apply();
installDebugHook({
  level: () => level, plan: () => plan, changed: () => changed(), launch: () => launch(), replay: () => startReplay(),
  cameraMode: () => cam.mode, state: () => ({ phase, t: (replayFlight ?? flight)?.elapsed ?? 0 }),
});
const fromHash = LIST.findIndex((l) => l.id === location.hash.slice(1));
loadLevel(fromHash >= 0 ? fromHash : 0);
if (GALLERY_MODE) cam.zoom(2.1);

let last = performance.now();
stage.renderer.setAnimationLoop((now) => {
  const rawMs = now - last;
  const dt = Math.min(0.1, rawMs / 1000); last = now;
  quality.frame(now, rawMs);
  const live = replayFlight ?? flight;
  if (live) {
    if (phase === 'flying') {
      const scale = slow.tick(dt);
      if (slow.active) { slowSpent += dt; if (!slowWasActive) { slowWasActive = true; bus.emit('slowmo_start'); } }
      else endSlow();
      flight.advance(dt, scale);
      sinceReplan += dt;
      if (phase === 'flying' && sinceReplan > 0.2) recompute();
      hud.set({ speed: relSpeed(flight.probe, flight.t).toFixed(2), progress: `${Math.round((flight.missionState?.progress ?? 0) * 100)}%`, slow: slow.active ? `${slow.left.toFixed(1)} s (on)` : `${slow.left.toFixed(1)} s` });
    } else if (phase === 'replaying') {
      replayFlight.advance(dt);
      hud.set({ speed: relSpeed(replayFlight.probe, replayFlight.t).toFixed(2), progress: `${Math.round((replayFlight.missionState?.progress ?? 0) * 100)}%` });
      if (replayFlight.done && !replayEnding) { replayEnding = true; endReplay(); }
    }
    bodies.update(live.t);
    probeView.place(live.probe.x, live.probe.z, live.probe.vx, live.probe.vz, relSpeed(live.probe, live.t), now / 1000);
  } else hud.set({ slow: `${slow.left.toFixed(1)} s` });
  const tNow = live ? live.t : t0;
  cam.update(dt, {
    probe: live ? live.probe : null, slow: phase === 'flying' && slow.active,
    focus: (id) => { const b = sys.byId[id]; if (!b) return null; const [x, z] = b.pos(tNow); return { x, z, radius: b.radius }; },
  });
  if (now - cameraShown > 400) { cameraShown = now; hud.set({ camera: cam.mode }); }
  sky.update(stage.camera, now / 1000);
  const [bx, bz] = sys.byId[level.mission.target].pos(tNow);
  band.update(bx, bz, now / 1000, live?.missionState?.progress ?? 0);
  trajectory.setScale(u()); probeView.setScale(u());
  effects.update(dt, u(), live ? live.probe : null);
  labels.update();
  if (pred && Math.abs(u() - lastU) / lastU > 0.03) { lastU = u(); nodeView.update(plan, pred, lastU); }
  stage.render();
});
