const TOGGLES = [
  ['soundOn', 'Sound'], ['sfxOn', 'Sound effects'], ['musicOn', 'Music'], ['humOn', 'Gravity hum'], ['pingOn', 'Target ping'],
  ['reduceSound', 'Reduce sound (no hum, ping or arpeggio)'],
];

/** Speaker popover: master volume plus a switch for each layer. Everything saves as it changes. */
export function createSettingsPanel(root, { settings }) {
  root.hidden = true;
  root.innerHTML = `
    <header><span class="coach-title">Sound</span><button data-k="close" aria-label="Close sound settings">Close</button></header>
    <label class="row"><span>Master volume</span><input data-s="volume" type="range" min="0" max="100" step="1" aria-label="Master volume"><output data-o="volume"></output></label>
    ${TOGGLES.map(([k, label]) => `<label class="row"><input data-s="${k}" type="checkbox"><span>${label}</span></label>`).join('')}`;
  const q = (sel) => root.querySelector(sel);
  const refresh = () => {
    q('[data-s="volume"]').value = Math.round(settings.get('volume') * 100);
    q('[data-o="volume"]').textContent = `${Math.round(settings.get('volume') * 100)}%`;
    for (const [k] of TOGGLES) q(`[data-s="${k}"]`).checked = !!settings.get(k);
  };
  root.addEventListener('input', (e) => {
    const k = e.target.dataset?.s;
    if (!k) return;
    settings.set(k, k === 'volume' ? Number(e.target.value) / 100 : e.target.checked);
    refresh();
  });
  root.addEventListener('click', (e) => { if (e.target.dataset?.k === 'close') close(); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  settings.onChange(refresh);
  refresh();
  function open() { root.hidden = false; q('[data-s="volume"]').focus(); }
  function close() { root.hidden = true; }
  return { open, close, toggle: () => (root.hidden ? open() : close()), get isOpen() { return !root.hidden; } };
}
