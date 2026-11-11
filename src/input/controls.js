import { hitTest, dvFromPointer } from '../game/plan.js';
import { nodeIndex } from '../sim/nodes.js';

export const AIM_RANGE = 6; // world units of drag that map to full power

/**
 * Game meaning of input: aim the launch, add / select / drag burn nodes, keyboard shortcuts.
 * `ctx` supplies state and side effects so this file stays free of three.js and DOM.
 */
export function createControls(ctx) {
  const { plan } = ctx;
  const infoFor = (i) => ctx.pred().nodeInfo.find((n) => n.idx === nodeIndex(plan.nodes[i].t));
  const canEditNodes = () => ctx.phase() === 'planning' || ctx.phase() === 'flying';

  function onDown(pt) {
    const u = ctx.u();
    const hit = canEditNodes() ? hitTest(plan, ctx.pred(), pt, u, ctx.t0()) : null;
    if (hit?.kind === 'handle') {
      return (p) => {
        const info = infoFor(hit.node);
        if (!info) return;
        const dv = [...plan.nodes[hit.node].dv];
        dv[hit.axis] = dvFromPointer(info, hit.axis, p, u);
        plan.setDv(hit.node, dv); ctx.changed();
      };
    }
    if (hit?.kind === 'node') { plan.select(hit.node); ctx.changed(); return () => {}; }
    if (hit?.kind === 'path') { if (plan.addNode(hit.t) >= 0) ctx.changed(); return () => {}; }
    if (ctx.phase() !== 'planning') return null;
    const aimTo = (p) => {
      const pad = ctx.pad(), dx = p[0] - pad.x, dz = p[1] - pad.z;
      plan.setAim({ angle: Math.atan2(dz, dx), power: Math.hypot(dx, dz) / AIM_RANGE });
      ctx.changed();
    };
    aimTo(pt);
    return aimTo;
  }

  function onKey(e) {
    const k = e.key, fine = e.shiftKey ? 0.01 : 0.05;
    if (k === 'h' || k === 'H') { ctx.toggleCoach(); return true; }
    if (k === 'r' || k === 'R') { ctx.reset(); return true; }
    if (k === 's' || k === 'S') { ctx.toggleSlow(); return true; }
    if (k === 'Enter' || k === ' ') { ctx.launch(); return true; }
    const sel = plan.selected;
    if (k === 'n' || k === 'N') { if (plan.addNode(ctx.nodeTimeDefault()) >= 0) ctx.changed(); return true; }
    if (k === 'Tab' || k === ']' || k === '[') { plan.selectStep(k === '[' || (k === 'Tab' && e.shiftKey) ? -1 : 1); ctx.changed(); return true; }
    if (sel >= 0 && (k === '+' || k === '=' || k === '-' || k === '_')) { plan.nudge(sel, 0, (k === '+' || k === '=' ? 1 : -1) * fine); ctx.changed(); return true; }
    if (sel >= 0 && (k === '.' || k === ',')) { plan.nudge(sel, 1, (k === '.' ? 1 : -1) * fine); ctx.changed(); return true; }
    if (sel >= 0 && (k === 'Delete' || k === 'Backspace')) { plan.removeNode(sel); ctx.changed(); return true; }
    if (ctx.phase() !== 'planning') return false;
    const a = plan.aim;
    if (k === 'ArrowLeft') plan.setAim({ ...a, angle: a.angle - fine });
    else if (k === 'ArrowRight') plan.setAim({ ...a, angle: a.angle + fine });
    else if (k === 'ArrowUp') plan.setAim({ ...a, power: a.power + (e.shiftKey ? 0.003 : 0.02) });
    else if (k === 'ArrowDown') plan.setAim({ ...a, power: a.power - (e.shiftKey ? 0.003 : 0.02) });
    else return false;
    ctx.changed();
    return true;
  }
  return { onDown, onKey };
}
