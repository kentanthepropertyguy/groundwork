// node tools/market-data/tests/brochure-pipeline-tests.js : the source-independent brochure layer (matching, permission, robots, adapters),
// the coverage-gain queue, the extractor's corpus gate, document readings and the separated measures. Synthetic data only; no network.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const N = require('../name-match.js'), F = require('../fetch-cache.js'), S = require('../brochure-sources.js'), QU = require('../brochure-queue.js');
const XC = require('../extractor-corpus.js'), BB = require('../brochure-batch.js'), M = require('../bedroom-metrics.js'), PL = require('../brochure-pipeline.js');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-bp-'));

console.log('Names');
const URA = ['THE SAIL @ MARINA BAY', "D'LEEDON", 'ONE-NORTH RESIDENCES', 'CHUAN PARK', 'CHUAN PARK (DEMOLISHED)', 'PARC CANBERRA', 'WATTEN ESTATE CONDOMINIUM', 'THE TAPESTRY', 'TAPESTRY', 'LUMEN GROVE'];   // the last is invented: the export fixture's figures are made up
const match = N.matcher(URA);
t('a slug matches its URA name: "the", "@", apostrophes and hyphens do not matter', () => {
  assert.deepStrictEqual(match('the sail marina bay'), { project: 'THE SAIL @ MARINA BAY', score: 1, how: 'exact' });
  assert.strictEqual(match('dleedon').project, "D'LEEDON"); assert.strictEqual(match('one north residences').project, 'ONE-NORTH RESIDENCES');
  assert.strictEqual(match('the chuan park').project, 'CHUAN PARK');   // URA names the 2024 development without "The"
});
t('qualifier words (ec, enbloc, condominium) match only when nothing matches exactly', () => {
  assert.deepStrictEqual(match('parc canberra ec'), { project: 'PARC CANBERRA', score: 0.9, how: 'qualifiers' });
  assert.strictEqual(match('watten estate condominium enbloc').project, 'WATTEN ESTATE CONDOMINIUM');
});
t('a name that fits two developments is ambiguous and never matched; unknown names are not matched', () => {
  assert.deepStrictEqual(match('the tapestry').ambiguous, ['TAPESTRY', 'THE TAPESTRY']);
  assert.strictEqual(match('1 buroh lane rental'), null); assert.strictEqual(match('chuan park demolished').project, 'CHUAN PARK (DEMOLISHED)');
});

console.log('Sources');
t('robots.txt: the longest matching rule wins, Allow wins a tie, an empty Disallow allows all', () => {
  const r = F.robotsRules('User-agent: googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private/\nAllow: /private/brochures/\nDisallow: /*.zip$');
  assert.strictEqual(F.robotsAllows(r, '/product/x/'), true); assert.strictEqual(F.robotsAllows(r, '/private/x.pdf'), false);
  assert.strictEqual(F.robotsAllows(r, '/private/brochures/x.pdf'), true); assert.strictEqual(F.robotsAllows(r, '/a/b.zip'), false);
  assert.strictEqual(F.robotsAllows(F.robotsRules('User-agent: *\nDisallow:'), '/anything'), true);
});
t('a source without a recorded permission is skipped; every kind reads offline from the store', () => {
  const store = path.join(tmp, 'store'); fs.mkdirSync(path.join(store, 'inbox'), { recursive: true }); fs.mkdirSync(path.join(store, 'exports'), { recursive: true });
  const fx = F.fetcher({ dir: path.join(store, 'web'), offline: true }), sm = fx.fileFor('https://idx.test/sitemap.xml', '.xml');
  fs.mkdirSync(path.dirname(sm), { recursive: true });
  fs.writeFileSync(sm, '<urlset><url><loc>https://idx.test/p/the-sail-marina-bay/</loc></url><url><loc>https://idx.test/p/the-tapestry/</loc></url><url><loc>https://idx.test/blog/x/</loc></url></urlset>');
  fs.writeFileSync(path.join(store, 'links.csv'), 'url,project,page\nhttps://dev.test/files/Parc-Canberra-Floor-Plans.pdf,,\n');
  fs.writeFileSync(path.join(store, 'inbox', 'dleedon__blk-3.pdf'), '%PDF');
  fs.writeFileSync(path.join(store, 'exports', 'x.csv'), 'project,code,bedrooms,sqm\nLumen Grove,A1,1,50\nLumen Grove,B1,2,70\n');
  const cfg = { sources: [
    { id: 'idx', kind: 'index', permission: 'test', sitemaps: ['https://idx.test/sitemap.xml'], page: '^https://idx\\.test/p/([^/]+)/$', documents: 'href="([^"]+\\.pdf)"' },
    { id: 'dev', kind: 'url-list', permission: 'test', file: 'links.csv' }, { id: 'in', kind: 'folder', permission: 'test', dir: 'inbox' },
    { id: 'ex', kind: 'layout-export', permission: 'test', file: 'exports/x.csv' }, { id: 'nope', kind: 'url-list', file: 'links.csv' }] };
  const cat = S.discover(cfg, URA, { store, offline: true }), by = S.byProject(cat);
  assert.strictEqual(cat.sources.find((s) => s.id === 'nope').skipped, 'no permission recorded');
  assert.deepStrictEqual(Array.from(by.keys()).sort(), ["D'LEEDON", 'LUMEN GROVE', 'PARC CANBERRA', 'THE SAIL @ MARINA BAY']);
  assert.strictEqual(cat.sources.find((s) => s.id === 'idx').ambiguous.length, 1);   // "the-tapestry" could be either development
  assert.strictEqual(by.get('PARC CANBERRA')[0].how, 'exact'); assert.strictEqual(by.get('LUMEN GROVE')[0].kind, 'table');
});
t('document names: common document words are dropped before matching', () => { assert.strictEqual(S.docName('https://x/Parc-Canberra-E-Brochure-Final.pdf'), 'Parc Canberra'); });

