'use strict';
/* The same cases as engine_batch.js, run through GW_ENGINE.call (assets/js/gw-engine.js, the shared engine adapter, Phase 1), so independent-tests.py checks the
   adapter against the independent rules model too. It also checks, case by case, that the adapter's value is the engine's own result (exactly).
   Usage: GW_ENGINE_BATCH=engine_batch_adapter.js python3 tools/financial-tests/independent-tests.py */
const fs = require('fs'), path = require('path');
const H = require(path.join(__dirname, '..', 'harness.js'))();
const { R, C, T, A, S } = H;
const F = require(path.join(H.root, 'assets/js/gw-fin3-core.js'))(R, C, T, A, S);
const E = require(path.join(H.root, 'assets/js/gw-engine.js'))(R, C, T, A, S, F, require(path.join(H.root, 'assets/js/gw-cpfbuf.js'))(R, C));
const cases = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let differ = 0;
const via = (name, direct, input) => { const v = E.call(name, input).value; if (JSON.stringify(v) !== JSON.stringify(direct(JSON.parse(JSON.stringify(input))))) differ++; return v; };
const o = {};
o.duty = (cases.duty || []).map((c) => { const r = via('calc.stampDuty', C.stampDuty, { price: c.price, kind: 'private', buyers: c.buyers, couple: c.couple }); return { bsd: r.bsd, absd: r.absd }; });
o.ssd = (cases.ssd || []).map((c) => { const r = via('calc.ssd', C.ssd, { price: c.price, bought: c.bought, sold: c.sold }); return { ssd: r.ok ? r.ssd : null }; });
o.tdsr = (cases.tdsr || []).map((c) => { const r = via('calc.tdsr', C.tdsr, { kind: 'private', borrowers: c.buyers, debts: c.debts, loans: 0 }); return r.ok && !r.noTenure ? { years: r.tenure.years, maxLoan: r.maxLoan } : { years: 0, maxLoan: 0 }; });
o.hdbloan = (cases.hdbloan || []).map((c) => { const r = via('calc.msr', C.msr, { scenario: 'hdb-loan', borrowers: c.buyers, lease: c.lease }); return r.ok && !r.noTenure ? { years: r.tenure.years, maxLoan: r.maxLoan, ltv: r.ltv } : { noTenure: true }; });
o.mortgage = (cases.mortgage || []).map((c) => ({ monthly: via('calc.mortgage', C.mortgage, { loan: c.loan, ratePct: c.rate, years: c.years, lender: 'bank' }).monthly }));
o.cpf2 = (cases.cpf2 || []).map((c) => { const r = via('calc.cpfSecondHome', C.cpfSecondHome, c); return { usable: r.ok ? r.usable : null }; });
o.afford = (cases.afford || []).map((c) => { const r = via('answer.assess', A.assess, c.input); return { state: r.state, highest: r.state === 'ok' ? r.highest : null, borrow: r.borrow ? r.borrow.max : null }; });
o.sellfirst = (cases.sellfirst || []).map((c) => { const r = via('timeline.timeline', T.timeline, c.input); return { absd: r.ok ? r.duty.absd : null }; });
if (differ) { process.stderr.write('adapter value differs from the engine in ' + differ + ' cases\n'); process.exit(1); }
process.stdout.write(JSON.stringify(o));
