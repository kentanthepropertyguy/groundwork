/* ==========================================================================
   GROUNDWORK — what homes in a private development actually sold for (25 Oct 2026).
   Three parts of the Research report, all answer first, total price before price per sq ft:
     1. "What each home type sells for": the approved bedroom aggregates (data/projects/bedroom, via GW_BED.view), one row per type. Where a
        development has no reliable types (or the sale type on show is not resales), the same rows by size band, worked out from the transactions
        below with the site's typical-price rule (5 sales over 3 months, last 12 months) and the pipeline's own quantile.
     2. "Recent sales": every individual transaction URA gives for the development (data/projects/tx, tools/market-data/build-tx-history.js):
        contract month, home type where its size is classified (floor plans or URA rental records; otherwise "unknown", never guessed), size
        (URA whole square metres, sq ft approximate), URA floor band, sale type, total price and psf. No unit numbers, exact floors or days exist.
        Records that look identical are kept: URA gives no unit numbers, so two units sold alike cannot be told from one record.
     3. The asking-price check's dots: the psf of each sale in the band the check uses, only when they are exactly the sales it counts.
   The transactions are shown only when they were built from the same URA data month as the page's own figures (pick), so a count, a median
   and the list under it always agree.
   UMD: window.GW_REC and Node (the pure parts).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GW_REC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SQFT = 10.7639, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const CODE = { new: 1, sub: 2, resale: 3 }, SALE = { 1: 'New sale', 2: 'Sub-sale', 3: 'Resale' };
  const WORD = { 1: ['new sale', 'new sales'], 2: ['sub-sale', 'sub-sales'], 3: ['resale', 'resales'], all: ['sale', 'sales'] };
  const TYPICAL = { n: 5, months: 3 }, PAGE = 15, PHONE_PAGE = 5;   // CX V2: a phone starts with the 5 most recent sales; "Show more" adds 15 at a time
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const money = (n) => '$' + num(n);
  // Prices people say: $915k, $1.28m (the full figure is in the title attribute), as GW_BED.short.
  const short = (v) => (!(v > 0) ? '–' : v >= 1e6 ? '$' + (Math.round(v / 1e4) / 100).toFixed(2).replace(/0$/, '').replace(/\.0$/, '') + 'm' : '$' + num(Math.round(v / 1000)) + 'k');
  const plural = (n, w) => num(n) + ' ' + w[n === 1 ? 0 : 1];
  const ymLabel = (v) => MON[(v % 100) - 1] + ' ' + Math.floor(v / 100);
  const ymAdd = (v, k) => { const i = Math.floor(v / 100) * 12 + (v % 100) - 1 + k; return Math.floor(i / 12) * 100 + (i % 12) + 1; };
  const ymInt = (s) => { const a = String(s || '').split('-').map(Number); return a[0] * 100 + a[1]; };
  const sqftOf = (sqm) => sqm * SQFT;
  const binOf = (sqm) => Math.floor(sqm * SQFT / 100) * 100;
  const psfOf = (r) => r[4] / (r[3] * SQFT);
  const bedLabel = (b) => (b === 0 ? 'Studio' : b + '-bedroom');
  const bandLabel = (bin) => num(bin) + '–' + num(bin + 99) + ' sq ft';
  // The pipeline's quantile (build-bands.js quantile: linear between closest ranks), so medians here match find.json and the bedroom files.
  function quantile(sorted, p) { const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }

  /* ---------------- the data ---------------- */
  // The development's transactions, only when built from the same URA data month as the page (data/projects/manifest.json).
  function pick(shard, meta, id, manifest) {
    if (!shard || !meta || !manifest || meta.latestMonth !== manifest.latestMonth) return null;
    const r = shard.projects ? shard.projects[id] : null;
    return r && r.rows ? { id, name: r.name, rows: r.rows, meta, latest: ymInt(meta.latestMonth), start: ymInt(meta.monthStart) } : null;
  }
  // f: { bed: 'all' | 'u' | '2', bin: 'all' | 600, sale: 'all' | 1..3, period: 'all' | 12 | 24, sort: 'new' | 'old' | 'high' | 'low' | 'psfHigh' | 'psfLow',
  //      size: null | [loSqft, hiSqft] } (Research Filters, Claude C FINAL §3.1: size is a group link's exact range, in the list's own rounded sq ft,
  //      inclusive; with size set, bin is 'all'). A missing size is null, so earlier callers (matchedRows, the Map) are unchanged.
  const DEFAULT = { bed: 'all', bin: 'all', sale: 'all', period: 'all', sort: 'new', size: null };
  const sqftR = (r) => Math.round(r[3] * SQFT);   // the size each row shows
  function test(f, latest) {
    const from = f.period && f.period !== 'all' ? ymAdd(latest, -(Number(f.period) - 1)) : 0, z = f.size;
    return (r) => (f.sale === 'all' || r[1] === Number(f.sale)) && (f.bed === 'all' || (f.bed === 'u' ? r[5] == null : r[5] === Number(f.bed))) &&
      (f.bin === 'all' || f.bin === 'range' || binOf(r[3]) === Number(f.bin)) && r[0] >= from && (!z || (sqftR(r) >= z[0] && sqftR(r) <= z[1]));
  }
  function filter(rows, f, latest) {
    const out = rows.filter(test(f, latest));
    const by = { new: (a, b) => b[0] - a[0], old: (a, b) => a[0] - b[0], high: (a, b) => b[4] - a[4], low: (a, b) => a[4] - b[4], psfHigh: (a, b) => psfOf(b) - psfOf(a), psfLow: (a, b) => psfOf(a) - psfOf(b) }[f.sort] || ((a, b) => b[0] - a[0]);
    return out.map((r, i) => [r, i]).sort((a, b) => by(a[0], b[0]) || a[1] - b[1]).map((x) => x[0]);   // stable: equal keys keep URA's order
  }
  const count = (rows, f, latest) => { const t = test(f, latest); let n = 0; for (let i = 0; i < rows.length; i++) if (t(rows[i])) n++; return n; };
  // §3.2: each option's N is the list's length were it chosen, every other filter as it is. A group's range is kept for Home type, Sale type and
  // Period; the Size options other than the range itself are counted without it (choosing one removes it).
  function facetCounts(rows, f, latest, O) {
    O = O || options(rows);
    const c = (k, v, drop) => count(rows, Object.assign({}, f, { [k]: v }, drop ? { size: null } : {}), latest), out = { bed: {}, bin: {}, sale: {}, period: {} };
    ['all'].concat(O.beds.map(String), O.unknown ? ['u'] : []).forEach((v) => { out.bed[v] = c('bed', v); });
    ['all'].concat(O.bins.map(String)).forEach((v) => { out.bin[v] = c('bin', v, true); });
    if (f.size) out.bin.range = count(rows, f, latest);
    ['all'].concat(O.sales.map(String)).forEach((v) => { out.sale[v] = c('sale', v); });
    ['all', '24', '12'].forEach((v) => { out.period[v] = c('period', v); });
    return out;
  }
  const isDefault = (f) => Object.keys(DEFAULT).every((k) => (k === 'size' ? !f.size : String(f[k]) === String(DEFAULT[k])));
  // What the filters can offer: only values that occur.
  function options(rows) {
    const beds = new Set(), bins = new Set(), sales = new Set(); let unknown = false;
    rows.forEach((r) => { if (r[5] == null) unknown = true; else beds.add(r[5]); bins.add(binOf(r[3])); sales.add(r[1]); });
    return { beds: Array.from(beds).sort((a, b) => a - b), unknown, bins: Array.from(bins).sort((a, b) => a - b), sales: [3, 1, 2].filter((s) => sales.has(s)) };
  }
  // The sales an asking-price check counts: one sale type, one 100 sq ft band, the last 12 months. Returns their psf, or null when they are not
  // exactly the sales the check's own figures describe (count, lowest and highest psf), so a dot is never a sale the range didn't use.
  function bandPsf(rec, saleCode, bin, band) {
    if (!rec || !band || !(band.n > 0)) return null;
    const from = ymAdd(rec.latest, -11), rows = rec.rows.filter((r) => r[1] === saleCode && r[0] >= from && r[0] <= rec.latest && binOf(r[3]) === bin);
    if (rows.length !== band.n) return null;
    const ps = rows.map(psfOf), lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps);
    if (band.lo !== undefined && (Math.abs(lo - band.lo) > 1.5 || Math.abs(hi - band.hi) > 1.5)) return null;
    return ps.map((v) => Math.round(v));
  }
  // Typical price by size (the fallback where bedroom types aren't reliable): sale type on show, last 12 months, 5 sales over 3 months.
  function sizeRows(rec, saleCode) {
    if (!rec) return { rows: [], few: [] };
    const from = ymAdd(rec.latest, -11), g = new Map();
    rec.rows.forEach((r) => { if (r[1] !== saleCode || r[0] < from || r[0] > rec.latest) return; const b = binOf(r[3]); (g.get(b) || g.set(b, []).get(b)).push(r); });
    const rows = [], few = [];
    Array.from(g.keys()).sort((a, b) => a - b).forEach((bin) => {
      const l = g.get(bin), act = new Set(l.map((r) => r[0])).size;
      if (l.length < TYPICAL.n || act < TYPICAL.months) { few.push({ bin, n: l.length }); return; }
      const pr = l.map((r) => r[4]).sort((a, b) => a - b), ps = l.map(psfOf).sort((a, b) => a - b);
      rows.push({ bin, n: l.length, act, price: [pr[0], quantile(pr, 0.25), quantile(pr, 0.5), quantile(pr, 0.75), pr[pr.length - 1]].map(Math.round), psf: Math.round(quantile(ps, 0.5)) });
    });
    return { rows, few, from, to: rec.latest };
  }

  /* ---------------- 1. what each home type (or size) sells for ---------------- */
  // BV: GW_BED.view(...) for the sale type on show (resales). Each row selects the type for the whole report (the page wires [data-gwr-bed]).
  // "Recent resale prices by home type" (Ken, 29 Oct 2026): one row per bedroom type, typical-price types and (with o.cells = GW_BED.tierCells) the
  // matched-only types with an approved r2 tier, in bedroom order. Each row has at most two cells that say what their price is: a typical price
  // and the middle half (or lowest – highest), a size group's median, or historical matched transactions. Never a whole-type price for a
  // matched-only type. A row selects its type (the page wires [data-gwr-bed]; in the search preview it opens the full research on that type).
  const BORD = (g) => (g === '0' ? 0 : g === 'PH' ? 9 : Number(g) || 8);
  function typeRows(BV, o) {
    if (!BV) return [];
    const cells = o && o.cells, out = (BV.types || []).map((t) => ({ g: t.g, t }));
    if (cells) (BV.only || []).forEach((m) => { const c = cells(m); if (c.length) out.push({ g: m.g, m, c }); });
    return out.sort((a, b) => BORD(a.g) - BORD(b.g));
  }
  function typesHtml(BV, o) {
    o = o || {};
    const R = typeRows(BV, o);
    if (!R.length) return '';
    const w = WORD[3], lab = o.label || ((g) => (g === 'PH' ? 'Penthouse' : g === '0' ? 'Studio' : g + '-bedroom'));
    const cell = (c) => '<span class="gwr-c' + (c.range ? ' gwr-c-r' : '') + '"' + (c.range ? ' data-gwr-range' : '') + '><small class="gwr-ck">' + esc(c.k) + '</small><b' + (c.title ? ' title="' + esc(c.title) + '"' : '') + '>' + esc(c.v) + '</b><small class="gwr-cd">' + esc(c.d) + '</small></span>';
    const aCells = (t) => {
      const size = t.sqft[0] === t.sqft[1] ? num(t.sqft[0]) + ' sq ft' : num(t.sqft[0]) + '–' + num(t.sqft[1]) + ' sq ft';
      return [{ k: 'Typical price', v: short(t.price[2]), title: money(t.price[2]), d: plural(t.n, w) + ' · ' + (t.win === 12 ? 'last 12 months' : 'last 2 years') },
        { k: t.n >= 4 ? 'Middle half' : 'Lowest – highest', v: t.n >= 4 ? short(t.price[1]) + ' – ' + short(t.price[3]) : short(t.price[0]) + ' – ' + short(t.price[4]), d: size + ' · ' + money(t.psf[2]) + ' psf' }];
    };
    const row = (r) => '<button type="button" class="gwr-row gwr-row2" data-gwr-bed="' + esc(r.g) + '" data-gwr-tier="' + (r.t ? 'typical' : r.c[0].range ? 'historical' : 'median') + '" aria-pressed="' + (BV.g === r.g) + '">' +
      '<span class="gwr-t">' + esc(lab(r.g)) + (r.m ? '<small>Matched sales only</small>' : '') + '</span>' +
      '<span class="gwr-cs">' + (r.t ? aCells(r.t) : r.c).map(cell).join('') + '</span></button>';
    // matched-only types without a tier (v1.2 data, or no o.cells): counts only, as before (never a price here)
    const shown = new Set(R.map((r) => r.g)), rest = (BV.only || []).filter((m) => !shown.has(m.g));
    const also = rest.length ? '<p class="lg-fine gwr-also" data-gwr-also>Also matched (matched sales only): ' + rest.map((m) => '<button type="button" class="kpr-link" data-gwr-mbed="' + esc(m.g) + '">' + esc(lab(m.g)) + ' ' + num(m.n24) + '</button>').join(', ') + '</p>' : '';
    const few = BV.few && BV.few.length ? '<p class="lg-fine" data-gwr-few>' + BV.few.map((g) => esc(lab(g))).join(' and ') + ': too few recent resales to show a typical price.</p>' : '';
    const anyM = R.some((r) => r.m);
    return '<section class="lg-band gwr-band" id="lgTypes" aria-labelledby="lgTypesH"><div class="lg-wrap gwr-wrap"><div class="gwr-head"><p class="lg-kicker">By home type</p><h2 id="lgTypesH">Recent resale prices by home type</h2>' +
      '<p class="lg-sub">From past URA resales here. Choose a home type for its details.</p></div>' +
      '<div class="gwr-rows" role="group" aria-label="Home types">' + R.map(row).join('') + '</div>' + also + few +
      '<p class="lg-fine" data-gwr-qual>' + 'Past resales, not valuations. Bedroom types are matched from floor plans or URA rental records' + (anyM ? '; a median or historical price covers only the sizes shown.' : '.') + '</p></div></section>';
  }
  // The same rows by size, where bedroom types aren't shown. sale: 'resale' | 'new' | 'sub'.
  function sizesHtml(rec, sale, o) {
    o = o || {};
    const code = CODE[sale] || 3, S = sizeRows(rec, code), w = WORD[code];
    if (!S.rows.length) return '';
    const row = (x) => '<button type="button" class="gwr-row" data-gwr-bin="' + x.bin + '" aria-pressed="' + (o.bin === x.bin) + '">' +
      '<span class="gwr-t">' + bandLabel(x.bin) + '</span>' +
      '<span class="gwr-p"><b title="' + esc(money(x.price[2])) + '">' + short(x.price[2]) + '</b><small>typical</small></span>' +
      '<span class="gwr-r">' + short(x.price[1]) + ' – ' + short(x.price[3]) + '<small>middle half</small></span>' +
      '<span class="gwr-m">' + plural(x.n, w) + ' · ' + money(x.psf) + ' psf</span></button>';
    const id = o.id || 'lgTypes';   // 'lgSizes' when it follows the home types
    return '<section class="lg-band gwr-band" id="' + id + '" aria-labelledby="' + id + 'H"><div class="lg-wrap gwr-wrap"><div class="gwr-head"><p class="lg-kicker">By size</p><h2 id="' + id + 'H">What each size sells for</h2>' +
      '<p class="lg-sub">' + esc(w[1].charAt(0).toUpperCase() + w[1].slice(1)) + ' here in the last 12 months, by size: the typical (median) total price and the range most of them sold within. Sizes with fewer than 5 sales over 3 months aren’t shown; their sales are listed below.</p></div>' +
      '<div class="gwr-rows" role="group" aria-label="Sizes">' + S.rows.map(row).join('') + '</div>' +
      (o.why ? '<p class="lg-fine">' + esc(o.why) + '</p>' : '') + '<p class="lg-fine">Past sales, not a valuation.</p></div></section>';
  }

  /* ---------------- V2.1: a matched-only type's latest matched resales (Amendment 1, Ken 29 Oct 2026) ---------------- */
  // Exactly the first k rows "See these sales" lists (that bedroom count, resales, last 2 years, newest first). Never sorted by price.
  function matchedRows(rec, g, k) {
    if (!rec || !rec.rows || g == null || !(k > 0)) return [];
    return filter(rec.rows, { bed: String(g), bin: 'all', sale: 3, period: 24, sort: 'new' }, rec.latest).slice(0, k);
  }
  // One line per sale: contract month, approximate size and the URA price, with the Transactions flags. Nothing computed across them.
  function matchedRowsHtml(rows) {
    if (!rows || !rows.length) return '';
    return '<ul class="gwr-mrows" role="list">' + rows.map((r) => {
      const tags = [];
      if (r[7] & 1) tags.push('before the developer’s discount');
      if (r[7] & 2) tags.push('unusual price for this development');
      if (r[7] & 8 && r[5] != null) tags.push('unusual size for a ' + bedLabel(r[5]));
      return '<li class="gwr-mrow" data-gwr-mrow data-ym="' + r[0] + '"><span class="gwr-mrow-mo">' + ymLabel(r[0]) + '</span><span class="gwr-mrow-sz">≈ ' + num(sqftOf(r[3])) + ' sq ft</span>' +
        '<b class="gwr-mrow-pr">' + money(r[4]) + '</b>' + (tags.length ? '<small class="gwr-flag">' + esc(tags.join(' · ')) + '</small>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  /* ---------------- 2. recent sales ---------------- */
  // Research Filters (Claude C FINAL §2): the same five selects; each option with its count, an option with no sales disabled (never the one chosen).
  const sel = (k, label, opts, v, N) => '<label class="gwr-f"><span>' + label + '</span><select data-gwr-f="' + k + '">' + opts.map((o) => {
    const on = String(o[0]) === String(v), n = N ? N[String(o[0])] : null;
    return '<option value="' + esc(o[0]) + '"' + (on ? ' selected' : '') + (n === 0 && !on ? ' disabled' : '') + '>' + esc(o[1]) + (n != null ? ' (' + num(n) + ')' : '') + '</option>'; }).join('') + '</select></label>';
  const sizeLabel = (z) => '≈ ' + (z[0] === z[1] ? num(z[0]) : num(z[0]) + '–' + num(z[1])) + ' sq ft';
  function filtersHtml(rec, f) {
    const O = options(rec.rows), N = facetCounts(rec.rows, f, rec.latest, O);
    return '<div class="gwr-fs" role="group" aria-label="Filter the sales">' +
      sel('bed', 'Home type', [['all', 'All types']].concat(O.beds.map((b) => [b, bedLabel(b)]), O.unknown ? [['u', 'Type unknown']] : []), f.bed, N.bed) +
      sel('bin', 'Size', (f.size ? [['range', sizeLabel(f.size)]] : []).concat([['all', 'All sizes']], O.bins.map((b) => [b, bandLabel(b)])), f.size ? 'range' : f.bin, N.bin) +
      sel('sale', 'Sale type', [['all', 'All sale types']].concat(O.sales.map((s) => [s, SALE[s] + 's'])), f.sale, N.sale) +
      sel('period', 'Period', [['all', 'Since ' + ymLabel(rec.start)], [24, 'Last 2 years'], [12, 'Last 12 months']], f.period, N.period) +
      sel('sort', 'Order', [['new', 'Newest first'], ['old', 'Oldest first'], ['high', 'Highest price'], ['low', 'Lowest price'], ['psfHigh', 'Highest psf'], ['psfLow', 'Lowest psf']], f.sort) + '</div>';
  }
  function rowHtml(r, M) {
    const fb = M.floorBands[r[2]], beds = r[5], basis = r[6] === 'v' ? 'floor plans' : r[6] === 'i' ? 'rental records' : '';
    const tags = [];
    if (r[7] & 1) tags.push('before the developer’s discount');
    if (r[7] & 2) tags.push('unusual price for this development');
    const typeTag = r[7] & 8 && beds != null ? '<small class="gwr-flag">unusual size for a ' + esc(bedLabel(beds)) + '</small>' : '';
    return '<tr' + (r[7] & 4 ? ' data-gwr-same' : '') + '><td class="gwr-mo">' + ymLabel(r[0]) + '</td>' +
      '<td class="gwr-ty">' + (beds != null ? esc(bedLabel(beds)) + '<small>' + basis + '</small>' : '<span class="gwr-unk">Type unknown</span>') + typeTag + '</td>' +
      '<td class="gwr-sz">≈ ' + num(sqftOf(r[3])) + ' sq ft<small>' + r[3] + ' sqm</small></td>' +
      '<td class="gwr-fl">' + (fb ? 'Floors ' + esc(fb.replace('-', '–')) : '–') + '</td>' +
      '<td class="gwr-sa">' + SALE[r[1]] + '</td>' +
      '<td class="gwr-pr"><b>' + money(r[4]) + '</b><small>' + money(psfOf(r)) + ' psf</small>' + (tags.length ? '<small class="gwr-flag">' + tags.join(' · ') + '</small>' : '') + '</td></tr>';
  }
  function listHtml(rec, f, shown) {
    const list = filter(rec.rows, f, rec.latest), n = list.length, k = Math.min(n, shown || PAGE), M = rec.meta;
    if (!n) return '<p class="gwr-none" data-gwr-count="0">No sales match these filters. <button type="button" class="kpr-link" data-gwr-reset>Show all sales</button></p>';   // also when the chosen option has reached 0
    const m0 = Math.min.apply(null, list.map((r) => r[0])), m1 = Math.max.apply(null, list.map((r) => r[0])), span = m0 === m1 ? ymLabel(m0) : ymLabel(m0) + ' – ' + ymLabel(m1);
    const same = list.slice(0, k).some((r) => r[7] & 4);
    // V2: with a home type chosen, how many sales are that type and how many here (same other filters) have no bedroom count and could be it.
    let note = '';
    if (f.bed !== 'all' && f.bed !== 'u' && f.bed != null) {
      const u = filter(rec.rows, Object.assign({}, f, { bed: 'u' }), rec.latest).length;
      note = '<p class="lg-fine gwr-bednote" data-gwr-bednote data-n="' + n + '" data-m="' + u + '">Showing the ' + plural(n, WORD.all) + ' matched as ' + esc(bedLabel(Number(f.bed))) + '.' +
        (u ? ' ' + num(u) + ' other ' + WORD.all[u === 1 ? 0 : 1] + ' here could not be matched to a bedroom count and ' + (u === 1 ? 'may be one more.' : 'may include more.') : '') + '</p>';
    }
    // §3.5: Type unknown explained where it is chosen
    if (f.bed === 'u') note = '<p class="lg-fine gwr-unote" data-gwr-unote>URA doesn’t record bedrooms. These sales are at sizes Groundwork couldn’t match to one bedroom count, so no home type is shown. They could be any type.</p>';
    // §3.4: the answer line, from the complete filtered set (never the rows on screen): the actual lowest and highest sale and psf
    const ps = list.map((r) => r[4]), pf = list.map(psfOf), lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps), plo = Math.min.apply(null, pf), phi = Math.max.apply(null, pf);
    const ans = n === 1 ? money(list[0][4]) + ' · ' + money(psfOf(list[0])) + ' psf' : 'lowest to highest ' + money(lo) + ' to ' + money(hi) + ' · ' + money(plo) + ' to ' + money(phi) + ' psf';
    const clear = isDefault(f) ? '' : '<button type="button" class="kpr-link gwr-clear" data-gwr-clear>Clear filters</button>';
    return note + '<div class="gwr-ans"><p class="gwr-count" data-gwr-count="' + n + '"><b>' + num(n) + ' past ' + WORD.all[n === 1 ? 0 : 1] + '</b> · ' + span + ' · <span data-gwr-ans>' + ans + '</span></p>' + clear + '</div>' +
      '<p class="lg-fine gwr-ansfine" data-gwr-ansfine>Individual URA transactions, not a typical price or a valuation.</p>' +
      '<div class="gwr-scroll"><table class="gwr-table"><thead><tr><th scope="col">Month</th><th scope="col">Home type</th><th scope="col">Size</th><th scope="col">Floor</th><th scope="col">Sale</th><th scope="col">Price</th></tr></thead><tbody>' +
      list.slice(0, k).map((r) => rowHtml(r, M)).join('') + '</tbody></table></div>' +
      (n > k ? '<p class="lg-fine gwr-showing" data-gwr-showing>Showing ' + num(k) + ' of ' + num(n) + '.</p><button type="button" class="lg-btn gwr-more" data-gwr-more>Show ' + Math.min(PAGE, n - k) + ' more</button>' : '') +
      (same ? '<p class="lg-fine" data-gwr-same-note>Some sales share the same month, size, floor band and price. URA gives no unit numbers, so each is listed as URA records it.</p>' : '');
  }
  function txHtml(rec, f, o) {
    o = o || {};
    if (!rec || !rec.rows.length) return '';
    return '<section class="lg-band gwr-band gwr-tx" id="lgTx" aria-labelledby="lgTxH"><div class="lg-wrap gwr-wrap"><div class="gwr-head"><p class="lg-kicker">Transactions</p><h2 id="lgTxH">What homes here actually sold for</h2>' +
      '<p class="lg-sub">Every sale URA records here since ' + ymLabel(rec.start) + ', newest first. Total price, then price per sq ft.</p></div>' +
      filtersHtml(rec, f) + '<div data-gwr-list aria-live="polite">' + listHtml(rec, f, o.shown) + '</div>' +
      '<details class="lg-finedet gwr-notes"><summary>Past sales, not a valuation. <span>How URA records these</span></summary><p class="lg-fine">URA gives the contract month (not the day), a floor band (not the floor) and the area in whole square metres, so sq ft is approximate. There are no unit numbers. Home type is shown only where Groundwork could match the size to a bedroom count, from floor plans or URA rental records; otherwise it is “unknown”, never guessed.</p></details></div></section>';
  }
  /* Research Filters Part 2 (Claude C FINAL §4): "See these {n} sales" for an R2 size group, read-only from its published { sqft, win, n }. Rendered only
     when the list would show exactly the group's n sales (otherwise nothing, and one console note on a local copy). */
  const grpOf = (v) => { const p = String(v).split('|'); return { g: p[0], lo: Number(p[1]), hi: Number(p[2]), win: Number(p[3]), n: Number(p[4]) }; };
  const grpState = (g, q) => ({ bed: String(g), bin: 'all', sale: '3', period: String(q.win), sort: 'new', size: [q.sqft[0], q.sqft[1]] });
  let grpWarned = false;
  function groupLink(rec, g, q) {
    if (!rec || !rec.rows || !q || !q.sqft) return '';
    if (count(rec.rows, grpState(g, q), rec.latest) !== q.n) {
      if (!grpWarned && typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && typeof console !== 'undefined') { grpWarned = true; console.warn('gw-records: a size group does not match its sales', g, q); }
      return '';
    }
    return '<button type="button" class="kpr-link gwr-grp" data-gwr-grp="' + esc([g, q.sqft[0], q.sqft[1], q.win, q.n].join('|')) + '">See these ' + num(q.n) + ' ' + WORD.all[q.n === 1 ? 0 : 1] + '</button>';
  }
  // The filters a visitor starts with: the type or size chosen at the top of the report, and the sale type on show.
  function startFilter(o) { return { bed: o.bed != null && o.bed !== '' && /^\d+$/.test(String(o.bed)) ? String(o.bed) : 'all', bin: o.bin != null ? String(o.bin) : 'all', sale: o.sale ? String(CODE[o.sale] || 'all') : 'all', period: 'all', sort: 'new' }; }

  /* ---------------- browser ---------------- */
  // app: the report; st: { rec, f, shown } kept by the page across redraws.
  function wire(app, st, o) {
    o = o || {};
    const sec = app.querySelector('#lgTx'); if (!sec || !st || !st.rec) return;
    const list = sec.querySelector('[data-gwr-list]');
    // every change redraws the filters too (their counts and the group's range option, §3.2-3.3), keeping keyboard focus on the select used
    const draw = (focusK) => {
      const fs = sec.querySelector('.gwr-fs'); if (fs) fs.outerHTML = filtersHtml(st.rec, st.f);
      list.innerHTML = listHtml(st.rec, st.f, st.shown);
      if (focusK) { const s = sec.querySelector('[data-gwr-f="' + focusK + '"]'); if (s) s.focus({ preventScroll: true }); }
    };
    sec.addEventListener('change', (e) => {
      const s = e.target.closest && e.target.closest('[data-gwr-f]'); if (!s) return;
      const k = s.dataset.gwrF;
      if (k === 'bin') { if (s.value !== 'range') { st.f.size = null; st.f.bin = s.value; } }   // another size removes a group's range
      else st.f[k] = s.value;
      st.shown = st.page || PAGE; draw(k); if (o.track) o.track(k);
    });
    sec.addEventListener('click', (e) => {
      if (e.target.closest('[data-gwr-more]')) { st.shown = (st.shown || PAGE) + PAGE; draw(); }
      if (e.target.closest('[data-gwr-reset],[data-gwr-clear]')) { st.f = Object.assign({}, DEFAULT); st.shown = st.page || PAGE; draw(); const fs = sec.querySelector('[data-gwr-f="bed"]'); if (fs) fs.focus({ preventScroll: true }); }
    });
    sec.__gwrDraw = draw;
    // "See these sales" in the asking-price result: the exact sales its dots are. One listener per report element, whatever the redraws.
    app.__gwrSt = st;
    if (!app.__gwrShow) {
      app.__gwrShow = true;
      app.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('[data-gwr-show],[data-gwr-mbed],[data-gwr-grp]'), s = app.querySelector('#lgTx'), cur = app.__gwrSt; if (!b || !s || !cur || !s.__gwrDraw) return;
        // V2 "See these sales" for a matched-only type: its matched resales of the last 2 years (the same rows as its count).
        if (b.dataset.gwrMbed != null) cur.f = { bed: String(b.dataset.gwrMbed), bin: 'all', sale: '3', period: '24', sort: 'new', size: null };
        // Research Filters Part 2 (§4): a size group's exact sales: its type, resales, its window, its sizes
        else if (b.dataset.gwrGrp != null) { const q = grpOf(b.dataset.gwrGrp); cur.f = { bed: q.g, bin: 'all', sale: '3', period: String(q.win), sort: 'new', size: [q.lo, q.hi] }; }
        else { const p = b.dataset.gwrShow.split('|'); cur.f = { bed: 'all', bin: p[0], sale: p[1], period: '12', sort: 'new', size: null }; }
        cur.shown = cur.page || PAGE; s.__gwrDraw();
        s.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  return { SQFT, CODE, SALE, PAGE, PHONE_PAGE, DEFAULT, pick, filter, facetCounts, groupLink, grpState, isDefault, options, bandPsf, sizeRows, quantile, typesHtml, sizesHtml, txHtml, matchedRows, matchedRowsHtml, listHtml, filtersHtml, startFilter, wire, binOf, psfOf, ymAdd, ymLabel, short, bedLabel, bandLabel };
});
