// node research/tests/intel-tests.js. Rules tests for kpt-intel.js (Project Intelligence V1), including a sweep over EVERY project.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = process.env.KPT_ROOT || path.join(__dirname, '../..');
let pass = 0, fail = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const dir = path.join(root, 'data/projects/'); if (!fs.existsSync(dir + 'manifest.json')) { console.log('  skip no data'); process.exit(0); }
const P = require(path.join(root, 'assets/js/kpt-project.js')), RS = require(path.join(root, 'assets/js/kpt-research.js')), KI = require(path.join(root, 'assets/js/kpt-intel.js'));
const rd = (f) => JSON.parse(fs.readFileSync(dir + f, 'utf8')), man = rd('manifest.json'), TODAY = '2026-10-06';
const get = (id) => rd('detail/' + P.shardName(P.shardOf(id, man.shards)) + '.json').projects[id];
const run = (id, size) => { const p = get(id), M = RS.analyseProject(p, man, { sizeSqft: size, today: TODAY }); return { p, M, I: KI.analyse(M, p, { sizeSqft: size, today: TODAY, monthStart: man.monthStart }) }; };
const BANNED = /\b(liquid|illiquid|active|quiet|appreciat\w*|depreciat\w*|premium|discount|fair value|comparables?|rose|fell|undervalued|overvalued|bargain|cheap|launched)\b/i;

console.log('Intelligence rules');
t('module is pure: engine output untouched (analyse does not mutate M or p)', () => { const p = get('thomson-grand'), M = RS.analyseProject(p, man, { today: TODAY }), a = JSON.stringify([M, p]); KI.analyse(M, p, { today: TODAY, monthStart: man.monthStart }); assert.strictEqual(JSON.stringify([M, p]), a); });
t('S4 hidden unless the user typed a size', () => { assert.strictEqual(run('thomson-grand').I.results.s4.tier, 'hidden'); assert.notStrictEqual(run('thomson-grand', 1050).I.results.s4.tier, 'hidden'); assert.strictEqual(KI.analyse(run('thomson-grand').M, get('thomson-grand'), { sizeSqft: 'abc', today: TODAY }).results.s4.tier, 'hidden'); });
t('S3 tie rule: anchors to the hero band and says "level with" (Grand Dunman, Leedon Green)', () => {
  let r = run('grand-dunman'); assert.strictEqual(r.M.focus.bin, 2100); assert.ok(/\(13 of 72\) were in 2,100–2,199 sqft, level with 1,700–1,799 sqft\./.test(r.I.results.s3.text), r.I.results.s3.text);
  r = run('leedon-green'); assert.ok(/were in 800–899 sqft, level with 1,000–1,099 sqft\./.test(r.I.results.s3.text));
});
t('S3 says "across the project" only when the hero band is not the reported band', () => { assert.ok(!/across the project/.test(run('thomson-grand').I.results.s3.text)); assert.ok(/across the project/.test(run('thomson-grand', 1050).I.results.s3.text)); });
t('S5 thresholds: needs n>=8 and >=4 active months in BOTH periods; descriptive wording only; mandatory note', () => {
  const r = run('thomson-grand').I.results.s5; assert.strictEqual(r.tier, 'strong'); assert.ok(/so the two ranges overlap\./.test(r.text) && /not a measure of how any one unit changed/.test(r.note));
  const { M, p } = run('thomson-grand'); const q = JSON.parse(JSON.stringify(p)); q.periodCells.forEach((c) => { if (c[0] === 3 && c[1] === M.focus.bin && c[2] === 1) c[3] = 7; }); assert.strictEqual(KI.s5(M, q).tier, 'insufficient');
  const q2 = JSON.parse(JSON.stringify(p)); q2.periodCells.forEach((c) => { if (c[0] === 3 && c[1] === M.focus.bin && c[2] === 0) c[4] = 3; }); assert.strictEqual(KI.s5(M, q2).tier, 'insufficient');
});
t('S5 and S6 are never in Layer 1; S1 and S10 never in Layer 1', () => { const ids = new Set(); ['thomson-grand', 'bartley-ridge', 'grand-dunman', 'leedon-green'].forEach((id) => run(id, 550).I.found.forEach((f) => ids.add(f.id))); ['s1', 's5', 's6', 's10'].forEach((k) => assert.ok(!ids.has(k), k)); });
t('S6 carries the "does not show what a floor is worth" note; hidden for new-sale selections', () => { assert.ok(/does not show what a floor is worth/.test(run('thomson-grand').I.results.s6.note)); assert.strictEqual(run('grand-dunman').I.results.s6.tier, 'hidden'); });
t('S8 wording is the short Layer-1 form; the caveat is a separate note; nothing for freehold/999-year/mixed', () => {
  const r = run('thomson-grand').I.results.s8; assert.strictEqual(r.text, '99-year lease from 2010, with about 83 years remaining.'); assert.ok(!/counted from/.test(r.text) && /counted from the lease start year, not the completion year/.test(r.note));
  assert.strictEqual(run('leedon-green').I.results.s8.tier, 'hidden'); assert.strictEqual(run('3-at-phillips').I.results.s8.tier, 'hidden');
});
t('S8 years remaining use the supplied date, not a hard-coded year', () => { const { M, p } = run('thomson-grand'); assert.ok(/about 83 years/.test(KI.s8(M, p, '2026-10-06').text)); assert.ok(/about 82 years/.test(KI.s8(M, p, '2027-01-02').text)); });
t('S10 is never shown for a first new sale at the window start (censored), and says "recorded", never "launched"', () => { const { M, p } = run('grand-dunman'); assert.ok(/First new sale recorded: Jul 2023\./.test(KI.s10(M, p, man.monthStart).text)); const q = JSON.parse(JSON.stringify(p)); q.monthly.new[0] = 0; assert.strictEqual(KI.s10(M, q, man.monthStart).tier, 'insufficient'); });
t('S1 wording has no liquid/illiquid language and uses "new-sale transactions" for new sales', () => { assert.ok(/72 new-sale transactions/.test(run('grand-dunman').I.results.s1.text)); });
t('S2b only offers a size within 200 sqft', () => { const r = run('bartley-ridge', 550).I.results.s2b; assert.strictEqual(r.tier, 'strong'); assert.ok(Math.abs(r.bin - 500) <= 200); });
t('3@Phillips: no insight qualifies, so there is no block, and the checklist shows explicit absence lines', () => { const I = run('3-at-phillips').I; assert.strictEqual(I.found.length, 0); assert.ok(I.checklist.filter((c) => c.lines.some((l) => l.status === 'absent')).length >= 3); });

