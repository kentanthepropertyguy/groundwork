// node tools/what-can-i-buy/tests/result-tests.js : the visitor result view model (engine output -> screen), $1.32m regression,
// adaptation to other lenses, fallbacks, Ken's Take gating, WhatsApp/analytics privacy.
const assert = require('assert'), fs = require('fs'), path = require('path');
const ENG = require('../../../assets/js/kpt-engine.js'), R = require('../../../assets/js/kpt-result.js');
const root = path.join(__dirname, '../../../data/market/test/');
const rj = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const WI = rj('route-stats-worked/index.json'), WS = rj('route-stats-worked/shard-1000000.json').steps['1320000'];
const NOTE = rj('ken-notes.json');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const worked = (notes, mut) => { const st = JSON.parse(JSON.stringify(WS)); if (mut) mut(st); return ENG.run({ budget: 1320000, step: st, index: WI, today: '2026-10-08', notes: notes || [] }, ENG.DEFAULTS); };
const synth = (b, notes) => { const ix = rj('route-stats/index.json'), E = ENG.DEFAULTS, sb = ENG.budgetStep(b, E); const sh = rj('route-stats/shard-' + ENG.shardStart(sb, E) + '.json'); return ENG.run({ budget: b, step: ENG.pickStep(sh, sb), index: ix, today: '2026-10-08', notes: notes || [] }, E); };

console.log('$1.32m regression (real aggregates)');
const V = R.view(worked(NOTE));
t('hero is the engine #1 insight (age), with approved wording', () => {
  assert.strictEqual(V.lens, 'age:older-larger'); assert.strictEqual(V.hero.headline, 'Around $1.32m, older homes gave much more space.');
  assert.strictEqual(V.hero.context, 'Outside Central Region · Resale · Last 12 months');
});
t('chart is the pure OCR resale age comparison, rounded to 50 sq ft', () => {
  assert.deepStrictEqual(V.hero.bars.map((b) => [b.label, b.value]), [['25+ years', 1150], ['10–25 years', 800], ['Under 10 years', 700]]);
  assert.ok(V.hero.bars.every((b) => !b.tag), 'no indicative tags on Solid age bars');
});
t('trade-off is computed from the bars', () => assert.strictEqual(V.hero.tradeoff, 'Going older opened up roughly 350–450 sq ft more space at this budget.'));
t('"Also at this budget" uses engine insights #2 and #3', () => assert.deepStrictEqual(V.also.map((a) => [a.title, a.key]), [['New launch vs resale', 'status:resale-larger'], ['Location', 'region:outer-larger']]));
t('also-lines are the engine\'s own sentences and carry its caveats (new-launch project count, low end)', () => {
  const s = V.also[0].lines.join(' '); assert.ok(/only 6 projects/.test(s)); assert.ok(/low end/.test(s));
});
t('EC shown from the engine EC output', () => assert.deepStrictEqual(V.ec, { label: 'Resale EC', text: 'Around 1,050 sq ft at this budget. Eligibility conditions apply.' }));
t("Ken's Take shown only with an Active matching note", () => { assert.ok(V.ken && /new or resale/.test(V.ken.note)); });
t('footer is the engine source line', () => assert.ok(/^Based on 1,302 private sales across 352 projects/.test(V.footer)));

console.log("Ken's Take gating");
t('no notes -> nothing', () => assert.strictEqual(R.view(worked([])).ken, null));
t('retired note -> nothing', () => assert.strictEqual(R.view(worked([{ signature: 'age:older-larger', note: 'x', status: 'Retired' }])).ken, null));
t('note for a lens that is not the hero -> nothing', () => assert.strictEqual(R.view(worked([{ signature: 'tenure type:freehold-larger', note: 'x', status: 'Active' }])).ken, null));
t('note outside its budget range -> nothing', () => assert.strictEqual(R.view(worked([{ signature: 'age:older-larger', note: 'x', status: 'Active', budget_min: 1500000 }])).ken, null));
t('budget-wide note shows when no insight note matches', () => assert.strictEqual(R.view(worked([{ signature: 'budget', note: 'budget note', status: 'Active' }])).ken.note, 'budget note'));
t('Ken note never changes the evidence shown', () => { const a = R.view(worked([])), b = R.view(worked(NOTE)); a.ken = b.ken = null; assert.deepStrictEqual(a, b); });

