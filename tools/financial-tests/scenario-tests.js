'use strict';
/* Package 4: realistic Singapore client journeys, each checked against figures worked out here by hand from the rules (not from the engines):
     1. a first private home on the resale market, with the bank valuation below the agreed price
     2. an HDB owner who sells first, then buys a private resale home below valuation
     3. an HDB owner who buys first (the flat is still owned and still has a loan), with the valuation below the price
     4. a new launch paid in stages, where the money runs out at a stage
     5. a first HDB resale flat, price above HDB's valuation (cash over valuation); an HDB loan needs no minimum cash
   6. a private resale home on the standard schedule: the deposit is cash, CPF is released at completion, cash paid is credited
   Run: node tools/financial-tests/scenario-tests.js */
const H = require('./harness.js')(process.argv[2]);
const { R, C, T, A } = H;
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1 : tol);
const BANDS = [[180000, .01], [180000, .02], [640000, .03], [500000, .04], [1500000, .05], [Infinity, .06]];
function bsd(p) { let r = p, t = 0; for (const [w, rate] of BANDS) { const s = Math.min(r, w); t += s * rate; r -= s; if (r <= 0) break; } return Math.floor(t); }
const ev = (r, id) => r.events.filter((e) => e.id === id)[0];

// ---- 1. first private home, resale: price $1.3m, valuation $1.25m, a couple on $14,000 a month, $220k cash and $260k CPF ----
{
  const s = { kind: 'completed', buyers: [{ res: 'SC', age: 33, fixed: 8000 }, { res: 'SC', age: 31, fixed: 6000 }], ratePct: 3.5, years: 30, cash: 220000, cpf: 260000, home: 'none', price: 1300000, valuation: 1250000 };
  const r = A.assess(s), a = r.at;
  const loan = .75 * 1250000, minCash = .05 * 1250000, cov = 50000, duty = bsd(1300000);
  ok(r.state === 'ok', '1: answered');
  ok(near(a.loan, loan) && near(a.cov, cov), '1: loan is 75% of the $1.25m valuation ($937,500); $50,000 is over valuation', [a.loan, a.cov]);
  ok(near(a.cashOnly, minCash + cov + duty), '1: cash only = $62,500 minimum cash + $50,000 over valuation + stamp duty', [a.cashOnly, minCash + cov + duty]);
  ok(near(a.upfront, 1300000 - loan + duty), '1: cash and CPF needed = price − loan + stamp duty', [a.upfront]);
  // income: 55% of $14,000 = $7,700 a month at the 4% test rate over 30 years must carry the loan
  const af = (1 - Math.pow(1 + .04 / 12, -360)) / (.04 / 12);
  ok(a.incomeLoan > loan && near(a.incomeLoan, 7700 * af, 5), '1: income is not the limit (capacity about $1.61m)', [a.incomeLoan, 7700 * af]);
  ok(a.fits && r.zone !== 'over', '1: $480,000 of cash and CPF covers the $' + Math.round(a.upfront) + ' needed', [a.gap, a.cashShort]);
  const lessCash = A.assess(Object.assign({}, s, { cash: 100000, cpf: 380000 }));
  ok(!lessCash.at.fits && lessCash.at.cashShort > 0, '1: with the same total but only $100,000 in cash it does NOT fit: CPF cannot pay the cash over valuation or the minimum cash', [lessCash.at.cashShort]);
  ok(near(lessCash.at.cashShort, minCash + cov + duty - 100000), '1: the cash shortfall is exactly the cash-only need less the cash', [lessCash.at.cashShort, minCash + cov + duty - 100000]);
}

