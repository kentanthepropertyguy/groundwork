'use strict';
/* New Launches catalogue V1 (Claude C FINAL r3, 29 Oct 2026): the renderer on the site's own data, fixed at 29 Oct 2026 08:00 UTC.
   Wording by state exactly as spec §5, the reference results (§4) through the page's own results(), the rendered-text scan (no provider name,
   no counts, no "sold out", no "available now"), the featured block byte-identical, and the missing-data fallback.
   node research/tests/catalogue/ui-tests.js */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const SITE = path.join(__dirname, '..', '..', '..'), C = require(path.join(SITE, 'assets/js/gw-catalogue.js')), U = C.UI;
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 500)); } };
const rd = (p) => JSON.parse(fs.readFileSync(path.join(SITE, p), 'utf8'));
const inv = rd('data/projects/inventory.json'), roster = rd('data/projects/launch-roster.json'), reg = rd('data/registry/index.json');
const classes = {}, research = {}; reg.rows.forEach((r) => { research[r[0]] = true; if (r[reg.fields.indexOf('cls')] === 'ec') classes[r[0]] = 'ec'; });
const microsites = { 'thomson-reserve': 'https://units.thomsonreserve.kentanthepropertyguy.com/', 'lucerne-grand': 'https://lucernegrand.kentanthepropertyguy.com/', 'hougang-central': 'https://hougangcentral.kentanthepropertyguy.com/', 'one-chuan-grove': 'https://onechuangrove.kentanthepropertyguy.com/' };
const model = (iso) => C.build({ inventory: inv, roster, classes, microsites, now: Date.parse(iso) });
const M = model('2026-10-29T08:00:00Z'), by = {}; M.forEach((r) => { by[r.slug] = r; });
const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const F = (o) => Object.assign(U.DEFAULT(), o), O = { research, root: '../../' };
const cnt = (f) => { const R = U.results(M, f); return [R.main.filter((x) => x.tier === 'within').length, R.main.filter((x) => x.tier === 'around').length, R.over10.length, R.over15.length]; };

