/* ==========================================================================
   GROUNDWORK — Bedroom-type classification engine (pure functions, Node).

   Infers a bedroom type for URA strata transactions by matching each sale's URA area to the development's layout table
   (developer-stated areas). URA publishes NO bedroom field: every result here is an INFERENCE from developer floor plans and
   must be labelled that way wherever it is shown.

   Classes, per transaction:
     A  exactly one layout fits the sale's area                          -> bedroom type known (layout known)
     B  several layouts fit, all in the same bedroom group               -> bedroom type known (layout not)
     C  several layouts fit, in different bedroom groups                 -> unclassified (ambiguous)
     D  no layout fits                                                   -> unclassified (unmatched; logged with the nearest layout)
   Only A and B ever enter bedroom statistics.

   Rounding is explicit. Every stated area is treated as an INTERVAL: the value plus or minus half its last stated digit
   ("65" sqm = 64.5 to 65.5; "64.6" sqm = 64.55 to 64.65; "700" sqft = 699.5 to 700.5 sqft, converted to sqm). A layout fits a
   sale when the layout's interval and the URA area's interval overlap by more than a hair. A developer area that sits exactly
   on a rounding boundary therefore fits BOTH neighbouring URA values, and the engine reports that ambiguity instead of guessing.
   The developer's sqm is used when stated; sqft only when sqm is not.

   Layout tables are CSV (one file can hold many developments), so they can be kept and edited in a spreadsheet:
     project,code,bedrooms,variant,sqm,sqft,source,status,note
   project = the URA project name exactly; bedrooms = integer (0 = studio); variant = '' | study | premium | dual-key | penthouse |
   pes | loft | flexi | other; status = draft (not used) | reference (checks only) | secondary | developer | approved. Sources are a second CSV:
     id,project,title,url,retrieved,kind,note
   ========================================================================== */
'use strict';
const { quantile } = require('./build-bands.js');
const PULSE = require('../../assets/js/gw-pulse.js');

const SQFT_PER_SQM = 10.7639;
const EPS = 1e-9;
const VARIANTS = ['', 'study', 'premium', 'dual-key', 'penthouse', 'pes', 'loft', 'flexi', 'other'];
const STATUSES = ['draft', 'reference', 'extracted', 'secondary', 'developer', 'approved'];   // reference: a partial list used only to CHECK other evidence, never to classify
const USE_STATUSES = ['extracted', 'secondary', 'developer', 'approved'];      // rows the classifier uses ('extracted': read automatically from a developer document and passed layout-quality.js)
const PUBLISH_STATUSES = ['developer', 'approved'];               // rows good enough for public figures (all rows of a project must qualify)
const SALE_CODE = { new: 1, sub: 2, resale: 3 }, SALE_NAME = { 1: 'new', 2: 'sub', 3: 'resale' };

/* ---------- areas as intervals ---------- */
function decimalsOf(v) { const m = /\.(\d*?)0*$/.exec(String(v).trim()); return m ? m[1].length : 0; }
// The interval of true area (in sqm) consistent with a stated value. unit: 'sqm' | 'sqft'.
function interval(value, unit) {
  const v = Number(value); if (!(v > 0)) return null;
  const step = Math.pow(10, -decimalsOf(value)); let lo = v - step / 2, hi = v + step / 2;
  if (unit === 'sqft') { lo /= SQFT_PER_SQM; hi /= SQFT_PER_SQM; }
  return [lo, hi];
}
const overlaps = (a, b) => Math.max(a[0], b[0]) < Math.min(a[1], b[1]) - EPS;
const midGap = (a, b) => Math.abs((a[0] + a[1]) / 2 - (b[0] + b[1]) / 2);   // distance between the stated values, in sqm

/* ---------- CSV ---------- */
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((c) => c.trim() !== '')) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => !/^#/.test(String(r[0]).trim())).map((r, i) => { const o = { _line: i + 2 }; head.forEach((h, j) => { o[h] = (r[j] == null ? '' : String(r[j])).trim(); }); return o; });
}

