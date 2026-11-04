/* Neighbourhood Intelligence V1 (Master Planning, 4 Nov 2026: Concept 1), in node, on the approved data in data/neighbourhood/v1/.
   Run from the site folder:  node research/tests/area-tests.js
   1 pins: the index is the file gw-area.js pins; each area file is the one the index pins, with its release id; Research search offers
     exactly the areas the index lists; every listed development is a Registry development
   2 the page states the data: every approved insight word for word with its qualifier, period and sources; the three summary figures
     equal their items; the one warning is the condo-resale insight's own; every source's attribution is shown
   3 display rules: planning area only (no radius view); Insight 3's two ranks together with its warning; 672 (all condo resales) and 643
     (the base of the 4.4 rate) never swapped; Hougang Central a dated award record, never in a supply count; deferred (S3) and withheld
     (S4) records read "Not published in this release" and future HDB supply "Not assessed", never a number, zero or "none"; no score,
     forecast or buyer / demand count; no internal process notes
   4 fail closed: a value on an unpublished record, a coordinate or address field, an insight without its qualifier, a source without its
     attribution, another release id or schema: no page */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const A = require(path.join(SITE, 'assets/js/gw-area.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 600)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const clone = (o) => JSON.parse(JSON.stringify(o));
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };

// 1 pins
const ixT = read(A.NI.DIR + 'index.json');
check('the neighbourhood index is the file gw-area.js pins (sha256)', sha(ixT) === A.NI.INDEX, [sha(ixT), A.NI.INDEX]);
const ix = A.checkIndex(JSON.parse(ixT));
const M = {}; ix.areas.forEach((e) => { const t = read(A.NI.DIR + e.path); check(e.id + ': the area file is the one the index pins (sha256 ' + e.sha256.slice(0, 12) + '…) with release ' + e.releaseId, sha(t) === e.sha256 && JSON.parse(t).releaseId === e.releaseId); M[e.id] = A.checkArea(JSON.parse(t), e); });
const html = read('research/index.html'), AR = /const AREAS = (\[[^\]]*\]);/.exec(html);
const searchAreas = AR ? Function('return ' + AR[1])() : null;
check('Research search offers exactly the areas the index lists (id and name)', JSON.stringify(searchAreas) === JSON.stringify(ix.areas.map((a) => ({ id: a.id, name: a.name }))), [searchAreas, ix.areas.map((a) => a.id)]);
const reg = new Set(JSON.parse(read('data/registry/index.json')).rows.map((r) => r[0])), DEV = {};
ix.areas.forEach((a) => {
  const t = read(A.NI.DIR + a.developmentsPath); check(a.id + ': the verified development file is the one the index pins (sha256 ' + a.developmentsSha256.slice(0, 12) + '…)', sha(t) === a.developmentsSha256);
  const ids = A.checkDevelopments(JSON.parse(t), a); DEV[a.id] = ids;
  check(a.id + ': every verified development (' + ids.length + ') is a Registry development; none listed twice', ids.every((d) => reg.has(d)) && new Set(ids).size === ids.length, ids.filter((d) => !reg.has(d)));
  check(a.id + ': the file holds Registry ids and names only (no position, distance or subzone)', JSON.parse(t).developments.every((x) => JSON.stringify(Object.keys(x)) === '["registryId","name"]'));
});
// Claude C r2 (4 Nov 2026): 132 developments inside the Master Plan 2019 Hougang boundary, by position (not postal district or name)
check('Hougang: the 132 verified developments, including Regentville, Kingsford Waterbay, Hougang Central and Hundred Palms Residences', DEV.hougang.length === 132 && ['regentville', 'kingsford-waterbay', 'hougang-central', 'hundred-palms-residences'].every((x) => DEV.hougang.indexOf(x) >= 0));
check('Hougang: developments just outside the boundary are not listed (Claude C\'s 15 within 100 m, e.g. the-quartz, stadia, bayou-residence)', ['austville-residences', 'bayou-residence', 'cambio-suites', 'evania', 'forest-woods', 'la-dolce-vita', 'seletar-view', 'serangoon-garden-view', 'space-at-kovan', 'stadia', 'the-lilium', 'the-quartz', 'the-silver-spurz', 'the-vue', 'yikai-court'].every((x) => DEV.hougang.indexOf(x) < 0));

