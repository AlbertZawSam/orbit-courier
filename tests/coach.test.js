import { describe, it, expect } from 'vitest';
import { loadKnowledge } from '../scripts/lib/knowledge.mjs';
import { tokenize, stem } from '../src/coach/tokenize.js';
import { createRetriever, MIN_SCORE, expandQuery } from '../src/coach/retrieve.js';
import { createCoach, SUGGESTIONS } from '../src/coach/coach.js';
import { detectCalc } from '../src/coach/calc-intent.js';
import { vCirc, vEsc, period, hohmann } from '../src/sim/calc.js';
import { LEVELS } from '../src/levels/levels.js';
import { buildLevelSystem } from '../src/game/replay.js';

const { chunks, errors } = loadKnowledge(new URL('../knowledge/', import.meta.url).pathname);
const ids = new Set(chunks.map((c) => c.id));
const L = (id) => LEVELS.find((l) => l.id === id);
const att = (o = {}) => ({ levelId: 'L1', mode: 'easy', tutorial: false, assisted: false, planEdits: 3, previewUsed: true, mapUsed: false, slowmoSeconds: 0, nodes: [], tugs: [], launchAngle: 1.4, launchPower: 5.4, outcome: 'delivered', fuelUsed: 0, seconds: 5, closestApproaches: { kepi: 1.2 }, ...o });
function make(levelId = 'L1', attempts = []) {
  const level = L(levelId), sys = buildLevelSystem(level), state = { attempts };
  const coach = createCoach({ chunks, getContext: () => ({ level, sys, attempts: state.attempts, skill: 'beginner' }) });
  return { coach, level, sys, state };
}

describe('knowledge base', () => {
  it('parses with no errors and has at least 25 chunks', () => {
    expect(errors).toEqual([]);
    expect(chunks.length).toBeGreaterThanOrEqual(25);
    expect(ids.size).toBe(chunks.length);
  });
  it('every chunk has tags, a level, 30-250 words, and a Try line', () => {
    for (const c of chunks) {
      expect(c.tags.length, c.id).toBeGreaterThan(0);
      expect(['beginner', 'intermediate', 'advanced']).toContain(c.level);
      expect(c.words, c.id).toBeGreaterThanOrEqual(30);
      expect(c.words, c.id).toBeLessThanOrEqual(250);
      expect(c.text, c.id).toMatch(/Try:/);
    }
  });
  it('level chunks point at real levels', () => {
    for (const c of chunks.filter((x) => x.id.startsWith('LV-'))) for (const l of c.levels) expect(LEVELS.map((x) => x.id)).toContain(l);
  });
  it('spot-checks formulas and numbers against calc.js', () => {
    const get = (id) => chunks.find((c) => c.id === id).text;
    expect(get('OR-002')).toContain(`about ${vCirc(30, 1.5).toFixed(2)}`);
    expect(get('OR-005')).toContain(`about ${period(30, 1.5).toFixed(1)} seconds`);
    expect(get('OR-003')).toContain(`about ${vEsc(20, 0.8 * 1.05).toFixed(1)}`);
    expect(get('OR-003')).toContain('about 1.41 times');
    expect(Math.sqrt(2)).toBeCloseTo(1.414, 3);
  });
  it('level tips match the stored solutions', () => {
    const l1 = L('L1'), l3 = L('L3'), get = (id) => chunks.find((c) => c.id === id).text;
    expect(get('LV-001')).toContain(`${Math.round((l1.solution.launch.angle * 180) / Math.PI)} degrees`);
    expect(get('LV-003')).toContain(`${l3.par.fuel}`);
    expect(get('LV-003')).toContain(`${l3.solution.nodes[0].t}`);
    for (const id of ['L1', 'L2', 'L3']) expect(get(`LV-00${id[1]}`)).toContain(`${L(id).mission.holdSeconds} seconds`);
  });
});

describe('tokenizer', () => {
  it('lowercases, drops stopwords and punctuation, and stems', () => {
    expect(tokenize('How do I escape the Planet?!')).toEqual(['escape', 'planet']);
    expect(stem('burns')).toBe('burn');
    expect(stem('crashing')).toBe('crash');
    expect(stem('orbit')).toBe('orbit');
    expect(tokenize('level 2')).toEqual(['level', '2']);
  });
});

