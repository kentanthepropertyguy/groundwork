/* ==========================================================================
   GROUNDWORK — Payment schedule (Layer 1) and plain-words date basis (Oct 2026, Concept B).
   A READ-ONLY adapter. It lists what has to be paid, when, and on what basis, for a price and an option date alone: no age, income, cash,
   CPF or loan. Every figure it returns is a rule table value (GW_RULES.pps, GW_RULES.plannerConventions) or the stamp duty from
   GW_CALC.stampDuty, exactly the pieces the audited engine (gw-timeline.js) uses. It never calls GW_TIMELINE and adds no rate, band or
   limit of its own. tests/55-schedule-adapter.test.js proves, case by case, that its payments equal the engine's.
   Also here: the date-basis tag and sentence for each payment (so an illustrative date is never called a deadline), and the earliest-shortfall
   summary read from an engine result. Neither does arithmetic: they read fields the engine already returned.
   UMD: window.GW_SCHEDULE in the browser (after gw-rules.js and gw-calc.js); in Node, require() returns the factory: call it with (GW_RULES, GW_CALC).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.GW_SCHEDULE = factory(root.GW_RULES, root.GW_CALC);
})(typeof self !== 'undefined' ? self : this, function (R, C) {
  'use strict';
  if (!R || !C || typeof C.stampDuty !== 'function' || !Array.isArray(R.pps) || !R.plannerConventions) throw new Error('GW_SCHEDULE needs GW_RULES (with pps and plannerConventions) and GW_CALC');
  const VERSION = 'C1-2026-10-18';
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
  const pos = (x) => num(x) !== null && x > 0;
  const KINDS = { new: 1, ec: 1, completed: 1 };
  const K = R.plannerConventions, NL = K.newLaunch, CP = K.completed, FS = K.finalStage;
  /* ---------------- dates (UTC, ISO yyyy-mm-dd): the same arithmetic the engine uses for its dates ---------------- */
  const D = (s) => (s instanceof Date ? new Date(s.getTime()) : C.parseDate(s));
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  const addMonths = (d, n) => { const x = new Date(d.getTime()); const day = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(day, last)); return x; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? +m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : (s || ''); };
  const mon = (s) => { const m = /^(\d{4})-(\d{2})/.exec(s || ''); return m ? MON[+m[2] - 1] + ' ' + m[1] : (s || ''); };

  /* ---------------- the schedule ---------------- */
  // i: { kind: 'new'|'ec'|'completed', price, otp: 'YYYY-MM-DD', buyers?: [{ res, owned }] (default: one Singapore Citizen who owns no home, said in `assumedBuyer`),
  //      order?: 'sell' with removesOwnership !== false (the flat is gone before the purchase, so each buyer owns one fewer: the engine's own rule),
  //      dates?: { mode: 'grouped'|'spread', snp, top, csc, completion, stages: { id: date } } }
  function schedule(i) {
    i = i || {};
    const bad = [];
    const kind = i.kind || 'new'; if (!KINDS[kind]) bad.push({ field: 'kind', text: 'kind must be new, ec or completed.' });
    const otp = D(i.otp); if (!otp) bad.push({ field: 'otp', text: 'Option date must be a valid date (YYYY-MM-DD).' });
    if (num(i.price) !== null && (i.price < 0 || i.price > C.LIMITS.money.max)) bad.push({ field: 'price', text: i.price < 0 ? 'Amounts can’t be negative.' : C.LIMITS.money.text });
    if (bad.length) return { ok: false, missing: [], invalid: bad };
    const assumedBuyer = i.buyers === undefined;
    const given = (assumedBuyer ? [{ res: 'SC', owned: 0 }] : (i.buyers || [])).filter(Boolean);
    const need = []; if (!pos(i.price)) need.push('price'); if (!given.length) need.push('buyers');
    if (need.length) return { ok: false, missing: need, invalid: [] };
    const removes = !(i.removesOwnership === false);
    const buyers = given.map((b) => ({ res: b.res, owned: i.order === 'sell' && removes ? Math.max(0, Math.min(2, +b.owned) - 1) : +b.owned }));
    const P = i.price;
    const duty = C.stampDuty({ price: P, kind: kind === 'ec' ? 'ec' : 'private', buyers });
    if (!duty.ok) return duty;
    const dates = i.dates || {}, mode = dates.mode === 'spread' ? 'spread' : 'grouped';
    const ev = [], assumptions = [];
    const pay = (o) => ev.push(Object.assign({ type: 'pay' }, o));
    let dutyDate;
    if (kind === 'completed') {
      const exD = addDays(otp, CP.exerciseDays); dutyDate = addDays(exD, CP.dutyDays); const compD = D(dates.completion) || addDays(otp, CP.completionDays);
      const optAmt = P * CP.optionPct, exAmt = P * CP.exercisePct, rest = P - optAmt - exAmt;
      pay({ id: 'option', date: iso(otp), label: 'Option fee', pct: CP.optionPct, amount: optAmt, confidence: 'estimate', source: 'Planning convention: 1% option fee, cash (D5). Your option sets the actual amount.' });
      pay({ id: 'exercise', date: iso(exD), label: 'Exercise the option', pct: CP.exercisePct, amount: exAmt, confidence: 'estimate', source: 'Planning convention: 4% on exercise within 14 days (D5). Your option sets the actual terms.' });
      pay({ id: 'bsd', date: iso(dutyDate), label: 'Buyer’s stamp duty (BSD)', amount: duty.bsd, confidence: 'rule', source: 'IRAS: within 14 days of exercising; paid in cash first, CPF may reimburse later.' });
      if (duty.absd > 0) pay({ id: 'absd', date: iso(dutyDate), label: 'ABSD ' + Math.round(duty.absdRate * 100) + '%', amount: duty.absd, confidence: 'rule', source: 'IRAS: within 14 days of exercising; paid in cash first. Any refund is conditional.' });
      pay({ id: 'completion', date: iso(compD), label: 'Completion', pct: 1 - CP.optionPct - CP.exercisePct, amount: rest, confidence: dates.completion ? 'developer' : 'estimate', source: dates.completion ? 'Completion date as supplied.' : 'Planning convention: completion 12 weeks after the option (D5). Your S&P sets the actual date.' });
    } else {
      const list = R.pps.map((s) => ({ id: s.id, name: s.name, pct: s.pct }));
      const snpD = D(dates.snp) || addDays(otp, NL.snpDays); dutyDate = addDays(snpD, NL.dutyDays); const earliest = addDays(snpD, NL.earliestStageDays);
      list.forEach((s, k) => {
        const isOtp = k === 0, isSnp = k === 1, isTop = s.id === 'top', isFinal = s.id === FS.id || k === list.length - 1;
        let date, confidence, source;
        if (isOtp) { date = otp; confidence = 'rule'; source = 'Housing Developers Rules: booking fee on the option, cash.'; }
        else if (isSnp) { date = snpD; confidence = dates.snp ? 'developer' : 'rule'; source = 'Housing Developers Rules: within 8 weeks of the option; cash or CPF.'; }
        else if (dates.stages && dates.stages[s.id]) { date = D(dates.stages[s.id]); confidence = 'developer'; source = 'Developer’s expected date, as supplied.'; }
        else if (isTop) { date = D(dates.top) || addMonths(otp, NL.topMonths); confidence = dates.top ? 'developer' : 'estimate'; source = dates.top ? 'Developer’s expected TOP date.' : 'Illustrative TOP date (' + NL.topMonths + ' months after the option); the developer’s date replaces it.'; }
        else if (isFinal) { date = D(dates.csc) || addMonths(otp, NL.cscMonths); confidence = dates.csc ? 'developer' : 'estimate'; source = (dates.csc ? 'Developer’s expected date. ' : 'Illustrative date (' + NL.cscMonths + ' months after the option). ') + FS.note; }
        else if (mode === 'spread' && NL.illustrationMonths[s.id]) { date = addMonths(otp, NL.illustrationMonths[s.id]); confidence = 'illustrative'; source = 'Illustration only: a typical month for this stage. The headline uses the earliest possible date.'; }
        else { date = earliest; confidence = 'estimate'; source = 'Earliest possible date: a stage can be called from 4 weeks after the S&P. The developer’s notice sets the real date.'; }
        pay({ id: s.id, date: iso(date), label: s.name, pct: s.pct, amount: P * s.pct, confidence, source, provisional: isFinal && FS.provisional ? true : undefined });
      });
      if (!dates.csc) assumptions.push({ id: 'final-15', text: FS.note });
      pay({ id: 'bsd', date: iso(dutyDate), label: 'Buyer’s stamp duty (BSD)', amount: duty.bsd, confidence: 'rule', source: 'IRAS: within 14 days of signing the S&P; paid in cash first, CPF may reimburse later.' });
      if (duty.absd > 0) pay({ id: 'absd', date: iso(dutyDate), label: 'ABSD ' + Math.round(duty.absdRate * 100) + '%', amount: duty.absd, confidence: 'rule', source: 'IRAS: within 14 days of signing the S&P; paid in cash first. Any refund is conditional.' });
    }
    ev.forEach((e, k) => { e.k = k; });
    ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.k - b.k));
    const events = ev.map((e) => { const o = Object.assign({}, e); delete o.k; o.basis = basisOf(o, kind); return o; });
    const total = events.reduce((s, e) => s + e.amount, 0);
    return { ok: true, version: VERSION, kind, price: P, otp: iso(otp), assumedBuyer, events, duty: { bsd: duty.bsd, absd: duty.absd, absdRate: duty.absdRate, total: duty.total, notes: duty.notes, remissions: duty.remissions, date: iso(dutyDate) }, totals: { amount: Math.round(total * 100) / 100 }, assumptions, conventions: K, rulesChecked: R.checked };
  }

  /* ---------------- the basis of each date ---------------- */
  // From the event the engine (or the schedule above) returned: its confidence, id and provisional flag. Nothing is invented.
  //   rule: the date is fixed by the Housing Developers Rules or IRAS (the option date you chose, the S&P at its latest date, stamp duty)
  //   developer: a date the buyer typed in from the developer's schedule
  //   earliest: a construction stage with no developer date, shown on the earliest date it could be called
  //   estimate: a planning convention (TOP, final payment, the completed-home dates)
  //   illustration: spread mode only, a typical month
  //   assumption: money arriving (the sale, a refund), on a date the buyer gave
  function basisOf(e, kind) {
    const c = e.confidence;
    if (c === 'rule') return 'rule';
    if (c === 'developer') return 'developer';
    if (c === 'illustrative') return 'illustration';
    if (c === 'assumption') return 'assumption';
    if (c === 'estimate') return (kind === 'new' || kind === 'ec') && e.id !== 'top' && e.id !== 'csc' ? 'earliest' : 'estimate';
    return 'estimate';
  }
  const BASIS_TAG = { rule: 'By rule', developer: 'From developer', earliest: 'Earliest', estimate: 'Estimated', illustration: 'Illustration', assumption: 'Your date' };
  // One plain sentence for a payment's date. Only a rule date is "due"; an estimate, an earliest date or an illustration is never called a deadline.
  function dateSentence(e, kind) {
    const b = e.basis || basisOf(e, kind || 'new'), d = day(e.date);
    let s;
    if (b === 'rule') {
      if (e.id === 'otp') s = 'Paid on the option date you chose, under the Housing Developers Rules.';
      else if (e.id === 'snp') s = 'Due by ' + d + ', the latest date under the Housing Developers Rules (within 8 weeks of the option).';
      else if (e.id === 'bsd' || e.id === 'absd') s = 'Due by ' + d + ' under IRAS’s 14-day rule after ' + (kind === 'completed' ? 'you exercise the option' : 'signing the S&P') + '.';
      else s = 'Due by ' + d + ' under the rules.';
    } else if (b === 'developer') s = 'On the date you entered from the developer’s schedule. Check it against your S&P.';
    else if (b === 'earliest') s = 'From ' + d + ', the earliest this stage can be called. The developer’s notice sets the real date, which may be later.';
    else if (b === 'illustration') s = 'An illustration, not a timetable.';
    else if (b === 'assumption') s = 'On the date you entered. It is not guaranteed.';
    else if (e.id === 'option') s = 'On your option date. The 1% amount is a planning convention; your option sets the actual figure.';
    else if (e.id === 'exercise') s = 'Around ' + d + ', 14 days after the option: a planning convention. Your option sets the actual terms.';
    else if (e.id === 'completion') s = 'Around ' + mon(e.date) + ', an illustrative date, not a deadline. Your S&P sets the actual date.';
    else s = 'Around ' + mon(e.date) + ', an illustrative date, not a deadline.';
    if (e.provisional) s += ' Provisional: shown as one payment at the earliest trigger.';
    return s;
  }

  /* ---------------- the earliest shortfall, read from an engine result ---------------- */
  // r: a GW_TIMELINE.timeline() result. Reads fields the engine already returned: no arithmetic.
  //   first: the first payment (in date, then plan order) the money cannot meet in full, with its date basis and sentence;
  //   onPayments: the total not covered on payments when due (engine totals.uncovered);
  //   stillOpenAtEnd: what is still not covered at the end of the engine's horizon after every inflow, including monthly instalments (engine headline.uncoveredEnd);
  //   monthly: the first gap is a monthly instalment (or rent), not a payment stage;
  //   coveredOn / coveredBy: when later money closes the gap (engine headline)
  function shortfall(r) {
    if (!r || !r.ok) return { ok: false };
    const pays = r.events.filter((e) => e.type === 'pay'), hit = pays.filter((e) => e.uncovered > 0)[0] || null;
    const h = r.headline, endOpen = h.uncoveredEnd, stageTotal = r.totals.uncovered;
    const out = { ok: true, any: h.peak > 0, first: null, monthly: false, onPayments: stageTotal, stillOpenAtEnd: endOpen, horizonEnd: r.series && r.series.length ? r.series[r.series.length - 1].date : null, coveredOn: h.coveredOn || null, coveredBy: h.coveredBy || null, firstGap: h.firstGap || null, peak: h.peak, peakAt: h.peakAt, peakCause: h.peakCause };
    if (hit) { const b = hit.basis || basisOf(hit, r.kind); out.first = { id: hit.id, label: hit.label, date: hit.date, amount: hit.uncovered, basis: b, tag: BASIS_TAG[b], provisional: !!hit.provisional, sentence: dateSentence(Object.assign({}, hit, { basis: b }), r.kind) }; }
    else if (h.firstGap) out.monthly = true;
    return out;
  }
  // the engine's events with each payment's date basis, tag and sentence attached (for the table)
  function annotate(r) {
    return r.events.map((e) => { if (e.type !== 'pay') return Object.assign({}, e); const b = basisOf(e, r.kind); return Object.assign({}, e, { basis: b, tag: BASIS_TAG[b], sentence: dateSentence(Object.assign({}, e, { basis: b }), r.kind) }); });
  }
  // ---- ONE cross-check, kept apart from everything above: the other documented way to count progressive instalments (added 18 Oct 2026) ----
  // The audited engine charges, after each release, the level instalment on everything released so far over the FULL tenure (the same figure a mortgage
  // calculator gives for that amount). A worked example published by a broker (icompareloan.com, "Understanding BUC home loans": $2M price, $1.6M loan)
  // is reproduced to the cent by a different convention: the tenure counts from the FIRST release, and at each release the outstanding balance plus the new
  // release is re-amortised over the tenure that remains. No bank document that states either convention was found (see tests/57), so the page shows the
  // engine's figure and says that a bank counting from the first release charges more. This function computes that other figure; it reads releases and
  // never feeds anything back into the engine. releases: [{ date: 'yyyy-mm-dd', amount }], ratePct a year, years the tenure.
  function tenureFromFirstRelease(releases, ratePct, years) {
    const rel = (releases || []).filter((x) => x && pos(x.amount) && /^\d{4}-\d{2}-\d{2}/.test(x.date)).map((x) => ({ date: x.date.slice(0, 10), amount: x.amount })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const N = Math.round(years * 12), rate = ratePct / 100 / 12;
    if (!rel.length || !(N > 0) || !(ratePct >= 0)) return null;
    const mi = (d) => +d.slice(0, 4) * 12 + (+d.slice(5, 7) - 1), m0 = mi(rel[0].date), by = {};
    rel.forEach((x) => { const k = mi(x.date) - m0; by[k] = (by[k] || 0) + x.amount; });
    const last = Math.max.apply(null, Object.keys(by).map(Number)), pmt = (b, n) => (rate > 0 ? b * rate / (1 - Math.pow(1 + rate, -n)) : b / n);
    let bal = 0, inst = 0; const steps = [];
    for (let m = 0; m <= last; m++) {
      if (by[m]) { bal += by[m]; inst = pmt(bal, N - m); steps.push({ month: m, instalment: inst, outstanding: bal }); }
      bal -= Math.max(0, inst - bal * rate);
    }
    return { steps, final: steps[steps.length - 1].instalment };
  }
  return { schedule, basisOf, dateSentence, shortfall, annotate, tenureFromFirstRelease, BASIS_TAG, VERSION, day, mon };
});
