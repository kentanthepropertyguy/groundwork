'use strict';
/* The buyer's view (assets/js/gw-buyer-view.js): ONE answer, two supporting figures, a sale kept apart from what is in hand, and three checks that never merge
   (estimated affordability, eligibility, payment dates). Every amount is checked against a SECOND calculation written here from the rules (BSD bands, 75% loan,
   5% minimum cash), so the view cannot drift from the engine unnoticed. Run: node tools/financial-tests/buyer-view-tests.js */
const fs = require('fs'), path = require('path');
const H = require('./harness.js')(process.argv[2]);
const A = H.A, V = require(path.join(H.root, 'assets/js/gw-buyer-view.js'));
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); } };
const plain = (s) => String(s || '').replace(/<[^>]+>/g, '');
const BANDS = [[180000, .01], [180000, .02], [640000, .03], [500000, .04], [1500000, .05], [Infinity, .06]];
function bsd(p) { let r = p, t = 0; for (const [w, rate] of BANDS) { const s = Math.min(r, w); t += s * rate; r -= s; if (r <= 0) break; } return Math.floor(t); }
const r100 = (n) => Math.round(n / 100) * 100;
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const base = (o) => Object.assign({ kind: 'completed', buyers: [{ res: 'SC', age: 35, fixed: 21000, variable: 0 }], debts: 0, ratePct: 4, years: 30, cash: 100000, cpf: 200000, home: 'none', otp: '2026-10-23' }, o || {});
// as the page does: the result, with a price's quote attached
function judged(s, price) { const r = A.assess(s); if (price) { const q = r.quote(price); r.price = price; r.priceIsOwn = true; r.at = q.at; r.zone = q.zone; r.fixes = q.fixes; } return r; }

// ---- 1. no price: the maximum, the limit in one sentence, two supporting figures ----
{
  const r = judged(base()), v = V.build(r, {});
  ok(v.mode === 'max' && v.headline === money(r.budget) && r.budget === 1087000, 'max: the headline is the engine’s maximum, $1,087,000', v.headline);
  ok(v.lead === V.LIMIT_TXT.funds && plain(v.lead).indexOf('limited by your available cash and CPF') > 0, 'max: one sentence names the limit (cash and CPF)', v.lead);
  ok(v.supports.length === 2 && v.supports[0].k === 'Monthly mortgage' && v.supports[1].k === 'Borrowing capacity', 'max: exactly two supporting figures, monthly mortgage and borrowing capacity', v.supports.map((x) => x.k));
  ok(v.supports[0].v === money(r.atHighest.monthly) || v.supports[0].v === money(r.atComfortable.monthly), 'max: the monthly mortgage is the engine’s', v.supports[0].v);
  ok(v.supports[1].v === '$2.41m', 'max: borrowing capacity is the income figure ($2.41m), not a second budget', v.supports[1].v);
  ok(v.estimate === true && v.eligibility.label === 'Not confirmed' && /not confirmed/i.test(v.eligibility.short), 'max: an estimate, with eligibility not confirmed', v.eligibility);
  ok(!/verified|guarantee|approved|you qualify|you are eligible|payments checked/i.test([v.headline, v.lead, v.dates.label, plain(v.dates.summary), v.eligibility.short, JSON.stringify(v.supports)].join(' ')), 'max: nothing the buyer reads claims verification, approval or eligibility');
}
// income-limited and chosen-loan sentences
{
  const r = A.assess(base({ buyers: [{ res: 'SC', age: 35, fixed: 4000, variable: 0 }], cash: 400000, cpf: 400000 }));
  ok(V.build(r, {}).lead === V.LIMIT_TXT.income, 'max: income-limited buyers are told so', V.build(r, {}).lead);
}

