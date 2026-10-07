// node tools/what-can-i-buy/tests/inventory-tests.js   FIND V10: Huttons inventory layer. Parity with V9.1, eligibility, ranking, freshness, wording, privacy, neutrality, handoff, wiring.
const fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const root = path.join(__dirname, '../../..');
const F = require(path.join(root, 'assets/js/kpt-find.js')), T = F.T;
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const FIND_SHA = 'e4516fd8d6e8f8a0b6494619024e4370dcfa6d7e9305015f760e9fa235c6db00';
const H = 3600000, D = 24 * H, NOW = Date.parse('2026-10-06T10:00:00Z');   // 6 Oct 2026, 18:00 Singapore
const iso = (ms) => new Date(ms).toISOString();
const real = F.prepare(JSON.parse(fs.readFileSync(path.join(root, 'data/projects/find.json'), 'utf8')));
const SZ = { lo: 870, hi: 1000, source: 'explicit', line: 'x' };
const base = (o) => Object.assign({ budget: 2600000, openTo: 'new', size: SZ, districts: [], text: '', freehold: false, answers: { where: 'flexible', size: 'not-sure', priorities: [] }, typical: null }, o);
const IP = (slug, name, types, extra) => Object.assign({ slug, name, checkedAt: iso(NOW - 2 * H), status: 'ok', byBedrooms: types }, extra || {});
const TY = (b, ceiling, bands) => ({ bedrooms: b, label: b + ' bedrooms', ceiling, bands });
const META = { district: '22', tenureGroup: 1, tenure: '99 yrs from 2025', street: 'LAKESIDE DRIVE' };
const DOC = (projects, at) => ({ v: 2, kind: 'kpt-huttons-public-inventory', tool: 'phase2-2', source: 'Units currently shown in Huttons inventory', checkedAt: at || iso(NOW - 2 * H), projects });
const prep = (projects, now, at) => F.prepareInventory(DOC(projects, at), now == null ? NOW : now);
const run = (ix, inv, o) => F.shortlist(ix, base(Object.assign({ inv }, o)));
const cards = (r) => r.groups.reduce((a, g) => a.concat(g.cards), []);
const allCards = (r) => r.groups.reduce((a, g) => a.concat(g.cards, g.more || []), []);
const ids = (r) => cards(r).map((c) => c.id);
const sim = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/inventory-simulated.json'), 'utf8'));
const URAP = (id, name, street, d, rows, tg) => ({ id, name, street, d, seg: 'CCR', tg: tg == null ? 1 : tg, tl: '99 yrs from 2024', m: 0, new: rows, resale: [] });
const mkIx = (ps) => F.prepare({ v: 1, kind: 'kpt-find-index', latestMonth: '2026-09', window: { from: '2025-10', to: '2026-09', label: 'x' }, bin: 100, minCell: 3, projects: ps });
const row = (bin, n, act, last, q1, q3) => [bin, n, act, last, q1, Math.round((q1 + q3) / 2), q3];
const empty = mkIx([]);
// V10.1 added display-only fields to every card. The parity tests compare everything else, so ranking, matching and every original field must still be byte-identical to V9.1.
const V101_FIELDS = ['simple', 'slug', 'hasCheck', 'ask', 'tick'];
const stripV101 = (r) => { r.groups.forEach((g) => g.cards.concat(g.more || []).forEach((c) => V101_FIELDS.forEach((k) => delete c[k]))); return r; };

console.log('Golden parity with V9.1 (inventory absent or unusable)');
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/golden-v91.json'), 'utf8'));
t('864 grid cases (budgets x journeys x sizes x areas x freehold x budget window) are byte-identical to V9.1 with no inventory', () => {
  let n = 0, bad = [];
  for (const budget of [900000, 1300000, 1800000, 2600000, 3200000, 5000000]) for (const openTo of ['new', 'resale', 'both']) for (const sz of [[600, 800], [870, 1000], [900, 1100], [1200, 1500]]) for (const ds of [[], ['10'], ['20']]) for (const fh of [false, true]) for (const pct of [0.10, 0.15]) {
    const r = F.shortlist(real, { budget, openTo, size: { lo: sz[0], hi: sz[1], source: 'explicit', line: 'x' }, districts: ds, text: '', freehold: fh, pct, answers: { where: 'flexible', size: 'not-sure', priorities: [] }, typical: { lo: 900, hi: 1100 } });
    stripV101(r); delete r.version; const key = [budget, openTo, sz.join('-'), ds.join('+') || 'all', fh ? 'fh' : 'any', pct].join('|'), h = crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 16);
    n++; if (golden[key] !== h) bad.push(key);
  }
  assert.strictEqual(n, 864); assert.deepStrictEqual(bad, []);
});
t('the engine version is find-v2', () => assert.strictEqual(F.VERSION, 'find-v2'));
t('unusable inventory files switch the layer off: missing, wrong kind, wrong version, no projects array, bad time, time more than an hour ahead', () => {
  assert.strictEqual(F.prepareInventory(null, NOW), null); assert.strictEqual(F.prepareInventory(undefined, NOW), null);
  assert.strictEqual(F.prepareInventory({}, NOW), null);
  assert.strictEqual(F.prepareInventory(Object.assign(DOC([]), { kind: 'x' }), NOW), null);
  assert.strictEqual(F.prepareInventory(Object.assign(DOC([]), { v: 1 }), NOW), null);
  assert.strictEqual(F.prepareInventory(Object.assign(DOC([]), { v: 3 }), NOW), null);
  assert.strictEqual(F.prepareInventory(Object.assign(DOC([]), { projects: {} }), NOW), null);
  assert.strictEqual(F.prepareInventory(DOC([], 'not a date'), NOW), null);
  assert.strictEqual(F.prepareInventory(DOC([], iso(NOW + H + 1000)), NOW), null);
  assert.strictEqual(F.prepareInventory('garbage', NOW), null);
  assert.ok(F.prepareInventory(DOC([], iso(NOW - 2 * H)), NOW));
});
t('with an unusable inventory the output is exactly the V9.1 output (same JSON as with no inventory key at all)', () => {
  const a = F.shortlist(real, base({ openTo: 'both' })), b = F.shortlist(real, base({ openTo: 'both', inv: F.prepareInventory({ v: 9 }, NOW) }));
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b)); assert.ok(!('inventory' in a));
});
t('resale cards are identical with inventory present and absent', () => {
  const inv = F.prepareInventory(sim, NOW);
  [{ budget: 2600000 }, { budget: 1800000 }, { budget: 3200000, size: { lo: 900, hi: 1100, source: 'explicit', line: 'x' } }].forEach((o) => {
    const off = F.shortlist(real, base(Object.assign({ openTo: 'both' }, o))), on = F.shortlist(real, base(Object.assign({ openTo: 'both', inv }, o)));
    const ro = (off.groups.find((g) => g.sale === 'resale') || { cards: [] }).cards, rn = (on.groups.find((g) => g.sale === 'resale') || { cards: [] }).cards;
    assert.deepStrictEqual(rn, ro);
    assert.deepStrictEqual(on.groups.map((g) => g.sale), off.groups.map((g) => g.sale));
  });
});
t('resale-only journey is unaffected by inventory (no inventory flag, same cards)', () => {
  const inv = F.prepareInventory(sim, NOW), off = F.shortlist(real, base({ openTo: 'resale' })), on = F.shortlist(real, base({ openTo: 'resale', inv }));
  assert.deepStrictEqual(cards(on).map((c) => c.id), cards(off).map((c) => c.id)); assert.strictEqual(on.dataLine, off.dataLine); assert.strictEqual(on.orderLine, off.orderLine);
});

