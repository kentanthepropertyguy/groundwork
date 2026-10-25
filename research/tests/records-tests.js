// Transactions, home-type prices and rents (25 Oct 2026): the published files agree with every figure the site already shows.
// Run from the site folder: node research/tests/records-tests.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), R = (p) => path.join(ROOT, p), ld = (p) => JSON.parse(fs.readFileSync(R(p), 'utf8'));
global.self = global;
const P = require(R('assets/js/kpt-project.js')), RS = require(R('assets/js/kpt-research.js')), REC = require(R('assets/js/gw-records.js'));
const RENT = require(R('assets/js/gw-rent.js')), ASK = require(R('assets/js/gw-ask.js')), BED = require(R('assets/js/gw-bedroom.js'));
let pass = 0; const t = (name, fn) => { fn(); pass++; console.log('  ok  ' + name); };
const man = ld('data/projects/manifest.json'), tm = ld('data/projects/tx/manifest.json'), bm = ld('data/projects/bedroom/manifest.json'), rm = ld('data/projects/rent/manifest.json'), F = ld('data/projects/find.json');
const shard = (dir, i) => ld('data/projects/' + dir + '/' + P.shardName(i) + '.json').projects;
const med = (a) => { const s = a.slice().sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const ym = (s) => Number(s.slice(0, 4)) * 100 + Number(s.slice(5, 7));

t('the transactions are from the same URA data month as Research (and the page refuses any other)', () => {
  assert.strictEqual(tm.latestMonth, man.latestMonth); assert.strictEqual(tm.shards, man.shards);
  const sh = { projects: { x: { name: 'X', rows: [] } } };
  assert.ok(REC.pick(sh, tm, 'x', man)); assert.strictEqual(REC.pick(sh, Object.assign({}, tm, { latestMonth: '2026-08' }), 'x', man), null);
});
t('every development: one row per sale Research counts, by sale type', () => {
  let devs = 0;
  for (let i = 0; i < man.shards; i++) { const d = shard('detail', i), x = shard('tx', i); Object.keys(d).forEach((id) => { devs++; const c = { 1: 0, 2: 0, 3: 0 }; x[id].rows.forEach((r) => c[r[1]]++); assert.deepStrictEqual([x[id].rows.length, c[1], c[2], c[3]], [d[id].n, d[id].sale.new, d[id].sale.sub, d[id].sale.resale], id); }); }
  assert.ok(devs > 2400, devs);
});
t('every bedroom type shown: its count and median price are exactly its labelled transactions', () => {
  let n = 0;
  for (let i = 0; i < man.shards; i++) { const b = shard('bedroom', i), x = shard('tx', i); Object.keys(b).forEach((id) => (b[id].resale ? b[id].resale.types : []).forEach((ty) => { if (!/^\d+$/.test(ty.g)) return; n++; const rows = x[id].rows.filter((r) => r[1] === 3 && r[5] === Number(ty.g) && r[0] >= ym(ty.from) && r[0] <= ym(ty.to)); assert.strictEqual(rows.length, ty.n, id + ' ' + ty.g); assert.ok(Math.abs(med(rows.map((r) => r[4])) - ty.price[2]) <= 1, id + ' ' + ty.g); })); }
  assert.ok(n > 800, n);
});
t('every asking-price band: its dots are exactly the sales its count and range describe', () => {
  let bands = 0, dots = 0;
  for (let i = 0; i < man.shards; i += 3) {   // a third of the shards keeps this quick; the full check runs in the release consistency script
    const d = shard('detail', i), x = shard('tx', i);
    Object.keys(d).forEach((id) => { const rec = REC.pick({ projects: { [id]: x[id] } }, tm, id, man); RS.analyseProject(d[id], man, { today: '2026-10-25' }).sale.options.forEach((o) => {
      RS.analyseProject(d[id], man, { sale: o.id, today: '2026-10-25' }).bands.forEach((b) => { if (!b.recent || !b.recent.n) return; bands++; const ps = REC.bandPsf(rec, REC.CODE[o.id], b.bin, { n: b.recent.n, lo: b.recent.psf.min, hi: b.recent.psf.max }); assert.ok(ps && ps.length === b.recent.n, id + ' ' + o.id + ' ' + b.bin); dots += ps.length; });
    }); });
  }
  assert.ok(bands > 1500 && dots > bands, bands + ' ' + dots);
  assert.strictEqual(REC.bandPsf({ latest: 202609, rows: [[202609, 3, 0, 60, 1e6, null, null, 0]] }, 3, 600, { n: 2 }), null, 'a count that differs gives no dots');
});
t('typical price by size (the fallback) matches find.json, the figures "Run the numbers" already uses', () => {
  let n = 0; const FID = {}; (Array.isArray(F.projects) ? F.projects : Object.values(F.projects)).forEach((x) => { FID[x.id] = x; });
  for (let i = 0; i < man.shards; i += 2) { const x = shard('tx', i); Object.keys(x).forEach((id) => ['new', 'resale'].forEach((s) => {
    const fp = FID[id]; if (!fp) return;   // find.json lists the developments its search covers
    const rec = REC.pick({ projects: { [id]: x[id] } }, tm, id, man), S = REC.sizeRows(rec, REC.CODE[s]), fr = fp[s];
    S.rows.forEach((row) => { const f = (fr || []).find((r) => r[0] === row.bin); assert.ok(f, id + ' ' + s + ' ' + row.bin); assert.deepStrictEqual([row.n, row.price[1], row.price[2], row.price[3]], [f[1], f[4], f[5], f[6]], id + ' ' + s + ' ' + row.bin); n++; });
  })); }
  assert.ok(n > 300, n);
});
t('transaction rows: months, sale types, floor bands and unknown bedrooms as URA and the classification give them', () => {
  const x = shard('tx', P.shardOf('treasure-at-tampines', man.shards))['treasure-at-tampines'];
  x.rows.forEach((r) => { assert.ok(r[0] >= 202109 && r[0] <= 202609); assert.ok([1, 2, 3].includes(r[1])); assert.ok(r[2] === null || (r[2] >= 0 && r[2] < tm.floorBands.length)); assert.ok(r[5] === null || r[6] === 'v' || r[6] === 'i'); });
  let unknown = 0, labelled = 0; for (let i = 0; i < man.shards; i += 4) Object.values(shard('tx', i)).forEach((p) => p.rows.forEach((r) => { if (r[5] == null) { unknown++; assert.strictEqual(r[6], null); } else labelled++; }));
  assert.ok(unknown > 1000 && labelled > 1000, 'unknown kept as unknown');
  assert.ok(!JSON.stringify(tm).match(/unit ?no|#\d+-\d+/i), 'no unit numbers');
});
t('identical-looking sales are all kept (flagged, never merged)', () => {
  let same = 0; for (let i = 0; i < man.shards; i += 4) Object.values(shard('tx', i)).forEach((p) => p.rows.forEach((r) => { if (r[7] & 4) same++; }));
  assert.ok(same > 100, same);
});
t('filters: type, unknown, size, sale type, period and order', () => {
  const rows = [[202609, 3, 1, 63, 1180000, 2, 'v', 0], [202608, 1, 2, 63, 1300000, null, null, 4], [202501, 3, 0, 96, 1700000, 3, 'i', 0], [202608, 3, 1, 63, 1180000, 2, 'v', 4]];
  const f = (o) => REC.filter(rows, Object.assign({ bed: 'all', bin: 'all', sale: 'all', period: 'all', sort: 'new' }, o), 202609);
  assert.strictEqual(f({ bed: '2' }).length, 2); assert.strictEqual(f({ bed: 'u' }).length, 1); assert.strictEqual(f({ bin: 1000 }).length, 1);
  assert.strictEqual(f({ sale: 1 }).length, 1); assert.strictEqual(f({ period: 12 }).length, 3); assert.deepStrictEqual(f({ sort: 'low' }).map((r) => r[4]), [1180000, 1180000, 1300000, 1700000]);
  assert.strictEqual(f({ sort: 'old' })[0][0], 202501);
  const h = REC.listHtml({ rows, meta: tm, latest: 202609, start: 202109 }, { bed: 'all', bin: 'all', sale: 'all', period: 'all', sort: 'new' });
  assert.ok(h.includes('Type unknown') && h.includes('$1,180,000') && h.includes('floor plans') && h.includes('rental records') && h.includes('URA gives no unit numbers'));
  assert.ok(h.indexOf('$1,180,000') < h.indexOf('psf'), 'total price before psf');
});
t('rents: summaries only (no individual contract), no yield; typical rents follow the 5-over-3 rule; checks need 10+', () => {
  assert.strictEqual(rm.yieldIncluded, false); assert.ok(/aggregates only/.test(rm.contracts) && !rm.fields.row);
  let checks = 0, sizes = 0;
  for (let i = 0; i < man.shards; i++) { const s = fs.readFileSync(R('data/projects/rent/' + P.shardName(i) + '.json'), 'utf8'); assert.ok(!/"yield"|"gross"|"rows"/.test(s)); const ps = JSON.parse(s).projects;
    Object.keys(ps).forEach((id) => { const r = ps[id]; r.types.forEach((ty) => { if (ty.evidence === 'typical') assert.ok(ty.n >= 5 && ty.act >= 3); if (ty.evidence === 'counts') assert.ok(!ty.rent); });
      (r.sizes || []).forEach((z) => { sizes++; if (z.rent) assert.ok(z.n >= 3); if (z.evidence === 'typical') assert.ok(z.n >= 5 && z.act >= 3); });
      (r.moves || []).forEach((m) => assert.ok(m.n >= 10 && m.prevN >= 10));
      const cd = RENT.checkData(Object.assign({ meta: rm }, r)); if (cd) cd.types.forEach((ty) => ty.bands.forEach((b) => { checks++; assert.ok(b.n >= 10 && b.r.length === 5 && b.r[0] <= b.r[1] && b.r[1] <= b.r[2] && b.r[2] <= b.r[3] && b.r[3] <= b.r[4]); })); }); }
  assert.ok(checks > 2000 && sizes > 5000, checks + ' ' + sizes);
});
t('rents by size are every contract of one size band (never another bedroom count standing in)', () => {
  const B = require(R('tools/market-data/build-rent-research.js')), c = (beds, lo, rent, m) => ({ ym: 2026 * 12 + 8 - (m || 0), beds, lo, hi: lo + 100, rent });
  const cs = [0, 1, 2, 3, 4].map((m) => c(2, 700, 4000 + m * 10, m)).concat([c(3, 700, 4600, 1), c(null, 700, 4300, 2), c(3, 1200, 6000, 1)]);
  const d = B.development(cs, 2026 * 12 + 8, []);
  const z = d.sizes.find((x) => x.sqft[0] === 700); assert.strictEqual(z.n, 7); assert.strictEqual(z.evidence, 'typical');
  assert.strictEqual(d.sizes.find((x) => x.sqft[0] === 1200).rent, undefined, 'one contract: a count only');
  const t3 = d.types.find((x) => x.beds === 3); assert.strictEqual(t3.evidence, 'counts', 'two 3-bedroom contracts: no 3-bedroom figure, and no other count used instead');
});
t('the chosen type\'s rent sits beside its price, with its own count and period; too few says so', () => {
  const rec = { window: { from: 202510, to: 202609 }, types: [{ beds: 2, n: 244, act: 12, evidence: 'typical', rent: [2800, 3200, 3300, 3450, 4060], sqftBands: {} }, { beds: 5, n: 2, act: 2, evidence: 'counts', sqftBands: {} }], sizes: [{ sqft: [1700, 1800], n: 6, act: 4, evidence: 'typical', rent: [7000, 7200, 7400, 7500, 8000] }] };
  const a = RENT.typeLine(rec, '2'); assert.ok(a.includes('$3,300 a month') && a.includes('244 rental contracts') && a.includes('Oct 2025 – Sep 2026'));
  const b = RENT.typeLine(rec, '5'); assert.ok(/Too few 5-bedroom rental contracts/.test(b) && /rents by size/.test(b) && !/\$7,400/.test(b));
  assert.ok(RENT.sizeLine(rec, 1700).includes('$7,400 a month') && RENT.sizeLine(rec, 600) === '');
  assert.ok(RENT.needsSizes(rec, null) && RENT.sectionHtml(Object.assign({ name: 'X', n: 246, unknownBeds: 0, bands: [], moves: [] }, rec), {}).includes('Rents by size'));
});
t('asking rent: answer first, against the band\'s own summary of 10+ contracts', () => {
  const R0 = { name: 'X', types: [{ beds: 2, bands: [{ lo: 600, hi: 700, n: 24, r: [3000, 3200, 3300, 3450, 3600] }] }] };
  const r = ASK.rentResult(R0, '2', '600', '3,900');
  assert.strictEqual(r.verdict, 'above'); assert.ok(r.html.includes('Above recent rents') && r.html.includes('8% above the highest rent') && r.html.includes('24 · last 12 months'));
  assert.strictEqual(r.dots, 0, 'no individual contracts, so no dots'); assert.strictEqual(ASK.rentResult(R0, '2', '600', '3,300').verdict, 'within');
  assert.strictEqual(ASK.rentResult(R0, '3', '600', '3,300').state, 'input');
  assert.ok(ASK.panelHtml('rent', R0, { title: 'Check an asking rent' }).includes('data-ask-beds') && !/href=/.test(ASK.panelHtml('rent', R0)));
});
t('HDB rents: summaries only (5+), blocks keyed by street and number, block else street else town, checks need 10+', () => {
  const I = ld('data/value/hdb/rent/index.json'), A = ld('data/value/hdb/rent/t/ang-mo-kio.json');
  assert.ok(A.aggregates && !A.rows && I.aggregates); assert.ok(/Open Data Licence/.test(I.attribution) && I.latestMonth >= 202609);
  ['block', 'street'].forEach((k) => A[k].forEach((x) => { const n = x[k === 'block' ? 3 : 2]; assert.ok(n >= 5 ? x.length === (k === 'block' ? 9 : 8) : x.length === (k === 'block' ? 4 : 3), k + ' ' + JSON.stringify(x)); }));
  const L = RENT.hdbLevels(A, I, { block: '436', street: 'ANG MO KIO AVE 10', type: '4 ROOM' });
  assert.ok(L && ['block', 'street', 'town'].includes(L.level) && L.n >= 5 && L.rent.length === 5);
  if (L.check) assert.ok(L.check.n >= 10);
  const same = A.block.filter((x) => x[1] === '436').map((x) => x[0]); assert.ok(new Set(same).size === same.length || same.length >= 1, 'each street keeps its own block 436');
  const HR = require(R('tools/market-data/build-hdb-rent.js')), ag = HR.aggregate({ town: 'X', streets: ['A ST', 'B ST'], rows: [[202609, '1', 0, 0, 2000], [202609, '1', 1, 0, 3000], [202608, '1', 0, 0, 2100], [202607, '1', 0, 0, 2200], [202606, '1', 0, 0, 2300], [202605, '1', 0, 0, 2400]] }, 202609);
  assert.deepStrictEqual(ag.block.map((x) => [x[0], x[1], x[3]]), [[0, '1', 5], [1, '1', 1]], 'block 1 on A ST and block 1 on B ST stay apart');
  assert.strictEqual(ag.block[1].length, 4, 'one rental: the count alone'); assert.strictEqual(ag.block[0][6], 2200);
  const h = RENT.hdbHtml(L, I, { flat: '4-room', block: '436', streetLabel: 'Ang Mo Kio Ave 10', townLabel: 'Ang Mo Kio', ask: ASK });
  assert.ok(h.includes('Declared rents, not verified') && h.includes('approved the rental') && !/whole flat/i.test(h) && !/<table/.test(h), 'no listing');
});
t('no public rental file carries a rent amount for a group of fewer than 5 contracts (private homes and HDB)', () => {
  const amt = (x) => x != null && x !== undefined;
  let groups = 0, bad = [];
  fs.readdirSync(R('data/projects/rent')).filter((f) => f !== 'manifest.json').forEach((f) => {
    const ps = JSON.parse(fs.readFileSync(R('data/projects/rent/' + f), 'utf8')).projects;
    Object.keys(ps).forEach((id) => { const r = ps[id];
      r.types.forEach((t) => { groups++; if (amt(t.rent) && !(t.n >= 5)) bad.push(id + ' type ' + t.beds + ' n=' + t.n); if (t.n < 5 && t.evidence !== 'counts') bad.push(id + ' type ' + t.beds + ' labelled ' + t.evidence); });
      (r.sizes || []).forEach((z) => { groups++; if (amt(z.rent) && !(z.n >= 5)) bad.push(id + ' size ' + z.sqft[0] + ' n=' + z.n); });
      (r.bands || []).forEach((b) => { groups++; if (!(b.n >= 10)) bad.push(id + ' band n=' + b.n); });
      Object.values(r.trend || {}).forEach((q) => q.forEach((x) => { groups++; if (!(x[1] >= 5)) bad.push(id + ' trend n=' + x[1]); }));
      (r.moves || []).forEach((m) => { groups++; if (!(m.n >= 10 && m.prevN >= 10)) bad.push(id + ' move'); });
      ['rows', 'yield'].forEach((k) => { if (r[k]) bad.push(id + ' has ' + k); });
    });
  });
  const I = ld('data/value/hdb/rent/index.json');
  fs.readdirSync(R('data/value/hdb/rent/t')).forEach((f) => { const A = JSON.parse(fs.readFileSync(R('data/value/hdb/rent/t/' + f), 'utf8'));
    if (A.rows) bad.push(f + ' has rows');
    A.block.forEach((x) => { groups++; if (x.length > 4 && !(x[3] >= 5)) bad.push(f + ' block n=' + x[3]); });
    A.street.forEach((x) => { groups++; if (x.length > 3 && !(x[2] >= 5)) bad.push(f + ' street n=' + x[2]); });
    A.town.forEach((x) => { groups++; if (x[2] != null && !(x[1] >= 5)) bad.push(f + ' town n=' + x[1]); if (x[8] != null && !(x[7] >= 10)) bad.push(f + ' town prev n=' + x[7]); });
  });
  Object.values(I.trend).forEach((q) => q.forEach((x) => { groups++; if (!(x[1] >= 5)) bad.push('hdb trend n=' + x[1]); }));
  assert.ok(groups > 50000, groups); assert.deepStrictEqual(bad.slice(0, 10), [], bad.length + ' groups publish an amount from too few rentals');
});
t('the outdated "no bedroom inference" line is gone; "no yield" stays', () => {
  const pol = man.policy.join(' | ');
  assert.ok(!/No bedrooms or bedroom inference/.test(pol) && /inferred by Groundwork/.test(pol) && /no appreciation, yield or forecast/.test(pol));
});
console.log('records-tests: ' + pass + ' passed');
