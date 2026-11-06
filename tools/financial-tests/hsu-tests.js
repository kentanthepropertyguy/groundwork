'use strict';
/* Hold vs Sell vs Upgrade, P1 (Master Planning approval, 6 Nov 2026): the GW_CALC position primitives and the GW_ENGINE position / compare blocks, in node.
   1 loanAt: GW_CALC.mortgage's own arithmetic (balanceAfter at 5 and 10 years equal, exactly, for 2,000 seeded loans); the closed form at every month;
     principal + interest = payments; nothing owed after the term
   2 loanFrom: round trip with loanAt (a loan picked up part-way runs on identically); the last payment only what is owed; 'never' when the repayment
     does not cover the interest; a rate by lender only from GW_RULES (HDB, dated) or the planning rate, and said
   3 valueAt, ledger, breakEven: 0% gives the price back; one definition of the position; cash, CPF and equity separate; break-even substituted back
     gives equal positions
   4 compare on 300 seeded households × 3 periods: the principal-repayment identity (position = starting equity + value change − transaction costs
     − interest − rent − recurring − one-off: principal is never counted twice); Hold at 0% interest and 0% price change keeps its starting equity;
     the new loan's instalment is the cost card's; cash, CPF and equity add up to the position; differences from Hold are the ledgers'
   5 explicit incomplete states: Sell with no housing; recurring costs given for some homes or missing when a choice rents; no lender; no CPF refund;
     a new launch next (unsupported); cash short (stop, no end figure); a repayment below the interest (stop)
   6 nothing existing changes: gw-calc.js, gw-engine.js and every page byte-identical to live; no page loads the new files; no formula, rate or
     arithmetic in the engine blocks (static scan); GW_CALC's existing functions give the same answers with the primitives added
   Run from the site folder: node tools/financial-tests/hsu-tests.js */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const H = require('./harness.js')(process.argv[2]);
const { R, C, T, A, S } = H, root = H.root;
const BASE = require(path.join(root, 'tools/hdb-upgrade/rules.js'));
const ASM = require(path.join(root, 'tools/hdb-upgrade/assumptions.js'));
const F = require(path.join(root, 'assets/js/gw-fin3-core.js'))(R, C, T, A, S);
const BUF = require(path.join(root, 'assets/js/gw-cpfbuf.js'))(R, C);
const E = require(path.join(root, 'assets/js/gw-engine.js'))(R, C, T, A, S, F, BUF);
const P = require(path.join(root, 'assets/js/gw-calc-position.js'))(C, R, ASM);
const CX = Object.assign({}, C, P);
const X = require(path.join(root, 'assets/js/gw-engine-position.js'))(R, CX, ASM, E);
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; if (fail < 25) console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 600)); } };
const near = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
let seed = 20261106; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (x) => x[Math.floor(rnd() * x.length)];
const closed = (L, r, n, m) => { const i = r / 1200; if (i === 0) return L - L / n * m; const P0 = L * i / (1 - Math.pow(1 + i, -n)); return L * Math.pow(1 + i, m) - P0 * (Math.pow(1 + i, m) - 1) / i; };

