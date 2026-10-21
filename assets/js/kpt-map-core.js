/* ==========================================================================
   KPT Interactive Map: logic layer (browser + Node). Pure functions over the generated map data; no DOM, no Leaflet.
   Reuses the Research rules without changing them: a typical price needs 5 sales over 3 months in a 100 sq ft band; a like-for-like
   comparison needs 2 sales over 2 months on both sides; nearby developments are ranked by tenure group, lease-start proximity and
   distance, never by sales count.
   Markets: Primary = New Sale; Secondary = Sub Sale + Resale (the Sub Sale count is kept inside every secondary cell).
   Data: data/map/places.json, ev.json, amen.json (published) and amen-extra.json (schools, supermarkets; present only when cleared).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPT_MAP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- formatting ---------------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => '$' + Math.round(n).toLocaleString('en-SG');
  const fmtM = (n) => '$' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  const band = (b) => b.toLocaleString('en-SG') + '–' + (b + 99).toLocaleString('en-SG') + ' sq ft';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ym = (n) => { const s = String(n); return MON[+s.slice(4) - 1] + ' ' + s.slice(0, 4); };
  const hav = (a, b) => { const R = 6371000, p = Math.PI / 180, dl = (b.lat - a.lat) * p, dn = (b.lon - a.lon) * p, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dn / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(x))); };
  const dist = (m) => m >= 1000 ? (m / 1000).toFixed(1).replace('.0', '') + ' km' : m.toLocaleString('en-SG') + ' m';
  const distA = (m) => m >= 950 ? (m / 1000).toFixed(1).replace('.0', '') + ' km' : (Math.max(10, Math.round(m / 10) * 10)).toLocaleString('en-SG') + ' m';

  const MKT = { new: ['Primary market', 'New Sale'], sec: ['Secondary market', 'Sub Sale + Resale'] };
  const WINL = ['last 12 months', 'last 24 months', 'last 36 months'];
  const supported = (c) => c.n >= 5 && c.act >= 3;                                          // the live "typical price" rule
  const likeOK = (a, b) => !!(a && b && a.n >= 2 && b.n >= 2 && a.act >= 2 && b.act >= 2);   // the live like-for-like rule

  /* ---------------- geometry: straight-line only ---------------- */
  const KX = 111320 * Math.cos(1.35 * Math.PI / 180), KY = 110574;
  /* distance (m) from a point to a polygon's boundary (0 inside), with the closest boundary point; rings are [[lat, lon], ...] */
  function pdist(lat, lon, rings) {
    const px = lon * KX, py = lat * KY; let best = Infinity, bl = null, inside = false;
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = ring[i][1] * KX, ay = ring[i][0] * KY, bx = ring[j][1] * KX, by = ring[j][0] * KY;
      if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) inside = !inside;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx, cy = ay + t * dy, d = Math.hypot(px - cx, py - cy); if (d < best) { best = d; bl = [cy / KY, cx / KX]; }
    }
    return inside ? { d: 0, lat, lon, inside: true } : { d: Math.round(best), lat: bl[0], lon: bl[1], inside: false };
  }
  function inside(lat, lon, rings) {
    const px = lon, py = lat; let ins = false;
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ay = ring[i][0], ax = ring[i][1], by = ring[j][0], bx = ring[j][1];
      if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) ins = !ins;
    }
    return ins;
  }

  /* ---------------- icons (neighbourhood kinds) ---------------- */
  const ICON = {
    mrt: '<rect x="5" y="3" width="14" height="14" rx="3.5"/><path d="M5 11h14M8.5 21l2-4M15.5 21l-2-4"/>',
    road: '<path d="M8 3 5 21M16 3l3 18"/><path d="M12 5v3M12 11v3M12 17v3"/>',
    school: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5v4.5c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/>',
    shop: '<path d="M6 8h12l1 12H5z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
    food: '<path d="M3 12h18a9 9 0 01-18 0z"/><path d="M8 8c0-1.6 1-1.6 1-3.2M13 8c0-1.6 1-1.6 1-3.2"/>',
    park: '<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V21"/>',
    dev: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
    area: '<path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'
  };
  const icon = (k, sz) => `<svg width="${sz || 14}" height="${sz || 14}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

  /* ---------------- development classes (shared register): condo | ec | cluster ---------------- */
  // A development is one class. Prices are only ever set beside developments of the same class, so a condo is never compared with an EC.
  const CLS = { condo: { short: '', label: 'Condominium', plural: 'condominiums' }, ec: { short: 'EC', label: 'Executive Condominium', plural: 'ECs' }, cluster: { short: 'Cluster housing', label: 'Strata landed (cluster housing)', plural: 'cluster-housing developments' } };

  /* ---------------- the model ---------------- */
  /* places: places.json; amen: amen.json; S: the app's state object (read for the selected size band and the nearby radius). */
  function create(placesDoc, amen, S) {
    const F = placesDoc.fields, P = placesDoc.rows.map((r) => { const o = {}; F.forEach((k, i) => { o[k === 'name' ? 'n' : k] = r[i]; }); o.pos = o.lat != null && o.lon != null; o.t12 = o.p12 + o.s12; o.cls = CLS[o.cls] ? o.cls : 'condo'; return o; });
    const PM = P.filter((p) => p.pos), BY = {}, BYID = {}; P.forEach((p) => { BY[p.n] = p; BYID[p.id] = p; });
    const AM = { stations: amen.stations, food: amen.food, parks: amen.parks, areas: amen.areas, schools: [], shops: [], sources: amen.sources.slice() };
    const EV = {}; let evReady = false, AREAOF = {};
    const m = { P, PM, BY, BYID, EV, AM, S, get ready() { return evReady; }, get AREAOF() { return AREAOF; }, latestMonth: placesDoc.latestMonth, asOf: placesDoc.asOf };

    m.setEvidence = (doc) => { Object.keys(doc.projects).forEach((id) => { const p = BYID[id]; if (p) EV[p.n] = doc.projects[id]; }); evReady = true; };
    /* Roads (data/value/landed/geo.json + geo-more.json: one approximate point per road, from OneMap). A road is a place to look around, never a sale. */
    const roadTitle = (n) => String(n || '').toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (x, a, b) => a + b.toUpperCase());
    AM.roads = [];
    m.setRoads = (geo, more) => {
      const seen = {}, out = [], add = (name, lat, lon, area, landed, district) => { const k = roadTitle(name) + '|' + (area || ''); if (!name || lat == null || seen[k]) return; seen[k] = 1; out.push({ title: roadTitle(name), area: area || '', lat, lon, landed, district: String(district || ''), key: roadTitle(name) + (area ? ' (' + area + ')' : '') }); };
      ((geo && geo.streets) || []).forEach((x) => add(x[0], x[2], x[3], x[4], true, x[1]));
      ((more && more.streets) || []).forEach((x) => add(x[0], x[1], x[2], x[3], false, ''));
      AM.roads = out;
    };
    m.hasRoads = () => AM.roads.length > 0;
    m.CLS = CLS; m.clsShort = (name) => (BY[name] ? CLS[BY[name].cls].short : '');
    /* a road by the name the address carries: "Springwood Crescent (Queenstown)", "Alnwick Road (D28)" (a street URA records sales on, by district) or just the name */
    const roadBy = (n) => {
      const x = /^(.*?)(?: \(([^)]*)\))?$/.exec(String(n || '')), nm = x[1], tag = x[2] || '', byName = AM.roads.filter((r) => r.title === nm);
      if (/^D\d+$/.test(tag)) return byName.find((r) => r.district && Number(r.district) === Number(tag.slice(1))) || byName[0];
      return (tag && byName.find((r) => r.area === tag)) || byName.sort((a, b) => (b.landed ? 1 : 0) - (a.landed ? 1 : 0))[0];
    };
    m.setExtra = (ex) => { AM.schools = ex.schools || []; AM.shops = ex.shops || []; AM.sources = AM.sources.concat(ex.sources || []); };
    m.hasSchools = () => AM.schools.length > 0; m.hasShops = () => AM.shops.length > 0;
    /* the planning area of every positioned development, by point-in-polygon (bounding box first) */
    AM.areas.forEach((a) => { a._b = a.b; });
    const areaAt = (lat, lon) => { for (const a of AM.areas) { const b = a.b; if (lat < b[0] || lat > b[2] || lon < b[1] || lon > b[3]) continue; if (inside(lat, lon, a.rings)) return a.n; } return null; };
    PM.forEach((p) => { const a = areaAt(p.lat, p.lon); if (a) AREAOF[p.n] = a; });
    m.areaAt = areaAt;

    /* ---- new launches and awarded GLS sites (data/map/upcoming.json) ----
       They have no URA sales, so they are not in places.json. Each becomes a development in this model (flag `up`): it is searchable, has a card, and a dot when it has a verified position.
       A project already in places.json (same id or same name) wins, so the day a launch gets its first URA sale the record is linked, never shown twice. No lat/lon means no marker, never a guess. */
    m.UP = [];
    m.setUpcoming = (doc) => {
      ((doc && doc.items) || []).forEach((it) => {
        if (!it || !it.id || !it.name || (BYID[it.id] && !BYID[it.id].up) || (BY[it.name] && !BY[it.name].up) || BYID[it.id]) return;
        const o = { id: it.id, n: it.name, lat: typeof it.lat === 'number' ? it.lat : null, lon: typeof it.lon === 'number' ? it.lon : null, district: it.district || '', seg: '', p12: 0, s12: 0, sub12: 0, t12: 0, cls: CLS[it.cls] ? it.cls : 'condo', up: it };
        o.pos = o.lat != null && o.lon != null; P.push(o); BY[o.n] = o; BYID[o.id] = o; m.UP.push(o);
        if (o.pos) { PM.push(o); const a = areaAt(o.lat, o.lon); if (a) AREAOF[o.n] = a; }
      });
    };
    /* what a card and a search row call it: "New launch", "New launch · under construction", "GLS site" */
    m.upTag = (p) => { const u = p && p.up; if (!u) return ''; return u.kind === 'launch' ? 'New launch' : u.unnamed ? 'GLS site' : 'Upcoming · GLS site'; };
    m.upStage = (p) => {
      const u = p && p.up; if (!u) return '';
      if (u.kind === 'launch') return u.stage === 'under-construction' ? 'New launch · under construction' : 'New launch';
      const who = u.agency === 'HDB' ? 'HDB GLS site' : 'GLS site';
      return u.unnamed ? 'Awarded ' + who + ' · no project name yet' : 'Awarded ' + who;
    };
    const upNear = (lat, lon, max, skip) => m.UP.filter((p) => p.pos && p !== skip).map((p) => ({ p, d: hav({ lat, lon }, p) })).filter((x) => x.d <= max).sort((a, b) => a.d - b.d);
    m.upNear = upNear;

    /* ---- postal codes: one shared module (assets/js/gw-postal.js), the same lookup the Budget Search and Property values pages use ---- */
    const PO = (typeof module === 'object' && module.exports) ? require('./gw-postal.js') : (typeof self !== 'undefined' ? self : {}).GW_POSTAL;
    if (!PO) throw new Error('kpt-map-core: gw-postal.js must be loaded first');
    m.PC = PO.PC; m.postalCode = PO.code; m.postalValid = PO.valid; m.postalMsg = PO.msg; m.postalState = PO.state; m.lookupPostal = PO.lookup;

    /* ---- price evidence ---- */
    const cellsOf = (name, mk, win = 0) => EV[name] ? EV[name].mk[mk].filter((c) => c[1] === win).map((c) => ({ bin: c[0], n: c[2], act: c[3], last: c[4], q1: c[5], med: c[6], q3: c[7], pmed: c[8], sub: c[9] })).sort((a, b) => a.bin - b.bin) : [];
    m.cellsOf = cellsOf;
    /* One market block: the shortest window (12, then 24, then 36 months) with at least one supported size; the three most-sold supported sizes. Medians are never pooled across sizes. */
    function market(name, mk) {
      const e = EV[name]; if (!e) return null; const hist = mk === 'new' ? e.tot.new : e.tot.sub + e.tot.res; if (!hist) return null;
      for (let w = 0; w < 3; w++) { const cs = cellsOf(name, mk, w), ok = cs.filter(supported); if (ok.length) return { mk, win: w, rows: ok.slice().sort((a, b) => b.n - a.n || a.bin - b.bin).slice(0, 3).sort((a, b) => a.bin - b.bin), count: cs.reduce((s, c) => s + c.n, 0), hist }; }
      return { mk, win: null, any36: cellsOf(name, mk, 2).length > 0, rows: [], hist, in12: mk === 'new' ? BY[name].p12 : BY[name].s12, last: mk === 'new' ? e.lastNew : e.lastSec };
    }
    m.market = market;
    /* "Mainly sub-sales": more than half of the secondary sales in the window the card is showing were Sub Sales. */
    m.mainlySub = (name) => { const mk = market(name, 'sec'); if (!mk) return false; const cs = cellsOf(name, 'sec', mk.win === null ? 2 : mk.win), n = cs.reduce((s, c) => s + c.n, 0), sub = cs.reduce((s, c) => s + c.sub, 0); return n > 0 && sub * 2 > n; };
    /* A size band the buyer selected in the price rows (supported rows only): drives the nearby comparison in that market and size. */
    function chosen(name) {
      if (!S.band) return null; const [mk, bin, win] = S.band.split(':'); const mm = market(name, mk);
      if (!mm || mm.win === null || mm.win !== +win || !mm.rows.some((c) => c.bin === +bin)) return null;
      return { mk, bin: +bin, win: +win };
    }
    const mostSold = (rows) => rows.reduce((a, c) => c.n > a.n ? c : a);
    /* The market and size a development is best described by: the market that has recent sales (shortest window first); when both do, the one with more sales in the last 12 months (a new launch is led by its Primary sales, a resale home by its Secondary). One rule for the card's headline and for the nearby comparison. */
    function lead(name) {
      const b = BY[name], order = b && b.p12 > b.s12 ? ['new', 'sec'] : ['sec', 'new']; let best = null;
      for (const mk of order) { const mm = market(name, mk); if (mm && mm.win !== null && (best === null || mm.win < best.mm.win)) best = { mk, mm, row: mostSold(mm.rows) }; }
      return best;
    }
    function focus(name) { const l = lead(name); return l && l.mm.win === 0 ? { mk: l.mk, bin: l.row.bin, win: 0 } : null; }
    m.chosen = chosen; m.focus = focus; m.lead = lead; m.mostSold = mostSold;

    /* ---- nearby developments (positioned only) ---- */
    const nearby = (name, radius) => { const c = BY[name]; if (!c || !c.pos) return []; return PM.filter((p) => p !== c && !p.up).map((p) => Object.assign({ d: hav(c, p) }, p)).filter((p) => p.d <= radius).sort((a, b) => a.d - b.d); };
    m.nearby = nearby;
    function rank(me, p) { const e = EV[p.n], sameTen = e.tenGroup === me.tenGroup, age = (e.lease && me.lease) ? Math.abs(e.lease - me.lease) : null; return (sameTen ? 0 : 1) * 1000 + (age == null ? 500 : Math.min(age, 50) * 10) + p.d / 100; }
    function suggest(name, mk, bin, radius) {
      const me = EV[name], mine = cellsOf(name, mk).find((c) => c.bin === bin), out = [];
      for (const p of nearby(name, radius)) { if (!EV[p.n] || p.cls !== BY[name].cls) continue; const theirs = cellsOf(p.n, mk).find((c) => c.bin === bin); if (likeOK(mine, theirs)) out.push({ p, e: EV[p.n], theirs, score: rank(me, p) }); }
      return out.sort((a, b) => a.score - b.score);
    }
    /* Surrounding market context (never the selected project's own price): nearby developments with a supported price in a size the project has actually transacted. */
    function context(name, radius, pref) {
      const me = EV[name]; let ref = pref;
      if (!ref) for (const mk of ['sec', 'new']) { const mm = market(name, mk); if (mm && mm.win !== null) { ref = { mk, bin: mostSold(mm.rows).bin, win: mm.win }; break; } }
      if (!ref) for (const mk of ['sec', 'new']) { for (let w = 0; w < 3 && !ref; w++) { const cs = cellsOf(name, mk, w); if (cs.length) { const b = cs.reduce((a, c) => c.n > a.n || (c.n === a.n && c.last > a.last) ? c : a); ref = { mk, bin: b.bin, win: w }; } } if (ref) break; }
      if (!ref) return null;
      const list = nearby(name, radius).filter((p) => EV[p.n] && p.cls === BY[name].cls).map((p) => { const c = cellsOf(p.n, ref.mk, ref.win).find((x) => x.bin === ref.bin); return c && supported(c) ? { p, e: EV[p.n], theirs: c, score: rank(me, p) } : null; }).filter(Boolean).sort((a, b) => a.score - b.score);
      return { ref, list };
    }
    function nearbyFor(name) {
      if (!EV[name] || !BY[name].pos) return { mode: 'none', list: [] };
      const f = chosen(name) || focus(name);
      if (f) { const sg = suggest(name, f.mk, f.bin, S.radius); if (sg.length) return { mode: 'compare', ref: f, list: sg.slice(0, 3), total: sg.length }; }
      const cx = context(name, S.radius, f); if (cx && cx.list.length) return { mode: 'context', ref: cx.ref, list: cx.list.slice(0, 3), total: cx.list.length };
      return { mode: 'none', ref: cx ? cx.ref : null, list: [] };
    }
    m.suggest = suggest; m.context = context; m.nearbyFor = nearbyFor; m.rank = rank;
    m.defaultRadius = (name) => { const n2 = nearby(name, 2000).filter((p) => p.cls === BY[name].cls).length; return n2 > 150 ? 1000 : n2 < 10 ? 3000 : 2000; };

    /* ---- the neighbourhood around a home ---- */
    const nearPts = (arr, p, n, max, k, f) => arr.filter(f || (() => true)).map((x) => ({ k, n: x.n, sub: x.sub || x.lv || x.w || '', d: hav(p, x), lat: x.lat, lon: x.lon })).filter((x) => x.d <= max).sort((a, b) => a.d - b.d).slice(0, n);
    const nearStations = (p, n, max = 3000) => AM.stations.map((s) => { let b = null; for (const e of s.ex) { const d = hav(p, { lat: e[0], lon: e[1] }); if (!b || d < b.d) b = { d, lat: e[0], lon: e[1] }; } return { k: 'mrt', n: s.n, sub: s.k === 'LRT' ? 'LRT' : 'MRT', ...b }; }).filter((x) => x.d <= max).sort((a, b) => a.d - b.d).slice(0, n);
    const nearParks = (p, n, max = 3000) => AM.parks.map((k) => { const r = pdist(p.lat, p.lon, k.rings); return { k: 'park', n: k.n, sub: '', d: r.d, lat: r.lat, lon: r.lon, a: k.a }; }).filter((x) => x.d <= max).sort((a, b) => a.d - b.d).slice(0, n);
    const isPri = (s) => s.lv === 'Primary' || (s.lv === 'Mixed level' && /^P/.test(s.rg)), isSec = (s) => s.lv === 'Secondary' || (s.lv === 'Mixed level' && /^S/.test(s.rg));
    m.isPri = isPri; m.isSec = isSec;
    /* "Around this home": what a buyer asks first. per = items per group (the phone peek shows the nearest only). Groups for data that is not loaded are left out. */
    m.around = (name, per = 2) => {
      const p = BY[name]; if (!p || !p.pos) return []; const one = per === 1, out = [];
      const mk = (id, label, k, items, none) => out.push({ id, label, k, items: items.map((i) => ({ ...i, id: i.k + ':' + i.n })), none });
      mk('tr', 'Transport', 'mrt', nearStations(p, per), 'No MRT or LRT station within 3 km');
      if (AM.schools.length) mk('sc', 'Schools', 'school', [...nearPts(AM.schools, p, 1, 3000, 'school', isPri), ...(one ? [] : nearPts(AM.schools, p, 1, 3000, 'school', isSec))], 'No school within 3 km');
      const sm = AM.shops.length ? nearPts(AM.shops, p, 1, 3000, 'shop') : [], fd = one && sm.length ? [] : nearPts(AM.food, p, 1, 3000, 'food');
      mk('sh', AM.shops.length ? 'Shops & food' : 'Food', AM.shops.length ? 'shop' : 'food', [...sm, ...fd], AM.shops.length ? 'No supermarket or food centre within 3 km' : 'No food centre within 3 km');
      mk('pk', 'Parks', 'park', nearParks(p, per), 'No park within 3 km');
      return out;
    };

    /* ---- place search: developments, MRT stations, schools, neighbourhoods ---- */
    const NORM = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const rankIn = (n, t) => { const x = NORM(n), i = x.indexOf(t); return i < 0 ? null : i === 0 ? 0 : x.split(' ').some((w) => w.startsWith(t)) ? 1 : 2; };
    // a road is only offered for a real name: a house number, "road" or "street" on its own does not list the island
    const GENERIC = /^(road|street|avenue|drive|crescent|close|terrace|lorong|jalan|garden|gardens|place|lane|heights|park|view|walk|way|hill|rise|grove|north|south|east|west|upper|lower|bukit|the|and)$/;
    const roadQuery = (t) => t.length >= 3 && t.split(' ').some((w) => w.length >= 3 && !GENERIC.test(w));
    // new launches and GLS sites: by name or by any other name the register lists (so "One Chuan Grove" and "Chuan Grove" both find it)
    const upPick = (t) => m.UP.map((p) => { const names = [p.n].concat(p.up.aliases || []); let r = null; names.forEach((x) => { const k = rankIn(x, t); if (k !== null && (r === null || k < r)) r = k; }); return r === null ? null : { r, p }; }).filter(Boolean).sort((a, b) => a.r - b.r || a.p.n.length - b.p.n.length).slice(0, 3)
      .map((o) => ({ t: 'dev', g: 'up', n: o.p.n, sub: [o.p.up.kind === 'launch' ? 'New launch' : 'GLS site', o.p.pos ? '' : 'not on the map yet'].filter(Boolean).join(' · ') + (o.p.district ? ' · D' + Number(o.p.district) : '') }));
    m.places = (q) => {
      const t = NORM(q); if (!t) return [];
      const pick = (arr, name, mapper, cap, tie) => arr.map((x) => { const r = rankIn(name(x), t); return r === null ? null : { r, x }; }).filter(Boolean).sort((a, b) => a.r - b.r || (tie ? tie(b.x) - tie(a.x) : 0) || name(a.x).length - name(b.x).length).slice(0, cap).map((o) => mapper(o.x));
      return [
        ...pick(AM.areas, (a) => a.n, (a) => ({ t: 'area', n: a.n, sub: 'Neighbourhood' }), 2),
        ...pick(AM.stations, (s) => s.n, (s) => ({ t: 'mrt', n: s.n, sub: s.k + ' station' }), 3),
        ...pick(P.filter((p) => !p.up), (p) => p.n, (p) => ({ t: 'dev', n: p.n, sub: `D${Number(p.district)}${CLS[p.cls].short ? ' · ' + CLS[p.cls].short : ''} · ${p.t12} sale${p.t12 === 1 ? '' : 's'} in 12 months` }), 3, (p) => p.t12),
        ...upPick(t),
        ...pick(AM.schools, (s) => s.n, (s) => ({ t: 'school', n: s.n, sub: s.lab }), 2),
        ...(roadQuery(t) ? pick(AM.roads, (r) => r.title, (r) => ({ t: 'road', n: r.key, label: r.title, sub: r.area ? 'Road · ' + r.area : 'Road' }), 3, (r) => (r.landed ? 1 : 0)) : [])
      ];
    };

    /* ---- place cards (a neighbourhood, an MRT station or a school): context only, never a price for the place ---- */
    const stationBy = (n) => AM.stations.find((s) => s.n === n), schoolBy = (n) => AM.schools.find((s) => s.n === n), areaBy = (n) => AM.areas.find((a) => a.n === n);
    const devsNear = (lat, lon, max) => PM.filter((p) => EV[p.n]).map((p) => ({ p, e: EV[p.n], d: hav({ lat, lon }, p) })).filter((x) => x.d <= max).sort((a, b) => a.d - b.d);
    const nearStationDevs = (s, max) => PM.filter((p) => EV[p.n]).map((p) => { let d = Infinity; for (const x of s.ex) d = Math.min(d, hav({ lat: x[0], lon: x[1] }, p)); return { p, e: EV[p.n], d }; }).filter((x) => x.d <= max).sort((a, b) => a.d - b.d);
    /* r = the search radius in metres (500, 1000, 2000 or 3000; 1 km unless the visitor changes it) */
    m.RADII = [500, 1000, 2000, 3000];
    m.placeData = (pl, rad) => {
      const r = m.RADII.includes(rad) ? rad : 1000;
      if (pl.t === 'area') {
        const a = areaBy(pl.n); if (!a) return null;
        const stn = AM.stations.filter((s) => inside(s.lat, s.lon, a.rings)), sch = AM.schools.filter((s) => inside(s.lat, s.lon, a.rings));
        const pk = AM.parks.filter((k) => { const r = k.rings[0]; if (!r) return false; const la = r.reduce((s, q) => s + q[0], 0) / r.length, lo = r.reduce((s, q) => s + q[1], 0) / r.length; return inside(la, lo, a.rings); }).sort((x, y) => y.a - x.a);
        const devs = PM.filter((p) => AREAOF[p.n] === pl.n && EV[p.n]).sort((x, y) => y.t12 - x.t12 || x.n.localeCompare(y.n));
        const ups = m.UP.filter((p) => p.pos && AREAOF[p.n] === pl.n);
        return { t: 'area', title: a.n, meta: `Neighbourhood · ${a.region}`, a, stn, sch, pk, devs, ups, bounds: [[a.b[0], a.b[1]], [a.b[2], a.b[3]]], centre: [(a.b[0] + a.b[2]) / 2, (a.b[1] + a.b[3]) / 2] };
      }
      if (pl.t === 'postal') {
        const pc = m.PC[pl.n]; if (!pc) return null;
        const list = devsNear(pc.lat, pc.lon, r);
        const ar = areaAt(pc.lat, pc.lon);
        return { t: 'postal', title: pc.title, meta: 'Postal code ' + pc.code + (ar ? ' · ' + ar : ''), s: { lat: pc.lat, lon: pc.lon, lab: 'Address' }, list, r, lat: pc.lat, lon: pc.lon, ups: upNear(pc.lat, pc.lon, r) };
      }
      if (pl.t === 'road') {
        const rd = roadBy(pl.n); if (!rd) return null;
        const list = devsNear(rd.lat, rd.lon, r);
        const ar = rd.area || areaAt(rd.lat, rd.lon);
        return { t: 'road', title: rd.title, meta: 'Road' + (ar ? ' · ' + ar : ''), s: { lat: rd.lat, lon: rd.lon, lab: 'Road' }, list, r, lat: rd.lat, lon: rd.lon, road: rd, ups: upNear(rd.lat, rd.lon, r) };
      }
      if (pl.t === 'dev') {
        /* a selected development or launch: its own position is the centre, so the same optional radius works (nearby developments, launches and sites). Never a guess: no position, no radius. */
        const p = BY[pl.n]; if (!p || !p.pos) return null;
        const list = devsNear(p.lat, p.lon, r).filter((x) => x.p !== p), ar = AREAOF[p.n] || areaAt(p.lat, p.lon);
        return { t: 'dev', title: p.n, meta: 'Development' + (ar ? ' · ' + ar : ''), s: { lat: p.lat, lon: p.lon, lab: 'Selected' }, list, r, lat: p.lat, lon: p.lon, ups: upNear(p.lat, p.lon, r, p), self: p };
      }
      const s = pl.t === 'mrt' ? stationBy(pl.n) : schoolBy(pl.n); if (!s) return null;
      const ar = areaAt(s.lat, s.lon), list = pl.t === 'mrt' ? nearStationDevs(s, r) : devsNear(s.lat, s.lon, r);
      return { t: pl.t, title: s.n, meta: pl.t === 'mrt' ? `${s.k === 'LRT' ? 'LRT' : 'MRT'} station${ar ? ' · ' + ar : ''}` : `${s.lab}${ar ? ' · ' + ar : ''}`, s, list, r, lat: s.lat, lon: s.lon, ups: upNear(s.lat, s.lon, r) };
    };
    return m;
  }

  /* ---------- (i) help: the secondary explanation, one tap or hover away ----------
     help(text, label) returns a small "i" button. The text stays in the page (hidden, linked by aria-describedby), so it is never lost to a screen reader or a search, and is shown in one floating
     tip: on hover or keyboard focus on a desktop, on tap on a phone. One tip at a time; Escape or a tap elsewhere closes it. Used by the Map and by the budget tool's embedded Map. */
  let helpN = 0;
  const help = (text, label) => { const id = 'gwi-' + (++helpN); return `<span class="gwi-w"><button type="button" class="gwi" aria-label="${esc(label || 'More information')}" aria-expanded="false" aria-describedby="${id}">i</button><span class="gwi-t" id="${id}" hidden>${esc(text)}</span></span>`; };
  if (typeof document !== 'undefined' && !window.__gwiInit) {
    window.__gwiInit = true;
    let tip = null, cur = null, pinned = false, auto = null;
    const hide = () => { clearTimeout(auto); if (tip) { tip.remove(); tip = null; } if (cur) { cur.setAttribute('aria-expanded', 'false'); cur = null; } pinned = false; };
    const show = (b) => {
      if (cur === b) return; hide();
      const t = b.parentNode.querySelector('.gwi-t'); if (!t) return;
      tip = document.createElement('div'); tip.className = 'gwi-tip'; tip.setAttribute('role', 'tooltip'); tip.textContent = t.textContent; document.body.appendChild(tip);
      const r = b.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 24); tip.style.width = w + 'px';
      const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12)); tip.style.left = left + 'px';
      const h = tip.offsetHeight, below = r.bottom + 8 + h <= window.innerHeight - 8; tip.style.top = (below ? r.bottom + 8 : Math.max(8, r.top - 8 - h)) + 'px';
      b.setAttribute('aria-expanded', 'true'); cur = b;
      clearTimeout(auto); if (!hoverable()) auto = setTimeout(hide, 9000);   // on a phone the tip closes by itself, so it never stays over what is being read
    };
    const hoverable = () => window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
    document.addEventListener('mouseover', (e) => { const b = hoverable() && e.target.closest && e.target.closest('.gwi'); if (b && !pinned) show(b); });
    document.addEventListener('mouseout', (e) => { const b = e.target.closest && e.target.closest('.gwi'); if (b && !pinned && cur === b && !(e.relatedTarget && b.contains(e.relatedTarget))) hide(); });
    document.addEventListener('focusin', (e) => { const b = hoverable() && e.target.closest && e.target.closest('.gwi'); if (b && !pinned) show(b); });   // touch: the tap's own click opens it (a focus event first would make that click close it again)
    document.addEventListener('focusout', (e) => { if (e.target.closest && e.target.closest('.gwi') && !pinned) hide(); });
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.gwi');
      if (b) { e.preventDefault(); e.stopPropagation(); if (cur === b && (pinned || !hoverable())) hide(); else { show(b); pinned = true; } return; }
      if (tip && !(e.target.closest && e.target.closest('.gwi-tip'))) hide();
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tip) hide(); });
    window.addEventListener('scroll', () => { if (tip) hide(); }, true); window.addEventListener('resize', hide);
  }

  return { create, esc, help, fmt, fmtM, band, ym, hav, dist, distA, pdist, inside, icon, ICON, MKT, WINL, supported, likeOK };
});