describe('retrieval', () => {
  const r = createRetriever(chunks);
  const top = (q, opts) => r.retrieve(q, opts).results.map((x) => x.chunk.id);
  it('ranks the obvious guide first', () => {
    const cases = [
      ['how do I add a burn node', 'MA-001'], ['what is a gravity assist', 'SL-001'], ['how do I save fuel', 'SL-002'],
      ['what does periapsis mean', 'OR-004'], ['how many stars can I earn', 'MI-002'], ['how to use slow motion', 'MA-004'],
      ['my probe flew past the moon', 'ER-003'], ['the probe left the map', 'ER-002'], ['what are prograde and retrograde', 'OR-006'],
    ];
    for (const [q, id] of cases) expect(top(q)[0], q).toBe(id);
  });
  it('expands synonyms so plain wording still finds the guide', () => {
    expect(expandQuery('my probe is too fast').expanded.length).toBeGreaterThan(0);
    expect(top('why is it too fast')).toEqual(expect.arrayContaining(['ER-002']));
    expect(top('how can i go faster')).toContain('OR-006');
    expect(top('my probe crashed')[0]).toBe('ER-001');
  });
  it('returns at most 4 results above the threshold for in-scope questions', () => {
    const res = r.retrieve('how do I add a burn node');
    expect(res.results.length).toBeLessThanOrEqual(4);
    expect(res.below).toBe(false);
    expect(res.results[0].score).toBeGreaterThanOrEqual(MIN_SCORE);
  });
  it('is below threshold for unrelated questions', () => {
    for (const q of ['who won the football game', 'what is the capital of france', 'recipe for pasta', 'tell me a joke', 'best pizza near me'])
      expect(r.retrieve(q).below, q).toBe(true);
  });
  it('boosts chunks for the current level', () => {
    const plain = r.retrieve('how do I hold the orbit').results.find((x) => x.chunk.id === 'LV-003');
    const boosted = r.retrieve('how do I hold the orbit', { levelId: 'L3' }).results.find((x) => x.chunk.id === 'LV-003');
    if (plain && boosted) expect(boosted.score).toBeGreaterThan(plain.score);
    expect(r.retrieve('level 3 burn nodes', { levelId: 'L3' }).results[0].boosts).toContain('level');
  });
});

describe('coach intents', () => {
  it('routes by rule, first match wins', () => {
    const { coach } = make();
    const intent = (q) => coach.ask(q).intent;
    expect(intent('what is the circular speed here?')).toBe('calc');
    expect(intent('give me a hint')).toBe('hint');
    expect(intent("I'm stuck")).toBe('hint');
    expect(intent('what went wrong')).toBe('review');
    expect(intent('how can I improve')).toBe('review');
    expect(intent('explain this level')).toBe('explain_level');
    expect(intent('how do I add a burn node')).toBe('knowledge');
    expect(intent('who won the football game')).toBe('out_of_scope');
    expect(detectCalc('what is a gravity assist')).toBeNull();
  });
  it('declines politely, suggests two things, and cites nothing', () => {
    const a = make().coach.ask('who won the football game');
    expect(a.sources).toEqual([]);
    expect(a.text).toContain("I will not guess");
    expect(a.text).toContain(SUGGESTIONS[0]);
    expect(a.text).toContain(SUGGESTIONS[1]);
  });
});

describe('calculators', () => {
  it('uses the level target and band midpoint by default', () => {
    const { coach, level } = make('L2');
    const mid = (level.mission.rMin + level.mission.rMax) / 2;
    const a = coach.ask('what is the circular speed here?');
    expect(a.calc.value).toBeCloseTo(vCirc(30, mid), 12);
    expect(a.text).toContain(vCirc(30, mid).toFixed(2));
    expect(a.text).toContain(vEsc(30, mid).toFixed(2));
    expect(a.sources.map((s) => s.id)).toContain('OR-002');
  });
  it('escape speed, period, an explicit radius, and a named body', () => {
    const { coach } = make('L2');
    expect(coach.ask('escape speed at r = 2').calc.value).toBeCloseTo(vEsc(30, 2), 12);
    expect(coach.ask('what is the orbital period at radius 1.5').calc.value).toBeCloseTo(period(30, 1.5), 12);
    const home = coach.ask('circular speed around Home');
    expect(home.calc.body.id).toBe('home');
    expect(home.calc.value).toBeCloseTo(vCirc(20, 0.8 * 1.05), 12);
  });
  it('hohmann dv matches calc.js', () => {
    const { coach } = make('L2');
    const a = coach.ask('how much dv to go from r = 1 to r = 2');
    const h = hohmann(30, 1, 2);
    expect(a.calc.value).toBeCloseTo(h.total, 12);
    expect(a.text).toContain(h.total.toFixed(2));
  });
});

describe('answer wording', () => {
  it('keeps decimals whole when it quotes sentences, and capitalizes the Try line', () => {
    const { coach } = make('L3', [att({ levelId: 'L3' })]);
    const a = coach.ask('explain this level');
    expect(a.text).not.toMatch(/\d\. \d/);
    for (const q of ['how do I add a burn node', 'explain this level', 'what are the controls']) {
      const line = coach.ask(q).text.split('\n').find((l) => l.startsWith('Try this: '));
      if (line) expect(line.slice(10, 11)).toMatch(/[A-Z]/);
    }
  });
  it('names bodies properly in the launch line', () => {
    const t = make('L1', [att({ outcome: 'crash:kepi' })]).coach.ask('how do I add a burn node').text;
    expect(t).toMatch(/crashed into Kepi/);
  });
});

