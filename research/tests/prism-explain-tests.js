/* The PRISM buyer explanation V2 (Master Planning, 3 Nov 2026), checked on EVERY report in the approved release (data/prism/v1.1/).
   Run from the site folder:  node research/tests/prism-explain-tests.js
   Expectations are computed here from each report's own approved JSON, with the approved wording written out literally (not taken from
   the renderer's templates), so a change of wording, band rule, threshold or figure is caught.
   1 placement: every evidence-profile page opens with the explanation (or, with nothing to explain, its approved opening alone); the two V1
     assessment pages never get it; the five dimensions follow, with the original signed statements
   2 four cards only (Price, Resale, MRT, nearby Market), in that order; a missing one omitted, never replaced; meaning-first figures equal
     to the approved values ("2% below comparable prices", "16.8% fewer nearby resales"); the approved peer counts; a reading by the
     approved band; development and neighbourhood labelled apart; each card opens its own dimension
   3 headline: fixed clauses chosen by the exported bands; market wording only at -10% / +10%; D4
   4 What stands out / What deserves attention (approved sentences, at most two each) / What to check next (one question, chosen by the
     evidence); MRT within 500 m only as a proximity observation; no competition "advantage" in a quiet area; missing evidence named
   5 an approved opening (Reveal headline and qualifications, D3 summary and its missing-evidence statements) kept word for word and not
     repeated below
   6 no score, forecast, valuation, rating, recommendation, demand or price-movement wording; no school wording; no sign-based colour */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const G = require(path.join(SITE, 'assets/js/gw-prism.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 700)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const fmt = (v, dp) => v.toLocaleString('en-SG', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp == null ? 1 : dp });
const metres = (m) => (m >= 1000 ? fmt(m / 1000, 1).replace(/\.0$/, '') + ' km' : fmt(m, 0) + ' m');

// ---- every report through the approved gate (as prism-batch-tests.js)
const ix = JSON.parse(read('data/prism/v1.1/index.json')), v1 = JSON.parse(read('data/prism/v1/manifest.json'));
const pages = [];
ix.shards.forEach((s) => G.checkShard(JSON.parse(read('data/prism/v1.1/' + s.path)), s, (id) => sha(id).charAt(0)).entries.filter(G.hasReport).forEach((e) => {
  const r = JSON.parse(read('data/prism/v1.1/' + e.path)), only = r.supplementsV1Report === null, e1 = v1.reports.find((x) => x.id === e.id);
  const v = G.model11(G.checkReport11(r, e, only), e); v.periods = G.V11.PERIODS;
  const md = e1 ? G.model(G.checkReport(JSON.parse(read('data/prism/v1/' + e1.path)), e1), v1) : null;
  const pg = G.compose(md, v), html = pg ? G.pageHtml(pg, { root: '../' }) : '';
  pages.push({ id: e.id, r, v, pg, html });
}));
check('every report in the release loads through the gate (' + pages.length + ')', pages.length === ix.counts.reports && pages.length === 2099);

// ---- the approved wording, literally
const W = {
  price: { around: 'Priced in line with comparable {cls}s', below: 'Priced below most comparable {cls}s', above: 'Priced above most comparable {cls}s' },
  resale: { steady: 'steady resales', around: 'resale activity typical of similar developments', above: 'more resale activity than most similar developments', below: 'less resale activity than most similar developments', settling: 'resale activity still settling after its first wave' },
  market: { down: 'nearby resale activity has slowed', up: 'nearby resale activity has picked up', flat: 'nearby resale activity is broadly unchanged' },
  why: { P: { around: 'Close to the price level of comparable {cls}s nearby.', below: 'Lower than most comparable {cls}s nearby.', above: 'Higher than most comparable {cls}s nearby.' },
    R: { above: 'Homes here change hands more often than at most similar developments.', small: 'Measured on fewer than 50 homes, so a few sales move this figure.', steady: 'Typical of similar developments.', around: 'Typical of similar developments.',
      below: 'Homes here change hands less often than at most similar developments.', settling: 'Most resales so far came in the first resale wave after completion.' },
    I: { above: 'Closer to a station than most similar developments.', around: 'A typical station distance for similar developments.', below: 'Farther from a station than most similar developments.' },
    M: { down: 'Fewer homes changed hands within 2 km than a year earlier.', up: 'More homes changed hands within 2 km than a year earlier.', flat: 'Within 10% of a year earlier, so broadly unchanged.', quiet: 'A relatively quiet surrounding resale market.' } },
  limitP: 'A position against comparables, not a valuation or a price change.', limitM: 'Counts transactions, not prices or demand.', limitI: 'Straight-line distance, not walking time.',
  scope: { P: 'This development · Price position', R: 'This development · Resale activity', I: 'Location · Nearest MRT or LRT', M: 'Neighbourhood · 2 km · Nearby resales', S: 'Neighbourhood · 2 km · Nearby resales' },
  settling: 'Most recent resales came in the first resale wave, so the long-run resale rate is not yet known.',
  sentences: [/^More resale activity than most similar developments\.$/, /^Homes here have resold in every month of the last two years\.$/, /^.+ is about [\d,.]+ k?m from .+ \(straight line\)\.$/,
    /^Closer to an MRT or LRT station than most similar developments\.$/, /^Priced in line with comparable (condo|EC)s\.$/, /^Priced below most comparable (condo|EC)s \(a position, not a sign of value\)\.$/,
    /^No other (condo|EC) was selling new homes within 2 km in the latest year\.$/,
    /^Most recent resales came in the first resale wave, so the long-run resale rate is not yet known\.$/, /^Less resale activity than most similar developments\.$/, /^Priced above most comparable (condo|EC)s\.$/,
    /^Farther from an MRT or LRT station than most similar developments\.$/, /^The surrounding market (slowed \([\d.,]+% fewer|picked up \([\d.,]+% more) resales within 2 km\)(, separate from this development's own resale record)?\.$/,
    /^No price comparison: .+$/, /^No resale rate: .+$/, /^Fewer than 50 homes, so a few sales move the resale rate\.$/, /^(1 other (condo|EC) development|[\d,]+ other (condo|EC) developments) sold new homes within 2 km in the latest year\.$/],
  ask: { priceAbove: 'What does the premium over comparable {cls}s pay for: unit size, floor, facing, age or facilities?', priceBelow: 'What explains the lower price position against comparable {cls}s: age, tenure, unit mix or location?',
    resale: 'How many units are listed for resale here now, and how quickly have recent ones sold?', mrt: 'How long is the actual walk or ride to the station you would use?',
    market: 'How do recent transacted prices for similar units nearby compare with a year earlier?', price: 'How does the asking price for the unit you are considering compare with recent resales of similar units here and at comparable {cls}s nearby?' },
  askNote: 'A question to check, not a prediction.', askNoteMarket: 'PRISM counts resales; it does not track prices.',
  foot: 'The original figures, periods, comparison groups and sources are in the five dimensions below.'
};
// wording that must never appear in the explanation's own text (after the approved negations are taken out)
const ALLOWED = ['not prices or demand', 'not necessarily weaker demand', 'it does not track prices', 'not a valuation or a price change', 'not a sign of value', 'not a prediction'];
const BANNED = /undervalu|overvalu|bargain|cheap|good value|better value|worth (buying|it)|recommend|should (buy|sell)|score|\/100|rating|forecast|predict|will (rise|fall|increase|decrease|grow|drop)|demand|Ken's Take|holding its own|outperform|underperform|investment|strong buy|prices? (have |has |are |is )?(fall|rise|drop|soft|firm|strengthen|weaken|increas|decreas)|premium location|convenient|school/i;
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- expectations from the approved JSON
function expect(p) {
  const r = p.r, pos = (d) => ((r.peerComparison && r.peerComparison.positions) || []).find((x) => x.dimension === d && x.approval && x.approval.state === 'approved');
  const line = (m) => ((r.profile && r.profile.lines) || []).find((l) => l.measure === m), av = (l) => l && l.status === 'available';
  const P = pos('P'), R = pos('R'), pc = P && P.components && P.components[0], rc = R && R.components && R.components[0];
  const cls = { condo: 'condo', ec: 'EC' }[(r.profile.comparisonGroup || (r.peerComparison && r.peerComparison.peerGroup) || {}).propertyClass] || 'development';
  const mrt = line('infrastructure.mrt'), mk = line('market.backdrop'), rs = line('resale.sustained'), ql = line('supply.quietArea');
  const near = av(mrt) && mrt.data && Array.isArray(mrt.data.stations) && mrt.data.stations[0] && typeof mrt.data.stations[0].distanceM === 'number' ? mrt.data.stations[0] : null;
  const rank = av(mrt) && mrt.data ? mrt.data.rank : null;
  const chg = av(mk) && mk.data && typeof mk.data.changePct === 'number' ? mk.data.changePct : null;
  const quiet = !!(av(ql) && ql.data && ql.data.flag === true && typeof ql.data.resales2km === 'number');
  const settling = !!(rs && rs.status === 'settling'), steady = !!(R && (R.context || []).some((c) => c.id === 'activeMonthShare24' && c.value === 100));
  const homes = R && R.sample && R.sample.homes, big = typeof homes === 'number' && homes >= 50;
  const mkey = chg === null ? '' : chg <= -10 ? 'down' : chg >= 10 ? 'up' : 'flat';
  const N = ((r.profile && r.profile.comparisonGroup) || (r.peerComparison && r.peerComparison.peerGroup) || {}).developments, wf = (c) => (typeof N === 'number' && c.peersWithValue < N ? ' with a figure' : '');   // as the statements say
  const rk = (c, t, t0) => (c.lower === 0 && c.equal === 0 ? fill(t0, { n: fmt(c.peersWithValue, 0) }) + wf(c) : fill(t, { lower: fmt(c.lower, 0), n: fmt(c.peersWithValue, 0) }) + wf(c));
  const cards = [];
  if (pc && typeof pc.value === 'number' && W.why.P[P.band]) cards.push({ dim: 'P', v: pc.value < 0 ? fmt(-pc.value) + '% below' : pc.value > 0 ? fmt(pc.value) + '% above' : 'In line', unit: 'comparable prices',
    cmp: fmt(pc.lower, 0) + ' of ' + fmt(pc.peersWithValue, 0) + ' similar developments' + wf(pc) + ' have a lower relative price', why: fill(W.why.P[P.band], { cls }), limit: W.limitP });
  const rkey = !R ? '' : settling ? 'settling' : R.band === 'above' ? (big ? 'above' : 'small') : R.band === 'around' ? (steady ? 'steady' : 'around') : R.band;
  if (rc && typeof rc.value === 'number' && W.why.R[rkey]) cards.push({ dim: 'R', v: fmt(rc.value, 1), unit: 'resales per 100 homes annually', cmp: rk(rc, 'Higher than {lower} of {n} similar developments', 'Lower than all {n} similar developments'), why: W.why.R[rkey] });
  if (near) cards.push({ dim: 'I', v: metres(near.distanceM), unit: 'to ' + near.name, cmp: rank ? 'Closer than ' + fmt(rank.higher, 0) + ' of ' + fmt(rank.peersWithValue, 0) + ' similar developments' + wf(rank) : '', why: rank ? W.why.I[rank.band] : '', limit: W.limitI });
  if (chg !== null && mk.period && mk.period.latest) cards.push({ dim: 'M', v: chg < 0 ? fmt(-chg) + '% fewer' : chg > 0 ? fmt(chg) + '% more' : 'No change in', unit: 'nearby resales',
    cmp: fmt(mk.data.prior, 0) + ' → ' + fmt(mk.data.latest, 0) + ' condo and EC resales within 2 km' + (av(ql) && ql.data.resales2km === mk.data.latest ? '. ' + rk(ql.data, 'More nearby resales than {lower} of {n} similar developments', 'Fewer nearby resales than all {n} similar developments') : ''), why: W.why.M[mkey], limit: mkey === 'flat' ? '' : W.limitM });
  else if (quiet) cards.push({ dim: 'S', v: fmt(ql.data.resales2km, 0), unit: 'nearby resales', cmp: rk(ql.data, 'More nearby resales than {lower} of {n} similar developments', 'Fewer nearby resales than all {n} similar developments'), why: W.why.M.quiet });
  const hp = P && W.price[P.band] ? fill(W.price[P.band], { cls }) : '';
  const hk = !R ? '' : settling ? 'settling' : R.band === 'around' ? (steady ? 'steady' : 'around') : R.band === 'above' && !big ? '' : R.band;
  const hr = hk ? (hp ? 'with ' + W.resale[hk] : cap(W.resale[hk])) : '';
  const head = hp || hr ? [hp, hr].filter(Boolean).join(', ') + (mkey ? ', while ' + W.market[mkey] : '') + '.' : mkey ? cap(W.market[mkey]) + '.' : '';
  const ask = P && P.band === 'above' ? W.ask.priceAbove : P && P.band === 'below' ? W.ask.priceBelow : settling || (R && R.band === 'below') ? W.ask.resale : rank && rank.band === 'below' ? W.ask.mrt : mkey === 'down' || mkey === 'up' ? W.ask.market : W.ask.price;
  return { cls, cards, near, rank, chg, mkey, head, lead: !!(hp || hr), settling, big, P, R, quiet, ask: fill(ask, { cls }), askNote: ask === W.ask.market ? W.askNoteMarket : W.askNote, line };
}

// ---- 1 placement
const prof = pages.filter((p) => p.pg && p.pg.mode === 'profile'), asmt = pages.filter((p) => p.pg && p.pg.mode === 'assessment');
check('2,097 evidence-profile pages and the 2 V1 assessment pages (Kingsford Waterbay, Hougang Central)', prof.length === 2097 && asmt.map((p) => p.id).sort().join() === 'hougang-central,kingsford-waterbay', asmt.map((p) => p.id));
check('the V1 assessment pages (Reveal and Verdict) never show the explanation', asmt.every((p) => p.html.indexOf('gwp-xp') < 0 && p.html.indexOf('data-gwp-explain') < 0));
const SEC = /<section class="gwp-xp"[\s\S]*?<\/section>/;
const withX = prof.filter((p) => SEC.test(p.html)), without = prof.filter((p) => !SEC.test(p.html));
check('every profile page with something to explain opens with the explanation (' + withX.length + '); the others keep their approved opening alone (' + without.length + ')',
  withX.length + without.length === 2097 && without.every((p) => !expect(p).head && /<section class="gwp-rv11" data-gwp-reveal=/.test(p.html)) && withX.every((p) => !!expect(p).head), without.map((p) => p.id));
check('the explanation comes first, once, in place of the opening section, before the five dimensions', withX.every((p) => { const h = p.html, i = h.indexOf('<section class="gwp-xp"'); return h.split('<section class="gwp-xp"').length === 2 && i >= 0 && i < h.indexOf('gwp-dims') && h.indexOf('gwp-rv11') < 0; }));
check('the five dimensions follow on every profile page, each position statement (with its original signed figure) word for word',
  prof.every((p) => (p.html.match(/data-gwp-pillar=/g) || []).length === 5 && ((p.r.peerComparison && p.r.peerComparison.positions) || []).every((x) => text(p.html).indexOf(x.statement) >= 0)));

// ---- 2-6 per page
const B = {}; const bad = (k, x) => (B[k] = B[k] || []).push(x);
const n = { mrtGood: 0, down: 0, up: 0, flat: 0, d4: 0, reveals: 0, d3: 0, quiet: 0, missing: 0, asks: {} };
withX.forEach((p) => {
  const op = G.reveal11(p.v), e = expect(p), sec = SEC.exec(p.html)[0], t = text(sec), x = G.explain11(p.v, p.r.name, op);
  // cards
  const cards = [...sec.matchAll(/<a class="gwp-xf" href="#\/prism\/([^/"]+)\/(\w)" data-gwp-xjump="(\w)"><span class="gwp-xs">([^<]*)<\/span><span class="gwp-xv"><b>([^<]*)<\/b> <span class="gwp-xl">([^<]*)<\/span><\/span>([\s\S]*?)<\/a>/g)];
  const dims = cards.map((m) => m[3]);
  if (dims.join() !== e.cards.map((c) => c.dim).join()) bad('cards', [p.id, dims, e.cards.map((c) => c.dim)]);
  const ord = dims.map((d) => 'PRIM'.indexOf(d === 'S' ? 'M' : d)); if (ord.some((o, i) => o < 0 || (i && o <= ord[i - 1]))) bad('order', [p.id, dims]);
  cards.forEach((m, i) => { const c = e.cards[i]; if (!c) return; const rest = text(m[7]);
    if (text(m[5]) !== c.v || text(m[6]) !== c.unit) bad('values', [p.id, c.dim, text(m[5]) + ' ' + text(m[6]), c.v + ' ' + c.unit]);
    if (/[−+]/.test(m[5])) bad('signs', [p.id, m[5]]);
    if (c.cmp && rest.indexOf(c.cmp) < 0) bad('cmp', [p.id, c.dim, rest, c.cmp]);
    const stmt = c.dim === 'P' ? e.P.statement : c.dim === 'R' ? e.R.statement : c.dim === 'I' ? e.line('infrastructure.mrt').statement : null;   // the peer count is the approved statement's own
    if (stmt && c.cmp && !/^Lower than all/.test(c.cmp) && stmt.toLowerCase().indexOf(c.cmp.toLowerCase()) < 0) bad('stmt', [p.id, c.dim, c.cmp, stmt]);
    if (c.why && rest.indexOf(c.why) < 0) bad('why', [p.id, c.dim, rest, c.why]);
    if ((c.dim === 'P' || c.dim === 'M' || c.dim === 'I') && (rest.indexOf(c.limit || '§') >= 0) !== !!c.limit) bad('limits', [p.id, c.dim, rest]);
    if (m[1] !== p.id || m[2] !== m[3].toLowerCase() || text(m[4]) !== W.scope[m[3]]) bad('links', [p.id, m.slice(1, 5)]);
    if (/class="[^"]*(pos|neg|good|bad|green|red|up|down)\b/.test(m[0])) bad('colour', [p.id, m[0].slice(0, 120)]); });
  // the headline
  if (x.head !== e.head || t.indexOf(e.head) < 0) bad('head', [p.id, x.head, e.head]);
  // market: volume wording only at -10% / +10%; never price movement
  if ((/slowed/.test(t) !== (e.mkey === 'down')) || (/picked up/.test(t) !== (e.mkey === 'up')) || (/broadly unchanged/.test(t) !== (e.mkey === 'flat'))) bad('market', [p.id, e.chg]);
  if (e.mkey) n[e.mkey]++;
  // D4
  if ((/more resale activity than most|change hands more often than at most/i.test(t)) && !e.big) bad('d4', p.id);
  if (e.R && e.R.band === 'above' && !e.big) n.d4++;
  // the three sections
  const lists = {}; [...sec.matchAll(/<div class="gwp-xt3"><h3>([^<]*)<\/h3><ul>([\s\S]*?)<\/ul><\/div>/g)].forEach((m) => { lists[m[1]] = [...m[2].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((l) => text(l[1])); });
  const good = lists['What stands out'] || [], watch = lists['What deserves attention'] || [];
  if (Object.keys(lists).some((k) => k !== 'What stands out' && k !== 'What deserves attention') || good.length > 2 || watch.length > 2) bad('sections', [p.id, Object.keys(lists)]);
  [...good, ...watch].forEach((s) => { if (!W.sentences.some((re) => re.test(s))) bad('sentences', [p.id, s]); });
  if ([...good, ...watch].some((s) => s === e.head)) bad('sentences', [p.id, 'repeats the headline']);
  const q = /<div class="gwp-xq"><h3>What to check next<\/h3><p>([^<]*)<\/p><small>([^<]*)<\/small><\/div>/.exec(sec);
  if (!q || text(q[1]) !== e.ask || text(q[2]) !== e.askNote || t.split('What to check next').length !== 2) bad('ask', [p.id, q && text(q[1]), e.ask]); else n.asks[e.ask.slice(0, 24)] = (n.asks[e.ask.slice(0, 24)] || 0) + 1;
  if (t.indexOf(W.foot) < 0) bad('foot', p.id);
  // MRT: a proximity observation only within 500 m (not in the "farther than most" band)
  const mrtGood = good.some((s) => / is about [\d,.]+ k?m from .+ \(straight line\)\.$/.test(s));
  if (mrtGood && !(e.near && e.near.distanceM <= 500 && !(e.rank && e.rank.band === 'below'))) bad('mrt', [p.id, e.near]); if (mrtGood) n.mrtGood++;
  // the quiet area: little competition is not an advantage
  if (e.quiet && good.some((s) => /^No other .+ was selling new homes/.test(s))) bad('quiet', p.id); if (e.quiet) n.quiet++;
  // the attention list uses the report's own missing-evidence reasons
  watch.filter((s) => /^No (price comparison|resale rate): /.test(s)).forEach((s) => { n.missing++; const why = s.replace(/^No (price comparison|resale rate): /, ''); if (![e.line('price.entry'), e.line('resale.sustained')].some((l) => l && l.statement === 'Not available: ' + why)) bad('missing', [p.id, s]); });
  // the approved opening kept word for word, and its notes not repeated below
  if (op) {
    const ok1 = (op.kind === 'reveal' || !e.lead ? t.indexOf(op.head) >= 0 : true) && op.notes.every((nn) => t.indexOf(nn) >= 0) && (op.kind === 'reveal' ? /^PRISM Reveal /.test(t) : e.lead ? /^What the numbers reveal /.test(t) : /^PRISM summary /.test(t)) && sec.indexOf('data-gwp-reveal="' + op.id + '"') > 0;
    const once = op.notes.every((nn) => t.split(nn).length === 2) && !(op.notes.some((nn) => nn.indexOf('Settling: ') === 0) && watch.indexOf(W.settling) >= 0);
    if (!ok1 || !once) bad('opening', [p.id, op.id, ok1, once]);
    if (op.kind === 'reveal') n.reveals++; if (op.id === 'evidence') n.d3++;
  } else if (!/^What the numbers reveal /.test(t)) bad('opening', [p.id, 'no opening']);
  // wording: the explanation's own text (the approved opening aside)
  let own = op ? [op.head, ...op.notes].reduce((s, nn) => s.split(nn).join(' '), t) : t; ALLOWED.forEach((a) => { own = own.split(a).join(' '); });
  if (BANNED.test(own)) bad('banned', [p.id, own.match(BANNED)[0]]);
});
const r = (k) => [!B[k], (B[k] || []).slice(0, 4)];
check('cards: exactly the available measures of Price, Resale, MRT and nearby Market, nothing else', ...r('cards'));
check('cards: always in the order Price, Resale, MRT, Market', ...r('order'));
check('cards: meaning-first figures equal to the approved values ("2% below comparable prices", "5.2 resales per 100 homes annually", "190 m to Bartley MRT", "16.8% fewer nearby resales")', ...r('values'));
check('cards: no plus or minus sign on any card figure (the signed figures stay in the dimensions)', ...r('signs'));
check('cards: the approved peer counts ("24 of 44 similar developments have a lower relative price", "Higher than 32 of 51", "Closer than 34 of 51", resales before and after)', ...r('cmp'));
check('cards: each peer count is word for word in the approved statement (Price, Resale, MRT)', ...r('stmt'));
check('cards: the reading set by each approved band (not by the sign of the figure)', ...r('why'));
check('cards: the price limitation always, the volume limitation only with market change wording, straight-line distance on the MRT card', ...r('limits'));
check('cards: development (This development) and surroundings (Location, Neighbourhood · 2 km) labelled apart; each card opens its own dimension', ...r('links'));
check('cards: no colour or class that depends on the sign of a figure', ...r('colour'));
check('headline: the approved clauses, chosen by the exported bands (recomputed independently for every page)', ...r('head'));
check('market: "slowed" / "picked up" only at -10% / +10% or beyond, otherwise "broadly unchanged" (' + n.down + ' / ' + n.up + ' / ' + n.flat + ')', ...r('market'));
check('D4: no "more than most" resale finding for a development under 50 homes (' + n.d4 + ' such pages)', !B.d4 && n.d4 > 0, (B.d4 || []).slice(0, 4));
check('sections: What stands out and What deserves attention (at most two each, only when there is something to say)', ...r('sections'));
check('sections: every finding is an approved sentence, never the headline repeated', ...r('sentences'));
check('What to check next: one question, chosen by the evidence, with its note ' + JSON.stringify(n.asks), ...r('ask'));
check('the pointer to the full method in the five dimensions on every page', ...r('foot'));
check('MRT: a proximity observation only within 500 m and not in the "farther than most" band (' + n.mrtGood + ' pages)', ...r('mrt'));
check('quiet area: never "no other development selling" as a strength (' + n.quiet + ' quiet-area pages)', ...r('quiet'));
check('missing evidence is named with the report\'s own reason (' + n.missing + ' findings)', ...r('missing'));
check('approved openings kept word for word, their notes shown once (' + n.reveals + ' Reveals, ' + n.d3 + ' D3 summaries)', ...r('opening'));
check('no score, forecast, valuation, rating, recommendation, demand, investment, price-movement or school wording in the explanation', ...r('banned'));

// ---- the pilot and the fallbacks
const one = withX.find((p) => p.id === 'bartley-ridge'), bx = one && G.explain11(one.v, one.r.name, G.reveal11(one.v));
check('Bartley Ridge (the pilot): headline and four meaning-first cards', !!bx && bx.head === 'Priced in line with comparable condos, with steady resales, while nearby resale activity has slowed.' &&
  bx.cards.map((c) => c.v + ' ' + c.unit).join(' | ') === '2% below comparable prices | 5.2 resales per 100 homes annually | 190 m to Bartley MRT | 16.8% fewer nearby resales', bx && bx.cards.map((c) => c.v + ' ' + c.unit));
check('explainHtml(null) is empty and the openings shown alone are exactly revealHtml', G.explainHtml(null) === '' && without.every((p) => p.html.indexOf(G.revealHtml(G.reveal11(p.v))) >= 0));
// ---- colours: white, navy and muted gold only (no red or green, nothing tied to a sign)
const css = read('assets/css/gw-prism.css'), xcss = css.slice(css.indexOf('/* The buyer explanation'), css.indexOf('@media (max-width:359px){.gwp-xfs'));
const cols = (xcss.match(/#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\)|var\(--gwp-[a-z]+[^)]*\)/g) || []).filter((c) => !/^#fff$|^#FFF$|^rgba\(22,33,62,|^var\(--gwp-(ink|gold|muted|body|line|soft)\b/.test(c));
check('explanation styles use only white, navy (ink), muted gold and the existing neutrals', xcss.length > 500 && cols.length === 0, cols);
console.log('prism-explain-tests: %d passed, %d failed', ok, fail);
process.exit(fail ? 1 : 0);