const m = M.hougang, d = m.d, h = A.pageHtml(m, { id: 'hougang', root: '../' }), t = text(h);
// 2 the page states the data
check('every approved insight (' + d.insights.length + ') word for word, each with its qualifier, its period and its sources', d.insights.every((i) => {
  const li = new RegExp('<li data-gwa-insight="' + i.id.replace('.', '\\.') + '">([\\s\\S]*?)</li>').exec(h); if (!li) return false; const x = text(li[1]);
  return x.indexOf(i.text) === 0 && x.indexOf(i.qualifier) > 0 && x.indexOf(A.dates(i.period)) > 0 && i.sourceIds.every((s) => x.indexOf(m.src[s].publisher.replace(/ \([^)]*\)$/, '')) > 0);
}));
check('the findings heading counts them ("' + (/<h2 id="gwaFindH">([^<]*)/.exec(h) || [])[1] + '")', /<h2 id="gwaFindH">Seven findings</.test(h) === (d.insights.length === 7));
const S = A.summaryOf(m), I = (id) => m.items[id], ins = (id) => d.insights.find((x) => x.id === id);
check('summary: three figures, homes / condo resales / HDB prices, each the item\'s own value', S.figs.length === 3 && S.figs[0].v === String(I('stock.privateShare').value) && S.figs[1].v === String(I('liquidity.condo').value) &&
  S.figs[2].v === '$' + I('context.hdbMedianPrices').values['5-room'].hougang.toLocaleString('en-SG'), S.figs.map((f) => f.v));
check('summary: each figure carries its insight\'s qualifier and period', S.figs.every((f, k) => f.q === ins(['insight.1', 'insight.2', 'insight.5'][k]).qualifier && f.t === A.dates(ins(['insight.1', 'insight.2', 'insight.5'][k]).period)));
check('summary: "About 59,500 HDB flats and 23,100 private homes" is insight 1\'s own rounding', ins('insight.1').text.indexOf(S.figs[0].cmp.replace(/^About /, 'about ')) >= 0, S.figs[0].cmp);
check('summary: ONE warning, the condo-resale insight\'s own: "' + S.warn + '"', (h.match(/data-gwa-warn/g) || []).length === 1 && ins('insight.3').qualifier.indexOf(S.warn) === 0 && S.warn.length > 20);
check('every source\'s attribution is on the page (' + d.sources.length + ' sources)', d.sources.every((s) => t.indexOf(text(s.attribution)) >= 0));
// 3 display rules
check('planning area only: labelled as the planning area, not one development; no radius or 2 km view', /Neighbourhood · Hougang planning area/.test(t) && /not for any one development/.test(t) && !/\b2 km\b|within \d+ ?k?m|radius/i.test(t.replace(/[Ll]anded denominators and radius counts approximate/, '')));
const L = I('liquidity.condo');
check('Insight 3: both ranks together, with its warning, wherever the rank appears', t.indexOf(ins('insight.3').text + ' ' + ins('insight.3').qualifier) >= 0 && /joint 2nd of 35[^.]*joint 8th of 35/i.test(S.figs[1].cmp));
const rowsC = A.rowsOf(m, I('activity.condo')), rowsL = A.rowsOf(m, L);
check('672 (all condo resales) and 643 (the base of the 4.4 rate) never swapped', rowsC[0].fig === '672' && rowsL[0].fig === '4.4' && /Base: 643 resales/.test(rowsL[0].sub) && !/643/.test(rowsC[0].sub) && !/672/.test(rowsL[0].sub));
const ks = A.rowsOf(m, I('supply.knownSites'));
check('Hougang Central: a dated award record, never in a supply count', ks.length === 1 && ks[0].fig === 'Hougang Central' && /awarded/.test(ks[0].sub) && /January 2026/.test(ks[0].sub) && /not added to any supply count/.test(ks[0].sub) && I('supply.knownSites').inSupplyCount === false);
const un = d.futureSupply.filter((x) => ['deferred', 'withheld', 'not_assessed'].indexOf(x.status) >= 0);
check('unpublished records: deferred (S3) and withheld (S4) read "Not published in this release", future HDB supply "Not assessed"; never a number, zero or "none" (' + un.map((x) => x.id + ':' + x.status).join(', ') + ')',
  un.length >= 3 && un.every((x) => { const r = A.rowsOf(m, x); return r.length === 1 && r[0].fig === (x.status === 'not_assessed' ? A.NOT_ASSESSED : A.NOT_PUBLISHED) && !/\d|\bnone\b|\bzero\b/i.test(r[0].fig + ' ' + r[0].sub); }) &&
  ['supply.unsoldLaunched', 'supply.pipelineLocated'].every((k) => I(k) && ['deferred', 'withheld'].indexOf(I(k).status) >= 0));
