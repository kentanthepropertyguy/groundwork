/* ==========================================================================
   KPT project data layer (browser + Node). Pure functions: no DOM, no storage, no thresholds, no judgement.
   UMD: window.KPT_PROJECT and Node (the build script requires this same file, so the name slug and the
   shard hash can never drift between the generator and the browser).

   What it does
     - normalises and slugs URA project names (never merges two URA names)
     - searches the project index (case, punctuation, spacing, partial words)
     - decodes the compact generated arrays (cells, distributions, history)
     - finds LIKE-FOR-LIKE evidence between two projects (same sale type, same size band, same trailing window)
     - returns peer context (district / region) clearly labelled as CONTEXT, not as comparables

   What it deliberately does NOT do
     - decide whether evidence is "enough": it returns n, active months, most recent month, window used.
       The reasoning / UI layer decides what counts as sufficient.
     - widen a comparison period. compare() returns EVERY window separately and says which one each result came from.
     - infer bedrooms, exact floors (floor bands stay URA's own bands), appreciation, yield or anything not in URA transactions.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPT_PROJECT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- names ---------- */
  // Upper-case, strip accents, '&' and '@' made explicit, punctuation to spaces, whitespace collapsed.
  function normaliseName(s) {
    return String(s == null ? '' : s)
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/&/g, ' AND ').replace(/@/g, ' AT ')
      .replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const compactName = (s) => normaliseName(s).replace(/ /g, '');
  const slugify = (s) => normaliseName(s).toLowerCase().replace(/ /g, '-');

  // FNV-1a 32-bit. Stable, dependency-free, identical in Node and the browser.
  function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  const SHARDS = 64;
  const shardOf = (id, count) => hash32(String(id)) % (count || SHARDS);
  const shardName = (n) => 's' + String(n).padStart(2, '0');

  /* ---------- search ---------- */
  // index: {fields, rows}; search: {tokens:[[token,[rowIdx,...]],...], keys:[normalised], compact:[no-space]}
  // Rule: every query token must be a PREFIX of some token in the name. Falls back to a no-space substring match
  // ("thomsonthree"). Results are never merged: "Chuan Vista" returns both "Chuan Vista" and "Chuan Vista II".
  function search(index, sdoc, query, opts) {
    const o = opts || {}, limit = o.limit || 10, F = fieldMap(index.fields), N = F.n;
    const q = normaliseName(query);
    if (!q) return [];
    const qt = q.split(' '), score = new Map();
    const hits = qt.map((t) => {
      const set = new Set();
      sdoc.tokens.forEach(([tok, rows]) => { if (tok.startsWith(t)) rows.forEach((r) => set.add(r)); });
      return set;
    });
    let ids = hits[0] ? Array.from(hits[0]) : [];
    for (let i = 1; i < hits.length; i++) ids = ids.filter((r) => hits[i].has(r));
    ids.forEach((r) => score.set(r, sdoc.keys[r] === q ? 0 : sdoc.keys[r].startsWith(q) ? 1 : 2));
    if (!ids.length) {
      const c = q.replace(/ /g, '');
      sdoc.compact.forEach((k, r) => { if (c.length >= 3 && k.indexOf(c) !== -1) score.set(r, 3); });
    }
    return Array.from(score.keys())
      .sort((a, b) => score.get(a) - score.get(b) || index.rows[b][N] - index.rows[a][N] || (index.rows[a][F.name] < index.rows[b][F.name] ? -1 : 1))
      .slice(0, limit).map((r) => rowObject(index, r));
  }
  const fieldMap = (fields) => { const m = {}; fields.forEach((f, i) => { m[f] = i; }); return m; };
  function rowObject(index, i) {
    const o = {}; index.fields.forEach((f, k) => { o[f] = index.rows[i][k]; }); o.row = i; return o;
  }
  function findById(index, id) {
    const F = fieldMap(index.fields);
    for (let i = 0; i < index.rows.length; i++) if (index.rows[i][F.id] === id) return rowObject(index, i);
    return null;
  }

  /* ---------- decoding ---------- */
  function decode(arr, fields) { const o = {}; fields.forEach((f, i) => { o[f] = arr[i]; }); return o; }
  const decodeAll = (list, fields) => (list || []).map((a) => decode(a, fields));
  const dist5 = (a) => (a ? { min: a[0], q1: a[1], med: a[2], q3: a[3], max: a[4] } : null);

  // Project record -> decoded cells. m is the manifest (carries the field orders).
  function cells(project, m) {
    return {
      window: decodeAll(project.cells, m.fields.cell),          // sale x sizeBin x trailing window (cumulative)
      period: decodeAll(project.periodCells, m.fields.cell),    // sale x sizeBin x disjoint 12-month period
      floor: decodeAll(project.floorCells, m.fields.cell),      // sale x sizeBin x URA floor band (all history)
    };
  }
  const WINDOW_LABEL = (m, w) => (m.windows[w] === 'all' ? { win: w, months: null, label: 'full history', from: m.monthStart, to: m.latestMonth } : { win: w, months: m.windows[w], label: 'last ' + m.windows[w] + ' months', from: addMonths(m.latestMonth, 1 - m.windows[w]), to: m.latestMonth });
  function addMonths(ym, d) { const [y, mo] = ym.split('-').map(Number), t = y * 12 + (mo - 1) + d; return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0'); }
  const SALE = { 1: 'new', 2: 'sub', 3: 'resale' };

  /* ---------- like-for-like comparison ---------- */
  // Returns evidence, not a verdict. Each cell pair carries nA/nB, active months, most recent month and the WINDOW it came from.
  // Windows are returned side by side, narrowest first. Nothing is chosen or widened here; firstWindowWithMatch is reported as a fact.
  function compare(A, B, m) {
    const ca = cells(A, m), cb = cells(B, m);
    const out = { a: head(A), b: head(B), bySale: {}, saleTypesShared: [], reasons: [], windows: m.windows.map((_, w) => WINDOW_LABEL(m, w)), noLikeForLikeEvidence: true };
    const saleA = new Set(ca.window.map((c) => c.sale)), saleB = new Set(cb.window.map((c) => c.sale));
    const shared = [1, 2, 3].filter((s) => saleA.has(s) && saleB.has(s));
    out.saleTypesShared = shared.map((s) => SALE[s]);
    if (!shared.length) out.reasons.push('no shared sale type: A has ' + (list(saleA) || 'none') + '; B has ' + (list(saleB) || 'none'));
    shared.forEach((s) => {
      const dA = A.dist && A.dist[SALE[s]], dB = B.dist && B.dist[SALE[s]];
      const rngA = dA ? [dA.sqft[0], dA.sqft[4]] : null, rngB = dB ? [dB.sqft[0], dB.sqft[4]] : null;
      const ov = rngA && rngB ? [Math.max(rngA[0], rngB[0]), Math.min(rngA[1], rngB[1])] : null;
      const res = { sale: SALE[s], sizeRange: { a: rngA, b: rngB, overlap: ov && ov[0] <= ov[1] ? ov : null }, windows: [], firstWindowWithMatch: null, floor: [], periods: [], reasons: [] };
      m.windows.forEach((_, w) => {
        const wa = ca.window.filter((c) => c.sale === s && c.win === w), wb = cb.window.filter((c) => c.sale === s && c.win === w);
        const mapB = new Map(wb.map((c) => [c.bin, c]));
        const exact = [], adj = [];
        wa.forEach((x) => {
          if (mapB.has(x.bin)) exact.push(pair(x, mapB.get(x.bin)));
          else [-m.bin, m.bin].forEach((d) => { if (mapB.has(x.bin + d)) adj.push(Object.assign(pair(x, mapB.get(x.bin + d)), { adjacent: true, binA: x.bin, binB: x.bin + d })); });
        });
        exact.sort((p, q) => Math.min(q.a.n, q.b.n) - Math.min(p.a.n, p.b.n) || p.bin - q.bin);
        res.windows.push({ win: w, label: WINDOW_LABEL(m, w).label, months: m.windows[w] === 'all' ? null : m.windows[w], like: exact, adjacent: adj });
        if (exact.length && res.firstWindowWithMatch === null) res.firstWindowWithMatch = w;
      });
      // Disjoint-period history for bins both projects have, so a trend can be read like-for-like (descriptive only).
      const pa = ca.period.filter((c) => c.sale === s), pb = new Map(cb.period.filter((c) => c.sale === s).map((c) => [c.bin + '|' + c.win, c]));
      pa.forEach((x) => { const y = pb.get(x.bin + '|' + x.win); if (y) res.periods.push(Object.assign(pair(x, y), { period: x.win })); });
      res.periods.sort((p, q) => p.bin - q.bin || p.period - q.period);
      // Floor control: URA floor bands, full history only (floor cells are not split by window).
      const fa = ca.floor.filter((c) => c.sale === s), fb = new Map(cb.floor.filter((c) => c.sale === s).map((c) => [c.bin + '|' + c.win, c]));
      fa.forEach((x) => { const y = fb.get(x.bin + '|' + x.win); if (y) res.floor.push(Object.assign(pair(x, y), { floorBand: m.floorBands[x.win], window: 'full history' })); });
      res.floor.sort((p, q) => Math.min(q.a.n, q.b.n) - Math.min(p.a.n, p.b.n));
      if (res.firstWindowWithMatch === null) res.reasons.push(res.sizeRange.overlap ? 'sizes overlap in range but no shared 100 sqft band in any window' : 'no overlapping unit sizes');
      else out.noLikeForLikeEvidence = false;
      if (!res.floor.length) res.reasons.push('no shared floor band within a shared size band');
      out.bySale[SALE[s]] = res;
    });
    if (out.noLikeForLikeEvidence && shared.length) out.reasons.push('no like-for-like evidence in any window');
    return out;
  }
  const list = (set) => Array.from(set).sort().map((s) => SALE[s]).join(', ');
  const head = (p) => ({ id: p.id, name: p.name, street: p.street, district: p.district, region: p.seg, tenure: p.tenure });
  function pair(x, y) {
    return {
      bin: x.bin, binTo: x.bin + 99, a: strip(x), b: strip(y),
      overlap: { nA: x.n, nB: y.n, nMin: Math.min(x.n, y.n), activeMonthsA: x.act, activeMonthsB: y.act, lastMonthA: x.last, lastMonthB: y.last },
    };
  }
  const strip = (c) => ({ n: c.n, act: c.act, top: c.top, last: c.last, psf: dist5([c.min, c.q1, c.med, c.q3, c.max]) });

  /* ---------- single-project helpers ---------- */
  // Disjoint 12-month PSF history for one sale type (all sizes mixed). Mixed unit sizes: read with the size-band view.
  function history(project, sale, m) {
    const p = project.periods && project.periods[sale]; if (!p) return [];
    return p.map((a, i) => ({ period: i, label: m.periods[i] && m.periods[i].label, n: a[0], psf: dist5(a.slice(1, 6)) })).filter((x) => x.n > 0);
  }
  function monthly(project, m) {
    const out = {};
    Object.keys(project.monthly || {}).forEach((s) => { const arr = project.monthly[s], o = []; for (let i = 0; i < arr.length; i += 2) o.push({ month: addMonths(m.monthStart, arr[i]), n: arr[i + 1] }); out[s] = o; });
    return out;
  }

  /* ---------- peer context ---------- */
  // peers doc: {scope, fields, cells:[[sale, tenureGroup, bin, win, n, projects, top, act, last, min, q1, med, q3, max]]}
  // bin -1 = all sizes (context only). Peer cells INCLUDE the project itself; top is the biggest single project's share.
  function peerCells(pdoc, query, m) {
    const f = pdoc.fields;
    return pdoc.cells.map((a) => decode(a, f)).filter((c) =>
      (query.sale === undefined || c.sale === query.sale) && (query.tenureGroup === undefined || c.tenureGroup === query.tenureGroup) &&
      (query.bin === undefined || c.bin === query.bin) && (query.win === undefined || c.win === query.win))
      .map((c) => ({ scope: pdoc.scope, kind: 'context', includesProject: true, sale: SALE[c.sale], tenureGroup: m.tenureGroups[c.tenureGroup], bin: c.bin, allSizes: c.bin === -1, window: WINDOW_LABEL(m, c.win),
        n: c.n, projects: c.projects, topProjectShare: c.top, activeMonths: c.act, lastMonth: c.last, psf: dist5([c.min, c.q1, c.med, c.q3, c.max]) }));
  }
  const peerScopeFile = (scope) => 'peers/' + (/^\d+$/.test(scope) ? 'd' + String(scope).padStart(2, '0') : String(scope).toLowerCase()) + '.json';

  /* ---------- loader (injected fetch, so Node tests need no network) ---------- */
  function createStore(base, fetchJson) {
    const cache = {}, get = (p) => (cache[p] = cache[p] || fetchJson(base + p));
    return {
      manifest: () => get('manifest.json'), index: () => get('index.json'), searchDoc: () => get('search.json'),
      shard: (id, m) => get('detail/' + shardName(shardOf(id, m.shards)) + '.json'),
      project: (id, m) => get('detail/' + shardName(shardOf(id, m.shards)) + '.json').then((d) => d.projects[id] || null),
      peers: (scope) => get(peerScopeFile(scope)),
    };
  }

  return { normaliseName, compactName, slugify, hash32, shardOf, shardName, SHARDS, search, findById, rowObject, fieldMap, decode, decodeAll, dist5, cells, compare, history, monthly, peerCells, peerScopeFile, createStore, addMonths, WINDOW_LABEL, SALE };
});
