'use strict';
/* Research by bedroom type (V1): the page's words and choices (assets/js/gw-bedroom.js, gw-pulse.js bedroomText) and the published data
   against the Research figures it sits beside. Run from the site folder: node research/tests/bedroom-research-tests.js */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const B = require(path.join(ROOT, 'assets/js/gw-bedroom.js')), PU = require(path.join(ROOT, 'assets/js/gw-pulse.js')), P = require(path.join(ROOT, 'assets/js/kpt-project.js'));
const R = require(path.join(ROOT, 'assets/js/kpt-research.js'));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } };
const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------- synthetic record ---------- */
const meta = { latestMonth: '2026-09', shards: 64 }, man = { latestMonth: '2026-09' };
const T3 = { g: '3', label: '3-bedroom', basis: { verified: 10, inferred: 0 }, win: 12, n: 14, act: 9, last: 202609, from: '2025-10', to: '2026-09', price: [1700000, 1920000, 2050000, 2180000, 2600000], psf: [1700, 1810, 1890, 1960, 2100], sqft: [958, 1250],
  trend: { bin: 1000, a: 9, b: 11, other: 5, evidence: 'strong', dir: 'stable', pct: 1.2, withinNoise: false } };
const T2 = { g: '2', label: '2-bedroom', basis: { verified: 0, inferred: 20 }, win: 24, n: 20, act: 15, last: 202608, from: '2024-10', to: '2026-09', price: [1100000, 1200000, 1250000, 1300000, 1400000], psf: [1800, 1900, 1950, 2000, 2100], sqft: [700, 700], trend: { bin: 700, a: 2, b: 3, other: 0, evidence: 'none', why: 'few' } };
const shard = { projects: { 'test-dev': { name: 'TEST DEV', resale: { coverage: 0.9, types: [T3, T2], few: ['4'] } } } };

/* ---------- pick and view ---------- */
ok(B.pick(shard, meta, 'test-dev', man) && B.pick(shard, meta, 'other', man) === null, 'pick: the development’s record, none for another');
ok(B.pick(shard, meta, 'test-dev', { latestMonth: '2026-06' }) === null, 'pick: a bedroom file from another data month is ignored (figures never disagree)');
const rec = B.pick(shard, meta, 'test-dev', man);
{
  const V = B.view(rec, 'resale', '');
  ok(V.types.map((t) => t.g).join() === '2,3' && V.g === null && !V.t, 'view: types in order, nothing chosen for the visitor');
  ok(V.few.join() === '4', 'view: types too few to show are named');
  const V3 = B.view(rec, 'resale', '3');
  ok(V3.g === '3' && V3.t === T3, 'view: the chosen type');
  const V5 = B.view(rec, 'resale', '5');
  ok(V5.g === null && V5.missing === '5' && !V5.t, 'view: a type kept from another development and missing here is not swapped for another');
  ok(B.view(rec, 'new', '') === null && B.view(rec, 'new', '3').missing === '3', 'view: no new-sale types: the size question, and the kept type said to be unavailable');
  ok(B.view(null, 'resale', '') === null, 'view: no bedroom data: nothing changes');
}

/* ---------- the choice ---------- */
{
  const V = B.view(rec, 'resale', '');
  const c = B.chipsHtml(V);
  ok((c.match(/data-bed=/g) || []).length === 2 && !/aria-pressed="true"/.test(c), 'chips: one per type with figures, none pressed');
  ok(/Choose one/.test(B.lineHtml(V)) && /No reliable 5-bedroom figures here/.test(B.lineHtml(B.view(rec, 'resale', '5'))), 'line: a prompt, or plain words when the kept type is missing');
}

