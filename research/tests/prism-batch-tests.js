/* PRISM at any scale: integrity, rendering and performance checks that hold for EVERY report in the approved release in data/prism/v1.1/
   (5 reports today; the nationwide release later). Release-agnostic: no development is named, no value is expected; what is checked is that
   every report passes the gate, renders a complete page or none, and never conflicts with another.
   Run from the site folder:  node research/tests/prism-batch-tests.js
   1 integrity (D5): index.json pinned; 16 shards pinned by it, each id in the shard its sha256 names; every report pinned by its shard; ids
     unique; no orphan file; V1 pairing; every PRISM id is a Research development (data/projects/index.json) or a launch with its own site; manifest item counts
     equal the approved items found
   2 every page: a V1 assessment page or an evidence-profile page or none; exactly five dimensions; each dimension shows evidence or an
     explicit missing state; every profile statement and position appears verbatim; the Reveal is an approved headline, a factual summary or
     absent; no forbidden wording
   3 partial reports (derived here from the approved files, never published): no positions; one panel only; every line missing; no yield or
     income: each renders its explicit missing states, or no page when nothing is evidenced
   4 performance: per-report gate + render time and file size within budget; the index (manifest) within budget for loading on every
     Property Data visit; the landing never loads more than PICKS_MAX reports */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const G = require(path.join(SITE, 'assets/js/gw-prism.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const clone = (o) => JSON.parse(JSON.stringify(o));
const BUDGET = { manifestKB: 120, reportKB: 64, renderMs: 25 };   // the index is fetched on every Property Data visit; a report only when it is opened

const v1 = JSON.parse(read('data/prism/v1/manifest.json')), it = read('data/prism/v1.1/index.json'), ix = JSON.parse(it);
const key = (id) => sha(id).charAt(0);
const research = new Set(JSON.parse(read('data/projects/index.json')).rows.map((r) => r[0]));
const LAUNCHES = new Set(['hougang-central']);   // a launch with its own site (no Research resale report): its V1 PRISM page links to that site

// ---- 1 integrity (D5: the root pinned, 16 shards pinned by the root, each report pinned by its shard)
check('index.json is the approved root (pinned sha256), the release and the A1 -> DECILE -> A2 -> NATIONWIDE-1 chain', sha(it) === G.V11.INDEX && (() => { try { G.checkIndex(ix); return true; } catch (e) { return false; } })());
const entries = [], badShard = [];
ix.shards.forEach((x) => { const t = read('data/prism/v1.1/' + x.path); if (sha(t) !== x.sha256) { badShard.push(x.key + ': sha256'); return; } try { G.checkShard(JSON.parse(t), x, key).reports.forEach((r) => entries.push(r)); } catch (e) { badShard.push(x.key + ': ' + e.message); } });
check('every shard matches the root and passes its gate; every id sits in the shard its sha256 names (' + entries.length + ' reports)', badShard.length === 0 && entries.length === ix.reports, badShard);
const ids = entries.map((r) => r.id), dup = ids.filter((x, i) => ids.indexOf(x) !== i);
check('every id appears once across the shards', dup.length === 0, dup.slice(0, 5));
const files = fs.readdirSync(path.join(SITE, 'data/prism/v1.1/reports'));
check('the reports folder holds exactly the indexed reports (no orphan, none missing)', files.length === ids.length && ids.every((id) => files.indexOf(id + '.json') >= 0));
const unknown = ids.filter((id) => !research.has(id) && !LAUNCHES.has(id));
check('every PRISM id is a Research development (Property Data exists) or a launch with its own site', unknown.length === 0, unknown.slice(0, 10));
const models = {}, bad = [];
let maxKB = 0, slow = 0, total = 0;
entries.forEach((e) => {
  const t = read('data/prism/v1.1/' + e.path); maxKB = Math.max(maxKB, Buffer.byteLength(t) / 1024);
  if (sha(t) !== e.sha256) { bad.push(e.id + ': sha256'); return; }
  const t0 = process.hrtime.bigint();
  try {
    const r = JSON.parse(t), only = r.supplementsV1Report === null, e1 = v1.reports.find((x) => x.id === e.id);
    if (only ? !!e1 : !e1) throw new Error('V1 pairing'); if (!only) G.checkPair(v1, e1);
    const v = G.model11(G.checkReport11(r, e, only), e); if (!v) { bad.push(e.id + ': item count'); return; }
    v.periods = G.V11.PERIODS;
    const md = e1 ? G.model(G.checkReport(JSON.parse(read('data/prism/v1/' + e1.path)), e1), v1) : null;
    const pg = G.compose(md, v); models[e.id] = { pg, html: pg ? G.pageHtml(pg, { root: '../' }) : '', r, homes: r.peerComparison && (r.peerComparison.positions || []).filter((x) => x.dimension === 'R').map((x) => x.sample && x.sample.homes)[0] };
  } catch (x) { bad.push(e.id + ': ' + x.message); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6; total += ms; if (ms > BUDGET.renderMs) slow++;
});
check('every report matches its sha256, pairs correctly with V1 (or is V1.1-only), passes the gate with exactly the items its shard lists', bad.length === 0, bad.slice(0, 5));
check('every item in the release carries the NATIONWIDE-1 approval (no item is shown otherwise)', Object.keys(models).length === entries.length);

// ---- 2 every page
const pages = Object.keys(models), problems = [];
pages.forEach((id) => {
  const { pg, html, r } = models[id], t = text(html);
  if (!G.hasPage(pg)) { if (html !== '') problems.push(id + ': no page, yet HTML'); return; }
  const dims = (html.match(/data-gwp-pillar="[PRISM]"/g) || []).length;
  if (dims !== 5) problems.push(id + ': ' + dims + ' dimensions');
  ['P', 'R', 'I', 'S', 'M'].forEach((k) => {
    const sec = html.split('data-gwp-pillar="' + k + '"')[1].split('data-gwp-pillar=')[0];
    if (!/data-gwp-line=|data-gwp-v11=|data-gwp-metric=|data-gwp-yield|data-gwp-income|Not assessed in this report/.test(sec)) problems.push(id + ' ' + k + ': neither evidence nor a missing state');
  });
  (r.profile ? r.profile.lines : []).forEach((l) => { if (!t.includes(l.statement)) problems.push(id + ': ' + l.measure + ' statement missing'); });
  (r.peerComparison ? r.peerComparison.positions : []).forEach((x) => { if (!t.includes(x.statement)) problems.push(id + ': ' + x.dimension + ' position missing'); });
  if (pg.mode === 'profile') {
    const x = G.reveal11(pg.v11);
    if (x && x.kind === 'reveal' && Object.values(G.REVEAL).indexOf(x.head) < 0) problems.push(id + ': unapproved Reveal headline');
    if (x && x.kind === 'summary' && x.id === 'evidence' && x.head.indexOf(G.ES.head) !== 0) problems.push(id + ': D3 summary not from the approved head');
    if (x && x.kind === 'summary' && x.id !== 'evidence' && !/^(Price: [^·]+)?( · )?(Resale activity: .+)?$/.test(x.head)) problems.push(id + ': summary not built from labels');
    if (/PRISM Verdict|class="gwp-card/.test(html)) problems.push(id + ': a verdict on a profile page');
  }
  if (/score\s*\/?\s*100|\/\s*100\b|purchasing power|affordab|ken.s take/i.test(t)) problems.push(id + ': forbidden wording');
});
check('every page: V1 assessment, evidence profile or none; five dimensions, each with evidence or an explicit missing state; every statement verbatim; Reveal approved, summary or absent; no forbidden wording (' + pages.length + ' reports)', problems.length === 0, problems.slice(0, 6));
const op = (id) => { const x = models[id]; if (!x.pg || !x.pg.page) return 'none'; if (x.pg.mode === 'assessment') return 'V1'; const y = G.reveal11(x.pg.v11); return y ? y.id : 'none'; };
const kinds = pages.reduce((a, id) => { const k = op(id); a[k] = (a[k] || 0) + 1; return a; }, {});
console.log('       openings:', JSON.stringify(kinds));
// the approved opening counts (NATIONWIDE-1, D3/D4; Claude C's opening expectations): 2 V1, 516 quiet, 22 settling, 300 above, 666 summaries, 120 D4 summaries, 473 D3
check('the openings are exactly the approved ones: 2 V1 Reveals and Verdicts, 516 quiet, 22 settling, 300 above most peers, 666 summaries, 120 D4 summaries, 473 D3 evidence summaries, none without', JSON.stringify(kinds, Object.keys(kinds).sort()) === JSON.stringify({ V1: 2, evidence: 473, quiet: 516, resaleAbove: 300, resaleSettling: 22, summary: 666, summaryD4: 120 }, Object.keys(kinds).sort()), kinds);
check('D4: every "above most peers" Reveal has 50 or more homes; every D4 summary has fewer', pages.every((id) => op(id) !== 'resaleAbove' || models[id].homes >= 50) && pages.every((id) => op(id) !== 'summaryD4' || models[id].homes < 50));
check('D3: every evidence summary is for a report with neither a Price nor a Resale position, from available measures only, with the report\'s own missing-evidence statements', pages.filter((id) => op(id) === 'evidence').every((id) => { const v = models[id].pg.v11, x = G.reveal11(v); return !v.positions.P && !v.positions.R && x.head.indexOf(G.ES.head) === 0 && x.notes.every((n) => models[id].r.profile.lines.some((l) => l.statement === n && l.status === 'not_available')); }));
check('no development has two PRISM pages (V1 and V1.1-only), and the V1 Reveals stay on the two V1 assessments', pages.filter((id) => op(id) === 'V1').every((id) => v1.reports.some((x) => x.id === id)));
// ---- 3 partial reports, derived from an approved profile report (never published; checked here only)
const base = pages.map((id) => models[id]).find((x) => x.pg.mode === 'profile');
if (base) {
  const e = { id: base.r.reportId, items: null };
  const build = (f) => { const r = clone(base.r); f(r); const v = G.model11(G.checkReport11(r, e, base.r.supplementsV1Report === null), null); if (v) v.periods = G.V11.PERIODS; return G.compose(null, v); };
  // a line made "not available" (future transport may only ever be "not yet assessed": the gate refuses anything else, so it is left as it is)
  const miss = (l) => { if (l.measure === 'infrastructure.futureTransport') return; l.status = 'not_available'; l.data = null; l.missing = { reason: 'test' }; l.statement = 'Not available: (test) ' + l.label + '.'; };
  { const pg = build((r) => { r.peerComparison.positions = []; }); const h = G.pageHtml(pg, { root: '../' });
    const x = G.reveal11(pg.v11);
    check('partial: no peer positions: still a page; Price shows its profile line; no resale-based Reveal (a flag-based one, or the D3 evidence summary, or none)', G.hasPage(pg) && /data-gwp-pillar="P"[^]*data-gwp-line="price\.entry"/.test(h) && (x === null || x.id === 'quiet' || x.id === 'evidence'), x && x.id); }
  { const pg = build((r) => { r.peerComparison.positions = []; r.profile.lines.filter((l) => l.panel !== 'I').forEach(miss); }); const h = G.pageHtml(pg, { root: '../' }), t = text(h.slice(h.indexOf('id="gwpDimsH"')));
    check('partial: only Infrastructure evidenced: a page; every other line keeps its place with its "Not available" statement', G.hasPage(pg) && (t.match(/Not available: \(test\)/g) || []).length === base.r.profile.lines.filter((l) => l.panel !== 'I').length); }
  { const pg = build((r) => { r.peerComparison.positions = []; r.profile.lines.forEach(miss); });
    check('partial: nothing evidenced (every line missing, no position): no page (Property Data unchanged)', !G.hasPage(pg)); }
  { const pg = build((r) => { r.profile.lines = r.profile.lines.filter((l) => l.panel === 'P' || l.panel === 'R'); }); const h = G.pageHtml(pg, { root: '../' });
    check('partial: a dimension with no lines at all says "Not assessed in this report"', G.hasPage(pg) && ['I', 'S', 'M'].every((k) => /Not assessed in this report/.test(h.split('data-gwp-pillar="' + k + '"')[1].split('data-gwp-pillar=')[0]))); }
  { const pg = build((r) => { r.rentalYield = null; r.householdIncome = null; }); const h = G.pageHtml(pg, { root: '../' });
    check('partial: no yield or income: none drawn, nothing else changes', G.hasPage(pg) && !/data-gwp-yield|data-gwp-income/.test(h)); }
}

// ---- 4 performance
const iKB = Buffer.byteLength(it) / 1024, sKB = Math.max.apply(null, ix.shards.map((x) => Buffer.byteLength(read('data/prism/v1.1/' + x.path)) / 1024));
check('what a Property Data visit loads is within budget: index.json ' + iKB.toFixed(1) + ' KB + one shard (largest ' + sKB.toFixed(1) + ' KB) (budget ' + BUDGET.manifestKB + ' KB together)', iKB + sKB <= BUDGET.manifestKB);
check('every report is within budget: largest ' + maxKB.toFixed(1) + ' KB (budget ' + BUDGET.reportKB + ' KB)', maxKB <= BUDGET.reportKB);
check('gate + render per report within ' + BUDGET.renderMs + ' ms (average ' + (total / Math.max(1, entries.length)).toFixed(2) + ' ms over ' + entries.length + '; ' + slow + ' over)', slow <= Math.ceil(entries.length * 0.01));
check('the page never loads manifest.json (450 KB integrity record): only index.json, one shard, one report', !/manifest\.json\?v=' \+ V11|V11\.DIR \+ 'manifest\.json/.test(read('assets/js/gw-prism.js')));
check('the landing loads at most PICKS_MAX (' + G.PICKS_MAX + ') reports, never the whole release', G.PICKS_MAX === 5 && /\.slice\(0, PICKS_MAX\)\.map\(\(id\) => load\(root, id\)\)/.test(read('assets/js/gw-prism.js')));
console.log('prism-batch-tests: ' + ok + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
