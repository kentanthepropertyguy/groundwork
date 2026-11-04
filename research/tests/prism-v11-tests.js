/* PRISM V1.1 nationwide, r3 format (GW-PRISM-R3-SCHEMA-20261103-01; approvals A1, DECILE, A2, NATIONWIDE-1): the publication gate and what it draws for the
   five curated reports approved before the nationwide batch, in node. (Every one of the 2,099 reports: prism-batch-tests.js.)
   Run from the site folder:  node research/tests/prism-v11-tests.js
   1 the approved files pass: index.json pinned by sha256; the release id and the A1 -> DECILE -> A2 -> NATIONWIDE-1 chain; 16 shards, each
     id in the shard its sha256 names; the five curated reports keep exactly their approved items (17, 16, 1, 13, 13) and content; the three
     supplements pair with the deployed V1 reports; the V1 pairing and data periods pinned in the page equal the release's own manifest
   2 anything else fails closed: another index, chain, release or manifest binding; a shard from another release, with another count or an
     id in the wrong shard; another V1 pairing; the previous A1 or A2 files; a score, purchasing-power, affordability or forecast field or
     wording; a Market position (ranks withdrawn); unsold inventory or future transport with a value; a Market rank; a settling value; a
     missing measure with a value; an item without the NATIONWIDE-1 approval (the report is then not shown at all)
   3 the pages show every item as the report states it: positions, the peer-window line, every profile line (missing evidence named),
     the surrounding-market definition with Supply and Market, yields, income, the profile rule and comparison group; the approved
     editorial texts are known and every one the data uses is shown verbatim; Market has no rank, decile or label
   4 pages: the two V1 assessments keep their verdict with the supplement; Thomson Three, Hundred Palms Residences and The Quinn are
     evidence-profile pages (no verdict); Hougang Central stays income-only; with no V1.1 the V1 pages are byte for byte V1 and nothing
     else has a page */
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
const v1 = JSON.parse(read('data/prism/v1/manifest.json')), it = read('data/prism/v1.1/index.json'), ix = JSON.parse(it), mt = read('data/prism/v1.1/manifest.json'), m = JSON.parse(mt);
const key = (id) => sha(id).charAt(0), shard = (k) => JSON.parse(read('data/prism/v1.1/index/' + k + '.json')), sEntry = (k) => ix.shards.find((x) => x.key === k);
const SUPP = ['kingsford-waterbay', 'thomson-three', 'hougang-central'], ONLY = ['hundred-palms-residences', 'the-quinn'], ALL = SUPP.concat(ONLY);
const rep = (id) => read('data/prism/v1.1/reports/' + id + '.json'), R = (id) => JSON.parse(rep(id)), rep1 = (id) => JSON.parse(read('data/prism/v1/reports/' + id + '.json'));
const e1 = (id) => v1.reports.find((x) => x.id === id), e = (id) => shard(key(id)).entries.find((x) => x.id === id);
const v11 = (id, r) => { const v = G.model11(G.checkReport11(r || R(id), e(id), ONLY.indexOf(id) >= 0), e(id)); if (v) v.periods = G.V11.PERIODS; return v; };
const v1md = (id) => (e1(id) ? G.model(G.checkReport(rep1(id), e1(id)), v1) : null);
const page = (id) => G.compose(v1md(id), v11(id));

