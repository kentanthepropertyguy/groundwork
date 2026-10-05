// SYNTHETIC records only.
const assert = require('assert'), fs = require('fs'), path = require('path');
const C = require('../calibrate.js'), { prepare } = require('../budget-window.js');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8')), E = JSON.parse(fs.readFileSync(path.join(__dirname, '../engine-config.json'), 'utf8'));
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const LEASE = { '0–10': '99 yrs lease commencing from 2018', '10–25': '99 yrs lease commencing from 2008', '25+': '99 yrs lease commencing from 1995', FH: 'Freehold' };
function route(seg, kind, ten, n, projects, sqftMean, spread, priceMid, o) {
  return Array.from({ length: n }, (_, i) => Object.assign({
    project: seg + kind + ten + (i % projects), marketSegment: seg, contractDate: '0626', area: String((sqftMean + (rnd() - 0.5) * spread) / 10.7639),
    price: String(Math.round(priceMid * (0.96 + rnd() * 0.08))), propertyType: 'Condominium', typeOfArea: 'Strata', noOfUnits: '1',
    tenure: kind === 'new' ? '99 yrs lease commencing from 2024' : LEASE[ten], typeOfSale: kind === 'new' ? '1' : '3' }, o || {}));
}
const recs = [].concat(
  route('OCR', 'res', '25+', 80, 30, 1150, 100, 1.32e6), route('OCR', 'res', '10–25', 80, 40, 820, 100, 1.32e6), route('OCR', 'res', '0–10', 60, 20, 700, 60, 1.32e6),
  route('RCR', 'res', '25+', 40, 15, 950, 80, 1.32e6), route('RCR', 'res', '0–10', 40, 15, 660, 60, 1.32e6), route('RCR', 'new', '0–10', 40, 3, 500, 60, 1.32e6),
  route('OCR', 'res', 'FH', 40, 25, 900, 100, 1.32e6),
  route('OCR', 'res', '25+', 20, 10, 1100, 100, 0.9e6), route('OCR', 'res', '10–25', 20, 10, 800, 100, 0.9e6));
const d = prepare(recs, cfg), pb = C.broad(d.private);
const o = C.evaluate(1320000, d.private, [], pb, E);
assert.ok(o.routes.length >= 6);
assert.ok(o.pairs.confounded > 0 && o.pairs.single > 0);
assert.ok(o.selected.length >= 1 && o.selected[0].key === 'age:older-larger', 'age insight should lead: ' + JSON.stringify(o.selected.map((x) => x.key)));
assert.ok(o.insights.some((i) => i.key === 'status:resale-larger'));
const rcrNew = o.routes.find((r) => r.key === 'RCR|New|–'); assert.ok(rcrNew && rcrNew.grade !== 'Solid');          // 3 projects: New cap and few projects
// thin market: budget with almost no deals
const thin = C.evaluate(5000000, d.private, [], pb, E); assert.ok(thin.fallback.indexOf('THIN_MARKET') > -1 && thin.selected.length === 0);
// no thresholds are budget specific: same config object used
assert.strictEqual(JSON.stringify(E), JSON.stringify(JSON.parse(fs.readFileSync(path.join(__dirname, '../engine-config.json'), 'utf8'))));
const txt = C.report([o, thin], E, d.period);
assert.ok(/CROSS-BUDGET/.test(txt) && /DIAGNOSTICS/.test(txt) && !/bedroom/i.test(txt));
console.log('calibrate: all checks passed');
