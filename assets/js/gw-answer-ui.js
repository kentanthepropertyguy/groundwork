/* ==========================================================================
   GROUNDWORK — Planner screen (Stage 1, Oct 2026): page markup and browser behaviour.
   "Strict internally, effortless externally." The few entries on the left; the answer on the right: the comfortable budget, the highest the numbers allow,
   a price to try, what it costs, and the simplest fix when a price does not fit. Every figure comes from GW_ANSWER (which calls GW_TIMELINE, GW_CALC and
   GW_RULES); this file draws the entries and the answer and does no arithmetic beyond formatting.
   Privacy: entries never enter the page address, analytics or advertising events; the WhatsApp message carries no figures. The tab-only store (gw.ans.v1) holds the
   entries for this tab; price, age, residency and CPF OA are also shared with the other calculators (gw.fin.v1), as the other tools do. "Clear all my figures"
   (gw-nav.js) removes every gw.* key.
   UMD: window.GW_ANSWER_UI in the browser; Node uses pageHtml() to write the page at build time.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GW_ANSWER_UI = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PHONE = '6590908898', REF = 'KPT-PLANNER';
  const waUrl = (m) => 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(m);
  const $ = (n) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
  const $s = (n) => (n >= 1e6 ? '$' + (Math.floor(n / 1e4) / 100).toFixed(2) + 'm' : n >= 1000 ? '$' + Math.floor(n / 1000).toLocaleString('en-US') + 'k' : $(n));
  const round100 = (n) => Math.round(n / 100) * 100;
  // a round price in short form ($1.9m, $750k); any other price in full, so the figure named is the figure judged
  const $m = (n) => (n >= 1e6 ? (n % 1e4 === 0 ? $s(n).replace(/\.00m$/, 'm').replace(/(\.\d)0m$/, '$1m') : $(n)) : n % 1000 === 0 ? $s(n) : $(n));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? +m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : (iso || ''); };
  const pc = (x, d) => (Math.round(x * 100 * Math.pow(10, d || 0)) / Math.pow(10, d || 0)) + '%';
  const RES = [['SC', 'Citizen'], ['PR', 'PR'], ['FR', 'Foreigner']];
  const RESW = { SC: 'citizens', PR: 'a PR', FR: 'a foreigner' };
  const WHYWAIT = { age: 'your age', income: 'your income', cash: 'your cash', cpf: 'your CPF', home: 'your property answers', flat: 'your home loan answers' };
  const WHYASK = { loan: 'whether you still owe a loan on your home', instalment: 'the monthly instalment on its loan', otherLoans: 'the loans on your other property', otherInstal: 'the instalment on your other property’s loan' };
  const PROMPTASK = { loan: 'Do you still owe a housing loan on your home? Answer on the left.', instalment: 'Add the monthly instalment on its loan.', otherLoans: 'How many housing loans does your other property have? Answer on the left.', otherInstal: 'Add the monthly instalment on your other property’s loan.' };

  // An HDB flat is not a private home: it has its own loan rules, so this planner works out no figure for it and points to the calculator built for it.
  function hdbRoute(compact) {
    return (compact ? '<p><b>HDB flats follow different rules,</b> so this planner does not work them out.' : '<p class="pa-p">This planner uses the rules for private homes and ECs, so it does not work out an HDB flat. An HDB flat has its own loan rules (an HDB loan or a bank loan) and a 30% limit on the loan repayment against your income (MSR).') + '</p>' +
      '<a class="gw-btn ' + (compact ? 'sec' : 'pri') + ' pa-hdb-go" href="../msr/#hdb-loan" data-pa-hdb>Open the HDB loan limit calculator →</a>' +
      (compact ? '' : '<p class="pa-fine">It is built for an HDB flat with an HDB loan or a bank loan. Your age carries over from here.</p>');
  }
  // What the CPF figure is, and is not. The planner uses the amount the buyer entered; whether CPF allows that much for this home is not checked.
  const CPF_HINT = 'What CPF allows you to use, not necessarily your whole balance.';
  const cpfNote = (res) => { const a = res.at || res.atComfortable || res.atHighest; return a && a.haveCpf > 0 ? '<p class="pa-cpfnote"><b>CPF is as you entered it.</b> We have not checked it against CPF’s valuation limit, withdrawal limit, the home’s lease or your age, so it is not confirmed as usable. Whatever CPF does not allow has to be paid in cash.</p>' : ''; };

  /* ---------------- fields ---------------- */
  const err = (k) => '<small class="pa-err" data-err="' + k + '" role="alert" hidden></small>';
  const money = (k, label, o) => { o = o || {}; return '<label class="pa-f' + (o.cls ? ' ' + o.cls : '') + '"' + (o.when ? ' data-when="' + o.when + '"' : '') + '><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><div class="pa-in pa-m"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="money"' + (o.share ? ' data-share="' + o.share + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + ' aria-invalid="false"></div>' + (o.hint ? '<small class="pa-hint">' + o.hint + '</small>' : '') + err(k) + '</label>'; };
  const numf = (k, label, unit, o) => { o = o || {}; return '<label class="pa-f' + (o.cls ? ' ' + o.cls : '') + '"><span>' + label + '</span><div class="pa-in"><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="num"' + (o.share ? ' data-share="' + o.share + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + ' aria-invalid="false">' + (unit ? '<i class="u">' + unit + '</i>' : '') + '</div>' + (o.hint ? '<small class="pa-hint">' + o.hint + '</small>' : '') + err(k) + '</label>'; };
  const datef = (k, label) => '<label class="pa-f"><span>' + label + '</span><div class="pa-in"><input type="date" data-k="' + k + '" data-t="date"></div>' + err(k) + '</label>';
  const chips = (k, label, opts, o) => { o = o || {}; return '<div class="pa-q' + (o.cls ? ' ' + o.cls : '') + '"' + (o.when ? ' data-when="' + o.when + '"' : '') + '><span class="pa-l" id="pa-l-' + k.replace(/\W/g, '-') + '">' + label + '</span><div class="pa-chips" role="group" aria-labelledby="pa-l-' + k.replace(/\W/g, '-') + '" data-k="' + k + '" data-t="chip"' + (o.share ? ' data-share="' + o.share + '"' : '') + ' data-default="' + esc(o.value || '') + '">' + opts.map((x) => '<button type="button" class="pa-chip" data-v="' + x[0] + '" aria-pressed="' + (x[0] === o.value) + '">' + x[1] + '</button>').join('') + '</div></div>'; };
  function buyerRow(n) {
    const name = n ? 'Second buyer' : 'You';
    return '<div class="pa-buyer" data-row="b' + n + '"' + (n ? ' hidden' : '') + '>' + (n ? '<p class="pa-bl">' + name + '</p>' : '') +
      '<div class="pa-pair">' + numf('buyers.' + n + '.age', 'Age', '', { share: n ? undefined : 'borrowers.0.age', ph: n ? '' : 'e.g. 35' }) + money('buyers.' + n + '.fixed', 'Income / month', { ph: 'before CPF' }) + '</div>' +
      '<button type="button" class="pa-link" data-bonus="' + n + '">+ Add bonus</button><div class="pa-bonus" data-bonusbox="' + n + '" hidden>' + money('buyers.' + n + '.variable', 'Bonus or commission / month', { opt: true, hint: 'Yearly total ÷ 12. Banks count 70% of it.' }) + '</div></div>';
  }
  function formHtml() {
    return '<section class="pa-sec" aria-labelledby="pa-h-you"><h2 class="pa-h" id="pa-h-you">You</h2>' +
      chips('who', 'Buying', [['alone', 'Buying alone'], ['two', 'With someone']], { value: 'alone', cls: 'pa-who' }) + buyerRow(0) + buyerRow(1) +
      chips('buyers.0.res', 'Residency, you', RES, { value: 'SC', share: 'buyers.0.res' }) + chips('buyers.1.res', 'Residency, second buyer', RES, { value: 'SC', share: 'buyers.1.res', when: 'who:two' }) + '</section>' +
      '<section class="pa-sec" aria-labelledby="pa-h-own"><h2 class="pa-h" id="pa-h-own">Your property now</h2>' +
      chips('owns', 'Do you own a property now?', [['none', 'No'], ['one', 'Yes, one'], ['two', 'Yes, two or more']], { value: '' }) +
      '<div class="pa-own" data-when="owns:one,two" hidden>' +
      chips('home', 'What will you do with your home?', [['keep', 'Keep it'], ['sell', 'Sell it']], { value: '' }) +
      chips('flat.hasLoan', 'Do you still owe a housing loan on it?', [['yes', 'Yes'], ['no', 'No, fully paid'], ['unsure', 'Not sure']], { value: '' }) +
      '<div data-when="flat.hasLoan:yes,unsure" hidden>' + money('flat.instalment', 'Monthly instalment on that loan', { ph: 'e.g. 1,500', hint: 'It counts towards what you can borrow while you still own it.' }) + '</div>' +
      '<p class="pa-note" data-when="flat.hasLoan:unsure" hidden>Not sure? We count it as a loan, the cautious view, and show what changes if it is fully paid.</p>' +
      '<div data-when="owns:two" hidden>' + chips('otherLoans', 'Housing loans on your other property', [['0', 'None'], ['1', 'One'], ['2', 'Two']], { value: '' }) +
      '<div data-when="otherLoans:1,2" hidden>' + money('otherInstal', 'Their monthly instalments, together', { ph: 'e.g. 2,000' }) + '</div></div></div>' +
      '<div class="pa-sale" data-when="home:sell" hidden><h3 class="pa-h3">Sale of your home</h3>' + chips('flat.type', 'What are you selling?', [['hdb', 'HDB flat'], ['private', 'Private home']], { value: 'hdb' }) +
      '<div data-when="flat.type:private" hidden>' + chips('flat.held', 'Have you owned it for more than 4 years?', [['yes', 'Yes'], ['no', 'No']], { value: '' }) + '<p class="pa-note" data-when="flat.held:no" hidden>Selling within 4 years brings Seller’s Stamp Duty, which depends on when you bought. Use “Enter your own figures” below.</p></div>' +
      '<div class="pa-pair">' + money('flat.price', 'Expected sale price') + money('flat.loan', 'Loan left on it', { ph: 'type 0 if none' }) + '</div>' +
      money('flat.cpfRefund', 'CPF to be refunded, including accrued interest', { ph: 'from your CPF statement', hint: 'Leave it blank if you do not know yet. We do not estimate the interest, so the sale is not counted until you add it.' }) +
      '<details class="pa-adv" data-ovr><summary>Enter your own figures instead</summary><div class="pa-adv-b"><div class="pa-pair">' + money('flat.overrideCash', 'Cash you expect from the sale') + money('flat.overrideCpf', 'CPF you expect back') + '</div>' + money('flat.costs', 'Selling costs, agent fee and legal', { opt: true, hint: 'Replaces the usual estimate.' }) + '<p class="pa-fine">When you enter the cash and CPF yourself, we use those figures as they are.</p></div></details>' +
      '<p class="pa-sale-r" data-sale-r aria-live="polite"></p>' + chips('order', 'What happens first?', [['sell', 'Sell first'], ['buy', 'Buy first'], ['unsure', 'Not sure yet']], { value: '' }) + '</div>' +
      money('debts', 'Other monthly debts (car, cards, personal loans)', { opt: true, ph: '0', cls: 'pa-gap', hint: 'Home loan instalments are asked above, so leave them out here.' }) + '</section>' +
      '<section class="pa-sec" aria-labelledby="pa-h-money"><h2 class="pa-h" id="pa-h-money">Your money</h2><div class="pa-pair">' + money('cash', 'Cash', { ph: 'e.g. 300,000' }) + money('cpf', 'CPF OA you plan to use', { share: 'cpfOa', ph: 'e.g. 150,000', hint: CPF_HINT }) + '</div>' +
      '<p class="pa-note pa-cpfhint">CPF can cap what goes towards a home: its valuation and withdrawal limits, the home’s lease and your age. We do not check these, so enter the amount CPF has confirmed.</p>' +
      '<div data-when="kind:new"><p class="pa-l pa-l2">Each month towards the home</p><div class="pa-pair">' + money('saveMo', 'Cash', { ph: 'e.g. 3,000' }) + money('cpfMo', 'CPF', { ph: 'e.g. 2,000' }) + '</div><p class="pa-note">Used to check each payment date.</p></div>' +
      '<p class="pa-fine">Stays on this device.</p></section>' +
      '<section class="pa-sec" aria-labelledby="pa-h-home"><h2 class="pa-h" id="pa-h-home">The home</h2>' + chips('kind', 'What are you buying?', [['new', 'New launch'], ['completed', 'Completed private home'], ['hdb', 'HDB flat']], { value: 'new' }) +
      '<div class="pa-route" data-when="kind:hdb" hidden>' + hdbRoute(true) + '</div>' +
      '<p class="pa-note">Buying an EC, or buying before you sell? Use the <a href="../payment-planner/">payment timeline</a>.</p></section>' +
      '<section class="pa-sec" aria-labelledby="pa-h-loan"><h2 class="pa-h" id="pa-h-loan">The loan</h2><div class="pa-pair">' + numf('ratePct', 'Interest rate you expect', '% a year', { ph: '4', hint: 'Your instalment uses this. Banks test the loan at the higher of 4% and this rate.' }) + numf('years', 'Loan years', 'years', { ph: 'suggested for you', hint: 'Leave it empty and we suggest one. More than a bank allows is cut back to the maximum.' }) + '</div></section>' +
      '<details class="pa-adj" data-adj><summary><span>More options</span><em data-adj-sum></em></summary><div class="pa-adj-b">' +
      datef('otp', 'Option date') + money('setAside', 'Set aside for fees and renovation', { opt: true, ph: '0', hint: 'Kept out of the money used for the purchase.' }) + '</div></details>';
  }

  /* ---------------- page ---------------- */
  function pageHtml() {
    return '<section class="pa" data-pa><div class="pa-grid">' +
      '<aside class="pa-form" aria-label="Your details">' + formHtml() + '</aside>' +
      '<div class="pa-out" data-out aria-live="polite">' +
      '<div data-status></div><div class="pa-head" data-head></div>' +
      '<div class="pa-borrow" data-borrow hidden><p class="pa-l" id="pa-l-borrow">How much would you like to borrow?</p><div class="pa-borrow-r"><div class="pa-pin"><i>$</i><input id="pa-borrow" type="text" inputmode="decimal" autocomplete="off" data-k="prefLoan" data-t="money" aria-describedby="pa-borrow-note" aria-invalid="false"></div><button type="button" class="pa-link" data-borrow-max hidden>Use the most</button></div>' +
      '<input type="range" class="pa-range pa-brange" data-borrow-range aria-labelledby="pa-l-borrow" min="0" max="1000000" step="10000"><small class="pa-hint" id="pa-borrow-note" data-borrow-note></small><small class="pa-err" data-err="prefLoan" role="alert" hidden></small></div><div data-tenure></div>' +
      '<div class="pa-pricebox" data-pricebox hidden><div class="pa-prow"><label class="pa-l" for="pa-price">Try a price</label><div class="pa-pw"><div class="pa-pin"><i>$</i><input id="pa-price" type="text" inputmode="numeric" autocomplete="off" data-k="price" data-t="money" aria-describedby="pa-price-err"></div><button type="button" class="pa-link pa-reset" data-reset-price hidden>Use my comfortable budget</button></div></div>' +
      '<div class="pa-rangeW"><input type="range" class="pa-range" data-range aria-label="Price to try" min="100000" max="3000000" step="10000"></div><div class="pa-rlab"><span data-rlo></span><span data-rhi></span></div><small class="pa-err" id="pa-price-err" data-err="price" role="alert" hidden></small></div>' +
      '<div data-next></div><div data-tiles></div><div data-how></div>' +
      '<p class="pa-foot" data-foot hidden>Estimates from MAS, IRAS and HDB rules checked 9 Oct 2026. Not a bank offer or approval.</p>' +
      '<div class="pa-ask" data-ask hidden><a class="gw-btn sec" data-ask-wa href="https://wa.me/' + PHONE + '" target="_blank" rel="noopener" data-gw-wa="planner-ask">Talk it through with Ken</a><span class="pa-fine">Opens WhatsApp with a short message and none of your figures.</span></div>' +
      '<div class="pa-startover"><button type="button" class="pa-link" data-gw-clear-all aria-expanded="false">Clear all my figures</button></div>' +
      '</div></div>' +
      '<div class="pa-bar" data-bar hidden role="region" aria-label="Your budget"><div class="in"><span class="t"><small data-bar-k></small><b data-bar-v></b></span><button type="button" class="gw-btn pri" data-bar-go>See answer</button></div></div></section>' +
      '<noscript><p class="pa-fine">The Planner needs JavaScript. Ken can work it through with you on <a href="' + esc(waUrl('Hi Ken, I’d like help working out what I can afford. (Ref ' + REF + ')')) + '">WhatsApp</a>.</p></noscript>';
  }

  /* ---------------- the answer, drawn ---------------- */
  const tag = (kind, text) => '<span class="pa-badge ' + kind + '">' + text + '</span>';
  const plural = (n) => n + (n === 1 ? ' year' : ' years');
  const rateTxt = (res) => pc((res.ratePct === undefined ? 4 : res.ratePct) / 100, 2);
  const R_MAT = root.GW_RULES && root.GW_RULES.bankLtv && root.GW_RULES.bankLtv.maturityAge || 75;
  const maxTenure = () => (root.GW_RULES && root.GW_RULES.bankLtv && root.GW_RULES.bankLtv.maxTenure && root.GW_RULES.bankLtv.maxTenure.private) || 35;
  // Three figures, each saying what it is: what the bank may lend (a loan, for the tenure shown), what the buyer can comfortably pay (loan plus cash, CPF,
  // reserves and payment dates), and what the loan costs each month. The bank's lending capacity is never presented as the buyer's budget.
  function figs(res) {
    const c = res.comfortable, hi = res.highest, at = res.atComfortable || res.atHighest, onC = c !== null && res.atComfortable;
    const priceTxt = onC ? 'the ' + $s(c) + ' budget' : 'the ' + $s(hi) + ' highest price';
    const limit = !at ? '' : at.limit === 'income'
      ? 'Your income is what limits it: it supports ' + $s(at.incomeLoan) + ', where the loan limit would allow ' + $s(at.ruleLoan) + '.'
      : at.limit === 'choice' ? 'You chose to borrow less than the most the numbers allow.' : 'The loan limit is what limits it (' + pc(at.ltv) + ' of the price). Your income would support up to ' + $s(at.incomeLoan) + '.';
    const chosen = at && at.limit === 'choice';
    const loanFig = at ? '<div class="pa-fig"><div class="k">Maximum estimated loan</div><div class="d">The most the bank may lend</div><div class="v">' + $s(at.maxLoan) + '</div><div class="s"><p>Over ' + plural(res.years) + ', at ' + priceTxt + '.</p><p>' + (chosen ? 'You chose to borrow ' + $s(at.loan) + ' of it.' : limit) + '</p></div></div>' : '';
    const stretch = c !== null && hi > c ? ' You could stretch to <b>' + $s(hi) + '</b>.' : '';
    const budget = c !== null
      ? '<div class="pa-fig main"><div class="k">Comfortable budget</div><div class="d">What you can comfortably pay</div><div class="v">' + $s(c) + '</div><div class="s"><p>' + (res.atComfortable ? 'Loan plus your cash and CPF, with ' + $(round100(res.atComfortable.spare)) + ' left in hand after buying.' : '') + stretch + '</p></div></div>'
      : '<div class="pa-fig main"><div class="k">Comfortable budget</div><div class="d">What you can comfortably pay</div><div class="v none">Not yet</div><div class="s"><p>Nothing leaves your cushion in hand. The most the numbers allow is <b>' + $s(hi) + '</b>' + (res.atHighest ? (res.atHighest.spare < 1000 ? ', which leaves almost nothing in hand.' : ', which leaves about ' + $(round100(res.atHighest.spare)) + ' in hand.') : '.') + '</p></div></div>';
    const inst = at ? '<div class="pa-fig"><div class="k">Monthly instalment</div><div class="d">What the loan costs each month</div><div class="v">' + $(at.monthly) + '</div><div class="s"><p>On the ' + $s(at.loan) + ' you would borrow, over ' + plural(res.years) + ' at your expected ' + rateTxt(res) + '.</p></div></div>' : '';
    return '<div class="pa-figs">' + loanFig + budget + inst + '</div>';
  }

  // The sale of the home, in plain words. Counted: cash and CPF separately. Not counted: what is known, and exactly what is missing.
  const MISSING = { price: 'expected sale price', loan: 'loan left on it', refund: 'CPF refund including accrued interest', held: 'answer on whether you have owned it for 4 years', cash: 'cash you expect', cpf: 'CPF you expect back' };
  function saleLine(sl) {
    if (!sl) return '';
    if (sl.counted) {
      const src = sl.source === 'entered' ? 'Using your figures: ' : 'Estimated: ';
      if (sl.cash < 0) return src + 'the sale would not cover the loan and costs. You would need to add about <b>' + $(-sl.cash) + '</b> of your own cash.';
      if (sl.owner55) return src + 'about <b>' + $(sl.cash) + '</b> in cash. At 55 or over, the <b>' + $(sl.cpfRefund || 0) + '</b> CPF refund goes first to your Retirement Account up to the Full Retirement Sum, so none of it is counted. If some of it is free to use, add that to “CPF OA you plan to use”.';
      return src + 'about <b>' + $(sl.cash) + '</b> in cash and <b>' + $(sl.cpf) + '</b> back into your CPF' + (sl.source === 'estimated' ? ', after the loan, selling costs and your CPF refund' : '') + '.';
    }
    const known = sl.beforeCpf !== null && sl.beforeCpf !== undefined ? 'Known so far: about <b>' + $(Math.max(0, sl.beforeCpf)) + '</b> is left after the loan and selling costs, before your CPF refund. ' : '';
    const list = (sl.missing || []).map((k) => MISSING[k] || k);
    return known + 'Not counted yet' + (list.length ? ': add your ' + list.join(', ') : '') + '. Until then your home is treated as kept, the cautious view.';
  }
  function basisHtml(res) {
    const f = res.facts || {};
    if (res.basis === 'sell') return '<p class="pa-basis">Counting the sale of your home, sold first.</p>';
    if (res.basis !== 'keep') return '';
    let t;
    if (f.flatLoan === 'no') t = 'Keeping your home, fully paid: it still counts as a property you own (for ABSD), but no loan or instalment counts.';
    else if (f.flatLoan === 'unsure') t = '<span class="pa-badge est">Cautious view</span> You are not sure whether you still owe on your home, so it is counted as if you do: its loan' + (f.flatInstal > 0 ? ' and ' + $(f.flatInstal) + ' instalment' : '') + ' count.' + (res.ifPaid ? ' <b>If it is fully paid</b>, you could afford ' + (res.ifPaid.comfortable !== null ? 'about <b>' + $s(res.ifPaid.comfortable) + '</b> comfortably, up to <b>' + $s(res.ifPaid.highest) + '</b>' : 'up to <b>' + $s(res.ifPaid.highest) + '</b>') + '.' : '');
    else t = 'Keeping your home: its loan and instalment count.';
    if (f.otherOwned > 0) t += ' Your other property counts too' + (f.otherLoans > 0 ? ', with ' + (f.otherLoans === 1 ? 'its loan' : 'its ' + f.otherLoans + ' loans') + ' and ' + $(f.otherInstal) + ' a month' : '') + '.';
    return '<p class="pa-basis">' + t + '</p>';
  }

  function headHtml(res, held, waitText) {
    const kick = '<p class="pa-kick">You can afford</p>';
    if (res && res.state === 'hdb') return '<div class="pa-intro pa-hdb">' + '<p class="pa-kick">HDB flat</p><h2 class="pa-lead">An HDB flat needs the HDB calculator</h2>' + hdbRoute(false) + '</div>';
    if (!res || res.state === 'empty') return '<div class="pa-intro">' + kick + '<h2 class="pa-lead">What can you comfortably afford?</h2><p class="pa-p">Add your age and income to start. The answer updates as you type, and nothing leaves this device.</p></div>';
    if (res.state === 'no-income') return '<div class="pa-intro">' + kick + '<h2 class="pa-lead">No bank loan to work out</h2><p class="pa-p">Your income is entered as $0, so there is no income to lend against. Add income, including a co-borrower’s, to see what a bank could lend. Leave it blank if you have not decided yet.</p></div>';
    if (res.state === 'income' || res.state === 'ask-home' || res.state === 'ask-flat') {
      const prompt = res.state === 'income' ? 'Add your cash and CPF to see what that buys.' : res.state === 'ask-home' ? 'Answer the property questions on the left to see your budget.' : (PROMPTASK[(res.ask || [])[0]] || 'Answer the property questions on the left.');
      return '<div class="pa-intro">' + kick + '<h2 class="pa-lead">The bank may lend about <b>' + $s(Math.floor(res.borrow.max / 1e4) * 1e4) + '</b></h2><p class="pa-p">An estimate from your income alone, over ' + plural(res.borrow.years) + '. ' + prompt + '</p></div>';
    }
    if (res.state === 'out-of-reach') return '<div class="pa-intro">' + kick + '<h2 class="pa-lead">Nothing fits these figures yet</h2><p class="pa-p">' + (res.lever ? 'The biggest lever is cash: about <b>' + $(res.lever.amount) + '</b> more would bring a ' + $s(res.lever.forPrice) + ' home within reach.' : 'Adding cash is the biggest lever.') + '</p></div>';
    if (res.state === 'invalid') return '<div class="pa-intro">' + kick + '<h2 class="pa-lead">Check the entries marked on the left</h2></div>';
    const badge = res.estimate ? tag('est', 'Estimate · payments not checked yet') : tag('ok', 'Payments checked');
    const basis = basisHtml(res);
        let more = '';
    if (res.beneath && res.beneath.sell && res.beneath.sell.highest !== null) { const b = res.beneath.sell; more = '<p class="pa-beneath">' + (res.beneath.why === 'buy' ? 'Buying first, the sale isn’t counted yet, so this is the cautious figure. ' : 'Not sure yet, so this is the cautious figure. ') + '<b>Selling first</b>, you could afford ' + (b.comfortable !== null ? 'about <b>' + $s(b.comfortable) + '</b> comfortably, up to <b>' + $s(b.highest) + '</b>' : 'up to <b>' + $s(b.highest) + '</b>') + '.</p>'; }
    else if (res.saleNote === 'missing' && res.sale) more = '<p class="pa-beneath">' + saleLine(res.sale) + '</p>';
    return '<div class="pa-hd"><div class="pa-hdt">' + kick + (held ? '' : badge) + '</div>' + figs(res) + basis + cpfNote(res) + more + '</div>' + (held ? '<p class="pa-wait" role="status">' + esc(waitText) + '</p>' : '');
  }

  function cushionHtml(res, cur) {
    if (!res || res.state !== 'ok') return '';
    const m = cur.months, amt = cur.amount;
    const at = res.atComfortable || res.atHighest;
    const text = amt !== undefined ? 'Keeps ' + $(amt) + ' aside' : 'Keeps ' + m + ' months of instalments aside' + (at ? ' (about ' + $(round100(at.cushion)) + ')' : '');
    const opts = [[3, '3 months'], [6, '6 months'], [12, '12 months']];
    return '<div class="pa-cush"><span class="pa-cush-t">' + esc(text) + '</span> <button type="button" class="pa-link" data-cush-toggle aria-expanded="false">Change</button>' +
      '<div class="pa-cush-o" data-cush-o hidden><div class="pa-chips" role="group" aria-label="Keep in hand after buying" data-cush-chips>' + opts.map((o) => '<button type="button" class="pa-chip" data-cush="' + o[0] + '" aria-pressed="' + (amt === undefined && m === o[0]) + '">' + o[1] + '</button>').join('') + '<button type="button" class="pa-chip" data-cush="amount" aria-pressed="' + (amt !== undefined) + '">Own amount</button></div>' +
      '<label class="pa-f pa-cush-a" data-cush-a' + (amt === undefined ? ' hidden' : '') + '><span>Amount to keep in hand</span><div class="pa-in pa-m"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" data-k="cushionAmount" data-t="money" aria-invalid="false"></div><small class="pa-err" data-err="cushionAmount" role="alert" hidden></small></label></div></div>';
  }

  // The verdict on the price being tried. A price that does not fit is said calmly, in amber, with the date it first falls short; the way out follows.
  function statusHtml(res) {
    const a = res.at, zone = res.zone, P = res.price;
    let kind, text;
    if (zone === 'comfortable') { kind = 'ok'; text = '<b>' + $m(P) + ' works, comfortably.</b> ' + $(round100(a.spare)) + ' stays in hand after buying' + (a.monthly > 0 ? ', about ' + Math.max(1, Math.floor(a.spare / a.monthly)) + ' months of instalments' : '') + '.'; }
    else if (zone === 'tight') { kind = 'warn'; text = '<b>' + $m(P) + ' is tight.</b> It works, but only ' + $(round100(a.spare)) + ' is left in hand after buying, less than the ' + $(round100(a.cushion)) + ' you keep aside.'; }
    else {
      kind = 'warn';
      const firstOk = a.checked && a.covered === false && a.firstGap && a.firstAmt > 0, total = a.gap > 0.5 ? a.gap : a.peak, amount = firstOk ? a.firstAmt : total, lbl = String((firstOk ? a.firstCause : a.peakCause) || ''), when = /completion/i.test(lbl) ? ', when completion is due' : (lbl ? ', for ' + esc(lbl.toLowerCase()) : '');
      if (a.checked && a.covered === false && a.firstGap) text = '<b>' + $m(P) + ' doesn’t fit yet.</b> You would be ' + $(round100(amount)) + ' short on ' + day(a.firstGap) + when + '.' + (firstOk && total - a.firstAmt > 100 ? ' Across the later payments you are ' + $(round100(total)) + ' short in total.' : '');
      else text = '<b>' + $m(P) + ' doesn’t fit yet.</b> You would be ' + $(round100(a.gap)) + ' short' + (a.cashShort > 0 && a.flexShort === 0 ? ' in cash, which CPF can’t cover.' : '.');
    }
    return '<div class="pa-status ' + kind + '" role="status"><i class="pa-ic" aria-hidden="true">' + (kind === 'ok' ? '✓' : '!') + '</i><p>' + text + '</p></div>';
  }

  // The price being tried: the bank loan at that price, what it takes in cash and CPF, the instalment, and the way on to the payment dates.
  function tilesHtml(res) {
    const a = res.at;
    const why = a.limit === 'income' ? 'Limited by your income' : a.limit === 'choice' ? 'Your choice' : pc(a.ltv) + ' of the price';
    const pct = a.monthlyPct ? pc(a.monthlyPct) + ' of your income' : '';
    const title = res.priceIsOwn ? 'Your price: ' + $(res.price) : 'At ' + $m(res.price) + (res.comfortable !== null && res.price === res.comfortable ? ', your comfortable budget' : ', the highest the numbers allow');
    const t = (k, v, s) => '<div class="pa-tile"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
    return '<div class="pa-price"><h3 class="pa-h3">' + esc(title) + '</h3><div class="pa-tiles">' + t(a.limit === 'choice' ? 'Loan you chose' : 'Estimated bank loan', $(a.loan), esc(a.limit === 'choice' ? 'Your choice · the most would be ' + $(a.maxLoan) : why)) + t('Cash and CPF needed', $(a.upfront), 'You have ' + $(a.have) + (a.haveCpf > 0 ? ', counting your CPF as entered' : '')) + t('Monthly instalment', $(a.monthly), 'Over ' + plural(res.years) + (pct ? ' · ' + esc(pct) : '')) + '</div>' +
      '<a class="gw-btn pri pa-cta" href="../payment-planner/" data-pa-dates>Check the payment dates →</a></div>';
  }

  const rowsOf = (res) => (res._rows || (res._rows = res.options ? res.options() : []));
  // every valid tenure side by side; with `act`, each has its Use button
  function cmpTable(rows, t, act) {
    const body = (r) => {
      const diff = r.diff === null ? '–' : r.diff === 0 ? '–' : (r.diff > 0 ? '<span class="pos">+' + $(r.diff) + '</span>' : $(r.diff));
      const bud = r.budget !== null ? $s(r.budget) : (r.highest !== null ? 'up to ' + $s(r.highest) : '–');
      const btn = r.isCurrent ? '<span class="pa-fine">In use</span>' : '<button type="button" class="pa-btn pa-btn-s" data-use="' + (r.isSuggested ? 'auto' : r.years) + '" aria-label="Use ' + plural(r.years) + '">Use</button>';
      return '<tr' + (r.isCurrent ? ' class="sel"' : '') + '><td data-l="Tenure"><b>' + plural(r.years) + '</b>' + (r.isSuggested ? '<span class="pa-tag">Suggested</span>' : '') + (r.own ? '<span class="pa-tag own">Your choice</span>' : '') + '</td><td data-l="Ends at age">' + r.endAge + '</td><td data-l="Loan limit">' + (r.ltv ? pc(r.ltv) : '–') + '</td><td class="n" data-l="Bank loan">' + (r.loan !== null ? $s(r.loan) : '–') + '</td><td class="n" data-l="Budget">' + bud + '</td><td class="n" data-l="vs ' + t.years + ' years">' + diff + '</td>' + (act ? '<td class="n pa-act">' + btn + '</td>' : '') + '</tr>';
    };
    return '<div class="pa-tw"><table class="pa-t pa-cmp"><thead><tr><th>Tenure</th><th>Loan ends at age</th><th>Loan limit</th><th class="n">Estimated bank loan</th><th class="n">Budget</th><th class="n">Against ' + t.years + ' years</th>' + (act ? '<th><span class="sr">Use</span></th>' : '') + '</tr></thead><tbody>' + rows.map(body).join('') + '</tbody></table></div>';
  }
  // The loan tenure: what is used and why, the offer of a longer (or better) one when it adds 5% or more, and every valid alternative side by side.
  // The 5% rule only decides what is offered; the table always lists the others.
  function tenureHtml(res, cmpOpen, adj) {
    const t = res.tenure; if (!t) return '';
    const rows = rowsOf(res);
    const cur = rows.filter((r) => r.isCurrent)[0] || {}, stdRow = rows.filter((r) => r.isStd)[0] || {}, sugRow = rows.filter((r) => r.isSuggested)[0] || {};
    const std = stdRow.ltv ? pc(stdRow.ltv) : '75%';
    let lead, why;
    const mAge = root.GW_RULES && root.GW_RULES.bankLtv ? root.GW_RULES.bankLtv.maturityAge : 75, ageLine = 'Banks usually end a loan by age ' + mAge + ' (lender policy, not a MAS rule).';
    // the one sentence for the most allowed and why, and the loan limit it takes, are the calculators' own (gw-calc.js), the same words on every screen
    const maxLine = root.GW_CALC.tenureMaxText({ allowed: t.allowed, age: t.age, joint: t.joint }), tierLine = t.lower ? root.GW_CALC.tenureTierText({ std: t.std, allowed: t.allowed, ltvStd: stdRow.ltv, ltvLow: t.ltv }) : '', atMost = t.allowed >= 1 && t.years >= t.allowed;
    if (t.cappedFrom) { lead = 'Loan tenure: <b>' + plural(t.years) + '</b>, not the ' + plural(t.cappedFrom) + ' you entered.'; why = maxLine + (tierLine ? ' ' + tierLine : ''); }
    else if (t.manual && adj) { lead = 'Loan tenure: <b>' + plural(t.years) + '</b>, changed from the ' + plural(adj) + ' you entered.'; why = maxLine + (tierLine ? ' ' + tierLine : ''); }
    else if (t.manual && atMost) { lead = 'Loan tenure: <b>' + plural(t.years) + '</b>, the most allowed.'; why = maxLine + (tierLine ? ' ' + tierLine : ''); }
    else if (t.manual) { lead = 'Loan tenure: <b>' + plural(t.years) + '</b>, as you chose.'; why = ''; }
    else { lead = 'Loan tenure: <b>' + plural(t.years) + '</b>.'; why = t.std < 1 ? 'No tenure keeps the standard loan limit at your age, so the longest a bank usually lends is used, at the lower limit. ' + ageLine : 'The longest loan that keeps the standard loan limit at your age.'; }
    const facts = 'Loan ends at about age ' + t.endAge + (t.ltv ? ' · loan limit ' + pc(t.ltv) + ' of the price' : '') + (t.lower && t.lowerWhy ? ', the lower limit because ' + (t.lowerWhy === 'age' ? 'the loan runs past age 65' : 'the tenure is over 30 years') : '') + '.';
    let nudge = '';
    if (t.nudge) {
      const n = t.nudge, lim = n.lower && n.ltv && !t.lower ? ' The loan limit would drop to <b>' + pc(n.ltv) + '</b> of the price (from ' + std + ') because ' + (n.lowerWhy === 'age' ? 'the loan would run past age 65' : 'the tenure would be over 30 years') + '. Banks set their own age limits, so check with yours.' : '';
      const head = t.manual ? '<b>A ' + n.years + '-year tenure would suit you better.</b> Your budget would be ' + $s(n.budget) + ', ' + $(n.gain) + ' more.' : '<b>A longer loan could add to your budget.</b> ' + plural(n.years) + ' would give ' + $s(n.budget) + ', ' + $(n.gain) + ' more.';
      nudge = '<div class="pa-tnudge"><p>' + head + lim + '</p>' +
        '<div class="pa-tn-b"><button type="button" class="pa-btn pri" data-use="' + (n.years === t.std ? 'auto' : n.years) + '">Use ' + plural(n.years) + '</button><button type="button" class="pa-link" data-cmp aria-expanded="' + !!cmpOpen + '">Compare tenures</button></div></div>';
    }
    const table = '<div class="pa-cmp-w" id="pa-cmp" data-cmp-box' + (cmpOpen ? '' : ' hidden') + '>' + '<p class="pa-fine pa-tf">' + facts + '</p>' + cmpTable(rows, t, true) +
      '<p class="pa-fine">' + plural(Math.min(maxTenure(), t.allowed || maxTenure())) + ' is the longest a loan can run at your age. ' + ageLine + ' Banks set their own age limits, so check with yours. A longer loan can lower the loan limit.</p></div>';
    return '<div class="pa-tenure"><p class="pa-tl">' + lead + (why ? ' <span>' + why + '</span>' : '') + '</p>' + nudge +
      '<button type="button" class="pa-link pa-cmp-t" data-cmp aria-expanded="' + !!cmpOpen + '" aria-controls="pa-cmp">Compare tenures <span aria-hidden="true">' + (cmpOpen ? '▴' : '▾') + '</span></button>' + table + '</div>';
  }

  // the one next step: a fix when the price does not fit; the monthly amounts for an estimate; otherwise the payment dates
  function nextHtml(res, state) {
    if (res.zone === 'over' && res.fixes && res.fixes.length) {
      const a = res.at, gap = a.gap > 0.5 ? a.gap : a.peak;
      const rows = res.fixes.map((f) => {
        if (f.kind === 'price') return '<li class="pa-fix"><div class="pa-fix-t"><b>Lower the price to ' + $m(f.to) + '</b><span>' + (f.after.zone === 'comfortable' ? 'Comfortable, with money to spare.' : 'It fits, but it would be tight.') + '</span></div><button type="button" class="pa-btn" data-prev="price" aria-expanded="false">Preview</button>' + prevBlock(res, f) + '</li>';
        return '<li class="pa-fix"><div class="pa-fix-t"><b>Add about ' + $(f.add) + ' more cash</b><span>Covers ' + $m(res.price) + (f.after.zone === 'comfortable' ? '.' : ', but it would be tight.') + '</span></div><button type="button" class="pa-btn" data-prev="cash" aria-expanded="false">Preview</button>' + prevBlock(res, f) + '</li>';
      }).join('');
      return '<div class="pa-fixes"><p class="pa-kick">Ways to close the ' + $(round100(gap)) + ' gap</p><ul>' + rows + '</ul><p class="pa-fine">Nothing changes until you apply. You can undo it.</p></div>';
    }
    if (res.estimate && res.kind === 'new') return '<p class="pa-nudge">Add what goes in each month, on the left, and we’ll check every payment date. <button type="button" class="pa-link" data-focus="saveMo">Add monthly amounts</button></p>';
    return '';
  }
  function prevBlock(res, f) {
    const a = res.at, b = f.after, st = (x) => x.zone === 'comfortable' ? 'Comfortable' : x.zone === 'tight' ? 'Tight' : (x.checked && x.covered === false && x.gap <= 0.5 ? 'Short on ' + day(x.firstGap) : $(round100(x.gap)) + ' short');
    const row = (k, x, y) => '<div class="pa-pr"><span>' + k + '</span><b>' + x + ' <i aria-hidden="true">→</i><span class="sr"> becomes </span> ' + y + '</b></div>';
    const rows = (f.kind === 'price' ? row('Price', $(a.P), $(b.P)) : row('Cash', $(a.haveCash), $(b.haveCash))) + row('You would borrow', $(a.loan), $(b.loan)) + row('Cash and CPF needed', $(a.upfront), $(b.upfront)) + row('Result', st(a), st(b));
    return '<div class="pa-prev" data-prev-box="' + f.kind + '" hidden>' + rows + '<div class="pa-prev-b"><button type="button" class="pa-btn pri" data-apply="' + f.kind + '">Apply</button><button type="button" class="pa-btn" data-cancel>Cancel</button><span class="pa-fine">Nothing changes until you apply. You can undo it.</span></div></div>';
  }

  function howHtml(res, st) {
    const a = res.at, B = res.B, L = [];
    const row = (k, v) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>';
    // loan: what the income supports, what the loan limit allows, and the lower of the two
    const rows = rowsOf(res), stdRow = rows.filter((r) => r.isStd)[0] || {}, stdPc = stdRow.ltv ? pc(stdRow.ltv) : '75%', age = Math.round(B.iwaaUse);
    const reason = a.lower ? ' It is ' + pc(a.ltv) + ', not ' + stdPc + ', because ' + (a.lowerWhy === 'age' ? 'a ' + plural(a.years) + ' loan from age ' + age + ' runs past age 65.' : 'a loan over 30 years takes the lower limit.') : ' This is the standard limit.';
    const lr = (k, p, amt, cls) => '<div class="pa-lr' + (cls ? ' ' + cls : '') + '"><div><b>' + k + '</b><p>' + p + '</p></div><span class="pa-amt">' + $(amt) + '</span></div>';
    L.push(row('Your loan', '<div class="pa-lim">' +
      lr('What your income supports', '55% of the ' + $(round100(B.assessable)) + ' a month the bank counts' + (a.debts > 0 ? ', less ' + $(a.debts) + ' of debts' + (a.flatInstal ? ' (including your home’s instalment)' : '') : '') + ', tested at ' + pc(res.borrow.rate, 2) + ' (banks use the higher of 4% and your rate) over ' + plural(a.years) + '.', a.incomeLoan) +
      lr('What the loan limit allows', pc(a.ltv) + ' of the ' + $(a.P) + ' price' + (a.loans ? ' (a housing loan you still have counts, so the limit is lower)' : '') + '.' + esc(reason) + ' (MAS Notice 632)', a.ruleLoan) +
      lr('Maximum estimated loan', 'The lower of the two. ' + (a.limit === 'income' ? 'Income is what holds you back here.' : 'The loan limit is what holds you back here.') + ' The bank decides what it lends.', a.maxLoan, 'res') +
      (a.limit === 'choice' ? lr('Loan you chose', 'You chose to borrow less than the most. Your instalment and the cash and CPF needed follow this amount.', a.loan, 'res') : '') + '</div>'));
    L.push(row('Your instalment', '<b>' + $(a.monthly) + '</b> a month on ' + $(a.loan) + ', worked at your expected rate of ' + pc(res.ratePct / 100, 2) + ' over ' + plural(a.years) + '. The higher test rate is used only to check what you can borrow, never to price your instalment.'));
    if (st.twoBuyers && B.ageUnverified) L.push(row('Two borrowers', '<span class="pa-badge bad">Unverified</span> Weighting your ages by income gives ' + (Math.round(B.iwaa * 10) / 10) + ' or ' + (Math.round(B.iwaaGross * 10) / 10) + ', depending on whether MAS means counted or gross income. We use the older, ' + (Math.round(B.iwaaUse * 10) / 10) + ', so the loan is never overstated. Ask the bank which age it uses.'));
    // tenure
    const tt = res.tenure;
    if (tt) L.push(row('Your tenure', (tt.manual ? 'You chose ' + plural(tt.years) + ', so that is what is used. ' : (tt.std < 1 ? plural(tt.years) + ' is used: no tenure keeps the standard loan limit at your age, so it is the longest a bank usually lends. ' : plural(tt.years) + ' is used: the longest loan that keeps the standard loan limit at your age. ')) + (tt.cappedFrom ? 'You entered ' + plural(tt.cappedFrom) + ', but ' + plural(tt.years) + ' is the longest a bank usually lends at your age, so that is what is used. ' : '') + 'A longer one, up to ' + plural(tt.cap) + ' and ending by about age ' + R_MAT + ', is only offered when it adds 5% or more to your budget, and it takes the lower loan limit. ' + plural(Math.min(maxTenure(), tt.allowed || maxTenure())) + ' is the longest a loan can run at your age. Banks usually end a loan by age ' + R_MAT + ' (lender policy, not a MAS rule) but set their own age limits, so check with yours.' + cmpTable(rows, tt, false)));
    // duty
    L.push(row('Stamp duty', 'Buyer’s stamp duty <b>' + $(a.bsd) + '</b>' + (a.absd > 0 ? ' and additional buyer’s stamp duty (' + pc(a.absdRate) + ') <b>' + $(a.absd) + '</b>' : ', with no additional buyer’s stamp duty') + '. Paid in cash within 14 days of signing.'));
    // cash and CPF
    L.push(row('Cash and CPF', 'Cash alone pays the booking fee, the ' + pc(a.minCash) + ' minimum cash (' + $(a.cashMin) + ') and stamp duty: <b>' + $(a.cashOnly) + '</b>. The other <b>' + $(a.flexNeed) + '</b> can be cash or CPF. CPF is counted as you entered it, for this price only: no valuation or lease limit is applied, and the home is taken to be worth its price. What stays in hand is cash, not CPF.'));
    // sale
    if (res.basis === 'sell' && res.sale) L.push(row('Your sale', saleLine(res.sale) + (res.sale.source === 'estimated' ? ' This is the price, less the loan, your CPF refund as you entered it (it includes the accrued interest, which we do not estimate), the agent’s fee and legal costs. Cash and CPF are kept apart, and nothing is counted until the sale completes and the CPF is released.' : '')));
    else if (res.sale && !res.sale.counted) L.push(row('Your sale', saleLine(res.sale)));
    if (res.basis === 'keep') L.push(row('Your home', 'Counted as kept. Three things are worked out separately: the property you own (ABSD where it applies), the housing loan you still owe (it lowers the loan limit on the new home), and the monthly instalment (it reduces what your income can carry).' + (res.facts && res.facts.flatLoan === 'unsure' ? ' You were not sure about the loan, so it is counted; the fully paid result is shown beside the headline.' : '')));
    // dates
    let dates = '';
    if (res.checked && a.tl) {
      const ev = a.tl.events.filter((e) => e.type === 'pay'), prov = ev.some((e) => e.provisional), gapLine = a.covered === false && a.firstGap ? '<p class="pa-p pa-gapline"><b>Runs short on ' + day(a.firstGap) + '</b> (' + esc((a.peakCause || 'a payment').toLowerCase()) + ') by ' + $(round100(a.peak)) + '.</p>' : '';
      dates = '<div class="pa-dates" data-dates><p class="pa-sub">Payment dates</p>' + gapLine + '<div class="pa-tw"><table class="pa-t"><thead><tr><th>Date</th><th>Payment</th><th class="n">Amount</th><th class="n">Cash</th><th class="n">CPF</th><th class="n">Bank loan</th></tr></thead><tbody>' +
        ev.map((e) => '<tr' + (e.uncovered > 0 ? ' class="short"' : '') + '><td>' + day(e.date) + (e.confidence === 'estimate' && e.id !== 'top' && e.id !== 'csc' ? ' <small>earliest</small>' : '') + '</td><td>' + esc(e.label) + (e.provisional ? ' <span class="pa-badge est">Provisional</span>' : '') + (e.uncovered > 0 ? ' <span class="pa-badge bad">Short ' + $(round100(e.uncovered)) + '</span>' : '') + '</td><td class="n">' + $(e.amount) + '</td><td class="n">' + (e.cashUsed ? $(e.cashUsed) : '–') + '</td><td class="n">' + (e.cpfUsed ? $(e.cpfUsed) : '–') + '</td><td class="n">' + (e.bank ? $(e.bank) : '–') + '</td></tr>').join('') + '</tbody></table></div>' +
        '<p class="pa-fine">' + (res.kind === 'new' ? 'Stages with no date yet are tested at the earliest day they could be called. ' : '') + (prov ? 'The final 15% is shown as one provisional payment: the exact split between the certificate of statutory completion and legal completion is still to be verified. ' : '') + 'A later payment into your account never pays an earlier bill.</p></div>';
    } else dates = '<p class="pa-fine">The dated payments appear here once you add what goes in each month' + (res.kind === 'new' ? '' : '') + '.</p>';
    L.push(row('Rules', 'IRAS (BSD, ABSD), MAS Notices 632 and 645, CPF Board and the Housing Developers Rules, as recorded in Groundwork’s rules file (checked 9 Oct 2026). Planning conventions checked 15 Oct 2026.'));
    return '<details class="pa-how" data-how-d><summary><span>How we worked this out</span><em>income, limits, stamp duty, payment dates</em></summary><dl class="pa-dl">' + L.join('') + '</dl>' + dates + '</details>';
  }

  /* ---------------- browser ---------------- */
  function mount() {
    if (typeof document === 'undefined') return;
    const box = document.querySelector('[data-pa]'); if (!box) return;
    const C = root.GW_CALC, A = root.GW_ANSWER, KPT = root.KPT || { track: function () {} };
    if (!C || !A) return;
    const track = (n, p) => { try { KPT.track(n, Object.assign({ tool_name: 'planner' }, p || {})); } catch (e) { /* analytics unavailable */ } };
    const $$ = (s, el) => [].slice.call((el || box).querySelectorAll(s)), q = (s) => box.querySelector(s);
    const out = { head: q('[data-head]'), tenure: q('[data-tenure]'), pricebox: q('[data-pricebox]'), status: q('[data-status]'), tiles: q('[data-tiles]'), next: q('[data-next]'), how: q('[data-how]'), foot: q('[data-foot]'), ask: q('[data-ask]'), bar: q('[data-bar]') };
    const SHARE = 'gw.fin.v1', OWN = 'gw.ans.v1', HAND = 'gw.hand.v1';
    const store = (k) => ({ get() { try { return JSON.parse(root.sessionStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }, remove() { try { root.sessionStorage.removeItem(k); } catch (e) { /* storage blocked */ } }, set(o) { try { root.sessionStorage.setItem(k, JSON.stringify(o)); } catch (e) { /* storage blocked */ } } });
    const shared = store(SHARE), own = store(OWN), hand = store(HAND);
    const parseMoney = (s) => { const p = C.parseMoney(String(s).replace(/\.$/, '')); return p; };
    const fmtMoney = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const today = new Date(), todayIso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $$('input[data-k="otp"]').forEach((x) => { x.value = todayIso; });
    const chipVal = (g) => { const b = g.querySelector('[aria-pressed="true"]'); return b ? b.dataset.v : ''; };
    const setChip = (g, v) => { $$('button', g).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); };
    const field = (k) => box.querySelector('[data-k="' + k + '"]');
    const val = (k) => { const g = field(k); return !g ? '' : g.dataset.t === 'chip' ? chipVal(g) : g.value; };

    // ---- showing and hiding what is not yet relevant ----
    const bonusOn = { 0: false, 1: false };
    function showBonus(n, on) { bonusOn[n] = on; const b = q('[data-bonusbox="' + n + '"]'), l = q('[data-bonus="' + n + '"]'); if (b) b.hidden = !on; if (l) l.hidden = on; if (!on) { const f = field('buyers.' + n + '.variable'); if (f) f.value = ''; } }
    function applyWhen() {
      if (val('owns') === 'none') { const hg = field('home'); if (hg && chipVal(hg)) setChip(hg, ''); }
      $$('[data-when]').forEach((el) => { const parts = el.dataset.when.split(':'), k = parts[0], vs = parts[1].split(','); const v = val(k); el.hidden = vs.indexOf('*') >= 0 ? !(v !== '' && v !== undefined) : vs.indexOf(v) < 0; });
      const two = val('who') === 'two'; const r = q('[data-row="b1"]'); if (r) r.hidden = !two;
      if (!two) { ['age', 'fixed', 'variable'].forEach((f) => { const x = field('buyers.1.' + f); if (x) x.value = ''; }); showBonus(1, false); }
    }

    // ---- read the entries ----
    let cmpOpen = false, ptouched = false, errs = {}, last = null, lastOk = null, res = null, undo = null, stDirty = false, tmr = null, firstEdit = false, completedOnce = false;
    function readMoney(k) { const g = field(k); if (!g || (k !== 'price' && k !== 'prefLoan' && !live(g))) return undefined; const t = g.value.trim(); if (t === '') return undefined; const p = parseMoney(t); if (p.error) { errs[k] = p.error; return undefined; } return p.value; }
    function readNum(k, eg) { const g = field(k); if (!g || !live(g)) return undefined; const t = g.value.trim(); if (t === '') return undefined; const p = C.parseNum(t, eg); if (p.error) { errs[k] = p.error; return undefined; } return p.value; }
    function live(el) { for (let p = el; p && p !== box; p = p.parentElement) if (p.hidden) return false; return true; }
    function readEntries() {
      errs = {};
      const two = val('who') === 'two', buyers = [];
      [0, 1].forEach((n) => {
        if (n === 1 && !two) return;
        const age = readNum('buyers.' + n + '.age', n ? '33' : '35'), fixed = readMoney('buyers.' + n + '.fixed'), variable = readMoney('buyers.' + n + '.variable');
        buyers.push({ res: val('buyers.' + n + '.res') || 'SC', age: age, fixed: fixed, variable: variable });
      });
      const cushion = box.querySelector('[data-cush-chips]') ? cushionState() : { months: 6 };
      const owns = val('owns'), home = owns === 'none' ? 'none' : (owns ? (val('home') || null) : null), order = val('order') || null;
      const s = { kind: val('kind') || 'new', buyers: buyers, debts: readMoney('debts'), ratePct: readNum('ratePct', '4'), years: readNum('years', '30'), cash: readMoney('cash'), cpf: readMoney('cpf'), setAside: readMoney('setAside'),
        saveMo: readMoney('saveMo'), cpfMo: readMoney('cpfMo'), cushion: cushion, home: home, order: order, price: ptouched ? readMoney('price') : undefined, otp: val('otp') || undefined,
        owned: owns === 'two' ? 2 : owns === 'one' ? 1 : undefined, otherLoans: owns === 'two' && val('otherLoans') !== '' ? +val('otherLoans') : undefined, otherInstal: readMoney('otherInstal'), prefLoan: readMoney('prefLoan'),
        flat: { type: val('flat.type') || 'hdb', hasLoan: val('flat.hasLoan') || undefined, instalment: readMoney('flat.instalment'), price: readMoney('flat.price'), loan: readMoney('flat.loan'), cpfRefund: readMoney('flat.cpfRefund'),
          overrideCash: readMoney('flat.overrideCash'), overrideCpf: readMoney('flat.overrideCpf'), costs: readMoney('flat.costs'), heldOver4: val('flat.held') === 'yes' ? true : undefined } };
      if (home === 'none') s.flat = {};
      return s;
    }
    let cush = { months: 6 };
    function cushionState() { if (val('cushionAmount') !== '' && cush.amount !== undefined) { const p = parseMoney(val('cushionAmount')); if (p.error) { errs.cushionAmount = p.error; return { months: 6 }; } return { amount: p.value }; } return cush.amount !== undefined ? { amount: 0 } : { months: cush.months }; }

    // ---- compute and draw ----
    const WAIT = (r, s) => { if (r.state === 'invalid') { const e = (r.errors || [])[0]; const f = e && field(e.key); const lab = f ? (f.closest('.pa-f') && f.closest('.pa-f').querySelector('span') ? f.closest('.pa-f').querySelector('span').textContent.replace(/\s*optional\s*$/, '').trim().toLowerCase() : e.key) : ''; return 'Paused: check ' + (lab || 'your entries') + '.'; }
      if (r.state === 'no-income') return 'Income is $0: no loan to work out.';
      if (r.state === 'empty') return 'Waiting for ' + (r.need && r.need.length ? r.need.map((x) => WHYWAIT[x]).join(' and ') : 'your age and income') + '.';
      if (r.state === 'income') return 'Waiting for ' + (typeof s.cash === 'undefined' && typeof s.cpf === 'undefined' ? 'your cash and CPF' : 'your cash and CPF') + '.';
      if (r.state === 'ask-home') return 'Waiting for ' + WHYWAIT.home + '.'; if (r.state === 'ask-flat') return 'Waiting for ' + (WHYASK[(r.ask || [])[0]] || WHYWAIT.flat) + '.'; return ''; };
    function paintErrors(list) {
      const map = {}; (list || []).forEach((e) => { if (!map[e.key]) map[e.key] = e.text; }); Object.keys(errs).forEach((k) => { map[k] = errs[k]; });
      $$('[data-err]').forEach((m) => { const k = m.dataset.err, msg = map[k], f = field(k); if (msg) { m.textContent = msg; m.hidden = false; if (f) { f.setAttribute('aria-invalid', 'true'); const w = f.closest('.pa-in, .pa-pin'); if (w) w.classList.add('bad'); } } else { m.hidden = true; m.textContent = ''; if (f) { f.setAttribute('aria-invalid', 'false'); const w = f.closest('.pa-in, .pa-pin'); if (w) w.classList.remove('bad'); } } });
    }
    function sale(n) { const el = q('[data-sale-r]'); if (!el) return; el.innerHTML = n && n.sale && val('home') === 'sell' ? saleLine(n.sale) : ''; }
    // the borrowing control: the slider runs from nothing to the most the income supports (so it does not move as the budget does); "Use the most" clears the choice
    function setBorrowUi(r) {
      const bx = q('[data-borrow]'); if (!bx) return;
      if (!r || r.state !== 'ok' || !r.at) { bx.hidden = true; return; }
      bx.hidden = false;
      const rg = q('[data-borrow-range]'), f = field('prefLoan'), mx = r.at.maxLoan, cap = Math.max(10000, Math.ceil((r.borrow && r.borrow.max ? r.borrow.max : mx) / 10000) * 10000), choice = r.at.limit === 'choice';
      rg.max = String(cap); rg.value = String(choice ? r.at.loan : Math.min(mx, cap)); rg.setAttribute('aria-valuetext', $(choice ? r.at.loan : mx));
      rg.style.setProperty('--pos', (Math.min(100, (+rg.value) / cap * 100)).toFixed(1) + '%');
      f.placeholder = 'the most: ' + fmtMoney(Math.floor(mx));
      q('[data-borrow-max]').hidden = f.value.trim() === '';
      const typed = f.value.trim() !== '' ? parseMoney(f.value) : null;
      q('[data-borrow-note]').textContent = choice ? 'You would borrow ' + $(r.at.loan) + ' of the ' + $(mx) + ' the bank may lend at this price. Borrowing less means more cash and CPF now and a smaller instalment.' : typed && !typed.error && typed.value > mx ? 'That is more than the ' + $(mx) + ' the numbers allow at this price, so ' + $(mx) + ' is used.' : 'Up to ' + $(mx) + ', the most the numbers allow at this price. Borrowing less means more cash and CPF now and a smaller instalment.';
    }
    function adjSummary(s) { const e = q('[data-adj-sum]'); if (!e) return; e.textContent = [s.otp ? 'option ' + day(s.otp) : '', s.setAside > 0 ? '$' + fmtMoney(s.setAside) + ' set aside' : ''].filter(Boolean).join(' · '); }
    function setPriceUi(r) {
      const rg = q('[data-range]'), pf = field('price'), box2 = out.pricebox;
      if (!r || r.state !== 'ok') { box2.hidden = true; return; }
      box2.hidden = false; const g = r.range;
      rg.min = String(g.lo); rg.max = String(g.hi); rg.step = String(g.step); rg.value = String(Math.min(g.hi, Math.max(g.lo, r.price)));
      const pct = (x) => Math.max(0, Math.min(100, (x - g.lo) / (g.hi - g.lo) * 100));
      const cpt = r.comfortable !== null && r.comfortable !== undefined ? pct(r.comfortable) : 0, hpt = pct(r.highest);
      rg.style.setProperty('--ok', cpt.toFixed(1) + '%'); rg.style.setProperty('--lim', hpt.toFixed(1) + '%'); rg.style.setProperty('--pos', pct(r.price).toFixed(1) + '%');
      q('[data-rlo]').textContent = $s(g.lo); q('[data-rhi]').textContent = $s(g.hi);
      if (document.activeElement !== pf) pf.value = fmtMoney(r.price);
      q('[data-reset-price]').hidden = !r.priceIsOwn;
      rg.setAttribute('aria-valuetext', $(r.price) + ', ' + (r.zone === 'comfortable' ? 'comfortable' : r.zone === 'tight' ? 'tight' : 'over'));
    }
    // the answer column stays in view beside the entries only while it fits the window; a taller one scrolls with the page, so nothing is cut off
    const outEl = q('[data-out]');
    function fitSticky() { if (outEl) outEl.classList.toggle('pa-tall', outEl.scrollHeight > (root.innerHeight || 800) - 100); }
    root.addEventListener('resize', fitSticky); box.addEventListener('toggle', fitSticky, true);
    let heldHtml = null;
    let tenureFld = null; const yAdj = () => { const y = field('years'); return y && +y.dataset.adjustedFrom > 0 ? +y.dataset.adjustedFrom : 0; };
    function recalc() {
      dirty = false; applyWhen();
      const s = readEntries(); stDirty = false;
      const r = A.assess(s);
      // the tenure field shows the tenure the calculation used (gw-money.js): a longer one typed is replaced by it once the field is not being typed in
      if (tenureFld) { const applied = r.state === 'ok' ? r.years : 0; if (tenureFld.settle(applied)) { recalc(); return; } tenureFld.hint(applied); }
      res = r; const st = { monthly: s.saveMo === undefined ? 0 : (s.saveMo || 0) + (s.cpfMo || 0), twoBuyers: s.buyers.length > 1 };
      const hasErr = Object.keys(errs).length > 0, bad = r.state === 'invalid' || hasErr;
      paintErrors(r.errors); sale(A.read(s)); adjSummary(s);
      const ok = r.state === 'ok' && !hasErr;
      if (r.state === 'hdb') {
        // no private-home figure is shown for an HDB flat, not even a dimmed earlier one; the route to the HDB calculator replaces it
        last = null; out.head.className = 'pa-head'; out.head.innerHTML = headHtml(r); out.tenure.innerHTML = ''; out.pricebox.hidden = true; setBorrowUi(null); out.status.innerHTML = out.tiles.innerHTML = out.next.innerHTML = out.how.innerHTML = '';
        out.foot.hidden = true; out.ask.hidden = true;
      } else if (ok) {
        last = r; lastOk = r;
        out.head.className = 'pa-head'; out.head.innerHTML = headHtml(r) + cushionHtml(r, cush); out.tenure.innerHTML = tenureHtml(r, cmpOpen, yAdj());
        restoreCushionUi(s);
        setPriceUi(r); setBorrowUi(r); out.status.innerHTML = statusHtml(r); out.tiles.innerHTML = tilesHtml(r); out.next.innerHTML = nextHtml(r, st); out.how.innerHTML = howHtml(r, st);
        out.foot.hidden = false; out.ask.hidden = false; heldHtml = out.head.innerHTML;
        if (!completedOnce) { completedOnce = true; track('tool_completed', {}); }
      } else if (lastOk && (bad || r.state === 'empty' || r.state === 'no-income' || r.state === 'income' || r.state === 'ask-home' || r.state === 'ask-flat')) {
        // an entry is being fixed or cleared: the last good figure stays, dimmed, with the plain reason; nothing below it is shown as current
        out.head.className = 'pa-head held'; out.head.innerHTML = headHtml(lastOk, true, WAIT(r, s)) ; out.tenure.innerHTML = ''; out.pricebox.hidden = true; setBorrowUi(null); out.status.innerHTML = ''; out.tiles.innerHTML = ''; out.next.innerHTML = ''; out.how.innerHTML = ''; last = null;
        out.head.querySelectorAll('.pa-badge').forEach((b) => b.remove());
      } else {
        last = null; out.head.className = 'pa-head'; out.head.innerHTML = headHtml(bad ? { state: 'invalid' } : r); out.tenure.innerHTML = ''; out.pricebox.hidden = true; setBorrowUi(null); out.status.innerHTML = out.tiles.innerHTML = out.next.innerHTML = out.how.innerHTML = '';
        out.foot.hidden = true; out.ask.hidden = true;
      }
      if (r.state === 'ok' || (lastOk && !bad)) out.foot.hidden = false;
      barUpdate(); wa(); save(); fitSticky();
    }
    function restoreCushionUi(s) { /* the chips are redrawn with the head; keep the amount field in step */ const f = field('cushionAmount'); if (f && cush.amount !== undefined && document.activeElement !== f) f.value = cush.amount ? fmtMoney(cush.amount) : f.value; }

    // ---- the persistent bar (phones) ----
    const mq = root.matchMedia ? root.matchMedia('(max-width: 899px)') : { matches: false };
    let headVisible = true; const io = root.IntersectionObserver ? new root.IntersectionObserver((es) => { headVisible = es[0].isIntersecting; barUpdate(); }, { threshold: 0.4 }) : null; if (io && out.head) io.observe(out.head);
    const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && !/^(checkbox|radio|button|submit|range)$/.test(a.type); };
    const kbUp = () => (root.visualViewport ? root.visualViewport.height < root.innerHeight * 3 / 4 : false);
    function barUpdate() {
      const r = last, show = mq.matches && !!r && !headVisible && !typing() && !kbUp();
      if (r) { q('[data-bar-k]').textContent = 'Comfortable budget'; q('[data-bar-v]').textContent = r.comfortable !== null ? 'about ' + $s(r.comfortable) : 'up to ' + $s(r.highest); }
      out.bar.hidden = !show; document.body.classList.toggle('pa-has-bar', !!show);
    }
    document.addEventListener('focusin', () => setTimeout(barUpdate, 0)); document.addEventListener('focusout', () => setTimeout(barUpdate, 60));
    if (root.visualViewport) root.visualViewport.addEventListener('resize', barUpdate); if (mq.addEventListener) mq.addEventListener('change', barUpdate);
    q('[data-bar-go]').addEventListener('click', () => { out.head.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    // a focused field is never left behind the keyboard or the bar
    box.addEventListener('focusin', (e) => { const t = e.target; if (mq.matches && t && t.matches && t.matches('input') && t.scrollIntoView) setTimeout(() => { try { if (document.activeElement === t) t.scrollIntoView({ block: 'center' }); } catch (x) { /* ignore */ } }, 280); });

    // ---- storage ----
    function snapshot() {
      const o = {};
      $$('[data-k]').forEach((x) => { const k = x.dataset.k; if (k === 'price' && !ptouched) return; const v = x.dataset.t === 'chip' ? chipVal(x) : x.value; if (v === '' || v === null) return; if (k === 'otp' && v === todayIso) return; if (x.dataset.t === 'chip' && v === (x.dataset.default || '')) return; o[k] = v; });
      if (ptouched) o._pt = true; if (bonusOn[0] || bonusOn[1]) o._bonus = [bonusOn[0], bonusOn[1]]; if (cush.amount !== undefined || cush.months !== 6) o._cush = cush;
      return o;
    }
    function apply(o) {
      // entries saved before the property questions were split: read them into the new questions, never as an assumption
      o = Object.assign({}, o);
      if (!o.owns && o.home === 'none') { o.owns = 'none'; delete o.home; } else if (!o.owns && (o.home === 'keep' || o.home === 'sell')) o.owns = 'one';
      if (!o['flat.hasLoan'] && o['flat.instalment'] !== undefined && o['flat.instalment'] !== '') { const iv = parseMoney(String(o['flat.instalment'])); if (!iv.error && iv.value !== undefined) o['flat.hasLoan'] = iv.value > 0 ? 'yes' : 'no'; }
      ptouched = !!(o._pt || (o.price && o._pt === undefined));
      $$('[data-k]').forEach((x) => { const k = x.dataset.k; const v = o[k]; if (x.dataset.t === 'chip') setChip(x, v === undefined ? (x.dataset.default || '') : v); else x.value = v === undefined ? (k === 'otp' ? todayIso : '') : v; });
      showBonus(0, !!(o._bonus && o._bonus[0] || o['buyers.0.variable'])); showBonus(1, !!(o._bonus && o._bonus[1] || o['buyers.1.variable']));
      if (o['buyers.0.variable']) field('buyers.0.variable').value = o['buyers.0.variable']; if (o['buyers.1.variable']) field('buyers.1.variable').value = o['buyers.1.variable'];
      cush = o._cush || { months: 6 };
    }
    // What the Payment Timeline needs to show the same numbers: the buyer's own entries, nothing else. Tab-only (gw.hand.v1); never in an address, an analytics event or the WhatsApp message.
    function handoffOf(s, r) {
      const sum = (k) => s.buyers.reduce((a, b) => a + (b[k] > 0 ? b[k] : 0), 0), pos = (x) => (x > 0 ? x : 0), keep = r.basis === 'keep', sell = r.basis === 'sell';
      const h = { v: 1, fresh: true, kind: r.kind, price: r.price, years: r.tenure && r.tenure.manual ? r.years : '', ratePct: r.ratePct, age: Math.round(r.B.iwaaUse * 100) / 100, cash: Math.max(0, pos(s.cash) - pos(s.setAside)), cpf: pos(s.cpf),
        income: sum('fixed'), varIncome: sum('variable'), debts: pos(s.debts) + (r.at ? r.at.flatInstal : 0), otp: s.otp || '', order: sell ? 'sell' : 'none',
        buyers: s.buyers.map((b) => ({ res: b.res, owned: keep || sell ? (r.facts ? r.facts.owned : 1) : 0 })), loansOther: r.at ? r.at.loans : 0, prefLoan: r.at && r.at.limit === 'choice' ? r.at.loan : '' };
      if (r.kind === 'new') { h.saveMo = pos(s.saveMo); h.cpfMo = pos(s.cpfMo); }
      if (sell && r.sale && r.sale.counted) { const f = s.flat || {}; h.sale = { type: f.type || 'hdb', heldOver4: f.heldOver4 === true, price: f.price, loan: f.loan, cpfRefund: f.cpfRefund, overrideCash: f.overrideCash, overrideCpf: f.overrideCpf, costs: f.costs }; }
      return h;
    }
    let saveT = null;
    function save() {
      const o = snapshot(); if (Object.keys(o).length) own.set(o); else own.remove();
      const s = shared.get(); $$('[data-share]').forEach((x) => { if (!live(x)) return; const v = x.dataset.t === 'chip' ? chipVal(x) : x.value; if (v !== null && v !== '' && !(x.dataset.t === 'chip' && v === (x.dataset.default || ''))) s[x.dataset.share] = v; else delete s[x.dataset.share]; });
      const p = field('price'); if (p && p.value !== '' && res && res.priceIsOwn) s.buyPrice = p.value; else if (p && p.value === '') delete s.buyPrice; if (Object.keys(s).length) shared.set(s); else shared.remove();
      if (last && res && res.state === 'ok' && !Object.keys(errs).length) hand.set(handoffOf(readEntries(), res)); else hand.remove();
    }
    let dirty = false; root.__paSettled = () => !dirty;
    const changed = () => { dirty = true; if (!firstEdit) { firstEdit = true; track('tool_started', {}); } clearTimeout(tmr); tmr = setTimeout(recalc, 100); };

    // ---- inputs: live commas on money fields (one behaviour for every calculator: gw-money.js) ----
    if (root.GW_MONEY) $$('input[data-t="money"]').forEach((x) => root.GW_MONEY.wire(x, { parse: (t) => { const p = parseMoney(t); return !p.error && p.value !== undefined ? p.value : null; }, max: C.LIMITS.money.max }));
    { const yEl = field('years'); if (root.GW_MONEY && root.GW_MONEY.tenureField && yEl) tenureFld = root.GW_MONEY.tenureField(yEl, { read: () => { const p = C.parseNum(yEl.value); return p.error ? null : (p.value || null); }, max: () => C.LIMITS.years.max, recalc: () => { clearTimeout(tmr); recalc(); } }); }
    box.addEventListener('input', (e) => { const t = e.target; if (!t.matches || !t.matches('input')) return; if (t.matches('[data-borrow-range]')) { borrowFromRange(); return; } if (t.matches('[data-range]')) return; if (t.dataset.k === 'price') { ptouched = t.value.trim() !== ''; if (!ptouched) { changed(); return; } changedPrice(); return; } changed(); });
    box.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('input[data-k]') && !e.target.matches('[data-range]')) changed(); });
    // chips (static in the form; the cushion chips are redrawn with the head)
    box.addEventListener('click', (e) => {
      const t = (s) => e.target.closest(s);
      const chip = t('.pa-chips[data-k] .pa-chip');
      if (chip) { const g = chip.parentElement, was = chipVal(g); setChip(g, chip.dataset.v); if (g.dataset.k === 'order' && was === chip.dataset.v) { /* stays chosen */ } if (g.dataset.k === 'home' || g.dataset.k === 'order' || g.dataset.k === 'kind' || g.dataset.k === 'who') track('planner_choice', { field: g.dataset.k, value: chip.dataset.v }); if (g.dataset.k === 'who' && chip.dataset.v === 'two') { /* second buyer row appears */ } clearTimeout(tmr); recalc(); return; }
      const bn = t('[data-bonus]'); if (bn) { showBonus(+bn.dataset.bonus, true); const f = field('buyers.' + bn.dataset.bonus + '.variable'); if (f) f.focus(); changed(); return; }
      const ct = t('[data-cush-toggle]'); if (ct) { const o = q('[data-cush-o]'); o.hidden = !o.hidden; ct.setAttribute('aria-expanded', String(!o.hidden)); return; }
      const cu = t('[data-cush]'); if (cu) {
        const v = cu.dataset.cush; if (v === 'amount') { const cur = res && res.atComfortable ? Math.round(res.atComfortable.cushion / 1000) * 1000 : 0; cush = { amount: cur }; } else cush = { months: +v };
        track('planner_cushion', { choice: v }); const keepOpen = true; clearTimeout(tmr); recalc(); const o = q('[data-cush-o]'); if (o && keepOpen) { o.hidden = false; const tg = q('[data-cush-toggle]'); if (tg) tg.setAttribute('aria-expanded', 'true'); } const af = field('cushionAmount'); if (af && cush.amount !== undefined) { af.value = cush.amount ? fmtMoney(cush.amount) : ''; af.focus(); } return; }
      const cm = t('[data-cmp]'); if (cm) { cmpOpen = !cmpOpen; const bx = q('[data-cmp-box]'); if (bx) bx.hidden = !cmpOpen; $$('[data-cmp]').forEach((x) => { x.setAttribute('aria-expanded', String(cmpOpen)); const ar = x.querySelector('[aria-hidden]'); if (ar) ar.textContent = cmpOpen ? '▴' : '▾'; }); if (cmpOpen) track('planner_tenure_compare', {}); fitSticky(); return; }
      const us = t('[data-use]'); if (us) { const f = field('years'); if (f) { f.value = us.dataset.use === 'auto' ? '' : us.dataset.use; delete f.dataset.adjustedFrom; } track('planner_tenure_use', { choice: us.dataset.use === 'auto' ? 'suggested' : 'own' }); clearTimeout(tmr); recalc(); return; }
      const fo = t('[data-focus]'); if (fo) { const f = field(fo.dataset.focus); if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); f.focus({ preventScroll: true }); } return; }
      const oh = t('[data-open-how]'); if (oh) { const d = q('[data-how-d]'); if (d) { d.open = true; d.scrollIntoView({ block: 'start', behavior: 'smooth' }); } return; }
      const bm = t('[data-borrow-max]'); if (bm) { field('prefLoan').value = ''; track('planner_borrow', { choice: 'most' }); clearTimeout(tmr); recalc(); return; }
      const rp = t('[data-reset-price]'); if (rp) { ptouched = false; field('price').value = ''; clearTimeout(tmr); recalc(); return; }
      const pv = t('[data-prev]'); if (pv) { const k = pv.dataset.prev, b = q('[data-prev-box="' + k + '"]'); $$('[data-prev-box]').forEach((x) => { if (x !== b) { x.hidden = true; } }); $$('[data-prev]').forEach((x) => { if (x !== pv) x.setAttribute('aria-expanded', 'false'); }); b.hidden = !b.hidden; pv.setAttribute('aria-expanded', String(!b.hidden)); track('planner_preview', { fix: k }); return; }
      if (t('[data-cancel]')) { $$('[data-prev-box]').forEach((x) => { x.hidden = true; }); $$('[data-prev]').forEach((x) => x.setAttribute('aria-expanded', 'false')); return; }
      const ap = t('[data-apply]'); if (ap && res && res.fixes) { applyFix(ap.dataset.apply); return; }
      if (t('[data-undo]')) { undoFix(); return; }
    });
    // ---- price: the slider and the typed price are one control ----
    let rafT = null;
    function priceFromRange() { const rg = q('[data-range]'); ptouched = true; field('price').value = fmtMoney(+rg.value); changedPrice(true); }
    function changedPrice(fromRange) { if (!res || res.state !== 'ok') { changed(); return; } dirty = true; clearTimeout(rafT); rafT = setTimeout(() => quoteNow(fromRange), fromRange ? 0 : 140); if (!firstEdit) { firstEdit = true; track('tool_started', {}); } }
    function quoteNow() {
      dirty = false;
      if (!lastOk || !res || res.state !== 'ok') { recalc(); return; }
      const p = parseMoney(field('price').value); if (p.error || p.value === undefined || !(p.value > 0)) { errs.price = p.error || 'Enter a price.'; paintErrors([]); return; }
      if (p.value > C.LIMITS.money.max) { errs.price = C.LIMITS.money.text; paintErrors([]); return; }
      errs = {}; const qt = res.quote(p.value); if (!qt) return;
      res.price = p.value; res.priceIsOwn = true; res.at = qt.at; res.zone = qt.zone; res.range = qt.range; res.fixes = qt.fixes; last = res; lastOk = res;
      const s = readEntries(); const st = { monthly: (s.saveMo || 0) + (s.cpfMo || 0), twoBuyers: s.buyers.length > 1 };
      paintErrors([]); out.status.innerHTML = statusHtml(res); out.tiles.innerHTML = tilesHtml(res); out.next.innerHTML = nextHtml(res, st); const keepOpen = q('[data-how-d]') && q('[data-how-d]').open; out.how.innerHTML = howHtml(res, st); if (keepOpen) q('[data-how-d]').open = true;
      setPriceUi(res); setBorrowUi(res); save(); fitSticky();
    }
    q('[data-range]').addEventListener('input', priceFromRange);
    function borrowFromRange() { const rg = q('[data-borrow-range]'), f = field('prefLoan'), v = +rg.value; f.value = v >= +rg.max || (res && res.at && v >= res.at.maxLoan - 5000) ? '' : fmtMoney(v); track('planner_borrow', { choice: f.value === '' ? 'most' : 'less' }); changed(); }
    // ---- fixes: preview, apply, undo (exact restore of every entry) ----
    function applyFix(kind) {
      const f = res.fixes.filter((x) => x.kind === kind)[0]; if (!f) return;
      undo = { snap: snapshot(), label: kind === 'price' ? 'price' : 'cash' };
      if (kind === 'price') { ptouched = true; field('price').value = fmtMoney(f.to); } else { const c = parseMoney(field('cash').value); field('cash').value = fmtMoney((c.value || 0) + f.add); }
      track('planner_fix_apply', { fix: kind }); clearTimeout(tmr); recalc(); showUndo(kind, f);
    }
    function showUndo(kind, f) {
      let b = q('[data-undo-bar]'); if (!b) { b = document.createElement('div'); b.className = 'pa-undo'; b.setAttribute('data-undo-bar', ''); b.setAttribute('role', 'status'); out.status.insertAdjacentElement('beforebegin', b); }
      b.innerHTML = '<span>Applied: ' + (kind === 'price' ? 'price now ' + $(f.to) : 'cash up by ' + $(f.add)) + '.</span> <button type="button" class="pa-link" data-undo>Undo</button>'; b.hidden = false;
    }
    function undoFix() { if (!undo) return; apply(undo.snap); undo = null; const b = q('[data-undo-bar]'); if (b) { b.hidden = true; b.innerHTML = ''; } track('planner_fix_undo', {}); clearTimeout(tmr); recalc(); }
    // any other edit retires the undo (it would no longer restore what the buyer sees)
    box.addEventListener('input', (e) => { if (undo && e.target.matches && e.target.matches('input') && !e.target.matches('[data-range]') && e.target.dataset.k !== 'price') { undo = null; const b = q('[data-undo-bar]'); if (b) { b.hidden = true; b.innerHTML = ''; } } }, true);
    function wa() { const a = q('[data-ask-wa]'); if (!a) return; const m = 'Hi Ken, I’m using the Planner on Groundwork and would like to talk through what I can afford. (Ref ' + REF + ')'; const u = waUrl(m); if (root.GW_WA) root.GW_WA.set(a, u); else a.setAttribute('href', u); }

    // ---- restore: the other calculators' shared details, then this tab's own entries ----
    const sv = shared.get(), ov = own.get();
    const start = Object.assign({}, ov);
    $$('[data-share]').forEach((x) => { const v = sv[x.dataset.share]; const k = x.dataset.k; if (v !== undefined && v !== '' && start[k] === undefined) start[k] = v; });
    if (sv.buyPrice && start.price === undefined) { start.price = sv.buyPrice; start._pt = true; }
    if (start['buyers.1.age'] !== undefined || start['buyers.1.fixed'] !== undefined || start['buyers.1.res'] !== undefined && sv['buyers.1.res']) { if (start.who === undefined) start.who = 'two'; }
    apply(start);
    recalc();
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }
  return { saleLine, basisHtml, pageHtml, formHtml, headHtml, statusHtml, tilesHtml, tenureHtml, nextHtml, howHtml, cushionHtml, figs, $s, $m, REF };
});
