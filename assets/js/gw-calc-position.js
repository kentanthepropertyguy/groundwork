/* ==========================================================================
   GROUNDWORK — GW_CALC position primitives (Hold vs Sell vs Upgrade, P1; Master Planning approval, 6 Nov 2026).
   Five pure functions added to GW_CALC, the one place Groundwork's formulas live. Nothing in gw-calc.js changes: this file only adds
   new names to GW_CALC (the browser) or returns them (Node), so every existing calculator figure is untouched by construction.
     loanAt(i, years)         a loan from its start (amount, rate, tenure): the balance, principal, interest and payments after `years`
                              (whole months: years × 12, rounded). The same monthly arithmetic as GW_CALC.mortgage (its instalment, then month
                              by month: interest on the balance, the rest off the principal), so loanAt(…, 5 / 10) equals
                              mortgage().balanceAfter[5 / 10] exactly (tested).
     loanFrom(i, years)       a loan already running, from what people know (the balance owed and the monthly repayment, at a rate): the
                              months left, and the same figures after `years`. The last payment is only what is owed; a repayment that does
                              not cover the interest is said ('never'), never stretched into a term.
     valueAt(price, pct, years)  the visitor's own price assumption applied (pct a year, compounded). 0% gives back the price.
                              Groundwork forecasts nothing: pct is always the visitor's figure, and its default is 0.
     ledger(parts, against)   the position at the end of a period, one definition for every choice (market value, no sale assumed then):
                                position = Σ (value − loan owing) of the homes held + cash left from today + CPF left from today
                                           − everything paid for housing over the period (instalments, rent, recurring costs, one-off costs)
                              Cash and CPF left are their flows in and out today (a sale's proceeds in; a purchase's cash, CPF and costs out);
                              rent and recurring costs are monthly amounts over the period. Equity, cash and CPF stay separate in the result:
                              the position is not money available to spend. With `against` (another ledger), the differences from it.
     mopEnd(i, asOf)          P3 (6 Nov 2026): when an HDB flat's minimum occupation period ends (GW_RULES.hdbMop): the flat's category
                              ('standard', 'plus', 'prime', 'freshStart'), the month its purchase legally completed (YYYY-MM, or a date), and any
                              months not counted (whole-flat rental with HDB's approval). Months only: the MOP is treated as met from the month
                              after the one it ends in, so a flat is never shown as sellable before its date. Or { met: true } when the owner says so.
     breakEven(i)             the yearly price change a home held at the end needs for one position to equal another:
                                value × (1 + g)^years + rest = target   →   g = ((target − rest) / value)^(1/years) − 1
                              given as numbers (target, rest, value, years) or as two ledgers ({ target: ledger, of: ledger with one home }).
                              'ahead' when even a value of nil reaches the target; outside ±maxPct a year it is marked beyond, not shown as a number.
   Every function returns { ok:false, missing:[…] } or { ok:false, invalid:[…] } until its inputs are usable, and never guesses them (as GW_CALC).
   The one default here is a running loan's rate when only its lender is known: HDB's concessionary rate (GW_RULES, dated) or the planner's
   planning rate for a bank loan (its assumptions), returned with its basis so the page can say it. Nothing else is assumed.
   No DOM, storage or network. UMD: adds to window.GW_CALC in the browser (after gw-calc.js); in Node, require() returns the factory:
   (GW_CALC, GW_RULES, the planner's assumptions).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else if (root.GW_CALC) Object.assign(root.GW_CALC, factory(root.GW_CALC, root.GW_RULES, root.KPT_ASSUMPTIONS));
})(typeof self !== 'undefined' ? self : this, function (C, R, A) {
  'use strict';
  if (!C || typeof C.instal !== 'function' || !C.LIMITS || !R || !A) throw new Error('The position primitives need GW_CALC, GW_RULES and the planner assumptions');
  const VERSION = 'GWP1-2026-11-06';
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
  const missing = (list) => ({ ok: false, missing: list });
  const invalid = (list) => ({ ok: false, missing: [], invalid: list });
  const L = C.LIMITS;
  const money = (i, keys) => keys.filter((k) => num(i[k]) !== null && (i[k] < 0 || i[k] > L.money.max)).map((k) => ({ field: k, text: i[k] < 0 ? 'Amounts can’t be negative.' : L.money.text }));
  const rate = (i) => (num(i.ratePct) !== null && (i.ratePct < L.ratePct.min || i.ratePct > L.ratePct.max) ? [{ field: 'ratePct', text: L.ratePct.text }] : []);
  const MONTHS_MAX = 1200;   // a period or a term beyond 100 years is not a housing question
  const monthsOf = (years) => (num(years) !== null && years >= 0 && years * 12 <= MONTHS_MAX ? Math.round(years * 12) : null);

  /* ---------------- loanAt: a loan from its start ---------------- */
  // i: { loan, ratePct, years }. The instalment is GW_CALC's own (instal); the months run exactly as GW_CALC.mortgage runs them.
  function loanAt(i, years) {
    i = i || {};
    const bad = money(i, ['loan']).concat(rate(i), num(i.years) !== null && (i.years < L.years.min || i.years > L.years.max) ? [{ field: 'years', text: L.years.text }] : []);
    if (bad.length) return invalid(bad);
    const need = []; if (num(i.loan) === null) need.push('loan'); if (num(i.ratePct) === null) need.push('ratePct'); if (num(i.years) === null) need.push('years');
    if (need.length) return missing(need);
    const months = monthsOf(years); if (months === null) return invalid([{ field: 'period', text: 'A period of 0 to 100 years.' }]);
    const r = i.ratePct / 100, n = Math.round(i.years * 12), monthly = C.instal(i.loan, r, i.years), upto = Math.min(months, n);
    let bal = i.loan, interest = 0;
    for (let m = 1; m <= upto; m++) { const it = bal * r / 12, pr = monthly - it; bal -= pr; interest += it; }
    if (months >= n) bal = 0;   // the term is over: whatever the floating-point remainder, nothing is owed
    return { ok: true, monthly: monthly, term: n, months: months, paidMonths: upto, balance: bal, principal: i.loan - bal, interest: interest, paid: (i.loan - bal) + interest };
  }

  /* ---------------- loanFrom: a loan already running ---------------- */
  // i: { balance, monthly, ratePct } or { balance, monthly, lender: 'hdb' | 'bank' } (the rate then GW_RULES' HDB rate or the planning rate, said in
  // rateBasis). Month by month: interest on the balance, the repayment pays it and the rest comes off the balance;
  // the last repayment is only what is still owed.
  function loanFrom(i, years) {
    i = i || {};
    const bad = money(i, ['balance', 'monthly']).concat(rate(i)); if (bad.length) return invalid(bad);
    const lend = i.lender === 'hdb' || i.lender === 'bank' ? i.lender : null;
    const need = []; if (num(i.balance) === null) need.push('balance'); if (num(i.ratePct) === null && !lend) need.push('ratePct');
    if (num(i.monthly) === null && num(i.balance) !== null && i.balance > 0) need.push('monthly');
    if (need.length) return missing(need);
    const months = monthsOf(years); if (months === null) return invalid([{ field: 'period', text: 'A period of 0 to 100 years.' }]);
    const ratePct = num(i.ratePct) !== null ? i.ratePct : lend === 'hdb' ? R.hdbLoanRate * 100 : A.planningRate * 100;
    const rateBasis = num(i.ratePct) !== null ? 'user' : lend === 'hdb' ? 'rule' : 'convention', rateOf = { ratePct: ratePct, rateBasis: rateBasis, rateValidUntil: rateBasis === 'rule' ? R.ratesValidUntil : undefined };
    const r = ratePct / 100;
    if (!(i.balance > 0)) return Object.assign({ ok: true, state: 'repaid', term: 0, months: months, paidMonths: 0, balance: 0, principal: 0, interest: 0, paid: 0, lastPayment: 0 }, rateOf);
    if (!(i.monthly > i.balance * r / 12)) return Object.assign({ ok: true, state: 'never', months: months, balance: null, principal: null, interest: null, paid: null }, rateOf);
    let bal = i.balance, interest = 0, paid = 0, m = 0, term = null, last = 0, at = months === 0 ? { balance: i.balance, interest: 0, paid: 0 } : null;
    while (bal > 0 && m < MONTHS_MAX) {
      m++; const it = bal * r / 12, pay = Math.min(i.monthly, bal + it);
      bal -= pay - it; interest += it; paid += pay; last = pay;
      if (bal <= 1e-6) { bal = 0; term = m; }
      if (m === months) at = { balance: bal, interest: interest, paid: paid };
    }
    if (term === null) return Object.assign({ ok: true, state: 'never', months: months, balance: null, principal: null, interest: null, paid: null }, rateOf);
    if (at === null) at = { balance: 0, interest: interest, paid: paid };   // the period runs past the end of the loan
    return Object.assign({ ok: true, state: 'running', term: term, months: months, paidMonths: Math.min(months, term), balance: at.balance, principal: i.balance - at.balance, interest: at.interest, paid: at.paid, lastPayment: last }, rateOf);
  }

  /* ---------------- valueAt: the visitor's price assumption ---------------- */
  function valueAt(price, pct, years) {
    if (num(price) === null) return missing(['price']);
    const bad = money({ price: price }, ['price']);
    if (num(pct) !== null && !(pct > -100 && pct <= 100)) bad.push({ field: 'pct', text: 'A yearly change between −100% and 100%.' });
    if (num(years) !== null && !(years >= 0 && years <= 100)) bad.push({ field: 'years', text: 'Between 0 and 100 years.' });
    if (bad.length) return invalid(bad);
    const need = []; if (num(pct) === null) need.push('pct'); if (num(years) === null) need.push('years');
    if (need.length) return missing(need);
    return { ok: true, price: price, pct: pct, years: years, value: pct === 0 ? price : price * Math.pow(1 + pct / 100, years) };
  }

  /* ---------------- ledger: one position, one definition ---------------- */
  // p: { years, homes: [{ valueToday, value, loanToday, loan }] (held at the end), cash: { in: [...], out: [...] }, cpf: { in: [...], out: [...] },
  //      paid: { instalments (the loan primitives' payments over the period), rentMonthly, recurringMonthly, oneOff } }
  const sum = (xs) => xs.reduce((a, x) => a + x, 0);
  function ledger(p, against) {
    p = p || {}; const homes = Array.isArray(p.homes) ? p.homes : null, paid = p.paid || {}, flows = (f) => ({ in: Array.isArray((p[f] || {}).in) ? p[f].in : [], out: Array.isArray((p[f] || {}).out) ? p[f].out : [] });
    const cash = flows('cash'), cpf = flows('cpf'), need = [], bad = [];
    if (num(p.years) === null) need.push('years');
    if (!homes) need.push('homes');
    (homes || []).forEach((h, k) => ['valueToday', 'value', 'loanToday', 'loan'].forEach((f) => { if (num(h && h[f]) === null) need.push('homes[' + k + '].' + f); else if (h[f] < 0) bad.push({ field: 'homes[' + k + '].' + f, text: 'Can’t be negative.' }); }));
    [['cash', cash], ['cpf', cpf]].forEach(([f, x]) => { if (!x.in.length) need.push(f + '.in'); x.in.concat(x.out).forEach((v, k) => { if (num(v) === null) need.push(f + '[' + k + ']'); else if (v < 0) bad.push({ field: f, text: 'Flows are amounts of $0 or more (in or out).' }); }); });
    ['instalments', 'rentMonthly', 'recurringMonthly', 'oneOff'].forEach((k) => { if (num(paid[k]) === null) need.push('paid.' + k); else if (paid[k] < 0) bad.push({ field: 'paid.' + k, text: 'Amounts paid can’t be negative.' }); });
    if (need.length) return missing(need);
    if (bad.length) return invalid(bad);
    const months = monthsOf(p.years); if (months === null) return invalid([{ field: 'years', text: 'A period of 0 to 100 years.' }]);
    const value = sum(homes.map((h) => h.value)), valueToday = sum(homes.map((h) => h.valueToday)), loans = sum(homes.map((h) => h.loan)), loansToday = sum(homes.map((h) => h.loanToday));
    const cashLeft = sum(cash.in) - sum(cash.out), cpfLeft = sum(cpf.in) - sum(cpf.out);
    const rent = paid.rentMonthly * months, recurring = paid.recurringMonthly * months, total = paid.instalments + rent + recurring + paid.oneOff, equity = value - loans;
    const out = { ok: true, years: p.years, months: months, homes: homes.length, value: value, valueToday: valueToday, valueChange: value - valueToday, loans: loans, loansToday: loansToday, equity: equity,
      cash: cashLeft, cpf: cpfLeft, paid: { instalments: paid.instalments, rent: rent, recurring: recurring, oneOff: paid.oneOff, total: total }, position: equity + cashLeft + cpfLeft - total, notCash: true };
    if (against && against.ok) out.vs = { position: out.position - against.position, equity: out.equity - against.equity, cash: out.cash - against.cash, cpf: out.cpf - against.cpf, paid: out.paid.total - against.paid.total };
    return out;
  }

  /* ---------------- breakEven ---------------- */
  // i: { target (the position to reach), rest (the other position's parts without this home's end value), value (this home's value today), years, maxPct (shown range, default 20) }
  function breakEven(i) {
    i = i || {};
    if (i.of && typeof i.of === 'object') {   // two ledgers: the target's position; the other's position without its one home's end value
      const T = i.target, O = i.of;
      if (!(T && T.ok && O.ok)) return missing(['target', 'of']);
      if (O.homes !== 1) return invalid([{ field: 'of', text: 'One home held at the end.' }]);
      i = { target: T.position, rest: O.position - O.value, value: O.valueToday, years: O.years, maxPct: i.maxPct };
    }
    const need = ['target', 'rest', 'value', 'years'].filter((k) => num(i[k]) === null); if (need.length) return missing(need);
    if (!(i.value > 0) || !(i.years > 0)) return invalid([{ field: !(i.value > 0) ? 'value' : 'years', text: 'Needs a value and a period above nil.' }]);
    const max = num(i.maxPct) !== null ? i.maxPct : 20, ratio = (i.target - i.rest) / i.value;
    if (ratio <= 0) return { ok: true, state: 'ahead', pct: null, totalPct: null };
    const g = Math.pow(ratio, 1 / i.years) - 1, pct = g * 100;
    return { ok: true, state: Math.abs(pct) > max ? 'beyond' : 'at', pct: pct, totalPct: (ratio - 1) * 100, maxPct: max };
  }

  /* ---------------- mopEnd: an HDB flat's minimum occupation period (P3) ---------------- */
  // i: { met: true } (the owner says it is over) or { category, completed: 'YYYY-MM[-DD]', notCountedMonths }; asOf: 'YYYY-MM[-DD]' (today, from the page).
  const MONTH = /^(\d{4})-(\d{2})(?:-\d{2})?$/;
  const monthIndex = (s) => { const m = MONTH.exec(String(s || '')); return m && +m[2] >= 1 && +m[2] <= 12 ? +m[1] * 12 + (+m[2] - 1) : null; };
  const monthText = (k) => Math.floor(k / 12) + '-' + String(k % 12 + 1).padStart(2, '0');
  function mopEnd(i, asOf) {
    i = i || {};
    if (i.met === true) return { ok: true, state: 'met', basis: 'owner' };
    const need = [];
    if (i.category === undefined || i.category === null || i.category === '') need.push({ field: 'category', need: 'required' });
    if (i.completed === undefined || i.completed === null || i.completed === '') need.push({ field: 'completed', need: 'required' });
    if (asOf === undefined || asOf === null || asOf === '') need.push({ field: 'asOf', need: 'required' });
    if (need.length) return missing(need);
    const years = R.hdbMop.years[i.category], from = monthIndex(i.completed), now = monthIndex(asOf), gap = num(i.notCountedMonths) !== null ? i.notCountedMonths : 0;
    const bad = [];
    if (num(years) === null) bad.push({ field: 'category', text: 'One of: ' + Object.keys(R.hdbMop.years).join(', ') + '.' });
    if (from === null) bad.push({ field: 'completed', text: 'A month, YYYY-MM.' });
    if (now === null) bad.push({ field: 'asOf', text: 'A month, YYYY-MM.' });
    if (!(Number.isInteger(gap) && gap >= 0 && gap <= MONTHS_MAX)) bad.push({ field: 'notCountedMonths', text: 'Whole months, 0 or more.' });
    if (bad.length) return invalid(bad);
    if (from > now) return invalid([{ field: 'completed', text: 'The completion month is after today.' }]);
    const ends = from + years * 12 + gap;
    return { ok: true, state: now > ends ? 'met' : 'not-met', basis: 'rule', category: i.category, years: years, notCountedMonths: gap, completed: monthText(from), endsIn: monthText(ends), monthsLeft: now > ends ? 0 : ends - now + 1, checked: R.hdbMop.checked };
  }

  return { POSITION_VERSION: VERSION, loanAt, loanFrom, valueAt, ledger, breakEven, mopEnd };
});
