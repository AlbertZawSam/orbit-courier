// Plain-language text for each mission type: the goal line and the live progress readout. Pure, so it is testable.

/** One sentence describing the goal. `nameOf(id)` turns a body id into its display name. */
export function missionGoal(m, nameOf = (id) => id) {
  switch (m.type) {
    case 'deliver_orbit': return `orbit ${nameOf(m.target)} at ${m.rMin}-${m.rMax} for ${m.holdSeconds ?? 4} s`;
    case 'rendezvous': return `rendezvous with ${nameOf(m.target)}: get within ${m.captureDist} at under ${m.maxRelSpeed} relative speed`;
    case 'soft_landing': return `land on ${nameOf(m.target)} slower than ${m.maxLandSpeed}`;
    case 'gate_run': return `fly through ${m.gates.length} gate${m.gates.length === 1 ? '' : 's'} in order`;
    default: return `reach ${nameOf(m.target)}`;
  }
}

/** The HUD progress readout for a mission's live state (`st` is null before launch). */
export function describeProgress(m, st) {
  if (!st) return '-';
  switch (m.type) {
    case 'deliver_orbit': return `${(st.held ?? 0).toFixed(1)} / ${m.holdSeconds ?? 4} s`;
    case 'rendezvous': return Number.isFinite(st.dist) ? `gap ${st.dist.toFixed(1)}, rel ${st.relSpeed.toFixed(1)} (max ${m.maxRelSpeed})` : '-';
    case 'soft_landing': return Number.isFinite(st.altitude) ? `altitude ${Math.max(0, st.altitude).toFixed(1)}, speed ${st.speed.toFixed(1)} (max ${m.maxLandSpeed})` : '-';
    case 'gate_run': return `${st.done ? 'all' : `gate ${st.passed + 1} of`} ${st.total}${st.missed?.length ? `, ${st.missed.length} missed` : ''}`;
    default: return `${Math.round((st.progress ?? 0) * 100)}%`;
  }
}
