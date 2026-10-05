/* ==========================================================================
   HDB Upgrade — REGULATORY RULES ONLY.
   Nothing in this file is a Ken Property Tools opinion or modelling choice.
   Every value has a source and the date it was last checked. If a rule
   changes, edit it here and update `verified`. Modelling assumptions live
   in assumptions.js, never here.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPT_RULES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    // MAS — TDSR: total monthly debt repayments (incl. the new loan) <= 55% of income.
    // Source: MAS TDSR rules. Verified 2026-10-05 (via MAS 2022 media release).
    tdsrCeiling: 0.55,

    // MAS — medium-term interest rate floor used to test TDSR for residential loans.
    // 4% p.a. for OTPs granted on/after 30 Sep 2022. Verified 2026-10-05.
    stressRate: 0.04,

    // MAS — standard structure: 75% LTV, >=5% cash, tenure <=30 years AND loan must
    // end by the borrower's age 65. Joint borrowers use the income-weighted average age.
    // Source: MAS "Loan tenure and LTV limits" (OTPs on/after 6 Jul 2018). Verified 2026-10-05.
    // NOTE: the live MAS page could not be re-opened; confirm no later amendment before launch.
    standardStructure: { ltv: 0.75, minCashPct: 0.05, maxTenureYears: 30, endAgeLimit: 65 },

    // MAS — lower-LTV / longer-tenure structure: applies if tenure > 30 years or the loan
    // runs past age 65. 55% LTV, >=10% cash, max tenure 35 years for non-HDB property.
    // Same source/caveat as above. Lender assessment may be more restrictive.
    lowerLtvStructure: { ltv: 0.55, minCashPct: 0.10, maxTenureYears: 35 },

    // IRAS — Buyer's Stamp Duty, residential, on/after 15 Feb 2023. Computed on the higher
    // of price or market value; rounded down. Verified 2026-10-05.
    bsdBands: [
      { width: 180000, rate: 0.01 },
      { width: 180000, rate: 0.02 },
      { width: 640000, rate: 0.03 },
      { width: 500000, rate: 0.04 },
      { width: 1500000, rate: 0.05 },
      { width: Infinity, rate: 0.06 },
    ],

    // IRAS — ABSD on/after 27 Apr 2023, for a buyer who owns NO other residential property
    // at purchase (the sell-first case). Joint buyers pay the highest buyer's rate on the
    // whole price. Foreigners/entities and second-property rates are out of V1 scope.
    // Verified 2026-10-05.
    absd: { allSingaporeCitizens: 0, anyPermanentResident: 0.05 },

    // CPF — a buyer aged 55+ has housing refunds applied to the Retirement Account first,
    // which can reduce usable CPF. Not modelled; triggers the Indicative state.
    cpfRetirementAccountAge: 55,

    meta: { lastVerified: '2026-10-05' },
  };
});
