/* Neighbourhood Intelligence V2 Batch 1 (combined release candidate, 5 Nov 2026), in node: the eight corrected area files and the
   renderer's support for several areas. Run from the site folder:  node research/tests/area-batch1-tests.js
   1 the eight files are the ones Research & Data verified (r2 QA 183/183: sha256 and release id), with matching development files; the
     approved index still lists Hougang only, so no Batch 1 page or link is shown before Ken's editorial approval
   2 no approved finding yet: every Batch 1 file fails closed (no page), exactly as an unapproved file must
   3 the renderer, on each file with TEST findings injected here only (never in a data file): the HDB medians under the area's own key; a
     median below the resale threshold and a below-threshold record read "Not shown" with the data's reason, never a number; deferred and
     withheld records still read "Not published in this release"
   4 fail closed: a median under another area's key, a value on a below-threshold record, a finding that cites one, a below-threshold
     median that also has a value */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const A = require(path.join(SITE, 'assets/js/gw-area.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 600)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const clone = (o) => JSON.parse(JSON.stringify(o));
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };

// the r2 package's verified files (Research & Data review; QA 183 / 183)
const R2 = {
  'sengkang': ['Sengkang', '7c739c5b2ca6e1bfd5470e12a41a50ccdb94528ab79c4d349e4d5139e56c26d4', 'ni-v2-sengkang-2026-11-05-294748426814', '8680a7b635a31cd6c2ba97a86ec6cc8b28e70781116be763ad24a8a6eb2413e3'],
  'punggol': ['Punggol', 'db6f6d174aa34cfd1a925b8461cae4e9e80fa77f7d415c3e0697431cc08d93ba', 'ni-v2-punggol-2026-11-05-33dcbde58fb5', 'd16e925daeb3287e75e966530cc285e894c321cae9f8a4ee6aeb1d2d4d78f3fd'],
  'serangoon': ['Serangoon', '95d498411ca06e916ed288373b6ffde8d443dd8d665c992c64c84b9e9663fbf3', 'ni-v2-serangoon-2026-11-05-5ec24ce24373', '1be2804f00c2b894d2870bbd625338a3123de4ef979a92bcd25e26a9947e66fe'],
  'toa-payoh': ['Toa Payoh', '641f0183197d9a954379e5c62ea5e8cd5435baff58e9fb1d758d842628f6716b', 'ni-v2-toa-payoh-2026-11-05-a2291eaf18d5', '9102a4c35336e9b9d13a6cc4894cc6e3c87e3bd44565d9ab2da9cf5c5f4b227c'],
  'bishan': ['Bishan', '660446a706a2f284cdc622fe3b8d5d482a67cbe67b487ffb48990cf5aa0c5ef8', 'ni-v2-bishan-2026-11-05-3cb512c0a9c7', '76fd3bebdb6f78169eba0aa73334bdae0be42a471f5214b63b2b182623e9086d'],
  'ang-mo-kio': ['Ang Mo Kio', '4f9288b4560616f8d4ff2a12614fb205d6058d9c0787bb22a84d7d6930e820f8', 'ni-v2-ang-mo-kio-2026-11-05-e3e1caab2ba7', 'e821fa62e1d6d2505fc7e0232f1ecef51b48e5ccf04f3e7573587a0716714cb9'],
  'tampines': ['Tampines', '437f8191ffcec4069126a4702bd69e238e7a425f9ee8eeb188bc3e8ed1d42433', 'ni-v2-tampines-2026-11-05-0b09a3134c2e', 'b55aaa1e412407c5403bcbb770498943a13918915b6a32ef691fd396b2901af9'],
  'bedok': ['Bedok', '3261227ffe8307a15e3b1cc6f1798ac5085e026d44a7beced7dafcb0001713ec', 'ni-v2-bedok-2026-11-05-649a9a24dcfd', 'f04769d0da60734a8a338244d7bda3da3aafff729fc56781902b1ba0e49522ea']
};
const reg = new Set(JSON.parse(read('data/registry/index.json')).rows.map((r) => r[0]));
const ix = A.checkIndex(JSON.parse(read(A.NI.DIR + 'index.json')));

// 1 the files
const listed = (id) => ix.areas.find((a) => a.id === id) || null;
check('the index lists Hougang first, and a Batch 1 area only once it carries approved findings (' + ix.areas.map((a) => a.id).join(', ') + ')', ix.areas[0].id === 'hougang' && ix.areas.slice(1).every((a) => R2[a.id]), ix.areas.map((a) => a.id));
const hg = ix.areas[0];
check('Hougang: the neighbour-corrected file verified in r2 (36fcc580…) with only its status set to approved (rc2: 120b1e32…), release r3, and its development file carries the same release id', hg.sha256 === '120b1e325c7743d99b339970e6a86f1353c7b0293448a240ea1d7c5249165a8c' && /^approved for publication/.test(JSON.parse(read(A.NI.DIR + 'hougang.json')).status) && hg.releaseId === 'ni-v1-hougang-2026-11-05-r3-7da61d610c1c' &&
  A.checkDevelopments(JSON.parse(read(A.NI.DIR + hg.developmentsPath)), hg).length === 132);
const E = {}, D = {};
Object.keys(R2).forEach((id) => {
  const [name, s, rel, ds] = R2[id], t = read(A.NI.DIR + id + '.json'), dt = read(A.NI.DIR + id + '-developments.json'), L = listed(id);
  E[id] = L || { id, name, path: id + '.json', sha256: s, releaseId: rel, developmentsPath: id + '-developments.json', developmentsSha256: ds };
  D[id] = JSON.parse(t);
  if (L) check(id + ': listed: the file and development file are the ones the index pins (' + L.releaseId + ')', sha(t) === L.sha256 && sha(dt) === L.developmentsSha256 && D[id].releaseId === L.releaseId);
  else check(id + ': not listed: the verified r2 file (sha256 ' + s.slice(0, 12) + '…, ' + rel + ') and development file', sha(t) === s && sha(dt) === ds && D[id].releaseId === rel);
  const ids = A.checkDevelopments(JSON.parse(dt), E[id]);
  check(id + ': ' + ids.length + ' developments, all Registry developments, none twice', ids.every((x) => reg.has(x)) && new Set(ids).size === ids.length);
});
// 2 no approved finding: no page
Object.keys(R2).forEach((id) => {
  if (!listed(id)) { check(id + ': no approved finding in the file, so no page (fails closed)', D[id].insights.length === 0 && throws(() => A.checkArea(D[id], E[id]))); return; }
  const m = A.checkArea(D[id], E[id]), h = A.pageHtml(m, { id, root: '../' });
  check(id + ': listed with ' + D[id].insights.length + ' approved finding(s), each on the page word for word with its qualifier', D[id].insights.length > 0 && D[id].insights.every((i) => { const li = new RegExp('<li data-gwa-insight="' + i.id.replace('.', '\\.') + '">([\\s\\S]*?)</li>').exec(h); return li && text(li[1]).indexOf(i.text) === 0 && text(li[1]).indexOf(i.qualifier) > 0; }));
});

// 3 the renderer, with TEST findings injected here only
const withTest = (d) => { if (d.insights.length) return clone(d); const x = clone(d), live = (k) => { const it = ['stock', 'activity', 'liquidity', 'upgraderContext', 'futureSupply'].map((s) => x[s] || []).reduce((a, b) => a.concat(b), []).find((i) => i.id === k); return it && it.status === 'publishable' ? [k] : []; };
  x.insights = [['insight.1', 'stock.privateShare'], ['insight.2', 'liquidity.condo'], ['insight.3', 'liquidity.condo'], ['insight.5', 'context.hdbMedianPrices']].map(([i, k]) => ({ id: i, text: 'TEST ' + i, qualifier: 'TEST qualifier ' + i + '. Second sentence.', period: '2025-10 to 2026-09', sourceIds: [], itemIds: live(k) }));
  return x; };
Object.keys(R2).forEach((id) => {
  const m = A.checkArea(withTest(D[id]), E[id]), h = A.pageHtml(m, { id, root: '../' }), t = text(h), med = m.items['context.hdbMedianPrices'];
  const S = A.summaryOf(m), five = med.values['5-room'][id];
  check(id + ': summary 5-room median is the area\'s own ($' + five.toLocaleString('en-SG') + ')', S.figs.some((f) => f.k === 'prices' && f.v === '$' + five.toLocaleString('en-SG')), S.figs.map((f) => f.v));
  const rows = A.rowsOf(m, med);
  check(id + ': every published median row is the area\'s own value; every below-threshold type reads "Not shown" with its resales', Object.keys(med.values).every((ty) => rows.some((r) => r.label === 'Median ' + ty + ' HDB resale' && r.fig === '$' + med.values[ty][id].toLocaleString('en-SG'))) &&
    (med.belowThreshold || []).every((b) => rows.some((r) => r.label === 'Median ' + b.type + ' HDB resale' && r.fig === A.NOT_SHOWN && r.sub.indexOf(b.resales + ' resale') === 0)), rows);
  const bt = ['liquidity'].map((s) => D[id][s]).reduce((a, b) => a.concat(b), []).filter((x) => x.status === 'below_threshold');
  check(id + ': ' + (bt.length ? 'the below-threshold record (' + bt.map((x) => x.id).join(', ') + ') reads "Not shown" with its reason' : 'no below-threshold record'), bt.every((x) => { const r = A.rowsOf(m, m.items[x.id]); return r.length === 1 && r[0].fig === A.NOT_SHOWN && t.indexOf(x.reason.replace(/^Not shown:\s*/, '').slice(1, 40)) > 0; }));
  const un = ['futureSupply'].map((s) => D[id][s]).reduce((a, b) => a.concat(b), []).filter((x) => x.status === 'deferred' || x.status === 'withheld');
  check(id + ': deferred and withheld records still read "' + A.NOT_PUBLISHED + '"', un.length > 0 && un.every((x) => A.rowsOf(m, m.items[x.id])[0].fig === A.NOT_PUBLISHED));
  check(id + ': no "NaN", "undefined" or empty $ on the page', !/NaN|undefined|\$(?![0-9])/.test(t));
});
check('Ang Mo Kio: the Executive median (7 resales) is not shown as a price', (() => { const m = A.checkArea(withTest(D['ang-mo-kio']), E['ang-mo-kio']), r = A.rowsOf(m, m.items['context.hdbMedianPrices']).find((x) => /Executive/.test(x.label)); return r && r.fig === 'Not shown' && /^7 resales · Medians are given only where there were at least 10 resales/.test(r.sub); })());

// RC2 (Master Planning, 5 Nov 2026): Serangoon's one-for-one ratio reads "1.0 : 1 — HDB flats to private homes" in the summary card AND the
// Homes row, from the renderer only (serangoon.json and its pinned hash unchanged); every other area keeps the data's own figure and label
{
  const IX = JSON.parse(read(A.NI.DIR + 'index.json')), nb = (s) => String(s).replace(/\u00a0/g, ' ');
  check('Serangoon\'s data file is the approved one, unchanged (value 1, its own label)', sha(read(A.NI.DIR + 'serangoon.json')) === 'c6baacfdf7731e4dd60b2c4b7ae585a9f6e7209a0c2d7fb56d7dd67d12b8a8bf' && D.serangoon.stock.find((x) => x.id === 'stock.privateShare').value === 1);
  IX.areas.forEach((e) => {
    const d = JSON.parse(read(A.NI.DIR + e.path)), m = A.checkArea(d, e), x = m.items['stock.privateShare'], h = A.summaryOf(m).figs.find((f) => f.k === 'homes'), r = A.rowsOf(m, x)[0];
    const t = text(A.pageHtml(m, { id: e.id, root: '../' }));
    if (e.id === 'serangoon') {
      check('Serangoon summary card: "1.0 : 1" and "HDB flats to private homes" (one line, no wrap inside the ratio)', nb(h.v) === '1.0 : 1' && h.label === 'HDB flats to private homes' && h.v.indexOf('\u00a0') > 0, h);
      check('Serangoon Homes row: "HDB flats to private homes" | "1.0 : 1"', r.label === 'HDB flats to private homes' && nb(r.fig) === '1.0 : 1', r);
      check('Serangoon page: reads "1.0 : 1 HDB flats to private homes", never "1 HDB flats for every private home"', /1\.0 : 1 HDB flats to private homes/.test(nb(t)) && !/for every private home/.test(nb(t)));
    } else {
      const v = x.value.toLocaleString('en-SG', { maximumFractionDigits: 1 });
      check(e.id + ': card and Homes row unchanged (' + v + ' | ' + x.label + ')', h.v === v && h.label === x.label && r.label === x.label && r.fig === v && x.label === 'HDB flats for every private home', [h, r]);
    }
  });
}

// 4 fail closed
const tp = () => withTest(D['toa-payoh']), med = (d) => d.upgraderContext.find((x) => x.id === 'context.hdbMedianPrices');
check('fails closed: a median under another area\'s key', throws(() => { const d = tp(); const v = med(d).values['4-room']; v.hougang = v['toa-payoh']; delete v['toa-payoh']; A.checkArea(d, E['toa-payoh']); }));
check('fails closed: a value on a below-threshold record', throws(() => { const d = tp(); d.liquidity.find((x) => x.id === 'liquidity.ec').value = 1.2; A.checkArea(d, E['toa-payoh']); }));
check('fails closed: a finding that cites a below-threshold record', throws(() => { const d = tp(); d.insights[1].itemIds = ['liquidity.ec']; A.checkArea(d, E['toa-payoh']); }));
check('fails closed: a below-threshold median type that also has a value', throws(() => { const d = withTest(D['ang-mo-kio']); med(d).values.Executive = { 'ang-mo-kio': 900000, n: 7, singapore: 915000, nSingapore: 1531 }; A.checkArea(d, E['ang-mo-kio']); }));
check('the TEST findings exist only in this test: no data file contains "TEST "', Object.keys(R2).concat(['hougang']).every((id) => read(A.NI.DIR + id + '.json').indexOf('TEST ') < 0));

console.log('\narea-batch1-tests: ' + ok + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
