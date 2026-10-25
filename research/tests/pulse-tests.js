#!/usr/bin/env node
/* Market pulse tests (V1). Run: node research/tests/pulse-tests.js
   1. The rules on hand-built records: strong / limited / stable boundaries, thin data, no data, first resales, stale latest sale, new sales, sub-sales,
      and a change in the mix of sizes that must NOT read as a price change.
   2. Every development in the published data (all classes): the pulse is recomputed independently from the raw cells and compared, then agreed with
      Research's own engine (sale type, size band, counts, the chart's last two points) and with data/map/pulse.json (rebuilt and compared).
   3. Wording: only counts, medians and months; never a valuation, forecast, appreciation, bargain or liquidity claim; developer prices never given a direction.
   4. WhatsApp message and analytics allow-list: names and findings only, never anything typed, a size, a price or a budget.
   5. Entry points and wiring (Home, Sell, Map, Research landing) and that nothing calls an AI service. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..');
const G = require(path.join(ROOT, 'assets/js/gw-pulse.js')), R = require(path.join(ROOT, 'assets/js/kpt-research.js')), BP = require(path.join(ROOT, 'tools/market-data/build-pulse.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const srt = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((o, k) => (o[k] = srt(v[k]), o), {}) : v;
const eq = (a, b, m) => ok(JSON.stringify(srt(a)) === JSON.stringify(srt(b)), m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------- 1. hand-built records ---------- */
// manifest: 61 months from 2021-09 to 2026-09, periods most recent first (index 5 = the partial earlier one)
const M = { latestMonth: '2026-09', monthStart: '2021-09', months: 61, bin: 100, fields: { cell: ['sale', 'bin', 'win', 'n', 'act', 'top', 'last', 'min', 'q1', 'med', 'q3', 'max'] },
  periods: [{ from: '2025-10', to: '2026-09' }, { from: '2024-10', to: '2025-09' }, { from: '2023-10', to: '2024-09' }, { from: '2022-10', to: '2023-09' }, { from: '2021-10', to: '2022-09' }, { from: '2021-09', to: '2021-09' }] };