/* ---------- layout tables ---------- */
// Returns Map(projectName -> { project, layouts: [...], all: [...], sources: [...], issues: [...], status, publishable })
function loadLayouts(layoutCsv, sourceCsv) {
  const out = new Map(), sources = sourceCsv ? parseCsv(sourceCsv) : [];
  const get = (name) => out.get(name) || out.set(name, { project: name, layouts: [], reference: [], all: [], sources: [], issues: [] }).get(name);
  parseCsv(layoutCsv).forEach((r) => {
    const P = get(r.project), issue = (msg) => P.issues.push('line ' + r._line + ' (' + (r.code || '?') + '): ' + msg);
    if (!r.project) return;
    const bedrooms = String(r.bedrooms).trim() === '' ? NaN : Number(r.bedrooms), variant = (r.variant || '').toLowerCase(), status = (r.status || 'draft').toLowerCase();   // blank is missing, never 0 (a studio)
    if (!r.code) issue('no layout code');
    if (!(Number.isInteger(bedrooms) && bedrooms >= 0 && bedrooms <= 8)) return issue('bedrooms must be a whole number 0 to 8');
    if (VARIANTS.indexOf(variant) < 0) issue('unknown variant "' + variant + '" (kept as other)');
    if (STATUSES.indexOf(status) < 0) return issue('unknown status "' + status + '"');
    const ivSqm = r.sqm ? interval(r.sqm, 'sqm') : null, ivSqft = r.sqft ? interval(r.sqft, 'sqft') : null;
    if (!ivSqm && !ivSqft) return issue('no area');
    if (ivSqm && ivSqft && !overlaps([ivSqm[0] - 0.05, ivSqm[1] + 0.05], ivSqft)) issue('sqm ' + r.sqm + ' and sqft ' + r.sqft + ' disagree; sqm used');
    if (!ivSqm && ivSqft) {   // sqft only: note when it does not sit near a whole sqm (the brochure may state a decimal sqm)
      const mid = (ivSqft[0] + ivSqft[1]) / 2; if (Math.abs(mid - Math.round(mid)) > 0.1) issue('sqft ' + r.sqft + ' is ' + mid.toFixed(2) + ' sqm, not near a whole sqm; check the brochure sqm');
    }
    const L = { code: r.code, bedrooms, variant: VARIANTS.indexOf(variant) < 0 ? 'other' : variant, sqm: r.sqm || null, sqft: r.sqft || null,
      iv: ivSqm || ivSqft, basis: ivSqm ? 'sqm' : 'sqft', source: r.source || null, status, note: r.note || '' };
    if (P.all.some((x) => x.code === L.code)) issue('duplicate code');
    P.all.push(L);
    if (USE_STATUSES.indexOf(status) > -1) P.layouts.push(L);
    if (status !== 'draft') P.reference.push(L);   // everything reviewed, including partial reference lists: used to check rental inference
  });
  sources.forEach((s) => { if (s.project && out.has(s.project)) out.get(s.project).sources.push(s); else if (s.project === '*' || !s.project) out.forEach((P) => P.sources.push(s)); });
  out.forEach((P) => {
    const used = P.layouts;
    P.referenceOnly = !used.length && P.reference.length > 0;
    P.status = !used.length ? (P.reference.length ? 'reference' : 'none') : used.every((l) => l.status === 'approved') ? 'approved' : used.every((l) => PUBLISH_STATUSES.indexOf(l.status) > -1) ? 'developer' : used.every((l) => l.status === 'extracted') ? 'extracted' : 'secondary';
    P.publishable = used.length > 0 && used.every((l) => PUBLISH_STATUSES.indexOf(l.status) > -1);
    used.forEach((l) => { if (l.source && !P.sources.some((s) => s.id === l.source)) P.issues.push(l.code + ': source "' + l.source + '" not listed in sources'); });
  });
  return out;
}

/* ---------- groups ---------- */
// A bedroom group: the bedroom count, except penthouses (their own group: prices are not comparable with typical units).
const groupOf = (l) => (l.variant === 'penthouse' ? 'PH' : String(l.bedrooms));
const groupLabel = (g) => (g === 'PH' ? 'Penthouse' : g === '0' ? 'Studio' : g + '-bedroom');
const groupOrder = (g) => (g === 'PH' ? 99 : Number(g));

