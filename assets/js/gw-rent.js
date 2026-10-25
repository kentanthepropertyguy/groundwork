/* ==========================================================================
   GROUNDWORK — what homes rent for (Rental Research V1, 25 Oct 2026). Monthly rent first; rent per sq ft is not used.
   Aggregates only (Ken, 25 Oct 2026): no individual rental contract is published or listed; every figure is a summary of 5 or more rentals.

   Private homes (data/projects/rent, tools/market-data/build-rent-research.js): URA rental contracts filed with IRAS for stamp duty, so these are
   CONTRACTED rents, never asking rents. A contract gives the lease commencement month, the bedrooms the parties declared (some don't: those are
   left out of the bedroom figures), the monthly rent and a 100 sq ft size band. Never a unit, floor or exact size.
     - typical rent per bedroom count: 5+ contracts over 3+ months in the latest 12 lease months (the site's typical rule); 3+ over 2+ is
       "limited"; fewer is a count only;
     - where a bedroom count has too few, rents by 100 sq ft size band (every contract of that band, whatever its bedrooms: the same size, so
       comparable), never another bedroom count standing in;
     - movement: one bedroom count in one 100 sq ft band, the latest 12 months against the 12 before, 10+ contracts each side; otherwise none;
     - asking-rent check: the same bedrooms and the same band, 10+ contracts, against that band's own summary.
   HDB flats (data/value/hdb/rent, build-hdb-rent.js aggregate()): HDB-approved flat rentals as data.gov.sg gives them (the dataset doesn't say
   whether a whole flat or rooms, so neither is claimed); the rent is declared by the owner and HDB does not verify it; the month is when HDB
   approved the rental. Blocks are keyed by street and block number together, never by the number alone. Level: the block when it has 5+
   rentals of the flat type in 12 months, else the street, else the town, always named with its count; the asking-rent check needs 10+ at the
   level it uses.
   No yield is published (policy: no appreciation, yield or forecast).
   UMD: window.GW_RENT and Node (the pure parts).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GW_RENT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const RULE = { typical: 5, check: 10, move: 10, hdbLevel: 5 };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const money = (n) => '$' + num(n);
  const ymLabel = (v) => MON[(v % 100) - 1] + ' ' + Math.floor(v / 100);
  const ymAdd = (v, k) => { const i = Math.floor(v / 100) * 12 + (v % 100) - 1 + k; return Math.floor(i / 12) * 100 + (i % 12) + 1; };
  const bedLabel = (b) => (b === 0 ? 'Studio' : b + '-bedroom');
  const bandText = (lo, hi) => num(lo) + '–' + num(hi) + ' sq ft';
  const moveText = (pct) => (Math.abs(pct) < 1 ? 'about the same as' : Math.abs(Math.round(pct)) + '% ' + (pct > 0 ? 'higher than' : 'lower than'));
  const moveHead = (pct) => (Math.abs(pct) < 1 ? 'About the same as a year earlier' : Math.abs(Math.round(pct)) + '% ' + (pct > 0 ? 'higher' : 'lower') + ' than a year earlier');
  const plural = (n, w) => num(n) + ' ' + w + (n === 1 ? '' : 's');

  /* ---------------- private homes ---------------- */
  function pick(shard, meta, id) {
    const r = shard && shard.projects ? shard.projects[id] : null;
    return r && meta && r.n ? Object.assign({ id, meta }, r) : null;
  }
  // What the asking-rent check compares with: per bedroom count, the 100 sq ft bands with 10+ contracts, each its own summary
  // [min, q1, median, q3, max] and count.
  function checkData(rec) {
    if (!rec || !rec.bands || !rec.bands.length) return null;
    const types = [];
    rec.bands.forEach((b) => {
      if (b.n < RULE.check || !b.range || !b.rent) return;
      let t = types.find((x) => x.beds === b.beds); if (!t) types.push(t = { beds: b.beds, bands: [] });
      t.bands.push({ lo: b.sqft[0], hi: b.sqft[1], n: b.n, r: [b.range[0], b.rent[0], b.rent[1], b.rent[2], b.range[1]] });
    });
    types.sort((a, b) => a.beds - b.beds); types.forEach((t) => t.bands.sort((a, b) => a.lo - b.lo));
    return types.length ? { name: rec.name, from: rec.window.from, to: rec.window.to, types } : null;
  }
  const typeOf = (rec, beds) => (rec && rec.types ? rec.types.find((t) => String(t.beds) === String(beds)) : null);
  const mostly = (t) => { const k = Object.keys(t.sqftBands || {}).sort((a, b) => t.sqftBands[b] - t.sqftBands[a])[0]; return k ? (Object.keys(t.sqftBands).length > 1 ? 'mostly ' : '') + bandText.apply(null, k.split('-').map(Number)) : ''; };
  function typeRow(t, rec, sel) {
    const mv = (rec.moves || []).find((m) => m.beds === t.beds), size = mostly(t);
    let main;
    if (t.evidence === 'typical') main = '<span class="gwr-p"><b>' + money(t.rent[2]) + '</b><small>a month, typical</small></span><span class="gwr-r">' + money(t.rent[1]) + ' – ' + money(t.rent[3]) + '<small>middle half</small></span>';
    else if (t.evidence === 'limited' && t.rent && t.n >= RULE.typical) main = '<span class="gwr-p gwr-lim"><b>' + money(t.rent[2]) + '</b><small>a month, limited evidence</small></span><span class="gwr-r">' + money(t.rent[0]) + ' – ' + money(t.rent[4]) + '<small>lowest – highest</small></span>';
    else main = '<span class="gwr-p gwr-lim"><b>–</b><small>too few for a typical rent</small></span><span class="gwr-r"></span>';
    const move = mv ? '<span class="gwr-mv" data-gwrent-move="' + t.beds + '"><b>' + moveHead(mv.pct) + '</b> for ' + esc(bandText(mv.sqft[0], mv.sqft[1])) + ' homes: median ' + money(mv.now) + ' a month, against ' + money(mv.prev) + ' in the 12 months before (' + mv.n + ' and ' + mv.prevN + ' contracts).</span>' : '';
    return '<div class="gwr-row gwr-static" data-gwrent-beds="' + t.beds + '"' + (sel ? ' aria-current="true"' : '') + '><span class="gwr-t">' + esc(bedLabel(t.beds)) + '</span>' + main +
      '<span class="gwr-m">' + plural(t.n, 'contract') + (size ? ' · ' + esc(size) : '') + '</span>' + move + '</div>';
  }
  // Rents by size: only bands with a typical (or limited) figure; every contract of the band, whatever its bedrooms.
  const sizeList = (rec) => (rec && rec.sizes ? rec.sizes.filter((s) => s.rent && s.evidence === 'typical') : []);   // typical figures only, to keep the fallback short
  function sizeRow(s, sel) {
    const lim = s.evidence !== 'typical';
    return '<div class="gwr-row gwr-static" data-gwrent-size="' + s.sqft[0] + '"' + (sel ? ' aria-current="true"' : '') + '><span class="gwr-t">' + esc(bandText(s.sqft[0], s.sqft[1])) + '</span>' +
      '<span class="gwr-p' + (lim ? ' gwr-lim' : '') + '"><b>' + money(s.rent[2]) + '</b><small>a month, ' + (lim ? 'limited evidence' : 'typical') + '</small></span>' +
      '<span class="gwr-r">' + (lim ? money(s.rent[0]) + ' – ' + money(s.rent[4]) + '<small>lowest – highest</small>' : money(s.rent[1]) + ' – ' + money(s.rent[3]) + '<small>middle half</small>') + '</span>' +
      '<span class="gwr-m">' + plural(s.n, 'contract') + ', all bedroom counts</span></div>';
  }
  // Where a bedroom count can't be shown on its own: no bedroom figures at all, a type with too few contracts, or the type chosen above isn't
  // among the typical ones.
  function needsSizes(rec, sel) {
    const t = rec.types || [], typ = t.filter((x) => x.evidence === 'typical');
    return !typ.length || t.some((x) => x.evidence !== 'typical') || (sel != null && !typ.some((x) => x.beds === sel));
  }
  // o: { bed: the bedroom count chosen at the top of the report ('' none), bin: the size chosen there, ask: GWASK or null }
  function sectionHtml(rec, o) {
    o = o || {};
    if (!rec || ((!rec.types || !rec.types.length) && !sizeList(rec).length)) return '';
    const sel = /^\d+$/.test(String(o.bed || '')) ? Number(o.bed) : null, CD = o.ask ? checkData(rec) : null, M = rec.meta || {}, sizes = sizeList(rec), showSizes = sizes.length && needsSizes(rec, sel);
    return '<section class="lg-band gwr-band gwr-rent" id="lgRent" aria-labelledby="lgRentH"><div class="lg-wrap gwr-wrap"><div class="gwr-head"><p class="lg-kicker">Rents</p><h2 id="lgRentH">What homes here rent for</h2>' +
      '<p class="lg-sub">Monthly rents in rental contracts filed with IRAS, for leases that began ' + ymLabel(rec.window.from) + ' – ' + ymLabel(rec.window.to) + '. These are contracted rents, not asking rents.</p></div>' +
      (rec.types && rec.types.length ? '<div class="gwr-rows" aria-label="Rents by bedrooms">' + rec.types.map((t) => typeRow(t, rec, t.beds === sel)).join('') + '</div>' : '') +
      (rec.unknownBeds ? '<p class="lg-fine" data-gwrent-unknown>' + num(rec.unknownBeds) + ' of the ' + num(rec.n) + ' contracts don’t state the bedrooms, so they aren’t in the bedroom figures.</p>' : '') +
      (showSizes ? '<div class="gwr-sizes" data-gwrent-sizes><h3 class="gwr-h3">Rents by size</h3><p class="lg-fine">' + (rec.types && rec.types.some((x) => x.evidence === 'typical') ? 'Where a bedroom count has too few contracts, ' : '') + 'homes of the same 100 sq ft band, whatever their bedrooms.</p><div class="gwr-rows" aria-label="Rents by size">' + sizes.map((s) => sizeRow(s, o.bin != null && s.sqft[0] === Number(o.bin))).join('') + '</div></div>' : '') +
      (CD ? '<div class="lg-acts gwr-acts"><button type="button" class="lg-act" data-gwrent-ask aria-expanded="false" aria-controls="lgRentAsk"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16v10H4z"/><path d="M8 12h8"/></svg><span>Check an asking rent</span></button></div>' +
        o.ask.panelHtml('rent', CD, { id: 'lgRentAsk', hidden: true, title: 'Check an asking rent', sub: 'Compared with contracts for the same bedrooms and size band here in the last 12 months. Only where there are at least 10.' }) : '') +
      '<p class="lg-fine">Summaries only: each figure covers 5 or more contracts. Bedrooms as declared in each contract; sizes are URA’s 100 sq ft bands, never an exact area; the month is when the lease began. A rent movement is shown only for one bedroom count in one size band with at least 10 contracts in each year. ' + esc(M.attribution || '') + '</p></div></section>';
  }
  // One line for the answer at the top of the report: the chosen type's rent beside its resale price, each with its own count and period.
  function typeLine(rec, beds) {
    const t = typeOf(rec, beds); if (!rec || !t) return '';
    const when = ymLabel(rec.window.from) + ' – ' + ymLabel(rec.window.to);
    if (t.evidence === 'typical') return '<p class="gwb-l gwr-rentline" data-gwrent-line><b>Rents: typical ' + money(t.rent[2]) + ' a month</b> (half between ' + money(t.rent[1]) + ' and ' + money(t.rent[3]) + '), from ' + plural(t.n, 'rental contract') + ' for leases ' + when + '.</p>';
    if (t.evidence === 'limited' && t.rent && t.n >= RULE.typical) return '<p class="gwb-l gwr-rentline" data-gwrent-line><b>Rents: about ' + money(t.rent[2]) + ' a month</b>, a first look from ' + plural(t.n, 'rental contract') + ' in only ' + plural(t.act, 'month') + ' (leases ' + when + ').</p>';
    return '<p class="gwb-l gwr-rentline" data-gwrent-line>Too few ' + esc(bedLabel(t.beds)) + ' rental contracts here (' + num(t.n) + ' in 12 months) for a typical rent' + (sizeList(rec).length ? ': see rents by size below.' : '.') + '</p>';
  }
  // The same for a chosen size: the 100 sq ft band's rents, every contract of that band.
  function sizeLine(rec, bin) {
    const s = rec && rec.sizes ? rec.sizes.find((x) => x.sqft[0] === Number(bin)) : null; if (!s || !s.rent || s.evidence !== 'typical') return '';
    return '<p class="gwb-l gwr-rentline" data-gwrent-line><b>Rents: typical ' + money(s.rent[2]) + ' a month</b> for ' + esc(bandText(s.sqft[0], s.sqft[1])) + ' homes (half between ' + money(s.rent[1]) + ' and ' + money(s.rent[3]) + '), from ' + plural(s.n, 'rental contract') + ' for leases ' + ymLabel(rec.window.from) + ' – ' + ymLabel(rec.window.to) + '.</p>';
  }
  function wire(app, rec) {
    const sec = app.querySelector('#lgRent'); if (!sec || !rec) return;
    const go = sec.querySelector('[data-gwrent-ask]'), panel = sec.querySelector('#lgRentAsk');
    if (go && panel) go.addEventListener('click', () => { panel.hidden = !panel.hidden; go.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) { const i = panel.querySelector('select, input'); if (i) i.focus(); } });
  }

  /* ---------------- HDB flats ---------------- */
  // A: data/value/hdb/rent/t/<town>.json (aggregates); I: its index; c: { block, street (the resale file's name), type ('5 ROOM') }
  const stat = (x, at) => (x && x.length > at + 1 ? { n: x[at], r: x.slice(at + 1, at + 6) } : x ? { n: x[at], r: null } : { n: 0, r: null });
  function hdbLevels(A, I, c) {
    if (!A || !I || !A.aggregates) return null;
    const ti = I.types.indexOf(c.type), si = A.streets.indexOf(c.street); if (ti < 0) return null;
    const b = stat(A.block.find((x) => x[0] === si && String(x[1]) === String(c.block) && x[2] === ti), 3);
    const s = stat(A.street.find((x) => x[0] === si && x[1] === ti), 2), tw = A.town.find((x) => x[0] === ti), t = stat(tw, 1);
    const ok = (x) => x.n >= RULE.hdbLevel && x.r, lv = ok(b) ? ['block', b] : ok(s) ? ['street', s] : ok(t) ? ['town', t] : null;
    if (!lv) return { level: 'none', n: b.n + 0, from: A.from, to: A.latestMonth };
    const chk = b.n >= RULE.check && b.r ? ['block', b] : s.n >= RULE.check && s.r ? ['street', s] : t.n >= RULE.check && t.r ? ['town', t] : null;
    const move = tw && t.r && t.n >= RULE.move && tw[7] >= RULE.move && tw[8] ? { now: t.r[2], prev: tw[8], n: t.n, prevN: tw[7] } : null;
    if (move) move.pct = Math.round((move.now / move.prev - 1) * 1000) / 10;
    return { level: lv[0], n: lv[1].n, rent: lv[1].r, blockN: b.n, streetN: s.n, from: A.from, to: A.latestMonth, check: chk ? { level: chk[0], n: chk[1].n, r: chk[1].r } : null, move };
  }
  // o: { flat ('5-room'), block, streetLabel, townLabel, ask: GWASK }
  function hdbHtml(L, I, o) {
    o = o || {};
    if (!L || L.level === 'none') return '';
    const where = { block: 'in this block', street: 'on ' + o.streetLabel, town: 'in ' + o.townLabel }, win = ymLabel(L.from) + ' – ' + ymLabel(L.to), ft = o.flat;
    const why = L.level === 'block' ? '' : '<p class="gw-vx-why" data-hr-why>' + (L.blockN ? 'Only ' + L.blockN + ' in this block' : 'None in this block') + (L.level === 'town' ? (L.streetN ? ' and ' + L.streetN + ' on its street' : ' or on its street') : '') + ' in 12 months, so these are the rentals ' + esc(where[L.level]) + '.</p>';
    const mv = L.move ? '<p class="gw-fine" data-hr-move><b>' + moveHead(L.move.pct) + '</b> across ' + esc(o.townLabel) + ': the median ' + esc(ft) + ' rent was ' + money(L.move.now) + ' a month in the last 12 months, against ' + money(L.move.prev) + ' in the 12 months before (' + num(L.move.n) + ' and ' + num(L.move.prevN) + ' rentals).</p>' : '';
    const ask = o.ask && L.check ? o.ask.panelHtml('hdbrent', { r: L.check.r, n: L.check.n, level: L.check.level, ft, where: o.block ? 'Blk ' + o.block + ' ' + o.streetLabel : '', whereLv: where[L.check.level] }, { title: 'Renting here? Check an asking rent', sub: 'Compared with the ' + L.check.n + ' ' + ft + ' rentals ' + where[L.check.level] + ' approved by HDB in the last 12 months.' }) : '';
    return '<div class="gw-vx-res gw-hr" data-hr-level="' + L.level + '"><p class="gw-ex">Rents · ' + esc(ft) + '</p>' +
      '<h3>' + num(L.n) + ' ' + esc(ft) + ' rentals ' + esc(where[L.level]) + ' in the last 12 months</h3>' + why +
      '<div class="gw-vx-sum"><span>Typical monthly rent</span><b>' + money(L.rent[2]) + '</b><small>The middle half rented for ' + money(L.rent[1]) + ' – ' + money(L.rent[3]) + '</small></div>' +
      '<p class="gw-fine">HDB approvals ' + win + '. Summaries only, each of 5 or more rentals.</p>' + mv + ask +
      '<p class="gw-vx-note"><b>Declared rents, not verified.</b> Flat owners declare the rent when HDB approves the rental; HDB doesn’t check it. The month is when HDB approved the rental, not when the lease began. No unit, floor or lease details are published. ' + esc((I && I.attribution) || '') + '</p></div>';
  }

  return { RULE, moveHead, moveText, pick, checkData, sectionHtml, typeLine, sizeLine, sizeList, needsSizes, wire, hdbLevels, hdbHtml, bedLabel, bandText, ymAdd };
});
