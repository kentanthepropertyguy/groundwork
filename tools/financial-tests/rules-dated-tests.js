'use strict';
/* P3 rules gate (Master Planning, 6 Nov 2026): the dated rules are current.
   GW_RULES' HDB concessionary loan rate and CPF OA rate are set each quarter (CPF Board; HDB) and hold only to ratesValidUntil. After that date this
   test FAILS, on purpose, until the new quarter's rates are checked and entered (the refresh: gw-rules.js hdbLoanRate, hdbLoanRateFor, cpfOaRate,
   ratesValidUntil, ratesValidUntilText, plus the one sentence rules-source-tests.js names in tools/mortgage/index.html). Within 45 days of the date it
   warns. Future rates are never entered before they are published.
   Also checked: every rule's "checked" date is a real date and not in the future; the HDB MOP rule has its four categories; the CPF retirement sums
   cover this year.
   Today is the machine's date; GW_TODAY=YYYY-MM-DD sets another (to test this test).  Run: node tools/financial-tests/rules-dated-tests.js */
const path = require('path');
const root = path.join(__dirname, '..', '..');
const R = require(path.join(root, 'assets/js/gw-rules.js'))(require(path.join(root, 'tools/hdb-upgrade/rules.js')));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info).slice(0, 300) : '')); } };
const today = process.env.GW_TODAY || new Date().toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

ok(isDate(R.ratesValidUntil), 'ratesValidUntil is a date', R.ratesValidUntil);
const left = days(today, R.ratesValidUntil);
ok(left >= 0, 'the HDB loan rate (' + R.hdbLoanRate * 100 + '%) and CPF OA rate (' + R.cpfOaRate * 100 + '%) for ' + R.hdbLoanRateFor + ' are still valid on ' + today +
  ' (valid to ' + R.ratesValidUntil + '). Expired: check CPF Board and HDB for the new quarter and refresh gw-rules.js before anything else', left);
if (left >= 0 && left <= 45) console.log('WARN the dated rates expire in ' + left + ' days (' + R.ratesValidUntilText + '): CPF Board usually announces the next quarter’s rates in the last month of the quarter; refresh once published, never before.');
ok(R.ratesValidUntilText === new Date(R.ratesValidUntil + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace('Sept', 'Sep'), 'ratesValidUntilText says the same date', R.ratesValidUntilText);

// every "checked" date in the rules: a real date, not after today
const checked = [];
(function walk(o, at) { if (!o || typeof o !== 'object') return; Object.keys(o).forEach((k) => { if (k === 'base') return; const v = o[k]; if ((k === 'checked' || k === 'lastVerified') && typeof v === 'string') checked.push([at + k, v]); else walk(v, at + k + '.'); }); })(R, '');
(function walk(o, at) { if (!o || typeof o !== 'object') return; Object.keys(o).forEach((k) => { const v = o[k]; if ((k === 'checked' || k === 'lastVerified') && typeof v === 'string') checked.push([at + k, v]); else walk(v, at + k + '.'); }); })(R.base, 'base.');
ok(checked.length >= 8 && checked.every(([, v]) => isDate(v) && v <= today), 'every rule’s check date is a real date, not in the future (' + checked.length + ' dates)', checked.filter(([, v]) => !(isDate(v) && v <= today)));

// the MOP rule (P3)
const M = R.hdbMop;
ok(M && ['standard', 'plus', 'prime', 'freshStart'].every((k) => Number.isInteger(M.years[k]) && M.years[k] > 0) && M.years.standard === R.base.mopYears && M.from === 'legal-completion' && isDate(M.checked), 'the HDB MOP rule: four categories, Standard read from the planner’s rule, counted from legal completion, with its check date');

// CPF retirement sums: this year's are there (the CPF set-aside for a second home uses them)
const yr = +today.slice(0, 4);
ok(R.cpfRetirementSums[yr] && R.cpfRetirementSums[yr].brs > 0 && R.cpfRetirementSums[yr].frs > 0, 'the CPF retirement sums cover ' + yr, Object.keys(R.cpfRetirementSums));

console.log('rules-dated-tests: ' + pass + ' passed, ' + fail + ' failed (rates valid ' + left + ' more days)');
process.exit(fail ? 1 : 0);