/* ---------- classify ---------- */
function candidates(layouts, iv, tol) { return layouts.filter((l) => overlaps(tol ? [l.iv[0] - tol, l.iv[1] + tol] : l.iv, iv)); }
// areaRaw: URA's area exactly as sent (string or number), in sqm. opt.tolerance (sqm) widens every layout: sensitivity runs only.
function classify(areaRaw, layouts, opt) {
  opt = opt || {};
  const iv = interval(areaRaw, 'sqm');
  if (!iv) return { cls: 'D', group: null, codes: [], reason: 'no area' };
  const c = candidates(layouts, iv, opt.tolerance || 0);
  if (!c.length) {
    let near = null; layouts.forEach((l) => { const g = Math.round(midGap(l.iv, iv) * 10) / 10; if (!near || g < near.gap) near = { code: l.code, group: groupOf(l), gap: g }; });
    return { cls: 'D', group: null, codes: [], near };
  }
  const groups = Array.from(new Set(c.map(groupOf)));
  if (c.length === 1) return { cls: 'A', group: groups[0], codes: [c[0].code] };
  if (groups.length === 1) return { cls: 'B', group: groups[0], codes: c.map((l) => l.code) };
  return { cls: 'C', group: null, groups: groups.sort((a, b) => groupOrder(a) - groupOrder(b)), codes: c.map((l) => l.code) };
}

/* ---------- statistics ---------- */
const r0 = (v) => (v == null ? null : Math.round(v));
const q5 = (sorted) => (sorted.length ? [sorted[0], quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75), sorted[sorted.length - 1]].map(r0) : null);
const median = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s.length ? quantile(s, 0.5) : null; };
function cell(rows) {
  if (!rows.length) return { n: 0, act: 0, last: null, psf: null, price: null };
  const months = new Set(rows.map((x) => x.ym));
  return { n: rows.length, act: months.size, last: Math.max.apply(null, Array.from(months)), psf: q5(rows.map((x) => x.psf).sort((a, b) => a - b)), price: q5(rows.map((x) => x.price).sort((a, b) => a - b)) };
}

// The Market Pulse reading for two period cells, with exactly the rules and thresholds of assets/js/gw-pulse.js (CFG imported from it).
// A, B: {n, act, last(ym index), psf:[min,q1,med,q3,max]}; lastIdx: ym index of the latest month in the data.
function reading(A, B, lastIdx) {
  const C = PULSE.CFG;
  if (!A || !B || !A.n || !B.n) return { evidence: 'none' };
  const a = { n: A.n, act: A.act, q1: A.psf[1], med: A.psf[2], q3: A.psf[3] }, b = { n: B.n, act: B.act, q1: B.psf[1], med: B.psf[2], q3: B.psf[3] };
  const strong = a.n >= C.strong.n && a.act >= C.strong.months && b.n >= C.strong.n && b.act >= C.strong.months && (lastIdx - A.last) <= C.strong.maxMonthsSinceLatest;
  const limited = !strong && a.n >= C.limited.n && b.n >= C.limited.n && a.act >= C.limited.months && b.act >= C.limited.months;
  if (!(strong || limited) || !(b.med > 0)) return { evidence: 'none' };
  const pct = Math.round((a.med - b.med) / b.med * 1000) / 10;
  const sd = (c) => (c.q3 - c.q1) / 1.349, se = strong ? Math.sqrt(Math.pow(1.2533 * sd(a) / Math.sqrt(a.n), 2) + Math.pow(1.2533 * sd(b) / Math.sqrt(b.n), 2)) / b.med * 100 : 0;
  const withinNoise = strong && Math.abs(pct) >= C.stablePct && Math.abs(pct) < C.noiseZ * se;
  const dir = Math.abs(pct) < C.stablePct || withinNoise ? 'stable' : pct > 0 ? 'higher' : 'lower';
  return { evidence: strong ? 'strong' : 'limited', dir, pct, withinNoise };
}

const E_iv = (t) => interval(t.areaRaw != null ? t.areaRaw : t.sqm, 'sqm');
const tiersOf = (list) => { const o = {}; list.forEach((t) => { const k = t.tier || (t.cls === 'A' || t.cls === 'B' ? 'layout' : 'unclassified'); o[k] = (o[k] || 0) + 1; }); return o; };
const dirWord = (pct) => (Math.abs(pct) < PULSE.CFG.stablePct ? 'stable' : pct > 0 ? 'higher' : 'lower');

