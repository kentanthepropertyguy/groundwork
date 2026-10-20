/* ==========================================================================
   GROUNDWORK — Payment Timeline & Cash-Flow Planner: page markup and browser behaviour (R2.6, Ken 15 Oct 2026; R1.1, R1.2 and R1.2.1, 16 Oct 2026).
   Every figure comes from GW_TIMELINE (which composes GW_CALC and GW_RULES). This file draws the inputs, the result and
   the schedule; it does no arithmetic beyond formatting and summing what the engine already returned.
   Privacy: inputs never enter the page address, analytics or advertising events; the WhatsApp message carries only the
   scenario name (no figures); "Copy summary" includes the result and the price, never cash, CPF, income or proceeds.
   Details shared with the other calculators (price, buyers, age, CPF OA) use the same tab-only store (gw.fin.v1);
   the planner's own fields live in gw.plan.v1 for this tab. R1.2.2: one confirmed "Clear all my figures" (gw-nav.js) clears every figure this tab holds; there is no separate planner reset.
   UMD: window.GW_PLANNER in the browser; Node uses pageHtml() to write the page at build time.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GW_PLANNER = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PHONE = '6590908898', waUrl = (m) => 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(m);
  // ---- the developer's dates must make sense (page-level check; the audited engine is untouched and still takes any date it is given) ----
  // Rules: TOP comes after the first construction stage can be called (4 weeks after the S&P); the final payment comes after TOP (the entered one, or the
  // planning estimate when none is entered); a completion date comes after the option is exercised; no date is more than 10 years after the option (a typed-year check).
  // Nothing is corrected silently: a date that fails is refused, with the reason, and no schedule or funding figure is drawn from it.
  const DATE_HORIZON_YEARS = 10;
  function dateProblems(d, sched) {
    const out = [], ISO = /^\d{4}-\d{2}-\d{2}$/, ok = (x) => { if (typeof x !== 'string' || !ISO.test(x)) return false; const t = Date.parse(x + 'T00:00:00Z'); return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === x; };
    if (!ok(d.otp)) return out;
    const SCHED = sched || root.GW_SCHEDULE; if (!SCHED) return out;
    const far = (x) => { const y = +d.otp.slice(0, 4) + DATE_HORIZON_YEARS; return x > y + d.otp.slice(4); };
    const base = SCHED.schedule({ kind: d.kind === 'resaleec' ? 'completed' : d.kind, price: 1000000, otp: d.otp, buyers: [{ res: 'SC', owned: 0 }], dates: {} });
    if (!base.ok) return out;
    const at = (id) => { const e = base.events.filter((x) => x.id === id)[0]; return e ? e.date : null; };
    if (d.kind === 'new' || d.kind === 'ec') {
      const first = base.events.filter((e) => ['foundation', 'frame', 'walls', 'roof', 'fittings', 'roads'].indexOf(e.id) >= 0).map((e) => e.date).sort()[0] || at('snp');
      const hasTop = ok(d.top), hasCsc = ok(d.csc);
      if (d.top && !hasTop) out.push({ k: 'top', text: 'Enter a real date.', short: 'TOP: enter a real date.' });
      if (d.csc && !hasCsc) out.push({ k: 'csc', text: 'Enter a real date.', short: 'Final payment: enter a real date.' });
      let topBad = false;
      if (hasTop) {
        if (d.top <= first) { topBad = true; out.push({ k: 'top', text: 'TOP has to come after the construction stages can start, which is ' + day(first) + ' at the earliest.', short: 'TOP must be after ' + day(first) + '.' }); }
        else if (far(d.top)) { topBad = true; out.push({ k: 'top', text: 'That is more than ' + DATE_HORIZON_YEARS + ' years after your option. Check the year.', short: 'TOP: check the year.' }); }
      }
      const topUsed = hasTop ? d.top : at('top');
      if (hasCsc) {
        if (topUsed && d.csc <= topUsed) out.push({ k: 'csc', text: hasTop ? 'The final payment has to come after TOP (' + day(d.top) + ').' : 'The final payment has to come after TOP, which is planned for ' + day(topUsed) + ' until you add the developer’s TOP date.', short: 'Final payment must be after TOP.' });
        else if (far(d.csc)) out.push({ k: 'csc', text: 'That is more than ' + DATE_HORIZON_YEARS + ' years after your option. Check the year.', short: 'Final payment: check the year.' });
      } else if (hasTop && !topBad && at('csc') && at('csc') <= d.top) {
        out.push({ k: 'csc', text: 'With this TOP, the usual final-payment date (' + day(at('csc')) + ') would fall before it. Add the developer’s final-payment date.', short: 'Add the final-payment date: the usual one falls before TOP.' });
      }
    } else if (d.kind === 'completed' || d.kind === 'resaleec') {
      if (d.completion && !ok(d.completion)) out.push({ k: 'completion', text: 'Enter a real date.', short: 'Completion: enter a real date.' });
      else if (ok(d.completion)) {
        const ex = at('exercise');
        if (ex && d.completion <= ex) out.push({ k: 'completion', text: 'Completion has to come after the option is exercised (' + day(ex) + ').', short: 'Completion must be after ' + day(ex) + '.' });
        else if (far(d.completion)) out.push({ k: 'completion', text: 'That is more than ' + DATE_HORIZON_YEARS + ' years after your option. Check the year.', short: 'Completion: check the year.' });
      }
    }
    return out;
  }
  const REF = 'KPT-CALC-PAY';
  const $ = (n) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
  // short form for the summary strip: $691k, $1.06m, $1.357m (never rounded up)
  const $k = (n) => (n >= 1e6 ? '$' + String(Math.floor(n / 1000) / 1000) + 'm' : n >= 1000 ? '$' + Math.floor(n / 1000).toLocaleString('en-US') + 'k' : $(n));
  const pc = (x, d) => (Math.round(x * 100 * Math.pow(10, d || 0)) / Math.pow(10, d || 0)) + '%';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // No option date (Ken, 21 Oct 2026): the engine counts from a fixed reference day, which is never shown. While a result without an option date is drawn,
  // every date is read back as a timing after the option ("8 weeks after the option"), so a calendar date can never appear that the buyer did not enter.
  let UND = false;
  const afterOpt = (iso) => (root.GW_SCHEDULE && root.GW_SCHEDULE.after ? root.GW_SCHEDULE.after(iso) : '');
  const day = (iso) => { if (UND) return afterOpt(iso); const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? +m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : (iso || ''); };
  const mon = (iso) => { if (UND) return afterOpt(iso); const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? MON[+m[2] - 1] + ' ' + m[1] : (iso || ''); };
  // "on 3 Mar 2027" becomes "10 weeks after the option" (no "on") when there is no option date
  const onDay = (iso) => (UND ? afterOpt(iso) : 'on ' + day(iso));
  const optionText = (iso) => (UND ? 'no option date' : 'option ' + day(iso));
  const KIND = { new: 'new launch, private', ec: 'new EC from the developer', resaleec: 'resale EC', completed: 'completed private home' };
  const kindText = (r, v) => KIND[(v && v.uiKind) || r.kind];
  const TENDER_T = { before: 'before 24 Aug 2026', after: 'on or after 24 Aug 2026' };
  // whether MSR (30% of gross income) is tested besides TDSR: a new EC is always inside its MOP; a resale EC only while it is; unknown stays unknown
  const msrCase = (uiKind, mop) => (uiKind === 'ec' ? 'applies' : uiKind === 'resaleec' ? (mop === 'within' ? 'applies' : mop === 'ended' ? 'not' : 'unknown') : null);
  // fixed plus variable monthly income, as entered (R1.2.2); a caller that only knows `income` gets that figure
  const grossOf = (i) => (i && typeof i.gross === 'number' ? i.gross : ((i && i.income) || 0) + ((i && i.varIncome) || 0));
  const ORDER_T = { buy: 'buy first, then sell', sell: 'sell first, then buy', none: 'no home to sell' };
  // 'unsure' is counted as owed (the cautious view); contracted and undertaking are Notice 632 exclusions that are not verified here, so they are counted as owed unless the bank has confirmed them
  const FLAT = [['outstanding', 'Yes, still owed'], ['none', 'No, fully paid'], ['unsure', 'Not sure'], ['discharged', 'Repaid before the bank assesses']];
  const FLAT_SPECIAL = [['contracted', 'Sale contracted before the bank assesses'], ['undertaking', 'Undertaking to HDB to sell']];
  const RES = [['SC', 'Singapore Citizen'], ['PR', 'Permanent Resident'], ['FR', 'Foreigner']], OWN = [['0', 'None'], ['1', 'One'], ['2', 'Two or more']];
  const OWNED_HINT = 'Count any share in a home, including the flat you are selling, and homes you have signed to buy. Property overseas doesn’t count.';
  const CPF_HINT = 'What CPF allows you to use, not necessarily your whole balance. Your CPF housing limits are not checked.', CPF_HELP = 'CPF cannot pay the booking fee, the minimum cash or stamp duty up front. Your CPF housing limits may cap what you can use further, so the planner may show more CPF than you can actually use.';
  // An HDB flat follows HDB's own loan rules, so no payment timeline is worked out for it: the way on is the HDB and EC loan limit calculator.
  const hdbRoute = () => '<p><b>An HDB flat follows different rules,</b> so no payment timeline is worked out for it here. It has its own loan rules (an HDB loan or a bank loan) and a 30% limit on the loan repayment against your income (MSR).</p><a class="gw-btn pri pl-hdb-go" href="../msr/#hdb-loan" data-pl-hdb>Open the HDB loan limit calculator →</a><p class="gw-fine">Your age carries over from here.</p>';
  const cpfNoteHtml = (i) => ((i.cpf > 0 || (i.sale && i.sale.cpf > 0)) ? '<details class="gw-fine pl-cpfnote"><summary><b>CPF is as you entered it.</b> <em>What that means</em></summary><p>It is not checked against CPF’s valuation limit, withdrawal limit, the home’s lease or your age, so it is not confirmed as usable. Whatever CPF does not allow has to be paid in cash, which makes the shortfall larger.</p></details>' : '');

  /* ---------------- fields (same markup conventions as the other calculators) ---------------- */
  const hint = (h) => (h ? '<small>' + h + '</small>' : '');
  // Contextual help (progressive disclosure): the short line stays visible under the field, the technical detail opens on request. A native details element, so it works without script.
  const help = (t, label) => (t ? '<details class="pl-help"><summary><span class="sr">More detail about ' + esc(String(label).replace(/<[^>]+>/g, '')) + '</span></summary><p>' + t + '</p></details>' : '');
  const withHelp = (labelHtml, o, label) => (o.help ? '<div class="pl-fw">' + labelHtml + help(o.help, label) + '</div>' : labelHtml);
  const money = (k, label, o) => { o = o || {}; return withHelp('<label class="gw-fld"><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><div class="gw-in gw-in-m"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="money"' + (o.share ? ' data-share="' + o.share + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.value ? ' value="' + esc(o.value) + '" data-default="' + esc(o.value) + '"' : '') + ' aria-invalid="false"></div>' + hint(o.hint) + '</label>', o, label); };
  const numf = (k, label, unit, o) => { o = o || {}; return withHelp('<label class="gw-fld"><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><div class="gw-in"><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="num"' + (o.share ? ' data-share="' + o.share + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.value !== undefined ? ' value="' + esc(o.value) + '" data-default="' + esc(o.value) + '"' : '') + ' aria-invalid="false">' + (unit ? '<i class="u">' + unit + '</i>' : '') + '</div>' + hint(o.hint) + '</label>', o, label); };
  const datef = (k, label, o) => { o = o || {}; return '<label class="gw-fld"><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><div class="gw-in"><input type="date" data-k="' + k + '" data-t="date"' + (o.today ? ' data-today="1"' : '') + '></div>' + hint(o.hint) + '</label>'; };
  const chips = (k, label, opts, o) => { o = o || {}; return '<div class="gw-q gw-fld"><span class="l">' + label + '</span><div class="gw-chips" role="group" aria-label="' + esc(label) + '" data-k="' + k + '" data-t="chip"' + (o.share ? ' data-share="' + o.share + '"' : '') + ' data-default="' + esc(o.value) + '">' + opts.map((x) => '<button type="button" class="gw-chip" data-v="' + x[0] + '"' + (x[2] ? ' data-when="' + x[2] + '"' : '') + ' aria-pressed="' + (x[0] === o.value) + '">' + x[1] + '</button>').join('') + '</div>' + hint(o.hint) + help(o.help, label) + '</div>'; };
  const check = (k, label, o) => { o = o || {}; return '<label class="gw-ck"><input type="checkbox" data-k="' + k + '" data-t="check"' + (o.checked ? ' checked data-default="1"' : ' data-default="0"') + '><span>' + label + '</span></label>'; };
  const grid = (inner) => '<div class="gw-grid">' + inner + '</div>';
  function buyersBlock() {
    const row = (n) => '<div class="gw-person" data-row="buyers.' + n + '"' + (n ? ' hidden' : '') + '><p class="gw-ph-l">' + (n ? 'Second buyer <button type="button" class="gw-link" data-remove="buyers.1">Remove</button>' : 'Buyer') + '</p>' +
      chips('buyers.' + n + '.res', 'Residency', RES, { value: 'SC', share: 'buyers.' + n + '.res' }) +
      chips('buyers.' + n + '.owned', 'Residential properties already owned in Singapore, including HDB flats', OWN, { value: '0', share: 'buyers.' + n + '.owned', hint: n ? '' : OWNED_HINT }) + '</div>';
    return row(0) + row(1) + '<button type="button" class="gw-link gw-add" data-add="buyers.1">+ Add a second buyer</button>';
  }
  // A group of related inputs, drawn in the page itself (Concept B: no side rail and no bottom sheet). `data-sheet` names the group so an "Edit" link can reach it.
  const grp = (id, title, inner, o) => { o = o || {}; const h = o.h || 3; return '<section class="pl-grp" data-sheet="' + id + '" aria-labelledby="pls-' + id + '"' + (o.when ? ' data-when="' + o.when + '"' : '') + '><h' + h + ' class="pl-grp-h' + (o.sr ? ' sr' : '') + '" id="pls-' + id + '">' + title + '</h' + h + '><div class="pl-grp-b">' + inner + '<p class="pl-grp-n" data-sheet-note aria-live="polite"></p></div></section>'; };
  const KIND_SHORT = { new: 'New launch', ec: 'New EC', resaleec: 'Resale EC', completed: 'Completed home', hdb: 'HDB flat' };
  const BUYER_DEFAULT = 'Stamp duty is worked out for a Singapore Citizen buying a first home, until you change it.';
  // Every question once, in the part of the page where it is asked. The first three (type, price, option date) are all the Schedule screen needs.
  function parts() {
    const purchase = grp('purchase', 'Your property',
      '<p class="pl-lead pl-prop-lead">Three details give you the whole payment schedule. Nothing about your money is needed.</p>' +
      chips('kind', 'What are you buying?', [['new', 'New launch'], ['ec', 'New EC', 'entity:0'], ['resaleec', 'Resale EC', 'entity:0'], ['completed', 'Completed private home'], ['hdb', 'HDB flat', 'entity:0']], { value: 'new', hint: 'New EC means bought from the developer. A resale EC is bought from its owner and follows different rules.' }) +
      '<div class="pl-route" data-when="kind:hdb" hidden>' + hdbRoute() + '</div>' +
      grid(money('price', 'Purchase price', { share: 'buyPrice', ph: 'e.g. 1,800,000' }) + '<div data-when="noOtp:0">' + datef('otp', 'Option date', { today: true, hint: 'The day you pay the booking or option fee. Every other date counts from here.' }) + '</div>') +
      check('noOtp', 'I don’t have an option date yet') +
      '<details class="pl-buyer" data-buyer><summary><span data-buyer-line>' + BUYER_DEFAULT + '</span> <em>Change</em></summary><div class="pl-buyer-b">' +
      chips('entity', 'Who is buying?', [['0', 'Individuals'], ['1', 'A company or other entity']], { value: '0', hint: 'A company or other entity can borrow up to 15% of the price and has no CPF. It can buy a new launch or a completed private home.' }) +
      '<p class="gw-fine" data-entity-note aria-live="polite" hidden></p><div data-when="entity:0">' + buyersBlock() + '</div></div></details>', { h: 2 });
    const dates = '<details class="pl-adv pl-dates" data-dates data-when="noOtp:0"><summary><span data-when="kind:new,ec">Add the developer’s dates</span><span data-when="kind:completed,resaleec">Add the completion date</span> <em>optional</em></summary>' +
      grp('dates', '<span data-when="kind:new,ec">The developer’s dates</span><span data-when="kind:completed,resaleec">Completion date</span>',
        '<div data-when="kind:new,ec">' + grid(datef('top', 'Developer’s expected TOP', { opt: true }) + datef('csc', 'Expected final payment (CSC)', { opt: true, hint: 'From the developer. Without them, the earliest possible dates are used and marked as earliest dates.' })) + '</div>' +
        '<div data-when="kind:completed,resaleec">' + grid(datef('completion', 'Completion date', { opt: true, hint: 'Without it: 12 weeks after the option (a planning convention).' })) + '</div>', { sr: true }) + '</details>';
    const moneyG = grp('money', 'Your money',
      grid(money('cash', 'Cash available now', { ph: 'e.g. 300,000' }) + '<div data-when="entity:0">' + money('cpf', 'CPF OA you plan to use', { share: 'cpfOa', ph: 'all buyers', hint: CPF_HINT, help: CPF_HELP }) + '</div>'));
    const loanG = grp('buyers', 'You and your loan',
      '<div data-when="entity:0">' + money('income', 'Monthly fixed income, both borrowers', { ph: 'salary, gross, before CPF', hint: 'Fixed pay before CPF, for everyone buying. Type 0 if none: no bank loan is then assumed.', help: 'It sets the loan a bank could lend, and checks a new EC against the household income ceiling. Stays on this device.' }) +
      grid(numf('age', 'Borrower’s age', 'years', { share: 'borrowers.0.age', ph: 'e.g. 35', hint: 'Two borrowers: use their income-weighted average age (results for two borrowers are unverified).', help: 'How much can I borrow? works it out and shows both ways of weighting it. The age sets the loan limit together with the tenure. Which income MAS weights by is not confirmed.' })) + '</div>' +
      grid(numf('ratePct', 'Interest rate you expect', '% a year', { value: '4', hint: 'Used to estimate your monthly mortgage. Borrowing eligibility is assessed at 4% or a higher applicable rate.' }) + numf('years', 'Loan tenure', 'years', { opt: true, ph: 'longest standard', hint: '<span data-tenure-note>Banks can lend for up to 35 years and usually end a loan by age 75 (lender policy, not a MAS rule). Over 30 years, or past age 65, the lower loan limit applies. Enter your age to see where that line falls.</span>' })) +
      money('prefLoan', 'How much would you like to borrow?', { opt: true, ph: 'blank = maximum estimated loan', hint: 'Leave blank to assume the maximum estimated loan. That is not a bank approval.', help: 'Type an amount to borrow less. A smaller loan means more cash and CPF now and a smaller instalment. An amount above the estimated limit is not used: the result shows the limit that applies.' }) +
      '<div data-when="kind:ec">' + chips('tender', 'When did the EC site’s land tender close?', [['unsure', 'Not sure'], ['before', 'Before 24 Aug 2026'], ['after', 'On or after 24 Aug 2026']], { value: 'unsure', hint: 'It sets the household income ceiling for a new EC. A balance unit in an older EC project keeps the lower ceiling, so choose “Before 24 Aug 2026” for it.', help: 'The ceiling is $16,000 a month if the tender closed before 24 Aug 2026, $18,000 if on or after. The developer or HDB can tell you.' }) +
        '<div class="gw-chips" data-k="ecIllus" data-t="chip" data-default="" hidden style="display:none" aria-hidden="true"><button type="button" class="gw-chip" data-v="yes" aria-pressed="false" tabindex="-1">yes</button></div></div>' +
      '<div data-when="kind:resaleec">' + chips('mop', 'Has the EC’s minimum occupation period (MOP) ended?', [['unsure', 'Not sure'], ['ended', 'Yes, it has ended'], ['within', 'No, still within it']], { value: 'unsure', hint: 'If you are not sure, the planner marks the financing as incomplete rather than guessing.', help: 'It decides which income limits the bank applies to the loan. The owner’s agent or HDB can tell you.' }) + '</div>' +
      '<div data-when="own:1">' + chips('loansOther', 'Housing loans on the homes you will keep', [['0', 'None'], ['1', 'One'], ['2', 'Two or more']], { value: '', hint: 'Besides the home you are selling. HDB loans count.', help: 'A home you own outright has no loan, so choose None.' }) + '</div>' +
      '<div data-when="msr:1">' + money('propertyLoans', 'Monthly housing-loan instalments', { opt: true, ph: 'loans you will still have', hint: 'For a new EC, the bank counts every housing-loan instalment you will still have.', help: 'Include the loan on a home you are selling only if the bank will still count it.' }) + '</div>');
    const moreG =
      '<details class="pl-adv pl-loanmore pl-moreopts" data-loanmore><summary>More options <em data-loan-em>monthly savings, CPF top-ups, other income and debts</em></summary><div class="pl-adv-b">' +
        grid(money('saveMo', 'Cash set aside each month', { opt: true, ph: 'e.g. 3,000' }) + '<div data-when="entity:0">' + money('cpfMo', 'CPF OA added each month', { opt: true, ph: 'all buyers', hint: 'Your monthly OA contributions. Not worked out from your income.' }) + '</div>') +
        '<div data-when="entity:0">' + check('payInstalmentFromCpf', 'Pay monthly instalments from CPF OA first, then cash', { checked: true }) + '</div>' +
        '<div data-when="entity:0">' + money('varIncome', 'Monthly variable income, both borrowers', { opt: true, ph: 'bonus, commission, allowances', hint: 'Bonus, commission and allowances, as a monthly average over the last 12 months (a yearly total ÷ 12). Banks count only 70% of it. Type 0 if none; leave it blank and all the income above is treated as fixed salary.' }) +
        money('debts', 'Other monthly debt repayments', { opt: true, ph: 'car, cards, other loans', hint: 'Car, card and other loan repayments, and the instalment on any housing loan you will still have, reduce the loan your income supports.' }) + '</div>' +
      '</div></details>';
    const sale = grp('sale', 'A home to sell',
      chips('order', 'Do you have a home to sell?', [['buy', 'Buy first, then sell'], ['sell', 'Sell first, then buy'], ['none', 'Nothing to sell']], { value: '', hint: 'Choose one. Nothing is assumed.' }) +
      '<div data-when="order:buy,sell">' +
      chips('saleType', 'What are you selling?', [['hdb', 'HDB flat'], ['private', 'Private home']], { value: 'hdb' }) +
      '<div data-when="saleType:private">' + chips('saleHeld', 'Have you owned it for more than 4 years?', [['yes', 'Yes'], ['no', 'No']], { value: '', hint: 'Selling within 4 years brings Seller’s Stamp Duty.', help: 'It depends on when you bought. If you have owned it for 4 years or less, use “Enter your own figures” below.' }) + '</div>' +
      grid(money('salePrice', 'Expected sale price', { ph: 'e.g. 600,000' }) + money('saleLoan', 'Loan left on it', { ph: 'type 0 if none' })) +
      money('saleRefund', 'CPF to be refunded, including accrued interest', { ph: 'from your CPF statement', hint: 'Leave it blank if you do not know yet. We do not estimate the interest, so the sale is not counted until you add it.' }) +
      check('saleOwner55', 'One of the owners is 55 or over (the CPF refund first goes to the Retirement Account)') +
      '<details class="pl-adv" data-ovr><summary>Enter your own figures instead</summary><div class="pl-adv-b">' + grid(money('saleCash', 'Cash you expect from the sale') + money('saleCpf', 'CPF you expect back', { opt: true })) + money('saleCosts', 'Selling costs, agent fee and legal', { opt: true, hint: 'Replaces the usual estimate.' }) + '<p class="gw-fine">When you enter the cash and CPF yourself, we use those figures as they are.</p></div></details>' +
      '<p class="gw-fine pl-sale-est" data-sale-est aria-live="polite"></p>' +
      grid(numf('saleMonth', 'Sale completes', 'months after the option', { value: '5', hint: 'For buy-first: when the sale money arrives. Or enter the completion date below.' }) + datef('saleDate', 'Completion date', { opt: true })) +
      '<div data-when="order:buy">' + chips('flatLoan', 'Do you still owe a housing loan on the home you are selling?', FLAT, { value: '', hint: '“Not sure” is counted as owed, the cautious view.', help: 'A buy-first plan is tested by the bank while the loan is still owed.' }) +
      '<details class="pl-adv" data-ovr><summary>Special cases (not confirmed)</summary><div class="pl-adv-b"><p class="gw-fine">MAS may leave the loan out when the sale is already contracted, or when you have signed an undertaking to HDB to sell. We have not confirmed these exclusions against the Notice, so we still count the loan as owed unless your bank confirms in writing.</p>' + chips('flatLoanSpecial', 'Special case', FLAT_SPECIAL, { value: '' }) + check('flatLoanAccepted', 'My bank has confirmed in writing that it will leave this loan out', {}) + '</div></details></div>' +
      check('removesOwnership', 'The sale removes a home I own (counts for ABSD)', { checked: true }) + '</div>', { when: 'ownany:1', sr: true });
    const refund = grp('refund', 'ABSD refund and interim housing',
      '<div data-when="order:buy"><div class="gw-q gw-fld"><span class="l">ABSD refund</span>' + check('refundAssume', 'Assume the ABSD is refunded after the sale', {}) + '<small data-refund-elig></small></div>' +
      grid(numf('refundMonths', 'Refund arrives', 'months after the sale', { value: '2', hint: 'An assumption: IRAS processes the refund after you apply; the planner never counts it before this date.' })) + '</div>' +
      '<div data-when="order:sell">' + grid(money('rent', 'Interim rent per month', { opt: true, ph: 'while you wait for the keys', hint: 'Paid in cash from the option until the keys (TOP or completion).' })) + '</div>' +
      '', { when: 'order:buy,sell' });
    return { purchase, dates, money: moneyG, loan: loanG, more: moreG, sale, refund };
  }
  // every field, for callers (and tests) that want the whole set in one string
  function formHtml() { const p = parts(); return p.purchase + p.dates + p.money + p.loan + p.sale + p.refund + p.more; }

  /* ---------------- page ---------------- */
  // Concept B: your property (open for a new visitor, a one-line summary once entered), then two screens: 1 Payment schedule (needs only the property),
  // 2 Funding check (optional: cash, CPF, age, income). Both screens are always in the page; the one not shown is not displayed, never removed.
  function pageHtml() {
    const p = parts();
    const tab = (id, n, t, sub, opt) => '<button type="button" role="tab" class="pl-tab" id="pl-t-' + id + '" aria-selected="' + (id === 'schedule') + '" aria-controls="pl-p-' + id + '" data-tab="' + id + '" tabindex="' + (id === 'schedule' ? '0' : '-1') + '"><b>' + n + ' · ' + t + '</b><small>' + sub + '</small>' + (opt ? '<span class="pl-opt-tag">Optional</span>' : '') + '</button>';
    return '<section class="gw-plan pl" data-plan>' +
      '<div class="pl-prop" data-prop><div class="pl-prop-bar" data-prop-bar><div class="pl-prop-bar-t"><p class="pl-kick">Your property</p><p class="pl-prop-sum" data-prop-sum></p></div><button type="button" class="pl-prop-edit" data-prop-edit aria-expanded="false" aria-controls="pl-prop-form">Edit</button></div>' +
      '<div class="pl-prop-form" id="pl-prop-form" data-prop-form>' + p.purchase + '</div></div>' +
      '<div class="pl-screens" data-screens>' +
      '<div class="pl-tabs" role="tablist" aria-label="Payment timeline screens" data-tabs>' + tab('schedule', '1', 'Payment schedule', 'When and how much', false) + tab('funding', '2', 'Funding check', 'Can you cover it?', true) + '</div>' +
      /* ---- screen 1 ---- */
      '<div class="pl-panel" role="tabpanel" id="pl-p-schedule" aria-labelledby="pl-t-schedule" data-panel="schedule">' +
      '<h2 class="pl-h2" tabindex="-1" data-focus>When you pay, and how much</h2><p class="pl-lead pl-sr" data-sched-lead aria-live="polite"></p>' +
      '<div class="pl-sum pl-sum-s" data-sched-sum></div>' +
      '<div class="pl-sched-note" data-sched-note></div>' +
      '<div class="pl-journey" data-sched-table></div>' +
      '<p class="pl-quote" data-sched-quote hidden>Illustrative only. It does not confirm a loan or that your funds are enough.</p>' +
      '<div class="pl-cta" data-sched-cta hidden><button type="button" class="gw-btn pri" data-go-funding>Check against my funds →</button><span class="pl-cta-n" data-funds-ready hidden></span></div>' +
      p.dates +
      '<details class="pl-how2" data-how><summary>How these dates and amounts are worked out</summary><div class="pl-how2-b" data-how-b></div></details>' +
      '</div>' +
      /* ---- screen 2 ---- */
      '<div class="pl-panel is-off" role="tabpanel" id="pl-p-funding" aria-labelledby="pl-t-funding" data-panel="funding">' +
      '<h2 class="pl-h2" tabindex="-1" data-focus>Can your cash, CPF and loan cover it?</h2>' +
      '<p class="pl-lead">Optional. Your cash and CPF are not verified and the loan is an estimate, not a bank approval. Everything stays on this device.</p>' +
      '<p class="pl-grp-n pl-else" data-else-note aria-live="polite"></p>' +
      '<div class="pl-fund" data-fund><div class="pl-fund-bar" data-fund-bar><div class="pl-prop-bar-t"><p class="pl-kick">Your money and loan</p><p class="pl-prop-sum" data-fund-sum></p></div><button type="button" class="pl-prop-edit" data-fund-edit aria-expanded="true" aria-controls="pl-fund-form">Edit</button></div>' +
      '<div class="pl-fform" id="pl-fund-form">' + p.money + p.loan + p.sale + p.refund + p.more + '</div></div>' +
      '<div class="pl-order" data-order-switch role="group" aria-label="Order of moves"><button type="button" data-order="buy" aria-pressed="false">Buy first, then sell</button><button type="button" data-order="sell" aria-pressed="false">Sell first, then buy</button></div>' +
      '<div class="pl-verdict" data-verdict aria-live="polite"></div>' +
      '<div class="pl-sum" data-sum></div>' +
      '<div class="pl-journey" data-timeline></div>' +
      '<div class="pl-result" data-result aria-live="polite"></div>' +
      '<div class="pl-instal" data-instal></div>' +
      '<details class="pl-more" data-more data-tech hidden><summary><span>Show details</span><em data-more-em>your estimated bank loan</em></summary><div class="pl-more-in">' +
      '<div class="pl-detail" data-detail></div>' +
      '<div class="pl-compare" data-compare></div>' +
      '</div></details>' +
      '<div class="pl-assume" data-assume aria-label="Your details"></div>' +
      '</div>' +
      '</div>' +
      '<div class="pl-acts" data-acts><button type="button" class="gw-btn sec" data-print>Print / save as PDF</button><button type="button" class="gw-btn sec" data-copy>Copy summary</button><span class="gw-fine" data-acts-note aria-live="polite"></span><div class="gw-fine pl-store">Your figures stay in this browser tab (session storage) and are not sent anywhere. <span class="pl-startover"><button type="button" class="pl-linkbtn" data-gw-clear-all aria-expanded="false">Clear all my figures</button></span></div></div>' +
      '<div class="pl-ask" data-ask><div class="pl-ask-in"><div><b>Talk it through with Ken</b><p class="gw-fine">Opens WhatsApp with a short message and none of your figures.</p></div><a class="gw-btn wa" data-ask-wa href="https://wa.me/' + PHONE + '" target="_blank" rel="noopener" data-gw-wa="calc-payment-planner-ask">WhatsApp Ken</a></div>' +
      '<div class="pl-fb" data-fb><span>Was this useful?</span><button type="button" data-fb="yes">Yes</button><button type="button" data-fb="partly">Partly</button><button type="button" data-fb="no">No</button><span class="gw-fine" data-fb-note aria-live="polite"></span></div></div>' +
      '</section>' +
      '<noscript><p class="gw-fine">The planner needs JavaScript. Ken can work the timeline through with you on <a href="' + esc(waUrl('Hi Ken, I’d like help planning the payments for a purchase. (Ref ' + REF + ')')) + '">WhatsApp</a>.</p></noscript>';
  }

  /* ---------------- results (markup) ---------------- */
  const CONF = { rule: ['Rule', 'IRAS / MAS / Housing Developers Rules'], developer: ['Developer', 'a date you supplied'], estimate: ['Estimate', 'a planning convention'], illustrative: ['Illustration', 'typical month, not a date'], assumption: ['Assumption', 'your own figure'] };
  const tag = (c) => '<span class="pl-tag ' + c + '" title="' + esc(CONF[c] ? CONF[c][1] : '') + '">' + (CONF[c] ? CONF[c][0] : c) + '</span>';
  /* ---------------- Phase B: the sale estimate and the loan cases, said plainly ---------------- */
  const MISS = { price: 'expected sale price', loan: 'loan left on it', refund: 'CPF refund including accrued interest', held: 'whether you have owned it for more than 4 years', cash: 'cash you expect', cpf: 'CPF you expect back' };
  function saleLine(e) {
    if (!e) return '';
    if (e.counted) {
      const src = e.source === 'entered' ? 'Using your figures: ' : 'Estimated: ';
      if (e.cash < 0) return src + 'the sale would not cover the loan and costs. You would need to add about <b>' + $(-e.cash) + '</b> of your own cash.';
      if (e.owner55) return src + 'about <b>' + $(e.cash) + '</b> in cash. With an owner aged 55 or over, the <b>' + $(e.cpfRefund || 0) + '</b> CPF refund goes first to the Retirement Account, so none of it is counted here.';
      return src + 'about <b>' + $(e.cash) + '</b> in cash and <b>' + $(e.cpf) + '</b> back into your CPF' + (e.source === 'estimated' ? ', after the loan, selling costs and your CPF refund' : '') + '.';
    }
    const known = e.beforeCpf !== null && e.beforeCpf !== undefined ? 'Known so far: about <b>' + $(Math.max(0, e.beforeCpf)) + '</b> is left after the loan and selling costs, before your CPF refund. ' : '';
    const list = (e.missing || []).map((k) => MISS[k] || k);
    return known + 'Not counted yet' + (list.length ? ': add your ' + list.join(', ') : '') + '.';
  }
  // above the result: the sale is not counted until its figures are in (the timeline then shows no sale money), or the sale does not cover the loan
  function saleNoteHtml(i) {
    if (!i || (i.order !== 'buy' && i.order !== 'sell') || !i.saleEst) return '';
    const e = i.saleEst;
    if (e.counted && e.cash >= 0) return '';
    const head = e.counted ? 'The sale does not cover the loan and costs.' : 'The sale is not counted yet.';
    const tail = e.counted ? (i.order === 'sell' ? ' The shortfall is taken from your cash.' : ' That shortfall is not included in the timeline below.') : ' The timeline below shows no money arriving from the sale, which is the cautious view.';
    return '<div class="pl-st warn pl-salenote" role="status"><span class="pl-st-t"><i class="pl-ic" aria-hidden="true">!</i><span><b>' + head + '</b> ' + saleLine(e) + tail + '</span></span></div>';
  }
  // buy first, loan still owed: a special case that is not confirmed is counted as owed; "not sure" is the cautious view, with what changes if the loan is fully paid beside it
  function loanCaseHtml(r, i, alt) {
    if (i.order !== 'buy') return '';
    const L = r.loan, out = [];
    if (L.special && !L.special.accepted && L.special.ifAccepted) { const a = L.special.ifAccepted; out.push('<li><b>Special case, not confirmed.</b> The loan on the home you are selling is counted as owed, so the loan limit is ' + pc(L.ltv) + ' of the price. If your bank accepts it in writing, the limit would be ' + pc(a.ltv) + ' (up to ' + $(a.loanMax) + '). Tick the box under “Special cases” only after your bank confirms.</li>'); }
    if (L.special && L.special.accepted) out.push('<li><b>You said your bank has confirmed this in writing</b>, so the loan on the home you are selling is left out of the loan limit. Groundwork has not verified this exclusion against the MAS Notice. Check the bank’s letter.</li>');
    if (i.flatUnsure && alt && alt.ok) out.push('<li><b>Cautious view.</b> You are not sure whether you still owe on the home you are selling, so it is counted as owed: the loan limit is ' + pc(L.ltv) + ' of the price. If it is fully paid, the limit would be ' + pc(alt.loan.ltv) + ' (up to ' + $(alt.loan.loanMax) + ').</li>');
    return out.length ? '<ul class="gw-notes pl-warn">' + out.join('') + '</ul>' : '';
  }
  // Funding screen, first read: what the buyer entered (as entered, not verified), what a bank could lend (an estimate, not an approval), the price and the instalment.
  // `carried`: the entries were started in What can I afford? (a note, with the way back). Every figure is the engine's result; nothing is worked out here.
  // The answers a buyer asks for first, in this order: what to pay up front and by when, the stamp duty in it, and the monthly mortgage (with the loan it rests on).
  // Cash and CPF are not repeated here (they are the buyer's own entries, shown in the one-line summary above); the shortfall is the panel that follows.
  function upfrontOf(r) {
    const pays = r.events.filter((e) => e.type === 'pay'), duty = pays.filter((e) => e.id === 'bsd')[0], date = duty ? duty.date : (pays[0] || {}).date;
    return { date: date, amount: pays.filter((e) => e.date <= date).reduce((a, e) => a + e.amount, 0), bsd: duty ? duty.amount : 0, absd: (pays.filter((e) => e.id === 'absd')[0] || {}).amount || 0 };
  }
  // the monthly instalment after each loan release, one step per release as the engine models it (the first release gives the starting instalment, the last the instalment once the whole loan is paid out)
  function instalSteps(r) {
    return stageMark(root.GW_SCHEDULE.annotate(r)).filter((e) => e.type === 'pay' && e.bank > 0).map((e) => ({ date: e.date, basis: e.basis, id: e.id, label: e.label, undated: e.undated === true, firstUndated: e.firstUndated === true, instalment: e.instalment, drawn: e.drawn, bank: e.bank }));
  }
  // the one other documented way to count the instalments (tenure from the first release); null when it makes no material difference
  function otherConvention(r) {
    const pays = r.events.filter((e) => e.type === 'pay' && e.bank > 0), S = root.GW_SCHEDULE; if (!pays.length || !S.tenureFromFirstRelease) return null;
    const alt = S.tenureFromFirstRelease(pays.map((e) => ({ date: e.date, amount: e.bank })), r.loan.ratePct, r.loan.years), mine = pays[pays.length - 1].instalment;
    if (!alt || !(mine > 0)) return null; const up = alt.final / mine - 1;
    return up >= 0.005 ? { final: alt.final, pct: Math.round(up * 100) } : null;
  }
  function sumHtml(r, v, scn, carried) {
    const L = r.loan, steps = instalSteps(r), last = steps[steps.length - 1];
    const used = L.loanMax, req = typeof v.prefLoan === 'number' && v.prefLoan >= 0 ? v.prefLoan : null;
    // the estimated limit: the lower of the rule limit (price x loan-to-value) and what the income supports, as sized() worked them out; never the bank's approval
    const limit = scn && typeof scn.limit === 'number' ? scn.limit : (L.ruleLoanMax !== undefined ? L.ruleLoanMax : used), why = (scn && scn.why) || 'rule';
    const ltvWords = pc(L.ltv) + ' of the purchase price' + (L.lowerWhy === 'tenure' ? ' (tenure over 30 years)' : L.lowerWhy === 'age' ? ' (the loan would run past age 65)' : '');
    const limitWords = why === 'income' ? 'limited by your income' : why === 'mop' ? 'limited by the lower of two income limits' : why === 'zero' ? 'no income entered' : ltvWords;
    const t = (cls, k, val, sub) => '<div class="pl-sf' + (cls ? ' ' + cls : '') + '"><span class="k">' + k + '</span><span class="v">' + val + '</span><span class="s">' + sub + '</span></div>';
    const joint = (v.buyers || []).length > 1 && grossOf(v) > 0 ? '<p class="pl-note">Two buyers: banks may use a different age when working out the loan, so check which age yours uses.</p>' : '';
    // three states, kept apart: the default maximum assumption, the buyer's own amount, and an amount held down by the lending limits (never swapped without saying so)
    let basis, adj = '';
    if (req === null) basis = why === 'zero' ? 'No bank loan assumed: no income entered' : used < 0.5 ? (limit < 0.5 ? 'No bank loan: the estimated limit is $0 on these figures' : 'No bank loan needed: your cash and CPF cover the payments') : 'Assumes maximum estimated loan · ' + limitWords;
    else if (req > limit + 0.5) { basis = 'Limited by lending limits · ' + (why === 'income' ? 'what your income supports' : why === 'mop' ? 'the lower of two income limits' : limitWords); adj = '<span class="pl-adj" role="status">You requested <b>' + $(req) + '</b>. Your estimated loan limit is <b>' + $(limit) + '</b>, so calculations use <b>' + $(used) + '</b>.</span>'; }
    else basis = req < 0.5 ? 'Your choice · no bank loan' : 'Your choice' + (req < limit - 0.5 ? ' · the estimated limit is ' + $(limit) : ' · the same as the estimated limit');
    const loanBlock = t('pl-sf-loan', 'Estimated bank loan', $(used), esc(basis) + adj);
    const first = steps[0], startTail = first && !first.undated ? ' The first is ' + esc(onDay(first.date)) + '.' : '';
    const mo = last ? t('pl-sf-w', 'Estimated monthly mortgage after full disbursement', $(last.instalment) + '<small>/month</small>', '<span class="pl-sf-rt">' + pc(L.ratePct / 100, 2) + ' interest · ' + L.years + ' years</span>' + (steps.length > 1 ? 'Starts at about <b>' + $(first.instalment) + '</b>/month after the bank’s first release and rises with each release as construction progresses.' + startTail : 'From ' + esc(day(last.date)) + '.') + '<span class="pl-sf-l">Illustrative estimates, not bank approval or confirmed instalments.</span>') : '';
    // a $0 the buyer typed is "No bank loan selected": it says nothing about whether cash and CPF cover the purchase, so any shortfall above still stands.
    // "No mortgage needed" is said only when the calculation confirms there is no shortfall to borrow for.
    const chosenZero = req !== null && req < 0.5, covered = !r.headline.firstGap;
    const mo0 = last ? mo : (L.loanMax < 0.5 ? (chosenZero ? t('pl-sf-w', 'Estimated monthly mortgage', 'No bank loan selected', 'You entered $0, so no monthly repayment is shown.' + (covered ? '' : ' The shortfall above still applies.')) : covered ? t('pl-sf-w', 'Estimated monthly mortgage', 'No mortgage needed', 'You are not borrowing, so there is no monthly repayment.') : t('pl-sf-w', 'Estimated monthly mortgage', 'No mortgage estimated', 'On these figures the loan limit is $0, so no repayment is shown. The bank decides what it actually lends.')) : '');
    return (carried ? '<p class="pl-carried">Started from <a href="../planner/" data-pl-back>What can I afford?</a> Change any detail here.</p>' : '') +
      '<div class="pl-sumbox"><div class="pl-sumtop pl-sumtop-1">' + loanBlock + mo0 + '</div></div>' + joint +
      (r.entity ? '<p class="pl-note">A company or other entity can borrow up to 15% of the price (MAS), with no income test here and no CPF, so the rest of each payment is cash.</p>' : '');
  }
  // screen 1: what to pay up front and when, and the total (the rows below are the answer to "when")
  function schedSumHtml(s) {
    const lastE = s.events[s.events.length - 1], f0 = s.events[0];
    // the first scheduled payment, then the others that fall due by the stamp duty date, each with its own date (the calculator does not know what has already been paid)
    const NM = { snp: 'S&P', bsd: 'stamp duty', absd: 'stamp duty', exercise: 'option exercise' }, then = [];
    s.events.filter((e, k) => k > 0 && e.date <= s.duty.date).forEach((e) => { const nm = esc(NM[e.id] || lcFirst(SHORT_NAME[e.id] || e.label)), key = nm + '|' + e.date, g = then.filter((x) => x.key === key)[0]; if (g) g.amount += e.amount; else then.push({ key: key, nm: nm, date: e.date, amount: e.amount }); });
    const thenItems = then.map((x) => $(x.amount) + ' ' + esc(onDay(x.date)) + ' (' + x.nm + ')'), thenTxt = thenItems.length > 1 ? thenItems.slice(0, -1).join(', ') + ' and ' + thenItems[thenItems.length - 1] : (thenItems[0] || '');
    const firstSub = esc(SHORT_NAME[f0.id] || f0.label) + ', due ' + esc(UND ? 'on the option date' : day(f0.date)) + '';
    const t = (k, val, sub) => '<div class="pl-sf"><span class="k">' + k + '</span><span class="v">' + val + '</span><span class="s">' + sub + '</span></div>';
    return '<div class="pl-sumbox"><div class="pl-sumtop pl-sumtop-2">' + t('First scheduled payment', $(f0.amount), firstSub) + t('Total to pay', $(s.totals.amount), 'Last payment ' + esc(dateLabel(lastE.date, lastE.basis, lastE.id)) + (lastE.basis === 'estimate' ? ', estimated' : '')) + '</div>' + (thenTxt ? '<p class="pl-sf-then">Then ' + thenTxt + '.</p>' : '') + '</div>';
  }
  // One plain sentence about the loan (replaces the loan-comparison panel). Skipped when a note above already says the loan is only an illustration.
  let lastPref = null;
  function loanLine(r, ill) {
    const L = r.loan; if (ill && ill.length) return '';
    return (L.capped && L.ruleLoanMax !== undefined && lastPref !== null && Math.abs(L.loanMax - lastPref) < 1 ? '<p class="pl-loanline">You chose to borrow <b>' + $(L.loanMax) + '</b>. The most the numbers allow is more. A smaller loan means more cash and CPF now and a smaller instalment.</p>' : '<p class="pl-loanline">Based on ' + (L.capped ? 'your income and loan tenure' : 'the price and loan tenure') + ', your estimated bank loan is <b>' + $(L.loanMax) + '</b>' + (L.capped ? '' : ', ' + pc(L.ltv) + ' of the price') + '. The bank decides what it actually lends.</p>');
  }
  // engine notes that matter to this buyer (refund conditions); the shortfall note repeats the verdict, so it is left out
  function warnHtml(r) {
    const w = (r.warnings || []).filter((x) => x.id !== 'uncovered-end'); if (!w.length) return '';
    return '<ul class="gw-notes pl-warn">' + w.map((x) => '<li>' + esc(x.text) + '</li>').join('') + '</ul>';
  }
  // the first payment that cannot be met in full, read from the engine's own events (no calculation here)
  function firstMiss(r) {
    const h = r.headline; if (!h.firstGap) return {};
    const e = r.events.filter((x) => x.type === 'pay' && x.date === h.firstGap && x.uncovered > 0)[0];
    return e ? { label: e.label, amount: e.uncovered, conf: e.confidence } : { label: 'Monthly instalment' + (r.order === 'sell' ? ' and rent' : ''), amount: 0 };
  }
  // a construction-stage date the buyer did not supply is the planner's estimate (new launch or EC only), not the developer's schedule
  // lower-case the first word of a payment name in a sentence, but leave acronyms (ABSD 20%) as they are
  const lcFirst = (t) => String(t).replace(/^[A-Z](?=[a-z])/, (m) => m.toLowerCase());
  const estConf = (c) => c === 'estimate' || c === 'illustrative';
  const estDate = (r, fm) => (r.kind === 'new' || r.kind === 'ec') && estConf(fm && fm.conf);
  // the row that opens the Construction dates sheet (TOP and final payment for a new launch or EC; completion for a completed home)
  const datesRow = (r, v) => {
    const k = (v && v.uiKind) || r.kind, d = (v && v.dates) || {};
    if (k === 'new' || k === 'ec') { const t = [d.top ? 'TOP ' + day(d.top) : '', d.csc ? 'final payment ' + day(d.csc) : ''].filter(Boolean); return ['dates', 'Construction dates', t.length ? t.join(' · ') : 'not entered · earliest possible dates used']; }
    return ['dates', 'Completion date', d.completion ? day(d.completion) : 'not entered · 12 weeks after the option'];
  };
  function assumeHtml(r, v) {
    const rows = [
      ['purchase', 'Purchase', $(r.price) + ' · ' + kindText(r, v) + ' · ' + optionText(r.otp)],
      datesRow(r, v),
      ['money', 'Money now', r.entity ? 'cash ' + $(v.cash || 0) + (v.saveMo ? ' · +' + $(v.saveMo) + ' a month' : ' · no monthly savings added') : 'cash ' + $(v.cash || 0) + ' · CPF OA ' + $(v.cpf || 0) + (v.saveMo || v.cpfMo ? ' · +' + $(v.saveMo || 0) + ' / +' + $(v.cpfMo || 0) + ' a month' : ' · no monthly savings added')],
      ['buyers', 'Loan', 'Estimated bank loan: ' + $(r.loan.loanMax) + ' over ' + r.loan.years + ' years · interest ' + pc(r.loan.ratePct / 100, 2) + (r.entity ? ' · company or other entity' : ' · borrower age ' + (Number.isInteger(+v.age) ? v.age : (+v.age).toFixed(1)))],
      ['sale', r.order === 'none' ? 'Sale' : 'Home you are selling', r.order === 'none' ? 'nothing to sell' : (r.order === 'sell' ? 'sold before the option · ' : 'completes ' + day(r.saleDate) + ' · ') + (v.saleEst && !v.saleEst.counted ? 'not counted yet · ' : '') + $(v.sale.cash || 0) + ' cash · ' + $(v.sale.cpf || 0) + ' to CPF · loan ' + (r.loan.flatLoan === 'sold' ? 'discharged on sale' : r.loan.flatLoan === 'outstanding' ? (v.flatUnsure ? 'counted as owed (not sure)' : 'still owed') : r.loan.flatLoan)],
      ['refund', r.order === 'sell' ? 'Interim rent' : 'ABSD refund', r.order === 'sell' ? (v.rent && v.rent.monthly ? $(v.rent.monthly) + ' a month until the keys' : 'none entered') : r.order === 'none' ? '—' : (r.duty.absd > 0 ? (v.refund && v.refund.assume ? 'assumed ' + (v.refund.monthsAfterSale || 2) + ' months after the sale · never guaranteed' : 'not assumed') : 'no ABSD on this purchase')],
    ];
    return '<p class="pl-kick">Your details</p><div class="pl-arows">' + rows.map((x) => '<button type="button" class="pl-arow" data-open="' + x[0] + '"><span><b>' + x[1] + '</b><em>' + esc(x[2]) + '</em></span><i aria-hidden="true">Edit</i></button>').join('') + '</div>';
  }
  // each order's first shortfall, read from its own events (the same figure the verdict gives); the later running total is not shown
  const firstShort = (t) => { const h = t.headline; if (!(h.peak > 0)) return 'None'; const fm = firstMiss(t); return $(fm.amount > 0 ? fm.amount : h.peak); };
  function compareHtml(c) {
    if (!c || !c.ok) return '';
    const L = {}; c.lines.forEach((l) => { L[l.id] = l; });
    const row = (label, a, b) => '<div class="pl-crow"><span>' + label + '</span><b>' + a + '</b><b>' + b + '</b></div>';
    return '<p class="pl-kick">Buy first or sell first</p><div class="pl-cmp"><div class="pl-crow h"><span></span><b>Buy first</b><b>Sell first</b></div>' +
      row('First shortfall', firstShort(c.buy), firstShort(c.sell)) + row('ABSD paid up front', $(L.absd.buy), $(L.absd.sell)) + row('Interim rent, total', $(L.rent.buy), $(L.rent.sell)) + row('Monthly instalment', $(L.instal.buy), $(L.instal.sell)) + '</div>';
  }
  /* ---------------- Concept B: the payment list, the shortfall and the repayments ---------------- */
  // Every date, amount and split below is read from the schedule adapter (screen 1) or the audited engine (screen 2). The page formats them and adds up what it shows.
  const SHORT_NAME = { otp: 'Booking fee', snp: 'S&P signed', bsd: 'Stamp duty', absd: 'Stamp duty', top: 'TOP', csc: 'Final payment', option: 'Option fee', exercise: 'Option exercised', completion: 'Completion' };
  // an estimated date is shown as a month, never a day it could be mistaken for a deadline (the buyer's own option date stays a day)
  let KIND_NOW = 'new';
  // with no option date, a payment fixed by rule says how long after what it falls; the rest are read as a timing after the option
  const undatedLabel = (date, id) => (id === 'otp' || id === 'option' ? 'On the option date' : id === 'snp' ? 'Within 8 weeks of the option' : id === 'exercise' ? 'Within 14 days of the option' : id === 'bsd' || id === 'absd' ? 'Within 14 days of ' + (KIND_NOW === 'completed' ? 'exercising' : 'signing the S&P') : afterOpt(date));
  const dateLabel = (date, basis, id) => (UND ? undatedLabel(date, id) : basis === 'estimate' && id !== 'option' ? mon(date) : day(date));
  // Construction stages with no developer date are shown one by one, and no date is invented for them: when each falls due depends on construction progress.
  // The engine tests them one after another from the earliest date a stage could be called, so only the first carries that date, as a floor ("earliest").
  const PROGRESS = 'As construction progresses';
  function stageMark(events) { let seen = false; return events.map((e) => { if (e.type === 'pay' && e.basis === 'earliest') { const o = Object.assign({}, e, { undated: true, firstUndated: !seen }); seen = true; return o; } return e; }); }
  const whenHtml = (e) => (e.undated ? '<span class="pl-prog">' + PROGRESS + '</span>' + (e.firstUndated ? '<small class="pl-early">earliest ' + day(e.date) + '</small>' : '') : dateLabel(e.date, e.basis, e.id) + basisTag(e.basis));
  const basisTag = (b) => '<span class="pl-basis b-' + b + '">' + esc(root.GW_SCHEDULE.BASIS_TAG[b] || b) + '</span>';
  /* ---- the single stage-by-stage list, on both screens (Ken, 19 Oct 2026): every payment in order with its amount; on the funding screen also how it is paid and the monthly mortgage after it. No chart. ---- */
  const payPart = (f, label, v) => (v > 0.005 ? '<span class="pl-pay' + (f === 'short' ? ' bad' : '') + '" data-f="' + f + '" data-v="' + Math.round(v) + '">' + label + '</span>' : '');
  // how a payment is paid, naming only the parts that are used; the loan is named without an amount when it pays the whole payment
  const paidBy = (e) => payPart('cash', 'Cash ' + $(e.cashUsed), e.cashUsed) + payPart('cpf', 'CPF ' + $(e.cpfUsed), e.cpfUsed) + payPart('loan', e.bank > 0.005 && Math.abs(e.bank - e.amount) < 0.5 ? 'Bank loan' : 'Bank loan ' + $(e.bank), e.bank) + payPart('short', 'Not covered ' + $(e.uncovered), e.uncovered);
  const nameCell = (e) => '<div class="pl-nw"><span class="pl-no" aria-hidden="true"></span><span class="pl-nt"><span class="pl-nl"><span class="pl-nb">' + esc(e.label) + '</span>' + (e.pct ? ' <small>' + pc(e.pct) + '</small>' : '') + (e.provisional ? ' <span class="pl-chip est">provisional</span>' : '') + '</span><span class="pl-wh">' + whenHtml(e) + '</span></span></div>';
  // a table drawn as stacked cards on a phone keeps its table meaning for screen readers: the roles say it outright
  const withRoles = (h) => h.replace(/<table /g, '<table role="table" ').replace(/<(thead|tbody|tfoot)>/g, '<$1 role="rowgroup">').replace(/<tr( |>)/g, '<tr role="row"$1').replace(/<td( |>)/g, '<td role="cell"$1').replace(/<th scope="col"/g, '<th role="columnheader" scope="col"').replace(/<th scope="row"/g, '<th role="rowheader" scope="row"').replace(/<th colspan/g, '<th role="columnheader" colspan');
  // screen 1: every payment with its timing and amount; nothing about cash, CPF or the loan
  function scheduleTableHtml(s) {
    const rows = stageMark(s.events).map((e) => '<tr class="pl-jrow pay"><th scope="row" class="nm p">' + nameCell(e) + '</th><td class="n a">' + $(e.amount) + '</td></tr>').join('');
    return withRoles('<h3 class="pl-sr" id="pl-sched-h">All payments</h3><div class="pl-jr-w"><table class="pl-jr" id="pl-sched-table" aria-labelledby="pl-sched-h"><thead><tr><th scope="col" class="nm">Payment</th><th scope="col" class="n">Amount</th></tr></thead><tbody>' + rows + '</tbody><tfoot><tr><th scope="row" class="nm p">Total to pay</th><td class="n a">' + $(s.totals.amount) + '</td></tr></tfoot></table></div>');
  }
  // screen 2: the same list with how each payment is paid (your cash and CPF as entered, the estimated loan, what is not covered) and the monthly mortgage after it
  function fundTableHtml(r) {
    const ev = stageMark(root.GW_SCHEDULE.annotate(r)), newL = r.kind === 'new' || r.kind === 'ec';
    const rows = ev.map((e) => {
      if (e.type === 'in') return '<tr class="pl-jrow in"><th scope="row" class="nm p"><div class="pl-nw"><span class="pl-no in" aria-hidden="true"></span><span class="pl-nt"><span class="pl-nb">' + esc(e.label) + '</span>' + (e.eligible === false ? ' <span class="pl-chip warn">profile not eligible</span>' : '') + '<span class="pl-wh">' + day(e.date) + '</span></span></div></th><td class="n a">+' + $(e.cashIn + (e.cpfIn || 0)) + '</td><td class="by" data-l="How it is paid">' + payPart('cash', 'Cash ' + $(e.cashIn), e.cashIn) + payPart('cpf', 'CPF ' + $(e.cpfIn || 0), e.cpfIn || 0) + '</td><td class="n mo none" data-l="Est. monthly mortgage after">–</td></tr>';
      return '<tr class="pl-jrow pay' + (e.uncovered > 0 ? ' short' : '') + '"><th scope="row" class="nm p">' + nameCell(e) + '</th><td class="n a">' + $(e.amount) + '</td><td class="by" data-l="How it is paid">' + paidBy(e) + '</td>' + (e.bank > 0 && e.instalment ? '<td class="n mo" data-l="Est. monthly mortgage after">' + $(e.instalment) + '/mo</td>' : '<td class="n mo none" data-l="Est. monthly mortgage after">–</td>') + '</tr>';
    }).join('');
    const est = newL && ev.some((e) => e.type === 'pay' && estConf(e.confidence)), prov = ev.filter((e) => e.provisional)[0];
    const notes = (UND ? 'Timings count from your option date, which you have not entered.' : 'Dates count from your option on ' + day(r.otp) + '.') + (est ? ' Construction stages are shown in order with no dates: when each falls due depends on construction progress. For this check they are tested one after another from the earliest date a stage could be called' + (prov ? '. The final 15% is provisional.' : '.') : prov ? ' The final 15% is provisional until the developer’s schedule is confirmed.' : '');
    return withRoles('<h3 class="pl-jr-h" id="pl-fund-h">Your payments, stage by stage</h3><div class="pl-jr-w"><table class="pl-jr pl-jr-f" id="pl-fund-table" aria-labelledby="pl-fund-h"><thead><tr><th scope="col" class="nm">Payment</th><th scope="col" class="n">Amount</th><th scope="col">How it is paid</th><th scope="col" class="n">Est. monthly mortgage after</th></tr></thead><tbody>' + rows + '</tbody><tfoot><tr><th scope="row" class="nm p">Total</th><td class="n a">' + $(r.totals.amount) + '</td><td class="by"></td><td class="n mo none"></td></tr></tfoot></table></div><p class="gw-fine">' + notes + '</p>');
  }
  // the earliest shortfall: how much, which payment, and what its date is (a rule, the developer's, the earliest possible, or an estimate): never an illustrative date called a deadline
  function verdictHtml(r, v) {
    const S = root.GW_SCHEDULE, sf = S.shortfall(r);
    if (!sf.any) return '<div class="pl-st ok" role="status"><span class="pl-st-t"><i class="pl-ic" aria-hidden="true">✓</i><span><b>Every payment is covered on the dates shown</b>' + (v.saveMo || v.cpfMo ? ', with ' + [v.saveMo > 0 ? $(v.saveMo) + ' cash' : '', v.cpfMo > 0 ? $(v.cpfMo) + ' CPF' : ''].filter(Boolean).join(' and ') + ' going in each month' : '') + '.<span class="pl-sf-s">This uses the cash and CPF you entered, which are not verified, and the estimated loan, which is not a bank approval.</span></span></span></div>';
    let head, sub = '';
    if (sf.first) {
      // the total on the payments is the answer (each payment's own unmet part, added once); the first short payment follows, with its timing
      const f = sf.first, und = f.basis === 'earliest', shortP = stageMark(S.annotate(r)).filter((e) => e.type === 'pay' && e.uncovered > 0.005), e1 = shortP[0] || {}, nm = SHORT_NAME[e1.id] || e1.label || f.label;
      head = '<b>' + $(sf.onPayments) + ' not covered in total</b><span class="pl-sf-d">' + (shortP.length > 1 ? 'Short on ' + shortP.length + ' payments, marked in the list below. The first is ' + esc(nm) + '.' : 'One payment is short, marked in the list below: ' + esc(nm) + '.') + '</span><span class="pl-sf-s">' + esc(und ? 'The developer’s notice sets the timing. The earliest it could be called is ' + day(f.date) + '.' : f.sentence) + '</span>';
    }
    else head = '<b>Your payments are covered, but the monthly instalment is not from ' + day(sf.firstGap) + '</b><span class="pl-sf-s">Monthly instalments start the month after the first loan release' + (r.order === 'sell' ? ', and rent runs until the keys' : '') + '.</span>';
    // 18 Oct, evening: Ken replaced his 17 Oct rule (first shortfall only) with the total on the payments as the main answer, and the first short payment beside it
    if (sf.coveredOn && !(sf.stillOpenAtEnd > 0.5)) sub = '<span class="pl-sf-l">Money arriving later closes it ' + onDay(sf.coveredOn) + ' (' + esc(sf.coveredBy) + '). Until then it is a shortfall.</span>';
    return '<div class="pl-st warn" role="status"><span class="pl-st-t"><i class="pl-ic" aria-hidden="true">!</i><span>' + head + sub + '</span></span>' + (v.entity ? '' : '<a class="pl-link" href="../planner/" data-pl-back>Fix it in What can I afford? →</a>') + '</div>';
  }
  // monthly repayments: how the instalment builds up as the bank releases the loan (a closed section; the answer itself is the Monthly mortgage figure above)
  function instalHtml(r, v) {
    const steps = instalSteps(r); if (!steps.length) return '';
    const L = r.loan, oc = otherConvention(r);
    const from = v.payInstalmentFromCpf !== false ? 'Instalments are paid from CPF OA first, then cash.' : 'Instalments are paid from cash.';
    const items = [
      'Interest: <b>' + pc(L.ratePct / 100, 2) + '</b> a year, as you entered it (it starts at 4%). It stays the same for the whole period; a floating rate that changes is not modelled.',
      'Tenure: <b>' + L.years + ' years</b>, ' + (L.tenureCapped && L.tenureCappedBy === 'age' ? 'the most a bank usually lends at your age (banks usually end a loan by age ' + root.GW_RULES.bankLtv.maturityAge + ', a lender policy and not a MAS rule), not the ' + L.tenureAsked + ' you entered.' : 'from your age (the longest that keeps the standard loan limit, or from age 65 the longest a bank usually lends) unless you entered one.'),
      'Illustrative, not confirmed bank instalments. How this is counted: after each release, the level monthly amount (principal and interest) on the total released so far, over the full tenure. This is the audited engine’s convention.' + (oc ? ' <b>It is not the only one.</b> If your bank counts the tenure from your first release and recalculates on the balance still owed, it would be about <b>' + $(oc.final) + '</b> a month once fully released here (' + oc.pct + '% more). We could not confirm either convention from a bank’s own document, so treat these as estimates and ask your bank for its schedule.' : ' Your bank’s own schedule may differ.'),
      'Not modelled: an interest-only period, fees and rate changes.',
      'The loan is an estimate of what a bank could lend. The bank decides what it actually lends.'];
    return '<details class="pl-det pl-instal-d" data-instal-d><summary><span>How the monthly mortgage is worked out</span><em>rate, tenure and method</em></summary><div class="pl-more-in"><p class="gw-fine">' + from + '</p><ul class="pl-assm">' + items.map((x) => '<li>' + x + '</li>').join('') + '</ul></div></details>';
  }
  // what the funding check does not cover, in plain words (the Huttons-style fees and an existing home's loan are not in the engine); the buy-first line is shown, not folded away
  function leavesOutHtml(i, r) {
    const keep = i && i.order === 'buy' ? '<p class="pl-note pl-keep"><b>You chose to buy first.</b> The monthly instalments on the home you still own are not included in this check, although they carry on while the new payments fall due. Allow for them separately.</p>' : '';
    const items = [
      'Costs other than stamp duty: legal and conveyancing fees, valuation and caveat fees, any buyer’s agent fee, renovation and furnishing.',
      'The monthly instalments on any home you keep or are still paying for.',
      'Changes in the interest rate after the date you entered, and any bank fees or penalties.',
      'Whether CPF will allow what you entered: its valuation limit, withdrawal limit, the home’s lease and your age are not checked.',
      'Grants and HDB schemes. An HDB flat is not planned here.'];
    return keep + '<details class="pl-how2" data-leaves-out><summary>What this check leaves out</summary><ul class="pl-assm">' + items.map((x) => '<li>' + x + '</li>').join('') + '</ul></details>';
  }
  // the basis of each date, in words, once per kind present (the table shows the tag; this says what it means)
  function howHtml2(s) {
    const S = root.GW_SCHEDULE, seen = {}, out = [];
    s.events.forEach((e) => { if (!seen[e.basis]) { seen[e.basis] = 1; out.push('<dt>' + basisTag(e.basis) + '</dt><dd>' + esc(S.dateSentence(e, s.kind)) + '</dd>'); } });
    return '<dl class="pl-how2-l">' + out.join('') + '</dl><p class="gw-fine">Amounts: the booking fee and stage percentages come from the Housing Developers Rules; stamp duty is worked out by IRAS’s rates. ' + (s.entity ? 'Duty is worked out at the rates for a company or other entity.' : s.assumedBuyer ? 'Duty assumes a Singapore Citizen buying a first home until you change the buyer.' : 'Duty uses the buyer details you entered.') + ' Nothing here depends on your income, cash, CPF or loan.</p>';
  }
  function scheduleText(s, v) {
    const S = root.GW_SCHEDULE;
    return ['Payment schedule (Groundwork): ' + $(s.price) + ' ' + (KIND[(v && v.uiKind) || s.kind] || s.kind) + ', ' + optionText(s.otp) + '.',
      stageMark(s.events).map((e) => '- ' + (e.undated ? PROGRESS.toLowerCase() + (e.firstUndated ? ', earliest ' + day(e.date) : '') : day(e.date)) + ' ' + e.label + ' ' + $(e.amount) + (e.undated ? (e.provisional ? ' (provisional)' : '') : ' (' + S.BASIS_TAG[e.basis].toLowerCase() + (e.provisional ? ', provisional' : '') + ')')).join('\n'),
      'Total ' + $(s.totals.amount) + '.',
      'An illustrative schedule: it does not confirm a loan or that funds are enough. Dates marked estimated or provisional are planning dates, and construction stages have no dates because they depend on construction progress; none is the developer’s confirmed schedule. Estimates from my own assumptions, not advice. tools.kentanthepropertyguy.com/tools/payment-planner/'].join('\n');
  }
  /* ---------------- R1.2: new-EC household income ceiling, and the loan the timeline assumes ---------------- */
  // The income condition only. E: GW_RULES.ecIncomeCeiling { before, onOrAfter }. tender: 'before' | 'after' | anything else (not known).
  // At or below the ceiling meets it. Three outcomes, never "eligible": the other conditions are HDB's.
  function ecIncomeCheck(income, tender, E) {
    const lo = E.before, hi = E.onOrAfter;
    if (!(income > 0)) return { outcome: 'unknown', need: 'income', lo: lo, hi: hi };
    const known = tender === 'before' ? lo : tender === 'after' ? hi : null;
    if (known !== null) return { outcome: income <= known ? 'meets' : 'exceeds', ceiling: known, tender: tender, lo: lo, hi: hi };
    if (income <= lo) return { outcome: 'meets', ceiling: lo, tender: 'any', lo: lo, hi: hi };
    if (income > hi) return { outcome: 'exceeds', ceiling: hi, tender: 'any', lo: lo, hi: hi };
    return { outcome: 'unknown', need: 'tender', lo: lo, hi: hi };
  }
  /* R1.2.1: the income condition is shown first, before any affordability figure. A resale EC has its own card (no new-EC ceiling; the MOP decides
     whether MSR applies). i: the form read as engine input (uiKind, income, tender, mop). o: { ack: the buyer chose to see illustrative figures,
     incomeBad: the income entry needs fixing }. Three outcomes for the income condition, never "eligible". */
  const TENDER_BTN = [['unsure', 'Not sure'], ['before', 'Before 24 Aug 2026'], ['after', 'On or after 24 Aug 2026']];
  const MOP_BTN = [['unsure', 'Not sure'], ['ended', 'Yes, it has ended'], ['within', 'No, still within it']];
  const setRow = (k, label, opts, cur) => '<div class="pl-ec-q" role="group" aria-label="' + esc(label) + '"><span class="pl-ec-ql">' + label + '</span><div class="pl-own-b">' + opts.map((x) => '<button type="button" data-set="' + k + ':' + x[0] + '" aria-pressed="' + (cur === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>';
  const NOT_CHECKED = 'Whether the buyers can buy an EC at all: citizenship and family nucleus, the homes you own or have disposed of, and HDB’s other conditions. Meeting the income condition does not make a buyer eligible for an EC. HDB decides.';
  const ecGate = (i, E, ack) => i.uiKind === 'ec' && ecIncomeCheck(grossOf(i), i.tender, E).outcome === 'exceeds' && !ack;
  const edit = (to, text) => '<button type="button" class="gw-link pl-edit" data-edit="' + to + '">' + text + '</button>';
  function ecHtml(i, E, o) {
    o = o || {};
    if (i.uiKind === 'resaleec') {
      const mc = msrCase(i.uiKind, i.mop);
      const st = { applies: 'An EC still within its minimum occupation period is held to the MSR limit as well as TDSR (MAS Notice 645), so the income check below uses both.', not: 'Once the minimum occupation period has ended, MSR no longer applies (MAS Notice 645), so only TDSR is tested. Confirm the status with HDB or the owner’s agent.', unknown: '<b>The financing estimate is incomplete.</b> MSR applies only while the EC is within its minimum occupation period, and that is not known, so the planner does not present a TDSR-only loan as a full result. The timeline is illustrative and assumes the bank lends up to the full rule limit; the income check shows both cases.' }[mc];
      return '<div class="pl-ec' + (mc === 'unknown' ? ' warn' : '') + '"><p class="pl-kick">Resale EC · financing rules</p><div class="pl-ec-s"><span class="pl-tag warn">Different rules from a new EC</span>' + (mc === 'unknown' ? ' <span class="pl-tag bad">Financing estimate incomplete</span>' : '') + '</div>' +
        '<p class="pl-tp">A resale EC is bought from its owner, not the developer. The household income ceiling for a new EC is not applied here, and this planner does not say whether you can buy one: that depends on HDB’s rules for the unit (for example its age and whether it is still within its Minimum Occupation Period), so check with HDB. For the payments it is planned like a completed home.</p>' +
        setRow('mop', 'Has the EC’s minimum occupation period (MOP) ended?', MOP_BTN, i.mop) + '<p class="pl-tp">' + st + '</p></div>';
    }
    if (i.uiKind !== 'ec') return '';
    const c = ecIncomeCheck(grossOf(i), i.tender, E), m = $;
    const S = { meets: ['ok', 'Meets the assessed income condition'], exceeds: ['bad', 'Exceeds the income ceiling'], unknown: ['warn', 'Cannot determine eligibility without additional information'] }[c.outcome];
    let why;
    let act = '';
    if (c.outcome === 'unknown' && c.need === 'income') { why = o.incomeBad ? 'The income entry needs fixing before it can be checked against the ceiling.' : 'Add the household’s gross monthly income (fixed and variable, the combined income of everyone buying) to check it against the ceiling.'; act = '<div class="pl-ec-l">' + edit('buyers:income', o.incomeBad ? 'Fix income' : 'Add income') + '</div>'; }
    else if (c.outcome === 'unknown') why = 'The ' + m(grossOf(i)) + ' a month you entered is above ' + m(c.lo) + ' but within ' + m(c.hi) + '. Whether it meets the condition depends on when the EC site’s land tender closed: before 24 Aug 2026 the ceiling is ' + m(c.lo) + ' (so it would exceed it); on or after that date it is ' + m(c.hi) + ' (so it would meet it). A balance unit in an older EC project keeps the lower ceiling.';
    else if (c.outcome === 'meets') why = c.tender === 'any' ? 'The ' + m(grossOf(i)) + ' a month you entered is within ' + m(c.lo) + ', the lower of the two ceilings, so it meets the income condition whichever tender date applies.' : 'The ' + m(grossOf(i)) + ' a month you entered is within the ' + m(c.ceiling) + ' ceiling for EC sites whose land tender closed ' + TENDER_T[c.tender] + '.';
    else why = c.tender === 'any' ? 'The ' + m(grossOf(i)) + ' a month you entered is above ' + m(c.hi) + ', the higher of the two ceilings, so it exceeds the income ceiling whichever tender date applies.' : 'The ' + m(grossOf(i)) + ' a month you entered is above the ' + m(c.ceiling) + ' ceiling for EC sites whose land tender closed ' + TENDER_T[c.tender] + '.';
    const rows = [
      ['Ceiling', 'Up to <b>' + m(E.before) + '</b> a month of household income for EC sites whose land tender closed before 24 Aug 2026, and up to <b>' + m(E.onOrAfter) + '</b> for sites whose tender closed on or after that date. The tender closing date counts, not the date you book, and the higher ceiling does not apply to balance units in existing ECs. Source: MND’s announcement of the revised income ceilings (National Day Rally 2026 measures), checked 16 Oct 2026.'],
      ['Your figure', grossOf(i) > 0 ? m(grossOf(i)) + ' a month' + (i.varIncome > 0 ? ' (' + m(i.income) + ' fixed plus ' + m(i.varIncome) + ' variable, added in full: the 30% reduction on variable income is a bank lending rule and is not applied to this check)' : '') + ', taken as the household’s gross monthly income. HDB works out household income by its own method (whose income counts, and over what period); this planner does not reproduce that.' : 'No income entered.'],
    ];
    const kick = '<p class="pl-kick">New EC · household income condition</p>', tag = '<div class="pl-ec-s"><span class="pl-tag ' + S[0] + '">' + S[1] + '</span></div>';
    const nc = '<p class="pl-tp pl-nc"><b>Not checked here:</b> ' + NOT_CHECKED + '</p>';
    const det = '<details class="pl-ec-d"><summary>Ceilings and sources</summary><dl class="gw-rows pl-lim">' + rows.map((x) => '<div><dt>' + x[0] + '</dt><dd>' + x[1] + '</dd></div>').join('') + '</dl></details>';
    const sw = '<button type="button" class="gw-btn pri" data-ec-switch="new">Plan a private condominium instead</button>';
    if (c.outcome === 'exceeds' && o.ack) return '<div class="pl-ec bad ill" role="note"><p class="pl-kick">Illustrative only</p>' + tag + '<p class="pl-tp"><b>The figures below are illustrative.</b> ' + why + ' So the household does not meet the assessed income condition for a new EC from the developer. The figures show how the payments would run, not a purchase this household can make as a new EC buyer.</p><div class="pl-ec-b">' + sw + '<button type="button" class="gw-btn sec" data-ec-illus="no">Hide the illustrative figures</button></div>' + det + '</div>';
    if (c.outcome === 'exceeds') return '<div class="pl-ec bad gate" role="region" aria-label="New EC household income condition">' + kick + '<h2 class="pl-gate-h">The household income is above the ceiling for a new EC</h2>' + tag +
      '<p class="pl-tp">' + why + ' On this figure the household does not meet the assessed income condition to buy a new EC from the developer. HDB assesses household income by its own method, so check with HDB if you think this is wrong.</p>' +
      (c.tender === 'before' ? setRow('tender', 'Land tender closed', TENDER_BTN, i.tender) : '') +
      '<p class="pl-tp">You can change the income, plan a private condominium instead, or see illustrative figures. Illustrative figures do not mean the household can buy this EC.</p>' +
      '<div class="pl-ec-b">' + sw + '<button type="button" class="gw-btn sec" data-ec-illus="yes">Continue with illustrative calculations</button></div><div class="pl-ec-l">' + edit('buyers:income', 'Change the income') + '</div>' + nc + det + '</div>';
    if (c.outcome === 'unknown') return '<div class="pl-ec warn">' + kick + tag + '<p class="pl-tp">' + why + '</p>' + act + (c.need === 'tender' ? setRow('tender', 'When did the land tender close?', TENDER_BTN, i.tender) : '') +
      (c.need === 'income' ? '<p class="pl-tp">No payment timeline is worked out until the income is entered, because the loan depends on it. Nothing here means the household can buy a new EC.</p>' : '<p class="pl-tp">Illustrative calculations stay available below. They do not mean the household can buy a new EC.</p>') + nc + det + '</div>';
    return '<div class="pl-ec ok">' + kick + tag + '<p class="pl-tp">' + why + ' <b>This is only an income check.</b></p>' + nc + det + '</div>';
  }
  // o: { why: 'zero' | 'mop', ruleLoan, ltv, used, a, b } — a loan estimate that is not complete, said plainly beside the result
  function illusHtml(o) {
    if (!o) return '';
    if (o.why === 'mop') return '<div class="pl-illus" role="note"><p class="pl-kick">Financing estimate incomplete</p><p class="pl-tp">Whether MSR applies depends on whether this resale EC is still within its minimum occupation period, which is not known. This timeline uses the lower of the two income-supported loans, <b>' + $(o.used) + '</b>, so the loan is not overstated. On your income the loan would be about ' + (o.a ? '<b>' + $(o.a.maxLoan) + '</b> if MSR applies (MSR with TDSR)' : 'not worked out if MSR applies') + (o.b ? ', or about <b>' + $(o.b.maxLoan) + '</b> if it does not (TDSR only)' : '') + '. Neither is a bank approval.</p><div class="pl-ec-l">' + edit('purchase:mop', 'Choose the MOP status') + '</div></div>';
    return '<div class="pl-illus" role="note"><p class="pl-kick">No bank loan assumed</p><p class="pl-tp">Your income is entered as $0, so there is no income to lend against and this timeline assumes no bank loan: every payment is met from cash and CPF. Add income, including a co-buyer’s, to see what a bank could lend.</p><div class="pl-ec-l">' + edit('buyers:income', 'Add your income') + '</div></div>';
  }
  // S: { rule, cap (both timelines), view: 'rule' | 'income', limit: 'MSR' | 'TDSR' }. Shown whenever income supports less than the loan the rule ceiling allows;
  // the income-supported timeline is the one drawn by default, the rule-ceiling one stays a click away.
  // issues: [{ key, label, text }]. One row per problem; the key opens the sheet at that field. Nothing else is cleared.
  function fixHtml(list) {
    const n = list.length;
    return '<div class="pl-start pl-fix"><p class="pl-kick">Check your entries</p><h2 class="pl-start-h">' + (n === 1 ? 'Fix 1 entry to see your result' : 'Fix ' + n + ' entries to see your result') + '</h2>' +
      '<p class="pl-start-p">Everything else you entered is kept. Tap an entry to go straight to it.</p><ul class="pl-need">' +
      list.map((x) => '<li><button type="button" class="pl-n" data-fix="' + esc(x.key || '') + '"><i class="pl-tick" aria-hidden="true">!</i><span><b>' + esc(x.label || 'Your details') + '</b><em>' + esc(x.bare || x.text) + '</em></span><u>Fix</u></button></li>').join('') + '</ul></div>';
  }
  function entriesHtml(raw) {
    const m = (k) => (raw[k] == null ? 'not entered' : $(raw[k]));
    const rows = [['purchase', 'Purchase', m('price') + (raw.otp ? ' · option ' + day(raw.otp) : '')], ['money', 'Money now', 'cash ' + m('cash') + ' · CPF OA ' + m('cpf')],
      ['buyers', 'Buyers and loan', (raw.entity === '1' ? 'company or other entity' : 'age ' + (raw.age == null ? 'not entered' : raw.age)) + ' · ' + (raw.years == null ? 'tenure not entered' : raw.years + ' years') + (raw.ratePct == null ? '' : ' at ' + raw.ratePct + '%')], ['sale', 'Home you are selling', raw.order ? ORDER_T[raw.order] : 'not chosen']];
    return '<p class="pl-kick">Your entries</p><div class="pl-arows">' + rows.map((x) => '<button type="button" class="pl-arow" data-open="' + x[0] + '"><span><b>' + x[1] + '</b><em>' + esc(x[2]) + '</em></span><i aria-hidden="true">Edit</i></button>').join('') + '</div>';
  }
  // the first short payment is a construction stage with no developer date (the same test the schedule adapter uses for its "earliest" basis)
  const undatedStage = (r, date) => { const e = r.events.filter((x) => x.type === 'pay' && x.date === date && x.uncovered > 0)[0]; return !!e && (r.kind === 'new' || r.kind === 'ec') && e.confidence === 'estimate' && e.id !== 'top' && e.id !== 'csc'; };
  function summaryText(r, v, scn) {
    const h = r.headline;
    return ['Payment timeline (Groundwork): ' + $(r.price) + ' ' + kindText(r, v) + ', ' + ORDER_T[r.order] + ', ' + optionText(r.otp) + '.',
      h.peak > 0 ? (firstMiss(r).amount > 0 ? 'Not covered: ' + $(r.totals.uncovered) + ' in total; the first short payment is ' + firstMiss(r).label + (undatedStage(r, h.firstGap) ? ' (timing depends on construction progress)' : ' ' + onDay(h.firstGap)) + '.' : 'First shortfall: ' + $(h.peak) + ' ' + onDay(h.peakAt) + (h.peakCause ? ', ' + h.peakCause : '') + '.') : 'Every payment covered on its due date at the earliest dates.',
      'Loan ' + (r.loan.capped ? 'sized to what the entered income supports (figure not included; rule limit ' + pc(r.loan.ltv) + ')' : pc(r.loan.ltv)) + ' over ' + r.loan.years + ' years at ' + pc(r.loan.ratePct / 100, 2) + ' (' + r.loan.loans + ' housing loan' + (r.loan.loans === 1 ? '' : 's') + ' counted); estimated instalment ' + $(r.instalment.final) + '/mo once the whole loan is paid out.',
      (v.buyers || []).length > 1 && r.loan.capped ? 'Two buyers: the income-weighted average age basis is not confirmed, so this joint-borrower loan is unverified.' : '',
      scn && scn.cap && scn.view === 'rule' ? 'Note: the income entered supports less than the loan assumed here; the planner shows both cases.' : '',
      scn && scn.cap && scn.view === 'income' ? 'Note: this timeline uses the loan the income entered supports, not the full rule limit; the planner also shows the rule-limit case.' : '',
      scn && scn.illus && scn.illus.length ? scn.illus.map((x) => ({ 'ec-income': 'Illustrative only: the household income entered is above the new-EC income ceiling, so this is not a purchase the household can make as a new EC buyer.', 'ec-unknown': 'The new-EC income condition has not been established; these figures are illustrative.', zero: 'Income entered as $0: no bank loan is assumed, so every payment is met from cash and CPF.', mop: 'Financing estimate incomplete: whether MSR applies to this resale EC is not known, so the lower income-supported loan is used.' }[x] || '')).filter(Boolean).join(' ') : '',
      (r.duty.absd ? 'ABSD ' + $(r.duty.absd) + ' up front' + (v.refund && v.refund.assume ? ', refund assumed ' + (v.refund.monthsAfterSale || 2) + ' months after the sale (never guaranteed)' : '') + '. ' : '') + (r.kind === 'new' || r.kind === 'ec' ? 'Construction stages have no dates: when each falls due depends on construction progress. The final 15% is provisional. ' : '') + 'Estimates from my own assumptions, not advice. tools.kentanthepropertyguy.com/tools/payment-planner/'].filter(Boolean).join('\n');
  }

  /* ---------------- first-load and incomplete states ---------------- */
  const RESN = { SC: 'Singapore Citizen', PR: 'Permanent Resident', FR: 'Foreigner' }, OWNN = ['owns no home', 'owns one home', 'owns two or more homes'];
  const OWN_CHOICE = [['buy', 'Buy first, then sell'], ['sell', 'Sell first, then buy'], ['none', 'Nothing to sell']];
  // need: [{ id, label, hint, done, shown }]; i: the form read as engine input; raw: only what the buyer actually entered
  // the longest tenure that keeps the standard loan limit at this age: the engine's own figure (GW_CALC.bankTenure)
  const stdYearsOf = (age) => { try { return root.GW_CALC.bankTenure('private', age).std; } catch (e) { return null; } };
  // need: [{ id, label, hint, done, shown }]; i: the form read as engine input; raw: only what the buyer actually entered.
  // The questions are on the page above; this lists the ones still open and takes the buyer to each. It asks nothing a second time.
  function needHtml(need) {
    const ORDERK = ['price', 'otp', 'cash', 'cpf', 'income', 'age', 'years', 'order', 'loansOther', 'propertyLoans', 'debts', 'flatLoan'];
    const NAME = { price: 'the purchase price', otp: 'the option date', cash: 'your cash', cpf: 'your CPF OA', income: 'your monthly income', age: 'the borrower’s age', years: 'the loan tenure', order: 'whether you have a home to sell', loansOther: 'the housing loans on the homes you keep', propertyLoans: 'the housing-loan instalments', debts: 'the housing-loan instalments', flatLoan: 'whether the home you are selling still has a loan' };
    const list = need.filter((n) => !n.done).sort((a, b) => ORDERK.indexOf(a.id) - ORDERK.indexOf(b.id)).map((n) => NAME[n.id] || n.label.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1');
    return '<div class="pl-need0"><p class="pl-needline">Add ' + list + ' to see your result.</p>' + howHtml() + '</div>';
  }
  function howHtml() {
    return '<details class="pl-how"><summary>How to read this planner</summary><dl>' +
      '<dt>What you need</dt><dd>The price, the borrower’s age, and the cash and CPF OA you plan to use. If you are selling a home, what you expect to receive. Everything else starts with a value you can change.</dd>' +
      '<dt>Buy first or sell first</dt><dd>Buy first: you keep your current home until it sells, so ABSD is paid up front and may be refunded later if IRAS’s conditions are met. Sell first: no ABSD up front, but you may need to rent in between.</dd>' +
      '<dt>If money runs short</dt><dd>The planner names the first payment your money can’t cover. Money that arrives later cannot pay an earlier bill. To fix it, bring money forward, change the order of moves, or look at a lower price.</dd></dl></details>';
  }

  /* ---------------- browser ---------------- */
  function mount() {
    if (typeof document === 'undefined') return;
    const box = document.querySelector('[data-plan]'); if (!box) return;
    const C = root.GW_CALC, T = root.GW_TIMELINE, SCH = root.GW_SCHEDULE, KPT = root.KPT || { track: function () {} };
    if (!C || !T || !SCH) return;
    const track = (n, p) => { try { KPT.track(n, Object.assign({ tool_name: 'calc-payment-planner' }, p || {})); } catch (e) { /* analytics unavailable */ } };
    const $$ = (s, el) => [].slice.call((el || box).querySelectorAll(s));
    const q = (s) => box.querySelector(s);
    const out = { sum: q('[data-sum]'), verdict: q('[data-verdict]'), result: q('[data-result]'), detail: q('[data-detail]'), assume: q('[data-assume]'), compare: q('[data-compare]'), timeline: q('[data-timeline]'), instal: q('[data-instal]'), more: q('[data-more]'), more_em: q('[data-more-em]'), note: q('[data-acts-note]') };
    const SHARE = 'gw.fin.v1', OWN = 'gw.plan.v1', HAND = 'gw.hand.v1';
    const store = (k) => ({ get() { try { return JSON.parse(root.sessionStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }, set(o) { try { root.sessionStorage.setItem(k, JSON.stringify(o)); } catch (e) { /* storage blocked */ } }, del() { try { root.sessionStorage.removeItem(k); } catch (e) { /* ignore */ } } });
    const shared = store(SHARE), own = store(OWN), hand = store(HAND);
    let carried = false, techOpen = false;
    const parseMoney = (s) => { const p = C.parseMoney(s); return p.value === undefined ? null : p.value; };
    const fmtMoney = (v) => (v === null ? '' : v.toLocaleString('en-US', { maximumFractionDigits: 2 }));
    const today = new Date(); const todayIso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $$('input[data-today]').forEach((x) => { x.value = todayIso; });
    const chipVal = (g) => { const b = g.querySelector('[aria-pressed="true"]'); return b ? b.dataset.v : null; };
    const setChip = (g, v) => { $$('button', g).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); };
    $$('[data-t="chip"]').forEach((g) => $$('button', g).forEach((b) => b.addEventListener('click', () => { setChip(g, b.dataset.v); if (g.dataset.k === 'order') syncOrder(b.dataset.v); { const other = g.dataset.k === 'flatLoan' ? 'flatLoanSpecial' : g.dataset.k === 'flatLoanSpecial' ? 'flatLoan' : null, og2 = other && box.querySelector('[data-k="' + other + '"]'); if (og2) setChip(og2, ''); } changed(g); })));
    const rowOf = (k) => box.querySelector('[data-row="' + k + '"]');
    const showRow = (k, on) => { const r = rowOf(k); if (!r) return; r.hidden = !on; const add = box.querySelector('[data-add="' + k + '"]'); if (add) add.hidden = on; if (!on) { const s = shared.get(); Object.keys(s).forEach((key) => { if (key.indexOf(k + '.') === 0) delete s[key]; }); shared.set(s); } };
    $$('[data-add]').forEach((b) => b.addEventListener('click', () => { showRow(b.dataset.add, true); recalc(); }));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', () => { showRow(b.dataset.remove, false); recalc(); }));
    const live = (el) => { for (let p = el; p && p !== box; p = p.parentElement) if (p.hidden) return false; return true; };
    const msrFlag = () => { const kg = box.querySelector('[data-k="kind"]'), mg = box.querySelector('[data-k="mop"]'); const mc = msrCase(kg ? chipVal(kg) : null, mg ? chipVal(mg) : null); return mc === 'applies' || mc === 'unknown' ? '1' : '0'; };
    // whether any home is kept after this purchase: the homes owned (all buyers, counted generously), less the one being sold. Only then is a housing-loan count asked.
    const ownFlag = () => { let sum = 0; [0, 1].forEach((n) => { const g = box.querySelector('[data-k="buyers.' + n + '.owned"]'); if (g && live(rowOf('buyers.' + n))) sum += (+chipVal(g)) || 0; }); const og = box.querySelector('[data-k="order"]'), o = og ? chipVal(og) : ''; return sum - (o === 'buy' || o === 'sell' ? 1 : 0) >= 1 ? '1' : '0'; };
    // whether any buyer already owns a home: only then is the question about selling one asked. With none owned the answer is "nothing to sell", and the buyer's earlier choice (if any) is kept, not read.
    const ownAny = () => { let n = 0; [0, 1].forEach((k) => { const g = box.querySelector('[data-k="buyers.' + k + '.owned"]'); if (g && live(rowOf('buyers.' + k))) n += (+chipVal(g)) || 0; }); return n >= 1; };
    const effOrder = () => (ownAny() ? (chipVal(box.querySelector('[data-k="order"]')) || '') : 'none');
    const applyWhen = () => { $$('[data-when]').forEach((el) => { const [k, vs] = el.dataset.when.split(':'); const g = box.querySelector('[data-k="' + k + '"]'); const v = k === 'msr' ? msrFlag() : k === 'own' ? ownFlag() : k === 'ownany' ? (ownAny() ? '1' : '0') : k === 'order' ? effOrder() : g ? (g.dataset.t === 'chip' ? chipVal(g) : g.dataset.t === 'check' ? (g.checked ? '1' : '0') : g.value) : null; el.hidden = vs.split(',').indexOf(v) < 0; }); };
    // the order switch above the result and the chips in the sale sheet are one control
    const orderGroup = box.querySelector('[data-k="order"]'), orderSwitch = q('[data-order-switch]'), ackGroup = box.querySelector('[data-k="ecIllus"]');
    function syncOrder(v) { setChip(orderGroup, v); $$('button', orderSwitch).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.order === v))); orderSwitch.hidden = v === 'none'; }
    $$('button', orderSwitch).forEach((b) => b.addEventListener('click', () => { syncOrder(b.dataset.order); track('planner_order', { order: b.dataset.order }); changed(orderGroup); }));
    // ---- read the form ----
    let inputErrs = [], raw = {}, errMap = {}, errShort = {}, pendingUnder = false, waitBlur = false;
    const fieldName = (el) => { const f = el.closest('.gw-fld'); const sp = f && f.querySelector('span'); return sp ? sp.textContent.replace(/\s*optional\s*$/, '').trim() : ''; };
    // the existing limits (GW_CALC.LIMITS), said specifically and beside the field. `under`: still shorter than the minimum, so more digits may fix it.
    const MONEY_CHECKED = ['price', 'cash', 'cpf', 'saveMo', 'cpfMo', 'debts', 'propertyLoans', 'prefLoan', 'salePrice', 'saleLoan', 'saleRefund', 'saleCash', 'saleCpf', 'saleCosts'];
    function rangeMsg(k, val, label) {
      const L = C.LIMITS, fmt = (n) => '$' + n.toLocaleString('en-US');
      const lim = { age: [L.age, 'Enter an age between ' + L.age.min + ' and ' + L.age.max, 'Age must be between ' + L.age.min + ' and ' + L.age.max + '.'], ratePct: [L.ratePct, 'Enter a rate between ' + L.ratePct.min + '% and ' + L.ratePct.max + '% a year', 'Interest rate must be between ' + L.ratePct.min + '% and ' + L.ratePct.max + '% a year.'], years: [L.years, 'Enter a tenure between ' + L.years.min + ' and ' + L.years.max + ' years', 'Loan tenure must be between ' + L.years.min + ' and ' + L.years.max + ' years.'] }[k];
      if (lim) return val >= lim[0].min && val <= lim[0].max ? null : { under: val < lim[0].min, text: lim[1] + ' (you entered ' + val + ').', short: lim[2] };
      if (k === 'income' || k === 'varIncome') return val > L.income.max ? { text: L.income.text, short: 'Monthly income can’t be more than ' + fmt(L.income.max) + '.' } : null;
      if (MONEY_CHECKED.indexOf(k) >= 0) return val > L.money.max ? { text: L.money.text, short: (label || 'This amount') + ' can’t be more than ' + fmt(L.money.max) + '.' } : null;
      return null;
    }
    function values() {
      const v = {}; inputErrs = []; errMap = {}; errShort = {}; pendingUnder = false;
      const act = document.activeElement;
      const note = (el, k, text, short) => { const label = fieldName(el); inputErrs.push({ field: k, key: k, label: label, bare: text, text: (label ? label + ': ' : '') + text }); errMap[k] = text; errShort[k] = short || (label ? label + ': ' + text : text); };
      $$('[data-k]').forEach((el) => {
        if (!live(el)) return;
        const t = el.dataset.t, k = el.dataset.k; let val;
        if (t === 'money' || t === 'num') {
          const p = t === 'money' ? C.parseMoney(el.value.replace(/\.$/, '')) : C.parseNum(el.value, el.dataset.default);
          if (p.error) note(el, k, p.error);
          val = p.value === undefined ? null : p.value;
          if (!p.error && val !== null) { const m = rangeMsg(k, val, fieldName(el)); if (m) { if (m.under && el === act) pendingUnder = true; else note(el, k, m.text, m.short); } }
        } else if (t === 'date') val = el.value || null; else if (t === 'check') val = el.checked; else if (t === 'chip') val = chipVal(el);
        if (val !== null && val !== undefined) v[k] = val;
      });
      raw = v;
      const buyers = []; [0, 1].forEach((n) => { if (v['buyers.' + n + '.res'] !== undefined && live(rowOf('buyers.' + n))) buyers.push({ res: v['buyers.' + n + '.res'], owned: +v['buyers.' + n + '.owned'] }); });
      const entity = v.entity === '1', undated = v.noOtp === true;
      const i = { entity, undated, kind: v.kind === 'resaleec' ? 'completed' : v.kind, uiKind: v.kind, tender: v.tender || 'unsure', mop: v.mop || 'unsure', propertyLoans: v.propertyLoans || 0, price: v.price, otp: undated ? undefined : v.otp, buyers, age: entity ? undefined : v.age, ratePct: v.ratePct, years: v.years, loansOther: +(v.loansOther || 0), cash: v.cash || 0, cpf: v.cpf || 0, saveMo: v.saveMo || 0, cpfMo: v.cpfMo || 0, payInstalmentFromCpf: v.payInstalmentFromCpf !== false, order: entity || (buyers.length && !buyers.some((b) => b.owned >= 1)) ? 'none' : (v.order || ''),
        sale: { month: v.saleDate ? undefined : v.saleMonth, date: v.saleDate || undefined, cash: 0, cpf: 0, removesOwnership: v.removesOwnership !== false },
        // 'unsure' is counted as owed; a special case (contracted, undertaking) is counted as owed unless the bank has confirmed it
        flatLoan: v.flatLoanSpecial || (v.flatLoan === 'unsure' ? 'outstanding' : v.flatLoan) || 'outstanding', flatUnsure: v.flatLoan === 'unsure' && !v.flatLoanSpecial, flatAnswered: !!(v.flatLoan || v.flatLoanSpecial), flatLoanAccepted: v.flatLoanAccepted === true, prefLoan: v.prefLoan,
        refund: { assume: !!v.refundAssume, monthsAfterSale: v.refundMonths || 2 }, rent: { monthly: v.rent || 0 }, dates: { mode: 'grouped', top: v.top || undefined, csc: v.csc || undefined, completion: v.completion || undefined }, income: v.income || 0, varIncome: v.varIncome || 0, varStated: v.varIncome !== undefined && v.varIncome !== null, gross: (v.income || 0) + (v.varIncome || 0), debts: v.debts || 0 };
      // The sale: the expected price, the loan left and the CPF refund INCLUDING its accrued interest, or the buyer's own cash and CPF. Nothing is estimated from an assumed holding period;
      // until the figures are in, the sale is not counted (cash and CPF are 0), and the known part is shown beside it.
      if (i.order === 'buy' || i.order === 'sell') {
        const est = C.saleEstimate({ type: v.saleType === 'private' ? 'private' : 'hdb', price: v.salePrice, loan: v.saleLoan, cpfRefund: v.saleRefund, overrideCash: v.saleCash, overrideCpf: v.saleCpf, costs: v.saleCosts, heldOver4: v.saleHeld === 'yes' ? true : undefined },
          { owner55: v.saleOwner55 === true || (v.age >= 55), today: new Date().toISOString().slice(0, 10) });
        i.saleEst = est;
        if (est.counted) { i.sale.cash = Math.max(0, est.cash); i.sale.cpf = est.cpf; if (est.cash < 0 && i.order === 'sell') i.cash = Math.max(0, i.cash + est.cash); }
      }
      // The developer's dates are checked against each other and the option date before anything is drawn from them (the engine takes any date it is given).
      dateProblems({ kind: i.uiKind, otp: v.otp, top: v.top, csc: v.csc, completion: v.completion }).forEach((p) => { const el = box.querySelector('input[data-k="' + p.k + '"]'); if (el && live(el) && !errMap[p.k]) note(el, p.k, p.text, p.short); });
      return i;
    }
    // what the planner still needs before it will show a result: nothing is assumed for these (0 is a valid, explicit answer)
    const has = (k) => raw[k] !== undefined && raw[k] !== null;
    function needList(i) {
      if (i.entity) {
        // a company has no age, CPF, income or home to sell: the price, the option date (unless none yet) and the cash it has
        const E = [{ id: 'price', label: 'Purchase price', hint: 'What the company will pay for the property.', done: has('price'), shown: has('price') ? $(raw.price) : '' }];
        if (!i.undated && !has('otp')) E.push({ id: 'otp', label: 'Option date', hint: 'The day you pay the booking or option fee.', done: false, shown: '' });
        E.push({ id: 'cash', label: 'Cash you have now', hint: 'Cash the company can use. Type 0 if none.', done: has('cash'), shown: has('cash') ? $(raw.cash) : '' });
        return E;
      }
      const L = [{ id: 'order', label: 'Do you have a home to sell?', hint: 'Choose one above. Nothing is assumed.', done: !!i.order, shown: i.order ? ORDER_T[i.order] : '' }, { id: 'price', label: 'Purchase price', hint: 'What you will pay for the home.', done: has('price'), shown: has('price') ? $(raw.price) : '' }];
      if (!has('otp') && !i.undated) L.push({ id: 'otp', label: 'Option date', hint: 'The day you pay the booking or option fee.', done: false, shown: '' });
      L.push({ id: 'age', label: 'Borrower’s age', hint: 'Sets how much the bank can lend. Two borrowers: use the average.', done: has('age'), shown: has('age') ? raw.age + ' years' : '' },
        { id: 'cash', label: 'Cash you have now', hint: 'Savings you can use. Type 0 if none.', done: has('cash'), shown: has('cash') ? $(raw.cash) : '' },
        { id: 'cpf', label: 'CPF OA you plan to use', hint: 'Type 0 if none.', done: has('cpf'), shown: has('cpf') ? $(raw.cpf) : '' });
      // income decides the bank loan, so it is asked, never assumed: $0 is an answer (no bank loan), a blank is not
      L.push({ id: 'income', label: 'Monthly income', hint: 'Sets what a bank could lend. Type 0 if none: no bank loan is then assumed.', done: has('income') || has('varIncome'), shown: $(i.gross || 0) + ' a month' });
      // at an age where any loan runs past 65 there is no standard tenure to start from
      { const sy = has('age') ? stdYearsOf(raw.age) : null; if (sy === 0 && !has('years')) L.push({ id: 'years', label: 'Loan tenure', hint: 'At this age any loan runs past age 65. Enter the years you want.', done: false, shown: '' }); }
      // a home that is kept and still has a loan: how many loans, and what they cost each month (both count in the bank's income test)
      if (ownFlag() === '1') {
        L.push({ id: 'loansOther', label: 'Housing loans on the homes you keep', hint: 'Choose None if they are fully paid.', done: has('loansOther') && raw.loansOther !== '', shown: raw.loansOther === '0' ? 'None' : raw.loansOther === '1' ? 'One' : 'Two or more' });
        if (+raw.loansOther >= 1) { const k = msrFlag() === '1' ? 'propertyLoans' : 'debts'; L.push({ id: k, label: 'Housing-loan instalments', hint: 'The monthly instalment on each housing loan you keep. Type 0 if none.', done: has(k), shown: has(k) ? $(raw[k]) : '' }); }
      }
      // buy first: whether the home still has a loan decides how the bank counts it, so it is asked (not sure is an answer; a blank is not)
      if (i.order === 'buy') L.push({ id: 'flatLoan', label: 'Loan on the home you are selling', hint: 'Do you still owe a housing loan on it? Not sure is fine.', done: i.flatAnswered, shown: i.flatLoan === 'none' ? 'fully paid' : i.flatUnsure ? 'not sure, counted as owed' : i.flatLoan === 'outstanding' ? 'still owed' : i.flatLoan });
      return L;
    }
    // A company can buy a new launch or a completed private home. If another type was selected, New launch is selected and the page says so.
    function syncEntity() {
      const eg = box.querySelector('[data-k="entity"]'), kg = box.querySelector('[data-k="kind"]'), n = q('[data-entity-note]'); if (!eg || !kg || !n) return;
      if (chipVal(eg) === '1') { if (['ec', 'resaleec', 'hdb'].indexOf(chipVal(kg)) >= 0) { setChip(kg, 'new'); n.textContent = 'A company or other entity can buy a new launch or a completed private home, so New launch is selected.'; n.hidden = false; } }
      else n.hidden = true;
    }
    // ---- compute ----
    let last = null, startedT = false, doneT = false, issues = [], dirty = false;
    const RL = root.GW_RULES.bankLtv;
    const ECR = (root.GW_RULES && root.GW_RULES.ecIncomeCeiling) || { before: 16000, onOrAfter: 18000 };
    const run = (inp) => { if (inp.order === 'none') return { r: T.timeline(inp), c: null }; const c = T.compare(inp); return { r: c.ok ? c[inp.order] : (c.buy && !c.buy.ok ? c.buy : c.sell), c }; };
    // What the entered income supports, from the engine: TDSR for a private home, MSR with TDSR for a new EC from the developer (GW_CALC.msr, 'ec').
    const supportRes = (inp, loans, years) => {
      if (!(inp.gross > 0)) return null; const b = [{ age: inp.age, fixed: inp.income, variable: inp.varIncome }], mc = msrCase(inp.uiKind, inp.mop);
      if (mc === 'unknown') return null; // whether MSR applies is not known: no single income-supported loan
      try { return mc === 'applies' ? C.msr({ scenario: 'ec', borrowers: b, propertyLoans: inp.propertyLoans, otherDebts: inp.debts, tenure: years, loans: loans, quotedRatePct: inp.ratePct }) : C.tdsr({ kind: 'private', borrowers: b, debts: inp.debts, loans: loans, tenure: years, quotedRatePct: inp.ratePct }); } catch (e) { return null; }
    };
    const good = (t) => (t && t.ok && !t.noTenure ? t : null);
    // resale EC, MOP not known: both cases, each labelled by the card; neither is used to size the timeline
    const supportBoth = (inp, loans, years) => {
      if (!(inp.gross > 0)) return null; const b = [{ age: inp.age, fixed: inp.income, variable: inp.varIncome }];
      try { return { msr: good(C.msr({ scenario: 'ec', borrowers: b, propertyLoans: inp.propertyLoans, otherDebts: inp.debts, tenure: years, loans: loans, quotedRatePct: inp.ratePct })), tdsr: good(C.tdsr({ kind: 'private', borrowers: b, debts: inp.debts, loans: loans, tenure: years, quotedRatePct: inp.ratePct })) }; } catch (e) { return null; }
    };
    // The timeline at the rule-ceiling loan, and, when the income supports less, again with the loan capped at that amount (never silently swapped).
    // The rule ceiling is only a ceiling: with $0 income no bank loan is assumed, and with a resale EC whose MOP is not known the lower of the two
    // income-supported loans is used, so the ceiling is never treated as a loan.
    function sized(inp) {
      const rule = run(inp); if (!rule.r.ok) return { rule: rule, cap: null, sp: null, spRaw: null };
      const ceil = rule.r.loan.loanMax;
      if (inp.entity) return { rule: rule, cap: null, sp: null, spRaw: null, limit: rule.r.loan.ruleLoanMax, limitWhy: 'rule' };   // a company's loan is the flat 15% limit: no income test
      if (!(inp.gross > 0)) { const o0 = run(Object.assign({}, inp, { loanCap: 0 })); return { rule: rule, cap: o0.r && o0.r.ok ? o0 : null, sp: null, spRaw: null, zero: true, limit: 0, limitWhy: 'zero' }; }
      const raw = supportRes(inp, rule.r.loan.loans, inp.years), sp = good(raw);
      let lim = sp ? sp.maxLoan : null, mopLoan = null;
      if (raw && raw.ok && raw.noTenure) lim = 0;   // no tenure fits (age 65 or over, nothing entered): no loan, not the ceiling
      if (lim === null && msrCase(inp.uiKind, inp.mop) === 'unknown') { const both = supportBoth(inp, rule.r.loan.loans, inp.years), c = both ? [both.msr, both.tdsr].filter(Boolean) : []; if (c.length) { mopLoan = Math.min.apply(null, c.map((x) => x.maxLoan)); lim = mopLoan; } }
      let cap = null;
      if (lim !== null && lim < ceil - 0.5) { const o2 = run(Object.assign({}, inp, { loanCap: lim })); if (o2.r && o2.r.ok && o2.r.loan.capped) cap = o2; }
      const ruleMax = rule.r.loan.ruleLoanMax, limit = lim !== null ? Math.min(ruleMax, lim) : ruleMax;   // the estimated limit shown beside any loan the buyer asks for
      return { rule: rule, cap: cap, sp: sp, spRaw: raw, mopLoan: mopLoan, limit: limit, limitWhy: lim !== null && lim < ruleMax - 0.5 ? (mopLoan !== null ? 'mop' : 'income') : 'rule' };
    }
    // the longest tenure that keeps the standard limit at this age: the engine's own figure (GW_CALC.progressive → stdYears)
    const stdYearsFor = stdYearsOf;
    // where the engine names a field, the planner's input for it
    const ENGKEY = { price: 'price', cash: 'cash', cpf: 'cpf', saveMo: 'saveMo', cpfMo: 'cpfMo', age: 'age', ratePct: 'ratePct', years: 'years', otp: 'otp', sale: 'saleMonth', 'sale.cash': 'saleCash', 'sale.cpf': 'saleCpf', rent: 'rent', income: 'income', varIncome: 'varIncome' };
    const fieldFor = (key) => (key ? (box.querySelector('input[data-k="' + key.replace(/"/g, '') + '"]') || box.querySelector('[data-k="' + key.replace(/"/g, '') + '"][data-t="chip"] button')) : null);
    function paintErrors() {
      $$('input[data-k]').forEach((el) => {
        const fld = el.closest('.gw-fld'), wrap = el.closest('.gw-in'); if (!fld || !wrap || el.type === 'checkbox') return;
        const k = el.dataset.k, msg = errMap[k]; let m = fld.querySelector('.pl-err');
        if (msg) { if (!m) { m = document.createElement('small'); m.className = 'pl-err'; m.id = 'pl-err-' + k.replace(/\W/g, '-'); m.setAttribute('role', 'alert'); wrap.insertAdjacentElement('afterend', m); } if (m.textContent !== msg) { m.textContent = msg; if (el === document.activeElement) { try { m.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } } } el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', m.id); wrap.classList.add('pl-invalid'); }
        else { if (m) m.remove(); el.setAttribute('aria-invalid', 'false'); el.removeAttribute('aria-describedby'); wrap.classList.remove('pl-invalid'); }
      });
      // a collapsed section that holds an entry needing a fix is opened, so the reason is never hidden
      $$('details.pl-dates,details.pl-loanmore').forEach((d) => { if (d.querySelector('.pl-err') && !d.open) d.open = true; });
      // the sheet footer says which entry needs fixing, in plain words; with several it gives the number and goes to the first
      const keys = Object.keys(errMap).filter((k) => fieldFor(k)), sheetKeys = keys.filter((k) => k !== 'top' && k !== 'csc' && k !== 'completion');   // a date error is said once, beside its field
      const moreBox = q('details[data-loanmore]');
      $$('[data-sheet]').forEach((sh) => {
        // UX3: More options sits just after the loan group, so its entries are reported by the loan group's note (as before, when they sat inside it); the section itself opens to show the field's own message
        const mine = sheetKeys.filter((k) => sh.contains(fieldFor(k)) || (sh.dataset.sheet === 'buyers' && moreBox && moreBox.contains(fieldFor(k)))), el = sh.querySelector('[data-sheet-note]'); if (!el) return;
        const msg = (k) => errShort[k] || errMap[k] || '', lab = (k) => fieldName(fieldFor(k)) || 'the first entry';
        let h = '';
        if (mine.length === 1) h = esc(msg(mine[0]));
        else if (mine.length > 1) h = mine.length + ' entries need fixing. <button type="button" class="gw-link pl-goto" data-goto="' + esc(mine[0]) + '">Go to ' + esc(lab(mine[0])) + '</button>';
        if (el.innerHTML !== h) el.innerHTML = h;
      });
      // on the funding screen, an entry that needs fixing in the property panel is pointed to once, at the top
      const else_ = q('[data-else-note]');
      if (else_) {
        const pan = else_.closest('[data-panel]'), out = keys.filter((k) => { const f = fieldFor(k); return f && !pan.contains(f); });
        const lab = (k) => fieldName(fieldFor(k)) || 'the first entry';
        const h = out.length ? (out.length === 1 ? 'One entry above needs fixing. ' : out.length + ' entries above need fixing. ') + '<button type="button" class="gw-link pl-goto" data-goto="' + esc(out[0]) + '">Go to ' + esc(lab(out[0])) + '</button>' : '';
        if (else_.innerHTML !== h) else_.innerHTML = h;
      }
    }
    function paintTenureNote(vals) {
      const el = q('[data-tenure-note]'); if (!el) return;
      if (vals.entity === '1') { const t0 = C.tenureNote({ entity: true }); if (el.textContent !== t0) el.textContent = t0; return; }
      const age = vals.age, L = C.LIMITS.age, chosen = typeof vals.years === 'number' && vals.years > 0 ? vals.years : 0;
      let o = {};
      if (typeof age === 'number' && age >= L.min && age <= L.max) { const t = C.bankTenure('private', age); o = { age: age, std: t.std, allowed: t.allowed, chosen: chosen }; }
      const yEl = q('[data-k="years"]'), adj = yEl && +yEl.dataset.adjustedFrom > 0 ? +yEl.dataset.adjustedFrom : 0; if (adj && o.chosen) o.adjustedFrom = adj;
      if (last && last.r && last.r.loan && typeof last.r.loan.loans === 'number') o.loans = last.r.loan.loans;
      const t = C.tenureNote(o); if (el.textContent !== t) el.textContent = t;
    }
    box.addEventListener('focusout', (e) => { if (waitBlur && e.target.matches && e.target.matches('input[data-k]')) setTimeout(recalc, 0); });
    // ---- your property: the summary line, and whether the three details are in ----
    const prop = q('[data-prop]'), propEdit = q('[data-prop-edit]'), propSum = q('[data-prop-sum]'), buyerLine = q('[data-buyer-line]');
    let propOpen = true, propOk = false, ptr = false, buyerTouched = false, lastS = null, lastI = null, screen = 'schedule';
    const buyerWords = (b) => (b.length > 1 ? 'Two buyers' : (RESN[b[0].res] || b[0].res) + ', ' + (b[0].owned === 0 ? 'first home' : b[0].owned === 1 ? 'owns one home' : 'owns two or more homes'));
    function setProp(open) { propOpen = open; prop.classList.toggle('is-collapsed', !open); propEdit.setAttribute('aria-expanded', String(open)); }
    function paintProp(i) {
      const b = i.buyers.length ? i.buyers : [{ res: 'SC', owned: 0 }], touched = buyerTouched || i.entity || b.length > 1 || b[0].res !== 'SC' || b[0].owned !== 0;
      propOk = i.uiKind !== 'hdb' && has('price') && !errMap.price && (i.undated || (!!raw.otp && !errMap.otp));
      const bits = [KIND_SHORT[i.uiKind] || '', has('price') ? $(raw.price) : '', i.undated ? 'No option date yet' : raw.otp ? 'Option ' + day(raw.otp) : '', i.entity ? 'Company or other entity' : buyerWords(b)].filter(Boolean);
      propSum.innerHTML = bits.map((x, k) => (k === 0 ? '<b>' + esc(x) + '</b>' : '<span>' + esc(x) + '</span>')).join('');
      if (buyerLine) buyerLine.textContent = i.entity ? 'Buyer: a company or other entity. Stamp duty and ABSD are worked out at the entity rates.' : touched ? 'Buyer: ' + buyerWords(b) + '.' : BUYER_DEFAULT;
    }
    // a stage table with nothing in it takes no room; the sections open on a wide screen, closed on a phone (the reader's choice is kept after that)
    const wide = () => !!(root.matchMedia && root.matchMedia('(min-width:900px)').matches);
    // ---- screen 1: the payment schedule. Only the property is needed: no age, income, cash, CPF or loan. ----
    function schedRegions() { return { sum: q('[data-sched-sum]'), lead: q('[data-sched-lead]'), note: q('[data-sched-note]'), table: q('[data-sched-table]'), quote: q('[data-sched-quote]'), cta: q('[data-sched-cta]'), how: q('[data-how-b]'), ready: q('[data-funds-ready]') }; }
    // empties the schedule screen completely: no figure, table or chart is left behind in the page (used for an HDB flat and for an incomplete property)
    function clearSched(msg) { const O = schedRegions(); O.lead.textContent = msg || ''; ['sum', 'note', 'table', 'how'].forEach((k) => { O[k].innerHTML = ''; }); O.quote.hidden = true; O.cta.hidden = true; O.ready.hidden = true; box.classList.remove('has-schedule'); lastS = null; return null; }
    function paintSchedule(i) {
      const O = schedRegions(), clear = clearSched;
      if (errMap.price || errMap.otp) return clear('Fix the ' + (errMap.price ? 'price' : 'option date') + ' above to see your payment schedule.');
      if (errMap.top || errMap.csc || errMap.completion) return clear('One of the dates you added does not work. Fix it below, or clear it, to see your payment schedule.');
      if (!has('price')) return clear('Enter the purchase price to see every payment and when it falls.');
      if (!i.otp && !i.undated) return clear('Enter the option date to see every payment and when it falls, or tick that you don’t have one yet.');
      const s = SCH.schedule({ kind: i.kind, price: i.price, otp: i.otp, undated: i.undated, entity: i.entity, buyers: i.entity ? undefined : i.buyers.length ? i.buyers : undefined, order: i.order === 'sell' ? 'sell' : undefined, removesOwnership: i.sale.removesOwnership, dates: i.dates });
      if (!s.ok) return clear((s.invalid && s.invalid[0] && s.invalid[0].text) || 'Check the property details above to see your payment schedule.');
      O.sum.innerHTML = schedSumHtml(s);
      O.lead.textContent = $(s.totals.amount) + ' in total, starting with ' + $(s.events[0].amount) + ' ' + onDay(s.events[0].date) + '. The timing of each payment is in the list below.';
      O.note.innerHTML = i.uiKind === 'ec' ? '<p class="pl-note">EC eligibility is not checked in this schedule. The funding check tests your income against the new-EC ceiling.</p>' : i.uiKind === 'resaleec' ? '<p class="pl-note">A resale EC is planned like a completed home. Whether you can buy one depends on HDB’s rules for the unit, which are not checked here.</p>' : '';
      O.table.innerHTML = scheduleTableHtml(s); O.how.innerHTML = howHtml2(s);
      O.quote.hidden = false; O.cta.hidden = false;
      const ready = carried && (has('cash') || has('cpf') || has('income')); O.ready.hidden = !ready; if (ready) O.ready.textContent = 'Your funds from What can I afford? are ready.';
      box.classList.add('has-schedule'); lastS = s; lastI = i;
      if (!doneT) { doneT = true; track('tool_completed', {}); }
      return s;
    }
    // ---- screen 2: the funding check, from the audited engine ----
    let tenureFld = null;
    function recalc() {
      syncEntity(); applyWhen();
      const i = values();
      UND = !!i.undated; KIND_NOW = i.kind;
      if (pendingUnder) { waitBlur = true; return; } // a number is still being typed: keep the screen steady until it is complete or the field is left
      waitBlur = false; dirty = false;
      orderSwitch.hidden = i.order === 'none';
      let r, c = null, sc = null, view = 'rule';
      const hdb = i.uiKind === 'hdb'; box.classList.toggle('is-hdb', hdb);
      paintProp(i);
      if (!hdb) paintSchedule(i); else clearSched('');
      const need = needList(i); const todo = need.filter((n) => !n.done);
      issues = inputErrs.slice();
      // 1. the income condition comes first: before any loan or payment figure, for a new EC (or the MOP question, for a resale EC)
      const mc = msrCase(i.uiKind, i.mop);
      const ecOut = i.uiKind === 'ec' ? ecIncomeCheck(i.gross, i.tender, ECR).outcome : null;
      let ack = !!(ackGroup && chipVal(ackGroup) === 'yes');
      if (ack && ecOut !== 'exceeds') { setChip(ackGroup, ''); ack = false; save(); } // the choice to see illustrative figures belongs to this outcome only
      const gate = ecGate(i, ECR, ack);
      const top = hdb ? '' : ecHtml(i, ECR, { ack: ack, incomeBad: !!(errMap.income || errMap.varIncome) });
      if (gate || hdb) r = { ok: false, missing: [], gated: true };
      else if (issues.length) r = { ok: false, missing: [], invalid: issues };
      else if (todo.length) r = { ok: false, missing: [], incomplete: true };
      else {
        try {
          sc = sized(i); view = sc.cap ? 'income' : 'rule';
          const o = view === 'income' && sc.cap ? sc.cap : sc.rule; r = o.r; c = o.c;
        } catch (e) { r = { ok: false, missing: [], invalid: [{ field: '', text: 'The planner could not work this out. Please check the figures.' }] }; }
      }
      if (!r.ok && !r.incomplete && !r.gated && !issues.length && r.invalid) r.invalid.forEach((x) => { const key = ENGKEY[x.field] || '', f = fieldFor(key); issues.push({ field: key, key: key, label: f ? fieldName(f) : '', bare: x.text, text: x.text }); if (key && !errMap[key]) errMap[key] = x.text; });
      if (r.ok) {
        const t0 = sc.spRaw;
        if (t0 && !t0.ok && t0.invalid && t0.invalid.length) errMap.income = t0.invalid[0].text;
        const both = mc === 'unknown' && i.gross > 0 ? supportBoth(i, sc.rule.r.loan.loans, i.years) : null;
        // 2. which loan the timeline uses: the income-supported one by default, and a plain label whenever the loan is only an illustration
        const ill = [];
        if (ecOut === 'exceeds' && ack) ill.push('ec-income'); else if (ecOut === 'unknown') ill.push('ec-unknown');
        if (i.entity) { /* no income test for a company */ } else if (!(i.gross > 0)) ill.push('zero'); else if (mc === 'unknown') ill.push('mop');
        const RR = sc.rule.r.loan, why = ill.indexOf('zero') >= 0 ? 'zero' : ill.indexOf('mop') >= 0 ? 'mop' : '';
        const note = why ? illusHtml({ why: why, ruleLoan: RR.loanMax, ltv: RR.ltv, used: r.loan.loanMax, a: both && both.msr, b: both && both.tdsr }) : '';
        const sf = SCH.shortfall(r);
        const detRegions = [out.verdict, out.result, out.compare, out.instal], detOpen = openDets(detRegions);
        out.sum.innerHTML = sumHtml(r, i, { view: view, cap: !!sc.cap, limit: sc.limit, why: sc.limitWhy }, carried);
        out.verdict.innerHTML = verdictHtml(r, i);
        lastPref = typeof i.prefLoan === 'number' ? i.prefLoan : null;
        const alt = i.order === 'buy' && i.flatUnsure ? T.timeline(Object.assign({}, i, { flatLoan: 'none', loanCap: undefined })) : null;
        out.result.innerHTML = top + saleNoteHtml(i) + note + loanCaseHtml(r, i, alt) + warnHtml(r) + cpfNoteHtml(i);
        out.detail.innerHTML = loanLine(r, ill);
        { const yd0 = out.assume.querySelector('[data-yd]'), keep = !!(yd0 && yd0.open); out.assume.innerHTML = '<details class="pl-yd" data-yd data-tech' + (keep ? ' open' : '') + '><summary>Your details, as this check uses them</summary>' + assumeHtml(r, i) + '</details>'; }
        out.compare.innerHTML = c ? compareHtml(c) : '';
        out.timeline.innerHTML = fundTableHtml(r);
        out.instal.innerHTML = instalHtml(r, i) + leavesOutHtml(i, r);
        restoreDets(detRegions, detOpen);
        out.more.hidden = !(out.detail.innerHTML || out.compare.innerHTML); out.more_em.textContent = out.detail.innerHTML && out.compare.innerHTML ? 'your estimated bank loan, and buying first or selling first' : out.compare.innerHTML ? 'buying first or selling first' : 'your estimated bank loan';
        box.classList.add('has-result'); last = { i, r, c, scn: { view: view, cap: !!sc.cap, illus: ill } };
        const el = q('[data-refund-elig]'); if (el) el.textContent = r.duty.absd > 0 ? (r.duty.notes.some((n) => n.id === 'refund' || n.id === 'single-senior') ? 'IRAS’s refund conditions may apply to this profile (sell within 6 months of the purchase, or of TOP/CSC for an uncompleted home; bought jointly in two names; no other home acquired). IRAS decides.' : 'This buyer profile does not match IRAS’s refund conditions; a refund assumed here would be shown as not eligible.') : 'No ABSD on this purchase, so there is nothing to refund.';
      } else {
        last = null; box.classList.remove('has-result'); ['sum', 'verdict', 'detail', 'assume', 'compare', 'timeline', 'instal'].forEach((k) => { out[k].innerHTML = ''; }); out.more.hidden = true;
        if (r.gated) { out.result.innerHTML = top; out.assume.innerHTML = hdb ? '' : entriesHtml(raw); }
        else if (todo.length) out.result.innerHTML = top + (issues.length ? fixHtml(issues) : '') + needHtml(need, i, raw);
        else if (issues.length) { out.result.innerHTML = top + fixHtml(issues); out.assume.innerHTML = entriesHtml(raw); }
        else out.result.innerHTML = top + '<p class="gw-fine">Enter ' + (r.missing || []).map((m) => ({ price: 'the price', age: 'the borrower’s age', buyers: 'the buyer details', otp: 'the option date' }[m] || m)).join(', ').replace(/, ([^,]*)$/, ' and $1') + ' to see the result.</p>';
      }
      // the tenure field shows the tenure the calculation used (gw-money.js): a longer one typed is replaced by it once the field is not being typed in
      if (tenureFld) { const applied = r.ok && r.loan ? r.loan.years : 0; if (tenureFld.settle(applied)) { recalc(); return; } tenureFld.hint(applied); }
      paintErrors(); paintTenureNote(raw); paintFund(); if (!fundOpen && (!last || fundBad())) setFund(true); { const el2 = q('[data-sale-est]'); if (el2) el2.innerHTML = i.saleEst && (i.order === 'buy' || i.order === 'sell') ? saleLine(i.saleEst) : ''; }
      wa();
    }
    const save = () => {
      const s = shared.get(); $$('[data-share]').forEach((x) => { if (!live(x)) return; const val = x.dataset.t === 'chip' ? chipVal(x) : x.value; if (val !== null && val !== '') s[x.dataset.share] = val; else delete s[x.dataset.share]; }); shared.set(s);
      const o = {}; $$('[data-k]').forEach((x) => { if (x.dataset.share) return; const val = x.dataset.t === 'chip' ? chipVal(x) : x.dataset.t === 'check' ? (x.checked ? '1' : '0') : x.value; if (val !== null && val !== '') o[x.dataset.k] = val; }); own.set(o);
    };
    let tmr; const changed = (el) => {
      if (!startedT) { startedT = true; track('tool_started', {}); }
      save();
      out.note.textContent = ''; dirty = true;
      clearTimeout(tmr); tmr = setTimeout(recalc, 120);
    };
    // ---- money fields: commas appear as you type (one behaviour for every calculator: gw-money.js) ----
    const MONEY = root.GW_MONEY;
    if (MONEY) $$('input[data-t="money"]').forEach((x) => MONEY.wire(x, { parse: (t) => parseMoney(t), max: C.LIMITS.money.max }));
    $$('input').forEach((x) => { x.addEventListener('input', () => changed(x)); x.addEventListener('change', () => changed(x)); });
    if (MONEY) $$('input[data-t="num"]').forEach((x) => MONEY.selectOnFocus(x));
    { const yEl = q('[data-k="years"]'); if (MONEY && MONEY.tenureField && yEl) tenureFld = MONEY.tenureField(yEl, { read: () => C.parseNum(yEl.value).value || null, max: () => C.LIMITS.years.max, recalc: () => { clearTimeout(tmr); recalc(); }, changed: () => save() }); }
    // ---- restore: shared details from the other calculators, then the planner's own ----
    const sv = shared.get();
    $$('[data-share]').forEach((x) => { const val = sv[x.dataset.share]; if (val === undefined || val === null || val === '') return; const m = /^buyers\.1\./.exec(x.dataset.share); if (m) showRow('buyers.1', true); if (x.dataset.t === 'chip') setChip(x, val); else x.value = x.dataset.t === 'money' && parseMoney(val) !== null ? fmtMoney(parseMoney(val)) : val; });
    if (sv.housingLoans === '1' || sv.housingLoans === '2') { /* a counted loan elsewhere: keep the safe default "still outstanding" */ }
    const ov = own.get();
    $$('[data-k]').forEach((x) => { if (x.dataset.share) return; const val = ov[x.dataset.k]; if (val === undefined) return; if (x.dataset.t === 'chip') setChip(x, val); else if (x.dataset.t === 'check') x.checked = val === '1'; else x.value = x.dataset.t === 'money' && parseMoney(val) !== null ? fmtMoney(parseMoney(val)) : val; });
    // ---- the buyer's details from What can I afford? (tab-only, gw.hand.v1): applied once, when the Planner has just written them; after that the entries here are the buyer's own ----
    (function fromPlanner() {
      const h = hand.get(); if (!h || h.v !== 1) return;
      carried = true; if (!h.fresh) return;
      const put = (k, val) => { const x = box.querySelector('[data-k="' + k + '"]'); if (!x || val === undefined || val === null) return; if (x.dataset.t === 'chip') setChip(x, String(val)); else if (x.dataset.t === 'money') x.value = val === '' ? '' : fmtMoney(+val); else x.value = String(val); };
      const n = (h.buyers || []).length; showRow('buyers.1', n > 1);
      (h.buyers || []).forEach((b, k) => { put('buyers.' + k + '.res', b.res); put('buyers.' + k + '.owned', b.owned); });
      put('kind', h.kind); put('price', h.price); if (h.otp) put('otp', h.otp); put('years', h.years); put('ratePct', h.ratePct); put('age', h.age); put('cash', h.cash); put('cpf', h.cpf);
      put('income', h.income > 0 ? h.income : ''); put('varIncome', h.income > 0 ? h.varIncome || 0 : ''); put('debts', h.debts > 0 ? h.debts : ''); put('loansOther', h.loansOther || 0); put('order', h.order);
      put('saveMo', h.saveMo > 0 ? h.saveMo : ''); put('cpfMo', h.cpfMo > 0 ? h.cpfMo : ''); put('prefLoan', h.prefLoan > 0 ? h.prefLoan : '');
      if (h.order === 'sell' && h.sale) { const sl = h.sale; put('saleType', sl.type === 'private' ? 'private' : 'hdb'); put('saleHeld', sl.heldOver4 ? 'yes' : ''); put('salePrice', sl.price > 0 ? sl.price : ''); put('saleLoan', sl.loan === undefined || sl.loan === null ? '' : sl.loan); put('saleRefund', sl.cpfRefund === undefined || sl.cpfRefund === null ? '' : sl.cpfRefund); put('saleCash', sl.overrideCash === undefined || sl.overrideCash === null ? '' : sl.overrideCash); put('saleCpf', sl.overrideCpf === undefined || sl.overrideCpf === null ? '' : sl.overrideCpf); put('saleCosts', sl.costs === undefined || sl.costs === null ? '' : sl.costs); }
      h.fresh = false; hand.set(h);
      save();
    })();
    if (root.location && String(root.location.hash) === '#company') { const eg0 = box.querySelector('[data-k="entity"]'); if (eg0) setChip(eg0, '1'); }
    syncOrder(chipVal(orderGroup) || '');
    // ---- the two screens: an ARIA tablist; the one not shown is not displayed (never removed), so every entry stays live ----
    const tabs = $$('[data-tab]'), panels = $$('[data-panel]');
    function setScreen(name, o) {
      o = o || {}; screen = name;
      tabs.forEach((t) => { const on = t.dataset.tab === name; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
      panels.forEach((p) => p.classList.toggle('is-off', p.dataset.panel !== name));
      try { root.history.replaceState(null, '', name === 'funding' ? '#funding' : root.location.pathname + root.location.search); } catch (e) { /* no history */ }
      if (o.focus) { const h = q('[data-panel="' + name + '"] [data-focus]'); if (h) h.focus(); }
      if (!o.quiet) track('planner_screen', { screen: name });
    }
    tabs.forEach((t, k) => {
      t.addEventListener('click', () => { setScreen(t.dataset.tab, { focus: true }); });
      t.addEventListener('keydown', (e) => { const n = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: tabs.length - 1 }[e.key]; if (n === undefined) return; e.preventDefault(); const to = tabs[(n + tabs.length) % tabs.length]; setScreen(to.dataset.tab, { quiet: false }); to.focus(); });
    });
    q('[data-go-funding]').addEventListener('click', () => { setScreen('funding', { focus: true }); });
    if (root.location && String(root.location.hash) === '#funding') setScreen('funding', { quiet: true });
    // ---- the property panel: open for a new visitor; a one-line summary once type, price and date are in; Edit brings it back ----
    // It folds away only when focus has moved on (a keypress to the next control, or a click elsewhere), never while typing and never on a timer.
    propEdit.addEventListener('click', () => { setProp(true); track('planner_prop_edit', {}); const f = box.querySelector('[data-prop-form] [data-k="kind"] [aria-pressed="true"]') || box.querySelector('[data-prop-form] input'); if (f) f.focus(); });
    const tryFold = () => { if (dirty) { clearTimeout(tmr); recalc(); } if (propOpen && propOk) setProp(false); };
    prop.addEventListener('focusout', (e) => { const n = e.relatedTarget; if (ptr || !n || prop.contains(n)) return; tryFold(); });
    document.addEventListener('pointerdown', () => { ptr = true; }, true); document.addEventListener('pointercancel', () => { ptr = false; }, true); document.addEventListener('keydown', () => { ptr = false; }, true);
    document.addEventListener('click', (e) => { ptr = false; if (propOpen && !prop.contains(e.target) && !prop.contains(document.activeElement)) tryFold(); });
    box.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-k^="buyers."],[data-add],[data-remove]')) buyerTouched = true; });
    // ---- your money and loan: the same fold as the property panel. Once there is a result, the entries fold to one line and Edit brings them back ----
    const fund = q('[data-fund]'), fundEdit = q('[data-fund-edit]'), fundSum = q('[data-fund-sum]');
    let fundOpen = true;
    // a result that is redrawn keeps the sections the buyer had opened (matched by region and heading), so a tap is never undone by a recalculation
    const detKey = (d, ri) => ri + ':' + ((d.querySelector('summary') || {}).textContent || '').trim();
    function openDets(regions) { const m = {}; regions.forEach((rg, ri) => { if (rg) rg.querySelectorAll('details').forEach((d) => { if (d.open) m[detKey(d, ri)] = 1; }); }); return m; }
    function restoreDets(regions, m) { regions.forEach((rg, ri) => { if (rg) rg.querySelectorAll('details').forEach((d) => { if (m[detKey(d, ri)]) d.open = true; }); }); }
    function setFund(open) { fundOpen = open; fund.classList.toggle('is-collapsed', !open); fundEdit.setAttribute('aria-expanded', String(open)); }
    function paintFund() {
      const bits = []; const m = (k) => (has(k) ? $(raw[k]) : '');
      if (has('cash')) bits.push('Cash ' + m('cash')); if (has('cpf')) bits.push('CPF ' + m('cpf')); if (has('income') || has('varIncome')) bits.push('Income ' + $((raw.income || 0) + (raw.varIncome || 0)) + ' a month'); if (has('age')) bits.push('Age ' + raw.age);
      fundSum.innerHTML = bits.map((x) => '<span>' + esc(x) + '</span>').join('');
    }
    const fundBad = () => Object.keys(errMap).some((k) => { const f = fieldFor(k); return f && fund.contains(f); });
    const tryFoldFund = () => { if (dirty) { clearTimeout(tmr); recalc(); } if (fundOpen && last && !fundBad()) setFund(false); };
    fundEdit.addEventListener('click', () => { setFund(true); const f = fund.querySelector('.pl-fform input'); if (f) f.focus(); });
    fund.addEventListener('focusout', (e) => { const n = e.relatedTarget; if (ptr || !n || fund.contains(n)) return; tryFoldFund(); });
    document.addEventListener('click', (e) => { if (fundOpen && !fund.contains(e.target) && !fund.contains(document.activeElement)) { if (e.target.closest && e.target.closest('summary')) setTimeout(tryFoldFund, 0); else tryFoldFund(); } });
    // ---- going to a field: the screen and section that hold it are opened, then it is focused ----
    const flash = (f) => { const w = f && f.closest('.gw-in'); if (!w) return; w.classList.add('pl-flash'); setTimeout(() => w.classList.remove('pl-flash'), 1800); };
    function focusEl(f) {
      if (!f) return;
      const pan = f.closest('[data-panel]'); if (pan && pan.dataset.panel !== screen) setScreen(pan.dataset.panel, { quiet: true });
      if (f.closest('[data-prop]')) setProp(true);
      if (f.closest('[data-fund]')) setFund(true);
      for (let p = f.parentElement; p && p !== box; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
      try { f.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
      f.focus({ preventScroll: true }); flash(f);
    }
    const focusField = (key) => focusEl(fieldFor(key));
    const focusSection = (id) => { const s = box.querySelector('[data-sheet="' + id + '"]'); focusEl(s && ([].slice.call(s.querySelectorAll('input,button')).filter((x) => live(x))[0] || null)); };
    // ---- the still-open list, the fix list and every "Edit" or "Add" link ----
    box.addEventListener('click', (e) => {
      const t = (sel) => e.target.closest(sel);
      const n = t('[data-need]'), o = t('[data-open]'), fx = t('[data-fix]'), ed = t('[data-edit]'), gt = t('[data-goto]'), st = t('[data-set]'), ei = t('[data-ec-illus]'), es = t('[data-ec-switch]');
      if (n) { track('planner_need', { field: n.dataset.need }); focusField(n.dataset.need); }
      else if (gt) focusField(gt.dataset.goto);
      else if (st) { const p = st.dataset.set.split(':'), g = box.querySelector('[data-k="' + p[0] + '"]'); if (g) { setChip(g, p[1]); changed(g); clearTimeout(tmr); recalc(); const again = q('[data-set="' + st.dataset.set + '"]'); if (again) again.focus({ preventScroll: true }); } }
      else if (ei && ackGroup) { setChip(ackGroup, ei.dataset.ecIllus === 'yes' ? 'yes' : ''); changed(ackGroup); clearTimeout(tmr); recalc(); const t0 = q('.pl-ec'); if (t0 && t0.scrollIntoView) { try { t0.scrollIntoView({ block: 'nearest' }); } catch (er) { /* ignore */ } } }
      else if (es) { const kg = box.querySelector('[data-k="kind"]'); if (kg) { setChip(kg, 'new'); changed(kg); clearTimeout(tmr); recalc(); } }
      else if (o) focusSection(o.dataset.open);
      else if (fx) { track('planner_fix', { field: fx.dataset.fix || 'none' }); if (fx.dataset.fix) focusField(fx.dataset.fix); else focusSection('purchase'); }
      else if (ed) { const p = ed.dataset.edit.split(':'); focusField(p[1]); }
    });
    box.addEventListener('toggle', (e) => { if (!e.target || !e.target.matches) return; if (e.target.matches('[data-tech]')) techOpen = e.target.open; }, true);
    // ---- actions ----
    // a printout carries everything: collapsed sections open for printing and go back afterwards
    let wasOpen = [];
    root.addEventListener('beforeprint', () => { wasOpen = $$('details[data-more],details[data-yd],details[data-stagedet],details[data-instal-d],details.pl-cpfnote').filter((d) => !d.open); wasOpen.forEach((d) => { d.open = true; }); });
    root.addEventListener('afterprint', () => { wasOpen.forEach((d) => { d.open = false; }); wasOpen = []; });
    q('[data-print]').addEventListener('click', () => { track('planner_print', {}); try { root.print(); } catch (e) { /* no print */ } });
    q('[data-copy]').addEventListener('click', () => { if (!last) return; const t = summaryText(last.r, last.i, last.scn); const done = () => { out.note.textContent = 'Summary copied. It carries the result and the price, not your cash, CPF or income.'; }; track('planner_share', {});
      if (root.navigator && root.navigator.clipboard) root.navigator.clipboard.writeText(t).then(done, () => { out.note.textContent = t; }); else out.note.textContent = t; });
    $$('[data-fb]').forEach((b) => b.addEventListener('click', () => { track('planner_feedback', { answer: b.dataset.fb }); $$('[data-fb]').forEach((x) => { x.setAttribute('aria-pressed', String(x === b)); }); const n = q('[data-fb-note]'); n.innerHTML = 'Thank you. <a href="' + esc(waUrl('Hi Ken, feedback on the Payment timeline (' + b.dataset.fb + '): ')) + '" target="_blank" rel="noopener" data-gw-wa="calc-payment-planner-feedback">Tell Ken what was missing ›</a>'; }));
    function wa() { const a = q('[data-ask-wa]'); if (!a) return; const m = 'Hi Ken, I’m using the Payment timeline on Groundwork' + (last ? ' for a ' + KIND[last.i.uiKind || last.r.kind] + ' (' + ORDER_T[last.r.order] + ')' : '') + ' and would like to talk through the order of moves. (Ref ' + REF + ')'; const u = waUrl(m); if (root.GW_WA) root.GW_WA.set(a, u); else a.setAttribute('href', u); }
    recalc();
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }
  return { dateProblems, stageMark, whenHtml, instalSteps, sumHtml, schedSumHtml, pageHtml, formHtml, loanLine, warnHtml, assumeHtml, compareHtml, scheduleTableHtml, fundTableHtml, verdictHtml, instalHtml, leavesOutHtml, scheduleText, needHtml, fixHtml, entriesHtml, summaryText, ecIncomeCheck, ecHtml, ecGate, illusHtml, msrCase, grossOf, REF };
});