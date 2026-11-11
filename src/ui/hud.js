/** DOM HUD: fuel, speed, mission, slow-mo meter, node list, status line, and buttons. */
export function createHud(root, { onLaunch, onReset, onSlow, onCoach }) {
  root.innerHTML = `
    <div class="hud-panel" role="status">
      <div class="hud-row"><span class="hud-label">Fuel</span><span class="hud-num" data-k="fuel"></span></div>
      <div class="hud-row"><span class="hud-label">Speed</span><span class="hud-num" data-k="speed"></span></div>
      <div class="hud-row"><span class="hud-label">Mission</span><span data-k="mission"></span></div>
      <div class="hud-row"><span class="hud-label">Progress</span><span class="hud-num" data-k="progress"></span></div>
      <div class="hud-row"><span class="hud-label">Slow-mo</span><span class="hud-num" data-k="slow"></span></div>
      <ol class="hud-nodes" data-k="nodes" aria-label="Burn nodes"></ol>
    </div>
    <div class="hud-msg" data-k="msg" aria-live="polite"></div>
    <div class="hud-buttons">
      <button data-k="launch">Launch</button>
      <button data-k="slowbtn">Slow-mo (S)</button>
      <button data-k="reset">Reset (R)</button>
      <button data-k="coach">Navigator (H)</button>
    </div>
    <div class="hud-help">Drag to aim. Click the path to add a burn node (or N); drag its handles, or + - , . to adjust. Tab selects, Delete removes, Enter launches.</div>`;
  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  const press = (fn) => (e) => { e.currentTarget.blur(); fn(); }; // keep keyboard shortcuts working after a click
  q('launch').addEventListener('click', press(onLaunch));
  q('reset').addEventListener('click', press(onReset));
  q('slowbtn').addEventListener('click', press(onSlow));
  q('coach').addEventListener('click', press(onCoach));
  return {
    set(fields) { for (const [k, v] of Object.entries(fields)) if (q(k)) q(k).textContent = v; },
    message(text) { q('msg').textContent = text; },
    setPhase(phase) { q('launch').disabled = phase !== 'planning'; },
    setNodes(plan) {
      q('nodes').innerHTML = plan.nodes.map((n, i) =>
        `<li class="${i === plan.selected ? 'sel' : ''}">t ${n.t.toFixed(1)} s &middot; pro ${n.dv[0].toFixed(2)} &middot; rad ${n.dv[1].toFixed(2)}${plan.locked(i) ? ' &middot; done' : ''}</li>`).join('');
    },
  };
}
