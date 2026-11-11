/** DOM HUD: fuel, speed, mission, slow-mo meter, node list, status line, and buttons. */
export function createHud(root, { onLaunch, onReset, onSlow, onCoach, onSound, onTime }) {
  root.innerHTML = `
    <div class="hud-panel" role="status">
      <div class="hud-row"><span class="hud-label">Fuel</span><span class="hud-num" data-k="fuel"></span></div>
      <div class="hud-row"><span class="hud-label">Speed</span><span class="hud-num" data-k="speed"></span></div>
      <div class="hud-row"><span class="hud-label">Mission</span><span data-k="mission"></span></div>
      <div class="hud-row"><span class="hud-label">Progress</span><span class="hud-num" data-k="progress"></span></div>
      <div class="hud-row" data-k="timerow" hidden><span class="hud-label">Launch time</span><span class="hud-num" data-k="time"></span></div>
      <input class="hud-time" data-k="timeslider" type="range" min="0" max="0" step="0.05" value="0" aria-label="Launch time in seconds" hidden>
      <div class="hud-row"><span class="hud-label">Sound (M)</span><span class="hud-num" data-k="sound"></span></div>
      <div class="hud-row"><span class="hud-label">Camera (C)</span><span class="hud-num" data-k="camera"></span></div>
      <div class="hud-row"><span class="hud-label">Quality (Q)</span><span class="hud-num" data-k="quality"></span></div>
      <div class="hud-row"><span class="hud-label">Slow-mo</span><span class="hud-num" data-k="slow"></span></div>
      <ol class="hud-nodes" data-k="nodes" aria-label="Burn nodes"></ol>
    </div>
    <div class="hud-msg" data-k="msg" aria-live="polite"></div>
    <div class="hud-notice" data-k="notice" role="status"></div>
    <div class="hud-buttons">
      <button data-k="launch">Launch</button>
      <button data-k="slowbtn">Slow-mo (S)</button>
      <button data-k="reset">Reset (R)</button>
      <button data-k="coach">Navigator (H)</button>
      <button data-k="soundbtn">Sound</button>
    </div>
    <div class="hud-help">Drag to aim. Click the path to add a burn node (or N); drag its handles, or + - , . to adjust. Tab selects, Delete removes, Enter launches. C changes the camera, F focuses the target.</div>`;
  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  const press = (fn) => (e) => { e.currentTarget.blur(); fn(); }; // keep keyboard shortcuts working after a click
  q('launch').addEventListener('click', press(onLaunch));
  q('reset').addEventListener('click', press(onReset));
  q('slowbtn').addEventListener('click', press(onSlow));
  q('coach').addEventListener('click', press(onCoach));
  q('soundbtn').addEventListener('click', press(onSound));
  q('timeslider').addEventListener('input', (e) => onTime(Number(e.target.value)));
  return {
    set(fields) { for (const [k, v] of Object.entries(fields)) if (q(k)) q(k).textContent = v; },
    message(text) { q('msg').textContent = text; },
    notice(text, ms = 5000) { const el = q('notice'); el.textContent = text; clearTimeout(el._t); el._t = setTimeout(() => { el.textContent = ''; }, ms); },
    setPhase(phase) { q('launch').disabled = phase !== 'planning'; q('timeslider').disabled = phase !== 'planning'; },
    /** Show the launch-time slider for levels where waiting matters (window > 0 seconds). */
    setLaunchWindow(max, value = 0) {
      const on = max > 0;
      q('timerow').hidden = !on; q('timeslider').hidden = !on;
      q('timeslider').max = String(max); q('timeslider').value = String(value);
      q('time').textContent = `+${value.toFixed(1)} s`;
    },
    setLaunchTime(value) { q('timeslider').value = String(value); q('time').textContent = `+${value.toFixed(1)} s`; },
    setNodes(plan) {
      q('nodes').innerHTML = plan.nodes.map((n, i) =>
        `<li class="${i === plan.selected ? 'sel' : ''}">t ${n.t.toFixed(1)} s &middot; pro ${n.dv[0].toFixed(2)} &middot; rad ${n.dv[1].toFixed(2)}${plan.locked(i) ? ' &middot; done' : ''}</li>`).join('');
    },
  };
}
