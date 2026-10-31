// node research/tests/prism-tests.js   PRISM V1 (31 Oct 2026): the published data, its checks and what may be shown.
// Data: data/prism/v1/ must be exactly the approved public release GW-PRISM-V1-2026-10-31-A1 (manifest sha256 below), nothing else.
// Shown: only approved metrics and approved copy; never score100, Ken's Take, S3/S4 (while the release withholds them) or a page
// for a report without an approved Reveal + Verdict (Thomson Three). Mixed and unfavourable verdicts use FICTIONAL fixtures, built here only.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const root = path.join(__dirname, '../..');
const P = require(path.join(root, 'assets/js/gw-prism.js')), R = require(path.join(root, 'assets/js/kpt-research.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { const r = fn(); if (r && r.then) return r.then(() => { pass++; console.log('  ok   ' + name); }, (e) => { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } return Promise.resolve(); };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const DIR = path.join(root, 'data/prism/v1');
const MANIFEST_SHA = '831114f97c6b72f7af5c2d82c275a6eadae8ca4a6c489fa9fdea9596437de83b';   // the approved release as delivered (31 Oct 2026)
const MAN = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const raw = (id) => fs.readFileSync(path.join(DIR, 'reports', id + '.json'), 'utf8');
const entry = (id) => MAN.reports.find((r) => r.id === id);
const REP = (id) => JSON.parse(raw(id));
const MD = (id, r) => P.model(P.checkReport(r || REP(id), entry(id)), MAN);
const clone = (o) => JSON.parse(JSON.stringify(o));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
const IDS = ['kingsford-waterbay', 'hougang-central', 'thomson-three'];

(async () => {
  console.log('The published data (data/prism/v1)');
  await t('the manifest is the approved release (sha256), and the page asks for that exact version', () => {
    assert.strictEqual(sha(fs.readFileSync(path.join(DIR, 'manifest.json'))), MANIFEST_SHA);
    assert.strictEqual(P.MANIFEST_V, MANIFEST_SHA.slice(0, 10));
    assert.strictEqual(MAN.status, 'approved'); assert.strictEqual(MAN.approvalRef, 'GW-PRISM-V1-2026-10-31-A1'); assert.strictEqual(MAN.schemaVersion, 'prism-public-v1');
  });
  await t('only manifest.json and the three reports are published; every report matches its manifest sha256', () => {
    const files = []; const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.relative(DIR, path.join(d, e.name)))));
    walk(DIR); assert.deepStrictEqual(files.sort(), ['manifest.json', 'reports/hougang-central.json', 'reports/kingsford-waterbay.json', 'reports/thomson-three.json']);
    MAN.reports.forEach((r) => assert.strictEqual(sha(fs.readFileSync(path.join(DIR, r.path))), r.sha256, r.id));
  });
  await t('approved counts: metrics 17 / 15 / 24, editorial 5 / 4 / 0', () => {
    const ed = (r) => [r.reveal, r.verdict, r.nextBuyerQuestion].concat(r.hiddenConnections || []).filter(P.approved).length;
    assert.deepStrictEqual(IDS.map((id) => REP(id).release.approvedMetrics.length), [17, 15, 24]);
    assert.deepStrictEqual(IDS.map((id) => MD(id).count), [17, 15, 24]);
    assert.deepStrictEqual(IDS.map((id) => ed(REP(id))), [5, 4, 0]);
  });
  await t('privacy: no provider name, private paths, unit numbers, coordinates or keys in the published data, the module or the images', () => {
    const blobs = ['manifest.json'].concat(IDS.map((id) => 'reports/' + id + '.json')).map((f) => fs.readFileSync(path.join(DIR, f), 'utf8'))
      .concat([fs.readFileSync(path.join(root, 'assets/js/gw-prism.js'), 'utf8'), fs.readFileSync(path.join(root, 'assets/css/gw-prism.css'), 'utf8'), fs.readFileSync(path.join(root, 'assets/img/prism/prism-hero.svg'), 'utf8')]);
    blobs.forEach((b, i) => {
      assert.ok(!/hutton/i.test(b), 'provider name in #' + i); assert.ok(!/\/tmp\/|scratchpad|C:\\\\|\/Users\//i.test(b), 'private path in #' + i);
      assert.ok(!/#\d{2}-\d{2,4}\b/.test(b), 'unit number in #' + i); assert.ok(!/"(lat|lng|latitude|longitude|x|y)"\s*:/i.test(b), 'coordinates in #' + i);
      assert.ok(!/(api[_-]?key|token|secret|password)\s*[:=]/i.test(b), 'credential-like text in #' + i);
    });
    const svg = fs.readFileSync(path.join(root, 'assets/img/prism/prism-hero.svg'), 'utf8');
    assert.ok(!/<script|href=|xlink|<image|url\(/i.test(svg), 'the hero SVG is self-contained drawing only');
  });

  console.log('The publication gate (fails closed)');
  await t('checkManifest refuses a draft, a test approval, a missing approval or a bad entry', () => {
    const bad = [(m) => { m.status = 'draft'; }, (m) => { m.approvalRef = 'TEST-ONLY'; }, (m) => { m.approvalRef = null; }, (m) => { m.schemaVersion = 'prism-public-v2'; }, (m) => { m.reports[0].sha256 = 'abc'; }, (m) => { m.reports[0].approved = false; }, (m) => { m.reports[0].path = '../x.json'; }];
    bad.forEach((f, i) => { const m = clone(MAN); f(m); assert.throws(() => P.checkManifest(m), undefined, 'case ' + i); });
    assert.ok(P.checkManifest(clone(MAN)));
  });
  await t('checkReport refuses another development\u2019s report, a draft release or a test approval', () => {
    const r = REP('kingsford-waterbay');
    assert.throws(() => P.checkReport(r, entry('hougang-central')));
    const d = clone(r); d.release.status = 'draft'; assert.throws(() => P.checkReport(d, entry('kingsford-waterbay')));
    const x = clone(r); x.provenance.approvalRef = 'TEST-1'; assert.throws(() => P.checkReport(x, entry('kingsford-waterbay')));
  });
  await t('load(): a report whose bytes differ from the manifest sha256 shows nothing; the real one loads', async () => {
    const real = global.fetch; let tamper = false;
    global.fetch = (u) => { const f = String(u).replace(/^\.\.\//, '').split('?')[0], b = fs.readFileSync(path.join(root, f), 'utf8'); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(b)), text: () => Promise.resolve(tamper && /reports\//.test(f) ? b.replace('6.4 resales', '9.4 resales') : b) }); };
    try {
      P._cache.manifest = null; P._cache.reports = {};
      const ok = await P.load('../', 'kingsford-waterbay'); assert.ok(ok && ok.assessment && ok.count === 17);
      P._cache.reports = {}; tamper = true;
      assert.strictEqual(await P.load('../', 'kingsford-waterbay'), null);
      assert.strictEqual(await P.load('../', 'jadescape'), null, 'not in the release');
      assert.strictEqual(await P.load('../', '../../etc'), null, 'not an id');
    } finally { global.fetch = real; P._cache.manifest = null; P._cache.reports = {}; }
  });

  console.log('What is shown');
  for (const id of ['kingsford-waterbay', 'hougang-central']) {
    await t(id + ': no score, no Ken\u2019s Take, no S3/S4 value, no unapproved metric value', () => {
      const md = MD(id), html = P.pageHtml(md, {}) + P.previewHtml(md, '../'), tx = text(html);
      assert.ok(!('score100' in md) && !('kenTake' in md));
      assert.ok(!/\/\s*100\b|PRISM Score|score100/i.test(html), 'a score'); assert.ok(!/Ken[\u2019']?s Take/i.test(tx), 'Ken\u2019s Take');
      assert.ok(!md.metrics['S.launchedUnsold2km'] && !md.metrics['S.pipeline2km']);
      assert.ok(!/data-gwp-metric="S\.(launchedUnsold|pipeline)2km"/.test(P.pageHtml(md, {})), 'S3/S4 rows');
      const r = REP(id); Object.values(r.pillars).flat().filter((m) => !P.shown(m, r)).forEach((m) => assert.ok(html.indexOf('data-gwp-metric="' + m.id + '"') < 0, m.id));
      assert.ok(!/1,268/.test(tx), 'the withheld pipeline count');
    });
  }
  await t('Kingsford Waterbay opening: the approved verdict, reveal, Why and Watch out, with bars and rank from the data', () => {
    const md = MD('kingsford-waterbay'), html = P.pageHtml(md, {}), tx = text(html), r = REP('kingsford-waterbay');
    [r.verdict.headline, r.reveal.headline, r.reveal.caveat].concat(r.verdict.why.map((x) => x.text), r.verdict.watchOut.map((x) => x.text)).forEach((s) => assert.ok(tx.indexOf(s) > -1, s));
    assert.ok(/data-gwp-ev="bars"/.test(html) && /<div class="gwp-fig"><b>6\.4<\/b>/.test(html) && /gwp-bv">4\.6</.test(html) && /<b>5th<em> of 25<\/em><\/b>/.test(html));
    assert.ok(/Oct 2024–Sep 2026 · project-wide · same zero baseline/.test(html));
    r.hiddenConnections.forEach((h) => assert.ok(tx.indexOf(h.text) > -1, h.text)); assert.ok(tx.indexOf(r.nextBuyerQuestion.text) > -1);
  });
  await t('Hougang Central opening: the approved mixed verdict and a two-value strip (72,532 and 1,149); no buyers or upgraders claimed', () => {
    const md = MD('hougang-central'), html = P.pageHtml(md, {}), tx = text(html), r = REP('hougang-central');
    assert.ok(tx.indexOf('An active resale market. Launch pricing will be the key test.') > -1 && /data-gwp-ev="strip"/.test(html));
    assert.ok(/<b>72,532<\/b>/.test(html) && /<b>1,149<\/b>/.test(html) && /Includes 1,104 rental flats/.test(html) && /20 comparable developments/.test(html));
    assert.ok(tx.indexOf('A count of flats, not of buyers or upgraders.') > -1);
    const claims = text(html.split('id="gwpDimsH"')[0]);   // the opening and the layers (the dimension headings carry Ken's general questions)
    assert.ok(!/potential buyers|future buyers|upgraders will|demand of \d/i.test(claims.replace('not of buyers or upgraders', '')));
    assert.deepStrictEqual(md.meta, ['Hougang', 'Awarded site'], 'no district made up for an awarded site');
  });
  await t('numbers are read from the data, not written in: changing a value changes the page', () => {
    const r = REP('kingsford-waterbay'), m = r.pillars.R.find((x) => x.id === 'R.turnover24'); m.value = 3.1;
    const html = P.pageHtml(MD('kingsford-waterbay', r), {}); assert.ok(/>3\.1</.test(html) && !/gwp-bv">6\.4/.test(html));
  });
  await t('Thomson Three (24 approved measures, no approved assessment): no preview, no page', () => {
    const md = MD('thomson-three'); assert.strictEqual(md.count, 24); assert.strictEqual(md.assessment, null);
    assert.strictEqual(P.previewHtml(md, '../'), ''); assert.strictEqual(P.pageHtml(md, {}), '');
  });
  await t('fictional fixtures: a mixed and an unfavourable verdict render as written, with no favourable wording or rating colour added', () => {
    ['mixed', 'unfavourable'].forEach((tone) => {
      const r = REP('kingsford-waterbay'); r.verdict.tone = tone; r.verdict.headline = 'FICTIONAL TEST ' + tone + ': resale activity below its comparable group';
      r.verdict.why = [{ text: 'FICTIONAL: ranked 22nd of 25', uses: ['R.peerRank24'] }];
      const html = P.pageHtml(MD('kingsford-waterbay', r), {}), tx = text(html);
      assert.ok(tx.indexOf('FICTIONAL TEST ' + tone) > -1 && tx.indexOf('FICTIONAL: ranked 22nd of 25') > -1);
      assert.ok(!/above-peer|strong buy|recommended|good investment/i.test(tx)); assert.ok(!/tone|favourable|gwp-(good|bad|green|red)/i.test(html.replace(/unfavourable/g, '')));
    });
  });
  await t('an unapproved Reveal or Verdict means no PRISM entry, even with approved metrics', () => {
    const r = REP('kingsford-waterbay'); r.verdict.status = 'withheld'; r.verdict.approval.state = 'proposed';
    const md = MD('kingsford-waterbay', r); assert.strictEqual(P.previewHtml(md, '../'), ''); assert.strictEqual(P.pageHtml(md, {}), '');
  });
  await t('S3/S4 stay hidden even if a metric were marked approved, while the release does not allow them', () => {
    const r = REP('kingsford-waterbay'), m = r.pillars.S.find((x) => x.id === 'S.pipeline2km'); m.approval.state = 'approved'; m.status = 'verified'; m.value = 1268; r.release.approvedMetrics.push('S.pipeline2km');
    assert.ok(!MD('kingsford-waterbay', r).metrics['S.pipeline2km'] && text(P.pageHtml(MD('kingsford-waterbay', r), {})).indexOf('1,268') < 0);
  });
  await t('sources and data periods: every shown measure has a period or its source\u2019s date; licence links kept', () => {
    ['kingsford-waterbay', 'hougang-central'].forEach((id) => {
      const md = MD(id), html = P.pageHtml(md, {});
      Object.values(md.metrics).forEach((m) => { const row = html.split('data-gwp-metric="' + m.id + '"')[1].split('</div>')[0]; assert.ok(/gwp-ms">[^<]+</.test(row), id + ' ' + m.id + ' has no period or source'); });
      assert.ok(/href="https:\/\/data\.gov\.sg\/open-data-licence"/.test(html) && /Not endorsed by URA/.test(html));
    });
  });

  console.log('The Research arrangement (31 Oct 2026)');
  await t('the switch: PRISM Analysis (#/prism/) and Property Data (#/p/), the current view marked', () => {
    const h = P.switchHtml(MD('kingsford-waterbay'), 'data', '../');
    assert.ok(/href="#\/prism\/kingsford-waterbay" data-gwp-view="prism">/.test(h) && /href="#\/p\/kingsford-waterbay" data-gwp-view="data" aria-current="page"/.test(h));
    assert.ok(/<span>PRISM Analysis<\/span>/.test(h) && /<span>Property Data<\/span>/.test(h) && /prism-mark\.png/.test(h));
    assert.ok(/aria-current="page"[^>]*>[\s\S]*?PRISM Analysis/.test(P.switchHtml(MD('kingsford-waterbay'), 'prism', '../')));
  });
  await t('the landing: an explanation only (PRISM, the five dimensions with Ken’s five questions), nothing to click; no development named in the code', () => {
    const html = P.landingHtml('../'), h = text(html);
    ['The bigger picture behind the numbers.', 'Five questions every property buyer should consider'].forEach((s) => assert.ok(h.indexOf(s) > -1, s));
    P.PILLARS.forEach(([k, n]) => assert.ok(h.indexOf(n) > -1 && h.indexOf(P.QUESTION[k]) > -1, n));
    assert.ok(!/<a |<button/.test(html), 'no links or buttons in the explanation');
    assert.ok(!/Kingsford|Hougang|Thomson|6\.4|72,532|1,149/.test(fs.readFileSync(path.join(root, 'assets/js/gw-prism.js'), 'utf8')), 'names and numbers come from the data, never the code');
  });
  await t('Hidden connections vs Supporting context follows the data: different datasets = connection; one dataset = context; ids and wording unchanged', () => {
    const kw = MD('kingsford-waterbay'), hc = MD('hougang-central'), r = REP('kingsford-waterbay');
    assert.deepStrictEqual(kw.hidden.map((h) => h.id + ':' + h.kind), ['HC1:context', 'HC2:connection']);
    assert.deepStrictEqual(hc.hidden.map((h) => h.id + ':' + h.kind), ['HC1:connection']);
    assert.deepStrictEqual(kw.hidden.map((h) => h.text), r.hiddenConnections.map((h) => h.text));
    const html = P.pageHtml(kw, {}); assert.ok(/data-gwp-hidden><p class="gwp-k">Hidden connections<\/p>/.test(html) && /data-gwp-context><p class="gwp-k">Supporting context<\/p>/.test(html));
  });
  await t('visitor wording: no internal status terms on the page; genuine evidence limits kept', () => {
    ['kingsford-waterbay', 'hougang-central'].forEach((id) => {
      // the page's own wording (the data's notes and limits are evidence qualifications, shown exactly as approved)
      const md = MD(id), h = text(P.pageHtml(md, {})), body = text(P.pageHtml(md, {}).replace(/<span class="gwp-mn">[^<]*<\/span>/g, '')).split('Sources, data periods and limits')[0];
      assert.ok(!/approved|in this release|withheld|not published|score100|pulse-v1/i.test(body), id + ': ' + (body.match(/.{40}(approved|in this release|withheld|not published|score100|pulse-v1).{20}/i) || [''])[0]);
      assert.ok(/Not assessed in this report/.test(h), id);
      REP(id).limitations.filter((l) => !/score100|^Only approved metrics/i.test(l)).forEach((l) => assert.ok(h.indexOf(l) > -1, 'limit kept: ' + l));
    });
  });
  await t('"Explore sales by size" under the Next buyer question: only where the development has resales (its Property Data sizes section)', () => {
    assert.ok(/data-gwp-question>[\s\S]*<a class="gwp-sizes" href="#\/p\/kingsford-waterbay" data-gwp-evidence="lgTypes" data-gwp-sizes>Explore sales by size/.test(P.pageHtml(MD('kingsford-waterbay'), {})));
    assert.ok(!/data-gwp-sizes/.test(P.pageHtml(MD('hougang-central'), {})));
  });
  await t('evidence links: each measure read from the development’s own records links to that Property Data section; none for a launch site', () => {
    const kw = P.pageHtml(MD('kingsford-waterbay'), {}), hc = P.pageHtml(MD('hougang-central'), {});
    const pairs = [...kw.matchAll(/data-gwp-metric="([^"]+)"[\s\S]*?(?:data-gwp-evidence="([a-zA-Z]+)"|<\/dd>)/g)].map((m) => m[1] + '>' + (m[2] || '-'));
    assert.ok(pairs.indexOf('R.turnover24>lgTx') > -1 && pairs.indexOf('R.rentalContracts12>lgRent') > -1 && pairs.indexOf('I.railStations>lgLoc') > -1 && pairs.indexOf('M.marketPulse>numbers') > -1, pairs.join(' '));
    assert.ok(pairs.indexOf('N.paResidents>-') > -1 && pairs.indexOf('S.recordedDwellingUnits2km>-') > -1, 'area-level measures carry no development evidence link');
    assert.ok(!/data-gwp-evidence/.test(hc), 'a launch site has no Property Data sections to point to');
  });
  await t('dimensions: Price Position (nothing assessed) says so and points to prices by size; no placeholder measure anywhere', () => {
    const kw = P.pageHtml(MD('kingsford-waterbay'), {}), p = kw.split('id="gwp-P"')[1].split('</section>')[0];
    assert.ok(/Not assessed in this report\./.test(p) && /data-gwp-evidence="lgTypes">See prices by size in Property Data/.test(p) && !/data-gwp-metric/.test(p));
    assert.ok(!/\[Approved measure|\[value\]|placeholder/i.test(kw));
    ['P', 'R', 'I', 'S', 'M'].forEach((k) => assert.ok(kw.indexOf('id="gwp-' + k + '"') > -1 && kw.indexOf('data-gwp-jump="' + k + '"') > -1, k));
  });
  await t('dimension headlines: verified figures from the release (never a count, score or judgement); unassessed says so', () => {
    const hl = (id) => MD(id).pillars.map((p) => P.headline(p).main);
    assert.deepStrictEqual(hl('kingsford-waterbay'), ['Not assessed in this report', '5th of 25 comparable developments · A resale in 24 of 24 months', 'Hougang MRT 1.1 km · 3 supermarkets within 1 km', '15,058 private homes within 2 km', '+2.3% same-size resale prices']);
    assert.deepStrictEqual(hl('hougang-central'), ['Not assessed in this report', '1,149 condo resales within 2 km', 'Hougang MRT 10 m · 6 supermarkets within 1 km', '19,996 private homes within 2 km', '72,532 HDB flats within 2 km']);
    const r = REP('kingsford-waterbay'); r.pillars.R.find((x) => x.id === 'R.peerRank24').value = 9;
    assert.ok(/^9th of 25/.test(P.headline(MD('kingsford-waterbay', r).pillars[1]).main), 'read from the data');
    const html = P.pageHtml(MD('kingsford-waterbay'), {});
    assert.ok(!/\d+ measures?</.test(html.split('id="gwpDimsH"')[1].split('data-gwp-sources')[0].replace(/<div class="gwp-dimp[\s\S]*?<\/div><\/section>/g, '')), 'no measure counts in the rows');
    assert.strictEqual((html.match(/class="gwp-dimp" [^>]*hidden>/g) || []).length, 5, 'all five closed to start');
    assert.ok(/data-gwp-all="open">Expand all/.test(html) && /data-gwp-all="close">Collapse all/.test(html));
  });
  await t('one dimension by address: #/prism/<id>/<p|r|i|s|m>', () => {
    assert.deepStrictEqual(R.parseHash('#/prism/kingsford-waterbay/r'), { view: 'prism', id: 'kingsford-waterbay', dim: 'R' });
    assert.deepStrictEqual(R.parseHash('#/prism/kingsford-waterbay/x'), { view: 'prism', id: 'kingsford-waterbay' });
    assert.strictEqual(R.buildHash({ view: 'prism', id: 'hougang-central', dim: 'M' }), '#/prism/hougang-central/m');
  });
  await t('"Calculate my purchase" opens the existing calculator with nothing passed to it', () => {
    const h = P.pageHtml(MD('kingsford-waterbay'), { root: '../' });
    assert.ok(/<a class="lg-btn" href="\.\.\/tools\/payment-planner\/" data-gwp-calc>Calculate my purchase<\/a>/.test(h));
  });
  await t('protected code untouched: the Map, Budget Search, calculators and the site search are not in this change', () => {
    const { execSync } = require('child_process');
    let changed = []; try { changed = execSync('git diff --name-only 135fe89', { cwd: root }).toString().split('\n').filter(Boolean); } catch (e) { return; }   // outside a git checkout (a ZIP), nothing to compare
    const prot = changed.filter((f) => /^(research\/map\/|assets\/js\/(kpt-map|kpt-discover|kpt-find|gw-nav|gw-fin3|gw-calc|gw-catalogue)|tools\/|data\/(?!prism\/))/.test(f) && !/^tools\/what-can-i-buy\/tests\//.test(f));
    assert.deepStrictEqual(prot, []);
  });

  console.log('Research routes and analytics');
  await t('#/prism/<id> is a route; anything else is unchanged', () => {
    assert.deepStrictEqual(R.parseHash('#/prism/kingsford-waterbay'), { view: 'prism', id: 'kingsford-waterbay' });
    assert.strictEqual(R.buildHash({ view: 'prism', id: 'hougang-central' }), '#/prism/hougang-central');
    assert.strictEqual(R.parseHash('#/prism/../x').view, 'home'); assert.strictEqual(R.parseHash('#/p/kingsford-waterbay').view, 'project');
  });
  await t('analytics: "prism" and "prism-full" only, with the development id; no text', () => {
    assert.deepStrictEqual(R.analytics('research_option_selected', { project_id: 'kingsford-waterbay', option: 'prism', headline: 'x' }), { project_id: 'kingsford-waterbay', option: 'prism' });
    assert.deepStrictEqual(R.analytics('research_option_selected', { project_id: 'kingsford-waterbay', option: 'prism-full' }), { project_id: 'kingsford-waterbay', option: 'prism-full' });
    assert.deepStrictEqual(R.analytics('research_option_selected', { option: 'Regular resale' }), {});
  });
  await t('Research loads PRISM\u2019s styles with the page (the landing grid never shifts) and its script when needed; no new navigation item', () => {
    const html = fs.readFileSync(path.join(root, 'research/index.html'), 'utf8');
    assert.ok(/<link rel="stylesheet" href="\.\.\/assets\/css\/gw-prism\.css\?v=[0-9a-f]{10}">/.test(html.split('</head>')[0]));
    assert.ok(/<template id="gwLazy-prism"><script src="\.\.\/assets\/js\/gw-prism\.js\?v=[0-9a-f]{10}"><\/script><\/template>/.test(html));
    assert.ok(/pz\.then\(\(md\) => \{ if \(md && md\.assessment && my === OV\.seq\) \{ clearOver\(\); location\.hash = '#\/prism\/' \+ id; \} \}\);/.test(html), 'the Research search opens PRISM for an assessed development');
    const nav = fs.readFileSync(path.join(root, 'assets/js/gw-nav.js'), 'utf8'); assert.ok(!/prism/i.test(nav));
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exitCode = fail ? 1 : 0;
})();
