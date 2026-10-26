// node tools/market-data/tests/bedroom-search-tests.js [--site <folder with data/projects/find-beds.json>]
// Budget Search by bedrooms, resale (proposed): the matching helper on fixed cases, then the shipped/built data against find.json and the
// published bedroom types, then (only with GW_BEDS_RAW + GW_BEDS_SNAPSHOT, private) the builder's refusals.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '../../..');
const F = require(path.join(root, 'assets/js/kpt-find.js')), D = require(path.join(root, 'assets/js/kpt-discover.js')), K = require(path.join(root, 'assets/js/kpt-discover-beds.js'));
const SB = require(path.join(root, 'tools/market-data/build-bedroom-search.js'));
let pass = 0, fail = 0, skip = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

// ---------- fixtures: latest month 2026-09; rows [bin, n, act, last, q1, med, q3]
const row = (bin, n, act, last, q1, q3) => [bin, n, act, last, q1, Math.round((q1 + q3) / 2), q3];
const FP = (id, resale, o) => Object.assign({ id, name: id.toUpperCase(), street: 'ST', d: '15', seg: 'OCR', tg: 1, tl: '99 yrs from 2015', m: 0, new: [], resale }, o || {});
const FIND = (ps) => ({ v: 1, kind: 'kpt-find-index', asOf: '2026-10-05', latestMonth: '2026-09', window: { from: '2025-10', to: '2026-09' }, bin: 100, minCell: 3, projects: ps });
const fig = (q1, q3, o) => Object.assign({ p: [q1 - 1e5, q1, Math.round((q1 + q3) / 2), q3, q3 + 1e5], n: 12, act: 8, last: 202609, from: '2025-10', to: '2026-09', win: 12, sqft: [1000, 1150], v: 0, i: 12 }, o || {});
const BEDS = (projects, o) => Object.assign({ v: 1, kind: 'gw-find-beds', asOf: '2026-10-05', latestMonth: '2026-09', projects }, o || {});
const find = FIND([
  FP('ok3', [row(1000, 8, 5, 202609, 1700000, 1950000), row(700, 6, 4, 202609, 1200000, 1300000)]),
  FP('pricey3', [row(700, 6, 4, 202609, 1200000, 1300000), row(1200, 6, 4, 202609, 2400000, 2600000)]),
  FP('mixed3', [row(1000, 6, 4, 202609, 1600000, 1800000)]),
  FP('lowcov', [row(1000, 6, 4, 202609, 1600000, 1800000)]),
  FP('nocls', [row(1000, 6, 4, 202609, 1600000, 1800000)], { c: 'cluster' }),
  FP('small', [row(600, 6, 4, 202609, 1000000, 1100000)]),
  FP('old3', [row(1000, 6, 4, 202609, 1600000, 1800000)]),
  FP('free5', [row(2000, 6, 4, 202609, 2800000, 2950000)], { tg: 4, tl: 'Freehold' }),
]);
const beds = BEDS({
  ok3: { c: 0.9, t: { 2: { s: 'ok', f: fig(1200000, 1300000, { sqft: [700, 760] }), b: [row(700, 6, 4, 202609, 1200000, 1300000)] }, 3: { s: 'ok', f: fig(1700000, 1950000), b: [row(1000, 8, 5, 202609, 1700000, 1950000)] } }, u: [] },
  pricey3: { c: 0.95, t: { 2: { s: 'ok', f: fig(1200000, 1300000, { sqft: [700, 760] }), b: [] }, 3: { s: 'ok', f: fig(2400000, 2600000, { sqft: [1200, 1290] }), b: [row(1200, 6, 4, 202609, 2400000, 2600000)] } }, u: [] },
  mixed3: { c: 0.8, t: { 3: { s: 'mixed', m: [row(1000, 6, 4, 202609, 1600000, 1800000)], x: 6, k: 4 } }, u: [] },
  lowcov: { c: 0.4, t: { 2: { s: 'coverage', m: [row(700, 3, 2, 202609, 900000, 950000)], x: 3, k: 3 } }, u: [row(1000, 6, 4, 202609, 1600000, 1800000)] },
  nocls: { c: null, t: {}, u: [row(1000, 6, 4, 202609, 1600000, 1800000)] },
  small: { c: 0.92, t: { 1: { s: 'ok', f: fig(1000000, 1100000, { sqft: [560, 640] }), b: [] } }, u: [] },
  old3: { c: 0.9, t: { 3: { s: 'ok', f: fig(1500000, 1700000, { last: 202601, win: 24, from: '2024-10' }), b: [] } }, u: [] },
  free5: { c: 0.9, t: { 6: { s: 'ok', f: fig(2700000, 2900000, { sqft: [2000, 2100] }), b: [] } }, u: [] },
});
const ix = F.prepare(find), bx = K.prepare(beds, find), B = 2000000;
const st = (id, n, b, ms) => K.match(ix, bx, id, n, b || B, ms || null);

