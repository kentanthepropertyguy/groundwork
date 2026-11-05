/* PRISM Future MRT Phase 1 (GW-FMRT-P1-20261104-01, Master Planning 4 Nov 2026), in node, all 2,099 reports.
   Run from the site folder:  node research/tests/prism-fmrt-tests.js
   1 the release: a delta on r3 (manifest deltaApproval, previous); index, manifest and every file in the manifest pinned
   2 only the futureTransport line of the 300 qualifying reports changes: each report, with its r3 line put back and the two new source
     records taken off, is byte for byte its r3 file; the other 1,799 reports are byte for byte r3 (all other metrics, ranks, Reveals unchanged)
   3 each new line is the approved form: 1-2 stations under construction from the 12 approved CRL stations, nearest first, at most 2 km,
     the approved template exactly; no rank or score; the two source records exactly as approved (LTA not linked: D2)
   4 held: the 149 held reports (TEL5/DTL3e, Brickland, JRL, DTL2e, ties) and the five protected reports keep their r3 line
   5 the V3 quick read, the V2 explanation and the Reveal of every changed report are exactly as on r3
   6 fail closed: the renderer rejects a report whose future-transport line or approval is changed in any way */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const G = require(path.join(SITE, 'assets/js/gw-prism.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const D = path.join(SITE, 'data/prism/v1.1/'), readB = (p) => fs.readFileSync(path.join(D, p)), sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const ser = (o) => JSON.stringify(o, null, 1) + '\n';
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/prism-fmrt-p1-r3-baseline.json'), 'utf8'));
const REF = 'GW-FMRT-P1-20261104-01', FT = 'infrastructure.futureTransport';
const PROTECTED = ['kingsford-waterbay', 'thomson-three', 'hougang-central', 'hundred-palms-residences', 'the-quinn'];
const HELD_WORDS = /Bedok South|Sungei Bedok|Xilin|Brickland|Tawas|Pandan|Peng Kang|Jurong Pier|Tengah|Hong Kah|Corporation|Gek Poh|Nanyang|Enterprise|Tukang|Jurong Hill|Toh Guan|Jurong Town Hall|Bukit Batok West|Choa Chu Kang West|Jurong West|Bahar|DE1|DE2|NS6|Founders|Mount Pleasant|River Valley|Bukit Brown|Terminal 5/;

// 1 the release
const ixB = readB('index.json'), ix = JSON.parse(ixB), manB = readB('manifest.json'), man = JSON.parse(manB);
check('the root index is the pinned file and the approved release', sha(ixB) === G.V11.INDEX && !throws(() => G.checkIndex(ix)) && ix.releaseId === G.V11.RELEASE);
// later deltas (the Hundred Palms Residences amendment, GW-FMRT-P1-AMEND-HPR-20261104-01) follow Phase 1 in the chain; they are tested in their own file
const AMEND = Object.keys(G.FMRT_AMEND || {}), AMEND_REFS = AMEND.map((k) => G.FMRT_AMEND[k]);
check('the manifest is the pinned file, bound by the root; Phase 1 (or an approved amendment after it) is the latest delta', sha(manB) === G.V11.MANIFEST && ix.manifestSha256 === G.V11.MANIFEST &&
  man.releaseId === ix.releaseId && (man.deltaApproval === REF ? man.previous === FX.previous : AMEND_REFS.indexOf(man.deltaApproval) >= 0 || man.deltaApproval === 'GW-PRISM-V1-AMEND-KW-20261106-01') && man.formatApproval === 'GW-PRISM-R3-SCHEMA-20261103-01');
check('the chain is r3\'s four approvals, then GW-FMRT-P1-20261104-01 (then only approved amendments)', G.V11.CHAIN[4] === REF && G.V11.CHAIN.slice(5).every((x) => AMEND_REFS.indexOf(x) >= 0) && man.approvalChain.join('|') === G.V11.CHAIN.join('|'));
const badFiles = man.files.filter((f) => sha(readB(f.path)) !== f.sha256).map((f) => f.path);
check('every file the manifest lists (' + man.files.length + ') matches its sha256', man.files.length === 2116 && !badFiles.length, badFiles.slice(0, 3));
check('the manifest names the two new sources with their periods and attribution', man.dataPeriodsBySource.URA_MP2025_RAIL_STATIONS === G.V11.PERIODS.URA_MP2025_RAIL_STATIONS &&
  man.dataPeriodsBySource.LTA_RAIL_PROJECTS === G.V11.PERIODS.LTA_RAIL_PROJECTS && man.attribution.some((a) => /Amendment to Master Plan 2025 Rail Station Layer/.test(a) && /Singapore Open Data Licence version 1\.0/.test(a)));
// every report, through the renderer's own checks
const entries = []; const shardBad = [];
ix.shards.forEach((s) => { const b = readB(s.path); if (sha(b) !== s.sha256) shardBad.push(s.key); G.checkShard(JSON.parse(b), s, (id) => sha(id).charAt(0)).entries.filter(G.hasReport).forEach((e) => entries.push(e)); });
check('16 shards pinned; 2,099 report entries; no entry carries the future MRT approval', !shardBad.length && entries.length === 2099 && !entries.some((e) => e.approvalRef === REF), shardBad);
const R = {}, V = {}, rejected = [];
entries.forEach((e) => { const b = readB(e.path); if (sha(b) !== e.sha256) { rejected.push(e.id + ' (sha256)'); return; } const r = JSON.parse(b);
  try { G.checkReport11(r, e, r.supplementsV1Report === null); R[e.id] = r; } catch (x) { rejected.push(e.id + ': ' + x.message); } });
check('all 2,099 reports pass the renderer\'s checks', rejected.length === 0, rejected.slice(0, 3));

// 2 only the line changes
const lineOf = (r) => (r.profile && Array.isArray(r.profile.lines) ? r.profile.lines.find((l) => l.measure === FT) : null) || { status: 'none' };
const avail = Object.keys(R).filter((id) => lineOf(R[id]).status === 'available' && AMEND.indexOf(id) < 0).sort();
check('exactly the 300 qualifying reports have a Phase 1 future-transport line (an amended protected report is tested in its own file)', avail.length === 300 && avail.join('|') === FX.qualifying.join('|'), avail.length);
const revert = (id) => { const r = JSON.parse(JSON.stringify(R[id])), i = r.profile.lines.findIndex((l) => l.measure === FT); r.profile.lines[i] = FX.r3FutureLine[id];
  r.sources = r.sources.filter((s) => s.id !== 'URA_MP2025_RAIL_STATIONS' && s.id !== 'LTA_RAIL_PROJECTS'); return r; };
const notR3 = avail.filter((id) => sha(ser(revert(id))) !== FX.r3Sha256[id]);
check('each of the 300, with its r3 line put back and the two new sources taken off, is byte for byte its r3 file (every other metric, rank and approval unchanged)', !notR3.length, notR3.slice(0, 3));
const others = Object.keys(R).filter((id) => avail.indexOf(id) < 0 && AMEND.indexOf(id) < 0), changed = others.filter((id) => sha(ser(R[id])) !== FX.r3Sha256[id]);
check('the other ' + others.length + ' reports are byte for byte r3 (1,799 less any amended report)', others.length === 1799 - AMEND.length && !changed.length, changed.slice(0, 3));
check('Score /100 stays null in every report', Object.keys(R).every((id) => R[id].compositeScore === null));

// 3 the approved form
const lines = avail.map((id) => [id, lineOf(R[id])]);
check('every new line is the approved form (futureOk), under GW-FMRT-P1-20261104-01', lines.every(([id, l]) => G.futureOk(l, R[id]) && l.approval.approvalRef === REF && l.approval.recordItem === 'FMRT1/' + id + '/' + FT));
check('every statement is the approved template applied to the line\'s own data', lines.every(([, l]) => l.statement === G.futureStatement(l.data.stations)));
const used = new Set(); lines.forEach(([, l]) => l.data.stations.forEach((s) => used.add(s.name.replace(/ MRT$/, ''))));
check('the 300 use exactly the 12 approved Cross Island Line stations (Tawas and Aviation Park are candidates with no report within 2 km)', [...used].sort().join('|') === FX.stations.join('|') && lines.every(([, l]) => l.data.stations.every((s) => s.line === 'Cross Island Line' && /^C[RP]\d+$/.test(s.code))), [...used]);
check('1 or 2 stations, nearest first, each at most 2,000 m, rounded to 10 m; LTA targets 2030 or 2032', lines.every(([, l]) => { const s = l.data.stations; return s.length >= 1 && s.length <= 2 && s.every((x, i) => x.distanceM <= 2000 && x.distanceM % 10 === 0 && (x.target === '2030' || x.target === '2032') && (!i || x.distanceM >= s[i - 1].distanceM)); }));
check('no rank, percentile, band, score or walking/price wording in any line', lines.every(([, l]) => !/rank|percentile|band|decile|score/i.test(JSON.stringify(l.data)) && !/walking time|minutes|boost|apprecia|growth|upside|value|forecast|good location/i.test(l.statement.replace('not yet published', ''))));
const SRC = (id) => R[id].sources.filter((s) => s.id === 'URA_MP2025_RAIL_STATIONS' || s.id === 'LTA_RAIL_PROJECTS');
check('the two source records, as approved: URA with the Singapore Open Data Licence attribution; LTA cited by page title and date, not linked (D2)', avail.every((id) => { const [u, l] = SRC(id);
  return u && l && u.licence.url === 'https://data.gov.sg/open-data-licence' && /accessed on 4 Nov 2026 from data\.gov\.sg/.test(u.attribution) && l.url === null && l.licence.url === null &&
    /Cross Island Line project page \(updated 4 Aug 2026\); Factsheet: The Next Phase of Rail Development \(4 Mar 2026\)/.test(l.dataset); }));
check('no held station is named in any line (TEL5/DTL3e, Brickland, JRL, DTL2e, Master-Plan-only sites)', lines.every(([, l]) => !HELD_WORDS.test(l.statement)));

// 4 held and protected
check('the 149 held reports keep their r3 line (less any protected report with an approved amendment)', FX.held.length === 149 && FX.held.filter((id) => AMEND.indexOf(id) < 0).every((id) => R[id] && ['not_yet_assessed', 'none'].indexOf(lineOf(R[id]).status) >= 0 && sha(ser(R[id])) === FX.r3Sha256[id]));
check('the protected reports without an approved amendment are byte for byte r3', PROTECTED.filter((id) => AMEND.indexOf(id) < 0).every((id) => R[id] && sha(ser(R[id])) === FX.r3Sha256[id] && ['not_yet_assessed', 'none'].indexOf(lineOf(R[id]).status) >= 0));

// 5 V3 quick read, V2 explanation, Reveal unchanged for the 300
const mdl = (r, id) => { const e = entries.find((x) => x.id === id), v = G.model11(r, e); v.periods = G.V11.PERIODS; v.curated = G.isCurated(e); return v; };
const opDiff = avail.filter((id) => { const a = mdl(revert(id), id), b = mdl(R[id], id), ra = G.reveal11(a), rb = G.reveal11(b);
  return JSON.stringify(ra) !== JSON.stringify(rb) || JSON.stringify(G.explain11(a, a.name, ra && ra.kind === 'reveal' ? ra : null)) !== JSON.stringify(G.explain11(b, b.name, rb && rb.kind === 'reveal' ? rb : null)) ||
    JSON.stringify(G.quick11(a, a.name, ra)) !== JSON.stringify(G.quick11(b, b.name, rb)) || JSON.stringify(G.headline11(a, 'I')) !== JSON.stringify(G.headline11(b, 'I')); });
check('the Reveal, V2 explanation, V3 quick read and Infrastructure headline of every changed report are exactly as on r3', !opDiff.length, opDiff.slice(0, 3));

// 6 fail closed
const base = avail[0], tamper = (f) => { const r = JSON.parse(JSON.stringify(R[base])); f(r, r.profile.lines.find((l) => l.measure === FT)); return r; };
const e0 = entries.find((x) => x.id === base), rej = (f) => throws(() => G.checkReport11(tamper(f), e0, R[base].supplementsV1Report === null));
const T = {
  'a different statement': (r, l) => { l.statement = l.statement.replace('under construction', 'under construction, which will boost prices'); },
  'a rank': (r, l) => { l.data.stations[0].rank = 1; },
  'a third station': (r, l) => { l.data.stations.push(Object.assign({}, l.data.stations[0], { distanceM: 1990 })); },
  'a distance past 2 km': (r, l) => { l.data.stations[l.data.stations.length - 1].distanceM = 2010; l.statement = G.futureStatement(l.data.stations); },
  'a held station (TEL5, target 2026)': (r, l) => { Object.assign(l.data.stations[0], { name: 'Bedok South MRT', line: 'Thomson-East Coast Line', target: '2026' }); l.statement = G.futureStatement(l.data.stations); },
  'another approval reference': (r, l) => { l.approval.approvalRef = 'GW-PRISM-V1.1-2026-11-03-NATIONWIDE-1'; },
  'the future MRT approval on another item': (r) => { r.profile.lines.find((l) => l.measure === 'infrastructure.mrt').approval.approvalRef = REF; },
  'a "not yet assessed" line under the future MRT approval': (r, l) => { Object.assign(l, { status: 'not_yet_assessed', data: null, statement: 'Not yet assessed: needs official LTA evidence for planned stations.' }); },
  'a missing source record': (r) => { r.sources = r.sources.filter((s) => s.id !== 'LTA_RAIL_PROJECTS'); },
  'stations out of order': (r, l) => { if (l.data.stations.length < 2) l.data.stations.push(Object.assign({}, l.data.stations[0], { distanceM: 1990 })); l.data.stations.reverse(); l.statement = G.futureStatement(l.data.stations); },
  'an extra data field': (r, l) => { l.data.walkMinutes = 5; },
  'a walking distance': (r, l) => { l.data.stations[0].measuredTo = 'entrance'; }
};
Object.keys(T).forEach((k) => check('fail closed: the renderer rejects ' + k, rej(T[k])));
check('the untampered report is accepted (the tamper tests start from a valid report)', !throws(() => G.checkReport11(R[base], e0, R[base].supplementsV1Report === null)));
console.log('prism-fmrt-tests: %d passed, %d failed', ok, fail);
process.exit(fail ? 1 : 0);
