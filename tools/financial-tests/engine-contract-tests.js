'use strict';
/* Shared financial engine, Phase 1 (Master Planning, 6 Nov 2026): GW_ENGINE's contract. In node.
   P4 one envelope: statuses (ok / incomplete / invalid / stop / unsupported) for every engine convention; missing fields named in the case's own terms
      (required vs refine); every default the engines applied listed in assumptions[] with the value they used; provisional items flagged; figures read
      from the engine's value, never computed; cases the engines cannot express refused as unsupported, never approximated; the case is never changed.
   4b owned-property records: owners, keep/sell, loans and the sale map to the pages' own homes list (GW_FIN3.withHomes), one record per home.
   P5 no rules in the adapter: no rate, band, limit, year or arithmetic in gw-engine.js (a static scan); rules are read only as metadata.
   P6 live in one place only: Plan My Move V2 (journey/index.html, through gw-pmm.js) is the one page that loads gw-engine.js; the calculators
      keep their own engines; the Decoupling Timeline & Costs feature is not touched.
   Run from the site folder: node tools/financial-tests/engine-contract-tests.js */
const fs = require('fs'), path = require('path');
const H = require('./harness.js')(process.argv[2]);
const { R, C, T, A, S } = H;
const F = require(path.join(H.root, 'assets/js/gw-fin3-core.js'))(R, C, T, A, S);
const BUF = require(path.join(H.root, 'assets/js/gw-cpfbuf.js'))(R, C);
const E = require(path.join(H.root, 'assets/js/gw-engine.js'))(R, C, T, A, S, F, BUF);
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 500)); } };
const clone = (x) => JSON.parse(JSON.stringify(x));
const has = (b, field, need) => b.missing.some((m) => m.field === field && (!need || m.need === need));
const assumed = (b, key) => b.assumptions.find((a) => a.key === key);

// a base household: two Citizens, a jointly owned HDB flat with a loan, sold first, buying a new launch
const BASE = { schema: 'gw-case-v1',
  people: [{ age: 38, res: 'SC', income: { fixed: 9000, variable: 1000 }, cpf: { oa: 150000, sa: 80000, oaMonthly: 1600 } }, { age: 36, res: 'SC', income: { fixed: 7000 }, cpf: { oa: 120000, sa: 60000, oaMonthly: 1300 } }],
  household: { cash: 300000, cpf: 200000, couple: true }, otherLoans: [{ person: 0, monthly: 450 }],
  owned: [{ id: 'flat', type: 'hdb', owners: [0, 1], loan: { monthly: 1500 }, intent: 'sell', sale: { price: 700000, loan: 150000, cpfRefund: 260000 } }],
  purchase: { type: 'new', price: 1800000, otp: '2027-03-01', order: 'sell-first', saleTiming: { when: 'date', month: 4 } }, financing: {} };
const mod = (fn) => { const c = clone(BASE); fn(c); return c; };
const BLOCK_KEYS = ['status', 'missing', 'invalid', 'assumptions', 'provisional', 'figures', 'value', 'trace'];

