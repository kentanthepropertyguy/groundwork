'use strict';
/* C1 (24 Oct 2026) — the calculator accuracy corrections from the audit, one test per rule, plus the proof that everything else is unchanged.
   B1 married-couple ABSD remission and FTA nationality; B2 homes owned per buyer; B3 CPF for a second property; B4 borrowing capacity on the budget's basis
   (and the buy-first instalment in the Payment timeline); the related minor defects (a blank second buyer, a 55+ owner's share of the CPF refund).
   Unchanged: c1-unchanged.json holds the answers of the PRE-C1 engines (the live calculators) for 1,774 cases C1 must not move.
   Run from the site folder: node tools/financial-tests/c1-tests.js */
const fs = require('fs'), path = require('path');
const H = require('./harness.js')();
const { R, C, T, A } = H;
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } };
const sd = (o) => C.stampDuty(Object.assign({ price: 1500000, kind: 'private' }, o));
const SC = (n) => ({ res: 'SC', owned: n }), PR = (n) => ({ res: 'PR', owned: n }), FR = (n) => ({ res: 'FR', owned: n });

/* ---------- B1: married couple and FTA ---------- */
ok(sd({ buyers: [SC(0), PR(0)], couple: true }).absd === 0, 'B1 SC + PR married, neither owns: ABSD remitted in full');
ok(sd({ buyers: [SC(0), FR(0)], couple: true }).absd === 0, 'B1 SC + foreigner married, neither owns: remitted');
ok(sd({ buyers: [SC(0), PR(0)], couple: false }).absdRate === 0.05, 'B1 not married: the joint rule, 5%');
ok(sd({ buyers: [SC(1), PR(0)], couple: true }).absdRate === 0.20, 'B1 married, the Citizen owns one: 20% (IRAS table), not remitted');
ok(sd({ buyers: [SC(0), PR(1)], couple: true }).absdRate === 0.30, 'B1 married, the PR owns one: 30%');
ok(sd({ buyers: [PR(0), FR(0)], couple: true }).absdRate === 0.60, 'B1 PR + foreigner: no couple remission without a Citizen');
ok(sd({ buyers: [SC(0), PR(0), PR(0)], couple: true }).absdRate === 0.05, 'B1 a third buyer: not a couple buying in two names only');
ok(C.stampDuty({ price: 1500000, kind: 'ec', buyers: [SC(1), SC(1)], couple: true }).absd === 0, 'B1 new EC with a Citizen: still the HDB/EC remission');
{ const u = sd({ buyers: [SC(0), PR(0)] }); ok(u.absdRate === 0.05 && u.remissions.some((x) => x.id === 'couple'), 'B1 question not asked (Stamp duty page): full rate with the remitted total beside it, as before'); }
ok(sd({ buyers: [FR(0)].map((b) => Object.assign(b, { fta: true })) }).absd === 0, 'B1 FTA national, first home: Citizen rate 0%');
ok(sd({ buyers: [Object.assign(FR(1), { fta: true })] }).absdRate === 0.20, 'B1 FTA national owning one: Citizen second-home rate 20%');
ok(sd({ buyers: [Object.assign(PR(2), { fta: true })] }).absdRate === 0.30, 'B1 FTA PR owning two: Citizen third-home rate 30%');
ok(sd({ buyers: [Object.assign(FR(0), { fta: false })] }).remissions.length === 0, 'B1 FTA answered no: no FTA alternative shown');
ok(!sd({ buyers: [SC(1), SC(1)], couple: false }).notes.some((n) => n.id === 'refund'), 'B1 not married: no married-couple refund note');
ok(sd({ buyers: [SC(1), SC(1)], couple: true }).notes.some((n) => n.id === 'refund'), 'B1 married, one home each: the refund note stays');
{ const a = A.assess({ kind: 'completed', otp: '2026-11-01', couple: true, buyers: [{ res: 'SC', age: 35, fixed: 8000 }, { res: 'PR', age: 34, fixed: 7000 }], cash: 250000, cpf: 150000, home: 'none' });
  ok(a.budget === 1432000 && a.at.absd === 0 && a.at.coupleApplied, 'B1 What can I afford?: married SC + PR budget $1,432,000 (was $1,221,000)', a.budget); }
{ const t = T.timeline({ kind: 'new', price: 1500000, otp: '2026-11-01', buyers: [SC(0), PR(0)], couple: true, age: 35, cash: 600000, cpf: 0, order: 'none' });
  ok(t.ok && t.duty.absd === 0, 'B1 Payment timeline: married SC + PR pays no ABSD'); }

