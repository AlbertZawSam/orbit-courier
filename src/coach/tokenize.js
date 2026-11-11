const STOP = new Set(('a an the is are was were be been being to of in on at for and or it its this that these those with as by from i my me you your do does did how what why when where which who can could should would will am if so we they he she not no but than then there here have has had just too also into about over out up get got game games tell say please thanks thank hello hey know want need').split(' '));

/** Light stemmer: enough to match plurals and -ing/-ed forms without a dictionary. */
export function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Lowercase, strip punctuation, drop stopwords, stem. Digits are kept ("level 2"). */
export function tokenize(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w)).map(stem);
}
