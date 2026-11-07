/* Hundred Palms Residences future-MRT amendment (GW-FMRT-P1-AMEND-HPR-20261104-01), in node.
   Run from the site folder:  node research/tests/prism-fmrt-hpr-tests.js
   1 a delta on Future MRT Phase 1 (manifest deltaApproval, previous); only this report, its shard, the index and the manifest change
   2 the report's future-transport line is the reviewed evidence: Serangoon North MRT about 300 m and Tavistock MRT about 1,370 m, Cross
     Island Line, LTA target 2030, in the approved template; with its approved line put back and the two sources taken off, the report is
     byte for byte the approved file (every other item, approval and value unchanged)
   3 the approved Reveal, V2 explanation, V3 quick read ("Farther from MRT. Higher pricing. Steady market.", 1.6 km from Hougang MRT)
     and the MRT today comparison (closer than 1 of 46) are exactly as approved
   4 fail closed: the amendment reference on any other report or item, the Phase 1 reference on this report, or any other form is rejected */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = require('./prism-delta-view.js')(path.resolve(__dirname, '../..'));   // later approved data-only deltas (Y2) taken off: this test checks its own release
const G = require(path.join(SITE, 'assets/js/gw-prism.js'));
// The future-MRT reading (G.FM.ON, Groundwork 01, 6 Nov 2026) later changes this report's quick read and MRT card; it is tested in
// prism-fmrt-quick-tests.js. Here: the amendment exactly as approved, so the pilot is switched off.
G.FM.ON = {};
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const D = path.join(SITE, 'data/prism/v1.1/'), readB = (p) => fs.readFileSync(path.join(D, p)), sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const ser = (o) => JSON.stringify(o, null, 1) + '\n', throws = (f) => { try { f(); return false; } catch (e) { return true; } };
const ID = 'hundred-palms-residences', REF = 'GW-FMRT-P1-AMEND-HPR-20261104-01', FT = 'infrastructure.futureTransport';
const APPROVED_SHA = '63739dcaa573facd98526baaa87e0f4d4b4ab8771b12a8ecc62310779c228876';   // the report as approved (A2) and live in Phase 1
const APPROVED_LINE = { itemId: ID + '/' + FT, approval: { state: 'approved', approvalRef: 'GW-PRISM-V1.1-2026-11-03-A2', recordItem: 'A2/' + ID + '/' + FT }, panel: 'I', measure: FT, label: 'Future transport',
  status: 'not_yet_assessed', missing: { reason: 'no official LTA planned-station record' }, statement: 'Not yet assessed: needs official LTA evidence for planned stations.', data: null, period: null, sourceIds: [] };
const STATEMENT = 'Upcoming on the Cross Island Line: Serangoon North MRT about 300 m (LTA target 2030) and Tavistock MRT about 1,370 m (LTA target 2030), both under construction. Straight-line distances to the planned station sites; entrances are not yet published.';

// 1 the delta
const ix = JSON.parse(readB('index.json')), man = JSON.parse(readB('manifest.json'));
check('a delta on Future MRT Phase 1 (deltaApproval ' + REF + ', previous prism-v1.1-r3-fmrt-p1-2026-11-04-ebfc22ae60fd), pinned', sha(readB('index.json')) === G.V11.INDEX && sha(readB('manifest.json')) === G.V11.MANIFEST &&
  (man.deltaApproval === REF ? man.previous === 'prism-v1.1-r3-fmrt-p1-2026-11-04-ebfc22ae60fd' : man.deltaApproval === 'GW-PRISM-V1-AMEND-KW-20261106-01' ? man.previous === 'prism-v1.1-r3-fmrt-hpr-2026-11-04-5cc64056341d' : man.deltaApproval === 'GW-PRISM-V1.1-2026-11-06-Y1' && man.previous === 'prism-v1.1-r3-kw-v1amend-2026-11-06-104839837c2a') && G.V11.CHAIN[5] === REF && G.FMRT_AMEND[ID] === REF && Object.keys(G.FMRT_AMEND).length === 1);