console.log('One development, one bedroom count');
t('reliable: the confirmed type\'s middle half is within the maximum, with Research\'s own figures', () => {
  const m = st('ok3', 3); assert.strictEqual(m.state, 'reliable'); assert.strictEqual(m.tier, 'typical');
  assert.deepStrictEqual([m.ura.q1, m.ura.med, m.ura.q3, m.ura.n, m.ura.from, m.ura.to], [1700000, 1825000, 1950000, 12, '2025-10', '2026-09']);
});
t('reliable "some": only the lower quarter is within the maximum', () => { const m = st('ok3', 3, 1800000); assert.strictEqual(m.state, 'reliable'); assert.strictEqual(m.tier, 'some'); });
t('not a match: smaller homes fit the budget but the 3-bedroom type is above it', () => { const m = st('pricey3', 3); assert.strictEqual(m.state, 'none'); assert.strictEqual(m.why, 'above'); assert.strictEqual(st('pricey3', 2).state, 'reliable'); });
t('not a match: well classified (70%+) and no recent resale of this count', () => { const m = st('ok3', 4); assert.strictEqual(m.state, 'none'); assert.strictEqual(m.why, 'absent'); });
t('not a match: the confirmed type has no sale in the last 6 months (Budget Search\'s recency rule)', () => { const m = st('old3', 3); assert.strictEqual(m.state, 'none'); assert.strictEqual(m.why, 'stale'); });
t('insufficient evidence: an unconfirmed count is never reported as reliable, and carries how many resales are identified', () => {
  const m = st('mixed3', 3); assert.strictEqual(m.state, 'insufficient'); assert.strictEqual(m.why, 'mixed'); assert.strictEqual(m.ura.could, 6); assert.strictEqual(m.ura.identified, 4);
});
t('unclassified: under 70% classified and no bedroom evidence for the in-budget resales', () => { assert.strictEqual(st('lowcov', 3).state, 'unclassified'); assert.strictEqual(st('nocls', 3).state, 'unclassified'); assert.strictEqual(st('nocls', 3).why, 'not classified'); });
t('a low-coverage development still answers for a count it has evidence for', () => assert.strictEqual(st('lowcov', 2).state, 'insufficient'));
t('minimum size: a type entirely under it is not a match; a type entirely over it keeps Research\'s figures', () => {
  assert.strictEqual(st('small', 1, B, 800).why, 'small'); const m = st('ok3', 3, B, 950); assert.strictEqual(m.state, 'reliable'); assert.ok(!m.sized);
});
t('minimum size cutting through a type: decided on its own 12-month bands at or above it, and says so', () => {
  const m = st('ok3', 3, B, 1050); assert.strictEqual(m.state, 'reliable'); assert.strictEqual(m.sized, true); assert.strictEqual(m.ura.win, 12);
  assert.strictEqual(st('ok3', 3, B, 1200).why, 'small');
});
t('5 means 5 or more bedrooms', () => { assert.strictEqual(K.match(ix, bx, 'free5', 5, 3000000, null).state, 'reliable'); assert.strictEqual(K.match(ix, bx, 'free5', 4, 3000000, null).state, 'none'); });
t('bad input: no development record or a count outside 1-5', () => { assert.strictEqual(st('zzz', 3).state, 'nodata'); assert.strictEqual(st('ok3', 7).state, 'nodata'); });

console.log('Data source');
t('prepare refuses another URA download (as-of or month differs), another kind, or nothing', () => {
  assert.ok(K.prepare(beds, find)); assert.strictEqual(K.prepare(Object.assign({}, beds, { asOf: '2026-10-24' }), find), null);
  assert.strictEqual(K.prepare(Object.assign({}, beds, { latestMonth: '2026-08' }), find), null); assert.strictEqual(K.prepare(Object.assign({}, beds, { kind: 'x' }), find), null); assert.strictEqual(K.prepare(null, find), null);
});

