// node tools/what-can-i-buy/tests/size-window-tests.js : V10.3.6. New launch and Resale each get their own inferred size window; a bedroom choice never becomes a resale bedroom claim.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../../');
const ENG = require(root + 'assets/js/kpt-engine.js'), FI = require(root + 'assets/js/kpt-find.js');
const rj = (f) => JSON.parse(fs.readFileSync(root + f, 'utf8'));
const ix = FI.prepare(rj('data/projects/find.json')), E = ENG.DEFAULTS, invDoc = rj('data/projects/inventory.json');
const inv = () => FI.prepareInventory(invDoc, Date.parse(invDoc.checkedAt) + 3600e3);
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message.split('\n')[0]); } };
const step = (b) => { const sb = ENG.budgetStep(b, E); return ENG.pickStep(rj('data/market/route-stats/shard-' + ENG.shardStart(sb, E) + '.json'), sb); };
const BUDGETS = [1000000, 1200000, 1500000, 1800000, 2000000, 2200000, 2500000, 3000000, 4000000, 5000000];
const CHOICES = ['1br', '2br', '3br', '3br-study', '4br-plus'];
const ALLOWED = { '1br': [1], '2br': [2], '3br': [3], '3br-study': [3, 4, 5], '4br-plus': [4, 5] };
const TBC = 'Bedroom layout to be confirmed';

/** What the page does: one window per sale type from sizeWindows, then shortlist with both. */
function page(b, o) {
  o = o || {}; const st = step(b), openTo = o.openTo || 'both', pr = o.priorities || [], bed = o.bed || 'not-sure';
  const SW = FI.sizeWindows(o.size ? { from: o.size[0], to: o.size[1], typed: true } : null, st, openTo, { space: pr.indexOf('space') > -1, pad: !!o.pad });
  const r = SW.size ? FI.shortlist(ix, { budget: b, openTo, size: SW.size, sizes: SW.sizes, districts: [], text: '', freehold: pr.indexOf('freehold') > -1, loc: { districts: [] }, pct: FI.T.budgetPct, answers: { where: 'flexible', size: bed, priorities: pr }, typical: openTo === 'both' ? null : FI.inferSize(st, openTo), inv: inv() }) : null;
  return { SW, r };
}
/** The V10.3.5 way: one window for everything (used here only as a reference for a single sale type). */
function legacy(b, o) {
  o = o || {}; const st = step(b), openTo = o.openTo, pr = o.priorities || [], bed = o.bed || 'not-sure';
  const sz = o.size ? { lo: o.size[0], hi: o.size[1], source: 'explicit', line: 'x' } : FI.sizeWindow(null, st, openTo, { space: pr.indexOf('space') > -1 });
  return sz ? FI.shortlist(ix, { budget: b, openTo, size: sz, districts: [], text: '', freehold: pr.indexOf('freehold') > -1, loc: { districts: [] }, pct: FI.T.budgetPct, answers: { where: 'flexible', size: bed, priorities: pr }, typical: FI.inferSize(st, openTo), inv: inv() }) : null;
}
const grp = (r, sale) => r && r.groups.find((g) => g.sale === sale);
const all = (r, sale) => { const g = grp(r, sale); return g ? g.cards.concat(g.more || []) : []; };
const ids = (r, sale) => all(r, sale).map((c) => c.id);
const clone = (x) => JSON.parse(JSON.stringify(x));
const dropRoutes = (st, re) => { const c = clone(st); Object.keys(c.private.routes).forEach((k) => { if (re.test(k)) delete c.private.routes[k]; }); return c; };

