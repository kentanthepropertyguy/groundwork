'use strict';
/* Package 4: income consistency. The Planner (GW_ANSWER) now reads rental income the way How much can I borrow? (GW_CALC.tdsr) does: counted at 70%, like variable income.
   Whatever the Planner says a buyer can borrow must equal the TDSR tool's figure for the same borrowers, tenure and rate.  Run: node tools/financial-tests/income-tests.js */
const H = require('./harness.js')(process.argv[2]);
const { R, C, A } = H;
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1 : tol);
const sc = (o) => Object.assign({ kind: 'completed', buyers: [{ res: 'SC', age: 35, fixed: 5000 }], ratePct: 4, years: 30, cash: 400000, cpf: 300000, home: 'none' }, o || {});
const tdsr = (borrowers, years, rate) => C.tdsr({ kind: 'private', borrowers: borrowers, debts: 0, loans: 0, tenure: years, quotedRatePct: rate });

ok(R.variableIncomeHaircut === R.rentalIncomeHaircut, 'variable and rental income take the same haircut (the Planner hands rental to the Timeline as variable income, which is only exact while this holds)', [R.variableIncomeHaircut, R.rentalIncomeHaircut]);

// ---- 1. one buyer: fixed $5,000 + rental $4,000 ----
{
  const r = A.assess(sc({ buyers: [{ res: 'SC', age: 35, fixed: 5000, rental: 4000 }] }));
  const t = tdsr([{ age: 35, fixed: 5000, rental: 4000 }], 30, 4);
  ok(r.state === 'ok', 'planner answers with rental income');
  ok(near(r.borrow.max, t.maxLoan), 'borrowing capacity equals the TDSR tool’s for the same figures', [r.borrow.max, t.maxLoan]);
  ok(near(r.B.assessable, 5000 + 4000 * .7), 'rental is counted at 70%', r.B.assessable);
  const asFixed = A.assess(sc({ buyers: [{ res: 'SC', age: 35, fixed: 5000 + 2800 }] })), asVar = A.assess(sc({ buyers: [{ res: 'SC', age: 35, fixed: 5000, variable: 4000 }] }));
  ok(near(r.borrow.max, asFixed.borrow.max) && near(r.borrow.max, asVar.borrow.max), 'same as $7,800 fixed, and as $4,000 of variable income');
  const none = A.assess(sc());
  ok(r.borrow.max > none.borrow.max && r.budget >= none.budget, 'rental income adds borrowing capacity and never lowers the budget', [none.borrow.max, r.borrow.max]);
  ok(near(r.B.gross, 9000), 'the gross income includes the rental', r.B.gross);
}
// ---- 2. rental income only ----
{
  const r = A.assess(sc({ buyers: [{ res: 'SC', age: 40, rental: 6000 }] })), t = tdsr([{ age: 40, rental: 6000 }], 30, 4);
  ok(r.state === 'ok' && near(r.borrow.max, t.maxLoan) && t.maxLoan > 0, 'a buyer with rental income only is assessed, and agrees with the TDSR tool', [r.state, r.borrow && r.borrow.max, t.maxLoan]);
  const z = A.assess(sc({ buyers: [{ res: 'SC', age: 40, fixed: 0, rental: 0 }] }));
  ok(z.state === 'no-income', '$0 fixed and $0 rental is still “no income”', z.state);
}
// ---- 3. two buyers: the income-weighted age uses the counted income, rental included ----
{
  const bs = [{ res: 'SC', age: 30, fixed: 6000 }, { res: 'SC', age: 50, fixed: 2000, rental: 5000 }];
  const r = A.assess(sc({ buyers: bs, years: undefined })), B = C.borrowers(bs.map((b) => ({ age: b.age, fixed: b.fixed || 0, rental: b.rental || 0 })));
  ok(r.state === 'ok' && near(r.B.iwaa, B.iwaa, 1e-9), 'income-weighted age is the engine’s, with the rental counted', [r.B.iwaa, B.iwaa]);
  const wantAge = (30 * 6000 + 50 * (2000 + 3500)) / (6000 + 5500);
  ok(near(r.B.iwaa, wantAge, 1e-6), 'and equals the hand calculation', [r.B.iwaa, wantAge]);
  const t = tdsr(bs.map((b) => ({ age: b.age, fixed: b.fixed || 0, rental: b.rental || 0 })), r.years, 4);
  ok(near(r.borrow.max, t.maxLoan), 'two buyers: borrowing capacity equals the TDSR tool’s', [r.borrow.max, t.maxLoan]);
}
// ---- 4. validation, as for the other income fields ----
{
  const neg = A.assess(sc({ buyers: [{ res: 'SC', age: 35, fixed: 5000, rental: -1 }] }));
  ok(neg.state === 'invalid' && neg.errors.some((e) => e.key === 'buyers.0.rental'), 'a negative rental amount is flagged on its own field', neg.errors);
  const big = A.assess(sc({ buyers: [{ res: 'SC', age: 35, fixed: 5000, rental: 1e12 }] }));
  ok(big.state === 'invalid' && big.errors.some((e) => e.key === 'buyers.0.rental'), 'an amount above the limit is flagged', big.errors);
}
// ---- 5. the whole answer moves together: budget at a price, with rental income ----
{
  const a = A.assess(sc({ buyers: [{ res: 'SC', age: 35, fixed: 3000, rental: 5000 }], cash: 900000, cpf: 600000 })), b = A.assess(sc({ buyers: [{ res: 'SC', age: 35, fixed: 3000 + 3500 }], cash: 900000, cpf: 600000 }));
  ok(a.state === 'ok' && b.state === 'ok' && a.budget === b.budget && a.limitedBy === b.limitedBy, 'budget and limit equal those of the equivalent fixed income', [a.budget, b.budget]);
  const p1 = A.assess(sc({ buyers: [{ res: 'SC', age: 35, fixed: 3000, rental: 5000 }], cash: 900000, cpf: 600000, price: 1500000 })), p2 = A.assess(sc({ buyers: [{ res: 'SC', age: 35, fixed: 6500 }], cash: 900000, cpf: 600000, price: 1500000 }));
  ok(near(p1.at.loan, p2.at.loan) && near(p1.at.monthly, p2.at.monthly) && p1.zone === p2.zone, 'at a price: the same loan, instalment and verdict', [p1.at.loan, p2.at.loan]);
}
// ---- 6. an entry without rental behaves exactly as before ----
{
  const a = A.assess(sc()), b = A.assess(sc({ buyers: [{ res: 'SC', age: 35, fixed: 5000, rental: undefined }] })), c = A.assess(sc({ buyers: [{ res: 'SC', age: 35, fixed: 5000, rental: 0 }] }));
  ok(a.budget === b.budget && a.budget === c.budget && near(a.borrow.max, b.borrow.max) && near(a.borrow.max, c.borrow.max), 'no rental, blank or $0: unchanged');
}

console.log('income-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
