/* PRISM V3 quick read (Master Planning, 4 Nov 2026), checked on EVERY report in the live release (data/prism/v1.1/, r3).
   Run from the site folder:  node research/tests/prism-quick-tests.js
   Expectations are recomputed here from each report's approved JSON, with the approved phrases written out literally.
   1 placement: every evidence-profile page with an explanation opens with the quick read; the V2 explanation follows, unchanged, behind
     "Explore full PRISM analysis"; the five dimensions follow; the V1 assessment pages are untouched
   2 headline: up to three fixed phrases chosen by the approved bands (location, price or resale, nearby market); "Close to MRT" only within
     500 m outside the "farther than most" band; a lower price is never called good value
   3 figures: at most three, Price / MRT / nearby market first, the resale rate only in place of a missing one; never invented; each equal to
     the approved value; development and neighbourhood labelled apart
   4 sections: promising and watch are approved sentences (at most two each), the question and its note; an approved Reveal stays visible
     with its qualifications
   5 wording: no score, forecast, valuation, recommendation, demand or price-movement wording */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const G = require(path.join(SITE, 'assets/js/gw-prism.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 600)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const fmt = (v, dp) => v.toLocaleString('en-SG', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp == null ? 1 : dp });
const metres = (m) => (m >= 1000 ? fmt(m / 1000, 1).replace(/\.0$/, '') + ' km' : fmt(m, 0) + ' m');

const ix = JSON.parse(read('data/prism/v1.1/index.json')), v1 = JSON.parse(read('data/prism/v1/manifest.json')), pages = [];
ix.shards.forEach((s) => G.checkShard(JSON.parse(read('data/prism/v1.1/' + s.path)), s, (id) => sha(id).charAt(0)).entries.filter(G.hasReport).forEach((e) => {
  const r = JSON.parse(read('data/prism/v1.1/' + e.path)), only = r.supplementsV1Report === null, e1 = v1.reports.find((x) => x.id === e.id);
  const v = G.model11(G.checkReport11(r, e, only), e); v.periods = G.V11.PERIODS; v.curated = G.isCurated(e);
  const md = e1 ? G.model(G.checkReport(JSON.parse(read('data/prism/v1/' + e1.path)), e1), v1) : null;
  const pg = G.compose(md, v); pages.push({ id: e.id, r, v, pg, html: pg ? G.pageHtml(pg, { root: '../' }) : '' });
}));
check('every report in the release loads and renders (' + pages.length + ')', pages.length === 2099 && pages.every((p) => G.hasPage(p.pg)));

const PH = { loc: ['Close to MRT', 'Good MRT access', 'Farther from MRT'], price: { around: 'Priced near comparable {cls}s', below: 'Lower pricing', above: 'Higher pricing' },
  resale: ['Resales still settling', 'Active resales', 'Fewer resales', 'Steady resales'], market: { down: 'Slower market', up: 'Busier market', flat: 'Steady market' } };
const BANNED = /undervalu|overvalu|bargain|cheap|good value|great value|better value|worth (buying|it)|recommend|should (buy|sell)|score|\/100|rating|forecast|predict(?!ion\.)|will (rise|fall|increase|decrease|grow|drop)|demand|Ken's Take|investment|strong buy|prices? (have |has |are |is )?(fall|rise|drop|soft|firm|strengthen|weaken|increas|decreas)|school/i;
const ALLOWED = ['not prices or demand', 'not necessarily weaker demand', 'it does not track prices', 'not a valuation or a price change', 'not a sign of value', 'not a prediction', 'not a valuation, not a recommendation and not a forecast'];
const QR = /<section class="gwp-qr"[\s\S]*?<\/section>/, FULL = /<div class="gwp-full" id="gwp-full" hidden>([\s\S]*?<\/section>)<\/div>/;

const prof = pages.filter((p) => p.pg.mode === 'profile'), asmt = pages.filter((p) => p.pg.mode === 'assessment');
check('the two V1 assessment pages are untouched (no quick read, no V2 card)', asmt.length === 2 && asmt.every((p) => !/gwp-qr|gwp-xp/.test(p.html)));
const withQ = prof.filter((p) => QR.test(p.html));
check('every profile page with an explanation opens with the quick read (' + withQ.length + '); the 2 others keep their approved opening alone', withQ.length === 2095 && prof.filter((p) => !QR.test(p.html)).every((p) => /class="gwp-rv11"/.test(p.html)));
check('the quick read comes first, then the V2 explanation (hidden, unchanged: exactly explainHtml), then the five dimensions', withQ.every((p) => {
  const h = p.html, a = h.indexOf('<section class="gwp-qr"'), f = FULL.exec(h), op = G.reveal11(p.v), x = G.explain11(p.v, p.r.name, op);
  return a >= 0 && f && a < h.indexOf('id="gwp-full"') && h.indexOf('id="gwp-full"') < h.indexOf('gwp-dims') && f[1] === G.explainHtml(x, op, p.id) && /data-gwp-full aria-expanded="false" aria-controls="gwp-full"/.test(h);
}));

const B = {}; const bad = (k, x) => (B[k] = B[k] || []).push(x);
const n = { near: 0, below: 0, reveals: 0, figs: {} };
withQ.forEach((p) => {
  const r = p.r, sec = QR.exec(p.html)[0], t = text(sec), op = G.reveal11(p.v), q = G.quick11(p.v, p.r.name, op);
  const pos = (d) => ((r.peerComparison && r.peerComparison.positions) || []).find((x) => x.dimension === d);
  const line = (m) => ((r.profile && r.profile.lines) || []).find((l) => l.measure === m), av = (l) => l && l.status === 'available';
  const P = pos('P'), R = pos('R'), mrt = line('infrastructure.mrt'), mk = line('market.backdrop'), rs = line('resale.sustained');
  const st = av(mrt) && mrt.data && mrt.data.stations && mrt.data.stations[0], rank = av(mrt) && mrt.data && mrt.data.rank;
  const chg = av(mk) && mk.data && typeof mk.data.changePct === 'number' ? mk.data.changePct : null, mkey = chg === null ? '' : chg <= -10 ? 'down' : chg >= 10 ? 'up' : 'flat';
  const settling = !!(rs && rs.status === 'settling'), steady = !!(R && (R.context || []).some((c) => c.id === 'activeMonthShare24' && c.value === 100)), big = !!(R && R.sample && R.sample.homes >= 50);
  // 2 headline
  const near = !!(st && st.distanceM <= 500 && !(rank && rank.band === 'below'));
  const loc = near ? 'Close to MRT' : rank && rank.band === 'below' ? 'Farther from MRT' : rank && rank.band === 'above' ? 'Good MRT access' : '';
  const cls = { condo: 'condo', ec: 'EC' }[((r.profile && r.profile.comparisonGroup) || (r.peerComparison && r.peerComparison.peerGroup) || {}).propertyClass] || 'development';
  const pr = P ? (PH.price[P.band] || '').replace('{cls}', cls) : '', rsl = pr || !R ? '' : settling ? 'Resales still settling' : R.band === 'above' && big ? 'Active resales' : R.band === 'below' ? 'Fewer resales' : R.band === 'around' && steady ? 'Steady resales' : '';
  const want = [loc, pr || rsl, mkey ? PH.market[mkey] : ''].filter(Boolean).map((s) => s + '.').join(' ');
  if (q.head !== (want || G.explain11(p.v, p.r.name, op).head) || t.indexOf(q.head) < 0) bad('head', [p.id, q.head, want]);
  if (near) n.near++; if (P && P.band === 'below') n.below++;
  // 3 figures: Price, MRT, nearby market, then the resale rate in place of a missing one; never invented; approved values
  const avail = []; const pc = P && P.components && P.components[0], rc = R && R.components && R.components[0], ql = line('supply.quietArea');
  if (pc && typeof pc.value === 'number') avail.push(['P', pc.value < 0 ? fmt(-pc.value) + '% below' : pc.value > 0 ? fmt(pc.value) + '% above' : 'In line']);
  if (st && typeof st.distanceM === 'number') avail.push(['I', metres(st.distanceM)]);
  if (chg !== null && mk.period && mk.period.latest) avail.push(['M', chg < 0 ? fmt(-chg) + '% fewer' : chg > 0 ? fmt(chg) + '% more' : 'No change in']);
  else if (av(ql) && ql.data && ql.data.flag === true && typeof ql.data.resales2km === 'number') avail.push(['S', fmt(ql.data.resales2km, 0)]);
  if (rc && typeof rc.value === 'number' && G.explain11(p.v, p.r.name, op).cards.some((c) => c.dim === 'R')) avail.push(['R', fmt(rc.value, 1)]);
  const wantF = avail.slice(0, 3), got = [...sec.matchAll(/<a class="gwp-qr-f" href="#\/prism\/[^/"]+\/(\w)" data-gwp-xjump="(\w)"><span class="gwp-qr-s">([^<]*)<\/span><b>([^<]*)<\/b><span class="gwp-qr-l">([^<]*)<\/span><\/a>/g)];
  if (got.map((m) => m[2] + '=' + text(m[4])).join() !== wantF.map((f) => f[0] + '=' + f[1]).join()) bad('figs', [p.id, got.map((m) => m[2] + '=' + text(m[4])), wantF]);
  got.forEach((m) => { const sc = { P: 'This development', R: 'This development', I: 'Location', M: 'Neighbourhood · 2 km', S: 'Neighbourhood · 2 km' }[m[2]]; if (text(m[3]) !== sc || /[−+]/.test(m[4])) bad('scope', [p.id, m[2], text(m[3]), m[4]]); });
  const k = got.map((m) => m[2]).join(''); n.figs[k] = (n.figs[k] || 0) + 1;
  // 4 sections: approved sentences only (the V2 lists), at most two each; the question; a Reveal kept with its qualifications
  const x = G.explain11(p.v, p.r.name, op && op.kind === 'reveal' ? op : null);
  if (q.good.length > 2 || q.watch.length > 2 || !q.good.every((s) => x.goodAll.indexOf(s) >= 0) || !q.watch.every((s) => x.watchAll.indexOf(s) >= 0)) bad('sections', [p.id, q.good, q.watch]);
  if (t.indexOf(q.ask) < 0 || t.indexOf('Before you buy') < 0 || t.indexOf('Explore full PRISM analysis') < 0) bad('ask', p.id);
  if (op && op.kind === 'reveal') { n.reveals++; if (t.indexOf('PRISM Reveal · ' + op.head) < 0 || !op.notes.every((nn) => t.indexOf(nn) >= 0)) bad('reveal', [p.id, op.id]); }
  // 5 wording
  let own = op && op.kind === 'reveal' ? [op.head, ...op.notes].reduce((s, nn) => s.split(nn).join(' '), t) : t; ALLOWED.forEach((a) => { own = own.split(a).join(' '); });
  if (BANNED.test(own)) bad('banned', [p.id, own.match(BANNED)[0]]);
  if (/good value|bargain|undervalu/i.test(t) && P && P.band === 'below') bad('value', p.id);
});
const r = (k) => [!B[k], (B[k] || []).slice(0, 4)];
check('headline: up to three approved phrases chosen by the bands (recomputed for every page); "Close to MRT" only within 500 m (' + n.near + ' pages)', ...r('head'));
check('figures: Price, MRT, nearby market, the resale rate only in place of a missing one; never invented; approved values (' + JSON.stringify(n.figs) + ')', ...r('figs'));
check('figures: development and neighbourhood labelled apart; no plus or minus signs', ...r('scope'));
check('what looks promising / what to watch: approved sentences only, at most two each', ...r('sections'));
check('before you buy: one question; "Explore full PRISM analysis" on every quick read', ...r('ask'));
check('an approved Reveal stays visible in the quick read with its qualifications (' + n.reveals + ' Reveals, including the three protected profile pages)', ...r('reveal'));
check('no score, forecast, valuation, recommendation, demand, investment or price-movement wording; a lower price (' + n.below + ' pages) is never called good value', !B.banned && !B.value, (B.banned || []).concat(B.value || []).slice(0, 4));
const br = withQ.find((p) => p.id === 'bartley-ridge'), bq = br && G.quick11(br.v, br.r.name, G.reveal11(br.v));
check('Bartley Ridge (the reference): "Close to MRT. Priced near comparable condos. Slower market." with 2% below comparable condo prices, 190 m from Bartley MRT, 16.8% fewer nearby resales',
  !!bq && bq.head === 'Close to MRT. Priced near comparable condos. Slower market.' && bq.figs.map((f) => f.v + ' ' + f.label).join(' | ') === '2% below comparable condo prices | 190 m from Bartley MRT | 16.8% fewer nearby resales', bq && [bq.head, bq.figs]);
for (const id of ['thomson-three', 'hundred-palms-residences', 'the-quinn']) { const p = withQ.find((x) => x.id === id), op = G.reveal11(p.v);
  check(id + ' (protected): its approved Reveal "' + op.head + '" visible in the quick read; its full page otherwise unchanged', text(QR.exec(p.html)[0]).indexOf('PRISM Reveal · ' + op.head) >= 0); }
check('final wording (Master Planning, 4 Nov 2026): "Good location" and "Fair pricing" appear on no page; "Close to MRT" and "Priced near comparable condos/ECs" are used', withQ.every((p) => !/Good location|Fair pricing/.test(QR.exec(p.html)[0])) && withQ.some((p) => /Close to MRT\./.test(QR.exec(p.html)[0])) && withQ.some((p) => /Priced near comparable condos\./.test(QR.exec(p.html)[0])) && withQ.some((p) => /Priced near comparable ECs\./.test(QR.exec(p.html)[0])));
console.log('prism-quick-tests: %d passed, %d failed', ok, fail);
process.exit(fail ? 1 : 0);