/* ---------- one development ---------- */
// rows: the development's admitted transactions [{sale:1|2|3, price, sqm, areaRaw, psf, ym, floor}] (headline class only)
// P: its entry from loadLayouts. ctx: {latest: ym index of the latest month in the WHOLE dataset, periodMonths, periods, bin}
function analyse(rows, P, ctx, opt) {
  opt = opt || {};
  const per = ctx.periodMonths || 12, nPer = ctx.periods || 5, bin = ctx.bin || 100;
  const periodOf = (ym) => { const p = Math.floor((ctx.latest - ym) / per); return p < nPer ? p : nPer; };
  // opt.decide(t) lets another classifier (bedroom-hybrid.js) supply each sale's {cls: A|B|C|D, group, codes, tier}; by default the layout table decides.
  const tx = rows.map((t) => Object.assign({}, t, { period: periodOf(t.ym), bin: Math.floor(t.sqm * SQFT_PER_SQM / bin) * bin }, opt.decide ? opt.decide(t) : classify(t.areaRaw != null ? t.areaRaw : t.sqm, P.layouts, opt)));
  const groups = Array.from(new Set(P.layouts.map(groupOf).concat(tx.filter((t) => t.group != null).map((t) => t.group)))).sort((a, b) => groupOrder(a) - groupOrder(b));
  const count = (list) => { const o = { n: list.length, A: 0, B: 0, C: 0, D: 0 }; list.forEach((t) => { o[t.cls]++; }); o.classified = o.A + o.B; o.share = o.n ? o.classified / o.n : null; return o; };
  const out = { project: P.project, layoutStatus: P.status, publishable: P.publishable, layouts: P.layouts.length, groups: {}, totals: {}, periods: {}, unclassified: { C: [], D: [] }, layoutCheck: {}, bias: {}, mix: {}, pulse: {} };

  out.totals.all = count(tx); out.totals.tiers = tiersOf(tx); out.totals.resaleTiers = tiersOf(tx.filter((t) => t.sale === 3));
  ['new', 'sub', 'resale'].forEach((s) => { const l = tx.filter((t) => t.sale === SALE_CODE[s]); if (l.length) out.totals[s] = count(l); });
  const resale = tx.filter((t) => t.sale === 3);
  for (let p = 0; p <= nPer; p++) { const l = resale.filter((t) => t.period === p); if (l.length) out.periods[p] = count(l); }

  // bedroom groups: counts and statistics (A + B only)
  groups.forEach((g) => {
    const mine = tx.filter((t) => t.group === g), codes = P.layouts.filter((l) => groupOf(l) === g);
    const could = tx.filter((t) => t.cls === 'C' && t.groups.indexOf(g) > -1);   // ambiguous sales that MIGHT be this group
    const span = codes.length ? codes.map((l) => l.iv) : mine.map((t) => E_iv(t));   // no layouts (rental-inferred): the areas actually sold
    const G = { label: groupLabel(g), layouts: codes.map((l) => l.code), sqm: [Math.min.apply(null, span.map((v) => v[0])), Math.max.apply(null, span.map((v) => v[1]))].map((v) => Math.round(v * 10) / 10),
      tiers: tiersOf(mine),
      n: mine.length, exact: mine.filter((t) => t.cls === 'A').length, ambiguousOverlap: could.length, sales: {} };
    ['new', 'sub', 'resale'].forEach((s) => {
      const l = mine.filter((t) => t.sale === SALE_CODE[s]); if (!l.length) return;
      const S = { all: cell(l), periods: [] };
      for (let p = 0; p <= nPer; p++) S.periods.push(cell(l.filter((t) => t.period === p)));
      // share of this group's possible resales left out because they were ambiguous, latest two periods
      if (s === 'resale') {
        const inWin = (t) => t.period <= 1, kept = l.filter(inWin).length, lost = could.filter((t) => t.sale === 3 && inWin(t)).length;
        S.ambiguousShare = kept + lost ? Math.round(lost / (kept + lost) * 1000) / 1000 : null;
      }
      G.sales[s] = S;
    });
    out.groups[g] = G;
  });

  // what could not be classified, by area
  const byArea = (list) => { const m = new Map(); list.forEach((t) => { const k = String(t.areaRaw != null ? t.areaRaw : t.sqm); const e = m.get(k) || m.set(k, { sqm: k, n: 0, resale: 0, codes: t.codes, groups: t.groups || null, near: t.near || null }).get(k); e.n++; if (t.sale === 3) e.resale++; }); return Array.from(m.values()).sort((a, b) => b.n - a.n); };
  out.unclassified.C = byArea(tx.filter((t) => t.cls === 'C'));
  out.unclassified.D = byArea(tx.filter((t) => t.cls === 'D'));

  // layout table against the data: layouts no sale ever fitted; areas with repeated sales and no layout (a missing or mis-stated layout?)
  const used = new Set(); tx.forEach((t) => (t.codes || []).forEach((c) => used.add(c)));
  out.layoutCheck.unusedLayouts = P.layouts.filter((l) => !used.has(l.code)).map((l) => l.code);
  out.layoutCheck.repeatedUnmatched = out.unclassified.D.filter((d) => d.n >= (opt.repeatMin || 3)).map((d) => ({ sqm: d.sqm, n: d.n, near: d.near }));
  out.layoutCheck.nearMissShare = out.totals.all.D ? Math.round(tx.filter((t) => t.cls === 'D' && t.near && t.near.gap <= 1.05).length / out.totals.all.D * 1000) / 1000 : null;

  // bias: classified vs unclassified resales in the two Market Pulse periods
  const win = resale.filter((t) => t.period <= 1), yes = win.filter((t) => t.cls === 'A' || t.cls === 'B'), no = win.filter((t) => t.cls === 'C' || t.cls === 'D');
  const floorShare = (l) => { const lo = l.filter((t) => t.floor && /^0?[1-5]\b|^01|^B/.test(t.floor)).length; return l.length ? Math.round(lo / l.length * 1000) / 1000 : null; };
  out.bias = {
    n: win.length, classified: yes.length, unclassified: no.length,
    medPsf: { classified: r0(median(yes.map((t) => t.psf))), unclassified: r0(median(no.map((t) => t.psf))) },
    medSqft: { classified: r0(median(yes.map((t) => t.sqm * SQFT_PER_SQM))), unclassified: r0(median(no.map((t) => t.sqm * SQFT_PER_SQM))) },
    lowFloorShare: { classified: floorShare(yes), unclassified: floorShare(no) },
    shareByPeriod: [0, 1].map((p) => (out.periods[p] ? Math.round(out.periods[p].share * 1000) / 1000 : null)),
  };
  if (out.bias.medPsf.classified && out.bias.medPsf.unclassified) out.bias.psfGapPct = Math.round((out.bias.medPsf.unclassified - out.bias.medPsf.classified) / out.bias.medPsf.classified * 1000) / 10;

  // layout mix within each group, resale: does the mix of areas sold change between the two periods enough to move the median by itself?
  groups.forEach((g) => {
    const l = resale.filter((t) => t.group === g), p0 = l.filter((t) => t.period === 0), p1 = l.filter((t) => t.period === 1);
    if (p0.length < 3 || p1.length < 3) return;
    const dist = (list) => { const m = {}; list.forEach((t) => { const k = String(t.areaRaw != null ? t.areaRaw : t.sqm); m[k] = (m[k] || 0) + 1 / list.length; }); return m; };
    const d0 = dist(p0), d1 = dist(p1), keys = Array.from(new Set(Object.keys(d0).concat(Object.keys(d1))));
    const tvd = keys.reduce((s, k) => s + Math.abs((d0[k] || 0) - (d1[k] || 0)), 0) / 2;
    const raw = (median(p0.map((t) => t.psf)) - median(p1.map((t) => t.psf))) / median(p1.map((t) => t.psf)) * 100;
    // mix-fixed change: median psf change per area, weighted by its sales in both periods (areas with 2+ sales in each period)
    let wsum = 0, csum = 0;
    keys.forEach((k) => { const a = p0.filter((t) => String(t.areaRaw != null ? t.areaRaw : t.sqm) === k), b = p1.filter((t) => String(t.areaRaw != null ? t.areaRaw : t.sqm) === k); if (a.length >= 2 && b.length >= 2) { const w = a.length + b.length; wsum += w; csum += w * (median(a.map((t) => t.psf)) - median(b.map((t) => t.psf))) / median(b.map((t) => t.psf)) * 100; } });
    const fixed = wsum ? csum / wsum : null, covered = wsum / (p0.length + p1.length);
    out.mix[g] = { tvd: Math.round(tvd * 1000) / 1000, rawPct: Math.round(raw * 10) / 10, fixedPct: fixed == null ? null : Math.round(fixed * 10) / 10, fixedCovers: Math.round(covered * 1000) / 1000,
      // Flagged when holding the areas fixed gives a different direction word (Market Pulse's 3% line). Where too few areas sold in both periods for a
      // like-for-like check (under half the sales), a large change in the areas sold flags it instead.
      flag: fixed != null && covered >= 0.5 ? dirWord(raw) !== dirWord(fixed) : tvd > (opt.mixTvd || 0.2) };
  });

  // Market Pulse: today's 100 sq ft bands against bedroom groups, same rules; plus the share of latest-12-month resales that sit under a strong reading
  const lastIdx = ctx.latest;
  const readingsBy = (keyOf, keys) => { const o = {}; keys.forEach((k) => { const l = resale.filter((t) => keyOf(t) === k); o[k] = Object.assign(reading(cell(l.filter((t) => t.period === 0)), cell(l.filter((t) => t.period === 1)), lastIdx), { n12: l.filter((t) => t.period === 0).length }); }); return o; };
  const bins = Array.from(new Set(resale.map((t) => t.bin))).sort((a, b) => a - b);
  const bandR = readingsBy((t) => t.bin, bins), groupR = readingsBy((t) => t.group, groups);
  const n12 = resale.filter((t) => t.period === 0).length;
  const tally = (R) => { const o = { strong: 0, limited: 0, none: 0, coverStrong: 0, coverAny: 0 }; Object.keys(R).forEach((k) => { o[R[k].evidence]++; if (R[k].evidence === 'strong') o.coverStrong += R[k].n12; if (R[k].evidence !== 'none') o.coverAny += R[k].n12; }); o.coverStrong = n12 ? Math.round(o.coverStrong / n12 * 1000) / 1000 : null; o.coverAny = n12 ? Math.round(o.coverAny / n12 * 1000) / 1000 : null; return o; };
  out.pulse = { n12, bands: tally(bandR), groups: tally(groupR), byGroup: groupR, byBand: bandR };
  return { summary: out, tx };
}

