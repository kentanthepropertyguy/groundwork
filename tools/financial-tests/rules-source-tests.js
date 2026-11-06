'use strict';
/* P2 architectural cleanup (Master Planning, 6 Nov 2026): every rule value a page names or uses comes from GW_RULES (assets/js/gw-rules.js and the planner's
   tools/hdb-upgrade/rules.js), never a copy in page code. This guards the quarterly refresh of the dated rates (the HDB loan rate, the CPF OA rate and their
   validity): it must be one edit in gw-rules.js, plus the one sentence the build writes into the Mortgage page.
     1. No dated rate, period or validity date is written in site code outside gw-rules.js (comments aside).
     2. The default interest rate is defined once (GW_FIN3.DEFAULT_RATE_PCT, from the MAS medium-term rate) and GW_ANSWER uses the same.
     3. A simulated refresh (made-up test values, never real ones) changes every page sentence the build writes, and leaves none of today's values.
     4. The Mortgage page's static text is today's: the sentence the build writes from today's rules.
     5. CPF buffer reads the OA rate and the latest Full Retirement Sum from the rules.
   Run: node tools/financial-tests/rules-source-tests.js */
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const root = path.join(__dirname, '..', '..');
const BASE = require(path.join(root, 'tools/hdb-upgrade/rules.js'));
const R = require(path.join(root, 'assets/js/gw-rules.js'))(BASE);
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info).slice(0, 400) : '')); } };
const ratePc = (x) => Math.round(x * 10000) / 100 + '%';
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n');

// 1. dated values written outside the rules
const dated = (r) => [ratePc(r.hdbLoanRate), ratePc(r.cpfOaRate), r.hdbLoanRateFor, r.ratesValidUntilText, String(r.hdbLoanRate), String(r.cpfOaRate)];
{
  const files = cp.execSync('git ls-files "assets/js/*.js" "tools/hdb-upgrade/*.js"', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
    .filter((f) => f !== 'assets/js/gw-rules.js' && !/\/tests\//.test(f));
  const hits = [];
  files.forEach((f) => { const t = strip(fs.readFileSync(path.join(root, f), 'utf8')); dated(R).forEach((d) => { if (t.indexOf(d) >= 0) hits.push(f + ': ' + d); }); });
  ok(hits.length === 0, 'no dated rate, period or validity date is written in site code outside gw-rules.js (' + files.length + ' files)', hits);
}

// 2. one default interest rate
{
  const { C, T, A, S } = require('./harness.js')(root);
  const F = require(path.join(root, 'assets/js/gw-fin3-core.js'))(R, C, T, A, S);
  ok(F.DEFAULT_RATE_PCT === R.stressRate * 100, 'GW_FIN3.DEFAULT_RATE_PCT is the MAS medium-term rate from the rules', F.DEFAULT_RATE_PCT);
  const core = strip(fs.readFileSync(path.join(root, 'assets/js/gw-fin3-core.js'), 'utf8')), ans = strip(fs.readFileSync(path.join(root, 'assets/js/gw-answer.js'), 'utf8'));
  ok(!/ratePct\)?\s*\?\s*[\w.]*ratePct\s*:\s*\d/.test(core) && !/:\s*4\)/.test(core.replace(/slice\(0, 4\)/g, '')), 'GW_FIN3 has no literal default rate left');
  ok(/has\(s\.ratePct\) \? s\.ratePct : R\.stressRate \* 100/.test(ans), 'GW_ANSWER defaults to the same rule');
  // a change of the MAS rate would move the default everywhere at once
  const R2 = Object.assign({}, R, { stressRate: 0.045 });
  const F2 = require(path.join(root, 'assets/js/gw-fin3-core.js'))(R2, C, T, A, S);
  ok(F2.DEFAULT_RATE_PCT === 4.5, 'the default follows the rule (a test value of 4.5% gives 4.5)');
}

// 3. a simulated refresh, with made-up values that can never be real: every sentence the build writes changes
const TEST = { hdbLoanRate: 0.0297, cpfOaRate: 0.0287, hdbLoanRateFor: 'TEST-Q9 2099', ratesValidUntil: '2099-12-31', ratesValidUntilText: '31 Dec 2099' };
function loadUi(file, rules, extra) {
  const ctx = Object.assign({ self: null, console, Math, JSON, Object, Array, String, Number, RegExp, Date, encodeURIComponent, isFinite, parseFloat, parseInt, Intl }, extra || {});
  ctx.self = ctx; ctx.GW_RULES = rules; ctx.module = undefined; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
  return ctx;
}
{
  const Rt = Object.assign({}, R, TEST);
  const today = loadUi('assets/js/gw-calc-ui.js', R).GWC_UI, refreshed = loadUi('assets/js/gw-calc-ui.js', Rt).GWC_UI;
  const ids = Object.keys(today.TOOLS).filter((id) => { try { today.pageHtml(id); return true; } catch (e) { return false; } });
  const before = ids.map((id) => today.pageHtml(id)).join('\n'), after = ids.map((id) => refreshed.pageHtml(id)).join('\n');
  ok(ids.indexOf('mortgage') >= 0 && ids.length >= 3, 'the calculator pages can be written (' + ids.join(', ') + ')');
  ok([ratePc(R.hdbLoanRate), R.hdbLoanRateFor, R.ratesValidUntilText].every((d) => before.indexOf(d) >= 0), 'today, the written pages name today’s HDB rate, period and validity');
  ok(dated(R).slice(0, 4).every((d) => after.indexOf(d) < 0), 'after the simulated refresh, none of today’s dated values is left in the written pages', dated(R).filter((d) => after.indexOf(d) >= 0));
  ok([ratePc(TEST.hdbLoanRate), TEST.hdbLoanRateFor, TEST.ratesValidUntilText].every((d) => after.indexOf(d) >= 0) && after.indexOf(ratePc(TEST.cpfOaRate)) >= 0, 'and the test values appear in their place');
}

// 4. the Mortgage page's static text is the sentence the build writes from today's rules
{
  const html = fs.readFileSync(path.join(root, 'tools/mortgage/index.html'), 'utf8');
  const want = 'HDB’s rate is ' + ratePc(R.hdbLoanRate) + ' a year for ' + R.hdbLoanRateFor + ', valid to ' + R.ratesValidUntilText + ' (CPF Board).';
  ok(html.indexOf(want) >= 0, 'tools/mortgage/index.html carries today’s HDB rate sentence exactly (after a refresh, update this one sentence: ' + want + ')');
  const page = loadUi('assets/js/gw-calc-ui.js', R).GWC_UI.pageHtml('mortgage');
  const form = (s) => (s.match(/<section class="gw-calc[\s\S]*?<div class="gw-calc-out">/) || [''])[0];
  ok(form(page) !== '' && html.indexOf(form(page)) >= 0, 'the Mortgage page’s whole form is exactly what the build writes from today’s rules');
}

// 5. CPF buffer: the OA rate and the latest FRS come from the rules
{
  const t = strip(fs.readFileSync(path.join(root, 'assets/js/gw-cpfbuf.js'), 'utf8'));
  ok(/const OA_RATE = R\.cpfOaRate;/.test(t) && /const FRS_LATEST = R\.cpfRetirementSums\[/.test(t) && !/228200|0\.025/.test(t), 'GW_CPFBUF reads the OA rate and the latest Full Retirement Sum from the rules');
}

console.log('rules-source-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
