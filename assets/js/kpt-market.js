/* ==========================================================================
   Ken Property Tools — market adapter (generic)

   Two layers, deliberately kept apart:
     1. MARKET EVIDENCE  — what a budget can realistically buy, from data.
     2. KEN'S JUDGEMENT  — which of those options Ken thinks are worth considering.

   The UI only ever talks to the functions below. Where the data comes from
   (a hand-maintained Google Sheet today; project + transaction data later)
   is hidden behind `bands()` / `shortlistSelect()`, so the source can change
   without touching any page.

   Pure functions + one loader. Works in the browser (window.KPT_MARKET) and
   in Node (require) so the logic is unit-tested.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPT_MARKET = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_SETTINGS = {
    stale_days: 120,          // older than this: numbers shown, labelled indicative
    expired_days: 270,        // older than this: no verdict for that segment
    hold_tolerance_pct: 5,    // shortlist held if its price moves this far above Ken's window
    near_miss_pct: 10,        // "just out of reach" = budget within this % below P25
    review_days: 90,
    max_shortlist: 3,
  };

  const REGION_ORDER = ['CCR', 'RCR', 'OCR'];        // centre outwards
  const AGE_ORDER = ['0–10', '10–25', '25+', '–', ''];
  const RANK = { 'works-well': 3, 'works-part': 2, 'near-miss': 1, unusual: 0, 'no-data': -1 };

  // ------------------------------------------------------------------ parsing
  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = ''; rows.push(row); row = [];
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map((h) => h.trim().toLowerCase());
    return rows.slice(1)
      .filter((r) => r.some((v) => String(v).trim() !== ''))
      .map((r) => { const o = {}; head.forEach((h, i) => { o[h] = (r[i] === undefined ? '' : String(r[i])).trim(); }); return o; });
  }

  const num = (v) => {
    if (v === undefined || v === null) return null;
    const t = String(v).replace(/[$,\s]/g, '');
    if (t === '' || isNaN(Number(t))) return null;
    return Number(t);
  };
  const parseDate = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '').trim());
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  };
  const daysBetween = (a, b) => Math.floor((b - a) / 86400000);
  const normAge = (v) => String(v || '').replace(/\s*(yrs?|years?)\s*$/i, '').replace(/-/g, '–').trim();

  const REGIONS = ['OCR', 'RCR', 'CCR'];
  const BAND_NUMS = ['bedroom', 'p25', 'p75', 'p10', 'p90', 'sqft_low', 'sqft_high', 'n_txns'];

  /** `issues` (optional array) collects why a row was dropped or looks wrong, with its sheet row number. */
  function normaliseBands(rows, issues) {
    const log = (level, i, msg) => { if (issues) issues.push({ level, where: 'Market Evidence', row: i + 2, msg }); };
    const seen = {}, out = [];
    (rows || []).forEach((r, i) => {
      const b = {
        region: (r.region || '').toUpperCase(), status: /new/i.test(r.status) ? 'New' : 'Resale',
        ageBand: normAge(r.age_band), bedroom: num(r.bedroom),
        p10: num(r.p10), p25: num(r.p25), p75: num(r.p75), p90: num(r.p90),
        sqftLow: num(r.sqft_low), sqftHigh: num(r.sqft_high), n: num(r.n_txns),
        period: r.period || '', asOf: parseDate(r.as_of), basis: r.basis || r.source || '',
      };
      if (!REGIONS.includes(b.region)) return log('error', i, 'Row dropped: region must be OCR, RCR or CCR (got "' + (r.region || '') + '").');
      if (!b.bedroom) return log('error', i, 'Row dropped: bedroom is missing.');
      if (b.p25 === null || b.p75 === null) return log('error', i, 'Row dropped: p25 and p75 are both required.');
      if (b.p25 > b.p75) return log('error', i, 'Row dropped: p25 is higher than p75.');
      if (!b.asOf) log('warn', i, 'as_of is missing or not in YYYY-MM-DD form: this row will be treated as expired.');
      if (b.status === 'New' && b.ageBand && b.ageBand !== '–') log('warn', i, 'New launch rows should have age_band "–".');
      if (b.sqftLow && b.sqftHigh && b.sqftLow > b.sqftHigh) log('warn', i, 'sqft_low is higher than sqft_high.');
      const key = [b.region, b.status, b.ageBand, b.bedroom].join('|');
      if (seen[key]) log('warn', i, 'Duplicate of row ' + seen[key] + ' (same region, status, age band and bedroom): both are kept, check which is right.');
      else seen[key] = i + 2;
      out.push(b);
    });
    return out;
  }

  const STATES = ['active', 'review due', 'retired'];
  function normaliseShortlist(rows, issues) {
    const log = (level, i, msg, id) => { if (issues) issues.push({ level, where: 'Shortlist', row: i + 2, msg: (id ? id + ': ' : '') + msg }); };
    const out = [], ids = {};
    (rows || []).forEach((r, i) => {
      const s = {
        entryId: r.entry_id || '', state: r.state || 'Active', priority: num(r.priority),
        label: r.label || '', project: r.project || '', projectId: r.project_id || '',
        region: (r.region || '').toUpperCase(), status: /new/i.test(r.status) ? 'New' : 'Resale',
        ageBand: normAge(r.age_band), bedroom: num(r.bedroom),
        budgetMin: num(r.budget_min), budgetMax: num(r.budget_max), purpose: (r.purpose || 'any').toLowerCase(),
        reason: r.reason || '', tradeOff: r.trade_off || '',
        indicativeLow: num(r.indicative_low), indicativeHigh: num(r.indicative_high),
        priceAsOf: parseDate(r.price_as_of), reviewedOn: parseDate(r.reviewed_on), reviewBy: parseDate(r.review_by),
      };
      if (!s.entryId) return;                       // blank spreadsheet row
      if (!s.project) return log('error', i, 'Entry dropped: project name is missing.', s.entryId);
      if (ids[s.entryId]) log('warn', i, 'entry_id is used twice (also row ' + ids[s.entryId] + ').', s.entryId); else ids[s.entryId] = i + 2;
      if (!STATES.includes(s.state.toLowerCase())) log('warn', i, 'state "' + s.state + '" is not Active, Review due or Retired: treated as Active.', s.entryId);
      if (!s.bedroom) log('error', i, 'bedroom is missing: this entry can never be shown.', s.entryId);
      if (!REGIONS.includes(s.region)) log('warn', i, 'region should be OCR, RCR or CCR.', s.entryId);
      if (!s.reason) log('warn', i, 'reason is empty: visitors would see a project with no explanation.', s.entryId);
      if (s.budgetMin !== null && s.budgetMax !== null && s.budgetMin > s.budgetMax) log('error', i, 'budget_min is higher than budget_max.', s.entryId);
      if (s.indicativeLow !== null && s.indicativeHigh !== null && s.indicativeLow > s.indicativeHigh) log('error', i, 'indicative_low is higher than indicative_high.', s.entryId);
      if (s.indicativeLow === null) log('warn', i, 'No indicative price: the price line and the held-check cannot work for this entry.', s.entryId);
      if (!s.reviewedOn) log('warn', i, 'reviewed_on is missing (the "Ken\'s view as of" line uses it).', s.entryId);
      out.push(s);
    });
    return out;
  }

  function normaliseSettings(rows) {
    const s = Object.assign({}, DEFAULT_SETTINGS);
    (rows || []).forEach((r) => { const v = num(r.value); if (r.key && v !== null && r.key in s) s[r.key] = v; });
    return s;
  }

  // ---------------------------------------------------------------- formatting
  function money(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e6) return '$' + (a / 1e6).toFixed(2) + 'm';
    if (a >= 1e3) return '$' + Math.round(a / 1e3) + 'k';
    return '$' + Math.round(a);
  }
  const budgetText = (b) => (b.low === b.high ? '~' + money(b.low) : money(b.low) + '–' + money(b.high));
  const sqftText = (s) => (s.sqftLow && s.sqftHigh ? s.sqftLow.toLocaleString('en-SG') + '–' + s.sqftHigh.toLocaleString('en-SG') + ' sq ft' : null);
  const monthYear = (d) => (d ? d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
  const ageText = (a) => (a && a !== '–' ? a + ' yrs old' : '');

  function segmentLabel(s) {
    return s.region + ' · ' + (s.status === 'New' ? 'new launch' : 'resale' + (ageText(s.ageBand) ? ', ' + ageText(s.ageBand) : ''));
  }
  const groupName = (g) => (g.status === 'New' ? g.region + ' new launches' : g.region + ' resale');
  function joinList(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  // ------------------------------------------------------- 1. market evidence
  function freshness(asOf, today, s) {
    if (!asOf) return 'expired';
    const d = daysBetween(asOf, today);
    return d > s.expired_days ? 'expired' : d > s.stale_days ? 'stale' : 'ok';
  }

  /** Verdict of a budget range against one typical transacted range (P25–P75).
   *  Conservative end of the range decides "works well"; the upper end decides what is reachable. */
  function verdict(budget, p25, p75, nearPct) {
    if (budget.low >= p75) return 'works-well';
    if (budget.high >= p25) return 'works-part';
    if (budget.high >= p25 * (1 - nearPct / 100)) return 'near-miss';
    return 'unusual';
  }

  function bands(opts) {
    const s = Object.assign({}, DEFAULT_SETTINGS, opts.settings || {});
    const today = opts.today || new Date();
    const segs = (opts.bands || []).filter((b) => b.bedroom === opts.bedroom).map((b) => {
      const fresh = freshness(b.asOf, today, s);
      return Object.assign({}, b, {
        id: [b.region, b.status, b.ageBand].join('|'), label: segmentLabel(b), freshness: fresh,
        verdict: fresh === 'expired' ? 'no-data' : verdict(opts.budget, b.p25, b.p75, s.near_miss_pct),
      });
    });
    // Shown OCR → RCR → CCR (further out to closer in), resale before new, older after newer.
    segs.sort((a, b) => REGION_ORDER.indexOf(b.region) - REGION_ORDER.indexOf(a.region)
      || (a.status === b.status ? 0 : a.status === 'Resale' ? -1 : 1)
      || AGE_ORDER.indexOf(a.ageBand) - AGE_ORDER.indexOf(b.ageBand));

    const groups = {};
    segs.forEach((g) => {
      const k = g.region + '|' + g.status;
      (groups[k] = groups[k] || { key: k, region: g.region, status: g.status, segments: [] }).segments.push(g);
    });
    const list = Object.values(groups).map((g) => {
      const best = Math.max.apply(null, g.segments.map((x) => RANK[x.verdict]));
      const reach = g.segments.filter((x) => RANK[x.verdict] >= 2).length;
      return Object.assign(g, { score: best + 0.1 * reach, topRank: best, stale: g.segments.some((x) => x.freshness !== 'ok') });
    });
    list.sort((a, b) => b.score - a.score);
    const usable = segs.filter((x) => x.verdict !== 'no-data');
    return {
      segments: segs, groups: list, best: list.length && list[0].topRank >= 2 ? list[0] : null,
      hasData: usable.length > 0, anyStale: segs.some((x) => x.freshness !== 'ok'),
      anyExpired: segs.some((x) => x.freshness === 'expired'),
    };
  }

  // ----------------------------------------------------------------- headline
  function headline(analysis, bedroom, budget) {
    const bt = budgetText(budget), bed = bedroom + '-bedroom';
    if (!analysis.hasData) return { title: 'What can ' + bt + ' buy?', body: '' };
    const g = analysis.groups;
    if (!analysis.best) {
      const near = g.filter((x) => x.topRank >= 1).map(groupName);
      return {
        title: 'At ' + bt + ', ' + bed + ' options are limited in the segments we track.',
        body: near.length ? 'The closest are ' + joinList(near) + ', where typical prices sit just above this budget.'
          : 'Typical ' + bed + ' prices in the segments we track sit above this budget.',
      };
    }
    const b = analysis.best;
    const noun = b.status === 'New' ? 'new-launch' : 'resale';
    const verb = b.stale ? 'appear strongest' : 'are strongest';
    const title = 'At ' + bt + ', ' + bed + ' ' + noun + ' options ' + verb + ' in the ' + b.region + '.';
    const harder = g.filter((x) => x !== b && x.topRank <= 1).map(groupName);
    const also = g.filter((x) => x !== b && x.topRank === 2).map(groupName);
    const parts = [];
    if (harder.length > 3) {
      parts.push('Most other segments we track look harder: typical ' + bed + ' prices there start above your range.');
      if (also.length) parts.unshift(joinList(also).replace(/^./, (c) => c.toUpperCase()) + ' ' + (also.length > 1 ? 'are' : 'is') + ' also possible, with fewer choices.');
      return { title, body: parts.join(' ') };
    }
    if (also.length) parts.push(joinList(also).replace(/^./, (c) => c.toUpperCase()) + ' ' + (also.length > 1 ? 'are' : 'is') + ' also possible, with fewer choices.');
    if (harder.length) parts.push(joinList(harder).replace(/^./, (c) => c.toUpperCase()) + ' look' + (harder.length > 1 ? '' : 's') + ' harder: typical ' + bed + ' prices there start above your range.');
    if (!parts.length) parts.push('Several segments are within reach; the trade-offs below show how they differ.');
    return { title, body: parts.join(' ') };
  }

  // ---------------------------------------------------------------- trade-offs
  const VERDICT_PHRASE = {
    'works-well': 'Typically within your budget.', 'works-part': 'Within reach for part of the market.',
    'near-miss': 'Typically just above your range.', unusual: 'Typically above your range.', 'no-data': '',
  };
  const reachable = (s) => RANK[s.verdict] >= 2;
  const bestOf = (arr) => arr.slice().sort((a, b) => RANK[b.verdict] - RANK[a.verdict])[0] || null;
  const mid = (s) => (s.sqftLow && s.sqftHigh ? (s.sqftLow + s.sqftHigh) / 2 : null);
  const roundTo = (n, k) => Math.round(n / k) * k;

  function tradeoffs(opts) {
    const a = opts.analysis, bedroom = opts.bedroom, h = opts.handoff || {};
    const out = [];
    const usable = a.segments.filter((x) => x.verdict !== 'no-data');
    const resale = usable.filter((x) => x.status === 'Resale');

    // 1. Space or newness
    const rs = bestOf(resale.filter(reachable)), ns = bestOf(usable.filter((x) => x.status === 'New'));
    if (rs && ns) {
      let diff = '';
      if (mid(rs) && mid(ns)) {
        const d = roundTo(mid(rs) - mid(ns), 50);
        if (Math.abs(d) >= 50) diff = ' About ' + Math.abs(d) + ' sq ft ' + (d > 0 ? 'more' : 'less') + ' space than the new-launch option.';
      }
      out.push({
        id: 'space-newness', title: 'Space or newness',
        a: { head: 'Resale' + (ageText(rs.ageBand) ? ', ' + ageText(rs.ageBand) : ''), text: [sqftText(rs) ? 'Typically ' + sqftText(rs) + '.' : '', VERDICT_PHRASE[rs.verdict] + diff].filter(Boolean).join(' ') },
        b: { head: 'New launch', text: [sqftText(ns) ? 'Typically ' + sqftText(ns) + '.' : '', VERDICT_PHRASE[ns.verdict], 'Usually a wait until completion.'].filter(Boolean).join(' ') },
      });
    }

    // 2. Location or size (two regions both reachable for resale)
    const byRegion = {};
    resale.filter(reachable).forEach((x) => { (byRegion[x.region] = byRegion[x.region] || []).push(x); });
    const regions = REGION_ORDER.filter((r) => byRegion[r]);
    if (regions.length >= 2) {
      const inner = bestOf(byRegion[regions[0]]), outer = bestOf(byRegion[regions[regions.length - 1]]);
      let diff = '';
      if (mid(inner) && mid(outer)) {
        const d = roundTo(mid(outer) - mid(inner), 50);
        if (Math.abs(d) >= 50) diff = ' About ' + Math.abs(d) + ' sq ft ' + (d > 0 ? 'more' : 'less') + ' than closer in.';
      }
      out.push({
        id: 'location-size', title: 'Location or size',
        a: { head: 'Closer to the city (' + inner.region + (ageText(inner.ageBand) ? ', ' + ageText(inner.ageBand) : '') + ')', text: sqftText(inner) ? 'Typically ' + sqftText(inner) + '.' : VERDICT_PHRASE[inner.verdict] },
        b: { head: 'Further out (' + outer.region + (ageText(outer.ageBand) ? ', ' + ageText(outer.ageBand) : '') + ')', text: [sqftText(outer) ? 'Typically ' + sqftText(outer) + '.' : '', diff.trim()].filter(Boolean).join(' ') },
      });
    }

    // 3. Price or monthly cost (only when the budget is a range and the monthly figures came with it)
    if (h.monthly && h.monthly.low && h.monthly.high && opts.budget.low !== opts.budget.high) {
      const f = (x) => '$' + Math.round(x.monthly).toLocaleString('en-SG') + ' a month (' + Math.round(x.pct * 100) + '% of income)';
      out.push({
        id: 'price-monthly', title: 'Price or monthly cost',
        a: { head: 'Lower end of your range', text: 'About ' + f(h.monthly.low) + '.' },
        b: { head: 'Upper end of your range', text: 'About ' + f(h.monthly.high) + '.' },
      });
    }

    // 4. Lease — only when it plausibly matters (older buyers) and the data exists
    if (h.maxAge >= 45) {
      const old = bestOf(resale.filter((x) => x.ageBand === '25+')), newer = bestOf(resale.filter((x) => x.ageBand === '0–10'));
      if (old && newer) {
        out.push({
          id: 'lease', title: 'Lease length',
          a: { head: 'Newer resale (0–10 yrs old)', text: 'Typically ' + money(newer.p25) + '–' + money(newer.p75) + '. ' + VERDICT_PHRASE[newer.verdict] },
          b: { head: 'Older resale (25+ yrs old)', text: 'Typically ' + money(old.p25) + '–' + money(old.p75) + ', but CPF use depends on whether the remaining lease covers the youngest buyer to age 95 (CPF Board). Worth checking your remaining lease with CPF and your bank before you commit.' },
        });
      }
    }
    return out;
  }

  // --------------------------------------------------- 2. Ken's shortlist logic
  /** Pure selection. Returns what to show, plus what needs Ken's attention. */
  function shortlistSelect(opts) {
    const s = Object.assign({}, DEFAULT_SETTINGS, opts.settings || {});
    const today = opts.today || new Date(), b = opts.budget;
    const purpose = opts.purpose || 'own-stay';
    const shown = [], held = [], reviewDue = [];
    (opts.shortlist || []).forEach((e) => {
      if (/^retired$/i.test(e.state)) return;
      if (e.bedroom !== opts.bedroom) return;
      const isHeld = e.indicativeLow !== null && e.budgetMax !== null && e.indicativeLow > e.budgetMax * (1 + s.hold_tolerance_pct / 100);
      const due = /^review due$/i.test(e.state) || (e.reviewBy && e.reviewBy < today);
      if (isHeld) { held.push(e); return; }
      if (due) reviewDue.push(e);
      const inWindow = (e.budgetMin === null || b.high >= e.budgetMin) && (e.budgetMax === null || b.low <= e.budgetMax);
      const affordable = e.indicativeLow === null || e.indicativeLow <= b.high;
      const purposeOk = e.purpose === 'any' || e.purpose === '' || e.purpose === purpose;
      if (inWindow && affordable && purposeOk) shown.push(Object.assign({}, e, { reviewDue: !!due }));
    });
    const centre = (e) => (e.budgetMin !== null && e.budgetMax !== null ? (e.budgetMin + e.budgetMax) / 2 : (b.low + b.high) / 2);
    const target = (b.low + b.high) / 2;
    shown.sort((x, y) => (x.priority === null ? 999 : x.priority) - (y.priority === null ? 999 : y.priority)
      || Math.abs(centre(x) - target) - Math.abs(centre(y) - target));
    const top = shown.slice(0, s.max_shortlist).map((e) => ({
      entryId: e.entryId, label: e.label, project: e.project, projectId: e.projectId,
      segmentLabel: segmentLabel(e), bedroom: e.bedroom, reason: e.reason, tradeOff: e.tradeOff,
      indicative: { low: e.indicativeLow, high: e.indicativeHigh, asOf: e.priceAsOf },
      reviewedOn: e.reviewedOn, reviewDue: e.reviewDue,
    }));
    const dates = top.map((t) => t.reviewedOn).filter(Boolean).sort((x, y) => x - y);
    return { shown: top, available: top.length > 0, held, reviewDue, viewAsOf: dates.length ? dates[0] : null };
  }

  // --------------------------------------------- shortlist → comparison handoff
  /** The structure the (future) comparison tool will read. Ids and ranges only. */
  function compareHandoff(opts) {
    return {
      v: 1, type: 'compare-request', from: 'what-can-i-buy',
      budget: { low: opts.budget.low, high: opts.budget.high }, bedroom: opts.bedroom,
      items: opts.selected.map((x) => ({
        entryId: x.entryId, projectId: x.projectId || null, name: x.project, label: x.label,
        segment: x.segmentLabel, bedroom: x.bedroom, indicative: { low: x.indicative.low, high: x.indicative.high },
      })),
    };
  }

  // --------------------------------------------------------------- analytics
  const ANALYTICS_KEYS = ['budget_band', 'bedroom', 'shortlist_available', 'shortlist_count', 'data_basis', 'data_stale', 'placement'];
  /** Anonymous, bucketed. Never the exact budget, never any underlying input. */
  function budgetBand(budget) {
    const m = (budget.low + budget.high) / 2, step = 200000;
    if (m < 600000) return 'under-0.6m';
    if (m >= 4000000) return '4m-plus';
    const lo = Math.floor(m / step) * step;
    return (lo / 1e6).toFixed(1) + '-' + ((lo + step) / 1e6).toFixed(1) + 'm';
  }
  function analyticsPayload(o) {
    const p = {
      budget_band: budgetBand(o.budget), bedroom: o.bedroom, shortlist_available: !!o.shortlistAvailable,
      shortlist_count: o.shortlistCount || 0, data_basis: o.basis || 'none', data_stale: !!o.stale,
    };
    if (o.placement) p.placement = o.placement;
    return p;
  }

  // -------------------------------------------------------- handoff in (HDB → here)
  const HANDOFF_KEY = 'kpt.handoff';
  function validHandoff(h) {
    return !!(h && h.v === 1 && h.budget && h.budget.low > 0 && h.budget.high >= h.budget.low);
  }
  function readHandoff(storage) {
    try { const h = JSON.parse(storage.getItem(HANDOFF_KEY)); return validHandoff(h) ? h : null; } catch (e) { return null; }
  }
  function writeHandoff(storage, h) { try { storage.setItem(HANDOFF_KEY, JSON.stringify(h)); } catch (e) { /* storage unavailable: page falls back to asking for a budget */ } }
  // Audit A3-07: a short fingerprint of the earlier steps' figures a planner budget was worked out from (Sale proceeds and the
  // shared ages and incomes in this tab's gw.fin.v1). A budget whose stamp no longer matches is out of date. Nothing leaves the
  // tab; only the fingerprint is kept with the handoff. The same function is in gw-nav.js (a test keeps them equal).
  const FIN_KEYS = ['homeType', 'sellPrice', 'outstandingLoan', 'cpfPrincipal', 'cpfInterest', 'borrowers.0.age', 'borrowers.0.fixed', 'borrowers.1.age', 'borrowers.1.fixed', 'borrowers.0.variable', 'borrowers.0.rental', 'borrowers.1.variable', 'borrowers.1.rental'];
  function finStamp(storage) {
    let s = {}; try { s = JSON.parse(storage.getItem('gw.fin.v1') || '{}') || {}; } catch (e) { s = {}; }
    const val = (v) => { if (v === undefined || v === null || v === '') return ''; const n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return /^[\d,.\s$]+$/.test(String(v)) && isFinite(n) ? String(n) : String(v); };
    const str = FIN_KEYS.map((k) => k + '=' + val(s[k])).join('|');
    let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // ---------------------------------------------------------------- diagnostics
  /** Everything Ken should look at in one list: dropped rows, stale data, review-due, held, cross-check, coverage gaps. */
  function diagnose(opts) {
    const s = Object.assign({}, DEFAULT_SETTINGS, opts.settings || {});
    const today = opts.today || new Date(), issues = (opts.issues || []).slice();
    const bandsAll = opts.bands || [], list = opts.shortlist || [];
    bandsAll.forEach((b) => {
      const f = freshness(b.asOf, today, s);
      const id = b.region + ' ' + b.status + (b.ageBand && b.ageBand !== '–' ? ' ' + b.ageBand : '') + ' · ' + b.bedroom + '-bed';
      if (f === 'stale') issues.push({ level: 'warn', where: 'Market Evidence', msg: id + ' is stale (as of ' + monthYear(b.asOf) + '): shown to visitors as Indicative.' });
      if (f === 'expired') issues.push({ level: 'error', where: 'Market Evidence', msg: id + ' is expired: no verdict is shown for it.' });
    });
    list.forEach((e) => {
      if (/^retired$/i.test(e.state)) return;
      if (e.indicativeLow !== null && e.budgetMax !== null && e.indicativeLow > e.budgetMax * (1 + s.hold_tolerance_pct / 100))
        issues.push({ level: 'error', where: 'Shortlist', msg: e.entryId + ' is HELD: its indicative price (' + money(e.indicativeLow) + ') is more than ' + s.hold_tolerance_pct + '% above the top of your budget window (' + money(e.budgetMax) + '). Hidden from visitors until you update or retire it.' });
      if (/^review due$/i.test(e.state) || (e.reviewBy && e.reviewBy < today))
        issues.push({ level: 'warn', where: 'Shortlist', msg: e.entryId + ' is due for review' + (e.reviewBy ? ' (review_by ' + e.reviewBy.toISOString().slice(0, 10) + ')' : '') + '. Still shown to visitors.' });
      const band = bandsAll.find((b) => b.region === e.region && b.status === e.status && b.ageBand === e.ageBand && b.bedroom === e.bedroom);
      if (!band) issues.push({ level: 'warn', where: 'Shortlist', msg: e.entryId + ': no market band for ' + e.region + ' ' + e.status + (e.ageBand ? ' ' + e.ageBand : '') + ' ' + e.bedroom + '-bed, so its price cannot be cross-checked.' });
      else if (e.indicativeLow !== null && e.indicativeHigh !== null && (e.indicativeLow < band.p25 * 0.6 || e.indicativeHigh > band.p75 * 1.4))
        issues.push({ level: 'warn', where: 'Shortlist', msg: e.entryId + ': indicative ' + money(e.indicativeLow) + '–' + money(e.indicativeHigh) + ' is far outside that segment\'s typical range (' + money(band.p25) + '–' + money(band.p75) + '). Check one of them.' });
    });
    const coverage = [];
    [2, 3, 4].forEach((bed) => {
      for (let lo = 800000; lo < 3000000; lo += 200000) {
        const bud = { low: lo + 100000, high: lo + 100000 };
        coverage.push({ bedroom: bed, band: money(lo) + '–' + money(lo + 200000), count: shortlistSelect({ shortlist: list, settings: s, budget: bud, bedroom: bed, today }).shown.length });
      }
    });
    const rank = { error: 0, warn: 1, info: 2 };
    issues.sort((a, b) => rank[a.level] - rank[b.level]);
    return { issues, coverage, counts: { bands: bandsAll.length, shortlist: list.length, errors: issues.filter((x) => x.level === 'error').length, warnings: issues.filter((x) => x.level === 'warn').length } };
  }

  // ---------------------------------------------------------------- data loading
  function withTimeout(fetchFn, url, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      fetchFn(url).then((r) => { clearTimeout(t); if (!r.ok) reject(new Error('http ' + r.status)); else resolve(r.text()); }, (e) => { clearTimeout(t); reject(e); });
    });
  }
  function build(texts, basis, attempts) {
    const issues = [];
    return {
      bands: normaliseBands(parseCSV(texts.bands), issues), shortlist: normaliseShortlist(parseCSV(texts.shortlist), issues),
      settings: normaliseSettings(parseCSV(texts.settings || '')), basis, issues, attempts: attempts || [],
    };
  }
  /** mode 'test': bundled illustrative files only. mode 'production': published Sheet, else bundled snapshot. */
  async function load(cfg, fetchFn, scenario) {
    const attempts = [];
    const get = (u) => withTimeout(fetchFn, u, 4500).then(
      (t) => { attempts.push({ url: u, ok: true, bytes: t.length }); return t; },
      (e) => { attempts.push({ url: u, ok: false, error: String(e && e.message || e) }); throw e; });
    if (cfg.mode === 'test') {
      const base = cfg.testBase + (scenario && /^[a-z-]+$/.test(scenario) ? scenario : 'default') + '/';
      const [b, s, st] = await Promise.all([get(base + 'bands.csv'), get(base + 'shortlist.csv'), get(base + 'settings.csv')]);
      return build({ bands: b, shortlist: s, settings: st }, 'test', attempts);
    }
    const u = cfg.sheet || {};
    if (u.bands && u.shortlist) {
      try {
        const [b, s, st] = await Promise.all([get(u.bands), get(u.shortlist), u.settings ? get(u.settings).catch(() => '') : Promise.resolve('')]);
        const d = build({ bands: b, shortlist: s, settings: st }, 'sheet', attempts);
        if (d.bands.length) return d;
      } catch (e) { /* fall through to the bundled snapshot */ }
    }
    try {
      const [b, s, st] = await Promise.all([get(cfg.snapshotBase + 'bands.csv'), get(cfg.snapshotBase + 'shortlist.csv'), get(cfg.snapshotBase + 'settings.csv').catch(() => '')]);
      return build({ bands: b, shortlist: s, settings: st }, 'snapshot', attempts);
    } catch (e) { return { bands: [], shortlist: [], settings: Object.assign({}, DEFAULT_SETTINGS), basis: 'none', issues: [], attempts }; }
  }

  return {
    DEFAULT_SETTINGS, parseCSV, normaliseBands, normaliseShortlist, normaliseSettings,
    freshness, verdict, bands, headline, tradeoffs, shortlistSelect, compareHandoff, diagnose,
    finStamp,
    budgetBand, analyticsPayload, ANALYTICS_KEYS, readHandoff, writeHandoff, validHandoff, HANDOFF_KEY,
    load, money, budgetText, sqftText, monthYear, segmentLabel,
  };
});
