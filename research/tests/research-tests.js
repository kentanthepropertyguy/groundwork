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
// Extra shapes: sub-sale + resale (SUBP), sub-sale only (SUBONLY), new+sub (AMOLIKE: new-sale-heavy, no resale), big units only (BIG: no shared size band with IMP)
add('SUBP', { typeOfSale: '2', area: '100', price: '1500000', contractDate: '0926' }, 2); add('SUBP', { typeOfSale: '2', area: '100', price: '1520000', contractDate: '0826' }); add('SUBP', { area: '100', price: '1350000', contractDate: '0926' }, 2); add('SUBP', { area: '100', price: '1360000', contractDate: '0826' });
add('SUBONLY', { typeOfSale: '2', area: '100', price: '1500000', contractDate: '0926' }, 2);
for (let i = 0; i < 12; i++) add('AMOLIKE', { typeOfSale: '1', tenure: '99 yrs lease commencing from 2021', area: String(60 + (i % 4) * 20), price: String(1300000 + i * 40000), contractDate: ['0926', '0826', '0726', '0626'][i % 4] });
add('AMOLIKE', { typeOfSale: '2', tenure: '99 yrs lease commencing from 2021', area: '100', price: '2500000', contractDate: '0826' }, 2);
['0926', '0826', '0726'].forEach((d) => add('BIG', { area: '250', price: '5000000', contractDate: d }));
// Interpretation fixtures. 4 sales over 4 months per cell. HIA is higher than LOA in both bands (60 sqm: ranges overlap; 100 sqm: separate). MIXA/MIXB: direction depends on size.
const MONTHS = ['0926', '0826', '0726', '0626'], cellRows = (name, area, prices) => prices.forEach((pr, i) => add(name, { area: String(area), price: String(pr), contractDate: MONTHS[i] }));
cellRows('HIA', 60, [1000000, 1060000, 940000, 1020000]); cellRows('LOA', 60, [990000, 1050000, 930000, 1010000]);
cellRows('HIA', 100, [1900000, 1950000, 1850000, 1920000]); cellRows('LOA', 100, [1500000, 1550000, 1450000, 1520000]);
cellRows('MIXA', 60, [1100000, 1110000, 1120000, 1130000]); cellRows('MIXB', 60, [1000000, 1010000, 1020000, 1030000]);
cellRows('MIXA', 100, [1500000, 1510000, 1520000, 1530000]); cellRows('MIXB', 100, [1700000, 1710000, 1720000, 1730000]);
cellRows('SOLOA', 80, [1500000, 1520000, 1540000, 1560000]); cellRows('SOLOB', 80, [1300000, 1320000, 1340000, 1360000]); cellRows('SOLOA', 120, [2000000]); cellRows('SOLOB', 120, [2100000]);
cellRows('EQA', 60, [1000000, 1010000, 1020000, 1030000]); cellRows('EQB', 60, [1000000, 1010000, 1020000, 1030000]); cellRows('EQA', 100, [1500000, 1510000, 1520000, 1530000]); cellRows('EQB', 100, [1400000, 1410000, 1420000, 1430000]); cellRows('EQA', 80, [1200000, 1210000, 1220000, 1230000]); cellRows('EQB', 80, [1100000, 1110000, 1120000, 1130000]);
const R = B.build(rows, cfg, pc, '2026-10-05'), M = R.manifest;
const proj = (name) => { const id = P.slugify(name); return R.details[P.shardName(P.shardOf(id, pc.shards))].projects[id]; };
const AP = (name, o) => RS.analyseProject(proj(name), M, o || {}), AC = (a, b, o) => RS.analyseComparison(proj(a), proj(b), M, o || {});
const TODAY = '2026-10-06';
// Only the explicit disclaimers may use these words.
const scrub = (x) => JSON.stringify(x).replace(/Neither project is cheaper or better overall\./g, '').replace(/It does not say which is better value\./g, '').replace(/This does not mean [^.]*?is the better buy, and it does not mean [^.]*? is\./g, '').replace(/This does not mean either project is the better buy\./g, '');

console.log('Sale type default (D5)');
t('default is the sale type with most sales in the last 12 months', () => assert.strictEqual(RS.defaultSale(proj('MULTI')), 'new'));
t('tie prefers resale', () => assert.strictEqual(RS.defaultSale(proj('TIE')), 'resale'));
t('selected sale type is carried on the model with all options', () => { const m = AP('MULTI'); assert.strictEqual(m.sale.selected, 'new'); assert.deepStrictEqual(m.sale.options.map((o) => o.id).sort(), ['new', 'resale']); assert.ok(m.sale.label); });
t('explicit sale choice is respected; unavailable sale falls back to default', () => { assert.strictEqual(AP('MULTI', { sale: 'resale' }).sale.selected, 'resale'); assert.strictEqual(AP('GRAND', { sale: 'new' }).sale.selected, 'resale'); });

