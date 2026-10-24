// node tools/market-data/tests/extract-layouts-tests.js : draft layout extraction from brochure / unit-chart text (synthetic text).
'use strict';
const assert = require('assert');
const X = require('../extract-layouts.js');
const E = require('../bedroom-engine.js');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

t('brochure style: "Type X", bedroom words, sqm and sqft', () => {
  const rows = X.extract('TYPE S1\nOne Bedroom\n50 sqm / 538 sqft\n\nType Q2\n2 Bedroom + Study 65 sq m / 700 sq ft\nType R9P 3-Bedroom Premium\n99 m2 | 1,066 sq.ft\nType PH1 Penthouse 4 Bedroom 160 sqm');
  assert.deepStrictEqual(rows.map((r) => [r.code, r.bedrooms, r.variant, r.sqm, r.sqft]), [['S1', 1, '', '50', '538'], ['Q2', 2, 'study', '65', '700'], ['R9P', 3, 'premium', '99', '1066'], ['PH1', 4, 'penthouse', '160', '']]);
});
t('unit-chart style: a line that starts with the code', () => {
  const rows = X.extract('K1 | 2 BR | 600 sqft\nK7S | 2 BR + S | 700 sqft\nM10P | 3 BR | 1,100 sqft\nFloor 12');
  assert.deepStrictEqual(rows.map((r) => [r.code, r.bedrooms, r.variant, r.sqft]), [['K1', 2, '', '600'], ['K7S', 2, 'study', '700'], ['M10P', 3, '', '1100']]);
});
t('a repeated code keeps its first complete reading; missing values are named, never guessed', () => {
  const rows = X.extract('Type W1\n1,292 sqft\nType W1\n4 Bedroom 120 sqm 1,292 sqft\nType Z9\nsee plan');
  const d1 = rows.find((r) => r.code === 'W1'), z9 = rows.find((r) => r.code === 'Z9');
  assert.strictEqual(d1.bedrooms, 4); assert.strictEqual(d1.note, '');
  assert.strictEqual(z9.bedrooms, null); assert.ok(/bedrooms not found/.test(z9.note) && /area not found/.test(z9.note));
});
t('output rows are drafts the classifier ignores until reviewed', () => {
  const csv = 'project,code,bedrooms,variant,sqm,sqft,source,status,note\n' + X.toCsv(X.extract('Type S1 One Bedroom 50 sqm'), 'Q', 's');
  const P = E.loadLayouts(csv, '').get('Q');
  assert.strictEqual(P.all.length, 1); assert.strictEqual(P.layouts.length, 0); assert.strictEqual(P.all[0].status, 'draft');
});
t('studio and dual-key are recognised', () => {
  const rows = X.extract('Type S1 Studio 37 sqm\nType DK1 3 Bedroom Dual-Key 105 sqm');
  assert.deepStrictEqual(rows.map((r) => [r.code, r.bedrooms, r.variant]), [['S1', 0, ''], ['DK1', 3, 'dual-key']]);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
