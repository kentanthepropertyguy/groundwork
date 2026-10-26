'use strict';
/* Planner affordability: the maximum property budget, checked against a SECOND, independent calculation written here from the rules (BSD bands, 75% LTV, 5% minimum cash,
   TDSR 55% at the higher of 4% and the quoted rate, the annuity formula). The engine under test is GW_ANSWER (assets/js/gw-answer.js). Run: node tools/financial-tests/afford-tests.js */
const H = require('./harness.js')(process.argv[2]);
const A = H.A;
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } };

// ---- independent calculation (first-property citizens buying a completed private home, loan at 75%) ----
const BANDS = [[180000, .01], [180000, .02], [640000, .03], [500000, .04], [1500000, .05], [Infinity, .06]];
function bsd(p) { let r = p, t = 0; for (const [w, rate] of BANDS) { const s = Math.min(r, w); t += s * rate; r -= s; if (r <= 0) break; } return Math.floor(t); }
const annuity = (rate, yrs) => { const n = yrs * 12, i = rate / 12; return (1 - Math.pow(1 + i, -n)) / i; };
const incomeLoan = (income, debts, ratePct, yrs) => Math.max(0, .55 * income - debts) * annuity(Math.max(.04, ratePct / 100), yrs);
// the exact highest price (to the dollar) and the one on the $1,000 grid the planner shows
function indep(cash, cpf, income, debts, ratePct, yrs, ignoreIncome) {
  const cap = ignoreIncome ? Infinity : incomeLoan(income, debts, ratePct, yrs);
  const fits = (P) => { const loan = Math.min(.75 * P, cap), cashOnly = .05 * P + bsd(P); return P + bsd(P) <= cash + cpf + loan + 1e-6 && cashOnly <= cash + 1e-6 && P - loan - .05 * P <= cpf + (cash - cashOnly) + 1e-6; };
  let lo = 0, hi = 60e6; if (!fits(100000)) return { exact: 0, grid: null };
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
  return { exact: lo, grid: Math.floor(lo / 1000) * 1000, cap };
}
const sc = (o) => Object.assign({ kind: 'completed', buyers: [{ res: 'SC', age: 35, fixed: 21000, variable: 0 }], debts: 0, ratePct: 2, years: 28, cash: 100000, cpf: 200000, home: 'none' }, o || {});

