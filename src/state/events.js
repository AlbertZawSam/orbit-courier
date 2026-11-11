/** Tiny event bus. Game code only emits; audio, HUD, telemetry, tutorial and coach subscribe. */
export function createBus() {
  const handlers = new Map();
  const on = (type, fn) => {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
    return () => handlers.get(type).delete(fn);
  };
  const emit = (type, data = {}) => {
    const e = { type, ...data };
    for (const fn of handlers.get(type) ?? []) fn(e);
    for (const fn of handlers.get('*') ?? []) fn(e);
  };
  return { on, emit };
}
