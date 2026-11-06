'use strict';
/* Reads a JSON file of Hold vs Sell vs Upgrade cases (written by hsu-independent-tests.py) and prints GW_ENGINE.compare's figures for each, from the
   engines in this repo (harness.js + gw-calc-position.js + gw-engine-position.js). Nothing here computes anything: it only calls the engines.
   Usage: node hsu_batch.js <cases.json> */
const fs = require('fs'), path = require('path');
const H = require(path.join(__dirname, '..', 'harness.js'))();
const { R, C, T, A, S, root } = H;
const ASM = require(path.join(root, 'tools/hdb-upgrade/assumptions.js'));
const F = require(path.join(root, 'assets/js/gw-fin3-core.js'))(R, C, T, A, S);
const BUF = require(path.join(root, 'assets/js/gw-cpfbuf.js'))(R, C);
const E = require(path.join(root, 'assets/js/gw-engine.js'))(R, C, T, A, S, F, BUF);
const CX = Object.assign({}, C, require(path.join(root, 'assets/js/gw-calc-position.js'))(C, R, ASM));
const X = require(path.join(root, 'assets/js/gw-engine-position.js'))(R, CX, ASM, E);
const cases = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = cases.map((k) => {
  const r = X.compare(k.case, k.opts);
  const pick = (x) => {
    const o = { status: x.status, reason: x.reason || null };
    if (x.today) { o.todayCash = x.today.cash; o.todayCpf = x.today.cpf; }
    if (x.homes && x.homes.length) { o.loan = x.homes[0].loanToday; o.loanEnd = x.homes[0].loan; o.interest = x.homes[0].interest; o.years = x.homes[0].years || null; }
    if (x.costs) o.duty = x.costs.duty || 0;
    if (x.end) { o.position = x.end.position; o.equity = x.end.equity; o.cash = x.end.cash; o.cpf = x.end.cpf; o.paid = x.end.paid.total; }
    return o;
  };
  return { hold: pick(r.choices.hold), sell: pick(r.choices.sell), upgrade: pick(r.choices.upgrade), comparable: r.comparable, breakEven: r.breakEven.upgrade || null };
});
process.stdout.write(JSON.stringify(out));
