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
  const invalid = (list) => ({ ok: false, missing: [], invalid: list }); // [{ field, text }]: a value we can't use, said plainly

  /* ---------------- input: one parser and one set of limits for every calculator (audit A5-02, A5-06, A5-07, A5-22) ---------------- */
  // Money: "1,200,000", "1200000.50", "$1.2m", "1.2m", "800k". Rejected (never read as another number): a minus sign, a comma that
  // isn't a thousands separator ("1,2"), a second dot, an exponent ("1e9"), other letters. Returns { value } | { empty } | { error }.
  const MONEY_HINT = 'Type the full amount, e.g. 1,200,000 or 1.2m.';
  function parseMoney(s) {
    let t = String(s == null ? '' : s).trim();
    if (!t) return { empty: true };
    if (/[-−–]/.test(t)) return { error: 'Amounts can’t be negative.' };
    t = t.replace(/^(s\$|\$)\s*/i, '').replace(/\s+/g, '');
    let mult = 1; const suf = /^(.*?)(k|m|mil|million)$/i.exec(t);
    if (suf) { mult = /^k$/i.test(suf[2]) ? 1e3 : 1e6; t = suf[1]; }
    if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(t) && !(mult > 1 && /^\.\d+$/.test(t))) return { error: /^[\d.,]+$/.test(t) && /,/.test(t) ? 'Use commas only between thousands, e.g. 1,200,000.' : MONEY_HINT };
    const v = Math.round(parseFloat(t.replace(/,/g, '')) * mult * 100) / 100;
    return isFinite(v) ? { value: v } : { error: MONEY_HINT };
  }
  // Plain numbers (age, rate, years, lease, commission): digits with an optional decimal point; "4,5", "35abc", "-1" rejected.
  function parseNum(s, eg) {
    const t = String(s == null ? '' : s).trim().replace(/\s*%$/, '');
    if (!t) return { empty: true };
    if (/[-−–]/.test(t)) return { error: 'This can’t be negative.' };
    if (/^\d+,\d+$/.test(t)) return { error: 'Use a dot for decimals, e.g. 4.5.' };
    if (!/^(\d+(\.\d+)?|\.\d+)$/.test(t)) return { error: 'Type a number, e.g. ' + (eg || '25') + '.' }; // V2-11: the field's own example
    return { value: parseFloat(t) };
  }
  // Plausible ranges. Money above $100m is almost always a typo, and beyond it the figures stop being meaningful.
  const LIMITS = {
    money: { max: 1e8, text: 'That’s more than $100 million: check the amount.' },
    // V2-11: a monthly income this high is almost always a yearly figure or a typo ("1.2m"), and it would show a loan of over $100m
    income: { max: 1e6, text: 'That’s more than $1 million a month: check it’s a monthly figure.' },
    // V4-02: incomes just under $1 million a month could still show a loan of over $100 million; question the income instead
    loan: { max: 1e8, text: 'That income gives a loan of more than $100 million: check it’s a monthly figure.' },
    age: { min: 21, max: 99, text: 'Enter an age between 21 and 99.' },
    ratePct: { min: 0, max: 20, text: 'Enter an interest rate between 0% and 20% a year.' },
    years: { min: 1, max: 35, text: 'Enter a loan tenure between 1 and 35 years.' },
    tenure: { min: 1, max: 99, text: 'Enter a loan tenure of at least 1 year, or leave it blank.' },
    lease: { min: 1, max: 99, text: 'Enter a remaining lease between 1 and 99 years.' },
    commissionPct: { min: 0, max: 5, text: 'Enter a commission between 0% and 5%.' },
    estYears: { min: 0, max: 60, text: 'Enter the years since you started using CPF for it (up to 60).' },
  };
  const outOf = (k, v) => { const L = LIMITS[k]; return !!L && num(v) !== null && ((L.min !== undefined && v < L.min) || (L.max !== undefined && v > L.max)); };
  // checks money fields given in an input object; returns the problems as [{ field, text }]
  const moneyBad = (i, keys) => keys.filter((k) => num(i[k]) !== null && (i[k] < 0 || i[k] > LIMITS.money.max)).map((k) => ({ field: k, text: i[k] < 0 ? 'Amounts can’t be negative.' : LIMITS.money.text }));
  const rangeBad = (i, keys) => keys.filter((k) => outOf(k, i[k])).map((k) => ({ field: k, text: LIMITS[k].text }));
  // Duty at a flat rate, in whole cents and basis points so 35% of $2,693,720 is $942,802, not $942,801 (audit A1-07). Rounded down.
  const dutyAt = (price, rate) => (rate > 0 && price > 0 ? Math.floor(Math.round(price * 100) * Math.round(rate * 10000) / 1e6) : 0);

  /* ---------------- 1. Mortgage repayment ---------------- */
  // i: { loan, ratePct, years, lender: 'bank' | 'hdb' }
  function mortgage(i) {
    const bad = moneyBad(i, ['loan']).concat(rangeBad(i, ['ratePct', 'years'])); if (bad.length) return invalid(bad);
    const need = []; if (!pos(i.loan)) need.push('loan'); if (num(i.ratePct) === null) need.push('ratePct'); if (num(i.years) === null) need.push('years');
    if (need.length) return missing(need);
    const rate = i.ratePct / 100, n = round(i.years * 12), monthly = instal(i.loan, rate, i.years), total = monthly * n;
    // first-year split and the balance after 5 and 10 years
    let bal = i.loan, int1 = 0, prin1 = 0; const balAt = {};
    for (let m = 1; m <= n; m++) { const it = bal * rate / 12, pr = monthly - it; bal -= pr; if (m <= 12) { int1 += it; prin1 += pr; } if (m === 60) balAt[5] = bal; if (m === 120) balAt[10] = bal; }
    // MAS Notice 645 para 10(b): the higher of 4% and the loan's own rate; HDB: the higher of its 3% floor and its loan rate (A2-04)
    const hdb = i.lender === 'hdb', floorRate = hdb ? Math.max(R.hdbLoan.stressRate, R.hdbLoanRate) : R.stressRate, stressRate = Math.max(floorRate, rate);
    const stressMonthly = instal(i.loan, stressRate, i.years);
    return {
      ok: true, monthly, total, interest: total - i.loan, interestShare: (total - i.loan) / total, months: n,
      firstYear: { interest: int1, principal: prin1 }, balanceAfter: balAt,
      stress: { rate: stressRate, floor: floorRate, aboveFloor: rate > floorRate, monthly: stressMonthly,
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
  // i: { price, kind: 'private'|'ec'|'hdb', buyers: [{ res, owned, fta }], entity, couple }   kind 'ec' = a new EC bought from the developer
  //   fta (C1, optional, per buyer): true = a national of the United States, or a national or permanent resident of Iceland, Liechtenstein, Norway or Switzerland, who
  //     pays stamp duty as a Singapore Citizen (IRAS, by remission); false = not; absent = not asked (the remitted total is then shown beside the headline, as before).
  //   couple (C1, optional): true = the two buyers are a married couple buying in their two names only; false = not; absent = not asked (shown beside the headline).
  const KINDS = ['private', 'ec', 'hdb'];
  function stampDuty(i) {
    const bad = moneyBad(i, ['price']); if (bad.length) return invalid(bad);
    const need = []; if (!pos(i.price)) need.push('price');
    // every buyer row must be valid: an unknown residency or a negative count is refused, not dropped (A1-19); 2 or more counts as 2
    const rowsIn = (i.buyers || []).filter(Boolean);
    const okRow = (b) => R.absd[b.res] && b.res !== 'ENTITY' && Number.isInteger(+b.owned) && +b.owned >= 0;
    if (!i.entity && rowsIn.some((b) => !okRow(b))) return invalid([{ field: 'buyers', text: 'Check the buyer details: residency and the number of homes already owned.' }]);
    // a Singapore Citizen has no FTA question: the flag only means something for a PR or a foreigner
    const buyers = rowsIn.map((b) => ({ res: b.res, owned: Math.min(2, +b.owned), fta: b.res === 'SC' ? undefined : (b.fta === true ? true : b.fta === false ? false : undefined) }));
    if (!i.entity && !buyers.length) need.push('buyers');
    if (need.length) return missing(need);
    const kind = KINDS.indexOf(i.kind) >= 0 ? i.kind : 'private', RM = R.absdRemissions;
    const bsd = Math.max(R.bsdMinimum, ENG.bsd(i.price)); // the planner's own BSD (same bands, rounded down), at least $1 (IRAS)
    const rateOf = (list) => list.reduce((a, b) => (b.rate > a.rate ? b : a));
    // C1: a buyer who qualifies under an FTA pays at the Singapore Citizen rate for their own count (IRAS "Foreigners eligible for ABSD remission under FTAs")
    const rates = i.entity ? [{ res: 'ENTITY', owned: 0, rate: R.absd.ENTITY[0] }] : buyers.map((b) => Object.assign({ res: b.res, owned: b.owned }, b.fta === true ? { fta: true } : {}, { rate: R.absd[b.fta === true ? 'SC' : b.res][b.owned] }));
    const top = rateOf(rates);
    const notes = [];
    const joint = buyers.length > 1, allFirst = buyers.every((b) => b.owned === 0), anySC = buyers.some((b) => b.res === 'SC');
    const coupleAsked = i.couple === true || i.couple === false, ftaAsked = buyers.some((b) => b.fta !== undefined);
    if (buyers.some((b) => b.fta === true)) notes.push({ id: 'fta-applied', text: 'A buyer who is a national of the United States, or a national or permanent resident of Iceland, Liechtenstein, Norway or Switzerland, pays ABSD at the Singapore Citizen rate under a free trade agreement (IRAS remission). IRAS decides.' });
    // HDB flat or new EC: IRAS remits ABSD in full if any buyer is a Singapore Citizen; PR buyers of an HDB flat pay 5% (A1-04).
    // HDB grants it automatically on approving the purchase, so this is the amount payable, not a refund.
    let rate = top.rate, hdbEc = null;
    if (!i.entity && kind !== 'private') {
      if (anySC) { rate = RM.hdbEc.anyCitizenRate; hdbEc = 'citizen'; }
      else if (kind === 'hdb' && buyers.every((b) => b.res === 'PR')) { rate = Math.min(rate, RM.hdbEc.hdbPrOnlyRate); hdbEc = 'pr'; }
      else hdbEc = 'none';
    }
    // C1: a married couple with at least one Singapore Citizen, buying in their two names only, neither owning a residential property: IRAS remits the ABSD in full at
    // stamping (R.absdRemissions.coupleRule). Applied only when the buyer says so (couple === true); in every other case the joint-purchase rule above stands.
    let coupleApplied = false;
    if (!i.entity && i.couple === true && kind === 'private' && buyers.length === RM.coupleRule.spouses && anySC && allFirst && rate > 0) {
      notes.push({ id: 'couple-applied', text: 'A married couple with at least one Singapore Citizen, buying in their two names only and neither owning another residential property: IRAS remits the ' + pc(rate) + ' ABSD in full at stamping (' + $(dutyAt(i.price, rate)) + ' otherwise). If either of you owns a home at the purchase, the full rate applies.' });
      rate = 0; coupleApplied = true;
    }
    const what = kind === 'hdb' ? 'an HDB flat' : 'a new EC from the developer';
    if (hdbEc === 'citizen' && top.rate > 0) notes.push({ id: 'hdb-ec', text: 'Buying ' + what + ' with a Singapore Citizen buyer: IRAS remits the ABSD in full (' + pc(top.rate) + ' = ' + $(dutyAt(i.price, top.rate)) + ' otherwise). HDB grants this automatically when it approves the purchase.' });
    if (hdbEc === 'pr' && top.rate > rate) notes.push({ id: 'hdb-pr', text: 'Permanent Residents buying an HDB flat pay ABSD at 5% (IRAS remission; ' + pc(top.rate) + ' otherwise).' });
    if (hdbEc === 'none') notes.push({ id: 'hdb-ec-none', text: 'IRAS’s ABSD remission for ' + (kind === 'hdb' ? 'HDB flats needs a Singapore Citizen buyer, or Permanent Resident buyers only' : 'new ECs needs a Singapore Citizen buyer') + ', so the full rate is shown.' });
    const absd = dutyAt(i.price, rate);
    if (joint && new Set(rates.map((r) => r.rate)).size > 1 && rate > 0) notes.push({ id: 'joint', text: 'Buying jointly, you pay the highest buyer’s rate on the whole price.' });
    // Remissions that depend on facts the calculator doesn't ask (marriage, nationality): the full figure stays the headline and
    // each remitted total is shown beside it with IRAS's conditions (A1-02, A1-09, A1-10, A1-14).
    const remissions = [];
    const alt = (list) => { const t = rateOf(list.map((b) => ({ rate: R.absd[b.res][b.owned] }))).rate; return { absdRate: t, absd: dutyAt(i.price, t), total: bsd + dutyAt(i.price, t) }; };
    // C1: shown beside the headline only when the question was not asked (the Stamp duty calculator); the planners ask it and apply the answer above.
    if (!coupleAsked && !i.entity && rate > 0 && joint && allFirst && anySC && buyers.some((b) => b.res !== 'SC')) {
      remissions.push(Object.assign({ id: 'couple', label: 'Total if you’re a married couple buying in your two names only' }, { absdRate: 0, absd: 0, total: bsd }));
      notes.push({ id: 'couple-remission', text: 'A married couple with at least one Singapore Citizen pays no ABSD if they buy in their two names only and neither spouse owns any other residential property: IRAS remits it at stamping. Otherwise the full ABSD applies.' });
    }
    if (!ftaAsked && !i.entity && rate > 0 && buyers.some((b) => b.res !== 'SC')) {
      const all = alt(buyers.map((b) => ({ res: 'SC', owned: b.owned })));
      if (all.absd < absd) remissions.push(Object.assign({ id: 'fta', label: 'Total if ' + (buyers.filter((b) => b.res !== 'SC').length > 1 ? 'every buyer who isn’t a Singapore Citizen qualifies' : (buyers.some((b) => b.res === 'FR') ? 'the foreign buyer qualifies' : 'the Permanent Resident buyer qualifies')) + ' under a free trade agreement' }, all));
      if (buyers.some((b) => b.res === 'FR') && buyers.some((b) => b.res === 'PR')) {
        const fr = alt(buyers.map((b) => (b.res === 'FR' ? { res: 'SC', owned: b.owned } : b)));
        if (fr.absd < absd && fr.absd !== all.absd) remissions.push(Object.assign({ id: 'fta-foreigner', label: 'Total if only the foreign buyer qualifies under a free trade agreement' }, fr));
      }
      if (remissions.some((x) => x.id.indexOf('fta') === 0)) notes.push({ id: 'fta', text: 'Under free trade agreements, nationals of the United States, and nationals and permanent residents of Iceland, Liechtenstein, Norway and Switzerland, pay stamp duty as Singapore Citizens (by remission). This applies to Singapore Permanent Residents with that nationality too. IRAS decides.' });
    }
    // Refunds: the ABSD is paid upfront and refunded later if conditions are met, so the headline is unchanged.
    if (!i.entity && kind === 'private' && joint && i.couple !== false && buyers.every((b) => b.owned <= 1) && buyers.some((b) => b.owned === 1) && anySC && rate > 0) notes.push({ id: 'refund', text: 'A married couple with at least one Singapore Citizen buying a second home together in their two names only can apply for an ABSD refund if they sell their first home within ' + R.absdRefundMonths + ' months (of buying a completed home, or of TOP or CSC for one under construction), and neither owned more than one home when buying. The ABSD is still paid upfront.' });
    if (!i.entity && kind === 'private' && buyers.length === 1 && buyers[0].res === 'SC' && buyers[0].owned === 1) notes.push({ id: 'single-senior', text: 'A single Singapore Citizen aged ' + RM.singleSeniorAge + ' or older can apply for a refund of this ABSD if they sell their first home within ' + R.absdRefundMonths + ' months (of buying a completed home, or of TOP or CSC for one under construction) and the new home is worth less than the one they sell. Other conditions apply; the ABSD is paid upfront first.' });
    if (i.entity) notes.push({ id: 'entity', text: 'Housing developers and trustees have their own rules: developers pay 40%, of which 35% can be remitted upfront on conditions; property held on trust for identifiable individuals can get a refund. IRAS decides.' });
    return {
      ok: true, price: i.price, kind, bsd, bsdLines: bsdLines(i.price), absdRate: rate, absdRateFull: top.rate, absd, total: bsd + absd, profile: top, perBuyer: rates, notes,
      remissions, hdbEc,
      basis: 'Duty is on the higher of the price or market value, rounded down to the dollar (at least $1), and payable within 14 days of signing.',
      // C1: present only when the couple question was answered yes and the remission applied (an unaffected result keeps its old shape)
      ...(coupleApplied ? { coupleApplied: true } : {}),
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
    const bad = moneyBad(i, ['price']); if (bad.length) return invalid(bad);
    if (s < b) return { ok: false, error: 'sold-before-bought' };
    const reg = R.ssd.find((r) => iso(b) >= r.from && (!r.to || iso(b) <= r.to));
    if (!reg) {
      // before 14 Jan 2011 (A1-16): no SSD before 20 Feb 2010; for 2010 purchases, none once the 1- or 3-year period had passed
      if (iso(b) < R.ssdFrom) return { ok: true, applies: false, reason: 'before-2010', rate: 0, ssd: 0, text: 'Bought before 20 Feb 2010, when SSD began: no SSD applies.' };
      const old = R.ssd2010.find((r) => iso(b) >= r.from && iso(b) <= r.to);
      if (s < addYears(b, old.years)) return { ok: false, error: 'ssd-2010' };
      return { ok: true, applies: false, reason: 'before-2011', rate: 0, ssd: 0, text: 'Bought between ' + day(old.from) + ' and ' + day(old.to) + ' and sold more than ' + old.years + ' year' + (old.years > 1 ? 's' : '') + ' later: no SSD applies.' };
    }
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
      ok: true, applies: rate > 0, rate, ssd: dutyAt(i.price, rate), regime: reg, band, heldDays: days, heldText: y + ' year' + (y === 1 ? '' : 's') + ' ' + mo + ' month' + (mo === 1 ? '' : 's'),
      freeFrom: iso(addYears(b, reg.years)), nearBoundary: near, leapDay,
    };
  }

  /* ---------------- 4. Sale proceeds ---------------- */
  // i: { type: 'hdb'|'private'|'ec', price, loan, penalty, cpfPrincipal, cpfInterest, commissionPct, gst: bool, legal, other, bought, sold, owner55 }
  // An UPPER estimate (A3-09): CPF compounds the prevailing OA rate yearly from when each amount was withdrawn; this applies it
  // to the whole principal from the first year, so the real figure (on CPF's Home Ownership page) is usually lower.
  function cpfInterestEstimate(principal, years) { return pos(principal) && pos(years) ? principal * (Math.pow(1 + R.cpfOaRate, years) - 1) : 0; }
  function saleProceeds(i) {
    const bad = moneyBad(i, ['price', 'loan', 'penalty', 'cpfPrincipal', 'cpfInterest', 'legal', 'other']).concat(rangeBad(i, ['commissionPct'])); if (bad.length) return invalid(bad);
    if (!pos(i.price)) return missing(['price']);
    const price = i.price, loan = nn(i.loan), penalty = nn(i.penalty), cpfDue = nn(i.cpfPrincipal) + nn(i.cpfInterest);
    const commissionPct = num(i.commissionPct) === null ? A.commissionRate * 100 : Math.max(0, i.commissionPct);
    const commission = price * commissionPct / 100, gst = i.gst === false ? 0 : commission * R.gst;
    const legal = num(i.legal) === null ? A.saleLegalFees : Math.max(0, i.legal), other = nn(i.other);
    // SSD for a private home or EC needs both dates; when it can't be worked out, say so rather than show $0 (A1-05)
    let ssdRes = null, ssdMissing = null;
    if (i.type !== 'hdb') {
      if (!i.bought) ssdMissing = 'bought'; else if (!i.sold) ssdMissing = 'sold';
      else { const r = ssd({ price, bought: i.bought, sold: i.sold }); if (r.ok) ssdRes = r; else ssdMissing = r.error || 'dates'; }
    }
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
      costs: { commission, commissionPct, gst, legal, other, ssd: ssdAmt, total: costs }, ssd: ssdRes, ssdMissing,
      netCash, ownCashNeeded: netCash < 0 ? -netCash : 0,
      nextPurchase: { cash: Math.max(0, netCash), cpf: cpfRefund, total: Math.max(0, netCash) + cpfRefund },
      owner55: !!i.owner55,
      defaults: { commission: num(i.commissionPct) === null, legal: num(i.legal) === null },
    };
  }

  /* ---------------- 4b. The sale estimate used by the Planner and the Payment Timeline ---------------- */
  // f: { type: 'hdb'|'private'|'ec', price, loan, cpfRefund (the CPF to be refunded INCLUDING accrued interest), cpfPrincipal + cpfInterest (the same, in two parts), costs (selling costs, replaces the usual estimate),
  //      overrideCash, overrideCpf (the buyer's own figures; used as entered), heldOver4 (private/EC: owned for more than 4 years, so no Seller's Stamp Duty),
  //      cpfRefund55 (C1, optional: the part of the CPF refund that goes back to owners aged 55 or over) }; o: { owner55, today }.
  // An owner aged 55 or over has their refund applied first to their Retirement Account (up to the Full Retirement Sum), so none of THEIR refund is counted. Each owner's refund
  // goes back to their own CPF, so a younger co-owner's part is counted (C1): the 55+ part is taken out when it is entered; when it is not, none of the refund is counted, as before.
  // Nothing is invented. The CPF interest is never estimated from an assumed holding period: the refund is what the buyer enters, or the sale is NOT counted (counted: false) and the
  // part that is already known (the price less selling costs and the loan, before any CPF refund) is returned as beforeCpf, with the list of what is missing.
  // Cash and CPF returned are kept apart. Cash may be negative (the sale would not cover the loan and costs).
  function saleEstimate(f, o) {
    f = f || {}; o = o || {};
    const type = f.type === 'private' || f.type === 'ec' ? f.type : 'hdb', owner55 = !!o.owner55;
    const out = { type, counted: false, source: null, missing: [], reason: null, owner55, price: pos(f.price) ? f.price : null, loan: num(f.loan) !== null ? f.loan : null, refund: null, cash: 0, cpf: 0, beforeCpf: null, costs: null, net: null, cpfRefund: null, ownCashNeeded: 0 };
    if (num(f.overrideCash) !== null || num(f.overrideCpf) !== null) {
      out.counted = true; out.source = 'entered'; out.cash = num(f.overrideCash) !== null ? f.overrideCash : 0; out.cpf = cpfAfter55(num(f.overrideCpf) !== null ? f.overrideCpf : 0, owner55, f.cpfRefund55);
      out.net = out.cash; out.cpfRefund = num(f.overrideCpf) !== null ? f.overrideCpf : 0;
      if (num(f.overrideCash) === null) out.missing.push('cash');
      if (num(f.overrideCpf) === null) out.missing.push('cpf');
      return out;
    }
    const refund = num(f.cpfRefund) !== null ? f.cpfRefund : (num(f.cpfPrincipal) !== null && num(f.cpfInterest) !== null ? f.cpfPrincipal + f.cpfInterest : null);
    out.refund = refund;
    if (out.price === null) out.missing.push('price');
    if (out.loan === null) out.missing.push('loan');
    if (refund === null) out.missing.push('refund');
    let held = null;
    if (type !== 'hdb') { if (f.heldOver4 === true) held = { bought: '2000-01-01', sold: o.today || '2026-01-01' }; else out.missing.push('held'); }
    if (out.price === null) { out.reason = 'missing'; return out; }
    const base = { type, price: out.price, loan: nn(f.loan), gst: num(f.costs) === null, owner55 };
    if (num(f.costs) !== null) { base.commissionPct = 0; base.legal = 0; base.other = f.costs; }
    if (held) { base.bought = held.bought; base.sold = held.sold; }
    if (out.loan !== null) { const r0 = saleProceeds(Object.assign({}, base, { cpfPrincipal: 0, cpfInterest: 0 })); if (r0.ok) { out.beforeCpf = r0.netCash; out.costs = r0.costs.total; } }
    if (out.missing.length) { out.reason = 'missing'; return out; }
    const r = saleProceeds(Object.assign({}, base, { cpfPrincipal: refund, cpfInterest: 0 }));
    if (!r.ok) { out.reason = 'invalid'; return out; }
    if (r.ssdMissing) { out.missing.push('held'); out.reason = 'missing'; return out; }
    out.counted = true; out.source = 'estimated';
    out.cash = r.netCash; out.cpf = cpfAfter55(r.cpfRefund, owner55, f.cpfRefund55); out.net = r.netCash; out.cpfRefund = r.cpfRefund; out.costs = r.costs.total; out.commission = r.costs.commission + r.costs.gst; out.legal = r.costs.legal; out.ssd = r.costs.ssd;
    out.ownCashNeeded = r.ownCashNeeded; out.shortfall = r.loanShortfall; out.cpfShortfall = r.cpfShortfall;
    return out;
  }

  // the CPF refund counted for the next purchase when an owner is 55 or over (C1): what is left after the 55+ owners' own part, or nothing when that part is not known
  function cpfAfter55(refund, owner55, part55) {
    if (!owner55) return refund;
    return num(part55) !== null && part55 >= 0 ? Math.max(0, refund - part55) : 0;
  }

  /* ---------------- CPF for a second (or later) property (C1, B3) ---------------- */
  // CPF Board (R.cpfSecondHome): a member who owns another property when buying can use only the OA left after setting aside the Basic Retirement Sum (if a property they
  // own lasts to age 95) or the Full Retirement Sum (if none does). OA, SA and RA all count towards the set-aside. Per member.
  // o: { year (the year of purchase; the latest year in the rules file is used beyond it), cover95: true | false | null (not known: the Full Retirement Sum, the cautious side),
  //      members: [{ oa, sa, ra, age, subject }] }  subject false = this member owns no other property at the purchase, so their OA is not held back.
  // Returns { ok, usable (total), members: [{ oa, other, need, usable, subject }], sumName, setAside, year, cover, cautious, older, missing }.
  function cpfSecondHome(o) {
    o = o || {}; const T = R.cpfRetirementSums, years = Object.keys(T).filter((k) => /^\d{4}$/.test(k)).map(Number).sort((a, b) => a - b);
    const asked = num(o.year) !== null ? Math.floor(o.year) : years[0], year = years.indexOf(asked) >= 0 ? asked : (asked > years[years.length - 1] ? years[years.length - 1] : years[0]);
    const S = T[year], cover = o.cover95 === true ? 'yes' : o.cover95 === false ? 'no' : 'unknown';
    const sumName = cover === 'yes' ? 'BRS' : 'FRS', setAside = cover === 'yes' ? S.brs : S.frs;
    const missing = [];
    const members = (o.members || []).map((m, k) => {
      m = m || {}; const subject = m.subject !== false;
      if (num(m.oa) === null) missing.push('oa.' + k); if (subject && num(m.sa) === null && num(m.ra) === null) missing.push('sa.' + k);
      const oa = nn(m.oa), other = nn(m.sa) + nn(m.ra), need = subject ? Math.max(0, setAside - other) : 0;
      return { oa, other, need, usable: subject ? Math.max(0, oa - need) : oa, subject, older: pos(m.age) && m.age >= 55 };
    });
    if (missing.length) return { ok: false, missing, sumName, setAside, year, cover };
    return { ok: true, usable: members.reduce((a, m) => a + m.usable, 0), members, sumName, setAside, year, yearAsked: asked, outdated: asked > years[years.length - 1], cover, cautious: cover !== 'yes', older: members.some((m) => m.older && m.subject) };
  }

  /* ---------------- shared: borrowers, ages and tenure ---------------- */
  // b: [{ age, fixed, variable, rental }]  -> gross and assessable (after the MAS 30% haircuts) income, income-weighted age
  function borrowers(list) {
    const bs = (list || []).filter((b) => b && (pos(b.fixed) || pos(b.variable) || pos(b.rental)));
    const gross = (b) => nn(b.fixed) + nn(b.variable) + nn(b.rental);
    const assess = (b) => nn(b.fixed) + nn(b.variable) * (1 - R.variableIncomeHaircut) + nn(b.rental) * (1 - R.rentalIncomeHaircut);
    const G = bs.reduce((s, b) => s + gross(b), 0), AS = bs.reduce((s, b) => s + assess(b), 0);
    const aged = bs.filter((b) => pos(b.age));
    // MAS Notice 632 footnote 6: weighted by income as counted under Notice 645, i.e. after the 30% haircuts (A2-05)
    const iwaa = aged.length === bs.length && AS > 0 ? bs.reduce((s, b) => s + b.age * assess(b), 0) / AS : null;
    // R1.2.2: the same age weighted by gross income, for disclosure only. Which of the two MAS means (Notice 632 fn. 3: "gross monthly income ... as determined in accordance with Notice 645") is not confirmed, so the engine's result (iwaa, above) is unchanged and is labelled unverified wherever two borrowers differ.
    const iwaaGross = aged.length === bs.length && G > 0 ? bs.reduce((s, b) => s + b.age * gross(b), 0) / G : null;
    const badAge = (list || []).some((b) => b && num(b.age) !== null && outOf('age', b.age));
    const badMoney = (list || []).some((b) => b && ['fixed', 'variable', 'rental'].some((k) => num(b[k]) !== null && (b[k] < 0 || b[k] > LIMITS.income.max)));
    const everyone = (list || []).filter((b) => b && pos(b.age)); // HDB averages every applicant's age, earning or not
    const avgAge = everyone.length ? everyone.reduce((s, b) => s + b.age, 0) / everyone.length : null;
    const youngest = everyone.length ? Math.min.apply(null, everyone.map((b) => b.age)) : null;
    const bad = (badAge ? [{ field: 'age', text: LIMITS.age.text }] : []).concat(badMoney ? [{ field: 'income', text: LIMITS.income.text }] : []);
    // Phase B (Oct 2026): which weighting MAS means is unconfirmed, so the age that sets the tenure and the loan limit is the HIGHER of the two (the older age can only
    // shorten the tenure or lower the limit). iwaa and iwaaGross keep their meaning; iwaaUse is what the loan work uses. ageUnverified: the two differ, so the choice mattered.
    const iwaaUse = iwaa === null ? null : (iwaaGross === null ? iwaa : Math.max(iwaa, iwaaGross));
    const ageUnverified = bs.length > 1 && iwaa !== null && iwaaGross !== null && Math.abs(iwaa - iwaaGross) > 1e-9;
    return { list: bs, gross: G, assessable: AS, iwaa, iwaaGross, iwaaUse, ageUnverified, avgAge, youngest, haircut: G - AS, bad };
  }
  // Three separate limits on a BANK loan to an individual, never mixed:
  //   std     the longest tenure that keeps the STANDARD loan limit: within 30 years (25 for an HDB flat) and ending by age 65 (MAS Notice 632);
  //   max     the longest loan MAS allows: 35 years (30 for an HDB flat);
  //   ageCap  the latest age a bank usually ends a loan, 75 (bank policy, not MAS: see gw-rules.js), so 75 minus the age.
  // The tenure used is the one asked for, cut to what is allowed (the shorter of max and ageCap); with none asked for, the standard tenure.
  // Every figure that depends on tenure (the loan the income supports, the instalment, the loan limit) takes `years` from here.
  function bankTenure(kind, age, wanted) {
    const L = R.bankLtv, std = Math.max(0, Math.min(L.standardTenure[kind], Math.floor(L.endAge - age))), max = L.maxTenure[kind];
    const ageCap = Math.max(0, Math.floor(L.maturityAge - age + 1e-9)), allowed = Math.min(max, ageCap);
    // Left blank: the longest tenure that keeps the standard loan limit. From age 65 there is none (every loan then runs past 65 and takes the lower limit),
    // so the default is the longest a bank usually lends, never zero: a blank tenure and a typed one must give the same kind of answer.
    const years = pos(wanted) ? Math.min(wanted, allowed) : (std >= 1 ? std : allowed), capped = pos(wanted) && wanted > allowed;
    return { std, max, ageCap, allowed, years, defaulted: !pos(wanted), noStd: std < 1, lower: years > std, capped, cappedBy: capped ? (ageCap < max ? 'age' : 'max') : null, maturityAge: L.maturityAge, asked: pos(wanted) ? wanted : null };
  }

  // The line under a tenure field, in words. It adds no rule: every number is read from bankTenure (std, allowed) and the rules file.
  // o: { age, std, allowed, chosen (years typed, or 0), joint, entity, hdbLoan, years (HDB loan: the tenure used) }
  const yrs = (n) => n + (n === 1 ? ' year' : ' years');
  // The most a bank loan can run, and why, in one sentence: "Maximum 15 years based on age 60 and assumed bank maturity age 75 (lender policy, not a MAS rule)."
  // o: { allowed (from bankTenure), age, joint, hdb, max }. The age line is used only when the age, not the MAS maximum, is what limits it.
  function tenureMaxText(o) {
    const L = R.bankLtv, max = o.max || L.maxTenure[o.hdb ? 'hdb' : 'private'];
    if (!(o.allowed >= 1)) return '';
    if (o.allowed < max) return 'Maximum ' + yrs(o.allowed) + ' based on ' + (o.joint ? 'income-weighted age ' : 'age ') + o.age + ' and assumed bank maturity age ' + L.maturityAge + ' (lender policy, not a MAS rule).';
    return 'Maximum ' + yrs(max) + (o.hdb ? ' for an HDB flat bank loan.' : ' for a bank loan.');
  }
  // The most a loan tenure can be, worked out from the age alone: the same limits bankTenure and the HDB loan rule apply, so a screen can correct an
  // over-long entry before income, price or any other figure is in. o: { kind: 'private'|'hdb'|'hdb-loan', age (a number) | borrowers: [{ age, fixed, variable }], lease }.
  // Returns { allowed, std, max, age, joint } or null when the age is not known yet (joint borrowers need their incomes to be weighted).
  function tenureLimit(o) {
    const kind = o.kind === 'hdb' || o.kind === 'hdb-loan' ? o.kind : 'private'; let age = null, joint = false;
    if (typeof o.age === 'number') age = o.age;
    else if (o.borrowers && o.borrowers.length) {
      const named = o.borrowers.filter((b) => b && (pos(b.age) || pos(b.fixed) || pos(b.variable)));
      if (named.length === 1 && pos(named[0].age)) age = named[0].age; // one borrower: their own age, with or without an income yet
      else { const B = borrowers(o.borrowers); if (!B.bad.length && B.iwaa !== null) { age = kind === 'hdb-loan' ? B.avgAge : B.iwaaUse; joint = B.list.length > 1; } } }
    if (typeof age !== 'number' || !(age >= LIMITS.age.min && age <= LIMITS.age.max)) return null;
    if (kind === 'hdb-loan') { const H = R.hdbLoan, leaseCap = pos(o.lease) ? Math.floor(o.lease - H.leaseBufferYears) : Infinity, m = Math.max(0, Math.min(H.maxTenureYears, Math.floor(H.endAge - age), leaseCap)); return { allowed: m, std: m, max: H.maxTenureYears, age, joint, hdbLoan: true }; }
    const t = bankTenure(kind, age); return { allowed: t.allowed, std: t.std, max: t.max, age, joint };
  }
  // Which loan limit the longest tenure takes. The tenure is never moved to keep the standard limit: it is only cut to the most allowed, and this says what that costs.
  // o: { std, allowed, loans (housing loans the buyer has: 0, 1, 2+; gives the two limits in figures), ltvStd, ltvLow (or the figures directly) }
  function tenureTierText(o) {
    if (!(o.allowed > o.std)) return '';
    const L = R.bankLtv, k = typeof o.loans === 'number' && o.loans >= 0 ? Math.min(Math.floor(o.loans), 2) : null;
    const hi = o.ltvStd || (k === null ? null : L.standard[k].ltv), lo = o.ltvLow || (k === null ? null : L.lower[k].ltv), pc0 = (x) => Math.round(x * 100) + '%';
    return (o.std >= 1 ? 'Over ' + yrs(o.std) + ' takes the lower loan limit' : 'Every tenure takes the lower loan limit') + (lo ? ' of ' + pc0(lo) : '') + (hi && o.std >= 1 ? ' (' + pc0(hi) + ' up to ' + yrs(o.std) + ')' : '') + '.';
  }
  function tenureNote(o) {
    const L = R.bankLtv, cap = L.standardTenure.private, max = L.maxTenure.private, ma = L.maturityAge;
    if (o.hdbLoan) return (o.adjustedFrom ? 'Changed from ' + yrs(o.adjustedFrom) + '. ' : '') + (o.years && (o.max === undefined ? (!o.chosen || o.chosen >= o.years) : o.years >= o.max) ? 'Using ' + yrs(o.years) + ', the longest HDB allows here. ' : '') + 'An HDB loan runs up to ' + R.hdbLoan.maxTenureYears + ' years, ends by age ' + R.hdbLoan.endAge + ' and ends at least ' + R.hdbLoan.leaseBufferYears + ' years before the lease does. A shorter tenure is allowed.';
    if (o.entity) return 'A company’s loan limit does not depend on the tenure. ' + yrs(cap) + ' is used if you leave this blank; up to ' + yrs(max) + ' is allowed.';
    if (o.age === null || o.age === undefined || o.std === null || o.std === undefined) return 'Banks can lend for up to ' + yrs(max) + ' and usually end a loan by age ' + ma + ' (lender policy, not a MAS rule). Over ' + cap + ' years, or past age ' + L.endAge + ', the lower loan limit applies. Enter your age to see where that line falls.';
    const at = (o.joint ? 'At an income-weighted age of ' : 'At age ') + o.age, allowed = o.allowed === undefined ? max : o.allowed;
    if (allowed < 1) return at + ', banks usually end a loan by age ' + ma + ', so no bank loan tenure fits.';
    if (o.chosen) {
      // At or over the most allowed: say what the most is and why (one sentence, the same on every screen), then which loan limit it takes.
      if (o.chosen >= allowed) {
        const tier = tenureTierText({ std: o.std, allowed, loans: o.loans });
        return (o.adjustedFrom ? 'Changed from ' + yrs(o.adjustedFrom) + '. ' : '') + tenureMaxText({ allowed, age: o.age, joint: o.joint, hdb: o.hdb, max: o.max }) + (o.chosen > allowed ? ' Using ' + yrs(allowed) + '.' : '') + (tier ? ' ' + tier : '');
      }
      if (o.std < 1) return at + ', no tenure keeps the standard loan limit, so every tenure takes the lower limit.';
      return o.chosen > o.std ? at + ', ' + yrs(o.std) + ' is the longest that keeps the standard loan limit. ' + (tenureTierText({ std: o.std, allowed, loans: o.loans }) || yrs(o.chosen) + ' takes the lower limit.') : at + ', ' + yrs(o.chosen) + ' keeps the standard loan limit.';
    }
    return o.std >= 1 ? at + ', ' + yrs(o.std) + ' is the longest that keeps the standard loan limit, and is used if you leave this blank. Longer, up to ' + yrs(allowed) + ', is allowed but takes the lower limit.' : at + ', no tenure keeps the standard loan limit, so ' + yrs(allowed) + ', the longest a bank usually lends, is used at the lower limit if you leave this blank. You can enter fewer years.';
  }

  // R1.2: MAS Notice 645 para 10(b), table row 5 (residential, OTP on or after 30 Sep 2022): the instalment is tested at the higher of 4% and the
  // thereafter interest rate. Optional i.quotedRatePct (the rate the borrower was quoted); absent, or not above 4%, the 4% floor applies as before.
  const testRate = (i) => (num(i.quotedRatePct) !== null && i.quotedRatePct / 100 > R.stressRate ? i.quotedRatePct / 100 : R.stressRate);

  // When the tenure was left blank and a longer one is allowed, what that longer one would give (it takes the lower loan limit), so the result can say so
  // in one line instead of the buyer having to find it. null when a tenure was typed or nothing longer is allowed.
  const longerOf = (t, forNew, sr, loans) => (t.defaulted && t.allowed > t.years ? { years: t.allowed, maxLoan: forNew * AF(sr, t.allowed), ltv: R.bankLtv.lower[Math.min(nn(loans), 2)].ltv } : null);

  /* ---------------- 5. TDSR ---------------- */
  // i: { kind: 'private'|'hdb', borrowers: [...], debts, tenure, loans: 0|1|2 }
  // i: { kind, borrowers, debts, propertyLoans (HDB flat only: the part of debts that is property loans), tenure, loans }
  function tdsr(i) {
    const B = borrowers(i.borrowers), bad = B.bad.concat(moneyBad(i, ['debts', 'propertyLoans']), rangeBad(i, ['tenure'])); if (bad.length) return invalid(bad);
    const need = [];
    if (!(B.gross > 0)) need.push('income'); if (B.iwaa === null) need.push('age');
    if (need.length) return missing(need);
    const kind = i.kind === 'hdb' ? 'hdb' : 'private', prop = kind === 'hdb' ? nn(i.propertyLoans) : 0, debts = Math.max(nn(i.debts), prop), cap = R.tdsr * B.assessable, forNewTdsr = Math.max(0, cap - debts);
    // An HDB flat with a bank loan is also held to MSR 30% of income, less existing property-loan instalments (MAS 645 para 6; A2-01)
    const msrCap = kind === 'hdb' ? R.msr * B.assessable : null, forNewMsr = kind === 'hdb' ? Math.max(0, msrCap - prop) : null;
    const forNew = kind === 'hdb' ? Math.min(forNewTdsr, forNewMsr) : forNewTdsr, binding = kind === 'hdb' && forNewMsr < forNewTdsr ? 'msr' : 'tdsr';
    const t = bankTenure(kind, B.iwaaUse, i.tenure);
    if (t.years < 1) return { ok: true, noTenure: true, cause: t.allowed < 1 ? 'maturity' : 'age', kind, B, cap, debts, forNew, tenure: t };
    const sr = testRate(i), loan = forNew * AF(sr, t.years), row = (t.lower ? R.bankLtv.lower : R.bankLtv.standard)[Math.min(nn(i.loans), 2)];
    if (loan > LIMITS.loan.max) return invalid([{ field: 'income', text: LIMITS.loan.text }]);
    return { ok: true, kind, B, cap, debts, prop, forNew, forNewTdsr, forNewMsr, msrCap, binding, overLimit: debts > cap, tenure: t, rate: sr, maxLoan: loan, ltv: row.ltv, minCash: row.minCash, priceAtLtv: loan / row.ltv, msrApplies: kind === 'hdb', longer: longerOf(t, forNew, sr, i.loans) };
  }

  /* ---------------- 6. MSR ---------------- */
  // i: { scenario: 'hdb-loan'|'hdb-bank'|'ec', borrowers, propertyLoans, otherDebts, lease, tenure, loans }
  // i: { scenario, household: 'family'|'extended'|'single' (HDB loan), borrowers, propertyLoans, otherDebts, lease, tenure, loans }
  // A specific HDB resale flat: what the loan, the cash and the CPF look like at its price and valuation (R.valuation). The loan limit and the minimum cash are on the LOWER of the
  // price and the valuation; the price above the valuation is cash only. `maxLoan` is what the income supports; the loan taken is the smaller of that and the limit on the lower value.
  function flatCheck(i, maxLoan, ltv, minCashPct) {
    if (!pos(i.price)) return null;
    const P = i.price, V = pos(i.valuation) ? i.valuation : null, base = V !== null && V < P ? V : P, cov = P - base;
    const loanLimit = base * ltv, loan = Math.min(maxLoan, loanLimit), cashMin = base * minCashPct, cashOnly = cashMin + cov, down = P - loan;
    return { price: P, valuation: V, base, cov, ltv, loanLimit, loan, incomeLimited: maxLoan < loanLimit - 0.5, minCashPct, cashMin, cashOnly, down, cashOrCpf: Math.max(0, down - cashOnly), dutyBase: V !== null && V > P ? V : P };
  }
  function msr(i) {
    const B = borrowers(i.borrowers), bad = B.bad.concat(moneyBad(i, ['propertyLoans', 'otherDebts', 'price', 'valuation']), rangeBad(i, ['tenure', 'lease'])); if (bad.length) return invalid(bad);
    const need = [];
    if (!(B.gross > 0)) need.push('income'); if (B.iwaa === null) need.push('age');
    if (need.length) return missing(need);
    const sc = ['hdb-loan', 'hdb-bank', 'ec'].indexOf(i.scenario) >= 0 ? i.scenario : 'hdb-loan';
    const prop = nn(i.propertyLoans), other = nn(i.otherDebts);
    const notes = [];
    if (sc === 'hdb-loan') {
      const H = R.hdbLoan, rate = Math.max(H.stressRate, R.hdbLoanRate);
      // HDB: the shortest of 25 years, 65 minus the applicants' average age, and the remaining lease minus 20 years
      const ageCap = Math.floor(H.endAge - B.avgAge), leaseCap = pos(i.lease) ? Math.floor(i.lease - H.leaseBufferYears) : Infinity;
      const maxT = Math.max(0, Math.min(H.maxTenureYears, ageCap, leaseCap)), years = pos(i.tenure) ? Math.min(i.tenure, maxT) : maxT;
      const household = ['family', 'extended', 'single'].indexOf(i.household) >= 0 ? i.household : 'family';
      // HDB counts gross income as declared; no MAS haircut on HDB loans
      const msrCap = R.msr * B.gross, forNew = Math.max(0, msrCap - prop);
      // income ceilings by household (HFE letters applied for from 24 Aug 2026) (A2-03)
      const ceil = R.hdbIncomeCeilings[household], HH = { family: 'families', extended: 'extended families', single: 'singles buying under the Single Singapore Citizen scheme' };
      if (B.gross > ceil) notes.push({ id: 'ceiling', text: 'Household income is above $' + ceil.toLocaleString('en-US') + ' a month, the HDB loan ceiling for ' + HH[household] + ' (HFE letters applied for from 24 Aug 2026; everyone in the HFE application counts). You may need a bank loan instead.' });
      // one applicant on the default "Family" choice: say the singles ceiling too, in case they are buying alone (A2-03)
      else if (household === 'family' && (i.borrowers || []).filter((b) => b && (pos(b.age) || pos(b.fixed) || pos(b.variable))).length === 1 && B.gross > R.hdbIncomeCeilings.single) notes.push({ id: 'ceiling-single', text: 'Buying on your own? The HDB loan ceiling for singles is $' + R.hdbIncomeCeilings.single.toLocaleString('en-US') + ' a month (Single Singapore Citizen scheme, 35 or older), so this income is above it.' });
      // V1-09: one applicant under 35 on the default "Family" choice: singles must be 35 or older
      const lone = (i.borrowers || []).filter((b) => b && (pos(b.age) || pos(b.fixed) || pos(b.variable))).length === 1;
      if (household === 'family' && lone && B.youngest !== null && B.youngest < R.hdbSingleMinAge) notes.push({ id: 'single-age-family', text: 'Buying on your own? Singles need to be ' + R.hdbSingleMinAge + ' or older to buy a flat with an HDB loan under the Single Singapore Citizen scheme.' });
      if (household === 'single' && (B.youngest !== null && B.youngest < R.hdbSingleMinAge)) notes.push({ id: 'single-age', text: 'Singles need to be ' + R.hdbSingleMinAge + ' or older to buy a flat with an HDB loan under the Single Singapore Citizen scheme.' });
      if (years < 1) return { ok: true, noTenure: true, cause: leaseCap <= Math.min(H.maxTenureYears, ageCap) ? 'lease' : 'age', scenario: sc, B, rate, tenure: { years: 0, max: maxT, lease: pos(i.lease) ? i.lease : null }, msrCap, prop, forNew, maxLoan: 0, notes };
      const loan = forNew * AF(rate, years);
      if (loan > LIMITS.loan.max) return invalid([{ field: 'income', text: LIMITS.loan.text }]);
      // the lease must cover the youngest applicant to 95, or the 75% limit is pro-rated (HDB; formula from MOM/MND 9 May 2019) (A2-09)
      let ltv = H.ltv;
      if (pos(i.lease) && B.youngest !== null && i.lease + B.youngest < H.leaseCoverAge) {
        ltv = H.ltv * Math.max(0, i.lease - H.leaseBufferYears) / (H.leaseCoverAge - H.leaseBufferYears - B.youngest);
        notes.push({ id: 'lease95', text: 'The remaining lease doesn’t cover the youngest applicant to age 95, so HDB pro-rates the loan limit: about ' + pc(ltv, 1) + ' of the price here instead of 75%. CPF use is pro-rated too. HDB confirms the exact figure.' });
      }
      // V1-02: with no lease entered the 75% limit is assumed; say when it would be lower
      if (!pos(i.lease)) notes.push({ id: 'lease-unknown', text: 'If the flat’s remaining lease doesn’t cover the youngest applicant to age 95, HDB lends less than 75% of the price: enter the remaining lease to check.' });
      if (pos(i.tenure) && i.tenure > maxT) notes.push({ id: 'capped', text: 'Tenure capped at ' + maxT + ' years, the most HDB allows here.' });
      notes.push({ id: 'commitments', text: 'HDB also looks at your other loans and commitments, such as car loans and card bills, so it may lend less than this.' });
      return { ok: true, scenario: sc, household, ceiling: ceil, B, rate, tenure: { years, max: maxT, lease: pos(i.lease) ? i.lease : null }, msrCap, prop, forNew, maxLoan: loan, ltv, priceAtLtv: loan / ltv, binding: 'msr', flat: flatCheck(i, loan, ltv, H.minCash), notes };
    }
    const kind = sc === 'ec' ? 'private' : 'hdb', t = bankTenure(kind, B.iwaaUse, i.tenure);
    const msrCap = R.msr * B.assessable, tdsrCap = R.tdsr * B.assessable;
    const forNewMsr = Math.max(0, msrCap - prop), forNewTdsr = Math.max(0, tdsrCap - prop - other), forNew = Math.min(forNewMsr, forNewTdsr);
    if (t.years < 1) return { ok: true, noTenure: true, cause: t.allowed < 1 ? 'maturity' : 'age', scenario: sc, B, rate: R.stressRate, tenure: t, msrCap, tdsrCap, prop, other, forNew, maxLoan: 0, notes };
    const sr = testRate(i), loan = forNew * AF(sr, t.years), row = (t.lower ? R.bankLtv.lower : R.bankLtv.standard)[Math.min(nn(i.loans), 2)];
    if (loan > LIMITS.loan.max) return invalid([{ field: 'income', text: LIMITS.loan.text }]);
    if (sc === 'ec') notes.push({ id: 'ec-ceiling', text: 'New EC buyers have a household income ceiling: $16,000 a month, or $18,000 for EC sites whose land tender closed on or after 24 Aug 2026. MSR applies to ECs bought from the developer.' });
    if (t.capped) notes.push({ id: 'capped', text: t.cappedBy === 'age' ? 'Tenure capped at ' + t.allowed + ' years: banks usually end a loan by age ' + R.bankLtv.maturityAge + ' (lender policy, not a MAS rule).' : 'Tenure capped at ' + t.max + ' years, the MAS maximum here.' });
    return { ok: true, scenario: sc, B, rate: sr, tenure: t, msrCap, tdsrCap, prop, other, forNewMsr, forNewTdsr, forNew, maxLoan: loan, ltv: row.ltv, minCash: row.minCash, priceAtLtv: loan / row.ltv, binding: forNewMsr <= forNewTdsr ? 'msr' : 'tdsr', flat: sc === 'hdb-bank' ? flatCheck(i, loan, row.ltv, row.minCash) : null, notes, longer: longerOf(t, forNew, sr, i.loans) };
  }

  /* ---------------- 7. Progressive payments (uncompleted private home or EC) ---------------- */
  // i: { price, kind: 'private'|'ec', age, buyers, entity, loans: 0|1|2, ratePct, years, cpf }
  //   age = the borrower's age (the income-weighted average for joint borrowers); needed for individuals, not for a company
  function progressive(i) {
    const bad = moneyBad(i, ['price', 'cpf', 'valuation']).concat(rangeBad(i, ['ratePct', 'years']), !i.entity ? rangeBad(i, ['age']) : []); if (bad.length) return invalid(bad);
    const need = []; if (!pos(i.price)) need.push('price'); if (!i.entity && !pos(i.age)) need.push('age');
    if (need.length) return missing(need);
    // no tenure given: the longest one that keeps the standard limit at this age (30 years or less AND ending by 65); where there is none (65 or over) the
    // 30-year convention applies and takes the lower limit, so a standard limit is never shown for a loan that runs past 65
    const stdNow = i.entity ? null : Math.max(0, Math.min(R.bankLtv.standardTenure.private, Math.floor(R.bankLtv.endAge - i.age + 1e-9)));
    // a bank usually ends a loan by age 75 (bank policy, not MAS): the tenure is cut to what that leaves, whether typed or not. A company has no age, so no such cut.
    const ageCap = i.entity ? Infinity : Math.max(0, Math.floor(R.bankLtv.maturityAge - i.age + 1e-9)), allowed = Math.min(R.bankLtv.maxTenure.private, ageCap);
    if (!i.entity && allowed < 1) return invalid([{ field: 'age', text: 'Banks usually end a loan by age ' + R.bankLtv.maturityAge + ', so no bank loan tenure fits at this age.' }]);
    const P = i.price, wanted = pos(i.years) ? i.years : (stdNow >= 1 ? stdNow : (i.entity ? R.bankLtv.standardTenure.private : allowed)), years = Math.min(wanted, allowed);
    // MAS Notice 632: a tenure over 30 years, or a loan running past age 65, takes the lower limit (A2-02); a company borrower is
    // limited to 15% and has no CPF
    const pastAge = !i.entity && i.age + years > R.bankLtv.endAge, longTenure = years > R.bankLtv.standardTenure.private;
    // a company's limit is a flat 15% whatever the tenure or age (MAS), so the lower-limit flag and its reason never apply to it
    const lower = !i.entity && (!!i.lowerLtv || longTenure || pastAge);
    const stdYears = i.entity ? null : Math.max(0, Math.min(R.bankLtv.standardTenure.private, Math.floor(R.bankLtv.endAge - i.age)));
    const row = i.entity ? { ltv: R.entityLtv, minCash: 1 - R.entityLtv } : (lower ? R.bankLtv.lower : R.bankLtv.standard)[Math.min(nn(i.loans), 2)];
    // R1.2: an optional ceiling on the loan in dollars (e.g. what the borrower's income supports). Absent or not lower than the rule limit, nothing changes.
    // The rule limit and minimum cash stay as the table sets them; whatever the smaller loan does not cover is cash or CPF.
    // An optional valuation (a RESALE only: a new launch has none at purchase; see R.valuation). The loan limit, the minimum cash and the part CPF may pay are worked on the LOWER
    // of the price and the valuation; what the price is above the valuation (cash over valuation) is cash only; stamp duty is on the HIGHER of the two.
    const V = pos(i.valuation) ? i.valuation : null, base = V !== null && V < P ? V : P, cov = P - base, dutyBase = V !== null && V > P ? V : P;
    const ruleLoanMax = base * row.ltv, loanCapped = num(i.loanCap) !== null && i.loanCap >= 0 && i.loanCap < ruleLoanMax;
    const loanMax = loanCapped ? i.loanCap : ruleLoanMax, cashMin = base * row.minCash, cpfOrCash = base - loanMax - cashMin;
    const rate = num(i.ratePct) === null ? R.stressRate : i.ratePct / 100;
    const duty = stampDuty({ price: dutyBase, kind: i.kind === 'ec' ? 'ec' : 'private', buyers: i.buyers, entity: i.entity, couple: i.couple });
    let cashLeft = cashMin + cov, flexLeft = cpfOrCash, cpfLeft = num(i.cpf) === null ? null : Math.max(0, i.cpf), drawn = 0;
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
    // tenure left blank and a longer one allowed: what it would give, at the lower limit (one line on the result; not applied)
    const longer = !i.entity && !pos(i.years) && !i._noLonger && allowed > years ? (() => { const x = progressive(Object.assign({}, i, { years: allowed, _noLonger: true })); return x.ok ? { years: x.years, ltv: x.ltv, loanMax: x.loanMax, finalMonthly: x.finalMonthly } : null; })() : null;
    return {
      ok: true, price: P, ltv: row.ltv, minCash: row.minCash, loanMax, ruleLoanMax, loanCapped, cashMin, cpfOrCash, valuation: V, base, cov, dutyBase, rate, years, stages, duty, lower, entity: !!i.entity, tenureCapped: wanted > years, tenureCappedBy: wanted > years ? (ageCap < R.bankLtv.maxTenure.private ? 'age' : 'max') : null, tenureAllowed: allowed, maturityAge: R.bankLtv.maturityAge, tenureAsked: pos(i.years) ? i.years : null, defaulted: !pos(i.years), longer, autoLower: !i.lowerLtv && lower,
      lowerWhy: !lower ? null : longTenure ? 'tenure' : pastAge ? 'age' : (i.lowerLtv ? 'chosen' : null), age: i.entity ? null : i.age, stdYears,
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
  const BUYING = { private: 'Private home', ec: 'New EC from the developer', hdb: 'HDB flat' };
  const HOUSEHOLD = { family: 'Family', extended: 'Extended family', single: 'Single (Single Singapore Citizen scheme)' };
  const remitRows = (d) => (d && d.remissions ? d.remissions.map((x) => [x.label.replace(/^Total/, 'Total stamp duty'), $(x.total)]) : []);

  const messages = {
    mortgage(i, r) {
      return compose('mortgage repayment estimate',
        [['Loan', i.lender === 'hdb' ? 'HDB loan' : 'Bank loan'], ['Loan amount', $(i.loan)], ['Interest rate', i.ratePct + '% a year'], ['Tenure', i.years + ' years']],
        [['Monthly instalment', $(r.monthly)], ['Total interest', $(r.interest)], ['Total repaid', $(r.total)], ['First year', $(r.firstYear.interest) + ' interest, ' + $(r.firstYear.principal) + ' principal'],
          ['At the ' + pc(r.stress.rate) + ' stress-test rate (the higher of ' + pc(r.stress.floor) + ' and my rate)', $(r.stress.monthly) + '/month'], r.stress.incomeForTdsr ? ['Income to keep this loan within TDSR 55%', $(r.stress.incomeForTdsr) + '/month'] : null, ['Income to keep it within MSR 30%', $(r.stress.incomeForMsr) + '/month']],
        ['The rate stays the same for the whole tenure.', 'Income figures assume no other debts.'].concat(i.lender === 'hdb' ? ['HDB loan rate ' + pc(R.hdbLoanRate, 1) + ' a year, valid to ' + R.ratesValidUntilText + '.'] : []));
    },
    stampDuty(i, r) {
      return compose('stamp duty estimate',
        [['Purchase price', $(i.price)], ['Buying', BUYING[r.kind] || BUYING.private], i.entity ? ['Buyer', 'Company or other entity'] : null].concat(i.entity ? [] : (i.buyers || []).map((b, k) => [buyerText(b, k).split(': ')[0], buyerText(b, k).split(': ')[1]])),
        [['Buyer’s Stamp Duty (BSD)', $(r.bsd)], ['ABSD', pc(r.absdRate) + ' = ' + $(r.absd)], ['Total stamp duty', $(r.total)]].concat(remitRows(r)),
        ['Residential rates from 15 Feb 2023 (BSD) and 27 Apr 2023 (ABSD).', 'On the higher of price or market value; payable within 14 days of signing.'].concat(r.notes.map((n) => n.text)));
    },
    ssd(i, r) {
      return compose('Seller’s Stamp Duty estimate',
        [['Selling price (or market value, if higher)', $(i.price)], ['Bought on', day(i.bought)], ['Selling on', day(i.sold)]],
        [r.heldText ? ['Held for', r.heldText] : null, ['SSD rate', pc(r.rate)], ['SSD', $(r.ssd)], r.freeFrom ? ['No SSD if sold on or after', day(r.freeFrom)] : null],
        [r.regime ? 'Bought ' + (r.regime.to ? day(r.regime.from) + ' to ' + day(r.regime.to) : 'on or after ' + day(r.regime.from)) + ': ' + r.regime.years + '-year SSD period.' : (r.text || ''),
          r.nearBoundary && r.nearBoundary.length ? 'The date is within a week of an SSD anniversary (' + r.nearBoundary.map(day).join(', ') + '): confirm with my lawyer or IRAS.' : '',
          r.leapDay ? 'Bought on 29 February: IRAS doesn’t say which day each anniversary falls on; confirm with my lawyer or IRAS.' : ''].filter(Boolean));
    },
    saleProceeds(i, r) {
      return compose('sale proceeds estimate',
        [['Property', TYPE[i.type] || ''], ['Selling price', $(i.price)], pos(i.loan) ? ['Outstanding loan', $(i.loan)] : null, pos(i.penalty) ? ['Early repayment penalty', $(i.penalty)] : null,
          pos(i.cpfPrincipal) ? ['CPF used (principal)', $(i.cpfPrincipal)] : null, pos(i.cpfInterest) ? ['CPF accrued interest', $(i.cpfInterest)] : null,
          ['Agent commission', r.costs.commissionPct + '%' + (r.costs.gst ? ' + GST' : '')], ['Legal fees', $(r.costs.legal)], pos(i.other) ? ['Other costs', $(i.other)] : null,
          i.bought && i.type !== 'hdb' ? ['Bought on', day(i.bought)] : null, i.bought && i.sold && i.type !== 'hdb' ? ['Selling on', day(i.sold)] : null, i.owner55 ? ['An owner is 55 or older', 'yes'] : null],
        [r.loanShortfall ? ['The price doesn’t cover the loan by', $(r.loanShortfall)] : ['After repaying the loan', $(r.afterLoan)], ['CPF refund (back to CPF)', $(r.cpfRefund)], r.cpfShortfall > 0 ? ['CPF not refunded (no top-up if sold at market value)', $(r.cpfShortfall)] : null,
          r.cashFromSale >= 0 ? ['Cash from the sale', $(r.cashFromSale)] : null, ['Selling costs' + (r.costs.ssd ? ' incl. SSD ' + $(r.costs.ssd) : ''), $(r.costs.total)], r.netCash < 0 ? ['Cash I would need to add (shortfall and costs)', $(-r.netCash)] : ['Cash left after costs', $(r.netCash)],
          r.ssdMissing ? ['SSD', 'not included (' + (r.ssdMissing === 'bought' ? 'no purchase date given' : r.ssdMissing === 'sold' ? 'no sale date given' : 'dates not covered') + ')'] : null,
          // 55+ (A3-06): the refund first tops up the Retirement Account, so not all of it is available
          r.owner55 && r.nextPurchase.cpf > 0 ? ['Available for my next home', $(r.nextPurchase.cash) + ' cash, plus part of the ' + $(r.nextPurchase.cpf) + ' CPF refund (an owner is 55 or older: their refund first tops up their Retirement Account to the Full Retirement Sum)'] : ['Available for my next home', $(r.nextPurchase.cash) + ' cash + ' + $(r.nextPurchase.cpf) + ' CPF']],
        [(r.defaults.commission ? 'Commission field left blank, so ' + r.costs.commissionPct + '% is used. ' : '') + (r.defaults.legal ? 'Legal fees left blank, so ' + $(r.costs.legal) + ' is used. ' : '') + 'Commission and legal fees are estimates.', 'Sold at market value (below market value, CPF can require a cash top-up).',
          'The CPF refund includes any CPF housing grants' + (r.owner55 ? ', and any amount pledged for the retirement sum' : '') + '.'].concat(r.type === 'hdb' ? ['SSD isn’t included: most HDB flats are past the SSD period, but a SERS replacement flat can still attract it.'] : []));
    },
    tdsr(i, r) {
      if (r.noTenure) return compose('TDSR estimate', [['Property', KIND[r.kind]]].concat(ownerLines(i.borrowers)), [['Loan tenure', 'none at the standard tenure: it ends at age 65']], []);
      return compose('TDSR estimate',
        [['Property', KIND[r.kind || (i.kind === 'hdb' ? 'hdb' : 'private')]]].concat(ownerLines(i.borrowers)).concat([pos(i.debts) ? ['Existing monthly debts', $(i.debts)] : null, r.msrApplies && pos(i.propertyLoans) ? ['Of which property loans', $(i.propertyLoans) + '/month'] : null, pos(i.tenure) ? ['Tenure wanted', i.tenure + ' years'] : null, ['Housing loans outstanding', String(nn(i.loans))]]),
        [['Income counted (after haircuts)', $(r.B.assessable) + '/month'], ['TDSR limit (55%)', $(r.cap) + '/month'], r.msrApplies ? ['MSR limit (30%)', $(r.msrCap) + '/month'] : null, ['Left for the new loan', $(r.forNew) + '/month' + (r.msrApplies ? ' (' + r.binding.toUpperCase() + ' is the limit)' : '')],
          ['Indicative maximum loan', $(r.maxLoan) + ' over ' + r.tenure.years + ' years at ' + pc(r.rate)], ['Price this loan supports at ' + pc(r.ltv) + ' LTV', $(r.priceAtLtv)]],
        ['Banks apply a 30% haircut to variable and rental income.', r.tenure && r.tenure.lower ? 'Tenure is beyond the standard limit, so the lower LTV applies.' : '', r.msrApplies ? 'An HDB flat is held to both TDSR 55% and MSR 30%; the lower one sets the loan.' : ''].filter(Boolean));
    },
    msr(i, r) {
      if (r.noTenure) return compose('MSR estimate', [['Scenario', SCEN[r.scenario]]].concat(ownerLines(i.borrowers)).concat([pos(i.lease) ? ['Remaining lease', i.lease + ' years'] : null]), [['Loan tenure', r.cause === 'lease' ? 'none: the remaining lease leaves no tenure (lease minus 20 years)' : 'none at this age under the loan rules']], r.notes.map((n) => n.text));
      return compose('MSR estimate',
        [['Scenario', SCEN[r.scenario]], r.scenario === 'hdb-loan' ? ['Household', HOUSEHOLD[r.household]] : null].concat(ownerLines(i.borrowers)).concat([pos(i.propertyLoans) ? ['Existing property loan instalments', $(i.propertyLoans) + '/month'] : null, pos(i.otherDebts) ? ['Other monthly debts', $(i.otherDebts)] : null, pos(i.lease) ? ['Remaining lease', i.lease + ' years'] : null, pos(i.tenure) ? ['Tenure wanted', i.tenure + ' years'] : null, r.scenario !== 'hdb-loan' ? ['Housing loans outstanding', String(nn(i.loans))] : null]),
        [['MSR limit (30%)', $(r.msrCap) + '/month'], r.tdsrCap ? ['TDSR limit (55%)', $(r.tdsrCap) + '/month'] : null, ['Left for the new loan', $(r.forNew) + '/month' + (r.tdsrCap ? ' (' + r.binding.toUpperCase() + ' is the limit)' : '')],
          ['Indicative maximum loan', $(r.maxLoan) + ' over ' + r.tenure.years + ' years at ' + pc(r.rate)], r.ltv < 0.5 ? ['Loan limit with this lease', 'only ' + pc(r.ltv, 1) + ' of the price'] : ['Price this loan supports at ' + pc(r.ltv) + ' LTV', $(r.priceAtLtv)]].concat(r.flat ? [['At the flat price of ' + $(r.flat.price) + (r.flat.valuation ? ' (valuation ' + $(r.flat.valuation) + ')' : ''), 'loan ' + $(r.flat.loan) + ', ' + $(r.flat.down) + ' to pay beyond it' + (r.flat.cashOnly > 0.5 ? ', of which ' + $(r.flat.cashOnly) + ' cash only' + (r.flat.cov > 0.5 && r.flat.cashOnly > r.flat.cov + 0.5 ? ' (including ' + $(r.flat.cov) + ' over valuation)' : r.flat.cov > 0.5 ? ' (over valuation)' : '') : '')]] : []),
        r.notes.map((n) => n.text));
    },
    progressive(i, r) {
      return compose('progressive payment estimate',
        [['Purchase price', $(i.price)], ['Buying', BUYING[r.duty.kind] || BUYING.private], i.entity ? ['Buyer', 'Company or other entity'] : ['Borrower’s age', String(i.age)], i.entity ? null : ['Housing loans outstanding', String(nn(i.loans))], ['Loan', pc(r.ltv) + ' LTV, ' + r.years + ' years at ' + pc(r.rate, 1) + (r.lower && !r.entity ? ' (lower loan limit: ' + (r.lowerWhy === 'tenure' ? 'tenure over 30 years' : r.lowerWhy === 'age' ? 'the loan runs past age 65' : 'longer tenure or past age 65') + ')' : '')], i.cpf !== undefined && i.cpf !== null && i.cpf !== '' ? ['CPF OA available', $(i.cpf)] : null]
          .concat(i.entity ? [] : (i.buyers || []).map((b, k) => [buyerText(b, k).split(': ')[0], buyerText(b, k).split(': ')[1]])),
        [['Within 8 weeks (20%)', $(r.stages[0].amount + r.stages[1].amount)], r.duty.ok ? ['Stamp duty within 14 days', $(r.duty.total) + (r.duty.absd ? ' (ABSD ' + pc(r.duty.absdRate) + ' ' + $(r.duty.absd) + ')' : '')] : null].concat(r.duty.ok ? remitRows(r.duty) : []).concat([['Minimum cash', $(r.cashMin)], ['Cash or CPF', $(r.cpfOrCash)], ['Bank loan', $(r.loanMax)], ['Instalment once fully drawn', $(r.finalMonthly) + '/month']]),
        ['Standard progressive payment schedule; my S&P sets the actual terms.', 'Instalments are indicative and grow as the loan is drawn.'].concat(r.duty.ok ? r.duty.notes.map((n) => n.text) : []));
    },
  };
  const ASK = (tool) => 'Hi Ken, I’m using the ' + tool + ' on Groundwork and have a question.';

  return { mortgage, stampDuty, bsdLines, ssd, saleProceeds, saleEstimate, cpfInterestEstimate, cpfSecondHome, tdsr, msr, progressive, borrowers, bankTenure, tenureNote, tenureMaxText, tenureTierText, tenureLimit, messages, ASK, instal, parseDate: D, parseMoney, parseNum, LIMITS, dutyAt };
});
