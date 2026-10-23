'use strict';
/* Package 4: an optional valuation on a resale purchase. Checked against a SECOND calculation written here from the rules (R.valuation in gw-rules.js):
     - the loan limit, the minimum cash and the CPF part are on the LOWER of the price and the valuation;
     - the price above the valuation (cash over valuation, COV) is cash only: neither the loan nor CPF can cover it;
     - stamp duty (BSD, ABSD) is on the HIGHER of the price and the valuation;
     - a valuation never applies to a new launch, and never to the Planner's maximum budget (only to the buyer's own price).
   Engines under test: GW_CALC.progressive / msr, GW_TIMELINE.timeline, GW_ANSWER.assess, GW_VIEW.build.  Run: node tools/financial-tests/valuation-tests.js */
const H = require('./harness.js')(process.argv[2]);
const { R, C, T, A } = H, V = require('../../assets/js/gw-buyer-view.js');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1 : tol);

// ---- independent rules (first property, Singapore citizen, standard 75% / 5% limit) ----
const BANDS = [[180000, .01], [180000, .02], [640000, .03], [500000, .04], [1500000, .05], [Infinity, .06]];
function bsd(p) { let r = p, t = 0; for (const [w, rate] of BANDS) { const s = Math.min(r, w); t += s * rate; r -= s; if (r <= 0) break; } return Math.floor(t); }
function need(P, Vn) {   // what a first-property citizen needs on a completed home, loan at the 75% limit
  const base = Vn && Vn < P ? Vn : P, cov = P - base, dutyBase = Vn && Vn > P ? Vn : P;
  const loan = .75 * base, minCash = .05 * base, duty = bsd(dutyBase);
  return { base, cov, loan, minCash, duty, cashOnly: minCash + cov + duty, flex: base - loan - minCash, upfront: P - loan + duty };
}
const buyer = [{ res: 'SC', owned: 0 }];

// ---- 1. the engine's own split (GW_CALC.progressive) ----
for (const [P, Vn] of [[1500000, 1400000], [1500000, 1500000], [1500000, 1600000], [1200000, 1199000], [900000, 600000], [2500000, 2000000]]) {
  const x = need(P, Vn), p = C.progressive({ price: P, valuation: Vn, age: 35, years: 30, kind: 'private', buyers: buyer });
  const tag = '$' + P + ' / valuation $' + Vn + ': ';
  ok(p.ok, tag + 'answered');
  ok(near(p.loanMax, x.loan), tag + 'loan = 75% of the lower of price and valuation', [p.loanMax, x.loan]);
  ok(near(p.cashMin, x.minCash), tag + 'minimum cash = 5% of the lower', [p.cashMin, x.minCash]);
  ok(near(p.cov, x.cov), tag + 'cash over valuation = price above the valuation', [p.cov, x.cov]);
  ok(near(p.cpfOrCash, x.flex), tag + 'the cash-or-CPF part is on the lower value, so COV is not in it', [p.cpfOrCash, x.flex]);
  ok(near(p.duty.bsd, x.duty), tag + 'BSD is on the higher of price and valuation', [p.duty.bsd, x.duty]);
  ok(near(p.totals.loan + p.totals.cash + p.totals.flex, P), tag + 'the stages add up to the price', [p.totals]);
  ok(near(p.totals.cash, x.minCash + x.cov), tag + 'cash in the stages = minimum cash + COV', [p.totals.cash, x.minCash + x.cov]);
}
// no valuation, or one equal to the price: identical to before
{
  const a = C.progressive({ price: 1500000, age: 35, years: 30, kind: 'private', buyers: buyer }), b = C.progressive({ price: 1500000, valuation: 1500000, age: 35, years: 30, kind: 'private', buyers: buyer });
  ok(['loanMax', 'cashMin', 'cpfOrCash', 'cov'].every((k) => near(a[k], b[k])) && near(a.duty.total, b.duty.total), 'valuation equal to the price changes nothing');
  ok(a.cov === 0 && a.valuation === null, 'no valuation: no COV and valuation is null');
  const bad = C.progressive({ price: 1500000, valuation: -5, age: 35, years: 30, kind: 'private', buyers: buyer });
  ok(!bad.ok && bad.invalid && bad.invalid.some((e) => e.field === 'valuation'), 'a negative valuation is refused, not read as none');
  const zero = C.progressive({ price: 1500000, valuation: 0, age: 35, years: 30, kind: 'private', buyers: buyer });
  ok(zero.ok && zero.cov === 0 && zero.valuation === null, 'a valuation of 0 is read as not given');
}
// the lower LTV tier applies to the lower value as well (tenure over 30 years: 55% / 10%)
{
  const p = C.progressive({ price: 1500000, valuation: 1400000, age: 35, years: 33, kind: 'private', buyers: buyer });
  ok(p.lower && near(p.loanMax, .55 * 1400000) && near(p.cashMin, .10 * 1400000) && near(p.cov, 100000), 'lower tier (tenure over 30 years): 55% and 10% of the valuation', [p.loanMax, p.cashMin, p.cov]);
}
// a second housing loan (45% / 25%)
{
  const p = C.progressive({ price: 1500000, valuation: 1400000, age: 35, years: 30, loans: 1, kind: 'private', buyers: [{ res: 'SC', owned: 1 }] });
  ok(near(p.loanMax, .45 * 1400000) && near(p.cashMin, .25 * 1400000), 'one existing loan: 45% and 25% of the valuation', [p.loanMax, p.cashMin]);
}

