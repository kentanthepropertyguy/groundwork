// node tools/what-can-i-buy/tests/find-tests.js   FIND V1 rules, ranking, fallbacks, wording, privacy, links, and the shipped data.
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '../../..');
const F = require(path.join(root, 'assets/js/kpt-find.js'));
const T = F.T;
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

// ---- synthetic index. latest month = 2026-09. rows: [bin,n,act,last,q1,med,q3]
const P = (id, name, street, d, tg, sale, rows) => ({ id, name, street, d, seg: 'OCR', tg, tl: tg === 4 ? 'Freehold' : '99 yrs from 2015', m: 0, new: sale === 'new' ? rows : [], resale: sale === 'resale' ? rows : [] });
const mk = (ps) => F.prepare({ v: 1, kind: 'kpt-find-index', latestMonth: '2026-09', window: { from: '2025-10', to: '2026-09', label: '2025-10 to 2026-09' }, bin: 100, minCell: 3, projects: ps });
const row = (bin, n, act, last, q1, q3) => [bin, n, act, last, q1, Math.round((q1 + q3) / 2), q3];
const SZ = { lo: 900, hi: 1100, source: 'explicit', line: 'x' };
const run = (ix, o) => F.shortlist(ix, Object.assign({ budget: 1800000, openTo: 'resale', size: SZ, districts: [], text: '', freehold: false, answers: { where: 'flexible', size: 'not-sure', priorities: [] }, typical: null }, o));
const ids = (r) => r.groups.reduce((a, g) => a.concat(g.cards.map((c) => c.id)), []);
const R1 = (id, n, extra) => P(id, id.toUpperCase(), 'ST ' + id, '15', 4, 'resale', [row(1000, n, 3, 202609, 1700000, 1900000)]);

console.log('Eligibility rules');
t('sale counts: 2 excluded, 3 Limited, 5 Good', () => {
  const r = run(mk([R1('a', 2), R1('b', 3), R1('c', 4), R1('d', 5)]));
  assert.deepStrictEqual(ids(r).sort(), ['b', 'c', 'd']); const s = {}; r.groups[0].cards.forEach((c) => { s[c.id] = c.strength; });
  assert.strictEqual(s.b, 'limited'); assert.strictEqual(s.c, 'limited'); assert.strictEqual(s.d, 'good');
});
t('sales are summed across matching rows (2+1 qualifies; one row of 2 does not)', () => {
  const p = P('x', 'X', 'S', '15', 4, 'resale', [row(900, 3, 3, 202609, 1700000, 1900000), row(1000, 3, 2, 202609, 1700000, 1900000)]);
  assert.deepStrictEqual(ids(run(mk([p]))), ['x']);
});
t('budget window edges: ±10% inclusive overlap, just outside excluded', () => {
  const mkq = (q1, q3) => P('e', 'E', 'S', '15', 4, 'resale', [row(1000, 5, 3, 202609, q1, q3)]);
  assert.strictEqual(ids(run(mk([mkq(1980000, 2100000)]))).length, 1);   // q1 = B*1.10
  assert.strictEqual(ids(run(mk([mkq(1980001, 2100000)]))).length, 0);
  assert.strictEqual(ids(run(mk([mkq(1500000, 1620000)]))).length, 1);   // q3 = B*0.90
  assert.strictEqual(ids(run(mk([mkq(1500000, 1619999)]))).length, 0);
});
t('size window uses the band midpoint, lower inclusive, upper exclusive', () => {
  const at = (bin) => P('s', 'S', 'S', '15', 4, 'resale', [row(bin, 5, 3, 202609, 1700000, 1900000)]);
  assert.strictEqual(ids(run(mk([at(850)]))).length, 1);   // midpoint 900
  assert.strictEqual(ids(run(mk([at(800)]))).length, 0);   // midpoint 850
  assert.strictEqual(ids(run(mk([at(1050)]))).length, 0);  // midpoint 1100 is the exclusive edge
  assert.strictEqual(ids(run(mk([at(1000)]))).length, 1);
});
t('recency: latest sale within 6 months of the data (Mar 2026 in, Feb 2026 out)', () => {
  const lt = (l) => P('r', 'R', 'S', '15', 4, 'resale', [row(1000, 5, 3, l, 1700000, 1900000)]);
  assert.strictEqual(ids(run(mk([lt(202603)]))).length, 1); assert.strictEqual(ids(run(mk([lt(202602)]))).length, 0);
});
t('active months: at least one matching row needs 2 or more', () => {
  const one = P('m', 'M', 'S', '15', 4, 'resale', [row(1000, 5, 1, 202609, 1700000, 1900000)]);
  assert.strictEqual(ids(run(mk([one]))).length, 0);
  const two = P('m', 'M', 'S', '15', 4, 'resale', [row(900, 3, 1, 202609, 1700000, 1900000), row(1000, 3, 2, 202609, 1700000, 1900000)]);
  assert.strictEqual(ids(run(mk([two]))).length, 1);
});
t('a non-matching row does not contribute sales or active months', () => {
  const p = P('n', 'N', 'S', '15', 4, 'resale', [row(1000, 2, 2, 202609, 1700000, 1900000), row(1000 + 100, 9, 5, 202609, 1700000, 1900000)]);
  assert.strictEqual(ids(run(mk([p]))).length, 0);
});
t('sale types are never mixed: resale buyer sees no new-sale rows', () => {
  const p = P('w', 'W', 'S', '15', 4, 'new', [row(1000, 9, 3, 202609, 1700000, 1900000)]);
  assert.strictEqual(ids(run(mk([p]), { openTo: 'resale' })).length, 0); assert.strictEqual(ids(run(mk([p]), { openTo: 'new' })).length, 1);
});

