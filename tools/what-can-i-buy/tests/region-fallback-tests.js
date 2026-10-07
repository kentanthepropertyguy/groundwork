// node tools/what-can-i-buy/tests/region-fallback-tests.js : V10.3.5, reviewed inventory `region` is a fallback only. URA/find.json region always wins.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../../');
const ENG = require(root + 'assets/js/kpt-engine.js'), FI = require(root + 'assets/js/kpt-find.js');
const rj = (f) => JSON.parse(fs.readFileSync(root + f, 'utf8'));
const ix = FI.prepare(rj('data/projects/find.json')), E = ENG.DEFAULTS, invDoc = rj('data/projects/inventory.json');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message.split('\n')[0]); } };
const AT = Date.parse(invDoc.checkedAt) + 3600e3;
const prep = (doc) => FI.prepareInventory(doc, AT);
const TY = (b, ceiling, bands) => ({ bedrooms: b, label: b + ' bedrooms', ceiling, bands });
const OKT = [TY(3, 2300000, [[1000, 2100000]])];
const META = { district: '22', tenureGroup: 1, tenure: '99 yrs from 2025', street: 'LAKESIDE DRIVE' };
const MP = (slug, region, extra) => Object.assign({ slug, name: slug.toUpperCase(), checkedAt: invDoc.checkedAt, status: 'ok', byBedrooms: OKT }, META, region === undefined ? {} : { region }, extra || {});
const DOC = (projects) => ({ v: 2, kind: 'kpt-huttons-public-inventory', tool: 'x', source: 'Units currently shown in Huttons inventory', checkedAt: invDoc.checkedAt, projects });
const empty = FI.prepare({ v: 1, kind: 'kpt-find-index', latestMonth: '2026-09', window: { from: '2025-10', to: '2026-09', label: 'x' }, bin: 100, minCell: 3, projects: [] });
const SZ = { lo: 920, hi: 1080, source: 'explicit', line: 'x' };
const base = (o) => Object.assign({ budget: 2200000, openTo: 'new', size: SZ, districts: [], text: '', freehold: false, pct: FI.T.budgetPct, answers: { where: 'flexible', size: 'not-sure', priorities: [] }, typical: null }, o);
const ids = (ixx, docProjects, o) => { const r = FI.shortlist(ixx, base(Object.assign({ inv: prep(DOC(docProjects)) }, o))); return r.groups.reduce((a, g) => a.concat(g.cards, g.more || []), []).map((c) => c.id); };
const BUDGETS = [1500000, 1800000, 2200000, 2600000, 3200000, 4000000, 5000000];
// every candidate the New launch layer would consider (no display cap), as the page does it
const cands = (inv, o, ixx) => { const x = Object.assign({ budget: 2200000, pct: FI.T.budgetPct, lo: 500, hi: 2200, districts: [], freehold: false, text: '', openTo: 'new', inv: prep(inv), sizeSource: 'explicit', _uraIds: {}, prefs: [] }, o || {}); (ixx || ix).projects.forEach((p) => { x._uraIds[p.id] = 1; }); return FI.newCandidates(ixx || ix, x); };
const matched = (l) => l.filter((c) => c.tier === 'a' || c.tier === 'b');
const CL = (o) => Object.assign({ answers: { where: 'flexible', size: 'not-sure', priorities: ['location'] } }, o || {});

