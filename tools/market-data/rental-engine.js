/* ==========================================================================
   GROUNDWORK — URA-first bedroom inference from URA rental contracts (pure functions, Node).

   URA's rental contracts (PMI_Resi_Rental) carry a declared bedroom count (noOfBedRoom) with a 10 sqm and a 100 sq ft area band.
   URA's sales carry an exact area (whole sqm) and NO bedroom count. This module asks, for each sale area in a development:
   do the rental contracts whose size could be that area agree on one bedroom count, often enough to rely on?

   Each contract's size is the INTERSECTION of its two bands (e.g. 60-70 sqm and 600-700 sq ft = 60.0 to 65.0 sqm). Band edges are
   treated as belonging to both neighbours, and a sale's whole-sqm area is the interval of half a sqm either side, so a sale on a
   band edge is compared with the contracts on both sides. 'NA' bedroom counts and open-ended bands ('>3000') are left out.

   The rule, per sale area (explainable, counts only; RULE below):
     inferred  at least RULE.minN contracts could be that size, and at most one in ten of them (RULE.minPurity) declares a different count
               ('strong' when at least RULE.strongN contracts and at most one in twenty disagree)
     mixed     enough contracts, but they disagree more than that                     -> unclassified (ambiguous)
     sparse    fewer than RULE.minN contracts could be that size                      -> unclassified (insufficient evidence)
     none      no contract could be that size                                         -> unclassified
     unrepresented  the contracts agree, but this size is too rare among the development's sales for them to speak for it:
               a contract band also holds other sizes, and only about (contracts x this size's share of the sales in that band)
               would be expected to come from this size; under RULE.minExpected (3), the agreement says nothing about it -> unclassified.
               (Example: Thomson Three's 99 sqm 2-bedroom units sit in a band of far more common 3-bedroom units.)
   A rental-inferred bedroom count is never a URA sales field and is always labelled as inferred from rental records.
   ========================================================================== */
'use strict';
const E = require('./bedroom-engine.js');
const K = E.SQFT_PER_SQM, EPS = 1e-9;
const RULE = { minN: 5, minPurity: 0.9, strongN: 20, strongPurity: 0.95, minExpected: 3 };

const band = (s) => { const m = /^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/.exec(String(s || '')); return m ? [Number(m[1]), Number(m[2])] : null; };
const ymOf = (s) => { const m = /^(\d{2})(\d{2})$/.exec(String(s || '')); return m ? (2000 + Number(m[2])) * 12 + Number(m[1]) - 1 : null; };

// One URA rental contract -> {lo, hi, beds, ym, bandConflict} in sqm, or null when it carries no usable bedroom count or size.
function contract(r) {
  const beds = Number(r.noOfBedRoom), m = band(r.areaSqm), f = band(r.areaSqft);
  if (!Number.isInteger(beds) || beds < 0 || beds > 10 || !m) return null;
  let lo = m[0], hi = m[1], bandConflict = false;
  if (f) { const l2 = Math.max(lo, f[0] / K), h2 = Math.min(hi, f[1] / K); if (h2 > l2 + EPS) { lo = l2; hi = h2; } else bandConflict = true; }   // the two bands do not overlap: keep the sqm band, flag it
  return { lo, hi, beds, ym: ymOf(r.leaseDate), bandConflict };
}
function contracts(rentals) { const out = []; let dropped = 0, conflict = 0; (rentals || []).forEach((r) => { const c = contract(r); if (!c) dropped++; else { out.push(c); if (c.bandConflict) conflict++; } }); out.dropped = dropped; out.bandConflicts = conflict; return out; }

// Cells: contracts grouped by identical size interval, with their bedroom counts.
function cells(cs) {
  const m = new Map();
  cs.forEach((c) => { const k = c.lo.toFixed(3) + '|' + c.hi.toFixed(3); const e = m.get(k) || m.set(k, { lo: c.lo, hi: c.hi, n: 0, beds: {} }).get(k); e.n++; e.beds[c.beds] = (e.beds[c.beds] || 0) + 1; });
  return Array.from(m.values()).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
}
const touches = (c, iv) => c.hi > iv[0] + EPS && c.lo < iv[1] - EPS;

