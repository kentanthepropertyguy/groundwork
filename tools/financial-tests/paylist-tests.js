'use strict';
/* The basic payment schedule (assets/js/gw-paylist.js) and the HDB list (GW_SCHEDULE.hdb): every stage, amount and timing is read back against the engines and the rules.
   Private homes and ECs must equal GW_SCHEDULE (and so the Payment Timeline engine); the split of each stage must equal GW_CALC.progressive (the old New launch payments);
   HDB lists must follow GW_RULES.hdbPayments, carry no date HDB or construction would set, and never add stamp duty or HDB-set fees into an amount.
   Run: node tools/financial-tests/paylist-tests.js */
const fs = require('fs'), path = require('path');
const H = require('./harness.js')(process.argv[2]);
const { R, C, T, S } = H, P = require(path.join(H.root, 'assets/js/gw-paylist.js'))(S, C);
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } };
const num = (t) => +String(t).replace(/[^\d.]/g, '');
const plain = (s) => String(s || '').replace(/<[^>]+>/g, '');
const near = (a, b) => Math.abs(a - b) < 1;

// ---- 1. private homes and ECs: the list is the schedule adapter's, the engine's amounts, nothing double-counted ----
for (const kind of ['new', 'ec', 'completed']) for (const price of [900000, 1500000, 2500000, 6000000]) {
  const m = P.model({ kind, price }), s = S.schedule({ kind, price, undated: true });
  const pays = s.events.filter((e) => e.type === 'pay');
  ok(m.ok && m.rows.length === pays.length, kind + ' ' + price + ': one row per payment', [m.rows && m.rows.length, pays.length]);
  ok(m.rows.every((r, i) => num(r.amount) === Math.round(pays[i].amount) && r.label === pays[i].label), kind + ' ' + price + ': every label and amount is the adapter’s');
  ok(near(num(m.total), price + s.duty.total), kind + ' ' + price + ': the total is the price plus stamp duty, once', [m.total, price + s.duty.total]);
  ok(near(pays.filter((e) => e.id !== 'bsd' && e.id !== 'absd').reduce((a, e) => a + e.amount, 0), price), kind + ' ' + price + ': the stages add up to the price, with no stage counted twice');
  // the Payment Timeline engine, dated: the same amounts stage by stage
  const t = T.timeline({ kind, price, otp: '2026-11-02', buyers: [{ res: 'SC', owned: 0 }], age: 35, ratePct: 4, cash: 9e7, cpf: 0, order: 'none', sale: {}, dates: { mode: 'grouped' }, income: 0, loansOther: 0 });
  const tp = t.events.filter((e) => e.type === 'pay');
  ok(t.ok && tp.length === pays.length && tp.every((e, i) => near(e.amount, pays[i].amount)), kind + ' ' + price + ': equal to the Payment Timeline engine, stage by stage', tp.map((e) => Math.round(e.amount)));
  ok(m.rows.every((r) => !/\b(20\d\d)\b/.test(plain(r.when)) || /about|after/i.test(plain(r.when))), kind + ' ' + price + ': no calendar date is invented without an option date', m.rows.map((r) => plain(r.when)));
}
{
  const n = P.model({ kind: 'new', price: 2000000 }), ids = S.schedule({ kind: 'new', price: 2000000, undated: true }).events.filter((e) => e.type === 'pay').map((e) => e.id);
  ok(JSON.stringify(ids) === JSON.stringify(['otp', 'snp', 'bsd', 'foundation', 'frame', 'walls', 'roof', 'fittings', 'roads', 'top', 'csc']), 'a new launch follows the Housing Developers Rules stages', ids);
  ok(n.rows.filter((r) => /As construction progresses/.test(plain(r.when))).length === 6, 'the six construction stages carry a milestone, not a date');
  ok(/48 months/.test(plain(n.rows[9].when)) && n.rows[9].tag === 'Estimated' && /60 months/.test(plain(n.rows[10].when)) && n.rows[10].provisional, 'TOP and the final payment are worded as estimates, the last provisional');
  const c = P.model({ kind: 'completed', price: 2000000 });
  ok(c.rows.length === 4 && c.rows.map((r) => r.pct).join() === '1%,4%,,95%', 'a completed home: 1% option, 4% exercise, stamp duty, 95% completion (no construction stages)', c.rows.map((r) => r.pct));
  ok(P.model({ kind: 'ec', price: 1300000 }).rows.length === 11, 'a new EC follows the progressive stages');
}

