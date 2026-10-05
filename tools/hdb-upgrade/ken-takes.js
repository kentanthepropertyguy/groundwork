/* ==========================================================================
   Ken's Take — condition + wording, written by Ken. SHIPS EMPTY.
   Nothing here is generated. If no take matches a result, the Ken's Take
   section is simply not shown and "Ask Ken" remains.

   Add entries like this (every condition is optional; all given must match):

   {
     id: 'cash-bound-young',
     when: {
       states: ['single'],            // result states
       diagnosis: ['cash'],           // 'income' | 'cash' | 'mixed' | 'minimum-cash'
       minWeightedAge: 25, maxWeightedAge: 39,
       hasPR: false,                  // true / false
       hasDebts: false,               // other monthly debts entered
       hasLongerTenure: false,        // lender-dependent possibility shown
       cashStatus: ['not-confirmed']  // 'confirmed' | 'not-confirmed' | 'short'
     },
     text: 'Your own words here.'
   }
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPT_KEN_TAKES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return [];
});
