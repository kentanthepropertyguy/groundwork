'use strict';
/* V3.8 (27 Oct 2026): Pledged & Unpledged Assets. Every case is worked out here by hand from MAS Notice 645 (rev. 21 Aug 2025) paras 3, 6, 10(b),
   17-21 and Illustrative Example 1, and MAS Notice 632's loan-to-value rows, WITHOUT the engine, then compared with GW_FIN3.assetLoan.
   The rules used by hand (written out so a reader can check them):
     assets counted a month = value x (1 - deduction) / 48; deduction: cash pledged 4+ years 0%, other pledged 4+ years 30%, unpledged 70%
     income counted         = salary + 70% of bonus/commission + assets counted
     for the new loan       = 55% x income counted - repayments (TDSR); HDB flat or new EC: also 30% x income counted - home-loan repayments (MSR)
     loan                   = that monthly amount over the tenure at the higher of 4% and the quoted rate
     tenure (blank)         = the longest that ends by 65 within 30 years (25 for an HDB flat); with none, the longest a bank lends (to 75, max 35/30)
     loan limit             = price x 75% / 45% / 35% (no / one / two+ housing loans), 55% / 25% / 15% when the tenure runs past 30 years (25 HDB) or age 65
   Run: node tools/financial-tests/assets-tests.js */
const H = require('./harness.js')(process.argv[2]);
const { R, C, T, A, S } = H;
const F = require(H.root + '/assets/js/gw-fin3-core.js')(R, C, T, A, S);
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1 : tol);
const AF = (r, n) => (1 - Math.pow(1 + r / 12, -n * 12)) / (r / 12);
const ded = { cash: { p: 0, u: 0.7 }, other: { p: 0.3, u: 0.7 } };
const assetMo = (v, kind, pledged) => v * (1 - ded[kind][pledged ? 'p' : 'u']) / 48;
const base = { age: 35, fixed: 6000, variable: 0, debts: 0, homeLoans: 0, prop: 'private', value: 0, kind: 'cash', pledged: true };
const run = (o) => F.assetLoan(Object.assign({}, base, o));

console.log('MAS Illustrative Example 1 (Notice 645): $100,000 FD pledged 4 years + $80,000 unpledged unit trust = $2,583.33 a month');
{ const a = C.assetIncome({ value: 100000, kind: 'cash', pledged: true }), b = C.assetIncome({ value: 80000, kind: 'other', pledged: false });
  ok(near(a.monthly + b.monthly, 2583.33, 0.01), 'the engine gives MAS\'s own figure', a.monthly + b.monthly); }

console.log('1. The four treatments: $500,000, salary $6,000, age 35, private home, first housing loan (30 years at 4%)');
const af30 = AF(0.04, 30), without1 = 0.55 * 6000 * af30;
[['cash', true, 10416.67], ['cash', false, 3125], ['other', true, 7291.67], ['other', false, 3125]].forEach(([kind, pl, mo]) => {
  const r = run({ value: 500000, kind, pledged: pl }), want = 0.55 * (6000 + assetMo(500000, kind, pl)) * af30;
  ok(near(assetMo(500000, kind, pl), mo, 0.01) && near(r.asset.monthly, mo, 0.01), `${kind} ${pl ? 'pledged' : 'unpledged'}: counts $${mo} a month`, r.asset);
  ok(near(r.capWith, want, 1) && near(r.capWithout, without1, 1) && near(r.extra, want - without1, 1) && r.years === 30, `${kind} ${pl ? 'pledged' : 'unpledged'}: $${Math.round(want)} with, $${Math.round(without1)} without`, [r.capWith, r.capWithout, r.years]);
});
{ const r = run({ value: 500000, kind: 'cash', pledged: true });
  ok(near(r.capAlt, 0.55 * (6000 + 3125) * af30, 1), 'the comparison row: the same cash unpledged', r.capAlt); }