console.log('Queue');
const report = { latestMonth: '2026-09', developments: [
  { project: 'A', cls: 'condo', layoutsTrusted: false, mapping: [{ sqm: '60', group: '2', tier: 'inferred' }, { sqm: '90', group: null, tier: 'unclassified', reason: 'rental mixed' }] },
  { project: 'B', cls: 'condo', layoutsTrusted: true, mapping: [{ sqm: '70', group: null, tier: 'unclassified', reason: 'layouts with different bedroom counts; rental mixed' }, { sqm: '80', group: null, tier: 'unclassified', reason: 'contradiction' }] },
  { project: 'C', cls: 'condo', layoutsTrusted: false, mapping: [{ sqm: '50', group: null, tier: 'unclassified', reason: 'rental none' }] },
  { project: 'D', cls: 'ec', layoutsTrusted: false, mapping: [{ sqm: '100', group: null, tier: 'unclassified', reason: 'rental sparse' }] }] };
const rows = (area, n, ym) => Array.from({ length: n }, () => ({ areaRaw: String(area), sale: 3, ym }));
const latest = 2026 * 12 + 8;
const dev = new Map([['A', { rows: rows(60, 10, latest).concat(rows(90, 6, latest), rows(90, 50, latest - 30)) }], ['B', { rows: rows(70, 5, latest).concat(rows(80, 2, latest)) }], ['C', { rows: rows(50, 3, latest) }], ['D', { rows: rows(100, 9, latest - 1) }]]);
const srcs = new Map([['A', [{ source: 'idx', how: 'exact' }]], ['C', [{ source: 'idx', how: 'exact' }]], ['B', [{ source: 'idx', how: 'exact' }]]]);
t('expected gain counts open resales of the latest 24 months only; older ones are reported, not ranked', () => {
  const q = QU.rank(report, dev, srcs, {}, { version: 'v1' }), a = q.find((x) => x.project === 'A');
  assert.strictEqual(a.expectedGain, 6); assert.strictEqual(a.recentResales, 16); assert.strictEqual(a.allUnresolved, 56); assert.strictEqual(a.coverageNow, 0.625);
  assert.deepStrictEqual(q.filter((x) => x.state === 'queued').map((x) => x.project), ['A', 'C']);
});
t('a document cannot separate equal-area layouts or settle a contradiction; no source, or a failed try with this extractor, is not queued', () => {
  const q = QU.rank(report, dev, srcs, { C: { version: 'v1', status: 'draft' } }, { version: 'v1' });
  const b = q.find((x) => x.project === 'B'); assert.strictEqual(b.state, 'has checked table'); assert.strictEqual(b.sameAreaDifferentBeds, 5); assert.strictEqual(b.contradictions, 2); assert.strictEqual(b.expectedGain, 0);
  assert.strictEqual(q.find((x) => x.project === 'D').state, 'no document source'); assert.strictEqual(q.find((x) => x.project === 'C').state, 'tried with this extractor');
  assert.strictEqual(QU.rank(report, dev, srcs, { C: { version: 'v0', status: 'draft' } }, { version: 'v1' }).find((x) => x.project === 'C').state, 'queued');   // a new extractor retries it
  assert.strictEqual(QU.rank(report, dev, srcs, { C: { version: 'v1', status: 'waiting for OCR' } }, { version: 'v1' }).find((x) => x.project === 'C').state, 'queued');
  const empty = (days) => QU.rank(report, dev, srcs, { C: { version: 'v0', status: 'no documents fetched', at: new Date(Date.now() - days * 864e5).toISOString() } }, { version: 'v1' }).find((x) => x.project === 'C').state;
  assert.strictEqual(empty(10), 'no documents at source'); assert.strictEqual(empty(120), 'queued');   // a source page without documents is looked at again after 90 days
});

