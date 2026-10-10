/* KPT FIND V1: "Developments worth investigating". A deterministic, explainable shortlist for the Buyer's second page.
 * Pure functions. Reads only: the buyer's budget / answers, the existing budget engine's route statistics (typical size), and data/projects/find.json
 * (ACTUAL price quartiles per project, sale type and 100 sqft band for the last 12 months; see tools/market-data/build-find-index.js).
 *
 * V10 (find-v2) adds an OPTIONAL Huttons inventory layer for New launch (data/projects/inventory.json, schema v2: price floors by 100 sqft band, one ceiling per type,
 * rounded to $50k, no counts). With no usable inventory file every output is identical to V9.1 (version string aside).
 *
 * What it is NOT: a recommendation, a valuation, a ranking of quality or value, or an indication of current availability.
 * There is no score. Order is: evidence strength, budget fit, matching recent sales, recency, then name A to Z.
 * Bedrooms are never inferred and never converted to square feet. School, workplace and family proximity are never evaluated.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPT_FIND = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 'find-v2';
  // Thresholds (all in one place so tests and the methodology read the same numbers).
  const T = { budgetPct: 0.10, widenBudgetPct: 0.15, minSales: 3, goodSales: 5, minActiveMonths: 2, recencyMonths: 6, perStreet: 2, maxCards: 5, bothResale: 3, bothNew: 2, sizePad: 100,
    inferMinDeals: 15, referenceStep: 50000, referenceMaxUp: 0.5,
    invFreshHours: 48, invMaxDays: 7, invFutureMs: 3600000, invBand: 100, invSchema: 2, moreMax: 5, maxMessage: 400 };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Reviewed district to general-area names. UI orientation only: a district contains places not named here, and no project is ever said to be "in" a named neighbourhood.
  const DISTRICT_AREAS = {
    '01': 'Raffles Place, Marina', '02': 'Tanjong Pagar', '03': 'Queenstown, Tiong Bahru', '04': 'Telok Blangah, Harbourfront', '05': 'Pasir Panjang, Clementi', '06': 'City Hall, High Street',
    '07': 'Bugis, Golden Mile', '08': 'Little India', '09': 'Orchard, River Valley', '10': 'Bukit Timah, Holland, Tanglin', '11': 'Novena, Thomson', '12': 'Balestier, Toa Payoh',
    '13': 'Macpherson, Potong Pasir', '14': 'Geylang, Eunos', '15': 'Katong, Joo Chiat', '16': 'Bedok, Upper East Coast', '17': 'Changi, Loyang', '18': 'Tampines, Pasir Ris',
    '19': 'Hougang, Punggol, Serangoon Gardens', '20': 'Bishan, Ang Mo Kio', '21': 'Upper Bukit Timah, Clementi Park', '22': 'Jurong', '23': 'Bukit Batok, Bukit Panjang, Choa Chu Kang',
    '24': 'Lim Chu Kang, Tengah', '25': 'Woodlands, Kranji', '26': 'Upper Thomson, Springleaf', '27': 'Yishun, Sembawang', '28': 'Seletar',
  };
  const districtLabel = (d) => 'District ' + Number(d) + ' · generally ' + (DISTRICT_AREAS[d] || '');
  const districtShort = (d) => 'D' + Number(d) + ' · ' + (DISTRICT_AREAS[d] || '');

  const num = (n) => Math.round(n).toLocaleString('en-US');
  const m2 = (v) => '$' + (Math.round(v / 10000) / 100).toFixed(2).replace(/0$/, '').replace(/\.0$/, '') + 'm';       // $1.8m, $1.67m, $2.05m
  const p2 = (v) => '$' + (Math.round(v / 10000) / 100).toFixed(2) + 'm';                                            // price ranges always show two decimals: $1.90m
  const ymLabel = (ym) => MON[ym % 100 - 1] + ' ' + Math.floor(ym / 100);
  const monthsBetween = (a, b) => (Math.floor(a / 100) - Math.floor(b / 100)) * 12 + (a % 100) - (b % 100);   // a, b as YYYYMM
  const sizeText = (lo, hi) => num(lo) + '–' + num(hi) + ' sqft';

  // Same name styling as the Research page (a test keeps the two identical for every project name).
  const ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/, ACRONYMS = { AMO: 1, RVG: 1, JLB: 1, OUE: 1, PLQ: 1, SCK: 1, SKT: 1, TMW: 1, YGK: 1, MKZ: 1 };
  const NAME_FIX = { 'VERD\uFFFD JOO CHIAT': 'Verdé Joo Chiat', 'ENCHANT\uFFFD': 'Enchanté' };   // reviewed, exact-match, display only: URA's own source name lost the accented letter
  function displayName(name) {
    if (Object.prototype.hasOwnProperty.call(NAME_FIX, name)) return NAME_FIX[name];
    const SMALL = { AT: 1, OF: 1, THE: 1, BY: 1, ON: 1 };
    return String(name || '').split(' ').map((w, i) => {
      if (w === '@' || /\d/.test(w) || ROMAN.test(w) || ACRONYMS[w]) return w;
      if (i > 0 && SMALL[w]) return w.toLowerCase();
      if (w.length <= 2 && /^[A-Z]+$/.test(w)) return w;
      return w.toLowerCase().replace(/(^|[-'(])([a-z])/g, (_, x, y) => x + y.toUpperCase());
    }).join(' ');
  }

  /* ---------------------------------------------------------------- index */
  /** Normalise find.json into project records with rows grouped by sale type. Returns null when the file is not usable. */
  /** Projects kept out of FIND on purpose. Pinery Residences: unresolved Huttons (D18) vs URA (D16) identity mismatch, and not in verified Huttons inventory.
   *  Targeted only: remove an id here once the identity is resolved. It does not change eligibility, ranking or matching for any other project. */
  const FIND_EXCLUDED = ['pinery-residences'];
  function prepare(doc) {
    if (!doc || doc.kind !== 'kpt-find-index' || doc.v !== 1 || !Array.isArray(doc.projects) || !/^\d{4}-\d{2}$/.test(doc.latestMonth || '')) return null;
    const latest = Number(doc.latestMonth.replace('-', ''));
    const projects = doc.projects.filter((p) => !(p && FIND_EXCLUDED.indexOf(p.id) > -1));
    return { latest, latestMonth: doc.latestMonth, window: doc.window, minCell: doc.minCell, bin: doc.bin || 100, projects, districts: Array.from(new Set(projects.map((p) => p.d))).sort() };
  }

  /* ---------------------------------------------------------------- size */
  /** Typical size at this budget from the EXISTING budget engine's route statistics (step = the shard step the page already loaded).
   *  Among routes in scope for the buyer's new/resale choice, the one with the most sales in the narrow budget window, if it has enough sales; otherwise all private sales. */
  function inferSize(step, openTo) {
    const U = step && step.private; if (!U) return null;
    const inScope = Object.keys(U.routes || {}).filter((k) => openTo === 'new' ? /\|New\|/.test(k) : openTo === 'resale' ? /\|Resale\|/.test(k) : true)
      .map((k) => ({ k, a: U.routes[k].n })).filter((x) => x.a).sort((a, b) => b.a[0] - a.a[0] || (a.k < b.k ? -1 : 1));
    const best = inScope[0], tot = U.total && U.total.n, scoped = openTo === 'new' || openTo === 'resale';
    // V10.3.6: a New launch or Resale size comes only from that sale type's own routes. When no single route has enough sales, the routes of that type alone are pooled (sales-weighted); the all-sales total is never used for them.
    let use = best && best.a[0] >= T.inferMinDeals ? { a: best.a, source: 'route' } : null;
    if (!use && scoped) {
      const ok = inScope.filter((x) => x.a[5] > 0 && x.a[6] > x.a[5]), N = ok.reduce((a, x) => a + x.a[0], 0);
      if (N >= T.inferMinDeals) use = { a: [N, 0, 0, 0, 0, ok.reduce((a, x) => a + x.a[0] * x.a[5], 0) / N, ok.reduce((a, x) => a + x.a[0] * x.a[6], 0) / N], source: 'scope' };
    } else if (!use) use = tot ? { a: tot, source: 'all' } : null;
    if (!use) return null;
    const lo = Math.round(use.a[5] / 10) * 10, hi = Math.round(use.a[6] / 10) * 10;
    return lo > 0 && hi > lo ? { lo, hi, source: use.source, n: use.a[0] } : null;
  }
  /** explicit: {from, to} typed by the buyer (sqft). Otherwise the engine's typical size. Bedrooms are never converted. */
  function sizeWindow(explicit, step, openTo, opts) {
    if (explicit && explicit.from >= 100 && explicit.to > explicit.from && explicit.to <= 20000)
      return { lo: Math.round(explicit.from), hi: Math.round(explicit.to), source: 'explicit', line: 'Size: ' + sizeText(Math.round(explicit.from), Math.round(explicit.to)) + (explicit.widened ? ' (nearby sizes included)' : ' (your range)') };
    const s = inferSize(step, openTo); if (!s) return null;
    return inferredWindow(s, opts);
  }
  /** One inferred window from one inferSize() result. V10.3.1: "More space" extends it upward by one band. V10.3.6: opts.pad widens it both ways (the buyer's "Include nearby sizes" when two windows are in use). A size the buyer typed is never changed (handled above). */
  function inferredWindow(s, opts) {
    const pad = opts && opts.pad ? T.sizePad : 0, lo = s.lo - pad, hi = s.hi + pad + (opts && opts.space ? T.sizePad : 0), near = pad ? ' (nearby sizes included)' : '';
    if (opts && opts.space) return { lo, hi, source: 'inferred', basis: s.source, extended: true, line: 'Size: about ' + sizeText(lo, hi) + near + ', extended upward because you chose More space. You didn’t give a size in square feet, so we started from the sizes that typically sold at this budget. We don’t convert bedrooms into square feet.' };
    return { lo, hi, source: 'inferred', basis: s.source, line: 'Size: about ' + sizeText(lo, hi) + near + '. You didn’t give a size in square feet, so we used the sizes that typically sold at this budget. We don’t convert bedrooms into square feet.' };
  }
  /** V10.3.6: the size window for each sale type the buyer is open to. A size the buyer typed is one window for both. Otherwise New launch and Resale each get a window worked out from that sale type's own sales; one never feeds the other.
   *  Returns { sizes: { resale?, new? }, size, mixed }. `size` is the single window to show (null when nothing could be worked out); with two different windows it is an envelope marked mixed and is never used for matching. */
  function sizeWindows(explicit, step, openTo, opts) {
    const types = saleTypes(openTo), sizes = {};
    if (explicit && explicit.from >= 100 && explicit.to > explicit.from && explicit.to <= 20000) { const w = sizeWindow(explicit, step, openTo, opts); types.forEach((t) => { sizes[t] = w; }); return { sizes, size: w, mixed: false }; }
    types.forEach((t) => { const x = inferSize(step, t); if (x) sizes[t] = inferredWindow(x, opts); });
    const ks = Object.keys(sizes); if (!ks.length) return { sizes, size: null, mixed: false };
    if (ks.length === 1) return { sizes, size: sizes[ks[0]], mixed: false };
    const a = sizes.resale, b = sizes.new;
    if (a.lo === b.lo && a.hi === b.hi) return { sizes, size: a, mixed: false };
    return { sizes, mixed: true, size: { lo: Math.min(a.lo, b.lo), hi: Math.max(a.hi, b.hi), source: 'inferred', basis: 'separate', mixed: true, extended: !!(a.extended || b.extended), line: 'Sizes: the sizes that typically sold at this budget, worked out separately for new launches and resale. We don’t convert bedrooms into square feet.' } };
  }

  /* ---------------------------------------------------------------- area */
  function words(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean); }
  /* Reviewed alias table (approved by Ken, 6 Oct 2026). Postal DISTRICTS only, never distance and never planning areas.
   * One district = offered as a single suggestion. Two or more = the buyer must choose. A place that is not listed (for example Kallang) is unresolved: the buyer is asked to choose a district.
   * Whole contiguous phrases only; the longest phrase wins ("Serangoon Gardens" beats "Serangoon"). No fuzzy matching and no single-word fragments. */
  const AREA_ALIASES = [
    ['01', ['Raffles Place', 'Marina Bay', 'Marina Centre', 'Marina South', 'Marina', 'Shenton Way']], ['02', ['Tanjong Pagar', 'Chinatown']],
    ['03', ['Queenstown', 'Tiong Bahru', 'Alexandra', 'Redhill', 'Commonwealth', 'Dawson']], ['04', ['Telok Blangah', 'Harbourfront', 'Mount Faber', 'Sentosa', 'Sentosa Cove']],
    ['05', ['Pasir Panjang', 'Buona Vista', 'one-north', 'one north', 'Dover', 'Ghim Moh', 'Kent Ridge', 'West Coast']], ['06', ['City Hall', 'High Street', 'Clarke Quay']],
    ['07', ['Bugis', 'Golden Mile', 'Beach Road', 'Bras Basah']], ['08', ['Little India', 'Farrer Park', 'Lavender']], ['09', ['Orchard', 'Orchard Road', 'River Valley', 'Somerset', 'Cairnhill']],
    ['10', ['Holland', 'Holland Village', 'Holland Road', 'Tanglin']], ['11', ['Novena', 'Newton']], ['12', ['Toa Payoh', 'Balestier', 'Boon Keng', 'Bendemeer', 'Whampoa']],
    ['13', ['Macpherson', 'Potong Pasir', 'Woodleigh']], ['14', ['Geylang', 'Eunos', 'Paya Lebar', 'Ubi', 'Aljunied', 'Sims Avenue']],
    ['15', ['Katong', 'Joo Chiat', 'Marine Parade', 'Tanjong Rhu', 'Mountbatten', 'Amber Road']], ['16', ['Bedok', 'Upper East Coast', 'Siglap', 'Kembangan', 'Bayshore']],
    ['17', ['Changi', 'Loyang', 'Upper Changi', 'Flora']], ['18', ['Tampines', 'Pasir Ris']],
    ['19', ['Hougang', 'Punggol', 'Serangoon Gardens', 'Sengkang', 'Kovan', 'Buangkok', 'Lorong Chuan', 'Tai Seng']], ['20', ['Bishan', 'Ang Mo Kio', 'AMK', 'Marymount', 'Braddell']],
    ['21', ['Upper Bukit Timah', 'Clementi Park', 'Beauty World']], ['22', ['Jurong', 'Jurong East', 'Jurong West', 'Boon Lay', 'Lakeside', 'Chinese Garden']],
    ['23', ['Bukit Batok', 'Bukit Panjang', 'Choa Chu Kang', 'CCK', 'Bukit Gombak', 'Hillview', 'Dairy Farm']], ['24', ['Lim Chu Kang', 'Tengah']],
    ['25', ['Woodlands', 'Kranji', 'Admiralty', 'Marsiling']], ['26', ['Upper Thomson', 'Springleaf', 'Lentor']], ['27', ['Yishun', 'Sembawang', 'Khatib', 'Canberra']], ['28', ['Seletar']],
  ];
  // Places that sit in more than one district: the buyer chooses.
  const AREA_CHOICES = [['Thomson', ['11', '26']], ['Clementi', ['05', '21']], ['Bukit Timah', ['10', '21']], ['East Coast', ['15', '16']], ['Bukit Merah', ['03', '04']], ['CBD', ['01', '02']],
    ['Serangoon', ['12', '19']], ['Yio Chu Kang', ['26', '28']]];
  const ALIAS_LIST = [].concat.apply([], AREA_ALIASES.map((r) => r[1].map((n) => ({ name: n, key: words(n).join(' '), d: [r[0]] })))).concat(AREA_CHOICES.map((r) => ({ name: r[0], key: words(r[0]).join(' '), d: r[1].slice() })));
  /** Resolve free text to districts. Returns { kind: 'single'|'several'|'none', districts: ['20'], places: ['Ang Mo Kio'] }. Never throws. */
  function resolveArea(text) {
    const norm = ' ' + words(text).join(' ') + ' ', hits = [];
    ALIAS_LIST.forEach((a) => { let from = 0, at; while ((at = norm.indexOf(' ' + a.key + ' ', from)) > -1) { hits.push({ a, start: at, end: at + a.key.length + 2 }); from = at + 1; } });
    const keep = hits.filter((h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && (o.end - o.start) > (h.end - h.start)));
    const places = [], ds = [];
    keep.forEach((h) => { if (places.indexOf(h.a.name) < 0) places.push(h.a.name); h.a.d.forEach((d) => { if (ds.indexOf(d) < 0) ds.push(d); }); });
    ds.sort();
    return { kind: !ds.length ? 'none' : ds.length === 1 ? 'single' : 'several', districts: ds, places };
  }
  /** District suggestions for typed text. Shown as chips to confirm; never applied silently. */
  function matchDistricts(text) { return resolveArea(text).districts; }
  const textMatch = (p, text) => { const q = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim(); return !q || q.length < 3 || (p.name + ' ' + p.street).toLowerCase().indexOf(q) > -1; };

  /* ---------------------------------------------------------------- unsupported answers */
  /* V10.3.3: the questionnaire's bedroom answer -> Huttons bedroom numbers (5 = "5+"). "3BR + Study / larger" means 3 bedrooms or larger for matching only; our data cannot say whether any home has a study. Not sure / unknown = no bedroom matching. */
  const BED_MAP = { '1br': [1], '2br': [2], '3br': [3], '3br-study': [3, 4, 5], '4br-plus': [4, 5] };
  const bedsFor = (size) => (Object.prototype.hasOwnProperty.call(BED_MAP, size) ? BED_MAP[size].slice() : null);
  const BED_WORDS = { '1br': '1 bedroom', '2br': '2 bedrooms', '3br': '3 bedrooms', '3br-study': '3 bedrooms or larger', '4br-plus': '4 bedrooms or larger' };
  const BASE_NOT_EVAL = ['bedrooms and layout', 'floor and facing', 'whether any unit is for sale', 'asking prices'];
  const BASE_NOT_EVAL_NEW = ['bedrooms and layout', 'floor and facing', 'whether the developer still has units to sell', 'asking prices'];
  /** What the buyer chose that sales data cannot evaluate. Nothing here is ever used to filter, except the district the buyer confirmed.
   *  ctx (optional): { districts: ['20'], skipped: bool }  the area the buyer confirmed, or that they chose not to narrow by area. */
  function unsupported(a, ctx) {
    a = a || {}; ctx = ctx || {}; const out = [], pr = a.priorities || [], ds = ctx.districts || [];
    const dtxt = ds.length ? (ds.length === 1 ? 'District ' + Number(ds[0]) : 'Districts ' + ds.map(Number).join(' and ')) : '';
    const dist = (what, card) => ds.length ? 'We narrowed the list to ' + dtxt + ' (generally ' + ds.map((d) => DISTRICT_AREAS[d]).join('; ') + ') because of the area you chose. Our sales data can’t show distance to ' + what + ', so a district is as close as this list gets.'
      : ctx.skipped ? 'Our sales data can’t show distance to ' + what + ', and the list isn’t narrowed by area, so it covers all of Singapore.' : 'Our sales data can’t show distance to ' + what + ', so this list doesn’t consider it.';
    if (a.where === 'areas') out.push({ id: 'areas', title: 'Specific area', text: ds.length ? 'We narrowed the list to ' + dtxt + ' (generally ' + ds.map((d) => DISTRICT_AREAS[d]).join('; ') + '). A district contains places not named here, so this doesn’t reach street or neighbourhood level.' : ctx.skipped ? 'The list isn’t narrowed by area, so it covers all of Singapore.' : 'Choose an area to narrow the list.', card: 'your exact area within the district' });
    if (a.where === 'school') out.push({ id: 'school', title: 'Near a particular school', text: dist('schools'), card: 'how close this is to your school' });
    if (a.where === 'family') out.push({ id: 'family', title: 'Near family', text: dist('where your family lives'), card: 'how close this is to your family' });
    if (a.where === 'work') out.push({ id: 'work', title: 'Near work', text: dist('your workplace'), card: 'how close this is to your workplace' });
    if (pr.indexOf('schools') > -1) out.push({ id: 'schools', title: 'Schools', text: 'Not measured by our sales data.', card: 'schools' });
    if (pr.indexOf('investment') > -1) out.push({ id: 'investment', title: 'Investment potential', text: 'We hold no rental or yield data, so this list describes sales and prices only.', card: 'investment potential' });
    if (pr.indexOf('monthly') > -1) out.push({ id: 'monthly', title: 'Lower monthly commitment', text: 'Not measured by our sales data.', card: 'monthly commitment' });
    if (pr.indexOf('facilities') > -1) out.push({ id: 'facilities', title: 'Facilities and lifestyle', text: 'Not measured by our sales data.', card: 'facilities and lifestyle' });
    if (pr.indexOf('newer') > -1) out.push({ id: 'newer', title: 'Newer building', text: 'Used to order resale homes by lease start year. Each card shows the lease start year, which is not the completion year.', card: 'completion year' });
    if (a.size && a.size !== 'not-sure') out.push({ id: 'bedrooms', title: 'Bedroom count', card: null, text: a.bedMode === 'new' ? 'New launch: bedrooms are checked where we have inventory data. Projects we couldn’t check are marked.'
      : a.bedMode === 'both' ? 'New launch: bedrooms are checked where we have inventory data. Resale: bedroom count isn’t in the transaction data, so size is used.' : 'Bedroom count isn’t in our sales data, so this list uses size.' });
    return out;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const joinAnd = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const BASE_NOT_EVAL_NEW_BED = ['layout', 'floor and facing', 'whether the developer still has units to sell', 'asking prices'];   // V10.3.3: bedrooms were checked for this card
  const notEvaluated = (un, sale, bedChecked) => cap(joinAnd((un || []).map((u) => u.card).filter(Boolean).concat(sale === 'new' ? (bedChecked ? BASE_NOT_EVAL_NEW_BED : BASE_NOT_EVAL_NEW) : BASE_NOT_EVAL))) + '.';

  /* ---------------------------------------------------------------- matching */
  /** One project, one sale type. Returns null unless it meets every evidence rule. */
  function matchProject(ix, p, sale, o) {
    const B = o.budget, pct = o.pct, rows = (p[sale] || []).filter((r) => r[0] + ix.bin / 2 >= o.lo && r[0] + ix.bin / 2 < o.hi);
    const top = winTop(o);
    const fit = rows.filter((r) => r[4] <= top && r[6] >= B * (1 - pct));          // the middle half of that size's sale prices overlaps the budget window
    if (!fit.length) return null;
    const n = fit.reduce((a, r) => a + r[1], 0); if (n < T.minSales) return null;
    const last = Math.max.apply(null, fit.map((r) => r[3])); if (monthsBetween(ix.latest, last) > T.recencyMonths) return null;
    if (!fit.some((r) => r[2] >= T.minActiveMonths)) return null;
    const q1 = Math.min.apply(null, fit.map((r) => r[4])), q3 = Math.max.apply(null, fit.map((r) => r[6]));
    const bins = fit.map((r) => r[0]);
    return { id: p.id, sale, name: p.name, street: p.street, district: p.d, seg: p.seg, tenure: p.tl, mixed: !!p.m, tenGroup: p.tg, n, strength: n >= T.goodSales ? 'good' : 'limited', last, q1, q3,
      fit: o.cap && q3 > o.cap && B <= q3 ? 'below' : B >= q1 && B <= q3 ? 'inside' : B > q3 ? 'above' : 'below', bandLo: Math.min.apply(null, bins), bandHi: Math.max.apply(null, bins) + ix.bin, multi: fit.length > 1 };
  }
  // Audit A3-14: a planner range is never stretched past its top. With a cap (the top of the planner's range) the budget window
  // stops there, and a development whose typical prices run above it says "A little above your … budget".
  const winTop = (o) => (o.cap > 0 ? Math.min(o.budget * (1 + o.pct), o.cap) : o.budget * (1 + o.pct));
  const budWord = (o) => (o.range && o.range.high > o.range.low ? m2(o.range.low) + '–' + m2(o.range.high) : '~' + m2(o.budget));
  const NEW_LABEL = 'New launch projects with recent developer sales';
  const NEW_NOTE = 'Based on developer sales recorded by URA in the last 12 months. This data cannot tell us whether units are still available from the developer.';
  const NEW_NOTE_INV = 'URA sales show what sold, not what is for sale. Where we checked current Huttons inventory, we say so and when.';
  const FIT = { inside: 0, above: 1, below: 2 };
  const compare = (x, y) => (x.strength === y.strength ? 0 : x.strength === 'good' ? -1 : 1) || FIT[x.fit] - FIT[y.fit] || y.n - x.n || y.last - x.last || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0);

  /* ---- V10.3.1 buyer preferences. They only ORDER projects that already pass every eligibility and evidence rule; nothing is hidden by them.
   *  Region is the URA market region (CCR / RCR / OCR), not a distance. Age is the lease start year, which is not the completion year. */
  const REGION_RANK = { CCR: 0, RCR: 1, OCR: 2 };
  const leaseYear = (tl) => { const m = /from (\d{4})/.exec(tl || ''); return m ? Number(m[1]) : 0; };
  /** The facts a preference needs, from either a URA match (resale / new) or an inventory candidate. */
  function prefFacts(x) {
    if (x.rec !== undefined) { const r = x.rec || {}, u = x.ura || {}; return { seg: r.seg || u.seg || null, tg: r.tg != null ? r.tg : u.tenGroup, tl: r.tl || u.tenure || '', hi: (x.inv && x.inv.hi) || u.bandHi || 0 }; }
    return { seg: x.seg, tg: x.tenGroup, tl: x.tenure, hi: x.bandHi || 0 };
  }
  const PREF_CMP = {
    location: (a, b) => (a.seg in REGION_RANK ? REGION_RANK[a.seg] : 3) - (b.seg in REGION_RANK ? REGION_RANK[b.seg] : 3),
    newer: (a, b) => (b.tg === 4 ? -1 : leaseYear(b.tl)) - (a.tg === 4 ? -1 : leaseYear(a.tl)),          // newest lease start first; freehold and 900+ year leases have no start year, so they follow
    space: (a, b) => b.hi - a.hi,
  };
  /** Comparator for a sale type, or null when no preference applies to it (so the existing order is untouched). */
  function prefOrder(prefs, sale, regionRank) {
    let ks = (prefs || []).filter((p) => PREF_CMP[p] && (p !== 'newer' || sale === 'resale'));
    if (!ks.length && regionRank) ks = ['location'];      // V10.3.4: Closer filters first; it orders only when no other ranking applies
    if (!ks.length) return null;
    return (x, y) => { const a = prefFacts(x), b = prefFacts(y); for (const k of ks) { const d = PREF_CMP[k](a, b); if (d) return d; } return 0; };
  }
  /** Which of the buyer's priorities actually apply to this search, in the order they were chosen, and which could not. */
  function effectivePrefs(input) {
    const pr = (input.answers && input.answers.priorities) || [], on = [], off = [];
    const area = (input.districts && input.districts.length) || input.text;
    pr.forEach((p) => {
      if (p === 'location' && input.regionSoft && !area) off.push({ id: p, why: 'soft' });      // V10.3.4: the buyer chose Include Outside Central, so Closer is removed for this search (neither filter nor ranking)
      else if (p === 'location') (area ? off : on).push(p === 'location' && area ? { id: p, why: 'area' } : p);
      else if (p === 'newer') (input.openTo === 'new' || input.freehold ? off : on).push(input.openTo === 'new' ? { id: p, why: 'new' } : input.freehold ? { id: p, why: 'freehold' } : p);
      else if (p === 'space') (input.size && input.size.extended ? on : off).push(input.size && input.size.extended ? p : { id: p, why: 'size' });
    });
    return { on, off };
  }

  /** Every eligible project for one sale type, in order. (No cap yet.) */
  function eligible(ix, sale, o) {
    const out = [];
    ix.projects.forEach((p) => {
      if (o.districts && o.districts.length && o.districts.indexOf(p.d) < 0) return;
      if (o.freehold && p.tg !== 4) return;
      if (o.regions && o.regions.indexOf(p.seg) < 0) return;      // V10.3.4: Closer to the centre = Core Central + Rest of Central only
      if (!textMatch(p, o.text)) return;
      const m = matchProject(ix, p, sale, o); if (m) out.push(m);
    });
    const po = prefOrder(o.prefs, sale, o.regionRank);
    return out.sort(po ? (x, y) => po(x, y) || compare(x, y) : compare);
  }
  function takeCapped(list, n) {
    const per = {}, out = [];
    for (const x of list) { if (x.street) { if ((per[x.street] || 0) >= T.perStreet) continue; per[x.street] = (per[x.street] || 0) + 1; } out.push(x); if (out.length >= n) break; }
    return out;
  }
  const saleTypes = (openTo) => (openTo === 'new' ? ['new'] : openTo === 'resale' ? ['resale'] : ['resale', 'new']);

  /** V10.3.6: the options for one sale type. With per-type sizes each type uses its own window; a type with no window cannot be listed (null). Without per-type sizes (older callers) every type uses o.lo and o.hi. */
  function forType(o, s) {
    if (!o.sizes) return o;
    const w = o.sizes[s]; if (w) return Object.assign({}, o, { lo: w.lo, hi: w.hi, sizeSource: w.source || o.sizeSource });
    // No typical size could be worked out for New launch: projects whose bedroom type Huttons confirms are still matched on bedroom and budget (that needs no size). Nothing sized from URA sales is listed.
    return s === 'new' && o.inv && o.beds ? Object.assign({}, o, { lo: 0, hi: 0, sizeSource: 'inferred', noWin: true }) : null;
  }
  const padSizes = (sizes, pad) => { if (!sizes) return sizes; const r = {}; Object.keys(sizes).forEach((k) => { r[k] = Object.assign({}, sizes[k], { lo: sizes[k].lo - pad, hi: sizes[k].hi + pad }); }); return r; };
  function count(ix, o) { return saleTypes(o.openTo).reduce((a, s) => { const ob = forType(o, s); return a + (!ob ? 0 : ob.inv && s === 'new' ? newCandidates(ix, ob).length : eligible(ix, s, ob).length); }, 0); }
  const GROUP_SUB = { resale: 'Matched on your budget and space', new: 'Matches the bedrooms you chose', newSome: 'Marked on each card where the bedrooms you chose are confirmed' };
  const BED_NOTE = { both: 'New launches match your selected bedrooms. Resale options match your budget and space; the exact layout still needs checking.', resale: 'Resale options match your budget and space; the exact layout still needs checking.' };

  /* ---------------------------------------------------------------- wording */
  function why(c, o) {
    const home = 'Homes of about ' + sizeText(o.lo, o.hi) + ' sold here in the last 12 months, and your ' + budWord(o).replace(/^~/, '') + ' ';
    return home + (c.fit === 'inside' ? 'is within their typical prices.' : c.fit === 'above' ? 'is a little above their typical prices.' : 'is a little below their typical prices. Expect to look at the lower end.');
  }
  /* ---- V10.1 buyer-facing display layer. Pure wording derived from the same facts; it changes no matching, ranking, freshness or privacy rule. */
  const BED_TBC = 'Bedroom layout to be confirmed', QUIET_BED = 'Bedroom availability not confirmed.', QUIET_UNCONFIRMED = 'Current availability not confirmed.', ASK_LABEL = 'Does this suit me? →', TICK_LABEL = 'Compare this with another';
  const budgetLine = (o, fit) => { const b = budWord(o) + ' budget'; return fit === 'below' ? { tone: 'over', text: 'A little above your ' + b } : { tone: 'ok', text: 'Within your ' + b }; };   // fit 'below' = the prices sit above the budget
  const bedLabel = (types) => { const n = types.map((t) => t.bedrooms); return n.length === 1 && n[0] === 0 ? 'Studio' : joinAnd(n.map((b) => (b === 0 ? 'Studio' : b >= 5 ? '5+' : String(b)))) + ' Bedroom'; };
  const salesLine = (n, isNew) => n + (isNew ? ' recent developer sales' : ' recent sales') + ' around this size';
  function card(c, o, un, ix) {
    return {
      simple: c.sale === 'new'
        ? { size: 'Around your size', priceLead: 'Recent sales', figure: p2(c.q1) + '–' + p2(c.q3), priceNote: null, budget: budgetLine(o, c.fit), sales: salesLine(c.n, true), latest: 'Latest: ' + ymLabel(c.last), quiet: QUIET_UNCONFIRMED }
        // V10.3.6 resale: the size is that of the homes that sold; a chosen bedroom is never claimed, only said to be still to confirm
        : { size: 'Recent homes sold: about ' + sizeText(c.bandLo, c.bandHi), priceLead: 'Recent sales', figure: p2(c.q1) + '–' + p2(c.q3), priceNote: null, budget: budgetLine(o, c.fit), sales: c.n + ' sales in the last 12 months', latest: 'Latest: ' + ymLabel(c.last), quiet: null, bedNote: o.bedChosen ? BED_TBC : null },
      id: c.id, name: displayName(c.name), sale: c.sale, saleLabel: c.sale === 'new' ? 'Developer sales' : 'Resale',
      meta: [displayName(c.street), 'District ' + Number(c.district), c.seg, c.tenure + (c.mixed ? ' (mixed tenure in the data)' : '')].join(' · '),
      why: why(c, o),
      evidence: c.n + (c.sale === 'new' ? ' developer sales' : ' sales') + ' in the last 12 months · latest ' + ymLabel(c.last) + ' · ' + (c.strength === 'good' ? 'Good' : 'Limited') + ' recent evidence',
      strength: c.strength,
      prices: 'Typical prices for these: ' + p2(c.q1) + '–' + p2(c.q3) + (c.multi ? ' (across ' + sizeText(c.bandLo, c.bandHi) + ')' : ''),
      indicative: c.sale === 'new' ? 'These are developer sales recorded by URA. They don’t show whether the developer still has units to sell, and new-launch prices depend on the unit and the launch phase.' : null,
      notEvaluated: notEvaluated(un, c.sale),
      link: '../../research/index.html#/p/' + c.id + '/' + c.sale, linkText: 'Research ' + c.name.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) + ' →',
    };
  }


  /* ================================================================ V10: Huttons inventory layer (New launch only) ================================================================ */
  const INV_KIND = 'kpt-huttons-public-inventory';
  const DAY = 86400000, HOUR = 3600000, SGT = 8 * HOUR, WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayNo = (ms) => Math.floor((ms + SGT) / DAY);
  /** "today", "yesterday" or "Fri 2 Oct", in Singapore time. No clock time is ever shown. */
  function whenText(checkedMs, nowMs) {
    const d = dayNo(nowMs) - dayNo(checkedMs); if (d === 0) return 'today'; if (d === 1) return 'yesterday';
    const dt = new Date(checkedMs + SGT); return WEEKDAY[dt.getUTCDay()] + ' ' + dt.getUTCDate() + ' ' + MON[dt.getUTCMonth()];
  }
  /** Validates and indexes inventory.json (schema v2). Returns null when the file is unusable, so FIND behaves exactly as V9.1. */
  function prepareInventory(doc, nowMs) {
    try {
      if (!doc || doc.kind !== INV_KIND || doc.v !== T.invSchema || !Array.isArray(doc.projects) || typeof nowMs !== 'number' || !isFinite(nowMs)) return null;
      const fileAt = Date.parse(doc.checkedAt); if (!isFinite(fileAt)) return null;
      if (fileAt - nowMs > T.invFutureMs) return null;                       // check time more than an hour in the future
      const by = {};
      doc.projects.forEach((p) => { if (p && typeof p.slug === 'string' && /^[a-z0-9-]+$/.test(p.slug) && typeof p.name === 'string' && FIND_EXCLUDED.indexOf(p.slug) < 0) by[p.slug] = p; });
      return { fileAt, now: nowMs, clockBehind: nowMs < fileAt, bySlug: by, slugs: Object.keys(by).sort() };
    } catch (e) { return null; }
  }
  /** 'fresh' (within 48 hours), 'dated' (48 hours to 7 days) or null (older, future, or no usable time). A missing project is never fresh. */
  function freshness(inv, ip) {
    const at = Date.parse(ip && ip.checkedAt ? ip.checkedAt : inv.fileAt); if (!isFinite(at) || inv.clockBehind) return null;
    const age = inv.now - at; if (age < 0) return null;
    return age <= T.invFreshHours * HOUR ? 'fresh' : age <= T.invMaxDays * DAY ? 'dated' : null;
  }
  /** Price evidence for one project against the buyer's size window and budget window. Uses only size bands whose centre is in the window.
   *  Returns null, or { types:[{bedrooms,floor,ceiling,fit}], primary, fit }. Prices are never used to rank. */
  function invMatch(ip, o) {
    const B = o.budget, pct = o.pct, half = T.invBand / 2, types = [], beds = o.beds || null, needWin = !beds || o.sizeSource === 'explicit';   // V10.3.3: a known bedroom is matched on bedroom + budget; only a size the buyer typed is also required
    (ip.byBedrooms || []).forEach((t) => {
      if (!t || typeof t.ceiling !== 'number' || !Array.isArray(t.bands) || typeof t.bedrooms !== 'number') return;
      if (beds && beds.indexOf(t.bedrooms) < 0) return;                              // a known wrong bedroom type never qualifies, whatever its size
      const inc = t.bands.filter((b) => Array.isArray(b) && typeof b[0] === 'number' && typeof b[1] === 'number' && (!needWin || (b[0] + half >= o.lo && b[0] + half < o.hi)));
      if (!inc.length) return;                                                       // no band of about this size: this type does not match
      const floor = Math.min.apply(null, inc.map((b) => b[1])), ceiling = t.ceiling;
      if (!(floor <= winTop(o) && ceiling >= B * (1 - pct))) return;            // same overlap test V9.1 uses for URA prices (capped at a planner range's top)
      types.push({ bedrooms: t.bedrooms, floor, ceiling, fit: B >= floor && B <= ceiling ? 'inside' : B > ceiling ? 'above' : 'below' });
      if (beds) { types[types.length - 1].hi = Math.max.apply(null, inc.map((b) => b[0])) + T.invBand; types[types.length - 1].lo = Math.min.apply(null, inc.map((b) => b[0])); }
    });
    if (!types.length) return null;
    const dist = (x) => (x.fit === 'inside' ? 0 : x.fit === 'below' ? x.floor - B : B - x.ceiling);
    const ranked = types.slice().sort((a, b) => (a.fit === 'inside' ? 0 : 1) - (b.fit === 'inside' ? 0 : 1) || dist(a) - dist(b) || a.bedrooms - b.bedrooms);
    const res = { types: types.sort((a, b) => a.bedrooms - b.bedrooms), primary: ranked[0], fit: ranked[0].fit };
    if (beds) res.hi = Math.max.apply(null, types.map((t) => t.hi));      // the largest matched band, used only by More space
    return res;
  }
  const typeNoun = (b) => (b === 0 ? 'Studio' : b >= 5 ? '5+ bedroom' : b + '-bedroom');
  /** URA developer-sales support for an inventory candidate. Sales of about the buyer's size (price fit is stated separately, under its own source).
   *  Looser than path A on purpose: sales in a single month are "early evidence". */
  function support(ix, p, o) {
    const rows = (p.new || []).filter((r) => r[0] + ix.bin / 2 >= o.lo && r[0] + ix.bin / 2 < o.hi);
    const n = rows.reduce((a, r) => a + r[1], 0); if (!n) return { kind: 'none', n: 0 };
    const last = Math.max.apply(null, rows.map((r) => r[3])), q1 = Math.min.apply(null, rows.map((r) => r[4])), q3 = Math.max.apply(null, rows.map((r) => r[6]));
    if (n < T.minSales || monthsBetween(ix.latest, last) > T.recencyMonths) return { kind: 'few', n };
    const months = rows.some((r) => r[2] >= T.minActiveMonths) || new Set(rows.map((r) => r[3])).size > 1;
    return { kind: !months ? 'early' : n >= T.goodSales ? 'good' : 'limited', n, last, q1, q3 };
  }
  const SUP_RANK = { good: 0, limited: 1, early: 2, few: 3, none: 3 };
  /** A usable record for any inventory project: URA's own facts win (including URA's region); otherwise the reviewed metadata the export joined in. V10.3.5: a reviewed inventory `region` is a fallback only, used when URA does not list the project; with no reviewed region seg stays null, so Closer to the centre cannot qualify it (never guessed). Null = cannot be placed, so it is not shown. */
  function recordFor(ix, ip) {
    const u = ix.projects.find((p) => p.id === ip.slug); if (u) return { rec: u, ura: u };
    if (ip.status !== 'ok' || !/^(0[1-9]|1\d|2[0-8])$/.test(String(ip.district)) || typeof ip.tenureGroup !== 'number' || typeof ip.tenure !== 'string' || !ip.tenure) return null;
    return { rec: { id: ip.slug, name: ip.name, street: ip.street || '', d: String(ip.district), seg: (ip.region === 'CCR' || ip.region === 'RCR' || ip.region === 'OCR') ? ip.region : null, tg: ip.tenureGroup, tl: ip.tenure, m: 0, new: [], resale: [] }, ura: null };
  }
  /** New launch candidates when the inventory layer is on, in order. Tiers: (a) budget inside the range shown, (b) a little above or below, (c) URA only, Huttons not checked, (d) URA only, Huttons checked and nothing matches (or zero). */
  function newCandidates(ix, o) {
    const inv = o.inv, uraAll = {}; if (!o.noWin) eligible(ix, 'new', o).forEach((m) => { uraAll[m.id] = m; });
    const out = [], seen = {};
    const pass = (rec) => !((o.regions && o.regions.indexOf(rec.seg) < 0) || (o.districts && o.districts.length && o.districts.indexOf(rec.d) < 0) || (o.freehold && rec.tg !== 4) || !textMatch(rec, o.text));
    inv.slugs.forEach((slug) => {
      const ip = inv.bySlug[slug], r = recordFor(ix, ip); if (!r || !pass(r.rec)) return;
      const fr = freshness(inv, ip), usable = fr && ip.status === 'ok', m = usable ? invMatch(ip, o) : null, u = uraAll[slug] || null;
      if (m) { seen[slug] = 1; out.push({ id: slug, sale: 'new', rec: r.rec, ip, fresh: fr, inv: m, ura: u, sup: r.ura ? support(ix, r.ura, o) : { kind: 'none', n: 0 }, tier: m.fit === 'inside' ? 'a' : 'b', name: r.rec.name, street: r.rec.street }); return; }
      if (u) { seen[slug] = 1; const zero = fr && ip.status === 'zero_returned', nomatch = usable;
        out.push({ id: slug, sale: 'new', rec: r.rec, ip, fresh: fr, ura: u, tier: zero || nomatch ? 'd' : 'c', hut: zero ? 'zero' : nomatch ? 'nomatch' : 'unchecked', name: u.name, street: u.street }); }
    });
    Object.keys(uraAll).forEach((id) => { if (!seen[id]) { const u = uraAll[id]; out.push({ id, sale: 'new', rec: null, ip: null, fresh: null, ura: u, tier: 'c', hut: 'unchecked', name: u.name, street: u.street }); } });
    const TIER = { a: 0, b: 1, c: 2, d: 3 };
    const po = prefOrder(o.prefs, 'new', o.regionRank);
    // V10.3.2: when a priority is active, a and b (Huttons shows homes around the budget and size) form one band, so the priority orders them together; c and d stay below it. With no priority the four tiers are unchanged.
    const BAND = po ? { a: 0, b: 0, c: 2, d: 3 } : TIER;
    return out.sort((x, y) => BAND[x.tier] - BAND[y.tier] || (po ? po(x, y) : 0) || (x.tier === 'a' || x.tier === 'b'
      ? SUP_RANK[x.sup.kind] - SUP_RANK[y.sup.kind] || (x.fresh === y.fresh ? 0 : x.fresh === 'fresh' ? -1 : 1) || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0)
      : compare(x.ura, y.ura)));
  }

  /* ---- V10 wording (one place). {B} is the buyer's own budget; the only price ever shown from Huttons is the single rounded "From around" figure. */
  const HUT = {
    label: (when) => 'HUTTONS INVENTORY' + (when ? ' · CHECKED ' + when.toUpperCase() : ''),
    unchecked: 'We couldn’t check current Huttons inventory for this project. That doesn’t mean nothing is listed.',
    zero: 'No units currently shown in Huttons inventory for this project.',
    nomatchBed: (when) => 'Checked ' + when + ': none of the units currently shown in Huttons inventory match the bedrooms and budget you chose.',
    nomatch: (when) => 'Checked ' + when + ': none of the units currently shown in Huttons inventory are about your size and budget.',
    note: 'Lowest price currently shown for these homes, rounded. Prices vary by unit.',
    notePast: 'Lowest price shown then for these homes, rounded. Prices vary by unit.',
    dated: 'Units may have changed since. Ask Ken for the latest.',
    none: 'None in our data yet, so there is no sales history to show.',
    sizeNote: 'around the size used for this list',
  };
  const typesPhrase = (types) => joinAnd(types.map((t) => typeNoun(t.bedrooms))) + ' homes';
  function huttonsBlock(c, o) {
    const when = whenText(Date.parse(c.ip.checkedAt || new Date(o.inv.fileAt).toISOString()), o.inv.now), past = c.fresh === 'dated', inferred = o.sizeSource === 'inferred', multi = c.inv.types.length > 1, p = c.inv.primary;
    const bedSz = o.beds ? (o.sizeSource === 'explicit' ? 'the bedrooms and size you chose' : 'the bedrooms you chose') : null;
    const size = o.beds ? typesPhrase(c.inv.types) + (past ? ' matched ' : ' match ') + bedSz + '.' : typesPhrase(c.inv.types) + (past ? (inferred ? ' were ' + HUT.sizeNote + '.' : ' matched the size you’re looking for.') : (inferred ? ' are ' + HUT.sizeNote + '.' : ' match the size you’re looking for.'));
    const homes = multi || o.beds ? typeNoun(p.bedrooms) + ' homes' : 'homes', ar = o.beds ? '' : ' around this size', pre = 'Your ' + budWord(o) + ' budget ';
    const budget = {
      inside: pre + (past ? 'fell within what we saw then for ' + homes + ar + '.' : 'falls within what we’re currently seeing for ' + homes + ar + '.'),
      above: pre + (past ? 'gave you room within the ' + homes + ' we saw then' + ar + '.' : 'gives you room within the ' + homes + ' we’re currently seeing' + ar + '.'),
      below: pre + (past ? 'was slightly below what we saw then for ' + homes + ar + '.' : 'is slightly below what we’re currently seeing for ' + homes + ar + '.'),
    }[p.fit];
    return { kind: past ? 'dated' : 'fresh', label: HUT.label(when), when, size, from: 'From around ' + m2(p.floor) + (past ? ' (as shown then).' : ''), budget, note: past ? HUT.notePast : HUT.note, datedNote: past ? HUT.dated : null, fit: p.fit };
  }
  function supportRow(c, o) {
    const s = c.sup, label = 'URA DEVELOPER SALES';
    // Disagreement rule: if URA's typical prices put the budget somewhere else than the Huttons conclusion, URA's prices are stated here, under URA.
    const disagree = (s.kind === 'good' || s.kind === 'limited' || s.kind === 'early') && (o.budget < s.q1 || o.budget > s.q3) ? ' Typical prices for these: ' + p2(s.q1) + '–' + p2(s.q3) + '.' : '';
    if (s.kind === 'good' || s.kind === 'limited') return { label, text: s.n + ' developer sales of about this size in the last 12 months · latest ' + ymLabel(s.last) + ' · ' + (s.kind === 'good' ? 'Good' : 'Limited') + ' recent evidence.' + disagree, kind: s.kind };
    if (s.kind === 'early') return { label, text: s.n + ' sales of about this size, all in ' + ymLabel(s.last) + '. Early evidence: the first sales were recorded then.' + disagree, kind: 'early' };
    if (s.kind === 'few') return { label, text: 'Fewer than ' + T.minSales + ' developer sales of about this size in the last 12 months, so there is no sales history to show.', kind: 'none' };
    return { label, text: HUT.none, kind: 'none' };
  }
  function metaLine(rec) { return [displayName(rec.street), 'District ' + Number(rec.d), rec.seg, rec.tl + (rec.m ? ' (mixed tenure in the data)' : '')].filter(Boolean).join(' · '); }
  const askFor = (name, hasCheck) => (hasCheck ? 'Ask Ken what he’d shortlist here →' : 'Ask Ken about ' + name + ' →');
  function cardInv(c, o, un) {
    const name = displayName(c.name), isUra = !!(o._uraIds && o._uraIds[c.id]);
    const base = { id: c.id, slug: c.id, name, sale: 'new', saleLabel: 'Developer sales', notEvaluated: notEvaluated(un, 'new'), tier: c.tier, tick: TICK_LABEL,
      link: isUra ? '../../research/index.html#/p/' + c.id + '/new' : null, linkText: isUra ? 'Research ' + name + ' →' : null };
    if (c.tier === 'a' || c.tier === 'b') {
      const rated = c.sup.kind === 'good' || c.sup.kind === 'limited' || c.sup.kind === 'early';
      const sp = c.sup, hasN = (sp.kind === 'good' || sp.kind === 'limited' || sp.kind === 'early' || sp.kind === 'few') && sp.n > 0, pr = c.inv.primary, pastC = c.fresh === 'dated';
      const lo = Math.min.apply(null, c.inv.types.map((x) => x.lo)), hi = Math.max.apply(null, c.inv.types.map((x) => x.hi));
      base.simple = { size: bedLabel(c.inv.types) + (o.beds ? (lo > 0 && hi > lo ? ' · about ' + num(lo) + '–' + num(hi) + ' sqft' : '') : ' · around your size'), badge: o.beds && o.bedWord ? '✓ Matches ' + o.bedWord : null, priceLead: 'From around', figure: m2(pr.floor), priceNote: pastC ? '(as shown then)' : null, budget: budgetLine(o, pr.fit), sales: hasN ? salesLine(sp.n, true) : null, latest: hasN && sp.last ? 'Latest: ' + ymLabel(sp.last) : null, quiet: null };
      if (o.beds) base.notEvaluated = notEvaluated(un, 'new', true);
      return Object.assign(base, { basis: rated ? 'Current Huttons inventory and URA sales' : 'Current Huttons inventory only', meta: metaLine(c.rec), huttons: huttonsBlock(c, o), ura: supportRow(c, o), hasCheck: true, ask: ASK_LABEL,
        why: null, evidence: null, prices: null, indicative: null, strength: rated ? c.sup.kind : null });
    }
    // URA-only: the V9.1 card, plus one honest status line about Huttons
    const v = card(c.ura, o, un, null), when = c.fresh ? whenText(Date.parse(c.ip.checkedAt || new Date(o.inv.fileAt).toISOString()), o.inv.now) : null;
    const hut = c.hut === 'zero' ? { kind: 'zero', label: HUT.label(when), text: HUT.zero } : c.hut === 'nomatch' ? { kind: 'nomatch', label: HUT.label(when), text: o.beds ? HUT.nomatchBed(when) : HUT.nomatch(when) } : { kind: 'unchecked', label: HUT.label(null), text: HUT.unchecked };
    if (o.beds) v.simple.quiet = QUIET_UNCONFIRMED + ' ' + QUIET_BED;      // V10.3.3: bedroom not confirmed for a project without a matching Huttons bedroom type
    return Object.assign(v, { slug: c.id, basis: 'URA developer sales only', huttons: hut, hasCheck: false, ask: ASK_LABEL, tier: c.tier, tick: base.tick, ask: ASK_LABEL, link: base.link, linkText: base.linkText });
  }
  function resaleDecor(cd) { return Object.assign(cd, { slug: cd.id, hasCheck: false, ask: ASK_LABEL, tick: TICK_LABEL }); }

  /* ---- Get Ken's view handoff (pure; the page passes only what the buyer chose). Project names come from our own index or inventory file, never typed text. */
  const budgetPhrase = (b) => '$' + String(Math.round(b / 10000) / 100).replace(/(\.\d)0$/, '$1') + 'm';
  function handoffMessage(o) {
    const names = (o.names || []).filter(Boolean).slice(0, 2); if (!names.length) return null;
    const head = names.length === 1 ? 'Hi Ken, I was looking at ' + names[0] + ' on Groundwork. Does this suit what I’m looking for?' : 'Hi Ken, I’m comparing ' + names[0] + ' and ' + names[1] + '. Could you help me understand which may suit me better?';
    const parts = [];
    if (o.budget > 0) parts.push('around ' + budgetPhrase(o.budget));
    if (o.size && o.size.from > 0 && o.size.to > o.size.from) parts.push('about ' + num(o.size.from) + '–' + num(o.size.to) + ' sqft');
    if (o.district && /^(0[1-9]|1\d|2[0-8])$/.test(String(o.district))) parts.push('District ' + Number(o.district));
    const full = parts.length ? head + ' My search: ' + parts.join(', ') + '.' : head;
    return full.length > T.maxMessage ? head : full;
  }
  /** The one new analytics event: the ticked project slugs only (letters, digits, hyphens). Never budget, size or district. */
  function askEvent(slugs) {
    const ok = (slugs || []).filter((x) => typeof x === 'string' && /^[a-z0-9-]+$/.test(x)).slice(0, 2); if (!ok.length) return null;
    const o = { project_id: ok[0] }; if (ok[1]) o.project_id_2 = ok[1]; return o;
  }

  /* ---------------------------------------------------------------- the shortlist */
  /** input: { budget, openTo:'new'|'resale'|'both', size:{lo,hi,source,line}, districts:[], text, freehold:bool, answers:{where,size,priorities}, typical:{lo,hi}|null }
   *  Returns the whole view model. Never throws on a usable index. */
  function shortlist(ix, input) {
    const inv = input.inv || null;
    const eff = effectivePrefs(input);
    const ans = Object.assign({}, input.answers, { priorities: ((input.answers && input.answers.priorities) || []).filter((p) => p !== 'newer' || eff.on.indexOf('newer') > -1) });   // only a priority that is applied is described as applied
    const types0 = saleTypes(input.openTo), bedSel = bedsFor(input.answers && input.answers.size), beds = inv && types0.indexOf('new') > -1 ? bedSel : null;     // V10.3.3
    if (beds) ans.bedMode = types0.length === 2 ? 'both' : 'new';
    const un = unsupported(ans, input.loc || { districts: input.districts || [] }), base = { budget: input.budget, cap: input.range && input.range.high > 0 ? input.range.high : null, range: input.range && input.range.high > 0 ? { low: input.range.low, high: input.range.high } : null, pct: input.pct === T.widenBudgetPct ? T.widenBudgetPct : T.budgetPct, lo: input.size.lo, hi: input.size.hi, districts: input.districts || [], freehold: !!input.freehold, text: input.text || '', openTo: input.openTo, prefs: eff.on.slice() };
    if (beds) { base.beds = beds; base.bedWord = BED_WORDS[input.answers.size]; }
    if (bedSel) base.bedChosen = true;      // V10.3.6: a bedroom was chosen; resale cards say its layout is still to be confirmed
    if (input.sizes) { base.sizes = {}; types0.forEach((s) => { const w = input.sizes[s]; if (w && w.lo > 0 && w.hi > w.lo) base.sizes[s] = { lo: w.lo, hi: w.hi, source: w.source }; }); }      // V10.3.6: one window per sale type
    if (eff.on.indexOf('location') > -1) { base.regions = ['CCR', 'RCR']; base.regionRank = true; base.prefs = base.prefs.filter((p) => p !== 'location'); }   // V10.3.4: Closer is a filter; with regionSoft it never reaches here (removed in effectivePrefs)
    if (inv) { base.inv = inv; base.sizeSource = input.size.source; base._uraIds = {}; ix.projects.forEach((p) => { base._uraIds[p.id] = 1; }); }
    const types = saleTypes(input.openTo), lists = {};
    types.forEach((s) => { const ob = forType(base, s); lists[s] = !ob ? [] : inv && s === 'new' ? newCandidates(ix, ob) : eligible(ix, s, ob); });
    const eligibleN = {}; types.forEach((s) => { eligibleN[s] = lists[s].length; });
    const total = types.reduce((a, s) => a + eligibleN[s], 0);
    // 3 resale + 2 new when both qualify; any gap is filled from the other group; one chosen type gets up to 5
    let chosen = {};
    if (types.length === 1) chosen[types[0]] = takeCapped(lists[types[0]], T.maxCards);
    else {
      let r = takeCapped(lists.resale, T.bothResale), n = takeCapped(lists.new, T.bothNew);
      if (r.length < T.bothResale) n = takeCapped(lists.new, T.maxCards - r.length);
      if (n.length < T.bothNew) r = takeCapped(lists.resale, T.maxCards - n.length);
      chosen = { resale: r, new: n };
    }
    const mk = (c) => (inv && c.sale === 'new' ? cardInv(c, forType(base, 'new') || base, un) : resaleDecor(card(c, forType(base, c.sale) || base, un, ix)));
    const groups = types.map((s) => {
      const g = { sale: s, label: s === 'new' ? NEW_LABEL : 'Resale', note: s === 'new' ? (inv ? NEW_NOTE_INV : NEW_NOTE) : null, eligible: eligibleN[s], cards: (chosen[s] || []).map(mk) };
      if (inv && types.length === 2) { const all = takeCapped(lists[s], T.moreMax); g.more = all.slice((chosen[s] || []).length).map(mk); }
      if (bedSel) {      // V10.3.6: one muted line under the group heading. New launch says it matches the bedrooms only when every card shown has a confirmed bedroom match.
        const shownCards = g.cards.concat(g.more || []);
        g.sub = s === 'resale' ? GROUP_SUB.resale : !beds ? null : shownCards.every((c) => c.simple && c.simple.badge) ? GROUP_SUB.new : GROUP_SUB.newSome;
      }
      return g;
    }).filter((g) => g.cards.length);
    const shown = groups.reduce((a, g) => a + g.cards.length, 0);
    const state = total === 0 ? 'none' : total < T.minSales ? 'few' : 'list';
    const out = { version: VERSION, state, total, shown, groups, eligible: eligibleN, size: input.size, unsupported: un, filters: { districts: base.districts, freehold: base.freehold, text: base.text, pct: base.pct }, dataTo: ix.latestMonth, window: ix.window,
      dataLine: 'Based on actual sales in the last 12 months (to ' + ymLabel(ix.latest) + ') around your budget and size.',
      orderLine: 'Listed by how much recent evidence there is, not by quality or value.', changes: [], reference: null, noneText: null };
    if (inv && types.indexOf('new') > -1) {
      out.inventory = { active: true, checkedAt: new Date(inv.fileAt).toISOString() };
      out.dataLine = 'Based on actual URA sales in the last 12 months (to ' + ymLabel(ix.latest) + ') around your budget and size, plus a check of current Huttons inventory where we could make one. This is a starting list, not a recommendation.';
      out.orderLine = types.length === 2 ? 'Resale: listed by how much recent evidence there is. New launch: listed by whether your budget sits within the range currently shown in Huttons, then by how much URA evidence there is. Not by quality, value or price.'
        : 'Listed by whether your budget sits within the range currently shown in Huttons, then by how much URA evidence there is. Not by quality, value or price.';
    } else if (inv) out.inventory = { active: true, checkedAt: new Date(inv.fileAt).toISOString() };

    // V10.3.1 a short, plain statement of what the priorities did (nothing when no priority applied)
    const effect = [], say = {};
    // V10.3.3 / V10.3.6: what the bedroom choice did, in one plain sentence (kept out of `effect`, which is for priorities)
    if (bedSel) out.bedroomNote = types0.length === 2 ? (beds ? BED_NOTE.both : BED_NOTE.resale) : types0[0] === 'resale' ? BED_NOTE.resale : beds ? 'New launches are matched on ' + BED_WORDS[input.answers.size] + ' where we have inventory data.' : BED_NOTE.resale;
    if (eff.on.indexOf('location') > -1) {
      say.location = base.regions
        ? 'Closer to the centre: Core Central and Rest of Central regions only' + (types.some((sl) => !base.prefs.some((q) => PREF_CMP[q] && (q !== 'newer' || sl === 'resale'))) ? ', Core Central first.' : '.')
        : '';
    }
    if (eff.on.indexOf('newer') > -1) say.newer = 'Newer building: resale homes are listed by lease start year, newest first. Lease start is not the completion year.';
    if (eff.on.indexOf('space') > -1) say.space = input.size.mixed ? 'More space: slightly larger sizes are included, and larger sizes are listed first.' : 'More space: sizes up to ' + num(input.size.hi) + ' sqft are included, and larger sizes are listed first.';
    if (beds && say.space) say.space = types0.length === 2 ? say.space + ' New launch: larger homes of your bedroom choice come first.' : 'More space: larger homes of your bedroom choice are listed first.';   // V10.3.3
    eff.on.forEach((p) => effect.push(say[p]));      // in the order the buyer chose them
    eff.off.forEach((o) => {
      if (o.why === 'soft') effect.push('Closer to the centre was removed for this search: all regions are included.');
      else if (o.why === 'area') effect.push('Closer to the centre wasn’t applied: the area you chose already sets the location.');
      else if (o.why === 'new') effect.push('Newer building wasn’t applied: every new launch is a new project.');
      else if (o.why === 'freehold') effect.push('Newer building wasn’t applied: it can’t be combined with Freehold or 900+ year lease.');
      else if (o.why === 'size') effect.push('More space wasn’t applied: you chose your own size range.');
    });
    if (effect.length) out.effect = effect;      // absent when no priority applied, so the no-priority output is exactly the V10.3 output
    const gap = types.filter((s) => !forType(base, s)); if (gap.length) out.sizeGap = gap;      // sale types with no size to work from at this budget (absent = none)
    if (eff.on.length) {
      if (inv && types.indexOf('new') > -1) out.orderLine = types.length === 2 ? 'Resale: listed by your priorities, then by how much recent evidence there is. New launch: listed by whether Huttons currently shows homes around your budget and size, then by your priorities, then by how much URA evidence there is. Not by quality, value or price.'
        : 'Listed by whether Huttons currently shows homes around your budget and size, then by your priorities, then by how much URA evidence there is. Not by quality, value or price.';
      else out.orderLine = 'Listed by your priorities, then by how much recent evidence there is. Not by quality or value.';
    }
    if (beds) out.orderLine = out.orderLine.replace('whether your budget sits within the range currently shown in Huttons', 'whether Huttons currently shows homes of the bedrooms you chose around your budget').replace('whether Huttons currently shows homes around your budget and size', 'whether Huttons currently shows homes of the bedrooms you chose around your budget');   // V10.3.3

    const asText = (n) => n + (n === 1 ? ' development' : ' developments');
    // V10.3.4: one-click ways to broaden a search that a hard requirement has narrowed. Offered only when they would add results; nothing is ever applied automatically.
    const relax = [];
    if (state === 'none' || state === 'few') {
      [['region', base.regions, { regions: null, regionRank: false }, 'Include Outside Central'], ['freehold', base.freehold, { freehold: false }, 'Include leasehold homes'], ['bed', base.beds, { beds: null }, 'Show any bedroom']].forEach((r) => {
        if (!r[1]) return; const n = count(ix, Object.assign({}, base, r[2])); if (n > total) relax.push({ id: r[0], label: r[3], count: n, text: asText(n) });
      });
    }
    if (state === 'few') {
      const alts = [];
      const sz = count(ix, Object.assign({}, base, { lo: base.lo - T.sizePad, hi: base.hi + T.sizePad, sizes: padSizes(base.sizes, T.sizePad) })); if (sz > total) alts.push({ id: 'size', label: input.size.mixed ? 'Include nearby sizes' : 'Include nearby sizes (' + sizeText(base.lo - T.sizePad, base.hi + T.sizePad) + ')', count: sz, text: asText(sz) });
      const bd = count(ix, Object.assign({}, base, { pct: T.widenBudgetPct })); if (bd > total) alts.push({ id: 'budget', label: 'Widen the budget range to ±15%', count: bd, text: asText(bd) });
      if (base.districts.length || base.text) { const ar = count(ix, Object.assign({}, base, { districts: [], text: '' })); if (ar > total) alts.push({ id: 'area', label: 'Look across all of Singapore', count: ar, text: asText(ar) }); }
      out.changes = relax.concat(alts);
      out.fewText = 'Only ' + total + (total === 1 ? ' development' : ' developments') + (base.districts.length || base.text ? ' in this area' : '') + ' had enough recent sales to list.' + (alts.length ? ' You can change one thing to see more:' : '');
    }
    if (state === 'none') {
      const area = base.districts.length ? ' in ' + (base.districts.length === 1 ? 'District ' + Number(base.districts[0]) : 'these districts') : base.text ? ' matching “' + base.text + '”' : '';
      let t = 'No development' + area + ' had at least ' + T.minSales + ' sales of homes of ' + (input.size.mixed ? 'the sizes that typically sold' : sizeText(base.lo, base.hi)) + ' in the last 12 months at prices near ' + m2(base.budget) + '.';
      if (input.typical && input.typical.lo && !(input.size.source === 'inferred')) t += ' Around ' + m2(base.budget) + ', the homes that sold were typically about ' + sizeText(input.typical.lo, input.typical.hi) + ' (see above).';
      out.noneText = t;
      // reference: the lowest budget (in $50k steps, up to +50%) at which at least 3 developments qualify, with every other choice unchanged
      for (let b = base.budget + T.referenceStep; b <= base.budget * (1 + T.referenceMaxUp); b += T.referenceStep) { if (count(ix, Object.assign({}, base, { budget: b, cap: null, range: null })) >= T.minSales) { out.reference = { budget: b, text: 'For reference, at about ' + m2(b) + ' we did find developments with enough sales of that size.' }; break; } }
      const widerArea = (base.districts.length || base.text) ? count(ix, Object.assign({}, base, { districts: [], text: '' })) : 0;
      if (widerArea >= T.minSales) out.changes = [{ id: 'area', label: 'Look across all of Singapore', count: widerArea, text: asText(widerArea) }];
      if (base.regions || base.freehold || base.beds) { out.noneText = 'No matches found with all your selections.'; out.reference = null; out.constraintNone = true; out.changes = relax.concat(out.changes); }
    }
    return out;
  }

  /* ---------------------------------------------------------------- methodology (plain words; the only place the technical meaning lives) */
  const METHOD = [
    'New launch projects: choosing “New launch” lists projects with developer sales (URA “New Sale”) in the last 12 months. Recent developer sales are not proof that the developer still has units to sell. URA’s data has no unit counts or inventory, so a project can appear here after most of its units have sold.',
    'Where the sales come from: private condominium and apartment sales recorded by URA, for new launches and resale. Sub-sales, Executive Condominiums and landed homes are not included.',
    'The window: the last 12 months of recorded sales. Older sales are never used to put a development on the list.',
    '“Typical prices” means the middle half of the sales: the range between the price a quarter of the sales were below and the price a quarter were above. Half of those sales fell inside it. It is not a price anyone should expect to pay for a particular unit.',
    'A development is listed only if homes of the size you chose sold there in the last 12 months at typical prices that overlap your budget (within about 10% either side), there were at least 3 such sales in the last 12 months, at least one of those sizes sold in two or more different months, and the latest of them was within the last 6 months of the data.',
    '“Good recent evidence” means 5 or more such sales. “Limited recent evidence” means 3 or 4.',
    'The order: evidence first (Good before Limited), then where your budget sits within the typical prices, then the number of such sales, then the most recent sale, then the development’s name A to Z. There is no score and nothing is weighted.',
    'If you gave no size in square feet, we used the sizes that typically sold at your budget, worked out separately for new launches and for resale. We never turn bedrooms into square feet. For new launches, bedrooms are checked where we have inventory data. For resale, bedroom count isn’t in the transaction data, so size is used.',
    'Closer to the centre limits the list to the Core Central and Rest of Central regions, using URA’s region classification. It is not a measure of physical distance. Core Central is listed before Rest of Central unless another priority orders the list.',
    'If freehold or a longer tenure was a priority, only freehold and leases of 900 years or more are shown, and you can remove that filter.',
    'Area filters use postal districts. If you told us where you want to be, we suggest a district and ask you to confirm it before it is used; places that sit in more than one district, or that we don’t recognise, are left for you to choose. The area names are general: a district contains places not named. We don’t match schools, workplaces, family locations, exact distances or neighbourhoods.',
    'Where a new launch card says “Current availability not confirmed”, URA’s data can’t tell us whether the developer still has units to sell. Where we also check Huttons inventory, a card with no current match for your size and budget says the same. That isn’t the same as there being none.',
    '“Does this suit me?” and “Compare these with Ken” open WhatsApp with a message ready to send. It names the project or projects and includes your budget, the size range if you typed one, and the district if you confirmed one. Nothing from Huttons or URA is included, and you can edit it before sending.',
    'This is a shortlist of developments worth investigating. It is not a recommendation or a valuation, and it doesn’t show what is for sale now or its asking price.',
  ];

  const METHOD_INV = METHOD.slice(0, METHOD.length - 1).concat([
    '“Updated today” beside New launch is when we last looked at current Huttons inventory. If the check is more than 2 days old the date is shown instead, and prices are described as “as shown then”.',
    'Huttons inventory is the list of units currently shown in Huttons’ own system when we last checked, with the date. It may not include every unit the developer has, and it excludes other agents’ listings. We show it only for new launch projects.',
    'The “From around” figure is the lowest price currently shown for homes about your size, rounded to $50k. We don’t publish a range, the number of units or which units. Prices vary by unit, and only Ken can say what you could actually get.',
    'Checks older than 7 days aren’t used. If we couldn’t check a project, we say so. That isn’t the same as there being no units.',
    'We check Huttons inventory for new launch projects only, so resale cards show URA sales only. That is a difference in the data we hold, not in the options.',
    'This is a shortlist of developments worth investigating. It is not a recommendation or a valuation. Apart from the Huttons check, it doesn’t show what is for sale now, and the Huttons price is only a rounded starting point.',
  ]);
  const ANALYTICS_KEYS = ['budget_band', 'result_bucket', 'size_source', 'area_filter', 'sale_groups'];
  const bucket = (n) => (n === 0 ? '0' : n < 3 ? '1-2' : n < 5 ? '3-4' : '5+');
  /** Bucketed and anonymous. Never the exact budget, typed text, size or project names. */
  function analytics(res, budgetBand) {
    return { budget_band: budgetBand, result_bucket: bucket(res.shown), size_source: res.size.source, area_filter: !!(res.filters.districts.length || res.filters.text), sale_groups: res.groups.map((g) => g.sale).join('+') || 'none' };
  }

  return { VERSION, T, DISTRICT_AREAS, AREA_ALIASES, AREA_CHOICES, NEW_LABEL, NEW_NOTE, NEW_NOTE_INV, resolveArea, districtLabel, districtShort, BASE_NOT_EVAL, METHOD, METHOD_INV, ANALYTICS_KEYS, HUT,
    prepareInventory, freshness, invMatch, bedsFor, effectivePrefs, prefOrder, support, newCandidates, whenText, handoffMessage, askEvent, typeNoun,
    displayName, prepare, inferSize, sizeWindow, sizeWindows, BED_WORDS, GROUP_SUB, matchDistricts, unsupported, notEvaluated, matchProject, eligible, shortlist, count, compare, why, card, analytics, bucket, m2, p2, num, sizeText, ymLabel, monthsBetween };
});