// ---- 2. sell first: the HDB flat sells ($450,000 cash, $250,000 CPF back); then a $1.6m private resale home valued at $1.5m ----
{
  const s = { kind: 'completed', buyers: [{ res: 'SC', age: 40, fixed: 18000 }], ratePct: 3, years: 25, cash: 100000, cpf: 50000, home: 'sell', order: 'sell', owned: 1,
    flat: { type: 'hdb', hasLoan: 'yes', instalment: 1500, price: 800000, loan: 100000, cpfRefund: 300000, overrideCash: 450000, overrideCpf: 250000 }, price: 1600000, valuation: 1500000 };
  const r = A.assess(s), a = r.at;
  const loan = .75 * 1500000, cashOnly = .05 * 1500000 + 100000 + bsd(1600000);
  ok(r.state === 'ok' && r.basis === 'sell' && r.saleCounted, '2: sold first, sale counted');
  ok(near(a.haveCash, 550000) && near(a.haveCpf, 300000), '2: money in hand once the sale completes: $550,000 cash and $300,000 CPF', [a.haveCash, a.haveCpf]);
  ok(near(a.loan, loan) && near(a.cashOnly, cashOnly), '2: loan $1,125,000 on the valuation; cash only $75,000 + $100,000 over valuation + stamp duty (no ABSD: the flat is sold)', [a.loan, a.cashOnly, cashOnly]);
  ok(a.absd === 0, '2: no ABSD when the flat is sold first', a.absd);
  ok(near(a.flexNeed, 1500000 - loan - .05 * 1500000) && a.fits, '2: the rest ($300,000) is cash or CPF and fits', [a.flexNeed, a.gap]);
  // the same purchase with no valuation needs less cash and borrows more
  const nov = A.assess(Object.assign({}, s, { valuation: undefined }));
  ok(nov.at.loan > a.loan && nov.at.upfront < a.upfront, '2: without the valuation the loan is larger and the money needed smaller', [nov.at.loan, a.loan]);
}

// ---- 3. buy first: the HDB flat is still owned (loan outstanding) when the new $1.8m home is bought; its sale completes in month 6 ----
{
  const i = { kind: 'completed', price: 1800000, valuation: 1700000, otp: '2026-11-02', buyers: [{ res: 'SC', owned: 1 }], age: 40, years: 25, ratePct: 3, cash: 500000, cpf: 100000, order: 'buy', flatLoan: 'outstanding', loansOther: 0,
    sale: { month: 6, cash: 400000, cpf: 300000, removesOwnership: true }, refund: { assume: true, monthsAfterSale: 2 }, dates: { mode: 'grouped' } };
  const r = T.timeline(i);
  const loan = .45 * 1700000, minCash = .25 * 1700000, cov = 100000, bsdAmt = bsd(1800000), absd = .20 * 1800000;
  ok(r.ok, '3: answered');
  ok(r.loan.loans === 1 && near(r.loan.loanMax, loan) && near(r.loan.cashMin, minCash), '3: the flat’s loan counts, so the limit is 45% (and 25% cash) of the $1.7m valuation', [r.loan.loans, r.loan.loanMax, r.loan.cashMin]);
  ok(near(r.duty.bsd, bsdAmt) && near(r.duty.absd, absd), '3: BSD and 20% ABSD (second property) are paid up front on the price', [r.duty.bsd, r.duty.absd]);
  // hand simulation of the money to completion: option 1% and exercise 4% from cash; duty in cash; completion
  let cash = 500000; cash -= 18000; cash -= 72000;
  ok(near(ev(r, 'exercise').cash, 72000), '3: exercise payment of 4% ($72,000) is cash', ev(r, 'exercise'));
  cash -= bsdAmt;                                            // BSD, covered
  const uncoveredAbsd = absd - cash;                          // ABSD $360,000 against what is left
  ok(near(ev(r, 'bsd').uncovered, 0) && near(ev(r, 'absd').uncovered, Math.max(0, uncoveredAbsd), 1), '3: the 20% ABSD is the first payment cash cannot meet (hand-worked shortfall)', [ev(r, 'absd').uncovered, uncoveredAbsd]);
  ok(r.headline.peak > 0 && r.headline.firstGap === ev(r, 'absd').date, '3: first shortfall falls on the duty date', r.headline);
  const comp = ev(r, 'completion');
  ok(near(comp.bank, loan) && near(comp.cash + comp.flex + comp.bank, 1800000 - 90000), '3: completion pays the balance, the bank part is 45% of the valuation', comp);
  ok(comp.cash + 1e-6 >= cov, '3: the $100,000 over valuation is paid in cash at completion', comp);
  ok(r.assumptions.some((a) => a.id === 'valuation'), '3: the valuation is stated as an assumption');
  ok(r.events.some((e) => e.id === 'sale') && r.events.some((e) => e.id === 'refund'), '3: the sale and the assumed ABSD refund are dated inflows');
  // without a valuation the same purchase borrows more and needs less cash at completion
  const nov = T.timeline(Object.assign({}, i, { valuation: undefined }));
  ok(nov.loan.loanMax > r.loan.loanMax && ev(nov, 'completion').bank > comp.bank, '3: no valuation: a larger loan', [nov.loan.loanMax, r.loan.loanMax]);
}

