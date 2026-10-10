/* ==========================================================================
   HDB Upgrade — BUYING BEFORE SELLING analysis (V1).
   Separate from the sell-first engine: it does not change it and it never produces a "planning price".
   It takes a price the visitor is considering and explains, using only verified rules (rules.js) and the existing
   modelling assumptions, what materially changes when you buy first:
     • the upfront cash/CPF needed before the flat sells,
     • the MAS loan limit and minimum cash (set by the flat's outstanding loan, HDB or bank: MAS Notice 632 para 30(o)),
     • ABSD at the second-property rate, and the conditional refund,
     • when the sale proceeds arrive.
   It never says a plan "works": it says what the main issue appears to be, and what it depends on.
   Pure functions: no DOM, no storage, no network.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rules.js'), require('./assumptions.js'), require('./engine.js'));
  } else {
    root.KPT_HDB_BUYFIRST = factory(root.KPT_RULES, root.KPT_ASSUMPTIONS, root.KPT_HDB);
  }
})(typeof self !== 'undefined' ? self : this, function (RULES, ASSUME, ENG) {
  'use strict';
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
  const pct = (x) => Math.round(x * 100) + '%';
  const round1k = (x) => Math.round(x / 1000) * 1000;

  function analyse(input, overrides) {
    const A = Object.assign({}, ASSUME, overrides || {});
    // Existing sell-first engine, called as-is, only for validation, net sale proceeds and the sell-first ceiling.
    const sf = ENG.analyse(Object.assign({}, input, { timing: 'sell-first' }));
    const flatHasLoan = num(input.outstandingLoan) > 0;
    // Audit A2-11/A3-04: TDSR counts the flat's own loan instalment while you still own it (MAS Notice 645 para 9), so it is required.
    // V1-08: a flat that still has a loan has an instalment above $0, or TDSR would leave that loan out.
    const instOk = typeof input.flatInstalment === 'number' && isFinite(input.flatInstalment) && input.flatInstalment > 0;
    const instErr = flatHasLoan && !instOk ? [{ field: 'flatInstalment', message: input.flatInstalment === 0 ? "Your flat still has a loan, so enter its monthly instalment (more than $0)." : "Enter your flat's monthly loan instalment." }] : [];
    if (sf.state === 'incomplete' || instErr.length) return { state: 'incomplete', errors: (sf.errors || []).concat(instErr) };

    const buyers = input.buyers, income = buyers.reduce((s, b) => s + b.income, 0), ageW = ENG.weightedAge(buyers);
    const debts = num(input.otherMonthlyDebt), cash = num(input.cashSavings), cpf = num(input.otherCpfOa), avail = cash + cpf;
    // Joint buyers pay the highest rate: a Citizen + PR couple who still own the flat pays the PR rate (IRAS).
    const hasPR = input.residency === 'has-pr' || input.residency === 'sc-pr-couple';
    const absdRate = hasPR ? RULES.absdSecondProperty.anyPermanentResident : RULES.absdSecondProperty.allSingaporeCitizens;
    const netProceeds = sf.breakdown.netProceeds;
    const sellFirstRange = sf.planning ? { low: sf.planning.low, high: sf.planning.high, single: sf.planning.single } : null;
    const P = num(input.targetPrice) > 0 ? num(input.targetPrice) : 0;
    const flatInst = flatHasLoan ? num(input.flatInstalment) : 0;
    const out = {
      state: 'ok', hasPrice: P > 0, price: P, absdRate, hasPR, residency: input.residency || 'all-sc', singleBuyer: buyers.length === 1,
      netProceeds: Math.round(netProceeds), sellFirstRange, flatHasLoan, available: avail, cash, cpf,
      // Audit A2-06: an HDB loan counts as an outstanding housing loan (MAS Notice 632 para 30(o)), so a flat with a loan gives one case only.
      ltvCases: flatHasLoan ? ['one'] : ['none'], flatInstalment: flatInst,
      tdsr: RULES.tdsrCeiling, rate: RULES.stressRate,
    };
    if (!P) { out.verdict = 'needs-price'; out.headline = 'Buying first needs a lot more cash upfront.'; return out; }

    // Loan: LTV limit, and the loan income can support under TDSR (55% of income at 4%, standard tenure to age 65).
    const std = RULES.standardStructure;
    const tenure = Math.max(0, Math.min(std.maxTenureYears, Math.floor(std.endAgeLimit - ageW)));
    const loanCap = Math.max(0, RULES.tdsrCeiling * income - debts - flatInst) * ENG.annuityFactor(RULES.stressRate, tenure);
    const bsd = ENG.bsd(P), absd = Math.floor(absdRate * P);
    const cases = out.ltvCases.map((k) => {
      const c = RULES.ltvByOutstandingLoans[k], loan = Math.min(c.ltv * P, loanCap);
      return { key: k, ltv: c.ltv, minCashPct: c.minCashPct, minCash: Math.round(c.minCashPct * P), loan: Math.round(loan),
        incomeLimited: loanCap < c.ltv * P - 0.5, upfront: Math.round(P + bsd + absd + A.purchaseCosts - loan) };
    });
    const ups = cases.map((c) => c.upfront);
    Object.assign(out, { bsd, absd, tenureYears: tenure, loanCap: Math.round(loanCap), cases,
      upfrontLow: Math.min.apply(null, ups), upfrontHigh: Math.max.apply(null, ups), purchaseCosts: A.purchaseCosts });

    // Funds the visitor listed (cash + CPF OA not tied to the flat). Sale proceeds are NOT counted: they arrive after.
    // Audit A2-12: the MAS minimum cash payment has to be cash; CPF can't cover it.
    const provided = avail > 0, minCash = Math.max.apply(null, cases.map((c) => c.minCash));
    out.minCash = minCash;
    out.cashShort = provided && cash < minCash ? Math.round(minCash - cash) : 0;
    out.fundsStatus = !provided ? 'unknown' : avail >= out.upfrontHigh && !out.cashShort ? 'covered' : 'short';
    out.shortfall = out.fundsStatus === 'short' ? { low: Math.max(0, Math.round(out.upfrontLow - avail)), high: Math.max(0, Math.round(out.upfrontHigh - avail)) } : null;
    out.sellFirstCovers = !!(sellFirstRange && P <= sellFirstRange.high);
    out.aboveSellFirst = !!(sellFirstRange && P > sellFirstRange.high);

    if (out.sellFirstCovers) out.verdict = 'sell-first-cleaner';
    else if (out.fundsStatus === 'short') out.verdict = 'funds-short';
    else if (out.fundsStatus === 'covered') out.verdict = 'potentially-workable';
    else out.verdict = 'funds-unknown';
    out.headline = HEADLINE[out.verdict];
    return out;
  }

  const HEADLINE = {
    'sell-first-cleaner': 'Selling first looks like the cleaner route at this price.',
    'funds-short': 'Upfront funds are the key constraint.',
    'potentially-workable': 'Buying first looks potentially workable on upfront funds.',
    'funds-unknown': 'Buying first needs a lot of cash upfront.',
    'needs-price': 'Buying first needs a lot more cash upfront.',
  };

  return { analyse, HEADLINE, pct, round1k };
});