// a realistic spread: the middle half of prices within 2% of the median (the real data's median middle half is 4% wide); `wide` gives a 10% middle half
const cell = (sale, bin, win, n, act, last, med, wide) => { const h = wide ? .05 : .02; return [sale, bin, win, n, act, 3, last, Math.round(med * (1 - 2 * h)), Math.round(med * (1 - h)), med, Math.round(med * (1 + h)), Math.round(med * (1 + 2 * h))]; };
// monthly: flat [monthIndex, count, ...]; month index 60 = 2026-09
const monthlyFor = (cur, prev, lastIdx) => { const a = []; const put = (from, to, total) => { const k = to - from + 1; for (let i = 0; i < k; i++) { const c = Math.floor(total / k) + (i < total % k ? 1 : 0); if (c) a.push(from + i, c); } }; put(37, 48, prev); put(49, lastIdx, cur); return a; };
function proj(o) {
  const sale = o.sale || 'resale', code = { new: 1, sub: 2, resale: 3 }[sale];
  const cells = [];
  (o.bands || []).forEach((b) => b.periods.forEach((pp, w) => { if (pp) cells.push(cell(code, b.bin, w, pp.n, pp.act == null ? Math.min(pp.n, 6) : pp.act, pp.last || 202609, pp.med, pp.wide)); }));
  const p = { id: 'x', name: 'X', sale: { new: 0, sub: 0, resale: 0 }, periodCells: cells, monthly: {} };
  p.sale[sale] = o.total != null ? o.total : (o.cur || 0) + (o.prev || 0);
  p.monthly[sale] = monthlyFor(o.cur || 0, o.prev || 0, o.lastIdx == null ? 60 : o.lastIdx);
  return p;
}
const band = (bin, A, B) => ({ bin, periods: [A, B] });
const mid = { n: 20, med: 2000 };
// strong: higher / lower / stable and the 3% boundary
let r = G.compute(proj({ cur: 40, prev: 30, bands: [band(700, { n: 20, med: 2100 }, { n: 15, med: 2000 })] }), M, { bin: 700 });
eq([r.state, r.evidence, r.dir, r.pct], ['trend', 'strong', 'higher', 5], 'strong higher (+5%)'); ok(r.head === 'Resale prices for this size are higher than a year earlier' && /5% above/.test(r.sub) && /700–799 sq ft resales/.test(r.sub), 'strong higher wording names resales and the size: ' + r.head + ' / ' + r.sub);
ok(r.figs[1].label === 'All resales, last 12 months', 'the volume figure says it counts all sizes, beside a one-size price');
r = G.compute(proj({ cur: 40, prev: 30, bands: [band(700, { n: 20, med: 1900 }, { n: 15, med: 2000 })] }), M, { bin: 700 });
eq([r.evidence, r.dir, r.pct], ['strong', 'lower', -5], 'strong lower (-5%)'); ok(/lower than a year earlier/.test(r.head) && /5% below/.test(r.sub), 'strong lower wording');
r = G.compute(proj({ cur: 40, prev: 30, bands: [band(700, { n: 20, med: 2057 }, { n: 15, med: 2000 })] }), M, { bin: 700 });
eq([r.dir, r.pct], ['stable', 2.9], 'under 3% is broadly the same'); ok(/broadly the same as a year earlier/.test(r.head), 'stable wording');
r = G.compute(proj({ cur: 40, prev: 30, bands: [band(700, { n: 20, med: 2060 }, { n: 15, med: 2000 })] }), M, { bin: 700 });
eq(r.dir, 'higher', 'exactly 3% is higher');
// the noise allowance: the same 3.5% move is a direction when prices are tightly clustered, and "broadly the same" when the spread of prices paid is wide and the sales few
r = G.compute(proj({ cur: 40, prev: 30, bands: [band(700, { n: 10, med: 2070 }, { n: 9, med: 2000 })] }), M, { bin: 700 });
ok(r.dir === 'higher' && !r.withinNoise, 'a 3.5% move on 10 and 9 tightly clustered sales is called higher');
r = G.compute(proj({ cur: 40, prev: 30, bands: [band(700, { n: 10, med: 2070, wide: true }, { n: 9, med: 2000, wide: true })] }), M, { bin: 700 });
ok(r.dir === 'stable' && r.withinNoise && r.evidence === 'strong' && /broadly the same/.test(r.head) && /3.5% above the 12 months before, a difference within the spread of what those homes fetched/.test(r.sub), 'the same move on a wide spread of prices is broadly the same, and says why: ' + r.sub);
r = G.compute(proj({ cur: 80, prev: 80, bands: [band(700, { n: 40, med: 2070, wide: true }, { n: 40, med: 2000, wide: true })] }), M, { bin: 700 });
ok(r.dir === 'higher', 'with 40 and 40 sales the same wide spread no longer hides a 3.5% move');
r = G.compute(proj({ cur: 40, prev: 30, bands: [band(700, { n: 10, med: 2160, wide: true }, { n: 9, med: 2000, wide: true })] }), M, { bin: 700 });
ok(r.dir === 'higher', 'an 8% move clears a wide spread even on 10 and 9 sales');
r = G.compute(proj({ cur: 9, prev: 6, bands: [band(700, { n: 5, med: 2070, wide: true }, { n: 4, med: 2000, wide: true })] }), M, { bin: 700 });
ok(r.evidence === 'limited' && r.dir === 'higher' && !r.withinNoise, 'a first look is not noise-gated (it already says it is unreliable)');
{ const q = G.compute(proj({ cur: 40, prev: 30, bands: [band(700, { n: 20, med: 2059 }, { n: 15, med: 2000 })] }), M, { bin: 700 }); ok(q.dir === 'higher' && q.figs[0].value === '+3%' && q.pct === 3, '2.95% shows as +3% and so reads higher: the words never contradict the figure'); }
 r = G.compute(proj({ cur: 40, prev: 30, bands: [band(700, { n: 20, med: 2000 }, { n: 15, med: 2000 })] }), M, { bin: 700 });
