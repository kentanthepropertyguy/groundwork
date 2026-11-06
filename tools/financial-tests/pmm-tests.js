'use strict';
/* Plan My Move V2 (Master Planning, 6 Nov 2026), in node: assets/js/gw-pmm.js turns the journey's answers into one gw-case-v1 case for GW_ENGINE.
   1 the case: one record for the home owned (owners, loan, keep or sell, the sale), sell first when selling, blanks never filled in
   2 what each step still needs, in the visitor's words; a housing loan with no repayment is asked for in the approved words, never taken as $0
   3 FINANCIAL PARITY, seeded households: the journey's budget, borrowing limit, sale and home costs are exactly the calculators' own answers
     (GW_FIN3 for the same entries as the calculator pages build them, through withHomes), to the cent
   4 no figure without the answers it needs; the summary sheet only with a budget; next steps carry no figures
   5 no rule in the journey's code: no rate, band or limit; the engines do the calculating
   Run from the site folder: node tools/financial-tests/pmm-tests.js */
const fs = require('fs'), path = require('path');
const H = require('./harness.js')(process.argv[2]);
const { R, C, T, A, S } = H;
const F = require(path.join(H.root, 'assets/js/gw-fin3-core.js'))(R, C, T, A, S);
const BUF = require(path.join(H.root, 'assets/js/gw-cpfbuf.js'))(R, C);
const E = require(path.join(H.root, 'assets/js/gw-engine.js'))(R, C, T, A, S, F, BUF);
const P = require(path.join(H.root, 'assets/js/gw-pmm.js'));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; if (fail < 12) console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 500)); } };
const strip = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x, (k, v) => (typeof v === 'function' ? undefined : v)));
const same = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));

/* ---------- 1 the case ---------- */
{
  ok(P.STEPS.map((x) => x[1]).join() === 'My Situation,My Budget,My Options,My Plan', 'four steps, in the approved order');
  const a = { sit: 'upgrade', n: '2', p0age: 40, p0inc: 9000, p0res: 'SC', p1age: 38, p1inc: 7000, p1res: 'PR', couple: 'yes', htype: 'hdb', hown: 'both', hloan: 'yes', hmo: 1200, ptype: 'new', cash: 100000, cpf: 80000, debts: 450, sprice: 700000, sloan: 150000, scpf: 260000 };
  const c = P.caseOf(a, 'new');
  ok(c.schema === 'gw-case-v1' && c.people.length === 2 && c.people[1].res === 'PR' && c.people[0].income.fixed === 9000 && c.household.couple === true && c.otherLoans[0].monthly === 450, 'people, household and other repayments');
  const h = c.owned[0];
  ok(c.owned.length === 1 && h.type === 'hdb' && h.owners.join() === '0,1' && h.loan.monthly === 1200 && h.intent === 'sell' && h.sale.price === 700000 && h.sale.loan === 150000 && h.sale.cpfRefund === 260000, 'one record for the home owned: owners, loan, sold, its sale', h);
  ok(c.purchase.type === 'new' && c.purchase.order === 'sell-first', 'selling: sell first (how the budget is worked out)');
  const k = P.caseOf(Object.assign({}, a, { sit: 'own', hown: '1' }), 'completed');
  ok(k.owned[0].intent === 'keep' && !k.owned[0].sale && k.owned[0].owners.join() === '1' && !k.purchase.order, 'own a home: kept, no sale, Person 2’s');
  const f = P.caseOf({ sit: 'first', n: '1', p0age: 30 }, 'new');
  ok(!f.owned.length && f.household.cash === undefined && f.people[0].income.fixed === undefined && f.household.couple === undefined, 'blanks stay blank (nothing filled in for the visitor)');
  ok(E.check(c).invalid.length === 0 && E.check(c).unsupported.length === 0, 'the engine accepts the case');
}

/* ---------- 2 what each step needs ---------- */
{
  const n0 = P.stepNeeds('situation', {});
  ok(n0.map((x) => x.key).join() === 'sit,n,p0age,p0inc', 'an empty situation asks for: situation, who, age, income', n0);
  const n1 = P.stepNeeds('situation', { sit: 'upgrade', n: '2', p0age: 40, p0inc: 9000, p1age: 38, p1inc: 0, htype: 'hdb', hown: 'both', hloan: 'yes' });
  ok(n1.length === 1 && n1[0].key === 'hmo' && n1[0].text === 'Enter your existing monthly housing loan repayment to calculate your borrowing amount.', 'a home loan with no repayment: asked for in the approved words (and $0 income is an answer)', n1);
  ok(P.stepNeeds('situation', { sit: 'upgrade', n: '1', p0age: 40, p0inc: 9000, htype: 'hdb', hloan: 'yes', hmo: 0 }).some((x) => x.key === 'hmo'), 'a $0 repayment on a home loan is still asked for');
  ok(P.stepNeeds('budget', { sit: 'upgrade' }).map((x) => x.key).join() === 'ptype,cash,cpf,sprice,sloan,scpf', 'the budget asks for the type, cash, CPF and the sale');
  ok(P.stepNeeds('budget', { sit: 'own', ptype: 'new', cash: 1, cpf: 1 }, ['oa0', 'sa0']).map((x) => x.key).join() === 'oa0,sa0', 'keeping a home with CPF: the balances the engine asks for');
}

