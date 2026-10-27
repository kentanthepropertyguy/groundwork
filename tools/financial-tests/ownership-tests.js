'use strict';
/* V3.12 Stage 1 (Ken, 27 Oct 2026): existing homes entered one by one (owner Person 1 / Person 2 / Both, Keeping or Selling, still paying or not).
   1. fromHomes: each person's count, the home kept or sold, who owns it, and the home-loan rows (a home owned by both entered once).
   2. PARITY: every case the old household answer (homes, whose, plan, order) could express gives IDENTICAL answers through the new list:
      borrowing, the budget (assess), the cost card, the payment schedule, stamp duty and the funding check, for one or two buyers, a second buyer not
      borrowing, keeping, selling first and buying first. Stage 1 changes no figure.
   3. Cases the old answer could not express (a home each, owned separately; mixed ownership) use the engines' own per-buyer rules, as IRAS counts them.
   Run from the site folder: node tools/financial-tests/ownership-tests.js */
const H = require('./harness.js')();
const { R, C, T, A, S } = H;
const F = require('../../assets/js/gw-fin3-core.js')(R, C, T, A, S);
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 600)); } };
const strip = (x) => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === 'function' ? undefined : v)));
const same = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));

/* ---------- 1. fromHomes ---------- */
{
  const h = (own, act, mort, amt, type) => ({ own, act: act || 'keep', mort: mort || 'no', amt: amt === undefined ? null : amt, type: type || 'hdb' });
  let r = F.fromHomes([], 2);
  ok(r.owned.join() === '0,0' && r.homes === 0 && !r.sell && r.rows.length === 0, 'no homes: nobody owns one');
  r = F.fromHomes([h('0', 'keep', 'yes', 1200)], 1);
  ok(r.owned.join() === '1' && r.homes === 1 && r.rows.length === 1 && r.rows[0].who === 0 && r.rows[0].amt === 1200, 'one person, one home still being paid');
  r = F.fromHomes([h('both', 'keep', 'yes', 1500)], 2);
  ok(r.owned.join() === '1,1' && r.homeJoint === true && r.rows.length === 1, 'a home owned by both: one each, and its loan entered once');
  r = F.fromHomes([h('0', 'keep', 'yes', 1200), h('1', 'keep', 'yes', 900)], 2);
  ok(r.owned.join() === '1,1' && r.homeJoint === false && r.rows.map((x) => x.who).join() === '0,1', 'a home each, owned separately: one each, two loans, each its owner’s');
  r = F.fromHomes([h('0'), h('both', 'keep', 'yes', 1500)], 2);
  ok(r.owned.join() === '2,1' && r.rows.length === 1, 'mixed: Person 1 owns their own home and a share in one with Person 2 (2 and 1)');
  r = F.fromHomes([h('0', 'keep', 'yes', 800), h('1', 'sell', 'yes', 1000, 'private')], 2);
  ok(r.sell && r.soldOwners.join() === '1' && r.sellType === 'private' && r.rows[0].amt === 1000 && r.homeJoint === false, 'the home being sold comes first, with its own owner and type');
  r = F.fromHomes([h('0', 'keep', 'yes', null)], 1);
  ok(r.rows.length === 1 && r.rows[0].amt === null, 'still paying with no repayment typed: no amount is invented (the page asks for it)');
  r = F.fromHomes([h('0'), h('0'), h('0')], 1);
  ok(r.owned.join() === '3' && r.homes === 2, 'three homes: counted as two or more for the household answer, three for the person');
  r = F.fromHomes([h('both')], 1);
  ok(r.owned.join() === '1', 'one person: every home is theirs');
}

