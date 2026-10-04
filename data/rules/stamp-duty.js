/* =====================================================================
   STAMP DUTY RULES (regulatory) — shared by every calculator.
   Update THIS file when IRAS/MOF change rates; every calculator follows.
   Each block records its source, effective date and when it was checked.
   ===================================================================== */

window.KPT_RULES = window.KPT_RULES || {};
window.KPT_RULES.stampDuty = {
  checked_on: "2026-10-04",

  /* Buyer's Stamp Duty — residential property. Marginal bands. */
  bsd_residential: {
    effective_from: "2023-02-15",
    source: "https://www.mof.gov.sg/news-resources/newsroom/buyer-s-stamp-duty-bsd-rates-to-be-raised-for-higher-value-properties/",
    note: "Applies to residential properties acquired on or after 15 Feb 2023.",
    bands: [
      { up_to: 180000,  rate: 0.01 },   // first $180,000
      { up_to: 360000,  rate: 0.02 },   // next $180,000
      { up_to: 1000000, rate: 0.03 },   // next $640,000
      { up_to: 1500000, rate: 0.04 },   // next $500,000
      { up_to: 3000000, rate: 0.05 },   // next $1,500,000
      { up_to: null,    rate: 0.06 }    // above $3,000,000
    ]
  },

  /* Additional Buyer's Stamp Duty — individuals. Index 0 = 1st property,
     1 = 2nd, 2 = 3rd and subsequent. Foreigners/entities not used in V1. */
  absd: {
    effective_from: "2023-04-27",
    source: "https://www.mas.gov.sg/news/media-releases/2023/measures-for-a-sustainable-property-market",
    verified: "IRAS rules independently confirmed by Ken Tan, 4 Oct 2026",
    rates: {
      SC:  [0.00, 0.20, 0.30],
      SPR: [0.05, 0.30, 0.35]
    },
    joint_purchase_rule: "highest",   // joint buyers with different profiles pay the highest applicable rate
    /* Married couple, at least one Singapore Citizen, buying their first
       residential property jointly, neither owning another: ABSD remitted. */
    married_sc_spr_first_property_remission: true,
    remission_source: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/appeals-refunds-reliefs-and-remissions/common-stamp-duty-remissions-and-reliefs-for-property/remission-of-absd-for-a-married-couple"
  },

  /* Timing: stamp duty is due within 14 days. CPF OA can pay BSD/ABSD but
     usually by reimbursement later, so buyers may need cash first. */
  payment: {
    due_within_days: 14,
    cpf_can_pay: true,
    cpf_usually_reimbursed_later: true,
    source: "https://www.cpf.gov.sg/service/article/which-property-related-fees-can-i-use-my-cpf-savings-for"
  }
};
