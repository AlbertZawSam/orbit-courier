/** Dev hook for the screenshot tool: index.html?debug exposes a few controls on window.__orbit. Inert otherwise. */
export function installDebugHook(api) {
  if (!new URLSearchParams(location.search).has('debug')) return;
  window.__orbit = {
    applySolution() {
      const { level, plan, changed } = api;
      const sol = level().solution;
      plan().setAim({ angle: sol.launch.angle, power: sol.launch.power / level().launch.maxSpeed });
      plan().nodes = sol.nodes.map((n) => ({ t: n.t, dv: [...n.dv] }));
      plan().select(plan().nodes.length ? 0 : -1);
      changed();
    },
    launch: () => api.launch(),
    replay: () => api.replay(),
    cameraMode: () => api.cameraMode(),
    state: () => api.state(),
  };
}
