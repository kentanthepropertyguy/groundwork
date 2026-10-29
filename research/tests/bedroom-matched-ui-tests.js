'use strict';
/* "Matched sales only" bedroom types (V2, Ken 27 Oct 2026; Claude C's handover section 6, UI tests 16, 18, 19, 22, 23, 25, 26, 28).
   The page's pure parts (gw-bedroom.js, gw-records.js, kpt-research.js analytics) on the published data. The real page is
   research/tests/bedroom-matched-render.py. Run from the site folder: node research/tests/bedroom-matched-ui-tests.js */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const B = require(path.join(ROOT, 'assets/js/gw-bedroom.js')), REC = require(path.join(ROOT, 'assets/js/gw-records.js')), R = require(path.join(ROOT, 'assets/js/kpt-research.js'));
const P = require(path.join(ROOT, 'assets/js/kpt-project.js'));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 500)); } };
const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([.,])/g, '$1').trim();
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };

const dir = path.join(ROOT, 'data/projects/bedroom'), meta = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), man = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/manifest.json'), 'utf8'));
const recOf = (id) => { const f = path.join(dir, P.shardName(P.shardOf(id, meta.shards)) + '.json'); return B.pick(JSON.parse(fs.readFileSync(f, 'utf8')), meta, id, man); };
const recFor = (V) => Object.assign({}, V.m, { of: V.of, unknown: V.unknown });
const INF = 'Bedrooms matched from URA rental records for homes of the same size. URA doesn’t record bedrooms with a sale.';

/* ---------- view: figures, matched-only, missing (tests 23, 28) ---------- */
{
  const W = recOf('waterbank-at-dakota');
  const V = B.view(W, 'resale', '');
  ok(V.types.map((t) => t.g).join() === '1' && V.only.map((m) => m.g).join() === '2,3' && V.g === null && !V.t && !V.m, 'view: figured 1-bedroom, matched-only 2 and 3, nothing chosen');
  const V1 = B.view(W, 'resale', '1'), V3 = B.view(W, 'resale', '3'), V4 = B.view(W, 'resale', '4');
  ok(V1.t && V1.g === '1' && !V1.m, 'view: a figured choice is t');
  ok(!V3.t && V3.m && V3.g === '3' && !V3.missing, 'view: a matched-only choice is m, never "missing"');
  ok(V4.missing === '4' && !V4.t && !V4.m && V4.g === null, 'view: a type in neither list is missing');
  ok(/No reliable 4-bedroom figures here/.test(B.lineHtml(V4)) && !/No reliable/.test(B.lineHtml(V3)), 'line: "No reliable ... figures" only for a type in neither list');
  const K = recOf('kovan-melody');
  ok(K.resale.types.length === 0 && K.resale.few.join() === '4' && B.view(K, 'resale', '').few.length === 0 && B.view(K, 'resale', '').only.length === 3, 'a type matched-only is no longer listed as "too few" (Kovan Melody 4-bedroom); a development with no figured type still has a view (test 24)');
  ok(B.anyType(B.view(K, 'resale', '')) && !B.anyType(null), 'anyType: the bedroom question is asked for matched-only types too');
  // test 28: a shard without matched renders exactly as V1.1
  const old = { id: 'x', meta, resale: JSON.parse(JSON.stringify(W.resale)) }; delete old.resale.matched; delete old.resale.of; delete old.resale.unknown;
  const O = B.view(old, 'resale', '3');
  ok(O.missing === '3' && O.only.length === 0 && B.chipsHtml(B.view(old, 'resale', '')) === '<div class="lg-chips gwb-chips" role="group" aria-label="Bedrooms"><button type="button" data-bed="1" aria-pressed="false">1-bedroom</button></div>', 'a shard without matched: the V1.1 chips, and the type kept from elsewhere is missing');
  const old2 = { id: 'y', meta, resale: { coverage: 0.9, types: [], few: ['3'] } };
  ok(B.view(old2, 'resale', '') === null && B.view(old2, 'resale', '3').missing === '3', 'a shard with no types and no matched: no bedroom question, as V1.1');
  ok(REC.typesHtml(B.view(old, 'resale', ''), { label: B.label }).indexOf('data-gwr-also') < 0, 'typesHtml without matched has no "Also matched" line');
}

