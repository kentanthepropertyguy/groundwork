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
  };
  const svg = (k) => '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICON[k] + '</svg>';
  const TOOLS = {
    'stamp-duty': { path: 'stamp-duty/', title: 'Stamp duty (BSD and ABSD)', short: 'What you pay when you buy, for your buyer profile', h1: 'Stamp duty: BSD and ABSD', intro: 'Buyer’s Stamp Duty and Additional Buyer’s Stamp Duty on a home, for you or you and a co-buyer.', group: 'buy' },
    mortgage: { path: 'mortgage/', title: 'Mortgage repayment', short: 'Monthly instalment, total interest and the income banks look for', h1: 'Mortgage repayment', intro: 'Your monthly instalment and total interest, and the income a bank’s stress test would look for.', group: 'buy' },
    tdsr: { path: 'tdsr/', title: 'TDSR', short: 'How much a bank may lend, from your income and debts', h1: 'TDSR: how much can I borrow?', intro: 'The Total Debt Servicing Ratio limit, worked out from your income and monthly debts.', group: 'buy' },
    msr: { path: 'msr/', title: 'MSR for HDB flats and ECs', short: 'Loan limits for HDB flats and new ECs', h1: 'MSR: HDB flats and new ECs', intro: 'The Mortgage Servicing Ratio limit for an HDB flat or a new EC, with an HDB loan or a bank loan.', group: 'buy' },
    progressive: { path: 'progressive-payments/', title: 'Progressive payments', short: 'New launch stages: what you pay in cash, CPF and loan', h1: 'Progressive payments for a new launch', intro: 'What a home under construction asks of you at each stage, and how much comes from cash, CPF and the bank.', group: 'buy' },
    'sale-proceeds': { path: 'sale-proceeds/', title: 'Sale proceeds', short: 'The cash and CPF you get back when you sell', h1: 'Sale proceeds', intro: 'From selling price to the cash in your hand and the CPF back in your account.', group: 'sell' },
    ssd: { path: 'ssd/', title: 'Seller’s Stamp Duty (SSD)', short: 'Selling within 4 years of buying? See the duty', h1: 'Seller’s Stamp Duty (SSD)', intro: 'Whether SSD applies when you sell a private home, and how much.', group: 'sell' },
  };
  const EXISTING = {
    'hdb-upgrade': { path: 'hdb-upgrade/', title: 'Can I afford to upgrade from my HDB?', short: 'Your planning range for a private home if you sell first', group: 'upgrade' },
    'what-can-i-buy': { path: 'what-can-i-buy/', title: 'What can this budget buy?', short: 'What homes around your budget have actually sold for', group: 'buy' },
  };
  const ORDER = { buy: ['stamp-duty', 'mortgage', 'tdsr', 'msr', 'progressive', 'what-can-i-buy'], sell: ['sale-proceeds', 'ssd'], upgrade: ['hdb-upgrade'] };
  const GROUPS = [['upgrade', 'Upgrading'], ['buy', 'Buying'], ['sell', 'Selling']];

  // The tools page: a compact directory (r = path from the tools page to /tools/, i.e. '')
  function directoryHtml() {
    const tile = (id) => { const t = TOOLS[id] || EXISTING[id]; return '<a class="gw-tl" href="' + t.path + '" data-tool="' + id + '">' + svg(id) + '<b>' + esc(t.title) + '</b><span>' + esc(t.short) + '</span></a>'; };
    return GROUPS.map((g) => '<section class="gw-tg" aria-labelledby="tg-' + g[0] + '"><h2 id="tg-' + g[0] + '">' + g[1] + '</h2><div class="gw-tls">' + ORDER[g[0]].map(tile).join('') + '</div></section>').join('');
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
  function buyersBlock() {
    const row = (n) => '<div class="gw-person" data-row="buyers.' + n + '"' + (n ? ' hidden' : '') + '><p class="gw-ph-l">' + (n ? 'Second buyer <button type="button" class="gw-link" data-remove="buyers.1">Remove</button>' : 'Buyer') + '</p>' +
      chips('buyers.' + n + '.res', 'Residency', RES, { value: 'SC', share: 'buyers.' + n + '.res' }) +
      chips('buyers.' + n + '.owned', 'Residential properties already owned in Singapore, including HDB flats', OWN, { value: '0', share: 'buyers.' + n + '.owned' }) + '</div>';
    return '<div data-when="entity:0">' + row(0) + row(1) + '<button type="button" class="gw-link gw-add" data-add="buyers.1">+ Add a second buyer</button></div>';
  }
  function borrowersBlock(o) {
    o = o || {};
    const row = (n) => '<div class="gw-person" data-row="borrowers.' + n + '"' + (n ? ' hidden' : '') + '><p class="gw-ph-l">' + (n ? 'Second borrower <button type="button" class="gw-link" data-remove="borrowers.1">Remove</button>' : 'Borrower') + '</p><div class="gw-grid">' +
      numf('borrowers.' + n + '.age', 'Age', 'years', { share: 'borrowers.' + n + '.age', ph: 'e.g. 35' }) +
      money('borrowers.' + n + '.fixed', 'Fixed monthly income', { share: 'borrowers.' + n + '.fixed', ph: 'gross, before CPF', hint: n ? '' : 'Gross salary before CPF deductions.' }) +
      money('borrowers.' + n + '.variable', 'Variable monthly income', { opt: true, share: 'borrowers.' + n + '.variable', ph: 'average', hint: n ? '' : 'Bonus, commission or allowances, averaged per month.' }) +
      (o.rental ? money('borrowers.' + n + '.rental', 'Rental income', { opt: true, share: 'borrowers.' + n + '.rental', ph: 'per month' }) : '') + '</div></div>';
    return row(0) + row(1) + '<button type="button" class="gw-link gw-add" data-add="borrowers.1">+ Add a second borrower</button>';
  }
  const LOANS = [['0', 'None'], ['1', 'One'], ['2', 'Two or more']];

  const FORMS = {
    mortgage: () => chips('lender', 'Loan', [['bank', 'Bank loan'], ['hdb', 'HDB loan']], { value: 'bank' }) + grid(
      money('loan', 'Loan amount', { share: 'loan', ph: 'e.g. 600,000' }) +
      numf('ratePct', 'Interest rate', '% a year', { value: '4', hint: '<span data-when="lender:bank">4% is the rate banks must use for their stress test. Use the rate you’ve been quoted.</span><span data-when="lender:hdb">HDB’s rate is 2.6% a year for Oct–Dec 2026 (CPF Board).</span>' }) +
      numf('years', 'Loan tenure', 'years', { value: '25', hint: '<span data-when="lender:bank">Up to 30 years for HDB flats and 35 for other homes.</span><span data-when="lender:hdb">Up to 25 years for an HDB loan.</span>' })),
    'stamp-duty': () => grid(money('price', 'Purchase price', { share: 'buyPrice', ph: 'e.g. 1,500,000', hint: 'Or the market value, if that is higher.' })) +
      chips('entity', 'Who is buying?', [['0', 'Individuals'], ['1', 'A company or other entity']], { value: '0' }) + buyersBlock(),
    ssd: () => grid(money('price', 'Selling price', { share: 'sellPrice', ph: 'e.g. 1,600,000', hint: 'Or the market value, if that is higher.' }) +
      datef('bought', 'Date you bought', { hint: 'When your Option to Purchase was accepted, or your S&P date.' }) + datef('sold', 'Date you sell', { today: true, hint: 'When the buyer accepts your Option to Purchase, or the S&P date.' })),
    'sale-proceeds': () => chips('type', 'Your home', [['hdb', 'HDB flat'], ['private', 'Private home'], ['ec', 'EC']], { value: 'hdb', share: 'homeType' }) + grid(
      money('price', 'Selling price', { share: 'sellPrice', ph: 'e.g. 750,000', hint: '<span data-when="type:hdb">Not sure? <a href="../../journey/worth/#hdb" data-gw-go="worth-hdb">See recent resales in your block ›</a></span><span data-when="type:private,ec">Not sure? <a href="../../research/" data-gw-go="research">See recent sales in your development ›</a></span>' }) +
      money('loan', 'Outstanding loan', { opt: true, share: 'outstandingLoan', ph: '0 if none' }) +
      money('cpfPrincipal', 'CPF used for this home', { opt: true, share: 'cpfPrincipal', ph: 'principal, all owners', hint: 'Down payment and instalments paid from CPF. CPF’s website shows it under Home Ownership.' }) +
      money('cpfInterest', 'CPF accrued interest', { opt: true, share: 'cpfInterest', ph: 'all owners', hint: 'On the same CPF page. <button type="button" class="gw-link" data-estimate>Estimate it</button>' }) +
      '<div class="gw-est" data-est hidden>' + numf('estYears', 'Years since you started using CPF for it', 'years', { ph: 'e.g. 8', hint: 'A rough estimate at 2.5% a year on the full amount. Your CPF statement has the real figure.' }) + '</div>') +
      more(numf('commissionPct', 'Agent’s commission', '%', { value: '2', hint: 'Your estimate; commission is agreed with your agent.' }) + check('gst', 'Add 9% GST to the commission', { checked: true }) +
        money('legal', 'Legal fees', { value: '3,000', hint: 'Your estimate.' }) + money('penalty', 'Early repayment penalty', { opt: true, hint: 'If your bank charges one for repaying early.' }) +
        money('other', 'Other selling costs', { opt: true }) + '<div data-when="type:private,ec" class="gw-grid1">' + datef('bought', 'Date you bought (for SSD)', { opt: true }) + datef('sold', 'Date you sell', { today: true }) + '</div>' +
        check('owner55', 'An owner is 55 or older')),
    tdsr: () => chips('kind', 'Buying', [['private', 'A private home'], ['hdb', 'An HDB flat with a bank loan']], { value: 'private' }) + borrowersBlock({ rental: true }) + grid(
      money('debts', 'Monthly debt repayments now', { opt: true, share: 'debts', ph: '0 if none', hint: 'Car, personal and student loans, credit card minimums, existing home loans.' }) +
      numf('tenure', 'Loan tenure', 'years', { opt: true, ph: 'longest standard', hint: 'Leave blank for the longest standard tenure for your age.' })) +
      chips('loans', 'Housing loans you still have', LOANS, { value: '0', share: 'housingLoans' }),
    msr: () => chips('scenario', 'Buying', [['hdb-loan', 'HDB flat, HDB loan'], ['hdb-bank', 'HDB flat, bank loan'], ['ec', 'New EC, bank loan']], { value: 'hdb-loan' }) + borrowersBlock() + grid(
      money('propertyLoans', 'Existing property loan instalments', { opt: true, ph: 'per month, 0 if none' }) +
      money('otherDebts', 'Other monthly debt repayments', { opt: true, when: 'scenario:hdb-bank,ec', ph: 'car, cards, other loans' }) +
      numf('lease', 'Remaining lease of the flat', 'years', { opt: true, when: 'scenario:hdb-loan', ph: 'e.g. 70' }) +
      numf('tenure', 'Loan tenure', 'years', { opt: true, ph: 'longest allowed' })) +
      chips('loans', 'Housing loans you still have', LOANS, { value: '0', share: 'housingLoans', when: 'scenario:hdb-bank,ec' }),
    progressive: () => grid(money('price', 'Purchase price', { share: 'buyPrice', ph: 'e.g. 1,800,000' }) +
      numf('ratePct', 'Interest rate', '% a year', { value: '4', hint: '4% is the banks’ stress-test rate. Use the rate you’ve been quoted.' }) +
      numf('years', 'Loan tenure', 'years', { value: '30' }) + money('cpf', 'CPF OA you can use', { opt: true, share: 'cpfOa', ph: 'all buyers' })) +
      chips('loans', 'Housing loans you still have', LOANS, { value: '0', share: 'housingLoans' }) + chips('entity', 'Who is buying?', [['0', 'Individuals'], ['1', 'A company or other entity']], { value: '0' }) + buyersBlock() +
      more(check('lowerLtv', 'Longer tenure or past age 65 (lower loan limit)'), 'Loan structure'),
  };

  // The calculator section on each tool page.
  function pageHtml(id) {
    const t = TOOLS[id];
    return '<section class="gw-calc" data-calc="' + id + '"><div class="gw-calc-in" aria-label="Your details">' + FORMS[id]() +
      '<p class="gw-fine gw-saved" data-saved hidden>Some details are filled in from your other calculations in this tab. <button type="button" class="gw-link" data-clear>Clear them</button></p></div>' +
      '<div class="gw-calc-out"><div data-out aria-live="polite"><p class="gw-fine">Enter your details to see the result.</p></div>' +
      '<div class="gw-send" data-send hidden><button type="button" class="gw-btn wa" data-send-wa>Send my assessment to Ken on WhatsApp</button>' +
      '<p class="gw-fine">Your details and results above go into the message, so Ken sees your full picture. You can read and edit it in WhatsApp before you press Send.</p>' +
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
  const next = (links) => '<p class="gw-next">' + links.map((l) => '<a href="' + l[0] + '" data-gw-go="' + l[2] + '">' + l[1] + ' ›</a>').join('') + '</p>';
  const LABEL = { loan: 'loan amount', ratePct: 'interest rate', years: 'loan tenure', price: 'price', buyers: 'buyer details', bought: 'date you bought', sold: 'date you sell', income: 'income', age: 'age' };

  const RENDER = {
    mortgage(r) {
      return head('Monthly instalment', $(r.monthly), 'over ' + Math.round(r.months / 12) + ' years') +
        rows([['Total interest', $(r.interest)], ['Total repaid', $(r.total)], ['Interest share of repayments', pc(r.interestShare)], ['First year', $(r.firstYear.interest) + ' interest · ' + $(r.firstYear.principal) + ' principal', 'w'],
          r.balanceAfter[5] !== undefined ? ['Still owed after 5 years', $(r.balanceAfter[5])] : null, r.balanceAfter[10] !== undefined ? ['Still owed after 10 years', $(r.balanceAfter[10])] : null]) +
        '<h3 class="gw-sh">What lenders test</h3>' + rows([['Instalment at the ' + pc(r.stress.rate) + ' ' + (r.lender === 'hdb' ? 'HDB floor rate' : 'stress-test rate'), $(r.stress.monthly)],
          r.stress.incomeForTdsr ? ['Gross income for this loan alone to fit TDSR 55%', $(r.stress.incomeForTdsr) + ' a month'] : null, ['Gross income to fit MSR 30% (HDB flats, new ECs)', $(r.stress.incomeForMsr) + ' a month']]) +
        (r.overHdbTenure ? '<p class="gw-warn">HDB loans run for up to 25 years.</p>' : '') +
        notes(['Assumes the same rate for the whole tenure; most bank rates change after a few years.', 'Income figures assume no other debts. Your lender decides.']) +
        next([['../tdsr/', 'How much could I borrow?', 'calc-tdsr'], ['../progressive-payments/', 'Buying a new launch?', 'calc-progressive']]) +
        src('Rules: MAS TDSR 55% and 4% medium-term rate; MSR 30%; HDB loan 3% floor. Checked 9 Oct 2026.');
    },
    'stamp-duty'(r) {
      const who = r.profile.res === 'ENTITY' ? 'entity' : ({ SC: 'Singapore Citizen', PR: 'Permanent Resident', FR: 'foreigner' })[r.profile.res] + (r.profile.res === 'FR' ? '' : ', ' + ['first', 'second', 'third or later'][r.profile.owned] + ' property');
      return head('Total stamp duty', $(r.total), 'BSD ' + $(r.bsd) + ' + ABSD ' + $(r.absd)) +
        '<h3 class="gw-sh">Buyer’s Stamp Duty</h3>' + rows(r.bsdLines.map((l) => [(l.from ? 'Next ' : 'First ') + $(l.to - l.from) + ' at ' + pc(l.rate), $(l.duty)]).concat([['BSD (rounded down)', $(r.bsd), 'tot']])) +
        '<h3 class="gw-sh">Additional Buyer’s Stamp Duty</h3>' + rows([['Rate (' + esc(who) + ')', pc(r.absdRate)], ['ABSD', $(r.absd), 'tot'], r.ifRemitted !== null ? ['Total if the ABSD is remitted (see below)', $(r.ifRemitted), 'w'] : null]) +
        notes(r.notes.concat([{ text: r.basis }])) +
        next([['../progressive-payments/', 'Payments for a new launch', 'calc-progressive'], ['../mortgage/', 'Monthly instalment', 'calc-mortgage']]) +
        src('Rates: BSD for homes bought from 15 Feb 2023; ABSD from 27 Apr 2023 (IRAS, MOF). Checked 9 Oct 2026.');
    },
    ssd(r) {
      if (!r.ok && r.error) return '<p class="gw-warn">The date you sell is before the date you bought.</p>';
      if (r.applies === false && r.reason) return head('Seller’s Stamp Duty', '$0') + notes([r.text]);
      const reg = r.regime;
      return head('Seller’s Stamp Duty', $(r.ssd), r.rate ? pc(r.rate) + ' of the price' : 'No SSD: held longer than ' + reg.years + ' years') +
        rows([['Held for', r.heldText], ['Bought', reg.to ? 'between ' + day(reg.from) + ' and ' + day(reg.to) : 'on or after ' + day(reg.from), 'w'], ['SSD period for that date', reg.years + ' years (' + reg.rates.map((x) => pc(x)).join(', ') + ')', 'w'], ['No SSD if you sell on or after', day(r.freeFrom)]]) +
        (r.nearBoundary.length ? '<p class="gw-warn">Your date is within a week of an SSD anniversary (' + r.nearBoundary.map(day).join(', ') + '), when the rate changes. Confirm the exact dates with your lawyer or IRAS.</p>' : '') +
        (r.leapDay ? '<p class="gw-warn">Bought on 29 February: confirm with your lawyer or IRAS which day each anniversary falls on.</p>' : '') +
        notes(['SSD is on the higher of the selling price or market value, rounded down, and payable within 14 days of the sale.', 'Most HDB flats are not affected, because their minimum occupation period is longer than the SSD period.']) +
        next([['../sale-proceeds/', 'What will I get from the sale?', 'calc-sale-proceeds']]) +
        src('Rates: MOF and IRAS, for homes bought from 4 Jul 2025 (4 years) and 11 Mar 2017 to 3 Jul 2025 (3 years). Checked 9 Oct 2026.');
    },
    'sale-proceeds'(r) {
      const c = r.costs;
      return (r.netCash < 0 ? head('Cash you’d need to add', $(-r.netCash), r.loanShortfall ? 'to clear the loan and pay the selling costs' : 'to pay the selling costs') : head('Cash in hand after costs', $(r.netCash), 'plus ' + $(r.cpfRefund) + ' back in CPF')) +
        rows([['Selling price', $(r.price)], ['Less outstanding loan' + (r.penalty ? ' and penalty' : ''), '−' + $(r.loan + r.penalty).slice(0)], r.loanShortfall ? ['Short of the loan by', '−' + $(r.loanShortfall), 'sub'] : ['After repaying the loan', $(r.afterLoan), 'sub'],
          r.loanShortfall ? null : ['Less CPF refund (principal + interest)', '−' + $(r.cpfRefund)], r.loanShortfall ? null : ['Cash from the sale', $(r.cashFromSale), 'sub'],
          ['Less agent’s commission (' + c.commissionPct + '%' + (c.gst ? ' + GST' : '') + ')', '−' + $(c.commission + c.gst)], ['Less legal fees', '−' + $(c.legal)], c.other ? ['Less other costs', '−' + $(c.other)] : null, c.ssd ? ['Less SSD (' + pc(r.ssd.rate) + ')', '−' + $(c.ssd)] : null,
          r.netCash < 0 ? ['Cash you’d need to add', $(-r.netCash), 'tot'] : ['Cash left after costs', $(r.netCash), 'tot']]) +
        (r.nextPurchase.total > 0 ? '<h3 class="gw-sh">For your next home</h3>' + rows([['Cash', $(r.nextPurchase.cash)], ['CPF refunded to you', $(r.nextPurchase.cpf)], ['Together', $(r.nextPurchase.total), 'tot']]) : '') +
        (r.loanShortfall ? '<p class="gw-warn">The price doesn’t cover the loan by ' + $(r.loanShortfall) + '. With the selling costs, about ' + $(r.ownCashNeeded) + ' would have to come from your own funds. Talk to your bank before you commit.</p>' : '') +
        (r.ownCashNeeded && !r.loanShortfall ? '<p class="gw-warn">Costs are more than the cash from the sale: about ' + $(r.ownCashNeeded) + ' from your own cash.</p>' : '') +
        notes([r.cpfShortfall > 0 ? 'The sale doesn’t cover the full CPF refund: ' + $(r.cpfShortfall) + ' isn’t refunded. You don’t top this up in cash if you sell at market value.' : '',
          'The CPF refund goes back to the owners’ CPF accounts' + (r.owner55 ? '; owners aged 55 and above have it go first to their Retirement Account, up to the Full Retirement Sum' : '') + '. It can go towards your next home, subject to CPF rules.',
          r.ssd && r.ssd.nearBoundary && r.ssd.nearBoundary.length ? 'Your sale date is close to an SSD anniversary: confirm the dates with your lawyer.' : '',
          'Commission and legal fees are your estimates.'].filter(Boolean)) +
        next([['../hdb-upgrade/', 'What could I afford next?', 'hdb-upgrade'], ['../ssd/', 'Seller’s Stamp Duty in detail', 'calc-ssd']]) +
        src('Rules: CPF refund of principal plus accrued interest; no cash top-up if sold at market value (CPF Board). GST 9%. Checked 9 Oct 2026.');
    },
    tdsr(r) {
      if (r.noTenure) return '<p class="gw-warn">At this age, the standard loan structure leaves no tenure. Lenders may offer a shorter loan at a lower limit; Ken can talk it through.</p>';
      const t = r.tenure;
      return head('Indicative maximum loan', $(r.maxLoan), 'over ' + t.years + ' years, tested at ' + pc(r.rate)) +
        rows([['Income counted (after haircuts)', $(r.B.assessable) + ' a month'], ['TDSR limit, 55%', $(r.cap) + ' a month'], ['Less your monthly debts', '−' + $(r.debts)], ['Left for the new loan', $(r.forNew) + ' a month', 'tot'],
          ['Income-weighted age', (Math.round(r.B.iwaa * 10) / 10) + ' years'], ['Standard tenure for your age', t.std + ' years (up to ' + t.max + ' with a lower loan limit)', 'w'], ['Loan limit (LTV) used', pc(r.ltv) + ', at least ' + pc(r.minCash) + ' in cash', 'w'], ['Price this loan supports', $(r.priceAtLtv)]]) +
        (r.overLimit ? '<p class="gw-warn">Your existing debts already use the whole TDSR limit.</p>' : '') +
        notes([r.B.haircut > 0 ? 'Banks count only 70% of variable and rental income.' : '', t.capped ? 'Tenure capped at ' + t.max + ' years, the MAS maximum here.' : '', t.lower ? 'Your tenure is past the standard limit, so the lower loan limit applies.' : '', r.msrApplies ? 'For an HDB flat, the 30% MSR limit applies too, and is usually the tighter one.' : '', 'Banks test the new loan at 4% or their own higher rate. They decide the final amount.'].filter(Boolean)) +
        next(r.msrApplies ? [['../msr/', 'Check the MSR limit', 'calc-msr'], ['../mortgage/', 'Monthly instalment', 'calc-mortgage']] : [['../../tools/what-can-i-buy/', 'What can this budget buy?', 'what-can-i-buy'], ['../mortgage/', 'Monthly instalment', 'calc-mortgage']]) +
        src('Rules: MAS TDSR 55%, 4% medium-term rate, 30% haircut on variable and rental income; LTV and tenure limits (MAS). Checked 9 Oct 2026.');
    },
    msr(r) {
      const t = r.tenure, hdb = r.scenario === 'hdb-loan';
      return head('Indicative maximum loan', $(r.maxLoan), 'over ' + t.years + ' years, tested at ' + pc(r.rate)) +
        rows([['Income counted', $(hdb ? r.B.gross : r.B.assessable) + ' a month'], ['MSR limit, 30%', $(r.msrCap) + ' a month'], r.prop ? ['Less existing property loans', '−' + $(r.prop)] : null,
          !hdb ? ['TDSR limit, 55%, less all debts', $(r.forNewTdsr) + ' a month'] : null, ['Left for the new loan', $(r.forNew) + ' a month' + (!hdb ? ' (' + r.binding.toUpperCase() + ' is the limit)' : ''), 'tot'],
          hdb ? ['Tenure', t.years + ' years (the shortest of 25, 65 minus average age' + (t.lease ? ', lease minus 20' : '') + ')', 'w'] : ['Tenure', t.years + ' years (standard up to ' + t.std + ')'],
          ['Loan limit (LTV)', pc(r.ltv)], ['Price this loan supports', $(r.priceAtLtv)]]) +
        notes(r.notes.concat([hdb ? 'HDB tests the loan at 3% or its loan rate, if higher. You need an HDB Flat Eligibility (HFE) letter; HDB decides the loan.' : 'Banks test the loan at 4% or their own higher rate, against both MSR and TDSR. They decide the final amount.'])) +
        next([['../tdsr/', 'TDSR in detail', 'calc-tdsr'], ['../mortgage/', 'Monthly instalment', 'calc-mortgage']]) +
        src('Rules: MAS MSR 30% and TDSR 55% at 4%; HDB loan 3% floor, 75% LTV, 25 years (HDB). Checked 9 Oct 2026.');
    },
    progressive(r) {
      const by = (s) => [s.cash ? 'cash ' + $(s.cash) : '', s.cpf ? 'CPF ' + $(s.cpf) : '', s.flex ? 'cash or CPF ' + $(s.flex) : '', s.loan ? 'loan ' + $(s.loan) : ''].filter(Boolean).join(' · ');
      return head('Within 8 weeks of booking', $(r.stages[0].amount + r.stages[1].amount), '20% of the price' + (r.duty.ok ? ', plus ' + $(r.duty.total) + ' stamp duty within 14 days of signing' : '')) +
        rows([['Minimum cash', $(r.cashMin) + ' (' + pc(r.minCash) + ')'], ['Cash or CPF', $(r.cpfOrCash)], ['Bank loan (' + pc(r.ltv) + ' LTV)', $(r.loanMax)], ['Instalment once fully drawn', $(r.finalMonthly) + ' a month', 'tot']]) +
        '<div class="gw-vx-tw"><table class="gw-vx-t gw-pps"><thead><tr><th>Stage</th><th class="r">Amount</th><th>Paid from</th><th class="r">Instalment after</th></tr></thead><tbody>' +
        r.stages.map((s) => '<tr><td>' + esc(s.name) + ' <small>' + pc(s.pct) + '</small></td><td class="r">' + $(s.amount) + '</td><td>' + by(s) + '</td><td class="r">' + (s.monthly ? $(s.monthly) : '—') + '</td></tr>').join('') + '</tbody></table></div>' +
        notes([r.entity ? 'A company or other entity can borrow up to 15% (MAS) and has no CPF, so the rest is cash.' : '', r.autoLower ? 'A tenure over 30 years takes the lower loan limit (MAS).' : '', r.tenureCapped ? 'Tenure capped at 35 years, the MAS maximum.' : '', 'The loan is drawn stage by stage; instalments shown amortise what has been drawn at ' + pc(r.rate, 1) + ' over ' + r.years + ' years. Your bank sets the actual amounts.', 'Stage dates follow construction, so your developer’s schedule sets the timing. Your S&P sets the actual terms.', r.cpfGiven ? '' : 'Enter your CPF OA to split cash from CPF.', 'The booking fee is paid in cash. CPF use is subject to CPF rules.'].filter(Boolean)) +
        next([['../stamp-duty/', 'Stamp duty in detail', 'calc-stamp-duty'], ['../tdsr/', 'Could I borrow this much?', 'calc-tdsr']]) +
        src('Rules: standard progressive payment schedule (Housing Developers Rules); MAS LTV limits; stamp duty as on the stamp duty calculator. Checked 9 Oct 2026.');
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
    const parseMoney = (s) => { const v = parseFloat(String(s || '').replace(/[^0-9.]/g, '')); return isFinite(v) ? v : null; };
    const fmtMoney = (v) => (v === null ? '' : Math.round(v).toLocaleString('en-US'));
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
    function values() {
      const v = {};
      const put = (path, val) => { const parts = path.split('.'); let o = v; for (let i = 0; i < parts.length - 1; i++) { const k = /^\d+$/.test(parts[i + 1]) ? [] : {}; o = o[parts[i]] = o[parts[i]] || k; } o[parts[parts.length - 1]] = val; };
      $$('[data-k]').forEach((el) => {
        if (!live(el)) return;
        const t = el.dataset.t, k = el.dataset.k; let val;
        if (t === 'money') val = parseMoney(el.value); else if (t === 'num') { val = parseFloat(el.value); if (!isFinite(val)) val = null; } else if (t === 'date') val = el.value || null; else if (t === 'check') val = el.checked; else if (t === 'chip') val = chipVal(el);
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
      try { r = C[FN[id]](v); } catch (e) { r = { ok: false, missing: [] }; }
      if (r.ok || r.error) { out.innerHTML = RENDER[id](r, v); } else { out.innerHTML = '<p class="gw-fine">Enter ' + (r.missing || []).map((m) => LABEL[m] || m).join(', ').replace(/, ([^,]*)$/, ' and $1') + ' to see the result.</p>'; }
      last = r.ok ? { v, r } : null; send.hidden = !last;
      const sig = JSON.stringify(v); if (sig !== lastSig) { note.innerHTML = ''; lastSig = sig; } // a copied message stays until the details change
      if (last && !doneT) { doneT = true; track('tool_completed', { tool_name: 'calc-' + id }); }
    }
    let tmr; const changed = (el) => {
      if (!startedT) { startedT = true; track('tool_started', { tool_name: 'calc-' + id }); }
      // remember shared details for this tab
      const s = store.get(); $$('[data-share]').forEach((x) => { if (!live(x)) return; const val = x.dataset.t === 'chip' ? chipVal(x) : x.value; if (val !== null && val !== '') s[x.dataset.share] = val; else delete s[x.dataset.share]; }); store.set(s);
      clearTimeout(tmr); tmr = setTimeout(recalc, 120);
    };
    $$('input').forEach((x) => { x.addEventListener('input', () => changed(x)); x.addEventListener('change', () => changed(x)); });
    $$('input[data-t="money"]').forEach((x) => x.addEventListener('blur', () => { const v = parseMoney(x.value); x.value = v === null ? '' : fmtMoney(v); }));
    // CPF accrued interest: a rough estimate only when the visitor asks for one, and only until they type their own figure
    let estimated = false;
    const est = box.querySelector('[data-estimate]');
    if (est) {
      const yrs = box.querySelector('[data-k="estYears"]'), ci = box.querySelector('[data-k="cpfInterest"]'), cp = box.querySelector('[data-k="cpfPrincipal"]');
      est.addEventListener('click', () => { box.querySelector('[data-est]').hidden = false; yrs.focus(); });
      const fill = () => { const p = parseMoney(cp.value), y = parseFloat(yrs.value); if (p && y > 0) { ci.value = fmtMoney(C.cpfInterestEstimate(p, y)); estimated = true; changed(ci); } };
      yrs.addEventListener('input', fill); cp.addEventListener('input', () => { if (estimated) fill(); });
      ci.addEventListener('input', () => { estimated = false; });
    }
    // ---- restore shared details ----
    const saved = store.get(); let used = false;
    $$('[data-share]').forEach((x) => {
      const val = saved[x.dataset.share]; if (val === undefined || val === null || val === '') return;
      const m = /^(buyers|borrowers)\.1\./.exec(x.dataset.share); if (m) showRow(m[1] + '.1', true);
      if (x.dataset.t === 'chip') { if (val !== x.dataset.default) used = true; setChip(x, val); } else { x.value = x.dataset.t === 'money' ? fmtMoney(parseMoney(val)) : val; used = true; }
    });
    const sv = box.querySelector('[data-saved]'); sv.hidden = !used;
    box.querySelector('[data-clear]').addEventListener('click', () => {
      $$('[data-k]').forEach((x) => { const d = x.dataset.default; if (x.dataset.t === 'chip') setChip(x, d); else if (x.dataset.t === 'check') x.checked = d === '1'; else if (x.dataset.t === 'date') x.value = x.dataset.today ? todayIso : ''; else x.value = d !== undefined ? d : ''; });
      ['buyers.1', 'borrowers.1'].forEach((k) => showRow(k, false));
      try { root.sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
      sv.hidden = true; recalc();
    });
    // ---- the assessment ----
    const message = () => C.messages[FN[id]](last.v, last.r) + (last.v.cpfInterestEstimated ? '\n(CPF accrued interest is a rough estimate at 2.5% a year.)' : '');
    box.querySelector('[data-send-wa]').addEventListener('click', () => {
      if (!last) return;
      const msg = message();
      track('whatsapp_click', { tool_name: 'calc-' + id, context: 'assessment' });
      if (msg.length > MAX_MESSAGE) { copy(msg, 'Your assessment is long, so it has been copied instead of cut short. Open WhatsApp, start a chat with Ken (+65 9090 8898) and paste it.'); return; }
      const url = waUrl(msg); let w = null;
      try { w = root.open(url, '_blank'); } catch (e) { w = null; }
      if (w) { try { w.opener = null; } catch (e) { /* ignore */ } } else root.location.href = url;
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
    recalc();
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }
  return { TOOLS, EXISTING, ORDER, GROUPS, directoryHtml, pageHtml, RENDER, MAX_MESSAGE, svg };
});
