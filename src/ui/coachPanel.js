const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Slide-out Navigator panel: chat log, quick buttons, input, clickable source chips and a source drawer. */
export function createCoachPanel(root, { coach, bus }) {
  root.hidden = true;
  root.innerHTML = `
    <header><span class="coach-title">Navigator</span><button data-k="close" aria-label="Close Navigator">Close</button></header>
    <div class="coach-log" data-k="log" role="log" aria-live="polite"></div>
    <div class="coach-drawer" data-k="drawer" hidden></div>
    <div class="coach-quick">
      <button data-q="Give me a hint">Hint</button>
      <button data-q="Review my launches">Review my launches</button>
      <button data-q="Explain this level">Explain this level</button>
    </div>
    <form class="coach-form" data-k="form"><input data-k="input" type="text" autocomplete="off" placeholder="Ask about orbits, burns, fuel..." aria-label="Ask Navigator"><button type="submit">Ask</button></form>`;
  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  const log = q('log'), drawer = q('drawer'), input = q('input');

  const add = (cls, html) => { const d = document.createElement('div'); d.className = `msg ${cls}`; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; };
  const render = (a) => {
    const body = a.text.split('\n').filter((l) => !l.startsWith('Sources:')).map(esc).join('<br>');
    const chips = a.sources.map((s) => `<button class="chip" data-src="${s.id}" title="${esc(s.title)}">${s.id}</button>`).join('');
    add('coach', `${body}${chips ? `<div class="chips">Sources: ${chips}</div>` : ''}`);
  };
  function ask(text) {
    if (!text.trim()) return;
    add('you', esc(text));
    const answer = coach.ask(text);
    bus.emit('coach_message', { intent: answer.intent });
    if (answer.intent === 'hint') bus.emit('hint', { tier: answer.tier });
    render(answer);
  }
  const open = () => { root.hidden = false; input.focus(); bus.emit('coach_open'); };
  const close = () => { if (root.hidden) return; root.hidden = true; drawer.hidden = true; bus.emit('coach_close'); };

  root.addEventListener('click', (e) => {
    const t = e.target;
    if (t.dataset?.k === 'close') return close();
    if (t.dataset?.q) return ask(t.dataset.q);
    if (t.dataset?.src) {
      const c = coach.chunkById(t.dataset.src);
      if (!c) return;
      drawer.innerHTML = `<strong>[${c.id}] ${esc(c.title)}</strong><p>${esc(c.text).replace(/\n\n/g, '<br><br>')}</p><button data-k="closedrawer">Close source</button>`;
      drawer.hidden = false;
    }
    if (t.dataset?.k === 'closedrawer') drawer.hidden = true;
  });
  q('form').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); input.value = ''; });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); } });
  add('coach', 'I am Navigator. Ask me about orbits, burns and fuel, or press a button below. I work offline from my guides, calculators, and your launch log.');
  return { open, close, toggle: () => (root.hidden ? open() : close()), ask, get isOpen() { return !root.hidden; } };
}
