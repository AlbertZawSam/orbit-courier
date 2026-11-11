/** Result card: win (stars, payout, fuel versus par) or lose (why), with Retry and Next. */
export function createResultCard(root, { onRetry, onNext, onAsk, onReplay }) {
  root.hidden = true;
  const render = (html) => { root.innerHTML = html; root.hidden = false; root.querySelector('button')?.focus(); };
  root.addEventListener('click', (e) => {
    const k = e.target?.dataset?.k;
    if (k === 'retry') onRetry();
    if (k === 'next') onNext();
    if (k === 'ask') onAsk();
    if (k === 'replay') onReplay();
  });
  return {
    hide() { root.hidden = true; root.innerHTML = ''; },
    win({ level, stars, payout, parts, fuelUsed, seconds, hasNext }) {
      const star = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      render(`<div class="card" role="dialog" aria-label="Level complete">
        <h2>${level.name} complete</h2>
        <p class="stars" aria-label="${stars} of 3 stars">${star}</p>
        <table>
          <tr><td>Fuel used</td><td>${fuelUsed.toFixed(2)} (par ${level.par.fuel.toFixed(2)})</td></tr>
          <tr><td>Flight time</td><td>${seconds.toFixed(1)} s</td></tr>
          <tr><td>Payout</td><td>${payout} credits (base ${parts.base}, fuel ${parts.fuelLeft}, time ${parts.time})</td></tr>
        </table>
        <div class="card-buttons"><button data-k="retry">Retry</button><button data-k="replay">Replay</button>${hasNext ? '<button data-k="next">Next level</button>' : ''}</div></div>`);
    },
    lose({ level, reason }) {
      render(`<div class="card" role="dialog" aria-label="Attempt failed">
        <h2>${level.name}: not this time</h2><p>${reason}</p>
        <div class="card-buttons"><button data-k="retry">Retry</button><button data-k="replay">Replay</button><button data-k="ask">Ask Navigator</button></div></div>`);
    },
  };
}
