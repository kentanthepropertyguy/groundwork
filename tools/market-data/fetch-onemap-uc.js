#!/usr/bin/env node
/* Harvests every OneMap address record whose building name ends "(U/C)" (under construction): Singapore Land Authority's structured building records.
   They are the one official, machine-readable list of named projects that are being built, whether or not anything has been sold yet.
   Writes tools/market-data/sources/onemap-uc.json (commit it). build-upcoming.js and build-positions.js read that file, so a refresh needs no network.
   node tools/market-data/fetch-onemap-uc.js            (live OneMap)
   node tools/market-data/fetch-onemap-uc.js --from raw.json   (re-read a saved OneMap response list)                                                                  */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'sources/onemap-uc.json'), URL_ = 'https://www.onemap.gov.sg/api/common/elastic/search?returnGeom=Y&getAddrDetails=Y&searchVal=%28U%2FC%29&pageNum=';
const nil = (v) => (v && String(v).toUpperCase() !== 'NIL' ? String(v) : '');
function tidy(results) {
  const seen = new Set(), out = [];
  results.forEach((r) => {
    const b = String(r.BUILDING || '').replace(/\s+/g, ' ').trim(); if (!/\(U\/C\)\s*$/i.test(b)) return;
    const la = +r.LATITUDE, lo = +r.LONGITUDE; if (!isFinite(la) || !isFinite(lo)) return;
    const o = { b, k: nil(r.BLK_NO), r: nil(r.ROAD_NAME), p: nil(r.POSTAL), la: Math.round(la * 1e6) / 1e6, lo: Math.round(lo * 1e6) / 1e6 }, key = [o.b, o.k, o.p, o.la, o.lo].join('|');
    if (!seen.has(key)) { seen.add(key); out.push(o); }
  });
  return out.sort((a, b) => a.b.localeCompare(b.b) || a.k.localeCompare(b.k, 'en', { numeric: true }));
}
async function main() {
  const i = process.argv.indexOf('--from'); let results = [];
  if (i > -1) { const raw = JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8')); results = Array.isArray(raw) ? raw : raw.results; }
  else {
    for (let p = 1, n = 1; p <= n; p++) {
      const r = await fetch(URL_ + p); if (!r.ok) throw new Error('OneMap ' + r.status + ' on page ' + p); const d = await r.json();
      if (!Array.isArray(d.results)) throw new Error('OneMap: no results on page ' + p); n = Math.min(d.totalNumPages || 1, 200); results = results.concat(d.results);
    }
  }
  const rows = tidy(results); if (rows.length < 50) throw new Error('only ' + rows.length + ' under-construction records: refusing to overwrite the cache');
  fs.writeFileSync(OUT, JSON.stringify({ v: 1, source: 'OneMap address search, buildings named "(U/C)" (Singapore Land Authority)', fetched: new Date().toISOString().slice(0, 10), count: rows.length, rows }) + '\n');
  console.log(OUT + ': ' + rows.length + ' records, ' + new Set(rows.map((x) => x.b)).size + ' names');
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { tidy };