// ---- 2. a price that is not affordable: one specific shortfall and the minimum cash, against an independent calculation ----
{
  const P = 2500000, r = judged(base(), P), v = V.build(r, {});
  const duty = bsd(P), loan = .75 * P, need = P - loan + duty, minCash = .05 * P + duty, have = 300000, shortAll = need - have, shortCash = minCash - 100000;
  ok(v.mode === 'price' && v.kicker === 'At $2.5m', 'price: names the price judged', v.kicker);
  ok(v.headline === money(r100(shortAll)) + ' short' && v.shortfall === r100(shortAll) && r100(shortAll) === 419600, 'price: the headline is the specific shortfall, $419,600 (independent: $719,600 needed less $300,000)', [v.headline, shortAll]);
  ok(v.need.total === need && v.need.minCash === minCash && v.need.minCash === 219600, 'price: minimum cash $219,600 = 5% ($125,000) + stamp duty ($94,600)', v.need);
  ok(Math.abs(v.need.shortCash - shortCash) < 1 && /CPF cannot cover/.test(plain(v.lead)) && plain(v.lead).indexOf(money(r100(shortCash))) > 0, 'price: the cash CPF cannot cover is $119,600', plain(v.lead));
  ok(v.supports[0].k === 'Cash and CPF needed' && v.supports[0].v === money(need) && v.supports[0].s.indexOf('At least ' + money(minCash) + ' in cash') === 0, 'price: the first figure is the cash and CPF needed, with the cash-only part', v.supports[0]);
  ok(plain(v.lead).indexOf('Your maximum is $1,087,000') > 0, 'price: the maximum stays in one clause, not a second headline', plain(v.lead));
  ok(v.supports.length === 3 && v.supports[1].k === 'Bank loan' && v.supports[1].v === money(loan) && v.supports[2].k === 'Monthly mortgage', 'price: three figures: cash and CPF needed, the loan ($1,875,000) and the monthly mortgage', v.supports);
  const ann = (rate, yrs) => { const n = yrs * 12, i = rate / 12; return (1 - Math.pow(1 + i, -n)) / i; };
  ok(Math.abs(Number(v.supports[2].v.replace(/[$,]/g, '')) - Math.round(loan / ann(.04, 30))) <= 1, 'price: the monthly mortgage is the annuity at 4% over 30 years', v.supports[2].v);
}
// affordable and tight
{
  const v = V.build(judged(base(), 900000), {});
  ok(v.headline === 'Within your budget' && v.tone === 'ok' && v.answer === null, 'price: $900,000 is within budget', v.headline);
  ok(v.supports[0].v === '$246,600' && v.supports[0].s === 'At least $66,600 in cash · You have $300,000', 'price: $900,000 needs $246,600 (independent: 225,000 + 21,600 duty), minimum cash $66,600', v.supports[0]);
  ok(plain(v.lead).indexOf('$33,400') === 0, 'price: $33,400 of cash would stay in hand ($100,000 - 66,600)', plain(v.lead));
  const t = V.build(judged(base(), 1087000), {});
  ok(t.headline === 'Within your budget, but tight' || t.headline === 'Within your budget', 'price: the maximum itself still fits', t.headline);
}

// ---- 3. payment dates: what the check was based on, and what it found, kept apart ----
{
  const dc = (s, price, o) => V.build(judged(s, price), o).dates;
  const a = dc(base(), 900000, { otpEntered: false });
  ok(a.basis === 'standard' && a.label === 'Standard schedule' && a.result === 'ok' && a.estimated, 'dates: a completed home with no option date typed is the STANDARD schedule', a);
  ok(!/verified|confirmed/i.test(a.summary), 'dates: a standard schedule is never called verified', a.summary);
  const b = dc(base(), 900000, { otpEntered: true });
  ok(b.basis === 'option' && b.label === 'Your option date' && b.result === 'ok', 'dates: with the buyer’s own option date it says so', b);
  const c = dc(base({ kind: 'new' }), 2500000, {});
  ok(c.basis === 'unchecked' && c.result === 'none' && c.hasTable === false && /No payment date has been tested/.test(c.summary), 'dates: a new launch with no monthly amounts is NOT checked, and does not say covered', c);
  const d = dc(base({ kind: 'new', saveMo: 5000, cpfMo: 3000 }), 1000000, {});
  ok(d.basis === 'monthly' && d.label === 'Your monthly amounts' && d.hasTable === true, 'dates: with monthly amounts the check is theirs', d);
  const e = dc(base(), 2500000, { otpEntered: false });
  ok(e.result === 'short' && e.first && e.first.amount === 25000 && /First short on/.test(plain(e.summary)), 'dates: a date that fails is a shortfall on a named date; at $2.5m the exercise is $25,000 short (option 25,000, exercise 100,000, cash 100,000)', e);
  // timing only: the price is covered in total, a LATER payment is not -> a projection, never a shortfall today
  const s = base({ kind: 'new', cash: 400000, cpf: 300000, saveMo: 500, cpfMo: 500 }), r = judged(s, 1800000), v = V.build(r, {});
  ok(r.at.gap <= 0.5 && r.at.covered === false, 'projected: the scenario is covered in total but a later payment is not (engine)', [r.at.gap, r.at.covered]);
  ok(v.projected === true && v.headline === 'Projected shortfall' && v.dates.result === 'projected' && /Projected shortfall from/.test(plain(v.dates.summary)) && /not a shortfall today/.test(plain(v.dates.summary)), 'projected: a future shortfall is labelled as projected, in the headline and the dates line', [v.headline, plain(v.dates.summary)]);
  ok(!/\bshort\b$/.test(v.headline), 'projected: the headline is not a plain "$X short"', v.headline);
  ok(plain(v.lead).indexOf('cover the price, but not every payment on time') > 0, 'projected: the sentence says the price is covered but a later payment is not', plain(v.lead));
}

