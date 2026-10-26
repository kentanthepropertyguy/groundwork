/* ==========================================================================
   GROUNDWORK — Financial Experience V3 (25 Oct 2026): the three answers, worked out from one set of entries.
     borrow(st)  How much can I borrow?          GW_CALC.tdsr / GW_CALC.msr
     afford(st)  What can I afford?              GW_ANSWER.assess
     pay(st)     How much do I pay, and when?    GW_SCHEDULE.schedule, and (optional) GW_TIMELINE.timeline for the funding check
   This module adds no rule, rate, band or limit. It turns the buyer's few entries into the inputs the audited engines already take, and reads back
   the figures the page shows. No DOM, no storage, no network. UMD: window.GW_FIN3 in the browser (after gw-rules, gw-calc, gw-timeline, gw-answer,
   gw-schedule); in Node, require() returns the factory: call it with (GW_RULES, GW_CALC, GW_TIMELINE, GW_ANSWER, GW_SCHEDULE).

   The entries (st), shared by the three pages:
     n: 1 | 2                         one or two people
     p: [{ age, fixed, variable, res: 'SC'|'PR'|'FR'|'FTA', nb }]   per person; nb = second person buys but does not borrow (stamp duty only)
     loans: [{ type: 'home'|'other', who: 0|1, amt }]            monthly repayments already being paid, each person's own
     cash, cpf                        cash and CPF OA that can go into the purchase now
     homes: 0 | 1 | 2                 homes the buyers own now (2 = two or more); whose: 'both'|'0'|'1' (two people)
     plan: 'keep' | 'sell'            what happens to the home owned (affordability: sell = sold before buying, its proceeds counted)
     sale: { type, price, loan, cpfRefund }                     the sale figures, only when the buyer adds them
     couple: true | false | undefined married, buying in two names (asked only when it changes ABSD)
     cpfBal: [{ oa, sa }], cover95    CPF balances, only when CPF is used while a home is still owned (CPF Board set-aside)
     ratePct (default 4), years (blank = longest standard)
     bkind: 'private'|'hdb'|'ec', hdbLoan: 'hdb'|'bank'           How much can I borrow?
     akind: 'new'|'completed'|'hdb', price, valuation              What can I afford? (price: optional, a price to check)
     pkind: 'new'|'ec'|'completed'|'resaleec'|'hdb', otp, noDate, top, csc, completion,
     order: 'none'|'buy'|'sell', saleWhen: 'unsure'|'date'|'afterKeys', saleMonth, saleDate, saleAfter, refund, rent    Payments and dates
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.GW_FIN3 = factory(root.GW_RULES, root.GW_CALC, root.GW_TIMELINE, root.GW_ANSWER, root.GW_SCHEDULE);
})(typeof self !== 'undefined' ? self : this, function (R, C, T, A, S) {
  'use strict';
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
  const has = (x) => num(x) !== null;
  const nn = (x) => (has(x) && x > 0 ? x : 0);
  const people = (st) => (st.n === 2 ? [0, 1] : [0]).map((k) => Object.assign({ k: k }, (st.p || [])[k] || {}));

  /* ---------------- the borrowers and what they already pay ---------------- */
  // Who borrows: everyone, except a second person marked as buying without borrowing.
  function borrowersOf(st) { return people(st).filter((x) => !(x.k === 1 && x.nb)); }
  // the repayments of the people who borrow (a non-borrower's own loans never reduce what the borrowers can borrow)
  function loansOf(st) {
    const who = borrowersOf(st).map((x) => x.k);
    const L = (st.loans || []).filter((l) => l && has(l.amt) && l.amt > 0 && who.indexOf(st.n === 2 ? (+l.who || 0) : 0) >= 0);
    const home = L.filter((l) => l.type === 'home'), other = L.filter((l) => l.type !== 'home');
    const add = (a) => a.reduce((s, l) => s + l.amt, 0);
    return { list: L, home: home.length, homeAmt: add(home), otherAmt: add(other), total: add(L) };
  }
  // what is still missing before a figure can be worked out: an age and an income (0 is an answer) for every borrower
  function needOf(st) {
    const need = [];
    borrowersOf(st).forEach((x) => { if (!has(x.age)) need.push('p.' + x.k + '.age'); if (!has(x.fixed) && !has(x.variable)) need.push('p.' + x.k + '.fixed'); });
    return need;
  }
  const engineBorrowers = (st) => borrowersOf(st).map((x) => ({ age: x.age, fixed: nn(x.fixed), variable: nn(x.variable) }));

  /* ---------------- 1. How much can I borrow? ---------------- */
  // An indicative borrowing capacity from income and existing repayments (TDSR, with MSR for an HDB flat or a new EC), over the tenure the age allows.
  // A property-specific loan limit (a share of the price) is separate: priceLoan(P) says what a bank could lend on a given price.
  function borrowRun(st, debtsOff) {
    const B = engineBorrowers(st), L = loansOf(st), kind = st.bkind === 'hdb' ? 'hdb' : st.bkind === 'ec' ? 'ec' : 'private';
    const homeAmt = debtsOff ? 0 : L.homeAmt, otherAmt = debtsOff ? 0 : L.otherAmt, years = has(st.years) ? st.years : undefined, rate = has(st.ratePct) ? st.ratePct : undefined;
    // V3.4: the household and the remaining lease, as the HDB and EC loan limit page asked them (it is folded in here); no household chosen = 'family', that page's default
    const household = ['family', 'extended', 'single'].indexOf(st.household) >= 0 ? st.household : 'family', lease = has(st.lease) && st.lease > 0 ? st.lease : undefined;
    if (kind === 'hdb' && st.hdbLoan !== 'bank') return C.msr({ scenario: 'hdb-loan', household: household, borrowers: B, propertyLoans: homeAmt, otherDebts: otherAmt, tenure: years, lease: lease });
    if (kind === 'hdb') return C.tdsr({ kind: 'hdb', borrowers: B, debts: homeAmt + otherAmt, propertyLoans: homeAmt, loans: L.home, tenure: years, quotedRatePct: rate });
    if (kind === 'ec') return C.msr({ scenario: 'ec', borrowers: B, propertyLoans: homeAmt, otherDebts: otherAmt, loans: L.home, tenure: years, quotedRatePct: rate });
    return C.tdsr({ kind: 'private', borrowers: B, debts: homeAmt + otherAmt, loans: L.home, tenure: years, quotedRatePct: rate });
  }
  function borrow(st, o) {
    let ageAssumed = false;
    if (o && o.assumeAge) {   // the borrowing page shows its answer from the income alone: a missing age is taken as the latest age at which the standard tenure still ends by 65, and the page says so
      const A0 = Math.max(21, R.bankLtv.endAge - R.bankLtv.standardTenure.private);
      st = Object.assign({}, st, { p: (st.p || []).map((x, k) => (borrowersOf(st).some((b) => b.k === k) && !has((x || {}).age) ? (ageAssumed = true, Object.assign({}, x, { age: A0 })) : x)) });
    }
    const res = borrowCore(st); if (res && typeof res === 'object') res.ageAssumed = ageAssumed; return res;
  }
  function borrowCore(st) {
    const need = needOf(st);
    if (need.length) return { state: 'need', need: need };
    if (!engineBorrowers(st).some((b) => b.fixed > 0 || b.variable > 0)) return { state: 'zero', maxLoan: 0 };   // $0 income typed: an answer, and no bank loan
    const r = borrowRun(st);
    if (!r.ok) return { state: 'invalid', errors: (r.invalid || []).map((x) => ({ key: x.field === 'age' ? 'p.0.age' : x.field === 'income' ? 'p.0.fixed' : x.field, text: x.text })), need: r.missing || [] };
    const L = loansOf(st), kind = st.bkind === 'hdb' ? (st.hdbLoan === 'bank' ? 'hdb-bank' : 'hdb-loan') : st.bkind === 'ec' ? 'ec' : 'private';
    if (r.noTenure) return { state: 'notenure', kind: kind, cause: r.cause, B: r.B };
    const years = r.tenure.years, ratePct = has(st.ratePct) ? st.ratePct : (kind === 'hdb-loan' ? R.hdbLoanRate * 100 : 4);
    const r0 = L.total > 0 ? borrowRun(st, true) : null;
    const maxLoan = r.maxLoan, monthly = C.instal(maxLoan, ratePct / 100, years);
    // the age effect: the standard tenure for this kind of loan, and whether the age shortens it
    const full = kind === 'hdb-loan' ? R.hdbLoan.maxTenureYears : kind === 'hdb-bank' ? R.bankLtv.standardTenure.hdb : R.bankLtv.standardTenure.private;
    const ageCut = !has(st.years) && years < full ? { years: years, full: full } : null;
    const binding = kind === 'hdb-loan' ? 'msr' : (r.binding === 'msr' ? 'msr' : 'tdsr');
    return { state: 'ok', kind: kind, maxLoan: maxLoan, years: years, ratePct: ratePct, testRatePct: r.rate * 100, monthly: monthly, binding: binding, share: binding === 'msr' ? R.msr : R.tdsr,
      income: r.B.gross, counted: r.B.assessable, joint: r.B.list.length > 1, age: r.B.list.length > 1 ? (kind === 'hdb-loan' ? r.B.avgAge : r.B.iwaaUse) : r.B.list[0] ? r.B.list[0].age : null,
      ageUnverified: !!r.B.ageUnverified && kind !== 'hdb-loan', debts: L.total, homeLoans: L.home, debtsCut: r0 && r0.ok && !r0.noTenure ? Math.max(0, r0.maxLoan - maxLoan) : 0, ageCut: ageCut,
      ltv: r.ltv, minCash: r.minCash, longer: r.longer || null, notes: (r.notes || []).filter((x) => ['commitments', 'lease-unknown', 'ec-ceiling', 'ceiling', 'single-age'].indexOf(x.id) < 0),
      // HDB loan eligibility, as the HDB and EC loan limit page reported it: 'age' (singles under 35) leads, then 'ceiling' (household income above HDB's ceiling); the loan is then theoretical
      household: r.household || null, ceiling: r.ceiling || null, lease: r.tenure && r.tenure.lease ? r.tenure.lease : null, youngest: r.B.youngest,
      elig: kind !== 'hdb-loan' ? '' : (r.notes || []).some((x) => x.id === 'single-age') ? 'age' : (r.ceiling && (r.notes || []).some((x) => x.id === 'ceiling') ? 'ceiling' : '') };
  }
  // what a bank could lend on one price: the lower of the borrowing capacity and the loan limit at that price (the loan-to-value share)
  function priceLoan(b, P) {
    if (!b || b.state !== 'ok' || !(P > 0)) return null;
    const limit = P * b.ltv, loan = Math.min(b.maxLoan, limit);
    return { price: P, limit: limit, loan: loan, own: P - loan, by: loan < limit - 0.5 ? 'income' : 'ltv', ltv: b.ltv };
  }

  /* ---------------- 2. What can I afford? ---------------- */
  // homes each person owns now, from the household answer (how many, and whose)
  function ownedOf(st) {
    const h = Math.max(0, Math.min(2, Math.round(nn(st.homes))));
    if (st.n !== 2) return [h];
    return st.whose === '0' ? [h, 0] : st.whose === '1' ? [0, h] : [h, h];
  }
  const resOf = (x) => (x.res === 'FTA' ? 'FR' : x.res || 'SC');
  const ftaOf = (x) => (x.res === 'FTA' ? true : undefined);
  // the entries as GW_ANSWER.assess reads them. Ownership, housing loans and the sale are separate answers there; here they come from the few questions asked:
  // the homes owned (and whose), the home-loan repayments in the list (the first is the home's own loan, any others are loans on other homes), and the sale when added.
  function toAssess(st) {
    const own = ownedOf(st), L = loansOf(st), homeLoans = L.list.filter((l) => l.type === 'home');
    const sell = st.homes >= 1 && st.plan === 'sell';
    const s = { kind: st.akind === 'completed' ? 'completed' : st.akind === 'hdb' ? 'hdb' : 'new',
      buyers: people(st).map((x) => { const b = { res: resOf(x), fta: ftaOf(x), owned: own[x.k] }; if (!(x.k === 1 && x.nb)) { b.age = x.age; b.fixed = x.fixed; b.variable = x.variable; } return b; }),
      debts: L.otherAmt, ratePct: has(st.ratePct) ? st.ratePct : 4, years: has(st.years) ? st.years : undefined, cash: st.cash, cpf: st.cpf, saveMo: has(st.saveMo) ? st.saveMo : undefined, cpfMo: has(st.cpfMo) ? st.cpfMo : undefined,
      home: !(st.homes >= 1) ? 'none' : sell ? 'sell' : 'keep', couple: st.couple, cpfBal: st.cpfBal, cover95: st.cover95,
      price: has(st.price) && st.price > 0 ? st.price : undefined, valuation: st.akind === 'completed' && has(st.valuation) ? st.valuation : undefined };
    if (st.homes >= 1) {
      s.homeJoint = st.n === 2 ? st.whose === 'both' : undefined;
      // the home's own loan: the first home-loan repayment listed (none listed = no loan on it); the others are loans on other homes the buyers own
      const sl = st.sale || {};
      s.flat = { hasLoan: homeLoans.length ? 'yes' : 'no', instalment: homeLoans.length ? homeLoans[0].amt : 0, type: sl.type === 'private' ? 'private' : 'hdb', price: sl.price, loan: sl.loan, cpfRefund: sl.cpfRefund, heldOver4: sl.type === 'private' && sl.held === true ? true : undefined };
      // Sale proceeds' own cash and CPF (own commission, legal fees, SSD) when it handed them over; otherwise the same engine works the sale out here
      if (has(sl.oCash)) { s.flat.overrideCash = sl.oCash; s.flat.overrideCpf = has(sl.oCpf) ? sl.oCpf : 0; s.flat.cpfRefund55 = 0; }   // V3.5: oCpf is already the usable CPF (55+ rule applied in sell())
      const extra = homeLoans.slice(1);
      if (own.some((c) => c >= 2) || (st.n === 2 && st.whose === 'both' && st.homes >= 2)) { s.otherLoans = Math.min(2, extra.length); s.otherInstal = extra.reduce((a, l) => a + l.amt, 0); }
      else if (extra.length) s.debts += extra.reduce((a, l) => a + l.amt, 0);   // a second home loan with no second home: still a monthly repayment
      if (sell) s.order = 'sell';
    } else if (homeLoans.length) s.debts += L.homeAmt;   // a home loan with no home owned (e.g. a guarantor's share): counted as a repayment
    return s;
  }
  function afford(st) {
    const s = toAssess(st);
    if (s.kind === 'hdb') return { state: 'hdb' };
    const need = needOf(st);
    if (need.length) return { state: 'need', need: need };
    const r = A.assess(s);
    const out = { state: r.state, r: r, s: s };
    if (r.borrow) out.borrow = r.borrow;
    if (r.state === 'ok') {
      const at = r.at, top = r.priceIsOwn ? (r.atComfortable || r.atHighest) : at;
      out.budget = r.budget; out.highest = r.highest; out.limitedBy = r.limitedBy; out.years = r.years; out.ratePct = r.ratePct;
      out.top = { price: r.budget, loan: top.loan, monthly: top.monthly, cashOnly: top.cashOnly, cpfUsed: Math.min(top.haveCpf, top.flexNeed), cashNeed: top.cashOnly + Math.max(0, top.flexNeed - Math.min(top.haveCpf, top.flexNeed)), duty: top.duty, absd: top.absd, ltv: top.ltv, limit: top.limit };
      if (r.priceIsOwn) out.quote = { price: r.price, zone: r.zone, gap: at.gap, cashShort: at.cashShort, loan: at.loan, monthly: at.monthly, duty: at.duty, absd: at.absd, cashNeed: at.cashOnly + Math.max(0, at.flexNeed - Math.min(at.haveCpf, at.flexNeed)), cpfUsed: Math.min(at.haveCpf, at.flexNeed), projected: at.gap <= 0.5 && at.covered === false, firstAmt: at.firstAmt, firstCause: at.firstCause, firstGap: at.firstGap, fixes: r.fixes || null };
      out.estimate = r.estimate; out.sale = r.sale; out.saleCounted = r.saleCounted; out.beneath = r.beneath; out.ifPaid = r.ifPaid || null;
    } else if (r.state === 'ask-cpf') out.cpfNeed = r.cpfNeed;
    else if (r.state === 'out-of-reach') out.lever = r.lever;
    return out;
  }

  /* ---------------- 3. How much do I pay, and when? ---------------- */
  const engineKind = (k) => (k === 'resaleec' ? 'completed' : k === 'ec' ? 'ec' : k === 'completed' ? 'completed' : 'new');
  // the buyers for stamp duty: residency and homes owned at the purchase (sold first: the home sold no longer counts for its owners)
  function dutyBuyers(st) {
    const own = ownedOf(st), sellFirst = st.homes >= 1 && st.order === 'sell';
    return people(st).map((x) => ({ res: resOf(x), fta: ftaOf(x), owned: Math.max(0, own[x.k] - (sellFirst && own[x.k] >= 1 ? 1 : 0)) }));
  }
  function schedule(st) {
    if (st.pkind === 'hdb') return { ok: false, hdb: true };
    if (!(st.price > 0)) return { ok: false, need: ['price'] };
    if (!st.noDate && !st.otp) return { ok: false, need: ['otp'] };
    const dates = { mode: 'grouped', top: st.top || undefined, csc: st.csc || undefined, completion: st.completion || undefined };
    return S.schedule({ kind: engineKind(st.pkind), price: st.price, otp: st.noDate ? undefined : st.otp, undated: !!st.noDate, buyers: dutyBuyers(st).map((b) => ({ res: b.res, fta: b.fta, owned: b.owned })), couple: st.couple, dates: dates });
  }
  // the funding check's engine input (the same fields the V2 timeline used), and the loan sized to what the income supports
  function timelineInput(st, over) {
    st = Object.assign({}, st, over || {});
    const B = engineBorrowers(st), Bc = C.borrowers(B), L = loansOf(st), own = ownedOf(st);
    const age = B.length === 1 ? B[0].age : (Bc.iwaaUse !== null && !Bc.bad.length ? Bc.iwaaUse : Math.max.apply(null, B.map((b) => b.age)));
    const order = st.homes >= 1 ? (st.order === 'buy' || st.order === 'sell' ? st.order : 'none') : 'none';
    const sw = st.saleWhen || 'unsure';
    const i = { kind: engineKind(st.pkind), uiKind: st.pkind, price: st.price, otp: st.noDate ? undefined : st.otp, undated: !!st.noDate, buyers: people(st).map((x) => ({ res: resOf(x), fta: ftaOf(x), owned: own[x.k] })), couple: st.couple,
      age: age, ratePct: has(st.ratePct) ? st.ratePct : 4, years: has(st.years) ? st.years : undefined, cash: nn(st.cash), cpf: nn(st.cpf), saveMo: nn(st.saveMo), cpfMo: nn(st.cpfMo), payInstalmentFromCpf: true,
      order: order, sale: { cash: 0, cpf: 0, removesOwnership: true }, flatLoan: 'none', loansOther: 0, prefLoan: has(st.loanAmt) ? st.loanAmt : undefined,
      dates: { mode: 'grouped', top: st.top || undefined, csc: st.csc || undefined, completion: st.completion || undefined },
      valuation: (st.pkind === 'completed' || st.pkind === 'resaleec') && has(st.valuation) ? st.valuation : undefined, refund: { assume: false }, rent: { monthly: 0 } };
    // the home being sold (or kept): its loan counts for the loan limit while it is owned; its instalment is paid until it sells
    const homeLoans = L.list.filter((l) => l.type === 'home');
    if (order === 'buy') {
      i.flatLoan = homeLoans.length ? 'outstanding' : 'none'; i.flatInstal = homeLoans.length ? homeLoans[0].amt : 0;
      i.loansOther = Math.min(2, Math.max(0, homeLoans.length - 1));
      if (sw === 'unsure') i.sale.undecided = true;
      else if (sw === 'afterKeys') i.sale.afterKeys = has(st.saleAfter) ? st.saleAfter : 3;
      else if (st.saleDate) i.sale.date = st.saleDate; else i.sale.month = has(st.saleMonth) && st.saleMonth > 0 ? st.saleMonth : 5;
      if (sw !== 'unsure' && st.refund) i.refund = { assume: true, monthsAfterSale: 2 };
    } else if (order === 'sell') {
      i.loansOther = Math.min(2, Math.max(0, homeLoans.length - 1));
      if (has(st.rent) && st.rent > 0) i.rent = { monthly: st.rent };
    } else i.loansOther = Math.min(2, homeLoans.length);   // homes kept: every home loan still counts
    // the sale money: counted only when the sale has a date (or is sold first) and its figures are in (C.saleEstimate never invents the CPF refund)
    if (order === 'sell' || (order === 'buy' && sw !== 'unsure')) {
      const sl = st.sale || {};
      const est = C.saleEstimate({ type: sl.type === 'private' ? 'private' : 'hdb', price: sl.price, loan: sl.loan, cpfRefund: sl.cpfRefund, heldOver4: sl.type === 'private' && sl.held === true ? true : undefined, overrideCash: has(sl.oCash) ? sl.oCash : undefined, overrideCpf: has(sl.oCash) ? (has(sl.oCpf) ? sl.oCpf : 0) : undefined },
        { owner55: B.some((b) => b.age >= 55), today: new Date().toISOString().slice(0, 10) });
      i.saleEst = est; if (est.counted) { i.sale.cash = Math.max(0, est.cash); i.sale.cpf = est.cpf; }
    }
    // other repayments the bank counts (the home being sold, buying first, is counted by the engine through flatInstal)
    i.debtsOther = L.otherAmt; i.debtsHome = order === 'none' ? L.homeAmt : homeLoans.slice(1).reduce((a, l) => a + l.amt, 0);
    i.bors = B; i.gross = Bc.gross;
    // CPF while a buyer still owns a home at the purchase: only the OA above the retirement-sum set-aside can be used (CPF Board), per member; the balances are asked, never assumed
    const at = dutyBuyers(st).map((d) => d.owned), subj = at.map((c) => c >= 1);
    if (i.cpf > 0 && subj.some(Boolean)) {
      const yr = /^\d{4}/.test(String(i.otp || '')) ? +String(i.otp).slice(0, 4) : new Date().getFullYear(), bal = st.cpfBal || [];
      const chk = C.cpfSecondHome({ year: yr, cover95: st.cover95 === true ? true : st.cover95 === false ? false : null, members: people(st).map((x, k) => ({ oa: bal[k] ? bal[k].oa : undefined, sa: bal[k] ? bal[k].sa : undefined, age: x.age, subject: subj[k] })) });
      i.cpfCheck = chk; i.cpfPlanned = i.cpf; if (chk.ok) i.cpf = Math.min(i.cpf, chk.usable);
    }
    return i;
  }
  // the income-supported loan for this purchase: TDSR (with MSR for a new EC from the developer). A resale EC is bought after its minimum occupation period, when MSR no longer applies.
  function incomeLoan(i, loans) {
    if (!(i.gross > 0)) return 0;
    const fi = i.order === 'buy' && i.flatInstal > 0 ? i.flatInstal : 0;
    const r = i.uiKind === 'ec' ? C.msr({ scenario: 'ec', borrowers: i.bors, propertyLoans: fi + i.debtsHome, otherDebts: i.debtsOther, tenure: i.years, loans: loans, quotedRatePct: i.ratePct })
      : C.tdsr({ kind: 'private', borrowers: i.bors, debts: i.debtsOther + i.debtsHome + fi, loans: loans, tenure: i.years, quotedRatePct: i.ratePct });
    return r.ok && !r.noTenure ? r.maxLoan : 0;
  }
  function funding(st, over) {
    const need = needOf(Object.assign({}, st, over || {}));
    if (need.length) return { ok: false, need: need };
    const i = timelineInput(st, over);
    if (!(i.price > 0) || (!i.otp && !i.undated)) return { ok: false, need: ['price'] };
    if (i.cpfCheck && !i.cpfCheck.ok) return { ok: false, needCpf: true, i: i };
    const rule = T.timeline(i);
    if (!rule.ok) return { ok: false, engine: rule, i: i };
    const lim = incomeLoan(i, rule.loan.loans);
    let r = rule, capped = false;
    if (lim < rule.loan.loanMax - 0.5) { const r2 = T.timeline(Object.assign({}, i, { loanCap: lim })); if (r2.ok) { r = r2; capped = true; } }
    return { ok: true, r: r, i: i, capped: capped, limit: Math.min(lim, rule.loan.ruleLoanMax !== undefined ? rule.loan.ruleLoanMax : rule.loan.loanMax), ruleLoan: rule.loan.loanMax };
  }

  /* ---------------- 3a. What will this home cost me? (price first: no date, no income needed) ---------------- */
  // The cash, the CPF and the monthly instalment for one price, from GW_CALC.progressive (the loan limit, the minimum cash, stamp duty and the instalment).
  // The loan is the one typed, never above the limit at that price; blank, the most allowed (and, once the borrowers' incomes are in, what the income supports).
  // With no age entered the loan is taken to end by age 65 (the standard limit), and the answer says so until an age is entered.
  function cost(st, over) {
    st = Object.assign({}, st, over || {});
    if (st.pkind === 'hdb') return { state: 'hdb' };
    if (!(st.price > 0)) return { state: 'need', need: ['price'] };
    const kind = engineKind(st.pkind), bs = engineBorrowers(st), L = loansOf(st);
    const aged = bs.length && bs.every((b) => has(b.age)), withInc = aged && bs.some((b) => b.fixed > 0 || b.variable > 0);
    const Bc = withInc ? C.borrowers(bs) : null;
    const years0 = has(st.years) ? st.years : undefined, std = R.bankLtv.standardTenure.private;
    let age = aged ? (bs.length === 1 ? bs[0].age : (Bc && Bc.iwaaUse !== null ? Bc.iwaaUse : Math.max.apply(null, bs.map((b) => b.age)))) : null;
    const ageAssumed = age === null;
    if (ageAssumed) age = Math.max(21, R.bankLtv.endAge - (years0 || std));   // the oldest age at which this tenure still ends by 65: the standard limit, said on the page
    const ratePct = has(st.ratePct) ? st.ratePct : 4;
    const P = st.price, base = { price: P, age: age, years: years0, ratePct: ratePct, loans: L.home, kind: kind === 'ec' ? 'ec' : 'private', buyers: dutyBuyers(st), couple: st.couple, valuation: kind === 'completed' && has(st.valuation) ? st.valuation : undefined };
    const rule = C.progressive(base);
    if (!rule.ok) return { state: 'invalid', errors: rule.invalid || [], need: rule.missing || [] };
    // what the income supports, once the borrowers' ages and incomes are in (TDSR; MSR with it for a new EC); it limits a blank loan and flags a typed one above it
    let incomeCap = null;
    if (withInc) { const i = { gross: Bc.gross, bors: bs, uiKind: st.pkind, order: 'none', debtsOther: L.otherAmt, debtsHome: L.homeAmt, years: rule.years, ratePct: ratePct }; incomeCap = incomeLoan(i, L.home); }
    const typed = has(st.loanAmt) ? st.loanAmt : null;
    const want = typed !== null ? typed : (incomeCap !== null ? Math.min(incomeCap, rule.loanMax) : rule.loanMax);
    const prog = want < rule.loanMax - 0.5 ? C.progressive(Object.assign({}, base, { loanCap: want })) : rule;
    if (!prog.ok) return { state: 'invalid', errors: prog.invalid || [] };
    const loan = prog.loanMax, flex = prog.cpfOrCash, cov = prog.cov || 0;
    const cpfIn = has(st.cpf) ? st.cpf : 0, cpfUsed = Math.min(cpfIn, flex), downCash = prog.cashMin + cov + (flex - cpfUsed), duty = prog.duty;
    return { state: 'ok', kind: kind, price: P, loan: loan, ltv: prog.ltv, ruleLoan: rule.loanMax, lower: prog.lower, lowerWhy: prog.lowerWhy, years: prog.years, ratePct: ratePct,
      down: P - loan, cashMin: prog.cashMin, minCash: prog.minCash, cov: cov, flex: flex, cpfUsed: cpfUsed, cpfLeft: Math.max(0, cpfIn - cpfUsed), downCash: downCash,
      bsd: duty.bsd, absd: duty.absd, absdRate: duty.absdRate, duty: duty.total, cash: downCash + duty.total, monthly: prog.finalMonthly,
      typed: typed, overLimit: typed !== null && typed > rule.loanMax + 0.5, incomeCap: incomeCap, aboveIncome: incomeCap !== null && loan > incomeCap + 0.5, homeLoans: L.home, ageAssumed: ageAssumed, age: age };
  }

  // the household income a price needs (before CPF): the lowest monthly salary at which the same engines (TDSR; MSR with it for a new EC) lend the loan,
  // at the age, tenure, rate and other repayments used for the cost. No new rule: it is the borrowing calculation run backwards.
  function incomeNeeded(st, c) {
    if (!c || c.state !== 'ok' || !(c.loan > 0)) return null;
    const L = loansOf(st), run = (inc) => incomeLoan({ gross: inc, bors: [{ age: c.age, fixed: inc, variable: 0 }], uiKind: st.pkind, order: 'none', debtsOther: L.otherAmt, debtsHome: L.homeAmt, years: c.years, ratePct: c.ratePct }, L.home);
    let lo = 0, hi = 500000;
    if (run(hi) < c.loan - 0.5) return { state: 'out' };
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (run(mid) >= c.loan - 0.5) hi = mid; else lo = mid; }
    return { state: 'ok', income: hi, rule: st.pkind === 'ec' ? 'msr' : 'tdsr', debts: L.total, ageAssumed: c.ageAssumed, age: c.age };
  }

  /* ---------------- 4. What will I get from selling? (V3.4) ---------------- */
  // st.sale: { type 'hdb'|'private'|'ec', price, loan, cpfRefund (CPF used for the home INCLUDING accrued interest; blank = not entered yet), comm (agent fee, % of the price,
  // before GST; blank = the usual 2%), legal (blank = the usual estimate), bought, sold (dates, private home or EC only: SSD) }. Every figure is GW_CALC.saleProceeds'.
  // total = what the sale leaves after the loan and the costs, before it is split into cash and CPF; the split is given only once the CPF figure is entered.
  function sell(st) {
    const s = st.sale || {}, type = s.type === 'private' || s.type === 'ec' ? s.type : 'hdb';
    if (!(has(s.price) && s.price > 0)) return { state: 'need', need: ['sale.price'] };
    const o55 = s.o55 === 'yes';
    const i = { type: type, price: s.price, loan: nn(s.loan), penalty: nn(s.penalty), owner55: o55, cpfPrincipal: has(s.cpfRefund) ? s.cpfRefund : 0, cpfInterest: 0, commissionPct: has(s.comm) ? s.comm : undefined, legal: has(s.legal) ? s.legal : undefined,
      bought: type !== 'hdb' ? s.bought || undefined : undefined, sold: type !== 'hdb' ? s.sold || undefined : undefined };
    const r = C.saleProceeds(i);
    if (!r.ok) return { state: 'invalid', errors: r.invalid || [] };
    const cpfIn = has(s.cpfRefund);
    // V3.5 (Ken, 26 Oct): an owner aged 55 or over has their refund applied first to their Retirement Account, so the CPF usable for the next home is GW_CALC's own rule
    // (saleEstimate's cpfAfter55): the refund less the 55+ owners' share, nothing of theirs unless CPF's figure for what they can use is entered (cpfUse, taken as entered).
    // Without that figure the usable amount is provisional, and the page says so.
    let usable = null, provisional = false;
    if (cpfIn) {
      if (!o55) usable = r.cpfRefund;
      else if (has(s.cpfUse)) usable = Math.min(Math.max(0, s.cpfUse), r.cpfRefund) + (has(s.cpf55) ? Math.max(0, r.cpfRefund - s.cpf55) : 0);
      else { usable = C.saleEstimate({ overrideCash: 0, overrideCpf: r.cpfRefund, cpfRefund55: has(s.cpf55) ? Math.min(s.cpf55, r.cpfRefund) : undefined }, { owner55: true }).cpf; provisional = true; }
      usable = Math.min(usable, r.cpfRefund);
    }
    return { state: 'ok', r: r, type: type, price: r.price, loan: r.loan, penalty: r.penalty, costs: r.costs, ssd: r.ssd, ssdMissing: r.ssdMissing, total: r.afterLoan - r.costs.total, cpfIn: cpfIn,
      cash: cpfIn ? r.netCash : null, cpf: cpfIn ? r.cpfRefund : null, o55: o55, cpfUsable: usable, cpfProvisional: provisional, cpf55Known: has(s.cpf55), cpfShortfall: r.cpfShortfall, loanShortfall: r.loanShortfall, ownCashNeeded: r.ownCashNeeded, defaults: r.defaults };
  }

  // V3.4: "Check a specific flat", as the HDB and EC loan limit page did it: GW_CALC.msr with the flat's price and HDB's valuation gives the loan on the lower of the two,
  // the cash over valuation and the cash-only part (none for an HDB loan beyond the cash over valuation; the bank's minimum cash for a bank loan). HDB flats only.
  function flat(st) {
    if (st.bkind !== 'hdb' || !(has(st.flatPrice) && st.flatPrice > 0)) return null;
    const L = loansOf(st), A0 = Math.max(21, R.bankLtv.endAge - R.bankLtv.standardTenure.private);
    const B = engineBorrowers(st).map((b) => Object.assign({}, b, { age: has(b.age) ? b.age : A0 }));
    const r = C.msr({ scenario: st.hdbLoan === 'bank' ? 'hdb-bank' : 'hdb-loan', household: ['family', 'extended', 'single'].indexOf(st.household) >= 0 ? st.household : 'family', borrowers: B, propertyLoans: L.homeAmt, otherDebts: L.otherAmt,
      loans: L.home, tenure: has(st.years) ? st.years : undefined, lease: has(st.lease) && st.lease > 0 ? st.lease : undefined, price: st.flatPrice, valuation: has(st.flatVal) && st.flatVal > 0 ? st.flatVal : undefined });
    return r && r.ok && r.flat ? Object.assign({ scenario: r.scenario }, r.flat) : null;
  }

  /* ---------------- V3.7: an HDB flat on What will this home cost me? ---------------- */
  // Ken, 27 Oct 2026: answer the question for an HDB resale flat (st.pkind 'hdb') or a new HDB flat (st.pkind 'bto'), with an HDB loan or a bank loan (st.hdbLoan).
  // No rule of its own: the loan limit, the minimum cash and the cash above the valuation are GW_CALC.flatCheck's (the HDB loan limit page's); the loan limit and
  // tenure are GW_RULES.hdbLoan's (HDB loan) or GW_CALC.bankTenure's with the MAS rows (bank loan); stamp duty is GW_CALC.stampDuty's (kind 'hdb'); the instalment
  // and the income the 30% MSR needs are GW_CALC.mortgage's; the payment steps are GW_SCHEDULE.hdb's. Eligibility, grants, the lease and HDB's use of CPF savings are
  // said on the page, not assumed.
  function costHdb(st) {
    const flat = st.pkind === 'bto' ? 'bto' : 'resale';
    if (!(has(st.price) && st.price > 0)) return { state: 'need', need: ['price'], hdb: true, flat };
    const lender = st.hdbLoan === 'bank' ? 'bank' : 'hdb', H = R.hdbLoan, L = loansOf(st), bs = engineBorrowers(st);
    const aged = bs.length && bs.every((b) => has(b.age));
    let age = null;
    if (aged) { if (bs.length === 1) age = bs[0].age; else if (lender === 'hdb') age = bs.reduce((a, b) => a + b.age, 0) / bs.length; else { const Bc = bs.some((b) => b.fixed > 0 || b.variable > 0) ? C.borrowers(bs) : null; age = Bc && Bc.iwaaUse !== null ? Bc.iwaaUse : Math.max.apply(null, bs.map((b) => b.age)); } }
    const ageAssumed = age === null, std = lender === 'hdb' ? H.maxTenureYears : R.bankLtv.standardTenure.hdb;
    if (ageAssumed) age = Math.max(21, (lender === 'hdb' ? H.endAge : R.bankLtv.endAge) - (has(st.years) ? Math.min(st.years, std) : std));
    let years, maxYears, lower = false, ltv, minCash;
    if (lender === 'hdb') { maxYears = Math.max(0, Math.min(H.maxTenureYears, Math.floor(H.endAge - age))); years = has(st.years) ? Math.min(st.years, maxYears) : maxYears; ltv = H.ltv; minCash = H.minCash; }
    else { const t = C.bankTenure('hdb', age, has(st.years) ? st.years : undefined); maxYears = t.allowed; years = t.years; lower = t.lower; const row = (t.lower ? R.bankLtv.lower : R.bankLtv.standard)[Math.min(L.home, 2)]; ltv = row.ltv; minCash = row.minCash; }
    if (!(years >= 1)) return { state: 'invalid', hdb: true, flat, errors: [{ field: 'years', text: lender === 'hdb' ? 'An HDB loan ends by age ' + H.endAge + ', so there is no HDB loan tenure at this age. A bank loan, or no loan, may still work.' : 'Banks usually end a loan by age ' + R.bankLtv.maturityAge + ', so there is no bank loan tenure at this age.' }] };
    const where = { price: st.price, valuation: flat === 'resale' && has(st.valuation) && st.valuation > 0 ? st.valuation : undefined };
    const lim = C.flatCheck(where, Infinity, ltv, minCash), typed = has(st.loanAmt) ? st.loanAmt : null;
    const fc = C.flatCheck(where, typed !== null ? Math.min(typed, lim.loanLimit) : lim.loanLimit, ltv, minCash);
    const ratePct = has(st.ratePct) ? st.ratePct : (lender === 'hdb' ? Math.round(R.hdbLoanRate * 1000) / 10 : 4);
    const m = fc.loan > 0.5 ? C.mortgage({ loan: fc.loan, ratePct: ratePct, years: years, lender: lender }) : null;
    const d = C.stampDuty({ price: fc.dutyBase, kind: 'hdb', buyers: dutyBuyers(st), couple: st.couple });
    if (!d.ok) return { state: 'invalid', hdb: true, flat, errors: d.invalid || [] };
    const sch = S.hdb({ flat: flat, price: st.price, loan: lender });
    // a new flat's booking fee (HDB, by flat size) is part of the down payment: paid when booking, then deducted from what is payable at the Agreement for Lease
    const BF = R.hdbPayments.bto.bookingFee, room = st.btoRoom === '2' ? '2' : st.btoRoom === '3' ? '3' : '4', bookingFee = flat === 'bto' ? (room === '2' ? BF.flexi2 : room === '3' ? BF.room3 : BF.room4plus) : 0;
    const duty = d.total, flex = fc.cashOrCpf + duty, cpfUsed = Math.min(Math.max(0, has(st.cpf) ? st.cpf : 0), flex);
    return { state: 'ok', hdb: true, flat: flat, lender: lender, price: st.price, valuation: where.valuation || null, cov: fc.cov, base: fc.base, loan: fc.loan, ruleLoan: lim.loanLimit, typed: typed, overLimit: typed !== null && typed > lim.loanLimit + 0.5,
      ltv: ltv, minCash: minCash, cashMin: fc.cashMin, cashOnly: fc.cashOnly, down: fc.down, cashOrCpf: fc.cashOrCpf, bsd: d.bsd, absd: d.absd, absdRate: d.absdRate, duty: duty, dutyNotes: d.notes || [],
      flex: flex, cpfUsed: cpfUsed, cpfLeft: Math.max(0, (has(st.cpf) ? st.cpf : 0) - cpfUsed), cash: fc.down + duty - cpfUsed, monthly: m && m.ok ? m.monthly : 0, incomeMsr: m && m.ok ? m.stress.incomeForMsr : 0, stressRate: m && m.ok ? m.stress.rate : null,
      years: years, maxYears: maxYears, capped: has(st.years) && st.years > maxYears, lower: lower, ratePct: ratePct, age: age, ageAssumed: ageAssumed, homeLoans: L.home, bookingFee: bookingFee, room: room, events: sch.ok ? sch.events : [], foot: sch.ok ? sch.foot : [] };
  }

  return { costHdb, flat, sell, incomeNeeded, cost, borrowersOf, loansOf, needOf, borrow, priceLoan, ownedOf, toAssess, afford, dutyBuyers, schedule, timelineInput, incomeLoan, funding, engineKind };
});
