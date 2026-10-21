#!/usr/bin/env node
/* Gives a position to launched developments that have URA sales but no URA coordinates (URA publishes none for most recent launches), so they are on the Map and in
   "near a place" searches like every other development. The only source is OneMap's own building record for the project, "NAME (U/C)": Singapore Land Authority's structured data,
   read from the saved cache tools/market-data/sources/onemap-uc.json (fetch-onemap-uc.js), then (for completed projects that have no "(U/C)" record) its records of the same name on the same road
   as URA gives, from sources/onemap-names.json (fetch-onemap-names.js). Nothing is guessed:
     - the name must match the development's name exactly (after removing "(U/C)", punctuation and a leading "The");
     - the records must lie within 600 m of their middle (otherwise they may be two places);
     - the record's postal sector must belong to the district URA gives the development, or it is not used and is reported;
     - the position is the middle of the project's blocks.
   Edits data/map/places.json in place (only rows with no position), and writes data/map/positions-onemap.json: which developments were placed this way, and from which records.
   It is safe to run again; build-map-data.js recreates places.json from URA, so run this after it (refresh-all.js does).
     node tools/market-data/build-positions.js [--check]     (--check: fail if places.json is not what this would produce) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..'), PLACES = path.join(ROOT, 'data/map/places.json'), OUTF = path.join(ROOT, 'data/map/positions-onemap.json'), UC = path.join(__dirname, 'sources/onemap-uc.json'), NAMES = path.join(__dirname, 'sources/onemap-names.json');
/* postal sector (first two digits) -> planning district, as published by SingPost / URA */
const SECTORS = { 1: [1, 2, 3, 4, 5, 6], 2: [7, 8], 3: [14, 15, 16], 4: [9, 10], 5: [11, 12, 13], 6: [17], 7: [18, 19], 8: [20, 21], 9: [22, 23], 10: [24, 25, 26, 27], 11: [28, 29, 30], 12: [31, 32, 33], 13: [34, 35, 36, 37], 14: [38, 39, 40, 41], 15: [42, 43, 44, 45], 16: [46, 47, 48], 17: [49, 50, 81], 18: [51, 52], 19: [53, 54, 55, 82], 20: [56, 57], 21: [58, 59], 22: [60, 61, 62, 63, 64], 23: [65, 66, 67, 68], 24: [69, 70, 71], 25: [72, 73], 26: [77, 78], 27: [75, 76], 28: [79, 80] };
const districtOf = {}; Object.keys(SECTORS).forEach((d) => SECTORS[d].forEach((s) => { districtOf[s] = +d; }));
const nameKey = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '').replace(/^the/, '');
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const hav = (a, b, c, d) => { const R = 6371000, t = Math.PI / 180, x = (c - a) * t, y = (d - b) * t, h = Math.sin(x / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const SPREAD = 600;   // metres: every record of one project lies within this of their middle, or the match is not trusted
/* places: the places.json document (edited in place); uc: the "(U/C)" cache; names: the by-name cache (fetch-onemap-names.js, optional).
   -> { placed: [[id, lat, lon, note]], skipped: [text] } */
function apply(places, uc, names) {
  const by = {}; uc.rows.forEach((r) => { (by[nameKey(r.b)] = by[nameKey(r.b)] || []).push(r); });
  const placed = [], skipped = [];
  places.rows.forEach((row) => {
    if (row[2] != null) return;
    const nm = names && names.rows && names.rows[row[0]], recs = by[nameKey(row[1])] || (nm && nm.rows); if (!recs || !recs.length) return;
    const dist = Array.from(new Set(recs.map((r) => districtOf[+String(r.p).slice(0, 2)]).filter(Boolean)));
    if (!dist.length || dist.some((d) => d !== +row[4])) { skipped.push(row[1] + ': OneMap record is in district ' + (dist.join('/') || '?') + ', URA says ' + row[4] + '; not used'); return; }
    const la = recs.reduce((s, r) => s + r.la, 0) / recs.length, lo = recs.reduce((s, r) => s + r.lo, 0) / recs.length;
    if (recs.some((r) => hav(la, lo, r.la, r.lo) > SPREAD)) { skipped.push(row[1] + ': OneMap records are more than ' + SPREAD + ' m apart, so they may be two places; not used'); return; }
    row[2] = r5(la); row[3] = r5(lo);
    placed.push([row[0], row[2], row[3], recs[0].b + ' (' + recs.length + ' block' + (recs.length === 1 ? '' : 's') + ')' + (nm && nm.link ? '; linked by hand: ' + nm.link.why : '')]);
  });
  return { placed, skipped };
}
function main() {
  const places = JSON.parse(fs.readFileSync(PLACES, 'utf8')), uc = JSON.parse(fs.readFileSync(UC, 'utf8')), names = fs.existsSync(NAMES) ? JSON.parse(fs.readFileSync(NAMES, 'utf8')) : null, before = JSON.stringify(places);
  const prior = fs.existsSync(OUTF) ? JSON.parse(fs.readFileSync(OUTF, 'utf8')) : { rows: [] };
  const r = apply(places, uc, names); const rows = prior.rows.filter((x) => places.rows.some((p) => p[0] === x[0] && p[2] === x[1] && p[3] === x[2])).concat(r.placed);   // rows filled earlier stay recorded
  const doc = { v: 1, source: 'OneMap address search (Singapore Land Authority): buildings named "(U/C)", saved ' + uc.fetched + (names ? ', and records with the same name and road, saved ' + names.fetched : ''), note: 'Developments with URA sales but no URA coordinates, placed at the middle of OneMap’s own records for the project. id, lat, lon, record.', rows };
  if (process.argv.includes('--check')) { const ok = r.placed.length === 0 && fs.existsSync(OUTF); console.log(ok ? 'positions: up to date (' + rows.length + ' placed from OneMap)' : 'positions: ' + r.placed.length + ' more developments can be placed; run build-positions.js'); process.exit(ok ? 0 : 1); }
  if (JSON.stringify(places) !== before) fs.writeFileSync(PLACES, JSON.stringify(places));
  fs.writeFileSync(OUTF, JSON.stringify(doc) + '\n');
  r.skipped.forEach((s) => console.warn('note: ' + s));
  const left = places.rows.filter((p) => p[2] == null).length;
  console.log('positions: ' + r.placed.length + ' placed now (' + rows.length + ' in all) from OneMap; ' + left + ' developments still have no verified position.');
}
if (require.main === module) main();
module.exports = { apply, nameKey, districtOf, SPREAD };
