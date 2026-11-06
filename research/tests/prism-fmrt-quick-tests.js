/* PRISM: future MRT in the buyer-facing reading (Ken / Groundwork 01, 6 Nov 2026: Hundred Palms pilot; then all 21 qualifying reports, Master
   Planning, 6 Nov 2026). In node, all 2,099 reports.
   Run from the site folder:  node research/tests/prism-fmrt-quick-tests.js [path to the previous gw-prism.js, for the Hundred Palms before/after checks]
   1 the rule: only a report in the reviewed list FM.ON whose approved future-transport station (under construction, LTA target) is within
     500 m while today's nearest station is not "close"; FM.ON is exactly the 21 reports the rule qualifies; no other report is touched
   1b each of the 21: the station is its approved line's nearest; only the headline's location phrase, the MRT figure (today + future), the repeated
     watch sentence and the MRT card change; price, resale and market figures, the warning on top (a lead "farther from MRT" stays), what looks promising, the question and the Reveal do not
   2 Hundred Palms: the quick read headline names the new station with its straight-line distance; the MRT figure shows MRT today and Future
     MRT (line, under construction, LTA target); the price, resale and market figures, the watch-out and the Reveal are unchanged; the full
     analysis's MRT card and its "farther from MRT" sentence state the station, the status and the LTA target
   3 wording: no benefit, demand, price, value, score or forecast claim in anything added
   4 every other report: quick read, full analysis and Reveal byte for byte the live renderer's before the pilot (fixtures/prism-fmrt-quick-baseline.json) */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const G = require(path.join(SITE, 'assets/js/gw-prism.js'));
const PREV = process.argv[2] ? require(path.resolve(process.argv[2])) : null;
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 500)); } };
const D = path.join(SITE, 'data/prism/v1.1/'), readB = (p) => fs.readFileSync(path.join(D, p)), sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const ix = JSON.parse(readB('index.json')), entries = [];
ix.shards.forEach((s) => G.checkShard(JSON.parse(readB(s.path)), s, (id) => sha(id).charAt(0)).entries.filter(G.hasReport).forEach((e) => entries.push(e)));
const mdl = (Gx, id) => { const e = entries.find((x) => x.id === id), r = JSON.parse(readB(e.path)); Gx.checkReport11(r, e, r.supplementsV1Report === null); const v = Gx.model11(r, e); v.periods = Gx.V11.PERIODS; v.curated = Gx.isCurated(e); return v; };
const out = (Gx, id) => { const v = mdl(Gx, id), op = Gx.reveal11(v), x = Gx.explain11(v, v.name, op && op.kind === 'reveal' ? op : null), q = Gx.quick11(v, v.name, op);
  return { v, op, x, q, html: Gx.quickHtml(q, id, Gx.explainHtml(x, op, id)) + Gx.revealHtml(op) }; };
const HPR = 'hundred-palms-residences', BAD = /apprecia|uplift|capital|price gain|value|invest|boost|premium|demand|buyer appeal|improve|benefit|better|score|rank|percentile|forecast|expected to rise|walk|minutes/i;

