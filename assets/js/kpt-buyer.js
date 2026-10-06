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

  const PURPOSE = { 'own-stay': 'Own stay', investment: 'Investment', both: 'A bit of both' };
  const OPEN_TO = { new: 'New launch', resale: 'Resale', both: 'Both / not sure' };
  const SIZE = { '1br': '1BR', '2br': '2BR', '3br': '3BR', '3br-study': '3BR + Study / larger', '4br-plus': '4BR+', 'not-sure': 'Not sure' };
  const WHERE = { areas: 'Specific areas in mind', family: 'Near family', work: 'Near work', school: 'Near a particular school', flexible: 'Location is flexible' };
  const PRIORITY = {
    space: 'More space', location: 'Better location', newer: 'Newer development', investment: 'Investment potential',
    schools: 'Schools', monthly: 'Lower monthly commitment', freehold: 'Freehold / tenure', facilities: 'Facilities / lifestyle',
  };
  // how a priority reads inside a sentence
  const PHRASE = {
    space: 'more space', location: 'a better location', newer: 'a newer development', investment: 'investment potential',
    schools: 'schools', monthly: 'a lower monthly commitment', freehold: 'freehold or a longer tenure', facilities: 'lifestyle facilities',
  };
  // priorities that sales data can speak to, and the engine finding that shows what that priority tends to cost in space
  const COST_KEYS = {
    location: ['region:outer-larger'],                         // closer in = less space
    newer: ['age:older-larger', 'status:resale-larger'],       // newer = less space
    freehold: ['tenure type:leasehold-larger'],                // freehold / 999-year = less space
  };
  const UNMEASURED = ['investment', 'schools', 'monthly', 'facilities'];

  // Same wording the What Can I Buy screen uses for the same engine findings (a test keeps the two in step).
  const TRADE = {
    'age:older-larger': 'Going older opened up', 'age:newer-larger': 'Going newer opened up',
    'status:resale-larger': 'Choosing resale over a new launch opened up', 'status:new-larger': 'Choosing a new launch opened up',
    'region:outer-larger': 'Going further out opened up', 'region:inner-larger': 'Going closer in opened up',
    'tenure type:freehold-larger': 'Choosing freehold or 999-year opened up', 'tenure type:leasehold-larger': 'Choosing leasehold opened up',
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
    const where = pick(WHERE, raw.where, 'flexible');
    const seen = {}, pr = (Array.isArray(raw.priorities) ? raw.priorities : []).filter((p) => PRIORITY[p] && !seen[p] && (seen[p] = true)).slice(0, 2);
    const b = validateBudget(raw.budget);
    return {
      budget: b.ok ? b.value : null,
      purpose: pick(PURPOSE, raw.purpose, ''),            // '' = not stated
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
      canSeeMarket: false, lens: null, rules: rules, worked: [],
    };
    if (!a.budget) { model.state = 'invalid'; rules.push('invalid-budget'); return model; }
    model.summary = summaryChips(a);

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

    // 3 what is actually constraining the search? Match priorities to the engine's own findings, only where it found one.
    const measured = P.filter((p) => COST_KEYS[p]), unmeasured = P.filter((p) => UNMEASURED.indexOf(p) > -1);
    const evidenced = (p) => { const k = (COST_KEYS[p] || []).find((key) => byKey[key]); return k ? byKey[k] : null; };
    let lensFact = null;
    if (sc.kind === 'comfortable') {
      const costed = measured.map((p) => ({ p, f: evidenced(p) })).filter((x) => x.f);
      if (hasSpace && costed.length) {
        rules.push('tension-space');
        const c = costed[0];
        model.constraint = 'The bigger constraint is combining more space with ' + PHRASE[c.p] + '.';
        lensFact = c.f;
      } else if (!hasSpace && costed.length === 2) {
        rules.push('tension-pair');
        model.constraint = 'The bigger constraint is asking for ' + PHRASE[costed[0].p] + ' and ' + PHRASE[costed[1].p] + ' together: at this budget, each tended to come with less space.';
        lensFact = costed[0].f;
      } else if (!hasSpace && costed.length === 1) {
        rules.push('tension-single');
        model.constraint = 'The main trade-off is ' + PHRASE[costed[0].p] + ': at this budget it tended to come with less space.';
        lensFact = costed[0].f;
      } else if (hasSpace && measured.length && !costed.length) {
        rules.push('no-conflict-found');
        model.constraint = 'More space and ' + list(measured.map((p) => PHRASE[p])) + ' did not show a clear conflict in recent sales at this budget.';
      } else if (hasSpace) {
        rules.push('space-only');
        model.constraint = 'The main question is where this budget finds the most space.';
        lensFact = facts.find((f) => fitsScope(f, a.openTo)) || null;
      } else if (!P.length || (unmeasured.length && !measured.length)) {
        if (v.hero) { rules.push('market-lens'); lensFact = facts.find((f) => fitsScope(f, a.openTo)) || null; model.constraint = ''; }
        else rules.push('market-no-lens');
      }
      if (unmeasured.length && !measured.length && !hasSpace) {
        rules.push('unmeasured-only');
        model.constraint = 'What matters most to you, ' + list(unmeasured.map((p) => PHRASE[p])) + ', goes beyond what sales data can show.';
      }
    } else if (hasSpace) {
      lensFact = facts.find((f) => fitsScope(f, a.openTo)) || null;
    }

    // 4 the one trade-off line
    if (lensFact) { const t = tradeLine(lensFact); if (t) { model.tradeoff = { key: lensFact.key, text: t, indicative: lensFact.usesNew }; rules.push('tradeoff:' + lensFact.key); } }
    if (!lensFact && v.summary && (v.state === 'no-lens')) {
      model.evidence = { headline: v.summary.headline, range: v.summary.rangeText || null };
      rules.push('typical-size');
    }

    // 5 search routes: conservative. Only where the engine found a clear difference, and only if it fits the buyer.
    const routes = [];
    const specificWhere = a.where !== 'flexible';
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

    // 6 quiet notes: what the data cannot see
    const blind = [];
    if (a.size !== 'not-sure') blind.push('bedroom counts');
    if (a.where === 'areas') blind.push('specific areas'); else if (a.where === 'school') blind.push('schools'); else if (a.where === 'family' || a.where === 'work') blind.push('where your family or work is');
    if (P.indexOf('schools') > -1 && blind.indexOf('schools') < 0) blind.push('schools');
    if (blind.length) { rules.push('blind-note'); model.notes.push('Our market figures are grouped by region, age and new-vs-resale. They do not cover ' + list(blind) + ', so they cannot say how those compare. That is something to work through with Ken.'); }
    if (unmeasured.filter((p) => p !== 'schools').length && !(rules.indexOf('unmeasured-only') > -1)) {
      model.notes.push(cap(list(unmeasured.filter((p) => p !== 'schools').map((p) => PHRASE[p]))) + ' cannot be read from sales data, so this does not weigh ' + (unmeasured.filter((p) => p !== 'schools').length > 1 ? 'them' : 'it') + '.');
    }
    if (a.purpose === 'investment' || a.purpose === 'both' || P.indexOf('investment') > -1) {
      rules.push('investment-note'); model.notes.push('We do not hold rental or yield data, so this describes size and price only.');
    }

    // 7 Ken's Take and the separate EC route: passed through exactly as the engine gated them
    if (v.ken) model.ken = v.ken;
    if (v.ec && a.purpose !== 'investment') model.ec = v.ec;
    return finish(model, a, M);
  }

  function summaryChips(a) {
    const c = [budgetText(a.budget)];
    if (a.purpose) c.push(PURPOSE[a.purpose]);
    if (a.openTo !== 'both') c.push(OPEN_TO[a.openTo]);
    if (a.size !== 'not-sure') c.push(SIZE[a.size]);
    if (a.where !== 'flexible') c.push(a.whereText || WHERE[a.where]);
    a.priorities.forEach((p) => c.push(PRIORITY[p]));
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
    w.push({ kind: 'rule', text: 'Each priority is matched to the comparison that shows what it tends to cost in space: location to region, newer development to age and new-vs-resale, freehold to tenure. This wording is Ken Property Tools\' framework, not Ken\'s Take.' });
    w.push({ kind: 'rule', text: 'Bedroom size, areas, schools and similar needs are collected to understand your search. The market data does not evaluate them.' });
    w.push({ kind: 'ken', text: 'Which developments suit you, how to weigh schools or rental potential, and how much to spend are judgement calls, not data.' });
    return w;
  }

  // ---------------------------------------------------------------- hand-offs (all non-sensitive)
  const PURPOSE_PHRASE = { 'own-stay': 'an own-stay purchase', investment: 'an investment purchase', both: 'a purchase for own stay and investment', '': 'a purchase' };
  /** Minimal and non-sensitive. Never includes the free-text location, bedrooms or priorities. */
  function waMessage(answers) {
    const a = normalise(answers);
    return "Hi Ken, I'm looking at " + PURPOSE_PHRASE[a.purpose] + (a.budget ? ' around ' + budgetText(a.budget) : '') + ' and would like your view.';
  }
  /** Same shape the HDB journey writes, so What Can I Buy reads the budget without any change to its engine. No free text. */
  function buildHandoff(answers) {
    const a = normalise(answers);
    return { v: 1, from: 'buy', state: 'ok', budget: { low: a.budget, high: a.budget, single: true },
      purpose: a.purpose || null, openTo: a.openTo, size: a.size, where: a.where, whereText: a.whereText, priorities: a.priorities.slice() };
  }
  const ANALYTICS_KEYS = ['budget_band', 'purpose', 'open_to', 'size', 'where_type', 'priority_1', 'priority_2', 'result_state', 'lens', 'routes_shown', 'ken_take_shown'];
  /** Anonymous, bucketed, categorical. Never the exact budget, never the free text. */
  function analytics(model) {
    const a = model.answers, m = a.budget || 0, step = 200000;
    const band = m < 600000 ? 'under-0.6m' : m >= 4000000 ? '4m-plus' : (Math.floor(m / step) * step / 1e6).toFixed(1) + '-' + ((Math.floor(m / step) * step + step) / 1e6).toFixed(1) + 'm';
    return { budget_band: band, purpose: a.purpose || 'not-stated', open_to: a.openTo, size: a.size, where_type: a.where,
      priority_1: a.priorities[0] || 'none', priority_2: a.priorities[1] || 'none', result_state: model.state, lens: model.lens || 'none',
      routes_shown: model.routes.length, ken_take_shown: !!model.ken };
  }

  return {
    analyse, normalise, validateBudget, roundBudget, budgetText, waMessage, buildHandoff, analytics, summaryChips,
    PURPOSE, OPEN_TO, SIZE, WHERE, PRIORITY, PHRASE, COST_KEYS, UNMEASURED, TRADE, ANALYTICS_KEYS, DEFAULT_COVERAGE, BUDGET_MIN, BUDGET_MAX, REGION_NAME,
  };
});
