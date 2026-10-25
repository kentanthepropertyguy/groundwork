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
  // R1.2.2: the two ways of weighting joint borrowers' ages (gross income, or income after the 30% reduction) give different ages; MAS's meaning is not confirmed
  const iwaaDiffers = (B) => B.list.length > 1 && B.iwaa !== null && B.iwaaGross !== null && ageUp(B.iwaa) !== ageUp(B.iwaaGross);

  /* ---------------- the tools ---------------- */
  const ICON = {
    mortgage: '<path d="M4 11 12 4l8 7v9H4z"/><path d="M9 20v-5h6v5"/>',
    'stamp-duty': '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
    ssd: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
    'sale-proceeds': '<path d="M4 7h16v10H4z"/><circle cx="12" cy="12" r="2.4"/><path d="M7 7v10M17 7v10" opacity=".45"/>',
    tdsr: '<path d="M4 19h16"/><path d="M6 19V11M10 19V7M14 19v-9M18 19V5"/>',
    msr: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/><path d="M4 12h16" opacity=".45"/>',
    planner: '<path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/>',
    'payment-planner': '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/><path d="M8 14h3M13 14h3M8 17h3"/>',
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
    'sale-proceeds': { path: 'sale-proceeds/', title: 'Sale proceeds', name: 'Sale proceeds', tag: 'Cash and CPF back', short: 'The cash and CPF you get back when you sell', h1: 'Sale proceeds', intro: 'From selling price to the cash in your hand and the CPF back in your account.', group: 'sell' },
    ssd: { path: 'ssd/', title: 'Seller’s Stamp Duty (SSD)', name: 'Selling within 4 years?', tag: 'SSD', short: 'Seller’s Stamp Duty on a private home', h1: 'Selling within 4 years?', intro: 'Whether Seller’s Stamp Duty (SSD) applies when you sell a private home, and how much.', group: 'sell' },
  };
  const EXISTING = {
    planner: { path: 'planner/', title: 'What can I afford?', name: 'What can I afford?', tag: 'Maximum budget', short: 'Your maximum property budget, from your cash, CPF and income', group: 'buy', icon: 'planner' },
    'payment-planner': { path: 'payment-planner/', title: 'Payment timeline', name: 'Payment timeline', tag: 'Payment dates', short: 'See when and how much you need to pay.', group: 'buy', icon: 'payment-planner' },
    'hdb-upgrade': { path: 'planner/#sell', title: 'Upgrading from HDB?', name: 'Upgrading from HDB?', tag: 'What can I afford?, set up for a flat being sold', short: 'Your budget for a private home once your flat is sold', group: 'upgrade' },   // folded into What can I afford? (24 Oct 2026); tools/hdb-upgrade/ redirects
    'what-can-i-buy': { path: 'what-can-i-buy/', title: 'What can this budget buy?', name: 'What can this budget buy?', tag: 'Search by budget, area and must-haves', short: 'Developments with recent sales within your budget', group: 'research' },
    worth: { path: '../journey/worth/', title: 'Property values & prices', name: 'Property prices & past sales', tag: 'HDB, condo and landed sales · asking price', short: 'What comparable homes sold for. Check an asking price', group: 'research', icon: 'worth' },
    research: { path: '../research/', title: 'Research a property', name: 'Research a property', tag: 'HDB, condo and landed · prices, past sales, rents', short: 'Recent sales, an asking-price check, and comparisons', group: 'research', icon: 'research' },
  };
  // Tools work out a number from your own figures. Looking up what homes sold for (Property values & prices, Research, What can this
  // budget buy?) is listed under Research in the menu and on the homepage, so each feature has one home.
  // All Tools (24 Oct 2026): four sections by the task in hand, each tool once, no badges. The HDB upgrade planner is folded into What can I afford?
  // (tools/hdb-upgrade/ redirects); "Upgrading from HDB?" is a line under the first section into the four-step journey. "Full payment planning" was the
  // Payment timeline opened at its funding check, so it is no longer a second card (search still finds the term).
  const DIRECTORY = [
    ['move', 'Plan a property move', [
      ['planner', { short: 'Find your buying budget, or check a property price.' }],
      ['payment-planner', { short: 'See when to pay and how much, and optionally check your funding.' }]],
      '<p class="gw-tg-line"><span aria-hidden="true">→</span> Upgrading from HDB? Start with your <a href="../journey/#up" data-gw-nav-to="up" data-tool="guide-up">Sell / Upgrade journey</a>: flat value, sale proceeds, then your budget in What can I afford?</p>'],
    ['fin', 'Financing', [
      ['tdsr', { short: 'Detailed bank-loan assessment under TDSR, from income and debts.' }],
      ['msr', { short: 'HDB loans, bank loans and the MSR limit for HDB flats and new ECs.' }],
      ['mortgage', { short: 'Monthly instalments and total interest.' }]]],
    ['cost', 'Buying costs', [
      ['stamp-duty', { short: 'Buyer’s Stamp Duty (BSD) and ABSD for your purchase.' }]]],
    ['sell', 'Selling', [
      ['sale-proceeds', { short: 'Estimate the cash and CPF returned when you sell.' }],
      ['ssd', { name: 'Seller’s stamp duty', short: 'Selling within 4 years? Check whether SSD applies and estimate it.' }]]],
  ];
  const ORDER = { move: ['planner', 'payment-planner'], fin: ['tdsr', 'msr', 'mortgage'], cost: ['stamp-duty'], sell: ['sale-proceeds', 'ssd'] };
  const GROUPS = DIRECTORY.map((g) => [g[0], g[1]]);

  // The tools page (mirrors tools/index.html, which is static): four task sections, every card independent (Package 3 still applies: a tool opened from here starts blank).
  function directoryHtml() {
    const tile = (id, o) => { const t = TOOLS[id] || EXISTING[id]; o = o || {}; return '<a class="gw-tl" href="' + (o.href || t.path) + '" data-tool="' + (o.tool || id) + '">' + svg(t.icon || id) + '<span class="gw-tl-t"><b>' + esc(o.name || t.name) + '</b></span><span class="gw-tl-s">' + esc(o.short || t.short) + '</span></a>'; };
    return DIRECTORY.map((g, k) => '<section class="gw-tg' + (k === 0 ? ' gw-tg-top' : '') + '" aria-labelledby="tg-' + g[0] + '"><h2 id="tg-' + g[0] + '">' + esc(g[1]) + '</h2><div class="gw-tls">' + g[2].map((x) => tile(x[0], x[1])).join('') + '</div>' + (g[3] || '') + '</section>').join('');
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
    // FE V2: one or two borrowers is the first choice, as visible as "Buying alone / With someone" in What can I afford? (the add link stays for scripts, not shown)
    const seg = '<div class="gw-q gw-fld gw-bn"><span class="l">Borrowing</span><div class="gw-chips" role="group" aria-label="Borrowing" data-bn><button type="button" class="gw-chip" data-bn-v="1" aria-pressed="true">On my own</button><button type="button" class="gw-chip" data-bn-v="2" aria-pressed="false">With a co-borrower</button></div><small>A co-borrower’s income adds to what the bank can lend. The bank then uses your income-weighted average age.</small></div>';
    return seg + row(0) + row(1) + '<button type="button" class="gw-link gw-add gw-add-x" data-add="borrowers.1" tabindex="-1" aria-hidden="true">+ Add a second borrower</button>';
  }
  const LOANS = [['0', 'None'], ['1', 'One'], ['2', 'Two or more']];
  // A2-14: MAS counts HDB loans, and applies the limits to each joint borrower
  // The loan tenure line under the tenure field: filled in as the buyer types (see tenureNote). This is the text before there is anything to say.
  const TENURE_NOTE = '<span data-tenure-note>Banks can lend for up to 35 years and usually end a loan by age 75 (lender policy, not a MAS rule). Over 30 years, or past age 65, the lower loan limit applies. Enter your age to see where that line falls.</span>';
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
      numf('tenure', 'Loan tenure', 'years', { opt: true, ph: 'longest standard', hint: TENURE_NOTE })) +
      chips('loans', 'Housing loans you still have', LOANS, { value: '0', share: 'housingLoans', hint: LOANS_HINT }),
    msr: () => chips('scenario', 'Buying', [['hdb-loan', 'HDB flat, HDB loan'], ['hdb-bank', 'HDB flat, bank loan'], ['ec', 'New EC, bank loan']], { value: 'hdb-loan' }) +
      chips('household', 'Household', [['family', 'Family'], ['extended', 'Extended family'], ['single', 'Single, 35 or older']], { value: 'family', when: 'scenario:hdb-loan', hint: '<span data-when="household:family">HDB loan income ceiling: $16,000 a month.</span><span data-when="household:extended">HDB loan income ceiling: $24,000 a month.</span><span data-when="household:single">HDB loan income ceiling: $8,000 a month. Singles must be 35 or older.</span>' }) + borrowersBlock() + grid(
      money('propertyLoans', 'Existing property loan instalments', { opt: true, ph: 'per month, 0 if none' }) +
      money('otherDebts', 'Other monthly debt repayments', { opt: true, when: 'scenario:hdb-bank,ec', ph: 'car, cards, other loans' }) +
      numf('lease', 'Remaining lease of the flat', 'years', { opt: true, when: 'scenario:hdb-loan', ph: 'e.g. 70' }) +
      numf('tenure', 'Loan tenure', 'years', { opt: true, ph: 'longest allowed', hint: TENURE_NOTE })) +
      chips('loans', 'Housing loans you still have', LOANS, { value: '0', share: 'housingLoans', when: 'scenario:hdb-bank,ec', hint: LOANS_HINT }) +
      // Package 4: a specific resale flat. Optional and closed: the loan, the minimum cash and the CPF part are on the lower of the price and HDB's valuation; the price above the valuation is cash.
      '<div data-when="scenario:hdb-loan,hdb-bank">' + more(money('price', 'Flat price', { opt: true, ph: 'the resale price agreed', hint: 'The price in your Option to Purchase.' }) + money('valuation', 'HDB’s valuation of the flat', { opt: true, ph: 'if you have it', hint: 'HDB and banks lend on the lower of the price and the valuation. What the price is above the valuation (cash over valuation) is paid in cash.' }), 'Check a specific flat') + '</div>',
  };

  // The calculator section on each tool page.
  function pageHtml(id) {
    const t = TOOLS[id];
    return '<section class="gw-calc" data-calc="' + id + '"><div class="gw-calc-in" aria-label="Your details">' + FORMS[id]() +
      '<p class="gw-fine gw-saved" data-saved hidden>Some details are filled in from your other calculations in this tab. <button type="button" class="gw-link" data-clear>Clear them</button> (this clears your figures from every tool in this tab).</p></div>' +
      '<div class="gw-calc-out"><div data-out aria-live="polite"><p class="gw-fine">Enter your details to see the result.</p></div>' +
      (id === 'msr' ? '<div class="gw-sched" data-sched-host></div>' : '') +
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
  // Tenure left blank: say which tenure and loan limit the figure uses and, when a longer one is allowed, what it would give, so the buyer can compare without searching.
  const tenureAssumed = (t, ltv, longer, what) => {
    if (!t || !t.defaulted || !(t.years >= 1)) return '';
    if (t.noStd) return 'Using ' + t.years + ' years, the longest a bank usually lends at this age. No tenure keeps the standard loan limit here, so the lower ' + pc(ltv) + ' limit applies.';
    return longer ? 'Using ' + t.years + ' years, the longest that keeps the ' + pc(ltv) + ' loan limit. ' + longer.years + ' years is allowed at the lower ' + pc(longer.ltv) + ' limit: ' + what(longer) + ' Type it under Loan tenure to use it.' : '';
  };
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
  // V2.1: before the first result, the panel shows the result's own lines with a dash where each figure will go (never an example figure)
  const PREVIEW = {
    'stamp-duty': ['Total stamp duty', [['Buyer’s Stamp Duty (BSD)', '$'], ['ABSD, for the buyers you choose', '$']]],
    mortgage: ['Monthly instalment', [['Loan repaid', '$'], ['Total interest', '$'], ['Income a bank looks for', '$']]],
    tdsr: ['Indicative maximum loan', [['Left for the new loan each month', '$'], ['Price this loan supports', '$']]],
    msr: ['Indicative maximum loan', [['Left for the new loan each month', '$'], ['Price this loan supports', '$']]],
    'sale-proceeds': ['Cash in hand after costs', [['CPF back to your account', '$'], ['Selling costs', '$']]],
    ssd: ['Seller’s Stamp Duty', [['Held for', ''], ['No SSD if you sell on or after', '']]],
  };
  const previewHtml = (id, need) => { const P = PREVIEW[id]; if (!P) return '<p class="gw-fine">' + (need ? 'Enter ' + esc(need) + ' to see the result.' : 'Enter your details to see the result.') + '</p>';
    return '<div class="gw-ready" data-ready aria-label="Your result will appear here"><p class="gw-ready-k">' + esc(P[0]) + '</p><p class="gw-ready-v" aria-hidden="true">$ —</p>' +
      '<ul class="gw-ready-rows">' + P[1].map((r) => '<li><span>' + esc(r[0]) + '</span><b aria-hidden="true">' + (r[1] ? r[1] + ' ' : '') + '—</b></li>').join('') + '</ul>' +
      '<p class="gw-ready-n">' + (need ? 'Enter ' + esc(need) + ' to see your figures.' : 'Enter your details to see your figures.') + '</p></div>'; };
  const LABEL = { loan: 'loan amount', ratePct: 'interest rate', years: 'loan tenure', price: 'price', buyers: 'buyer details', bought: 'date you bought', sold: 'date you sell', income: 'income', age: 'age' };

  // SSD: the years after purchase on one line, the rate in each, and where the sale date falls.
  function ssdTrack(r) {
    const reg = r.regime; if (!reg || !reg.rates || r.heldDays === undefined) return '';
    const yrs = reg.years, span = yrs + 1, held = r.heldDays / 365.25, at = Math.min(held, span) / span * 100, band = r.band;
    return '<figure class="gw-ssdt"><figcaption>Years after you bought, and the rate in each</figcaption><div class="trk" aria-hidden="true">' + reg.rates.map((x, i) => '<span' + (band === i ? ' class="on"' : '') + '><b>' + pc(x) + '</b><small>Year ' + (i + 1) + '</small></span>').join('') +
      '<span class="free' + (band === -1 ? ' on' : '') + '"><b>No SSD</b><small>From year ' + (yrs + 1) + '</small></span><i style="left:' + at.toFixed(1) + '%"></i></div><p class="gw-fine">The marker is your sale date: ' + esc(r.heldText) + ' after you bought' + (held > span ? ', beyond the SSD period' : '') + '.</p></figure>';
  }
  // Package 4: what a specific resale flat needs (C.msr's `flat`): the loan limit and the minimum cash are on the LOWER of the price and the valuation; the price above the valuation is cash only.
  function flatBlock(r) {
    const f = r.flat; if (!f) return '';
    const hdb = r.scenario === 'hdb-loan';
    const cov = f.cov > 0.5, above = f.dutyBase > f.price + 0.5, cashRow = f.cashOnly > 0.5;
    // an HDB loan needs no minimum cash (CPF OA can pay the whole downpayment); a bank loan needs its minimum cash. Cash over valuation is cash in both.
    const why = hdb
      ? (cov ? 'Cash only is the ' + $(f.cov) + ' above the valuation (cash over valuation). An HDB loan needs no minimum cash, so your CPF OA can pay the rest.' : 'An HDB loan needs no minimum cash: your CPF OA can pay the whole amount beyond the loan.')
      : 'Cash only is the ' + pc(f.minCashPct) + ' minimum cash (' + $(f.cashMin) + ')' + (cov ? ' plus the ' + $(f.cov) + ' above the valuation (cash over valuation).' : '.');
    return '<div class="gw-flat"><p class="gw-flat-h">' + (cov ? 'At ' + $(f.price) + ', with a valuation of ' + $(f.valuation) : 'At ' + $(f.price) + (f.valuation ? ', valuation ' + $(f.valuation) : '')) + '</p>' + rows([
      ['Loan limit on the ' + (cov ? 'valuation' : 'price'), $(f.loanLimit) + ' (' + pc(f.ltv, f.ltv === 0.75 || !hdb ? 0 : 1) + ' of ' + $(f.base) + ')'],
      [eligFlag(r) === 'age' ? 'Theoretical loan (singles age requirement not met)' : eligFlag(r) === 'ceiling' ? 'Theoretical loan (income above the HDB ceiling)' : 'Loan you could take', $(f.loan) + (f.incomeLimited ? ' (your income is the limit)' : ''), 'tot'],
      ['To pay beyond the loan', $(f.down)],
      cashRow ? ['Of which cash only', $(f.cashOnly)] : null,
      ['Of which cash or CPF OA', $(f.cashOrCpf)]].filter(Boolean)) +
      notes([why, 'The option and exercise fees are paid in cash when you sign. They are part of this amount, not extra.', above ? 'The valuation is above the price, so the loan is worked on the price. Stamp duty is on the higher, ' + $(f.dutyBase) + '.' : '', 'Stamp duty, legal fees and renovation are not included.'].filter(Boolean)) + '</div>';
  }
  // The HDB loan limit page: the calculator's notes in fewer words (the same facts; the full text stays in the WhatsApp message and the assumptions).
  const HH_NAME = { family: 'families', extended: 'extended families', single: 'singles' };
  // The calculator's own eligibility check (note id 'ceiling'): household income above the HDB loan ceiling for the household chosen. When it fires, that is the result;
  // the loan the income would otherwise support stays on the page, labelled theoretical. Nothing is recalculated here.
  // 'age': Single selected but the applicant is under 35 (note id 'single-age'); 'ceiling': income above the ceiling (note id 'ceiling'). Age leads if both apply.
  const eligFlag = (r) => {
    if (!(r && r.scenario === 'hdb-loan')) return '';
    const ns = r.notes || [];
    return ns.some((n) => n.id === 'single-age') ? 'age' : (r.ceiling && ns.some((n) => n.id === 'ceiling') ? 'ceiling' : '');
  };
  const ceilingOver = (r) => !!eligFlag(r);
  const msrNote = (r) => (n) => {
    if (n.id === 'ceiling' && r.ceiling) return 'Household income is above the $' + r.ceiling.toLocaleString('en-US') + ' a month HDB loan ceiling for ' + (HH_NAME[r.household] || 'your household') + '. You may need a bank loan instead.';
    if (n.id === 'lease-unknown') return 'Add the remaining lease. If it won’t last until the youngest applicant is 95, HDB lends less than 75% of the price.';
    if (n.id === 'commitments') return 'HDB also looks at your other loans, so it may lend less than this.';
    return n;
  };
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
        next([['../tdsr/', 'How much could I borrow?', 'calc-tdsr'], ['../payment-planner/', 'Plan your payments', 'payment-planner']]);
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
        next([['../mortgage/', 'Monthly instalment', 'calc-mortgage'], ['../payment-planner/', 'Plan your payments', 'payment-planner']]);
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
        // "What can I buy next?" goes to the Planner with this sale carried over (see sellHandoff); the specialist tools stay one tap away
        next([['../planner/#sell', 'What can I buy next?', 'planner-sell', true]].concat(r.type === 'hdb' ? [['../hdb-upgrade/', 'HDB upgrade planner', 'hdb-upgrade']] : [['../ssd/', 'Seller’s Stamp Duty in detail', 'calc-ssd'], ['../tdsr/', 'How much could I borrow next?', 'calc-tdsr']], [['../payment-planner/', 'Buying a new launch next?', 'payment-planner']]));
    },
    tdsr(r) {
      if (r.noTenure) return r.cause === 'maturity' ? '<p class="gw-warn">Banks usually end a loan by age 75, so no bank loan tenure fits at this age.</p>' : '<p class="gw-warn">The standard loan tenure ends at age 65, so at this age there is none. Enter a loan tenure to see the limit: a loan that runs past 65 takes the lower loan limit.</p>';
      const t = r.tenure, hm = r.msrApplies;
      return head('Indicative maximum loan', $(r.maxLoan), 'over ' + t.years + ' years, tested at ' + pc(r.rate) + (hm ? ', within ' + r.binding.toUpperCase() + ' (' + (r.binding === 'msr' ? '30%' : '55%') + ')' : '')) +
        stack('Your monthly income, as banks count it', [['Your current debts', Math.min(r.debts, r.cap), 'c5'], ['Left for the new loan', r.forNew, 'c4'], hm ? ['Within 55% but over the MSR limit', Math.max(0, r.cap - Math.min(r.debts, r.cap) - r.forNew), 'c3'] : null, ['Above the 55% limit', r.B.assessable - r.cap, 'c6']], ' a month') +
        rows([['Price this loan supports', $(r.priceAtLtv) + ' (' + pc(r.ltv) + ' loan)']]) +
        (r.overLimit ? '<p class="gw-warn">Your existing debts already use the whole TDSR limit.</p>' : '') +
        // A2-01: an HDB flat with a bank loan is held to MSR 30% as well as TDSR 55%; the lower one sets the loan
        notes([hm ? 'For an HDB flat, the loan must fit both TDSR 55% and MSR 30% of income. ' + (r.binding === 'msr' ? 'MSR is the lower one here, so it sets the loan.' : 'TDSR is the lower one here, so it sets the loan.') : '', tenureAssumed(t, r.ltv, r.longer, (l) => 'maximum loan ' + $(l.maxLoan) + '.'), t.capped && t.cappedBy === 'age' ? 'Tenure capped at ' + t.allowed + ' years: banks usually end a loan by age ' + t.maturityAge + ' (lender policy, not a MAS rule).' : ''].filter(Boolean)) +
        work(rows([['Income counted (after haircuts)', $(r.B.assessable) + ' a month'], ['TDSR limit, 55%', $(r.cap) + ' a month'], ['Less your monthly debts', '−' + $(r.debts)], hm ? ['Left under TDSR', $(r.forNewTdsr) + ' a month'] : null, hm ? ['MSR limit, 30%, less property loans', $(r.forNewMsr) + ' a month'] : null, ['Left for the new loan', $(r.forNew) + ' a month' + (hm ? ' (' + r.binding.toUpperCase() + ' is the limit)' : ''), 'tot'],
          ['Income-weighted age', ageUp(r.B.iwaa) + ' years' + (iwaaDiffers(r.B) ? ' (unverified)' : '')], iwaaDiffers(r.B) ? ['Weighted by gross income instead', ageUp(r.B.iwaaGross) + ' years'] : null, ['Standard tenure for your age', t.std + ' years (up to ' + t.max + ' with a lower loan limit)', 'w'], ['Loan limit (LTV) used', pc(r.ltv) + ', at least ' + pc(r.minCash) + ' in cash', 'w']])) +
        sources([r.B.haircut > 0 ? 'Banks count only 70% of variable and rental income.' : '', r.B.list.length > 1 ? (iwaaDiffers(r.B) ? 'Joint borrowers: the age is weighted here by the income banks count, after the 30% reduction (' + ageUp(r.B.iwaa) + ' years). Weighted by gross income it would be ' + ageUp(r.B.iwaaGross) + ' years. MAS’s wording does not settle which is meant, so this joint-borrower result is unverified: ask your bank which age it uses.' : 'Joint borrowers’ age is weighted by each borrower’s income. With no variable or rental income, weighting by gross income or by counted income gives the same age.') : '', t.capped && t.cappedBy === 'max' ? 'Tenure capped at ' + t.max + ' years, the MAS maximum here.' : '', t.lower ? 'Your tenure is past the standard limit, so the lower loan limit applies.' : '', 'Income from financial assets, which banks can also count, isn’t included here.', 'Banks test the new loan at 4% or their own higher rate. They decide the final amount.'].filter(Boolean),
          'Rules: MAS Notice 645 (TDSR 55%, MSR 30% for HDB flats, 4% medium-term rate, 30% haircut on variable and rental income); MAS Notice 632 (LTV and tenure limits). Checked 9 Oct 2026.') +
        next(r.msrApplies ? [['../msr/', 'Check the MSR limit', 'calc-msr'], ['../mortgage/', 'Monthly instalment', 'calc-mortgage']] : [['../../tools/what-can-i-buy/', 'What can this budget buy?', 'what-can-i-buy'], ['../mortgage/', 'Monthly instalment', 'calc-mortgage']]);
    },
    msr(r) {
      // A2-08 / A5-05: the message names what leaves no tenure
      if (!r.tenure || !(r.tenure.years >= 1)) {
        if (r.cause === 'lease') return '<p class="gw-warn">With this remaining lease, HDB’s rules leave no tenure for a new loan: an HDB loan runs for at most the remaining lease minus 20 years.</p>' + notes(r.notes);
        if (r.scenario === 'hdb-loan') return '<p class="gw-warn">At this average age, HDB’s rules leave no tenure for a new loan: an HDB loan must end by age 65.</p>' + notes(r.notes);
        if (r.cause === 'maturity') return '<p class="gw-warn">Banks usually end a loan by age 75, so no bank loan tenure fits at this age.</p>';
        if (r.cause === 'age') return '<p class="gw-warn">The standard loan tenure ends at age 65, so at this age the rules leave no tenure for a new loan unless you choose one. Enter a loan tenure to see the limit: a loan that runs past 65 takes the lower loan limit.</p>';
        return '<p class="gw-warn">The loan rules leave no tenure for a new loan with these details.</p>';
      }
      const t = r.tenure, hdb = r.scenario === 'hdb-loan', over = ceilingOver(r);
      const flag = eligFlag(r), minAge = (root.GW_RULES && root.GW_RULES.hdbSingleMinAge) || 35;
      return (flag === 'age' ? head('HDB purchase eligibility', 'Singles age requirement not met', 'Singles buying an HDB flat under the Single Singapore Citizen scheme must be ' + minAge + ' or older, and the age entered is ' + r.B.youngest + '. This limits the purchase itself, so a bank loan does not change it. Other schemes may apply: confirm with an HFE letter.') +
        rows([['Theoretical maximum HDB loan, if the requirements were met', $(r.maxLoan) + ' over ' + t.years + ' years, tested at ' + pc(r.rate), 'w']])
        : flag === 'ceiling' ? head('HDB loan eligibility', 'Income above the ceiling', 'Household income ' + $(r.B.gross) + ' a month; the HDB loan ceiling for ' + (HH_NAME[r.household] || 'your household') + ' is ' + $(r.ceiling) + '. You may need a bank loan instead.') +
        rows([['Theoretical maximum loan, if the ceiling were met', $(r.maxLoan) + ' over ' + t.years + ' years, tested at ' + pc(r.rate), 'w']])
        : head('Indicative maximum loan', $(r.maxLoan), 'over ' + t.years + ' years, tested at ' + pc(r.rate))) +
        stack('Your monthly income, as ' + (hdb ? 'HDB' : 'banks') + ' count it', [['Existing property loans', Math.min(r.prop || 0, r.msrCap), 'c5'], ['Left for the new loan', r.forNew, 'c4'], !hdb ? ['Within 30% but over the TDSR limit', Math.max(0, r.msrCap - (r.prop || 0) - r.forNew), 'c3'] : null, ['Above the 30% limit', (hdb ? r.B.gross : r.B.assessable) - r.msrCap, 'c6']], ' a month') +
        // V1-06: when the lease leaves a very low loan limit, the "price" it implies is misleading, so say the limit instead
        rows([r.ltv < 0.5 ? ['Loan limit with this lease', 'Only ' + pc(r.ltv, 1) + ' of the price can be borrowed with this lease'] : [over ? 'Price that theoretical loan supports' : 'Price this loan supports', $(r.priceAtLtv) + ' (' + pc(r.ltv) + ' loan)']]) +
        flatBlock(r) +
        notes((r.notes || []).filter((n) => !(flag === 'ceiling' && n.id === 'ceiling') && !(flag === 'age' && n.id === 'single-age')).map(msrNote(r)).concat([tenureAssumed(r.tenure, r.ltv, r.longer, (l) => 'maximum loan ' + $(l.maxLoan) + '.')].filter(Boolean))) +
        work(rows([['Income counted', $(hdb ? r.B.gross : r.B.assessable) + ' a month'], ['MSR limit, 30%', $(r.msrCap) + ' a month'], r.prop ? ['Less existing property loans', '−' + $(r.prop)] : null,
          !hdb ? ['TDSR limit, 55%, less all debts', $(r.forNewTdsr) + ' a month'] : null, ['Left for the new loan', $(r.forNew) + ' a month' + (!hdb ? ' (' + r.binding.toUpperCase() + ' is the limit)' : ''), 'tot'],
          hdb ? ['Tenure', t.years + ' years (the shortest of 25, 65 minus average age' + (t.lease ? ', lease minus 20' : '') + ')', 'w'] : ['Tenure', t.years + ' years (standard up to ' + t.std + ')'],
          ['Loan limit (LTV)', pc(r.ltv, r.ltv === 0.75 || !hdb ? 0 : 1)]])) +
        sources([hdb ? 'HDB tests the loan at 3% or its loan rate, if higher (2.6% a year, valid to 31 Dec 2026). You need an HDB Flat Eligibility (HFE) letter, and everyone in the HFE application counts towards the income ceiling. HDB decides the loan.' : 'Banks test the loan at 4% or their own higher rate, against both MSR and TDSR. They decide the final amount.'],
          'Rules: MAS Notice 645 (MSR 30%, TDSR 55%, at 4%); HDB loan: 3% floor, 75% LTV pro-rated if the lease doesn’t cover the youngest applicant to 95, 25 years, income ceilings from 24 Aug 2026 (HDB, MND). Checked 9 Oct 2026.' + (r.flat ? ' Valuation: the loan is on the lower of price and valuation; an HDB loan needs no minimum cash, a bank loan does; cash over valuation is cash (HDB, CPF Board). Checked 24 Oct 2026.' : '')) +
        next([['../tdsr/', 'TDSR in detail', 'calc-tdsr'], ['../mortgage/', 'Monthly instalment', 'calc-mortgage']]);
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
    const store = { get() { try { return JSON.parse(root.sessionStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }, set(o) { try { root.sessionStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* storage blocked */ } } };
    // Journey or standalone (Package 3). Opened from a journey (address ends ?j=1, set by the link; gw-nav.js) the calculator shares figures with the journey, as before.
    // Opened any other way (Tools, search, a typed address) it is standalone: it starts fresh, takes nothing from another tool and gives nothing to one. Its own entries
    // (gw.pro.<tool>.v1, this tab) come back only when this same page is refreshed or returned to. "New calculation" clears just this calculator.
    const journey = /[?&]j=1(&|$)/.test(root.location.search);
    const again = (() => { try { const n = root.performance.getEntriesByType('navigation')[0]; return !!n && (n.type === 'reload' || n.type === 'back_forward'); } catch (e) { return false; } })();
    const OWNKEY = 'gw.pro.' + id + '.v1';
    const own = { get() { try { return JSON.parse(root.sessionStorage.getItem(OWNKEY) || 'null'); } catch (e) { return null; } }, set(o) { try { root.sessionStorage.setItem(OWNKEY, JSON.stringify(o)); } catch (e) { /* storage blocked */ } }, remove() { try { root.sessionStorage.removeItem(OWNKEY); } catch (e) { /* storage blocked */ } } };
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
    const showRow = (k, on) => { const r = rowOf(k); if (!r) return; r.hidden = !on; const add = box.querySelector('[data-add="' + k + '"]'); if (add) add.hidden = on; if (k === 'borrowers.1') { const g = box.querySelector('[data-bn]'); if (g) $$('button', g).forEach((x) => x.setAttribute('aria-pressed', String((x.dataset.bnV === '2') === on))); } if (!on) { $$('input', r).forEach((x) => { x.value = ''; }); if (journey) { const s = store.get(); Object.keys(s).forEach((key) => { if (key.indexOf(k + '.') === 0) delete s[key]; }); store.set(s); } } };
    $$('[data-add]').forEach((b) => b.addEventListener('click', () => { showRow(b.dataset.add, true); const f = rowOf(b.dataset.add).querySelector('input,button'); if (f) f.focus(); recalc(); }));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', () => { showRow(b.dataset.remove, false); recalc(); }));
    { const g = box.querySelector('[data-bn]'); if (g) $$('button', g).forEach((b) => b.addEventListener('click', () => { const two = b.dataset.bnV === '2', r1 = rowOf('borrowers.1'); if (!r1 || two === !r1.hidden) return; showRow('borrowers.1', two); if (two) { const f = r1.querySelector('input'); if (f) f.focus(); } recalc(); })); }
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
    // ---- the tenure line under the tenure field (TDSR, MSR, New launch payments) ----
    function paintTenure(v, r) {
      const el = box.querySelector('[data-tenure-note]'); if (!el) return;
      const fld = box.querySelector('[data-k="tenure"],[data-k="years"]'), adj = fld && +fld.dataset.adjustedFrom > 0 ? +fld.dataset.adjustedFrom : 0;
      const chosen = C.parseNum((fld && fld.value) || '').value || 0, ok = r && r.ok;
      const LA = C.LIMITS.age, okAge = (a) => typeof a === 'number' && a >= LA.min && a <= LA.max;
      const ofAge = (a, extra) => { const t = C.bankTenure('private', a); return Object.assign({ age: a, std: t.std, allowed: t.allowed, chosen: chosen > 0 ? chosen : 0 }, extra || {}); };
      let o = { chosen: chosen > 0 ? chosen : 0 };
      if (id === 'msr' && v.scenario === 'hdb-loan') {
        o.hdbLoan = true; if (ok && r.tenure && r.tenure.years >= 1) { o.years = r.tenure.years; o.max = r.tenure.max; }
      } else if (ok && r.B && r.tenure && r.tenure.std !== undefined) {
        o = { age: ageUp(r.B.iwaaUse), std: r.tenure.std, allowed: r.tenure.allowed, chosen: o.chosen, joint: r.B.list && r.B.list.length > 1, max: r.tenure.max, hdb: r.kind === 'hdb' || r.scenario === 'hdb-bank' };
      } else {
        const b0 = Array.isArray(v.borrowers) && v.borrowers.length === 1 ? v.borrowers[0] : null;
        if (b0 && okAge(b0.age)) o = ofAge(b0.age);
      }
      if (adj) o.adjustedFrom = adj;
      if (typeof v.loans === 'number') o.loans = v.loans;
      let t = C.tenureNote(o); if (o.hdbLoan) t = t.replace(' A shorter tenure is allowed.', ''); if (el.textContent !== t) el.textContent = t;
    }
    // New launch payments, TDSR and MSR: the loan-tenure field (the ones with a line under them) shows the tenure used (gw-money.js)
    const tenureEl = box.querySelector('[data-tenure-note]') && box.querySelector('[data-k="tenure"],[data-k="years"]');
    let tenureFld = null;
    // the most the age allows, from the age alone (no income or price needed): the same limit the calculation applies (C.tenureLimit)
    function tenureLimitNow() {
      try {
        const v = values(); let L = null;
        if (id === 'msr') L = C.tenureLimit({ kind: v.scenario === 'hdb-bank' ? 'hdb' : v.scenario === 'hdb-loan' ? 'hdb-loan' : 'private', borrowers: v.borrowers, lease: v.lease });
        else L = C.tenureLimit({ kind: v.kind === 'hdb' ? 'hdb' : 'private', borrowers: v.borrowers });
        return L ? L.allowed : 0;
      } catch (e) { return 0; }
    }
    const FN = { mortgage: 'mortgage', 'stamp-duty': 'stampDuty', ssd: 'ssd', 'sale-proceeds': 'saleProceeds', tdsr: 'tdsr', msr: 'msr' };
    let last = null, lastSig = '', startedT = false, doneT = false, afterCalc = () => {};
    // Sale proceeds -> Planner ("What can I buy next?"): the sale figures wait in this tab only (gw.sell.v1) until the Planner is opened from that button. Only what was entered goes: a blank loan or CPF refund
    // stays blank there (the Planner then asks for it, as it does for anyone). The cash and CPF are carried as the Planner's own "your own figures" ONLY when the Planner's usual estimate would give different
    // numbers (your own commission, legal fees, early-repayment penalty or a Seller's Stamp Duty). Otherwise the Planner works them out itself from the same engine, so the two pages cannot disagree.
    function sellHandoff(v, r) {
      const ss = (() => { try { return root.sessionStorage; } catch (e) { return null; } })(); if (!ss) return;
      try {
        if (!r || !r.ok || !(typeof v.price === 'number' && v.price > 0)) { ss.removeItem('gw.sell.v1'); return; }
        const h = { v: 1, type: v.type === 'hdb' ? 'hdb' : 'private', price: v.price };
        if (typeof v.loan === 'number') h.loan = v.loan;
        const hasCpf = typeof v.cpfPrincipal === 'number' || typeof v.cpfInterest === 'number';
        if (hasCpf) { h.cpfRefund = r.cpfRefund; if (v.cpfInterestEstimated) h.interestEstimated = true; }
        if (h.type === 'private' && !r.ssdMissing && !(r.costs && r.costs.ssd > 0)) h.held = true;
        if (typeof h.loan === 'number' && hasCpf && r.netCash >= 0 && !r.loanShortfall) {
          const e = C.saleEstimate({ type: h.type, price: h.price, loan: h.loan, cpfRefund: h.cpfRefund, heldOver4: h.type === 'private' ? !!h.held : undefined }, { owner55: !!r.owner55, today: todayIso });
          const cpfNow = r.owner55 ? 0 : r.cpfRefund;
          if (!e.counted || Math.abs(e.cash - r.netCash) >= 1 || Math.abs(e.cpf - cpfNow) >= 1) { h.overrideCash = Math.round(r.netCash); h.overrideCpf = Math.round(r.cpfRefund); }
        }
        ss.setItem('gw.sell.v1', JSON.stringify(h));
      } catch (e) { /* storage blocked: the Planner then asks for the sale itself */ }
    }
    // The payment schedule for the flat or EC being assessed (gw-paylist.js): the type and a price are all it needs. The type follows "Buying" above; a resale flat or a new flat (BTO) is chosen inside it.
    // The flat price from "Check a specific flat" starts it until a price is typed in the schedule.
    const SCHED = id === 'msr' && root.GW_PAYLIST && box.querySelector('[data-sched-host]') ? root.GW_PAYLIST.mount(box.querySelector('[data-sched-host]'), { key: 'msr', base: '../', title: 'Payment schedule', em: 'every payment, its amount and when' }) : null;
    let schedSc = null;
    function syncSched(v) {
      if (!SCHED) return; const sc = v.scenario || 'hdb-loan';
      if (sc !== schedSc) { schedSc = sc; if (sc === 'ec') SCHED.setKinds(['ec']); else SCHED.setKinds(['hdb-resale', 'hdb-bto'], { loan: sc === 'hdb-bank' ? 'bank' : 'hdb' }); }
      if (sc !== 'ec' && typeof v.price === 'number' && v.price > 0) SCHED.suggest(v.price);
    }
    function recalc() {
      applyWhen();
      const v = values(); let r;
      syncSched(v);
      if (estimated) v.cpfInterestEstimated = true;
      if (inputErrs.length) r = { ok: false, missing: [], invalid: inputErrs };
      else { try { r = C[FN[id]](v); } catch (e) { r = { ok: false, missing: [] }; } }
      // the tenure field shows the tenure the calculation used: a longer one typed is replaced by it once the field is not being typed in
      if (tenureFld) {
        const applied = r.ok ? (r.tenure && r.tenure.years) : 0;
        if (tenureFld.settle(applied)) { recalc(); return; }
        tenureFld.hint(applied);
      }
      if (r.ok || r.error) { out.innerHTML = RENDER[id](r, v); }
      else if (r.invalid && r.invalid.length) {
        // a value we can't use: say which and why, and show no result (A5-02, A5-06, A5-07, A5-22)
        const named = (x) => { const el = box.querySelector('[data-k="' + x.field + '"]'); const n = el && !/^(age|income|buyers)$/.test(x.field) ? fieldName(el) : ''; return n && x.text.indexOf(n + ':') !== 0 ? n + ': ' + x.text : x.text; };
        out.innerHTML = '<p class="gw-warn" role="alert">' + r.invalid.map((x) => esc(named(x))).join('<br>') + '</p>';
      } else {
        // V2.1: before a result, the panel previews the result's lines (a dash for each figure) and says what is still needed
        const need = (r.missing || []).map((m) => LABEL[m] || m).join(', ').replace(/, ([^,]*)$/, ' and $1');
        out.innerHTML = previewHtml(id, need);
      }
      paintTenure(v, r);
      last = r.ok && !r.noTenure ? { v, r } : null; send.hidden = !last; pinRefresh(); // nothing to send when there is no loan to show (A2-08)
      afterCalc();
      const sig = JSON.stringify(v); if (sig !== lastSig) { note.innerHTML = ''; lastSig = sig; } // a copied message stays until the details change
      if (last && !doneT) { doneT = true; track('tool_completed', { tool_name: 'calc-' + id }); }
    }
    let tmr; const changed = (el) => {
      if (!startedT) { startedT = true; track('tool_started', { tool_name: 'calc-' + id }); }
      // remember shared details for this tab
      if (journey) { const s = store.get(); $$('[data-share]').forEach((x) => { if (!live(x)) return; const val = x.dataset.t === 'chip' ? chipVal(x) : x.value; if (val !== null && val !== '') s[x.dataset.share] = val; else delete s[x.dataset.share]; }); store.set(s); }
      clearTimeout(tmr); tmr = setTimeout(recalc, 120);
    };
    // money fields: commas appear as you type, the same behaviour as the Payment Timeline (gw-money.js)
    if (root.GW_MONEY) { $$('input[data-t="money"]').forEach((x) => root.GW_MONEY.wire(x, { parse: parseMoney, max: C.LIMITS.money.max })); $$('input[data-t="num"]').forEach((x) => root.GW_MONEY.selectOnFocus(x)); }
    $$('input').forEach((x) => { x.addEventListener('input', () => changed(x)); x.addEventListener('change', () => changed(x)); });
    if (tenureEl && root.GW_MONEY && root.GW_MONEY.tenureField) tenureFld = root.GW_MONEY.tenureField(tenureEl, { read: () => C.parseNum(tenureEl.value).value || null, max: () => C.LIMITS.tenure.max, limit: tenureLimitNow, recalc: () => { clearTimeout(tmr); recalc(); } });
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
    if (journey) $$('[data-share]').forEach((x) => {
      const val = saved[x.dataset.share]; if (val === undefined || val === null || val === '') return;
      const m = /^(buyers|borrowers)\.1\./.exec(x.dataset.share); if (m) showRow(m[1] + '.1', true);
      if (x.dataset.t === 'chip') { if (val !== x.dataset.default) used = true; setChip(x, val); } else { x.value = x.dataset.t === 'money' && parseMoney(val) !== null ? fmtMoney(parseMoney(val)) : val; used = true; }
    });
    // this calculator's own entries: every field, for a refresh or a return to this page (never for another tool)
    const fieldVal = (x) => (x.dataset.t === 'chip' ? (chipVal(x) || '') : x.dataset.t === 'check' ? (x.checked ? '1' : '0') : x.value);
    const saveOwn = () => { const o = {}; $$('[data-k]').forEach((x) => { o[x.dataset.k] = fieldVal(x); }); if (estimated) o.__est = 1; own.set(o); };
    const dirty = () => $$('[data-k]').some((x) => { const t = x.dataset.t, d = x.dataset.default; if (t === 'chip') return (chipVal(x) || '') !== (d || ''); if (t === 'check') return (x.checked ? '1' : '0') !== (d === '1' ? '1' : '0'); if (t === 'date') return x.value !== (x.dataset.today ? todayIso : ''); return x.value !== (d !== undefined ? d : ''); });
    const restoreOwn = (o) => {
      $$('[data-k]').forEach((x) => {
        const k = x.dataset.k; if (!Object.prototype.hasOwnProperty.call(o, k)) return; const val = o[k], t = x.dataset.t;
        const m = /^(buyers|borrowers)\.1\./.exec(k); if (m && val !== '' && val !== x.dataset.default) showRow(m[1] + '.1', true);
        if (t === 'chip') { if (val !== '') setChip(x, val); } else if (t === 'check') x.checked = val === '1'; else x.value = t === 'money' && parseMoney(val) !== null ? fmtMoney(parseMoney(val)) : val;
      });
      if (o.__est) { estimated = true; }
    };
    if (again) { const o = own.get(); if (o) restoreOwn(o); } else if (!journey) own.remove();
    const resetFields = () => {
      $$('[data-k]').forEach((x) => { const d = x.dataset.default; if (x.dataset.t === 'chip') setChip(x, d); else if (x.dataset.t === 'check') x.checked = d === '1'; else if (x.dataset.t === 'date') x.value = x.dataset.today ? todayIso : ''; else x.value = d !== undefined ? d : ''; });
      ['buyers.1', 'borrowers.1'].forEach((k) => showRow(k, false));
    };
    const sv = box.querySelector('[data-saved]'); sv.hidden = !used;
    if (!journey) {
      // standalone: one plain action, "New calculation", for this calculator only
      sv.innerHTML = '<button type="button" class="gw-link" data-new>New calculation</button> <span>Clears this calculator only.</span>'; sv.hidden = !dirty();
      sv.querySelector('[data-new]').addEventListener('click', () => { resetFields(); own.remove(); estimated = false; const ex = box.querySelector('[data-est]'); if (ex) ex.hidden = true; if (bh) { bh.hidden = true; bh.textContent = ''; } sv.hidden = true; reuseOffer(); recalc(); });
    }
    // explicit, optional reuse: only when this tab's journey holds figures this calculator asks for, and only into empty fields
    const reuseNames = { age: 'age', fixed: 'income', variable: 'income', rental: 'income', buyPrice: 'price', sellPrice: 'price', ssdPrice: 'price', loan: 'loan', outstandingLoan: 'loan', debts: 'debts', housingLoans: 'home loans', cpfOa: 'CPF', cpfPrincipal: 'CPF', cpfInterest: 'CPF', cash: 'cash', res: 'residency', owned: 'homes owned', homeType: 'home type' };
    const reuseVal = (x) => saved[x.dataset.share];
    const reusable = () => (journey ? [] : $$('[data-share]').filter((x) => { const v = reuseVal(x); if (v === undefined || v === null || v === '') return false; return x.dataset.t === 'chip' ? (chipVal(x) || '') === (x.dataset.default || '') && v !== (x.dataset.default || '') : x.value === '' || x.value === x.dataset.default; }));
    const reuseBox = document.createElement('p'); reuseBox.className = 'gw-fine gw-reuse'; reuseBox.hidden = true; box.querySelector('.gw-calc-in').insertAdjacentElement('afterbegin', reuseBox);
    function reuseOffer() {
      const list = reusable(); if (!list.length) { reuseBox.hidden = true; return; }
      const names = []; list.forEach((x) => { const n = reuseNames[x.dataset.share.replace(/^(?:buyers|borrowers)\.\d\./, '')]; if (n && names.indexOf(n) < 0) names.push(n); });
      reuseBox.innerHTML = '<button type="button" class="gw-link" data-reuse>Reuse figures from your journey</button>' + (names.length ? ' <span>(' + esc(names.slice(0, 4).join(', ')) + ')</span>' : ''); reuseBox.hidden = false;
      reuseBox.querySelector('[data-reuse]').addEventListener('click', () => {
        reusable().forEach((x) => { const m = /^(buyers|borrowers)\.1\./.exec(x.dataset.share); if (m) showRow(m[1] + '.1', true); const v = reuseVal(x); if (x.dataset.t === 'chip') setChip(x, v); else x.value = x.dataset.t === 'money' && parseMoney(v) !== null ? fmtMoney(parseMoney(v)) : v; });
        reuseBox.hidden = true; changed(); recalc();
      });
    }
    reuseOffer();
    afterCalc = () => { saveOwn(); if (!journey) { const d = dirty(); sv.hidden = !d; if (d) reuseBox.hidden = true; } };
    const clearAll = box.querySelector('[data-clear]');   // journey mode only: standalone shows "New calculation" instead
    if (clearAll) clearAll.addEventListener('click', () => {
      resetFields();
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
    // R2.4: the assessment ends with the page's reference, e.g. (Ref KPT-CALC-SD · wati/oct): the page and campaign, never a figure
    const withRef = (m) => (root.KPT && root.KPT.waTag ? root.KPT.waTag(m) : m);
    const message = () => withRef((id === 'msr' && ceilingOver(last.r) ? C.messages[FN[id]](last.v, last.r).replace('Indicative maximum loan', eligFlag(last.r) === 'age' ? 'Theoretical maximum HDB loan (singles age requirement not met, so not eligible to buy under that scheme)' : 'Theoretical maximum loan (income above the HDB loan ceiling, so not eligible for an HDB loan)') : C.messages[FN[id]](last.v, last.r)) + (last.v.cpfInterestEstimated ? '\n(CPF accrued interest is a rough upper estimate at 2.5% a year on the full amount.)' : ''));
    box.querySelector('[data-send-wa]').addEventListener('click', () => {
      if (!last) return;
      const msg = message();
      // R2.4 (Ken, 12 Oct 2026): whatsapp_click (and Meta Contact) only when WhatsApp actually opens. A message too long to open is
      // copied instead, and that is a copy, recorded as assessment_copied like the "Copy" button.
      if (msg.length > MAX_MESSAGE) { track('assessment_copied', { tool_name: 'calc-' + id, context: 'too-long' }); copy(msg, 'Your assessment is long, so it has been copied instead of cut short. Open WhatsApp, start a chat with Ken (+65 9090 8898) and paste it.'); return; }
      track('whatsapp_click', { tool_name: 'calc-' + id, context: 'assessment' });
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
    box.querySelector('[data-send-copy]').addEventListener('click', () => { if (!last) return; track('assessment_copied', { tool_name: 'calc-' + id, context: 'copy' }); /* R2.4: a copy is not a WhatsApp tap */ copy(message(), 'Copied. Paste it into a WhatsApp chat with Ken (+65 9090 8898).'); });
    // ---- presets in a link (#pr, #second-home…): a starting choice only, never a figure ----
    const applyPreset = () => { const P = (PRESETS[id] || {})[(root.location.hash || '').replace('#', '')]; if (!P) return false; Object.keys(P).forEach((k) => { const g = box.querySelector('[data-k="' + k + '"]'); if (g && g.dataset.t === 'chip') setChip(g, P[k]); }); return true; };
    if (applyPreset()) { /* the link's choice wins over a choice remembered from another calculator */ }
    root.addEventListener('hashchange', () => { if (applyPreset()) recalc(); });
    // Sale proceeds -> Planner: the sale is handed over only when the visitor taps "What can I buy next?" (never left waiting in the tab)
    if (id === 'sale-proceeds') { const hand = (e) => { const a = e.target && e.target.closest ? e.target.closest('a[data-gw-go="planner-sell"]') : null; if (a && last) sellHandoff(last.v, last.r); }; box.addEventListener('click', hand, true); box.addEventListener('auxclick', hand, true); }
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