/* ---------- P4 the envelope ---------- */
{
  const before = JSON.stringify(BASE), r = E.run(BASE);
  ok(JSON.stringify(BASE) === before, 'run() does not change the case');
  ok(r.schema === 'gw-result-v1' && r.version === E.VERSION && r.status === 'ok' && !r.issues.length, 'a complete case: gw-result-v1, status ok, no issues', [r.status, r.issues]);
  ok(['borrow', 'cost', 'stampDuty', 'schedule', 'afford', 'funding', 'sale', 'cpf', 'cpfBuffer'].every((k) => r.blocks[k]), 'the blocks a case can answer are all run', Object.keys(r.blocks));
  ok(Object.keys(r.blocks).every((k) => BLOCK_KEYS.every((x) => x in r.blocks[k])), 'every block has the same shape');
  ok(r.trace.rulesChecked === R.checked && r.trace.ratesValidUntil === R.ratesValidUntil && r.trace.ltvMode === F.CFG.LTV_JOINT_SEPARATE_LOANS && r.trace.engines.timeline === T.VERSION, 'trace: rules checked, rates valid until, LTV setting, engine versions');
  // figures are read from the value (no figure of the adapter's own)
  const k = r.blocks.cost;
  ok(Object.keys(k.figures).every((f) => k.figures[f] === k.value[f]), 'cost figures are the cost card’s own fields');
  const sa = r.blocks.sale;
  ok(sa.figures.total === sa.value.total && sa.figures.costs === sa.value.costs.total && sa.figures.ssd === sa.value.costs.ssd && sa.figures.cash === sa.value.cash && sa.figures.cpf === sa.value.cpf, 'sale figures are the sale engine’s own fields');
  const d = r.blocks.stampDuty;
  ok(d.figures.bsd === k.value.bsd && d.figures.absd === k.value.absd && d.figures.duty === k.value.duty, 'stamp duty is the cost card’s own (no second calculation)');
  ok(r.blocks.cpf.figures.refund === sa.value.cpf && r.blocks.cpf.figures.usedForPurchase === k.value.cpfUsed, 'CPF is read from the sale and the cost card');
  // the blocks equal the GW_FIN3 answers for the same entries
  const st = E.toFin3(BASE);
  ok(JSON.stringify(r.blocks.borrow.value) === JSON.stringify(F.borrow(st, { assumeAge: false })) && JSON.stringify(k.value) === JSON.stringify(F.cost(st)), 'borrow and cost values are GW_FIN3’s answers');
  // assumptions: what the engines defaulted, with the value they used
  ok(assumed(k, 'financing.ratePct') && assumed(k, 'financing.ratePct').value === k.value.ratePct && assumed(k, 'financing.years').value === k.value.years, 'no rate or tenure given: the rate and tenure the engine used are listed as defaults', k.assumptions);
  ok(assumed(k, 'ltvJointSeparateLoans').value === 'conservative' && assumed(k, 'ltvJointSeparateLoans').basis === 'convention', 'two people: the joint-loans LTV setting is listed as a convention');
  ok(assumed(sa, 'owned[0].sale.commissionPct').value === sa.value.costs.commissionPct && assumed(sa, 'owned[0].sale.legal').value === sa.value.costs.legal, 'sale: the usual commission and legal fee are listed with the figures used');
  ok(k.provisional.some((p) => p.key === 'finalStage') && k.provisional.some((p) => p.key === 'saleEvidence'), 'new launch: final 15% provisional; sold first: the sale-evidence condition', k.provisional);
  const r2 = E.run(mod((c) => { c.financing = { ratePct: 3.5, years: 25 }; }));
  ok(!assumed(r2.blocks.cost, 'financing.ratePct') && !assumed(r2.blocks.cost, 'financing.years') && r2.blocks.cost.value.ratePct === 3.5, 'rate and tenure given: not listed as assumptions');
  const r3 = E.run(mod((c) => { delete c.people[0].res; }));
  ok(assumed(r3.blocks.cost, 'people[0].res') && assumed(r3.blocks.cost, 'people[0].res').value === F.dutyBuyers(E.toFin3(r3 && mod((c) => { delete c.people[0].res; })))[0].res, 'no residency: the residency the engine used is listed', r3.blocks.cost.assumptions);
}
// missing data
{
  let r = E.run(mod((c) => { delete c.people[0].age; }));
  ok(r.blocks.borrow.status === 'incomplete' && has(r.blocks.borrow, 'people[0].age', 'required') && r.blocks.borrow.value.state === 'need', 'no age: How much can I borrow? waits for it (required)');
  ok(r.blocks.cost.status === 'ok', 'no age: the cost card still answers (the engine takes the loan to end by 65)');
  r = E.run(mod((c) => { delete c.people[0].age; }), ['borrow'], { assumeAge: true });
  ok(r.blocks.borrow.status === 'ok' && assumed(r.blocks.borrow, 'people.age') && assumed(r.blocks.borrow, 'people.age').value === r.blocks.borrow.value.age, 'no age, assumeAge: the age the engine took is listed', r.blocks.borrow.assumptions);
  r = E.run(mod((c) => { delete c.purchase.price; }));
  ok(r.blocks.cost.status === 'incomplete' && has(r.blocks.cost, 'purchase.price', 'required') && r.blocks.stampDuty.status === 'incomplete', 'no price: cost and stamp duty wait for it');
  r = E.run(mod((c) => { delete c.purchase.otp; }));
  ok(r.blocks.funding === undefined && r.blocks.cost.status === 'ok', 'no option date: the funding check is not run; the cost card answers');
  ok(E.funding(mod((c) => { delete c.purchase.otp; })).status === 'incomplete', 'no option date, funding asked for: incomplete');
  r = E.run(mod((c) => { delete c.owned[0].loan.monthly; }));
  ok(r.status === 'incomplete' && r.missing.some((m) => m.field === 'owned[0].loan.monthly') && r.blocks.cost.status === 'incomplete', 'a home still being paid with no repayment: incomplete everywhere it counts (the pages wait too)', [r.status, r.missing]);
  r = E.run(mod((c) => { delete c.owned[0].sale.price; }));
  ok(r.blocks.sale.status === 'incomplete' && has(r.blocks.sale, 'owned[0].sale.price', 'required'), 'no sale price: the sale waits for it');
  r = E.run(mod((c) => { delete c.owned[0].sale.cpfRefund; }));
  ok(r.blocks.sale.status === 'ok' && has(r.blocks.sale, 'owned[0].sale.cpfRefund', 'refine') && r.blocks.sale.figures.cash === null, 'no CPF refund: the sale total, with the cash/CPF split to refine (never estimated)');
  r = E.run(mod((c) => { c.owned[0].type = 'private'; c.owned[0].sale.bought = '2024-02-01'; }));
  ok(r.blocks.sale.status === 'ok' && has(r.blocks.sale, 'owned[0].sale.sold', 'refine'), 'a private home sold with no sale date: SSD to refine', r.blocks.sale.missing);
  r = E.run(mod((c) => { c.owned[0].sale.owner55 = true; }));
  ok(r.blocks.sale.provisional.some((p) => /cpfUsable/.test(p.key)), 'an owner 55 or over: the usable CPF is provisional');
  r = E.run(mod((c) => { c.people[0].income = { fixed: 0 }; c.people[1].income = { fixed: 0 }; }), ['borrow']);
  ok(r.blocks.borrow.status === 'stop' && r.blocks.borrow.reason === 'zero', '$0 income: stop (an answer: no bank loan)');
  r = E.run(mod((c) => { c.people[0].age = 76; c.people[1].age = 76; }), ['borrow']);
  ok(r.blocks.borrow.status === 'stop' && r.blocks.borrow.reason === 'notenure', 'no tenure at that age: stop');
  r = E.run(mod((c) => { c.purchase.type = 'ec'; }), ['afford']);
  ok(r.blocks.afford.status === 'unsupported', 'What can I afford? for an EC: unsupported (the page does not ask it)');
  r = E.run(mod((c) => { c.purchase = { type: 'hdb', price: 600000, valuation: 590000 }; c.owned = []; }));
  ok(r.blocks.cost.status === 'ok' && r.blocks.cost.trace.fn === 'GW_FIN3.costHdb' && assumed(r.blocks.cost, 'financing.lender').value === 'hdb' && r.blocks.funding === undefined, 'an HDB flat: costHdb, the HDB loan listed as the default lender');
}
// status mapping for every convention
{
  const M = (v) => E.statusOf(v).status;
  ok(M({ ok: true }) === 'ok' && M({ ok: true, noTenure: true }) === 'stop' && M({ ok: false, missing: ['price'] }) === 'incomplete' && M({ ok: false, missing: [], invalid: [{ field: 'x' }] }) === 'invalid' && M({ ok: false, error: 'sold-before-bought' }) === 'invalid', 'GW_CALC / GW_TIMELINE / GW_SCHEDULE results');
  ok(['ok', 'need', 'invalid', 'zero', 'notenure', 'hdb'].map((s) => M({ state: s })).join() === 'ok,incomplete,invalid,stop,stop,unsupported', 'GW_FIN3 states');
  ok(['ok', 'empty', 'income', 'ask-home', 'ask-flat', 'ask-cpf', 'invalid', 'no-income', 'out-of-reach', 'hdb'].map((s) => M({ state: s })).join() === 'ok,incomplete,incomplete,incomplete,incomplete,incomplete,invalid,stop,stop,unsupported', 'GW_ANSWER states');
  const g = E.call('calc.ssd', { price: 1e6, bought: '2025-07-07', sold: '2029-07-06' });
  ok(g.status === 'ok' && g.value.ssd === C.ssd({ price: 1e6, bought: '2025-07-07', sold: '2029-07-06' }).ssd, 'call(): an engine function as it is');
  ok(E.call('calc.ssd', { price: 1e6 }).status === 'incomplete' && E.call('calc.ssd', { price: 1e6 }).missing.map((m) => m.field).join() === 'bought,sold', 'call(): the engine’s own missing fields');
  let threw = false; try { E.call('calc.notAFunction', {}); } catch (e) { threw = true; } ok(threw, 'call(): an unknown function is refused');
}
// unsupported and invalid: refused, never approximated
{
  const R0 = (fn) => E.run(mod(fn));
  ok(R0((c) => { c.people.push(clone(c.people[0])); }).status === 'unsupported', 'three people: unsupported');
  ok(R0((c) => { c.owned.push({ id: 'condo', type: 'private', owners: [0], intent: 'sell' }); }).status === 'unsupported', 'two homes sold: unsupported');
  ok(R0((c) => { c.owned[0].type = 'ec'; }).status === 'unsupported', 'an EC owned: unsupported (the pages list HDB or private)');
  ok(R0((c) => { c.people[0].fta = true; }).status === 'unsupported', 'FTA treatment for a Citizen: unsupported');
  ok(R0((c) => { c.people[0].borrows = false; }).status === 'unsupported', 'the first person not borrowing: unsupported');
  const bad = R0((c) => { c.owned[0].owners = [2]; });
  ok(bad.status === 'invalid' && bad.issues.some((x) => x.field === 'owned[0].owners') && !Object.keys(bad.blocks).length, 'an owner who is not in the case: invalid, nothing worked out');
  ok(R0((c) => { c.purchase.type = 'shophouse'; }).status === 'invalid' && R0((c) => { c.people[0].res = 'XX'; }).status === 'invalid' && R0((c) => { c.owned[0].intent = 'rent'; }).status === 'invalid', 'an unknown purchase type, residency or intent: invalid');
}