ok(r.dir === 'stable' && r.pct === 0 && /level with/.test(r.sub), 'zero change reads level with');
// limited: 3..7 sales, or fewer than 4 active months
r = G.compute(proj({ cur: 9, prev: 6, bands: [band(700, { n: 5, med: 2100 }, { n: 4, med: 2000 })] }), M, { bin: 700 });
eq([r.state, r.evidence, r.limited], ['trend', 'limited', true], 'five and four sales is a first look'); ok(/^A first look/.test(r.head) && /not a reliable measure of price growth/.test(r.sub), 'limited wording says it is not reliable');
r = G.compute(proj({ cur: 30, prev: 30, bands: [band(700, { n: 12, act: 3, med: 2100 }, { n: 12, act: 6, med: 2000 })] }), M, { bin: 700 });
eq(r.evidence, 'limited', 'enough sales but under four active months is only a first look');
r = G.compute(proj({ cur: 30, prev: 30, bands: [band(700, { n: 8, act: 4, med: 2100 }, { n: 8, act: 4, med: 2000 })] }), M, { bin: 700 });
eq(r.evidence, 'strong', 'exactly 8 sales over 4 months in each period is strong');
r = G.compute(proj({ cur: 30, prev: 30, bands: [band(700, { n: 7, act: 4, med: 2100 }, { n: 8, act: 4, med: 2000 })] }), M, { bin: 700 });
eq(r.evidence, 'limited', '7 sales is not strong');
r = G.compute(proj({ cur: 30, prev: 30, bands: [band(700, { n: 12, act: 5, last: 202603, med: 2100 }, { n: 12, act: 5, med: 2000 })] }), M, { bin: 700 });
eq(r.evidence, 'strong', 'latest band sale 6 months back is still strong');
r = G.compute(proj({ cur: 30, prev: 30, bands: [band(700, { n: 12, act: 5, last: 202602, med: 2100 }, { n: 12, act: 5, med: 2000 })] }), M, { bin: 700 });
eq(r.evidence, 'limited', 'latest band sale 7 months back is only a first look');
// too thin to compare: counts only, no direction
r = G.compute(proj({ cur: 6, prev: 5, bands: [band(700, { n: 2, med: 2100 }, { n: 5, med: 2000 })] }), M, { bin: 700 });
ok(r.state === 'activity' && r.dir === null && r.pct === null && /Too few/.test(r.sub), 'two sales in one period: counts only');
// first resales: no earlier year
r = G.compute(proj({ cur: 14, prev: 0, bands: [band(700, { n: 9, med: 2100 }, null)] }), M, { bin: 700 });
ok(r.state === 'activity' && /first resale on record was in/.test(r.sub) && /no earlier 12 months/.test(r.sub), 'a new launch with resales only this year: no earlier period: ' + r.sub);
// nothing in the last 12 months
r = G.compute(proj({ cur: 0, prev: 3, total: 5, lastIdx: 44, bands: [band(700, null, { n: 3, med: 2000 })] }), M, { bin: 700 });
ok(r.state === 'stale' && /No resales in the last 12 months/.test(r.head) && /cannot be read/.test(r.sub) && r.dir === null, 'stale: ' + r.head);
eq(r.figs.map((f) => f.id), ['latest', 'record'], 'stale shows the latest sale and what is on record, not a zero');
// developer sales and sub-sales are never given a direction
r = G.compute(proj({ sale: 'new', cur: 300, prev: 500, bands: [band(1000, { n: 80, med: 2400 }, { n: 90, med: 2200 })] }), M, { bin: 1000 });
ok(r.state === 'activity' && r.dir === null && r.pct === null && /not shown for new sales/.test(r.sub) && !r.figs.some((f) => f.id === 'change'), 'new sales: counts only, no direction, no change figure');
r = G.compute(proj({ sale: 'sub', cur: 40, prev: 30, bands: [band(1000, { n: 20, med: 2400 }, { n: 20, med: 2000 })] }), M, { bin: 1000 });
ok(r.state === 'activity' && r.dir === null && /sub-sale/i.test(r.sub), 'sub-sales: no direction');
// MISLEADING COMPARISON: the mix of sizes changes, the price of each size does not. The pulse compares one size band, so it must read stable
{
  const p = proj({ cur: 40, prev: 40, bands: [band(500, { n: 4, med: 1800 }, { n: 20, med: 1800 }), band(900, { n: 36, med: 2300 }, { n: 20, med: 2300 })] });
  const a = G.compute(p, M, { bin: 500 }), b = G.compute(p, M, { bin: 900 });
  ok(a.dir !== 'higher' && b.dir === 'stable' && b.pct === 0, 'size-mix shift does not read as a price rise (900s band flat)');
  // an all-sizes median would have risen (blended ~ (4*1800+36*2300)/40 = 2250 vs 2050), the pulse never uses it
  ok(!/2250|2,250|2050|2,050/.test(JSON.stringify(b)), 'no blended all-size figure appears');
}
// one development, two bands, different answers: the band on show decides
{
  const p = proj({ cur: 60, prev: 60, bands: [band(700, { n: 30, med: 2200 }, { n: 30, med: 2000 }), band(900, { n: 30, med: 2000 }, { n: 30, med: 2200 })] });
  eq([G.compute(p, M, { bin: 700 }).dir, G.compute(p, M, { bin: 900 }).dir], ['higher', 'lower'], 'the size band on show decides the reading');
}
// default band: the one with the most recent sales
{
  const p = proj({ cur: 60, prev: 60, bands: [band(700, { n: 10, med: 2200 }, { n: 10, med: 2000 }), band(900, { n: 30, med: 2000 }, { n: 30, med: 2100 })] });
  eq(G.compute(p, M, {}).band.bin, 900, 'default band = most recent sales');
}
// no transactions at all
r = G.compute({ id: 'z', sale: { new: 0, sub: 0, resale: 0 }, periodCells: [], monthly: {} }, M, {});
ok(r.state === 'nosales' && G.html(r) === '' && G.compact(r) === null && G.snapshot(null) === null, 'no transactions: nothing is shown');
// figures agree with the record
r = G.compute(proj({ cur: 40, prev: 30, bands: [band(700, { n: 20, med: 2100 }, { n: 15, med: 2000 })] }), M, { bin: 700 });
eq([r.n12, r.nPrev, r.a.n, r.b.n, r.a.med, r.b.med], [40, 30, 20, 15, 2100, 2000], 'counts and medians come straight from the record');
eq(r.figs.map((f) => f.value), ['+5%', '40', 'Sep 2026'], 'figures: change, sales, latest sale');
ok(/\$2,000 → \$2,100/.test(r.figs[0].sub) && /30 the year before/.test(r.figs[1].sub), 'figure sub-lines carry both periods');
// thin volume is called limited
r = G.compute(proj({ cur: 9, prev: 4, bands: [band(700, { n: 9, med: 2100 }, { n: 4, med: 2000 })] }), M, { bin: 700 });
ok(r.figs.some((f) => /limited volume/.test(f.sub)), 'fewer than 10 sales in the project is called limited volume');

