'use strict';
/* Shared financial engine, Phase 1 (Master Planning, 6 Nov 2026): GW_ENGINE (assets/js/gw-engine.js) is a thin adapter. Exact numerical parity, bit for bit.
   P1 golden: every golden scenario run through GW_ENGINE.call gives the engine's own result, identical (JSON, every number exact), and the golden.json snapshot;
      the engines never change their input. (The 2 'hdbUpgrade' scenarios test the retired HDB Upgrade V1 analyse(), which no page and not the adapter uses:
      golden-tests.js keeps covering them.)
   P3 round trip: seeded page entries (the calculator pages' own GW_FIN3 state + the homes list + buy or sell first) -> a case (fromFin3) -> GW_FIN3 state (toFin3):
      every GW_FIN3 answer (borrow, with and without the assumed age; afford; cost; costHdb; schedule; funding; sell; cpfBuffer; incomeNeeded) is identical,
      and each GW_ENGINE block returns exactly that answer as its value. Ownership: the V3.12 Stage 1 grid (every household answer as a list) plus mixed and
      separate ownership, keeping, selling first and buying first.
   P2 (the 2,301 independent engine cases through the adapter) is independent-tests.py with GW_ENGINE_BATCH=engine_batch_adapter.js.
   Run from the site folder: node tools/financial-tests/engine-parity-tests.js */
const path = require('path');
const H = require('./harness.js')(process.argv[2]);
const { R, C, T, A, S } = H;
const F = require(path.join(H.root, 'assets/js/gw-fin3-core.js'))(R, C, T, A, S);
const BUF = require(path.join(H.root, 'assets/js/gw-cpfbuf.js'))(R, C);
const E = require(path.join(H.root, 'assets/js/gw-engine.js'))(R, C, T, A, S, F, BUF);
const { leaves, run } = require('./golden-lib.js');
let pass = 0, fail = 0; const firstFails = {};
const ok = (c, group, name, info) => { if (c) pass++; else { fail++; firstFails[group] = (firstFails[group] || 0) + 1; if (firstFails[group] <= 4) console.log('FAIL', group, name, info === undefined ? '' : JSON.stringify(info).slice(0, 500)); } };
const strip = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x, (k, v) => (typeof v === 'function' ? undefined : v)));
const same = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));
const clone = (x) => JSON.parse(JSON.stringify(x));
const count = {}; const STAT = {};
const tally = (g) => { count[g] = (count[g] || 0) + 1; };

/* ---------- P1 golden scenarios through call() ---------- */
{
  const golden = require('./golden.json'), scenarios = require('./scenarios.js');
  const NAME = { timeline: 'timeline.timeline', assess: 'answer.assess' };
  const near = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 0.005 + 1e-9 * Math.abs(b) : a === b);
  scenarios.forEach(([fn, id, input]) => {
    if (fn === 'hdbUpgrade') return;
    const name = NAME[fn] || 'calc.' + fn, inA = clone(input), before = JSON.stringify(inA);
    const direct = run(H, fn, clone(input)), viaE = E.call(name, inA);
    tally('P1');
    ok(same(direct, viaE.value), 'P1', id + ': call() returns the engine result unchanged', [fn]);
    ok(JSON.stringify(inA) === before, 'P1', id + ': the input is not changed');
    const lv = leaves(viaE.value, '', {}), want = golden[id];
    ok(want && Object.keys(want).every((k) => near(lv[k], want[k])) && Object.keys(lv).every((k) => k in want), 'P1', id + ': matches golden.json');
    const st = viaE.value && (viaE.value.ok === true || viaE.value.state === 'ok');
    ok(st ? viaE.status === 'ok' || viaE.status === 'stop' : viaE.status !== 'ok', 'P1', id + ': status ' + viaE.status);
  });
}

/* ---------- P3 page entries -> case -> page entries ---------- */
let seed = 20261106;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pickOf = (a) => a[Math.floor(rnd() * a.length)];
const maybe = (p, v) => (rnd() < p ? v : undefined);
const FNS = {
  borrow: (st) => F.borrow(st), borrowAssumed: (st) => F.borrow(st, { assumeAge: true }), afford: (st) => F.afford(st), cost: (st) => (st.pkind === 'hdb' || st.pkind === 'bto' ? F.costHdb(st) : F.cost(st)),
  schedule: (st) => F.schedule(st), funding: (st) => F.funding(st), sell: (st) => F.sell(st), flat: (st) => F.flat(st),
  incomeNeeded: (st) => { const c = F.cost(st); return F.incomeNeeded(st, c); }, cpfBuffer: (st) => { const c = F.cost(st); return F.cpfBuffer(st, c, BUF); } };
