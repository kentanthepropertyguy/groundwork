/* ==========================================================================
   GROUNDWORK — Mortgage during construction and the CPF OA buffer (28 Oct 2026).
   The method is Claude E's "Mortgage During Construction & CPF OA Buffer" methodology v1.1 (28 Oct 2026), ported from its reference model (ref/buffer.py)
   and tested against its frozen expected values (expected_buffer_v1_1.json). Rule (R), bank practice (B) and assumption (A) numbers are the methodology's.
   It decides no loan, tier, stamp duty or CPF set-aside of its own:
     - the loan and its minimum cash come from the cost card (GW_FIN3.cost: the V3.12 Stage 2 LTV engine) (A16, A17);
     - the bank's instalments come from GW_CALC.bankPath, the same engine the cost card and the Planner use (§2): the tenure counts from the month after the
       first release; from the month after TOP the instalment is on the whole loan (OCBC's terms, B4), or, read the other way, progressive until CSC;
     - the stage months come from GW_CALC.bankMonths (A2, A15) on the schedule's TOP and CSC.
   What it adds is each owner's CPF Ordinary Account, month by month, in CPF's order within the month (A1):
     1 Jan: last year's interest credited (R7, A14) · turning 55: OA to the Retirement Account (R11, A8) · existing HDB-type loan from the opening balance
     · stage payments (cash first up to the minimum cash, then CPF: A9, A16) · the month's contribution (mid-month) · existing private/EC loan · the new
     instalment (26th–1st) · a sale refund, usable from the next month (A6) · interest accrued on (opening balance − withdrawals), credited next 1 January.
   UMD: window.GW_CPFBUF in the browser (after gw-rules.js and gw-calc.js); in Node, require() returns the factory: call it with (GW_RULES, GW_CALC).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.GW_CPFBUF = factory(root.GW_RULES, root.GW_CALC);
})(typeof self !== 'undefined' ? self : this, function (R, C) {
  'use strict';
  if (!R || !C || typeof C.bankPath !== 'function' || typeof C.bankMonths !== 'function') throw new Error('GW_CPFBUF needs GW_RULES and GW_CALC (with bankPath)');
  const VERSION = 'B1-2026-10-28 (methodology v1.1)';
  const OA_RATE = 0.025;          // R7: the legislated floor and the current OA rate
  const FRS_LATEST = 228200;      // R10, A8: members turning 55 in 2027, the latest published
  const STAGES = R.pps.map((s) => ({ id: s.id, pct: s.pct }));
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
  const nn = (x) => (num(x) !== null && x > 0 ? x : 0);
  const r0 = (x) => Math.round(x);
  const r2 = (x) => Math.round(x * 100) / 100;

  // c: { price, loan, ratePct, years, top (months from the option), csc (months), snp (default 2), minCashPct, start: 'YYYY-MM' (the option's month),
  //      persons: [{ name, oa, oaMonthly, existingCpfMonthly, existingUntil, existingLoanType: 'hdb_loan'|'hdb_flat_bank_loan'|'private_bank_loan',
  //                  refund, refundMonth, raTopup, reserve, turn55Month, saAt55, raTarget, oaMonthlyAfter55 }],
  //      timing: 'mid_month' (default) | 'after_deductions' (stress), reading: 'full_at_top' (default) | 'progressive_to_csc', horizonAfterTop (default 360),
  //      cpfForDownpayment (default true), cpfForInstalments (default true), months: { stageId: month } (optional: the developer's dates) }
  function run(c) {
    const P = c.price, L = c.loan, T = Math.round(c.top), cscAfter = num(c.csc) !== null ? Math.round(c.csc) - T : 12, snp = num(c.snp) !== null ? c.snp : 2;
    const timing = c.timing === 'after_deductions' ? 'after_deductions' : 'mid_month', reading = c.reading === 'progressive_to_csc' ? 'progressive_to_csc' : 'full_at_top';
    const sm = Object.assign(C.bankMonths(T, T + cscAfter), { snp: snp }, c.months || {});
    // the stage split: the buyer's part (price − loan) first, stage by stage; the rest of each stage is the bank's (R3)
    let paidOwn = 0; const ownTotal = P - L;
    const schedule = STAGES.map((s) => { const amt = s.pct * P, own = Math.min(amt, Math.max(0, ownTotal - paidOwn)); paidOwn += own; return { stage: s.id, month: sm[s.id], amount: amt, own: own, bank: amt - own }; });
    const end = T + cscAfter + (num(c.horizonAfterTop) !== null ? c.horizonAfterTop : 360);
    const path = C.bankPath({ releases: schedule.map((s) => ({ id: s.stage, month: s.month, amount: s.bank })), rate: c.ratePct / 100, years: c.years, top: T, csc: T + cscAfter, horizon: end });
    const due0 = (m) => (path ? path.dueAt(m, reading === 'progressive_to_csc' ? 'progressive' : undefined) : 0);
    const persons = (c.persons || []).map((p, k) => Object.assign({ name: 'P' + (k + 1), oa: 0, oaMonthly: 0, existingCpfMonthly: 0, existingUntil: null, existingLoanType: 'hdb_loan', refund: 0, refundMonth: null, raTopup: 0, reserve: 0, turn55Month: null, saAt55: 0, raTarget: FRS_LATEST, oaMonthlyAfter55: null }, p));
    const totC = persons.reduce((a, p) => a + nn(p.oaMonthly), 0) || 1;
    persons.forEach((p) => { p.share = persons.length > 1 ? nn(p.oaMonthly) / totC : 1; });
    const bal = persons.map((p) => nn(p.oa)), accrued = persons.map(() => 0), usedNew = persons.map(() => 0), moved55 = persons.map(() => 0);
    const y0 = +String(c.start).slice(0, 4), m00 = +String(c.start).slice(5, 7) - 1;
    const dateOf = (m) => { const k = y0 * 12 + m00 + m; return Math.floor(k / 12) + '-' + String((k % 12) + 1).padStart(2, '0') + '-01'; };
    const cashOnly = { otp: 1 };   // the booking fee: cash (CPF cannot pay option fees, R5)
    const cpfDownCap = Math.max(0, ownTotal - c.minCashPct * P);   // CPF may pay the buyer's part only beyond the minimum cash (R3, A16)
    const cpfDown = { used: 0, cash: 0 };
    const rows = [], cashEvents = [];
    let released = 0, shortAfterTop = null, vlHit = null;
    const usedTotal = () => usedNew.reduce((a, x) => a + x, 0);
    // OA this owner may still use for THIS property: above any set-aside (R9) and within the Valuation Limit (R6)
    const room = (k) => Math.max(0, Math.min(bal[k] - persons[k].reserve, P - usedTotal()));
    const cpfDownpay = c.cpfForDownpayment !== false, cpfInstal = c.cpfForInstalments !== false;
    for (let m = 0; m <= end; m++) {
      const d = dateOf(m);
      if (d.slice(5, 7) === '01') persons.forEach((p, k) => { bal[k] += accrued[k]; accrued[k] = 0; });   // 1 January: last year's interest (R7)
      const wd = persons.map(() => 0), open = bal.slice();
      const contrib = (p) => (m < 1 ? 0 : p.turn55Month !== null && m > p.turn55Month && p.oaMonthlyAfter55 !== null ? p.oaMonthlyAfter55 : nn(p.oaMonthly));
      const credit = () => persons.forEach((p, k) => {
        bal[k] += contrib(p);
        if (p.turn55Month === m) { const x = Math.min(contrib(p), Math.max(0, p.raTarget - p.saAt55 - moved55[k])); bal[k] -= x; moved55[k] = r2(moved55[k] + x); }   // A8
      });
      const existing = (late) => persons.forEach((p, k) => {
        if (p.existingCpfMonthly && (p.existingUntil === null || m <= p.existingUntil) && ((p.existingLoanType === 'private_bank_loan') === late)) {
          const x = Math.min(p.existingCpfMonthly, bal[k]); bal[k] -= x; wd[k] += x;
          if (x < p.existingCpfMonthly - 0.5) { cashEvents.push([m, 'existing', p.existingCpfMonthly - x]); if (m > T && shortAfterTop === null) shortAfterTop = m; }
        }
      });
      // 1) turning 55 (R11): SA to the RA first, then OA, up to the retirement sum (A8)
      persons.forEach((p, k) => { if (p.turn55Month === m) { const x = Math.min(bal[k], Math.max(0, p.raTarget - p.saAt55)); bal[k] -= x; wd[k] += x; cashEvents.push([m, 'info:55', 0]); moved55[k] = r2(x); } });
      // 2) an existing HDB loan or an HDB flat's bank loan (6th–14th): before the contribution (A1, R14)
      existing(false);
      // 3) stage payments: the buyer's part (cash first up to the minimum cash, then CPF), then the bank's release
      schedule.filter((s) => s.month === m).forEach((s) => {
        if (s.own > 0) {
          let need = s.own;
          const mustCash = cashOnly[s.stage] ? need : Math.min(need, Math.max(0, c.minCashPct * P - cpfDown.cash));
          if (mustCash > 0.5) cashEvents.push([m, 'rule:' + s.stage, mustCash]);
          cpfDown.cash += mustCash; need -= mustCash; s.eligible = cashOnly[s.stage] ? 0 : need; s.cpf = 0;
          if (cpfDownpay && !cashOnly[s.stage]) {
            const eligible = Math.min(need, Math.max(0, cpfDownCap - cpfDown.used)); let left = eligible;
            persons.forEach((p, k) => { const x = Math.min(eligible * p.share, room(k), left); bal[k] -= x; wd[k] += x; usedNew[k] += x; left -= x; });   // A10: each owner's share
            persons.forEach((p, k) => { const x = Math.min(left, room(k)); bal[k] -= x; wd[k] += x; usedNew[k] += x; left -= x; });                // then spill-over, in owner order
            cpfDown.used += eligible - left; need -= eligible - left; s.cpf = eligible - left;
          }
          if (need > 0.5) { cashEvents.push([m, 'short:' + s.stage, need]); cpfDown.cash += need; }
        }
        if (s.bank > 0) released += s.bank;
      });
      if (timing === 'mid_month') credit();     // 3b) the contribution for last month's wages (A1)
      existing(true);                           // 3c) an existing private / EC bank loan (26th–1st)
      // 4) the new instalment (the bank path: a release is first charged the month after it, A5)
      const due = due0(m);
      // 5) paid from CPF (26th–1st, after the contribution), by shares, then by any owner; the rest is cash
      let cpfPaid = 0;
      if (due > 0 && cpfInstal) {
        let need = due;
        [0, 1].forEach((pass) => persons.forEach((p, k) => { const x = Math.min(pass === 0 ? due * p.share : need, room(k), need); bal[k] -= x; wd[k] += x; usedNew[k] += x; need -= x; cpfPaid += x; }));
        if (need > 0.5) {
          if (usedTotal() >= P - 0.5 && vlHit === null) vlHit = m;
          cashEvents.push([m, vlHit !== null ? 'instalment:vl' : 'instalment:short', need]);
          if (m > T && shortAfterTop === null) shortAfterTop = m;
        }
      }
      if (timing === 'after_deductions') credit();   // 6) stress reading: contributions only after all of the month's deductions
      persons.forEach((p, k) => { if (p.refundMonth === m) bal[k] += nn(p.refund) - nn(p.raTopup); });   // 7) a sale refund (R13, A6)
      persons.forEach((p, k) => { accrued[k] += Math.max(0, open[k] - wd[k]) * OA_RATE / 12; });       // 8) interest, credited next 1 January (R7, A14)
      rows.push({ m: m, date: d, instalment: r2(due), cpfPaid: r2(cpfPaid), released: r2(released), oa: bal.map(r2), oaTotal: r2(bal.reduce((a, x) => a + x, 0)), accrued: r2(accrued.reduce((a, x) => a + x, 0)) });
    }
    const out = summarise(c, persons, rows, schedule, cashEvents, usedNew, shortAfterTop, vlHit, path, T, cscAfter, moved55); out.cpfForDownpayment = r0(cpfDown.used); return out;
  }

  function summarise(c, persons, rows, schedule, cashEvents, usedNew, firstShort, vlHit, path, T, cscAfter, moved55) {
    const at = rows[T], P = c.price;
    const firstInst = rows.filter((r) => r.instalment > 0)[0] || null, full = rows.filter((r) => r.m > T + cscAfter && r.instalment > 0)[0] || null;
    const oaMonth = persons.reduce((a, p) => a + (p.turn55Month !== null && p.turn55Month < T && p.oaMonthlyAfter55 !== null ? p.oaMonthlyAfter55 : nn(p.oaMonthly)), 0);
    const reserves = persons.reduce((a, p) => a + nn(p.reserve), 0), buffer = Math.max(0, at.oaTotal - reserves);
    const instAfter = rows[T + 1] ? rows[T + 1].instalment : 0, fullInst = full ? full.instalment : instAfter;
    const exAfter = persons.reduce((a, p) => a + (p.existingCpfMonthly && (p.existingUntil === null || p.existingUntil > T) ? p.existingCpfMonthly : 0), 0);
    const steps = []; let last = null;
    rows.slice(0, T + cscAfter + 3).forEach((r) => { if (r.instalment > 0 && (last === null || Math.abs(r.instalment - last) > 1)) { steps.push({ m: r.m, date: r.date, instalment: r0(r.instalment) }); last = r.instalment; } });
    const before = cashEvents.filter((x) => x[0] <= T), cashBefore = before.reduce((a, x) => a + x[2], 0), cashRule = before.filter((x) => /^rule:/.test(x[1])).reduce((a, x) => a + x[2], 0);
    const firstCash = cashEvents.filter((x) => !/^(rule|info):/.test(x[1]))[0] || null;
    return {
      ok: true, version: VERSION, reading: c.reading === 'progressive_to_csc' ? 'progressive_to_csc' : 'full_at_top', top: T, csc: T + cscAfter,
      stages: schedule.map((s) => ({ stage: s.stage, month: s.month, eligible: r0(s.eligible || 0), cpf: r0(s.cpf || 0), date: rows[s.month] ? rows[s.month].date : null, amount: r0(s.amount), own: r0(s.own), bank: r0(s.bank), oaAfter: rows[s.month] ? r0(rows[s.month].oaTotal) : null, instalmentNext: rows[s.month + 1] ? r0(rows[s.month + 1].instalment) : null })),
      instalmentSteps: steps, firstInstalment: firstInst && { m: firstInst.m, date: firstInst.date, amount: r0(firstInst.instalment) },
      lastBeforeTop: rows[T] && rows[T].instalment > 0 ? r0(rows[T].instalment) : null,
      instalmentAfterTop: r0(instAfter), instalmentAfterTopDate: rows[T + 1] ? rows[T + 1].date : null, instalmentFull: r0(fullInst),
      oaMonthlyTotal: r0(oaMonth), oaAtTop: r0(at.oaTotal), oaAtTopByPerson: at.oa.map(r0), interestAccruedNotCreditedAtTop: r2(at.accrued),
      reserved: r0(reserves), bufferAtTop: r0(buffer), existingCpfAfterTop: r0(exAfter),
      monthlyShortfallAfterTop: r0(Math.max(0, instAfter + exAfter - oaMonth)), monthlyShortfallFull: r0(Math.max(0, fullInst + exAfter - oaMonth)),
      coverageMonths: firstShort === null ? null : firstShort - T - 1, coversIndefinitely: firstShort === null, firstShortDate: firstShort === null ? null : rows[firstShort].date,
      firstCash: firstCash && { m: firstCash[0], date: rows[firstCash[0]].date, kind: firstCash[1].split(':')[0], stage: firstCash[1].split(':')[1] || null, amount: r0(firstCash[2]) },
      cashNeededBeforeTop: r0(cashBefore), cashByRule: r0(cashRule), cashBecauseOaShortBeforeTop: r0(cashBefore - cashRule),
      oaMovedAt55: moved55.slice(), cashEvents: cashEvents.filter((x) => x[0] <= T + cscAfter).slice(0, 12).map((x) => ({ date: rows[x[0]].date, kind: x[1], amount: r0(x[2]) })),
      cpfUsedForProperty: r0(usedNew.reduce((a, x) => a + x, 0)), vlReached: vlHit === null ? null : rows[vlHit].date,
      yearEnd: rows.filter((x) => x.date.slice(5, 7) === '12' && x.m <= T + 13).map((x) => ({ date: x.date, oaTotal: r0(x.oaTotal) })),
      rows: rows,
    };
  }

  return { run, VERSION, OA_RATE, FRS_LATEST };
});
