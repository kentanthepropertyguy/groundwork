// node research/tests/page-render-tests.js — runs the REAL research/index.html script (router, loaders, renderers) against the REAL generated data
// in a stubbed DOM, and checks what the page would actually display. This is the test that catches "valid result shown as 'couldn't load'":
// the pure-module tests cannot see page render errors. KPT_ROOT=/path/to/site to test another build. Skipped if data/projects is absent.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = process.env.KPT_ROOT || path.join(__dirname, '../..');
let pass = 0, fail = 0;
const t = async (n, f) => { try { await f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
if (!fs.existsSync(path.join(root, 'data/projects/manifest.json'))) { console.log('  skip no data/projects'); process.exit(0); }

const html = fs.readFileSync(path.join(root, 'research/index.html'), 'utf8');
const inline = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const lib = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function el(store) {
  const e = { innerHTML: '', textContent: '', value: '', href: '', dataset: {}, style: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, focus() {}, scrollIntoView() {}, setAttribute() {}, getAttribute: () => null, appendChild() {}, remove() {},
    querySelector: () => el(), querySelectorAll: () => [], closest: () => null };
  return e;
}
// Render one route in a fresh page. Returns {html, errors, title}.
async function render(hash, opts) {
  opts = opts || {};
  const els = {}, errors = [], app = el();
  const store = {};
  const document = { title: '', body: { dataset: {}, classList: { add() {}, remove() {} } }, head: { appendChild() {} }, createElement: () => el(), getElementById: (id) => (id === 'app' ? app : (els[id] = els[id] || el())), querySelector: () => el(), querySelectorAll: () => [], addEventListener() {} };
  const location = { hash, href: 'http://localhost/research/index.html' + hash, pathname: '/research/index.html' };
  const events = [];
  const fetch = (u) => { const p = new URL(u, 'http://localhost/').pathname; const f = path.join(root, p); return fs.promises.readFile(f, 'utf8').then((s) => ({ ok: true, status: 200, json: () => JSON.parse(s) }), () => ({ ok: false, status: 404, json: () => { throw new Error('404'); } })); };
  const ctx = { document, location, fetch, URL, console: { log() {}, info() {}, warn() {}, error: (...a) => errors.push(a.map(String).join(' ').slice(0, 300)) }, setTimeout, clearTimeout, Promise, Date, JSON, Math, Array, Object, String, Number, RegExp, Error, Set, Map, encodeURIComponent, decodeURIComponent, isNaN, parseInt, parseFloat,
    sessionStorage: { getItem: () => (opts.size || null), setItem() {}, removeItem() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  ctx.window = ctx; ctx.self = ctx; ctx.addEventListener = () => {}; ctx.scrollTo = () => {}; ctx.innerWidth = 390; ctx.dataLayer = []; ctx.navigator = { userAgent: 'node' };
  ctx.KPT = { setContext() {}, track: (e, p) => events.push([e, p]), waLink: (o) => 'https://wa.me/x?text=' + encodeURIComponent((o && o.message) || '') };
  vm.createContext(ctx);
  ['assets/js/kpt-project.js', 'assets/js/kpt-research.js', 'data/research/config.js'].forEach((f) => vm.runInContext(lib(f), ctx, { filename: f }));
  if (opts.staleScript) ctx.KPT_RESEARCH.BUILD = opts.staleScript;
  vm.runInContext(inline, ctx, { filename: 'research/index.html' });
  for (let i = 0; i < 200; i++) { await new Promise((r) => setTimeout(r, 15)); if (app.innerHTML && !/kpr-skel/.test(app.innerHTML)) break; }
  await new Promise((r) => setTimeout(r, 30));
  return { html: app.innerHTML, errors, title: document.title, events, wa: els.wa && els.wa.href };
}
const CANT = /couldn’t load|couldn't load|couldn’t find/;

(async () => {
  console.log('Page render: AMO Residence vs Thomson Impressions (no shared sale type)');
  for (const h of ['#/compare/amo-residence/thomson-impressions', '#/compare/thomson-impressions/amo-residence']) {
    await t(h + ' renders the valid "no like-for-like evidence" page, not the load-error page', async () => {
      const r = await render(h);
      assert.ok(!CANT.test(r.html), 'shows the load-error page. Console: ' + r.errors.join(' | '));
      assert.strictEqual(r.errors.length, 0, r.errors.join(' | '));
      assert.ok(/No like-for-like transaction evidence found/.test(r.html));
      assert.ok(/No shared sale type/.test(r.html)); assert.ok(/AMO Residence/.test(r.html) && /Thomson Impressions/.test(r.html));
      assert.ok(/resale sales/.test(r.html) && /new sales and sub-sales/.test(r.html));
      assert.ok(!/id="interp"/.test(r.html), 'no interpretation section for a no-evidence page');
    });
  }
  await t('same routes with a saved size focus (sessionStorage) still render, and with a sale suffix in the hash', async () => {
    for (const h of ['#/compare/amo-residence/thomson-impressions', '#/compare/thomson-impressions/amo-residence', '#/compare/amo-residence/thomson-impressions/resale', '#/compare/amo-residence/thomson-impressions/new']) for (const size of ['1000', '2600', 'abc']) { const r = await render(h, { size }); assert.ok(!CANT.test(r.html) && /No like-for-like/.test(r.html), h + ' size=' + size + ' ' + r.errors.join('|')); }
  });
  await t('analytics for this page carry only project IDs, overlap class (no sale type or window), and nothing typed', async () => {
    const r = await render('#/compare/amo-residence/thomson-impressions'); const ev = r.events.find((x) => x[0] === 'research_comparison_viewed'); assert.ok(ev, JSON.stringify(r.events));
    assert.strictEqual(JSON.stringify(Object.keys(ev[1]).sort().map((k) => [k, ev[1][k]])), JSON.stringify([['overlap', 'none'], ['project_a', 'amo-residence'], ['project_b', 'thomson-impressions']]));
  });
  await t('WhatsApp link names the two projects only', async () => { const r = await render('#/compare/amo-residence/thomson-impressions'); assert.ok(/AMO%20Residence%20vs%20Thomson%20Impressions/.test(r.wa), r.wa); });

  await t('stale-copy guard: a page/script build mismatch shows a refresh message, never the misleading load-error page', async () => {
    const r = await render('#/compare/amo-residence/thomson-impressions', { staleScript: 'old' }); assert.ok(/needs a refresh/.test(r.html) && !CANT.test(r.html), r.html.slice(0, 120));
    const ok = await render('#/compare/amo-residence/thomson-impressions'); assert.ok(!/needs a refresh/.test(ok.html));
  });
  await t('page and script carry the same build stamp, and assets and data requests are versioned with it', async () => {
    const R = require(path.join(root, 'assets/js/kpt-research.js')), m = html.match(/const BUILD = '([^']+)'/); assert.ok(m && m[1] === R.BUILD, 'page ' + (m && m[1]) + ' vs script ' + R.BUILD);
    ['kpt-research.css', 'kpt-project.js', 'kpt-research.js', 'config.js'].forEach((f) => assert.ok(new RegExp(f.replace('.', '\\.') + '\\?v=' + R.BUILD.replace(/\./g, '\\.')).test(html), f + ' not versioned'));
    assert.ok(/'v=' \+ BUILD/.test(html));
  });
  console.log('Page render: other comparisons and projects still render (no regressions)');
  const GOOD = [['#/compare/thomson-impressions/thomson-three', /Good recent overlap for comparison/], ['#/compare/thomson-three/thomson-impressions', /Good recent overlap for comparison/], ['#/compare/thomson-grand/thomson-impressions', /Limited recent overlap/], ['#/compare/bartley-ridge/botanique-at-bartley', /What the numbers suggest/]];
  for (const [h, re] of GOOD) await t(h + ' renders', async () => { const r = await render(h); assert.ok(!CANT.test(r.html) && re.test(r.html), r.errors.join('|')); assert.strictEqual(r.errors.length, 0); });
  await t('project pages render', async () => { for (const h of ['#/p/thomson-grand', '#/p/amo-residence', '#/p/amo-residence/new', '#/p/thomson-impressions']) { const r = await render(h); assert.ok(!CANT.test(r.html) && /<h1/.test(r.html), h + ' ' + r.errors.join('|')); } });
  await t('genuinely missing data still gets the load-error page', async () => { const r = await render('#/compare/amo-residence/does-not-exist'); assert.ok(/couldn’t load that comparison/.test(r.html)); const p = await render('#/p/does-not-exist'); assert.ok(/couldn’t find that project/.test(p.html)); });

  console.log('Page render: every kind of no-shared-evidence pair on real data');
  await t('~60 real pairs across sale-type shapes (new-only, sub-sale, resale-only, thin) all render without the load-error page, both orders', async () => {
    const P = require(path.join(root, 'assets/js/kpt-project.js')), idx = JSON.parse(fs.readFileSync(path.join(root, 'data/projects/index.json'), 'utf8')), rows = idx.rows.map((x, k) => P.rowObject(idx, k));
    const pick = (f, k) => rows.filter(f).sort((a, b) => b.n - a.n).slice(0, k).map((x) => x.id);
    const ids = [].concat(pick((x) => x.new > 0 && !x.resale && !x.sub, 4), pick((x) => x.sub > 0, 3), pick((x) => x.resale > 0 && !x.new && !x.sub, 4), pick((x) => x.n <= 2, 2)); let n = 0;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j += 2) { for (const h of ['#/compare/' + ids[i] + '/' + ids[j], '#/compare/' + ids[j] + '/' + ids[i]]) { const r = await render(h); n++; assert.ok(!CANT.test(r.html) && /id="verdict"/.test(r.html), h + ' ' + r.errors.join('|')); } }
    assert.ok(n >= 40, 'only ' + n);
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