console.log('2. Existing repayments: $1,500 a month of car and other loans');
{ const r = run({ value: 300000, kind: 'cash', pledged: true, debts: 1500 }), want = (0.55 * (6000 + 6250) - 1500) * af30, w0 = (0.55 * 6000 - 1500) * af30;
  ok(near(r.capWith, want, 1) && near(r.capWithout, w0, 1), 'repayments come off 55% of the income counted, with and without', [r.capWith, want, r.capWithout, w0]); }
{ const r = run({ value: 0, debts: 4000 });
  ok(r.state === 'ok' && r.capWithout === 0 && r.capWith === 0, 'repayments above 55% of income: no loan, and no assets entered', r); }

console.log('3. First vs second housing loan, with a price');
{ const r1 = run({ value: 400000, kind: 'cash', pledged: true, price: 1500000 }), r2 = run({ value: 400000, kind: 'cash', pledged: true, price: 1500000, homeLoans: 1, homeDebts: 1800 });
  const cap1 = 0.55 * (6000 + 400000 / 48) * af30, cap2 = (0.55 * (6000 + 400000 / 48) - 1800) * af30;
  ok(near(r1.limit, 1125000, 1) && near(r1.loanWith, Math.min(cap1, 1125000), 1), 'first loan: 75% limit $1,125,000; the loan is the lower of that and the income test', [r1.limit, r1.loanWith, cap1]);
  ok(near(r2.limit, 675000, 1) && near(r2.loanWith, Math.min(cap2, 675000), 1) && r2.minCash === 0.25, 'second loan: 45% limit $675,000, 25% cash minimum', [r2.limit, r2.loanWith, cap2]);
  ok(r2.by === 'ltv' && near(r2.loanWith, 675000, 1), 'second loan: the 45% limit, not income, holds it down', r2.by); }

console.log('4. TDSR-bound vs LTV-bound');
{ const r = run({ value: 200000, kind: 'cash', pledged: true, price: 3000000 }), cap = 0.55 * (6000 + 200000 / 48) * af30;
  ok(r.by === 'tdsr' && near(r.loanWith, cap, 1) && near(r.extra, cap - without1, 1), 'TDSR-bound ($3M home): the assets add the full difference', [r.by, r.loanWith, r.extra]); }
{ const r = run({ value: 500000, kind: 'cash', pledged: true, price: 800000 });
  ok(r.by === 'ltv' && r.byWithout === 'ltv' && near(r.loanWith, 600000, 1) && near(r.loanWithout, 600000, 1) && r.extra === 0, '$800,000 home: 75% = $600,000 already within the income test, so the assets add nothing', [r.loanWith, r.loanWithout, r.extra]);
  ok(r.extraIfNoLimit > 1000000, '... though without a price they would raise the borrowing capacity', r.extraIfNoLimit); }
{ const r = run({ value: 500000, kind: 'cash', pledged: true, price: 1000000 });
  ok(near(r.loanWith, 750000, 1) && near(r.loanWithout, without1, 1) && near(r.extra, 750000 - without1, 1), '$1M home: the assets lift the loan only up to the $750,000 limit', [r.loanWith, r.loanWithout, r.extra]); }

console.log('5. Zero, small and no-income cases');
{ const r = run({ value: 0 }); ok(r.state === 'ok' && r.asset === null && r.extra === 0 && near(r.capWith, without1, 1), 'no assets: the same as How much can I borrow? gives', r.capWith); }
{ const r = run({ value: 10000, kind: 'cash', pledged: false }); ok(near(r.asset.monthly, 62.5, 0.01) && near(r.extra, 0.55 * 62.5 * af30, 1), '$10,000 unpledged cash: $62.50 a month, about $7,200 more', [r.asset.monthly, r.extra]); }
{ const r = run({ age: 60, fixed: 0, value: 600000, kind: 'cash', pledged: true }), cap = 0.55 * 12500 * AF(0.04, 5);
  ok(r.state === 'ok' && r.years === 5 && near(r.capWith, cap, 1) && r.capWithout === 0, 'retiree, age 60, no salary: assets alone support a 5-year loan (to 65)', [r.years, r.capWith, cap]); }
{ const r = run({ fixed: 0, value: 0 }); ok(r.state === 'zero', 'no income and no assets: nothing to lend against', r.state); }
{ const r = run({ age: 76, value: 500000 }); ok(r.state === 'notenure', 'age 76: no bank loan tenure', r.state); }

