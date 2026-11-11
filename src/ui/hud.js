/** Basic DOM HUD: fuel, speed, mission, a status line, and Launch / Reset buttons. */
export function createHud(root, { onLaunch, onReset }) {
  root.innerHTML = `
    <div class="hud-panel" role="status">
      <div class="hud-row"><span class="hud-label">Fuel</span><span class="hud-num" data-k="fuel"></span></div>
      <div class="hud-row"><span class="hud-label">Speed</span><span class="hud-num" data-k="speed"></span></div>
      <div class="hud-row"><span class="hud-label">Mission</span><span data-k="mission"></span></div>
      <div class="hud-row"><span class="hud-label">Progress</span><span class="hud-num" data-k="progress"></span></div>
    </div>
    <div class="hud-msg" data-k="msg" aria-live="polite"></div>
    <div class="hud-buttons">
      <button data-k="launch">Launch</button>
      <button data-k="reset">Reset (R)</button>
    </div>
    <div class="hud-help">Drag to aim, or arrows (Shift = fine). Enter launches. Wheel zooms.</div>`;
  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  q('launch').addEventListener('click', onLaunch);
  q('reset').addEventListener('click', onReset);
  return {
    set(fields) { for (const [k, v] of Object.entries(fields)) if (q(k)) q(k).textContent = v; },
    message(text) { q('msg').textContent = text; },
    setPhase(phase) { q('launch').disabled = phase !== 'planning'; },
  };
}