// the GW_ENGINE block that returns each answer as its value
const BLOCK = { borrow: (c) => E.borrow(c), borrowAssumed: (c) => E.borrow(c, { assumeAge: true }), afford: (c) => E.afford(c), cost: (c) => E.cost(c), schedule: (c) => E.schedule(c),
  funding: (c) => E.funding(c), sell: (c) => E.sale(c, c.owned[Math.max(0, c.owned.findIndex((h) => h.intent === 'sell'))].id), cpfBuffer: (c) => E.cpfBuffer(c) };
function pageCase(o) {
  const P = (k, x) => Object.assign({ age: k ? 37 : 41, fixed: k ? 6500 : 9800, variable: k ? 0 : 1200, res: 'SC' }, x || {});
  const pkind = o.pkind, base = { n: o.n, p: [P(0, o.p0), o.n === 2 ? P(1, Object.assign({ res: o.res2, nb: o.nb }, o.p1)) : {}],
    cash: o.cash, cpf: o.cpf, price: o.price, pkind: pkind, otp: o.otp, loans: o.other ? [{ type: 'car', who: 0, amt: o.other }] : [],
    homes: 0, whose: 'both', plan: 'keep', order: 'none', saleWhen: o.saleWhen, saleMonth: o.saleMonth, saleDate: o.saleDate, saleAfter: o.saleAfter, refund: o.refund, rent: o.rent,
    sale: o.sale, ratePct: o.ratePct, years: o.years, loanAmt: o.loanAmt, cpfBal: o.cpfBal, cover95: o.cover95, couple: o.couple, valuation: o.valuation, top: o.top, csc: o.csc,
    noDate: o.noDate, saveMo: o.saveMo, cpfMo: o.cpfMo, oaMo: o.oaMo, hdbLoan: o.hdbLoan, household: o.household, lease: o.lease, btoRoom: o.btoRoom };
  if (pkind === 'new' || pkind === 'completed') base.akind = pkind; else if (pkind === 'hdb' || pkind === 'bto') base.akind = 'hdb';
  base.bkind = pkind === 'hdb' || pkind === 'bto' ? 'hdb' : pkind === 'ec' ? 'ec' : 'private';
  if (pkind === 'hdb' || pkind === 'bto') { base.flatPrice = o.price; base.flatVal = o.valuation; }
  Object.keys(base).forEach((k) => { if (base[k] === undefined) delete base[k]; });
  return base;
}
const cases = [];
// (a) the V3.12 Stage 1 grid, as ownership-tests.js builds it
for (const n of [1, 2]) for (const homes of [0, 1, 2]) for (const whose of (n === 2 && homes ? ['both', '0', '1'] : ['both']))
  for (const act of (homes ? ['keep', 'sell', 'buy'] : ['keep'])) for (const rowsN of [0, 1, 2]) {
    if (rowsN > homes) continue;
    for (const nb of (n === 2 ? [false, true] : [false])) for (const res2 of (n === 2 ? ['SC', 'PR'] : ['SC'])) for (const pkind of ['new', 'completed']) {
      const own = n === 1 ? '0' : whose === 'both' ? 'both' : whose, amts = [1300, 700];
      cases.push({ o: { n, nb, res2, pkind, cash: 420000, cpf: 160000, price: 1650000, otp: '2027-02-01', other: 450, saleWhen: 'date', saleMonth: 4,
        sale: { type: 'hdb', price: 690000, loan: 120000, cpfRefund: 210000 }, ratePct: 4, cpfBal: [{ oa: 300000, sa: 200000 }, { oa: 250000, sa: 150000 }].slice(0, n), cover95: true },
        list: Array.from({ length: homes }, (_, i) => ({ own, type: 'hdb', act: i === 0 && act !== 'keep' ? 'sell' : 'keep', mort: i < rowsN ? 'yes' : 'no', amt: i < rowsN ? amts[i] : null })),
        order: act === 'keep' ? undefined : act, tag: 'grid' });
    }
  }
