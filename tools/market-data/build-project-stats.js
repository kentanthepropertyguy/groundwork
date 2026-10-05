#!/usr/bin/env node
/* ==========================================================================
   Project-level data layer. Turns raw URA transactions into compact, static AGGREGATES per named project.
   Raw transactions are never written out. Run it on your own computer, where the raw files live.

   Usage: node tools/market-data/build-project-stats.js --raw tools/market-data/raw --out data/projects [--as-of 2026-10-05] [--report tools/market-data/out/projects-report.txt]

   Scope (approved): Condominium + Apartment, strata, single-unit transactions; New Sale, Sub-sale and Resale kept as separate sale types.
   Executive Condominiums, landed, multi-unit caveats and the reviewed catch-all names are excluded. No bedroom, exact floor, or forecast fields exist.

   Output (folder):
     manifest.json   schema, field orders, windows, periods, floor bands, counts, policy statements
     index.json      one compact row per project (search / pick)
     search.json     token + prefix index for static name search
     detail/sNN.json  per-project aggregates, ~64 hash shards
     peers/*.json     district and region context cells (labelled context, never "comparables")

   Windows are TRAILING and CUMULATIVE (12 / 24 / 36 months ending on the latest month in the data, plus full history) so every
   cell is a self-contained snapshot. Nothing downstream silently widens a window.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { quantile } = require('./build-bands.js');
const P = require('../../assets/js/kpt-project.js');
const SQM_TO_SQFT = 10.7639;

const CELL_FIELDS = ['sale', 'bin', 'win', 'n', 'act', 'top', 'last', 'min', 'q1', 'med', 'q3', 'max'];
const PEER_FIELDS = ['sale', 'tenureGroup', 'bin', 'win', 'n', 'projects', 'top', 'act', 'last', 'min', 'q1', 'med', 'q3', 'max'];
const SALE_NAME = { 1: 'new', 2: 'sub', 3: 'resale' };
const ymToS = (ym) => Math.floor(ym / 12) + '-' + String((ym % 12) + 1).padStart(2, '0');
const ymToInt = (ym) => Math.floor(ym / 12) * 100 + (ym % 12) + 1;
const r0 = (v) => Math.round(v);

function flatten(files) {          // like build-bands.flatten, but keeps the project street
  const out = [];
  files.forEach((doc) => (doc.Result || []).forEach((p) => (p.transaction || []).forEach((t) => out.push(Object.assign({ project: p.project, street: p.street, marketSegment: p.marketSegment }, t)))));
  return out;
}

/* ---------- tenure ---------- */
// Returns {kind:'FH'|'LEASE', years, year, label}. Handles "99 yrs lease commencing from 2012", "99 years lease commencing from 2012",
// "99 years leasehold" (no start year) and "Freehold".
function parseTenure(s) {
  const t = String(s || '').trim();
  if (/^freehold$/i.test(t)) return { kind: 'FH', years: null, year: null, label: 'Freehold' };
  let m = /(\d+)\s*(?:yrs?|years?)\s*lease commencing from\s*(\d{4})/i.exec(t);
  if (m) return { kind: 'LEASE', years: +m[1], year: +m[2], label: m[1] + ' yrs from ' + m[2] };
  m = /(\d+)\s*(?:yrs?|years?)\s*leasehold/i.exec(t);
  if (m) return { kind: 'LEASE', years: +m[1], year: null, label: m[1] + ' yrs (start year not given)' };
  return { kind: 'UNKNOWN', years: null, year: null, label: t || 'unknown' };
}
// Same grouping rule as the existing engine pipeline: leases over maxLeaseYearsForAge, or freehold, are the "Freehold / 999-yr" group.
function tenureGroupIndex(ten, sale, refYear, cfg, groups) {
  if (sale !== 3) return 0;                                   // new sale / sub-sale: '–'
  if (ten.kind === 'FH' || (ten.kind === 'LEASE' && ten.years > cfg.maxLeaseYearsForAge) || ten.kind === 'UNKNOWN') return groups.length - 1;
  if (ten.year === null) return groups.length - 1;
  const age = refYear - ten.year, band = cfg.ageBands.find((b) => b.maxAge === null || age < b.maxAge);
  return groups.indexOf(band.label);
}
function projectTenureGroup(ten, refYear, cfg, groups) {
  if (ten.kind === 'FH' || (ten.kind === 'LEASE' && ten.years > cfg.maxLeaseYearsForAge)) return groups.length - 1;
  if (ten.kind === 'LEASE' && ten.year !== null) { const age = refYear - ten.year; return groups.indexOf(cfg.ageBands.find((b) => b.maxAge === null || age < b.maxAge).label); }
  return 0;                                                   // start year unknown: no age assigned
}

