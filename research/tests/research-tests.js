// node research/tests/research-tests.js — SYNTHETIC records only. Optional real-data smoke tests run if data/projects exists.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../..');
const B = require(root + '/tools/market-data/build-project-stats.js'), P = require(root + '/assets/js/kpt-project.js'), S = require(root + '/tools/market-data/tests/synth-projects.js'), RS = require(root + '/assets/js/kpt-research.js');
const cfg = JSON.parse(fs.readFileSync(root + '/tools/market-data/config.json', 'utf8')), pcReal = JSON.parse(fs.readFileSync(root + '/tools/market-data/project-config.json', 'utf8'));
const pc = Object.assign({}, pcReal, { exclude: [], hold: [] });
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const tx = S.tx;
const rows = [];
const add = (name, o, k) => { for (let i = 0; i < (k || 1); i++) rows.push(tx(name, Object.assign({}, o))); };
// GRAND-like: resale, 12m sales in two bands, a 24m-only cell shared with IMP
['0926', '0826', '0726'].forEach((d, i) => add('GRAND', { area: '125', price: String(1700000 + i * 20000), contractDate: d, district: '20' }));
add('GRAND', { area: '90', price: '1300000', contractDate: '0626' });
add('GRAND', { area: '100', price: '1400000', contractDate: '0325' }); add('GRAND', { area: '100', price: '1420000', contractDate: '0325' });
// IMP-like: shares the 1000s band with GRAND only at 24m; also 12m sales in other bands
['0926', '0826', '0726', '0626'].forEach((d, i) => add('IMP', { area: '60', price: String(900000 + i * 10000), contractDate: d }));
['0125', '0225', '0325', '0425'].forEach((d, i) => add('IMP', { area: '100', price: String(1350000 + i * 10000), contractDate: d }));
// TRI-like: strong 12m overlap with IMP in the 60 sqm (≈650 sqft) and 100 sqm bands
['0926', '0826', '0726', '0626'].forEach((d, i) => { add('TRI', { area: '60', price: String(920000 + i * 10000), contractDate: d }); add('TRI', { area: '100', price: String(1330000 + i * 10000), contractDate: d }); });
['0926', '0826', '0726', '0626'].forEach((d, i) => add('IMP', { area: '100', price: String(1340000 + i * 12000), contractDate: d }));
// MULTI: new sales dominate the last 12m; resale exists. TIE: equal 12m counts for new and resale
['0926', '0826', '0726'].forEach((d) => add('MULTI', { typeOfSale: '1', tenure: '99 yrs lease commencing from 2024', area: '80', price: '2000000', contractDate: d }));
add('MULTI', { area: '80', price: '1900000', contractDate: '0926' });
add('TIE', { typeOfSale: '1', tenure: '99 yrs lease commencing from 2024', area: '80', price: '2000000', contractDate: '0926' }); add('TIE', { area: '80', price: '1900000', contractDate: '0926' });
// SINGLE: one sale ever. OLDPJ: only old sales (no recent). ONEMO: several sales in a single month
add('SINGLE', { area: '90', price: '1500000', contractDate: '0926' });
add('OLDPJ', { area: '90', price: '1500000', contractDate: '0123' }); add('OLDPJ', { area: '90', price: '1550000', contractDate: '0223' });
add('ONEMO', { area: '90', price: '1500000', contractDate: '0926' }, 3);
// NOSHARE: only new sales, shares no sale type with IMP
add('NEWONLY', { typeOfSale: '1', tenure: '99 yrs lease commencing from 2024', area: '100', price: '1900000', contractDate: '0926' }, 2);
add('OTHERD', { district: '09', area: '90', price: '2500000', contractDate: '0926' });
const R = B.build(rows, cfg, pc, '2026-10-05'), M = R.manifest;
const proj = (name) => { const id = P.slugify(name); return R.details[P.shardName(P.shardOf(id, pc.shards))].projects[id]; };
const AP = (name, o) => RS.analyseProject(proj(name), M, o || {}), AC = (a, b, o) => RS.analyseComparison(proj(a), proj(b), M, o || {});
const TODAY = '2026-10-06';
// Only the explicit disclaimers may use these words.
const scrub = (x) => JSON.stringify(x).replace(/Neither project is cheaper or better overall\./g, '').replace(/It does not say which is better value\./g, '');

