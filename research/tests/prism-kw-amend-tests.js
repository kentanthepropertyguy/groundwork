/* Kingsford Waterbay PRISM V1 amendment (GW-PRISM-V1-AMEND-KW-20261106-01, Master Planning, 6 Nov 2026), in node.
   Run from the site folder:  node research/tests/prism-kw-amend-tests.js
   The approved Option A: the Kingsford Waterbay V1 report withdraws the statements made out of date by the 5 Nov 2026 bedroom classification
   release (the first Verdict watch-out, one limitation, the reasons of P.priceEvidence and R.bedroomCoverage, now "Not part of this approved
   report."), records the amendment, and is re-pinned. No new figures, metrics or claims; no methodology change.
   1 the report: with the four withdrawals and the amendment record put back, it is byte for byte the approved 31 Oct file
   2 nothing else: Hougang Central and Thomson Three V1 reports, every V1.1 report, shard and redirects file byte-identical; the V1 and V1.1
     manifests, the index and gw-prism.js differ from the approved files only by the pins (each put back gives the approved file)
   3 the page: the remaining watch-out is the rental-contract one; no out-of-date bedroom wording anywhere in the published PRISM data
   4 privacy: no provider name, unit number, private path or key in the changed files */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const G = require(path.join(SITE, 'assets/js/gw-prism.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), readB = (p) => fs.readFileSync(path.join(SITE, p)), sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const j1 = (o) => JSON.stringify(o, null, 1) + '\n';
const REF = 'GW-PRISM-V1-AMEND-KW-20261106-01', ID = 'kingsford-waterbay', W = 'Not part of this approved report.';
const APPROVED = {   // the approved files before this amendment (live main 9afce10, 6 Nov 2026)
  report: '2d7266d31571169f2281a8aad3b31acb682de0229a6fd106cf47d2ff54ca1144', v1Manifest: '831114f97c6b72f7af5c2d82c275a6eadae8ca4a6c489fa9fdea9596437de83b',
  v11Manifest: 'c56115d20a51dae0c8ed547aeeee71d7c74388492a9687bf73de48f79be7e67e', index: '04afa13cdb2b891a400305309a9fe6be60c7cc0d5b095989e89be39f5d9332f0',
  gwPrism: '78d31e240dc1c5aca3fe4555f7ad0a9448471727152d5a5c516df349fa4d6e1f', files: '3c763e9560835733701d92ce79ae1bcc9a80542b138e919162aabee1af98d1e3',
  release: 'prism-v1.1-r3-fmrt-hpr-2026-11-04-5cc64056341d', hougang: '330f8e9f874bbf0e9e282b75d9e94b19a5e8d723be1f3ccb20faabfa306fc78f', thomson: '56b6139e0f013ac17bf92ac18183e290cc46fdb617e7906dc2513ff14e948ce1' };
const OLD = { watch: { text: 'Bedroom-specific resale activity is unclassified for this development', uses: ['R.bedroomCoverage'] },
  limit: 'No approved bedroom classification for this development: no bedroom-specific resale claims.', limitAt: 4, usesAt: 1,
  P: { status: 'insufficient', coverage: { verified: false, reason: 'no bedroom type or size band meets the minimum sample' }, nullReason: 'no bedroom type or size band meets the minimum sample', nullReasonCode: 'insufficient', note: 'no bedroom type or size band meets the minimum sample' },
  R: { status: 'insufficient', coverage: { verified: false, reason: 'No approved bedroom classification for this development.' }, nullReason: 'No approved bedroom classification for this development: bedroom-specific resale activity is not shown.', nullReasonCode: 'no_bedroom_classification', note: null } };

// 1 the report
const rt = read('data/prism/v1/reports/' + ID + '.json'), r = JSON.parse(rt), rSha = sha(rt);
const am = (r.provenance.amendments || [])[0] || {};
check('the amendment is recorded in the report (' + REF + ', 6 Nov 2026, previous sha256 the approved file)', r.provenance.amendments.length === 1 && am.ref === REF && am.approvedAt === '2026-11-06' && am.previousSha256 === APPROVED.report && r.provenance.approvalRef === 'GW-PRISM-V1-2026-10-31-A1');
const P0 = r.pillars.P.find((m) => m.id === 'P.priceEvidence'), RB = r.pillars.R.find((m) => m.id === 'R.bedroomCoverage');
check('the two empty metrics now say "' + W + '" (not_approved, withheld) and still carry no value', [P0, RB].every((m) => m.value === null && m.status === 'withheld' && m.nullReason === W && m.coverage.reason === W && m.nullReasonCode === 'not_approved' && m.approval.state === 'proposed'));
check('the Verdict keeps the approved rental-contract watch-out only', r.verdict.watchOut.length === 1 && r.verdict.watchOut[0].text === 'The 194 rental contracts in 12 months include renewals' && r.verdict.approval.approvalRef === 'GW-PRISM-V1-2026-10-31');
{ const b = JSON.parse(rt); delete b.provenance.amendments; b.verdict.watchOut.unshift(OLD.watch); b.verdict.uses.splice(OLD.usesAt, 0, 'R.bedroomCoverage'); b.limitations.splice(OLD.limitAt, 0, OLD.limit);
  Object.assign(b.pillars.P.find((m) => m.id === 'P.priceEvidence'), OLD.P); Object.assign(b.pillars.R.find((m) => m.id === 'R.bedroomCoverage'), OLD.R);
  check('with the withdrawals and the record put back, the report is byte for byte the approved 31 Oct file (no figure, metric or other wording changed)', sha(j1(b)) === APPROVED.report, sha(j1(b))); }
check('no out-of-date bedroom wording is left in the report', !/unclassified|No approved bedroom classification|minimum sample/i.test(rt));

// 2 nothing else
const v1t = read('data/prism/v1/manifest.json'), v1 = JSON.parse(v1t), e1 = v1.reports.find((x) => x.id === ID);
check('Hougang Central and Thomson Three V1 reports: byte-identical and pinned as approved', sha(readB('data/prism/v1/reports/hougang-central.json')) === APPROVED.hougang && sha(readB('data/prism/v1/reports/thomson-three.json')) === APPROVED.thomson &&
  v1.reports.filter((x) => x.id !== ID).map((x) => x.sha256).join() === [APPROVED.hougang, APPROVED.thomson].join());
check('V1 manifest: the Kingsford pin is the amended report; with the pin and the amendment record put back, it is the approved file', e1.sha256 === rSha && v1.amendments.length === 1 && v1.amendments[0].ref === REF && v1.amendments[0].sha256 === rSha &&
  (() => { const b = JSON.parse(v1t); delete b.amendments; b.reports.find((x) => x.id === ID).sha256 = APPROVED.report; return sha(j1(b)) === APPROVED.v1Manifest; })());
check('the page asks for this V1 manifest (MANIFEST_V) and pairs V1.1 with the amended report', G.MANIFEST_V === sha(v1t).slice(0, 10) && G.V11.V1PAIR.sha256[0] === rSha && G.V11.V1PAIR.sha256.slice(1).join() === [APPROVED.hougang, APPROVED.thomson].join());
const mt = read('data/prism/v1.1/manifest.json'), man = JSON.parse(mt), it = read('data/prism/v1.1/index.json'), ix = JSON.parse(it);
check('V1.1: a delta on the previous release (deltaApproval ' + REF + ', previous ' + APPROVED.release + '), chain unchanged, pinned', man.deltaApproval === REF && man.previous === APPROVED.release && man.releaseId === ix.releaseId && ix.releaseId === G.V11.RELEASE &&
  sha(mt) === G.V11.MANIFEST && ix.manifestSha256 === sha(mt) && sha(it) === G.V11.INDEX && ix.approvalChain.join() === G.V11.CHAIN.join() && G.V11.CHAIN.indexOf(REF) < 0);
check('V1.1 manifest: every listed file (reports, shards, redirects) unchanged: the same list, and each file matches its sha256', sha(JSON.stringify(man.files)) === APPROVED.files && man.files.every((f) => sha(readB('data/prism/v1.1/' + f.path)) === f.sha256));
{ const b = JSON.parse(mt); b.releaseId = APPROVED.release; b.generatedAt = '2026-11-04T04:18:03Z'; b.deltaApproval = 'GW-FMRT-P1-AMEND-HPR-20261104-01'; b.previous = 'prism-v1.1-r3-fmrt-p1-2026-11-04-ebfc22ae60fd';
  b.supplements.reports.find((x) => x.id === ID).sha256 = APPROVED.report;
  const c = JSON.parse(it); c.releaseId = APPROVED.release; c.manifestSha256 = APPROVED.v11Manifest;
  check('V1.1 manifest and index: with the release fields and the pin put back, both are the approved files', sha(j1(b)) === APPROVED.v11Manifest && sha(j1(c)) === APPROVED.index); }
{ let g = read('assets/js/gw-prism.js');
  const back = [[G.MANIFEST_V, APPROVED.v1Manifest.slice(0, 10)], [G.V11.RELEASE, APPROVED.release], [G.V11.INDEX, APPROVED.index], [G.V11.MANIFEST, APPROVED.v11Manifest], [rSha, APPROVED.report]];
  back.forEach(([a, b]) => { g = g.split(a).join(b); });
  g = g.replace(/    \/\/ GW-PRISM-V1-AMEND-KW-20261106-01 [^\n]*\n    \/\/ [^\n]*\n/, '');
  check('gw-prism.js: only the pins and a two-line note changed (put back, it is the approved file: no logic change)', sha(g) === APPROVED.gwPrism); }
check('the Research page loads this exact gw-prism.js (script version)', read('research/index.html').indexOf('gw-prism.js?v=' + sha(readB('assets/js/gw-prism.js')).slice(0, 10) + '"') > 0);

// 3 the page
const e11 = JSON.parse(read('data/prism/v1.1/index/' + sha(ID).charAt(0) + '.json')).entries.find((x) => x.id === ID);
const r11 = JSON.parse(read('data/prism/v1.1/' + e11.path)), v = G.model11(G.checkReport11(r11, e11, r11.supplementsV1Report === null), e11); v.periods = G.V11.PERIODS;
const md = G.model(G.checkReport(r, e1), v1), html = G.pageHtml(G.compose(md, v), { root: '../' });
check('the page shows the rental-contract watch-out and no out-of-date bedroom statement', html.indexOf('The 194 rental contracts in 12 months include renewals') > 0 && !/unclassified|No approved bedroom classification/.test(html));
check('the approved headline, reasons, hidden connections and next buyer question are unchanged', md.assessment.verdict.headline === 'Regular project-wide resale activity' && md.assessment.verdict.why.length === 2 && md.hidden.length === 2 && md.question === 'Does the resale activity also hold for the specific unit size you would buy?');

// 4 privacy
const changed = ['data/prism/v1/reports/kingsford-waterbay.json', 'data/prism/v1/manifest.json', 'data/prism/v1.1/manifest.json', 'data/prism/v1.1/index.json', 'assets/js/gw-prism.js'];
const bad = changed.filter((f) => /hutton|#\d{2}-\d{2}\b|kpt-private|[A-Z]:\\\\|URA_ACCESS_KEY|api[_-]?key/i.test(read(f)));
check('privacy: no provider name, unit number, private path or key in the changed files', !bad.length, bad);

console.log('prism-kw-amend-tests: ' + ok + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