/* ---------- 4b owned-property records ---------- */
{
  const st = E.toFin3(BASE);
  ok(st.owned.join() === '1,1' && st.homeJoint === true && st.soldOwners.join() === '0,1' && st.order === 'sell' && st.plan === 'sell', 'a flat owned by both, sold first: one home each, owned jointly, both selling');
  const rows = st.loans.filter((l) => l.type === 'home');
  ok(rows.length === 1 && rows[0].joint === true && rows[0].prim === true && rows[0].amt === 1500, 'its loan: one row, in both names, the home being sold');
  ok(st.loans.some((l) => l.type !== 'home' && l.amt === 450 && l.who === 0), 'other repayments kept, each person’s own');
  const s2 = E.toFin3(mod((c) => { c.owned = [{ id: 'a', type: 'hdb', owners: [0], loan: { monthly: 800 }, intent: 'keep' }, { id: 'b', type: 'private', owners: [1], loan: { monthly: 1000 }, intent: 'sell', sale: { price: 1200000 } }]; }));
  ok(s2.owned.join() === '1,1' && s2.homeJoint === false && s2.soldOwners.join() === '1' && s2.sale.type === 'private' && s2.loans.filter((l) => l.type === 'home')[0].amt === 1000, 'a home each, the second person’s private home sold: counted per person, the sold home first');
  const s3 = E.toFin3(mod((c) => { c.owned = [{ id: 'a', type: 'hdb', owners: [0], intent: 'keep' }, { id: 'b', type: 'private', owners: [0, 1], intent: 'keep' }]; delete c.purchase.order; }));
  ok(s3.owned.join() === '2,1' && s3.order === 'none' && s3.plan === 'keep', 'mixed: two and one, both kept');
  const s4 = E.toFin3(mod((c) => { delete c.purchase.order; }));
  ok(s4.order === 'buy', 'a home sold with no order chosen: the pages’ own default, buy first');
  const f4 = E.funding(mod((c) => { delete c.purchase.order; }));
  ok(f4.status === 'ok' && assumed(f4, 'purchase.order') && assumed(f4, 'purchase.order').value === 'buy-first', 'and the funding check lists it as an assumption');
  // "if I sold it": a home kept, its sale figures run through the same engine
  const keepCase = mod((c) => { c.owned[0].intent = 'keep'; delete c.purchase.order; });
  const sk = E.sale(keepCase, 'flat'), stk = E.toFin3(keepCase);
  ok(sk.status === 'ok' && JSON.stringify(sk.value) === JSON.stringify(F.sell(stk)), 'a home kept: sale(case, id) gives what it would sell for, the sale engine’s own answer');
  ok(E.sale(keepCase).status === 'incomplete' && E.sale(keepCase).reason === 'no-sale', 'with no home being sold, sale() without an id says so');
}

