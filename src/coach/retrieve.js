import { createIndex } from './bm25.js';
import { tokenize } from './tokenize.js';

export const MIN_SCORE = 3.0;   // below this the coach says it does not know
export const TOP_K = 4;
export const LEVEL_BOOST = 1.3, SKILL_BOOST = 1.2, TUTORIAL_BOOST = 1.5;

/** Phrase (matched in the raw question) -> extra terms that the guides actually use. */
export const SYNONYMS = {
  'too fast': ['escape', 'speed', 'overshoot'],
  'too slow': ['escape', 'speed', 'power'],
  'crash': ['periapsis', 'collision', 'surface'],
  'crashed': ['periapsis', 'collision', 'surface'],
  'hit the': ['crash', 'collision'],
  'save fuel': ['slingshot', 'hohmann', 'efficient'],
  'use less fuel': ['slingshot', 'efficient', 'fuel'],
  'when to launch': ['window', 'map'],
  'when should i launch': ['window', 'map'],
  'fly past': ['flyby', 'overshoot', 'speed'],
  'flew past': ['flyby', 'overshoot', 'speed'],
  'go past': ['flyby', 'overshoot', 'speed'],
  'stay in orbit': ['band', 'hold', 'circular'],
  'keep orbit': ['band', 'hold', 'circular'],
  'lose orbit': ['band', 'hold', 'ellipse'],
  'slow down': ['retrograde', 'brake', 'capture'],
  'speed up': ['prograde', 'burn'],
  'go faster': ['prograde', 'burn'],
  'orbit': ['circular'],
  'circle': ['circular', 'orbit'],
  'lost': ['map', 'bounds', 'escape'],
  'leave the map': ['lost', 'bounds', 'escape'],
  'gravity assist': ['slingshot', 'flyby'],
  'fine tune': ['fine', 'adjust', 'shift'],
  'precise': ['fine', 'adjust', 'shift'],
  'stars': ['score', 'payout', 'par'],
  'points': ['score', 'payout', 'par'],
  'score': ['stars', 'payout', 'par'],
  'keys': ['controls', 'keyboard'],
  'buttons': ['controls', 'keyboard'],
  'how do i play': ['controls', 'aim', 'launch'],
  'win': ['mission', 'deliver', 'band'],
  'goal': ['mission', 'deliver', 'target'],
  'node': ['burn'],
  'dv': ['delta-v', 'fuel', 'burn'],
  'delta v': ['delta-v', 'fuel', 'burn'],
};

/** Question -> query tokens (own words plus synonym expansions). */
export function expandQuery(question) {
  const q = question.toLowerCase();
  const extra = [];
  for (const [phrase, terms] of Object.entries(SYNONYMS)) {
    const re = new RegExp(`(^|[^a-z])${phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}($|[^a-z])`);
    if (re.test(q)) extra.push(...terms);
  }
  return { tokens: tokenize(question), expanded: tokenize(extra.join(' ')) };
}

/**
 * @param {object[]} chunks
 * @returns {{retrieve: (question:string, opts?:{levelId?:string, skill?:string, tutorial?:boolean}) => {results:object[], below:boolean, tokens:string[]}}}
 */
export function createRetriever(chunks) {
  const index = createIndex(chunks);
  return {
    index,
    retrieve(question, { levelId = null, skill = null, tutorial = false } = {}) {
      const { tokens, expanded } = expandQuery(question);
      const raw = index.search([...tokens, ...expanded]).map(({ chunk, score }) => {
        let s = score;
        const boosts = [];
        if (levelId && chunk.levels.includes(levelId)) { s *= LEVEL_BOOST; boosts.push('level'); }
        if (skill && chunk.level === skill) { s *= SKILL_BOOST; boosts.push('skill'); }
        if (tutorial && chunk.id.startsWith('TU-')) { s *= TUTORIAL_BOOST; boosts.push('tutorial'); }
        return { chunk, score: s, base: score, boosts };
      }).sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
      const results = raw.slice(0, TOP_K);
      return { results, below: !results.length || results[0].score < MIN_SCORE, tokens: [...tokens, ...expanded] };
    },
  };
}