/* ---------- 1 loanAt ---------- */
{
  let same = 0, n5 = 0, cf = 0, ident = 0, N = 2000;
  for (let k = 0; k < N; k++) {
    const i = { loan: Math.round(100000 + rnd() * 2400000), ratePct: Math.round(rnd() * 800) / 100, years: 11 + Math.floor(rnd() * 24) };
    const m = C.mortgage(i), a5 = P.loanAt(i, 5), a10 = P.loanAt(i, 10);
    if (m.ok && a5.ok && a10.ok && a5.balance === m.balanceAfter[5] && a10.balance === m.balanceAfter[10] && a5.monthly === m.monthly) same++;
    n5++;
    const mo = 1 + Math.floor(rnd() * (i.years * 12 - 1)), at = P.loanAt(i, mo / 12);
    if (near(at.balance, closed(i.loan, i.ratePct, i.years * 12, mo), i.loan * 1e-9)) cf++;   // floating-point only: under 1 cent on $10m
    if (near(at.paid, at.principal + at.interest, 1e-6) && near(at.paid, at.monthly * mo, 1e-4) && near(at.principal, i.loan - at.balance, 1e-6)) ident++;
  }
  ok(same === n5, 'loanAt: balance after 5 and 10 years and the instalment equal GW_CALC.mortgage exactly (' + same + ' / ' + n5 + ')');
  ok(cf === N, 'loanAt: the closed-form annuity balance at a random month, to a billionth of the loan (' + cf + ' / ' + N + ')');
  ok(ident === N, 'loanAt: payments = principal + interest = instalment × months (' + ident + ' / ' + N + ')');
  const end = P.loanAt({ loan: 500000, ratePct: 3, years: 10 }, 10), past = P.loanAt({ loan: 500000, ratePct: 3, years: 10 }, 12);
  ok(end.balance === 0 && past.balance === 0 && past.paidMonths === 120 && near(past.paid, end.paid, 1e-6), 'loanAt: nothing owed at or after the term; no payments after it');
  const z = P.loanAt({ loan: 120000, ratePct: 0, years: 10 }, 5);
  ok(near(z.balance, 60000, 1e-6) && z.interest === 0, 'loanAt: 0% interest is straight-line');
  ok(P.loanAt({ loan: 1e5, years: 10 }, 5).missing.join() === 'ratePct' && P.loanAt({ loan: -1, ratePct: 3, years: 10 }, 5).invalid.length === 1 && P.loanAt({ loan: 1e5, ratePct: 3, years: 10 }, -1).invalid[0].field === 'period', 'loanAt: missing and invalid inputs said, never guessed');
}

/* ---------- 2 loanFrom ---------- */
{
  let rt = 0, terms = 0, last = 0, N = 1000;
  for (let k = 0; k < N; k++) {
    const i = { loan: Math.round(100000 + rnd() * 1500000), ratePct: Math.round(50 + rnd() * 600) / 100, years: 10 + Math.floor(rnd() * 20) };
    const start = 1 + Math.floor(rnd() * 60), a = P.loanAt(i, start / 12), y = 1 + Math.floor(rnd() * 5);
    const f = P.loanFrom({ balance: a.balance, monthly: a.monthly, ratePct: i.ratePct }, y), b = P.loanAt(i, (start + y * 12) / 12);
    if (f.ok && near(f.balance, b.balance, 1e-6 * i.loan) && near(f.interest, b.interest - a.interest, 1e-6 * i.loan)) rt++;
    const left = i.years * 12 - start; if (f.ok && Math.abs(f.term - left) <= 1) terms++;
    const all = P.loanFrom({ balance: a.balance, monthly: a.monthly, ratePct: i.ratePct }, 40);
    if (all.ok && all.balance === 0 && all.lastPayment <= a.monthly + 1e-9 && near(all.paid, a.balance + all.interest, 1e-6 * i.loan)) last++;
  }
  ok(rt === N, 'loanFrom: a loan picked up part-way runs on exactly as loanAt (' + rt + ' / ' + N + ')');
  ok(terms === N, 'loanFrom: the months left are the original term’s (' + terms + ' / ' + N + ')');
  ok(last === N, 'loanFrom: run to the end, the last payment is only what is owed; paid = balance + interest (' + last + ' / ' + N + ')');
  const nv = P.loanFrom({ balance: 500000, monthly: 1000, ratePct: 3 }, 5);
  ok(nv.ok && nv.state === 'never' && nv.balance === null, 'loanFrom: a repayment below the interest is said (never), not stretched', nv);
  const h = P.loanFrom({ balance: 200000, monthly: 1200, lender: 'hdb' }, 5), b = P.loanFrom({ balance: 200000, monthly: 1200, lender: 'bank' }, 5);
  ok(h.ratePct === R.hdbLoanRate * 100 && h.rateBasis === 'rule' && h.rateValidUntil === R.ratesValidUntil && b.ratePct === ASM.planningRate * 100 && b.rateBasis === 'convention', 'loanFrom: by lender, GW_RULES’ HDB rate (dated) or the planning rate, said with its basis', [h.ratePct, b.ratePct]);
  ok(P.loanFrom({ balance: 200000, monthly: 1200 }, 5).missing.join() === 'ratePct' && P.loanFrom({ balance: 0, ratePct: 3 }, 5).state === 'repaid' && P.loanFrom({ balance: 2e5, monthly: 1200, ratePct: 3 }, 0).balance === 2e5, 'loanFrom: no rate and no lender: asked; nothing owed: repaid; a period of 0: today’s balance');
}

