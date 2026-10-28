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
  // f: { bed: 'all' | 'u' | '2', bin: 'all' | 600, sale: 'all' | 1..3, period: 'all' | 12 | 24, sort: 'new' | 'old' | 'high' | 'low' }
  function filter(rows, f, latest) {
    const from = f.period && f.period !== 'all' ? ymAdd(latest, -(Number(f.period) - 1)) : 0;
    const out = rows.filter((r) => (f.sale === 'all' || r[1] === Number(f.sale)) && (f.bed === 'all' || (f.bed === 'u' ? r[5] == null : r[5] === Number(f.bed))) &&
      (f.bin === 'all' || binOf(r[3]) === Number(f.bin)) && r[0] >= from);
    const by = { new: (a, b) => b[0] - a[0], old: (a, b) => a[0] - b[0], high: (a, b) => b[4] - a[4], low: (a, b) => a[4] - b[4] }[f.sort] || ((a, b) => b[0] - a[0]);
    return out.map((r, i) => [r, i]).sort((a, b) => by(a[0], b[0]) || a[1] - b[1]).map((x) => x[0]);   // stable: equal keys keep URA's order
  }
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
  function typesHtml(BV, o) {
    o = o || {};
    if (!BV || !BV.types || !BV.types.length) return '';
    const w = WORD[3], lab = o.label || ((g) => (g === 'PH' ? 'Penthouse' : g === '0' ? 'Studio' : g + '-bedroom'));
    const row = (t) => {
      const sel = BV.g === t.g, range = t.n >= 4 ? short(t.price[1]) + ' – ' + short(t.price[3]) : short(t.price[0]) + ' – ' + short(t.price[4]);
      const size = t.sqft[0] === t.sqft[1] ? num(t.sqft[0]) + ' sq ft' : num(t.sqft[0]) + '–' + num(t.sqft[1]) + ' sq ft';
      return '<button type="button" class="gwr-row" data-gwr-bed="' + esc(t.g) + '" aria-pressed="' + sel + '">' +
        '<span class="gwr-t">' + esc(lab(t.g)) + '</span>' +
        '<span class="gwr-p"><b title="' + esc(money(t.price[2])) + '">' + short(t.price[2]) + '</b><small>typical</small></span>' +
        '<span class="gwr-r">' + range + '<small>' + (t.n >= 4 ? 'middle half' : 'lowest – highest') + '</small></span>' +
        '<span class="gwr-m">' + plural(t.n, w) + (t.win === 12 ? '' : ' in 2 years') + ' · ' + size + ' · ' + money(t.psf[2]) + ' psf</span></button>';
    };
    // V2: types with matched resales but no figures, counts only, each opening its sales below (never a price here).
    const also = BV.only && BV.only.length ? '<p class="lg-fine gwr-also" data-gwr-also>Also matched (matched sales only): ' + BV.only.map((m) => '<button type="button" class="kpr-link" data-gwr-mbed="' + esc(m.g) + '">' + esc(lab(m.g)) + ' ' + num(m.n24) + '</button>').join(', ') + '</p>' : '';
    const few = BV.few && BV.few.length ? '<p class="lg-fine" data-gwr-few>' + BV.few.map((g) => esc(lab(g))).join(' and ') + ': too few recent resales to show a typical price.</p>' : '';
    return '<section class="lg-band gwr-band" id="lgTypes" aria-labelledby="lgTypesH"><div class="lg-wrap gwr-wrap"><div class="gwr-head"><p class="lg-kicker">By home type</p><h2 id="lgTypesH">What each home type sells for</h2>' +
      '<p class="lg-sub">Resales here in the last 12 months: the typical (median) total price, and the range most of them sold within. Choose one to see its sales.</p></div>' +
      '<div class="gwr-rows" role="group" aria-label="Home types">' + BV.types.map(row).join('') + '</div>' + also + few +
      '<p class="lg-fine">' + esc(o.basis || 'Bedroom types are inferred by Groundwork from developer floor plans or URA rental records for the same size; URA doesn’t record bedrooms with a sale.') + ' Past sales, not a valuation.</p></div></section>';
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
    return '<section class="lg-band gwr-band" id="lgTypes" aria-labelledby="lgTypesH"><div class="lg-wrap gwr-wrap"><div class="gwr-head"><p class="lg-kicker">By size</p><h2 id="lgTypesH">What each size sells for</h2>' +
      '<p class="lg-sub">' + esc(w[1].charAt(0).toUpperCase() + w[1].slice(1)) + ' here in the last 12 months, by size: the typical (median) total price and the range most of them sold within. Sizes with fewer than 5 sales over 3 months aren’t shown; their sales are listed below.</p></div>' +
      '<div class="gwr-rows" role="group" aria-label="Sizes">' + S.rows.map(row).join('') + '</div>' +
      (o.why ? '<p class="lg-fine">' + esc(o.why) + '</p>' : '') + '<p class="lg-fine">Past sales, not a valuation.</p></div></section>';
  }

  /* ---------------- 2. recent sales ---------------- */
  const sel = (k, label, opts, v) => '<label class="gwr-f"><span>' + label + '</span><select data-gwr-f="' + k + '">' + opts.map((o) => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';
  function filtersHtml(rec, f) {
    const O = options(rec.rows);
    return '<div class="gwr-fs" role="group" aria-label="Filter the sales">' +
      sel('bed', 'Home type', [['all', 'All types']].concat(O.beds.map((b) => [b, bedLabel(b)]), O.unknown ? [['u', 'Type unknown']] : []), f.bed) +
      sel('bin', 'Size', [['all', 'All sizes']].concat(O.bins.map((b) => [b, bandLabel(b)])), f.bin) +
      sel('sale', 'Sale type', [['all', 'All sale types']].concat(O.sales.map((s) => [s, SALE[s] + 's'])), f.sale) +
      sel('period', 'Period', [['all', 'Since ' + ymLabel(rec.start)], [24, 'Last 2 years'], [12, 'Last 12 months']], f.period) +
      sel('sort', 'Order', [['new', 'Newest first'], ['old', 'Oldest first'], ['high', 'Highest price'], ['low', 'Lowest price']], f.sort) + '</div>';
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
    if (!n) return '<p class="gwr-none" data-gwr-count="0">No sales match these filters. <button type="button" class="kpr-link" data-gwr-reset>Show all sales</button></p>';
    const span = ymLabel(Math.min.apply(null, list.map((r) => r[0]))) + ' – ' + ymLabel(Math.max.apply(null, list.map((r) => r[0])));
    const same = list.slice(0, k).some((r) => r[7] & 4);
    // V2: with a home type chosen, how many sales are that type and how many here (same other filters) have no bedroom count and could be it.
    let note = '';
    if (f.bed !== 'all' && f.bed !== 'u' && f.bed != null) {
      const u = filter(rec.rows, Object.assign({}, f, { bed: 'u' }), rec.latest).length;
      note = '<p class="lg-fine gwr-bednote" data-gwr-bednote data-n="' + n + '" data-m="' + u + '">Showing the ' + plural(n, WORD.all) + ' matched as ' + esc(bedLabel(Number(f.bed))) + '.' +
        (u ? ' ' + num(u) + ' other ' + WORD.all[u === 1 ? 0 : 1] + ' here could not be matched to a bedroom count and ' + (u === 1 ? 'may be one more.' : 'may include more.') : '') + '</p>';
    }
    return note + '<p class="gwr-count" data-gwr-count="' + n + '"><b>' + plural(n, WORD.all) + '</b> · ' + span + (n > k ? ' · showing ' + k : '') + '</p>' +
      '<div class="gwr-scroll"><table class="gwr-table"><thead><tr><th scope="col">Month</th><th scope="col">Home type</th><th scope="col">Size</th><th scope="col">Floor</th><th scope="col">Sale</th><th scope="col">Price</th></tr></thead><tbody>' +
      list.slice(0, k).map((r) => rowHtml(r, M)).join('') + '</tbody></table></div>' +
      (n > k ? '<button type="button" class="lg-btn gwr-more" data-gwr-more>Show ' + Math.min(PAGE, n - k) + ' more</button>' : '') +
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
  // The filters a visitor starts with: the type or size chosen at the top of the report, and the sale type on show.
  function startFilter(o) { return { bed: o.bed != null && o.bed !== '' && /^\d+$/.test(String(o.bed)) ? String(o.bed) : 'all', bin: o.bin != null ? String(o.bin) : 'all', sale: o.sale ? String(CODE[o.sale] || 'all') : 'all', period: 'all', sort: 'new' }; }

  /* ---------------- browser ---------------- */
  // app: the report; st: { rec, f, shown } kept by the page across redraws.
  function wire(app, st, o) {
    o = o || {};
    const sec = app.querySelector('#lgTx'); if (!sec || !st || !st.rec) return;
    const list = sec.querySelector('[data-gwr-list]');
    const draw = () => { list.innerHTML = listHtml(st.rec, st.f, st.shown); sec.querySelectorAll('[data-gwr-f]').forEach((s) => { s.value = String(st.f[s.dataset.gwrF]); }); };
    sec.addEventListener('change', (e) => { const s = e.target.closest && e.target.closest('[data-gwr-f]'); if (!s) return; st.f[s.dataset.gwrF] = s.value; st.shown = st.page || PAGE; draw(); if (o.track) o.track(s.dataset.gwrF); });
    sec.addEventListener('click', (e) => {
      if (e.target.closest('[data-gwr-more]')) { st.shown = (st.shown || PAGE) + PAGE; draw(); }
      if (e.target.closest('[data-gwr-reset]')) { st.f = { bed: 'all', bin: 'all', sale: 'all', period: 'all', sort: 'new' }; st.shown = st.page || PAGE; draw(); }
    });
    sec.__gwrDraw = draw;
    // "See these sales" in the asking-price result: the exact sales its dots are. One listener per report element, whatever the redraws.
    app.__gwrSt = st;
    if (!app.__gwrShow) {
      app.__gwrShow = true;
      app.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('[data-gwr-show],[data-gwr-mbed]'), s = app.querySelector('#lgTx'), cur = app.__gwrSt; if (!b || !s || !cur || !s.__gwrDraw) return;
        // V2 "See these sales" for a matched-only type: its matched resales of the last 2 years (the same rows as its count).
        if (b.dataset.gwrMbed != null) cur.f = { bed: String(b.dataset.gwrMbed), bin: 'all', sale: '3', period: '24', sort: 'new' };
        else { const p = b.dataset.gwrShow.split('|'); cur.f = { bed: 'all', bin: p[0], sale: p[1], period: '12', sort: 'new' }; }
        cur.shown = cur.page || PAGE; s.__gwrDraw();
        s.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  return { SQFT, CODE, SALE, PAGE, PHONE_PAGE, pick, filter, options, bandPsf, sizeRows, quantile, typesHtml, sizesHtml, txHtml, listHtml, filtersHtml, startFilter, wire, binOf, psfOf, ymAdd, ymLabel, short, bedLabel, bandLabel };
});