console.log('Evidence: facts plus structural tags, no tiers');
t('single sale tag', () => { const e = AP('SINGLE').recent.noRecent; assert.strictEqual(e, false); const ev = AP('SINGLE').evidence.recent; assert.ok(ev.tags.some((x) => x.id === 'single')); assert.ok(/^1 sale · 1 month · latest Sep 2026$/.test(ev.line), ev.line); });
t('one month only tag', () => { const ev = AP('ONEMO').evidence.recent; assert.ok(ev.tags.some((x) => x.id === 'one-month')); assert.ok(!ev.tags.some((x) => x.id === 'single')); });
t('no-recent project is flagged and says so in plain words', () => { const m = AP('OLDPJ'); assert.strictEqual(m.state, 'no-recent'); assert.ok(m.recent.noRecent); assert.ok(/No resale sales in the last 12 months/.test(m.read[0].text)); assert.ok(m.bands.every((b) => b.tags.some((x) => x.id === 'none-recent'))); });
t('no Strong/Medium/Weak tier wording anywhere in the model', () => { const s = JSON.stringify([AP('GRAND'), AP('SINGLE'), AC('IMP', 'TRI'), AC('GRAND', 'IMP')]); assert.ok(!/\b(strong|medium|weak)\b/i.test(s.replace(/Good recent overlap/g, '').replace(/strong price indication/g, ''))); });
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


