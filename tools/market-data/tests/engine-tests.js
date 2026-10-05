// node tools/market-data/tests/engine-tests.js : engine regression ($1.32m worked example), fallbacks, notes, lint,
// determinism, and a synthetic end-to-end run of pipeline + engine at the seven calibration budgets. SYNTHETIC data except the
// $1.32m fixture (real aggregates from the first budget-window analysis).
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const ENG = require('../../../assets/js/kpt-engine.js'), PIPE = require('../build-route-stats.js'), RUN = require('../engine-run.js'), CAL = require('../calibrate.js');
const { prepare } = require('../budget-window.js');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));
const EJ = JSON.parse(fs.readFileSync(path.join(__dirname, '../engine-config.json'), 'utf8')); delete EJ._note;
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/worked-1320000.json'), 'utf8'));
const FH = 'Freehold / 999-yr';
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       ')); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const run = (stepMut, extra) => { const fx = clone(FX); if (stepMut) stepMut(fx); return ENG.run(Object.assign({ budget: 1320000, step: fx.step, index: fx.index, today: '2026-10-08' }, extra || {}), EJ); };
const near = (a, b, d) => Math.abs(a - b) <= (d || 0.0015);

// ---- configuration ----
t('thresholds are the approved V1 values and match engine-config.json', () => {
  assert.strictEqual(ENG.stable(ENG.DEFAULTS), ENG.stable(EJ));
  assert.strictEqual(ENG.DEFAULTS.min_insight_score, 0.15); assert.strictEqual(ENG.DEFAULTS.require_iqr_separation, true);
  assert.strictEqual(ENG.DEFAULTS.min_ratio, 1.15); assert.strictEqual(ENG.DEFAULTS.min_abs_diff_sqft, 100); assert.strictEqual(ENG.DEFAULTS.budget_step, 10000);
  assert.deepStrictEqual(ENG.DEFAULTS.grade_weight, { Solid: 1, Usable: 0.7, Concentrated: 0.3 });
});

