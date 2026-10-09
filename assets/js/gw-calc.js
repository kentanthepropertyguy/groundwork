/* ==========================================================================
   GROUNDWORK — calculation engine for the seven calculators (R2, Ken 9 Oct 2026).
   Pure functions: no DOM, no storage, no network. Rules come from GW_RULES (which reads the planner's rules.js);
   Buyer's Stamp Duty and the annuity maths are the planner's own functions (tools/hdb-upgrade/engine.js), so the
   calculators and the HDB Upgrade Planner can never disagree. Selling-cost defaults are the planner's assumptions.
   Every function returns { ok:false, missing:[...] } until its required inputs are present, and never guesses them.
   UMD: window.GW_CALC in the browser; in Node, require() returns the factory: call it with (GW_RULES, engine, assumptions).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.GW_CALC = factory(root.GW_RULES, root.KPT_HDB, root.KPT_ASSUMPTIONS);
})(typeof self !== 'undefined' ? self : this, function (R, ENG, A) {
  'use strict';
  if (!R || !ENG || !A) throw new Error('GW_CALC needs GW_RULES, the planner engine and its assumptions');
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
  const pos = (x) => num(x) !== null && x > 0;
  const nn = (x) => (num(x) !== null && x >= 0 ? x : 0);
  const floor = Math.floor, round = Math.round;
  const AF = ENG.annuityFactor; // (annualRate, years) -> present value of $1 a month
  const instal = (loan, rate, years) => { const n = round(years * 12); if (!(loan > 0) || n <= 0) return 0; return rate > 0 ? loan / AF(rate, years) : loan / n; };
  const missing = (list) => ({ ok: false, missing: list });

  /* ---------------- 1. Mortgage repayment ---------------- */
  // i: { loan, ratePct, years, lender: 'bank' | 'hdb' }
  function mortgage(i) {
    const need = []; if (!pos(i.loan)) need.push('loan'); if (num(i.ratePct) === null || i.ratePct < 0 || i.ratePct > 20) need.push('ratePct'); if (!(i.years >= 1 && i.years <= 35)) need.push('years');
    if (need.length) return missing(need);
    const rate = i.ratePct / 100, n = round(i.years * 12), monthly = instal(i.loan, rate, i.years), total = monthly * n;
    // first-year split and the balance after 5 and 10 years
    let bal = i.loan, int1 = 0, prin1 = 0; const balAt = {};
    for (let m = 1; m <= n; m++) { const it = bal * rate / 12, pr = monthly - it; bal -= pr; if (m <= 12) { int1 += it; prin1 += pr; } if (m === 60) balAt[5] = bal; if (m === 120) balAt[10] = bal; }
    const hdb = i.lender === 'hdb', stressRate = hdb ? Math.max(R.hdbLoan.stressRate, R.hdbLoanRate) : R.stressRate;
    const stressMonthly = instal(i.loan, stressRate, i.years);
    return {
      ok: true, monthly, total, interest: total - i.loan, interestShare: (total - i.loan) / total, months: n,
      firstYear: { interest: int1, principal: prin1 }, balanceAfter: balAt,
      stress: { rate: stressRate, monthly: stressMonthly,
        // gross monthly income at which this one loan uses the whole limit (no other debts)
        incomeForTdsr: hdb ? null : stressMonthly / R.tdsr, incomeForMsr: stressMonthly / R.msr },
      lender: hdb ? 'hdb' : 'bank', overHdbTenure: hdb && i.years > R.hdbLoan.maxTenureYears,
    };
  }

  /* ---------------- 2. Buyer's and Additional Buyer's Stamp Duty ---------------- */
  // i: { price, buyers: [{ res: 'SC'|'PR'|'FR', owned: 0|1|2 }], entity: bool }   owned = residential properties already owned
  function bsdLines(price) {
    const lines = []; let left = price, from = 0;
    for (const b of R.bsdBands) { const slice = Math.min(left, b.width); if (slice <= 0) break; lines.push({ from, to: from + slice, rate: b.rate, duty: slice * b.rate }); left -= slice; from += slice; }
    return lines;
  }
  function stampDuty(i) {
    const need = []; if (!pos(i.price)) need.push('price');
    const buyers = (i.buyers || []).filter((b) => b && R.absd[b.res] && [0, 1, 2].indexOf(b.owned) >= 0);
    if (!i.entity && !buyers.length) need.push('buyers');
    if (need.length) return missing(need);
    const bsd = ENG.bsd(i.price); // the planner's own BSD (same bands, rounded down)
    const rates = i.entity ? [{ res: 'ENTITY', owned: 0, rate: R.absd.ENTITY[0] }] : buyers.map((b) => ({ res: b.res, owned: b.owned, rate: R.absd[b.res][b.owned] }));
    const top = rates.reduce((a, b) => (b.rate > a.rate ? b : a));
    const absd = floor(i.price * top.rate);
    const notes = [];
    const joint = buyers.length > 1, allFirst = buyers.every((b) => b.owned === 0), anySC = buyers.some((b) => b.res === 'SC');
    if (joint && new Set(rates.map((r) => r.rate)).size > 1) notes.push({ id: 'joint', text: 'Buying jointly, you pay the highest buyer’s rate on the whole price.' });
    if (joint && allFirst && anySC && buyers.some((b) => b.res !== 'SC')) notes.push({ id: 'couple-remission', text: 'A married couple with at least one Singapore Citizen buying their first home together can have the ABSD remitted, paying as Singapore Citizens. IRAS decides.' });
    if (joint && buyers.every((b) => b.owned <= 1) && buyers.some((b) => b.owned === 1) && anySC && top.rate > 0) notes.push({ id: 'refund', text: 'A married couple with at least one Singapore Citizen buying a second home together can apply for an ABSD refund if they sell their first home within ' + R.absdRefundMonths + ' months (of buying a completed home, or of TOP or CSC for one under construction). The ABSD is still paid upfront.' });
    if (buyers.some((b) => b.res === 'FR')) notes.push({ id: 'fta', text: 'Under free trade agreements, nationals of the United States, Iceland, Liechtenstein, Norway and Switzerland, and permanent residents of the last four, pay ABSD as Singapore Citizens (by remission). IRAS decides.' });
    return {
      ok: true, price: i.price, bsd, bsdLines: bsdLines(i.price), absdRate: top.rate, absd, total: bsd + absd, profile: top, perBuyer: rates, notes,
      ifRemitted: notes.some((n) => n.id === 'couple-remission' || n.id === 'fta') ? bsd : null,
      basis: 'Duty is on the higher of the price or market value, rounded down to the dollar, and payable within 14 days of signing.',
    };
  }

  /* ---------------- 3. Seller's Stamp Duty ---------------- */
  const D = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return null; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCMonth() === +m[2] - 1 ? d : null; };
  const addYears = (d, k) => { const x = new Date(d.getTime()); x.setUTCFullYear(x.getUTCFullYear() + k); return x; };
  const iso = (d) => d.toISOString().slice(0, 10);
  const DAY = 86400000;
  // i: { price, bought: 'YYYY-MM-DD', sold: 'YYYY-MM-DD' }   price = the higher of the selling price or market value
  function ssd(i) {
    const need = [], b = D(i.bought), s = D(i.sold);
    if (!pos(i.price)) need.push('price'); if (!b) need.push('bought'); if (!s) need.push('sold');
    if (need.length) return missing(need);
    if (s < b) return { ok: false, error: 'sold-before-bought' };
    const reg = R.ssd.find((r) => iso(b) >= r.from && (!r.to || iso(b) <= r.to));
    if (!reg) return { ok: true, applies: false, reason: 'before-2011', rate: 0, ssd: 0, text: 'Bought before 14 Jan 2011: that period’s SSD rules ended long ago, so no SSD applies to a sale now.' };
    // IRAS: held 'up to 1 year' means sold before the first anniversary; on or after the anniversary the next band applies
    // (IRAS's example: bought 7 Jul 2025, no SSD if sold on or after 7 Jul 2029).
    let band = -1; for (let k = 1; k <= reg.years; k++) { if (s < addYears(b, k)) { band = k - 1; break; } }
    const rate = band >= 0 ? reg.rates[band] : 0;
    // within 7 days of an anniversary that changes the rate: say so rather than pretend to the day
    const near = []; for (let k = 1; k <= reg.years; k++) { const a = addYears(b, k); if (Math.abs(s - a) <= 7 * DAY) near.push(iso(a)); }
    const leapDay = iso(b).slice(5) === '02-29'; // IRAS doesn't say how a 29 Feb purchase's anniversaries fall: say so
    // whole calendar years and months held (for display; the rate uses the anniversaries above)
    let y = 0; while (addYears(b, y + 1) <= s) y++;
    let mo = 0; const addM = (d, k) => { const x = new Date(d.getTime()); x.setUTCMonth(x.getUTCMonth() + k); return x; };
    while (mo < 11 && addM(addYears(b, y), mo + 1) <= s) mo++;
    const days = round((s - b) / DAY);
    return {
      ok: true, applies: rate > 0, rate, ssd: floor(i.price * rate), regime: reg, band, heldDays: days, heldText: y + ' year' + (y === 1 ? '' : 's') + ' ' + mo + ' month' + (mo === 1 ? '' : 's'),
      freeFrom: iso(addYears(b, reg.years)), nearBoundary: near, leapDay,
    };
  }

  /* ---------------- 4. Sale proceeds ---------------- */
  // i: { type: 'hdb'|'private'|'ec', price, loan, penalty, cpfPrincipal, cpfInterest, commissionPct, gst: bool, legal, other, bought, sold, owner55 }
  function cpfInterestEstimate(principal, years) { return pos(principal) && pos(years) ? principal * (Math.pow(1 + R.cpfOaRate, years) - 1) : 0; }
  function saleProceeds(i) {
    if (!pos(i.price)) return missing(['price']);
    const price = i.price, loan = nn(i.loan), penalty = nn(i.penalty), cpfDue = nn(i.cpfPrincipal) + nn(i.cpfInterest);
    const commissionPct = num(i.commissionPct) === null ? A.commissionRate * 100 : Math.max(0, i.commissionPct);
    const commission = price * commissionPct / 100, gst = i.gst === false ? 0 : commission * R.gst;
    const legal = num(i.legal) === null ? A.saleLegalFees : Math.max(0, i.legal), other = nn(i.other);
    let ssdRes = null;
    if (i.type !== 'hdb' && i.bought) { const r = ssd({ price, bought: i.bought, sold: i.sold }); if (r.ok) ssdRes = r; }
    const ssdAmt = ssdRes ? ssdRes.ssd : 0;
    const afterLoan = price - loan - penalty;
    const cpfRefund = Math.max(0, Math.min(cpfDue, afterLoan));
    const cpfShortfall = cpfDue - cpfRefund;
    const cashFromSale = afterLoan - cpfRefund; // negative only when the price doesn't cover the loan
    const costs = commission + gst + legal + other + ssdAmt;
    const netCash = cashFromSale - costs;
    return {
      ok: true, type: i.type || 'private', price, loan, penalty, afterLoan, loanShortfall: afterLoan < 0 ? -afterLoan : 0,
      cpfDue, cpfRefund, cpfShortfall, cashFromSale,
      costs: { commission, commissionPct, gst, legal, other, ssd: ssdAmt, total: costs }, ssd: ssdRes,
      netCash, ownCashNeeded: netCash < 0 ? -netCash : 0,
      nextPurchase: { cash: Math.max(0, netCash), cpf: cpfRefund, total: Math.max(0, netCash) + cpfRefund },
      owner55: !!i.owner55,
      defaults: { commission: num(i.commissionPct) === null, legal: num(i.legal) === null },
    };
  }

  /* ---------------- shared: borrowers, ages and tenure ---------------- */
  // b: [{ age, fixed, variable, rental }]  -> gross and assessable (after the MAS 30% haircuts) income, income-weighted age
  function borrowers(list) {
    const bs = (list || []).filter((b) => b && (pos(b.fixed) || pos(b.variable) || pos(b.rental)));
    const gross = (b) => nn(b.fixed) + nn(b.variable) + nn(b.rental);
    const assess = (b) => nn(b.fixed) + nn(b.variable) * (1 - R.variableIncomeHaircut) + nn(b.rental) * (1 - R.rentalIncomeHaircut);
    const G = bs.reduce((s, b) => s + gross(b), 0), AS = bs.reduce((s, b) => s + assess(b), 0);
    const aged = bs.filter((b) => pos(b.age));
    const iwaa = aged.length === bs.length && G > 0 ? bs.reduce((s, b) => s + b.age * gross(b), 0) / G : null;
    const everyone = (list || []).filter((b) => b && pos(b.age)); // HDB averages every applicant's age, earning or not
    const avgAge = everyone.length ? everyone.reduce((s, b) => s + b.age, 0) / everyone.length : null;
    const youngest = everyone.length ? Math.min.apply(null, everyone.map((b) => b.age)) : null;
    return { list: bs, gross: G, assessable: AS, iwaa, avgAge, youngest, haircut: G - AS };
  }
  function bankTenure(kind, age, wanted) {
    const L = R.bankLtv, std = Math.max(0, Math.min(L.standardTenure[kind], Math.floor(L.endAge - age))), max = L.maxTenure[kind];
    const years = pos(wanted) ? Math.min(wanted, max) : std;
    return { std, max, years, lower: years > std, capped: pos(wanted) && wanted > max };
  }

  /* ---------------- 5. TDSR ---------------- */
  // i: { kind: 'private'|'hdb', borrowers: [...], debts, tenure, loans: 0|1|2 }
  function tdsr(i) {
    const B = borrowers(i.borrowers), need = [];
    if (!(B.gross > 0)) need.push('income'); if (B.iwaa === null) need.push('age');
    if (need.length) return missing(need);
    const kind = i.kind === 'hdb' ? 'hdb' : 'private', debts = nn(i.debts), cap = R.tdsr * B.assessable, forNew = Math.max(0, cap - debts);
    const t = bankTenure(kind, B.iwaa, i.tenure);
    if (t.years < 1) return { ok: true, noTenure: true, kind, B, cap, debts, forNew, tenure: t };
    const loan = forNew * AF(R.stressRate, t.years), row = (t.lower ? R.bankLtv.lower : R.bankLtv.standard)[Math.min(nn(i.loans), 2)];
    return { ok: true, kind, B, cap, debts, forNew, overLimit: debts > cap, tenure: t, rate: R.stressRate, maxLoan: loan, ltv: row.ltv, minCash: row.minCash, priceAtLtv: loan / row.ltv, msrApplies: kind === 'hdb' };
  }

  /* ---------------- 6. MSR ---------------- */
  // i: { scenario: 'hdb-loan'|'hdb-bank'|'ec', borrowers, propertyLoans, otherDebts, lease, tenure, loans }
  function msr(i) {
    const B = borrowers(i.borrowers), need = [];
    if (!(B.gross > 0)) need.push('income'); if (B.iwaa === null) need.push('age');
    if (need.length) return missing(need);
    const sc = ['hdb-loan', 'hdb-bank', 'ec'].indexOf(i.scenario) >= 0 ? i.scenario : 'hdb-loan';
    const prop = nn(i.propertyLoans), other = nn(i.otherDebts);
    const notes = [];
    if (sc === 'hdb-loan') {
      const H = R.hdbLoan, rate = Math.max(H.stressRate, R.hdbLoanRate);
      // HDB: the shortest of 25 years, 65 minus the applicants' average age, and the remaining lease minus 20 years
      const caps = [H.maxTenureYears, Math.floor(H.endAge - B.avgAge)]; if (pos(i.lease)) caps.push(Math.floor(i.lease - H.leaseBufferYears));
      const maxT = Math.max(0, Math.min.apply(null, caps)), years = pos(i.tenure) ? Math.min(i.tenure, maxT) : maxT;
      // HDB counts gross income as declared; no MAS haircut on HDB loans
      const msrCap = R.msr * B.gross, forNew = Math.max(0, msrCap - prop);
      const loan = years >= 1 ? forNew * AF(rate, years) : 0;
      if (pos(i.lease) && B.youngest !== null && i.lease + B.youngest < 95) notes.push({ id: 'lease95', text: 'The remaining lease doesn’t cover the youngest applicant to age 95, so HDB lowers the loan (and CPF use) in proportion. The figures here don’t include that reduction.' });
      if (pos(i.tenure) && i.tenure > maxT) notes.push({ id: 'capped', text: 'Tenure capped at ' + maxT + ' years, the most HDB allows here.' });
      if (B.gross > R.hdbIncomeCeilingFamilies) notes.push({ id: 'ceiling', text: 'Household income is above $' + R.hdbIncomeCeilingFamilies.toLocaleString('en-US') + ' a month, the HDB loan ceiling for families (HFE letters applied for from 24 Aug 2026). You may need a bank loan instead. Other household types have their own ceilings.' });
      return { ok: true, scenario: sc, B, rate, tenure: { years, max: maxT, lease: pos(i.lease) ? i.lease : null }, msrCap, prop, forNew, maxLoan: loan, ltv: H.ltv, priceAtLtv: loan / H.ltv, binding: 'msr', notes };
    }
    const kind = sc === 'ec' ? 'private' : 'hdb', t = bankTenure(kind, B.iwaa, i.tenure);
    const msrCap = R.msr * B.assessable, tdsrCap = R.tdsr * B.assessable;
    const forNewMsr = Math.max(0, msrCap - prop), forNewTdsr = Math.max(0, tdsrCap - prop - other), forNew = Math.min(forNewMsr, forNewTdsr);
    const loan = t.years >= 1 ? forNew * AF(R.stressRate, t.years) : 0, row = (t.lower ? R.bankLtv.lower : R.bankLtv.standard)[Math.min(nn(i.loans), 2)];
    if (sc === 'ec') notes.push({ id: 'ec-ceiling', text: 'New EC buyers have a household income ceiling: $16,000 a month, or $18,000 for EC sites whose land tender closed on or after 24 Aug 2026. MSR applies to ECs bought from the developer.' });
    if (t.capped) notes.push({ id: 'capped', text: 'Tenure capped at ' + t.max + ' years, the MAS maximum here.' });
    return { ok: true, scenario: sc, B, rate: R.stressRate, tenure: t, msrCap, tdsrCap, prop, other, forNewMsr, forNewTdsr, forNew, maxLoan: loan, ltv: row.ltv, minCash: row.minCash, priceAtLtv: loan / row.ltv, binding: forNewMsr <= forNewTdsr ? 'msr' : 'tdsr', notes };
  }

  /* ---------------- 7. Progressive payments (uncompleted private home or EC) ---------------- */
  // i: { price, buyers, entity, loans: 0|1|2, lowerLtv: bool, ratePct, years, cpf }
  function progressive(i) {
    if (!pos(i.price)) return missing(['price']);
    const P = i.price, wanted = pos(i.years) ? i.years : R.bankLtv.standardTenure.private, years = Math.min(wanted, R.bankLtv.maxTenure.private);
    // MAS: a tenure over 30 years (or a loan running past 65, which the visitor ticks) takes the lower limit; a company borrower is limited to 15% and has no CPF
    const lower = !!i.lowerLtv || years > R.bankLtv.standardTenure.private;
    const row = i.entity ? { ltv: R.entityLtv, minCash: 1 - R.entityLtv } : (lower ? R.bankLtv.lower : R.bankLtv.standard)[Math.min(nn(i.loans), 2)];
    const loanMax = P * row.ltv, cashMin = P * row.minCash, cpfOrCash = P - loanMax - cashMin;
    const rate = num(i.ratePct) === null ? R.stressRate : i.ratePct / 100;
    const duty = stampDuty({ price: P, buyers: i.buyers, entity: i.entity });
    let cashLeft = cashMin, flexLeft = cpfOrCash, cpfLeft = num(i.cpf) === null ? null : Math.max(0, i.cpf), drawn = 0;
    const stages = R.pps.map((s) => {
      let amt = P * s.pct; const o = { id: s.id, name: s.name, pct: s.pct, amount: amt, cash: 0, cpf: 0, flex: 0, loan: 0 };
      const take = (left) => { const x = Math.min(amt, left); amt -= x; return x; };
      // the booking fee is always cash; then the minimum cash; then cash or CPF; then the bank loan
      o.cash = take(s.id === 'otp' ? Infinity : cashLeft); cashLeft = Math.max(0, cashLeft - o.cash);
      const f = take(flexLeft); flexLeft -= f;
      if (cpfLeft === null) o.flex = f; else { o.cpf = Math.min(f, cpfLeft); cpfLeft -= o.cpf; o.cash += f - o.cpf; }
      o.loan = amt; drawn += amt; o.drawn = drawn; o.monthly = instal(drawn, rate, years);
      return o;
    });
    const sum = (k) => stages.reduce((s, x) => s + x[k], 0);
    const upfront = stages[0].amount + stages[1].amount + (duty.ok ? duty.total : 0);
    return {
      ok: true, price: P, ltv: row.ltv, minCash: row.minCash, loanMax, cashMin, cpfOrCash, rate, years, stages, duty, lower, entity: !!i.entity, tenureCapped: wanted > years, autoLower: !i.lowerLtv && lower,
      totals: { cash: sum('cash'), cpf: sum('cpf'), flex: sum('flex'), loan: sum('loan') }, upfront8wk: upfront,
      finalMonthly: instal(loanMax, rate, years), cpfGiven: cpfLeft !== null,
    };
  }

  /* ---------------- messages ---------------- */
  // An assessment the visitor chooses to send: every non-empty input, the results and the key assumptions.
  // Plain text with WhatsApp *bold* headings. Nothing is truncated: callers check the length.
  const $ = (n) => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? +m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : iso; };
  const pc = (x, d) => (Math.round(x * 100 * Math.pow(10, d || 0)) / Math.pow(10, d || 0)) + '%';
  function compose(title, inputs, results, assumptions) {
    const sec = (h, rows) => (rows.length ? '\n*' + h + '*\n' + rows.map((r) => '- ' + r[0] + ': ' + r[1]).join('\n') + '\n' : '');
    const notes = assumptions.length ? '\n*Assumptions*\n' + assumptions.map((a) => '- ' + a).join('\n') + '\n' : '';
    return ('Hi Ken, here is my ' + title + ' from Groundwork.\n' + sec('My details', inputs.filter((r) => r && r[1] !== '' && r[1] !== null && r[1] !== undefined)) + sec('Results', results.filter(Boolean)) + notes + '\nCould you go through it with me?').replace(/\n{3,}/g, '\n\n');
  }
  const RES = { SC: 'Singapore Citizen', PR: 'Permanent Resident', FR: 'Foreigner' };
  const OWN = ['no other residential property', 'one other residential property', 'two or more other residential properties'];
  const buyerText = (b, i) => 'Buyer ' + (i + 1) + ': ' + RES[b.res] + ', owns ' + OWN[b.owned];
  const ownerLines = (bs) => (bs || []).filter((b) => b && (pos(b.fixed) || pos(b.variable) || pos(b.rental) || pos(b.age))).map((b, k) => ['Borrower ' + (k + 1), [pos(b.age) ? 'age ' + b.age : '', pos(b.fixed) ? 'fixed income ' + $(b.fixed) + '/month' : '', pos(b.variable) ? 'variable income ' + $(b.variable) + '/month' : '', pos(b.rental) ? 'rental income ' + $(b.rental) + '/month' : ''].filter(Boolean).join(', ')]);
  const KIND = { private: 'Private property (bank loan)', hdb: 'HDB flat (bank loan)' };
  const SCEN = { 'hdb-loan': 'HDB flat with an HDB loan', 'hdb-bank': 'HDB flat with a bank loan', ec: 'New EC from the developer (bank loan)' };
  const TYPE = { hdb: 'HDB flat', private: 'Private property', ec: 'Executive condominium' };

  const messages = {
    mortgage(i, r) {
      return compose('mortgage repayment estimate',
        [['Loan', i.lender === 'hdb' ? 'HDB loan' : 'Bank loan'], ['Loan amount', $(i.loan)], ['Interest rate', i.ratePct + '% a year'], ['Tenure', i.years + ' years']],
        [['Monthly instalment', $(r.monthly)], ['Total interest', $(r.interest)], ['Total repaid', $(r.total)], ['First year', $(r.firstYear.interest) + ' interest, ' + $(r.firstYear.principal) + ' principal'],
          ['At the ' + pc(r.stress.rate) + ' stress-test rate', $(r.stress.monthly) + '/month'], r.stress.incomeForTdsr ? ['Income to keep this loan within TDSR 55%', $(r.stress.incomeForTdsr) + '/month'] : null, ['Income to keep it within MSR 30%', $(r.stress.incomeForMsr) + '/month']],
        ['The rate stays the same for the whole tenure.', 'Income figures assume no other debts.']);
    },
    stampDuty(i, r) {
      return compose('stamp duty estimate',
        [['Purchase price', $(i.price)], i.entity ? ['Buyer', 'Company or other entity'] : null].concat(i.entity ? [] : (i.buyers || []).map((b, k) => [buyerText(b, k).split(': ')[0], buyerText(b, k).split(': ')[1]])),
        [['Buyer’s Stamp Duty (BSD)', $(r.bsd)], ['ABSD', pc(r.absdRate) + ' = ' + $(r.absd)], ['Total stamp duty', $(r.total)], r.ifRemitted !== null ? ['If the ABSD is remitted', $(r.ifRemitted)] : null],
        ['Residential rates from 15 Feb 2023 (BSD) and 27 Apr 2023 (ABSD).', 'On the higher of price or market value; payable within 14 days of signing.'].concat(r.notes.map((n) => n.text)));
    },
    ssd(i, r) {
      return compose('Seller’s Stamp Duty estimate',
        [['Selling price (or market value, if higher)', $(i.price)], ['Bought on', day(i.bought)], ['Selling on', day(i.sold)]],
        [['Held for', r.heldText || ''], ['SSD rate', pc(r.rate)], ['SSD', $(r.ssd)], r.freeFrom ? ['No SSD if sold on or after', day(r.freeFrom)] : null],
        [r.regime ? 'Bought ' + (r.regime.to ? day(r.regime.from) + ' to ' + day(r.regime.to) : 'on or after ' + day(r.regime.from)) + ': ' + r.regime.years + '-year SSD period.' : '', (r.nearBoundary && r.nearBoundary.length) || r.leapDay ? 'The date is close to an SSD anniversary: confirm with my lawyer or IRAS.' : ''].filter(Boolean));
    },
    saleProceeds(i, r) {
      return compose('sale proceeds estimate',
        [['Property', TYPE[i.type] || ''], ['Selling price', $(i.price)], pos(i.loan) ? ['Outstanding loan', $(i.loan)] : null, pos(i.penalty) ? ['Early repayment penalty', $(i.penalty)] : null,
          pos(i.cpfPrincipal) ? ['CPF used (principal)', $(i.cpfPrincipal)] : null, pos(i.cpfInterest) ? ['CPF accrued interest', $(i.cpfInterest)] : null,
          ['Agent commission', r.costs.commissionPct + '%' + (r.costs.gst ? ' + GST' : '')], ['Legal fees', $(r.costs.legal)], pos(i.other) ? ['Other costs', $(i.other)] : null,
          i.bought ? ['Bought on', day(i.bought)] : null, i.bought && i.sold ? ['Selling on', day(i.sold)] : null, i.owner55 ? ['An owner is 55 or older', 'yes'] : null],
        [r.loanShortfall ? ['The price doesn’t cover the loan by', $(r.loanShortfall)] : ['After repaying the loan', $(r.afterLoan)], ['CPF refund (back to CPF)', $(r.cpfRefund)], r.cpfShortfall > 0 ? ['CPF not refunded (no top-up if sold at market value)', $(r.cpfShortfall)] : null,
          r.cashFromSale >= 0 ? ['Cash from the sale', $(r.cashFromSale)] : null, ['Selling costs' + (r.costs.ssd ? ' incl. SSD ' + $(r.costs.ssd) : ''), $(r.costs.total)], r.netCash < 0 ? ['Cash I would need to add (shortfall and costs)', $(-r.netCash)] : ['Cash left after costs', $(r.netCash)],
          ['Available for my next home', $(r.nextPurchase.cash) + ' cash + ' + $(r.nextPurchase.cpf) + ' CPF']],
        ['Commission and legal fees are estimates.', 'Sold at market value.']);
    },
    tdsr(i, r) {
      return compose('TDSR estimate',
        [['Property', KIND[r.kind || (i.kind === 'hdb' ? 'hdb' : 'private')]]].concat(ownerLines(i.borrowers)).concat([pos(i.debts) ? ['Existing monthly debts', $(i.debts)] : null, pos(i.tenure) ? ['Tenure wanted', i.tenure + ' years'] : null, ['Housing loans outstanding', String(nn(i.loans))]]),
        [r.noTenure ? ['Loan tenure', 'no standard tenure left at this age'] : null, ['Income counted (after haircuts)', $(r.B.assessable) + '/month'], ['TDSR limit (55%)', $(r.cap) + '/month'], ['Left for the new loan', $(r.forNew) + '/month'],
          r.maxLoan !== undefined ? ['Indicative maximum loan', $(r.maxLoan) + ' over ' + r.tenure.years + ' years at ' + pc(r.rate)] : null, r.ltv ? ['Price this loan supports at ' + pc(r.ltv) + ' LTV', $(r.priceAtLtv)] : null],
        ['Banks apply a 30% haircut to variable and rental income.', r.tenure && r.tenure.lower ? 'Tenure is beyond the standard limit, so the lower LTV applies.' : '', r.msrApplies ? 'MSR 30% also applies to HDB flats.' : ''].filter(Boolean));
    },
    msr(i, r) {
      return compose('MSR estimate',
        [['Scenario', SCEN[r.scenario]]].concat(ownerLines(i.borrowers)).concat([pos(i.propertyLoans) ? ['Existing property loan instalments', $(i.propertyLoans) + '/month'] : null, pos(i.otherDebts) ? ['Other monthly debts', $(i.otherDebts)] : null, pos(i.lease) ? ['Remaining lease', i.lease + ' years'] : null, pos(i.tenure) ? ['Tenure wanted', i.tenure + ' years'] : null, r.scenario !== 'hdb-loan' ? ['Housing loans outstanding', String(nn(i.loans))] : null]),
        [['MSR limit (30%)', $(r.msrCap) + '/month'], r.tdsrCap ? ['TDSR limit (55%)', $(r.tdsrCap) + '/month'] : null, ['Left for the new loan', $(r.forNew) + '/month' + (r.tdsrCap ? ' (' + r.binding.toUpperCase() + ' is the limit)' : '')],
          ['Indicative maximum loan', $(r.maxLoan) + ' over ' + r.tenure.years + ' years at ' + pc(r.rate)], ['Price this loan supports at ' + pc(r.ltv) + ' LTV', $(r.priceAtLtv)]],
        r.notes.map((n) => n.text));
    },
    progressive(i, r) {
      return compose('progressive payment estimate',
        [['Purchase price', $(i.price)], i.entity ? ['Buyer', 'Company or other entity'] : ['Housing loans outstanding', String(nn(i.loans))], ['Loan', pc(r.ltv) + ' LTV, ' + r.years + ' years at ' + pc(r.rate, 1) + (r.lower && !r.entity ? ' (lower loan limit: ' + (r.autoLower ? 'tenure over 30 years' : 'longer tenure or past age 65') + ')' : '')], i.cpf !== undefined && i.cpf !== null && i.cpf !== '' ? ['CPF OA available', $(i.cpf)] : null]
          .concat(i.entity ? [] : (i.buyers || []).map((b, k) => [buyerText(b, k).split(': ')[0], buyerText(b, k).split(': ')[1]])),
        [['Within 8 weeks (20%)', $(r.stages[0].amount + r.stages[1].amount)], r.duty.ok ? ['Stamp duty within 14 days', $(r.duty.total)] : null, ['Minimum cash', $(r.cashMin)], ['Cash or CPF', $(r.cpfOrCash)], ['Bank loan', $(r.loanMax)], ['Instalment once fully drawn', $(r.finalMonthly) + '/month']],
        ['Standard progressive payment schedule; my S&P sets the actual terms.', 'Instalments are indicative and grow as the loan is drawn.']);
    },
  };
  const ASK = (tool) => 'Hi Ken, I’m using the ' + tool + ' on Groundwork and have a question.';

  return { mortgage, stampDuty, bsdLines, ssd, saleProceeds, cpfInterestEstimate, tdsr, msr, progressive, borrowers, bankTenure, messages, ASK, instal, parseDate: D };
});