console.log('Sale type default (D5)');
t('default is the sale type with most sales in the last 12 months', () => assert.strictEqual(RS.defaultSale(proj('MULTI')), 'new'));
t('tie prefers resale', () => assert.strictEqual(RS.defaultSale(proj('TIE')), 'resale'));
t('selected sale type is carried on the model with all options', () => { const m = AP('MULTI'); assert.strictEqual(m.sale.selected, 'new'); assert.deepStrictEqual(m.sale.options.map((o) => o.id).sort(), ['new', 'resale']); assert.ok(m.sale.label); });
t('explicit sale choice is respected; unavailable sale falls back to default', () => { assert.strictEqual(AP('MULTI', { sale: 'resale' }).sale.selected, 'resale'); assert.strictEqual(AP('GRAND', { sale: 'new' }).sale.selected, 'resale'); });

console.log('Evidence: facts plus structural tags, no tiers');
t('single sale tag', () => { const e = AP('SINGLE').recent.noRecent; assert.strictEqual(e, false); const ev = AP('SINGLE').evidence.recent; assert.ok(ev.tags.some((x) => x.id === 'single')); assert.ok(/^1 sale · 1 month · latest Sep 2026$/.test(ev.line), ev.line); });
t('one month only tag', () => { const ev = AP('ONEMO').evidence.recent; assert.ok(ev.tags.some((x) => x.id === 'one-month')); assert.ok(!ev.tags.some((x) => x.id === 'single')); });
t('no-recent project is flagged and says so in plain words', () => { const m = AP('OLDPJ'); assert.strictEqual(m.state, 'no-recent'); assert.ok(m.recent.noRecent); assert.ok(/No resale sales in the last 12 months/.test(m.read[0].text)); assert.ok(m.bands.every((b) => b.tags.some((x) => x.id === 'none-recent'))); });
t('no Strong/Medium/Weak tier wording anywhere in the model', () => { const s = JSON.stringify([AP('GRAND'), AP('SINGLE'), AC('IMP', 'TRI'), AC('GRAND', 'IMP')]); assert.ok(!/\b(strong|medium|weak)\b/i.test(s.replace(/Good recent overlap/g, ''))); });
t('evidence on an older window is tagged with its window', () => { const e = RS.evidence({ n: 2, act: 1, last: 202503 }, M, { win: 1 }); assert.ok(e.tags.some((x) => x.id === 'older' && /Older evidence: /.test(x.text))); });

console.log('Single project read');
t('mix sentence names the dominant band when it holds most recent sales', () => { const m = AP('GRAND'); assert.ok(m.read.some((r) => r.id === 'mix')); });
t('PSF is described as approximate and history as not appreciation', () => { const m = AP('GRAND'); assert.ok(/approximate/i.test(m.notes.psf)); assert.ok(/not appreciation/i.test(m.notes.history)); });
t('movement text never says rose / grew / appreciation', () => { const s = JSON.stringify([AP('IMP'), AP('TRI'), AP('GRAND')]); assert.ok(!/\b(rose|grew|appreciat(ed|ion) of)\b/i.test(s.replace(/not appreciation/g, ''))); });
t('floor notes never imply an exact floor', () => assert.ok(/does not show an exact floor/.test(AP('GRAND').floors.note)));
t('market context is labelled as context and includes own sales', () => assert.ok(/Market context, not direct comparables/.test(AP('GRAND').notes.context)));
t('not-measured list covers layout, facing, exact unit and more', () => { const s = RS.NOT_MEASURED.join(' ').toLowerCase(); ['layout', 'facing', 'unit'].forEach((k) => assert.ok(s.indexOf(k) > -1, k)); });

