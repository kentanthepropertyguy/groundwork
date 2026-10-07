// node buy/tests/buyer-tests.js : the buyer journey's deterministic reasoning (assets/js/kpt-buyer.js) against the existing
// market engine, plus the page's wiring and privacy. No framework, no dependencies. Exits non-zero on failure.
const assert = require('assert'), fs = require('fs'), path = require('path');
const ENG = require('../../assets/js/kpt-engine.js'), R = require('../../assets/js/kpt-result.js'), B = require('../../assets/js/kpt-buyer.js'), MK = require('../../assets/js/kpt-market.js');
const root = path.join(__dirname, '../../data/market/test/');
const rj = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message.split('\n')[0]); } };
const COV = { min: 600000, max: 5000000 };

// ---- real engine runs on the repo's test aggregates (the $1.32m set is real URA aggregates; the other set is synthetic)
const WI = rj('route-stats-worked/index.json'), WS = rj('route-stats-worked/shard-1000000.json').steps['1320000'];
const IX = rj('route-stats/index.json');
function mk(res, step) { return { res, view: R.view(res, { step, sizeRounding: 50 }), coverage: COV }; }
const worked = (notes) => mk(ENG.run({ budget: 1320000, step: WS, index: WI, today: '2026-10-08', notes: notes || [] }, ENG.DEFAULTS), WS);
function synth(b, notes) {
  const E = ENG.DEFAULTS, sb = ENG.budgetStep(b, E), st = ENG.pickStep(rj('route-stats/shard-' + ENG.shardStart(sb, E) + '.json'), sb);
  return mk(ENG.run({ budget: b, step: st, index: IX, today: '2026-10-08', notes: notes || [] }, E), st);
}
// ---- hand-built engine outputs, for rules the test data does not happen to exercise
const bar = (region, status, tenure, median) => ({ region, status, tenure, median });
const ins = (key, attr, bars, rank) => ({ key, rank, chart: { attr, bars }, headline: { ratio: 1.4 } });
const route = (id, position, grade) => ({ id, position, grade: grade || 'Solid' });
function fake(insights, routes, view) {
  return { res: { insights, audit: { routes }, footer: 'Based on 400 private sales across 90 projects.' }, view: Object.assign({ state: 'ok', lens: insights[0] && insights[0].key, hero: {}, ken: null, ec: null }, view || {}), coverage: COV };
}
const ALL = [route('OCR resale 25+', 'core'), route('RCR resale 10–25', 'core'), route('OCR new', 'core', 'Usable')];

console.log('Answers');
t('only budget is required; everything else defaults neutrally', () => {
  const a = B.normalise({ budget: 2300000 });
  assert.strictEqual(a.openTo, 'both'); assert.strictEqual(a.size, 'not-sure'); assert.strictEqual(a.where, 'flexible'); assert.deepStrictEqual(a.priorities, []); assert.ok(!('purpose' in a));
});
t('budget bounds and rounding match What Can I Buy', () => {
  assert.ok(!B.validateBudget(0).ok); assert.ok(!B.validateBudget(250000).ok); assert.ok(!B.validateBudget(25000000).ok);
  assert.strictEqual(B.validateBudget(2345000).value, R.budgetFromHandoff({ low: 2345000, high: 2345000 }));
  assert.strictEqual(B.budgetText(2300000), R.budgetText(2300000));
});
t('at most 2 priorities; unknown and duplicate values dropped', () => assert.deepStrictEqual(B.normalise({ budget: 1e6, priorities: ['space', 'space', 'bogus', 'location', 'newer'] }).priorities, ['space', 'location']));
t('free text only kept when a location is named, trimmed and capped', () => {
  assert.strictEqual(B.normalise({ budget: 1e6, where: 'flexible', whereText: 'AMK' }).whereText, '');
  assert.strictEqual(B.normalise({ budget: 1e6, where: 'areas', whereText: ' ' + 'x'.repeat(100) }).whereText.length, 60);
});
t('the removed questions are gone; older saved answers still read', () => {
  assert.deepStrictEqual(B.normalise({ budget: 1e6, priorities: ['investment', 'schools', 'monthly', 'facilities', 'freehold'] }).priorities, ['freehold']);
  ['family', 'work', 'school'].forEach((w) => assert.strictEqual(B.normalise({ budget: 1e6, where: w, whereText: 'x' }).where, 'areas'));
  assert.deepStrictEqual(Object.keys(B.PRIORITY), ['space', 'location', 'newer', 'freehold']); assert.strictEqual(B.PRIORITY.location, 'Closer to the centre');
});
t('priorities that could not change the list are dropped, in the order chosen (V10.3.1)', () => {
  const n = (x) => B.normalise(Object.assign({ budget: 2600000 }, x)).priorities;
  assert.deepStrictEqual(n({ priorities: ['newer', 'space'] }), ['newer', 'space']); assert.deepStrictEqual(n({ priorities: ['space', 'location'] }), ['space', 'location']);
  assert.deepStrictEqual(n({ where: 'areas', whereText: 'Bishan', priorities: ['location', 'space'] }), ['space']);          // a named area already decides the location
  assert.deepStrictEqual(n({ where: 'areas', whereText: '', priorities: ['location'] }), ['location']);                        // no area entered yet
  assert.deepStrictEqual(n({ openTo: 'new', priorities: ['newer', 'space'] }), ['space']);                                      // new launches are all new
  assert.deepStrictEqual(n({ priorities: ['freehold', 'newer'] }), ['freehold']);                                               // freehold has no lease start year
  assert.deepStrictEqual(B.buildHandoff({ budget: 2600000, priorities: ['location', 'newer'] }).priorities, ['location', 'newer']);
});
t('invalid budget gives no diagnosis', () => assert.strictEqual(B.analyse({ budget: 10 }, null).state, 'invalid'));