/* ---------- 3. wording over every state ---------- */
const BAD = /apprecia|valuation|worth|forecast|predict|cheap|bargain|undervalu|overpric|liquid|illiquid|invest|should buy|good time|hot market|boom|crash|guarantee/i;
const sample = [];
[[40, 30, 20, 15, 2100, 2000], [40, 30, 20, 15, 1900, 2000], [40, 30, 20, 15, 2000, 2000], [9, 6, 5, 4, 2100, 2000], [6, 5, 2, 5, 2100, 2000]].forEach((a) => sample.push(G.compute(proj({ cur: a[0], prev: a[1], bands: [band(700, { n: a[2], med: a[4] }, { n: a[3], med: a[5] })] }), M, { bin: 700 })));
sample.push(G.compute(proj({ sale: 'new', cur: 300, prev: 500, bands: [band(1000, mid, mid)] }), M, { bin: 1000 }), G.compute(proj({ cur: 0, prev: 3, total: 5, lastIdx: 44, bands: [] }), M, {}));
sample.forEach((x, i) => { const t = [x.head, x.sub].concat(x.figs.map((f) => f.label + ' ' + f.value + ' ' + f.sub)).join(' | '); ok(!BAD.test(t), 'no valuation or advice wording in sample ' + i + ': ' + t); ok(x.head.length <= 80, 'headline stays short in sample ' + i + ' (' + x.head.length + ')'); });
ok(/data-mp-next="sell">What could my unit sell for\?/.test(G.html(sample[0], { forWho: 'sell' })) && /data-mp-next="buy">Is an asking price reasonable\?/.test(G.html(sample[0], { forWho: 'buy' })) && !/wa\.me/.test(G.html(sample[0], { forWho: 'sell' })), 'the link carries the visitor\'s question and goes to the cards, never straight to WhatsApp');
sample.forEach((x, i) => { const h = G.html(x); ok(/data-mp /.test(h) && /Market pulse/.test(h) && /Not a valuation or a forecast/.test(h), 'block carries its limit beside the figures, sample ' + i); ok(/How this was worked out/.test(h), 'method is a disclosure, sample ' + i);
  ok(/data-lg-scroll="next" data-mp-next="">What this means for buying or selling here/.test(h), 'one next-step link to the cards, sample ' + i); ok(!/<table[^>]*>\s*<thead>\s*<tr>\s*<\/tr>/.test(h), 'no empty table'); });