// 1 the rule
const ON = Object.keys(G.FM.ON).sort();
const qual = entries.filter((e) => { const v = mdl(G, e.id); const saved = G.FM.ON[e.id]; G.FM.ON[e.id] = true; const f = G.futureNear(v); if (!saved) delete G.FM.ON[e.id]; return !!f; }).map((e) => e.id).sort();
check('FM.ON is exactly the ' + qual.length + ' reports the rule qualifies (21, Hundred Palms among them)', qual.length === 21 && JSON.stringify(ON) === JSON.stringify(qual) && ON.indexOf(HPR) >= 0, [ON.length, qual.filter((x) => ON.indexOf(x) < 0)]);
check('no report outside FM.ON is affected', entries.filter((e) => !G.FM.ON[e.id] && G.futureNear(mdl(G, e.id))).length === 0);
// 1b each of the 21, against its own reading with the rule off
const off = (id) => { const keep = G.FM.ON; G.FM.ON = {}; try { return out(G, id); } finally { G.FM.ON = keep; } };
const each = ON.map((id) => {
  const A = out(G, id), Z = off(id), f = G.futureNear(A.v), l = A.v.profile.lines.I.find((x) => x.measure === 'infrastructure.futureTransport'), s0 = l.data.stations[0], P = [];
  const bad = (m) => P.push(id + ': ' + m);
  if (!f || f.name !== s0.name || f.distanceM !== s0.distanceM || f.target !== s0.target || f.line !== s0.line || s0.status !== 'under_construction' || f.distanceM > 500) bad('station');
  if (A.q.head.indexOf('New MRT station being built ' + f.m + ' away.') !== 0 || A.q.head.split('. ').slice(1).join('. ') !== Z.q.head.split('. ').filter((t) => !/MRT/.test(t)).join('. ')) bad('headline ' + A.q.head + ' / ' + Z.q.head);
  const I1 = A.q.figs.find((x) => x.dim === 'I'), I0 = Z.q.figs.find((x) => x.dim === 'I');
  if (!I1 || I1.v !== I0.v || I1.label !== I0.label || I1.cmp !== I0.cmp || I1.scope !== 'MRT today' || !I1.fut || I1.fut.v !== f.m || I1.fut.label !== f.name || I1.fut.sub !== f.line + ' · Under construction · LTA\u00a0target\u00a0' + f.target) bad('MRT figure');
  if (JSON.stringify(A.q.figs.filter((x) => x.dim !== 'I')) !== JSON.stringify(Z.q.figs.filter((x) => x.dim !== 'I'))) bad('other figures');
  const zw = Z.x.watchAll.slice(0, 2).filter((t, i) => !(t === G.XT.watch.mrtFar && i > 0));   // expected: the lead warning unchanged; a second "farther from MRT" not repeated, nothing new in its place
  if (A.q.warn !== Z.q.warn || A.q.warn !== (zw[0] || Z.q.warn) || JSON.stringify(A.q.good) !== JSON.stringify(Z.q.good) || A.q.ask !== Z.q.ask || JSON.stringify(A.op) !== JSON.stringify(Z.op) || A.html.indexOf(G.revealHtml(A.op)) < 0) bad('warn/good/ask/Reveal');
  if (JSON.stringify(A.q.also) !== JSON.stringify(zw.slice(1))) bad('also watch');
  const X1 = A.x.cards.find((c) => c.dim === 'I'), X0 = Z.x.cards.find((c) => c.dim === 'I');
  if (!X1 || ['v', 'unit', 'cmp', 'why', 'limit'].some((k) => X1[k] !== X0[k]) || X1.fut !== 'Future: ' + f.name + ' (' + f.line + ') about ' + f.m + ' to the planned site, under construction, LTA target ' + f.target + '.') bad('MRT card');
  if (JSON.stringify(A.x.cards.filter((c) => c.dim !== 'I')) !== JSON.stringify(Z.x.cards.filter((c) => c.dim !== 'I')) || A.x.head !== Z.x.head || JSON.stringify(A.x.goodAll) !== JSON.stringify(Z.x.goodAll)) bad('full analysis');
  const added = [A.q.head.split('. ')[0], I1 && I1.fut && I1.fut.sub, X1 && X1.fut].concat(A.x.watchAll.filter((t) => Z.x.watchAll.indexOf(t) < 0));
  if (added.some((t) => !t || BAD.test(t))) bad('wording ' + added.filter((t) => t && BAD.test(t)));
  return P; });
check('each of the 21: approved nearest station; only the MRT phrase, the MRT figure, the repeated watch sentence and the MRT card change; nothing else; no claim wording', each.every((p) => !p.length), [].concat(...each).slice(0, 5));
const near = G.futureNear(mdl(G, HPR));
check('Hundred Palms: the station read from its approved future-transport line', JSON.stringify(near) === JSON.stringify({ name: 'Serangoon North MRT', line: 'Cross Island Line', code: 'CR9', target: '2030', distanceM: 300, m: '300 m' }), near);

