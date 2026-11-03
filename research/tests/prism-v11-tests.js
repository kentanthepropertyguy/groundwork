/* PRISM V1.1 r2 (GW-PRISM-V1.1-2026-11-03-A2): the publication gate and what it draws, in node.
   Run from the site folder:  node research/tests/prism-v11-tests.js
   1 the approved files pass: manifest pinned by sha256, the A1 -> DECILE -> A2 chain, 5 reports and exactly the 60 approved items
     (Kingsford Waterbay 17, Thomson Three 16, Hougang Central 1, Hundred Palms Residences 13, The Quinn 13); the supplements pair with the
     deployed V1 reports; the two V1.1-only entries are not V1 reports
   2 anything else fails closed: another manifest, chain, release or V1 pairing; a score, purchasing-power, affordability or forecast field
     or wording; a Market position (ranks withdrawn); unsold inventory or future transport with a value; a Market rank; a settling value;
     a missing measure with a value; an item without the A2 approval (the report is then not shown at all)
   3 the pages show every item as the report states it: positions, the peer-window line, every profile line (missing evidence named),
     the surrounding-market definition with Supply and Market, yields, income, the profile rule and comparison group; all 56 approved
     editorial texts are known and every one the data uses is shown verbatim; Market has no rank, decile or label
   4 pages: the two V1 assessments keep their verdict with the r2 supplement; Thomson Three, Hundred Palms Residences and The Quinn are
     evidence-profile pages (no verdict); Hougang Central stays income-only; with no V1.1 the V1 pages are byte for byte V1 and nothing
     else has a page; the previous (A1) files are refused by this page (rollback restores both together) */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const G = require(path.join(SITE, 'assets/js/gw-prism.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const v1 = JSON.parse(read('data/prism/v1/manifest.json')), mt = read('data/prism/v1.1/manifest.json'), m = JSON.parse(mt);
const SUPP = ['kingsford-waterbay', 'thomson-three', 'hougang-central'], ONLY = ['hundred-palms-residences', 'the-quinn'], ALL = SUPP.concat(ONLY);
const rep = (id) => read('data/prism/v1.1/reports/' + id + '.json'), R = (id) => JSON.parse(rep(id)), rep1 = (id) => JSON.parse(read('data/prism/v1/reports/' + id + '.json'));
const e1 = (id) => v1.reports.find((x) => x.id === id), e = (id) => m.reports.find((x) => x.id === id);
const v11 = (id, r) => { const v = G.model11(G.checkReport11(r || R(id), e(id), ONLY.indexOf(id) >= 0), e(id)); if (v) v.periods = m.dataPeriodsBySource; return v; };
const v1md = (id) => (e1(id) ? G.model(G.checkReport(rep1(id), e1(id)), v1) : null);
const page = (id) => G.compose(v1md(id), v11(id));

// ---- 1 the approved release
check('the r2 manifest is the approved file (sha256 pinned in the page)', sha(mt) === G.V11.MANIFEST, sha(mt));
check('release prism-v1.1-r2-release-2026-11-03-e48acc945f90, approval A2, chain A1 -> DECILE -> A2', m.datasetReleaseId === G.V11.RELEASE && m.approvalRef === 'GW-PRISM-V1.1-2026-11-03-A2' && m.approvalChain.join(' ') === 'GW-PRISM-V1.1-2026-11-01-A1 GW-PRISM-V1.1-2026-11-03-DECILE GW-PRISM-V1.1-2026-11-03-A2');
check('it supplements the deployed V1 release (GW-PRISM-V1-2026-10-31-A1); V1.1-only: Hundred Palms Residences and The Quinn', m.supplements.datasetReleaseId === v1.datasetReleaseId && m.supplements.approvalRef === v1.approvalRef && m.v11OnlyReports.join() === ONLY.join());
check('the folder holds only the manifest and the 5 reports', fs.readdirSync(path.join(SITE, 'data/prism/v1.1/reports')).sort().join() === ALL.slice().sort().map((x) => x + '.json').join() && fs.readdirSync(path.join(SITE, 'data/prism/v1.1')).sort().join() === 'manifest.json,reports');
const counts = {};
ALL.forEach((id) => {
  const t = rep(id);
  if (SUPP.indexOf(id) >= 0) check(id + ': pairs with the deployed V1 report (sha256)', sha(read('data/prism/v1/reports/' + id + '.json')) === e1(id).sha256 && m.supplements.reports.find((x) => x.id === id).sha256 === e1(id).sha256);
  else check(id + ': a V1.1-only entry (not in V1, supplementsV1Report null)', !e1(id) && JSON.parse(t).supplementsV1Report === null);
  check(id + ': its report matches the manifest (sha256)', sha(t) === e(id).sha256);
  let v = null; const pass = !throws(() => { G.checkManifest11(m, v1, e1(id) ? { id, sha256: e1(id).sha256 } : null); v = v11(id); });
  counts[id] = v ? v.items : 0;
  check(id + ': passes the gate with ' + e(id).items + ' approved items, as the manifest lists', pass && v && v.items === e(id).items, counts[id]);
});
check('exactly the 60 approved items: 17, 16, 1, 13, 13', ALL.map((id) => counts[id]).join() === '17,16,1,13,13' && Object.values(counts).reduce((a, b) => a + b, 0) === 60, counts);

// ---- 2 fails closed
const KW = R('kingsford-waterbay'), kwE = e('kingsford-waterbay'), kwP = { id: 'kingsford-waterbay', sha256: e1('kingsford-waterbay').sha256 }, HP = R('hundred-palms-residences'), hpE = e('hundred-palms-residences');
check('another approval reference (A1): refused', throws(() => G.checkManifest11(Object.assign(clone(m), { approvalRef: 'GW-PRISM-V1.1-2026-11-01-A1' }), v1, kwP)));
check('a draft manifest: refused', throws(() => G.checkManifest11(Object.assign(clone(m), { status: 'draft' }), v1, kwP)));
check('another approval chain (no decile amendment): refused', throws(() => G.checkManifest11(Object.assign(clone(m), { approvalChain: ['GW-PRISM-V1.1-2026-11-01-A1', 'GW-PRISM-V1.1-2026-11-03-A2'] }), v1, kwP)));
check('another release id: refused', throws(() => G.checkManifest11(Object.assign(clone(m), { datasetReleaseId: 'prism-v1.1-r2-release-other' }), v1, kwP)));
check('another V1 release: refused', throws(() => G.checkManifest11(m, Object.assign(clone(v1), { datasetReleaseId: 'prism-v1-release-other' }), kwP)));
check('a different V1 report on screen (pairing sha256): refused', throws(() => G.checkManifest11(m, v1, { id: 'kingsford-waterbay', sha256: '0'.repeat(64) })));
check('a V1 report listed as V1.1-only: refused', throws(() => G.checkManifest11(Object.assign(clone(m), { v11OnlyReports: ONLY.concat(['kingsford-waterbay']) }), v1, kwP)));
check('a manifest entry without its item count: refused', throws(() => { const x = clone(m); delete x.reports[0].items; G.checkManifest11(x, v1, kwP); }));
check('the previous (A1) manifest: refused by this page', throws(() => G.checkManifest11(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/prism-v11-a1-manifest.json'), 'utf8')), v1, kwP)));
check('a report under another approval: refused', throws(() => G.checkReport11(Object.assign(clone(KW), { release: { status: 'approved', approvalRef: 'GW-PRISM-V1.1-2026-11-01-A1' } }), kwE, false)));
check('a V1.1-only report claiming a V1 report (or the reverse): refused', throws(() => G.checkReport11(HP, hpE, false)) && throws(() => G.checkReport11(KW, kwE, true)));
check('a composite score: refused', throws(() => G.checkReport11(Object.assign(clone(KW), { compositeScore: 72 }), kwE, false)));
[['score', 72], ['score100', 72], ['overall', 1], ['purchasingPower', {}], ['affordability', {}], ['forecast', 'x'], ['launchedUnsoldPer100Homes2km', 1], ['pipelinePer100Homes2km', 1], ['lat', 1.3], ['kenTake', 'x'], ['notes', 'x']].forEach(([k, v]) => {
  const r = clone(KW); r.profile.lines[2].data[k] = v;
  check('a "' + k + '" field anywhere in a report: refused', throws(() => G.checkReport11(r, kwE, false)));
});
[['PRISM Score 72/100', 'a score out of 100'], ['within your purchasing power', 'purchasing power'], ['affordable for most buyers', 'affordability']].forEach(([w, n]) => {
  const r = clone(KW); r.profile.lines[2].statement += ' ' + w;
  check('wording with ' + n + ': refused', throws(() => G.checkReport11(r, kwE, false)));
});
{ const r = clone(KW); r.peerComparison.positions.push(Object.assign(clone(r.peerComparison.positions[1]), { dimension: 'M', itemId: 'A1-3/kingsford-waterbay/M' }));
  check('a Market position (the withdrawn Market rank): refused', throws(() => G.checkReport11(r, kwE, false))); }
const line = (r, ms) => r.profile.lines.find((l) => l.measure === ms);
{ const r = clone(KW); Object.assign(line(r, 'supply.unsoldInventory'), { status: 'available', data: { units: 120 } }); check('unsold inventory with a value: refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); Object.assign(line(r, 'infrastructure.futureTransport'), { status: 'available', data: { stations: [{ name: 'A planned station' }] } }); check('future transport with a value (no official LTA evidence): refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); line(r, 'market.backdrop').data.decile = 6; check('a Market decile: refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); line(r, 'market.backdrop').data.rank = { percentile: 50 }; check('a Market rank: refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(HP); line(r, 'resale.sustained').data.value = 12.6; check('a sustained value while settling: refused', throws(() => G.checkReport11(r, hpE, true))); }
{ const r = clone(KW); line(r, 'price.entry').data = { medianPrice: 1 }; check('a value for a measure marked not available: refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); r.profile.lines.push(Object.assign(clone(r.profile.lines[0]), { panel: 'S', measure: 'supply.pipelineCount' })); check('a line outside the approved profile: refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); r.rentalYield.bands[0].approval.state = 'pending'; check('an item without the A2 approval: the report is not shown (its count no longer matches the manifest)', G.model11(G.checkReport11(r, kwE, false), kwE) === null); }
{ const r = clone(KW); r.profile.lines[0].approval.approvalRef = 'GW-PRISM-V1.1-2026-11-01-A1'; check('an item under the earlier A1 reference only: the report is not shown', G.model11(G.checkReport11(r, kwE, false), kwE) === null); }

// ---- 3 what the pages show
const P = {}; ALL.forEach((id) => { P[id] = page(id); });
const html = {}, txt = {}; ALL.forEach((id) => { html[id] = G.pageHtml(P[id], { root: '../' }); txt[id] = text(html[id]); });
ALL.forEach((id) => {
  const r = R(id), t = txt[id];
  (r.peerComparison ? r.peerComparison.positions : []).forEach((x) => check(id + ' ' + x.dimension + ': position "' + x.bandLabel + '", ' + x.periodLabel + ', statement verbatim', t.includes(x.statement) && t.includes(x.bandLabel) && t.includes(x.periodLabel)));
  if (r.profile) {
    const miss = r.profile.lines.filter((l) => !t.includes(l.label) || !t.includes(l.statement)).map((l) => l.measure);
    check(id + ': all ' + r.profile.lines.length + ' profile lines, label and approved statement verbatim', miss.length === 0, miss);
    check(id + ': each line sits in its own dimension, with its status', r.profile.lines.every((l) => new RegExp('id="gwpDim' + l.panel + '"[^]*?data-gwp-line="' + l.measure.replace('.', '\\.') + '" data-gwp-status="' + l.status + '"').test(html[id].split('id="gwpDim' + l.panel + '"')[0] + 'id="gwpDim' + l.panel + '"' + html[id].split('id="gwpDim' + l.panel + '"')[1].split('data-gwp-pillar=')[0])));
    check(id + ': the profile rule ("There is no overall score.") and its comparison group (' + r.profile.comparisonGroup.developments + ' developments)', t.includes(r.profile.rule) && t.includes('Comparison group: ' + r.profile.comparisonGroup.rule + ' · ' + r.profile.comparisonGroup.developments + ' developments.'));
    const S = html[id].split('id="gwpDimS"')[1].split('data-gwp-pillar=')[0], Mk = html[id].split('id="gwpDimM"')[1];
    check(id + ': the surrounding-market definition with Supply and with Market', text(S).includes(r.profile.surroundingMarket) && text(Mk).includes(r.profile.surroundingMarket));
    check(id + ': missing evidence named: unsold inventory not available, future transport not yet assessed, known sites only', t.includes('Not available: unsold inventory has not been validated.') && t.includes('Not yet assessed: needs official LTA evidence for planned stations.') && t.includes('Known sites only; not a complete pipeline.'));
    const mb = text(Mk.split('data-gwp-yield')[0].split('data-gwp-income')[0]);
    check(id + ': Market is observational: no rank, decile or Above/Around/Below label, no peer position', !/\brank|decile|(Above|Around|Below) peers/i.test(mb) && !html[id].includes('data-gwp-v11="M"') && mb.includes('Observed transactions, not a prediction.'), mb.slice(0, 300));
  }
});
{ const r = KW, t = txt['kingsford-waterbay'];
  check('KW P: the peer window explanation (this development Oct 2024–Sep 2026; comparisons their own latest 12 to 36 months)', t.includes('This development: Oct 2024–Sep 2026. Comparison developments were measured over their own latest 12 to 36 months.'));
  r.rentalYield.bands.forEach((b) => {
    const f = (v) => v.toLocaleString('en-SG', { maximumFractionDigits: 2 });
    check('KW yield ' + b.band + ': rent, contracts, price, resales, yield, range, peer median as exported', t.includes('$' + b.typicalRent.toLocaleString('en-SG')) && t.includes(b.rentalContracts + ' contracts') && t.includes('$' + b.typicalResalePrice.toLocaleString('en-SG')) && t.includes(f(b.grossYieldPct) + '%') && t.includes('range ' + f(b.rangePct[0]) + '–' + f(b.rangePct[1]) + '%') && t.includes('Median ' + f(b.peerGroup.medianPct) + '% of ' + b.peerGroup.developments) && t.includes(b.positionText));
  });
  const H = r.householdIncome;
  check('KW income: Hougang, GHS 2025, shares and counts, context, geography, definition, conditions, attribution', [H.context, H.geographyNote, H.incomeDefinition, H.attribution].concat(H.conditions).every((x) => t.includes(x)) && H.atOrAbove.every((x) => t.includes(x.pct.toLocaleString('en-SG') + '%')));
}
{ const r = R('thomson-three'), t = txt['thomson-three'];
  check('TT yield: both bands (4.07%, 2.93%), below the peer median as exported', r.rentalYield.bands.every((b) => t.includes(b.grossYieldPct.toLocaleString('en-SG', { maximumFractionDigits: 2 }) + '%') && t.includes(b.positionText)));
  check('TT income: Bishan planning area, its context', t.includes('Bishan planning area') && t.includes(r.householdIncome.context));
  check('TT P: "In line with comparable condos", periods by bedroom type, the peer window line', t.includes('In line with comparable condos') && t.includes('1-bedroom Oct 2025–Sep 2026; 2-bedroom Aug 2025–Jul 2026; 3-bedroom Jul 2025–Jun 2026') && t.includes('Comparison developments were measured over their own latest 12 to 36 months.'));
  check('TT S: quiet area named, with "upcoming Thomson Reserve development" (neutral)', t.includes('Quiet area: local resales are among the lowest 30% of similar developments') && t.includes('upcoming Thomson Reserve development')); }
{ const t = txt['hundred-palms-residences'];
  check('HP R: the resale-wave explanation, settling, the analytical proxy (not an official MOP date)', t.includes('Initial resale-wave effect: 104 of the 134 resales in Oct 2024–Sep 2026 came in the first 12 months of the resale wave (Jan 2025–Dec 2025)') && t.includes('Settling: fewer than 12 months of resales after the first resale wave') && t.includes('not an official MOP date'));
  check('HP P: entry price by bedroom type with its illustrative note', t.includes('3-bedroom: median $1,850,000') && t.includes('A premium or a discount is not in itself an advantage or a disadvantage.')); }
check('The Quinn: "In line with comparable condos", 2 condo developments selling within 2 km', txt['the-quinn'].includes('In line with comparable condos') && txt['the-quinn'].includes('2 other condo developments sold new homes within 2 km'));
// the 56 approved editorial texts (A1 22 + A2 34): every one the data uses appears verbatim; templates are matched with their fields
const ED = JSON.parse(fs.readFileSync(path.join(__dirname, 'prism-v11-editorial.json'), 'utf8')), every = ALL.map((id) => txt[id]).join(' ');
const shownEd = (t) => (Array.isArray(t) ? t.every((x) => every.includes(x)) : new RegExp(t.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[a-zA-Z]+\\?\}/g, '.+?')).test(every));
const unusedEd = Object.keys(ED).filter((k) => !shownEd(ED[k]));
// unused by any approved item: the withdrawn Market label; bands and states no development has (below peers, a yield above its peers, a verified
// MOP date, a wave that ended before the period, a sustained rate after a wave); the planned-station rule (no station is assessed)
const EXPECT_UNUSED = ['peer.label.M', 'peer.band.below', 'yield.position.above', 'r2.resale.mop', 'r2.resale.pastWave', 'r2.resale.waveHeadlineSustained', 'r2.infra.futureRule'];
check('all 56 approved editorial texts are known (A1 22 + A2 34), and every one the data uses is shown verbatim (' + unusedEd.length + ' unused by any item: ' + unusedEd.join(', ') + ')', Object.keys(ED).length === 56 && unusedEd.slice().sort().join() === EXPECT_UNUSED.slice().sort().join(), unusedEd);
check('never on any page: a score out of 100, purchasing power, affordability or a forecast ("not scored", "There is no overall score." and V1’s "not a forecast" / "nothing here is a forecast" are approved wording)', ALL.every((id) => !/score\s*\/?\s*100|\/\s*100|purchasing|affordab|\bforecast/i.test(txt[id].replace(/(nothing here is|not) a forecast/g, ''))) && ALL.every((id) => !/\bscores?\b/i.test(txt[id].replace(/There is no overall score\.|PRISM gives no overall score\.?/g, ''))));
check('never: a sustained resale rate for a settling development, or an unsold figure', !/sustained activity is the observed activity/.test(txt['hundred-palms-residences']) && ALL.every((id) => !/unsold (homes|units)\s*[:=]?\s*\d/i.test(txt[id])));

// ---- 4 pages
check('KW and HC: their V1 assessment page (verdict first) with the r2 supplement', ['kingsford-waterbay', 'hougang-central'].every((id) => P[id].mode === 'assessment' && html[id].includes('class="gwp-card gwp-open"') && html[id].includes('PRISM Verdict') && P[id].v11));
check('TT, HP, The Quinn: evidence-profile pages (the same page, no verdict, nothing written in its place)', ['thomson-three', 'hundred-palms-residences', 'the-quinn'].every((id) => P[id].mode === 'profile' && G.hasPage(P[id]) && html[id].includes('data-gwp-mode="profile"') && !html[id].includes('gwp-card') && !/PRISM Verdict|Why\?|watch out/i.test(txt[id])));
check('TT keeps its V1 identity line (District, planning area) and none of its unassessed V1 measures', P['thomson-three'].meta.join(' · ').startsWith('District ') && !html['thomson-three'].includes('data-gwp-metric='));
check('HP and The Quinn: identity from the r2 comparison group (OCR, class)', P['hundred-palms-residences'].meta.join(' · ') === 'OCR · Executive condominium' && P['the-quinn'].meta.join(' · ') === 'OCR · Condominium');
check('Hougang Central: income only, in Market Demand; no position, yield or profile', html['hougang-central'].includes('data-gwp-income') && !html['hougang-central'].includes('data-gwp-yield') && !html['hougang-central'].includes('data-gwp-v11="') && !html['hougang-central'].includes('data-gwp-profile'));
const HL = (id) => (html[id].match(/data-gwp-headline><b>([^<]*)<\/b>(?:<small>([^<]*)<\/small>)?/g) || []).map((s) => text(s.replace('data-gwp-headline>', '')).trim());
check('KW headlines: Price from r2 (9.9% below…), the others V1 as before', HL('kingsford-waterbay')[0] === '9.9% below its local comparables Lower relative price than most peers · Oct 2024–Sep 2026' && HL('kingsford-waterbay')[1].startsWith('5th of 25 comparable developments'), HL('kingsford-waterbay'));
check('HP headlines: price position, observed resale rate with settling named, MRT and supermarkets, competition, Market change', HL('hundred-palms-residences').join(' | ') === ['22.7% above its local comparables Higher relative price than most peers · Oct 2025–Sep 2026', '12.6 resales per 100 homes a year Initial resale wave; sustained activity settling · Oct 2024–Sep 2026', 'Hougang MRT 1.6 km · 8 supermarkets within 1 km Straight-line distances', 'No other EC development sold new homes within 2 km Oct 2025–Sep 2026', '−0.8% condo and EC resales within 2 km Oct 2025–Sep 2026 against Oct 2024–Sep 2025'].join(' | '), HL('hundred-palms-residences'));
check('TT headlines: "In line with comparable condos" by bedroom type; quiet area named; −24.7%', HL('thomson-three')[0] === '0.7% above its local comparables In line with comparable condos · 12-month periods by bedroom type' && HL('thomson-three')[3] === '1 other condo development sold new homes within 2 km Oct 2025–Sep 2026 · Quiet area' && HL('thomson-three')[4].startsWith('−24.7% condo and EC resales'), HL('thomson-three'));
check('the Property Data link on profile pages ("See prices by size") and the calculator, nothing passed', ['thomson-three', 'hundred-palms-residences', 'the-quinn'].every((id) => html[id].includes('href="#/p/' + id + '" data-gwp-evidence="lgTypes"') && html[id].includes('tools/payment-planner/" data-gwp-calc>')));
check('a profile page\'s Property Data has the PRISM switch but no verdict line', ['thomson-three', 'hundred-palms-residences'].every((id) => G.previewHtml(P[id], '../') === '' && /data-gwp-view="prism"/.test(G.switchHtml(P[id], 'data', '../'))));
// no V1.1 (missing, changed or refused): the V1 pages are exactly V1; nothing else has a page
const OLD = (() => { try { return require(path.join(SITE, 'research/tests/fixtures/gw-prism-v1.js')); } catch (x) { return null; } })();
SUPP.forEach((id) => {
  const a = G.compose(v1md(id), null);
  if (OLD && a.assessment) { const b = OLD.model(OLD.checkReport(rep1(id), e1(id)), v1); check(id + ': with no V1.1 the page is byte for byte the deployed V1 page', G.pageHtml(a, { root: '../' }) === OLD.pageHtml(b, { root: '../' })); }
  if (!a.assessment) check(id + ': with no V1.1, no page (as in V1)', !G.hasPage(a) && G.pageHtml(a, { root: '../' }) === '');
});
check('HP and The Quinn with no V1.1: no page at all', ONLY.every((id) => G.compose(null, null) === null && !G.hasPage(G.compose(null, null))));
check('names and numbers come from the data, never the code', !/Kingsford|Hougang|Thomson|Hundred Palms|Quinn|6\.4|22\.7|1,060/.test(read('assets/js/gw-prism.js')));
console.log('prism-v11-tests: ' + ok + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
