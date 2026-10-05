#!/usr/bin/env node
/* ==========================================================================
   Route-stats pipeline (V1 engine input). Turns the raw URA transactions into AGGREGATES per budget step.
   Raw transactions are never written out. Output has no project names and no individual deals.

   Usage: node build-route-stats.js --raw raw --out out/route-stats [--as-of 2026-10-05]

   Output (folder):
     index.json          meta (period, as-of, step, windows, field order) + broad 12-month price P25/P75/n per route
     shard-<start>.json  one file per $500k of budget; each holds the steps in that block

   Per step (every $10k): narrow (+/-5%) and wide (+/-10%) window stats per route:
     [deals, distinct projects, top-project share, median price, median sqft, sqft P25, sqft P75]
   plus a total across all private (or all EC) deals in the window. Private condos/apartments and ECs are separate.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { quantile, flatten } = require('./build-bands.js');
const { prepare } = require('./budget-window.js');
const FIELDS = ['n', 'projects', 'top', 'medPrice', 'med', 'sqftP25', 'sqftP75'];
const r10 = (v) => Math.round(v / 10000) * 10000;
const key = (r) => [r.region, r.status, r.tenure].join('|');

function statArr(g) {
  const p = g.map((x) => x.price).sort((a, b) => a - b), s = g.map((x) => x.sqft).sort((a, b) => a - b), c = {};
  g.forEach((x) => { c[x.project] = (c[x.project] || 0) + 1; });
  const top = Math.max.apply(null, Object.values(c)) / g.length;
  return [g.length, Object.keys(c).length, Math.round(top * 1000) / 1000, Math.round(quantile(p, 0.5)), Math.round(quantile(s, 0.5) * 10) / 10, Math.round(quantile(s, 0.25) * 10) / 10, Math.round(quantile(s, 0.75) * 10) / 10];
}
function lowerBound(a, v) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].price < v) lo = m + 1; else hi = m; } return lo; }
function upperBound(a, v) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].price <= v) lo = m + 1; else hi = m; } return lo; }

function windowStats(sorted, lo, hi) {
  const slice = sorted.slice(lowerBound(sorted, lo), upperBound(sorted, hi)), g = {};
  slice.forEach((r) => { (g[key(r)] = g[key(r)] || []).push(r); });
  const routes = {}; Object.keys(g).forEach((k) => { routes[k] = statArr(g[k]); });
  return { routes, total: slice.length ? statArr(slice) : null };
}
function broadStats(rows) {
  const g = {}; rows.forEach((r) => { (g[key(r)] = g[key(r)] || []).push(r.price); });
  const o = {}; Object.keys(g).forEach((k) => { const p = g[k].sort((a, b) => a - b); o[k] = [Math.round(quantile(p, 0.25)), Math.round(quantile(p, 0.75)), p.length]; });
  return o;
}
function build(records, cfg, E, asOf) {
  const d = prepare(records, cfg);
  const ymTo = d.period.split(' to ')[1], ymFrom = d.period.split(' to ')[0];
  const sets = { private: d.private.slice().sort((a, b) => a.price - b.price), ec: d.ec.slice().sort((a, b) => a.price - b.price) };
  const steps = [];
  for (let b = E.min_budget; b <= E.max_budget; b += E.budget_step) {
    const lo = r10(b * (1 - E.narrow_pct / 100)), hi = r10(b * (1 + E.narrow_pct / 100)), loW = r10(b * (1 - E.wide_pct / 100)), hiW = r10(b * (1 + E.wide_pct / 100));
    const st = { b, win: [lo, hi, loW, hiW] };
    ['private', 'ec'].forEach((u) => {
      const n = windowStats(sets[u], lo, hi), w = windowStats(sets[u], loW, hiW), routes = {};
      new Set(Object.keys(n.routes).concat(Object.keys(w.routes))).forEach((k) => { routes[k] = { n: n.routes[k] || null, w: w.routes[k] || null }; });
      st[u] = { routes, total: { n: n.total, w: w.total } };
    });
    steps.push(st);
  }
  const index = {
    v: 1, fields: FIELDS, step: E.budget_step, shardSize: E.shard_size, minBudget: E.min_budget, maxBudget: E.max_budget,
    narrowPct: E.narrow_pct, widePct: E.wide_pct, period: d.period, windowFrom: ymFrom, windowTo: ymTo, asOf, source: 'URA transactions (PMI_Resi_Transaction)',
    deals: { private: sets.private.length, ec: sets.ec.length }, broad: { private: broadStats(sets.private), ec: broadStats(sets.ec) },
  };
  const shards = {};
  steps.forEach((s) => { const start = Math.floor(s.b / E.shard_size) * E.shard_size; (shards[start] = shards[start] || { start, steps: {} }).steps[s.b] = s; });
  return { index, shards };
}
function write(res, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const names = Object.keys(res.shards).sort((a, b) => a - b).map((k) => 'shard-' + k + '.json');
  res.index.shards = names;
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(res.index));
  Object.keys(res.shards).forEach((k) => fs.writeFileSync(path.join(outDir, 'shard-' + k + '.json'), JSON.stringify(res.shards[k])));
  return names;
}
module.exports = { build, write, FIELDS, statArr };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const rawDir = arg('raw', path.join(__dirname, 'raw')), outDir = arg('out', path.join(__dirname, 'out', 'route-stats')), asOf = arg('as-of', new Date().toISOString().slice(0, 10));
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), E = JSON.parse(fs.readFileSync(path.join(__dirname, 'engine-config.json'), 'utf8'));
  const files = fs.readdirSync(rawDir).filter((x) => x.endsWith('.json')).map((x) => JSON.parse(fs.readFileSync(path.join(rawDir, x), 'utf8')));
  if (!files.length) { console.error('No .json files in ' + rawDir); process.exit(1); }
  const res = build(flatten(files), cfg, E, asOf), names = write(res, outDir);
  console.log('Route stats written to ' + outDir + ': ' + names.length + ' shards, ' + Object.keys(res.index.broad.private).length + ' private routes, ' + Object.keys(res.index.broad.ec).length + ' EC routes. Period ' + res.index.period + '. Private deals ' + res.index.deals.private + ', EC deals ' + res.index.deals.ec + '. Aggregates only.');
}
