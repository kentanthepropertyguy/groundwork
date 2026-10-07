// node tools/what-can-i-buy/tests/priority-tests.js : V10.3.1, "What matters most?" must change the shortlist. Real shipped data.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../../');
const ENG = require(root + 'assets/js/kpt-engine.js'), FI = require(root + 'assets/js/kpt-find.js');
const rj = (f) => JSON.parse(fs.readFileSync(root + f, 'utf8'));
const ix = FI.prepare(rj('data/projects/find.json')), IX = rj('data/market/route-stats/index.json'), E = ENG.DEFAULTS, invDoc = rj('data/projects/inventory.json');
const inv = () => FI.prepareInventory(invDoc, Date.parse(invDoc.checkedAt) + 3600e3);
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message.split('\n')[0]); } };
const step = (b) => { const sb = ENG.budgetStep(b, E); return ENG.pickStep(rj('data/market/route-stats/shard-' + ENG.shardStart(sb, E) + '.json'), sb); };
const BUDGETS = [1500000, 2500000, 2600000, 4000000];
function run(b, o) {
  o = o || {}; const st = step(b), openTo = o.openTo || 'both', pr = o.priorities || [];
  const sz = o.size ? { lo: o.size[0], hi: o.size[1], source: 'explicit', line: 'x' } : FI.sizeWindow(null, st, openTo, { space: pr.indexOf('space') > -1 });
  return FI.shortlist(ix, { budget: b, openTo, size: sz, districts: o.districts || [], text: '', freehold: !!o.freehold, loc: { districts: o.districts || [] }, pct: FI.T.budgetPct, answers: { where: 'flexible', size: 'not-sure', priorities: pr }, typical: FI.inferSize(st, openTo), inv: o.noInv ? null : inv() });
}
const names = (r, sale) => { const g = r.groups.find((x) => x.sale === sale); return g ? g.cards.concat(g.more || []).map((c) => c.name) : []; };
const sig = (r) => JSON.stringify([r.groups.map((g) => [g.sale, g.cards.map((c) => c.name), (g.more || []).map((c) => c.name)]), r.total, r.eligible, r.orderLine, r.unsupported]);
const segOf = (name) => { const p = ix.projects.find((x) => FI.displayName(x.name) === name); return p && p.seg; };
const RR = { CCR: 0, RCR: 1, OCR: 2 };

console.log('No priority: unchanged');
t('no priorities: no effect lines, the original order line, nothing added', () => BUDGETS.forEach((b) => { const r = run(b); assert.strictEqual(r.effect, undefined); assert.ok(/ordered|Listed by whether|Resale: listed by how much recent evidence/.test(r.orderLine) && !/priorities/.test(r.orderLine)); }));
t('Freehold alone is still just the filter: no effect lines, same order within the filtered set', () => BUDGETS.forEach((b) => { const r = run(b, { freehold: true, priorities: ['freehold'] }); assert.strictEqual(r.effect, undefined); }));

console.log('Closer to the centre');
t('ranks CCR, then RCR, then OCR among the same eligible projects (resale and new launch, within budget-fit tiers)', () => BUDGETS.forEach((b) => {
  const a = run(b), c = run(b, { priorities: ['location'] });
  assert.deepStrictEqual(c.eligible, a.eligible);                                   // nothing hidden
  const rs = names(c, 'resale').map(segOf).map((s) => RR[s]); assert.deepStrictEqual(rs, rs.slice().sort((x, y) => x - y));
}));
t('the resale top results visibly change at $1.5m, $2.5m and $2.6m, and are all Core Central where there are enough', () => [1500000, 2500000, 2600000].forEach((b) => {
  const a = run(b), c = run(b, { priorities: ['location'] });
  assert.notDeepStrictEqual(names(c, 'resale').slice(0, 3), names(a, 'resale').slice(0, 3));
  c.groups.find((g) => g.sale === 'resale').cards.forEach((card) => assert.strictEqual(segOf(card.name), 'CCR', card.name));
}));
t('Huttons budget-fit tiers stay ahead of the preference: a project that cannot match the budget never outranks one that can', () => BUDGETS.forEach((b) => ['location', 'space', 'newer'].forEach((p) => {
  const st = step(b), sz = FI.sizeWindow(null, st, 'both', { space: p === 'space' });
  const o = { budget: b, pct: FI.T.budgetPct, lo: sz.lo, hi: sz.hi, districts: [], freehold: false, text: '', openTo: 'both', inv: inv(), sizeSource: 'inferred', _uraIds: {}, prefs: [p] }; ix.projects.forEach((x) => { o._uraIds[x.id] = 1; });
  const list = FI.newCandidates(ix, o), tiers = list.map((c) => c.tier); assert.deepStrictEqual(tiers, tiers.slice().sort());
})));
t('the page says what it did, in plain words, without calling regions distances', () => {
  const r = run(2600000, { priorities: ['location'] }); assert.strictEqual(r.effect.length, 1);
  assert.strictEqual(r.effect[0], 'Closer to the centre: Core Central Region shown first, followed by Rest of Central and Outside Central.'); assert.ok(!/\d/.test(r.effect[0]));
  assert.ok(!/distance|km|nearer|closest/i.test(JSON.stringify(r.effect)));
  assert.ok(/your priorities/.test(r.orderLine));
});