console.log('Coverage and evidence depth');
t('outside the data range: say so, no market claims, no routes', () => {
  const m = B.analyse({ budget: 7000000 }, { coverage: COV });
  assert.strictEqual(m.state, 'out-of-range'); assert.strictEqual(m.routes.length, 0); assert.strictEqual(m.insight, null); assert.ok(!m.canSeeMarket);
});
t('market could not load: honest message, still no claims', () => { const m = B.analyse({ budget: 2300000 }, null); assert.strictEqual(m.state, 'no-market'); assert.strictEqual(m.routes.length, 0); });
t('thin market (engine says so): no diagnosis from thin data', () => {
  const m = B.analyse({ budget: 650000, priorities: ['space'] }, synth(650000));
  assert.strictEqual(m.state, 'thin'); assert.strictEqual(m.routes.length, 0); assert.strictEqual(m.insight, null);
});

console.log('Real engine: $1.32m');
t('no priority: a labelled general market observation in the neutral evidence wording', () => {
  const w = worked(), m = B.analyse({ budget: 1320000 }, w);
  assert.strictEqual(m.headline, 'Your budget is workable.');
  assert.strictEqual(m.insight.kind, 'market'); assert.strictEqual(m.insight.label, 'What the market shows');
  assert.strictEqual(m.insight.lines[0], 'Older homes were roughly 350–450 sq ft larger than newer homes at this budget.'); assert.ok(!/opened up|Choosing/.test(m.insight.lines[0])); assert.deepStrictEqual(m.applied, []);
});
t('one measurable priority: the insight is about that priority, in the evidence wording', () => {
  const m = B.analyse({ budget: 1320000, openTo: 'resale', priorities: ['newer'] }, worked());
  assert.strictEqual(m.insight.kind, 'personal'); assert.strictEqual(m.insight.label, 'For what matters to you');
  assert.deepStrictEqual(m.insight.lines, ['Newer buildings meant less space at this budget.', 'Older homes were roughly 350–450 sq ft larger.']);
});
t('space alone is the neutral market observation, not a personal one', () => assert.strictEqual(B.analyse({ budget: 1320000, priorities: ['space'] }, worked()).insight.kind, 'market'));
t('"opened up" wording is not used for a priority the buyer chose', () => {
  const m = B.analyse({ budget: 1320000, openTo: 'resale', priorities: ['newer'] }, worked()); assert.ok(!/opened up/.test(m.insight.lines.join(' ')));
});
t("Ken's Take only from an Active authored note, via the engine's own gating", () => {
  assert.strictEqual(B.analyse({ budget: 1320000 }, worked()).ken, null);
  const note = rj('ken-notes.json'); const m = B.analyse({ budget: 1320000 }, worked(note));
  assert.ok(m.ken && m.ken.note);
  assert.strictEqual(B.analyse({ budget: 1320000 }, worked([{ signature: 'age:older-larger', note: 'x', status: 'Retired' }])).ken, null);
});
t('EC stays out of the main result model fields and is passed through for "How this was worked out"', () => {
  const m = B.analyse({ budget: 1320000 }, worked()); assert.ok(m.ec); assert.ok(!JSON.stringify([m.insight, m.applied, m.meaning, m.headline]).includes(m.ec.label));
});

