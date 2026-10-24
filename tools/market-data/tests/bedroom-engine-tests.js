// node tools/market-data/tests/bedroom-engine-tests.js : bedroom-type classification engine. Synthetic layouts and sales only (tests, never findings).
'use strict';
const assert = require('assert');
const path = require('path'), fs = require('fs');
const E = require('../bedroom-engine.js');
const PULSE = require('../../../assets/js/gw-pulse.js');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

const CSV = [
  'project,code,bedrooms,variant,sqm,sqft,source,status,note',
  'TEST PARK,S1,1,,,538,s1,secondary,',
  'TEST PARK,P2,2,premium,,700,s1,secondary,',
  'TEST PARK,Q2,2,study,,700,s1,secondary,',
  'TEST PARK,R3,3,,80,861,s1,secondary,',
  'TEST PARK,X9,2,,70.5,,s1,secondary,boundary layout',
  'TEST PARK,D1,4,,115,,s1,draft,draft rows are never used',
  'TEST PARK,PH1,4,penthouse,160,,s1,secondary,',
  'TEST PARK,Z1,3,,90,,s1,secondary,',
  'TEST PARK,Z2,2,,90,,s1,secondary,',
].join('\n');
const SRC = 'id,project,title,url,retrieved,kind,note\ns1,TEST PARK,Test brochure,https://example.com,2026-10-24,secondary,';
const DB = E.loadLayouts(CSV, SRC), P = DB.get('TEST PARK');

console.log('Areas and rounding');
t('a stated value is an interval of half its last digit', () => {
  assert.deepStrictEqual(E.interval('65', 'sqm'), [64.5, 65.5]);
  const a = E.interval('64.6', 'sqm'); assert.ok(Math.abs(a[0] - 64.55) < 1e-9 && Math.abs(a[1] - 64.65) < 1e-9);
  const f = E.interval('700', 'sqft'); assert.ok(Math.abs(f[0] - 699.5 / 10.7639) < 1e-9 && Math.abs(f[1] - 700.5 / 10.7639) < 1e-9);
  assert.strictEqual(E.decimalsOf('65.0'), 0); assert.strictEqual(E.decimalsOf('65.50'), 1); assert.strictEqual(E.interval('0', 'sqm'), null);
});
t('touching intervals do not overlap; a layout on a .5 boundary fits both neighbours', () => {
  assert.strictEqual(E.overlaps([64.5, 65.5], [65.5, 66.5]), false);
  const r64 = E.classify('70', P.layouts), r65 = E.classify('71', P.layouts);
  assert.ok(r64.codes.indexOf('X9') > -1 && r65.codes.indexOf('X9') > -1, 'X9 (70.5 sqm) fits URA 70 and 71');
});

console.log('Layout table');
t('draft rows are loaded but never used; sources are attached; status is the weakest used row', () => {
  assert.ok(P.all.some((l) => l.code === 'D1') && !P.layouts.some((l) => l.code === 'D1'));
  assert.strictEqual(P.sources.length, 1); assert.strictEqual(P.status, 'secondary'); assert.strictEqual(P.publishable, false);
});
t('bad rows are reported, not silently used', () => {
  const D = E.loadLayouts('project,code,bedrooms,variant,sqm,sqft,source,status\nQ,A,two,,50,,s,secondary\nQ,B,2,,,,s,secondary\nQ,C,2,,50,700,s,secondary\nQ,C,2,,51,,s,secondary', '');
  const Q = D.get('Q'); assert.ok(Q.issues.some((x) => /whole number/.test(x)) && Q.issues.some((x) => /no area/.test(x)) && Q.issues.some((x) => /disagree/.test(x)) && Q.issues.some((x) => /duplicate/.test(x)));
  assert.ok(!Q.layouts.some((l) => l.code === 'A'));
});
t('a blank bedroom count is missing, never read as a studio', () => {
  const Q = E.loadLayouts('project,code,bedrooms,variant,sqm,sqft,source,status\nQ,A,,,50,,s,secondary\nQ,S,0,,35,,s,secondary', '').get('Q');
  assert.deepStrictEqual(Q.layouts.map((l) => l.code), ['S']); assert.ok(Q.issues.some((x) => /A\): bedrooms must be/.test(x)));
});
t('a table of developer or approved rows only is publishable', () => {
  const D = E.loadLayouts('project,code,bedrooms,variant,sqm,sqft,source,status\nQ,A,2,,50,,s,developer\nQ,B,3,,70,,s,approved', 'id,project,title\ns,Q,Brochure');
  assert.strictEqual(D.get('Q').publishable, true); assert.strictEqual(D.get('Q').status, 'developer');
});

