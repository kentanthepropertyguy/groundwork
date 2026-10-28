'use strict';
/* Parity: Payment timeline vs the progressive-payments engine behind New launch payments, for the same buyer.
   For every combination below (price, buyer, age, tenure, rate), the timeline's amounts, loan, instalments, stamp duty and the split of
   each payment between cash, CPF and bank must equal what GW_CALC.progressive gives; and the same timeline with no option date must give the
   same amounts (only the timings are read differently). Run: node tools/financial-tests/timeline-parity-tests.js [rootDir] */
const H = require('./harness.js')(process.argv[2]);
const { C, T, S } = H;
let pass = 0, fail = 0, shown = 0;
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 0.01 : tol);
function eq(name, a, b, tol) { if (near(a, b, tol)) { pass++; return; } fail++; if (shown++ < 25) console.log('FAIL ' + name + ': ' + a + ' vs ' + b); }
function ok(name, c) { if (c) { pass++; return; } fail++; if (shown++ < 25) console.log('FAIL ' + name); }
const SC = (o) => ({ res: 'SC', owned: o || 0 });
const BUYERS = { 'sc-first': [SC(0)], 'sc-second': [SC(1)], 'pr-first': [{ res: 'PR', owned: 0 }], 'foreigner': [{ res: 'FR', owned: 0 }], 'couple-second': [SC(1), SC(1)], 'sc+pr': [SC(0), { res: 'PR', owned: 0 }] };
const loansOf = (b) => Math.min(2, Math.max.apply(null, b.map((x) => x.owned)));
let n = 0;
function compareOne(label, pin, kind, undated, cpf) {
  n++;
  // 28 Oct 2026 (Claude E audit F1): a home under construction counts the tenure from the bank's first release, in both engines (build: true; the planning TOP, 48 months)
  const P = C.progressive(Object.assign({}, pin, { kind: kind === 'ec' ? 'ec' : 'private', build: true }, cpf ? { cpf } : {}));
  const tin = { kind, price: pin.price, otp: '2027-03-01', undated, age: pin.age, years: pin.years, ratePct: pin.ratePct, loansOther: 0, buyers: pin.buyers, entity: pin.entity, cash: 9e7, cpf: cpf || 0, order: 'none' };
  // the timeline counts housing loans from its own flat-loan inputs; for the second/third-home profiles the loans count comes from `loansOther`
  tin.loansOther = pin.loans || 0;
  const t = T.timeline(tin);
  if (!P.ok || !t.ok) { ok(label + ': both engines agree on ok', P.ok === t.ok); return; }
  eq(label + ' loanMax', t.loan.loanMax, P.loanMax); eq(label + ' ltv', t.loan.ltv, P.ltv, 1e-9); eq(label + ' years', t.loan.years, P.years);
  eq(label + ' final instalment', t.instalment.final, P.finalMonthly); eq(label + ' duty total', t.duty.total, P.duty.total); eq(label + ' bsd', t.duty.bsd, P.duty.bsd); eq(label + ' absd', t.duty.absd, P.duty.absd);
  const pays = {}; t.events.filter((e) => e.type === 'pay').forEach((e) => { pays[e.id] = e; });
  P.stages.forEach((s) => {
    const e = pays[s.id]; if (!e) { ok(label + ' stage ' + s.id + ' present', false); return; }
    eq(label + ' ' + s.id + ' amount', e.amount, s.amount); eq(label + ' ' + s.id + ' bank', e.bank, s.loan); eq(label + ' ' + s.id + ' instalment after', e.instalment || 0, s.loan > 0 || s.monthly > 0 ? s.monthly : 0);
    eq(label + ' ' + s.id + ' paid in full', e.cashUsed + e.cpfUsed + e.bank + e.uncovered, e.amount);
  });
  eq(label + ' first 8 weeks + duty', pays.otp.amount + pays.snp.amount + t.duty.total, P.upfront8wk);
  if (cpf) eq(label + ' CPF used', t.totals.cpf, P.totals.cpf, 0.01);
  eq(label + ' cash + cpf + bank = price + duty', t.totals.cash + t.totals.cpf + t.totals.bank, P.price + P.duty.total);
}
const prices = [800000, 1300000, 1800000, 3000000, 7500000];
const ages = [30, 35, 45, 55, 60], tenures = [undefined, 25, 30, 35], rates = [undefined, 3.2];
Object.keys(BUYERS).forEach((bk) => prices.forEach((price) => ages.forEach((age) => tenures.forEach((years) => rates.forEach((ratePct) => {
  const b = BUYERS[bk], loans = loansOf(b);
  [false, true].forEach((undated) => compareOne([bk, price, age, years || 'blank', ratePct || '4%', undated ? 'undated' : 'dated'].join('/'), { price, age, years, ratePct, loans, buyers: b }, 'new', undated));
})))));
// a new EC (individuals only), with CPF given
prices.slice(0, 3).forEach((price) => [30, 40].forEach((age) => compareOne(['ec', price, age, 'cpf'].join('/'), { price, age, loans: 0, buyers: [SC(0)] }, 'ec', false, 150000)));
// CPF given (new launch, individuals)
[1800000, 3000000].forEach((price) => compareOne('cpf/' + price, { price, age: 35, loans: 0, buyers: [SC(0)] }, 'new', false, 200000));
// companies: no age, no CPF; tenure and rate typed or not
prices.forEach((price) => tenures.forEach((years) => rates.forEach((ratePct) => [false, true].forEach((undated) => compareOne(['company', price, years || 'blank', ratePct || '4%', undated ? 'undated' : 'dated'].join('/'), { price, years, ratePct, entity: true }, 'new', undated)))));
// the schedule adapter (screen 1) and the engine give the same payments and duty, for individuals and companies, dated and undated
[{ entity: true }, { buyers: [SC(0)] }, { buyers: [SC(1)] }].forEach((who) => ['new', 'completed'].forEach((kind) => [false, true].forEach((undated) => {
  const tag = ['schedule', who.entity ? 'company' : who.buyers[0].owned ? 'second' : 'first', kind, undated ? 'undated' : 'dated'].join('/');
  const s = S.schedule(Object.assign({ kind, price: 2000000, otp: '2027-03-01', undated }, who));
  const t = T.timeline(Object.assign({ kind, price: 2000000, otp: '2027-03-01', undated, age: 38, cash: 9e7, order: 'none' }, who.entity ? { entity: true } : { buyers: who.buyers, loansOther: who.buyers[0].owned }));
  ok(tag + ' both ok', s.ok && t.ok); if (!(s.ok && t.ok)) return;
  const sp = s.events.map((e) => e.id + ':' + e.amount.toFixed(2)).sort().join(','), tp = t.events.filter((e) => e.type === 'pay').map((e) => e.id + ':' + e.amount.toFixed(2)).sort().join(',');
  ok(tag + ' same payments', sp === tp); eq(tag + ' same duty', s.duty.total, t.duty.total); n++;
})));
// the same scenario with and without an option date: identical amounts, loan and instalments
['new', 'completed'].forEach((kind) => [{ entity: true }, { buyers: [SC(0)], age: 36 }].forEach((who) => {
  const base = Object.assign({ kind, price: 2400000, cash: 900000, cpf: who.entity ? 0 : 200000, ratePct: 3.8, order: 'none' }, who);
  const a = T.timeline(Object.assign({ otp: '2027-03-01' }, base)), b = T.timeline(Object.assign({ undated: true }, base));
  const tag = 'dated-vs-undated/' + kind + '/' + (who.entity ? 'company' : 'individual');
  ok(tag + ' both ok', a.ok && b.ok); if (!(a.ok && b.ok)) return;
  const amt = (r) => r.events.filter((e) => e.type === 'pay').map((e) => [e.id, e.amount, e.bank, e.instalment, e.cashUsed, e.cpfUsed, e.uncovered].map((x) => (typeof x === 'number' ? x.toFixed(2) : x)).join(':')).join(',');
  ok(tag + ' same amounts, loan split and instalments', amt(a) === amt(b));
  // the simulation runs a whole number of calendar months after the last payment, so a different calendar alignment can add or drop one monthly instalment
  eq(tag + ' same shortfall (within one instalment)', a.headline.peak, b.headline.peak, a.instalment.final + 0.01); eq(tag + ' same loan', a.loan.loanMax, b.loan.loanMax); n++;
}));
// refusals that must stay refusals
ok('company cannot be planned for an EC', T.timeline({ kind: 'ec', price: 1300000, entity: true, otp: '2027-03-01' }).ok === false);
ok('company cannot be planned with a home to sell', T.timeline({ kind: 'new', price: 1300000, entity: true, otp: '2027-03-01', order: 'buy' }).ok === false);
ok('no option date and not told so is still refused', T.timeline({ kind: 'new', price: 1300000, age: 35, buyers: [SC(0)] }).ok === false);
ok('an individual still needs an age', T.timeline({ kind: 'new', price: 1300000, buyers: [SC(0)], otp: '2027-03-01' }).ok === false);
console.log('timeline parity: ' + pass + ' checks passed, ' + fail + ' failed (' + n + ' scenarios)');
process.exit(fail ? 1 : 0);
