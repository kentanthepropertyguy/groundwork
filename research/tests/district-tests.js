'use strict';
/* R3 District search (30 Oct 2026): the recogniser, the district's developments from the Research index, the panel's wording, and the Map's
   district place (developments recorded in the district; no boundary, no district-wide price).
   node research/tests/district-tests.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', '..');
global.window = undefined;
const L = require(path.join(SITE, 'assets/js/kpt-lg.js')), K = L.KPTLG || L;
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 400)); } };
const rd = (p) => JSON.parse(fs.readFileSync(path.join(SITE, p), 'utf8'));
const J = JSON.stringify;

/* the recogniser: explicit district searches only */
const yes = { 'D19': 19, 'd19': 19, 'D 19': 19, 'd 19': 19, 'D-19': 19, 'District 19': 19, 'district 19': 19, 'DISTRICT19': 19, 'district19': 19, '  District  19  ': 19, 'Dist 19': 19, 'Dist. 19': 19, 'postal district 9': 9, 'D01': 1, 'D1': 1, 'District 01': 1, 'D28': 28 };
Object.keys(yes).forEach((q) => { const r = K.districtOf(q); ok(r && r.n === yes[q] && r.d === String(yes[q]).padStart(2, '0'), 'recognised: "' + q + '"', r); });
['D0', 'D29', 'District 30', 'D99'].forEach((q) => { const r = K.districtOf(q); ok(r && r.bad === true, 'outside D01–D28 is said plainly: "' + q + '"', r); });
['19', 'D19 condo', 'Dover', 'Dunearn', 'D\'Leedon', 'Duo', 'Bishan', '310019', 'Blk 19 Dover', '', 'D', 'District', 'D 1 9'].forEach((q) => ok(K.districtOf(q) === null, 'not a district search: "' + q + '"', K.districtOf(q)));

/* the district names: the same table FIND (kpt-find.js) and the catalogue use */
{
  const kf = fs.readFileSync(path.join(SITE, 'assets/js/kpt-find.js'), 'utf8'), i = kf.indexOf('const DISTRICT_AREAS = {'), j = kf.indexOf('};', i);
  ok(J(vm.runInNewContext('(' + kf.slice(kf.indexOf('{', i), j + 1) + ')')) === J(K.DISTRICT_AREAS), 'district names identical to FIND');
  ok(Object.keys(K.DISTRICT_AREAS).length === 28, '28 districts');
}

/* the district's developments: the Research index only, most recorded sales first */
const ix = rd('data/projects/index.json'), F = {}; ix.fields.forEach((f, i) => { F[f] = i; });
const R = { displayName: (n) => n, fmtMonth: (m) => m };
{
  const rows = K.districtRows(ix, '19'), want = ix.rows.filter((r) => r[F.district] === '19').length;
  ok(rows.length === want && want > 100, 'District 19: every Research development recorded in D19 (' + want + ')', rows.length);
  ok(rows.every((r) => r.district === '19'), 'and only those');
  ok(rows.every((r, i) => !i || rows[i - 1].n >= r.n), 'most recorded sales first');
  let all = 0; for (let d = 1; d <= 28; d++) all += K.districtRows(ix, String(d).padStart(2, '0')).length;
  ok(all === ix.rows.length, 'every development belongs to exactly one district list', [all, ix.rows.length]);
  ok(K.districtRows(null, '19').length === 0, 'no index: an empty list, no error');
}
/* the panel */
{
  const dq = K.districtOf('D19'), rows = K.districtRows(ix, '19'), h = K.districtHtml(dq, rows, R, K.DSTEP, 'map/#pl=district:19');
  const t = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/District 19 · generally Hougang, Punggol, Serangoon Gardens/.test(t), 'heading: "District 19 · generally Hougang, Punggol, Serangoon Gardens"', t.slice(0, 200));
  ok(t.indexOf(rows.length + ' developments with sales in the last 5 years') > -1, 'says how many developments', t.slice(0, 300));
  ok((h.match(/data-id="/g) || []).length === K.DSTEP && /data-lg-dmore/.test(h) && t.indexOf('12 of ' + rows.length + ' shown') > -1, 'the first 12, then Show more');
  ok((K.districtHtml(dq, rows, R, 9999, null).match(/data-id="/g) || []).length === rows.length && !/data-lg-dmore/.test(K.districtHtml(dq, rows, R, 9999, null)), 'all of them once expanded; no Show more');
  ok(/href="map\/#pl=district:19" data-lg-dmap>Explore District 19 on Map/.test(h), '"Explore District 19 on Map" opens the Map\'s district view');
  ok(!/No transactions found/.test(h), 'never "No transactions found"');
  ok(!/\$\s?\d|psf|median|average price|typical price/i.test(t.replace('doesn’t average prices', '')), 'no district-wide price or statistic', t.match(/\$\s?\d|psf|median|typical price/i));
  ok(/Research doesn’t average prices across a district/.test(t), 'says each price is a development\'s own');
  ok(/role="listbox"/.test(h) && /aria-label="Developments in District 19"/.test(h), 'an accessible list');
  ok(/Singapore’s postal districts run from D01 to D28/.test(K.districtHtml(K.districtOf('D29'), [], R)), 'D29: says the range');
  const d6 = K.districtRows(ix, '06'); ok(d6.length > 0 && !/data-lg-dmore/.test(K.districtHtml(K.districtOf('D6'), d6, R)), 'a small district (D06) lists them all');
  ok(/holds no private development with sales here/.test(K.districtHtml({ d: '24', n: 24 }, [], R)), 'a district with no developments says so');
}

/* the Map: a district place lists the developments recorded there; no boundary, no price of its own */
{
  const core = fs.readFileSync(path.join(SITE, 'assets/js/kpt-map-core.js'), 'utf8'), app = fs.readFileSync(path.join(SITE, 'assets/js/kpt-map-app.js'), 'utf8');
  const blk = core.slice(core.indexOf("if (pl.t === 'district')"), core.indexOf("if (pl.t === 'postal')"));
  ok(blk.length > 100 && /p\.district === dd/.test(blk) && !/rings|polygon|psf|median/.test(blk), 'the Map\'s district place: developments by their recorded district; no rings, polygon or price');
  ok(/Not a district boundary, and not every home in the district/.test(app) && /Developments recorded in postal District/.test(core), 'labelled as developments recorded in the district');
  const mp = app.slice(app.indexOf("if (d.t === 'district') return"), app.indexOf("if (d.t === 'area') return"));
  ok(mp.length > 50 && !/areaRings/.test(mp) && /cmp: d\.devs\.map/.test(mp), 'the map marks the district\'s developments and draws no area outline');
  const places = rd('data/map/places.json'), PF = places.fields.indexOf('district');
  ok(places.rows.filter((r) => r[PF] === '19').length > 100, 'the Map\'s own records carry a district (D19: ' + places.rows.filter((r) => r[PF] === '19').length + ')');
  const mapPage = fs.readFileSync(path.join(SITE, 'research/map/index.html'), 'utf8');
  ok(/kpt-map-app\.js\?v=2026-10-30\.1/.test(mapPage) && /kpt-map-core\.js\?v=2026-10-27\.1/.test(mapPage), 'the Map page: only the app\'s version tag changed');
}
console.log('district-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
