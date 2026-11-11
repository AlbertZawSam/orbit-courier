/** DOM labels pinned to world points (atlas-style annotations). Positions follow the camera every frame. */
export function createLabels(root, camera, vec3) {
  const items = new Map();
  const p = vec3.clone();
  return {
    /** Create or move a label. `cls` picks a style variant. */
    set(key, x, z, text, cls = '') {
      let it = items.get(key);
      if (!it) { const el = document.createElement('div'); el.className = 'atlas-label'; root.appendChild(el); it = { el, x, z, text: '' }; items.set(key, it); }
      it.x = x; it.z = z;
      if (it.text !== text) { it.el.textContent = text; it.text = text; }
      it.el.dataset.cls = cls;
    },
    remove(key) { const it = items.get(key); if (it) { it.el.remove(); items.delete(key); } },
    removePrefix(prefix) { for (const k of [...items.keys()]) if (k.startsWith(prefix)) this.remove(k); },
    update() {
      const w = root.clientWidth, h = root.clientHeight;
      for (const it of items.values()) {
        p.set(it.x, 0, it.z).project(camera);
        const visible = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
        it.el.style.display = visible ? 'block' : 'none';
        if (visible) it.el.style.transform = `translate(${((p.x + 1) / 2) * w + 8}px, ${((1 - p.y) / 2) * h - 8}px)`;
      }
    },
  };
}