console.log('Each sale type gets its own size window');
t('explicit size: one window, the same for both sale types and never altered', () => {
  const sw = FI.sizeWindows({ from: 1000, to: 1100 }, step(2200000), 'both', {}); assert.deepStrictEqual([sw.sizes.resale.lo, sw.sizes.resale.hi, sw.sizes.new.lo, sw.sizes.new.hi], [1000, 1100, 1000, 1100]); assert.strictEqual(sw.mixed, false); assert.strictEqual(sw.size.source, 'explicit');
});
t('inferred size: resale uses the resale-only inference and new launch the new-launch-only inference, at every budget', () => BUDGETS.forEach((b) => {
  const st = step(b), sw = FI.sizeWindows(null, st, 'both', {}), rs = FI.inferSize(st, 'resale'), nw = FI.inferSize(st, 'new');
  if (rs) { assert.ok(sw.sizes.resale, b); assert.deepStrictEqual([sw.sizes.resale.lo, sw.sizes.resale.hi], [rs.lo, rs.hi], b + ' resale'); } else assert.ok(!sw.sizes.resale, b);
  if (nw) { assert.ok(sw.sizes.new, b); assert.deepStrictEqual([sw.sizes.new.lo, sw.sizes.new.hi], [nw.lo, nw.hi], b + ' new'); } else assert.ok(!sw.sizes.new, b);
}));
t('the two windows really differ where the old shared window was wrong ($1.5m and $2.2m), and the page shows no single range then', () => [1500000, 2200000].forEach((b) => {
  const sw = FI.sizeWindows(null, step(b), 'both', {}); assert.ok(sw.mixed); assert.notDeepStrictEqual([sw.sizes.resale.lo, sw.sizes.resale.hi], [sw.sizes.new.lo, sw.sizes.new.hi]); assert.strictEqual(sw.size.mixed, true);
}));
t('single sale type: sizeWindows gives exactly the V10.3.5 sizeWindow', () => BUDGETS.forEach((b) => ['new', 'resale'].forEach((ty) => ['', 'space'].forEach((sp) => {
  const st = step(b), a = FI.sizeWindows(null, st, ty, { space: !!sp }).size, o = FI.sizeWindow(null, st, ty, { space: !!sp }); assert.deepStrictEqual(a, o, b + ty + sp);
}))));