// ---- 1 the approved release (r3, GW-PRISM-R3-SCHEMA-20261103-01: the same approved content, re-issued with Registry v2)
check('index.json is the approved file (sha256 pinned in the page) and binds the approved manifest', sha(it) === G.V11.INDEX && ix.manifestSha256 === sha(mt) && sha(mt) === G.V11.MANIFEST);
// Future MRT Phase 1 (GW-FMRT-P1-20261104-01, 4 Nov 2026): a delta on the r3 release; the chain gains its one approval (futureTransport lines only)
check('release ' + G.V11.RELEASE + ' (delta GW-FMRT-P1-20261104-01 on r3 a8b865345a70), format GW-PRISM-R3-SCHEMA-20261103-01, chain A1 -> DECILE -> A2 -> NATIONWIDE-1 -> FMRT-P1 -> AMEND-HPR (Hundred Palms Residences amendment, a delta on Phase 1)', !throws(() => G.checkIndex(ix)) && ix.releaseId === G.V11.RELEASE && m.formatApproval === 'GW-PRISM-R3-SCHEMA-20261103-01' && m.deltaApproval === 'GW-FMRT-P1-AMEND-HPR-20261104-01' && m.previous === 'prism-v1.1-r3-fmrt-p1-2026-11-04-ebfc22ae60fd' && ix.approvalChain.join(' ') === 'GW-PRISM-V1.1-2026-11-01-A1 GW-PRISM-V1.1-2026-11-03-DECILE GW-PRISM-V1.1-2026-11-03-A2 GW-PRISM-V1.1-2026-11-03-NATIONWIDE-1 GW-FMRT-P1-20261104-01 GW-FMRT-P1-AMEND-HPR-20261104-01');
check('16 shards, each passing its gate, every id in the shard its sha256 names (2,509 Registry v2 ids, 2,099 reports)', ix.shards.length === 16 && ix.shards.every((x) => sha(read('data/prism/v1.1/' + x.path)) === x.sha256 && !throws(() => G.checkShard(shard(x.key), x, key))) && ix.counts.entries === 2509 && ix.counts.reports === 2099);
check('the V1 pairing pinned in the page equals the release\'s own (supplements: release, approval, three sha256)', m.supplements.datasetReleaseId === G.V11.V1PAIR.release && m.supplements.approvalRef === G.V11.V1PAIR.approvalRef && m.supplements.reports.map((x) => x.sha256).sort().join() === G.V11.V1PAIR.sha256.slice().sort().join() && v1.datasetReleaseId === G.V11.V1PAIR.release);
check('the data periods pinned in the page equal the release\'s own (dataPeriodsBySource)', JSON.stringify(m.dataPeriodsBySource) === JSON.stringify(G.V11.PERIODS));
check('the five reports approved before the nationwide batch are marked so in their shards ("approved-existing"), and no other', ALL.every((id) => G.isCurated(e(id))) && ix.shards.reduce((a, x) => a + shard(x.key).entries.filter(G.isCurated).length, 0) === 5);
const counts = {};
ALL.forEach((id) => {
  const t = rep(id);
  if (SUPP.indexOf(id) >= 0) check(id + ': pairs with the deployed V1 report (sha256)', sha(read('data/prism/v1/reports/' + id + '.json')) === e1(id).sha256 && !throws(() => G.checkPair(v1, e1(id))) && JSON.parse(t).supplementsV1Report === id);
  else check(id + ': a V1.1-only entry (not in V1, supplementsV1Report null)', !e1(id) && JSON.parse(t).supplementsV1Report === null);
  check(id + ': its report matches its shard entry (sha256)', sha(t) === e(id).sha256);
  let v = null; const pass = !throws(() => { v = v11(id); });
  counts[id] = v ? v.items : 0;
  check(id + ': passes the gate with ' + e(id).items + ' approved items, as the shard lists', pass && v && v.items === e(id).items, counts[id]);
});
check('exactly the 60 curated items: 17, 16, 1, 13, 13', ALL.map((id) => counts[id]).join() === '17,16,1,13,13' && Object.values(counts).reduce((a, b) => a + b, 0) === 60, counts);
// ---- 2 fails closed
const KW = R('kingsford-waterbay'), kwE = e('kingsford-waterbay'), HP = R('hundred-palms-residences'), hpE = e('hundred-palms-residences');
check('a draft index: refused', throws(() => G.checkIndex(Object.assign(clone(ix), { status: 'draft' }))));
check('another approval chain (no NATIONWIDE-1): refused', throws(() => G.checkIndex(Object.assign(clone(ix), { approvalChain: ix.approvalChain.slice(0, 3) }))));
check('another release id: refused', throws(() => G.checkIndex(Object.assign(clone(ix), { releaseId: 'prism-v1.1-r3-release-other' }))));
check('an index binding another manifest, or without its redirects pin: refused', throws(() => G.checkIndex(Object.assign(clone(ix), { manifestSha256: '0'.repeat(64) }))) && throws(() => G.checkIndex(Object.assign(clone(ix), { redirectsSha256: undefined }))));
check('15 shards, shard counts that do not add up, or state counts that do not: refused', throws(() => G.checkIndex(Object.assign(clone(ix), { shards: ix.shards.slice(0, 15) }))) && throws(() => G.checkIndex(Object.assign(clone(ix), { counts: Object.assign(clone(ix.counts), { entries: 2510 }) }))) && throws(() => G.checkIndex(Object.assign(clone(ix), { counts: Object.assign(clone(ix.counts), { reports: 2100 }) }))));
{ const k = key('kingsford-waterbay'), sh = shard(k), en = sEntry(k), i = sh.entries.findIndex(G.hasReport), j = sh.entries.findIndex((x) => !G.hasReport(x));
  check('a shard of another schema (r2): refused', throws(() => G.checkShard(Object.assign(clone(sh), { schemaVersion: 'prism-public-v1.1-r2-index' }), en, key)));
  check('a shard with one entry more or less than the index lists: refused', throws(() => G.checkShard(Object.assign(clone(sh), { entries: sh.entries.slice(1) }), en, key)));
  check('a shard holding an id that belongs in another shard: refused', throws(() => { const x = clone(sh); x.entries[i].id = 'not-this-shard-' + k; let n = 0; while (key(x.entries[i].id) === k) x.entries[i].id = 'moved-' + (n++); x.entries[i].path = 'reports/' + x.entries[i].id + '.json'; G.checkShard(x, en, key); }));
  check('a shard listing an id twice: refused', throws(() => { const x = clone(sh); x.entries[1] = clone(x.entries[0]); G.checkShard(x, en, key); }));
  check('an unknown state, or a report on a pending / unavailable / new-launch entry: refused', throws(() => { const x = clone(sh); x.entries[i].state = 'draft'; G.checkShard(x, en, key); }) && throws(() => { const x = clone(sh); Object.assign(x.entries[j], { path: 'reports/' + x.entries[j].id + '.json', sha256: '0'.repeat(64) }); G.checkShard(x, en, key); }));
  check('a page entry approved under a reference outside the chain: refused', throws(() => { const x = clone(sh); x.entries[i].approvalRef = 'GW-PRISM-V1.1-2026-11-03-DRAFT'; G.checkShard(x, en, key); }));
  check('a redirect to itself or to nothing: refused', throws(() => { const x = clone(sh); Object.assign(x.entries[j], { state: 'redirect', to: x.entries[j].id }); G.checkShard(x, en, key); }) && throws(() => { const x = clone(sh); Object.assign(x.entries[j], { state: 'redirect' }); delete x.entries[j].to; G.checkShard(x, en, key); }));
  check('pending, unavailable and new-launch entries have no page (as an id without a report)', sh.entries.filter((x) => ['pending', 'unavailable', 'new_launch'].indexOf(x.state) >= 0).every((x) => !G.hasReport(x))); }