/* ---------- B2: homes owned per buyer ---------- */
const keepBase = { kind: 'completed', otp: '2026-11-01', cash: 600000, cpf: 0, home: 'keep', flat: { hasLoan: 'no' } };
{ const a = A.assess(Object.assign({}, keepBase, { buyers: [{ res: 'SC', age: 40, fixed: 9000, owned: 1 }, { res: 'PR', age: 38, fixed: 8000, owned: 0 }] }));
  ok(a.at.absdRate === 0.20, 'B2 Citizen owns, PR co-buyer owns nothing: 20%, not 30%', a.at.absdRate); }
{ const a = A.assess(Object.assign({}, keepBase, { buyers: [{ res: 'SC', age: 40, fixed: 9000, owned: 0 }, { res: 'SC', age: 38, fixed: 8000, owned: 1 }] }));
  ok(a.at.absdRate === 0.20, 'B2 only the co-buyer owns: 20%, not 0%', a.at.absdRate); }
{ const a = A.assess(Object.assign({}, keepBase, { buyers: [{ res: 'SC', age: 40, fixed: 9000, owned: 1 }, { res: 'SC', age: 38, fixed: 8000, owned: 1 }] }));
  ok(a.state === 'ask-flat' && a.ask[0] === 'joint', 'B2 both own: whose home is asked, never assumed', a.state); }
{ const s = { kind: 'completed', otp: '2026-11-01', cash: 900000, cpf: 0, home: 'sell', order: 'sell', homeJoint: false, otherLoans: 0, buyers: [{ res: 'SC', age: 40, fixed: 9000, owned: 1 }, { res: 'SC', age: 38, fixed: 8000, owned: 1 }], flat: { type: 'hdb', hasLoan: 'no', price: 700000, loan: 0, cpfRefund: 0 } };
  const a = A.assess(s); ok(a.state === 'ok' && a.at.absdRate === 0.20, 'B2 sold first: the co-buyer’s separate home still counts (20%)', [a.state, a.at && a.at.absdRate]);
  const b = A.assess(Object.assign({}, s, { homeJoint: true })); ok(b.state === 'ok' && b.at.absdRate === 0, 'B2 sold first, owned together: nobody owns a home at the purchase (0%)', [b.state, b.at && b.at.absdRate]); }
{ const base = { kind: 'completed', price: 1800000, otp: '2027-03-01', buyers: [SC(1), SC(1)], age: 40, ratePct: 3, cash: 900000, cpf: 100000, order: 'sell', sale: { cash: 200000, cpf: 100000 } };
  ok(T.timeline(Object.assign({}, base, { sale: Object.assign({}, base.sale, { owners: [0] }) })).duty.absd === 360000, 'B2 timeline: selling one buyer’s home leaves the other’s (20%)');
  ok(T.timeline(Object.assign({}, base, { sale: Object.assign({}, base.sale, { owners: [0, 1] }) })).duty.absd === 0, 'B2 timeline: a home owned together, sold first (0%)');
  const u = T.timeline(base); ok(u.duty.absd === 360000 && u.sellersCautious, 'B2 timeline: owners not said, the cautious (higher) ABSD');
  ok(T.timeline(Object.assign({}, base, { buyers: [SC(1), SC(0)] })).duty.absd === 0, 'B2 timeline: one owner, the home sold is theirs'); }
{ const legacy = A.assess({ kind: 'completed', otp: '2027-03-01', buyers: [{ res: 'SC', age: 45, fixed: 9000 }, { res: 'SC', age: 43, fixed: 7000 }], cash: 80000, cpf: 60000, home: 'sell', order: 'sell', owned: 1, flat: { type: 'hdb', hasLoan: 'yes', instalment: 1100, price: 650000, loan: 120000, cpfRefund: 310000 } });
  ok(legacy.budget === 2033000, 'B2 an older caller with one count for all buyers is read as before', legacy.budget); }

/* ---------- the schedule adapter (Payment timeline's first screen) agrees with the engine on B1 and B2 ---------- */
{ const S = H.S, cases = [
    { kind: 'new', price: 1500000, otp: '2027-03-01', buyers: [SC(0), PR(0)], couple: true },
    { kind: 'new', price: 1500000, otp: '2027-03-01', buyers: [SC(0), PR(0)], couple: false },
    { kind: 'completed', price: 1800000, otp: '2027-03-01', buyers: [SC(1), SC(1)], order: 'sell', saleOwners: [0] },
    { kind: 'completed', price: 1800000, otp: '2027-03-01', buyers: [SC(1), SC(1)], order: 'sell', saleOwners: [0, 1] },
    { kind: 'completed', price: 1800000, otp: '2027-03-01', buyers: [SC(1), SC(1)], order: 'sell' },
    { kind: 'completed', price: 1800000, otp: '2027-03-01', buyers: [Object.assign(FR(0), { fta: true })] }];
  cases.forEach((c, k) => { const s = S.schedule(c), t = T.timeline(Object.assign({ age: 40, ratePct: 3, cash: 3e6, cpf: 0, order: c.order || 'none', sale: c.order === 'sell' ? { cash: 0, cpf: 0, owners: c.saleOwners } : undefined }, c));
    ok(s.ok && t.ok && s.duty.absd === t.duty.absd, 'schedule = engine ABSD, case ' + k, [s.duty && s.duty.absd, t.duty && t.duty.absd]); }); }

