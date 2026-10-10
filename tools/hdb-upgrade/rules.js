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
    // MAS — TDSR: total monthly debt repayments (incl. the new loan and every loan still being paid,
    // e.g. the flat's own loan when buying first) <= 55% of income. Variable and rental income count at no more than 70%.
    // Source: MAS Notice 645 (rev. 21 Aug 2025) paras 3, 9, 17-18. Verified 2026-10-09.
    tdsrCeiling: 0.55,

    // MAS — medium-term interest rate floor used to test TDSR for residential loans.
    // 4% p.a. for OTPs granted on/after 30 Sep 2022 (MAS Notice 645 para 10). Verified 2026-10-09.
    stressRate: 0.04,

    // MAS — standard structure: 75% LTV, >=5% cash, tenure <=30 years AND loan must
    // end by the borrower's age 65. Joint borrowers use the income-weighted average age.
    // Source: MAS Notice 632 (rev. 21 Aug 2025) para 30(t) and MAS "Loan tenure and LTV limits" (updated 27 Mar 2024).
    // Verified 2026-10-09 (the 2025 amendment changed wording only; the percentages are unchanged).
    standardStructure: { ltv: 0.75, minCashPct: 0.05, maxTenureYears: 30, endAgeLimit: 65 },

    // MAS — lower-LTV / longer-tenure structure: applies if tenure > 30 years or the loan
    // runs past age 65. 55% LTV, >=10% cash, max tenure 35 years for non-HDB property.
    // Same source as above. Lender assessment may be more restrictive.
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
    // marriedCoupleWithCitizen: IRAS "Remission of ABSD for a married couple" (updated 13 Aug 2026): a married couple
    // with at least one Singapore Citizen spouse, buying in their two names only, where neither owns any other
    // residential property, has the ABSD remitted in full at stamping. Verified 2026-10-09.
    // Selling first counts only if the buyer of your flat exercises the OTP on it before you exercise the OTP on the
    // new home (IRAS ABSD page, part C, updated 27 Aug 2026). Verified 2026-10-09.
    absd: { allSingaporeCitizens: 0, anyPermanentResident: 0.05, marriedCoupleWithCitizen: 0 },

    // CPF — a buyer aged 55+ has housing refunds applied to the Retirement Account first,
    // which can reduce usable CPF. Not modelled; triggers the Indicative state.
    cpfRetirementAccountAge: 55,


    // ---- Buying BEFORE selling (used only by buyfirst.js; the sell-first engine does not read these) ----

    // IRAS / MOF — ABSD on/after 27 Apr 2023 for a buyer who already owns ONE other residential
    // property (an HDB flat counts). Singapore Citizen 20%, Permanent Resident 30%.
    // Source: MOF "Measures for a Sustainable Property Market", 26 Apr 2023; IRAS ABSD page (updated 27 Aug 2026).
    // Joint buyers pay the highest buyer's rate, so a Citizen + PR couple pays 30%. Verified 2026-10-09.
    absdSecondProperty: { allSingaporeCitizens: 0.20, anyPermanentResident: 0.30 },

    // MOF — ABSD refund. "Married couples with at least one SC spouse, who jointly purchase a second residential
    // property, can continue to apply for a refund of ABSD, subject to conditions", including selling the first
    // residential property within 6 months after the purchase date (completed property) or after the TOP/CSC
    // issuance date (uncompleted property). Same source/date as above. The tool never assumes the refund
    // is granted and never nets it off the upfront figure.
    absdRefund: { months: 6, whoText: 'married couples with at least one Singapore Citizen spouse buying jointly' },

    // MAS — LTV limit and MINIMUM CASH downpayment by number of the borrower's outstanding housing loans
    // (standard structure; loans with OTP on/after 6 Jul 2018). MAS Notice 632 (rev. 21 Aug 2025) para 30(t).
    // Para 30(o): an "outstanding credit facility" includes a housing loan from the HDB, a bank or a moneylender that
    // has been drawn and not fully repaid. So when the flat still has a loan (HDB or bank), the 'one' limits apply.
    // Paras 8-9: the bank applies the 'none' limits only if, before it pays out the new loan, the flat's loan has been
    // repaid or (for an HDB flat) the borrower gives it HDB's letter approving the flat's sale. Verified 2026-10-09.
    ltvByOutstandingLoans: {
      none: { ltv: 0.75, minCashPct: 0.05 },
      one:  { ltv: 0.45, minCashPct: 0.25 },
    },

    // CPF — buying while you still own a home: only the Ordinary Account savings above the applicable Basic or Full
    // Retirement Sum can be used. CPF use is pro-rated if the remaining lease does not cover the youngest buyer to
    // age 95. Source: CPF "How much CPF OA can you use for your next home" (updated 1 Sep 2026) and "How much CPF
    // savings you can use for your home purchase" (updated 26 May 2026). Stated as rules; not computed (the tool
    // does not know the visitor's retirement sums or the lease). Verified 2026-10-09.
    cpfLeaseAge: 95,

    // HDB — the flat's 5-year minimum occupation period must be met before it can be sold on the open market or a
    // private home bought. HDB letter to agencies (13 Jan 2026). Stated as an assumption; not checked.
    mopYears: 5,

    meta: { lastVerified: '2026-10-09' },
  };
});