/* ---------- chips (test 16) ---------- */
{
  const V = B.view(recOf('bartley-ridge'), 'resale', '2'), c = B.chipsHtml(V);
  ok(/<button type="button" data-bed="1" aria-pressed="false">1-bedroom<\/button>/.test(c), 'chips: the figured chip is unchanged');
  ok(/<button type="button" class="gwb-mchip" data-bed="2" data-gwb-tier="matched" aria-pressed="true" aria-label="2-bedroom, matched sales only">2-bedroom<span class="gwb-mtag" aria-hidden="true">Matched sales only<\/span><\/button>/.test(c), 'chips: the matched-only chip carries the tag and the accessible name, pressed when chosen');
  ok((c.match(/data-bed="(\d)"/g) || []).join() === 'data-bed="1",data-bed="2",data-bed="3"', 'chips: in bedroom order');
}

/* ---------- the panel's copy (tests 18, 19) ---------- */
const panelOf = (id, g) => { const V = B.view(recOf(id), 'resale', g); return { V, h: B.matchedHtml(V, { tx: true }), L: B.matchedLines(V) }; };
{
  const a = panelOf('waterbank-at-dakota', '3');
  ok(a.L.one === '10 resales in the last 2 years were matched as 3-bedroom. ' + INF, 'line 1 template (Waterbank 3-bedroom)', a.L.one);
  ok(a.L.two === '6 other resales here could also be 3-bedroom but could not be matched, so this is not every 3-bedroom sale.', 'line 2, couldBe > 0', a.L.two);
  ok(a.L.three === 'Because too many unmatched sales could be 3-bedroom, no typical price or price movement is shown.', 'line 3, ambiguous', a.L.three);
  const b = panelOf('cavendish-park', '2');
  ok(b.L.two === '3 other resales here could not be matched to a bedroom count, and some may be 2-bedroom, so this is not every 2-bedroom sale.', 'line 2, couldBe = 0 and unknown > 0', b.L.two);
  ok(b.L.three === 'There are too few matched sales to show a typical price or price movement.', 'line 3, few', b.L.three);
  const c = panelOf('the-merasaga', '3');
  ok(c.L.two === '' && c.h.indexOf('data-gwb-m2') < 0, 'line 2 omitted when unknown = 0');
  [a, b, c, panelOf('waterbank-at-dakota', '2'), panelOf('bartley-ridge', '2'), panelOf('bartley-ridge', '3'), panelOf('kovan-melody', '4')].forEach((x) => {
    const t = txt(x.h);
    ok(t === [x.V.m.label + ' · Matched sales only', x.L.one, x.L.two, x.L.three, 'See the ' + x.V.m.n24 + ' matched resales'].filter(Boolean).join(' '), 'panel text is exactly the templates (' + x.V.m.label + ', ' + x.V.m.why + ')', t);
    ok(!throws(() => B.assertMatchedOnlyCopy(t, recFor(x.V))), 'assertMatchedOnlyCopy passes the rendered panel', t);
    ok(!/data-gwb-ans|data-gwb-trend|data-gwb-numbers|data-gwb-budget|gwr-rentline|data-gwb-size|data-gwb-range|<svg|lg-ans-v/.test(x.h), 'panel: no answer, price movement, numbers, budget, rent, size, range or chart markup');
  });
  ok(panelOf('waterbank-at-dakota', '3').h.indexOf('data-gwr-mbed="3"') > -1 && B.matchedHtml(B.view(recOf('waterbank-at-dakota'), 'resale', '3'), { rows: '<ul></ul>' }).indexOf('matched resales</button>') < 0, '"See the N matched resales" and the sales list only where the transactions are on the page');
  ok(B.matchedHtml(B.view(recOf('waterbank-at-dakota'), 'resale', '3'), { rows: '<ul></ul>' }).indexOf('data-gwb-mrows') < 0, 'no transactions: no sales list');
}
{
  // section 4 self-test: must pass / must fail
  const V = B.view(recOf('bartley-ridge'), 'resale', '3'), r = recFor(V), L = B.matchedLines(V);
  ['Matched sales only', L.one, L.two, L.three, 'See these sales', [L.one, L.two, L.three].join(' ')].forEach((s) => ok(!throws(() => B.assertMatchedOnlyCopy(s, r, { part: 'line' })), 'must pass: ' + s.slice(0, 50)));
  ok(!throws(() => B.assertMatchedOnlyCopy([L.one, L.two, L.three].join(' '), r)), 'must pass: the whole panel with its required content');
  ['Typical price $2.1m', 'Median 2.05m', 'Most 3-bedroom sales are above your budget', 'All 3-bedroom sales are listed', 'Prices rose 4%', '$2,000,000', '1,100 sq ft',
    'These 14 sales represent the 3-bedroom market', 'Price range $1.9m to $2.3m', '3-bedroom homes here are typical at 1,100 sq ft', '15 resales in the last 2 years were matched as 3-bedroom.', 'S$1.9 million', '$1,820 psf', 'The lowest sold for less', 'Prices are trending higher', 'within your reach', 'every sale', 'the whole development']
    .forEach((s) => ok(throws(() => B.assertMatchedOnlyCopy(s, r, { part: 'line' })), 'must fail: ' + s));
  ok(throws(() => B.assertMatchedOnlyCopy([L.one, L.three].join(' '), r)), 'must fail: the "not every 3-bedroom sale" sentence is required when couldBe > 0');
  ok(throws(() => B.assertMatchedOnlyCopy([L.one, L.two, 'There are too few matched sales to show a typical price or price movement.'].join(' '), r)), 'must fail: the wrong reason for an ambiguous type');
  ok(throws(() => B.assertMatchedOnlyCopy(L.one.replace(' in the last 2 years', ''), r, { part: 'panel' })), 'must fail: without the "last 2 years" window');
  ok(B.MATCHED_ONLY_ALLOWED.length === 4 && B.MATCHED_ONLY_ALLOWED.indexOf('no typical price or price movement is shown') > -1, 'the allowed explanations are exactly the four approved phrases');
}