/* ---------- B3: CPF for a second property ---------- */
ok(R.cpfRetirementSums[2026].brs === 110200 && R.cpfRetirementSums[2026].frs === 220400 && R.cpfRetirementSums[2027].brs === 114100, 'B3 retirement sums in the rules file (CPF Board)');
{ const r = C.cpfSecondHome({ year: 2026, cover95: true, members: [{ oa: 120000, sa: 70000 }] }); ok(r.ok && r.usable === 79800 && r.sumName === 'BRS', 'B3 BRS: OA above (BRS less SA)', r.usable); }
{ const r = C.cpfSecondHome({ year: 2026, cover95: false, members: [{ oa: 300000, sa: 50000 }] }); ok(r.usable === 129600 && r.sumName === 'FRS', 'B3 no home lasts to 95: FRS', r.usable); }
{ const r = C.cpfSecondHome({ year: 2026, cover95: null, members: [{ oa: 300000, sa: 50000 }] }); ok(r.usable === 129600 && r.cautious, 'B3 not known: FRS, the cautious side'); }
{ const r = C.cpfSecondHome({ year: 2026, cover95: true, members: [{ oa: 100000, sa: 0, ra: 120000 }] }); ok(r.usable === 100000, 'B3 the Retirement Account counts towards the set-aside'); }
{ const r = C.cpfSecondHome({ year: 2026, cover95: true, members: [{ oa: 50000, sa: 0 }, { oa: 70000, subject: false }] }); ok(r.usable === 70000, 'B3 a buyer who owns no other home is not held back'); }
{ const r = C.cpfSecondHome({ year: 2031, cover95: true, members: [{ oa: 200000, sa: 0 }] }); ok(r.year === 2027 && r.outdated, 'B3 a later year uses the latest sums in the file and says so'); }
ok(!C.cpfSecondHome({ year: 2026, members: [{ oa: 100000 }] }).ok, 'B3 a missing SA balance is asked, never taken as 0');
{ const s = { kind: 'completed', otp: '2026-11-01', homeJoint: true, buyers: [{ res: 'SC', age: 45, fixed: 9000, owned: 1 }, { res: 'SC', age: 43, fixed: 7000, owned: 1 }], cash: 400000, cpf: 240000, home: 'keep', flat: { hasLoan: 'yes', instalment: 1100 } };
  ok(A.assess(s).state === 'ask-cpf', 'B3 keeping a home with CPF planned: the balances are asked (the full OA is not assumed)');
  const b = A.assess(Object.assign({}, s, { cover95: true, cpfBal: [{ oa: 120000, sa: 70000 }, { oa: 120000, sa: 70000 }] }));
  ok(b.budget === 724000 && b.at.cpfUsable === 159600, 'B3 BRS: CPF counted $159,600, budget $724,000 (was $827,000)', [b.budget, b.at.cpfUsable]);
  const f = A.assess(Object.assign({}, s, { cover95: null, cpfBal: [{ oa: 120000, sa: 70000 }, { oa: 120000, sa: 70000 }] }));
  ok(f.budget === 519000, 'B3 not sure about 95: FRS, budget $519,000', f.budget);
  const c = A.assess(Object.assign({}, s, { cpf: 50000, cover95: true, cpfBal: [{ oa: 120000, sa: 70000 }, { oa: 120000, sa: 70000 }] }));
  ok(c.at.cpfUsable === 50000, 'B3 never more than the CPF the buyer plans to use'); }
{ const s = { kind: 'completed', otp: '2026-11-01', buyers: [{ res: 'SC', age: 45, fixed: 9000, owned: 1 }], cash: 200000, cpf: 100000, home: 'sell', order: 'sell', flat: { type: 'hdb', hasLoan: 'no', price: 600000, loan: 0, cpfRefund: 200000 } };
  ok(A.assess(s).state === 'ok', 'B3 sold first: no home is owned at the purchase, so no set-aside is asked'); }

