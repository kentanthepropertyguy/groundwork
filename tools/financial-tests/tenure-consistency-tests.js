'use strict';
/* Loan tenure: what is entered, what is shown and what is calculated are one number.
   For ages 35, 50, 60 and 70, with the tenure blank, valid and too long (30, 40): the tenure every engine applies is the one the rules allow (the shorter of the
   MAS maximum and 75 minus the age), and the loan, the instalment and the affordability figures are exactly those of typing that applied tenure.
   A blank tenure keeps the sensible default (the longest that keeps the standard loan limit): it is never moved to a longer one for the buyer, and a valid
   entry is never changed. Also the shared wording. Run: node tools/financial-tests/tenure-consistency-tests.js [rootDir] */
const H = require('./harness.js')(process.argv[2]);
const { C, T, A, R } = H;
let pass = 0, fail = 0, shown = 0;
function ok(name, c, info) { if (c) { pass++; return; } fail++; if (shown++ < 40) console.log('FAIL ' + name + (info === undefined ? '' : ' | ' + JSON.stringify(info).slice(0, 300))); }
const same = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), [a, b]);
const SC = { res: 'SC', owned: 0 };
const AGES = [35, 50, 60, 70], VALID = { 35: 25, 50: 20, 60: 10, 70: 3 };
const allowedOf = (age, max) => Math.min(max, 75 - age), stdOf = (age, cap) => Math.max(0, Math.min(cap, 65 - age));
for (const age of AGES) {
  const allowed = allowedOf(age, 35), std = stdOf(age, 30), dflt = std >= 1 ? std : allowed;
  const entries = [['blank', undefined, dflt], ['valid', VALID[age], VALID[age]], ['30', 30, Math.min(30, allowed)], ['40', 40, allowed]];
  for (const [lab, typed, applied] of entries) {
    const tag = `age ${age} ${lab}`;
    // ---- bank tenure itself
    const t = C.bankTenure('private', age, typed);
    ok(tag + ': bankTenure applies ' + applied, t.years === applied, t);
    ok(tag + ': blank keeps the default, never the longest', lab !== 'blank' || t.years === dflt);
    ok(tag + ': a valid entry is not changed', typed === undefined || typed > allowed || t.years === typed, t);
    // ---- TDSR (typed 40 is accepted as "more than allowed" and cut; same as the applied tenure)
    const td = (y) => C.tdsr({ kind: 'private', borrowers: [{ age, fixed: 20000 }], debts: 0, loans: 0, tenure: y });
    const a = td(typed), b = td(applied);
    ok(tag + ': tdsr tenure', a.ok && a.tenure.years === applied, a.tenure);
    same(tag + ': tdsr loan = loan at applied tenure', [a.maxLoan, a.ltv, a.minCash], [b.maxLoan, b.ltv, b.minCash]);
    // ---- MSR: EC and HDB flat with a bank loan
    for (const [sc, cap] of [['ec', 35], ['hdb-bank', 30]]) {
      const ap = typed === undefined ? (stdOf(age, sc === 'ec' ? 30 : 25) >= 1 ? stdOf(age, sc === 'ec' ? 30 : 25) : allowedOf(age, cap)) : Math.min(typed, allowedOf(age, cap));
      const m = (y) => C.msr({ scenario: sc, borrowers: [{ age, fixed: 15000 }], tenure: y, loans: 0 });
      const x = m(typed), y = m(ap);
      ok(tag + ' msr ' + sc + ': tenure ' + ap, x.ok && x.tenure.years === ap, x.tenure);
      same(tag + ' msr ' + sc + ': loan = loan at applied tenure', [x.maxLoan, x.ltv], [y.maxLoan, y.ltv]);
    }
    // ---- New launch payments and the Payment Timeline use the same tenure, loan and instalment
    const pg = (y) => C.progressive({ price: 1800000, age, kind: 'private', loans: 0, years: y, buyers: [SC] });
    const p1 = typed === 40 ? pg(allowed) : pg(typed), p2 = pg(applied);
    ok(tag + ': new launch tenure', p1.ok && p1.years === applied, [p1.years, p1.error]);
    same(tag + ': new launch loan, instalment = at applied tenure', [p1.loanMax, p1.finalMonthly, p1.ltv], [p2.loanMax, p2.finalMonthly, p2.ltv]);
    const tl = (y) => T.timeline({ kind: 'new', price: 1800000, otp: '2027-03-01', age, buyers: [SC], years: y, cash: 9e7, cpf: 0, order: 'none' });
    const t1 = typed === 40 ? tl(allowed) : tl(typed), t2 = tl(applied);
    ok(tag + ': timeline tenure', t1.ok && t1.loan.years === applied, t1.loan);
    same(tag + ': timeline loan, instalment = at applied tenure', [t1.loan.loanMax, t1.instalment.final], [t2.loan.loanMax, t2.instalment.final]);
    same(tag + ': timeline = new launch (loan, instalment, to the cent)', [t1.loan.loanMax, Math.round(t1.instalment.final * 100)], [p1.loanMax, Math.round(p1.finalMonthly * 100)]);
    // ---- What can I afford?
    const as = (y) => A.assess({ kind: 'new', otp: '2027-03-01', buyers: [{ res: 'SC', age, fixed: 9000 }], cash: 900000, cpf: 300000, home: 'none', years: y });
    const q1 = typed === 40 ? as(allowed) : as(typed), q2 = as(applied);
    ok(tag + ': afford tenure', q1.state === 'ok' && q1.years === applied, [q1.state, q1.years]);
    same(tag + ': afford budget, loan, instalment = at applied tenure', [q1.comfortable, q1.highest, q1.atComfortable && q1.atComfortable.loan, q1.atComfortable && q1.atComfortable.monthly], [q2.comfortable, q2.highest, q2.atComfortable && q2.atComfortable.loan, q2.atComfortable && q2.atComfortable.monthly]);
    if (typed !== undefined && typed <= allowed) ok(tag + ': afford keeps a valid entry as the buyer\'s choice', q1.tenure.manual === true, q1.tenure);
    // ---- the loan limit tier follows the tenure, and is stated, never silently chosen
    const longer = applied > std, tierTxt = C.tenureTierText({ std, allowed, loans: 0 });
    ok(tag + ': tdsr loan limit tier matches the tenure', a.ltv === (applied > std ? R.bankLtv.lower[0].ltv : R.bankLtv.standard[0].ltv), [a.ltv, applied, std]);
    if (typed > allowed) {
      const note = C.tenureNote({ age, std, allowed, chosen: typed, loans: 0 });
      ok(tag + ': note gives the maximum', /Maximum \d+ years/.test(note) && note.indexOf('Maximum ' + allowed + ' years') === 0, note);
      ok(tag + ': note names the lower tier in figures', allowed <= std || (tierTxt && note.indexOf(tierTxt) > 0 && /55%/.test(note) && /75%/.test(note) || std < 1), note);
    }
  }
}
// the wording
ok('Ken\'s example', C.tenureNote({ age: 60, std: 5, allowed: 15, chosen: 30 }).indexOf('Maximum 15 years based on age 60 and assumed bank maturity age 75') === 0);
ok('age 60 shows both tiers', /Over 5 years takes the lower loan limit of 55% \(75% up to 5 years\)/.test(C.tenureNote({ age: 60, std: 5, allowed: 15, chosen: 30, loans: 0 })));
ok('adjusted entry says so', C.tenureNote({ age: 60, std: 5, allowed: 15, chosen: 15, adjustedFrom: 30 }).indexOf('Changed from 30 years. Maximum 15 years') === 0);
ok('a valid longer entry keeps its own wording', /Over 5 years takes the lower loan limit/.test(C.tenureNote({ age: 60, std: 5, allowed: 15, chosen: 10, loans: 0 })));
ok('35-year maximum has no age sentence', C.tenureNote({ age: 35, std: 30, allowed: 35, chosen: 40 }).indexOf('Maximum 35 years for a bank loan.') === 0);
console.log('tenure-consistency: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