/* ---------- 2. parity with the household answer ---------- */
// every combination the old form could hold, rebuilt as the equivalent list; the answers must be byte-identical
{
  const P = (k, o) => Object.assign({ age: k ? 37 : 41, fixed: k ? 6500 : 9800, variable: k ? 0 : 1200, res: 'SC' }, o || {});
  let n0 = 0; const got = { borrow: 0, afford: 0, cost: 0, funding: 0 };
  const cases = [];
  for (const n of [1, 2]) for (const homes of [0, 1, 2]) for (const whose of (n === 2 && homes ? ['both', '0', '1'] : ['both']))
    for (const act of (homes ? ['keep', 'sell', 'buy'] : ['keep'])) for (const rowsN of [0, 1, 2]) {
      if (rowsN > (homes === 0 ? 0 : homes)) continue;                 // a home loan needs a home: rows beyond the homes owned are not something the list can say
      for (const nb of (n === 2 ? [false, true] : [false])) for (const res2 of (n === 2 ? ['SC', 'PR'] : ['SC'])) for (const pkind of ['new', 'completed'])
        cases.push({ n, homes, whose, act, rowsN, nb, res2, pkind });
    }
  cases.forEach((c) => {
    const who = c.whose === '1' ? 1 : 0, amts = [1300, 700];
    const legacy = { n: c.n, p: [P(0), c.n === 2 ? P(1, { res: c.res2, nb: c.nb }) : {}], cash: 420000, cpf: 160000, price: 1650000, pkind: c.pkind, akind: c.pkind === 'completed' ? 'completed' : 'new', otp: '2027-02-01',
      loans: Array.from({ length: c.rowsN }, (_, i) => ({ type: 'home', who, amt: amts[i] })).concat([{ type: 'car', who: 0, amt: 450 }]),
      homes: c.homes, whose: c.whose, plan: c.act === 'keep' ? 'keep' : 'sell', order: c.act === 'keep' ? 'none' : c.act, saleWhen: 'date', saleMonth: 4,
      sale: { type: 'hdb', price: 690000, loan: 120000, cpfRefund: 210000 }, ratePct: 4, cpfBal: [{ oa: 300000, sa: 200000 }, { oa: 250000, sa: 150000 }], cover95: true };
    const own = c.n === 1 ? '0' : c.whose === 'both' ? 'both' : c.whose;
    const list = Array.from({ length: c.homes }, (_, i) => ({ own, type: 'hdb', act: i === 0 && c.act !== 'keep' ? 'sell' : 'keep', mort: i < c.rowsN ? 'yes' : 'no', amt: i < c.rowsN ? amts[i] : null }));
    const viaList = F.withHomes(Object.assign({}, legacy, { homes: 0, whose: 'both', plan: 'keep', order: 'none' }), list, c.act === 'keep' ? undefined : c.act);
    const tag = JSON.stringify(c);
    ok(same(F.borrow(legacy, { assumeAge: true }), F.borrow(viaList, { assumeAge: true })), 'parity borrow ' + tag);
    ok(same(F.dutyBuyers(legacy), F.dutyBuyers(viaList)), 'parity stamp-duty buyers ' + tag, [F.dutyBuyers(legacy), F.dutyBuyers(viaList)]);
    ok(same(F.cost(legacy), F.cost(viaList)), 'parity cost card ' + tag);
    ok(same(F.schedule(legacy), F.schedule(viaList)), 'parity payment schedule ' + tag);
    const a1 = F.afford(legacy), a2 = F.afford(viaList);
    ok(same(a1, a2), 'parity budget (assess) ' + tag, [a1.state, a2.state, a1.budget, a2.budget]);
    const f1 = F.funding(legacy), f2 = F.funding(viaList);
    ok(same(f1, f2), 'parity funding check ' + tag, [f1.ok && f1.r.duty, f2.ok && f2.r.duty]);
    if (F.borrow(legacy, { assumeAge: true }).state === 'ok') got.borrow++; if (a1.state === 'ok') got.afford++; if (F.cost(legacy).state === 'ok') got.cost++; if (f1.ok) got.funding++;
    n0++;
  });
  ok(got.borrow === n0 && got.cost === n0 && got.afford >= n0 * 0.5 && got.funding >= n0 * 0.5, 'parity compares real figures, not missing-entry states', got);
  ok(n0 >= 150, 'parity covers every combination the old answer could hold (' + n0 + ' cases)', n0);
}

