// node tools/what-can-i-buy/tests/priority-tests.js : V10.3.2 (V10.3.1 + a/b band), "What matters most?" must change the shortlist. Real shipped data.
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
  return FI.shortlist(ix, { budget: b, openTo, size: sz, districts: o.districts || [], text: '', freehold: !!o.freehold, loc: { districts: o.districts || [] }, pct: FI.T.budgetPct, answers: { where: 'flexible', size: 'not-sure', priorities: pr }, typical: FI.inferSize(st, openTo), inv: o.noInv ? null : inv(), regionSoft: !!o.regionSoft });
}
const names = (r, sale) => { const g = r.groups.find((x) => x.sale === sale); return g ? g.cards.concat(g.more || []).map((c) => c.name) : []; };
const sig = (r) => JSON.stringify([r.groups.map((g) => [g.sale, g.cards.map((c) => c.name), (g.more || []).map((c) => c.name)]), r.total, r.eligible, r.orderLine, r.unsupported]);
const segOf = (name) => { const p = ix.projects.find((x) => FI.displayName(x.name) === name); if (p) return p.seg; const q = invDoc.projects.find((x) => FI.displayName(x.name) === name); return q && q.region; };   // V10.3.5: URA's seg wins; a project URA does not list uses its reviewed inventory region
const RR = { CCR: 0, RCR: 1, OCR: 2 };

console.log('No priority: unchanged');
t('no priorities: no effect lines, the original order line, nothing added', () => BUDGETS.forEach((b) => { const r = run(b); assert.strictEqual(r.effect, undefined); assert.ok(/ordered|Listed by whether|Resale: listed by how much recent evidence/.test(r.orderLine) && !/priorities/.test(r.orderLine)); }));
t('Freehold alone is still just the filter: no effect lines, same order within the filtered set', () => BUDGETS.forEach((b) => { const r = run(b, { freehold: true, priorities: ['freehold'] }); assert.strictEqual(r.effect, undefined); }));

console.log('Closer to the centre');
t('V10.3.4: Closer is a constraint: OCR never appears, CCR before RCR, and everything else stays eligible', () => BUDGETS.forEach((b) => {
  const a = run(b), c = run(b, { priorities: ['location'] });
  ['resale', 'new'].forEach((sale) => { const rs = names(c, sale).map(segOf); rs.forEach((x) => assert.ok(x === 'CCR' || x === 'RCR', sale + ' ' + x)); const o = rs.map((x) => RR[x]); assert.deepStrictEqual(o, o.slice().sort((x, y) => x - y)); });
  assert.ok(c.eligible <= a.eligible);
}));
t('the resale top results visibly change at $1.5m, $2.5m and $2.6m, and are all Core Central or Rest of Central', () => [1500000, 2500000, 2600000].forEach((b) => {
  const a = run(b), c = run(b, { priorities: ['location'] });
  assert.notDeepStrictEqual(names(c, 'resale').slice(0, 3), names(a, 'resale').slice(0, 3));
  c.groups.find((g) => g.sale === 'resale').cards.forEach((card) => assert.ok(['CCR', 'RCR'].indexOf(segOf(card.name)) > -1, card.name));
}));
t('Huttons budget-fit tiers stay ahead of the preference: a project that cannot match the budget never outranks one that can', () => BUDGETS.forEach((b) => ['location', 'space', 'newer'].forEach((p) => {
  const st = step(b), sz = FI.sizeWindow(null, st, 'both', { space: p === 'space' });
  const o = { budget: b, pct: FI.T.budgetPct, lo: sz.lo, hi: sz.hi, districts: [], freehold: false, text: '', openTo: 'both', inv: inv(), sizeSource: 'inferred', _uraIds: {}, prefs: [p] }; ix.projects.forEach((x) => { o._uraIds[x.id] = 1; });
  const list = FI.newCandidates(ix, o), band = list.map((c) => (c.tier === 'a' || c.tier === 'b') ? 0 : c.tier === 'c' ? 1 : 2); assert.deepStrictEqual(band, band.slice().sort());   // c/d never above a/b
})));
const candsFor = (b, prefs) => { const st = step(b), sz = FI.sizeWindow(null, st, 'both', { space: prefs.indexOf('space') > -1 });
  const o = { budget: b, pct: FI.T.budgetPct, lo: sz.lo, hi: sz.hi, districts: [], freehold: prefs.indexOf('freehold') > -1, text: '', openTo: 'both', inv: inv(), sizeSource: 'inferred', _uraIds: {}, prefs };
  ix.projects.forEach((x) => { o._uraIds[x.id] = 1; }); return FI.newCandidates(ix, o); };