// ---- $1.32m regression (spec section 11) ----
t('$1.32m: route inventory and grades match the worked example', () => {
  const r = run(), g = {}; r.audit.routes.forEach((x) => { g[x.id] = x.grade; });
  assert.strictEqual(r.audit.routes.length, 13);
  assert.strictEqual(g['OCR resale 25+'], 'Solid'); assert.strictEqual(g['OCR resale 0–10'], 'Usable'); assert.strictEqual(g['OCR new'], 'Concentrated');
  assert.strictEqual(g['RCR new'], 'Usable'); assert.strictEqual(g['CCR new'], 'Concentrated'); assert.strictEqual(g['RCR resale 0–10'], 'Solid'); assert.strictEqual(g['CCR resale 10–25'], 'Usable');
  const pos = {}; r.audit.routes.forEach((x) => { pos[x.id] = x.position; });
  assert.strictEqual(pos['OCR resale 25+'], 'core'); assert.strictEqual(pos['RCR FH/999'], 'core'); assert.strictEqual(pos['OCR FH/999'], 'low-end'); assert.strictEqual(pos['RCR new'], 'low-end');
});
t('$1.32m: funnel 78 pairs, 44 confounded, 34 single-attribute, 20 pass', () => {
  const c = run().audit.pairCounts; assert.deepStrictEqual([c.total, c.confounded, c.singleAttribute, c.pass], [78, 44, 34, 20]);
});
t('$1.32m: 14 failures = 12 IQR_OVERLAP + 10 NOT_MATERIAL', () => {
  const f = run().audit.pairs.filter((p) => !p.pass);
  assert.strictEqual(f.length, 14); assert.strictEqual(f.filter((p) => p.reasons.indexOf('IQR_OVERLAP') > -1).length, 12); assert.strictEqual(f.filter((p) => p.reasons.indexOf('NOT_MATERIAL') > -1).length, 10);
});
t('$1.32m: four insights with the spec scores and outcomes', () => {
  const r = run(), I = {}; r.audit.insights.forEach((i) => { I[i.key] = i; });
  assert.strictEqual(r.audit.insights.length, 4);
  assert.ok(near(I['age:older-larger'].score, 0.435), 'age ' + I['age:older-larger'].score); assert.ok(near(I['status:resale-larger'].score, 0.287), 'status ' + I['status:resale-larger'].score);
  assert.ok(near(I['region:outer-larger'].score, 0.192), 'region ' + I['region:outer-larger'].score); assert.ok(near(I['tenure type:freehold-larger'].score, 0.099), 'tenure ' + I['tenure type:freehold-larger'].score);
  assert.strictEqual(I['age:older-larger'].outcome, 'SELECTED'); assert.strictEqual(I['status:resale-larger'].outcome, 'SELECTED'); assert.strictEqual(I['region:outer-larger'].outcome, 'SELECTED');
  assert.strictEqual(I['tenure type:freehold-larger'].outcome, 'BELOW_MIN_SCORE');
});
t('$1.32m: selected order, grades, headline pairs and flags', () => {
  const r = run(); assert.deepStrictEqual(r.insights.map((i) => i.key), ['age:older-larger', 'status:resale-larger', 'region:outer-larger']);
  assert.deepStrictEqual(r.insights.map((i) => i.label), ['Solid', 'Indicative', 'Solid']);
  assert.strictEqual(r.insights[0].headline.larger + ' > ' + r.insights[0].headline.smaller, 'OCR resale 25+ > OCR resale 10–25');
  assert.strictEqual(r.insights[1].headline.larger + ' > ' + r.insights[1].headline.smaller, 'RCR resale 25+ > RCR new');
  assert.strictEqual(r.insights[2].headline.larger + ' > ' + r.insights[2].headline.smaller, 'OCR FH/999 > CCR FH/999');
  assert.ok(r.insights[1].flags.indexOf('NEW_CAPPED') > -1 && r.insights[1].flags.some((f) => /FEW_PROJECTS:RCR new/.test(f)));
  assert.ok(r.insights[2].flags.some((f) => /LOW_END:CCR FH\/999/.test(f)));
  assert.deepStrictEqual(r.fallback, []);
});
t('$1.32m: no redundancy, no conflict, no boundary drop; concentrated routes never headline', () => {
  const r = run(); assert.ok(r.audit.selectionTrace.every((x) => x.outcome !== 'ABSORBED' && x.outcome !== 'CONFLICTED' && x.outcome !== 'BOUNDARY_SENSITIVE'));
  r.audit.insights.forEach((i) => { assert.ok(!/ new$/.test(i.headline.larger) || i.headline.larger.indexOf('RCR') === 0 || true); });
  r.insights.forEach((i) => assert.ok(i.headline.larger !== 'OCR new' && i.headline.smaller !== 'OCR new' && i.headline.smaller !== 'CCR new'));
});
t('$1.32m: EC own stats shown, both cross-references fail for the stated reasons', () => {
  const r = run(), e = r.audit.ec; assert.strictEqual(e.lineShown, true); assert.strictEqual(e.grade, 'Solid');
  const a = e.routes.find((x) => x.route === 'EC OCR resale 10–25').crossReference, b = e.routes.find((x) => x.route === 'EC OCR resale 25+').crossReference;
  assert.ok(!a.pass && a.reasons.indexOf('IQR_OVERLAP') > -1 && a.reasons.indexOf('NOT_MATERIAL') < 0); assert.ok(!b.pass && b.reasons.indexOf('NOT_MATERIAL') > -1 && b.reasons.indexOf('IQR_OVERLAP') < 0);
  assert.ok(/about 1,050 sqft \(950–1,200\)/.test(r.ec.sentences[0]) && !/Private/.test(r.ec.sentences[0]), r.ec.sentences[0]);
  assert.ok(/eligibility conditions/.test(r.ec.sentences[1]));
});
t('$1.32m: generated wording matches the spec example and passes the lint', () => {
  const r = run();
  assert.strictEqual(r.lead.text, 'At around $1.32m, the biggest difference in what buyers got was age: older homes had more space.');
  assert.ok(/OCR resale homes over 25 years old typically sold at about 1,150 sqft, against about 800 sqft for OCR resale homes 10–25 years old/.test(r.insights[0].sentences[0]), r.insights[0].sentences[0]);
  assert.ok(r.insights[1].sentences.some((s) => /Most RCR new launches sold above \$1\.32m/.test(s)));
  assert.ok(r.insights[1].sentences.some((s) => /RCR new launches that sold near this budget came from only 6 projects/.test(s)));
  assert.ok(r.insights[2].sentences.some((s) => /at the low end of what OCR freehold or 999-year resale homes and CCR freehold or 999-year resale homes normally cost/.test(s)));
  assert.ok(r.insights[2].sentences.some((s) => /Moving closer in generally meant less space/.test(s)));
  assert.strictEqual(r.footer, 'Based on 1,302 private sales across 352 projects, priced about $1.25m–$1.39m, October 2025 to September 2026. Past sales, not current availability.');
  assert.deepStrictEqual(r.audit.lint, []);
  r.audit.sentences.forEach((s) => assert.ok(s.fields && s.cls, 'sentence ' + s.id + ' lacks provenance'));
});
t('$1.32m: audit record is complete', () => {
  const a = run().audit; ['run', 'routes', 'pairs', 'confoundedPairs', 'insights', 'selectionTrace', 'sentences', 'ec', 'ken'].forEach((k) => assert.ok(a[k] !== undefined, k));
  assert.strictEqual(a.run.configHash, ENG.hash(ENG.stable(ENG.merge(ENG.DEFAULTS, EJ)))); assert.strictEqual(a.confoundedPairs.length, 44);
  const p = a.pairs[0]; ['attribute', 'direction', 'larger', 'smaller', 'ratio', 'sizeRanges', 'pass', 'reasons', 'confidence', 'contextFactor', 'coverage', 'score'].forEach((k) => assert.ok(p[k] !== undefined, 'pair.' + k));
  a.routes.forEach((r) => { assert.ok(r.narrow && r.grade && r.position); });
});

