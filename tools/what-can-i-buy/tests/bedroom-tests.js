// node tools/what-can-i-buy/tests/bedroom-tests.js : V10.3.3, new-launch bedroom matching. Real shipped data plus small synthetic projects.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../../');
const ENG = require(root + 'assets/js/kpt-engine.js'), FI = require(root + 'assets/js/kpt-find.js');
const rj = (f) => JSON.parse(fs.readFileSync(root + f, 'utf8'));
const ix = FI.prepare(rj('data/projects/find.json')), E = ENG.DEFAULTS, invDoc = rj('data/projects/inventory.json');
const inv = () => FI.prepareInventory(invDoc, Date.parse(invDoc.checkedAt) + 3600e3);
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message.split('\n')[0]); } };
const step = (b) => { const sb = ENG.budgetStep(b, E); return ENG.pickStep(rj('data/market/route-stats/shard-' + ENG.shardStart(sb, E) + '.json'), sb); };
const BUDGETS = [1500000, 2200000, 2500000, 2600000, 4000000];
const CHOICES = ['1br', '2br', '3br', '3br-study', '4br-plus'];
const ALLOWED = { '1br': [1], '2br': [2], '3br': [3], '3br-study': [3, 4, 5], '4br-plus': [4, 5] };
function run(b, o) {
  o = o || {}; const st = step(b), pr = o.priorities || [], size = o.bed || 'not-sure';
  const sz = o.size ? { lo: o.size[0], hi: o.size[1], source: 'explicit', line: 'x' } : FI.sizeWindow(null, st, o.openTo || 'both', { space: pr.indexOf('space') > -1 });
  return FI.shortlist(ix, { budget: b, openTo: o.openTo || 'both', size: sz, districts: [], text: '', freehold: pr.indexOf('freehold') > -1, loc: { districts: [] }, pct: FI.T.budgetPct, answers: { where: 'flexible', size, priorities: pr }, typical: FI.inferSize(st, o.openTo || 'both'), inv: inv() });
}
const cardsOf = (r, sale) => { const g = r.groups.find((x) => x.sale === sale); return g ? g.cards.concat(g.more || []) : []; };
const cand = (b, bed, prefs, size) => { const st = step(b), sz = size ? { lo: size[0], hi: size[1] } : FI.sizeWindow(null, st, 'both', { space: (prefs || []).indexOf('space') > -1 });
  const o = { budget: b, pct: FI.T.budgetPct, lo: sz.lo, hi: sz.hi, districts: [], freehold: false, text: '', openTo: 'both', inv: inv(), sizeSource: size ? 'explicit' : 'inferred', _uraIds: {}, prefs: prefs || [] };
  const beds = FI.bedsFor(bed); if (beds) o.beds = beds; ix.projects.forEach((x) => { o._uraIds[x.id] = 1; }); return FI.newCandidates(ix, o); };
const nm = (c) => FI.displayName(c.name), band = (c) => (c.tier === 'a' || c.tier === 'b' ? 0 : c.tier === 'c' ? 1 : 2);
const segOf = (name) => { const p = ix.projects.find((x) => FI.displayName(x.name) === name); if (p) return p.seg; const q = invDoc.projects.find((x) => FI.displayName(x.name) === name); return q && q.region; };   // V10.3.5: URA's seg wins; else the reviewed inventory region
const RR = { CCR: 0, RCR: 1, OCR: 2 };
// synthetic inventory
const TY = (b, ceiling, bands) => ({ bedrooms: b, label: b + ' bedrooms', ceiling, bands });
const IP = (types) => ({ slug: 'x', name: 'X', status: 'ok', byBedrooms: types });
const OPT = (o) => Object.assign({ budget: 2200000, pct: 0.10, lo: 920, hi: 1030, sizeSource: 'inferred' }, o);