console.log('Rules on hand-built engine outputs');
const OUT_LARGER = ins('region:outer-larger', 'region', [bar('OCR', 'Resale', '25+', 1200), bar('RCR', 'Resale', '25+', 900), bar('CCR', 'Resale', '25+', 800)], 1);
const OLD = ins('age:older-larger', 'age', [bar('OCR', 'Resale', '25+', 1150), bar('OCR', 'Resale', '10–25', 800)], 2);
t('closer to the centre with a region finding: recorded evidence, no promise (the $2.6m example)', () => {
  const m = B.analyse({ budget: 2600000, priorities: ['location'] }, synth(2600000));
  assert.deepStrictEqual(m.insight.lines, ['Closer to the centre meant less space at this budget.', 'Homes further out were roughly 350 sq ft larger.']);   // synthetic test aggregates; the live $2.6m figure is checked in the browser suite
  assert.strictEqual(m.insight.label, 'For what matters to you');
});
t('a range is shown as a range', () => {
  const m = B.analyse({ budget: 2300000, priorities: ['location'] }, fake([OUT_LARGER, OLD], ALL));
  assert.strictEqual(m.insight.lines[1], 'Homes further out were roughly 300–400 sq ft larger.');
});
t('no matching finding for the chosen priority: no insight at all, never a generic one', () => {
  const m = B.analyse({ budget: 2300000, priorities: ['location'] }, fake([OLD], ALL)); assert.strictEqual(m.insight, null);
  assert.strictEqual(B.analyse({ budget: 2300000, priorities: ['freehold'] }, fake([OLD], ALL)).insight, null);
});
t('a specific area: no insight; the area and freehold are shown as applied; the lede drops "regions"', () => {
  const m = B.analyse({ budget: 2600000, where: 'areas', whereText: 'Bishan', priorities: ['freehold'] }, synth(2600000));
  assert.strictEqual(m.insight, null); assert.deepStrictEqual(m.applied, ['Near Bishan', 'Freehold or 900+ year lease']);
  assert.strictEqual(m.headline, 'Your budget is workable.'); assert.strictEqual(m.meaning, 'New launches and resale homes sold around this budget.');
  assert.ok(m.rules.indexOf('no-insight') > -1);
});
t('an area with a measurable priority still shows no insight (the comparison is by region, not that area)', () => {
  const m = B.analyse({ budget: 2300000, where: 'areas', whereText: 'Thomson', priorities: ['location'] }, fake([OUT_LARGER, OLD], ALL));
  assert.strictEqual(m.insight, null); assert.deepStrictEqual(m.applied, ['Near Thomson']);
});
t('freehold with a tenure finding: the insight, and freehold is still shown as applied', () => {
  const T = ins('tenure type:leasehold-larger', 'tenure type', [bar('OCR', 'Resale', '99', 1100), bar('OCR', 'Resale', 'Freehold / 999-yr', 900)], 1);
  const m = B.analyse({ budget: 2300000, priorities: ['freehold'] }, fake([T], ALL));
  assert.deepStrictEqual(m.insight.lines, ['Freehold or 999-year homes meant less space at this budget.', 'Leasehold homes were roughly 200 sq ft larger.']);
  assert.deepStrictEqual(m.applied, ['Freehold or 900+ year lease']);
});
t('two priorities: one supported insight, the other is not turned into a combined conclusion', () => {
  const NEW = ins('status:resale-larger', 'status', [bar('RCR', 'Resale', '25+', 1300), bar('RCR', 'New', '–', 800)], 2);
  const m = B.analyse({ budget: 2300000, priorities: ['location', 'newer'] }, fake([OUT_LARGER, NEW], ALL));
  assert.strictEqual(m.insight.key, 'region:outer-larger'); assert.strictEqual(m.insight.lines.length, 2);
  assert.ok(!/together|and newer/i.test(JSON.stringify(m.insight)));
  assert.ok(m.notes.some((n) => /Your priorities order the list and do not remove any development/.test(n)));
  const f = B.analyse({ budget: 2300000, priorities: ['location', 'freehold'] }, fake([OUT_LARGER], ALL));
  assert.strictEqual(f.insight.key, 'region:outer-larger'); assert.deepStrictEqual(f.applied, ['Freehold or 900+ year lease']);
});
t('no insight unless the budget is comfortable for what the buyer is open to', () => {
  const m = B.analyse({ budget: 900000, openTo: 'new', priorities: ['location'] }, fake([OUT_LARGER], [route('OCR new', 'low-end', 'Usable')]));
  assert.strictEqual(m.insight, null);
});
t('entry level: budget below most prices for what the buyer is open to', () => {
  const m = B.analyse({ budget: 900000, openTo: 'new' }, fake([OLD], [route('OCR new', 'low-end', 'Usable'), route('RCR new', 'low-end', 'Usable')]));
  assert.ok(/entry level for new launches/.test(m.headline)); assert.ok(!/workable/.test(m.headline));
});
t('nothing usable in what they are open to: says so, and points to the other segment only if the data supports it', () => {
  const a = B.analyse({ budget: 900000, openTo: 'new' }, fake([OLD], [route('OCR resale 25+', 'core')]));
  assert.ok(/Few new launches sold/.test(a.headline)); assert.ok(a.routes.some((r) => r.id === 'widen'));
  const b = B.analyse({ budget: 900000, openTo: 'new' }, fake([OLD], [route('OCR new', 'core', 'Concentrated')]));
  assert.ok(/Few new launches sold/.test(b.headline)); assert.ok(!b.routes.some((r) => r.id === 'widen'));
});
t('Concentrated routes alone never make a budget "workable"', () => {
  const m = B.analyse({ budget: 2300000 }, fake([OLD], [route('OCR resale 25+', 'core', 'Concentrated')]));
  assert.ok(!/workable/.test(m.headline));
});
t('no-lens state: no insight and no invented trade-off', () => {
  const m = B.analyse({ budget: 810000 }, fake([], ALL, { state: 'no-lens', lens: null, hero: null, summary: { headline: 'x', rangeText: 'y' } }));
  assert.strictEqual(m.insight, null);
});
t('at most three routes, each with an engine-backed sentence', () => {
  const m = B.analyse({ budget: 2300000, priorities: ['space'] }, fake([OUT_LARGER, OLD, ins('tenure type:freehold-larger', 'tenure type', [bar('OCR', 'Resale', 'Freehold / 999-yr', 1000), bar('OCR', 'Resale', '25+', 800)], 3), ins('age:newer-larger', 'age', [bar('OCR', 'Resale', '0–10', 1000), bar('OCR', 'Resale', '25+', 800)], 4)], ALL));
  assert.ok(m.routes.length <= 3); m.routes.forEach((r) => assert.ok(/sq ft more space/.test(r.text)));
});