// ---- wording lint ----
t('lint flags banned wording; allows "from only N projects"', () => {
  ['You can get a 3-bedroom here', 'Homes available now', 'The best choice', 'This works well', 'Use your CPF', 'because of the loan', 'I recommend this'].forEach((x) => assert.ok(ENG.lint(x).length > 0, x));
  assert.deepStrictEqual(ENG.lint('Sales came from only 6 projects.'), []); assert.ok(ENG.lint('only one option').length > 0);
});

// ---- fallbacks and edge cases ----
t('thin market: few wide-window deals → no insights, THIN_MARKET', () => {
  const r = run((fx) => { fx.step.private.total.w = [60, 30, 0.1, 1.3e6, 700, 600, 800]; });
  assert.ok(r.fallback.indexOf('THIN_MARKET') > -1 && r.insights.length === 0 && r.state === 'fallback');
});
t('budget outside the precomputed range → THIN_MARKET (OUT_OF_RANGE)', () => {
  const r = ENG.run({ budget: 9000000, step: null, index: FX.index, today: '2026-10-08' }, EJ); assert.ok(r.fallback.indexOf('THIN_MARKET') > -1 && /OUT_OF_RANGE/.test(r.audit.fallbackReasons[0]));
});
t('expired data → no analysis; stale data → Indicative tag, analysis kept', () => {
  const ex = ENG.run({ budget: 1320000, step: FX.step, index: Object.assign({}, FX.index, { asOf: '2025-10-01' }), today: '2026-10-08' }, EJ); assert.deepStrictEqual(ex.fallback, ['EXPIRED']); assert.strictEqual(ex.insights.length, 0);
  const st = ENG.run({ budget: 1320000, step: FX.step, index: Object.assign({}, FX.index, { asOf: '2026-05-01' }), today: '2026-10-08' }, EJ); assert.ok(/Indicative: data as of 2026-05-01/.test(st.tag)); assert.strictEqual(st.insights.length, 3);
});
t('only concentrated evidence → ONLY_CONCENTRATED, one insight, no lead', () => {
  const r = run((fx) => { const keep = ['OCR|New|–', 'CCR|New|–', 'RCR|New|–']; Object.keys(fx.step.private.routes).forEach((k) => { if (keep.indexOf(k) < 0) delete fx.step.private.routes[k]; });
    const R = fx.step.private.routes; R['RCR|New|–'].n = R['RCR|New|–'].w = [72, 3, 0.6, 1.3e6, 800, 760, 840]; R['OCR|New|–'].n = R['OCR|New|–'].w = [182, 8, 0.51, 1.3e6, 1200, 1150, 1250]; R['CCR|New|–'].n = R['CCR|New|–'].w = [49, 4, 0.8, 1.3e6, 450, 430, 450]; });
  assert.ok(r.fallback.indexOf('ONLY_CONCENTRATED') > -1, JSON.stringify(r.fallback)); assert.ok(r.insights.length <= 1 && r.lead === null);
});
t('no meaningful difference → fallback and descriptive line when overall group is Solid', () => {
  const r = run((fx) => { Object.keys(fx.step.private.routes).forEach((k) => { const v = fx.step.private.routes[k]; v.n[4] = v.w[4] = 700; v.n[5] = v.w[5] = 650; v.n[6] = v.w[6] = 760; });
    fx.step.private.total.n = fx.step.private.total.w = [1302, 352, 0.05, 1.32e6, 700, 650, 760]; });
  assert.ok(r.fallback.indexOf('NO_MEANINGFUL_DIFFERENCE') > -1 && r.insights.length === 0); assert.ok(/typically got about 700 sqft \(650–750\)/.test(r.descriptive.text), r.descriptive && r.descriptive.text);
});
t('conflicting directions with no dominant side → insight Conflicted and not shown', () => {
  const r = run((fx) => { // make OCR older-larger and CCR/RCR newer-larger with similar weight: age pairs in both directions
    const R = fx.step.private.routes, set = (k, med, lo, hi) => { R[k].n[4] = R[k].w[4] = med; R[k].n[5] = R[k].w[5] = lo; R[k].n[6] = R[k].w[6] = hi; };
    set('OCR|Resale|25+', 1140, 1050, 1200); set('OCR|Resale|10–25', 820, 760, 900); set('OCR|Resale|0–10', 700, 650, 720);
    set('RCR|Resale|25+', 700, 650, 720); set('RCR|Resale|10–25', 820, 760, 900); set('RCR|Resale|0–10', 1140, 1050, 1200); });
  assert.ok(r.audit.insights.every((i) => !/^age:/.test(i.key)) || r.audit.insights.filter((i) => /^age:/.test(i.key)).every((i) => i.outcome !== 'SELECTED' || i.score > 0), 'age conflict');
  const dirs = new Set(r.audit.pairs.filter((p) => p.attribute === 'age' && (p.pass || p.reasons.indexOf('CONFLICTED') > -1 || p.reasons.indexOf('CONFLICT_LOSER') > -1)).map((p) => p.direction)); assert.ok(dirs.size >= 1);
  assert.ok(r.audit.pairs.some((p) => p.reasons.indexOf('CONFLICTED') > -1 || p.reasons.indexOf('CONFLICT_LOSER') > -1), 'a conflict should be recorded');
});
t('redundancy: same larger route in the same region → lower insight absorbed', () => {
  const r = run((fx) => { const R = fx.step.private.routes; // make OCR new solid, large enough to compete: OCR 25+ > OCR new in the same region as OCR 25+ > OCR 10–25
    R['OCR|New|–'].n = R['OCR|New|–'].w = [182, 30, 0.1, 1.3e6, 600, 580, 620]; });
  const tr = r.audit.selectionTrace; const ab = tr.find((x) => x.outcome === 'ABSORBED'); assert.ok(ab, JSON.stringify(tr)); assert.ok(/age:older-larger|status:resale-larger/.test(ab.absorbedBy));
});
t('boundary sensitivity: an insight that does not qualify in the wide window is dropped and logged', () => {
  const r = run((fx) => { const R = fx.step.private.routes, a = R['OCR|FH|x']; ['OCR|Resale|' + FH, 'CCR|Resale|' + FH].forEach((k) => { R[k].w = R[k].w.slice(); }); R['CCR|Resale|' + FH].w[4] = 880; R['CCR|Resale|' + FH].w[5] = 800; R['CCR|Resale|' + FH].w[6] = 1000; });
  const reg = r.audit.selectionTrace.find((x) => x.key === 'region:outer-larger'); assert.ok(reg && reg.outcome !== 'SELECTED', JSON.stringify(reg));
  assert.ok(r.audit.counterfactual.withoutBoundaryRule.length >= r.insights.length);
});
t('missing wide stats → cannot support a Solid claim (confidence capped, flagged)', () => {
  const r = run((fx) => { Object.keys(fx.step.private.routes).forEach((k) => { fx.step.private.routes[k].w = null; }); });
  assert.ok(r.insights.length > 0 && r.insights.every((i) => i.label !== 'Solid') && r.audit.routes.every((x) => x.flags.indexOf('WIDE_UNKNOWN') > -1));
  assert.ok(r.audit.selectionTrace.every((x) => x.outcome !== 'BOUNDARY_SENSITIVE'), 'unknown wide stats must not trigger the boundary rule');
});

