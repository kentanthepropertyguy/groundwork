#!/usr/bin/env node
/* Builds data/map/upcoming.json: the new launches and awarded GLS sites the Map and the budget tool show next to the developments that have URA sales.
   Inputs:  tools/market-data/upcoming-register.json (hand-kept, small)
            URA Sale Sites GeoJSON (data.gov.sg, d_0e2b42f98535686282031a42c9c7b05a): site boundaries, planning area, homes, awardee, award date
            OneMap address search (structured building records, e.g. "THOMSON RESERVE (U/C)")
            data/map/places.json (so a site that already holds a development with URA sales is not listed twice), data/research/sites.json (microsite links), data/registry/index.json (Research links)
   Run:     node tools/market-data/build-upcoming.js                      (downloads the URA file and asks OneMap; needs the internet)
            node tools/market-data/build-upcoming.js --ura file.geojson --ura-updated 2026-06-18 --onemap-cache cache.json   (offline: both files you saved earlier)
   A position is only ever a verified one: the middle of an official URA site boundary, or the middle of OneMap's own building records for the project. No position, no marker. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..');
const URA_ID = 'd_0e2b42f98535686282031a42c9c7b05a';
const URA_VIEW = 'https://data.gov.sg/datasets/' + URA_ID + '/view';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------------- geometry (WGS84 lon/lat; metres by a local scale, good to well under a metre over a site) ---------------- */
const KX = 111320 * Math.cos(1.35 * Math.PI / 180), KY = 110574;
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
function ringIn(x, y, ring) { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; }
const inside = (lon, lat, g) => polysOf(g).some((p) => ringIn(lon, lat, p[0]) && !p.slice(1).some((h) => ringIn(lon, lat, h)));
/* The middle of the biggest part of a boundary that really lies inside it: the area centroid, or a point found on a grid when the shape bends round it. */
function interior(g) {
  let best = null;
  polysOf(g).forEach((p) => {
    const r = p[0]; let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const x1 = r[j][0] * KX, y1 = r[j][1] * KY, x2 = r[i][0] * KX, y2 = r[i][1] * KY, f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f; }
    a /= 2; const area = Math.abs(a); if (!area) return; cx /= 6 * a; cy /= 6 * a;
    let lon = cx / KX, lat = cy / KY;
    const pg = { type: 'Polygon', coordinates: p };
    if (!inside(lon, lat, pg)) {
      const xs = r.map((q) => q[0]), ys = r.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); let bd = -1;
      for (let i = 1; i < 40; i++) for (let j = 1; j < 40; j++) { const px = x0 + (x1 - x0) * i / 40, py = y0 + (y1 - y0) * j / 40; if (!inside(px, py, pg)) continue; let d = Infinity; for (let k = 0; k < r.length; k++) d = Math.min(d, Math.hypot((px - r[k][0]) * KX, (py - r[k][1]) * KY)); if (d > bd) { bd = d; lon = px; lat = py; } }
    }
    if (!best || area > best.area) best = { lon, lat, area };
  });
  return best;
}
const round5 = (n) => Math.round(n * 1e5) / 1e5;

/* ---------------- text helpers ---------------- */
const monYear = (d) => MON[+d.slice(4, 6) - 1] + ' ' + d.slice(0, 4);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cleanCo = (s) => String(s || '').replace(/\s*\([^)]*\)/g, '').replace(/\b(Pte\.?\s*Ltd\.?|Private Limited|Limited|Ltd\.?|Pte)\b\.?/gi, '').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').replace(/[ ,]+$/g, '').trim();
const joinCo = (s) => { const l = String(s || '').split(/,\s*|\s+and\s+/i).map(cleanCo).filter(Boolean); return l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l[0] || ''; };
const num = (n) => Math.round(n).toLocaleString('en-SG');