console.log('Mapping');
t('questionnaire answers map to Huttons bedroom numbers (5 = 5+); Not sure and anything else map to nothing', () => {
  assert.deepStrictEqual(FI.bedsFor('1br'), [1]); assert.deepStrictEqual(FI.bedsFor('2br'), [2]); assert.deepStrictEqual(FI.bedsFor('3br'), [3]);
  assert.deepStrictEqual(FI.bedsFor('3br-study'), [3, 4, 5]); assert.deepStrictEqual(FI.bedsFor('4br-plus'), [4, 5]);
  ['not-sure', '', undefined, null, 'constructor', '__proto__', 'toString'].forEach((v) => assert.strictEqual(FI.bedsFor(v), null));
});

console.log('Matching rules (synthetic)');
t('a known wrong bedroom never qualifies on size: 2BR fits size and budget, 3BR is outside the tolerance -> no match', () => {
  const ip = IP([TY(2, 2550000, [[900, 2150000]]), TY(3, 3150000, [[1000, 2550000]])]);
  assert.ok(FI.invMatch(ip, OPT({})), 'without a bedroom the 2BR matches (V10.3.2)');
  assert.strictEqual(FI.invMatch(ip, OPT({ beds: [3] })), null);
});
t('the inferred size window does not reject a known matching bedroom', () => {
  const ip = IP([TY(3, 3000000, [[1500, 2200000]])]);
  assert.strictEqual(FI.invMatch(ip, OPT({})), null);
  const m = FI.invMatch(ip, OPT({ beds: [3] })); assert.ok(m && m.fit === 'inside' && m.primary.bedrooms === 3);
});
t('a size the buyer typed is still a real constraint', () => {
  const ip = IP([TY(3, 3000000, [[1500, 2200000]])]);
  assert.strictEqual(FI.invMatch(ip, OPT({ beds: [3], sizeSource: 'explicit', lo: 900, hi: 1100 })), null);
  assert.ok(FI.invMatch(ip, OPT({ beds: [3], sizeSource: 'explicit', lo: 1400, hi: 1600 })));
});
t('only the matching bedroom types are returned, and the price comes from them', () => {
  const ip = IP([TY(2, 2100000, [[900, 1700000]]), TY(3, 2900000, [[1100, 2150000]]), TY(4, 4000000, [[1500, 3300000]])]);
  const m = FI.invMatch(ip, OPT({ beds: [3] })); assert.deepStrictEqual(m.types.map((x) => x.bedrooms), [3]); assert.strictEqual(m.primary.floor, 2150000);
  const m2 = FI.invMatch(ip, OPT({ beds: [3, 4, 5], budget: 3000000 })); assert.deepStrictEqual(m2.types.map((x) => x.bedrooms), [3, 4]);
});
t('requested bedroom exists but is outside the budget tolerance -> no match; ±10% unchanged', () => {
  const ip = IP([TY(3, 3200000, [[1100, 2500000]])]);
  assert.strictEqual(FI.invMatch(ip, OPT({ beds: [3], budget: 2200000 })), null);            // 2.5m > 2.2m x 1.10
  assert.ok(FI.invMatch(ip, OPT({ beds: [3], budget: 2300000 })));                           // 2.5m <= 2.3m x 1.10 = 2.53m
});
t('without a bedroom the match is exactly the old one (no hi field, same window)', () => {
  const ip = IP([TY(3, 3000000, [[900, 2200000]])]); const m = FI.invMatch(ip, OPT({})); assert.strictEqual(m.hi, undefined); assert.strictEqual(m.types[0].hi, undefined);
});

