'use strict';
/* Homepage V1.1 (Master Planning, 6 Nov 2026): the hero's map preview, in node. Run from the site folder: node research/tests/home-tests.js
   1 data: data/map/home.json is exactly what the Map's current data gives (tools/market-data/build-home-preview.js --check), and each featured
     development's figures are the Map card's own (kpt-map-core lead(), worked out again here); dots are positioned developments only
   2 wording: every figure, month and link on the panel comes from home.json; prices as $1.78m / $990k; links to the development's Research page
     and to the Map at that development; a development without a 12-month typical price says so
   3 basemap: the Map's own OneMap tiles; OneMap's published attribution (logo, OneMap © contributors | Singapore Land Authority, both linked);
     only the tiles the preview shows (half a tile of margin), the next zoom at half size on a high-density screen
   4 the page: no typed-in figure or demo link; the journeys, search, links and calculators kept; the old map card gone; "TikTok Live every
     night" in every footer and no livestream hours anywhere; the frozen Map, its data and PRISM untouched */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.resolve(__dirname, '../..'), R = (f) => path.join(root, f), read = (f) => fs.readFileSync(R(f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; } else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 400)); } };
const H = require(R('assets/js/gw-home.js')), K = require(R('assets/js/kpt-map-core.js'));
const D = JSON.parse(read('data/map/home.json'));

/* ---------- 1 data ---------- */
{
  const r = cp.spawnSync('node', [R('tools/market-data/build-home-preview.js'), '--check'], { cwd: root, encoding: 'utf8' });
  ok(r.status === 0, 'data/map/home.json is exactly what the Map data gives now', r.stderr);
  const places = JSON.parse(read('data/map/places.json')), ev = JSON.parse(read('data/map/ev.json')), M = K.create(places, JSON.parse(read('data/map/amen.json')), {});
  M.setEvidence(ev);
  ok(D.featured.map((f) => f.id).join() === 'jadescape,kingsford-waterbay,thomson-three', 'the three developments, in the approved order');
  ok(D.asOf === places.asOf && D.latestMonth === places.latestMonth, 'the same data month as the Map');
  D.featured.forEach((f) => {
    const p = M.BYID[f.id], l = M.lead(p.n), row = l && l.mm.win === 0 ? l.row : null;
    ok(p && f.name === p.n && f.lat === p.lat && f.lon === p.lon && f.s12 === p.s12 && f.p12 === p.p12 && f.district === p.district, f.id + ': name, place and 12-month counts are the Map\'s');
    ok(row && f.lead && f.lead.mk === l.mk && f.lead.bin === row.bin && f.lead.n === row.n && f.lead.psf === row.med && f.lead.price === row.pmed && row.n >= 5 && row.act >= 3, f.id + ': the typical price is the Map card\'s (same market, band and median; the 5-sales / 3-months rule)', [f.lead, row]);
  });
  ok(D.dots.length > 40 && D.dots.length < 140 && D.dots.every((d) => { const p = M.BY[d[2]]; return p && p.pos && p.s12 >= 12 && p.lat === d[0] && p.lon === d[1]; }), 'dots: positioned developments with 12+ secondary sales in 12 months, at their Map positions (' + D.dots.length + ')');
  ok(fs.statSync(R('data/map/home.json')).size < 12000, 'the preview data is small (' + fs.statSync(R('data/map/home.json')).size + ' bytes)');
}

/* ---------- 2 wording ---------- */
{
  const v = D.featured.map((f) => H.view(f, D, ''));
  ok(v[0].psf === '$2,323' && /^\$1\.78m typical for 700–799 sq ft \(23 resales\) · URA records to Sep 2026 · past sales, not a valuation$/.test(v[0].hint), 'Jadescape: $2,323 psf; $1.78m for 700–799 sq ft (23 resales), to Sep 2026', v[0]);
  ok(/^\$990k typical for 600–699 sq ft \(27 resales\)/.test(v[1].hint) && v[1].count === 64, 'Kingsford Waterbay: $990k, 27 resales; 64 in 12 months', v[1]);
  ok(v.every((x, i) => x.research === 'research/#/prism/' + D.featured[i].id && x.map === 'research/map/#p=' + D.featured[i].id), 'links: the development\'s Research page and the Map at it');
  ok(v.every((x, i) => x.meta === 'District ' + D.featured[i].district + ' · ' + D.featured[i].street + ' · Condominium'), 'the line under the name: district, street, class');
  const none = H.view(Object.assign({}, D.featured[0], { lead: null }), D, '');
  ok(none.psf === null && /^Not enough sales in one size in the last 12 months for a typical price/.test(none.hint), 'no supported 12-month band: said, no figure');
  const sub = H.view(Object.assign({}, D.featured[0], { sub12: 3, lead: Object.assign({}, D.featured[0].lead, { sub: 2 }) }), D, '');
  ok(/resales and sub-sales/.test(sub.countSub.join(' ')) && /resales and sub-sales\)/.test(sub.hint), 'sub-sales in the counts: named');
}

