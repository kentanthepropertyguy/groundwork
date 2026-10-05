// Synthetic URA-shaped transactions (ILLUSTRATIVE, not market data). Used by the tests and the bundled test route-stats.
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, norm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const LEASE = { '0–10': '99 yrs lease commencing from 2018', '10–25': '99 yrs lease commencing from 2008', '25+': '99 yrs lease commencing from 1995', FH: 'Freehold' };
function synth() {
  const spec = [['OCR', 'res', '25+', 1.45e6, 1200, 900, 60], ['OCR', 'res', '10–25', 1.5e6, 900, 2200, 90], ['OCR', 'res', '0–10', 1.5e6, 740, 800, 25], ['OCR', 'res', 'FH', 1.8e6, 1000, 900, 60],
    ['OCR', 'new', '', 2.1e6, 900, 2400, 12], ['RCR', 'res', '25+', 1.9e6, 1250, 450, 20], ['RCR', 'res', '10–25', 1.9e6, 930, 900, 30], ['RCR', 'res', '0–10', 1.7e6, 740, 650, 20],
    ['RCR', 'res', 'FH', 1.9e6, 1050, 1300, 70], ['RCR', 'new', '', 2.5e6, 880, 2300, 8], ['CCR', 'res', '10–25', 2.3e6, 1050, 520, 15], ['CCR', 'res', 'FH', 3.0e6, 1300, 1200, 50],
    ['CCR', 'res', '0–10', 2.4e6, 700, 120, 10], ['CCR', 'new', '', 3.3e6, 760, 1600, 6]];
  const rec = [];
  spec.forEach(([seg, kind, ten, mid, sq, n, proj]) => { for (let i = 0; i < n; i++) { const price = mid * Math.exp(0.38 * norm()), sqft = Math.max(350, sq * Math.pow(price / mid, 0.55) * (1 + 0.1 * norm()));
    rec.push({ project: seg + kind + ten + 'P' + Math.floor(Math.pow(rnd(), 1.6) * proj), marketSegment: seg, contractDate: '0626', area: String(sqft / 10.7639), price: String(Math.round(price)), propertyType: 'Condominium', typeOfArea: 'Strata', noOfUnits: '1',
      tenure: kind === 'new' ? '99 yrs lease commencing from 2024' : LEASE[ten], typeOfSale: kind === 'new' ? '1' : '3' }); } });
  for (let i = 0; i < 700; i++) { const price = 1.45e6 * Math.exp(0.2 * norm()); rec.push({ project: 'EC' + Math.floor(rnd() * 14), marketSegment: 'OCR', contractDate: '0626', area: String((1000 + 90 * norm()) / 10.7639), price: String(Math.round(price)), propertyType: 'Executive Condominium', typeOfArea: 'Strata', noOfUnits: '1', tenure: LEASE['10–25'], typeOfSale: '3' }); }
  return rec;
}
module.exports = { synth };
