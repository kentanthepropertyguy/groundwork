/* ==========================================================================
   KPT buyer journey ("I'm looking to buy"): deterministic reasoning. Pure functions: no DOM, no network, no storage.
   UMD: window.KPT_BUYER and Node.

   It does NOT calculate market evidence. It reads the result of the existing market engine (KPT_ENGINE.run) and its
   view model (KPT_RESULT.view), and decides which of the engine's own findings matter to THIS buyer.
   Nothing here changes thresholds, scoring or selection, and nothing here is generated at runtime by AI.

   Evidence discipline (internal; the consumer screen reads naturally and only "How this was worked out" names them):
     evidence : what the engine found in URA transactions (region x new/resale x age or tenure, typical size)
     rule     : authored framing in this file (which finding matters to which priority, route wording)
     ken      : judgement. Only ever shown from an Active authored note via the engine's own gating.
   The data has no bedroom counts, no planning areas, no schools and no rents. This module never claims otherwise:
   bedroom size, area/school/work context are echoed back and passed to Ken, never "evaluated".
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.KPT_BUYER = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BUDGET_MIN = 300000, BUDGET_MAX = 20000000;           // same bounds the What Can I Buy entry screen accepts
  const DEFAULT_COVERAGE = { min: 600000, max: 5000000 };     // overridden by route-stats index.minBudget / maxBudget
  const REGION_NAME = { OCR: 'Outside Central Region', RCR: 'Rest of Central Region', CCR: 'Core Central Region' };
  const REGION_ORDER = ['OCR', 'RCR', 'CCR'];

  const OPEN_TO = { new: 'New launch', resale: 'Resale', both: 'Both / not sure' };
  const SIZE = { '1br': '1BR', '2br': '2BR', '3br': '3BR', '3br-study': '3BR + Study / larger', '4br-plus': '4BR+', 'not-sure': 'Not sure' };
  const WHERE = { areas: 'Near somewhere specific', flexible: 'Anywhere in Singapore' };
  const LEGACY_WHERE = { family: 'areas', work: 'areas', school: 'areas' };   // older saved answers still read
  const PRIORITY = { space: 'More space', location: 'Closer to the centre', newer: 'Newer building', freehold: 'Freehold or long lease' };
  // priorities that sales data can speak to, and the engine finding that shows what that priority tends to cost in space
  const COST_KEYS = {
    location: ['region:outer-larger'],                         // closer in = less space
    newer: ['age:older-larger', 'status:resale-larger'],       // newer = less space
    freehold: ['tenure type:leasehold-larger'],                // freehold / 999-year = less space
  };
  // "what mattered to you" wording: [what the buyer chose, what the recorded evidence compared it with]
  const COST_WORDS = {
    'region:outer-larger': ['Closer to the centre', 'Homes further out'],
    'age:older-larger': ['Newer buildings', 'Older homes'],
    'status:resale-larger': ['New launches', 'Resale homes'],
    'tenure type:leasehold-larger': ['Freehold or 999-year homes', 'Leasehold homes'],
  };
  const UNMEASURED = [];

  // Same wording the What Can I Buy screen uses for the same engine findings (a test keeps the two in step).
  const TRADE = {
    'age:older-larger': 'Going older opened up', 'age:newer-larger': 'Going newer opened up',
    'status:resale-larger': 'Choosing resale over a new launch opened up', 'status:new-larger': 'Choosing a new launch opened up',
    'region:outer-larger': 'Going further out opened up', 'region:inner-larger': 'Going closer in opened up',
    'tenure type:freehold-larger': 'Choosing freehold or 999-year opened up', 'tenure type:leasehold-larger': 'Choosing leasehold opened up',
  };

  // Neutral market observation: names no choice the buyer made. [larger group, smaller group]
  const COMPARE = {
    'status:resale-larger': ['Resale homes', 'new launches'], 'status:new-larger': ['New launches', 'resale homes'],
    'age:older-larger': ['Older homes', 'newer homes'], 'age:newer-larger': ['Newer homes', 'older homes'],
    'region:outer-larger': ['Homes further out', 'homes closer in'], 'region:inner-larger': ['Homes closer in', 'homes further out'],
    'tenure type:freehold-larger': ['Freehold or 999-year homes', 'leasehold homes'], 'tenure type:leasehold-larger': ['Leasehold homes', 'freehold or 999-year homes'],
  };

  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const budgetText = (b) => '$' + String(Math.round(b / 10000) / 100).replace(/(\.\d)0$/, '$1') + 'm';
  const roundBudget = (v) => Math.round(v / 10000) * 10000;
  const list = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------------------------------------------------------------- answers
  function validateBudget(v) {
    const n = Number(v);
    if (!n || !isFinite(n) || n < BUDGET_MIN || n > BUDGET_MAX) return { ok: false, message: 'Enter a budget between $300,000 and $20,000,000.' };
    return { ok: true, value: roundBudget(n) };
  }

  /** Clean raw form answers. Unknown or missing values become neutral defaults, so nothing blocks the visitor. */
  function normalise(raw) {
    raw = raw || {};
    const pick = (map, v, dflt) => (Object.prototype.hasOwnProperty.call(map, v) ? v : dflt);
    const where = pick(WHERE, LEGACY_WHERE[raw.where] || raw.where, 'flexible');
    const seen = {}, pr = (Array.isArray(raw.priorities) ? raw.priorities : []).filter((p) => PRIORITY[p] && !seen[p] && (seen[p] = true)).slice(0, 2);
    const b = validateBudget(raw.budget);
    return {
      budget: b.ok ? b.value : null,
      openTo: pick(OPEN_TO, raw.openTo, 'both'),
      size: pick(SIZE, raw.size, 'not-sure'),
      where: where,
      whereText: where === 'flexible' ? '' : String(raw.whereText || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      priorities: pr,
    };
  }

  // ---------------------------------------------------------------- reading the engine's output
  const routeIsNew = (id) => / new$/.test(id);
  const routeRegion = (id) => id.slice(0, 3);

  function insightFacts(res) {
    return (res && res.insights ? res.insights : []).map((i) => ({
      key: i.key, rank: i.rank, attr: i.chart.attr, ratio: i.headline.ratio, bars: i.chart.bars, usesNew: i.chart.bars.some((b) => b.status === 'New'),
    }));
  }
  function gapText(bars) {
    const gaps = bars.slice(1).map((b) => bars[0].median - b.median).filter((g) => g > 0);
    if (!gaps.length) return null;
    const lo = Math.min.apply(null, gaps), hi = Math.max.apply(null, gaps);
    return 'roughly ' + (lo === hi ? fmt(lo) : fmt(lo) + '–' + fmt(hi)) + ' sq ft more space';
  }
  function gapLarger(bars) {
    const g = gapText(bars);
    return g ? g.replace(' more space', ' larger') : null;
  }
  const tradeLine = (f) => { const g = gapText(f.bars); return g ? TRADE[f.key] + ' ' + g + ' at this budget.' : null; };

  /** Does an engine finding speak about homes the buyer is actually open to? */
  const fitsScope = (f, openTo) => (openTo === 'new' ? f.bars.some((b) => b.status === 'New') && f.key !== 'status:resale-larger' : openTo === 'resale' ? f.bars.some((b) => b.status !== 'New') && f.key !== 'status:new-larger' : true);

  /** Is the budget workable for what the buyer is open to? Reads the engine's own route positions. */
  function scopeRead(res, openTo) {
    const routes = (res && res.audit && res.audit.routes) || [];
    const usable = routes.filter((r) => r.grade !== 'Concentrated');
    const inScope = (r) => (openTo === 'new' ? routeIsNew(r.id) : openTo === 'resale' ? !routeIsNew(r.id) : true);
    const mine = usable.filter(inScope), others = usable.filter((r) => !inScope(r));
    const comfy = mine.filter((r) => r.position !== 'low-end'), otherComfy = others.filter((r) => r.position !== 'low-end');
    const regions = (rs) => REGION_ORDER.filter((c) => rs.some((r) => routeRegion(r.id) === c));
    return {
      kind: !mine.length ? 'none' : comfy.length ? 'comfortable' : 'entry',
      regions: regions(comfy),
      otherUseful: otherComfy.length > 0, otherRegions: regions(otherComfy),
    };
  }
  const scopeLabel = (openTo) => (openTo === 'new' ? 'new launches' : openTo === 'resale' ? 'resale homes' : 'new launches and resale homes');
  const otherLabel = (openTo) => (openTo === 'new' ? 'resale homes' : 'new launches');

  // ---------------------------------------------------------------- the diagnosis
  /** raw: form answers. market: { res, view, coverage:{min,max} } from the existing engine, or null if it could not load. */
  function analyse(raw, market) {
    const a = normalise(raw), rules = [];
    const M = market && market.res && market.view ? market : null;
    const cov = (market && market.coverage) || DEFAULT_COVERAGE;
    const model = {
      state: 'ok', answers: a, budget: a.budget, budgetText: a.budget ? budgetText(a.budget) : '',
      headline: '', constraint: '', meaning: '', tradeoff: null, routes: [], notes: [], ken: null, ec: null, evidence: null,
      canSeeMarket: false, lens: null, rules: rules, worked: [], insight: null, applied: [], drove: null, other: [],
    };
    if (!a.budget) { model.state = 'invalid'; rules.push('invalid-budget'); return model; }
    model.summary = summaryChips(a, null);

    // 1 coverage and evidence depth
    if (a.budget < cov.min || a.budget > cov.max) {
      rules.push('out-of-range'); model.state = 'out-of-range';
      model.headline = 'This budget is outside what our market data covers.';
      model.meaning = 'Our figures cover private homes between ' + budgetText(cov.min) + ' and ' + budgetText(cov.max) + '. Ken can look at this with you directly.';
      return finish(model, a, M);
    }
    if (!M) {
      rules.push('no-market'); model.state = 'no-market';
      model.headline = "Market figures aren't available just now.";
      model.meaning = 'You can still ask Ken for his view on this search.';
      return finish(model, a, M);
    }
    const v = M.view, res = M.res;
    model.canSeeMarket = true;
    if (v.state === 'thin' || v.state === 'expired') {
      rules.push('thin-market'); model.state = 'thin';
      model.headline = "There aren't enough recent sales near " + model.budgetText + ' to read this reliably.';
      model.meaning = "I'd rather look at this with you than show a thin picture.";
      return finish(model, a, M);
    }
    model.lens = v.lens || null;
    const facts = insightFacts(res), byKey = {};
    facts.forEach((f) => { byKey[f.key] = f; });
    const P = a.priorities, hasSpace = P.indexOf('space') > -1;

    // 2 is the budget workable for what the buyer is open to?
    const sc = scopeRead(res, a.openTo);
    if (sc.kind === 'none') {
      rules.push('scope-none');
      model.headline = 'Few ' + (a.openTo === 'both' ? 'homes' : scopeLabel(a.openTo)) + ' sold near ' + model.budgetText + '.';
      model.meaning = 'There were not enough sales of ' + scopeLabel(a.openTo) + ' at this budget for a reliable read.' + (sc.otherUseful ? ' Sales of ' + otherLabel(a.openTo) + ' were more typical.' : '');
    } else if (sc.kind === 'entry') {
      rules.push('scope-entry');
      model.headline = model.budgetText + ' is at the entry level for ' + scopeLabel(a.openTo) + '.';
      model.meaning = 'Most sales of ' + scopeLabel(a.openTo) + ' were priced above this budget, so expect the older or smaller end of what has sold.';
    } else {
      rules.push('scope-comfortable');
      model.headline = 'Your budget is workable.';
      model.meaning = cap(scopeLabel(a.openTo)) + ' sold around this budget ' + (sc.regions.length === 3 ? 'in all three market regions.' : 'in ' + list(sc.regions.map((c) => REGION_NAME[c])) + '.');
    }

    // 3 an insight is optional. Only show a statement the buyer's answers caused, or a clearly labelled general market observation.
    const specificWhere = a.where !== 'flexible', area = specificWhere && a.whereText ? a.whereText : '';
    if (area) model.applied.push('Near ' + area);
    if (P.indexOf('freehold') > -1) model.applied.push('Freehold or long lease');
    let lensFact = null, drove = null;
    if (sc.kind === 'comfortable' && !area) {
      for (let i = 0; i < P.length && !lensFact; i++) {
        const keys = COST_KEYS[P[i]] || [];
        for (let j = 0; j < keys.length && !lensFact; j++) {
          const f = byKey[keys[j]];
          if (f && fitsScope(f, a.openTo) && gapLarger(f.bars)) { lensFact = f; drove = P[i]; }
        }
      }
      if (lensFact) {
        const w = COST_WORDS[lensFact.key];
        model.insight = { kind: 'personal', label: 'For what matters to you', key: lensFact.key, indicative: lensFact.usesNew,
          lines: [w[0] + ' meant less space at this budget.', w[1] + ' were ' + gapLarger(lensFact.bars) + '.'] };
        rules.push('insight-personal:' + lensFact.key);
      } else if (!P.some((p) => p !== 'space')) {
        const f = facts.find((x) => fitsScope(x, a.openTo) && COMPARE[x.key] && gapLarger(x.bars));
        const t = f ? COMPARE[f.key][0] + ' were ' + gapLarger(f.bars) + ' than ' + COMPARE[f.key][1] + ' at this budget.' : null;
        if (t) { lensFact = f; model.insight = { kind: 'market', label: 'What the market shows', key: f.key, indicative: f.usesNew, lines: [t] }; rules.push('insight-market:' + f.key); }
      }
    }
    if (!model.insight) rules.push('no-insight');
    model.drove = drove;
    if (area) model.meaning = cap(scopeLabel(a.openTo)) + ' sold around this budget.';
    if (model.insight && model.insight.indicative) model.insight.note = 'New-launch figures are indicative.';
    model.summary = summaryChips(a, drove);

    // 5 search routes: conservative. Only where the engine found a clear difference, and only if it fits the buyer.
    const routes = [];
    if ((sc.kind === 'entry' || sc.kind === 'none') && a.openTo !== 'both' && sc.otherUseful) {
      routes.push({ id: 'widen', title: 'Include ' + otherLabel(a.openTo), text: cap(otherLabel(a.openTo)) + ' sales near this budget were more typical, in ' + list(sc.otherRegions.map((c) => REGION_NAME[c])) + '.', giveUp: null });
    }
    const ordered = facts.filter((f) => fitsScope(f, a.openTo)).sort((x, y) => (y.key === (lensFact && lensFact.key) ? 1 : 0) - (x.key === (lensFact && lensFact.key) ? 1 : 0) || x.rank - y.rank);
    ordered.forEach((f) => {
      if (routes.length >= 3) return;
      const t = tradeLine(f); if (!t) return;
      const big = f.bars[0];
      let r = null;
      if (f.key === 'age:older-larger' && a.openTo !== 'new') r = { id: f.key, title: 'Look at older homes', giveUp: P.indexOf('newer') > -1 ? 'This means giving up some newness.' : 'The trade is an older building.' };
      else if (f.key === 'age:newer-larger' && a.openTo !== 'new') r = { id: f.key, title: 'Look at newer resale homes', giveUp: null };
      else if (f.key === 'status:resale-larger' && a.openTo !== 'new') r = { id: f.key, title: 'Consider resale over a new launch', giveUp: P.indexOf('newer') > -1 ? "This means giving up a new launch's newness." : null };
      else if (f.key === 'status:new-larger' && a.openTo !== 'resale') r = { id: f.key, title: 'Consider a new launch', giveUp: null };
      else if ((f.key === 'region:outer-larger' || f.key === 'region:inner-larger') && !(specificWhere && P.indexOf('location') > -1 && !hasSpace)) {
        const far = f.key === 'region:outer-larger';
        r = { id: f.key, title: far ? 'Look further from the centre' : 'Look closer in',
          giveUp: specificWhere ? 'This compares broad regions, not your specific area.' : (P.indexOf('location') > -1 && far ? 'This means giving up some location.' : null) };
      } else if (f.key === 'tenure type:freehold-larger') r = { id: f.key, title: 'Look at freehold or 999-year homes', giveUp: null };
      else if (f.key === 'tenure type:leasehold-larger' && !(P.indexOf('freehold') > -1 && !hasSpace)) r = { id: f.key, title: 'Look at leasehold homes', giveUp: P.indexOf('freehold') > -1 ? 'This means giving up freehold or a longer tenure.' : null };
      if (r) { r.text = t + (f.usesNew ? ' New-launch figures are indicative.' : ''); routes.push(r); }
    });
    model.routes = routes.slice(0, 3); rules.push('routes:' + model.routes.length);

    // 6 what the data cannot see, and what was not used (shown only inside "How this was worked out")
    const blind = [];
    if (a.size !== 'not-sure') blind.push('bedroom counts');
    if (specificWhere && a.whereText) blind.push('your specific area');
    if (blind.length) { rules.push('blind-note'); model.notes.push('Our market figures are grouped by region, age and new-vs-resale. They do not cover ' + list(blind) + ', so they cannot say how those compare.'); }
    P.forEach((p) => {
      if (p === 'freehold' || p === drove) return;
      if (p === 'space' && model.insight && model.insight.kind === 'market') return;
      model.notes.push('You also chose ' + PRIORITY[p].toLowerCase() + '. It is not used to filter or rank the list.');
    });
    // other comparisons the engine found, and the separate EC route, for the disclosure only
    model.other = model.routes.filter((r) => !lensFact || r.id !== lensFact.key).map((r) => r.text);
    if (v.ken) model.ken = v.ken;
    if (v.ec) model.ec = v.ec;
    return finish(model, a, M);
  }

  /** Only answers that were actually used. Bedrooms never appear. */
  function summaryChips(a, drove) {
    const c = [budgetText(a.budget)];
    if (a.openTo !== 'both') c.push(OPEN_TO[a.openTo]);
    if (a.where !== 'flexible' && a.whereText) c.push(a.whereText);
    if (a.priorities.indexOf('freehold') > -1) c.push(PRIORITY.freehold);
    if (drove && drove !== 'freehold') c.push(PRIORITY[drove]);
    return c;
  }

  function finish(model, a, M) {
    model.canSeeMarket = model.state === 'ok' || model.state === 'thin';
    model.worked = worked(model, M);
    return model;
  }

  /** The "How this was worked out" list: [{kind, text}], kind = evidence | rule | ken */
  function worked(model, M) {
    const w = [];
    if (M && M.res && M.res.footer) w.push({ kind: 'evidence', text: M.res.footer + ' Source: URA. These show what sold, not what is for sale now.' });
    w.push({ kind: 'evidence', text: 'A comparison is only used when the market data shows a clear difference: at least about 100 sq ft, with the typical sizes clearly separated.' });
    w.push({ kind: 'rule', text: 'A priority is only mentioned when the market data has a matching comparison: closer to the centre uses region, newer building uses age and new-vs-resale, freehold or long lease uses tenure.' });
    w.push({ kind: 'rule', text: 'Bedrooms are not in the sales records, so they do not change this result. A specific area is passed on so you can confirm a district.' });
    w.push({ kind: 'ken', text: 'Which developments suit you and how much to spend are judgement calls, not data.' });
    return w;
  }

  // ---------------------------------------------------------------- hand-offs (all non-sensitive)
  /** Minimal and non-sensitive. Never includes the free-text location, bedrooms or priorities. */
  function waMessage(answers) {
    const a = normalise(answers);
    return "Hi Ken, I'm looking at a purchase" + (a.budget ? ' around ' + budgetText(a.budget) : '') + ' and would like your view.';
  }
  /** Same shape the HDB journey writes, so What Can I Buy reads the budget without any change to its engine. */
  function buildHandoff(answers) {
    const a = normalise(answers);
    return { v: 1, from: 'buy', state: 'ok', budget: { low: a.budget, high: a.budget, single: true },
      purpose: null, openTo: a.openTo, size: a.size, where: a.where, whereText: a.whereText, priorities: a.priorities.slice() };
  }
  const ANALYTICS_KEYS = ['budget_band', 'open_to', 'size', 'where_type', 'priority_1', 'priority_2', 'result_state', 'lens', 'insight_shown', 'ken_take_shown'];
  /** Anonymous, bucketed, categorical. Never the exact budget, never the free text. */
  function analytics(model) {
    const a = model.answers, m = a.budget || 0, step = 200000;
    const band = m < 600000 ? 'under-0.6m' : m >= 4000000 ? '4m-plus' : (Math.floor(m / step) * step / 1e6).toFixed(1) + '-' + ((Math.floor(m / step) * step + step) / 1e6).toFixed(1) + 'm';
    return { budget_band: band, open_to: a.openTo, size: a.size, where_type: a.where,
      priority_1: a.priorities[0] || 'none', priority_2: a.priorities[1] || 'none', result_state: model.state, lens: model.lens || 'none',
      insight_shown: model.insight ? model.insight.kind : 'none', ken_take_shown: !!model.ken };
  }

  return {
    analyse, normalise, validateBudget, roundBudget, budgetText, waMessage, buildHandoff, analytics, summaryChips,
    OPEN_TO, SIZE, WHERE, PRIORITY, COST_KEYS, UNMEASURED, TRADE, ANALYTICS_KEYS, DEFAULT_COVERAGE, BUDGET_MIN, BUDGET_MAX, REGION_NAME,
  };
});