/* ---------- statistics ---------- */
const q5 = (sorted) => [sorted[0], quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75), sorted[sorted.length - 1]].map(r0);
function summary(rows, ymOf) {
  const psf = rows.map((x) => x.psf).sort((a, b) => a - b), months = {};
  rows.forEach((x) => { months[x.ym] = (months[x.ym] || 0) + 1; });
  const ks = Object.keys(months);
  return { n: rows.length, act: ks.length, top: Math.max.apply(null, ks.map((k) => months[k])), last: ymToInt(Math.max.apply(null, ks.map(Number))), psf: q5(psf) };
}
const cellRow = (key, s) => key.concat([s.n, s.act, s.top, s.last]).concat(s.psf);

/* ---------- build ---------- */
function build(records, cfg, pc, asOf) {
  const warnings = [], report = { read: records.length, excluded: {}, used: 0, excludedNames: {}, heldNames: {} };
  const ex = (k) => { report.excluded[k] = (report.excluded[k] || 0) + 1; };
  const exclude = new Map(pc.exclude.map((e) => [e.name, e])), hold = new Map(pc.hold.map((e) => [e.name, e]));
  const seenNames = new Set(); records.forEach((r) => seenNames.add(r.project));

  // 1. parse + filter
  const parsed = [];
  records.forEach((t) => {
    const m = /^(\d{2})(\d{2})$/.exec(String(t.contractDate || ''));
    if (!m) return ex('bad contract date');
    if (!cfg.propertyTypes.includes(t.propertyType)) return ex('property type not in scope (' + (t.propertyType || '?') + ')');
    if (t.typeOfArea !== 'Strata') return ex('not strata area');
    if (String(t.noOfUnits) !== '1') return ex('multi-unit caveat');
    const sale = +t.typeOfSale; if (![1, 2, 3].includes(sale)) return ex('unknown sale type');
    if (!['OCR', 'RCR', 'CCR'].includes(t.marketSegment)) return ex('unknown market segment');
    const price = Number(t.price), sqm = Number(t.area);
    if (!(price > 0) || !(sqm > 0)) return ex('missing price or area');
    if (!t.project || !String(t.project).trim()) return ex('missing project name');
    if (exclude.has(t.project)) { report.excludedNames[t.project] = (report.excludedNames[t.project] || 0) + 1; return ex('reviewed catch-all name'); }
    if (hold.has(t.project)) { report.heldNames[t.project] = (report.heldNames[t.project] || 0) + 1; return ex('held for review'); }
    const sqft = sqm * SQM_TO_SQFT;
    parsed.push({ project: t.project, street: t.street || '', district: String(t.district || ''), seg: t.marketSegment, sale, price, sqm, sqft, psf: price / sqft, bin: Math.floor(sqft / pc.bin) * pc.bin,
      floor: t.floorRange && t.floorRange !== '-' ? String(t.floorRange) : null, tenure: parseTenure(t.tenure), tenureRaw: String(t.tenure || ''), ym: (2000 + +m[2]) * 12 + (+m[1] - 1) });
    report.used++;
  });
  if (!parsed.length) throw new Error('No usable transactions.');
  pc.exclude.concat(pc.hold).forEach((e) => { if (!seenNames.has(e.name)) warnings.push({ code: 'stale-list-entry', msg: e.name + ' not found in the raw data' }); });
  const latest = parsed.reduce((a, t) => Math.max(a, t.ym), 0), earliest = parsed.reduce((a, t) => Math.min(a, t.ym), 1e9), refYear = Math.floor(latest / 12);
  const groups = ['–'].concat(cfg.ageBands.map((b) => b.label), [cfg.freeholdLabel]);
  const W = pc.windows.map((w) => (w === 'all' ? Infinity : w));
  const periodOf = (ym) => { const p = Math.floor((latest - ym) / pc.periodMonths); return p < pc.periods ? p : pc.periods; };   // pc.periods = "earlier" stub
  const periodDefs = [];
  for (let p = 0; p < pc.periods; p++) periodDefs.push({ label: ymToS(latest - (p + 1) * pc.periodMonths + 1) + ' to ' + ymToS(latest - p * pc.periodMonths), from: ymToS(latest - (p + 1) * pc.periodMonths + 1), to: ymToS(latest - p * pc.periodMonths) });
  periodDefs.push({ label: ymToS(earliest) + (earliest <= latest - pc.periods * pc.periodMonths ? ' to ' + ymToS(latest - pc.periods * pc.periodMonths) : '') + ' (earlier, partial period)', from: ymToS(earliest), to: ymToS(latest - pc.periods * pc.periodMonths) });
  const floorBands = Array.from(new Set(parsed.filter((t) => t.floor).map((t) => t.floor))).sort((a, b) => floorKey(a) - floorKey(b));
  function floorKey(s) { const m = /^(B?)(\d+)/.exec(s); return m ? (m[1] ? -100 : 0) + +m[2] : 999; }
  const floorIdx = new Map(floorBands.map((f, i) => [f, i]));

  // 2. group by project
  const byProject = new Map();
  parsed.forEach((t) => { (byProject.get(t.project) || byProject.set(t.project, []).get(t.project)).push(t); });
  const ids = new Map();
  Array.from(byProject.keys()).sort().forEach((name) => {
    const id = P.slugify(name);
    if (!id) throw new Error('Project name produces an empty id: ' + JSON.stringify(name));
    if (ids.has(id)) throw new Error('ID collision: "' + name + '" and "' + ids.get(id) + '" both slug to "' + id + '". Names are never merged; add an explicit disambiguation before building.');
    ids.set(id, name);
  });

  const mode = (arr) => { const c = new Map(); arr.forEach((x) => c.set(x, (c.get(x) || 0) + 1)); return Array.from(c.entries()).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]; };
  const details = {}, indexRows = [], searchKeys = [], tokenMap = new Map();
  for (let s = 0; s < pc.shards; s++) details[P.shardName(s)] = { v: pc.schema, shard: P.shardName(s), projects: {} };
  const sortedNames = Array.from(ids.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((e) => e[1]);
  const peerBuckets = new Map();                               // scope|sale|tg|bin|win -> rows

  sortedNames.forEach((name) => {
    const id = P.slugify(name), rows = byProject.get(name);
    const street = mode(rows.map((t) => t.street)), districts = Array.from(new Set(rows.map((t) => t.district))).sort(), seg = mode(rows.map((t) => t.seg));
    const segs = Array.from(new Set(rows.map((t) => t.seg)));
    if (districts.length > 1) warnings.push({ code: 'multi-district', msg: name + ' spans districts ' + districts.join(', ') + '; the most common is used' });
    if (segs.length > 1) warnings.push({ code: 'multi-segment', msg: name + ' spans segments ' + segs.join(', ') });
    if (new Set(rows.map((t) => t.street)).size > 1) warnings.push({ code: 'multi-street', msg: name + ' spans more than one street; the most common is used' });
    if (/�/.test(name)) warnings.push({ code: 'name-encoding', msg: 'Name contains a replacement character (source encoding): ' + name });
    // tenure
    const tc = new Map(); rows.forEach((t) => { const k = t.tenure.label; const e = tc.get(k) || { n: 0, t: t.tenure }; e.n++; tc.set(k, e); });
    const variants = Array.from(tc.entries()).sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1));
    const dom = variants[0][1].t, kinds = new Set(Array.from(tc.values()).map((e) => (e.t.kind === 'FH' ? 'FH' : e.t.kind === 'LEASE' ? 'L' + e.t.years : 'U')));
    const mixed = kinds.size > 1;
    if (mixed) warnings.push({ code: 'mixed-tenure', msg: name + ': ' + variants.map((v) => v[0] + ' x' + v[1].n).join('; ') });
    if (dom.kind === 'LEASE' && dom.year === null) warnings.push({ code: 'tenure-no-start-year', msg: name + ': dominant tenure has no start year' });
    if (dom.kind === 'UNKNOWN') warnings.push({ code: 'tenure-unparsed', msg: name + ': tenure not recognised: ' + dom.label });
    const tenure = { group: projectTenureGroup(dom, refYear, cfg, groups), label: dom.label, kind: dom.kind, leaseYears: dom.years, commenceYear: dom.year, mixed, variants: variants.length > 1 ? variants.map((v) => [v[0], v[1].n]) : undefined };
    // distributions
    const dist = {}, sales = {};
    const bySale = { 1: [], 2: [], 3: [] }; rows.forEach((t) => bySale[t.sale].push(t));
    const dd = (g) => ({ n: g.length, price: q5(g.map((x) => x.price).sort((a, b) => a - b)), psf: q5(g.map((x) => x.psf).sort((a, b) => a - b)), sqft: q5(g.map((x) => x.sqft).sort((a, b) => a - b)) });
    dist.all = dd(rows);
    [1, 2, 3].forEach((s) => { sales[SALE_NAME[s]] = bySale[s].length; if (bySale[s].length) dist[SALE_NAME[s]] = dd(bySale[s]); });
    // monthly (sparse, per sale type)
    const monthly = {};
    [1, 2, 3].forEach((s) => { if (!bySale[s].length) return; const c = {}; bySale[s].forEach((t) => { c[t.ym] = (c[t.ym] || 0) + 1; }); monthly[SALE_NAME[s]] = Object.keys(c).map(Number).sort((a, b) => a - b).reduce((o, k) => o.concat([k - earliest, c[k]]), []); });
    // disjoint periods per sale type (all sizes) + period cells
    const periods = {}, periodCells = [], cellsOut = [], floorCells = [], floors = {};
    [1, 2, 3].forEach((s) => {
      const g = bySale[s]; if (!g.length) return;
      const pp = []; for (let p = 0; p <= pc.periods; p++) { const x = g.filter((t) => periodOf(t.ym) === p); pp.push(x.length ? [x.length].concat(q5(x.map((y) => y.psf).sort((a, b) => a - b))) : [0]); }
      periods[SALE_NAME[s]] = pp;
      const bins = new Map(); g.forEach((t) => { (bins.get(t.bin) || bins.set(t.bin, []).get(t.bin)).push(t); });
      Array.from(bins.keys()).sort((a, b) => a - b).forEach((b) => {
        const bg = bins.get(b);
        W.forEach((w, wi) => { const x = bg.filter((t) => latest - t.ym < w); if (x.length) cellsOut.push(cellRow([s, b, wi], summary(x))); });
        for (let p = 0; p <= pc.periods; p++) { const x = bg.filter((t) => periodOf(t.ym) === p); if (x.length) periodCells.push(cellRow([s, b, p], summary(x))); }
        const fl = new Map(); bg.forEach((t) => { if (t.floor) (fl.get(t.floor) || fl.set(t.floor, []).get(t.floor)).push(t); });
        Array.from(fl.keys()).sort((a, c) => floorIdx.get(a) - floorIdx.get(c)).forEach((f) => floorCells.push(cellRow([s, b, floorIdx.get(f)], summary(fl.get(f)))));
      });
      const fb = new Map(); g.forEach((t) => { if (t.floor) (fb.get(t.floor) || fb.set(t.floor, []).get(t.floor)).push(t); });
      floors[SALE_NAME[s]] = Array.from(fb.keys()).sort((a, c) => floorIdx.get(a) - floorIdx.get(c)).map((f) => { const sm = summary(fb.get(f)); return [floorIdx.get(f), sm.n, sm.act, sm.last].concat(sm.psf); });
    });
    const allMonths = Array.from(new Set(rows.map((t) => t.ym))).sort((a, b) => a - b);
    const rec = {
      id, name, street, district: mode(rows.map((t) => t.district)), districts: districts.length > 1 ? districts : undefined, seg, tenure,
      n: rows.length, sale: sales, first: ymToS(allMonths[0]), last: ymToS(allMonths[allMonths.length - 1]), active: allMonths.length,
      floorUnknown: rows.filter((t) => !t.floor).length, dist, monthly, periods, cells: cellsOut, periodCells, floorCells, floors,
    };
    details[P.shardName(P.shardOf(id, pc.shards))].projects[id] = rec;
    indexRows.push([id, name, street, rec.district, seg, tenure.group, tenure.label, mixed ? 1 : 0, rows.length, rec.first, rec.last, rec.active, sales.new, sales.sub, sales.resale, P.shardOf(id, pc.shards)]);
    searchKeys.push(P.normaliseName(name));
    P.normaliseName(name).split(' ').forEach((tok) => { const a = tokenMap.get(tok) || tokenMap.set(tok, []).get(tok); a.push(indexRows.length - 1); });
    // peers
    rows.forEach((t) => {
      const tg = tenureGroupIndex(t.tenure, t.sale, refYear, cfg, groups);
      [t.district, t.seg].forEach((scope) => W.forEach((w, wi) => {
        if (latest - t.ym >= w) return;
        [t.bin, -1].forEach((b) => { const k = [scope, t.sale, tg, b, wi].join('|'); (peerBuckets.get(k) || peerBuckets.set(k, []).get(k)).push(t); });
      }));
    });
  });
  if (!indexRows.length) throw new Error('No projects.');

  // 3. peers
  const peerDocs = {};
  Array.from(peerBuckets.keys()).forEach((k) => {
    const [scope, s, tg, b, wi] = k.split('|'), g = peerBuckets.get(k), sm = summary(g), c = {};
    g.forEach((t) => { c[t.project] = (c[t.project] || 0) + 1; });
    const file = P.peerScopeFile(scope);
    const d = peerDocs[file] || (peerDocs[file] = { v: pc.schema, scope, fields: PEER_FIELDS, cells: [] });
    d.cells.push([+s, +tg, +b, +wi, sm.n, Object.keys(c).length, Math.round(1000 * Math.max.apply(null, Object.values(c)) / g.length) / 1000, sm.act, sm.last].concat(sm.psf));
  });
  Object.keys(peerDocs).forEach((f) => peerDocs[f].cells.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]));

  const nProjects = indexRows.length;
  const index = {
    v: pc.schema, fields: ['id', 'name', 'street', 'district', 'seg', 'tenGroup', 'tenLabel', 'mixed', 'n', 'first', 'last', 'active', 'new', 'sub', 'resale', 'shard'],
    tenureGroups: groups, rows: indexRows,
  };
  const search = { v: pc.schema, keys: searchKeys, compact: searchKeys.map((k) => k.replace(/ /g, '')), tokens: Array.from(tokenMap.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)) };
  const manifest = {
    v: pc.schema, kind: 'kpt-project-data', asOf, latestMonth: ymToS(latest), monthStart: ymToS(earliest), months: latest - earliest + 1, boundaryMonth: ymToS(earliest),
    boundaryNote: 'The first month in the URA rolling window may be incomplete.',
    source: 'URA transactions (PMI_Resi_Transaction)', attribution: 'PENDING: exact acknowledgement wording and licence link to be confirmed before publishing project-named statistics.',
    scope: 'Private Condominium and Apartment, strata, single-unit transactions. New sale, sub-sale and resale kept separate. No Executive Condominiums, no landed.',
    shards: pc.shards, bin: pc.bin, binUnit: 'sqft (area converted from URA square metres)', windows: pc.windows, windowSemantics: 'trailing and cumulative, ending on latestMonth; "all" = full history',
    periods: periodDefs, periodNote: 'Disjoint 12-month periods, most recent first; the last entry is the earlier remainder.', tenureGroups: groups, floorBands,
    floorNote: 'URA floor bands only. Exact floors are not available and are not inferred.', counts: { projects: nProjects, transactions: report.used, read: report.read },
    quantiles: 'min, Q1, median, Q3, max; linear interpolation between closest ranks', psfNote: 'PSF is approximate: price / (URA area in whole square metres x 10.7639). Whole-sqm area rounding gives up to about +/-1% PSF error on small units.',
    monthFormat: 'Index and detail summaries use "YYYY-MM"; cell arrays use YYYYMM integers.',
    fields: { cell: CELL_FIELDS, peer: PEER_FIELDS, cellNote: 'cells: win = window index; periodCells: win = period index; floorCells: win = floor band index; sale 1 new, 2 sub-sale, 3 resale',
      dist5: ['min', 'q1', 'med', 'q3', 'max'], period: ['n', 'min', 'q1', 'med', 'q3', 'max'], floorSummary: ['floorBand', 'n', 'act', 'last', 'min', 'q1', 'med', 'q3', 'max'], monthly: 'flat [monthIndexFromMonthStart, count, ...] per sale type' },
    policy: ['No bedrooms or bedroom inference', 'No exact floors; URA floor bands only', 'Historical transaction evidence only: no appreciation, yield or forecast', 'Cells report n, active months and most recent month; evidence sufficiency is decided downstream', 'Peer cells are context, not project comparables; they include the project itself'],
    excludedNames: pc.exclude.map((e) => e.name), heldNames: pc.hold.map((e) => e.name),
  };
  return { manifest, index, search, details, peers: peerDocs, report, warnings, groups };
}

