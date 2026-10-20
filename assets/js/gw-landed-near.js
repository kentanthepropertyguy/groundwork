/* ==========================================================================
   GROUNDWORK — Nearby landed sales (Research · Property values & prices)
   When a street has no recorded landed sale, or only one or two, this finds the sales that happened on the streets around it.
   Pure functions, no page code: the page (gw-value.js) loads the files and draws the answer; Node uses the same functions for tests.

   Inputs
     geo    data/value/landed/geo.json: an approximate position for each street URA records landed sales on (built offline from OneMap
            by tools/map-data/build-street-geo.py). A street is one point, so every distance is "about", never to a house.
     files  URA landed sales for the districts the nearby streets sit in (data/value/landed/d/<district>.json, as the page already loads them).
   What counts as a relevant sale
     Same house type (a terrace is never compared with a semi-detached; strata (cluster) houses are never mixed with land-title houses,
     because their area is not land). Nearest first. Only when there are too few close sales does the search widen, one step at a time:
       600 m · 3 years   →   1 km · 3 years   →   1.5 km · 5 years   →   2.5 km · 5 years
     and the answer says which step it used. Optional land size and tenure narrow the sales further, only while enough remain.
   What it never does: invent a sale, place a sale on a map, estimate a value, or compare across house types.
   UMD: window.GWLN in the browser.
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GWLN = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TIERS = [{ m: 600, months: 36 }, { m: 1000, months: 36 }, { m: 1500, months: 60 }, { m: 2500, months: 60 }];
  const MIN_N = 5;        // enough sales to say something at a step; fewer and the search widens
  const LIMITED_N = 3;
  const MID_MIN = 8;      // the middle group is only said for 8 or more sales    // the least we will describe at the widest step, and say plainly that it is thin
  const LAND_BAND = 0.35; // optional land-size filter: within 35% of the land the visitor gave
  const STRATA = { ST: 1, SS: 1, SD: 1 };
  const ymAdd = (n, k) => { let y = Math.floor(n / 100), m = n % 100 + k; while (m < 1) { m += 12; y -= 1; } while (m > 12) { m -= 12; y += 1; } return y * 100 + m; };
  const rad = (d) => d * Math.PI / 180;
  // metres between two points on the ground (haversine)
  function dist(a, b) {
    const R = 6371008.8, dLa = rad(b.lat - a.lat), dLo = rad(b.lon - a.lon), la1 = rad(a.lat), la2 = rad(b.lat);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // 'fh' = freehold or a lease of 900 years or more (how the Buy page already groups them); 'lh' = anything shorter.
  const tenureClass = (t) => { if (t === 'FH') return 'fh'; const y = +String(t).split('|')[0]; return y >= 900 ? 'fh' : 'lh'; };
  // Streets (from geo) within maxM of a point, nearest first. exclude: { name, district } leaves the searched street out.
  function candidates(geo, pt, maxM, exclude) {
    const out = [];
    geo.streets.forEach((s) => {
      if (exclude && s[0] === exclude.name && (!exclude.district || s[1] === exclude.district)) return;
      const m = dist(pt, { lat: s[2], lon: s[3] });
      if (m <= maxM) out.push({ name: s[0], district: s[1], m: Math.round(m) });
    });
    return out.sort((a, b) => a.m - b.m || (a.name < b.name ? -1 : 1));
  }
  const districtsOf = (cands) => [...new Set(cands.map((c) => c.district))].sort();
  // Every landed sale on the candidate streets: one flat list the steps below filter.
  function pool(cands, files) {
    const near = {}; cands.forEach((c) => { near[c.name + '|' + c.district] = c.m; });
    const out = [];
    Object.keys(files).forEach((dd) => {
      const D = files[dd]; if (!D) return;
      D.rows.forEach((r) => {
        const name = D.streets[r[1]], m = near[name + '|' + dd];
        if (m === undefined) return;
        out.push({ ym: r[0], street: name, district: dd, m, type: r[2], land: r[3], price: r[4], tenure: r[5], sale: r[6], psf: r[4] / r[3], tc: tenureClass(r[5]) });
      });
    });
    return out;
  }
  const range = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? [s[0], s[s.length - 1]] : null; };
  /* Choose the sales. o: { type, latest, land?, tenure? ('fh'|'lh') }.
     Returns { state: 'ok' | 'limited' | 'none', step (0-3), tier, first: { n, tier }, rows (newest first), streets, nearest (m), widened, narrowed,
               types: { T: n, ... } (house types with sales at the widest step, for the chips), groups: { fh: {n, price:[lo,hi], psf:[lo,hi]}, lh: ... } } */
  function select(cands, files, o) {
    const all = pool(cands, files), latest = o.latest;
    const forType = all.filter((x) => x.type === o.type);
    const refine = (rows) => {
      let r = rows;
      if (o.tenure) r = r.filter((x) => x.tc === o.tenure);
      if (o.land) r = r.filter((x) => Math.abs(x.land - o.land) <= o.land * LAND_BAND);
      return r;
    };
    const at = (t, rows) => { const from = ymAdd(latest, -(t.months - 1)); return rows.filter((x) => x.m <= t.m && x.ym >= from); };
    const wantsRefine = !!(o.tenure || o.land);
    let chosen = null, step = -1, narrowed = false, first = null, last = null;
    for (let i = 0; i < TIERS.length; i++) {
      const base = at(TIERS[i], forType), r = refine(base);
      if (first === null) first = { n: base.length, tier: TIERS[0] };
      last = { i, base, r };
      if (r.length >= MIN_N) { chosen = r; step = i; narrowed = wantsRefine && base.length > r.length; break; }
    }
    if (!chosen) {
      // too few at every step: use the widest, refined if that still leaves something, else the plain sales of that type
      const L = last, useRefined = wantsRefine && L.r.length >= LIMITED_N;
      chosen = useRefined ? L.r : L.base; step = L.i; narrowed = useRefined && L.base.length > L.r.length;
    }
    const rows = chosen.slice().sort((a, b) => b.ym - a.ym || a.m - b.m);
    const state = chosen.length >= MIN_N ? 'ok' : chosen.length >= LIMITED_N ? 'limited' : 'none';
    const groups = {};
    ['fh', 'lh'].forEach((k) => {
      const g = rows.filter((x) => x.tc === k);
      if (g.length) groups[k] = { n: g.length, price: range(g.map((x) => x.price)), psf: range(g.map((x) => x.psf)), land: range(g.map((x) => x.land)) };
    });
    // With 8 or more sales one odd sale can stretch the range, so the middle group is said too: it leaves out the same number of sales at each
    // end, its edges are actual sale prices, and it is labelled with its count. Only when one tenure group is being described.
    const shown = Object.keys(groups).filter((k) => groups[k].n >= 3), single = shown.length === 1 ? shown[0] : (Object.keys(groups).length === 1 ? Object.keys(groups)[0] : null);
    let mid = null;
    if (single) {
      const g = rows.filter((x) => x.tc === single).sort((a, b) => a.price - b.price);
      if (g.length >= MID_MIN) { const k = Math.floor((g.length + 1) / 4), m = g.slice(k, g.length - k); mid = { n: m.length, of: g.length, price: range(m.map((x) => x.price)), psf: range(m.map((x) => x.psf)) }; }
    }
    // house types worth offering: those with any sale on these streets in the widest window (so a chip never leads to nothing)
    const widest = at(TIERS[TIERS.length - 1], all), types = {};
    widest.forEach((x) => { types[x.type] = (types[x.type] || 0) + 1; });
    return {
      state, step, tier: TIERS[step], first, rows, n: rows.length, streets: [...new Set(rows.map((x) => x.street + '|' + x.district))].length,
      nearest: rows.length ? Math.min.apply(null, rows.map((x) => x.m)) : null, widened: step > 0, narrowed, groups, mid, types, strata: !!STRATA[o.type],
      price: range(rows.map((x) => x.price)), psf: range(rows.map((x) => x.psf)), land: range(rows.map((x) => x.land))
    };
  }
  // Estate names (data/value/landed/estates.json: [estate, street, district], from URA's own project names). When the street searched starts with an
  // estate name ("SPRINGWOOD CRESCENT" starts with "SPRINGWOOD") and URA files that estate on a street among those found nearby, say so: it is what URA
  // records, nothing more. The sale is never moved to the searched street.
  const word = (n) => String(n || '').toUpperCase().replace(/[.,']/g, '').replace(/\s+/g, ' ').trim();
  function estatesFor(estates, name, cands) {
    const n = word(name) + ' ', out = [];
    (estates || []).forEach((e) => {
      const en = word(e[0]); if (!en || n.indexOf(en + ' ') !== 0 || n.length <= en.length + 1) return;
      const c = cands.filter((x) => x.name === e[1] && x.district === e[2])[0]; if (c && !out.some((o) => o.estate === e[0] && o.street === e[1])) out.push({ estate: e[0], street: e[1], district: e[2], m: c.m });
    });
    return out.sort((a, b) => a.m - b.m);
  }
  // The house type to show first: the one with most sales around, land-title houses before strata.
  function defaultType(types) {
    const ks = Object.keys(types).sort((a, b) => (STRATA[a] ? 1 : 0) - (STRATA[b] ? 1 : 0) || types[b] - types[a]);
    return ks[0] || null;
  }
  return { TIERS, MIN_N, LIMITED_N, MID_MIN, LAND_BAND, dist, tenureClass, candidates, districtsOf, pool, select, defaultType, estatesFor, ymAdd };
});
