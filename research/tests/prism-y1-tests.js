/* PRISM V1.1 Y1: gross rental yield for Hundred Palms Residences (GW-PRISM-V1.1-2026-11-06-Y1, Master Planning, 6 Nov 2026), in node.
   Run from the site folder:  node research/tests/prism-y1-tests.js
   A data-only delta on the live release (prism-v1.1-r3-kw-v1amend-2026-11-06-104839837c2a): the report gains its two approved bands and
   the URA rental source record; its shard entry, the manifest (delta: deltaApproval, previous, items), the index and the page's pins
   follow. Built with the approved exporter's method (gross-yield.js and the exporter's band fields and texts), which reproduces the two live
   yield blocks exactly. No new method, text or renderer logic.
   1 the bands: the approved values, sources, dates, medians and disclosures
   2 nothing else: with Y1 put back, the report, its shard, the manifest, the index and gw-prism.js are the live files; every other file
     is byte-identical (the manifest's own list); Kingsford Waterbay's and Thomson Three's yields unchanged
   3 the page: the yield table shows exactly these two bands, below the peer median; every page still passes its gates
   4 privacy */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = require('./prism-delta-view.js')(path.resolve(__dirname, '../..'));   // later approved data-only deltas (Y2) taken off: this test checks its own release
const G = require(path.join(SITE, 'assets/js/gw-prism.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex'), j1 = (o) => JSON.stringify(o, null, 1) + '\n';
const REF = 'GW-PRISM-V1.1-2026-11-06-Y1', ID = 'hundred-palms-residences', D = 'data/prism/v1.1/';
const LIVE = { release: 'prism-v1.1-r3-kw-v1amend-2026-11-06-104839837c2a', generatedAt: '2026-11-06T00:00:00Z', report: 'ad9318193a0faae3a3b79a807d6ebad0cd92324c16516e371a6169f40a6526a9',
  shard: '56a4d5a0b2480d471439e48208c18290bfb46b949dbc9ca87257753e0ca6fc69', manifest: '66cd26fddba776b5476e0d59e0a1d3d0cc3fadeab59c0447f520dc7a319b0bd1',
  index: 'da6d667fffa91588f4e9762e67d10d0ae662a13682ca5dc9338490232cd151a6', gwPrism: '4a2092fc141ae0c1c35dbf295419c391a07139fbb70d6d85c89e1c9f028f1ec1',
  files: '3c763e9560835733701d92ce79ae1bcc9a80542b138e919162aabee1af98d1e3' };
const APPROVED = [   // Master Planning, 6 Nov 2026 (both below their peer medians)
  ['900-999 sq ft', 4100, 21, 1850000, 17, 2.66, [2.65, 2.8], 12, 3.47, [3.3, 3.73], 'below', -0.81],
  ['1000-1099 sq ft', 4400, 11, 2000000, 11, 2.64, [2.52, 2.91], 19, 3.31, [2.97, 3.45], 'below', -0.67]];

// 1 the bands
const rt = read(D + 'reports/' + ID + '.json'), r = JSON.parse(rt), y = r.rentalYield, kw = JSON.parse(read(D + 'reports/kingsford-waterbay.json'));
check('two bands with the approved values (rent, contracts, resale price, resales, gross yield, range, peers, median, middle half, position, difference)',
  y && y.bands.length === 2 && JSON.stringify(y.bands.map((b) => [b.band, b.typicalRent, b.rentalContracts, b.typicalResalePrice, b.resales, b.grossYieldPct, b.rangePct, b.peerGroup.developments, b.peerGroup.medianPct, b.peerGroup.middleHalfPct, b.position, b.differencePts])) === JSON.stringify(APPROVED));
check('each band approved under ' + REF + ' (record Y1/...), with its own item id', y.bands.every((b) => b.itemId === ID + '/' + b.band.replace(' sq ft', '') && b.approval.state === 'approved' && b.approval.approvalRef === REF && b.approval.recordItem === 'Y1/' + b.itemId));
check('below the peer median: each range ends under the median, at least 10 peers, the approved position text', y.bands.every((b) => b.rangePct[1] < b.peerGroup.medianPct && b.peerGroup.developments >= 10 && b.positionText === 'below the peer median' && b.differencePts === Math.round((b.grossYieldPct - b.peerGroup.medianPct) * 100) / 100));
check('the approved disclosures, exactly as on the live yields: period Oct 2025 to Sep 2026, the gross-yield caption with the lease, rules, range and short-lease text', JSON.stringify(y.period) === JSON.stringify(kw.rentalYield.period) &&
  y.caption === kw.rentalYield.caption.replace(/ Lease: [^.]+\.$/, '') + ' Lease: 99 yrs from 2016.' && JSON.stringify(y.rules) === JSON.stringify(kw.rentalYield.rules) && y.sourceIds.join() === 'URA_TRANSACTIONS,URA_RENTAL');
check('sources: the URA rental record (data to Sep 2026) is the live one, word for word; URA transactions unchanged', JSON.stringify(r.sources.find((s) => s.id === 'URA_RENTAL')) === JSON.stringify(kw.sources.find((s) => s.id === 'URA_RENTAL')) &&
  r.sources.find((s) => s.id === 'URA_RENTAL').asAt === '2026-09' && r.sources.map((s) => s.id).slice(0, 2).join() === 'URA_TRANSACTIONS,URA_RENTAL');
check('Score /100 stays null; no new figure outside the yield block', r.compositeScore === null);

// 2 nothing else
{ const b = JSON.parse(rt); b.rentalYield = null; b.sources = b.sources.filter((s) => s.id !== 'URA_RENTAL');
  check('the report with Y1 taken off is byte for byte the live file', sha(j1(b)) === LIVE.report); }
const k = sha(ID).charAt(0), st = read(D + 'index/' + k + '.json'), sh = JSON.parse(st), e = sh.entries.find((x) => x.id === ID);
check('its shard entry: the new sha256 and 15 items; with those put back the shard is the live file', e.sha256 === sha(rt) && e.items === 15 && e.approvalRef === 'GW-PRISM-V1.1-2026-11-03-A2' &&
  (() => { const b = JSON.parse(st); const x = b.entries.find((q) => q.id === ID); x.sha256 = LIVE.report; x.items = 13; return sha(j1(b)) === LIVE.shard; })());
const mt = read(D + 'manifest.json'), man = JSON.parse(mt), it = read(D + 'index.json'), ix = JSON.parse(it);
check('a delta on the live release: deltaApproval ' + REF + ', previous ' + LIVE.release + ', chain + ' + REF + ', 25,231 items, pinned in the page',
  man.deltaApproval === REF && man.previous === LIVE.release && man.releaseId === ix.releaseId && ix.releaseId === G.V11.RELEASE && man.counts.items === 25231 && man.approvalChain[man.approvalChain.length - 1] === REF &&
  man.approvalChain.join() === G.V11.CHAIN.join() && ix.approvalChain.join() === G.V11.CHAIN.join() && sha(mt) === G.V11.MANIFEST && ix.manifestSha256 === sha(mt) && sha(it) === G.V11.INDEX);
check('every file the manifest lists matches; only the report and its shard differ from the live list', man.files.every((f) => sha(fs.readFileSync(path.join(SITE, D, f.path))) === f.sha256) &&
  (() => { const f = JSON.parse(JSON.stringify(man.files)); f.find((x) => x.path === 'reports/' + ID + '.json').sha256 = LIVE.report; f.find((x) => x.path === 'index/' + k + '.json').sha256 = LIVE.shard; return sha(JSON.stringify(f)) === LIVE.files; })());
{ const b = JSON.parse(mt); b.files.find((x) => x.path === 'reports/' + ID + '.json').sha256 = LIVE.report; b.files.find((x) => x.path === 'index/' + k + '.json').sha256 = LIVE.shard;
  b.counts.items -= 2; b.approvalChain.pop(); b.releaseId = LIVE.release; b.generatedAt = LIVE.generatedAt; b.deltaApproval = 'GW-PRISM-V1-AMEND-KW-20261106-01'; b.previous = 'prism-v1.1-r3-fmrt-hpr-2026-11-04-5cc64056341d';
  const c = JSON.parse(it); c.releaseId = LIVE.release; c.approvalChain.pop(); c.manifestSha256 = LIVE.manifest; c.shards.find((x) => x.key === k).sha256 = LIVE.shard;
  check('with the delta fields put back, the manifest and the index are the live files', sha(j1(b)) === LIVE.manifest && sha(j1(c)) === LIVE.index); }
{ let g = read('assets/js/gw-prism.js');
  g = g.split(G.V11.RELEASE).join(LIVE.release).split(G.V11.INDEX).join(LIVE.index).split(G.V11.MANIFEST).join(LIVE.manifest).replace(", '" + REF + "'],   // " + REF + ': rental yield, one curated report (2 bands)', '],');
  check('gw-prism.js: only constants changed (the chain link and three pins); put back, it is the live file (no renderer logic changed)', sha(g) === LIVE.gwPrism, sha(g)); }
check('the Research page loads this exact gw-prism.js (script version)', read('research/index.html').indexOf('gw-prism.js?v=' + sha(fs.readFileSync(path.join(SITE, 'assets/js/gw-prism.js'))).slice(0, 10) + '"') > 0);
{ // the transit data (Future MRT Phase 2) is rebuilt from the new PRISM release by its own tool: only its provenance changes; its index pin follows
  const t = JSON.parse(read('data/transport/v1/hundred-palms-residences.json')), tix = JSON.parse(read('data/transport/v1/index.json'));
  const b = JSON.parse(JSON.stringify(t)); b.derivedFrom.prismRelease = LIVE.release; b.derivedFrom.reportSha256 = LIVE.report;
  let g = read('assets/js/gw-transit.js'); g = g.replace(/INDEX: '[0-9a-f]{64}' \};/, "INDEX: '9c501e282bea9fea07ef865ae544ce95c7b2f6f20cd54681712a1c70ab49be01' };");
  check('transit data: rebuilt for this release (provenance only; stations and distances unchanged); gw-transit.js: only its index pin changed', t.derivedFrom.prismRelease === G.V11.RELEASE && t.derivedFrom.reportSha256 === sha(rt) && tix.prismRelease === G.V11.RELEASE &&
    sha(JSON.stringify(b, null, 1) + '\n') === '5ab99a8f094b69999af3b82e9e7f0b8d9c65806d8c7b6a83299a1dcef8b0752d' && sha(g) === '8fa88e77df32ef9c1c56ff9a11daae1195e85d69fcfd2bc73fe49d6b6e6e4687' && read('research/index.html').indexOf('gw-transit.js?v=' + sha(read('assets/js/gw-transit.js')).slice(0, 10) + '"') > 0); }
