#!/usr/bin/env node
/* ==========================================================================
   Market evidence builder: URA transaction records → typical transacted ranges.

   Input : URA Data Service "PMI_Resi_Transaction" JSON (batches 1–4), saved in ./raw/
           (raw transactions are NEVER committed or published: only the aggregate bands are).
   Output: out/bands.csv  (same columns as the Sheet's "Market Evidence" tab: paste the values in)
           out/report.txt (what was included, what was excluded and why)

   Usage : node tools/market-data/build-bands.js --raw tools/market-data/raw --out tools/market-data/out [--as-of 2026-10-05]

   First real-data run: NO bedroom inference. Groups are region x new/resale x tenure group.
   - Tenure group for resale = leasehold age band (from lease commencement year; URA has no completion year,
     so this is approximate) or a separate "Freehold / 999-yr" group with NO age assigned.
   - Only strata Condominium/Apartment, single-unit caveats, New Sale and Resale (no sub-sales, no ECs, no landed).
   - Output: P25-P75 price, P25-P75 floor area, transaction count, period. Nothing else.
   - Output has no bedroom column, so it is for review; the visitor-facing engine still expects bedroom rows.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const SQM_TO_SQFT = 10.7639;

function quantile(sorted, q) {            // linear interpolation between closest ranks
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function flatten(rawFiles) {
  const out = [];
  rawFiles.forEach((doc) => (doc.Result || []).forEach((p) => (p.transaction || []).forEach((t) => out.push(Object.assign({ project: p.project, marketSegment: p.marketSegment }, t)))));
  return out;
}

function build(records, cfg, asOfDate) {
  const rep = { total: records.length, excluded: {}, used: 0, windowStart: null, windowEnd: null, omittedLowN: [], groups: 0, resale: {}, detail: [] };
  const ex = (k) => { rep.excluded[k] = (rep.excluded[k] || 0) + 1; };
  // contractDate is mmyy
  const parsed = records.map((t) => {
    const m = /^(\d{2})(\d{2})$/.exec(String(t.contractDate || ''));
    return m ? Object.assign({}, t, { _ym: (2000 + +m[2]) * 12 + (+m[1] - 1) }) : Object.assign({}, t, { _ym: null });
  });
  const valid = parsed.filter((t) => t._ym !== null);
  const latest = valid.reduce((a, t) => Math.max(a, t._ym), 0);
  const first = latest - cfg.windowMonths + 1;
  rep.windowEnd = ym2s(latest); rep.windowStart = ym2s(first);
  const refYear = Math.floor(latest / 12);
  const groups = {};
  parsed.forEach((t) => {
    if (t._ym === null) return ex('bad contract date');
    if (t._ym < first) return ex('outside ' + cfg.windowMonths + '-month window');
    if (!cfg.propertyTypes.includes(t.propertyType)) return ex('property type not in scope (' + (t.propertyType || '?') + ')');
    if (t.typeOfArea !== 'Strata') return ex('not strata area');
    if (String(t.noOfUnits) !== '1') return ex('multi-unit caveat');
    const sale = String(t.typeOfSale);
    if (sale !== '1' && sale !== '3') return ex('sub-sale');
    if (!['OCR', 'RCR', 'CCR'].includes(t.marketSegment)) return ex('unknown market segment');
    const price = Number(t.price), sqm = Number(t.area);
    if (!(price > 0) || !(sqm > 0)) return ex('missing price or area');
    const sqft = sqm * SQM_TO_SQFT;
    let age = '–';
    if (sale === '3') {
      rep.resale[t.marketSegment] = rep.resale[t.marketSegment] || { all: 0, free: 0 };
      rep.resale[t.marketSegment].all++;
      const m = /(\d+)\s*yrs? lease commencing from (\d{4})/i.exec(t.tenure || '');
      if (!m || +m[1] > cfg.maxLeaseYearsForAge) { age = cfg.freeholdLabel; rep.resale[t.marketSegment].free++; }
      else {
        const years = refYear - +m[2];
        age = cfg.ageBands.find((b) => b.maxAge === null || years < b.maxAge).label;
      }
    }
    const key = [t.marketSegment, sale === '1' ? 'New' : 'Resale', age].join('|');
    (groups[key] = groups[key] || []).push({ price, sqft });
    rep.used++;
  });
  const rows = [];
  Object.keys(groups).sort().forEach((key) => {
    const [region, status, age] = key.split('|'), g = groups[key];
    if (g.length < cfg.minN) { rep.omittedLowN.push(key + ' (n=' + g.length + ')'); return; }
    const pr = g.map((x) => x.price).sort((a, b) => a - b), sq = g.map((x) => x.sqft).sort((a, b) => a - b);
    const r = (v, k) => Math.round(v / k) * k;
    rep.detail.push({ key, n: g.length, priceMin: pr[0], priceMed: quantile(pr, 0.5), priceMax: pr[pr.length - 1], sqftMin: sq[0], sqftMed: quantile(sq, 0.5), sqftMax: sq[sq.length - 1] });
    rows.push({
      region, status, age_band: age,
      p25: r(quantile(pr, 0.25), 10000), p75: r(quantile(pr, 0.75), 10000),
      sqft_low: r(quantile(sq, 0.25), 10), sqft_high: r(quantile(sq, 0.75), 10), n_txns: g.length,
      period: 'trailing ' + cfg.windowMonths + 'm to ' + rep.windowEnd, as_of: asOfDate, basis: 'URA transactions (PMI_Resi_Transaction)',
    });
  });
  rep.groups = rows.length;
  const order = { OCR: 0, RCR: 1, CCR: 2 };
  rows.sort((a, b) => order[a.region] - order[b.region] || (a.status < b.status ? 1 : -1) || a.age_band.localeCompare(b.age_band));
  return { rows, report: rep };
}
const ym2s = (ym) => Math.floor(ym / 12) + '-' + String((ym % 12) + 1).padStart(2, '0');

const HEAD = ['region', 'status', 'age_band', 'p25', 'p75', 'sqft_low', 'sqft_high', 'n_txns', 'period', 'as_of', 'basis'];
const toCSV = (rows) => [HEAD.join(',')].concat(rows.map((r) => HEAD.map((h) => { const v = String(r[h]); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','))).join('\n') + '\n';
function reportText(rep, cfg) {
  const ex = Object.keys(rep.excluded).sort((a, b) => rep.excluded[b] - rep.excluded[a]).map((k) => '  ' + String(rep.excluded[k]).padStart(7) + '  ' + k).join('\n');
  return ['Market evidence build report', '',
    'Records read       : ' + rep.total, 'Records used       : ' + rep.used, 'Window             : ' + rep.windowStart + ' to ' + rep.windowEnd,
    'Segments published : ' + rep.groups + ' (minimum ' + cfg.minN + ' transactions each)', '', 'Excluded, by reason:', ex || '  none', '',
    'Segments left out for too few transactions:', rep.omittedLowN.length ? rep.omittedLowN.map((x) => '  ' + x).join('\n') : '  none', '',
    'Resale share that is Freehold / 999-yr (no age assigned):', Object.keys(rep.resale).sort().map((k) => '  ' + k + ': ' + rep.resale[k].free + ' of ' + rep.resale[k].all + ' (' + Math.round(100 * rep.resale[k].free / rep.resale[k].all) + '%)').join('\n') || '  none', '',
    'Sanity check per published group (price $, floor area sqft: min / median / max):',
    rep.detail.map((d) => '  ' + d.key.replace(/\|/g, ' ') + '  n=' + d.n + '  $' + Math.round(d.priceMin) + ' / $' + Math.round(d.priceMed) + ' / $' + Math.round(d.priceMax) + '  ' + Math.round(d.sqftMin) + ' / ' + Math.round(d.sqftMed) + ' / ' + Math.round(d.sqftMax)).join('\n'), '',
    'No bedroom inference in this run. Resale age is approximate (lease commencement year, not completion year).'].join('\n') + '\n';
}

module.exports = { quantile, flatten, build, toCSV, reportText };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const rawDir = arg('raw', path.join(__dirname, 'raw')), outDir = arg('out', path.join(__dirname, 'out'));
  const asOf = arg('as-of', new Date().toISOString().slice(0, 10));
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8')));
  if (!files.length) { console.error('No .json files in ' + rawDir); process.exit(1); }
  const { rows, report } = build(flatten(files), cfg, asOf);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'bands.csv'), toCSV(rows));
  fs.writeFileSync(path.join(outDir, 'report.txt'), reportText(report, cfg));
  console.log(reportText(report, cfg));
}