console.log('Size focus (D6): sqft only');
t('focusBin snaps to the 100 sqft band', () => { assert.strictEqual(RS.focusBin('1,350', M), 1300); assert.strictEqual(RS.focusBin(1000, M), 1000); assert.strictEqual(RS.focusBin(' 999 sqft', M), 900); });
t('focusBin rejects junk and out-of-range values', () => { ['', 'abc', '50', '99999', null].forEach((v) => assert.strictEqual(RS.focusBin(v, M), null, String(v))); });
t('focus on a band with sales marks userChosen and uses that band', () => { const m = AP('GRAND', { sizeSqft: 1350 }); assert.ok(m.focus.userChosen); assert.strictEqual(m.focus.bin, 1300); assert.ok(m.focus.hasEvidence); });
t('focus on a band with no sales says so and offers nearest bands', () => { const m = AP('GRAND', { sizeSqft: 2500 }); assert.strictEqual(m.focus.bin, null); assert.ok(m.focus.nearest.length > 0); assert.ok(m.read.some((r) => /No resale sales in the 2,500/.test(r.text) || /No resale sales in the 2500/.test(r.text) || /No resale sales in the/.test(r.text))); });
t('no bedroom wording or keys in any project or comparison model', () => { const s = JSON.stringify([AP('GRAND', { sizeSqft: 1350 }), AC('IMP', 'TRI', { sizeSqft: 650 })]); assert.ok(!/bedroom|\bBR\b|\bbed\b/i.test(s)); });
t('the typed size is not stored on the model', () => { const m = AP('GRAND', { sizeSqft: 1357 }); assert.ok(JSON.stringify(m).indexOf('1357') === -1); });

console.log('Comparison: overlap classes and wording');
t('good overlap: wording and counted coverage', () => { const c = AC('IMP', 'TRI'); assert.strictEqual(c.overlap, 'good'); assert.strictEqual(c.headline, 'Good recent overlap for comparison'); assert.ok(c.reasons.length >= 3); });
t('limited overlap: first match is beyond 12 months, named and tagged older', () => { const c = AC('GRAND', 'IMP'); assert.strictEqual(c.overlap, 'limited'); assert.strictEqual(c.headline, 'Limited recent overlap'); assert.ok(c.firstWindowWithMatch > 0); assert.ok(c.olderTag || c.older); });
t('limited overlap discloses the thin matched cell (GRAND has 2 sales)', () => { const c = AC('GRAND', 'IMP'); const s = JSON.stringify(c); assert.ok(/\b2 sales\b/.test(s), 'thin count not disclosed'); });
t('limited overlap: full history stays inspectable (all windows present, nothing silently widened)', () => { const c = AC('GRAND', 'IMP'); assert.strictEqual(c.windows.length, 4); assert.ok(c.ladder && c.ladder.length === 4); });
t('no shared sale type -> none with the approved headline', () => { const c = AC('IMP', 'NEWONLY'); assert.strictEqual(c.overlap, 'none'); assert.strictEqual(c.headline, 'No like-for-like transaction evidence found'); assert.ok(/sale type/i.test(JSON.stringify(c.reasons))); });
t('never says "directly comparable", "similar projects", winner, cheaper or better', () => { const s = scrub([AC('IMP', 'TRI'), AC('GRAND', 'IMP'), AC('IMP', 'NEWONLY')]); assert.ok(!/directly comparable|similar projects|\bwinner\b|\bcheaper\b|\bbetter value\b|\bbetter\b/i.test(s), s.match(/directly comparable|similar projects|winner|cheaper|better/i)); });
t('overlap rule parameters and inputs are exposed in the view model', () => { const r = AC('IMP', 'TRI').overlapRule; assert.deepStrictEqual([r.minSalesEachSide, r.minMonthsEachSide, r.window, r.minShareExclusive], [2, 2, 12, 0.5]); assert.strictEqual(r.kind, 'kpt-presentation-rule'); assert.ok(r.inputs.qualifyingBands > 0 && r.inputs.shareA > 0.5 && r.inputs.shareB > 0.5); assert.strictEqual(r.result, 'good'); assert.strictEqual(AC('GRAND', 'IMP').overlapRule.result, 'limited'); });
t('substitute disclaimer is present', () => assert.ok(/substitutes/.test(AC('IMP', 'TRI').notes.substitute)));
t('direction is described, never decided', () => { const c = AC('IMP', 'TRI'); assert.ok(c.direction && ['consistent', 'mixed', 'single', 'mostly'].indexOf(c.direction.kind || c.direction.type || c.direction.id) > -1 || typeof c.direction.text === 'string'); assert.ok(!/winner|cheaper|better/i.test(scrub(c.direction))); assert.ok(/Neither project is cheaper or better|does not say which is better value|mixed/.test(JSON.stringify(c.direction))); });
t('comparison is symmetric in overlap class and pair key', () => { assert.strictEqual(AC('IMP', 'TRI').overlap, AC('TRI', 'IMP').overlap); assert.strictEqual(AC('IMP', 'TRI').pairKey, AC('TRI', 'IMP').pairKey); });
t('window parameter selects that window without changing the first-match disclosure', () => { const c = AC('GRAND', 'IMP', { window: 0 }); assert.strictEqual(c.firstWindowWithMatch, AC('GRAND', 'IMP').firstWindowWithMatch); });
t('same project compared with itself is flagged', () => assert.strictEqual(AC('IMP', 'IMP').same, true));