function write(res, outDir) {
  const put = (rel, obj) => { const f = path.join(outDir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj)); return fs.statSync(f).size; };
  const sizes = {};
  sizes['manifest.json'] = put('manifest.json', res.manifest); sizes['index.json'] = put('index.json', res.index); sizes['search.json'] = put('search.json', res.search);
  Object.keys(res.details).forEach((s) => { if (Object.keys(res.details[s].projects).length) sizes['detail/' + s + '.json'] = put('detail/' + s + '.json', res.details[s]); });
  Object.keys(res.peers).forEach((f) => { sizes[f] = put(f, res.peers[f]); });
  return sizes;
}

function reportText(res, sizes) {
  const r = res.report, ex = Object.keys(r.excluded).sort((a, b) => r.excluded[b] - r.excluded[a]).map((k) => '  ' + String(r.excluded[k]).padStart(7) + '  ' + k).join('\n');
  const w = {}; res.warnings.forEach((x) => { (w[x.code] = w[x.code] || []).push(x.msg); });
  const tot = Object.values(sizes).reduce((a, b) => a + b, 0);
  return ['Project data build report', '', 'Records read: ' + r.read, 'Transactions included: ' + r.used, 'Projects included: ' + res.manifest.counts.projects, 'Latest month: ' + res.manifest.latestMonth + '   earliest: ' + res.manifest.monthStart, '',
    'Excluded, by reason:', ex, '', 'Reviewed catch-all names removed (rows):', Object.keys(r.excludedNames).map((k) => '  ' + k + ': ' + r.excludedNames[k]).join('\n') || '  none', '',
    'Held for Ken\'s review, kept OUT of the data (rows):', Object.keys(r.heldNames).map((k) => '  ' + k + ': ' + r.heldNames[k]).join('\n') || '  none', '',
    'Warnings:', Object.keys(w).map((k) => '  [' + k + '] ' + w[k].length + '\n' + w[k].slice(0, 25).map((m) => '      ' + m).join('\n')).join('\n') || '  none', '',
    'Files: ' + Object.keys(sizes).length + '   total ' + (tot / 1e6).toFixed(2) + ' MB raw'].join('\n') + '\n';
}

module.exports = { build, write, reportText, parseTenure, flatten, CELL_FIELDS, PEER_FIELDS };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const rawDir = arg('raw', path.join(__dirname, 'raw')), outDir = arg('out', path.join(__dirname, '..', '..', 'data', 'projects')), asOf = arg('as-of', new Date().toISOString().slice(0, 10));
  const reportPath = arg('report', path.join(__dirname, 'out', 'projects-report.txt'));
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), pc = JSON.parse(fs.readFileSync(path.join(__dirname, 'project-config.json'), 'utf8'));
  const files = fs.readdirSync(rawDir).filter((x) => x.endsWith('.json')).sort().map((x) => JSON.parse(fs.readFileSync(path.join(rawDir, x), 'utf8')));
  if (!files.length) { console.error('No .json files in ' + rawDir); process.exit(1); }
  const res = build(flatten(files), cfg, pc, asOf);
  if (fs.existsSync(outDir) && path.basename(path.resolve(outDir)) === 'projects') fs.rmSync(outDir, { recursive: true, force: true });   // only ever clears a folder named 'projects'
  const sizes = write(res, outDir), text = reportText(res, sizes);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, text);
  console.log(text);
}