console.log('Ranking and caps');
t('order: strength, fit (inside, above, below), sales, recency, name', () => {
  const mkp = (id, n, q1, q3, last) => P(id, id.toUpperCase(), 'ST ' + id, '15', 4, 'resale', [row(1000, n, 3, last, q1, q3)]);
  const r = run(mk([mkp('lim', 4, 1700000, 1900000, 202609), mkp('below', 9, 1900000, 2200000, 202609), mkp('above', 9, 1500000, 1700000, 202609), mkp('inM', 6, 1700000, 1900000, 202607), mkp('inN', 6, 1700000, 1900000, 202609), mkp('inA', 6, 1700000, 1900000, 202609)]));
  assert.deepStrictEqual(ids(r), ['ina', 'inn', 'inm', 'above', 'below'].map((x) => x === 'ina' ? 'inA' : x === 'inn' ? 'inN' : x === 'inm' ? 'inM' : x));
});
t('ranking is deterministic (reversed input gives the same list)', () => {
  const ps = ['a', 'b', 'c', 'd', 'e', 'f'].map((x, i) => R1(x, 5 + (i % 2)));
  assert.deepStrictEqual(ids(run(mk(ps))), ids(run(mk(ps.slice().reverse()))));
});
t('at most 2 per street, and at most 5 shown', () => {
  const ps = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => Object.assign(R1(x, 6), { street: 'SAME ROAD' }));
  assert.strictEqual(ids(run(mk(ps))).length, 2);
  const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => R1(x, 6)); const r = run(mk(many)); assert.strictEqual(r.shown, 5); assert.strictEqual(r.total, 7);
});
t('both: 3 resale + 2 new; gaps are filled from the other group', () => {
  const rs = ['r1', 'r2', 'r3', 'r4'].map((x) => R1(x, 6)), ns = ['n1', 'n2', 'n3'].map((x) => P(x, x.toUpperCase(), 'NS ' + x, '15', 4, 'new', [row(1000, 6, 3, 202609, 1700000, 1900000)]));
  let r = run(mk(rs.concat(ns)), { openTo: 'both' }); assert.deepStrictEqual(r.groups.map((g) => g.sale + g.cards.length), ['resale3', 'new2']);
  r = run(mk(rs.slice(0, 1).concat(ns)), { openTo: 'both' }); assert.deepStrictEqual(r.groups.map((g) => g.sale + g.cards.length), ['resale1', 'new3']);
  r = run(mk(rs.concat(ns.slice(0, 1))), { openTo: 'both' }); assert.deepStrictEqual(r.groups.map((g) => g.sale + g.cards.length), ['resale4', 'new1']);
});

console.log('Filters');
t('district filter applies; freehold filter keeps tenure group 4 only', () => {
  const a = Object.assign(R1('a', 6), { d: '20' }), b = Object.assign(R1('b', 6), { d: '15' }), c = Object.assign(R1('c', 6), { tg: 1, tl: '99 yrs' });
  const ix = mk([a, b, c]);
  assert.deepStrictEqual(ids(run(ix, { districts: ['20'] })), ['a']);
  assert.deepStrictEqual(ids(run(ix, { freehold: true })).sort(), ['a', 'b']); assert.strictEqual(ids(run(ix, {})).length, 3);
});
t('typed text suggests districts, matches whole words, and is never applied silently', () => {
  assert.ok(F.matchDistricts('Thomson').length > 0); assert.deepStrictEqual(F.matchDistricts('xyzzy'), []);
  const a = Object.assign(R1('a', 6), { d: '20' }); const ix = mk([a, R1('b', 6)]);
  assert.strictEqual(F.matchDistricts('Thom').length, 0);   // whole words only
  assert.strictEqual(run(ix, { text: '' }).total, 2);
});
t('district table is exactly D01–D28', () => {
  assert.deepStrictEqual(Object.keys(F.DISTRICT_AREAS).sort(), Array.from({ length: 28 }, (_, i) => String(i + 1).padStart(2, '0')));
});

console.log('Size');
t('explicit size wins; otherwise inferred and disclosed; bedrooms never convert', () => {
  const step = { private: { routes: { 'OCR|Resale|10–25': { n: [40, 9, 1, 1800000, 1, 1013, 1187] } }, total: { n: [50, 1, 1, 1, 1, 900, 1300] } } };
  const e = F.sizeWindow({ from: 800, to: 1000 }, step, 'resale'); assert.strictEqual(e.source, 'explicit'); assert.deepStrictEqual([e.lo, e.hi], [800, 1000]);
  const i = F.sizeWindow(null, step, 'resale'); assert.strictEqual(i.source, 'inferred'); assert.ok(/don’t convert bedrooms/.test(i.line)); assert.deepStrictEqual([i.lo, i.hi], [1010, 1190]);
  assert.strictEqual(F.sizeWindow({ from: 1000, to: 900 }, step, 'resale').source, 'inferred');
  assert.strictEqual(F.sizeWindow(null, null, 'resale'), null);
});
t('a bedroom answer changes nothing in the list; it is only disclosed', () => {
  const ix = mk([R1('a', 6), R1('b', 6)]);
  const a = run(ix, { answers: { where: 'flexible', size: '3', priorities: [] } }), b = run(ix, {});
  assert.deepStrictEqual(ids(a), ids(b)); assert.ok(a.unsupported.some((u) => u.id === 'bedrooms'));
});

