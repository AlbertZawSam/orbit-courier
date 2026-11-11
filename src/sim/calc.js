// Calculators shared by the UI and the coach. Game units, G = 1.
export const vCirc = (mu, r) => Math.sqrt(mu / r);
export const vEsc = (mu, r) => Math.sqrt((2 * mu) / r);
export const period = (mu, a) => 2 * Math.PI * Math.sqrt(a ** 3 / mu);
export const visViva = (mu, r, a) => Math.sqrt(mu * (2 / r - 1 / a));

/** Hohmann transfer between circular orbits r1 -> r2 around a body with parameter mu. */
export function hohmann(mu, r1, r2) {
  const at = (r1 + r2) / 2;
  const dv1 = Math.abs(visViva(mu, r1, at) - vCirc(mu, r1));
  const dv2 = Math.abs(vCirc(mu, r2) - visViva(mu, r2, at));
  return { dv1, dv2, total: dv1 + dv2, transferTime: Math.PI * Math.sqrt(at ** 3 / mu) };
}
