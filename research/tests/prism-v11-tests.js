/* PRISM V1.1 (A1) supplement: the publication gate and what it draws, in node.
   Run from the site folder:  node research/tests/prism-v11-tests.js
   1 the approved files pass, pair with the deployed V1 reports, and carry exactly the 14 A1 items (7, 6, 1)
   2 anything else fails closed: another manifest, another V1 release or report, a score, purchasing-power or affordability, S3/S4 or OneMap
     fields, an item without the A1 approval (dropped)
   3 the page shows each item as the report states it: statements, periods, peer counts, yields, income shares, the approved editorial texts
   4 with no V1.1 (missing or refused) the page is byte for byte the deployed V1 page; Thomson Three still has no page */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const G = require(path.join(SITE, 'assets/js/gw-prism.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 300)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
const v1 = JSON.parse(read('data/prism/v1/manifest.json')), m11t = read('data/prism/v1.1/manifest.json'), m11 = JSON.parse(m11t);
const IDS = ['kingsford-waterbay', 'thomson-three', 'hougang-central'];
const rep11 = (id) => read('data/prism/v1.1/reports/' + id + '.json'), rep1 = (id) => JSON.parse(read('data/prism/v1/reports/' + id + '.json'));
const e1 = (id) => v1.reports.find((x) => x.id === id), e11 = (id) => m11.reports.find((x) => x.id === id);
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---- 1 the approved release
check('the V1.1 manifest is the approved file (sha256 pinned in the page)', sha(m11t) === G.V11.MANIFEST, sha(m11t));
check('it supplements the deployed V1 release (GW-PRISM-V1-2026-10-31-A1)', m11.supplements.datasetReleaseId === v1.datasetReleaseId && m11.supplements.approvalRef === v1.approvalRef);
const counts = {};
IDS.forEach((id) => {
  const t = rep11(id);
  check(id + ': the deployed V1 report is the one V1.1 pairs with (sha256)', sha(read('data/prism/v1/reports/' + id + '.json')) === e1(id).sha256 && m11.supplements.reports.find((x) => x.id === id).sha256 === e1(id).sha256);
  check(id + ': its V1.1 report matches the manifest (sha256)', sha(t) === e11(id).sha256);
  let v = null; const okGate = !throws(() => { G.checkManifest11(m11, v1, { id: id, sha256: e1(id).sha256 }); v = G.model11(G.checkReport11(JSON.parse(t), e11(id))); });
  counts[id] = v ? v.items : 0;
  check(id + ': passes the gate, ' + e11(id).items + ' items as the manifest lists', okGate && v && v.items === e11(id).items, counts[id]);
});
check('exactly the 14 A1 items: Kingsford Waterbay 7, Thomson Three 6, Hougang Central 1', counts['kingsford-waterbay'] === 7 && counts['thomson-three'] === 6 && counts['hougang-central'] === 1 && Object.values(counts).reduce((a, b) => a + b, 0) === 14, counts);

// ---- 2 fails closed
const KW = JSON.parse(rep11('kingsford-waterbay')), kwE = e11('kingsford-waterbay'), kwP = { id: 'kingsford-waterbay', sha256: e1('kingsford-waterbay').sha256 };
check('another approval reference: refused', throws(() => G.checkManifest11(Object.assign(clone(m11), { approvalRef: 'GW-PRISM-V1.1-2026-10-31-P1' }), v1, kwP)));
check('a draft manifest: refused', throws(() => G.checkManifest11(Object.assign(clone(m11), { status: 'draft' }), v1, kwP)));
check('another V1 release: refused', throws(() => G.checkManifest11(m11, Object.assign(clone(v1), { datasetReleaseId: 'prism-v1-release-other' }), kwP)));
check('a different V1 report on screen (pairing sha256): refused', throws(() => G.checkManifest11(m11, v1, { id: 'kingsford-waterbay', sha256: '0'.repeat(64) })));
check('a report under another approval: refused', throws(() => G.checkReport11(Object.assign(clone(KW), { release: { status: 'approved', approvalRef: 'TEST' } }), kwE)));
check('a composite score: refused', throws(() => G.checkReport11(Object.assign(clone(KW), { compositeScore: 72 }), kwE)));
[['overallScore', 1], ['score100', 1], ['comparisonScore', 1], ['purchasingPower', {}], ['affordability', {}], ['everydayAccess', {}], ['oneMapPositions', []], ['pipeline2km', 1], ['launchedUnsold2km', 1], ['kenTake', 'x']].forEach(([k, v]) => {
  const r = clone(KW); r.peerComparison.positions[0][k] = v;
  check('a "' + k + '" field anywhere in a report: refused', throws(() => G.checkReport11(r, kwE)));
});
{ const r = clone(KW); r.rentalYield.bands[0].approval.state = 'pending'; const v = G.model11(G.checkReport11(r, kwE));
  check('an item without the A1 approval is dropped (the other items stay)', v.yield.bands.length === 2 && v.items === 6); }
{ const r = clone(KW); r.peerComparison.positions.forEach((x) => { x.approval.approvalRef = 'GW-PRISM-V1.1-2026-10-31-P1'; }); const v = G.model11(G.checkReport11(r, kwE));
  check('items under the earlier P1 approval are not shown', Object.keys(v.positions).length === 0); }

// ---- 3 what the page shows
const md = G.model(G.checkReport(rep1('kingsford-waterbay'), e1('kingsford-waterbay')), v1);
md.v11 = G.model11(G.checkReport11(KW, kwE)); md.v11.periods = m11.dataPeriodsBySource;
const html = G.dimsHtml(md), text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
KW.peerComparison.positions.forEach((x) => {
  check('KW ' + x.dimension + ': the approved statement, verbatim', text.includes(x.statement), x.statement);
  check('KW ' + x.dimension + ': its label with its exact period (' + x.bandLabel + ', ' + x.periodLabel + ')', text.includes(x.bandLabel) && text.includes(x.periodLabel));
});
check('KW P: the peer window explanation (this development Oct 2024–Sep 2026; comparisons their own latest 12 to 36 months)', text.includes('This development: Oct 2024–Sep 2026. Comparison developments were measured over their own latest 12 to 36 months.'));
check('KW P: the headline is its approved position, not "Not assessed"', /data-gwp-pillar="P"[\s\S]*?9\.9% below its local comparables[\s\S]*?Lower relative price than most peers · Oct 2024–Sep 2026/.test(html) && !/data-gwp-pillar="P"[^]*?gwp-dim--none/.test(html.split('data-gwp-pillar="R"')[0]));
check('KW: peer group rule and count (116 developments), sample 1,157 homes', text.includes(KW.peerComparison.peerGroup.rule) && text.includes('116 developments') && text.includes('1,157 homes'));
KW.rentalYield.bands.forEach((b) => {
  const f = (v) => v.toLocaleString('en-SG', { maximumFractionDigits: 2 });
  check('KW yield ' + b.band + ': rent, contracts, price, resales, yield, range, peer median and count as exported', text.includes('$' + b.typicalRent.toLocaleString('en-SG')) && text.includes(b.rentalContracts + ' contracts') && text.includes('$' + b.typicalResalePrice.toLocaleString('en-SG')) && text.includes(b.resales + ' resales') &&
    text.includes(f(b.grossYieldPct) + '%') && text.includes('range ' + f(b.rangePct[0]) + '–' + f(b.rangePct[1]) + '%') && text.includes('Median ' + f(b.peerGroup.medianPct) + '% of ' + b.peerGroup.developments) && text.includes(b.positionText));
});
check('KW yield: caption (with the lease), range, peers and short-lease rules, period Oct 2025–Sep 2026', text.includes(KW.rentalYield.caption) && text.includes(KW.rentalYield.rules.range) && text.includes(KW.rentalYield.rules.peers) && text.includes(KW.rentalYield.rules.shortLease) && text.includes('Oct 2025–Sep 2026'));
const H = KW.householdIncome;
check('KW income: Hougang, GHS 2025, 79,400 households, the four shares and counts as exported', text.includes('Hougang planning area') && text.includes('GHS 2025') && text.includes('79,400') && H.atOrAbove.every((x) => text.includes(x.pct.toLocaleString('en-SG', { maximumFractionDigits: 2 }) + '%') && text.includes(x.households.toLocaleString('en-SG'))));
check('KW income: "This describes the area, not buyers.", the geography note, the definition, every condition and the attribution', [H.context, H.geographyNote, H.incomeDefinition, H.attribution].concat(H.conditions).every((t) => text.includes(t)));
// the 22 approved editorial texts: each one this page's data uses appears verbatim (the rest are bands this data does not have)
const A1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'prism-v11-editorial.json'), 'utf8'));
const TT = JSON.parse(rep11('thomson-three')), mdT = G.model(G.checkReport(rep1('thomson-three'), e1('thomson-three')), v1);
mdT.v11 = G.model11(G.checkReport11(TT, e11('thomson-three'))); mdT.v11.periods = m11.dataPeriodsBySource;
const textT = (G.v11Html(mdT, 'P') + G.v11Html(mdT, 'R') + G.v11Html(mdT, 'M')).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const both = text + ' ' + textT, fill = (t) => t.replace('{planningArea}', 'Hougang').replace('{class}', 'condo').replace('{segment}', 'OCR');
const missing = Object.keys(A1).filter((k) => { const t = A1[k]; return Array.isArray(t) ? !t.every((x) => both.includes(x)) : !both.includes(fill(t)) && !both.includes(fill(t).replace('Hougang', 'Bishan')); });
const unused = ['yield.position.above'];   // no approved band is above its peer median (peer.priceBand.around has the same words as peer.band.around)
check('all 22 approved editorial texts are known, and every one the data uses is shown verbatim (unused by any item: ' + unused.join(', ') + ')', Object.keys(A1).length === 22 && missing.every((k) => unused.indexOf(k) >= 0) && unused.every((k) => missing.indexOf(k) >= 0), missing);
check('never: a score ("not scored" is the approved wording), purchasing power, affordability, a forecast or OneMap wording in what V1.1 adds', !/\bscores?\b|\/\s*100|purchasing|affordab|forecast|onemap|everyday access/i.test(G.v11Html(md, 'P') + G.v11Html(md, 'R') + G.v11Html(md, 'M') + G.v11Html(mdT, 'P') + G.v11Html(mdT, 'M')));
check('the dimension list still says PRISM gives no overall score', G.layersHtml(md).includes('PRISM gives no overall score'));
{ const mdH = G.model(G.checkReport(rep1('hougang-central'), e1('hougang-central')), v1); mdH.v11 = G.model11(G.checkReport11(JSON.parse(rep11('hougang-central')), e11('hougang-central'))); mdH.v11.periods = m11.dataPeriodsBySource;
  const h = G.dimsHtml(mdH);
  check('Hougang Central: household income only, in Market Demand; no position or yield; Price Position still not assessed', h.includes('data-gwp-income') && !h.includes('data-gwp-yield') && !h.includes('data-gwp-v11="') && /data-gwp-pillar="P"[\s\S]*?Not assessed in this report/.test(h)); }

// ---- 4 no V1.1: exactly V1
const OLD = (() => { try { return require(path.join(SITE, 'research/tests/fixtures/gw-prism-v1.js')); } catch (e) { return null; } })();
IDS.forEach((id) => {
  const a = G.model(G.checkReport(rep1(id), e1(id)), v1);
  if (OLD) { const b = OLD.model(OLD.checkReport(rep1(id), e1(id)), v1); a.v11 = null;
    check(id + ': with no V1.1 the page is byte for byte the deployed V1 page', G.pageHtml(a, { root: '../' }) === OLD.pageHtml(b, { root: '../' })); }
  if (id === 'thomson-three') check('Thomson Three: still no PRISM page (no approved V1 assessment); its V1.1 items never make one', a.assessment === null && G.pageHtml(Object.assign(a, { v11: mdT.v11 }), { root: '../' }) === '');
});
console.log('prism-v11-tests: ' + ok + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
