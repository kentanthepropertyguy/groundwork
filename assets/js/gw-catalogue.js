/* ==========================================================================
   GROUNDWORK — New Launches catalogue ("Developer listings" on /research/new-launches/), V1 (Claude C FINAL r3, approved 29 Oct 2026).
   Part 1 is Claude C's reference rules (gw-catalogue-core.js), ported unchanged; part 2 (below) is the page renderer.
   Pure functions only (UMD), no file access. Inputs: the approved public inventory (data/projects/inventory.json v2), the permanent
   roster (data/projects/launch-roster.json), optional registry classes (EC tag) and featured microsite links, and "now".
   A consumer research view, not a live availability system: indicative developer listing prices with their last-checked date,
   shown for up to 60 days, then the project stays listed without prices. No sold-out labels in V1.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GW_CAT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DAY = 864e5;
  const CFG = {
    cadenceDays: 14,        // the fortnightly refresh; must equal kpt-find.js T.invCadenceDays (a contract test checks)
    priceLimitDays: 60,     // proposed: last prices shown, dated, for up to 60 days after their own check
    futureMs: 3600000,      // a check more than 1 hour in the future is not trusted
    step: 50000, band: 100, bigBand: 3000,
    wide: 1.6, noUpper: 2.0, narrow: 100000,
    psfReview: [1000, 6000], studioMaxBandStart: 800,
    sizeReview: { 1: 1000, 2: 1500, 3: 2200 },
    over: [0.10, 0.15],
  };
  // The approved FIND V1 district table, copied from kpt-find.js DISTRICT_AREAS (a contract test asserts equality).
  const DISTRICT_AREAS = {
    '01': 'Raffles Place, Marina', '02': 'Tanjong Pagar', '03': 'Queenstown, Tiong Bahru', '04': 'Telok Blangah, Harbourfront', '05': 'Pasir Panjang, Clementi', '06': 'City Hall, High Street',
    '07': 'Bugis, Golden Mile', '08': 'Little India', '09': 'Orchard, River Valley', '10': 'Bukit Timah, Holland, Tanglin', '11': 'Novena, Thomson', '12': 'Balestier, Toa Payoh',
    '13': 'Macpherson, Potong Pasir', '14': 'Geylang, Eunos', '15': 'Katong, Joo Chiat', '16': 'Bedok, Upper East Coast', '17': 'Changi, Loyang', '18': 'Tampines, Pasir Ris',
    '19': 'Hougang, Punggol, Serangoon Gardens', '20': 'Bishan, Ang Mo Kio', '21': 'Upper Bukit Timah, Clementi Park', '22': 'Jurong', '23': 'Bukit Batok, Bukit Panjang, Choa Chu Kang',
    '24': 'Lim Chu Kang, Tengah', '25': 'Woodlands, Kranji', '26': 'Upper Thomson, Springleaf', '27': 'Yishun, Sembawang', '28': 'Seletar',
  };
  const REGION = { CCR: 'Core Central', RCR: 'Rest of Central', OCR: 'Outside Central' };

  function tenureBucket(tl) {
    if (tl === 'Freehold') return 'freehold';
    const m = /^(\d+) yrs/.exec(tl || ''), y = m ? Number(m[1]) : 0;
    return y >= 900 ? 'freehold999' : y === 99 ? '99' : y ? 'other' : 'unknown';
  }
  // 'current' (within the 14-day cadence) | 'older' (15 to 60 days: prices shown with their date, marked as an older listing) | 'hidden'
  function freshness(checkedAt, now) {
    const at = Date.parse(checkedAt || ''); if (!isFinite(at) || !isFinite(now)) return 'hidden';
    const age = now - at; if (age < -CFG.futureMs) return 'hidden';
    if (age <= CFG.cadenceDays * DAY) return 'current';
    if (age <= CFG.priceLimitDays * DAY) return 'older';
    return 'hidden';
  }
  function deriveType(t) {
    const review = []; let quarantine = null;
    if (t.bedrooms === 0 && t.bands.some((b) => b[0] >= CFG.studioMaxBandStart)) quarantine = 'studio-size';
    t.bands.forEach((b) => { const psf = b[1] / (b[0] + CFG.band / 2); if (psf < CFG.psfReview[0] || psf > CFG.psfReview[1]) review.push('psf:' + b[0]); });
    const lim = CFG.sizeReview[t.bedrooms]; if (lim) t.bands.forEach((b) => { if (b[0] > lim) review.push('size:' + b[0]); });
    const from = Math.min.apply(null, t.bands.map((b) => b[1])), ratio = t.ceiling / from;
    const bands = t.bands.filter((b) => b[0] < CFG.bigBand).map((b) => ({ start: b[0], end: b[0] + CFG.band, from: b[1] }));
    const big = t.bands.filter((b) => b[0] >= CFG.bigBand);
    if (big.length) bands.push({ start: CFG.bigBand, end: null, from: Math.min.apply(null, big.map((b) => b[1])) });   // one broad "3,000+ sq ft" category
    const upper = ratio > CFG.noUpper ? null : t.ceiling;
    return { bedrooms: t.bedrooms, label: t.label, from, upper, about: upper != null && t.ceiling - from <= CFG.narrow, wide: ratio > CFG.wide && ratio <= CFG.noUpper, bands, review, quarantine };
  }

  // o: { inventory, roster, classes: {slug: 'ec'|...}, microsites: {slug: url}, now }
  function build(o) {
    const inv = {}; (o.inventory && o.inventory.projects || []).forEach((p) => { inv[p.slug] = p; });
    return o.roster.projects.map((r) => {
      const p = inv[r.slug], fr = p ? freshness(p.checkedAt, o.now) : 'hidden';
      const base = { slug: r.slug, name: r.displayName, district: r.district, districtName: DISTRICT_AREAS[r.district] || null, region: r.region, regionLabel: REGION[r.region] || null,
        tenure: r.tenure, tenureBucket: tenureBucket(r.tenure), street: r.street || null, classTag: o.classes && o.classes[r.slug] === 'ec' ? 'Executive Condominium' : null,
        microsite: (o.microsites && o.microsites[r.slug]) || null, lastChecked: p ? p.checkedAt : r.lastChecked, freshness: fr };
      if (fr === 'hidden') return Object.assign(base, { state: 'prices_hidden', types: [] });   // stays listed, without prices
      if (p.status !== 'ok') return Object.assign(base, { state: 'none_shown', types: [] });
      const all = p.byBedrooms.map(deriveType), shown = all.filter((t) => !t.quarantine);
      return Object.assign(base, { state: shown.length ? 'listed' : 'under_review', types: shown, held: all.filter((t) => t.quarantine).map((t) => ({ bedrooms: t.bedrooms, why: t.quarantine })) });
    });
  }
  // Budget tier for one type's matched "from" price F (rounded DOWN to $50k). B = maximum budget. allowance 0, 0.10 or 0.15.
  function tier(F, B, allowance) {
    if (F + CFG.step <= B) return 'within';
    if (F <= B) return 'around';
    if (allowance >= CFG.over[0] && F <= B * (1 + CFG.over[0])) return 'over10';
    if (allowance >= CFG.over[1] && F <= B * (1 + CFG.over[1])) return 'over15';
    return null;
  }
  const RANK = { within: 0, around: 1, over10: 2, over15: 3 };
  // Size overlap with [sizeMin, sizeMax] sq ft. The 3,000+ band is one broad category: it matches any range that reaches 3,000 sq ft.
  const bandIn = (b, f) => (f.sizeMax == null || b.start <= f.sizeMax) && (f.sizeMin == null || b.end == null || b.end > f.sizeMin);
  /* f: { beds: null | 0..5 (5 = 5+), max: null | number, allowance: 0 | 0.10 | 0.15, sizeMin, sizeMax, regions: [], districts: [], tenure: [], q }
     Returns null, or { tier, types: [{ bedrooms, from, upper, bands }] } where every figure comes from the SAME type's matched bands:
     "from" is the lowest matched band of that type; "upper" is shown only when all of that type's bands matched (the ceiling belongs to the whole type). */
  function matches(rec, f) {
    if (f.regions && f.regions.length && f.regions.indexOf(rec.region) < 0) return null;
    if (f.districts && f.districts.length && f.districts.indexOf(rec.district) < 0) return null;
    if (f.tenure && f.tenure.length) { const b = rec.tenureBucket === 'freehold999' ? 'freehold' : rec.tenureBucket; if (f.tenure.indexOf(b) < 0) return null; }
    if (f.q) { const q = f.q.toLowerCase(); if ((rec.name + ' ' + (rec.street || '') + ' D' + rec.district).toLowerCase().indexOf(q) < 0) return null; }
    const typed = f.beds != null || f.max != null || f.sizeMin != null || f.sizeMax != null;
    if (!typed) return { tier: 'within', types: rec.types.map((t) => ({ bedrooms: t.bedrooms, from: t.from, upper: t.upper, bands: t.bands })) };
    if (rec.state !== 'listed') return null;
    let best = null; const hit = [];
    rec.types.forEach((t) => {
      if (f.beds != null && Math.min(t.bedrooms, 5) !== f.beds) return;
      const bands = t.bands.filter((b) => bandIn(b, f)); if (!bands.length) return;
      const F = Math.min.apply(null, bands.map((b) => b.from)), tr = f.max != null ? tier(F, f.max, f.allowance || 0) : 'within'; if (!tr) return;
      hit.push({ bedrooms: t.bedrooms, from: F, upper: bands.length === t.bands.length ? t.upper : null, bands });
      if (!best || RANK[tr] < RANK[best]) best = tr;
    });
    return best ? { tier: best, types: hit } : null;
  }
  return { CFG, DISTRICT_AREAS, REGION, tenureBucket, freshness, deriveType, build, tier, matches };
});