/* ---------- 3 valueAt, ledger, breakEven ---------- */
{
  ok(P.valueAt(1234567, 0, 5).value === 1234567 && near(P.valueAt(1e6, 2, 5).value, 1e6 * Math.pow(1.02, 5), 1e-6) && near(P.valueAt(1e6, -3, 5).value, 1e6 * Math.pow(0.97, 5), 1e-6), 'valueAt: 0% gives the price back; rises and falls compound alike');
  ok(P.valueAt(1e6, undefined, 5).missing.join() === 'pct' && P.valueAt(1e6, -100, 5).invalid.length === 1, 'valueAt: the change is always given (its default, 0, is the engine’s, said); −100% refused');
  const L = P.ledger({ years: 5, homes: [{ valueToday: 1e6, value: 1.1e6, loanToday: 4e5, loan: 3e5 }], cash: { in: [1e5, 2e5], out: [5e4] }, cpf: { in: [8e4], out: [3e4] }, paid: { instalments: 1.2e5, rentMonthly: 0, recurringMonthly: 300, oneOff: 1e4 } });
  ok(L.ok && L.equity === 8e5 && L.cash === 2.5e5 && L.cpf === 5e4 && L.paid.recurring === 18000 && L.paid.total === 148000 && L.position === 8e5 + 2.5e5 + 5e4 - 148000 && L.valueChange === 1e5 && L.notCash === true, 'ledger: one definition; equity, cash and CPF kept separate; monthly costs over the months', L);
  const M = P.ledger({ years: 5, homes: [], cash: { in: [5e5] }, cpf: { in: [1e5] }, paid: { instalments: 0, rentMonthly: 3000, recurringMonthly: 0, oneOff: 0 } }, L);
  ok(M.ok && M.paid.rent === 180000 && near(M.vs.position, M.position - L.position) && near(M.vs.cash, 2.5e5) && near(M.vs.equity, -8e5), 'ledger: differences from another ledger');
  ok(P.ledger({ years: 5, homes: [], cash: { in: [1] }, cpf: { in: [1] }, paid: { instalments: 0, rentMonthly: 0, recurringMonthly: undefined, oneOff: 0 } }).missing.join() === 'paid.recurringMonthly' && P.ledger({ years: 5, homes: [], cash: { in: [-1] }, cpf: { in: [1] }, paid: { instalments: 0, rentMonthly: 0, recurringMonthly: 0, oneOff: 0 } }).invalid.length === 1, 'ledger: a missing cost is asked for, never taken as nil; flows are amounts in or out');
  let be = 0, N = 500;
  for (let k = 0; k < N; k++) {
    const V = 8e5 + rnd() * 3e6, y = 1 + Math.floor(rnd() * 10), rest = -rnd() * 2e6, target = rest + V * (0.6 + rnd() * 1.2), b = P.breakEven({ target: target, rest: rest, value: V, years: y });
    if (b.ok && near(V * Math.pow(1 + b.pct / 100, y) + rest, target, 1e-6 * V)) be++;
  }
  ok(be === N, 'breakEven: the change found, put back, reaches the target exactly (' + be + ' / ' + N + ')');
  ok(P.breakEven({ target: 1e5, rest: 2e5, value: 1e6, years: 5 }).state === 'ahead' && P.breakEven({ target: 4e6, rest: 0, value: 1e6, years: 5 }).state === 'beyond', 'breakEven: ahead at any price; beyond ±20% a year is marked, not shown as a figure');
}

