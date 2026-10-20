/* Loan tenure and borrower age, across every calculator that picks a bank-loan tenure.
   Run: node tools/hdb-upgrade/tests/tenure-tests.js   (exit 0 = all pass)
   A bank loan is cut to what age 75 leaves (bank policy, rules.js bankMaturityAge) as well as MAS's 35 years; the cut tenure is the one
   that reaches the instalment, the loan limit and the borrowing figure. An HDB loan and a company follow their own rules. */
'use strict';
const assert = require('assert'), path = require('path');
const here = path.resolve(__dirname, '..');
const KR = require(path.join(here, 'rules.js')), ENG = require(path.join(here, 'engine.js')), ASM = require(path.join(here, 'assumptions.js'));
const GW = path.resolve(here, '../../assets/js');
const R = require(path.join(GW, 'gw-rules.js'))(KR);
const C = require(path.join(GW, 'gw-calc.js'))(R, ENG, ASM);
const T = require(path.join(GW, 'gw-timeline.js'))(R, C);
const A = require(path.join(GW, 'gw-answer.js'))(R, C, T);

let n = 0, failed = 0;
const test = (name, fn) => { n++; try { fn(); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + String(e.message).split('\n').join('\n      ')); } };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 1), (msg || '') + ' expected ' + b + ', got ' + a);
const pmt = (loan, ratePct, years) => { const r = ratePct / 1200, m = years * 12; return loan * r / (1 - Math.pow(1 + r, -m)); };

test('rules: one maturity age, from rules.js, 75', () => { assert.strictEqual(KR.bankMaturityAge, 75); assert.strictEqual(R.bankLtv.maturityAge, 75); });

test('the reported case: $990,000 at 4%, age 60, 35 years typed → 15 years, about $7,323 a month (not $4,383)', () => {
  assert.strictEqual(Math.round(pmt(990000, 4, 15)), 7323); assert.strictEqual(Math.round(pmt(990000, 4, 35)), 4383);
  const r = C.progressive({ price: 1800000, age: 60, kind: 'private', loans: 0, years: 35, ratePct: 4 });
  assert.ok(r.ok); assert.strictEqual(r.years, 15); near(r.loanMax, 990000, 1); assert.strictEqual(Math.round(r.finalMonthly), 7323);
  assert.strictEqual(r.tenureCapped, true); assert.strictEqual(r.tenureCappedBy, 'age'); assert.strictEqual(r.tenureAsked, 35); assert.strictEqual(r.tenureAllowed, 15);
});

test('age 35: 35 years stays 35 years (ends at 70); 55% limit for a tenure over 30 years is unchanged', () => {
  const r = C.progressive({ price: 1800000, age: 35, kind: 'private', loans: 0, years: 35, ratePct: 4 });
  assert.strictEqual(r.years, 35); assert.strictEqual(r.tenureCapped, false); assert.strictEqual(r.ltv, 0.55); assert.strictEqual(Math.round(r.finalMonthly), 4383);
  const b = C.progressive({ price: 1800000, age: 35, kind: 'private', loans: 0, ratePct: 4 });
  assert.strictEqual(b.years, 30); assert.strictEqual(b.ltv, 0.75);
});

test('age 50: 35 or 30 years typed → 25 years (ends at 75); 25 typed is used as typed; blank = standard 15', () => {
  const f = (y) => C.progressive({ price: 1800000, age: 50, kind: 'private', loans: 0, years: y, ratePct: 4 });
  assert.strictEqual(f(35).years, 25); assert.strictEqual(f(30).years, 25); assert.strictEqual(f(25).years, 25); assert.strictEqual(f(25).tenureCapped, false); assert.strictEqual(f().years, 15);
  assert.strictEqual(Math.round(f(35).finalMonthly), Math.round(pmt(990000, 4, 25)));
});

test('age 60: 15 is the most; blank = standard 5', () => {
  const f = (y) => C.progressive({ price: 1800000, age: 60, kind: 'private', loans: 0, years: y, ratePct: 4 });
  for (const y of [15, 20, 25, 30, 35]) assert.strictEqual(f(y).years, 15, 'typed ' + y);
  assert.strictEqual(f().years, 5); assert.strictEqual(f(10).years, 10);
});