/* ---------- 2. every development in the published data ---------- */
const DP = path.join(ROOT, 'data/projects'), man = JSON.parse(read('data/projects/manifest.json')), projects = {};
fs.readdirSync(path.join(DP, 'detail')).filter((f) => /\.json$/.test(f)).forEach((f) => Object.assign(projects, JSON.parse(fs.readFileSync(path.join(DP, 'detail', f), 'utf8')).projects));
const ids = Object.keys(projects).sort(), F = {}; man.fields.cell.forEach((k, i) => { F[k] = i; });
const SALE = { new: 1, sub: 2, resale: 3 };
const tally = { states: {}, byClass: {}, mismatches: 0, noise: 0 };
const lastIdx = (man.latestMonth.split('-')[0] * 12 + +man.latestMonth.split('-')[1] - 1), baseIdx = +man.monthStart.split('-')[0] * 12 + +man.monthStart.split('-')[1] - 1;
let checked = 0, trendN = 0;
ids.forEach((id) => {
  const p = projects[id], A = R.analyseProject(p, man, {});
  const sale = A.sale.selected, bin = A.focus && A.focus.bin != null ? A.focus.bin : undefined;
  let x; try { x = G.compute(p, man, { sale, bin }); } catch (e) { ok(false, id + ' threw ' + e.message); return; }
  checked++;
  // independent counts from the monthly series
  const arr = (p.monthly && p.monthly[sale]) || []; let n12 = 0, nPrev = 0, lastM = -1;
  for (let i = 0; i + 1 < arr.length; i += 2) { const m = baseIdx + arr[i]; if (m > lastIdx - 12) n12 += arr[i + 1]; else if (m > lastIdx - 24) nPrev += arr[i + 1]; lastM = Math.max(lastM, m); }
  if (x.n12 !== n12 || x.nPrev !== nPrev) { tally.mismatches++; ok(false, id + ' counts ' + x.n12 + '/' + x.nPrev + ' vs ' + n12 + '/' + nPrev); }
  // Research's own engine agrees on the sale type, the band and the 12-month count
  if (x.sale !== sale) ok(false, id + ' sale type differs from Research');
  if (A.recent && A.recent.n !== x.n12) ok(false, id + ' 12-month count differs from Research (' + A.recent.n + ' vs ' + x.n12 + ')');
  if (bin !== undefined && x.band && x.band.bin !== bin) ok(false, id + ' size band differs from Research');
  // independent reading of the two periods in the band
  const cl = (win) => (p.periodCells || []).find((c) => c[F.sale] === SALE[sale] && c[F.bin] === (x.band && x.band.bin) && c[F.win] === win);
  const a = cl(0), b = cl(1);
  let want = 'activity';
  if (n12 === 0) want = 'stale';
  else if (sale === 'resale' && a && b) {
    const sinceA = lastIdx - (Math.floor(a[F.last] / 100) * 12 + (a[F.last] % 100) - 1);
    const strong = a[F.n] >= 8 && a[F.act] >= 4 && b[F.n] >= 8 && b[F.act] >= 4 && sinceA <= 6, lim = a[F.n] >= 3 && b[F.n] >= 3 && a[F.act] >= 2 && b[F.act] >= 2;
    if (strong || lim) { want = 'trend'; const pct = Math.round((a[F.med] - b[F.med]) / b[F.med] * 1000) / 10; const sdv = (c) => (c[F.q3] - c[F.q1]) / 1.349, seP = strong ? Math.sqrt(Math.pow(1.2533 * sdv(a) / Math.sqrt(a[F.n]), 2) + Math.pow(1.2533 * sdv(b) / Math.sqrt(b[F.n]), 2)) / b[F.med] * 100 : 0; const dir = Math.abs(pct) < 3 || (strong && Math.abs(pct) < 1.645 * seP) ? 'stable' : pct > 0 ? 'higher' : 'lower'; if (x.dir !== dir) ok(false, id + ' direction ' + x.dir + ' vs ' + dir); if (x.evidence !== (strong ? 'strong' : 'limited')) ok(false, id + ' evidence ' + x.evidence); if (Math.abs(x.pct - pct) > 1e-9) ok(false, id + ' pct ' + x.pct + ' vs ' + pct); }
  }
  if (x.state !== want) ok(false, id + ' state ' + x.state + ' vs ' + want);
  if (x.state === 'trend') trendN++;
  if (x.withinNoise) { tally.noise++; if (!/within the spread/.test(x.sub)) ok(false, id + ' is noise-gated but does not say so'); }
  // the chart on the Research page ends with the same two medians the reading used
  if (x.state === 'trend' && A.history && A.history.band && A.history.band.points.length >= 2) { const pts = A.history.band.points, l = pts[pts.length - 1], q = pts[pts.length - 2]; if (l.med !== x.a.med || q.med !== x.b.med || l.n !== x.a.n || q.n !== x.b.n) ok(false, id + ' differs from the trend chart'); }
  // no direction for developer sales or sub-sales, and never without both periods
  if (sale !== 'resale' && x.dir !== null) ok(false, id + ' gave a direction to ' + sale + ' sales');
  if (x.state !== 'trend' && (x.dir !== null || x.pct !== null)) ok(false, id + ' has a direction without a reading');
  if (!x.head || !x.sub || !x.figs.length) ok(false, id + ' has empty text');
  if (BAD.test([x.head, x.sub].concat(x.figs.map((f) => f.sub + f.label)).join(' '))) ok(false, id + ' banned wording');
  const k = x.state + '/' + x.evidence; tally.states[k] = (tally.states[k] || 0) + 1;
  tally.byClass[A.cls] = (tally.byClass[A.cls] || 0) + 1;
});
ok(checked === ids.length && ids.length > 2400, 'all ' + ids.length + ' developments checked');
ok(tally.mismatches === 0, 'every count equals the independent monthly sum');
ok(trendN > 100, 'enough developments carry a price reading to exercise the rule (' + trendN + ')');
ok(tally.noise > 0 && tally.noise < 20, 'the noise allowance changes only a handful of borderline readings (' + tally.noise + ')');
['condo', 'ec', 'cluster'].forEach((c) => ok(tally.byClass[c] > 0, 'class ' + c + ' is covered'));
console.log('  states: ' + JSON.stringify(tally.states) + ' · classes ' + JSON.stringify(tally.byClass));

