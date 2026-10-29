'use strict';
/* Research prices UX (Ken, 29 Oct 2026), on the published data:
   1. "Recent resale prices by home type" (GW_REC.typesHtml with GW_BED.tierCells): every typical-price type and every matched-only type with an
      approved r2 tier, in bedroom order; each cell says what its price is; never a whole-type price for a matched-only type; the r2 copy rules.
   2. Price movement is secondary: the panel only for a reliable ('strong') reading; otherwise its head and reason in a closed disclosure.
   The real pages: research/tests/prices-ux-render.py. Run from the site folder: node research/tests/prices-ux-tests.js */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const B = require(path.join(ROOT, 'assets/js/gw-bedroom.js')), REC = require(path.join(ROOT, 'assets/js/gw-records.js')), P = require(path.join(ROOT, 'assets/js/kpt-project.js'));
const PU = require(path.join(ROOT, 'assets/js/gw-pulse.js'));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info).slice(0, 700)); } };
const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([.,:;)])/g, '$1').replace(/\( /g, '(').trim();
const dir = path.join(ROOT, 'data/projects/bedroom'), meta = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), man = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/manifest.json'), 'utf8'));
const shards = {}; fs.readdirSync(dir).filter((f) => /^s.*\.json$/.test(f)).forEach((f) => { shards[f] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); });
const shardOf = (id) => shards[P.shardName(P.shardOf(id, meta.shards)) + '.json'];
const recOf = (id) => B.pick(shardOf(id), meta, id, man);
const ids = [].concat(...Object.values(shards).map((s) => Object.keys(s.projects)));
const types = (id) => REC.typesHtml(B.view(recOf(id), 'resale', null), { label: B.label, cells: B.tierCells });
const rowsOf = (h) => (h.match(/<button type="button" class="gwr-row gwr-row2"[\s\S]*?<\/button>/g) || []);

