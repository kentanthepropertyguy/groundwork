'use strict';
/* HSU P4: for each set of page figures (the page's own state: { f, o }), the case and options the page builds (GW_HSU.caseOf / optsOf, the same
   functions the page runs) and GW_ENGINE.compare's answer, so the browser test can check the page shows exactly the engine's figures.
   Usage: node hsu_page_batch.js <states.json> <YYYY-MM-DD>   (today, as the page's clock gives it) */
const fs = require('fs'), path = require('path');
const H = require(path.join(__dirname, '..', 'harness.js'))();
const { R, C, T, A, S, root } = H;
const ASM = require(path.join(root, 'tools/hdb-upgrade/assumptions.js'));
const F = require(path.join(root, 'assets/js/gw-fin3-core.js'))(R, C, T, A, S);
const BUF = require(path.join(root, 'assets/js/gw-cpfbuf.js'))(R, C);
const E = require(path.join(root, 'assets/js/gw-engine.js'))(R, C, T, A, S, F, BUF);
const CX = Object.assign({}, C, require(path.join(root, 'assets/js/gw-calc-position.js'))(C, R, ASM));
const X = require(path.join(root, 'assets/js/gw-engine-position.js'))(R, CX, ASM, E);
const U = require(path.join(root, 'assets/js/gw-hsu.js'));
const states = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), d = process.argv[3], today = { date: d, month: d.slice(0, 7) };
const out = states.map((s) => {
  const r = X.compare(U.caseOf(s.f, today), U.optsOf(s.f, s.o, today)), pick = {};
  ['hold', 'sell', 'upgrade'].forEach((k) => { const x = r.choices[k]; pick[k] = { status: x.status, reason: x.reason || null, position: x.end ? x.end.position : null, cash: x.today ? x.today.cash : null, cpf: x.today ? x.today.cpf : null, monthly: U.monthlyOf(x), vs: r.vsHold[k] ? r.vsHold[k].position : null, mopEndsIn: x.mop ? x.mop.endsIn : null }; });
  return { choices: pick, comparable: r.comparable, answer: U.answerOf(r, s.f, s.o).text, years: r.years, missing: r.missing.map((m) => m.field) };
});
process.stdout.write(JSON.stringify(out));