/* ---------- the Map's file is the same module over the same records ---------- */
const doc = JSON.parse(read('data/map/pulse.json')), rebuilt = BP.build(man, projects);
eq([doc.kind, doc.rule, doc.latestMonth], ['gw-pulse', G.VERSION, man.latestMonth], 'pulse.json names its rule and data month');
ok(JSON.stringify(doc.rows) === JSON.stringify(rebuilt.rows), 'data/map/pulse.json equals a fresh build from the same records (rebuild it with build-pulse.js after a refresh)');
eq(doc.count, Object.keys(doc.rows).length, 'pulse.json count matches its rows');
eq(Object.keys(doc.rows).length, ids.length, 'one record per development');
let lineBad = 0;
ids.forEach((id) => { const p = projects[id], A = R.analyseProject(p, man, {}), x = G.compute(p, man, { sale: A.sale.selected, bin: A.focus && A.focus.bin != null ? A.focus.bin : undefined }), sn = G.snapshot(doc.rows[id]);
  const dirOf = { h: 'higher', l: 'lower', s: 'stable' }[doc.rows[id].d] || null;
  if (!sn || dirOf !== x.dir || doc.rows[id].a !== x.n12 || doc.rows[id].b !== x.nPrev || (x.dir && doc.rows[id].c !== x.pct)) lineBad++;
  else if (x.dir && doc.rows[id].e === 's' && !new RegExp({ higher: 'higher than', lower: 'lower than', stable: 'broadly the same as' }[x.dir]).test(sn.text)) lineBad++;
  else if (x.state === 'trend' && x.evidence === 'limited' && !/^A first look/.test(sn.text)) lineBad++;
  else if (x.state !== 'trend' && x.n12 > 0 && /higher|lower|same/.test(sn.text)) lineBad++; });
ok(lineBad === 0, 'the Map line says what the Research report says for every development (' + lineBad + ' differ)');
const gz = JSON.stringify(doc).length; ok(gz < 260000, 'pulse.json stays small (' + gz + ' bytes)');
// the Map line, in words
eq(G.snapshot({ s: 'resale', e: 's', d: 'h', c: 4, z: 900, a: 34, b: 20, l: '2026-09' }).text, 'Resale prices for 900–999 sq ft are higher than a year earlier', 'snapshot, strong higher, names the size band');
ok(/^A first look \(few sales\): 700–799 sq ft resale prices appear lower than a year earlier$/.test(G.snapshot({ s: 'resale', e: 'l', d: 'l', c: -5, z: 700, a: 9, b: 6, l: '2026-09' }).text), 'snapshot, limited');
ok(Object.keys(doc.rows).every((id) => { const t = G.snapshot(doc.rows[id]).text; return t.length <= 100; }), 'every Map line stays short (100 characters at most)');
eq(G.snapshot({ s: 'new', a: 73, b: 1095, l: '2026-09' }).text, '73 new sales in 12 months (1,095 the year before)', 'snapshot, developer sales: counts only');
eq(G.snapshot({ s: 'resale', a: 0, b: 2, l: '2025-06' }).text, 'No resales in the last 12 months', 'snapshot, nothing recent');
eq(G.snapshot({ s: 'resale', a: 1, b: 0, l: '2026-08' }).text, '1 resale in 12 months', 'snapshot, one sale (singular)');

