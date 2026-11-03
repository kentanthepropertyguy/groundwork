/* The compact quick read on the two V1 assessment pages (Master Planning, 4 Nov 2026), in node.
   Run from the site folder:  node research/tests/prism-v1-quick-tests.js
   1 Kingsford Waterbay: the approved headline and three figures (V3 rules on its V1.1 evidence); no V1.1 Reveal added
   2 Hougang Central: "Close to MRT. New launch: no price evidence yet."; 10 m from Hougang MRT; 1,149 comparable condo resales within
     2 km over 24 months; 3.7 resales per 100 homes annually against 3.3 for Singapore, labelled historical planning-area activity, not
     demand; every figure the approved V1 value
   3 both: compact only (no promising / watch / before-you-buy), a button to the Verdict; with the quick read taken out, the page is byte for
     byte the live V3 page (the approved Verdict, Reveal, next buyer question, five dimensions, sources and methodology unchanged)
   4 nothing else: no profile page gets the compact quick read; without a verified V1.1 release the V1 page has none (fail closed) */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const G = require(path.join(SITE, 'assets/js/gw-prism.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 500)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const ix = JSON.parse(read('data/prism/v1.1/index.json')), v1 = JSON.parse(read('data/prism/v1/manifest.json'));
const entry = (id) => JSON.parse(read('data/prism/v1.1/index/' + sha(id).charAt(0) + '.json')).entries.find((x) => x.id === id);
const page = (id, withV11) => {
  const e = entry(id), r = JSON.parse(read('data/prism/v1.1/' + e.path)), v = G.model11(G.checkReport11(r, e, r.supplementsV1Report === null), e); v.periods = G.V11.PERIODS; v.curated = G.isCurated(e);
  const e1 = v1.reports.find((x) => x.id === id), md = e1 ? G.model(G.checkReport(JSON.parse(read('data/prism/v1/' + e1.path)), e1), v1) : null;
  const pg = G.compose(md, withV11 === false ? null : v); return { pg, html: G.pageHtml(pg, { root: '../' }), md };
};
const LIVE = JSON.parse(read('research/tests/fixtures/prism-v1-pages-v3-live.json')).pages;
const SEC = /<section class="gwp-qr gwp-qr--compact"[\s\S]*?<\/section>/;
const parse = (h) => { const s = SEC.exec(h); if (!s) return null; const t = s[0];
  return { sec: t, head: text((/<h2 class="gwp-qr-h">([\s\S]*?)<\/h2>/.exec(t) || [])[1] || ''), figs: [...t.matchAll(/<span class="gwp-qr-s">([^<]*)<\/span><b>([^<]*)<\/b><span class="gwp-qr-l">([^<]*)<\/span>/g)].map((m) => [text(m[1]), text(m[2]), text(m[3])]) }; };

// 1 Kingsford Waterbay
const kw = page('kingsford-waterbay'), K = parse(kw.html);
check('Kingsford Waterbay: "Farther from MRT. Lower pricing. Steady market."', K && K.head === 'Farther from MRT. Lower pricing. Steady market.', K && K.head);
check('Kingsford Waterbay: 9.9% below comparable condo prices · 1.1 km from Hougang MRT · 7.5% fewer nearby resales', K && JSON.stringify(K.figs) === JSON.stringify([['This development', '9.9% below', 'comparable condo prices'], ['Location', '1.1 km', 'from Hougang MRT'], ['Neighbourhood · 2 km', '7.5% fewer', 'nearby resales']]), K && K.figs);
check('Kingsford Waterbay: no V1.1 Reveal added (its approved V1 Reveal is the only Reveal)', kw.html.indexOf('Resale activity is above most peers') < 0 && (kw.html.match(/PRISM Reveal/g) || []).length === 1);
// 2 Hougang Central
const hc = page('hougang-central'), H = parse(hc.html), m = hc.md.metrics;
check('Hougang Central: "Close to MRT. New launch: no price evidence yet."', H && H.head === 'Close to MRT. New launch: no price evidence yet.', H && H.head);
check('Hougang Central: 10 m from Hougang MRT; 1,149 comparable condo resales within 2 km over 24 months; 3.7 against 3.3 for Singapore, historical planning-area activity, not demand', H && JSON.stringify(H.figs) === JSON.stringify([
  ['Location', '10 m', 'from Hougang MRT'], ['Neighbourhood · 2 km', '1,149', 'comparable condo resales within 2 km over 24 months'],
  ['Hougang planning area · historical', '3.7', 'resales per 100 homes annually, against 3.3 for Singapore; past activity, not demand for this launch']]), H && H.figs);
check('Hougang Central: every figure is the approved V1 value (I.railStations, R.resaleAlternatives24_2km, R.paEstablishedTurnover12 and its Singapore figure); no income figure',
  m['I.railStations'].detail.stations[0].metres === 10 && m['R.resaleAlternatives24_2km'].value === 1149 && m['R.paEstablishedTurnover12'].value === 3.7 && m['R.paEstablishedTurnover12'].detail.singapore === 3.3 &&
  ['I.railStations', 'R.resaleAlternatives24_2km', 'R.paEstablishedTurnover12'].every((k) => m[k].approval.state === 'approved') && H && !/income|\$10,000|households/i.test(H.sec));
// 3 both pages
[['kingsford-waterbay', kw, K], ['hougang-central', hc, H]].forEach(([id, p, Q]) => {
  check(id + ': compact only (no What looks promising / What to watch / Before you buy); a button to the Verdict; above the Verdict card', !!Q && !/What looks promising|What to watch|Before you buy|gwp-qr-t|gwp-qr-q/.test(Q.sec) &&
    /<button type="button" class="gwp-qr-x" data-gwp-verdict>See the PRISM Verdict and evidence/.test(Q.sec) && p.html.indexOf(Q.sec) < p.html.indexOf('<article class="gwp-card gwp-open">'));
  check(id + ': with the quick read taken out, the page is byte for byte the live V3 page (Verdict, Reveal, next buyer question, five dimensions, sources, methodology)', sha(p.html.replace(Q ? Q.sec : '', '')) === LIVE[id]);
  check(id + ': no internal or unsupported wording in the quick read', !!Q && !/approved|withheld|not published|score|forecast(?!.)|recommend|good value|Ken's Take/i.test(text(Q.sec)));
  check(id + ': without a verified V1.1 release, no quick read (the V1 page exactly V1)', !SEC.test(page(id, false).html));
});
// 4 nothing else
let others = 0, bad = [];
ix.shards.forEach((s) => JSON.parse(read('data/prism/v1.1/' + s.path)).entries.filter(G.hasReport).forEach((e) => { if (e.id === 'kingsford-waterbay' || e.id === 'hougang-central') return; others++; const h = page(e.id).html; if (SEC.test(h) || /data-gwp-verdict/.test(h)) bad.push(e.id); }));
check('no other page gets the compact quick read (' + others + ' profile pages)', others === 2097 && bad.length === 0, bad.slice(0, 5));
console.log('prism-v1-quick-tests: %d passed, %d failed', ok, fail);
process.exit(fail ? 1 : 0);