console.log('Sale types cannot contaminate each other');
t('real data: removing every New route changes no resale window, and removing every Resale route changes no new-launch window', () => BUDGETS.concat([700000, 900000, 1100000, 2800000]).forEach((b) => {
  const st = step(b); assert.deepStrictEqual(FI.inferSize(dropRoutes(st, /\|New\|/), 'resale'), FI.inferSize(st, 'resale'), b + ' resale'); assert.deepStrictEqual(FI.inferSize(dropRoutes(st, /\|Resale\|/), 'new'), FI.inferSize(st, 'new'), b + ' new');
}));
t('the all-sales total is never used for a sale type: changing it changes neither window', () => BUDGETS.concat([700000, 900000]).forEach((b) => {
  const st = step(b), c = clone(st); if (c.private.total && c.private.total.n) { c.private.total.n = [9999, 1, 1, 1, 1, 123, 456]; if (c.private.total.w) c.private.total.w = [9999, 1, 1, 1, 1, 123, 456]; }
  ['new', 'resale'].forEach((ty) => assert.deepStrictEqual(FI.inferSize(c, ty), FI.inferSize(st, ty), b + ty));
}));
const R = (n, q1, q3) => ({ n: [n, 0, 0, 0, (q1 + q3) / 2, q1, q3] });
const SYN = (routes, total) => ({ private: { routes, total: { n: total || [500, 0, 0, 0, 900, 800, 1000] } } });
t('synthetic: no route with 15 sales, so the routes of that type alone are pooled by sales; the other type and the total play no part', () => {
  const st = SYN({ 'OCR|New|–': R(6, 600, 700), 'RCR|New|–': R(10, 700, 900), 'OCR|Resale|10–25': R(400, 1400, 1700) }, [2000, 0, 0, 0, 1500, 1400, 1700]);
  const nw = FI.inferSize(st, 'new'); assert.strictEqual(nw.source, 'scope'); assert.deepStrictEqual([nw.lo, nw.hi], [Math.round(((6 * 600 + 10 * 700) / 16) / 10) * 10, Math.round(((6 * 700 + 10 * 900) / 16) / 10) * 10]);
  const rs = FI.inferSize(st, 'resale'); assert.strictEqual(rs.source, 'route'); assert.deepStrictEqual([rs.lo, rs.hi], [1400, 1700]);
});
t('synthetic: fewer than 15 sales of that type in all, so there is no window for it (never borrowed from the other type)', () => {
  const st = SYN({ 'OCR|New|–': R(5, 600, 700), 'OCR|Resale|10–25': R(400, 1400, 1700) }); assert.strictEqual(FI.inferSize(st, 'new'), null); assert.ok(FI.inferSize(st, 'resale'));
  const sw = FI.sizeWindows(null, st, 'both', {}); assert.deepStrictEqual(Object.keys(sw.sizes), ['resale']); assert.strictEqual(sw.mixed, false);
});
t('synthetic: a huge New route cannot set the resale window, and a huge Resale route cannot set the new-launch window', () => {
  const st = SYN({ 'OCR|New|–': R(900, 600, 700), 'OCR|Resale|10–25': R(20, 1400, 1700) });
  assert.deepStrictEqual(FI.inferSize(st, 'resale').lo, 1400); assert.deepStrictEqual(FI.inferSize(st, 'new').lo, 600);
  const st2 = SYN({ 'OCR|New|–': R(20, 600, 700), 'OCR|Resale|10–25': R(900, 1400, 1700) }); assert.strictEqual(FI.inferSize(st2, 'new').lo, 600); assert.strictEqual(FI.inferSize(st2, 'resale').lo, 1400);
});
t('mixed envelope is only for display: matching uses each type\'s own window', () => {
  const b = 2200000, p = page(b, { bed: 'not-sure' }), sw = p.SW; assert.ok(sw.mixed);
  const rs = FI.eligible(ix, 'resale', { budget: b, pct: FI.T.budgetPct, lo: sw.sizes.resale.lo, hi: sw.sizes.resale.hi, districts: [], freehold: false, text: '', prefs: [] });
  const wide = FI.eligible(ix, 'resale', { budget: b, pct: FI.T.budgetPct, lo: sw.size.lo, hi: sw.size.hi, districts: [], freehold: false, text: '', prefs: [] });
  assert.deepStrictEqual(ids(p.r, 'resale'), rs.slice(0, ids(p.r, 'resale').length).map((m) => m.id)); assert.notDeepStrictEqual(wide.map((m) => m.id), rs.map((m) => m.id));
});

console.log('Both search: each side equals the equivalent single-type search');
t('Both-search resale equals the resale-only search at the same budget, for every bedroom choice', () => BUDGETS.forEach((b) => ['not-sure'].concat(CHOICES).forEach((c) => {
  const both = page(b, { bed: c }), one = page(b, { bed: c, openTo: 'resale' }); if (!both.r || !one.r) return;
  assert.deepStrictEqual(ids(both.r, 'resale'), ids(one.r, 'resale'), b + ' ' + c);
  assert.deepStrictEqual(both.SW.sizes.resale, one.SW.sizes.resale, b + ' ' + c);
})));
t('Both-search new launch equals the new-launch-only search at the same budget, for every bedroom choice', () => BUDGETS.forEach((b) => ['not-sure'].concat(CHOICES).forEach((c) => {
  const both = page(b, { bed: c }), one = page(b, { bed: c, openTo: 'new' }); if (!both.r || !one.r) return;
  assert.deepStrictEqual(ids(both.r, 'new'), ids(one.r, 'new'), b + ' ' + c);
  assert.deepStrictEqual(both.SW.sizes.new, one.SW.sizes.new, b + ' ' + c);
})));
t('a typed size gives the same list in a Both search as in each single-type search', () => [[900, 1100], [1100, 1400]].forEach((sz) => [1800000, 2500000].forEach((b) => {
  const both = page(b, { size: sz, bed: '3br' }), rs = page(b, { size: sz, bed: '3br', openTo: 'resale' }), nw = page(b, { size: sz, bed: '3br', openTo: 'new' });
  assert.deepStrictEqual(ids(both.r, 'resale'), ids(rs.r, 'resale')); assert.deepStrictEqual(ids(both.r, 'new'), ids(nw.r, 'new'));
})));

