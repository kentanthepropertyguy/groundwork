/* KPT FIND V1: "Developments worth investigating". A deterministic, explainable shortlist for the Buyer's second page.
 * Pure functions. Reads only: the buyer's budget / answers, the existing budget engine's route statistics (typical size), and data/projects/find.json
 * (ACTUAL price quartiles per project, sale type and 100 sqft band for the last 12 months; see tools/market-data/build-find-index.js).
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
  const VERSION = 'find-v1';
  // Thresholds (all in one place so tests and the methodology read the same numbers).
  const T = { budgetPct: 0.10, widenBudgetPct: 0.15, minSales: 3, goodSales: 5, minActiveMonths: 2, recencyMonths: 6, perStreet: 2, maxCards: 5, bothResale: 3, bothNew: 2, sizePad: 100,
    inferMinDeals: 15, referenceStep: 50000, referenceMaxUp: 0.5 };
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
  function displayName(name) {
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
  function prepare(doc) {
    if (!doc || doc.kind !== 'kpt-find-index' || doc.v !== 1 || !Array.isArray(doc.projects) || !/^\d{4}-\d{2}$/.test(doc.latestMonth || '')) return null;
    const latest = Number(doc.latestMonth.replace('-', ''));
    return { latest, latestMonth: doc.latestMonth, window: doc.window, minCell: doc.minCell, bin: doc.bin || 100, projects: doc.projects, districts: Array.from(new Set(doc.projects.map((p) => p.d))).sort() };
  }

  /* ---------------------------------------------------------------- size */
  /** Typical size at this budget from the EXISTING budget engine's route statistics (step = the shard step the page already loaded).
   *  Among routes in scope for the buyer's new/resale choice, the one with the most sales in the narrow budget window, if it has enough sales; otherwise all private sales. */
  function inferSize(step, openTo) {
    const U = step && step.private; if (!U) return null;
    const inScope = Object.keys(U.routes || {}).filter((k) => openTo === 'new' ? /\|New\|/.test(k) : openTo === 'resale' ? /\|Resale\|/.test(k) : true)
      .map((k) => ({ k, a: U.routes[k].n })).filter((x) => x.a).sort((a, b) => b.a[0] - a.a[0] || (a.k < b.k ? -1 : 1));
    const best = inScope[0], tot = U.total && U.total.n;
    const use = best && best.a[0] >= T.inferMinDeals ? { a: best.a, source: 'route' } : tot ? { a: tot, source: 'all' } : null;
    if (!use) return null;
    const lo = Math.round(use.a[5] / 10) * 10, hi = Math.round(use.a[6] / 10) * 10;
    return lo > 0 && hi > lo ? { lo, hi, source: use.source, n: use.a[0] } : null;
  }
  /** explicit: {from, to} typed by the buyer (sqft). Otherwise the engine's typical size. Bedrooms are never converted. */
  function sizeWindow(explicit, step, openTo) {
    if (explicit && explicit.from >= 100 && explicit.to > explicit.from && explicit.to <= 20000)
      return { lo: Math.round(explicit.from), hi: Math.round(explicit.to), source: 'explicit', line: 'Size: ' + sizeText(Math.round(explicit.from), Math.round(explicit.to)) + (explicit.widened ? ' (nearby sizes included)' : ' (your range)') };
    const s = inferSize(step, openTo); if (!s) return null;
    return { lo: s.lo, hi: s.hi, source: 'inferred', basis: s.source, line: 'Size: about ' + sizeText(s.lo, s.hi) + '. You didn’t give a size in square feet, so we used the sizes that typically sold at this budget. We don’t convert bedrooms into square feet.' };
  }

  /* ---------------------------------------------------------------- area */
  function words(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean); }
  /** District suggestions for typed text (whole-word match against the reviewed names). Shown as chips to confirm; never applied silently. */
  function matchDistricts(text) {
    const q = words(text).filter((w) => w.length >= 3); if (!q.length) return [];
    return Object.keys(DISTRICT_AREAS).filter((d) => { const names = DISTRICT_AREAS[d].split(',').map((x) => words(x)); return names.some((nw) => q.some((w) => nw.indexOf(w) > -1)); });
  }
  const textMatch = (p, text) => { const q = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim(); return !q || q.length < 3 || (p.name + ' ' + p.street).toLowerCase().indexOf(q) > -1; };

  /* ---------------------------------------------------------------- unsupported answers */
  const BASE_NOT_EVAL = ['bedrooms and layout', 'floor and facing', 'whether any unit is for sale', 'asking prices'];
  /** What the buyer chose that sales data cannot evaluate. Nothing here is ever used to filter. */
  function unsupported(a) {
    a = a || {}; const out = [], pr = a.priorities || [];
    if (a.where === 'school') out.push({ id: 'school', title: 'Near a particular school', text: 'Our sales data can’t show distance to schools, so this list doesn’t consider it.', card: 'how close this is to your school' });
    if (a.where === 'family') out.push({ id: 'family', title: 'Near family', text: 'Our sales data can’t show distance to where your family lives, so this list doesn’t consider it.', card: 'how close this is to your family' });
    if (a.where === 'work') out.push({ id: 'work', title: 'Near work', text: 'Our sales data can’t show distance to your workplace, so this list doesn’t consider it.', card: 'how close this is to your workplace' });
    if (pr.indexOf('schools') > -1) out.push({ id: 'schools', title: 'Schools', text: 'Not measured by our sales data.', card: 'schools' });
    if (pr.indexOf('location') > -1) out.push({ id: 'location', title: 'Better location', text: 'We can’t define a better location from sales data.', card: 'location quality' });
    if (pr.indexOf('investment') > -1) out.push({ id: 'investment', title: 'Investment potential', text: 'We hold no rental or yield data, so this list describes sales and prices only.', card: 'investment potential' });
    if (pr.indexOf('monthly') > -1) out.push({ id: 'monthly', title: 'Lower monthly commitment', text: 'Not measured by our sales data.', card: 'monthly commitment' });
    if (pr.indexOf('facilities') > -1) out.push({ id: 'facilities', title: 'Facilities and lifestyle', text: 'Not measured by our sales data.', card: 'facilities and lifestyle' });
    if (pr.indexOf('newer') > -1) out.push({ id: 'newer', title: 'Newer development', text: 'Not used to filter. Each card shows the lease start year, which is not the completion year.', card: 'completion year' });
    if (pr.indexOf('space') > -1) out.push({ id: 'space', title: 'More space', text: 'Not used to filter. The market comparison above shows what this budget buys in size.', card: null });
    if (a.size && a.size !== 'not-sure') out.push({ id: 'bedrooms', title: 'Bedroom count', text: 'Our data doesn’t record bedrooms, so this list can’t check it.', card: null });
    return out;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const joinAnd = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const notEvaluated = (un) => cap(joinAnd((un || []).map((u) => u.card).filter(Boolean).concat(BASE_NOT_EVAL))) + '.';

  /* ---------------------------------------------------------------- matching */
  /** One project, one sale type. Returns null unless it meets every evidence rule. */
  function matchProject(ix, p, sale, o) {
    const B = o.budget, pct = o.pct, rows = (p[sale] || []).filter((r) => r[0] + ix.bin / 2 >= o.lo && r[0] + ix.bin / 2 < o.hi);
    const fit = rows.filter((r) => r[4] <= B * (1 + pct) && r[6] >= B * (1 - pct));          // the middle half of that size's sale prices overlaps the budget window
    if (!fit.length) return null;
    const n = fit.reduce((a, r) => a + r[1], 0); if (n < T.minSales) return null;
    const last = Math.max.apply(null, fit.map((r) => r[3])); if (monthsBetween(ix.latest, last) > T.recencyMonths) return null;
    if (!fit.some((r) => r[2] >= T.minActiveMonths)) return null;
    const q1 = Math.min.apply(null, fit.map((r) => r[4])), q3 = Math.max.apply(null, fit.map((r) => r[6]));
    const bins = fit.map((r) => r[0]);
    return { id: p.id, sale, name: p.name, street: p.street, district: p.d, seg: p.seg, tenure: p.tl, mixed: !!p.m, tenGroup: p.tg, n, strength: n >= T.goodSales ? 'good' : 'limited', last, q1, q3,
      fit: B >= q1 && B <= q3 ? 'inside' : B > q3 ? 'above' : 'below', bandLo: Math.min.apply(null, bins), bandHi: Math.max.apply(null, bins) + ix.bin, multi: fit.length > 1 };
  }
  const FIT = { inside: 0, above: 1, below: 2 };
  const compare = (x, y) => (x.strength === y.strength ? 0 : x.strength === 'good' ? -1 : 1) || FIT[x.fit] - FIT[y.fit] || y.n - x.n || y.last - x.last || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0);

  /** Every eligible project for one sale type, in order. (No cap yet.) */
  function eligible(ix, sale, o) {
    const out = [];
    ix.projects.forEach((p) => {
      if (o.districts && o.districts.length && o.districts.indexOf(p.d) < 0) return;
      if (o.freehold && p.tg !== 4) return;
      if (!textMatch(p, o.text)) return;
      const m = matchProject(ix, p, sale, o); if (m) out.push(m);
    });
    return out.sort(compare);
  }
  function takeCapped(list, n) {
    const per = {}, out = [];
    for (const x of list) { if ((per[x.street] || 0) >= T.perStreet) continue; per[x.street] = (per[x.street] || 0) + 1; out.push(x); if (out.length >= n) break; }
    return out;
  }
  const saleTypes = (openTo) => (openTo === 'new' ? ['new'] : openTo === 'resale' ? ['resale'] : ['resale', 'new']);

  function count(ix, o) { return saleTypes(o.openTo).reduce((a, s) => a + eligible(ix, s, o).length, 0); }

  /* ---------------------------------------------------------------- wording */
  function why(c, o) {
    const home = 'Homes of about ' + sizeText(o.lo, o.hi) + ' sold here in the last 12 months, and your ' + m2(o.budget) + ' ';
    return home + (c.fit === 'inside' ? 'is within their typical prices.' : c.fit === 'above' ? 'is a little above their typical prices.' : 'is a little below their typical prices. Expect to look at the lower end.');
  }
  function card(c, o, un, ix) {
    return {
      id: c.id, name: displayName(c.name), sale: c.sale, saleLabel: c.sale === 'new' ? 'New launch' : 'Resale',
      meta: [displayName(c.street), 'District ' + Number(c.district), c.seg, c.tenure + (c.mixed ? ' (mixed tenure in the data)' : '')].join(' · '),
      why: why(c, o),
      evidence: c.n + ' sales in the last 12 months · latest ' + ymLabel(c.last) + ' · ' + (c.strength === 'good' ? 'Good' : 'Limited') + ' recent evidence',
      strength: c.strength,
      prices: 'Typical prices for these: ' + p2(c.q1) + '–' + p2(c.q3) + (c.multi ? ' (across ' + sizeText(c.bandLo, c.bandHi) + ')' : ''),
      indicative: c.sale === 'new' ? 'New-launch prices are indicative: they depend on the unit and the launch phase.' : null,
      notEvaluated: notEvaluated(un),
      link: '../../research/index.html#/p/' + c.id + '/' + c.sale, linkText: 'Research ' + c.name.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) + ' →',
    };
  }

  /* ---------------------------------------------------------------- the shortlist */
  /** input: { budget, openTo:'new'|'resale'|'both', size:{lo,hi,source,line}, districts:[], text, freehold:bool, answers:{where,size,priorities}, typical:{lo,hi}|null }
   *  Returns the whole view model. Never throws on a usable index. */
  function shortlist(ix, input) {
    const un = unsupported(input.answers), base = { budget: input.budget, pct: input.pct === T.widenBudgetPct ? T.widenBudgetPct : T.budgetPct, lo: input.size.lo, hi: input.size.hi, districts: input.districts || [], freehold: !!input.freehold, text: input.text || '', openTo: input.openTo };
    const types = saleTypes(input.openTo), lists = {}; types.forEach((s) => { lists[s] = eligible(ix, s, base); });
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
    const groups = types.map((s) => ({ sale: s, label: s === 'new' ? 'New launches' : 'Resale', note: s === 'new' ? 'New-launch prices are indicative.' : null, eligible: eligibleN[s], cards: (chosen[s] || []).map((c) => card(c, base, un, ix)) })).filter((g) => g.cards.length);
    const shown = groups.reduce((a, g) => a + g.cards.length, 0);
    const state = total === 0 ? 'none' : total < T.minSales ? 'few' : 'list';
    const out = { version: VERSION, state, total, shown, groups, eligible: eligibleN, size: input.size, unsupported: un, filters: { districts: base.districts, freehold: base.freehold, text: base.text, pct: base.pct }, dataTo: ix.latestMonth, window: ix.window,
      dataLine: 'Based on actual sales in the last 12 months (to ' + ymLabel(ix.latest) + ') around your budget and size.',
      orderLine: 'Listed by how much recent evidence there is, not by quality or value.', changes: [], reference: null, noneText: null };

    const asText = (n) => n + (n === 1 ? ' development' : ' developments');
    if (state === 'few') {
      const alts = [];
      const sz = count(ix, Object.assign({}, base, { lo: base.lo - T.sizePad, hi: base.hi + T.sizePad })); if (sz > total) alts.push({ id: 'size', label: 'Include nearby sizes (' + sizeText(base.lo - T.sizePad, base.hi + T.sizePad) + ')', count: sz, text: asText(sz) });
      const bd = count(ix, Object.assign({}, base, { pct: T.widenBudgetPct })); if (bd > total) alts.push({ id: 'budget', label: 'Widen the budget range to ±15%', count: bd, text: asText(bd) });
      if (base.districts.length || base.text) { const ar = count(ix, Object.assign({}, base, { districts: [], text: '' })); if (ar > total) alts.push({ id: 'area', label: 'Look across all of Singapore', count: ar, text: asText(ar) }); }
      out.changes = alts;
      out.fewText = 'Only ' + total + (total === 1 ? ' development' : ' developments') + (base.districts.length || base.text ? ' in this area' : '') + ' had enough recent sales to list.' + (alts.length ? ' You can change one thing to see more:' : '');
    }
    if (state === 'none') {
      const area = base.districts.length ? ' in ' + (base.districts.length === 1 ? 'District ' + Number(base.districts[0]) : 'these districts') : base.text ? ' matching “' + base.text + '”' : '';
      let t = 'No development' + area + ' had at least ' + T.minSales + ' sales of homes of ' + sizeText(base.lo, base.hi) + ' in the last 12 months at prices near ' + m2(base.budget) + '.';
      if (input.typical && input.typical.lo && !(input.size.source === 'inferred')) t += ' Around ' + m2(base.budget) + ', the homes that sold were typically about ' + sizeText(input.typical.lo, input.typical.hi) + ' (see above).';
      out.noneText = t;
      // reference: the lowest budget (in $50k steps, up to +50%) at which at least 3 developments qualify, with every other choice unchanged
      for (let b = base.budget + T.referenceStep; b <= base.budget * (1 + T.referenceMaxUp); b += T.referenceStep) { if (count(ix, Object.assign({}, base, { budget: b })) >= T.minSales) { out.reference = { budget: b, text: 'For reference, at about ' + m2(b) + ' we did find developments with enough sales of that size.' }; break; } }
      const widerArea = (base.districts.length || base.text) ? count(ix, Object.assign({}, base, { districts: [], text: '' })) : 0;
      if (widerArea >= T.minSales) out.changes = [{ id: 'area', label: 'Look across all of Singapore', count: widerArea, text: asText(widerArea) }];
    }
    return out;
  }

  /* ---------------------------------------------------------------- methodology (plain words; the only place the technical meaning lives) */
  const METHOD = [
    'Where the sales come from: private condominium and apartment sales recorded by URA, for new launches and resale. Sub-sales, Executive Condominiums and landed homes are not included.',
    'The window: the last 12 months of recorded sales. Older sales are never used to put a development on the list.',
    '“Typical prices” means the middle half of the sales: the range between the price a quarter of the sales were below and the price a quarter were above. Half of those sales fell inside it. It is not a price anyone should expect to pay for a particular unit.',
    'A development is listed only if homes of the size you chose sold there in the last 12 months at typical prices that overlap your budget (within about 10% either side), there were at least 3 such sales in the last 12 months, at least one of those sizes sold in two or more different months, and the latest of them was within the last 6 months of the data.',
    '“Good recent evidence” means 5 or more such sales. “Limited recent evidence” means 3 or 4.',
    'The order: evidence first (Good before Limited), then where your budget sits within the typical prices, then the number of such sales, then the most recent sale, then the development’s name A to Z. There is no score and nothing is weighted.',
    'If you gave no size in square feet, we used the sizes that typically sold at your budget. We never turn bedrooms into square feet, because our data doesn’t record bedrooms.',
    'Area filters use postal districts. The area names are general: a district contains places not named. We don’t match schools, workplaces, family locations, exact distances or neighbourhoods.',
    'This is a shortlist of developments worth investigating. It is not a recommendation or a valuation, and it doesn’t show what is for sale now or its asking price.',
  ];

  const ANALYTICS_KEYS = ['budget_band', 'result_bucket', 'size_source', 'area_filter', 'sale_groups'];
  const bucket = (n) => (n === 0 ? '0' : n < 3 ? '1-2' : n < 5 ? '3-4' : '5+');
  /** Bucketed and anonymous. Never the exact budget, typed text, size or project names. */
  function analytics(res, budgetBand) {
    return { budget_band: budgetBand, result_bucket: bucket(res.shown), size_source: res.size.source, area_filter: !!(res.filters.districts.length || res.filters.text), sale_groups: res.groups.map((g) => g.sale).join('+') || 'none' };
  }

  return { VERSION, T, DISTRICT_AREAS, districtLabel, districtShort, BASE_NOT_EVAL, METHOD, ANALYTICS_KEYS,
    displayName, prepare, inferSize, sizeWindow, matchDistricts, unsupported, notEvaluated, matchProject, eligible, shortlist, count, compare, why, card, analytics, bucket, m2, p2, num, sizeText, ymLabel, monthsBetween };
});