/* ---------- B4: borrowing capacity on the budget's basis; the buy-first instalment ---------- */
{ const s = { kind: 'completed', otp: '2026-11-01', homeJoint: true, buyers: [{ res: 'SC', age: 38, fixed: 9000, owned: 1 }, { res: 'SC', age: 36, fixed: 7000, owned: 1 }], cash: 300000, cpf: 0, home: 'sell', order: 'unsure', flat: { type: 'hdb', hasLoan: 'yes', instalment: 2000, price: 600000, loan: 150000, cpfRefund: 250000 } };
  const a = A.assess(s), t = C.tdsr({ kind: 'private', borrowers: [{ age: 38, fixed: 9000 }, { age: 36, fixed: 7000 }], debts: 2000, loans: 0, tenure: a.years });
  ok(a.basis === 'keep' && Math.abs(a.borrow.max - t.maxLoan) < 0.01 && Math.abs(a.borrow.max - a.at.incomeLoan) < 0.01, 'B4 borrowing capacity counts the flat’s instalment on the kept-home basis ($1.35m, not $1.74m)', [a.borrow.max, t.maxLoan]);
  const sf = A.assess(Object.assign({}, s, { order: 'sell' })), t0 = C.tdsr({ kind: 'private', borrowers: [{ age: 38, fixed: 9000 }, { age: 36, fixed: 7000 }], debts: 0, loans: 0, tenure: sf.years });
  ok(sf.basis === 'sell' && Math.abs(sf.borrow.max - t0.maxLoan) < 0.01, 'B4 sold first: the flat’s instalment is not counted'); }
{ const base = { kind: 'new', price: 1500000, otp: '2026-11-01', buyers: [SC(1)], age: 40, ratePct: 3, cash: 700000, cpf: 0, order: 'buy', flatLoan: 'outstanding', sale: { month: 6, cash: 300000, cpf: 0 } };
  const w = T.timeline(Object.assign({}, base, { flatInstal: 1500 })), n = T.timeline(base);
  const months = w.series.filter((x) => x.oldInstalment).length;
  ok(months === 6 && w.series.filter((x) => x.oldInstalment).every((x) => x.date <= w.saleDate), 'B4 timeline: the flat’s instalment is paid each month until the sale completes', months);
  ok(w.headline.peak > n.headline.peak, 'B4 timeline: the overlap months cost money');
  ok(T.timeline(Object.assign({}, base, { flatInstal: 1500, flatLoan: 'none' })).flatInstal === undefined, 'B4 timeline: a fully paid flat has no instalment');
  ok(T.timeline(Object.assign({}, base, { flatInstal: 1500, order: 'sell', sale: { cash: 300000, cpf: 0 } })).flatInstal === undefined, 'B4 timeline: sold first, no overlap'); }

/* ---------- related minor defects ---------- */
{ const a = A.assess({ kind: 'completed', otp: '2026-11-01', buyers: [{ res: 'SC', age: 35, fixed: 15000 }, { res: 'FR' }], cash: 400000, cpf: 200000, home: 'none' });
  ok(a.at.absdRate === 0.60, 'minor: a second buyer with no income still counts for ABSD (60%)', a.at.absdRate); }
{ const f = { type: 'hdb', price: 700000, loan: 100000, cpfRefund: 300000 };
  ok(C.saleEstimate(f, { owner55: true }).cpf === 0, 'minor: an owner 55+, share not given: no refund counted (as before)');
  ok(C.saleEstimate(Object.assign({}, f, { cpfRefund55: 180000 }), { owner55: true }).cpf === 120000, 'minor: the younger owner’s part of the refund is counted');
  ok(C.saleEstimate(Object.assign({}, f, { cpfRefund55: 180000 }), { owner55: false }).cpf === 300000, 'minor: no owner 55+: the whole refund'); }

/* ---------- unchanged: the pre-C1 engines' answers ---------- */
{ const U = JSON.parse(fs.readFileSync(path.join(__dirname, 'c1-unchanged.json'), 'utf8'));
  const pick = (fn, r) => fn === 'stampDuty' ? { bsd: r.bsd, absd: r.absd, total: r.total, rem: (r.remissions || []).map((x) => [x.id, x.total]) } : fn === 'ssd' ? { ssd: r.ok ? r.ssd : null } : fn === 'tdsr' || fn === 'msr' ? { maxLoan: r.ok && !r.noTenure ? Math.round(r.maxLoan * 100) / 100 : null, ltv: r.ltv } : fn === 'mortgage' ? { monthly: Math.round(r.monthly * 100) / 100 } : { state: r.state, budget: r.budget, highest: r.highest, borrow: r.borrow ? Math.round(r.borrow.max * 100) / 100 : null };
  let same = 0, moved = [];
  U.rows.forEach(([fn, i, want]) => { const got = pick(fn, fn === 'assess' ? A.assess(JSON.parse(JSON.stringify(i))) : C[fn](JSON.parse(JSON.stringify(i)))); if (JSON.stringify(got) === JSON.stringify(want)) same++; else moved.push([fn, want, got]); });
  ok(moved.length === 0, 'unchanged: ' + same + ' of ' + U.rows.length + ' pre-C1 answers are identical', moved.slice(0, 3)); }

console.log('c1-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
