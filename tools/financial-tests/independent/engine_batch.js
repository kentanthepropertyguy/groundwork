'use strict';
/* Reads a JSON file of cases (written by independent-tests.py) and prints Groundwork's own figures for each, from the engines in this repo (harness.js).
   Usage: node engine_batch.js <cases.json>. Nothing here computes a rule: it only calls the engines. */
const fs = require('fs'), path = require('path');
const H = require(path.join(__dirname, '..', 'harness.js'))();
const { C, A, T } = H;
const cases = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const o = {};
o.duty = (cases.duty || []).map((c) => { const r = C.stampDuty({ price: c.price, kind: 'private', buyers: c.buyers, couple: c.couple }); return { bsd: r.bsd, absd: r.absd }; });
o.ssd = (cases.ssd || []).map((c) => { const r = C.ssd({ price: c.price, bought: c.bought, sold: c.sold }); return { ssd: r.ok ? r.ssd : null }; });
o.tdsr = (cases.tdsr || []).map((c) => { const r = C.tdsr({ kind: 'private', borrowers: c.buyers, debts: c.debts, loans: 0 }); return r.ok && !r.noTenure ? { years: r.tenure.years, maxLoan: r.maxLoan } : { years: 0, maxLoan: 0 }; });
o.hdbloan = (cases.hdbloan || []).map((c) => { const r = C.msr({ scenario: 'hdb-loan', borrowers: c.buyers, lease: c.lease }); return r.ok && !r.noTenure ? { years: r.tenure.years, maxLoan: r.maxLoan, ltv: r.ltv } : { noTenure: true }; });
o.mortgage = (cases.mortgage || []).map((c) => ({ monthly: C.mortgage({ loan: c.loan, ratePct: c.rate, years: c.years, lender: 'bank' }).monthly }));
o.cpf2 = (cases.cpf2 || []).map((c) => { const r = C.cpfSecondHome(c); return { usable: r.ok ? r.usable : null }; });
o.afford = (cases.afford || []).map((c) => { const r = A.assess(c.input); return { state: r.state, highest: r.state === 'ok' ? r.highest : null, borrow: r.borrow ? r.borrow.max : null }; });
o.sellfirst = (cases.sellfirst || []).map((c) => { const r = T.timeline(c.input); return { absd: r.ok ? r.duty.absd : null }; });
process.stdout.write(JSON.stringify(o));