console.log('Comparison never fails to load (AMO Residence regression)');
// Every field the page (research/index.html compareHtml/showCompare) reads from a comparison model. A missing one used to throw and surface as "couldn't load".
const PAGE_NEEDS = ['kind', 'a', 'b', 'pairKey', 'sale', 'ken', 'wa', 'overlap', 'headline', 'reasons', 'differences', 'ladder', 'bands', 'activeWindow', 'firstWindowWithMatch', 'windowLabel', 'older', 'olderTag', 'focusNote', 'direction', 'history', 'floors', 'notes', 'notMeasured'];
const NAMES = ['GRAND', 'IMP', 'TRI', 'MULTI', 'TIE', 'SINGLE', 'OLDPJ', 'ONEMO', 'NEWONLY', 'OTHERD', 'SUBP', 'SUBONLY', 'AMOLIKE', 'BIG'];
t('every pair of synthetic projects (both directions) yields a complete model and never throws', () => {
  let n = 0;
  NAMES.forEach((x) => NAMES.forEach((y) => { if (x === y) return; const c = AC(x, y); n++; const miss = PAGE_NEEDS.filter((k) => c[k] === undefined); assert.deepStrictEqual(miss, [], x + ' vs ' + y); assert.ok(Array.isArray(c.reasons) && c.reasons.length > 0); assert.ok(c.history && Array.isArray(c.history.bands) && c.floors && Array.isArray(c.floors.rows)); assert.ok(c.direction && typeof c.direction.text === 'string'); assert.ok(c.overall === null || typeof c.overall === 'object'); assert.ok(['good', 'limited', 'none'].indexOf(c.overlap) > -1); }));
  assert.ok(n >= 150);
});
t('resale-only vs new+sub-sale project (the AMO shape): none, no shared sale type, both projects named, reason explains', () => {
  const c = AC('IMP', 'AMOLIKE'); assert.strictEqual(c.overlap, 'none'); assert.strictEqual(c.headline, 'No like-for-like transaction evidence found');
  const r = c.reasons.join(' '); assert.ok(/No shared sale type/.test(r)); assert.ok(/resale sales/.test(r) && /new sales and sub-sales/.test(r), r);
  assert.strictEqual(c.a.name, 'Imp'); assert.strictEqual(c.b.name, 'Amolike'); assert.deepStrictEqual(c.ladder, []); assert.deepStrictEqual(c.bands, []); assert.strictEqual(c.sale.selected, null); assert.ok(c.differences.length > 0);
  assert.strictEqual(AC('AMOLIKE', 'IMP').overlap, 'none');
});
t('new-sale-heavy vs resale project that also has new sales shares the new-sale type', () => { const c = AC('AMOLIKE', 'MULTI'); assert.deepStrictEqual(c.sale.options.map((o) => o.id), ['new']); assert.strictEqual(c.sale.selected, 'new'); });
t('project with sub-sale vs project with sub-sale shares sub-sale; sub-sale vs resale-only does not', () => {
  assert.ok(AC('SUBP', 'SUBONLY').sale.shared.indexOf('sub') > -1);
  assert.strictEqual(AC('SUBONLY', 'IMP').overlap, 'none'); assert.ok(/No shared sale type/.test(AC('SUBONLY', 'IMP').reasons.join(' ')));
  assert.ok(AC('SUBP', 'IMP').sale.shared.indexOf('resale') > -1);
});
t('shared sale type but no shared size band: none, ladder shown with no matches, explained, not a load failure', () => {
  const c = AC('IMP', 'BIG'); assert.strictEqual(c.overlap, 'none'); assert.strictEqual(c.headline, 'No like-for-like transaction evidence found');
  assert.strictEqual(c.ladder.length, 4); assert.ok(c.ladder.every((l) => !l.hasMatch)); assert.deepStrictEqual(c.bands, []); assert.ok(/overlapping sizes|matched on size/i.test(c.reasons.join(' ')), c.reasons.join(' '));
});
t('"none" results never expose a winner or any price comparison', () => { const s = scrub([AC('IMP', 'AMOLIKE'), AC('IMP', 'BIG')]); assert.ok(!/cheaper|better|winner|higher/i.test(s)); });
t('page: only genuinely missing data may show the load-error page (render failures are logged, not hidden)', () => { const src = fs.readFileSync(root + '/research/index.html', 'utf8'); assert.ok(/catch\(\(e\) => \{ console\.error/.test(src.replace(/\s+/g, ' ')) || (src.match(/console\.error\('KPT research/g) || []).length >= 2); });

console.log('What the numbers suggest (interpretation layer)');
const IW = (n) => AC(n[0], n[1]), SWAP = (a, b) => [IW([a, b]), IW([b, a])];
const allText = (I) => I.paragraphs.map((p) => p.text).join(' ') + ' ' + I.evidence.text + ' ' + I.question;
const BANNED = /undervalu|overvalu|good buy|bad buy|bargain|cheap|expensive|apprecia|forecast|predict|will (rise|fall|grow|go)|outperform|worth (it|more)|\bwinner\b/i;
const stripDisclaimer = (x) => x.replace(/This does not mean [^.]*?is the better buy, and it does not mean [^.]*? is\./g, '').replace(/This does not mean either project is the better buy\./g, '');
t('good overlap, one project higher in every band: says "generally transacts at a higher PSF than", names the higher project, lists bands', () => {
  const I = IW(['LOA', 'HIA']).interpretation; assert.strictEqual(I.state, 'full'); assert.strictEqual(I.basis.direction, 'b'); assert.strictEqual(I.basis.higherName, 'Hia');
  assert.ok(/^Hia generally transacts at a higher PSF than Loa across comparable unit sizes \(600s and 1,000s sqft\)\.$/.test(I.paragraphs[0].text), I.paragraphs[0].text);
});
t('size of difference is structural: overlapping ranges are "within the spread", separated ranges are called out', () => { const I = IW(['LOA', 'HIA']).interpretation; const z = I.paragraphs.find((p) => p.id === 'size').text; assert.ok(/overlap in 600s sqft/.test(z), z); assert.ok(/do not overlap in 1,000s sqft/.test(z), z); assert.ok(/The gap in middle PSF is about \d+% in the 600s band and about \d+% in the 1,000s band/.test(z), z); assert.deepStrictEqual(I.basis.overlapBands, [600]); assert.deepStrictEqual(I.basis.separateBands, [1000]); });
t('mixed direction is stated explicitly, with the bands each way, and no overall higher project', () => { const I = IW(['MIXA', 'MIXB']).interpretation; assert.strictEqual(I.basis.direction, 'mixed'); assert.strictEqual(I.basis.higher, null); assert.ok(/^The direction is mixed across comparable sizes: Mixa has the higher middle PSF in 1 band \(1,000s sqft\) and Mixb in 1 band \(600s sqft\)\./.test(I.paragraphs[0].text) || /direction is mixed/.test(I.paragraphs[0].text), I.paragraphs[0].text); assert.ok(/depends on size/.test(I.question)); assert.ok(/does not mean either project is the better buy/.test(allText(I))); });
t('mostly one way with some level bands says "higher in k of N bands, the rest about level"', () => { const I = IW(['EQA', 'EQB']).interpretation; assert.strictEqual(I.basis.direction, 'mostly'); assert.strictEqual(I.basis.bandsLevel, 1); assert.ok(/higher in 2 of 3 bands, the rest about level/.test(I.paragraphs[0].text), I.paragraphs[0].text); });
t('single supported band is called one data point, not a pattern', () => { const I = IW(['SOLOA', 'SOLOB']).interpretation; assert.strictEqual(I.basis.direction, 'single'); assert.ok(/single data point, not a pattern/.test(I.paragraphs[0].text), I.paragraphs[0].text); assert.ok(/1 other shared band has too few sales/.test(I.paragraphs.find((p) => p.id === 'strength').text)); assert.ok(!/generally transacts/.test(allText(I))); });
t('THIN evidence is the main message: no direction is manufactured when no band has enough sales', () => { const I = IW(['GRAND', 'IMP']).interpretation; assert.strictEqual(I.state, 'thin'); assert.strictEqual(I.basis.direction, 'none'); const lead = I.paragraphs[0].text; assert.ok(/evidence here is thin/.test(lead)); assert.ok(/no shared size band in the last 12 months/i.test(lead) && /older evidence/.test(lead)); assert.strictEqual(I.paragraphs.length, 1); assert.ok(!/higher|generally transacts|mixed/.test(allText(I).replace(/at least 2 sales/, '')), allText(I)); assert.ok(/more like-for-like evidence/.test(I.question)); assert.ok(/No band has at least 2 sales in at least 2 months/.test(I.evidence.text)); });
t('limited overlap with some supported bands: thin first, direction hedged as indicative only', () => { const c = AC('TRI', 'MULTI'); const lim = [AC('HIA', 'GRAND'), AC('IMP', 'GRAND'), AC('TRI', 'GRAND'), c].filter((x) => x.overlap === 'limited' && x.interpretation); lim.forEach((x) => { assert.strictEqual(x.interpretation.state, 'thin'); assert.ok(/thin|limited/.test(x.interpretation.paragraphs[0].text)); }); });
t('no like-for-like evidence: no interpretation at all (handled separately)', () => { assert.strictEqual(AC('IMP', 'AMOLIKE').interpretation, null); assert.strictEqual(AC('IMP', 'BIG').interpretation, null); assert.strictEqual(AC('IMP', 'NEWONLY').interpretation, null); });
t('evidence line carries counts, coverage and recency as facts', () => { const e = IW(['LOA', 'HIA']).interpretation.evidence; assert.ok(/2 shared size bands in the last 12 months/.test(e.text)); assert.ok(/The shared bands cover 8 of Loa's 8 sales and 8 of Hia's 8\. Latest matched sale: Sep 2026\./.test(e.text), e.text); assert.deepStrictEqual([e.sharedBands, e.supportedBands, e.window], [2, 2, 'last 12 months']); });
t('A vs B and B vs A are logically consistent: same higher project, mirrored direction, same gaps, same evidence', () => {
  const pairs = [['LOA', 'HIA'], ['MIXA', 'MIXB'], ['EQA', 'EQB'], ['SOLOA', 'SOLOB'], ['GRAND', 'IMP'], ['IMP', 'TRI'], ['SUBP', 'IMP'], ['MULTI', 'TIE'], ['IMP', 'GRAND']];
  let n = 0;
  pairs.forEach(([a, b]) => { const [x, y] = SWAP(a, b); if (!x.interpretation) { assert.strictEqual(y.interpretation, null); return; } n++; const p = x.interpretation.basis, q = y.interpretation.basis, flip = { a: 'b', b: 'a', mixed: 'mixed', mostly: 'mostly', single: 'single', none: 'none', level: 'level' };
    assert.strictEqual(p.higher, q.higher, a + '/' + b); assert.strictEqual(p.higherName, q.higherName); assert.strictEqual(x.interpretation.state, y.interpretation.state);
    if (p.direction === 'a' || p.direction === 'b') assert.strictEqual(q.direction, flip[p.direction]); else if (p.direction !== 'mostly') assert.strictEqual(q.direction, p.direction);
    assert.deepStrictEqual([p.bandsA, p.bandsB, p.bandsLevel], [q.bandsB, q.bandsA, q.bandsLevel]); assert.deepStrictEqual(p.overlapBands, q.overlapBands); assert.deepStrictEqual(p.separateBands, q.separateBands); assert.deepStrictEqual(p.widest, q.widest); assert.deepStrictEqual(p.narrowest, q.narrowest);
    assert.deepStrictEqual([x.interpretation.evidence.sharedBands, x.interpretation.evidence.supportedBands], [y.interpretation.evidence.sharedBands, y.interpretation.evidence.supportedBands]); });
  assert.ok(n >= 6);
});
t('band gap % is measured on the lower middle PSF, so A vs B and B vs A show the same % and the same higher project', () => { const [x, y] = SWAP('LOA', 'HIA'); x.bands.forEach((b) => { const o = y.bands.find((z) => z.bin === b.bin); assert.strictEqual(b.gap.pct, o.gap.pct); assert.notStrictEqual(b.gap.dir, o.gap.dir); }); const lo = proj('LOA'), hi = proj('HIA'); assert.ok(x.bands.every((b) => b.gap.pct > 0)); });
t('never says better/cheaper/undervalued/overvalued/good buy/bad buy or predicts; "better buy" appears only inside the explicit disclaimer', () => {
  const names = ['LOA', 'HIA', 'MIXA', 'MIXB', 'EQA', 'EQB', 'SOLOA', 'SOLOB', 'GRAND', 'IMP', 'TRI', 'SUBP', 'MULTI']; let n = 0;
  names.forEach((a) => names.forEach((b) => { if (a === b) return; const I = AC(a, b).interpretation; if (!I) return; n++; const x = stripDisclaimer(allText(I)); assert.ok(!BANNED.test(x), a + '/' + b + ': ' + x.match(BANNED)); assert.ok(!/\bbetter\b/i.test(x), a + '/' + b + ': ' + x); assert.ok(!/\b(rose|grew|gain)\b/i.test(x)); }));
  assert.ok(n > 20);
});
t('separates evidence from judgement: question points to unit, layout, floor, facing and is not a conclusion', () => { const I = IW(['LOA', 'HIA']).interpretation; assert.ok(/layout, floor, facing/.test(I.question)); assert.ok(/not in the transactions/.test(I.question)); assert.ok(/Transaction PSF cannot tell you whether the difference is justified/.test(allText(I))); });
t('deterministic: same model gives identical text, and the module has no runtime AI or randomness', () => { const a = JSON.stringify(IW(['LOA', 'HIA']).interpretation), b = JSON.stringify(IW(['LOA', 'HIA']).interpretation); assert.strictEqual(a, b); const src = fs.readFileSync(root + '/assets/js/kpt-research.js', 'utf8'); assert.ok(!/Math\.random|fetch\(|XMLHttpRequest/.test(src)); });
t('interpretation follows the selected window and says when it is older evidence', () => { const c = AC('GRAND', 'IMP', { window: 3 }); assert.ok(c.interpretation); assert.ok(/all history|full history|last 24|last 36/.test(c.interpretation.evidence.text) || c.interpretation.evidence.window); });
t('interpretation adds no new fields to existing evidence: bands, ladder and reasons are unchanged by it', () => { const c = AC('LOA', 'HIA'); const j = JSON.stringify(Object.assign({}, c, { interpretation: undefined })); assert.ok(j.indexOf('"bands"') > -1 && c.reasons.length > 0 && c.ladder.length === 4); });
t('page renders the section after the evidence assessment and before matched sizes, and nothing for "none"', () => { const src = fs.readFileSync(root + '/research/index.html', 'utf8'); assert.ok(src.indexOf('${interpHtml(M.interpretation)}') > src.indexOf('id="verdict"') && src.indexOf('${interpHtml(M.interpretation)}') < src.indexOf('Matched on size</h2>')); assert.ok(/if \(!I\) return ''/.test(src)); });

console.log('Single-project answer (layer 1 wording)');
const ANS = (n, o) => AP(n, o || {}).answer, ansText = (a) => [a.eyebrow, a.headline].concat(a.lines.map((l) => l.text), [a.next, a.caveat]).join(' ');
const BANNED_A = /undervalu|overvalu|good buy|bad buy|bargain|cheap|expensive|apprecia|forecast|predict|will (rise|fall|grow|go)|outperform|worth (it|more)|\bwinner\b|\bbetter\b|\bbest\b|should (buy|sell)|recommend/i;
t('STRONG recent evidence: short labelled price, the facts behind it, and no next-step sentence', () => {
  const a = ANS('GRAND'); assert.strictEqual(a.state, 'recent'); assert.ok(/^Recent sales: around \$[\d,]+ psf$/.test(a.headline), a.headline); assert.strictEqual(a.price.label, 'Recent sales');
  const c = a.lines.find((l) => l.id === 'confidence').text; assert.ok(/^3 sales across 3 of the last 12 months\.$/.test(c), c);
  assert.strictEqual(a.strength.label, 'Good recent evidence'); assert.strictEqual(a.eyebrow, 'Most active size recently'); assert.strictEqual(a.sizeNote, 'The most commonly transacted size in the last 12 months.');
  assert.strictEqual(a.size.label, '1,300–1,399 sqft'); assert.strictEqual(a.next, ''); assert.ok(!/reference rather than|only been|Only \d/.test(ansText(a)));
  const h = a.lines.find((l) => l.id === 'history'); if (a.range) assert.ok(/^(\$[\d,]+–\$[\d,]+|around \$[\d,]+) psf$/.test(a.range.value) && a.range.label === 'Historical range', a.range.value); if (h) assert.ok(/^All \d+ (resale |new |sub-)?sales on record at this size were in the last 12 months\.$/.test(h.text), h.text);
});
t('THIN recent evidence (1 sale): says so plainly with the reference sentence', () => {
  const a = ANS('SINGLE'); assert.strictEqual(a.state, 'recent-thin'); const c = a.lines.find((l) => l.id === 'confidence').text;
  assert.strictEqual(c, 'Only 1 sale in the last 12 months. Treat this as a reference.'); assert.strictEqual(a.next, ''); assert.strictEqual(a.strength.label, 'Limited recent evidence'); assert.strictEqual(a.strength.dot, 'hollow');
  assert.ok(!/isn't enough recent evidence|rely heavily/.test(ansText(a)));
});
t('THIN recent evidence (several sales, one month): says all were in that month', () => { const a = ANS('ONEMO'); assert.strictEqual(a.state, 'recent-thin'); assert.strictEqual(a.lines[0].text, 'Only 3 sales in the last 12 months, all in Sep 2026. Treat this as a reference.'); });
t('NO RECENT size evidence but older evidence exists: no recent price is given, latest month is named, older-sales caveat shown', () => {
  const a = ANS('OLDPJ'); assert.strictEqual(a.state, 'older'); assert.strictEqual(a.headline, 'Recent sales: none in the last 12 months'); assert.ok(!/around \$[\d,]+ psf$/.test(a.headline));
  assert.ok(/^The latest sale around this size was in Feb 2023\.$/.test(a.lines[0].text), a.lines[0].text); assert.ok(/may not reflect today's prices/.test(ansText(a))); assert.ok(/different size|another project/.test(a.next));
  assert.strictEqual(a.facts.recentN, 0);
});
t('NO USEFUL size evidence (size asked for has no sales): says so, offers the nearest sizes, refuses to give one mixed overall price', () => {
  const a = ANS('GRAND', { sizeSqft: 2500 }); assert.strictEqual(a.state, 'no-size'); assert.strictEqual(a.headline, 'Recent sales: none recorded around this size'); assert.strictEqual(a.size.label, '2,500–2,599 sqft'); assert.ok(a.nearest.length > 0 && a.nearest.every((x) => x.bin && x.label));
  assert.ok(/would mix different unit sizes/.test(ansText(a))); assert.ok(!/around \$[\d,]+ psf/.test(a.headline));
});
t('answer follows the selected sale type, and the size control stays available in every state', () => { assert.strictEqual(AP('MULTI').sale.selected, 'new'); const a = ANS('MULTI'), r = ANS('MULTI', { sale: 'resale' }); assert.ok(JSON.stringify(a) !== JSON.stringify(r)); assert.ok(a.price && r.price); });
t('user-chosen size vs default size is labelled differently', () => { assert.strictEqual(ANS('GRAND').eyebrow, 'Most active size recently'); assert.strictEqual(ANS('GRAND', { sizeSqft: 1350 }).eyebrow, 'The size you asked about'); });
t('answer states use the approved cell rule, not new thresholds (2 sales in 2 months)', () => { assert.strictEqual(ANS('GRAND').facts.recentN >= 2 && ANS('GRAND').facts.recentMonths >= 2, true); assert.strictEqual(ANS('SINGLE').facts.recentN, 1); });
t('strength label maps 1:1 from the existing state (no new scoring); "Most active size recently" is never used without recent sales', () => {
  const MAP = { recent: 'Good recent evidence', 'recent-thin': 'Limited recent evidence', older: 'Older evidence only', 'no-size': 'Not enough comparable evidence' }; const seen = {};
  ['GRAND', 'SINGLE', 'ONEMO', 'OLDPJ', 'OTHERD', 'BIG'].forEach((x) => [undefined, 700, 2500].forEach((sz) => { const a = ANS(x, sz ? { sizeSqft: sz } : {}); seen[a.state] = 1; assert.strictEqual(a.strength.label, MAP[a.state], x + ' ' + sz);
    if (a.state === 'older' || a.state === 'no-size') assert.ok(a.eyebrow !== 'Most active size recently', x); if (a.eyebrow === 'Most active size recently') assert.ok(a.facts.recentN > 0 && !a.size.userChosen); }));
  assert.ok(seen.recent && seen['recent-thin'] && seen.older && seen['no-size']);
});
t('caveat is the short approved line; the PSF approximation lives in the evidence note, not the default answer', () => {
  const a = ANS('GRAND'); assert.strictEqual(a.caveat, 'Based on transactions only. Actual units may differ by floor, facing and layout.'); assert.ok(!/approximate/i.test(ansText(a)));
  assert.ok(/approximate/.test(AP('GRAND', {}).evidence.note));
});
t('no valuation language, no forecasts, no verdicts in any state, any project', () => {
  const names = ['GRAND', 'IMP', 'TRI', 'MULTI', 'TIE', 'SINGLE', 'OLDPJ', 'ONEMO', 'NEWONLY', 'OTHERD', 'SUBP', 'SUBONLY', 'AMOLIKE', 'BIG', 'HIA', 'LOA']; let n = 0;
  names.forEach((x) => [undefined, 700, 1000, 1350, 2500].forEach((sz) => { const a = ANS(x, sz ? { sizeSqft: sz } : {}); n++; assert.ok(!BANNED_A.test(ansText(a)), x + ' ' + sz + ': ' + (ansText(a).match(BANNED_A) || [])[0]); assert.ok(a.headline && a.eyebrow && (a.state === 'recent' || a.state === 'recent-thin' ? a.next === '' : a.next)); assert.ok(['recent', 'recent-thin', 'older', 'no-size'].indexOf(a.state) > -1); }));
  assert.ok(n >= 80);
});
t('deterministic, nothing hard-coded to a project name, no sizes or names typed by the user leak into the text', () => {
  assert.strictEqual(JSON.stringify(ANS('GRAND')), JSON.stringify(ANS('GRAND'))); const src = fs.readFileSync(root + '/assets/js/kpt-research.js', 'utf8'); const i = src.indexOf('function summarise'), j = src.indexOf('suggestions, WhatsApp'); const body = src.slice(i, j);
  assert.ok(!/bartley|thomson|botanique|amo residence|ridge|grand/i.test(body), 'project name hard-coded'); assert.ok(!/Math\.random|Date\.now|new Date/.test(body));
  assert.ok(ANS('GRAND', { sizeSqft: 1357 }).headline.indexOf('1357') === -1);
});
t('the existing evidence is still on the model, untouched, alongside the answer', () => { const m = AP('GRAND'); ['read', 'recent', 'bands', 'history', 'floors', 'context', 'evidence', 'notMeasured', 'focus', 'sale'].forEach((k) => assert.ok(m[k] !== undefined, k)); assert.ok(m.answer); });
t('only the project view carries an answer; comparisons are unchanged', () => { assert.strictEqual(AC('IMP', 'TRI').answer, undefined); assert.strictEqual(RS.summarise(AC('IMP', 'TRI')), null); });

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
t('displayName keeps reviewed initialisms upper-case and still title-cases ordinary words', () => {
  assert.strictEqual(RS.displayName('AMO RESIDENCE'), 'AMO Residence'); assert.strictEqual(RS.displayName('OUE TWIN PEAKS'), 'OUE Twin Peaks'); assert.strictEqual(RS.displayName('JLB RESIDENCES'), 'JLB Residences'); assert.strictEqual(RS.displayName('RIVER VALLEY RVG'), 'River Valley RVG'); assert.strictEqual(RS.displayName('PARK PLACE RESIDENCES AT PLQ'), 'Park Place Residences at PLQ'); assert.strictEqual(RS.displayName('TMW MAXWELL'), 'TMW Maxwell');
  assert.strictEqual(RS.displayName('ONE SKY BAY'), 'One Sky Bay'); assert.strictEqual(RS.displayName('THE ORIE'), 'The Orie');
});
t('comparison and WhatsApp use the corrected display name', () => { assert.ok(RS.waMessage([RS.displayName('AMO RESIDENCE')]).indexOf('AMO Residence') > -1); });
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
    if (has('amo-residence')) t('REAL: Thomson Impressions vs AMO Residence loads as "No like-for-like transaction evidence found" in both directions', () => {
      const am = get('amo-residence'), c = RS.analyseComparison(i, am, man, {}), d = RS.analyseComparison(am, i, man, {});
      [c, d].forEach((x) => { assert.strictEqual(x.overlap, 'none'); assert.strictEqual(x.headline, 'No like-for-like transaction evidence found'); assert.ok(/No shared sale type/.test(x.reasons.join(' '))); assert.deepStrictEqual(PAGE_NEEDS.filter((k) => x[k] === undefined), []); });
      assert.ok(/resale sales/.test(c.reasons[0]) && /new sales and sub-sales/.test(c.reasons[0]), c.reasons[0]);
    });
    t('REAL: many pairs across sale-type shapes all give complete models', () => {
      const F = P.fieldMap(idx.fields), r = idx.rows.map((x, k) => P.rowObject(idx, k)), pick = (f, k) => r.filter(f).sort((a, b) => b.n - a.n).slice(0, k).map((x) => x.id);
      const ids = [].concat(pick((x) => x.new > 0 && !x.resale && !x.sub, 8), pick((x) => x.sub > 0, 8), pick((x) => x.resale > 0 && !x.new && !x.sub, 8), pick((x) => x.n <= 2, 4), ['thomson-impressions']);
      let n = 0; ids.forEach((a) => ids.forEach((b) => { if (a === b) return; const c = RS.analyseComparison(get(a), get(b), man, {}); n++; assert.deepStrictEqual(PAGE_NEEDS.filter((k) => c[k] === undefined), [], a + '/' + b); })); assert.ok(n > 800);
    });
    t('REAL: Bartley Ridge vs Botanique at Bartley (both orders): Botanique generally higher, ranges overlap in small bands and separate in others', () => {
      if (!has('bartley-ridge') || !has('botanique-at-bartley')) return; const x = RS.analyseComparison(get('bartley-ridge'), get('botanique-at-bartley'), man, {}), y = RS.analyseComparison(get('botanique-at-bartley'), get('bartley-ridge'), man, {});
      [x, y].forEach((c) => { const I = c.interpretation; assert.strictEqual(I.basis.higher, 'botanique-at-bartley'); assert.ok(/^Botanique at Bartley generally transacts at a higher PSF than Bartley Ridge across comparable unit sizes/.test(I.paragraphs[0].text)); assert.ok(I.basis.overlapBands.length > 0 && I.basis.separateBands.length > 0); });
      assert.deepStrictEqual(x.interpretation.basis.widest, y.interpretation.basis.widest);
    });
    t('REAL: Impressions vs Three is mixed and declares no winner; both orders agree', () => { const [x, y] = [RS.analyseComparison(i, th, man, {}), RS.analyseComparison(th, i, man, {})]; [x, y].forEach((c) => { assert.strictEqual(c.interpretation.basis.direction, 'mixed'); assert.ok(/direction is mixed/.test(c.interpretation.paragraphs[0].text)); }); assert.strictEqual(x.interpretation.basis.higher, null); });
    t('REAL: Grand vs Impressions leads with thin evidence and says no direction can be described', () => { const c = RS.analyseComparison(g, i, man, {}); assert.strictEqual(c.interpretation.state, 'thin'); assert.ok(/evidence here is thin/.test(c.interpretation.paragraphs[0].text)); assert.ok(/2 of Thomson Grand's 37 sales/.test(c.interpretation.evidence.text)); });
    t('REAL: AMO Residence vs a resale-only project has no interpretation (handled as no like-for-like evidence)', () => { if (!has('amo-residence')) return; assert.strictEqual(RS.analyseComparison(get('amo-residence'), i, man, {}).interpretation, null); assert.strictEqual(RS.analyseComparison(i, get('amo-residence'), man, {}).interpretation, null); });
    t('REAL: across many pairs, interpretation is consistent under swap and never uses banned wording', () => {
      const r = idx.rows.map((x, k) => P.rowObject(idx, k)).sort((a, b) => b.n - a.n).slice(0, 40).map((x) => x.id); let n = 0;
      r.forEach((a) => r.forEach((b) => { if (a >= b) return; const x = RS.analyseComparison(get(a), get(b), man, {}), y = RS.analyseComparison(get(b), get(a), man, {}); assert.strictEqual(!!x.interpretation, !!y.interpretation); if (!x.interpretation) return; n++;
        assert.strictEqual(x.interpretation.basis.higher, y.interpretation.basis.higher, a + '/' + b); assert.strictEqual(x.interpretation.state, y.interpretation.state); assert.deepStrictEqual(x.interpretation.basis.widest, y.interpretation.basis.widest, a + '/' + b);
        const txt = stripDisclaimer(allText(x.interpretation)); assert.ok(!BANNED.test(txt) && !/\bbetter\b/i.test(txt), a + '/' + b); }));
      assert.ok(n > 100);
    });
    t('REAL: Bartley Ridge around 500 sqft reproduces the thin-evidence example from the brief, generated not hard-coded', () => {
      if (!has('bartley-ridge')) return; const m = RS.analyseProject(get('bartley-ridge'), man, { sizeSqft: 550 }), a = m.answer;
      assert.strictEqual(a.state, 'recent-thin'); assert.strictEqual(a.size.label, '500–599 sqft'); assert.strictEqual(a.headline, 'Recent sales: around $1,594 psf');
      assert.strictEqual(a.lines[0].text, 'Only 1 sale in the last 12 months. Treat this as a reference.');
      assert.strictEqual(a.range.label + ': ' + a.range.value, 'Historical range: $1,415–$1,591 psf'); assert.strictEqual(a.eyebrow, 'The size you asked about'); assert.strictEqual(a.sizeNote, '');
    });
    t('REAL: every project, default size: an answer is always produced in one of the four states, with no banned wording', () => {
      const rows = idx.rows.map((x, k) => P.rowObject(idx, k)); const seen = {}; let n = 0;
      rows.forEach((r, k) => { if (k % 4) return; const a = RS.analyseProject(get(r.id), man, {}).answer; n++; seen[a.state] = (seen[a.state] || 0) + 1; assert.ok(a.headline && !BANNED_A.test(ansText(a)), r.id); });
      assert.ok(n > 400); assert.ok(seen.recent && seen['recent-thin'] && seen.older, JSON.stringify(seen));
    });
    t('REAL: Grand 1,000s band has older evidence only (no sale in 12 months)', () => { const a = RS.analyseProject(g, man, { sizeSqft: 1050 }).answer; assert.strictEqual(a.state, 'older'); assert.ok(/latest sale around this size was in Mar 2025/.test(a.lines[0].text)); });
  } else console.log('  skip Thomson projects not in data');
} else console.log('  skip no data/projects');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