check('every file the manifest lists matches its sha256', man.files.every((f) => sha(readB(f.path)) === f.sha256));
const key = sha(ID).charAt(0), se = ix.shards.find((s) => s.key === key), sh = G.checkShard(JSON.parse(readB(se.path)), se, (id) => sha(id).charAt(0)), e = sh.entries.find((x) => x.id === ID);
const rb = readB(e.path), r = JSON.parse(rb);
check('the report is pinned by its shard and passes the renderer\'s checks; its shard entry keeps its own approval', sha(rb) === e.sha256 && !throws(() => G.checkReport11(r, e, true)) && e.approvalRef === 'GW-PRISM-V1.1-2026-11-03-A2' && G.isCurated(e));

// 2 the line
const l = r.profile.lines.find((x) => x.measure === FT), ss = l.data.stations;
check('the line: Serangoon North MRT about 300 m and Tavistock MRT about 1,370 m, Cross Island Line, LTA target 2030', l.status === 'available' && ss.length === 2 &&
  ss[0].name === 'Serangoon North MRT' && ss[0].code === 'CR9' && ss[0].distanceM === 300 && ss[1].name === 'Tavistock MRT' && ss[1].code === 'CR10' && ss[1].distanceM === 1370 &&
  ss.every((s) => s.line === 'Cross Island Line' && s.target === '2030' && s.status === 'under_construction' && s.measuredTo === 'station_site'));
check('the approved template, word for word', l.statement === STATEMENT && G.futureStatement(ss) === STATEMENT);
check('under the amendment reference (record FMRT1A/...), with the two Phase 1 sources', l.approval.approvalRef === REF && l.approval.recordItem === 'FMRT1A/' + ID + '/' + FT && l.sourceIds.join('|') === 'URA_MP2025_RAIL_STATIONS|LTA_RAIL_PROJECTS' &&
  r.sources.filter((s) => s.id === 'URA_MP2025_RAIL_STATIONS' || s.id === 'LTA_RAIL_PROJECTS').length === 2 && r.sources.find((s) => s.id === 'LTA_RAIL_PROJECTS').url === null);
const back = JSON.parse(JSON.stringify(r)); back.profile.lines[back.profile.lines.findIndex((x) => x.measure === FT)] = APPROVED_LINE;
back.sources = back.sources.filter((s) => s.id !== 'URA_MP2025_RAIL_STATIONS' && s.id !== 'LTA_RAIL_PROJECTS' && s.id !== 'URA_RENTAL'); back.rentalYield = null;   // Y1 (GW-PRISM-V1.1-2026-11-06-Y1) added the rental yield and its source
check('with its approved line put back, the two sources taken off (and the later Y1 rental yield taken off), the report is byte for byte the approved file', sha(ser(back)) === APPROVED_SHA);
check('Score /100 stays null', r.compositeScore === null);

// 3 the approved opening and comparisons
const mdl = (x) => { const v = G.model11(x, Object.assign({}, e, { items: e.items - (r.rentalYield && !x.rentalYield ? r.rentalYield.bands.length : 0) })); v.periods = G.V11.PERIODS; v.curated = true; return v; }, a = mdl(back), b = mdl(r);   // back: without the later Y1 bands
const ra = G.reveal11(a), rb2 = G.reveal11(b);
check('the approved Reveal, exactly: "High resale activity, but sustained activity is still settling", with its notes', JSON.stringify(ra) === JSON.stringify(rb2) && rb2.kind === 'reveal' && rb2.head === 'High resale activity, but sustained activity is still settling');
const qa = G.quick11(a, a.name, ra), qb = G.quick11(b, b.name, rb2);
check('the V3 quick read, exactly: "Farther from MRT. Higher pricing. Steady market." · 22.7% above · 1.6 km from Hougang MRT · 0.8% fewer', JSON.stringify(qa) === JSON.stringify(qb) && qb.head === 'Farther from MRT. Higher pricing. Steady market.' &&
  JSON.stringify(qb.figs.map((f) => f.v)) === JSON.stringify(['22.7% above', '1.6 km', '0.8% fewer']));