/* ---------------- URA Sale Sites ---------------- */
const siteKey = (f) => f.properties.DATE_AWARD + '|' + f.properties.LOCATION;
function uraFacts(feats) {
  const out = [], homes = feats.map((f) => f.properties.HOUSING_UN).filter((n) => n > 0);
  if (homes.length) out.push(['Homes', feats.length > 1 ? 'About ' + num(homes.reduce((s, n) => s + n, 0)) + ', on ' + feats.length + ' URA sites (' + homes.map(num).join(' and ') + ')' : 'About ' + num(homes[0]) + ' (URA’s indicative number)']);
  const aw = feats.map((f) => f.properties).filter((p) => p.DATE_AWARD).sort((a, b) => a.DATE_AWARD.localeCompare(b.DATE_AWARD)), who = joinCo(aw.map((p) => p.SUCCESS_TR).filter((v, i, a) => a.indexOf(v) === i).join(', '));
  if (aw.length) out.push(['Awarded', (aw.length > 1 && monYear(aw[0].DATE_AWARD) !== monYear(aw[aw.length - 1].DATE_AWARD) ? monYear(aw[0].DATE_AWARD) + ' and ' + monYear(aw[aw.length - 1].DATE_AWARD) : monYear(aw[0].DATE_AWARD)) + (who ? ', to ' + who : '')]);
  const ex = feats.map((f) => f.properties.EXPECTED_P).filter(Boolean).sort().pop(); if (ex) out.push(['Expected completion', ex + ' (URA)']);
  return out;
}
const ura = (feats) => feats.length ? { area: feats[0].properties.PLN_AREA_N || '', pos: ((feats.length === 1 ? interior(feats[0].geometry) : (() => { const ps = feats.map((f) => interior(f.geometry)), w = ps.reduce((s, p) => s + p.area, 0); return { lon: ps.reduce((s, p) => s + p.lon * p.area, 0) / w, lat: ps.reduce((s, p) => s + p.lat * p.area, 0) / w }; })())) } : null;

