/* PRISM V1.1 Y2: gross rental yield by size band for every PRISM page that qualifies under the approved rules, in node.
   Run from the site folder:  node research/tests/prism-y2-tests.js
   A data-only delta on the live Y1 release (prism-v1.1-r3-y1-2026-11-06-de6e404addb9), built by y2-build.js with the approved method
   (gross-yield.js and the exporter's band fields and texts), which first reproduces the live A1 and Y1 yields byte for byte.
   1 the bands: exactly the reviewed values of the Y2 approval manifest; approved texts, disclosures and sources
   2 nothing else: with Y2 taken off (prism-delta-view.js), every changed file is the live Y1 file byte for byte; every listed file matches
   3 the page: every Y2 report shows its bands; too-few-peer bands show no comparison; captions; all pages pass their gates
   4 privacy; 5 the release gate (an issued approval reference) */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const G = require(path.join(SITE, 'assets/js/gw-prism.js')), VIEW = require('./prism-delta-view.js');
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const D = 'data/prism/v1.1/', F = JSON.parse(read('research/tests/fixtures/prism-y2-delta.json')), REF = F.ref, IDS = Object.keys(F.reports).sort();
const LIVE_Y1 = { release: 'prism-v1.1-r3-y1-2026-11-06-de6e404addb9', manifest: '23ff6d59f591188b3e28339163dc739d7dc664614fb6882f1c8bfebfab123d15', index: '4ba7e307126e8fff21665b6bd360b31f252d60e449f673e4521d66c07b232069',
  gwPrism: '07e603ecd84dae99', gwTransit: '0690371a530e0d47', transitIndex: '0e338a3e138b2d19a5cde8017c95b7e024706441fcf7dd7abd18448fea576e28' };
const PROTECTED = ['kingsford-waterbay', 'thomson-three', 'hougang-central', 'hundred-palms-residences', 'the-quinn'];
const kw = JSON.parse(read(D + 'reports/kingsford-waterbay.json')), R = Object.fromEntries(IDS.map((id) => [id, JSON.parse(read(D + 'reports/' + id + '.json'))]));
const bands = IDS.flatMap((id) => R[id].rentalYield.bands.map((b) => Object.assign({ id, caption: R[id].rentalYield.caption }, b)));

// 1 the bands
check(IDS.length + ' reports, ' + F.bands + ' bands, as recorded (X1 ' + F.decisions.x1 + ', X2 ' + F.decisions.x2 + ')', bands.length === F.bands && IDS.every((id) => R[id].rentalYield.bands.length === F.reports[id].bands));
const canon = bands.map((b) => [b.itemId, b.band, b.typicalRent, b.rentalContracts, b.typicalResalePrice, b.resales, b.grossYieldPct, b.rangePct,
  b.peerGroup ? { n: b.peerGroup.developments, median: b.peerGroup.medianPct, middleHalf: b.peerGroup.middleHalfPct } : null, b.position, b.caption]).sort((a, c) => (a[0] < c[0] ? -1 : 1));
check('every band is exactly the reviewed value in the Y2 approval manifest (rent, contracts, price, resales, yield, range, peers, position, caption)', sha(JSON.stringify(canon)) === F.reviewed.bandsSha256);
check('each band approved under ' + REF + ' (record Y2/...), item id = report/band', bands.every((b) => b.itemId === b.id + '/' + b.band.replace(' sq ft', '') && b.approval.state === 'approved' && b.approval.approvalRef === REF && b.approval.recordItem === 'Y2/' + b.itemId));
const TXT = { above: 'above the peer median', below: 'below the peer median', near: 'near the peer median (its range includes it)' };
// the approved method places and measures on unrounded values and shows 2 decimals, so shown figures agree to within 0.01 (as on the live A1 bands)
check('positions and texts as approved: above/below/near with 10+ peers and the approved text (to the shown precision); too few peers: no comparison, no text, no difference',
  bands.every((b) => b.position === 'too_few_peers' ? b.peerGroup === null && b.positionText === null && b.differencePts === null
    : TXT[b.position] === b.positionText && b.peerGroup.developments >= 10 && Math.abs(b.differencePts - (b.grossYieldPct - b.peerGroup.medianPct)) <= 0.0101 &&
      (b.position === 'above' ? b.rangePct[0] >= b.peerGroup.medianPct : b.position === 'below' ? b.rangePct[1] <= b.peerGroup.medianPct : b.rangePct[0] <= b.peerGroup.medianPct + 0.01 && b.rangePct[1] >= b.peerGroup.medianPct - 0.01)));
