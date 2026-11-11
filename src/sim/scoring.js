/**
 * Scoring. Stars: 1 for completing, 2 for fuel at or under par * 1.25, 3 for fuel at or under par.
 * A small absolute tolerance keeps zero-fuel pars (launch-only solutions) earnable.
 * Assisted attempts (a Navigator plan was accepted) cannot earn 3 stars and pay 60%.
 */
export const STAR_TOLERANCE = 0.02;
export const ASSIST_PAYOUT = 0.6;
const BASE_PAYOUT = { tutorial: 0, training: 100, inner: 150, outer: 200, deep: 250, lab: 300 };

export function starsFor(parFuel, fuelUsed, { assisted = false } = {}) {
  let stars = 1;
  if (fuelUsed <= parFuel * 1.25 + STAR_TOLERANCE) stars = 2;
  if (fuelUsed <= parFuel + STAR_TOLERANCE && !assisted) stars = 3;
  return stars;
}

/**
 * @param {{tier:string, fuel:number, par:{fuel:number}}} level
 * @param {{outcome:string, fuelUsed:number, seconds:number}} result
 * @returns {{stars:number, payout:number, parts:{base:number, fuelLeft:number, time:number, precision:number}}}
 */
export function scoreAttempt(level, result, { assisted = false } = {}) {
  if (result.outcome !== 'delivered') return { stars: 0, payout: 0, parts: { base: 0, fuelLeft: 0, time: 0, precision: 0 } };
  const parts = {
    base: BASE_PAYOUT[level.tier] ?? 100,
    fuelLeft: Math.round(40 * Math.max(0, level.fuel - result.fuelUsed)),
    time: Math.round(Math.max(0, 30 - result.seconds)),
    precision: 0, // reserved for mission types that measure precision
  };
  const raw = parts.base + parts.fuelLeft + parts.time + parts.precision;
  return { stars: starsFor(level.par.fuel, result.fuelUsed, { assisted }), payout: assisted ? Math.round(raw * ASSIST_PAYOUT) : raw, parts };
}