/* ---------- 4. WhatsApp and analytics ---------- */
const url = 'https://tools.kentanthepropertyguy.com/research/#/p/parc-clematis';
const hi = G.compute(proj({ cur: 40, prev: 30, bands: [band(700, { n: 20, med: 2100 }, { n: 15, med: 2000 })] }), M, { bin: 700 });
const sell = G.waMessage(hi, 'Parc Clematis', url, 'sell'), buy = G.waMessage(hi, 'Parc Clematis', url, 'buy');
ok(/own a home at Parc Clematis/.test(sell) && /could sell for/.test(sell) && /\(Ref KPT-PULSE-SELL\)$/.test(sell) && sell.indexOf(url) > -1, 'owner message: development, question, report link, own reference: ' + sell);
ok(/considering a property at Parc Clematis/.test(buy) && /asking price/.test(buy) && /\(Ref KPT-PULSE-BUY\)$/.test(buy) && buy.indexOf(url) > -1, 'buyer message: development, question, report link, own reference');
ok(/resale prices for 700–799 sq ft higher than a year earlier/.test(sell) && /resale prices for 700–799 sq ft higher than a year earlier/.test(buy), 'both messages carry the report finding and its size band');
ok(/floor, facing, size and condition/.test(sell) && /asking price of a unit there/.test(buy), 'the owner is asked about the unit, the buyer about an asking price');
ok(!/budget|income|cpf|loan|salary|\$\d|[0-9]{4,}/i.test(sell.replace(url, '') + buy.replace(url, '')), 'no money, income, CPF or loan words and no figures in either message');
ok(sell.length < 420 && buy.length < 420, 'messages stay short');
ok(/a first look, on few sales, with resale prices for 700–799 sq ft/.test(G.waMessage(G.compute(proj({ cur: 9, prev: 6, bands: [band(700, { n: 5, med: 2100 }, { n: 4, med: 2000 })] }), M, { bin: 700 }), 'X', url, 'buy')), 'a limited reading is described as a first look, not a finding');
ok(/no resales in the last 12 months/.test(G.waMessage(G.compute(proj({ cur: 0, prev: 3, total: 5, lastIdx: 44, bands: [] }), M, {}), 'X', url, 'sell')), 'a stale development is described as having no recent resales');
// analytics allow-list
['research_pulse_viewed', 'research_pulse_shared'].forEach((e) => ok(R.ANALYTICS_EVENTS.indexOf(e) > -1, e + ' is allow-listed'));
{
  const a = R.analytics('research_pulse_viewed', Object.assign({ project_id: 'parc-clematis', intent: 'sell' }, G.trackParams(hi), { typed: 'my unit at #12-04', size: '750', price: 1600000, budget: 2000000, name: 'Parc Clematis' }));
  eq(a, { project_id: 'parc-clematis', trend: 'higher', evidence: 'strong', sale_type: 'resale', intent: 'sell' }, 'pulse event carries only ids and words');
  ok(!('typed' in a) && !('size' in a) && !('price' in a) && !('budget' in a) && !('name' in a), 'typed text, sizes, prices and names are dropped');
  eq(R.analytics('research_pulse_viewed', { trend: 'booming', evidence: 'x', intent: 'agent' }), {}, 'unknown values are dropped');
  eq(R.analytics('research_pulse_shared', { project_id: 'parc-clematis', trend: 'higher' }), { project_id: 'parc-clematis', trend: 'higher' }, 'share event');
  eq(R.analytics('research_pulse_viewed', { project_id: 'Parc Clematis!' }), {}, 'a project id must be a slug');
}
ok(G.trackParams(null) && Object.keys(G.trackParams(null)).length === 0, 'no pulse, no parameters');

