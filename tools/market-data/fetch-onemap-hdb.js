#!/usr/bin/env node
/* Where is each HDB block? Asks OneMap (Singapore Land Authority) for every block that appears in the HDB resale files (data/value/hdb/t/*.json) and keeps
   only OneMap's own record for that block, accepted when ALL of these hold (otherwise the block is reported unresolved and gets no coordinates):
     - OneMap's block number equals the resale record's block (after upper-casing);
     - OneMap's road equals the resale record's road (gw-postal roadKey: "STREET"/"ST", "SAINT"/"ST", "COMMONWEALTH"/"C'WEALTH" ...);
     - the postal code is six digits, and the point is inside Singapore's bounding box.
   Writes tools/market-data/sources/onemap-hdb.json (commit it); build-hdb-map.js turns it into data/map/hdb.json. Visitors' browsers never call OneMap for this.
   node tools/market-data/fetch-onemap-hdb.js              (live OneMap; only blocks not already in the file)
   node tools/market-data/fetch-onemap-hdb.js --from raw.json   (a saved { "<town>|<street>|<block>": [OneMap results] }; used offline and by the tests)
   node tools/market-data/fetch-onemap-hdb.js --retry      (look up the unresolved blocks again) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..'), OUT = path.join(__dirname, 'sources/onemap-hdb.json'), DIR = path.join(ROOT, 'data/value/hdb');
const { roadKey } = require(path.join(ROOT, 'assets/js/gw-postal.js'));
const URL_ = 'https://www.onemap.gov.sg/api/common/elastic/search?returnGeom=Y&getAddrDetails=Y&pageNum=1&searchVal=';
const BOX = { la: [1.15, 1.48], lo: [103.6, 104.1] };
const nil = (v) => (v && String(v).toUpperCase() !== 'NIL' ? String(v) : '');
const inSg = (la, lo) => la >= BOX.la[0] && la <= BOX.la[1] && lo >= BOX.lo[0] && lo <= BOX.lo[1];
/* one block's OneMap answer -> [lat, lon, postal] or null */
function keep(block, street, results) {
  const rk = roadKey(street);
  for (const r of results || []) {
    if (nil(r.BLK_NO).toUpperCase() !== String(block).toUpperCase() || roadKey(r.ROAD_NAME) !== rk) continue;
    const la = +r.LATITUDE, lo = +r.LONGITUDE, p = nil(r.POSTAL);
    if (!isFinite(la) || !isFinite(lo) || !inSg(la, lo) || !/^\d{6}$/.test(p)) continue;
    return [Math.round(la * 1e6) / 1e6, Math.round(lo * 1e6) / 1e6, p];
  }
  return null;
}
/* the spelled-out form of an HDB road name, for a second try when the abbreviated one finds nothing */
const LONG = [['AVE', 'AVENUE'], ['ST', 'STREET'], ['RD', 'ROAD'], ['DR', 'DRIVE'], ['CRES', 'CRESCENT'], ['CL', 'CLOSE'], ['PL', 'PLACE'], ['TER', 'TERRACE'], ['LOR', 'LORONG'], ['JLN', 'JALAN'], ['NTH', 'NORTH'], ['STH', 'SOUTH'], ['CTRL', 'CENTRAL'], ['UPP', 'UPPER'], ['BT', 'BUKIT'], ['TG', 'TANJONG'], ['KG', 'KAMPONG'], ['GDNS', 'GARDENS'], ['HTS', 'HEIGHTS'], ["C'WEALTH", 'COMMONWEALTH'], ['MKT', 'MARKET'], ['BLVD', 'BOULEVARD'], ['LN', 'LANE'], ['PK', 'PARK']];
const spell = (s) => String(s).split(' ').map((w) => { const a = LONG.find((x) => x[0] === w.replace(/\.$/, '')); return a ? a[1] : w; }).join(' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ask(q) {
  for (let i = 0; i < 4; i++) {
    try { const x = await fetch(URL_ + encodeURIComponent(q), { signal: AbortSignal.timeout(20000) }); if (x.ok) return (await x.json()).results || []; if (x.status !== 429 && x.status < 500) throw new Error('OneMap ' + x.status); } catch (e) { if (i === 3) throw e; }
    await sleep(800 * (i + 1));
  }
  throw new Error('OneMap did not answer for ' + q);   // not "unresolved": left for the next run
}
function wanted() {
  const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), out = [];
  idx.towns.forEach((t) => {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, 't', t.id + '.json'), 'utf8')), seen = new Set();
    d.rows.forEach((r) => { const k = r[1] + '|' + r[2]; if (!seen.has(k)) { seen.add(k); out.push({ town: t.id, street: d.streets[r[2]], block: r[1] }); } });
  });
  return out;
}
async function main() {
  const i = process.argv.indexOf('--from'), raw = i > -1 ? JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8')) : null, retry = process.argv.includes('--retry');
  const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { rows: {}, unresolved: [] };
  const rows = JSON.parse(JSON.stringify(prior.rows)), miss = new Set(retry ? [] : (prior.unresolved || []).map((u) => u.join('|')));
  const all = wanted(), kOf = (w) => [w.town, w.street, w.block].join('|'), allK = new Set(all.map(kOf));
  const have = (w) => !!(rows[w.town] && rows[w.town][w.street] && rows[w.town][w.street][w.block]);
  const todo = all.filter((w) => !have(w) && !miss.has(kOf(w)));
  const put = (w, v) => { if (v) { ((rows[w.town] = rows[w.town] || {})[w.street] = rows[w.town][w.street] || {})[w.block] = v; miss.delete(kOf(w)); } else miss.add(kOf(w)); };
  const save = () => {
    const unresolved = [...miss].filter((k) => allK.has(k) && !have({ town: k.split('|')[0], street: k.split('|')[1], block: k.split('|')[2] })).sort().map((k) => k.split('|')), sorted = {};
    Object.keys(rows).sort().forEach((t) => { sorted[t] = {}; Object.keys(rows[t]).sort().forEach((s) => { sorted[t][s] = {}; Object.keys(rows[t][s]).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).forEach((b) => { sorted[t][s][b] = rows[t][s][b]; }); }); });
    const n = all.filter(have).length;
    fs.writeFileSync(OUT, JSON.stringify({ v: 1, source: 'OneMap address search (Singapore Land Authority); only OneMap records with the same block number and the same road as the HDB resale record', fetched: (prior.fetched && raw) ? prior.fetched : new Date().toISOString().slice(0, 10), coverage: { blocks: all.length, located: n, unresolved: unresolved.length }, rows: sorted, unresolved }) + '\n');
    return { n, unresolved };
  };
  async function one(w) {
    if (raw) { put(w, keep(w.block, w.street, raw[kOf(w)])); return; }
    try {
      let v = keep(w.block, w.street, await ask(w.block + ' ' + w.street));
      if (!v) v = keep(w.block, w.street, await ask(w.block + ' ' + spell(w.street)));
      put(w, v);
    } catch (e) { failed++; }   // no answer from OneMap: neither located nor unresolved; the next run looks again
  }
  const live = todo.filter((w) => !raw || raw[kOf(w)]), q = live.slice(), N = raw ? 1 : (+process.env.ONEMAP_CONCURRENCY || 16); let done = 0, failed = 0;
  await Promise.all(Array.from({ length: N }, async () => { for (let w; (w = q.shift());) { await one(w); if (!raw && ++done % 500 === 0) { save(); console.error('onemap-hdb: ' + done + '/' + live.length); } } }));
  const { n, unresolved } = save();
  console.log('onemap-hdb: ' + all.length + ' blocks, ' + n + ' located (' + (100 * n / all.length).toFixed(1) + '%), ' + unresolved.length + ' unresolved' + (failed ? ', ' + failed + ' not answered (run again)' : '') + '.');
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { keep, spell };