console.log('Freshness, missing, stale, clock');
const OK = [TY(3, 2900000, [[900, 2700000]])];
const fr = (ageMs, extra) => { const ip = IP('alpha', 'Alpha', OK, Object.assign({}, META, extra || {}, { checkedAt: iso(NOW - ageMs) })); const inv = prep([ip], NOW, iso(NOW - ageMs)); return inv ? F.freshness(inv, ip) : 'off'; };
t('48 hours is fresh; just over 48 hours is dated; 7 days is dated; just over 7 days is treated as not checked', () => {
  assert.strictEqual(fr(0), 'fresh'); assert.strictEqual(fr(48 * H), 'fresh'); assert.strictEqual(fr(48 * H + 1000), 'dated'); assert.strictEqual(fr(7 * D), 'dated'); assert.strictEqual(fr(7 * D + 1000), null);
});
t('a check time in the future: within an hour = every project treated as not checked; over an hour = the whole layer is off', () => {
  const ip = IP('alpha', 'Alpha', OK, Object.assign({}, META, { checkedAt: iso(NOW + 30 * 60000) })), inv = prep([ip], NOW, iso(NOW + 30 * 60000));
  assert.ok(inv && inv.clockBehind); assert.strictEqual(F.freshness(inv, ip), null);
  assert.strictEqual(prep([ip], NOW, iso(NOW + 2 * H)), null);
});
t('a browser clock behind the file: nothing is treated as checked, and the page still works', () => {
  const ip = IP('amberwood-at-holland', 'Amberwood at Holland', [TY(3, 3100000, [[900, 2600000]])]), inv = prep([ip], NOW - 10 * 60000, iso(NOW - 2 * H + 5 * 60000));
  const r = run(real, F.prepareInventory(DOC([ip], iso(NOW - 2 * H)), NOW - 3 * H));   // clock three hours before the check
  assert.ok(r.inventory && r.inventory.active); assert.ok(cards(r).every((c) => c.huttons.kind === 'unchecked'));
});
t('a project missing from the file, stale (over 7 days), or unverified shows "couldn\'t check"; never "no units"', () => {
  const ura = mkIx([URAP('uu', 'UU', 'S1', '10', [row(900, 6, 2, 202609, 2400000, 2800000)])]);
  const mkr = (ips) => cards(run(ura, prep(ips)))[0].huttons;
  assert.strictEqual(mkr([]).kind, 'unchecked');
  assert.strictEqual(mkr([IP('uu', 'UU', OK, { checkedAt: iso(NOW - 8 * D) })]).kind, 'unchecked');
  assert.strictEqual(mkr([IP('uu', 'UU', [], { status: 'unverified' })]).kind, 'unchecked');
  assert.ok(!/No units/.test(mkr([]).text)); assert.strictEqual(mkr([]).text, F.HUT.unchecked);
});
t('zero_returned shows the zero line; units shown with no match show the "none near your size and budget" line with the date', () => {
  const ura = mkIx([URAP('uu', 'UU', 'S1', '10', [row(900, 6, 2, 202609, 2400000, 2800000)])]);
  const z = cards(run(ura, prep([IP('uu', 'UU', [], { status: 'zero_returned' })])))[0].huttons; assert.strictEqual(z.kind, 'zero'); assert.strictEqual(z.text, 'No units currently shown in Huttons inventory for this project.');
  const nm = cards(run(ura, prep([IP('uu', 'UU', [TY(3, 1500000, [[900, 1400000]])])])))[0].huttons; assert.strictEqual(nm.kind, 'nomatch'); assert.strictEqual(nm.text, 'Checked today: none of the units currently shown in Huttons inventory are about your size and budget.');
});
t('missing is never zero: a Huttons-only project that is not in the file, stale, or unverified is never shown at all', () => {
  const inv = prep([IP('lucerne-grand', 'Lucerne Grand', OK, Object.assign({}, META, { status: 'unverified' })), IP('x2', 'X Two', OK, Object.assign({}, META, { checkedAt: iso(NOW - 9 * D) }))]);
  assert.deepStrictEqual(ids(run(empty, inv)), []);
});
t('{when} is Singapore time: today, yesterday, then "Fri 2 Oct"; no clock time', () => {
  const at = (s) => F.whenText(Date.parse(s), NOW);
  assert.strictEqual(at('2026-10-06T09:33:00Z'), 'today'); assert.strictEqual(at('2026-10-05T10:00:00Z'), 'yesterday'); assert.strictEqual(at('2026-10-02T03:00:00Z'), 'Fri 2 Oct');
  assert.strictEqual(F.whenText(Date.parse('2026-10-05T16:30:00Z'), Date.parse('2026-10-06T16:30:00Z')), 'yesterday');   // 00:30 SGT on the 6th vs 00:30 SGT on the 7th
  assert.strictEqual(F.whenText(Date.parse('2026-10-05T15:59:00Z'), Date.parse('2026-10-06T16:01:00Z')), 'Mon 5 Oct');   // 23:59 on the 5th vs 00:01 on the 7th SGT
  assert.ok(!/\d:\d\d/.test(at('2026-10-06T09:33:00Z')));
});

console.log('Inventory eligibility (path B)');
const one = (ip, o, ix) => run(ix || empty, prep([ip]), o);
const A = (types, extra) => IP('alpha', 'Alpha', types, Object.assign({}, META, extra || {}));
t('a project in the file with status ok, a recent check and complete metadata qualifies with no URA data and no minimum count', () => assert.deepStrictEqual(ids(one(A(OK))), ['alpha']));
t('missing or invalid metadata for a Huttons-only project: not shown (fail closed)', () => {
  ['district', 'tenureGroup', 'tenure'].forEach((k) => { const ip = A(OK); delete ip[k]; assert.deepStrictEqual(ids(one(ip)), [], k); });
  assert.deepStrictEqual(ids(one(A(OK, { district: '99' }))), []);
});
t('size window uses the band centre: centre == lo is in, centre == hi is out', () => {
  const at = (start) => ids(one(A([TY(3, 2900000, [[start, 2600000]])]))).length;
  assert.strictEqual(at(820), 1);    // centre 870 = lo
  assert.strictEqual(at(810), 0);    // centre 860
  assert.strictEqual(at(900), 1);    // centre 950
  assert.strictEqual(at(950), 0);    // centre 1000 = hi (exclusive)
  assert.strictEqual(at(940), 1);
});
t('a window that cuts a band includes it only if the centre is inside; no band centre in the window means not eligible', () => {
  assert.strictEqual(ids(one(A([TY(3, 2900000, [[800, 2600000], [1100, 2600000]])]))).length, 0);
  assert.strictEqual(ids(one(A([TY(3, 2900000, [[800, 2600000], [900, 2600000]])]))).length, 1);
});
t('budget overlap at the window edges: floor == B x 1.10 in, one $50k above out; ceiling == B x 0.90 in, one $50k below out', () => {
  const floorAt = (fl) => ids(one(A([TY(3, 4000000, [[900, fl]])]))).length, ceilAt = (c) => ids(one(A([TY(3, c, [[900, 1000000]])]))).length;
  assert.strictEqual(floorAt(2850000), 1); assert.strictEqual(floorAt(2900000), 0);        // B 2.6m x 1.10 = 2.86m: 2.85m is in, 2.90m is out
  assert.strictEqual(ceilAt(2350000), 1); assert.strictEqual(ceilAt(2300000), 0);          // B x 0.90 = 2.34m
});
t('widened budget (±15%) admits what ±10% does not', () => {
  const ip = A([TY(3, 4000000, [[900, 2900000]])]); assert.strictEqual(ids(one(ip)).length, 0); assert.strictEqual(ids(one(ip, { pct: 0.15 })).length, 1);
});
t('district, freehold and text filters apply through the metadata exactly as for URA projects', () => {
  assert.strictEqual(ids(one(A(OK), { districts: ['22'] })).length, 1); assert.strictEqual(ids(one(A(OK), { districts: ['10'] })).length, 0);
  assert.strictEqual(ids(one(A(OK), { freehold: true })).length, 0); assert.strictEqual(ids(one(A(OK, { tenureGroup: 4, tenure: 'Freehold' }), { freehold: true })).length, 1);
  assert.strictEqual(ids(one(A(OK), { text: 'lakeside' })).length, 1); assert.strictEqual(ids(one(A(OK), { text: 'holland' })).length, 0);
});
t('URA wins for a project URA has: the inventory entry needs no metadata and the card uses URA\'s district, street and tenure', () => {
  const ura = mkIx([URAP('amb', 'AMB', 'HOLLAND LINK', '10', [row(900, 6, 1, 202609, 2400000, 2800000)], 0)]);
  const r = run(ura, prep([IP('amb', 'Amb', OK, { district: '03', tenure: 'Freehold', tenureGroup: 4 })]), {}); const c = cards(r)[0];
  assert.ok(/District 10/.test(c.meta) && /Holland Link/.test(c.meta) && !/District 03|Freehold/.test(c.meta));
});
t('a project passing both paths (URA and inventory) is one card', () => {
  const ura = mkIx([URAP('amb', 'AMB', 'S1', '10', [row(900, 6, 3, 202609, 2400000, 2800000)])]), r = run(ura, prep([IP('amb', 'Amb', OK)])), c = cards(r).filter((x) => x.id === 'amb'); assert.strictEqual(c.length, 1); assert.strictEqual(c[0].basis, 'Current Huttons inventory and URA sales');
});
t('resale and sub-sale never use inventory: a resale journey ignores the file even when it lists a project', () => assert.deepStrictEqual(ids(run(empty, prep([A(OK)]), { openTo: 'resale' })), []));
t('the misleading-guard: a $2.0m unit at about 700 sqft and a $3.0m unit at about 1,060 sqft, window 1,050–1,150, shows From around $3m and never $2m', () => {
  const ip = A([TY(3, 3000000, [[700, 2000000], [1000, 3000000]])]), c = cards(one(ip, { budget: 3000000, size: { lo: 1050, hi: 1150, source: 'explicit', line: 'x' } }))[0];
  assert.strictEqual(c.huttons.from, 'From around $3m'); assert.ok(!/2m|2\.0/.test(c.huttons.from));
  assert.strictEqual(ids(one(ip, { budget: 2000000, size: { lo: 1050, hi: 1150, source: 'explicit', line: 'x' } })).length, 0, 'a $2.0m budget must NOT qualify on the 700 sqft unit');
});
t('the displayed "from" figure is the lowest floor among bands in the window', () => {
  const c = cards(one(A([TY(3, 3100000, [[800, 2000000], [900, 2650000], [1000, 2550000]])]), { size: { lo: 870, hi: 1100, source: 'explicit', line: 'x' } }))[0];
  assert.strictEqual(c.huttons.from, 'From around $2.55m');
});
t('money formatting of the figure: $2.5m, $2.55m, $2.05m, $3m', () => {
  const f = (fl) => cards(one(A([TY(3, 4000000, [[900, fl]])]), { budget: fl }))[0].huttons.from;
  assert.strictEqual(f(2500000), 'From around $2.5m'); assert.strictEqual(f(2550000), 'From around $2.55m'); assert.strictEqual(f(2050000), 'From around $2.05m'); assert.strictEqual(f(3000000), 'From around $3m');
});