// ---- 4. selling first: what is in hand now is kept apart from what the sale adds on completion ----
{
  const sell = base({ home: 'sell', order: 'sell', owned: 1, flat: { type: 'hdb', price: 900000, loan: 150000, hasLoan: 'yes', instalment: 1200, cpfRefund: 280000, heldOver4: true } });
  const r = judged(sell), v = V.build(r, {});
  ok(r.basis === 'sell' && r.sale.counted, 'sale: counted when price, loan and CPF refund are entered (engine)');
  ok(v.sale && v.sale.now.cash === 100000 && v.sale.now.cpf === 200000, 'sale: what is in hand now is the cash and CPF entered ($100,000 and $200,000), not the sale', v.sale && v.sale.now);
  ok(v.sale.later.cash === r.sale.cash && v.sale.later.cpf === r.sale.cpf && v.sale.later.cpf === 280000, 'sale: what the sale adds is the engine’s sale cash and CPF, separately', v.sale.later);
  ok(v.sale.now.cash + v.sale.later.cash === r.atHighest.haveCash || v.sale.now.cash + v.sale.later.cash === r.atComfortable.haveCash, 'sale: now + later = the cash the engine counted (nothing double-counted)', [v.sale.now, v.sale.later]);
  ok(/You have .*\$100,000.* in cash.*\$200,000.* in CPF.* now\./.test(plain(v.sale.html)) && /only once it completes/.test(plain(v.sale.html)), 'sale: the sentence says what you have now and that the sale arrives only on completion', plain(v.sale.html));
  const hi = judged(sell, 2500000), vh = V.build(hi, {});
  ok(vh.headline === 'Within your budget' && plain(vh.lead).indexOf('and have') < 0, 'sale: the need line does not fold the sale into "have"', plain(vh.lead));
  // the first payments exceed what is in hand now -> a labelled projection
  const big = judged(sell, 3400000), vb = V.build(big, {});
  const early = bsd(3400000) + .01 * 3400000 + .04 * 3400000;
  ok(vb.sale.warning && /^Projected:/.test(plain(vb.sale.warning)) && plain(vb.sale.warning).indexOf(money(r100(early))) > 0 && /before your sale completes/.test(plain(vb.sale.warning)), 'sale: option + exercise + stamp duty ($313,600) above the $100,000 of cash in hand is flagged, as a projection', plain(vb.sale.warning || ''));
  // the early payments are cash: CPF cannot pay an option fee or reimburse the seller, and is released only at completion. $219,600 is above the $100,000 of cash even though cash + CPF is $300,000.
  ok(vh.sale.warning && /paid in cash/.test(plain(vh.sale.warning)) && /\$100,000/.test(plain(vh.sale.warning)), 'sale: early payments are compared with cash only (CPF is not counted)', vh.sale.warning);
  const lo = judged(sell, 1200000), vl = V.build(lo, {});
  ok(vl.sale.warning === null, 'sale: no projection when the early payments fit the cash in hand ($92,600 against $100,000)', vl.sale.warning);
  // not counted: nothing is invented
  // C1 (B3): the kept-home figure needs the CPF balances behind the set-aside (the home is still owned): given here, so the test keeps to what it checks (no sale line)
  const miss = judged(base({ home: 'sell', order: 'sell', owned: 1, cpfBal: [{ oa: 300000, sa: 150000 }], cover95: true, flat: { type: 'hdb', price: 900000, hasLoan: 'yes', instalment: 1200 } })), vm = V.build(miss, {});
  ok(vm && vm.sale === null && miss.saleNote === 'missing', 'sale: with figures missing, no sale is counted and no sale line is drawn', [vm && vm.sale, miss.saleNote]);
}

// ---- 5. the Research hand-over and the page wiring are in place ----
{
  const lg = fs.readFileSync(path.join(H.root, 'assets/js/kpt-lg.js'), 'utf8');
  // V3.4: the price goes to What will this home cost me? (and How much can I borrow?), named as the typical price or an asking price
  ok(/data-lg-run="payment-planner"><b>What will this home cost me\?<\/b>/.test(lg) && /s\.buyFrom = askedPrice\(\) \? 'asking' : 'typical'/.test(lg), 'research: "What will this home cost me?" hands the price on, naming whether it is the typical price or an asking price');
  ok(!/buyFrom\s*=\s*[^;]*location|buyPrice[^;]*location\.(hash|search)/.test(lg), 'research: the price is never placed in an address');
  const ui = fs.readFileSync(path.join(H.root, 'assets/js/gw-answer-ui.js'), 'utf8');
  ok(/GW_VIEW/.test(ui) && !/function statusHtml|function tilesHtml/.test(ui), 'planner: the page draws from the view; the second status banner and price card are gone');
  // V3.4: What can I afford? is the cash-and-CPF row of How much can I borrow? (tools/planner/ redirects there), so the script order is checked on that page
  const html = fs.readFileSync(path.join(H.root, 'tools/tdsr/index.html'), 'utf8');
  // FE V3 (25 Oct 2026): What can I afford? is drawn by gw-fin3-ui.js from GW_ANSWER directly (gw-fin3-core.js); this view module stays for its own tests
  ok(/gw-fin3-core\.js\?v=[0-9a-f]{10}/.test(html) && html.indexOf('gw-answer.js') < html.indexOf('gw-fin3-core.js') && html.indexOf('gw-fin3-core.js') < html.indexOf('gw-fin3-ui.js'), 'borrowing page (V3.4, with the budget): the engine, then the V3 core, then the page script, all hashed');
  ok(!/data-range/.test(html), 'planner: no price slider in the page');
}

console.log('buyer-view: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
