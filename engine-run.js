#!/usr/bin/env node
/* Runs the V1 engine (assets/js/kpt-engine.js) against the pipeline's route-stats and prints what it would produce.
   Internal output only. Usage:
     node engine-run.js --stats out/route-stats --out out/engine [--budgets 900000,...] [--notes notes.json]
                        [--write-fixtures] [--write-golden]
   --write-fixtures  copy the seven budget steps (aggregates only) into tests/fixtures/real/ for the regression suite
   --write-golden    save the current selections as tests/fixtures/real/golden.json (re-run after an approved change) */
const fs = require('fs'), path = require('path');
const ENG = require('../../assets/js/kpt-engine.js');
const E = Object.assign({}, JSON.parse(fs.readFileSync(path.join(__dirname, 'engine-config.json'), 'utf8'))); delete E._note;
const DEFAULT_BUDGETS = [900000, 1000000, 1320000, 1600000, 2000000, 2500000, 3500000];

function loadStats(dir) {
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), cache = {};
  return { index, step(budget) {
    const sb = ENG.budgetStep(budget, E), start = ENG.shardStart(sb, E), f = path.join(dir, 'shard-' + start + '.json');
    if (!fs.existsSync(f)) return null;
    cache[start] = cache[start] || JSON.parse(fs.readFileSync(f, 'utf8'));
    return ENG.pickStep(cache[start], sb);
  } };
}
const pc = (v) => Math.round(v * 100) + '%', m = (v) => '$' + (v / 1e6).toFixed(2) + 'm';

