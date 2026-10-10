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
    // IRAS BSD page: duty is rounded down to the dollar, with a minimum of $1 (audit A1-18).
    // https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/buyer's-stamp-duty-(bsd)
    bsdMinimum: 1,

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
    // IRAS ABSD page (checked 2026-10-09): what counts towards the number of homes already owned.
    // https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer's-stamp-duty-(absd)

    // ABSD remissions and refunds (audit A1-02, A1-04, A1-08, A1-09, A1-10). Checked 2026-10-09.
    absdRemissions: {
      // IRAS "Acquisition of HDB Flats and new Executive Condominium (EC) Units": for an HDB flat or a new EC unit, ABSD is
      // fully remitted if the buyer or any joint buyer is a Singapore Citizen; Singapore PRs buying an HDB flat pay 5%.
      // Granted automatically when HDB approves the purchase (so it is applied upfront, not as a refund).
      // https://www.iras.gov.sg/taxes/stamp-duty/for-property/appeals-refunds-reliefs-and-remissions/common-stamp-duty-remissions-and-reliefs-for-property/Acquisition-of-HDB-Flats-and-new-Executive-Condominium-(EC)-Units
      hdbEc: { anyCitizenRate: 0, hdbPrOnlyRate: 0.05 },
      // IRAS "Remission of ABSD for a Married Couple": full remission at stamping for a married couple with at least one SC
      // spouse, buying jointly in both names only, neither spouse owning any residential property.
      // https://www.iras.gov.sg/taxes/stamp-duty/for-property/appeals-refunds-reliefs-and-remissions/common-stamp-duty-remissions-and-reliefs-for-property/remission-of-absd-for-a-married-couple
      couple: true,
      // IRAS "Foreigners Eligible for ABSD Remission under FTAs": nationals and permanent residents of Iceland, Liechtenstein,
      // Norway or Switzerland, and nationals of the United States, get the same stamp duty treatment as Singapore Citizens.
      // https://www.iras.gov.sg/taxes/stamp-duty/for-property/appeals-refunds-reliefs-and-remissions/common-stamp-duty-remissions-and-reliefs-for-property/foreigners-eligible-for-absd-remission-under-free-trade-agreements-(ftas)
      ftaNationals: ['United States', 'Iceland', 'Liechtenstein', 'Norway', 'Switzerland'],
      // IRAS "ABSD Concession for Single SC Seniors": second home bought on or after 16 Feb 2024 by single SCs aged 55+;
      // refund if the first home is sold within 6 months and the new home is worth less. ABSD is paid upfront first.
      // https://www.iras.gov.sg/taxes/stamp-duty/for-property/appeals-refunds-reliefs-and-remissions/common-stamp-duty-remissions-and-reliefs-for-property/absd-concession-for-single-singapore-citizen-(sc)-seniors
      singleSeniorAge: 55, singleSeniorFrom: '2024-02-16',
    },

    // IRAS / MOF — Seller's Stamp Duty on residential property, by the date the seller acquired it.
    // MOF release 3 Jul 2025 (from 4 Jul 2025, 12.00am); IRAS SSD page for the holding periods by purchase date, the date of
    // acquisition (an option that is subject to signing the S&P doesn't count: a developer purchase starts at the S&P date)
    // and the special dates for divorce, inheritance and HDB family transfers. Checked 2026-10-09.
    // https://www.iras.gov.sg/taxes/stamp-duty/for-property/selling-or-disposing-property/seller's-stamp-duty-(ssd)-for-residential-property
    // Rates apply to the higher of price or market value. Most HDB flats are not affected (the MOP is longer), but IRAS charges
    // SSD on a SERS replacement flat sold within the holding period from its Agreement for Lease.
    ssd: [
      { from: '2025-07-04', to: null, years: 4, rates: [0.16, 0.12, 0.08, 0.04] },
      { from: '2017-03-11', to: '2025-07-03', years: 3, rates: [0.12, 0.08, 0.04] },
      { from: '2011-01-14', to: '2017-03-10', years: 4, rates: [0.16, 0.12, 0.08, 0.04] },
    ],
    // Same IRAS page: homes bought 20 Feb 2010 to 13 Jan 2011 had graduated SSD for 1 year (to 29 Aug 2010) or 3 years.
    // The calculator doesn't compute those rates; it says so for a sale inside those periods (audit A1-16).
    ssdFrom: '2010-02-20',
    ssd2010: [{ from: '2010-02-20', to: '2010-08-29', years: 1 }, { from: '2010-08-30', to: '2011-01-13', years: 3 }],

    // MAS — TDSR 55% and the 4% medium-term rate for residential loans: the planner's values. The binding text is MAS Notice
    // 645 (rev. 21 Aug 2025) para 3 and para 10(b): the loan is tested at the HIGHER of 4% and the loan's own rate (audit A2-04).
    // https://www.mas.gov.sg/regulation/notices/notice-645
    tdsr: BASE.tdsrCeiling,
    stressRate: BASE.stressRate,
    // MAS Notice 645 paras 17-18 and "Calculating TDSR": banks count no more than 70% of variable income (commission,
    // bonuses, allowances) and of rental income (stamped tenancy with at least 6 months left). Para 9: debts include at
    // least 20% of the instalment on a loan the borrower guarantees. Income from financial assets is not modelled.
    // https://www.mas.gov.sg/regulation/explainers/tdsr-for-property-loans/calculating-tdsr  Checked 2026-10-09.
    variableIncomeHaircut: 0.30,
    rentalIncomeHaircut: 0.30,

    // MAS — Mortgage Servicing Ratio: property loan instalments (including the new one) <= 30% of gross monthly income,
    // for HDB flats and for ECs bought from the developer. The MAS 4% floor applies to bank loans. Checked 2026-10-09.
    // MAS Notice 645 para 6-7 (MSR applies to HDB flats and to ECs bought from the developer within the MOP): an HDB flat
    // bought with a bank loan is tested against BOTH TDSR 55% and MSR 30% (audit A2-01).
    msr: 0.30,
    // HDB — Housing loan from HDB (hdb.gov.sg, checked 2026-10-09): loan amount computed at the higher of a 3.0% interest
    // floor and the HDB loan rate; up to 75% LTV (complete resale applications from 20 Aug 2024; flat applications from
    // the Oct 2024 sales exercise); tenure up to the shortest of 25 years, 65 minus the applicants' average age, and the
    // remaining lease minus 20 years; instalments up to 30% of monthly income; OA savings above $20,000 each go to the purchase.
    // https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-hdb
    // The same page: if the remaining lease doesn't cover the youngest applicant to age 95, the 75% LTV is pro-rated. The
    // factor (remaining lease - 20) / (75 - youngest age) reproduces all three worked examples in the MOM/MND release of
    // 9 May 2019 (audit A2-09): https://www.mom.gov.sg/newsroom/press-releases/2019/0509-more-flexibility-to-buy-a-home-for-life
    // HDB also considers current loans and financial commitments (car loans, card bills) when it sets the loan (A2-10).
    hdbLoan: { stressRate: 0.03, ltv: 0.75, maxTenureYears: 25, endAge: 65, leaseBufferYears: 20, oaRetain: 20000, leaseCoverAge: 95 },
    // CPF Board release, 22 Sep 2026: OA interest 2.5% and HDB concessionary loan rate 2.6% for 1 Oct – 31 Dec 2026.
    // https://www.cpf.gov.sg/member/infohub/news/news-releases/government-extends-4-per-cent-interest-rate-floor-on-special-medisave-and-retirement-account-monies-until-31-december-2027
    // https://www.hdb.gov.sg/managing-my-home/finances/loan-matters/interest-rate
    // VALID ONLY TO 31 DEC 2026 (audit A2-17): tests/30-audit-calc.test.js fails after that date until these are re-checked.
    hdbLoanRate: 0.026,
    hdbLoanRateFor: 'Oct–Dec 2026',
    cpfOaRate: 0.025,
    ratesValidUntil: '2026-12-31',
    ratesValidUntilText: '31 Dec 2026',

    // MAS "Loan tenure and LTV limits" (OTPs from 6 Jul 2018; published 5 Jul 2018, checked 2026-10-09); binding text MAS Notice
    // 632 (rev. 21 Aug 2025) para 30(t). Para 30(o): HDB loans count as outstanding housing loans; para 30(ac): the tables apply
    // to each joint borrower. Footnote 6: the income-weighted average age uses income as counted under Notice 645 (after the
    // 30% haircuts) (audit A2-05). https://www.mas.gov.sg/regulation/notices/notice-632
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

    // HDB income ceilings for an HDB loan, HFE letter applications from 24 Aug 2026 (MND/HDB release 23 Aug 2026; HDB loan
    // page): $16,000 for families, $24,000 for extended families, $8,000 for singles buying under the Single Singapore Citizen
    // scheme (singles must be 35 or older). Everyone in the HFE application counts (audit A2-03).
    // https://www.mnd.gov.sg/newsroom/press-releases/view/increase-in-income-ceilings-and-greater-support-for-families-with-children
    // https://www.hdb.gov.sg/buying-a-flat/flat-grant-and-loan-eligibility/housing-loan/housing-loan-from-hdb
    hdbIncomeCeilingFamilies: 16000,
    hdbIncomeCeilings: { family: 16000, extended: 24000, single: 8000 },
    hdbSingleMinAge: 35,
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

    // CPF Board, refunds on selling (audit A3-05, A3-06, A3-08, A3-09). Checked 2026-10-09.
    // Refund = principal withdrawn (including CPF housing grants) + accrued interest, and for an owner 55+ who pledged the
    // property for the Full Retirement Sum, the pledged amount. At market value, no cash top-up of a shortfall; option money
    // received in cash is part of the selling price and goes back to CPF.
    // https://www.cpf.gov.sg/member/home-ownership/using-your-cpf-to-buy-a-home/cpf-refund-when-selling-or-transferring-property
    // Grants over $30,000 may partly go to the Special/Retirement Account and MediSave:
    // https://www.cpf.gov.sg/service/article/do-i-have-to-refund-the-housing-grant-to-my-cpf-account-upon-sale-of-my-property
    // Accrued interest: CPF's prevailing OA rate, compounded annually, from when each amount was withdrawn. The calculator's
    // estimate applies 2.5% to the whole principal from the first year, so it is an upper estimate:
    // https://www.cpf.gov.sg/service/article/why-do-i-need-to-refund-the-accrued-interest-on-the-amount-of-cpf-savings-used-for-my-property
    // 55+: the refund first tops up the Retirement Account to the Full Retirement Sum:
    // https://www.cpf.gov.sg/member/infohub/educational-resources/selling-your-flat-age-55-cpf-refund
    cpfGrantSplitAbove: 30000,

    sources: {
      bsd: 'IRAS, Buyer’s Stamp Duty (rates for properties acquired on or after 15 Feb 2023)',
      absd: 'IRAS, ABSD (rates from 27 Apr 2023) and its remission pages (married couples, HDB flats and new ECs, FTAs, single SC seniors)',
      ssd: 'IRAS, Seller’s Stamp Duty for residential property (all holding periods from 14 Jan 2011); MOF (from 4 Jul 2025)',
      tdsr: 'MAS Notice 645 (rev. 21 Aug 2025): TDSR 55%, the higher of 4% and the loan rate, 30% haircut on variable and rental income',
      msr: 'MAS Notice 645 (MSR 30%); HDB, Housing loan from HDB (3% floor, 75% LTV pro-rated by lease, 25 years, income ceilings)',
      ltv: 'MAS Notice 632 (rev. 21 Aug 2025): loan tenure and loan-to-value limits',
      cpf: 'CPF Board: refund of CPF principal plus accrued interest on sale; no cash top-up if sold at market value; OA rate 2.5%',
      pps: 'Housing Developers Rules: standard progressive payment schedule',
    },
  };
  return R;
});