test('ages 74 and 75: 1 year at 74; no bank loan tenure from 75 (said plainly, nothing calculated)', () => {
  const r74 = C.progressive({ price: 1800000, age: 74, kind: 'private', loans: 0, years: 35, ratePct: 4 }); assert.ok(r74.ok); assert.strictEqual(r74.years, 1);
  const r75 = C.progressive({ price: 1800000, age: 75, kind: 'private', loans: 0, years: 35, ratePct: 4 }); assert.strictEqual(r75.ok, false);
  assert.ok(/by age 75/.test(r75.invalid[0].text));
  const t = C.tdsr({ kind: 'private', borrowers: [{ age: 75, fixed: 20000 }], debts: 0, loans: 0 }); assert.strictEqual(t.noTenure, true); assert.strictEqual(t.cause, 'maturity');
});

test('TDSR: the cut tenure sets the borrowing figure (age 60, 35 typed = the same as 15 typed); age 35 unchanged', () => {
  const f = (age, y) => C.tdsr({ kind: 'private', borrowers: [{ age, fixed: 20000 }], debts: 0, loans: 0, tenure: y });
  assert.strictEqual(f(60, 35).tenure.years, 15); assert.strictEqual(f(60, 35).maxLoan, f(60, 15).maxLoan);
  assert.strictEqual(f(50, 35).tenure.years, 25); assert.strictEqual(f(50, 35).maxLoan, f(50, 25).maxLoan);
  assert.ok(f(60, 35).maxLoan < 1500000 && f(60, 35).maxLoan > 1400000);
  assert.strictEqual(f(35, 35).tenure.years, 35); near(f(35, 35).maxLoan, 2484333, 2);
  // 55% of income at the 4% test rate over the tenure used
  near(f(60, 35).maxLoan, (0.55 * 20000) / (pmt(1, 4, 15)), 2);
});

test('MSR (EC and HDB-flat bank loan): same cut', () => {
  const f = (age, y) => C.msr({ scenario: 'ec', borrowers: [{ age, fixed: 15000 }], tenure: y, loans: 0 });
  assert.strictEqual(f(60, 35).tenure.years, 15); assert.strictEqual(f(60, 35).maxLoan, f(60, 15).maxLoan); assert.strictEqual(f(50, 35).tenure.years, 25); assert.strictEqual(f(35, 35).tenure.years, 35);
});

test('joint borrowers: the income-weighted age (iwaaUse) decides, not the younger borrower', () => {
  const j = C.tdsr({ kind: 'private', borrowers: [{ age: 30, fixed: 5000 }, { age: 66, fixed: 15000 }], debts: 0, loans: 0, tenure: 35 });
  assert.ok(j.ok); const age = j.B.iwaaUse; assert.ok(age > 55 && age < 66, 'weighted age ' + age);
  assert.strictEqual(j.tenure.years, Math.min(35, Math.floor(75 - age + 1e-9)));
  const y = C.tdsr({ kind: 'private', borrowers: [{ age: 30, fixed: 15000 }, { age: 66, fixed: 5000 }], debts: 0, loans: 0, tenure: 35 });
  assert.ok(y.tenure.years > j.tenure.years, 'younger weighted age allows longer: ' + y.tenure.years + ' vs ' + j.tenure.years);
});

test('HDB loan keeps its own rule (not the bank age): min(25, 65 − age, lease − 20), unchanged', () => {
  const h = (age) => C.msr({ scenario: 'hdb', borrowers: [{ age, fixed: 8000 }], loans: 0 });
  const r = h(50); assert.ok(r.ok); assert.ok(!r.noTenure);
  const y = r.tenure ? (r.tenure.years || r.tenure) : null; if (y) assert.ok(y <= 25);
});

test('company: no age, so no age cut (35 years still 35; 15% LTV, tenure does not change the limit)', () => {
  const e = (y) => C.progressive({ price: 5000000, kind: 'private', entity: true, loans: 0, years: y, ratePct: 4, buyers: [] });
  const a = e(35), b = e(15); assert.ok(a.ok, JSON.stringify(a.invalid)); assert.strictEqual(a.years, 35); assert.strictEqual(a.loanMax, b.loanMax);
});

