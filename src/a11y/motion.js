/** prefers-reduced-motion, with an optional user override (true/false) from settings; null follows the system. */
export function prefersReducedMotion(override = null) {
  if (override !== null && override !== undefined) return !!override;
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