console.log('Newer building');
t('resale only: ordered by lease start year, newest first, freehold and 900+ year leases after; new launches unchanged', () => BUDGETS.forEach((b) => {
  const a = run(b), c = run(b, { priorities: ['newer'] });
  assert.deepStrictEqual(names(c, 'new'), names(a, 'new'));
  const yr = (n) => { const p = ix.projects.find((x) => FI.displayName(x.name) === n); return p.tg === 4 ? -1 : Number((/from (\d{4})/.exec(p.tl) || [0, 0])[1]); };
  const ys = names(c, 'resale').map(yr); assert.deepStrictEqual(ys, ys.slice().sort((x, y) => y - x));
  assert.deepStrictEqual(c.eligible, a.eligible);
}));
t('the card caveat stays: lease start year is not the completion year', () => { const r = run(2600000, { priorities: ['newer'] }); assert.ok(r.effect[0].indexOf('not the completion year') > -1); assert.ok(r.unsupported.some((u) => u.id === 'newer' && /not the completion year/.test(u.text))); });
t('off for New launch only (adds no distinction), and with the Freehold filter (no lease start year)', () => {
  const n = run(2600000, { openTo: 'new', priorities: ['newer'] }); assert.ok(n.effect.length === 1 && /wasn’t applied: every new launch/.test(n.effect[0])); assert.strictEqual(sig(Object.assign({}, n, { effect: undefined })), sig(run(2600000, { openTo: 'new' })));
  const f = run(2600000, { freehold: true, priorities: ['freehold', 'newer'] }); assert.ok(/wasn’t applied: it can’t be combined with Freehold or 900\+ year lease/.test(f.effect[0]));
});

console.log('More space');
t('extends the inferred window upward by 100 sqft, never an explicit size', () => BUDGETS.forEach((b) => {
  const st = step(b), a = FI.sizeWindow(null, st, 'both'), s = FI.sizeWindow(null, st, 'both', { space: true });
  assert.strictEqual(s.lo, a.lo); assert.strictEqual(s.hi, a.hi + 100); assert.ok(s.extended);
  const ex = FI.sizeWindow({ from: 900, to: 1000, typed: true }, st, 'both', { space: true }); assert.deepStrictEqual([ex.lo, ex.hi, ex.source], [900, 1000, 'explicit']); assert.ok(!ex.extended);
}));
t('more developments qualify and the larger sizes come first', () => [1500000, 2500000, 2600000, 4000000].forEach((b) => {
  const a = run(b, { noInv: true }), c = run(b, { noInv: true, priorities: ['space'] });
  assert.ok(c.total >= a.total, b); assert.ok(c.effect.length === 1 && /^More space: sizes up to \d[\d,]* sqft are included, and larger sizes are listed first\.$/.test(c.effect[0]));
  assert.notDeepStrictEqual(names(c, 'resale'), names(a, 'resale'));
}));
t('a typed size wins: More space is reported as not applied and the list equals the plain list', () => {
  const a = run(2600000, { size: [1000, 1150] }), c = run(2600000, { size: [1000, 1150], priorities: ['space'] });
  assert.ok(/wasn’t applied: you chose your own size range/.test(c.effect[0])); assert.deepStrictEqual(names(c, 'resale'), names(a, 'resale')); assert.deepStrictEqual(names(c, 'new'), names(a, 'new'));
});

console.log('Two priorities and a named area');
t('first chosen is primary, second breaks ties: the order matters', () => BUDGETS.slice(0, 3).forEach((b) => {
  const a = run(b, { priorities: ['location', 'newer'] }), c = run(b, { priorities: ['newer', 'location'] });
  assert.notDeepStrictEqual(names(a, 'resale'), names(c, 'resale'), b);
  const rr = names(a, 'resale').map(segOf).map((s) => RR[s]); assert.deepStrictEqual(rr, rr.slice().sort((x, y) => x - y));
  assert.strictEqual(a.effect.length, 2);
}));
t('Freehold filters first, then the other priority orders what is left', () => {
  const a = run(2600000, { freehold: true, priorities: ['freehold', 'location'] }), b = run(2600000, { freehold: true, priorities: ['freehold'] });
  assert.deepStrictEqual(a.eligible, b.eligible); assert.ok(a.effect.length === 1);
  const rs = names(a, 'resale').map(segOf).map((s) => RR[s]); assert.deepStrictEqual(rs, rs.slice().sort((x, y) => x - y));
});
t('a specific area keeps the list within that area and Closer to the centre is not applied', () => BUDGETS.forEach((b) => {
  const a = run(b, { districts: ['20'] }), c = run(b, { districts: ['20'], priorities: ['location'] });
  assert.deepStrictEqual(names(c, 'resale'), names(a, 'resale')); assert.deepStrictEqual(names(c, 'new'), names(a, 'new'));
  assert.ok(/wasn’t applied: the area you chose already sets the location/.test(c.effect[0]));
  assert.deepStrictEqual(c.eligible, a.eligible);
}));
t('every effect line is short plain language, no implementation terms', () => {
  const lines = []; BUDGETS.forEach((b) => ['location', 'newer', 'space'].forEach((p) => (run(b, { priorities: [p] }).effect || []).forEach((l) => lines.push(l))));
  lines.forEach((l) => { assert.ok(l.length < 200, l); assert.ok(!/\b(tg|tier|seg|rank|compare|key|sort)\b/i.test(l), l); });
});

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