console.log('Not claiming what the data cannot see');
t('bedroom size and areas are never turned into sq ft or evaluated, and never shown on the result', () => {
  const m = B.analyse({ budget: 2300000, size: '3br-study', where: 'areas', whereText: 'AMK', priorities: ['space'] }, fake([OUT_LARGER], ALL));
  const text = JSON.stringify([m.headline, m.meaning, m.insight, m.applied, m.routes, m.notes, m.worked]);
  assert.ok(!/(bedroom|1BR|2BR|3BR|4BR)[^"]{0,40}sq ?ft/i.test(text));
  assert.ok(m.notes.some((n) => /do not cover bedroom counts and your specific area/.test(n)));
  assert.ok(!m.summary.some((c) => /BR/.test(c)));
});
t('the chip lists only answers that were used', () => {
  const m = B.analyse({ budget: 2600000, openTo: 'resale', size: '3br', where: 'areas', whereText: 'Bishan', priorities: ['freehold', 'newer'] }, synth(2600000));
  assert.deepStrictEqual(m.summary, ['$2.6m', 'Resale', 'Bishan', 'Freehold or 900+ year lease']);
});
t('wording has no certainty, advice to stretch, or return claims', () => {
  const words = [];
  [[2300000, ['space', 'location']], [1320000, ['space', 'newer']], [2300000, ['freehold']], [900000, []]].forEach(([b, p]) => {
    const m = B.analyse({ budget: b, priorities: p }, b === 1320000 ? worked() : fake([OUT_LARGER, OLD], ALL));
    words.push(m.headline, m.meaning, m.insight && m.insight.lines.join(' '), m.applied.join(' '), m.routes.map((r) => r.title + r.text + (r.giveUp || '')).join(' '), m.notes.join(' '), m.worked.map((w) => w.text).join(' '));
  });
  const s = words.filter(Boolean).join(' ');
  assert.ok(!/\b(guarantee|will appreciate|best choice|you should buy|stretch|returns?|rental yield of|capital gain|cpf|lender will)\b/i.test(s.replace(/rental or yield data/g, '')), s.match(/\b(guarantee|stretch|cpf)\b/i));
});
t('deterministic: same answers and evidence, same output', () => {
  const a = { budget: 1320000, priorities: ['space', 'newer'], where: 'areas', whereText: 'x' };
  assert.deepStrictEqual(B.analyse(a, worked()), B.analyse(a, worked()));
});
t('real synthetic data across budgets never throws and always returns a headline', () => {
  [800000, 1200000, 1600000, 2000000, 2600000, 3000000, 4500000].forEach((b) => ['space,location', 'newer', 'freehold', ''].forEach((p) => {
    const m = B.analyse({ budget: b, priorities: p ? p.split(',') : [] }, synth(b)); assert.ok(m.headline, b + ' ' + p);
  }));
});

console.log('Hand-offs and privacy');
const ANS = { budget: 2345000, size: '3br-study', where: 'areas', whereText: 'AMK / Thomson', priorities: ['space', 'location'], openTo: 'resale' };
t('WhatsApp message is minimal: approximate budget only', () => {
  assert.strictEqual(B.waMessage(ANS), "Hi Ken, I'm looking at a purchase around $2.35m and would like your view.");
  const m = B.waMessage(ANS); ['AMK', 'Thomson', '3BR', 'space', 'location', 'resale', '2,345,000', '2345000'].forEach((x) => assert.ok(m.indexOf(x) < 0, x));
  assert.strictEqual(B.waMessage({ budget: 2000000 }), "Hi Ken, I'm looking at a purchase around $2m and would like your view.");
});
t('handoff to What Can I Buy is valid for the existing reader and carries the location text for FIND only (session storage, never sent anywhere)', () => {
  const h = B.buildHandoff(ANS);
  assert.ok(MK.validHandoff(h)); assert.strictEqual(R.budgetFromHandoff(h.budget), B.normalise(ANS).budget); assert.strictEqual(h.from, 'buy');
  assert.strictEqual(h.whereText, 'AMK / Thomson'); assert.strictEqual(h.where, 'areas');
  assert.strictEqual(B.buildHandoff(Object.assign({}, ANS, { where: 'flexible' })).whereText, '');     // text is dropped when location is flexible
  assert.ok(B.buildHandoff(Object.assign({}, ANS, { whereText: 'x'.repeat(200) })).whereText.length <= 60);
});
t('analytics: allow-listed categorical keys only, bucketed budget, no free text', () => {
  const m = B.analyse(ANS, fake([OUT_LARGER], ALL)), p = B.analytics(m);
  Object.keys(p).forEach((k) => assert.ok(B.ANALYTICS_KEYS.indexOf(k) > -1, k));
  assert.strictEqual(p.budget_band, '2.2-2.4m'); assert.ok(!JSON.stringify(p).match(/2345000|2,345|AMK|Thomson/));
});

console.log('Page wiring');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
t('page loads the shared engine, result and buyer modules and the production config', () => {
  ['kpt-engine.js', 'kpt-result.js', 'kpt-buyer.js', 'kpt-market.js', 'kpt-analytics.js', 'data/market/config.js'].forEach((s) => assert.ok(html.indexOf(s) > -1, s));
});
t('page contains no reasoning of its own: no thresholds, rules or market maths', () => {
  const js = html.split('<script>').pop();
  assert.ok(!/\b(0\.15|1\.15|min_ratio|median|p25|p75)\b/.test(js)); assert.ok(/B\.analyse\(/.test(js));
});
t('what-can-i-buy back chip knows about the buyer journey', () => {
  assert.ok(/handoff\.from === 'buy'/.test(fs.readFileSync(path.join(__dirname, '../../tools/what-can-i-buy/index.html'), 'utf8')));
});
t('the page has the approved questionnaire and none of the removed questions or sections', () => {
  ['What are you open to?', 'Where are you looking?', 'Anywhere in Singapore', 'Near somewhere specific', 'Area, street or project', 'What matters most?', 'Closer to the centre', 'Newer building', 'Freehold or 900+ year lease', "Sales records don't include bedrooms, so for now this doesn't change the list."].forEach((x) => assert.ok(html.indexOf(x) > -1, x));
  ['Own stay', 'Investment', 'A bit of both', 'Near family', 'Near work', 'Near a particular school', 'Better location', 'Schools', 'Lower monthly', 'Facilities', 'Ways to get more from your budget', 'The main trade-off'].forEach((x) => assert.ok(html.indexOf(x) < 0, x));
});
t('the homepage still routes to /buy/', () => assert.ok(/href="buy\/"/.test(fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8'))));

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