/* ---------- independent cross-check: URA rental contracts ---------- */
// rentals: [{areaSqm:'60-70', noOfBedRoom:'2'}] for ONE development (URA PMI_Resi_Rental). A contract never labels a sale (no unit number,
// a 10 sqm range, and the count is what was declared for the lease); it only checks the layout table: for each range, do the layouts that fall in
// it have the bedroom count tenants declared?
function rentalCheck(rentals, layouts) {
  const out = { n: 0, agree: 0, conflict: 0, noLayout: 0, ranges: [] }, m = new Map();
  (rentals || []).forEach((r) => {
    const mm = /^(\d+)-(\d+)$/.exec(String(r.areaSqm || '').trim()), beds = Number(r.noOfBedRoom);
    if (!mm || !Number.isInteger(beds)) return;
    const iv = [Number(mm[1]), Number(mm[2])], cand = layouts.filter((l) => overlaps(l.iv, iv)), bs = Array.from(new Set(cand.map((l) => l.bedrooms))).sort((a, b) => a - b);
    out.n++;
    const e = m.get(r.areaSqm) || m.set(r.areaSqm, { range: r.areaSqm, lo: iv[0], layoutBedrooms: bs, declared: {}, n: 0 }).get(r.areaSqm);
    e.declared[beds] = (e.declared[beds] || 0) + 1; e.n++;
    if (!cand.length) out.noLayout++; else if (bs.indexOf(beds) > -1) out.agree++; else out.conflict++;
  });
  out.ranges = Array.from(m.values()).sort((a, b) => a.lo - b.lo).map((e) => ({ range: e.range, n: e.n, declared: e.declared, layoutBedrooms: e.layoutBedrooms, mixed: Object.keys(e.declared).length > 1 }));
  out.agreeShare = out.n ? Math.round(out.agree / out.n * 1000) / 1000 : null;
  return out;
}

module.exports = { rentalCheck, SQFT_PER_SQM, VARIANTS, STATUSES, USE_STATUSES, PUBLISH_STATUSES, SALE_NAME, interval, overlaps, decimalsOf, parseCsv, loadLayouts, classify, groupOf, groupLabel, groupOrder, cell, reading, analyse };
