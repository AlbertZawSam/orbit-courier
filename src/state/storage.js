/** localStorage wrapped in try/catch with an in-memory fallback (private windows, blocked storage, file:// quirks). */
export function createStorage(prefix = '') {
  const memory = new Map();
  let ls = null;
  try { ls = typeof localStorage !== 'undefined' ? localStorage : null; if (ls) { ls.setItem('__probe__', '1'); ls.removeItem('__probe__'); } } catch { ls = null; }
  return {
    get persistent() { return ls !== null; },
    get(key, fallback = null) {
      const k = prefix + key;
      try {
        const raw = ls ? ls.getItem(k) : memory.get(k);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      const k = prefix + key, raw = JSON.stringify(value);
      try { if (ls) ls.setItem(k, raw); else memory.set(k, raw); } catch { memory.set(k, raw); }
    },
    remove(key) { const k = prefix + key; try { ls?.removeItem(k); } catch { /* ignore */ } memory.delete(k); },
  };
}