// ---- 2. the Payment Timeline: completed home ----
const tlBase = { kind: 'completed', price: 1500000, otp: '2026-11-02', buyers: buyer, age: 35, years: 30, ratePct: 3, cash: 400000, cpf: 300000, order: 'none', dates: { mode: 'grouped' } };
{
  const r0 = T.timeline(tlBase), r1 = T.timeline(Object.assign({}, tlBase, { valuation: 1400000 })), x = need(1500000, 1400000);
  ok(r0.ok && r1.ok, 'timeline answered with and without a valuation');
  ok(near(r1.loan.loanMax, x.loan) && near(r1.loan.cov, 100000) && near(r1.loan.valuation, 1400000), 'timeline loan and COV from the valuation', r1.loan);
  const ev = (r, id) => r.events.filter((e) => e.id === id)[0];
  ok(near(ev(r1, 'option').amount, 15000) && near(ev(r1, 'exercise').amount, 60000), 'option fee and exercise payment stay on the price (1% and 4% of what is signed)');
  const comp = ev(r1, 'completion');
  ok(near(comp.bank, x.loan), 'the bank pays 75% of the valuation at completion', comp);
  ok(near(comp.cash + comp.flex + comp.bank, 1500000 - 15000 - 60000), 'completion pays the rest of the price', comp);
  ok(near(r1.totals.amount, 1500000 + x.duty), 'the payments total the price plus duty', r1.totals);
  ok(near(r1.totals.bank, x.loan), 'bank total is the loan on the lower value', r1.totals);
  // cash-only items are paid from cash: option + exercise cash part + completion cash + duty >= minimum cash + COV + duty
  const cashOnlyPaid = r1.events.filter((e) => e.type === 'pay').reduce((s, e) => s + e.cash, 0);
  ok(cashOnlyPaid + 1e-6 >= x.minCash + x.cov + x.duty - 5000, 'cash-only payments cover the minimum cash, the COV and the duty (the exercise payment may take some cash or CPF)', [cashOnlyPaid, x.minCash + x.cov + x.duty]);
  ok(r1.assumptions.some((a) => a.id === 'valuation'), 'the timeline says what the valuation did');
  ok(r0.loan.cov === 0 && !r0.assumptions.some((a) => /^valuation/.test(a.id)), 'no valuation: no valuation text');
  // CPF cannot pay the COV: with all cash in CPF, the COV is a shortfall even though the total money is enough
  const tight = T.timeline(Object.assign({}, tlBase, { valuation: 1400000, cash: 130000, cpf: 600000 }));
  const need0 = need(1500000, 1400000);
  ok(need0.cashOnly > 130000, 'precondition: the cash-only need exceeds the cash', need0);
  ok(tight.headline.peak > 0, 'plenty of CPF does not cover cash over valuation: a shortfall shows', tight.headline);
  const noVal = T.timeline(Object.assign({}, tlBase, { cash: 130000, cpf: 600000 }));
  ok(need(1500000).cashOnly <= 130000 ? noVal.headline.peak === 0 : true, 'the same money with no COV is covered', noVal.headline);
  // valuation above the price: the loan is on the price, the duty on the valuation
  const hi = T.timeline(Object.assign({}, tlBase, { valuation: 1600000 }));
  ok(near(hi.loan.loanMax, .75 * 1500000) && near(hi.duty.bsd, bsd(1600000)) && hi.assumptions.some((a) => a.id === 'valuation-high'), 'valuation above the price: loan on the price, duty on the valuation', [hi.loan.loanMax, hi.duty.bsd]);
  // a new launch has no valuation at purchase: it is ignored
  const nl = T.timeline(Object.assign({}, tlBase, { kind: 'new', valuation: 1000000 })), nl0 = T.timeline(Object.assign({}, tlBase, { kind: 'new' }));
  ok(nl.ok && near(nl.loan.loanMax, nl0.loan.loanMax) && near(nl.totals.cash, nl0.totals.cash) && nl.loan.cov === 0, 'a new launch ignores a valuation');
  // too large is refused like any amount
  const big = T.timeline(Object.assign({}, tlBase, { valuation: 1e12 }));
  ok(!big.ok && big.invalid && big.invalid.some((e) => e.field === 'valuation'), 'a valuation above the amount limit is refused');
}