console.log('6. Income, tenure and rate');
{ const r = run({ value: 300000, kind: 'other', pledged: true, variable: 2000 }), cap = 0.55 * (6000 + 1400 + 300000 * 0.7 / 48) * af30;
  ok(near(r.capWith, cap, 1), 'bonus counts at 70% beside the assets', [r.capWith, cap]); }
{ const r = run({ value: 300000, kind: 'cash', pledged: true, ratePct: 5 }), cap = 0.55 * (6000 + 6250) * AF(0.05, 30);
  ok(near(r.capWith, cap, 1) && near(r.rate, 0.05, 1e-9), 'a 5% quoted rate is tested at 5%', [r.capWith, cap]); }
{ const r = run({ value: 300000, kind: 'cash', pledged: true, ratePct: 3 }), cap = 0.55 * (6000 + 6250) * af30;
  ok(near(r.capWith, cap, 1) && near(r.rate, 0.04, 1e-9), 'a 3% quoted rate is still tested at 4%', [r.capWith, cap]); }
{ const r = run({ age: 50, value: 300000, kind: 'cash', pledged: true, price: 2000000 }), cap = 0.55 * (6000 + 6250) * AF(0.04, 15);
  ok(r.years === 15 && near(r.capWith, cap, 1) && r.ltv === 0.75, 'age 50, tenure blank: 15 years (to 65) at the 75% limit', [r.years, r.capWith, r.ltv]); }
{ const r = run({ age: 50, value: 300000, kind: 'cash', pledged: true, price: 2000000, years: 25 }), cap = 0.55 * (6000 + 6250) * AF(0.04, 25);
  ok(r.years === 25 && near(r.capWith, cap, 1) && r.ltv === 0.55 && near(r.limit, 1100000, 1), 'age 50, 25 years typed: runs past 65, so the 55% limit', [r.years, r.capWith, r.ltv]); }

console.log('7. HDB flat (bank loan) and new EC: the 30% MSR counts the assets too (Notice 645 para 6 and 17(e))');
{ const r = run({ prop: 'hdb', value: 200000, kind: 'cash', pledged: true }), inc = 6000 + 200000 / 48, cap = Math.min(0.30 * inc, 0.55 * inc) * AF(0.04, 25), c0 = 0.30 * 6000 * AF(0.04, 25);
  ok(r.incomeTest === 'msr' && r.years === 25 && near(r.capWith, cap, 1) && near(r.capWithout, c0, 1), 'HDB flat: 30% of income over 25 years', [r.capWith, cap, r.capWithout, c0]); }
{ const r = run({ prop: 'ec', value: 200000, kind: 'cash', pledged: true, debts: 800 }), inc = 6000 + 200000 / 48, cap = Math.min(0.30 * inc, 0.55 * inc - 800) * af30;
  ok(r.incomeTest === 'msr' && near(r.capWith, cap, 1), 'new EC: the lower of 30% (home loans) and 55% less other repayments, 30 years', [r.capWith, cap]); }

console.log('8. Reverse: the assets a target loan needs');
{ const T0 = 1000000, r = run({ value: 0, kind: 'cash', pledged: true, target: T0 }), incNeed = T0 / af30 / 0.55, v = (incNeed - 6000) * 48;
  ok(r.target.state === 'ok' && r.target.value >= v && r.target.value - v < 1000, 'pledged cash for a $1M loan: about $' + Math.round(v), [r.target, v]);
  const vU = (incNeed - 6000) * 48 / 0.3; ok(r.target.valueAlt >= vU && r.target.valueAlt - vU < 1000, 'unpledged cash: about $' + Math.round(vU) + ' (3.3 times as much)', [r.target.valueAlt, vU]);
  const chk = run({ value: r.target.value, kind: 'cash', pledged: true }); ok(chk.capWith >= T0, 'feeding the answer back gives at least the target', chk.capWith); }
{ const T0 = 900000, r = run({ value: 0, kind: 'other', pledged: true, target: T0, debts: 1000 }), v = ((T0 / af30 + 1000) / 0.55 - 6000) * 48 / 0.7;
  ok(r.target.state === 'ok' && r.target.value >= v && r.target.value - v < 1000, 'pledged shares, with $1,000 of repayments: about $' + Math.round(v), [r.target.value, v]); }
{ const r = run({ value: 0, target: 600000 }); ok(r.target.state === 'covered', 'a target the income already supports: no assets needed', r.target); }
{ const r = run({ value: 0, target: 900000, price: 1000000 }); ok(r.target.state === 'ltv' && near(r.target.limit, 750000, 1), 'a target above the 75% limit on the price: no amount of assets reaches it', r.target); }
{ const r = run({ age: 64, value: 0, target: 5e7 }); ok(r.target.state === 'unreachable', 'a target beyond reach at any asset value (short tenure)', r.target); }