// ---- 2. HDB resale and new flat: from GW_RULES.hdbPayments; no invented dates; stamp duty and HDB-set fees never added in ----
const HP = R.hdbPayments;
for (const price of [350000, 600000, 1100000]) {
  const m = P.model({ kind: 'hdb-resale', price }), by = {}; S.hdb({ flat: 'resale', price }).events.forEach((e) => { by[e.id] = e; });
  ok(m.ok && m.rows.map((r) => r.label).join('|') === 'Option fee|Exercise fee|Resale application fee|Legal fees and other HDB fees|Balance of the price|Stamp duty', 'resale ' + price + ': the stages are option, exercise, application fee, HDB fees, balance, stamp duty', m.rows.map((r) => r.label));
  ok(by.option.amount === HP.resale.optionFeeMax && by.exercise.amount === HP.resale.feesMax - HP.resale.optionFeeMax && by.option.amount + by.exercise.amount === HP.resale.feesMax, 'resale ' + price + ': option up to $1,000 and exercise up to $4,000, $5,000 together');
  ok(by.completion.amount === price - HP.resale.feesMax, 'resale ' + price + ': the balance is the price less the two fees, so the fees are not counted twice', by.completion.amount);
  ok(by.option.amount + by.exercise.amount + by.completion.amount === price, 'resale ' + price + ': fees plus balance equal the price exactly');
  ok(by.duty.amount === null && by.hdbfees.amount === null, 'resale ' + price + ': stamp duty and HDB-set fees carry no amount of their own');
  ok(m.rows.every((r) => !/\b(19|20)\d\d\b|\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(plain(r.when) + ' ' + (r.note || ''))), 'resale ' + price + ': no calendar date anywhere', m.rows.map((r) => plain(r.when)));
  ok(/21 days/.test(plain(m.rows[1].when)) && m.rows[1].tag === 'By rule', 'resale ' + price + ': the exercise fee is due within 21 days of the option, a rule');
  ok(m.rows[4].tag === 'Estimated' && /3 to 4 months/.test(m.rows[4].note), 'resale ' + price + ': completion is an estimate worded as a range');
}
for (const loan of ['hdb', 'bank']) for (const price of [400000, 650000]) {
  const m = P.model({ kind: 'hdb-bto', price, loan }), e = {}; S.hdb({ flat: 'bto', price, loan }).events.forEach((x) => { e[x.id] = x; });
  const pct = loan === 'bank' ? HP.bto.downpaymentPct.bankLoan : HP.bto.downpaymentPct.hdbLoan;
  ok(m.rows.map((r) => r.label).join('|') === 'Application fee|Booking fee|Downpayment|Stamp duty and legal fees|Balance of the price', 'BTO ' + loan + ' ' + price + ': application, booking, downpayment, stamp duty and legal fees, balance', m.rows.map((r) => r.label));
  ok(e.downpayment.amount === Math.round(price * pct) && Math.abs(e.downpayment.amount + e.balance.amount - price) < 1, 'BTO ' + loan + ' ' + price + ': the downpayment is ' + pct * 100 + '% and, with the balance, equals the price', [e.downpayment.amount, e.balance.amount]);
  ok(/\$500 to \$2,000/.test(plain(m.rows[1].amount)) && /part of the downpayment|counts towards the downpayment/.test(m.rows[1].note + ' ' + m.foot.join(' ')), 'BTO ' + loan + ' ' + price + ': the booking fee ranges by flat type and counts towards the downpayment');
  ok(m.rows.every((r) => !/\b(19|20)\d\d\b/.test(plain(r.when) + r.note)), 'BTO ' + loan + ' ' + price + ': no date is invented for the Agreement for Lease or key collection');
  ok(/construction/.test(m.rows[4].note), 'BTO ' + loan + ' ' + price + ': key collection says it depends on construction');
}
ok(P.model({ kind: 'hdb-bto', price: 0 }).ok === false && P.model({ kind: 'hdb-resale', price: -5 }).ok === false && P.model({ kind: 'new' }).ok === false, 'no price, no schedule');
ok(S.hdb({ price: 999999999999 }).ok === false, 'an absurd price is refused, not listed');
// HDB lists never come from a private schedule
ok(!P.model({ kind: 'hdb-resale', price: 600000 }).rows.some((r) => /Option to Purchase|Signing the S&P|Foundation|Temporary Occupation/i.test(r.label)), 'an HDB list never reuses a private home’s stages');

