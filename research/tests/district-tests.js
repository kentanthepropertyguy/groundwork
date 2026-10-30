'use strict';
/* R3 District search (30 Oct 2026): the recogniser, the district's developments from the Research index, the panel's wording, and the Map's
   district place (developments recorded in the district; no boundary, no district-wide price).
   node research/tests/district-tests.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', '..');
global.window = undefined;
global.GWN = require(path.join(SITE, 'assets/js/gw-nav.js'));   // the site's one district definition, loaded first on every page
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
  ok(J(vm.runInNewContext('(' + kf.slice(kf.indexOf('{', i), j + 1) + ')')) === J(global.GWN.DISTRICTS), 'district names identical to FIND');
  ok(Object.keys(global.GWN.DISTRICTS).length === 28, '28 districts');
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
  // the shared Map version (Research's MAPV, Budget Search's MAP_V, and the Map page's four Map files) moved on with this release, so no browser keeps the old core
  const R = fs.readFileSync(path.join(SITE, 'research/index.html'), 'utf8'), Wp = fs.readFileSync(path.join(SITE, 'tools/what-can-i-buy/index.html'), 'utf8');
  const vers = [/MAPV = '([^']+)'/.exec(R)[1], /gwLazy-loc"><script src="[^"]*kpt-map-core\.js\?v=([^"]+)"/.exec(R)[1], /MAP_V: '([^']+)'/.exec(Wp)[1]].concat(['kpt-map-core\\.js', 'kpt-map-view\\.js', 'kpt-map-app\\.js', 'kpt-map\\.css'].map((n) => new RegExp(n + '\\?v=([^"\']+)').exec(mapPage)[1]));
  ok(vers.every((v) => v === vers[0]) && vers[0] !== '2026-10-27.1' && /^2026-10-30\.\d+$/.test(vers[0]), 'one new Map version everywhere the Map files load (' + vers[0] + ')', vers);
}
/* R3b (30 Oct 2026): the site search (homepage box and top-bar Search), Research's #/district/N address and the Map's own search */
{
  const nav = fs.readFileSync(path.join(SITE, 'assets/js/gw-nav.js'), 'utf8'), i = nav.indexOf('const DISTRICTS = {'), j = nav.indexOf('};', i);
  ok(i > 0 && J(vm.runInNewContext('(' + nav.slice(nav.indexOf('{', i), j + 1) + ')')) === J(global.GWN.DISTRICTS), 'site search: district names identical to FIND and Research');
  ok(global.GWN.districtOf === global.GWN.districtOf && K.districtOf('D19').n === 19 && global.GWN.districtOf('d19').n === 19 && global.GWN.districtOf('19') === null, 'Research uses the site\'s one recogniser (gw-nav.js)');
  const lg = fs.readFileSync(path.join(SITE, 'assets/js/kpt-lg.js'), 'utf8'), core0 = fs.readFileSync(path.join(SITE, 'assets/js/kpt-map-core.js'), 'utf8');
  ok(!/'19': 'Hougang/.test(lg) && !/postal\\s\+district/.test(lg) && !/'19': 'Hougang/.test(core0) && !/postal\\s\+district/.test(core0) && (nav.match(/'19': 'Hougang/g) || []).length === 1, 'one definition: no copy of the district names or the matching rule in Research or the Map');
  ok(/research\/#\/district\/' \+ dist/.test(nav) && /research\/map\/#pl=district:' \+ dist/.test(nav) && /!pc && !failed && !dist\)/.test(nav), 'site search: District N leads to Research and to the Map, and never says "Nothing matches"');
  const RS = require(path.join(SITE, 'assets/js/kpt-research.js'));
  ok(J(RS.parseHash('#/district/19')) === J({ view: 'home', opt: 'dev', district: 19 }) && RS.parseHash('#/district/29').district === undefined && RS.parseHash('#/district/abc').district === undefined && RS.parseHash('#/district/1').district === 1, 'Research: #/district/N (1–28) opens the home with that district; anything else is the plain home');
  const core = fs.readFileSync(path.join(SITE, 'assets/js/kpt-map-core.js'), 'utf8');
  ok(/m\.districtQuery = /.test(core) && /if \(dn\) return \[\{ t: 'district', n: String\(dn\), label: 'District ' \+ dn/.test(core), 'Map search: "D19" offers District 19');
  const mapPage = fs.readFileSync(path.join(SITE, 'research/map/index.html'), 'utf8');
}
console.log('district-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