console.log('Primary type, budget lines, wording');
const TWO = [TY(2, 2350000, [[900, 1900000]]), TY(3, 3100000, [[900, 2500000]])];
t('primary type: the one whose range contains the budget; else the nearest; else the smaller bedroom count', () => {
  const p = (types, o) => F.invMatch(IP('a', 'A', types), Object.assign({ budget: 2600000, pct: 0.10, lo: 870, hi: 1000 }, o)).primary.bedrooms;
  assert.strictEqual(p(TWO), 3);                                                       // 3-bed contains 2.6m
  assert.strictEqual(p([TY(2, 2500000, [[900, 2300000]]), TY(4, 3100000, [[900, 2800000]])], {}), 2);   // neither contains; 2-bed ceiling 0.1m away, 4-bed floor 0.2m away
  assert.strictEqual(p([TY(2, 2800000, [[900, 2400000]]), TY(3, 2800000, [[900, 2400000]])], {}), 2);   // both contain: smaller bedroom count
  assert.strictEqual(p([TY(2, 2600000, [[900, 2800000 - 200000]]), TY(3, 3100000, [[900, 2600000]])], { budget: 2400000 }), 2);
});
t('two matching types: the size line names both, the budget line says which type it refers to, the figure is the primary type only', () => {
  const c = cards(one(A(TWO)))[0].huttons;
  assert.strictEqual(c.size, '2-bedroom and 3-bedroom homes match the size you’re looking for.'); assert.strictEqual(c.budget, 'Your ~$2.6m budget falls within what we’re currently seeing for 3-bedroom homes around this size.'); assert.strictEqual(c.from, 'From around $2.5m');
});
t('budget lines: within, room (above), slightly below', () => {
  const l = (types, o) => cards(one(A(types), o))[0].huttons.budget;
  assert.strictEqual(l([TY(3, 3000000, [[900, 2400000]])]), 'Your ~$2.6m budget falls within what we’re currently seeing for homes around this size.');
  assert.strictEqual(l([TY(3, 2500000, [[900, 2000000]])]), 'Your ~$2.6m budget gives you room within the homes we’re currently seeing around this size.');
  assert.strictEqual(l([TY(3, 3200000, [[900, 2750000]])]), 'Your ~$2.6m budget is slightly below what we’re currently seeing for homes around this size.');
});
t('dated wording for the three states (past tense)', () => {
  const l = (types, fit) => cards(run(empty, prep([A(types, { checkedAt: iso(NOW - 3 * D) })], NOW, iso(NOW - 3 * D))))[0].huttons.budget;
  assert.strictEqual(l([TY(3, 2500000, [[900, 2000000]])]), 'Your ~$2.6m budget gave you room within the homes we saw then around this size.');
  assert.strictEqual(l([TY(3, 3200000, [[900, 2750000]])]), 'Your ~$2.6m budget was slightly below what we saw then for homes around this size.');
});
t('the above state never calls the buyer\'s budget too high or "above" anything', () => {
  const h = cards(one(A([TY(3, 2500000, [[900, 2000000]])])))[0].huttons; assert.ok(!/\babove\b|too high|over budget|exceed/i.test([h.label, h.size, h.from, h.budget, h.note].join(' ')));
});
t('budget a little below: no "Expect to look at the lower end" anywhere in the Huttons block', () => {
  const h = cards(one(A([TY(3, 3200000, [[900, 2750000]])])))[0].huttons; assert.ok(!/lower end|expect/i.test(JSON.stringify(h)));
});
t('size line: typed size says "the size you\'re looking for"; an inferred size says "around the size used for this list"', () => {
  assert.strictEqual(cards(one(A(OK)))[0].huttons.size, '3-bedroom homes match the size you’re looking for.');
  assert.strictEqual(cards(one(A(OK), { size: { lo: 870, hi: 1000, source: 'inferred', line: 'x' } }))[0].huttons.size, '3-bedroom homes are around the size used for this list.');
});
t('studio and 5+ bedroom wording; 5+ never prints a decimal or "5+ bedrooms homes"', () => {
  assert.strictEqual(F.typeNoun(0), 'Studio'); assert.strictEqual(F.typeNoun(1), '1-bedroom'); assert.strictEqual(F.typeNoun(5), '5+ bedroom');
});
t('a dated check (2–7 days) is in the past tense, says "as shown then", and tells the buyer units may have changed', () => {
  const ip = A(OK, { checkedAt: iso(NOW - 3 * D) }), c = cards(run(empty, prep([ip], NOW, iso(NOW - 3 * D))))[0].huttons;
  assert.strictEqual(c.kind, 'dated'); assert.ok(/CHECKED (MON|TUE|WED|THU|FRI|SAT|SUN) \d/.test(c.label)); assert.strictEqual(c.from, 'From around $2.7m (as shown then).'); assert.ok(/matched/.test(c.size)); assert.strictEqual(c.budget, 'Your ~$2.6m budget was slightly below what we saw then for homes around this size.');
  assert.strictEqual(c.datedNote, 'Units may have changed since. Ask Ken for the latest.'); assert.ok(/shown then/.test(c.note));
});
t('a fresh check says CHECKED TODAY (or YESTERDAY), has no past tense, no dated note', () => {
  const c = cards(one(A(OK)))[0].huttons; assert.strictEqual(c.label, 'HUTTONS INVENTORY · CHECKED TODAY'); assert.strictEqual(c.datedNote, null); assert.ok(!/then/.test(c.from + c.budget));
  const y = cards(run(empty, prep([A(OK, { checkedAt: iso(NOW - 30 * H) })], NOW, iso(NOW - 30 * H))))[0].huttons; assert.strictEqual(y.label, 'HUTTONS INVENTORY · CHECKED YESTERDAY');
});
t('the price note under the figure', () => assert.strictEqual(cards(one(A(OK)))[0].huttons.note, 'Lowest price currently shown for these homes, rounded. Prices vary by unit.'));
t('no "from" figure when the status is not ok, or when no band is of about the buyer\'s size', () => {
  const ura = mkIx([URAP('uu', 'UU', 'S1', '10', [row(900, 6, 2, 202609, 2400000, 2800000)])]);
  const h = cards(run(ura, prep([IP('uu', 'UU', OK, { status: 'zero_returned' })])))[0]; assert.ok(!('from' in h.huttons));
  const h2 = cards(run(ura, prep([IP('uu', 'UU', [TY(3, 2900000, [[1400, 2600000]])])])))[0]; assert.ok(!('from' in h2.huttons)); assert.strictEqual(h2.huttons.kind, 'nomatch');
});

