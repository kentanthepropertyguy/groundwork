// node research/tests/launch-search-tests.js
// Research search reads the shared register of launches and awarded sites (data/map/upcoming.json), so a project with no sales is never a dead end.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..'), L = require(path.join(root, 'assets/js/kpt-lg.js'));
const items = JSON.parse(fs.readFileSync(path.join(root, 'data/map/upcoming.json'), 'utf8')).items;
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('  ok   ' + n); } catch (e) { console.log('  FAIL ' + n + ' :: ' + e.message); process.exitCode = 1; } };
const ids = (q) => L.matchLaunches(items, q, 5).map((x) => x.id);
t('Serra, Serra Residences and The Serra Residences are one project', () => { ['serra', 'Serra Residences', 'The Serra Residences', 'serra novena', '7 Bassein Road'].forEach((q) => assert.deepStrictEqual(ids(q), ['the-serra-residences'], q)); });
t('every registered project is found by its own name and by each alias', () => { items.forEach((it) => [it.name].concat(it.aliases || []).forEach((n) => { if (n.length >= 3) assert(ids(n).includes(it.id), n); })); });
t('an alias finds the HDB site', () => { assert.deepStrictEqual(ids('chencharu central'), ['chencharu-close']); });
t('accents, case and apostrophes do not matter', () => { assert.deepStrictEqual(ids('  SERRA   residences '), ['the-serra-residences']); });
t('too short or unknown text finds nothing', () => { assert.deepStrictEqual(ids('se'), []); assert.deepStrictEqual(ids('zzzzqq'), []); });
t('a launch row leads to the Map, says no sales yet, and never shows a price', () => {
  const h = L.launchRows(L.matchLaunches(items, 'serra', 1), false);
  assert(/data-launch="map\/#p=the-serra-residences"/.test(h) && /No sales recorded yet/.test(h) && /View on Map/.test(h) && !/\$\s?\d/.test(h) && !/No transactions found/.test(h) && /New launch/.test(h) && /Far East Organization/.test(h), h);
});
t('a launch group sits apart from the transaction results with its own heading', () => { assert(/with no sales recorded yet<\/p>/.test(L.launchRows(L.matchLaunches(items, 'serra', 1), true))); assert(!/with no sales recorded yet<\/p>/.test(L.launchRows(L.matchLaunches(items, 'serra', 1), false))); });
t('nothing found gives no markup', () => { assert.strictEqual(L.launchRows([], false), ''); });
t('a GLS site names its agency and says when it has no project name', () => { assert(/Awarded HDB site/.test(L.launchRows(L.matchLaunches(items, 'chencharu', 1), false))); assert(/no project name yet/.test(L.launchRows(L.matchLaunches(items, 'peck hay', 1), false))); });
console.log(`\n${ok} passed`);
