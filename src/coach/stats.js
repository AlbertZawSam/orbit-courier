const TAU = Math.PI * 2;

/** Spread (degrees) of a set of angles, measured around their circular mean so wraparound is safe. */
export function angleSpreadDeg(angles) {
  if (angles.length < 2) return 0;
  const mean = Math.atan2(angles.reduce((s, a) => s + Math.sin(a), 0), angles.reduce((s, a) => s + Math.cos(a), 0));
  const dev = angles.map((a) => { let d = (a - mean) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; });
  return ((Math.max(...dev) - Math.min(...dev)) * 180) / Math.PI;
}

/**
 * Summarize this player's attempts on one level. Tutorial attempts never count.
 * parRatio is fuel used / max(par, 0.02), so a zero-fuel par stays finite.
 * scrubChurn is the average number of aim and node edits made before launching.
 */
export function summarize(levelId, attempts, level = null) {
  const mine = attempts.filter((a) => a.levelId === levelId && !a.tutorial);
  const delivered = mine.filter((a) => a.outcome === 'delivered');
  const failures = mine.filter((a) => a.outcome !== 'delivered');
  const counts = {};
  for (const a of failures) counts[a.outcome] = (counts[a.outcome] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const par = level?.par?.fuel ?? null;
  const best = delivered.length ? Math.min(...delivered.map((a) => a.fuelUsed)) : null;
  const target = level?.mission?.target;
  const closest = target ? mine.map((a) => a.closestApproaches?.[target]).filter((d) => Number.isFinite(d)) : [];
  return {
    levelId, attempts: mine.length, delivered: delivered.length, failures: failures.length,
    outcomes: counts,
    repeatedOutcome: top && top[1] >= 2 ? { outcome: top[0], count: top[1] } : null,
    lastOutcome: mine.length ? mine[mine.length - 1].outcome : null,
    angleSpreadDeg: angleSpreadDeg(mine.map((a) => a.launchAngle)),
    bestFuel: best,
    parRatio: par !== null && best !== null ? best / Math.max(par, 0.02) : null,
    lastLaunch: mine.length ? { angle: mine[mine.length - 1].launchAngle, power: mine[mine.length - 1].launchPower } : null,
    closestToTarget: closest.length ? Math.min(...closest) : null,
    previewUsed: mine.some((a) => a.previewUsed),
    mapUsed: mine.some((a) => a.mapUsed),
    slowmoSeconds: mine.reduce((s, a) => s + (a.slowmoSeconds ?? 0), 0),
    nodeAttempts: mine.filter((a) => a.nodes?.length > 0).length,
    assistedAttempts: mine.filter((a) => a.assisted).length,
    plannerRequests: mine.reduce((s, a) => s + (a.plannerRequests ?? 0), 0),
    scrubChurn: mine.length ? mine.reduce((s, a) => s + (a.planEdits ?? 0), 0) / mine.length : 0,
  };
}