// ---- 4. a new launch paid in stages: $1.8m, $150,000 cash and $200,000 CPF, no monthly savings ----
{
  const i = { kind: 'new', price: 1800000, otp: '2026-11-02', buyers: [{ res: 'SC', owned: 0 }], age: 35, years: 30, ratePct: 3.5, cash: 150000, cpf: 200000, saveMo: 0, cpfMo: 0, order: 'none', dates: { mode: 'grouped' } };
  const r = T.timeline(i);
  ok(r.ok, '4: answered');
  const pct = R.pps.reduce((m, s) => { m[s.id] = s.pct; return m; }, {});
  ok(R.pps.length >= 2 && near(R.pps.reduce((s, x) => s + x.pct, 0), 1, 1e-9), '4: the progressive schedule adds up to 100%');
  R.pps.forEach((s) => ok(near(ev(r, s.id).amount, 1800000 * s.pct), '4: stage "' + s.id + '" is ' + (s.pct * 100) + '% of the price', ev(r, s.id).amount));
  ok(near(r.loan.loanMax, .75 * 1800000) && near(r.loan.cashMin, .05 * 1800000), '4: loan 75%, minimum cash 5% ($90,000)', r.loan);
  // hand simulation: booking fee (5%) is $90,000 cash -> cash $60,000. Stage 2 (15% = $270,000) is cash-or-CPF: CPF $200,000 then $70,000 of cash, $10,000 more than is left
  const cash2 = 150000 - 1800000 * pct[R.pps[0].id];
  const s2 = R.pps[1], need2 = 1800000 * s2.pct, fromCpf = Math.min(200000, need2), fromCash = need2 - fromCpf;
  const short2 = Math.max(0, fromCash - cash2);
  ok(near(ev(r, s2.id).uncovered, short2), '4: stage 2 is short by exactly what the hand calculation gives ($10,000)', [ev(r, s2.id).uncovered, short2]);
  ok(r.headline.firstGap === ev(r, s2.id).date, '4: the first shortfall is stage 2’s date (28 days earliest after the S&P is not needed: it is the S&P itself)', r.headline.firstGap);
  const d = bsd(1800000);
  ok(near(ev(r, 'bsd').amount, d) && d === 59600, '4: BSD on $1.8m is $59,600, due 14 days after signing the S&P', ev(r, 'bsd').amount);
  // monthly savings that pay it all: a shortfall closed by saving
  const rich = T.timeline(Object.assign({}, i, { cash: 400000, cpf: 400000 }));
  ok(rich.headline.peak === 0 || rich.headline.peak < r.headline.peak, '4: more money lowers the peak shortfall', [rich.headline.peak, r.headline.peak]);
  // a valuation is ignored for a new launch (no valuation at purchase)
  const v = T.timeline(Object.assign({}, i, { valuation: 1500000 }));
  ok(near(v.totals.cash, r.totals.cash) && v.loan.cov === 0, '4: a valuation does not touch a new launch');
}