test('rates stay separate: borrowing eligibility uses max(4%, quoted); the instalment uses the rate typed', () => {
  const t = (q) => C.tdsr({ kind: 'private', borrowers: [{ age: 60, fixed: 20000 }], debts: 0, loans: 0, tenure: 35, quotedRatePct: q });
  assert.strictEqual(t(3).maxLoan, t(undefined).maxLoan); assert.ok(t(6).maxLoan < t(4).maxLoan);
  const p3 = C.progressive({ price: 1800000, age: 60, kind: 'private', loans: 0, years: 35, ratePct: 3 }), p5 = C.progressive({ price: 1800000, age: 60, kind: 'private', loans: 0, years: 35, ratePct: 5 });
  assert.strictEqual(p3.loanMax, p5.loanMax); assert.ok(p5.finalMonthly > p3.finalMonthly);
  near(p3.finalMonthly, pmt(990000, 3, 15), 1); near(p5.finalMonthly, pmt(990000, 5, 15), 1);
});

test('What can I afford?: a tenure typed past the limit is used as the limit, and the loan it lends follows', () => {
  const s = (age, y) => ({ kind: 'new', buyers: [{ res: 'SC', age, fixed: 8000 }], cash: 900000, cpf: 300000, home: 'none', years: y });
  const r60 = A.assess(s(60, 35)), r60b = A.assess(s(60, 15));
  assert.strictEqual(r60.state, 'ok'); assert.strictEqual(r60.years, 15); assert.strictEqual(r60.tenure.years, 15); assert.strictEqual(r60.tenure.cappedFrom, 35); assert.strictEqual(r60.tenure.cappedBy, 'age');
  assert.strictEqual(JSON.stringify(r60.highest), JSON.stringify(r60b.highest), 'same answer as typing 15');
  const r35 = A.assess(s(35, 35)); assert.strictEqual(r35.years, 35); assert.ok(!r35.tenure.cappedFrom);
  const r50 = A.assess(s(50, 35)); assert.strictEqual(r50.years, 25);
  const none = A.assess(s(75, 35)); assert.strictEqual(none.state, 'invalid'); assert.ok(/age 75/.test(JSON.stringify(none.errors)));
});

test('What can I afford?: the compare table lists no tenure a bank would not lend', () => {
  const r = A.assess({ kind: 'new', buyers: [{ res: 'SC', age: 60, fixed: 8000 }], cash: 900000, cpf: 300000, home: 'none' });
  const rows = typeof r.options === 'function' ? r.options() : []; assert.ok(rows.length > 0); assert.ok(rows.every((x) => x.years <= 15), rows.map((x) => x.years).join(','));
});

test('Payment timeline: the loan instalments run on the cut tenure; age 75 is refused', () => {
  const base = { kind: 'new', otp: '2026-11-01', price: 1800000, age: 60, buyers: [{ res: 'SC', owned: 0 }], cash: 900000, cpf: 300000, order: 'none', ratePct: 4 };
  const t = T.timeline(Object.assign({}, base, { years: 35 })); assert.ok(t.ok !== false, JSON.stringify(t.invalid || t.missing));
  assert.strictEqual(t.loan.years, 15); assert.strictEqual(t.loan.tenureCappedBy, 'age'); assert.strictEqual(t.loan.tenureAsked, 35);
  const u = T.timeline(Object.assign({}, base, { age: 75, years: 35 })); assert.strictEqual(u.ok, false);
});

test('HDB upgrade planner: the 35-year lower-LTV option is cut to age 75 (its end age shown); younger buyers unchanged', () => {
  const run = (age) => ENG.analyse({ timing: 'sell-first', residency: 'all-sc', salePrice: 1100000, outstandingLoan: 50000, cashSavings: 500000, buyers: [{ age, income: 20000 }] });
  const old = run(58), young = run(40);
  assert.ok(old.regulatory && young.regulatory, 'both give a regulatory maximum');
  assert.ok(old.regulatory.tenureYears <= 17, 'age 58: ' + old.regulatory.tenureYears + ' years'); assert.ok(old.regulatory.endAge <= 75, 'ends by ' + old.regulatory.endAge);
  assert.strictEqual(young.regulatory.tenureYears, 25, 'age 40: the standard structure, ends at 65');
});

