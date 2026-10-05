/* ==========================================================================
   KPT V1 engine: "At around this budget, what did buyers actually get?"
   Implements the approved spec (KPT V1 Engine Spec). Pure functions, no DOM, no network. UMD: window.KPT_ENGINE and Node.

   Input  : route stats for one budget step (from tools/market-data/build-route-stats.js) + index meta + optional Ken notes.
   Output : { state, fallback[], lead, insights[], ec, footer, ken, audit }.  `audit` explains every conclusion.
   The engine never infers bedrooms and never states current availability. All thresholds come from the config object.
   Visitor-facing presentation is NOT here (UI is a later stage); `sentences` are data for it.
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.KPT_ENGINE = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = '1.0.0';
  const DEFAULTS = {
    narrow_pct: 5, wide_pct: 10, budget_step: 10000, discovery_min_n: 15,
    solid_min_n: 30, solid_min_projects: 8, solid_max_top: 0.25,
    usable_min_n: 15, usable_min_projects: 4, usable_max_top: 0.40,
    new_launch_grade_cap: 'Usable', few_projects_flag: 8,
    grade_weight: { Solid: 1.0, Usable: 0.7, Concentrated: 0.3 },
    min_ratio: 1.15, min_abs_diff_sqft: 100, require_iqr_separation: true,
    stability_median_shift: 0.10, stability_min_ratio_wide: 1.10,
    context_factor: [1.0, 0.85, 0.7], coverage_base: 0.5,
    support_bonus: 0.25, support_cap: 2, support_min_conf: 0.7,
    min_insight_score: 0.15, max_insights: 3, min_insights: 2, max_indicative_insights: 1,
    conflict_dominance: 2.0, thin_market_wide_deals: 100, size_rounding: 50, ec_min_grade: 'Usable',
    freshness_stale_days: 120, freshness_expired_days: 270, min_budget: 600000, max_budget: 5000000, shard_size: 500000,
  };
  const LEVEL = ['Insufficient', 'Concentrated', 'Usable', 'Solid'];
  const FH = 'Freehold / 999-yr', REGION = { OCR: 0, RCR: 1, CCR: 2 }, AGE = { '0–10': 0, '10–25': 1, '25+': 2 };

  // ---------- small helpers ----------
  const merge = (a, b) => { const o = JSON.parse(JSON.stringify(a)); Object.keys(b || {}).forEach((k) => { o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? Object.assign({}, o[k], b[k]) : b[k]; }); return o; };
  const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x));
  function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }
  const dec = (a) => (a ? { n: a[0], projects: a[1], top: a[2], medPrice: a[3], med: a[4], lo: a[5], hi: a[6] } : null);
  const pc = (v) => Math.round(v * 100) + '%';
  const money = (v) => '$' + (v / 1e6).toFixed(2) + 'm';
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rnd = (v, E) => Math.round(v / E.size_rounding) * E.size_rounding;
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = (ym) => { const m = /^(\d{4})-(\d{2})$/.exec(ym || ''); return m ? MONTHS[+m[2] - 1] + ' ' + m[1] : ym; };
  const daysBetween = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / 86400000);

  const routeId = (r) => r.region + ' ' + (r.status === 'New' ? 'new' : r.tenure === FH ? 'FH/999' : 'resale ' + r.tenure);
  function routeLabel(r) {
    if (r.status === 'New') return r.region + ' new launches';
    if (r.tenure === FH) return r.region + ' freehold or 999-year resale homes';
    if (r.tenure === '0–10') return r.region + ' resale homes under 10 years old';
    if (r.tenure === '10–25') return r.region + ' resale homes 10–25 years old';
    return r.region + ' resale homes over 25 years old';
  }
  // ---------- grading ----------
  function gradeOf(st, isNew, E) {
    if (!st || st.n < E.discovery_min_n) return 'Insufficient';
    let g = (st.n >= E.solid_min_n && st.projects >= E.solid_min_projects && st.top < E.solid_max_top) ? 'Solid'
      : (st.n >= E.usable_min_n && st.projects >= E.usable_min_projects && st.top < E.usable_max_top) ? 'Usable' : 'Concentrated';
    if (isNew && LEVEL.indexOf(g) > LEVEL.indexOf(E.new_launch_grade_cap)) g = E.new_launch_grade_cap;
    return g;
  }
  function direction(attr, hi, lo) {
    if (attr === 'region') return REGION[hi.region] < REGION[lo.region] ? 'outer-larger' : 'inner-larger';
    if (attr === 'status') return hi.status === 'Resale' ? 'resale-larger' : 'new-larger';
    if (attr === 'tenure type') return hi.tenure === FH ? 'freehold-larger' : 'leasehold-larger';
    return AGE[hi.tenure] > AGE[lo.tenure] ? 'older-larger' : 'newer-larger';
  }
  function testPair(a, b, E, attr) {
    const [hi, lo] = a.st.med >= b.st.med ? [a, b] : [b, a];
    const ratio = hi.st.med / lo.st.med, diff = hi.st.med - lo.st.med, reasons = [], flags = [];
    if (ratio < E.min_ratio || diff < E.min_abs_diff_sqft) reasons.push('NOT_MATERIAL');
    const overlap = Math.min(hi.st.hi, lo.st.hi) - Math.max(hi.st.lo, lo.st.lo);
    if (E.require_iqr_separation && !(hi.st.lo > lo.st.hi)) reasons.push('IQR_OVERLAP');
    let ratioWide = null;
    if (hi.w && lo.w) {
      ratioWide = hi.w.med / lo.w.med;
      if (ratioWide < 1) reasons.push('REVERSED_WIDE'); else if (ratioWide < E.stability_min_ratio_wide) reasons.push('UNSTABLE_PAIR');
    } else flags.push('WIDE_UNKNOWN');
    const spread = Math.min(hi.st.hi - hi.st.lo, lo.st.hi - lo.st.lo);
    return { attr, hi, lo, ratio, ratioWide, reasons, flags, ok: !reasons.length, overlap: Math.max(0, overlap), overlapShare: spread > 0 ? Math.max(0, overlap) / spread : null };
  }

  // ---------- one pass of discovery + validation + scoring on one window side ----------
  function core(U, side, B, broad, E) {
    const other = side === 'narrow' ? 'wide' : 'narrow';
    const routes = [], insufficient = { routes: 0, deals: 0 };
    Object.keys(U.routes).forEach((k) => {
      const r = U.routes[k], st = dec(side === 'narrow' ? r.n : r.w), w = dec(side === 'narrow' ? r.w : r.n);
      if (!st) return;
      const [region, status, tenure] = k.split('|');
      if (st.n < E.discovery_min_n) { insufficient.routes++; insufficient.deals += st.n; return; }
      const isNew = status === 'New', grade = gradeOf(st, isNew, E), wg = w ? gradeOf(w, isNew, E) : null;
      const unstable = !!w && (LEVEL.indexOf(grade) - LEVEL.indexOf(wg) > 1 || Math.abs(w.med / st.med - 1) > E.stability_median_shift);
      const b = broad && broad[k] ? { p25: broad[k][0], p75: broad[k][1], n: broad[k][2] } : null;
      const position = !b ? 'unknown' : B < b.p25 ? 'low-end' : B > b.p75 ? 'high-end' : 'core';
      let weight = unstable ? E.grade_weight.Concentrated : E.grade_weight[grade];
      if (!w) weight = Math.min(weight, E.grade_weight.Usable);            // stability unknown: cannot support a Solid claim
      routes.push({ key: k, id: routeId({ region, status, tenure }), region, status, tenure, st, w, grade, wideGrade: wg, unstable, weight, position, low: position === 'low-end', broad: b, wideUnknown: !w });
    });
    const totalN = routes.reduce((a, r) => a + r.st.n, 0);
    const pairs = [], confounded = [];
    for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i], b = routes[j], diff = [];
      if (a.region !== b.region) diff.push('region'); if (a.status !== b.status) diff.push('status');
      if (a.status === 'Resale' && b.status === 'Resale' && a.tenure !== b.tenure) diff.push((a.tenure === FH || b.tenure === FH) ? 'tenure type' : 'age');
      if (diff.length !== 1) { confounded.push({ a: a.id, b: b.id, attributes: diff, code: 'CONFOUNDED' }); continue; }
      const p = testPair(a, b, E, diff[0]);
      p.dir = direction(diff[0], p.hi, p.lo); p.key = diff[0] + ':' + p.dir;
      p.conf = Math.min(a.weight, b.weight); if (p.flags.indexOf('WIDE_UNKNOWN') > -1) p.conf = Math.min(p.conf, E.grade_weight.Usable);
      p.nLow = (a.low ? 1 : 0) + (b.low ? 1 : 0); p.ctx = E.context_factor[p.nLow];
      p.cov = totalN ? (a.st.n + b.st.n) / totalN : 0; p.score = Math.log(p.ratio) * p.conf * p.ctx * (E.coverage_base + p.cov);
      pairs.push(p);
    }
    // conflict check per attribute
    const conflicted = [];
    Array.from(new Set(pairs.map((p) => p.attr))).forEach((at) => {
      const ok = pairs.filter((p) => p.attr === at && p.ok), dirs = Array.from(new Set(ok.map((p) => p.dir)));
      if (dirs.length < 2) return;
      const w = dirs.map((d) => ({ d, s: ok.filter((p) => p.dir === d).reduce((a, p) => a + p.score, 0) })).sort((x, y) => y.s - x.s);
      if (w[0].s >= E.conflict_dominance * w[1].s) ok.filter((p) => p.dir !== w[0].d).forEach((p) => { p.ok = false; p.reasons.push('CONFLICT_LOSER'); });
      else { ok.forEach((p) => { p.ok = false; p.reasons.push('CONFLICTED'); }); conflicted.push(at); }
    });
    // insights = passing pairs grouped by attribute + direction
    const groups = {};
    pairs.filter((p) => p.ok).forEach((p) => { (groups[p.key] = groups[p.key] || []).push(p); });
    const insights = Object.keys(groups).map((k) => {
      const g = groups[k].slice().sort((x, y) => (Math.round(y.score * 1e6) - Math.round(x.score * 1e6)) || (y.conf - x.conf) || (y.cov - x.cov) || (y.ratio - x.ratio) || (x.hi.id + x.lo.id < y.hi.id + y.lo.id ? -1 : 1));
      const head = g[0], supports = g.slice(1).filter((p) => p.conf >= E.support_min_conf);
      const score = head.score * (1 + E.support_bonus * Math.min(E.support_cap, supports.length));
      const label = head.conf >= 1 ? 'Solid' : head.conf >= E.support_min_conf ? 'Indicative' : 'Weak';
      return { key: k, attr: head.attr, dir: head.dir, head, pairs: g, supports, score, label, involvesNew: head.hi.status === 'New' || head.lo.status === 'New', status: 'candidate' };
    });
    const cmp = (a, b) => (Math.round(b.score * 1000) - Math.round(a.score * 1000)) || (b.head.conf - a.head.conf) || (b.head.cov - a.head.cov) || (b.head.ratio - a.head.ratio) || (a.key < b.key ? -1 : 1);
    insights.sort(cmp);
    return { routes, insufficient, pairs, confounded, conflicted, insights, totalN };
  }

  // ---------- selection (spec section 6) ----------
  function select(insights, conflicted, E, boundarySensitive) {
    const selected = [], trace = [];
    let concUsed = 0;
    insights.forEach((ins) => {
      const t = { key: ins.key, score: ins.score };
      if (conflicted.indexOf(ins.attr) > -1) { t.outcome = 'CONFLICTED'; }
      else if (ins.score < E.min_insight_score) { t.outcome = 'BELOW_MIN_SCORE'; }
      else if (boundarySensitive && boundarySensitive.indexOf(ins.key) > -1) { t.outcome = 'BOUNDARY_SENSITIVE'; }
      else if (selected.length >= E.max_insights) { t.outcome = 'MAX_INSIGHTS'; }
      else {
        const dup = selected.find((s) => s.head.hi.key === ins.head.hi.key && s.head.lo.region === ins.head.lo.region);
        const conc = ins.head.hi.weight <= E.grade_weight.Concentrated || ins.head.lo.weight <= E.grade_weight.Concentrated;
        if (dup) { t.outcome = 'ABSORBED'; t.absorbedBy = dup.key; }
        else if (conc && concUsed >= E.max_indicative_insights) { t.outcome = 'CONC_CAP'; }
        else { if (conc) concUsed++; t.outcome = 'SELECTED'; t.rank = selected.length + 1; selected.push(ins); }
      }
      ins.status = t.outcome; trace.push(t);
    });
    return { selected, trace };
  }

  // Presentation data only (no scoring): the routes behind an insight's headline pair, largest first, sizes rounded for display.
  function chartFor(ins, E) {
    const hi = ins.head.hi, seen = {}, routes = [hi];
    seen[hi.id] = true;
    ins.pairs.filter((p) => p.hi.id === hi.id).forEach((p) => { if (!seen[p.lo.id]) { seen[p.lo.id] = true; routes.push(p.lo); } });
    routes.sort((a, b) => b.st.med - a.st.med);
    return { attr: ins.attr, dir: ins.dir, bars: routes.map((r) => ({ id: r.id, region: r.region, status: r.status, tenure: r.tenure, grade: r.grade, median: rnd(r.st.med, E), projects: r.st.projects, low: !!r.low })) };
  }

  // ---------- language (spec section 7) ----------
  const LEAD = {
    'age:older-larger': 'age: older homes had more space', 'age:newer-larger': 'age: newer homes had more space',
    'status:resale-larger': 'newness: resale homes were larger than new launches', 'status:new-larger': 'newness: new launches were larger than resale homes',
    'region:outer-larger': 'location: moving closer in meant less space', 'region:inner-larger': 'location: moving closer in meant more space',
    'tenure type:freehold-larger': 'tenure: freehold or 999-year homes were larger than leasehold ones', 'tenure type:leasehold-larger': 'tenure: leasehold homes were larger than freehold or 999-year ones',
  };
  const TAKE = {
    'age:older-larger': (g) => 'Older homes ' + g + 'had more space.', 'age:newer-larger': (g) => 'Newer homes ' + g + 'had more space.',
    'status:resale-larger': (g) => 'New launches ' + g + 'were smaller.', 'status:new-larger': (g) => 'New launches ' + g + 'were larger.',
    'region:outer-larger': (g) => 'Moving closer in ' + g + 'meant less space.', 'region:inner-larger': (g) => 'Moving closer in ' + g + 'meant more space.',
  };
  function sizeText(r, E, asRange) {
    const lo = rnd(r.st.lo, E), hi = rnd(r.st.hi, E);
    if (asRange) return lo === hi ? 'about ' + fmt(lo) + ' sqft' : 'about ' + fmt(lo) + '–' + fmt(hi) + ' sqft';
    return 'about ' + fmt(rnd(r.st.med, E)) + ' sqft';
  }
  function insightSentences(ins, B, E, emitted) {
    emitted = emitted || {};
    const H = ins.head, S = [], conc = (r) => r.weight <= E.grade_weight.Concentrated;
    const cls = (H.hi.weight <= E.grade_weight.Concentrated || H.lo.weight <= E.grade_weight.Concentrated) ? 'Concentrated' : ins.involvesNew ? 'Indicative' : H.conf >= 1 ? 'Solid' : 'Usable';
    const typ = cls === 'Solid' ? 'typically ' : '';
    S.push({ cls, text: cap1(routeLabel(H.hi)) + ' ' + typ + 'sold at ' + sizeText(H.hi, E, conc(H.hi)) + ', against ' + sizeText(H.lo, E, conc(H.lo)) + ' for ' + routeLabel(H.lo) + '.', fields: { hi: H.hi.id, lo: H.lo.id, hiMedian: H.hi.st.med, loMedian: H.lo.st.med, hiRange: [H.hi.st.lo, H.hi.st.hi], loRange: [H.lo.st.lo, H.lo.st.hi] } });
    const lowRoutes = [];
    [H.hi, H.lo].forEach((r) => { if (r.low) lowRoutes.push(r); });
    // support sentence: best supporting pair from a region not already used
    const used = {}; used[H.hi.id] = used[H.lo.id] = true;
    const sup = ins.supports.find((p) => !used[p.hi.id] && !used[p.lo.id] && p.hi.region !== H.hi.region) || ins.supports.find((p) => !used[p.hi.id] && !used[p.lo.id]);
    if (sup && !ins.involvesNew) {
      S.push({ cls: sup.hi.low || sup.lo.low ? 'Low-end' : 'Usable', text: 'The same held for ' + (sup.hi.low || sup.lo.low ? 'entry-level ' : '') + routeLabel(sup.hi) + ' (' + sizeText(sup.hi, E, conc(sup.hi)) + ') against ' + routeLabel(sup.lo) + ' (' + sizeText(sup.lo, E, conc(sup.lo)) + ').', fields: { hi: sup.hi.id, lo: sup.lo.id, hiMedian: sup.hi.st.med, loMedian: sup.lo.st.med } });
    }
    [H.hi, H.lo].filter((r) => r.status === 'New' && !emitted['new:' + r.id]).forEach((r) => {
      emitted['new:' + r.id] = true;                    // each new-launch route is described once per answer
      S.push({ cls: 'Indicative', text: cap1(r.region + ' new launches') + ' that sold near this budget came from only ' + r.st.projects + ' projects' + (r.st.top >= 0.5 ? ' (' + pc(r.st.top) + ' from one project)' : '') + '. Indicative.', fields: { route: r.id, projects: r.st.projects, top: r.st.top, deals: r.st.n } });
      if (r.broad && B < r.broad.p25) S.push({ cls: 'Indicative', text: 'Most ' + r.region + ' new launches sold above ' + money(B) + '.', fields: { route: r.id, share: 'budget below route price P25 (' + money(r.broad.p25) + '), so over 75% sold above' } });
    });
    if (lowRoutes.length) S.push({ cls: 'Low-end', text: money(B) + ' is at the low end of what ' + lowRoutes.map(routeLabel).join(' and ') + ' normally cost, so this describes entry-level homes there.', fields: { routes: lowRoutes.map((r) => r.id), p25: lowRoutes.map((r) => r.broad && r.broad.p25) } });
    if (TAKE[ins.key]) S.push({ cls: cls, text: TAKE[ins.key](ins.supports.length >= 2 ? 'generally ' : ''), fields: { supportingPairs: ins.supports.length, generally: ins.supports.length >= 2 } });
    return S;
  }
  // wording check (spec 7.1 banned terms). "from only N projects" is the one permitted use of "only".
  const BANNED = [/\byou can (get|buy)\b/i, /\bavailable\b/i, /\bon the market\b/i, /\blisted\b/i, /\bbest\b/i, /\balways\b/i, /\bnever\b/i, /\baffordable\b/i, /\brecommend/i, /\bworks? (well|for)\b/i, /bedroom/i, /\bbr\b/i, /\bcpf\b/i, /\bloan\b/i, /\blender/i, /\bfinanc/i, /\bmortgage\b/i, /\bbecause\b/i, /\b(I|my|we|our)\b/, /\bguarantee/i, /\bonly\b/i];
  function lint(text) {
    const t = text.replace(/from only \d+ projects/gi, 'from N projects');
    return BANNED.filter((re) => re.test(t)).map((re) => String(re));
  }

  const NOTE_FLAGS = [/\bcpf\b/i, /\bloan/i, /\blender/i, /\bfinanc/i, /\bmortgage/i, /\bbedroom/i, /\blease\b/i, /\bltv\b/i];
  // ---------- Ken's judgement (spec section 8) ----------
  function attachNotes(notes, selected, ecShown, B, today) {
    const out = { insightNotes: [], budgetNote: null, asOf: null, attention: [] };
    const shown = [];
    (notes || []).forEach((n) => {
      const rec = { signature: n.signature, note: n.note, reviewed_on: n.reviewed_on || null, status: n.status || 'Active', shown: false, reason: null };
      const bad = NOTE_FLAGS.filter((re) => re.test(String(n.note || ''))).map(String);
      if (bad.length) out.attention.push({ signature: n.signature, code: 'REVIEW_WORDING', detail: 'Note mentions terms held for the regulatory review: ' + bad.join(' ') });
      if (rec.status === 'Retired') { rec.reason = 'RETIRED'; }
      else if ((n.budget_min && B < n.budget_min) || (n.budget_max && B > n.budget_max)) { rec.reason = 'OUTSIDE_BUDGET_RANGE'; }
      else if (n.signature === 'budget') { rec.shown = true; if (!out.budgetNote) out.budgetNote = rec; }
      else if (n.signature === 'ec') { if (ecShown) rec.shown = true; else rec.reason = 'INSIGHT_NOT_SHOWN'; }
      else {
        const ins = selected.find((s) => s.key === n.signature);
        if (!ins) { rec.reason = 'INSIGHT_NOT_SHOWN'; out.attention.push({ signature: n.signature, code: 'EVIDENCE_CHANGED', detail: 'Insight is not selected at this budget.' }); }
        else if (ins.label === 'Weak') { rec.reason = 'EVIDENCE_WEAKENED'; out.attention.push({ signature: n.signature, code: 'EVIDENCE_CHANGED', detail: 'Insight is now Weak.' }); }
        else rec.shown = true;
      }
      if (rec.shown) shown.push(rec);
      out.insightNotes.push(rec);
    });
    const dates = shown.map((s) => s.reviewed_on).filter(Boolean).sort();
    out.asOf = dates.length ? dates[0] : null;
    out.dueForReview = out.insightNotes.filter((n) => n.status === 'Review due').length;
    return out;
  }

  // ---------- main ----------
  function budgetStep(budget, E) { return Math.round(budget / E.budget_step) * E.budget_step; }
  function shardStart(stepBudget, E) { return Math.floor(stepBudget / E.shard_size) * E.shard_size; }
  function pickStep(shard, stepBudget) { return shard && shard.steps ? shard.steps[stepBudget] || null : null; }

  function run(input, userCfg) {
    const E = merge(DEFAULTS, userCfg || {}), B = input.budget, step = input.step, idx = input.index || {};
    const today = input.today || new Date().toISOString().slice(0, 10);
    const res = { engineVersion: VERSION, budget: B, stepBudget: step ? step.b : budgetStep(B, E), state: 'ok', fallback: [], lead: null, insights: [], ec: null, footer: null, descriptive: null, ken: null, tag: null, audit: null };
    const audit = { run: { budget: B, step: res.stepBudget, windows: step ? { narrow: [step.win[0], step.win[1]], wide: [step.win[2], step.win[3]] } : null, period: idx.period || null, asOf: idx.asOf || null, today, engineVersion: VERSION, configHash: hash(stable(E)), freshness: 'fresh' }, routes: [], pairs: [], confoundedPairs: [], insights: [], selectionTrace: [], sentences: [], lint: [], ec: null, fallbackReasons: [], counterfactual: null };
    res.audit = audit;
    // freshness
    if (idx.asOf) {
      const age = daysBetween(idx.asOf, today);
      if (age > E.freshness_expired_days) { audit.run.freshness = 'expired'; res.fallback.push('EXPIRED'); res.state = 'fallback'; return res; }
      if (age > E.freshness_stale_days) { audit.run.freshness = 'stale'; res.tag = 'Indicative: data as of ' + idx.asOf; }
    }
    if (!step) { res.fallback.push('THIN_MARKET'); audit.fallbackReasons.push('OUT_OF_RANGE: no precomputed step for this budget'); res.state = 'fallback'; return res; }
    const U = step.private, broad = (idx.broad && idx.broad.private) || {};
    const wideDeals = U.total && U.total.w ? U.total.w[0] : 0, narrowDeals = U.total && U.total.n ? U.total.n[0] : 0;
    audit.run.deals = { narrow: narrowDeals, wide: wideDeals };
    const nar = core(U, 'narrow', B, broad, E), wid = core(U, 'wide', B, broad, E);
    audit.routes = nar.routes.map((r) => ({ id: r.id, grade: r.grade, wideGrade: r.wideGrade, unstable: r.unstable, weight: r.weight, position: r.position, narrow: r.st, wide: r.w, broadPriceP25: r.broad && r.broad.p25, broadPriceP75: r.broad && r.broad.p75, flags: [r.status === 'New' ? 'NEW_CAPPED' : null, r.st.projects < E.few_projects_flag ? 'FEW_PROJECTS' : null, r.st.top >= 0.5 ? 'ONE_PROJECT_DOMINATES' : null, r.wideUnknown ? 'WIDE_UNKNOWN' : null].filter(Boolean) }));
    audit.insufficientRoutes = nar.insufficient;
    audit.pairCounts = { total: nar.routes.length * (nar.routes.length - 1) / 2, confounded: nar.confounded.length, singleAttribute: nar.pairs.length, pass: nar.pairs.filter((p) => p.ok).length };
    audit.confoundedPairs = nar.confounded;
    audit.pairs = nar.pairs.map((p) => ({ attribute: p.attr, direction: p.dir, larger: p.hi.id, smaller: p.lo.id, ratio: p.ratio, ratioWide: p.ratioWide, sizeRanges: { larger: [p.hi.st.lo, p.hi.st.hi], smaller: [p.lo.st.lo, p.lo.st.hi] }, overlapSqft: p.overlap, pass: p.ok, reasons: p.reasons, flags: p.flags, confidence: p.conf, contextFactor: p.ctx, coverage: p.cov, score: p.score }));
    // fallbacks that stop the run
    if (wideDeals < E.thin_market_wide_deals) { res.fallback.push('THIN_MARKET'); audit.fallbackReasons.push('WIDE_DEALS_BELOW_MIN: ' + wideDeals + ' < ' + E.thin_market_wide_deals); }
    if (nar.routes.length < 2) { if (res.fallback.indexOf('THIN_MARKET') < 0) res.fallback.push('THIN_MARKET'); audit.fallbackReasons.push('FEW_ROUTES: ' + nar.routes.length + ' route(s) reach ' + E.discovery_min_n + ' deals'); }
    // boundary sensitivity: an insight must also qualify when the wide window is the primary view
    const wideKeys = wid.insights.filter((i) => i.score >= E.min_insight_score && wid.conflicted.indexOf(i.attr) < 0).map((i) => i.key);
    const boundary = nar.insights.filter((i) => wideKeys.indexOf(i.key) < 0 && i.head.hi.w && i.head.lo.w).map((i) => i.key);   // only judged when both headline routes have wide stats
    const sel = select(nar.insights, nar.conflicted, E, boundary);
    const selNoBoundary = select(nar.insights.map((i) => Object.assign({}, i)), nar.conflicted, E, null);
    audit.counterfactual = { withoutBoundaryRule: selNoBoundary.selected.map((i) => i.key), boundarySensitive: boundary.filter((k) => { const t = sel.trace.find((x) => x.key === k); return t && t.outcome === 'BOUNDARY_SENSITIVE'; }) };
    audit.insights = nar.insights.map((i) => ({ key: i.key, label: i.label, score: i.score, outcome: i.status, headline: { larger: i.head.hi.id, smaller: i.head.lo.id, ratio: i.head.ratio, confidence: i.head.conf, contextFactor: i.head.ctx, coverage: i.head.cov, score: i.head.score }, supportingPairs: i.supports.map((p) => p.hi.id + ' > ' + p.lo.id), passingPairs: i.pairs.length }));
    audit.selectionTrace = sel.trace;
    let chosen = sel.selected;
    if (res.fallback.indexOf('THIN_MARKET') > -1) chosen = [];
    else {
      if (chosen.length && chosen.every((i) => i.head.conf <= E.grade_weight.Concentrated)) { res.fallback.push('ONLY_CONCENTRATED'); chosen = chosen.slice(0, 1); }
      if (!nar.insights.length && nar.pairs.length) { res.fallback.push('NO_MEANINGFUL_DIFFERENCE'); }
      if (chosen.length < E.min_insights) res.fallback.push('FEWER_THAN_' + E.min_insights + '_INSIGHTS');
    }
    // sentences
    const topLabel = chosen[0] ? chosen[0].label : null;
    if (chosen.length && res.fallback.indexOf('ONLY_CONCENTRATED') < 0 && topLabel !== 'Weak' && LEAD[chosen[0].key]) {
      res.lead = { cls: chosen[0].label, text: 'At around ' + money(B) + ', the biggest difference in what buyers got was ' + LEAD[chosen[0].key] + '.', fields: { insight: chosen[0].key, score: chosen[0].score } };
      audit.sentences.push({ id: 'lead', text: res.lead.text, cls: res.lead.cls, fields: res.lead.fields });
    }
    const emitted = {};
    chosen.forEach((ins, n) => {
      const sents = insightSentences(ins, B, E, emitted);
      ins.rank = n + 1;
      const flags = [], R = [ins.head.hi, ins.head.lo];
      R.forEach((r) => { if (r.low) flags.push('LOW_END:' + r.id); if (r.grade === 'Concentrated') flags.push('CONCENTRATED:' + r.id + ' (top ' + pc(r.st.top) + ', ' + r.st.projects + ' projects)'); if (r.unstable) flags.push('UNSTABLE:' + r.id); if (r.st.projects < E.few_projects_flag) flags.push('FEW_PROJECTS:' + r.id + ' (' + r.st.projects + ')'); if ((r.st.hi - r.st.lo) / r.st.med < 0.08) flags.push('TIGHT_IQR:' + r.id); if (r.wideUnknown) flags.push('WIDE_UNKNOWN:' + r.id); });
      if (ins.involvesNew) flags.push('NEW_CAPPED'); if (!ins.supports.length) flags.push('NO_SUPPORT'); if (ins.head.cov < 0.05) flags.push('LOW_COVERAGE'); if (ins.head.ratio < 1.25) flags.push('SMALL_EFFECT');
      sents.forEach((s, i) => audit.sentences.push({ id: 'insight' + (n + 1) + '.' + (i + 1), insight: ins.key, text: s.text, cls: s.cls, fields: s.fields }));
      res.insights.push({ rank: n + 1, key: ins.key, label: ins.label, score: ins.score, headline: { larger: ins.head.hi.id, smaller: ins.head.lo.id, ratio: ins.head.ratio }, chart: chartFor(ins, E), flags, sentences: sents.map((s) => s.text), wordingClasses: sents.map((s) => s.cls) });
    });
    // descriptive fallback
    if (res.fallback.indexOf('NO_MEANINGFUL_DIFFERENCE') > -1 && U.total && U.total.n && gradeOf(dec(U.total.n), false, E) === 'Solid') {
      const t = dec(U.total.n);
      res.descriptive = { text: 'At around ' + money(B) + ', buyers across segments typically got about ' + fmt(rnd(t.med, E)) + ' sqft (' + fmt(rnd(t.lo, E)) + '–' + fmt(rnd(t.hi, E)) + ').', fields: { deals: t.n, projects: t.projects } };
      audit.sentences.push({ id: 'descriptive', text: res.descriptive.text, cls: 'Solid', fields: res.descriptive.fields });
    }
    // EC (separate universe)
    const EC = step.ec, ecTotalN = EC && EC.total ? dec(EC.total.n) : null;
    let ecShown = false;
    if (EC) {
      const routes = Object.keys(EC.routes).map((k) => {
        const r = EC.routes[k], st = dec(r.n), w = dec(r.w); if (!st || st.n < E.discovery_min_n) return null;
        const [region, status, tenure] = k.split('|'), grade = gradeOf(st, status === 'New', E);
        const route = { key: 'EC ' + k, id: 'EC ' + routeId({ region, status, tenure }), region, status, tenure, st, w, grade, weight: E.grade_weight[grade] };
        const priv = nar.routes.find((x) => x.key === k), row = { route: route.id, grade, narrow: st, cross: null };
        if (priv) { const t = testPair(route, priv, E, 'product'); row.cross = { against: priv.id, privateMedian: priv.st.med, ratio: t.ratio, pass: t.ok, reasons: t.reasons }; route.crossPass = t.ok; route.priv = priv; }
        row.route_ = route; return row;
      }).filter(Boolean);
      const ecRowsN = ecTotalN ? ecTotalN.n : 0, newShare = (function () { let nn = 0; Object.keys(EC.routes).forEach((k) => { if (k.split('|')[1] === 'New' && EC.routes[k].n) nn += EC.routes[k].n[0]; }); return ecRowsN ? nn / ecRowsN : 0; })();
      const ecGrade = ecTotalN ? gradeOf(ecTotalN, newShare >= 0.5, E) : 'Insufficient';
      const line = LEVEL.indexOf(ecGrade) >= LEVEL.indexOf(E.ec_min_grade);
      const ecSent = [];
      if (line) {
        const label = newShare === 0 ? 'Resale Executive Condominiums' : newShare >= 0.999 ? 'New-launch Executive Condominiums' : 'Executive Condominiums';
        const typ = ecGrade === 'Solid' ? 'typically ' : '', rng = rnd(ecTotalN.lo, E) === rnd(ecTotalN.hi, E) ? '' : ' (' + fmt(rnd(ecTotalN.lo, E)) + '–' + fmt(rnd(ecTotalN.hi, E)) + ')';
        let t = label + ' that sold in this range were ' + typ + 'about ' + fmt(rnd(ecTotalN.med, E)) + ' sqft' + rng + '.';
        const crossOk = routes.filter((r) => r.cross && r.cross.pass).sort((a, b) => b.narrow.n - a.narrow.n)[0];
        if (crossOk) t += ' Private ' + routeLabel(crossOk.route_.priv).replace(/^[A-Z]{3} /, '') + ' in the ' + crossOk.route_.region + ' were about ' + fmt(rnd(crossOk.cross.privateMedian, E)) + ' sqft.';
        ecSent.push({ cls: ecGrade, text: t, fields: { deals: ecTotalN.n, projects: ecTotalN.projects, top: ecTotalN.top, median: ecTotalN.med, range: [ecTotalN.lo, ecTotalN.hi], newShare, comparisonShown: !!crossOk } });
        ecSent.push({ cls: 'Usable', text: 'ECs have eligibility conditions, so check yours first.', fields: {} });
        ecShown = true;
      }
      res.ec = { shown: ecShown, grade: ecGrade, sentences: ecSent.map((s) => s.text), view: ecShown ? { label: newShare === 0 ? 'Resale EC' : newShare >= 0.999 ? 'New-launch EC' : 'EC', median: rnd(ecTotalN.med, E) } : null };
      ecSent.forEach((s, i) => audit.sentences.push({ id: 'ec.' + (i + 1), text: s.text, cls: s.cls, fields: s.fields }));
      audit.ec = { grade: ecGrade, total: ecTotalN, lineShown: ecShown, routes: routes.map((r) => ({ route: r.route, grade: r.grade, narrow: r.narrow, crossReference: r.cross })) };
    }
    // footer
    const tot = dec(U.total && U.total.n);
    if (tot && idx.windowFrom) {
      res.footer = 'Based on ' + fmt(tot.n) + ' private sales across ' + fmt(tot.projects) + ' projects, priced about ' + money(step.win[0]) + '–' + money(step.win[1]) + ', ' + monthName(idx.windowFrom) + ' to ' + monthName(idx.windowTo) + '. Past sales, not current availability.';
      audit.sentences.push({ id: 'footer', text: res.footer, cls: 'Solid', fields: { deals: tot.n, projects: tot.projects } });
    }
    // Ken (separate layer; never changes evidence)
    res.ken = attachNotes(input.notes, chosen, ecShown, B, today);
    audit.ken = res.ken;
    // wording lint on every generated sentence
    audit.sentences.forEach((s) => { const v = lint(s.text); if (v.length) audit.lint.push({ id: s.id, text: s.text, violations: v }); });
    res.state = res.fallback.length ? 'fallback' : 'ok';
    return res;
  }

  return { VERSION, DEFAULTS, run, core, gradeOf, testPair, select, lint, budgetStep, shardStart, pickStep, hash, stable, merge, dec, routeId, routeLabel, money, LEVEL };
});