// The evidence for one size (iv: [lo, hi] sqm) and the decision. rule: RULE overrides.
function decide(iv, cellList, rule) {
  rule = Object.assign({}, RULE, rule || {});
  const beds = {}; let n = 0;
  cellList.forEach((c) => { if (!touches(c, iv)) return; n += c.n; Object.keys(c.beds).forEach((b) => { beds[b] = (beds[b] || 0) + c.beds[b]; }); });
  if (!n) return { cls: 'none', beds: null, n: 0, purity: null, counts: beds };
  const top = Object.keys(beds).sort((a, b) => beds[b] - beds[a] || a - b)[0], purity = beds[top] / n;
  if (n < rule.minN) return { cls: 'sparse', beds: null, n, purity, lead: Number(top), counts: beds };
  if (purity + EPS < rule.minPurity) return { cls: 'mixed', beds: null, n, purity, lead: Number(top), counts: beds };
  return { cls: 'inferred', beds: Number(top), n, purity, tier: n >= rule.strongN && purity + EPS >= rule.strongPurity ? 'strong' : 'standard', counts: beds };
}
// Sales context for the representation test: how many sales sit at each area, and how many sales touch each rental cell.
function salesContext(rows, cellList) {
  const at = new Map(); rows.forEach((t) => { const k = String(t.areaRaw != null ? t.areaRaw : t.sqm); at.set(k, (at.get(k) || 0) + 1); });
  const ivs = Array.from(at.keys()).map((k) => [k, E.interval(k, 'sqm')]).filter((x) => x[1]);
  const cellSales = cellList.map((c) => ivs.reduce((s, x) => s + (touches(c, x[1]) ? at.get(x[0]) : 0), 0));
  return { at, cellSales };
}
// A sale (URA area as sent, whole sqm) against a development's rental cells. ctx (salesContext) adds the representation test.
function classifySale(areaRaw, cellList, rule, ctx) {
  rule = Object.assign({}, RULE, rule || {});
  const iv = E.interval(areaRaw, 'sqm'); if (!iv) return { cls: 'none', beds: null, n: 0 };
  const d = decide(iv, cellList, rule);
  if (d.cls !== 'inferred' || !ctx) return d;
  const mine = ctx.at.get(String(areaRaw)) || 0; let expected = 0;
  cellList.forEach((c, i) => { if (touches(c, iv) && ctx.cellSales[i]) expected += c.n * mine / ctx.cellSales[i]; });
  d.expected = Math.round(expected * 10) / 10;
  if (expected + EPS < rule.minExpected) return Object.assign(d, { cls: 'unrepresented', inferredBeds: d.beds, beds: null, tier: null });
  return d;
}
// A held-out rental contract against cells built from OTHER contracts: does the mapping predict its declared count?
function predictContract(c, cellList, rule) { return decide([c.lo, c.hi], cellList, rule); }

/* ---------- one development ---------- */
// rows: admitted sales [{sale, areaRaw, sqm, psf, ym, ...}]; rentals: raw URA rental records for the same development.
// Returns per-area mapping (the private "accepted mapping" for refresh comparison) and per-sale results.
function analyse(rows, rentals, rule) {
  const cs = contracts(rentals), cl = cells(cs), byArea = new Map(), ctx = salesContext(rows, cl);
  rows.forEach((t) => { const k = String(t.areaRaw != null ? t.areaRaw : t.sqm); if (!byArea.has(k)) byArea.set(k, classifySale(k, cl, rule, ctx)); });
  const tx = rows.map((t) => Object.assign({}, t, { r: byArea.get(String(t.areaRaw != null ? t.areaRaw : t.sqm)) }));
  const count = (l) => { const o = { n: l.length, inferred: 0, strong: 0, mixed: 0, sparse: 0, none: 0, unrepresented: 0 }; l.forEach((t) => { o[t.r.cls]++; if (t.r.tier === 'strong') o.strong++; }); o.share = o.n ? o.inferred / o.n : null; return o; };
  const mapping = Array.from(byArea.entries()).map(([a, r]) => ({ sqm: a, cls: r.cls, beds: r.beds, n: r.n, purity: r.purity == null ? null : Math.round(r.purity * 1000) / 1000, tier: r.tier || null, expected: r.expected == null ? null : r.expected, counts: r.counts, sales: rows.filter((t) => String(t.areaRaw != null ? t.areaRaw : t.sqm) === a).length })).sort((x, y) => Number(x.sqm) - Number(y.sqm));
  return { contracts: { used: cs.length, dropped: cs.dropped, bandConflicts: cs.bandConflicts, cells: cl.length }, totals: count(tx), resale: count(tx.filter((t) => t.sale === 3)), mapping, tx };
}