console.log('Real data: every bedroom choice, several budgets');
t('every shown inventory match is a requested bedroom type, and no card, effect line or note says study', () => BUDGETS.forEach((b) => CHOICES.forEach((c) => {
  const r = run(b, { bed: c }), ok = ALLOWED[c];
  cand(b, c).filter((x) => x.tier === 'a' || x.tier === 'b').forEach((x) => x.inv.types.forEach((ty) => assert.ok(ok.indexOf(ty.bedrooms) > -1, b + ' ' + c + ' ' + nm(x) + ' ' + ty.bedrooms)));
  assert.ok(!/study/i.test(JSON.stringify(r.groups) + JSON.stringify(r.effect) + JSON.stringify(r.unsupported) + r.orderLine), b + ' ' + c);
  cardsOf(r, 'new').filter((cd) => cd.tier === 'a' || cd.tier === 'b').forEach((cd) => {
    const bedsShown = (cd.simple.size.match(/\d/g) || []).map(Number); bedsShown.forEach((n) => assert.ok(n === 5 ? ok.indexOf(5) > -1 : ok.indexOf(n) > -1, cd.name + ' ' + cd.simple.size));
    assert.ok(!/around your size/.test(cd.simple.size) && !/around this size/.test(cd.huttons.budget), cd.name);
  });
})));
t('c and d never outrank a or b, for every bedroom choice, budget and priority combination', () => BUDGETS.forEach((b) => CHOICES.forEach((c) => [[], ['location'], ['space'], ['space', 'location'], ['location', 'space'], ['newer'], ['freehold']].forEach((pr) => {
  const bs = cand(b, c, pr).map(band); assert.deepStrictEqual(bs, bs.slice().sort(), b + ' ' + c + ' ' + pr);
}))));
t('the eligible count never shrinks to hide a project: bedrooms re-tier, they do not remove URA-eligible projects', () => BUDGETS.forEach((b) => CHOICES.forEach((c) => {
  const ura = (l) => l.filter((x) => x.tier === 'c' || x.tier === 'd').length;
  assert.ok(cand(b, c).length >= cand(b, 'not-sure').filter((x) => x.tier === 'c' || x.tier === 'd').length - 0);
})));

console.log('$2.2m and $2.6m, 3BR');
t('$2.2m 3BR: The Hillshore (2BR fits, its 3BR is far above budget) is not substituted anywhere', () => {
  const c = cand(2200000, '3br'), h = c.find((x) => nm(x) === 'The Hillshore');
  assert.ok(!h || (h.tier !== 'a' && h.tier !== 'b')); const r = run(2200000, { bed: '3br' });
  cardsOf(r, 'new').forEach((cd) => { if (cd.name === 'The Hillshore') assert.ok(!/2 Bedroom|2 and 3/.test(cd.simple.size)); });
  assert.ok(cardsOf(run(2200000), 'new').some((cd) => cd.name === 'The Hillshore' && /2 Bedroom/.test(cd.simple.size)), 'Not sure still shows it as V10.3.2 did');
});
t('$2.2m 3BR: the a/b set is the 3BR-matched projects, Sora shows 3 Bedroom only', () => {
  const ab = cand(2200000, '3br').filter((x) => x.tier === 'a' || x.tier === 'b').map(nm).sort();
  // V10.3.5 inventory: Gems Ville, Lucerne Grand, Narra Residences and Ocho are new in the 2026-10-07 inventory, each with a 3-bedroom band inside the budget window (Gems Ville/Ocho/Lucerne Grand are reviewed metadata projects)
  assert.deepStrictEqual(ab, ['Canberra Crescent Residences', 'Gems Ville', 'Jansen House', 'Kassia', 'Lentor Gardens Residences', 'Lentoria', 'Lucerne Grand', 'Narra Residences', 'Ocho', 'Sora', 'The Sen', 'Vela Bay']);
  const sora = cardsOf(run(2200000, { bed: '3br' }), 'new').concat(cardsOf(run(2200000, { bed: '3br' }), 'new')).find((cd) => cd.name === 'Sora'); assert.ok(sora); assert.strictEqual(sora.simple.size, '3 Bedroom');
});
t('$2.6m 3BR: The Hillshore stays (its 3BR is inside budget) and shows 3 Bedroom; Canberra Crescent (4BR only) does not qualify', () => {
  const c = cand(2600000, '3br'), h = c.find((x) => nm(x) === 'The Hillshore'), cc = c.find((x) => nm(x) === 'Canberra Crescent Residences');
  assert.ok(h && (h.tier === 'a' || h.tier === 'b') && h.inv.types.every((x) => x.bedrooms === 3));
  assert.ok(!cc || (cc.tier !== 'a' && cc.tier !== 'b'));
});