/* ---------- the answer: total price first ---------- */
{
  const V = B.view(rec, 'resale', '3'), h = B.answerHtml(V, {}), t = txt(h);
  ok(t.indexOf('$2.05m typical price') > -1, 'answer: typical total price first', t);
  ok(/Half of the 14 resales sold between \$1\.92m and \$2\.18m/.test(t), 'answer: the middle half and the count');
  ok(/Oct 2025 to Sep 2026/.test(t), 'answer: the period');
  ok(/Sizes from 958 to 1,250 sq ft, a wide spread/.test(t) && /Median \$1,890 psf/.test(t), 'answer: the size spread (958–1,250 is 25%+) and the median psf, after the price');
  ok(t.indexOf('$2.05m') < t.indexOf('psf'), 'answer: quantum before psf');
  ok(/Bedrooms from the developer’s floor plans/.test(t) && /Past sales, not a valuation/.test(t), 'answer: basis says floor plans when all are verified');
  const V2 = B.view(rec, 'resale', '2'), t2 = txt(B.answerHtml(V2, {}));
  ok(/URA rental records/.test(t2) && !/floor plans/.test(t2), 'answer: rental-inferred is never called a floor-plan match');
  ok(/All 700 sq ft/.test(t2) && /covers the last 2 years/.test(t2), 'answer: one size; a 2-year window is said');
  ok(/floor plans and, for some sizes, URA rental records/.test(B.basisText({ verified: 3, inferred: 2 })), 'answer: mixed basis');
  ok(B.short(915000) === '$915k' && B.short(2000000) === '$2m' && B.short(1280000) === '$1.28m' && B.short(2500000) === '$2.5m', 'prices people say');
}

/* ---------- the budget line ---------- */
{
  const V = B.view(rec, 'resale', '3');
  ok(/Most of these sold at or below your budget of \$2.2m/.test(B.budgetText(V.t, 2200000)), 'budget above the middle half');
  ok(/Most of these sold above your budget of \$1.5m/.test(B.budgetText(V.t, 1500000)), 'budget below the middle half');
  ok(/within the range most of these sold for/.test(B.budgetText(V.t, 2000000)), 'budget inside the middle half');
  ok(/doesn’t mean a loan or a purchase would be approved/.test(B.budgetText(V.t, 2000000)), 'budget: never a qualification');
  ok(B.budgetText(V.t, null) === '' && !/budget/.test(txt(B.answerHtml(V, {}))), 'no budget, no line');
}

/* ---------- price movement: one size of one type ---------- */
{
  const R3 = PU.bedroomText(T3);
  ok(/broadly the same as a year earlier/.test(R3.head) && /3-bedroom homes of 1,000–1,099 sq ft/.test(R3.sub) && /9 recent and 11 earlier/.test(R3.sub), 'strong reading on the type’s most-sold size', R3);
  const R2 = PU.bedroomText(T2);
  ok(/Not enough comparable sales/.test(R2.head) && /700–799 sq ft/.test(R2.sub), 'too few comparable sales: said, with the size used', R2);
  ok(/could be matched/.test(PU.bedroomText(Object.assign({}, T3, { trend: { bin: 1000, why: 'coverage', evidence: 'none' } })).sub), 'uneven classification between years: said');
  const lim = PU.bedroomText(Object.assign({}, T3, { trend: { bin: 1000, a: 4, b: 5, evidence: 'limited', dir: 'higher', pct: 6 } }));
  ok(/A first look/.test(lim.head) && /not a reliable measure/.test(lim.sub), 'limited reading is a first look');
  const th = txt(B.trendHtml(B.view(rec, 'resale', '3'), { mapHref: 'map/#p=test-dev' }));
  ok(/Price movement · 3-bedroom, 1,000–1,099 sq ft/.test(th) && /See how prices moved by size/.test(th) && /individual sales on the Map/.test(th), 'trend block: names the size, offers the size trend and the Map');
  ok(/Shown for resales only/.test(txt(B.trendHtml(Object.assign(B.view(rec, 'resale', '3'), { sale: 'new' }), {}))), 'new sales: no direction read');
  ok(/data-bin="1000"/.test(B.numbersHtml(B.view(rec, 'resale', '3'))), 'the numbers section points to the type’s most-sold size');
}