/* ---------- held-out checks: rental contracts the mapping never saw ---------- */
function holdout(cs, trainIdx, testIdx, rule) {
  const cl = cells(trainIdx.map((i) => cs[i])), o = { n: testIdx.length, predicted: 0, right: 0, wrong: 0, abstain: 0, wrongDetail: {} };
  testIdx.forEach((i) => { const c = cs[i], d = predictContract(c, cl, rule); if (d.cls !== 'inferred') { o.abstain++; return; } o.predicted++; if (d.beds === c.beds) o.right++; else { o.wrong++; const k = d.beds + '->' + c.beds; o.wrongDetail[k] = (o.wrongDetail[k] || 0) + 1; } });
  o.accuracy = o.predicted ? o.right / o.predicted : null; o.coverage = o.n ? o.predicted / o.n : null; return o;
}
// Time split: build from contracts before `splitYm`, test on the rest. Random split: k repeats of a seeded half/half split.
function timeHoldout(cs, splitYm, rule) { const tr = [], te = []; cs.forEach((c, i) => ((c.ym != null && c.ym < splitYm) ? tr : te).push(i)); return Object.assign(holdout(cs, tr, te, rule), { train: tr.length }); }
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function randomHoldout(cs, reps, seed, rule) {
  const r = rng(seed || 7), agg = { n: 0, predicted: 0, right: 0, wrong: 0, abstain: 0 };
  for (let k = 0; k < (reps || 10); k++) { const tr = [], te = []; cs.forEach((c, i) => (r() < 0.5 ? tr : te).push(i)); const h = holdout(cs, tr, te, rule); ['n', 'predicted', 'right', 'wrong', 'abstain'].forEach((x) => { agg[x] += h[x]; }); }
  agg.accuracy = agg.predicted ? agg.right / agg.predicted : null; agg.coverage = agg.n ? agg.predicted / agg.n : null; return agg;
}

