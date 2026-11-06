/* ==========================================================================
   GROUNDWORK — GW_ENGINE position and compare blocks (Hold vs Sell vs Upgrade, P1; Master Planning approval, 6 Nov 2026).
   Two blocks added to GW_ENGINE. Nothing in gw-engine.js changes: this file only adds names (browser) or returns them (Node), so Plan My
   Move V2, the one page that loads GW_ENGINE, is untouched by construction. No page loads this file in P1.
   Like GW_ENGINE it is an adapter: no formula, rate, rule or arithmetic of its own (a static test checks: no ×, ÷, minus or Math). Every
   figure is an existing engine's (GW_ENGINE's sale, cost and afford blocks, i.e. GW_FIN3 and GW_CALC) or a GW_CALC position primitive's
   (gw-calc-position.js: loanAt, loanFrom, valueAt, ledger, breakEven); every default is GW_RULES' or the planner's assumptions (read through
   GW_CALC where a figure depends on it, e.g. a running loan's rate by lender), each
   reported in assumptions[] with its basis (rule / convention / default / user).

   position(case, id, o)   one home owned, over a period: its value under the visitor's assumption and its loan (balance, interest, paid).
   compare(case, o)        Hold, Sell and Upgrade from one case, on one ledger (GW_CALC.ledger), over o.years (default 5, 1 to 10):
     hold     keep the home: its value and loan at the end; today's cash and CPF untouched; the repayments, recurring and one-off costs paid.
     sell     sell it now (GW_ENGINE.sale): cash and CPF released; then where the household lives, which must be said (o.sell.housing):
                'rent' (o.sell.rent a month), 'none' (an explicit $0, e.g. living with family) or 'buy' (a smaller completed private home at
                o.sell.price). Without it: incomplete, today's figures only, no end figure, left out of the comparison.
     upgrade  sell it and buy the completed private home in case.purchase (sell first): the purchase is GW_ENGINE.cost's, with the sale's
                usable CPF added to the CPF that can go into it; the editable purchase-cost estimate (the planner's purchaseCosts) is its own
                line. Not possible at these figures (cost not ok, a loan over the limit, cash short): said, and no end figure.
   Basis (approved R1–R5): market value at the end (no sale assumed then); 0% returns on cash and CPF in every choice; prices unchanged unless
   the visitor says; the sale repays today's balance. Equity, cash and CPF stay separate; the position is not money available to spend.
   Recurring home costs (maintenance or S&CC, property tax, insurance: owned[0].monthlyCosts, purchase.monthlyCosts, sell.monthlyCosts) are
   compared only when given for every home held in the choices compared, or for none (then excluded for all, and said). A choice that rents or
   says it has no housing cost makes them required for every home held (its housing cost is complete; an owner's would not be). Otherwise the
   comparison is marked not comparable, with what is missing.
   HDB minimum occupation period (P3, 6 Nov 2026): an HDB flat is sold (Sell, Upgrade) only once its MOP is over (GW_CALC.mopEnd on GW_RULES.hdbMop):
   owned[0].mop is { met: true } or { category, completed: 'YYYY-MM' [, notCountedMonths] }, with o.asOf (today, from the page). Within the MOP: stop,
   with the month it ends; selling earlier needs HDB's approval on appeal, which is not assessed. Not given: incomplete (required).
   Not in P1 (said, never approximated): new launches and ECs as the next home, buying first, more than one home owned.
   UMD: adds to window.GW_ENGINE (after gw-engine.js and gw-calc-position.js); in Node, require() returns the factory:
   (GW_RULES, GW_CALC with the position primitives, the planner's assumptions, GW_ENGINE).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else if (root.GW_ENGINE) Object.assign(root.GW_ENGINE, factory(root.GW_RULES, root.GW_CALC, root.KPT_ASSUMPTIONS, root.GW_ENGINE));
})(typeof self !== 'undefined' ? self : this, function (R, C, A, E) {
  'use strict';
  if (!R || !C || !A || !E || typeof C.ledger !== 'function' || typeof E.sale !== 'function') throw new Error('The position blocks need GW_RULES, GW_CALC with its position primitives, the planner assumptions and GW_ENGINE');
  const VERSION = 'GWE2-P1-2026-11-06', SCHEMA = 'gw-compare-v1';
  const has = (x) => typeof x === 'number' && isFinite(x);
  const given = (x) => x !== undefined && x !== null && x !== '';
  const obj = (x) => (x && typeof x === 'object' ? x : {});
  const list = (x) => (Array.isArray(x) ? x : []);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const SEVERITY = ['invalid', 'unsupported', 'incomplete', 'stop', 'ok'];
  const worst = (xs) => SEVERITY.find((s) => xs.indexOf(s) >= 0) || 'ok';
  const PERIOD = { min: 1, max: 10, dflt: 5 };   // the approved comparison period: five years by default, one to ten
  const NONE = 0;                                 // nothing (a $0 flow, no rent, no recurring cost)

  /* ---------------- the options, with every default said ---------------- */
  function options(o) {
    o = obj(o); const out = { assumptions: [], invalid: [] }, a = (key, value, basis) => out.assumptions.push({ key: key, value: value, basis: basis });
    out.years = given(o.years) ? o.years : PERIOD.dflt; a('years', out.years, given(o.years) ? 'user' : 'default');
    if (!(has(out.years) && Number.isInteger(out.years) && out.years >= PERIOD.min && out.years <= PERIOD.max)) out.invalid.push({ field: 'years', text: 'A whole number of years from ' + PERIOD.min + ' to ' + PERIOD.max + '.' });
    const pct = obj(o.pct);
    out.pctCurrent = given(pct.current) ? pct.current : NONE; a('pct.current', out.pctCurrent, given(pct.current) ? 'user' : 'default');
    out.pctNext = given(pct.next) ? pct.next : NONE; a('pct.next', out.pctNext, given(pct.next) ? 'user' : 'default');
    out.purchaseCosts = given(o.purchaseCosts) ? o.purchaseCosts : A.purchaseCosts; a('purchaseCosts', out.purchaseCosts, given(o.purchaseCosts) ? 'user' : 'convention');
    if (!(has(out.purchaseCosts) && out.purchaseCosts >= NONE)) out.invalid.push({ field: 'purchaseCosts', text: 'An amount of $0 or more.' });
    a('returns', NONE, 'convention'); a('valueBasis', 'market value, no sale assumed at the end', 'convention'); a('saleRepays', 'today’s loan balance', 'convention');
    out.sell = obj(o.sell); out.oneOff = obj(o.oneOff); out.asOf = o.asOf;
    return out;
  }
  const oneOffOf = (op, id) => (has(op.oneOff[id]) ? op.oneOff[id] : NONE);

  /* ---------------- the current home's loan: what people know (balance, repayment) and its rate ---------------- */
  // The rate: the visitor's (owned.loan.ratePct); otherwise by lender, the HDB concessionary rate (GW_RULES, dated) or the planner's planning rate.
  // Neither given: required (never assumed from the home's type: HDB flats are often on bank loans).
  function currentLoan(h, i, years) {
    const L = h.loan ? obj(h.loan) : null, s = obj(h.sale), f = 'owned[' + i + '].', out = { missing: [], assumptions: [] };
    if (!L) { out.none = true; out.balance = NONE; out.monthly = NONE; out.lf = C.loanFrom({ balance: NONE, ratePct: NONE }, years); return out; }
    if (!has(L.monthly)) out.missing.push({ field: f + 'loan.monthly', need: 'required' });
    if (!has(s.loan)) out.missing.push({ field: f + 'sale.loan', need: 'required' });
    if (!has(L.ratePct) && L.lender !== 'hdb' && L.lender !== 'bank') out.missing.push({ field: f + 'loan.lender', need: 'required' });
    if (out.missing.length) return out;
    out.balance = s.loan; out.monthly = L.monthly; out.lf = C.loanFrom({ balance: s.loan, monthly: L.monthly, ratePct: L.ratePct, lender: L.lender }, years);
    out.ratePct = out.lf.ratePct;
    if (out.lf.ok && out.lf.rateBasis !== 'user') out.assumptions.push({ key: f + 'loan.ratePct', value: out.lf.ratePct, basis: out.lf.rateBasis, validUntil: out.lf.rateValidUntil });
    return out;
  }

  /* ---------------- position: one home over a period ---------------- */
  function position(c, id, o) {
    const H = list(obj(c).owned), i = id !== undefined ? H.findIndex((h) => obj(h).id === id) : NONE, op = options(o);
    const b = { schema: SCHEMA, version: VERSION, block: 'position', status: 'ok', missing: [], invalid: op.invalid.slice(), assumptions: op.assumptions.filter((x) => /^(years|pct\.current|valueBasis)$/.test(x.key)), trace: { fn: 'GW_CALC.loanFrom + GW_CALC.valueAt + GW_CALC.ledger' } };
    if (i < NONE) { b.status = 'incomplete'; b.missing.push({ field: 'owned[id=' + id + ']', need: 'required' }); return b; }
    if (b.invalid.length) { b.status = 'invalid'; return b; }
    const h = obj(H[i]), s = obj(h.sale);
    if (!has(s.price)) b.missing.push({ field: 'owned[' + i + '].sale.price', need: 'required' });
    const cl = currentLoan(h, i, op.years); b.missing = b.missing.concat(cl.missing); b.assumptions = b.assumptions.concat(cl.assumptions);
    if (b.missing.length) { b.status = 'incomplete'; return b; }
    const v = C.valueAt(s.price, op.pctCurrent, op.years);
    if (!v.ok) { b.status = 'invalid'; b.invalid = b.invalid.concat(v.invalid || []); return b; }
    if (!cl.lf.ok) { b.status = cl.lf.invalid ? 'invalid' : 'incomplete'; b.invalid = b.invalid.concat(cl.lf.invalid || []); return b; }
    if (cl.lf.state === 'never') { b.status = 'stop'; b.reason = 'repayment-below-interest'; b.figures = { monthly: cl.monthly, ratePct: cl.ratePct }; return b; }
    const home = { valueToday: s.price, value: v.value, loanToday: cl.balance, loan: cl.lf.balance };
    const L = C.ledger({ years: op.years, homes: [home], cash: { in: [NONE] }, cpf: { in: [NONE] }, paid: { instalments: cl.lf.paid, rentMonthly: NONE, recurringMonthly: NONE, oneOff: NONE } });
    b.figures = Object.assign({}, home, { equityToday: L.ok ? L.equity : null, equity: L.ok ? L.equity : null, valueChange: L.ok ? L.valueChange : null, interest: cl.lf.interest, paid: cl.lf.paid, principal: cl.lf.principal,
      monthly: cl.monthly, termMonths: cl.lf.term, ratePct: cl.ratePct, months: L.ok ? L.months : null });
    b.figures.equityToday = C.ledger({ years: NONE, homes: [{ valueToday: s.price, value: s.price, loanToday: cl.balance, loan: cl.balance }], cash: { in: [NONE] }, cpf: { in: [NONE] }, paid: { instalments: NONE, rentMonthly: NONE, recurringMonthly: NONE, oneOff: NONE } }).equity;
    b.home = home; b.loanPaid = cl.lf.paid;
    return b;
  }

  /* ---------------- the three choices ---------------- */
  function base(id) { return { id: id, status: 'ok', missing: [], invalid: [], assumptions: [], provisional: [], excluded: [], today: null, monthly: null, homes: [], end: null, costs: null, blocks: {} }; }
  function needHousehold(c, ch) {
    const hh = obj(obj(c).household);
    if (!has(hh.cash)) ch.missing.push({ field: 'household.cash', need: 'required' });
    if (!has(hh.cpf)) ch.missing.push({ field: 'household.cpf', need: 'required' });
    return hh;
  }
  // a purchase needs the borrowers' ages and incomes: without them the cost card would lend the most the loan limit allows, not what the income supports
  function needBorrowers(c, ch) {
    list(obj(c).people).forEach((p, k) => {
      p = obj(p); if (k && p.borrows === false) return;
      if (!has(p.age)) ch.missing.push({ field: 'people[' + k + '].age', need: 'required' });
      if (!has(obj(p.income).fixed)) ch.missing.push({ field: 'people[' + k + '].income', need: 'required' });
    });
  }

  function hold(c, op) {
    const ch = base('hold'), hh = needHousehold(c, ch), h = obj(list(obj(c).owned)[0]);
    const p = position(c, h.id, { years: op.years, pct: { current: op.pctCurrent } });
    ch.blocks.position = p; ch.missing = ch.missing.concat(p.missing); ch.invalid = ch.invalid.concat(p.invalid); ch.assumptions = p.assumptions.filter((x) => /loan\.ratePct/.test(x.key));
    if (ch.missing.length) { ch.status = 'incomplete'; return ch; }
    if (p.status !== 'ok') { ch.status = p.status; ch.reason = p.reason; return ch; }
    const f = p.figures;
    ch.today = { cash: hh.cash, cpf: hh.cpf, released: { cash: NONE, cpf: NONE } };
    ch.monthly = { instalment: f.monthly, rent: NONE, recurring: has(h.monthlyCosts) ? h.monthlyCosts : null };
    ch.homes = [{ id: h.id, valueToday: f.valueToday, value: f.value, loanToday: f.loanToday, loan: f.loan, interest: f.interest, principal: f.principal, termMonths: f.termMonths, ratePct: f.ratePct }];
    ch.costs = { sale: null, duty: NONE, purchaseCosts: NONE, interest: f.interest };
    ch.recurring = [{ home: 'owned[0].monthlyCosts', monthly: h.monthlyCosts }];
    ch.ledgerIn = { years: op.years, homes: [p.home], cash: { in: [hh.cash] }, cpf: { in: [hh.cpf] }, paid: { instalments: p.loanPaid, rentMonthly: NONE, recurringMonthly: h.monthlyCosts, oneOff: oneOffOf(op, 'hold') } };
    return ch;
  }

  // the home sold now: GW_ENGINE.sale on the case with that home's intent set to sell. The split into cash and CPF needs the CPF refund.
  // An HDB flat first: its minimum occupation period must be over (P3). Within it the choice stops here, with the month it ends.
  function mopOf(c, ch, op) {
    const h = obj(obj(c).owned[0]);
    if (h.type !== 'hdb') return true;
    if (!h.mop) { ch.status = 'incomplete'; ch.missing.push({ field: 'owned[0].mop', need: 'required' }); return false; }
    const m = C.mopEnd(obj(h.mop), op.asOf), at = (f) => (f === 'asOf' ? 'asOf' : 'owned[0].mop.' + f); ch.blocks.mop = m;
    if (!m.ok) { ch.status = (m.invalid || []).length ? 'invalid' : 'incomplete'; m.missing.forEach((x) => ch.missing.push({ field: at(x.field), need: 'required' })); (m.invalid || []).forEach((x) => ch.invalid.push({ field: at(x.field), text: x.text })); return false; }
    if (m.state !== 'met') { ch.status = 'stop'; ch.reason = 'within-mop'; ch.mop = { endsIn: m.endsIn, monthsLeft: m.monthsLeft, years: m.years, category: m.category, earlySale: R.hdbMop.earlySale, checked: R.hdbMop.checked }; return false; }
    ch.assumptions.push({ key: 'owned[0].mop', value: m.state, basis: m.basis, checked: R.hdbMop.checked });
    return true;
  }
  function saleNow(c, ch, op) {
    if (!mopOf(c, ch, op)) return null;
    const cs = clone(c); cs.owned[0].intent = 'sell'; delete cs.purchase;
    const s = E.sale(cs, cs.owned[0].id); ch.blocks.sale = s;
    ch.provisional = ch.provisional.concat(s.provisional || []);
    if (s.status !== 'ok') { ch.status = s.status; ch.reason = s.reason; ch.missing = ch.missing.concat(s.missing); ch.invalid = ch.invalid.concat(s.invalid); return null; }
    s.assumptions.forEach((x) => ch.assumptions.push(x));
    const fig = s.figures, v = s.value;
    if (!has(fig.cash)) { ch.status = 'incomplete'; ch.missing.push({ field: 'owned[0].sale.cpfRefund', need: 'required' }); return null; }
    const ssdMiss = s.missing.filter((m) => /\.(bought|sold)$/.test(m.field));
    if (ssdMiss.length) { ch.status = 'incomplete'; ch.missing = ch.missing.concat(ssdMiss.map((m) => ({ field: m.field, need: 'required' }))); return null; }
    return { price: fig.price, loan: fig.loan, costs: fig.costs, penalty: v.penalty, ssd: fig.ssd, total: fig.total, cash: fig.cash, cpf: fig.cpf, cpfUsable: has(fig.cpfUsable) ? fig.cpfUsable : NONE };
  }

  // buying a completed private home at `price` after the sale (sell first): the cost card's own loan, cash, CPF and stamp duty
  function buy(c, ch, sale, hh, price, pct, monthlyCosts, op, oneOffKey) {
    needBorrowers(c, ch); if (ch.missing.length) { ch.status = 'incomplete'; return null; }
    const cu = clone(c); cu.owned[0].intent = 'sell';
    cu.purchase = Object.assign({}, obj(c.purchase), { type: 'completed', price: price, order: 'sell-first' });
    // the CPF that can go into it: the household's, plus the sale's refund usable for a home (GW_FIN3.sell's own figure). The cost card reads no
    // cash (it says what is needed), so only CPF is added; the budget (afford) counts the sale itself, so it gets the case as given.
    const pool = C.ledger({ years: NONE, homes: [], cash: { in: [NONE] }, cpf: { in: [hh.cpf, sale.cpfUsable] }, paid: { instalments: NONE, rentMonthly: NONE, recurringMonthly: NONE, oneOff: NONE } });
    const ccost = clone(cu); ccost.household = Object.assign({}, cu.household, { cpf: pool.cpf });
    const k = E.cost(ccost), af = E.afford(cu); ch.blocks.cost = k; ch.blocks.afford = af;
    k.assumptions.forEach((x) => ch.assumptions.push(x)); ch.provisional = ch.provisional.concat(k.provisional || []);
    if (k.status !== 'ok') { ch.status = k.status; ch.reason = k.reason; ch.missing = ch.missing.concat(k.missing); ch.invalid = ch.invalid.concat(k.invalid); return null; }
    const v = k.value;
    const la = C.loanAt({ loan: v.loan, ratePct: v.ratePct, years: v.years }, op.years), val = C.valueAt(price, pct, op.years);
    if (!la.ok || !val.ok) { ch.status = 'invalid'; ch.invalid = ch.invalid.concat(la.invalid || [], val.invalid || []); return null; }
    const home = { valueToday: price, value: val.value, loanToday: v.loan, loan: la.balance };
    const flows = { cash: { in: [hh.cash, sale.cash], out: [v.cash, op.purchaseCosts] }, cpf: { in: [hh.cpf, sale.cpf], out: [v.cpfUsed] } };
    const today = C.ledger({ years: NONE, homes: [{ valueToday: price, value: price, loanToday: v.loan, loan: v.loan }], cash: flows.cash, cpf: flows.cpf, paid: { instalments: NONE, rentMonthly: NONE, recurringMonthly: NONE, oneOff: NONE } });
    ch.checks = { budget: af.status === 'ok' ? af.figures.budget : null, withinBudget: af.status === 'ok' ? price <= af.figures.budget : null, overLimit: !!v.overLimit, aboveIncome: !!v.aboveIncome, cashLeft: today.cash, cpfLeft: today.cpf };
    if (v.overLimit) { ch.status = 'stop'; ch.reason = 'loan-over-limit'; return null; }
    if (today.cash < NONE) { ch.status = 'stop'; ch.reason = 'cash-short'; return null; }
    if (today.cpf < NONE) { ch.status = 'stop'; ch.reason = 'cpf-short'; return null; }
    ch.today = { cash: today.cash, cpf: today.cpf, released: { cash: sale.cash, cpf: sale.cpf }, sale: sale, purchase: { price: price, loan: v.loan, cashNeeded: v.cash, cpfUsed: v.cpfUsed, bsd: v.bsd, absd: v.absd, duty: v.duty, purchaseCosts: op.purchaseCosts } };
    ch.monthly = { instalment: v.monthly, instalmentFromLoan: la.monthly, rent: NONE, recurring: has(monthlyCosts) ? monthlyCosts : null };
    ch.homes = [{ id: 'next', valueToday: price, value: val.value, loanToday: v.loan, loan: la.balance, interest: la.interest, principal: la.principal, termMonths: la.term, ratePct: v.ratePct, years: v.years }];
    ch.costs = { sale: { costs: sale.costs, penalty: sale.penalty, ssd: sale.ssd }, duty: v.duty, bsd: v.bsd, absd: v.absd, purchaseCosts: op.purchaseCosts, interest: la.interest };
    ch.ledgerIn = { years: op.years, homes: [home], cash: flows.cash, cpf: flows.cpf, paid: { instalments: la.paid, rentMonthly: NONE, recurringMonthly: monthlyCosts, oneOff: oneOffOf(op, oneOffKey) } };
    return home;
  }

  function sell(c, op) {
    const ch = base('sell'), hh = needHousehold(c, ch);
    if (ch.missing.length) { ch.status = 'incomplete'; return ch; }
    const sale = saleNow(c, ch, op); if (!sale) return ch;
    const S = op.sell, how = S.housing;
    ch.housing = how || null;
    // today's figures stand whatever comes next
    const today = C.ledger({ years: NONE, homes: [], cash: { in: [hh.cash, sale.cash] }, cpf: { in: [hh.cpf, sale.cpf] }, paid: { instalments: NONE, rentMonthly: NONE, recurringMonthly: NONE, oneOff: NONE } });
    ch.today = { cash: today.cash, cpf: today.cpf, released: { cash: sale.cash, cpf: sale.cpf }, sale: sale };
    ch.costs = { sale: { costs: sale.costs, penalty: sale.penalty, ssd: sale.ssd }, duty: NONE, purchaseCosts: NONE, interest: NONE };
    if (how !== 'rent' && how !== 'none' && how !== 'buy') { ch.status = 'incomplete'; ch.reason = 'housing'; ch.missing.push({ field: 'sell.housing', need: 'required' }); return ch; }
    if (how === 'buy') {
      if (!has(S.price)) { ch.status = 'incomplete'; ch.reason = 'housing'; ch.missing.push({ field: 'sell.price', need: 'required' }); return ch; }
      if (buy(c, ch, sale, hh, S.price, op.pctNext, S.monthlyCosts, op, 'sell')) ch.recurring = [{ home: 'sell.monthlyCosts', monthly: S.monthlyCosts }];
      return ch;
    }
    if (how === 'rent' && !has(S.rent)) { ch.status = 'incomplete'; ch.reason = 'housing'; ch.missing.push({ field: 'sell.rent', need: 'required' }); return ch; }
    if (how === 'none') ch.assumptions.push({ key: 'sell.housing', value: 'no housing cost (as entered)', basis: 'user' });
    const rent = how === 'rent' ? S.rent : NONE;
    ch.monthly = { instalment: NONE, rent: rent, recurring: NONE };
    ch.recurring = []; ch.fullHousingCost = true;
    ch.ledgerIn = { years: op.years, homes: [], cash: { in: [hh.cash, sale.cash] }, cpf: { in: [hh.cpf, sale.cpf] }, paid: { instalments: NONE, rentMonthly: rent, recurringMonthly: NONE, oneOff: oneOffOf(op, 'sell') } };
    return ch;
  }

  function upgrade(c, op) {
    const ch = base('upgrade'), hh = needHousehold(c, ch), pu = obj(obj(c).purchase);
    if (!pu.type) ch.missing.push({ field: 'purchase.type', need: 'required' });
    else if (pu.type !== 'completed') { ch.status = 'unsupported'; ch.reason = 'next-home-type'; ch.invalid.push({ field: 'purchase.type', text: 'A completed private home only, for now (new launches and ECs come later).' }); return ch; }
    if (!has(pu.price)) ch.missing.push({ field: 'purchase.price', need: 'required' });
    if (pu.order === 'buy-first') { ch.status = 'unsupported'; ch.reason = 'buy-first'; return ch; }
    if (ch.missing.length) { ch.status = 'incomplete'; return ch; }
    const sale = saleNow(c, ch, op); if (!sale) return ch;
    if (buy(c, ch, sale, hh, pu.price, op.pctNext, pu.monthlyCosts, op, 'upgrade')) ch.recurring = [{ home: 'purchase.monthlyCosts', monthly: pu.monthlyCosts }];
    return ch;
  }

  /* ---------------- compare ---------------- */
  function compare(c, o) {
    const op = options(o), chk = E.check(c), H = list(obj(c).owned);
    const res = { schema: SCHEMA, version: VERSION, block: 'compare', status: 'ok', years: op.years, assumptions: op.assumptions, invalid: op.invalid.slice(), issues: [], excluded: [], comparable: false, missing: [], choices: {}, vsHold: {}, breakEven: {},
      trace: { fn: 'GW_ENGINE.sale / cost / afford + GW_CALC.loanFrom / loanAt / valueAt / ledger / breakEven', rulesChecked: R.checked, ratesValidUntil: R.ratesValidUntil, version: VERSION, primitives: C.POSITION_VERSION } };
    res.issues = [].concat(chk.invalid.map((x) => Object.assign({ status: 'invalid' }, x)), chk.unsupported.map((x) => Object.assign({ status: 'unsupported' }, x)));
    if (H.length !== 1) res.issues.push({ status: 'unsupported', field: 'owned', text: 'One home owned now (P1).' });
    if (res.issues.some((x) => x.status === 'invalid') || res.invalid.length) { res.status = 'invalid'; return res; }
    if (res.issues.length) { res.status = 'unsupported'; return res; }
    const ch = { hold: hold(c, op), sell: sell(c, op), upgrade: upgrade(c, op) }, ids = Object.keys(ch);
    // recurring home costs: compared only when given for every home held in the choices compared, or for none; required for all of them when a
    // choice's housing cost is complete (rent, or none as entered)
    const live = ids.filter((k) => ch[k].status === 'ok' && ch[k].ledgerIn);
    const held = [].concat.apply([], live.map((k) => list(ch[k].recurring).map((g) => ({ choice: k, field: g.home, given: has(g.monthly) }))));
    const full = live.some((k) => ch[k].fullHousingCost), givenAny = held.some((g) => g.given), givenAll = held.every((g) => g.given);
    const short = (full || givenAny) && !givenAll ? held.filter((g) => !g.given) : [];
    if (!givenAny && !full && held.length) {
      res.excluded.push({ key: 'recurring', text: 'Maintenance or S&CC, property tax and insurance are excluded for every home.' });
      live.forEach((k) => { ch[k].excluded.push('recurring'); ch[k].ledgerIn.paid.recurringMonthly = NONE; });
    }
    live.forEach((k) => { if (!has(op.oneOff[k])) ch[k].excluded.push('oneOff'); });
    if (live.some((k) => !has(op.oneOff[k]))) res.excluded.push({ key: 'oneOff', text: 'Renovation, moving and furnishing are excluded unless entered.' });
    res.excluded.push({ key: 'returns', text: 'Cash and CPF earn nothing here (0%), in every choice.' });
    res.missing = short.map((g) => ({ field: g.field, need: 'required', why: full ? 'full-housing-cost-compared' : 'given-for-some' }));
    // the end of the period, on the one ledger; a choice missing its recurring costs has no end figure
    live.forEach((k) => {
      const x = ch[k];
      if (short.some((g) => g.choice === k)) return;
      const L = C.ledger(x.ledgerIn);
      if (L.ok) x.end = L; else { x.status = 'invalid'; x.invalid = x.invalid.concat(L.invalid || []); }
    });
    const ends = ids.filter((k) => ch[k].status === 'ok' && ch[k].end);
    res.comparable = !!ch.hold.end && ends.length >= 2 && !short.length;
    if (res.comparable) {
      ends.filter((k) => k !== 'hold').forEach((k) => {
        res.vsHold[k] = C.ledger(ch[k].ledgerIn, ch.hold.end).vs;
        if (ch[k].end.homes === 1) res.breakEven[k] = C.breakEven({ target: ch.hold.end, of: ch[k].end });
      });
    }
    ids.forEach((k) => { delete ch[k].ledgerIn; delete ch[k].recurring; delete ch[k].fullHousingCost; });
    res.choices = ch;
    res.status = res.comparable ? 'ok' : worst(ids.map((k) => ch[k].status).concat(['incomplete']));
    return res;
  }

  return { POSITION_VERSION: VERSION, COMPARE_SCHEMA: SCHEMA, position, compare };
});