/* ==========================================================================
   Part 2 — the renderer (Ken, 29 Oct 2026; Design Standard v1 §6: featured tiles first, then one panel: a 280px filter rail at ≥ 1280px beside
   a results table, cards at ≤ 760px). Pure HTML builders (GW_CAT_UI.html, .resultsHtml) for tests, and mount() for the page.
   Wording exactly as spec §5; never a unit count, "sold out", "available now" or the listings provider's name.
   Inert without data: if the roster or inventory is missing or invalid, only one quiet line shows under the featured block.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports.UI = factory(module.exports);
  else root.GW_CAT_UI = factory(root.GW_CAT);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // Singapore calendar date of a check: "27 Oct 2026" (accepts an ISO time or a YYYY-MM-DD roster date)
  function sgDate(v) {
    if (!v) return '';
    const t = /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(v + 'T00:00:00Z') : Date.parse(v) + 8 * 3600e3; if (!isFinite(t)) return '';
    const d = new Date(t); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  const money = (v) => (v >= 1e6 ? '$' + (Math.round(v / 1e4) / 100).toFixed(2).replace(/0$/, '').replace(/\.0$/, '') + 'm' : '$' + num(Math.round(v / 1000)) + 'k');
  const COLS = [0, 1, 2, 3, 4, 5], colLabel = (b) => (b === 0 ? 'Studio' : b === 5 ? '5+ bedrooms' : b + '-bedroom'), colHead = (b) => (b === 0 ? 'Studio' : b === 5 ? '5+' : String(b));
  function tenureText(t) {
    if (!t) return '';
    if (t === 'Freehold') return 'Freehold';
    const m = /^(\d+) yrs/.exec(t); return m ? m[1] + '-year leasehold' : t;
  }
  const metaText = (r) => ['District ' + Number(r.district), tenureText(r.tenure)].concat(r.classTag ? [r.classTag] : []).filter(Boolean).join(' · ');
  // §5: the line under the prices, by state
  function stateLine(r) {
    const d = sgDate(r.lastChecked);
    if (r.state === 'prices_hidden') return 'Prices not shown: last checked ' + d;
    if (r.state === 'none_shown') return 'No units currently shown · Last checked ' + d;
    if (r.state === 'under_review') return 'Listing details are being verified';
    return 'Indicative developer listing price · Last checked ' + d + (r.freshness === 'older' ? ' · older listing' : '');
  }
  // one bedroom column's figure: the lowest matched "from" of that column; "to" only when that type's highest price is shown
  function cellOf(types, b) {
    const ts = types.filter((t) => Math.min(t.bedrooms, 5) === b); if (!ts.length) return null;
    const t = ts.reduce((a, x) => (x.from < a.from ? x : a));
    return { from: t.from, upper: ts.length === 1 ? t.upper : null, wide: ts.length === 1 && !!t.wide };
  }
  // the matched types, each keeping its own "wide range" label (only shown with its highest price)
  const typesOf = (x) => (x.m ? x.m.types : x.rec.types).map((t) => Object.assign({}, t, { wide: t.upper != null && !!(x.rec.types.find((y) => y.bedrooms === t.bedrooms) || {}).wide }));
  // a card says "From $2.1m"; in the table the caption says the figures are from-prices, so a cell is "$2.1m" over "to $2.35m"
  const priceHtml = (c, cell) => '<b>' + (cell ? '' : 'From ') + money(c.from) + '</b>' + (c.upper != null && c.upper > c.from ? '<small>to ' + money(c.upper) + '</small>' + (c.wide ? '<small>wide range</small>' : '') : '');
  const TIER_NOTE = { around: 'At your maximum' };
  function links(r, o) {
    const a = [];
    // a featured project's own site: the page's existing microsite handler adds its attribution and tracks it (microsite_clicked), as for the featured tile
    if (r.microsite) { let host = ''; try { host = new URL(r.microsite).host; } catch (e) { host = ''; } a.push('<a class="gw-cat-lk" href="' + esc(r.microsite) + '" target="_blank" rel="noopener" data-kpt-ms="' + esc(r.slug) + '" data-host="' + esc(host) + '">Project site ↗</a>'); }
    if (o.research && o.research[r.slug]) a.push('<a class="gw-cat-lk" href="' + esc((o.root || '../../') + 'research/#/p/' + encodeURIComponent(r.slug)) + '" data-cat-link="research" data-cat-slug="' + esc(r.slug) + '">Past transactions ›</a>');
    return a.length ? '<span class="gw-cat-lks">' + a.join('') + '</span>' : '';
  }
  // x: { rec, m (matches() result), tier }
  function rowHtml(x, o) {
    const r = x.rec, priced = r.state === 'listed', types = typesOf(x);
    const dev = '<th scope="row" class="gw-cat-dev"><b>' + esc(r.name) + '</b><small>' + esc(metaText(r)) + '</small>' + (TIER_NOTE[x.tier] ? '<em class="gw-cat-tier">' + TIER_NOTE[x.tier] + '</em>' : '') + links(r, o) + '</th>';
    const cells = priced ? COLS.map((b) => { const c = cellOf(types, b); return '<td class="gw-cat-p"' + (c ? '' : ' data-empty') + '>' + (c ? priceHtml(c, true) : '<span aria-label="none">–</span>') + '</td>'; }).join('')
      : '<td class="gw-cat-st" colspan="6">' + esc(stateLine(r)) + '</td>';
    const last = '<td class="gw-cat-ck">' + (r.state === 'under_review' ? '' : esc(sgDate(r.lastChecked))) + (priced && r.freshness === 'older' ? '<small>older listing</small>' : '') + '</td>';
    return '<tr data-cat-slug="' + esc(r.slug) + '" data-cat-state="' + r.state + '" data-cat-fresh="' + r.freshness + '"' + (x.tier ? ' data-cat-tier="' + x.tier + '"' : '') + '>' + dev + cells + last + '</tr>';
  }
  function cardHtml(x, o) {
    const r = x.rec, priced = r.state === 'listed', types = typesOf(x);
    const lines = priced ? COLS.map((b) => { const c = cellOf(types, b); return c ? '<li><span>' + colLabel(b) + '</span><span class="gw-cat-cp">' + priceHtml(c) + '</span></li>' : ''; }).join('') : '';
    return '<li class="gw-cat-card" data-cat-slug="' + esc(r.slug) + '" data-cat-state="' + r.state + '" data-cat-fresh="' + r.freshness + '"' + (x.tier ? ' data-cat-tier="' + x.tier + '"' : '') + '>' +
      '<p class="gw-cat-cn"><b>' + esc(r.name) + '</b>' + (TIER_NOTE[x.tier] ? '<em class="gw-cat-tier">' + TIER_NOTE[x.tier] + '</em>' : '') + '</p><p class="gw-cat-cm">' + esc(metaText(r)) + '</p>' +
      (lines ? '<ul class="gw-cat-cl">' + lines + '</ul>' : '') + '<p class="gw-cat-cs">' + esc(stateLine(r)) + '</p>' + links(r, o) + '</li>';
  }
  function groupHtml(title, sub, xs, o, key) {
    if (!xs.length) return '';
    return '<section class="gw-cat-grp" data-cat-grp="' + key + '">' + (title ? '<h3 class="gw-cat-gh">' + esc(title) + '</h3>' + (sub ? '<p class="gw-cat-gs">' + esc(sub) + '</p>' : '') : '') +
      '<div class="gw-cat-tw"><table class="gw-cat-t"><caption class="gw-cat-cap">Indicative developer listing prices: from-price by bedroom type</caption><thead><tr><th scope="col">Development</th>' + COLS.map((b) => '<th scope="col" class="gw-cat-p">' + colHead(b) + '</th>').join('') + '<th scope="col" class="gw-cat-ck">Last checked</th></tr></thead><tbody>' +
      xs.map((x) => rowHtml(x, o)).join('') + '</tbody></table></div><ul class="gw-cat-cards" role="list">' + xs.map((x) => cardHtml(x, o)).join('') + '</ul></section>';
  }
  const STATE_ORDER = { listed: 0, none_shown: 1, under_review: 2, prices_hidden: 3 };
  const typed = (f) => f.beds != null || f.max != null || f.sizeMin != null || f.sizeMax != null;
  // The results for a filter: { main, over10, over15, n } (n = developments shown). Price filters apply only to listed projects (C.matches).
  function results(model, f) {
    const hits = []; model.forEach((rec) => { const m = C.matches(rec, f); if (m) hits.push({ rec, m, tier: f.max != null ? m.tier : null }); });
    const low = (x) => Math.min.apply(null, x.m.types.map((t) => t.from).concat([Infinity]));
    const byName = (a, b) => a.rec.name.localeCompare(b.rec.name);
    const main = hits.filter((x) => !x.tier || x.tier === 'within' || x.tier === 'around');
    if (typed(f)) main.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'within' ? -1 : b.tier === 'within' ? 1 : 0) || low(a) - low(b) || byName(a, b));
    else main.sort((a, b) => STATE_ORDER[a.rec.state] - STATE_ORDER[b.rec.state] || byName(a, b));
    const over = (t) => hits.filter((x) => x.tier === t).sort((a, b) => low(a) - low(b) || byName(a, b));
    const over10 = over('over10'), over15 = over('over15');
    return { main, over10, over15, n: main.length + over10.length + over15.length };
  }
  function resultsHtml(model, f, o) {
    o = o || {};
    const R = results(model, f);
    if (!R.n) return '<p class="gw-cat-none" data-cat-none>No developer listings match these filters.</p>';
    return groupHtml('', '', R.main, o, 'main') +
      groupHtml('Slightly over your budget', 'Up to 10% above your maximum.', R.over10, o, 'over10') +
      (f.allowance >= 0.15 ? groupHtml('Up to 15% over your budget', '', R.over15, o, 'over15') : '');
  }
  const TENURES = [['freehold', 'Freehold or 999-year'], ['99', '99-year'], ['other', 'Other leasehold']], REGIONS = [['CCR', 'Core Central'], ['RCR', 'Rest of Central'], ['OCR', 'Outside Central']];
  const BEDS = [['', 'Any'], ['0', 'Studio'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5+']];
  function filtersHtml(f, idp) {
    const p = idp || 'cat';
    const chk = (name, v, label, on) => '<label class="gw-cat-ck2"><input type="checkbox" name="' + name + '" value="' + esc(v) + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
    const ds = Object.keys(C.DISTRICT_AREAS);
    return '<form class="gw-cat-f" data-cat-form novalidate onsubmit="return false">' +
      '<label class="gw-cat-fl"><span>Search</span><input type="search" name="q" autocomplete="off" placeholder="Name, street or D19" value="' + esc(f.q || '') + '"></label>' +
      '<label class="gw-cat-fl"><span>Maximum budget</span><span class="gw-cat-money"><span aria-hidden="true">$</span><input type="text" inputmode="numeric" name="max" autocomplete="off" placeholder="e.g. 2,000,000" value="' + (f.max != null ? num(f.max) : '') + '"></span></label>' +
      '<label class="gw-cat-ck2 gw-cat-over"><input type="checkbox" name="over"' + (f.allowance >= 0.10 ? ' checked' : '') + '><span>Also show slightly over budget (up to 10%)</span></label>' +
      '<fieldset class="gw-cat-fs"><legend>Bedrooms</legend><div class="gw-cat-seg">' + BEDS.map((b) => '<label><input type="radio" name="beds" value="' + b[0] + '"' + (String(f.beds == null ? '' : f.beds) === b[0] ? ' checked' : '') + '><span>' + b[1] + '</span></label>').join('') + '</div></fieldset>' +
      '<fieldset class="gw-cat-fs"><legend>Size (sq ft)</legend><div class="gw-cat-size"><input type="text" inputmode="numeric" name="sizeMin" aria-label="Minimum size, sq ft" placeholder="Min" value="' + (f.sizeMin != null && !f.big ? num(f.sizeMin) : '') + '"' + (f.big ? ' disabled' : '') + '><span aria-hidden="true">to</span><input type="text" inputmode="numeric" name="sizeMax" aria-label="Maximum size, sq ft" placeholder="Max" value="' + (f.sizeMax != null ? num(f.sizeMax) : '') + '"' + (f.big ? ' disabled' : '') + '></div>' +
      chk('big', '1', '3,000 sq ft and above', f.big) + '</fieldset>' +
      '<fieldset class="gw-cat-fs"><legend>Region</legend>' + REGIONS.map((r) => chk('regions', r[0], r[1], (f.regions || []).indexOf(r[0]) > -1)).join('') + '</fieldset>' +
      '<details class="gw-cat-dd"' + ((f.districts || []).length ? ' open' : '') + '><summary>District' + ((f.districts || []).length ? ': ' + f.districts.map(Number).slice(0, 3).join(', ') + (f.districts.length > 3 ? ' +' + (f.districts.length - 3) : '') : '') + '</summary><div class="gw-cat-ddl">' +
        ds.map((d) => chk('districts', d, 'D' + Number(d) + ' · ' + C.DISTRICT_AREAS[d], (f.districts || []).indexOf(d) > -1)).join('') + '</div></details>' +
      '<fieldset class="gw-cat-fs"><legend>Tenure</legend>' + TENURES.map((t) => chk('tenure', t[0], t[1], (f.tenure || []).indexOf(t[0]) > -1)).join('') + '</fieldset>' +
      '</form>';
  }
  // the form's values as a filter (numbers parsed from "2,000,000"); nothing typed here leaves the page
  const DEFAULT = () => ({ q: '', max: null, allowance: 0, beds: null, sizeMin: null, sizeMax: null, big: false, regions: [], districts: [], tenure: [] });
  function readForm(form, prev) {
    const n = (v) => { const x = Number(String(v || '').replace(/[^0-9.]/g, '')); return String(v || '').trim() && isFinite(x) && x > 0 ? x : null; };
    const all = (k) => Array.from(form.querySelectorAll('input[name="' + k + '"]:checked')).map((i) => i.value);
    const big = !!form.querySelector('input[name="big"]:checked'), b = (form.querySelector('input[name="beds"]:checked') || {}).value;
    const max = n(form.max.value), over = !!form.querySelector('input[name="over"]:checked');
    return { q: form.q.value.trim(), max, allowance: max == null || !over ? 0 : prev && prev.allowance >= 0.15 ? 0.15 : 0.10, beds: b === '' || b == null ? null : Number(b),
      sizeMin: big ? 3000 : n(form.sizeMin.value), sizeMax: big ? null : n(form.sizeMax.value), big, regions: all('regions'), districts: all('districts'), tenure: all('tenure') };
  }
  function chipsHtml(f) {
    const c = [];
    if (f.q) c.push('“' + f.q + '”');
    if (f.max != null) c.push('Up to ' + money(f.max));
    if (f.beds != null) c.push(colLabel(f.beds));
    if (f.big) c.push('3,000 sq ft and above'); else if (f.sizeMin != null || f.sizeMax != null) c.push((f.sizeMin != null ? num(f.sizeMin) : 'Any') + '–' + (f.sizeMax != null ? num(f.sizeMax) : 'any') + ' sq ft');
    if (f.regions.length) c.push(f.regions.join(', '));
    if (f.districts.length) c.push('Districts: ' + f.districts.map(Number).slice(0, 3).join(', ') + (f.districts.length > 3 ? ' +' + (f.districts.length - 3) : ''));
    if (f.tenure.length) c.push(f.tenure.map((t) => ({ freehold: 'Freehold or 999-year', 99: '99-year', other: 'Other leasehold' }[t])).join(', '));
    return c.map((t) => '<span class="gw-cat-chip">' + esc(t) + '</span>').join('');
  }
  const FOOT = 'Prices and availability may have changed. Indicative developer listings, not live availability.';
  // the whole section (data loaded): o = { model, updated, research, root }
  function html(o, f) {
    f = f || DEFAULT();
    return '<section class="gw-cat" id="listings" aria-labelledby="catH" data-cat><div class="gw-wrap gw-cat-wrap">' +
      '<div class="gw-cat-head"><h2 id="catH">Developer listings</h2><p class="gw-cat-upd">Developer listings · Updated ' + esc(sgDate(o.updated)) + '</p></div>' +
      '<div class="gw-cat-body"><aside class="gw-cat-rail" aria-label="Filter developer listings">' + filtersHtml(f) + '</aside>' +
      '<div class="gw-cat-main"><div class="gw-cat-sum"><button type="button" class="gw-cat-fbtn" data-cat-open aria-haspopup="dialog">Filters</button><p class="gw-cat-n" data-cat-n></p><span class="gw-cat-chips" data-cat-chips></span><button type="button" class="gw-cat-clear" data-cat-clear hidden>Clear all</button></div>' +
      '<div class="gw-cat-res" data-cat-res aria-live="polite"></div><p class="gw-cat-foot">' + FOOT + '</p></div></div></div>' +
      '<div class="gw-cat-sheet" data-cat-sheet role="dialog" aria-modal="true" aria-labelledby="catSheetH" hidden><div class="gw-cat-sh"><h3 id="catSheetH">Filters</h3><button type="button" class="gw-cat-x" data-cat-close aria-label="Close filters">×</button></div><div class="gw-cat-sb"></div>' +
      '<div class="gw-cat-sf"><button type="button" class="gw-cat-show" data-cat-close></button></div></div></section>';
  }
  const QUIET = '<section class="gw-cat gw-cat-off" id="listings" data-cat-off><div class="gw-wrap gw-cat-wrap"><p class="gw-cat-quiet">Developer listings aren’t available right now.</p></div></section>';
  const plural = (n) => num(n) + (n === 1 ? ' development' : ' developments');

  /* ---------- the page ---------- */
  // host: an element after which the section is inserted (the featured block). opt: { root, track }
  function mount(host, opt) {
    opt = opt || {}; const root = opt.root || '../../', get = (p) => fetch(root + p, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
    const put = (h) => { const d = document.createElement('div'); d.innerHTML = h; const s = d.firstElementChild; host.parentNode.insertBefore(s, host.nextSibling); return s; };
    return Promise.all([get('data/projects/launch-roster.json'), get('data/projects/inventory.json')]).then(([roster, inv]) => {
      if (!roster || roster.kind !== 'kpt-launch-roster' || !Array.isArray(roster.projects) || !roster.projects.length || !inv || inv.v !== 2 || !Array.isArray(inv.projects)) throw new Error('data');
      const st = { f: DEFAULT(), o: { model: null, updated: inv.checkedAt, research: {}, root } };
      const build = (classes) => { st.o.model = C.build({ inventory: inv, roster, classes: classes || {}, microsites: opt.microsites || {}, now: Date.now() }); };
      build({});
      const sec = put(html(st.o, st.f)), res = sec.querySelector('[data-cat-res]'), sheet = sec.querySelector('[data-cat-sheet]'), rail = sec.querySelector('.gw-cat-rail');
      const draw = () => {
        const R = results(st.o.model, st.f); res.innerHTML = resultsHtml(st.o.model, st.f, st.o);
        if (st.f.max != null && st.f.allowance >= 0.10 && st.f.allowance < 0.15 && results(st.o.model, Object.assign({}, st.f, { allowance: 0.15 })).over15.length)
          res.insertAdjacentHTML('beforeend', '<p class="gw-cat-more"><button type="button" class="gw-cat-15" data-cat-15>Also show up to 15% over budget</button></p>');
        sec.querySelector('[data-cat-n]').textContent = plural(R.n);
        sec.querySelector('[data-cat-chips]').innerHTML = chipsHtml(st.f);
        sec.querySelector('[data-cat-clear]').hidden = JSON.stringify(st.f) === JSON.stringify(DEFAULT());
        sec.querySelector('.gw-cat-show').textContent = 'Show ' + plural(R.n);
      };
      const onForm = (form, key) => { st.f = readForm(form, st.f); const big = form.querySelector('input[name="big"]'); ['sizeMin', 'sizeMax'].forEach((k) => { form[k].disabled = !!(big && big.checked); });
        const dd = form.querySelector('.gw-cat-dd summary'); if (dd) dd.textContent = 'District' + (st.f.districts.length ? ': ' + st.f.districts.map(Number).slice(0, 3).join(', ') + (st.f.districts.length > 3 ? ' +' + (st.f.districts.length - 3) : '') : '');
        draw(); if (opt.track && key) opt.track('catalogue_filter', { filter: key, placement: 'new-launches' }); };
      const wireForm = (form) => {
        let t = null; form.addEventListener('input', (e) => { const k = e.target.name; clearTimeout(t); t = setTimeout(() => onForm(form, k), e.target.type === 'text' || e.target.type === 'search' ? 250 : 0); });
        form.addEventListener('change', (e) => { const k = e.target.name; if (k === 'max' || k === 'sizeMin' || k === 'sizeMax') { const v = Number(String(e.target.value).replace(/[^0-9]/g, '')); if (v > 0) e.target.value = num(v); } onForm(form, k); });
      };
      wireForm(rail.querySelector('form'));
      // phones and tablets: the same filters in a full-height sheet with a sticky "Show N developments"
      let opener = null;
      const openSheet = () => { sheet.querySelector('.gw-cat-sb').innerHTML = filtersHtml(st.f); wireForm(sheet.querySelector('form')); sheet.hidden = false; document.body.classList.add('gw-cat-lock'); opener = document.activeElement; const x = sheet.querySelector('[data-cat-close]'); if (x) x.focus(); };
      const closeSheet = () => { sheet.hidden = true; document.body.classList.remove('gw-cat-lock'); rail.innerHTML = filtersHtml(st.f); wireForm(rail.querySelector('form')); if (opener && opener.focus) opener.focus(); };
      sec.addEventListener('click', (e) => {
        if (e.target.closest('[data-cat-open]')) openSheet();
        else if (e.target.closest('[data-cat-close]')) closeSheet();
        else if (e.target.closest('[data-cat-clear]')) { st.f = DEFAULT(); rail.innerHTML = filtersHtml(st.f); wireForm(rail.querySelector('form')); draw(); }
        else if (e.target.closest('[data-cat-15]')) { st.f.allowance = 0.15; draw(); }
        const lk = e.target.closest('[data-cat-link]'); if (lk && opt.track) opt.track('catalogue_link', { target: lk.dataset.catLink, project_id: lk.dataset.catSlug, placement: 'new-launches' });
      });
      sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
      draw();
      // the registry (EC tags, "Past transactions" links): after the first draw, never blocking it
      get('data/registry/index.json').then((reg) => {
        const F = reg.fields, i = F.indexOf('id'), c = F.indexOf('cls'), classes = {}; reg.rows.forEach((r) => { st.o.research[r[i]] = true; if (r[c] === 'ec') classes[r[i]] = 'ec'; });
        build(classes); draw();
      }).catch(() => {});
      return sec;
    }).catch(() => { put(QUIET); return null; });
  }
  return { sgDate, money, tenureText, metaText, stateLine, cellOf, results, resultsHtml, filtersHtml, readForm, chipsHtml, html, mount, DEFAULT, FOOT, QUIET, COLS };
});
