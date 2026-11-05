/* MRT today and future MRT on the Property Data page (assets/js/gw-transit.js, Future MRT Phase 2 pilot, 6 Nov 2026). In node.
   Run from the site folder:  node research/tests/transit-ui-tests.js
   1 the renderer pins the approved index (sha256) and reads only data/transport/v1
   2 fail closed: a file in the wrong form, or with price, value, rank or forecast wording, is refused
   3 what is shown: in service nearest first; future = stations under construction + the Hougang interchange, nearest first, each with its LTA target
   4 the Hougang interchange: only where Hougang MRT is a station in service; LTA's own facts; not linked to the LTA website
   5 Hundred Palms Residences (the pilot): exactly the approved values and wording */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const T = require(path.join(SITE, 'assets/js/gw-transit.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// 1 pin
const ixT = read(T.TR.DIR + 'index.json'), ix = JSON.parse(ixT);
check('the renderer pins the approved index (sha256)', sha(ixT) === T.TR.INDEX);
check('the index is in the expected form; each file matches its listed sha256', !!T.checkIndex(ix) && ix.files.every((f) => sha(read(T.TR.DIR + f.path)) === f.sha256));
const src = read('assets/js/gw-transit.js');
check('the renderer reads only data/transport/v1 (no other data, no external address)', !/data\/(?!transport\/v1\/)[a-z]/.test(src.replace(/data\.gov\.sg/g, '')) && !/https?:\/\//.test(src));

// 2 fail closed
const e = ix.files.find((f) => f.id === 'hundred-palms-residences'), H = JSON.parse(read(T.TR.DIR + e.path));
const mut = (fn) => { const o = JSON.parse(JSON.stringify(H)); fn(o); return o; };
check('accepts the approved file', !!T.checkFile(H, e));
check('refuses: wrong schema, another id, no stations in service', throws(() => T.checkFile(mut((o) => { o.schema = 'x'; }), e)) && throws(() => T.checkFile(H, { id: 'other' })) && throws(() => T.checkFile(mut((o) => { o.inService.stations = []; }), e)));
check('refuses: an upcoming station that is "operational", without an LTA target, or measured to an exit', throws(() => T.checkFile(mut((o) => { o.upcoming.stations[0].status = 'operational'; }), e)) && throws(() => T.checkFile(mut((o) => { delete o.upcoming.stations[0].ltaTarget; }), e)) && throws(() => T.checkFile(mut((o) => { o.upcoming.stations[0].measuredTo = 'station_exit'; }), e)));
check('refuses: a distance not in 10 m steps, negative or over 5 km', throws(() => T.checkFile(mut((o) => { o.inService.stations[0].distanceM = 1605; }), e)) && throws(() => T.checkFile(mut((o) => { o.inService.stations[0].distanceM = -10; }), e)) && throws(() => T.checkFile(mut((o) => { o.upcoming.stations[0].distanceM = 6000; }), e)));
check('refuses: no "LTA targets can change" note', throws(() => T.checkFile(mut((o) => { o.upcoming.note = 'Opens 2030.'; }), e)));
check('refuses: price, value, rank, score, forecast or appreciation wording', ['Close to MRT, good value', 'Prices expected to rise', 'Ranked first', 'Capital appreciation', 'Closer than 1 of 46 similar developments'].every((w) => throws(() => T.checkFile(mut((o) => { o.upcoming.basis = w; }), e))));

// 3 what is shown
const R = T.rows(H);
check('MRT today: in service, nearest first', JSON.stringify(R.today.map((r) => [r.name, r.distanceM, r.status])) === JSON.stringify([['Hougang MRT', 1600, 'In service'], ['Kovan MRT', 1610, 'In service']]));
check('Future MRT: nearest first; each under construction with its line, code and LTA target', JSON.stringify(R.future.map((r) => [r.name, r.code, r.distanceM, r.status, r.ltaTarget, r.kind])) ===
  JSON.stringify([['Serangoon North MRT', 'CR9', 300, 'Under construction', '2030', 'new'], ['Tavistock MRT', 'CR10', 1370, 'Under construction', '2030', 'new'], ['Hougang MRT', 'CR8', 1600, 'Under construction', '2030', 'interchange']]));

// 4 the Hougang interchange
const X = T.INTERCHANGES['Hougang MRT'];
check('Hougang interchange: Cross Island Line CR8, under construction, LTA target 2030, from LTA\'s Cross Island Line page (updated 4 Aug 2026, checked 6 Nov 2026), approved by Groundwork 01',
  Object.keys(T.INTERCHANGES).join() === 'Hougang MRT' && X.line === 'Cross Island Line' && X.code === 'CR8' && X.status === 'under_construction' && X.ltaTarget === '2030' && X.source.updated === '2026-08-04' && X.source.checked === '2026-11-06' && /Groundwork 01/.test(X.approvalRef));
check('the interchange appears only where Hougang MRT is a station in service', T.rows(mut((o) => { o.inService.stations = o.inService.stations.filter((s) => s.name !== 'Hougang MRT'); })).future.every((r) => r.kind !== 'interchange'));
const h = T.html(H), t = text(h);
check('the LTA website is never linked; data.gov.sg sources are', !/lta\.gov\.sg/i.test(h) && (h.match(/href="https:\/\/data\.gov\.sg\//g) || []).length === 2);

// 5 Hundred Palms Residences: the approved values and wording
check('Hundred Palms: heading, both groups, the approved note', /^MRT today and future MRT MRT today /.test(t) && /Future MRT /.test(t) && t.indexOf('Straight-line distances to the planned station sites; entrances are not yet published. Opening dates are LTA targets and can change. Planned stations are facts, not part of any comparison.') > 0, t.slice(0, 200));
check('Hundred Palms: every station with its straight-line distance; three LTA targets of 2030', ['Hougang MRT about 1,600 m In service', 'Kovan MRT about 1,610 m In service', 'Serangoon North MRT about 300 m Cross Island Line (CR9) · Under construction · LTA target 2030',
  'Tavistock MRT about 1,370 m Cross Island Line (CR10) · Under construction · LTA target 2030', 'Hougang MRT about 1,600 m Cross Island Line interchange (CR8) · Under construction · LTA target 2030 New platforms at today’s station. Distance to today’s station exits.'].every((x) => t.indexOf(x) >= 0) && (t.match(/LTA target 2030/g) || []).length === 3, t);
check('Hundred Palms: no price, value, rank, score, forecast or appreciation wording anywhere shown', !T.SHOWN_NOT.test(t), t.match(T.SHOWN_NOT));

console.log('transit-ui-tests: %d passed, %d failed', ok, fail);
process.exit(fail ? 1 : 0);