// ---- blank tenure at ages 60, 65, 70, 74: the default must never be zero while a typed tenure works ----
// default = longest tenure keeping the standard loan limit (ends by 65); from age 65 none exists, so the default is the longest a bank usually lends (lower limit)
const DEF = { 60: { years: 5, ltv: 0.75, allowed: 15 }, 65: { years: 10, ltv: 0.55, allowed: 10 }, 70: { years: 5, ltv: 0.55, allowed: 5 }, 74: { years: 1, ltv: 0.55, allowed: 1 } };
[60, 65, 70, 74].forEach((age) => {
  const d = DEF[age];
  test('age ' + age + ' blank tenure: TDSR, MSR (EC), New launch payments and What can I afford? give the same answer as typing ' + d.years + ' years', () => {
    const t0 = C.tdsr({ kind: 'private', borrowers: [{ age, fixed: 20000 }], debts: 0, loans: 0 }), t1 = C.tdsr({ kind: 'private', borrowers: [{ age, fixed: 20000 }], debts: 0, loans: 0, tenure: d.years });
    assert.ok(!t0.noTenure, 'TDSR blank must not return no loan'); assert.strictEqual(t0.tenure.years, d.years); assert.strictEqual(t0.ltv, d.ltv); assert.strictEqual(t0.maxLoan, t1.maxLoan); assert.ok(t0.maxLoan > 0);
    const m0 = C.msr({ scenario: 'ec', borrowers: [{ age, fixed: 15000 }], loans: 0 }), m1 = C.msr({ scenario: 'ec', borrowers: [{ age, fixed: 15000 }], loans: 0, tenure: d.years });
    assert.ok(!m0.noTenure); assert.strictEqual(m0.tenure.years, d.years); assert.strictEqual(m0.maxLoan, m1.maxLoan);
    const p0 = C.progressive({ price: 1800000, age, kind: 'private', loans: 0, ratePct: 4 }), p1 = C.progressive({ price: 1800000, age, kind: 'private', loans: 0, years: d.years, ratePct: 4 });
    assert.ok(p0.ok); assert.strictEqual(p0.years, d.years); assert.strictEqual(p0.ltv, d.ltv); assert.strictEqual(p0.finalMonthly, p1.finalMonthly); assert.strictEqual(p0.tenureCapped, false, 'a blank tenure is not "capped"');
    const a0 = A.assess({ kind: 'new', buyers: [{ res: 'SC', age, fixed: 8000 }], cash: 900000, cpf: 300000, home: 'none' }), a1 = A.assess({ kind: 'new', buyers: [{ res: 'SC', age, fixed: 8000 }], cash: 900000, cpf: 300000, home: 'none', years: d.years });
    assert.strictEqual(a0.state, 'ok', 'Planner blank must not be invalid'); assert.strictEqual(a0.years, d.years); assert.strictEqual(JSON.stringify(a0.highest), JSON.stringify(a1.highest));
  });
  test('age ' + age + ': the longest allowed tenure (' + d.allowed + ' years) typed works, takes the lower limit where needed, and a longer one is cut to it', () => {
    const t = C.tdsr({ kind: 'private', borrowers: [{ age, fixed: 20000 }], debts: 0, loans: 0, tenure: d.allowed }); assert.strictEqual(t.tenure.years, d.allowed); assert.ok(t.maxLoan > 0);
    assert.strictEqual(t.ltv, d.allowed > Math.min(30, 65 - age) ? 0.55 : 0.75);
    const over = C.tdsr({ kind: 'private', borrowers: [{ age, fixed: 20000 }], debts: 0, loans: 0, tenure: 35 }); assert.strictEqual(over.tenure.years, d.allowed); assert.strictEqual(over.maxLoan, t.maxLoan);
  });
});