console.log('The resale search with a bedroom count');
const R = (rq, ctx) => K.resale(ix, bx, Object.assign({ budget: B, beds: 3 }, rq), ctx || {});
t('$2m, 3 bedrooms: reliable, insufficient and unclassified are kept apart; not-a-match is counted by reason', () => {
  const r = R({}); assert.deepStrictEqual(r.reliable.map((i) => i.id), ['ok3']); assert.deepStrictEqual(r.insufficient.map((i) => i.id), ['mixed3']);
  assert.deepStrictEqual(r.unclassified.ids.sort(), ['lowcov', 'nocls']); assert.strictEqual(r.excluded.above, 1); assert.strictEqual(r.excluded.stale, 1);
  assert.strictEqual(r.reliable[0].beds.state, 'reliable'); assert.strictEqual(r.insufficient[0].beds.state, 'insufficient'); assert.strictEqual(r.state, 'ok');
});
t('today\'s filters still apply (property class, tenure), through kpt-discover.js', () => {
  assert.deepStrictEqual(R({ type: 'cluster' }).unclassified.ids, ['nocls']); assert.strictEqual(R({ type: 'cluster' }).reliable.length, 0);
  assert.deepStrictEqual(K.resale(ix, bx, { budget: 3000000, beds: 5, tenure: 'free' }, {}).reliable.map((i) => i.id), ['free5']);
});
t('up to 5% over: only reliable types, only when asked, kept apart', () => {
  const r = K.resale(ix, bx, { budget: 1880000, beds: 3, over: true }, {}); assert.deepStrictEqual(r.reliable.map((i) => [i.id, i.tier]), [['ok3', 'some']]);
  const r2 = K.resale(ix, bx, { budget: 2480000, beds: 3, over: true }, {}); assert.ok(r2.reliable.some((i) => i.id === 'pricey3'));
  const r3 = K.resale(ix, bx, { budget: 2300000, beds: 3, over: true }, {}); assert.ok(r3.over.some((i) => i.id === 'pricey3' && i.tier === 'over'));
  assert.strictEqual(K.resale(ix, bx, { budget: 2300000, beds: 3 }, {}).over.length, 0);
});
t('no bedroom data: "nodata", so the page keeps today\'s behaviour', () => assert.strictEqual(K.resale(ix, null, { budget: B, beds: 3 }, {}).state, 'nodata'));

