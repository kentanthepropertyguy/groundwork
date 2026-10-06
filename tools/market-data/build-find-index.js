#!/usr/bin/env node
/* ==========================================================================
   FIND price index. Turns the raw URA transactions into compact AGGREGATES of ACTUAL PRICES per project, sale type and 100 sqft band,
   for the last 12 months only. Used by the FIND shortlist on the Buyer's "What can this budget buy" page.

   Usage: node tools/market-data/build-find-index.js --raw tools/market-data/raw --project-data data/projects --out data/projects/find.json [--as-of 2026-10-05]

   Scope (same as build-project-stats.js, which this does NOT modify): Condominium + Apartment, strata, single-unit transactions; the same reviewed
   exclusion and hold lists. FIND V1 keeps New Sale (1) and Resale (3) only. Sub-sale is out of V1. Window = the trailing 12 months ending on the
   latest contract month in the data (identical to the existing "period 0").

   Privacy / aggregate-only rule: a band with fewer than MIN_CELL sales is NEVER written, because a one- or two-sale band would publish an individual
   deal's price. Raw transactions are never written out.

   Row layout: [bin, n, act, last, q1, med, q3]   bin = sqft band start, n = sales, act = distinct months with a sale, last = latest month (YYYYMM),
   q1/med/q3 = price quartiles in whole dollars (linear interpolation between closest ranks, same quantile as the rest of the pipeline).

   Safety checks (abort, never warn): latest month equals data/projects/manifest.json; every project exists in data/projects/index.json; the count of
   in-scope recent transactions equals the existing build's count for the same window (period 0, sale 1 and 3).
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { quantile } = require('./build-bands.js');
const PS = require('./build-project-stats.js');
const P = require('../../assets/js/kpt-project.js');

const SQM_TO_SQFT = 10.7639, MIN_CELL = 3, WINDOW_MONTHS = 12, SALES = { 1: 'new', 3: 'resale' };
const ymInt = (ym) => Math.floor(ym / 12) * 100 + (ym % 12) + 1;
const ymStr = (ym) => Math.floor(ym / 12) + '-' + String((ym % 12) + 1).padStart(2, '0');

/** records: flat raw rows (see build-project-stats.flatten). indexRows: data/projects/index.json rows with its field list. */
function buildFindIndex(records, cfg, pc, indexDoc, asOf, opts) {
  opts = opts || {};
  const exclude = new Set(pc.exclude.map((e) => e.name)), hold = new Set(pc.hold.map((e) => e.name));
  const parsed = [];
  records.forEach((t) => {
    const m = /^(\d{2})(\d{2})$/.exec(String(t.contractDate || '')); if (!m) return;
    if (!cfg.propertyTypes.includes(t.propertyType)) return;
    if (t.typeOfArea !== 'Strata') return;
    if (String(t.noOfUnits) !== '1') return;
    const sale = +t.typeOfSale; if (![1, 2, 3].includes(sale)) return;
    if (!['OCR', 'RCR', 'CCR'].includes(t.marketSegment)) return;
    const price = Number(t.price), sqm = Number(t.area); if (!(price > 0) || !(sqm > 0)) return;
    if (!t.project || !String(t.project).trim()) return;
    if (exclude.has(t.project) || hold.has(t.project)) return;
    parsed.push({ project: t.project, sale, price, bin: Math.floor((sqm * SQM_TO_SQFT) / pc.bin) * pc.bin, ym: (2000 + +m[2]) * 12 + (+m[1] - 1) });
  });
  if (!parsed.length) throw new Error('No usable transactions.');
  const latest = parsed.reduce((a, t) => Math.max(a, t.ym), 0);
  const recent = parsed.filter((t) => t.sale !== 2 && latest - t.ym < WINDOW_MONTHS);

  const F = indexDoc.fields, col = (n) => F.indexOf(n), rowsByName = new Map(indexDoc.rows.map((r) => [r[col('name')], r]));
  const groups = new Map();
  recent.forEach((t) => { const k = t.project + '|' + t.sale + '|' + t.bin; (groups.get(k) || groups.set(k, []).get(k)).push(t); });

  const byProject = new Map(); let written = 0, suppressedRows = 0, suppressedTx = 0, writtenTx = 0;
  Array.from(groups.keys()).sort().forEach((k) => {
    const g = groups.get(k), t0 = g[0];
    if (g.length < MIN_CELL) { suppressedRows++; suppressedTx += g.length; return; }
    const pr = g.map((x) => x.price).sort((a, b) => a - b), months = new Set(g.map((x) => x.ym));
    const row = [t0.bin, g.length, months.size, ymInt(Math.max.apply(null, Array.from(months))), Math.round(quantile(pr, 0.25)), Math.round(quantile(pr, 0.5)), Math.round(quantile(pr, 0.75))];
    const e = byProject.get(t0.project) || byProject.set(t0.project, { 1: [], 3: [] }).get(t0.project);
    e[t0.sale].push(row); written++; writtenTx += g.length;
  });
  byProject.forEach((e) => { e[1].sort((a, b) => a[0] - b[0]); e[3].sort((a, b) => a[0] - b[0]); });   // rows in ascending size band

  const projects = [];
  Array.from(byProject.keys()).sort().forEach((name) => {
    const ir = rowsByName.get(name); if (!ir) throw new Error('Project in the price index is missing from index.json: ' + name);
    const id = P.slugify(name); if (ir[col('id')] !== id) throw new Error('Project id mismatch for ' + name);
    const e = byProject.get(name);
    projects.push({ id, name: ir[col('name')], street: ir[col('street')], d: ir[col('district')], seg: ir[col('seg')], tg: ir[col('tenGroup')], tl: ir[col('tenLabel')], m: ir[col('mixed')] ? 1 : 0, new: e[1], resale: e[3] });
  });
  const win = { from: ymStr(latest - WINDOW_MONTHS + 1), to: ymStr(latest) };
  const doc = {
    v: 1, kind: 'kpt-find-index', asOf, latestMonth: win.to, window: { from: win.from, to: win.to, label: win.from + ' to ' + win.to }, bin: pc.bin, minCell: MIN_CELL,
    sales: ['new', 'resale'], fields: ['bin', 'n', 'act', 'last', 'q1', 'med', 'q3'],
    source: 'URA transactions (PMI_Resi_Transaction)',
    scope: 'Private Condominium and Apartment, strata, single-unit transactions. New sale and resale only (sub-sale excluded from FIND V1). No Executive Condominiums, no landed.',
    note: 'Aggregates only. Price quartiles per project, sale type and 100 sqft band for the last 12 months. Bands with fewer than ' + MIN_CELL + ' sales are never written.',
    projects,
  };
  const stats = { read: records.length, usable: parsed.length, latest: win.to, recentInScope: recent.length, rowsWritten: written, txInWrittenRows: writtenTx, rowsSuppressed: suppressedRows, txSuppressed: suppressedTx, projects: projects.length };
  if (writtenTx + suppressedTx !== recent.length) throw new Error('Reconciliation failed: written + suppressed transactions do not equal in-scope recent transactions.');
  return { doc, stats };
}