/* ---------- 3 financial parity with the calculators ---------- */
let seed = 20261106; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (x) => x[Math.floor(rnd() * x.length)];
// the same household as the calculator pages enter it: GW_FIN3 state + the homes list (V3.12), sold first
function pageState(a, t, price) {
  const n = a.n === '2' ? 2 : 1, st = { n: n, p: [0, 1].slice(0, n).map((k) => ({ age: a['p' + k + 'age'], fixed: a['p' + k + 'inc'], res: a['p' + k + 'res'] })), loans: a.debts > 0 ? [{ type: 'other', who: 0, amt: a.debts }] : [],
    cash: a.cash, cpf: a.cpf, pkind: t, akind: t, bkind: 'private', price: price };
  if (n === 2 && (a.couple === 'yes' || a.couple === 'no')) st.couple = a.couple === 'yes';
  if (a.c95) st.cover95 = a.c95 === 'yes';
  if (a.oa0 !== undefined) st.cpfBal = [0, 1].slice(0, n).map((k) => ({ oa: a['oa' + k], sa: a['sa' + k] }));
  const sell = a.sit === 'upgrade' || a.sit === 'right', own = sell || a.sit === 'own';
  if (sell) st.sale = { price: a.sprice, loan: a.sloan, cpfRefund: a.scpf };
  const list = own ? [{ own: n === 2 ? a.hown : '0', type: a.htype, act: sell ? 'sell' : 'keep', mort: a.hloan === 'yes' ? 'yes' : 'no', amt: a.hloan === 'yes' ? a.hmo : null }] : [];
  Object.keys(st).forEach((k) => { if (st[k] === undefined) delete st[k]; });
  return F.withHomes(st, list, sell ? 'sell' : undefined);
}
let nB = 0, nH = 0, nS = 0;
for (let i = 0; i < 600; i++) {
  const n = rnd() < 0.5 ? '2' : '1', sit = pick(['first', 'first', 'own', 'upgrade', 'upgrade', 'right']), own = sit !== 'first';
  const a = { sit, n, p0age: 25 + Math.floor(rnd() * 35), p0inc: Math.round(rnd() * 20000), p0res: pick(['SC', 'SC', 'PR', 'FR']), cash: Math.round(rnd() * 600000), cpf: Math.round(rnd() * 300000), ptype: pick(['new', 'completed']) };
  if (n === '2') Object.assign(a, { p1age: 25 + Math.floor(rnd() * 35), p1inc: Math.round(rnd() * 15000), p1res: pick(['SC', 'PR']), couple: pick(['yes', 'no', undefined]), hown: pick(['0', '1', 'both']) });
  if (rnd() < 0.3) a.debts = Math.round(rnd() * 1500);
  if (own) Object.assign(a, { htype: pick(['hdb', 'private']), hloan: pick(['yes', 'no']) }), a.hmo = a.hloan === 'yes' ? Math.round(300 + rnd() * 2500) : undefined;
  if (sit === 'upgrade' || sit === 'right') Object.assign(a, { sprice: Math.round(450000 + rnd() * 2000000), sloan: Math.round(rnd() * 400000), scpf: Math.round(rnd() * 400000) });
  if (sit === 'own' && rnd() < 0.7) Object.assign(a, { oa0: Math.round(rnd() * 300000), sa0: Math.round(rnd() * 200000), oa1: Math.round(rnd() * 300000), sa1: Math.round(rnd() * 200000), c95: pick(['yes', 'no']) });
  Object.keys(a).forEach((k) => { if (a[k] === undefined) delete a[k]; });
  const t = a.ptype, st = pageState(a, t), cs = P.caseOf(a, t);
  const viaJ = E.afford(cs), viaC = F.afford(st);
  ok(same(viaJ.value, viaC), 'budget #' + i + ': the journey’s answer is the calculator’s', [a, viaJ.status]);
  if (viaJ.status === 'ok') nB++;
  ok(same(E.borrow(cs).value, F.borrow(st, { assumeAge: false })), 'borrowing #' + i);
  if (a.sprice) { ok(same(E.sale(cs).value, F.sell(st)), 'sale #' + i); nS++; }
  const price = Math.round(800000 + rnd() * 3000000);
  const hc = E.cost(P.caseOf(a, t, price)), hp = F.cost(pageState(a, t, price));
  ok(same(hc.value, hp), 'a home considered #' + i + ': its cash, loan and instalment are the cost calculator’s', [a, price]); if (hc.status === 'ok') nH++;
}
ok(nB > 250 && nH > 450 && nS > 150, 'enough of the cases produce figures to compare (' + nB + ' budgets, ' + nH + ' homes, ' + nS + ' sales)');