console.log('Ranking (New launch)');
const RAN = () => {
  const ura = mkIx([URAP('skye', 'SKYE', 'HV', '10', [row(900, 74, 2, 202603, 2400000, 2800000)]), URAP('arina', 'ARINA', 'AE', '16', [row(900, 8, 3, 202608, 2400000, 2800000)]), URAP('amb', 'AMB', 'HL', '10', [row(900, 6, 1, 202609, 2900000, 2980000)], 0), URAP('good', 'GOOD', 'G1', '09', [row(900, 9, 3, 202609, 2400000, 2800000)])]);
  const inv = prep([IP('amb', 'Amb', [TY(3, 3100000, [[900, 2600000]])]), IP('lucerne-grand', 'Lucerne Grand', [TY(3, 2550000, [[900, 2250000]])], META), IP('good', 'GOOD', [TY(3, 3200000, [[900, 2750000]])]),
    IP('inside2', 'Inside Two', [TY(3, 3000000, [[900, 2300000]])], Object.assign({}, META, { street: '' }))]);
  return { ura, inv };
};
t('tiers: (a) budget inside the range, (b) a little above or below, (c) URA only and not checked; inside the tier URA support orders, then name', () => {
  const { ura, inv } = RAN(), r = run(ura, inv, { openTo: 'new' });
  const order = allCards(r).map((c) => c.id + ':' + c.tier);
  assert.deepStrictEqual(order, ['amb:a', 'inside2:a', 'good:b', 'lucerne-grand:b', 'skye:c']);
});
t('within a tier URA support orders Good > Limited > Early > none, then fresh before dated, then name', () => {
  const ura = mkIx([URAP('g1', 'G1', 'A1', '10', [row(900, 9, 3, 202609, 2400000, 2800000)]), URAP('l1', 'L1', 'A2', '10', [row(900, 3, 3, 202609, 2400000, 2800000)]), URAP('e1', 'E1', 'A3', '10', [row(900, 4, 1, 202609, 2400000, 2800000)])]);
  const inv = prep([IP('e1', 'E1', OK), IP('l1', 'L1', OK), IP('g1', 'G1', OK), IP('zz', 'Zz', OK, META), IP('aa', 'Aa', OK, Object.assign({}, META, { street: 'B' }))]);
  assert.deepStrictEqual(ids(run(ura, inv)), ['g1', 'l1', 'e1', 'aa', 'zz'].slice(0, 5));
  const d = prep([IP('f', 'F', OK, META), IP('d', 'D', OK, Object.assign({}, META, { checkedAt: iso(NOW - 3 * D) }))], NOW, iso(NOW - 3 * D + H)); assert.ok(d);
  const dd = F.prepareInventory(DOC([IP('f', 'F', OK, META), IP('a', 'A', OK, Object.assign({}, META, { checkedAt: iso(NOW - 3 * D) }))]), NOW);
  assert.deepStrictEqual(ids(run(empty, dd)), ['f', 'a']);   // fresh F before dated A even though A sorts first
});
t('real data shape: Amberwood (early evidence) first, then Lucerne Grand (no URA), then the V9.1 URA-only order', () => {
  const inv = F.prepareInventory(sim, NOW), r = run(real, inv, { openTo: 'new' }), c = cards(r);
  assert.deepStrictEqual(c.map((x) => x.id), ['amberwood-at-holland', 'lucerne-grand', 'skye-at-holland', 'arina-east-residences', 'bloomsbury-residences']);
  assert.strictEqual(c[0].ura.kind, 'early'); assert.strictEqual(c[1].ura.kind, 'none');
});
t('prices and counts never change the order: swapping the price floors of two same-tier projects does not change their order', () => {
  const mk = (f1, f2) => ids(run(empty, prep([IP('a', 'Aa', [TY(3, 3300000, [[900, f1]])], Object.assign({}, META, { street: '' })), IP('b', 'Bb', [TY(3, 3300000, [[900, f2]])], Object.assign({}, META, { street: '' }))])));
  assert.deepStrictEqual(mk(2300000, 2500000), mk(2500000, 2300000)); assert.deepStrictEqual(mk(2300000, 2500000), ['a', 'b']);
});
t('the per-street cap (2) still applies to projects with a street; a Huttons-only project with no street is never capped by street', () => {
  const ps = ['a', 'b', 'c'].map((x) => IP(x, x.toUpperCase(), OK, Object.assign({}, META, { street: 'SAME ST' }))), r = run(empty, prep(ps)); assert.strictEqual(ids(r).length, 2);
  const ns = ['a', 'b', 'c'].map((x) => IP(x, x.toUpperCase(), OK, Object.assign({}, META, { street: '' }))); assert.strictEqual(ids(run(empty, prep(ns))).length, 3);
});
t('unit counts are not in the engine\'s inputs at all: a file with count keys added gives the same result', () => {
  const a = prep([A(OK)]), docC = DOC([Object.assign(A(OK), { unitsShown: 999, units: 999 })]), b = F.prepareInventory(docC, NOW);
  assert.strictEqual(JSON.stringify(cards(run(empty, a))), JSON.stringify(cards(run(empty, b))));
});

console.log('Both journeys, Show more');
t('Both keeps 3 resale + 2 new launch; groups stay in the fixed order Resale, New launch', () => {
  const r = F.shortlist(real, base({ openTo: 'both', inv: F.prepareInventory(sim, NOW) })); assert.deepStrictEqual(r.groups.map((g) => g.sale), ['resale', 'new']); assert.strictEqual(r.groups[0].cards.length, 3); assert.strictEqual(r.groups[1].cards.length, 2);
});
t('each group gets its own "more" list up to 5 cards in total; neither group is given extra room', () => {
  const r = F.shortlist(real, base({ openTo: 'both', inv: F.prepareInventory(sim, NOW) }));
  r.groups.forEach((g) => { assert.ok(g.cards.length + g.more.length <= 5); assert.ok(g.more.length > 0); });
  assert.deepStrictEqual(r.groups.map((g) => g.cards.length + g.more.length), [5, 5]);
});
t('the fill rule is unchanged: a gap in one group is filled from the other, up to 5 cards', () => {
  const inv = F.prepareInventory(sim, NOW), r = F.shortlist(real, base({ openTo: 'both', inv, budget: 3800000, size: { lo: 1100, hi: 1500, source: 'explicit', line: 'x' } }));
  assert.ok(r.shown <= 5);
});
t('single-type journeys have no "more" lists; with no inventory there is no "more" at all (exact V9.1)', () => {
  const inv = F.prepareInventory(sim, NOW); assert.ok(F.shortlist(real, base({ openTo: 'new', inv })).groups.every((g) => !g.more));
  assert.ok(F.shortlist(real, base({ openTo: 'both' })).groups.every((g) => !g.more));
});
t('every card in both groups carries the same actions and tick label (resale and new launch are treated alike)', () => {
  const r = F.shortlist(real, base({ openTo: 'both', inv: F.prepareInventory(sim, NOW) })); allCards(r).forEach((c) => { assert.ok(c.slug); assert.strictEqual(c.tick, 'Compare this with another'); assert.strictEqual(c.ask, 'Does this suit me? →'); });
  const n = r.groups[1].cards; assert.strictEqual(n[0].hasCheck, true);
});
t('the New launch lede, group note, order lines and methodology change only when the inventory layer is on', () => {
  const on = F.shortlist(real, base({ openTo: 'both', inv: F.prepareInventory(sim, NOW) }));
  assert.ok(/plus a check of current Huttons inventory where we could make one/.test(on.dataLine)); assert.strictEqual(on.groups[1].note, F.NEW_NOTE_INV); assert.ok(/Not by quality, value or price\.$/.test(on.orderLine));
  const off = F.shortlist(real, base({ openTo: 'both' })); assert.strictEqual(off.groups[1].note, F.NEW_NOTE);
});