/* ---------- 1. the home types section ---------- */
{
  const h = types('bartley-ridge'), rows = rowsOf(h).map(txt);
  ok(/<h2 id="lgTypesH">Recent resale prices by home type<\/h2>/.test(h) && h.indexOf('What each home type sells for') < 0, 'renamed "Recent resale prices by home type"');
  ok(JSON.stringify(rows) === JSON.stringify([
    '1-bedroom Typical price $884k 10 resales · last 12 months Middle half $852k – $891k 441–559 sq ft · $1,799 psf',
    '2-bedroom Matched sales only Median of 8 past matched resales $1.48m ≈ 721–764 sq ft · Oct 2025 to Sep 2026 Median of 10 past matched resales $1.63m ≈ 829–850 sq ft · Oct 2024 to Sep 2026',
    '3-bedroom Matched sales only Median of 6 past matched resales $2.17m ≈ 1,033–1,044 sq ft · Oct 2025 to Sep 2026 Historical matched transactions at other sizes $2.33m to $2.49m 4 resales · ≈ 1,173 sq ft · Oct 2024 to Sep 2026']), 'Bartley Ridge: 1-bedroom typical, 2-bedroom two size medians, 3-bedroom a median and its other-size history', rows);
  ok((h.match(/data-gwr-tier="(\w+)"/g) || []).join() === 'data-gwr-tier="typical",data-gwr-tier="median",data-gwr-tier="median"', 'each row says its tier');
  ok((h.match(/data-gwr-qual/g) || []).length === 1 && txt(/<p class="lg-fine" data-gwr-qual>[\s\S]*?<\/p>/.exec(h)[0]) === 'Past resales, not valuations. Bedroom types are matched from floor plans or URA rental records; a median or historical price covers only the sizes shown.', 'one short qualification beneath the rows');
  ok(h.indexOf('last 12 months: the typical') < 0 && h.indexOf('Resales here in the last 12 months') < 0, 'no universal "last 12 months" (a matched median may cover 2 years)');
  ok(h.indexOf('data-gwr-also') < 0, 'matched types with a tier are rows, not an "Also matched" line');
  const K = rowsOf(types('kovan-melody')).map(txt);
  ok(K.length === 3 && /^4-bedroom Matched sales only Historical matched transactions \$2\.59m to \$2\.85m 3 resales · ≈ 1,410 sq ft · Jan 2025 to Jul 2026$/.test(K[2]), 'Kovan Melody (no typical-price type): its three matched types, the 4-bedroom as historical matched transactions', K);
  const H = rowsOf(types('hundred-palms-residences')).map(txt);
  ok(H.length === 3 && /^5-bedroom Matched sales only Historical matched transactions \$2\.72m to \$3\.06m/.test(H[2]) && /last 12 months/.test(H[0]), 'Hundred Palms Residences: two typical types, then the 5-bedroom history', H);
  // v1.2-shaped data (no tiers): matched types stay a count-only line, never a price
  const sh = JSON.parse(JSON.stringify(shardOf('bartley-ridge'))); sh.projects['bartley-ridge'].resale.matched.forEach((m) => { delete m.groups; delete m.other; delete m.range; });
  const v = REC.typesHtml(B.view(B.pick(sh, meta, 'bartley-ridge', man), 'resale', null), { label: B.label, cells: B.tierCells });
  ok(rowsOf(v).length === 1 && /data-gwr-also>Also matched \(matched sales only\): .*2-bedroom 23.*3-bedroom 14/.test(v) && !/\$1\.48m|\$2\.17m/.test(v), 'v1.2 data: only the typical row; matched types as counts', txt(v));
}
{
  // nationwide: every development, every row
  let devs = 0, nA = 0, nB = 0, nC = 0; const bad = [];
  ids.forEach((id) => {
    const r = recOf(id); if (!r) return; const V = B.view(r, 'resale', null), h = types(id); if (!h) { if ((V.types || []).length || (V.only || []).some((m) => B.tierOf(m))) bad.push([id, 'no section']); return; }
    devs++;
    const rows = rowsOf(h), want = (V.types || []).length + (V.only || []).filter((m) => B.tierOf(m)).length;
    if (rows.length !== want) bad.push([id, 'rows', rows.length, want]);
    rows.forEach((x) => {
      const t = txt(x), g = /data-gwr-bed="([^"]+)"/.exec(x)[1], tier = /data-gwr-tier="(\w+)"/.exec(x)[1];
      if (tier === 'typical') { nA++; const ty = V.types.find((y) => y.g === g); if (!ty || t.indexOf(ty.win === 12 ? 'last 12 months' : 'last 2 years') < 0 || t.indexOf('Typical price ' + REC.short(ty.price[2])) < 0) bad.push([id, g, 'typical']); return; }
      const m = V.only.find((y) => y.g === g); tier === 'median' ? nB++ : nC++;
      if (B.tierOf(m) !== (tier === 'median' ? 'B' : 'C')) bad.push([id, g, 'tier']);
      if (/typical|valuation|budget/i.test(t.replace(/^\S+ Matched sales only /, ''))) bad.push([id, g, 'blocked word', t]);
      (x.match(/<span class="gwr-c gwr-c-r" data-gwr-range>[\s\S]*?<\/span><\/span>|<span class="gwr-c gwr-c-r" data-gwr-range>[\s\S]*?<small class="gwr-cd">[\s\S]*?<\/small><\/span>/g) || []).forEach((c) => { if (txt(c).indexOf('Historical matched transactions') !== 0) bad.push([id, g, 'unlabelled range']); });
      try { B.assertPricedMatchedCopy(t.replace(/^\S+ Matched sales only /, '').replace(/ (\$[\d.]+[mk]? to \$[\d.]+[mk]?)/g, ': $1'), Object.assign({}, m, { of: V.of, unknown: V.unknown }), { part: 'line' }); } catch (e) { bad.push([id, g, e.message.slice(0, 160)]); }
      if (B.tierOf(m) === 'B') m.groups.slice(0, 2).forEach((q) => { if (t.indexOf(B.short(q.med)) < 0) bad.push([id, g, 'median missing']); });
    });
  });
  ok(!bad.length, 'every development: the rows are its typical types and its tiered matched types, each correctly labelled, passing the r2 copy check (' + devs + ' developments)', bad.slice(0, 4));
  ok(nA === 853 && nB === 168 && nC === 382, 'nationwide: 853 typical, 168 median and 382 historical rows (the approved r2 counts)', { nA, nB, nC });
}
/* ---------- 2. price movement is secondary ---------- */
{
  let strong = 0, folded = 0; const bad = [];
  ids.forEach((id) => {
    const r = recOf(id); if (!r) return;
    (B.view(r, 'resale', null).types || []).forEach((t) => {
      const V = B.view(r, 'resale', t.g), panel = B.trendHtml(V, {}), mv = B.moveHtml(V, { tx: true, mapHref: 'map/#p=' + id }), rel = !!(t.trend && t.trend.evidence === 'strong' && t.trend.why !== 'coverage');
      if (rel) { strong++; if (!panel || mv) bad.push([id, t.g, 'strong: panel only']); }
      else { folded++; const R = PU.bedroomText(t); if (panel || !mv || txt(mv).indexOf(R.head + '.') < 0 || (R.sub && txt(mv).indexOf(txt(R.sub)) < 0) || !/^<details class="gwb-det" data-gwb-hist/.test(mv) || / open/.test(mv.slice(0, 80))) bad.push([id, t.g, 'not reliable: closed disclosure with the same wording']); }
      const a = B.answerHtml(V, { move: mv });
      if ((a.indexOf('gwb-side') > -1) !== !rel || a.indexOf(B.short(t.price[2])) < 0) bad.push([id, t.g, 'answer']);
    });
  });
  ok(!bad.length, 'every typical-price type: the movement panel only for a reliable reading; otherwise the same head and reason in a closed "Sales history & price movement"', bad.slice(0, 3));
  ok(strong > 0 && folded > 0, 'both cases exist (' + strong + ' panels, ' + folded + ' folded)');
  const V = B.view(recOf('bartley-ridge'), 'resale', '1'), mv = B.moveHtml(V, { tx: true, mapHref: 'map/#p=bartley-ridge' });
  ok(txt(mv) === 'Sales history &amp; price movement Price movement · 400–499 sq ft Not enough matched sales to measure a trend. Too few of this development’s resales in one of the last two years could be matched to a bedroom count to compare the years fairly. See how prices moved by size › See the individual sales › See the sales on the Map ›', 'Bartley Ridge 1-bedroom: the reason, folded, with the ways on', txt(mv));
  ok(B.answerHtml(V, { move: mv }).indexOf('<p class="lg-ans-main"><span class="lg-ans-v" title="$883,944">$884k<small> typical price</small></span></p>') > -1, 'Bartley Ridge 1-bedroom: the $884k typical price is unchanged');
  const N = B.view({ ...recOf('bartley-ridge') }, 'new', '1');
  ok(!N.t || B.moveHtml(N, {}) === '', 'new sales: unchanged (no fold)');
}
console.log('prices-ux tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