check('Kingsford Waterbay and Thomson Three: yields unchanged (the same 5 bands, A1)', JSON.stringify(kw.rentalYield.bands.map((b) => [b.band, b.grossYieldPct, b.approval.approvalRef])) === JSON.stringify([['400-499 sq ft', 4.37, 'GW-PRISM-V1.1-2026-11-01-A1'], ['600-699 sq ft', 3.76, 'GW-PRISM-V1.1-2026-11-01-A1'], ['800-899 sq ft', 3.56, 'GW-PRISM-V1.1-2026-11-01-A1']]) &&
  JSON.parse(read(D + 'reports/thomson-three.json')).rentalYield.bands.map((b) => b.grossYieldPct).join() === '4.07,2.93');

// 3 the page
const v = G.model11(G.checkReport11(r, e, true), e); v.periods = G.V11.PERIODS; v.curated = G.isCurated(e);
const html = G.pageHtml(G.compose(null, v), { root: '../' }), yt = (html.match(/<div class="gwp-v11" data-gwp-yield>[\s\S]*?<\/div><\/div>/) || [''])[0];
check('the page shows the yield table with exactly these two bands, their medians and "below the peer median"', v.items === 15 && v.yield && v.yield.bands.length === 2 && (yt.match(/data-gwp-band=/g) || []).length === 2 &&
  /2\.66%/.test(yt) && /2\.64%/.test(yt) && /Median 3\.47% of 12/.test(yt) && /Median 3\.31% of 19/.test(yt) && (yt.match(/below the peer median/g) || []).length === 2 && /Lease: 99 yrs from 2016\./.test(html));
check('the yield is sourced on the page (URA rental record) and the V1.1 line names it', /PMI_Resi_Rental/.test(html) && /gross rental yield/.test(html));
check('every V1.1 page still passes its gates (all 16 shards)', ix.shards.every((s) => { try { G.checkShard(JSON.parse(read(D + s.path)), s, (q) => sha(q).charAt(0)); return true; } catch (x) { return false; } }));

// 4 privacy
const bad = [D + 'reports/' + ID + '.json', D + 'index/' + k + '.json', D + 'manifest.json', D + 'index.json'].filter((f) => /hutton|#\d{2}-\d{2}\b|kpt-private|scratchpad|[A-Z]:\\\\|api[_-]?key/i.test(read(f)));
check('privacy: no provider name, unit number, private path or key in the changed data files', !bad.length, bad);
console.log('prism-y1-tests: ' + ok + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