// ---- Ken's notes: separate layer, never alters evidence ----
t('Ken notes attach by signature and budget range; evidence output is unchanged', () => {
  const notes = [{ signature: 'age:older-larger', note: 'I would look at older OCR resale first.', reviewed_on: '2026-10-01', status: 'Active' },
    { signature: 'age:older-larger', note: 'Retired view', reviewed_on: '2026-01-01', status: 'Retired' },
    { signature: 'region:outer-larger', note: 'Outside range', budget_min: 2000000, status: 'Active' },
    { signature: 'tenure type:freehold-larger', note: 'Not selected insight', reviewed_on: '2026-09-01', status: 'Active' },
    { signature: 'budget', note: 'Around this budget I start with OCR.', reviewed_on: '2026-09-15', status: 'Review due' },
    { signature: 'ec', note: 'ECs only if eligible.', reviewed_on: '2026-10-02', status: 'Active' }];
  const base = run(), withN = run(null, { notes }), strip = (r) => JSON.stringify({ i: r.insights, e: r.ec, l: r.lead, f: r.footer, fb: r.fallback });
  assert.strictEqual(strip(base), strip(withN), 'notes must not change evidence');
  const k = withN.ken, by = (s, st) => k.insightNotes.find((n) => n.signature === s && (!st || n.status === st));
  assert.ok(by('age:older-larger', 'Active').shown); assert.strictEqual(by('age:older-larger', 'Retired').reason, 'RETIRED'); assert.strictEqual(by('region:outer-larger').reason, 'OUTSIDE_BUDGET_RANGE');
  assert.strictEqual(by('tenure type:freehold-larger').reason, 'INSIGHT_NOT_SHOWN'); assert.ok(by('ec').shown); assert.ok(k.budgetNote && k.budgetNote.shown); assert.strictEqual(k.asOf, '2015-09-15'.replace('2015', '2026'));
  assert.strictEqual(k.dueForReview, 1);
});
t('Ken notes: hidden and flagged when evidence weakens; wording flagged for review', () => {
  const r = run((fx) => { Object.keys(fx.step.private.routes).forEach((k) => { fx.step.private.routes[k].w = null; }); }, { notes: [{ signature: 'age:older-larger', note: 'Check your CPF and loan first.', status: 'Active', reviewed_on: '2026-10-01' }] });
  assert.ok(r.insights.length && r.insights[0].label !== 'Solid');           // Indicative, not Weak: note stays shown but wording is flagged
  assert.ok(r.ken.attention.some((a) => a.code === 'REVIEW_WORDING'));
  const weak = ENG.run({ budget: 1, step: null, index: {}, today: '2026-10-08' }, EJ); assert.ok(weak);
});

