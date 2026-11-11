const KEY = 'orbit.settings.v1';
export const DEFAULTS = { difficulty: 'easy', quality: 'auto', reducedMotion: null };

/** Persisted settings (AGENTS.md section 17; more keys arrive with later stages). Unknown stored keys are dropped. */
export function createSettings(storage) {
  const stored = storage.get(KEY, {}) ?? {};
  const values = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (k in stored) values[k] = stored[k];
  const listeners = new Set();
  return {
    get: (k) => values[k],
    all: () => ({ ...values }),
    set(k, v) {
      if (!(k in DEFAULTS)) throw new Error(`unknown setting: ${k}`);
      if (values[k] === v) return;
      values[k] = v; storage.set(KEY, values);
      for (const fn of listeners) fn(k, v);
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