console.log('V10.3.2: a and b form one band when a priority is active');
t('no priority: tiers a, b, c, d stay strictly in order (V10.3.1)', () => BUDGETS.forEach((b) => { const tiers = candsFor(b, []).map((c) => c.tier); assert.deepStrictEqual(tiers, tiers.slice().sort()); }));
t('$2.6m Closer: CCR first (Aurea, The Collective), then RCR (Hudson Place Residences is new in the 2026-10-07 inventory, a URA-listed RCR project) in the existing evidence order; The Hillshore (limited URA support) follows the other RCR projects', () => {
  const n = candsFor(2600000, ['location']).map((c) => FI.displayName(c.name)).slice(0, 5);
  assert.deepStrictEqual(n, ['Aurea', 'The Collective at One Sophia', 'Hudson Place Residences', 'One Marina Gardens', 'The Arcady at Boon Keng']);
});
t('every priority: c/d stay below the a+b band, and Closer as first priority orders the band CCR, RCR, OCR', () => BUDGETS.forEach((b) => [['location'], ['space'], ['newer'], ['freehold'], ['location', 'space'], ['space', 'location'], ['location', 'newer'], ['newer', 'location']].forEach((pr) => {
  const l = candsFor(b, pr), k = l.findIndex((c) => c.tier === 'c' || c.tier === 'd'), n = k < 0 ? l : l.slice(0, k);
  assert.ok(n.every((c) => c.tier === 'a' || c.tier === 'b') && l.slice(n.length).every((c) => c.tier === 'c' || c.tier === 'd'), pr.join());
  if (pr[0] === 'location') { const r = n.map((c) => RR[segOf(FI.displayName(c.name))]); assert.deepStrictEqual(r, r.slice().sort((x, y) => x - y), 'region order ' + pr.join()); }
})));
t('the page says what it did, in plain words, without calling regions distances', () => {
  const r = run(2600000, { priorities: ['location'] }); assert.strictEqual(r.effect.length, 1);
  assert.strictEqual(r.effect[0], 'Closer to the centre: Core Central and Rest of Central regions only, Core Central first.'); assert.ok(!/\d/.test(r.effect[0]));
  assert.ok(!/distance|km|nearer|closest/i.test(JSON.stringify(r.effect)));
  assert.ok(/your priorities/.test(r.orderLine));
  const m = run(2600000, { priorities: ['location', 'space'] }); assert.strictEqual(m.effect[0], 'Closer to the centre: Core Central and Rest of Central regions only.');
  assert.ok(/URA.s region classification/.test(FI.METHOD.join(' ')) && /not a measure of physical distance/.test(FI.METHOD.join(' ')));
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
t('Closer + Newer: constrained first, then Newer orders the resale; chip order never changes anything', () => BUDGETS.forEach((b) => {
  const a = run(b, { priorities: ['location', 'newer'] }), c = run(b, { priorities: ['newer', 'location'] });
  assert.strictEqual(sig(a.effect ? Object.assign({}, a, { effect: 0 }) : a), sig(c.effect ? Object.assign({}, c, { effect: 0 }) : c), b);
  names(a, 'resale').map(segOf).forEach((x) => assert.ok(x === 'CCR' || x === 'RCR'));
  assert.strictEqual(a.effect.length, 2);
}));
t('Closer + More space (either order) are identical, and RCR may precede CCR because space ranks the survivors', () => BUDGETS.forEach((b) => {
  const a = run(b, { priorities: ['location', 'space'] }), c = run(b, { priorities: ['space', 'location'] });
  assert.strictEqual(sig(a), sig(c), b);
  ['resale', 'new'].forEach((sale) => names(a, sale).map(segOf).forEach((x) => assert.ok(x === 'CCR' || x === 'RCR')));
}));
t('Include Outside Central removes Closer for this search: all regions eligible, no region ranking, other preferences and Freehold keep working', () => BUDGETS.forEach((b) => {
  const regs = (r) => ['resale', 'new'].reduce((a, sale) => a.concat(names(r, sale).map(segOf)), []);
  // Closer only -> default ranking, identical to the plain search (apart from the one effect line)
  const c = run(b, { priorities: ['location'], regionSoft: true }), plain = run(b);
  assert.deepStrictEqual(c.eligible, plain.eligible); assert.strictEqual(sig(c), sig(plain), 'closer only ' + b);
  assert.deepStrictEqual(c.effect, ['Closer to the centre was removed for this search: all regions are included.']);
  // Closer + More space / Newer -> exactly what More space / Newer alone gives
  [['space'], ['newer']].forEach((o) => { const a = run(b, { priorities: ['location', o[0]], regionSoft: true }), a2 = run(b, { priorities: [o[0], 'location'], regionSoft: true }), only = run(b, { priorities: o });
    assert.strictEqual(sig(a), sig(only), o + ' ' + b); assert.strictEqual(sig(a), sig(a2), 'order ' + o + ' ' + b); });
  // Closer + Freehold -> Freehold alone
  const f = run(b, { freehold: true, priorities: ['location', 'freehold'], regionSoft: true }), fo = run(b, { freehold: true, priorities: ['freehold'] });
  assert.strictEqual(sig(f), sig(fo), 'freehold ' + b); assert.deepStrictEqual(f.eligible, fo.eligible);
  // OCR is back among the eligible set when it exists at that budget
  const all = run(b, { regionSoft: true, priorities: ['location'] }); if (regs(plain).some((x) => x === 'OCR')) assert.ok(regs(all).some((x) => x === 'OCR'), 'OCR returns ' + b);
}));
t('Include Outside Central never rewrites the answers: the same search without the override still excludes OCR', () => BUDGETS.forEach((b) => {
  run(b, { priorities: ['location'], regionSoft: true }); const r = run(b, { priorities: ['location'] });
  ['resale', 'new'].forEach((sale) => names(r, sale).map(segOf).forEach((x) => assert.ok(x === 'CCR' || x === 'RCR')));
}));
t('display names: the corrupted URA names read Verdé Joo Chiat and Enchanté, exact keys only', () => {
  assert.strictEqual(FI.displayName('VERD\uFFFD JOO CHIAT'), 'Verdé Joo Chiat'); assert.strictEqual(FI.displayName('ENCHANT\uFFFD'), 'Enchanté');
  assert.strictEqual(FI.displayName('VERD JOO CHIAT'), 'Verd Joo Chiat'); assert.ok(ix.projects.every((p) => FI.displayName(p.name).indexOf('\uFFFD') < 0 || p.name.indexOf('\uFFFD') > -1));
});
t('no-match: Closer + Freehold + New launch + $1.8m 3BR names the state and offers only actions that produce results', () => {
  const r = FI.shortlist(ix, { budget: 1800000, openTo: 'new', size: { lo: 900, hi: 1300, source: 'inferred', line: 'x' }, districts: [], text: '', freehold: true, loc: { districts: [] }, pct: FI.T.budgetPct, beds: [3], answers: { where: 'flexible', size: '3br', priorities: ['location'] }, typical: { lo: 900, hi: 1100 }, inv: inv() });
  if (r.state === 'none') { assert.strictEqual(r.noneText, 'No matches found with all your selections.'); assert.ok(r.constraintNone); assert.ok(r.changes.length > 0); r.changes.forEach((c) => assert.ok(c.count > 0, c.label)); assert.ok(r.changes.every((c) => !/tier|band|ranking/i.test(c.label + c.text))); }
  else assert.ok(r.state === 'few' || r.state === 'ok');
});
t('Freehold + Closer: both are constraints; the list is CCR/RCR only and freehold only', () => {
  const a = run(2600000, { freehold: true, priorities: ['freehold', 'location'] }), b = run(2600000, { freehold: true, priorities: ['freehold'] });
  assert.ok(a.eligible <= b.eligible);
  const rs = names(a, 'resale').map(segOf); rs.forEach((x) => assert.ok(x === 'CCR' || x === 'RCR')); const o = rs.map((x) => RR[x]); assert.deepStrictEqual(o, o.slice().sort((x, y) => x - y));
  const c = run(2600000, { freehold: true, priorities: ['location', 'freehold'] }); assert.strictEqual(sig(a), sig(c));
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
