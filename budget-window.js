#!/usr/bin/env node
/* ONE-OFF ANALYSIS (not part of the product). "What did ~$1.32m actually buy over the last 12 months?"
   Reads the raw URA files in ./raw, looks only at transactions priced near a budget, and reports per group:
   transactions, distinct projects, top-project share, median price, median and P25-P75 floor area.
   Groups: region x new/resale x tenure group (leasehold age band, or Freehold / 999-yr with no age). No bedroom inference.
   Private condos/apartments and Executive Condominiums are analysed separately and never mixed.
   Usage: node budget-window.js --raw raw --out out [--budget 1320000] [--lowA 1250000 --highA 1390000] [--pctB 10]
   Output contains aggregates only (no project names, no individual transactions). */
const fs = require('fs'), path = require('path');
const { quantile, flatten } = require('./build-bands.js');
const SQM_TO_SQFT = 10.7639;

function prepare(records, cfg) {
  const parsed = records.map((t) => { const m = /^(\d{2})(\d{2})$/.exec(String(t.contractDate || '')); return m ? Object.assign({}, t, { _ym: (2000 + +m[2]) * 12 + (+m[1] - 1) }) : null; }).filter(Boolean);
  const latest = parsed.reduce((a, t) => Math.max(a, t._ym), 0), first = latest - cfg.windowMonths + 1, refYear = Math.floor(latest / 12);
  const out = { private: [], ec: [], skipped: 0, period: ym2s(first) + ' to ' + ym2s(latest) };
  parsed.forEach((t) => {
    if (t._ym < first) return;
    const sale = String(t.typeOfSale), price = +t.price, sqm = +t.area;
    if (t.typeOfArea !== 'Strata' || String(t.noOfUnits) !== '1' || (sale !== '1' && sale !== '3') || !['OCR', 'RCR', 'CCR'].includes(t.marketSegment) || !(price > 0) || !(sqm > 0)) { out.skipped++; return; }
    const kind = cfg.propertyTypes.includes(t.propertyType) ? 'private' : t.propertyType === 'Executive Condominium' ? 'ec' : null;
    if (!kind) return;
    let tenure = '–';
    if (sale === '3') {
      const m = /(\d+)\s*yrs? lease commencing from (\d{4})/i.exec(t.tenure || '');
      tenure = (!m || +m[1] > cfg.maxLeaseYearsForAge) ? cfg.freeholdLabel : cfg.ageBands.find((b) => b.maxAge === null || refYear - +m[2] < b.maxAge).label;
    }
    out[kind].push({ region: t.marketSegment, status: sale === '1' ? 'New' : 'Resale', tenure, project: t.project, price, sqft: sqm * SQM_TO_SQFT });
  });
  return out;
}
const ym2s = (ym) => Math.floor(ym / 12) + '-' + String((ym % 12) + 1).padStart(2, '0');

function summarise(rows, lo, hi) {
  const inWin = rows.filter((r) => r.price >= lo && r.price <= hi), groups = {};
  inWin.forEach((r) => { (groups[[r.region, r.status, r.tenure].join('|')] = groups[[r.region, r.status, r.tenure].join('|')] || []).push(r); });
  const stat = (g) => {
    const p = g.map((x) => x.price).sort((a, b) => a - b), s = g.map((x) => x.sqft).sort((a, b) => a - b), cnt = {};
    g.forEach((x) => { cnt[x.project] = (cnt[x.project] || 0) + 1; });
    const projs = Object.keys(cnt).length, top = Math.max.apply(null, Object.values(cnt));
    return { n: g.length, projects: projs, topShare: top / g.length, medPrice: quantile(p, 0.5), medSqft: quantile(s, 0.5), sqftP25: quantile(s, 0.25), sqftP75: quantile(s, 0.75) };
  };
  const res = {};
  Object.keys(groups).forEach((k) => { res[k] = stat(groups[k]); });
  return { total: inWin.length, all: rows.length, groups: res, overall: inWin.length ? stat(inWin) : null };
}

const ORDER = { OCR: 0, RCR: 1, CCR: 2 }, TEN = { '–': 0, '0–10': 1, '10–25': 2, '25+': 3, 'Freehold / 999-yr': 4 };
const sortKeys = (ks) => ks.sort((a, b) => { const x = a.split('|'), y = b.split('|'); return ORDER[x[0]] - ORDER[y[0]] || (x[1] < y[1] ? 1 : -1) || TEN[x[2]] - TEN[y[2]]; });
const m = (v) => '$' + (v / 1e6).toFixed(2) + 'm', f0 = (v) => String(Math.round(v / 10) * 10), pc = (v) => Math.round(v * 100) + '%';
const flag = (s) => (s.n < 10 ? ' THIN(n<10)' : '') + (s.projects < 3 ? ' FEW-PROJECTS' : '') + (s.topShare >= 0.5 && s.n >= 10 ? ' ONE-PROJECT-DOMINATES' : '');

