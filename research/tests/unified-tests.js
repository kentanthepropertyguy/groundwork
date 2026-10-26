// node research/tests/unified-tests.js   Wiring checks for the unified Research page: the data versions it passes to the hosted Budget form equal the Budget page's, every lazy loader exists, and the old Browse address leads into Research.
const fs = require('fs'), path = require('path'), assert = require('assert'), root = path.join(__dirname, '../..');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ' :: ' + String(e.message).slice(0, 240)); } };
const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const R = rd('research/index.html'), W = rd('tools/what-can-i-buy/index.html'), MAP = rd('research/map/index.html');
const ver = (s, k) => { const m = new RegExp(k + "\\s*[:=]\\s*'([^']*)'").exec(s) || new RegExp(k + '[^\\n]*?\\?v=([0-9a-f]{10})').exec(s); return m && m[1]; };
t('Research passes the Budget form the same data versions as the Budget page', () => {
  ['FIND_URL', 'INV_URL', 'SITES_URL', 'BEDS_URL'].forEach((k) => {
    const a = new RegExp(k + ":\\s*[^,}]*?\\?v=([0-9a-f]{10})").exec(R), b = new RegExp(k + ":\\s*[^,}]*?\\?v=([0-9a-f]{10})").exec(W);
    assert.ok(a && b, k + ' present in both'); assert.strictEqual(a[1], b[1], k);
  });
});
t('Research, the Budget page and the Map page use one Map version', () => {
  const m = /MAPV = '([^']+)'/.exec(R), w = /MAP_V: '([^']+)'/.exec(W), p = /kpt-map-core\.js\?v=([\d.-]+)/.exec(MAP);
  assert.ok(m && w && p); assert.strictEqual(m[1], w[1]); assert.strictEqual(m[1], p[1]);
});
t('every lazy loader the page asks for has its template, and each template loads something', () => {
  const used = Array.from(R.matchAll(/lazy\('([\w-]+)'\)/g)).map((x) => x[1]);
  assert.ok(used.length >= 4);
  new Set(used).forEach((n) => { const m = new RegExp('<template id="gwLazy-' + n + '">([\\s\\S]*?)</template>').exec(R); assert.ok(m && /(src|href)="/.test(m[1]), n); });
});
t('the hosted Budget form leaves the results to the Budget page and carries no typed value anywhere', () => {
  const u = rd('assets/js/kpt-discover-ui.js');
  assert.ok(/sessionStorage\.setItem\('kpt\.find\.from', 'research'\)/.test(u)); assert.ok(/EMB\) return/.test(u) || /if \(EMB\)/.test(u));
  assert.ok(!/location\.href = BASE \+ 'tools\/what-can-i-buy\/' \+/.test(u), 'no query string on the hand-off');
});
t('the two Research choices are #/ and #/budget (the old #/prices still opens the property search), and the old Browse address leads in', () => {
  const l = rd('assets/js/kpt-lg.js'); ['dev', 'budget'].forEach((o) => assert.ok(l.indexOf("['" + o + "',") > -1, o)); assert.ok(l.indexOf("['prices',") === -1, 'only two choices'); assert.ok(/HDB, condo or landed — prices, past sales, rents and comparisons\./.test(l)); assert.ok(!/Your entries stay when you switch/.test(l));
  assert.ok(/research\/#\/browse/.test(rd('projects/index.html')));
  const n = rd('assets/js/gw-nav.js'); assert.ok(/research\/#\/prices/.test(n) && /research\/#\/budget/.test(n) && /research\/#\/browse/.test(n));
});
t('the Map page has no footer or long sources section, and keeps its sources, licence and credentials behind one link', () => {
  assert.ok(!/<footer/.test(MAP) && !/kpm-sources/.test(MAP)); assert.ok(/id="sources"/.test(MAP) && /Open Data Licence/.test(MAP) && /R007903D/.test(MAP) && /privacy/.test(MAP));
});
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
