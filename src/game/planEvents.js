/** Turns changes to the plan (aim, nodes) into bus events, so telemetry and sound hear what the player did. */
export function createPlanEvents({ bus, getPlan }) {
  let prevAim = null, prevNodes = [];
  const copy = (nodes) => nodes.map((n) => ({ t: n.t, dv: [...n.dv] }));
  return {
    /** Forget what was there: call when a new plan is created. */
    sync() { const plan = getPlan(); prevAim = JSON.stringify(plan.aim); prevNodes = []; },
    emit() {
      const plan = getPlan(), aim = JSON.stringify(plan.aim);
      if (aim !== prevAim) { prevAim = aim; bus.emit('aim_changed', { angle: plan.aim.angle, power: plan.aim.power }); }
      const now = plan.nodes;
      if (now.length > prevNodes.length) bus.emit('node_added', { count: now.length });
      else if (now.length < prevNodes.length) bus.emit('node_removed', { count: now.length });
      else if (JSON.stringify(now) !== JSON.stringify(prevNodes)) {
        const moved = now.find((n, i) => JSON.stringify(n) !== JSON.stringify(prevNodes[i])) ?? now[0];
        bus.emit('node_moved', { count: now.length, dv: Math.hypot(...moved.dv), atLimit: plan.fuelLeft() < 1e-9 });
      }
      prevNodes = copy(now);
    },
  };
}