// ---- 5. a first HDB resale flat: $650,000 agreed, HDB values it at $620,000; a couple on $12,000 a month; HDB loan ----
{
  const m = C.msr({ scenario: 'hdb-loan', borrowers: [{ age: 32, fixed: 7000 }, { age: 30, fixed: 5000 }], lease: 75, price: 650000, valuation: 620000 }), f = m.flat;
  ok(m.ok && f, '5: answered');
  ok(near(f.cov, 30000) && near(f.base, 620000), '5: $30,000 is cash over valuation', f);
  ok(near(f.loanLimit, .75 * 620000), '5: the HDB loan limit is 75% of the lower value ($465,000)', f.loanLimit);
  const msrLoan = .30 * 12000 * ((1 - Math.pow(1 + .03 / 12, -(12 * m.tenure.years))) / (.03 / 12));
  ok(near(m.maxLoan, msrLoan, 5) && m.maxLoan > f.loanLimit, '5: income (MSR 30%, 3% test rate) supports far more than the limit, so the 75% limit sets the loan', [m.maxLoan, msrLoan]);
  ok(near(f.loan, 465000) && near(f.down, 650000 - 465000), '5: loan $465,000; $185,000 to pay beyond it', f);
  ok(near(f.cashOnly, 30000) && near(f.cashOrCpf, 185000 - 30000), '5: an HDB loan needs no minimum cash: only the $30,000 COV is cash; the other $155,000 may be cash or CPF OA (the deposit is part of it)', f);
}

// ---- 6. a resale home, standard schedule: $1.5m, valuation $1.4m. The deposit is cash; CPF is released at completion; cash paid is credited ----
{
  const i = { kind: 'completed', price: 1500000, valuation: 1400000, otp: '2026-11-01', buyers: [{ res: 'SC', owned: 0 }], age: 35, order: 'none', years: 30, ratePct: 3, cash: 400000, cpf: 300000, dates: { mode: 'grouped' } };
  const r = T.timeline(i), ex = ev(r, 'exercise'), op = ev(r, 'option'), co = ev(r, 'completion');
  const loan = .75 * 1400000, cashOnly = .05 * 1400000 + 100000;   // minimum cash + cash over valuation
  ok(r.ok && near(op.cashUsed, 15000) && op.cpfUsed === 0, '6: the option fee ($15,000) is cash', op);
  ok(near(ex.cashUsed, 60000) && ex.cpfUsed === 0 && near(ex.amount, 60000), '6: the whole 4% exercise payment ($60,000) is cash, none from CPF', ex);
  ok(near(co.amount, 1425000) && near(co.bank, loan), '6: completion balance 95% = $1,425,000, of which the loan is 75% of the valuation ($1,050,000)', co);
  ok(near(op.cashUsed + ex.cashUsed + co.cashUsed, cashOnly) && near(co.cashUsed, cashOnly - 75000), '6: cash-only need is $170,000 in all; the $75,000 already paid is credited, so $95,000 more is cash at completion', [co.cashUsed, cashOnly]);
  ok(near(co.cpfUsed, 1425000 - loan - (cashOnly - 75000)) && near(co.cpfUsed, 280000), '6: CPF pays the other $280,000, at completion', co.cpfUsed);
  ok(near(op.amount + ex.amount + co.amount, 1500000) && near(op.cashUsed + ex.cashUsed + co.cashUsed + co.cpfUsed + co.bank, 1500000), '6: the stages add to the price and nothing is counted twice', null);
  // not enough cash for the deposit: CPF cannot help at the exercise stage, so the gap shows there
  const tight = T.timeline(Object.assign({}, i, { cash: 50000 }));
  const tex = ev(tight, 'exercise');
  ok(tex.cpfUsed === 0 && tex.uncovered > 0, '6: with only $50,000 cash the exercise payment is short, and CPF does not cover it', tex);
  // no valuation, the standard 5% minimum: option 1% + exercise 4% already meets it, so none more is cash-only at completion
  const nov = T.timeline(Object.assign({}, i, { valuation: undefined })), nco = ev(nov, 'completion');
  ok(near(nco.cashUsed, 0) && near(nco.cpfUsed, 1425000 - .75 * 1500000), '6: no valuation: the 5% minimum cash is met by the deposit; completion is the loan plus CPF', nco);
}

console.log('scenario-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
