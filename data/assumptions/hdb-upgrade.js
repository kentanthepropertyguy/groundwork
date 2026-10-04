/* =====================================================================
   KEN PROPERTY TOOLS — ASSUMPTIONS for the HDB Upgrade Calculator.
   These are NOT government, MAS, bank or financial-advice rules.
   They are editable defaults (users can change them on the page).
   Keep regulatory values in data/rules/, never here.
   ===================================================================== */

window.KPT_ASSUMPTIONS = window.KPT_ASSUMPTIONS || {};
window.KPT_ASSUMPTIONS.hdbUpgrade = {
  updated: "2026-10-04",

  /* Market assumptions (editable) */
  market: {
    mortgage_rate: {
      value: 0.025,
      as_of: "Sep 2026",
      note: "For the estimated monthly instalment only. Not a guaranteed or available rate. Headline packages in Sep 2026 were about 1.40%–2.75%.",
      reference: "https://www.redbrick.sg/blog/best-home-loan-singapore/"
    },
    agent_fee_pct: { value: 0.02, note: "Seller's agent fee, before GST. Not regulated; negotiable." },
    other_selling_costs: { value: 3000, note: "Estimated legal and other selling costs." },
    purchase_fees_buffer: { value: 5000, note: "Estimated legal and valuation costs on the purchase." },
    bank_max_age: { value: 75, note: "Typical latest age banks lend to, for the longer-tenure (55% LTV) scenario. Bank practice, not an MAS rule." }
  },

  /* Ken's Planning Budget — a conservative planning scenario (editable).
     Not a government, MAS, bank or financial-advice threshold. */
  planning: {
    rate: { value: 0.04, note: "Planning mortgage rate." },
    debt_to_income: { value: 0.35, note: "New mortgage + existing monthly debts, as a share of gross household income." },
    buffer_months: { value: 6, note: "Months of (mortgage + existing debts) kept aside in cash." }
  },

  /* CPF refund estimator (approximate) */
  cpf_estimator: {
    round_to: 5000,
    method: "Assumes CPF was used evenly over the years owned, compounding at the CPF accrued-interest rate. Approximate only."
  }
};