/* ---------------- the build ---------------- */
/* in: { register, geo (GeoJSON), uraUpdated 'YYYY-MM-DD', onemap(query) -> results[], places (places.json), sites (sites.json), registry (registry/index.json), today 'YYYY-MM-DD' } */
function build(inp) {
  const reg = inp.register, feats = inp.geo.features, byKey = {}; feats.forEach((f) => { byKey[siteKey(f)] = f; });
  const warn = [], items = [], claimed = {}, today = inp.today;
  const regIds = new Set((inp.registry && inp.registry.rows || []).map((r) => r[0])), siteBy = {}; ((inp.sites && inp.sites.sites) || []).forEach((s) => { siteBy[s.id] = s; });
  const placeIds = new Set(inp.places.rows.map((r) => r[0])), placeNames = new Set(inp.places.rows.map((r) => String(r[1]).toLowerCase()));
  const seenIds = new Set();
  reg.entries.forEach((e) => {
    if (!e.id || !e.name || seenIds.has(e.id)) throw new Error('register: every entry needs a unique id and a name (' + e.id + ')'); seenIds.add(e.id);
    if (placeIds.has(e.id) || placeNames.has(e.name.toLowerCase())) { warn.push(e.id + ' is now in the transaction register: remove it from upcoming-register.json (the Map already ignores it).'); return; }
    const keys = e.ura || [], fs_ = keys.map((k) => { if (!byKey[k]) throw new Error('register: ' + e.id + ' names a URA site that is not in the dataset: ' + k); claimed[k] = e.id; return byKey[k]; });
    const u = ura(fs_), it = { id: e.id, name: e.name, kind: e.kind, stage: e.stage, cls: e.cls || 'condo' };
    if (e.nameStatus) it.nameStatus = e.nameStatus;
    if (e.agency) it.agency = e.agency;   // HDB for an HDB sale site; URA is the default and is not stored
    if (e.district) it.district = e.district; if (e.tenure) it.tenure = e.tenure; if (e.aliases && e.aliases.length) it.aliases = e.aliases;
    if (u && u.area) it.area = u.area;
    // position: only a verified one
    let pos = null, posSrc = '';
    if (e.position && e.position.type === 'onemap') {
      const res = (inp.onemap(e.position.query) || []).filter((r) => String(r.BUILDING || '').toUpperCase().indexOf(String(e.position.building || '').toUpperCase()) > -1 && String(r.BUILDING).toUpperCase().indexOf(e.position.query.toUpperCase()) > -1);
      if (!res.length) throw new Error('register: OneMap has no record "' + e.position.query + ' ' + (e.position.building || '') + '" for ' + e.id);
      const la = res.map((r) => +r.LATITUDE), lo = res.map((r) => +r.LONGITUDE);
      pos = { lat: la.reduce((s, v) => s + v, 0) / la.length, lon: lo.reduce((s, v) => s + v, 0) / lo.length };
      posSrc = 'OneMap’s address records for ' + res[0].BUILDING + ' (' + res.length + ' block' + (res.length === 1 ? '' : 's') + ')';
      if (keys.length) { const g = fs_[0].geometry, out = res.filter((r) => !inside(+r.LONGITUDE, +r.LATITUDE, g)).length; if (out) throw new Error('register: ' + e.id + ': ' + out + ' OneMap block(s) lie outside the URA site it is linked to'); }
    } else if (e.position && e.position.type === 'ura') {
      if (!u) throw new Error('register: ' + e.id + ' has position type "ura" but no ura sites'); pos = u.pos; posSrc = (fs_.length > 1 ? 'the middle of the official URA site boundaries' : 'the middle of the official URA site boundary') + ' (URA Sale Sites)';
    }
    else if (e.position && e.position.type === 'parcel') {
      const pc = ((inp.parcels && inp.parcels.parcels) || {})[e.id]; if (!pc) throw new Error('register: ' + e.id + ' has position type "parcel" but tools/market-data/sources/parcels.json has none (run extract-parcel.js)');
      pos = interior({ type: 'Polygon', coordinates: pc.rings }); posSrc = 'the middle of its land parcel in URA’s Master Plan 2025 (' + String(pc.zoning).toLowerCase() + ', ' + num(pc.areaSqm) + ' sqm, the same area as the ' + num(pc.publishedAreaSqm) + ' sqm in the tender documents)';
    }
    if (pos) { it.lat = round5(pos.lat); it.lon = round5(pos.lon); it.posSrc = posSrc; } else if (e.positionNote) it.posNote = e.positionNote;
    it.facts = [].concat(fs_.length ? uraFacts(fs_) : [], e.facts || []);
    if (e.microsite) { const s = siteBy[e.microsite]; if (!s || !/^https:\/\//.test(s.url || '')) warn.push(e.id + ': microsite "' + e.microsite + '" is not configured in sites.json'); else it.ms = s.url; }
    if (e.registry) { if (regIds.has(e.registry)) it.rs = e.registry; else warn.push(e.id + ': registry id "' + e.registry + '" is not in the development register'); }
    it.src = (e.sources || []).slice();
    items.push(it);
  });
  /* ---- URA residential sites, at any age, until they are resolved. A site is RESOLVED (not listed) when:
          it is linked to a register entry (`ura` keys), or a development with URA sales sits inside it, or its URA completion year has passed, or the register says so (`auto.resolved`).
          It is NAMED when OneMap holds one project name "(U/C)" inside its boundary (the project keeps the site's id, so nothing is duplicated), and otherwise listed as a GLS site with no project name yet. ---- */
  const au = reg.auto || {}, thisYear = +today.slice(0, 4), cutS = au.months ? (() => { const c = new Date(today + 'T00:00:00Z'); c.setUTCMonth(c.getUTCMonth() - au.months); return c.toISOString().slice(0, 10).replace(/-/g, ''); })() : '';
  const land = new Set(au.landUse || []), skip = new Set((au.skip || []).concat(Object.keys(au.resolved || {})));
  const placed = inp.places.rows.filter((r) => r[2] != null), uc = (inp.uc && inp.uc.rows) || [];
  const norm = (n) => String(n || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '').replace(/^the/, '');
  const known = new Set(); inp.places.rows.forEach((r) => known.add(norm(r[1]))); ((inp.registry && inp.registry.rows) || []).forEach((r) => { known.add(norm(r[1])); (r[12] || []).forEach((x) => known.add(norm(x))); });
  items.forEach((x) => { known.add(norm(x.name)); (x.aliases || []).forEach((y) => known.add(norm(y))); });
  const cand = feats.filter((f) => land.has(f.properties.DEVT_CODE) && f.properties.HOUSING_UN > 0 && (!cutS || (f.properties.DATE_AWARD || '') >= cutS) && !claimed[siteKey(f)] && !skip.has(siteKey(f)));
  const nameCount = {}; cand.forEach((f) => { nameCount[f.properties.LOCATION] = (nameCount[f.properties.LOCATION] || 0) + 1; });
  const stats = { sites: cand.length, withSales: 0, completed: 0, named: 0, launchedNamed: 0, unnamed: 0 }, usedUc = new Set();
  cand.sort((a, b) => b.properties.DATE_AWARD.localeCompare(a.properties.DATE_AWARD) || a.properties.LOCATION.localeCompare(b.properties.LOCATION)).forEach((f) => {
    const p = f.properties, key = siteKey(f), u = ura([f]);
    const inUc = uc.filter((r) => inside(r.lo, r.la, f.geometry)); inUc.forEach((r) => usedUc.add(r.b));
    if (placed.some((r) => inside(r[3], r[2], f.geometry))) { stats.withSales++; return; }
    const names = {}; inUc.forEach((r) => { names[r.b] = (names[r.b] || 0) + 1; });
    const nm = Object.keys(names).sort((x, y) => names[y] - names[x]);
    if (nm.length > 1) warn.push(key + ': OneMap shows ' + nm.length + ' project names inside this site (' + nm.join(', ') + '); left as a GLS site. Name it in the register.');
    if (nm.length === 1) {
      const proj = nm[0], clean = proj.replace(/\s*\(U\/C\)\s*$/i, '').trim();
      if (known.has(norm(clean))) { stats.launchedNamed++; return; }   // it already has URA sales (the development register and the Map hold it)
      const rows = inUc.filter((r) => r.b === proj), la = rows.map((r) => r.la), lo = rows.map((r) => r.lo), tc = clean.toLowerCase().replace(/(^|[\s\-/(@])([a-z])/g, (x, a_, b_) => a_ + b_.toUpperCase());
      const it = { id: 'gls-' + p.DATE_AWARD.slice(0, 6) + '-' + slug(p.LOCATION), name: tc, kind: 'project', stage: 'under-construction', cls: 'condo', area: p.PLN_AREA_N || '', aliases: [p.LOCATION + ' GLS site'], lat: round5(la.reduce((s, v) => s + v, 0) / la.length), lon: round5(lo.reduce((s, v) => s + v, 0) / lo.length), posSrc: 'OneMap’s address records for ' + proj + ' (' + rows.length + ' block' + (rows.length === 1 ? '' : 's') + '), inside the URA site', facts: uraFacts([f]), src: [{ label: 'OneMap address records for ' + proj, url: 'https://www.onemap.gov.sg/' }, { label: 'URA Sale Sites: ' + p.LOCATION + ', awarded ' + monYear(p.DATE_AWARD), url: URA_VIEW }] };
      if (p.SA_SQM) it.facts.splice(1, 0, ['Site area', (p.SA_SQM / 10000).toFixed(2).replace(/0$/, '') + ' ha']);
      items.push(it); known.add(norm(clean)); stats.named++; return;
    }
    if (p.EXPECTED_P && +p.EXPECTED_P < thisYear) { stats.completed++; return; }
    // a development with sales on this road but no position of its own may BE this site (it launched); say so for a person to decide
    const road = norm(String(p.LOCATION).split('/')[0].replace(/\s*\(.*?\)/g, '')), maybe = ((inp.registry && inp.registry.rows) || []).filter((r) => norm(r[2]) === road && inp.places.rows.some((q) => q[0] === r[0] && q[2] == null)).map((r) => r[1]).filter((n) => !Object.keys(au.resolved || {}).some((k) => String(au.resolved[k]).toLowerCase().indexOf(n.toLowerCase()) > -1));
    if (maybe.length) warn.push(key + ' is listed as a GLS site, but ' + maybe.join(', ') + ' (sales on the same road, no map position) may be the project launched from it. If so, add the site to auto.resolved.');
    const name = p.LOCATION + ' GLS site' + (nameCount[p.LOCATION] > 1 ? ' (' + monYear(p.DATE_AWARD) + ')' : '');
    const it = { id: 'gls-' + p.DATE_AWARD.slice(0, 6) + '-' + slug(p.LOCATION), name, kind: 'gls', stage: 'awarded', unnamed: true, cls: 'condo', area: p.PLN_AREA_N || '', lat: round5(u.pos.lat), lon: round5(u.pos.lon), posSrc: 'the middle of the official URA site boundary (URA Sale Sites)', facts: uraFacts([f]), src: [{ label: 'URA Sale Sites: ' + p.LOCATION + ', awarded ' + monYear(p.DATE_AWARD), url: URA_VIEW }] };
    if (p.SA_SQM) it.facts.splice(1, 0, ['Site area', (p.SA_SQM / 10000).toFixed(2).replace(/0$/, '') + ' ha']);
    items.push(it); stats.unnamed++;
  });
  // under-construction names that belong to no listed site and to no development we hold: for a person to look at (never published automatically)
  const NOT_HOME = /community club|school|college|hawker|bus interchange|church|hotel|shopping|disability|polyclinic|hospital|mosque|temple|mrt|station|factory|industrial|campus|stadium/i, review = [];
  const heldNames = new Set(items.map((x) => norm(x.name)).concat((inp.linkedBuildings || []).map(norm)));   // a building linked by hand to a launched development (sources/position-links.json) is not a missing project
  Array.from(new Set(uc.map((r) => r.b))).sort().forEach((b) => { const c = b.replace(/\s*\(U\/C\)\s*$/i, ''); if (NOT_HOME.test(c) || known.has(norm(c)) || heldNames.has(norm(c)) || usedUc.has(b)) return; review.push(c + ' (' + (uc.find((r) => r.b === b).r || 'no road') + ')'); });
  const ids = items.map((x) => x.id); if (new Set(ids).size !== ids.length) throw new Error('duplicate ids in the output');
  return { stats, review, doc: { v: 1, asOf: today, sources: [{ k: 'ura-sale-sites', name: 'URA Sale Sites (GEOJSON)', by: 'Urban Redevelopment Authority', id: URA_ID, updated: inp.uraUpdated || null, accessed: today }, { k: 'onemap', name: 'OneMap address search (building records)', by: 'Singapore Land Authority', accessed: (inp.uc && inp.uc.fetched) || today }].concat(items.some((x) => /Master Plan/.test(x.posSrc || '')) ? [{ k: 'ura-mp2025', name: 'Master Plan 2025 Land Use Layer', by: 'Urban Redevelopment Authority', accessed: today }] : []), items }, warn };
}

module.exports = { build, interior, inside, siteKey, uraFacts, joinCo, cleanCo };

/* ---------------- command line ---------------- */
if (require.main === module) (async () => {
  const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
  const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const today = arg('as-of') || new Date().toISOString().slice(0, 10);
  let geo, updated = arg('ura-updated');
  if (arg('ura')) geo = JSON.parse(fs.readFileSync(arg('ura'), 'utf8'));
  else {
    const dl = await (await fetch('https://api-open.data.gov.sg/v1/public/api/datasets/' + URA_ID + '/poll-download')).json();
    geo = await (await fetch(dl.data.url)).json();
    try { const m = await (await fetch('https://api-production.data.gov.sg/v2/public/api/datasets/' + URA_ID + '/metadata')).json(); updated = updated || String(m.data.lastUpdatedAt).slice(0, 10); } catch (e) { /* the date is only a note */ }
  }
  const uc = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources/onemap-uc.json'), 'utf8')), parcels = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources/parcels.json'), 'utf8'));
  const register = read('tools/market-data/upcoming-register.json');
  const onemap = (q) => uc.rows.filter((r) => r.b.toUpperCase().indexOf(String(q).toUpperCase()) > -1).map((r) => ({ BUILDING: r.b, LATITUDE: r.la, LONGITUDE: r.lo }));   // the saved OneMap "(U/C)" records: a refresh needs no network for them
  const lk = path.join(__dirname, 'sources/position-links.json'), linkedBuildings = fs.existsSync(lk) ? Object.values(JSON.parse(fs.readFileSync(lk, 'utf8')).links).map((l) => l.building) : [];
  const r = build({ register, geo, uraUpdated: updated, onemap, uc, parcels, linkedBuildings, places: read('data/map/places.json'), sites: read('data/research/sites.json'), registry: read('data/registry/index.json'), today });
  r.warn.forEach((w) => console.warn('note: ' + w));
  console.log('URA residential sites: ' + r.stats.sites + ' open or unresolved at the start; ' + r.stats.withSales + ' hold a development with URA sales, ' + r.stats.launchedNamed + ' are named projects already in the development register, ' + r.stats.completed + ' are past their URA completion year, ' + r.stats.named + ' named from OneMap, ' + r.stats.unnamed + ' listed as GLS sites with no project name yet.');
  if (r.review.length) console.log('For review (under construction in OneMap, in no listed site and not in the development register; add to the register if it is a home you can verify):\n  ' + r.review.join('\n  '));
  fs.writeFileSync(path.join(ROOT, 'data/map/upcoming.json'), JSON.stringify(r.doc) + '\n');
  console.log('data/map/upcoming.json: ' + r.doc.items.length + ' items (' + r.doc.items.filter((x) => x.lat != null).length + ' with a verified position)');
})().catch((e) => { console.error(e.message); process.exit(1); });