// (b) seeded variety: every purchase type, mixed and separate ownership, private homes sold (SSD dates), 55+, figures handed over, dates, rates, tenures, typed loans
for (let k = 0; k < 1500; k++) {
  const n = rnd() < 0.55 ? 2 : 1, pkind = pickOf(['new', 'new', 'ec', 'completed', 'completed', 'resaleec', 'hdb', 'bto']);
  const nh = pickOf([0, 0, 1, 1, 1, 2, 3]), owners = n === 1 ? ['0'] : ['0', '1', 'both'];
  const list = Array.from({ length: nh }, () => ({ own: pickOf(owners), type: pickOf(['hdb', 'hdb', 'private']), act: 'keep', mort: pickOf(['yes', 'no']), amt: null }));
  list.forEach((h) => { if (h.mort === 'yes') h.amt = Math.round(300 + rnd() * 3000); });
  const sellI = nh && rnd() < 0.6 ? Math.floor(rnd() * nh) : -1; if (sellI >= 0) list[sellI].act = 'sell';
  const sold = sellI >= 0 ? list[sellI] : null, priv = sold && sold.type === 'private';
  const sale = sold ? { type: sold.type, price: Math.round(500000 + rnd() * 2000000), loan: maybe(0.7, Math.round(rnd() * 400000)), cpfRefund: maybe(0.75, Math.round(rnd() * 400000)),
    comm: maybe(0.2, pickOf([1, 1.5, 2])), legal: maybe(0.2, 2500), penalty: maybe(0.1, 5000), o55: maybe(0.15, 'yes'), cpfUse: maybe(0.05, 50000), cpf55: maybe(0.05, 40000),
    bought: priv ? maybe(0.8, pickOf(['2019-05-01', '2023-08-15', '2024-02-01', '2025-09-01'])) : undefined, sold: priv ? maybe(0.8, pickOf(['2026-12-01', '2027-06-30'])) : undefined,
    held: priv ? maybe(0.3, true) : undefined } : undefined;
  if (sale) Object.keys(sale).forEach((x) => { if (sale[x] === undefined) delete sale[x]; });
  if (sale && rnd() < 0.08) { sale.oCash = Math.round(rnd() * 300000); sale.oCpf = Math.round(rnd() * 200000); }
  const dated = rnd() < 0.85, otp = dated ? pickOf(['2026-12-01', '2027-03-01', '2027-09-15']) : undefined;
  const ages = [Math.round(25 + rnd() * 40), Math.round(25 + rnd() * 40)];
  cases.push({ o: { n, nb: n === 2 && rnd() < 0.2, res2: pickOf(['SC', 'SC', 'PR', 'FR', 'FTA']), pkind, cash: Math.round(rnd() * 800000), cpf: maybe(0.85, Math.round(rnd() * 400000)),
    price: maybe(0.95, Math.round(600000 + rnd() * 3500000)), otp, noDate: dated ? undefined : true, other: maybe(0.4, Math.round(rnd() * 1500)),
    p0: { age: maybe(0.95, ages[0]), res: pickOf(['SC', 'SC', 'SC', 'PR', 'FR']), fixed: Math.round(rnd() * 20000), variable: maybe(0.4, Math.round(rnd() * 5000)) },
    p1: { age: maybe(0.95, ages[1]), fixed: Math.round(rnd() * 15000) },
    saleWhen: pickOf(['unsure', 'date', 'afterKeys', undefined]), saleMonth: maybe(0.5, pickOf([2, 5, 9])), saleDate: maybe(0.2, '2027-08-01'), saleAfter: maybe(0.3, 3), refund: maybe(0.3, true),
    rent: maybe(0.15, 3500), sale, ratePct: maybe(0.4, pickOf([2.8, 3.5, 4.5])), years: maybe(0.3, pickOf([15, 25, 30, 35])), loanAmt: maybe(0.15, Math.round(rnd() * 2000000)),
    cpfBal: maybe(0.4, [{ oa: Math.round(rnd() * 300000), sa: Math.round(rnd() * 200000) }, { oa: Math.round(rnd() * 300000), sa: Math.round(rnd() * 200000) }].slice(0, n)),
    cover95: maybe(0.5, rnd() < 0.5), couple: n === 2 ? maybe(0.5, rnd() < 0.7) : undefined, valuation: maybe(0.2, Math.round(600000 + rnd() * 3000000)),
    top: maybe(0.3, '2030-06-01'), csc: maybe(0.15, '2031-06-01'), saveMo: maybe(0.3, 2000), cpfMo: maybe(0.3, 1500), oaMo: maybe(0.4, [1600, 1200].slice(0, n)),
    hdbLoan: (pkind === 'hdb' || pkind === 'bto') ? maybe(0.6, pickOf(['hdb', 'bank'])) : undefined, household: maybe(0.2, pickOf(['family', 'extended', 'single'])), lease: maybe(0.2, pickOf([60, 75, 90])),
    btoRoom: pkind === 'bto' ? pickOf(['2', '3', '4']) : undefined },
    list, order: sellI >= 0 ? pickOf(['sell', 'buy', undefined]) : undefined, tag: 'seeded' });
}
cases.forEach((x, idx) => {
  const st0 = pageCase(x.o), pageSt = F.withHomes(st0, x.list, x.order);
  const c = E.fromFin3(st0, x.list, x.order), st2 = E.toFin3(clone(c)), before = JSON.stringify(c);
  Object.keys(FNS).forEach((f) => {
    if (f === 'sell' && !x.list.length) return;   // a sale belongs to a home owned (the Sale proceeds page's figures with no home listed are not a case)
    let a, b; try { a = FNS[f](pageSt); } catch (e) { a = { threw: e.message }; } try { b = FNS[f](st2); } catch (e) { b = { threw: e.message }; }
    tally('P3 ' + f); ok(same(a, b), 'P3 ' + f, x.tag + ' #' + idx + ': page entries and the case give the identical answer', { pkind: x.o.pkind, list: x.list, order: x.order });
    if (BLOCK[f]) {
      const blk = BLOCK[f](c);
      if (f === 'schedule' && (x.o.pkind === 'hdb' || x.o.pkind === 'bto')) a = F.costHdb(pageSt);   // an HDB flat's payment steps are costHdb's (GW_SCHEDULE.hdb)
      // a block that declines to run (afford for an EC; the CPF buffer outside a new launch) says so; otherwise its value IS the page's answer
      const declined = blk.status === 'unsupported' && (f === 'afford' || f === 'cpfBuffer') || (f === 'sell' && !x.list.some((h) => h.act === 'sell')) || (f === 'funding' && (x.o.pkind === 'hdb' || x.o.pkind === 'bto'));
      tally('P3 block ' + f); STAT[f] = STAT[f] || {}; STAT[f][blk.status] = (STAT[f][blk.status] || 0) + 1; ok(declined || same(blk.value, a), 'P3 block ' + f, x.tag + ' #' + idx + ': the block value is the page answer', { pkind: x.o.pkind, st: blk.status });
    }
  });
  ok(JSON.stringify(c) === before, 'P3 case', '#' + idx + ': the case is not changed');
});