/* ---------- 4 compare on seeded households ---------- */
function household() {
  const two = rnd() < 0.6, hdb = rnd() < 0.6, price = Math.round((hdb ? 450000 + rnd() * 600000 : 900000 + rnd() * 1600000) / 1000) * 1000;
  const loanOwed = rnd() < 0.15 ? 0 : Math.round(rnd() * price * 0.5 / 1000) * 1000, lender = hdb && rnd() < 0.6 ? 'hdb' : 'bank';
  const rate = lender === 'hdb' ? 2.6 : 2 + rnd() * 2, minMo = loanOwed * rate / 1200 * 1.15, mo = loanOwed ? Math.round(minMo + rnd() * 3000) : 0;
  const people = [{ age: 30 + Math.floor(rnd() * 22), res: pick(['SC', 'SC', 'SC', 'PR']), income: { fixed: Math.round(4000 + rnd() * 16000) } }];
  if (two) people.push({ age: 30 + Math.floor(rnd() * 22), res: 'SC', income: { fixed: Math.round(rnd() * 12000) } });
  const owned = { id: 'home', type: hdb ? 'hdb' : 'private', owners: two ? [0, 1] : [0], intent: 'keep', sale: { price: price, loan: loanOwed, cpfRefund: Math.round(rnd() * (price - loanOwed) * 0.6) } };
  if (hdb) owned.mop = { category: 'standard', completed: '2016-0' + (1 + (price % 9)) };   // past its MOP by the asOf month below (P3)
  if (!hdb) { owned.sale.bought = (2015 + Math.floor(rnd() * 11)) + '-0' + (1 + Math.floor(rnd() * 9)) + '-15'; owned.sale.sold = '2026-11-06'; }   // some within SSD
  if (loanOwed) { owned.loan = { monthly: mo }; if (rnd() < 0.5) owned.loan.ratePct = Math.round(rate * 100) / 100; else owned.loan.lender = lender; }
  const c = { schema: 'gw-case-v1', people: people, household: { cash: Math.round(rnd() * 400000), cpf: Math.round(rnd() * 250000) }, otherLoans: rnd() < 0.2 ? [{ person: 0, monthly: Math.round(rnd() * 1200) }] : [], owned: [owned],
    purchase: { type: 'completed', price: Math.round((price * (1.2 + rnd() * 1.5)) / 1000) * 1000 }, financing: {} };
  if (two) c.household.couple = true;
  const o = { asOf: '2026-11', years: pick([1, 5, 10]), pct: { current: pick([0, 0, 2, -1.5]), next: pick([0, 0, 3, -2]) }, sell: pick([{ housing: 'rent', rent: 2500 + Math.round(rnd() * 3000) }, { housing: 'none' }, { housing: 'buy', price: Math.round(price * 0.8 / 1000) * 1000 }]) };
  if (rnd() < 0.5) { owned.monthlyCosts = Math.round(100 + rnd() * 400); c.purchase.monthlyCosts = Math.round(200 + rnd() * 600); o.sell.monthlyCosts = Math.round(150 + rnd() * 400); }
  if (rnd() < 0.3) o.oneOff = { upgrade: Math.round(rnd() * 80000), sell: Math.round(rnd() * 20000), hold: Math.round(rnd() * 10000) };
  if (rnd() < 0.3) o.purchaseCosts = Math.round(rnd() * 9000);
  return { c: c, o: o };
}
const startOf = (x, ch) => { const s = x.today && x.today.sale; return ch === 'hold' ? null : s; };
{
  let n = 0, ident = 0, sep = 0, mon = 0, vs = 0, be = 0, beN = 0, ends = 0, comparable = 0, today = 0;
  const seen = { stop: 0, incomplete: 0 };
  for (let k = 0; k < 300; k++) {
    const { c, o } = household(), r = X.compare(c, o), hh = c.household, h = c.owned[0], V0 = h.sale.price, B0 = h.sale.loan;
    const S0 = V0 - B0 + hh.cash + hh.cpf;   // the household's starting equity: the same for every choice
    if (r.comparable) comparable++;
    ['hold', 'sell', 'upgrade'].forEach((ch) => {
      const x = r.choices[ch]; if (x.status !== 'ok') { seen[x.status] = (seen[x.status] || 0) + 1; return; }
      if (!x.end) return; n++; ends++;
      const e = x.end, co = x.costs, sc = co.sale ? co.sale.costs + co.sale.penalty : 0;
      // principal repayment identity: the position is the starting equity, plus the value change, less what was spent for housing that is not principal
      const want = S0 + e.valueChange - sc - (co.duty || 0) - (co.purchaseCosts || 0) - co.interest - e.paid.rent - e.paid.recurring - e.paid.oneOff;
      if (near(e.position, want, 1e-6 * Math.max(1, Math.abs(S0)))) ident++; else if (ident > n - 3) console.log('identity', ch, e.position, want, JSON.stringify(co));
      if (near(e.equity + e.cash + e.cpf - e.paid.total, e.position, 1e-6) && e.notCash === true) sep++;
      if (ch !== 'hold' && x.homes.length && near(x.monthly.instalment, x.monthly.instalmentFromLoan, 0.005)) mon++; else if (ch === 'hold' || !x.homes.length) mon++;
      if (x.today && near(x.today.cash + x.today.cpf, ch === 'hold' ? hh.cash + hh.cpf : hh.cash + hh.cpf + x.today.sale.total - (x.today.purchase ? x.today.purchase.price - x.today.purchase.loan + x.today.purchase.duty + x.today.purchase.purchaseCosts : 0), 1e-6 * S0 + 1e-6)) today++;
    });
    if (r.comparable) Object.keys(r.vsHold).forEach((ch) => { if (near(r.vsHold[ch].position, r.choices[ch].end.position - r.choices.hold.end.position, 1e-6)) vs++; else console.log('vs', ch); });
    // break-even substituted back: the upgrade's position at that price change equals Hold's
    if (r.comparable && r.breakEven.upgrade && r.breakEven.upgrade.state !== 'ahead') {
      beN++; const r2 = X.compare(c, Object.assign({}, o, { pct: { current: o.pct.current, next: r.breakEven.upgrade.pct } }));
      if (r2.choices.upgrade.end && near(r2.choices.upgrade.end.position, r.choices.hold.end.position, 0.01)) be++;
    }
  }
  ok(ident === n && n > 300, 'the principal-repayment identity holds in every choice (' + ident + ' / ' + n + ' end figures)');
  ok(sep === n, 'equity + cash + CPF − paid = position; the position is marked not cash (' + sep + ' / ' + n + ')');
  ok(mon === n, 'the new loan’s instalment over the period is the cost card’s, to the cent (' + mon + ' / ' + n + ')');
  ok(today === n, 'today: cash + CPF left = the household’s + the sale’s total − the purchase’s down payment, duty and costs (' + today + ' / ' + n + ')');
  ok(comparable > 100 && vs > 100, 'differences from Hold are the ledgers’ (' + vs + ' over ' + comparable + ' comparable households)');
  ok(beN > 50 && be === beN, 'break-even put back into the engine: Upgrade’s position equals Hold’s to the cent (' + be + ' / ' + beN + ')');
  ok(seen.stop > 0, 'some households cannot upgrade at these figures (stop, no end figure): ' + seen.stop);
  // Hold at 0% interest, no price change, no costs: the starting equity stands
  const c0 = { schema: 'gw-case-v1', people: [{ age: 40, res: 'SC', income: { fixed: 8000 } }], household: { cash: 50000, cpf: 30000 }, otherLoans: [], owned: [{ id: 'h', type: 'hdb', owners: [0], intent: 'keep', loan: { monthly: 1000, ratePct: 0 }, sale: { price: 600000, loan: 120000, cpfRefund: 100000 } }], purchase: { type: 'completed', price: 1e6 }, financing: {} };
  const r0 = X.compare(c0, { years: 5 });
  ok(r0.choices.hold.end && r0.choices.hold.end.position === 600000 - 120000 + 50000 + 30000 && r0.choices.hold.end.loans === 60000, 'Hold at 0% interest and 0% price change keeps its starting equity exactly; the loan falls by the repayments', r0.choices.hold.end);
}