check('samples meet the approved minimums (5+ resales, 10+ rental contracts); gross yield = 12 x rent / price', bands.every((b) => b.resales >= 5 && b.rentalContracts >= 10 && Math.abs(b.grossYieldPct - Math.round(1200 * b.typicalRent / b.typicalResalePrice * 100) / 100) < 0.006));
check('the approved disclosures, exactly as on the live yields: period Oct 2025 to Sep 2026, caption with the lease, rules, range and short-lease text, sources',
  IDS.every((id) => { const y = R[id].rentalYield; return JSON.stringify(y.period) === JSON.stringify(kw.rentalYield.period) && JSON.stringify(y.rules) === JSON.stringify(kw.rentalYield.rules) &&
    y.caption === kw.rentalYield.caption.replace(/ Lease: [^.]+\.$/, '') + / Lease: [^.]+\.$/.exec(y.caption)[0] && /^ Lease: (Freehold|\d+ yrs( from \d{4})?)\.$/.test(/ Lease: [^.]+\.$/.exec(y.caption)[0]) && y.sourceIds.join() === 'URA_TRANSACTIONS,URA_RENTAL'; }));
check('no short lease (under 99 years) in Y2', bands.every((b) => !/ Lease: ([1-8]?\d|9[0-8]) yrs/.test(b.caption)));
check('sources: the URA rental record is the live one, word for word (data to Sep 2026), right after URA transactions', IDS.every((id) => { const s = R[id].sources, i = s.findIndex((x) => x.id === 'URA_RENTAL');
  return i > 0 && s[i - 1].id === 'URA_TRANSACTIONS' && JSON.stringify(s[i]) === JSON.stringify(kw.sources.find((x) => x.id === 'URA_RENTAL')); }));
check('Score /100 stays null in every Y2 report', IDS.every((id) => R[id].compositeScore === null));
check('protected reports are not in Y2 (Kingsford Waterbay, Thomson Three, Hougang Central, Hundred Palms, The Quinn)', PROTECTED.every((id) => !F.reports[id]));

// 2 nothing else: Y2 taken off gives the live Y1 release byte for byte
const U = VIEW(SITE, { filesOnly: true });
check('with Y2 taken off: the manifest and the index are the live Y1 files', sha(U[D + 'manifest.json']) === LIVE_Y1.manifest && sha(U[D + 'index.json']) === LIVE_Y1.index && F.expectPre.manifest === LIVE_Y1.manifest);
check('with Y2 taken off: gw-prism.js is the live file (only the chain link and three pins changed: no renderer logic)', sha(U['assets/js/gw-prism.js']).slice(0, 16) === LIVE_Y1.gwPrism && sha(U['assets/js/gw-prism.js']) === F.expectPre.gwPrism);
check('with Y2 taken off: gw-transit.js, the transit index and file are the live ones (transit provenance only)', sha(U['assets/js/gw-transit.js']).slice(0, 16) === LIVE_Y1.gwTransit && sha(U['data/transport/v1/index.json']) === LIVE_Y1.transitIndex &&
  Object.keys(F.expectPre.transitFiles).every((id) => sha(U['data/transport/v1/' + id + '.json']) === F.expectPre.transitFiles[id]));
check('with Y2 taken off: the Research page loads the live script versions', U['research/index.html'].indexOf('gw-prism.js?v=' + F.expectPre.scriptVersions.gwPrism + '"') > 0 && U['research/index.html'].indexOf('gw-transit.js?v=' + F.expectPre.scriptVersions.gwTransit + '"') > 0);
const mt = read(D + 'manifest.json'), man = JSON.parse(mt), it = read(D + 'index.json'), ix = JSON.parse(it);
check('every file the manifest lists matches its sha256 (so with the manifest put back, every other data file is the live file)', man.files.every((f) => sha(fs.readFileSync(path.join(SITE, D, f.path))) === f.sha256));
check('a delta on the live Y1 release: deltaApproval ' + REF + ', previous ' + LIVE_Y1.release + ', chain + ' + REF + ', ' + (25231 + F.bands).toLocaleString('en') + ' items, pinned in the page',
  man.deltaApproval === REF && man.previous === LIVE_Y1.release && man.releaseId === ix.releaseId && ix.releaseId === G.V11.RELEASE && man.counts.items === 25231 + F.bands && man.approvalChain[man.approvalChain.length - 1] === REF &&
  man.approvalChain.join() === G.V11.CHAIN.join() && ix.approvalChain.join() === G.V11.CHAIN.join() && sha(mt) === G.V11.MANIFEST && ix.manifestSha256 === sha(mt) && sha(it) === G.V11.INDEX);
