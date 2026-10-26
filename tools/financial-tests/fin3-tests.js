'use strict';
/* Financial Experience V3 (25 Oct 2026): GW_FIN3 adds no rule, so every figure it gives must equal the audited engine's for the same case, and the few
   questions it asks must map onto the engines' inputs exactly. Hand-worked figures where a rule is simple enough to check by hand.
   Run: node tools/financial-tests/fin3-tests.js */
const H = require('./harness.js')(process.argv[2]);
const { R, C, T, A, S } = H;
const F = require(H.root + '/assets/js/gw-fin3-core.js')(R, C, T, A, S);
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1 : tol);
const AF = (r, n) => (1 - Math.pow(1 + r / 12, -n * 12)) / (r / 12);

// ---- journey 1: one borrower, how much can I borrow ----
{
  const st = { n: 1, p: [{ age: 35, fixed: 8000 }], loans: [] };
  const b = F.borrow(st), e = C.tdsr({ kind: 'private', borrowers: [{ age: 35, fixed: 8000, variable: 0 }], debts: 0, loans: 0 });
  ok(b.state === 'ok' && near(b.maxLoan, e.maxLoan, 0.01), '1: equals GW_CALC.tdsr', [b.maxLoan, e.maxLoan]);
  ok(near(b.maxLoan, 0.55 * 8000 * AF(0.04, 30), 1), '1: 55% of $8,000 at 4% over 30 years (hand)', b.maxLoan);
  ok(b.years === 30 && near(b.monthly, C.instal(b.maxLoan, 0.04, 30), 0.01), '1: monthly at 4% over 30 years');
  ok(F.borrow({ n: 1, p: [{ age: 35 }], loans: [] }).state === 'need', '1: no income yet: nothing is invented, the income is asked');
  ok(F.borrow({ n: 1, p: [{ age: 35, fixed: 0 }], loans: [] }).state === 'zero' && F.borrow({ n: 1, p: [{ age: 35, fixed: 0 }], loans: [] }).maxLoan === 0, '1: $0 income is an answer: $0');
  const pl = F.priceLoan(b, 1500000);
  ok(near(pl.loan, Math.min(b.maxLoan, 1125000)) && pl.by === 'income', '1: on $1.5m the loan is the lower of capacity and 75% of the price', pl);
}
// ---- journey 2: a couple, individual incomes and loans ----
{
  const st = { n: 2, p: [{ age: 36, fixed: 8000, variable: 1000 }, { age: 33, fixed: 6000 }], loans: [{ type: 'car', who: 0, amt: 600 }, { type: 'other', who: 1, amt: 300 }] };
  const b = F.borrow(st), bs = [{ age: 36, fixed: 8000, variable: 1000 }, { age: 33, fixed: 6000, variable: 0 }];
  const e = C.tdsr({ kind: 'private', borrowers: bs, debts: 900, loans: 0 }), e0 = C.tdsr({ kind: 'private', borrowers: bs, debts: 0, loans: 0 });
  ok(b.state === 'ok' && near(b.maxLoan, e.maxLoan, 0.01), '2: equals GW_CALC.tdsr with both incomes and $900 of repayments', [b.maxLoan, e.maxLoan]);
  ok(near(b.debtsCut, e0.maxLoan - e.maxLoan, 0.01), '2: what the repayments cost is said', b.debtsCut);
  ok(b.joint && near(b.age, C.borrowers(bs).iwaaUse, 1e-9), '2: the joint age is the engine’s income-weighted age');
  ok(near(b.counted, 8000 + 700 + 6000, 0.01), '2: bonus counted at 70%', b.counted);
  const nb = F.borrow(Object.assign({}, st, { p: [st.p[0], Object.assign({ nb: true }, st.p[1])] }));
  const e1 = C.tdsr({ kind: 'private', borrowers: [bs[0]], debts: 600, loans: 0 });
  ok(near(nb.maxLoan, e1.maxLoan, 0.01), '2: a co-buyer who does not borrow: only the borrower’s income and loans count', [nb.maxLoan, e1.maxLoan]);
  const hl = F.borrow(Object.assign({}, st, { loans: [{ type: 'home', who: 1, amt: 1200 }] }));
  ok(hl.homeLoans === 1 && near(hl.ltv, 0.45, 1e-9), '2: either borrower’s home loan sets the loan limit at 45% (most restricted borrower)', [hl.homeLoans, hl.ltv]);
  const hdb = F.borrow(Object.assign({}, st, { bkind: 'hdb' })), eh = C.msr({ scenario: 'hdb-loan', household: 'family', borrowers: bs, propertyLoans: 0, otherDebts: 900 });
  ok(near(hdb.maxLoan, eh.maxLoan, 0.01) && hdb.binding === 'msr' && hdb.years === eh.tenure.years, '2: HDB loan: equals GW_CALC.msr (30% of income, HDB tenure)', [hdb.maxLoan, eh.maxLoan]);
  const ec = F.borrow(Object.assign({}, st, { bkind: 'ec' })), ee = C.msr({ scenario: 'ec', borrowers: bs, propertyLoans: 0, otherDebts: 900, loans: 0 });
  ok(near(ec.maxLoan, ee.maxLoan, 0.01), '2: new EC: equals GW_CALC.msr (MSR with TDSR)', [ec.maxLoan, ee.maxLoan]);
}
// ---- journey 3: affordability with cash, CPF and financing ----
{
  const st = { n: 1, p: [{ age: 35, fixed: 8000, res: 'SC' }], loans: [], cash: 150000, cpf: 100000, homes: 0, akind: 'new' };
  const a = F.afford(st), e = A.assess({ kind: 'new', buyers: [{ res: 'SC', owned: 0, age: 35, fixed: 8000 }], debts: 0, ratePct: 4, cash: 150000, cpf: 100000, home: 'none' });
  ok(a.state === 'ok' && a.budget === e.budget && a.limitedBy === e.limitedBy, '3: equals GW_ANSWER.assess (budget and limiting factor)', [a.budget, e.budget]);
  ok(near(a.borrow.max, e.borrow.max, 0.01), '3: borrowing capacity equals the engine’s');
  ok(F.afford(Object.assign({}, st, { cash: undefined, cpf: undefined })).state === 'income', '3: no cash or CPF yet: the borrowing capacity is shown, no budget is invented');
  const q = F.afford(Object.assign({}, st, { price: 1200000 }));
  ok(q.quote && q.quote.zone === 'over' && q.quote.gap > 0, '3: a price above the budget is said to be short, with the amount', q.quote && q.quote.gap);
  const pr = F.afford(Object.assign({}, st, { p: [{ age: 35, fixed: 8000, res: 'PR' }] }));
  ok(pr.state === 'ok' && pr.budget < a.budget, '3: a PR pays ABSD on a first home, so the budget is lower', [pr.budget, a.budget]);
  const fta = F.toAssess(Object.assign({}, st, { p: [{ age: 35, fixed: 8000, res: 'FTA' }] }));
  ok(fta.buyers[0].res === 'FR' && fta.buyers[0].fta === true, '3: an FTA national is a foreigner who pays as a Citizen');
}
// ---- journey 5 (afford): an HDB upgrader keeping or selling the flat ----
{
  const base = { n: 2, p: [{ age: 40, fixed: 9000, res: 'SC' }, { age: 38, fixed: 7000, res: 'SC' }], loans: [{ type: 'home', who: 0, amt: 1200 }], cash: 100000, cpf: 150000, homes: 1, whose: 'both', akind: 'new', cpfBal: [{ oa: 150000, sa: 100000 }, { oa: 100000, sa: 90000 }], cover95: true };
  const s = F.toAssess(Object.assign({}, base, { plan: 'keep' }));
  ok(s.home === 'keep' && s.homeJoint === true && s.flat.hasLoan === 'yes' && s.flat.instalment === 1200 && s.buyers[0].owned === 1 && s.buyers[1].owned === 1, '5: kept: owned by both, its home loan is the listed one', s);
  const keep = F.afford(Object.assign({}, base, { plan: 'keep' })), ek = A.assess(s);
  ok(keep.state === 'ok' && keep.budget === ek.budget, '5: kept: equals GW_ANSWER.assess', [keep.budget, ek.budget]);
  ok(keep.top.absd > 0, '5: kept: ABSD is paid on the new home (a second home)', keep.top.absd);
  const sold = F.afford(Object.assign({}, base, { plan: 'sell', sale: { type: 'hdb', price: 650000, loan: 150000, cpfRefund: 250000 } }));
  ok(sold.state === 'ok' && sold.saleCounted && sold.budget > keep.budget && sold.top.absd === 0, '5: sold first: proceeds counted, no ABSD, a higher budget', [sold.budget, keep.budget, sold.top.absd]);
  const noRef = F.afford(Object.assign({}, base, { plan: 'sell', sale: { type: 'hdb', price: 650000, loan: 150000 } }));
  ok(noRef.state === 'ok' && !noRef.saleCounted, '5: no CPF refund entered: the sale is not counted (nothing is estimated)');
  const paid = F.toAssess(Object.assign({}, base, { loans: [], plan: 'keep' }));
  ok(paid.flat.hasLoan === 'no', '5: no home-loan repayment listed: the home is taken as fully paid (and the page says so)');
}
// ---- journey 4: the payment schedule from type, price and date only ----
{
  const st = { n: 1, p: [{}], loans: [], homes: 0, pkind: 'new', price: 1800000, otp: '2026-11-02' };
  const s = F.schedule(st), e = S.schedule({ kind: 'new', price: 1800000, otp: '2026-11-02', buyers: [{ res: 'SC', owned: 0 }], dates: { mode: 'grouped' } });
  ok(s.ok && JSON.stringify(s.events) === JSON.stringify(e.events), '4: equals GW_SCHEDULE.schedule for a Citizen buying a first home');
  ok(s.events[0].amount === 90000, '4: first payment 5% = $90,000');
  ok(F.schedule(Object.assign({}, st, { otp: null })).need[0] === 'otp' && F.schedule(Object.assign({}, st, { otp: null, noDate: true })).ok, '4: no date: asked, or ticked “no date yet”');
  ok(!F.schedule(Object.assign({}, st, { price: null })).ok, '4: no price: nothing is drawn');
  const pr = F.schedule(Object.assign({}, st, { p: [{ res: 'PR' }] }));
  ok(pr.duty.absd > 0, '4: a PR buyer’s schedule carries ABSD', pr.duty.absd);
}
// ---- journey 5 (payments): buying first, selling after TOP; the default is "not decided" ----
{
  const st = { n: 1, p: [{ age: 40, fixed: 15000, res: 'SC' }], loans: [{ type: 'home', who: 0, amt: 1500 }], cash: 300000, cpf: 200000, homes: 1, pkind: 'new', price: 2000000, otp: '2026-11-02', order: 'buy', cpfBal: [{ oa: 300000, sa: 150000 }], cover95: true };
  const u = F.funding(st);
  ok(u.ok && u.r.saleUndecided === true && !u.r.events.some((e) => e.type === 'in'), '5: buy first defaults to not decided: no sale money');
  ok(near(u.r.loan.ltv, 0.45, 1e-9) && near(u.r.duty.absd, 0.2 * 2000000), '5: still owned: 45% loan limit and ABSD 20% up front', [u.r.loan.ltv, u.r.duty.absd]);
  ok(u.r.flatInstal === 1500, '5: the flat’s $1,500 instalment carries on');
  const t = F.funding(Object.assign({}, st, { saleWhen: 'afterKeys', saleAfter: 3, top: '2030-06-01', sale: { type: 'hdb', price: 700000, loan: 100000, cpfRefund: 250000 } }));
  ok(t.ok && t.r.saleDate === T.iso(T.addMonths(new Date('2030-06-01T00:00:00Z'), 3)), '5: after TOP: the sale completes 3 months after the keys', t.r.saleDate);
  const sale = t.r.events.filter((e) => e.id === 'sale')[0];
  ok(sale && sale.date === t.r.saleDate && sale.cashIn > 0 && sale.cpfIn > 0, '5: its proceeds arrive only on that date', sale);
  const est = C.saleEstimate({ type: 'hdb', price: 700000, loan: 100000, cpfRefund: 250000 }, { owner55: false, today: '2026-10-25' });
  ok(near(sale.cashIn, est.cash, 0.01) && near(sale.cpfIn, est.cpf, 0.01), '5: the proceeds are GW_CALC.saleEstimate’s', [sale.cashIn, est.cash]);
  const lim = C.tdsr({ kind: 'private', borrowers: [{ age: 40, fixed: 15000, variable: 0 }], debts: 1500, loans: 1, quotedRatePct: 4 });
  ok(near(Math.min(lim.maxLoan, 2000000 * 0.45), t.r.loan.loanMax, 1), '5: the loan is the lower of the 45% limit and what income supports with the flat’s instalment', [t.r.loan.loanMax, lim.maxLoan]);
  const nb = F.funding(Object.assign({}, st, { cpfBal: undefined, cover95: undefined }));
  ok(!nb.ok && nb.needCpf, '5: still owning a home with CPF planned: the balances behind the set-aside are asked, never assumed');
  const cut = F.funding(Object.assign({}, st, { cpfBal: [{ oa: 300000, sa: 100000 }], cover95: false }));
  const ck = C.cpfSecondHome({ year: 2026, cover95: false, members: [{ oa: 300000, sa: 100000, age: 40, subject: true }] });
  ok(cut.ok && near(cut.i.cpf, Math.min(200000, ck.usable), 0.01), '5: the CPF counted is the OA above the Full Retirement Sum (CPF Board)', [cut.i.cpf, ck.usable]);
  const sf = F.funding(Object.assign({}, st, { order: 'sell', sale: { type: 'hdb', price: 700000, loan: 100000, cpfRefund: 250000 } }));
  ok(sf.ok && sf.r.duty.absd === 0 && near(sf.r.loan.ltv, 0.75, 1e-9), '5: selling first: no ABSD and the 75% limit', [sf.r.duty.absd, sf.r.loan.ltv]);
}
// ---- the other property types on the payments page ----
{
  const base = { n: 1, p: [{ age: 35, fixed: 12000, res: 'SC' }], loans: [], cash: 400000, cpf: 300000, homes: 0, price: 1500000, otp: '2026-11-02', order: 'none' };
  const ec = F.funding(Object.assign({}, base, { pkind: 'ec' }));
  const m = C.msr({ scenario: 'ec', borrowers: [{ age: 35, fixed: 12000, variable: 0 }], propertyLoans: 0, otherDebts: 0, loans: 0, quotedRatePct: 4 });
  ok(ec.ok && near(ec.r.loan.loanMax, Math.min(1125000, m.maxLoan), 1), '6: new EC: the loan is held to MSR', [ec.r.loan.loanMax, m.maxLoan]);
  const rec = F.funding(Object.assign({}, base, { pkind: 'resaleec' }));
  const t2 = C.tdsr({ kind: 'private', borrowers: [{ age: 35, fixed: 12000, variable: 0 }], debts: 0, loans: 0, quotedRatePct: 4 });
  ok(rec.ok && rec.r.kind === 'completed' && near(rec.r.loan.loanMax, Math.min(1125000, t2.maxLoan), 1), '6: resale EC (bought after its minimum occupation period): TDSR only, paid like a completed home', [rec.r.loan.loanMax, t2.maxLoan]);
  const cp = F.funding(Object.assign({}, base, { pkind: 'completed' }));
  ok(cp.ok && cp.r.events.some((e) => e.id === 'completion'), '6: completed private home: option, exercise, stamp duty and completion');
}
// ---- What will this home cost me? (the payments page's answer) ----
{
  const st = { n: 1, p: [{}], loans: [], pkind: 'new', price: 2000000, loanAmt: 1500000, ratePct: 3, years: 30, cpf: 300000 };
  const c = F.cost(st);
  ok(c.state === 'ok' && c.loan === 1500000 && c.downCash === 200000 && c.duty === 69600 && c.cash === 269600 && c.cpfUsed === 300000, 'cost: $2m, $1.5m loan, $300k CPF: $200,000 cash + $69,600 stamp duty (hand)', c);
  ok(near(c.monthly, C.instal(1500000, 0.03, 30), 0.01) && Math.round(c.monthly) === 6324, 'cost: $6,324 a month at 3% over 30 years (hand)', c.monthly);
  ok(c.ageAssumed && !c.overLimit, 'cost: no age typed: the age-65 assumption is flagged, not hidden');
  const p = C.progressive({ price: 2000000, age: 35, years: 30, ratePct: 3, loans: 0, kind: 'private', buyers: F.dutyBuyers(st) });
  ok(near(c.ruleLoan, p.loanMax, 0.01) && near(c.duty, p.duty.total, 0.01), 'cost: the limit and stamp duty equal GW_CALC.progressive', [c.ruleLoan, p.loanMax]);
  const b = F.cost(Object.assign({}, st, { loanAmt: undefined, cpf: undefined }));
  ok(b.loan === 1500000 && b.cash === 500000 + 69600 && b.cpfUsed === 0, 'cost: blank loan = the most allowed (75%); no CPF: the down payment is all cash', b);
  const o = F.cost(Object.assign({}, st, { loanAmt: 1700000 }));
  ok(o.overLimit && o.loan === 1500000, 'cost: a loan above 75% is flagged and held to the limit', o);
  const c5 = F.cost(Object.assign({}, st, { cpf: 900000 }));
  ok(c5.cpfUsed === 400000 && c5.downCash === 100000 && c5.cpfLeft === 500000, 'cost: CPF covers at most the down payment above the 5% minimum cash', c5);
  const i = F.cost(Object.assign({}, st, { p: [{ age: 40, fixed: 6000 }], loanAmt: undefined }));
  const t = C.tdsr({ kind: 'private', borrowers: [{ age: 40, fixed: 6000, variable: 0 }], debts: 0, loans: 0, quotedRatePct: 3, years: i.years });
  ok(i.incomeCap !== null && i.loan < 1500000 && !i.ageAssumed, 'cost: with an income, a blank loan follows what the income supports', [i.loan, i.incomeCap, t.maxLoan]);
  const two = F.cost(Object.assign({}, st, { homes: 1 }));
  ok(two.absd === 400000 && two.cash === 269600 + 400000, 'cost: a Citizen who owns a home: ABSD 20% is added to the cash', two.absd);
  ok(F.cost({ pkind: 'new' }).state === 'need' && F.cost({ pkind: 'hdb', price: 600000 }).state === 'hdb', 'cost: no price yet: asked; HDB flat: routed to the HDB loan page');
}
// ---- FE V3.2: income needed (the borrowing calculation run backwards) and the borrowing page's assumed age ----
{
  const st = { n: 1, p: [{}], loans: [], pkind: 'new', price: 2000000, ratePct: 4, years: 30 };
  const c = F.cost(st), i = F.incomeNeeded(st, c);
  ok(i.state === 'ok' && near(i.income, 1500000 / AF(0.04, 30) / 0.55, 2), 'income needed: $1.5m at 4% over 30 years needs the instalment / 55% (hand)', i.income);
  const back = C.tdsr({ kind: 'private', borrowers: [{ age: 35, fixed: Math.ceil(i.income), variable: 0 }], debts: 0, loans: 0, quotedRatePct: 4, tenure: 30 });
  ok(back.maxLoan >= 1500000 - 1, 'income needed: that income borrows the loan with GW_CALC.tdsr (round trip)', back.maxLoan);
  const i3 = F.incomeNeeded(Object.assign({}, st, { ratePct: 3 }), F.cost(Object.assign({}, st, { ratePct: 3 })));
  ok(near(i3.income, i.income, 1), 'income needed: a 3% rate does not lower it, banks test at 4%');
  const ec = Object.assign({}, st, { pkind: 'ec' }), iec = F.incomeNeeded(ec, F.cost(ec));
  ok(iec.rule === 'msr' && iec.income > i.income * 1.5, 'income needed: a new EC is held to MSR (30%), so it needs more', iec.income);
  const wl = Object.assign({}, st, { loans: [{ type: 'car', who: 0, amt: 800 }] }), iw = F.incomeNeeded(wl, F.cost(wl));
  ok(near(iw.income, i.income + 800 / 0.55, 2), 'income needed: an $800 car loan adds $800 / 55%', iw.income - i.income);
  const b = F.borrow({ n: 1, p: [{ fixed: 8000 }], loans: [] }, { assumeAge: true }), b35 = F.borrow({ n: 1, p: [{ age: 35, fixed: 8000 }], loans: [] });
  ok(b.state === 'ok' && b.ageAssumed && near(b.maxLoan, b35.maxLoan, 0.01), 'borrow page: with no age, age 35 is assumed (and flagged); same as typing 35', [b.maxLoan, b35.maxLoan]);
  ok(F.borrow({ n: 1, p: [{ fixed: 8000 }], loans: [] }).state === 'need', 'other pages: no age is still asked, never assumed');
  const b43 = F.borrow({ n: 1, p: [{ age: 43, fixed: 8000 }], loans: [] });
  ok(b43.years === 22 && !b43.ageAssumed, 'a typed age is used as typed: 43 runs 22 years to 65', b43.years);
}
// ---- 26 Oct 2026: the income-weighted age of one borrower is the age itself, whatever bonus is typed (no floating-point year lost) ----
{
  const ten = (v) => C.tdsr({ kind: 'private', borrowers: [{ age: 48, fixed: 20000, variable: v }], debts: 0, loans: 0 }).tenure.years;
  ok([4166.67, 4167, 3333.33, 1234.56, 50000 / 12].every((v) => ten(v) === 17), 'age 48 with any bonus: the loan runs 17 years to 65', [4166.67, 4167, 3333.33].map(ten));
  const b = F.borrow({ n: 1, p: [{ age: 48, fixed: 20000, variable: 50000 / 12 }], loans: [] });
  ok(near(b.maxLoan, 1863437, 1) && b.years === 17, 'Ken’s case: $20,000 a month + $50,000 bonus a year, age 48: about $1.86M over 17 years', [b.maxLoan, b.years]);
  const s2 = F.borrow({ n: 1, p: [{ age: 48, fixed: 20000, variable: 50000 / 12 }], loans: [], years: 27 });
  ok(near(s2.maxLoan, 2494846, 1) && s2.ltv === 0.55 && s2.minCash === 0.1, '… stretched to age 75: about $2.49M at 55% of the price, 10% in cash', [s2.maxLoan, s2.ltv, s2.minCash]);
}
console.log('fin3-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