console.log("Ken's Take (D9): Active, review_by, symmetry");
const notes = [
  { scope: 'project', project: 'imp', status: 'Active', note: 'Authored project note.', review_by: '2027-01-01' },
  { scope: 'pair', projects: ['imp', 'tri'], status: 'Active', note: 'Authored pair note.' },
  { scope: 'project', project: 'tri', status: 'Draft', note: 'Draft note.' },
  { scope: 'project', project: 'grand', status: 'Active', note: 'Stale note.', review_by: '2026-01-01' },
];
t('empty notes -> no Ken block anywhere', () => { assert.strictEqual(AP('IMP', { notes: [], today: TODAY }).ken, null); assert.strictEqual(AC('IMP', 'TRI', { notes: [], today: TODAY }).ken, null); assert.strictEqual(AP('IMP').ken, null); });
t('active project note shows', () => assert.strictEqual(AP('IMP', { notes, today: TODAY }).ken.note, 'Authored project note.'));
t('draft note does not show', () => assert.strictEqual(AP('TRI', { notes, today: TODAY }).ken, null));
t('note past review_by does not show', () => assert.strictEqual(AP('GRAND', { notes, today: TODAY }).ken, null));
t('pair note resolves for A vs B and B vs A', () => { assert.strictEqual(AC('IMP', 'TRI', { notes, today: TODAY }).ken.note, 'Authored pair note.'); assert.strictEqual(AC('TRI', 'IMP', { notes, today: TODAY }).ken.note, 'Authored pair note.'); });
t('a project note is not used as a pair note', () => assert.strictEqual(AC('GRAND', 'IMP', { notes, today: TODAY }).ken, null));
t('sensitive wording in a note is flagged for review but still shown', () => { const n = [{ scope: 'project', project: 'imp', status: 'Active', note: 'Check your CPF first.' }]; const m = AP('IMP', { notes: n, today: TODAY }); assert.ok(m.ken); assert.ok(m.attention.length === 1); });
t('pairKey is order independent', () => assert.strictEqual(RS.pairKey('a', 'b'), RS.pairKey('b', 'a')));
t('shipped notes file is an empty array', () => assert.deepStrictEqual(JSON.parse(fs.readFileSync(root + '/data/research/ken-notes.json', 'utf8')), []));

