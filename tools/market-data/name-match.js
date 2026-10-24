/* ==========================================================================
   GROUNDWORK — match a document's development name (a web page slug, a file name, a title) to URA's development name. Pure functions.

   Names are compared as squashed word keys: lower case, "&" as "and", apostrophes dropped ("D'LEEDON" = "dleedon"), "@" and other marks as
   spaces, the words "the", "at", "of", "by", "and" left out, then the words joined with no spaces ("ONE-NORTH" = "one north" = "onenorth").
     exact          the keys are equal                                                          score 1
     qualifiers     equal once qualifier words are dropped from both sides (ec, condominium,     score 0.9
                    condo, enbloc, rental, gls, for, sale, new, launch, showflat)
   A key that fits more than one URA development is AMBIGUOUS and never matched. Nothing fuzzier is tried: a wrong match would read another
   development's floor plans, and the layout check would then have to catch it.
   ========================================================================== */
'use strict';
const STOP = new Set(['the', 'at', 'of', 'by', 'and']);
const QUALIFIERS = new Set(['ec', 'condominium', 'condo', 'enbloc', 'rental', 'gls', 'for', 'sale', 'new', 'launch', 'showflat']);

function words(name) {
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/['’`‘]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !STOP.has(w));
}
const key = (name) => words(name).join('');
const core = (name) => words(name).filter((w) => !QUALIFIERS.has(w)).join('');

// names: URA development names -> match(candidate) = { project, score, how } | { ambiguous: [names], how } | null
function matcher(names) {
  const exact = new Map(), loose = new Map();
  const add = (m, k, n) => { if (!k) return; (m.get(k) || m.set(k, new Set()).get(k)).add(n); };
  names.forEach((n) => { add(exact, key(n), n); add(loose, core(n), n); });
  return function match(candidate) {
    const k = key(candidate), c = core(candidate);
    const e = k && exact.get(k);
    if (e) return e.size === 1 ? { project: Array.from(e)[0], score: 1, how: 'exact' } : { ambiguous: Array.from(e).sort(), how: 'exact' };
    const l = c && loose.get(c);
    if (l) return l.size === 1 ? { project: Array.from(l)[0], score: 0.9, how: 'qualifiers' } : { ambiguous: Array.from(l).sort(), how: 'qualifiers' };
    return null;
  };
}

module.exports = { words, key, core, matcher, STOP, QUALIFIERS };