console.log('Fallbacks');
t('1–2 matches: shown, with counted change options', () => {
  const ps = [R1('a', 6), Object.assign(P('z', 'Z', 'ZS', '15', 4, 'resale', [row(1200, 6, 3, 202609, 1700000, 1900000)]))];
  const r = run(mk(ps), { size: { lo: 1100, hi: 1300, source: 'explicit', line: '' } }); assert.strictEqual(r.state, 'few'); assert.strictEqual(r.total, 1);
  const sz = r.changes.find((c) => c.id === 'size'); assert.ok(!sz || sz.count > 1);
  const r2 = run(mk([R1('a', 6), R1('b', 6), Object.assign(R1('c', 6), { d: '20' })]), { districts: ['20'] }); assert.strictEqual(r2.state, 'few');
  const ar = r2.changes.find((c) => c.id === 'area'); assert.strictEqual(ar.count, 3);
});
t('0 matches: message and nearest working budget in $50k steps up to +50%', () => {
  const ps = ['a', 'b', 'c'].map((x) => P(x, x.toUpperCase(), 'S' + x, '15', 4, 'resale', [row(1000, 6, 3, 202609, 2400000, 2600000)]));
  const r = run(mk(ps), { budget: 2000000 }); assert.strictEqual(r.state, 'none'); assert.strictEqual(r.shown, 0); assert.ok(r.noneText);
  assert.strictEqual(r.reference.budget, 2200000);
  const far = run(mk(ps), { budget: 1000000 }); assert.strictEqual(far.reference, null);
});
t('index failure: prepare() returns null for empty, corrupt or wrong-kind data', () => {
  [null, undefined, {}, { kind: 'x' }, { v: 1, kind: 'kpt-find-index', projects: 'x', latestMonth: '2026-09' }, { v: 2, kind: 'kpt-find-index', projects: [], latestMonth: '2026-09' }].forEach((d) => assert.strictEqual(F.prepare(d), null));
});
t('page: data failure leaves the section absent (renderFind clears findRoot)', () => {
  const html = fs.readFileSync(path.join(root, 'tools/what-can-i-buy/index.html'), 'utf8');
  assert.ok(/if \(!findIx\) \{ root\.innerHTML = ''; return; \}/.test(html)); assert.ok(/\.catch\(\(\) => \(findIx = null\)\)/.test(html));
});

console.log('Unsupported answers');
t('every unsupported answer is listed and appended to every card', () => {
  const ix = mk([R1('a', 6), R1('b', 6)]);
  const r = run(ix, { regionSoft: true, answers: { where: 'school', size: '2', priorities: ['schools', 'location', 'investment', 'monthly', 'facilities', 'newer', 'space'] } });
  assert.deepStrictEqual(r.unsupported.map((u) => u.id), ['school', 'schools', 'investment', 'monthly', 'facilities', 'newer', 'bedrooms']);   // V10.3.1: location and space are applied, so they are no longer in the not-used list
  r.groups[0].cards.forEach((c) => { ['school', 'investment', 'monthly', 'facilities'].forEach((w) => assert.ok(c.notEvaluated.toLowerCase().indexOf(w) > -1, w)); });
  ['family', 'work'].forEach((w) => assert.ok(run(ix, { answers: { where: w, size: 'not-sure', priorities: [] } }).unsupported.some((u) => u.id === w)));
  assert.strictEqual(run(ix, {}).unsupported.length, 0);
});