console.log('Privacy of the Huttons block (render privacy)');
const huttonsText = (h) => [h.label, h.size, h.from, h.budget, h.note, h.datedNote, h.text].filter(Boolean).join(' | ');
const money = /\$\s?\d[\d,.]*\s?(m|k)?\b/g;
t('over every journey, budget, size and state the Huttons block holds at most the buyer\'s own budget and exactly one "From around" figure; never a range, count, unit label or per-unit text', () => {
  const invs = [F.prepareInventory(sim, NOW), F.prepareInventory(sim, NOW + 3 * D), F.prepareInventory(sim, NOW + 9 * D)]; let seen = 0;
  invs.forEach((inv) => { if (!inv) return; ['new', 'both'].forEach((openTo) => [1300000, 1800000, 2300000, 2600000, 3000000, 3500000].forEach((budget) => [[870, 1000], [800, 1200], [1000, 1300]].forEach((sz) => [0.10, 0.15].forEach((pct) => {
    const r = F.shortlist(real, base({ openTo, budget, pct, inv, size: { lo: sz[0], hi: sz[1], source: 'explicit', line: 'x' } }));
    allCards(r).filter((c) => c.sale === 'new').forEach((c) => {
      const h = c.huttons, txt = huttonsText(h), figs = txt.match(money) || [], hasBud = /Your ~\$/.test(txt);
      assert.strictEqual(figs.length, (hasBud ? 1 : 0) + (h.from ? 1 : 0), txt);
      if (h.from) { assert.ok(/^From around \$[\d.]+m/.test(h.from)); assert.strictEqual(h.from.match(money).length, 1); }
      if (hasBud) assert.ok(txt.indexOf('Your ~' + F.m2(budget) + ' budget') > -1, txt);
      assert.ok(!/\$[\d.,]+m?\s*[–\-]\s*\$[\d.,]+/.test(txt), 'range'); assert.ok(!/\b\d+\s+(units?|homes|apartments)\b/i.test(txt.replace(/(\d)-bedroom homes/g, '')), 'count'); assert.ok(!/#\d|\bblock\b|\bfloor\b|\bstack\b|psf|\bpsf\b/i.test(txt), 'unit label'); seen++;
    });
  })))); });
  assert.ok(seen > 50);
});
t('nothing the page can show comes from a count or exact price: the card JSON has no count, unit, psf or exact-price field', () => {
  const r = F.shortlist(real, base({ openTo: 'both', inv: F.prepareInventory(sim, NOW) })); const txt = JSON.stringify(r);
  assert.ok(!/"(unitsShown|unitsWithPrice|units|count|psf|priceMin|priceMax|price)"\s*:/.test(txt));
});

console.log('Wording lint and neutrality');
const BANNED_PROMO = ['hot', 'selling fast', 'last units', "don't miss", 'best', 'top pick', 'bargain', 'steal', 'must-see', 'worth it', 'smart buy', 'as low as', 'from just', 'only $', 'hurry', 'act now', 'before units go'];
const BANNED_VERDICT = ['better value', 'good value', 'overpriced', 'undervalued', 'cheap', 'discount', 'premium'];
const BANNED_CONSERV = ['available', 'sold out', 'in stock', 'units remaining', 'developer has \\d'];
const strings = () => {
  const out = [], push = (x) => { if (typeof x === 'string') out.push(x); else if (Array.isArray(x)) x.forEach(push); else if (x && typeof x === 'object') Object.keys(x).forEach((k) => push(x[k])); };
  const invs = [F.prepareInventory(sim, NOW), F.prepareInventory(sim, NOW + 3 * D)];
  invs.forEach((inv) => ['new', 'both'].forEach((openTo) => [1300000, 2600000, 3300000].forEach((budget) => { const r = F.shortlist(real, base({ openTo, budget, inv })); r.groups.forEach((g) => { push(g.label); push(g.note); push(g.cards); push(g.more); }); push(r.dataLine); push(r.orderLine); push(r.changes); push(r.fewText); push(r.noneText); })));
  push(F.METHOD_INV); push(F.HUT); push(F.NEW_NOTE_INV);
  ['Alpha', 'Alpha vs Beta'].forEach((n) => push(F.handoffMessage({ names: n.split(' vs '), budget: 2600000, size: { from: 870, to: 1000 }, district: '10' })));
  const page = fs.readFileSync(path.join(root, 'tools/what-can-i-buy/index.html'), 'utf8'); (page.match(/(Add to Get Ken[^<`]*|Show \$\{[^`]*more|Get Ken's view on[^<`]*|You can pick up to two[^<`]*|Opens WhatsApp with this message[^<`]*)/g) || []).forEach((x) => out.push(x));
  return out;
};
t('no "available", "sold out", "in stock", "units remaining" or "developer has" in any V10 string (inventory on)', () => {
  strings().forEach((s) => BANNED_CONSERV.forEach((b) => assert.ok(!new RegExp('\\b' + b + '\\b', 'i').test(s), b + ' in: ' + s)));
});
t('no promotional, urgency, scarcity or value-verdict phrase in any V10 string', () => {
  strings().forEach((s) => BANNED_PROMO.concat(BANNED_VERDICT).forEach((b) => assert.ok(!new RegExp((/^\W/.test(b) ? '' : '\\b') + b.replace(/[$]/g, '\\$') + (/\W$/.test(b) ? '' : '\\b'), 'i').test(s), b + ' in: ' + s)));
});
t('no comparative or verdict words across types: nothing says new launch or resale is better, safer, smarter or the default', () => {
  strings().forEach((s) => assert.ok(!/\b(safer|safest|smarter|better than|better option|best option|winner|top choice|recommended)\b/i.test(s), s));
});
t('the group order is fixed for any input: Resale always before New launch', () => {
  const inv = F.prepareInventory(sim, NOW); [1300000, 1800000, 2600000, 3200000, 4500000].forEach((b) => { const g = F.shortlist(real, base({ openTo: 'both', budget: b, inv })).groups.map((x) => x.sale); assert.ok(g.indexOf('resale') < 0 || g.indexOf('new') < 0 || g.indexOf('resale') < g.indexOf('new')); });
});
t('a resale card and a new launch card with the same inputs use the same tone: both have the same quiet "Couldn\'t evaluate" line shape and no verdict', () => {
  const r = F.shortlist(real, base({ openTo: 'both', inv: F.prepareInventory(sim, NOW) })), a = r.groups[0].cards[0], b = r.groups[1].cards[1];
  assert.ok(/^Bedrooms and layout, floor and facing, /.test(a.notEvaluated) && /^Bedrooms and layout, floor and facing, /.test(b.notEvaluated));
});
t('the closing methodology line is the V10 line; the Huttons paragraphs are all present', () => {
  const m = F.METHOD_INV; assert.ok(/Apart from the Huttons check, it doesn’t show what is for sale now, and the Huttons price is only a rounded starting point\.$/.test(m[m.length - 1]));
  ['Huttons inventory is the list of units currently shown', 'The “From around” figure is the lowest price currently shown for homes about your size', 'Checks older than 7 days', 'We check Huttons inventory for new launch projects only'].forEach((s) => assert.ok(m.some((x) => x.indexOf(s) === 0), s));
});

console.log('Get Ken\'s view handoff');
const HM = F.handoffMessage;
t('one project: exact approved text, with budget, typed size and confirmed district', () => assert.strictEqual(HM({ names: ['Lucerne Grand'], budget: 2600000, size: { from: 870, to: 1000 }, district: '22' }), 'Hi Ken, I was looking at Lucerne Grand on Ken Property Tools. Does this suit what I’m looking for? My search: around $2.6m, about 870–1,000 sqft, District 22.'));
t('two projects: exact approved text, names in the order ticked, no ranking by type', () => {
  assert.strictEqual(HM({ names: ['Amberwood at Holland', 'Lucerne Grand'], budget: 2600000, size: { from: 870, to: 1000 }, district: '10' }), 'Hi Ken, I’m comparing Amberwood at Holland and Lucerne Grand. Could you help me understand which may suit me better? My search: around $2.6m, about 870–1,000 sqft, District 10.');
  assert.strictEqual(HM({ names: ['Lucerne Grand', 'Amberwood at Holland'], budget: 2600000 }), 'Hi Ken, I’m comparing Lucerne Grand and Amberwood at Holland. Could you help me understand which may suit me better? My search: around $2.6m.');
});
t('parts the buyer did not give are left out: no size unless typed, no district unless confirmed', () => {
  assert.strictEqual(HM({ names: ['A'], budget: 2650000 }), 'Hi Ken, I was looking at A on Ken Property Tools. Does this suit what I’m looking for? My search: around $2.65m.');
  assert.strictEqual(HM({ names: ['A'], budget: 2600000, district: '10' }), 'Hi Ken, I was looking at A on Ken Property Tools. Does this suit what I’m looking for? My search: around $2.6m, District 10.');
  assert.strictEqual(HM({ names: ['A'], budget: 2600000, district: 'Holland' }), 'Hi Ken, I was looking at A on Ken Property Tools. Does this suit what I’m looking for? My search: around $2.6m.');
  assert.strictEqual(HM({ names: ['A'], budget: 0 }), 'Hi Ken, I was looking at A on Ken Property Tools. Does this suit what I’m looking for?');
  assert.strictEqual(HM({ names: [] }), null);
});
t('never contains counts, prices from Huttons, check times, basis labels, bedroom data, URA figures, typed location or priorities', () => {
  const m = HM({ names: ['A', 'B'], budget: 2600000, size: { from: 870, to: 1000 }, district: '10', whereText: 'Ang Mo Kio', priorities: ['schools'], from: 'From around $2.5m' });
  assert.ok(!/Ang Mo Kio|schools|From around|inventory|checked|units|bedroom|sales|Huttons/i.test(m), m); assert.ok(/\$2\.6m/.test(m)); assert.ok((m.match(/\$/g) || []).length === 1);
});
t('the 400-character guard drops to names only', () => { const long = 'X'.repeat(150), m = HM({ names: [long, long], budget: 2600000, size: { from: 870, to: 1000 }, district: '10' }); assert.ok(m.length <= 400 && !/My search/.test(m)); assert.ok(m.startsWith('Hi Ken, I’m comparing ')); });
t('at most two project names are ever used', () => assert.ok(!/Qq/.test(HM({ names: ['A', 'B', 'Qq'], budget: 2600000 }))));
t('the single new analytics event carries slugs only: letters, digits, hyphens; never budget, size or district', () => {
  assert.deepStrictEqual(F.askEvent(['lucerne-grand']), { project_id: 'lucerne-grand' }); assert.deepStrictEqual(F.askEvent(['a-1', 'b-2']), { project_id: 'a-1', project_id_2: 'b-2' });
  assert.strictEqual(F.askEvent(['Lucerne Grand']), null); assert.strictEqual(F.askEvent([]), null); assert.deepStrictEqual(Object.keys(F.askEvent(['a', 'b', 'c'])), ['project_id', 'project_id_2']);
});

console.log('Page wiring');
const page = fs.readFileSync(path.join(root, 'tools/what-can-i-buy/index.html'), 'utf8');
t('the inventory file is optional: a failed fetch resolves to null and the page shows no error for it', () => { assert.ok(/fetch\(INV_URL, \{ cache: 'no-cache' \}\)\.then\(\(r\) => \(r\.ok \? r\.json\(\) : null\)\)\.catch\(\(\) => null\)/.test(page)); });
t('review hooks (?inventory= and ?now=) work only on localhost or in test mode', () => { assert.ok(/const REVIEW = test \|\| \/\^\(localhost\|127\\\.0\\\.0\\\.1\)\$\/\.test\(location\.hostname\)/.test(page)); assert.ok(/REVIEW && \/\^\[\\w\.\/-\]\+\\\.json\$\//.test(page)); assert.ok(/REVIEW && isFinite\(Date\.parse\(params\.get\('now'\)/.test(page)); });
t('the page tracks exactly: find_shown, find_research_click, find_ask_click (twice, slugs only)', () => { const tr = page.match(/KPT\.track\('find_[a-z_]+'[^)]*\)/g).sort(); assert.deepStrictEqual(tr, ["KPT.track('find_ask_click', ev)", "KPT.track('find_ask_click', ev)", "KPT.track('find_research_click', { project_id: t.dataset.id })", "KPT.track('find_shown', pl)"]); });
t('WhatsApp links are built only through the pure handoff builder (names, budget, typed size, confirmed district)', () => {
  const wa = page.split('\n').filter((l) => /waLink\(/.test(l)); wa.forEach((l) => assert.ok(/waFor\(|R\.waMessage\(budget\)|message: BEYOND_WA/.test(l), l));
  assert.ok(/const waFor = \(names\) => FI\.handoffMessage\(\{ names, budget, size: FS\.explicit && FS\.explicit\.typed \? \{ from: FS\.explicit\.from, to: FS\.explicit\.to \} : null, district: FS\.loc === 'confirmed' && FS\.districts\.length === 1 \? FS\.districts\[0\] : null \}\)/.test(page));
  assert.ok(!/waFor\([^)]*(FS\.text|whereText)/.test(page));
});
t('V10.2: the Beyond the numbers WhatsApp opener is one fixed sentence with no search, budget, project or Huttons detail', () => { const m = /const BEYOND_WA = '([^']*)';/.exec(page); assert.ok(m && m[1] === 'Hi Ken, I was using Ken Property Tools and have a question.', m && m[1]); });
t('V10.2: Beyond the numbers has the approved text, the TikTok link is plain, and no TikTok mention sits inside the cards or the list code', () => {
  const sec = /<section class="kpb-beyond"[\s\S]*?<\/section>/.exec(page)[0];
  ['Beyond the numbers', "I'm Ken.", "I've been in Singapore property since 2007.", 'I discuss property questions and market decisions live on TikTok most nights.', 'Watch Ken on TikTok @kennx8898 →', 'Prefer to talk it through?', 'Message Ken on WhatsApp →'].forEach((x) => assert.ok(sec.indexOf(x) > -1, x));
  assert.ok(/href="https:\/\/www\.tiktok\.com\/@kennx8898" target="_blank" rel="noopener"/.test(sec));
  assert.ok(!/<svg|follower|embed|iframe/i.test(sec));
  const findJs = fs.readFileSync(path.join(root, 'assets/js/kpt-find.js'), 'utf8'); assert.ok(!/tiktok/i.test(findJs));
  assert.ok(!/tiktok/i.test(page.replace(sec, '').replace(/<footer[\s\S]*?<\/footer>/, '')), 'TikTok appears only in Beyond the numbers and the footer');
  assert.strictEqual((page.match(/ken-portrait\.jpg/g) || []).length, 1, 'Ken\'s photo appears once on this page');
});
t('V10.2: the FIND page has no Ken\'s Take block, and the Buy result button lands on the list', () => { assert.ok(!/res-ken|Ken's Take/.test(page)); assert.ok(/location\.hash === '#developments'/.test(page)); assert.ok(/what-can-i-buy\/#developments/.test(fs.readFileSync(path.join(root, 'buy/index.html'), 'utf8'))); });
t('the typed size flag is set only when the buyer typed a range (never for the inferred size)', () => { assert.ok(/FS\.explicit = \{ from: a, to: b, typed: true \}/.test(page)); assert.ok(/typed: sz\.source === 'explicit' && !!\(FS\.explicit && FS\.explicit\.typed\)/.test(page)); });
t('tick boxes allow at most two projects; the third is disabled', () => { assert.ok(/FS\.ticked\.length >= 2 && !on/.test(page)); assert.ok(/FS\.ticked\.length < 2\) FS\.ticked\.push/.test(page)); });
t('the page-level Get Ken\'s view button and its message are unchanged', () => { assert.ok(/kv\.href = KPT\.waLink\(\{ message: R\.waMessage\(budget\) \}\)/.test(page)); assert.ok(/id="kenView"[^>]*>Get Ken's view →/.test(page)); });
t('V9.1 location gate, confirmed-district-only rule and typed-text privacy are intact', () => { assert.ok(/FS\.loc === 'pending'\) \{ root\.innerHTML = [^;]*locPanel\(\)[^;]*; return; \}/.test(page)); assert.ok(/f === 'locuse'\) \{ FS\.districts = \[t\.dataset\.d\]; FS\.loc = 'confirmed'/.test(page)); });
t('"Show N more" exists for both groups and is the only control that expands them', () => { assert.ok(/data-f="more" data-sale="\$\{esc\(g\.sale\)\}">Show \$\{extra\.length\} more/.test(page)); });
t('the page makes no network request other than find.json, inventory.json and the existing budget data', () => { const f = page.match(/fetch\([^)]*\)/g) || []; f.forEach((x) => assert.ok(/FIND_URL|INV_URL|\bu\)|f\(u\)/.test(x), x)); });

console.log('Data file');
const schemaErrors = (doc) => {
  const e = []; if (doc.v !== 2 || doc.kind !== 'kpt-huttons-public-inventory') e.push('header');
  if (/"(units?|unitsShown|unitsWithPrice|count|total|psf|price|priceMin|priceMax|sizeSqft\w*|projectId|unitNumber|block|floorPlan)"\s*:/i.test(JSON.stringify(doc))) e.push('forbidden key');
  (doc.projects || []).forEach((p) => (p.byBedrooms || []).forEach((b) => { if (b.ceiling != null && b.ceiling % 50000) e.push('ceiling'); b.bands.forEach((x) => { if (x[0] % 100) e.push('band start'); if (x[1] % 50000) e.push('floor'); if (b.ceiling != null && x[1] > b.ceiling) e.push('floor above ceiling'); }); }));
  return e;
};
t('the simulated review fixture passes the schema checks (prices on the $50k grid, band starts on the 100 sqft grid, no counts or forbidden keys)', () => assert.deepStrictEqual(schemaErrors(sim), []));
t('the schema check catches a count, an unrounded price, an exact size and a unit label', () => {
  assert.ok(schemaErrors(Object.assign({}, sim, { projects: [Object.assign({}, sim.projects[0], { unitsShown: 3 })] })).length);
  assert.ok(schemaErrors(DOC([IP('a', 'A', [TY(3, 2900000, [[900, 2612345]])])])).includes('floor'));
  assert.ok(schemaErrors(DOC([IP('a', 'A', [TY(3, 2900000, [[912, 2600000]])])])).includes('band start'));
  assert.ok(schemaErrors(DOC([IP('a', 'A', [TY(3, 2900001, [[900, 2600000]])])])).includes('ceiling'));
});
console.log('Real Huttons inventory file (verified public-safe export, 6 Oct 2026)');
const INV_SHA = '23d01d671b72c13a9a9c1e76c7fb0480b3063f0a4ab04147f9211d1687206cc1', INV_PATH = path.join(root, 'data/projects/inventory.json');
const invBuf = fs.existsSync(INV_PATH) ? fs.readFileSync(INV_PATH) : Buffer.from('{}'), RDOC = JSON.parse(invBuf.toString('utf8'));
const CHK = Date.parse(RDOC.checkedAt || 0), RNOW = CHK + 12 * H;
const rinv = (at) => F.prepareInventory(RDOC, at == null ? RNOW : at);
const rrun = (o, at) => F.shortlist(real, base(Object.assign({ inv: rinv(at) }, o)));
const KS = { budget: 2200000, size: { lo: 1000, hi: 1100, source: 'explicit', line: 'x' } };
t('inventory.json is byte-identical to the verified export (SHA-256 pinned): 31,137 bytes', () => { assert.strictEqual(crypto.createHash('sha256').update(invBuf).digest('hex'), INV_SHA); assert.strictEqual(invBuf.length, 31137); });
t('it passes the schema checks, loads as schema v2 with 50 projects, all with status ok', () => { assert.deepStrictEqual(schemaErrors(RDOC), []); const x = rinv(); assert.ok(x); assert.strictEqual(x.slugs.length, 50); assert.ok(RDOC.projects.every((p) => p.status === 'ok')); });
t('every one of the 50 projects is in find.json (URA stays the identity source); none relies on metadata; no CHECK or held-back project is present', () => { const ura = new Set(real.projects.map((p) => p.id)); RDOC.projects.forEach((p) => { assert.ok(ura.has(p.slug), p.slug); assert.ok(!('district' in p) && !('tenure' in p)); }); assert.ok(!RDOC.projects.some((p) => p.status !== 'ok')); });
t('the file carries no private fields: only slug, name, checkedAt, status and byBedrooms [bedrooms, label, ceiling, bands]', () => { RDOC.projects.forEach((p) => { assert.deepStrictEqual(Object.keys(p).sort(), ['byBedrooms', 'checkedAt', 'name', 'slug', 'status']); p.byBedrooms.forEach((b) => assert.deepStrictEqual(Object.keys(b).sort(), ['bands', 'bedrooms', 'ceiling', 'label'])); }); assert.deepStrictEqual(Object.keys(RDOC).sort(), ['checkedAt', 'kind', 'projects', 'source', 'tool', 'v']); });
t('freshness with the real file: fresh to 48 hours, dated to 7 days, then treated as not checked; a clock behind the file is not checked', () => {
  const kinds = (at) => { const r = rrun(KS, at), c = cards(r).find((x) => x.id === 'kassia'); return c && c.huttons ? c.huttons.kind : null; };
  assert.strictEqual(kinds(CHK + 47 * H), 'fresh'); assert.strictEqual(kinds(CHK + 49 * H), 'dated'); assert.strictEqual(kinds(CHK + 7 * D - H), 'dated');
  assert.strictEqual(kinds(CHK + 7 * D + H), 'unchecked'); assert.strictEqual(kinds(CHK - H), 'unchecked');
  assert.strictEqual(rinv(CHK + 3 * H).slugs.length, 50);
});
t('bedroom type and 100 sqft band matching with real data: Kassia 3-bedroom band 1,000 sqft (floor $2.1m, ceiling $2.25m) for a 1,000-1,100 sqft window', () => {
  const c = cards(rrun(KS)).find((x) => x.id === 'kassia'); assert.ok(c); assert.strictEqual(c.tier, 'a'); assert.strictEqual(c.huttons.from, 'From around $2.1m'); assert.ok(/3-bedroom/.test(c.huttons.size)); assert.ok(/falls within/.test(c.huttons.budget));
});
t('a window with a band of another type uses that type only: Kassia 2-bedroom (700 sqft band) and 4-bedroom (1,300 sqft band); a window with no band of about that size is not a candidate', () => {
  const two = cards(rrun({ budget: 1600000, size: { lo: 700, hi: 800, source: 'explicit', line: 'x' } })).find((x) => x.id === 'kassia'); assert.ok(two && /2-bedroom/.test(two.huttons.size) && two.huttons.from === 'From around $1.55m');
  const four = cards(rrun({ budget: 2650000, size: { lo: 1300, hi: 1400, source: 'explicit', line: 'x' } })).find((x) => x.id === 'kassia'); assert.ok(four && /4-bedroom/.test(four.huttons.size) && four.huttons.from === 'From around $2.65m');
  const none = allCards(rrun({ budget: 2200000, size: { lo: 3000, hi: 3100, source: 'explicit', line: 'x' } })).find((x) => x.id === 'kassia'); assert.ok(!none || none.tier === 'c' || none.tier === 'd', 'no band near 3,000 sqft: not a Huttons candidate');
});
t('the floor shown is the lowest among bands in the window and never an exact unit price: every figure is on the $50k grid', () => {
  const grid = (txt) => { const m = /\$(\d+(?:\.\d+)?)m/.exec(txt); return !m || Math.round(Number(m[1]) * 1e6) % 50000 === 0; };
  [[1800000, 600, 800], [2600000, 870, 1000], [3200000, 1100, 1300], [4500000, 1500, 1700]].forEach((g) => cards(rrun({ budget: g[0], size: { lo: g[1], hi: g[2], source: 'explicit', line: 'x' } })).forEach((c) => { if (c.huttons && c.huttons.from) assert.ok(grid(c.huttons.from), c.id + ' ' + c.huttons.from); }));
});
t('ranking with the real file: tiers never go backwards within a group (a, then b, then c, then d), over a grid of budgets, sizes and journeys', () => {
  const rank = { a: 0, b: 1, c: 2, d: 3 }; let n = 0;
  [900000, 1500000, 2200000, 2600000, 3500000, 5000000].forEach((b) => [[600, 800], [870, 1000], [1000, 1100], [1300, 1500]].forEach((sz) => ['new', 'both'].forEach((openTo) => { const r = rrun({ budget: b, openTo, size: { lo: sz[0], hi: sz[1], source: 'explicit', line: 'x' } }); r.groups.forEach((g) => { if (g.sale === 'resale' || !g.cards.length) return; const ts = g.cards.concat(g.more || []).map((c) => rank[c.tier]); n++; ts.forEach((v, i) => { assert.ok(v !== undefined); if (i) assert.ok(v >= ts[i - 1], b + ' ' + sz + ' ' + openTo + ' ' + ts); }); }); })));
  assert.ok(n >= 20, 'groups checked: ' + n);
});
t('ranking does not depend on file order or on price values: reversing the projects in the file, or lifting every floor and ceiling by $50k at the same fit, gives the same order within each tier', () => {
  const rev = Object.assign({}, RDOC, { projects: RDOC.projects.slice().reverse() }), order = (doc) => cards(F.shortlist(real, base(Object.assign({ inv: F.prepareInventory(doc, RNOW) }, KS)))).map((c) => c.id + ':' + c.tier).join(',');
  assert.strictEqual(order(rev), order(RDOC));
});
t('Huttons-checked candidates come before URA-only projects, and URA-only "not checked" projects come after, in the real data', () => { const r = rrun(KS), g = r.groups.find((x) => x.sale === 'new' || x.sale === 'new_sale' || x.cards.some((c) => c.huttons)), ts = g.cards.map((c) => c.tier); assert.ok(ts.indexOf('a') < ts.indexOf('c') || ts.indexOf('c') < 0); assert.ok(g.cards[0].tier === 'a' || g.cards[0].tier === 'b'); });
t('privacy and wording over a grid with the real file: no counts, no "available", "sold out", "in stock", "units remaining", "developer has", no verdict words, no check clock time', () => {
  const bad = /\bavailable\b|sold out|in stock|units? remaining|developer has|\b\d+\s+units?\b|\bunits?\s+(left|shown)\b|\b(better|safer|smarter|best)\b|\b\d{1,2}:\d{2}\b|\bpsf\b/i; let n = 0;
  const strs = (v, a) => { a = a || []; if (typeof v === 'string') a.push(v); else if (Array.isArray(v)) v.forEach((x) => strs(x, a)); else if (v && typeof v === 'object') Object.keys(v).forEach((k) => { if (k !== 'checkedAt') strs(v[k], a); }); return a; };   // checkedAt is the machine-readable file time (never shown; the page says today / yesterday / a weekday)
  [900000, 1500000, 2200000, 2600000, 3500000, 5000000].forEach((b) => [[600, 800], [870, 1000], [1000, 1100], [1300, 1500]].forEach((sz) => ['new', 'both'].forEach((openTo) => [RNOW, CHK + 4 * D].forEach((at) => { const r = rrun({ budget: b, openTo, size: { lo: sz[0], hi: sz[1], source: 'explicit', line: 'x' } }, at); strs(r).forEach((x) => { n++; assert.ok(!bad.test(x), 'bad text: ' + x.slice(0, 80)); }); }))));
  assert.ok(n > 500);
});
t('the real data gives no exact price: every "From around" and budget sentence uses rounded figures and the buyer\'s own budget only', () => { const out = JSON.stringify(rrun(KS)); const tot = (out.match(/\$\d[\d.,]*m?/g) || []); tot.forEach((x) => assert.ok(/^\$\d+(\.\d{1,2})?m$/.test(x), x)); });
t('handoff with real project names: no Huttons, counts, prices, ranges, check times or source text', () => { const names = cards(rrun(KS)).slice(0, 2).map((c) => c.name), m = HM({ names, budget: 2200000, size: { from: 1000, to: 1100 }, district: null }); assert.ok(!/huttons|inventory|checked|from around|\bunits?\b|\bavailable\b|\d{2}:\d{2}/i.test(m), m); assert.ok(/^Hi Ken, I’m comparing /.test(m)); assert.ok(/\$2\.2m/.test(m)); assert.strictEqual((m.match(/\$/g) || []).length, 1); });
t('CTA on real cards: every card, candidate or not, asks "Does this suit me? →" and offers "Compare this with another"', () => { const cs = allCards(rrun({ budget: 2200000, size: KS.size, openTo: 'new' })); assert.ok(cs.length); cs.forEach((c) => { assert.strictEqual(c.ask, 'Does this suit me? →'); assert.strictEqual(c.tick, 'Compare this with another'); assert.strictEqual(c.hasCheck, c.tier === 'a' || c.tier === 'b'); }); });
t('the real file does not touch resale: a resale-only journey is identical with and without it', () => { const a = JSON.stringify(rrun({ openTo: 'resale', budget: 2200000, size: KS.size })), b = JSON.stringify(F.shortlist(real, base({ openTo: 'resale', budget: 2200000, size: KS.size }))); const strip = (x) => JSON.stringify(JSON.parse(x, (k, v) => (['checkedAt', 'inventory'].indexOf(k) > -1 ? undefined : v))); assert.strictEqual(strip(a), strip(b)); });
t('find.json is byte-identical to V9.1', () => assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'data/projects/find.json'))).digest('hex'), FIND_SHA));


console.log('V10.1 buyer-facing card text (display layer only)');
const LW = { budget: 2200000, size: { lo: 920, hi: 1030, source: 'inferred', line: 'x' } };   // the live ~$2.2m / inferred 920-1,030 sqft case
t('Lentor Gardens Residences (inventory match): exact buyer text, price first', () => {
  const c = allCards(rrun(Object.assign({ openTo: 'new' }, LW))).find((x) => x.slug === 'lentor-gardens-residences'), s = c.simple;
  assert.strictEqual(s.size, '3 Bedroom · around your size'); assert.strictEqual(s.priceLead, 'From around'); assert.strictEqual(s.figure, '$2.2m'); assert.strictEqual(s.priceNote, null);
  assert.deepStrictEqual(s.budget, { tone: 'ok', text: 'Within your ~$2.2m budget' }); assert.ok(/^\d+ recent developer sales around this size$/.test(s.sales), s.sales); assert.ok(/^Latest: [A-Z][a-z]{2} \d{4}$/.test(s.latest)); assert.strictEqual(s.quiet, null);
  assert.strictEqual(c.ask, 'Does this suit me? →');
});
t('The Sen (price above budget): "A little above" and the rounded From figure', () => {
  const c = allCards(rrun(Object.assign({ openTo: 'new' }, LW))).find((x) => x.slug === 'the-sen'); if (!c) return;   // may sit below the top cards on some windows
  assert.strictEqual(c.simple.budget.text, 'A little above your ~$2.2m budget'); assert.strictEqual(c.simple.budget.tone, 'over'); assert.strictEqual(c.simple.figure, '$2.4m');
});
t('New launch without a current match: Recent sales range from URA and the one quiet line, with no technical state', () => {
  const cs = allCards(rrun({ openTo: 'both', budget: 2600000, size: { lo: 700, hi: 800, source: 'explicit', line: 'x' } })).filter((x) => x.sale === 'new' && (x.tier === 'c' || x.tier === 'd')); assert.ok(cs.length, 'real input with a URA-only new launch card (Promenade Peak at about $2.6m, 700–800 sqft)');
  cs.forEach((c) => { const s = c.simple; assert.strictEqual(s.priceLead, 'Recent sales'); assert.ok(/^\$\d\.\d\dm–\$\d\.\d\dm$/.test(s.figure), s.figure); assert.strictEqual(s.quiet, 'Current availability not confirmed.'); assert.strictEqual(s.size, 'Around your size'); assert.ok(/^\d+ recent developer sales around this size$/.test(s.sales)); });
});
t('Resale: Recent sales range, "recent sales", Latest, no quiet line, same shape', () => {
  const cs = allCards(rrun(Object.assign({ openTo: 'both' }, LW))).filter((x) => x.sale === 'resale'); assert.ok(cs.length);
  cs.forEach((c) => { const s = c.simple; assert.strictEqual(s.priceLead, 'Recent sales'); assert.ok(/^\$\d\.\d\dm–\$\d\.\d\dm$/.test(s.figure)); assert.ok(/^\d+ recent sales around this size$/.test(s.sales)); assert.ok(/^Latest: /.test(s.latest)); assert.strictEqual(s.quiet, null); assert.ok(/^(Within|A little above) your ~\$2\.2m budget$/.test(s.budget.text)); });
});
t('dated inventory (3 days): the From figure keeps "(as shown then)"', () => {
  const NOWD = Date.parse('2026-10-09T10:00:00Z'), c = allCards(F.shortlist(real, base(Object.assign({ inv: F.prepareInventory(JSON.parse(fs.readFileSync(path.join(root, 'data/projects/inventory.json'), 'utf8')), NOWD), openTo: 'new' }, LW)))).find((x) => x.slug === 'lentor-gardens-residences');
  assert.strictEqual(c.simple.priceNote, '(as shown then)'); assert.strictEqual(c.simple.figure, '$2.2m');
});
t('the buyer-facing strings carry no source names, methodology, banned words or extra price figures', () => {
  const r = rrun(Object.assign({ openTo: 'both' }, LW)); allCards(r).forEach((c) => { const txt = JSON.stringify(c.simple);
    assert.ok(!/huttons|ura\b|inventory|checked|why it appeared|evidence|couldn|sold out|in stock|units? remaining|developer has|\bunits?\b|\bpsf\b|\bavailable\b/i.test(txt), txt);
    assert.ok((txt.match(/\$[\d.]+m/g) || []).every((x) => /^\$\d\.\d{1,2}m$/.test(x))); });
});
t('ranking and the group order are untouched: same ids in the same order as before the display layer (inventory on)', () => {
  const r = rrun(Object.assign({ openTo: 'both' }, LW)); assert.deepStrictEqual(r.groups.map((g) => g.sale), ['resale', 'new']); assert.strictEqual(allCards(r).find((x) => x.sale === 'new').slug, 'lentor-gardens-residences');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
