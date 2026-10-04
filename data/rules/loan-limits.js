/* =====================================================================
   LOAN RULES (regulatory) — TDSR, stress-test rate, LTV, tenure.
   Shared by affordability, HDB upgrade and instalment calculators.
   Note: MAS web pages could not be machine-read on 4 Oct 2026; values
   were confirmed via the MAS sources below and major-bank explainers.
   ===================================================================== */

window.KPT_RULES = window.KPT_RULES || {};
window.KPT_RULES.loanLimits = {
  checked_on: "2026-10-04",

  /* Total Debt Servicing Ratio: all monthly debt repayments vs gross income */
  tdsr: {
    value: 0.55,
    effective_from: "2021-12-16",
    source: "https://www.dbs.com.sg/personal/articles/nav/budget-spend/what-to-know-about-TDSR"
  },

  /* Medium-term ("stress-test") interest rate floor used in TDSR for
     residential property loans. Banks may assess at a higher rate. */
  medium_term_rate_floor: {
    value: 0.04,
    effective_from: "2022-09-30",
    source: "https://www.mas.gov.sg/news/parliamentary-replies/2022/reply-to-parliamentary-question-on-setting-total-debt-servicing-ratio-medium-term-interest-rate-floor-at-4-per-cent-per-annum"
  },

  /* Variable income (commission, bonus, allowances): at least this haircut,
     based on a 12-month average. */
  variable_income_haircut: {
    value: 0.30,
    source: "https://www.dbs.com.sg/personal/articles/nav/budget-spend/what-to-know-about-TDSR"
  },

  /* Loan-to-value for a buyer with NO other outstanding housing loan
     (sell-first upgraders). Bank loans, non-HDB property.
     Tier A applies if tenure <= 30 years AND the loan ends by age 65
     (income-weighted average age for joint borrowers). Otherwise Tier B. */
  ltv_first_loan: {
    effective_from: "2018-07-06",
    source: "https://www.mas.gov.sg/regulation/explainers/new-housing-loans/loan-tenure-and-loan-to-value-limits",
    tier_a: { ltv: 0.75, min_cash: 0.05, max_tenure_years: 30, loan_must_end_by_age: 65 },
    tier_b: { ltv: 0.55, min_cash: 0.10, max_tenure_years: 35 }
  },

  max_tenure_years_private: 35,
  age_method: "income-weighted average age",   // sum(age_i * income_i) / sum(income_i)
  msr_applies_to_private: false                 // MSR is for HDB/EC only
};