console.log('New launch bedroom matching is unchanged and still verified');
t('1BR / 2BR / 3BR / 3BR + Study / 4BR+: every matched new-launch card carries the badge and only the chosen bedroom types, with the size of those homes', () => BUDGETS.forEach((b) => CHOICES.forEach((c) => {
  const r = page(b, { bed: c }).r; if (!r) return;
  all(r, 'new').filter((cd) => cd.tier === 'a' || cd.tier === 'b').forEach((cd) => {
    assert.strictEqual(cd.simple.badge, '✓ Matches ' + FI.BED_WORDS[c], b + ' ' + c + ' ' + cd.name);
    const m = /^(.+) Bedroom · about ([\d,]+)–([\d,]+) sqft$/.exec(cd.simple.size); assert.ok(m, cd.simple.size);
    m[1].split(' and ').join(', ').split(', ').forEach((x) => assert.ok(ALLOWED[c].indexOf(x === '5+' ? 5 : Number(x)) > -1, cd.name + ' ' + cd.simple.size));
    assert.ok(Number(m[2].replace(/,/g, '')) < Number(m[3].replace(/,/g, '')));
  });
  all(r, 'new').filter((cd) => cd.tier === 'c' || cd.tier === 'd').forEach((cd) => assert.ok(!cd.simple.badge, cd.name));      // an unconfirmed project never gets the badge
})));
t('the bedroom choice still changes the new-launch list (1BR, 2BR, 3BR and 4BR+ give different matched sets at some budget)', () => {
  const set = (b, c) => ids(page(b, { bed: c, openTo: 'new' }).r, 'new').filter((id, i) => { const cd = all(page(b, { bed: c, openTo: 'new' }).r, 'new')[i]; return cd.tier === 'a' || cd.tier === 'b'; }).join(',');
  const seen = new Set(); BUDGETS.forEach((b) => ['1br', '2br', '3br', '4br-plus'].forEach((c) => seen.add(c + '|' + set(b, c))));
  const by = {}; seen.forEach((x) => { const [c, s] = x.split('|'); (by[c] = by[c] || new Set()).add(s); });
  const keys = Object.keys(by); for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) assert.ok([...by[keys[i]]].some((s) => !by[keys[j]].has(s)), keys[i] + ' vs ' + keys[j]);
});
t('new-launch matching ignores the inferred size (V10.3.3): the matched set is the same under the shared legacy window and under the new per-type window', () => BUDGETS.forEach((b) => CHOICES.forEach((c) => {
  const a = page(b, { bed: c, openTo: 'new' }).r, l = legacy(b, { bed: c, openTo: 'new' }); if (!a || !l) return;
  assert.deepStrictEqual(ids(a, 'new'), ids(l, 'new'), b + ' ' + c);
})));

