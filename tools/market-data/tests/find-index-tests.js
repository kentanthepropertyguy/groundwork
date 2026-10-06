// node tools/market-data/tests/find-index-tests.js [--raw <folder of raw URA .json files>]
// Part 1 uses SYNTHETIC records only. Part 2 checks data/projects/find.json against the shipped project data. Part 3 re-derives every row from the RAW
// transactions with a second, independent implementation; it runs when a raw folder is given (--raw, or RAW=, or tools/market-data/raw exists).
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const F = require('../build-find-index.js'), PS = require('../build-project-stats.js');
const root = path.join(__dirname, '..', '..', '..'), cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8')), pc = JSON.parse(fs.readFileSync(path.join(__dirname, '../project-config.json'), 'utf8'));
let pass = 0, fail = 0, skip = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const sqm = (sqft) => String(sqft / 10.7639);

/* ---------------------------------------------------------------- part 1: synthetic */
console.log('FIND index: synthetic records');
const idxDoc = (names) => ({ fields: ['id', 'name', 'street', 'district', 'seg', 'tenGroup', 'tenLabel', 'mixed', 'n', 'first', 'last', 'active', 'new', 'sub', 'resale', 'shard'],
  rows: names.map((n) => [require('../../../assets/js/kpt-project.js').slugify(n), n, 'S', '19', 'OCR', 2, '99 yrs from 2010', 0, 1, '2021-09', '2026-06', 1, 0, 0, 1, 0]) });
const tx = (o) => Object.assign({ project: 'SYN ONE', street: 'S', marketSegment: 'OCR', contractDate: '0626', area: sqm(980), price: '1500000', propertyType: 'Condominium', typeOfArea: 'Strata', tenure: '99 yrs lease commencing from 2010', typeOfSale: '3', noOfUnits: '1', district: '19' }, o || {});
const many = (n, f) => Array.from({ length: n }, (_, i) => tx(f(i)));
const run = (recs, names) => F.buildFindIndex(recs, cfg, pc, idxDoc(names || ['SYN ONE', 'SYN TWO']), '2026-10-05');
t('known prices give known quartiles (linear interpolation), count, active months and latest month', () => {
  const r = run(many(101, (i) => ({ price: String(1000000 + i * 5000), contractDate: i < 50 ? '0526' : '0626' })));
  const row = r.doc.projects[0].resale[0]; assert.deepStrictEqual(row, [900, 101, 2, 202606, 1125000, 1250000, 1375000]);
});
t('a band with 2 sales is never written (suppression); 3 sales is', () => {
  assert.strictEqual(run(many(2, () => ({})).concat(many(5, () => ({ project: 'SYN TWO', area: sqm(1500) })))).doc.projects.length, 1);
  const r3 = run(many(3, () => ({}))); assert.strictEqual(r3.doc.projects[0].resale.length, 1);
});
t('suppressed sales are counted and reconcile with written ones', () => { const r = run(many(2, () => ({})).concat(many(4, () => ({ project: 'SYN TWO', area: sqm(1500) })))); assert.strictEqual(r.stats.txSuppressed, 2); assert.strictEqual(r.stats.txInWrittenRows, 4); assert.strictEqual(r.stats.recentInScope, 6); });
t('window is exactly the last 12 months ending on the latest month (Aug 2025 is in, Jul 2025 is out, for a Jul 2026 latest)', () => {
  const r = run(many(3, () => ({ contractDate: '0726' })).concat(many(3, () => ({ contractDate: '0825', area: sqm(1450) })), many(3, () => ({ contractDate: '0725', area: sqm(2050) }))));
  assert.strictEqual(r.doc.latestMonth, '2026-07'); assert.strictEqual(r.doc.window.from, '2025-08'); assert.deepStrictEqual(r.doc.projects[0].resale.map((x) => x[0]), [900, 1400]); assert.strictEqual(r.stats.recentInScope, 6);
});
t('sub-sale and excluded or held names are left out; new sale and resale are kept separate', () => {
  const r = run(many(5, () => ({ typeOfSale: '2' })).concat(many(5, () => ({ project: pc.exclude[0].name })), many(5, () => ({ project: pc.hold[0].name })), many(3, () => ({ typeOfSale: '1' })), many(4, () => ({}))));
  assert.strictEqual(r.doc.projects.length, 1); assert.strictEqual(r.doc.projects[0].new.length, 1); assert.strictEqual(r.doc.projects[0].resale.length, 1);
});
t('same filters as the project data: landed, multi-unit and non-strata rows are ignored', () => {
  const r = run(many(5, () => ({ propertyType: 'Terrace' })).concat(many(5, () => ({ noOfUnits: '2' })), many(5, () => ({ typeOfArea: 'Land' })), many(3, () => ({}))));
  assert.strictEqual(r.stats.recentInScope, 3);
});
t('deterministic: identical input gives byte-identical output', () => { const a = run(many(8, (i) => ({ price: String(1e6 + i * 1000) }))), b = run(many(8, (i) => ({ price: String(1e6 + i * 1000) }))); assert.strictEqual(JSON.stringify(a.doc), JSON.stringify(b.doc)); });
t('a project missing from index.json aborts the build', () => { assert.throws(() => run(many(3, () => ({})), ['OTHER']), /missing from index\.json/); });
t('a latest month that differs from the shipped manifest aborts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-')); fs.mkdirSync(path.join(dir, 'detail')); fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ latestMonth: '2026-05' })); fs.writeFileSync(path.join(dir, 'detail', 's00.json'), JSON.stringify({ projects: {} }));
  assert.throws(() => F.checkAgainstProjectData(run(many(3, () => ({}))), dir), /differs from data\/projects\/manifest\.json/);
});
t('a transaction count that differs from the existing build aborts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-')); fs.mkdirSync(path.join(dir, 'detail')); fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ latestMonth: '2026-06' })); fs.writeFileSync(path.join(dir, 'detail', 's00.json'), JSON.stringify({ projects: { x: { periodCells: [[3, 900, 0, 99, 1, 1, 202606, 1, 1, 1, 1, 1]] } } }));
  assert.throws(() => F.checkAgainstProjectData(run(many(3, () => ({}))), dir), /differ from the existing build/);
});

