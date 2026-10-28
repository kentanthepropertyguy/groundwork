'use strict';
/* "Matched sales only" bedroom types (V2, Ken 27 Oct 2026; Claude C's handover section 6, builder tests 1-15).
   The builder's resale.matched list on synthetic sales, and the published data in data/projects/bedroom against the live V1.1 data it extends.
   Run from the site folder: node tools/market-data/tests/bedroom-matched-tests.js
   With the private inputs (never in this repository) it also rebuilds the data and checks it against the completeness gate:
     GW_BEDS_RAW=<URA folder with the 12 rental quarters> GW_BEDS_SNAPSHOT=<accepted snapshot.json> node tools/market-data/tests/bedroom-matched-tests.js */
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..', '..');
const BR = require('../build-bedroom-research.js'), E = require('../bedroom-engine.js'), H = require('../bedroom-hybrid.js'), RW = require('../rental-window.js');
const REC = require(path.join(ROOT, 'assets/js/gw-records.js')), P = require(path.join(ROOT, 'assets/js/kpt-project.js')), BED = require(path.join(ROOT, 'assets/js/gw-bedroom.js'));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 400)); } };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const KEYS = ['g', 'label', 'n12', 'n24', 'last', 'basis', 'figures', 'why', 'couldBe'];

/* ---------- synthetic: the list itself ---------- */
const YM = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1, latest = YM('2026-09');
const row = (g, ym, o) => Object.assign({ group: g, sale: 3, ym: YM(ym), tier: 'inferred' }, o || {});
const gateOf = (types) => ({ types });
{
  // test 7: the floor is 3 matched resales in 24 months, one named constant
  const tx = [row('2', '2026-01'), row('2', '2025-06'), row('3', '2026-02'), row('3', '2025-03'), row('3', '2024-11', { tier: 'verified' })];
  const m = BR.matchedTypes(tx, latest, [], gateOf({ 2: { ambiguous: 1 }, 3: { ambiguous: 0 } }), 0.8);
  ok(m.length === 1 && m[0].g === '3', 'floor: n24 = 2 is left out and n24 = 3 is listed', m);
  ok(BR.MIN_MATCHED === 3, 'MIN_MATCHED is 3');
  const src = fs.readFileSync(path.join(__dirname, '..', 'build-bedroom-research.js'), 'utf8');
  ok((src.match(/MIN_MATCHED\s*=/g) || []).length === 1 && !/n24\s*[<>]=?\s*3\b|length\s*[<>]=?\s*3\b/.test(src), 'the floor is defined once and never written as a bare 3');
  ok(m[0].n24 === 3 && m[0].n12 === 1 && m[0].last === 202602 && m[0].basis.verified === 1 && m[0].basis.inferred === 2, 'counts, windows, latest month and basis', m[0]);
  ok(m[0].figures === false && m[0].why === 'few' && m[0].couldBe === 0, 'a type not in types is figures:false; why defaults to few; couldBe from the gate', m[0]);
  ok(JSON.stringify(Object.keys(m[0])) === JSON.stringify(KEYS), 'a figures:false entry has exactly the approved keys (test 4)', Object.keys(m[0]));
  // the windows are the same as the transactions': 24 months back from the data month, inclusive of it
  const edge = BR.matchedTypes([row('1', '2024-10'), row('1', '2024-10'), row('1', '2024-10'), row('1', '2024-09')], latest, [], gateOf({}), 0.9);
  ok(edge.length === 1 && edge[0].n24 === 3 && edge[0].n12 === 0, 'Oct 2024 is inside the last 24 months to Sep 2026, Sep 2024 is not', edge);
}
{
  // test 8: coverage uses RULES.minCoverage (0.7), not a copy
  const tx = [row('2', '2026-01'), row('2', '2026-02'), row('2', '2026-03')];
  ok(BR.matchedTypes(tx, latest, [], gateOf({}), 0.699).length === 0 && BR.matchedTypes(tx, latest, [], gateOf({}), 0.7).length === 1, 'coverage 69.9% gives no matched list, 70.0% does');
  const keep = BR.RULES.minCoverage; BR.RULES.minCoverage = 0.75;
  ok(BR.matchedTypes(tx, latest, [], gateOf({}), 0.72).length === 0, 'the threshold is RULES.minCoverage itself (changing it moves the floor)');
  BR.RULES.minCoverage = keep;
}
{
  // test 9: bedroom counts 1-5 only (never Penthouse or a studio); resales only
  const tx = [];
  ['PH', '0', '6'].forEach((g) => { for (let i = 0; i < 6; i++) tx.push(row(g, '2026-0' + (i + 1))); });
  for (let i = 0; i < 6; i++) tx.push(row('2', '2026-0' + (i + 1), { sale: 1 }), row('3', '2026-0' + (i + 1), { sale: 2 }));
  ok(BR.matchedTypes(tx, latest, [], gateOf({}), 1).length === 0, 'no Penthouse, studio, 6-bedroom, new sale or sub-sale is ever matched');
}
{
  // figures and why follow the existing figures (typeFigures), never a new rule
  const tx = []; for (let i = 0; i < 6; i++) tx.push(row('2', '2026-0' + (i + 1)), row('3', '2026-0' + (i + 1)), row('4', '2026-0' + (i + 1)));
  const types = [{ g: '2', figures: true }, { g: '3', figures: false, why: 'ambiguous' }, { g: '4', figures: false, why: 'few' }];
  const m = BR.matchedTypes(tx, latest, types, gateOf({ 2: { ambiguous: 1 }, 3: { ambiguous: 5 }, 4: { ambiguous: 0 } }), 0.9);
  ok(m.map((x) => [x.g, x.figures, x.why, x.couldBe].join(':')).join(' ') === '2:true::1 3:false:ambiguous:5 4:false:few:0', 'figures, why and couldBe follow the gate and the figures', m);
}