console.log('Classes');
t('A: one layout fits (538 sqft = 50 sqm)', () => { const r = E.classify('50', P.layouts); assert.strictEqual(r.cls, 'A'); assert.strictEqual(r.group, '1'); });
t('B: 2-bedroom premium and 2-bedroom + study share 65 sqm, same bedroom group', () => { const r = E.classify('65', P.layouts); assert.strictEqual(r.cls, 'B'); assert.strictEqual(r.group, '2'); assert.deepStrictEqual(r.codes.sort(), ['P2', 'Q2']); });
t('C: a 2-bedroom and a 3-bedroom layout both fit 90 sqm, left unclassified', () => { const r = E.classify('90', P.layouts); assert.strictEqual(r.cls, 'C'); assert.strictEqual(r.group, null); assert.deepStrictEqual(r.groups, ['2', '3']); });
t('D: nothing fits; the nearest layout and gap are logged', () => { const r = E.classify('81', P.layouts); assert.strictEqual(r.cls, 'D'); assert.strictEqual(r.near.code, 'R3'); assert.strictEqual(r.near.gap, 1); });
t('penthouses are their own group, never pooled with 4-bedroom units', () => { const r = E.classify('160', P.layouts); assert.strictEqual(r.group, 'PH'); assert.strictEqual(E.groupLabel('PH'), 'Penthouse'); });
t('a draft layout never classifies', () => { assert.strictEqual(E.classify('115', P.layouts).cls, 'D'); });
t('the tolerance is opt-in and only for sensitivity runs', () => { assert.strictEqual(E.classify('81', P.layouts).cls, 'D'); assert.strictEqual(E.classify('81', P.layouts, { tolerance: 1 }).cls, 'A'); });
t('a decimal URA area narrows the match', () => { assert.strictEqual(E.classify('80.4', P.layouts).cls, 'A'); assert.strictEqual(E.classify('80.6', P.layouts).cls, 'D'); });

console.log('Market Pulse rules are the same as gw-pulse.js');
t('reading() equals GW_PULSE.compute on every Research size band with a resale reading (real published aggregates)', () => {
  const site = path.join(__dirname, '..', '..', '..'), man = JSON.parse(fs.readFileSync(path.join(site, 'data/projects/manifest.json'), 'utf8'));
  const F = {}; man.fields.cell.forEach((k, i) => { F[k] = i; });
  const mIdx = (s) => { const a = String(s).split('-').map(Number); return a[0] * 12 + a[1] - 1; }, lastIdx = mIdx(man.latestMonth);
  const intToIdx = (v) => Math.floor(v / 100) * 12 + (v % 100) - 1;
  let checked = 0, trends = 0;
  for (let s = 0; s < man.shards; s++) {
    const f = path.join(site, 'data/projects/detail', 's' + String(s).padStart(2, '0') + '.json'); if (!fs.existsSync(f)) continue;
    const projects = JSON.parse(fs.readFileSync(f, 'utf8')).projects;
    Object.keys(projects).forEach((id) => {
      const p = projects[id]; if (!(p.sale && p.sale.resale > 0)) return;
      const pc = (p.periodCells || []).filter((r) => r[F.sale] === 3), bins = Array.from(new Set(pc.map((r) => r[F.bin])));
      bins.forEach((bin) => {
        const at = (w) => { const r = pc.find((x) => x[F.bin] === bin && x[F.win] === w); return r ? { n: r[F.n], act: r[F.act], last: intToIdx(r[F.last]), psf: [r[F.min], r[F.q1], r[F.med], r[F.q3], r[F.max]] } : null; };
        const mine = E.reading(at(0), at(1), lastIdx), theirs = PULSE.compute(p, man, { sale: 'resale', bin });
        if (theirs.state !== 'trend') { assert.strictEqual(mine.evidence, 'none', id + ' ' + bin); }
        else { trends++; assert.strictEqual(mine.evidence, theirs.evidence, id + ' ' + bin + ' evidence'); assert.strictEqual(mine.dir, theirs.dir, id + ' ' + bin + ' dir'); assert.strictEqual(mine.pct, theirs.pct, id + ' ' + bin + ' pct'); }
        checked++;
      });
    });
  }
  assert.ok(checked > 2000 && trends > 200, 'checked ' + checked + ' bands, ' + trends + ' with a reading');
});