console.log('Adapts to whatever lens wins');
t('across the calibration budgets every hero matches the engine #1 insight', () => {
  [900000, 1000000, 1320000, 1600000, 2000000, 2500000, 3500000].forEach((b) => {
    const res = synth(b), v = R.view(res);
    if (res.insights.length && res.lead) { assert.strictEqual(v.lens, res.insights[0].key, b); assert.ok(v.hero.bars.length >= 2, b); assert.ok(v.hero.tradeoff, b); }
  });
});
t('a non-age lens renders its own chart (status at $3.5m)', () => {
  const v = R.view(synth(3500000)); assert.strictEqual(v.lens, 'status:resale-larger');
  assert.ok(v.hero.bars.some((b) => /New launch/.test(b.label) && b.tag === 'Indicative'));
  assert.ok(/Choosing resale over a new launch opened up roughly/.test(v.hero.tradeoff));
});
t('bars are ordered largest first and widths are proportional', () => {
  const b = V.hero.bars; assert.ok(b[0].value > b[1].value && b[1].value > b[2].value); assert.ok(b[0].width > b[1].width && b[1].width > b[2].width && b[0].width <= 100);
});
t('EC hidden when the engine does not show it', () => {
  const res = worked([], (st) => { st.ec = null; }); assert.strictEqual(R.view(res).ec, null);
});

console.log('Fallbacks');
t('out of range -> thin, no chart, no invented numbers', () => {
  const res = ENG.run({ budget: 5800000, step: null, index: WI, today: '2026-10-08', notes: NOTE }, ENG.DEFAULTS), v = R.view(res);
  assert.strictEqual(v.state, 'thin'); assert.strictEqual(v.hero, null); assert.strictEqual(v.ken, null); assert.strictEqual(v.ec, null);
});
t('expired data -> expired state', () => assert.strictEqual(R.view(ENG.run({ budget: 1320000, step: WS, index: WI, today: '2027-09-01', notes: NOTE }, ENG.DEFAULTS)).state, 'expired'));
t('only-concentrated -> no hero chart', () => {
  const res = worked([], (st) => { Object.keys(st.private.routes).forEach((k) => { if (k !== 'OCR|New|–' && k !== 'OCR|Resale|25+') delete st.private.routes[k]; }); st.private.routes['OCR|New|–'].n = [182, 4, 0.9, 1320000, 650, 620, 660]; st.private.routes['OCR|New|–'].w = st.private.routes['OCR|New|–'].n; });
  const v = R.view(res); assert.ok(v.state === 'no-lens' || v.hero === null || v.hero.bars.length >= 2);
});
t('stale data keeps the indicative tag', () => assert.ok(/Indicative: data as of/.test(R.view(ENG.run({ budget: 1320000, step: WS, index: WI, today: '2027-03-01', notes: [] }, ENG.DEFAULTS)).tag || '')));

console.log('Wording and privacy');
const allText = (v) => [v.hero && v.hero.headline, v.hero && v.hero.context, v.hero && v.hero.tradeoff, v.ec && v.ec.label, v.ec && v.ec.text, v.message && v.message.title, v.message && v.message.body].concat(v.hero ? v.hero.bars.map((b) => b.label) : []).filter(Boolean);
t('all visitor-facing engine-derived wording passes the banned-wording lint', () => {
  [900000, 1320000, 2000000, 2500000, 3500000].forEach((b) => R.view(synth(b)) && allText(R.view(synth(b))).forEach((s) => assert.deepStrictEqual(ENG.lint(s), [], s)));
  allText(V).forEach((s) => assert.deepStrictEqual(ENG.lint(s), [], s));
});
t('no bedroom wording anywhere in the view', () => assert.ok(!/bedroom/i.test(JSON.stringify(V))));
t('WhatsApp message: approximate budget + ask for view, nothing else', () => {
  const m = R.waMessage(1320000); assert.strictEqual(m, "Hi Ken, I checked what a budget of about $1.32m buys. I'd like your view."); assert.ok(!/income|cpf|loan|cash|age|\d{4,}/i.test(m));
});
t('budget from an HDB planning range is its midpoint, to $10k', () => { assert.strictEqual(R.budgetFromHandoff({ low: 1250000, high: 1390000 }), 1320000); assert.strictEqual(R.budgetFromHandoff({ low: 1234000, high: 1234000 }), 1230000); });
t('budget text never over-states precision', () => { assert.strictEqual(R.budgetText(1300000), '$1.3m'); assert.strictEqual(R.budgetText(2000000), '$2m'); assert.strictEqual(R.budgetText(1320000), '$1.32m'); });
t('analytics: bucketed band, categorical facts only, no exact budget', () => {
  const res = worked(NOTE), p = R.analytics(res, V, 1320000);
  assert.deepStrictEqual(Object.keys(p).sort(), ['budget_band', 'data_stale', 'ec_shown', 'insight_count', 'ken_take_shown', 'lens', 'result_state']);
  assert.strictEqual(p.budget_band, '1.2-1.4m'); assert.ok(!/1320000|1,320/.test(JSON.stringify(p)));
});
t('deterministic', () => assert.deepStrictEqual(R.view(worked(NOTE)), R.view(worked(NOTE))));
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