/* ---------- against a layout reference (bedroom-engine layout table) ---------- */
// The reference bedroom count of a sale: the single bedroom count of every layout that fits its area (penthouse or not), else null.
function referenceBeds(areaRaw, layouts) {
  const iv = E.interval(areaRaw, 'sqm'), c = layouts.filter((l) => E.overlaps(l.iv, iv)), b = Array.from(new Set(c.map((l) => l.bedrooms)));
  return c.length ? (b.length === 1 ? b[0] : 'ambiguous') : 'unmatched';
}
function compare(rows, cl, layouts, rule) {
  const o = { n: rows.length, both: 0, agree: 0, wrong: 0, rentalOnly: 0, layoutOnly: 0, neither: 0, wrongDetail: {} }, areas = new Map(), ctx = salesContext(rows, cl);
  rows.forEach((t) => {
    const a = String(t.areaRaw != null ? t.areaRaw : t.sqm);
    if (!areas.has(a)) areas.set(a, { ref: referenceBeds(a, layouts), r: classifySale(a, cl, rule, ctx) });
    const { ref, r } = areas.get(a), refOk = typeof ref === 'number', rOk = r.cls === 'inferred';
    if (refOk && rOk) { o.both++; if (r.beds === ref) o.agree++; else { o.wrong++; const k = a + ' sqm: rental ' + r.beds + ', layouts ' + ref; o.wrongDetail[k] = (o.wrongDetail[k] || 0) + 1; } }
    else if (rOk) o.rentalOnly++; else if (refOk) o.layoutOnly++; else o.neither++;
  });
  o.rentalCoverage = o.n ? (o.both + o.rentalOnly) / o.n : null; o.layoutCoverage = o.n ? (o.both + o.layoutOnly) / o.n : null; o.agreement = o.both ? o.agree / o.both : null;
  return o;
}
// Sparse rentals: keep a random fraction of the contracts, rebuild, compare with the layouts. reps draws per fraction.
function sparseCurve(rows, cs, layouts, fractions, reps, seed, rule) {
  const r = rng(seed || 11);
  return fractions.map((f) => {
    const runs = [];
    for (let k = 0; k < reps; k++) { const keep = cs.filter(() => r() < f); runs.push(Object.assign(compare(rows, cells(keep), layouts, rule), { kept: keep.length })); }
    const avg = (x) => runs.reduce((s, q) => s + (q[x] || 0), 0) / runs.length;
    return { fraction: f, contracts: Math.round(avg('kept')), rentalCoverage: avg('rentalCoverage'), agreement: runs.filter((q) => q.agreement != null).length ? runs.reduce((s, q) => s + (q.agreement == null ? 0 : q.agreement), 0) / runs.filter((q) => q.agreement != null).length : null, wrongPerRun: avg('wrong'), maxWrong: Math.max.apply(null, runs.map((q) => q.wrong)), runsWithWrong: runs.filter((q) => q.wrong > 0).length, reps };
  });
}

/* ---------- refresh: has an accepted mapping changed? ---------- */
// prev, next: mapping arrays from analyse(). Reports areas whose decision changed, newly decided areas and contradictions (a different count).
function compareMappings(prev, next) {
  const P = new Map((prev || []).map((m) => [m.sqm, m])), out = { contradictions: [], lost: [], gained: [], unchanged: 0 };
  (next || []).forEach((m) => {
    const p = P.get(m.sqm);
    if (!p) { if (m.cls === 'inferred') out.gained.push({ sqm: m.sqm, beds: m.beds, n: m.n }); return; }
    if (p.cls === 'inferred' && m.cls === 'inferred' && p.beds !== m.beds) out.contradictions.push({ sqm: m.sqm, was: p.beds, now: m.beds, n: m.n, counts: m.counts });
    else if (p.cls === 'inferred' && m.cls !== 'inferred') out.lost.push({ sqm: m.sqm, was: p.beds, now: m.cls, n: m.n, counts: m.counts });
    else if (p.cls !== 'inferred' && m.cls === 'inferred') out.gained.push({ sqm: m.sqm, beds: m.beds, n: m.n });
    else out.unchanged++;
  });
  return out;
}

/* ---------- a weak check against developer size RANGES (e.g. a fact sheet's '3 bedroom: 1,109 to 2,142 sq ft') ---------- */
// Ranges never classify anything (they overlap and hide gaps); they only flag an inferred count whose size falls outside every range stated for it.
// ranges: [{project, bedrooms, sqft_lo, sqft_hi, source}] for one development.
function rangeCheck(mapping, ranges) {
  const out = { checked: 0, inside: 0, outside: [], noRange: 0 };
  (mapping || []).filter((m) => m.cls === 'inferred').forEach((m) => {
    const rs = ranges.filter((r) => Number(r.bedrooms) === m.beds), iv = E.interval(m.sqm, 'sqm');
    out.checked++;
    if (!rs.length) { out.noRange++; return; }
    const hit = rs.some((r) => E.overlaps(iv, [Number(r.sqft_lo) / K - 0.05, Number(r.sqft_hi) / K + 0.05]));
    if (hit) out.inside++; else out.outside.push({ sqm: m.sqm, beds: m.beds, sales: m.sales, n: m.n });
  });
  return out;
}

module.exports = { salesContext, rangeCheck, RULE, contract, contracts, cells, decide, classifySale, predictContract, analyse, holdout, timeHoldout, randomHoldout, referenceBeds, compare, sparseCurve, compareMappings, rng };
