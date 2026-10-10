/* ==========================================================================
   GROUNDWORK — calculators: page markup and browser behaviour (R2, Ken 9 Oct 2026).
   The figures come only from GW_CALC (pure, tested). This file draws the inputs, shows the results as you type,
   and prepares the optional "Send my assessment to Ken" WhatsApp message.
   Privacy: inputs never go into the page address, analytics or advertising events. The assessment opens WhatsApp
   from a button (never a link the analytics tags can read), and only when the visitor taps it.
   Details typed into one calculator are kept for this browser tab only (sessionStorage), so the next calculator
   doesn't ask again; "Clear" removes them.
   UMD: window.GWC_UI in the browser; Node uses the same functions to write the pages at build time.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GWC_UI = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PHONE = '6590908898', waUrl = (m) => 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(m);
  const MAX_MESSAGE = 3000; // characters; longer assessments are copied rather than cut
  // V4-01: an income-weighted age is shown and carried to 0.1 year, rounded UP, so a weighted 35.04 becomes 35.1 (not 35.0).
  // MAS Notice 632's tests (age + tenure over 65) compare against whole years, so rounding up keeps every LTV and tenure
  // result identical to the exact age; rounding to nearest could turn a loan that runs past 65 into one that doesn't.
  const ageUp = (a) => Math.ceil(a * 10 - 1e-9) / 10;

  /* ---------------- the tools ---------------- */
  const ICON = {
    mortgage: '<path d="M4 11 12 4l8 7v9H4z"/><path d="M9 20v-5h6v5"/>',
    'stamp-duty': '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
    ssd: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
    'sale-proceeds': '<path d="M4 7h16v10H4z"/><circle cx="12" cy="12" r="2.4"/><path d="M7 7v10M17 7v10" opacity=".45"/>',
    tdsr: '<path d="M4 19h16"/><path d="M6 19V11M10 19V7M14 19v-9M18 19V5"/>',
    msr: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/><path d="M4 12h16" opacity=".45"/>',
    progressive: '<path d="M4 20h16"/><path d="M6 20v-4h3v4M10.5 20v-8h3v8M15 20V8h3v12"/>',
    'hdb-upgrade': '<path d="M3 12 9 7l6 5"/><path d="M5 11v8h8v-8"/><path d="M15 9l3-2 3 2v10h-6"/>',
    'what-can-i-buy': '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/>',
    worth: '<path d="M5 20V12m5 8V7m5 13v-6m5 6V4"/>',
    research: '<path d="M4 20V8l6-4v16M10 20V10l6 3v7M16 20v-6l4 2v4"/><path d="M3 20h18"/>',
  };
  const svg = (k) => '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICON[k] + '</svg>';
  // name: plain words (menu, directory, page heading) · tag: the term people know · title: the formal name (page titles, WhatsApp).
  const TOOLS = {
    'stamp-duty': { path: 'stamp-duty/', title: 'Stamp duty (BSD and ABSD)', name: 'Stamp duty', tag: 'BSD · ABSD', short: 'What you pay when you buy, for your buyer profile', h1: 'Stamp duty', intro: 'Buyer’s Stamp Duty and ABSD on a home, for one or two buyers.', group: 'buy' },
    mortgage: { path: 'mortgage/', title: 'Mortgage repayment', name: 'Mortgage repayment', tag: 'Monthly instalment', short: 'Instalment, total interest and the income banks look for', h1: 'Mortgage repayment', intro: 'Your monthly instalment, total interest, and the income a bank’s stress test looks for.', group: 'buy' },
    tdsr: { path: 'tdsr/', title: 'TDSR', name: 'How much can I borrow?', tag: 'TDSR', short: 'Your loan limit from your income and debts', h1: 'How much can I borrow?', intro: 'The bank-loan limit under the Total Debt Servicing Ratio (TDSR), from your income and debts.', group: 'buy' },
    msr: { path: 'msr/', title: 'MSR for HDB flats and ECs', name: 'HDB and EC loan limit', tag: 'MSR', short: 'Loan limits for HDB flats and new ECs', h1: 'HDB and EC loan limit', intro: 'The Mortgage Servicing Ratio (MSR) limit for an HDB flat or a new EC, with an HDB or bank loan.', group: 'buy' },
    progressive: { path: 'progressive-payments/', title: 'Progressive payments', name: 'New launch payments', tag: 'Progressive payments', short: 'What you pay at each stage, from cash, CPF and the loan', h1: 'New launch payments', intro: 'What a home under construction asks of you at each stage, from cash, CPF and the bank.', group: 'buy' },
    'sale-proceeds': { path: 'sale-proceeds/', title: 'Sale proceeds', name: 'Sale proceeds', tag: 'Cash and CPF back', short: 'The cash and CPF you get back when you sell', h1: 'Sale proceeds', intro: 'From selling price to the cash in your hand and the CPF back in your account.', group: 'sell' },
    ssd: { path: 'ssd/', title: 'Seller’s Stamp Duty (SSD)', name: 'Selling within 4 years?', tag: 'SSD', short: 'Seller’s Stamp Duty on a private home', h1: 'Selling within 4 years?', intro: 'Whether Seller’s Stamp Duty (SSD) applies when you sell a private home, and how much.', group: 'sell' },
  };
  const EXISTING = {
    'hdb-upgrade': { path: 'hdb-upgrade/', title: 'Can I afford to upgrade from my HDB?', name: 'HDB upgrade planner', tag: 'Direct budget calculation', short: 'Your private-home budget if you sell your flat first', group: 'upgrade' },
    'what-can-i-buy': { path: 'what-can-i-buy/', title: 'What can this budget buy?', name: 'What can this budget buy?', tag: 'Homes that sold around your budget', short: 'What homes around your budget have actually sold for', group: 'research' },
    worth: { path: '../journey/worth/', title: 'HDB and home prices', name: 'HDB and home prices', tag: 'Resales in your block · asking price', short: 'What homes like yours sold for. Check an asking price', group: 'research', icon: 'worth' },
    research: { path: '../research/', title: 'Research a development', name: 'Research a development', tag: 'Prices by size · compare', short: 'Recent sales by size, an asking-price check, and comparisons', group: 'research', icon: 'research' },
  };
  // Tools work out a number from your own figures. Looking up what homes sold for (HDB and home prices, Research, What can this
  // budget buy?) is listed under Research in the menu and on the homepage, so each feature has one home.
  const ORDER = { buy: ['stamp-duty', 'tdsr', 'msr', 'mortgage', 'progressive'], sell: ['sale-proceeds', 'ssd'], upgrade: ['hdb-upgrade'] };
  const GROUPS = [['buy', 'Buying'], ['sell', 'Selling'], ['upgrade', 'Upgrading from HDB']];

  // The tools page: a compact directory. Plain names first, the term people know as a tag (r = path from /tools/, i.e. '').
  function directoryHtml(o) {
    o = o || {}; // o.exampleUp: a real example result from the planner, shown beside it (from the page builder)
    const tile = (id) => { const t = TOOLS[id] || EXISTING[id]; return '<a class="gw-tl" href="' + t.path + '" data-tool="' + id + '">' + svg(t.icon || id) + '<span class="gw-tl-t"><b>' + esc(t.name) + '</b><em>' + esc(t.tag) + '</em></span><span class="gw-tl-s">' + esc(t.short) + '</span></a>'; };
    return GROUPS.map((g) => '<section class="gw-tg" aria-labelledby="tg-' + g[0] + '"><h2 id="tg-' + g[0] + '">' + g[1] + '</h2><div class="gw-tls">' + ORDER[g[0]].map(tile).join('') + '</div>' +
      (g[0] === 'upgrade' ? '<p class="gw-fine gw-tg-more">Want the complete process? <a href="../journey/#up" data-tool="upgrade-path">Upgrade from HDB in four steps: flat value, sale proceeds, budget, what it buys ›</a></p>' + (o.exampleUp || '') : '') + '</section>').join('');
  }

  /* ---------------- fields (markup) ---------------- */
  const hint = (h) => (h ? '<small>' + h + '</small>' : '');
  const money = (k, label, o) => { o = o || {}; return '<label class="gw-fld' + (o.cls ? ' ' + o.cls : '') + '"' + (o.when ? ' data-when="' + o.when + '"' : '') + '><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><div class="gw-in gw-in-m"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="money"' + (o.share ? ' data-share="' + o.share + '"' : '') + (o.value !== undefined ? ' value="' + esc(o.value) + '" data-default="' + esc(o.value) + '"' : '') + ' placeholder="' + esc(o.ph || '') + '"></div>' + hint(o.hint) + '</label>'; };
  const numf = (k, label, unit, o) => { o = o || {}; return '<label class="gw-fld' + (o.cls ? ' ' + o.cls : '') + '"' + (o.when ? ' data-when="' + o.when + '"' : '') + '><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><div class="gw-in"><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="num"' + (o.share ? ' data-share="' + o.share + '"' : '') + (o.value !== undefined ? ' value="' + esc(o.value) + '" data-default="' + esc(o.value) + '"' : '') + ' placeholder="' + esc(o.ph || '') + '"><i class="u">' + unit + '</i></div>' + hint(o.hint) + '</label>'; };
  const datef = (k, label, o) => { o = o || {}; return '<label class="gw-fld"' + (o.when ? ' data-when="' + o.when + '"' : '') + '><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><div class="gw-in"><input type="date" data-k="' + k + '" data-t="date"' + (o.today ? ' data-today="1"' : '') + '></div>' + hint(o.hint) + '</label>'; };
  const chips = (k, label, opts, o) => { o = o || {}; return '<div class="gw-q gw-fld"' + (o.when ? ' data-when="' + o.when + '"' : '') + '><span class="l">' + label + '</span><div class="gw-chips" role="group" aria-label="' + esc(label) + '" data-k="' + k + '" data-t="chip"' + (o.share ? ' data-share="' + o.share + '"' : '') + ' data-default="' + esc(o.value) + '">' + opts.map((x) => '<button type="button" class="gw-chip" data-v="' + x[0] + '" aria-pressed="' + (x[0] === o.value) + '">' + x[1] + '</button>').join('') + '</div>' + hint(o.hint) + '</div>'; };
  const check = (k, label, o) => { o = o || {}; return '<label class="gw-ck"' + (o.when ? ' data-when="' + o.when + '"' : '') + '><input type="checkbox" data-k="' + k + '" data-t="check"' + (o.checked ? ' checked data-default="1"' : '') + '><span>' + label + '</span></label>'; };
  const more = (inner, label) => '<details class="gw-more"><summary>' + (label || 'More options') + '</summary><div class="gw-grid">' + inner + '</div></details>';
  const grid = (inner) => '<div class="gw-grid">' + inner + '</div>';
  const RES = [['SC', 'Singapore Citizen'], ['PR', 'Permanent Resident'], ['FR', 'Foreigner']];
  const OWN = [['0', 'None'], ['1', 'One'], ['2', 'Two or more']];
  // A1-13: IRAS's counting rules, once, under the first buyer
  const OWNED_HINT = 'Count any share in a home, and homes you’ve signed to buy. A home you’re selling stops counting once your buyer has exercised the option. Property overseas doesn’t count.';
  function buyersBlock() {
    const row = (n) => '<div class="gw-person" data-row="buyers.' + n + '"' + (n ? ' hidden' : '') + '><p class="gw-ph-l">' + (n ? 'Second buyer <button type="button" class="gw-link" data-remove="buyers.1">Remove</button>' : 'Buyer') + '</p>' +
      chips('buyers.' + n + '.res', 'Residency', RES, { value: 'SC', share: 'buyers.' + n + '.res' }) +
      chips('buyers.' + n + '.owned', 'Residential properties already owned in Singapore, including HDB flats', OWN, { value: '0', share: 'buyers.' + n + '.owned', hint: n ? '' : OWNED_HINT }) + '</div>';
    return '<div data-when="entity:0">' + row(0) + row(1) + '<button type="button" class="gw-link gw-add" data-add="buyers.1">+ Add a second buyer</button></div>';
  }
  function borrowersBlock(o) {
    o = o || {};
    const row = (n) => '<div class="gw-person" data-row="borrowers.' + n + '"' + (n ? ' hidden' : '') + '><p class="gw-ph-l">' + (n ? 'Second borrower <button type="button" class="gw-link" data-remove="borrowers.1">Remove</button>' : 'Borrower') + '</p><div class="gw-grid">' +
      numf('borrowers.' + n + '.age', 'Age', 'years', { share: 'borrowers.' + n + '.age', ph: 'e.g. 35' }) +
      money('borrowers.' + n + '.fixed', 'Fixed monthly income', { share: 'borrowers.' + n + '.fixed', ph: 'gross, before CPF', hint: n ? '' : 'Gross salary before CPF deductions.' }) +
      money('borrowers.' + n + '.variable', 'Variable monthly income', { opt: true, share: 'borrowers.' + n + '.variable', ph: 'average', hint: n ? '' : 'Bonus, commission or allowances, averaged per month.' }) +
      (o.rental ? money('borrowers.' + n + '.rental', 'Rental income', { opt: true, share: 'borrowers.' + n + '.rental', ph: 'per month', hint: n ? '' : 'Only with a stamped tenancy that has at least 6 months left.' }) : '') + '</div></div>';
    return row(0) + row(1) + '<button type="button" class="gw-link gw-add" data-add="borrowers.1">+ Add a second borrower</button>';
  }
  const LOANS = [['0', 'None'], ['1', 'One'], ['2', 'Two or more']];
  // A2-14: MAS counts HDB loans, and applies the limits to each joint borrower
  const LOANS_HINT = 'HDB loans count too. With two borrowers, use the number for whoever has more.';
  const SSD_DATE_HINT = 'Resale: the date you exercised the Option to Purchase. New launch: your S&P date, not the booking date. Inherited homes, divorce transfers and HDB family transfers use special dates: see IRAS.';
  const KIND_STAMP = [['private', 'Private home'], ['ec', 'New EC from the developer'], ['hdb', 'HDB flat']];

  const FORMS = {
    mortgage: () => chips('lender', 'Loan', [['bank', 'Bank loan'], ['hdb', 'HDB loan']], { value: 'bank' }) + grid(
      money('loan', 'Loan amount', { share: 'loan', ph: 'e.g. 600,000' }) +
      numf('ratePct', 'Interest rate', '% a year', { value: '4', hint: '<span data-when="lender:bank">Banks test the loan at 4% or your rate after any lock-in period, if higher. Use the rate you’ve been quoted.</span><span data-when="lender:hdb">HDB’s rate is 2.6% a year for Oct–Dec 2026, valid to 31 Dec 2026 (CPF Board).</span>' }) +
      numf('years', 'Loan tenure', 'years', { value: '25', hint: '<span data-when="lender:bank">Up to 30 years for HDB flats and 35 for other homes.</span><span data-when="lender:hdb">Up to 25 years for an HDB loan.</span>' })),
    'stamp-duty': () => grid(money('price', 'Purchase price', { share: 'buyPrice', ph: 'e.g. 1,500,000', hint: 'Or the market value, if that is higher.' })) +
      chips('kind', 'What are you buying?', KIND_STAMP, { value: 'private', hint: 'An EC bought on the resale market counts as a private home here.' }) +
      chips('entity', 'Who is buying?', [['0', 'Individuals'], ['1', 'A company or other entity']], { value: '0' }) + buyersBlock(),
    // A3-12: its own key, so a private home's price never becomes the HDB flat's value in Sale proceeds or the planner
    ssd: () => grid(money('price', 'Selling price', { share: 'ssdPrice', ph: 'e.g. 1,600,000', hint: 'Or the market value, if that is higher.' }) +
      datef('bought', 'Date you bought', { hint: SSD_DATE_HINT }) + datef('sold', 'Date you sell', { today: true, hint: 'When your buyer exercises your Option to Purchase, or the S&P date.' })),
    'sale-proceeds': () => chips('type', 'Your home', [['hdb', 'HDB flat'], ['private', 'Private home'], ['ec', 'EC']], { value: 'hdb', share: 'homeType' }) + grid(
      money('price', 'Selling price', { share: 'sellPrice', ph: 'e.g. 750,000', hint: '<span data-when="type:hdb"><span data-gw-blockhint hidden></span>Not sure? <a href="../../journey/worth/#hdb" data-gw-go="worth-hdb">See recent resales in your block ›</a></span><span data-when="type:private,ec">Not sure? <a href="../../research/" data-gw-go="research">See recent sales in your development ›</a></span>' }) +
      money('loan', 'Outstanding loan', { opt: true, share: 'outstandingLoan', ph: '0 if none' }) +
      money('cpfPrincipal', 'CPF used for this home', { opt: true, share: 'cpfPrincipal', ph: 'principal, all owners', hint: 'Down payment and instalments paid from CPF, plus any CPF housing grants. If an owner aged 55 or older pledged this home for their retirement sum, add the pledged amount. CPF’s ‘What happens if’ section under Home Ownership shows the full refund.' }) +
      money('cpfInterest', 'CPF accrued interest', { opt: true, share: 'cpfInterest', ph: 'all owners', hint: 'On the same CPF page. <button type="button" class="gw-link" data-estimate>Estimate it</button>' }) +
      '<div class="gw-est" data-est hidden>' + numf('estYears', 'Years since you started using CPF for it', 'years', { ph: 'e.g. 8', hint: 'A rough upper estimate: 2.5% a year (valid to 31 Dec 2026) on the full amount from the start. CPF counts each amount from when it was used, so your CPF page usually shows less.' }) + '</div>' +
      // A1-05: the SSD dates sit with the main details, not in "More options"
      '<div data-when="type:private,ec" class="gw-grid1">' + datef('bought', 'Date you bought (for SSD)', { hint: SSD_DATE_HINT }) + datef('sold', 'Date you sell', { today: true }) + '</div>') +
      more(numf('commissionPct', 'Agent’s commission', '%', { value: '2', hint: 'Your estimate; commission is agreed with your agent.' }) + check('gst', 'Add 9% GST to the commission', { checked: true }) +
        money('legal', 'Legal fees', { value: '3,000', hint: 'Your estimate.' }) + money('penalty', 'Early repayment penalty', { opt: true, hint: 'If your bank charges one for repaying early.' }) +
        money('other', 'Other selling costs', { opt: true }) +
        check('owner55', 'An owner is 55 or older')),
    tdsr: () => chips('kind', 'Buying', [['private', 'A private home'], ['hdb', 'An HDB flat with a bank loan']], { value: 'private' }) + borrowersBlock({ rental: true }) + grid(
      money('debts', 'Monthly debt repayments now', { opt: true, share: 'debts', ph: '0 if none', hint: 'Car, personal and student loans, credit card minimums, existing home loans, and at least 20% of the instalment on any loan you guarantee.' }) +
      money('propertyLoans', 'Of which, property loan instalments', { opt: true, when: 'kind:hdb', ph: '0 if none', hint: 'MSR counts only property loans.' }) +
      numf('tenure', 'Loan tenure', 'years', { opt: true, ph: 'longest standard', hint: 'Leave blank for the longest standard tenure for your age.' })) +
      chips('loans', 'Housing loans you still have', LOANS, { value: '0', share: 'housingLoans', hint: LOANS_HINT }),
    msr: () => chips('scenario', 'Buying', [['hdb-loan', 'HDB flat, HDB loan'], ['hdb-bank', 'HDB flat, bank loan'], ['ec', 'New EC, bank loan']], { value: 'hdb-loan' }) +
      chips('household', 'Household', [['family', 'Family'], ['extended', 'Extended family'], ['single', 'Single, 35 or older']], { value: 'family', when: 'scenario:hdb-loan', hint: 'Income ceilings for an HDB loan: $16,000 a month for families, $24,000 for extended families, $8,000 for singles.' }) + borrowersBlock() + grid(
      money('propertyLoans', 'Existing property loan instalments', { opt: true, ph: 'per month, 0 if none' }) +
      money('otherDebts', 'Other monthly debt repayments', { opt: true, when: 'scenario:hdb-bank,ec', ph: 'car, cards, other loans' }) +
      numf('lease', 'Remaining lease of the flat', 'years', { opt: true, when: 'scenario:hdb-loan', ph: 'e.g. 70' }) +
      numf('tenure', 'Loan tenure', 'years', { opt: true, ph: 'longest allowed' })) +
      chips('loans', 'Housing loans you still have', LOANS, { value: '0', share: 'housingLoans', when: 'scenario:hdb-bank,ec', hint: LOANS_HINT }),
    // A2-02: the borrower's age decides whether the loan runs past 65 (shared with the other calculators' first borrower)
    progressive: () => chips('kind', 'What are you buying?', KIND_STAMP.slice(0, 2), { value: 'private' }) + grid(money('price', 'Purchase price', { share: 'buyPrice', ph: 'e.g. 1,800,000' }) +
      numf('age', 'Borrower’s age', 'years', { share: 'borrowers.0.age', ph: 'e.g. 35', when: 'entity:0', hint: 'Two borrowers: their income-weighted average age. For example, aged 30 earning $3,000 and aged 50 earning $12,000 gives 46. How much can I borrow? works it out.' }) +
      numf('ratePct', 'Interest rate', '% a year', { value: '4', hint: '4% is the banks’ stress-test rate. Use the rate you’ve been quoted.' }) +
      numf('years', 'Loan tenure', 'years', { value: '30' }) + money('cpf', 'CPF OA you can use', { opt: true, share: 'cpfOa', ph: 'all buyers' })) +
      chips('loans', 'Housing loans you still have', LOANS, { value: '0', share: 'housingLoans', hint: LOANS_HINT }) + chips('entity', 'Who is buying?', [['0', 'Individuals'], ['1', 'A company or other entity']], { value: '0' }) + buyersBlock(),
  };

  // The calculator section on each tool page.
  function pageHtml(id) {
    const t = TOOLS[id];
    return '<section class="gw-calc" data-calc="' + id + '"><div class="gw-calc-in" aria-label="Your details">' + FORMS[id]() +
      '<p class="gw-fine gw-saved" data-saved hidden>Some details are filled in from your other calculations in this tab. <button type="button" class="gw-link" data-clear>Clear them</button> (this clears your figures from every tool in this tab).</p></div>' +
      '<div class="gw-calc-out"><div data-out aria-live="polite"><p class="gw-fine">Enter your details to see the result.</p></div>' +
      '<div class="gw-send" data-send hidden><button type="button" class="gw-btn wa" data-send-wa>Send my assessment to Ken on WhatsApp</button>' +
      '<p class="gw-fine">Your details and results go into the message, so Ken sees the full picture. You can edit it before sending.</p>' +
      '<p class="gw-fine"><button type="button" class="gw-link" data-send-copy>Copy it instead</button> · <a href="' + esc(waUrl('Hi Ken, I’m using the ' + t.title + ' calculator on Groundwork and have a question.')) + '" target="_blank" rel="noopener" data-gw-wa="calc-' + id + '-ask">Just a question? Ask Ken</a></p>' +
      '<div data-send-note aria-live="polite"></div></div></div></section>' +
      '<noscript><p class="gw-fine">This calculator needs JavaScript. Ken can work it out with you on <a href="' + esc(waUrl('Hi Ken, I’d like help with the ' + t.title + ' calculation.')) + '">WhatsApp</a>.</p></noscript>';
  }

  /* ---------------- results (markup) ---------------- */
  const $ = (n) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
  const pc = (x, d) => (Math.round(x * 100 * Math.pow(10, d || 0)) / Math.pow(10, d || 0)) + '%';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? +m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : iso; };
  const head = (label, value, sub) => '<div class="gw-res-h"><span>' + label + '</span><b>' + value + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  const rows = (list) => '<dl class="gw-rows">' + list.filter(Boolean).map((r) => '<div' + (r[2] ? ' class="' + r[2] + '"' : '') + '><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('') + '</dl>';
  const notes = (list) => (list && list.length ? '<ul class="gw-notes">' + list.map((n) => '<li>' + esc(n.text || n) + '</li>').join('') + '</ul>' : '');
  const src = (t) => '<p class="gw-src">' + t + '</p>';
  // Next steps: figures already typed carry over in this tab (never in the address); each page shows what it filled in.
  // A link marked primary (l[3]) is the one obvious next step; the others stay available but quieter.
  const next = (links) => { const pri = links.some((l) => l[3]); return '<div class="gw-next' + (pri ? ' has-pri' : '') + '"><span>Next</span>' + links.map((l) => '<a href="' + l[0] + '" data-gw-go="' + l[2] + '"' + (l[3] ? ' class="gw-btn pri"' : '') + '>' + (pri && !l[3] ? 'Or: ' : '') + l[1] + ' ›</a>').join('') + '</div>'; };
  // R2.1: detail and assumptions stay one tap away instead of filling the screen.
  const work = (inner, label, open) => '<details class="gw-work"' + (open ? ' open' : '') + '><summary>' + (label || 'See the working') + '</summary><div class="gw-work-in">' + inner + '</div></details>';
  const sources = (list, rule) => work(notes(list) + src(rule), 'Assumptions and sources');
  // A proportional bar with its legend: where the money goes. Values are the result's own figures; nothing new is calculated.
  const stack = (cap, parts, unit) => {
    const P = parts.filter((p) => p && p[1] > 0), tot = P.reduce((a, p) => a + p[1], 0); if (!tot || P.length < 2) return '';
    return '<figure class="gw-stack"><figcaption>' + cap + '</figcaption><div class="bar" aria-hidden="true">' + P.map((p) => '<i class="' + p[2] + '" style="width:' + (p[1] / tot * 100).toFixed(2) + '%"></i>').join('') + '</div>' +
      '<ul>' + P.map((p) => '<li><i class="' + p[2] + '" aria-hidden="true"></i><span>' + p[0] + '</span><b>' + $(p[1]) + (unit || '') + '</b><small>' + Math.round(p[1] / tot * 100) + '%</small></li>').join('') + '</ul></figure>';
  };
  const span = (n) => { const y = Math.floor(n / 12), m = n % 12; return (y ? y + ' year' + (y === 1 ? '' : 's') : '') + (y && m ? ' ' : '') + (m ? m + ' month' + (m === 1 ? '' : 's') : ''); }; // A5-26
  const remitRows = (d) => (d.remissions && d.remissions.length ? rows(d.remissions.map((x) => [esc(x.label) + ' (see the conditions below)', $(x.total), 'w'])) : '');
  const LABEL = { loan: 'loan amount', ratePct: 'interest rate', years: 'loan tenure', price: 'price', buyers: 'buyer details', bought: 'date you bought', sold: 'date you sell', income: 'income', age: 'age' };

  // SSD: the years after purchase on one line, the rate in each, and where the sale date falls.
  function ssdTrack(r) {
    const reg = r.regime; if (!reg || !reg.rates || r.heldDays === undefined) return '';
    const yrs = reg.years, span = yrs + 1, held = r.heldDays / 365.25, at = Math.min(held, span) / span * 100, band = r.band;
    return '<figure class="gw-ssdt"><figcaption>Years after you bought, and the rate in each</figcaption><div class="trk" aria-hidden="true">' + reg.rates.map((x, i) => '<span' + (band === i ? ' class="on"' : '') + '><b>' + pc(x) + '</b><small>Year ' + (i + 1) + '</small></span>').join('') +
      '<span class="free' + (band === -1 ? ' on' : '') + '"><b>No SSD</b><small>From year ' + (yrs + 1) + '</small></span><i style="left:' + at.toFixed(1) + '%"></i></div><p class="gw-fine">The marker is your sale date: ' + esc(r.heldText) + ' after you bought' + (held > span ? ', beyond the SSD period' : '') + '.</p></figure>';
  }
  const RENDER = {
    mortgage(r) {
      return head('Monthly instalment', $(r.monthly), 'over ' + span(r.months)) +
        stack('Where your repayments go', [['Loan repaid', r.total - r.interest, 'c1'], ['Interest', r.interest, 'c3']]) +
        // A2-04: tested at the higher of the floor and the rate entered
        rows([['Instalment at the ' + pc(r.stress.rate, 2) + ' ' + (r.lender === 'hdb' ? 'HDB test rate' : 'stress-test rate') + ' (the higher of ' + pc(r.stress.floor) + ' and your rate' + (r.lender === 'hdb' ? '' : ' after any lock-in period') + ')', $(r.stress.monthly)],
          r.stress.incomeForTdsr ? ['Income a bank looks for (TDSR 55%, this loan alone)', $(r.stress.incomeForTdsr) + ' a month', 'w'] : null, ['Income for an HDB flat or new EC (MSR 30%)', $(r.stress.incomeForMsr) + ' a month', 'w']]) +
        (r.overHdbTenure ? '<p class="gw-warn">HDB loans run for up to 25 years.</p>' : '') +
        work(rows([['Total interest', $(r.interest)], ['Total repaid', $(r.total)], ['Interest share of repayments', pc(r.interestShare)], ['First year', $(r.firstYear.interest) + ' interest · ' + $(r.firstYear.principal) + ' principal', 'w'],
          r.balanceAfter[5] !== undefined ? ['Still owed after 5 years', $(r.balanceAfter[5])] : null, r.balanceAfter[10] !== undefined ? ['Still owed after 10 years', $(r.balanceAfter[10])] : null])) +
        sources(['Assumes the same rate for the whole tenure; most bank rates change after a few years.', 'Income figures assume no other debts. Your lender decides.'].concat(r.lender === 'hdb' ? ['HDB’s loan rate of 2.6% a year is valid to 31 Dec 2026.'] : []), 'Rules: MAS TDSR 55% and MSR 30%, tested at the higher of 4% and your rate (MAS Notice 645); HDB loan tested at the higher of 3% and its loan rate. Checked 9 Oct 2026.') +
        next([['../tdsr/', 'How much could I borrow?', 'calc-tdsr'], ['../progressive-payments/', 'New launch payments', 'calc-progressive']]);
    },
    'stamp-duty'(r, v) {
      const who = (r.profile.res === 'ENTITY' ? 'entity' : ({ SC: 'Singapore Citizen', PR: 'Permanent Resident', FR: 'foreigner' })[r.profile.res] + (r.profile.res === 'FR' ? '' : ', ' + ['first', 'second', 'third or later'][r.profile.owned] + ' property')) + (r.absdRate < r.absdRateFull ? ', remitted for ' + (r.kind === 'hdb' ? 'an HDB flat' : 'a new EC') : '');
      return head('Total stamp duty', $(r.total), (v.price ? pc(r.total / v.price, 1) + ' of the price · ' : '') + 'ABSD rate ' + pc(r.absdRate) + ' (' + esc(who) + ')') +
        stack('What makes up the total', [['Buyer’s Stamp Duty (BSD)', r.bsd, 'c1'], ['Additional Buyer’s Stamp Duty (ABSD)', r.absd, 'c3']]) +
        // A1-02, A1-09, A1-10: each remission that depends on facts we don't ask, beside the full figure, with its conditions below
        remitRows(r) +
        notes(r.notes) +
        work('<h3 class="gw-sh">Buyer’s Stamp Duty</h3>' + rows(r.bsdLines.map((l) => [(l.from ? 'Next ' : 'First ') + $(l.to - l.from) + ' at ' + pc(l.rate), $(l.duty)]).concat([['BSD (rounded down)', $(r.bsd), 'tot']])) +
          '<h3 class="gw-sh">Additional Buyer’s Stamp Duty</h3>' + rows([['Rate (' + esc(who) + ')', pc(r.absdRate)], ['ABSD', $(r.absd), 'tot']])) +
        sources([{ text: r.basis }, 'Not covered: buying more than one home in a contract, buying out a co-owner’s share, gifts and inheritance.'], 'Rates: BSD for homes bought from 15 Feb 2023; ABSD from 27 Apr 2023; ABSD remissions for married couples, HDB flats and new ECs, and free trade agreements; refunds for second homes (IRAS, MOF). Checked 9 Oct 2026.') +
        next([['../mortgage/', 'Monthly instalment', 'calc-mortgage'], ['../progressive-payments/', 'New launch payments', 'calc-progressive']]);
    },
    ssd(r, v) {
      if (!r.ok && r.error === 'ssd-2010') return '<p class="gw-warn">Homes bought between 20 Feb 2010 and 13 Jan 2011 had their own SSD rates for a sale within 1 or 3 years. This calculator doesn’t cover them: see IRAS’s SSD page.</p>';
      if (!r.ok && r.error) return '<p class="gw-warn">The date you sell is before the date you bought.</p>';
      if (r.applies === false && r.reason) return head('Seller’s Stamp Duty', '$0') + notes([r.text]);
      const reg = r.regime;
      return head('Seller’s Stamp Duty', $(r.ssd), r.rate ? pc(r.rate) + ' of the price' : 'No SSD: held longer than ' + reg.years + ' years') +
        ssdTrack(r) +
        rows([['Held for', r.heldText], ['No SSD if you sell on or after', day(r.freeFrom)]]) +
        (r.nearBoundary.length ? '<p class="gw-warn">Your date is within a week of an SSD anniversary (' + r.nearBoundary.map(day).join(', ') + '), when the rate changes. Confirm the exact dates with your lawyer or IRAS.</p>' : '') +
        (r.leapDay ? '<p class="gw-warn">Bought on 29 February: confirm with your lawyer or IRAS which day each anniversary falls on.</p>' : '') +
        work(rows([['Bought', reg.to ? 'between ' + day(reg.from) + ' and ' + day(reg.to) : 'on or after ' + day(reg.from), 'w'], ['SSD period for that date', reg.years + ' years (' + reg.rates.map((x) => pc(x)).join(', ') + ')', 'w']])) +
        sources(['SSD is on the higher of the selling price or market value, rounded down, and payable within 14 days of the sale.', 'Most HDB flats are not affected, because their minimum occupation period is longer than the SSD period. A SERS replacement flat can still be: its SSD period runs from the Agreement for Lease.', 'The date you bought: for a new launch, the S&P date; inherited homes, divorce transfers and HDB family transfers use special dates (IRAS).'], 'Rates: IRAS and MOF, for homes bought from 4 Jul 2025 (4 years: 16%, 12%, 8%, 4%), 11 Mar 2017 to 3 Jul 2025 (3 years: 12%, 8%, 4%) and 14 Jan 2011 to 10 Mar 2017 (4 years: 16%, 12%, 8%, 4%). Checked 9 Oct 2026.') +
        next([['../sale-proceeds/', 'What will I get from the sale?', 'calc-sale-proceeds']]);
    },
    'sale-proceeds'(r, v) {
      const c = r.costs;
      const SSDX = { bought: 'enter the date you bought to check it', sold: 'enter the date you sell to check it', 'ssd-2010': 'homes bought in 2010 had their own SSD rules (see IRAS)', 'sold-before-bought': 'the date you sell is before the date you bought' };
      return (r.netCash < 0 ? head('Cash you’d need to add', $(-r.netCash), r.loanShortfall ? 'to clear the loan and pay the selling costs' : 'to pay the selling costs') : head('Cash in hand after costs', $(r.netCash), 'plus ' + $(r.cpfRefund) + ' back in CPF' + (r.nextPurchase.total > 0 && r.cpfRefund > 0 && !r.owner55 ? ': ' + $(r.nextPurchase.total) + ' in all towards your next home' : ''))) +
        (r.loanShortfall || r.netCash < 0 ? '' : stack('Where the selling price goes', [['Loan repaid', r.loan + r.penalty, 'c5'], ['CPF refund', r.cpfRefund, 'c2'], ['Selling costs', c.commission + c.gst + c.legal + (c.other || 0) + (c.ssd || 0), 'c3'], ['Cash to you', r.netCash, 'c4']])) +
        (r.loanShortfall ? '<p class="gw-warn">The price doesn’t cover the loan by ' + $(r.loanShortfall) + '. With the selling costs, about ' + $(r.ownCashNeeded) + ' would have to come from your own funds. Talk to your bank before you commit.</p>' : '') +
        (r.ownCashNeeded && !r.loanShortfall ? '<p class="gw-warn">Costs are more than the cash from the sale: about ' + $(r.ownCashNeeded) + ' from your own cash.</p>' : '') +
        // A1-05: never a silent $0 SSD for a private home or EC
        (r.type !== 'hdb' && r.ssdMissing ? '<p class="gw-warn">SSD isn’t included: ' + (SSDX[r.ssdMissing] || 'check the dates') + '.</p>' : '') +
        (r.owner55 && r.cpfRefund > 0 ? '<p class="gw-warn">An owner is 55 or older: their CPF refund goes first to their Retirement Account, up to the Full Retirement Sum, so less of it may be available for your next home. If the home was pledged for the retirement sum, the pledged amount must be refunded too.</p>' : '') +
        (r.cpfShortfall > 0 ? '<p class="gw-warn">The sale doesn’t cover the full CPF refund: ' + $(r.cpfShortfall) + ' isn’t refunded. You don’t top this up in cash if you sell at market value; below market value, CPF can require a cash top-up.</p>' : '') +
        notes([r.cpfRefund > 0 && r.type !== 'private' ? 'Housing grants are refunded with the CPF. If you received more than $30,000 in grants, part may go to your Special or Retirement Account and MediSave instead of your Ordinary Account.' : '',
          v && v.cpfInterestEstimated ? 'The accrued interest is a rough upper estimate; your CPF page has the real figure.' : '',
          r.defaults.commission ? 'The commission field is blank, so ' + c.commissionPct + '% is used.' : '', r.defaults.legal ? 'The legal fees field is blank, so ' + $(c.legal) + ' is used.' : ''].filter(Boolean)) +
        (r.ssd && r.ssd.nearBoundary && r.ssd.nearBoundary.length ? '<p class="gw-warn">Your sale date is close to an SSD anniversary: confirm the dates with your lawyer.</p>' : '') +
        work(rows([['Selling price', $(r.price)], ['Less outstanding loan' + (r.penalty ? ' and penalty' : ''), '−' + $(r.loan + r.penalty).slice(0)], r.loanShortfall ? ['Short of the loan by', '−' + $(r.loanShortfall), 'sub'] : ['After repaying the loan', $(r.afterLoan), 'sub'],
          r.loanShortfall ? null : ['Less CPF refund (principal + interest)', '−' + $(r.cpfRefund)], r.loanShortfall ? null : ['Cash from the sale', $(r.cashFromSale), 'sub'],
          ['Less agent’s commission (' + c.commissionPct + '%' + (c.gst ? ' + GST' : '') + ')', '−' + $(c.commission + c.gst)], ['Less legal fees', '−' + $(c.legal)], c.other ? ['Less other costs', '−' + $(c.other)] : null, c.ssd ? ['Less SSD (' + pc(r.ssd.rate) + ')', '−' + $(c.ssd)] : null,
          r.netCash < 0 ? ['Cash you’d need to add', $(-r.netCash), 'tot'] : ['Cash left after costs', $(r.netCash), 'tot']])) +
        sources(['The CPF refund goes back to the owners’ CPF accounts' + (r.owner55 ? '; owners aged 55 and above have it go first to their Retirement Account, up to the Full Retirement Sum' : '') + '. It can go towards your next home, subject to CPF rules.', 'Option money you receive in cash is part of the selling price, and goes back to CPF if a refund is due.', 'Commission and legal fees are your estimates.'].concat(r.type === 'hdb' ? ['SSD isn’t included: most HDB flats are past the SSD period when sold, but a SERS replacement flat sold within its SSD period can still attract it (IRAS).'] : []),
          'Rules: CPF refund of principal (including housing grants) plus accrued interest, and any amount pledged at 55; no cash top-up if sold at market value (CPF Board). SSD (IRAS). GST 9%. Checked 9 Oct 2026.') +
        next(r.type === 'hdb' || !r.ssd ? [['../hdb-upgrade/', 'Budget for my next home', 'hdb-upgrade', r.type === 'hdb'], ['../progressive-payments/', 'Buying a new launch next?', 'calc-progressive']] : [['../ssd/', 'Seller’s Stamp Duty in detail', 'calc-ssd'], ['../tdsr/', 'How much could I borrow next?', 'calc-tdsr']]);
    },
    tdsr(r) {
      if (r.noTenure) return '<p class="gw-warn">The standard loan tenure ends at age 65, so at this age there is none. Enter a loan tenure to see the limit: a loan that runs past 65 takes the lower loan limit.</p>';
      const t = r.tenure, hm = r.msrApplies;
      return head('Indicative maximum loan', $(r.maxLoan), 'over ' + t.years + ' years, tested at ' + pc(r.rate) + (hm ? ', within ' + r.binding.toUpperCase() + ' (' + (r.binding === 'msr' ? '30%' : '55%') + ')' : '')) +
        stack('Your monthly income, as banks count it', [['Your current debts', Math.min(r.debts, r.cap), 'c5'], ['Left for the new loan', r.forNew, 'c4'], hm ? ['Within 55% but over the MSR limit', Math.max(0, r.cap - Math.min(r.debts, r.cap) - r.forNew), 'c3'] : null, ['Above the 55% limit', r.B.assessable - r.cap, 'c6']], ' a month') +
        rows([['Price this loan supports', $(r.priceAtLtv) + ' (' + pc(r.ltv) + ' loan)']]) +
        (r.overLimit ? '<p class="gw-warn">Your existing debts already use the whole TDSR limit.</p>' : '') +
        // A2-01: an HDB flat with a bank loan is held to MSR 30% as well as TDSR 55%; the lower one sets the loan
        notes([hm ? 'For an HDB flat, the loan must fit both TDSR 55% and MSR 30% of income. ' + (r.binding === 'msr' ? 'MSR is the lower one here, so it sets the loan.' : 'TDSR is the lower one here, so it sets the loan.') : ''].filter(Boolean)) +
        work(rows([['Income counted (after haircuts)', $(r.B.assessable) + ' a month'], ['TDSR limit, 55%', $(r.cap) + ' a month'], ['Less your monthly debts', '−' + $(r.debts)], hm ? ['Left under TDSR', $(r.forNewTdsr) + ' a month'] : null, hm ? ['MSR limit, 30%, less property loans', $(r.forNewMsr) + ' a month'] : null, ['Left for the new loan', $(r.forNew) + ' a month' + (hm ? ' (' + r.binding.toUpperCase() + ' is the limit)' : ''), 'tot'],
          ['Income-weighted age', ageUp(r.B.iwaa) + ' years'], ['Standard tenure for your age', t.std + ' years (up to ' + t.max + ' with a lower loan limit)', 'w'], ['Loan limit (LTV) used', pc(r.ltv) + ', at least ' + pc(r.minCash) + ' in cash', 'w']])) +
        sources([r.B.haircut > 0 ? 'Banks count only 70% of variable and rental income.' : '', r.B.list.length > 1 ? 'Joint borrowers’ age is weighted by income as banks count it, after the haircut.' : '', t.capped ? 'Tenure capped at ' + t.max + ' years, the MAS maximum here.' : '', t.lower ? 'Your tenure is past the standard limit, so the lower loan limit applies.' : '', 'Income from financial assets, which banks can also count, isn’t included here.', 'Banks test the new loan at 4% or their own higher rate. They decide the final amount.'].filter(Boolean),
          'Rules: MAS Notice 645 (TDSR 55%, MSR 30% for HDB flats, 4% medium-term rate, 30% haircut on variable and rental income); MAS Notice 632 (LTV and tenure limits). Checked 9 Oct 2026.') +
        next(r.msrApplies ? [['../msr/', 'Check the MSR limit', 'calc-msr'], ['../mortgage/', 'Monthly instalment', 'calc-mortgage']] : [['../../tools/what-can-i-buy/', 'What can this budget buy?', 'what-can-i-buy'], ['../mortgage/', 'Monthly instalment', 'calc-mortgage']]);
    },
    msr(r) {
      // A2-08 / A5-05: the message names what leaves no tenure
      if (!r.tenure || !(r.tenure.years >= 1)) {
        if (r.cause === 'lease') return '<p class="gw-warn">With this remaining lease, HDB’s rules leave no tenure for a new loan: an HDB loan runs for at most the remaining lease minus 20 years.</p>' + notes(r.notes);
        if (r.scenario === 'hdb-loan') return '<p class="gw-warn">At this average age, HDB’s rules leave no tenure for a new loan: an HDB loan must end by age 65.</p>' + notes(r.notes);
        if (r.cause === 'age') return '<p class="gw-warn">The standard loan tenure ends at age 65, so at this age the rules leave no tenure for a new loan unless you choose one. Enter a loan tenure to see the limit: a loan that runs past 65 takes the lower loan limit.</p>';
        return '<p class="gw-warn">The loan rules leave no tenure for a new loan with these details.</p>';
      }
      const t = r.tenure, hdb = r.scenario === 'hdb-loan';
      return head('Indicative maximum loan', $(r.maxLoan), 'over ' + t.years + ' years, tested at ' + pc(r.rate)) +
        stack('Your monthly income, as ' + (hdb ? 'HDB' : 'banks') + ' count it', [['Existing property loans', Math.min(r.prop || 0, r.msrCap), 'c5'], ['Left for the new loan', r.forNew, 'c4'], !hdb ? ['Within 30% but over the TDSR limit', Math.max(0, r.msrCap - (r.prop || 0) - r.forNew), 'c3'] : null, ['Above the 30% limit', (hdb ? r.B.gross : r.B.assessable) - r.msrCap, 'c6']], ' a month') +
        // V1-06: when the lease leaves a very low loan limit, the "price" it implies is misleading, so say the limit instead
        rows([r.ltv < 0.5 ? ['Loan limit with this lease', 'Only ' + pc(r.ltv, 1) + ' of the price can be borrowed with this lease'] : ['Price this loan supports', $(r.priceAtLtv) + ' (' + pc(r.ltv) + ' loan)']]) +
        notes(r.notes) +
        work(rows([['Income counted', $(hdb ? r.B.gross : r.B.assessable) + ' a month'], ['MSR limit, 30%', $(r.msrCap) + ' a month'], r.prop ? ['Less existing property loans', '−' + $(r.prop)] : null,
          !hdb ? ['TDSR limit, 55%, less all debts', $(r.forNewTdsr) + ' a month'] : null, ['Left for the new loan', $(r.forNew) + ' a month' + (!hdb ? ' (' + r.binding.toUpperCase() + ' is the limit)' : ''), 'tot'],
          hdb ? ['Tenure', t.years + ' years (the shortest of 25, 65 minus average age' + (t.lease ? ', lease minus 20' : '') + ')', 'w'] : ['Tenure', t.years + ' years (standard up to ' + t.std + ')'],
          ['Loan limit (LTV)', pc(r.ltv, r.ltv === 0.75 || !hdb ? 0 : 1)]])) +
        sources([hdb ? 'HDB tests the loan at 3% or its loan rate, if higher (2.6% a year, valid to 31 Dec 2026). You need an HDB Flat Eligibility (HFE) letter; HDB decides the loan.' : 'Banks test the loan at 4% or their own higher rate, against both MSR and TDSR. They decide the final amount.'],
          'Rules: MAS Notice 645 (MSR 30%, TDSR 55%, at 4%); HDB loan: 3% floor, 75% LTV pro-rated if the lease doesn’t cover the youngest applicant to 95, 25 years, income ceilings from 24 Aug 2026 (HDB, MND). Checked 9 Oct 2026.') +
        next([['../tdsr/', 'TDSR in detail', 'calc-tdsr'], ['../mortgage/', 'Monthly instalment', 'calc-mortgage']]);
    },
    progressive(r) {
      const by = (s) => [s.cash ? 'cash ' + $(s.cash) : '', s.cpf ? 'CPF ' + $(s.cpf) : '', s.flex ? 'cash or CPF ' + $(s.flex) : '', s.loan ? 'loan ' + $(s.loan) : ''].filter(Boolean).join(' · ');
      return head('Within 8 weeks of booking', $(r.stages[0].amount + r.stages[1].amount), '20% of the price' + (r.duty.ok ? ', plus ' + $(r.duty.total) + ' stamp duty within 14 days of signing' : '')) +
        stack('How the price is paid', [['Cash (the minimum)', r.cashMin, 'c3'], ['Cash or CPF', r.cpfOrCash, 'c2'], ['Bank loan (' + pc(r.ltv) + ')', r.loanMax, 'c1']]) +
        rows([['Instalment once fully drawn', $(r.finalMonthly) + ' a month', 'tot']]) +
        // A2-02: a loan running past 65 takes the lower limit; A1-03: the stamp duty remissions and notes, as on Stamp duty
        notes([r.entity ? 'A company or other entity can borrow up to 15% (MAS) and has no CPF, so the rest is cash.' : '',
          r.lowerWhy === 'age' ? 'At age ' + r.age + ', a ' + r.years + '-year loan runs past 65, so the lower loan limit applies (MAS).' + (r.stdYears >= 1 ? ' A tenure of ' + r.stdYears + ' years or less keeps the standard limit.' : '') : '',
          r.cpfGiven ? '' : 'Enter your CPF OA to split cash from CPF.'].filter(Boolean)) +
        (r.duty.ok ? remitRows(r.duty) + notes(r.duty.notes) : '') +
        work('<div class="gw-vx-tw"><table class="gw-vx-t gw-pps"><thead><tr><th>Stage</th><th class="r">Amount</th><th>Paid from</th><th class="r">Instalment after</th></tr></thead><tbody>' +
          r.stages.map((s) => '<tr><td>' + esc(s.name) + ' <small>' + pc(s.pct) + '</small></td><td class="r">' + $(s.amount) + '</td><td>' + by(s) + '</td><td class="r">' + (s.monthly ? $(s.monthly) : '—') + '</td></tr>').join('') + '</tbody></table></div>', 'Each stage, and what you pay', true) +
        sources([r.lowerWhy === 'tenure' ? 'A tenure over 30 years takes the lower loan limit (MAS).' : '', r.tenureCapped ? 'Tenure capped at 35 years, the MAS maximum.' : '', 'The loan is drawn stage by stage; instalments shown amortise what has been drawn at ' + pc(r.rate, 1) + ' over ' + r.years + ' years. Your bank sets the actual amounts.', 'Stage dates follow construction, so your developer’s schedule sets the timing. Your S&P sets the actual terms.', 'The booking fee is paid in cash. CPF use is subject to CPF rules.'].filter(Boolean),
          'Rules: standard progressive payment schedule (Housing Developers Rules); MAS LTV limits; stamp duty as on the stamp duty calculator. Checked 9 Oct 2026.') +
        next([['../stamp-duty/', 'Stamp duty in detail', 'calc-stamp-duty'], ['../tdsr/', 'Could I borrow this much?', 'calc-tdsr']]);
    },
  };

  /* ---------------- browser behaviour ---------------- */
  function mount() {
    if (typeof document === 'undefined') return;
    const box = document.querySelector('[data-calc]'); if (!box) return;
    const id = box.dataset.calc, C = root.GW_CALC, KPT = root.KPT || { track: function () {} };
    const track = (n, p) => { try { KPT.track(n, p || {}); } catch (e) { /* analytics unavailable */ } };
    const out = box.querySelector('[data-out]'), send = box.querySelector('[data-send]'), note = box.querySelector('[data-send-note]');
    const $$ = (s, el) => [].slice.call((el || box).querySelectorAll(s));
    // ---- shared details for this tab ----
    const KEY = 'gw.fin.v1';
    // V1-01: a second borrower in this tab's figures, and the two borrowers' income-weighted age (null when it can't be worked out)
    const joint = (s) => Object.keys(s).some((k) => /^borrowers\.1\./.test(k) && s[k] !== '' && s[k] !== null);
    const jointAge = (s) => {
      const list = [0, 1].map((n) => { const b = {}; ['fixed', 'variable', 'rental'].forEach((f) => { const p = C.parseMoney(s['borrowers.' + n + '.' + f] || ''); if (p.value !== undefined && !p.error) b[f] = p.value; }); const a = C.parseNum(s['borrowers.' + n + '.age'] || ''); if (a.value !== undefined && !a.error) b.age = a.value; return b; });
      if (!list.every((b) => b.age > 0 && ((b.fixed || 0) + (b.variable || 0) + (b.rental || 0)) > 0)) return null;
      const B = C.borrowers(list); return B.iwaa === null || B.bad.length ? null : ageUp(B.iwaa);
    };
    const store = { get() { try { return JSON.parse(root.sessionStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }, set(o) { try { root.sessionStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* storage blocked */ } } };
    // one shared parser (A5-02): an amount it can't read is never turned into another number
    const parseMoney = (s) => { const p = C.parseMoney(s); return p.value === undefined ? null : p.value; };
    const fmtMoney = (v) => (v === null ? '' : v.toLocaleString('en-US', { maximumFractionDigits: 2 }));
    const today = new Date(); const todayIso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $$('input[data-today]').forEach((x) => { x.value = todayIso; });
    // chips
    const chipVal = (g) => { const b = g.querySelector('[aria-pressed="true"]'); return b ? b.dataset.v : null; };
    const setChip = (g, v) => { $$('button', g).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); };
    $$('[data-t="chip"]').forEach((g) => $$('button', g).forEach((b) => b.addEventListener('click', () => { setChip(g, b.dataset.v); changed(g); })));
    // second buyer / borrower
    const rowOf = (k) => box.querySelector('[data-row="' + k + '"]');
    const showRow = (k, on) => { const r = rowOf(k); if (!r) return; r.hidden = !on; const add = box.querySelector('[data-add="' + k + '"]'); if (add) add.hidden = on; if (!on) { $$('input', r).forEach((x) => { x.value = ''; }); const s = store.get(); Object.keys(s).forEach((key) => { if (key.indexOf(k + '.') === 0) delete s[key]; }); store.set(s); } };
    $$('[data-add]').forEach((b) => b.addEventListener('click', () => { showRow(b.dataset.add, true); const f = rowOf(b.dataset.add).querySelector('input,button'); if (f) f.focus(); recalc(); }));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', () => { showRow(b.dataset.remove, false); recalc(); }));
    // conditional fields: data-when="key:v1,v2"
    const applyWhen = () => { $$('[data-when]').forEach((el) => { const [k, vs] = el.dataset.when.split(':'); const g = box.querySelector('[data-k="' + k + '"]'); const v = g ? (g.dataset.t === 'chip' ? chipVal(g) : g.value) : null; el.hidden = vs.split(',').indexOf(v) < 0; }); };
    // ---- read the form ----
    const live = (el) => { for (let p = el; p && p !== box; p = p.parentElement) if (p.hidden) return false; return true; };
    let inputErrs = [];
    const fieldName = (el) => { const f = el.closest('.gw-fld'); const sp = f && f.querySelector('span'); return sp ? sp.textContent.replace(/\s*optional\s*$/, '').trim() : ''; };
    function values() {
      const v = {}; inputErrs = [];
      const put = (path, val) => { const parts = path.split('.'); let o = v; for (let i = 0; i < parts.length - 1; i++) { const k = /^\d+$/.test(parts[i + 1]) ? [] : {}; o = o[parts[i]] = o[parts[i]] || k; } o[parts[parts.length - 1]] = val; };
      $$('[data-k]').forEach((el) => {
        if (!live(el)) return;
        const t = el.dataset.t, k = el.dataset.k; let val;
        if (t === 'money' || t === 'num') {
          const p = t === 'money' ? C.parseMoney(el.value) : C.parseNum(el.value, el.dataset.default || (/^e\.g\. ([\d.]+)$/.exec(el.placeholder || '') || [])[1]);
          el.setAttribute('aria-invalid', p.error ? 'true' : 'false');
          if (p.error) inputErrs.push({ field: k, text: (fieldName(el) ? fieldName(el) + ': ' : '') + p.error });
          val = p.value === undefined ? null : p.value;
        } else if (t === 'date') val = el.value || null; else if (t === 'check') val = el.checked; else if (t === 'chip') val = chipVal(el);
        if (val !== null && val !== undefined) put(k, val);
      });
      // types
      ['buyers', 'borrowers'].forEach((k) => { if (Array.isArray(v[k])) v[k] = v[k].filter(Boolean).map((b) => (b.owned !== undefined ? Object.assign({}, b, { owned: +b.owned }) : b)); });
      if (v.entity !== undefined) v.entity = v.entity === '1';
      if (v.loans !== undefined) v.loans = +v.loans;
      return v;
    }
    // ---- compute ----
    const FN = { mortgage: 'mortgage', 'stamp-duty': 'stampDuty', ssd: 'ssd', 'sale-proceeds': 'saleProceeds', tdsr: 'tdsr', msr: 'msr', progressive: 'progressive' };
    let last = null, lastSig = '', startedT = false, doneT = false;
    function recalc() {
      applyWhen();
      const v = values(); let r;
      if (estimated) v.cpfInterestEstimated = true;
      if (inputErrs.length) r = { ok: false, missing: [], invalid: inputErrs };
      else { try { r = C[FN[id]](v); } catch (e) { r = { ok: false, missing: [] }; } }
      if (r.ok || r.error) { out.innerHTML = RENDER[id](r, v); }
      else if (r.invalid && r.invalid.length) {
        // a value we can't use: say which and why, and show no result (A5-02, A5-06, A5-07, A5-22)
        const named = (x) => { const el = box.querySelector('[data-k="' + x.field + '"]'); const n = el && !/^(age|income|buyers)$/.test(x.field) ? fieldName(el) : ''; return n && x.text.indexOf(n + ':') !== 0 ? n + ': ' + x.text : x.text; };
        out.innerHTML = '<p class="gw-warn" role="alert">' + r.invalid.map((x) => esc(named(x))).join('<br>') + '</p>';
      } else { out.innerHTML = '<p class="gw-fine">Enter ' + (r.missing || []).map((m) => LABEL[m] || m).join(', ').replace(/, ([^,]*)$/, ' and $1') + ' to see the result.</p>'; }
      last = r.ok && !r.noTenure ? { v, r } : null; send.hidden = !last; pinRefresh(); // nothing to send when there is no loan to show (A2-08)
      const sig = JSON.stringify(v); if (sig !== lastSig) { note.innerHTML = ''; lastSig = sig; } // a copied message stays until the details change
      if (last && !doneT) { doneT = true; track('tool_completed', { tool_name: 'calc-' + id }); }
    }
    let tmr; const changed = (el) => {
      if (!startedT) { startedT = true; track('tool_started', { tool_name: 'calc-' + id }); }
      // remember shared details for this tab
      const s = store.get(), jointNl = id === 'progressive' && joint(s); $$('[data-share]').forEach((x) => { if (!live(x) || (jointNl && x.dataset.share === 'borrowers.0.age')) return; const val = x.dataset.t === 'chip' ? chipVal(x) : x.value; if (val !== null && val !== '') s[x.dataset.share] = val; else delete s[x.dataset.share]; }); store.set(s);
      clearTimeout(tmr); tmr = setTimeout(recalc, 120);
    };
    $$('input').forEach((x) => { x.addEventListener('input', () => changed(x)); x.addEventListener('change', () => changed(x)); });
    $$('input[data-t="money"]').forEach((x) => x.addEventListener('blur', () => { const v = parseMoney(x.value); if (v !== null && v <= C.LIMITS.money.max) x.value = fmtMoney(v); })); // an unreadable entry stays as typed, with its message
    // CPF accrued interest: a rough estimate only when the visitor asks for one, and only until they type their own figure
    let estimated = false;
    const est = box.querySelector('[data-estimate]');
    if (est) {
      const yrs = box.querySelector('[data-k="estYears"]'), ci = box.querySelector('[data-k="cpfInterest"]'), cp = box.querySelector('[data-k="cpfPrincipal"]');
      est.addEventListener('click', () => { box.querySelector('[data-est]').hidden = false; yrs.focus(); });
      const fill = () => { const p = parseMoney(cp.value), y = C.parseNum(yrs.value).value; if (p && y > 0 && y <= C.LIMITS.estYears.max) { ci.value = fmtMoney(Math.round(C.cpfInterestEstimate(p, y))); estimated = true; changed(ci); } };
      yrs.addEventListener('input', fill); cp.addEventListener('input', () => { if (estimated) fill(); });
      ci.addEventListener('input', () => { estimated = false; });
    }
    // ---- restore shared details ----
    const saved = store.get(); let used = false;
    // V1-01: New launch payments needs the income-weighted average age (MAS Notice 632 footnote 6). With a second borrower in this
    // tab's figures, borrower 1's age is not that: fill in the weighted age from both borrowers' ages and incomes (after the MAS
    // haircuts, exactly as How much can I borrow? works it out), or leave the field empty when it can't be worked out.
    const nlAge = id === 'progressive' && joint(saved) ? jointAge(saved) : undefined;
    $$('[data-share]').forEach((x) => {
      if (nlAge !== undefined && x.dataset.share === 'borrowers.0.age') { if (nlAge !== null) { x.value = String(nlAge); used = true; } return; }
      const val = saved[x.dataset.share]; if (val === undefined || val === null || val === '') return;
      const m = /^(buyers|borrowers)\.1\./.exec(x.dataset.share); if (m) showRow(m[1] + '.1', true);
      if (x.dataset.t === 'chip') { if (val !== x.dataset.default) used = true; setChip(x, val); } else { x.value = x.dataset.t === 'money' && parseMoney(val) !== null ? fmtMoney(parseMoney(val)) : val; used = true; }
    });
    const sv = box.querySelector('[data-saved]'); sv.hidden = !used;
    box.querySelector('[data-clear]').addEventListener('click', () => {
      $$('[data-k]').forEach((x) => { const d = x.dataset.default; if (x.dataset.t === 'chip') setChip(x, d); else if (x.dataset.t === 'check') x.checked = d === '1'; else if (x.dataset.t === 'date') x.value = x.dataset.today ? todayIso : ''; else x.value = d !== undefined ? d : ''; });
      ['buyers.1', 'borrowers.1'].forEach((k) => showRow(k, false));
      // A6-07: every figure this tab holds for the journey goes, not just the calculators' own (gw.fin.v1, gw.ctx.v1,
      // kpt.hdb.input, kpt.buy.input, kpt.handoff and any other gw.* / kpt.* key)
      // V1-03: which path the visitor is on and what they own stay (no figure), so the step strip stays, as GWN.clearJourney() does
      try { const ss = root.sessionStorage, ks = []; let keep = null; try { const c = JSON.parse(ss.getItem('gw.ctx.v1') || 'null'); if (c && (c.path || c.type)) keep = { v: 1, path: c.path || null, type: c.type || null }; } catch (x) { keep = null; }
        for (let n = 0; n < ss.length; n++) { const k = ss.key(n); if (/^(gw|kpt)\./.test(k)) ks.push(k); } ks.forEach((k) => ss.removeItem(k)); if (keep) ss.setItem('gw.ctx.v1', JSON.stringify(keep)); } catch (e) { /* storage blocked */ }
      if (bh) { bh.hidden = true; bh.textContent = ''; }
      estimated = false; const ex = box.querySelector('[data-est]'); if (ex) ex.hidden = true;
      sv.hidden = true; recalc();
    });
    // ---- the assessment ----
    const message = () => C.messages[FN[id]](last.v, last.r) + (last.v.cpfInterestEstimated ? '\n(CPF accrued interest is a rough upper estimate at 2.5% a year on the full amount.)' : '');
    box.querySelector('[data-send-wa]').addEventListener('click', () => {
      if (!last) return;
      const msg = message();
      track('whatsapp_click', { tool_name: 'calc-' + id, context: 'assessment' });
      if (msg.length > MAX_MESSAGE) { copy(msg, 'Your assessment is long, so it has been copied instead of cut short. Open WhatsApp, start a chat with Ken (+65 9090 8898) and paste it.'); return; }
      const url = waUrl(msg); let w = null;
      try { w = root.open(url, '_blank'); } catch (e) { w = null; }
      if (w) { try { w.opener = null; } catch (e) { /* ignore */ } } else root.location.href = 'https://wa.me/6590908898'; // blocked pop-up: open the chat without the prepared figures
    });
    function copy(msg, okText) {
      const show = (t, withText) => { note.innerHTML = '<p class="gw-fine">' + esc(t) + '</p>' + (withText ? '<textarea class="gw-copy" readonly rows="8">' + esc(msg) + '</textarea>' : ''); const ta = note.querySelector('textarea'); if (ta) { ta.focus(); ta.select(); } };
      const manual = () => show('Select the text below and copy it into WhatsApp to Ken (+65 9090 8898).', true);
      let done = false; const once = (f) => () => { if (!done) { done = true; f(); } };
      try {
        root.navigator.clipboard.writeText(msg).then(once(() => show(okText)), once(manual));
        setTimeout(once(manual), 1500); // some browsers never answer: show the text rather than wait
      } catch (e) { once(manual)(); }
    }
    box.querySelector('[data-send-copy]').addEventListener('click', () => { if (!last) return; track('whatsapp_click', { tool_name: 'calc-' + id, context: 'assessment-copy' }); copy(message(), 'Copied. Paste it into a WhatsApp chat with Ken (+65 9090 8898).'); });
    // ---- presets in a link (#pr, #second-home…): a starting choice only, never a figure ----
    const applyPreset = () => { const P = (PRESETS[id] || {})[(root.location.hash || '').replace('#', '')]; if (!P) return false; Object.keys(P).forEach((k) => { const g = box.querySelector('[data-k="' + k + '"]'); if (g && g.dataset.t === 'chip') setChip(g, P[k]); }); return true; };
    if (applyPreset()) { /* the link's choice wins over a choice remembered from another calculator */ }
    root.addEventListener('hashchange', () => { if (applyPreset()) recalc(); });
    // ---- Sale proceeds: the resales this tab looked up for the visitor's block, beside the price ----
    const bh = box.querySelector('[data-gw-blockhint]');
    if (bh) { try { const c = root.GWJ && root.GWJ.ctx ? root.GWJ.ctx.get() : {}, H = c.hdb; if (H && H.lo !== undefined && H.hi !== undefined && H.block) { bh.textContent = 'Blk ' + H.block + ', ' + String(H.flatType || '').toLowerCase().replace(/^(\d) room$/, '$1-room') + ': ' + H.n + ' recent resales at ' + $(H.lo) + ' – ' + $(H.hi) + '. '; bh.hidden = false; } } catch (e) { /* no context */ } }
    // ---- the pinned result (phones): the headline once there is one; it steps aside while a field has focus and when the full result is on screen ----
    pinSetup();
    recalc();
  }
  const PRESETS = {
    'stamp-duty': { pr: { 'buyers.0.res': 'PR' }, foreigner: { 'buyers.0.res': 'FR' }, 'second-home': { 'buyers.0.owned': '1' }, 'third-home': { 'buyers.0.owned': '2' }, company: { entity: '1' } },
    mortgage: { 'hdb-loan': { lender: 'hdb' } },
    tdsr: { hdb: { kind: 'hdb' } },
    msr: { 'hdb-loan': { scenario: 'hdb-loan' }, 'hdb-bank': { scenario: 'hdb-bank' }, ec: { scenario: 'ec' } },
    'sale-proceeds': { hdb: { type: 'hdb' }, private: { type: 'private' }, ec: { type: 'ec' } },
    progressive: { 'second-home': { loans: '1', 'buyers.0.owned': '1' }, company: { entity: '1' } },
    ssd: {},
  };
  let pinRefresh = () => {};
  function pinSetup() {
    const box = document.querySelector('[data-calc]'), outBox = box && box.querySelector('.gw-calc-out'), out = box && box.querySelector('[data-out]'); if (!outBox) return;
    const pin = document.createElement('div'); pin.className = 'gw-pin'; pin.hidden = true; pin.setAttribute('role', 'region'); pin.setAttribute('aria-label', 'Result summary');
    pin.innerHTML = '<div class="in"><span class="t"><small></small><b></b></span><button type="button" class="gw-pin-go">Breakdown</button></div>';
    document.body.appendChild(pin);
    const mq = root.matchMedia ? root.matchMedia('(max-width: 719px)') : { matches: false };
    let outSeen = false;
    const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && !/^(checkbox|radio|button|submit)$/.test(a.type); };
    const update = () => {
      const hd = out.querySelector('.gw-res-h'), has = !!hd && !!out.querySelector('.gw-res-h b');
      if (has) { pin.querySelector('small').textContent = hd.querySelector('span').textContent; pin.querySelector('b').textContent = hd.querySelector('b').textContent; }
      document.body.classList.toggle('gw-has-pin', !!(mq.matches && has));
      pin.hidden = !(mq.matches && has && !outSeen && !typing());
    };
    pinRefresh = update;
    if (typeof root.IntersectionObserver === 'function') new root.IntersectionObserver((es) => { outSeen = es.some((e) => e.isIntersecting); update(); }, { threshold: 0 }).observe(outBox);
    document.addEventListener('focusin', () => setTimeout(update, 0)); document.addEventListener('focusout', () => setTimeout(update, 60));
    if (mq.addEventListener) mq.addEventListener('change', update);
    pin.querySelector('button').addEventListener('click', () => { outBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }
  return { TOOLS, EXISTING, ORDER, GROUPS, PRESETS, directoryHtml, pageHtml, RENDER, MAX_MESSAGE, svg };
});