console.log('WhatsApp (D3) and analytics (D8): no typed or sensitive data');
t('WhatsApp text for one project, a pair and none', () => { assert.strictEqual(RS.waMessage(['Thomson Grand', 'Thomson Impressions']), "Hi Ken, I'm looking at Thomson Grand vs Thomson Impressions and would like your view."); assert.ok(/Thomson Grand/.test(RS.waMessage(['Thomson Grand']))); assert.ok(/researching a property/.test(RS.waMessage([]))); });
t('model WhatsApp text only contains project names from the index', () => { const m = AC('IMP', 'TRI', { sizeSqft: 1357 }); assert.ok(m.wa.indexOf('1357') === -1); assert.strictEqual(m.wa, RS.waMessage([RS.displayName('IMP'), RS.displayName('TRI')])); const p = AP('GRAND', { sizeSqft: 1357 }); assert.ok(p.wa.indexOf('1357') === -1 && p.wa === RS.waMessage(['Grand'])); });
t('analytics: unknown events are dropped', () => assert.strictEqual(RS.analytics('page_view', { project_id: 'x' }), null));
t('analytics: typed text, size and budget cannot pass', () => { const out = RS.analytics('research_search', { results: 7, q: 'thomson gra', query: 'x', text: 'y', size: 1357, sqft: 1357, budget: 2000000 }); assert.deepStrictEqual(out, { results: '6+' }); });
t('analytics: project IDs must look like slugs; free text in an id slot is dropped', () => { assert.deepStrictEqual(RS.analytics('research_project_selected', { project_id: 'thomson-grand', sale_type: 'resale' }), { project_id: 'thomson-grand', sale_type: 'resale' }); assert.deepStrictEqual(RS.analytics('research_project_selected', { project_id: 'My budget is 2m!' }), {}); });
t('analytics: size focus event carries no size', () => assert.deepStrictEqual(RS.analytics('research_size_focus', { project_id: 'imp', has_evidence: true, size: 1357 }), { project_id: 'imp', has_evidence: true }));
t('analytics: allowed values only', () => assert.deepStrictEqual(RS.analytics('research_comparison_viewed', { project_a: 'a', project_b: 'b', overlap: 'maybe', window: '12m', sale_type: 'resale' }), { project_a: 'a', project_b: 'b', window: '12m', sale_type: 'resale' }));
t('every analytics key is on the allow-list and none looks like free text', () => { RS.ANALYTICS_KEYS.forEach((k) => assert.ok(!/^(text|query|q|size|sqft|budget|name|search)$|_text$|_name$/.test(k), k)); });

