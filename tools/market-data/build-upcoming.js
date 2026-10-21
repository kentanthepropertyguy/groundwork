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
    if (pos) { it.lat = round5(pos.lat); it.lon = round5(pos.lon); it.posSrc = posSrc; } else if (e.positionNote) it.posNote = e.positionNote;
    it.facts = [].concat(fs_.length ? uraFacts(fs_) : [], e.facts || []);
    if (e.microsite) { const s = siteBy[e.microsite]; if (!s || !/^https:\/\//.test(s.url || '')) warn.push(e.id + ': microsite "' + e.microsite + '" is not configured in sites.json'); else it.ms = s.url; }
    if (e.registry) { if (regIds.has(e.registry)) it.rs = e.registry; else warn.push(e.id + ': registry id "' + e.registry + '" is not in the development register'); }
    it.src = (e.sources || []).slice();
    items.push(it);
  });
  // awarded residential GLS sites with no project name yet, from the official dataset
  const au = reg.auto || {}, cut = new Date(today + 'T00:00:00Z'); cut.setUTCMonth(cut.getUTCMonth() - (au.months || 12)); const cutS = cut.toISOString().slice(0, 10).replace(/-/g, '');
  const land = new Set(au.landUse || []), skip = new Set(au.skip || []);
  const placed = inp.places.rows.filter((r) => r[2] != null);
  const cand = feats.filter((f) => land.has(f.properties.DEVT_CODE) && (f.properties.DATE_AWARD || '') >= cutS && !claimed[siteKey(f)] && !skip.has(siteKey(f)) && f.properties.HOUSING_UN > 0);
  const nameCount = {}; cand.forEach((f) => { nameCount[f.properties.LOCATION] = (nameCount[f.properties.LOCATION] || 0) + 1; });
  cand.sort((a, b) => b.properties.DATE_AWARD.localeCompare(a.properties.DATE_AWARD) || a.properties.LOCATION.localeCompare(b.properties.LOCATION)).forEach((f) => {
    if (placed.some((r) => inside(r[3], r[2], f.geometry))) { warn.push(siteKey(f) + ' already holds a development with URA sales; not listed.'); return; }
    const p = f.properties, u = ura([f]), nm = p.LOCATION + ' GLS site' + (nameCount[p.LOCATION] > 1 ? ' (' + monYear(p.DATE_AWARD) + ')' : '');
    const it = { id: 'gls-' + p.DATE_AWARD.slice(0, 6) + '-' + slug(p.LOCATION), name: nm, kind: 'gls', stage: 'awarded', unnamed: true, cls: 'condo', area: p.PLN_AREA_N || '', lat: round5(u.pos.lat), lon: round5(u.pos.lon), posSrc: 'the middle of the official URA site boundary (URA Sale Sites)', facts: uraFacts([f]), src: [{ label: 'URA Sale Sites: ' + p.LOCATION + ', awarded ' + monYear(p.DATE_AWARD), url: URA_VIEW }] };
    if (p.SA_SQM) it.facts.splice(1, 0, ['Site area', (p.SA_SQM / 10000).toFixed(2).replace(/0$/, '') + ' ha']);
    items.push(it);
  });
  const ids = items.map((x) => x.id); if (new Set(ids).size !== ids.length) throw new Error('duplicate ids in the output');
  return { doc: { v: 1, asOf: today, sources: [{ k: 'ura-sale-sites', name: 'URA Sale Sites (GEOJSON)', by: 'Urban Redevelopment Authority', id: URA_ID, updated: inp.uraUpdated || null, accessed: today }, { k: 'onemap', name: 'OneMap address search (building records)', by: 'Singapore Land Authority', accessed: today }], items }, warn };
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
  const cache = arg('onemap-cache') ? JSON.parse(fs.readFileSync(arg('onemap-cache'), 'utf8')) : null, got = {};
  const register = read('tools/market-data/upcoming-register.json');
  if (!cache) for (const e of register.entries) if (e.position && e.position.type === 'onemap') { const r = await (await fetch('https://www.onemap.gov.sg/api/common/elastic/search?searchVal=' + encodeURIComponent(e.position.query) + '&returnGeom=Y&getAddrDetails=Y&pageNum=1')).json(); got[e.position.query] = r.results || []; }
  const onemap = (q) => (cache ? (cache[q] || {}).results : got[q]) || [];
  const r = build({ register, geo, uraUpdated: updated, onemap, places: read('data/map/places.json'), sites: read('data/research/sites.json'), registry: read('data/registry/index.json'), today });
  r.warn.forEach((w) => console.warn('note: ' + w));
  fs.writeFileSync(path.join(ROOT, 'data/map/upcoming.json'), JSON.stringify(r.doc) + '\n');
  console.log('data/map/upcoming.json: ' + r.doc.items.length + ' items (' + r.doc.items.filter((x) => x.lat != null).length + ' with a verified position)');
})().catch((e) => { console.error(e.message); process.exit(1); });