check('the Research page loads this exact gw-prism.js and gw-transit.js', read('research/index.html').indexOf('gw-prism.js?v=' + sha(read('assets/js/gw-prism.js')).slice(0, 10) + '"') > 0 && read('research/index.html').indexOf('gw-transit.js?v=' + sha(read('assets/js/gw-transit.js')).slice(0, 10) + '"') > 0);
check('transit data rebuilt for this release by its own tool (index records the release; the file is a fresh build)', JSON.parse(read('data/transport/v1/index.json')).prismRelease === G.V11.RELEASE);
check('the earlier yields are unchanged: Kingsford Waterbay and Thomson Three (A1), Hundred Palms (Y1)', JSON.stringify(kw.rentalYield.bands.map((b) => [b.grossYieldPct, b.approval.approvalRef])) === JSON.stringify([[4.37, 'GW-PRISM-V1.1-2026-11-01-A1'], [3.76, 'GW-PRISM-V1.1-2026-11-01-A1'], [3.56, 'GW-PRISM-V1.1-2026-11-01-A1']]) &&
  JSON.parse(read(D + 'reports/thomson-three.json')).rentalYield.bands.map((b) => b.grossYieldPct).join() === '4.07,2.93' && JSON.parse(read(D + 'reports/hundred-palms-residences.json')).rentalYield.bands.map((b) => b.grossYieldPct + b.approval.approvalRef).join() === '2.66GW-PRISM-V1.1-2026-11-06-Y1,2.64GW-PRISM-V1.1-2026-11-06-Y1');

// 3 the page
const entry = {}; ix.shards.forEach((s) => JSON.parse(read(D + s.path)).entries.forEach((e) => { entry[e.id] = e; }));
const pageOf = (id) => { const e = entry[id], v = G.model11(G.checkReport11(R[id], e, R[id].supplementsV1Report === null), e); v.periods = G.V11.PERIODS; v.curated = G.isCurated(e); return { v, html: G.pageHtml(G.compose(null, v), { root: '../' }) }; };
let shown = 0, bad = [];
IDS.forEach((id) => { try { const { v, html } = pageOf(id), yt = (html.match(/<div class="gwp-v11" data-gwp-yield>[\s\S]*?<\/div><\/div>/) || [''])[0];
  if (v.yield && v.yield.bands.length === F.reports[id].bands && (yt.match(/data-gwp-band=/g) || []).length === F.reports[id].bands && /PMI_Resi_Rental/.test(html)) shown++; else bad.push(id); } catch (x) { bad.push(id + ': ' + x.message); } });
check('every Y2 page shows its yield table with all its bands and the URA rental source (' + shown + ' of ' + IDS.length + ')', shown === IDS.length, bad.slice(0, 5));
const few = IDS.find((id) => R[id].rentalYield.bands.some((b) => b.position === 'too_few_peers')), fh = IDS.find((id) => / Lease: Freehold\.$/.test(R[id].rentalYield.caption));
if (few) { const yt = pageOf(few).html.match(/<div class="gwp-v11" data-gwp-yield>[\s\S]*?<\/div><\/div>/)[0], b = R[few].rentalYield.bands.find((q) => q.position === 'too_few_peers');
  check('a band with too few comparable developments (X1) shows its figures and the approved X1 text in its comparison cell (' + few + ')', new RegExp('data-gwp-band="' + b.band + '"[\\s\\S]*?<td data-l="Comparable developments">' + F.x1.text.replace(/[.;]/g, '\\$&') + '</td>').test(yt)); }
check('X1 is one exact display-only hunk in gw-prism.js, with the approved wording "' + F.x1.text + '"', F.x1 && F.x1.text === 'Fewer than 10 comparable developments; not compared.' && read('assets/js/gw-prism.js').split(F.x1.post).length === 2 && F.x1.post.indexOf(F.x1.text) > 0 && F.x1.post.replace(" : (b.position === 'too_few_peers' ? '" + F.x1.text + "' : ''))", " : '')") === F.x1.pre);
{ const withPeers = IDS.find((id) => R[id].rentalYield.bands.some((q) => q.peerGroup)), html = withPeers ? pageOf(withPeers).html : '';
  check('the X1 text appears only on bands without a comparable group (' + withPeers + ')', (html.match(new RegExp(F.x1.text.replace(/[.;]/g, '\\$&'), 'g')) || []).length === R[withPeers].rentalYield.bands.filter((q) => q.position === 'too_few_peers').length); }
if (fh) check('a freehold caption (X2) reads "Lease: Freehold." on the page (' + fh + ')', /Lease: Freehold\./.test(pageOf(fh).html));
check('every V1.1 page still passes its gates (all 16 shards)', ix.shards.every((s) => { try { G.checkShard(JSON.parse(read(D + s.path)), s, (q) => sha(q).charAt(0)); return true; } catch (x) { return false; } }));

// 4 privacy
const leak = IDS.map((id) => D + 'reports/' + id + '.json').concat([D + 'manifest.json', D + 'index.json']).filter((f) => /hutton|#\d{2}-\d{2}\b|kpt-private|scratchpad|[A-Z]:\\\\|api[_-]?key/i.test(read(f)));
check('privacy: no provider name, unit number, private path or key in the changed data files', !leak.length, leak.slice(0, 3));

// 5 release gate
check('release gate: built with the approval reference issued by Master Planning (not the pending placeholder)', !/PENDING/.test(REF), REF);
console.log('prism-y2-tests: ' + ok + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