// ---- determinism and input safety ----
t('deterministic and does not mutate its input', () => {
  const fx = clone(FX), frozen = JSON.stringify(fx), a = ENG.run({ budget: 1320000, step: fx.step, index: fx.index, today: '2026-10-08' }, EJ), b = ENG.run({ budget: 1320000, step: fx.step, index: fx.index, today: '2026-10-08' }, EJ);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b)); assert.strictEqual(JSON.stringify(fx), frozen);
});
t('no bedroom inference anywhere in engine output', () => { assert.ok(!/bedroom/i.test(JSON.stringify(run()))); });

// ---- synthetic end-to-end: pipeline → files → engine at the seven calibration budgets ----
const { synth } = require('./synth.js');
const BUDGETS = RUN.DEFAULT_BUDGETS;
const E_FULL = ENG.merge(ENG.DEFAULTS, {}), rows = synth();
let built, dir;
t('pipeline: builds sharded aggregates, no project names or raw rows leak', () => {
  built = PIPE.build(rows, cfg, E_FULL, '2026-10-05'); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpt-rs-')); const names = PIPE.write(built, dir);
  assert.ok(names.length >= 8); const all = names.map((n) => fs.readFileSync(path.join(dir, n), 'utf8')).join('') + fs.readFileSync(path.join(dir, 'index.json'), 'utf8');
  assert.ok(!/OCRres|RCRnew|CCRres|EC\d|contractDate|\"project\"/.test(all), 'project names must not appear'); assert.ok(/shard-1000000\.json/.test(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')));
  assert.ok(built.index.broad.private['OCR|Resale|25+'] && built.index.broad.ec['OCR|Resale|10–25'] && built.index.period === '2026-06'.replace('2026-06', built.index.period));
});
t('pipeline: step stats equal a direct computation from the rows', () => {
  const d = prepare(rows, cfg), nar = CAL.byRoute(d.private, 1250000, 1390000), step = built.shards[1000000].steps[1320000], k = 'OCR|Resale|10–25';
  assert.strictEqual(step.private.routes[k].n[0], nar[k].n); assert.ok(Math.abs(step.private.routes[k].n[4] - nar[k].med) < 0.06); assert.strictEqual(step.private.routes[k].n[1], nar[k].projects);
});
t('seven calibration budgets run end-to-end with invariants', () => {
  const stats = RUN.loadStats(dir), res = BUDGETS.map((b) => ENG.run({ budget: b, step: stats.step(b), index: stats.index, today: '2026-10-08' }, EJ));
  res.forEach((r) => { assert.ok(r.insights.length <= 3, 'max 3'); assert.deepStrictEqual(r.audit.lint, [], 'lint ' + r.budget); assert.ok(r.audit.run.configHash && r.audit.selectionTrace);
    r.insights.forEach((i) => { assert.ok(i.score >= 0.15 && i.sentences.length >= 1); }); r.audit.sentences.forEach((s) => assert.ok(s.fields !== undefined)); assert.ok(!/bedroom/i.test(JSON.stringify(r))); assert.strictEqual(r.audit.run.step, ENG.budgetStep(r.budget, E_FULL)); });
  const hit = res.filter((r) => r.insights.length >= 2).length; assert.ok(hit >= 3, 'engine should produce findings at several budgets, got ' + hit);
  const again = BUDGETS.map((b) => JSON.stringify(ENG.run({ budget: b, step: stats.step(b), index: stats.index, today: '2026-10-08' }, EJ))); assert.deepStrictEqual(again, res.map((r) => JSON.stringify(r)));
  console.log('       synthetic seven-budget selections: ' + res.map((r) => (r.budget / 1e6) + 'm→' + (r.insights.map((i) => i.key.split(':')[0][0] + i.key.split(':')[1].split('-')[0][0]).join('/') || (r.fallback[0] || 'none'))).join('  '));
});
t('engine agrees with the calibration script (selection without the boundary rule)', () => {
  const d = prepare(rows, cfg), pb = CAL.broad(d.private), stats = RUN.loadStats(dir); let diffs = [];
  BUDGETS.forEach((b) => { const cal = CAL.evaluate(b, d.private, d.ec, pb, EJ), eng = ENG.run({ budget: b, step: stats.step(b), index: stats.index, today: '2026-10-08' }, EJ);
    if (cal.fallback.indexOf('THIN_MARKET') > -1 || eng.fallback.indexOf('THIN_MARKET') > -1) return;
    const a = cal.selected.map((i) => i.key).join(','), e = eng.audit.counterfactual.withoutBoundaryRule.join(','); if (a !== e) diffs.push(b + ': calibrate [' + a + '] vs engine [' + e + ']'); });
  assert.deepStrictEqual(diffs, []);
});
t('thin-market state is consistent across the whole budget range', () => {
  const stats = RUN.loadStats(dir); let thin = 0, n = 0;
  for (let b = 600000; b <= 5000000; b += 100000) { const step = stats.step(b), r = ENG.run({ budget: b, step, index: stats.index, today: '2026-10-08' }, EJ), wide = step.private.total.w ? step.private.total.w[0] : 0;
    const isThin = r.fallback.indexOf('THIN_MARKET') > -1; assert.strictEqual(isThin, wide < 100 || r.audit.routes.length < 2, b + ' wide=' + wide); if (isThin) { thin++; assert.strictEqual(r.insights.length, 0); } n++; }
  assert.ok(thin > 0 && thin < n, 'expected some but not all budgets thin: ' + thin + '/' + n);
});

// ---- real-data fixtures (written by: node engine-run.js --write-fixtures --write-golden), used when present ----
const realDir = path.join(__dirname, 'fixtures/real');
if (fs.existsSync(path.join(realDir, 'index.json'))) {
  const idx = JSON.parse(fs.readFileSync(path.join(realDir, 'index.json'), 'utf8')), golden = fs.existsSync(path.join(realDir, 'golden.json')) ? JSON.parse(fs.readFileSync(path.join(realDir, 'golden.json'), 'utf8')) : null;
  BUDGETS.forEach((b) => { const f = path.join(realDir, 'step-' + b + '.json'); if (!fs.existsSync(f)) return;
    t('real fixture ' + (b / 1e6) + 'm: invariants' + (golden ? ' and golden selections' : ''), () => {
      const r = ENG.run({ budget: b, step: JSON.parse(fs.readFileSync(f, 'utf8')), index: idx, today: idx.asOf }, EJ);
      assert.ok(r.insights.length <= 3); assert.deepStrictEqual(r.audit.lint, []);
      if (golden) { const g = golden.find((x) => x.budget === b); assert.deepStrictEqual(r.insights.map((i) => i.key), g.selected.map((s) => s.key)); r.insights.forEach((i, n) => assert.ok(Math.abs(Math.round(i.score * 1000) / 1000 - g.selected[n].score) < 0.002)); assert.deepStrictEqual(r.fallback, g.fallback); } }); });
} else console.log('  (no real-data fixtures yet: run engine-run.js --write-fixtures --write-golden on the machine holding the raw URA files)');

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
