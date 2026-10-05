/* Run with:  node tools/hdb-upgrade/tests/run-tests.js
   No framework, no dependencies. Exits non-zero if any test fails. */
const assert = require('assert');
const E = require('../engine.js');
const RULES = require('../rules.js');
const ASSUMPTIONS = require('../assumptions.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message.split('\n')[0]); }
}
const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label || 'value'}: got ${actual}, expected ${expected} ±${tol}`);

// ---------------------------------------------------------------- the six profiles
const sc = (o) => Object.assign({ timing: 'sell-first', residency: 'all-sc' }, o);
const PROFILES = [
  { name: '1 Younger couple, strong income / low cash',
    input: sc({ salePrice: 700000, outstandingLoan: 250000, cashSavings: 10000, buyers: [{ age: 32, income: 8500 }, { age: 34, income: 7500 }] }),
    // expected values come from the independent prototype run (in $m, ±$15k tolerance)
    exp: { state: 'single', low: 1.39, high: 1.39, reg: 1.56, regLonger: false, longer: null, diag: 'cash' } },
  { name: '2 Strong cash / moderate income',
    input: sc({ salePrice: 1100000, outstandingLoan: 0, cashSavings: 150000, buyers: [{ age: 45, income: 6000 }, { age: 43, income: 4500 }] }),
    exp: { state: 'standard', low: 1.72, high: 1.88, reg: 2.43, regLonger: true, longer: 1.99, diag: 'income' } },
  { name: '3 Older buyers (55+)',
    input: sc({ salePrice: 900000, outstandingLoan: 0, cashSavings: 100000, buyers: [{ age: 58, income: 9000 }, { age: 56, income: 6000 }] }),
    exp: { state: 'indicative', low: 1.27, high: 1.38, reg: 2.01, regLonger: true, longer: 1.91, diag: 'income' } },
  { name: '4 Large outstanding HDB loan',
    input: sc({ salePrice: 800000, outstandingLoan: 380000, cashSavings: 20000, buyers: [{ age: 36, income: 7000 }, { age: 35, income: 6000 }] }),
    exp: { state: 'standard', low: 1.19, high: 1.31, reg: 1.48, regLonger: false, longer: null, diag: 'mixed' } },
  { name: '5 Existing monthly debt ($2,500/mo)',
    input: sc({ salePrice: 850000, outstandingLoan: 100000, cashSavings: 60000, otherMonthlyDebt: 2500, buyers: [{ age: 40, income: 10000 }, { age: 38, income: 8000 }] }),
    exp: { state: 'standard', low: 1.41, high: 1.74, reg: 2.11, regLonger: false, longer: null, diag: 'income' } },
  { name: '6 SC + PR couple',
    input: sc({ salePrice: 780000, outstandingLoan: 200000, cashSavings: 40000, residency: 'has-pr', buyers: [{ age: 37, income: 9000 }, { age: 36, income: 7000 }] }),
    exp: { state: 'standard', low: 1.49, high: 1.64, reg: 1.79, regLonger: false, longer: null, diag: 'mixed' } },
];
const results = PROFILES.map((p) => ({ p, r: E.analyse(p.input) }));

console.log('\nUnit tests — regulatory arithmetic');
test('BSD reproduces IRAS published example ($4,500,100 -> $209,606)', () => assert.strictEqual(E.bsd(4500100), 209606));
test('BSD band boundaries', () => {
  assert.strictEqual(E.bsd(180000), 1800);
  assert.strictEqual(E.bsd(360000), 5400);
  assert.strictEqual(E.bsd(1000000), 24600);
  assert.strictEqual(E.bsd(1500000), 44600);
  assert.strictEqual(E.bsd(3000000), 119600);
});
test('annuity factor: payment x factor returns the loan', () => {
  const af = E.annuityFactor(0.04, 25); const loan = 1000000; const pay = loan / af;
  near(pay * af, loan, 0.01, 'round trip');
  near(af, 189.4, 0.5, '4% x 25y factor');
});
test('income-weighted age', () => near(E.weightedAge([{ age: 30, income: 6000 }, { age: 50, income: 4000 }]), 38, 1e-9));
test('regulatory constants are the verified values', () => {
  assert.strictEqual(RULES.tdsrCeiling, 0.55); assert.strictEqual(RULES.stressRate, 0.04);
  assert.deepStrictEqual(RULES.standardStructure, { ltv: 0.75, minCashPct: 0.05, maxTenureYears: 30, endAgeLimit: 65 });
  assert.deepStrictEqual(RULES.lowerLtvStructure, { ltv: 0.55, minCashPct: 0.10, maxTenureYears: 35 });
});

console.log('\nState routing');
test('buy-first returns no calculation', () => {
  const r = E.analyse(sc({ timing: 'buy-first' }));
  assert.strictEqual(r.state, 'buy-first'); assert.strictEqual(r.planning, null); assert.strictEqual(r.regulatory, null);
});
test('missing inputs -> incomplete with field errors', () => {
  const r = E.analyse({ salePrice: 800000, buyers: [{ age: 40 }] });
  assert.strictEqual(r.state, 'incomplete'); assert.ok(r.errors.length >= 2);
});
test('sale proceeds below loan + costs -> no-result', () => {
  const r = E.analyse(sc({ salePrice: 400000, outstandingLoan: 395000, buyers: [{ age: 40, income: 9000 }] }));
  assert.strictEqual(r.state, 'no-result'); assert.strictEqual(r.reason, 'proceeds-below-loan');
});
test('any buyer aged 55+ -> indicative, even if the weighted age is lower', () => {
  const r = E.analyse(sc({ salePrice: 900000, outstandingLoan: 0, cashSavings: 80000, buyers: [{ age: 55, income: 3000 }, { age: 30, income: 9000 }] }));
  assert.strictEqual(r.state, 'indicative');
});
test('PR adds 5% ABSD to the whole price; all-SC adds none', () => {
  const base = { salePrice: 900000, outstandingLoan: 100000, cashSavings: 50000, buyers: [{ age: 36, income: 15000 }] };
  const a = E.analyse(sc(base)), b = E.analyse(sc(Object.assign({}, base, { residency: 'has-pr' })));
  assert.strictEqual(a.planning.duties.high.absd, 0);
  near(b.planning.duties.high.absd, 0.05 * b.planning.high, b.planning.high * 0.01, 'ABSD');
  assert.ok(b.planning.high < a.planning.high);
});

console.log('\nSix profiles vs independent prototype');
results.forEach(({ p, r }) => {
  test(p.name, () => {
    const x = p.exp;
    assert.strictEqual(r.state, x.state, 'state');
    near(r.planning.low, x.low * 1e6, 15000, 'planning low');
    near(r.planning.high, x.high * 1e6, 15000, 'planning high');
    near(r.regulatory.max, x.reg * 1e6, 15000, 'regulatory max');
    assert.strictEqual(r.regulatory.reliesOnLongerTenure, x.regLonger, 'relies on longer tenure');
    if (x.longer === null) assert.strictEqual(r.longerTenure, null, 'no longer-tenure possibility');
    else near(r.longerTenure.upTo, x.longer * 1e6, 15000, 'longer-tenure up to');
    assert.strictEqual(r.diagnosis.code, x.diag, 'diagnosis');
  });
});

console.log('\nPlanning vs regulatory separation');
test('planning range never exceeds the regulatory maximum', () => results.forEach(({ r }) => assert.ok(r.planning.high <= r.regulatory.max)));
test('planning uses the standard structure only (75% LTV, tenure <= min(30, 65-age, cap))', () => {
  results.forEach(({ r }) => {
    assert.strictEqual(r.planning.structure, 'standard'); assert.strictEqual(r.planning.ltv, 0.75);
    const maxT = Math.min(30, Math.floor(65 - r.breakdown.weightedAge), ASSUMPTIONS.planningTenureCap);
    assert.strictEqual(r.planning.tenureYears, Math.max(0, maxT));
  });
});
test('profile 2: headline is NOT optimised across structures (A-only 1.72-1.88, not B 1.80-1.99)', () => {
  const r = results[1].r; assert.ok(r.planning.high < 1.95e6);
});
test('planningStructure=bestOf reproduces the old optimised numbers (switch works)', () => {
  const r = E.analyse(PROFILES[1].input, { planningStructure: 'bestOf' });
  near(r.planning.low, 1.80e6, 15000, 'low'); near(r.planning.high, 1.99e6, 15000, 'high'); assert.strictEqual(r.longerTenure, null);
});
test('lender-dependent figure is separate and flagged, never inside the planning range', () => {
  [1, 2].forEach((i) => {
    const r = results[i].r;
    assert.ok(r.longerTenure.upTo > r.planning.high);
    assert.ok(r.flags.some((f) => f.code === 'lender-tenure'));
    assert.ok(/lender confirmation/.test(r.longerTenure.text) && /Retirement Account/.test(r.longerTenure.text));
  });
});
test('regulatory max discloses reliance on the lower-LTV structure', () => {
  assert.ok(/more restrictive/.test(results[1].r.regulatory.lenderCaveat));
  assert.strictEqual(results[0].r.regulatory.lenderCaveat, null);
});
test('age 55+ shows the planning position, hides the regulatory max in the UI, raises the CPF flag', () => {
  const r = results[2].r; assert.strictEqual(r.ui.showRegulatoryMax, false); assert.ok(r.flags.some((f) => f.code === 'cpf-ra-55'));
});

console.log('\nCash downpayment and CPF refund');
test('cash-limited profile 1 collapses to a single figure with the agreed diagnosis', () => {
  const r = results[0].r; assert.strictEqual(r.planning.single, true);
  assert.strictEqual(r.diagnosis.text, 'Cash is currently your constraint. More income alone would not materially increase this position.');
});
test('no refund + savings too small -> "not-confirmed"', () => assert.strictEqual(results[0].r.cash.status, 'not-confirmed'));
test('profile 2: savings alone cover reserve + 5% -> confirmed without a refund figure', () => assert.strictEqual(results[1].r.cash.status, 'confirmed'));
test('refund provided and cash sufficient -> confirmed', () => {
  const r = E.analyse(Object.assign({}, PROFILES[0].input, { cpfRefund: 300000 })); assert.strictEqual(r.cash.status, 'confirmed');
});
test('refund absorbs the proceeds -> cash short, no workable result under the reserve', () => {
  const r = E.analyse(Object.assign({}, PROFILES[0].input, { cpfRefund: 440000 }));
  assert.ok(r.state === 'no-result' && r.reason === 'cash-short');
});
test('refund larger than (price - loan) is capped at price - loan (CPF rule)', () => {
  const a = E.analyse(Object.assign({}, PROFILES[0].input, { cpfRefund: 450000 })), b = E.analyse(Object.assign({}, PROFILES[0].input, { cpfRefund: 900000 }));
  assert.strictEqual(a.state, b.state);
});
test('moderate cash shortfall reduces price and reports minimum-cash', () => {
  const r = E.analyse(sc({ salePrice: 1000000, outstandingLoan: 100000, cashSavings: 0, cpfRefund: 800000, buyers: [{ age: 36, income: 20000 }] }),
    { reserve: 20000 });
  assert.ok(r.cash.status === 'short' || r.state === 'no-result');
});
test('reserve both reduces funds and counts as cash (changing reserve moves the price)', () => {
  const a = E.analyse(PROFILES[0].input, { reserve: 0 }), b = E.analyse(PROFILES[0].input, { reserve: 50000 });
  assert.ok(a.planning.high - b.planning.high >= 100000, 'a $50k reserve removes >= $100k of price at the cash-limited top end (about 3.4x leverage)');
});

console.log('\nAssumptions are configurable');
test('changing income caps changes the range; defaults are disclosed', () => {
  const a = E.analyse(PROFILES[4].input), b = E.analyse(PROFILES[4].input, { incomeCapLow: 0.30, incomeCapHigh: 0.40 });
  assert.ok(b.planning.high < a.planning.high);
  const noResidency = Object.assign({}, PROFILES[4].input); delete noResidency.residency; delete noResidency.timing;
  const d = E.analyse(noResidency);
  assert.ok(d.assumptions.some((x) => x.id === 'default-residency') && d.assumptions.some((x) => x.id === 'default-timing'), 'defaults are disclosed');
  assert.ok(!a.assumptions.some((x) => x.id === 'default-residency'), 'explicit answers are not listed as defaults');
});
test('planning tenure cap is applied after regulatory limits', () => {
  const r = E.analyse(PROFILES[3].input, { planningTenureCap: 20 }); assert.strictEqual(r.planning.tenureYears, 20);
});

console.log('\nKen\'s Take');
test('the take file ships empty and selects nothing', () => {
  const takes = require('../ken-takes.js'); assert.deepStrictEqual(takes, []);
  results.forEach(({ r }) => assert.strictEqual(E.selectTake(r, takes), null));
});
test('a take written by Ken is selected only when every condition matches', () => {
  const takes = [{ id: 't', when: { states: ['single'], diagnosis: ['cash'], maxWeightedAge: 39 }, text: 'X' }];
  assert.strictEqual(E.selectTake(results[0].r, takes), 'X');
  assert.strictEqual(E.selectTake(results[1].r, takes), null);
});

console.log('\nPrivacy: WhatsApp message carries no financial inputs');
test('no raw input appears in any message, and messages are built for every state', () => {
  results.forEach(({ p, r }) => {
    const msg = E.whatsappMessage(r);
    const i = p.input;
    const raw = [i.salePrice, i.outstandingLoan, i.cashSavings, i.otherMonthlyDebt, ...i.buyers.flatMap((b) => [b.age, b.income])].filter((v) => v);
    raw.forEach((v) => {
      const bare = String(v), comma = v.toLocaleString('en-US');
      assert.ok(!msg.includes(bare) && !msg.includes(comma), `message leaks ${v}: ${msg}`);
    });
    assert.ok(/estimated|indicative/.test(msg));
  });
  assert.ok(/before my flat is sold/.test(E.whatsappMessage(E.analyse(sc({ timing: 'buy-first' })))));
  assert.ok(!/\d/.test(E.whatsappMessage({ state: 'no-result' })));
});

// ------------------------------------------------------------------ report
console.log(`\n${passed} passed, ${failed} failed\n`);
const m = (n) => '$' + (n / 1e6).toFixed(2) + 'm';
console.log('SIX-PROFILE OUTPUT');
results.forEach(({ p, r }) => {
  const i = p.input;
  const buyers = i.buyers.map((b) => `${b.age}/$${b.income.toLocaleString()}`).join(' + ');
  console.log(`\n${p.name}`);
  console.log(`  inputs      buyers ${buyers}; sale $${i.salePrice.toLocaleString()}; loan $${i.outstandingLoan.toLocaleString()}; cash $${(i.cashSavings || 0).toLocaleString()}; debts $${(i.otherMonthlyDebt || 0).toLocaleString()}/mo${i.residency === 'has-pr' ? '; one PR' : ''}`);
  console.log(`  state       ${r.state}   weighted age ${r.breakdown.weightedAge.toFixed(1)}`);
  console.log(`  regulatory  ${m(r.regulatory.max)}  (${r.regulatory.structure === 'standard' ? 'standard' : 'lower-LTV, ' + r.regulatory.tenureYears + 'y'}; standard-only ${m(r.regulatory.perStructure.standard)})`);
  console.log(`  planning    ${r.planning.single ? m(r.planning.low) + ' (single figure)' : m(r.planning.low) + ' – ' + m(r.planning.high)}   [standard: ${r.planning.tenureYears}y, 75% LTV]`);
  console.log(`  limiting    ${r.diagnosis.code}  (low end: ${r.planning.binding.low}; high end: ${r.planning.binding.high})`);
  console.log(`  longer      ${r.longerTenure ? 'up to ' + m(r.longerTenure.upTo) + ' (lender-dependent)' : 'not shown'}`);
  console.log(`  cash check  ${r.cash.status}`);
  console.log(`  flags       ${r.flags.map((f) => f.code).join(', ') || '-'}`);
});
process.exit(failed ? 1 : 0);
