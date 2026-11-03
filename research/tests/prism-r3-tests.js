/* PRISM r3 + Registry v2 (GW-PRISM-R3-SCHEMA-20261103-01): the page's own loading path, in node, against the release files.
   Run from the site folder:  node research/tests/prism-r3-tests.js
   The real loader (load -> index11 -> shard11 -> report) runs with fetch served from data/ and the browser's SHA-256 (WebCrypto).
   1 loading: a full and a partial report each load through root + one shard + one report; the five protected reports load and keep their
     pages; every non-page state (pending, unavailable, new launch) loads no report and has no page
   2 redirects (none in this release; the rule is checked on a derived copy, re-pinned here only): a redirect to a page goes there (one hop);
     a redirect to a redirect, to a non-page entry or to a missing id goes nowhere
   3 fail closed in the loader: a changed shard or report, a pending item, an r2 root served as the index: no page, V1 pages exactly V1 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SITE = path.resolve(__dirname, '../..');
const MOD = path.join(SITE, 'assets/js/gw-prism.js');
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8'), sha = (t) => crypto.createHash('sha256').update(t).digest('hex'), key = (id) => sha(id).charAt(0);
// a fresh copy of the renderer (its caches are per visit), with fetch served from the site folder, optionally overridden per path
function visit(over, pins) {
  delete require.cache[require.resolve(MOD)];
  const G = require(MOD); Object.assign(G.V11, pins || {});
  const log = [];
  global.fetch = (u) => { const p = String(u).split('?')[0].replace(/^(\.\.\/)+/, ''); log.push(p);
    const body = over && p in over ? over[p] : (fs.existsSync(path.join(SITE, p)) ? read(p) : null);
    return Promise.resolve(body === null ? { ok: false, status: 404, text: () => Promise.resolve(''), json: () => Promise.reject(new Error('404')) } : { ok: true, status: 200, text: () => Promise.resolve(body), json: () => Promise.resolve(JSON.parse(body)) }); };
  return { G, log };
}
const ix = JSON.parse(read('data/prism/v1.1/index.json')), shard = (k) => JSON.parse(read('data/prism/v1.1/index/' + k + '.json'));
const all = []; ix.shards.forEach((s) => shard(s.key).entries.forEach((e) => all.push(e)));
const byState = (s) => all.filter((e) => e.state === s);
(async () => {
  // ---- 1 loading
  { const { G, log } = visit(); const md = await G.load('../', 'bartley-ridge');
    check('a full report (Bartley Ridge) loads its page through index.json, one shard and its report, nothing else of the release', G.hasPage(md) && md.mode === 'profile' && JSON.stringify(log.filter((p) => p.indexOf('data/prism/v1.1/') === 0)) === JSON.stringify(['data/prism/v1.1/index.json', 'data/prism/v1.1/index/' + key('bartley-ridge') + '.json', 'data/prism/v1.1/reports/bartley-ridge.json']), log); }
  { const id = byState('partial')[0].id, { G } = visit(), md = await G.load('../', id); check('a partial report (' + id + ') loads its page', G.hasPage(md) && md.mode === 'profile'); }
  { const { G } = visit(), ids = ['kingsford-waterbay', 'hougang-central', 'thomson-three', 'hundred-palms-residences', 'the-quinn'], mds = await Promise.all(ids.map((id) => G.load('../', id)));
    check('the five protected reports load: two V1 assessment pages, three evidence-profile pages, each marked curated', mds.every((x) => G.hasPage(x)) && mds.map((x) => x.mode).join() === 'assessment,assessment,profile,profile,profile' && mds.every((x) => x.v11 && x.v11.curated)); }
  { const picks = ['pending', 'unavailable', 'new_launch'].map((s) => byState(s)[0]).filter(Boolean), { G, log } = visit(), mds = await Promise.all(picks.map((e) => G.load('../', e.id)));
    check('pending, unavailable and new-launch ids (' + picks.map((e) => e.id).join(', ') + '): no report fetched and no page', mds.every((x) => !G.hasPage(x)) && !log.some((p) => /\/reports\//.test(p) && picks.some((e) => p.indexOf(e.id) >= 0))); }
  // ---- 2 redirects (derived copy, re-pinned for this test only)
  const derive = (edits) => {
    const shards = {}, files = {};
    edits.forEach(([id, to]) => { const k = key(id); shards[k] = shards[k] || shard(k); const e = shards[k].entries.find((x) => x.id === id);
      Object.keys(e).forEach((f) => { if (['id', 'name', 'kind'].indexOf(f) < 0) delete e[f]; }); e.state = 'redirect'; e.to = to; });
    const root = JSON.parse(JSON.stringify(ix)), st = {}; Object.keys(shards).forEach((k) => { const t = JSON.stringify(shards[k]); files['data/prism/v1.1/index/' + k + '.json'] = t; root.shards.find((s) => s.key === k).sha256 = sha(t); });
    Object.keys(shards).forEach((k) => {}); all.forEach((e) => { const red = edits.some(([id]) => id === e.id); const s = red ? 'redirect' : e.state; st[s] = (st[s] || 0) + 1; });
    root.counts.states = st; root.counts.reports = (st.full || 0) + (st.partial || 0);
    const rt = JSON.stringify(root); files['data/prism/v1.1/index.json'] = rt; return { files, pins: { INDEX: sha(rt) } };
  };
  const [p1, p2, p3] = byState('pending'), un = byState('unavailable')[0];
  { const d = derive([[p1.id, 'bartley-ridge']]), { G } = visit(d.files, d.pins);
    check('a redirect to a development with a page: followed to it (one hop)', (await G.redirect11('../', p1.id)) === 'bartley-ridge' && !G.hasPage(await G.load('../', p1.id))); }
  { const d = derive([[p1.id, p2.id], [p2.id, 'bartley-ridge']]), { G } = visit(d.files, d.pins);
    check('a redirect to a redirect: not followed (no page)', (await G.redirect11('../', p1.id)) === null); }
  { const d = derive([[p1.id, un.id]]), { G } = visit(d.files, d.pins);
    check('a redirect to an id without a page (unavailable): not followed', (await G.redirect11('../', p1.id)) === null); }
  { const d = derive([[p3.id, 'not-a-registry-id']]), { G } = visit(d.files, d.pins);
    check('a redirect to an id that does not exist: not followed', (await G.redirect11('../', p3.id)) === null); }
  { const { G } = visit(); check('without the re-pinned copy, the release has no redirects: nothing is followed', (await G.redirect11('../', p1.id)) === null && byState('redirect').length === 0); }
  // ---- 3 fail closed in the loader
  const kwShard = 'data/prism/v1.1/index/' + key('kingsford-waterbay') + '.json';
  // tt: whether Thomson Three (in another shard) should still have its page
  const v1only = async (over, tt) => { const { G } = visit(over), kw = await G.load('../', 'kingsford-waterbay'), t = await G.load('../', 'thomson-three'); return G.hasPage(kw) && kw.mode === 'assessment' && kw.v11 === null && G.hasPage(t) === tt; };
  const sameShard = key('kingsford-waterbay') === key('thomson-three');
  check('a changed shard: Kingsford Waterbay is exactly V1 (no V1.1 part); developments in other shards unaffected', await v1only({ [kwShard]: read(kwShard).replace('"items": 17', '"items": 18') }, !sameShard));
  check('a pending item in a report: that report is refused (Kingsford Waterbay exactly V1); other reports unaffected', await v1only({ 'data/prism/v1.1/reports/kingsford-waterbay.json': read('data/prism/v1.1/reports/kingsford-waterbay.json').replace('"state": "approved"', '"state": "pending"') }, true));
  check('the r2 root served as the index (data rolled back without the page): no V1.1 page anywhere', await v1only({ 'data/prism/v1.1/index.json': read('research/tests/fixtures/prism-v11-r2-index.json') }, false));
  console.log('prism-r3-tests: %d passed, %d failed', ok, fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL', e && e.stack); process.exit(1); });
