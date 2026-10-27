/* KPT DISCOVER V1: Budget Search matching. The one buyer-discovery rule set, shared by the Budget Search page and every route into it (Guide Me "I'm looking to buy", the HDB planner, old /buy/ links).
 * Pure functions. Reads only: data/projects/find.json (ACTUAL URA price quartiles per project, sale type and 100 sqft band, last 12 months), the optional Huttons inventory
 * (data/projects/inventory.json, new launches only) and, when the buyer chose a place, the straight-line distances the Map already computes.
 * It reuses kpt-find.js for the index, inventory freshness and naming; nothing there changes.
 *
 * What it says, and what it does not:
 *  - The budget is the buyer's MAXIMUM. A development is listed when its recent sales at the chosen size include prices at or under it.
 *      "typical"  = the middle half of those sales is entirely at or under the maximum (q3 <= maximum)
 *      "some"     = only the lower part is (q1 <= maximum < q3): some past sales were within it, not the typical price
 *    Each tier still needs the same evidence as before (3+ sales, a sale in the last 6 months, a size band that sold in 2+ months).
 *  - Past sales are never presented as homes for sale. Huttons inventory (new launches only) is a separate source and is labelled as such.
 *  - Research fix (Ken, 27 Oct 2026): NEW LAUNCHES ARE MATCHED ONLY ON THE LATEST NEW-LAUNCH LISTINGS (the approved developer inventory snapshot, within its 21-day window):
 *    their listed prices, bedroom types and sizes. URA developer sales never make a new-launch match, are never used as a current price and never set its tier;
 *    they stay on each development's Research page as price history (item.hist says whether there is any). No listing is not "sold out": the development is
 *    simply not listed. RESALE is unchanged: URA resale sales and the accepted bedroom classification. With Either the two stay in separate groups.
 *  - Up to 5% over the maximum is a separate, optional group, never mixed into the main list.
 *  - Bedrooms are never inferred here. search() matches them only on new launches, only from Huttons inventory that was checked recently, and never filters resale by them.
 *    Resale by bedrooms is kpt-discover-beds.js (the accepted classification and Research's bedroom types, find-beds.json), which reuses these rules.
 *  - Property classes (condo, EC, cluster) are matched by the same rules and listed apart, never pooled.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./kpt-find.js'));
  else root.KPT_DISCOVER = factory(root.KPT_FIND);
})(typeof self !== 'undefined' ? self : this, function (FI) {
  'use strict';
  const VERSION = 'discover-v1';
  const T = { minSales: 3, goodSales: 5, minActiveMonths: 2, recencyMonths: 6, over: 0.05, minBudget: 300000, maxBudget: 20000000, radii: [500, 1000, 2000, 3000], beds: [1, 2, 3, 4], moreStep: 8 };
  const TYPES = ['condo', 'ec', 'cluster'];
  const TIER = { typical: 0, some: 1, huttons: 2, over: 3 };

  /** Clean raw requirements. Anything unknown becomes the neutral default, so nothing blocks the buyer. */
  function clean(r) {
    r = r || {};
    const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
    const b = Math.round(num(r.budget)), ms = num(r.minSize);
    return {
      budget: b >= T.minBudget && b <= T.maxBudget ? b : null,
      over: !!r.over,
      type: TYPES.indexOf(r.type) > -1 ? r.type : 'any',
      sale: r.sale === 'new' || r.sale === 'resale' ? r.sale : 'either',
      minSize: ms >= 100 && ms <= 20000 ? Math.round(ms) : null,
      tenure: r.tenure === 'free' || r.tenure === 'lease' ? r.tenure : 'any',
      beds: T.beds.indexOf(Number(r.beds)) > -1 ? Number(r.beds) : null,
      near: r.near && r.near.dist && r.near.pos && T.radii.indexOf(Number(r.near.radius)) > -1 ? r.near : null,
    };
  }

  /** The recent sales in `rows` as one evidence summary, or null when they are too thin to list (same rules as Research and the old shortlist). */
  function evidence(ix, rows) {
    if (!rows.length) return null;
    const n = rows.reduce((a, r) => a + r[1], 0); if (n < T.minSales) return null;
    const last = Math.max.apply(null, rows.map((r) => r[3])); if (FI.monthsBetween(ix.latest, last) > T.recencyMonths) return null;
    if (!rows.some((r) => r[2] >= T.minActiveMonths)) return null;
    const bins = rows.map((r) => r[0]);
    return { n, last, strength: n >= T.goodSales ? 'good' : 'limited', q1: Math.min.apply(null, rows.map((r) => r[4])), q3: Math.max.apply(null, rows.map((r) => r[6])), bandLo: Math.min.apply(null, bins), bandHi: Math.max.apply(null, bins) + ix.bin };
  }
  /** URA sales at or above the minimum size (a band counts when its centre does, as everywhere else in Groundwork). */
  function uraMatch(ix, p, sale, req, B) {
    const rows = (p[sale] || []).filter((r) => !req.minSize || r[0] + ix.bin / 2 >= req.minSize);
    const typ = evidence(ix, rows.filter((r) => r[6] <= B)); if (typ) return Object.assign(typ, { tier: 'typical' });
    const some = evidence(ix, rows.filter((r) => r[4] <= B)); if (some) return Object.assign(some, { tier: 'some' });
    return null;
  }
  const bedOk = (req, b) => !req.beds || (req.beds >= 4 ? b >= 4 : b === req.beds);
  /** Huttons inventory (new launch only): the bedroom types with a price floor at or under B, at or above the minimum size. The floor is the only price ever used. */
  function invMatch(ip, req, B) {
    const types = [];
    (ip.byBedrooms || []).forEach((t) => {
      if (!t || typeof t.bedrooms !== 'number' || !Array.isArray(t.bands) || !bedOk(req, t.bedrooms)) return;
      const inc = t.bands.filter((b) => Array.isArray(b) && typeof b[0] === 'number' && typeof b[1] === 'number' && (!req.minSize || b[0] + 50 >= req.minSize));
      if (!inc.length) return;
      const floor = Math.min.apply(null, inc.map((b) => b[1])); if (floor > B) return;
      // the listed sizes of this type at or under the maximum (and at or above the minimum size): the 100 sq ft bands whose listed price is within it
      const fit = inc.filter((b) => b[1] <= B);
      types.push({ bedrooms: t.bedrooms, floor, lo: Math.min.apply(null, fit.map((b) => b[0])), hi: Math.max.apply(null, fit.map((b) => b[0])) + 100 });
    });
    return types.length ? { types: types.sort((a, b) => a.bedrooms - b.bedrooms), from: Math.min.apply(null, types.map((t) => t.floor)) } : null;
  }
  /** Is Huttons inventory usable at all right now (checked within 21 days, kpt-find.js)? The bedroom control depends on it. */
  function inventoryUsable(inv) { return !!(inv && inv.slugs.some((s) => FI.freshness(inv, inv.bySlug[s]))); }

  /** One search. ix = FI.prepare(find.json). ctx = { inv: FI.prepareInventory(...) | null }.
   *  Returns { state, req, items, over, unplaced, counts, notes }. Items are one development in one sale type. */
  function search(ix, rq, ctx) {
    const req = clean(rq), inv = (ctx && ctx.inv) || null;
    if (!req.budget) return { state: 'invalid', req, items: [], over: [], unplaced: [], counts: { projects: 0, items: 0, typical: 0, some: 0, huttons: 0, over: 0 }, notes: {} };
    if (!ix) return { state: 'nodata', req, items: [], over: [], unplaced: [], counts: { projects: 0, items: 0, typical: 0, some: 0, huttons: 0, over: 0 }, notes: {} };
    const B = req.budget, B2 = Math.round(B * (1 + T.over)), sales = req.sale === 'either' ? ['resale', 'new'] : [req.sale], near = req.near;
    const invOn = inventoryUsable(inv), items = [], over = [], unplaced = [], seen = {};
    const all = ix.projects.concat(ix.otherAll || []), byId = {}; all.forEach((p) => { byId[p.id] = p; });
    const dist = (id) => (near ? near.dist[id] : undefined);
    function consider(rec, ip) {
      const cls = rec.c || 'condo';
      if (req.type !== 'any' && req.type !== cls) return;
      if (req.tenure === 'free' && rec.tg !== 4) return;
      if (req.tenure === 'lease' && rec.tg === 4) return;
      let placed = true;
      if (near) { if (!near.pos[rec.id]) placed = false; else if (!(dist(rec.id) != null && dist(rec.id) <= near.radius)) return; }
      sales.forEach((sale) => {
        let u = null, uo = null, im = null, imo = null, ist = 'unchecked', when = null, past = false, lt = false;
        // resale: URA resale sales. New launches: the listings only (never URA developer sales, which stay on Research as price history)
        if (sale === 'resale') { u = uraMatch(ix, rec, sale, req, B); if (!u) uo = uraMatch(ix, rec, sale, req, B2); }
        if (sale === 'new' && ip) {
          const fr = FI.freshness(inv, ip); past = fr === 'dated'; lt = !!fr && FI.late(inv, ip);
          if (fr && ip.status === 'ok') { im = invMatch(ip, req, B); if (!im) imo = invMatch(ip, req, B2); ist = im ? 'match' : 'nomatch'; when = FI.whenText(Date.parse(ip.checkedAt || new Date(inv.fileAt).toISOString()), inv.now); }
          else if (fr && ip.status === 'zero_returned') { ist = 'zero'; when = FI.whenText(Date.parse(ip.checkedAt || new Date(inv.fileAt).toISOString()), inv.now); }
        }
        if (sale === 'new' && ist !== 'match' && !imo) return;   // no current listing within reach: not a new-launch match (and never called sold out)
        const hit = u || im, hitOver = !hit && (uo || imo); if (!hit && !hitOver) return;
        const it = { id: rec.id, name: rec.name, street: rec.street || '', district: rec.d, seg: rec.seg || null, tenure: rec.tl || '', mixed: !!rec.m, tenGroup: rec.tg, cls, sale,
          tier: hit ? (u ? u.tier : 'huttons') : 'over', ura: u || uo || null, hist: sale === 'new' && Array.isArray(rec.new) && rec.new.length > 0, dist: dist(rec.id), inv: sale === 'new' ? { state: ist, when, past, late: lt, from: (im || imo) ? (im || imo).from : null, types: (im || imo) ? (im || imo).types : [] } : null };
        if (!placed) { if (hit) unplaced.push(it); return; }
        (hit ? items : over).push(it);
      });
    }
    all.forEach((p) => { seen[p.id] = 1; consider(p, invOn ? inv.bySlug[p.id] : null); });
    // new launches Huttons lists but URA has no sales for yet: listed from the Huttons price floor alone, labelled as such
    // Results layout (Ken, 28 Oct 2026): a listing-only development takes its class (condo / EC / cluster) from the project index Research uses (ctx.cls, id -> class),
    // so an EC such as North Gaia is matched and listed as an EC, never as a condo. Without ctx.cls it is read as before (condo).
    if (invOn && sales.indexOf('new') > -1) inv.slugs.forEach((s) => { if (seen[s]) return; const r = FI.recordFor(ix, inv.bySlug[s]); if (!(r && r.rec)) return; const k = ctx && ctx.cls ? ctx.cls[s] : null; consider(TYPES.indexOf(k) > 0 ? Object.assign({}, r.rec, { c: k }) : r.rec, inv.bySlug[s]); });
    const cmp = (x, y) => (near ? (x.dist - y.dist) : 0) || TIER[x.tier] - TIER[y.tier] || (x.ura && y.ura ? (x.ura.strength === y.ura.strength ? 0 : x.ura.strength === 'good' ? -1 : 1) || y.ura.n - x.ura.n || y.ura.last - x.ura.last : x.ura ? -1 : y.ura ? 1 : 0) || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0) || (x.sale < y.sale ? -1 : 1);
    items.sort(cmp); over.sort(cmp); unplaced.sort(cmp);
    const ids = (a) => { const o = {}; a.forEach((i) => { o[i.id] = 1; }); return Object.keys(o).length; };
    const counts = { projects: ids(items), items: items.length, typical: ids(items.filter((i) => i.tier === 'typical')), some: ids(items.filter((i) => i.tier === 'some')), huttons: ids(items.filter((i) => i.tier === 'huttons')), over: ids(over.filter((o) => !items.some((i) => i.id === o.id))) };
    const notes = { bedsNewOnly: !!req.beds && sales.indexOf('resale') > -1 && sales.indexOf('new') > -1, bedsResaleOnly: !!req.beds && req.sale === 'resale', invOn };
    return { state: items.length ? 'ok' : 'none', req, items, over, unplaced, counts, notes };
  }

  /** Sections for the page: one per property class (condo, EC, cluster), each with a Resale and a New launch group. Classes are never pooled. */
  function sections(items) {
    const out = [];
    TYPES.forEach((c) => {
      const mine = items.filter((i) => i.cls === c); if (!mine.length) return;
      out.push({ cls: c, groups: ['resale', 'new'].map((s) => ({ sale: s, items: mine.filter((i) => i.sale === s) })).filter((g) => g.items.length) });
    });
    return out;
  }

  /** One-tap ways to widen an empty or thin search. Offered only when they would add something; nothing is applied automatically. */
  function alternatives(ix, rq, ctx, run) {
    const S = run || search;   // run: the page's search when bedrooms apply to resale (kpt-discover-beds.js), so each count is what the buyer would see
    const req = clean(rq), base = S(ix, req, ctx).counts.projects, out = [];
    const tryIt = (id, label, change) => { const c = S(ix, Object.assign({}, req, change), ctx).counts.projects; if (c > base) out.push({ id, label, count: c }); };
    if (!req.over) { const n = S(ix, Object.assign({}, req, { over: true }), ctx), c = n.counts.projects + n.counts.over; if (c > base) out.push({ id: 'over', label: 'Include up to 5% over your maximum', count: c }); }
    if (req.near) { const next = T.radii.find((r) => r > req.near.radius); if (next) tryIt('radius', 'Widen to ' + FI.radiusText(next), { near: Object.assign({}, req.near, { radius: next }) }); }
    if (req.minSize) tryIt('size', 'Remove the minimum size', { minSize: null });
    if (req.tenure !== 'any') tryIt('tenure', 'Include any tenure', { tenure: 'any' });
    if (req.beds) tryIt('beds', 'Show any bedroom', { beds: null });
    if (req.type !== 'any') tryIt('type', 'Include every property type', { type: 'any' });
    if (req.sale !== 'either') tryIt('sale', 'Include new launch and resale', { sale: 'either' });
    if (req.near) tryIt('place', 'Look across all of Singapore', { near: null });
    return out.slice(0, 4);
  }

  return { VERSION, T, clean, search, sections, alternatives, uraMatch, invMatch, inventoryUsable, evidence };
});