console.log('Routes (D2) and suggestions (D10)');
t('parseHash: home, project, project+sale, compare, compare+sale, pick', () => {
  assert.deepStrictEqual(RS.parseHash('#/'), { view: 'home' }); assert.deepStrictEqual(RS.parseHash(''), { view: 'home' });
  assert.deepStrictEqual(RS.parseHash('#/p/thomson-grand'), { view: 'project', id: 'thomson-grand', sale: null });
  assert.deepStrictEqual(RS.parseHash('#/p/thomson-grand/new'), { view: 'project', id: 'thomson-grand', sale: 'new' });
  assert.deepStrictEqual(RS.parseHash('#/compare/a/b'), { view: 'compare', a: 'a', b: 'b', sale: null });
  assert.deepStrictEqual(RS.parseHash('#/compare/a/b/resale'), { view: 'compare', a: 'a', b: 'b', sale: 'resale' });
  assert.deepStrictEqual(RS.parseHash('#/compare/a'), { view: 'pick', a: 'a' });
});
t('parseHash ignores junk, bad sale types and script-ish ids', () => { assert.deepStrictEqual(RS.parseHash('#/p/<script>'), { view: 'home' }); assert.strictEqual(RS.parseHash('#/p/x/bogus').sale, null); assert.deepStrictEqual(RS.parseHash('#/zzz'), { view: 'home' }); });
t('buildHash round-trips', () => ['#/', '#/p/a', '#/p/a/new', '#/compare/a/b', '#/compare/a/b/sub', '#/compare/a'].forEach((h) => assert.strictEqual(RS.buildHash(RS.parseHash(h)), h)));
t('no size appears in any hash', () => assert.ok(!/size|sqft/.test(RS.buildHash({ view: 'project', id: 'a', sale: 'new', size: 1300 }))));
t('same-district suggestions use the approved label, not "Similar"', () => { const s = RS.sameDistrict(R.index, P.slugify('GRAND'), 5); assert.ok(/^Other projects in D\d+$/.test(s.label), s.label); assert.ok(!/similar/i.test(s.label)); assert.ok(s.rows.every((r) => r.id !== 'grand')); });
t('suggestions stay in the same district', () => { const F = P.fieldMap(R.index.fields), d = (id) => R.index.rows.find((r) => r[F.id] === id)[F.district]; const s = RS.sameDistrict(R.index, 'grand', 20); assert.ok(s.rows.length > 0); assert.ok(s.rows.every((r) => d(r.id) === d('grand'))); assert.ok(!s.rows.some((r) => r.id === 'otherd')); });
t('unknown project id gives no suggestions', () => assert.deepStrictEqual(RS.sameDistrict(R.index, 'nope', 5).rows, []));
t('displayName: title case, roman numerals, @ and small words', () => { assert.strictEqual(RS.displayName('THOMSON GRAND'), 'Thomson Grand'); assert.strictEqual(RS.displayName('CHUAN VISTA II'), 'Chuan Vista II'); assert.strictEqual(RS.displayName('THE PEAK @ CAIRNHILL II'), 'The Peak @ Cairnhill II'); assert.strictEqual(RS.displayName("D'LEEDON"), "D'Leedon"); });

console.log('Real-data smoke (skipped if data/projects is absent)');
const dir = root + '/data/projects/';
if (fs.existsSync(dir + 'manifest.json')) {
  const rd = (f) => JSON.parse(fs.readFileSync(dir + f, 'utf8')), man = rd('manifest.json'), idx = rd('index.json');
  const get = (id) => rd('detail/' + P.shardName(P.shardOf(id, man.shards)) + '.json').projects[id];
  const has = (id) => !!get(id);
  if (has('thomson-grand') && has('thomson-impressions') && has('thomson-three')) {
    const g = get('thomson-grand'), i = get('thomson-impressions'), th = get('thomson-three');
    t('Thomson Grand vs Impressions: limited overlap, first match at 24 months, thin cell disclosed', () => { const c = RS.analyseComparison(g, i, man, {}); assert.strictEqual(c.overlap, 'limited'); assert.strictEqual(M.windows[0], 12); assert.strictEqual(man.windows[c.firstWindowWithMatch], 24); assert.ok(/\b2 sales\b/.test(JSON.stringify(c))); });
    t('Thomson Impressions vs Three: good overlap, four shared bands, mixed direction, no winner', () => { const c = RS.analyseComparison(i, th, man, {}); assert.strictEqual(c.overlap, 'good'); assert.strictEqual(c.bands.length, 4); assert.ok(/mixed/i.test(JSON.stringify(c.direction))); assert.ok(!/cheaper|better|winner/i.test(scrub(c))); });
    t('Thomson Grand: 13 of 19 recent sales in 1,300s band described as mostly that band', () => { const m = RS.analyseProject(g, man, {}); assert.strictEqual(m.recent.n, 19); assert.ok(m.read.some((r) => /13 of the 19/.test(r.text))); });
  } else console.log('  skip Thomson projects not in data');
} else console.log('  skip no data/projects');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