console.log('One development, end to end');
const ym = (y, m) => y * 12 + m - 1, LATEST = ym(2026, 9);
function sales() {
  const out = []; let i = 0;
  const add = (area, psf, monthsBack, sale, floor) => { const sqm = Number(area); out.push({ sale: sale || 3, areaRaw: area, sqm, psf, price: Math.round(psf * sqm * 10.7639), ym: LATEST - monthsBack, floor: floor || '06-10' }); i++; };
  for (let k = 0; k < 10; k++) { add('65', 1500 + k * 5, k); add('65', 1450 + k * 5, 12 + k); }     // 2-bedroom (B), both periods
  for (let k = 0; k < 10; k++) { add('80', 1300 + k * 4, k); add('80', 1260 + k * 4, 13 + k); }     // 3-bedroom (A)
  for (let k = 0; k < 3; k++) { add('90', 1400, k * 2); add('81', 1350, k * 3 + 1, 3, '01-05'); }   // C and D, recent
  add('50', 1800, 2, 2); add('50', 1700, 30, 1);                                                    // a sub-sale and a new sale
  return out;
}
const res = E.analyse(sales(), P, { latest: LATEST, periodMonths: 12, periods: 5, bin: 100 });
const S = res.summary;
t('totals and classes add up, by sale type and period', () => {
  assert.strictEqual(S.totals.all.n, 48); assert.strictEqual(S.totals.all.classified + S.totals.all.C + S.totals.all.D, 48);
  assert.strictEqual(S.totals.resale.C, 3); assert.strictEqual(S.totals.resale.D, 3); assert.strictEqual(S.totals.sub.n, 1); assert.strictEqual(S.totals.new.n, 1);
  assert.strictEqual(S.periods[0].n, 26); assert.strictEqual(S.periods[1].n, 20);
});
t('C and D never reach a bedroom group; groups carry exact vs shared-layout counts', () => {
  assert.strictEqual(S.groups['2'].sales.resale.all.n, 20); assert.strictEqual(S.groups['2'].exact, 0);
  assert.strictEqual(S.groups['3'].sales.resale.all.n, 20); assert.strictEqual(S.groups['3'].exact, 20);
  assert.strictEqual(S.groups['2'].ambiguousOverlap, 3); assert.strictEqual(S.groups['3'].ambiguousOverlap, 3);
  assert.strictEqual(S.groups['3'].sales.resale.ambiguousShare, Math.round(3 / 23 * 1000) / 1000);
});
t('unclassified areas are listed with counts, candidates and the nearest layout', () => {
  assert.deepStrictEqual(S.unclassified.C.map((x) => [x.sqm, x.n]), [['90', 3]]);
  assert.strictEqual(S.unclassified.D[0].sqm, '81'); assert.strictEqual(S.unclassified.D[0].near.code, 'R3');
  assert.deepStrictEqual(S.layoutCheck.repeatedUnmatched.map((x) => x.sqm), ['81']);
  assert.ok(S.layoutCheck.unusedLayouts.indexOf('PH1') > -1);
});
t('bias compares classified and unclassified resales in the two periods', () => {
  assert.strictEqual(S.bias.n, 46); assert.strictEqual(S.bias.unclassified, 6);
  assert.strictEqual(S.bias.lowFloorShare.unclassified, 0.5); assert.strictEqual(S.bias.lowFloorShare.classified, 0);
  assert.ok(typeof S.bias.psfGapPct === 'number');
});
t('bedroom groups get the Market Pulse rules; coverage is the share of last-12-month resales under a reading', () => {
  assert.strictEqual(S.pulse.byGroup['3'].evidence, 'strong'); assert.strictEqual(S.pulse.byGroup['2'].evidence, 'strong');
  assert.strictEqual(S.pulse.n12, 26); assert.strictEqual(S.pulse.groups.coverStrong, Math.round(20 / 26 * 1000) / 1000);
});
t('a single-area group has no mix shift', () => { assert.strictEqual(S.mix['3'].tvd, 0); assert.strictEqual(S.mix['3'].flag, false); });
t('a change in layout mix that moves the median on its own is flagged', () => {
  const rows = [];
  for (let k = 0; k < 8; k++) rows.push({ sale: 3, areaRaw: '43', sqm: 43, psf: 2000, price: 1, ym: LATEST - k });          // latest: mostly the small 1-bedroom
  for (let k = 0; k < 2; k++) rows.push({ sale: 3, areaRaw: '45', sqm: 45, psf: 1800, price: 1, ym: LATEST - k });
  for (let k = 0; k < 2; k++) rows.push({ sale: 3, areaRaw: '43', sqm: 43, psf: 2000, price: 1, ym: LATEST - 12 - k });     // earlier: mostly the larger one
  for (let k = 0; k < 8; k++) rows.push({ sale: 3, areaRaw: '45', sqm: 45, psf: 1800, price: 1, ym: LATEST - 12 - k });
  const Q = E.loadLayouts('project,code,bedrooms,variant,sqm,sqft,source,status\nQ,A1,1,,43,,s,secondary\nQ,A2,1,study,45,,s,secondary', '').get('Q');
  const m = E.analyse(rows, Q, { latest: LATEST }).summary.mix['1'];
  assert.strictEqual(m.tvd, 0.6); assert.strictEqual(m.fixedPct, 0); assert.ok(m.rawPct > 10); assert.strictEqual(m.flag, true);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