/* ---------- 3 basemap ---------- */
{
  const view = read('assets/js/kpt-map-view.js'), mapTiles = /const TILES = '([^']+)'/.exec(view)[1];
  ok(H.TILES === mapTiles, 'the Map\'s own OneMap tiles', [H.TILES, mapTiles]);
  ok(H.TILES_HD === 'https://www.onemap.gov.sg/maps/tiles/Default_HD/{z}/{x}/{y}.png', 'high-density screens: OneMap\'s Default_HD tiles (onemap.gov.sg/docs/maps)');
  ok(/src="https:\/\/www\.onemap\.gov\.sg\/web-assets\/images\/logo\/om_logo\.png"[^>]*width="20" height="20"/.test(H.ATTR) && /<a href="https:\/\/www\.onemap\.gov\.sg\/"[^>]*>OneMap<\/a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https:\/\/www\.sla\.gov\.sg\/"[^>]*>Singapore Land Authority<\/a>/.test(H.ATTR), 'OneMap\'s published attribution: the 20 px logo, OneMap © contributors | Singapore Land Authority, both linked');
  const j = H.proj(1.35181, 103.8383);
  ok(Math.floor(j.x / 256) === Math.floor((103.8383 + 180) / 360 * 16384) && Math.floor(j.x / 256) === 12917 && Math.floor(j.y / 256) === 8130, 'Jadescape falls on OneMap tile 14/12917/8130 (Web Mercator, as the tiles)', j);
  const t1 = H.tilesFor(j, 888, 537, false), t2 = H.tilesFor(j, 358, 320, true);
  ok(t1.length <= 30 && t1.every((t) => t.z === 14 && t.size === 256 && /\/Default\/14\//.test(t.src)), 'desktop 888 x 537: ' + t1.length + ' tiles at zoom 14 (half a tile of margin)');
  ok(t2.length <= 30 && t2.every((t) => t.z === 15 && t.size === 128 && /\/Default_HD\/15\//.test(t.src)), 'phone 358 x 320, high density: ' + t2.length + ' tiles at zoom 15, 128 px');
  ok(t1.every((t) => t.left <= j.x + 444 + 128 && t.left + 256 >= j.x - 444 - 128), 'only the tiles the view can show');
}

/* ---------- 4 the page ---------- */
{
  const html = read('index.html'), main = (html.match(/<main>[\s\S]*?<\/main>/) || [''])[0];
  ok(/data-gw-home/.test(main) && /data-gh-map/.test(main) && /data-gh-pv/.test(main) && /data-gh-chips/.test(main) && /assets\/js\/gw-home\.js\?v=/.test(html) && /assets\/css\/gw-home\.css\?v=/.test(html), 'the hero preview is on the homepage');
  ok(!/\$\d|\d+ resales|psf/.test(main) && !/href="#"/.test(main), 'no typed-in figure and no placeholder link on the homepage');
  const js = read('assets/js/gw-home.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok(!/\b(2,?323|1,?478|2,?152|1775000|990000|jadescape|kingsford|thomson)\b/i.test(js), 'no figure or development typed into the page script');
  ok(/data-journey="buy"/.test(main) && /data-journey="sell"/.test(main) && /class="gw-door gw-door3" href="research\/"/.test(main) && /data-gw-search="home"/.test(main) && /tools\/payment-planner\//.test(main) && /research\/sample\//.test(main) && /tools\/hdb-upgrade\//.test(main), 'kept: the three journeys, the search, the links and the calculators');
  ok(!/gw-mapf|map-thumb/.test(main) && /data-gh-open[^>]*>|href="research\/map\/"[^>]*data-gh-open/.test(main), 'the old map card is replaced by the hero map and its Explore on Map');
  ok(!/data-gw-try=/.test(main), 'the search\'s "Try" row now offers the three developments (no ABSD / Valuation buttons)');
  const pages = cp.execSync('git ls-files "*.html"', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean).map((f) => [f, read(f)]).filter(([, t]) => /<footer class="gw-foot">/.test(t));
  ok(pages.length >= 19 && pages.every(([, t]) => /TikTok Live every night · @kennx8898<\/a>/.test(t) && /class="gw-live">LIVE</.test(t) && /ken-portrait\.jpg/.test(t)), 'every footer: "TikTok Live every night", the LIVE line and Ken\'s photo kept (' + pages.length + ' pages)');
  // the site's files only: the tests that look for the old wording necessarily contain it (fixed 6 Nov 2026: this check found itself once committed)
  const all = cp.execSync('git grep -l -e "8–9.30pm" -e "nightly 8" -- "*.html" "*.js" "*.css" ":!research/tests" ":!tools/financial-tests" || true', { cwd: root, encoding: 'utf8' }).trim();
  ok(all === '', 'no livestream hours anywhere on the site', all);
  let changed = []; try { changed = cp.execSync('git diff --name-only origin/main', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean); } catch (e) { changed = null; }
  // HSU P1 (6 Nov 2026): the two new engine extension files are additions loaded by no page; the existing calculators and engine stay untouched
  if (changed) changed = changed.filter((f) => !/^assets\/js\/gw-(calc|engine)-position\.js$/.test(f));
  // P2/P3 (6 Nov 2026): this guards a HOMEPAGE release (one that changes the homepage itself); a calculator release is checked by its own tests
  if (changed && changed.indexOf('index.html') < 0) changed = null;
  if (changed) ok(!changed.some((f) => /^research\/map\/|^assets\/js\/kpt-map|^assets\/css\/kpt-map|^data\/(map\/(?!home\.json)|prism\/|projects\/)|^assets\/js\/(gw-prism|gw-pmm|gw-engine|gw-fin3|gw-calc)/.test(f)), 'the frozen Map, its data, PRISM, Plan My Move and the calculators are untouched', changed);
}
console.log('home-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