/* §5 wording */
ok(U.stateLine(by['21-anderson']) === 'Indicative developer listing price · Last checked 27 Oct 2026', 'current: "Indicative developer listing price · Last checked 27 Oct 2026"', U.stateLine(by['21-anderson']));
const N = model('2026-11-15T05:00:00Z').find((r) => r.slug === '21-anderson');
ok(U.stateLine(N) === 'Indicative developer listing price · Last checked 27 Oct 2026 · older listing', 'older (15 Nov): "… · older listing"', U.stateLine(N));
ok(U.stateLine(by['arina-east-residences']) === 'Prices not shown: last checked 7 Oct 2026', 'prices hidden: "Prices not shown: last checked 7 Oct 2026"', U.stateLine(by['arina-east-residences']));
const none = M.find((r) => r.state === 'none_shown');
ok(/^No units currently shown · Last checked \d+ \w{3} 2026$/.test(U.stateLine(none)), 'none shown: "No units currently shown · Last checked …"', U.stateLine(none));
ok(U.stateLine(by.turquoise) === 'Listing details are being verified', 'under review: "Listing details are being verified"');
const H = model('2026-12-27T06:00:00Z');
ok(H.every((r) => r.state === 'prices_hidden') && txt(U.resultsHtml(H, F({}), O)).indexOf('$') < 0, '27 Dec: every project still listed, no price anywhere');
{
  const h = U.resultsHtml(M, F({}), O), t = txt(h);
  ok((h.match(/<tr data-cat-slug=/g) || []).length === 90 && (h.match(/<li class="gw-cat-card"/g) || []).length === 90, 'no filters: all 90 roster projects, table rows and cards');
  const order = (h.match(/<tr [^>]*data-cat-state="(\w+)"/g) || []).map((x) => /state="(\w+)"/.exec(x)[1]), rank = { listed: 0, none_shown: 1, under_review: 2, prices_hidden: 3 };
  ok(order.every((s, i) => !i || rank[order[i - 1]] <= rank[s]), 'listed first, then none shown, under review and prices hidden');
  ok(!/huttons|sold out|sold-out|available now|only \d+ left|\bunits? left\b|\d+ units\b/i.test(t), 'rendered-text scan: no provider name, unit counts, "sold out", "available now" or "only N left"');
  ok(/data-kpt-ms="lucerne-grand" data-host="lucernegrand\.kentanthepropertyguy\.com">Project site ↗</.test(h), 'Lucerne Grand links its featured project site (the page’s own attribution and tracking)');
  ok(/href="\.\.\/\.\.\/research\/#\/p\/21-anderson" data-cat-link="research"/.test(h), 'a registered development links its past transactions in Research');
  ok(/data-cat-slug="altura"[^>]*>[\s\S]*?Executive Condominium/.test(h), 'an EC carries "Executive Condominium"');
  const row = /<tr data-cat-slug="tmw-maxwell"[\s\S]*?<\/tr>/.exec(h)[0];
  ok(txt(row).indexOf('$1.3m to $2.35m wide range') > -1 && txt(row).indexOf('27 Oct 2026') > -1, 'TMW Maxwell 1-bed: $1.3m to $2.35m, wide range (the caption says from-prices); last checked', txt(row));
  const nr = /<tr data-cat-slug="newport-residences"[\s\S]*?<\/tr>/.exec(h)[0];
  ok(txt(nr).indexOf('$8.25m') > -1 && !/to \$103/.test(txt(nr)), 'Newport 4-bed: from $8.25m, the highest price hidden', txt(nr));
}
/* §4 reference results, through the page's own grouping */
ok(JSON.stringify(cnt(F({ max: 2e6, allowance: 0.15 }))) === '[47,1,2,1]', 'up to $2m: 47 within, 1 around, 2 over 10%, 1 over 15%', cnt(F({ max: 2e6, allowance: 0.15 })));
ok(JSON.stringify(cnt(F({ max: 1.5e6, allowance: 0.15 }))) === '[25,5,7,2]', 'up to $1.5m: 25 / 5 / 7 / 2');
ok(JSON.stringify(cnt(F({ beds: 3, max: 3e6, allowance: 0.15 }))) === '[31,1,6,2]', '3-bed up to $3m: 31 / 1 / 6 / 2');
ok(JSON.stringify(cnt(F({ beds: 2, max: 2.5e6, allowance: 0.15 }))) === '[35,1,2,0]', '2-bed up to $2.5m: 35 / 1 / 2 / —');
ok(U.results(M, F({ beds: 4, tenure: ['freehold'] })).n === 23 && U.results(M, F({ sizeMin: 1000, sizeMax: 1100 })).n === 29, 'freehold or 999-year 4-bed 23; 1,000–1,100 sq ft 29');
{
  const h10 = U.resultsHtml(M, F({ max: 2e6, allowance: 0.10 }), O), h15 = U.resultsHtml(M, F({ max: 2e6, allowance: 0.15 }), O), h0 = U.resultsHtml(M, F({ max: 2e6, allowance: 0 }), O);
  ok(/data-cat-grp="over10"/.test(h10) && !/data-cat-grp="over15"/.test(h10) && /data-cat-grp="over15"/.test(h15) && !/data-cat-grp="over/.test(h0), 'over-budget sections: 10% when switched on, 15% as a second step, none when off');
  ok(txt(h10).indexOf('Slightly over your budget Up to 10% above your maximum.') > -1, 'the 10% section is labelled');
  ok((h0.match(/data-cat-tier="around"/g) || []).length === 2 && h0.indexOf('At your maximum') > -1, 'an "around" result is marked "At your maximum"');
  ok(!/data-cat-state="(none_shown|under_review|prices_hidden)"/.test(h15), 'price filters list only projects with prices shown');
}
{
  // a budget never matches through another bedroom type's cheaper band: TMW Maxwell 1-bed 800–899 sq ft is from $2.25m
  const h = U.resultsHtml(M, F({ beds: 1, sizeMin: 800, sizeMax: 899, max: 1.5e6, allowance: 0.15 }), O);
  ok(h.indexOf('data-cat-slug="tmw-maxwell"') < 0, 'a budget is tested on the chosen type’s matched band only');
  const t = txt(/<tr data-cat-slug="tmw-maxwell"[\s\S]*?<\/tr>/.exec(U.resultsHtml(M, F({ beds: 1, sizeMin: 400, sizeMax: 599 }), O))[0]);
  ok(t.indexOf('$1.3m') > -1 && t.indexOf('to $') < 0, 'with a size filter the highest price is withheld unless every band matched', t);
  ok(U.results(M, F({ max: 2e6, allowance: 0.15, min: 1.9e6 })).n === U.results(M, F({ max: 2e6, allowance: 0.15 })).n, 'no minimum-budget filter');
  ok(U.filtersHtml(U.DEFAULT()).indexOf('Minimum budget') < 0 && /name="max"/.test(U.filtersHtml(U.DEFAULT())), 'the form has a maximum budget only');
}
{
  const c = /<li class="gw-cat-card" data-cat-slug="tmw-maxwell"[\s\S]*?<p class="gw-cat-cs">/.exec(U.resultsHtml(M, F({}), O))[0];
  ok(txt(c).indexOf('1-bedroom From $1.3m to $2.35m wide range') > -1, 'a card reads "1-bedroom From $1.3m to $2.35m"', txt(c));
  ok(/Indicative developer listing prices: from-price by bedroom type/.test(U.resultsHtml(M, F({}), O)), 'the table caption names its figures as from-prices');
}
/* the page */
{
  const page = fs.readFileSync(path.join(SITE, 'research/new-launches/index.html'), 'utf8'), live = execSync('git show main:research/new-launches/index.html', { cwd: SITE }).toString();
  const feat = (s) => /<section class="gw-hero[\s\S]*?<\/ul><\/div><\/section>/.exec(s)[0];
  ok(feat(page) === feat(live), 'the four featured entries are byte-identical (text, links, data-kpt-ms, data-host, data-placement, order)');
  ok(page.split('\n').filter((l) => live.split('\n').indexOf(l) < 0).every((l) => /gw-catalogue|GW_CAT_UI|New Launches catalogue V1|querySelectorAll\("a\[data-kpt-ms\]"\)\.forEach\(function \(a\) \{ ms\[|GW_CAT_UI\.mount/.test(l)), 'the page only adds the catalogue stylesheet, script and mount');
  ok(live.split('\n').every((l) => page.split('\n').indexOf(l) > -1), 'nothing on the page is removed (page_view and microsite_clicked unchanged)');
  ok(U.QUIET.indexOf('Developer listings aren’t available right now.') > -1 && U.QUIET.indexOf('$') < 0, 'missing data: one quiet line, no figures');
  ok(txt(U.html({ updated: inv.checkedAt }, U.DEFAULT())).indexOf('Developer listings · Updated 27 Oct 2026') > -1 && U.html({ updated: inv.checkedAt }).indexOf(U.FOOT) > -1 && U.FOOT === 'Prices and availability may have changed. Indicative developer listings, not live availability.', 'heading "Developer listings · Updated 27 Oct 2026" and the one footer line');
}
/* untouched */
{
  const changed = execSync('git diff --name-only main', { cwd: SITE }).toString().trim().split('\n').filter(Boolean).concat(execSync('git ls-files --others --exclude-standard', { cwd: SITE }).toString().trim().split('\n').filter(Boolean));
  // FIND, Budget Search, the Map, calculators, inventory.json and the shared CSS / navigation are never changed by the catalogue (or the release it ships in)
  const off = changed.filter((f) => /^(assets\/js\/(kpt-find|kpt-discover[^/]*|kpt-map[^/]*|gw-calc[^/]*|gw-nav|kpt-analytics)\.js|assets\/css\/(gw|gw-standard|kpt-map)\.css|research\/map\/|tools\/|data\/projects\/(inventory|find|find-beds)\.json)/.test(f));
  ok(!off.length, 'FIND, Budget Search, the Map, calculators, inventory.json, shared CSS, navigation and analytics untouched', off);
  const kf = fs.readFileSync(path.join(SITE, 'assets/js/kpt-find.js'), 'utf8');
  ok(/invMaxDays:\s*21/.test(kf) && /invCadenceDays:\s*14/.test(kf), 'FIND keeps its 21-day window and 14-day cadence');
}
{
  // a year of model rebuilds stays fast enough for the page (90 projects)
  const t0 = Date.now(); for (let i = 0; i < 50; i++) U.results(model('2026-10-29T08:00:00Z'), F({ max: 2e6, allowance: 0.15 })); const ms = (Date.now() - t0) / 50;
  ok(ms < 20, 'build + filter in ' + ms.toFixed(1) + ' ms');
}
console.log('catalogue UI tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