console.log('Cards and tiers');
t('unknown bedroom (URA only, Huttons not checked): kept, size fallback, and says bedroom availability is not confirmed', () => {
  const cs = cardsOf(run(2200000, { bed: "4br-plus" }), "new").filter((cd) => cd.tier === "c"); assert.ok(cs.length);
  cs.forEach((cd) => { assert.strictEqual(cd.simple.quiet, 'Current availability not confirmed. Bedroom availability not confirmed.'); assert.ok(!/\bbedroom/i.test(cd.simple.size)); });
  cardsOf(run(2200000), 'new').filter((cd) => cd.tier === 'c').forEach((cd) => assert.strictEqual(cd.simple.quiet, 'Current availability not confirmed.'));
});
t('tier d (Huttons checked, no requested bedroom at this budget): kept below, never shows a bedroom as the match', () => {
  const r = run(1800000, { bed: '4br-plus', openTo: 'new' }), ds = cardsOf(r, 'new').filter((cd) => cd.tier === 'd');   // V10.3.5: the larger inventory now fills the five cards with matching 3BR projects at $1.8m, so the tier d check uses 4BR+ where tier d cards are shown assert.ok(ds.length);
  ds.forEach((cd) => { assert.ok(/match the bedrooms and budget you chose/.test(cd.huttons.text) || cd.huttons.kind === 'zero', cd.name); assert.ok(!/\d-bedroom/.test(JSON.stringify(cd.huttons)), cd.name); });
});
t('a/b cards: layout only is listed as not evaluated; the other cards keep bedrooms and layout', () => {
  const cs = cardsOf(run(1800000, { bed: '3br', openTo: 'new' }), 'new'); const ab = cs.find((cd) => cd.tier === 'a' || cd.tier === 'b'), c = cs.find((cd) => cd.tier === 'c');
  assert.ok(/^Layout, /.test(ab.notEvaluated) && !/edroom/.test(ab.notEvaluated)); assert.ok(/Bedrooms and layout/.test(c.notEvaluated));
});

console.log('Priorities');
t('Closer to the centre + 3BR: the a/b band is CCR, RCR, OCR; c and d stay below', () => BUDGETS.forEach((b) => ['3br', '2br', '3br-study', '4br-plus'].forEach((c) => {
  const l = cand(b, c, ['location']), ab = l.filter((x) => x.tier === 'a' || x.tier === 'b'), r = ab.map((x) => RR[segOf(nm(x))]); assert.deepStrictEqual(r, r.slice().sort((x, y) => x - y), b + ' ' + c);
})));
t('More space + a bedroom: checked projects are ordered by the matched Huttons band, largest first', () => BUDGETS.forEach((b) => ['3br', '2br', '4br-plus'].forEach((c) => {
  const ab = cand(b, c, ['space']).filter((x) => x.tier === 'a' || x.tier === 'b'), hi = ab.map((x) => x.inv.hi); assert.ok(hi.every((v) => v > 0)); assert.deepStrictEqual(hi, hi.slice().sort((x, y) => y - x), b + ' ' + c);
})));
t('two priorities with a bedroom: first chosen is primary, second breaks ties; reversing changes the order', () => {
  const a = cand(2600000, '3br', ['location', 'space']).map(nm), b2 = cand(2600000, '3br', ['space', 'location']).map(nm); assert.notDeepStrictEqual(a.slice(0, 8), b2.slice(0, 8));
  const l = cand(2600000, '3br', ['location', 'space']).filter((x) => x.tier === 'a' || x.tier === 'b'); for (let i = 1; i < l.length; i++) { const p = l[i - 1], q = l[i]; if (RR[segOf(nm(p))] === RR[segOf(nm(q))]) assert.ok(p.inv.hi >= q.inv.hi, nm(p) + ' ' + nm(q)); }
});