// 2 Hundred Palms
const H = out(G, HPR), I = H.q.figs.find((f) => f.dim === 'I');
check('quick read headline: "New MRT station being built 300 m away. Higher pricing. Steady market."', H.q.head === 'New MRT station being built 300 m away. Higher pricing. Steady market.', H.q.head);
check('MRT figure: MRT today 1.6 km from Hougang MRT, with its approved comparison; Future MRT 300 m, Serangoon North MRT, Cross Island Line, under construction, LTA target 2030',
  I && I.scope === 'MRT today' && I.v === '1.6 km' && I.label === 'from Hougang MRT' && I.cmp === 'Closer than 1 of 46 similar developments' &&
  JSON.stringify(I.fut) === JSON.stringify({ scope: 'Future MRT', v: '300 m', label: 'Serangoon North MRT', sub: 'Cross Island Line · Under construction · LTA\u00a0target\u00a02030' }), I);
if (PREV) {
  const P0 = out(PREV, HPR), strip = (q) => JSON.stringify({ figs: q.figs.filter((f) => f.dim !== 'I'), warn: q.warn, good: q.good, ask: q.ask, askNote: q.askNote, op: q.op });
  check('Hundred Palms: price, resale and market figures, the watch-out, what looks promising, the question and the Reveal are unchanged', strip(H.q) === strip(P0.q) && JSON.stringify(H.op) === JSON.stringify(P0.op) && G.revealHtml(H.op) === PREV.revealHtml(P0.op));
  check('Hundred Palms: the previous quick read for the record', P0.q.head === 'Farther from MRT. Higher pricing. Steady market.' && P0.q.also.join('') === 'Farther from an MRT or LRT station than most similar developments.', [P0.q.head, P0.q.also]);
  const xc = (x) => JSON.stringify(x.cards.filter((c) => c.dim !== 'I')) + JSON.stringify(x.goodAll) + x.head + x.ask;
  check('Hundred Palms full analysis: every card but the MRT card, the headline, what stands out and the question unchanged', xc(H.x) === xc(P0.x));
}
check('quick read: "Also watch" no longer repeats the farther-from-MRT sentence (both stations are in the figure above); the full analysis keeps it, with the station',
  H.q.also.length === 0 && H.x.watchAll.indexOf('Farther from an MRT or LRT station than most similar developments today; Serangoon North MRT (Cross Island Line) is under construction about 300 m away, LTA target 2030.') >= 0);
const XI = H.x.cards.find((c) => c.dim === 'I');
check('full analysis MRT card: today unchanged, plus the future station with its line, code, straight-line basis, status and LTA target', XI.v === '1.6 km' && XI.unit === 'to Hougang MRT' && XI.why === 'Farther from a station than most similar developments.' && XI.limit === 'Straight-line distance, not walking time.' &&
  XI.fut === 'Future: Serangoon North MRT (Cross Island Line) about 300 m to the planned site, under construction, LTA target 2030.', XI);
check('the page shows it (quick read figure and full analysis card carry data-gwp-future)', (H.html.match(/data-gwp-future/g) || []).length === 2);

// 3 wording
const added = [H.q.head.split('. ')[0], I.fut.scope, I.fut.label, I.fut.sub, XI.fut, H.x.watchAll.find((t) => /under construction/.test(t))];
check('nothing added claims a benefit, demand, price, value, score or forecast', added.every((t) => t && !BAD.test(t)), added.filter((t) => BAD.test(t)));
check('every added statement names the status and the LTA target or sits beside them; the distance is straight-line (stated in the card and the approved Future transport line)', /being built/.test(added[0]) && /Cross Island Line · Under construction · LTA\u00a0target\u00a02030/.test(added[3]) && /to the planned site, under construction, LTA target 2030\.$/.test(added[4]));

// 4 every other report unchanged
const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/prism-fmrt-quick-baseline.json'), 'utf8')).html;
const diff = entries.filter((e) => !G.FM.ON[e.id]).filter((e) => sha(out(G, e.id).html) !== BASE[e.id]).map((e) => e.id);
check('every other report (' + (entries.length - ON.length) + '): quick read, full analysis and Reveal byte for byte the live renderer\'s before the pilot (fixture)', Object.keys(BASE).length === entries.length && diff.length === 0, diff.slice(0, 5));
check('exactly the 21 reports in FM.ON changed', ON.every((id) => sha(out(G, id).html) !== BASE[id]));
console.log('prism-fmrt-quick-tests: %d passed, %d failed', ok, fail);
process.exit(fail ? 1 : 0);
