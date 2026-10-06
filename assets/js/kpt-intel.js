/* KPT Project Intelligence (V1). Presentation/rules layer only.
 * Pure functions over the EXISTING engine output (M from kpt-research.js analyseProject) and the project's detail record (p).
 * It never recalculates prices, bands or evidence states, and nothing here feeds back into the engine.
 * Every statement describes transactions (counts, ranges, dates, positions). It never judges them:
 * no liquid/illiquid, active/quiet, appreciation/depreciation, premium/discount, fair value or "comparable".
 * Tiers: strong | limited | insufficient | hidden. "hidden" = does not apply; "insufficient" = checked, not enough sales.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPTIntel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 'intel-v1';
  const T = { act: { strongN: 10, strongMonths: 6 }, mix: { minN: 5, share: 0.5 }, period: { n: 8, months: 4 }, floor: { n: 5, months: 3, minBands: 2 }, size: { strongN: 20, limitedN: 10 }, near: { reach: 200, minN: 5, minMonths: 3 }, windowStart: '2021-09', maxLayer1: 3 };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const num = (n) => Math.round(n).toLocaleString('en-US'), usd = (n) => '$' + num(n);
  const addMonths = (ym, k) => { let y = +ym.slice(0, 4), m = +ym.slice(5) - 1 + k; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); };
  const ymLabel = (ym) => MON[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4);
  const SALE = { new: 1, sub: 2, resale: 3 };
  const bandOf = (M, bin) => (M.bands || []).find((b) => b.bin === bin) || null;

  /* S1 recent activity: counts and recency only. */
  function s1(M) {
    const r = M.recent, k = M.sale.selected, sale = k === 'resale' ? 'resale' : k === 'new' ? 'new-sale' : 'sub-sale', unit = k === 'resale' ? ' sale' : ' transaction';
    const pl = (n) => n + ' ' + sale + unit + (n === 1 ? '' : 's');
    if (!r || r.n === 0) return { tier: 'insufficient', text: r && r.latest ? 'No ' + sale + unit + 's in the last 12 months. The latest in the project was ' + r.latestLabel + '.' : null };
    const strong = r.n >= T.act.strongN && r.months >= T.act.strongMonths;
    return { tier: strong ? 'strong' : 'limited', text: strong ? pl(r.n) + ' in the last 12 months across the project, in ' + r.months + ' different months. The latest was ' + r.latestLabel + '.'
      : 'Only ' + pl(r.n) + ' in the last 12 months across the project' + (r.months === 1 ? ', all in ' + r.latestLabel : ', in ' + r.months + ' months') + '.' };
  }

  /* S3 most sales by size band. Anchored to the hero band when it is among the joint-largest; ties are stated. */
  function s3(M) {
    const r = M.recent, mix = (M.mix || []).slice().sort((a, b) => b.n - a.n || a.bin - b.bin);
    if (!r || r.n < 2 || !mix.length) return { tier: 'insufficient', text: null };
    const topN = mix[0].n, tied = mix.filter((x) => x.n === topN);
    const heroBin = M.focus && M.focus.bin != null ? M.focus.bin : null;
    const anchor = heroBin != null && tied.some((x) => x.bin === heroBin) ? tied.find((x) => x.bin === heroBin) : tied[0];
    const lab = (x) => bandOf(M, x.bin).label;
    const others = tied.filter((x) => x !== anchor).map(lab);
    const level = others.length ? ', level with ' + others.join(' and ') : '';
    const out = { anchorBin: anchor.bin, topN, allInOne: anchor.n === r.n };
    if (r.n >= T.mix.minN) {
      if (topN / r.n >= T.mix.share) {
        const across = heroBin != null && heroBin !== anchor.bin ? ' across the project' : '';
        return Object.assign(out, { tier: 'strong', text: topN === r.n ? 'All ' + r.n + ' recent sales were around ' + lab(anchor) + '.' : topN + ' of the ' + r.n + ' recent sales' + across + ' were around ' + lab(anchor) + level + '.' });
      }
      return Object.assign(out, { tier: 'strong', text: 'Recent sales were spread across ' + mix.length + ' size bands. The most sales (' + topN + ' of ' + r.n + ') were in ' + lab(anchor) + level + '.' });
    }
    return Object.assign(out, { tier: 'limited', text: 'The ' + r.n + ' recent sales were in ' + mix.slice().sort((a, b) => a.bin - b.bin).map((x) => bandOf(M, x.bin).short).join(', ') + ' sqft.' });
  }

  /* S4 where a USER-ENTERED size sits in the project's size distribution (selected sale type, since Sep 2021). Never for a default size. */
  function s4(M, p, sizeSqft) {
    const v = Number(String(sizeSqft == null ? '' : sizeSqft).replace(/[^0-9.]/g, ''));
    if (!(v >= 100 && v <= 20000)) return { tier: 'hidden', text: null };
    const d0 = (p.dist || {})[M.sale.selected] || {}, d = d0.sqft, n = d0.n || 0, band = bandOf(M, Math.floor(v / 100) * 100);
    if (!d || n < T.size.limitedN || !band || !band.n) return { tier: 'insufficient', text: null };
    const pos = v < d[1] ? 'below' : v > d[3] ? 'above' : 'within', strong = n >= T.size.strongN;
    let t = 'The middle half of ' + M.sale.label + ' sales here (since Sep 2021) were between ' + num(d[1]) + ' and ' + num(d[3]) + ' sqft. ' + num(v) + ' sqft is ' + pos + ' that range.';
    if (strong) t += ' ' + band.n + ' of the ' + n + ' sales were in the ' + band.label + ' band.';
    return { tier: strong ? 'strong' : 'limited', text: t };
  }

  /* S5 recent vs previous 12 months, same size band, resale only. Descriptive range comparison. Disclosure only in V1. */
  function s5(M, p) {
    if (M.sale.selected === 'new' || M.sale.selected === 'sub') return { tier: 'hidden', na: true, text: null };
    if (M.sale.selected !== 'resale' || !M.focus || M.focus.bin == null) return { tier: 'insufficient', text: null };
    const cell = (per) => (p.periodCells || []).find((r) => r[0] === SALE.resale && r[1] === M.focus.bin && r[2] === per);
    const g = (c) => c && { n: c[3], act: c[4], q1: c[8], q3: c[10] }, A = g(cell(0)), B = g(cell(1));
    const ok = (x) => x && x.n >= T.period.n && x.act >= T.period.months;
    if (!ok(A) || !ok(B)) return { tier: 'insufficient', text: null };
    const rel = A.q1 > B.q3 ? 'above' : A.q3 < B.q1 ? 'below' : 'overlapping', b = bandOf(M, M.focus.bin);
    return { tier: 'strong', rel, text: 'In the ' + b.short + ' band, the middle half of recent sales was ' + usd(A.q1) + '–' + usd(A.q3) + ' psf (' + A.n + ' sales). The previous 12 months was ' + usd(B.q1) + '–' + usd(B.q3) + ' psf (' + B.n + ' sales)'
      + (rel === 'overlapping' ? ', so the two ranges overlap.' : rel === 'above' ? ', so recent sales were in a higher range.' : ', so recent sales were in a lower range.'),
      note: 'Different units, floors and dates: not a measure of how any one unit changed.' };
  }

  /* S6 floor bands inside the focus size band (full history). Disclosure only. Never says floor caused a difference. */
  function s6(M, p) {
    if (M.sale.selected === 'new') return { tier: 'hidden', na: true, text: null };
    if (!M.floors || !M.floors.rows) return { tier: 'insufficient', text: null, floorUnknown: !!(p && p.floorUnknown) };
    const q = M.floors.rows.filter((r) => r.evidence.n >= T.floor.n && r.evidence.months >= T.floor.months);
    if (q.length < T.floor.minBands) return { tier: 'insufficient', text: null };
    const lo = q.reduce((a, b) => (b.psf.med < a.psf.med ? b : a)), hi = q.reduce((a, b) => (b.psf.med > a.psf.med ? b : a)), sep = hi.psf.q1 > lo.psf.q3, b = bandOf(M, M.focus.bin);
    return { tier: q.length >= 3 ? 'strong' : 'limited', sep, text: 'Sales in the ' + b.short + ' band span ' + M.floors.rows.length + ' floor bands. ' + (sep ? 'The middle-half PSF ranges for floors ' + lo.band + ' and ' + hi.band + ' do not overlap.' : 'The middle-half PSF ranges overlap across the floor bands with enough sales.') + ' (Full history since Sep 2021, so the sales are from different dates.)',
      note: 'Floor is one of several differences (facing, layout, date of sale). This does not show what a floor is worth.' };
  }

  /* S7 sale-type mix. Hidden when the project only has the selected sale type. */
  function s7(M, p) {
    const s = p.sale || {}, other = ['new', 'sub', 'resale'].filter((k) => k !== M.sale.selected && s[k] > 0);
    if (!other.length) return { tier: 'hidden', text: null };
    const nm = { new: 'new-sale (developer)', sub: 'sub-sale', resale: 'resale' };
    if (M.sale.selected !== 'resale' && !s.resale && (s.new || 0) + (s.sub || 0) === p.n) return { tier: 'strong', text: 'Only new-sale and sub-sale transactions are recorded so far. There are no resale transactions yet.' };
    const big = other.filter((k) => s[k] >= 5);
    if (!big.length) return { tier: 'limited', text: 'A few ' + other.map((k) => nm[k]).join(' and ') + ' transactions are also recorded (' + other.map((k) => s[k]).join(' and ') + '). They are priced differently, so they are not mixed in.' };
    return { tier: 'strong', text: 'Also recorded since Sep 2021: ' + big.map((k) => num(s[k]) + ' ' + nm[k]).join(' and ') + ' transactions. They are priced differently, so they are shown separately, not mixed in.' };
  }

  /* S8 lease context. Counted from the lease START year (not completion). The caveat lives in the disclosure, not Layer 1. */
  function s8(M, p, today) {
    const t = p.tenure || {}, y = +String(today || '').slice(0, 4);
    if (!y || t.mixed || t.kind !== 'LEASE' || !t.commenceYear || !t.leaseYears || t.leaseYears > 120) return { tier: 'hidden', text: null };
    const used = y - t.commenceYear, rem = t.leaseYears - used;
    if (used < 0 || rem <= 0) return { tier: 'hidden', text: null };
    return { tier: 'strong', text: t.leaseYears + '-year lease from ' + t.commenceYear + ', with about ' + rem + ' years remaining.', note: 'Years remaining are counted from the lease start year, not the completion year, so treat the figure as approximate.' };
  }

  /* S2b a nearby size band with firmer recent evidence (limited / older states only). */
  function s2b(M) {
    const st = M.answer && M.answer.state; if (st === 'recent' || st === 'no-size' || !M.focus || M.focus.bin == null) return { tier: 'hidden', text: null };
    const own = (bandOf(M, M.focus.bin) || {}).recent, ownN = own ? own.n : 0;
    const good = (M.bands || []).filter((b) => b.bin !== M.focus.bin && Math.abs(b.bin - M.focus.bin) <= T.near.reach && b.recent && b.recent.n >= Math.max(T.near.minN, 2 * ownN) && b.recent.evidence.months >= T.near.minMonths)
      .sort((a, b) => Math.abs(a.bin - M.focus.bin) - Math.abs(b.bin - M.focus.bin) || b.recent.n - a.recent.n);
    if (!good.length) return { tier: 'insufficient', text: null };
    const b = good[0];
    return { tier: 'strong', bin: b.bin, text: 'The nearest size with firmer recent evidence is ' + b.label + ' (' + b.recent.n + ' sales across ' + b.recent.evidence.months + ' months).' };
  }

  /* S10 first NEW SALE recorded. Never "project history": hidden unless the first new-sale month is clear of the window start. */
  function s10(M, p, monthStart) {
    const m = p.monthly && p.monthly.new; if (!m || !m.length || !(p.sale && p.sale.new)) return { tier: 'hidden', text: null };
    const first = addMonths(monthStart || T.windowStart, m[0]);
    if (first < '2021-12') return { tier: 'insufficient', text: null };
    return { tier: 'strong', first, text: 'First new sale recorded: ' + ymLabel(first) + '.' };
  }

  /* Assemble. o: { sizeSqft (user-entered only), today:'YYYY-MM-DD', monthStart } */
  function analyse(M, p, o) {
    o = o || {};
    const R = { s1: s1(M), s2b: s2b(M), s3: s3(M), s4: s4(M, p, o.sizeSqft), s5: s5(M, p), s6: s6(M, p), s7: s7(M, p), s8: s8(M, p, o.today), s10: s10(M, p, o.monthStart) };
    const ok = (r, tiers) => r.text && tiers.indexOf(r.tier) >= 0;
    const found = [];
    const add = (id, r) => { if (found.length < T.maxLayer1) found.push({ id, text: r.text, tier: r.tier }); };
    if (ok(R.s4, ['strong'])) add('s4', R.s4);
    if (ok(R.s2b, ['strong'])) add('s2b', R.s2b);
    // S3: skipped when S2b already names the same band, or when it only restates the hero (every recent sale sits in the hero band).
    const s3dup = (ok(R.s2b, ['strong']) && R.s2b.bin === R.s3.anchorBin) || (R.s3.allInOne && M.focus && M.focus.bin === R.s3.anchorBin);
    if (ok(R.s3, ['strong', 'limited']) && !s3dup) add('s3', R.s3);
    if (ok(R.s7, ['strong', 'limited'])) add('s7', R.s7);
    if (ok(R.s8, ['strong'])) add('s8', R.s8);

    const hasLimited = (r) => r.text && r.tier === 'limited';
    const line = (r, absent, extra) => (r.text ? { status: 'found', text: r.text + (hasLimited(r) ? ' (Limited evidence.)' : ''), note: r.note || null } : { status: r.na ? 'na' : 'absent', text: absent });
    const sizeLines = [];
    if (R.s4.text) sizeLines.push(line(R.s4)); if (R.s3.text) sizeLines.push(line(R.s3)); if (R.s2b.text) sizeLines.push(line(R.s2b));
    if (!sizeLines.length) sizeLines.push({ status: 'absent', text: 'Not enough recent sales to say which size sells most.' });
    const k = M.sale.selected, saleName = k === 'resale' ? 'resale' : k === 'new' ? 'new-sale' : 'sub-sale';
    const act = [];
    if (R.s7.text) act.push({ status: 'found', text: R.s7.text });
    else act.push({ status: 'found', text: 'Only ' + saleName + ' transactions are recorded for this project.' });
    if (R.s10.text) act.push({ status: 'found', text: R.s10.text, note: 'The data starts in Sep 2021, so this is the first new sale in the data, not the project’s launch.' });
    const checklist = [
      { id: 'size', label: 'Size', lines: sizeLines },
      { id: 'recency', label: 'Recency', lines: [R.s1.text ? line(R.s1) : { status: 'absent', text: 'No ' + saleName + ' sales found.' }] },
      { id: 'price', label: 'Price history', lines: [R.s5.text ? line(R.s5) : { status: R.s5.na ? 'na' : 'absent', text: R.s5.na ? 'Not compared across periods for ' + saleName + ' transactions.' : 'Not enough sales in both periods for a reliable comparison.' }] },
      { id: 'floors', label: 'Floor bands', lines: [R.s6.text ? line(R.s6) : { status: R.s6.na ? 'na' : 'absent', text: R.s6.na ? 'Not compared by floor for ' + saleName + ' transactions.' : R.s6.floorUnknown ? 'Floor information is not available for this project.' : 'Not enough sales across floor bands to say.' }] },
      { id: 'activity', label: 'Transaction activity', lines: act }
    ];
    if (R.s8.text) checklist.push({ id: 'lease', label: 'Lease', lines: [{ status: 'found', text: R.s8.text, note: R.s8.note }] });
    return { version: VERSION, found, checklist, results: R };
  }
  return { VERSION, T, analyse, s1, s2b, s3, s4, s5, s6, s7, s8, s10 };
});
