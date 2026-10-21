/* ==========================================================================
   Shared development register: the ONE place that decides which URA transactions are admitted and which class they belong to.
   Used by build-project-stats.js (Research), build-map-data.js (Map), build-find-index.js (FIND) and the registry/suggestion builders,
   so every page works from the same development list and the same classification.

   Classes (config.json "classes"): condo (Condominium, Apartment), ec (Executive Condominium), cluster (Strata Terrace / Semi-detached / Detached).
   Rules
     - A transaction belongs to exactly ONE class, decided by its URA property type. Nothing is ever counted in two classes.
     - Admission is unchanged from the condo pipeline: strata area, single-unit caveat, known sale type and market segment, positive price and area.
       Non-strata landed homes (Terrace / Semi-detached / Detached on land) stay out: they are researched by street in the Value Explorer.
     - A development is one URA project name. Its HEADLINE class is the class with the most transactions (a tie goes to condo, then ec),
       so every existing condo development keeps exactly its present figures. Transactions of any other class under the same name are
       counted in `also` and are NOT pooled into the headline prices.
   ========================================================================== */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.KPT_REGISTER = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ORDER = ['condo', 'ec', 'cluster'];

  function typeMap(cfg) {
    const m = new Map();
    ORDER.forEach((c) => (((cfg.classes || {})[c] || {}).propertyTypes || []).forEach((pt) => {
      if (m.has(pt)) throw new Error('Property type "' + pt + '" is listed under two classes (' + m.get(pt) + ' and ' + c + ').');
      m.set(pt, c);
    }));
    return m;
  }
  function checkConfig(cfg) {
    const m = typeMap(cfg), condo = (cfg.classes && cfg.classes.condo && cfg.classes.condo.propertyTypes) || [];
    if (JSON.stringify(condo.slice().sort()) !== JSON.stringify((cfg.propertyTypes || []).slice().sort())) throw new Error('config.propertyTypes (the pooled condo list) must equal classes.condo.propertyTypes.');
    ORDER.forEach((c) => { if (!(cfg.classes && cfg.classes[c])) throw new Error('config.classes.' + c + ' is missing.'); });
    return m;
  }
  const classOf = (cfg, propertyType) => typeMap(cfg).get(propertyType) || null;

  // Returns { ok:false, reason } or { ok:true, cls, sale, price, sqm, ym } for one raw transaction. `segment` is the project's market segment.
  function admit(t, segment, tmap) {
    const m = /^(\d{2})(\d{2})$/.exec(String(t.contractDate || ''));
    if (!m) return { ok: false, reason: 'bad contract date' };
    const cls = tmap.get(t.propertyType);
    if (!cls) return { ok: false, reason: 'property type not in scope (' + (t.propertyType || '?') + ')' };
    if (t.typeOfArea !== 'Strata') return { ok: false, reason: 'not strata area' };
    if (String(t.noOfUnits) !== '1') return { ok: false, reason: 'multi-unit caveat' };
    const sale = +t.typeOfSale; if (![1, 2, 3].includes(sale)) return { ok: false, reason: 'unknown sale type' };
    if (!['OCR', 'RCR', 'CCR'].includes(segment)) return { ok: false, reason: 'unknown market segment' };
    const price = Number(t.price), sqm = Number(t.area);
    if (!(price > 0) || !(sqm > 0)) return { ok: false, reason: 'missing price or area' };
    return { ok: true, cls, sale, price, sqm, ym: (2000 + +m[2]) * 12 + (+m[1] - 1) };
  }

  // counts: { condo:n, ec:n, cluster:n } -> headline class (most transactions; ties go to the earlier class in ORDER).
  function headline(counts) {
    let best = null;
    ORDER.forEach((c) => { if ((counts[c] || 0) > (best ? counts[best] : 0)) best = c; });
    return best;
  }
  // rows: [{cls,...}] for ONE development -> { cls, rows (headline class only), also: {cls:n} | undefined }
  function split(rows) {
    const counts = {}; rows.forEach((r) => { counts[r.cls] = (counts[r.cls] || 0) + 1; });
    const cls = headline(counts), also = {};
    ORDER.forEach((c) => { if (c !== cls && counts[c]) also[c] = counts[c]; });
    return { cls, rows: rows.filter((r) => r.cls === cls), also: Object.keys(also).length ? also : undefined, counts };
  }
  // Reviewed project-name lists (project-config.json): 'exclude' (catch-all buckets) and 'hold' (awaiting review).
  function nameScreen(pc) {
    const ex = new Map(pc.exclude.map((e) => [e.name, e])), ho = new Map(pc.hold.map((e) => [e.name, e]));
    return (name) => (ex.has(name) ? 'exclude' : ho.has(name) ? 'hold' : null);
  }
  // Name as shown to buyers. The id is always made from the name exactly as URA sent it; nameFixes only repairs source-encoding damage.
  const shownName = (name, pc) => ((pc.nameFixes || {})[name] && name !== '_note') ? pc.nameFixes[name] : name;
  return { ORDER, shownName, typeMap, checkConfig, classOf, admit, headline, split, nameScreen };
});
