'use strict';
/* Plan My Move continuity (Master Planning, 6 Nov 2026), in node. The plan bar's steps (gw-nav.js PLAN) are the plan page's own steps, in order:
   the buying, selling and Upgrade from HDB panels of journey/index.html and the moving guide for each home type (gw-journey.js moveGuide).
   Also: the plan bar's wording and links; a step's address carries ?plan= (and ?j=1 for a calculator) and never a figure; the results read back are the
   kept answers, in words; Research and the Map are never given the bar. Run from the site folder: node tools/financial-tests/plan-steps-tests.js */
const fs = require('fs'), path = require('path');
const SITE = path.resolve(__dirname, '../..');
global.self = global;
const N = require(path.join(SITE, 'assets/js/gw-nav.js')), J = require(path.join(SITE, 'assets/js/gw-journey.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const html = fs.readFileSync(path.join(SITE, 'journey/index.html'), 'utf8');
const panel = (k) => (new RegExp('<section[^>]*data-gw-panel="' + k + '"[\\s\\S]*?</section>').exec(html) || [''])[0];
const links = (h) => (h.match(/<div class="gw-step(?! k)[^"]*">[\s\S]*?<\/div><\/div>/g) || []).map((st) => { const m = /<a class="gw-btn[^"]*" href="\.\.\/([^"]+)"/.exec(st); return m ? m[1] : null; }).filter(Boolean);
const planPaths = (k) => N.PLAN[k].steps.map((x) => x[2]);
check('buying: the plan bar’s steps are the panel’s, in order', JSON.stringify(planPaths('buy')) === JSON.stringify(links(panel('buy'))), [planPaths('buy'), links(panel('buy'))]);
// selling: step 1 offers two ways to see what homes sold for (Property values, or Research for a development); the plan follows the first
const sellL = links(panel('sell'));
check('selling: the plan bar’s steps are the panel’s, in order', JSON.stringify(planPaths('sell')) === JSON.stringify(sellL.filter((x) => x !== 'research/')), [planPaths('sell'), sellL]);
check('Upgrade from HDB: its four steps are one page, then what it buys', planPaths('up')[0] === 'tools/hdb-upgrade/' && links(panel('up')).every((x) => x === 'tools/hdb-upgrade/'));
['hdb', 'condo', 'landed'].forEach((t) => {
  const g = J.moveGuide(t, 'bigger', '../', {}), L = (g.steps.match(/<div class="gw-step(?! k)[^"]*">[\s\S]*?<\/div><\/div>/g) || []).map((st) => { const m = /href="\.\.\/([^"]+)"/.exec(st); return m ? m[1] : null; }).filter(Boolean);
  check('moving from ' + t + ': the plan bar’s steps are the guide’s, in order', JSON.stringify(planPaths('move-' + t)) === JSON.stringify(L), [planPaths('move-' + t), L]);
});
// the bar
const h = N.planHtml('buy', 0, '../../', {});
check('the bar: "Part of your Plan My Move", step 1 of 4, Back to my plan, the next step', /Part of your Plan My Move/.test(h) && /Step 1 of 4/.test(h) && /href="\.\.\/\.\.\/journey\/#buy"[^>]*>‹ Back to my plan/.test(h) && /Next: Homes in budget/.test(h));
check('the bar: a calculator step’s link carries ?j=1 and ?plan=, a hash kept; nothing else', /href="\.\.\/\.\.\/tools\/tdsr\/\?j=1&plan=buy#cash"/.test(h) && /href="\.\.\/\.\.\/tools\/payment-planner\/\?j=1&plan=buy"/.test(h) && /href="\.\.\/\.\.\/tools\/what-can-i-buy\/\?plan=buy"/.test(h));
check('the bar: a step opened from this plan is ticked; an answer worked out elsewhere is not', /<li class="done"><a[^>]*><i>✓<\/i>Your budget/.test(N.planHtml('buy', 1, '../../', {}, ['budget'])) && !/class="done"/.test(N.planHtml('buy', 1, '../../', { 'tools/tdsr/': 'x' }, [])));
check('no figure in any step address', Object.keys(N.PLAN).every((k) => !/\d{3}/.test(N.planHtml(k, 0, '../', {}).match(/href="[^"]*"/g).join(''))));
check('Research and the Map are never given the bar', Object.keys(N.PLAN).every((k) => N.PLAN[k].steps.filter((x) => /^research\//.test(x[2])).every((x) => x[3] === false)));
check('which step: by path', N.planStepAt('buy', '/tools/tdsr/') === 0 && N.planStepAt('buy', '/tools/payment-planner/index.html') === 3 && N.planStepAt('buy', '/tools/sale-proceeds/') === null && N.planStepAt('nope', '/tools/tdsr/') === null);
// the results read back
const mem = (o) => ({ getItem: (k) => (o[k] === undefined ? null : JSON.stringify(o[k])) });
const R = N.planResults(mem({ 'gw.plan.v1': { borrow: { loan: 1036833.14, budget: 1444999 }, sell: { total: 531740 }, upgrade: { budget: 1890500 }, pay: { price: 1800000, cash: 309600 } }, 'gw.ctx.v1': { hdb: { block: '612B' } } }));
check('results: the kept answers in words (budgets to the $1,000 below, as on the calculators)', R['tools/tdsr/'] === 'Budget about $1,444,000' && R['tools/sale-proceeds/'] === 'About $531,740 back after the loan and costs' && R['tools/hdb-upgrade/'] === 'Budget about $1,890,000' && R['tools/payment-planner/'] === 'At $1,800,000: $309,600 in cash and CPF' && R['journey/worth/'] === 'Looked up Blk 612B', R);
check('results: nothing kept, nothing shown', JSON.stringify(N.planResults(mem({}))) === '{}');
check('results: a loan without a budget says so', /^Loan about \$1,036,833\./.test(N.planResults(mem({ 'gw.plan.v1': { borrow: { loan: 1036833.14, budget: null } } }))['tools/tdsr/']));
console.log('plan-steps-tests: %d passed, %d failed', ok, fail);
process.exit(fail ? 1 : 0);
