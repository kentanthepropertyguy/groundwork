/* =====================================================================
   LOAN LIMIT RULES — TDSR, MSR, LTV, stress-test rate, tenure caps.
   Shared by the affordability, HDB upgrade and instalment calculators.

   NOT YET FILLED IN. Fill in from MAS / HDB sources when the first
   calculator that needs them is built, with source and date.
   ===================================================================== */

window.KPT_RULES = window.KPT_RULES || {};
window.KPT_RULES.loanLimits = {
  effective_from: null,
  source: "https://www.mas.gov.sg/",
  verified_on: null,
  tdsr: null,                    // e.g. 0.55
  msr: null,                     // HDB/EC only
  medium_term_rate_private: null,// stress-test rate used for TDSR
  ltv_bank: [
    // { outstanding_loans: 0, ltv: 0.75, min_cash: 0.05 }, ...
  ],
  max_tenure_years_private: null
};