describe('hints', () => {
  it('never repeats a tier, runs out after three, and resets', () => {
    const { coach, level } = make('L3');
    const seen = [];
    for (let i = 0; i < 3; i++) { const a = coach.ask('hint'); expect(a.tier).toBe(i + 1); expect(a.text).toContain(level.hints[i]); seen.push(a.text.split('\n')[0]); }
    expect(new Set(seen).size).toBe(3);
    const done = coach.ask('hint');
    expect(done.exhausted).toBe(true);
    expect(level.hints.some((h) => done.text.includes(h))).toBe(false);
    coach.resetHints('L3');
    expect(coach.ask('hint').tier).toBe(1);
  });
});

describe('review and findings', () => {
  const crashes = [att({ outcome: 'crash:home', launchAngle: 1.4, launchPower: 4.5 }), att({ outcome: 'crash:home', launchAngle: 1.41, launchPower: 4.5 }), att({ outcome: 'crash:home', launchAngle: 1.42, launchPower: 4.6 }), att({ outcome: 'crash:home', launchAngle: 1.41, launchPower: 4.5 })];
  it('gives exactly 3 things done well and 3 to improve, each with a valid source', () => {
    for (const attempts of [crashes, [att()], [att({ outcome: 'lost', launchPower: 7 })], [att({ outcome: 'delivered', fuelUsed: 0.9, nodes: [{ t: 1, dv: [0.9, 0] }] })]]) {
      const a = make('L1', attempts).coach.review();
      expect(a.findings.good).toHaveLength(3);
      expect(a.findings.improve).toHaveLength(3);
      for (const f of [...a.findings.good, ...a.findings.improve]) expect(ids.has(f.cite.id)).toBe(true);
    }
  });
  it('findings reflect the log', () => {
    expect(make('L1', crashes).coach.review().text).toMatch(/crashed into Home 4 times/);
    expect(make('L1', crashes).coach.review().text).toMatch(/almost the same angle/);
    expect(make('L1', [att({ outcome: 'lost', launchPower: 7 })]).coach.review().text).toMatch(/above the escape speed/);
    expect(make('L1', [att({ fuelUsed: 0.9 })]).coach.review().text).toMatch(/1\.5 times par/);
    expect(make('L1', [att({ fuelUsed: 0 })]).coach.review().text).toMatch(/matched par fuel/);
  });
  it('handles a level with no launches', () => {
    const a = make('L1', []).coach.review();
    expect(a.text).toMatch(/no launches/);
    expect(a.findings.good).toEqual([]);
  });
  it('ignores tutorial attempts and other levels', () => {
    const a = make('L1', [att({ tutorial: true, outcome: 'crash:home' }), att({ levelId: 'L2' })]).coach.review();
    expect(a.text).toMatch(/no launches/);
  });
});

describe('answers', () => {
  const questions = ['how do I add a burn node', 'what is a gravity assist', 'what is the circular speed here?', 'give me a hint', 'explain this level', 'why did I crash', 'what are the controls', 'how do I get three stars', 'my probe left the map', 'what does apoapsis mean'];
  it('always end with valid source ids and mention only real chunks', () => {
    const { coach } = make('L1', [att()]);
    for (const q of questions) {
      const a = coach.ask(q);
      expect(a.sources.length, q).toBeGreaterThan(0);
      const last = a.text.split('\n').pop();
      expect(last.startsWith('Sources:'), q).toBe(true);
      for (const s of a.sources) { expect(ids.has(s.id), q).toBe(true); expect(last).toContain(`[${s.id}]`); }
    }
  });
  it('stays around 120 words', () => {
    const { coach } = make('L1', [att()]);
    for (const q of questions) if (!/review/.test(q)) expect(coach.ask(q).text.split(/\s+/).length, q).toBeLessThanOrEqual(150);
  });
  it('gives different output for different launch logs', () => {
    const a = make('L1', [att({ outcome: 'crash:home' })]).coach.ask('how do I add a burn node').text;
    const b = make('L1', [att(), att()]).coach.ask('how do I add a burn node').text;
    const none = make('L1', []).coach.ask('how do I add a burn node').text;
    expect(a).not.toBe(b);
    expect(a).toMatch(/crashed into Home/);
    expect(b).toMatch(/2 attempts here \(2 delivered\)/);
    expect(none).not.toMatch(/Your launches/);
  });
  it('exposes retrieved titles and scores for a "why this answer" view', () => {
    const a = make().coach.ask('how do I add a burn node');
    expect(a.retrieved[0]).toMatchObject({ id: 'MA-001' });
    expect(a.retrieved[0].score).toBeGreaterThan(0);
  });
});

describe('generated knowledge file', () => {
  it('is committed and in sync with knowledge/*.md (run `npm run kb` after editing a guide)', async () => {
    const { readFileSync } = await import('node:fs');
    const generated = JSON.parse(readFileSync(new URL('../src/coach/kb.generated.json', import.meta.url), 'utf8'));
    expect(generated).toEqual(JSON.parse(JSON.stringify(chunks)));
  });
});
