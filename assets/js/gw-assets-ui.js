/* ==========================================================================
   GROUNDWORK — Pledged & Unpledged Assets (V3.8, 27 Oct 2026): tools/pledged-assets/
   How eligible financial assets may change what a bank lends. Every figure comes from GW_FIN3.assetLoan (gw-fin3-core.js), which runs the same
   TDSR / MSR engine as How much can I borrow? (GW_CALC.tdsr / msr) with and without the monthly figure MAS counts for the assets
   (GW_CALC.assetIncome: MAS Notice 645 paras 17(e), 19-21). This file adds no rule; it asks, and it says what the engine found.
   Standalone like every calculator opened from Calculators: its entries (sessionStorage gw.fin3.assets.v1) come back only on a refresh or
   Back/Forward, and it neither reads nor writes another calculator's figures. Nothing enters an address, analytics or a WhatsApp message.
   UMD: window.GW_ASSETS_UI in the browser; Node uses pageHtml() to write the page.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GW_ASSETS_UI = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');
  const $r = (n) => '$' + (Math.floor((n || 0) / 1000) * 1000).toLocaleString('en-US');   // a loan, rounded down to $1,000
  const pc = (x) => Math.round(x * 1000) / 10 + '%';
  const yrs = (n) => n + (n === 1 ? ' year' : ' years');

  /* ---------------- markup (the same field classes as the other calculators) ---------------- */
  const money = (k, label, o) => { o = o || {}; return '<label class="f3-f' + (o.cls ? ' ' + o.cls : '') + '"><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><span class="f3-in"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="money"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '></span>' + (o.hint ? '<small>' + o.hint + '</small>' : '') + '<small class="f3-err" data-err="' + k + '" hidden></small></label>'; };
  const numf = (k, label, unit, o) => { o = o || {}; return '<label class="f3-f' + (o.cls ? ' ' + o.cls : '') + '"><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><span class="f3-in"><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="num"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '>' + (unit ? '<i class="u">' + unit + '</i>' : '') + '</span>' + (o.hint ? '<small>' + o.hint + '</small>' : '') + '<small class="f3-err" data-err="' + k + '" hidden></small></label>'; };
  const seg = (k, label, opts, def, o) => { o = o || {}; return '<div class="f3-q' + (o.cls ? ' ' + o.cls : '') + '">' + (label ? '<span class="f3-l" id="f3l-' + k + '">' + label + '</span>' : '') + '<div class="f3-seg" role="group"' + (label ? ' aria-labelledby="f3l-' + k + '"' : ' aria-label="' + esc(o.aria || k) + '"') + ' data-k="' + k + '" data-t="seg" data-def="' + def + '">' + opts.map((x) => '<button type="button" data-v="' + x[0] + '" aria-pressed="' + (x[0] === def) + '">' + x[1] + '</button>').join('') + '</div>' + (o.hint ? '<small class="f3-h">' + o.hint + '</small>' : '') + '</div>'; };

  function pageHtml() {
    return '<section class="f3 f3-frame f3-borrowpage f3-assetpage" data-assets><div class="f3-grid f3-grid-pay"><form class="f3-form" novalidate>' +
      seg('pledged', '', [['1', 'Pledged'], ['0', 'Unpledged']], '1', { aria: 'How the assets are held', cls: 'f3-pltog', hint: '<span data-pl="1">Pledged with the lending bank for at least 4 years.</span><span data-pl="0" hidden>Kept in your own name; not pledged, or pledged for less than 4 years.</span>' }) +
      money('value', 'Savings and investments', { ph: 'e.g. 500,000', cls: 'f3-big' }) +
      seg('kind', 'What they are', [['cash', 'Cash and SGD deposits'], ['other', 'Investments']], 'cash', { hint: 'Investments: shares, bonds, unit trusts, gold, foreign currency and structured deposits. CPF savings, property, insurance policies and crypto don’t count.' }) +
      '<div class="f3-g2">' + money('fixed', 'Monthly income', { ph: 'before CPF, e.g. 6,000', hint: 'Salary before CPF. 0 if none.' }) + numf('age', 'Age', 'years', { ph: 'e.g. 35' }) + '</div>' +
      seg('homeLoans', 'Housing loans still running', [['0', 'None'], ['1', 'One'], ['2', 'Two or more']], '0', { hint: 'Sets the loan limit on a price: 75% with none, 45% with one, 35% with two or more.' }) +
      '<div data-hl hidden>' + money('homeDebts', 'Home-loan repayments, a month', { ph: 'e.g. 1,300', hint: 'For the housing loans still running.' }) + '<p class="f3-bfneed" data-need-hd hidden>Add the monthly repayment: the loan is still running.</p></div>' +
      money('debts', 'Other loan repayments, a month', { opt: true, ph: '0 if none', hint: 'Car, personal and other loans.' }) +
      seg('prop', 'Buying', [['private', 'Private home'], ['hdb', 'HDB flat, bank loan'], ['ec', 'New EC']], 'private', { hint: '<span data-pr="hdb" hidden>HDB assesses its own loans and doesn’t follow these MAS rules, so this is for a bank loan. </span><span data-pr="hdb,ec" hidden>Home-loan repayments are held to 30% of income (MSR), with the assets counted.</span>' }) +
      '<details class="f3-as" data-as><summary><span>Bonus, interest rate and tenure</span> <em data-as-sum>4% · longest standard tenure</em></summary><div class="f3-g2">' +
      money('bonusYr', 'Bonus and commission, a year', { opt: true, ph: 'e.g. 24,000', hint: 'Banks count 70% of it.' }) + numf('ratePct', 'Interest rate', '% a year', { ph: '4', hint: 'Tested at 4% or this rate, whichever is higher.' }) +
      numf('years', 'Loan tenure', 'years', { ph: 'longest', hint: 'Blank: the longest that ends by 65.' }) + '</div></details>' +
      '</form><div class="f3-out f3-out-pay" aria-label="Your answer"><div class="f3-card f3-card-pay"><div data-out aria-live="polite"></div>' +
      '<div class="f3-opts"><details class="f3-in-d" data-tgt><summary>Check a price or a loan you want</summary><div class="f3-cmpin"><div class="f3-g2">' +
      money('price', 'Property price', { opt: true, ph: 'e.g. 1,800,000' }) + money('target', 'Loan you want', { opt: true, ph: 'e.g. 1,200,000' }) + '</div><div data-tgt-out aria-live="polite"></div></div></details>' +
      '<details class="f3-in-d" data-why hidden><summary>How it is worked out</summary><ul class="f3-why" data-why-out></ul></details></div></div>' +
      '</div></div><div class="f3-bar" data-bar hidden></div></section>';
  }

  /* ---------------- browser ---------------- */
  function mount() {
    if (typeof document === 'undefined') return;
    const box = document.querySelector('[data-assets]'); if (!box) return;
    const C = root.GW_CALC, F = root.GW_FIN3, R = root.GW_RULES, KPT = root.KPT || { track: function () {} };
    if (!C || !F || !R || !F.assetLoan) return;
    const q = (s) => box.querySelector(s), $$ = (s, el) => [].slice.call((el || box).querySelectorAll(s));
    const out = q('[data-out]'), bar = q('[data-bar]'), why = q('[data-why]'), whyOut = q('[data-why-out]'), tgtOut = q('[data-tgt-out]');
    const track = (n) => { try { KPT.track(n, { tool_name: 'pledged-assets' }); } catch (e) { /* analytics unavailable */ } };
    // standalone: a new visit starts blank; a refresh or Back/Forward brings this page's own entries back
    const KEY = 'gw.fin3.assets.v1';
    const again = (() => { try { const n = root.performance.getEntriesByType('navigation')[0]; return !!n && (n.type === 'reload' || n.type === 'back_forward'); } catch (e) { return false; } })();
    const store = { get() { try { return JSON.parse(root.sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }, set(o) { try { root.sessionStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* storage blocked */ } }, del() { try { root.sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } } };
    if (!again) store.del();
    const segVal = (g) => { const b = g.querySelector('[aria-pressed="true"]'); return b ? b.dataset.v : g.dataset.def; };
    const setSeg = (g, v) => $$('button', g).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    function readAll() { const o = {}; $$('[data-k]').forEach((x) => { o[x.dataset.k] = x.dataset.t === 'seg' ? segVal(x) : x.value; }); return o; }
    (function restore() { const s = store.get(); if (!s || !s.raw) return; $$('[data-k]').forEach((x) => { const v = s.raw[x.dataset.k]; if (v === undefined) return; if (x.dataset.t === 'seg') setSeg(x, v); else x.value = v; }); if (s.raw.price || s.raw.target) q('[data-tgt]').open = true; })();
    const L = C.LIMITS;
    const mv = (s) => { if (s == null || String(s).trim() === '') return null; const p = C.parseMoney(String(s)); return p.error || p.value === undefined ? NaN : p.value; };
    const nv = (s) => { if (s == null || String(s).trim() === '') return null; const p = C.parseNum(String(s)); return p.error || p.value === undefined ? NaN : p.value; };
    if (root.GW_MONEY) $$('input[data-t="money"]').forEach((x) => root.GW_MONEY.wire(x, { parse: (t) => { const v = mv(t); return v === null || Number.isNaN(v) ? null : v; }, max: L.money.max }));
    let errs = {};
    function stOf(o) {
      errs = {};
      const M = (k, lim) => { const v = mv(o[k]); if (Number.isNaN(v)) { errs[k] = 'Type an amount, e.g. 5,000.'; return null; } if (v !== null && v > (lim || L.money.max)) { errs[k] = 'That is more than this calculator takes.'; return null; } return v; };
      const N = (k, lo, hi, text) => { const v = nv(o[k]); if (Number.isNaN(v)) { errs[k] = 'Type a number.'; return null; } if (v !== null && (v < lo || v > hi)) { errs[k] = text; return null; } return v; };
      const by = M('bonusYr');
      return { age: N('age', L.age.min, L.age.max, 'Enter an age between ' + L.age.min + ' and ' + L.age.max + '.'), fixed: M('fixed', L.income.max), variable: by === null ? null : by / 12, debts: M('debts'), homeDebts: M('homeDebts'),
        homeLoans: +(o.homeLoans || 0), prop: o.prop || 'private', value: M('value'), kind: o.kind === 'other' ? 'other' : 'cash', pledged: o.pledged !== '0',
        price: M('price'), target: M('target'), ratePct: N('ratePct', L.ratePct.min, L.ratePct.max, 'Enter a rate between ' + L.ratePct.min + '% and ' + L.ratePct.max + '%.'), years: N('years', L.years.min, L.years.max, 'Enter between ' + L.years.min + ' and ' + L.years.max + ' years.') };
    }
    function showErrs() { $$('[data-err]').forEach((el) => { const t = errs[el.dataset.err] || ''; el.hidden = !t; el.textContent = t; const f = el.closest('.f3-f'); if (f) f.classList.toggle('bad', !!t); }); }
    // ---- recalculation: as you type, never moving the cursor (the fields are only read, never rewritten, here) ----
    let tmr = null, started = false, completed = false;
    root.__f3Settled = () => tmr === null;
    function changed(now) { if (!started) { started = true; track('tool_started'); } clearTimeout(tmr); tmr = setTimeout(recalc, now === true ? 0 : 120); }
    box.addEventListener('input', () => changed());
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-t="seg"] button'); if (b) { setSeg(b.parentElement, b.dataset.v); changed(true); return; } if (e.target.closest('[data-bar-go]') || e.target.closest('[data-bar]')) { try { q('.f3-out').scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (x) { q('.f3-out').scrollIntoView(); } } });
    if (bar && root.IntersectionObserver) new root.IntersectionObserver((es) => { es.forEach((e) => bar.classList.toggle('f3-bar-on', !e.isIntersecting)); }, { threshold: [0] }).observe(q('.f3-out'));
    const row = (label, fig, sub, cls) => '<div class="f3-ar' + (cls ? ' ' + cls : '') + '"><div class="f3-al"><span class="f3-an">' + label + '</span>' + (sub ? '<span class="f3-asub">' + sub + '</span>' : '') + '</div><div class="f3-af">' + fig + '</div></div>';
    const dash = '<span class="f3-dash">—</span>';
    const INDIC = '<span class="f3-indic" data-indic>Indicative only. Actual loan approval, rates and tenure vary by bank and borrower profile.</span>';
    const KIND = { cash: 'cash', other: 'investments' }, TEST = { tdsr: 'TDSR 55%', msr: 'MSR 30%' };
    function setBar(html) { if (!bar) return; bar.hidden = !html; if (html && bar.__h !== html) { bar.innerHTML = html + '<button type="button" class="f3-lnk" data-bar-go>Details</button>'; bar.__h = html; } }
    function quiet(head, msg) { out.innerHTML = '<p class="f3-eb">' + head + '</p>' + row('Estimated borrowing capacity with assets', dash, 'Over the longest tenure your age allows') + row('Without the assets', dash, 'Your income alone') + row('Additional borrowing capacity', dash, '') + (msg ? '<p class="f3-nh">' + msg + '</p>' : ''); why.hidden = true; setBar(''); tgtOut.innerHTML = ''; }
    function recalc() {
      tmr = null;
      const raw = readAll(), st = stOf(raw);
      showErrs(); store.set({ v: 1, raw: raw });
      $$('[data-pl]').forEach((el) => { el.hidden = el.dataset.pl !== (st.pledged ? '1' : '0'); });
      $$('[data-pr]').forEach((el) => { el.hidden = el.dataset.pr.split(',').indexOf(st.prop) < 0; });
      const hlBox = q('[data-hl]'), needHd = st.homeLoans > 0 && st.homeDebts === null; if (hlBox) hlBox.hidden = !(st.homeLoans > 0); q('[data-need-hd]').hidden = !needHd;
      const asSum = q('[data-as-sum]'); if (asSum) asSum.textContent = (st.ratePct !== null && st.ratePct > 4 ? st.ratePct : 4) + '% · ' + (st.years ? yrs(st.years) : 'longest standard tenure') + (st.variable ? ' · bonus added' : '');
      if (Object.keys(errs).length) { out.innerHTML = '<p class="f3-eb">Check the figures</p><p class="f3-note">' + esc(errs[Object.keys(errs)[0]]) + '</p>'; why.hidden = true; setBar(''); return; }
      if (st.value === null && st.fixed === null) return quiet('Type your savings and investments to begin', '');
      if (needHd && !errs.homeDebts) return quiet('Add the home-loan repayment', 'A housing loan is still running, so its monthly repayment counts against your income. Add it above (0 if none is due).');
      if (st.age === null) return quiet('Add your age', 'Age sets how long the loan can run: banks end most loans by 65 to keep the full loan limit.');
      const a = F.assetLoan(st);
      if (a.state === 'invalid') { out.innerHTML = '<p class="f3-eb">Check the figures</p><p class="f3-note">' + esc(((a.errors || [])[0] || {}).text || 'Check the figures.') + '</p>'; why.hidden = true; setBar(''); return; }
      if (a.state === 'zero') return quiet('No income or assets entered', 'Add a monthly income, or the value of your savings and investments.');
      if (a.state === 'notenure') { quiet('At this age', 'No bank loan tenure fits: banks usually end a loan by age ' + R.bankLtv.maturityAge + '.'); return; }
      if (!completed) { completed = true; track('tool_completed'); }
      const ai = a.asset, hasA = !!ai, P = a.price, lim = a.limit, std = a.ltv, rd = (n) => Math.floor((n || 0) / 1000) * 1000; a.extra = Math.max(0, rd(a.loanWith) - rd(a.loanWithout));
      const head = hasA ? $(ai.value) + ' of ' + KIND[ai.kind] + ', ' + (ai.pledged ? 'pledged' : 'unpledged') : 'On ' + $(st.fixed || 0) + ' a month, before any assets';
      const mainL = P !== null ? 'Estimated loan with assets, for a ' + $(P) + ' home' : 'Estimated borrowing capacity with assets';
      const endAge = Math.round(st.age + a.years);
      const sub1 = 'Over ' + yrs(a.years) + ', ending at age ' + endAge + ' · tested at ' + pc(a.rate) + (a.by === 'ltv' ? ' · held to the ' + pc(std) + ' loan limit' : ' · ' + TEST[a.incomeTest]) + INDIC;
      const extraSub = !hasA ? 'Add your savings or investments above' : a.extra > 0.5 ? (a.by === 'ltv' && a.extraIfNoLimit > a.extra + 1000 ? 'Up to the ' + pc(std) + ' loan limit on this price' : 'What the assets add') : a.by === 'ltv' && a.byWithout === 'ltv' ? 'None for this home: the loan limit applies either way' : 'The assets add nothing here';
      const aiSub = hasA ? (ai.haircut > 0 ? $(ai.value) + ' less ' + pc(ai.haircut) + ', spread over ' + ai.months + ' months' : $(ai.value) + ' in full, spread over ' + ai.months + ' months') : '';
      // the one sentence that says what decides the answer
      let fact;
      if (!hasA) fact = 'Add the value of your savings or investments to see what they add to the loan.';
      else if (a.by === 'ltv' && a.extra < 0.5) fact = 'The assets don’t raise the loan for this home: ' + pc(std) + ' of the price (' + $r(lim) + ') is already within what your income supports. They would matter for a higher price.';
      else if (a.by === 'ltv') fact = 'The assets lift the loan by ' + $r(a.extra) + ', up to the ' + pc(std) + ' loan limit for this price (' + $r(lim) + '). Beyond that, the rest of the price is your down payment.';
      else if (a.capAlt !== null) { const other = ai.pledged ? 'Kept unpledged' : 'Pledged for 4 years'; const d = rd(a.loanAlt === null ? 0 : a.loanAlt) - rd(a.loanWithout); fact = (ai.pledged ? 'Pledged, ' : 'Unpledged, ') + (ai.kind === 'cash' ? 'this cash adds ' : 'these investments add ') + $r(a.extra) + '. ' + other + ', ' + (ai.kind === 'cash' ? 'it' : 'they') + ' would add ' + $r(Math.max(0, d)) + (ai.pledged ? '' : ', with the money held by the bank for 4 years') + '.'; }
      const hold = !hasA ? '' : ai.pledged ? 'Pledged with the lending bank for at least 4 years, this money can’t also pay the down payment or stamp duty.' : ai.kind === 'cash' ? 'Unpledged cash must still be in your account when the loan is disbursed (MAS), so it can’t also pay the down payment.' : 'Banks check the investments are still yours before the loan is disbursed, so the same money can’t also pay the down payment.';
      out.innerHTML = '<p class="f3-eb">' + esc(head) + '</p>' +
        row(mainL, '<span data-answer data-cap>' + $r(a.loanWith) + '</span>', sub1, 'f3-ar1') +
        row('Without the assets', '<span data-without>' + $r(a.loanWithout) + '</span>', P !== null ? 'Your income alone, on this price' : 'Your income alone') +
        row('Additional borrowing capacity', '<span data-extra>' + (a.extra > 0.5 ? '+' + $r(a.extra) : '$0') + '</span>', extraSub) +
        (hasA ? row('Assets counted as income', '<span data-asset-mo>' + $(ai.monthly) + '</span><small>a month</small>', aiSub) : '') +
        (P !== null ? row('Loan limit on this price', $r(lim), pc(std) + ' of ' + $(P) + (st.homeLoans ? ', with ' + (st.homeLoans === 1 ? 'one housing loan' : 'two or more housing loans') + ' running' : ', first housing loan') + (std < R.bankLtv.standard[Math.min(st.homeLoans, 2)].ltv ? ' (the tenure runs past ' + R.bankLtv.endAge + ' or ' + R.bankLtv.standardTenure[st.prop === 'hdb' ? 'hdb' : 'private'] + ' years)' : '')) +
          row('Down payment', $(a.down), 'At least ' + $(a.cashMin) + ' in cash; from money other than the assets counted') : '') +
        (fact ? '<p class="f3-fact" data-fact>' + fact + '</p>' : '') + (hold ? '<p class="f3-fine" data-hold>' + hold + '</p>' : '');
      setBar('<span class="f3-bm"><span class="k">' + (hasA ? 'With assets, about' : 'The bank may lend about') + '</span><b>' + $r(a.loanWith) + '</b><span class="s">' + (hasA ? '+' + $r(a.extra) + ' · without ' + $r(a.loanWithout) : 'Add your assets to compare') + '</span></span>');
      // ---- a target loan: the assets it needs, from the same engine ----
      const t = a.target;
      if (!t) tgtOut.innerHTML = st.price === null && st.target === null ? '' : '<p class="f3-fine">Add the loan you want to see the assets it needs.</p>';
      else if (t.state === 'covered') tgtOut.innerHTML = '<p class="f3-note" data-tgt-state="covered">Your income alone supports a ' + $(t.amount) + ' loan: no assets needed.</p>';
      else if (t.state === 'ltv') tgtOut.innerHTML = '<p class="f3-note" data-tgt-state="ltv">No amount of assets reaches a ' + $(t.amount) + ' loan on a ' + $(P) + ' home: the loan limit is ' + pc(std) + ', ' + $r(t.limit) + '.</p>';
      else if (t.state === 'unreachable') tgtOut.innerHTML = '<p class="f3-note" data-tgt-state="unreachable">Over ' + yrs(a.years) + ', even very large assets don’t reach a ' + $(t.amount) + ' loan.</p>';
      else { const kd = KIND[st.kind];
        tgtOut.innerHTML = '<div class="f3-ar" data-tgt-state="ok"><div class="f3-al"><span class="f3-an">To borrow ' + $(t.amount) + ', about</span><span class="f3-asub">' + kd + ', ' + (st.pledged ? 'pledged' : 'unpledged') + (t.have > 0 ? ' · you’ve entered ' + $(t.have) + (t.short > 0 ? ', so about ' + $(t.short) + ' more' : ', which is enough') : '') + '</span></div><div class="f3-af"><span data-tgt-need>' + $(t.value) + '</span></div></div>' +
          (t.valueAlt !== null ? '<p class="f3-fine">' + (st.pledged ? 'Unpledged' : 'Pledged for 4 years') + ', about ' + $(t.valueAlt) + ' of ' + kd + ' would be needed instead.</p>' : '') + '<p class="f3-fine">Worked out with the same calculation as above, so the two agree.</p>'; }
      // ---- how it is worked out ----
      const inc = (st.fixed || 0) + (st.variable || 0) * (1 - R.variableIncomeHaircut);
      const lines = [];
      if (hasA) lines.push('Assets counted: ' + $(ai.value) + (ai.haircut > 0 ? ' less ' + pc(ai.haircut) : ' in full') + ' ÷ ' + ai.months + ' = ' + $(ai.monthly) + ' a month. MAS Notice 645 sets these as minimums (' + (ai.kind === 'cash' ? 'cash: 0% pledged for 4 years, 70% otherwise' : 'investments: 30% pledged for 4 years, 70% otherwise') + '); a bank may count less, or not accept an asset.');
      lines.push('Income counted: ' + $(st.fixed || 0) + ' salary' + (st.variable ? ' + 70% of ' + $(st.variable) + ' bonus a month' : '') + (hasA ? ' + ' + $(ai.monthly) + ' from the assets' : '') + ' = ' + $(a.income) + ' a month.');
      if (a.forNewMsr !== null) lines.push('Home-loan repayments may take up to 30% of that (MSR)' + (a.homeDebts ? ', less the ' + $(a.homeDebts) + ' on the loan still running' : '') + ': ' + $(a.forNewMsr) + '. All repayments may take up to 55% (TDSR)' + (a.debts ? ', less the ' + $(a.debts) + ' you repay in all' : '') + ': ' + $(a.forNewTdsr) + '. The lower, ' + $(a.forNew) + ' a month, is for the new loan. Car and other loans count only in the 55%.');
      else lines.push('All loan repayments may take up to 55% of that (TDSR)' + (a.debts ? ', less the ' + $(a.debts) + ' you repay' + (a.homeDebts && a.otherDebts ? ' (' + $(a.homeDebts) + ' home loan, ' + $(a.otherDebts) + ' other)' : '') : '') + ': ' + $(a.forNew) + ' a month for the new loan.');
      lines.push('Tested at ' + pc(a.rate) + ' over ' + yrs(a.years) + ' (the higher of 4% and your rate; the tenure ' + (st.years ? 'you chose, within what your age allows' : 'that ends by 65') + '): ' + $(a.forNew) + ' a month supports ' + $r(a.capWith) + '. Without the assets: ' + $r(a.capWithout) + '.');
      if (P !== null) lines.push('Loan limit: ' + pc(std) + ' of ' + $(P) + ' = ' + $r(lim) + ' (MAS Notice 632). The loan is the lower of that and what the income supports.');
      lines.push('The assets must be yours, unencumbered and of a kind MAS lists. This is for one borrower; with two, banks differ on how asset income weights the age that sets the tenure.');
      whyOut.innerHTML = lines.map((x) => '<li>' + x + '</li>').join(''); why.hidden = false;
    }
    recalc();
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }
  return { pageHtml };
});