console.log('9. V3.8.1: home-loan vs other repayments (Notice 645 para 6(f): MSR counts property loans only; para 9: TDSR counts all). $8,000 a month, age 35, $500,000 cash, one housing loan at $1,300 a month, a $700 car loan');
{ const af25 = AF(0.04, 25), cases = [['hdb', true, af25], ['hdb', false, af25], ['ec', true, af30], ['ec', false, af30]];
  cases.forEach(([prop, pl, af]) => {
    const inc = 8000 + assetMo(500000, 'cash', pl), msr = 0.30 * inc - 1300, tdsr = 0.55 * inc - 2000, want = Math.min(msr, tdsr) * af, old = Math.min(0.30 * inc - 2000, tdsr) * af;
    const r = run({ fixed: 8000, value: 500000, kind: 'cash', pledged: pl, prop, homeLoans: 1, homeDebts: 1300, debts: 700 });
    ok(r.state === 'ok' && near(r.capWith, want, 1) && near(r.forNewMsr, msr, 0.01) && near(r.forNewTdsr, tdsr, 0.01), `${prop === 'hdb' ? 'HDB flat, bank loan' : 'new EC'}, ${pl ? 'pledged' : 'unpledged'}: MSR $${msr.toFixed(2)} (only the $1,300), TDSR $${tdsr.toFixed(2)} (both): $${Math.round(want).toLocaleString()} (all $2,000 in MSR would have given $${Math.round(old).toLocaleString()})`, [r.capWith, want, r.forNewMsr, r.forNewTdsr]);
    const r0 = r.capWithout, w0 = Math.min(0.30 * 8000 - 1300, 0.55 * 8000 - 2000) * af;
    ok(near(r0, w0, 1), `   ... and without the assets: $${Math.round(w0).toLocaleString()}`, [r0, w0]);
  });
  const r = run({ fixed: 8000, value: 500000, kind: 'cash', pledged: true, prop: 'private', homeLoans: 1, homeDebts: 1300, debts: 700 }), want = (0.55 * (8000 + 500000 / 48) - 2000) * af30;
  ok(near(r.capWith, want, 1) && r.incomeTest === 'tdsr', 'private home: both repayments in TDSR, no MSR', [r.capWith, want]);
  const t = run({ fixed: 8000, value: 0, prop: 'hdb', homeLoans: 1, homeDebts: 1300, debts: 3000 }), tw = Math.min(0.30 * 8000 - 1300, 0.55 * 8000 - 4300) * af25;
  ok(near(t.capWith, tw, 1) && t.forNewTdsr < t.forNewMsr, 'a large car loan: TDSR, not MSR, sets the HDB loan ($100 a month left)', [t.capWith, tw, t.forNewMsr, t.forNewTdsr]);
  const n = run({ fixed: 8000, value: 500000, prop: 'hdb', homeLoans: 1, debts: 700 });
  ok(n.state === 'need' && n.need[0] === 'homeDebts', 'a housing loan running with its repayment blank: asked for, never taken as zero', n);
  const z = run({ fixed: 8000, value: 500000, prop: 'hdb', homeLoans: 0, homeDebts: 1300, debts: 700 }), zw = Math.min(0.30 * (8000 + 500000 / 48), 0.55 * (8000 + 500000 / 48) - 700) * af25;
  ok(near(z.capWith, zw, 1), 'housing loans "None": a leftover home-loan figure is not counted', [z.capWith, zw]); }

console.log('\nassets-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
