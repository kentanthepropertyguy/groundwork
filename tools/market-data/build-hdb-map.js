#!/usr/bin/env node
/* Block positions for the Map's HDB resale layer -> data/map/hdb.json.
   Reads the OneMap positions fetched in advance (sources/onemap-hdb.json, written by fetch-onemap-hdb.js) and the HDB resale files (data/value/hdb/t/*.json, for how many resales each block has).
   Only blocks OneMap placed with the same block number and road are written; a block without a verified position is left out, never estimated. No network.
   Run after the HDB resale files or the positions are refreshed:  node tools/market-data/build-hdb-map.js   (then node tools/market-data/build-hdb-streets.js is unaffected) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..'), DIR = path.join(ROOT, 'data/value/hdb'), SRC = path.join(__dirname, 'sources/onemap-hdb.json'), OUT = path.join(ROOT, 'data/map/hdb.json');
function build(idx, towns, src) {
  const tIds = idx.towns.map((t) => t.id), streets = [], sIx = {}, rows = []; let blocks = 0;
  tIds.forEach((id, ti) => {
    const d = towns[id], count = {};
    d.rows.forEach((r) => { const k = r[1] + '|' + d.streets[r[2]]; count[k] = (count[k] || 0) + 1; });
    Object.keys(count).forEach((k) => {
      blocks++;
      const i = k.indexOf('|'), block = k.slice(0, i), street = k.slice(i + 1), p = src.rows[id] && src.rows[id][street] && src.rows[id][street][block];
      if (!p) return;
      if (sIx[street] === undefined) { sIx[street] = streets.length; streets.push(street); }
      rows.push([block, sIx[street], ti, Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5, count[k]]);
    });
  });
  rows.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0].localeCompare(b[0], 'en', { numeric: true }));
  return { v: 1, kind: 'gw-hdb-map', sourceVersion: idx.sourceVersion, asOf: idx.asOf, positions: 'OneMap address search (Singapore Land Authority), fetched ' + src.fetched, resales: 'HDB resale registrations ' + idx.windowFrom + ' to ' + idx.latestMonth + ' (data.gov.sg)',
    fields: ['block', 'street', 'town', 'lat', 'lon', 'n'], towns: tIds, streets, coverage: { blocks, located: rows.length, unresolved: blocks - rows.length }, rows };
}
if (require.main === module) {
  const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), towns = {};
  idx.towns.forEach((t) => { towns[t.id] = JSON.parse(fs.readFileSync(path.join(DIR, 't', t.id + '.json'), 'utf8')); });
  const out = build(idx, towns, JSON.parse(fs.readFileSync(SRC, 'utf8')));
  fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
  const c = out.coverage; console.log('data/map/hdb.json: ' + c.located + ' of ' + c.blocks + ' blocks have a verified position (' + (100 * c.located / c.blocks).toFixed(1) + '%), ' + c.unresolved + ' left out; ' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
}
module.exports = { build };
