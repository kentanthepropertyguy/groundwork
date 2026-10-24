/* ==========================================================================
   GROUNDWORK — automatic checks on a layout table against URA's own records (pure functions, Node).

   A layout table (brochure extraction, agency list or anything else) is only as good as its fit to what URA recorded. For one development:
     completeness  rows with a bedroom count and an area, out of all rows (incomplete rows are never used)
     explained     share of the development's sales whose whole-sqm area fits at least one layout (a good table explains nearly all)
     repeated gaps sale areas with 3+ sales that fit no layout (a layout the table is missing, or a mis-read area)
     unused        layouts no sale has fitted in five years (often PES / penthouse variants; many unused rows suggest mis-reads)
     rental        share of URA rental contracts whose declared bedroom count matches a layout in their size band (of the contracts
                   whose band holds a layout; the rest are counted as 'no layout')
     conflicts     the same code read twice with different values
   The verdict is plain: 'usable' when the table explains at least 90% of sales with complete rows only and at least 95% of rental contracts
   agree (where there are 30 or more); 'review' otherwise, with the reasons. Nothing here changes a row; it only reports.
   ========================================================================== */
'use strict';
const E = require('./bedroom-engine.js');
const LIMITS = { explained: 0.9, rentalAgree: 0.95, rentalMin: 30, repeat: 3 };

// rows: layout objects from E.loadLayouts (P.all or a list); sales: [{areaRaw|sqm}]; rentals: raw URA rental records
function check(rows, sales, rentals, limits) {
  limits = Object.assign({}, LIMITS, limits || {});
  const complete = rows.filter((l) => l.status !== 'draft' || (Number.isInteger(l.bedrooms) && l.iv));
  const usable = rows.filter((l) => l.iv && Number.isInteger(l.bedrooms));
  const at = new Map(); sales.forEach((t) => { const k = String(t.areaRaw != null ? t.areaRaw : t.sqm); at.set(k, (at.get(k) || 0) + 1); });
  let explained = 0; const gaps = [], used = new Set();
  at.forEach((n, a) => { const iv = E.interval(a, 'sqm'), fit = usable.filter((l) => E.overlaps(l.iv, iv)); if (fit.length) { explained += n; fit.forEach((l) => used.add(l.code)); } else if (n >= limits.repeat) gaps.push({ sqm: a, sales: n }); });
  const rc = E.rentalCheck(rentals || [], usable);
  const out = {
    rows: rows.length, usableRows: usable.length, incomplete: rows.length - usable.length,
    sales: sales.length, explained: sales.length ? explained / sales.length : null,
    repeatedGaps: gaps.sort((a, b) => b.sales - a.sales), unused: usable.filter((l) => !used.has(l.code)).map((l) => l.code),
    // agreement is measured where a layout exists to compare with; contracts in sizes the table does not cover are counted apart
    rental: { n: rc.n, compared: rc.agree + rc.conflict, agree: rc.agree + rc.conflict ? rc.agree / (rc.agree + rc.conflict) : null, conflict: rc.conflict, noLayout: rc.noLayout, mixedRanges: rc.ranges.filter((r) => r.mixed).map((r) => r.range) },
  };
  const why = [];
  if (out.explained == null || out.explained < limits.explained) why.push('explains ' + (out.explained == null ? 'no' : Math.round(out.explained * 1000) / 10 + '% of') + ' sales (needs ' + limits.explained * 100 + '%)');
  if (out.incomplete) why.push(out.incomplete + ' incomplete row(s)');
  if (out.rental.compared >= limits.rentalMin && out.rental.agree < limits.rentalAgree) why.push('rental contracts agree ' + Math.round(out.rental.agree * 1000) / 10 + '% (needs ' + limits.rentalAgree * 100 + '%)');
  if (gaps.length) why.push(gaps.length + ' repeated sale area(s) with no layout');
  out.verdict = !why.filter((w) => !/incomplete|repeated/.test(w)).length && !out.incomplete ? 'usable' : 'review';
  out.reasons = why;
  return out;
}

// Merge rows read from several documents of one development: same code and same values once; same code with different values is a conflict
// (both kept out); rows only in one document are kept.
function merge(lists) {
  const by = new Map(), conflicts = [];
  lists.forEach((rows) => rows.forEach((r) => {
    const k = r.code, p = by.get(k);
    if (!p) { by.set(k, Object.assign({}, r)); return; }
    const same = String(p.bedrooms) === String(r.bedrooms) && (p.sqm || '') === (r.sqm || '') && (p.sqft || '') === (r.sqft || '');
    const pc = p.bedrooms != null && (p.sqm || p.sqft), rcpl = r.bedrooms != null && (r.sqm || r.sqft);
    if (same) return;
    if (!pc && rcpl) { by.set(k, Object.assign({}, r)); return; }
    if (pc && !rcpl) return;
    conflicts.push({ code: k, a: p, b: r }); p.conflict = true;
  }));
  return { rows: Array.from(by.values()).filter((r) => !r.conflict), conflicts };
}

module.exports = { LIMITS, check, merge };
