'use strict';
/* Bedroom pricing tiers (Claude C r2, approved 29 Oct 2026; FOR-CLAUDE-B-bedroom-pricing-tiers-SPEC r2, section 5 tests 1-8 and 13): the builder's
   size groups (Tier B medians), other sizes and historical ranges, on synthetic sales, and the published data against the live v1.2 data it extends
   and against the Transactions rows Research shows beside it.
   Run from the site folder: node tools/market-data/tests/bedroom-tiers-tests.js
   With the private inputs (never in this repository) it also rebuilds the data:
     GW_BEDS_RAW=<URA folder with the 12 rental quarters> GW_BEDS_SNAPSHOT=<accepted snapshot.json> node tools/market-data/tests/bedroom-tiers-tests.js */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..', '..');
const BR = require('../build-bedroom-research.js'), E = require('../bedroom-engine.js');
const REC = require(path.join(ROOT, 'assets/js/gw-records.js')), P = require(path.join(ROOT, 'assets/js/kpt-project.js'));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 400)); } };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* ---------- test 2: sizeGroups on synthetic sales ---------- */
const YM = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1, latest = YM('2026-09');
const sale = (sqm, ym, price) => { const y = YM(ym); return { group: '3', sale: 3, sqm, ym: y, price: price || 2000000, psf: (price || 2000000) / (sqm * E.SQFT_PER_SQM), period: Math.floor((latest - y) / 12), tier: 'inferred' }; };
const mon = (n, from) => Array.from({ length: n }, (x, k) => { const i = YM(from || '2026-01') + k; return Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0'); });
const G = (rows) => BR.sizeGroups(rows, latest, rows, '3');
{
  ok(BR.GROUP.span === 1.1 && BR.GROUP.maxGroups === 2, 'GROUP: span 1.10, at most 2 groups');
  const at = (a, b) => mon(5).map((m, k) => sale(k % 2 ? b : a, m));
  ok(G(at(100, 110)).length === 1 && G(at(100, 110))[0].n === 5, 'a span of exactly 10.0% is one group');
  ok(G(at(1000, 1101)).every((q) => q.n < 5) && G(at(1000, 1101)).length === 0, 'a span of 10.1% is not (two groups of 3 and 2, neither passes)');
  const five2 = ['2026-08', '2026-08', '2026-09', '2026-09', '2026-09'].map((m) => sale(100, m));
  ok(G(five2).length === 0, '5 sales in 2 months fails the typical-price test');
  const m12 = mon(6, '2025-11').map((m) => sale(100, m)).concat(mon(3, '2024-11').map((m) => sale(100, m)));
  ok(G(m12)[0].win === 12 && G(m12)[0].n === 6, 'the 12-month window is preferred over 24 when it passes');
  const m24 = mon(3, '2026-01').map((m) => sale(100, m)).concat(mon(3, '2024-11').map((m) => sale(100, m)));
  ok(G(m24)[0].win === 24 && G(m24)[0].n === 6 && G(m24)[0].from === '2024-10', 'else the 24-month window, from its first month');
  // tie order: most sales; then most in 12 months; then smaller sizes
  const tie = mon(5, '2024-11').map((m) => sale(80, m)).concat(mon(5, '2026-01').map((m) => sale(120, m)));
  ok(G(tie)[0].sqft[0] === Math.round(120 * E.SQFT_PER_SQM), 'equal counts: the group with more sales in the last 12 months first', G(tie)[0]);
  const tie2 = mon(5, '2026-01').map((m) => sale(80, m)).concat(mon(5, '2026-01').map((m) => sale(120, m)));
  ok(G(tie2)[0].sqft[0] === Math.round(80 * E.SQFT_PER_SQM) && G(tie2)[1].sqft[0] === Math.round(120 * E.SQFT_PER_SQM), 'equal again: the smaller sizes first');
  const three = [60, 80, 100].reduce((a, s) => a.concat(mon(6).map((m) => sale(s, m))), []);
  ok(G(three).length === 2, 'at most 2 groups');
  const g1 = G(mon(6).map((m, k) => sale(100 + (k % 3) * 4, m, 2000000 + k * 10000)))[0], rows1 = mon(6).map((m, k) => sale(100 + (k % 3) * 4, m, 2000000 + k * 10000)), c1 = E.cell(rows1);
  ok(g1.med === c1.price[2] && g1.lo === c1.price[0] && g1.hi === c1.price[4] && g1.n === 6 && g1.act === 6, 'med, lo, hi are E.cell on the same rows (test 3)');
  ok(g1.sqft[0] === Math.round(100 * E.SQFT_PER_SQM) && g1.sqft[1] === Math.round(108 * E.SQFT_PER_SQM), 'sq ft bounds use the Transactions conversion (Math.round), not the bands’ floor (R3)');
}

/* ---------- the published data ---------- */
const dir = path.join(ROOT, 'data/projects/bedroom'), meta = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), all = {};
fs.readdirSync(dir).filter((f) => /^s\d+\.json$/.test(f)).forEach((f) => Object.assign(all, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).projects));
const ids = Object.keys(all).sort(), OLD = ['g', 'label', 'n12', 'n24', 'last', 'basis', 'figures', 'why', 'couldBe'];
ok(meta.version === 'bedroom-research-v1.3' && meta.rules.groupSpan === 1.1 && meta.rules.maxGroups === 2, 'version v1.3; meta.rules publishes groupSpan and maxGroups');
{
  // test 1: every v1.2 key byte-identical (golden from the live v1.2 data, commit c36d318), except unknown (R2)
  const h = crypto.createHash('sha256'), unk = {};
  ids.forEach((id) => { const r = all[id].resale; unk[id] = r.unknown; h.update(id + '\t' + JSON.stringify({ name: all[id].name, coverage: r.coverage, of: r.of, types: r.types, few: r.few, matched: (r.matched || []).map((m) => OLD.map((k) => m[k])) }) + '\n'); });
  ok(ids.length === 744 && h.digest('hex') === '324e16192ebc32102bb635d2809616eb89ed5ea64f1280954be20e6914fe08d9', 'types, few, of and every v1.2 matched key are byte-identical to the live v1.2 data (744 developments)');
}
const tm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/tx/manifest.json'), 'utf8')), man = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/manifest.json'), 'utf8')), cache = {};
const txOf = (id) => { const k = P.shardName(P.shardOf(id, tm.shards)); return REC.pick(cache[k] || (cache[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/tx', k + '.json'), 'utf8'))), tm, id, man); };
const ymI = (v) => Math.floor(v / 100) * 12 + (v % 100) - 1, ymS = (s) => Number(s.slice(0, 4)) * 100 + Number(s.slice(5, 7)), sq = (r) => Math.round(r[3] * 10.7639);
const asRow = (r) => ({ ym: ymI(r[0]), price: r[4], psf: r[4] / (r[3] * 10.7639) });
let entries = 0, bad = { unknown: [], of: [], last: [], groups: [], cmp: [], other: [], range: [], sqft: [], keys: [], list: [], notice: [] }, unkChanged = [];
const N = { B: 0, C: 0, devs: new Set(), groups: 0, two: 0, strong: 0, limited: 0, none: 0, other: 0, overlap: 0 };
ids.forEach((id) => {
  const r = all[id].resale, T = txOf(id), L = ymI(T.latest), f = (o) => REC.filter(T.rows, Object.assign({ bin: 'all', sort: 'new' }, o), T.latest);
  // test 5: of = the 2-year resale rows; unknown = their "Type unknown" rows (R2)
  if (f({ bed: 'all', sale: 3, period: 24 }).length !== r.of) bad.of.push(id);
  if (f({ bed: 'u', sale: 3, period: 24 }).length !== r.unknown) bad.unknown.push([id, r.unknown, f({ bed: 'u', sale: 3, period: 24 }).length]);
  (r.matched || []).forEach((m) => {
    entries++;
    const rows24 = f({ bed: m.g, sale: 3, period: 24 });
    if (rows24.length && Math.max.apply(null, rows24.map((x) => x[0])) !== m.last) bad.last.push([id, m.g]);
    // the "See the n24 matched resales" list and its notice
    const lh = REC.listHtml(T, { bed: m.g, bin: 'all', sale: 3, period: 24, sort: 'new' }, 5), nm = /data-gwr-bednote data-n="(\d+)" data-m="(\d+)"/.exec(lh);
    if (!nm || +nm[1] !== m.n24) bad.list.push([id, m.g]);
    if (m.figures) { if ('groups' in m || 'range' in m) bad.keys.push([id, m.g, 'figures with tier keys']); return; }
    if (!nm || +nm[2] !== f({ bed: 'u', sale: 3, period: 24 }).length) bad.notice.push([id, m.g]);
    if (JSON.stringify(Object.keys(m)) !== JSON.stringify(OLD.concat(['groups', 'other', 'range']))) bad.keys.push([id, m.g, Object.keys(m)]);
    const allSq = new Set(T.rows.map(sq));
    // test 3: range = all 24-month matched resales; other = those in no group
    const mm = (rows) => ({ n: rows.length, lo: Math.min.apply(null, rows.map((x) => x[4])), hi: Math.max.apply(null, rows.map((x) => x[4])), sqft: [Math.min.apply(null, rows.map(sq)), Math.max.apply(null, rows.map(sq))], from: Math.min.apply(null, rows.map((x) => x[0])), to: Math.max.apply(null, rows.map((x) => x[0])) });
    const R = mm(rows24);
    if (m.range.n !== m.n24 || m.range.n !== R.n || m.range.lo !== R.lo || m.range.hi !== R.hi || m.range.sqft.join() !== R.sqft.join() || ymS(m.range.from) !== R.from || ymS(m.range.to) !== R.to) bad.range.push([id, m.g]);
    // the group's sizes, re-derived independently from the Transactions rows with the r2 §2 rule (sizes within 10%, at most 2 attempts): a size
    // the group spans but that sold only outside its window counts in the group (for the comparison and "other"), as in the builder
    const sizesOf = (() => { let left = rows24.slice(); const out = [];
      for (let k = 0; k < 2 && left.length; k++) {
        const sz = Array.from(new Set(left.map((x) => x[3]))).sort((p, q) => p - q); let best = null;
        sz.forEach((a) => { const win = sz.filter((x) => x >= a && x <= a * 1.1), l = left.filter((x) => win.includes(x[3])), key = [l.length, l.filter((x) => ymI(x[0]) > L - 12).length, -a];
          if (!best || key.some((v, i) => key.slice(0, i).every((u, j) => u === best.key[j]) && v !== best.key[i] && v > best.key[i])) best = { key, win, l }; });
        left = left.filter((x) => !best.win.includes(x[3])); const c12 = best.l.filter((x) => ymI(x[0]) > L - 12), c24 = best.l, okc = (rs) => rs.length >= 5 && new Set(rs.map((x) => x[0])).size >= 3;
        if (okc(c12) || okc(c24)) out.push(best.win);
      } return out; })();
    if (sizesOf.length !== m.groups.length) bad.groups.push([id, m.g, 'group count', sizesOf.length]);
    const inGroup = (x) => sizesOf.some((w) => w.includes(x[3]));
    if (m.groups.some((q, i) => sizesOf[i] && (Math.round(Math.min.apply(null, sizesOf[i]) * 10.7639) > q.sqft[0] || Math.round(Math.max.apply(null, sizesOf[i]) * 10.7639) < q.sqft[1]))) bad.groups.push([id, m.g, 'shown sizes outside the group']);
    if (m.groups.some((q, i) => sizesOf[i] && (Math.round(Math.min.apply(null, sizesOf[i]) * 10.7639) < q.sqft[0] || Math.round(Math.max.apply(null, sizesOf[i]) * 10.7639) > q.sqft[1]))) N.wider = (N.wider || 0) + 1;
    m.groups.forEach((q) => {
      // test 3 and 5: the group's rows in its window, from Transactions; med/lo/hi/n/act equal E.cell on them; every sq ft bound is a listed size
      const rows = f({ bed: m.g, sale: 3, period: q.win }).filter((x) => sq(x) >= q.sqft[0] && sq(x) <= q.sqft[1]), c = E.cell(rows.map(asRow));
      if (c.n !== q.n || c.act !== q.act || c.price[2] !== q.med || c.price[0] !== q.lo || c.price[4] !== q.hi || q.from !== REC.ymLabel && false) bad.groups.push([id, m.g, q, c.n]);
      if (q.to !== tm.latestMonth || ymS(q.from) !== Number(REC.ymAdd(T.latest, -(q.win - 1)))) bad.groups.push([id, m.g, 'window', q.from, q.to]);
      if (q.sqft[1] > q.sqft[0] * 1.1 + 1) bad.groups.push([id, m.g, 'span over 10%', q.sqft]);
      q.sqft.forEach((v) => { if (!allSq.has(v)) bad.sqft.push([id, m.g, v]); });
      // test 4: cmp = E.reading on the psf cells of these sizes, last 12 months against the 12 before; no coverage condition
      const gi = m.groups.indexOf(q), at = (p) => T.rows.filter((x) => x[1] === 3 && String(x[5]) === m.g && (sizesOf[gi] || []).includes(x[3]) && Math.floor((L - ymI(x[0])) / 12) === p).map(asRow);
      const A = E.cell(at(0)), Bc = E.cell(at(1)), rd = E.reading(A, Bc, L), want = rd.evidence === 'none' ? { evidence: 'none', a: A.n, b: Bc.n } : { evidence: rd.evidence, dir: rd.dir, pct: rd.pct, a: A.n, b: Bc.n };
      if (JSON.stringify(want) !== JSON.stringify(q.cmp)) bad.cmp.push([id, m.g, q.cmp, want]);
      N[q.cmp.evidence]++;
    });
    const rest = rows24.filter((x) => !inGroup(x));
    if (m.groups.length && rest.length) { const O = mm(rest); if (!m.other || m.other.n !== O.n || m.other.lo !== O.lo || m.other.hi !== O.hi || m.other.sqft.join() !== O.sqft.join()) bad.other.push([id, m.g]); }
    else if (m.other !== null) bad.other.push([id, m.g, 'other where none']);
    if (m.groups.length) { N.B++; N.devs.add(id); N.groups += m.groups.length; if (m.other) N.other++; if (m.groups.length === 2) { N.two++; const [x, y] = m.groups; if (!(x.sqft[1] < y.sqft[0] || y.sqft[1] < x.sqft[0])) N.overlap++; } } else N.C++;
  });
});
Object.keys(bad).forEach((k) => ok(!bad[k].length, 'every development: ' + k + ' agrees with the Transactions rows (' + entries + ' matched entries)', bad[k].slice(0, 3)));
ok(JSON.stringify({ B: N.B, devs: N.devs.size, groups: N.groups, two: N.two, C: N.C, strong: N.strong, limited: N.limited, none: N.none, other: N.other, overlap: N.overlap }) === JSON.stringify({ B: 168, devs: 132, groups: 194, two: 26, C: 382, strong: 28, limited: 100, none: 66, other: 64, overlap: 0 }),
  'nationwide (test 8): 168 Tier B in 132 developments, 194 groups (26 types with two), 382 Tier C; comparisons 28 strong, 100 limited, 66 none; 64 with other sizes; 0 overlapping', N);
console.log('  note: ' + (N.wider || 0) + ' groups span a size that sold only outside the group’s window (counted in the group for its comparison and for "other", not in its shown sizes)');
ok(ids.filter((id) => (all[id].resale.types || []).length).reduce((a, id) => a + all[id].resale.types.length, 0) === 853, 'the 853 typical-price types are there, untouched');
ok(all['hundred-palms-residences'].resale.unknown === 8, 'R2: Hundred Palms Residences unknown reads 8, as Transactions does');
{
  // test 6: key allow-list and leak scan
  const KG = 'sqft,win,from,to,n,act,med,lo,hi,cmp', KO = 'n,lo,hi,sqft,from,to', badk = [];
  ids.forEach((id) => (all[id].resale.matched || []).filter((m) => !m.figures).forEach((m) => {
    m.groups.forEach((q) => { if (Object.keys(q).join() !== KG || !['strong', 'limited', 'none'].includes(q.cmp.evidence)) badk.push([id, m.g, Object.keys(q)]); });
    [m.other, m.range].forEach((o) => { if (o && Object.keys(o).join() !== KO) badk.push([id, m.g, Object.keys(o)]); });
  }));
  const s = JSON.stringify(ids.map((id) => all[id].resale.matched || []));
  ok(!badk.length && !/sqm|area|psf|layout|code|rows|unit|#\d/i.test(s), 'key allow-list; no square metres, layout codes, per-sale rows or unit-like strings in the bedroom shard', badk.slice(0, 2));
}
{
  // test 7: the §6 fixtures (5 Oct 2026 data)
  const fx = (id, g) => { const m = all[id].resale.matched.find((x) => x.g === g); return { groups: m.groups.map((q) => [q.sqft.join('-'), q.win, q.n, q.med, q.lo, q.hi, q.cmp.evidence, q.cmp.dir || '', q.cmp.pct == null ? '' : q.cmp.pct, q.cmp.a, q.cmp.b].join(' ')), other: m.other ? [m.other.n, m.other.lo, m.other.hi, m.other.sqft.join('-')].join(' ') : null, range: [m.range.n, m.range.lo, m.range.hi, m.range.sqft.join('-')].join(' ') }; };
  const want = {
    'kovan-melody 3': { groups: ['1216-1292 12 12 2260000 2050000 2515000 strong stable 1.2 12 8'], other: null },
    'kovan-melody 2': { groups: ['904-904 24 9 1530000 1420000 1660000 limited higher 6 3 6'], other: null },
    'kovan-melody 4': { groups: [], other: null, range: '3 2590000 2850000 1410-1410' },
    'simsville 4': { groups: [], other: null, range: '4 2100000 2420000 1528-1528' },
    'bartley-ridge 2': { groups: ['721-764 12 8 1475000 1455000 1575000 limited stable 2.1 8 5', '829-850 24 10 1625000 1560000 1830000 limited higher 8.6 3 7'], other: null },
    'bartley-ridge 3': { groups: ['1033-1044 12 6 2165000 2016000 2230000 limited higher 3.3 6 4'], other: '4 2325000 2490000 1173-1173' },
    'waterbank-at-dakota 2': { groups: ['883-883 24 8 1770000 1633888 2000000 limited higher 10 3 5'], other: null },
    'waterbank-at-dakota 3': { groups: ['1130-1184 24 6 2544000 2350000 2750000 none   1 5'], other: '4 2520000 2780000 1259-1281' },
    'hundred-palms-residences 5': { groups: [], other: null } };
  Object.keys(want).forEach((k) => { const [id, g] = k.split(' '), got = fx(id, g), w = want[k]; ok(JSON.stringify(got.groups) === JSON.stringify(w.groups) && JSON.stringify(got.other) === JSON.stringify(w.other) && (!w.range || got.range === w.range), 'fixture ' + k, got); });
}
{
  // test 13: Budget Search and the asking-price check byte-identical
  const h = (f) => sha(fs.readFileSync(path.join(ROOT, f)));
  ok(h('data/projects/find-beds.json') === '3dbf16c1b6511899544473e2b482868acb6bf1f249391b5408d01b2e5b353351' && h('assets/js/kpt-discover-beds.js') === '8a9a8b8867b92c56fb3c12c579f437f6efc2dac2866d79b5843958059efc6e0b' && h('assets/js/gw-ask.js') === '45daaa45b9cfd8ec6bba1757c24007b6aa720cb48630b84fa5bd2357512e33be', 'Budget Search data and code, and the asking-price check, are byte-identical');
}
if (process.env.GW_BEDS_RAW && process.env.GW_BEDS_SNAPSHOT) {
  const r = BR.build({ site: ROOT, raw: process.env.GW_BEDS_RAW, snapshot: process.env.GW_BEDS_SNAPSHOT });
  const built = {}; Object.values(r.shards).forEach((s) => Object.assign(built, s));
  ok(JSON.stringify(Object.keys(built).sort()) === JSON.stringify(ids) && ids.every((id) => JSON.stringify(built[id]) === JSON.stringify(all[id])) && JSON.stringify(r.meta) === JSON.stringify(meta), 'the published data is exactly what the builder makes from the private inputs');
} else console.log('  skip the private rebuild: set GW_BEDS_RAW and GW_BEDS_SNAPSHOT (private inputs, outside the repository)');
console.log('bedroom-tiers-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