/* ---------- 3. what the old answer could not express ---------- */
{
  const two = (o) => Object.assign({ n: 2, p: [{ age: 41, fixed: 9800, res: 'SC' }, { age: 37, fixed: 6500, res: 'SC' }], price: 1650000, pkind: 'completed', otp: '2027-02-01', cash: 400000, cpf: 0, ratePct: 4, loans: [] }, o || {});
  const sep = [{ own: '0', type: 'hdb', act: 'keep', mort: 'no' }, { own: '1', type: 'private', act: 'keep', mort: 'no' }];
  let st = F.withHomes(two(), sep);
  ok(F.dutyBuyers(st).map((b) => b.owned).join() === '1,1' && F.cost(st).absdRate === 0.2, 'a home each (separately): each owns one, so ABSD 20% (IRAS: each buyer’s own count, the higher rate applies)', F.cost(st).absdRate);
  st = F.withHomes(two(), [{ own: '0', act: 'sell', mort: 'no', type: 'hdb' }, { own: '1', act: 'keep', mort: 'no', type: 'hdb' }], 'sell');
  ok(F.dutyBuyers(st).map((b) => b.owned).join() === '0,1' && F.cost(st).absdRate === 0.2, 'Person 1 sells first, Person 2 keeps theirs: Person 1 owns 0 at the purchase, Person 2 still 1, so 20%', F.dutyBuyers(st));
  st = F.withHomes(two(), [{ own: '0', act: 'keep', mort: 'no' }, { own: 'both', act: 'keep', mort: 'no' }]);
  ok(F.dutyBuyers(st).map((b) => b.owned).join() === '2,1' && F.cost(st).absdRate === 0.3, 'mixed (Person 1: their own home and a share of one with Person 2): 2 and 1, so 30% for Person 1 as a Citizen buying a third', F.cost(st).absdRate);
  st = F.withHomes(two(), [{ own: 'both', act: 'sell', mort: 'yes', amt: 1200, type: 'hdb' }], 'sell');
  ok(F.dutyBuyers(st).map((b) => b.owned).join() === '0,0' && F.cost(st).absd === 0, 'a home owned by both, sold first: it leaves both owners (IRAS: excluded once the buyer has exercised the option), so no ABSD on the cost card');
  // Stage 1 keeps today's loan-count rule: two separate home loans are added together (Stage 2 corrects this to each borrower's own count, 45%)
  st = F.withHomes(two(), [{ own: '0', act: 'keep', mort: 'yes', amt: 1200 }, { own: '1', act: 'keep', mort: 'yes', amt: 900 }]);
  const b = F.borrow(st, { assumeAge: true });
  ok(b.state === 'ok' && b.ltv === 0.35 && b.debts === 2100, 'Stage 1 parity: two separate loans still counted 1 + 1 (35%), repayments $2,100 once each; Stage 2 changes the count to 45% (Ken, 27 Oct)', [b.ltv, b.debts]);
  st = F.withHomes(two(), [{ own: 'both', act: 'keep', mort: 'yes', amt: 1500 }]);
  ok(F.borrow(st, { assumeAge: true }).ltv === 0.45 && F.borrow(st, { assumeAge: true }).debts === 1500, 'a loan in both names is one loan: 45%, its $1,500 counted once');
  st = F.withHomes(two({ p: [{ age: 41, fixed: 9800, res: 'SC' }, { age: 37, res: 'PR', nb: true }] }), [{ own: '1', act: 'keep', mort: 'yes', amt: 900 }]);
  ok(F.borrow(st, { assumeAge: true }).ltv === 0.75 && F.dutyBuyers(st)[1].owned === 1, 'Person 2 buying without borrowing: their home loan is not a borrower’s (75%), their home still counts for stamp duty');
}

console.log('ownership-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
