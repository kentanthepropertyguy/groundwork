/* =====================================================================
   CPF HOUSING RULES (regulatory) — refunds on sale, usage limits.
   ===================================================================== */

window.KPT_RULES = window.KPT_RULES || {};
window.KPT_RULES.cpfHousing = {
  checked_on: "2026-10-04",

  /* On sale, the CPF used for the property plus accrued interest generally has
     to be refunded to CPF, after the outstanding housing loan is repaid,
     subject to CPF's rules where sale proceeds are insufficient (below). */
  refund_on_sale: {
    includes: "principal + accrued interest (+ any pledged amount for 55+)",
    accrued_interest_rate: 0.025,   // CPF OA rate used for accrued interest
    source: "https://www.cpf.gov.sg/service/article/how-much-do-i-need-to-refund-to-my-cpf-account-when-selling-transferring-my-property"
  },

  /* If the price, after repaying the outstanding housing loan, can't cover the
     full CPF refund, the shortfall need not be topped up in cash, provided the
     property was sold at market value (CPF Board). */
  no_cash_top_up_if_sold_at_market_value: {
    value: true,
    source: "https://www.cpf.gov.sg/member/infohub/educational-resources/sales-proceeds-after-selling-your-home"
  },

  /* Owners aged 55+: refunds first top up the Retirement Account to the
     member's applicable retirement sum; only the surplus goes to the Ordinary
     Account. The applicable sum depends on the YEAR THE MEMBER TURNED 55, so
     there is no single figure for everyone aged 55+.
     V1 does NOT model this (needs each member's cohort and RA balance) — it
     labels the result preliminary and warns the user. */
  refund_age_55_plus_to_ra_first: {
    value: true,
    from_age: 55,
    source: "https://www.cpf.gov.sg/member/infohub/educational-resources/selling-your-flat-age-55-cpf-refund"
  },

  /* Retirement sums for members turning 55 in 2026 ONLY. Reference data —
     do NOT apply to all buyers aged 55+ (each cohort has its own sums).
     Not displayed or used in V1 calculations. */
  retirement_sums_2026: {
    brs: 110200,
    frs: 220400,
    ers: 440800,
    verified: "Independently confirmed by Ken Tan, 4 Oct 2026",
    source: "https://www.dbs.com.sg/personal/articles/nav/retirement/cpf-changes-in-2026"
  },

  /* The minimum cash downpayment (5% or 10%) cannot be paid with CPF. */
  min_cash_portion_not_cpf: true,

  /* CPF use is pro-rated if the remaining lease doesn't cover the youngest
     CPF-using buyer to age 95. V1 ASSUMES the lease is sufficient
     (new 99-year launch or freehold) and says so on screen. */
  lease_to_age: 95,
  usage_source: "https://www.cpf.gov.sg/propertyusage"
};
