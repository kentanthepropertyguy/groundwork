/* KPT DISCOVER BEDS (25 Oct 2026, Claude C; wired into Budget Search 26 Oct 2026): Budget Search for a RESALE home with a given number of bedrooms.
 * Pure functions. Reads data/projects/find-beds.json (tools/market-data/build-bedroom-search.js) beside find.json. It classifies nothing:
 * every bedroom label and every "confirmed" type comes from the accepted 12-quarter classification and its approved completeness gate,
 * exactly as Research shows them. Matching reuses kpt-discover.js (filters, evidence rule, tiers, 5% option) unchanged.
 *
 * For one development and one bedroom count, the answer is one of:
 *   reliable      Research shows this bedroom type (gate passed) and its recent resales are within the maximum:
 *              "typical" = the type's middle half is at or under it (q3), "some" = only its lower quarter is (q1). Figures are Research's own.
 *   insufficient  the bedroom count is not confirmed here (few / mixed / coverage / possible: see find-beds.json "status"), but resales that COULD
 *              be this count (identified as it, or unclassified sizes that could be it) are within the maximum. Never presented as confirmed.
 *   unclassified  under 70% of the development's resales are classified and its resales within the maximum have no bedroom evidence at all.
 *              Not listed under a bedroom search; counted, so the page can offer "Show any bedroom".
 *   none          reliably not a match: the confirmed type is above the maximum, smaller than the minimum size or has no recent sale, or the
 *              development is well classified (70%+) and has no recent resale of this count.
 * 5 means 5 or more bedrooms. With `orMore` (the page's "4+", read the same way kpt-discover.js reads it for new launches) a count means that many or more.
 *
 * search() / alternatives() (26 Oct 2026, Bedroom Search Integration): the WHOLE Budget Search with a bedroom count, for the page. Resale comes from
 * resale() above; new launches stay exactly KPT_DISCOVER.search (Huttons inventory). Without a bedroom count, with New launch only, or without
 * find-beds.json (bx null), it IS KPT_DISCOVER.search, unchanged.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./kpt-find.js'), require('./kpt-discover.js'));
  else root.KPT_BEDS = factory(root.KPT_FIND, root.KPT_DISCOVER);
})(typeof self !== 'undefined' ? self : this, function (FI, D) {
  'use strict';
  const VERSION = 'discover-beds-v1', BEDS = [1, 2, 3, 4, 5], MIN_COVERAGE = 0.7;

  /** find-beds.json -> lookup, or null when it is missing, malformed or not built from the same URA download as find.json (same data month
   *  and same as-of date); then the page keeps today's behaviour. findDoc: the find.json document itself. */
  function prepare(doc, findDoc) {
    if (!doc || doc.kind !== 'gw-find-beds' || doc.v !== 1 || !doc.projects || !findDoc || doc.latestMonth !== findDoc.latestMonth || doc.asOf !== findDoc.asOf) return null;
    return { projects: doc.projects, latestMonth: doc.latestMonth, classifiedAsOf: doc.classifiedAsOf, status: doc.status || {} };
  }
  const bedsOf = (v) => (BEDS.indexOf(Number(v)) > -1 ? Number(v) : null);
  const sizeOk = (ix, minSize) => (r) => !minSize || r[0] + ix.bin / 2 >= minSize;   // a band counts when its centre does, as in kpt-discover.js
  const tierOf = (ix, rows, B) => {
    const typ = D.evidence(ix, rows.filter((r) => r[6] <= B)); if (typ) return Object.assign(typ, { tier: 'typical' });
    const some = D.evidence(ix, rows.filter((r) => r[4] <= B)); return some ? Object.assign(some, { tier: 'some' }) : null;
  };

  /** A confirmed type against the maximum B. Without a minimum size cutting through the type, Research's figures decide (and are shown);
   *  with one, the type's own 12-month bands at or above it decide, by the same evidence rule as every other Budget Search match. */
  function confirmed(ix, g, e, B, minSize) {
    const f = e.f;
    if (minSize && f.sqft[1] < minSize) return { why: 'small' };
    if (!minSize || f.sqft[0] >= minSize) {
      if (FI.monthsBetween(ix.latest, f.last) > D.T.recencyMonths) return { why: 'stale' };
      const tier = f.p[3] <= B ? 'typical' : f.p[1] <= B ? 'some' : null;
      if (!tier) return { why: 'above' };
      return { tier, g, ura: { n: f.n, act: f.act, last: f.last, strength: f.n >= D.T.goodSales ? 'good' : 'limited', q1: f.p[1], med: f.p[2], q3: f.p[3], sqft: f.sqft, from: f.from, to: f.to, win: f.win, basis: { verified: f.v, inferred: f.i } } };
    }
    const ev = tierOf(ix, (e.b || []).filter(sizeOk(ix, minSize)), B);
    if (!ev) return { why: 'above' };
    return { tier: ev.tier, g, sized: true, ura: Object.assign(ev, { sqft: [ev.bandLo, ev.bandHi - 1], from: null, to: null, win: 12, basis: { verified: f.v, inferred: f.i } }) };
  }

  /** One development, one bedroom count (1-5; 5 = 5 or more), maximum B, optional minimum size. */
  function match(ix, bx, id, beds, B, minSize, orMore) {
    const p = bx && bx.projects[id], n = bedsOf(beds);
    if (!p || !n) return { state: 'nodata' };
    const keys = Object.keys(p.t).filter((g) => (orMore || n >= 5 ? Number(g) >= n : Number(g) === n));
    const order = { typical: 0, some: 1 }, best = (a) => a.filter((x) => x.tier).sort((x, y) => order[x.tier] - order[y.tier])[0];
    const ok = keys.filter((g) => p.t[g].s === 'ok').map((g) => confirmed(ix, g, p.t[g], B, minSize)), hit = best(ok);
    if (hit) return Object.assign({ state: 'reliable' }, hit);
    const maybe = keys.filter((g) => p.t[g].s !== 'ok').map((g) => { const e = p.t[g], ev = tierOf(ix, e.m.filter(sizeOk(ix, minSize)), B); return ev ? { tier: ev.tier, g, why: e.s, ura: Object.assign(ev, { could: e.x, identified: e.k }) } : null; }).filter(Boolean);
    const mh = best(maybe);
    if (mh) return Object.assign({ state: 'insufficient' }, mh);
    if (p.c == null || p.c < MIN_COVERAGE) {
      const ev = tierOf(ix, (p.u || []).filter(sizeOk(ix, minSize)), B);
      if (ev) return { state: 'unclassified', tier: ev.tier, why: p.c == null ? 'not classified' : 'coverage', ura: ev };
    }
    return { state: 'none', why: ok.length ? ok.map((x) => x.why).sort().join('/') : keys.length ? 'above' : p.c != null && p.c >= MIN_COVERAGE ? 'absent' : 'above' };
  }

  /** The resale part of a Budget Search with a bedroom count. Uses kpt-discover.js for every filter (class, tenure, place, minimum size,
   *  evidence), then the bedroom answer for each development. Returns the same item shape as KPT_DISCOVER.search, plus `beds`.
   *  { state, req, beds, reliable[], insufficient[], over[], unclassified: {count, ids}, unplaced[], excluded: {why: count}, counts }
   *  over: reliable matches within 5% over the maximum, only when req.over. unplaced: reliable or insufficient matches with no map position. */
  function resale(ix, bx, rq, ctx) {
    const req = D.clean(rq), n = bedsOf(rq && rq.beds), empty = { reliable: [], insufficient: [], over: [], unplaced: [], unclassified: { count: 0, ids: [] }, excluded: {}, counts: {} };
    if (!req.budget || !n) return Object.assign({ state: 'invalid', req, beds: n }, empty);
    if (!ix || !bx) return Object.assign({ state: 'nodata', req, beds: n }, empty);
    const B = req.budget, B2 = Math.round(B * (1 + D.T.over));
    // every resale development the current rules would show at any price, with today's filters (class, tenure, place, minimum size)
    const pool = D.search(ix, Object.assign({}, req, { sale: 'resale', beds: null, over: false, budget: D.T.maxBudget }), ctx);
    const out = Object.assign({ state: 'none', req, beds: n }, empty, { unclassified: { count: 0, ids: [] }, excluded: {} });
    const take = (it, placed) => {
      const m = match(ix, bx, it.id, n, B, req.minSize, !!rq.orMore);
      const item = (mm, tier) => Object.assign({}, it, { tier, ura: mm.ura, beds: { state: mm.state, count: n, group: mm.g || null, why: mm.why || null, sized: !!mm.sized } });
      if (m.state === 'reliable' || m.state === 'insufficient') { const x = item(m, m.tier); if (!placed) out.unplaced.push(x); else out[m.state].push(x); return; }
      if (m.state === 'unclassified') { out.unclassified.count++; out.unclassified.ids.push(it.id); return; }
      if (req.over && placed) { const mo = match(ix, bx, it.id, n, B2, req.minSize, !!rq.orMore); if (mo.state === 'reliable') { out.over.push(item(mo, 'over')); return; } }
      out.excluded[m.why || m.state] = (out.excluded[m.why || m.state] || 0) + 1;
    };
    pool.items.forEach((it) => take(it, true)); pool.unplaced.forEach((it) => take(it, false));
    const near = req.near, TIER = { typical: 0, some: 1, over: 2 };
    const cmp = (x, y) => (near ? x.dist - y.dist : 0) || TIER[x.tier] - TIER[y.tier] || y.ura.n - x.ura.n || y.ura.last - x.ura.last || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0);
    ['reliable', 'insufficient', 'over', 'unplaced'].forEach((k) => out[k].sort(cmp));
    out.counts = { reliable: out.reliable.length, typical: out.reliable.filter((i) => i.tier === 'typical').length, some: out.reliable.filter((i) => i.tier === 'some').length, insufficient: out.insufficient.length, over: out.over.length, unclassified: out.unclassified.count, unplaced: out.unplaced.length };
    out.state = out.reliable.length || out.insufficient.length ? 'ok' : 'none';
    return out;
  }

  /** Is the bedroom-aware search in play? A budget, a bedroom count, resale included, and find-beds.json prepared. */
  function active(bx, rq) { const r = D.clean(rq); return !!(bx && r.budget && r.beds && r.sale !== 'new'); }
  const PLUS = D.T.beds[D.T.beds.length - 1];   // the page's top choice ("4+") means that many or more, as for new launches
  const TIER = { typical: 0, some: 1, huttons: 2, over: 3 };
  const ids = (a) => { const o = {}; a.forEach((i) => { o[i.id] = 1; }); return Object.keys(o).length; };
  const cmpOf = (near) => (x, y) => (near ? x.dist - y.dist : 0) || TIER[x.tier] - TIER[y.tier] || (x.ura && y.ura ? y.ura.n - x.ura.n || y.ura.last - x.ura.last : x.ura ? -1 : y.ura ? 1 : 0) || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0) || (x.sale < y.sale ? -1 : 1);

  /** The page's search. Same result shape as KPT_DISCOVER.search (items, over, unplaced, counts, notes, state), plus `beds` when bedrooms apply to resale:
   *  { count, orMore, insufficient[] (never in items), unclassified: {count, ids}, excluded: {why: n} }. items = reliable resales + new-launch matches. */
  function search(ix, bx, rq, ctx) {
    if (!ix || !active(bx, rq)) { const s = D.search(ix, rq, ctx); s.beds = null; return s; }
    const req = D.clean(rq), n = req.beds, orMore = n === PLUS;
    const rs = resale(ix, bx, Object.assign({}, rq, { beds: n, orMore }), ctx);
    const nw = req.sale === 'either' ? D.search(ix, Object.assign({}, rq, { sale: 'new' }), ctx) : null;
    const cmp = cmpOf(req.near);
    const items = rs.reliable.concat(nw ? nw.items : []).sort(cmp), over = rs.over.concat(nw ? nw.over : []).sort(cmp), unplaced = rs.unplaced.concat(nw ? nw.unplaced : []).sort(cmp);
    const counts = { projects: ids(items), items: items.length, typical: ids(items.filter((i) => i.tier === 'typical')), some: ids(items.filter((i) => i.tier === 'some')), huttons: ids(items.filter((i) => i.tier === 'huttons')),
      over: ids(over.filter((o) => !items.some((i) => i.id === o.id))), insufficient: ids(rs.insufficient), unclassified: rs.unclassified.count };
    const invOn = nw ? nw.notes.invOn : D.inventoryUsable(ctx && ctx.inv);
    return { state: items.length ? 'ok' : 'none', req, items, over, unplaced, counts, notes: { bedsResale: true, bedsNewOff: !!nw && !invOn, invOn },
      beds: { count: n, orMore, insufficient: rs.insufficient, unclassified: rs.unclassified, excluded: rs.excluded } };
  }
  /** One-tap ways to widen an empty or thin search: KPT_DISCOVER.alternatives' own list, counted with this search. */
  function alternatives(ix, bx, rq, ctx) { return D.alternatives(ix, rq, ctx, (a, b, c) => search(a, bx, b, c)); }

  return { VERSION, BEDS, MIN_COVERAGE, prepare, match, resale, active, search, alternatives };
});
