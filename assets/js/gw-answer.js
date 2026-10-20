/* ==========================================================================
   GROUNDWORK — Planner answer layer (Stage 1, Oct 2026).
   "Strict internally, effortless externally." This module turns a buyer's few entries into the answer the Planner shows first:
   the comfortable budget, the highest price the numbers allow, what each costs up front and every month, and the simplest
   fixes when a price does not fit. It does no rule-making of its own: every duty, loan limit, tenure, instalment, dated payment
   and sale figure comes from GW_CALC / GW_TIMELINE (and so from GW_RULES), and the price is searched for by calling them.
   No DOM, no storage, no network. UMD: window.GW_ANSWER in the browser (after gw-rules, gw-calc and gw-timeline); in Node,
   require() returns the factory: call it with (GW_RULES, GW_CALC, GW_TIMELINE).

   How a price is judged (all of it, never one part):
     1. Cash and CPF are not interchangeable. The booking fee, the minimum cash and the stamp duties (BSD, ABSD) are paid in cash;
        the rest of the own-money part may be cash or CPF OA. Leftover CPF never pays a cash-only item.
     2. A new launch is only "checked" once the monthly amounts going in are known: then every dated payment is tested on its date
        (GW_TIMELINE, each undated stage at the earliest date it could be called). Until then the figure is an estimate from money in
        hand, and says so. A completed home has no construction stages, so it is always checked.
     3. "Comfortable" also needs the cash left after buying (never CPF, whose use for the instalments is held to limits this
        planner does not check) to cover the cushion the buyer chose (months of instalments, or an amount).
     4. Nothing unresolved raises a figure: no sale is counted until it is entered and chosen "sell first"; a home kept is counted as
        owned (ABSD), as a housing loan (loan limit) and with its instalment (TDSR); the final 15% of a new launch stays provisional
        (it is tested whole at the earliest trigger); the valuation is taken as the price and CPF is counted as entered, never above
        what the purchase needs (stated in "How this was worked out").
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.GW_ANSWER = factory(root.GW_RULES, root.GW_CALC, root.GW_TIMELINE);
})(typeof self !== 'undefined' ? self : this, function (R, C, T) {
  'use strict';
  if (!R || !C || !T || typeof T.timeline !== 'function') throw new Error('GW_ANSWER needs GW_RULES, GW_CALC and GW_TIMELINE');
  const VERSION = 'S2-2026-10-17';
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
  const nn = (x) => (num(x) !== null && x > 0 ? x : 0);
  const has = (x) => num(x) !== null;
  const round2 = (x) => Math.round(x * 100) / 100;
  const STEP = 10000;                        // figures are shown rounded DOWN to this
  const FLOOR_PRICE = 100000, REF_PRICE = 500000;
  const CEIL_PRICE = Math.min(C.LIMITS.money.max, 50e6);
  const floorStep = (x) => Math.floor(x / STEP + 1e-9) * STEP;
  const ceilStep = (x, st) => Math.ceil(x / (st || STEP) - 1e-9) * (st || STEP);
  const MONTHS = [3, 6, 12];
  const MATERIAL = 0.05;                     // a longer tenure is suggested only when it adds this share (5%) to the budget; it never hides the other tenures
  const SUGGEST_MAX_YEARS = 30, SUGGEST_END_AGE = R.bankLtv.maturityAge;   // the 30 years is a planning convention for the suggestion only; the age is the bank maturity age (gw-rules.js), which also cuts a tenure the buyer types
  const LADDER = [15, 20, 25, 30, 35];       // tenures shown for comparison, with the standard, the suggested and the buyer's own

  /* ---------------- validation of the entries (ranges are GW_CALC.LIMITS) ---------------- */
  function validate(s) {
    const e = [], L = C.LIMITS, add = (key, text) => e.push({ key: key, text: text });
    (s.buyers || []).forEach((b, k) => {
      const at = (f) => 'buyers.' + k + '.' + f;
      if (has(b.age) && (b.age < L.age.min || b.age > L.age.max)) add(at('age'), L.age.text);
      ['fixed', 'variable'].forEach((f) => { if (has(b[f]) && (b[f] < 0 || b[f] > L.income.max)) add(at(f), b[f] < 0 ? 'Amounts can’t be negative.' : L.income.text); });
    });
    ['cash', 'cpf', 'saveMo', 'cpfMo', 'debts', 'price', 'setAside', 'prefLoan', 'otherInstal'].forEach((k) => { if (has(s[k]) && (s[k] < 0 || s[k] > L.money.max)) add(k, s[k] < 0 ? 'Amounts can’t be negative.' : L.money.text); });
    if (has(s.ratePct) && (s.ratePct < L.ratePct.min || s.ratePct > L.ratePct.max)) add('ratePct', L.ratePct.text);
    if (has(s.years) && (s.years < L.years.min || s.years > L.years.max)) add('years', L.years.text);
    const f = s.flat || {};
    ['instalment', 'price', 'loan', 'cpfPrincipal', 'cpfInterest', 'cpfRefund', 'overrideCash', 'overrideCpf', 'costs'].forEach((k) => { if (has(f[k]) && (f[k] < 0 || f[k] > L.money.max)) add('flat.' + k, f[k] < 0 ? 'Amounts can’t be negative.' : L.money.text); });
    if (has(s.cushionAmount) && (s.cushionAmount < 0 || s.cushionAmount > L.money.max)) add('cushionAmount', s.cushionAmount < 0 ? 'Amounts can’t be negative.' : L.money.text);
    return e;
  }

  /* ---------------- the entries, read once ---------------- */
  // s: { kind: 'new'|'completed', buyers: [{ res, age, fixed, variable }], debts, ratePct (default 4), years (default: longest keeping the standard limit),
  //      cash, cpf, setAside, saveMo, cpfMo (null/undefined = not given), cushion: { months } | { amount },
  //      home: null | 'none' | 'keep' | 'sell', order: null | 'sell' | 'buy' | 'unsure', flat: { instalment, price, loan, cpfPrincipal, cpfInterest, years, type: 'hdb'|'private' },
  //      price (the price being tried), otp (YYYY-MM-DD) }
  function read(s) {
    s = s || {};
    const buyers = (s.buyers || []).filter((b) => b && (has(b.age) || has(b.fixed) || has(b.variable)));
    const list = buyers.map((b) => ({ age: b.age, fixed: nn(b.fixed), variable: nn(b.variable) }));
    const B = C.borrowers(list);
    const complete = buyers.length > 0 && buyers.every((b) => has(b.age)) && B.gross > 0 && B.iwaa !== null;
    const rate = has(s.ratePct) ? s.ratePct : 4;
    // $0 typed for every buyer is an answer (no income to lend against); a blank income is not (it cannot be checked yet)
    const zeroIncome = buyers.length > 0 && buyers.every((b) => has(b.age)) && B.gross <= 0 && buyers.every((b) => has(b.fixed) || has(b.variable));
    const out = { s: s, buyers: buyers, list: list, B: B, complete: complete, zeroIncome: zeroIncome, ratePct: rate, kind: s.kind === 'completed' ? 'completed' : 'new' };
    if (!complete) return out;
    const probe = C.tdsr({ kind: 'private', borrowers: list, debts: 0, loans: 0, tenure: has(s.years) ? s.years : undefined, quotedRatePct: rate });
    out.probe = probe;
    out.std = probe.ok && probe.tenure ? probe.tenure.std : null;
    // The tenure used is the engine's: the one typed, cut to what the rules and a bank's usual latest age leave (the shorter of 35 years and age 75 less the age), else the standard tenure.
    // Everything below (the loan, the instalment, the tables) reads this one figure, so a tenure past what a bank lends can never reach a result.
    const pt = probe.ok && probe.tenure ? probe.tenure : null;
    out.allowed = pt ? pt.allowed : null;
    out.typed = has(s.years) ? s.years : null;
    out.years = pt && pt.years >= 1 ? pt.years : null;   // the engine's: typed (cut to what a bank lends), else the standard tenure, else (from age 65) the longest a bank usually lends
    out.cappedFrom = out.typed !== null && pt && pt.capped && out.years !== null ? out.typed : null; out.cappedBy = out.cappedFrom !== null ? pt.cappedBy : null;
    out.cash = nn(s.cash); out.cpf = nn(s.cpf); out.setAside = Math.min(nn(s.setAside), out.cash);
    out.debts = nn(s.debts);
    out.contrib = out.kind === 'new' && (has(s.saveMo) || has(s.cpfMo));          // monthly amounts given: new launches are then checked
    out.saveMo = out.kind === 'new' ? nn(s.saveMo) : 0; out.cpfMo = out.kind === 'new' ? nn(s.cpfMo) : 0;
    out.checked = out.kind === 'completed' || out.contrib;
    const c = s.cushion || { months: 6 };
    out.cushion = has(c.amount) ? { amount: Math.max(0, c.amount) } : { months: MONTHS.indexOf(c.months) >= 0 || (has(c.months) && c.months > 0) ? c.months : 6 };
    const f = s.flat || {};
    // Ownership, housing loans, monthly mortgage commitments and the sale are four separate answers (Phase B):
    //   owned (how many properties: 0/1/2), the home's own loan (yes / no / not sure), the loans on any OTHER property and their instalments, and what is done with the home.
    out.homeOwned = s.home === 'keep' || s.home === 'sell';
    out.ownedNow = out.homeOwned ? (has(s.owned) ? Math.max(1, Math.min(2, Math.round(s.owned))) : 1) : 0;
    out.otherOwned = Math.max(0, out.ownedNow - 1);
    out.otherLoans = out.otherOwned > 0 ? (has(s.otherLoans) ? Math.max(0, Math.min(2, Math.round(s.otherLoans))) : null) : 0;
    out.otherInstal = out.otherOwned > 0 && out.otherLoans > 0 ? nn(s.otherInstal) : 0;
    out.flatLoan = loanOf(f);                                   // 'yes' | 'no' | 'unsure' | null (not answered)
    out.flatInstal = out.flatLoan === 'no' ? 0 : nn(f.instalment);
    out.prefLoan = has(s.prefLoan) ? Math.max(0, s.prefLoan) : null;   // the loan the buyer would like to take (never above what the numbers allow)
    out.sale = saleOf(s, out);
    return out;
  }
  // The home's own housing loan. Explicit answers only: yes / no (fully paid) / not sure. An older caller that gave only the instalment is read as before
  // (an instalment means a loan, $0 means none); an entry with neither is "not answered", never a loan or no loan.
  function loanOf(f) {
    if (f.hasLoan === 'yes' || f.hasLoan === 'no' || f.hasLoan === 'unsure') return f.hasLoan;
    return has(f.instalment) ? (f.instalment > 0 ? 'yes' : 'no') : null;
  }
  // The sale of the home. Three figures decide it, and none is invented: the expected selling price, the loan still owed, and the CPF to be refunded INCLUDING the accrued
  // interest (that figure is on the buyer's CPF statement; no holding period is assumed). Until all three are entered the sale is NOT counted: what is already known
  // (the price less selling costs and the loan, before any CPF refund) is shown as known, and what is missing is named. An advanced entry of the cash and CPF the buyer
  // expects to receive replaces the estimate. Cash and CPF returned are always kept apart.
  function saleOf(s, n) {
    if (s.home !== 'sell') return null;
    // An owner aged 55 or over: the CPF refund first tops up their Retirement Account to the Full Retirement Sum (their own balance, not held here), so none of the refund is counted.
    const owner55 = (s.buyers || []).some((b) => b && nn(b.age) >= 55);
    return C.saleEstimate(s.flat || {}, { owner55: owner55, today: todayIso() });
  }

  /* ---------------- one price, judged completely ---------------- */
  // mode: 'none' (no property) | 'keep' (the home stays, counted) | 'sell' (sold first, proceeds counted)
  // over: { addCash } for the fixes
  function evaluate(n, mode, P, over) {
    over = over || {};
    const s = n.s, B = n.B;
    // property ownership (ABSD), housing loans (loan limit) and monthly mortgage commitments (TDSR) are worked out separately:
    //   keep: every property stays owned, the home's loan counts (unless it is fully paid), its instalment counts; sell first: the home is gone, the others stay
    const owned = mode === 'none' ? 0 : (mode === 'sell' ? n.otherOwned : n.ownedNow);
    const flatCounts = mode === 'keep' && n.flatLoan !== 'no' && n.flatLoan !== null;
    const instal = (flatCounts ? n.flatInstal : 0) + n.otherInstal;
    const debts = n.debts + instal;
    if (!(n.years >= 1)) return { ok: false, why: 'tenure' };
    const t = C.tdsr({ kind: 'private', borrowers: n.list, debts: debts, loans: 0, tenure: n.years, quotedRatePct: n.ratePct });
    if (!t.ok || t.noTenure) return { ok: false, why: 'income', t: t };
    const loansForLtv = nn(n.otherLoans) + (flatCounts ? 1 : 0);
    const buyersP = n.buyers.map((b) => ({ res: b.res || 'SC', owned: owned }));
    const prelim = C.progressive({ price: P, age: B.iwaaUse, years: n.years, ratePct: n.ratePct, loans: loansForLtv, kind: 'private', buyers: buyersP });
    if (!prelim.ok) return { ok: false, why: 'rules', prog: prelim };
    // the loan taken is the buyer's preferred loan when it is below what the numbers allow; never above it
    const incomeCap = n.prefLoan === null ? t.maxLoan : Math.min(t.maxLoan, n.prefLoan);
    const capped = incomeCap < prelim.loanMax - 0.5;
    const prog = capped ? C.progressive({ price: P, age: B.iwaaUse, years: n.years, ratePct: n.ratePct, loans: loansForLtv, kind: 'private', buyers: buyersP, loanCap: incomeCap }) : prelim;
    if (!prog.ok) return { ok: false, why: 'rules', prog: prog };
    const loan = prog.loanMax, duty = prog.duty.total, absd = prog.duty.absd || 0, bsd = prog.duty.bsd;
    const sale = mode === 'sell' && n.sale && n.sale.counted ? n.sale : null;
    const cash = Math.max(0, Math.max(0, n.cash - n.setAside) + nn(over.addCash) + (sale ? sale.cash : 0)), cpf = n.cpf + (sale ? sale.cpf : 0);
    // cash and CPF are different money: cash-only items first, then cash-or-CPF
    const cashOnly = prog.cashMin + duty, flexNeed = Math.max(0, P - loan - prog.cashMin);
    const cashShort = Math.max(0, cashOnly - cash), cashLeftAfterOnly = Math.max(0, cash - cashOnly);
    const flexShort = Math.max(0, flexNeed - (cpf + cashLeftAfterOnly));
    const gap = cashShort + flexShort;
    const cpfUsed = Math.min(cpf, flexNeed), cashForFlex = Math.max(0, flexNeed - cpfUsed);
    const leftCash = Math.max(0, cash - cashOnly - cashForFlex);   // cash in hand after buying, statically; CPF left is not counted
    const monthly = C.instal(loan, prog.rate, n.years);
    const res = { ok: true, P: P, mode: mode, owned: owned, years: n.years, loan: loan, maxLoan: Math.min(prelim.loanMax, t.maxLoan), ruleLoan: prog.ruleLoanMax, incomeLoan: t.maxLoan, prefLoan: n.prefLoan, assessRate: t.rate, limit: capped ? (n.prefLoan !== null && n.prefLoan < t.maxLoan - 0.5 ? 'choice' : 'income') : 'rule', ltv: prog.ltv, minCash: prog.minCash, cashMin: prog.cashMin, lower: prog.lower, lowerWhy: prog.lowerWhy,
      bsd: bsd, absd: absd, absdRate: prog.duty.absdRate, duty: duty, dutyNotes: prog.duty.notes, down: P - loan, upfront: P - loan + duty, have: cash + cpf, haveCash: cash, haveCpf: cpf, cashOnly: cashOnly, flexNeed: flexNeed,
      gap: gap, cashShort: cashShort, flexShort: flexShort, leftCash: leftCash, monthly: monthly, monthlyPct: B.gross > 0 ? monthly / B.gross : null, debts: debts, flatInstal: instal, loans: loansForLtv, prog: prog, t: t, sale: sale };
    res.cushion = n.cushion.amount !== undefined ? n.cushion.amount : n.cushion.months * monthly;
    let covered = null, tl = null;
    if (n.checked) {
      const inp = { kind: n.kind, price: P, otp: n.s.otp || todayIso(), buyers: n.buyers.map((b) => ({ res: b.res || 'SC', owned: mode === 'sell' ? n.ownedNow : owned })), age: B.iwaaUse, ratePct: n.ratePct, years: n.years, cash: cash, cpf: n.cpf, saveMo: n.saveMo, cpfMo: n.cpfMo,
        order: mode === 'sell' ? 'sell' : 'none', loansOther: loansForLtv, flatLoan: 'none', sale: mode === 'sell' ? { cash: 0, cpf: sale ? sale.cpf : 0, removesOwnership: true } : {}, loanCap: capped ? incomeCap : undefined, dates: { mode: 'grouped' } };
      // the sale cash is already in `cash`; the engine adds a sell-first sale's own figures, so it is given only the CPF part
      tl = T.timeline(inp);
      if (!tl.ok) return { ok: false, why: 'timeline', tl: tl };
      if (n.kind === 'completed') {
        // a completed home has no construction stages: what is dated is the option, the exercise, the stamp duties and completion. The monthly
        // instalments that follow are paid from income (the loan was sized to it under TDSR), so only the dated payments are tested.
        const bad = tl.events.filter((e) => e.type === 'pay' && e.uncovered > 0.5);
        covered = bad.length === 0;
        res.peak = round2(bad.reduce((a, e) => a + e.uncovered, 0)); res.peakAt = bad[0] ? bad[0].date : null; res.peakCause = bad[0] ? bad[0].label : null; res.firstGap = res.peakAt; res.tight = null;
      } else {
        covered = tl.headline.peak <= 0.5;
        // the lowest cash in hand at any month end (CPF is not counted, as for the cushion)
        let tight = null; tl.series.forEach((x) => { const v = x.cash - x.uncovered; if (tight === null || v < tight.cash) tight = { date: x.date, cash: v }; });
        res.tight = tight; res.peak = tl.headline.peak; res.peakAt = tl.headline.peakAt; res.peakCause = tl.headline.peakCause; res.firstGap = tl.headline.firstGap;
      }
      // what is missed first: the Payment Timeline names this payment and this amount, so the answer does too (the total over all payments is res.peak / res.gap)
      { const fe = res.firstGap ? tl.events.filter((e) => e.type === 'pay' && e.date === res.firstGap && e.uncovered > 0.5)[0] : null; res.firstAmt = fe ? round2(fe.uncovered) : null; res.firstCause = fe ? fe.label : null; }
      res.tl = tl; res.covered = covered;
    }
    res.checked = n.checked; res.covered = covered;
    res.spare = n.checked && res.tight ? Math.min(leftCash, res.tight.cash) : leftCash;
    res.fits = gap <= 0.5 && (covered === null || covered);
    res.zone = !res.fits ? 'over' : (res.spare >= res.cushion - 0.005 ? 'comfortable' : 'tight');
    return res;
  }
  function todayIso() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* ---------------- the search ---------------- */
  // greatest price on the $10,000 grid for which test(evaluation) holds (what is shown is this price, so what is shown always passes); null when the floor does not
  function maxPrice(n, mode, test, over) {
    const f = (P) => { const x = evaluate(n, mode, P, over); return x.ok && test(x); };
    let lo = Math.ceil(FLOOR_PRICE / STEP), hi = Math.floor(CEIL_PRICE / STEP);
    if (!f(lo * STEP)) return null;
    if (f(hi * STEP)) return hi * STEP;
    while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (f(m * STEP)) lo = m; else hi = m; }
    return lo * STEP;
  }
  const fitsT = (x) => x.fits, comfT = (x) => x.zone === 'comfortable';
  function solve(n, mode, over) {
    const hi = maxPrice(n, mode, fitsT, over);
    const co = hi === null ? null : maxPrice(n, mode, comfT, over);
    return { highest: hi, comfortable: co };
  }

  /* ---------------- the answer ---------------- */
  function assess(s) {
    s = s || {};
    // An HDB flat follows HDB's own rules (HDB or bank loan, MSR), not the private-home rules this answer is built on: no figure is worked out, the screen points to the HDB calculator.
    if (s.kind === 'hdb') return { version: VERSION, state: 'hdb', errors: [], checked: false, estimate: false, kind: 'hdb' };
    const errors = validate(s);
    let n = read(s);
    const res = { version: VERSION, state: 'empty', errors: errors, checked: false, estimate: false };
    if (errors.length) { res.state = 'invalid'; return res; }
    const anyEntry = n.buyers.length > 0;
    if (!anyEntry) return res;
    if (!n.complete && n.zeroIncome) { res.state = 'no-income'; return res; }   // income entered as $0: no income-supported loan, so no budget that relies on one
    if (!n.complete) { res.state = 'empty'; res.need = needFor(n); return res; }
    // 1. income alone: what the income supports
    const probe = n.probe;
    if (!probe || !probe.ok) { res.state = 'invalid'; res.errors = (probe && probe.invalid ? probe.invalid.map((x) => ({ key: x.field === 'age' ? 'buyers.0.age' : x.field === 'income' ? 'buyers.0.fixed' : x.field, text: x.text })) : [{ key: 'buyers.0.age', text: 'These figures could not be worked out. Please check them.' }]); return res; }
    if (!(n.years >= 1)) { res.state = 'invalid'; res.errors = [{ key: 'years', text: n.allowed < 1 ? 'Banks usually end a loan by age ' + R.bankLtv.maturityAge + ', so no loan tenure fits at this age.' : 'Any loan would run past age ' + R.bankLtv.endAge + ' for this age. Enter the loan years you want under Adjust assumptions.' }]; return res; }
    const tb = C.tdsr({ kind: 'private', borrowers: n.list, debts: n.debts + n.otherInstal + (s.home === 'keep' ? n.flatInstal : 0), loans: 0, tenure: n.years, quotedRatePct: n.ratePct });
    res.borrow = { max: tb.ok && !tb.noTenure ? tb.maxLoan : 0, years: n.years, std: n.std, rate: tb.rate, income: n.B.gross, counted: n.B.assessable, instalment: tb.forNew };
    res.kind = n.kind; res.years = n.years; res.ratePct = n.ratePct; res.B = n.B;
    const moneyGiven = has(s.cash) || has(s.cpf);
    if (!moneyGiven) { res.state = 'income'; return res; }
    if (!s.home) { res.state = 'ask-home'; return res; }
    // a home that stays, or is being sold: whether it still has a loan, its instalment, and any other property's loans are each asked, never assumed.
    // "Not sure" is an answer (it is worked out on the cautious side and compared with "fully paid"); a blank is not.
    if (n.homeOwned) {
      const ask = [];
      if (n.flatLoan === null) ask.push('loan');
      else if (n.flatLoan === 'yes' && !has((s.flat || {}).instalment)) ask.push('instalment');
      if (n.otherOwned > 0 && n.otherLoans === null) ask.push('otherLoans');
      else if (n.otherOwned > 0 && n.otherLoans > 0 && !has(s.otherInstal)) ask.push('otherInstal');
      if (ask.length) { res.state = 'ask-flat'; res.ask = ask; return res; }
    }
    // 2. which homes' worth of figures: the answer follows the buyer's own choice; unknowns take the lower (kept-home) result
    const mode0 = s.home === 'none' ? 'none' : 'keep';
    const cache = {}, solveC = (nx, mode) => { const k = nx.years + '|' + mode; return cache[k] || (cache[k] = solve(nx, mode)); };
    const basisOf = (nx) => (s.home === 'sell' && nx.sale && nx.sale.counted && s.order === 'sell' ? 'sell' : mode0);
    // 2a. the tenure: used as typed; otherwise the standard tenure (a longer one is only offered)
    const ten = chooseTenure(s, n, basisOf(n), solveC);
    n = ten.n;
    const tb2 = C.tdsr({ kind: 'private', borrowers: n.list, debts: n.debts + n.otherInstal + (s.home === 'keep' ? n.flatInstal : 0), loans: 0, tenure: n.years, quotedRatePct: n.ratePct });
    res.borrow = { max: tb2.ok && !tb2.noTenure ? tb2.maxLoan : 0, years: n.years, std: n.std, rate: tb2.rate, income: n.B.gross, counted: n.B.assessable, instalment: tb2.forNew };
    res.years = n.years;
    const base = solveC(n, mode0);
    let head = base, basis = mode0, saleCounted = false, beneath = null, saleNote = null;
    if (s.home === 'sell') {
      if (!n.sale || !n.sale.counted) saleNote = 'missing';
      else {
        const sold = solveC(n, 'sell');
        if (s.order === 'sell') { head = sold; basis = 'sell'; saleCounted = true; }
        else beneath = { sell: sold, why: s.order === 'buy' ? 'buy' : 'unsure' };
      }
    }
    res.basis = basis; res.saleCounted = saleCounted; res.saleNote = saleNote; res.beneath = beneath; res.sale = n.sale || null;
    // ownership, loans and the other answers, as worked with
    res.facts = { owned: n.ownedNow, otherOwned: n.otherOwned, otherLoans: n.otherLoans, otherInstal: n.otherInstal, flatLoan: n.flatLoan, flatInstal: n.flatInstal, prefLoan: n.prefLoan, ageUnverified: !!n.B.ageUnverified };
    // a home loan the buyer is not sure about is counted (the cautious side); the budget if it is fully paid is shown beside it, never instead of it
    if (n.homeOwned && n.flatLoan === 'unsure' && mode0 === 'keep') { const np = Object.assign({}, n, { flatLoan: 'no', flatInstal: 0 }); const ip = solve(np, 'keep'); res.ifPaid = { highest: ip.highest, comfortable: ip.comfortable }; }
    res.kept = base; // the kept-home (or no-home) figures, for the "if you keep it" line
    res.checked = n.checked; res.estimate = !n.checked;
    if (head.highest === null) {
      res.state = 'out-of-reach';
      const fx = needCashFor(n, basis, REF_PRICE);
      res.lever = fx === null ? null : { kind: 'cash', amount: fx, forPrice: REF_PRICE };
      return res;
    }
    res.state = 'ok'; res.highest = head.highest; res.comfortable = head.comfortable;
    res.tenure = tenureInfo(n, ten, basis, head);
    res.options = () => tenureRows(s, n, ten, basis, solveC);
    // 3. the price being looked at: the buyer's own, else the comfortable budget (else the highest). quote(P) re-judges another price without searching again.
    const quote = (P) => { const at = evaluate(n, basis, P); if (!at.ok) return null; const q = { price: P, at: at, zone: at.zone }; if (at.zone === 'over') q.fixes = fixesFor(n, basis, P, at, head); q.range = rangeFor(head.highest, P); return q; };
    const tried = has(s.price) && s.price > 0 ? s.price : (head.comfortable !== null ? head.comfortable : head.highest);
    res.quote = quote; res.priceIsOwn = has(s.price) && s.price > 0;
    res.atComfortable = head.comfortable !== null ? evaluate(n, basis, head.comfortable) : null; res.atHighest = evaluate(n, basis, head.highest);
    const q0 = quote(tried);
    if (!q0) { res.state = 'invalid'; res.errors = [{ key: 'price', text: 'This price could not be worked out. Please check it.' }]; return res; }
    res.price = tried; res.at = q0.at; res.zone = q0.zone; res.range = q0.range; if (q0.fixes) res.fixes = q0.fixes;
    return res;
  }
  /* ---------------- tenure: the suggestion, and every valid alternative ---------------- */
  // The longest loan the suggestion will consider: 30 years and ending by age 75, never shorter than the standard tenure. A planning convention only.
  const suggestCap = (n) => Math.max(n.std, Math.min(SUGGEST_MAX_YEARS, Math.floor(SUGGEST_END_AGE - n.B.iwaaUse + 1e-9)));
  const score = (h, useHi) => (useHi ? (h.highest === null ? 0 : h.highest) : (h.comfortable === null ? 0 : h.comfortable));
  const materially = (a, b) => a > b && a >= b * (1 + MATERIAL) - 0.5;
  // Which tenure would add the most: the standard, or the longest considered when that adds 5% or more to the budget (comfortable, else the highest). It is offered, not applied (chooseTenure).
  function suggestOf(s, n, basis, solveC) {
    const std = n.std, cap = suggestCap(n);
    const nAt = (y) => (n.years === y ? n : read(Object.assign({}, s, { years: y })));
    const hs = solveC(nAt(std), basis);
    if (cap <= std) return { years: std, std: std, cap: cap, budget: score(hs, hs.comfortable === null), from: null, hs: hs };
    const hc = solveC(nAt(cap), basis), useHi = hs.comfortable === null && hc.comfortable === null;
    const bs = score(hs, useHi), bc = score(hc, useHi);
    return materially(bc, bs) ? { years: cap, std: std, cap: cap, budget: bc, from: std, fromBudget: bs, useHi: useHi } : { years: std, std: std, cap: cap, budget: bs, from: null, useHi: useHi };
  }
  // The tenure used is the buyer's own, else the standard tenure: the longest loan that keeps the standard loan limit (30 years or less AND ending by age 65).
  // A longer tenure is never switched to silently: when it adds 5% or more to the budget it is offered, with the loan limit it would take.
  function chooseTenure(s, n, basis, solveC) {
    const manual = has(s.years);
    if (!(n.std >= 1) && !manual) return { n: n, manual: manual, std: n.std, cap: n.std, suggested: null, nudge: null };
    if (!(n.std >= 0) || n.B.iwaa === null) return { n: n, manual: manual, std: n.std, cap: n.std, suggested: null, nudge: null };
    const sg = suggestOf(s, n, basis, solveC);
    // the offer: tenure `y` against the one in use (`nUse`), with the loan limit it would take at its own budget
    const offer = (y, nUse) => {
      const nx = read(Object.assign({}, s, { years: y })), hx = solveC(nx, basis), hu = solveC(nUse, basis), useHi = hu.comfortable === null && hx.comfortable === null;
      const bu = score(hu, useHi), bx = score(hx, useHi);
      if (!materially(bx, bu)) return null;
      const px = hx.comfortable !== null ? hx.comfortable : hx.highest, at = px === null ? null : evaluate(nx, basis, px);
      return { years: y, budget: bx, own: bu, gain: bx - bu, ltv: at && at.ok ? at.ltv : null, lowerWhy: at && at.ok ? at.lowerWhy : null, lower: !!(at && at.ok && at.lower) };
    };
    if (!manual) {
      const std = sg.std, nStd = n.years === std ? n : read(Object.assign({}, s, { years: std }));
      const nudge = sg.cap > std ? offer(sg.cap, nStd) : null;
      return { n: nStd, manual: false, std: std, cap: sg.cap, suggested: std, longer: false, gain: 0, nudge: nudge };
    }
    // the buyer's own tenure stands; a better one is only mentioned when it adds 5% or more
    let nudge = null;
    if (sg.years !== n.years) nudge = offer(sg.years, n);
    return { n: n, manual: true, std: sg.std, cap: sg.cap, suggested: sg.years, longer: false, nudge: nudge };
  }
  function tenureInfo(n, ten, basis, head) {
    const at = head.comfortable !== null ? evaluate(n, basis, head.comfortable) : evaluate(n, basis, head.highest);
    const iw = n.B.iwaaUse;
    return { years: n.years, allowed: n.allowed, cappedFrom: n.cappedFrom, cappedBy: n.cappedBy, manual: ten.manual, std: ten.std, cap: ten.cap, suggested: ten.suggested, longer: !!ten.longer, gain: ten.gain || 0, vsStdBudget: ten.fromBudget === undefined ? null : ten.fromBudget, nudge: ten.nudge, endAge: Math.round(iw + n.years), age: Math.ceil(iw * 10 - 1e-9) / 10, joint: n.buyers.length > 1, lower: n.years > ten.std, ltv: at.ok ? at.ltv : null, lowerWhy: at.ok ? at.lowerWhy : null };
  }
  // every valid tenure side by side, for the compare table: standard, the suggested, the buyer's own and a ladder up to the 35-year maximum.
  function tenureRows(s, n, ten, basis, solveC) {
    const L = C.LIMITS.years, max = Math.min((R.bankLtv.maxTenure && R.bankLtv.maxTenure.private) || L.max, n.allowed >= 1 ? n.allowed : Infinity);   // only tenures a bank would lend: the shorter of 35 years and age 75 less the age
    const must = [ten.std, ten.suggested, n.years].filter((y) => y >= 1);
    let set = must.slice();
    LADDER.forEach((y) => { if (y <= max && y >= 1 && !must.some((m) => Math.abs(m - y) < 2) && set.indexOf(y) < 0) set.push(y); });
    set = set.filter((y, i) => set.indexOf(y) === i && y <= max).sort((a, b) => a - b);
    const iw = n.B.iwaaUse;
    const rows = set.map((y) => {
      const nx = y === n.years ? n : read(Object.assign({}, s, { years: y })), h = solveC(nx, basis);
      const price = h.comfortable !== null ? h.comfortable : h.highest;
      const at = price === null ? null : evaluate(nx, basis, price);
      return { years: y, endAge: Math.round(iw + y), isStd: y === ten.std, isSuggested: y === ten.suggested, isCurrent: y === n.years, own: ten.manual && y === n.years,
        budget: h.comfortable, highest: h.highest, loan: at && at.ok ? at.loan : null, ltv: at && at.ok ? at.ltv : null, lower: y > ten.std, limit: at && at.ok ? at.limit : null, monthly: at && at.ok ? at.monthly : null };
    });
    const cur = rows.filter((r) => r.isCurrent)[0], ref = cur ? (cur.budget !== null ? cur.budget : cur.highest) : null;
    rows.forEach((r) => { const b = r.budget !== null ? r.budget : r.highest; r.diff = ref === null || b === null ? null : b - ref; });
    return rows;
  }
  function needFor(n) { const k = []; if (!n.buyers.length || !n.buyers.every((b) => has(b.age))) k.push('age'); if (!(n.B.gross > 0)) k.push('income'); return k; }
  // the slider's range follows the highest price, not the price being tried, so it never rescales under the thumb; a price typed outside it widens it
  function rangeFor(highest, tried) {
    let lo = Math.max(FLOOR_PRICE, ceilStep(highest * 0.5, 100000)), hi = ceilStep(highest * 1.3, 100000);
    if (tried < lo) lo = Math.max(FLOOR_PRICE, Math.floor(tried / 100000) * 100000);
    if (tried > hi) hi = ceilStep(tried, 100000);
    return { lo: lo, hi: Math.min(hi, CEIL_PRICE), step: STEP };
  }
  // the least extra cash ($1,000 steps) that makes `P` fit; null when none does
  function needCashFor(n, mode, P) {
    const f = (x) => { const e = evaluate(n, mode, P, { addCash: x }); return e.ok && e.fits; };
    if (f(0)) return 0;
    let lo = 0, hi = 1000;
    while (!f(hi)) { lo = hi; hi *= 2; if (hi > C.LIMITS.money.max) return null; }
    for (let k = 0; k < 60 && hi - lo > 1000; k++) { const m = (lo + hi) / 2; if (f(m)) hi = m; else lo = m; }
    return ceilStep(hi, 1000);
  }
  function fixesFor(n, mode, P, at, head) {
    const list = [];
    const target = head.comfortable !== null ? head.comfortable : head.highest;
    if (target !== null && target < P) { const e = evaluate(n, mode, target); if (e.ok) list.push({ id: 'price', kind: 'price', from: P, to: target, after: e }); }
    const x = needCashFor(n, mode, P);
    if (x !== null && x > 0) { const e = evaluate(n, mode, P, { addCash: x }); if (e.ok) list.push({ id: 'cash', kind: 'cash', add: x, after: e }); }
    return list;
  }

  /* ---------------- details for "How this was worked out" ---------------- */
  // The dated payments (new launch, or a completed home), exactly as GW_TIMELINE produced them; the last 15% keeps its provisional mark.
  function payments(res) {
    const tl = res && res.at && res.at.tl; if (!tl) return null;
    return { events: tl.events, headline: tl.headline, totals: tl.totals, provisional: tl.events.some((e) => e.provisional), keys: tl.keysDate };
  }

  return { assess, evaluate, read, solve, validate, payments, needCashFor, VERSION, STEP, MONTHS, FLOOR_PRICE, MATERIAL, SUGGEST_MAX_YEARS, SUGGEST_END_AGE, floorStep };
});