/* ---------- 5 explicit incomplete states ---------- */
{
  const base = () => ({ schema: 'gw-case-v1', people: [{ age: 40, res: 'SC', income: { fixed: 9000 } }, { age: 38, res: 'SC', income: { fixed: 7000 } }], household: { cash: 150000, cpf: 80000, couple: true }, otherLoans: [],
    owned: [{ id: 'flat', type: 'hdb', owners: [0, 1], intent: 'keep', loan: { monthly: 1200, lender: 'hdb' }, mop: { met: true }, sale: { price: 700000, loan: 150000, cpfRefund: 260000 } }], purchase: { type: 'completed', price: 1800000 }, financing: {} });
  let r = X.compare(base(), {});
  ok(r.choices.sell.status === 'incomplete' && r.choices.sell.reason === 'housing' && !r.choices.sell.end && r.choices.sell.today && r.choices.sell.today.cash > 0 && !r.vsHold.sell && r.comparable, 'Sell without where you’d live: today’s figures only, no end figure, left out of the comparison (Hold and Upgrade still compared)');
  ok(r.excluded.some((x) => x.key === 'recurring') && r.excluded.some((x) => x.key === 'returns') && r.choices.hold.excluded.indexOf('recurring') >= 0, 'recurring costs given for no home: excluded for every home, and said; 0% returns said');
  r = X.compare(base(), { sell: { housing: 'rent', rent: 3500 } });
  ok(!r.comparable && r.status === 'incomplete' && r.missing.map((m) => m.field).sort().join() === 'owned[0].monthlyCosts,purchase.monthlyCosts' && !r.choices.hold.end && r.choices.sell.end, 'renting compared: recurring costs required for every home held (no misleading comparison until given)', r.missing);
  const b2 = base(); b2.owned[0].monthlyCosts = 90; b2.purchase.monthlyCosts = 450;
  r = X.compare(b2, { sell: { housing: 'rent', rent: 3500 } });
  ok(r.comparable && r.status === 'ok' && r.choices.hold.end.paid.recurring === 90 * 60 && r.vsHold.sell && r.vsHold.upgrade, 'given for every home: all three compared, recurring costs over 60 months');
  const b3 = base(); b3.owned[0].monthlyCosts = 90;
  r = X.compare(b3, {});
  ok(!r.comparable && r.missing.map((m) => m.field).join() === 'purchase.monthlyCosts' && r.missing[0].why === 'given-for-some', 'given for some homes only: the comparison waits for the rest');
  const b4 = base(); delete b4.owned[0].loan.lender;
  ok(X.compare(b4, {}).choices.hold.missing.some((m) => m.field === 'owned[0].loan.lender'), 'a loan with no rate and no lender: asked (never assumed from the flat type)');
  const b5 = base(); delete b5.owned[0].sale.cpfRefund;
  r = X.compare(b5, { sell: { housing: 'none' } });
  ok(r.choices.sell.status === 'incomplete' && r.choices.sell.missing.some((m) => m.field === 'owned[0].sale.cpfRefund') && r.choices.upgrade.status === 'incomplete', 'no CPF refund: the sale is not split or counted, Sell and Upgrade wait');
  const b6 = base(); b6.purchase.type = 'new';
  ok(X.compare(b6, {}).choices.upgrade.status === 'unsupported', 'a new launch next: unsupported in P1, said');
  const b7 = base(); b7.purchase.price = 6000000;
  r = X.compare(b7, {});
  ok(['stop'].indexOf(r.choices.upgrade.status) >= 0 && !r.choices.upgrade.end && r.choices.upgrade.checks && (r.choices.upgrade.reason === 'cash-short' || r.choices.upgrade.reason === 'cpf-short'), 'cash short: stop, the shortfall said, no end figure', r.choices.upgrade.reason);
  const b8 = base(); b8.owned[0].loan = { monthly: 200, ratePct: 3 };
  ok(X.compare(b8, {}).choices.hold.status === 'stop' && X.compare(b8, {}).choices.hold.reason === 'repayment-below-interest', 'a repayment below the interest: stop, said');
  const b9 = base(); delete b9.people[0].income;
  ok(X.compare(b9, {}).choices.upgrade.missing.some((m) => m.field === 'people[0].income'), 'a purchase needs the borrowers’ incomes (the cost card would otherwise lend the loan limit, not what income supports)');
  ok(X.compare(base(), { years: 0 }).status === 'invalid' && X.compare(base(), { years: 11 }).status === 'invalid', 'the period: 1 to 10 years');
  const r5 = X.compare(base(), {});
  ok(r5.assumptions.find((a) => a.key === 'years').value === 5 && r5.assumptions.find((a) => a.key === 'pct.current').value === 0 && r5.assumptions.find((a) => a.key === 'pct.next').value === 0 && r5.assumptions.find((a) => a.key === 'purchaseCosts').value === 5000 && r5.assumptions.find((a) => a.key === 'returns').value === 0, 'defaults said: 5 years, 0% price change for each home, the $5,000 purchase-cost estimate, 0% returns');
  ok(r5.choices.sell.assumptions.some((a) => a.key === 'owned[0].mop' && a.value === 'met' && a.basis === 'owner' && a.checked === R.hdbMop.checked) && !r5.choices.sell.provisional.some((p) => p.key === 'owned[0].mop'), 'an HDB flat past its MOP (the owner says so): sold, and the rule’s check date said (P3; no provisional note any more)');
  // P3: the HDB minimum occupation period (GW_RULES.hdbMop, GW_CALC.mopEnd)
  const bm = (mop) => { const b = base(); if (mop === undefined) delete b.owned[0].mop; else b.owned[0].mop = mop; return b; };
  r = X.compare(bm(undefined), { sell: { housing: 'none' } });
  ok(['sell', 'upgrade'].every((k) => r.choices[k].status === 'incomplete' && r.choices[k].missing.some((m) => m.field === 'owned[0].mop')) && r.choices.hold.end, 'an HDB flat with no MOP answer: Sell and Upgrade ask for it; Hold is unaffected');
  r = X.compare(bm({ category: 'standard', completed: '2023-02' }), { asOf: '2026-11', sell: { housing: 'none' } });
  ok(['sell', 'upgrade'].every((k) => r.choices[k].status === 'stop' && r.choices[k].reason === 'within-mop' && r.choices[k].mop.endsIn === '2028-02' && r.choices[k].mop.monthsLeft === 16 && !r.choices[k].end) && r.choices.hold.end && !r.comparable, 'within the MOP (Standard, completed Feb 2023): Sell and Upgrade stop, “ends Feb 2028, 16 months”; nothing is compared with a sale that cannot happen', r.choices.sell.mop);
  ok(/appeal/.test(r.choices.sell.mop.earlySale), 'within the MOP: an earlier sale needs HDB’s approval on appeal, said, not assessed');
  const at = (mop, asOf) => X.compare(bm(mop), { asOf: asOf, sell: { housing: 'none' } }).choices.sell;
  ok(at({ category: 'standard', completed: '2021-11' }, '2026-11').status === 'stop' && at({ category: 'standard', completed: '2021-11' }, '2026-12').status === 'ok', 'months only: the MOP ending in Nov 2026 counts as met from Dec 2026, never before its date');
  ok(at({ category: 'plus', completed: '2017-01' }, '2026-11').mop.endsIn === '2027-01' && at({ category: 'prime', completed: '2014-06' }, '2026-11').status === 'ok' && at({ category: 'freshStart', completed: '2010-01' }, '2026-11').mop.endsIn === '2030-01', 'Plus and Prime 10 years, Fresh Start 20 (from GW_RULES.hdbMop)');
  ok(at({ category: 'standard', completed: '2021-01', notCountedMonths: 12 }, '2026-11').mop.endsIn === '2027-01', 'months the whole flat was rented out with HDB’s approval are added (not counted)');
  ok(at({ category: 'standard', completed: '2016-01' }, undefined).missing.some((m) => m.field === 'asOf') && at({ category: 'deluxe', completed: '2016-01' }, '2026-11').status === 'invalid' && at({ category: 'standard', completed: '2027-01' }, '2026-11').status === 'invalid', 'today’s month is required (never assumed); an unknown category or a completion after today is invalid');
  ok(P.mopEnd({ category: 'standard', completed: '2016-01' }, '2026-11').years === R.hdbMop.years.standard && R.hdbMop.years.standard === BASE.mopYears, 'Standard’s 5 years is read from the planner’s rule, not copied');
  const priv = base(); priv.owned[0].type = 'private'; delete priv.owned[0].mop; priv.owned[0].sale.bought = '2015-01-15'; priv.owned[0].sale.sold = '2026-11-06';
  ok(!X.compare(priv, { sell: { housing: 'none' } }).choices.sell.missing.some((m) => /mop/.test(m.field)), 'a private home: no MOP asked');
  ok(r5.choices.hold.assumptions.some((a) => a.key === 'owned[0].loan.ratePct' && a.basis === 'rule' && a.validUntil === R.ratesValidUntil), 'the HDB loan rate used for Hold is the dated rule, said with its validity date');
  const two = base(); two.owned.push({ id: 'b', type: 'private', owners: [0], intent: 'keep' });
  ok(X.compare(two, {}).status === 'unsupported', 'two homes owned: unsupported in P1');
}

