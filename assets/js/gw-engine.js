/* ==========================================================================
   GROUNDWORK — shared financial engine interface, Phase 1 (Master Planning, 6 Nov 2026). A THIN ADAPTER, NOT AN ENGINE.
   It describes a household once (a case, gw-case-v1) and returns the existing engines' own results in one envelope (gw-result-v1).
   It adds no formula, rule, rate, band, limit or default of its own: every figure is the unchanged result of GW_CALC, GW_TIMELINE,
   GW_ANSWER, GW_SCHEDULE, GW_FIN3 or GW_CPFBUF, read back field by field (no arithmetic here). The case is turned into the very entries
   the calculator pages give GW_FIN3, through GW_FIN3's own withHomes() for the homes owned, so a figure can never differ from the page's.
   Not loaded by any page in Phase 1 (tests only). No DOM, no storage, no network; nothing is written to a URL, analytics or storage.
   UMD: window.GW_ENGINE in the browser (after gw-rules, gw-calc, gw-timeline, gw-answer, gw-schedule, gw-fin3-core, gw-cpfbuf); in Node,
   require() returns the factory: call it with (GW_RULES, GW_CALC, GW_TIMELINE, GW_ANSWER, GW_SCHEDULE, GW_FIN3, GW_CPFBUF).

   The case (gw-case-v1). Blank = not given; nothing blank is guessed here (the engines' own defaults are reported in assumptions[]).
     people[]   (1 or 2)  { age, res: 'SC'|'PR'|'FR', fta (FR only: a Free Trade Agreement national), income: { fixed, variable } (monthly),
                            borrows (the second person may buy without borrowing: false), cpf: { oa, sa, oaMonthly } (balances, for the set-aside
                            and the construction-period buffer) }
     household  { cash, cpf (CPF OA that can go into the purchase now), cpfIsUsable (that CPF is already above any set-aside), couple
                  (married, buying in both names), cover95 (the home kept has a lease to age 95), saveMonthly, cpfMonthly }
     otherLoans[]  { person, monthly }   repayments that are not on a home owned (car, personal, credit)
     owned[]    one record per home owned now: { id, type: 'hdb'|'private', owners: [0] | [1] | [0, 1], loan: { monthly } (blank or
                null: no loan on it), intent: 'keep'|'sell',
                sale (the home sold; or, on a home kept, figures for "if I sold it"): { price, loan (outstanding), penalty, cpfRefund (CPF used + accrued interest), commissionPct, legal,
                bought, sold (dates: SSD), owner55, cpfUsable, cpf55, heldOver4, cash, cpf (figures handed over from a sale worked out elsewhere) } }
     purchase   { type: 'new'|'ec'|'completed'|'resaleec'|'hdb'|'bto', price, valuation, otp, noDate, top, csc, completion, btoRoom,
                  order: 'sell-first'|'buy-first' (when a home is sold), saleTiming: { when: 'unsure'|'date'|'afterKeys', month, date,
                  monthsAfterKeys }, absdRefund (buying first: the refund assumed once the home sells), rentMonthly (selling first) }
     financing  { lender: 'bank'|'hdb', ratePct, years, loanAmt, household: 'family'|'extended'|'single' (HDB loan), lease (HDB flat) }

   The result (gw-result-v1): { schema, version, status, issues[], blocks: { <name>: block }, trace }
     block: { status: 'ok'|'incomplete'|'invalid'|'stop'|'unsupported', reason, missing[{ field, need: 'required'|'refine' }], invalid[{ field, text }],
              assumptions[{ key, value, basis: 'default'|'convention' }], provisional[{ key, note }], figures (fields read from value), value (the
              engine's own result, unchanged), trace: { fn } }
   Blocks: borrow (How much can I borrow?), afford (What can I afford?), cost (What will this home cost me?), stampDuty, schedule, funding (the
   dated funding check), sale (What will I get from selling?), cpf, cpfBuffer. call(name, ...args) runs one engine function as it is, in the envelope.
   Not here (kept separate on purpose): the Decoupling Timeline & Costs engine and any Hold vs Sell vs Upgrade comparison.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.GW_ENGINE = factory(root.GW_RULES, root.GW_CALC, root.GW_TIMELINE, root.GW_ANSWER, root.GW_SCHEDULE, root.GW_FIN3, root.GW_CPFBUF);
})(typeof self !== 'undefined' ? self : this, function (R, C, T, A, S, F, BUF) {
  'use strict';
  if (!R || !C || !T || !A || !S || !F) throw new Error('GW_ENGINE needs GW_RULES, GW_CALC, GW_TIMELINE, GW_ANSWER, GW_SCHEDULE and GW_FIN3');
  const VERSION = 'GWE1-2026-11-06', CASE = 'gw-case-v1', RESULT = 'gw-result-v1';
  const has = (x) => typeof x === 'number' && isFinite(x);
  const given = (x) => x !== undefined && x !== null && x !== '';
  const obj = (x) => (x && typeof x === 'object' ? x : {});
  const list = (x) => (Array.isArray(x) ? x : []);
  const put = (o, k, v) => { if (given(v)) o[k] = v; return o; };
  const SEVERITY = ['invalid', 'unsupported', 'incomplete', 'stop', 'ok'];
  const worst = (xs) => SEVERITY.find((s) => xs.indexOf(s) >= 0) || 'ok';
  const TYPES = { purchase: ['new', 'ec', 'completed', 'resaleec', 'hdb', 'bto'], owned: ['hdb', 'private'], res: ['SC', 'PR', 'FR'] };

  /* ---------------- the case: checked before anything is worked out ---------------- */
  // What the engines cannot express is said ('unsupported'), never approximated; what is wrong is 'invalid'; a home "still paying" with no
  // repayment is 'incomplete' (the pages wait for it too: Priority 1 answer-first, 1 Nov 2026).
  function check(c) {
    c = obj(c); const P = list(c.people), H = list(c.owned), out = { invalid: [], unsupported: [], missing: [] };
    if (c.schema !== undefined && c.schema !== CASE) out.invalid.push({ field: 'schema', text: 'Not a ' + CASE + ' case.' });
    if (!P.length || P.length > 2) out.unsupported.push({ field: 'people', text: 'One or two people.' });
    P.forEach((p, k) => {
      p = obj(p);
      if (given(p.res) && TYPES.res.indexOf(p.res) < 0) out.invalid.push({ field: 'people[' + k + '].res', text: 'SC, PR or FR.' });
      if (p.fta === true && p.res !== 'FR') out.unsupported.push({ field: 'people[' + k + '].fta', text: 'Free Trade Agreement treatment is modelled for a foreigner (FR) only.' });
      if (p.borrows === false && k === 0) out.unsupported.push({ field: 'people[0].borrows', text: 'Only the second person can buy without borrowing.' });
    });
    H.forEach((h, i) => {
      h = obj(h); const f = 'owned[' + i + ']', ow = list(h.owners);
      if (TYPES.owned.indexOf(h.type) < 0) out.unsupported.push({ field: f + '.type', text: 'A home owned is entered as an HDB flat or a private home.' });
      if (!ow.length || ow.some((k) => !(k === 0 || k === 1) || k >= P.length) || ow.length !== ow.filter((k, j) => ow.indexOf(k) === j).length) out.invalid.push({ field: f + '.owners', text: 'Owners are people in the case.' });
      if (h.intent !== 'keep' && h.intent !== 'sell') out.invalid.push({ field: f + '.intent', text: 'keep or sell.' });
      if (h.loan && !has(obj(h.loan).monthly)) out.missing.push({ field: f + '.loan.monthly', need: 'required' });
    });
    if (H.filter((h) => obj(h).intent === 'sell').length > 1) out.unsupported.push({ field: 'owned', text: 'One home sold per plan.' });
    const pu = c.purchase;
    if (pu && TYPES.purchase.indexOf(obj(pu).type) < 0) out.invalid.push({ field: 'purchase.type', text: TYPES.purchase.join(', ') + '.' });
    return out;
  }

  /* ---------------- the case as the pages' entries (GW_FIN3 state) ---------------- */
  const ownCode = (ow, n) => (n !== 2 ? '0' : ow.length === 2 ? 'both' : String(ow[0]));
  const soldIndex = (c) => list(obj(c).owned).findIndex((h) => obj(h).intent === 'sell');
  // the home whose sale figures the engines read (GW_FIN3's st.sale): the one being sold, otherwise the first home (as the pages' homes list orders them)
  const primIndex = (c) => { const si = soldIndex(c); return si >= 0 ? si : list(obj(c).owned).length ? 0 : -1; };
  function saleState(h) {
    const s = obj(obj(h).sale), q = {};
    put(q, 'price', s.price); put(q, 'loan', s.loan); put(q, 'penalty', s.penalty); put(q, 'cpfRefund', s.cpfRefund); put(q, 'comm', s.commissionPct); put(q, 'legal', s.legal);
    put(q, 'bought', s.bought); put(q, 'sold', s.sold); if (s.owner55 === true) q.o55 = 'yes'; put(q, 'cpfUse', s.cpfUsable); put(q, 'cpf55', s.cpf55);
    if (s.heldOver4 === true) q.held = true; put(q, 'oCash', s.cash); if (given(s.cash)) put(q, 'oCpf', s.cpf);
    return q;
  }
  function toFin3(c) {
    c = obj(c); const P = list(c.people), n = P.length === 2 ? 2 : 1, hh = obj(c.household), pu = obj(c.purchase), fi = obj(c.financing);
    const st = { n: n, p: P.map((x, k) => { x = obj(x); const inc = obj(x.income), q = {}; put(q, 'age', x.age); put(q, 'fixed', inc.fixed); put(q, 'variable', inc.variable);
      put(q, 'res', x.fta === true && x.res === 'FR' ? 'FTA' : x.res); if (k === 1 && x.borrows === false) q.nb = true; return q; }) };
    st.loans = list(c.otherLoans).map((l) => ({ type: 'other', who: obj(l).person === 1 ? 1 : 0, amt: obj(l).monthly }));
    put(st, 'cash', hh.cash); put(st, 'cpf', hh.cpf); put(st, 'couple', hh.couple); put(st, 'cover95', hh.cover95); put(st, 'cpfIsUsable', hh.cpfIsUsable);
    put(st, 'saveMo', hh.saveMonthly); put(st, 'cpfMo', hh.cpfMonthly);
    if (P.some((x) => obj(x).cpf && (given(obj(x).cpf.oa) || given(obj(x).cpf.sa)))) st.cpfBal = P.map((x) => { const b = obj(obj(x).cpf), q = {}; put(q, 'oa', b.oa); put(q, 'sa', b.sa); return q; });
    if (P.some((x) => given(obj(obj(x).cpf).oaMonthly))) st.oaMo = P.map((x) => (given(obj(obj(x).cpf).oaMonthly) ? obj(x).cpf.oaMonthly : null));
    // the purchase: one type, read by each page under its own key (pkind: cost and payments; akind: What can I afford?; bkind: How much can I borrow?)
    const t = pu.type;
    if (t) {
      st.pkind = t;
      if (t === 'new' || t === 'completed') st.akind = t; else if (t === 'hdb' || t === 'bto') st.akind = 'hdb';
      st.bkind = t === 'hdb' || t === 'bto' ? 'hdb' : t === 'ec' ? 'ec' : 'private';
    }
    put(st, 'price', pu.price); put(st, 'valuation', pu.valuation); put(st, 'otp', pu.otp); if (pu.noDate === true) st.noDate = true;
    put(st, 'top', pu.top); put(st, 'csc', pu.csc); put(st, 'completion', pu.completion); put(st, 'btoRoom', pu.btoRoom);
    if (t === 'hdb' || t === 'bto') { put(st, 'flatPrice', pu.price); put(st, 'flatVal', pu.valuation); }
    const sw = obj(pu.saleTiming);
    put(st, 'saleWhen', sw.when); put(st, 'saleMonth', sw.month); put(st, 'saleDate', sw.date); put(st, 'saleAfter', sw.monthsAfterKeys);
    if (pu.absdRefund === true) st.refund = true;
    put(st, 'rent', pu.rentMonthly);
    if (fi.lender) st.hdbLoan = fi.lender === 'bank' ? 'bank' : 'hdb';
    put(st, 'ratePct', fi.ratePct); put(st, 'years', fi.years); put(st, 'loanAmt', fi.loanAmt); put(st, 'household', fi.household); put(st, 'lease', fi.lease);
    // the sale figures, then the homes owned through GW_FIN3's own list reading (the pages' V3.12 path): owners, counts, loans, keep or sell
    const pi = primIndex(c);
    if (pi >= 0 && obj(c.owned[pi]).sale) { st.sale = saleState(c.owned[pi]); if (pi !== soldIndex(c)) st.sale.type = obj(c.owned[pi]).type; }   // sold: withHomes sets the type
    const homes = list(c.owned).map((h) => { h = obj(h); const L = h.loan ? obj(h.loan) : null;
      return { own: ownCode(list(h.owners), n), type: h.type, act: h.intent, mort: L ? 'yes' : 'no', amt: L && has(L.monthly) ? L.monthly : null }; });
    const order = pu.order === 'sell-first' ? 'sell' : pu.order === 'buy-first' ? 'buy' : undefined;
    return F.withHomes(st, homes, order);
  }

  // The reverse, for the pages' own entries (and the round-trip parity test): page state st0 + its homes list + the order chosen -> a case.
  function fromFin3(st, homes, order) {
    st = obj(st); const n = st.n === 2 ? 2 : 1, c = { schema: CASE, people: [], household: {}, otherLoans: [], owned: [], financing: {} };
    for (let k = 0; k < n; k++) {
      const x = obj(list(st.p)[k]), q = { income: {} }, bal = obj(list(st.cpfBal)[k]);
      put(q, 'age', x.age); put(q.income, 'fixed', x.fixed); put(q.income, 'variable', x.variable);
      if (x.res === 'FTA') { q.res = 'FR'; q.fta = true; } else put(q, 'res', x.res);
      if (k === 1 && x.nb) q.borrows = false;
      const cp = {}; put(cp, 'oa', bal.oa); put(cp, 'sa', bal.sa); if (st.oaMo) put(cp, 'oaMonthly', list(st.oaMo)[k]); if (Object.keys(cp).length) q.cpf = cp;
      c.people.push(q);
    }
    const hh = c.household; put(hh, 'cash', st.cash); put(hh, 'cpf', st.cpf); put(hh, 'couple', st.couple); put(hh, 'cover95', st.cover95); put(hh, 'cpfIsUsable', st.cpfIsUsable);
    put(hh, 'saveMonthly', st.saveMo); put(hh, 'cpfMonthly', st.cpfMo);
    c.otherLoans = list(st.loans).filter((l) => l && l.type !== 'home').map((l) => ({ person: l.who === 1 ? 1 : 0, monthly: l.amt }));
    const s = obj(st.sale), L = list(homes), si = L.findIndex((h) => h && h.act === 'sell'), pi = si >= 0 ? si : 0;
    c.owned = L.map((h, i) => {
      const q = { id: 'home-' + (i + 1), type: h.type || 'hdb', owners: n !== 2 ? [0] : h.own === 'both' ? [0, 1] : h.own === '1' ? [1] : [0], intent: h.act === 'sell' ? 'sell' : 'keep' };
      if (h.mort === 'yes') q.loan = { monthly: h.amt };
      if (i === pi && st.sale) { const z = {}; put(z, 'price', s.price); put(z, 'loan', s.loan); put(z, 'penalty', s.penalty); put(z, 'cpfRefund', s.cpfRefund); put(z, 'commissionPct', s.comm); put(z, 'legal', s.legal);
        put(z, 'bought', s.bought); put(z, 'sold', s.sold); if (s.o55 === 'yes') z.owner55 = true; put(z, 'cpfUsable', s.cpfUse); put(z, 'cpf55', s.cpf55); if (s.held === true) z.heldOver4 = true;
        put(z, 'cash', s.oCash); if (given(s.oCash)) put(z, 'cpf', s.oCpf); q.sale = z; }
      return q; });
    const pu = {}, t = st.pkind || (st.akind === 'hdb' || st.bkind === 'hdb' ? 'hdb' : st.akind) || (st.bkind === 'ec' ? 'ec' : undefined);
    put(pu, 'type', t); put(pu, 'price', given(st.price) ? st.price : (t === 'hdb' || t === 'bto' ? st.flatPrice : undefined)); put(pu, 'valuation', given(st.valuation) ? st.valuation : (t === 'hdb' || t === 'bto' ? st.flatVal : undefined));
    put(pu, 'otp', st.otp); if (st.noDate === true) pu.noDate = true; put(pu, 'top', st.top); put(pu, 'csc', st.csc); put(pu, 'completion', st.completion); put(pu, 'btoRoom', st.btoRoom);
    if (order === 'sell' || order === 'buy') pu.order = order === 'sell' ? 'sell-first' : 'buy-first';
    const sw = {}; put(sw, 'when', st.saleWhen); put(sw, 'month', st.saleMonth); put(sw, 'date', st.saleDate); put(sw, 'monthsAfterKeys', st.saleAfter); if (Object.keys(sw).length) pu.saleTiming = sw;
    if (st.refund === true) pu.absdRefund = true; put(pu, 'rentMonthly', st.rent);
    if (Object.keys(pu).length) c.purchase = pu;
    const fi = c.financing; if (st.hdbLoan) fi.lender = st.hdbLoan === 'bank' ? 'bank' : 'hdb';
    put(fi, 'ratePct', st.ratePct); put(fi, 'years', st.years); put(fi, 'loanAmt', st.loanAmt); put(fi, 'household', st.household); put(fi, 'lease', st.lease);
    return c;
  }

  /* ---------------- one envelope for every engine's way of saying "not yet" ---------------- */
  // GW_CALC / GW_TIMELINE / GW_SCHEDULE: { ok, missing, invalid, noTenure, error }; GW_FIN3: state; GW_ANSWER: state. The engine's own result stays in value.
  const FIN3_STATE = { ok: 'ok', need: 'incomplete', invalid: 'invalid', zero: 'stop', notenure: 'stop', hdb: 'unsupported', out: 'stop' };
  const ANSWER_STATE = { ok: 'ok', empty: 'incomplete', income: 'incomplete', 'ask-home': 'incomplete', 'ask-flat': 'incomplete', 'ask-cpf': 'incomplete', invalid: 'invalid', 'no-income': 'stop', 'out-of-reach': 'stop', hdb: 'unsupported' };
  function statusOf(r) {
    if (r === null || r === undefined) return { status: 'incomplete', reason: 'not-applicable' };
    if (typeof r !== 'object') return { status: 'ok' };
    if (typeof r.state === 'string') {
      const st = FIN3_STATE[r.state] || ANSWER_STATE[r.state] || 'ok';
      return { status: st, reason: st === 'ok' ? undefined : r.state };
    }
    if (r.ok === true) return r.noTenure ? { status: 'stop', reason: 'no-tenure' } : { status: 'ok' };
    if (r.ok === false) {
      if (list(r.invalid).length || r.error) return { status: 'invalid', reason: r.error };
      if (r.hdb) return { status: 'unsupported', reason: 'hdb' };
      return { status: 'incomplete', reason: r.needCpf ? 'cpf-balances' : undefined };
    }
    return { status: 'ok' };
  }
  // the engines' field names, said as the case's
  const FIELD = { price: 'purchase.price', otp: 'purchase.otp', valuation: 'purchase.valuation', years: 'financing.years', ratePct: 'financing.ratePct', loanAmt: 'financing.loanAmt',
    loan: 'financing.loanAmt', cash: 'household.cash', cpf: 'household.cpf', lease: 'financing.lease', buyers: 'people' };
  function fieldOf(f, c) {
    f = String(f); let m = /^p\.(\d)\.(age|fixed|variable)$/.exec(f);
    if (m) return 'people[' + m[1] + '].' + (m[2] === 'age' ? 'age' : 'income');
    m = /^sale\.(\w+)$/.exec(f);
    if (m) return 'owned[' + (soldIndex(c) >= 0 ? soldIndex(c) : 0) + '].sale.' + (m[1] === 'comm' ? 'commissionPct' : m[1]);
    return FIELD[f] || f;
  }
  function needs(r, c) {
    const out = [], add = (f, need) => { const field = fieldOf(f, c); if (!out.some((x) => x.field === field)) out.push({ field: field, need: need }); };
    list(r && r.need).forEach((f) => add(f, 'required')); list(r && r.missing).forEach((f) => add(f, 'required'));
    if (r && r.needCpf) list(c && c.people).forEach((p, k) => add('people[' + k + '].cpf.oa', 'refine'));
    if (r && Array.isArray(r.ask)) r.ask.forEach((f) => add(f, 'refine'));
    return out;
  }
  const invalids = (r, c) => list(r && (r.errors || r.invalid)).map((x) => ({ field: fieldOf(x.field || x.key || '', c), text: x.text }));
  function block(fn, value, c, extra) {
    const s = statusOf(value), b = { status: s.status, missing: needs(value, c), invalid: invalids(value, c), assumptions: [], provisional: [], figures: {}, value: value === undefined ? null : value, trace: { fn: fn } };
    if (s.reason) b.reason = s.reason;
    return Object.assign(b, extra || {});
  }
  const pick = (r, keys) => { const o = {}; keys.forEach((k) => { if (r && r[k] !== undefined) o[k] = r[k]; }); return o; };
  const assume = (b, key, value, basis) => { if (value !== undefined) b.assumptions.push({ key: key, value: value, basis: basis || 'default' }); };

  /* ---------------- the blocks: each is one GW_FIN3 call (or a view of one), with what it assumed ---------------- */
  const purchaseOf = (c) => obj(obj(c).purchase), finOf = (c) => obj(obj(c).financing);
  function common(b, c, st, r) {
    const fi = finOf(c);
    if (r && b.status === 'ok') {
      if (!given(fi.ratePct) && r.ratePct !== undefined) assume(b, 'financing.ratePct', r.ratePct);
      if (!given(fi.years) && r.years !== undefined) assume(b, 'financing.years', r.years);
      if (r.ageAssumed === true) assume(b, 'people.age', r.age);
    }
    list(obj(c).people).forEach((p, k) => { if (!given(obj(p).res)) assume(b, 'people[' + k + '].res', F.dutyBuyers(st)[k].res); });
    return b;
  }
  function ltvConvention(b, c) {
    if (list(obj(c).people).length === 2) b.assumptions.push({ key: 'ltvJointSeparateLoans', value: F.CFG.LTV_JOINT_SEPARATE_LOANS, basis: 'convention' });
    return b;
  }
  function borrow(c, o) {
    const st = toFin3(c), r = F.borrow(st, { assumeAge: !!(o && o.assumeAge) }), b = block('GW_FIN3.borrow', r, c);
    b.figures = pick(r, ['maxLoan', 'monthly', 'years', 'ratePct', 'ltv', 'minCash', 'binding', 'kind']);
    if (st.bkind === 'hdb' && !finOf(c).lender) assume(b, 'financing.lender', 'hdb');
    if (r && r.kind === 'hdb-loan' && !given(finOf(c).household)) assume(b, 'financing.household', r.household || undefined);
    if (r && r.altLtv) b.provisional.push({ key: 'altLtv', note: 'A higher loan-to-value may apply if the bank counts each borrower’s own housing loans.' });
    return ltvConvention(common(b, c, st, r), c);
  }
  function afford(c) {
    const st = toFin3(c), t = purchaseOf(c).type;
    if (t && ['new', 'completed', 'hdb', 'bto'].indexOf(t) < 0) return block('GW_FIN3.afford', { state: 'hdb' }, c, { status: 'unsupported', reason: 'type' });
    const r = F.afford(st), b = block('GW_FIN3.afford', r, c);
    b.figures = pick(r, ['budget', 'highest', 'limitedBy', 'years', 'ratePct']);
    if (t === 'completed' && !given(purchaseOf(c).valuation) && b.status === 'ok') assume(b, 'purchase.valuation', 'price');
    return ltvConvention(common(b, c, st, r), c);
  }
  function cost(c) {
    const st = toFin3(c), t = purchaseOf(c).type, hdb = t === 'hdb' || t === 'bto';
    const r = hdb ? F.costHdb(st) : F.cost(st), b = block(hdb ? 'GW_FIN3.costHdb' : 'GW_FIN3.cost', r, c);
    if (hdb && r && r.state === 'need') { b.status = 'incomplete'; delete b.reason; }
    b.figures = pick(r, ['price', 'loan', 'ltv', 'minCash', 'cash', 'downCash', 'cpfUsed', 'cpfLeft', 'bsd', 'absd', 'duty', 'monthly', 'years', 'ratePct']);
    if (hdb && !finOf(c).lender) assume(b, 'financing.lender', 'hdb');
    if (r && r.cpfSetAside && r.cpfSetAside.known === false) b.provisional.push({ key: 'cpfSetAside', note: 'CPF shown before any set-aside: the balances are not entered.' });
    if (r && r.ifNot) b.provisional.push({ key: 'saleEvidence', note: 'Selling first: assumes the bank has the sale evidence before the new loan is paid out.' });
    if (r && r.mayRise) b.provisional.push({ key: 'mayRise', note: 'Buying first: the limit may rise once the bank has the sale evidence (never assumed).' });
    if (r && r.alt) b.provisional.push({ key: 'altLtv', note: 'A higher loan-to-value may apply if the bank counts each borrower’s own housing loans.' });
    if ((t === 'new' || t === 'ec') && R.plannerConventions && R.plannerConventions.finalStage && R.plannerConventions.finalStage.provisional) b.provisional.push({ key: 'finalStage', note: R.plannerConventions.finalStage.note });
    return ltvConvention(common(b, c, st, r), c);
  }
  // stamp duty is the cost card's own (no second calculation)
  function stampDuty(c) {
    const k = cost(c), r = k.value, b = block(k.trace.fn + ' (duty)', r, c, { status: k.status, reason: k.reason, missing: k.missing, invalid: k.invalid });
    b.figures = pick(r, ['bsd', 'absd', 'absdRate', 'duty']); b.assumptions = k.assumptions.filter((a) => /^people\[\d\]\.res$/.test(a.key)); b.notes = r && r.dutyNotes ? r.dutyNotes : [];
    return b;
  }
  function schedule(c) {
    const st = toFin3(c), t = purchaseOf(c).type, hdb = t === 'hdb' || t === 'bto';
    if (hdb) { const k = cost(c); return block('GW_FIN3.costHdb (events)', k.value, c, { status: k.status, reason: k.reason, missing: k.missing, invalid: k.invalid, figures: { events: k.value && k.value.events ? k.value.events.length : 0 } }); }
    const r = F.schedule(st), b = block('GW_FIN3.schedule', r, c);
    if ((t === 'new' || t === 'ec') && b.status === 'ok' && R.plannerConventions.finalStage.provisional) b.provisional.push({ key: 'finalStage', note: R.plannerConventions.finalStage.note });
    return b;
  }
  function funding(c) {
    const st = toFin3(c), t = purchaseOf(c).type;
    if (t === 'hdb' || t === 'bto') return block('GW_FIN3.funding', { ok: false, hdb: true }, c);
    const r = F.funding(st), b = block('GW_FIN3.funding', r, c);
    b.figures = pick(r, ['limit', 'ruleLoan', 'capped', 'mayRise']);
    if (r && r.ok && list(obj(c).owned).some((h) => obj(h).intent === 'sell') && !purchaseOf(c).order) assume(b, 'purchase.order', st.order === 'sell' ? 'sell-first' : 'buy-first');
    if (r && r.ok && r.r && list(r.r.events).some((e) => e && e.provisional)) b.provisional.push({ key: 'finalStage', note: R.plannerConventions.finalStage.note });
    if (r && r.ifNot) b.provisional.push({ key: 'saleEvidence', note: 'Selling first: assumes the bank has the sale evidence before the new loan is paid out.' });
    return ltvConvention(common(b, c, st, r && r.ok ? r.i : null), c);
  }
  // the home being sold, or (id) any home owned: "what would I get if I sold it" (its sale figures, read by the same engine)
  function sale(c, id) {
    const H = list(obj(c).owned), si = id !== undefined ? H.findIndex((h) => obj(h).id === id) : soldIndex(c);
    if (si < 0) return block('GW_FIN3.sell', null, c, { status: 'incomplete', reason: 'no-sale', missing: [{ field: id !== undefined ? 'owned[id=' + id + ']' : 'owned[].intent', need: 'required' }] });
    const st = toFin3(c); st.sale = saleState(H[si]); st.sale.type = obj(H[si]).type;
    const r = F.sell(st), b = block('GW_FIN3.sell', r, c), f = 'owned[' + si + '].sale.';
    if (r && r.state === 'need') b.missing = [{ field: f + 'price', need: 'required' }];
    b.figures = r && r.state === 'ok' ? { price: r.price, loan: r.loan, costs: r.costs.total, ssd: r.costs.ssd, total: r.total, cash: r.cash, cpf: r.cpf, cpfUsable: r.cpfUsable } : {};
    if (r && r.state === 'ok') {
      if (r.defaults && r.defaults.commission) assume(b, f + 'commissionPct', r.costs.commissionPct);
      if (r.defaults && r.defaults.legal) assume(b, f + 'legal', r.costs.legal);
      if (!r.cpfIn) b.missing.push({ field: f + 'cpfRefund', need: 'refine' });
      if (r.ssdMissing) b.missing.push({ field: f + (r.ssdMissing === 'sold' ? 'sold' : 'bought'), need: 'refine' });
      if (r.cpfProvisional) b.provisional.push({ key: f + 'cpfUsable', note: 'An owner aged 55 or over: the CPF usable for the next home is provisional until CPF’s figure is entered.' });
    }
    return b;
  }
  // CPF, read from the sale and the cost card (no figure of its own)
  function cpf(c) {
    const s = soldIndex(c) >= 0 ? sale(c) : null, k = purchaseOf(c).type ? cost(c) : null, sv = s && s.status === 'ok' ? s.value : null, kv = k && k.status === 'ok' ? k.value : null;
    const b = block('GW_FIN3.sell + GW_FIN3.cost (CPF)', null, c, { status: worst([s ? s.status : 'ok', k ? k.status : 'ok']), missing: [].concat(s ? s.missing : [], k ? k.missing : []), invalid: [].concat(s ? s.invalid : [], k ? k.invalid : []) });
    if (!s && !k) { b.status = 'incomplete'; b.reason = 'not-applicable'; } else delete b.reason;
    b.provisional = [].concat(s ? s.provisional.filter((p) => /cpf/i.test(p.key)) : [], k ? k.provisional.filter((p) => /cpf/i.test(p.key)) : []);
    b.figures = { refund: sv ? sv.cpf : undefined, usableFromSale: sv ? sv.cpfUsable : undefined, usedForPurchase: kv ? kv.cpfUsed : undefined, left: kv ? kv.cpfLeft : undefined, setAside: kv ? kv.cpfSetAside : undefined };
    b.value = { sale: sv, cost: kv };
    return b;
  }
  function cpfBuffer(c) {
    const t = purchaseOf(c).type;
    if (t !== 'new' && t !== 'ec') return block('GW_FIN3.cpfBuffer', null, c, { status: 'unsupported', reason: 'type' });
    if (!BUF) return block('GW_FIN3.cpfBuffer', null, c, { status: 'unsupported', reason: 'no-cpfbuf' });
    const st = toFin3(c), k = F.cost(st), r = F.cpfBuffer(st, k, BUF), b = block('GW_FIN3.cpfBuffer', r, c);
    if (r === null) { const s0 = statusOf(k); b.status = s0.status === 'ok' ? 'unsupported' : s0.status; b.reason = 'cost-' + (k && k.state); b.missing = needs(k, c); b.invalid = invalids(k, c); }
    if (r && r.state === 'need') { b.status = 'incomplete'; b.missing = list(obj(c).people).map((p, j) => ({ field: 'people[' + j + '].cpf.oaMonthly', need: 'required' })); }
    return b;
  }

  const BLOCKS = { borrow, afford, cost, stampDuty, schedule, funding, sale, cpf, cpfBuffer };
  // the blocks a case can answer: those it has entries for (a part asked for is always run, and says why it cannot answer)
  function applicable(c) {
    const pu = purchaseOf(c), out = ['borrow'];
    if (pu.type) { out.push('cost', 'stampDuty', 'schedule'); if (['new', 'completed', 'hdb', 'bto'].indexOf(pu.type) >= 0) out.push('afford'); if (pu.otp || pu.noDate === true) out.push('funding'); }
    if (soldIndex(c) >= 0) out.push('sale');
    if (soldIndex(c) >= 0 || pu.type) out.push('cpf');
    if ((pu.type === 'new' || pu.type === 'ec') && list(obj(c).people).some((p) => given(obj(obj(p).cpf).oaMonthly))) out.push('cpfBuffer');
    return out;
  }
  function run(c, parts, o) {
    const chk = check(c), issues = [].concat(chk.invalid.map((x) => Object.assign({ status: 'invalid' }, x)), chk.unsupported.map((x) => Object.assign({ status: 'unsupported' }, x)));
    const res = { schema: RESULT, version: VERSION, status: 'ok', issues: issues, missing: chk.missing, blocks: {}, trace: trace() };
    if (chk.invalid.length || chk.unsupported.length) { res.status = chk.invalid.length ? 'invalid' : 'unsupported'; return res; }
    const want = Array.isArray(parts) && parts.length ? parts.filter((p) => BLOCKS[p]) : applicable(c);
    want.forEach((p) => { const b = p === 'borrow' ? borrow(c, o) : BLOCKS[p](c); if (chk.missing.length && p !== 'sale') { b.status = worst([b.status, 'incomplete']); b.missing = chk.missing.concat(b.missing); } res.blocks[p] = b; });
    res.status = worst(want.map((p) => res.blocks[p].status));
    return res;
  }
  function trace() {
    return { rulesChecked: R.checked, ratesValidUntil: R.ratesValidUntil, conventionsChecked: R.plannerConventions ? R.plannerConventions.checked : undefined,
      engines: { timeline: T.VERSION, answer: A.VERSION, schedule: S.VERSION, cpfbuf: BUF ? BUF.VERSION : undefined }, ltvMode: F.CFG.LTV_JOINT_SEPARATE_LOANS };
  }

  /* ---------------- one engine function, as it is, in the envelope ---------------- */
  const CALLS = {
    'calc.stampDuty': C.stampDuty, 'calc.ssd': C.ssd, 'calc.saleProceeds': C.saleProceeds, 'calc.saleEstimate': C.saleEstimate, 'calc.cpfSecondHome': C.cpfSecondHome,
    'calc.assetIncome': C.assetIncome, 'calc.tdsr': C.tdsr, 'calc.msr': C.msr, 'calc.mortgage': C.mortgage, 'calc.progressive': C.progressive, 'calc.flatCheck': C.flatCheck,
    'calc.bankTenure': C.bankTenure, 'calc.cpfInterestEstimate': C.cpfInterestEstimate, 'calc.borrowers': C.borrowers,
    'timeline.timeline': T.timeline, 'timeline.compare': T.compare, 'answer.assess': A.assess, 'schedule.schedule': S.schedule, 'schedule.hdb': S.hdb,
    'fin3.assetLoan': F.assetLoan, 'cpfbuf.run': BUF ? BUF.run : undefined };
  function call(name) {
    const fn = CALLS[name]; if (typeof fn !== 'function') throw new Error('GW_ENGINE.call: unknown engine function ' + name);
    const r = fn.apply(null, Array.prototype.slice.call(arguments, 1)), s = statusOf(r);
    const b = { schema: RESULT, version: VERSION, status: s.status, missing: list(r && r.missing).map((f) => ({ field: String(f), need: 'required' })).concat(list(r && r.need).map((f) => ({ field: String(f), need: 'required' }))),
      invalid: list(r && (r.invalid || r.errors)).map((x) => ({ field: x.field || x.key, text: x.text })), value: r, trace: { fn: name } };
    if (s.reason) b.reason = s.reason;
    return b;
  }

  return { VERSION, CASE, RESULT, check, toFin3, fromFin3, run, call, borrow, afford, cost, stampDuty, schedule, funding, sale, cpf, cpfBuffer, statusOf, CALLS: Object.keys(CALLS) };
});
