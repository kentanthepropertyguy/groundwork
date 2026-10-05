#!/usr/bin/env node
/* Writes ILLUSTRATIVE route stats (synthetic transactions, not market data) to data/market/test/route-stats/ so the internal
   engine-check page can be opened before real URA data exists. Re-run only if the engine input format changes. */
const fs = require('fs'), path = require('path');
const PIPE = require('./build-route-stats.js'), { synth } = require('./tests/synth.js');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), E = JSON.parse(fs.readFileSync(path.join(__dirname, 'engine-config.json'), 'utf8'));
const res = PIPE.build(synth(), cfg, E, '2026-10-05'); res.index.source = 'test: illustrative synthetic data, not market data';
const names = PIPE.write(res, path.join(__dirname, '../../data/market/test/route-stats'));
console.log('Wrote ' + names.length + ' shards to data/market/test/route-stats/');
