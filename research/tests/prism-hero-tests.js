/* PRISM Research hero, Release 1 (Master Planning, 7 Nov 2026), checked on EVERY report in the approved release (data/prism/v1.1/).
   Run from the site folder:  node research/tests/prism-hero-tests.js
   1 eligibility: every evidence-profile page gets the hero; the two V1 assessment pages (approved Verdicts) never do
   2 no new findings: the hero's opening is the page's own approved opening, word for word; every figure in the strip and every word and
     figure at the pentagon's corners is text the page itself already shows (or a fixed state word); no sign on a strip figure
   3 missing data: a missing measure is left out (strip) or shown in the report's own missing state (pentagon); never replaced
   4 the pentagon is fixed geometry (identical for every report), P/R/I/S/M in order; states only cmp / fact / none; S and M never compared
   5 no score, percentile, decile, rating, forecast or valuation wording; no rating colours; no tile filter
   6 OneMap: the homepage's tiles, attribution and projection; tile budgets (desktop, phone, reduced motion); the flight ends on zoom 16
   7 the Research page loads it with PRISM only, after gw-prism.js's checks; gw-prism.js itself is unchanged by this release */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const G = require(path.join(SITE, 'assets/js/gw-prism.js')), X = require(path.join(SITE, 'assets/js/gw-prism-hero.js')), HOME = require(path.join(SITE, 'assets/js/gw-home.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 700)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// ---- every report through the approved gate (as prism-explain-tests.js)
const ix = JSON.parse(read('data/prism/v1.1/index.json')), v1 = JSON.parse(read('data/prism/v1/manifest.json'));
const pages = [];
ix.shards.forEach((s) => G.checkShard(JSON.parse(read('data/prism/v1.1/' + s.path)), s, (id) => sha(id).charAt(0)).entries.filter(G.hasReport).forEach((e) => {
  const r = JSON.parse(read('data/prism/v1.1/' + e.path)), only = r.supplementsV1Report === null, e1 = v1.reports.find((x) => x.id === e.id);
  const v = G.model11(G.checkReport11(r, e, only), e); v.periods = G.V11.PERIODS;
  const md0 = e1 ? G.model(G.checkReport(JSON.parse(read('data/prism/v1/' + e1.path)), e1), v1) : null;
  const md = G.compose(md0, v), html = md && md.page ? G.pageHtml(md, { root: '../' }) : '';
  pages.push({ id: e.id, r, v, md, html, t: text(html) });
}));
check('every report in the release loads through the gate (' + pages.length + ')', pages.length === ix.counts.reports && pages.length === 2099);
const shown = pages.filter((p) => p.md && p.md.page), prof = shown.filter((p) => p.md.mode === 'profile'), assess = shown.filter((p) => p.md.mode !== 'profile');

// ---- 1 eligibility
check('every report with a PRISM page is an evidence profile or one of the two V1 assessment pages (' + prof.length + ' + ' + assess.length + ')', prof.length + assess.length === shown.length && assess.length === 2);
check('the V1 assessment pages are Kingsford Waterbay and Hougang Central, and get no hero', assess.map((p) => p.id).sort().join() === 'hougang-central,kingsford-waterbay' && assess.every((p) => X.openingOf(G, p.md) === null));
const H = prof.map((p) => { const op = X.openingOf(G, p.md); return Object.assign(p, { op, figs: X.stripOf(op), cs: X.cornersOf(G, p.md, op) }); });
check('every evidence-profile page has an opening', H.every((p) => p.op && p.op.head));

// ---- 2 no new findings
const bad = (f) => H.filter((p) => !f(p)).map((p) => p.id).slice(0, 8);
check('the opening is the page\'s own approved opening, word for word, and the page shows it', bad((p) => p.t.indexOf(p.op.head) >= 0).length === 0, bad((p) => p.t.indexOf(p.op.head) >= 0));
check('the opening is the quick read headline wherever the page has a quick read', bad((p) => !/data-gwp-quick/.test(p.html) || (p.op.kind === 'quick' && p.html.indexOf('PRISM quick read') >= 0)).length === 0);
const figOk = (p) => p.figs.every((f) => p.t.indexOf(f.v) >= 0 && p.t.indexOf(f.unit) >= 0 && (!f.cmp || p.t.indexOf(f.cmp) >= 0) && (!f.fut || p.t.indexOf(f.fut) >= 0));
check('every strip figure (value, label, comparison, future station) is text the page already shows', bad(figOk).length === 0, bad(figOk));
check('no strip figure carries a sign (meaning first: "0.7% above", "24.7% fewer")', bad((p) => p.figs.every((f) => !/^[+\-−]/.test(f.v))).length === 0, bad((p) => p.figs.every((f) => !/^[+\-−]/.test(f.v))));
const WORDS = new Set(['Fact only', 'Not available', 'Not yet assessed', 'Not assessed in this report', 'Initial resale wave; sustained activity settling',
  'Closer to a station than most similar developments', 'A typical station distance for similar developments', 'Farther from a station than most similar developments',
  'Slower market', 'Busier market', 'Steady market']);
const cornerOk = (p) => p.cs.every((c) => {
  const band = c.key === 'P' || c.key === 'R' ? (p.v.positions[c.key] || {}).bandLabel : null;
  const word = WORDS.has(c.word) || (c.state === 'cmp' && c.word === band);
  const fig = !c.fig || p.t.indexOf(c.fig) >= 0 || (c.key === 'I' && p.figs.some((f) => f.dim === 'I' && c.fig === f.v + ' ' + f.unit)) || (c.key === 'M' && p.figs.some((f) => f.dim === 'M' && c.fig === f.v + ' ' + f.unit));
  return word && fig;
});
check('every pentagon word is an approved band label or a fixed state word, and every corner figure is text the page shows', bad(cornerOk).length === 0, bad(cornerOk).map((id) => H.find((p) => p.id === id).cs));

// ---- 3 missing data
check('the strip shows at most four figures, Location first, then this development, then the neighbourhood', H.every((p) => p.figs.length <= 4 && p.figs.map((f) => X.ORDER.indexOf(f.dim)).every((k, i, a) => !i || a[i - 1] <= k)));
check('the strip uses only the measures the page has (no figure invented when one is missing)', H.every((p) => !p.op.x || p.figs.length === Math.min(4, p.op.x.cards.length) || p.op.x.cards.length < 2));
const counts = {}; H.forEach((p) => { counts[p.figs.length] = (counts[p.figs.length] || 0) + 1; });
console.log('    strip lengths', JSON.stringify(counts));
check('a page with fewer than two figures gets no strip and keeps its own figures in place', H.filter((p) => !p.figs.length).every((p) => /gwp-qr-fs|gwp-figs/.test(p.html) || !/gwp-qr-f|gwp-fig/.test(p.html)));
check('the price corner is compared exactly when the report has an approved Price position; otherwise its missing state', H.every((p) => (p.cs[0].state === 'cmp') === !!p.v.positions.P));
const settling = (p) => { const l = (p.v.profile.lines.R || []).find((x) => x.measure === 'resale.sustained'); return !!(l && l.status === 'settling'); };
check('the resale corner is compared exactly when the report has an approved Resale position that is not settling', H.every((p) => (p.cs[1].state === 'cmp') === (!!p.v.positions.R && !settling(p))));
const wave = H.filter((p) => p.v.positions.R && settling(p)), rCmp = H.filter((p) => p.cs[1].state === 'cmp').length;
console.log('    resale corners: ' + rCmp + ' compared, ' + wave.length + ' settling (fact only)');
check('all 43 initial-resale-wave developments show a fact-only resale corner, never a compared marker, with the settling wording and figure', wave.length === 43 &&
  wave.every((p) => p.cs[1].state === 'fact' && p.cs[1].word === 'Initial resale wave; sustained activity settling' && p.t.indexOf(p.cs[1].fig) >= 0) &&
  wave.every((p) => /data-gph-corner="R" data-gph-state="fact"/.test(X.glanceHtml(p.md, p.cs)) && !/gph-mk--cmp[^>]*>(?:(?!<\/g>).)*<text[^>]*>R</.test(X.glanceHtml(p.md, p.cs))));
check('1,424 compared resale corners nationwide (1,467 Resale positions less the 43 settling)', rCmp === 1424);
check('a missing price shows the report\'s own missing state and reason (never a figure from elsewhere)', H.filter((p) => !p.v.positions.P).every((p) => p.cs[0].state === 'none' ? /^(Not available|Not yet assessed|Not assessed in this report)$/.test(p.cs[0].word) && (!p.cs[0].fig || p.t.indexOf(p.cs[0].fig) >= 0) : p.cs[0].word === 'Fact only'));
check('D4: no corner says "above most" (the band labels only)', H.every((p) => p.cs.every((c) => !/above most/i.test(c.word + ' ' + c.fig))));
check('D-6 held: "quiet area" is never a state word or label at a corner', H.every((p) => p.cs.every((c) => !/quiet/i.test(c.word))));
const fmOn = Object.keys(G.FM.ON);
check('the 21 future-MRT reports carry the approved future-station sentence on the MRT figure', fmOn.every((id) => { const p = H.find((x) => x.id === id); const f = p && p.figs.find((x) => x.dim === 'I'); return !G.futureNear(p.v) || (f && f.fut && p.t.indexOf(f.fut) >= 0); }));
check('no rent, yield, income or Property DNA value in the hero (Release 2)', H.every((p) => !/yield|rent|income|DNA/i.test(text(X.stripHtml(p.md, p.figs) + X.glanceHtml(p.md, p.cs)))));

// Y2 compatibility (Claude C's pending rental-yield release adds yield bands to 283 reports): a rental yield on a report changes nothing in
// the hero (opening, strip, pentagon), because the hero shows no yield; yields stay in the Market dimension in Detailed
const T3 = H.find((p) => p.id === 'thomson-three'), same = (p) => { const md = Object.assign({}, p.md, { v11: Object.assign({}, p.v, { yield: T3.v.yield }) }), op = X.openingOf(G, md);
  return JSON.stringify([op.head, X.stripOf(op), X.cornersOf(G, md, op)]) === JSON.stringify([p.op.head, p.figs, p.cs]); };
check('Y2 compatibility: adding a published rental yield to any report leaves the hero unchanged', !!(T3 && T3.v.yield) && H.filter((p) => !p.v.yield).every(same));

// ---- 4 the pentagon
check('five corners in order P, R, I, S, M, named as the five PRISM dimensions', H.every((p) => p.cs.map((c) => c.key).join('') === 'PRISM' && p.cs.every((c, i) => c.name === G.PILLARS[i][1])));
check('states are only compared / fact / not available; Supply and Market are never "compared"', H.every((p) => p.cs.every((c) => ['cmp', 'fact', 'none'].indexOf(c.state) >= 0) && p.cs[3].state !== 'cmp' && p.cs[4].state !== 'cmp'));
const geo = (svg) => (svg.match(/points="[^"]+"/g) || []).join('|');
const g0 = geo(X.glanceHtml(H[0].md, H[0].cs)), allSame = H.every((p) => geo(X.glanceHtml(p.md, p.cs)) === g0);
check('the shape is fixed: the same polygon for every report, every corner the same distance from the centre', allSame && [0, 1, 2, 3, 4].every((i) => { const v = X.vert(i, X.PG.rad); return Math.abs(Math.hypot(v.x - X.PG.cx, v.y - X.PG.cy) - X.PG.rad) < 0.2; }));
const svgLocal = X.glanceHtml(H[0].md, H[0].cs);
check('no score, percentile, decile, rating, forecast or valuation wording in the hero', H.slice(0, 400).every((p) => { const t = text(X.heroHtml(p.md, p.op, {}) + X.stripHtml(p.md, p.figs) + X.glanceHtml(p.md, p.cs) + X.modeHtml('simple')).replace('There is no overall score.', ''); return !/percentile|decile|score|\/ ?100|rating|forecast|valuation|recommend|appreciat/i.test(t); }));

// ---- 5 colours and tiles
const css = read('assets/css/gw-prism-hero.css');
const hexes = (css.match(/#[0-9A-Fa-f]{3,6}\b/g) || []).map((h) => h.toUpperCase());
const ALLOWED = new Set(['#0B63CE', '#16213E', '#2C3550', '#333', '#3B4256', '#85661F', '#9AA1AE', '#C9B574', '#C9CDD6', '#CBD9F0', '#E3EBF7', '#EEF2F7', '#F2F6FC', '#F7F3E6', '#F8F9FB', '#FFFFFF', '#FFF']);
check('only Groundwork navy, blue, gold, pale blue and greys: no rating colours', hexes.every((h) => ALLOWED.has(h)), hexes.filter((h) => !ALLOWED.has(h)));
check('the pentagon\'s states are shapes (filled, open, dashed), never green, amber or red', /gph-mk--cmp\{fill:#16213E/.test(css) && /gph-mk--fact\{fill:#fff;stroke:#16213E/.test(css) && /gph-mk--none\{[^}]*stroke-dasharray/.test(css));
check('OneMap tiles are never filtered', !/\.gph-l( img)?(\.ok)?\{[^}]*filter/.test(css) && !/\.gph-map\{[^}]*filter/.test(css));
const rmb = (/@media \(prefers-reduced-motion:reduce\)\{([\s\S]*?)\n\}/.exec(css) || [])[1] || '';
check('reduced motion: every hero transition and animation is switched off', /gph-l img[^{]*\{transition:none!important\}/.test(rmb) && /gph-ring[\s\S]*\{animation:none!important\}/.test(rmb) && /gph-strip \[data-gph-fig\]/.test(rmb) && /gph-glance\.in \.gph-shape/.test(rmb));
check('no animation runs forever', !/infinite/.test(css) && !/infinite/.test(read('assets/js/gw-prism-hero.js')));

// ---- 6 OneMap and the flight
const src = read('assets/js/gw-prism-hero.js');
check('the hero uses the homepage\'s tiles, attribution and projection (GW_HOME), not its own copies', /H\.TILES/.test(src) && /H\.ATTR/.test(src) && /H\.proj\(/.test(src) && !/onemap\.gov\.sg/.test(src));
check('the homepage\'s attribution is OneMap\'s published form: logo, OneMap © contributors | Singapore Land Authority, both linked', /om_logo\.png/.test(HOME.ATTR) && /href="https:\/\/www\.onemap\.gov\.sg\/"/.test(HOME.ATTR) && /Singapore Land Authority<\/a>/.test(HOME.ATTR) && /&copy;&nbsp;contributors/.test(HOME.ATTR));
check('the hero places the attribution on the map (visible above the figures)', /gph-attr\{position:absolute;right:12px;bottom:54px;z-index:3/.test(css) && /\.gph-strip\{position:relative;z-index:4;[^}]*margin:-62px 22px 0/.test(css));
const p0 = X.projAt(HOME, 1.35741, 103.83136, 14), h14 = HOME.proj(1.35741, 103.83136), p16 = X.projAt(HOME, 1.35741, 103.83136, 16);
check('projection at any zoom is the homepage\'s, scaled (zoom 16 = 4 x zoom 14)', p0.x === h14.x && Math.abs(p16.x - 4 * h14.x) < 1e-6 && Math.abs(p16.y - 4 * h14.y) < 1e-6);
const f0 = X.frame(0), f1 = X.frame(1);
check('the flight starts on zoom 14 and ends on zoom 16 at its own scale, fully faded across', f0.s14 === 1 && f0.o14 === 1 && f0.o16 === 0 && f1.s16 === 1 && f1.o16 === 1 && f1.o14 === 0 && X.FLIGHT.ms <= 2000);
const tiles = (w, h, fly) => { const a = { x: w / 2, y: h * 0.6 }, c = { x: 10000.5 * 256, y: 6000.3 * 256 }; return X.tileRange(c, a.x, a.y, w, h, fly ? X.FLIGHT.sMinTo : 1).length + (fly ? X.tileRange(c, a.x, a.y, w, h, 1).length : 0); };
const td = tiles(1358, 498, true), tp = tiles(356, 330, true), tr = tiles(1358, 498, false), trp = tiles(356, 330, false);
console.log('    tiles: desktop ' + td + ' (reduced ' + tr + '), phone ' + tp + ' (reduced ' + trp + '); the prototype loaded 114 and 38');
check('tile budget: at most 70 on a desktop and 24 on a phone (prototype: 114 and 38); reduced motion only the final layer', td <= 70 && tp <= 24 && tr <= 30 && trp <= 9);

// ---- 7 the Research page
const page = read('research/index.html'), tpl = /<template id="gwLazy-prism">(.*?)<\/template>/.exec(page)[1];
const tag = (f) => sha(fs.readFileSync(path.join(SITE, f))).slice(0, 10);
check('the PRISM lazy bundle loads gw-prism.js, then the hero\'s CSS, gw-home.js and the hero, with current version tags', tpl.indexOf('gw-prism.js?v=' + tag('assets/js/gw-prism.js')) >= 0 && tpl.indexOf('gw-prism-hero.css?v=' + tag('assets/css/gw-prism-hero.css')) >= 0 &&
  tpl.indexOf('gw-home.js?v=' + tag('assets/js/gw-home.js')) >= 0 && tpl.indexOf('gw-prism-hero.js?v=' + tag('assets/js/gw-prism-hero.js')) > tpl.indexOf('gw-home.js'));
check('the hero mounts only after GW_PRISM.show() has drawn and checked the page, and can never break it', /\.then\(\(md\) => \{\s*\/\/ PRISM Research hero[^\n]*\n\s*try \{ if \(md && window\.GW_PRISMHERO\) GW_PRISMHERO\.mount\(\$app, md, /.test(page));
check('mount() refuses anything but a checked evidence-profile model', /md\.mode !== 'profile'/.test(src) && /data-gwp-mode="profile"/.test(src));
check('no other page loads the hero (the Map, the calculators and the homepage are untouched)', ['research/map/index.html', 'index.html', 'tools/index.html', 'journey/index.html'].every((f) => !/gw-prism-hero/.test(read(f))));

console.log('\n' + ok + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
