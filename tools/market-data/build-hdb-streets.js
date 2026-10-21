#!/usr/bin/env node
/* Which HDB town is a road in? Derived from the HDB resale town files already published (data/value/hdb/t/*.json): no new source, nothing fetched.
   Property values & market prices uses it to turn a postal code into a town and block without loading all 26 town files.
   Run after the HDB resale files are refreshed:  node tools/market-data/build-hdb-streets.js   -> data/value/hdb/streets.json (commit it with them). */
'use strict';
const fs = require('fs'), path = require('path');
const { roadKey } = require('../../assets/js/gw-postal.js');
const dir = path.join(__dirname, '../../data/value/hdb'), idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const streets = {};
idx.towns.forEach((t) => {
  const d = JSON.parse(fs.readFileSync(path.join(dir, 't', t.id + '.json'), 'utf8'));
  d.streets.forEach((s) => { const k = roadKey(s); (streets[k] = streets[k] || []); if (!streets[k].includes(t.id)) streets[k].push(t.id); });
});
const sorted = {}; Object.keys(streets).sort().forEach((k) => { sorted[k] = streets[k].sort(); });
const out = { v: 1, kind: 'gw-hdb-streets', sourceVersion: idx.sourceVersion, asOf: idx.asOf, note: 'Derived from data/value/hdb/t/*.json by tools/market-data/build-hdb-streets.js. road key -> town ids.', streets: sorted };
fs.writeFileSync(path.join(dir, 'streets.json'), JSON.stringify(out) + '\n');
console.log('data/value/hdb/streets.json: ' + Object.keys(sorted).length + ' roads, ' + Object.values(sorted).filter((a) => a.length > 1).length + ' in more than one town');