test('age 60 default (5 years, 75% limit): the result carries the longer allowed option (15 years, 55% limit) and its figures, nothing is applied', () => {
  const t = C.tdsr({ kind: 'private', borrowers: [{ age: 60, fixed: 20000 }], debts: 0, loans: 0 });
  assert.ok(t.longer); assert.strictEqual(t.longer.years, 15); assert.strictEqual(t.longer.ltv, 0.55); near(t.longer.maxLoan, 1487114, 2); assert.ok(t.maxLoan < t.longer.maxLoan); assert.strictEqual(t.tenure.years, 5);
  const m = C.msr({ scenario: 'ec', borrowers: [{ age: 60, fixed: 15000 }], loans: 0 }); assert.strictEqual(m.longer.years, 15); near(m.longer.maxLoan, 608365, 2);
  const p = C.progressive({ price: 1800000, age: 60, kind: 'private', loans: 0, ratePct: 4 }); assert.strictEqual(p.longer.years, 15); assert.strictEqual(p.longer.ltv, 0.55); assert.strictEqual(Math.round(p.longer.finalMonthly), 7323); assert.strictEqual(p.years, 5);
  // typed tenure: nothing to offer; a default with nothing longer allowed (age 74): none
  assert.strictEqual(C.tdsr({ kind: 'private', borrowers: [{ age: 60, fixed: 20000 }], debts: 0, loans: 0, tenure: 5 }).longer, null);
  assert.strictEqual(C.tdsr({ kind: 'private', borrowers: [{ age: 74, fixed: 20000 }], debts: 0, loans: 0 }).longer, null);
  assert.strictEqual(C.progressive({ price: 1800000, age: 65, kind: 'private', loans: 0, ratePct: 4 }).longer, null);
});

test('the tenure line says what a blank tenure uses, and from 65 says why there is no standard tenure', () => {
  const n60 = C.tenureNote({ age: 60, std: 5, allowed: 15 }), n66 = C.tenureNote({ age: 66, std: 0, allowed: 9 });
  assert.ok(/5 years is the longest that keeps the standard loan limit, and is used if you leave this blank/.test(n60) && /up to 15 years/.test(n60), n60);
  assert.ok(/no tenure keeps the standard loan limit/.test(n66) && /9 years/.test(n66) && /leave this blank/.test(n66), n66);
});

test('the age-75 cap is labelled as a lender policy, not a MAS rule, wherever it is explained', () => {
  const g = C.tenureNote({}), c = C.tenureNote({ age: 60, std: 5, allowed: 15, chosen: 35 });
  assert.ok(/lender policy, not a MAS rule/.test(g), g); assert.ok(/lender policy, not a MAS rule/.test(c), c);
  assert.ok(/[Bb]ank policy, NOT a MAS rule|NOT a MAS rule/.test(require('fs').readFileSync(path.join(here, 'rules.js'), 'utf8')), 'rules.js comment');
});

test('joint borrowers: the age is the income-weighted average, the higher of the counted and gross weightings (MAS explainer: gross monthly income; Notice wording unsettled), and a blank tenure uses it', () => {
  const B = C.borrowers([{ age: 40, fixed: 5000, variable: 0, rental: 0 }, { age: 66, fixed: 1000, variable: 9000, rental: 0 }]);
  assert.ok(B.iwaaGross > B.iwaa, 'variable income is counted at 70%, so the older borrower weighs less when counted'); assert.strictEqual(B.iwaaUse, Math.max(B.iwaa, B.iwaaGross)); assert.strictEqual(B.ageUnverified, true);
  // MAS's own worked example: 60 earning $8,000 and 30 earning $10,000 gives 43.34
  const m = C.borrowers([{ age: 60, fixed: 8000 }, { age: 30, fixed: 10000 }]); near(m.iwaaGross, 43.33, 0.01); near(m.iwaa, 43.33, 0.01);
  const j = C.tdsr({ kind: 'private', borrowers: [{ age: 40, fixed: 5000 }, { age: 66, fixed: 1000, variable: 9000 }], debts: 0, loans: 0 });
  assert.ok(!j.noTenure); assert.strictEqual(j.tenure.years, Math.min(30, Math.floor(65 - B.iwaaUse))); assert.strictEqual(j.tenure.allowed, Math.min(35, Math.floor(75 - B.iwaaUse + 1e-9)));
});

console.log((failed ? 'FAILED ' + failed + ' of ' : 'ok: all ') + n + ' tenure checks' + (failed ? '' : ' pass'));
process.exit(failed ? 1 : 0);
