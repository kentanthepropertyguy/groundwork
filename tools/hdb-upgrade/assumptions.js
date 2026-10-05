/* ==========================================================================
   HDB Upgrade — MODELLING ASSUMPTIONS (not government rules).
   These are the knobs we are testing. None of them is yet Ken's advisory
   methodology. Change them here; the engine reads everything from this file.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPT_ASSUMPTIONS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    // 'standard' = planning range uses the standard MAS structure only (loan ends by 65,
    //              <=30 years, 75% LTV, 5% cash). Never optimised across structures.
    // 'bestOf'   = optimise across standard and lower-LTV structures (for testing only).
    planningStructure: 'standard',

    // Share of gross income the planning range allows for debt servicing (all debts).
    incomeCapLow: 0.35,
    incomeCapHigh: 0.45,

    // Cash held back for renovation/moving/emergencies. Reduces funds available for the
    // purchase AND counts as cash in the liquidity (minimum-cash) check.
    reserve: 50000,

    // Planning tenure cap, applied after the regulatory limits.
    planningTenureCap: 25,

    // Interest rate used for planning-side instalment facts (reuses the MAS stress rate).
    planningRate: 0.04,

    // Tenure used for the lender-dependent "longer tenure" possibility (null = planningTenureCap).
    longerTenureYears: null,

    // Show the longer-tenure possibility only if it lifts the top of the range by at least this much.
    longerTenureMinUpliftPct: 0.05,

    // Selling costs: agent commission + GST + conveyancing. Not government-set.
    commissionRate: 0.02,
    gstRate: 0.09,
    saleLegalFees: 3000,

    // Legal + valuation fees on the purchase. Not government-set.
    purchaseCosts: 5000,

    // Planning figures are rounded DOWN to this increment.
    roundTo: 10000,
  };
});
