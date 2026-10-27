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
  // V3.12 Stage 2 (Ken, 28 Oct): a separate loan each stays 35% by default (conservative, until banks confirm); 45% is the per-borrower alternative, shown beside it
  st = F.withHomes(two(), [{ own: '0', act: 'keep', mort: 'yes', amt: 1200 }, { own: '1', act: 'keep', mort: 'yes', amt: 900 }]);
  const b = F.borrow(st, { assumeAge: true });
  ok(b.state === 'ok' && b.ltv === 0.35 && b.altLtv === 0.45 && b.debts === 2100, 'Stage 2: two separate loans, one each: 35% by default, 45% the stated alternative; repayments $2,100 counted once each', [b.ltv, b.altLtv, b.debts]);
  st = F.withHomes(two(), [{ own: 'both', act: 'keep', mort: 'yes', amt: 1500 }]);
  ok(F.borrow(st, { assumeAge: true }).ltv === 0.45 && F.borrow(st, { assumeAge: true }).debts === 1500, 'a loan in both names is one loan: 45%, its $1,500 counted once');
  st = F.withHomes(two({ p: [{ age: 41, fixed: 9800, res: 'SC' }, { age: 37, res: 'PR', nb: true }] }), [{ own: '1', act: 'keep', mort: 'yes', amt: 900 }]);
  ok(F.borrow(st, { assumeAge: true }).ltv === 0.75 && F.dutyBuyers(st)[1].owned === 1, 'Person 2 buying without borrowing: their home loan is not a borrower’s (75%), their home still counts for stamp duty');
}