console.log('Resale never claims a bedroom match');
t('no resale card ever carries a badge or says it matches bedrooms; the size is that of homes sold, and the layout line appears only when a bedroom was chosen', () => BUDGETS.forEach((b) => ['not-sure'].concat(CHOICES).forEach((c) => ['both', 'resale'].forEach((ty) => {
  const r = page(b, { bed: c, openTo: ty }).r; if (!r) return;
  all(r, 'resale').forEach((cd) => {
    const s = cd.simple; assert.ok(!s.badge, cd.name); assert.ok(/^Recent homes sold: about [\d,]+–[\d,]+ sqft$/.test(s.size), s.size);
    assert.strictEqual(s.bedNote, c === 'not-sure' ? null : TBC, b + ' ' + c);
    const rest = Object.assign({}, s); delete rest.bedNote; assert.ok(!/bedroom|\bBR\b|matches/i.test(JSON.stringify(rest)), JSON.stringify(rest));
    assert.ok(!/matches? (the )?bedroom|\d bedroom/i.test(JSON.stringify([cd.why, cd.evidence, cd.prices, cd.meta])), cd.name);
    assert.ok(/Bedrooms and layout/.test(cd.notEvaluated), cd.name);
  });
}))));
t('a bedroom choice never changes which resale projects are listed or their order, in Both or resale-only searches', () => BUDGETS.forEach((b) => ['both', 'resale'].forEach((ty) => {
  const base = page(b, { openTo: ty }).r; if (!base) return;
  CHOICES.forEach((c) => assert.deepStrictEqual(ids(page(b, { bed: c, openTo: ty }).r, 'resale'), ids(base, 'resale'), b + ty + c));
})));
t('a bedroom choice never changes any size window', () => BUDGETS.forEach((b) => ['both', 'resale', 'new'].forEach((ty) => {
  const w = JSON.stringify(page(b, { openTo: ty }).SW.sizes); CHOICES.forEach((c) => assert.strictEqual(JSON.stringify(page(b, { bed: c, openTo: ty }).SW.sizes), w));
})));

console.log('Wording');
t('header: Both search, resale-only search, and no note when Not sure; Resale stays first, New launch second', () => [1800000, 2200000, 2600000].forEach((b) => {
  const r = page(b, { bed: '3br' }).r; assert.strictEqual(r.bedroomNote, 'New launches match your selected bedrooms. Resale options match your budget and space; the exact layout still needs checking.');
  assert.deepStrictEqual(r.groups.map((g) => g.sale), ['resale', 'new']);
  assert.strictEqual(page(b, { bed: '3br', openTo: 'resale' }).r.bedroomNote, 'Resale options match your budget and space; the exact layout still needs checking.');
  const n = page(b, { bed: 'not-sure' }).r; assert.strictEqual(n.bedroomNote, undefined); n.groups.forEach((g) => assert.strictEqual(g.sub, undefined));
}));
t('group subtitles: Resale says budget and space; New launch says it matches the bedrooms only when every card shown is a confirmed match', () => BUDGETS.forEach((b) => CHOICES.forEach((c) => {
  const r = page(b, { bed: c }).r; if (!r) return;
  r.groups.forEach((g) => { if (g.sale === 'resale') assert.strictEqual(g.sub, 'Matched on your budget and space'); else assert.strictEqual(g.sub, g.cards.concat(g.more || []).every((cd) => cd.simple.badge) ? 'Matches the bedrooms you chose' : 'Marked on each card where the bedrooms you chose are confirmed'); });
})));
t('no resale card, header or subtitle mentions Huttons, URA, routes or datasets', () => BUDGETS.forEach((b) => {
  const r = page(b, { bed: '3br' }).r; const txt = JSON.stringify(all(r, 'resale').map((c) => c.simple)) + r.bedroomNote + r.groups.map((g) => g.sub).join(' ');
  assert.ok(!/huttons|\bura\b|route|dataset|algorithm|inventory/i.test(txt), txt);
}));