/* ---------- P5 no rules in the adapter ---------- */
{
  const src = fs.readFileSync(path.join(H.root, 'assets/js/gw-engine.js'), 'utf8');
  // code only: comments, strings and regular expressions removed
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/`(?:\\.|[^`\\])*`/g, '``').replace(/([=(,:!&|?{};>]|return)\s*\/(?![*\/])(?:\\.|\[[^\]]*\]|[^\/\n])+\/[gimsuy]*/g, '$1 /re/');
  const nums = (code.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w])/g) || []).filter((n) => ['0', '1', '2'].indexOf(n) < 0);
  ok(!nums.length, 'no number in the adapter’s code other than 0, 1 and 2 (indices and people)', nums.slice(0, 10));
  ok(!/Math\./.test(code), 'no Math in the adapter (nothing is calculated)');
  ok(!/[\w)\]]\s*[*\/]\s*[\w(]/.test(code.replace(/\/re\//g, '')), 'no multiplication or division in the adapter', (code.match(/[\w)\]]\s*[*\/]\s*[\w(]/g) || []).slice(0, 5));
  const rulesRead = (code.match(/\bR\.[\w.]+/g) || []).filter((x, i, a) => a.indexOf(x) === i).sort();
  ok(rulesRead.every((x) => /^R\.(checked|ratesValidUntil|plannerConventions(\.checked|\.finalStage(\.provisional|\.note)?)?)$/.test(x)), 'rules are read only as metadata (dates checked, the provisional final-stage flag and note)', rulesRead);
  ok(!/\b(bsdBands|absd|ltv|tdsr|msr|stressRate|cpfOaRate|hdbLoanRate)\s*:/.test(code), 'no rule table defined in the adapter');
}

/* ---------- P6 live only in Plan My Move V2; Decoupling untouched ---------- */
{
  const html = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/^(\.git|node_modules)$/.test(e.name)) walk(p); } else if (/\.html?$/.test(e.name)) html.push(p); });
  walk(H.root);
  const refs = html.filter((p) => /gw-engine\.js/.test(fs.readFileSync(p, 'utf8')));
  const rel = refs.map((p) => path.relative(H.root, p).split(path.sep).join('/'));
  ok(html.length > 20 && rel.join() === 'journey/index.html', 'only Plan My Move V2 (journey/) loads gw-engine.js (' + html.length + ' pages checked)', rel);
  const js = fs.readdirSync(path.join(H.root, 'assets/js')).filter((f) => f !== 'gw-engine.js' && /\.js$/.test(f));
  const users = js.filter((f) => /GW_ENGINE|gw-engine/.test(fs.readFileSync(path.join(H.root, 'assets/js', f), 'utf8')));
  // HSU P1 (6 Nov 2026): gw-engine-position.js is GW_ENGINE's own extension (its position and compare blocks), loaded by no page yet
  ok(users.join() === 'gw-engine-position.js,gw-pmm.js', 'only the V2 journey (gw-pmm.js) and GW_ENGINE’s own extension (gw-engine-position.js) use GW_ENGINE; no calculator does', users);
  ok(!fs.existsSync(path.join(H.root, 'assets/js/gw-decouple.js')) && !fs.existsSync(path.join(H.root, 'tools/decoupling')) && !/decoupl/i.test(fs.readFileSync(path.join(H.root, 'assets/js/gw-engine.js'), 'utf8').replace(/Not here \(kept separate on purpose\): the Decoupling Timeline & Costs engine/, '')), 'the Decoupling Timeline & Costs feature is not touched and not modelled here');
}

console.log('engine-contract-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
