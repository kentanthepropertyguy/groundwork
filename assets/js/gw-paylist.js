/* ==========================================================================
   GROUNDWORK — the basic payment schedule, as one expandable list (Oct 2026).
   One component for every page that assesses a specific property: What can I afford? (new launch, completed home) and the HDB and EC loan limit page
   (HDB resale, new HDB flat, new EC). It needs a property type and a price, nothing about income, cash, CPF or loan. It shows each payment, its amount and
   when it falls: a rule's deadline, a milestone, or an estimate worded as a range, never an invented date.
   It adds no rule of its own. Private homes and ECs are read from GW_SCHEDULE.schedule (the same adapter the Payment Timeline uses, which the audited engine
   is tested against); HDB flats from GW_SCHEDULE.hdb (GW_RULES.hdbPayments). The list is the same one the Payment Timeline's first screen draws.
   UMD: window.GW_PAYLIST (after gw-rules.js, gw-calc.js, gw-schedule.js); in Node require() returns the factory: call it with (GW_SCHEDULE, GW_CALC).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.GW_PAYLIST = factory(root.GW_SCHEDULE, root.GW_CALC);
})(typeof self !== 'undefined' ? self : this, function (S, C) {
  'use strict';
  if (!S || !C) throw new Error('GW_PAYLIST needs GW_SCHEDULE and GW_CALC');
  const root = typeof self !== 'undefined' ? self : this;
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  const $ = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const pc = (x) => Math.round(x * 1000) / 10 + '%';
  const NAME = { new: 'New launch', ec: 'New EC', completed: 'Completed private home', 'hdb-resale': 'HDB resale flat', 'hdb-bto': 'New HDB flat (BTO)' };
  const BASIS = Object.assign({}, S.BASIS_TAG);

  // What a private home or EC is asked to pay, with no option date: a timing after the option, a milestone, or an estimate said as "about N months after the option".
  function privateRows(kind, price) {
    const s = S.schedule({ kind, price, undated: true });
    if (!s.ok) return { ok: false, invalid: s.invalid || [], missing: s.missing || [] };
    let seen = false;
    const rows = s.events.filter((e) => e.type === 'pay').map((e) => {
      let when, tag = BASIS[e.basis] || e.basis, basis = e.basis;
      if (e.basis === 'earliest') { when = 'As construction progresses'; if (!seen) when += ' <small>earliest ' + esc(S.after(e.date)) + '</small>'; seen = true; tag = ''; basis = 'trigger'; }
      else if (e.id === 'otp' || e.id === 'option') when = 'On the option date';
      else if (e.id === 'exercise') when = 'Within 14 days of the option';
      else if (e.id === 'snp') when = 'Within 8 weeks of the option';
      else if (e.id === 'bsd' || e.id === 'absd') when = 'Within 14 days of ' + (kind === 'completed' ? 'exercising the option' : 'signing the S&P');
      else when = 'About ' + esc(S.after(e.date));
      if (e.id === 'completion') when = 'About ' + esc(S.after(e.date)) + ': your S&P sets the date';
      return { label: e.label, pct: e.pct ? pc(e.pct) : '', amount: $(e.amount), when, tag, basis, provisional: !!e.provisional, note: '' };
    });
    const duty = s.assumedBuyer ? 'Stamp duty assumes a Singapore Citizen buying a first home. The stamp duty page works out yours.' : 'Stamp duty is worked out from the buyer details entered.';
    const foot = kind === 'completed'
      ? ['The 1% option fee and 4% exercise payment are planning conventions. Your option sets the actual amounts, and both are part of the price, not extra.', duty]
      : ['Construction stages have no dates: each falls due as the building reaches it. The TOP and final payments are estimates.'].concat(rows.some((r) => r.provisional) ? ['The final 15% is shown as one provisional payment.'] : [], [duty]);
    return { ok: true, price: s.price, rows, total: $(s.totals.amount), totalLabel: 'Total to pay, with stamp duty', foot, link: { href: 'payment-planner/', text: 'See the dates, and check your cash and CPF against each payment: Payment timeline' } };
  }

  // The basic HDB list (GW_SCHEDULE.hdb): amounts HDB fixes, the event each payment falls on, and no invented date.
  function hdbRows(flat, price, loan) {
    const h = S.hdb({ flat: flat === 'hdb-bto' ? 'bto' : 'resale', price, loan });
    if (!h.ok) return { ok: false, invalid: h.invalid || [], missing: h.missing || [] };
    const rows = h.events.map((e) => ({
      label: e.label, pct: e.pct ? pc(e.pct) : '',
      amount: e.amount != null ? (e.upTo ? 'Up to ' : e.about ? 'About ' : '') + $(e.amount) : esc(e.amountText),
      amountText: e.amount == null, when: esc(e.when), tag: e.basis === 'trigger' ? '' : BASIS[e.basis], basis: e.basis, note: e.note }));
    return { ok: true, price: h.price, rows, total: '', foot: h.foot, link: null };
  }

  function model(o) {
    o = o || {}; const kind = o.kind, price = o.price;
    if (!NAME[kind]) return { ok: false, missing: ['type'], invalid: [] };
    if (!(typeof price === 'number' && price > 0)) return { ok: false, missing: ['price'], invalid: [] };
    const m = /^hdb-/.test(kind) ? hdbRows(kind, price, o.loan) : privateRows(kind, price);
    return Object.assign({ kind, name: NAME[kind] }, m);
  }

  function html(m) {
    if (!m || !m.ok) return '';
    const li = m.rows.map((r, i) => '<li class="ps-r' + (r.amountText ? ' txt' : '') + '"><span class="ps-n" aria-hidden="true">' + (i + 1) + '</span><div class="ps-m"><span class="ps-nm"><b>' + esc(r.label) + '</b>' +
      (r.pct ? ' <small>' + esc(r.pct) + '</small>' : '') + (r.provisional ? ' <i class="ps-t b-est">provisional</i>' : '') + '</span><span class="ps-w">' + r.when + (r.tag ? ' <i class="ps-t b-' + r.basis + '">' + esc(r.tag) + '</i>' : '') + '</span>' +
      (r.note ? '<span class="ps-note">' + esc(r.note) + '</span>' : '') + '</div><b class="ps-a">' + r.amount + '</b></li>').join('');
    return '<ol class="ps-l" aria-label="Payment schedule, ' + esc(m.name) + '">' + li + '</ol>' + (m.total ? '<p class="ps-tot"><span>' + esc(m.totalLabel) + '</span><b>' + m.total + '</b></p>' : '') +
      '<ul class="ps-foot">' + m.foot.map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul>';
  }

  // How each payment of a home under construction is usually paid, from the price alone: the same split the engine makes (GW_CALC.progressive, the old New launch payments
  // calculator): the booking fee and the minimum cash first, then cash or CPF, then the bank loan. No income, cash or CPF is needed; an age, a CPF amount, a rate or a tenure
  // already entered refines it. Without an age the standard loan limit is shown, and it says so.
  function split(o) {
    o = o || {}; if (!(o.price > 0) || (o.kind !== 'new' && o.kind !== 'ec')) return { ok: false };
    const aged = !o.entity && o.age > 0;
    const r = C.progressive({ kind: o.kind === 'ec' ? 'ec' : 'private', price: o.price, age: aged ? o.age : 35, ratePct: o.ratePct, years: o.years, cpf: o.cpf, loans: o.loans || 0, entity: !!o.entity, buyers: o.buyers });
    if (!r.ok) return { ok: false, invalid: r.invalid || [] };
    const by = (x) => [x.cash ? 'cash ' + $(x.cash) : '', x.cpf ? 'CPF ' + $(x.cpf) : '', x.flex ? 'cash or CPF ' + $(x.flex) : '', x.loan ? 'bank loan ' + $(x.loan) : ''].filter(Boolean).join(' · ');
    const rows = r.stages.map((x) => ({ label: x.name, pct: pc(x.pct), amount: $(x.amount), when: esc(by(x)), tag: '', basis: '', note: x.monthly ? 'Monthly instalment after this stage: ' + $(x.monthly) : '' }));
    const foot = [(r.entity ? 'A company can borrow up to 15% and has no CPF, so the rest is cash.' : (aged ? '' : 'Shown at the standard loan limit. Add the borrower’s age in the funding check to confirm it.')),
      r.lower && !r.entity ? 'The lower loan limit applies (' + (r.lowerWhy === 'age' ? 'a loan running past age 65' : 'a tenure over 30 years') + ').' : '',
      r.cpfGiven ? '' : 'Cash or CPF is shown together until you add the CPF you plan to use.',
      'Instalments assume ' + pc(r.rate) + ' over ' + r.years + ' years, on what has been drawn so far. Your bank sets the actual amounts.'].filter(Boolean);
    return { ok: true, price: r.price, rows, foot, stampDuty: r.duty && r.duty.ok ? r.duty.total : 0,
      lines: [['Minimum cash', $(r.cashMin) + ' (' + pc(r.minCash) + ')'], ['Cash or CPF', $(r.cpfOrCash)], ['Bank loan, at most', $(r.loanMax) + ' (' + pc(r.ltv) + ')'], ['Instalment once fully drawn', $(r.finalMonthly) + ' a month']] };
  }
  function splitHtml(m) {
    if (!m || !m.ok) return '';
    const head = '<dl class="ps-sum">' + m.lines.map((l) => '<div><dt>' + esc(l[0]) + '</dt><dd>' + esc(l[1]) + '</dd></div>').join('') + '</dl>';
    const list = m.rows.map((r, i) => '<li class="ps-r"><span class="ps-n" aria-hidden="true">' + (i + 1) + '</span><div class="ps-m"><span class="ps-nm"><b>' + esc(r.label) + '</b> <small>' + esc(r.pct) + '</small></span><span class="ps-w">' + r.when + '</span>' + (r.note ? '<span class="ps-note">' + esc(r.note) + '</span>' : '') + '</div><b class="ps-a">' + r.amount + '</b></li>').join('');
    return '<details class="ps-d" data-split-d><summary><span>How each payment is usually paid</span><em>cash, CPF and bank loan</em></summary><div class="ps-in">' + head + '<ol class="ps-l" aria-label="How each payment is paid">' + list + '</ol>' +
      (m.stampDuty ? '<p class="ps-hint">Stamp duty of ' + $(m.stampDuty) + ' is paid in cash within 14 days of signing the S&amp;P. It is not in the stages above.</p>' : '') + '<ul class="ps-foot">' + m.foot.map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul></div></details>';
  }

  // The expandable section. host: an empty element. cfg: { key, base (path to tools/, e.g. '../'), title, em }.
  // The page tells it the property type (setKinds: one or two types to choose from, or none with a message) and, optionally, a price to start from.
  function mount(host, cfg) {
    if (!host || typeof document === 'undefined') return null;
    cfg = cfg || {};
    const id = 'ps-' + (cfg.key || 'x'), SK = 'gw.ps.' + (cfg.key || 'x') + '.v1';
    const store = { get() { try { return JSON.parse(root.sessionStorage.getItem(SK) || '{}') || {}; } catch (e) { return {}; } }, set(o) { try { root.sessionStorage.setItem(SK, JSON.stringify(o)); } catch (e) { /* storage blocked */ } } };
    host.innerHTML = '<details class="ps-d" data-ps-d><summary><span>' + esc(cfg.title || 'Payment schedule') + '</span><em data-ps-em>' + esc(cfg.em || 'every payment, its amount and when') + '</em></summary>' +
      '<div class="ps-in" data-ps-in><p class="ps-msg" data-ps-msg hidden></p><div class="ps-chips" role="group" aria-label="Type of home" data-ps-chips hidden></div>' +
      '<div class="ps-fld" data-ps-fld><label for="' + id + '-p">Property price</label><div class="ps-pin"><i>$</i><input id="' + id + '-p" type="text" inputmode="numeric" autocomplete="off" placeholder="e.g. 1,800,000" data-ps-price aria-describedby="' + id + '-e"></div></div>' +
      '<small class="ps-err" id="' + id + '-e" data-ps-err role="alert" hidden></small><div class="ps-out" data-ps-out aria-live="polite"></div></div></details>';
    const q = (s) => host.querySelector(s), det = q('[data-ps-d]'), inp = q('[data-ps-price]'), out = q('[data-ps-out]'), chips = q('[data-ps-chips]'), msg = q('[data-ps-msg]'), fld = q('[data-ps-fld]'), err = q('[data-ps-err]'), em = q('[data-ps-em]');
    const st = store.get(); let kinds = [], kind = null, loan = 'hdb', touched = false;
    const parse = (s) => { const p = C.parseMoney(String(s || '').replace(/\.$/, '')); return p; };
    if (root.GW_MONEY && root.GW_MONEY.wire) root.GW_MONEY.wire(inp, { parse: (s) => { const p = C.parseMoney(s); return p.value === undefined ? null : p.value; }, max: C.LIMITS && C.LIMITS.money ? C.LIMITS.money.max : undefined });
    if (typeof st.price === 'number' && st.price > 0) { inp.value = st.price.toLocaleString('en-US'); touched = true; }
    function draw() {
      err.hidden = true; err.textContent = '';
      if (!kind) { out.innerHTML = ''; return; }
      const p = parse(inp.value);
      if (inp.value.trim() === '') { out.innerHTML = '<p class="ps-hint">Enter the price to see every payment and when it falls.</p>'; return; }
      if (p.error) { err.textContent = p.error; err.hidden = false; out.innerHTML = ''; return; }
      const m = model({ kind, price: p.value, loan });
      if (!m.ok) { if (m.invalid && m.invalid.length) { err.textContent = m.invalid[0].text; err.hidden = false; } out.innerHTML = ''; return; }
      out.innerHTML = html(m) + (m.link ? '<p class="ps-link"><a href="' + esc((cfg.base || '../') + m.link.href) + '" data-ps-link>' + esc(m.link.text) + '</a></p>' : '');
    }
    function paintChips() {
      chips.hidden = kinds.length < 2; chips.innerHTML = kinds.length < 2 ? '' : kinds.map((k) => '<button type="button" class="ps-chip" data-v="' + k + '" aria-pressed="' + (k === kind) + '">' + esc(NAME[k]) + '</button>').join('');
      [].forEach.call(chips.querySelectorAll('button'), (b) => b.addEventListener('click', () => { kind = b.dataset.v; store.set(Object.assign(store.get(), { kind })); paintChips(); label(); draw(); }));
    }
    function label() { em.textContent = kind ? NAME[kind] + (inp.value.trim() ? ', ' + (parse(inp.value).value ? $(parse(inp.value).value) : '') : '') : (cfg.em || ''); }
    inp.addEventListener('input', () => { touched = true; const p = parse(inp.value); store.set(Object.assign(store.get(), { price: p.value > 0 ? p.value : undefined })); label(); draw(); });
    return {
      el: host,
      // list: the types to choose between (one type shows no choice); message: shown instead of the schedule when the type has its own page
      setKinds(list, o) {
        o = o || {}; kinds = list || []; loan = o.loan || loan;
        const keep = kinds.indexOf(kind) >= 0 ? kind : (kinds.indexOf(store.get().kind) >= 0 ? store.get().kind : kinds[0] || null); kind = keep;
        msg.hidden = !o.message; msg.innerHTML = o.message || ''; fld.hidden = !kinds.length; if (!kinds.length) { out.innerHTML = ''; err.hidden = true; }
        paintChips(); label(); if (kinds.length) draw();
      },
      // a price from elsewhere on the page, used only until the buyer types one here
      suggest(price) { if (touched || !(price > 0)) return; inp.value = Math.round(price).toLocaleString('en-US'); label(); draw(); },
      kind: () => kind, open: () => { det.open = true; }
    };
  }
  return { model, html, mount, split, splitHtml, NAME };
});