/* ---------- 4 no figure without the answers; the summary ---------- */
{
  const a = { sit: 'first', n: '1', p0age: 32, p0inc: 8000 };
  ok(E.afford(P.caseOf(a, 'new')).status !== 'ok', 'no cash or CPF given: no budget (never assumed)');
  const up = { sit: 'upgrade', n: '1', p0age: 40, p0inc: 9000, htype: 'hdb', hloan: 'no', cash: 1000, cpf: 1000, sprice: 600000, sloan: 0 };
  ok(E.afford(P.caseOf(up, 'new')).status !== 'ok', 'selling with no CPF refund figure: no budget that counts the sale');
  ok(P.sheetOf(a, {}, '9 Oct 2026') === null, 'no budget: no summary sheet');
  const Rb = { budget: { value: 983000, loan: 737250, monthly: 3750.56, cash: 149840, cpf: 120000, sub: 'New launch', judge: 'x' }, facts: [['Situation', 'First home']], homes: [] };
  const sh = P.sheetOf({ sit: 'first', n: '1', ptype: 'new' }, Rb, '9 Oct 2026');
  ok(sh && sh.figures[0].value === '$983,000' && sh.figures[1].value === '$737,250' && sh.figures[2].value === '$149,840' && sh.question === 'My property plan', 'the summary sheet: the figures on screen', sh && sh.figures);
  ok(P.nextSteps({ sit: 'upgrade', htype: 'hdb', homes: [] }, Rb).every((x) => !/\d/.test(x)) && P.nextSteps({}, {}).length >= 2, 'next steps: words only, no figures');
}

/* ---------- 5 no rule in the journey's code ---------- */
{
  const src = fs.readFileSync(path.join(H.root, 'assets/js/gw-pmm.js'), 'utf8');
  // a small scanner: strings, template text, regular expressions and comments out; code (and ${…} inside templates) kept
  const code = (function (t) {
    let o = '', i = 0, prev = '';
    const re = () => /[(,=:[!&|?{};+\-*%<>~^]$|^$|\breturn$/.test(prev.trimEnd());
    while (i < t.length) {
      const c = t[i], d = t[i + 1];
      if (c === '/' && d === '*') { i = t.indexOf('*/', i + 2) + 2; continue; }
      if (c === '/' && d === '/') { while (i < t.length && t[i] !== '\n') i++; continue; }
      if (c === "'" || c === '"') { i++; while (t[i] !== c) i += t[i] === '\\' ? 2 : 1; i++; o += "''"; prev = o; continue; }
      if (c === '`') { i++; o += '`'; while (t[i] !== '`') { if (t[i] === '\\') i += 2; else if (t[i] === '$' && t[i + 1] === '{') { let k = 1, j = i + 2; while (k) { if (t[j] === '{') k++; else if (t[j] === '}') k--; j++; } o += '${' + t.slice(i + 2, j - 1) + '}'; i = j; } else i++; } i++; o += '`'; prev = o; continue; }
      if (c === '/' && re()) { i++; let cls = false; while (cls || t[i] !== '/') { if (t[i] === '\\') i++; else if (t[i] === '[') cls = true; else if (t[i] === ']') cls = false; i++; } i++; while (/[a-z]/.test(t[i])) i++; o += 'RX'; prev = o; continue; }
      o += c; i++; if (!/\s/.test(c)) prev = o;
    }
    return o;
  })(src);
  const nums = (code.replace(/const UI = \{[^}]*\}/, '').match(/(?<![\w.])\d+(?:\.\d+)?(?![\w])/g) || []).filter((x) => ['0', '1', '2', '3', '4'].indexOf(x) < 0);
  ok(!nums.length, 'no rate, band, limit or year in the journey’s code', nums.slice(0, 8));
  ok(!/\b(bsdBands|stressRate|Math\.pow|annuity)|\*\s*0?\.\d/.test(code), 'no stamp duty, loan-limit or instalment maths in the journey (only the layout constants are numbers)');
  const tr = src.match(/track\('[a-z_]+', \{[^}]*\}\)/g) || [];
  ok(tr.length >= 4 && tr.every((t) => !/\b(R|S\.a|a)\.|budget|price|cash|income/.test(t.replace(/'[^']*'/g, ''))), 'analytics: the step and the event only, never an answer or a figure', tr);
  ok(/GW_ENGINE/.test(code) && /E\.afford\(/.test(code) && /E\.cost\(/.test(code) && /E\.borrow\(/.test(code) && /E\.sale\(/.test(code), 'every figure from GW_ENGINE');
}
console.log('pmm-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
