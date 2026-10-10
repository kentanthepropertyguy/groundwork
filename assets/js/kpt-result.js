/* ==========================================================================
   KPT result view model: turns one KPT_ENGINE.run() result into what the visitor sees.
   Pure functions (no DOM). UMD: window.KPT_RESULT and Node. The engine decides WHAT is true; this file only
   decides how little of it to show. Nothing here changes thresholds, scoring or selection.
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.KPT_RESULT = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const REGION_NAME = { OCR: 'Outside Central Region', RCR: 'Rest of Central Region', CCR: 'Core Central Region' };
  const FH = 'Freehold / 999-yr';
  // audit A4-13/A4-22: the groups are years since the lease began (under 10, 10 to 24, 25 or more); freehold is grouped separately
  const ageLabel = (t) => (t === '25+' ? 'lease 25+ years old' : t === '10–25' ? 'lease 10–24 years old' : t === '0–10' ? 'lease under 10 years old' : t);
  const capFirst = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  /** "$1.32m", "$1.3m", "$2m" — never more precision than the budget has. */
  function budgetText(b) { return '$' + String(Math.round(b / 10000) / 100).replace(/(\.\d)0$/, '$1') + 'm'; }
  const money = (v) => { const s = (v / 1e6).toFixed(2).replace(/0+$/, '').replace(/\.$/, ''); return '$' + s + 'm'; };
  /** One budget number for the engine. A planning range from the HDB journey uses its midpoint, to the nearest $10k. */
  function budgetFromHandoff(h) { const m = (h.low + h.high) / 2; return Math.round(m / 10000) * 10000; }
  /** Audit A3-14: a planner range as the visitor saw it ("$1.31m–$1.53m"); a single figure stays one figure. */
  // V2-08: a planner range is written exactly as the planner writes it (KPT.money in kpt-components.js; a test keeps them equal),
  // so "$1.00m–$1.16m" there is "$1.00m–$1.16m" here too.
  const planMoney = (n) => { const a = Math.abs(n); return (n < 0 ? '-' : '') + '$' + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'm' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : Math.round(a)); };
  function rangeText(b) { return !b ? '' : b.single || b.low === b.high ? budgetText(b.low) : planMoney(b.low) + '–' + planMoney(b.high); }
  function waMessage(budget) { return "Hi Ken, I checked what a budget of about " + budgetText(budget) + " buys. I'd like your view."; }
  /** Anonymous, bucketed, no exact budget. Categorical engine facts only. */
  function analytics(res, view, budget) {
    const m = budget, step = 200000;
    const band = m < 600000 ? 'under-0.6m' : m >= 4000000 ? '4m-plus' : (Math.floor(m / step) * step / 1e6).toFixed(1) + '-' + ((Math.floor(m / step) * step + step) / 1e6).toFixed(1) + 'm';
    return { budget_band: band, result_state: view.state, lens: view.lens || 'none', insight_count: res ? res.insights.length : 0, ec_shown: !!view.ec, ken_take_shown: !!view.ken, data_stale: !!(res && res.tag) };
  }

  const HEAD = {
    'age:older-larger': (r) => 'older homes gave ' + r + ' space.', 'age:newer-larger': (r) => 'newer homes gave ' + r + ' space.',
    'status:resale-larger': () => 'resale homes gave more space than new launches.', 'status:new-larger': () => 'new launches gave more space than resale homes.',
    'region:outer-larger': (r) => 'going further out gave ' + r + ' space.', 'region:inner-larger': (r) => 'going closer in gave ' + r + ' space.',
    'tenure type:freehold-larger': () => 'freehold or 999-year homes gave more space.', 'tenure type:leasehold-larger': () => 'leasehold homes gave more space.',
  };
  const TRADE = {
    'age:older-larger': 'Going older opened up', 'age:newer-larger': 'Going newer opened up',
    'status:resale-larger': 'Choosing resale over a new launch opened up', 'status:new-larger': 'Choosing a new launch opened up',
    'region:outer-larger': 'Going further out opened up', 'region:inner-larger': 'Going closer in opened up',
    'tenure type:freehold-larger': 'Choosing freehold or 999-year opened up', 'tenure type:leasehold-larger': 'Choosing leasehold opened up',
  };
  const OUT_OF_RANGE = 'This tool covers budgets from $600,000 to $5 million.';
  const ALSO_TITLE = { age: 'Age', status: 'New launch vs resale', region: 'Location', 'tenure type': 'Tenure' };

  function barLabel(b, attr) {
    if (attr === 'age') return capFirst(ageLabel(b.tenure));
    if (attr === 'region') return REGION_NAME[b.region];
    if (attr === 'status') return b.status === 'New' ? 'New launch' : 'Resale (' + (b.tenure === FH ? 'freehold / 999-year' : ageLabel(b.tenure)) + ')';
    return b.tenure === FH ? 'Freehold / 999-year' : 'Leasehold (' + ageLabel(b.tenure) + ')';
  }
  function context(chart) {
    const bars = chart.bars, a = chart.attr, same = (k) => bars.every((b) => b[k] === bars[0][k]), parts = [];
    if (a !== 'region') parts.push(REGION_NAME[bars[0].region]);
    if (a !== 'status' && same('status')) parts.push(bars[0].status === 'New' ? 'New launches' : 'Resale');
    if (a === 'region' && same('tenure') && bars[0].status === 'Resale') parts.push(bars[0].tenure === FH ? 'Freehold / 999-year' : capFirst(ageLabel(bars[0].tenure)));
    parts.push('Last 12 months');
    return parts.join(' · ');
  }
  function gapText(bars) {
    const gaps = bars.slice(1).map((b) => bars[0].median - b.median).filter((g) => g > 0);
    if (!gaps.length) return null;
    const lo = Math.min.apply(null, gaps), hi = Math.max.apply(null, gaps);
    return 'roughly ' + (lo === hi ? fmt(lo) : fmt(lo) + '–' + fmt(hi)) + ' sq ft more space';
  }

  /** "No single trade-off stood out" state: the market evidence itself becomes the hero. Presentation only.
   *  Numbers come from the same route-stats total the engine used for its own descriptive line, rounded the same way,
   *  and are shown only if they agree with that engine line (otherwise the plain fallback message is used). */
  function summaryFrom(res, budgetText, opts) {
    const d = res.descriptive, st = opts && opts.step, r = (opts && opts.sizeRounding) || 50;
    const t = st && st.private && st.private.total && st.private.total.n;
    if (!d || !t) return null;
    const rnd = (x) => Math.round(x / r) * r, med = rnd(t[4]), lo = rnd(t[5]), hi = rnd(t[6]);
    if (d.text.indexOf(fmt(med) + ' sqft') < 0) return null;
    return {
      headline: 'Around ' + budgetText + ', buyers typically got about ' + fmt(med) + ' sq ft.',
      median: med, lo: lo, hi: hi, hasRange: lo !== hi,
      rangeText: lo === hi ? null : 'The middle half of these sales were about ' + fmt(lo) + '–' + fmt(hi) + ' sq ft.',
      body: 'Across recent transactions around this budget, no single location, age or new-vs-resale trade-off was strong enough to stand out.',
      // proportional scale for the small range graphic: 60%–140% of the median
      scale: { min: Math.round(med * 0.6), max: Math.round(med * 1.4) },
    };
  }

  /** res: KPT_ENGINE.run() result. Returns the screen model. opts: { step, sizeRounding } */
  function view(res, opts) {
    opts = opts || {};
    const B = res.budget, v = { state: 'ok', budget: B, budgetText: budgetText(B), lens: null, hero: null, also: [], ec: null, ken: null, footer: res.footer || null, tag: res.tag || null, message: null };
    const first = res.insights[0];
    const bad = res.fallback.some((f) => ['THIN_MARKET', 'EXPIRED'].indexOf(f) > -1);
    // Audit A4-06/A5-28: say why there is no picture. Budgets outside the tool's range and expired figures are not "not enough sales".
    const minB = opts.minBudget || 600000, maxB = opts.maxBudget || 5000000;
    if (bad && res.fallback.indexOf('EXPIRED') > -1) {
      v.state = 'expired';
      v.message = { title: 'These market figures are being updated.', body: 'I can still give you my view on this budget.' };
      v.footer = res.footer ? v.footer : null;
      return v;
    }
    if (bad && (B < minB || B > maxB)) {
      v.state = 'out-of-range';
      v.message = { title: OUT_OF_RANGE, body: 'I can still give you my view on this budget.' };
      v.footer = res.footer ? v.footer : null;
      return v;
    }
    if (bad) {
      v.state = 'thin';
      v.message = { title: 'Not enough recent sales near ' + v.budgetText + ' to compare reliably.', body: "I'd rather look at this with you than show a thin picture." };
      v.footer = res.footer ? v.footer : null;
      return v;
    }
    if (!res.lead || !first || res.fallback.indexOf('ONLY_CONCENTRATED') > -1) {
      v.state = 'no-lens';
      v.summary = summaryFrom(res, v.budgetText, opts);
      v.message = res.descriptive ? { title: 'Around ' + v.budgetText + ', no single trade-off stood out.', body: res.descriptive.text } : { title: 'Around ' + v.budgetText + ', the sales were too mixed to show one clear trade-off.', body: "A conversation will tell you more than a chart here." };
    } else {
      v.lens = first.key;
      const ch = first.chart, ratio = first.headline.ratio, rel = ratio >= 1.3 ? 'much more' : 'more', gap = gapText(ch.bars);
      const mx = ch.bars[0].median;
      v.hero = {
        headline: 'Around ' + v.budgetText + ', ' + HEAD[first.key](rel),
        context: context(ch),
        bars: ch.bars.map((b) => ({ label: barLabel(b, ch.attr), value: b.median, text: fmt(b.median), width: Math.round((b.median / (mx * 1.04)) * 100), tag: (b.status === 'New' || b.grade === 'Concentrated') ? 'Indicative' : null, low: b.low })),
        tradeoff: gap ? TRADE[first.key] + ' ' + gap + ' at this budget.' : null,
      };
    }
    // also at this budget: engine insights #2 and #3, their own sentences (headline sentence, caveats, takeaway)
    res.insights.slice(1, 3).forEach((ins) => {
      const lines = ins.sentences.filter((s) => !/^The same held/.test(s));
      v.also.push({ title: ALSO_TITLE[ins.chart.attr], key: ins.key, lines });
    });
    if (v.hero === null && res.insights.length > 1) v.also = [];
    // Audit A3-14: the budget was not tested against EC rules, so the note says what they are.
    if (res.ec && res.ec.shown && res.ec.view) v.ec = { label: res.ec.view.label, text: 'Around ' + fmt(res.ec.view.median) + ' sq ft at this budget. Eligibility conditions apply, including a household income ceiling, and loan repayments are limited to 30% of income (MSR). This budget wasn’t checked against those rules.' };
    // Ken's Take: an Active authored note matching the selected hero insight (else a budget-wide note). Otherwise nothing.
    if (v.hero && res.ken) {
      const shown = (res.ken.insightNotes || []).filter((n) => n.shown && n.note);
      const n = shown.find((x) => x.signature === first.key) || shown.find((x) => x.signature === 'budget');
      if (n) v.ken = { note: n.note, asOf: n.reviewed_on };
    }
    return v;
  }

  /** Fetch the one shard the engine needs. fetchFn(url) -> Promise<{ok, json()}> */
  function loadStats(base, budget, ENG, fetchFn) {
    const E = ENG.DEFAULTS, sb = ENG.budgetStep(budget, E);
    return fetchFn(base + 'index.json').then((r) => { if (!r.ok) throw new Error('index'); return r.json(); }).then((index) => {
      if (!index.shards || !index.shards.length) return { index, step: null };
      return fetchFn(base + 'shard-' + ENG.shardStart(sb, E) + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((shard) => ({ index, step: ENG.pickStep(shard, sb) }));
    });
  }
  function loadNotes(url, fetchFn) {
    return fetchFn(url).then((r) => (r.ok ? r.json() : [])).then((a) => (Array.isArray(a) ? a : [])).catch(() => []);
  }
  return { view, budgetText, budgetFromHandoff, rangeText, waMessage, analytics, loadStats, loadNotes, REGION_NAME, money, OUT_OF_RANGE };
});