/** Cross-checks against the shipped project data (aborts by throwing). */
function checkAgainstProjectData(res, projectDir) {
  const man = JSON.parse(fs.readFileSync(path.join(projectDir, 'manifest.json'), 'utf8'));
  if (man.latestMonth !== res.doc.latestMonth) throw new Error('Latest month ' + res.doc.latestMonth + ' differs from data/projects/manifest.json (' + man.latestMonth + '). Rebuild both from the same raw files.');
  let existing = 0;
  fs.readdirSync(path.join(projectDir, 'detail')).filter((f) => f.endsWith('.json')).forEach((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(projectDir, 'detail', f), 'utf8'));
    Object.keys(d.projects).forEach((id) => (d.projects[id].periodCells || []).forEach((r) => { if (r[2] === 0 && (r[0] === 1 || r[0] === 3)) existing += r[3]; }));
  });
  if (existing !== res.stats.recentInScope) throw new Error('In-scope recent transactions (' + res.stats.recentInScope + ') differ from the existing build (' + existing + ').');
  return { existing };
}

function reportText(s) {
  return ['FIND price index', 'Latest month: ' + s.latest, 'Raw rows read: ' + s.read, 'Usable rows (same filters as the project data): ' + s.usable,
    'In-scope recent transactions (new sale + resale, last 12 months): ' + s.recentInScope,
    'Rows written (3+ sales): ' + s.rowsWritten + ' covering ' + s.txInWrittenRows + ' transactions, ' + s.projects + ' projects',
    'Rows suppressed (under 3 sales): ' + s.rowsSuppressed + ' covering ' + s.txSuppressed + ' transactions (' + (100 * s.txSuppressed / s.recentInScope).toFixed(1) + '%)'].join('\n') + '\n';
}

module.exports = { buildFindIndex, checkAgainstProjectData, reportText, MIN_CELL, WINDOW_MONTHS };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const rawDir = arg('raw', path.join(__dirname, 'raw')), projectDir = arg('project-data', path.join(__dirname, '..', '..', 'data', 'projects'));
  const outFile = arg('out', path.join(projectDir, 'find.json')), asOf = arg('as-of', JSON.parse(fs.readFileSync(path.join(projectDir, 'manifest.json'), 'utf8')).asOf);
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), pc = JSON.parse(fs.readFileSync(path.join(__dirname, 'project-config.json'), 'utf8'));
  const files = fs.readdirSync(rawDir).filter((x) => x.endsWith('.json')).sort().map((x) => JSON.parse(fs.readFileSync(path.join(rawDir, x), 'utf8')));
  if (!files.length) { console.error('No .json files in ' + rawDir); process.exit(1); }
  const indexDoc = JSON.parse(fs.readFileSync(path.join(projectDir, 'index.json'), 'utf8'));
  const res = buildFindIndex(PS.flatten(files), cfg, pc, indexDoc, asOf);
  checkAgainstProjectData(res, projectDir);
  fs.writeFileSync(outFile, JSON.stringify(res.doc));
  console.log(reportText(res.stats) + 'Wrote ' + outFile + ' (' + fs.statSync(outFile).size + ' bytes)');
}