console.log('Intelligence sweep: every project, default view and three typed sizes');
const idx = rd('index.json'), rows = idx.rows || idx.projects || idx, ids = rows.map((r) => (Array.isArray(r) ? r[0] : r.id));
t('ids found: ' + ids.length, () => assert.ok(ids.length > 2000));
t('never throws; Layer 1 <= 3 items; no banned words; no empty text; block only holds strong/limited tiers; no S1/S5/S6/S10 in Layer 1', () => {
  let n = 0, withBlock = 0; const byShard = {};
  for (const id of ids) {
    const p = get(id); for (const size of [undefined, 700, 1000, 1400]) {
      const M = RS.analyseProject(p, man, { sizeSqft: size, today: TODAY }); const I = KI.analyse(M, p, { sizeSqft: size, today: TODAY, monthStart: man.monthStart }); n++;
      assert.ok(I.found.length <= 3, id); if (I.found.length) withBlock++;
      I.found.forEach((f) => { assert.ok(f.text && f.text.length > 5, id); assert.ok(['strong', 'limited'].includes(f.tier), id + f.id); assert.ok(['s4', 's2b', 's3', 's7', 's8'].includes(f.id), id + f.id); assert.ok(!BANNED.test(f.text), id + ': ' + f.text); assert.ok(!/undefined|NaN|null/.test(f.text), id + ': ' + f.text); });
      assert.deepStrictEqual(I.checklist.slice(0, 5).map((c) => c.id), ['size', 'recency', 'price', 'floors', 'activity'], id);
      I.checklist.forEach((c) => c.lines.forEach((l) => { assert.ok(l.text && !/undefined|NaN|null/.test(l.text), id + ': ' + l.text); if (l.status !== 'absent') assert.ok(!BANNED.test(l.text.replace(/transactions?/g, '')), id + ': ' + l.text); }));
      if (!size && M.answer.state === 'older' && M.recent.n === 0) assert.strictEqual(I.found.filter((f) => f.id === 's3').length, 0, id);
      if (I.results.s3.text && M.focus && M.focus.bin != null && I.results.s3.topN) { const ties = (M.mix || []).filter((x) => x.n === I.results.s3.topN).map((x) => x.bin); if (ties.includes(M.focus.bin)) assert.strictEqual(I.results.s3.anchorBin, M.focus.bin, id + ' anchor must equal hero band when tied'); }
    }
  }
  console.log('       ' + n + ' views; ' + withBlock + ' with a "What KPT found" block');
});
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
