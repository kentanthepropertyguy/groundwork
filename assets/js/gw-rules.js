/* ==========================================================================
   GROUNDWORK — regulatory rules for the calculators (R2, Ken 9 Oct 2026).
   ONE source of truth: the rules the HDB Upgrade Planner already uses (tools/hdb-upgrade/rules.js: BSD bands, TDSR 55%,
   the 4% MAS stress rate, the standard loan structure, ABSD for SC/PR first and second properties) are read from that
   file, never copied. This file only ADDS what the planner does not cover, each with its source and the date checked.
   Nothing here is a modelling choice: defaults the visitor can change (commission, legal fees, interest rate) are
   labelled as estimates in the calculators, and the planner's selling-cost estimates come from tools/hdb-upgrade/assumptions.js.
   UMD: window.GW_RULES (after rules.js) in the browser; in Node, require() returns the factory: call it with rules.js.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory; // Node: call with the planner's rules.js
  else root.GW_RULES = factory(root.KPT_RULES);
})(typeof self !== 'undefined' ? self : this, function (BASE) {
  'use strict';
  if (!BASE || !BASE.bsdBands) throw new Error('GW_RULES needs the planner rules (tools/hdb-upgrade/rules.js) loaded first');
  const R = {
    base: BASE, // the planner's rules, unchanged
    checked: '2026-10-09',

    // IRAS / MOF — Buyer's Stamp Duty, residential, for properties acquired on or after 15 Feb 2023: the planner's bands.
    // On the higher of price or market value, rounded down to the dollar (as the planner does).
    bsdBands: BASE.bsdBands,
    bsdFrom: '2023-02-15',

    // MAS / MOF / MND joint release "Measures for a Sustainable Property Market", 26 Apr 2023: ABSD from 27 Apr 2023.
    // Keyed by the number of residential properties the buyer ALREADY owns (an HDB flat counts). Joint buyers pay the
    // highest applicable rate on the whole price. SC/PR 0- and 1-property rates are the planner's, read from rules.js.
    absdFrom: '2023-04-27',
    absd: {
      SC: [BASE.absd.allSingaporeCitizens, BASE.absdSecondProperty.allSingaporeCitizens, 0.30],
      PR: [BASE.absd.anyPermanentResident, BASE.absdSecondProperty.anyPermanentResident, 0.35],
      FR: [0.60, 0.60, 0.60],
      ENTITY: [0.65, 0.65, 0.65],
    },
    absdRefundMonths: BASE.absdRefund.months, // married couples with at least one SC spouse, buying a second home jointly

    // IRAS / MOF — Seller's Stamp Duty on residential property, by the date the seller acquired it.
    // MOF release 3 Jul 2025 (from 4 Jul 2025, 12.00am); IRAS (ask.gov.sg) holding periods by purchase date. Checked 2026-10-09.
    // Rates apply to the higher of price or market value. HDB flats are not affected in practice (MOP is 5 years).
    ssd: [
      { from: '2025-07-04', to: null, years: 4, rates: [0.16, 0.12, 0.08, 0.04] },
      { from: '2017-03-11', to: '2025-07-03', years: 3, rates: [0.12, 0.08, 0.04] },
      { from: '2011-01-14', to: '2017-03-10', years: 4, rates: [0.16, 0.12, 0.08, 0.04] },
    ],

    // MAS — TDSR 55% and the 4% medium-term rate for residential loans: the planner's values.
    tdsr: BASE.tdsrCeiling,
    stressRate: BASE.stressRate,
    // MAS "Calculating TDSR": banks apply a minimum 30% haircut to variable income (commission, bonuses, allowances)
    // and to rental income. Checked 2026-10-09.
    variableIncomeHaircut: 0.30,
    rentalIncomeHaircut: 0.30,

    // MAS — Mortgage Servicing Ratio: property loan instalments (including the new one) <= 30% of gross monthly income,
    // for HDB flats and for ECs bought from the developer. The MAS 4% floor applies to bank loans. Checked 2026-10-09.
    msr: 0.30,
    // HDB — Housing loan from HDB (hdb.gov.sg, checked 2026-10-09): loan amount computed at the higher of a 3.0% interest
    // floor and the HDB loan rate; up to 75% LTV (complete resale applications from 20 Aug 2024; flat applications from
    // the Oct 2024 sales exercise); tenure up to the shortest of 25 years, 65 minus the applicants' average age, and the
    // remaining lease minus 20 years; instalments up to 30% of monthly income; OA savings above $20,000 each go to the purchase.
    hdbLoan: { stressRate: 0.03, ltv: 0.75, maxTenureYears: 25, endAge: 65, leaseBufferYears: 20, oaRetain: 20000 },
    // CPF Board release, 22 Sep 2026: OA interest 2.5% and HDB concessionary loan rate 2.6% for 1 Oct – 31 Dec 2026.
    hdbLoanRate: 0.026,
    hdbLoanRateFor: 'Oct–Dec 2026',
    cpfOaRate: 0.025,

    // MAS "Loan tenure and LTV limits" (OTPs from 6 Jul 2018; published 5 Jul 2018, checked 2026-10-09).
    // Standard: tenure within 30 years (25 for HDB flats) and ending by 65. Longer, or past 65: the lower limit.
    // Maximum tenure: 30 years for HDB flats, 35 years for other property. Joint borrowers: income-weighted average age.
    bankLtv: {
      standard: [{ ltv: 0.75, minCash: 0.05 }, { ltv: 0.45, minCash: 0.25 }, { ltv: 0.35, minCash: 0.25 }],
      lower: [{ ltv: 0.55, minCash: 0.10 }, { ltv: 0.25, minCash: 0.25 }, { ltv: 0.15, minCash: 0.25 }],
      standardTenure: { private: 30, hdb: 25 },
      maxTenure: { private: 35, hdb: 30 },
      endAge: 65,
    },
    // Same MAS page: if the borrower is not an individual (e.g. a company), the LTV limit is 15%.
    entityLtv: 0.15,

    // HDB income ceiling for families buying with an HDB loan or a new flat: raised from $14,000 to $16,000 for HFE letter
    // applications from 24 Aug 2026 (MND, National Day Rally 2026). Other household types have their own ceilings.
    hdbIncomeCeilingFamilies: 16000,
    hdbIncomeCeilingFrom: '2026-08-24',

    // Housing Developers Rules (Housing Developers (Control and Licensing) Act): the standard progressive payment schedule
    // for uncompleted private homes and ECs. 5% on the Option to Purchase, 15% to make 20% within 8 weeks (on signing
    // the S&P), then by construction stage. Stamp duty is payable within 14 days of signing. Your S&P sets the actual terms.
    pps: [
      { id: 'otp', name: 'Option to Purchase (booking fee)', pct: 0.05 },
      { id: 'snp', name: 'Signing the S&P (within 8 weeks)', pct: 0.15 },
      { id: 'foundation', name: 'Foundation completed', pct: 0.10 },
      { id: 'frame', name: 'Reinforced concrete framework', pct: 0.10 },
      { id: 'walls', name: 'Partition walls', pct: 0.05 },
      { id: 'roof', name: 'Roofing and ceiling', pct: 0.05 },
      { id: 'fittings', name: 'Door and window frames, wiring, plumbing', pct: 0.05 },
      { id: 'roads', name: 'Car park, roads and drains', pct: 0.05 },
      { id: 'top', name: 'Temporary Occupation Permit (TOP)', pct: 0.25 },
      { id: 'csc', name: 'Certificate of Statutory Completion', pct: 0.15 },
    ],

    // GST on an agent's commission (IRAS: 9% from 1 Jan 2024), as the planner's assumptions already use.
    gst: 0.09,

    sources: {
      bsd: 'MOF, BSD rates for properties acquired on or after 15 Feb 2023',
      absd: 'MAS/MOF/MND, Measures for a Sustainable Property Market (ABSD from 27 Apr 2023)',
      ssd: 'MOF, Extension of the holding period of SSD (from 4 Jul 2025); IRAS',
      tdsr: 'MAS, Calculating TDSR (55%, 4% medium-term rate, 30% haircut on variable and rental income)',
      msr: 'MAS, New housing loans (MSR 30%); HDB, Housing loan from HDB (3% floor, 75% LTV, 25 years)',
      ltv: 'MAS, Loan tenure and loan-to-value limits (OTPs from 6 Jul 2018)',
      cpf: 'CPF Board: refund of CPF principal plus accrued interest on sale; no cash top-up if sold at market value; OA rate 2.5%',
      pps: 'Housing Developers Rules: standard progressive payment schedule',
    },
  };
  return R;
});
