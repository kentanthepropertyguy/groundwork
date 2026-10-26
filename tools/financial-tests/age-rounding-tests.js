// 26 Oct 2026: every place an age is averaged or compared with the 65 and 75 cut-offs gives the whole-year tenure, with no floating-point year lost
// (one borrower with a bonus; two borrowers of the same age, or two years apart on equal incomes; the HDB loan's average age; the 75%/55% limit at 65).
// Run: node tools/financial-tests/age-rounding-tests.js
const path = require('path');
function load(dir) { const H = require(path.join(dir, 'tools/financial-tests/harness.js'))(dir); return { C: H.C, R: H.R, A: H.A }; }
const fix = load(path.resolve(process.argv[2] || path.join(__dirname, '../..')));
const out = {};
const note = (k, bad) => { out[k] = out[k] || { cases: 0, wrong: 0, ex: null }; out[k].cases++; if (bad) { out[k].wrong++; if (!out[k].ex) out[k].ex = bad; } };
const ages = []; for (let a = 21; a <= 70; a++) ages.push(a);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const incs = []; for (let i = 0; i < 400; i++) incs.push(Math.round((1000 + rnd() * 40000) * 100) / 100);
const vars = [0, 4166.67, 4167, 3333.33, 1234.56, 2500.5, 833.33, 12345.67];
for (const E of [['engine', fix]]) {
  const { C, R } = E[1];
  // 1. one borrower: the weighted age is the age itself; the tenure ends by 65 (standard) and 75 (maturity)
  for (const age of ages) for (const v of vars) for (const fx of incs.slice(0, 25)) {
    const r = C.tdsr({ kind: 'private', borrowers: [{ age: age, fixed: fx, variable: v }], debts: 0, loans: 0 });
    if (!r.ok || r.noTenure) continue;
    const std = Math.max(0, Math.min(30, 65 - age));
    note(E[0] + ' · one borrower, private: tenure to 65', r.tenure.std !== std && { age, fx, v, got: r.tenure.std, want: std });
    const r2 = C.tdsr({ kind: 'private', borrowers: [{ age: age, fixed: fx, variable: v }], debts: 0, loans: 0, tenure: 35 });
    if (r2.ok && !r2.noTenure) note(E[0] + ' · one borrower, private: longest tenure to 75', r2.tenure.allowed !== Math.min(35, 75 - age) && { age, fx, v, got: r2.tenure.allowed, want: Math.min(35, 75 - age) });
    const h = C.tdsr({ kind: 'hdb', borrowers: [{ age: age, fixed: fx, variable: v }], debts: 0, loans: 0 });
    if (h.ok && !h.noTenure) note(E[0] + ' · one borrower, HDB with a bank loan: tenure to 65', h.tenure.std !== Math.max(0, Math.min(25, 65 - age)) && { age, fx, v, got: h.tenure.std });
  }
  // 2. two borrowers whose weighted age is a whole number (same age, or equal incomes two years apart)
  for (const age of ages.slice(0, 40)) for (const v of vars) for (const fx of incs.slice(25, 45)) {
    const same = C.tdsr({ kind: 'private', borrowers: [{ age: age, fixed: fx, variable: v }, { age: age, fixed: fx * 0.73, variable: v * 0.4 }], debts: 0, loans: 0 });
    if (same.ok && !same.noTenure) note(E[0] + ' · two borrowers, same age: tenure to 65', same.tenure.std !== Math.max(0, Math.min(30, 65 - age)) && { age, fx, v, iwaa: same.B.iwaaUse, got: same.tenure.std });
    const twoApart = C.tdsr({ kind: 'private', borrowers: [{ age: age, fixed: fx, variable: v }, { age: age + 2, fixed: fx, variable: v }], debts: 0, loans: 0 });
    if (twoApart.ok && !twoApart.noTenure) note(E[0] + ' · two borrowers, equal incomes 2 years apart: tenure to 65', twoApart.tenure.std !== Math.max(0, Math.min(30, 65 - (age + 1))) && { age, fx, v, iwaa: twoApart.B.iwaaUse, got: twoApart.tenure.std });
  }
  // 3. HDB loan: the average age of the applicants
  for (const age of ages.slice(0, 40)) for (const k of [2, 3, 4]) {
    const bs = []; for (let j = 0; j < k; j++) bs.push({ age: age + j, fixed: 3000 + j * 1111.11, variable: 0 });
    const m = C.msr({ scenario: 'hdb-loan', household: 'family', borrowers: bs });
    const avg = age + (k - 1) / 2, want = Math.max(0, Math.min(25, Math.floor(65 - avg)));
    if (m.ok && !m.noTenure) note(E[0] + ' · HDB loan: average age, tenure to 65', m.tenure.years !== want && { age, k, got: m.tenure.years, want });
  }
  // 4. the cost page and planner (MAS 75% / 55% limit, GW_CALC.progressive): a loan ending exactly at 65 keeps the 75% limit
  for (const age of ages.slice(5, 40)) for (const v of vars) {
    const B = C.borrowers([{ age: age, fixed: 20000, variable: v }]);
    const p = C.progressive({ price: 1500000, age: B.iwaaUse, years: Math.min(30, 65 - age), ratePct: 4, loans: 0, kind: 'private', buyers: [{ res: 'SC', owned: 0 }] });
    if (p.ok) note(E[0] + ' · loan limit: a loan ending exactly at 65 keeps 75%', (p.ltv !== 0.75 || p.lower) && { age, v, iwaa: B.iwaaUse, ltv: p.ltv });
  }
}
let pass = 0, fail = 0;
for (const k of Object.keys(out).sort()) { if (out[k].wrong) { fail++; console.log('FAIL ' + k + ': ' + out[k].wrong + ' of ' + out[k].cases + '  e.g. ' + JSON.stringify(out[k].ex)); } else pass++; }
console.log('age-rounding-tests: ' + pass + ' passed, ' + fail + ' failed (' + Object.keys(out).reduce((s, k) => s + out[k].cases, 0) + ' cases)');
process.exit(fail ? 1 : 0);
