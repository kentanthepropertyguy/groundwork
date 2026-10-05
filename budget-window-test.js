// SYNTHETIC records only.
const assert = require('assert'), fs = require('fs'), path = require('path'), W = require('../budget-window.js');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));
const mk = (n, price, o) => Array.from({ length: n }, (_, i) => Object.assign({ project: 'P' + (i % 3), marketSegment: 'OCR', contractDate: '0626', area: String(90 + i), price: String(price + i * 1000), propertyType: 'Condominium', typeOfArea: 'Strata', tenure: '99 yrs lease commencing from 2008', typeOfSale: '3', noOfUnits: '1' }, o || {}));
const recs = mk(30, 1300000).concat(mk(10, 1300000, { tenure: 'Freehold', project: 'F' }), mk(8, 1300000, { propertyType: 'Executive Condominium', marketSegment: 'OCR', typeOfSale: '1' }), mk(5, 2000000), mk(4, 1300000, { typeOfSale: '2' }));
const d = W.prepare(recs, cfg);
assert.strictEqual(d.private.length, 45);
assert.strictEqual(d.ec.length, 8);
const s = W.summarise(d.private, 1250000, 1390000);
assert.strictEqual(s.total, 40);
assert.strictEqual(s.groups['OCR|Resale|10–25'].n, 30); assert.strictEqual(s.groups['OCR|Resale|10–25'].projects, 3);
assert.strictEqual(s.groups['OCR|Resale|Freehold / 999-yr'].projects, 1); assert.strictEqual(s.groups['OCR|Resale|Freehold / 999-yr'].topShare, 1);
assert.ok(!Object.keys(W.summarise(d.private, 1e6, 1.2e6).groups).length);
const txt = W.run(recs, cfg, { budget: 1320000, lowA: 1250000, highA: 1390000, pctB: 10 });
assert.ok(/EXECUTIVE CONDOMINIUMS/.test(txt) && /ONE-PROJECT-DOMINATES/.test(txt) && !/bedroom\s*:/.test(txt));
console.log('budget-window: all checks passed');