check('the V2 explanation, exactly', JSON.stringify(G.explain11(a, a.name, ra)) === JSON.stringify(G.explain11(b, b.name, rb2)));
const mrt = r.profile.lines.find((x) => x.measure === 'infrastructure.mrt');
check('MRT today, exactly: "Hougang MRT about 1,600 m, Kovan MRT about 1,610 m; closer than 1 of 46 similar developments." (rank unchanged)', mrt.statement === 'Hougang MRT about 1,600 m, Kovan MRT about 1,610 m; closer than 1 of 46 similar developments. Straight-line distances.' &&
  JSON.stringify(G.headline11(a, 'I')) === JSON.stringify(G.headline11(b, 'I')) && mrt.data.rank.peersWithValue === 46);
const page = (x) => G.pageHtml(G.compose(null, mdl(x)), { root: '../' }), LINE = /<div class="gwp-m gwp-pfl[^"]*" data-gwp-line="infrastructure\.futureTransport"[\s\S]*?<\/dd><\/div>/;
const pa = page(back), pb = page(r);
// the later Y1 delta adds only its yield table, the word "gross rental yield" in the V1.1 line and the URA rental Sources entry
const noY1 = (h) => h.replace(/<div class="gwp-v11" data-gwp-yield>[\s\S]*?<p class="gwp-ms">[^<]*<\/p><\/div>/, '').replace(', gross rental yield ·', ' ·').replace(/<li><b>Urban Redevelopment Authority \(URA\)<\/b> · PMI_Resi_Rental[\s\S]*?<\/li>/, '');
check('the page: everything but the Future transport line and the two new Sources entries is exactly the approved page (the later Y1 rental yield taken off)', pa.replace(LINE, '@') === noY1(pb).replace(LINE, '@').replace(/<li><b>(Urban Redevelopment Authority \(URA\)<\/b> · Amendment to Master Plan 2025|Land Transport Authority \(LTA\)<\/b> · Cross Island Line project page)[\s\S]*?<\/li>/g, ''));

// 4 fail closed
const tamper = (f, rr) => { const x = JSON.parse(JSON.stringify(rr || r)); f(x, x.profile.lines.find((q) => q.measure === FT)); return x; };
const rej = (x, ent) => throws(() => G.checkReport11(x, ent || e, true));
check('fail closed: the Phase 1 reference on this report', rej(tamper((x, q) => { q.approval.approvalRef = 'GW-FMRT-P1-20261104-01'; q.approval.recordItem = 'FMRT1/' + ID + '/' + FT; })));
check('fail closed: the amendment reference on another item of this report (MRT today)', rej(tamper((x) => { x.profile.lines.find((q) => q.measure === 'infrastructure.mrt').approval.approvalRef = REF; })));
check('fail closed: a changed distance or wording', rej(tamper((x, q) => { q.data.stations[0].distanceM = 250; })) && rej(tamper((x, q) => { q.statement = q.statement.replace('both under construction', 'both under construction and good for value'); })));
check('fail closed: a station that is not pinned (Brickland)', rej(tamper((x, q) => { Object.assign(q.data.stations[1], { stationKey: 'north-south-line-ns3a-brickland', name: 'Brickland MRT', line: 'North-South Line', code: 'NS3A', target: '2034' }); q.statement = G.futureStatement(q.data.stations); })));
const other = 'parc-vera', ko = sha(other).charAt(0), so = ix.shards.find((s) => s.key === ko), eo = G.checkShard(JSON.parse(readB(so.path)), so).entries.find((x) => x.id === other), ro = JSON.parse(readB(eo.path));
check('fail closed: the amendment reference on another report\'s line (Parc Vera)', rej(tamper((x, q) => { q.approval.approvalRef = REF; q.approval.recordItem = 'FMRT1A/' + other + '/' + FT; }, ro), eo) && !rej(ro, eo));
check('the other protected reports are unchanged: their future-transport line is still "not yet assessed"', ['thomson-three', 'the-quinn'].every((id) => { const k = sha(id).charAt(0), s = ix.shards.find((y) => y.key === k), en = G.checkShard(JSON.parse(readB(s.path)), s).entries.find((y) => y.id === id), rr = JSON.parse(readB(en.path));
  return rr.profile.lines.find((q) => q.measure === FT).status === 'not_yet_assessed'; }));
console.log('prism-fmrt-hpr-tests: %d passed, %d failed', ok, fail);
process.exit(fail ? 1 : 0);
