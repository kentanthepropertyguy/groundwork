#!/usr/bin/env node
// Validates the GENERATED project data (data/projects) for internal consistency and prints a like-for-like comparison.
//   node tools/market-data/tests/validate-project-data.js [dataDir] [idA idB idC ...]
// Reads generated aggregates only. No raw URA files needed.
const fs = require('fs'), path = require('path');
const P = require('../../../assets/js/kpt-project.js');
const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..', '..', 'data', 'projects');
const ids = process.argv.slice(3).length ? process.argv.slice(3) : ['thomson-grand', 'thomson-impressions', 'thomson-three'];
const J = (p) => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8'));
const m = J('manifest.json'), idx = J('index.json'), sd = J('search.json');
const keysOf = (o) => (o && typeof o === 'object' ? Object.keys(o).concat(...Object.values(o).map(keysOf)) : []);
let bad = 0; const fail = (s) => { bad++; console.log('  INVARIANT FAILED: ' + s); };

// 1. every index row has exactly one detail record in the right shard; totals agree
const F = P.fieldMap(idx.fields); let txns = 0; const all = {};
idx.rows.forEach((r) => {
  const id = r[F.id], sh = P.shardName(r[F.shard]);
  if (P.shardOf(id, m.shards) !== r[F.shard]) fail('shard hash mismatch ' + id);
  all[sh] = all[sh] || J('detail/' + sh + '.json').projects;
  const p = all[sh][id]; if (!p) return fail('missing detail ' + id);
  txns += p.n;
  if (p.n !== r[F.n]) fail('index n != detail n ' + id);
  const bySale = (p.sale.new || 0) + (p.sale.sub || 0) + (p.sale.resale || 0); if (bySale !== p.n) fail('sale counts do not add up ' + id);
  // full-history cells must add up to the project total for each sale type, and the same for the disjoint periods
  const c = P.cells(p, m), allWin = m.windows.indexOf('all');
  ['new', 'sub', 'resale'].forEach((nm, i) => {
    const s = i + 1, sumAll = c.window.filter((x) => x.sale === s && x.win === allWin).reduce((a, x) => a + x.n, 0), sumP = c.period.filter((x) => x.sale === s).reduce((a, x) => a + x.n, 0);
    if (sumAll !== (p.sale[nm] || 0)) fail('full-history cells != sale count ' + id + ' ' + nm);
    if (sumP !== (p.sale[nm] || 0)) fail('period cells != sale count ' + id + ' ' + nm);
    const sumF = c.floor.filter((x) => x.sale === s).reduce((a, x) => a + x.n, 0);
    if (sumF > (p.sale[nm] || 0)) fail('floor cells exceed sale count ' + id + ' ' + nm);
    // windows are cumulative: n can only grow with the window
    c.window.filter((x) => x.sale === s).forEach((x) => { if (x.win > 0) { const prev = c.window.find((y) => y.sale === s && y.bin === x.bin && y.win === x.win - 1); if (prev && prev.n > x.n) fail('window not cumulative ' + id); } });
    c.window.filter((x) => x.sale === s).forEach((x) => { if (!(x.min <= x.q1 && x.q1 <= x.med && x.med <= x.q3 && x.q3 <= x.max)) fail('quantile order ' + id); });
  });
  if (keysOf(p).some((k) => /bed/i.test(k))) fail('a field NAME contains "bed" ' + id);
});
if (txns !== m.counts.transactions) fail('detail total ' + txns + ' != manifest ' + m.counts.transactions);
if (idx.rows.length !== m.counts.projects) fail('index rows != manifest projects');
if (sd.keys.length !== idx.rows.length) fail('search keys != index rows');
console.log('Checked ' + idx.rows.length + ' projects / ' + txns + ' transactions: ' + (bad ? bad + ' invariant failures' : 'all invariants hold'));

// 2. like-for-like comparison output for the requested projects
const proj = {}; ids.forEach((id) => { const r = P.findById(idx, id); if (!r) return console.log('NOT FOUND: ' + id); proj[id] = all[P.shardName(r.shard)] ? all[P.shardName(r.shard)][id] : J('detail/' + P.shardName(r.shard) + '.json').projects[id]; });
const have = ids.filter((i) => proj[i]);
const psf = (d) => (d ? d.min + '/' + d.q1 + '/' + d.med + '/' + d.q3 + '/' + d.max : '-');
have.forEach((id) => {
  const p = proj[id]; console.log('\n' + p.name + '  [' + p.street + ', D' + p.district + ', ' + p.seg + ', ' + p.tenure.label + (p.tenure.mixed ? ' MIXED' : '') + ']  n=' + p.n + '  sale ' + JSON.stringify(p.sale) + '  ' + p.first + ' to ' + p.last + '  active months ' + p.active);
  Object.keys(p.dist).forEach((k) => console.log('   ' + k.padEnd(7) + ' n=' + p.dist[k].n + '  price(min/q1/med/q3/max) ' + p.dist[k].price.join('/') + '  psf ' + p.dist[k].psf.join('/') + '  sqft ' + p.dist[k].sqft.join('/')));
  Object.keys(p.periods).forEach((s) => console.log('   12-month PSF history (' + s + ', all sizes, newest first): ' + P.history(p, s, m).map((h) => h.label.split(' to ')[1] + ' n' + h.n + ' med ' + h.psf.med).join(' | ')));
});
for (let i = 0; i < have.length; i++) for (let j = i + 1; j < have.length; j++) {
  const r = P.compare(proj[have[i]], proj[have[j]], m);
  console.log('\n=== ' + r.a.name + ' vs ' + r.b.name + ' ===  shared sale types: ' + (r.saleTypesShared.join(', ') || 'none') + (r.reasons.length ? '   reasons: ' + r.reasons.join('; ') : ''));
  Object.keys(r.bySale).forEach((s) => {
    const x = r.bySale[s]; console.log('  ' + s + ': sqft range A ' + (x.sizeRange.a || []).map(Math.round).join('-') + ' | B ' + (x.sizeRange.b || []).map(Math.round).join('-') + ' | overlap ' + (x.sizeRange.overlap ? x.sizeRange.overlap.map(Math.round).join('-') : 'none') + ' | first window with a shared size band: ' + (x.firstWindowWithMatch === null ? 'NONE' : x.windows[x.firstWindowWithMatch].label));
    x.windows.forEach((w) => console.log('    ' + w.label.padEnd(16) + (w.like.length ? w.like.map((c) => c.bin + 'sqft nA=' + c.overlap.nA + ' nB=' + c.overlap.nB + ' act ' + c.overlap.activeMonthsA + '/' + c.overlap.activeMonthsB + ' last ' + c.overlap.lastMonthA + '/' + c.overlap.lastMonthB + ' PSF med ' + c.a.psf.med + ' vs ' + c.b.psf.med).join('\n                  ') : 'no shared size band') + (w.adjacent.length ? '   [adjacent-band only: ' + w.adjacent.map((c) => c.binA + '~' + c.binB).join(', ') + ']' : '')));
    if (x.floor.length) console.log('    floor-controlled (full history): ' + x.floor.slice(0, 6).map((c) => c.bin + 'sqft ' + c.floorBand + ' nA=' + c.overlap.nA + ' nB=' + c.overlap.nB).join('; '));
    else console.log('    floor-controlled: none');
    x.reasons.forEach((t) => console.log('    note: ' + t));
  });
}
process.exit(bad ? 1 : 0);
