#!/usr/bin/env node
/* For launched developments that URA gives no coordinates for and that have no "(U/C)" record (fetch-onemap-uc.js), asks OneMap for the project by name and keeps only
   OneMap's own building records that are provably the same project:
     - the building name equals the development's name (after punctuation, "@"/"at" and a leading "The");
     - the road equals the road URA gives for the development.
   Writes tools/market-data/sources/onemap-names.json (commit it); build-positions.js reads that file, so a refresh needs no network.
   node tools/market-data/fetch-onemap-names.js              (live OneMap; only developments still without a position)
   node tools/market-data/fetch-onemap-names.js --from raw.json   (a saved { id: [OneMap results] }; used offline and by the tests) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..'), OUT = path.join(__dirname, 'sources/onemap-names.json'), LINKS = path.join(__dirname, 'sources/position-links.json');
const URL_ = 'https://www.onemap.gov.sg/api/common/elastic/search?returnGeom=Y&getAddrDetails=Y&searchVal=';
const key = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/@/g, ' at ').replace(/[^a-z0-9]/g, '').replace(/^the/, '');
const nil = (v) => (v && String(v).toUpperCase() !== 'NIL' ? String(v) : '');
/* one development's answer -> the records that are the project, or [] */
function keep(name, street, results) {
  const seen = new Set(), out = [];
  (results || []).forEach((r) => {
    if (key(r.BUILDING) !== key(name) || key(r.ROAD_NAME) !== key(street)) return;
    const la = +r.LATITUDE, lo = +r.LONGITUDE; if (!isFinite(la) || !isFinite(lo)) return;
    const o = { b: String(r.BUILDING).replace(/\s+/g, ' ').trim(), k: nil(r.BLK_NO), r: nil(r.ROAD_NAME), p: nil(r.POSTAL), la: Math.round(la * 1e6) / 1e6, lo: Math.round(lo * 1e6) / 1e6 }, k = [o.k, o.p].join('|');
    if (!seen.has(k)) { seen.add(k); out.push(o); }
  });
  return out.sort((a, b) => a.k.localeCompare(b.k, 'en', { numeric: true }));
}
/* a hand-linked development (sources/position-links.json): OneMap's records for the building the source names, at the postal codes it names */
function keepLink(link, results) {
  const seen = new Set(), out = [];
  (results || []).forEach((r) => {
    if (key(r.BUILDING) !== key(link.building) || (link.postals && link.postals.indexOf(String(r.POSTAL)) < 0)) return;
    const la = +r.LATITUDE, lo = +r.LONGITUDE; if (!isFinite(la) || !isFinite(lo)) return;
    const o = { b: String(r.BUILDING).replace(/\s+/g, ' ').trim(), k: nil(r.BLK_NO), r: nil(r.ROAD_NAME), p: nil(r.POSTAL), la: Math.round(la * 1e6) / 1e6, lo: Math.round(lo * 1e6) / 1e6 }, k = [o.k, o.p].join('|');
    if (!seen.has(k)) { seen.add(k); out.push(o); }
  });
  return out.sort((a, b) => a.k.localeCompare(b.k, 'en', { numeric: true }));
}
async function main() {
  const places = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/map/places.json'), 'utf8')), reg = {};
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry/index.json'), 'utf8')).rows.forEach((r) => { reg[r[0]] = r; });
  const i = process.argv.indexOf('--from'), raw = i > -1 ? JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8')) : null;
  const links = fs.existsSync(LINKS) ? JSON.parse(fs.readFileSync(LINKS, 'utf8')).links : {}, prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { rows: {} }, rows = Object.assign({}, prior.rows);
  const todo = places.rows.filter((r) => r[2] == null && reg[r[0]] && (raw ? raw[r[0]] : !rows[r[0]]));
  for (const r of todo) {
    const link = links[r[0]]; let res = raw ? raw[r[0]] : null;
    if (!raw) { const x = await fetch(URL_ + encodeURIComponent(link ? link.building : r[1])); if (!x.ok) throw new Error('OneMap ' + x.status + ' for ' + r[1]); res = (await x.json()).results; }
    const k = link ? keepLink(link, res) : keep(r[1], reg[r[0]][2], res); if (k.length) rows[r[0]] = Object.assign({ name: r[1], street: reg[r[0]][2], rows: k }, link ? { link: { why: link.why, source: link.source } } : {});
  }
  fs.writeFileSync(OUT, JSON.stringify({ v: 1, source: 'OneMap address search by project name (Singapore Land Authority); only records with the same name and the same road as URA', fetched: new Date().toISOString().slice(0, 10), count: Object.keys(rows).length, rows }) + '\n');
  console.log('onemap-names: ' + todo.length + ' developments looked up, ' + Object.keys(rows).length + ' with records kept.');
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { keep, keepLink, key };