/* ---------- V2.1 (Amendment 1, Ken 29 Oct 2026): the latest matched resales in the panel ---------- */
{
  const tm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/tx/manifest.json'), 'utf8')), cache = {};
  const txOf = (id) => { const k = P.shardName(P.shardOf(id, tm.shards)); return REC.pick(cache[k] || (cache[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/tx', k + '.json'), 'utf8'))), tm, id, man); };
  const full = (id, g) => { const T = txOf(id), V = B.view(recOf(id), 'resale', g), rows = REC.matchedRows(T, g, B.MATCHED_ROWS), h = B.matchedHtml(V, { tx: true, rows: REC.matchedRowsHtml(rows) }); return { T, V, rows, h, blk: (/<div class="gwb-mrows" data-gwb-mrows>[\s\S]*?<\/ul><\/div>/.exec(h) || [''])[0] }; };
  ok(B.MATCHED_ROWS === 5 && (fs.readFileSync(path.join(ROOT, 'assets/js/gw-bedroom.js'), 'utf8').match(/MATCHED_ROWS = /g) || []).length === 1, 'MATCHED_ROWS is 5, defined once');
  [['bartley-ridge', '3', 5], ['waterbank-at-dakota', '2', 5], ['28-shelford', '3', 3], ['kovan-grandeur', '2', 5], ['parvis', '4', 4]].forEach(([id, g, k]) => {
    const x = full(id, g), list = REC.filter(x.T.rows, { bed: g, bin: 'all', sale: 3, period: 24, sort: 'new' }, x.T.latest);
    ok(x.rows.length === k && x.rows.length === Math.min(5, x.V.m.n24) && JSON.stringify(x.rows) === JSON.stringify(list.slice(0, k)), id + ' ' + g + '-bedroom: the first ' + k + ' sales of "See the ' + x.V.m.n24 + ' matched resales", in its order', x.rows.length);
    ok(x.rows.every((r, i) => !i || r[0] <= x.rows[i - 1][0]), id + ': newest first, never by price');
    ok(!throws(() => B.assertMatchedRows(x.blk, x.rows)), id + ': assertMatchedRows passes the list', (() => { try { B.assertMatchedRows(x.blk, x.rows); } catch (e) { return e.message; } })());
    const prose = txt(x.h.replace(x.blk, ''));
    ok(!throws(() => B.assertMatchedOnlyCopy(prose, recFor(x.V))), id + ': the panel’s sentences still pass assertMatchedOnlyCopy', prose);
    ok(txt(x.blk).indexOf('Latest matched resales Individual sales, newest first, not a typical price.') === 0 && x.h.indexOf(x.blk) < x.h.indexOf('data-gwb-m3'), id + ': headed as individual sales, and above the "not every" and "no typical price" lines');
    ok(!/data-gwb-ans|data-gwb-trend|data-gwb-numbers|data-gwb-budget|psf|median|average/i.test(x.h), id + ': still no answer, price movement, numbers, budget, psf, median or average');
  });
  const fl = full('kovan-grandeur', '2');
  ok(/unusual size for a 2-bedroom/.test(fl.blk) && fl.rows.filter((r) => r[7] & 8).length === (fl.blk.match(/gwr-flag/g) || []).length, 'a flagged sale keeps its Transactions flag');
  // assertMatchedRows self-test: must fail
  const b = full('bartley-ridge', '3'), byPrice = b.rows.slice().sort((p, q) => q[4] - p[4]);
  ok(throws(() => B.assertMatchedRows(REC.matchedRowsHtml(byPrice), b.rows)) && throws(() => B.assertMatchedRows(REC.matchedRowsHtml(byPrice), byPrice)), 'must fail: rows sorted by price');
  ok(throws(() => B.assertMatchedRows(b.blk.replace('</ul>', '</ul><p>Typical $2.2m</p>'), b.rows)), 'must fail: a typical price added to the list');
  ok(throws(() => B.assertMatchedRows(b.blk.replace('</ul>', '</ul><p>Median 2,200,000</p>'), b.rows)), 'must fail: a median added');
  ok(throws(() => B.assertMatchedRows(b.blk.replace(/<li[\s\S]*?<\/li>/, ''), b.rows)), 'must fail: a sale left out');
  ok(throws(() => B.assertMatchedRows(REC.matchedRowsHtml(REC.matchedRows(b.T, '2', 5)), b.rows)), 'must fail: another type’s sales');
  ok(throws(() => B.assertMatchedRows(b.blk.replace('$2,350,000', '$2,350,000 · $2,003 psf'), b.rows)), 'must fail: psf on a row');
  ok(throws(() => B.assertMatchedRows(REC.matchedRowsHtml(REC.filter(b.T.rows, { bed: '3', bin: 'all', sale: 3, period: 24, sort: 'new' }, b.T.latest).slice(0, 6)), REC.filter(b.T.rows, { bed: '3', bin: 'all', sale: 3, period: 24, sort: 'new' }, b.T.latest).slice(0, 6))), 'must fail: more than 5 sales');
  ok(REC.matchedRows(null, '3', 5).length === 0 && REC.matchedRowsHtml([]) === '', 'no transactions: no rows');
}

/* ---------- "What each home type sells for" and Transactions (tests 21, 22) ---------- */
{
  const V = B.view(recOf('bartley-ridge'), 'resale', ''), h = REC.typesHtml(V, { label: B.label });
  ok((h.match(/data-gwr-bed=/g) || []).length === 1 && /data-gwr-bed="1"/.test(h), 'types: figured rows only');
  const also = /<p class="lg-fine gwr-also" data-gwr-also>[\s\S]*?<\/p>/.exec(h)[0];
  ok(txt(also) === 'Also matched (matched sales only): 2-bedroom 23, 3-bedroom 14' && /data-gwr-mbed="2"/.test(also) && /data-gwr-mbed="3"/.test(also), 'types: one "Also matched" line, each type opening its sales', txt(also));
  ok(!throws(() => B.assertMatchedOnlyCopy(txt(also), V.only, { part: 'line' })), 'the "Also matched" line passes assertMatchedOnlyCopy');
  ok(txt(/data-gwr-few>[\s\S]*?<\/p>/.exec(h)[0].replace(/^data-gwr-few>/, '')) === '4-bedroom: too few recent resales to show a typical price.', 'a type under 3 matched resales stays in the "too few" line');
  const K = B.view(recOf('kovan-melody'), 'resale', '');
  ok(REC.typesHtml(K, { label: B.label }) === '', 'no figured type: no "What each home type sells for" section (the page shows sizes)');
}
{
  // Transactions notice: N and M from the rows already loaded, under every combination of the other filters (fixtures)
  const tm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/tx/manifest.json'), 'utf8'));
  ['waterbank-at-dakota', 'bartley-ridge'].forEach((id) => {
    const T = REC.pick(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/tx', P.shardName(P.shardOf(id, tm.shards)) + '.json'), 'utf8')), tm, id, man);
    const V = B.view(recOf(id), 'resale', ''), O = REC.options(T.rows);
    let n = 0, bad = [];
    V.matched.forEach((m) => ['all', 1, 2, 3].forEach((sale) => ['all', 24, 12].forEach((period) => ['all'].concat(O.bins).forEach((bin) => {
      const f = { bed: m.g, bin, sale, period, sort: 'new' }, h = REC.listHtml(T, f, 15), N = REC.filter(T.rows, f, T.latest).length, M = REC.filter(T.rows, Object.assign({}, f, { bed: 'u' }), T.latest).length;
      const note = /data-gwr-bednote data-n="(\d+)" data-m="(\d+)">([^<]*)</.exec(h);
      n++;
      if (!N) { if (note) bad.push(['note with no rows', f]); return; }
      const want = 'Showing the ' + N + ' sale' + (N === 1 ? '' : 's') + ' matched as ' + m.label + '.' + (M ? ' ' + M + ' other sale' + (M === 1 ? '' : 's') + ' here could not be matched to a bedroom count and ' + (M === 1 ? 'may be one more.' : 'may include more.') : '');
      if (!note || Number(note[1]) !== N || Number(note[2]) !== M || note[3] !== want) bad.push([f, N, M, note && note[3]]);
      else if (throws(() => B.assertMatchedOnlyCopy(note[3], { g: m.g, N, M }, { part: 'notice' }))) bad.push(['copy', note[3]]);
    }))));
    ok(!bad.length && n > 50, id + ': the Transactions notice counts N and M for every filter combination (' + n + ')', bad.slice(0, 2));
    const f = { bed: '3', bin: 'all', sale: '3', period: '24', sort: 'new' }, m3 = V.matched.find((m) => m.g === '3');
    ok(REC.filter(T.rows, f, T.latest).length === m3.n24, id + ': "See these sales" (3-bedroom, resales, last 2 years) lists exactly n24 sales');
    ok(REC.listHtml(T, { bed: 'all', bin: 'all', sale: 'all', period: 'all', sort: 'new' }, 15).indexOf('data-gwr-bednote') < 0 && REC.listHtml(T, { bed: 'u', bin: 'all', sale: 'all', period: 'all', sort: 'new' }, 15).indexOf('data-gwr-bednote') < 0, id + ': no notice for All types or Type unknown');
  });
}

/* ---------- analytics, Budget Search, asking-price check (tests 25, 26) ---------- */
{
  ok(JSON.stringify(R.analytics('research_bedroom_selected', { project_id: 'bartley-ridge', bedroom: '3', sale_type: 'resale', tier: 'matched', price: 1800000, n24: 14 })) === '{"project_id":"bartley-ridge","sale_type":"resale","bedroom":"3","tier":"matched"}', 'analytics: the event gains tier and nothing else');
  ok(R.analytics('research_bedroom_selected', { bedroom: '1', tier: 'figures' }).tier === 'figures' && R.analytics('research_bedroom_selected', { bedroom: '1', tier: 'priced' }).tier === undefined && R.analytics('research_size_focus', { tier: 'matched' }).tier === undefined, 'analytics: tier only figures or matched, only on the bedroom event');
  const V = B.view(recOf('bartley-ridge'), 'resale', '3');
  ok(B.finding(V) === '' && B.typical(V) === null, 'WhatsApp and Run the numbers: no finding and no price for a matched-only type');
  const h = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
  ok(h('data/projects/find-beds.json') === '3dbf16c1b6511899544473e2b482868acb6bf1f249391b5408d01b2e5b353351' && h('assets/js/kpt-discover-beds.js') === '8a9a8b8867b92c56fb3c12c579f437f6efc2dac2866d79b5843958059efc6e0b', 'Budget Search: its data and code are byte-identical (matched-only types never make a development eligible)');
  ok(h('assets/js/gw-ask.js') === '45daaa45b9cfd8ec6bba1757c24007b6aa720cb48630b84fa5bd2357512e33be', 'the asking-price check (and its dots) is byte-identical');
}

console.log('bedroom-matched UI tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