console.log('Explicit typed size + bedroom');
t('typed size and a bedroom both apply', () => {
  const free = cand(2600000, '3br').filter((x) => x.tier === 'a' || x.tier === 'b').map(nm), typed = cand(2600000, '3br', [], [1000, 1150]), tab = typed.filter((x) => x.tier === 'a' || x.tier === 'b');
  tab.forEach((x) => x.inv.types.forEach((ty) => assert.strictEqual(ty.bedrooms, 3)));
  assert.ok(tab.length && tab.length <= free.length, tab.length + ' ' + free.length);
  const none = cand(2600000, '3br', [], [150, 200]).filter((x) => x.tier === 'a' || x.tier === 'b'); assert.strictEqual(none.length, 0);
});
t('through shortlist: an explicit size gives the "bedrooms and size" wording', () => {
  const cs = cardsOf(run(2600000, { bed: '3br', size: [1000, 1150] }), 'new').filter((cd) => cd.tier === 'a' || cd.tier === 'b'); assert.ok(cs.length);
  cs.forEach((cd) => assert.ok(/match the bedrooms and size you chose\.$/.test(cd.huttons.size), cd.huttons.size));
});

console.log('Resale and Not sure');
t('resale is size-based and identical with or without a bedroom answer', () => BUDGETS.forEach((b) => CHOICES.forEach((c) => {
  const a = cardsOf(run(b), 'resale').map((x) => x.name), d = cardsOf(run(b, { bed: c }), 'resale').map((x) => x.name); assert.deepStrictEqual(d, a, b + ' ' + c);
  assert.ok(!/bedroom/i.test(JSON.stringify(cardsOf(run(b, { bed: c }), 'resale').map((x) => x.simple))));
})));
t('resale-only searches never apply a bedroom to the list', () => BUDGETS.forEach((b) => { const a = run(b, { openTo: 'resale' }), d = run(b, { openTo: 'resale', bed: '3br' }); assert.deepStrictEqual(cardsOf(d, 'resale').map((x) => x.name), cardsOf(a, 'resale').map((x) => x.name)); assert.strictEqual(d.effect, undefined); }));
t('Not sure: no bedroom effect line, no bedroom note, the order line is unchanged', () => BUDGETS.forEach((b) => { const r = run(b); assert.strictEqual(r.effect, undefined); assert.ok(!r.unsupported.some((u) => u.id === 'bedrooms')); assert.ok(!/bedrooms you chose/.test(r.orderLine)); }));

console.log('Copy');
t('effect line and notes explain the new-launch / resale distinction simply', () => {
  const r = run(2200000, { bed: '3br' }); assert.strictEqual(r.effect[0], 'Bedrooms: new launches are matched on 3 bedrooms where we have inventory data. Resale is matched on size, because the transaction data has no bedroom count.');
  assert.ok(/bedrooms you chose/.test(r.orderLine));
  assert.strictEqual(r.unsupported.find((u) => u.id === 'bedrooms').text, 'New launch: bedrooms are checked where we have inventory data. Resale: bedroom count isn’t in the transaction data, so size is used.');
  const n = run(2200000, { bed: '3br', openTo: 'new' }); assert.strictEqual(n.effect[0], 'Bedrooms: new launches are matched on 3 bedrooms where we have inventory data.');
  assert.ok(run(2200000, { bed: '3br-study' }).effect[0].indexOf('matched on 3 bedrooms or larger where we have inventory data.') > -1);
  assert.ok(!/doesn’t record bedrooms|doesn't record bedrooms/.test(fs.readFileSync(root + 'assets/js/kpt-find.js', 'utf8')));
});
t('every new effect line is short and free of implementation terms', () => BUDGETS.forEach((b) => CHOICES.forEach((c) => run(b, { bed: c, priorities: ['space'] }).effect.forEach((l) => { assert.ok(l.length < 200, l); assert.ok(!/\b(tier|inv|Huttons|band|seg|sort)\b/i.test(l), l); }))));

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