check('another V1 release, or a different V1 report on screen (pairing sha256): refused', throws(() => G.checkPair(Object.assign(clone(v1), { datasetReleaseId: 'prism-v1-release-other' }), e1('kingsford-waterbay'))) && throws(() => G.checkPair(v1, { id: 'kingsford-waterbay', sha256: '0'.repeat(64) })));
check('the previous A1, A2 and r2 files (left in place, or rolled back without the page): refused as the index', throws(() => G.checkIndex(JSON.parse(read('research/tests/fixtures/prism-v11-a1-manifest.json')))) && throws(() => G.checkIndex(JSON.parse(read('research/tests/fixtures/prism-v11-a2-manifest.json')))) && throws(() => G.checkIndex(JSON.parse(read('research/tests/fixtures/prism-v11-r2-index.json')))));
{ const r2 = JSON.parse(read('research/tests/fixtures/prism-v11-r2-index.json')), r2s = JSON.parse(read('research/tests/fixtures/prism-v11-r2-shard-0.json')), r2kw = JSON.parse(read('research/tests/fixtures/prism-v11-r2-kingsford-waterbay.json'));
  check('an r2 shard or report given to the r3 renderer: refused', throws(() => G.checkShard(r2s, sEntry('0'), key)) && throws(() => G.checkReport11(r2kw, kwE, false)));
  const OLD = require(path.join(SITE, 'research/tests/fixtures/gw-prism-r2.js'));   // the renderer live before r3 (rollback pairing)
  check('the reverse: the r3 root, shard and report given to the previous (r2) renderer: refused (data and renderer ship and roll back together)', throws(() => OLD.checkIndex(ix)) && throws(() => OLD.checkShard(shard('0'), sEntry('0'), key)) && throws(() => OLD.checkReport11(KW, kwE, false)) && !throws(() => OLD.checkIndex(r2))); }
