'use strict';
/* The CPF OA buffer and the mortgage during construction (28 Oct 2026) against Claude E's methodology v1.1: every frozen expected value in
   cpfbuf/expected_buffer_v1_1.json (16 scenarios, both TOP readings: buffer, coverage, OA at TOP, cash by rule and because the OA ran short, each stage's OA and next
   instalment, year-end balances, the instalment steps and cash events), the reference's targeted checks (interest credited on 1 January, CPF's order within the month,
   loan and minimum cash taken as given), and Claude E's calculator-audit mortgage figures through GW_CALC.bankPath.
   Run: node tools/financial-tests/cpfbuf-tests.js [rootDir] */
const fs = require('fs'), path = require('path');
const H = require('./harness.js')(process.argv[2]), { R, C } = H;
const BUF = require(path.join(H.root, 'assets/js/gw-cpfbuf.js'))(R, C);
const E = JSON.parse(fs.readFileSync(path.join(__dirname, 'cpfbuf', 'expected_buffer_v1_1.json'), 'utf8')).scenarios;
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } };
const eq = (name, a, b, tol) => ok((a === null || b === null || a === undefined || b === undefined) ? a == b : Math.abs(a - b) <= (tol || 0), name, [a, b]);
const toCase = (i, rd) => ({ price: i.price, loan: i.loan, ratePct: i.rate, years: i.tenure_years, top: i.top_month, csc: i.top_month + i.csc_after_top, snp: i.snp_month, minCashPct: i.min_cash_pct, start: i.start.slice(0, 7),
  timing: i.contribution_timing, reading: rd, horizonAfterTop: i.horizon_after_top, cpfForDownpayment: i.cpf_for_downpayment, cpfForInstalments: i.cpf_for_instalments,
  persons: i.persons.map((p) => ({ name: p.name, oa: p.oa, oaMonthly: p.oa_monthly, existingCpfMonthly: p.existing_cpf_monthly, existingUntil: p.existing_until, existingLoanType: p.existing_loan_type, refund: p.refund, refundMonth: p.refund_month, raTopup: p.ra_topup, reserve: p.reserve, turn55Month: p.turn55_month, saAt55: p.sa_at_55, raTarget: p.ra_target, oaMonthlyAfter55: p.oa_monthly_after_55 })) });
const runE = (k, rd, over) => BUF.run(Object.assign(toCase(E[k].inputs, rd || 'full_at_top'), over || {}));