const futureGroup = (new RegExp('<section class="gwp-dim" id="gwa-F"[\\s\\S]*?</section>').exec(h) || [''])[0];
check('Future supply: its headline names the known site and says the others are not published; no count of unsold or pipeline homes', /1 known site · Hougang Central/.test(futureGroup) && /2 supply figures not published in this release/.test(futureGroup) && !/unsold[^<]{0,40}\d|pipeline[^<]{0,40}\d/i.test(text(futureGroup)));
check('no score, forecast, rating, recommendation or buyer / upgrader / demand count', !/score\s*\/?\s*100|\/100|\brating\b|recommend|\bforecasts?\b(?! )|will (rise|fall|increase|decrease)|\b\d[\d,]* (buyers|upgraders)\b|demand of \d/i.test(t.replace(/No score and no forecast\./, '')));
check('no internal process notes on the page (Ken\'s PC, private imports, decision numbers, S3 / S4 codes)', !/Ken.s PC|private URA import|decision \d|\bS[34]\b|Master Planning|Claude/i.test(t), (t.match(/.{40}(Ken.s PC|private URA import|decision \d|\bS[34]\b|Master Planning|Claude).{40}/i) || [])[0]);
check('the public file itself carries no internal process note (it is downloadable)', !/Ken.s PC|private URA import/i.test(read(A.NI.DIR + 'hougang.json')));
check('the link under the PRISM dimensions carries words only, never a figure', !/\d/.test(text(A.linkHtml(ix.areas[0]))) && /href="#\/area\/hougang"/.test(A.linkHtml(ix.areas[0])));
// 4 fail closed
const raw = JSON.parse(read(A.NI.DIR + 'hougang.json')), e = ix.areas[0];
const bad = [
  ['a value on the deferred S3 record', (x) => { x.futureSupply.find((y) => y.id === 'supply.unsoldLaunched').value = 0; }],
  ['a value on the withheld S4 record', (x) => { x.futureSupply.find((y) => y.id === 'supply.pipelineLocated').value = 120; }],
  ['coordinates on an item', (x) => { x.stock[0].lat = 1.37; }],
  ['an address field', (x) => { x.futureSupply.find((y) => y.id === 'supply.knownSites').sites[0].address = 'Hougang Ave'; }],
  ['an insight without its qualifier', (x) => { delete x.insights[2].qualifier; }],
  ['a source without its attribution', (x) => { delete x.sources[0].attribution; }],
  ['an insight citing an unpublished record', (x) => { x.insights[0].itemIds.push('supply.pipelineLocated'); }],
  ['another release id', (x) => { x.releaseId = 'ni-v1-hougang-x'; }],
  ['another schema', (x) => { x.schemaVersion = 'gw-neighbourhood-v2'; }]];
bad.forEach(([n, f]) => { const x = clone(raw); f(x); check('fails closed: ' + n, throws(() => A.checkArea(x, e))); });
check('fails closed: an index entry with a malformed sha or development file', throws(() => A.checkIndex({ schemaVersion: 'gw-neighbourhood-v1-index', areas: [Object.assign(clone(e), { developmentsSha256: 'x' })] })) && throws(() => A.checkIndex({ schemaVersion: 'gw-neighbourhood-v1-index', areas: [Object.assign(clone(e), { sha256: 'x' })] })));
const dv = JSON.parse(read(A.NI.DIR + e.developmentsPath));
[['an id listed twice', (x) => { x.developments.push(x.developments[0]); x.count++; }], ['a count that differs', (x) => { x.count = 131; }], ['another release', (x) => { x.releaseId = 'ni-v1-hougang-x'; }],
 ['a position on a development', (x) => { x.developments[0].lat = 1.37; }], ['a malformed id', (x) => { x.developments[0].registryId = 'Bad Id'; }]].forEach(([n, f]) => { const x = clone(dv); f(x); check('fails closed (development list): ' + n, throws(() => A.checkDevelopments(x, e))); });
console.log('area-tests: %d passed, %d failed', ok, fail);
process.exit(fail ? 1 : 0);
