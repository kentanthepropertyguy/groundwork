'use strict';
/* Bedroom pricing tiers (Claude C r2, approved 29 Oct 2026; spec section 5 tests 9-11, 14 and the section 4 validator): the matched panel's Tier B
   (median of past matched resales for a size group) and Tier C (historical matched transactions), on the published data.
   The real page is research/tests/bedroom-tiers-render.py. Run from the site folder: node research/tests/bedroom-tiers-ui-tests.js */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const B = require(path.join(ROOT, 'assets/js/gw-bedroom.js')), REC = require(path.join(ROOT, 'assets/js/gw-records.js')), R = require(path.join(ROOT, 'assets/js/kpt-research.js'));
const P = require(path.join(ROOT, 'assets/js/kpt-project.js'));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 600)); } };
const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([.,:;)])/g, '$1').replace(/\( /g, '(').trim();
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
const dir = path.join(ROOT, 'data/projects/bedroom'), meta = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), man = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/manifest.json'), 'utf8'));
const tm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/tx/manifest.json'), 'utf8'));
const shardOf = (id) => JSON.parse(fs.readFileSync(path.join(dir, P.shardName(P.shardOf(id, meta.shards)) + '.json'), 'utf8'));
const recOf = (id) => B.pick(shardOf(id), meta, id, man);
const txOf = (id) => REC.pick(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/tx', P.shardName(P.shardOf(id, tm.shards)) + '.json'), 'utf8')), tm, id, man);
const panel = (id, g) => { const V = B.view(recOf(id), 'resale', g), T = txOf(id), rows = REC.matchedRows(T, g, B.MATCHED_ROWS), h = B.matchedHtml(V, { tx: true, rows: REC.matchedRowsHtml(rows) }); return { V, T, rows, h, rec: Object.assign({}, V.m, { of: V.of, unknown: V.unknown }) }; };
const INF = 'Bedrooms matched from URA rental records for homes of the same size. URA doesn’t record bedrooms with a sale.';
const ROWS = (x) => 'Latest matched resales Individual sales, newest first, not a typical price. ' + txt(REC.matchedRowsHtml(x.rows));

/* ---------- test 9: the §4 templates exactly, in the answer-first order (Ken, 29 Oct 2026: the medians, the different-sizes note under two,
   the qualification and the warning visible; "Sales history & price movement" and "How these prices are calculated" closed) ---------- */
const HIST = 'Sales history &amp; price movement', HOW = 'How these prices are calculated', FOOT = 'Past sales only. Not a forecast.';
const Bn = (L) => 'Past URA transaction prices for these sizes only. Not a typical price for every ' + L + ' here, and not a valuation.';
const Cn = 'Past URA transaction prices, not a valuation. Too few matched sales of a comparable size to show a median.';
const ONE = (n, L) => n + ' resales in the last 2 years were matched as ' + L + '. ' + INF;
const TWO = (n, L) => n + ' other resales here could also be ' + L + ' but could not be matched, so this is not every ' + L + ' sale.';
const WARN = (n, L) => 'No typical price for all ' + L + ' homes here: ' + n + ' other resales could also be ' + L + ' but couldn’t be matched.';
const FEW = 'A first look, from few sales: ';
const WANT = {
  'kovan-melody 3': ['3-bedroom · Matched sales only', 'Median of 12 past matched resales', '$2.26m', '≈ 1,216–1,292 sq ft · Oct 2025 to Sep 2026', B.QUAL, WARN(7, '3-bedroom'), 'See the 20 matched resales',
    HIST, 'Price movement', 'At these sizes, the median price per sq ft of matched resales in the last 12 months (12 sales) was broadly the same as the 12 months before (8 sales).', FOOT,
    'Historical matched transactions', 'Historical matched transactions: $2.05m to $2.52m (≈ 1,216–1,292 sq ft · Oct 2025 to Sep 2026)', 'ROWS',
    HOW, ONE(20, '3-bedroom'), Bn('3-bedroom'), B.METHOD, TWO(7, '3-bedroom')],
  'bartley-ridge 2': ['2-bedroom · Matched sales only', 'Median of 8 past matched resales', '$1.48m', '≈ 721–764 sq ft · Oct 2025 to Sep 2026', 'Median of 10 past matched resales', '$1.63m', '≈ 829–850 sq ft · Oct 2024 to Sep 2026',
    'Different home sizes — these prices are not a comparison over time.', B.QUAL, WARN(6, '2-bedroom'), 'See the 23 matched resales',
    HIST, 'Price movement', '≈ 721–764 sq ft', FEW + 'At these sizes, the median price per sq ft of matched resales in the last 12 months (8 sales) was broadly the same as the 12 months before (5 sales).',
    '≈ 829–850 sq ft', FEW + 'At these sizes, the median price per sq ft of matched resales in the last 12 months (3 sales) was 8.6% above the 12 months before (7 sales).', FOOT,
    'Historical matched transactions', 'Historical matched transactions: $1.46m to $1.58m (≈ 721–764 sq ft · Oct 2025 to Sep 2026)', 'Historical matched transactions: $1.56m to $1.83m (≈ 829–850 sq ft · Oct 2024 to Sep 2026)', 'ROWS',
    HOW, ONE(23, '2-bedroom'), Bn('2-bedroom'), B.METHOD, TWO(6, '2-bedroom')],
  'bartley-ridge 3': ['3-bedroom · Matched sales only', 'Median of 6 past matched resales', '$2.17m', '≈ 1,033–1,044 sq ft · Oct 2025 to Sep 2026', B.QUAL, WARN(19, '3-bedroom'), 'See the 14 matched resales',
    HIST, 'Price movement', FEW + 'At these sizes, the median price per sq ft of matched resales in the last 12 months (6 sales) was 3.3% above the 12 months before (4 sales).', FOOT,
    'Historical matched transactions', 'Historical matched transactions: $2.02m to $2.23m (≈ 1,033–1,044 sq ft · Oct 2025 to Sep 2026)', 'Historical matched transactions at other sizes: $2.33m to $2.49m (4 resales, ≈ 1,173 sq ft, Oct 2024 to Sep 2026)', 'ROWS',
    HOW, ONE(14, '3-bedroom'), Bn('3-bedroom'), B.METHOD, TWO(19, '3-bedroom')],
  'waterbank-at-dakota 3': ['3-bedroom · Matched sales only', 'Median of 6 past matched resales', '$2.54m', '≈ 1,130–1,184 sq ft · Oct 2024 to Sep 2026', B.QUAL, WARN(6, '3-bedroom'), 'See the 10 matched resales',
    HIST, 'Price movement', B.NO_TREND,
    'Historical matched transactions', 'Historical matched transactions: $2.35m to $2.75m (≈ 1,130–1,184 sq ft · Oct 2024 to Sep 2026)', 'Historical matched transactions at other sizes: $2.52m to $2.78m (4 resales, ≈ 1,259–1,281 sq ft, Oct 2024 to May 2026)', 'ROWS',
    HOW, ONE(10, '3-bedroom'), Bn('3-bedroom'), B.METHOD, TWO(6, '3-bedroom')],
  'kovan-melody 4': ['4-bedroom · Matched sales only', 'Historical matched transactions $2.59m to $2.85m', '3 past resales · ≈ 1,410 sq ft · Jan 2025 to Jul 2026', B.QUAL, WARN(6, '4-bedroom'), 'See the 3 matched resales',
    HIST, 'Price movement', B.NO_TREND, 'ROWS', HOW, ONE(3, '4-bedroom'), Cn, TWO(6, '4-bedroom')],
  'simsville 4': ['4-bedroom · Matched sales only', 'Historical matched transactions $2.1m to $2.42m', '4 past resales · ≈ 1,528 sq ft · Nov 2024 to Sep 2026', B.QUAL, 'No typical price for all 4-bedroom homes here: too few matched sales.', 'See the 4 matched resales',
    HIST, 'Price movement', B.NO_TREND, 'ROWS', HOW, ONE(4, '4-bedroom'), Cn] };
Object.keys(WANT).forEach((k) => {
  const [id, g] = k.split(' '), x = panel(id, g), want = WANT[k].map((p) => (p === 'ROWS' ? ROWS(x) : p)).join(' ');
  { const a = txt(x.h); let d = 0; while (d < a.length && a[d] === want[d]) d++; ok(a === want, k + ': the panel is exactly the r2 templates, answer first', ['got', a.slice(d - 40, d + 160), 'want', want.slice(d - 40, d + 160)]); }
  ok(B.tierOf(x.V.m) === (x.V.m.groups.length ? 'B' : 'C') && x.h.indexOf('data-gwb-tier="' + B.tierOf(x.V.m) + '"') > -1, k + ': tier ' + B.tierOf(x.V.m));
  const ranges = (x.h.match(/<p[^>]*data-gwb-range[^>]*>[\s\S]*?<\/p>/g) || []).map(txt);
  ok(ranges.length && ranges.every((r) => r.indexOf('Historical matched transactions') === 0), k + ': every range is in a data-gwb-range element starting "Historical matched transactions"', ranges);
  ok(!/data-gwb-ans|data-gwb-trend|data-gwb-numbers|data-gwb-budget|gwr-rentline|lg-ans-v|mp-h/.test(x.h), k + ': no answer, typical price, price-movement head, numbers, budget or rent elements');
  ok(!throws(() => B.assertPricedMatchedCopy(txt(x.h), x.rec, { rows: x.rows })), k + ': assertPricedMatchedCopy passes the rendered panel', (() => { try { B.assertPricedMatchedCopy(txt(x.h), x.rec, { rows: x.rows }); } catch (e) { return e.message; } })());
  ok(!throws(() => B.assertMatchedRows(/<div class="gwb-mrows" data-gwb-mrows>[\s\S]*?<\/ul><\/div>/.exec(x.h)[0], x.rows)), k + ': the latest five are the live V2.1 list (test 10)');
  ok(x.h.indexOf('data-gwb-m3') < 0 === (B.tierOf(x.V.m) === 'B'), k + ': line 3 removed for Tier B; the C note for Tier C');
  // visible (outside the closed disclosures): the prices, the qualification and the warning; the details and the method inside them, closed
  const vis = txt(x.h.replace(/<details[\s\S]*?<\/details>/g, ''));
  ok(vis.indexOf(B.QUAL) > -1 && vis.indexOf('No typical price for all') > -1 && (x.V.m.groups.length ? x.V.m.groups.every((q) => vis.indexOf(B.short(q.med)) > -1) : vis.indexOf('Historical matched transactions') > -1), k + ': the prices, the qualification and the warning are visible', vis);
  ok((x.h.match(/<details class="gwb-det" data-gwb-(hist|how)>/g) || []).length === 2 && !/<details[^>]* open/.test(x.h), k + ': both disclosures closed by default');
  ok(vis.indexOf('Price movement') < 0 && vis.indexOf('Latest matched resales') < 0 && vis.indexOf('Bedrooms matched from URA') < 0, k + ': price movement, the latest five and the method are inside the disclosures', vis);
  ok((vis.indexOf('Different home sizes — these prices are not a comparison over time.') > -1) === (x.V.m.groups.length > 1), k + ': the different-sizes note exactly when two medians show');
  ok(B.NO_TREND.indexOf('typical') < 0 && B.NO_TREND !== B.warnText(x.V), k + ': the no-trend line is distinct from the no-typical-price warning');
});
{
  // Hundred Palms Residences (R2): line 2 and the Transactions notice both read 8
  const x = panel('hundred-palms-residences', '5'), lh = REC.listHtml(x.T, { bed: '5', bin: 'all', sale: 3, period: 24, sort: 'new' }, 5);
  ok(x.V.unknown === 8 && txt(x.h).indexOf('8 other resales here could not be matched to a bedroom count') > -1 && / data-m="8"/.test(lh), 'Hundred Palms Residences: the panel and the Transactions notice both say 8 (R2)', [x.V.unknown, / data-m="(\d+)"/.exec(lh)]);
}
/* ---------- test 11: the validator's own must-pass and must-fail lists ---------- */
{
  const x = panel('kovan-melody', '3');
  ['Typical price $2.26m', 'Average $2.2m', '$2,050,000 to $2,515,000', 'Price range $2.05m to $2.52m', 'Recorded $2.05m to $2.52m', 'Prices will rise', 'Expected to appreciate 6%', 'Valued at $2.3m', 'Within your budget',
    'Median of 13 past matched resales: $2.26m', 'Historical matched transactions: $2.05m to $2.61m', '≈ 1,200–1,292 sq ft', 'was 4.5% above'].forEach((t) => ok(throws(() => B.assertPricedMatchedCopy(t, x.rec, { part: 'line' })), 'must fail: ' + t));
  ok(throws(() => B.assertPricedMatchedCopy(txt(x.h).replace(/ · Oct 2025 to Sep 2026/g, ''), x.rec, { rows: x.rows })), 'must fail: a median without its period');
  ok(throws(() => B.assertPricedMatchedCopy(txt(x.h).replace(B.B_NOTE('3-bedroom'), ''), x.rec, { rows: x.rows })), 'must fail: a median without the B note');
  const c = panel('simsville', '4');
  ok(throws(() => B.assertPricedMatchedCopy(txt(c.h).replace(B.C_NOTE, ''), c.rec, { rows: c.rows })), 'must fail: Tier C without the C note');
}
/* ---------- test 14: a shard without groups/range renders exactly as V2.1 ---------- */
{
  const sh = shardOf('bartley-ridge'), v12 = JSON.parse(JSON.stringify(sh)); v12.projects['bartley-ridge'].resale.matched.forEach((m) => { delete m.groups; delete m.other; delete m.range; });
  const V = B.view(B.pick(v12, meta, 'bartley-ridge', man), 'resale', '3'), h = B.matchedHtml(V, { tx: true });
  ok(B.tierOf(V.m) === null && h.indexOf('data-gwb-tier') < 0 && txt(h).indexOf('Because too many unmatched sales could be 3-bedroom, no typical price or price movement is shown.') > -1 && !throws(() => B.assertMatchedOnlyCopy(txt(h), Object.assign({}, V.m, { of: V.of, unknown: V.unknown }))), 'v1.2 data: the V2.1 panel exactly, still passing assertMatchedOnlyCopy');
  ok(B.alsoText(V.m) === '', 'v1.2 data: no tier text on the index line');
}
/* ---------- "Recent resale prices by home type" (Ken, 29 Oct 2026; was the "Also matched" line): tiered types are rows (research/tests/prices-ux-tests.js) ---------- */
{
  const V = B.view(recOf('bartley-ridge'), 'resale', ''), h = REC.typesHtml(V, { label: B.label, cells: B.tierCells });
  ok(h.indexOf('data-gwr-also') < 0 && /data-gwr-bed="2" data-gwr-tier="median"/.test(h) && /data-gwr-bed="3" data-gwr-tier="median"/.test(h), 'Tier B types are rows with their medians, not an Also matched line');
  const K = REC.typesHtml(B.view(recOf('simsville'), 'resale', ''), { label: B.label, cells: B.tierCells });
  ok(/data-gwr-bed="4" data-gwr-tier="historical"/.test(K) && txt(K).indexOf('Historical matched transactions $2.1m to $2.42m') > -1, 'a Tier C type is a row with its historical range', txt(K).slice(0, 400));
  const o = REC.typesHtml(V, { label: B.label }), also = txt(/<p class="lg-fine gwr-also" data-gwr-also>[\s\S]*?<\/p>/.exec(o)[0]);
  ok(also === 'Also matched (matched sales only): 2-bedroom 23, 3-bedroom 14' && o.indexOf('Median of') < 0, 'without cells (the V2.1 call), counts only, as before', also);
}
/* ---------- analytics ---------- */
ok(['median', 'historical', 'matched', 'figures'].every((t) => R.analytics('research_bedroom_selected', { bedroom: '3', tier: t }).tier === t) && R.analytics('research_bedroom_selected', { bedroom: '3', tier: 'typical' }).tier === undefined, 'analytics: tier median, historical (and matched for v1.2 data, figures)');
console.log('bedroom-tiers UI tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