function describe(res) {
  const a = res.audit, L = [];
  L.push('==== ' + m(res.budget) + '   narrow ' + (a.run.windows ? m(a.run.windows.narrow[0]) + '-' + m(a.run.windows.narrow[1]) : '-') + '   wide ' + (a.run.windows ? m(a.run.windows.wide[0]) + '-' + m(a.run.windows.wide[1]) : '-') + ' ====');
  L.push('Private deals: narrow ' + (a.run.deals ? a.run.deals.narrow : '-') + ', wide ' + (a.run.deals ? a.run.deals.wide : '-') + '.  Routes qualifying: ' + a.routes.length + (a.insufficientRoutes ? ' (below minimum: ' + a.insufficientRoutes.routes + ' routes, ' + a.insufficientRoutes.deals + ' deals)' : ''));
  a.routes.slice().sort((x, y) => y.narrow.n - x.narrow.n).forEach((r) => L.push('   ' + r.id.padEnd(18) + r.grade.padEnd(13) + 'n=' + String(r.narrow.n).padEnd(4) + 'proj=' + String(r.narrow.projects).padEnd(3) + 'top=' + pc(r.narrow.top).padEnd(5) + 'med=' + Math.round(r.narrow.med) + ' (' + Math.round(r.narrow.lo) + '-' + Math.round(r.narrow.hi) + ')  wide n=' + (r.wide ? r.wide.n : '-') + ' med=' + (r.wide ? Math.round(r.wide.med) : '-') + '  ' + r.position + (r.unstable ? '  UNSTABLE' : '') + (r.flags.length ? '  [' + r.flags.join(',') + ']' : '')));
  if (a.pairCounts) L.push('Pairs: ' + a.pairCounts.total + ' total, ' + a.pairCounts.confounded + ' confounded, ' + a.pairCounts.singleAttribute + ' single-attribute, ' + a.pairCounts.pass + ' pass.');
  L.push('Insights found:'); if (!a.insights.length) L.push('   none');
  a.insights.forEach((i) => L.push('   ' + i.key.padEnd(28) + 'score ' + i.score.toFixed(3) + '  ' + i.label.padEnd(10) + i.headline.larger + ' > ' + i.headline.smaller + '  ratio ' + i.headline.ratio.toFixed(2) + '  support ' + i.supportingPairs.length + '  => ' + i.outcome));
  if (a.counterfactual && a.counterfactual.boundarySensitive.length) L.push('   BOUNDARY_SENSITIVE (would have been selected without the boundary rule): ' + a.counterfactual.boundarySensitive.join(', '));
  L.push('Selected:'); if (!res.insights.length) L.push('   none');
  res.insights.forEach((i) => L.push('   #' + i.rank + ' ' + i.key + '  score ' + i.score.toFixed(3) + '  ' + i.label + '  headline ' + i.headline.larger + ' > ' + i.headline.smaller + '  flags: ' + (i.flags.length ? i.flags.join('; ') : 'none')));
  const e = res.audit.ec;
  L.push('EC: ' + (e && e.total ? e.total.n + ' deals, ' + e.total.projects + ' projects, top ' + (e.total.top == null ? '-' : pc(e.total.top)) + ', median ' + Math.round(e.total.med) + ' sqft (' + Math.round(e.total.lo) + '-' + Math.round(e.total.hi) + '), grade ' + e.grade + (e.lineShown ? ' -> line shown' : ' -> no EC line') : 'no EC deals in window'));
  if (e) e.routes.forEach((r) => L.push('   ' + r.route.padEnd(22) + 'n=' + r.narrow.n + ' proj=' + r.narrow.projects + ' med=' + Math.round(r.narrow.med) + ' ' + r.grade + (r.crossReference ? '   vs private ' + r.crossReference.against + ' (' + Math.round(r.crossReference.privateMedian) + '): ratio ' + r.crossReference.ratio.toFixed(2) + ' ' + (r.crossReference.pass ? 'PASS' : 'FAIL ' + r.crossReference.reasons.join('+')) : '')));
  L.push('Fallback: ' + (res.fallback.length ? res.fallback.join(', ') : 'none') + (a.fallbackReasons.length ? '  (' + a.fallbackReasons.join('; ') + ')' : ''));
  L.push('What the engine says (data for the later UI):');
  if (res.lead) L.push('   LEAD: ' + res.lead.text);
  res.insights.forEach((i) => i.sentences.forEach((s, n) => L.push('   ' + (n ? '    ' : '#' + i.rank + ' ') + s)));
  if (res.descriptive) L.push('   ' + res.descriptive.text);
  if (res.ec && res.ec.shown) res.ec.sentences.forEach((s) => L.push('   EC: ' + s));
  if (res.footer) L.push('   FOOTER: ' + res.footer);
  if (a.lint.length) L.push('   WORDING LINT: ' + JSON.stringify(a.lint));
  if (res.tag) L.push('   TAG: ' + res.tag);
  L.push(''); return L.join('\n');
}
function crossTable(results) {
  const L = ['==== CROSS-BUDGET: selected insights ====', 'Budget'.padEnd(9) + '| #1'.padEnd(46) + '| #2'.padEnd(46) + '| #3 | fallback'];
  results.forEach((r) => { const c = [0, 1, 2].map((n) => r.insights[n] ? r.insights[n].key + ' ' + r.insights[n].score.toFixed(2) + ' ' + r.insights[n].label[0] : '-'); L.push(m(r.budget).padEnd(9) + '| ' + c[0].padEnd(44) + '| ' + c[1].padEnd(44) + '| ' + c[2] + ' | ' + (r.fallback.join(',') || '-')); });
  L.push('(S=Solid, I=Indicative, W=Weak)', ''); return L.join('\n');
}
module.exports = { loadStats, describe, crossTable, DEFAULT_BUDGETS, E };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; }, flag = (k) => process.argv.indexOf('--' + k) > -1;
  const dir = arg('stats', path.join(__dirname, 'out', 'route-stats')), outDir = arg('out', path.join(__dirname, 'out', 'engine'));
  const budgets = arg('budgets', DEFAULT_BUDGETS.join(',')).split(',').map(Number);
  const notes = arg('notes') ? JSON.parse(fs.readFileSync(arg('notes'), 'utf8')) : [];
  const stats = loadStats(dir), results = [], text = [];
  fs.mkdirSync(outDir, { recursive: true });
  budgets.forEach((b) => {
    const step = stats.step(b), res = ENG.run({ budget: b, step, index: stats.index, today: arg('today', new Date().toISOString().slice(0, 10)), notes }, E);
    results.push(res); text.push(describe(res));
    fs.writeFileSync(path.join(outDir, 'audit-' + b + '.json'), JSON.stringify(res, null, 1));
    if (flag('write-fixtures') && step) { const fx = path.join(__dirname, 'tests', 'fixtures', 'real'); fs.mkdirSync(fx, { recursive: true }); fs.writeFileSync(path.join(fx, 'step-' + b + '.json'), JSON.stringify(step)); }
  });
  text.push(crossTable(results));
  const fb = {}; results.forEach((r) => r.fallback.forEach((f) => { fb[f] = (fb[f] || 0) + 1; }));
  text.push('Fallback frequency over ' + results.length + ' budgets: ' + (Object.keys(fb).map((k) => k + ' ' + fb[k]).join(', ') || 'none'));
  text.push('Config hash: ' + results[0].audit.run.configHash + '   Engine ' + ENG.VERSION + '   Period ' + stats.index.period + '   As of ' + stats.index.asOf);
  const out = text.join('\n') + '\n'; fs.writeFileSync(path.join(outDir, 'engine-output.txt'), out); console.log(out);
  if (flag('write-fixtures')) { const fx = path.join(__dirname, 'tests', 'fixtures', 'real'); const idx = Object.assign({}, stats.index); fs.writeFileSync(path.join(fx, 'index.json'), JSON.stringify(idx)); }
  if (flag('write-golden')) { const fx = path.join(__dirname, 'tests', 'fixtures', 'real'); fs.mkdirSync(fx, { recursive: true }); fs.writeFileSync(path.join(fx, 'golden.json'), JSON.stringify(results.map((r) => ({ budget: r.budget, fallback: r.fallback, selected: r.insights.map((i) => ({ key: i.key, label: i.label, score: Math.round(i.score * 1000) / 1000, headline: i.headline })) })), null, 1)); console.log('Golden written.'); }
}
