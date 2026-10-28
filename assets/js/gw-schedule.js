/* ==========================================================================
   GROUNDWORK — Payment schedule (Layer 1) and plain-words date basis (Oct 2026, Concept B).
   A READ-ONLY adapter (plus hdb(), the basic HDB resale and new-flat list from GW_RULES.hdbPayments). It lists what has to be paid, when, and on what basis, for a price and an option date alone: no age, income, cash,
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
  // No option date (undated): the schedule is worked out from a fixed reference day that stands for "the option date". It is never shown as a date: every
  // timing is read back as "N weeks / N months after the option" (after()). The first of a month, so no month-end clamp can move a payment.
  const UNDATED_REF = '2000-01-01';
  const ENTITY_KINDS = 'A company or other entity can buy a new launch or a completed private home here. An EC is sold only to eligible households, so it is not planned for a company.';
  const K = R.plannerConventions, NL = K.newLaunch, CP = K.completed, FS = K.finalStage;
  /* ---------------- dates (UTC, ISO yyyy-mm-dd): the same arithmetic the engine uses for its dates ---------------- */
  const D = (s) => (s instanceof Date ? new Date(s.getTime()) : C.parseDate(s));
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  const addMonths = (d, n) => { const x = new Date(d.getTime()); const day = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(day, last)); return x; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? +m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : (s || ''); };
  const mon = (s) => { const m = /^(\d{4})-(\d{2})/.exec(s || ''); return m ? MON[+m[2] - 1] + ' ' + m[1] : (s || ''); };
  // how long after the option a date falls, in whole weeks (up to 13 weeks) or months, for an undated schedule; null for a date on or before the option
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  function after(s) {
    const d = D(s), r = D(UNDATED_REF); if (!d || !r) return '';
    const days = Math.round((d.getTime() - r.getTime()) / 86400000);
    if (days <= 0) return 'the option date';
    if (days < 14) return plural(days, 'day') + ' after the option';
    if (days <= 91) return plural(Math.round(days / 7), 'week') + ' after the option';
    return plural(Math.round(days / 30.4375), 'month') + ' after the option';
  }

  /* ---------------- the schedule ---------------- */
  // i: { kind: 'new'|'ec'|'completed', price, otp: 'YYYY-MM-DD', buyers?: [{ res, owned }] (default: one Singapore Citizen who owns no home, said in `assumedBuyer`),
  //      order?: 'sell' with removesOwnership !== false (the home sold is gone before the purchase, so ITS owners own one fewer: the engine's own rule),
  //      saleOwners?: indexes of the buyers who own the home being sold (C1, B2; not given and both own homes: the cautious choice, the higher ABSD, as the engine does),
  //      couple?: true = a married couple buying in their two names only (C1, B1); buyers[k].fta: an FTA national (C1, B1),
  //      dates?: { mode: 'grouped'|'spread', snp, top, csc, completion, stages: { id: date } } }
  function schedule(i) {
    i = i || {};
    const bad = [];
    const kind = i.kind || 'new'; if (!KINDS[kind]) bad.push({ field: 'kind', text: 'kind must be new, ec or completed.' });
    const entity = i.entity === true, undated = i.undated === true;
    if (entity && kind === 'ec') bad.push({ field: 'kind', text: ENTITY_KINDS });
    const otp = undated ? D(UNDATED_REF) : D(i.otp); if (!otp) bad.push({ field: 'otp', text: 'Option date must be a valid date (YYYY-MM-DD).' });
    if (num(i.price) !== null && (i.price < 0 || i.price > C.LIMITS.money.max)) bad.push({ field: 'price', text: i.price < 0 ? 'Amounts can’t be negative.' : C.LIMITS.money.text });
    if (bad.length) return { ok: false, missing: [], invalid: bad };
    const assumedBuyer = !entity && i.buyers === undefined;
    const given = entity ? [] : (assumedBuyer ? [{ res: 'SC', owned: 0 }] : (i.buyers || [])).filter(Boolean);
    const need = []; if (!pos(i.price)) need.push('price'); if (!entity && !given.length) need.push('buyers');
    if (need.length) return { ok: false, missing: need, invalid: [] };
    const removes = !(i.removesOwnership === false);
    const P = i.price, couple = entity ? undefined : i.couple;
    // C1 (B2): the same rule as GW_TIMELINE: a sold home leaves its owners only; whose it is, when not said and both own homes, is the cautious choice (the higher ABSD)
    const after = (set) => given.map((b, k) => ({ res: b.res, fta: b.fta, owned: set && set.indexOf(k) >= 0 ? Math.max(0, Math.min(2, +b.owned) - 1) : +b.owned }));
    let sellers = null;
    if (i.order === 'sell' && removes) {
      const owners = given.map((b, k) => (+b.owned >= 1 ? k : -1)).filter((k) => k >= 0);
      if (Array.isArray(i.saleOwners)) sellers = i.saleOwners.filter((k) => owners.indexOf(k) >= 0);
      else if (owners.length <= 1) sellers = owners;
      else { const absdOf = (set) => { const d = C.stampDuty({ price: P, kind: kind === 'ec' ? 'ec' : 'private', buyers: after(set), couple: couple }); return d.ok ? d.absd : 0; }; sellers = [owners].concat(owners.map((k) => [k])).reduce((a, c) => (absdOf(c) > absdOf(a) ? c : a)); }
    }
    const buyers = after(sellers);
    const duty = C.stampDuty({ price: P, kind: kind === 'ec' ? 'ec' : 'private', buyers, entity, couple: couple });
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
    return { ok: true, version: VERSION, kind, price: P, otp: iso(otp), entity, undated, assumedBuyer, events, duty: { bsd: duty.bsd, absd: duty.absd, absdRate: duty.absdRate, total: duty.total, notes: duty.notes, remissions: duty.remissions, date: iso(dutyDate) }, totals: { amount: Math.round(total * 100) / 100 }, assumptions, conventions: K, rulesChecked: R.checked };
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
  const BASIS_TAG = { rule: 'By rule', developer: 'From developer', earliest: 'Earliest', estimate: 'Estimated', illustration: 'Illustration', assumption: 'Your date', trigger: 'Milestone' };
  // One plain sentence for a payment's date. Only a rule date is "due"; an estimate, an earliest date or an illustration is never called a deadline.
  function dateSentence(e, kind, undated) {
    const b = e.basis || basisOf(e, kind || 'new'), un = undated === true, d = un ? after(e.date) : day(e.date), m = un ? after(e.date) : mon(e.date);
    let s;
    if (b === 'rule') {
      if (e.id === 'otp') s = un ? 'Paid on the option date, under the Housing Developers Rules.' : 'Paid on the option date you chose, under the Housing Developers Rules.';
      else if (e.id === 'snp') s = un ? 'Due within 8 weeks of the option, the latest under the Housing Developers Rules.' : 'Due by ' + d + ', the latest date under the Housing Developers Rules (within 8 weeks of the option).';
      else if (e.id === 'bsd' || e.id === 'absd') s = (un ? 'Due within 14 days of ' + (kind === 'completed' ? 'exercising the option' : 'signing the S&P') : 'Due by ' + d + ' under IRAS’s 14-day rule after ' + (kind === 'completed' ? 'you exercise the option' : 'signing the S&P')) + (un ? ' (IRAS), so by ' + d + ' at the latest.' : '.');
      else s = 'Due by ' + d + ' under the rules.';
    } else if (b === 'developer') s = 'On the date you entered from the developer’s schedule. Check it against your S&P.';
    else if (b === 'earliest') s = 'From ' + d + ', the earliest this stage can be called. The developer’s notice sets the real date, which may be later.';
    else if (b === 'illustration') s = 'An illustration, not a timetable.';
    else if (b === 'assumption') s = 'On the date you entered. It is not guaranteed.';
    else if (e.id === 'option') s = 'On your option date. The 1% amount is a planning convention; your option sets the actual figure.';
    else if (e.id === 'exercise') s = un ? 'Within 14 days of the option: a planning convention. Your option sets the actual terms.' : 'Around ' + d + ', 14 days after the option: a planning convention. Your option sets the actual terms.';
    else if (e.id === 'completion') s = 'Around ' + m + ', an illustrative date, not a deadline. Your S&P sets the actual date.';
    else s = 'Around ' + m + ', an illustrative date, not a deadline.';
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
    if (hit) { const b = hit.basis || basisOf(hit, r.kind); out.first = { id: hit.id, label: hit.label, date: hit.date, amount: hit.uncovered, basis: b, tag: BASIS_TAG[b], provisional: !!hit.provisional, sentence: dateSentence(Object.assign({}, hit, { basis: b }), r.kind, r.undated) }; }
    else if (h.firstGap) out.monthly = true;
    return out;
  }
  // the engine's events with each payment's date basis, tag and sentence attached (for the table)
  function annotate(r) {
    return r.events.map((e) => { if (e.type !== 'pay') return Object.assign({}, e); const b = basisOf(e, r.kind); return Object.assign({}, e, { basis: b, tag: BASIS_TAG[b], sentence: dateSentence(Object.assign({}, e, { basis: b }), r.kind, r.undated) }); });
  }
  // (18 Oct 2026 cross-check tenureFromFirstRelease removed 28 Oct 2026: the engine itself now counts the tenure from the first release, GW_CALC.bankPath.)

  /* ---------------- HDB flats: the basic payment list (resale and new flat). No engine exists for these, and none is built: this lists the payments, their amounts where HDB
     fixes them and the event each falls on. Every figure is read from GW_RULES.hdbPayments. A date HDB or construction sets is never invented: the trigger is named, or an
     estimate is worded as a range. Stamp duty, legal fees and small fees are named and never added up. It does not touch eligibility or financing. ---------------- */
  function hdb(i) {
    i = i || {}; const H = R.hdbPayments, P = i.price, flat = i.flat === 'bto' ? 'bto' : 'resale';
    if (!pos(P)) return { ok: false, missing: ['price'], invalid: [] };
    if (C.LIMITS && C.LIMITS.money && P > C.LIMITS.money.max) return { ok: false, missing: [], invalid: [{ field: 'price', text: 'Enter a price up to ' + C.LIMITS.money.max.toLocaleString('en-US') + '.' }] };
    const ev = []; const add = (e) => { ev.push(Object.assign({ type: 'pay', amount: null, amountText: '', upTo: false, about: false, note: '' }, e)); };
    const r0 = (x) => Math.round(x);
    if (flat === 'resale') {
      const Z = H.resale, ex = Z.feesMax - Z.optionFeeMax;
      add({ id: 'option', label: 'Option fee', amount: Z.optionFeeMax, upTo: true, when: 'When the seller grants the option', basis: 'rule', note: 'Agreed with the seller. Part of the price, paid in cash.' });
      add({ id: 'exercise', label: 'Exercise fee', amount: ex, upTo: true, when: 'Within ' + Z.optionDays + ' days of the option', basis: 'rule', note: 'With the option fee, $' + Z.feesMax.toLocaleString('en-US') + ' at most. Part of the price, paid in cash.' });
      add({ id: 'appfee', label: 'Resale application fee', amount: Z.applicationFee.standard, when: 'When you submit your part of the application', basis: 'trigger', note: '$' + Z.applicationFee.small + ' for a 1- or 2-room flat.' });
      add({ id: 'hdbfees', label: 'Legal fees and other HDB fees', amountText: 'As HDB advises', when: 'After you endorse HDB’s documents, by the date HDB sets', basis: 'trigger', note: '' });
      add({ id: 'completion', label: 'Balance of the price', amount: P - Z.feesMax, about: true, when: 'On or before the completion appointment', basis: 'estimate', note: 'About ' + Z.completionWeeks + ' weeks after HDB accepts your application, so roughly 3 to 4 months after the option. Paid from your loan, CPF and cash.' });
      add({ id: 'duty', label: 'Stamp duty', amountText: 'Use the stamp duty page', when: 'Settled through HDB by completion', basis: 'trigger', note: '' });
      return { ok: true, version: VERSION, flat, price: P, events: ev, foot: ['The option and exercise fees are part of the ' + $c(P) + ' price, not extra. If they are lower, the balance is higher by the difference.', 'No dates are shown: HDB’s processing sets them. Stamp duty and the fees HDB sets are not added into the amounts.'] };
    }
    const B = H.bto, bank = i.loan === 'bank', pct = bank ? B.downpaymentPct.bankLoan : B.downpaymentPct.hdbLoan, fee = B.bookingFee;
    add({ id: 'application', label: 'Application fee', amount: B.applicationFee, when: 'When you apply for the launch, for each application', basis: 'rule', note: '' });
    add({ id: 'booking', label: 'Booking fee', amountText: '$' + fee.flexi2.toLocaleString('en-US') + ' to $' + fee.room4plus.toLocaleString('en-US'), when: 'When you book your flat, after your queue turn', basis: 'rule', note: '2-room Flexi $' + fee.flexi2.toLocaleString('en-US') + ', 3-room $' + fee.room3.toLocaleString('en-US') + ', 4-room and larger $' + fee.room4plus.toLocaleString('en-US') + '. It counts towards the downpayment.' });
    add({ id: 'downpayment', label: 'Downpayment', pct: pct, amount: r0(P * pct), when: 'When you sign the Agreement for Lease', basis: 'trigger', note: (bank ? 'With a bank loan. ' : 'With an HDB loan. ') + 'HDB invites you within ' + B.signWithinMonths + ' months of booking. Paid by CPF and/or cash; the booking fee is part of it.' });
    add({ id: 'duty', label: 'Stamp duty and legal fees', amountText: 'As HDB advises', when: 'When you sign the Agreement for Lease', basis: 'trigger', note: '' });
    add({ id: 'balance', label: 'Balance of the price', pct: 1 - pct, amount: r0(P * (1 - pct)), when: 'Before you collect your keys', basis: 'trigger', note: 'HDB gives the date; it depends on construction. Paid from your loan, CPF and cash. A survey fee, and fire insurance with an HDB loan, may apply.' });
    return { ok: true, version: VERSION, flat, price: P, loan: bank ? 'bank' : 'hdb', events: ev, foot: ['The booking fee is part of the downpayment, not extra.', 'No dates are shown: HDB and construction set them. Stamp duty and legal fees are not added into the amounts.'] };
  }
  const $c = (x) => '$' + Math.round(x).toLocaleString('en-US');
  return { schedule, hdb, basisOf, dateSentence, shortfall, annotate, BASIS_TAG, VERSION, day, mon, after, UNDATED_REF };
});