// ---- 1. every frozen value, both readings ----
for (const k of Object.keys(E)) for (const rd of ['full_at_top', 'progressive_to_csc']) {
  const e = E[k].results[rd], r = runE(k, rd), t = k + '/' + rd;
  eq(t + ' buffer at TOP', r.bufferAtTop, e.buffer_at_top); eq(t + ' coverage months', r.coverageMonths, e.coverage_months); eq(t + ' OA at TOP', r.oaAtTop, e.oa_at_top);
  eq(t + ' cash by rule', r.cashByRule, e.cash_by_rule); eq(t + ' cash because the OA ran short', r.cashBecauseOaShortBeforeTop, e.cash_because_oa_short_before_top); eq(t + ' cash before TOP', r.cashNeededBeforeTop, e.cash_needed_before_top);
  eq(t + ' instalment after TOP', r.instalmentAfterTop, e.instalment_after_top); eq(t + ' instalment fully drawn', r.instalmentFull, e.instalment_full);
  eq(t + ' monthly shortfall after TOP', r.monthlyShortfallAfterTop, e.monthly_shortfall_after_top); eq(t + ' monthly shortfall fully drawn', r.monthlyShortfallFull, e.monthly_shortfall_full);
  eq(t + ' interest accrued, not credited', r.interestAccruedNotCreditedAtTop, e.interest_accrued_not_credited_at_top, 0.01); eq(t + ' reserved', r.reserved, e.reserved); eq(t + ' CPF used for the property', r.cpfUsedForProperty, e.cpf_used_for_property_total);
  eq(t + ' first instalment', r.firstInstalment && r.firstInstalment.amount, e.first_instalment && e.first_instalment.amount); eq(t + ' first instalment month', r.firstInstalment && r.firstInstalment.m, e.first_instalment && e.first_instalment.m);
  ok((r.vlReached || null) === (e.vl_reached || null), t + ' Valuation Limit reached', [r.vlReached, e.vl_reached]);
  // each stage's month, OA after it and the next month's instalment (OA after: within $1, the reference rounds half to even)
  e.milestones.forEach((ms) => { const s = r.stages.filter((x) => x.stage === (ms.stage === 'ceiling' ? 'roof' : ms.stage))[0]; eq(t + ' ' + ms.stage + ' month', s.month, ms.month); eq(t + ' ' + ms.stage + ' OA after', s.oaAfter, ms.oa_total_after, 1); eq(t + ' ' + ms.stage + ' next instalment', s.instalmentNext, ms.instalment_next_month); });
  e.year_end_oa.forEach((y, j) => eq(t + ' year-end OA ' + y.date, r.yearEnd[j] && r.yearEnd[j].oaTotal, Math.round(y.oa_total), 1));
  eq(t + ' instalment steps', r.instalmentSteps.length, e.instalment_steps.length); e.instalment_steps.forEach((s, j) => eq(t + ' step ' + j, r.instalmentSteps[j] && r.instalmentSteps[j].instalment, s.instalment));
  eq(t + ' cash events', r.cashEvents.length, e.cash_events.length); e.cash_events.forEach((ce, j) => eq(t + ' cash event ' + j + ' (' + ce[0] + ')', r.cashEvents[j] && r.cashEvents[j].amount, ce[2]));
}
// ---- 2. the reference's targeted checks (checks/check_v11.py) ----
{
  const a = runE('A');
  ok(a.interestAccruedNotCreditedAtTop > 170 && a.interestAccruedNotCreditedAtTop < 180 && a.bufferAtTop === 29429, 'I2 A: uncredited interest at TOP is reported, not counted; buffer $29,429', [a.interestAccruedNotCreditedAtTop, a.bufferAtTop]);
  const mini = (type) => BUF.run({ price: 1000000, loan: 750000, ratePct: 3, years: 30, top: 36, csc: 48, minCashPct: 0.05, start: '2027-03', persons: [{ oa: 0, oaMonthly: 1000, existingCpfMonthly: 500, existingUntil: 3, existingLoanType: type }] });
  const m1 = (r) => r.cashEvents.filter((e) => e.date === '2027-04-01' && e.kind === 'existing');
  ok(m1(mini('hdb_loan')).length === 1 && m1(mini('hdb_loan'))[0].amount === 500, 'T1 an HDB loan (6th–12th) is deducted before the contribution: $500 cash in month 1');
  ok(m1(mini('hdb_flat_bank_loan')).length === 1, 'T2 an HDB flat’s bank loan (11th–14th) is also before the contribution');
  ok(m1(mini('private_bank_loan')).length === 0, 'T3 a private bank loan (26th–1st) is after the contribution: CPF pays it');
  ok(a.rows[0].oaTotal === 300000, 'T4 no contribution in the option month');
  const f = runE('F'), snp = f.cashEvents.filter((e) => e.date === '2027-05-01' && /^short/.test(e.kind))[0];
  ok(snp && Math.abs((240000 - f.rows[1].oaTotal) - snp.amount) <= 1, 'T5 a stage payment uses the opening balance (F: S&P)', snp);
  ok(Math.abs(a.rows[36].oaTotal + 1840 - a.rows[37].instalment - a.rows[37].oaTotal) < 0.02, 'T6 the new private-loan instalment can use that month’s contribution');
  const lag = runE('A_LAG');
  ok(lag.bufferAtTop === a.bufferAtTop && lag.coverageMonths === a.coverageMonths - 1, 'T8 stress: contributions next month: same buffer, one month less', [lag.bufferAtTop, lag.coverageMonths]);
  ok(runE('G2').oaMovedAt55[0] === 52795.75, 'T9 turning 55 (G2): $52,796 moved, the birthday month’s contribution included', runE('G2').oaMovedAt55);
  Object.keys(E).forEach((k) => { const i = E[k].inputs, r = runE(k); ok(r.cashByRule === Math.round(i.min_cash_pct * i.price), 'L1 ' + k + ': the loan and its minimum cash are taken as given (' + i.ltv_route + ')'); });
  const v = runE('VL'); ok(v.cpfUsedForProperty <= 500000 && v.vlReached !== null, 'VL: CPF used never exceeds the Valuation Limit', [v.cpfUsedForProperty, v.vlReached]);
}
// ---- 3. Claude E's calculator audit (F1): the instalment from TOP, counted from the first release (TOP 36 months, as in the audit) ----
[[1500000, 35, 30, 3, 5011, 4959], [1800000, 40, 25, 4, 7591, 7501], [1500000, 50, undefined, 4, 9543, 9314], [1500000, 55, undefined, 4, 14489, 13942], [1500000, 60, undefined, 4, 39469, 38286]].forEach(([price, age, years, rate, full, prog]) => {
  const p = C.progressive({ price, age, years, ratePct: rate, kind: 'private', loans: 0, buyers: [{ res: 'SC', owned: 0 }], build: true, topMonths: 36 });
  eq('F1 $' + price + ' age ' + age + ': from TOP', Math.round(p.finalMonthly), full); eq('F1 $' + price + ' age ' + age + ': progressive to CSC, fully drawn', Math.round(p.bank.progressive.afterCsc), prog);
});
{
  const p = C.progressive({ price: 2650000, age: 47, ratePct: 4, kind: 'private', loans: 2, buyers: [{ res: 'SC', owned: 2 }], build: true, topMonths: 36 });
  eq('$2.65m, 35%, age 47: $927,500 over 18 years = $6,031 from TOP', Math.round(p.finalMonthly), 6031); eq('$2.65m: about $3,450 until CSC at a progressive bank', Math.round(p.bank.progressive.topToCsc), 3446); eq('$2.65m: about $6,135 after CSC', Math.round(p.bank.progressive.afterCsc), 6135);
  ok(p.bank.firstStage === 'top' && p.bank.beforeTop === null, '$2.65m at 35%: the bank pays nothing before TOP');
  const a = C.progressive({ price: 1500000, age: 35, years: 30, ratePct: 3, kind: 'private', loans: 0, buyers: [{ res: 'SC', owned: 0 }], build: true, topMonths: 36 });
  eq('case A: $316 from the foundation release', Math.round(a.bank.first), 316); eq('case A: $2,262 in TOP’s month', Math.round(a.bank.beforeTop), 2262);
  const done = C.progressive({ price: 1500000, age: 35, years: 30, ratePct: 3, kind: 'private', loans: 0, buyers: [{ res: 'SC', owned: 0 }] });
  ok(done.bank === null && Math.abs(done.finalMonthly - C.instal(1125000, 0.03, 30)) < 0.01, 'a completed home is unchanged: the whole loan over the whole tenure from completion');
}
// ---- 4. ages 35 and 55 to 64, worked out by hand (Ken, 28 Oct 2026): the bank's income test is MAS Notice 645's (the whole loan as if fully paid out, over the actual
// tenure applied for, at 4%: paras 10(a), 11, footnote 9), unchanged; the instalment from TOP is the same loan over the months left once the term has started at the
// foundation release (month 8 of the 48-month build); the projection at 4% is said beside the test, never instead of it ----
{
  const F = require(path.join(H.root, 'assets/js/gw-fin3-core.js'))(R, C, H.T, H.A, H.S);
  const pmt = (P, r, n) => P * (r / 12) / (1 - Math.pow(1 + r / 12, -n));
  [35, 55, 56, 57, 58, 59, 60, 61].forEach((age) => {
    const st = { n: 1, p: [{ res: 'SC', age }], loans: [], homes: 0, pkind: 'new', price: 1500000, ratePct: 3, otp: '2027-03-01', order: 'none' };
    const c = F.cost(st), inc = F.incomeNeeded(st, c), L = 1125000, Y = Math.min(30, 65 - age), left = Y * 12 - 40, t = 'age ' + age + ' (' + Y + ' years)';
    ok(c.state === 'ok' && c.loan === L && c.years === Y && c.ltv === 0.75 && !c.shortStd, t + ': 75%, the longest tenure that ends by 65, as before', [c.loan, c.years, c.ltv]);
    eq(t + ': from TOP at 3% = $1,125,000 over the ' + left + ' months left (hand)', c.monthly, pmt(L, 0.03, left), 0.01);
    eq(t + ': income needed = the bank’s test, the whole loan over ' + Y + ' years at 4%, 55% of income (hand)', inc.income, pmt(L, 0.04, Y * 12) / 0.55, 1);
    eq(t + ': the instalment from TOP at 4% (projection, hand)', inc.atTop.instalment, pmt(L, 0.04, left), 0.01);
    eq(t + ': the income that projection would need at 55% (hand)', inc.atTop.income, pmt(L, 0.04, left) / 0.55, 1);
    ok(age === 35 || (c.longer && c.longer.ltv === 0.55 && c.longer.years > Y), t + ': the longer tenure at the lower limit is offered', c.longer);
  });
  // ages 62 to 64 (Ken, 28 Oct 2026): a loan ending by 65 (1 to 3 years) would, counted from the foundation release, end before TOP; a loan repaid from TOP would run past 65,
  // so MAS's lower limit applies. The scenario shown is the longest tenure a bank usually allows (to 75) at 55%: a $825,000 loan, whose first release is at the roofing stage
  // (the buyer's 45% runs out exactly at the walls stage; month 29 of 48), so from TOP Y x 12 - 19 months are left. Loan, cash, instalment and income test all describe it.
  [62, 63, 64].forEach((age) => {
    const st = { n: 1, p: [{ res: 'SC', age }], loans: [], homes: 0, pkind: 'new', price: 1500000, ratePct: 3, otp: '2027-03-01', order: 'none' };
    const c = F.cost(st), inc = F.incomeNeeded(st, c), L = 825000, Y = 75 - age, left = Y * 12 - 19, t = 'age ' + age + ' (' + (65 - age) + ' years to 65)';
    ok(c.state === 'ok' && Math.abs(c.loan - L) < 0.01 && c.years === Y && c.ltv === 0.55 && c.lower && c.lowerWhy === 'age' && c.shortStd && c.shortStd.years === 65 - age && c.shortStd.ltv === 0.75, t + ': ' + Y + ' years at the 55% limit, with the reason recorded', [c.loan, c.years, c.ltv, c.shortStd]);
    ok(Math.abs(c.cashMin - 150000) < 0.01 && c.bank.firstStage === 'roof' && !c.bank.endsBeforeTop, t + ': 10% minimum cash; the bank first pays at the roofing stage', [c.cashMin, c.bank.firstStage]);
    eq(t + ': from TOP at 3% = $825,000 over the ' + left + ' months left (hand)', c.monthly, pmt(L, 0.03, left), 0.01);
    eq(t + ': income needed = the bank’s test, $825,000 over ' + Y + ' years at 4% (hand)', inc.income, pmt(L, 0.04, Y * 12) / 0.55, 1);
    eq(t + ': the instalment from TOP at 4% (projection, hand)', inc.atTop.instalment, pmt(L, 0.04, left), 0.01);
  });
  [60, 62, 64].forEach((age) => {
    const st = { n: 1, p: [{ res: 'SC', age, fixed: 50000 }], loans: [], homes: 0, pkind: 'new', price: 1500000, ratePct: 3, otp: '2027-03-01', order: 'none', cash: 2e6 }, c = F.cost(st), r = H.T.timeline(F.timelineInput(st));
    ok(r.ok && Math.abs(r.loan.loanMax - c.ruleLoan) < 0.01 && r.loan.years === c.years && r.loan.ltv === c.ltv && Math.abs(r.instalment.final - c.monthly) < 0.01, 'age ' + age + ': the Planner shows the same loan, tenure, limit and instalment as the cost card', [r.ok && r.loan.loanMax, c.ruleLoan, r.ok && r.loan.years, c.years, r.ok && r.instalment.final, c.monthly]);
  });
  {
    const st = { n: 1, p: [{ res: 'SC', age: 62 }], loans: [], homes: 0, pkind: 'new', price: 1500000, ratePct: 3, years: 3, otp: '2027-03-01', order: 'none' }, c = F.cost(st);
    ok(c.years === 3 && c.ltv === 0.55 && c.lower && c.lowerWhy === 'age' && Math.abs(c.monthly - pmt(825000, 0.03, 36 - 19)) < 0.01, 'age 62, 3 years typed: kept; it runs past 65 once repaid after the first release, so the 55% limit applies ($825,000 over the 17 months left from TOP)', [c.years, c.ltv, c.monthly]);
  }
  const c35 = F.cost({ n: 1, p: [{ res: 'SC', age: 35 }], loans: [], homes: 0, pkind: 'new', price: 1500000, ratePct: 3, years: 30, otp: '2027-03-01', order: 'none' }), i35 = F.incomeNeeded({ n: 1, p: [{ res: 'SC', age: 35 }], loans: [], homes: 0, pkind: 'new', price: 1500000, ratePct: 3, years: 30, otp: '2027-03-01', order: 'none' }, c35);
  ok(Math.round(c35.monthly) === 5112 && Math.round(i35.income / 100) * 100 === 9800 && Math.round(i35.atTop.instalment) === 5723 && Math.round(i35.atTop.income / 100) * 100 === 10400, 'Ken’s check, $1.5m at 3%: $5,112 from TOP; income needed stays about $9,800 (the bank’s 30-year test); the projection at 4% is $5,723, about $10,400 of income', [c35.monthly, i35.income, i35.atTop]);
  const done = F.cost({ n: 1, p: [{ res: 'SC', age: 35 }], loans: [], homes: 0, pkind: 'completed', price: 1500000, ratePct: 3, years: 30, otp: '2027-03-01', order: 'none' });
  ok(!done.bank && F.incomeNeeded({ n: 1, p: [{ res: 'SC', age: 35 }], loans: [], homes: 0, pkind: 'completed', price: 1500000, ratePct: 3, years: 30, otp: '2027-03-01', order: 'none' }, done).atTop === null, 'a completed home has no "from TOP" projection');
}
// ---- 5. the monthly mortgage at each construction milestone (Ken, 28 Oct 2026), recomputed here month by month for $1.5m at 75%, 30 years, 3%, a 48-month build:
// stages at months 8 (foundation), 16, 24, 29, 35, 41, TOP 48, CSC 60; each instalment from the month after its release; from TOP+1 the whole loan ----
{
  const F = require(path.join(H.root, 'assets/js/gw-fin3-core.js'))(R, C, H.T, H.A, H.S);
  const st = { n: 1, p: [{ res: 'SC', age: 35 }], loans: [], homes: 0, pkind: 'new', price: 1500000, ratePct: 3, years: 30, otp: '2027-03-01', order: 'none' }, b = F.cost(st).bank;
  const M = { foundation: 8, frame: 16, walls: 24, roof: 29, fittings: 35, roads: 41, top: 48, csc: 60 }, rel = { foundation: 75000, frame: 150000, walls: 75000, roof: 75000, fittings: 75000, roads: 75000, top: 375000, csc: 225000 };
  const i = 0.0025, pmt = (P, n) => P * i / (1 - Math.pow(1 + i, -n)), mat = 9 + 360; let out = 0; const want = {};
  for (let m = 8; m <= 61; m++) { if (m > 8 && out > 0) out = out * (1 + i) - (m > 48 ? pmt(1125000, mat - 49) : pmt(out, mat - m)); Object.keys(M).forEach((id) => { if (M[id] === m) { out += rel[id]; want[id] = m + 1 > 48 ? pmt(1125000, mat - 49) : pmt(out, mat - m - 1); } }); }
  Object.keys(M).forEach((id) => { eq('milestone ' + id + ': bank pays ' + rel[id], b.stageLoans[id], rel[id], 0.01); eq('milestone ' + id + ': monthly mortgage from the month after (hand)', b.after[id], want[id], 0.01); eq('milestone ' + id + ': month', b.stageMonths[id], M[id]); });
  ok(Object.keys(M).every((id, k, a) => k === 0 || b.after[id] >= b.after[a[k - 1]] - 0.01), 'milestones: the instalment only rises');
  const b62 = F.cost(Object.assign({}, st, { p: [{ res: 'SC', age: 62 }], years: undefined, ratePct: 4 })).bank;
  ok(!b62.endsBeforeTop && ['foundation', 'frame', 'walls'].every((id) => !b62.after[id]) && b62.stageLoans.roof === 75000 && Math.abs(b62.after.roof - pmt0(75000, 0.04, 13 * 12)) < 0.01 && b62.stageLoans.top === 375000, 'age 62 (13 years at 55%): the bank pays from the roofing stage; $75,000 over 156 months, then each stage', b62.after);
  function pmt0(P, r, n) { return P * (r / 12) / (1 - Math.pow(1 + r / 12, -n)); }
}
console.log('cpfbuf-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
