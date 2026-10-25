/* ==========================================================================
   GROUNDWORK — Payment Timeline & Cash-Flow Planner: calculation engine (S1, 15 Oct 2026).
   Pure functions: no DOM, no storage, no network. Every financial rule comes from GW_RULES (gw-rules.js, which reads the
   HDB Upgrade Planner's rules.js) and every duty, LTV, tenure and instalment figure is produced by GW_CALC (gw-calc.js).
   This module adds only what those do not have: dates, the order of events, running cash and CPF balances, shortfalls
   and the inflows that close them. It introduces no rate, band or limit of its own.
   What it DOES add, labelled as such on every event: planning conventions (completed-home dates, grouped stage dates,
   the final-15% provisional treatment, an assumed ABSD-refund month) — none of them a legal rule, all of them editable.
   R2.6 (S2-1): the conventions are read from GW_RULES.plannerConventions (gw-rules.js, dated) so one file holds everything a
   reviewer checks; the block below is the same values, kept only so the module can run against an older rules file.
   UMD: window.GW_TIMELINE in the browser (after gw-rules.js and gw-calc.js); in Node, require() returns the factory:
   call it with (GW_RULES, GW_CALC).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.GW_TIMELINE = factory(root.GW_RULES, root.GW_CALC);
})(typeof self !== 'undefined' ? self : this, function (R, C) {
  'use strict';
  if (!R || !C || typeof C.progressive !== 'function' || typeof C.stampDuty !== 'function') throw new Error('GW_TIMELINE needs GW_RULES and GW_CALC');
  const VERSION = 'FE2-2026-10-25';
  // No option date: the timeline runs from a fixed reference day that stands for "the option date" (the same one the schedule adapter uses). It is never shown as a date.
  const UNDATED_REF = '2000-01-01';
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
  const pos = (x) => num(x) !== null && x > 0;
  const nn = (x) => (num(x) !== null && x >= 0 ? x : 0);
  const round2 = (x) => Math.round(x * 100) / 100;
  const missing = (list) => ({ ok: false, missing: list, invalid: [] });
  const invalid = (list) => ({ ok: false, missing: [], invalid: list });

  /* ---------------- dates (UTC, ISO yyyy-mm-dd) ---------------- */
  const D = (s) => (s instanceof Date ? new Date(s.getTime()) : C.parseDate(s));
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  const addMonths = (d, n) => { const x = new Date(d.getTime()); const day = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(day, last)); return x; };
  const monthsBetween = (a, b) => (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());

  /* ---------------- conventions: NOT rules. Each is labelled on the event it produces and can be overridden by the caller. ---------------- */
  const CONVENTIONS = {
    // New launch / EC: the Housing Developers Rules fix the percentages (R.pps) and the 8-week S&P window; stamp duty is payable within
    // 14 days of signing (IRAS). The dates of the construction stages are the developer's and are unknown at the option, so the
    // headline tests every undated stage at the EARLIEST date it could fall due: 4 weeks after the S&P (D2).
    newLaunch: { snpDays: 56, dutyDays: 14, earliestStageDays: 28, topMonths: 48, cscMonths: 60, illustrationMonths: { foundation: 10, frame: 18, walls: 22, roof: 26, fittings: 30, roads: 34 } },
    // Completed private home (D5 defaults, planning conventions, not law): 1% option, 4% on exercise within 14 days, stamp duty within
    // 14 days of exercise, completion 12 weeks after the option. The S&P sets the actual terms.
    completed: { optionPct: 0.01, exercisePct: 0.04, exerciseDays: 14, dutyDays: 14, completionDays: 84 },
    // Final 15%: provisional. The statutory split between CSC and legal completion is not yet verified (R1), so the engine shows the
    // whole 15% at the earliest trigger and flags it. It never presents this as the confirmed legal schedule.
    finalStage: { id: 'csc', provisional: true, label: 'Final payment (CSC / legal completion)', note: 'Provisional: shown as one payment at the earliest trigger. The standard S&P pays the final 15% in parts around CSC and legal completion; the exact split is to be verified before this label is removed.' },
    // ABSD refund (married couple, second home sold in time): eligibility is IRAS’s decision; the application follows the sale; the
    // receipt date is not a rule. Default assumption: two months after the sale completes (R2). Never used before its assumed date.
    refund: { monthsAfterSale: 2 },
    horizonMonthsAfterLast: 12,
  };
  if (R.plannerConventions) ['newLaunch', 'completed', 'finalStage', 'refund', 'horizonMonthsAfterLast'].forEach((k) => { if (R.plannerConventions[k] !== undefined) CONVENTIONS[k] = R.plannerConventions[k]; });
  CONVENTIONS.checked = (R.plannerConventions && R.plannerConventions.checked) || null;
  const MAS_LOAN_BASIS = {
    none: 'No outstanding housing loan on the flat (fully paid): the loan does not count (MAS Notice 632 para 30(o)).',
    discharged: 'The flat’s loan is discharged before the bank’s assessment, so it does not count (MAS Notice 632 para 8(a)(iii)).',
    contracted: 'The flat’s sale is contracted before the bank’s assessment (signed S&P with the IRAS stamp certificate, or HDB’s letter approving the sale), so its loan does not count (MAS Notice 632 para 8(a)(ii), 9(b)).',
    undertaking: 'A signed undertaking to HDB to sell the flat (HDB flat or EC within its minimum occupation period), so its loan does not count (MAS Notice 632 para 8(a)(i), 9(a)).',
    outstanding: 'The flat’s loan is still outstanding at the bank’s assessment, so it counts as one housing loan (MAS Notice 632 para 8(b), 30(o)). Conservative default when the status is unknown (R4).',
    sold: 'Sold first: the flat’s loan is discharged on completion of its sale, before the purchase.',
  };
  const FLAT_LOAN_STATES = Object.keys(MAS_LOAN_BASIS).filter((k) => k !== 'sold');

  /* ---------------- stages ---------------- */
  // Default stages for an uncompleted home: the rules file's list (percentages from the Housing Developers Rules). The caller may
  // supply its own list (id, name, pct, and optionally date or months) — e.g. the developer's expected dates — as long as it sums to 100%.
  function stagesFor(i, kind) {
    const list = Array.isArray(i.stages) && i.stages.length ? i.stages : R.pps.map((s) => ({ id: s.id, name: s.name, pct: s.pct }));
    const sum = list.reduce((s, x) => s + nn(x.pct), 0);
    if (Math.abs(sum - 1) > 1e-9) return { error: { field: 'stages', text: 'The payment stages must add up to 100% of the price (they add up to ' + Math.round(sum * 10000) / 100 + '%).' } };
    if (list.some((x) => !x.id || !pos(x.pct))) return { error: { field: 'stages', text: 'Every stage needs an id and a positive percentage.' } };
    return { list: list.map((x) => Object.assign({}, x)) };
  }

  /* ---------------- input validation ---------------- */
  const KINDS = { new: 'private', ec: 'ec', completed: 'private' };
  function validate(i) {
    i = i || {};
    const bad = [];
    const kind = i.kind || 'new'; if (!KINDS[kind]) bad.push({ field: 'kind', text: 'kind must be new, ec or completed.' });
    const entity = i.entity === true, undated = i.undated === true;
    if (entity && kind === 'ec') bad.push({ field: 'kind', text: 'A company or other entity can buy a new launch or a completed private home here. An EC is sold only to eligible households, so it is not planned for a company.' });
    if (entity && (i.order || 'none') !== 'none') bad.push({ field: 'order', text: 'A company purchase is planned with no home to sell.' });
    const otp = undated ? D(UNDATED_REF) : D(i.otp); if (!otp) bad.push({ field: 'otp', text: 'Option date must be a valid date (YYYY-MM-DD).' });
    ['price', 'cash', 'cpf', 'saveMo', 'cpfMo', 'valuation'].forEach((k) => { if (num(i[k]) !== null && (i[k] < 0 || i[k] > C.LIMITS.money.max)) bad.push({ field: k, text: i[k] < 0 ? 'Amounts can’t be negative.' : C.LIMITS.money.text }); });
    if (num(i.age) !== null && (i.age < C.LIMITS.age.min || i.age > C.LIMITS.age.max)) bad.push({ field: 'age', text: C.LIMITS.age.text });
    if (num(i.ratePct) !== null && (i.ratePct < C.LIMITS.ratePct.min || i.ratePct > C.LIMITS.ratePct.max)) bad.push({ field: 'ratePct', text: C.LIMITS.ratePct.text });
    if (num(i.years) !== null && (i.years < C.LIMITS.years.min || i.years > C.LIMITS.years.max)) bad.push({ field: 'years', text: C.LIMITS.years.text });
    const order = entity ? 'none' : (i.order || 'buy'); if (['buy', 'sell', 'none'].indexOf(order) < 0) bad.push({ field: 'order', text: 'order must be buy (buy first), sell (sell first) or none (no sale).' });
    if (order !== 'none' && i.flatLoan !== undefined && FLAT_LOAN_STATES.indexOf(i.flatLoan) < 0) bad.push({ field: 'flatLoan', text: 'flatLoan must be one of: ' + FLAT_LOAN_STATES.join(', ') + '.' });
    const sale = i.sale || {};
    if (order === 'buy') { if (sale.undecided !== true && !pos(sale.month) && !D(sale.date) && !(num(sale.afterKeys) !== null && sale.afterKeys >= 0)) bad.push({ field: 'sale', text: 'Buy-first needs the month (after the option), the date, the months after the keys, or undecided: when the flat sale completes.' }); }
    if (num(sale.afterKeys) !== null && (sale.afterKeys < 0 || sale.afterKeys > 120)) bad.push({ field: 'sale.afterKeys', text: 'Months after the keys must be between 0 and 120.' });
    ['cash', 'cpf'].forEach((k) => { if (num(sale[k]) !== null && sale[k] < 0) bad.push({ field: 'sale.' + k, text: 'Amounts can’t be negative.' }); });
    if (i.rent && num(i.rent.monthly) !== null && i.rent.monthly < 0) bad.push({ field: 'rent', text: 'Rent can’t be negative.' });
    if (num(i.flatInstal) !== null && (i.flatInstal < 0 || i.flatInstal > C.LIMITS.money.max)) bad.push({ field: 'flatInstal', text: i.flatInstal < 0 ? 'Amounts can’t be negative.' : C.LIMITS.money.text });
    if (Array.isArray(sale.owners) && sale.owners.some((k) => !Number.isInteger(k) || k < 0 || k >= (i.buyers || []).filter(Boolean).length)) bad.push({ field: 'sale.owners', text: 'The owners of the home being sold must be among the buyers.' });
    if (bad.length) return invalid(bad);
    const need = [];
    if (!pos(i.price)) need.push('price'); if (!entity && !pos(i.age)) need.push('age'); if (!entity && !(i.buyers || []).filter(Boolean).length) need.push('buyers');
    if (need.length) return missing(need);
    return { ok: true, kind, otp, order, entity, undated };
  }

  /* ---------------- the engine ---------------- */
  // i: { kind: 'new'|'ec'|'completed', price, otp: 'YYYY-MM-DD', buyers: [{ res, owned }], age (income-weighted average), years, ratePct,
  //      loansOther (housing loans other than the flat's, default 0), flatLoan: none|discharged|contracted|undertaking|outstanding,
  //      cash, cpf (CPF OA usable now), saveMo, cpfMo, payInstalmentFromCpf (default true),
  //      order: 'buy'|'sell'|'none', sale: { month | date, cash, cpf, removesOwnership (default true), owners (C1: indexes of the buyers who own the home being sold) },
  //      couple (C1: true = a married couple buying in their two names only; passed to the stamp duty), flatInstal (C1: buy first, the monthly instalment on the home being sold,
  //      paid until its sale completes),
  //      refund: { assume: bool, monthsAfterSale (default 2) | date }, rent: { monthly, untilKeys (default true) | until: date },
  //      dutyFromCpf: { amount, monthsAfter } (optional CPF reimbursement of stamp duty; off by default),
  //      stages: [{ id, name, pct, date?, months? }] (optional; default R.pps), dates: { mode: 'grouped'|'spread', top, csc, stages: { id: date } },
  //      horizonMonths }
  function timeline(i) {
    const v = validate(i); if (!v.ok) return v;
    const { kind, otp, order, entity, undated } = v;
    const P = i.price, years0 = pos(i.years) ? i.years : undefined;   // no tenure given: GW_CALC.progressive picks the longest one that keeps the standard limit at this age
    const assumptions = [], warnings = [];

    // --- loan count and LTV: counted by GW_CALC.progressive from (loans, age, years) — MAS table via gw-rules ---
    const flatLoan = order === 'sell' ? 'sold' : (order === 'none' ? 'none' : (i.flatLoan || 'outstanding'));
    if (order === 'buy' && !i.flatLoan) assumptions.push({ id: 'flat-loan-default', text: 'Flat loan status not given: assumed still outstanding at the bank’s assessment (conservative).' });
    if (entity) assumptions.push({ id: 'entity', text: 'A company or other entity can borrow up to 15% of the price (MAS). It has no CPF and no income test here, so the rest is cash. Its stamp duty and ABSD are worked out on the entity rates.' });
    if (undated) assumptions.push({ id: 'undated', text: 'No option date entered: every timing is counted from the option date, whenever it falls. Nothing here is a calendar date.' });
    // Notice 632's exclusions for a contracted sale and for an HDB undertaking are not verified against the Notice itself, so they do not lift the headline: the loan is counted as
    // outstanding unless the caller states the bank has accepted the exclusion (flatLoanAccepted: true). The figures if the bank accepts it are returned beside the headline.
    const unverifiedExcl = order === 'buy' && (flatLoan === 'contracted' || flatLoan === 'undertaking');
    const accepted = i.flatLoanAccepted === true;
    const loans = nn(i.loansOther) + (flatLoan === 'outstanding' || (unverifiedExcl && !accepted) ? 1 : 0);
    const loanBasis = unverifiedExcl && !accepted ? 'Counted as an outstanding housing loan. The Notice 632 exclusion for a ' + (flatLoan === 'contracted' ? 'contracted sale' : 'signed undertaking to HDB') + ' is not confirmed here, so it is not relied on until your bank accepts it in writing.' : MAS_LOAN_BASIS[flatLoan];
    if (unverifiedExcl && !accepted) assumptions.push({ id: 'unverified-exclusion', text: 'Special case not confirmed: the flat’s loan is counted as outstanding. Ask your bank whether it will exclude it before relying on the higher loan limit.' });
    const capPref = num(i.prefLoan) === null ? undefined : Math.max(0, i.prefLoan);
    const loanCapIn = num(i.loanCap) === null ? capPref : (capPref === undefined ? i.loanCap : Math.min(i.loanCap, capPref));

    // --- buyers for duty: sell-first completes the flat sale before the purchase, so each buyer who owned IT owns one fewer (C1, B2: never another buyer who owns a different home) ---
    const removes = !(i.sale && i.sale.removesOwnership === false);
    const rows = entity ? [] : (i.buyers || []).filter(Boolean);
    let sellers = null, sellersCautious = false;
    if (order === 'sell' && removes) {
      const owners = rows.map((b, k) => (+b.owned >= 1 ? k : -1)).filter((k) => k >= 0);
      if (Array.isArray(i.sale.owners)) sellers = i.sale.owners.filter((k) => owners.indexOf(k) >= 0);
      else if (owners.length <= 1) sellers = owners;   // only one buyer owns a home: the home sold is theirs
      else {
        // two buyers both own a home and the caller did not say whose home is sold: the cautious side, the choice that leaves the higher ABSD (a home owned by one of them only)
        const cand = [owners].concat(owners.map((k) => [k]));
        const rateFor = (set) => { const d = C.stampDuty({ price: P, kind: kind === 'ec' ? 'ec' : 'private', buyers: rows.map((b, k) => ({ res: b.res, fta: b.fta, owned: set.indexOf(k) >= 0 ? Math.max(0, Math.min(2, +b.owned) - 1) : +b.owned })), couple: i.couple }); return d.ok ? d.absd : 0; };
        sellers = cand.reduce((a, c) => (rateFor(c) > rateFor(a) ? c : a), cand[0]); sellersCautious = true;
      }
    }
    const buyers = rows.map((b, k) => ({ res: b.res, fta: b.fta, owned: sellers && sellers.indexOf(k) >= 0 ? Math.max(0, Math.min(2, +b.owned) - 1) : +b.owned }));
    if (order === 'sell' && removes) assumptions.push({ id: 'sold-ownership', text: sellersCautious ? 'Sold first: not said whose home is being sold, so it is counted as one buyer’s only, the choice with the higher ABSD (the cautious view). Say who owns it to be exact.' : 'Sold first: the home being sold is no longer owned by ' + (rows.length > 1 && sellers.length === 1 ? 'its owner' : 'its owners') + ' when the new home is bought, so it is not counted for their ABSD' + (rows.length > 1 && sellers.length < rows.filter((b) => +b.owned >= 1).length ? '; a buyer’s other home still counts' : '') + '.' });

    // --- the stage split and duty come from the live engine, unchanged ---
    const prog = C.progressive({ price: P, age: entity ? undefined : i.age, years: years0, ratePct: num(i.ratePct) === null ? undefined : i.ratePct, loans, cpf: undefined, kind: kind === 'ec' ? 'ec' : 'private', buyers, couple: entity ? undefined : i.couple, loanCap: loanCapIn, entity, valuation: kind === 'completed' && pos(i.valuation) ? i.valuation : undefined });
    if (!prog.ok) return prog;
    const years = prog.years;
    const duty = prog.duty; if (!duty.ok) return duty;
    const rate = prog.rate, ltvRow = { ltv: prog.ltv, minCash: prog.minCash, lower: prog.lower, lowerWhy: prog.lowerWhy, loans, flatLoan, basis: loanBasis, endAge: R.bankLtv.endAge, special: unverifiedExcl ? { state: flatLoan, accepted: accepted, ifAccepted: (function () { const a = C.progressive({ price: P, age: i.age, years: years0, ratePct: num(i.ratePct) === null ? undefined : i.ratePct, loans: Math.max(0, loans - (accepted ? 0 : 1)), kind: kind === 'ec' ? 'ec' : 'private', buyers, couple: i.couple, loanCap: loanCapIn }); return a.ok ? { ltv: a.ltv, minCash: a.minCash, loanMax: a.loanMax, lower: a.lower } : null; })() } : null, capped: prog.loanCapped, ruleLoanMax: prog.ruleLoanMax };
    const loanMax = prog.loanMax, cashMin = prog.cashMin, cov = prog.cov || 0;
    // A valuation below the price (a completed home): the loan, the minimum cash and the CPF are on the valuation; the part above it is cash, due at completion (R.valuation).
    if (prog.valuation !== null && prog.valuation !== undefined) {
      if (cov > 0) assumptions.push({ id: 'valuation', text: 'Valuation ' + Math.round(prog.valuation) + ' is ' + Math.round(cov) + ' below the price: the loan limit, the minimum cash and the CPF you can use are worked on the valuation, and the ' + Math.round(cov) + ' above it is paid in cash at completion (CPF and the loan cannot cover it).' });
      else if (prog.dutyBase > P) assumptions.push({ id: 'valuation-high', text: 'Valuation ' + Math.round(prog.valuation) + ' is above the price: the loan is worked on the price (the lower), and stamp duty on the valuation (the higher of the two, IRAS).' });
      else assumptions.push({ id: 'valuation-equal', text: 'Valuation ' + Math.round(prog.valuation) + ' is not below the price, so the loan, the minimum cash and the CPF are worked on the price.' });
    }

    // --- events: obligations (rule), developer dates (developer), conventions (estimate), assumptions (assumption) ---
    const ev = [];
    const pay = (o) => ev.push(Object.assign({ type: 'pay', cash: 0, flex: 0, bank: 0 }, o));
    const inflow = (o) => ev.push(Object.assign({ type: 'in', cashIn: 0, cpfIn: 0 }, o));
    let lastDate = otp; const dates = i.dates || {}; const mode = dates.mode === 'spread' ? 'spread' : 'grouped';
    let dutyDate;
    if (kind === 'completed') {
      const K = CONVENTIONS.completed; const exD = addDays(otp, K.exerciseDays); dutyDate = addDays(exD, K.dutyDays); const compD = D(dates.completion) || addDays(otp, K.completionDays);
      // The deposit is paid to the seller before completion, in cash: an option fee cannot be paid with CPF, CPF cannot reimburse money already paid to the seller out of your own funds, and CPF is released
      // only at completion, through the lawyers, after the cash part is paid (CPF Housing Scheme T&C Part B 1(b)(i) and (vi), Part C 3; checked 24 Oct 2026). The cash already paid is credited against the
      // cash-only part of the completion balance (the minimum cash and any cash over valuation), so nothing is counted twice.
      const optAmt = P * K.optionPct, exAmt = P * K.exercisePct, rest = P - optAmt - exAmt, cashPaid = optAmt + exAmt;
      pay({ id: 'option', date: otp, label: 'Option fee', pct: K.optionPct, amount: optAmt, cash: optAmt, confidence: 'estimate', source: 'Planning convention: 1% option fee, cash (D5). CPF cannot pay an option fee. Your option sets the actual amount.' });
      pay({ id: 'exercise', date: exD, label: 'Exercise the option', pct: K.exercisePct, amount: exAmt, cash: exAmt, confidence: 'estimate', source: 'Planning convention: 4% on exercise within 14 days, cash (D5). CPF is released only at completion and cannot reimburse a payment already made to the seller. Your option sets the actual terms.' });
      pay({ id: 'bsd', date: dutyDate, label: 'Buyer’s stamp duty (BSD)', amount: duty.bsd, cash: duty.bsd, confidence: 'rule', source: 'IRAS: within 14 days of exercising; paid in cash first, CPF may reimburse later.' });
      if (duty.absd > 0) pay({ id: 'absd', date: dutyDate, label: 'ABSD ' + Math.round(duty.absdRate * 100) + '%', amount: duty.absd, cash: duty.absd, confidence: 'rule', source: 'IRAS: within 14 days of exercising; paid in cash first. Any refund is conditional.' });
      const compCash = Math.min(Math.max(0, cashMin + cov - cashPaid), rest - loanMax); const compFlex = rest - loanMax - compCash;   // cash-only (minimum cash + cash over valuation) less the cash already paid
      pay({ id: 'completion', date: compD, label: 'Completion', pct: 1 - K.optionPct - K.exercisePct, amount: rest, cash: compCash, flex: compFlex, bank: loanMax, confidence: dates.completion ? 'developer' : 'estimate', source: dates.completion ? 'Completion date as supplied.' : 'Planning convention: completion 12 weeks after the option (D5). Your S&P sets the actual date.' });
      lastDate = compD;
    } else {
      const K = CONVENTIONS.newLaunch; const S = stagesFor(i, kind); if (S.error) return invalid([S.error]);
      const snpD = D(dates.snp) || addDays(otp, K.snpDays); dutyDate = addDays(snpD, K.dutyDays); const earliest = addDays(snpD, K.earliestStageDays);
      const byId = {}; prog.stages.forEach((s) => { byId[s.id] = s; });
      // the live engine splits the standard list; a custom list is split with the same funding order here
      let cashLeft = cashMin, flexLeft = prog.cpfOrCash; const custom = Array.isArray(i.stages) && i.stages.length;
      S.list.forEach((s, k) => {
        let amt = P * s.pct, o = { cash: 0, flex: 0, bank: 0 };
        if (!custom && byId[s.id]) { const q = byId[s.id]; o = { cash: q.cash, flex: q.flex, bank: q.loan }; }
        else { const take = (left) => { const x = Math.min(amt, left); amt -= x; return x; }; o.cash = take(k === 0 ? Infinity : cashLeft); cashLeft = Math.max(0, cashLeft - o.cash); o.flex = take(flexLeft); flexLeft -= o.flex; o.bank = amt; }
        const isOtp = k === 0, isSnp = k === 1, isTop = s.id === 'top', isFinal = s.id === CONVENTIONS.finalStage.id || k === S.list.length - 1;
        let date, confidence, source;
        if (isOtp) { date = otp; confidence = 'rule'; source = 'Housing Developers Rules: booking fee on the option, cash.'; }
        else if (isSnp) { date = snpD; confidence = dates.snp ? 'developer' : 'rule'; source = 'Housing Developers Rules: within 8 weeks of the option; cash or CPF.'; }
        else if (s.date || (dates.stages && dates.stages[s.id])) { date = D(s.date || dates.stages[s.id]); confidence = 'developer'; source = 'Developer’s expected date, as supplied.'; }
        else if (isTop) { date = D(dates.top) || addMonths(otp, pos(s.months) ? s.months : K.topMonths); confidence = dates.top ? 'developer' : 'estimate'; source = dates.top ? 'Developer’s expected TOP date.' : 'Illustrative TOP date (' + (pos(s.months) ? s.months : K.topMonths) + ' months after the option); the developer’s date replaces it.'; }
        else if (isFinal) { date = D(dates.csc) || addMonths(otp, pos(s.months) ? s.months : K.cscMonths); confidence = dates.csc ? 'developer' : 'estimate'; source = (dates.csc ? 'Developer’s expected date. ' : 'Illustrative date (' + (pos(s.months) ? s.months : K.cscMonths) + ' months after the option). ') + CONVENTIONS.finalStage.note; }
        else if (mode === 'spread' && (pos(s.months) || K.illustrationMonths[s.id])) { date = addMonths(otp, pos(s.months) ? s.months : K.illustrationMonths[s.id]); confidence = 'illustrative'; source = 'Illustration only: a typical month for this stage. The headline uses the earliest possible date.'; }
        else { date = earliest; confidence = 'estimate'; source = 'Earliest possible date: a stage can be called from 4 weeks after the S&P. The developer’s notice sets the real date.'; }
        pay({ id: s.id, date, label: s.name, pct: s.pct, amount: P * s.pct, cash: o.cash, flex: o.flex, bank: o.bank, confidence, source, provisional: isFinal && CONVENTIONS.finalStage.provisional && !custom ? true : undefined });
        if (date > lastDate) lastDate = date;
      });
      if (!custom && !dates.csc) assumptions.push({ id: 'final-15', text: CONVENTIONS.finalStage.note });
      pay({ id: 'bsd', date: dutyDate, label: 'Buyer’s stamp duty (BSD)', amount: duty.bsd, cash: duty.bsd, confidence: 'rule', source: 'IRAS: within 14 days of signing the S&P; paid in cash first, CPF may reimburse later.' });
      if (duty.absd > 0) pay({ id: 'absd', date: dutyDate, label: 'ABSD ' + Math.round(duty.absdRate * 100) + '%', amount: duty.absd, cash: duty.absd, confidence: 'rule', source: 'IRAS: within 14 days of signing the S&P; paid in cash first. Any refund is conditional.' });
    }
    const keysDate = ev.filter((e) => e.id === 'top' || e.id === 'completion').map((e) => e.date)[0] || lastDate;

    // --- the sale and what follows it ---
    let saleDate = null;
    const saleUndecided = order === 'buy' && i.sale.undecided === true;
    if (saleUndecided) {
      // FE V2 (25 Oct 2026): buying first with the sale date not decided. Nothing is invented: no sale money arrives within the plan, the home being sold keeps counting
      // for the loan limit (flatLoan, above) and its instalment, if entered, runs to the end of the plan. An ABSD refund depends on the sale date, so it is not counted.
      assumptions.push({ id: 'sale-undecided', text: 'Buying first, sale date not decided: no sale money is counted in this plan. The home you are selling still counts for the loan limit, and its instalment (if entered) carries on to the end of the plan.' });
      if (i.refund && i.refund.assume && duty.absd > 0) assumptions.push({ id: 'refund-undecided', text: 'ABSD refund not counted: it can only follow a sale, and the sale date is not decided.' });
    } else if (order === 'buy') {
      // FE V2: the sale can be dated from the keys (TOP or completion), e.g. selling after TOP; otherwise from the option (months) or an exact date
      saleDate = D(i.sale.date) || (num(i.sale.afterKeys) !== null && i.sale.afterKeys >= 0 ? addMonths(keysDate, i.sale.afterKeys) : addMonths(otp, i.sale.month));
      inflow({ id: 'sale', date: saleDate, label: 'Sale of your flat completes', cashIn: nn(i.sale.cash), cpfIn: nn(i.sale.cpf), confidence: 'assumption', source: 'Your sale date and proceeds (cash, and the amount returned to CPF).' });
      if (saleDate > lastDate) lastDate = saleDate;
      const ref = i.refund || {};
      if (ref.assume && duty.absd > 0) {
        const eligible = duty.notes.some((n) => n.id === 'refund' || n.id === 'single-senior');
        const rd = D(ref.date) || addMonths(saleDate, pos(ref.monthsAfterSale) ? ref.monthsAfterSale : CONVENTIONS.refund.monthsAfterSale);
        inflow({ id: 'refund', date: rd, label: 'ABSD refund (if IRAS’s conditions are met)', cashIn: duty.absd, confidence: 'assumption', eligible, source: (eligible ? 'IRAS refund conditions apply (sell within ' + R.absdRefundMonths + ' months of the purchase, or of TOP/CSC for an uncompleted home; bought jointly in two names; no other home acquired). ' : 'The buyer profile does not match IRAS’s refund conditions; shown only because it was assumed. ') + 'Receipt date assumed: ' + (ref.date ? 'as entered.' : (pos(ref.monthsAfterSale) ? ref.monthsAfterSale : CONVENTIONS.refund.monthsAfterSale) + ' months after the sale completes.') });
        if (!eligible) warnings.push({ id: 'refund-ineligible', text: 'An ABSD refund was assumed, but the buyer profile does not match IRAS’s married-couple or single-senior refund conditions.' });
        assumptions.push({ id: 'refund-month', text: 'ABSD refund assumed to arrive ' + (ref.date ? 'on ' + iso(rd) : (pos(ref.monthsAfterSale) ? ref.monthsAfterSale : CONVENTIONS.refund.monthsAfterSale) + ' months after the sale') + '. Never counted before that date; never guaranteed.' });
        const deadline = kind === 'completed' ? addMonths(otp, R.absdRefundMonths) : null;
        // FE V2: an uncompleted home's refund needs the sale within 6 months of TOP or CSC, whichever is earlier (IRAS); the keys date here is TOP
        const deadlineU = kind !== 'completed' ? addMonths(keysDate, R.absdRefundMonths) : null;
        if (deadlineU && saleDate > deadlineU) warnings.push({ id: 'refund-deadline', text: 'The flat sale completes after ' + iso(deadlineU) + ', ' + R.absdRefundMonths + ' months after TOP: IRAS’s refund deadline for an uncompleted home (within ' + R.absdRefundMonths + ' months of TOP or CSC, whichever is earlier) would be missed.' });
        if (deadline && saleDate > deadline) warnings.push({ id: 'refund-deadline', text: 'The flat sale completes after ' + iso(deadline) + ', six months from the purchase: IRAS’s refund deadline for a completed home would be missed.' });
      }
    } else if (order === 'sell') {
      assumptions.push({ id: 'sold-first', text: 'Sold first: the sale proceeds (' + Math.round(nn((i.sale || {}).cash)) + ' cash, ' + Math.round(nn((i.sale || {}).cpf)) + ' to CPF) are counted as available at the option.' });
    }
    if (i.dutyFromCpf && pos(i.dutyFromCpf.amount)) { const rd = addMonths(dutyDate, pos(i.dutyFromCpf.monthsAfter) ? i.dutyFromCpf.monthsAfter : 1); inflow({ id: 'duty-cpf', date: rd, label: 'CPF reimbursement of stamp duty', cashIn: Math.min(i.dutyFromCpf.amount, duty.total), confidence: 'assumption', source: 'CPF Board: stamp duty is paid in cash and may be reimbursed from CPF after the S&P is lodged. Date assumed.' }); }

    // --- buy first (C1, B4): the home being sold keeps its own instalment until its sale completes (CPF first when instalments are paid from CPF, then cash) ---
    const flatMo = order === 'buy' && flatLoan !== 'none' && flatLoan !== 'discharged' && pos(i.flatInstal) ? i.flatInstal : 0;
    if (flatMo) assumptions.push({ id: 'flat-instalment', text: 'Buying first: the ' + Math.round(flatMo) + ' monthly instalment on the home being sold is paid ' + (saleDate ? 'until its sale completes on ' + iso(saleDate) : 'every month to the end of the plan (sale date not decided)') + '.' });

    // --- interim rent (sell-first): cash only, from the option until the keys ---
    const rentMo = i.rent && pos(i.rent.monthly) && order === 'sell' ? i.rent.monthly : 0;
    const rentUntil = rentMo ? (D(i.rent.until) || keysDate) : null;
    if (rentMo) assumptions.push({ id: 'rent', text: 'Interim rent of ' + Math.round(rentMo) + ' a month from the option until ' + iso(rentUntil) + ', paid in cash.' });

    // --- simulate: events in date order; same-date payments before inflows before the month tick ---
    const horizon = pos(i.horizonMonths) ? i.horizonMonths : monthsBetween(otp, lastDate) + CONVENTIONS.horizonMonthsAfterLast;
    for (let m = 1; m <= horizon; m++) ev.push({ type: 'month', date: addMonths(otp, m), m });
    const ORDER = { pay: 0, in: 1, month: 2 };
    ev.forEach((e, k) => { e.k = k; });
    ev.sort((a, b) => (a.date - b.date) || (ORDER[a.type] - ORDER[b.type]) || (a.k - b.k));
    let cash = nn(i.cash) + (order === 'sell' ? nn((i.sale || {}).cash) : 0), cpf = entity ? 0 : nn(i.cpf) + (order === 'sell' ? nn((i.sale || {}).cpf) : 0);
    const cpfForInstal = i.payInstalmentFromCpf !== false;
    let owedCash = 0, owedFlex = 0, drawn = 0, peak = 0, peakAt = null, peakCause = null, firstGap = null, coveredOn = null, coveredBy = null, instalNow = 0;
    const series = [{ date: iso(otp), cash: round2(cash), cpf: round2(cpf), uncovered: 0, drawn: 0, instalment: 0 }];
    const settle = (by, d) => { const before = owedCash + owedFlex; const f1 = Math.min(owedFlex, cpf); cpf -= f1; owedFlex -= f1; const f2 = Math.min(owedFlex, cash); cash -= f2; owedFlex -= f2; const c1 = Math.min(owedCash, cash); cash -= c1; owedCash -= c1; if (before > 0 && owedCash + owedFlex < 1e-6) { owedCash = owedFlex = 0; coveredOn = d; coveredBy = by; } };
    const bump = (d, cause) => { const o = owedCash + owedFlex; if (o > peak + 1e-6) { peak = o; peakAt = d; peakCause = cause; } };
    for (const e of ev) {
      if (e.type === 'pay') {
        let needFlex = e.flex, needCash = e.cash;
        const u = Math.min(cpf, needFlex); cpf -= u; needFlex -= u;              // cash-or-CPF: CPF first
        const fc = Math.min(cash, needFlex); cash -= fc; needFlex -= fc;        // then cash
        const uc = Math.min(cash, needCash); cash -= uc; needCash -= uc;        // cash-only parts: cash
        e.cpfUsed = round2(u); e.cashUsed = round2(fc + uc); e.uncovered = round2(needFlex + needCash);
        owedFlex += needFlex; owedCash += needCash; drawn += e.bank; e.drawn = drawn; instalNow = C.instal(drawn, rate, years); e.instalment = round2(instalNow);
        if (e.uncovered > 0) { if (!firstGap) firstGap = e.date; coveredOn = null; coveredBy = null; }
        bump(e.date, e.label);
      } else if (e.type === 'in') {
        cash += e.cashIn; cpf += e.cpfIn; if (owedCash + owedFlex > 0) settle(e.id === 'sale' ? 'the sale proceeds' : e.id === 'refund' ? 'the ABSD refund' : e.label.toLowerCase(), e.date);
      } else {
        cash += nn(i.saveMo); if (!entity) cpf += nn(i.cpfMo);
        const rent = rentMo && e.date < rentUntil ? rentMo : 0; // rent for the months before the keys
        const oldMo = flatMo && (!saleDate || e.date <= saleDate) ? flatMo : 0, due = instalNow + oldMo;   // the home being sold, until its sale completes
        const a = cpfForInstal ? Math.min(cpf, due) : 0; cpf -= a; const b = Math.min(cash, due - a); cash -= b;
        const rc = Math.min(cash, rent); cash -= rc;
        const short = (due - a - b) + (rent - rc);
        if (short > 1e-6) { owedCash += short; if (!firstGap) firstGap = e.date; coveredOn = null; coveredBy = null; bump(e.date, 'Monthly instalment' + (oldMo ? 's on both homes' : '') + (rent ? ' and rent' : '')); }
        if (owedCash + owedFlex > 0) settle('your monthly savings', e.date);
        series.push({ date: iso(e.date), cash: round2(cash), cpf: round2(cpf), uncovered: round2(owedCash + owedFlex), drawn, instalment: round2(instalNow), rent, oldInstalment: oldMo || undefined });
      }
    }
    const events = ev.filter((e) => e.type !== 'month').map((e) => { const o = Object.assign({}, e); o.date = iso(e.date); delete o.k; return o; });
    const pays = events.filter((e) => e.type === 'pay');
    const sum = (k) => round2(pays.reduce((s, x) => s + nn(x[k]), 0));
    const uncoveredEnd = round2(owedCash + owedFlex);
    if (uncoveredEnd > 0) warnings.push({ id: 'uncovered-end', text: 'Payments totalling ' + Math.round(uncoveredEnd) + ' are not covered by any inflow within the horizon.' });
    const headline = { peak: round2(peak), peakAt: peakAt && iso(peakAt), peakCause, firstGap: firstGap && iso(firstGap), coveredOn: uncoveredEnd > 0 ? null : (coveredOn && iso(coveredOn)), coveredBy: uncoveredEnd > 0 ? null : coveredBy, uncoveredEnd };
    const out = {
      ok: true, version: VERSION, kind, order, entity, undated, price: P, otp: iso(otp), saleDate: saleDate && iso(saleDate), ...(saleUndecided ? { saleUndecided: true } : {}), keysDate: iso(keysDate), horizonMonths: horizon, ...(order === 'sell' ? { sellers, sellersCautious } : {}), ...(flatMo ? { flatInstal: flatMo } : {}),
      loan: Object.assign({}, ltvRow, { loanMax, cashMin, cpfOrCash: prog.cpfOrCash, valuation: prog.valuation === undefined ? null : prog.valuation, base: prog.base, cov, years, ratePct: rate * 100, stressRatePct: R.stressRate * 100, tenureCapped: prog.tenureCapped, tenureCappedBy: prog.tenureCappedBy, tenureAsked: prog.tenureAsked, tenureAllowed: prog.tenureAllowed }),
      instalment: { final: round2(prog.finalMonthly), finalStress: round2(C.instal(loanMax, Math.max(R.stressRate, rate), years)), basis: 'Instalment at the quoted rate once the loan is fully drawn; the stress figure uses the higher of ' + (R.stressRate * 100) + '% and the quoted rate (MAS Notice 645), for TDSR only.' },
      duty: { bsd: duty.bsd, absd: duty.absd, absdRate: duty.absdRate, total: duty.total, notes: duty.notes, remissions: duty.remissions, date: iso(dutyDate) },
      events, series, headline, totals: { amount: sum('amount'), cash: sum('cashUsed'), cpf: sum('cpfUsed'), bank: sum('bank'), uncovered: sum('uncovered') },
      assumptions, warnings, conventions: CONVENTIONS, rulesChecked: R.checked,
    };
    // D2: an illustration (spread dates) never changes the headline — it is returned beside it
    if (mode === 'spread' && kind !== 'completed') { const g = timeline(Object.assign({}, i, { dates: Object.assign({}, dates, { mode: 'grouped' }) })); out.illustration = { events: out.events, series: out.series, headline: out.headline }; out.events = g.events; out.series = g.series; out.headline = g.headline; out.totals = g.totals; }
    return out;
  }

  // Both orders for the same purchase, with the lines the comparison shows (decision 6).
  function compare(i) {
    const buy = timeline(Object.assign({}, i, { order: 'buy' })), sell = timeline(Object.assign({}, i, { order: 'sell' }));
    if (!buy.ok || !sell.ok) return { ok: false, buy, sell };
    const rentTotal = sell.series.reduce((s, x) => s + nn(x.rent), 0);
    return { ok: true, buy, sell, lines: [
      { id: 'peak', label: 'Largest shortfall', buy: buy.headline.peak, sell: sell.headline.peak },
      { id: 'absd', label: 'ABSD paid up front', buy: buy.duty.absd, sell: sell.duty.absd },
      { id: 'rent', label: 'Interim rent, total', buy: 0, sell: round2(rentTotal) },
      { id: 'ltv', label: 'Loan limit', buy: buy.loan.ltv, sell: sell.loan.ltv, text: { buy: buy.loan.basis, sell: sell.loan.basis } },
      { id: 'instal', label: 'Instalment once fully drawn', buy: buy.instalment.final, sell: sell.instalment.final },
    ] };
  }

  return { timeline, compare, validate, UNDATED_REF, CONVENTIONS, MAS_LOAN_BASIS, FLAT_LOAN_STATES, VERSION, addMonths, addDays, iso };
});
