const KEY = 'orbit.telemetry.v1';
const MAX_EVENTS = 300, MAX_ATTEMPTS = 200;

/**
 * Subscribes to the event bus, keeps the last 300 events, and builds one record per attempt
 * (AGENTS.md section 15). Everything stays on the device.
 */
export function createTelemetry({ bus, storage }) {
  const saved = storage.get(KEY, { events: [], attempts: [] });
  let events = saved.events ?? [], attempts = saved.attempts ?? [];
  let draft = null;
  const persist = () => storage.set(KEY, { events, attempts });
  const fresh = (e) => ({ levelId: e.levelId, mode: e.mode ?? 'easy', tutorial: !!e.tutorial, assisted: false, planEdits: 0, plannerRequests: 0, previewUsed: true, mapUsed: false, slowmoSeconds: 0, nodes: [], tugs: [] });

  bus.on('*', (e) => {
    events.push({ ...e, at: Date.now() });
    if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
    if (e.type === 'level_start') draft = fresh(e);
    if (!draft) return;
    if (e.type === 'aim_changed' || e.type === 'launch_time_changed' || e.type === 'node_added' || e.type === 'node_moved' || e.type === 'node_removed') draft.planEdits++;
    if (e.type === 'plan_requested') draft.plannerRequests++;
    if (e.type === 'assist_used') draft.assisted = true;
    if (e.type === 'window_map_open') draft.mapUsed = true;
    if (e.type === 'slowmo_end') draft.slowmoSeconds += e.seconds ?? 0;
    if (e.type === 'launch') Object.assign(draft, { launchAngle: e.angle, launchPower: e.power, nodes: e.nodes ?? [], tugs: e.tugs ?? [] });
    if (e.type === 'attempt_end') {
      attempts.push({ ...draft, outcome: e.outcome, fuelUsed: e.fuelUsed, seconds: e.seconds, closestApproaches: e.closestApproaches ?? {}, at: Date.now() });
      if (attempts.length > MAX_ATTEMPTS) attempts = attempts.slice(-MAX_ATTEMPTS);
      draft = fresh(draft);
      persist();
    }
  });

  return {
    attempts: () => attempts,
    events: () => events,
    clear() { events = []; attempts = []; persist(); },
  };
}