t('a metadata project with a reviewed CCR or RCR region qualifies for Closer to the centre; OCR does not', () => {
  const l = ids(empty, [MP('aa', 'CCR'), MP('bb', 'RCR'), MP('cc', 'OCR')], CL());
  assert.deepStrictEqual(l.sort(), ['aa', 'bb']);
});
t('a metadata project with no reviewed region is NOT guessed: it cannot qualify for Closer, but normal searches still show it', () => {
  assert.deepStrictEqual(ids(empty, [MP('aa')], CL()), []);
  assert.deepStrictEqual(ids(empty, [MP('aa')]), ['aa']);
  assert.deepStrictEqual(ids(empty, [MP('aa', 'OCR')]), ['aa']);   // OCR is fine without Closer
});
t('an invalid inventory region (wrong case, junk, wrong type) is ignored: same as no region', () => {
  ['ccr', 'XXX', '', 5, null, ['CCR'], 'CCR '].forEach((v) => { assert.deepStrictEqual(ids(empty, [MP('aa', v)], CL()), [], JSON.stringify(v)); assert.deepStrictEqual(ids(empty, [MP('aa', v)]), ['aa']); });
});
t('URA is authoritative: a project URA lists keeps its URA region, whatever the inventory says (both directions)', () => {
  const U = (id, seg) => ({ id, name: id.toUpperCase(), street: 'X', d: '22', seg, tg: 1, tl: '99 yrs from 2025', m: 0, new: [], resale: [] });
  const ixu = FI.prepare({ v: 1, kind: 'kpt-find-index', latestMonth: '2026-09', window: { from: '2025-10', to: '2026-09', label: 'x' }, bin: 100, minCell: 3, projects: [U('aa', 'OCR'), U('bb', 'CCR')] });
  const plain = (id, region) => ({ slug: id, name: id.toUpperCase(), checkedAt: invDoc.checkedAt, status: 'ok', byBedrooms: OKT, region });
  assert.deepStrictEqual(ids(ixu, [plain('aa', 'CCR')], CL()).filter((x) => x === 'aa'), [], 'URA says OCR; inventory CCR must not lift it into Closer');
  assert.deepStrictEqual(ids(ixu, [plain('bb', 'OCR')], CL()).filter((x) => x === 'bb'), ['bb'], 'URA says CCR; inventory OCR must not drop it');
});
t('region fallback changes nothing without Closer: same projects, tiers and order with or without region fields in the inventory (real file); only the card gains the region word in its meta line', () => {
  const stripped = JSON.parse(JSON.stringify(invDoc)); stripped.projects.forEach((p) => { delete p.region; });
  BUDGETS.forEach((b) => [[500, 2200], [700, 1000], [900, 1100]].forEach((sz) => {
    const key = (inv) => cands(inv, { budget: b, lo: sz[0], hi: sz[1] }).map((c) => c.id + ':' + c.tier);
    assert.deepStrictEqual(key(invDoc), key(stripped), b + ' ' + sz);
  }));
  const meta = (inv) => FI.shortlist(ix, base({ budget: 1500000, size: { lo: 700, hi: 1300, source: 'explicit', line: 'x' }, inv: prep(inv) })).groups.reduce((a, g) => a.concat(g.cards), []).find((c) => c.id === 'kovan-jewel');
  const stripped2 = JSON.parse(JSON.stringify(invDoc)); stripped2.projects.forEach((p) => { delete p.region; });
  if (meta(invDoc)) assert.ok(/ · OCR · /.test(meta(invDoc).meta) && !/OCR/.test(meta(stripped2).meta));
});
t('Closer with the real file: every candidate is CCR or RCR, by URA region or by reviewed inventory region; no unreviewed or OCR project qualifies', () => {
  const ura = {}; ix.projects.forEach((p) => { ura[p.id] = p.seg; }); const reg = {}; invDoc.projects.forEach((p) => { reg[p.slug] = p.region; }); let seen = 0, fb = 0;
  BUDGETS.forEach((b) => cands(invDoc, { budget: b, regions: ['CCR', 'RCR'], regionRank: true }).forEach((c) => { const seg = c.id in ura ? ura[c.id] : reg[c.id]; seen++; if (!(c.id in ura)) fb++; assert.ok(seg === 'CCR' || seg === 'RCR', c.id + ' ' + seg); }));
  assert.ok(seen > 0 && fb > 0, 'some qualifying candidates come from the reviewed inventory region');
});
t('Closer with the real file: reviewed CCR/RCR metadata projects qualify (Duet at Emily, Gems Ville, Lloyd SixtyFive), reviewed OCR ones do not (Lucerne Grand, Kovan Jewel)', () => {
  const WIDE = []; for (let b = 1000000; b <= 10000000; b += 250000) WIDE.push(b);
  const ids2 = (o) => { const out = {}; WIDE.forEach((b) => cands(invDoc, Object.assign({ budget: b }, o)).forEach((c) => { out[c.id] = 1; })); return out; };
  const withC = ids2({ regions: ['CCR', 'RCR'], regionRank: true }), without = ids2({});
  ['duet-at-emily', 'gems-ville', 'lloyd-sixtyfive'].forEach((s) => { assert.ok(without[s], s + ' appears in a normal search'); assert.ok(withC[s], s + ' appears with Closer'); });
  ['lucerne-grand', 'kovan-jewel'].forEach((s) => { assert.ok(without[s], s + ' normal'); assert.ok(!withC[s], s + ' must not appear with Closer'); });
});
t('ordering: with Closer, a region-fallback CCR project is ranked as CCR (before RCR) in the band, whatever the input order', () => {
  [['rcr-one', 'RCR'], ['ccr-one', 'CCR'], ['rcr-two', 'RCR']].forEach((_, k, arr) => {
    const rot = arr.slice(k).concat(arr.slice(0, k)), l = cands(DOC(rot.map((a) => MP(a[0], a[1]))), { prefs: [], regions: ['CCR', 'RCR'], regionRank: true, budget: 2200000, lo: 920, hi: 1080 }, empty);
    assert.deepStrictEqual(l.map((c) => c.id.replace('-one', '').replace('-two', '')), ['ccr', 'rcr', 'rcr'], JSON.stringify(rot));
  });
});
t('a held-back metadata project still needs its normal fields: no district, tenure or status ok means not shown, region or not', () => {
  assert.deepStrictEqual(ids(empty, [MP('aa', 'CCR', { district: undefined })]), []);
  assert.deepStrictEqual(ids(empty, [MP('aa', 'CCR', { status: 'zero_returned' })]), []);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
