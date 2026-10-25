'use strict';
/* Financial Experience V2 (25 Oct 2026): focused checks for the brief's cases, each against figures worked out here by hand from the rules, not read back from the engine.
     1 one buyer, one borrower          2 two buyers, two borrowers (income-weighted age, MAS)     3 two buyers, one borrower
     4 existing housing loans and second-property financing (LTV by loan count, ABSD)            5 selling after TOP
     6 sale date not decided            7 insufficient immediate cash or CPF                       8 progressive drawdown instalments
     9 property types (new launch, new EC, completed private home)                                 10 the planner's lists carry no grand total
   Run: node tools/financial-tests/fe2-tests.js */
const H = require('./harness.js')(process.argv[2]);
const { C, T, S } = H;
global.GW_SCHEDULE = S; global.GW_CALC = C; global.GW_TIMELINE = T; global.GW_RULES = H.R;
const P = require(H.root + '/assets/js/gw-planner-ui.js');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1 : tol);
const ev = (r, id) => r.events.filter((e) => e.id === id)[0];
const instal = (L, ratePct, years) => { const i = ratePct / 1200, n = years * 12; return L * i / (1 - Math.pow(1 + i, -n)); };
const OTP = '2026-11-02';
const base = (o) => Object.assign({ kind: 'new', price: 1800000, otp: OTP, buyers: [{ res: 'SC', owned: 0 }], age: 35, ratePct: 4, cash: 300000, cpf: 150000, order: 'none' }, o || {});
const addM = (iso, m) => T.iso(T.addMonths(new Date(iso + 'T00:00:00Z'), m));

