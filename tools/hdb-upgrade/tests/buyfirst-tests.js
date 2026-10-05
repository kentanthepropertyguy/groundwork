/* Run with:  node tools/hdb-upgrade/tests/buyfirst-tests.js */
const assert = require('assert');
const BF = require('../buyfirst.js');
const E = require('../engine.js');
const RULES = require('../rules.js');
const fs = require('fs'), path = require('path');
let passed = 0, failed = 0;
function test(n, f) { try { f(); passed++; console.log('  PASS  ' + n); } catch (e) { failed++; console.log('  FAIL  ' + n + '\n        ' + e.message.split('\n')[0]); } }

const base = (o) => Object.assign({ timing: 'buy-first', residency: 'all-sc', salePrice: 800000, outstandingLoan: 200000,
  buyers: [{ age: 38, income: 9000 }, { age: 36, income: 7000 }] }, o);

test('rules: ABSD second property 20% SC / 30% PR, refund 6 months, LTV cases', () => {
  assert.strictEqual(RULES.absdSecondProperty.allSingaporeCitizens, 0.20);
  assert.strictEqual(RULES.absdSecondProperty.anyPermanentResident, 0.30);
  assert.strictEqual(RULES.absdRefund.months, 6);
  assert.deepStrictEqual(RULES.ltvByOutstandingLoans.one, { ltv: 0.45, minCashPct: 0.25 });
  assert.deepStrictEqual(RULES.ltvByOutstandingLoans.none, { ltv: 0.75, minCashPct: 0.05 });
});
test('existing engine still returns no calculation for buy-first', () => {
  const r = E.analyse(base({})); assert.strictEqual(r.state, 'buy-first'); assert.strictEqual(r.planning, null);
});
test('sell-first output is untouched by the buy-first module', () => {
  const i = base({ timing: 'sell-first' }); const a = JSON.stringify(E.analyse(i));
  BF.analyse(Object.assign({}, i, { timing: 'buy-first', targetPrice: 1400000 }));
  assert.strictEqual(JSON.stringify(E.analyse(i)), a);
});
test('missing required answers → incomplete with the engine errors', () => {
  const r = BF.analyse({ timing: 'buy-first', residency: 'all-sc', targetPrice: 1200000, buyers: [{}] });
  assert.strictEqual(r.state, 'incomplete'); assert.ok(r.errors.length > 0);
});
test('no price → needs-price, no invented budget', () => {
  const r = BF.analyse(base({})); assert.strictEqual(r.verdict, 'needs-price'); assert.strictEqual(r.upfrontLow, undefined);
});
test('ABSD is 20% for citizens and 30% when a buyer is a PR, on the whole price', () => {
  const sc = BF.analyse(base({ targetPrice: 1500000 })), pr = BF.analyse(base({ targetPrice: 1500000, residency: 'has-pr' }));
  assert.strictEqual(sc.absd, 300000); assert.strictEqual(pr.absd, 450000);
});
test('flat with a loan shows both LTV cases; no loan shows only the 75% case', () => {
  const a = BF.analyse(base({ targetPrice: 1500000 })), b = BF.analyse(base({ targetPrice: 1500000, outstandingLoan: 0 }));
  assert.deepStrictEqual(a.cases.map((c) => c.key), ['none', 'one']);
  assert.deepStrictEqual(b.cases.map((c) => c.key), ['none']);
  const one = a.cases[1], none = a.cases[0];
  assert.ok(one.upfront > none.upfront); assert.ok(one.loan <= 0.45 * 1500000);
});
test('upfront = price + BSD + ABSD + fees − loan', () => {
  const r = BF.analyse(base({ targetPrice: 1500000 })), c = r.cases[0];
  assert.strictEqual(c.upfront, 1500000 + r.bsd + r.absd + r.purchaseCosts - c.loan);
});
test('loan is capped by income (TDSR) when income is the limit', () => {
  const r = BF.analyse(base({ targetPrice: 2500000, buyers: [{ age: 38, income: 5000 }] }));
  assert.ok(r.cases[0].incomeLimited); assert.ok(r.cases[0].loan < 0.75 * 2500000);
});
test('sale proceeds are shown but never counted as upfront funds', () => {
  const r = BF.analyse(base({ targetPrice: 1500000, cashSavings: 10000 }));
  assert.strictEqual(r.available, 10000); assert.ok(r.netProceeds > 0);
});
test('funds short → "Upfront funds are the key constraint" with a shortfall', () => {
  const r = BF.analyse(base({ targetPrice: 2500000, cashSavings: 100000 }));
  assert.strictEqual(r.verdict, 'funds-short'); assert.ok(r.shortfall.low > 0 && r.shortfall.high >= r.shortfall.low);
  assert.strictEqual(r.headline, 'Upfront funds are the key constraint.');
});
test('plenty of funds → potentially workable, never "works"', () => {
  const r = BF.analyse(base({ targetPrice: 1500000, cashSavings: 2000000 }));
  assert.strictEqual(r.fundsStatus, 'covered');
  assert.ok(/potentially/.test(BF.HEADLINE[r.verdict]) || r.verdict === 'sell-first-cleaner');
});
test('funds between the two LTV cases → depends on how the loan is counted', () => {
  const r0 = BF.analyse(base({ targetPrice: 1700000, cashSavings: 1 })); // find a bracket
  const mid = Math.round((r0.upfrontLow + r0.upfrontHigh) / 2);
  const r = BF.analyse(base({ targetPrice: 1700000, cashSavings: mid }));
  if (r.sellFirstCovers) return; // cleaner-route verdict takes precedence
  assert.strictEqual(r.verdict, 'depends-on-loan-count');
});
test('no funds entered → funds-unknown, asks for them rather than guessing', () => {
  const r = BF.analyse(base({ targetPrice: 2500000 }));
  assert.strictEqual(r.fundsStatus, 'unknown'); assert.strictEqual(r.verdict, 'funds-unknown');
});
test('price within the selling-first range → selling first is the cleaner route', () => {
  const sf = E.analyse(base({ timing: 'sell-first' }));
  const r = BF.analyse(base({ targetPrice: sf.planning.low }));
  assert.strictEqual(r.verdict, 'sell-first-cleaner');
});
test('price far above the selling-first range is not "cleaner"', () => {
  const r = BF.analyse(base({ targetPrice: 3000000, cashSavings: 50000 }));
  assert.ok(r.aboveSellFirst); assert.notStrictEqual(r.verdict, 'sell-first-cleaner');
});
test('headlines contain no certainty claims', () => {
  Object.values(BF.HEADLINE).forEach((h) => assert.ok(!/\b(will|guarantee|approved|can afford|works\.)/i.test(h), h));
});
test('UI copy: no unverified CPF/lender claims, refund never netted off, WhatsApp carries no money', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(/Not netted off here/.test(html) && /never assumed or netted off/.test(html));
  assert.ok(!/will be (approved|refunded)/i.test(html));
  assert.ok(/ENG\.whatsappMessage\(r\.bf \? \{ state: 'buy-first' \} : r\)/.test(html));
  assert.ok(/before my flat is sold/.test(E.whatsappMessage({ state: 'buy-first' })));
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