// the stamp duty block is the cost card's own (no second calculation), and equals GW_CALC.stampDuty run by itself with the same buyers
cases.filter((x) => x.o.price && x.o.pkind === 'completed').slice(0, 400).forEach((x, i) => {
  const st0 = pageCase(x.o), pageSt = F.withHomes(st0, x.list, x.order), c = E.fromFin3(st0, x.list, x.order), d = E.stampDuty(c);
  if (d.status !== 'ok') return;
  const dir = C.stampDuty({ price: Math.max(pageSt.price, pageSt.valuation || 0), kind: 'private', buyers: F.dutyBuyers(pageSt), couple: pageSt.couple });
  tally('P3 duty'); ok(dir.ok && dir.bsd === d.figures.bsd && dir.absd === d.figures.absd, 'P3 duty', '#' + i + ': duty equals GW_CALC.stampDuty', [dir.bsd, dir.absd, d.figures]);
});

console.log('block statuses: ' + Object.keys(STAT).map((f) => f + ' ' + JSON.stringify(STAT[f])).join(' · '));
console.log(Object.keys(count).map((g) => g + ' ' + count[g]).join(' · '));
console.log('engine-parity-tests: ' + pass + ' passed, ' + fail + ' failed (' + cases.length + ' page cases)');
process.exit(fail ? 1 : 0);
