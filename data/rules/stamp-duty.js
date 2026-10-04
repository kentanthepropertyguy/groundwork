/* =====================================================================
   STAMP DUTY RULES — shared by every calculator that needs BSD/ABSD.
   When IRAS changes the rates, update THIS file only, then every
   calculator is correct the same day.

   NOT YET FILLED IN. When the stamp duty calculator is built (Phase 2),
   fill in the current rates from iras.gov.sg and record the source and
   effective date. Calculators must show "Rates effective <date>".
   ===================================================================== */

window.KPT_RULES = window.KPT_RULES || {};
window.KPT_RULES.stampDuty = {
  effective_from: null,          // "YYYY-MM-DD"
  source: "https://www.iras.gov.sg/",
  verified_on: null,             // date you last checked
  bsd_residential: [
    // { up_to: 180000, rate: 0.01 }, ...   tiered bands; last band up_to: null
  ],
  absd: {
    // "SC":  [first, second, third_and_after],
    // "SPR": [...],
    // "foreigner": [...],
    // "entity": [...]
  }
};
