/* Groundwork transit data (data/transport/v1): MRT today and future MRT, from approved PRISM data only. In node.
   Run from the site folder:  node research/tests/transit-data-tests.js
   1 the index lists each file with its sha256 and the PRISM release it was built from
   2 each file is exactly what tools/build-transit-data.js builds from the live, pinned PRISM V1.1 report today (nothing drifted,
     nothing added, re-measured or reworded); a new PRISM release fails this test until the files are rebuilt
   3 in service vs upcoming: in service = operational, to a station exit; upcoming = under construction, to the planned station site,
     an LTA target from the pinned register (FT.STATIONS); nearest first; no station in both; distances in 10 m steps
   4 sources: every source id has its record, the same as in the PRISM report
   5 wording: no rank, comparison, price, value or appreciation wording in anything shown
   6 Hundred Palms Residences (the pilot): the approved values */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const G = require(path.join(SITE, 'assets/js/gw-prism.js')), B = require(path.join(SITE, 'tools/transit/build-transit-data.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const j1 = (o) => JSON.stringify(o, null, 1) + '\n';
const D = 'data/transport/v1/', ix = JSON.parse(read(D + 'index.json'));

check('index: schema, the live PRISM release, one entry per file', ix.schema === 'gw-transit-index-v1' && ix.prismRelease === G.V11.RELEASE && Array.isArray(ix.files) && ix.files.length >= 1 &&
  fs.readdirSync(path.join(SITE, D)).filter((f) => f !== 'index.json').sort().join() === ix.files.map((f) => f.path).sort().join());
const SHOWN = /apprecia|uplift|capital gain|price|value|valuation|invest|boost|premium|rank|score|percentile|closer than|similar developments|forecast|expected to rise/i;
ix.files.forEach((f) => {
  const t = read(D + f.path), o = JSON.parse(t), n = o.id;
  check(n + ': listed sha256 matches the file', sha(t) === f.sha256 && f.id === n && f.path === n + '.json');
  let fresh = null, err = null; try { fresh = j1(B.build(SITE, n)); } catch (e) { err = e.message; }
  check(n + ': identical to a fresh build from the live approved PRISM report (no drift)', fresh === t, err);
  const S = o.inService.stations, U = o.upcoming.stations;
  check(n + ': in service: operational, measured to a station exit, MRT or LRT', S.length >= 1 && S.every((s) => s.status === 'operational' && s.measuredTo === 'station_exit' && /^(MRT|LRT)$/.test(s.type) && Object.keys(s).join('|') === 'name|type|status|distanceM|measuredTo|sourceIds'));
  check(n + ': upcoming: under construction, measured to the planned station site, LTA target from the pinned register', U.length >= 1 && U.length <= 2 && U.every((s) => s.status === 'under_construction' && s.measuredTo === 'station_site' &&
    Array.isArray(G.FT.STATIONS[s.stationKey]) && G.FT.STATIONS[s.stationKey].join('|') === [s.name, s.line, s.code, s.ltaTarget].join('|') && /^20\d\d$/.test(s.ltaTarget) && s.distanceM <= 2000));
  check(n + ': distances: whole metres in 10 m steps, nearest first in each group; no station in both groups', [S, U].every((g) => g.every((s, i) => Number.isInteger(s.distanceM) && s.distanceM >= 0 && s.distanceM % 10 === 0 && (i === 0 || s.distanceM >= g[i - 1].distanceM))) &&
    !U.some((u) => S.some((s) => s.name === u.name)));
  const rep = JSON.parse(read(o.derivedFrom.report));
  const used = [...new Set(S.concat(U).flatMap((s) => s.sourceIds))];
  check(n + ': every source id has its record, the same as in the PRISM report', used.sort().join() === o.sources.map((s) => s.id).sort().join() && o.sources.every((s) => JSON.stringify(s) === JSON.stringify(rep.sources.find((x) => x.id === s.id))));
  check(n + ': the upcoming note says LTA targets can change; LTA project pages are not linked', o.upcoming.note === G.FT.NOTE && /LTA targets and can change/.test(o.upcoming.note) && o.sources.filter((s) => s.id === 'LTA_RAIL_PROJECTS').every((s) => s.url === null));
  const shown = [o.inService.label, o.inService.basis, o.upcoming.label, o.upcoming.basis, o.upcoming.note].concat(S.concat(U).map((s) => [s.name, s.line || '', s.code || ''].join(' ')));
  check(n + ': no rank, comparison, price, value or appreciation wording in anything shown', !shown.some((x) => SHOWN.test(x)), shown.filter((x) => SHOWN.test(x)));
  check(n + ': no provider name, private path or key', !/hutton|kpt-private|scratchpad|[A-Z]:\\\\|api[_-]?key/i.test(t));
});

// 6 the pilot
const h = JSON.parse(read(D + 'hundred-palms-residences.json'));
check('Hundred Palms Residences: MRT today Hougang MRT about 1,600 m and Kovan MRT about 1,610 m (in service)', JSON.stringify(h.inService.stations.map((s) => [s.name, s.distanceM, s.status])) === JSON.stringify([['Hougang MRT', 1600, 'operational'], ['Kovan MRT', 1610, 'operational']]));
check('Hundred Palms Residences: upcoming Serangoon North MRT (CR9) about 300 m and Tavistock MRT (CR10) about 1,370 m, Cross Island Line, LTA target 2030, under construction',
  JSON.stringify(h.upcoming.stations.map((s) => [s.name, s.code, s.line, s.distanceM, s.ltaTarget, s.status])) === JSON.stringify([['Serangoon North MRT', 'CR9', 'Cross Island Line', 300, '2030', 'under_construction'], ['Tavistock MRT', 'CR10', 'Cross Island Line', 1370, '2030', 'under_construction']]));
check('Hundred Palms Residences: built from its approved lines (A2 MRT today; the Hundred Palms future-MRT amendment)', h.derivedFrom.items.map((x) => x.approvalRef).join() === 'GW-PRISM-V1.1-2026-11-03-A2,GW-FMRT-P1-AMEND-HPR-20261104-01');

console.log('transit-data-tests: ' + ok + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
