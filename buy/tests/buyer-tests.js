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
  assert.strictEqual(a.openTo, 'both'); assert.strictEqual(a.size, 'not-sure'); assert.strictEqual(a.where, 'flexible'); assert.deepStrictEqual(a.priorities, []); assert.strictEqual(a.purpose, '');
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
t('invalid budget gives no diagnosis', () => assert.strictEqual(B.analyse({ budget: 10 }, null).state, 'invalid'));

console.log('Coverage and evidence depth');
t('outside the data range: say so, no market claims, no routes', () => {
  const m = B.analyse({ budget: 7000000 }, { coverage: COV });
  assert.strictEqual(m.state, 'out-of-range'); assert.strictEqual(m.routes.length, 0); assert.strictEqual(m.tradeoff, null); assert.ok(!m.canSeeMarket);
});
t('market could not load: honest message, still no claims', () => { const m = B.analyse({ budget: 2300000 }, null); assert.strictEqual(m.state, 'no-market'); assert.strictEqual(m.routes.length, 0); });
t('thin market (engine says so): no diagnosis from thin data', () => {
  const m = B.analyse({ budget: 650000, priorities: ['space'] }, synth(650000));
  assert.strictEqual(m.state, 'thin'); assert.strictEqual(m.routes.length, 0); assert.strictEqual(m.constraint, '');
});

console.log('Real engine: $1.32m');
t('workable budget, space + newer development is the constraint, backed by the engine\'s own age finding', () => {
  const m = B.analyse({ budget: 1320000, purpose: 'own-stay', openTo: 'resale', priorities: ['space', 'newer'] }, worked());
  assert.strictEqual(m.headline, 'Your budget is workable.');
  assert.strictEqual(m.constraint, 'The bigger constraint is combining more space with a newer development.');
  assert.strictEqual(m.tradeoff.text, 'Going older opened up roughly 350–450 sq ft more space at this budget.');
});
t('the trade-off line is word for word what What Can I Buy shows for the same finding', () => {
  const w = worked(), m = B.analyse({ budget: 1320000, priorities: ['space', 'newer'] }, w);
  assert.strictEqual(m.tradeoff.text, w.view.hero.tradeoff);
});
t('no priorities: a calm read from the engine lens, no invented constraint', () => {
  const m = B.analyse({ budget: 1320000 }, worked()); assert.strictEqual(m.constraint, ''); assert.strictEqual(m.tradeoff.key, 'age:older-larger');
});
t('"giving up newness" is only said to someone who chose newer development', () => {
  const a = B.analyse({ budget: 1320000, openTo: 'resale', priorities: ['space', 'newer'] }, worked()).routes.find((r) => r.id === 'age:older-larger');
  const b = B.analyse({ budget: 1320000, openTo: 'resale', priorities: ['space'] }, worked()).routes.find((r) => r.id === 'age:older-larger');
  assert.ok(/giving up some newness/.test(a.giveUp)); assert.ok(!/newness/.test(b.giveUp));
});
t('open only to new launches: no resale or older-home route is pushed', () => {
  const m = B.analyse({ budget: 1320000, openTo: 'new', priorities: ['space'] }, worked());
  m.routes.forEach((r) => assert.ok(['age:older-larger', 'status:resale-larger', 'age:newer-larger'].indexOf(r.id) < 0, r.id));
});
t("Ken's Take only from an Active authored note, via the engine's own gating", () => {
  assert.strictEqual(B.analyse({ budget: 1320000 }, worked()).ken, null);
  const note = rj('ken-notes.json'); const m = B.analyse({ budget: 1320000 }, worked(note));
  assert.ok(m.ken && m.ken.note);
  assert.strictEqual(B.analyse({ budget: 1320000 }, worked([{ signature: 'age:older-larger', note: 'x', status: 'Retired' }])).ken, null);
});
t('EC is passed through as its own separate route, and hidden for investment-only', () => {
  assert.ok(B.analyse({ budget: 1320000, purpose: 'own-stay' }, worked()).ec);
  assert.strictEqual(B.analyse({ budget: 1320000, purpose: 'investment' }, worked()).ec, null);
});

