#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — the homepage map preview's data (Homepage V1.1, 6 Nov 2026) -> data/map/home.json
     node tools/market-data/build-home-preview.js [--site .] [--check]

   Reads ONLY the Map's own published files (data/map/places.json, ev.json, amen.json) and works every figure out with the Map's own
   logic (assets/js/kpt-map-core.js, read as it is: lead() = the market and size band the Map's card leads with, the live "typical price"
   rule). Nothing is typed in here except which developments the homepage offers (FEATURED) and the area its dots cover; a development
   without a supported 12-month figure is written without one, and the page then says so.
   Run after build-map-data.js / build-pulse.js (refresh-all.js step 7b). --check: exit 1 if data/map/home.json differs from what the
   current Map data gives (the tests run it, so the homepage can never show figures the Map no longer shows).
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const site = path.resolve(arg('--site') || path.join(__dirname, '..', '..'));
const check = process.argv.includes('--check');

// The homepage's three developments, in the order of its chips (Ken's approved prototype, Homepage V1.1)
const FEATURED = ['jadescape', 'kingsford-waterbay', 'thomson-three'];
const MIN_DOT = 12;                        // background dots: developments with at least 12 secondary sales in the last 12 months (the prototype's rule)
const MARGIN = { lat: 0.025, lon: 0.03 };  // background dots: the area around the three developments a preview shows (about 3 km)

function build() {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(site, 'data/map', f), 'utf8'));
  const places = read('places.json'), ev = read('ev.json'), amen = read('amen.json');
  const K = require(path.join(site, 'assets/js/kpt-map-core.js'));
  const M = K.create(places, amen, {});
  M.setEvidence(ev);
  const feat = FEATURED.map((id) => {
    const p = M.BYID[id]; if (!p || !p.pos) throw new Error('featured development not on the Map: ' + id);
    const e = M.EV[p.n] || {}, l = M.lead(p.n), row = l && l.mm.win === 0 ? l.row : null;
    return {
      id: p.id, name: p.n, cls: p.cls, district: p.district, street: e.street || null, lat: p.lat, lon: p.lon,
      p12: p.p12, s12: p.s12, sub12: p.sub12,
      lead: row ? { mk: l.mk, bin: row.bin, n: row.n, act: row.act, last: row.last, psf: row.med, psfQ1: row.q1, psfQ3: row.q3, price: row.pmed, sub: row.sub } : null,
    };
  });
  const lat = feat.map((f) => f.lat), lon = feat.map((f) => f.lon);
  const box = { s: Math.min(...lat) - MARGIN.lat, n: Math.max(...lat) + MARGIN.lat, w: Math.min(...lon) - MARGIN.lon, e: Math.max(...lon) + MARGIN.lon };
  const dots = M.PM.filter((p) => !p.up && p.s12 >= MIN_DOT && FEATURED.indexOf(p.id) < 0 && p.lat >= box.s && p.lat <= box.n && p.lon >= box.w && p.lon <= box.e)
    .sort((a, b) => a.id < b.id ? -1 : 1).map((p) => [p.lat, p.lon, p.n]);
  return {
    v: 1, kind: 'gw-home-preview', asOf: places.asOf, latestMonth: places.latestMonth, source: places.source,
    from: ['data/map/places.json', 'data/map/ev.json'],
    rule: 'Figures are the Map card\'s own: the market and 100 sq ft band it leads with for the last 12 months (typical price needs 5 sales over 3 months). Dots: developments with ' + MIN_DOT + '+ secondary sales in the last 12 months, around the featured developments.',
    featured: feat, dotFields: ['lat', 'lon', 'name'], dots,
  };
}

const out = JSON.stringify(build()) + '\n', file = path.join(site, 'data/map/home.json');
if (check) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (cur !== out) { console.error('data/map/home.json is out of date with the Map data: run node tools/market-data/build-home-preview.js'); process.exit(1); }
  console.log('data/map/home.json matches the Map data'); process.exit(0);
}
fs.writeFileSync(file, out);
const d = JSON.parse(out);
console.log('data/map/home.json: ' + d.featured.length + ' developments (' + d.featured.map((f) => f.name + (f.lead ? ' $' + f.lead.psf + ' psf ' + f.lead.bin + ' sq ft, ' + f.lead.n + ' sales' : ' no 12-month figure')).join('; ') + '), ' + d.dots.length + ' dots, ' + out.length + ' bytes');
