import { sfx } from './sfx.js';

/** Every event in AGENTS.md section 15, plus the ones the game adds. */
export const ALL_EVENTS = [
  'level_start', 'launch', 'node_added', 'node_moved', 'node_removed', 'tug_placed', 'slowmo_start', 'slowmo_end',
  'closest_approach', 'near_body', 'mission_progress', 'mission_complete', 'crash', 'lost', 'timeout', 'relay_link',
  'fuel_low', 'window_map_open', 'plan_requested', 'plan_accepted', 'assist_used', 'hint', 'coach_open', 'coach_close',
  'coach_message', 'report_open', 'postcard_saved', 'song_played', 'ui_click', 'ui_error', 'tutorial_start',
  'tutorial_step_done', 'tutorial_skipped', 'tutorial_complete', 'upgrade_bought', 'mode_changed',
  // added by the game
  'aim_changed', 'node_burn', 'attempt_end', 'stars_awarded',
];

/**
 * Sound for every event: a handler `(audio, event) => void`, or an explicit silent entry with the reason.
 * `audio` is { engine, ambience }. A test makes sure nothing in ALL_EVENTS is missing from this table.
 */
export const EVENT_SOUNDS = {
  level_start: { silent: 'a new level is shown, not heard' },
  launch: { play: (a, e) => a.ambience.thrustBurst(0.45) },
  node_added: { play: (a, e) => sfx.tick(a.engine, 0.2) },
  node_moved: { play: (a, e) => (e.atLimit ? sfx.buzz(a.engine) : sfx.tick(a.engine, e.dv ?? 0.2)) },
  node_removed: { play: (a) => sfx.nodeRemoved(a.engine) },
  tug_placed: { silent: 'gravity tugs arrive in stage 29' },
  slowmo_start: { play: (a) => a.engine.setSlow(true) },
  slowmo_end: { play: (a) => a.engine.setSlow(false) },
  closest_approach: { silent: 'the Doppler swoosh already marks the closest pass' },
  near_body: { silent: 'the gravity hum already rises near a body' },
  mission_progress: { silent: 'the orbit-lock shimmer is driven by the frame update, not by this event' },
  mission_complete: { play: (a) => sfx.delivery(a.engine) },
  crash: { play: (a) => sfx.crash(a.engine) },
  lost: { play: (a) => sfx.lost(a.engine) },
  timeout: { play: (a) => sfx.timeout(a.engine) },
  relay_link: { silent: 'relay missions arrive in stage 30' },
  fuel_low: { silent: 'the low-fuel pulse is driven by the frame update' },
  window_map_open: { silent: 'the window map arrives in stage 27' },
  plan_requested: { silent: 'the planner arrives in stage 28' },
  plan_accepted: { silent: 'the planner arrives in stage 28' },
  assist_used: { silent: 'Assist mode arrives in stage 28' },
  hint: { play: (a) => a.engine.ready && sfx.hint(a.engine) },
  coach_open: { play: (a) => sfx.soft(a.engine) },
  coach_close: { play: (a) => sfx.soft(a.engine) },
  coach_message: { play: (a) => sfx.blip(a.engine) },
  report_open: { silent: 'the flight report arrives in stage 31' },
  postcard_saved: { silent: 'the postcard arrives in stage 31' },
  song_played: { silent: 'the Orbit Song arrives in stage 31' },
  ui_click: { play: (a) => sfx.click(a.engine) },
  ui_error: { play: (a) => sfx.error(a.engine) },
  tutorial_start: { silent: 'Flight School arrives in stage 17' },
  tutorial_step_done: { silent: 'Flight School arrives in stage 17' },
  tutorial_skipped: { silent: 'Flight School arrives in stage 17' },
  tutorial_complete: { silent: 'Flight School arrives in stage 17' },
  upgrade_bought: { silent: 'upgrades arrive in stage 16' },
  mode_changed: { silent: 'difficulty modes arrive in stage 16' },
  aim_changed: { silent: 'fires on every drag frame; a sound here would be noise' },
  node_burn: { play: (a) => a.ambience.thrustBurst(0.35) },
  attempt_end: { silent: 'bookkeeping only; the crash, lost and delivery cues already played' },
  stars_awarded: { play: (a, e) => sfx.stars(a.engine, e.stars ?? 0) },
};

/** Subscribe the audio layers to a bus. Returns an unsubscribe function. */
export function wireAudio(bus, audio) {
  const offs = [];
  for (const [type, entry] of Object.entries(EVENT_SOUNDS)) {
    if (!entry.play) continue;
    offs.push(bus.on(type, (e) => { if (audio.engine.ready) entry.play(audio, e); }));
  }
  return () => offs.forEach((off) => off());
}