/* ---------- what leaves the page ---------- */
{
  const V = B.view(rec, 'resale', '3');
  const f = B.finding(V), msg = PU.waMessage({ kind: 'bedroom', text: f }, 'TEST DEV', 'https://x/research/#/p/test-dev', 'buy');
  ok(/3-bedroom resales at a typical \$2.05m \(14 resales, Oct 2025 to Sep 2026\)/.test(msg) && /KPT-PULSE-BUY/.test(msg), 'WhatsApp: the type and its typical price', msg);
  ok(/KPT-PULSE-SELL/.test(PU.waMessage({ kind: 'bedroom', text: f }, 'TEST DEV', '', 'sell')), 'WhatsApp: the owner’s message too');
  ok(B.typical(V).price === 2050000 && /median price of the 14 resales of 3-bedroom homes/.test(B.typical(V).text), 'Run the numbers: the median, to the nearest $1,000');
  ok(R.analytics('research_bedroom_selected', { project_id: 'test-dev', bedroom: '3', sale_type: 'resale', price: 2050000 }).bedroom === '3' && R.analytics('research_bedroom_selected', { bedroom: '3; drop' }).bedroom === undefined && R.analytics('research_bedroom_selected', { price: 1 }).price === undefined, 'analytics: the type only, as a category; no price');
}

/* ---------- the published data beside the Research figures ---------- */
{
  const dir = path.join(ROOT, 'data/projects/bedroom'), bm = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), pm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/manifest.json'), 'utf8'));
  ok(bm.latestMonth === pm.latestMonth, 'published types: same data month as Research');
  const det = {}; fs.readdirSync(path.join(ROOT, 'data/projects/detail')).forEach((f) => Object.assign(det, JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/detail', f), 'utf8')).projects));
  const base = (() => { const a = pm.monthStart.split('-').map(Number); return a[0] * 12 + a[1] - 1; })(), last = (() => { const a = pm.latestMonth.split('-').map(Number); return a[0] * 12 + a[1] - 1; })();
  let checked = 0; const bad = [];
  fs.readdirSync(dir).filter((f) => /^s\d+\.json$/.test(f)).forEach((f) => {
    const sh = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    Object.keys(sh.projects).forEach((id) => {
      if (f !== P.shardName(P.shardOf(id, bm.shards)) + '.json') bad.push('shard ' + id);
      const p = det[id]; if (!p) { bad.push('not in Research ' + id); return; }
      const mo = (p.monthly && p.monthly.resale) || [], nIn = (m) => { let s = 0; for (let i = 0; i + 1 < mo.length; i += 2) if (base + mo[i] > last - m) s += mo[i + 1]; return s; };
      const rs = sh.projects[id].resale; if (!rs) return;
      if (rs.types.some((t) => [12, 24].indexOf(t.win) < 0)) bad.push('window beyond 24 months ' + id);
      [12, 24].forEach((w) => { const tot = rs.types.filter((t) => t.win === w).reduce((s, t) => s + t.n, 0); if (tot > nIn(w)) bad.push('count ' + id + ' ' + w); });
      rs.types.forEach((t) => {
        checked++;
        if (!(t.price[0] <= t.price[1] && t.price[1] <= t.price[2] && t.price[2] <= t.price[3] && t.price[3] <= t.price[4])) bad.push('order ' + id);
        if (t.price[0] < p.dist.resale.price[0] - 1 || t.price[4] > p.dist.resale.price[4] + 1) bad.push('outside ' + id);
        if (t.trend && t.trend.bin != null && (t.trend.bin > t.sqft[1] || t.trend.bin + 99 < t.sqft[0])) bad.push('trend size outside the type ' + id + ' ' + t.g);
        if (rs.few && rs.few.indexOf(t.g) > -1) bad.push('both shown and too few ' + id);
      });
    });
  });
  ok(checked > 500 && bad.length === 0, 'published types (' + checked + '): counts within Research’s own, prices within the development’s, the trend size inside the type', bad.slice(0, 5));
}

console.log('bedroom-research UI tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
