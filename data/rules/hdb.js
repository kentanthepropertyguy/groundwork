/* =====================================================================
   HDB RULES (regulatory) — minimum occupation period before an HDB owner
   can buy private residential property / sell the flat.
   ===================================================================== */

window.KPT_RULES = window.KPT_RULES || {};
window.KPT_RULES.hdb = {
  checked_on: "2026-10-04",
  mop_years: { standard: 5, dbss: 5, plus: 10, prime: 10, fresh_start: 20 },
  spr_must_sell_within_months_if_buying_private: 6,   // buy-before-sell only (not modelled in V1)
  source: "https://www.hdb.gov.sg/cs/infoweb/residential/living-in-an-hdb-flat/acquiring-private-property"
};