// ---- 1. the reference case ----
{
  const r = A.assess(sc());
  ok(r.state === 'ok', 'reference: answered', r.state);
  const ex = indep(100000, 200000, 21000, 0, 2, 28);
  ok(Math.abs(ex.exact - 1087588) < 3, 'independent funds-limited price is about $1,087,588 (the brief’s $1.0876m)', ex.exact);
  ok(r.highest === ex.grid && r.highest === 1087000, 'maximum budget = that price rounded down to the nearest $1,000 ($1,087,000)', [r.highest, ex.grid]);
  ok(Math.abs(r.exactBudget() - ex.exact) < 1.01 && r.exactBudget() >= r.highest && r.exactBudget() < r.highest + 1000, 'the exact figure ($1,087,588) is kept for the breakdown', [r.exactBudget(), ex.exact]);
  ok(r.atHighest.fits && r.atHighest.gap === 0, 'the displayed amount passes the affordability checks');
  ok(r.budget === r.highest && r.comfortable === r.highest, 'no reserve: the headline budget is the highest price, no second budget', [r.budget, r.comfortable, r.highest]);
  ok(Math.abs(r.borrow.max - 2332333) < 2 && Math.abs(r.borrow.max - incomeLoan(21000, 0, 2, 28)) < 1, 'borrowing capacity is $2,332,333: 55% of $21,000 at the 4% test rate over 28 years', r.borrow.max);
  ok(r.limitedBy === 'funds', 'limited by cash and CPF, not income', r.limitedBy);
  ok(Math.abs(r.fundsPrice() - 1087000) < 1, 'funds-supported price is the same price', r.fundsPrice());
  ok(r.atHighest.loan === 815250 && r.atHighest.ltv === .75, 'loan at this price is 75% = $815,250', [r.atHighest.loan, r.atHighest.ltv]);
  ok(Math.abs(r.atHighest.monthly - 815250 / annuity(.02, 28)) < 1, 'monthly mortgage uses the 2% quoted rate over 28 years', r.atHighest.monthly);
  ok(r.atHighest.loan < r.borrow.max, 'actual loan used is far below borrowing capacity (the two are not confused)');
  ok(r.atHighest.gap === 0 && r.atHighest.fits, 'the maximum fits with nothing short');
  const next = A.evaluate(A.read(sc()), 'none', 1088000);
  ok(next.ok && !next.fits, 'the next $1,000 up does not fit', next.gap);
}
// ---- 2. no reserve is held back unless asked ----
{
  const r = A.assess(sc()), withC = A.assess(sc({ cushion: { months: 6 } }));
  ok(r.highest === withC.highest && withC.comfortable < withC.highest, 'a cushion is only an option: asked for, it lowers the comfortable figure and never the highest', [r.highest, withC.comfortable]);
  const sa = A.assess(sc({ setAside: 50000 })), ex = indep(50000, 200000, 21000, 0, 2, 28);
  ok(sa.highest === ex.grid && sa.highest < r.highest, '"Set aside" (More options) keeps that cash out of the purchase', [sa.highest, ex.grid]);
}
// ---- 3. income can be the limit ----
{
  const r = A.assess(sc({ buyers: [{ res: 'SC', age: 35, fixed: 5000, variable: 0 }], cash: 900000, cpf: 400000 })), ex = indep(900000, 400000, 5000, 0, 2, 28);
  ok(r.state === 'ok' && r.highest === ex.grid, 'income-limited: same price as the independent calculation', [r.highest, ex.grid]);
  ok(r.limitedBy === 'income', 'income-limited: says so', r.limitedBy);
  ok(r.fundsPrice() > r.highest, 'the cash and CPF alone would support more', [r.fundsPrice(), r.highest]);
  ok(Math.abs(r.atHighest.loan - r.borrow.max) < 1, 'the loan used is the whole borrowing capacity', [r.atHighest.loan, r.borrow.max]);
}
// ---- 4. the same answer as the independent calculation across many cases ----
{
  let seed = 20261022; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = (a, b, step) => a + Math.floor(rnd() * ((b - a) / step + 1)) * step;
  let n = 0, mism = 0, byLim = { funds: 0, income: 0 }, badLim = 0;
  for (let k = 0; k < 400; k++) {
    const age = pick(25, 40, 1), yrs = pick(10, Math.min(30, 65 - age), 1), cash = pick(60000, 1500000, 10000), cpf = pick(0, 600000, 10000), income = pick(3000, 40000, 500), debts = rnd() < .3 ? pick(500, 3000, 100) : 0, rate = pick(15, 45, 1) / 10;
    const r = A.assess(sc({ buyers: [{ res: 'SC', age: age, fixed: income, variable: 0 }], cash: cash, cpf: cpf, debts: debts, ratePct: rate, years: yrs }));
    const ex = indep(cash, cpf, income, debts, rate, yrs);
    if (r.state !== 'ok') { if (ex.grid === null) continue; mism++; console.log('  not answered but independent has ' + ex.grid, { age, yrs, cash, cpf, income, debts, rate, state: r.state }); continue; }
    if (r.atHighest.ltv !== .75) continue;   // outside the simple 75% case this check was written for
    n++;
    if (r.highest !== ex.grid) { mism++; if (mism < 6) console.log('  mismatch', { age, yrs, cash, cpf, income, debts, rate, engine: r.highest, independent: ex.grid }); }
    const exF = indep(cash, cpf, income, debts, rate, yrs, true), lim = exF.grid > ex.grid ? 'income' : 'funds';
    byLim[r.limitedBy] = (byLim[r.limitedBy] || 0) + 1; if (r.limitedBy !== lim) { badLim++; console.log('  limit differs', { age, yrs, cash, cpf, income, debts, rate, engine: r.limitedBy, indep: lim, fundsOnly: exF.grid, withIncome: ex.grid, cap: Math.round(ex.cap) }); }
    if (Math.abs(r.fundsPrice() - exF.grid) > 0) { mism++; }
  }
  ok(n > 250, 'enough cases were in the simple 75% range to compare', n);
  ok(mism === 0, 'maximum budget and funds-supported price match the independent calculation in every case', mism);
  ok(badLim === 0, 'the limit named (cash and CPF, or income) matches the independent calculation', badLim);
  ok(byLim.funds > 30 && byLim.income > 30, 'the random cases exercise both limits', byLim);
}
// ---- 5. testing a different price ----
{
  const own = (price) => A.assess(sc({ price: price }));
  const a = own(900000), b = own(1300000), c = own(1087000);
  ok(a.priceIsOwn && a.zone === 'comfortable' && a.at.gap === 0, 'a lower price fits', [a.zone, a.at.gap]);
  ok(a.at.loan === .75 * 900000 && Math.abs(a.at.monthly - 675000 / annuity(.02, 28)) < 1, 'its loan and monthly mortgage follow the price', [a.at.loan, a.at.monthly]);
  ok(Math.abs(a.at.upfront - (900000 - 675000 + bsd(900000))) < 1, 'cash and CPF needed = price - loan + stamp duty', a.at.upfront);
  ok(b.zone === 'over' && b.at.gap > 0 && Math.abs(b.at.gap - (1300000 + bsd(1300000) - .75 * 1300000 - 300000)) < 2, 'a higher price shows the exact extra cash or CPF needed', [b.zone, b.at.gap]);
  ok(b.fixes && b.fixes.some((f) => f.kind === 'price' && f.to === 1087000) && b.fixes.some((f) => f.kind === 'cash'), 'and the two ways to close it', b.fixes && b.fixes.map((f) => f.kind));
  ok(c.priceIsOwn && c.zone === 'comfortable', 'typing the maximum itself fits');
  ok(A.assess(sc()).priceIsOwn === false, 'with no price typed, the maximum is what is shown (not "own")');
}
// ---- 5b. two buyers: split incomes and ages (income-weighted age, eligible tenure, maximum borrowing) ----
{
  // Independent rules: the age used is the income-weighted average, weighted by assessable income (variable income counted at 70%) and by gross income, whichever is higher
  // (the engine's declared conservative reading of MAS Notice 632 fn. 6); the standard tenure ends by age 65 and is at most 30 years; a bank lends at most to age 75 and 35 years.
  const iw = (bs, w) => bs.reduce((t, b) => t + b.age * w(b), 0) / bs.reduce((t, b) => t + w(b), 0);
  const asses = (b) => b.fixed + .7 * (b.variable || 0), gross = (b) => b.fixed + (b.variable || 0);
  const run = (name, bs, o) => {
    o = o || {};
    const age = Math.max(iw(bs, asses), iw(bs, gross)), std = Math.max(0, Math.min(30, Math.floor(65 - age))), yrs = o.years || std;
    const income = bs.reduce((t, b) => t + asses(b), 0), r = A.assess(sc({ buyers: bs.map((b) => Object.assign({ res: 'SC', variable: 0 }, b)), years: o.years, ratePct: o.rate || 2, cash: o.cash || 100000, cpf: o.cpf || 200000 }));
    ok(r.state === 'ok', name + ': answered', r.state);
    ok(Math.abs(r.B.iwaaUse - age) < 1e-6,   /* the engine tidies the age to 6 decimals */ name + ': income-weighted age used (' + age.toFixed(2) + ')', [r.B.iwaaUse, age]);
    ok(r.years === yrs, name + ': eligible tenure ' + yrs + ' years', [r.years, yrs]);
    const cap = incomeLoan(income, 0, o.rate || 2, yrs);
    ok(Math.abs(r.borrow.max - cap) < 1, name + ': maximum borrowing = 55% of the combined assessable income at the 4% test rate over that tenure (' + Math.round(cap) + ')', [r.borrow.max, cap]);
    const ex = indep(o.cash || 100000, o.cpf || 200000, income, 0, o.rate || 2, yrs);
    if (r.atHighest.ltv === .75) ok(r.highest === ex.grid, name + ': maximum budget matches the independent calculation', [r.highest, ex.grid]);
    return { r: r, age: age, std: std };
  };
  // (a) 38 on $12,000 and 31 on $6,000 + $2,000 variable: the weighted age (35.33) gives 29 years; a simple average of ages (34.5) would wrongly give 30
  const a = run('two buyers, tenure left blank', [{ age: 38, fixed: 12000 }, { age: 31, fixed: 6000, variable: 2000 }]);
  ok(a.std === 29 && Math.floor(65 - (38 + 31) / 2) === 30, 'the weighted age, not the simple average, decides the tenure (29, not 30 years)', a.std);
  // (b) an older pair, equal incomes: age 49 gives 16 years; and the income-limited case (modest cash needed, large funds)
  run('older pair, tenure left blank', [{ age: 58, fixed: 9000 }, { age: 40, fixed: 9000 }]);
  run('older pair, large funds so income limits', [{ age: 58, fixed: 9000 }, { age: 40, fixed: 9000 }], { cash: 900000, cpf: 600000 });
  // (c) the older, higher earner pulls the age up: 52 on $15,000 and 29 on $3,000 is NOT 40.5
  const c = run('one dominant earner', [{ age: 52, fixed: 15000 }, { age: 29, fixed: 3000 }], { years: 20, cash: 800000, cpf: 400000 });
  ok(c.age > 48 && c.age < 49, 'the dominant earner’s age dominates (' + c.age.toFixed(2) + ', not the 40.5 average)', c.age);
  // (d) a chosen tenure longer than the age allows is cut to what the age allows (75 less the weighted age)
  const d = A.assess(sc({ buyers: [{ res: 'SC', age: 52, fixed: 15000, variable: 0 }, { res: 'SC', age: 29, fixed: 3000, variable: 0 }], years: 35 }));
  ok(d.years <= Math.floor(75 - d.B.iwaaUse + 1e-9), 'a longer chosen tenure is cut to the age limit', [d.years, d.B.iwaaUse]);
}
// ---- 6. an HDB flat is still routed away, an incomplete form still asks ----
{
  ok(A.assess(sc({ kind: 'hdb' })).state === 'hdb', 'HDB flats still go to the HDB calculator');
  ok(A.assess({ kind: 'completed', buyers: [{ res: 'SC', age: 35 }] }).state === 'empty', 'no income yet: asks for it');
}
console.log('afford: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