function table(sumA, sumB) {
  const keys = sortKeys(Array.from(new Set(Object.keys(sumA.groups).concat(Object.keys(sumB.groups)))));
  const L = ['group'.padEnd(34) + 'A: n  proj top%  med price  med sqft  sqft P25-P75    | B: n  proj top%  med price  med sqft  sqft P25-P75   | flags (A / B)'];
  const cell = (s) => (s ? String(s.n).padStart(4) + String(s.projects).padStart(6) + pc(s.topShare).padStart(6) + m(s.medPrice).padStart(10) + f0(s.medSqft).padStart(9) + (f0(s.sqftP25) + '-' + f0(s.sqftP75)).padStart(14) : '   –'.padEnd(49));
  keys.forEach((k) => { const a = sumA.groups[k], b = sumB.groups[k]; L.push(k.replace(/\|/g, ' ').padEnd(34) + cell(a) + '  | ' + cell(b) + '  |' + (a ? flag(a) : ' absent') + ' /' + (b ? flag(b) : ' absent')); });
  L.push('TOTAL'.padEnd(34) + (sumA.overall ? cell(sumA.overall) : '–') + '  | ' + (sumB.overall ? cell(sumB.overall) : '–'));
  return L.join('\n');
}
const rollup = (rows, lo, hi, keyFn) => { const t = {}; rows.filter((r) => r.price >= lo && r.price <= hi).forEach((r) => { t[keyFn(r)] = (t[keyFn(r)] || 0) + 1; }); return t; };
const shareLine = (t) => Object.keys(t).sort().map((k) => k + ' ' + t[k]).join('   ');

function run(records, cfg, o) {
  const d = prepare(records, cfg), A = [o.lowA, o.highA], B = [Math.round(o.budget * (1 - o.pctB / 100)), Math.round(o.budget * (1 + o.pctB / 100))];
  const L = ['What did ~' + m(o.budget) + ' actually buy? (one-off analysis, no bedroom inference)', '',
    'Period: ' + d.period + '   Price used: URA contract price   Floor area: URA strata area in sqft',
    'Window A: ' + m(A[0]) + ' to ' + m(A[1]) + '     Window B: ' + m(B[0]) + ' to ' + m(B[1]) + ' (+/-' + o.pctB + '%)', 'Records skipped as unusable (sub-sale, multi-unit, bad data): ' + d.skipped, '',
    'Flags: THIN = under 10 transactions; FEW-PROJECTS = under 3 distinct projects; ONE-PROJECT-DOMINATES = one project is half or more of the group.', ''];
  [['PRIVATE CONDOMINIUMS / APARTMENTS', d.private], ['EXECUTIVE CONDOMINIUMS (separate; not mixed into private)', d.ec]].forEach(([title, rows]) => {
    const sA = summarise(rows, A[0], A[1]), sB = summarise(rows, B[0], B[1]);
    L.push('=== ' + title + ' ===', 'All transactions in the 12 months: ' + sA.all + '   in window A: ' + sA.total + ' (' + pc(sA.total / (sA.all || 1)) + ')   in window B: ' + sB.total + ' (' + pc(sB.total / (sB.all || 1)) + ')', '',
      table(sA, sB), '',
      'By region      A: ' + shareLine(rollup(rows, A[0], A[1], (r) => r.region)) + '   |  B: ' + shareLine(rollup(rows, B[0], B[1], (r) => r.region)),
      'By new/resale  A: ' + shareLine(rollup(rows, A[0], A[1], (r) => r.status)) + '   |  B: ' + shareLine(rollup(rows, B[0], B[1], (r) => r.status)),
      'By tenure grp  A: ' + shareLine(rollup(rows, A[0], A[1], (r) => r.tenure)) + '   |  B: ' + shareLine(rollup(rows, B[0], B[1], (r) => r.tenure)), '');
  });
  return L.join('\n') + '\n';
}
module.exports = { prepare, summarise, run };

if (require.main === module) {
  const arg = (k, dflt) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : dflt; };
  const rawDir = arg('raw', path.join(__dirname, 'raw')), outDir = arg('out', path.join(__dirname, 'out'));
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  const files = fs.readdirSync(rawDir).filter((x) => x.endsWith('.json')).map((x) => JSON.parse(fs.readFileSync(path.join(rawDir, x), 'utf8')));
  const text = run(flatten(files), cfg, { budget: +arg('budget', 1320000), lowA: +arg('lowA', 1250000), highA: +arg('highA', 1390000), pctB: +arg('pctB', 10) });
  fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, 'budget-window-report.txt'), text); console.log(text);
}