check('a report of another schema (r2): refused', throws(() => G.checkReport11(Object.assign(clone(KW), { schemaVersion: 'prism-public-v1.1-r2' }), kwE, false)));
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
{ const r = clone(KW); r.peerComparison.positions.push(Object.assign(clone(r.peerComparison.positions[1]), { dimension: 'M', itemId: 'kingsford-waterbay/M' }));
  check('a Market position (the withdrawn Market rank): refused', throws(() => G.checkReport11(r, kwE, false))); }
const line = (r, ms) => r.profile.lines.find((l) => l.measure === ms);
{ const r = clone(KW); Object.assign(line(r, 'supply.unsoldInventory'), { status: 'available', data: { units: 120 } }); check('unsold inventory with a value: refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); Object.assign(line(r, 'infrastructure.futureTransport'), { status: 'available', data: { stations: [{ name: 'A planned station' }] } }); check('future transport with a value (no upcoming-MRT evidence): refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); line(r, 'market.backdrop').data.decile = 6; check('a Market decile: refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); line(r, 'market.backdrop').data.rank = { percentile: 50 }; check('a Market rank: refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(HP); line(r, 'resale.sustained').data.value = 12.6; check('a sustained value while settling: refused', throws(() => G.checkReport11(r, hpE, true))); }
{ const r = clone(KW); line(r, 'price.entry').data = { medianPrice: 1 }; check('a value for a measure marked not available: refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); r.profile.lines.push(Object.assign(clone(r.profile.lines[0]), { panel: 'S', measure: 'supply.pipelineCount' })); check('a line outside the approved profile: refused', throws(() => G.checkReport11(r, kwE, false))); }
// r3: every item carries its own approval; one pending item, or one reference outside the chain, rejects the whole report (fail closed)
{ const r = clone(KW); r.rentalYield.bands[0].approval.state = 'pending'; check('a pending item: the whole report is refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); r.profile.lines[0].approval.approvalRef = 'GW-PRISM-V1.1-2026-11-04-DELTA'; check('an item under a reference outside the chain: the whole report is refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); r.profile.lines[0].itemId = 'thomson-three/' + r.profile.lines[0].itemId.split('/').pop(); check('an item with another report\'s id: refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); r.profile.lines.push(Object.assign(clone(r.profile.lines[0]), { approval: { state: 'pending', approvalRef: 'GW-PRISM-V1.1-2026-11-03-NATIONWIDE-1' } })); check('an extra unapproved item (the count alone would not catch it): refused', throws(() => G.checkReport11(r, kwE, false))); }
{ const r = clone(KW); r.profile.lines[0].approval.approvalRef = 'GW-PRISM-V1.1-2026-11-01-A1'; check('items may mix references within the chain (A1 and NATIONWIDE-1): accepted', !throws(() => G.checkReport11(r, kwE, false)) && G.model11(G.checkReport11(r, kwE, false), kwE) !== null); }
{ const r = clone(KW); r.peerComparison.positions = r.peerComparison.positions.slice(1); check('a dropped item: the report is not shown (its count no longer matches the shard)', G.model11(G.checkReport11(r, kwE, false), kwE) === null); }

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
    // future transport: "not yet assessed", except Hundred Palms Residences, amended under GW-FMRT-P1-AMEND-HPR-20261104-01 (its approved line; prism-fmrt-hpr-tests.js)
    const ft = r.profile.lines.find((l) => l.measure === 'infrastructure.futureTransport'), amended = !!(G.FMRT_AMEND && G.FMRT_AMEND[id]);
    check(id + ': missing evidence named: unsold inventory not available, future transport ' + (amended ? 'as amended' : 'not yet assessed') + ', known sites only', t.includes('Not available: unsold inventory has not been validated.') &&
      (amended ? ft.status === 'available' && t.includes(ft.statement) : t.includes('Not yet assessed: needs official LTA evidence for planned stations.')) && t.includes('Known sites only; not a complete pipeline.'));
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
check('TT, HP, The Quinn: evidence-profile pages (the same page, no verdict card; their Reveal is tested below)', ['thomson-three', 'hundred-palms-residences', 'the-quinn'].every((id) => P[id].mode === 'profile' && G.hasPage(P[id]) && html[id].includes('data-gwp-mode="profile"') && !html[id].includes('gwp-card') && !/PRISM Verdict|Why\?|watch out/i.test(txt[id])));
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
  // search journey (Master Planning, 4 Nov 2026): the tabs gained a line saying what each holds; with that taken back, the page is the deployed V1 page
  const untab = (h) => h.replace(/<span class="gwp-tl"><span>([^<]*)<\/span><span class="gwp-tsub">[^<]*<\/span><\/span>/g, '<span>$1</span>');
  if (OLD && a.assessment) { const b = OLD.model(OLD.checkReport(rep1(id), e1(id)), v1); check(id + ': with no V1.1 the page is byte for byte the deployed V1 page (tab labels aside)', untab(G.pageHtml(a, { root: '../' })) === OLD.pageHtml(b, { root: '../' })); }
  if (!a.assessment) check(id + ': with no V1.1, no page (as in V1)', !G.hasPage(a) && G.pageHtml(a, { root: '../' }) === '');
});
check('HP and The Quinn with no V1.1: no page at all', ONLY.every((id) => G.compose(null, null) === null && !G.hasPage(G.compose(null, null))));
check('names and numbers come from the data, never the code', !/Kingsford|Hougang|Thomson|Hundred Palms|Quinn|6\.4|22\.7|1,060/.test(read('assets/js/gw-prism.js')));

// ---- 5 the Standard Reveal on evidence-profile pages (Master Planning, 3 Nov 2026): the approved headlines, approved figures with their
//      periods, qualifications word for word from the approved statements; a factual summary when no approved headline fits; never a verdict
const RV = (id) => G.reveal11(P[id].v11);
const statementsOf = (id) => { const r = R(id); return (r.peerComparison ? r.peerComparison.positions.map((x) => x.statement) : []).concat(r.profile ? r.profile.lines.map((l) => l.statement) : []).join(' '); };
check('the three approved headlines, exactly', G.REVEAL.resaleSettling === 'High resale activity, but sustained activity is still settling' && G.REVEAL.resaleAbove === 'Resale activity is above most peers' && G.REVEAL.quiet === 'A relatively quiet surrounding resale market' && Object.keys(G.REVEAL).length === 3);
{ const x = RV('hundred-palms-residences');
  check('Hundred Palms: "High resale activity, but sustained activity is still settling"; 12.6 observed (Oct 2024–Sep 2026, higher than 45 of 46) and +22.7% price (a position, not a measure of value; Oct 2025–Sep 2026)',
    x.kind === 'reveal' && x.head === G.REVEAL.resaleSettling && x.figs[0].v === '12.6' && x.figs[0].label === 'Observed resales per 100 homes a year' && x.figs[0].sub === 'Oct 2024–Sep 2026 · higher than 45 of 46 similar developments' &&
    x.figs[1].v === '+22.7%' && x.figs[1].label.endsWith('(a position, not a measure of value)') && x.figs[1].sub === 'Higher relative price than most peers · Oct 2025–Sep 2026', x);
  check('Hundred Palms: the settling and resale-wave qualifications, word for word from the approved statements (analytical proxy, not an official MOP date)', x.notes.length === 2 && x.notes.every((n) => statementsOf('hundred-palms-residences').includes(n)) && /^Settling: /.test(x.notes[0]) && /not an official MOP date\.$/.test(x.notes[1]), x.notes); }
{ const x = RV('the-quinn');
  check('The Quinn: "Resale activity is above most peers"; 4.7 (Oct 2024–Sep 2026, higher than 208 of 266 with a figure) and −2.2% price, "In line with comparable condos", a position not a measure of value',
    x.kind === 'reveal' && x.head === G.REVEAL.resaleAbove && x.figs[0].v === '4.7' && x.figs[0].sub === 'Oct 2024–Sep 2026 · higher than 208 of 266 similar developments with a figure' && x.figs[1].v === '−2.2%' && x.figs[1].sub === 'In line with comparable condos · Oct 2024–Sep 2026' && x.figs[1].label.endsWith('(a position, not a measure of value)'), x); }
{ const x = RV('thomson-three');
  check('Thomson Three: "A relatively quiet surrounding resale market"; 217 resales within 2 km (Oct 2025–Sep 2026, more than 2 of 51) and −24.7% against Oct 2024–Sep 2025',
    x.kind === 'reveal' && x.head === G.REVEAL.quiet && x.figs[0].v === '217' && x.figs[0].sub === 'Oct 2025–Sep 2026 · more than 2 of 51 similar developments' && x.figs[1].v === '−24.7%' && x.figs[1].sub === 'Oct 2025–Sep 2026 against Oct 2024–Sep 2025', x);
  check('Thomson Three: the quiet-market qualification and "Observed transactions, not a prediction.", word for word', x.notes.length === 2 && x.notes.every((n) => statementsOf('thomson-three').includes(n)) && /thin market, not an advantage\.$/.test(x.notes[0]), x.notes); }
check('every Reveal figure is an approved value as exported (no new calculation)', (() => { const h = R('hundred-palms-residences'), q = R('the-quinn'), t = R('thomson-three');
  return statementsOf('hundred-palms-residences').includes('12.6 resales per 100 homes') && statementsOf('hundred-palms-residences').includes('22.7% above') && statementsOf('the-quinn').includes('4.7 resales per 100 homes') && statementsOf('the-quinn').includes('2.2% below') && statementsOf('thomson-three').includes('217 resales within 2 km') && statementsOf('thomson-three').includes('(−24.7%)') && h && q && t; })());
['thomson-three', 'hundred-palms-residences', 'the-quinn'].forEach((id) => {
  // since the buyer explanation (Master Planning, 3 Nov 2026) the approved Reveal heads the explanation card: its kicker, headline and
  // qualifications, word for word, before the explanation's own lead sentence
  const h = html[id], at = h.indexOf('data-gwp-reveal='), rv = text(h.slice(h.indexOf('<p class="gwp-k">', at), h.indexOf('<p class="gwp-xlead">', at))).trim();
  check(id + ': the Reveal opens the page (after the brand line, before the five dimensions), heading the explanation card, labelled "PRISM Reveal"', at > h.indexOf('id="gwp-sum"') && at < h.indexOf('id="gwpDimsH"') && /<section class="gwp-xp" data-gwp-explain="(quiet|resaleAbove|resaleSettling)" data-gwp-reveal=/.test(h) && rv.startsWith('PRISM Reveal'));
  check(id + ': never a verdict, recommendation, prediction, score, Ken\'s Take or unsupported comparison in the Reveal', !/verdict|recommend|\bbuy\b|invest|forecast|predict(?!ion\.)|score|undervalued|bargain|guarantee|ken.s take|older|EC comparables|will /i.test(rv), rv);
});
check('Kingsford Waterbay and Hougang Central: their V1 Reveal in the verdict card, no r2 Reveal', ['kingsford-waterbay', 'hougang-central'].every((id) => !html[id].includes('data-gwp-reveal') && html[id].includes('<p class="gwp-k">PRISM Reveal</p>') && html[id].includes('class="gwp-card gwp-open"')));
// fallbacks: no approved headline fits -> a factual summary of the approved labels; a missing qualification -> no Reveal; nothing -> no card
const mod = (id, f) => { const r = clone(R(id)); f(r); return G.model11(r, null); };
{ const x = G.reveal11(mod('thomson-three', (r) => { r.profile.lines.find((l) => l.measure === 'supply.quietArea').data.flag = false; }));
  check('fallback, nothing fits (price and resale around peers, not a quiet area): a factual summary of the approved labels', x.kind === 'summary' && x.head === 'Price: In line with comparable condos · Resale activity: Around peers' && x.figs.length === 2 && !Object.values(G.REVEAL).includes(x.head), x);
  check('fallback summary is labelled "PRISM summary", not Reveal', /PRISM summary/.test(G.revealHtml(x)) && !/PRISM Reveal/.test(G.revealHtml(x))); }
{ const x = G.reveal11(mod('the-quinn', (r) => { const p = r.peerComparison.positions.find((y) => y.dimension === 'R'); p.band = 'below'; p.bandLabel = 'Below peers'; }));
  check('fallback, resale below peers (no approved headline): a factual summary', x.kind === 'summary' && x.head.includes('Resale activity: Below peers')); }
{ const x = G.reveal11(mod('the-quinn', (r) => { const c = r.peerComparison.positions.find((y) => y.dimension === 'R').components[0]; c.lower = 100; }));
  check('"above most peers" only when more than half the peers are lower: otherwise a summary', x.kind === 'summary'); }
{ const x = G.reveal11(mod('hundred-palms-residences', (r) => { const l = r.profile.lines.find((y) => y.measure === 'resale.sustained'); l.statement = l.statement.replace('Settling: ', 'Pending: '); }));
  check('a settling Reveal never appears without its qualification (missing: no Reveal and no summary)', x === null); }
{ const x = G.reveal11(mod('thomson-three', (r) => { const l = r.profile.lines.find((y) => y.measure === 'supply.quietArea'); l.statement = l.statement.replace('Quiet area: ', 'Thin: '); }));
  check('a quiet-market Reveal never appears without its qualification (it becomes the factual summary)', x.kind === 'summary'); }
{ const x = G.reveal11(mod('the-quinn', (r) => { r.peerComparison.positions = []; r.profile.lines.find((y) => y.measure === 'supply.quietArea').data.flag = false; }));
  check('D3 (NATIONWIDE-1): no position and no flag: the controlled evidence summary of the available measures ("Available evidence: …"), never a Reveal', x && x.kind === 'summary' && x.id === 'evidence' && x.head === G.ES.head + 'MRT today, Primary schools, Everyday amenities, Market backdrop', x); }
{ const v = mod('the-quinn', (r) => { r.peerComparison.positions = []; r.profile.lines.forEach((l) => { if (G.ES.measures.indexOf(l.measure) >= 0) { l.status = 'not_available'; l.data = null; l.statement = 'Not available: (test).'; } }); r.profile.lines.find((y) => y.measure === 'supply.quietArea').data.flag = false; });
  v.periods = G.V11.PERIODS; const pm = G.compose(null, v);
  check('no position, no flag and none of the four D3 measures: no card; the five dimensions still show', G.reveal11(v) === null && !G.pageHtml(pm, { root: '../' }).includes('data-gwp-reveal') && G.pageHtml(pm, { root: '../' }).includes('id="gwpDimsH"')); }
console.log('prism-v11-tests: ' + ok + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