// ---- 3. the Planner: one price, judged completely ----
const sc = (o) => Object.assign({ kind: 'completed', buyers: [{ res: 'SC', age: 35, fixed: 21000 }], ratePct: 3, years: 30, cash: 300000, cpf: 300000, home: 'none', price: 1500000 }, o || {});
{
  const a0 = A.assess(sc()), a1 = A.assess(sc({ valuation: 1400000 })), x = need(1500000, 1400000), y = need(1500000);
  ok(a0.state === 'ok' && a1.state === 'ok', 'planner answered');
  ok(a0.budget === a1.budget && a0.highest === a1.highest, 'the maximum budget does not use the valuation (it belongs to one price)', [a0.budget, a1.budget]);
  const at = a1.at;
  ok(near(at.loan, x.loan) && near(at.cov, 100000) && near(at.valuation, 1400000), 'the price’s loan and COV', [at.loan, at.cov]);
  ok(near(at.cashOnly, x.cashOnly), 'cash only = 5% of the valuation + COV + stamp duty', [at.cashOnly, x.cashOnly]);
  ok(near(at.flexNeed, x.flex), 'cash or CPF = the rest of the lower value', [at.flexNeed, x.flex]);
  ok(near(at.upfront, x.upfront), 'cash and CPF needed = price − loan + duty', [at.upfront, x.upfront]);
  ok(near(a0.at.upfront, y.upfront) && a0.at.cov === 0, 'without a valuation: as before', [a0.at.upfront]);
  ok(at.upfront > a0.at.upfront, 'a lower valuation needs more money than no valuation (the loan is smaller)', [at.upfront, a0.at.upfront]);
  // the verdict flips on cash that CPF cannot cover
  const s = (o) => A.assess(sc(Object.assign({ valuation: 1400000 }, o)));
  const enough = s({ cash: 215000, cpf: 280000 }), notCash = s({ cash: 200000, cpf: 295000 });   // total = upfront, but cash is below the cash-only need
  ok(enough.at.fits === true, 'exactly the cash-only need in cash and the rest in CPF fits', [enough.at.gap, enough.at.cashShort]);
  ok(notCash.at.fits === false && notCash.at.cashShort > 0, 'the same total with too little cash does not fit: COV cannot come from CPF', [notCash.at.gap, notCash.at.cashShort]);
  // fixes: the cash fix accounts for the COV
  const over = s({ cash: 150000, cpf: 200000 });
  const cashFix = (over.fixes || []).filter((f) => f.kind === 'cash')[0];
  ok(!!cashFix && cashFix.after.fits && near(cashFix.add, Math.ceil((over.at.gap + 0) / 1000) * 1000, 1000), 'the “add cash” fix is worked with the valuation and fits', cashFix && [cashFix.add, over.at.gap]);
  // new launch: ignored
  const nl = A.assess(sc({ kind: 'new', valuation: 1000000, saveMo: 3000, cpfMo: 2000 })), nl0 = A.assess(sc({ kind: 'new', saveMo: 3000, cpfMo: 2000 }));
  ok(nl.state === 'ok' && nl.at.cov === 0 && near(nl.at.upfront, nl0.at.upfront), 'a new launch ignores a valuation in the Planner');
  // validation
  const bad = A.assess(sc({ valuation: -1 }));
  ok(bad.state === 'invalid' && bad.errors.some((e) => e.key === 'valuation'), 'a negative valuation is flagged on its own field', bad.errors);
  // no price: nothing to apply it to
  const np = A.assess(sc({ price: undefined, valuation: 1400000 }));
  ok(np.state === 'ok' && !np.priceIsOwn && np.at.valuation === null, 'a valuation with no price is not applied to the maximum');
}