console.log('Extractor gate');
const sum = (o) => ({ status: o[0], explained: o[1], rows: o[2], rentalAgree: o[3] });
t('a change is kept only when it helps more than one development and harms none', () => {
  const base = { A: sum(['draft', 0.5, 10, 0.97]), B: sum(['extracted', 0.95, 20, 1]), C: sum(['draft', 0, 0, null]) };
  assert.strictEqual(XC.compare(base, { A: sum(['extracted', 0.93, 12, 0.97]), B: sum(['extracted', 0.95, 20, 1]), C: sum(['draft', 0, 0, null]) }).pass, false);   // one better only
  const two = XC.compare(base, { A: sum(['extracted', 0.93, 12, 0.97]), B: sum(['extracted', 0.95, 20, 1]), C: sum(['draft', 0.3, 5, null]) }); assert.strictEqual(two.pass, true); assert.strictEqual(two.better.length, 2);
  const worse = XC.compare(base, { A: sum(['extracted', 0.93, 12, 0.97]), B: sum(['draft', 0.95, 20, 1]), C: sum(['draft', 0.3, 5, null]) }); assert.strictEqual(worse.pass, false); assert.strictEqual(worse.worse[0].why, 'usable -> review');
  assert.strictEqual(XC.compare(base, { A: sum(['draft', 0.5, 10, 0.9]), B: base.B, C: base.C }).worse[0].why, 'rental agreement -7 points');
});
t('the extractor version changes with the files that decide what a document yields', () => { assert.ok(/^[0-9a-f]{10}$/.test(XC.version())); });

