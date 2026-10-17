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
  const WHYWAIT = { age: 'your age', income: 'your income', cash: 'your cash', cpf: 'your CPF', home: 'whether you own a home now', flat: 'the monthly instalment on your home loan' };

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
      chips('who', 'Buying', [['alone', 'Buying alone'], ['two', 'With someone']], { value: 'alone', cls: 'pa-who' }) + buyerRow(0) + buyerRow(1) + '</section>' +
      '<section class="pa-sec"><div data-grp="home">' + chips('home', 'Do you own a home now?', [['none', 'No property'], ['keep', 'Own one: keeping it'], ['sell', 'Own one: selling it']], { value: '' }) + '</div>' +
      '<div class="pa-own" data-when="home:keep,sell" hidden>' + money('flat.instalment', 'Monthly instalment on its loan', { ph: 'type 0 if none', hint: 'Counts towards what you can borrow while you still own it.' }) + '</div>' +
      '<div class="pa-sale" data-when="home:sell" hidden><h3 class="pa-h3">Sale of your home</h3>' + chips('flat.type', 'What are you selling?', [['hdb', 'HDB flat'], ['private', 'Private home']], { value: 'hdb' }) +
      '<div data-when="flat.type:hdb"><div class="pa-pair">' + money('flat.price', 'Expected sale price') + money('flat.loan', 'Loan left on it', { ph: '0' }) + '</div><div class="pa-pair">' + money('flat.cpfPrincipal', 'CPF used on it', { ph: '0' }) + money('flat.cpfInterest', 'CPF interest owed', { ph: 'we estimate' }) + '</div>' +
      '<p class="pa-sale-r" data-sale-r aria-live="polite"></p>' + chips('order', 'What happens first?', [['sell', 'Sell first'], ['buy', 'Buy first'], ['unsure', 'Not sure yet']], { value: '', when: 'flat.price:*' }) + '</div>' +
      '<p class="pa-note" data-when="flat.type:private">Selling a private home is not counted yet, so your home is treated as kept, which is the cautious view.</p></div>' +
      money('debts', 'Monthly debts (car, cards, other loans)', { opt: true, ph: '0', cls: 'pa-gap' }) + '</section>' +
      '<section class="pa-sec" aria-labelledby="pa-h-money"><h2 class="pa-h" id="pa-h-money">Your money</h2><div class="pa-pair">' + money('cash', 'Cash', { ph: 'e.g. 300,000' }) + money('cpf', 'CPF OA you can use', { share: 'cpfOa', ph: 'e.g. 150,000', hint: 'The OA you can put towards this home.' }) + '</div>' +
      '<div data-when="kind:new"><p class="pa-l pa-l2">Each month towards the home</p><div class="pa-pair">' + money('saveMo', 'Cash', { ph: 'e.g. 3,000' }) + money('cpfMo', 'CPF', { ph: 'e.g. 2,000' }) + '</div><p class="pa-note">Used to check each payment date.</p></div>' +
      '<p class="pa-fine">Stays on this device.</p></section>' +
      '<section class="pa-sec" aria-labelledby="pa-h-home"><h2 class="pa-h" id="pa-h-home">The home</h2>' + chips('kind', 'What are you buying?', [['new', 'New launch'], ['completed', 'Completed home']], { value: 'new' }) +
      '<p class="pa-note">Buying an EC, or buying before you sell? Use the <a href="../payment-planner/">payment timeline</a>.</p></section>' +
      '<details class="pa-adj" data-adj><summary><span>Adjust assumptions</span><em data-adj-sum></em></summary><div class="pa-adj-b">' +
      '<div class="pa-pair">' + numf('ratePct', 'Interest rate', '% a year', { ph: '4' }) + numf('years', 'Loan years', 'years', { ph: 'suggested for you', hint: 'Leave it empty and we suggest one. A number here is always used as typed.' }) + '</div>' +
      chips('buyers.0.res', 'Residency, you', RES, { value: 'SC', share: 'buyers.0.res' }) + chips('buyers.1.res', 'Residency, second buyer', RES, { value: 'SC', share: 'buyers.1.res', when: 'who:two' }) +
      datef('otp', 'Option date') + money('setAside', 'Set aside for fees and renovation', { opt: true, ph: '0', hint: 'Kept out of the money used for the purchase.' }) + '</div></details>';
  }

  /* ---------------- page ---------------- */
  function pageHtml() {
    return '<section class="pa" data-pa><div class="pa-grid">' +
      '<aside class="pa-form" aria-label="Your details">' + formHtml() + '</aside>' +
      '<div class="pa-out" data-out aria-live="polite">' +
      '<div data-status></div><div class="pa-head" data-head></div><div data-tenure></div>' +
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
  const maxTenure = () => (root.GW_RULES && root.GW_RULES.bankLtv && root.GW_RULES.bankLtv.maxTenure && root.GW_RULES.bankLtv.maxTenure.private) || 35;
  // Three figures, each saying what it is: what the bank may lend (a loan, for the tenure shown), what the buyer can comfortably pay (loan plus cash, CPF,
  // reserves and payment dates), and what the loan costs each month. The bank's lending capacity is never presented as the buyer's budget.
  function figs(res) {
    const c = res.comfortable, hi = res.highest, at = res.atComfortable || res.atHighest, onC = c !== null && res.atComfortable;
    const priceTxt = onC ? 'the ' + $s(c) + ' budget' : 'the ' + $s(hi) + ' highest price';
    const limit = !at ? '' : at.limit === 'income'
      ? 'Your income is what limits it: it supports ' + $s(at.incomeLoan) + ', where the loan limit would allow ' + $s(at.ruleLoan) + '.'
      : 'The loan limit is what limits it (' + pc(at.ltv) + ' of the price). Your income would support up to ' + $s(at.incomeLoan) + '.';
    const loanFig = at ? '<div class="pa-fig"><div class="k">Estimated bank loan</div><div class="d">What the bank may lend</div><div class="v">' + $s(at.loan) + '</div><div class="s"><p>Over ' + plural(res.years) + ' at ' + rateTxt(res) + ', at ' + priceTxt + '.</p><p>' + limit + '</p></div></div>' : '';
    const stretch = c !== null && hi > c ? ' You could stretch to <b>' + $s(hi) + '</b>.' : '';
    const budget = c !== null
      ? '<div class="pa-fig main"><div class="k">Comfortable budget</div><div class="d">What you can comfortably pay</div><div class="v">' + $s(c) + '</div><div class="s"><p>' + (res.atComfortable ? 'Loan plus your cash and CPF, with ' + $(round100(res.atComfortable.spare)) + ' left in hand after buying.' : '') + stretch + '</p></div></div>'
      : '<div class="pa-fig main"><div class="k">Comfortable budget</div><div class="d">What you can comfortably pay</div><div class="v none">Not yet</div><div class="s"><p>Nothing leaves your cushion in hand. The most the numbers allow is <b>' + $s(hi) + '</b>' + (res.atHighest ? (res.atHighest.spare < 1000 ? ', which leaves almost nothing in hand.' : ', which leaves about ' + $(round100(res.atHighest.spare)) + ' in hand.') : '.') + '</p></div></div>';
    const inst = at ? '<div class="pa-fig"><div class="k">Monthly instalment</div><div class="d">What the loan costs each month</div><div class="v">' + $(at.monthly) + '</div><div class="s"><p>On that loan, over ' + plural(res.years) + ' at ' + rateTxt(res) + '.</p></div></div>' : '';
    return '<div class="pa-figs">' + loanFig + budget + inst + '</div>';
  }

  function headHtml(res, held, waitText) {
    const kick = '<p class="pa-kick">You can afford</p>';
    if (!res || res.state === 'empty') return '<div class="pa-intro">' + kick + '<h2 class="pa-lead">What can you comfortably afford?</h2><p class="pa-p">Add your age and income to start. The answer updates as you type, and nothing leaves this device.</p></div>';
    if (res.state === 'income' || res.state === 'ask-home' || res.state === 'ask-flat') {
      const prompt = res.state === 'income' ? 'Add your cash and CPF to see what that buys.' : res.state === 'ask-home' ? 'Do you own a home now? Answer on the left to see your budget.' : 'Add the monthly instalment on its loan (type 0 if none).';
      return '<div class="pa-intro">' + kick + '<h2 class="pa-lead">The bank may lend about <b>' + $s(Math.floor(res.borrow.max / 1e4) * 1e4) + '</b></h2><p class="pa-p">An estimate from your income alone, over ' + plural(res.borrow.years) + '. ' + prompt + '</p></div>';
    }
    if (res.state === 'out-of-reach') return '<div class="pa-intro">' + kick + '<h2 class="pa-lead">Nothing fits these figures yet</h2><p class="pa-p">' + (res.lever ? 'The biggest lever is cash: about <b>' + $(res.lever.amount) + '</b> more would bring a ' + $s(res.lever.forPrice) + ' home within reach.' : 'Adding cash is the biggest lever.') + '</p></div>';
    if (res.state === 'invalid') return '<div class="pa-intro">' + kick + '<h2 class="pa-lead">Check the entries marked on the left</h2></div>';
    const badge = res.estimate ? tag('est', 'Estimate · payments not checked yet') : tag('ok', 'Payments checked');
    const basis = res.basis === 'sell' ? '<p class="pa-basis">Counting the sale of your home, sold first.</p>' : res.basis === 'keep' ? '<p class="pa-basis">Keeping your home: its loan and instalment count.</p>' : '';
        let more = '';
    if (res.beneath && res.beneath.sell && res.beneath.sell.highest !== null) { const b = res.beneath.sell; more = '<p class="pa-beneath">' + (res.beneath.why === 'buy' ? 'Buying first, the sale isn’t counted yet, so this is the cautious figure. ' : 'Not sure yet, so this is the cautious figure. ') + '<b>Selling first</b>, you could afford ' + (b.comfortable !== null ? 'about <b>' + $s(b.comfortable) + '</b> comfortably, up to <b>' + $s(b.highest) + '</b>' : 'up to <b>' + $s(b.highest) + '</b>') + '.</p>'; }
    else if (res.saleNote === 'missing') more = '<p class="pa-beneath">Add your expected sale price to see what selling first would allow. Until then your home is counted as kept.</p>';
    return '<div class="pa-hd"><div class="pa-hdt">' + kick + (held ? '' : badge) + '</div>' + figs(res) + basis + more + '</div>' + (held ? '<p class="pa-wait" role="status">' + esc(waitText) + '</p>' : '');
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
    const why = a.limit === 'income' ? 'Limited by your income' : pc(a.ltv) + ' of the price';
    const pct = a.monthlyPct ? pc(a.monthlyPct) + ' of your income' : '';
    const title = res.priceIsOwn ? 'Your price: ' + $(res.price) : 'At ' + $m(res.price) + (res.comfortable !== null && res.price === res.comfortable ? ', your comfortable budget' : ', the highest the numbers allow');
    const t = (k, v, s) => '<div class="pa-tile"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
    return '<div class="pa-price"><h3 class="pa-h3">' + esc(title) + '</h3><div class="pa-tiles">' + t('Estimated bank loan', $(a.loan), esc(why)) + t('Cash and CPF needed', $(a.upfront), 'You have ' + $(a.have)) + t('Monthly instalment', $(a.monthly), 'Over ' + plural(res.years) + (pct ? ' · ' + esc(pct) : '')) + '</div>' +
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
  // The loan tenure: what is used and why, the nudge when the buyer's own is clearly worse than the suggested, and every valid alternative side by side.
  // The 5% rule only chooses what is suggested; the table always lists the others.
  function tenureHtml(res, cmpOpen) {
    const t = res.tenure; if (!t) return '';
    const rows = rowsOf(res);
    const cur = rows.filter((r) => r.isCurrent)[0] || {}, stdRow = rows.filter((r) => r.isStd)[0] || {}, sugRow = rows.filter((r) => r.isSuggested)[0] || {};
    const std = stdRow.ltv ? pc(stdRow.ltv) : '75%';
    let lead, why;
    if (t.manual) { lead = 'Loan tenure: <b>' + plural(t.years) + '</b>, as you chose.'; why = ''; }
    else if (t.longer) { lead = 'Loan tenure: <b>' + plural(t.years) + '</b>, suggested.'; why = 'A ' + t.years + '-year loan adds <b>' + $(t.gain) + '</b> to your budget compared with ' + plural(t.std) + '.'; }
    else { lead = 'Loan tenure: <b>' + plural(t.years) + '</b>.'; why = t.cap > t.std ? 'The standard tenure for your age. A longer one would not add 5% or more to your budget.' : 'The standard tenure for your age.'; }
    const facts = 'Loan ends at about age ' + t.endAge + (t.ltv ? ' · loan limit ' + pc(t.ltv) + ' of the price' : '') + (t.lower && t.lowerWhy ? ', the lower limit because ' + (t.lowerWhy === 'age' ? 'the loan runs past age 65' : 'the tenure is over 30 years') : '') + '.';
    let nudge = '';
    if (t.manual && t.nudge) {
      const n = t.nudge;
      nudge = '<div class="pa-tnudge"><p><b>A ' + n.years + '-year tenure would suit you better.</b> Your budget would be ' + $s(n.budget) + ', ' + $(n.gain) + ' more.</p>' +
        '<div class="pa-tn-b"><button type="button" class="pa-btn pri" data-use="auto">Use ' + plural(n.years) + '</button><button type="button" class="pa-link" data-cmp aria-expanded="' + !!cmpOpen + '">Compare tenures</button></div></div>';
    }
    const table = '<div class="pa-cmp-w" id="pa-cmp" data-cmp-box' + (cmpOpen ? '' : ' hidden') + '>' + '<p class="pa-fine pa-tf">' + facts + '</p>' + cmpTable(rows, t, true) +
      '<p class="pa-fine">' + maxTenure() + ' years is the longest a loan can run. Banks set their own age limits, so check with yours. A longer loan can lower the loan limit.</p></div>';
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
    const rows = rowsOf(res), stdRow = rows.filter((r) => r.isStd)[0] || {}, stdPc = stdRow.ltv ? pc(stdRow.ltv) : '75%', age = Math.round(B.iwaa);
    const reason = a.lower ? ' It is ' + pc(a.ltv) + ', not ' + stdPc + ', because ' + (a.lowerWhy === 'age' ? 'a ' + plural(a.years) + ' loan from age ' + age + ' runs past age 65.' : 'a loan over 30 years takes the lower limit.') : ' This is the standard limit.';
    const lr = (k, p, amt, cls) => '<div class="pa-lr' + (cls ? ' ' + cls : '') + '"><div><b>' + k + '</b><p>' + p + '</p></div><span class="pa-amt">' + $(amt) + '</span></div>';
    L.push(row('Your loan', '<div class="pa-lim">' +
      lr('What your income supports', '55% of the ' + $(round100(B.assessable)) + ' a month the bank counts' + (a.debts > 0 ? ', less ' + $(a.debts) + ' of debts' + (a.flatInstal ? ' (including your home’s instalment)' : '') : '') + ', tested at ' + pc(res.borrow.rate, 2) + ' over ' + plural(a.years) + '.', a.incomeLoan) +
      lr('What the loan limit allows', pc(a.ltv) + ' of the ' + $(a.P) + ' price' + (a.loans ? ' (a housing loan you still have counts, so the limit is lower)' : '') + '.' + esc(reason) + ' (MAS Notice 632)', a.ruleLoan) +
      lr('Estimated bank loan', 'The lower of the two. ' + (a.limit === 'income' ? 'Income is what holds you back here.' : 'The loan limit is what holds you back here.') + ' The bank decides what it lends.', a.loan, 'res') + '</div>'));
    if (st.twoBuyers && B.iwaa !== null && Math.abs(B.iwaa - B.iwaaGross) > 1e-9) L.push(row('Two borrowers', '<span class="pa-badge bad">Unverified</span> The loan limit uses your income-weighted average age (' + (Math.round(B.iwaa * 10) / 10) + '). MAS’s exact weighting, by gross or by counted income, is not confirmed: ask the bank which age it uses.'));
    // tenure
    const tt = res.tenure;
    if (tt) L.push(row('Your tenure', (tt.manual ? 'You chose ' + plural(tt.years) + ', so that is what is used. ' : plural(tt.years) + ' is suggested. ') + 'We suggest the standard tenure (' + plural(tt.std) + ' for your age) unless a longer one, up to ' + plural(tt.cap) + ' and ending by about age ' + 75 + ', adds 5% or more to your budget. ' + maxTenure() + ' years is the longest a loan can run. We do not assume your loan must end by that age, and banks set their own age limits.' + cmpTable(rows, tt, false)));
    // duty
    L.push(row('Stamp duty', 'Buyer’s stamp duty <b>' + $(a.bsd) + '</b>' + (a.absd > 0 ? ' and additional buyer’s stamp duty (' + pc(a.absdRate) + ') <b>' + $(a.absd) + '</b>' : ', with no additional buyer’s stamp duty') + '. Paid in cash within 14 days of signing.'));
    // cash and CPF
    L.push(row('Cash and CPF', 'Cash alone pays the booking fee, the ' + pc(a.minCash) + ' minimum cash (' + $(a.cashMin) + ') and stamp duty: <b>' + $(a.cashOnly) + '</b>. The other <b>' + $(a.flexNeed) + '</b> can be cash or CPF. CPF is counted as you entered it, for this price only: no valuation or lease limit is applied, and the home is taken to be worth its price. What stays in hand is cash, not CPF.'));
    // sale
    if (res.basis === 'sell' && res.sale && res.sale.owner55) L.push(row('Your sale', 'Selling first, about <b>' + $(res.sale.cash) + '</b> comes to you in cash, after the loan, the agent’s fee and legal costs. An owner aged 55 or over has the CPF refund (about ' + $(res.sale.cpfRefund) + ') go first to the Retirement Account, up to the Full Retirement Sum. How much that takes depends on the owner’s own balance, so none of the refund is counted here. Add what is free to use to “CPF OA you can use”.'));
    else if (res.basis === 'sell' && res.sale) L.push(row('Your sale', 'Selling first, about <b>' + $(res.sale.cash) + '</b> comes to you in cash and <b>' + $(res.sale.cpf) + '</b> back into your CPF, after the loan, the agent’s fee and legal costs' + (res.sale.interestEstimated ? '. The CPF interest owed is an estimate (' + $(res.sale.interest) + '); HDB gives the exact refund' : '') + '.'));
    if (res.basis === 'keep') L.push(row('Your home', 'Counted as kept: it adds ABSD where it applies, one housing loan where you still owe on it, and its monthly instalment in what your income can carry.'));
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
      $$('[data-when]').forEach((el) => { const parts = el.dataset.when.split(':'), k = parts[0], vs = parts[1].split(','); const v = val(k); el.hidden = vs.indexOf('*') >= 0 ? !(v !== '' && v !== undefined) : vs.indexOf(v) < 0; });
      const two = val('who') === 'two'; const r = q('[data-row="b1"]'); if (r) r.hidden = !two;
      if (!two) { ['age', 'fixed', 'variable'].forEach((f) => { const x = field('buyers.1.' + f); if (x) x.value = ''; }); showBonus(1, false); }
    }

    // ---- read the entries ----
    let cmpOpen = false, ptouched = false, errs = {}, last = null, lastOk = null, res = null, undo = null, stDirty = false, tmr = null, firstEdit = false, completedOnce = false;
    function readMoney(k) { const g = field(k); if (!g || (k !== 'price' && !live(g))) return undefined; const t = g.value.trim(); if (t === '') return undefined; const p = parseMoney(t); if (p.error) { errs[k] = p.error; return undefined; } return p.value; }
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
      const home = val('home') || null, order = val('order') || null;
      const s = { kind: val('kind') || 'new', buyers: buyers, debts: readMoney('debts'), ratePct: readNum('ratePct', '4'), years: readNum('years', '30'), cash: readMoney('cash'), cpf: readMoney('cpf'), setAside: readMoney('setAside'),
        saveMo: readMoney('saveMo'), cpfMo: readMoney('cpfMo'), cushion: cushion, home: home, order: order, price: ptouched ? readMoney('price') : undefined, otp: val('otp') || undefined,
        flat: { type: val('flat.type') || 'hdb', instalment: readMoney('flat.instalment'), price: readMoney('flat.price'), loan: readMoney('flat.loan'), cpfPrincipal: readMoney('flat.cpfPrincipal'), cpfInterest: readMoney('flat.cpfInterest') } };
      if (home === 'none') s.flat = {};
      return s;
    }
    let cush = { months: 6 };
    function cushionState() { if (val('cushionAmount') !== '' && cush.amount !== undefined) { const p = parseMoney(val('cushionAmount')); if (p.error) { errs.cushionAmount = p.error; return { months: 6 }; } return { amount: p.value }; } return cush.amount !== undefined ? { amount: 0 } : { months: cush.months }; }

    // ---- compute and draw ----
    const WAIT = (r, s) => { if (r.state === 'invalid') { const e = (r.errors || [])[0]; const f = e && field(e.key); const lab = f ? (f.closest('.pa-f') && f.closest('.pa-f').querySelector('span') ? f.closest('.pa-f').querySelector('span').textContent.replace(/\s*optional\s*$/, '').trim().toLowerCase() : e.key) : ''; return 'Paused: check ' + (lab || 'your entries') + '.'; }
      if (r.state === 'empty') return 'Waiting for ' + (r.need && r.need.length ? r.need.map((x) => WHYWAIT[x]).join(' and ') : 'your age and income') + '.';
      if (r.state === 'income') return 'Waiting for ' + (typeof s.cash === 'undefined' && typeof s.cpf === 'undefined' ? 'your cash and CPF' : 'your cash and CPF') + '.';
      if (r.state === 'ask-home') return 'Waiting for: do you own a home now?'; if (r.state === 'ask-flat') return 'Waiting for ' + WHYWAIT.flat + '.'; return ''; };
    function paintErrors(list) {
      const map = {}; (list || []).forEach((e) => { if (!map[e.key]) map[e.key] = e.text; }); Object.keys(errs).forEach((k) => { map[k] = errs[k]; });
      $$('[data-err]').forEach((m) => { const k = m.dataset.err, msg = map[k], f = field(k); if (msg) { m.textContent = msg; m.hidden = false; if (f) { f.setAttribute('aria-invalid', 'true'); const w = f.closest('.pa-in, .pa-pin'); if (w) w.classList.add('bad'); } } else { m.hidden = true; m.textContent = ''; if (f) { f.setAttribute('aria-invalid', 'false'); const w = f.closest('.pa-in, .pa-pin'); if (w) w.classList.remove('bad'); } } });
    }
    function sale() { const el = q('[data-sale-r]'); if (!el) return; const r = res; if (r && r.sale && val('home') === 'sell') el.innerHTML = r.sale.owner55 ? 'You would get about <b>' + $(r.sale.cash) + '</b> in cash, after the loan, agent fee and legal costs. At 55 or over, the <b>' + $(r.sale.cpfRefund) + '</b> CPF refund goes first to your Retirement Account up to the Full Retirement Sum, so it isn’t counted. If some of it is free to use, add that to “CPF OA you can use”.' : 'You would get about <b>' + $(r.sale.cash) + '</b> in cash and <b>' + $(r.sale.cpf) + '</b> back into your CPF, after the loan, agent fee and legal costs.' + (r.sale.interestEstimated ? ' The CPF interest is an estimate; HDB gives the exact refund.' : ''); else el.textContent = ''; }
    function adjSummary(s) { const e = q('[data-adj-sum]'); if (!e) return; const rate = s.ratePct !== undefined ? s.ratePct : 4, yrs = res && res.years ? res.years : (s.years || ''); const r0 = (s.buyers[0] && s.buyers[0].res) || 'SC'; e.textContent = pc(rate / 100, 2).replace(/\.0+%$/, '%') + (yrs ? ' · ' + yrs + ' years' : '') + ' · ' + RESW[r0] + (s.otp ? ' · option ' + day(s.otp) : ''); }
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
    function recalc() {
      dirty = false; applyWhen();
      const s = readEntries(); stDirty = false;
      const r = A.assess(s); res = r; const st = { monthly: s.saveMo === undefined ? 0 : (s.saveMo || 0) + (s.cpfMo || 0), twoBuyers: s.buyers.length > 1 };
      const hasErr = Object.keys(errs).length > 0, bad = r.state === 'invalid' || hasErr;
      paintErrors(r.errors); sale(); adjSummary(s);
      const ok = r.state === 'ok' && !hasErr;
      if (ok) {
        last = r; lastOk = r;
        out.head.className = 'pa-head'; out.head.innerHTML = headHtml(r) + cushionHtml(r, cush); out.tenure.innerHTML = tenureHtml(r, cmpOpen);
        restoreCushionUi(s);
        setPriceUi(r); out.status.innerHTML = statusHtml(r); out.tiles.innerHTML = tilesHtml(r); out.next.innerHTML = nextHtml(r, st); out.how.innerHTML = howHtml(r, st);
        out.foot.hidden = false; out.ask.hidden = false; heldHtml = out.head.innerHTML;
        if (!completedOnce) { completedOnce = true; track('tool_completed', {}); }
      } else if (lastOk && (bad || r.state === 'empty' || r.state === 'income' || r.state === 'ask-home' || r.state === 'ask-flat')) {
        // an entry is being fixed or cleared: the last good figure stays, dimmed, with the plain reason; nothing below it is shown as current
        out.head.className = 'pa-head held'; out.head.innerHTML = headHtml(lastOk, true, WAIT(r, s)) ; out.tenure.innerHTML = ''; out.pricebox.hidden = true; out.status.innerHTML = ''; out.tiles.innerHTML = ''; out.next.innerHTML = ''; out.how.innerHTML = ''; last = null;
        out.head.querySelectorAll('.pa-badge').forEach((b) => b.remove());
      } else {
        last = null; out.head.className = 'pa-head'; out.head.innerHTML = headHtml(bad ? { state: 'invalid' } : r); out.tenure.innerHTML = ''; out.pricebox.hidden = true; out.status.innerHTML = out.tiles.innerHTML = out.next.innerHTML = out.how.innerHTML = '';
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
      ptouched = !!(o._pt || (o.price && o._pt === undefined));
      $$('[data-k]').forEach((x) => { const k = x.dataset.k; const v = o[k]; if (x.dataset.t === 'chip') setChip(x, v === undefined ? (x.dataset.default || '') : v); else x.value = v === undefined ? (k === 'otp' ? todayIso : '') : v; });
      showBonus(0, !!(o._bonus && o._bonus[0] || o['buyers.0.variable'])); showBonus(1, !!(o._bonus && o._bonus[1] || o['buyers.1.variable']));
      if (o['buyers.0.variable']) field('buyers.0.variable').value = o['buyers.0.variable']; if (o['buyers.1.variable']) field('buyers.1.variable').value = o['buyers.1.variable'];
      cush = o._cush || { months: 6 };
    }
    // What the Payment Timeline needs to show the same numbers: the buyer's own entries, nothing else. Tab-only (gw.hand.v1); never in an address, an analytics event or the WhatsApp message.
    function handoffOf(s, r) {
      const sum = (k) => s.buyers.reduce((a, b) => a + (b[k] > 0 ? b[k] : 0), 0), pos = (x) => (x > 0 ? x : 0), keep = r.basis === 'keep', sell = r.basis === 'sell';
      const h = { v: 1, fresh: true, kind: r.kind, price: r.price, years: r.years, ratePct: r.ratePct, age: Math.round(r.B.iwaa * 100) / 100, cash: Math.max(0, pos(s.cash) - pos(s.setAside)), cpf: pos(s.cpf),
        income: sum('fixed'), varIncome: sum('variable'), debts: pos(s.debts) + (keep && r.at ? r.at.flatInstal : 0), otp: s.otp || '', order: sell ? 'sell' : 'none',
        buyers: s.buyers.map((b) => ({ res: b.res, owned: keep ? 1 : 0 })), loansOther: keep && r.at && r.at.loans ? 1 : 0 };
      if (r.kind === 'new') { h.saveMo = pos(s.saveMo); h.cpfMo = pos(s.cpfMo); }
      if (sell && r.sale) { h.saleCash = r.sale.cash; h.saleCpf = r.sale.cpf; }
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

    // ---- inputs: live commas on money fields, the same display rule as the other tools ----
    const tidy = (t) => String(t).replace(/[\s ]/g, '').replace(/^(sgd|s\$)/i, '').replace(/\$/g, '');
    const group = (n) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    function liveMoney(t) { if (!/^[\d,]*\.?\d*$/.test(t)) return null; const dot = t.indexOf('.'); let n = (dot < 0 ? t : t.slice(0, dot)).replace(/,/g, ''); n = n.replace(/^0+(?=\d)/, ''); if (dot >= 0 && n === '') n = '0'; return group(n) + (dot >= 0 ? '.' + t.slice(dot + 1) : ''); }
    function wireMoney(x) {
      x.addEventListener('input', () => {
        const raw = x.value, caret = x.selectionStart == null ? raw.length : x.selectionStart, out2 = liveMoney(tidy(raw)); if (out2 === null || out2 === raw) return;
        let sig = (tidy(raw.slice(0, caret)).match(/[\d.]/g) || []).length; x.value = out2;
        if (document.activeElement === x && x.setSelectionRange) { let n = 0, pos = sig ? out2.length : 0; for (let k = 0; sig && k < out2.length; k++) { if (/[\d.]/.test(out2.charAt(k)) && ++n === sig) { pos = k + 1; break; } } try { x.setSelectionRange(pos, pos); } catch (er) { /* ignore */ } }
      });
      x.addEventListener('blur', () => { const p = parseMoney(x.value); if (!p.error && p.value !== undefined && p.value <= C.LIMITS.money.max) x.value = fmtMoney(p.value); });
      x.addEventListener('focus', () => { if (x.matches(':focus-visible')) try { x.select(); } catch (e) { /* ignore */ } });
    }
    $$('input[data-t="money"]').forEach(wireMoney);
    box.addEventListener('input', (e) => { const t = e.target; if (!t.matches || !t.matches('input')) return; if (t.matches('[data-range]')) return; if (t.dataset.k === 'price') { ptouched = t.value.trim() !== ''; if (!ptouched) { changed(); return; } changedPrice(); return; } changed(); });
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
      const us = t('[data-use]'); if (us) { const f = field('years'); if (f) { f.value = us.dataset.use === 'auto' ? '' : us.dataset.use; } track('planner_tenure_use', { choice: us.dataset.use === 'auto' ? 'suggested' : 'own' }); clearTimeout(tmr); recalc(); return; }
      const fo = t('[data-focus]'); if (fo) { const f = field(fo.dataset.focus); if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); f.focus({ preventScroll: true }); } return; }
      const oh = t('[data-open-how]'); if (oh) { const d = q('[data-how-d]'); if (d) { d.open = true; d.scrollIntoView({ block: 'start', behavior: 'smooth' }); } return; }
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
      setPriceUi(res); save(); fitSticky();
    }
    q('[data-range]').addEventListener('input', priceFromRange);
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
  return { pageHtml, formHtml, headHtml, statusHtml, tilesHtml, tenureHtml, nextHtml, howHtml, cushionHtml, figs, $s, $m, REF };
});