console.log('Everything else is unchanged');
t('typed size: the page path equals the V10.3.5 path (ids and order) for every sale type, bedroom choice and priority combination', () => [[900, 1100], [1100, 1400]].forEach((sz) => [1800000, 2500000].forEach((b) => ['both', 'resale', 'new'].forEach((ty) => ['not-sure', '3br'].forEach((bed) => [[], ['location'], ['space'], ['newer'], ['freehold'], ['location', 'space'], ['space', 'location']].forEach((pr) => {
  const a = page(b, { size: sz, bed, openTo: ty, priorities: pr }).r, l = legacy(b, { size: sz, bed, openTo: ty, priorities: pr });
  const shape = (r) => JSON.stringify(r.groups.map((g) => [g.sale, g.cards.map((c) => c.id), (g.more || []).map((c) => c.id)]).concat([r.total, r.eligible, r.state]));
  assert.strictEqual(shape(a), shape(l), [sz, b, ty, bed, pr].join('|'));
}))))));
t('inferred size, one sale type: the page path equals the V10.3.5 path for every priority combination', () => BUDGETS.forEach((b) => ['resale', 'new'].forEach((ty) => ['not-sure', '2br', '3br'].forEach((bed) => [[], ['location'], ['space'], ['newer'], ['freehold'], ['location', 'space']].forEach((pr) => {
  const a = page(b, { bed, openTo: ty, priorities: pr }).r, l = legacy(b, { bed, openTo: ty, priorities: pr }); if (!a || !l) return;
  const shape = (r) => JSON.stringify(r.groups.map((g) => [g.sale, g.cards.map((c) => c.id), (g.more || []).map((c) => c.id)]).concat([r.total, r.eligible, r.state]));
  assert.strictEqual(shape(a), shape(l), [b, ty, bed, pr].join('|'));
})))));
t('inferred size, Both: each group keeps the existing order rules, equal to the same sale type searched alone, for every priority combination', () => BUDGETS.forEach((b) => ['not-sure', '3br'].forEach((bed) => [[], ['location'], ['space'], ['newer'], ['freehold'], ['location', 'space'], ['space', 'location']].forEach((pr) => {
  const both = page(b, { bed, priorities: pr }).r; if (!both) return;
  ['resale', 'new'].forEach((ty) => { const one = page(b, { bed, openTo: ty, priorities: pr }).r; if (one) assert.deepStrictEqual(ids(both, ty), ids(one, ty), [b, bed, pr, ty].join('|')); });
}))));
t('More space extends each type\'s own window upward by one band; Include nearby sizes pads each by one band both ways', () => [1500000, 2200000].forEach((b) => {
  const a = FI.sizeWindows(null, step(b), 'both', {}), s = FI.sizeWindows(null, step(b), 'both', { space: true }), p = FI.sizeWindows(null, step(b), 'both', { pad: true });
  ['resale', 'new'].forEach((ty) => { assert.strictEqual(s.sizes[ty].lo, a.sizes[ty].lo); assert.strictEqual(s.sizes[ty].hi, a.sizes[ty].hi + FI.T.sizePad); assert.strictEqual(p.sizes[ty].lo, a.sizes[ty].lo - FI.T.sizePad); assert.strictEqual(p.sizes[ty].hi, a.sizes[ty].hi + FI.T.sizePad); });
  assert.strictEqual(FI.sizeWindows({ from: 1000, to: 1100 }, step(b), 'both', { pad: true, space: true }).sizes.resale.lo, 1000);   // a typed size is never changed
}));
t('Both at budgets where New launch has no typical size: bedroom-confirmed new launches are still listed, nothing is sized from URA sales, and a plain note says so', () => [700000, 900000, 1100000, 1200000].forEach((b) => {
  const nb = page(b, { bed: 'not-sure' }).r, wb = page(b, { bed: '2br' }).r;
  if (!FI.sizeWindows(null, step(b), 'both', {}).sizes.new) {
    assert.ok(nb.sizeGap && nb.sizeGap.indexOf('new') > -1); assert.strictEqual(ids(nb, 'new').length, 0); assert.ok(ids(nb, 'resale').length);
    all(wb, 'new').forEach((cd) => assert.ok(cd.simple.badge && cd.tier !== 'c' && cd.tier !== 'd', cd.name));
    assert.ok(!wb.sizeGap || wb.sizeGap.indexOf('new') < 0);
  }
}));
t('the engine version and the public inventory schema are unchanged', () => { assert.strictEqual(FI.VERSION, 'find-v2'); assert.strictEqual(FI.T.invSchema, 2); });

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