console.log('Readings and places');
const page = (words) => ({ w: 1000, h: 1000, words: words.map((x) => ({ x0: x[0], y0: x[1], x1: x[0] + x[2].length * 8, y1: x[1] + 12, t: x[2] })) });
const bbox = (pages) => '<doc>' + pages.map((p) => '<page width="1000" height="1000">' + p.words.map((w) => '<word xMin="' + w.x0 + '" yMin="' + w.y0 + '" xMax="' + w.x1 + '" yMax="' + w.y1 + '">' + w.t + '</word>').join('') + '</page>').join('') + '</doc>';
const filler = Array.from({ length: 30 }, (x, i) => [10 + (i % 10) * 90, 900 + Math.floor(i / 10) * 20, 'word']);
const plan = (code, beds, sqm) => [[100, 100, beds], [120, 100, 'BEDROOM'], [100, 140, 'TYPE'], [150, 140, code], [100, 180, sqm], [140, 180, 'sqm']];
t('a document read three ways: text pages, OCR of scans, and page by page; the most complete reading is kept', () => {
  const d = path.join(tmp, 'read'), ocr = path.join(d, 'ocr', 'doc'), text = path.join(d, 'text'); fs.mkdirSync(ocr, { recursive: true }); fs.mkdirSync(text, { recursive: true });
  // page 1 has a text layer with plan A1; page 2 is a scan (no text) whose OCR holds plan B1
  fs.writeFileSync(path.join(text, 'doc.html'), bbox([page(plan('A1', '1', '45').concat(filler)), page([])]));
  const tsv = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n1\t1\t0\t0\t0\t0\t0\t0\t1000\t1000\t-1\t\n' + plan('B1', '2', '70').map((w, i) => '5\t1\t1\t1\t1\t' + i + '\t' + w[0] + '\t' + w[1] + '\t' + w[2].length * 8 + '\t12\t90\t' + w[2]).join('\n');
  fs.writeFileSync(path.join(ocr, 'p2.tsv'), tsv);
  const r = BB.readDoc({ file: path.join(d, 'doc.pdf') }, { text, ocr: path.join(d, 'ocr') });
  assert.strictEqual(r.use, 'combined'); assert.deepStrictEqual(r.rows.map((x) => [x.code, x.bedrooms, x.sqm]), [['A1', 1, '45'], ['B1', 2, '70']]);
  assert.strictEqual(BB.readDoc({ file: path.join(d, 'doc.pdf') }, { text, ocr: path.join(d, 'ocr'), readings: ['text', 'ocr'] }).rows.length, 1);
});
t('documents from two places are checked apart; a place whose table fails is left out', () => {
  const sales = [].concat(rows(45, 20, latest), rows(70, 20, latest)), D = { rows: sales.map((x) => Object.assign({ sqm: Number(x.areaRaw) }, x)) };
  const good = { rows: [{ code: 'A1', bedrooms: 1, variant: '', sqm: '45', sqft: '' }, { code: 'B1', bedrooms: 2, variant: '', sqm: '70', sqft: '' }], chart: new Map(), group: 'idx:right', source: 's1' };
  const other = { rows: [{ code: 'A1', bedrooms: 3, variant: '', sqm: '120', sqft: '' }], chart: new Map(), group: 'idx:namesake', source: 's2' };
  const b = BB.chooseGroups('Q', [good, other], D, []);
  assert.strictEqual(b.status, 'extracted'); assert.deepStrictEqual(b.used, ['idx:right']); assert.strictEqual(b.groups.length, 2);
  assert.strictEqual(BB.chooseGroups('Q', [Object.assign({}, good, { group: '' }), Object.assign({}, other, { group: '' })], D, []).status, 'draft');   // merged, the conflicting A1 is dropped
});
t("the store's document list keeps one row per file across runs", () => {
  const f = path.join(tmp, 'docs.csv');
  PL.mergeDocs(f, [{ project: 'A', file: '/x/a.pdf', source: 'idx', id: 'a', group: 'idx:a', kind: 'pdf' }]);
  const all = PL.mergeDocs(f, [{ project: 'A', file: '/x/a.pdf', source: 'idx', id: 'a', group: 'idx:a', kind: 'pdf', url: 'u' }, { project: 'B', file: '/x/b.pdf', source: 'dev', id: 'b', group: 'dev:b', kind: 'pdf' }]);
  assert.strictEqual(all.length, 2); assert.strictEqual(all[0].url, 'u');
});

console.log('Measures');
t('coverage counts tiers by period and gives each unclassified sale one reason; it carries no accuracy figure', () => {
  const rep = { latestMonth: '2026-09', developments: [{ project: 'A', rental: { contracts: 120 }, mapping: [{ sqm: '60', group: '2', tier: 'inferred' }, { sqm: '90', group: null, tier: 'unclassified', reason: 'rental mixed' }, { sqm: '70', group: '1', tier: 'verified' }] }] };
  const D = new Map([['A', { rows: rows(60, 4, latest).concat(rows(90, 2, latest), rows(70, 2, latest), [{ areaRaw: '60', sale: 1, ym: latest }]) }]]);
  const c = M.coverage(rep, D, new Map([['A', 'OCR']]));
  assert.strictEqual(c.recentResale.n, 8); assert.strictEqual(c.recentResale.classified, 0.75); assert.strictEqual(c.recentResale.verified, 2);
  assert.strictEqual(c.newSale.n, 1); assert.deepStrictEqual(c.unclassifiedRecentResale, { 'rented with different bedroom counts at this size': 2 }); assert.strictEqual(c.byRentalVolume['100-199'].n, 8);
  assert.ok(!('accuracy' in c.recentResale));
});
t('every unclassified reason has a plain wording', () => {
  assert.strictEqual(M.reasonOf({ reason: 'contradiction' }), 'layouts and rentals disagree (for review)');
  assert.strictEqual(M.reasonOf({ reason: 'layouts with different bedroom counts; rental mixed' }), 'floor plans with different bedroom counts share this area');
  assert.strictEqual(M.reasonOf({ reason: 'rental unrepresented' }), 'too few rentals for how often this exact size sells');
  assert.strictEqual(M.reasonOf({ reason: 'no layout fits; rental none' }), 'no rental contract with a bedroom count at this size');
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
