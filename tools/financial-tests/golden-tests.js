'use strict';
/* Golden regression test for the financial engines. Compares today's numbers for every scenario in scenarios.js with golden.json.
   A change to any amount, rate, date, state or count fails here; prose is not compared. Run: node tools/financial-tests/golden-tests.js */
const fs = require('fs'), path = require('path');
const H = require('./harness.js')(process.argv[2]);
const { snapshot } = require('./golden-lib.js');
const scenarios = require('./scenarios.js');
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
const now = snapshot(H, scenarios);
let pass = 0, fail = 0;
const near = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 0.005 + 1e-9 * Math.abs(b) : a === b);
scenarios.forEach(([fn, id]) => {
  const want = golden[id], got = now[id], bad = [];
  if (!want) { bad.push('no golden entry'); }
  else {
    Object.keys(want).forEach((k) => { if (!(k in got)) bad.push(k + ': missing (was ' + want[k] + ')'); else if (!near(got[k], want[k])) bad.push(k + ': ' + want[k] + ' -> ' + got[k]); });
    Object.keys(got).forEach((k) => { if (!(k in want)) bad.push(k + ': new value ' + got[k]); });
  }
  if (bad.length) { fail++; console.log('FAIL ' + fn + ' / ' + id + ' (' + bad.length + ' differences)'); bad.slice(0, 8).forEach((b) => console.log('   ' + b)); } else pass++;
});
Object.keys(golden).forEach((id) => { if (!scenarios.some((s) => s[1] === id)) { fail++; console.log('FAIL golden entry with no scenario: ' + id); } });
console.log('financial golden: ' + pass + ' passed, ' + fail + ' failed of ' + scenarios.length + ' scenarios');
process.exit(fail ? 1 : 0);