/* ---------- 5. entry points, wiring, and no AI ---------- */
const src = read('assets/js/gw-pulse.js');
ok(!/fetch\(|XMLHttpRequest|openai|anthropic|\bllm\b|api\.|WebSocket/i.test(src), 'the module makes no network call and names no AI service');
ok(!/Math\.random|Date\.now|new Date/.test(src), 'the module is deterministic (no clock, no randomness)');
const rs = read('research/index.html');
ok(rs.indexOf('gw-pulse.js') > -1 && rs.indexOf('gw-pulse.js') < rs.indexOf('kpt-lg.js') && /gw-pulse\.css/.test(rs), 'Research loads the module before the page renderer, and its stylesheet');
ok(/GW_PULSE\.compute\(S\.rawP, S\.rawM/.test(rs) && /PU: S\.pu/.test(rs) && /forWho: forWho\(\)/.test(rs), 'Research passes the pulse and the visitor\'s question to the page');
ok(/kpt\.pulse\.for/.test(rs) && /research_pulse_viewed/.test(rs) && /research_pulse_shared/.test(rs), 'Research reads the question (tab only) and sends the two events');
ok(/GW_PULSE\.waMessage\(S\.pu( \|\| S\.bedWa)?, M\.name, reportUrl\(M\.id\), 'buy'\)/.test(rs) && /GW_PULSE\.waMessage\(S\.pu( \|\| S\.bedWa)?, M\.name, reportUrl\(M\.id\), 'sell'\)/.test(rs), 'both WhatsApp cards are built from the report (the chosen size\'s reading, or the chosen bedroom type\'s finding)');
ok(!/localStorage/.test(src + read('assets/js/gw-journey.js').match(/pulseFor[^\n]*/)), 'the question is kept for this tab only (sessionStorage), never localStorage');
const lg = read('assets/js/kpt-lg.js');
ok(/GLOBAL\.GW_PULSE\.html\(ctx\.PU, \{ forWho, mapHref/.test(lg) && /class="lg-kenstrips" id="next"/.test(lg), 'the page passes the question to the block and the cards carry the id the link scrolls to');
ok(/How is the market around your home\?/.test(lg), 'Research\'s first screen asks how the market is');
const home = read('index.html'); // 25 Oct 2026: the homepage's Research door is one card (its list of tool links was removed); Market Pulse is reached in every development's Research report
ok(/<a class="gw-door gw-door3" href="research\/"/.test(home) && !/data-mp[ >]/.test(home), 'Home: the Research door leads to Research (where Market Pulse lives), no new section');
ok(!/gw-pulse|data-mp/.test(home), 'Home gains no new block');
const jr = read('journey/index.html'); ok(/data-pulse-for="sell"[^>]*>See how the market is moving in your development/.test(jr), 'Sell: a way into the development\'s market report');
ok(/data-pulse-for="sell"/.test(read('assets/js/gw-journey.js')) && /pulseFor === 'sell' \|\| a\.dataset\.pulseFor === 'buy'/.test(read('assets/js/gw-journey.js')), 'the journey links set the owner\'s or the buyer\'s question');
ok(/data-pulse-for="buy">See them on the map/.test(jr), 'Buy: the research step carries the buyer\'s question');
ok(/f === 'go'\) \{ try \{ window\.sessionStorage\.setItem\('kpt\.pulse\.for', 'buy'\)/.test(read('assets/js/kpt-discover-ui.js')), 'Budget Search: opening a development\'s research sets the buyer\'s question');
const mp = read('research/map/index.html'); ok(/gw-pulse\.js/.test(mp) && mp.indexOf('gw-pulse.js') < mp.indexOf('kpt-map-app.js'), 'the Map loads the module before the app');
const ma = read('assets/js/kpt-map-app.js'); ok(/getJson\('pulse\.json'\)/.test(ma) && /pulseHtml\(name\)/.test(ma) && !/Full market report/.test(ma) && /data-m-full="\$\{esc\(p\.id\)\}">View Full Research/.test(ma), 'the Map panel shows the snapshot; its existing View Full Research (25 Oct 2026, was "Open full analysis") is the one way into the report (no second link)');
ok(read('tools/market-data/refresh-all.js').indexOf('build-pulse.js') > -1, 'a data refresh rebuilds the Map snapshot');
ok(/Market pulse/.test(read('CLAUDE.md')), 'CLAUDE.md records the rules');
// HDB: left out of V1 on purpose; the HDB research files are untouched by this release
ok(!/pulse/i.test(read('assets/js/gw-hdb.js')) && !/pulse/i.test(read('assets/js/gw-value.js')), 'HDB research is unchanged (no pulse for HDB in V1)');

console.log('pulse-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