console.log('Wording, links, privacy');
const grid = [];
[600000, 900000, 1300000, 1800000, 2500000, 4000000].forEach((b) => [[500, 700], [900, 1100], [1200, 1600], [2000, 3000]].forEach((s) => ['new', 'resale', 'both'].forEach((o) => [[], ['20'], ['15', '09']].forEach((d) => grid.push([b, s, o, d])))));
const realDoc = fs.existsSync(path.join(root, 'data/projects/find.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'data/projects/find.json'), 'utf8')) : null;
t('shipped find.json prepares', () => { assert.ok(realDoc); assert.ok(F.prepare(realDoc)); });
const ixr = realDoc && F.prepare(realDoc);
const BANNED = /\b(best|recommend(ed|s|ation)?s?|available|affordable|undervalued|bargain|cheap|bedrooms?)\b/i;
t('grid of ' + grid.length + ' inputs never throws; wording is clean', () => {
  grid.forEach((g) => {
    const r = F.shortlist(ixr, { budget: g[0], openTo: g[2], size: { lo: g[1][0], hi: g[1][1], source: 'explicit', line: '' }, districts: g[3], text: '', freehold: false, answers: { where: 'flexible', size: 'not-sure', priorities: [] } });
    assert.ok(['list', 'few', 'none'].indexOf(r.state) > -1); assert.ok(r.shown <= 5);
    const stripNE = r.groups.map((g) => g.cards.map((c) => Object.assign({}, c, { notEvaluated: '' })));
    const txt = JSON.stringify([stripNE, r.fewText, r.noneText, r.reference, r.changes, r.orderLine, r.dataLine]).replace(/not a recommendation[^"]*/gi, '');
    assert.ok(!BANNED.test(txt.replace(/[^"]*doesn’t[^"]*bedroom[^"]*/gi, '')), g.join('|') + ' ' + (txt.match(BANNED) || [])[0]);
    r.groups.forEach((gr) => gr.cards.forEach((c) => { assert.ok(/^\.\.\/\.\.\/research\/index\.html#\/p\/[a-z0-9-]+\/(new|resale)$/.test(c.link), c.link); assert.ok(/^Research .+ →$/.test(c.linkText)); assert.ok(/^Typical prices for these: \$\d\.\d\d?m?/.test(c.prices) || /^Typical prices for these: \$/.test(c.prices)); assert.ok(!/cell|P25|P75|quartile|k ≥/i.test(JSON.stringify(c))); }));
  });
});
t('cards use the Research name format and link carries no size', () => {
  const r = F.shortlist(ixr, { budget: 1800000, openTo: 'resale', size: SZ, districts: [], answers: {} }); const c = r.groups[0].cards[0];
  assert.ok(c.link.indexOf('?') < 0 && c.link.indexOf('sqft') < 0); assert.ok(/^\$\d\.\d\dm–\$\d\.\d\dm/.test(c.prices.replace('Typical prices for these: ', '')));
});
t('methodology holds the technical meaning; “Typical prices” is explained as the middle half', () => {
  const m = F.METHOD.join(' '); assert.ok(/middle half/.test(m)); assert.ok(/not a recommendation/.test(m)); assert.ok(/at least 3/.test(m)); assert.ok(/6 months/.test(m));
});
t('analytics are bucketed: only the five allowed keys, no names, text or exact figures', () => {
  const r = F.shortlist(ixr, { budget: 1834567, openTo: 'both', size: SZ, districts: ['20'], text: 'secret road', answers: {} });
  const a = F.analytics(r, '1.8-2.0m'); assert.deepStrictEqual(Object.keys(a).sort(), F.ANALYTICS_KEYS.slice().sort());
  const s = JSON.stringify(a); assert.ok(!/secret|1834567|1,834/.test(s)); assert.ok(['0', '1-2', '3-4', '5+'].indexOf(a.result_bucket) > -1);
});
t('page tracks only find_shown, find_research_click and (V10) find_ask_click (project slugs only); typed text never reaches analytics or WhatsApp', () => {
  const html = fs.readFileSync(path.join(root, 'tools/what-can-i-buy/index.html'), 'utf8');
  const tr = html.match(/KPT\.track\('find_[a-z_]+'[^)]*\)/g); assert.deepStrictEqual(tr.sort(), ["KPT.track('find_ask_click', ev)", "KPT.track('find_ask_click', ev)", "KPT.track('find_research_click', { project_id: t.dataset.id })", "KPT.track('find_shown', pl)"].sort());
  assert.ok(!/waLink\([^)]*FS\./.test(html));
});
t('displayName parity with Research across every project name', () => {
  const RS = require(path.join(root, 'assets/js/kpt-research.js')); assert.strictEqual(typeof RS.displayName, 'function');
  realDoc.projects.forEach((p) => { assert.strictEqual(F.displayName(p.name), RS.displayName(p.name), p.name); assert.strictEqual(F.displayName(p.street), RS.displayName(p.street), p.street); });
});


console.log('V9.1 location: reviewed alias table');
const RA = (x) => F.resolveArea(x);
t('every alias in the reviewed table resolves to exactly its approved district', () => {
  F.AREA_ALIASES.forEach((row) => row[1].forEach((a) => { const r = RA(a); assert.strictEqual(r.kind, 'single', a); assert.deepStrictEqual(r.districts, [row[0]], a); }));
});
t('the 14 places Ken asked about', () => {
  const exp = { 'Ang Mo Kio': ['single', ['20']], Bishan: ['single', ['20']], Thomson: ['several', ['11', '26']], Tampines: ['single', ['18']], Bedok: ['single', ['16']], Hougang: ['single', ['19']], Punggol: ['single', ['19']],
    Sengkang: ['single', ['19']], Clementi: ['several', ['05', '21']], Jurong: ['single', ['22']], Queenstown: ['single', ['03']], 'Bukit Timah': ['several', ['10', '21']], Orchard: ['single', ['09']], Novena: ['single', ['11']] };
  Object.keys(exp).forEach((k) => { const r = RA(k); assert.strictEqual(r.kind, exp[k][0], k); assert.deepStrictEqual(r.districts, exp[k][1], k); });
});
t('approved corrections: Serangoon asks (D12/D19), Serangoon Gardens is D19, Kallang is unresolved', () => {
  assert.deepStrictEqual(RA('Serangoon'), { kind: 'several', districts: ['12', '19'], places: ['Serangoon'] });
  assert.deepStrictEqual(RA('Serangoon Gardens').districts, ['19']); assert.strictEqual(RA('Serangoon Gardens').kind, 'single');
  assert.strictEqual(RA('Kallang').kind, 'none'); assert.strictEqual(RA('near Kallang Riverside').kind, 'none');
});
t('approved choice places: East Coast, Bukit Merah, CBD, Yio Chu Kang', () => {
  assert.deepStrictEqual(RA('East Coast').districts, ['15', '16']); assert.deepStrictEqual(RA('Bukit Merah').districts, ['03', '04']); assert.deepStrictEqual(RA('CBD').districts, ['01', '02']); assert.deepStrictEqual(RA('Yio Chu Kang').districts, ['26', '28']);
});
t('approved single mappings: Paya Lebar D14, Lentor D26, Tengah D24, Kembangan D16, Beauty World D21', () => {
  [['Paya Lebar', '14'], ['Lentor', '26'], ['Tengah', '24'], ['Kembangan', '16'], ['Beauty World', '21']].forEach((x) => assert.deepStrictEqual(RA(x[0]).districts, [x[1]], x[0]));
});
t('no fragment or fuzzy matching: the V9 mistakes are gone', () => {
  ['Bukit', 'East', 'Pasir', 'West', 'Upper', 'Road', 'Garden', 'Park', 'Tim', 'Thom', 'angmokio', 'Bishn'].forEach((x) => assert.strictEqual(RA(x).kind, 'none', x));
  assert.deepStrictEqual(RA('Bukit Merah').districts.indexOf('23'), -1); assert.deepStrictEqual(RA('Jurong East').districts, ['22']); assert.deepStrictEqual(RA('Pasir Ris').districts, ['18']);
});
t('longest phrase wins; several places combine; the same district is not duplicated', () => {
  assert.deepStrictEqual(RA('Upper Thomson').districts, ['26']); assert.deepStrictEqual(RA('Upper Bukit Timah').districts, ['21']);
  assert.deepStrictEqual(RA('AMK or Bishan').districts, ['20']); assert.strictEqual(RA('AMK or Bishan').kind, 'single');
  assert.deepStrictEqual(RA('Tampines / Bedok').districts, ['16', '18']); assert.strictEqual(RA('Tampines / Bedok').kind, 'several');
});
t('empty, odd and long text never throws', () => {
  [null, undefined, '', '   ', '###', 'x'.repeat(5000), '<script>alert(1)</script>', 'Ang   Mo\tKio!!'].forEach((x) => { const r = RA(x); assert.ok(['single', 'several', 'none'].indexOf(r.kind) > -1); });
  assert.deepStrictEqual(RA('ang   mo\tkio!!').districts, ['20']);
});
t('every district in the table exists in the reviewed D01–D28 names', () => {
  F.AREA_ALIASES.forEach((r) => assert.ok(F.DISTRICT_AREAS[r[0]], r[0])); F.AREA_CHOICES.forEach((r) => r[1].forEach((d) => assert.ok(F.DISTRICT_AREAS[d], d)));
});

console.log('V9.1 location: never silently ignored');
t('Specific area, Near work, Near family and Near school are each listed, before and after an area is chosen', () => {
  ['areas', 'work', 'family', 'school'].forEach((w) => {
    const p = F.unsupported({ where: w, priorities: [] }); assert.ok(p.some((u) => u.id === w), w + ' pending');
    const c = F.unsupported({ where: w, priorities: [] }, { districts: ['20'] }).find((u) => u.id === w); assert.ok(/District 20/.test(c.text), w + ' confirmed');
    const k = F.unsupported({ where: w, priorities: [] }, { districts: [], skipped: true }).find((u) => u.id === w); assert.ok(/all of Singapore/.test(k.text), w + ' skipped');
  });
  assert.strictEqual(F.unsupported({ where: 'flexible', priorities: [] }).length, 0);
});
t('wording never claims distance: only “can’t show distance” and “narrowed to a district”', () => {
  ['work', 'family', 'school'].forEach((w) => [{ districts: ['20'] }, { districts: [], skipped: true }, {}].forEach((c) => {
    const x = F.unsupported({ where: w, priorities: [] }, c).find((u) => u.id === w).text; assert.ok(/can’t show distance/.test(x)); assert.ok(!/(minutes?|walking|nearby|close to you|within \d)/i.test(x), x);
  }));
});
t('the card line lists the location requirement on every card', () => {
  const ix2 = mk([R1('a', 6), R1('b', 6)]);
  const r = run(ix2, { answers: { where: 'work', size: 'not-sure', priorities: [] }, loc: { districts: ['15'] } });
  r.groups[0].cards.forEach((c) => assert.ok(/workplace/.test(c.notEvaluated)));
  const a = run(ix2, { answers: { where: 'areas', size: 'not-sure', priorities: [] }, loc: { districts: ['15'] } }); a.groups[0].cards.forEach((c) => assert.ok(/exact area within the district/.test(c.notEvaluated)));
});

console.log('V9.1 New launch wording');
t('New launch group heading and note use the approved wording', () => {
  assert.strictEqual(F.NEW_LABEL, 'New launch projects with recent developer sales');
  assert.strictEqual(F.NEW_NOTE, 'Based on developer sales recorded by URA in the last 12 months. This data cannot tell us whether units are still available from the developer.');
  const n = P('n1', 'N1', 'NS', '15', 4, 'new', [row(1000, 6, 3, 202609, 1700000, 1900000)]);
  const r = run(mk([n]), { openTo: 'new' }); assert.strictEqual(r.groups[0].label, F.NEW_LABEL); assert.strictEqual(r.groups[0].note, F.NEW_NOTE);
  const b = run(mk([n, R1('r1', 6)]), { openTo: 'both' }); assert.strictEqual(b.groups.find((g) => g.sale === 'new').note, F.NEW_NOTE); assert.strictEqual(b.groups.find((g) => g.sale === 'resale').note, null);
});
t('new-launch cards never imply current availability and say the developer may have no units', () => {
  const n = P('n1', 'N1', 'NS', '15', 4, 'new', [row(1000, 6, 3, 202609, 1700000, 1900000)]);
  const c = run(mk([n]), { openTo: 'new' }).groups[0].cards[0];
  assert.ok(/developer sales/.test(c.evidence)); assert.ok(/whether the developer still has units to sell/.test(c.notEvaluated)); assert.ok(/don’t show whether the developer still has units to sell/.test(c.indicative));
  assert.ok(!/\b(available|in stock|on sale|launching now|currently selling)\b/i.test(JSON.stringify(c)), JSON.stringify(c));
  assert.strictEqual(c.saleLabel, 'Developer sales');
});
t('methodology states that recent New Sale evidence is not proof of developer inventory, and explains the 900+ year tenure rule', () => {
  const m = F.METHOD.join(' '); assert.ok(/not proof that the developer still has units to sell/.test(m)); assert.ok(/900 years or more/.test(m)); assert.ok(/ask you to confirm it/.test(m));
});
t('real data: every new-sale card on a grid says so; sale types are still never mixed', () => {
  let n = 0;
  [1200000, 2000000, 3000000, 5000000].forEach((b) => ['new', 'resale', 'both'].forEach((o) => {
    const r = F.shortlist(ixr, { budget: b, openTo: o, size: { lo: 700, hi: 1500, source: 'explicit', line: '' }, districts: [], answers: {} });
    r.groups.forEach((g) => g.cards.forEach((c) => { n++; assert.strictEqual(c.sale, g.sale); if (o !== 'both') assert.strictEqual(c.sale, o); if (c.sale === 'new') assert.ok(/developer still has units to sell/.test(c.notEvaluated) && /developer sales/.test(c.evidence)); else assert.ok(!/developer/.test(JSON.stringify(c))); }));
  }));
  assert.ok(n > 30);
});
t('ELTA stays eligible when it qualifies under the rules (not hard-coded in or out)', () => {
  const src = fs.readFileSync(path.join(root, 'assets/js/kpt-find.js'), 'utf8') + fs.readFileSync(path.join(root, 'tools/what-can-i-buy/index.html'), 'utf8'); assert.ok(!/elta/i.test(src));
  const r = F.shortlist(ixr, { budget: 3000000, openTo: 'new', size: { lo: 1040, hi: 1160, source: 'explicit', line: '' }, districts: [], answers: {} });
  assert.ok(F.eligible(ixr, 'new', { budget: 3000000, pct: T.budgetPct, lo: 1040, hi: 1160, districts: [], freehold: false, text: '' }).some((c) => c.id === 'elta'));
  assert.ok(r.state === 'list');
});

console.log('V9.1 page wiring and privacy');
const page = fs.readFileSync(path.join(root, 'tools/what-can-i-buy/index.html'), 'utf8');
t('location panel gates the list: no cards and no analytics until the buyer chooses', () => {
  const i = page.indexOf("if (FS.loc === 'pending')"), j = page.indexOf('FI.shortlist(findIx'), k = page.indexOf("KPT.track('find_shown'");
  assert.ok(i > -1 && i < j && j < k); assert.ok(/FS\.loc === 'pending'\) \{ root\.innerHTML = [^;]*locPanel\(\)[^;]*; return; \}/.test(page));
});
t('a district is applied only by an explicit click (locuse); never from the text alone', () => {
  assert.ok(/f === 'locuse'\) \{ FS\.districts = \[t\.dataset\.d\]; FS\.loc = 'confirmed'/.test(page)); assert.ok(!/FS\.districts = .*resolveArea/.test(page)); assert.ok(!/districts: .*resolveArea/.test(page));
  assert.ok(/f === 'locskip'\) \{ FS\.districts = \[\]; FS\.loc = 'skipped'/.test(page));
});
t('location text is read only for display and matching, and never reaches analytics, WhatsApp or the URL', () => {
  const uses = page.split('\n').filter((l) => /whereTextNow|whereText/.test(l));
  uses.forEach((l) => assert.ok(!/track\(|waLink|waMessage|location\.href|location\.hash|history\./.test(l), l));
  const after = page.slice(page.indexOf('function locPanel')); assert.ok(!/KPT\.track\([^)]*(txt|whereText|FS\.text)/.test(after));
  assert.ok(/handoff\.from === 'buy' && handoff\.where !== 'flexible'/.test(page));
  const a = F.analytics(F.shortlist(ixr, { budget: 3000000, openTo: 'both', size: SZ, districts: ['20'], text: '', answers: { where: 'work' }, loc: { districts: ['20'] } }), '3.0-3.2m');
  assert.deepStrictEqual(Object.keys(a).sort(), F.ANALYTICS_KEYS.slice().sort());
});
t('Buyer analytics and WhatsApp still exclude the text; only the session handoff carries it', () => {
  const B = require(path.join(root, 'assets/js/kpt-buyer.js')); const A = { budget: 3000000, purpose: 'own-stay', size: 'not-sure', where: 'work', whereText: 'Ang Mo Kio', priorities: [], openTo: 'both' };
  assert.strictEqual(B.buildHandoff(A).whereText, 'Ang Mo Kio'); assert.ok(!/Ang Mo Kio/.test(B.waMessage(A)));
  const buyPage = fs.readFileSync(path.join(root, 'buy/index.html'), 'utf8'); assert.ok(/writeHandoff\(window\.sessionStorage/.test(buyPage));
});
t('HDB and budget-only handoffs have no location step', () => {
  assert.ok(/locIntent = \(\) => \['areas', 'family', 'work', 'school'\]\.indexOf\(answersNow\(\)\.where\) > -1/.test(page));
  assert.ok(/: \{ where: 'flexible', size: 'not-sure', priorities: \[\] \}/.test(page));
});
t('freehold wording stays accurate: "Freehold or 900+ year lease" in the summary line and the Change search panel (never plain "Freehold")', () => { assert.ok(/'Freehold or 900\+ year lease'/.test(page)); assert.ok(/Freehold or 900\+ year lease only/.test(page)); assert.ok(!/\['Freehold'\]/.test(page)); assert.ok(!/999-year only/.test(page)); });

console.log('Pinery Residences exclusion (V10.4.1: unresolved Huttons D18 vs URA D16 identity; targeted only)');
const invRaw = JSON.parse(fs.readFileSync(path.join(root, 'data/projects/inventory.json'), 'utf8'));
const invP = F.prepareInventory(invRaw, Date.parse(invRaw.checkedAt) + 3600e3);
const allIds = (r) => r.groups.reduce((a, g) => a.concat(g.cards.map((c) => c.id), (g.more || []).map((c) => c.id)), []);
t('synthetic: a project with the Pinery id is dropped by prepare(); every other project is untouched', () => {
  const others = [R1('a', 6), R1('b', 6), R1('c', 6)], pin = P('pinery-residences', 'PINERY RESIDENCES', 'BEDOK RESERVOIR ROAD', '16', 4, 'resale', [row(1000, 9, 3, 202609, 1700000, 1900000)]);
  const withP = mk(others.concat([pin])), without = mk(others);
  assert.deepStrictEqual(withP.projects.map((p) => p.id), ['a', 'b', 'c']); assert.deepStrictEqual(withP.districts, without.districts);
  assert.deepStrictEqual(JSON.stringify(run(withP)), JSON.stringify(run(without)));
  assert.ok(ids(run(withP)).indexOf('pinery-residences') < 0);
});
t('shipped data: Pinery is removed from the FIND index and every other project stays (647 of 648)', () => {
  assert.ok(realDoc.projects.some((p) => p.id === 'pinery-residences'), 'source file still holds it (data is unchanged)');
  assert.strictEqual(ixr.projects.length, realDoc.projects.length - 1); assert.ok(!ixr.projects.some((p) => p.id === 'pinery-residences'));
  assert.strictEqual(ixr.projects.length, 647);
});
t('Pinery is never shown across budgets, sale types, sizes and with inventory on', () => {
  let shown = 0;
  [900000, 1200000, 1500000, 1800000, 2200000, 3000000, 4000000].forEach((b) => ['new', 'both', 'resale'].forEach((o) => [[500, 700], [640, 750], [900, 1100], [1200, 1600]].forEach((z) => [null, invP].forEach((iv) => [[], ['16'], ['18']].forEach((d) => {
    const r = F.shortlist(ixr, { budget: b, openTo: o, size: { lo: z[0], hi: z[1], source: 'explicit', line: '' }, sizes: null, districts: d, text: '', freehold: false, answers: { where: 'flexible', size: 'not-sure', priorities: [] }, inv: iv });
    shown += allIds(r).length; assert.ok(allIds(r).indexOf('pinery-residences') < 0, b + ' ' + o + ' ' + z + ' ' + d);
  })))));
  assert.ok(shown > 50, 'grid exercised real results: ' + shown);
});
t('other URA-only new launches still appear (Pinery exclusion does not touch tier c/d)', () => {
  const seen = {};
  [1200000, 1500000, 1800000, 2200000, 3000000, 4000000].forEach((bd) => [[500, 700], [640, 750], [900, 1100], [1200, 1600]].forEach((z) => {
    const r = F.shortlist(ixr, { budget: bd, openTo: 'new', size: { lo: z[0], hi: z[1], source: 'explicit', line: '' }, districts: [], text: '', freehold: false, answers: { where: 'flexible', size: 'not-sure', priorities: [] }, inv: invP });
    ((r.groups[0] || { cards: [] }).cards.concat((r.groups[0] || {}).more || [])).filter((c) => c.tier === 'c').forEach((c) => { seen[c.id] = c.huttons && c.huttons.kind; });
  }));
  const k = Object.keys(seen); assert.ok(k.indexOf('tengah-garden-residences') > -1, 'URA-only projects still shown: ' + k);
  assert.ok(k.indexOf('pinery-residences') < 0); assert.ok(k.every((id) => seen[id] === 'unchecked'));
});
t('Pinery is not in the verified Huttons inventory file, and the inventory loader also ignores it if it were added', () => {
  assert.ok(!invRaw.projects.some((p) => p.slug === 'pinery-residences'));
  const copy = JSON.parse(JSON.stringify(invRaw)); const donor = copy.projects[0]; copy.projects.push(Object.assign({}, donor, { slug: 'pinery-residences', name: 'Pinery Residences' }));
  const iv2 = F.prepareInventory(copy, Date.parse(copy.checkedAt) + 3600e3);
  assert.ok(iv2.slugs.indexOf('pinery-residences') < 0); assert.strictEqual(iv2.slugs.length, invP.slugs.length);
});

console.log('Brand hierarchy (V10.4.1)');
['index.html', 'own/index.html', 'buy/index.html', 'research/index.html', 'tools/hdb-upgrade/index.html', 'tools/what-can-i-buy/index.html'].forEach((f) => {
  const h = fs.readFileSync(path.join(root, f), 'utf8');
  t(f + ': header = KEN PROPERTY TOOLS / by Ken Tan · The Property Guy; footer identity; credentials and TikTok kept', () => {
    const hd = /<header class="kpt-header[^>]*>[\s\S]*?<\/header>/.exec(h)[0];
    assert.ok(/class="brand"[^>]*>KEN PROPERTY TOOLS<\/a>/.test(hd)); assert.ok(/<span class="kpt-tagline">by Ken Tan · The Property Guy<\/span>/.test(hd)); assert.ok(!/Property decisions, analysed/.test(hd));
    assert.ok(/<p class="kpt-f-name">Ken Tan · The Property Guy<\/p>/.test(h)); assert.ok(/CEA R007903D/.test(h)); assert.ok(/tiktok\.com\/@kennx8898/.test(h)); assert.ok(/Since 2007/.test(h));
  });
});
t('Home keeps its headline and the product positioning', () => { const h = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); assert.ok(/Make sense of your next property move\./.test(h)); assert.ok(/Property decisions, analysed\./.test(h)); });

console.log('V11.0 two paths, Tools link and Tools hub');
const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const NAVHREF = { 'index.html': 'tools/', 'own/index.html': '../tools/', 'buy/index.html': '../tools/', 'research/index.html': '../tools/', 'tools/hdb-upgrade/index.html': '../', 'tools/what-can-i-buy/index.html': '../' };
Object.keys(NAVHREF).forEach((f) => t(f + ': header has one Tools link to the hub, wordmark and by-line intact', () => {
  const hd = /<header class="kpt-header[^>]*>[\s\S]*?<\/header>/.exec(rd(f))[0];
  assert.strictEqual((hd.match(/<nav class="kpt-nav"/g) || []).length, 1); assert.ok(new RegExp('<a href="' + NAVHREF[f].replace(/\./g, '\\.') + '" data-kpt-nav="tools">Tools</a>').test(hd));
  assert.ok(/>KEN PROPERTY TOOLS<\/a>/.test(hd) && /by Ken Tan · The Property Guy/.test(hd));
  const fs2 = require('path'); assert.ok(fs.existsSync(path.join(root, path.dirname(f), NAVHREF[f], 'index.html')), 'link target exists');
}));
t('Home: Guided journey and Explore tools paths; three journey cards keep their links and data-journey; buy description updated', () => {
  const h = rd('index.html');
  assert.ok(/Not sure where to start\?/.test(h) && /Already know what you need\?/.test(h) && /Make sense of your next property move\./.test(h));
  [['own/', 'own'], ['buy/', 'buy'], ['research/', 'research']].forEach(([href, j]) => assert.ok(new RegExp('<a href="' + href + '" data-journey="' + j + '">').test(h), j));
  assert.ok(/Explore properties that fit your budget, priorities and preferred locations\./.test(h)); assert.ok(!/comfortably afford/.test(h));
  ['tools/hdb-upgrade/', 'tools/what-can-i-buy/', 'research/', 'tools/'].forEach((l) => assert.ok(h.indexOf('href="' + l + '" data-tool=') > -1, l));
  assert.ok(h.indexOf('Guided journey') < h.indexOf('Explore tools'), 'guided first');
});
t('Tools hub: categories hold live tools only, every link resolves, canonical + description + title present', () => {
  const h = rd('tools/index.html'); const links = [...h.matchAll(/<a class="kps-card" href="([^"]+)" data-tool="([^"]+)"/g)];
  assert.strictEqual(links.length, 3); assert.ok((h.match(/<section class="kps-cat"/g) || []).length >= 3);
  links.forEach((m) => assert.ok(fs.existsSync(path.join(root, 'tools', m[1], 'index.html')), m[1]));
  assert.ok(!/coming soon|placeholder|under construction/i.test(h.replace(/<!--[\s\S]*?-->/g, '')));
  assert.ok(/<link rel="canonical" href="https:\/\/tools\.kentanthepropertyguy\.com\/tools\/">/.test(h) && /<meta name="description" content="[^"]{40,}/.test(h) && /<title>Tools — Ken Property Tools<\/title>/.test(h));
  assert.ok(/aria-current="page"/.test(h));
});
t('analytics: tool_selected and nav_click carry only a tool/target and a placement; journey_started unchanged', () => {
  const h = rd('index.html') + rd('tools/index.html');
  assert.ok(/KPT\.track\('journey_started', \{ journey: a\.dataset\.journey \}\)/.test(rd('index.html')));
  [...h.matchAll(/KPT\.track\('(tool_selected|nav_click)', (\{[^}]*\})/g)].forEach((m) => assert.ok(/^\{ (tool|target): a\.dataset\.\w+, placement: '(home|hub|header)' \}$/.test(m[2]), m[2]));
});
t('Home and the Tools hub load no new script (only analytics and components)', () => {
  ['index.html', 'tools/index.html'].forEach((f) => (rd(f).match(/<script src="([^"]+)"/g) || []).forEach((m) => assert.ok(/kpt-analytics\.js|kpt-components\.js/.test(m), m)));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
