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
  const REF = 'KPT-CALC-PAY';
  const $ = (n) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
  const pc = (x, d) => (Math.round(x * 100 * Math.pow(10, d || 0)) / Math.pow(10, d || 0)) + '%';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? +m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : (iso || ''); };
  const mon = (iso) => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? MON[+m[2] - 1] + ' ' + m[1] : (iso || ''); };
  const KIND = { new: 'new launch, private', ec: 'new EC from the developer', resaleec: 'resale EC', completed: 'completed private home' };
  const kindText = (r, v) => KIND[(v && v.uiKind) || r.kind];
  const TENDER_T = { before: 'before 24 Aug 2026', after: 'on or after 24 Aug 2026' };
  // whether MSR (30% of gross income) is tested besides TDSR: a new EC is always inside its MOP; a resale EC only while it is; unknown stays unknown
  const msrCase = (uiKind, mop) => (uiKind === 'ec' ? 'applies' : uiKind === 'resaleec' ? (mop === 'within' ? 'applies' : mop === 'ended' ? 'not' : 'unknown') : null);
  // fixed plus variable monthly income, as entered (R1.2.2); a caller that only knows `income` gets that figure
  const grossOf = (i) => (i && typeof i.gross === 'number' ? i.gross : ((i && i.income) || 0) + ((i && i.varIncome) || 0));
  const ORDER_T = { buy: 'buy first, then sell', sell: 'sell first, then buy', none: 'no home to sell' };
  const FLAT = [['outstanding', 'Still outstanding (safest)'], ['contracted', 'Sale contracted before the bank assesses'], ['discharged', 'Discharged before the bank assesses'], ['undertaking', 'Undertaking to HDB to sell'], ['none', 'No loan (fully paid)']];
  const RES = [['SC', 'Singapore Citizen'], ['PR', 'Permanent Resident'], ['FR', 'Foreigner']], OWN = [['0', 'None'], ['1', 'One'], ['2', 'Two or more']];
  const OWNED_HINT = 'Count any share in a home, including the flat you are selling, and homes you have signed to buy. Property overseas doesn’t count.';
  const CPF_HINT = 'The CPF OA amount you can actually use for this home. CPF cannot pay the booking fee or the minimum cash; stamp duty is paid in cash first and may be reimbursed later; valuation and withdrawal limits, the remaining lease and the age-55 retirement rules can cap what CPF releases. Check your CPF housing limits.';

  /* ---------------- fields (same markup conventions as the other calculators) ---------------- */
  const hint = (h) => (h ? '<small>' + h + '</small>' : '');
  const money = (k, label, o) => { o = o || {}; return '<label class="gw-fld"><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><div class="gw-in gw-in-m"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="money"' + (o.share ? ' data-share="' + o.share + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.value ? ' value="' + esc(o.value) + '" data-default="' + esc(o.value) + '"' : '') + ' aria-invalid="false"></div>' + hint(o.hint) + '</label>'; };
  const numf = (k, label, unit, o) => { o = o || {}; return '<label class="gw-fld"><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><div class="gw-in"><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="num"' + (o.share ? ' data-share="' + o.share + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.value !== undefined ? ' value="' + esc(o.value) + '" data-default="' + esc(o.value) + '"' : '') + ' aria-invalid="false">' + (unit ? '<i class="u">' + unit + '</i>' : '') + '</div>' + hint(o.hint) + '</label>'; };
  const datef = (k, label, o) => { o = o || {}; return '<label class="gw-fld"><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><div class="gw-in"><input type="date" data-k="' + k + '" data-t="date"' + (o.today ? ' data-today="1"' : '') + '></div>' + hint(o.hint) + '</label>'; };
  const chips = (k, label, opts, o) => { o = o || {}; return '<div class="gw-q gw-fld"><span class="l">' + label + '</span><div class="gw-chips" role="group" aria-label="' + esc(label) + '" data-k="' + k + '" data-t="chip"' + (o.share ? ' data-share="' + o.share + '"' : '') + ' data-default="' + esc(o.value) + '">' + opts.map((x) => '<button type="button" class="gw-chip" data-v="' + x[0] + '" aria-pressed="' + (x[0] === o.value) + '">' + x[1] + '</button>').join('') + '</div>' + hint(o.hint) + '</div>'; };
  const check = (k, label, o) => { o = o || {}; return '<label class="gw-ck"><input type="checkbox" data-k="' + k + '" data-t="check"' + (o.checked ? ' checked data-default="1"' : ' data-default="0"') + '><span>' + label + '</span></label>'; };
  const grid = (inner) => '<div class="gw-grid">' + inner + '</div>';
  function buyersBlock() {
    const row = (n) => '<div class="gw-person" data-row="buyers.' + n + '"' + (n ? ' hidden' : '') + '><p class="gw-ph-l">' + (n ? 'Second buyer <button type="button" class="gw-link" data-remove="buyers.1">Remove</button>' : 'Buyer') + '</p>' +
      chips('buyers.' + n + '.res', 'Residency', RES, { value: 'SC', share: 'buyers.' + n + '.res' }) +
      chips('buyers.' + n + '.owned', 'Residential properties already owned in Singapore, including HDB flats', OWN, { value: '0', share: 'buyers.' + n + '.owned', hint: n ? '' : OWNED_HINT }) + '</div>';
    return row(0) + row(1) + '<button type="button" class="gw-link gw-add" data-add="buyers.1">+ Add a second buyer</button>';
  }
  // Each sheet is a group of inputs: the left rail on desktop, a bottom sheet on a phone (opened from the "Your assumptions" card).
  const sheet = (id, title, inner, o) => '<section class="pl-sheet" data-sheet="' + id + '" aria-labelledby="pls-' + id + '"' + (o && o.when ? ' data-when="' + o.when + '"' : '') + '><div class="pl-sheet-h"><h2 id="pls-' + id + '">' + title + '</h2></div><div class="pl-sheet-b">' + inner + '</div><div class="pl-sheet-f"><span class="pl-sheet-n" data-sheet-note aria-live="polite"></span><button type="button" class="pl-sheet-x" data-sheet-close>Done</button></div></section>';
  function formHtml() {
    return sheet('purchase', 'Your purchase',
      chips('kind', 'What are you buying?', [['new', 'New launch'], ['ec', 'New EC'], ['resaleec', 'Resale EC'], ['completed', 'Completed home']], { value: 'new', hint: 'New EC means bought from the developer. A resale EC is bought from its owner and follows different rules.' }) +
      '<div data-when="kind:ec">' + chips('tender', 'When did the EC site’s land tender close?', [['unsure', 'Not sure'], ['before', 'Before 24 Aug 2026'], ['after', 'On or after 24 Aug 2026']], { value: 'unsure', hint: 'It sets the household income ceiling for a new EC: $16,000 a month if the tender closed before 24 Aug 2026, $18,000 if on or after. A balance unit in an older EC project keeps the lower ceiling, so choose “Before 24 Aug 2026” for it. The developer or HDB can tell you.' }) +
        '<div class="gw-chips" data-k="ecIllus" data-t="chip" data-default="" hidden style="display:none" aria-hidden="true"><button type="button" class="gw-chip" data-v="yes" aria-pressed="false" tabindex="-1">yes</button></div></div>' +
      '<div data-when="kind:resaleec">' + chips('mop', 'Has the EC’s minimum occupation period (MOP) ended?', [['unsure', 'Not sure'], ['ended', 'Yes, it has ended'], ['within', 'No, still within it']], { value: 'unsure', hint: 'It decides whether the 30% MSR limit applies to the loan, as well as TDSR (MAS Notice 645). The owner’s agent or HDB can tell you. If you are not sure, the planner marks the financing as incomplete rather than guessing.' }) + '</div>' +
      grid(money('price', 'Purchase price', { share: 'buyPrice', ph: 'e.g. 1,800,000' }) + datef('otp', 'Option date', { today: true, hint: 'The day you pay the booking or option fee. Every other date counts from here.' }))) +
    sheet('money', 'Your money',
      grid(money('cash', 'Cash available now', { ph: 'e.g. 300,000' }) + money('cpf', 'CPF OA you can use', { share: 'cpfOa', ph: 'all buyers', hint: CPF_HINT }) +
        money('saveMo', 'Cash set aside each month', { opt: true, ph: 'e.g. 3,000' }) + money('cpfMo', 'CPF OA added each month', { opt: true, ph: 'all buyers', hint: 'Your monthly OA contributions. Not worked out from income in this release.' })) +
      check('payInstalmentFromCpf', 'Pay monthly instalments from CPF OA first, then cash', { checked: true }) + '<p class="gw-fine">CPF can service the instalments only within your CPF housing limits; the planner does not check those limits.</p>') +
    sheet('buyers', 'Buyers and loan',
      buyersBlock() + grid(numf('age', 'Borrower’s age', 'years', { share: 'borrowers.0.age', ph: 'e.g. 35', hint: 'Two borrowers: use their income-weighted average age (How much can I borrow? works it out and shows both ways of weighting it). It sets the loan limit together with the tenure. Which income MAS weights by is not confirmed, so results for two borrowers are unverified.' }) +
        numf('ratePct', 'Quoted interest rate', '% a year', { value: '4', hint: 'The rate you have been quoted. The 4% stress check is shown separately.' }) + numf('years', 'Loan tenure', 'years', { value: '30', hint: '<span data-tenure-note>Banks can lend for up to 35 years. Over 30 years, or past age 65, the lower loan limit applies.</span>' })) +
      chips('loansOther', 'Other housing loans you will still have', [['0', 'None'], ['1', 'One'], ['2', 'Two or more']], { value: '0', hint: 'Besides the loan on the home you are selling, if any. HDB loans count.' }) +
      money('income', 'Monthly fixed income, both borrowers', { opt: true, ph: 'salary, gross, before CPF', hint: 'Optional. Salary and other fixed pay, before CPF, for everyone buying. Checks the loan against your income (TDSR). For a new EC it also checks the household income ceiling, and an EC still within its MOP is tested against MSR too. Stays on this device.' }) +
      money('varIncome', 'Monthly variable income, both borrowers', { opt: true, ph: 'bonus, commission, allowances', hint: 'Optional. Bonus, commission and allowances, as a monthly average over the last 12 months (a yearly total ÷ 12). Banks count only 70% of it. Type 0 if none; leave it blank and all the income above is treated as fixed salary. Stays on this device.' }) +
      money('debts', 'Other monthly debt repayments', { opt: true, ph: 'car, cards, other loans', hint: 'Optional. Reduces the loan your income supports in the TDSR check. Stays on this device; not shared with other tools.' }) +
      '<div data-when="msr:1">' + money('propertyLoans', 'Monthly housing-loan instalments', { opt: true, ph: 'loans you will still have', hint: 'Optional. An EC still within its minimum occupation period (every new EC from the developer) is held to MSR, which counts every housing-loan instalment you will still have. Include the loan on a home you are selling only if the bank will still count it. Stays on this device; not shared with other tools.' }) + '</div>') +
    sheet('sale', 'The home you are selling',
      chips('order', 'Do you have a home to sell?', [['buy', 'Buy first, then sell'], ['sell', 'Sell first, then buy'], ['none', 'Nothing to sell']], { value: '', hint: 'Choose one. Nothing is assumed.' }) +
      '<div data-when="order:buy,sell">' + grid(numf('saleMonth', 'Sale completes', 'months after the option', { value: '5', hint: 'For buy-first: when the sale money arrives. Or enter the completion date below.' }) + datef('saleDate', 'Completion date', { opt: true }) +
        money('saleCash', 'Cash proceeds', { ph: 'after the loan and CPF refund' }) + money('saleCpf', 'Returned to CPF', { opt: true, ph: 'principal + accrued interest', hint: 'Sale proceeds works these two out from your flat’s price, loan and CPF used.' })) +
      chips('flatLoan', 'Housing loan on the home you are selling, when the bank assesses the new loan', FLAT, { value: 'outstanding', hint: 'MAS counts it unless it is discharged, the sale is contracted (signed S&amp;P with the stamp certificate, or HDB’s approval letter) or there is an undertaking to HDB to sell. "Still outstanding" is the safe assumption when you don’t know.' }) +
      check('removesOwnership', 'The sale removes a home I own (counts for ABSD)', { checked: true }) + '</div>') +
    sheet('refund', 'ABSD refund and interim housing',
      '<div data-when="order:buy"><div class="gw-q gw-fld"><span class="l">ABSD refund</span>' + check('refundAssume', 'Assume the ABSD is refunded after the sale', {}) + '<small data-refund-elig></small></div>' +
      grid(numf('refundMonths', 'Refund arrives', 'months after the sale', { value: '2', hint: 'An assumption: IRAS processes the refund after you apply; the planner never counts it before this date.' })) + '</div>' +
      '<div data-when="order:sell">' + grid(money('rent', 'Interim rent per month', { opt: true, ph: 'while you wait for the keys', hint: 'Paid in cash from the option until the keys (TOP or completion).' })) + '</div>' +
      '<p class="gw-fine" data-when="order:none">Not needed when there is nothing to sell.</p>') +
    sheet('dates', 'Construction dates',
      '<div data-when="kind:new,ec">' + chips('datesMode', 'Stage dates', [['grouped', 'Unknown (safest)'], ['spread', 'Show an illustration too']], { value: 'grouped', hint: 'The headline always uses the earliest date each stage could be called. The illustration spreads the stages over typical months and never changes the headline.' }) +
      grid(datef('top', 'Developer’s expected TOP', { opt: true }) + datef('csc', 'Expected final payment (CSC)', { opt: true, hint: 'From the developer. Without them, illustrative dates are used and labelled.' })) + '</div>' +
      '<div data-when="kind:completed,resaleec">' + grid(datef('completion', 'Completion date', { opt: true, hint: 'Without it: 12 weeks after the option (a planning convention).' })) + '</div>');
  }

  /* ---------------- page ---------------- */
  function pageHtml() {
    return '<section class="gw-plan pl" data-plan>' +
      '<div class="pl-grid">' +
      '<aside class="pl-rail" aria-label="Your details"><div class="pl-rail-in">' + formHtml() + '</div></aside>' +
      '<div class="pl-order" data-order-switch role="group" aria-label="Order of moves"><button type="button" data-order="buy" aria-pressed="false">Buy first, then sell</button><button type="button" data-order="sell" aria-pressed="false">Sell first, then buy</button></div>' +
      '<div class="pl-result" data-result aria-live="polite"></div>' +
      '<div class="pl-assume" data-assume aria-label="Your assumptions"></div>' +
      '<div class="pl-compare" data-compare></div>' +
      '<div class="pl-timeline" data-timeline></div>' +
      '<div class="pl-chart" data-chart></div>' +
      '<div class="pl-mortgage" data-mortgage></div>' +
      '<div class="pl-bank" data-bank></div>' +
      '<div class="pl-acts" data-acts><button type="button" class="gw-btn pri" data-print>Print / save as PDF</button><button type="button" class="gw-btn sec" data-copy>Copy summary</button><span class="gw-fine" data-acts-note aria-live="polite"></span><div class="pl-startover"><span class="pl-so-l">Start over</span><button type="button" class="gw-btn sec" data-gw-clear-all aria-expanded="false">Clear all my figures</button></div><p class="gw-fine pl-store">Your figures stay in this browser tab only (its session storage), so the other calculators can reuse the price, buyers, age and CPF OA; nothing is sent to a server, the address or analytics, and everything is gone when the tab closes. <b>Clear all my figures</b> asks you to confirm, then removes every figure this tab holds: this planner and every calculator (prices, CPF, income, debts, loans, sale figures), and what the HDB upgrade tool and the What can I buy? tool carry across. Which path you are on stays.</p></div>' +
      '<div class="pl-ask" data-ask><div class="pl-ask-in"><b>Talk through the order of moves with Ken</b><p class="gw-fine">Only the scenario name goes into the message, no figures. You can edit it before sending.</p><a class="gw-btn wa" data-ask-wa href="https://wa.me/' + PHONE + '" target="_blank" rel="noopener" data-gw-wa="calc-payment-planner-ask">Message Ken on WhatsApp</a>' +
      '<div class="pl-fb" data-fb><span>Was this useful?</span><button type="button" data-fb="yes">Yes</button><button type="button" data-fb="partly">Partly</button><button type="button" data-fb="no">No</button><span class="gw-fine" data-fb-note aria-live="polite"></span></div></div></div>' +
      '<p class="gw-fine pl-src" data-src>Rules: IRAS (BSD, ABSD and remissions), MAS Notices 632 and 645, CPF Board, Housing Developers Rules, as recorded in Groundwork’s rules file (checked 9 Oct 2026). Planning conventions checked 15 Oct 2026. Estimates, not advice: your bank, HDB, CPF Board and IRAS decide.</p>' +
      '</div>' +
      '<div class="pl-strip" data-strip hidden role="region" aria-label="Result summary"><div class="in"><span class="t"><b data-strip-v></b><small data-strip-s></small></span><button type="button" class="gw-btn pri" data-strip-go>Edit details</button></div></div>' +
      '<div class="pl-backdrop" data-backdrop hidden></div>' +
      '</section>' +
      '<noscript><p class="gw-fine">The planner needs JavaScript. Ken can work the timeline through with you on <a href="' + esc(waUrl('Hi Ken, I’d like help planning the payments for a purchase. (Ref ' + REF + ')')) + '">WhatsApp</a>.</p></noscript>';
  }

  /* ---------------- results (markup) ---------------- */
  const CONF = { rule: ['Rule', 'IRAS / MAS / Housing Developers Rules'], developer: ['Developer', 'a date you supplied'], estimate: ['Estimate', 'a planning convention'], illustrative: ['Illustration', 'typical month, not a date'], assumption: ['Assumption', 'your own figure'] };
  const tag = (c) => '<span class="pl-tag ' + c + '" title="' + esc(CONF[c] ? CONF[c][1] : '') + '">' + (CONF[c] ? CONF[c][0] : c) + '</span>';
  function resultHtml(r) {
    const h = r.headline, yrs = Math.round(r.horizonMonths / 12);
    if (!(h.peak > 0)) return '<div class="pl-res ok"><p class="pl-kick">Funding</p><div class="gw-res-h"><span>Every payment is covered on its due date</span><b>$0 short</b><small>From your cash, CPF, the bank loan' + (r.order === 'buy' ? ' and the sale in time' : r.order === 'sell' ? ' and the sale proceeds' : '') + ', with every undated stage tested at the earliest date it could be called.</small></div></div>';
    const late = h.coveredOn ? 'Your later money (' + esc(h.coveredBy) + ') only closes the gap in ' + mon(h.coveredOn) + ' — after the due date. It does not make the ' + day(h.peakAt) + ' payment affordable; the money has to be there on that day.' : 'Nothing in your figures closes the gap within ' + yrs + ' years of the option (' + $(h.uncoveredEnd) + ' still uncovered).';
    const fm = firstMiss(r);
    const same = h.firstGap && h.firstGap === h.peakAt;
    const first = '<div class="pl-first"><span class="pl-lab">First payment you can’t meet</span><b>' + (h.firstGap ? day(h.firstGap) : '') + (fm.label ? ' · ' + esc(fm.label) : '') + '</b><small>' + (fm.amount > 0 ? $(fm.amount) + ' of it is not covered. ' : '') + (same ? 'This is also where the maximum funding gap is reached.' : 'Unpaid amounts build up from here; the maximum funding gap is below.') + '</small></div>';
    const inc = !same && fm.amount > 0 ? ', including the earlier ' + $(fm.amount) + ' above' : ', including earlier unpaid amounts';
    return '<div class="pl-res short"><p class="pl-kick">Short on a due date</p>' + first + '<div class="gw-res-h"><span class="pl-lab">Maximum funding gap</span><b>' + $(h.peak) + '</b><span>You need this in hand by ' + day(h.peakAt) + ', to pay ' + esc(h.peakCause) + ' on time.</span><small class="pl-gapnote">This is the largest total your funds fall short by at any one time' + inc + ' — not an extra ' + $(h.peak) + ' on top.</small></div>' +
      '<dl class="pl-kv"><div><dt>Why</dt><dd>' + esc(h.peakCause) + ' falls due before enough cash or CPF has arrived.</dd></div><div><dt>Later</dt><dd>' + late + '</dd></div><div><dt>Fix</dt><dd>Bring money forward (more cash or CPF, an earlier sale), change the order of moves, or look at a lower price — then check the figure again.</dd></div></dl></div>';
  }
  // the first payment that cannot be met in full, read from the engine's own events (no calculation here)
  function firstMiss(r) {
    const h = r.headline; if (!h.firstGap) return {};
    const e = r.events.filter((x) => x.type === 'pay' && x.date === h.firstGap && x.uncovered > 0)[0];
    return e ? { label: e.label, amount: e.uncovered } : { label: 'Monthly instalment' + (r.order === 'sell' ? ' and rent' : ''), amount: 0 };
  }
  function assumeHtml(r, v) {
    const rows = [
      ['purchase', 'Purchase', $(r.price) + ' · ' + kindText(r, v) + ' · option ' + day(r.otp)],
      ['money', 'Money now', 'cash ' + $(v.cash || 0) + ' · CPF OA ' + $(v.cpf || 0) + (v.saveMo || v.cpfMo ? ' · +' + $(v.saveMo || 0) + ' / +' + $(v.cpfMo || 0) + ' a month' : ' · no monthly savings added')],
      ['buyers', 'Loan basis', (r.loan.capped ? $(r.loan.loanMax) + ' income-supported loan (rule limit ' + pc(r.loan.ltv) + ')' : pc(r.loan.ltv) + ' loan') + (r.loan.lower ? ' (lower limit: ' + (r.loan.lowerWhy === 'age' ? 'runs past 65' : 'tenure over 30 years') + ')' : '') + ' · ' + r.loan.loans + ' housing loan' + (r.loan.loans === 1 ? '' : 's') + ' counted · ' + r.loan.years + ' yrs at ' + pc(r.loan.ratePct / 100, 2) + ' · age ' + v.age],
      ['sale', r.order === 'none' ? 'Sale' : 'Home you are selling', r.order === 'none' ? 'nothing to sell' : (r.order === 'sell' ? 'sold before the option · ' : 'completes ' + day(r.saleDate) + ' · ') + $(v.sale.cash || 0) + ' cash · ' + $(v.sale.cpf || 0) + ' to CPF · loan ' + (r.loan.flatLoan === 'sold' ? 'discharged on sale' : r.loan.flatLoan)],
      ['refund', r.order === 'sell' ? 'Interim rent' : 'ABSD refund', r.order === 'sell' ? (v.rent && v.rent.monthly ? $(v.rent.monthly) + ' a month until the keys' : 'none entered') : r.order === 'none' ? '—' : (r.duty.absd > 0 ? (v.refund && v.refund.assume ? 'assumed ' + (v.refund.monthsAfterSale || 2) + ' months after the sale · never guaranteed' : 'not assumed') : 'no ABSD on this purchase')],
    ];
    return '<p class="pl-kick">Your assumptions</p><p class="gw-fine pl-tapedit">Tap a row to edit it. Everything else stays as it is.</p><div class="pl-arows">' + rows.map((x) => '<button type="button" class="pl-arow" data-open="' + x[0] + '"><span><b>' + x[1] + '</b><em>' + esc(x[2]) + '</em></span><i aria-hidden="true">Edit</i></button>').join('') + '</div>';
  }
  function compareHtml(c) {
    if (!c || !c.ok) return '';
    const L = {}; c.lines.forEach((l) => { L[l.id] = l; });
    const row = (label, a, b) => '<div class="pl-crow"><span>' + label + '</span><b>' + a + '</b><b>' + b + '</b></div>';
    return '<p class="pl-kick">Buy first vs sell first · same purchase</p><div class="pl-cmp"><div class="pl-crow h"><span></span><b>Buy first</b><b>Sell first</b></div>' +
      row('Maximum funding gap', $(L.peak.buy), $(L.peak.sell)) + row('ABSD paid up front', $(L.absd.buy), $(L.absd.sell)) + row('Interim rent, total', $(L.rent.buy), $(L.rent.sell)) + row('Loan limit', pc(L.ltv.buy), pc(L.ltv.sell)) + row('Instalment once fully drawn', $(L.instal.buy) + '/mo', $(L.instal.sell) + '/mo') + '</div>' +
      '<p class="gw-fine">Buy first: ' + esc(L.ltv.text.buy) + ' Sell first: ' + esc(L.ltv.text.sell) + ' Neither is a bank offer.</p>';
  }
  function timelineHtml(r) {
    const ev = r.events, peakAt = r.headline.peakAt;
    let firstDone = false;
    const rows = ev.map((e) => {
      if (e.type === 'in') return '<div class="pl-ev in"><i class="d in"></i><div class="w"><b>' + esc(e.label) + '</b><span>' + day(e.date) + ' · ' + tag(e.confidence) + (e.eligible === false ? ' <span class="pl-tag warn">profile not eligible</span>' : '') + '</span><span class="s">' + esc(e.source) + '</span></div><div class="amt">+' + $(e.cashIn + (e.cpfIn || 0)) + '<small>' + (e.cpfIn ? $(e.cashIn) + ' cash · ' + $(e.cpfIn) + ' CPF' : 'cash') + '</small></div></div>';
      const how = []; if (e.cpfUsed) how.push('CPF ' + $(e.cpfUsed)); if (e.cashUsed) how.push('cash ' + $(e.cashUsed)); if (e.bank) how.push('bank ' + $(e.bank)); if (e.uncovered) how.push('<b class="pl-bad">not yet covered ' + $(e.uncovered) + '</b>');
      const peak = e.date === peakAt && e.uncovered > 0, first = e.uncovered > 0 && e.date === r.headline.firstGap && !firstDone && (firstDone = true);
      return '<div class="pl-ev' + (peak ? ' peak' : '') + (e.uncovered > 0 ? ' short' : '') + '"' + (peak ? ' aria-current="true"' : '') + '><i class="d ' + (e.uncovered > 0 ? 'bad' : e.confidence === 'rule' ? 'rule' : 'est') + '"></i><div class="w"><b>' + esc(e.label) + (e.pct ? ' <small>' + pc(e.pct) + '</small>' : '') + '</b><span>' + day(e.date) + (e.confidence === 'estimate' && e.id !== 'top' && e.id !== 'csc' ? ' (earliest)' : '') + ' · ' + tag(e.confidence) + (e.provisional ? ' <span class="pl-tag warn">provisional</span>' : '') + (first ? ' <span class="pl-tag bad">first payment missed</span>' : '') + (peak ? ' <span class="pl-tag bad">maximum funding gap</span>' : '') + '</span><span class="s">' + how.join(' · ') + '</span>' + (e.provisional ? '<span class="s pl-prov">' + esc(e.source) + '</span>' : '') + '</div><div class="amt">' + $(e.amount) + (e.instalment ? '<small>then ' + $(e.instalment) + '/mo</small>' : '') + '</div></div>';
    }).join('');
    return '<p class="pl-kick">Each payment, and what pays it</p><div class="pl-evs" role="list">' + rows + '</div><p class="gw-fine">Totals: cash ' + $(r.totals.cash) + ' · CPF ' + $(r.totals.cpf) + ' · bank ' + $(r.totals.bank) + (r.totals.uncovered ? ' · <b class="pl-bad">not yet covered ' + $(r.totals.uncovered) + '</b>' : '') + ' · of ' + $(r.totals.amount) + ' including duty. Undated stages are tested at the earliest date they could be called; a later inflow never pays an earlier bill retrospectively — it closes the gap on its own date.</p>';
  }
  function chartHtml(r) {
    const S = r.series; if (!S || S.length < 2) return '';
    const W = 600, H = 220, L = 46, Rr = 10, T = 14, B = 30;
    const mx0 = Math.max.apply(null, S.map((s) => Math.max(s.cash, s.cpf, s.uncovered))); if (!(mx0 > 0)) return '';
    const step = Math.pow(10, Math.floor(Math.log10(mx0))); const mx = Math.ceil(mx0 / (step / 2)) * (step / 2);
    const X = (i) => L + i / (S.length - 1) * (W - L - Rr), Y = (v) => T + (1 - v / mx) * (H - T - B);
    const line = (k, cls) => '<polyline class="' + cls + '" points="' + S.map((s, i) => X(i).toFixed(1) + ',' + Y(s[k]).toFixed(1)).join(' ') + '"/>';
    const ticks = [0, 1, 2, 3, 4].map((k) => { const f = k / 4; const v = mx * f; return '<g><line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + (v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'm' : Math.round(v / 1000) + 'k') + '</text></g>'; }).join('');
    const years = S.map((s, i) => (/-01-/.test(s.date) && i ? '<text x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + s.date.slice(0, 4) + '</text>' : '')).join('');
    const marks = r.events.filter((e) => e.type === 'in').map((e) => { const i = S.findIndex((s) => s.date >= e.date); if (i < 0) return ''; return '<line class="mk" x1="' + X(i).toFixed(1) + '" x2="' + X(i).toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '"/>'; }).join('');
    return '<p class="pl-kick">Cash and CPF left, month by month</p><figure class="pl-fig"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-labelledby="plc-t plc-d"><title id="plc-t">Cash and CPF balances over time</title><desc id="plc-d">' + (r.headline.peak > 0 ? 'Maximum funding gap ' + $(r.headline.peak) + ' on ' + day(r.headline.peakAt) + (r.headline.coveredOn ? ', covered ' + mon(r.headline.coveredOn) : '') : 'No shortfall') + '.</desc><g class="grid">' + ticks + '</g>' + marks + line('uncovered', 'un') + line('cash', 'cash') + line('cpf', 'cpf') + '<g class="ax">' + years + '</g></svg>' +
      '<figcaption><span><i class="cash"></i>Cash</span><span><i class="cpf"></i>CPF OA</span><span><i class="un"></i>Not yet covered</span><span><i class="mk"></i>Money arrives</span></figcaption></figure>';
  }
  function mortgageHtml(r, tdsr, ec) {
    const last = r.events.filter((e) => e.type === 'pay' && e.bank).slice(-1)[0], lim = ec && tdsr && tdsr.binding === 'msr' ? 'MSR' : ec ? 'TDSR' : 'TDSR';
    return '<p class="pl-kick">Mortgage commitments</p><dl class="gw-rows"><div><dt>Loan</dt><dd>' + $(r.loan.loanMax) + (r.loan.capped ? ' <span class="pl-tag warn">income-supported, below the rule ceiling of ' + $(r.loan.ruleLoanMax) + '</span> · ' : ' · ' + pc(r.loan.ltv) + ' of the price · ') + r.loan.years + ' years · minimum cash ' + pc(r.loan.minCash) + ' (' + $(r.loan.cashMin) + ')</dd></div>' +
      '<div><dt>Instalment once fully drawn</dt><dd><b>' + $(r.instalment.final) + ' a month</b> at your quoted ' + pc(r.loan.ratePct / 100, 2) + (last ? ' · from ' + day(last.date) : '') + '</dd></div>' +
      '<div><dt>Stress check</dt><dd>' + $(r.instalment.finalStress) + ' a month at ' + pc(r.loan.stressRatePct / 100) + ' — the figure the bank tests under TDSR, not what you pay' + (tdsr ? (tdsr.ok ? ' · with your income the ' + lim + ' limit allows ' + $(tdsr.forNew) + ' a month' + ((r.loan.capped ? tdsr.forNew + 0.5 : tdsr.forNew) >= r.instalment.finalStress ? ' <span class="pl-tag ok">within ' + lim + '</span>' : ' <span class="pl-tag warn">above ' + lim + '</span>') : '') : '') + '</dd></div>' +
      '<div><dt>Basis</dt><dd>' + esc(r.loan.basis) + ' Indicative only, not a bank offer.</dd></div></dl>';
  }
  /* ---------------- R1.1: what limits your borrowing, tenure and the loan limit, fixing entries ----------------
     ctx (all from the engine, none computed here): { age, cap (standard tenure, years), max (maximum tenure, years), std (longest tenure that keeps the
     standard limit at this age), tdsr (GW_CALC.tdsr at the chosen tenure, or null), alt ({ years, r, tdsr } the same plan at `std` years, or null),
     undo ({ from, to } after "Use N years") } */
  const edit = (to, text) => '<button type="button" class="gw-link pl-edit" data-edit="' + to + '">' + text + '</button>';
  function limitWhy(r, ctx) {
    const L = r.loan, n = L.loans + ' housing loan' + (L.loans === 1 ? '' : 's') + ' counted';
    if (!L.lower) return n + '; ' + L.years + ' years at age ' + ctx.age + ' keeps the standard limit';
    const why = [];
    if (L.years > ctx.cap) why.push('a tenure over ' + ctx.cap + ' years');
    if (ctx.std != null && ctx.std < ctx.cap && L.years > ctx.std) why.push('a loan running past age 65 (' + L.years + ' years at age ' + ctx.age + ')');
    return n + '; ' + (why.length ? why.join(' and ') : 'the tenure or age') + ' takes the lower limit';
  }
  function tenureHtml(r, v, ctx) {
    const a = ctx.alt, L = r.loan;
    if (!a) return ctx.undo ? '<div class="pl-ten"><p class="gw-fine">Tenure changed from ' + ctx.undo.from + ' to ' + ctx.undo.to + ' years. <button type="button" class="gw-link pl-edit" data-use-tenure="' + ctx.undo.from + '">Put back ' + ctx.undo.from + ' years</button></p></div>' : '';
    const x = a.r.loan, why = [];
    if (L.years > ctx.cap) why.push('the tenure is over ' + ctx.cap + ' years');
    if (ctx.std < ctx.cap && L.years > ctx.std) why.push('the loan runs past age 65');
    const gap = (rr) => (rr.headline.peak > 0 ? 'maximum funding gap ' + $(rr.headline.peak) : 'every due date covered');
    const opt = (cls, lab, rr) => '<div class="pl-opt' + cls + '"><span class="pl-lab">' + lab + '</span><b>' + pc(rr.loan.ltv) + ' limit · loan up to ' + $(rr.loan.loanMax) + '</b><small>' + $(rr.instalment.final) + ' a month once fully drawn · ' + gap(rr) + '</small></div>';
    const inc = ctx.tdsr && a.tdsr ? ' and lowers the loan your income supports (about ' + $(a.tdsr.maxLoan) + ' over ' + a.years + ' years, against about ' + $(ctx.tdsr.maxLoan) + ' over ' + L.years + ')' : ' and also lowers the loan your income supports';
    return '<div class="pl-ten"><p class="pl-kick">Tenure and the loan limit</p>' +
      '<p class="pl-tp">At age ' + esc(ctx.age) + ', <b>up to ' + a.years + ' years</b> keeps the standard ' + pc(x.ltv) + ' limit. Your ' + L.years + ' years takes the lower ' + pc(L.ltv) + ' limit (' + why.join(' and ') + '). Up to ' + ctx.max + ' years is allowed, at the lower limit.</p>' +
      '<div class="pl-opts">' + opt('', 'Your tenure · ' + L.years + ' years', r) + opt(' alt', 'Shorter · ' + a.years + ' years', a.r) + '</div>' +
      '<p class="gw-fine">A higher limit is a ceiling, not an approval: the bank still tests your income. A shorter tenure means a higher monthly repayment' + inc + '. Nothing changes unless you choose it.</p>' +
      '<div class="pl-ten-b"><button type="button" class="gw-btn sec" data-use-tenure="' + a.years + '">Use ' + a.years + ' years</button>' + edit('buyers:years', 'Type another tenure') + '</div></div>';
  }

  /* ---------------- R1.2.2: how the income is counted, the rate it is tested at, and two borrowers ---------------- */
  // B: GW_CALC.borrowers() of the entered fixed and variable income. Every figure below is the engine's (counted income, the part not counted) or a difference of two of them;
  // the share counted is read back from them, so no rule value is written into this file.
  function countedHtml(v, B) {
    const V = v.varIncome, F = v.income;
    if (V > 0) { const keep = (V - B.haircut) / V; return '<span class="pl-tag rule">Rule</span> <b>' + $(B.assessable) + ' a month</b>: ' + (F > 0 ? $(F) + ' fixed + ' : '') + pc(keep) + ' of the ' + $(V) + ' variable (' + $(B.assessable - F) + '). The other ' + $(B.haircut) + ' is not counted. MAS requires banks to count at most ' + pc(keep) + ' of variable income, averaged over the last 12 months; your bank may count less, or ask for payslips and tax records. ' + edit('buyers:varIncome', 'Change variable income'); }
    return '<span class="pl-tag assumption">Assumption</span> <b>' + $(B.assessable) + ' a month</b>, all treated as fixed salary' + (v.varStated ? ' (you entered no variable income)' : '') + '. If part of your pay is bonus, commission or allowances, add it as variable income: banks count only 70% of that part, so your income would support a smaller loan. ' + edit('buyers:varIncome', 'Add variable income');
  }
  // the rate the engine tested at: the first income-supported result that exists (T1, or either MOP case)
  function testedRate(ctx) {
    const t = ctx.tdsr || (ctx.both && (ctx.both.msr || ctx.both.tdsr)); return t && typeof t.rate === 'number' ? t.rate : null;
  }
  // rate: the engine's test rate; floor: the rule's minimum (GW_RULES.stressRate), passed in by the caller
  function testedHtml(v, rate, floor) {
    const q = v.ratePct, hi = typeof q === 'number' && typeof floor === 'number' && q / 100 > floor + 1e-9;
    const how = ' Banks test the instalment at the higher of 4% and the rate they quote (MAS Notice 645), and every income limit here is worked out at this rate.';
    if (hi) return '<span class="pl-tag rule">Rule</span> <b>' + pc(rate, 2) + '</b>, your quoted rate, because it is above the ' + pc(floor) + ' minimum.' + how + ' The bank decides the rate it actually charges.';
    return '<span class="pl-tag rule">Rule</span> <b>' + pc(rate, 2) + '</b>, the minimum test rate' + (typeof q === 'number' ? ', because your quoted rate (' + pc(q / 100, 2) + ') is not higher' : '') + '.' + how + ' It is a test only: the bank decides the rate it actually charges.';
  }
  function jointHtml(v) {
    return '<span class="pl-tag bad">Unverified</span> You entered an age of ' + esc(v.age) + ' as the two buyers’ income-weighted average age. MAS weights each borrower’s age by income, but it could not be confirmed whether that means gross income or the income banks count after the 30% reduction on variable income. If the ages differ and either buyer has variable income, the loan limit and the longest tenure at the standard limit can differ. Ask the bank which age it uses; the planner does not treat this joint result as reliable. ' + edit('buyers:age', 'Change age');
  }
  function bankHtml(r, v, ctx) {
    ctx = ctx || {}; const L = r.loan, T1 = ctx.tdsr, h = r.headline, ec = !!ctx.ec, mc = ctx.msrCase || null, ceil = L.capped ? L.ruleLoanMax : L.loanMax;
    const ecLim = ec && T1 && T1.msrCap !== undefined;
    // R1.2.2: "the income counted" only once variable income is entered; otherwise the wording is R1.2.1's, word for word
    const cnt = v.varIncome > 0 ? 'the income counted' : 'income';
    let inc;
    if (!(grossOf(v) > 0)) inc = 'Add your monthly income to compare this loan with the income limit' + (ec ? 's (MSR: 30% of gross income, and TDSR: 55%, both tested at 4%, or your quoted rate if higher)' : mc === 'unknown' ? 's (TDSR: 55% of income, and MSR: 30% if it applies, both tested at 4%, or your quoted rate if higher)' : ' (TDSR: 55% of income, tested at 4%, or your quoted rate if higher)') + '. ' + edit('buyers:income', 'Add income');
    else if (mc === 'unknown') {
      const a = ctx.both && ctx.both.msr, b = ctx.both && ctx.both.tdsr;
      inc = '<span class="pl-tag bad">Incomplete</span> Whether MSR applies to this resale EC is not known (it depends on its minimum occupation period), so there is no single income-supported loan. ' + (a ? 'If it applies, MSR and TDSR together support about <b>' + $(a.maxLoan) + '</b> over ' + a.tenure.years + ' years (' + (a.binding === 'msr' ? 'MSR' : 'TDSR') + ' is the tighter limit). ' : '') + (b ? 'If it does not, TDSR alone supports about <b>' + $(b.maxLoan) + '</b>. ' : '') + 'This timeline assumes the full rule ceiling of ' + $(ceil) + ' until you choose the MOP status. ' + edit('purchase:mop', 'Choose the MOP status');
    } else if (T1) {
      const above = T1.maxLoan >= ceil, bind = T1.binding === 'msr' ? 'MSR' : 'TDSR';
      const how = ecLim
        ? 'An EC within its minimum occupation period (every new EC from the developer) is held to MSR as well as TDSR, both tested at ' + pc(T1.rate) + '. MSR allows <b>' + $(T1.forNewMsr) + '</b> a month (30% of ' + cnt + (v.propertyLoans > 0 ? ', less ' + $(v.propertyLoans) + ' of housing-loan instalments' : ', with no housing-loan instalments entered') + '). TDSR allows <b>' + $(T1.forNewTdsr) + '</b> a month (55% of ' + cnt + ', less ' + (v.debts > 0 || v.propertyLoans > 0 ? $((v.debts || 0) + (v.propertyLoans || 0)) + ' of debts and loans' : 'no debts entered') + '). <b>' + bind + ' is the tighter limit here</b>, so your income supports a loan of about <b>' + $(T1.maxLoan) + '</b> over ' + T1.tenure.years + ' years (' + $(T1.forNew) + ' a month). '
        : 'At 55% of ' + cnt + ', with ' + (v.debts > 0 ? $(v.debts) + ' a month of other debt' : 'no other debt entered') + ', your income supports a loan of about <b>' + $(T1.maxLoan) + '</b> over ' + T1.tenure.years + ' years (' + $(T1.forNew) + ' a month, tested at ' + pc(T1.rate) + '). ';
      inc = how +
        (above ? '<span class="pl-tag ok">Above the ceiling</span> The rule ceiling is what limits you. ' : '<span class="pl-tag warn">Below the ceiling</span> ' + (L.capped ? 'This timeline is sized to that income-supported amount, so the rest has to come from cash or CPF, and the timeline counts it. It is an estimate, not a bank approval. ' : 'The timeline still assumes the full ' + $(ceil) + '. If the bank lends only what your income supports, the rest has to come from cash or CPF: see the two loan scenarios at the top. ')) + edit('buyers:debts', v.debts > 0 ? 'Change debts' : 'Add debts');
    } else inc = 'The income check could not be worked out from these figures. ' + edit('buyers:income', 'Check income');
    const rows = [
      ['Rule ceiling', '<span class="pl-tag rule">Rule</span> <b>' + $(ceil) + '</b>, ' + pc(L.ltv) + ' of the price (MAS Notice 632). ' + esc(limitWhy(r, ctx)) + '. Minimum cash ' + pc(L.minCash) + ' (' + $(L.cashMin) + '), which CPF cannot pay. ' + (L.capped ? 'This timeline is sized to the income-supported loan instead. ' : v.income > 0 && mc !== 'unknown' ? 'The timeline assumes the bank lends all of this. ' : 'The timeline assumes the bank lends all of this, so it is an illustration until the income check is complete. ') + edit('buyers:years', 'Change tenure')],
      ['Your income', '<span class="pl-tag assumption">Indicative</span> ' + inc],
      grossOf(v) > 0 && ctx.B ? ['Income counted', countedHtml(v, ctx.B)] : null,
      grossOf(v) > 0 && testedRate(ctx) !== null ? ['Tested rate', testedHtml(v, testedRate(ctx), ctx.floor)] : null,
      grossOf(v) > 0 && (v.buyers || []).length > 1 ? ['Two borrowers', jointHtml(v)] : null,
      ['Cash and CPF', (h.peak > 0 ? 'Your cash and CPF leave a maximum funding gap of <b>' + $(h.peak) + '</b> (above). ' : 'Your cash and CPF cover every due date. ') + edit('money:cash', 'Change cash and CPF')],
      ['Bank decision', 'The bank also weighs its own valuation, your credit record, employment and policy, and sets the rate. Nothing here is an offer or a promise of financing.'],
    ].filter(Boolean);
    const kindNote = v.uiKind === 'ec' ? (grossOf(v) > 0 ? '' : 'A new EC from the developer is held to MSR (instalments within 30% of gross income) as well as TDSR: add your income to test both. ') : v.uiKind === 'resaleec' ? (mc === 'applies' ? 'This resale EC is within its minimum occupation period, so MSR applies as well as TDSR (MAS Notice 645). The bank decides. ' : mc === 'not' ? 'This resale EC is past its minimum occupation period, so only TDSR is tested; MSR no longer applies (MAS Notice 645). Confirm the status with HDB or the owner. ' : 'MSR applies only while an EC is within its minimum occupation period (MAS Notice 645). That is not known here, so the financing estimate is incomplete. ') : '';
    return '<p class="pl-kick">What limits your borrowing</p><dl class="gw-rows pl-lim">' + rows.map((x) => '<div><dt>' + x[0] + '</dt><dd>' + x[1] + '</dd></div>').join('') + '</dl>' +
      '<p class="gw-fine">' + kindNote + 'Income and debts are optional and never leave this device.</p>' +
      (r.warnings.length ? '<ul class="gw-notes pl-warn">' + r.warnings.map((w) => '<li>' + esc(w.text) + '</li>').join('') + '</ul>' : '') + tenureHtml(r, v, ctx);
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
      '<p class="pl-tp">Illustrative calculations stay available below. They do not mean the household can buy a new EC.</p>' + nc + det + '</div>';
    return '<div class="pl-ec ok">' + kick + tag + '<p class="pl-tp">' + why + ' <b>This is only an income check.</b></p>' + nc + det + '</div>';
  }
  // o: { why: 'noincome' | 'mop', ruleLoan, ltv, a, b } — a loan estimate that is not complete, said plainly beside the result
  function illusHtml(o) {
    if (!o) return '';
    if (o.why === 'mop') return '<div class="pl-illus" role="note"><p class="pl-kick">Financing estimate incomplete</p><p class="pl-tp">Whether MSR applies depends on whether this resale EC is still within its minimum occupation period, which is not known. This timeline assumes the bank lends up to the full rule limit of <b>' + $(o.ruleLoan) + '</b> (' + pc(o.ltv) + ' of the price). On your income the loan would be about ' + (o.a ? '<b>' + $(o.a.maxLoan) + '</b> if MSR applies (MSR with TDSR)' : 'not worked out if MSR applies') + (o.b ? ', or about <b>' + $(o.b.maxLoan) + '</b> if it does not (TDSR only)' : '') + '. Neither is a bank approval.</p><div class="pl-ec-l">' + edit('purchase:mop', 'Choose the MOP status') + '</div></div>';
    return '<div class="pl-illus" role="note"><p class="pl-kick">Illustrative loan</p><p class="pl-tp">This timeline assumes the bank lends up to the full rule limit of <b>' + $(o.ruleLoan) + '</b> (' + pc(o.ltv) + ' of the price). It does not know what your income supports. Add your income to see the income-supported loan.</p><div class="pl-ec-l">' + edit('buyers:income', 'Add your income') + '</div></div>';
  }
  // S: { rule, cap (both timelines), view: 'rule' | 'income', limit: 'MSR' | 'TDSR' }. Shown whenever income supports less than the loan the rule ceiling allows;
  // the income-supported timeline is the one drawn by default, the rule-ceiling one stays a click away.
  function loanScenarioHtml(S) {
    const rr = S.rule, cc = S.cap, inc = S.view === 'income', ceil = rr.loan.ruleLoanMax, sup = cc.loan.loanMax;
    const gap = (r) => (r.headline.peak > 0 ? 'maximum funding gap <b>' + $(r.headline.peak) + '</b>' : 'every due date covered');
    const opt = (cls, lab, amt, r, here) => '<div class="pl-opt' + cls + '"><span class="pl-lab">' + lab + (here ? ' · shown below' : '') + '</span><b>' + amt + '</b><small>' + gap(r) + '</small></div>';
    const base = S.counted ? 'the income counted' : 'gross income', lim = S.limit === 'MSR' ? 'MSR (30% of ' + base + ')' : 'TDSR (55% of ' + base + ')';
    return '<div class="pl-loanwarn" role="note"><p class="pl-kick">Which loan this timeline uses</p>' +
      '<p class="pl-lw-h">' + (inc ? 'This timeline uses an income-supported loan of about ' + $(sup) + ', not the rule ceiling of ' + $(ceil) + '.' : 'You are viewing the rule-ceiling loan of ' + $(ceil) + '. Your income supports about ' + $(sup) + '.') + '</p>' +
      '<div class="pl-opts">' + opt(inc ? ' cur' : '', 'Income-supported loan', 'about ' + $(sup), cc, inc) + opt(!inc ? ' cur' : '', 'Rule-ceiling loan', $(ceil), rr, !inc) + '</div>' +
      '<p class="gw-fine"><b>Binding limit: ' + esc(lim) + '.</b> On the income, age, tenure and debts you entered it caps your loan at about ' + $(sup) + ', below the ' + pc(rr.loan.ltv) + ' loan limit of ' + $(ceil) + ' (MAS Notice 632). ' + (inc ? 'The other ' + $(ceil - sup) + ' that the rule would allow has to come from your cash or CPF, and this timeline already counts it.' : 'If the bank lends only what your income supports, the other ' + $(ceil - sup) + ' has to come from your cash or CPF.') + ' Both are estimates, not a bank approval or offer: the bank decides what it lends.</p>' +
      '<button type="button" class="gw-btn sec" data-loan-view="' + (inc ? 'rule' : 'income') + '">' + (inc ? 'Compare with the rule-ceiling loan timeline' : 'Show the income-supported loan timeline') + '</button></div>';
  }
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
      ['buyers', 'Buyers and loan', 'age ' + (raw.age == null ? 'not entered' : raw.age) + ' · ' + (raw.years == null ? 'tenure not entered' : raw.years + ' years') + (raw.ratePct == null ? '' : ' at ' + raw.ratePct + '%')], ['sale', 'Home you are selling', raw.order ? ORDER_T[raw.order] : 'not chosen']];
    return '<p class="pl-kick">Your entries</p><div class="pl-arows">' + rows.map((x) => '<button type="button" class="pl-arow" data-open="' + x[0] + '"><span><b>' + x[1] + '</b><em>' + esc(x[2]) + '</em></span><i aria-hidden="true">Edit</i></button>').join('') + '</div>';
  }
  function summaryText(r, v, scn) {
    const h = r.headline;
    return ['Payment timeline (Groundwork): ' + $(r.price) + ' ' + kindText(r, v) + ', ' + ORDER_T[r.order] + ', option ' + day(r.otp) + '.',
      h.peak > 0 ? 'Maximum funding gap ' + $(h.peak) + ' (the largest cumulative amount not covered by available funds, including earlier unpaid amounts, not an extra amount) — needed in hand by ' + day(h.peakAt) + ' (' + h.peakCause + '); first payment not met in full: ' + day(h.firstGap) + (firstMiss(r).label ? ', ' + firstMiss(r).label + (firstMiss(r).amount > 0 ? ' (' + $(firstMiss(r).amount) + ' uncovered)' : '') : '') + '; ' + (h.coveredOn ? 'later money closes the gap only in ' + mon(h.coveredOn) + ' (' + h.coveredBy + ')' : 'nothing closes the gap within the horizon') + '.' : 'Every payment covered on its due date at the earliest dates.',
      'Loan ' + (r.loan.capped ? 'sized to what the entered income supports (figure not included; rule limit ' + pc(r.loan.ltv) + ')' : pc(r.loan.ltv)) + ' over ' + r.loan.years + ' years at ' + pc(r.loan.ratePct / 100, 2) + ' (' + r.loan.loans + ' housing loan' + (r.loan.loans === 1 ? '' : 's') + ' counted); instalment ' + $(r.instalment.final) + '/mo once fully drawn.',
      (v.buyers || []).length > 1 && r.loan.capped ? 'Two buyers: the income-weighted average age basis is not confirmed, so this joint-borrower loan is unverified.' : '',
      scn && scn.cap && scn.view === 'rule' ? 'Note: the income entered supports less than the loan assumed here; the planner shows both cases.' : '',
      scn && scn.cap && scn.view === 'income' ? 'Note: this timeline uses the loan the income entered supports, not the full rule limit; the planner also shows the rule-limit case.' : '',
      scn && scn.illus && scn.illus.length ? scn.illus.map((x) => ({ 'ec-income': 'Illustrative only: the household income entered is above the new-EC income ceiling, so this is not a purchase the household can make as a new EC buyer.', 'ec-unknown': 'The new-EC income condition has not been established; these figures are illustrative.', noincome: 'Illustrative loan: income not entered, so the full rule limit is assumed.', mop: 'Financing estimate incomplete: whether MSR applies to this resale EC is not known.' }[x] || '')).filter(Boolean).join(' ') : '',
      (r.duty.absd ? 'ABSD ' + $(r.duty.absd) + ' up front' + (v.refund && v.refund.assume ? ', refund assumed ' + (v.refund.monthsAfterSale || 2) + ' months after the sale (never guaranteed)' : '') + '. ' : '') + 'Final 15% shown as one provisional payment. Estimates from my own assumptions, not advice. tools.kentanthepropertyguy.com/tools/payment-planner/'].filter(Boolean).join('\n');
  }

  /* ---------------- first-load and incomplete states ---------------- */
  const RESN = { SC: 'Singapore Citizen', PR: 'Permanent Resident', FR: 'Foreigner' }, OWNN = ['owns no home', 'owns one home', 'owns two or more homes'];
  const OWN_CHOICE = [['buy', 'Buy first, then sell'], ['sell', 'Sell first, then buy'], ['none', 'Nothing to sell']];
  // need: [{ id, label, hint, done, shown }]; i: the form read as engine input; raw: only what the buyer actually entered
  function startHtml(need, i, raw) {
    const todo = need.filter((n) => !n.done).length, total = need.length;
    const W = ['', 'one detail', 'two details', 'three details', 'four details', 'five details', 'six details', 'seven details'];
    const head = todo === total ? 'Add ' + W[total] + ' to see when each payment is due' : todo === 1 ? 'One more detail to go' : todo + ' more details to go';
    const tick = (n, k) => '<i class="pl-tick" aria-hidden="true">' + (n.done ? '✓' : (k + 1)) + '</i>';
    const rows = need.map((n, k) => {
      if (n.id === 'order') return '<li class="pl-q' + (n.done ? ' done' : '') + '" role="group" aria-labelledby="pl-q-o"><div class="pl-qh">' + tick(n, k) + '<b id="pl-q-o">Do you have a home to sell?</b>' + (n.done ? '' : '<em>Choose one</em>') + '</div><div class="pl-own-b">' + OWN_CHOICE.map((o) => '<button type="button" data-own="' + o[0] + '" aria-pressed="' + (i.order === o[0]) + '">' + o[1] + '</button>').join('') + '</div></li>';
      return '<li><button type="button" class="pl-n' + (n.done ? ' done' : '') + '" data-need="' + n.id + '">' + tick(n, k) + '<span><b>' + esc(n.label) + '</b><em>' + esc(n.done ? n.shown : n.hint) + '</em></span><u>' + (n.done ? 'Change' : 'Add') + '</u></button></li>';
    }).join('');
    const b = (i.buyers || []).map((x, k) => (i.buyers.length > 1 ? 'buyer ' + (k + 1) + ' ' : 'the buyer ') + 'is a ' + (RESN[x.res] || x.res) + ' who ' + (OWNN[x.owned] || OWNN[2])).join('; ');
    const selling = i.order === 'buy' || i.order === 'sell';
    const assumed = 'Starting values you can change: option date ' + day(raw.otp || '') + '; ' + b + '; loan at ' + (raw.ratePct == null ? 4 : raw.ratePct) + '% a year over ' + (raw.years == null ? 30 : raw.years) + ' years' + (selling ? '; your sale completes ' + (raw.saleDate ? day(raw.saleDate) : (raw.saleMonth == null ? 5 : raw.saleMonth) + ' months after the option') + '; the loan on the home you sell still counts (the safer assumption)' : '') + '.';
    return '<div class="pl-start"><p class="pl-kick">Start here</p><h2 class="pl-start-h">' + head + '</h2>' +
      '<p class="pl-start-p">See each payment on the day it’s due, and whether your cash, CPF and loan cover it.</p>' +
      '<ol class="pl-need">' + rows + '</ol>' +
      '<p class="gw-fine pl-assumed">' + esc(assumed) + ' <button type="button" class="gw-link" data-open-buyers>Review</button></p>' +
      '<p class="gw-fine">Nothing is worked out until these are entered, so no figure is guessed for you. Everything stays on this device.</p>' + howHtml() + '</div>';
  }
  function howHtml() {
    return '<details class="pl-how"><summary>How to read this planner</summary><dl>' +
      '<dt>When to use it</dt><dd>When you are buying a new launch, an EC or a completed private home, with or without selling your current home, and want to know if the money is there on each due date.</dd>' +
      '<dt>What you need</dt><dd>The price, the borrower’s age, the cash and CPF OA you can use and, if you are selling, what you expect to receive. Other details start with a value you can change.</dd>' +
      '<dt>Buy first or sell first</dt><dd>Buy first: you keep your current home until it sells, so Additional Buyer’s Stamp Duty (ABSD) is paid up front and may be refunded later if IRAS’s conditions are met. IRAS decides. Sell first: no ABSD up front, but you may need to rent in between. The comparison shows both for the same purchase.</dd>' +
      '<dt>When money is available</dt><dd>Your cash is there from the option date. Savings, sale money and an ABSD refund count only from the date they arrive. The bank loan covers its share of later payments, after your own cash and CPF part.</dd>' +
      '<dt>What a shortfall means</dt><dd>The first payment you can’t meet is the first due date your money runs out. The maximum funding gap is the largest total your funds fall short by at any one time. It includes the earlier unpaid amounts, so it is not an extra amount. Money that arrives later cannot pay an earlier payment: what matters is whether enough is in hand on that day.</dd>' +
      '<dt>How to improve it</dt><dd>Bring money forward, change the order of moves, or look at a lower price, then check the figure again.</dd></dl></details>';
  }

  /* ---------------- browser ---------------- */
  function mount() {
    if (typeof document === 'undefined') return;
    const box = document.querySelector('[data-plan]'); if (!box) return;
    const C = root.GW_CALC, T = root.GW_TIMELINE, KPT = root.KPT || { track: function () {} };
    if (!C || !T) return;
    const track = (n, p) => { try { KPT.track(n, Object.assign({ tool_name: 'calc-payment-planner' }, p || {})); } catch (e) { /* analytics unavailable */ } };
    const $$ = (s, el) => [].slice.call((el || box).querySelectorAll(s));
    const q = (s) => box.querySelector(s);
    const out = { result: q('[data-result]'), assume: q('[data-assume]'), compare: q('[data-compare]'), timeline: q('[data-timeline]'), chart: q('[data-chart]'), mortgage: q('[data-mortgage]'), bank: q('[data-bank]'), strip: q('[data-strip]'), note: q('[data-acts-note]') };
    const SHARE = 'gw.fin.v1', OWN = 'gw.plan.v1';
    const store = (k) => ({ get() { try { return JSON.parse(root.sessionStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }, set(o) { try { root.sessionStorage.setItem(k, JSON.stringify(o)); } catch (e) { /* storage blocked */ } }, del() { try { root.sessionStorage.removeItem(k); } catch (e) { /* ignore */ } } });
    const shared = store(SHARE), own = store(OWN);
    const parseMoney = (s) => { const p = C.parseMoney(s); return p.value === undefined ? null : p.value; };
    const fmtMoney = (v) => (v === null ? '' : v.toLocaleString('en-US', { maximumFractionDigits: 2 }));
    const today = new Date(); const todayIso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $$('input[data-today]').forEach((x) => { x.value = todayIso; });
    const chipVal = (g) => { const b = g.querySelector('[aria-pressed="true"]'); return b ? b.dataset.v : null; };
    const setChip = (g, v) => { $$('button', g).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); };
    $$('[data-t="chip"]').forEach((g) => $$('button', g).forEach((b) => b.addEventListener('click', () => { setChip(g, b.dataset.v); if (g.dataset.k === 'order') syncOrder(b.dataset.v); changed(g); })));
    const rowOf = (k) => box.querySelector('[data-row="' + k + '"]');
    const showRow = (k, on) => { const r = rowOf(k); if (!r) return; r.hidden = !on; const add = box.querySelector('[data-add="' + k + '"]'); if (add) add.hidden = on; if (!on) { const s = shared.get(); Object.keys(s).forEach((key) => { if (key.indexOf(k + '.') === 0) delete s[key]; }); shared.set(s); } };
    $$('[data-add]').forEach((b) => b.addEventListener('click', () => { showRow(b.dataset.add, true); recalc(); }));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', () => { showRow(b.dataset.remove, false); recalc(); }));
    const live = (el) => { for (let p = el; p && p !== box; p = p.parentElement) if (p.hidden) return false; return true; };
    const msrFlag = () => { const kg = box.querySelector('[data-k="kind"]'), mg = box.querySelector('[data-k="mop"]'); const mc = msrCase(kg ? chipVal(kg) : null, mg ? chipVal(mg) : null); return mc === 'applies' || mc === 'unknown' ? '1' : '0'; };
    const applyWhen = () => { $$('[data-when]').forEach((el) => { const [k, vs] = el.dataset.when.split(':'); const g = box.querySelector('[data-k="' + k + '"]'); const v = k === 'msr' ? msrFlag() : g ? (g.dataset.t === 'chip' ? chipVal(g) : g.value) : null; el.hidden = vs.split(',').indexOf(v) < 0; }); };
    // the order switch above the result and the chips in the sale sheet are one control
    const orderGroup = box.querySelector('[data-k="order"]'), orderSwitch = q('[data-order-switch]'), ackGroup = box.querySelector('[data-k="ecIllus"]');
    function syncOrder(v) { setChip(orderGroup, v); $$('button', orderSwitch).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.order === v))); orderSwitch.hidden = v === 'none'; }
    $$('button', orderSwitch).forEach((b) => b.addEventListener('click', () => { syncOrder(b.dataset.order); track('planner_order', { order: b.dataset.order }); changed(orderGroup); }));
    // ---- read the form ----
    let inputErrs = [], raw = {}, errMap = {}, errShort = {}, pendingUnder = false, waitBlur = false;
    const fieldName = (el) => { const f = el.closest('.gw-fld'); const sp = f && f.querySelector('span'); return sp ? sp.textContent.replace(/\s*optional\s*$/, '').trim() : ''; };
    // the existing limits (GW_CALC.LIMITS), said specifically and beside the field. `under`: still shorter than the minimum, so more digits may fix it.
    const MONEY_CHECKED = ['price', 'cash', 'cpf', 'saveMo', 'cpfMo', 'debts', 'propertyLoans'];
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
      const i = { kind: v.kind === 'resaleec' ? 'completed' : v.kind, uiKind: v.kind, tender: v.tender || 'unsure', mop: v.mop || 'unsure', propertyLoans: v.propertyLoans || 0, price: v.price, otp: v.otp, buyers, age: v.age, ratePct: v.ratePct, years: v.years, loansOther: +(v.loansOther || 0), cash: v.cash || 0, cpf: v.cpf || 0, saveMo: v.saveMo || 0, cpfMo: v.cpfMo || 0, payInstalmentFromCpf: v.payInstalmentFromCpf !== false, order: v.order || '',
        sale: { month: v.saleDate ? undefined : v.saleMonth, date: v.saleDate || undefined, cash: v.saleCash || 0, cpf: v.saleCpf || 0, removesOwnership: v.removesOwnership !== false }, flatLoan: v.flatLoan || 'outstanding',
        refund: { assume: !!v.refundAssume, monthsAfterSale: v.refundMonths || 2 }, rent: { monthly: v.rent || 0 }, dates: { mode: v.datesMode || 'grouped', top: v.top || undefined, csc: v.csc || undefined, completion: v.completion || undefined }, income: v.income || 0, varIncome: v.varIncome || 0, varStated: v.varIncome !== undefined && v.varIncome !== null, gross: (v.income || 0) + (v.varIncome || 0), debts: v.debts || 0 };
      return i;
    }
    // what the planner still needs before it will show a result: nothing is assumed for these (0 is a valid, explicit answer)
    const has = (k) => raw[k] !== undefined && raw[k] !== null;
    function needList(i) {
      const L = [{ id: 'order', label: 'Do you have a home to sell?', hint: '', done: !!i.order, shown: i.order ? ORDER_T[i.order] : '' }, { id: 'price', label: 'Purchase price', hint: 'What you will pay for the home.', done: has('price'), shown: has('price') ? $(raw.price) : '' }];
      if (!has('otp')) L.push({ id: 'otp', label: 'Option date', hint: 'The day you pay the booking or option fee.', done: false, shown: '' });
      L.push({ id: 'age', label: 'Borrower’s age', hint: 'Sets how much the bank can lend. Two borrowers: use the average.', done: has('age'), shown: has('age') ? raw.age + ' years' : '' },
        { id: 'cash', label: 'Cash you have now', hint: 'Savings you can use. Type 0 if none.', done: has('cash'), shown: has('cash') ? $(raw.cash) : '' },
        { id: 'cpf', label: 'CPF OA you can use', hint: 'Type 0 if none.', done: has('cpf'), shown: has('cpf') ? $(raw.cpf) : '' });
      if (i.order === 'buy' || i.order === 'sell') L.push({ id: 'saleCash', label: 'Cash from selling your home', hint: 'After the loan and CPF refund. Or go back and choose “Nothing to sell”.', done: has('saleCash'), shown: has('saleCash') ? $(raw.saleCash) : '' });
      return L;
    }
    // ---- compute ----
    let last = null, startedT = false, doneT = false, issues = [], undoTenure = null, dirty = false;
    const RL = root.GW_RULES.bankLtv;
    let viewPref = null; // null (the default view) | 'rule' | 'income': the loan the buyer chose to draw the timeline with. By default it is the income-supported loan whenever that is lower than the rule ceiling.
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
    function sized(inp) {
      const rule = run(inp); if (!rule.r.ok) return { rule: rule, cap: null, sp: null, spRaw: null };
      const raw = supportRes(inp, rule.r.loan.loans, inp.years), sp = good(raw);
      let cap = null;
      if (sp && sp.maxLoan < rule.r.loan.loanMax - 0.5) { const o2 = run(Object.assign({}, inp, { loanCap: sp.maxLoan })); if (o2.r && o2.r.ok && o2.r.loan.capped) cap = o2; }
      return { rule: rule, cap: cap, sp: sp, spRaw: raw };
    }
    // the longest tenure that keeps the standard limit at this age: the engine's own figure (GW_CALC.progressive → stdYears)
    const stdYearsFor = (age) => { try { const p = C.progressive({ price: 1000000, age: age, kind: 'private', loans: 0 }); return p.ok ? p.stdYears : null; } catch (e) { return null; } };
    // where the engine names a field, the planner's input for it
    const ENGKEY = { price: 'price', cash: 'cash', cpf: 'cpf', saveMo: 'saveMo', cpfMo: 'cpfMo', age: 'age', ratePct: 'ratePct', years: 'years', otp: 'otp', sale: 'saleMonth', 'sale.cash': 'saleCash', 'sale.cpf': 'saleCpf', rent: 'rent', income: 'income', varIncome: 'varIncome' };
    const fieldFor = (key) => (key ? box.querySelector('input[data-k="' + key.replace(/"/g, '') + '"]') : null);
    const sheetOf = (key) => { const f = fieldFor(key), s = f && f.closest('[data-sheet]'); return s ? s.dataset.sheet : 'purchase'; };
    function paintErrors() {
      $$('input[data-k]').forEach((el) => {
        const fld = el.closest('.gw-fld'), wrap = el.closest('.gw-in'); if (!fld || !wrap || el.type === 'checkbox') return;
        const k = el.dataset.k, msg = errMap[k]; let m = fld.querySelector('.pl-err');
        if (msg) { if (!m) { m = document.createElement('small'); m.className = 'pl-err'; m.id = 'pl-err-' + k.replace(/\W/g, '-'); m.setAttribute('role', 'alert'); wrap.insertAdjacentElement('afterend', m); } if (m.textContent !== msg) { m.textContent = msg; if (openId && el === document.activeElement) { try { m.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } } } el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', m.id); wrap.classList.add('pl-invalid'); }
        else { if (m) m.remove(); el.setAttribute('aria-invalid', 'false'); el.removeAttribute('aria-describedby'); wrap.classList.remove('pl-invalid'); }
      });
      // the sheet footer says which entry needs fixing, in plain words; with several it gives the number and goes to the first
      const keys = Object.keys(errMap).filter((k) => fieldFor(k));
      $$('[data-sheet]').forEach((sh) => {
        const mine = keys.filter((k) => sh.contains(fieldFor(k))), el = sh.querySelector('[data-sheet-note]'); if (!el) return;
        const msg = (k) => errShort[k] || errMap[k] || '', lab = (k) => fieldName(fieldFor(k)) || 'the first entry';
        let h = '';
        if (mine.length === 1) h = esc(msg(mine[0]));
        else if (mine.length > 1) h = mine.length + ' entries need fixing. <button type="button" class="gw-link pl-goto" data-goto="' + esc(mine[0]) + '">Go to ' + esc(lab(mine[0])) + '</button>';
        else if (keys.length) h = (keys.length === 1 ? 'Another entry needs fixing. ' : keys.length + ' entries elsewhere need fixing. ') + '<button type="button" class="gw-link pl-goto" data-goto="' + esc(keys[0]) + '">Go to ' + esc(lab(keys[0])) + '</button>';
        if (el.innerHTML !== h) el.innerHTML = h;
      });
    }
    function paintTenureNote(vals) {
      const el = q('[data-tenure-note]'); if (!el) return;
      const cap = RL.standardTenure.private, max = RL.maxTenure.private, age = vals.age, L = C.LIMITS.age;
      let t = 'Banks can lend for up to ' + max + ' years. Over ' + cap + ' years, or past age 65, the lower loan limit applies. Enter your age to see where that line falls.';
      if (typeof age === 'number' && age >= L.min && age <= L.max) { const std = stdYearsFor(age); if (std !== null) t = std >= 1 ? 'At age ' + age + ', up to ' + std + ' years keeps the standard loan limit. Longer, up to ' + max + ' years, is allowed but takes the lower limit.' : 'At age ' + age + ', any loan runs past age 65, so the lower limit applies. Up to ' + max + ' years is allowed.'; }
      if (el.textContent !== t) el.textContent = t;
    }
    box.addEventListener('focusout', (e) => { if (waitBlur && e.target.matches && e.target.matches('input[data-k]')) setTimeout(recalc, 0); });
    function recalc() {
      applyWhen();
      const i = values();
      if (pendingUnder) { waitBlur = true; return; } // a number is still being typed: keep the screen steady until it is complete or the field is left
      waitBlur = false; dirty = false;
      let r, c = null, ctx = null, sc = null, view = 'rule';
      const need = needList(i); const todo = need.filter((n) => !n.done);
      issues = inputErrs.slice();
      // 1. the income condition comes first: before any loan or payment figure, for a new EC (or the MOP question, for a resale EC)
      const mc = msrCase(i.uiKind, i.mop);
      const ecOut = i.uiKind === 'ec' ? ecIncomeCheck(i.gross, i.tender, ECR).outcome : null;
      let ack = !!(ackGroup && chipVal(ackGroup) === 'yes');
      if (ack && ecOut !== 'exceeds') { setChip(ackGroup, ''); ack = false; save(); } // the choice to see illustrative figures belongs to this outcome only
      const gate = ecGate(i, ECR, ack);
      const top = ecHtml(i, ECR, { ack: ack, incomeBad: !!(errMap.income || errMap.varIncome) });
      if (gate) r = { ok: false, missing: [], gated: true };
      else if (issues.length) r = { ok: false, missing: [], invalid: issues };
      else if (todo.length) r = { ok: false, missing: [], incomplete: true };
      else {
        try {
          sc = sized(i); view = viewPref || (sc.cap ? 'income' : 'rule'); if (!sc.cap) view = 'rule';
          const o = view === 'income' && sc.cap ? sc.cap : sc.rule; r = o.r; c = o.c;
        } catch (e) { r = { ok: false, missing: [], invalid: [{ field: '', text: 'The planner could not work this out. Please check the figures.' }] }; }
      }
      if (!r.ok && !r.incomplete && !r.gated && !issues.length && r.invalid) r.invalid.forEach((x) => { const key = ENGKEY[x.field] || '', f = fieldFor(key); issues.push({ field: key, key: key, label: f ? fieldName(f) : '', bare: x.text, text: x.text }); if (key && !errMap[key]) errMap[key] = x.text; });
      if (r.ok) {
        const t0 = sc.spRaw;
        if (t0 && !t0.ok && t0.invalid && t0.invalid.length) errMap.income = t0.invalid[0].text;
        if (undoTenure && +i.years !== undoTenure.to) undoTenure = null;
        ctx = { floor: root.GW_RULES.stressRate, B: i.gross > 0 ? C.borrowers([{ age: i.age, fixed: i.income, variable: i.varIncome }]) : null, age: i.age, cap: RL.standardTenure.private, max: RL.maxTenure.private, std: stdYearsFor(i.age), tdsr: sc.sp, ec: mc === 'applies', msrCase: mc, both: null, alt: null, undo: undoTenure };
        if (mc === 'unknown' && i.gross > 0) ctx.both = supportBoth(i, sc.rule.r.loan.loans, i.years);
        if (r.loan.lower && (r.loan.lowerWhy === 'age' || r.loan.lowerWhy === 'tenure') && ctx.std >= 1 && ctx.std < r.loan.years) {
          try { const a = sized(Object.assign({}, i, { years: ctx.std })); const ao = view === 'income' && a.cap ? a.cap : a.rule; if (ao.r && ao.r.ok) ctx.alt = { years: ctx.std, r: ao.r, tdsr: a.sp }; } catch (e) { ctx.alt = null; }
        }
        // 2. which loan the timeline uses: the income-supported one by default, and a plain label whenever the loan is only an illustration
        const ill = [];
        if (ecOut === 'exceeds' && ack) ill.push('ec-income'); else if (ecOut === 'unknown') ill.push('ec-unknown');
        if (mc === 'unknown' && i.gross > 0) ill.push('mop'); else if (!(i.gross > 0)) ill.push('noincome');
        const RR = sc.rule.r.loan, why = ill.indexOf('mop') >= 0 ? 'mop' : ill.indexOf('noincome') >= 0 ? 'noincome' : '';
        const note = why ? illusHtml({ why: why, ruleLoan: RR.loanMax, ltv: RR.ltv, a: ctx.both && ctx.both.msr, b: ctx.both && ctx.both.tdsr }) : '';
        const banner = sc.cap ? loanScenarioHtml({ rule: sc.rule.r, cap: sc.cap.r, view: view, counted: i.varIncome > 0, limit: sc.sp.binding === 'msr' ? 'MSR' : 'TDSR' }) : '';
        out.result.innerHTML = top + note + banner + resultHtml(r) + howHtml(); out.assume.innerHTML = assumeHtml(r, i); out.compare.innerHTML = c ? compareHtml(c) : ''; out.timeline.innerHTML = timelineHtml(r); out.chart.innerHTML = chartHtml(r); out.mortgage.innerHTML = mortgageHtml(r, ctx.tdsr, ctx.ec); out.bank.innerHTML = bankHtml(r, i, ctx);
        box.classList.add('has-result'); last = { i, r, c, scn: { view: view, cap: !!sc.cap, illus: ill } };
        if (!doneT) { doneT = true; track('tool_completed', {}); }
        const el = q('[data-refund-elig]'); if (el) el.textContent = r.duty.absd > 0 ? (r.duty.notes.some((n) => n.id === 'refund' || n.id === 'single-senior') ? 'IRAS’s refund conditions may apply to this profile (sell within 6 months of the purchase, or of TOP/CSC for an uncompleted home; bought jointly in two names; no other home acquired). IRAS decides.' : 'This buyer profile does not match IRAS’s refund conditions; a refund assumed here would be shown as not eligible.') : 'No ABSD on this purchase, so there is nothing to refund.';
      } else {
        last = null; box.classList.remove('has-result'); ['assume', 'compare', 'timeline', 'chart', 'mortgage', 'bank'].forEach((k) => { out[k].innerHTML = ''; });
        if (r.gated) { out.result.innerHTML = top; out.assume.innerHTML = entriesHtml(raw); }
        else if (todo.length) out.result.innerHTML = top + (issues.length ? fixHtml(issues) : '') + startHtml(need, i, raw);
        else if (issues.length) { out.result.innerHTML = top + fixHtml(issues); out.assume.innerHTML = entriesHtml(raw); }
        else out.result.innerHTML = top + '<p class="gw-fine">Enter ' + (r.missing || []).map((m) => ({ price: 'the price', age: 'the borrower’s age', buyers: 'the buyer details', otp: 'the option date' }[m] || m)).join(', ').replace(/, ([^,]*)$/, ' and $1') + ' to see the result.</p>';
      }
      paintErrors(); paintTenureNote(raw);
      stripUpdate(); wa();
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
    // ---- money fields: commas appear as you type. Only the display changes: the caret stays with its digits and the number is the same one
    //      C.parseMoney reads. Letters (1.2m, 800k), a minus or a second dot are left exactly as typed so the existing validation speaks. ----
    const tidy = (t) => String(t).replace(/[\s ]/g, '').replace(/^(sgd|s\$)/i, '').replace(/\$/g, '');
    const group = (n) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    function liveMoney(t) { // t: tidied text; returns the display text, or null to leave the field as typed
      if (!/^[\d,]*\.?\d*$/.test(t)) return null;
      const dot = t.indexOf('.'); let n = (dot < 0 ? t : t.slice(0, dot)).replace(/,/g, '');
      n = n.replace(/^0+(?=\d)/, ''); if (dot >= 0 && n === '') n = '0';
      return group(n) + (dot >= 0 ? '.' + t.slice(dot + 1) : '');
    }
    $$('input[data-t="money"]').forEach((x) => {
      let prev = x.value;
      x.addEventListener('focus', () => { prev = x.value; });
      x.addEventListener('input', (e) => {
        const raw = x.value; let txt = raw, over = false, caret = x.selectionStart == null ? raw.length : x.selectionStart; const type = (e && e.inputType) || '';
        // Backspace or Delete over a comma only moves the caret past it (the value is unchanged); the next key deletes the digit
        if ((type === 'deleteContentBackward' || type === 'deleteContentForward') && raw.length === prev.length - 1 && prev.charAt(caret) === ',') { txt = prev; if (type === 'deleteContentForward') { caret += 1; over = true; } }
        const out = liveMoney(tidy(txt));
        if (out === null) { prev = x.value; return; }
        let sig = (tidy(txt.slice(0, caret)).match(/[\d.]/g) || []).length; if (/^\./.test(tidy(txt)) && out.indexOf('0.') === 0) sig += 1;
        if (out !== raw) {
          x.value = out;
          if (root.document.activeElement === x && x.setSelectionRange) { let n = 0, pos = sig ? out.length : 0; for (let k = 0; sig && k < out.length; k++) { if (/[\d.]/.test(out.charAt(k)) && ++n === sig) { pos = k + 1; break; } } if (over && out.charAt(pos) === ',') pos += 1; try { x.setSelectionRange(pos, pos); } catch (er) { /* ignore */ } }
        }
        prev = x.value;
      });
    });
    $$('input').forEach((x) => { x.addEventListener('input', () => changed(x)); x.addEventListener('change', () => changed(x)); });
    $$('input[data-t="money"]').forEach((x) => x.addEventListener('blur', () => { const v = parseMoney(x.value.replace(/\.$/, '')); if (v !== null && v <= C.LIMITS.money.max) x.value = fmtMoney(v); }));
    $$('input[data-t="money"],input[data-t="num"]').forEach((x) => x.addEventListener('focus', () => { if (x.matches(':focus-visible')) try { x.select(); } catch (e) { /* ignore */ } }));
    // ---- restore: shared details from the other calculators, then the planner's own ----
    const sv = shared.get();
    $$('[data-share]').forEach((x) => { const val = sv[x.dataset.share]; if (val === undefined || val === null || val === '') return; const m = /^buyers\.1\./.exec(x.dataset.share); if (m) showRow('buyers.1', true); if (x.dataset.t === 'chip') setChip(x, val); else x.value = x.dataset.t === 'money' && parseMoney(val) !== null ? fmtMoney(parseMoney(val)) : val; });
    if (sv.housingLoans === '1' || sv.housingLoans === '2') { /* a counted loan elsewhere: keep the safe default "still outstanding" */ }
    const ov = own.get();
    $$('[data-k]').forEach((x) => { if (x.dataset.share) return; const val = ov[x.dataset.k]; if (val === undefined) return; if (x.dataset.t === 'chip') setChip(x, val); else if (x.dataset.t === 'check') x.checked = val === '1'; else x.value = x.dataset.t === 'money' && parseMoney(val) !== null ? fmtMoney(parseMoney(val)) : val; });
    syncOrder(chipVal(orderGroup) || '');
    // ---- sheets (phones) ----
    const backdrop = q('[data-backdrop]'); let openId = null, opener = null, openerSel = '';
    const mq = root.matchMedia ? root.matchMedia('(max-width: 899px)') : { matches: false };
    const flash = (f) => { const w = f && f.closest('.gw-in'); if (!w) return; w.classList.add('pl-flash'); setTimeout(() => w.classList.remove('pl-flash'), 1800); };
    const selOf = (el) => (!el || !el.dataset ? '' : el.dataset.open ? '[data-open="' + el.dataset.open + '"]' : el.dataset.need ? '[data-need="' + el.dataset.need + '"]' : el.dataset.fix !== undefined ? '[data-fix="' + el.dataset.fix + '"]' : el.dataset.edit ? '[data-edit="' + el.dataset.edit + '"]' : el.hasAttribute('data-strip-go') ? '[data-strip-go]' : '');
    // on a phone the sheet sits above the on-screen keyboard: the visual viewport tells us how much of the layout viewport the keyboard covers
    function fitSheet() {
      if (!openId) return; const sh = box.querySelector('[data-sheet="' + openId + '"]'), vv = root.visualViewport; if (!sh) return;
      if (!vv || !mq.matches) { sh.style.bottom = ''; sh.style.maxHeight = ''; return; }
      const kb = Math.max(0, Math.round(root.innerHeight - vv.height - vv.offsetTop));
      sh.style.bottom = kb + 'px'; sh.style.maxHeight = Math.max(240, Math.floor(vv.height * (kb > 80 ? 0.98 : 0.85))) + 'px';
      const a = document.activeElement; if (a && sh.contains(a) && a.matches && a.matches('input') && a.scrollIntoView) { try { a.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
    }
    function openSheet(id, from, key) {
      const s = box.querySelector('[data-sheet="' + id + '"]'); if (!s) return;
      const target = fieldFor(key);
      if (!mq.matches) { (target || s).scrollIntoView({ behavior: 'smooth', block: target ? 'center' : 'start' }); const f = target || s.querySelector('input,button'); if (f) f.focus({ preventScroll: true }); flash(target); return; }
      closeSheet(); opener = from || document.activeElement; openerSel = selOf(opener); openId = id; s.classList.add('open'); backdrop.hidden = false; document.body.classList.add('pl-sheet-open'); fitSheet();
      const f = target || s.querySelector('input:not([hidden]),button'); if (f) { f.focus({ preventScroll: true }); if (target) setTimeout(() => { try { target.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ } flash(target); }, 60); } track('planner_sheet', { sheet: id }); stripUpdate();
    }
    // closing never blocks: the values stay where they are and the result is brought up to date at once
    function closeSheet() {
      if (!openId) return; const s = box.querySelector('[data-sheet="' + openId + '"]'); s.classList.remove('open'); s.style.bottom = ''; s.style.maxHeight = ''; backdrop.hidden = true; document.body.classList.remove('pl-sheet-open');
      const from = opener, sel = openerSel; openId = null; opener = null; openerSel = '';
      if (dirty) { clearTimeout(tmr); recalc(); }
      let t = from && from.isConnected ? from : (sel ? q(sel) : null); if (!t) t = q('[data-strip-go]');
      if (t && t.focus) t.focus({ preventScroll: true });
      stripUpdate();
    }
    $$('[data-sheet-close]').forEach((b) => b.addEventListener('click', closeSheet)); backdrop.addEventListener('click', closeSheet);
    if (root.visualViewport) { root.visualViewport.addEventListener('resize', fitSheet); root.visualViewport.addEventListener('scroll', fitSheet); }
    root.addEventListener('resize', fitSheet); box.addEventListener('focusin', (e) => { if (openId && e.target.closest && e.target.closest('.pl-sheet.open')) setTimeout(fitSheet, 250); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openId) { e.preventDefault(); closeSheet(); } if (e.key === 'Tab' && openId) { const s = box.querySelector('[data-sheet="' + openId + '"]'), f = $$('input:not([hidden]),button,a[href]', s).filter((x) => live(x) && !x.disabled); if (!f.length) return; const first = f[0], lastEl = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); } else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); } } });
    // ---- the persistent bar (phones): the headline and "Edit details", in every result or fix state; never over a sheet, an input or the keyboard ----
    const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && !/^(checkbox|radio|button|submit)$/.test(a.type); };
    const kbUp = () => (root.visualViewport ? root.visualViewport.height < root.innerHeight * 3 / 4 : false);
    function stripUpdate() {
      const fixing = !last && issues.length > 0, show = mq.matches && (!!last || fixing) && !openId && !typing() && !kbUp();
      const vEl = out.strip.querySelector('[data-strip-v]'), sEl = out.strip.querySelector('[data-strip-s]');
      if (last) { const h = last.r.headline; vEl.textContent = h.peak > 0 ? $(h.peak) + ' max gap' : 'All covered'; const sc0 = last.scn || {}; sEl.textContent = sc0.illus && sc0.illus.length ? 'illustrative figures' : sc0.cap && sc0.view === 'rule' ? 'at the rule-ceiling loan' : sc0.cap ? 'at the income-supported loan' : h.peak > 0 ? 'needed in hand by ' + day(h.peakAt) : ORDER_T[last.r.order]; }
      else if (fixing) { vEl.textContent = issues.length === 1 ? '1 entry to fix' : issues.length + ' entries to fix'; sEl.textContent = 'everything else is kept'; }
      out.strip.hidden = !show; document.body.classList.toggle('pl-has-strip', !!show);
    }
    document.addEventListener('focusin', () => setTimeout(stripUpdate, 0)); document.addEventListener('focusout', () => setTimeout(stripUpdate, 60));
    if (root.visualViewport) root.visualViewport.addEventListener('resize', stripUpdate); if (mq.addEventListener) mq.addEventListener('change', stripUpdate);
    q('[data-strip-go]').addEventListener('click', (e) => {
      track('planner_edit_details', {});
      if (last) { out.assume.scrollIntoView({ behavior: 'smooth', block: 'start' }); const f = out.assume.querySelector('button'); if (f) f.focus({ preventScroll: true }); }
      else { const x = issues[0]; openSheet(x && x.key ? sheetOf(x.key) : 'purchase', e.currentTarget, x && x.key); }
    });
    // ---- first-load checklist: tap a row to go straight to its field; choose whether there is a home to sell ----
    const FIELD = { price: ['purchase', 'price'], otp: ['purchase', 'otp'], age: ['buyers', 'age'], cash: ['money', 'cash'], cpf: ['money', 'cpf'], saleCash: ['sale', 'saleCash'] };
    out.result.addEventListener('click', (e) => {
      const n = e.target.closest('[data-need]'), o = e.target.closest('[data-own]'), rv = e.target.closest('[data-open-buyers]');
      if (n && FIELD[n.dataset.need]) { track('planner_need', { field: n.dataset.need }); openSheet(FIELD[n.dataset.need][0], n, FIELD[n.dataset.need][1]); }
      else if (o) { syncOrder(o.dataset.own); track('planner_order', { order: o.dataset.own }); changed(orderGroup); }
      else if (rv) openSheet('buyers', rv);
    });
    box.addEventListener('click', (e) => {
      const t = (sel) => e.target.closest(sel);
      const o = t('[data-open]'), fx = t('[data-fix]'), ed = t('[data-edit]'), ut = t('[data-use-tenure]'), lv = t('[data-loan-view]'), gt = t('[data-goto]'), st = t('[data-set]'), ei = t('[data-ec-illus]'), es = t('[data-ec-switch]');
      if (gt) { const f = fieldFor(gt.dataset.goto); if (f && openId && f.closest('.pl-sheet.open')) { try { f.focus({ preventScroll: true }); f.scrollIntoView({ block: 'center' }); } catch (er) { /* ignore */ } flash(f); } else openSheet(sheetOf(gt.dataset.goto), gt, gt.dataset.goto); }
      else if (lv) { viewPref = lv.dataset.loanView === 'income' ? 'income' : 'rule'; track('planner_loan_view', { view: viewPref }); clearTimeout(tmr); recalc(); }
      else if (st) { const p = st.dataset.set.split(':'), g = box.querySelector('[data-k="' + p[0] + '"]'); if (g) { setChip(g, p[1]); changed(g); clearTimeout(tmr); recalc(); const again = q('[data-set="' + st.dataset.set + '"]'); if (again) again.focus({ preventScroll: true }); } }
      else if (ei && ackGroup) { setChip(ackGroup, ei.dataset.ecIllus === 'yes' ? 'yes' : ''); changed(ackGroup); clearTimeout(tmr); recalc(); const t0 = q('.pl-ec'); if (t0 && t0.scrollIntoView) { try { t0.scrollIntoView({ block: 'nearest' }); } catch (er) { /* ignore */ } } }
      else if (es) { const kg = box.querySelector('[data-k="kind"]'); if (kg) { setChip(kg, 'new'); changed(kg); clearTimeout(tmr); recalc(); } }
      else if (o) openSheet(o.dataset.open, o);
      else if (fx) { track('planner_fix', { field: fx.dataset.fix || 'none' }); openSheet(fx.dataset.fix ? sheetOf(fx.dataset.fix) : 'purchase', fx, fx.dataset.fix); }
      else if (ed) { const p = ed.dataset.edit.split(':'); openSheet(p[0], ed, p[1]); }
      else if (ut) {
        const f = fieldFor('years'); if (!f) return; const from = last && last.r.loan ? last.r.loan.years : +f.value, to = +ut.dataset.useTenure; if (from === to) return;
        undoTenure = undoTenure && undoTenure.from === to ? null : { from: from, to: to }; // choosing the old value again just undoes the change
        f.value = String(to); track('planner_tenure_choice', {}); changed(f); clearTimeout(tmr); recalc();
      }
    });
    // ---- actions ----
    q('[data-print]').addEventListener('click', () => { track('planner_print', {}); try { root.print(); } catch (e) { /* no print */ } });
    q('[data-copy]').addEventListener('click', () => { if (!last) return; const t = summaryText(last.r, last.i, last.scn); const done = () => { out.note.textContent = 'Summary copied. It carries the result and the price, not your cash, CPF or income.'; }; track('planner_share', {});
      if (root.navigator && root.navigator.clipboard) root.navigator.clipboard.writeText(t).then(done, () => { out.note.textContent = t; }); else out.note.textContent = t; });
    $$('[data-fb]').forEach((b) => b.addEventListener('click', () => { track('planner_feedback', { answer: b.dataset.fb }); $$('[data-fb]').forEach((x) => { x.setAttribute('aria-pressed', String(x === b)); }); const n = q('[data-fb-note]'); n.innerHTML = 'Thank you. <a href="' + esc(waUrl('Hi Ken, feedback on the Payment timeline planner (' + b.dataset.fb + '): ')) + '" target="_blank" rel="noopener" data-gw-wa="calc-payment-planner-feedback">Tell Ken what was missing ›</a>'; }));
    function wa() { const a = q('[data-ask-wa]'); if (!a) return; const m = 'Hi Ken, I’m using the Payment timeline planner on Groundwork' + (last ? ' for a ' + KIND[last.i.uiKind || last.r.kind] + ' (' + ORDER_T[last.r.order] + ')' : '') + ' and would like to talk through the order of moves. (Ref ' + REF + ')'; const u = waUrl(m); if (root.GW_WA) root.GW_WA.set(a, u); else a.setAttribute('href', u); }
    recalc();
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }
  return { pageHtml, formHtml, resultHtml, assumeHtml, compareHtml, timelineHtml, chartHtml, mortgageHtml, bankHtml, tenureHtml, fixHtml, entriesHtml, summaryText, ecIncomeCheck, ecHtml, ecGate, illusHtml, loanScenarioHtml, msrCase, grossOf, countedHtml, testedHtml, testedRate, jointHtml, REF };
});