// ---- 4. the buyer's words ----
{
  const v = V.build(A.assess(sc({ valuation: 1400000 })), {}), v0 = V.build(A.assess(sc()), {});
  ok(v.valuation && near(v.valuation.cov, 100000) && /\$100,000 below the price/.test(v.lead.replace(/<[^>]+>/g, '')) && /cash/.test(v.valuation.html), 'the sentence says the amount below the price is cash', v.lead);
  ok(!v0.valuation && !/valuation/i.test(v0.lead), 'no valuation: no valuation sentence');
  ok(/valuation you entered/.test(v.eligibility.text) && /valuation/.test(V.ELIGIBILITY.text), 'eligibility text is honest about the valuation being the one entered');
  const hi = V.build(A.assess(sc({ valuation: 1600000 })), {});
  ok(hi.valuation && hi.valuation.cov === 0 && /above the price/.test(hi.valuation.html), 'valuation above the price: said plainly, no COV');
  const sh = V.build(A.assess(sc({ valuation: 1400000, cash: 150000, cpf: 200000 })), {});
  ok(sh.tone === 'over' && /valuation/.test(sh.lead) && /Your maximum is/.test(sh.lead), 'a shortfall with a valuation keeps the maximum and names the valuation');
}

// ---- 5. an HDB resale flat (C.msr): the loan limit, minimum cash and COV ----
{
  const m = (o) => C.msr(Object.assign({ scenario: 'hdb-loan', borrowers: [{ age: 35, fixed: 9000 }], lease: 80 }, o || {}));
  const r = m({ price: 600000, valuation: 570000 }), f = r.flat;
  ok(r.ok && f, 'HDB loan: flat check returned');
  ok(near(f.loanLimit, .75 * 570000) && near(f.loan, Math.min(r.maxLoan, .75 * 570000)), 'HDB loan: 75% of the lower of price and valuation', f);
  ok(f.minCashPct === 0 && f.cashMin === 0 && near(f.cov, 30000) && near(f.cashOnly, 30000), 'HDB loan: no minimum cash (CPF OA can pay the whole downpayment); only the COV is cash only', f);
  ok(near(f.down, 600000 - f.loan) && near(f.cashOrCpf, f.down - f.cashOnly), 'the rest of the initial payment is cash or CPF OA', f);
  ok(f.incomeLimited === false, 'income is not the limit here');
  const poor = m({ borrowers: [{ age: 35, fixed: 3000 }], price: 600000, valuation: 570000 });
  ok(poor.flat.incomeLimited && near(poor.flat.loan, poor.maxLoan) && near(poor.flat.down, 600000 - poor.maxLoan), 'income-limited: the loan is what income supports; the rest is paid in cash or CPF', poor.flat);
  const none = m({ price: 600000 });
  ok(none.flat && none.flat.cov === 0 && none.flat.valuation === null && near(none.flat.loanLimit, .75 * 600000), 'no valuation: the price is used');
  ok(m().flat === null || m().flat === undefined, 'no price: no flat check');
  const pr = m({ lease: 50, price: 600000, valuation: 600000 });   // pro-rated limit when the lease does not cover the youngest to 95
  ok(pr.flat && near(pr.flat.ltv, pr.ltv) && pr.flat.ltv < .75 && near(pr.flat.loanLimit, pr.ltv * 600000), 'a pro-rated lease limit carries into the flat check', [pr.ltv, pr.flat && pr.flat.loanLimit]);
  const bank = C.msr({ scenario: 'hdb-bank', borrowers: [{ age: 35, fixed: 9000 }], price: 600000, valuation: 570000 });
  ok(bank.flat && near(bank.flat.loanLimit, bank.ltv * 570000) && near(bank.flat.cashMin, bank.minCash * 570000) && near(bank.flat.cov, 30000), 'HDB flat with a bank loan: the bank table’s LTV and minimum cash on the lower value', bank.flat);
  const ec = C.msr({ scenario: 'ec', borrowers: [{ age: 35, fixed: 9000 }], price: 900000, valuation: 800000 });
  ok(ec.ok && (ec.flat === null || ec.flat === undefined), 'a new EC (from the developer) has no valuation check');
  const badv = C.msr({ scenario: 'hdb-loan', borrowers: [{ age: 35, fixed: 9000 }], price: 600000, valuation: -1 });
  ok(!badv.ok && badv.invalid && badv.invalid.some((e) => e.field === 'valuation'), 'a negative HDB valuation is refused');
  const hiV = m({ price: 600000, valuation: 650000 });
  ok(hiV.flat.cov === 0 && near(hiV.flat.loanLimit, .75 * 600000) && near(hiV.flat.dutyBase, 650000), 'HDB valuation above the price: loan on the price, duty on the valuation');
}

