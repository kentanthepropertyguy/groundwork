// SYNTHETIC URA-shaped records for the project-layer tests (ILLUSTRATIVE; never real transactions).
// Latest month in the fixture is 0926 (Sept 2026). Areas are whole square metres, as in the real feed.
const tx = (project, o) => Object.assign({
  project, street: project + ' RD', marketSegment: 'RCR', contractDate: '0926', area: '100', price: '1200000', propertyType: 'Condominium', typeOfArea: 'Strata',
  noOfUnits: '1', typeOfSale: '3', tenure: '99 yrs lease commencing from 2010', district: '20', floorRange: '06-10',
}, o);
const PSF = (price, sqm) => price / (sqm * 10.7639);

function fixture() {
  const r = [];
  // ALPHA: resale, five 100 sqm deals, prices 1.0 to 1.4m. Months: 0926 (age 0), 0126 (8), 0925 (12), 0623 (39), 0921 (60, boundary month)
  [['0926', 1400000, '11-15'], ['0126', 1300000, '06-10'], ['0925', 1200000, '06-10'], ['0623', 1100000, '01-05'], ['0921', 1000000, '-']].forEach(([d, p, f]) => r.push(tx('ALPHA', { contractDate: d, price: String(p), floorRange: f })));
  // BETA: new sales (tenure with no start year) + one sub-sale + resale-free; one single-transaction cell
  r.push(tx('BETA', { typeOfSale: '1', tenure: '99 years leasehold', area: '80', price: '2000000', contractDate: '0926' }));
  r.push(tx('BETA', { typeOfSale: '1', tenure: '99 years leasehold', area: '80', price: '2100000', contractDate: '0826' }));
  r.push(tx('BETA', { typeOfSale: '2', tenure: '99 years leasehold', area: '120', price: '3000000', contractDate: '0826' }));
  // Identical rows must be kept (cannot be proven duplicates)
  for (let i = 0; i < 3; i++) r.push(tx('TWINS', { area: '90', price: '1500000', contractDate: '0526', floorRange: '16-20' }));
  // Name pair that must NOT merge
  r.push(tx('CHUAN VISTA', { price: '1300000' })); r.push(tx('CHUAN VISTA II', { price: '1700000' }));
  // Mixed tenure (freehold + 99-yr) and a >110-year lease that groups with freehold
  r.push(tx('MIXED', { tenure: 'Freehold', price: '1000000' })); r.push(tx('MIXED', { tenure: 'Freehold', price: '1100000' })); r.push(tx('MIXED', { tenure: '99 yrs lease commencing from 1995', price: '900000' }));
  r.push(tx('LONGLEASE', { tenure: '946 yrs lease commencing from 1880', price: '1500000' }));
  r.push(tx('LEASE2YEARS', { tenure: '99 years lease commencing from 2023', price: '1500000' }));
  // Overlap trio: P and Q share a size band only in the 24-month window; R is new-sale only; S has no overlapping sizes with P
  r.push(tx('PEE', { area: '100', price: '1100000', contractDate: '0926' })); r.push(tx('PEE', { area: '100', price: '1150000', contractDate: '0325' }));
  r.push(tx('QUE', { area: '100', price: '1250000', contractDate: '0925' }));          // age 12: in 24m window, not in 12m
  r.push(tx('QUE', { area: '60', price: '800000', contractDate: '0926' }));
  r.push(tx('ARR', { typeOfSale: '1', area: '100', price: '1900000', contractDate: '0926', tenure: '99 yrs lease commencing from 2025' }));
  r.push(tx('ESS', { area: '200', price: '3300000', contractDate: '0926' }));
  // Edge bands: 92 sqm = 990.3 sqft (bin 900); 93 sqm = 1001.1 sqft (bin 1000)
  r.push(tx('EDGE', { area: '92', price: '1100000' })); r.push(tx('EDGE', { area: '93', price: '1100000' }));
  // Things that must NOT appear
  r.push(tx('RESIDENTIAL APARTMENTS', { price: '1000000' })); r.push(tx('LAKEVIEW ESTATE', { price: '1000000' }));
  r.push(tx('ECPROJECT', { propertyType: 'Executive Condominium' })); r.push(tx('LANDEDX', { propertyType: 'Terrace', typeOfArea: 'Land' }));
  r.push(tx('BULK', { noOfUnits: '12' })); r.push(tx('STRATALANDED', { propertyType: 'Strata Terrace' }));
  r.push(tx('BADDATE', { contractDate: '13xx' })); r.push(tx('NOPRICE', { price: '' }));
  return r;
}
module.exports = { fixture, tx, PSF };