/* ---------- test 11: the gate and its inputs are unchanged ---------- */
{
  ok(sha(JSON.stringify(BR.RULES)) === '5b22a1b9f2f67b6f03fc42632ed62a6eb70bd75303beb829110415738fc24fa7', 'RULES are byte-identical to V1.1', BR.RULES);
  ok(sha(H.rentalPossible.toString() + H.completeness.toString()) === 'b272f82d54806024c5e2d2e911be48a7497eb6d71c7ec5f9e2fea08eb24224c6', 'completeness() and rentalPossible() are unchanged (source hash)');
  ok(JSON.stringify(H.rentalPossible({ counts: { 2: 9, 3: 1 } })) === '["2","3"]' && JSON.stringify(H.rentalPossible({ counts: { 2: 19, 3: 1 } })) === '["2"]' && JSON.stringify(H.rentalPossible({ counts: { 2: 3, 3: 1 } })) === '["2","3"]', 'the minority-type rule (10% line, all counts under 5 contracts) is unchanged');
  ok(RW.WINDOW_QUARTERS === 12, 'the rental window is 12 quarters');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gwbm-')), snap = path.join(tmp, 'snapshot.json');
  fs.writeFileSync(snap, JSON.stringify({ asOf: '2026-10-24', latestMonth: '2026-09', comparison: false, rentalWindow: { quarters: 8, from: '24q4', to: '26q3' }, developments: {} }));
  let msg = ''; try { BR.build({ site: ROOT, raw: tmp, snapshot: snap, report: path.join(tmp, 'r') }); } catch (e) { msg = e.message; }
  ok(/12-quarter rental window/.test(msg), 'an 8-quarter snapshot is still refused', msg);
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ---------- the published data ---------- */
const dir = path.join(ROOT, 'data/projects/bedroom'), meta = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const all = {}; let bytes = 0;
fs.readdirSync(dir).forEach((f) => { bytes += fs.statSync(path.join(dir, f)).size; if (/^s\d+\.json$/.test(f)) Object.assign(all, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).projects); });
const ids = Object.keys(all).sort();
ok(meta.rules && meta.rules.minMatched === 3 && sha(JSON.stringify(Object.assign({}, meta.rules, { minMatched: undefined }))) === sha(JSON.stringify(BR.RULES)), 'meta.rules adds minMatched: 3 and nothing else changes');
{
  // test 1: types and few are byte-identical to the live V1.1 data for every development it published (golden from commit c5b6bd3)
  const h = crypto.createHash('sha256'); let n = 0;
  ids.forEach((id) => { const r = all[id].resale; if (!r.types.length) return; n++; h.update(id + '\t' + JSON.stringify({ name: all[id].name, coverage: r.coverage, types: r.types, few: r.few }) + '\n'); });
  ok(n === 550 && h.digest('hex') === 'f99aca6a1963ac3c426a82c679c8f35c60eed749c7af58056a0435b233e1a044', 'types, few, coverage and name are byte-identical to the V1.1 data for its 550 developments', n);
  ok(ids.every((id) => all[id].resale.types.length || (all[id].resale.matched || []).some((m) => !m.figures)), 'a development is published only with figured types or matched-only types');
}
const entries = []; ids.forEach((id) => (all[id].resale.matched || []).forEach((m) => entries.push([id, m])));
{
  // test 2: figures:true <=> in types
  const bad = [];
  ids.forEach((id) => { const r = all[id].resale, tg = r.types.map((t) => t.g), mt = (r.matched || []).filter((m) => m.figures).map((m) => m.g);
    if (tg.join() !== mt.join()) bad.push([id, tg, mt]); });
  ok(!bad.length, 'every figured type is in matched with figures:true, and every figures:true entry is in types', bad.slice(0, 3));
  // tests 4, 5, 9, 10: keys, why, groups; counts only (no area, size, price, psf, layout code or unit-like string)
  const leak = entries.filter(([, m]) => JSON.stringify(Object.keys(m)) !== JSON.stringify(KEYS) || ['1', '2', '3', '4', '5'].indexOf(m.g) < 0 || m.label !== E.groupLabel(m.g) ||
    (m.figures ? m.why !== null : ['ambiguous', 'few'].indexOf(m.why) < 0) || !(Number.isInteger(m.n12) && Number.isInteger(m.n24) && m.n12 <= m.n24 && m.n24 >= 3) ||
    !/^20\d{2}(0[1-9]|1[0-2])$/.test(String(m.last)) || JSON.stringify(Object.keys(m.basis)) !== '["verified","inferred"]' || m.basis.verified + m.basis.inferred !== m.n24 || !Number.isInteger(m.couldBe));
  ok(entries.length > 1000 && !leak.length, 'every matched entry: approved keys only, a bedroom count 1-5, why only ambiguous/few, integer counts with n24 >= 3', leak.slice(0, 3));
  const s = JSON.stringify(entries.map((e) => e[1]));
  ok(!/sqft|sqm|area|price|psf|"coverage"|#\d|\b\d{2}-\d{2,3}\b/.test(s), 'privacy scan: no area, size, price, psf, coverage, layout code or unit-like string in any matched entry');
  ok(ids.every((id) => { const r = all[id].resale; return !r.matched || (Number.isInteger(r.of) && Number.isInteger(r.unknown) && r.unknown <= r.of && r.of - r.unknown >= r.matched.reduce((a, m) => a + m.n24, 0)); }), 'of and unknown: counts, unknown within of, and the matched resales fit inside of minus unknown');
  ok(ids.every((id) => Object.keys(all[id]).join() === 'name,resale' && Object.keys(all[id].resale).join() === (all[id].resale.matched ? 'coverage,of,unknown,types,few,matched' : 'coverage,types,few')), 'record shape: resale only, fields in the approved order');
}
{
  // test 3: n12 and n24 equal the transaction rows (resale, this bedroom count) in the same windows, for every development
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/manifest.json'), 'utf8')), tm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/tx/manifest.json'), 'utf8')), cache = {};
  const bad = [];
  ids.forEach((id) => {
    const k = P.shardName(P.shardOf(id, tm.shards)), sh = cache[k] || (cache[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/tx', k + '.json'), 'utf8')));
    const T = REC.pick(sh, tm, id, man); if (!T) { bad.push([id, 'no transactions']); return; }
    (all[id].resale.matched || []).forEach((m) => { const c = (p) => REC.filter(T.rows, { bed: m.g, bin: 'all', sale: 3, period: p }, T.latest).length; if (c(24) !== m.n24 || c(12) !== m.n12) bad.push([id, m.g, c(24), m.n24, c(12), m.n12]); });
  });
  ok(!bad.length, 'n12 and n24 equal the Transactions rows for every matched entry (' + entries.length + ')', bad.slice(0, 3));
}
{
  // test 12: the fixtures, live-equivalent set (URA download of 5 Oct 2026, the live Research data month); 24 Oct numbers are in the handover
  const fx = (id) => { const r = all[id].resale; return [r.of, r.unknown].join('/') + ' ' + r.matched.map((m) => [m.g, m.n12, m.n24, m.couldBe, m.figures ? 'figures' : m.why].join(':')).join(' '); };
  ok(fx('waterbank-at-dakota') === '32/6 1:5:8:0:figures 2:3:8:4:ambiguous 3:3:10:6:ambiguous', 'Waterbank at Dakota matches the live-equivalent fixture', fx('waterbank-at-dakota'));
  ok(fx('bartley-ridge') === '91/24 1:10:29:0:figures 2:11:23:6:ambiguous 3:8:14:19:ambiguous', 'Bartley Ridge matches the live-equivalent fixture (2-bedroom at 20.7% is matched-only; 4-bedroom, n24 = 1, not listed)', fx('bartley-ridge'));
  ok(all['bartley-ridge'].resale.coverage === 0.736 && all['waterbank-at-dakota'].resale.coverage === 0.813, 'their coverage');
  // test 13: nationwide on the live data month (Claude C's 560 / 438 / 4,040 / 1,981 / 202 are from the 24 Oct download, which adds September sales)
  const fo = entries.filter((e) => !e[1].figures), N = { entries: fo.length, devs: new Set(fo.map((e) => e[0])).size, n24: fo.reduce((a, e) => a + e[1].n24, 0), n12: fo.reduce((a, e) => a + e[1].n12, 0), first: ids.filter((id) => !all[id].resale.types.length).length, figured: entries.filter((e) => e[1].figures).length };
  ok(JSON.stringify(N) === JSON.stringify({ entries: 550, devs: 429, n24: 3871, n12: 1881, first: 194, figured: 853 }), 'nationwide: 550 matched-only entries in 429 developments, 3,871 / 1,881 resales, 194 developments gain their first chip, 853 figured', N);
  ok(meta.counts.withTypes === ids.length && meta.counts.withTypes === 550 + 194, 'manifest counts every published development');
}
{
  // test 14: a record from another data month is ignored
  const sh = { projects: { x: { name: 'X', resale: { coverage: 0.8, of: 10, unknown: 2, types: [], few: [], matched: [{ g: '3', n24: 4, figures: false }] } } } };
  ok(BED.pick(sh, { latestMonth: '2026-08' }, 'x', { latestMonth: '2026-09' }) === null && BED.pick(sh, meta, 'x', { latestMonth: meta.latestMonth }) !== null, 'a record whose latestMonth differs from the Research data is ignored');
  // test 15: shard growth within the stated budget (V1.1: 331,478 bytes, 88,023 gzipped). Proposed in the handover: 15%. Measured: about +70% raw, +35% gzipped.
  ok(bytes <= 331478 * 1.75, 'bedroom data stays within the stated budget (+75% raw)', bytes);
}

/* ---------- private: rebuild and check against the completeness gate ---------- */
if (process.env.GW_BEDS_RAW && process.env.GW_BEDS_SNAPSHOT) {
  const r = BR.build({ site: ROOT, raw: process.env.GW_BEDS_RAW, snapshot: process.env.GW_BEDS_SNAPSHOT });
  const built = {}; Object.values(r.shards).forEach((s) => Object.assign(built, s));
  ok(JSON.stringify(Object.keys(built).sort()) === JSON.stringify(ids) && ids.every((id) => JSON.stringify(built[id]) === JSON.stringify(all[id])) && JSON.stringify(r.meta) === JSON.stringify(meta), 'the published data is exactly what the builder makes from the private inputs');
  const bad = [];
  r.report.filter((x) => x.published).forEach((x) => {
    const pub = built[x.id].resale, gt = x.gate.types;
    if (pub.of !== x.gate.recent || pub.unknown !== x.gate.unclassified) bad.push([x.id, 'of/unknown']);
    if (pub.unknown !== pub.of - Object.keys(gt).reduce((a, g) => a + gt[g].kept, 0)) bad.push([x.id, 'unknown is not of minus every matched group (Penthouse included)']);
    pub.matched.forEach((m) => {
      const t = gt[m.g]; if (!t || t.ambiguous !== m.couldBe || t.kept !== m.n24) { bad.push([x.id, m.g, 'couldBe/kept', t, m]); return; }
      const want = t.ok ? null : t.kept < BR.RULES.minSales ? 'few' : t.share > BR.RULES.maxAmbiguousShare ? 'ambiguous' : 'other';
      if (!m.figures && want !== null && want !== m.why) bad.push([x.id, m.g, 'why', want, m.why]);
      if (!m.figures && want === null && m.why !== 'few') bad.push([x.id, m.g, 'gate passed but no figures: only the typical-price rule, so few', m.why]);
      if (m.figures && !t.ok) bad.push([x.id, m.g, 'figures without the gate']);
    });
  });
  ok(!bad.length, 'of, unknown, couldBe, n24 and why agree with the completeness gate recomputed from the snapshot (tests 5, 6)', bad.slice(0, 4));
} else console.log('  skip the private rebuild: set GW_BEDS_RAW and GW_BEDS_SNAPSHOT (private inputs, outside the repository)');

console.log('bedroom-matched-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