// ---- 3. the split of each stage (New launch payments, now in the Payment Timeline) is the engine's, once ----
for (const [kind, price, age] of [['new', 2000000, undefined], ['new', 1800000, 40], ['ec', 1300000, 32]]) {
  const m = P.split({ kind, price, age, buyers: [{ res: 'SC', owned: 0 }] }), e = C.progressive({ kind: kind === 'ec' ? 'ec' : 'private', price, age: age || 35, buyers: [{ res: 'SC', owned: 0 }] });
  ok(m.ok && e.ok && m.rows.length === e.stages.length && m.rows.every((r, i) => num(r.amount) === Math.round(e.stages[i].amount)), kind + ' split ' + price + ': every stage amount is GW_CALC.progressive’s');
  ok(near(e.stages.reduce((a, s) => a + s.cash + s.cpf + s.flex + s.loan, 0), price) && near(e.stages.reduce((a, s) => a + s.loan, 0), e.loanMax), kind + ' split ' + price + ': cash, CPF and loan add up to the price and the loan to the limit; nothing double-counted');
  ok(near(m.stampDuty, S.schedule({ kind, price, undated: true }).duty.total), kind + ' split ' + price + ': stamp duty equals the schedule’s, and is outside the stages');
  ok(m.lines[3][1] === '$' + Math.round(e.finalMonthly).toLocaleString('en-US') + ' a month', kind + ' split ' + price + ': the final instalment is the engine’s');
  ok(age ? !/standard loan limit/.test(m.foot.join(' ')) : /standard loan limit/.test(m.foot.join(' ')), kind + ' split ' + price + ': with no age it says it shows the standard limit');
  // the Payment Timeline's own allocation, with funds entered, matches the split when the money is the same
  const t = T.timeline({ kind, price, otp: '2026-11-02', buyers: [{ res: 'SC', owned: 0 }], age: age || 35, ratePct: 4, cash: 9e7, cpf: 0, order: 'none', sale: {}, dates: { mode: 'grouped' }, income: 0, loansOther: 0 });
  const tp = t.events.filter((x) => x.type === 'pay' && x.id !== 'bsd' && x.id !== 'absd');
  ok(tp.every((x, i) => near(x.bank || 0, e.stages[i].loan) && near(x.instalment || 0, e.stages[i].monthly || 0)), kind + ' split ' + price + ': the loan drawn and the instalment after each stage equal the Payment Timeline engine’s', tp.map((x) => Math.round(x.bank || 0)));
}
{
  const m = P.split({ kind: 'new', price: 3000000, entity: true }), e = C.progressive({ kind: 'private', price: 3000000, entity: true });
  ok(m.ok && near(e.loanMax, 3000000 * R.entityLtv) && /15%/.test(m.foot.join(' ')), 'a company: the loan is 15% and no CPF');
  ok(P.split({ kind: 'completed', price: 2000000 }).ok === false, 'a completed home has no construction split');
}

// ---- 4. New launch payments is folded into the Payment Timeline: the address still works, the directory no longer lists it ----
{
  const rd = fs.readFileSync(path.join(H.root, 'tools/progressive-payments/index.html'), 'utf8');
  ok(/<meta http-equiv="refresh" content="0; url=\.\.\/payment-planner\/">/.test(rd) && /location\.replace\('\.\.\/payment-planner\/' \+ location\.search \+ location\.hash\)/.test(rd), 'the old address redirects to the Payment timeline and keeps the address details');
  ok(/rel="canonical" href="https:\/\/tools\.kentanthepropertyguy\.com\/tools\/payment-planner\/"/.test(rd) && /noindex/.test(rd), 'the old address is not indexed and points to the new one');
  const idx = fs.readFileSync(path.join(H.root, 'tools/index.html'), 'utf8'), nav = fs.readFileSync(path.join(H.root, 'assets/js/gw-nav.js'), 'utf8'), sm = fs.readFileSync(path.join(H.root, 'sitemap.xml'), 'utf8');
  ok(!/progressive-payments/.test(idx + nav + sm), 'it is no longer in Tools, the menu, search or the sitemap');
  { global.self = global; const GWN = require(path.join(H.root, 'assets/js/gw-nav.js')); const first = (q) => (GWN.matchTools(q, 3)[0] || {}).id; ok(first('new launch payments') === 'payment-planner' && first('full payment planning') === 'payment-planner', 'searching “new launch payments” and “full payment planning” still finds the Payment timeline'); }
  ok(/company buyer/.test(nav) && /uncompleted/.test(nav), 'its other search words (company buyer, uncompleted) now find the Payment timeline');
  ok(!fs.readdirSync(path.join(H.root, 'tools')).includes('progressive-payments') || fs.readdirSync(path.join(H.root, 'tools/progressive-payments')).join() === 'index.html', 'only the redirect page remains at the old address');
}
console.log('paylist-tests: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
