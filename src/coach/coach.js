import { createRetriever } from './retrieve.js';
import { detectCalc, answerCalc } from './calc-intent.js';
import { summarize } from './stats.js';
import { buildFindings } from './findings.js';
import { missionGoal } from '../sim/missionText.js';

const MAX_WORDS = 120;
// Split on sentence ends only (a full stop followed by a capital), so decimals like 6.4 stay whole.
const sentences = (t) => t.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z])/);
const upper = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const clip = (text, n) => { const w = text.split(/\s+/); return w.length <= n ? text : w.slice(0, n).join(' ') + '...'; };
const split = (chunk) => {
  const paras = chunk.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const tryP = paras.find((p) => p.startsWith('Try:'));
  return { body: paras.filter((p) => !p.startsWith('Try:')).join(' '), tryLine: tryP ? upper(tryP.slice(4).trim()) : null };
};
const src = (chunk) => ({ id: chunk.id, title: chunk.title, file: chunk.file });

export const SUGGESTIONS = ['How do I add a burn node?', 'What is the circular speed here?', 'Why did I crash?'];

/**
 * Navigator: an offline, rule-based coach. No network and no LLM: guides (BM25), calculators and the launch log.
 * `getContext()` returns { level, sys, attempts, skill }.
 */
export function createCoach({ chunks, getContext }) {
  const retriever = createRetriever(chunks);
  const byId = Object.fromEntries(chunks.map((c) => [c.id, c]));
  const hintTier = {};

  const cite = (query, ctx, n = 1) => retriever.retrieve(query, { levelId: ctx.level.id, skill: ctx.skill }).results.slice(0, n).map((r) => r.chunk);
  const logLine = (ctx) => {
    const s = summarize(ctx.level.id, ctx.attempts, ctx.level);
    if (!s.attempts) return null;
    const name = (id) => ctx.sys.byId[id]?.name ?? id;
    const o = s.lastOutcome;
    const last = o === 'delivered' ? 'delivered' : o.startsWith('crash:') ? `crashed into ${name(o.slice(6))}` : o === 'lost' ? 'left the map' : 'ran out of time';
    return `${s.attempts} attempt${s.attempts === 1 ? '' : 's'} here (${s.delivered} delivered); the last one ${last}.`;
  };
  const finish = (intent, parts, chunksUsed, extra = {}) => {
    const sources = [...new Map(chunksUsed.map((c) => [c.id, src(c)])).values()].slice(0, 3);
    const lines = [];
    if (parts.short) lines.push(`Short answer: ${parts.short}`);
    if (parts.tryLine) lines.push(`Try this: ${parts.tryLine}`);
    if (parts.launches) lines.push(`Your launches: ${parts.launches}`);
    if (sources.length) lines.push(`Sources: ${sources.map((s) => `[${s.id}] ${s.file}`).join(', ')}`);
    return { intent, text: lines.join('\n'), parts, sources, ...extra };
  };
  const decline = () => ({
    intent: 'out_of_scope', sources: [], parts: {},
    text: `I do not have that in my guides, so I will not guess. I can help with things like:\n- ${SUGGESTIONS[0]}\n- ${SUGGESTIONS[1]}`,
  });

  function knowledge(question, ctx) {
    const r = retriever.retrieve(question, { levelId: ctx.level.id, skill: ctx.skill });
    if (r.below) return decline();
    const top = r.results[0].chunk, { body, tryLine } = split(top);
    const tryFrom = tryLine ?? r.results.slice(1).map((x) => split(x.chunk).tryLine).find(Boolean) ?? null;
    return finish('knowledge', { short: clip(sentences(body).slice(0, 2).join(' '), 55), tryLine: tryFrom && clip(tryFrom, 30), launches: logLine(ctx) }, r.results.map((x) => x.chunk),
      { retrieved: r.results.map((x) => ({ id: x.chunk.id, title: x.chunk.title, score: Number(x.score.toFixed(2)), boosts: x.boosts })) });
  }

  function calc(kind, question, ctx) {
    const a = answerCalc(kind, question, ctx);
    const used = a.sources.map((id) => byId[id]).filter(Boolean);
    return finish('calc', { short: a.lines.join(' '), tryLine: 'Compare that number with the speed shown in the HUD while you aim.', launches: logLine(ctx) }, used, { calc: a });
  }

  function hint(ctx) {
    const id = ctx.level.id, i = hintTier[id] ?? 0;
    const hints = ctx.level.hints;
    if (i >= hints.length) {
      return finish('hint', { short: 'That was all three hints for this level.', tryLine: 'Ask me to review your launches for specific advice.', launches: logLine(ctx) }, cite(ctx.level.tags.join(' '), ctx, 2), { tier: hints.length, exhausted: true });
    }
    hintTier[id] = i + 1;
    return finish('hint', { short: `Hint ${i + 1} of ${hints.length}: ${hints[i]}`, launches: logLine(ctx) }, cite(`${hints[i]} ${ctx.level.tags.join(' ')}`, ctx, 2), { tier: i + 1 });
  }

  function review(ctx) {
    const s = summarize(ctx.level.id, ctx.attempts, ctx.level);
    if (!s.attempts) {
      return finish('review', { short: 'You have no launches on this level yet, so there is nothing to review.', tryLine: 'Make a launch, then ask again.' }, cite('launch angle power', ctx, 1), { findings: { good: [], improve: [] } });
    }
    const f = buildFindings(s, ctx.level, ctx.sys);
    const withCite = (list) => list.map((x) => ({ ...x, cite: cite(x.query, ctx, 1)[0] }));
    const findings = { good: withCite(f.good), improve: withCite(f.improve) };
    const render = (list) => list.map((x) => `- ${x.text} [${x.cite.id}]`).join('\n');
    const text = `Review of ${ctx.level.name} (${logLine(ctx)})\nWent well:\n${render(findings.good)}\nTo improve:\n${render(findings.improve)}`;
    const used = [...findings.good, ...findings.improve].map((x) => x.cite);
    const sources = [...new Map(used.map((c) => [c.id, src(c)])).values()];
    return { intent: 'review', text: `${text}\nSources: ${sources.map((s) => `[${s.id}] ${s.file}`).join(', ')}`, parts: {}, sources, findings, summary: s };
  }

  function explainLevel(ctx) {
    const lv = chunks.find((c) => c.id.startsWith('LV-') && c.levels.includes(ctx.level.id));
    const m = ctx.level.mission;
    const goal = `Goal: ${missionGoal(m, (id) => ctx.sys.byId[id]?.name ?? id)}. You have ${ctx.level.fuel} fuel and ${ctx.level.maxNodes} burn node${ctx.level.maxNodes === 1 ? '' : 's'}; par is ${ctx.level.par.fuel} fuel.`;
    if (!lv) return finish('explain_level', { short: goal, launches: logLine(ctx) }, cite(ctx.level.tags.join(' '), ctx, 1));
    const { body, tryLine } = split(lv);
    return finish('explain_level', { short: `${goal} ${clip(sentences(body).slice(1, 3).join(' '), 45)}`, tryLine, launches: logLine(ctx) }, [lv, ...cite('orbit band hold mission', ctx, 1)]);
  }

  /** Rule-based routing, first match wins. */
  function ask(question) {
    const q = question.trim(), ctx = getContext();
    if (!q) return decline();
    const lower = q.toLowerCase();
    const calcKind = detectCalc(lower);
    if (calcKind) return calc(calcKind, q, ctx);
    if (/\bhint\b|i'?m stuck|\bstuck\b|give me a clue|\bclue\b/.test(lower)) return hint(ctx);
    if (/what went wrong|how can i improve|how do i improve|review|my (launches|attempts|runs?)\b|how am i doing/.test(lower)) return review(ctx);
    if (/(explain|about|describe|tell me about) (this |the )?level|how (do i|to) (beat|solve|win|finish|complete) (this|the) level|what (do i|should i) do (here|in this level)/.test(lower)) return explainLevel(ctx);
    return knowledge(q, ctx);
  }

  return { ask, hint: () => hint(getContext()), review: () => review(getContext()), explainLevel: () => explainLevel(getContext()), resetHints: (id) => { delete hintTier[id]; }, chunkById: (id) => byId[id] ?? null, retriever };
}