// the worked example: $600,000 price, $560,000 valuation, HDB loan $420,000, enough income and CPF
{
  const r = C.msr({ scenario: 'hdb-loan', borrowers: [{ age: 35, fixed: 9000 }], lease: 80, price: 600000, valuation: 560000 }), f = r.flat;
  ok(near(f.loan, 420000) && near(f.down, 180000) && near(f.cov, 40000) && near(f.cashOnly, 40000) && near(f.cashOrCpf, 140000), 'HDB loan, $600,000 / $560,000: $180,000 beyond the $420,000 loan; $40,000 cash only (COV); $140,000 cash or CPF', f);
  // no COV: nothing at all is cash only
  const n = C.msr({ scenario: 'hdb-loan', borrowers: [{ age: 35, fixed: 9000 }], lease: 80, price: 600000 }).flat;
  ok(n.cashOnly === 0 && near(n.cashOrCpf, 150000), 'HDB loan, no valuation: $150,000 beyond the loan, none of it cash only', n);
  // bank loan on the same flat keeps its minimum cash: 5% of the lower value (standard tier), plus the COV
  const b = C.msr({ scenario: 'hdb-bank', borrowers: [{ age: 35, fixed: 9000 }], price: 600000, valuation: 560000 }), g = b.flat;
  ok(near(g.cashMin, b.minCash * 560000) && near(g.cashOnly, b.minCash * 560000 + 40000) && b.minCash >= 0.05, 'HDB flat with a bank loan: the bank minimum cash still applies, plus the COV', g);
}

// ---- 6. the rules file records it ----
ok(R.valuation && R.valuation.loanBasis === 'lower' && R.valuation.cashOverInCash === true && R.valuation.dutyBasis === 'higher' && /^2026-10-24$/.test(R.valuation.checked), 'R.valuation records the three rules and the date they were checked');
ok(R.hdbLoan.minCash === 0, 'HDB loan: no minimum cash (the 5% minimum belongs to a bank loan)');
ok(R.bankLtv.standard[0].minCash === 0.05 && R.bankLtv.lower[0].ltv === 0.55 && R.bankLtv.lower[0].minCash === 0.10, 'bank loan tiers unchanged: 75% / 5% cash, and 55% / 10% cash on the lower tier');
ok(typeof R.sources.valuation === 'string' && R.sources.valuation.length > 20, 'the valuation source line exists');

console.log('valuation-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