/* ---------- 6 nothing existing changes ---------- */
{
  let changed = null; try { changed = cp.execSync('git diff --name-status origin/main', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean); } catch (e) { /* outside a checkout */ }
  // P2/P3 (6 Nov 2026): GW_CALC's and GW_ENGINE's own files and Plan My Move V2 stay untouched; a page may change only in its version tags
  // P4 (7 Nov 2026): gw-pmm.js gains only the Hold, sell or upgrade? link for owners and its handoff (Plan My Move's own tests and pmm-render show V2 unchanged)
  if (changed) ok(!changed.some((l) => /^[MD]\tassets\/js\/(gw-calc|gw-engine)\.js$/.test(l)), 'gw-calc.js and gw-engine.js are not modified', changed);
  if (changed) {
    // V1.1: HSU's own pages and the Calculators page (its new card) are checked by hsu-render.py; every other page may change only in its version tags
    const pagesChanged = changed.filter((l) => /^M\t.*\.html$/.test(l)).map((l) => l.slice(2)).filter((f) => ['tools/index.html', 'journey/compare/index.html', 'tools/hold-sell-upgrade/index.html'].indexOf(f) < 0), tagless = (s) => s.replace(/\?v=[0-9A-Za-z._-]+/g, '?v=').replace(/HDB’s rate is [^(<]*\(CPF Board\)\./g, 'HDB-RATE').replace(/ Own a home\? <a href="\.\.\/journey\/compare\/" data-tool="hold-sell-upgrade">Compare holding, selling and upgrading<\/a>\./, '');   // P4: the Calculators page's one added link   // the quarterly rate sentence (rules-source-tests checks it)
    const other = pagesChanged.filter((f) => tagless(fs.readFileSync(path.join(root, f), 'utf8')) !== tagless(cp.execSync('git show origin/main:' + f, { cwd: root, encoding: 'utf8' })));
    ok(other.length === 0, 'every page changed differs from live only in its version tags, and the Mortgage page in its quarterly rate sentence (' + pagesChanged.length + ' pages)', other);
  }
  const pages = cp.execSync('git ls-files "*.html"', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  // P4 (7 Nov 2026): the Hold, sell or upgrade? page is the one page that loads them
  ok(pages.filter((f) => /gw-calc-position|gw-engine-position/.test(fs.readFileSync(path.join(root, f), 'utf8'))).sort().join() === 'journey/compare/index.html,tools/hold-sell-upgrade/index.html', 'only the Hold, Sell or Upgrade? pages (journey/compare/, tools/hold-sell-upgrade/) load the position primitives and blocks');
  // the engine blocks: no formula, rate or arithmetic (strings, regexes and comments out)
  const src = fs.readFileSync(path.join(root, 'assets/js/gw-engine-position.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/\/\^[^/\n]*\/[a-z]*/g, 'RX').replace(/\/[^/\n*]+\/\.test/g, 'RX.test');
  ok(!/[^=!<>]\s[*\/]\s|\bMath\.|\*\*/.test(code), 'no multiplication, division or Math in the engine blocks');
  ok(!/[\w\])]\s*-\s*[\w(]/.test(code.replace(/=>/g, '')), 'no subtraction in the engine blocks (the ledger does the sums)');
  const lits = (code.match(/(?<![\w.$])\d+(?:\.\d+)?(?![\w])/g) || []).filter((x) => ['0', '1', '2', '5', '10'].indexOf(x) < 0);
  ok(!lits.length, 'no rate, band or limit in the engine blocks (only the approved period 1–5–10, nil, and two choices to compare)', lits);
  // GW_CALC's existing functions answer exactly as before with the primitives added (the browser adds them to the same object)
  const before = JSON.stringify([C.mortgage({ loan: 1e6, ratePct: 4, years: 25 }), C.stampDuty({ price: 2e6, buyers: [{ res: 'SC', owned: 1 }] }), C.saleProceeds({ type: 'hdb', price: 7e5, loan: 1.5e5, cpfPrincipal: 2.6e5, cpfInterest: 0 })]);
  global.GW_CALC = C; Object.assign(C, P);
  const after = JSON.stringify([C.mortgage({ loan: 1e6, ratePct: 4, years: 25 }), C.stampDuty({ price: 2e6, buyers: [{ res: 'SC', owned: 1 }] }), C.saleProceeds({ type: 'hdb', price: 7e5, loan: 1.5e5, cpfPrincipal: 2.6e5, cpfInterest: 0 })]);
  ok(before === after && Object.keys(P).every((k) => C[k] === P[k]), 'GW_CALC with the primitives added: its existing functions give the same answers; only new names are added');
}
console.log('hsu-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