console.log('Rules on hand-built engine outputs');
const OUT_LARGER = ins('region:outer-larger', 'region', [bar('OCR', 'Resale', '25+', 1200), bar('RCR', 'Resale', '25+', 900), bar('CCR', 'Resale', '25+', 800)], 1);
const OLD = ins('age:older-larger', 'age', [bar('OCR', 'Resale', '25+', 1150), bar('OCR', 'Resale', '10–25', 800)], 2);
t('space + better location, with a region finding: that is the tension (the $2.3m AMK/Thomson example)', () => {
  const m = B.analyse({ budget: 2300000, purpose: 'own-stay', size: '3br-study', where: 'areas', whereText: 'AMK / Thomson', priorities: ['space', 'location'] }, fake([OUT_LARGER, OLD], ALL));
  assert.strictEqual(m.constraint, 'The bigger constraint is combining more space with a better location.');
  assert.ok(/Going further out opened up roughly 300–400 sq ft more space/.test(m.tradeoff.text));
});
t('location is NOT called a constraint, and no "broaden location" route appears, without a region finding', () => {
  const m = B.analyse({ budget: 2300000, where: 'areas', priorities: ['space', 'location'] }, fake([OLD], ALL));
  assert.ok(/did not show a clear conflict/.test(m.constraint)); assert.ok(!m.routes.some((r) => /region/.test(r.id)));
});
t('"further from the centre" route is withheld from someone who named an area and wants location, not space', () => {
  const m = B.analyse({ budget: 2300000, where: 'areas', priorities: ['location', 'newer'] }, fake([OUT_LARGER, OLD], ALL));
  assert.ok(!m.routes.some((r) => r.id === 'region:outer-larger'));
});
t('when it is shown for a named area, it says it compares broad regions, not that area', () => {
  const m = B.analyse({ budget: 2300000, where: 'areas', whereText: 'Thomson', priorities: ['space'] }, fake([OUT_LARGER], ALL));
  assert.ok(/broad regions, not your specific area/.test(m.routes.find((r) => r.id === 'region:outer-larger').giveUp));
});
t('two priorities that each cost space are named together', () => {
  const NEW = ins('status:resale-larger', 'status', [bar('RCR', 'Resale', '25+', 1300), bar('RCR', 'New', '–', 800)], 2);
  const m = B.analyse({ budget: 2300000, priorities: ['location', 'newer'] }, fake([OUT_LARGER, NEW], ALL));
  assert.ok(/asking for a better location and a newer development together/.test(m.constraint));
});
t('priorities sales data cannot measure are acknowledged, never evaluated', () => {
  const m = B.analyse({ budget: 2300000, priorities: ['schools', 'monthly'] }, fake([OLD], ALL));
  assert.ok(/goes beyond what sales data can show/.test(m.constraint)); assert.ok(/schools/.test(m.notes.join(' ')) || /schools/.test(m.constraint));
});
t('investment: size and price only, with an explicit no-rent/yield statement', () => {
  const m = B.analyse({ budget: 2300000, purpose: 'investment' }, fake([OLD], ALL));
  assert.ok(m.notes.some((n) => /rental or yield/.test(n)));
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
t('no-lens state shows the engine typical size as evidence, not an invented trade-off', () => {
  const m = B.analyse({ budget: 810000 }, fake([], ALL, { state: 'no-lens', lens: null, hero: null, summary: { headline: 'Around $0.81m, buyers typically got about 500 sq ft.', rangeText: 'The middle half of these sales were about 450–550 sq ft.' } }));
  assert.strictEqual(m.tradeoff, null); assert.ok(/about 500 sq ft/.test(m.evidence.headline));
});
t('at most three routes, each with an engine-backed sentence', () => {
  const m = B.analyse({ budget: 2300000, priorities: ['space'] }, fake([OUT_LARGER, OLD, ins('tenure type:freehold-larger', 'tenure type', [bar('OCR', 'Resale', 'Freehold / 999-yr', 1000), bar('OCR', 'Resale', '25+', 800)], 3), ins('age:newer-larger', 'age', [bar('OCR', 'Resale', '0–10', 1000), bar('OCR', 'Resale', '25+', 800)], 4)], ALL));
  assert.ok(m.routes.length <= 3); m.routes.forEach((r) => assert.ok(/sq ft more space/.test(r.text)));
});

console.log('Not claiming what the data cannot see');
t('bedroom size and areas are never turned into sq ft or evaluated', () => {
  const m = B.analyse({ budget: 2300000, size: '3br-study', where: 'areas', whereText: 'AMK', priorities: ['space'] }, fake([OUT_LARGER], ALL));
  const text = JSON.stringify([m.headline, m.constraint, m.meaning, m.tradeoff, m.routes, m.notes, m.worked]);
  assert.ok(!/(bedroom|1BR|2BR|3BR|4BR)[^"]{0,40}sq ?ft/i.test(text));
  assert.ok(m.notes.some((n) => /do not cover bedroom counts and specific areas/.test(n)));
});
t('the free-text area appears only in the on-screen summary chips', () => {
  const m = B.analyse({ budget: 2300000, where: 'school', whereText: 'Nanyang Primary', priorities: ['space'] }, fake([OUT_LARGER], ALL));
  assert.ok(m.summary.indexOf('Nanyang Primary') > -1);
  assert.ok(!JSON.stringify([m.headline, m.constraint, m.meaning, m.tradeoff, m.routes, m.notes, m.worked]).includes('Nanyang'));
});
t('wording has no certainty, advice to stretch, or return claims', () => {
  const words = [];
  [[2300000, ['space', 'location']], [1320000, ['space', 'newer']], [2300000, ['schools']], [900000, []]].forEach(([b, p]) => {
    const m = B.analyse({ budget: b, purpose: 'investment', priorities: p }, b === 1320000 ? worked() : fake([OUT_LARGER, OLD], ALL));
    words.push(m.headline, m.constraint, m.meaning, m.tradeoff && m.tradeoff.text, m.routes.map((r) => r.title + r.text + (r.giveUp || '')).join(' '), m.notes.join(' '), m.worked.map((w) => w.text).join(' '));
  });
  const s = words.filter(Boolean).join(' ');
  assert.ok(!/\b(guarantee|will appreciate|best choice|you should buy|stretch|returns?|rental yield of|capital gain|cpf|lender will)\b/i.test(s.replace(/rental or yield data/g, '')), s.match(/\b(guarantee|stretch|cpf)\b/i));
});
t('deterministic: same answers and evidence, same output', () => {
  const a = { budget: 1320000, priorities: ['space', 'newer'], where: 'areas', whereText: 'x' };
  assert.deepStrictEqual(B.analyse(a, worked()), B.analyse(a, worked()));
});
t('real synthetic data across budgets never throws and always returns a headline', () => {
  [800000, 1200000, 1600000, 2000000, 2600000, 3000000, 4500000].forEach((b) => ['space,location', 'newer', 'schools', ''].forEach((p) => {
    const m = B.analyse({ budget: b, purpose: 'own-stay', priorities: p ? p.split(',') : [] }, synth(b)); assert.ok(m.headline, b + ' ' + p);
  }));
});

console.log('Hand-offs and privacy');
const ANS = { budget: 2345000, purpose: 'own-stay', size: '3br-study', where: 'areas', whereText: 'AMK / Thomson', priorities: ['space', 'location'], openTo: 'resale' };
t('WhatsApp message is minimal: purpose and approximate budget only', () => {
  assert.strictEqual(B.waMessage(ANS), "Hi Ken, I'm looking at an own-stay purchase around $2.35m and would like your view.");
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
t('the homepage still routes to /buy/', () => assert.ok(/href="buy\/"/.test(fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8'))));

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