/* ---------------------------------------------------------------- part 2: shipped file vs shipped project data */
console.log('FIND index: data/projects/find.json against the shipped project data');
const dataDir = path.join(root, 'data', 'projects'), findPath = path.join(dataDir, 'find.json');
if (!fs.existsSync(findPath)) { console.log('  skip no data/projects/find.json'); skip++; } else {
  const P = require('../../../assets/js/kpt-project.js'), find = JSON.parse(fs.readFileSync(findPath, 'utf8')), man = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));
  const det = {}; for (let i = 0; i < man.shards; i++) Object.assign(det, JSON.parse(fs.readFileSync(path.join(dataDir, 'detail', P.shardName(i) + '.json'), 'utf8')).projects);
  const idx = JSON.parse(fs.readFileSync(path.join(dataDir, 'index.json'), 'utf8')), ids = new Set(idx.rows.map((r) => r[0]));
  const rowsOf = (p) => [['new', 1], ['resale', 3]].reduce((a, [k, c]) => a.concat(p[k].map((r) => ({ id: p.id, sale: c, r }))), []);
  const all = find.projects.reduce((a, p) => a.concat(rowsOf(p)), []);
  t('header: version, window equals the latest 12 months of the shipped data, minimum band size 3, aggregates-only note', () => {
    assert.strictEqual(find.v, 1); assert.strictEqual(find.latestMonth, man.latestMonth); assert.strictEqual(find.window.to, man.latestMonth); assert.strictEqual(find.window.from, man.periods[0].from); assert.strictEqual(find.minCell, 3); assert.strictEqual(find.bin, man.bin); assert.ok(/Aggregates only/.test(find.note));
    assert.deepStrictEqual(find.fields, ['bin', 'n', 'act', 'last', 'q1', 'med', 'q3']);
  });
  t('every project exists in index.json; ids and names agree', () => { find.projects.forEach((p) => { assert.ok(ids.has(p.id), p.id); const r = idx.rows.find((x) => x[0] === p.id); assert.strictEqual(r[1], p.name); }); });
  t('SUPPRESSION: no row has fewer than 3 sales', () => { assert.ok(all.length > 500); all.forEach((x) => assert.ok(x.r[1] >= 3, x.id)); });
  t('PARITY: every row’s sales count and latest month equal the existing latest-12-month cell', () => {
    all.forEach((x) => { const c = det[x.id].periodCells.find((r) => r[0] === x.sale && r[1] === x.r[0] && r[2] === 0); assert.ok(c, x.id + ' ' + x.r[0]); assert.strictEqual(c[3], x.r[1], x.id + ' n'); assert.strictEqual(c[6], x.r[3], x.id + ' last'); assert.strictEqual(c[4], x.r[2], x.id + ' active months'); });
  });
  t('SET EQUALITY: rows are exactly the existing recent new/resale bands with 3+ sales (none missing, none extra)', () => {
    const want = new Set(); Object.keys(det).forEach((id) => det[id].periodCells.forEach((r) => { if (r[2] === 0 && (r[0] === 1 || r[0] === 3) && r[3] >= 3) want.add(id + '|' + r[0] + '|' + r[1]); }));
    const have = new Set(all.map((x) => x.id + '|' + x.sale + '|' + x.r[0])); assert.strictEqual(have.size, all.length, 'duplicate rows'); assert.deepStrictEqual(Array.from(have).sort(), Array.from(want).sort());
  });
  t('CONSISTENCY: prices agree with the existing PSF figures (median within median PSF x band edges; quartiles within PSF min/max x band edges), 1% tolerance', () => {
    all.forEach((x) => { const c = det[x.id].periodCells.find((r) => r[0] === x.sale && r[1] === x.r[0] && r[2] === 0), bin = x.r[0];
      assert.ok(x.r[5] >= c[9] * bin * 0.99 && x.r[5] <= c[9] * (bin + 100) * 1.01, x.id + ' median'); assert.ok(x.r[4] >= c[7] * bin * 0.99 && x.r[6] <= c[11] * (bin + 100) * 1.01, x.id + ' range'); assert.ok(x.r[4] <= x.r[5] && x.r[5] <= x.r[6], x.id + ' order'); });
  });
  t('rows are in ascending size band within each project and sale type, with no duplicates; projects are sorted by name', () => {
    for (let i = 1; i < find.projects.length; i++) assert.ok(find.projects[i - 1].name <= find.projects[i].name);
    find.projects.forEach((p) => ['new', 'resale'].forEach((k) => { for (let i = 1; i < p[k].length; i++) assert.ok(p[k][i - 1][0] < p[k][i][0], p.id + ' ' + k); }));
  });
  t('no individual-deal fields: only aggregate keys exist, and every row is exactly 7 numbers', () => {
    const keys = new Set(); (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') Object.keys(o).forEach((k) => { keys.add(k); walk(o[k]); }); })(find);
    const allowed = ['v', 'kind', 'asOf', 'latestMonth', 'window', 'from', 'to', 'label', 'bin', 'minCell', 'sales', 'fields', 'source', 'scope', 'note', 'projects', 'id', 'name', 'street', 'd', 'seg', 'tg', 'tl', 'm', 'new', 'resale'];
    keys.forEach((k) => assert.ok(allowed.indexOf(k) > -1, 'unexpected key ' + k)); all.forEach((x) => { assert.strictEqual(x.r.length, 7); x.r.forEach((v) => assert.ok(Number.isFinite(v))); });
  });
  t('size budget: under 250 KB raw', () => assert.ok(fs.statSync(findPath).size < 250000));

  /* ------------------------------------------------------------ part 3: independent re-derivation from the RAW transactions */
  console.log('FIND index: independent re-derivation from the raw URA transactions');
  const ai = process.argv.indexOf('--raw'), rawDir = ai > -1 ? process.argv[ai + 1] : (process.env.RAW || path.join(__dirname, '..', 'raw'));
  if (!fs.existsSync(rawDir) || !fs.readdirSync(rawDir).some((f) => f.endsWith('.json'))) { console.log('  skip no raw folder (pass --raw <folder>)'); skip++; } else {
    // second implementation: own parsing, own filters, own month arithmetic, own quantile (written differently on purpose)
    const bad = new Set(pc.exclude.concat(pc.hold).map((e) => e.name)), mine = new Map(); let latestM = 0; const rows = [];
    fs.readdirSync(rawDir).filter((f) => f.endsWith('.json')).sort().forEach((f) => JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8')).Result.forEach((p) => p.transaction.forEach((x) => {
      if (cfg.propertyTypes.indexOf(x.propertyType) < 0 || x.typeOfArea !== 'Strata' || x.noOfUnits !== '1' && String(x.noOfUnits) !== '1') return;
      if (['1', '2', '3'].indexOf(String(x.typeOfSale)) < 0 || ['OCR', 'RCR', 'CCR'].indexOf(p.marketSegment) < 0 || bad.has(p.project) || !String(p.project || '').trim()) return;
      const price = +x.price, area = +x.area; if (!(price > 0 && area > 0) || !/^\d{4}$/.test(x.contractDate)) return;
      const month = 2000 + parseInt(x.contractDate.slice(2), 10), mo = parseInt(x.contractDate.slice(0, 2), 10), mm = month * 12 + mo; if (mm > latestM) latestM = mm;
      rows.push({ name: p.project, sale: +x.typeOfSale, price, band: Math.floor(area * 10.7639 / 100) * 100, mm, ym: month * 100 + mo });
    })));
    rows.filter((r) => r.sale !== 2 && r.mm > latestM - 12).forEach((r) => { const k = r.name + '|' + r.sale + '|' + r.band; (mine.get(k) || mine.set(k, []).get(k)).push(r); });
    const quart = (arr, q) => { const a = arr.slice().sort((u, v) => u - v), h = (a.length - 1) * q, f = Math.floor(h); return f + 1 < a.length ? a[f] + (h - f) * (a[f + 1] - a[f]) : a[f]; };
    const ours = new Map(); find.projects.forEach((p) => rowsOf(p).forEach((x) => ours.set(p.name + '|' + x.sale + '|' + x.r[0], x.r)));
    t('RECOMPUTE: every row (count, active months, latest month, Q1, median, Q3) equals an independent recomputation from the raw transactions', () => {
      let n = 0; ours.forEach((r, k) => { const g = mine.get(k); assert.ok(g, 'no raw transactions for ' + k); const prices = g.map((x) => x.price); n++;
        assert.deepStrictEqual(r, [+k.split('|')[2], g.length, new Set(g.map((x) => x.ym)).size, Math.max.apply(null, g.map((x) => x.ym)), Math.round(quart(prices, 0.25)), Math.round(quart(prices, 0.5)), Math.round(quart(prices, 0.75))], k); });
      assert.ok(n > 1000, 'rows checked: ' + n);
    });
    t('COMPLETENESS: every raw band with 3+ sales is in the file, and no raw band with fewer than 3 is', () => {
      mine.forEach((g, k) => { assert.strictEqual(ours.has(k), g.length >= 3, k + ' (' + g.length + ' sales)'); });
    });
    t('RECONCILIATION: transactions in written rows + suppressed = in-scope recent transactions', () => {
      let inScope = 0, written = 0; mine.forEach((g, k) => { inScope += g.length; if (g.length >= 3) written += g.length; });
      let fileTx = 0; ours.forEach((r) => { fileTx += r[1]; }); assert.strictEqual(fileTx, written); assert.ok(inScope > fileTx); console.log('       in scope ' + inScope + ', written ' + fileTx + ', suppressed ' + (inScope - fileTx) + ' (' + (100 * (inScope - fileTx) / inScope).toFixed(1) + '%)');
    });
    t('the shipped file is byte-identical to a fresh build from the same raw files', () => {
      const fresh = F.buildFindIndex(PS.flatten(fs.readdirSync(rawDir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8')))), cfg, pc, idx, find.asOf);
      assert.strictEqual(JSON.stringify(fresh.doc), fs.readFileSync(findPath, 'utf8'));
    });
  }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (skip ? ', ' + skip + ' section(s) skipped' : '')); process.exit(fail ? 1 : 0);