/* ---------- 4. V3.12 Stage 2 (Ken, 28 Oct 2026; Claude E's verification of MAS Notice 632 and IRAS): before and after, every corrected scenario ---------- */
// "before" is what Stage 1 (live, rel-f) gives for the same answers, run on it on 28 Oct 2026; "after" is this build. Unrelated cases must not move.
{
  const P1 = [{ age: 40, fixed: 12000 }], P2 = [{ age: 40, fixed: 9000 }, { age: 38, fixed: 7000 }];
  const h = (who, amt, o) => Object.assign({ type: 'home', who, amt }, o || {});
  const B = (st) => F.borrow(Object.assign({ bkind: 'private', ratePct: 4 }, st), { assumeAge: true });
  const mode = (m, fn) => { const m0 = F.CFG.LTV_JOINT_SEPARATE_LOANS; F.CFG.LTV_JOINT_SEPARATE_LOANS = m; try { return fn(); } finally { F.CFG.LTV_JOINT_SEPARATE_LOANS = m0; } };
  ok(F.CFG.LTV_JOINT_SEPARATE_LOANS === 'conservative', 'the internal setting LTV_JOINT_SEPARATE_LOANS defaults to conservative');
  // [name, entries, before (Stage 1), conservative (default), per_borrower, repayments]
  const L = [
    ['L1 one borrower, no housing loan', { n: 1, p: P1, loans: [] }, 0.75, 0.75, 0.75, 0],
    ['L2 one borrower, one loan', { n: 1, p: P1, loans: [h(0, 1200)] }, 0.45, 0.45, 0.45, 1200],
    ['L3 one borrower, two loans', { n: 1, p: P1, loans: [h(0, 1200), h(0, 800)] }, 0.35, 0.35, 0.35, 2000],
    ['L4 two borrowers, one separate loan each', { n: 2, p: P2, loans: [h(0, 1200), h(1, 900)] }, 0.35, 0.35, 0.45, 2100],
    ['L5 a joint loan, entered once', { n: 2, p: P2, loans: [h(0, 1500, { joint: true })] }, 0.45, 0.45, 0.45, 1500],
    ['L6 a joint loan entered as two halves, one each', { n: 2, p: P2, loans: [h(0, 750), h(1, 750)] }, 0.35, 0.35, 0.45, 1500],
    ['L7 Person 1 two loans, Person 2 none', { n: 2, p: P2, loans: [h(0, 1200), h(0, 800)] }, 0.35, 0.35, 0.35, 2000],
    ['L8 Person 1 own loan + a joint loan', { n: 2, p: P2, loans: [h(0, 1200), h(0, 1500, { joint: true })] }, 0.35, 0.35, 0.35, 2700],
    ['L9 L4 over 35 years (the lower tier)', { n: 2, p: P2, loans: [h(0, 1200), h(1, 900)], years: 35 }, 0.15, 0.15, 0.25, 2100],
    ['L10 Person 2 not borrowing (income not used), their own loan', { n: 2, p: [{ age: 40, fixed: 12000 }, { age: 38, nb: true }], loans: [h(1, 900)] }, 0.75, 0.75, 0.75, 0],
    ['L10b Person 2 borrowing (income used), their own loan', { n: 2, p: [{ age: 40, fixed: 12000 }, { age: 38, fixed: 3000 }], loans: [h(1, 900)] }, 0.45, 0.45, 0.45, 900],
    ['L11 a joint loan (2+) in both names', { n: 2, p: P2, loans: [h(0, 700, { joint: true }), h(0, 800, { joint: true })] }, 0.35, 0.35, 0.35, 1500],
    ['L12 Person 2 alone has one loan', { n: 2, p: P2, loans: [h(1, 900)] }, 0.45, 0.45, 0.45, 900],
  ];
  L.forEach(([name, st, before, cons, per, debts]) => {
    const b = B(st), bp = mode('per_borrower', () => B(st));
    ok(b.state === 'ok' && b.ltv === cons && b.debts === debts && (per > cons ? b.altLtv === per : !b.altLtv), 'Stage 2 ' + name + ': ' + Math.round(before * 100) + '% before, ' + Math.round(cons * 100) + '% now' + (per > cons ? ' (' + Math.round(per * 100) + '% stated as the alternative)' : '') + '; repayments $' + debts, [b.ltv, b.altLtv, b.debts]);
    ok(bp.state === 'ok' && bp.ltv === per && bp.debts === debts && !bp.altLtv, 'Stage 2 ' + name + ' with LTV_JOINT_SEPARATE_LOANS = per_borrower: ' + Math.round(per * 100) + '%', [bp.ltv, bp.debts]);
  });
  // T1 / T2: what TDSR counts never depends on the count
  const tdsrOf = (st) => { const b = B(st); return b.state === 'ok' ? b.maxLoan : null; };
  ok(tdsrOf(L[3][1]) === tdsrOf({ n: 2, p: P2, loans: [h(0, 2100)] }) && mode('per_borrower', () => tdsrOf(L[3][1])) === tdsrOf(L[3][1]), 'T1 two separate loans ($1,200 + $900): the income-supported loan is the one for $2,100 of repayments, in either setting');
  ok(tdsrOf(L[4][1]) === tdsrOf({ n: 2, p: P2, loans: [h(0, 1500)] }) && B(L[4][1]).debts === 1500, 'T2 a $1,500 joint loan is counted once, not once per borrower');

  // the same count on the cost card, the budget and the funding check (What will this home cost me?), from the existing-homes list
  const two = (o) => Object.assign({ n: 2, p: [{ age: 41, fixed: 9800, res: 'SC' }, { age: 37, fixed: 6500, res: 'SC' }], price: 1800000, pkind: 'completed', otp: '2027-02-01', cash: 600000, cpf: 200000, ratePct: 4, loans: [], couple: true,
    cpfBal: [{ oa: 300000, sa: 200000 }, { oa: 250000, sa: 150000 }], cover95: true, sale: { price: 900000, loan: 200000, cpfRefund: 250000 }, saleWhen: 'date', saleMonth: 4 }, o || {});
  const sep = F.withHomes(two(), [{ own: '0', act: 'keep', mort: 'yes', amt: 1200, type: 'hdb' }, { own: '1', act: 'keep', mort: 'yes', amt: 900, type: 'private' }]);
  const c4 = F.cost(sep), f4 = F.funding(sep), a4 = F.afford(Object.assign({}, sep, { price: null }));
  ok(c4.ltv === 0.35 && f4.ok && f4.r.loan.ltv === 0.35 && a4.state === 'ok' && a4.top.ltv === 0.35, 'L4 (a home each, each with its loan): 35% on the cost card, the funding check and the budget, as before', [c4.ltv, f4.ok && f4.r.loan.ltv, a4.top && a4.top.ltv]);
  ok(c4.alt && c4.alt.ltv === 0.45 && Math.round(c4.alt.loanMore) === 180000 && Math.round(c4.alt.cashMore) === -180000, 'L4 cost card: the 45% alternative at the same $1.8M price: $180,000 more loan, $180,000 less upfront (not a different price)', c4.alt);
  const sepP = mode('per_borrower', () => [F.cost(sep), F.funding(sep), F.afford(Object.assign({}, sep, { price: null }))]);
  ok(sepP[0].ltv === 0.45 && sepP[1].r.loan.ltv === 0.45 && sepP[1].i.debtsHome === 2100 && sepP[2].top.ltv === 0.45 && sepP[2].s.debts === 900 && !sepP[0].alt, 'L4 with per_borrower: 45% on all three; $2,100 of repayments in TDSR');
  ok(mode('per_borrower', () => F.cost(Object.assign({}, sep, { years: 35 })).ltv) === 0.25 && F.cost(Object.assign({}, sep, { years: 35 })).ltv === 0.15, 'L9 on the cost card: 15% by default, 25% with per_borrower');
  const mix = F.withHomes(two(), [{ own: '0', act: 'keep', mort: 'yes', amt: 1200 }, { own: 'both', act: 'keep', mort: 'yes', amt: 1500 }]);
  ok(F.cost(mix).ltv === 0.35 && F.funding(mix).r.loan.ltv === 0.35 && !F.cost(mix).alt, 'L8 from the list (Person 1’s own home + a joint home, both with loans): 35%, no alternative (unchanged)');
  const jt = F.withHomes(two(), [{ own: 'both', act: 'keep', mort: 'yes', amt: 1500 }]);
  ok(F.cost(jt).ltv === 0.45 && F.funding(jt).i.debtsHome === 1500, 'L5 from the list (a home owned by both, its loan once): 45%, $1,500 once (unchanged)');
  const nb = F.withHomes(two({ p: [{ age: 41, fixed: 9800, res: 'SC' }, { age: 37, res: 'SC', nb: true }] }), [{ own: '1', act: 'keep', mort: 'yes', amt: 900 }]);
  ok(F.cost(nb).ltv === 0.75 && F.cost(nb).absd === 360000, 'L10 from the list: Person 2 not borrowing: 75%, their home still counts for ABSD (unchanged)');

  // selling and buying, from the list: [name, homes, order, before (cost, funding), after (cost, funding), fallback, ABSD]
  const S = (list, ord) => F.withHomes(two(), list, ord);
  const SC = [
    ['S1 a home owned by both with its loan, sold first', [{ own: 'both', act: 'sell', mort: 'yes', amt: 1500, type: 'hdb' }], 'sell', [0.45, 0.75], [0.75, 0.75], 0.45, [0, 0]],
    ['S2 the same, bought first', [{ own: 'both', act: 'sell', mort: 'yes', amt: 1500, type: 'hdb' }], 'buy', [0.45, 0.45], [0.45, 0.45], null, [360000, 360000]],
    ['S3 P1 sells a paid-up home first, P2 keeps theirs with a loan', [{ own: '0', act: 'sell', mort: 'no', type: 'hdb' }, { own: '1', act: 'keep', mort: 'yes', amt: 900, type: 'private' }], 'sell', [0.45, 0.75], [0.45, 0.45], null, [360000, 360000]],
    ['S4 the same, bought first', [{ own: '0', act: 'sell', mort: 'no', type: 'hdb' }, { own: '1', act: 'keep', mort: 'yes', amt: 900, type: 'private' }], 'buy', [0.45, 0.45], [0.45, 0.45], null, [360000, 360000]],
    ['S5 a home each with its loan, P1 sells first', [{ own: '0', act: 'sell', mort: 'yes', amt: 1200, type: 'hdb' }, { own: '1', act: 'keep', mort: 'yes', amt: 900, type: 'private' }], 'sell', [0.35, 0.45], [0.45, 0.45], 0.35, [360000, 360000]],
  ];
  SC.forEach(([name, list, ord, before, after, fb, absd]) => {
    const st = S(list, ord), c = F.cost(st), f = F.funding(st);
    ok(c.ltv === after[0] && f.ok && f.r.loan.ltv === after[1] && c.absd === absd[0] && f.r.duty.absd === absd[1], name + ': loan limit ' + Math.round(before[0] * 100) + '% / ' + Math.round(before[1] * 100) + '% before (cost card / funding check), ' + Math.round(after[0] * 100) + '% / ' + Math.round(after[1] * 100) + '% now; ABSD $' + absd[0].toLocaleString('en-US') + ' in both', [c.ltv, f.ok && f.r.loan.ltv, c.absd, f.ok && f.r.duty.absd]);
    ok(fb === null ? !c.ifNot && !f.ifNot : (c.ifNot && c.ifNot.ltv === fb && f.ifNot && f.ifNot.ltv === fb), name + ': ' + (fb === null ? 'no sell-first condition' : 'sold first, the result assumes the sale documents in time; the fallback ' + Math.round(fb * 100) + '% is stated on the cost card and in the funding check'), [c.ifNot, f.ifNot]);
  });
  { const st = S(SC[0][1], 'sell'), c = F.cost(st), f = F.funding(st);
    ok(Math.round(c.ifNot.cashMore) === 540000 && c.minCash === 0.05 && c.ifNot.minCash === 0.25 && f.ifNot.minCash === 0.25, 'S1 ... 75% with 5% cash, or 45% with 25% cash: about $540,000 more upfront', c.ifNot);
    ok(f.i.debtsHome === 0 && f.i.ifNot.debtsHome === 1500, 'S1 ... TDSR leaves out the sold home’s $1,500 on the same condition, and counts it in the fallback'); }
  { const a1 = F.afford(Object.assign({}, S(SC[0][1], 'sell'), { price: null }));
    ok(a1.state === 'ok' && a1.top.ltv === 0.75 && a1.s.flat.hasLoan === 'yes', 'S1 in the budget (sold first, sale counted): the same conditional 75%'); }
  { const c = F.cost(S(SC[1][1], 'buy')), f = F.funding(S(SC[1][1], 'buy'));
    ok(c.mayRise && f.mayRise && !c.ifNot, 'S2 bought first: 45%, with the note that the limit may rise once the bank has the sale documents (not assumed)'); }
  { const c = F.cost(S(SC[2][1], 'buy'));
    ok(!c.mayRise, 'S4 bought first, the sold home has no loan: no “may rise” note (the 45% is the kept home’s loan)'); }
  // the buy-first refund: never taken off the cash; the funding check counts it only when asked, as a later inflow
  const jointBuy = S(SC[1][1], 'buy'), cB = F.cost(jointBuy), fB = F.funding(jointBuy), fBr = F.funding(Object.assign({}, jointBuy, { refund: true }));
  const refundIn = (f) => (f.ok ? f.r.events || [] : []).some((e) => e.id === 'refund' && e.type === 'in' && e.cashIn > 0);
  ok((cB.dutyNotes || []).some((n) => n.id === 'refund') && !refundIn(fB) && refundIn(fBr), 'S2 ABSD: $360,000 payable upfront; the refund is a note, counted in the funding check only when asked, after the sale');
  ok(F.schedule(S(SC[0][1], 'sell')).ok && !(F.schedule(S(SC[0][1], 'sell')).events || []).some((e) => e.id === 'absd' && e.amount > 0), 'S1 ABSD: none in the payment schedule either');
  // unrelated: one buyer selling their own home, first or after
  const one = (o) => Object.assign(two(), { n: 1, p: [{ age: 41, fixed: 12000, res: 'SC' }] }, o || {});
  const o1 = F.withHomes(one(), [{ own: '0', act: 'sell', mort: 'yes', amt: 1300, type: 'hdb' }], 'sell'), o2 = F.withHomes(one(), [{ own: '0', act: 'sell', mort: 'yes', amt: 1300, type: 'hdb' }], 'buy');
  ok(F.funding(o1).r.duty.absd === 0 && F.funding(o1).r.loan.ltv === 0.75 && F.funding(o2).r.duty.absd === 360000 && F.funding(o2).r.loan.ltv === 0.45 && F.cost(o1).ltv === 0.75 && F.cost(o1).ifNot.ltv === 0.45, 'one buyer selling first ($0 ABSD, 75% conditional, 45% fallback) and buying first ($360,000 upfront, 45%)');
}

console.log('ownership-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