// ---- 1. one buyer, one borrower: 35, $12,000 a month, $1.8m new launch ----
{
  const r = T.timeline(base());
  ok(r.ok && near(r.loan.ltv, 0.75, 1e-9) && near(r.loan.loanMax, 1350000), '1: first home, 75% loan = $1,350,000', [r.loan && r.loan.loanMax]);
  ok(r.loan.years === 30, '1: age 35, the longest standard tenure is 30 years (MAS: within 30 and by 65)', r.loan.years);
  // income test: 55% x $12,000 at 4% over 30 years supports more than $1.35m, so the rule limit is the loan
  const t = C.tdsr({ kind: 'private', borrowers: [{ age: 35, fixed: 12000 }], loans: 0 });
  ok(t.ok && near(t.maxLoan, 6600 / instal(1, 4, 30), 5) && t.maxLoan > 1350000, '1: TDSR capacity 55% x $12,000 at 4% over 30 years (about $1.382m)', t.maxLoan);
  ok(near(ev(r, 'otp').amount, 90000) && ev(r, 'otp').cashUsed === 90000, '1: booking fee 5% = $90,000, cash', ev(r, 'otp'));
  ok(near(ev(r, 'bsd').amount, 59600), '1: BSD on $1.8m = $59,600 (IRAS bands)', ev(r, 'bsd').amount);
}
// ---- 2. two buyers, two borrowers: ages weighted by gross monthly income (MAS explainer, "Loan tenure and LTV limits") ----
{
  const mas = C.borrowers([{ age: 60, fixed: 8000 }, { age: 30, fixed: 10000 }]);
  ok(near(mas.iwaaGross, (60 * 8000 + 30 * 10000) / 18000, 1e-9) && near(mas.iwaaGross, 43.33, 0.01), '2: MAS worked example: 60 on $8,000 and 30 on $10,000 = 43.33', mas.iwaaGross);
  ok(!mas.ageUnverified && mas.iwaaUse === mas.iwaaGross, '2: fixed income only: both weightings agree, the age is not flagged', mas);
  const B = C.borrowers([{ age: 45, fixed: 15000 }, { age: 38, fixed: 9000 }]), want = (45 * 15000 + 38 * 9000) / 24000;
  ok(near(B.iwaaUse, want, 1e-9), '2: 45 on $15,000 and 38 on $9,000 = ' + want.toFixed(3), B.iwaaUse);
  const tn = C.bankTenure('private', B.iwaaUse);
  ok(tn.std === Math.min(30, Math.floor(65 - want)) && tn.std === 22, '2: standard tenure from the weighted age: 65 - 42.4 = 22 years', tn.std);
  const t2 = C.tdsr({ kind: 'private', borrowers: [{ age: 45, fixed: 15000 }, { age: 38, fixed: 9000 }], loans: 0 });
  ok(t2.ok && near(t2.maxLoan, 0.55 * 24000 / instal(1, 4, 22), 5), '2: TDSR on the combined $24,000 over the joint tenure of 22 years', t2.maxLoan);
  const v = C.borrowers([{ age: 50, fixed: 10000, variable: 10000 }, { age: 30, fixed: 10000 }]);
  ok(v.ageUnverified && v.iwaaUse === Math.max(v.iwaa, v.iwaaGross), '2: with variable income the weightings differ: the older age is used and flagged', v);
}
// ---- 3. two buyers, one borrower: only the borrower sizes the loan; both buyers count for stamp duty ----
{
  const one = C.tdsr({ kind: 'private', borrowers: [{ age: 45, fixed: 15000 }], loans: 0 }), both = C.tdsr({ kind: 'private', borrowers: [{ age: 45, fixed: 15000 }, { age: 38, fixed: 9000 }], loans: 0 });
  ok(one.ok && near(one.maxLoan, 0.55 * 15000 / instal(1, 4, 20), 5), '3: one borrower aged 45: $15,000 income over 20 years', one.maxLoan);
  ok(both.maxLoan > one.maxLoan, '3: the second buyer’s income is not counted when they do not borrow', [one.maxLoan, both.maxLoan]);
  const r = T.timeline(base({ price: 2000000, buyers: [{ res: 'SC', owned: 0 }, { res: 'SC', owned: 1 }], age: 45, order: 'none', loansOther: 0 }));
  ok(r.ok && near(r.duty.absd, 0.2 * 2000000), '3: a co-buyer who owns a home sets ABSD at 20% (SC, second home), whoever borrows', r.duty.absd);
}
// ---- 4. existing housing loans and second-property financing ----
{
  const own = (o) => T.timeline(base(Object.assign({ buyers: [{ res: 'SC', owned: 1 }], order: 'buy', sale: { undecided: true } }, o)));
  const a = own({ flatLoan: 'outstanding' });
  ok(a.ok && near(a.loan.ltv, 0.45, 1e-9) && a.loan.loans === 1 && near(a.loan.loanMax, 810000), '4: buy first, flat loan still owed: one loan, 45% = $810,000', [a.loan.ltv, a.loan.loans, a.loan.loanMax]);
  ok(near(a.duty.absd, 0.2 * 1800000), '4: owning the flat at purchase: ABSD 20% = $360,000 paid up front', a.duty.absd);
  const b = own({ flatLoan: 'none' });
  ok(b.ok && near(b.loan.ltv, 0.75, 1e-9) && b.loan.loans === 0, '4: flat fully paid: no loan counted, 75%', [b.loan.ltv, b.loan.loans]);
  const c = own({ flatLoan: 'outstanding', loansOther: 1 });
  ok(c.ok && near(c.loan.ltv, 0.35, 1e-9) && c.loan.loans === 2, '4: another housing loan as well: two loans, 35%', [c.loan.ltv, c.loan.loans]);
  // minimum cash 25% for a second loan: the S&P 15% after the 5% booking fee must include cash up to 25% in total
  const cashUp = ev(a, 'otp').cashUsed + ev(a, 'snp').cashUsed + ev(a, 'snp').uncovered;
  ok(near(a.loan.cashMin, 0.25 * 1800000) && cashUp >= 0.2 * 1800000 - 1, '4: minimum cash 25% with one loan outstanding (MAS)', [a.loan.cashMin, cashUp]);
}
// ---- 5. selling after TOP: the sale money arrives only once the sale completes, N months after the keys ----
{
  const r = T.timeline(base({ buyers: [{ res: 'SC', owned: 1 }], order: 'buy', flatLoan: 'outstanding', flatInstal: 1500, dates: { top: '2030-06-01' }, sale: { afterKeys: 3, cash: 500000, cpf: 200000 } }));
  ok(r.ok && r.keysDate === '2030-06-01' && r.saleDate === addM('2030-06-01', 3), '5: sale completes 3 months after TOP (1 Sep 2030)', [r.keysDate, r.saleDate]);
  const sale = ev(r, 'sale');
  ok(sale && sale.date === r.saleDate && sale.cashIn === 500000 && sale.cpfIn === 200000, '5: the proceeds are counted on the sale date only', sale);
  const pre = r.series.slice(1).filter((x) => x.date < r.saleDate), post = r.series.filter((x) => x.date > r.saleDate);
  ok(pre.length && pre.every((x) => x.oldInstalment === 1500) && post.every((x) => !x.oldInstalment), '5: the flat’s $1,500 instalment is paid every month until the sale, and not after', [pre.length, post.length]);
  const late = T.timeline(base({ buyers: [{ res: 'SC', owned: 1 }, { res: 'SC', owned: 0 }], couple: true, order: 'buy', flatLoan: 'outstanding', dates: { top: '2030-06-01' }, sale: { afterKeys: 7 }, refund: { assume: true } }));
  ok(late.ok && late.warnings.some((w) => w.id === 'refund-deadline'), '5: a sale 7 months after TOP misses the 6-month ABSD refund condition (IRAS), and says so', late.warnings);
  const v = T.validate(base({ order: 'buy', buyers: [{ res: 'SC', owned: 1 }], sale: { afterKeys: -1 } }));
  ok(!v.ok, '5: a negative number of months after the keys is refused');
}
// ---- 6. sale date not decided: nothing invented ----
{
  const r = T.timeline(base({ buyers: [{ res: 'SC', owned: 1 }], order: 'buy', flatLoan: 'outstanding', flatInstal: 1200, sale: { undecided: true, cash: 999999 }, refund: { assume: true } }));
  ok(r.ok && r.saleUndecided === true && r.saleDate === null, '6: no sale date is made up', [r.saleUndecided, r.saleDate]);
  ok(!r.events.some((e) => e.type === 'in'), '6: no sale money and no ABSD refund are counted, even if figures were typed', r.events.filter((e) => e.type === 'in'));
  ok(r.series.slice(1).every((x) => x.oldInstalment === 1200), '6: the flat’s instalment carries on to the end of the plan', r.series.length);
  ok(near(r.loan.ltv, 0.45, 1e-9) && near(r.duty.absd, 360000), '6: the home still counts: 45% loan limit and ABSD 20% up front', [r.loan.ltv, r.duty.absd]);
  ok(r.assumptions.some((a) => a.id === 'sale-undecided') && r.assumptions.some((a) => a.id === 'refund-undecided'), '6: both are said in the assumptions');
  ok(!T.validate(base({ order: 'buy', buyers: [{ res: 'SC', owned: 1 }], sale: {} })).ok, '6: buying first with no timing at all is still refused (the planner always sends one)');
}
// ---- 7. insufficient immediate cash or CPF ----
{
  const r = T.timeline(base({ cash: 50000, cpf: 0 }));
  ok(r.ok && near(ev(r, 'otp').uncovered, 40000) && r.headline.firstGap === OTP, '7: $50,000 cash against a $90,000 booking fee: $40,000 short on the option date', [ev(r, 'otp').uncovered, r.headline.firstGap]);
  const c = T.timeline(base({ cash: 100000, cpf: 500000 }));
  const snp = ev(c, 'snp'), bsd = ev(c, 'bsd');
  ok(near(snp.cpfUsed, 270000) && near(c.events.filter((e) => e.id === 'otp')[0].cashUsed, 90000), '7: CPF pays the S&P instalment (cash or CPF), cash the booking fee', [snp.cpfUsed]);
  ok(near(bsd.uncovered, 59600 - 10000), '7: stamp duty is cash first: with $10,000 cash left, $49,600 is short although CPF remains', [bsd.cashUsed, bsd.uncovered]);
}
// ---- 8. progressive drawdown: the instalment after each release is the level payment on everything released so far ----
{
  const r = T.timeline(base({ cash: 500000, cpf: 300000 })), pays = r.events.filter((e) => e.type === 'pay' && e.bank > 0);
  let drawn = 0, good = true;
  pays.forEach((e) => { drawn += e.bank; if (!near(e.drawn, drawn) || !near(e.instalment, instal(drawn, 4, r.loan.years), 0.02)) good = false; });
  ok(pays.length >= 5 && good, '8: ' + pays.length + ' releases, each instalment = amortised payment on the amount drawn (4%, ' + r.loan.years + ' years)', pays.map((e) => [e.drawn, e.instalment]));
  ok(near(pays[pays.length - 1].instalment, instal(1350000, 4, 30), 0.02), '8: fully released: $1.35m over 30 years at 4% = about $6,445 a month', pays[pays.length - 1].instalment);
  ok(pays.every((e, k) => k === 0 || e.instalment >= pays[k - 1].instalment), '8: the instalment only rises during construction');
}
// ---- 9. property types ----
{
  const c = T.timeline(base({ kind: 'completed', price: 1500000, cash: 400000, cpf: 300000 }));
  ok(c.ok && near(ev(c, 'option').amount, 15000) && near(ev(c, 'exercise').amount, 60000) && ev(c, 'exercise').cpfUsed === 0, '9: completed home: 1% option and 4% exercise, both cash', [ev(c, 'option').amount, ev(c, 'exercise').amount]);
  ok(near(ev(c, 'completion').bank, 1125000) && ev(c, 'completion').date === T.iso(T.addDays(new Date(OTP + 'T00:00:00Z'), 84)), '9: completion 12 weeks after the option, the whole 75% loan released then', [ev(c, 'completion').bank, ev(c, 'completion').date]);
  const e = T.timeline(base({ kind: 'ec', price: 1500000 }));
  ok(e.ok && e.events.filter((x) => x.type === 'pay' && x.bank > 0).length >= 5 && near(e.loan.loanMax, 1125000), '9: new EC: paid in stages like a new launch, 75% loan', e.loan.loanMax);
  const sc = S.schedule({ kind: 'new', price: 1800000, otp: OTP, buyers: [{ res: 'SC', owned: 0 }] });
  ok(sc.ok && sc.events[0].id === 'otp' && sc.events[0].amount === 90000, '9: the schedule needs only the property: first payment $90,000', sc.events[0]);
}
// ---- 10. the planner's lists: first and upfront payments lead; no "Total to pay" anywhere ----
{
  const sc = S.schedule({ kind: 'new', price: 1800000, otp: OTP, buyers: [{ res: 'SC', owned: 0 }] });
  const sum = P.schedSumHtml(sc), tab = P.scheduleTableHtml(sc);
  ok(/First payment/.test(sum) && /Upfront payments/.test(sum) && sum.indexOf('$419,600') >= 0, '10: the summary leads with the first payment and the upfront payments ($90,000 + $270,000 + $59,600)', sum.replace(/<[^>]+>/g, ' ').slice(0, 200));
  ok(!/Total/.test(sum) && !/Total/.test(tab) && tab.indexOf('<tfoot') < 0, '10: no total in the schedule summary or table');
  const order = ['Upfront payments', 'During construction', 'At TOP and completion'].map((t) => tab.indexOf(t));
  ok(order.every((x) => x > 0) && order[0] < order[1] && order[1] < order[2], '10: the list is in three parts, in date order', order);
  const r = T.timeline(base()), ft = P.fundTableHtml(r);
  ok(!/>Total</.test(ft) && ft.indexOf('<tfoot') < 0 && /What you need to prepare/.test(ft) && /Paid from/.test(ft) && /Monthly mortgage after/.test(ft), '10: the funding list keeps the amount due apart from what pays it, with what to prepare above it');
  const cs = S.schedule({ kind: 'completed', price: 1500000, otp: OTP, buyers: [{ res: 'SC', owned: 0 }] }), ct = P.scheduleTableHtml(cs);
  ok(ct.indexOf('Upfront payments') > 0 && ct.indexOf('At completion') > ct.indexOf('Upfront payments') && ct.indexOf('During construction') < 0, '10: a completed home has upfront payments and completion only');
}
// ---- 11. buying first with the sale date not decided is the default: the planner sends sale.undecided, so nothing is counted from the sale ----
{
  const r = T.timeline(base({ buyers: [{ res: 'SC', owned: 1 }], order: 'buy', flatLoan: 'outstanding', flatInstal: 1500, sale: { undecided: true }, refund: { assume: false } }));
  ok(r.ok && !r.events.some((e) => e.type === 'in') && near(r.duty.absd, 360000) && near(r.loan.ltv, 0.45, 1e-9) && r.series.slice(1).every((x) => x.oldInstalment === 1500), '11: default buy-first: ABSD 20% and 45% LTV kept, flat instalment to the end, no proceeds or refund');
}
console.log('fe2-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
