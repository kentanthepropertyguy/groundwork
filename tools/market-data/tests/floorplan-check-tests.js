/* floorplan-check.js (revised by Claude C, 5 Nov 2026: import checks, the engine's own floor rule) on a SYNTHETIC development (no real floor-plan table is ever kept in the repository).
   Run: node tools/market-data/tests/floorplan-check-tests.js */
'use strict';
const path = require('path'), fs = require('fs');
const os = require('os');
const E = require('../bedroom-engine.js'), F = require('../floorplan-check.js');
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const CSV = ['project,code,bedrooms,variant,sqm,sqft,levels,source,status,note',
  'SYNTH PARK,A1,1,,45,484,1-15,doc1,developer,',
  'SYNTH PARK,B1,2,,63,678,1-15,doc1,developer,',
  'SYNTH PARK,T1-PH,1,penthouse,63,678,16,doc1,developer,top storey',
  'SYNTH PARK,C1,3,,79,850,1-15,doc1,developer,',
  'SYNTH PARK,B1-PH,2,penthouse,79,850,16,doc1,developer,top storey',
  'SYNTH PARK,D1,4,,96,1033,1-15,doc1,developer,',
  'SYNTH PARK,C2,3,,96,1033,1-15,doc1,developer,'].join('\n');
const SRC = 'id,project,title,url,retrieved,kind,note\ndoc1,SYNTH PARK,Synthetic floor plans,,2026-11-05,developer,';
const FB = ['B1-B5', '01-05', '06-10', '11-15', '16-20'];
// [ym, sale, floorBandIndex, sqm, price, beds, basis, flags]; resales in the latest 24 months unless noted
const rows = [];
const add = (n, sqm, fl, beds, basis, ym) => { for (let i = 0; i < n; i++) rows.push([ym || 202608, 3, fl, sqm, 1e6, beds == null ? null : beds, basis || null, 0]); };
add(10, 45, 2, 1, 'i'); add(10, 63, 1, 2, 'i'); add(2, 63, 4, 2, 'i');   // two top-storey 63 sqm sales the rental records call 2-bedroom (they are the 1-bedroom penthouse)
add(8, 79, 3); add(1, 79, 4); add(2, 96, 2); add(1, 52, 2);              // 52 sqm: no layout
add(5, 45, 2, 1, 'i', 202301);                                           // older than 24 months
const db = E.loadLayouts(CSV, SRC), P = db.get('SYNTH PARK'), R = F.check(P, rows, FB);
check('the table loads: 7 layouts, developer, publishable, no issues', R.layouts === 7 && R.status === 'developer' && R.publishable && !R.issues.length, R.issues);
check('sizes the table cannot settle: 63 (2/PH), 79 (3/PH), 96 (3/4)', JSON.stringify(R.conflicts.map((c) => c.sqm + ':' + c.groups.join('/'))) === JSON.stringify(['63:2/PH', '79:3/PH', '96:3/4']), R.conflicts);
check('explained share counts every sale; 52 sqm is the size no layout fits', R.sales === 39 && R.explained === Math.round(38 / 39 * 1000) / 1000 && JSON.stringify(R.withoutLevels.unexplained) === '{"52":1}', [R.explained, R.withoutLevels.unexplained]);
check('without levels: 45 verified 1-bed; 63 falls back to the rental labels (2-bed, 12); 79 and 96 unclassified', R.withoutLevels.tiers.verified['1'] === 15 && R.withoutLevels.tiers.inferred['2'] === 12 && R.withoutLevels.tiers.unclassified['size 79'] === 9 && R.withoutLevels.tiers.unclassified['size 96'] === 2, R.withoutLevels.tiers);
check('without levels: latest 24 months 22 of 34 classified; 3-bed withheld (0 kept, 9 could be)', R.withoutLevels.recent === 34 && R.withoutLevels.classified === 22 && R.withoutLevels.types['3'].kept === 0 && !R.withoutLevels.types['3'].shown, R.withoutLevels);
check('levels: each sale matched only to the layouts on its floor range', !!R.withLevels && R.withLevels.tiers.verified['3'] === 8 && R.withLevels.tiers.verified['2'] === 10, R.withLevels && R.withLevels.tiers);
check('levels: the floor-band split of each shared size is listed', JSON.stringify(R.floorConflicts.map((c) => c.sqm + ':' + c.bands.join(','))) === JSON.stringify(['63:01-05 2,06-10 2,11-15 2,16-20 PH', '79:01-05 3,06-10 3,11-15 3,16-20 PH', '96:01-05 3/4,06-10 3/4,11-15 3/4']), R.floorConflicts);
check('levels, default rule A: the two top-storey 63 sqm sales are contradictions (plans: penthouse; published label 2), never forced', R.withLevels.contradictions.length === 2 && R.withLevels.floorRule.length === 0 && R.withLevels.contradictions.every((c) => c.sqm === 63 && c.plans === 1 && c.group === 'PH' && c.rental === 2 && c.floor === '16-20'), R.withLevels);
const RB = F.check(P, rows, FB, 'B');
check('levels, rule B (--floor-rule B): they follow the floor\'s layout, listed as "floor rule" for the private run to confirm', RB.withLevels.contradictions.length === 0 && RB.withLevels.floorRule.length === 2 && RB.withLevels.floorRule.every((c) => c.sqm === 63 && c.plans === 1 && c.group === 'PH' && c.published === 2 && c.floor === '16-20') && RB.withLevels.tiers.verified.PH === 3, RB.withLevels);
check('levels: 96 sqm stays unclassified (3-bed and 4-bed on the same floors)', R.withLevels.tiers.unclassified['size 96'] === 2);
check('levels, rule A: coverage 29 of 34 = 85.3%; 1-, 2- and 3-bed shown; the penthouse group never shown as a group', R.withLevels.classified === 29 && R.withLevels.coverage === 0.853 && R.withLevels.types['1'].shown && R.withLevels.types['2'].shown && R.withLevels.types['3'].shown && !R.withLevels.types.PH.shown, R.withLevels.types);
check('levels, rule B: coverage 31 of 34 = 91.2%; the penthouse group still never shown', RB.withLevels.classified === 31 && RB.withLevels.coverage === 0.912 && !RB.withLevels.types.PH.shown, RB.withLevels.types);
check('a table without a levels column has no levels preview', F.check(E.loadLayouts(CSV.replace(/,levels/, '').replace(/,(1-15|16),doc1/g, ',doc1'), SRC).get('SYNTH PARK'), rows, FB).withLevels === null);
// import: the header, and the folder as the refresh loads it
check('header: a misspelt column is reported (the engine would drop it)', JSON.stringify(F.header(CSV.replace(',levels', ',level')).unknown) === '["level"]' && F.header(CSV).unknown.length === 0 && F.header(CSV).missing.length === 0);
{ const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-fpc-')); fs.writeFileSync(path.join(d, 'layouts.csv'), 'project,code,bedrooms,variant,sqm,sqft,source,status,note\nOTHER,B1,2,,63,,s,approved,\n');
  check('folder: a table not yet in the folder is reported as not used', /loads 0 of this table's 7 rows/.test(F.folderCheck(d, db).join(' ')));
  fs.writeFileSync(path.join(d, 'synth-park.csv'), CSV);
  check('folder: a table whose source is missing from the folder\'s sources.csv is reported', /more issue/.test(F.folderCheck(d, db).join(' ')));
  fs.writeFileSync(path.join(d, 'sources.csv'), SRC); check('folder: once copied there, every row loads (header-aware import)', F.folderCheck(d, db).length === 0, F.folderCheck(d, db));
  fs.writeFileSync(path.join(d, 'synth-park-copy.csv'), CSV); check('folder: a second copy of the same development is reported', /loads 14 of this table's 7 rows/.test(F.folderCheck(d, db).join(' '))); }
check('a row without bedrooms is an issue, never a studio', E.loadLayouts(CSV + '\nSYNTH PARK,X9,,,50,538,1-15,doc1,developer,', SRC).get('SYNTH PARK').issues.some((s) => /bedrooms must be/.test(s)));
// the repository holds no floor-plan table: only the template
const tdir = path.resolve(__dirname, '..');
check('the repository holds no real floor-plan table (only the empty template)', !fs.readdirSync(tdir).some((f) => /\.csv$/i.test(f) && f !== 'floorplan-template.csv') && fs.readFileSync(path.join(tdir, 'floorplan-template.csv'), 'utf8').trim().split(/\n/).length === 1);
console.log('floorplan-check-tests: %d passed, %d failed', ok, fail);
process.exit(fail ? 1 : 0);
