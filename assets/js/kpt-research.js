/* ==========================================================================
   KPT Research journey ("I'm researching a property"): deterministic reasoning. Pure functions: no DOM, no network, no storage.
   UMD: window.KPT_RESEARCH and Node.

   It reads the project data layer (generated aggregates + assets/js/kpt-project.js) and turns it into a view model.
   It calculates NO market statistics of its own: every number comes from the generated cells.

   Rules that never bend
     - Evidence is described with FACTS ("4 sales · 4 months · latest Jun 2026") and STRUCTURAL tags only
       (Single sale / One month only / Older evidence: last 24 months). No Strong/Medium/Weak, no numeric tiers.
     - A comparison never widens its period silently. Every window is reported; the one in use is named.
     - Overall PSF is never compared across projects as a verdict. Like-for-like (sale type, size band, window) comes first.
     - Historical PSF movement is described as historical transaction evidence: never appreciation, never a forecast.
     - Overlapping transaction cells do not mean two developments are substitutes.
     - Market context (district / region) is labelled context, never "comparables".
     - No bedrooms. Size is sqft bands. Floors are URA bands, never an exact floor.
     - Ken's Take only from an Active, in-date authored note. Otherwise nothing.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./kpt-project.js'));
  else root.KPT_RESEARCH = factory(root.KPT_PROJECT);
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';

  /* ---------- constants ---------- */
  const SALE_CODE = { new: 1, sub: 2, resale: 3 };
  const SALE_ORDER = ['resale', 'new', 'sub'];                       // tie-break order (resale preferred)
  const SALE_LABEL = { new: 'new sale', sub: 'sub-sale', resale: 'resale' };
  const SALES_PL = { new: 'new sales', sub: 'sub-sales', resale: 'resale sales' };
  const MIN_SALES = 2, MIN_MONTHS = 2, MIN_SHARE = 0.5;   // V1 'Good recent overlap' rule (approved 2026-10-06)
  const SALE_ONE = { new: 'new sale', sub: 'sub-sale', resale: 'resale' };
  const SALE_NOTE = { new: 'Sold by the developer', sub: 'Sold before completion', resale: 'Sold after completion' };
  const NOT_MEASURED = [
    'Layout and facing', 'The exact unit and floor', 'Developer and product quality', 'Schools and location nuances',
    'Who the likely buyers are when you sell', 'Competing developments', 'Whether any premium is justified',
  ];
  const SUBSTITUTE_NOTE = "Overlapping transaction cells show where sales can be matched by size. They don't mean the two developments are substitutes.";
  const CONTEXT_NOTE = 'Market context, not direct comparables. It includes this project\'s own sales.';
  const HISTORY_NOTE = 'Historical transaction evidence only. It is not appreciation and says nothing about future prices.';
  const PSF_NOTE = 'PSF is approximate: price divided by floor area converted from whole square metres.';
  const FLOOR_NOTE = 'URA floor bands only. This does not show an exact floor.';
  const HEADLINE = { good: 'Good recent overlap for comparison', limited: 'Limited recent overlap', none: 'No like-for-like transaction evidence found' };
  const ANALYTICS_EVENTS = ['research_search', 'research_project_selected', 'research_size_focus', 'research_compare_started', 'research_comparison_viewed', 'research_whatsapp_clicked'];
  const ANALYTICS_KEYS = ['results', 'project_id', 'project_a', 'project_b', 'sale_type', 'window', 'overlap', 'has_evidence', 'context', 'sale_types'];

  /* ---------- small helpers ---------- */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const mIdx = (s) => { const a = String(s).split('-').map(Number); return a[0] * 12 + a[1] - 1; };
  const intToStr = (i) => Math.floor(i / 100) + '-' + String(i % 100).padStart(2, '0');
  const asStr = (v) => (typeof v === 'number' ? intToStr(v) : String(v));
  const fmtMonth = (v) => { const a = asStr(v).split('-').map(Number); return MON[a[1] - 1] + ' ' + a[0]; };
  const monthsAgo = (v, m) => mIdx(m.latestMonth) - mIdx(asStr(v));
  const psf = (n) => '$' + num(n);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const sum = (a, f) => a.reduce((t, x) => t + (f ? f(x) : x), 0);
  const bandLabel = (bin, w) => num(bin) + '–' + num(bin + (w || 100) - 1) + ' sqft';
  const bandShort = (bin) => num(bin) + 's';
  const list = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/;
  // URA writes names in capitals. Title-case for reading; short tokens, numerals and tokens with digits stay upper-case.
  // Reviewed initialisms that must stay upper-case (3+ letters; 1-2 letter tokens already do). Not inferred: short real words (ONE, SKY, BAY) must still title-case. Extend this list when a name is found.
  const ACRONYMS = { AMO: 1, RVG: 1, JLB: 1, OUE: 1, PLQ: 1, SCK: 1, SKT: 1, TMW: 1, YGK: 1, MKZ: 1 };
  function displayName(name) {
    const SMALL = { AT: 1, OF: 1, THE: 1, BY: 1, ON: 1 };
    return String(name || '').split(' ').map((w, i) => {
      if (w === '@' || /\d/.test(w) || ROMAN.test(w) || ACRONYMS[w]) return w;
      if (i > 0 && SMALL[w]) return w.toLowerCase();
      if (w.length <= 2 && /^[A-Z]+$/.test(w)) return w;
      return w.toLowerCase().replace(/(^|[-'(])([a-z])/g, (_, x, y) => x + y.toUpperCase());
    }).join(' ');
  }
  const poss = (n) => n + (/s$/i.test(n) ? "'" : "'s");
  const distLabel = (d) => 'D' + Number(d);
  const winText = (m, win) => P.WINDOW_LABEL(m, win).label;
  const allWin = (m) => m.windows.indexOf('all');
  const periodLabel = (m, i) => { const p = m.periods[i]; return fmtMonth(p.from) + '–' + fmtMonth(p.to); };
  const stubPeriod = (m) => m.periods.length - 1;

  /* ---------- evidence: facts + structural tags ---------- */
  // c: a decoded cell or {n, act, last}. opts.win: window index the evidence came from (tags "Older evidence" when not the 12-month window).
  function evidence(c, m, opts) {
    const o = opts || {}, n = c.n, act = c.act, line = plural(n, 'sale') + ' · ' + plural(act, 'month') + ' · latest ' + fmtMonth(c.last), tags = [];
    if (n === 1) tags.push({ id: 'single', text: 'Single sale' });
    else if (act === 1) tags.push({ id: 'one-month', text: 'One month only' });
    if (o.win !== undefined && o.win > 0) tags.push({ id: 'older', text: 'Older evidence: ' + winText(m, o.win) });
    if (o.noRecent) tags.push({ id: 'none-recent', text: 'Older evidence: no sale in the last 12 months' });
    return { n, months: act, latest: asStr(c.last), latestLabel: fmtMonth(c.last), monthsAgo: monthsAgo(c.last, m), line, tags };
  }
  const only = (e) => (e.tags.some((t) => t.id === 'single' || t.id === 'one-month') ? 'only ' : '');

  /* ---------- sale type ---------- */
  const saleN12 = (p, s) => (p.periods && p.periods[s] && p.periods[s][0] ? p.periods[s][0][0] : 0);
  // D5: the sale type with the most transactions in the latest 12 months; ties prefer resale. If none has a recent sale, fall back to all-time counts.
  function defaultSale(p) {
    const avail = SALE_ORDER.filter((s) => (p.sale[s] || 0) > 0);
    let best = null, bn = -1;
    avail.forEach((s) => { const n = saleN12(p, s); if (n > bn) { bn = n; best = s; } });
    if (bn > 0) return best;
    bn = -1; avail.forEach((s) => { if (p.sale[s] > bn) { bn = p.sale[s]; best = s; } });
    return best;
  }
  const saleOptions = (p) => SALE_ORDER.filter((s) => (p.sale[s] || 0) > 0).map((s) => ({ id: s, label: SALE_LABEL[s], note: SALE_NOTE[s], recent: saleN12(p, s), total: p.sale[s] }));

  /* ---------- size focus ---------- */
  // sqft only. Returns the 100 sqft band or null. The typed number is never stored by this module.
  function focusBin(sqft, m) {
    const v = Number(String(sqft == null ? '' : sqft).replace(/[^0-9.]/g, ''));
    if (!(v >= 100 && v <= 20000)) return null;
    return Math.floor(v / m.bin) * m.bin;
  }

  /* ---------- movement (descriptive only) ---------- */
  // pts: [{label, n, med}] oldest to newest. Never says "rose" or "grew": only "higher / lower in each successive period".
  function movement(pts) {
    const p = pts.filter((x) => x.n > 0);
    if (p.length < 2) return null;
    let up = 0, down = 0;
    for (let i = 1; i < p.length; i++) { if (p[i].med > p[i - 1].med) up++; else if (p[i].med < p[i - 1].med) down++; }
    const steps = p.length - 1, ns = p.map((x) => x.n).join(' → ');
    const dir = up === steps ? 'up' : down === steps ? 'down' : 'mixed';
    return { dir, ns, periods: p.length };
  }
  const moveText = (mv, what) => (!mv ? '' : mv.dir === 'up' ? what + ' was higher in each successive 12-month period with sales (sales per period: ' + mv.ns + ').'
    : mv.dir === 'down' ? what + ' was lower in each successive 12-month period with sales (sales per period: ' + mv.ns + ').'
    : what + ' moved up and down across 12-month periods (sales per period: ' + mv.ns + ').');

  /* ---------- notes (Ken's Take) ---------- */
  const NOTE_FLAGS = [/\bcpf\b/i, /\bloan/i, /\blender/i, /\bfinanc/i, /\bmortgage/i, /\bbedroom/i, /\blease\b/i, /\bltv\b/i];
  const pairKey = (a, b) => [a, b].sort().join('|');
  // Active (default) and not past review_by. Pair notes resolve for A vs B and B vs A alike.
  function eligible(n, today) { return (n.status || 'Active') === 'Active' && n.note && String(n.note).trim() && !(n.review_by && today && today > n.review_by); }
  function matchNote(notes, ids, today) {
    const key = ids.length === 2 ? pairKey(ids[0], ids[1]) : null, attention = [];
    let hit = null;
    (notes || []).forEach((n) => {
      if (!eligible(n, today)) return;
      const ok = key ? n.scope === 'pair' && Array.isArray(n.projects) && n.projects.length === 2 && pairKey(n.projects[0], n.projects[1]) === key
        : n.scope === 'project' && n.project === ids[0];
      if (!ok) return;
      const bad = NOTE_FLAGS.filter((re) => re.test(String(n.note))).map(String);
      if (bad.length) attention.push({ id: n.project || n.projects, code: 'REVIEW_WORDING', detail: bad.join(' ') });
      if (!hit) hit = { note: String(n.note), reviewed_on: n.reviewed_on || null };
    });
    return { ken: hit, attention };
  }

  /* ---------- single project ---------- */
  function analyseProject(p, m, o) {
    o = o || {};
    const sale = o.sale && p.sale[o.sale] > 0 ? o.sale : defaultSale(p), code = SALE_CODE[sale], ALL = allWin(m);
    const name = displayName(p.name), C = P.cells(p, m), saleLabel = SALE_LABEL[sale];
    const w0 = C.window.filter((x) => x.sale === code && x.win === 0), wAll = C.window.filter((x) => x.sale === code && x.win === ALL);
    const monthly = (P.monthly(p, m)[sale] || []), from12 = P.addMonths(m.latestMonth, -11), rec = monthly.filter((x) => x.month >= from12);
    const recent = { n: sum(rec, (x) => x.n), months: rec.length, latest: monthly.length ? monthly[monthly.length - 1].month : null };
    const first = monthly.length ? monthly[0].month : null;
    const model = { id: p.id, name, rawName: p.name, kind: 'project', street: p.street, district: p.district, districtLabel: distLabel(p.district), region: p.seg, tenure: { label: p.tenure.label, mixed: !!p.tenure.mixed, group: m.tenureGroups[p.tenure.group], variants: p.tenure.variants || null },
      sale: { selected: sale, label: saleLabel, note: SALE_NOTE[sale], options: saleOptions(p) }, notes: { psf: PSF_NOTE, history: HISTORY_NOTE, floor: FLOOR_NOTE, context: CONTEXT_NOTE }, notMeasured: NOT_MEASURED.slice() };
    model.evidenceBase = { first, latest: recent.latest, total: p.sale[sale] };

    // ---- focus band: the user's size (if any) else the band with most recent sales (else most all-time sales)
    const byRecent = w0.slice().sort((a, b) => b.n - a.n || bn(wAll, b.bin) - bn(wAll, a.bin) || a.bin - b.bin);
    function bn(arr, bin) { const c = arr.find((x) => x.bin === bin); return c ? c.n : 0; }
    const dominant = byRecent[0] ? byRecent[0].bin : (wAll.slice().sort((a, b) => b.n - a.n || a.bin - b.bin)[0] || {}).bin;
    const req = o.sizeSqft !== undefined && o.sizeSqft !== null && o.sizeSqft !== '' ? focusBin(o.sizeSqft, m) : null;
    const hasCell = req !== null && wAll.some((x) => x.bin === req);
    const focus = req !== null ? hasCell ? req : null : (dominant === undefined ? null : dominant);
    model.focus = { requested: req !== null, bin: focus, label: focus !== null && focus !== undefined ? bandLabel(focus, m.bin) : null, short: focus != null ? bandShort(focus) : null, hasEvidence: req === null ? focus != null : hasCell, userChosen: req !== null };
    if (req !== null && !hasCell) {
      const near = wAll.map((x) => ({ bin: x.bin, d: Math.abs(x.bin - req) })).sort((a, b) => a.d - b.d || a.bin - b.bin).slice(0, 2).map((x) => x.bin).sort((a, b) => a - b);
      model.focus.bin = null; model.focus.nearest = near.map((b) => ({ bin: b, label: bandLabel(b, m.bin), n: bn(wAll, b) })); model.focus.requestedBin = req; model.focus.requestedLabel = bandLabel(req, m.bin);
    }
    model.sizeFocus = focus;

    // ---- recent picture
    const fc0 = focus != null ? w0.find((x) => x.bin === focus) : null, fcAll = focus != null ? wAll.find((x) => x.bin === focus) : null;
    const per0 = p.periods && p.periods[sale] && p.periods[sale][0];
    model.recent = {
      n: recent.n, months: recent.months, latest: recent.latest, latestLabel: recent.latest ? fmtMonth(recent.latest) : null, since: first ? fmtMonth(first) : null,
      psfAll: per0 && per0[0] > 0 ? P.dist5(per0.slice(1, 6)) : null,
      band: fc0 ? { label: bandLabel(focus, m.bin), short: bandShort(focus), n: fc0.n, psf: P.dist5([fc0.min, fc0.q1, fc0.med, fc0.q3, fc0.max]), evidence: evidence(fc0, m, { win: 0 }) } : null,
      noRecent: recent.n === 0,
    };

    // ---- size bands (full history cells, with the 12-month cell alongside)
    model.bands = wAll.map((c) => {
      const r = w0.find((x) => x.bin === c.bin), ev = evidence(c, m, {}), rc = r ? evidence(r, m, { win: 0 }) : null;
      const e2 = evidence(c, m, { noRecent: !r });
      return { bin: c.bin, label: bandLabel(c.bin, m.bin), short: bandShort(c.bin), n: c.n, psf: P.dist5([c.min, c.q1, c.med, c.q3, c.max]), evidence: ev, tags: e2.tags, recent: r ? { n: r.n, psf: P.dist5([r.min, r.q1, r.med, r.q3, r.max]), evidence: rc } : null, isFocus: c.bin === focus, isDominant: c.bin === dominant };
    }).sort((a, b) => a.bin - b.bin);
    model.mix = recent.n > 0 ? w0.map((c) => ({ bin: c.bin, label: bandShort(c.bin), n: c.n })).sort((a, b) => a.bin - b.bin) : [];

    // ---- history (disjoint 12-month periods; the partial earlier period is excluded from the chart)
    const stub = stubPeriod(m), perArr = (p.periods && p.periods[sale]) || [];
    const all = [];
    for (let i = stub - 1; i >= 0; i--) { const a = perArr[i]; if (a && a[0] > 0) all.push({ period: i, label: periodLabel(m, i), n: a[0], q1: a[2], med: a[3], q3: a[4], min: a[1], max: a[5] }); }
    const bandPts = [];
    if (focus != null) for (let i = stub - 1; i >= 0; i--) { const c = C.period.find((x) => x.sale === code && x.bin === focus && x.win === i); if (c) bandPts.push({ period: i, label: periodLabel(m, i), n: c.n, q1: c.q1, med: c.med, q3: c.q3, min: c.min, max: c.max }); }
    const mvAll = movement(all), mvBand = movement(bandPts);
    // mix shift: the band whose share of sales changed most between the earliest and latest period with sales
    let mixShift = null;
    if (all.length >= 2) {
      const e = all[0], l = all[all.length - 1], cnt = (per, bin) => { const c = C.period.find((x) => x.sale === code && x.bin === bin && x.win === per); return c ? c.n : 0; };
      const bins = Array.from(new Set(C.period.filter((x) => x.sale === code && (x.win === e.period || x.win === l.period)).map((x) => x.bin)));
      let best = null;
      bins.forEach((b) => { const d = Math.abs(cnt(l.period, b) / l.n - cnt(e.period, b) / e.n); if (d > 0 && (!best || d > best.d)) best = { b, d }; });
      if (best) mixShift = { bin: best.b, short: bandShort(best.b), earliest: { label: e.label, n: cnt(e.period, best.b), of: e.n }, latest: { label: l.label, n: cnt(l.period, best.b), of: l.n },
        text: 'The ' + bandShort(best.b) + ' band was ' + cnt(e.period, best.b) + ' of ' + e.n + ' sales in ' + e.label + ' and ' + cnt(l.period, best.b) + ' of ' + l.n + ' in ' + l.label + ', so overall PSF over time also reflects a changing mix of sizes.' };
    }
    model.history = { note: HISTORY_NOTE, all: { points: all, movement: mvAll, text: moveText(mvAll, 'Across all sizes, the middle transaction PSF') }, band: focus != null ? { label: bandLabel(focus, m.bin), short: bandShort(focus), points: bandPts, movement: mvBand, text: moveText(mvBand, 'In the ' + bandShort(focus) + ' band, the middle transaction PSF') } : null, mixShift,
      earlierNote: perArr[stub] && perArr[stub][0] > 0 ? plural(perArr[stub][0], 'sale') + ' in ' + fmtMonth(m.periods[stub].from) + ' (partial month) are in the totals but not the chart.' : null };

    // ---- floor bands within the focus band (full history)
    const fl = focus != null ? C.floor.filter((x) => x.sale === code && x.bin === focus).sort((a, b) => a.win - b.win) : [];
    model.floors = { note: FLOOR_NOTE, window: 'full history', band: focus != null ? bandLabel(focus, m.bin) : null, rows: fl.map((c) => ({ band: m.floorBands[c.win], n: c.n, psf: P.dist5([c.min, c.q1, c.med, c.q3, c.max]), evidence: evidence(c, m, {}) })), unknown: p.floorUnknown || 0 };

    // ---- market context (collapsed in the UI): same sale type, same lease-age group, same size band
    model.context = context(p, m, o.peers, sale, focus, C, code);

    // ---- the read (rule-built sentences)
    const read = [];
    if (recent.n > 0) read.push({ id: 'activity', text: (recent.n === 1 ? '1 ' + SALE_ONE[sale] : recent.n + ' ' + SALES_PL[sale]) + ' in the last 12 months, in ' + plural(recent.months, 'different month') + '. The latest was ' + fmtMonth(recent.latest) + '.' });
    else if (recent.latest) read.push({ id: 'activity', text: 'No ' + SALES_PL[sale] + ' in the last 12 months. The latest was ' + fmtMonth(recent.latest) + ', and there are ' + p.sale[sale] + ' in total since ' + fmtMonth(first) + '.' });
    const nb = w0.length;
    if (req !== null && !hasCell) read.push({ id: 'focus', text: 'No ' + SALES_PL[sale] + ' in the ' + bandShort(req) + ' sqft band here. The nearest bands with sales are ' + list(model.focus.nearest.map((x) => bandShort(x.bin))) + '.' });
    else if (req !== null) read.push({ id: 'focus', text: 'In the ' + bandLabel(focus, m.bin) + ' band: ' + plural(fc0 ? fc0.n : 0, 'sale') + ' in the last 12 months and ' + fcAll.n + ' in total (latest ' + fmtMonth(fcAll.last) + ').' });
    else if (recent.n > 0 && nb === 1) read.push({ id: 'mix', text: 'All of them were in the ' + bandLabel(dominant, m.bin) + ' band.' });
    else if (recent.n > 0 && byRecent[0].n * 2 > recent.n) read.push({ id: 'mix', text: byRecent[0].n + ' of the ' + recent.n + ' were in the ' + bandLabel(dominant, m.bin) + ' band, so the overall PSF mostly describes that band. Other sizes trade less often here.' });
    else if (recent.n > 0) read.push({ id: 'mix', text: 'Sales were spread across ' + nb + ' size bands, so one overall PSF does not describe any single unit. See the sizes below.' });
    if (mvBand) read.push({ id: 'movement', text: moveText(mvBand, 'In the ' + bandShort(focus) + ' band, the middle transaction PSF') });
    model.read = read;
    model.evidence = { recent: recent.n > 0 ? evidence({ n: recent.n, act: recent.months, last: Number(recent.latest.replace('-', '')) }, m, {}) : null, note: PSF_NOTE };
    model.state = !monthly.length ? 'no-sales' : recent.n === 0 ? 'no-recent' : recent.n === 1 ? 'single-recent' : 'ok';

    // ---- Ken's Take: only from an authored, Active, in-date note
    const nt = matchNote(o.notes, [p.id], o.today);
    model.ken = nt.ken; model.attention = nt.attention;
    model.wa = waMessage([name]);
    return model;
  }

  function context(p, m, peers, sale, bin, C, code) {
    if (!peers) return null;
    const ALL = allWin(m), last = m.tenureGroups.length - 1;
    const tg = sale === 'resale' ? (p.tenure.group === 0 ? last : p.tenure.group) : 0, useBin = bin == null ? -1 : bin;
    const own = (win) => { const c = C.window.find((x) => x.sale === code && x.bin === bin && x.win === win); return bin == null ? (C.window.filter((x) => x.sale === code && x.win === win).reduce((t, x) => t + x.n, 0)) : c ? c.n : 0; };
    const rows = [];
    [['district', 'District ' + distLabel(p.district), peers.district], ['region', p.seg, peers.region]].forEach((s) => {
      if (!s[2]) return;
      const wins = [0, ALL].map((win) => {
        const c = P.peerCells(s[2], { sale: code, tenureGroup: tg, bin: useBin, win }, m)[0]; if (!c) return null;
        const mine = own(win), share = c.n ? mine / c.n : 0;
        return { win, label: winText(m, win), n: c.n, projects: c.projects, topProjectShare: c.topProjectShare, activeMonths: c.activeMonths, lastMonth: c.lastMonth, psf: c.psf, ownN: mine, ownShare: share, mostlyOwn: mine * 2 > c.n, older: win > 0 };
      }).filter(Boolean);
      rows.push({ scope: s[0], label: s[1], windows: wins });
    });
    return { title: 'Market context', note: CONTEXT_NOTE, sale: SALE_LABEL[sale], saleCode: code, tenureGroup: m.tenureGroups[tg], tenureText: sale === 'resale' ? 'lease started ' + m.tenureGroups[tg].replace('–', '–') + ' years ago' : null, band: bin == null ? 'all sizes' : bandLabel(bin, m.bin), allSizes: bin == null, rows };
  }

  /* ---------- comparison ---------- */
  // Names which side(s) of a matched band rest on a single sale or one month, so a headline gap is never read without it.
  function cautionText(na, ea, nb, eb) {
    const side = (nm, e) => (e.tags.some((t) => t.id === 'single' || t.id === 'one-month') ? poss(nm) + ' side is ' + plural(e.n, 'sale') + (e.n > 1 ? ', all in one month' : '') : null);
    const a = side(na, ea), b = side(nb, eb);
    return a || b ? 'Treat this as indicative: ' + (a && b ? a + '; ' + b : a || b) + '.' : null;
  }
  function analyseComparison(A, B, m, o) {
    o = o || {};
    const cmp = P.compare(A, B, m), nameA = displayName(A.name), nameB = displayName(B.name), ALL = allWin(m), W12 = m.windows.indexOf(12);
    const model = { kind: 'comparison', a: { id: A.id, name: nameA, rawName: A.name }, b: { id: B.id, name: nameB, rawName: B.name }, pairKey: pairKey(A.id, B.id), windows: cmp.windows, notMeasured: NOT_MEASURED.slice(), notes: { psf: PSF_NOTE, history: HISTORY_NOTE, floor: FLOOR_NOTE, substitute: SUBSTITUTE_NOTE } };
    model.same = A.id === B.id;
    const shared = cmp.saleTypesShared.slice();
    model.sale = { shared, options: SALE_ORDER.filter((s) => shared.indexOf(s) > -1).map((s) => ({ id: s, label: SALE_LABEL[s], note: SALE_NOTE[s] })) };
    const nt = matchNote(o.notes, [A.id, B.id], o.today); model.ken = nt.ken; model.attention = nt.attention; model.wa = waMessage([nameA, nameB]);
    const facts = (sale) => [
      { label: 'Street', a: A.street, b: B.street }, { label: 'District', a: distLabel(A.district), b: distLabel(B.district) }, { label: 'Region', a: A.seg, b: B.seg },
      { label: 'Lease', a: A.tenure.label, b: B.tenure.label },
      { label: 'Typical unit size', a: A.dist && A.dist[sale] ? num(A.dist[sale].sqft[2]) + ' sqft' : '—', b: B.dist && B.dist[sale] ? num(B.dist[sale].sqft[2]) + ' sqft' : '—' },
      { label: 'Sales in the data', a: String(A.sale[sale] || 0), b: String(B.sale[sale] || 0) }];
    if (!shared.length) {
      model.overlap = 'none'; model.headline = HEADLINE.none; model.status = 'none'; model.sale.selected = null;
      const has = (p) => { const l = SALE_ORDER.filter((x) => (p.sale[x] || 0) > 0).map((x) => SALES_PL[x]); return l.length ? list(l) : 'no sales'; };
      model.reasons = ['No shared sale type. ' + nameA + ' has ' + has(A) + '; ' + nameB + ' has ' + has(B) + '. Sales are only matched within the same sale type, so there is nothing to match here.'];
      model.differences = facts(defaultSale(A) || 'resale'); model.ladder = []; model.bands = []; model.activeWindow = null;
      // Complete the model so the page can render this valid result (no shared evidence) instead of failing.
      model.firstWindowWithMatch = null; model.windowLabel = null; model.older = false; model.olderTag = null; model.focusNote = null;
      model.direction = { kind: 'none', a: 0, b: 0, level: 0, text: '' }; model.history = { note: HISTORY_NOTE, bands: [] }; model.floors = { note: FLOOR_NOTE, window: 'full history', rows: [] }; model.overall = null;
      model.overlapRule = { version: 'v1', kind: 'kpt-presentation-rule', minSalesEachSide: MIN_SALES, minMonthsEachSide: MIN_MONTHS, window: m.windows[W12], minShareExclusive: MIN_SHARE, inputs: null, result: 'none' };
      model.interpretation = null;
      return model;
    }
    const tot = (p, s) => saleN12(p, s) * 1;
    let sale = o.sale && shared.indexOf(o.sale) > -1 ? o.sale : null;
    if (!sale) { let bn = -1; SALE_ORDER.filter((s) => shared.indexOf(s) > -1).forEach((s) => { const n = tot(A, s) + tot(B, s); if (n > bn) { bn = n; sale = s; } }); if (bn <= 0) { bn = -1; SALE_ORDER.filter((s) => shared.indexOf(s) > -1).forEach((s) => { const n = (A.sale[s] || 0) + (B.sale[s] || 0); if (n > bn) { bn = n; sale = s; } }); } }
    const code = SALE_CODE[sale], bs = cmp.bySale[sale], CA = P.cells(A, m), CB = P.cells(B, m);
    model.sale.selected = sale; model.sale.label = SALE_LABEL[sale];
    const winTot = (C, w) => sum(C.window.filter((x) => x.sale === code && x.win === w), (x) => x.n);
    const supported = (c) => c.a.n >= MIN_SALES && c.b.n >= MIN_SALES && c.a.act >= MIN_MONTHS && c.b.act >= MIN_MONTHS;
    const ladder = bs.windows.map((w, i) => {
      const tA = winTot(CA, i), tB = winTot(CB, i), cA = sum(w.like, (c) => c.overlap.nA), cB = sum(w.like, (c) => c.overlap.nB);
      const sup = w.like.filter(supported), sA = sum(sup, (c) => c.overlap.nA), sB = sum(sup, (c) => c.overlap.nB);
      return { win: i, label: w.label, months: w.months, bands: w.like.length, hasMatch: w.like.length > 0, shared: w.like.map((c) => bandShort(c.bin)), coverage: { aN: cA, aOf: tA, bN: cB, bOf: tB, a: tA ? cA / tA : 0, b: tB ? cB / tB : 0 }, supported: { bands: sup.length, aShare: tA ? sA / tA : 0, bShare: tB ? sB / tB : 0 } };
    });
    model.ladder = ladder;
    const w0 = ladder[W12], firstWin = bs.firstWindowWithMatch;
    const good = !!w0 && w0.supported.bands > 0 && w0.supported.aShare > MIN_SHARE && w0.supported.bShare > MIN_SHARE;
    model.overlap = firstWin === null ? 'none' : good ? 'good' : 'limited';
    // Exposed so the rule can be recalibrated later without touching the data layer. A KPT presentation rule, not a statistical or valuation standard.
    model.overlapRule = { version: 'v1', kind: 'kpt-presentation-rule', minSalesEachSide: MIN_SALES, minMonthsEachSide: MIN_MONTHS, window: m.windows[W12], minShareExclusive: MIN_SHARE,
      inputs: w0 ? { sharedBands: w0.bands, qualifyingBands: w0.supported.bands, shareA: w0.supported.aShare, shareB: w0.supported.bShare } : null, result: model.overlap };
    model.headline = HEADLINE[model.overlap];
    const active = o.window !== undefined && o.window !== null && o.window >= 0 && o.window < ladder.length ? o.window : (firstWin === null ? 0 : firstWin);
    model.activeWindow = active; model.firstWindowWithMatch = firstWin; model.windowLabel = ladder[active].label;
    model.older = active > 0;
    model.olderTag = active > 0 ? 'Older evidence: ' + winText(m, active) : null;
    const fbin = o.sizeSqft !== undefined && o.sizeSqft !== null && o.sizeSqft !== '' ? focusBin(o.sizeSqft, m) : null;
    // bands for the active window
    const like = bs.windows[active].like;
    const bands = like.map((c) => {
      const ea = evidence({ n: c.a.n, act: c.a.act, last: c.overlap.lastMonthA }, m, { win: active }), eb = evidence({ n: c.b.n, act: c.b.act, last: c.overlap.lastMonthB }, m, { win: active });
      const ma = c.a.psf.med, mb = c.b.psf.med, lo = Math.min(ma, mb), pct = lo ? Math.round(Math.abs(mb - ma) / lo * 100) : 0, dir = pct === 0 ? 'level' : mb > ma ? 'b' : 'a';   // % is of the LOWER median, so A vs B and B vs A agree
      const overlapQ = Math.max(c.a.psf.q1, c.b.psf.q1) <= Math.min(c.a.psf.q3, c.b.psf.q3);
      return { bin: c.bin, label: bandLabel(c.bin, m.bin), short: bandShort(c.bin), isFocus: fbin !== null && c.bin === fbin, supported: supported(c),
        a: { n: c.a.n, psf: c.a.psf, evidence: ea }, b: { n: c.b.n, psf: c.b.psf, evidence: eb },
        gap: { pct, dir, rangesOverlap: overlapQ, caution: cautionText(nameA, ea, nameB, eb), text: dir === 'level' ? 'Middle PSF is about the same.' : (dir === 'b' ? nameB : nameA) + ' middle PSF is ' + pct + '% higher in this band.' } };
    });
    bands.sort((x, y) => (y.isFocus ? 1 : 0) - (x.isFocus ? 1 : 0) || Math.min(y.a.n, y.b.n) - Math.min(x.a.n, x.b.n) || x.bin - y.bin);
    model.bands = bands;
    const nA = bands.filter((b) => b.gap.dir === 'a').length, nBn = bands.filter((b) => b.gap.dir === 'b').length, nL = bands.filter((b) => b.gap.dir === 'level').length;
    let dirKind = 'none';
    if (bands.length === 1) dirKind = 'single'; else if (bands.length > 1) dirKind = nA && nBn ? 'mixed' : (nA && !nBn && !nL) ? 'a' : (nBn && !nA && !nL) ? 'b' : 'mostly';
    model.direction = { kind: dirKind, a: nA, b: nBn, level: nL,
      text: !bands.length ? '' : dirKind === 'mixed' ? 'The direction is mixed: ' + nameA + ' is higher in ' + plural(nA, 'band') + ' and ' + nameB + ' in ' + nBn + (nL ? ', with ' + nL + ' about level' : '') + '. Neither project is cheaper or better overall.'
        : dirKind === 'single' ? 'One shared band, so this is one data point, not a pattern.'
        : 'In these bands, ' + (nA ? nameA : nameB) + ' has the higher middle PSF' + (dirKind === 'mostly' ? ' in ' + (nA || nBn) + ' of ' + bands.length + ', the rest about level' : ' in every one') + '. That describes these sales only. It does not say which is better value.' };
    model.focusNote = fbin === null ? null : bands.some((b) => b.isFocus) ? null : 'Neither project has matched sales in the ' + bandLabel(fbin, m.bin) + ' band in this window.';

    // the explanation: why, with counts
    const reasons = [], listSh = (w) => list(w.shared);
    const cov = (w) => 'These bands cover ' + w.coverage.aN + ' of ' + w.coverage.aOf + ' of ' + poss(nameA) + ' sales and ' + w.coverage.bN + ' of ' + w.coverage.bOf + ' of ' + poss(nameB) + ' in that window.';
    if (model.overlap === 'good') {
      reasons.push('Both have ' + SALE_LABEL[sale] + ' sales in the last 12 months in ' + plural(w0.bands, 'shared size band') + ' (' + listSh(w0) + ' sqft).');
      reasons.push(cov(w0));
    } else if (model.overlap === 'limited') {
      if (firstWin === W12) {
        reasons.push('There ' + (w0.bands === 1 ? 'is 1 shared size band' : 'are ' + w0.bands + ' shared size bands') + ' in the last 12 months (' + listSh(w0) + ' sqft), but the matched evidence is thin or covers a small part of the sales.');
        reasons.push(cov(w0));
      } else {
        reasons.push('No shared size band in the last 12 months.');
        const f = bs.windows[firstWin].like[0], fw = ladder[firstWin];
        const ea = evidence({ n: f.a.n, act: f.a.act, last: f.overlap.lastMonthA }, m, {}), eb = evidence({ n: f.b.n, act: f.b.act, last: f.overlap.lastMonthB }, m, {});
        const side = (nm, e) => nm + ' has ' + only(e) + plural(e.n, 'sale') + ' there' + (e.n > 1 && e.months === 1 ? ', all in one month' : '') + ' (latest ' + e.latestLabel + ')';
        reasons.push('The first shared evidence is in the ' + winText(m, firstWin) + ' (' + listSh(fw) + ' sqft). ' + side(nameA, ea) + '; ' + side(nameB, eb) + '. This is older evidence.');
        reasons.push(cov(fw));
      }
      if (firstWin < ALL && ladder[ALL].hasMatch) reasons.push('Fuller history is available: ' + plural(ladder[ALL].bands, 'shared size band') + ' over ' + winText(m, ALL) + '.');
    } else {
      reasons.push(bs.reasons[0] === 'no overlapping unit sizes' ? 'The two projects have not sold units of overlapping sizes.' : 'Sizes overlap in range, but there is no shared 100 sqft band in any window.');
      reasons.push('Both have ' + SALE_LABEL[sale] + ' sales, but none can be matched on size.');
    }
    if (model.overlap !== 'none') reasons.push(SUBSTITUTE_NOTE);
    model.reasons = reasons;

    // like-for-like history inside shared bands (descriptive only)
    const stub = stubPeriod(m), hist = {};
    bs.periods.forEach((x) => { if (x.period >= stub) return; (hist[x.bin] = hist[x.bin] || []).push(x); });
    model.history = { note: HISTORY_NOTE, bands: Object.keys(hist).map(Number).filter((bin) => hist[bin].length >= 2).map((bin) => {
      const pts = hist[bin].sort((x, y) => y.period - x.period).map((x) => ({ period: x.period, label: periodLabel(m, x.period), a: { n: x.a.n, med: x.a.psf.med }, b: { n: x.b.n, med: x.b.psf.med } }));
      const ma = movement(pts.map((x) => ({ n: x.a.n, med: x.a.med }))), mb = movement(pts.map((x) => ({ n: x.b.n, med: x.b.med })));
      const pre = 'In the ' + bandShort(bin) + ' band, ';
      const text = ma && mb && ma.dir === mb.dir ? pre + (ma.dir === 'mixed' ? 'both projects\u2019 middle transaction PSF moved up and down across 12-month periods.' : 'both projects\u2019 middle transaction PSF was ' + (ma.dir === 'up' ? 'higher' : 'lower') + ' in each successive 12-month period with shared sales.') : pre + 'the two projects\u2019 middle transaction PSF moved differently across 12-month periods.';
      return { bin, label: bandLabel(bin, m.bin), short: bandShort(bin), points: pts, text, total: sum(pts, (x) => x.a.n + x.b.n) };
    }).sort((x, y) => y.total - x.total) };
    model.floors = { note: FLOOR_NOTE, window: 'full history', rows: bs.floor.map((f) => ({ bin: f.bin, short: bandShort(f.bin), band: f.floorBand, a: { n: f.a.n, psf: f.a.psf, evidence: evidence({ n: f.a.n, act: f.a.act, last: f.overlap.lastMonthA }, m, {}) }, b: { n: f.b.n, psf: f.b.psf, evidence: evidence({ n: f.b.n, act: f.b.act, last: f.overlap.lastMonthB }, m, {}) } })).filter((r) => bands.some((b) => b.bin === r.bin)) };
    // why overall PSF is not the comparison
    const dA = A.dist && A.dist[sale], dB = B.dist && B.dist[sale];
    model.overall = { note: 'Overall middle PSF mixes every unit size sold, so it is shown last and is not the comparison.', a: dA ? { n: dA.n, psf: P.dist5(dA.psf), sqft: P.dist5(dA.sqft) } : null, b: dB ? { n: dB.n, psf: P.dist5(dB.psf), sqft: P.dist5(dB.sqft) } : null,
      mixText: dA && dB ? (ladder[active].coverage.a > 0.5 && ladder[active].coverage.b > 0.5 ? 'In this window, most sales in both projects sit in the shared bands, so the unit mixes overlap.' : 'The unit mixes differ: ' + poss(nameA) + ' typical unit is about ' + num(dA.sqft[2]) + ' sqft and ' + poss(nameB) + ' about ' + num(dB.sqft[2]) + ' sqft.') : '' };
    model.differences = facts(sale);
    model.state = model.overlap;
    model.interpretation = interpret(model);
    return model;
  }

  /* ---------- "What the numbers suggest": deterministic reading of an existing comparison model ----------
     Reads only fields already on the model. No new data, no thresholds: "supported" is the existing KPT cell rule (2+ sales in 2+ months on both sides),
     and "small vs wider" is structural (middle PSF ranges overlap, or they do not). Never says better/cheaper/undervalued and never predicts. */
  const INTERP_VERSION = 'v1';
  // Build stamp. research/index.html checks it matches, so a stale cached copy of one file can never silently pair with a newer other file.
  const BUILD = '2026-10-06.4';
  const hi = (b, A, B) => (b.gap.dir === 'b' ? B : b.gap.dir === 'a' ? A : null);
  function interpret(M) {
    if (!M || M.overlap === 'none' || !M.bands || !M.bands.length) return null;
    const A = M.a.name, B = M.b.name, sup = M.bands.filter((b) => b.supported), unsup = M.bands.length - sup.length, w = M.ladder[M.activeWindow], win = M.windowLabel;
    const byBin = (x, y) => x.bin - y.bin, sb = sup.slice().sort(byBin), sqft = (arr) => list(arr.map((b) => b.short)) + ' sqft';
    const nA = sb.filter((b) => b.gap.dir === 'a').length, nB = sb.filter((b) => b.gap.dir === 'b').length, nL = sb.filter((b) => b.gap.dir === 'level').length;
    const kind = !sb.length ? 'none' : sb.length === 1 ? 'single' : nA && nB ? 'mixed' : nA === sb.length ? 'a' : nB === sb.length ? 'b' : nA || nB ? 'mostly' : 'level';
    const higherId = kind === 'a' ? M.a.id : kind === 'b' ? M.b.id : kind === 'mostly' ? (nA ? M.a.id : M.b.id) : null;
    const hiName = higherId === M.a.id ? A : higherId === M.b.id ? B : null, loName = hiName === A ? B : A;
    const overl = sb.filter((b) => b.gap.rangesOverlap && b.gap.dir !== 'level'), sepr = sb.filter((b) => !b.gap.rangesOverlap && b.gap.dir !== 'level');
    const withGap = sb.filter((b) => b.gap.dir !== 'level').slice().sort((x, y) => y.gap.pct - x.gap.pct || x.bin - y.bin);
    const widest = withGap[0] || null, narrowest = withGap.length > 1 ? withGap[withGap.length - 1] : null;
    // evidence line: counts, coverage, recency (facts only)
    const latest = M.bands.reduce((t, b) => [b.a.evidence, b.b.evidence].reduce((u, e) => (e.latest > u.latest ? e : u), t), M.bands[0].a.evidence);
    const evLine = plural(M.bands.length, 'shared size band') + ' in the ' + win + ' (' + sqft(M.bands.slice().sort(byBin)) + '). ' + (sup.length ? plural(sup.length, 'band') + ' ' + (sup.length === 1 ? 'has' : 'have') : 'No band has') + ' at least 2 sales in at least 2 months for both projects. The shared bands cover ' + w.coverage.aN + ' of ' + poss(A) + ' ' + w.coverage.aOf + ' sales and ' + w.coverage.bN + ' of ' + poss(B) + ' ' + w.coverage.bOf + '. Latest matched sale: ' + latest.latestLabel + '.';
    const out = { version: INTERP_VERSION, kind: 'full', state: 'full', title: 'What the numbers suggest', paragraphs: [], evidence: { text: evLine, sharedBands: M.bands.length, supportedBands: sup.length, window: win, coverage: w.coverage }, question: '', basis: { direction: kind, higher: higherId, higherName: hiName, bandsA: nA, bandsB: nB, bandsLevel: nL, overlapBands: overl.map((b) => b.bin), separateBands: sepr.map((b) => b.bin), widest: widest ? { bin: widest.bin, pct: widest.gap.pct, higher: hi(widest, M.a.id, M.b.id) } : null, narrowest: narrowest ? { bin: narrowest.bin, pct: narrowest.gap.pct } : null, overlap: M.overlap, olderWindow: M.older } };
    const P_ = out.paragraphs, add = (id, text) => P_.push({ id, text });
    const windowNote = M.older ? 'There is no shared size band in the last 12 months. This uses the ' + win + ', which is older evidence. ' : '';
    // ---- thin evidence is the main message
    if (M.overlap === 'limited' || !sup.length) {
      out.kind = out.state = 'thin';
      add('lead', windowNote + (!sup.length ? 'The evidence here is thin. ' + plural(M.bands.length, 'shared size band') + ' in the ' + win + ' ' + (M.bands.length === 1 ? 'has' : 'have') + ' too few sales on at least one side to describe a direction.'
        : 'The matched evidence is limited: ' + plural(M.bands.length, 'shared size band') + ' in the ' + win + ', covering only part of the sales. Read the direction below as indicative only.'));
      if (sup.length && kind !== 'none') add('direction', kind === 'mixed' ? 'In the ' + plural(sup.length, 'band') + ' with enough sales (' + sqft(sb) + '), the direction is mixed: ' + A + ' is higher in ' + nA + ' and ' + B + ' in ' + nB + '.'
        : kind === 'single' ? 'In the one band with enough sales (' + sqft(sb) + '), ' + (hiName ? hiName + ' has the higher middle PSF by about ' + sb[0].gap.pct + '%' : 'the middle PSF is about the same') + '. One band is a single data point, not a pattern.'
        : 'In the ' + plural(sup.length, 'band') + ' with enough sales (' + sqft(sb) + '), ' + (hiName ? hiName + ' has the higher middle PSF' + (kind === 'mostly' ? ' in ' + (nA || nB) + ' of ' + sb.length : '') : 'the middle PSF is about the same') + '.');
      out.question = 'Before reading anything into the gap, look for more like-for-like evidence: a longer window, or the size you would actually consider. The numbers cannot yet say whether the projects price differently.';
      return out;
    }
    // ---- supported evidence: direction, size of gap, ranges, strength
    add('lead', windowNote + (kind === 'mixed' ? 'The direction is mixed across comparable sizes: ' + A + ' has the higher middle PSF in ' + plural(nA, 'band') + ' (' + sqft(sb.filter((b) => b.gap.dir === 'a')) + ') and ' + B + ' in ' + plural(nB, 'band') + ' (' + sqft(sb.filter((b) => b.gap.dir === 'b')) + ')' + (nL ? ', with ' + nL + ' about level' : '') + '.'
      : kind === 'single' ? 'There is one band with enough sales to compare (' + sqft(sb) + '), so this is a single data point, not a pattern. ' + (hiName ? hiName + ' has the higher middle PSF there, by about ' + sb[0].gap.pct + '%.' : 'The middle PSF is about the same.')
      : kind === 'level' ? 'Across the ' + plural(sb.length, 'comparable size band') + ', the middle PSF is about the same.'
      : hiName + ' generally transacts at a higher PSF than ' + loName + ' across comparable unit sizes' + (kind === 'mostly' ? ': higher in ' + (nA || nB) + ' of ' + sb.length + ' bands, the rest about level' : ' (' + sqft(sb) + ')') + '.'));
    if (kind !== 'single' && withGap.length) {
      const parts = [];
      if (overl.length && sepr.length) parts.push('The middle ranges overlap in ' + sqft(overl) + ', so those gaps sit within the spread of sales. They do not overlap in ' + sqft(sepr) + ', where the two projects\' sales separate.');
      else if (overl.length) parts.push('The middle ranges overlap in ' + (overl.length === sb.length ? 'every comparable band' : sqft(overl)) + ', so the gaps sit within the spread of sales seen.');
      else if (sepr.length) parts.push('The middle ranges do not overlap in ' + (sepr.length === sb.length ? 'any comparable band' : sqft(sepr)) + ', so the separation is visible in the sales themselves.');
      parts.push('The gap in middle PSF is ' + (narrowest && narrowest.gap.pct !== widest.gap.pct ? 'about ' + narrowest.gap.pct + '% in the ' + narrowest.short + ' band and about ' + widest.gap.pct + '% in the ' + widest.short + ' band' : 'about ' + widest.gap.pct + '% in the ' + widest.short + ' band') + '.');
      add('size', parts.join(' '));
    }
    add('strength', 'This reads transactions only. ' + (unsup ? plural(unsup, 'other shared band') + ' ' + (unsup === 1 ? 'has' : 'have') + ' too few sales and ' + (unsup === 1 ? 'is' : 'are') + ' left out of this reading. ' : '') + 'The cards below show every band.');
    add('caution', hiName ? 'This does not mean ' + hiName + ' is the better buy, and it does not mean ' + loName + ' is. Transaction PSF cannot tell you whether the difference is justified.' : 'This does not mean either project is the better buy. Transaction PSF cannot tell you whether a difference is justified.');
    out.question = kind === 'mixed' ? 'Because the direction depends on size, the question to investigate is which band matches the unit you would actually consider, and what differs between the projects at that size: layout, floor, facing, product and location.'
      : hiName ? 'The question to investigate is whether the higher PSF at ' + hiName + ' is justified for your specific unit, layout, floor, facing and the other differences between the projects. That judgement is not in the transactions.'
      : 'The question to investigate is what differs between the projects for your specific unit: layout, floor, facing, product and location. That judgement is not in the transactions.';
    return out;
  }

  /* ---------- suggestions, WhatsApp, analytics, routes ---------- */
  // D10: same district only, labelled as such. Same district does not establish comparability.
  function sameDistrict(index, id, limit) {
    const F = P.fieldMap(index.fields), me = index.rows.find((r) => r[F.id] === id);
    if (!me) return { label: null, rows: [] };
    const rows = index.rows.filter((r) => r[F.district] === me[F.district] && r[F.id] !== id).sort((a, b) => b[F.n] - a[F.n] || (a[F.name] < b[F.name] ? -1 : 1)).slice(0, limit || 6)
      .map((r) => ({ id: r[F.id], name: displayName(r[F.name]), n: r[F.n], last: r[F.last] }));
    return { label: 'Other projects in ' + distLabel(me[F.district]), rows };
  }
  // The only things that ever reach WhatsApp: project names selected from our own index. Never typed text, size or budget.
  function waMessage(names) {
    const n = (names || []).filter(Boolean).slice(0, 2);
    return n.length === 2 ? "Hi Ken, I'm looking at " + n[0] + ' vs ' + n[1] + ' and would like your view.' : n.length === 1 ? "Hi Ken, I'm looking at " + n[0] + ' and would like your view.' : "Hi Ken, I'm researching a property and would like your view.";
  }
  const bucket = (n) => (n <= 0 ? '0' : n === 1 ? '1' : n <= 5 ? '2-5' : '6+');
  // Allow-list only. No typed search text, typed size, budget or any other free text can pass through.
  function analytics(event, d) {
    if (ANALYTICS_EVENTS.indexOf(event) === -1) return null;
    d = d || {}; const out = {}, idOk = (v) => typeof v === 'string' && /^[a-z0-9-]{1,80}$/.test(v);
    if (event === 'research_search') out.results = bucket(Number(d.results) || 0);
    ['project_id', 'project_a', 'project_b'].forEach((k) => { if (idOk(d[k])) out[k] = d[k]; });
    if (['new', 'sub', 'resale'].indexOf(d.sale_type) > -1) out.sale_type = d.sale_type;
    if (['12m', '24m', '36m', 'all'].indexOf(d.window) > -1) out.window = d.window;
    if (['good', 'limited', 'none'].indexOf(d.overlap) > -1) out.overlap = d.overlap;
    if (typeof d.has_evidence === 'boolean') out.has_evidence = d.has_evidence;
    if (['project', 'comparison'].indexOf(d.context) > -1) out.context = d.context;
    if (Number.isInteger(d.sale_types) && d.sale_types >= 0 && d.sale_types <= 3) out.sale_types = d.sale_types;
    return out;
  }
  const windowKey = (m, w) => (m.windows[w] === 'all' ? 'all' : m.windows[w] + 'm');
  function parseHash(h) {
    const s = String(h || '').replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean), id = (x) => (/^[a-z0-9-]{1,80}$/.test(x || '') ? x : null), sale = (x) => (SALE_CODE[x] ? x : null);
    if (s[0] === 'p' && id(s[1])) return { view: 'project', id: s[1], sale: sale(s[2]) };
    if (s[0] === 'compare' && id(s[1]) && id(s[2])) return { view: 'compare', a: s[1], b: s[2], sale: sale(s[3]) };
    if (s[0] === 'compare' && id(s[1])) return { view: 'pick', a: s[1] };
    return { view: 'home' };
  }
  const buildHash = (v) => (v.view === 'project' ? '#/p/' + v.id + (v.sale ? '/' + v.sale : '') : v.view === 'compare' ? '#/compare/' + v.a + '/' + v.b + (v.sale ? '/' + v.sale : '') : v.view === 'pick' ? '#/compare/' + v.a : '#/');

  return { BUILD, analyseProject, analyseComparison, interpret, evidence, defaultSale, saleOptions, focusBin, movement, matchNote, pairKey, sameDistrict, waMessage, analytics, parseHash, buildHash, displayName, bandLabel, bandShort, fmtMonth, monthsAgo, windowKey, num, psf,
    SALE_LABEL, NOT_MEASURED, HEADLINE, ANALYTICS_EVENTS, ANALYTICS_KEYS, SUBSTITUTE_NOTE, CONTEXT_NOTE, HISTORY_NOTE, PSF_NOTE, FLOOR_NOTE };
});
