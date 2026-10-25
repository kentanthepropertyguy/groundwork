/* ==========================================================================
   GROUNDWORK: HDB research. Presents the HDB resale records Property values already uses, as a page of its own in Research and as a short panel on the Map.
   It is NOT a second valuation engine. Every price, range, count and fallback comes from gw-value.js (hdbComps, hdbTypes, hdbResult) over the same
   data/value/hdb/t/<town>.json files, so a block and flat type read the same in Research, in Property values and on the Map.
   What this file adds:
     - an address for one block's research (#/hdb/<town>/<block>/<street>/<flat type>): public facts only, nothing the visitor typed, no finances;
     - nearby blocks: other blocks' own resales of the same flat type, using block positions looked up from OneMap in advance (data/map/hdb.json, built by
       tools/market-data/build-hdb-map.js); a block with no verified position falls back to the other blocks on its street, and is labelled that way;
     - the short evidence panel the Map shows (evidence), from the same hdbComps.
   Past resales are indicative. They are not current listings and not an official HDB valuation.
   UMD: window.GWH in the browser; Node uses the same functions for the tests.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GWH = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const V = () => root.GWV || (typeof require === 'function' ? require('./gw-value.js') : null);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RADII = [500, 1000, 2000], NEAR_WANT = 4, NEAR_MAX = 8, NEAR_POOL = 160;

  /* ---------------- the address of one block's research ---------------- */
  const GP = () => root.GW_POSTAL || (typeof require === 'function' ? require('./gw-postal.js') : null);
  const slug = (s) => GP().slug(s), typeSlug = slug;           // '4 ROOM' -> '4-room', 'MULTI-GENERATION' -> 'multi-generation'
  const hashFor = (c) => GP().hdbHash(c);                      // '#/hdb/bishan/155/bishan-st-13/4-room'
  const findStreet = (T, sl) => T.streets.findIndex((s) => slug(s) === sl);
  const findType = (I, sl) => I.types.findIndex((t) => typeSlug(t) === sl);
  const validParts = (p) => !!p && /^[a-z][a-z-]{1,30}$/.test(p.town || '') && /^\d{1,4}[a-z]{0,2}$/i.test(p.block || '') && /^[a-z0-9-]{2,70}$/.test(p.street || '') && (!p.type || /^[a-z0-9-]{3,24}$/.test(p.type));

  /* ---------------- block positions (data/map/hdb.json) ---------------- */
  // { v, towns: [id], streets: [name], fields: ['block','street','town','lat','lon','n'], rows: [[block, streetIx, townIx, lat, lon, n]] }
  function index(HM) {
    if (!HM || HM.__k) return HM;
    const k = {}; HM.rows.forEach((r) => { k[HM.towns[r[2]] + '|' + HM.streets[r[1]] + '|' + r[0]] = r; }); Object.defineProperty(HM, '__k', { value: k, enumerable: false });
    return HM;
  }
  const locate = (HM, town, street, block) => { const x = HM && index(HM).__k[town + '|' + street + '|' + block]; return x ? { lat: x[3], lon: x[4], n: x[5] } : null; };
  const rad = (d) => d * Math.PI / 180;
  const metres = (a, b, c, d) => { const x = rad(d - b) * Math.cos(rad((a + c) / 2)), y = rad(c - a); return Math.round(6371000 * Math.sqrt(x * x + y * y)); };
  // blocks within `radius` of a point that have sales of any type to compare (at least the minimum for a block range), nearest first
  function candidates(HM, from, radius, skipKey, minN) {
    if (!HM || !from) return [];
    const out = [], lim = radius / 111000 * 1.2;
    HM.rows.forEach((r) => {
      if (r[5] < (minN || 3) || Math.abs(r[3] - from.lat) > lim) return;
      const m = metres(from.lat, from.lon, r[3], r[4]); if (m > radius) return;
      const town = HM.towns[r[2]], street = HM.streets[r[1]]; if (town + '|' + street + '|' + r[0] === skipKey) return;
      out.push({ block: r[0], street, town, lat: r[3], lon: r[4], m, n: r[5] });
    });
    return out.sort((a, b) => a.m - b.m || (a.block < b.block ? -1 : 1)).slice(0, NEAR_POOL);
  }
  const townsOf = (cands) => [...new Set(cands.map((x) => x.town))];

  /* ---------------- comparison with other blocks: only their own resales ---------------- */
  // files: { townId: town file }. Keeps a candidate only when that block alone has enough resales of the flat type for a range (gw-value's own rule).
  function nearComps(cands, files, typeIx) {
    const v = V(), out = [];
    cands.forEach((c) => {
      const T = files[c.town]; if (!T) return;
      const s = T.streets.indexOf(c.street); if (s < 0) return;
      const d = v.hdbComps(T, c.block, s, typeIx);
      if (d.level === 'block') out.push(Object.assign({}, c, { d, s }));
    });
    return out;
  }
  // the smallest radius that gives enough blocks to compare; if none does, the widest one
  function pickRadius(comps, cands) {
    let use = RADII[RADII.length - 1];
    for (const r of RADII) if (comps.filter((x) => x.m <= r).length >= NEAR_WANT) { use = r; break; }
    const rows = comps.filter((x) => x.m <= use).slice(0, NEAR_MAX), skipped = cands.filter((x) => x.m <= use).length - comps.filter((x) => x.m <= use).length;
    return { radius: use, rows, skipped: Math.max(0, skipped), widened: use > RADII[0] };
  }
  // No verified position: the other blocks on the same street with enough resales of this flat type
  function streetComps(T, s, typeIx, skipBlock) {
    const v = V(), seen = {}, out = [];
    T.rows.forEach((r) => { if (r[2] === s && r[3] === typeIx && r[1] !== skipBlock) seen[r[1]] = 1; });
    Object.keys(seen).forEach((b) => { const d = v.hdbComps(T, b, s, typeIx); if (d.level === 'block') out.push({ block: b, street: T.streets[s], town: T.id, d, s }); });
    return out.sort((a, b) => a.block.localeCompare(b.block, 'en', { numeric: true })).slice(0, NEAR_MAX);
  }

  /* ---------------- what is shown ---------------- */
  const kmText = (m) => (m < 1000 ? m + ' m' : (m / 1000) + ' km');
  const away = (m) => (m < 100 ? 'under 100 m' : m < 1000 ? 'about ' + (Math.round(m / 50) * 50) + ' m' : 'about ' + (Math.round(m / 100) / 10) + ' km');
  // The short evidence the Map panel and the Research summary share: plain numbers from hdbComps, nothing computed here.
  function evidence(d, I) {
    const v = V(); if (!d) return null;
    const o = { level: d.level, n: d.n, blockN: d.blockN || 0, streetN: d.streetN || 0, lo: d.lo, hi: d.hi, q1: d.q1, q3: d.q3, midN: d.midN, newest: d.newest, oldest: d.oldest, stale: !!d.stale };
    if (d.n) { const areas = d.rows.map((x) => x[6]).sort((a, b) => a - b), leases = [...new Set(d.rows.map((x) => x[7]))].sort(); o.areaLo = areas[0]; o.areaHi = areas[areas.length - 1]; o.leaseLo = leases[0]; o.leaseHi = leases[leases.length - 1]; }
    if (I && v) { o.from = I.windowFrom; o.latest = I.latestMonth; }
    return o;
  }

  // The Map's short panel: the same numbers hdbResult shows, in a few lines. o: { flatType, street, I }
  function evidenceHtml(d, o) {
    const v = V(), money = v.money, ft = v.flatLabel(o.flatType), st = v.streetName(o.street), e = evidence(d, o.I);
    const plural = (n) => n + ' resale' + (n === 1 ? '' : 's');
    const line = e.level === 'block' ? plural(e.n) + ' in this block' : e.level === 'street' ? (e.blockN ? 'Only ' + e.blockN + ' in this block, so ' + plural(e.n) + ' on ' + st : 'None in this block, so ' + plural(e.n) + ' on ' + st) : e.level === 'thin' ? 'Only ' + plural(e.n) + ' on ' + st + ', too few for a range' : 'No resales on ' + st + ' since ' + v.ym(o.I.windowFrom);
    let h = '<div class="hev" data-hdb-ev="' + e.level + '"><p class="hev-k">' + esc(ft) + ' · ' + esc(line) + '</p>';
    if (e.lo !== undefined) h += '<p class="hev-p"><b>' + money(e.lo) + ' – ' + money(e.hi) + '</b></p>' + (e.q1 !== undefined ? '<p class="hev-m">The middle ' + e.midN + ' of ' + e.n + ': ' + money(e.q1) + ' – ' + money(e.q3) + '</p>' : '');
    else if (e.n) h += '<p class="hev-p"><b>' + d.rows.map((r) => r[9]).sort((a, b) => a - b).map(money).join(', ') + '</b></p>';
    if (e.n) {
      h += '<p class="hev-f">Registered ' + v.ym(e.oldest) + ' – ' + v.ym(e.newest) + ' · ' + (e.areaLo === e.areaHi ? e.areaLo : e.areaLo + '–' + e.areaHi) + ' sqm · lease began ' + (e.leaseLo === e.leaseHi ? e.leaseLo : e.leaseLo + '–' + e.leaseHi) + '</p>';
      if (e.stale) h += '<p class="hev-w">The latest was registered in ' + v.ym(e.newest) + '. Prices may have moved since.</p>';
    } else h += '<p class="hev-f">Check the flat type, or open the full research for the street.</p>';
    return h + '<p class="hev-n">Historical resale prices from HDB records, not current listings or an official HDB valuation.</p></div>';
  }
  const linkOf = (c, type) => hashFor({ town: c.town, block: c.block, street: c.street, flatType: type });
  function nearbyHtml(res, o) {
    const v = V(), title = v.streetName, money = v.money, ft = v.flatLabel(o.flatType), blk = 'Blk ' + o.block;
    const rowsHtml = (rows, showDist) => v.table([[showDist ? 'Block · distance' : 'Block'], ['Resales', 1], ['Sold for', 1]], rows.map((x) => ({
      cells: ['<a href="' + esc(linkOf(x, o.flatType)) + '" data-hv-block="' + esc(x.block) + '"><b>Blk ' + esc(x.block) + '</b> ' + esc(title(x.street)) + '</a>' + (showDist ? '<small>' + away(x.m) + '</small>' : ''),
        x.d.n + '<small>latest ' + v.ym(x.d.newest) + '</small>', money(x.d.lo) + ' – ' + money(x.d.hi)] })), 'blocks');
    let h = '<div class="gw-vx-res gw-hv-near" data-hv-near="' + res.kind + '"><p class="gw-ex">Compare nearby blocks · ' + esc(ft) + '</p>';
    if (!res.rows.length) {
      h += '<h3>No nearby block has enough ' + esc(ft) + ' resales to compare</h3><p class="gw-vx-why">' + (res.kind === 'street' ? 'No other block on ' + esc(title(o.street)) + ' has' : 'No other block within ' + kmText(res.radius || RADII[RADII.length - 1]) + ' has') + ' ' + v.HDB_MIN_BLOCK + ' or more resales of this flat type in the last 2 years.</p>';
    } else if (res.kind === 'near') {
      h += '<h3>' + res.rows.length + ' nearby block' + (res.rows.length === 1 ? '' : 's') + ' with ' + esc(ft) + ' resales, within ' + kmText(res.radius) + '</h3>';
      if (res.widened) h += '<p class="gw-vx-why">Fewer than ' + NEAR_WANT + ' blocks within ' + kmText(RADII[0]) + ' had enough resales, so we looked wider.</p>';
      h += rowsHtml(res.rows, true) + '<p class="gw-vx-why" data-hv-why>Each row is that block’s own resales (' + v.HDB_MIN_BLOCK + ' or more of this flat type in the last 2 years), not ' + esc(blk) + '’s. Distances are between block positions from OneMap.' + (res.skipped ? ' ' + res.skipped + ' other block' + (res.skipped === 1 ? '' : 's') + ' nearby ' + (res.skipped === 1 ? 'has' : 'have') + ' too few resales of this flat type to list.' : '') + '</p>';
    } else {
      h += '<h3>' + res.rows.length + ' other block' + (res.rows.length === 1 ? '' : 's') + ' on ' + esc(title(o.street)) + ' with ' + esc(ft) + ' resales</h3>';
      h += '<p class="gw-vx-why" data-hv-nopos>' + esc(blk) + ' has no verified position yet, so we compare the other blocks on its street rather than the blocks around it.</p>' + rowsHtml(res.rows, false);
    }
    return h + '</div>';
  }
  function nextHtml(o) {
    const mapLink = o.onMap ? '<a class="gw-vx-next" href="' + esc(o.mapHref) + '" data-gw-go="hdb-map"><b>See nearby blocks on the Map</b><span>Choose a radius and see HDB blocks beside private developments, the MRT and schools ›</span></a>' : '';
    return '<div class="gw-hv-next">' + mapLink +
      '<a class="gw-vx-next" href="' + esc(o.root) + 'tools/sale-proceeds/#hdb" data-gw-go="hdb-sale-proceeds"><b>Selling? Work out your sale proceeds</b><span>The cash and CPF you would have after selling ›</span></a>' +
      '<a class="gw-vx-next" href="#/budget" data-gw-go="hdb-upgrade"><b>Upgrading? See what a budget could buy</b><span>Homes in the area you choose, at the budget you have ›</span></a></div>';
  }

  /* ---------------- browser: the HDB page in Research ---------------- */
  const BUSY = '<p class="gw-vx-why" aria-live="polite">Loading the resale records…</p>';
  function mount(host, st, o) {
    o = o || {};
    const root_ = o.root || '../', v = V(), title = v.title;
    const cache = {}, getJson = (u) => cache[u] || (cache[u] = fetch(u).then((x) => { if (!x.ok) throw new Error(x.status); return x.json(); }).catch((e) => { delete cache[u]; throw e; }));
    const dv = root_ + 'data/value/', nav = (h, replace) => { if (o.go) o.go(h, replace); };
    host.innerHTML = '<section class="gw-panel gw-vx gw-hv" data-gw-hdbview>' + BUSY + '</section>';
    const sec = host.firstElementChild;
    const bad = (head, text) => { sec.innerHTML = '<p class="kpt-eyebrow">HDB resale research</p><h1 class="kpr-h" tabindex="-1">' + esc(head) + '</h1><p class="kpr-lead">' + text + '</p><div class="gw-vx-next-w"><a class="gw-vx-next" href="#/prices" data-gw-go="hdb-prices"><b>Search property prices &amp; past sales</b><span>Find an HDB block by its postal code, or by town and block number ›</span></a></div>'; };
    return getJson(dv + 'hdb/index.json').then((I) => {
      const ti = I.towns.filter((t) => t.id === st.town)[0];
      if (!ti) return bad('We couldn’t find that town', 'This link may be out of date.');
      return Promise.all([getJson(dv + 'hdb/t/' + ti.id + '.json?v=' + encodeURIComponent(I.sourceVersion)), getJson(root_ + 'data/map/hdb.json?v=' + encodeURIComponent(I.sourceVersion)).catch(() => null)]).then((a) => {
        const T = a[0]; T.id = ti.id; const HM = a[1], s = findStreet(T, st.street), block = String(st.block).toUpperCase();
        if (s < 0) return bad('No resales on that street', 'HDB’s records show no resale on this street in ' + title(T.town) + ' since ' + v.ym(I.windowFrom) + '. Check the street, or search another block.');
        const streetName = T.streets[s], inBlock = T.blocks.some((b) => b[0] === block && b[1] === s), ty = v.hdbTypes(T, block, s), c0 = { town: T.id, block, street: streetName };
        const pos = locate(HM, T.id, streetName, block), want = st.type ? findType(I, st.type) : -1;
        let typeIx = want >= 0 && ty.all.indexOf(want) >= 0 ? want : (ty.inBlock.length === 1 ? ty.inBlock[0] : -1);
        sec.innerHTML = '<p class="kpt-eyebrow">HDB resale research</p><h1 class="kpr-h" tabindex="-1">Blk ' + esc(block) + ' ' + esc(v.streetName(streetName)) + '</h1>' +
          '<p class="kpr-lead" data-hv-lead>' + esc(title(T.town)) + ' · HDB flat. ' + (inBlock ? 'Choose a flat type to see what flats like it sold for.' : 'HDB records no resale in this block since ' + esc(v.ym(I.windowFrom)) + ', so these are the flat types resold on its street.') + '</p>' +
          '<div class="gw-q"><span class="l">Flat type</span><div class="gw-chips" role="group" aria-label="Flat type">' + ty.all.map((t) => '<button type="button" class="gw-chip" data-hv-ft="' + t + '" aria-pressed="false">' + esc(v.flatLabel(I.types[t])) + '</button>').join('') + '</div></div>' +
          '<div data-hv-out aria-live="polite"></div>';
        if (o.onTitle) o.onTitle('Blk ' + block + ' ' + v.streetName(streetName) + ' · HDB resale prices');
        const out = sec.querySelector('[data-hv-out]'), chips = Array.from(sec.querySelectorAll('[data-hv-ft]')); let seq = 0;
        // 25 Oct 2026: HDB-approved rents for this town (data/value/hdb/rent), matched on the exact town, block and street; no file, no section
        const RT = root.GW_RENT, rentP = RT ? getJson(dv + 'hdb/rent/index.json').then((RI) => getJson(dv + 'hdb/rent/t/' + ti.id + '.json?v=' + encodeURIComponent(RI.latestMonth)).then((RF) => [RI, RF])).catch(() => null) : Promise.resolve(null);
        const rentHtml = (R, t) => { if (!R || !RT) return ''; try { const L = RT.hdbLevels(R[1], R[0], { block, street: streetName, type: I.types[t] }); return RT.hdbHtml(L, R[0], { flat: v.flatLabel(I.types[t]), block, streetLabel: v.streetName(streetName), townLabel: title(T.town), ask: root.GWASK }); } catch (e) { return ''; } };
        function show(t, user) {
          const my = ++seq; typeIx = t;
          chips.forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.hvFt === t)));
          const d = v.hdbComps(T, block, s, t), c = Object.assign({ flatType: I.types[t] }, c0), here = { town: T.id, street: streetName, block };
          if (user) nav(hashFor(c), true);
          const finish = (nearRes) => rentP.then((RR) => {
            if (my !== seq) return;
            const mid = nearbyHtml(nearRes, { flatType: I.types[t], block, street: streetName }) + nextHtml({ root: root_, onMap: !!pos, mapHref: (o.mapHref ? o.mapHref(c0) : root_ + 'research/map/#pl=' + encodeURIComponent('hdb:' + T.id + '/' + String(block).toLowerCase() + '/' + slug(streetName)) + '&ft=' + typeSlug(I.types[t])) });
            out.innerHTML = v.hdbResult(d, c, T, I, root_, { view: true, mid, after: rentHtml(RR, t) });
            const a = out.querySelector('a[data-gw-wa]'); if (a && root.GW_WA) root.GW_WA.set(a, 'https://wa.me/6590908898?text=' + encodeURIComponent(v.hdbViewMsg(c)));
            if (o.onShown) o.onShown({ d, c, near: nearRes });
            if (user) { try { out.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* ignore */ } }
          });
          out.innerHTML = BUSY;
          if (!pos) { finish({ kind: 'street', rows: streetComps(T, s, t, block) }); return; }
          const cands = candidates(HM, pos, RADII[RADII.length - 1], T.id + '|' + streetName + '|' + block);
          Promise.all(townsOf(cands).map((id) => (id === T.id ? Promise.resolve(T) : getJson(dv + 'hdb/t/' + id + '.json?v=' + encodeURIComponent(I.sourceVersion)).then((x) => { x.id = id; return x; })))).then((fs) => {
            const files = {}; fs.forEach((f) => { files[f.id] = f; });
            const comps = nearComps(cands, files, t), pr = pickRadius(comps, cands); pr.kind = 'near'; finish(pr);
          }).catch(() => finish({ kind: 'street', rows: streetComps(T, s, t, block) }));
        }
        chips.forEach((b) => b.addEventListener('click', () => show(+b.dataset.hvFt, true)));
        if (typeIx >= 0) show(typeIx, false);
        const h = sec.querySelector('h1'); if (h) h.focus({ preventScroll: true });
      });
    }).catch((e) => { if (host.contains(sec)) bad('The resale records didn’t load', 'Please refresh the page, or <a href="#/prices">search for a property</a>.'); });
  }

  return { RADII, slug, typeSlug, hashFor, findStreet, findType, validParts, index, locate, metres, candidates, townsOf, nearComps, pickRadius, streetComps, evidence, nearbyHtml, nextHtml, evidenceHtml, mount };
});