// ---------- the built file (shipped, or --site <scratch build>)
const ai = process.argv.indexOf('--site'), site = ai > -1 ? path.resolve(process.argv[ai + 1]) : root;
const fb = path.join(site, 'data/projects/find-beds.json');
if (!fs.existsSync(fb)) { skip++; console.log('  skip built-data checks: ' + path.relative(process.cwd(), fb) + ' not built yet (refresh-all.js --snapshot builds it)'); }
else {
  console.log('Built data: ' + path.relative(process.cwd(), fb));
  const doc = JSON.parse(fs.readFileSync(fb, 'utf8')), fd = JSON.parse(fs.readFileSync(path.join(site, 'data/projects/find.json'), 'utf8'));
  const bdir = path.join(site, 'data/projects/bedroom'), pubT = {};
  fs.readdirSync(bdir).filter((f) => /^s\d+\.json$/.test(f)).forEach((f) => { const ps = JSON.parse(fs.readFileSync(path.join(bdir, f), 'utf8')).projects; Object.keys(ps).forEach((id) => { ((ps[id].resale || {}).types || []).forEach((x) => { pubT[id + '|' + x.g] = x; }); }); });
  const fx = F.prepare(fd), kx = K.prepare(doc, fd), byId = new Map(fd.projects.map((p) => [p.id, p]));
  t('same URA download as find.json and the bedroom types', () => { assert.ok(kx, 'prepare refused it'); assert.strictEqual(doc.classifiedAsOf, JSON.parse(fs.readFileSync(path.join(bdir, 'manifest.json'), 'utf8')).classifiedAsOf); });
  t('every development has resale rows in find.json; every band is a find.json band of the same width, newest month within the window', () => {
    Object.keys(doc.projects).forEach((id) => {
      const fp = byId.get(id); assert.ok(fp && fp.resale.length, id);
      const p = doc.projects[id], all = [].concat(p.u, ...Object.values(p.t).map((e) => (e.b || []).concat(e.m || [])));
      all.forEach((r) => { assert.strictEqual(r.length, 7); assert.strictEqual(r[0] % 100, 0); assert.ok(r[1] >= 3 && r[4] <= r[5] && r[5] <= r[6] && r[3] <= 202609 && r[3] >= 202510, id + ' ' + r); });
    });
  });
  t('a "reliable" count is exactly a type Research publishes, with the same figures; and every published type is here', () => {
    let n = 0; Object.keys(doc.projects).forEach((id) => Object.keys(doc.projects[id].t).forEach((g) => {
      const e = doc.projects[id].t[g]; if (e.s !== 'ok') return; n++; const x = pubT[id + '|' + g]; assert.ok(x, id + ' ' + g);
      assert.deepStrictEqual([e.f.p, e.f.n, e.f.last, e.f.win, e.f.sqft], [x.price, x.n, x.last, x.win, x.sqft], id + ' ' + g);
    }));
    const inFind = Object.keys(pubT).filter((k) => doc.projects[k.split('|')[0]]); assert.strictEqual(n, inFind.length);
  });
  t('statuses are the five documented ones; unconfirmed counts carry identified <= could-be', () => {
    Object.values(doc.projects).forEach((p) => Object.values(p.t).forEach((e) => { assert.ok(['ok', 'few', 'mixed', 'coverage', 'possible'].indexOf(e.s) > -1); if (e.s !== 'ok') assert.ok(e.k <= e.x && e.m.length); }));
  });
  t('aggregates only: no per-sale rows, areas, layout codes, snapshot or rental figures', () => {
    const s = JSON.stringify(doc); ['"sqm"', '"map"', '"codes"', '"rent"', '"possible":[', '"areaRaw"'].forEach((k) => assert.ok(s.indexOf(k) < 0, k));
  });
  t('every reliable match at $1m-$4m, 1-5 bedrooms, has its figures within the maximum for its tier', () => {
    [1e6, 1.5e6, 2e6, 3e6, 4e6].forEach((b) => [1, 2, 3, 4, 5].forEach((n) => {
      const r = K.resale(fx, kx, { budget: b, beds: n }, {});
      r.reliable.forEach((i) => assert.ok(i.tier === 'typical' ? i.ura.q3 <= b : i.ura.q1 <= b, i.id));
      r.insufficient.forEach((i) => assert.ok(i.ura.q1 <= b));
    }));
  });
}

// ---------- the builder's refusals (private inputs only)
const RAW = process.env.GW_BEDS_RAW, SNAP = process.env.GW_BEDS_SNAPSHOT;
if (!RAW || !SNAP || !fs.existsSync(path.join(site, 'data/projects/find-beds.json'))) { skip++; console.log('  skip builder refusals: set GW_BEDS_RAW and GW_BEDS_SNAPSHOT (private) and --site <a built site>'); }
else {
  console.log('Builder refusals');
  const rep = fs.mkdtempSync(path.join(os.tmpdir(), 'beds-rep-'));
  t('rebuilding from the same inputs gives the same file', () => {
    const r = SB.build({ raw: RAW, snapshot: SNAP, site, report: rep }), fresh = JSON.stringify(Object.assign({}, r.meta, { projects: r.projects }));
    assert.strictEqual(fresh, fs.readFileSync(fb, 'utf8'));
  });
  t('refuses site bedroom figures from another run', () => {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'beds-site-'));
    fs.cpSync(path.join(site, 'data/projects'), path.join(copy, 'data/projects'), { recursive: true });
    const sh = fs.readdirSync(path.join(copy, 'data/projects/bedroom')).filter((f) => /^s\d+\.json$/.test(f)).find((f) => Object.keys(JSON.parse(fs.readFileSync(path.join(copy, 'data/projects/bedroom', f), 'utf8')).projects).length);
    const p = path.join(copy, 'data/projects/bedroom', sh), d = JSON.parse(fs.readFileSync(p, 'utf8')), id = Object.keys(d.projects)[0];
    d.projects[id].resale.types[0].price[2] += 1000; fs.writeFileSync(p, JSON.stringify(d));
    assert.throws(() => SB.build({ raw: RAW, snapshot: SNAP, site: copy, report: rep }), /another URA download/);
    fs.rmSync(copy, { recursive: true, force: true });
  });
  t('refuses a report folder inside the site', () => assert.throws(() => SB.build({ raw: RAW, snapshot: SNAP, site, report: path.join(site, 'x') }), /private folder outside the site/));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed' + (skip ? ', ' + skip + ' groups skipped' : ''));
process.exit(fail ? 1 : 0);
