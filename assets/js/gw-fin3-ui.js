/* ==========================================================================
   GROUNDWORK — Financial Experience V3 (25 Oct 2026): the three money questions as fast, plain calculators.
     page 'borrow'  How much can I borrow?        tools/tdsr/
     page 'afford'  What can I afford?            (retired in V3.4: tools/planner/ redirects to tools/tdsr/#cash; the page code is kept, unused)
     page 'pay'     What will this home cost me?  tools/payment-planner/
     page 'sell'    What will I get from selling? tools/sale-proceeds/   (V3.4)
     page 'upgrade' Upgrade from HDB              tools/hdb-upgrade/     (V3.4)
   One set of entries for all three (this tab only): the people (one or two, each with an age, salary and bonus), the repayments they already pay,
   cash and CPF, the homes they own and the price. Each page asks only what its answer needs, shows the answer beside the entries on a desktop and
   in a bar that stays on screen on a phone, and keeps the rest (funding check, stage-by-stage mortgage, a home sale, comparisons) one tap away.
   Every figure comes from GW_FIN3 (gw-fin3-core.js), which only feeds the audited engines. The payment lists and the funding check are drawn by
   GW_PLANNER's own renderers (gw-planner-ui.js), so they read exactly as they did in V2.
   Privacy: entries stay in this tab (sessionStorage); nothing enters an address, analytics or the WhatsApp message.
   Standalone or journey (V3.7, Ken 26 Oct 2026): opened from Calculators (no ?j=1), each calculator is its own calculation: its entries
   (gw.fin3.<page>.v1) come back only on a refresh or Back/Forward, and it neither reads nor writes another calculator's figures. Opened from
   Plan My Move or Research (?j=1), the journey's shared entries (gw.fin3.v1, gw.fin.v1) carry between its steps as before. A link that hands
   a result over ("See what a $1.22M home costs me", "What can this buy me next?") leaves only that result in gw.fin3.hand.v1 for the page it
   opens, which takes it once and says where it came from. Upgrade from HDB keeps its four steps on one page, so they always carry.
   UMD: window.GW_FIN3_UI in the browser; Node uses pageHtml(page) to write the pages.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GW_FIN3_UI = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');
  const $r = (n) => '$' + (Math.floor((n || 0) / 1000) * 1000).toLocaleString('en-US');   // a capacity or budget, rounded down to $1,000
  const $s = (n) => (n >= 1e6 ? '$' + (Math.floor(n / 1e4) / 100).toString() + 'm' : n >= 1e3 ? '$' + Math.floor(n / 1000) + 'k' : $(n));
  const pc = (x) => Math.round(x * 1000) / 10 + '%';
  const yrs = (n) => n + (n === 1 ? ' year' : ' years');
  const PHONE = '6590908898', waUrl = (m) => 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(m);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? +m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : ''; };

  /* ---------------- fields ---------------- */
  const money = (k, label, o) => { o = o || {}; return '<label class="f3-f' + (o.cls ? ' ' + o.cls : '') + '"><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><span class="f3-in"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="money"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '>' + (o.unit ? '<i class="u">' + o.unit + '</i>' : '') + '</span>' + (o.hint ? '<small>' + o.hint + '</small>' : '') + '<small class="f3-err" data-err="' + k + '" hidden></small></label>'; };
  const numf = (k, label, unit, o) => { o = o || {}; return '<label class="f3-f' + (o.cls ? ' ' + o.cls : '') + '"><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><span class="f3-in"><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="num"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '>' + (unit ? '<i class="u">' + unit + '</i>' : '') + '</span>' + (o.hint ? '<small>' + o.hint + '</small>' : '') + '<small class="f3-err" data-err="' + k + '" hidden></small></label>'; };
  const datef = (k, label, o) => { o = o || {}; return '<label class="f3-f' + (o.cls ? ' ' + o.cls : '') + '"><span>' + label + (o.opt ? ' <em>optional</em>' : '') + '</span><span class="f3-in"><input type="date" data-k="' + k + '" data-t="date"></span>' + (o.hint ? '<small>' + o.hint + '</small>' : '') + '<small class="f3-err" data-err="' + k + '" hidden></small></label>'; };
  const seg = (k, label, opts, def, o) => { o = o || {}; return '<div class="f3-q' + (o.cls ? ' ' + o.cls : '') + '"' + (o.when ? ' data-when="' + o.when + '"' : '') + '>' + (label ? '<span class="f3-l" id="f3l-' + k.replace(/\W/g, '') + '">' + label + '</span>' : '') + '<div class="f3-seg" role="group"' + (label ? ' aria-labelledby="f3l-' + k.replace(/\W/g, '') + '"' : ' aria-label="' + esc(o.aria || k) + '"') + ' data-k="' + k + '" data-t="seg" data-def="' + def + '">' + opts.map((x) => '<button type="button" data-v="' + x[0] + '" aria-pressed="' + (x[0] === def) + '"' + (x[2] ? ' data-when="' + x[2] + '"' : '') + '>' + x[1] + '</button>').join('') + '</div>' + (o.hint ? '<small class="f3-h">' + o.hint + '</small>' : '') + '</div>'; };
  const check = (k, label) => '<label class="f3-ck"><input type="checkbox" data-k="' + k + '" data-t="check"><span>' + label + '</span></label>';
  const sel = (k, label, opts) => '<label class="f3-f f3-sel"><span>' + label + '</span><span class="f3-in"><select data-k="' + k + '" data-t="sel">' + opts.map((x) => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></span></label>';
  // assumption chips (FE V3.2): each shows the assumption in use; tapping it opens its few entries just below the chips
  const chip = (k, label) => '<button type="button" class="f3-chip" data-chip="' + k + '" aria-expanded="false" aria-controls="f3p-' + k + '"><span data-chip-l="' + k + '">' + label + '</span></button>';
  const panel = (k, title, fields, o) => { o = o || {}; return '<div class="f3-chp" id="f3p-' + k + '" data-chp="' + k + '" role="group" aria-label="' + esc(title) + '" hidden><div class="f3-chph"><b>' + title + '</b><button type="button" class="f3-done" data-chp-done>Done</button></div><div class="f3-optl" data-optl="' + k + '"></div>' +
    (fields ? '<div class="' + (o.hold ? 'f3-hold' : 'f3-cust') + (o.open ? ' f3-cust-open' : '') + '" data-cust="' + k + '"' + (o.open ? '' : ' hidden') + '>' + fields + '</div>' : '') + '</div>'; };
  const RES = [['SC', 'Singapore Citizen'], ['PR', 'Permanent Resident'], ['FR', 'Foreigner'], ['FTA', 'US, Swiss, Norwegian, Icelandic or Liechtenstein national']];

  // the people: one or two, each with their own age, salary and bonus (and, where stamp duty matters, residency)
  function peopleHtml(page) {
    const card = (n) => '<fieldset class="f3-p" data-p="' + n + '"' + (n ? ' data-when="n:2"' : '') + '><legend><span data-when="n:1">You</span><span data-when="n:2">' + (n ? 'Second person' : 'First person') + '</span></legend>' +
      '<div class="f3-g3">' + numf('p.' + n + '.age', 'Age', 'years', { ph: n ? 'e.g. 33' : 'e.g. 35' }) + money('p.' + n + '.fixed', 'Monthly salary', { ph: 'before CPF' }) + money('p.' + n + '.bonusYr', 'Bonus or commission', { ph: 'optional, a year' }) + '</div>' +
      (page !== 'borrow' ? '<div class="f3-pmore">' + sel('p.' + n + '.res', 'Residency', RES) + (n ? check('p.1.nb', 'Buying with me, but not taking the loan') : '') + '</div>' : '') + '</fieldset>';
    return '<div class="f3-grp"><h2 class="f3-gh">' + (page === 'borrow' ? 'Who is borrowing?' : 'Who is buying?') + '</h2>' +
      seg('n', '', [['1', page === 'borrow' ? 'Just me' : 'Just me'], ['2', 'Two of us']], '1', { aria: page === 'borrow' ? 'Who is borrowing' : 'Who is buying' }) + card(0) + card(1) +
      '<p class="f3-fine f3-varnote">Bonus, commission and rental income: a monthly average. Banks count 70% of it.</p></div>';
  }
  // the repayments already being paid: one row each, with whose it is when there are two people; nobody adds them up by hand
  function loansHtml() {
    return '<div class="f3-grp f3-loans"><h2 class="f3-gh">Loans you’re already repaying <em>optional</em></h2><ul class="f3-ll" data-loans></ul>' +
      '<button type="button" class="f3-add" data-add-loan>+ Add a monthly repayment</button><p class="f3-fine">Home, car, personal, study and card repayments, each as a monthly amount.</p></div>';
  }
  const loanRow = (k, l, two) => '<li class="f3-lr" data-loan="' + k + '"><label class="f3-f f3-sel"><span class="sr">Type of loan</span><span class="f3-in"><select data-lk="type">' + [['home', 'Home loan'], ['car', 'Car loan'], ['other', 'Other loan']].map((x) => '<option value="' + x[0] + '"' + (l.type === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></span></label>' +
    (two ? '<label class="f3-f f3-sel f3-who"><span class="sr">Whose loan</span><span class="f3-in"><select data-lk="who"><option value="0"' + (+l.who === 0 ? ' selected' : '') + '>First person</option><option value="1"' + (+l.who === 1 ? ' selected' : '') + '>Second person</option></select></span></label>' : '') +
    '<label class="f3-f f3-amt"><span class="sr">Monthly repayment</span><span class="f3-in"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" data-lk="amt" placeholder="a month" value="' + esc(l.amt || '') + '"></span></label><button type="button" class="f3-x" data-del-loan aria-label="Remove this repayment">×</button></li>';
  // the homes owned now: how many, whose, and what happens to it (only on the pages where it changes the answer)
  function homesHtml(page) {
    return '<div class="f3-grp"><h2 class="f3-gh">Homes you own now</h2>' + seg('homes', '', [['0', 'None'], ['1', 'One'], ['2', 'Two or more']], '0', { aria: 'Homes you own now', hint: 'In Singapore, including HDB flats and any share in a home.' }) +
      seg('whose', 'Whose?', [['both', 'Both of us'], ['0', 'First person'], ['1', 'Second person']], 'both', { when: 'ownTwo:1' }) +
      '<p class="f3-fine" data-homeloan-note data-when="own:1"></p>' +
      (page === 'afford' ? seg('plan', 'Selling it?', [['keep', 'Keeping it'], ['sell', 'Selling it first']], 'keep', { when: 'own:1', hint: 'Selling later? Choose “Keeping it”: until it sells, it counts as owned.' }) +
        '<div class="f3-sale" data-when="plan:sell">' + saleHtml() + '</div>' : '') +
      seg('couple', 'Married, buying in your two names?', [['yes', 'Yes'], ['no', 'No']], '', { when: 'mixed:1', hint: 'A married couple with a Singapore Citizen, neither owning a home, pays no ABSD.' }) + '</div>';
  }
  const saleHtml = () => '<div class="f3-sub">' + seg('sale.type', '', [['hdb', 'HDB flat'], ['private', 'Private home']], 'hdb', { aria: 'Home being sold' }) +
    '<div class="f3-g3">' + money('sale.price', 'Expected price', { ph: 'e.g. 650,000' }) + money('sale.loan', 'Loan left', { ph: '0 if none' }) + money('sale.cpfRefund', 'CPF to refund', { ph: 'with interest' }) + '</div>' +
    seg('sale.held', 'Owned it for more than 4 years?', [['yes', 'Yes'], ['no', 'No']], '', { when: 'sale.type:private', hint: 'Within 4 years, Seller’s Stamp Duty applies: work the sale out in Sale proceeds, then come back with “What can I buy next?”.' }) +
    '<input type="hidden" data-k="sale.oCash" data-t="hid"><input type="hidden" data-k="sale.oCpf" data-t="hid">' +
    '<p class="f3-fine" data-sale-line>The sale counts once all three are in. The CPF refund, with its accrued interest, is on your CPF statement.</p></div>';
  // CPF while a home is still owned: only the OA above a set-aside can be used (CPF Board). Asked only when it applies.
  const cpfBalHtml = () => '<div class="f3-grp f3-cpf2" data-cpf2 hidden><h2 class="f3-gh">Your CPF balances</h2><p class="f3-fine">You will still own a home, so CPF lets you use only the Ordinary Account savings above a set-aside (the Basic Retirement Sum if a home you own lasts until you are 95, otherwise the Full Retirement Sum).</p>' +
    seg('cover95', 'Will a home you own last until you are 95?', [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']], '', {}) +
    '<div class="f3-g2">' + money('cpfBal.0.oa', '<span data-when="n:1">Your</span><span data-when="n:2">First person’s</span> OA') + money('cpfBal.0.sa', 'SA or RA', { ph: '0 if none' }) + '</div>' +
    '<div class="f3-g2" data-when="n:2">' + money('cpfBal.1.oa', 'Second person’s OA') + money('cpfBal.1.sa', 'SA or RA', { ph: '0 if none' }) + '</div><p class="f3-fine" data-cpf2-out></p></div>';
  const moneyHtml = () => '<div class="f3-grp"><h2 class="f3-gh">Your money for the purchase</h2><div class="f3-g2">' + money('cash', 'Cash', { ph: 'e.g. 200,000' }) + money('cpf', 'CPF OA you can use', { ph: 'e.g. 150,000' }) + '</div></div>';
  const assumeHtml = (page) => '<details class="f3-as" data-as><summary><span>Interest rate and loan tenure</span> <em data-as-sum>4% · longest standard tenure</em></summary><div class="f3-g2">' +
    numf('ratePct', 'Interest rate', '% a year', { ph: '4', hint: page === 'borrow' ? 'For the monthly repayment. Banks test what you can borrow at 4% or this rate, whichever is higher.' : 'Banks test at 4% or this rate, whichever is higher.' }) +
    numf('years', 'Loan tenure', 'years', { ph: 'longest standard', hint: 'Blank: the longest that keeps the standard loan limit at your age.' }) + '</div>' +
    (page === 'afford' ? '<div class="f3-g2" data-when="akind:new">' + money('saveMo', 'Cash you can add each month', { opt: true }) + money('cpfMo', 'CPF added each month', { opt: true }) + '</div><p class="f3-fine" data-when="akind:new">With these, each new-launch payment is checked on its date.</p>' :
      page === 'pay' ? '<div class="f3-g2">' + money('saveMo', 'Cash you can add each month', { opt: true }) + money('cpfMo', 'CPF added each month', { opt: true }) + '</div><p class="f3-fine">With these, the monthly mortgage is tested against your savings too.</p>' : '') + '</details>';

  /* ---------------- pages ---------------- */
  const outShell = (k) => '<aside class="f3-out" aria-label="Your answer"><div class="f3-card" data-out aria-live="polite"></div></aside>';
  const askHtml = (what) => '<p class="f3-ask">Want to talk it through? <a href="' + esc(waUrl('Hi Ken, I’m using ' + what + ' on Groundwork and would like to talk it through.')) + '" target="_blank" rel="noopener" data-gw-wa="fin3-' + what.replace(/\W+/g, '-').toLowerCase() + '">Ask Ken on WhatsApp</a></p>';
  const carryHtml = '<p class="f3-carry" data-carry hidden><span>Using the figures you entered earlier in this tab.</span> <button type="button" class="f3-lnk" data-fresh>Start fresh</button></p>';
  // V3.4: "What can I afford?" folded into How much can I borrow?: the cash and CPF turn the loan into a budget (GW_FIN3.afford, the same engine the old page used)
  const cashRowHtml = () => '<details class="f3-in-d" data-cashrow><summary data-cash-sum>Add my cash and CPF</summary><div class="f3-cmpin">' +
    '<div data-when="bpriv:1"><div class="f3-g2">' + money('cash', 'Cash for the purchase', { ph: 'e.g. 200,000' }) + money('cpf', 'CPF Ordinary Account you can use', { ph: 'e.g. 150,000' }) + '</div>' +
    seg('akind', 'The home', [['new', 'New launch'], ['completed', 'Completed home']], 'new', { aria: 'The home' }) +
    '<details class="f3-dw" data-dutywho><summary data-dutywho-sum>Stamp duty as a Singapore Citizen buying a first home</summary><div class="f3-g2">' + sel('p.0.res', '<span data-when="n:1">You are a</span><span data-when="n:2">First person</span>', RES) + '<div data-when="n:2">' + sel('p.1.res', 'Second person', RES) + '</div></div>' + homesHtml('afford') + '</details>' +
    cpfBalHtml() + '</div><p class="f3-note" data-when="bpriv:0" data-cash-hdbec>A budget from your cash and CPF is worked out for <b>private homes only</b> for now. For an HDB flat or a new EC, the loan above is the answer this page gives; to see the cash and CPF a particular price needs, use <a href="../payment-planner/" data-gw-go="fin3-cost-hdb">What will this home cost me?</a></p></div></details>';
  // V3.4: What will I get from selling? (tools/sale-proceeds/): two entries, four chips, three answers; SSD as a line when the dates say it applies
  // V3.5: the early repayment penalty (optional) and the owners aged 55 or over (asked inside the CPF entry; details only when they change the figure)
  const penaltyHtml = () => '<details class="f3-dw" data-pen><summary>Early repayment penalty? Add it</summary>' + money('sale.penalty', 'Early repayment penalty', { ph: '0 if none', hint: 'If your bank charges one for repaying the loan early. It comes off the sale proceeds.' }) + '</details>';
  const o55Html = () => seg('sale.o55', 'Is any owner 55 or older?', [['no', 'No'], ['yes', 'Yes']], 'no', {}) +
    '<div data-when="sale.o55:yes" class="f3-o55"><p class="f3-fine">Their refund goes first to their CPF Retirement Account, up to the Full Retirement Sum, so not all of it may be usable for the next home.</p>' +
    money('sale.cpf55', 'Joint owners: the 55+ owners’ share of the refund', { opt: true, ph: 'blank if every owner is 55+', hint: 'The younger owners’ refund then counts in full.' }) +
    money('sale.cpfUse', 'What the 55+ owners can use again, from CPF', { opt: true, ph: 'if you know it', hint: 'CPF shows it after the Retirement Account top-up. Until it is entered, none of their refund is counted, and the figure is marked provisional.' }) + '</div>';
  function sellHtml() {
    return '<section class="f3 f3-frame f3-sellpage" data-f3="sell"><div class="f3-grid f3-grid-pay"><form class="f3-form" novalidate>' + carryHtml +
      money('sale.price', 'Selling price', { ph: 'e.g. 750,000', cls: 'f3-big' }) + '<p class="f3-fine" data-blockhint hidden></p>' +
      money('sale.loan', 'Loan still owing', { ph: '0 if none' }) + penaltyHtml() +
      '<div class="f3-chips" role="group" aria-label="Assumptions">' + chip('stype', 'HDB flat') + chip('scpf', 'CPF used: add') + chip('scomm', 'Agent 2%') + chip('slegal', 'Legal $3,000') + '<span data-when="sale.type:private,ec">' + chip('sssd', 'SSD: add dates') + '</span></div>' +
      '<p class="f3-fine f3-chipnote">CPF used includes accrued interest, from your CPF statement. Tap any to change it.</p><div class="f3-scrim" data-scrim hidden></div>' +
      panel('stype', 'The home', seg('sale.type', '', [['hdb', 'HDB flat'], ['private', 'Private home'], ['ec', 'EC']], 'hdb', { aria: 'The home you are selling' }), { hold: true }) +
      panel('scpf', 'CPF used', money('sale.cpfRefund', 'CPF used for this home, with accrued interest', { ph: 'e.g. 205,000', hint: 'All owners together: the down payment and instalments paid from CPF, any housing grants, and the interest CPF has added. On the CPF website under Home Ownership, “What happens if”.' }) + o55Html()) +
      panel('scomm', 'Agent’s fee', numf('sale.comm', 'Agent’s fee', '% of the price', { ph: '2', hint: 'GST of 9% is added. The fee is agreed with your agent.' })) +
      panel('slegal', 'Legal fees', money('sale.legal', 'Legal fees for the sale', { ph: '3,000' })) +
      panel('sssd', 'Seller’s Stamp Duty', '<div class="f3-g2">' + datef('sale.bought', 'Date you bought') + datef('sale.sold', 'Date you sell', { hint: 'When your buyer exercises the option. Blank: today.' }) + '</div>') +
      '</form><div class="f3-out f3-out-pay" aria-label="Your answer"><div class="f3-card f3-card-pay"><div data-out aria-live="polite"></div>' +
      '<div class="f3-opts"><details class="f3-in-d" data-why hidden><summary data-why-sum>How it is worked out</summary><ul class="f3-why" data-why-out></ul></details>' +
      '<details class="f3-in-d" data-cpfhelp><summary>I don’t know my CPF figure yet</summary><div class="f3-cmpin"><p class="f3-fine">Log in to the CPF website and open Home Ownership: “What happens if” shows, for each owner, the CPF used for this home and the accrued interest, which together are refunded when you sell. Add up every owner’s figure.</p><p class="f3-fine">Until you have it, the total above is still right; only its split into cash and CPF waits for it.</p></div></details>' +
      '<details class="f3-in-d" data-timing><summary>Timing: when the money arrives</summary><div class="f3-cmpin"><p class="f3-fine">Everything is paid out at completion, through the lawyers: the loan is repaid, the CPF refund goes back to each owner’s CPF account, and the rest comes to you as cash.</p><p class="f3-fine">For an HDB flat, completion is usually about two months after HDB accepts the resale application. For a private home, it is usually 8 to 12 weeks after the buyer exercises the option.</p></div></details>' +
      '<a class="f3-rowlnk" data-to-borrow href="../tdsr/#sell" hidden>What can this buy me next?</a><button type="button" class="f3-rowlnk f3-pdf" data-save-pdf hidden>Save as PDF</button></div></div>' +
      '<p class="f3-fine f3-cardnote">Selling costs are typical figures you can change. CPF refund as entered; CPF Board decides the actual amount.</p></div></div><div class="f3-bar" data-bar hidden></div></section>';
  }
  // V3.4: Upgrade from HDB (tools/hdb-upgrade/): four steps, one answer each, every figure carried forward; the budget card updates as any step changes
  const stepHtml = (n, key, ques, edit) => '<li class="f3-step" data-step="' + key + '"><span class="f3-sti" aria-hidden="true"><b>' + n + '</b></span><div class="f3-stb"><p class="f3-stn">Step ' + n + '</p><h2 class="f3-stq">' + ques + '</h2>' +
    (edit ? '<div class="f3-sta" data-sta="' + key + '" hidden><p class="f3-stv" data-stv="' + key + '"></p><button type="button" class="f3-stc" data-stc="' + key + '">Change</button><p class="f3-sts" data-sts="' + key + '"></p></div><div class="f3-ste" data-ste="' + key + '" hidden>' + edit + '<button type="button" class="gw-btn f3-stdone" data-stdone="' + key + '">Done</button></div>' : '<p class="f3-sts">Change any step above and the budget updates.</p>') + '</div></li>';
  function upgradeHtml() {
    return '<section class="f3 f3-frame f3-uppage" data-f3="upgrade"><div class="f3-grid f3-grid-pay"><form class="f3-form f3-thread" novalidate>' + carryHtml + '<ol class="f3-steps">' +
      stepHtml(1, 'worth', 'What is my flat worth?', money('sale.price', 'Expected selling price', { ph: 'e.g. 750,000' }) + '<p class="f3-fine" data-blockhint hidden></p><p class="f3-fine"><a href="../../journey/worth/#hdb" data-up-worth data-gw-go="up-worth">Look up recent resales in my block ›</a></p>') +
      stepHtml(2, 'sell', 'What will I get from selling?', '<div class="f3-g2">' + money('sale.loan', 'Loan still owing', { ph: '0 if none' }) + money('sale.cpfRefund', 'CPF used, with accrued interest', { ph: 'e.g. 205,000', hint: 'All owners together, from the CPF website (Home Ownership).' }) + '</div>' + penaltyHtml() + o55Html() + '<p class="f3-fine" data-up-costs>Agent 2% plus GST and legal fees of $3,000 are taken off. To change them, use <a href="../sale-proceeds/" data-gw-go="up-sale-proceeds">What will I get from selling?</a></p>') +
      stepHtml(3, 'borrow', 'How much can I borrow?', '<div class="f3-g2">' + money('p.0.fixed', '<span data-when="n:1">Your income, a month before CPF</span><span data-when="n:2">First person’s income, a month</span>', { ph: 'e.g. 8,000' }) + numf('p.0.age', '<span data-when="n:1">Your age</span><span data-when="n:2">First person’s age</span>', 'years', { ph: 'e.g. 35' }) + '</div>' +
        seg('n', '', [['1', 'Just me'], ['2', 'Two of us']], '1', { aria: 'Who is borrowing' }) + '<div class="f3-g2" data-when="n:2">' + money('p.1.fixed', 'Second person’s income, a month', { ph: 'before CPF' }) + numf('p.1.age', 'Their age', 'years', { ph: 'e.g. 33' }) + '</div>' +
        '<details class="f3-dw"><summary>Bonus, commission and other loans</summary><div class="f3-g2">' + money('p.0.bonusYr', '<span data-when="n:1">Bonus and commission, a year</span><span data-when="n:2">First person’s bonus, a year</span>', { ph: 'e.g. 24,000' }) + '<div data-when="n:2">' + money('p.1.bonusYr', 'Second person’s bonus, a year', { ph: 'e.g. 12,000' }) + '</div></div>' + loansHtml() + '</details>') +
      stepHtml(4, 'budget', 'So what can I buy?', '') + '</ol>' +
      '<div class="f3-upchips"><div class="f3-chips" role="group" aria-label="Assumptions">' + chip('ures', 'Keep funds aside: None') + '</div><p class="f3-fine f3-chipnote">An optional amount kept out of the purchase. Tap to change it.</p><div class="f3-scrim" data-scrim hidden></div>' +
      panel('ures', 'Keep funds aside', money('reserve', 'Amount to keep aside', { ph: 'e.g. 30,000', hint: 'Kept out of the purchase: the budget is worked out without it.' })) + '</div></form>' +
      '<div class="f3-out f3-out-pay" aria-label="Your upgrade budget"><div class="f3-card f3-card-pay"><div data-out aria-live="polite"></div>' +
      '<div class="f3-opts"><details class="f3-in-d" data-bfirst hidden><summary>Buy first, then sell — what changes</summary><div class="f3-cmpin"><div class="f3-bfin">' +
        '<div data-bf-mo>' + money('upFlatMo', 'Existing HDB monthly mortgage repayment', { ph: 'e.g. 1,300' }) + '<p class="f3-bfneed" data-bf-need="upFlatMo" hidden>Add the flat’s monthly repayment: its loan is still running.</p></div>' +
        '<div>' + money('bfCash', 'Available cash for the next purchase', { ph: 'e.g. 100,000', hint: 'Not counting the flat’s sale proceeds.' }) + '<p class="f3-bfneed" data-bf-need="bfCash" hidden>Add the cash you have now (0 if none).</p></div>' +
        '<div>' + money('bfCpf', 'Available usable CPF for the next purchase', { ph: 'e.g. 150,000', hint: 'Ordinary Account savings above the retirement set-aside, while you still own the flat. CPF Board confirms.' }) + '<p class="f3-bfneed" data-bf-need="bfCpf" hidden>Add the CPF you can use (0 if none).</p></div>' +
        '</div><div data-bfirst-out></div></div></details>' +
      '<details class="f3-in-d" data-why hidden><summary data-why-sum>How it is worked out</summary><ul class="f3-why" data-why-out></ul></details>' +
      '<a class="f3-rowlnk" data-to-cost href="../payment-planner/" hidden>What a home at this price costs each month</a><a class="f3-rowlnk" data-to-homes href="../what-can-i-buy/" data-gw-go="what-can-i-buy" hidden>See homes around this budget</a>' +
      '<button type="button" class="f3-rowlnk f3-pdf" data-save-pdf hidden>Save as PDF</button></div></div>' +
      '<p class="f3-fine f3-cardnote">Planning estimates from the figures above and MAS, CPF and IRAS rules. Flat value from HDB resale data. Not a valuation, bank offer or financial advice.</p></div></div><div class="f3-bar" data-bar hidden></div></section>';
  }
  function pageHtml(page) {
    if (page === 'sell') return sellHtml();
    if (page === 'upgrade') return upgradeHtml();
    if (page === 'borrow') return '<section class="f3 f3-frame f3-borrowpage" data-f3="borrow"><div class="f3-grid f3-grid-pay"><form class="f3-form" novalidate>' + carryHtml +
      '<div class="f3-inc" data-inc>' + money('p.0.fixed', '<span data-when="n:1">Your income, each month before CPF</span><span data-when="n:2">First person’s income, a month</span>', { ph: 'e.g. 8,000', cls: 'f3-big' }) +
      '<div data-when="n:2">' + money('p.1.fixed', 'Second person’s income, a month', { ph: 'before CPF', cls: 'f3-big' }) + '</div></div><p class="f3-incneed" data-inc-need hidden></p>' +
      '<div class="f3-chips" role="group" aria-label="Assumptions">' + chip('age', 'Age 35') + chip('n', 'Buying alone') + chip('bkind', 'Private home') + chip('loans', 'No other loans') + chip('rate', '4% · longest tenure') + '</div>' +
      '<p class="f3-fine f3-chipnote">Usual assumptions. Tap any to change it.</p><div class="f3-scrim" data-scrim hidden></div>' +
      panel('age', 'Age', '<div class="f3-g2">' + numf('p.0.age', '<span data-when="n:1">Your age</span><span data-when="n:2">First person</span>', 'years', { ph: '35' }) + '<div data-when="n:2">' + numf('p.1.age', 'Second person', 'years', { ph: '35' }) + '</div></div><p class="f3-fine">Banks end a loan by about 65, so age sets how long it can run.</p>', { open: true }) +
      panel('n', 'Who is borrowing', '<div class="f3-hold">' + seg('n', '', [['1', 'Just me'], ['2', 'Two of us']], '1', { aria: 'Who is borrowing' }) + '</div><div class="f3-g2" data-when="n:2">' + numf('p.1.age', 'Second person’s age', 'years', { ph: '35' }) + '</div>') +
      // the home: its choices are the options list (holders kept hidden); an HDB loan adds the household (as options) and the remaining lease (typed, behind "Custom")
      panel('bkind', 'The home', '<div class="f3-hold">' + seg('bkind', '', [['private', 'Private home'], ['hdb', 'HDB flat'], ['ec', 'New EC']], 'private', { aria: 'Buying' }) + seg('hdbLoan', 'Loan from', [['hdb', 'HDB'], ['bank', 'A bank']], 'hdb', {}) +
        seg('household', 'Applying as', [['family', 'Family'], ['extended', 'Extended family'], ['single', 'Single']], 'family', {}) + '</div>' +
        '<div data-when="hdbl:1">' + numf('lease', 'Remaining lease of the flat', 'years', { ph: 'e.g. 70', hint: 'If it won’t last until the youngest of you is 95, HDB lends less than 75% of the price.' }) + '</div>') +
      panel('loans', 'Other loans', loansHtml()) +
      panel('rate', 'Interest and tenure', '<div class="f3-g2">' + numf('ratePct', 'Interest rate', '% a year', { ph: '4' }) + numf('years', 'Loan tenure', 'years', { ph: 'longest' }) + '</div><p class="f3-fine">Banks test what you can borrow at 4% or your rate, whichever is higher. Leave the tenure blank for the longest your age allows.</p>') +
      '</form><div class="f3-out f3-out-pay" aria-label="Your answer"><div class="f3-card f3-card-pay"><div data-out aria-live="polite"></div>' +
      '<div class="f3-opts"><details class="f3-in-d" data-why hidden><summary data-why-sum>How it is worked out</summary><ul class="f3-why" data-why-out></ul></details>' +
      '<details class="f3-in-d" data-var><summary>Add bonus, commission or rent</summary><div class="f3-cmpin"><div class="f3-g2">' + money('p.0.bonusYr', '<span data-when="n:1">Bonus and commission, a year</span><span data-when="n:2">First person’s bonus and commission, a year</span>', { ph: 'e.g. 24,000' }) + money('p.0.rentMo', '<span data-when="n:1">Rent you receive, a month</span><span data-when="n:2">First person’s rent, a month</span>', { ph: 'e.g. 2,500' }) + '</div><div class="f3-g2" data-when="n:2">' + money('p.1.bonusYr', 'Second person’s bonus and commission, a year', { ph: 'e.g. 12,000' }) + money('p.1.rentMo', 'Second person’s rent, a month', { ph: '0 if none' }) + '</div><p class="f3-fine">Banks count 70% of it, averaged over the year.</p></div></details>' +
      cashRowHtml() + '<details class="f3-in-d" data-flatrow hidden><summary>Check a specific flat</summary><div class="f3-cmpin"><div class="f3-g2">' + money('flatPrice', 'Flat price', { ph: 'the resale price agreed', hint: 'The price in your Option to Purchase.' }) + money('flatVal', 'HDB’s valuation', { opt: true, ph: 'if you have it', hint: 'HDB and banks lend on the lower of the price and the valuation; the amount above the valuation is paid in cash.' }) + '</div><div data-flat-out></div></div></details>' +
      '<div class="f3-pshost" data-sched-host hidden></div>' +
      '<a class="f3-rowlnk" data-to-cost href="../payment-planner/" hidden>See what a home at this price costs me</a><a class="f3-rowlnk" data-to-homes href="../what-can-i-buy/" data-gw-go="what-can-i-buy" hidden>See homes within this budget</a><button type="button" class="f3-rowlnk f3-pdf" data-save-pdf hidden>Save as PDF</button></div></div>' +
      '</div></div><div class="f3-bar" data-bar hidden></div></section>';
    if (page === 'afford') return '<section class="f3" data-f3="afford"><div class="f3-grid"><form class="f3-form" novalidate>' + carryHtml +
      '<div class="f3-grp">' + seg('akind', 'Buying', [['new', 'New launch'], ['completed', 'Resale or completed'], ['hdb', 'HDB flat']], 'new', {}) + '</div>' +
      peopleHtml('afford') + moneyHtml() + loansHtml() + homesHtml('afford') + cpfBalHtml() +
      '<div class="f3-grp"><h2 class="f3-gh">A price in mind? <em>optional</em></h2><div class="f3-g2">' + money('price', 'Price', { ph: 'e.g. 1,500,000' }) + '<div data-when="akind:completed">' + money('valuation', 'Bank valuation', { opt: true, ph: 'if known' }) + '</div></div><p class="f3-fine" data-from-research hidden></p></div>' +
      assumeHtml('afford') + '</form>' + outShell() + '</div><div class="f3-bar" data-bar hidden></div></section>';
    // What will this home cost me? Type, price, loan, rate, tenure and CPF give the cash, the CPF and the monthly instalment; the date gives every payment and when it is due.
    // The funding check (cash in hand, a home sale, the mortgage as it builds up) and the comparisons open on request.
    return '<section class="f3 f3-paypage f3-frame" data-f3="pay"><div class="f3-grid f3-grid-pay"><form class="f3-form" novalidate>' + carryHtml +
      money('price', 'Price of the home', { ph: 'e.g. 2,000,000', cls: 'f3-big' }) + '<p class="f3-fine" data-from-research hidden></p>' +
      '<div class="f3-chips" role="group" aria-label="Assumptions">' + chip('pkind', 'New launch') + chip('who', 'Singapore Citizen, first home') + chip('loan', '75% loan') + chip('rate', '4% · 30 years') + chip('cpf', 'No CPF') + '</div>' +
      '<p class="f3-fine f3-chipnote">Usual assumptions. Tap one to change it.</p><div class="f3-scrim" data-scrim hidden></div>' +
      panel('pkind', 'The property', seg('pkind', '', [['new', 'New launch'], ['ec', 'New EC'], ['completed', 'Completed private'], ['resaleec', 'Resale EC'], ['hdb', 'HDB resale flat'], ['bto', 'New HDB flat (BTO)']], 'new', { aria: 'Buying' }) + '<div data-when="pkind:bto">' + seg('btoRoom', 'Flat size', [['2', '2-room Flexi'], ['3', '3-room'], ['4', '4-room or bigger']], '4') + '</div>', { hold: true }) +
      panel('who', 'Who’s buying', peopleHtml('pay') + homesHtml('pay') + loansHtml()) +
      panel('loan', 'The loan', '<div data-when="pkind:hdb,bto">' + seg('hdbLoan', 'Loan from', [['hdb', 'HDB loan'], ['bank', 'Bank loan']], 'hdb') + '</div>' + money('loanAmt', 'Loan amount', { ph: 'the most allowed' }) + '<p class="f3-loanline"><span data-loan-hint></span></p>' +
        '<div data-when="pkind:hdb">' + money('valuation', 'HDB valuation', { opt: true, ph: 'if known', hint: 'The loan is on the lower of the price and the valuation; any amount above the valuation is cash.' }) + '</div>') +
      panel('rate', 'Interest and tenure', '<div class="f3-g2">' + numf('ratePct', 'Interest rate', '% a year', { ph: '4' }) + numf('years', 'Loan tenure', 'years', { ph: '30' }) + '</div>') +
      panel('cpf', 'CPF', money('cpf', 'CPF to use', { ph: '0 if none', hint: 'Ordinary Account savings you will put in. Leave it blank to see the least cash you need.' })) +
      '</form><div class="f3-out f3-out-pay" aria-label="Your answer"><div class="f3-card f3-card-pay"><div data-out aria-live="polite"></div>' +
      '<div class="f3-opts"><details class="f3-in-d" data-bd hidden><summary data-bd-sum>Where the money goes</summary><div data-bd-out></div></details>' +
      '<details class="f3-in-d" data-cmp hidden><summary>Compare another price</summary><div class="f3-cmpin">' + money('price2', 'Another price', { ph: 'e.g. 1,800,000' }) + '</div><div data-cmp-out></div></details>' +
      '<a class="f3-rowlnk" data-open-borrow href="../tdsr/" data-gw-go="fin3-borrow" hidden>Check my own borrowing limit</a><button type="button" class="f3-rowlnk f3-pdf" data-save-pdf hidden>Save as PDF</button></div></div>' +
      '</div></div>' +
      '<div class="f3-allpay" id="f3-allpay" data-allpay hidden><section class="f3-sched" data-schsec hidden><div class="f3-schh"><h2 class="f3-sh">Payment schedule</h2><p data-sch-note></p></div>' +
      '<div class="f3-schd"><div class="f3-g2 f3-dates"><div data-when="noDate:0">' + datef('otp', 'Option date') + '</div><div class="f3-nod">' + check('noDate', 'No date yet') + '</div></div>' +
      '<details class="f3-dd" data-when="noDate:0"><summary><span data-when="pkind:new,ec">Add the developer’s TOP and completion dates</span><span data-when="pkind:completed,resaleec">Add the completion date</span> <em>optional</em></summary><div class="f3-g2">' +
      '<div data-when="pkind:new,ec">' + datef('top', 'Expected TOP') + '</div><div data-when="pkind:new,ec">' + datef('csc', 'Expected final payment (CSC)') + '</div><div data-when="pkind:completed,resaleec">' + datef('completion', 'Completion date', { hint: 'Without it: 12 weeks after the option.' }) + '</div></div></details></div>' +
      '<div data-sched aria-live="polite"></div></section>' +
      '<div class="f3-more">' +
      '<details class="f3-x3" data-fund><summary><b>Check it against my cash and loan</b><em>the cash you have, a home you’re selling, and the monthly mortgage as it builds up</em></summary><div class="f3-xb">' +
      '<div class="f3-grid f3-grid-fund"><form class="f3-form" novalidate data-fund-form><p class="f3-fine">Uses the price and the assumptions above.</p>' +
      '<div class="f3-grp"><h2 class="f3-gh">Your cash</h2>' + money('cash', 'Cash you have now', { ph: 'e.g. 200,000' }) + '</div>' +
      '<div class="f3-grp" data-when="own:1"><h2 class="f3-gh">The home you own</h2>' + seg('order', 'What happens to it?', [['none', 'Keeping it'], ['buy', 'Buy first, then sell'], ['sell', 'Sell first, then buy']], 'none', {}) +
      '<div data-when="order:buy">' + seg('saleWhen', 'When does the sale complete?', [['unsure', 'Not decided yet'], ['date', '<span data-when="pkind:new,ec">During construction</span><span data-when="pkind:completed,resaleec,hdb">Around completion</span>'], ['afterKeys', '<span data-when="pkind:new,ec">After TOP</span><span data-when="pkind:completed,resaleec,hdb">After completion</span>']], 'unsure') + '<p class="f3-fine" data-when="saleWhen:unsure">Not decided: no sale money is counted, and the home stays in the plan with its loan and instalment.</p>' +
      '<div class="f3-g2" data-when="saleWhen:date">' + numf('saleMonth', 'Sale completes', 'months after the option', { ph: '5' }) + datef('saleDate', 'or on', { opt: true }) + '</div>' +
      '<div class="f3-g2" data-when="saleWhen:afterKeys">' + numf('saleAfter', 'Sale completes', 'months after the keys', { ph: '3' }) + '</div></div>' +
      '<div data-when="saleCount:1">' + saleHtml() + '<div data-when="order:buy">' + check('refund', 'Count an ABSD refund 2 months after the sale (if IRAS’s conditions are met)') + '</div><div data-when="order:sell">' + money('rent', 'Rent while you wait for the keys', { opt: true, unit: 'a month' }) + '</div></div></div>' +
      cpfBalHtml() + '<details class="f3-as" data-as><summary><span>Monthly savings</span> <em>optional</em></summary><div class="f3-g2">' + money('saveMo', 'Cash you can add each month', { opt: true }) + money('cpfMo', 'CPF added each month', { opt: true }) + '</div><p class="f3-fine">With these, the monthly mortgage is tested against your savings too.</p></details>' +
      '</form><div class="f3-fundout" data-fund-out aria-live="polite"></div></div></div></details>' +
      '<details class="f3-x3" data-scn hidden><summary><b>Compare another scenario</b><em>interest rate, tenure or when you sell</em></summary><div class="f3-xb"><div class="f3-g3">' +
      '<label class="f3-f"><span>Interest rate</span><span class="f3-in"><input type="text" inputmode="decimal" data-sk="rate"><i class="u">% a year</i></span></label><label class="f3-f"><span>Loan tenure</span><span class="f3-in"><input type="text" inputmode="decimal" data-sk="years"><i class="u">years</i></span></label>' +
      '<label class="f3-f f3-sel" data-scn-sale hidden><span>When you sell</span><span class="f3-in"><select data-sk="sale"><option value="">As in my plan</option><option value="sell">Sell first instead</option><option value="afterKeys">3 months after the keys</option><option value="unsure">Not decided</option></select></span></label></div><p class="f3-fine f3-scn-n" data-scn-n></p><div data-scn-out></div></div></details>' +
      '</div>' + askHtml('What will this home cost me?') + '</div><div class="f3-bar" data-bar hidden></div></section>';
  }

  /* ---------------- browser ---------------- */
  function mount() {
    if (typeof document === 'undefined') return;
    const box = document.querySelector('[data-f3]'); if (!box) return;
    const C = root.GW_CALC, F = root.GW_FIN3, P = root.GW_PLANNER, SCH = root.GW_SCHEDULE, KPT = root.KPT || { track: function () {} };
    if (!C || !F) return;
    const page = box.dataset.f3;
    const track = (n, p) => { try { KPT.track(n, Object.assign({ tool_name: 'fin3-' + page }, p || {})); } catch (e) { /* analytics unavailable */ } };
    const $$ = (s, el) => [].slice.call((el || box).querySelectorAll(s)), q = (s) => box.querySelector(s);
    const out = q('[data-out]'), bar = q('[data-bar]');
    const journey = /[?&]j=1(&|$)/.test(root.location.search);
    const store = (k) => ({ get() { try { return JSON.parse(root.sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set(o) { try { root.sessionStorage.setItem(k, JSON.stringify(o)); } catch (e) { /* storage blocked */ } }, del() { try { root.sessionStorage.removeItem(k); } catch (e) { /* ignore */ } } });
    // V3.7: standalone (no ?j=1) keeps its own entries and shares nothing; the journey shares as before (see the file header)
    const again = (() => { try { const n = root.performance.getEntriesByType('navigation')[0]; return !!n && (n.type === 'reload' || n.type === 'back_forward'); } catch (e) { return false; } })();
    const NOSTORE = { get() { return null; }, set() { /* standalone: nothing shared */ }, del() { /* nothing shared */ } };
    const ST = store(journey ? 'gw.fin3.v1' : 'gw.fin3.' + page + '.v1'), SH = journey ? store('gw.fin.v1') : NOSTORE, HAND = store('gw.fin3.hand.v1');
    const NAME = { borrow: 'How much can I borrow?', pay: 'What will this home cost me?', sell: 'What will I get from selling?', upgrade: 'Upgrade from HDB' };
    // an explicit hand-off: only the result the link names, for the page it opens, taken once on arrival (within two minutes)
    const handTo = (to, data) => HAND.set(Object.assign({ v: 1, to: to, from: page, t: Date.now() }, data));
    // ---- the entries: every field's text as typed (raw), the chips, and the list of repayments ----
    let raw = {}, loans = [];
    const fieldsOf = (k) => $$('[data-k="' + k + '"]');
    const segVal = (g) => { const b = g.querySelector('[aria-pressed="true"]'); return b ? b.dataset.v : ''; };
    const setSeg = (g, v) => $$('button', g).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    // a key can appear more than once on the payments page (the people, money and homes are asked once, in whichever section is open): all copies stay in step
    function put(k, v) {
      fieldsOf(k).forEach((x) => { const t = x.dataset.t; if (t === 'seg') setSeg(x, v == null ? x.dataset.def : String(v)); else if (t === 'check') x.checked = v === true || v === '1'; else if (t === 'sel') x.value = v || x.options[0].value; else if (t === 'hid') x.value = v == null ? '' : v; else if (document.activeElement !== x) x.value = v == null ? '' : v; });
    }
    function readAll() {
      const o = {};
      $$('[data-k]').forEach((x) => { const k = x.dataset.k, t = x.dataset.t; let v; if (t === 'seg') v = segVal(x); else if (t === 'check') v = x.checked ? '1' : '0'; else v = x.value; if (o[k] === undefined || (t !== 'seg' && t !== 'check' && v !== '' && document.activeElement === x)) o[k] = v; });
      return o;
    }
    const mv = (s) => { if (s == null || String(s).trim() === '') return null; const p = C.parseMoney(String(s)); return p.error || p.value === undefined ? NaN : p.value; };
    const nv = (s) => { if (s == null || String(s).trim() === '') return null; const p = C.parseNum(String(s)); return p.error || p.value === undefined ? NaN : p.value; };
    // errors are said beside the field, in plain words, and nothing is worked out from a figure that is not a number
    let errs = {};
    const L = C.LIMITS;
    function stOf(o) {
      errs = {};
      const M = (k, lim) => { const v = mv(o[k]); if (Number.isNaN(v)) { errs[k] = 'Type an amount, e.g. 5,000.'; return null; } if (v !== null && v > (lim || L.money.max)) { errs[k] = 'That is more than this calculator takes.'; return null; } return v; };
      const N = (k, lo, hi, text) => { const v = nv(o[k]); if (Number.isNaN(v)) { errs[k] = 'Type a number.'; return null; } if (v !== null && (v < lo || v > hi)) { errs[k] = text; return null; } return v; };
      const st = { n: o.n === '2' ? 2 : 1, p: [0, 1].map((k) => ({ age: N('p.' + k + '.age', L.age.min, L.age.max, 'Enter an age between ' + L.age.min + ' and ' + L.age.max + '.'), fixed: M('p.' + k + '.fixed', L.income.max), variable: M('p.' + k + '.variable', L.income.max), res: o['p.' + k + '.res'] || 'SC', nb: k === 1 && o['p.1.nb'] === '1' && page !== 'borrow' })),
        loans: loans.map((l) => ({ type: l.type, who: +l.who || 0, amt: (() => { const v = mv(l.amt); return v === null || Number.isNaN(v) ? null : v; })() })),
        cash: M('cash'), cpf: M('cpf'), homes: +(o.homes || 0), whose: o.whose || 'both', plan: o.plan || 'keep', couple: o.couple === 'yes' ? true : o.couple === 'no' ? false : undefined,
        sale: { type: o['sale.type'] || 'hdb', price: M('sale.price'), loan: M('sale.loan'), cpfRefund: M('sale.cpfRefund'), held: o['sale.held'] === 'yes' ? true : o['sale.held'] === 'no' ? false : undefined, oCash: M('sale.oCash'), oCpf: M('sale.oCpf'),
          comm: N('sale.comm', 0, 10, 'Enter a fee between 0% and 10%.'), legal: M('sale.legal'), penalty: M('sale.penalty'), o55: o['sale.o55'] === 'yes' ? 'yes' : o['sale.o55'] === 'no' ? 'no' : '', cpf55: M('sale.cpf55'), cpfUse: M('sale.cpfUse'), bought: o['sale.bought'] || null, sold: o['sale.sold'] || (o['sale.bought'] ? new Date().toISOString().slice(0, 10) : null) },
        cpfBal: [0, 1].map((k) => ({ oa: M('cpfBal.' + k + '.oa'), sa: M('cpfBal.' + k + '.sa') })), cover95: o.cover95 === 'yes' ? true : o.cover95 === 'no' ? false : null,
        ratePct: N('ratePct', L.ratePct.min, L.ratePct.max, 'Enter a rate between ' + L.ratePct.min + '% and ' + L.ratePct.max + '%.'), years: N('years', L.years.min, L.years.max, 'Enter between ' + L.years.min + ' and ' + L.years.max + ' years.'),
        saveMo: M('saveMo'), cpfMo: M('cpfMo'), upFlatMo: M('upFlatMo'), bfCash: M('bfCash'), bfCpf: M('bfCpf'),
        flatPrice: M('flatPrice'), flatVal: M('flatVal'), reserve: M('reserve'), bkind: o.bkind || 'private', hdbLoan: o.hdbLoan || 'hdb', btoRoom: o.btoRoom || '4', household: o.household || 'family', lease: N('lease', 1, 99, 'Enter the remaining lease, 1 to 99 years.'), akind: o.akind || 'new', price: M('price'), valuation: M('valuation'), loanAmt: M('loanAmt'),
        pkind: o.pkind || 'new', otp: o.otp || null, noDate: o.noDate === '1', top: o.top || null, csc: o.csc || null, completion: o.completion || null,
        order: o.order || 'none', saleWhen: o.saleWhen || 'unsure', saleMonth: N('saleMonth', 1, 120, 'Between 1 and 120 months.'), saleDate: o.saleDate || null, saleAfter: N('saleAfter', 0, 120, 'Between 0 and 120 months.'), refund: o.refund === '1', rent: M('rent') };
      if (st.cover95 === null && o.cover95 === 'unsure') st.cover95 = null;
      // V3.4: bonus and commission are typed as a year's total and rent as a month's; the engines take one monthly figure (bonus / 12 + rent), as before
      [0, 1].forEach((k) => { const yk = 'p.' + k + '.bonusYr', rk = 'p.' + k + '.rentMo';
        if (o[yk] === undefined && o[rk] === undefined) return;
        const by = M(yk), rm = M(rk); st.p[k].variable = by === null && rm === null ? null : Math.round(((by || 0) / 12 + (rm || 0)) * 100) / 100; });
      if (st.n === 1) st.p[1] = {};
      return st;
    }
    // ---- the conditional parts: shown only when they apply ----
    function flags(o, st) {
      const res = [st.p[0].res, st.n === 2 ? st.p[1].res : null];
      return { n: String(st.n), own: st.homes >= 1 ? '1' : '0', ownTwo: st.n === 2 && st.homes >= 1 ? '1' : '0', mixed: st.n === 2 && st.homes === 0 && (res[0] === 'SC') !== (res[1] === 'SC') && (res[0] === 'SC' || res[1] === 'SC') ? '1' : '0',
        saleCount: st.homes >= 1 && (st.order === 'sell' || (st.order === 'buy' && st.saleWhen !== 'unsure')) ? '1' : '0',
        hdbl: st.bkind === 'hdb' && st.hdbLoan !== 'bank' ? '1' : '0', bpriv: st.bkind === 'private' ? '1' : '0' };
    }
    function applyWhen(o, st) {
      const fl = flags(o, st);
      $$('[data-when]').forEach((el) => { const i = el.dataset.when.indexOf(':'), k = el.dataset.when.slice(0, i), vs = el.dataset.when.slice(i + 1).split(','); const v = fl[k] !== undefined ? fl[k] : (o[k] !== undefined ? o[k] : ''); el.hidden = vs.indexOf(v) < 0; });
    }
    // ---- the list of repayments ----
    // the rows are redrawn only when their number, type or owner changes; amounts stay as typed in their own inputs
    function drawLoans(st) {
      const two = st ? st.n === 2 : raw.n === '2', key = two + '|' + loans.map((l) => l.type + ':' + l.who).join(',');
      $$('[data-loans]').forEach((ul) => { if (ul.__key === key) return; ul.innerHTML = loans.map((l, k) => loanRow(k, l, two)).join(''); ul.__key = key; wireMoney(ul); });
    }
    box.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add-loan]'); if (add) { loans.push({ type: (raw.homes || '0') !== '0' && !loans.some((l) => l.type === 'home') ? 'home' : 'car', who: 0, amt: '' }); drawLoans(); const ul = add.parentElement.querySelector('[data-loans]'); const f = ul && ul.lastElementChild && ul.lastElementChild.querySelector('[data-lk="amt"]'); if (f) f.focus(); changed(); return; }
      const del = e.target.closest('[data-del-loan]'); if (del) { loans.splice(+del.closest('[data-loan]').dataset.loan, 1); drawLoans(); changed(); return; }
      const sg = e.target.closest('[data-t="seg"] button'); if (sg) { const g = sg.parentElement; if (SALE_K.indexOf(g.dataset.k) >= 0) { put('sale.oCash', ''); put('sale.oCpf', ''); } fieldsOf(g.dataset.k).forEach((x) => setSeg(x, sg.dataset.v)); if (g.dataset.k === 'n' && sg.dataset.v === '2') { const f = q('[data-k="p.1.age"]'); setTimeout(() => { if (f && f.offsetParent) f.focus(); }, 0); } changed(true); return; }
      const ch = e.target.closest('[data-chip]'); if (ch) { openChip(ch.getAttribute('aria-expanded') === 'true' ? null : ch.dataset.chip); return; }
      if (e.target.closest('[data-chp-done]')) { const k0 = openK; openChip(null); const c0 = q('[data-chip="' + k0 + '"]'); if (c0) c0.focus(); return; }
      if (e.target.closest('[data-fresh]')) { fresh(); return; }
      const go = e.target.closest('[data-go]'); if (go) { goTo(go); }
    });
    const SALE_K = ['sale.price', 'sale.loan', 'sale.cpfRefund', 'sale.type', 'sale.held'];
    box.addEventListener('input', (e) => { const x = e.target; if (x.dataset.k && SALE_K.indexOf(x.dataset.k) >= 0) { put('sale.oCash', ''); put('sale.oCpf', ''); } if (x.dataset.lk) { const k = +x.closest('[data-loan]').dataset.loan; loans[k][x.dataset.lk] = x.value; changed(); return; } if (x.dataset.k) { fieldsOf(x.dataset.k).forEach((y) => { if (y !== x && y.dataset.t !== 'seg') { if (y.dataset.t === 'check') y.checked = x.checked; else y.value = x.value; } }); changed(); } });
    box.addEventListener('change', (e) => { const x = e.target; if (x.dataset.lk) { const k = +x.closest('[data-loan]').dataset.loan; loans[k][x.dataset.lk] = x.value; changed(true); } else if (x.dataset.k) { fieldsOf(x.dataset.k).forEach((y) => { if (y !== x) { if (y.dataset.t === 'check') y.checked = x.checked; else y.value = x.value; } }); changed(true); } });
    function wireMoney(el) { if (root.GW_MONEY) $$('input[data-t="money"],input[data-lk="amt"]', el).forEach((x) => { if (x.__w) return; x.__w = 1; root.GW_MONEY.wire(x, { parse: (t) => { const v = mv(t); return v === null || Number.isNaN(v) ? null : v; }, max: L.money.max }); }); }
    // ---- saving (this tab only), and what is shared with the other calculators ----
    const SHARED = { 'p.0.age': 'borrowers.0.age', 'p.0.fixed': 'borrowers.0.fixed', 'p.0.variable': 'borrowers.0.variable', 'p.1.age': 'borrowers.1.age', 'p.1.fixed': 'borrowers.1.fixed', 'p.1.variable': 'borrowers.1.variable', cash: 'cash', cpf: 'cpfOa', price: 'buyPrice' };
    function save() {
      ST.set({ v: 3, raw: raw, loans: loans, brought: brought });
      const sh = SH.get() || {};
      Object.keys(SHARED).forEach((k) => { const s = SHARED[k]; if (/^p\.1\./.test(k) && raw.n !== '2') { delete sh[s]; return; } if (raw[k] !== undefined && raw[k] !== '') sh[s] = raw[k]; else delete sh[s]; });
      if (sh.buyFrom && raw.price !== sh.buyPrice) delete sh.buyFrom;
      SH.set(sh);
    }
    function fresh() {
      ST.del(); HAND.del(); const sh = SH.get() || {}; Object.keys(SHARED).forEach((k) => delete sh[SHARED[k]]); delete sh.buyFrom; SH.set(sh);
      try { root.sessionStorage.removeItem('kpt.handoff'); } catch (e) { /* ignore */ }
      track('fin3_fresh', {}); root.location.replace(root.location.pathname + root.location.search);
    }
    // ---- restore: this tab's entries, then the shared figures from the other calculators (a price from Research, a sale from Sale proceeds) ----
    let carried = false, fromResearch = null, saleFrom = false, fromPrice = null, saleSig = null, brought = null; const offPage = {};
    (function restore() {
      // standalone: a new visit starts blank (its own entries from before are removed); a refresh or Back/Forward brings them back
      if (!journey && !again) ST.del();
      const s = ST.get(), sh = SH.get() || {}, hs = (root.location.hash || '').replace('#', '');
      if (s && s.raw) { raw = s.raw; loans = Array.isArray(s.loans) ? s.loans : []; if (s.brought && s.brought.v === raw[s.brought.k]) brought = s.brought; }
      Object.keys(SHARED).forEach((k) => { const v = sh[SHARED[k]]; if (v !== undefined && v !== '' && (raw[k] === undefined || raw[k] === '')) { raw[k] = String(v); if (/^p\.1\./.test(k)) raw.n = '2'; } });
      if (sh.buyFrom && sh.buyPrice) { raw.price = String(sh.buyPrice); fromResearch = sh.buyFrom; fromPrice = raw.price; }
      // the sale worked out in Sale proceeds on the journey (shared figures): used only where this tab has none of its own
      if (!raw['sale.price'] && sh.sellPrice) { raw['sale.price'] = String(sh.sellPrice); if (sh.outstandingLoan !== undefined && !raw['sale.loan']) raw['sale.loan'] = String(sh.outstandingLoan); if (sh.homeType && !raw['sale.type']) raw['sale.type'] = sh.homeType === 'hdb' ? 'hdb' : 'private';
        const pr = mv(sh.cpfPrincipal), it = mv(sh.cpfInterest); if (!raw['sale.cpfRefund'] && pr !== null && it !== null && !Number.isNaN(pr) && !Number.isNaN(it)) raw['sale.cpfRefund'] = Math.round(pr + it).toLocaleString('en-US'); }
      if (/^#sell$/.test(root.location.hash || '')) {
        const S2 = store('gw.sell.v1'), h = S2.get();
        if (!raw.homes || raw.homes === '0') raw.homes = '1';
        raw.plan = 'sell'; raw.order = 'sell';
        if (h && h.v === 1) { raw['sale.type'] = h.type === 'hdb' ? 'hdb' : 'private'; ['price', 'loan', 'cpfRefund'].forEach((f) => { raw['sale.' + f] = typeof h[f] === 'number' ? Math.round(h[f]).toLocaleString('en-US') : ''; }); raw['sale.held'] = h.held ? 'yes' : '';
          raw['sale.oCash'] = typeof h.overrideCash === 'number' ? String(h.overrideCash) : ''; raw['sale.oCpf'] = typeof h.overrideCash === 'number' ? String(h.overrideCpf || 0) : ''; saleFrom = true; }
        S2.del(); try { root.history.replaceState(null, '', root.location.pathname + root.location.search); } catch (e) { /* ignore */ }
      }
      // V3.4: a bonus kept from before as a monthly average (or shared by another tool) becomes the year's figure the pages now ask for
      [0, 1].forEach((k) => { const v = mv(raw['p.' + k + '.variable']); if (v !== null && !Number.isNaN(v) && v > 0 && !raw['p.' + k + '.bonusYr'] && !raw['p.' + k + '.rentMo']) raw['p.' + k + '.bonusYr'] = Math.round(v * 12).toLocaleString('en-US'); });
      // the folded pages' old addresses arrive with a hash: #cash (What can I afford?), #hdb / #hdb-bank / #ec (HDB and EC loan limit), #private / #hdb / #ec (Sale proceeds)
      if (page === 'borrow') { if (hs === 'hdb' || hs === 'hdb-loan') { raw.bkind = 'hdb'; raw.hdbLoan = 'hdb'; } else if (hs === 'hdb-bank') { raw.bkind = 'hdb'; raw.hdbLoan = 'bank'; } else if (hs === 'ec') raw.bkind = 'ec'; }
      if (page === 'sell' && ['hdb', 'private', 'ec'].indexOf(hs) >= 0) raw['sale.type'] = hs;
      carried = ['p.0.age', 'p.0.fixed', 'cash', 'cpf', 'price'].some((k) => raw[k] !== undefined && raw[k] !== '') || loans.length > 0;
      // an explicit hand-off from another calculator: only what the link named, said under the field it filled
      const hd = HAND.get(); if (hd) HAND.del();
      if (hd && hd.v === 1 && hd.to === page && Date.now() - (hd.t || 0) < 120000) {
        if (hd.price) { raw.price = hd.price; brought = { k: 'price', v: hd.price, text: (hd.what === 'budget' ? 'Your budget' : 'Price') + ' brought in from ' + (NAME[hd.from] || 'another calculator') + '.' }; }
        if (hd.pkind && page === 'pay') raw.pkind = hd.pkind;
        if (hd.bkind) raw.bkind = hd.bkind;
        if (hd.sale) { Object.keys(hd.sale).forEach((k) => { if (/^sale\./.test(k)) raw[k] = hd.sale[k]; }); if (!raw.homes || raw.homes === '0') raw.homes = '1'; raw.plan = 'sell'; raw.order = 'sell'; raw.bkind = 'private'; saleFrom = true; }
      }
      if (page === 'sell' || page === 'upgrade') {
        const H = journey ? flatCtx() : null;
        if (H && (!raw['sale.price'] || raw['sale.price'] === '') && (page === 'upgrade' || !raw['sale.type'] || raw['sale.type'] === 'hdb')) { raw['sale.price'] = (Math.round((H.lo + H.hi) / 2 / 1000) * 1000).toLocaleString('en-US'); raw['sale.type'] = 'hdb'; }
        const bh = q('[data-blockhint]'); if (bh && H) { bh.hidden = false; bh.innerHTML = 'Flats like yours at Blk ' + esc(H.block) + ' ' + esc(titleCase(H.street)) + ' sold for ' + $(H.lo) + '–' + $(H.hi) + ' (' + H.n + ' recent resales). <a href="../../journey/worth/#hdb" data-gw-go="worth-hdb">See them</a>'; }
      }
      Object.keys(raw).forEach((k) => put(k, raw[k]));
      // V3.4: entries another page asked for (the sale on the borrowing page, the income on the selling page...) are kept as they are, so a hand-off never loses them
      Object.keys(raw).forEach((k) => { if (!fieldsOf(k).length) offPage[k] = raw[k]; });
      const cl = q('[data-carry]'); if (cl) cl.hidden = !carried;
      if (page === 'borrow' && (hs === 'cash' || hs === 'sell')) { const cr = q('[data-cashrow]'); if (cr) { cr.open = true; cr.__auto = true; } }
      const FROM = { typical: 'Price from Research: the typical recent price in past sales, not a valuation or a listing.', asking: 'Price from Research: the asking price you entered there.' };
      const fr = q('[data-from-research]'); if (fr && fromResearch) { fr.hidden = false; fr.textContent = FROM[fromResearch] || 'The price you brought from Research.'; }
      if (fr && !fromResearch && brought && brought.k === 'price') { fr.hidden = false; fr.textContent = brought.text; fromPrice = brought.v; }
      if (saleFrom) $$('[data-sale-line]').forEach((x) => { x.textContent = 'The sale figures brought in from ' + NAME.sell + ' Your cash and CPF above are what you have now; the sale is counted on its own.'; });
    })();
    wireMoney(box); drawLoans();
    // ---- recalculation ----
    let tmr = null, started = false, completed = false, last = null;
    root.__f3Settled = () => tmr === null;
    function changed(now) { if (!started) { started = true; track('tool_started', {}); } clearTimeout(tmr); tmr = setTimeout(recalc, now === true ? 0 : 120); }
    function showErrs() { $$('[data-err]').forEach((el) => { const t = errs[el.dataset.err] || ''; el.hidden = !t; el.textContent = t; const f = el.closest('.f3-f'); if (f) f.classList.toggle('bad', !!t); }); }
    function recalc() {
      tmr = null;
      raw = Object.assign({}, offPage, readAll()); const st = stOf(raw);
      if (page !== 'sell' && (raw['sale.oCash'] || raw['sale.oCpf']) && saleSig !== null && saleSig !== ['sale.price', 'sale.loan', 'sale.cpfRefund'].map((k) => raw[k] || '').join('|')) { raw['sale.oCash'] = ''; raw['sale.oCpf'] = ''; put('sale.oCash', ''); put('sale.oCpf', ''); }
      saleSig = ['sale.price', 'sale.loan', 'sale.cpfRefund'].map((k) => raw[k] || '').join('|');
      [0, 1].forEach((k) => { if (raw['p.' + k + '.bonusYr'] !== undefined || raw['p.' + k + '.rentMo'] !== undefined) raw['p.' + k + '.variable'] = st.p[k] && typeof st.p[k].variable === 'number' ? String(st.p[k].variable) : ''; });
      applyWhen(raw, st); drawLoans(st); showErrs(); save();
      paintHomeLoanNote(st);
      { const fr = q('[data-from-research]'); if (fr && !fr.hidden && fromPrice !== null && String(raw.price || '').replace(/\D/g, '') !== String(fromPrice).replace(/\D/g, '')) { fr.hidden = true; brought = null; } }
      const asSum = q('[data-as-sum]'); if (asSum) asSum.textContent = (st.ratePct !== null ? st.ratePct : 4) + '% · ' + (st.years ? yrs(st.years) : 'longest standard tenure');
      lastSt = st;
      if (page === 'borrow') paintBorrow(st); else if (page === 'afford') paintAfford(st); else if (page === 'sell') paintSell(st); else if (page === 'upgrade') paintUpgrade(st); else paintPay(st);
      if (openK) paintSheet(openK);
    }
    function paintHomeLoanNote(st) {
      $$('[data-homeloan-note]').forEach((el) => { const h = F.loansOf(Object.assign({}, st, { p: st.p })).home; el.textContent = st.homes >= 1 ? (h ? 'Its home loan is the home-loan repayment in your list.' : 'No home-loan repayment in your list, so it is taken as fully paid. Still paying one? Add it under loans you’re repaying.') : ''; });
    }
    const need = (keys) => '<ul class="f3-need">' + keys.map((k) => '<li><button type="button" class="f3-lnk" data-go="' + k + '">' + ({ age: 'Age', fixed: 'Monthly salary' }[k.split('.').pop()] || k) + (raw.n === '2' ? (k.indexOf('p.1') === 0 ? ', second person' : ', first person') : '') + '</button></li>').join('') + '</ul>';
    // one chip opens at a time: a short list of choices, each with what it changes (worked out by the same engine), and "Custom" for the few entries behind it.
    // Picking a choice applies it and closes the list; on a phone the list is a sheet from the bottom of the screen.
    let openK = null, lastSt = null;
    function openChip(k, focusKey) {
      openK = k;
      $$('[data-chp]').forEach((pn) => { pn.hidden = pn.dataset.chp !== k; });
      $$('[data-chip]').forEach((c) => c.setAttribute('aria-expanded', String(c.dataset.chip === k)));
      const sc = q('[data-scrim]'); if (sc) sc.hidden = !k;
      box.classList.toggle('f3-sheet-open', !!k);
      if (!k) return;
      paintSheet(k);
      const pn = q('[data-chp="' + k + '"]'), f = focusKey ? q('[data-chp="' + k + '"] [data-k="' + focusKey + '"]') : null;
      if (f) { const cu = f.closest('[data-cust]'); if (cu && !cu.classList.contains('f3-hold')) cu.hidden = false; }
      try { pn.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* ignore */ }
      const f2 = f || pn.querySelector('.f3-cust-open input');
      if (f2 && f2.offsetParent) f2.focus({ preventScroll: true }); else { const o = pn.querySelector('[data-opt]'); if (o) o.focus({ preventScroll: true }); }
    }
    function showCust(k) { const cu = q('[data-cust="' + k + '"]'); if (cu && !cu.classList.contains('f3-hold')) { cu.hidden = false; const f = cu.querySelector('input:not([type="hidden"]),select'); if (f && f.offsetParent) f.focus(); } }
    function paintSheet(k) {
      const el = q('[data-optl="' + k + '"]'); if (!el || !lastSt) return;
      const groups = (page === 'borrow' ? optsBorrow : page === 'sell' ? optsSell : page === 'upgrade' ? optsUp : optsPay)(k, lastSt) || [];
      el.innerHTML = groups.map((g) => (g.title ? '<p class="f3-og">' + g.title + '</p>' : '') + g.opts.map((o) => '<button type="button" class="f3-opt' + (o.sel ? ' sel' : '') + '" data-opt="' + esc(JSON.stringify({ set: o.set || {}, act: o.act || '' })) + '" aria-pressed="' + !!o.sel + '"><span class="f3-ol">' + o.label + '</span>' + (o.sub ? '<span class="f3-os">' + o.sub + '</span>' : '') + '</button>').join('')).join('') +
        (groups.note ? '<p class="f3-onote">' + groups.note + '</p>' : '');
      if (groups.some((g) => g.opts.some((o) => o.sel && o.act === 'cust'))) { const cu = q('[data-cust="' + k + '"]'); if (cu && !cu.classList.contains('f3-hold')) cu.hidden = false; }
    }
    function applyOpt(btn) {
      const o = JSON.parse(btn.dataset.opt), k = openK;
      Object.keys(o.set).forEach((key) => {
        const v = o.set[key];
        if (key === '__loans') { if (v === 'clear') loans = []; else if (v === 'add' && !loans.length) loans.push({ type: 'car', who: 0, amt: '' }); drawLoans(); return; }
        if (key === '__homeloan') { if (v === 'clear') loans = loans.filter((l) => l.type !== 'home'); else if (!loans.some((l) => l.type === 'home')) loans.push({ type: 'home', who: 0, amt: '' }); drawLoans(); return; }
        put(key, v);
      });
      changed(true);
      if (o.act === 'cust') { showCust(k); setTimeout(() => paintSheet(k), 10); return; }
      if (o.act === 'stay') { setTimeout(() => paintSheet(k), 10); return; }
      openChip(null); const c0 = q('[data-chip="' + k + '"]');
      const inc2 = page === 'borrow' && o.set && o.set.n === '2' ? q('.f3-inc [data-k="p.1.fixed"]') : null;
      if (inc2 && !inc2.value) setTimeout(() => { try { inc2.focus(); } catch (e) { /* ignore */ } }, 0); else if (c0) c0.focus();
    }
    box.addEventListener('click', (e) => { const ob = e.target.closest('[data-opt]'); if (ob) { applyOpt(ob); return; } if (e.target.closest('[data-scrim]')) openChip(null); });
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && openK && e.target.closest('[data-chp]') && e.target.matches('input')) { e.preventDefault(); const k = openK; changed(true); openChip(null); const c0 = q('[data-chip="' + k + '"]'); if (c0) c0.focus(); return; } if (e.key === 'Escape' && openK) { const k = openK; openChip(null); const c0 = q('[data-chip="' + k + '"]'); if (c0) c0.focus(); } });
    const fmt = (n) => Math.round(n).toLocaleString('en-US');
    const withP0 = (st, ov) => Object.assign({}, st, { p: st.p.map((x, i) => (i === 0 ? Object.assign({}, x, ov) : x)) });
    // the choices on What will this home cost me?, each with its consequence for this price
    function optsPay(k, st) {
      const c0 = costOf(st), ok = c0.state === 'ok', alt = (ov) => { const c = costOf(Object.assign({}, st, ov)); return c.state === 'ok' ? c : null; }, up = (c) => c.down + c.duty;
      const cust = (label) => ({ label: label, act: 'cust' });
      if (k === 'pkind') return [{ opts: [['new', 'New launch', 'Paid in stages as it is built'], ['ec', 'New EC', 'Home loan capped at 30% of income (MSR)'], ['completed', 'Completed private', 'Paid in full at completion'], ['resaleec', 'Resale EC', 'Bought after its minimum occupation period'], ['hdb', 'HDB resale flat', 'Option, HDB’s approval, then completion'], ['bto', 'New HDB flat (BTO)', 'Paid at signing and at key collection']].map((x) => ({ label: x[1], sub: x[2], set: { pkind: x[0] }, act: x[0] === 'bto' ? 'stay' : '', sel: st.pkind === x[0] })) }]
        .concat(st.pkind === 'bto' ? [{ title: 'Flat size (it sets HDB’s booking fee)', opts: [['2', '2-room Flexi', root.GW_RULES.hdbPayments.bto.bookingFee.flexi2], ['3', '3-room', root.GW_RULES.hdbPayments.bto.bookingFee.room3], ['4', '4-room or bigger', root.GW_RULES.hdbPayments.bto.bookingFee.room4plus]].map((x) => ({ label: x[1], sub: 'Booking fee ' + $(x[2]), set: { btoRoom: x[0] }, sel: (st.btoRoom || '4') === x[0] })) }] : []);
      if (k === 'who') {
        const dutyOf = (c) => (c ? (c.absd > 0 ? 'ABSD ' + Math.round(c.absdRate * 100) + '% · ' + $(c.absd) : 'No ABSD') : '');
        const g = [];
        g.push({ title: 'Buying as', opts: [['SC', 'Singapore Citizen'], ['PR', 'Permanent Resident'], ['FR', 'Foreigner']].map((x) => ({ label: x[1], sub: ok ? dutyOf(alt({ n: 1, p: [Object.assign({}, st.p[0], { res: x[0] }), {}] })) : '', set: { n: '1', 'p.0.res': x[0] }, sel: st.n === 1 && st.p[0].res === x[0] })).concat([{ label: 'Two buyers', sub: 'Each buyer’s residency and age', act: 'cust', set: { n: '2' }, sel: st.n === 2 }]) });
        const h0 = ok ? alt({ homes: 0 }) : null;
        g.push({ title: 'Homes you own now', opts: [[0, 'First home'], [1, 'Second home'], [2, 'Third or more']].map((x) => { const c = ok ? alt({ homes: x[1] === 0 ? 0 : x[0] }) : null; const c2 = ok ? alt({ homes: x[0] }) : null; return { label: x[1], sub: c2 ? (c2.absd > 0 ? 'ABSD ' + Math.round(c2.absdRate * 100) + '%' + (h0 && c2.absd - h0.absd > 0.5 ? ' · adds ' + $(c2.absd - h0.absd) : '') : 'No ABSD') : '', set: { homes: String(x[0]) }, act: x[0] >= 1 ? 'stay' : '', sel: st.homes === x[0] }; }) });
        if (st.homes >= 1) {
          const L0 = F.loansOf(st), wl = ok ? alt({ loans: (st.loans || []).concat([{ type: 'home', who: 0, amt: 1 }]) }) : null;
          g.push({ title: 'Still paying a home loan on it?', opts: [{ label: 'No, fully paid', sub: ok ? 'Loan limit ' + pc(alt({ loans: (st.loans || []).filter((l) => l.type !== 'home') }).ltv) : '', set: { __homeloan: 'clear' }, sel: L0.home === 0 }, { label: 'Yes, still paying', sub: wl ? 'Loan limit ' + pc(wl.ltv) + ' · upfront ' + $(up(wl)) : '', act: 'cust', set: { __homeloan: 'add' }, sel: L0.home > 0 }] });
        }
        g.push({ opts: [cust('Ages, incomes and other loans')] });
        g.note = 'Count any share in a home, including a flat you are selling. Ages and incomes are only for the income check.';
        return g;
      }
      if (!ok) return [{ opts: [cust('Enter it yourself')] }];
      if (c0.hdb && k === 'loan') {
        const H = alt({ hdbLoan: 'hdb', loanAmt: null, ratePct: null }), Bk = alt({ hdbLoan: 'bank', loanAmt: null, ratePct: null }), N0 = alt({ loanAmt: 0 });
        return [{ title: 'Loan from', opts: [
          { label: 'HDB loan', sub: H ? pc(H.ltv) + ' of the ' + (H.cov > 0 ? 'valuation' : 'price') + ' · ' + H.ratePct + '% · no minimum cash · ' + $(H.monthly) + '/mo' : '', set: { hdbLoan: 'hdb', loanAmt: '', ratePct: '' }, sel: c0.lender === 'hdb' && c0.typed === null },
          { label: 'Bank loan', sub: Bk ? pc(Bk.ltv) + ' · at least ' + pc(Bk.minCash) + ' cash · ' + Bk.ratePct + '% · ' + $(Bk.monthly) + '/mo' : '', set: { hdbLoan: 'bank', loanAmt: '', ratePct: '' }, sel: c0.lender === 'bank' && c0.typed === null },
          { label: 'No loan', sub: N0 ? 'All ' + $(up(N0)) + ' from cash and CPF' : '', set: { loanAmt: '0' }, sel: c0.typed === 0 }] },
          { opts: [cust(c0.flat === 'resale' ? 'Another amount, or the valuation' : 'Another amount')] }];
      }
      if (c0.hdb && k === 'rate') {
        const tl = c0.lender === 'hdb' ? [25, 20, 15] : [30, 25, 20], r0 = c0.ratePct;
        const g = (c0.lender === 'bank' ? [{ title: 'Interest rate', opts: [2.5, 3, 3.5, 4].map((r) => { const c = alt({ ratePct: r }); return { label: r + '% a year', sub: c ? $(c.monthly) + '/mo' : '', set: { ratePct: String(r) }, sel: r0 === r }; }) }] : [])
          .concat([{ title: 'Loan tenure', opts: tl.map((y) => { const c = alt({ years: y }); return { label: y + ' years', sub: c ? $(c.monthly) + '/mo' + (c.years < y ? ' · ' + yrs(c.years) + ' to age ' + (c0.lender === 'hdb' ? root.GW_RULES.hdbLoan.endAge : root.GW_RULES.bankLtv.maturityAge) : '') + (c.lower ? ' · loan limit ' + pc(c.ltv) : '') : '', set: { years: String(y) }, sel: (st.years || c0.years) === y }; }) }, { opts: [cust('Another tenure or rate')] }]);
        if (c0.lender === 'hdb') g.note = 'The HDB loan rate is ' + Math.round(root.GW_RULES.hdbLoanRate * 1000) / 10 + '% a year (' + root.GW_RULES.hdbLoanRateFor + '). An HDB loan runs up to ' + root.GW_RULES.hdbLoan.maxTenureYears + ' years and ends by age ' + root.GW_RULES.hdbLoan.endAge + '.';
        return g;
      }
      if (k === 'loan') {
        const P = c0.price, rule = c0.ruleLoan, list = [{ label: 'The most allowed', sub: pc(rule / P) + ' of the price · ' + $(rule), set: { loanAmt: '' }, sel: c0.typed === null }];
        [0.7, 0.6, 0.5].filter((x) => P * x < rule - 1).forEach((x) => { const c = alt({ loanAmt: Math.round(P * x) }); if (c) list.push({ label: Math.round(x * 100) + '% of the price', sub: $(c.loan) + ' · upfront ' + $(up(c)) + ' · ' + $(c.monthly) + '/mo', set: { loanAmt: fmt(P * x) }, sel: c0.typed !== null && Math.abs(c0.typed - P * x) < 1 }); });
        list.push(cust('Another amount'));
        return [{ opts: list }];
      }
      if (k === 'rate') {
        const r0 = st.ratePct !== null ? st.ratePct : 4;
        return [{ title: 'Interest rate', opts: [2.5, 3, 3.5, 4].map((r) => { const c = alt({ ratePct: r }); return { label: r + '% a year', sub: c ? $(c.monthly) + '/mo' : '', set: { ratePct: String(r) }, sel: r0 === r }; }) },
          { title: 'Loan tenure', opts: [35, 30, 25, 20].map((y) => { const c = alt({ years: y }); return { label: y + ' years', sub: c ? $(c.monthly) + '/mo' + (c.years < y ? ' · ' + yrs(c.years) + ' to age ' + root.GW_RULES.bankLtv.maturityAge : '') + (c.lower ? ' · loan limit ' + pc(c.ltv) + ', ' + $(c.down + c.duty) + ' upfront' : '') : '', set: { years: String(y) }, sel: (st.years || c0.years) === y }; }) },
          { opts: [cust('Another tenure or rate')] }];
      }
      if (k === 'cpf') {
        const most = c0.flex, list = [{ label: 'No CPF', sub: 'All ' + $(up(c0)) + ' in cash', set: { cpf: '' }, sel: !(st.cpf > 0) }];
        [100000, 200000, 300000].filter((x) => x < most - 1).forEach((x) => { const c = alt({ cpf: x }); list.push({ label: $(x), sub: 'Cash ' + $(c.cash), set: { cpf: fmt(x) }, sel: st.cpf === x }); });
        if (most > 0.5) { const c = alt({ cpf: most }); list.push({ label: 'As much as it can cover', sub: $(most) + ' · cash ' + $(c.cash), set: { cpf: fmt(most) }, sel: Math.abs((st.cpf || 0) - most) < 1 }); }
        list.push(cust('Another amount'));
        const g = [{ opts: list }]; if (c0.hdb) { g.note = 'CPF Ordinary Account savings you have and can use, including any CPF housing grant. ' + (c0.lender === 'hdb' ? 'An HDB loan needs no minimum cash; HDB expects you to use your CPF savings above $' + root.GW_RULES.hdbLoan.oaRetain.toLocaleString('en-US') + ' first, which can make the loan smaller.' : 'With a bank loan, at least ' + pc(c0.minCash) + ' of the price must be cash.') + ' Stamp duty is paid from CPF by default.'; return g; }
        g.note = 'CPF Ordinary Account savings you have and can use. At least ' + pc(c0.minCash) + ' of the price must be cash (MAS rule). Stamp duty is usually paid in cash first; CPF may reimburse eligible duty, or pay it directly for some purchases under construction.' + (st.homes >= 1 ? ' Owning another home, CPF can be used only above a set-aside (the Basic or Full Retirement Sum), so check the amount with CPF.' : ''); return g;
      }
      return [];
    }
    // the choices on How much can I borrow?, each with what the bank may then lend
    function optsBorrow(k, st) {
      const b0 = F.borrow(st, { assumeAge: true }), ok = b0.state === 'ok', lend = (s2) => { const b = F.borrow(s2, { assumeAge: true }); return b.state === 'ok' ? b : null; };
      const cust = (label) => ({ label: label, act: 'cust' });
      if (k === 'n') return [{ opts: [{ label: 'Just me', set: { n: '1' }, sel: st.n === 1 }, { label: 'Two of us', sub: page === 'borrow' ? 'Both incomes go at the top; ages under Age' : 'Add the second person’s income and age', act: page === 'borrow' ? '' : 'cust', set: { n: '2' }, sel: st.n === 2 }] }];
      if (k === 'loans') { const L0 = F.loansOf(st); const g = [{ opts: [{ label: 'No other loans', set: { __loans: 'clear' }, sel: !loans.length }, { label: 'I’m repaying loans', sub: L0.total > 0 ? $(L0.total) + ' a month now' : 'Home, car, study or personal, each a month', act: 'cust', set: { __loans: 'add' }, sel: loans.length > 0 }] }]; return g; }
      if (k === 'bkind') { const g0 = [{ opts: [['private', 'hdb', 'Private home'], ['hdb', 'hdb', 'HDB flat, HDB loan'], ['hdb', 'bank', 'HDB flat, bank loan'], ['ec', 'hdb', 'New EC']].map((x) => { const b = ok ? lend(Object.assign({}, st, { bkind: x[0], hdbLoan: x[1] })) : null; return { label: x[2], sub: b ? 'Lends about ' + $r(b.maxLoan) + (b.binding === 'msr' ? ' · 30% of income cap' : '') : '', set: { bkind: x[0], hdbLoan: x[1] }, sel: st.bkind === x[0] && (x[0] !== 'hdb' || (st.hdbLoan || 'hdb') === x[1]) }; }) }];
        if (st.bkind === 'hdb' && st.hdbLoan !== 'bank') {
          const C0 = root.GW_RULES.hdbIncomeCeilings || {};
          g0.push({ title: 'Applying for the HDB loan as', opts: [['family', 'Family'], ['extended', 'Extended family'], ['single', 'Single, 35 or older']].map((x) => ({ label: x[1], sub: C0[x[0]] ? 'HDB loan income ceiling ' + $(C0[x[0]]) + ' a month' : '', set: { household: x[0] }, sel: (st.household || 'family') === x[0], act: 'stay' })) });
          g0.push({ opts: [{ label: 'Remaining lease of the flat', sub: st.lease ? st.lease + ' years' + (b0 && b0.state === 'ok' && b0.ltv < 0.75 ? ' · loan limit ' + pc(b0.ltv) : '') : 'Below 95 for the youngest of you, HDB lends less', act: 'cust', sel: !!st.lease }] });
        }
        return g0; }
      if (k === 'age') return [];   // ages are typed exactly, never picked from round numbers
      if (k === 'rate') {
        const hdbL = st.bkind === 'hdb' && st.hdbLoan !== 'bank', r0 = st.ratePct !== null ? st.ratePct : (hdbL ? Math.round(root.GW_RULES.hdbLoanRate * 1000) / 10 : 4);
        const g = [];
        if (!hdbL) g.push({ title: 'Interest rate', opts: [3, 3.5, 4, 4.5, 5].map((r) => { const b = ok ? lend(Object.assign({}, st, { ratePct: r })) : null; return { label: r + '% a year', sub: b ? 'Lends about ' + $r(b.maxLoan) + ' · ' + $(b.monthly) + '/mo' : '', set: { ratePct: String(r) }, sel: r0 === r }; }) });
        g.push({ title: 'Loan tenure', opts: [[null, 'Standard: to age 65, at most ' + (hdbL ? 25 : st.bkind === 'hdb' ? 25 : 30) + ' years']].concat(hdbL ? [[25, '25 years'], [20, '20 years']] : st.bkind === 'hdb' ? [[30, '30 years'], [25, '25 years'], [20, '20 years']] : [[35, '35 years'], [30, '30 years'], [25, '25 years'], [20, '20 years']]).map((x) => { const b = ok ? lend(Object.assign({}, st, { years: x[0] })) : null; return { label: x[1], sub: b ? 'Lends about ' + $r(b.maxLoan) + ' over ' + yrs(b.years) + (x[0] && b.years < x[0] ? ' (to age ' + (b.kind === 'hdb-loan' ? 65 : root.GW_RULES.bankLtv.maturityAge) + ')' : '') + (b.ltv < 0.75 && x[0] ? ' · loan limit ' + pc(b.ltv) : '') : '', set: { years: x[0] === null ? '' : String(x[0]) }, sel: (st.years || null) === x[0] }; }) });
        g.push({ opts: [cust('Another tenure or rate')] });
        if (!hdbL) g.note = 'Banks test what you can borrow at 4% or your rate, whichever is higher, so a lower rate lowers the instalment but not the loan.';
        return g;
      }
      return [];
    }
    root.__f3OpenChip = openChip;
    // V3.4: "Check my own borrowing limit" opens How much can I borrow? with this price carried (the entries are shared in this tab; that page says what this home needs from the loan)
    function goTo(btn) { const f = q('[data-k="' + btn.dataset.go + '"]'); if (!f) return; const pn = f.closest('[data-chp]'); if (pn) openChip(pn.dataset.chp, btn.dataset.go); const d = f.closest('details'); if (d) d.open = true; try { f.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ } f.focus({ preventScroll: true }); }
    // the bar a phone keeps on screen: the main number, and a tap to the full answer
    function setBar(html) { if (!bar) return; bar.hidden = !html; if (html && bar.__h !== html) { bar.innerHTML = html + '<button type="button" class="f3-lnk" data-bar-go>Details</button>'; bar.__h = html; } }
    // the bar steps aside while the answer itself is on screen, so the two never repeat each other
    if (bar && root.IntersectionObserver) { const card = q('.f3-out'); if (card) new root.IntersectionObserver((es) => { es.forEach((e) => bar.classList.toggle('f3-bar-on', !e.isIntersecting)); }, { threshold: [0] }).observe(card); }
    if (bar) bar.addEventListener('click', () => { const t = page === 'pay' ? q('.f3-out') : out; try { t.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { t.scrollIntoView(); } });
    const tile = (k, v, s, cls) => '<div class="f3-t' + (cls ? ' ' + cls : '') + '"><span class="k">' + k + '</span><span class="v">' + v + '</span>' + (s ? '<span class="s">' + s + '</span>' : '') + '</div>';
    const preview = (head, rows, keys) => '<p class="f3-k">' + head + '</p><p class="f3-v f3-dash" aria-hidden="true">$ —</p><ul class="f3-rows">' + rows.map((r) => '<li><span>' + r + '</span><b aria-hidden="true">—</b></li>').join('') + '</ul>' + (keys && keys.length ? '<p class="f3-nh">Add these to see your figures:</p>' + need(keys) : '');
    function done() { if (!completed) { completed = true; track('tool_completed', {}); } }

    // a row of the answer card: what it is (with one quiet line under it) on the left, the figure on the right
    const row = (label, fig, sub, cls) => '<div class="f3-ar' + (cls ? ' ' + cls : '') + '"><div class="f3-al"><span class="f3-an">' + label + '</span>' + (sub ? '<span class="f3-asub">' + sub + '</span>' : '') + '</div><div class="f3-af">' + fig + '</div></div>';
    const KN = { new: 'new launch', ec: 'new EC', completed: 'completed home', resaleec: 'resale EC', hdb: 'HDB resale flat', bto: 'new HDB flat' };
    const isHdb = (st) => st.pkind === 'hdb' || st.pkind === 'bto';
    const costOf = (st, ov) => (isHdb(Object.assign({}, st, ov || {})) ? F.costHdb(Object.assign({}, st, ov || {})) : F.cost(st, ov));
    // V3.7 (Ken): one quiet line beneath a loan estimate, once per card
    const INDIC = '<span class="f3-indic" data-indic>Indicative only. Actual loan approval, rates and tenure vary by bank and borrower profile.</span>';
    const INDIC_HDB = '<span class="f3-indic" data-indic>Indicative only. Actual loan approval, rate and tenure vary by lender and borrower profile.</span>';
    const RN = { SC: 'Singapore Citizen', PR: 'Permanent Resident', FR: 'Foreigner', FTA: 'FTA national' };
    const r100 = (n) => '$' + (Math.round(n / 100) * 100).toLocaleString('en-US');
    // what each chip says: the assumption in use, in a few words
    function paintChips(st, c) {
      const L0 = F.loansOf(st), set = (k, t) => { const el = q('[data-chip-l="' + k + '"]'); if (el && el.textContent !== t) el.textContent = t; };
      if (page === 'borrow') {
        const ages = st.p.slice(0, st.n).map((x) => x.age);
        set('age', ages.every((x) => typeof x === 'number') ? (st.n === 2 ? 'Ages ' + ages.join(' & ') : 'Age ' + ages[0]) : st.n === 2 ? 'Ages 35 & 35' : 'Age 35');
        set('n', st.n === 2 ? 'Two of us' : 'Buying alone');
        set('bkind', st.bkind === 'hdb' ? (st.hdbLoan === 'bank' ? 'HDB flat, bank loan' : 'HDB flat, HDB loan') : st.bkind === 'ec' ? 'New EC' : 'Private home');
        set('loans', L0.total > 0 ? $(L0.total) + '/mo of loans' : 'No other loans');
        set('rate', (st.ratePct !== null ? st.ratePct : (st.bkind === 'hdb' && st.hdbLoan !== 'bank' ? Math.round(root.GW_RULES.hdbLoanRate * 1000) / 10 : 4)) + '% · ' + (st.years ? st.years + ' years' : 'longest tenure'));
      }
      if (page === 'upgrade') set('ures', st.reserve > 0 ? 'Keep funds aside: ' + $s(st.reserve) : 'Keep funds aside: None');
      if (page === 'sell') {
        const sv = st.sale, r = F.sell(st);
        set('stype', { hdb: 'HDB flat', private: 'Private home', ec: 'EC' }[sv.type] || 'HDB flat');
        set('scpf', typeof sv.cpfRefund === 'number' ? 'CPF used ' + $(sv.cpfRefund) + (sv.o55 === 'yes' ? ' · 55+' : '') : 'CPF used: add');
        set('scomm', 'Agent ' + (sv.comm === null ? 2 : sv.comm) + '%');
        set('slegal', 'Legal ' + $(sv.legal === null ? (r.state === 'ok' ? r.costs.legal : 3000) : sv.legal));
        set('sssd', sv.bought ? (r.state === 'ok' && r.costs.ssd > 0 ? 'SSD ' + pc(r.ssd.rate) : 'No SSD') : sv.held === true ? 'No SSD' : 'SSD: add dates');
      }
      if (page === 'pay') {
        set('pkind', { new: 'New launch', ec: 'New EC', completed: 'Completed private', resaleec: 'Resale EC', hdb: 'HDB resale flat', bto: 'New HDB flat (BTO)' }[st.pkind] || 'New launch');
        set('who', (st.n === 2 ? 'Two buyers' : RN[st.p[0].res] || 'Singapore Citizen') + ', ' + (st.homes === 0 ? 'first home' : st.homes === 1 ? 'own a home' : 'own 2+ homes') + (L0.total > 0 ? ', loans' : ''));
        set('loan', c && c.state === 'ok' && c.hdb ? (c.typed === 0 ? 'No loan' : (c.lender === 'hdb' ? 'HDB loan' : 'Bank loan') + (c.typed !== null ? ' ' + $s(c.loan) : '')) : c && c.state === 'ok' ? (c.typed !== null ? 'Loan ' + $s(c.loan) : pc(c.ltv) + ' loan') : (st.pkind === 'hdb' || st.pkind === 'bto' ? (st.hdbLoan === 'bank' ? 'Bank loan' : 'HDB loan') : '75% loan'));
        set('rate', (c && c.state === 'ok' ? c.ratePct : st.ratePct !== null ? st.ratePct : 4) + '% · ' + (c && c.state === 'ok' ? c.years : (st.years || 30)) + ' years');
        set('cpf', st.cpf > 0 ? 'CPF ' + $s(st.cpf) : 'No CPF');
      }
    }
    // the judgement on the borrowing card: is income or age the limit, what stretching the tenure past 65 would do (MAS: the lower loan limit and more cash), and the lever
    const fmtP = (P) => (P >= 1e6 ? '$' + (P / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : $r(P));
    function judgeBorrow(st, b, step) {
      const lever = step > 999 ? ' Each extra $1,000 a month, including a co-borrower’s, adds about ' + $(step) + '.' : '';
      if (!b.ageCut) return { text: 'Income is the limit here, not age.' + lever, alt: null };
      if (b.kind === 'hdb-loan') return { text: 'Age is the limit here: an HDB loan ends by 65, so it runs only ' + yrs(b.years) + '.' + lever, alt: null };
      const s2 = F.borrow(Object.assign({}, st, { years: root.GW_RULES.bankLtv.maturityAge - Math.round(b.age) }), { assumeAge: true });
      if (!(s2.state === 'ok' && s2.maxLoan > b.maxLoan + 999)) return { text: 'Age is the limit here: a loan ending by 65 runs only ' + yrs(b.years) + '.' + lever, alt: null };
      const P2 = Math.floor(s2.maxLoan / s2.ltv / 100000) * 100000;
      const alt = { loan: s2.maxLoan, years: s2.years, endAge: Math.round(b.age + s2.years), ltv: s2.ltv, minCash: s2.minCash, price: P2, down: P2 * (1 - s2.ltv), cashMin: P2 * s2.minCash };
      return { text: 'Age is the limit here: a loan ending by 65 runs only ' + yrs(b.years) + '. Stretched to age ' + alt.endAge + ', it could be about ' + $r(alt.loan) + ', but banks then lend only ' + pc(alt.ltv) + ' of the price and at least ' + pc(alt.minCash) + ' must be cash: on a ' + fmtP(P2) + ' home, ' + $(alt.down) + ' upfront, at least ' + $(alt.cashMin) + ' of it in cash.' + lever, alt: alt };
    }
    /* ---- the one-page summary ("Save as PDF"): filled from the result object that drew the answer card; nothing recalculated, nothing read back from the page ---- */
    let view = null;
    function pdfBtn(on) { $$('[data-save-pdf]').forEach((x) => { x.hidden = !on; }); }
    const SG = (str) => String(str).replace(/\$/g, 'S$');                       // the card's own formatting, with the Singapore dollar sign of the sheet
    const plain = (h) => String(h).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const checkedOn = () => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((root.GW_RULES && root.GW_RULES.checked) || ''); return m ? +m[3] + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : '9 Oct 2026'; };
    // every assumption chip, in words (the same words the chips show)
    function basisWords(st, c) {
      const L0 = F.loansOf(st);
      if (page === 'borrow') {
        const ages = st.p.slice(0, st.n).map((x) => x.age), known = ages.every((x) => typeof x === 'number');
        return [(st.n === 2 ? 'On ' : 'On ') + SG($(view.b.income)) + ' a month' + (st.n === 2 ? ' between two of you' : ''), known ? (st.n === 2 ? 'ages ' + ages.join(' and ') : 'age ' + ages[0]) : 'age 35 (assumed)', st.n === 2 ? 'buying with a co-borrower' : 'buying alone',
          st.bkind === 'hdb' ? (st.hdbLoan === 'bank' ? 'HDB flat with a bank loan' : 'HDB flat with an HDB loan') : st.bkind === 'ec' ? 'new EC' : 'private home', L0.total > 0 ? SG($(L0.total)) + ' a month of other loans' : 'no other loans',
          view.b.ratePct + '% a year', st.years ? st.years + ' years' : 'longest tenure'];
      }
      return ['For a ' + SG($(c.price)) + ' ' + KN[st.pkind], (st.n === 2 ? 'two buyers' : RN[st.p[0].res] || 'Singapore Citizen') + ', ' + (st.homes === 0 ? 'first home' : st.homes === 1 ? 'owns a home' : 'owns two or more homes') + (L0.total > 0 ? ', ' + SG($(L0.total)) + ' a month of loans' : ''),
        (c.typed !== null ? SG($(c.loan)) + ' bank loan' : pc(c.ltv) + ' bank loan'), c.ratePct + '% a year', yrs(c.years), st.cpf > 0 ? SG($(st.cpf)) + ' CPF' : 'no CPF entered', st.otp && !st.noDate ? 'option ' + day(st.otp) : 'no option date yet'];
    }
    const SHORT_S = { otp: 'Booking fee (option)', snp: 'Signing the S&P', bsd: 'Buyer’s Stamp Duty', foundation: 'Foundation', frame: 'Concrete framework', walls: 'Partition walls', roof: 'Roofing and ceiling', fittings: 'Doors, windows, M&E', roads: 'Car park, roads and drains', top: 'TOP', csc: 'CSC', option: 'Option fee', exercise: 'Exercising the option', completion: 'Completion' };
    const GROUP_OF = (id) => (/^(otp|snp|bsd|absd|option|exercise)$/.test(id) ? 'up' : /^(top|csc|completion)$/.test(id) ? 'end' : 'build');
    function sheetCost() {
      const v = view, c = v.c, st = v.st, s = v.s, inc = v.inc;
      const duty = (c.absd > 0 ? 'and ' + SG($(c.bsd)) + ' BSD + ' + SG($(c.absd)) + ' ABSD ' + Math.round(c.absdRate * 100) + '%' : 'and ' + SG($(c.duty)) + ' stamp duty') + ', usually cash first; CPF may reimburse eligible duty';
      const incOk = inc && inc.state === 'ok';
      const pl = v.pl, figures = [
        { key: 'cash', label: 'Cash you’ll need', value: SG($(c.cash)), sub: (c.loan > 0 ? 'After the ' + SG($(c.loan)) + ' bank loan, ' : 'With no bank loan, ') + (c.cpfUsed > 0 ? 'with ' + SG($(c.cpfUsed)) + ' CPF' : 'with no CPF') + '. Includes the ' + SG($(c.cashMin)) + ' minimum cash down payment (MAS rule) ' + duty },
        { key: 'monthly', label: 'Monthly instalment', value: SG($(c.monthly)), sub: 'On a ' + SG($(c.loan)) + ' loan · ' + yrs(c.years) + ' at ' + c.ratePct + '%' },
        { key: 'income', label: 'Income needed', value: incOk ? '≈ ' + SG(r100(inc.income)) : '—', sub: incOk ? 'Household, per month · ' + plain(v.incBasis).replace(/^Before CPF/, 'before CPF') : 'More than an income can support at this age and tenure' }];
      if (v.bucUp) { figures[0] = { key: 'upfront', label: 'Needed upfront', value: SG($(pl.upfront)), sub: 'Booking fee, the S&P payment and ' + SG($(c.duty)) + ' stamp duty, ' + (pl.dated ? pl.dutyBy.replace(/^By/, 'by') : 'within about ' + pl.upWeeks + ' weeks') + '. Then ' + SG($(pl.later)) + ' during construction; ' + SG($(pl.total)) + ' from you in all (cash ' + SG($(c.cash)) + ', CPF ' + SG($(c.cpfUsed)) + ').' }; figures[1].sub += ', once fully drawn'; }
      const receipt = [{ label: 'Cash, at least', sub: pc(c.minCash) + ' of the price. MAS rule.', value: SG($(c.cashMin)) }]
        .concat(c.cov > 0 ? [{ label: 'Above the valuation', sub: 'The bank lends on the lower of price and valuation.', value: SG($(c.cov)) }] : [])
        .concat([{ label: 'Cash or CPF', sub: pc(c.flex / c.price) + ' of the price', value: SG($(c.flex)) }, { label: 'Buyer’s Stamp Duty', sub: 'Usually cash first; CPF may reimburse eligible duty', value: SG($(c.bsd)) }])
        .concat(c.absd > 0 ? [{ label: 'ABSD ' + Math.round(c.absdRate * 100) + '%', sub: 'Usually paid in cash first', value: SG($(c.absd)) }] : [])
        .concat([{ key: 'fromyou', label: 'From you, cash and CPF', sub: 'Cash ' + SG($(c.cash)) + ' + CPF ' + SG($(c.cpfUsed)), value: SG($(v.up)), cls: 'tot' }, { key: 'loan', label: 'Bank loan', sub: pc(c.loan / c.price) + ' of the price', value: SG($(c.loan)) }]);
      const monthly = [{ label: 'Instalment at ' + c.ratePct + '%, ' + yrs(c.years), value: SG($(c.monthly)) }].concat(incOk ? [{ label: 'Income needed at the ' + (inc.rule === 'msr' ? '30%' : '55%') + ' limit', sub: plain(v.incBasis), value: '≈ ' + SG(r100(inc.income)) }] : []);
      // the schedule: dates when an option date was entered, otherwise timings from the option, with the estimate labels
      const ev = (s && s.ok ? s.events : []).filter((e) => e.type === 'pay'), d0 = ev.length ? Date.parse(ev[0].date) : 0, dated = !v.und;
      const snp = ev.filter((e) => e.id === 'snp' || e.id === 'exercise')[0];
      let firstBuild = true;
      const when = (e) => {
        const g = GROUP_OF(e.id), days = Math.round((Date.parse(e.date) - d0) / 864e5);
        if (dated) { if (g === 'build') { const t = firstBuild ? 'From ' + day(e.date) : ''; firstBuild = false; return t; } return (e.confidence === 'estimate' || e.confidence === 'illustrative' ? MONTHS[+e.date.slice(5, 7) - 1] + ' ' + e.date.slice(0, 4) + ', est.' : day(e.date)); }
        if (e.id === 'otp' || e.id === 'option') return 'On the option';
        if (e.id === 'snp' || e.id === 'exercise') return 'Within ' + Math.round(days / 7) + ' weeks';
        if ((e.id === 'bsd' || e.id === 'absd') && snp) return Math.round((Date.parse(e.date) - Date.parse(snp.date)) / 864e5) + ' days after ' + (snp.id === 'snp' ? 'S&P' : 'exercise');
        if (g === 'build') { const t = firstBuild ? 'From ' + Math.round(days / 7) + ' weeks' : ''; firstBuild = false; return t; }
        return '≈ ' + Math.round(days / 30.44) + ' mths, est.';
      };
      const groups0 = [['up', 'Upfront'], ['build', 'During construction · as the developer calls'], ['end', F.engineKind(st.pkind) === 'completed' ? 'At completion' : 'Completion']].map((g) => ({ title: g[1], rows: ev.filter((e) => GROUP_OF(e.id) === g[0]).map((e) => ({ label: (SHORT_S[e.id] || e.label) + (e.pct ? ' ' + Math.round(e.pct * 100) + '%' : ''), muted: e.provisional ? 'provisional' : '', when: when(e), value: SG($(e.amount)) })) })).filter((g) => g.rows.length);
      const groups = pl ? pl.groups.map((gr) => ({ title: gr.title, rows: gr.rows.map((r) => ({ label: r.label + (r.pct ? ' ' + r.pct : ''), when: r.short || '', value: SG($(r.amt)) })).concat(gr.sub ? [{ label: gr.sub.label, when: '', value: SG($(gr.sub.amt)), cls: 'tot' }] : []) }))
        .concat([{ title: '', rows: [{ label: 'From you, in all', when: '', value: SG($(pl.total)), cls: 'tot' }] }])
        .concat(pl.bank > 0.5 ? [{ title: 'Bank loan', rows: [{ label: 'The bank pays', when: pl.buc ? 'Stage by stage' : 'At completion', value: SG($(pl.bank)) }, { label: 'Then each month', when: pl.buc ? 'Once fully drawn' : 'After completion', value: SG($(c.monthly)) }] }] : []) : groups0;
      const note = F.engineKind(st.pkind) === 'completed' ? 'Option terms can differ; your option sets the actual amounts and dates.' + (dated ? '' : ' Add an option date on Groundwork for exact dates.') : 'Construction stages fall due as building progresses; the developer’s notice sets each date.' + (dated ? '' : ' Add an option date on Groundwork for exact dates.');
      const whoPays = pl ? ' The ' + (pl.buc ? 'booking' : 'option') + ' fee is paid in cash; the rest of your share can be cash or CPF; stamp duty is usually cash first, and CPF may reimburse eligible duty.' : ' You pay the first ' + SG($(c.down)) + ' (your down payment) and the stamp duty; the bank pays the remaining ' + SG($(c.loan)) + ' as payments fall due.';
      return { tool: 'COST', checked: checkedOn(), question: 'What will this home cost me?', basis: basisWords(st, c), figures: figures, judge: SG(v.judge),
        left: [{ title: 'Where the ' + SG($(v.up)) + ' goes', rows: receipt, note: 'Legal and valuation fees are not included.' }, { title: 'Monthly', rows: monthly }],
        right: [{ title: 'When you pay it', groups: groups, note: note + whoPays }] };
    }
    function sheetBorrow() {
      const v = view, b = v.b, st = v.st, ck = v.ck, a = v.a;
      const figures = a ? [
        { key: 'budget', label: 'Your budget, about', value: SG($r(a.budget)), sub: 'A ' + (st.akind === 'completed' ? 'completed' : 'new-launch') + ' private home, stamp duty included' },
        { key: 'lend', label: v.lendL, value: SG($r(b.maxLoan)), sub: 'Over ' + yrs(b.years) + ', ending at age ' + v.endAge + (b.ageAssumed ? ' (age 35 assumed)' : '') },
        { key: 'monthly', label: 'Monthly instalment', value: SG($(a.top.monthly)), sub: 'On a ' + SG($r(a.top.loan)) + ' loan · ' + yrs(a.years) + ' at ' + a.ratePct + '%' }] : [
        { key: 'lend', label: v.lendL || 'The bank may lend about', value: SG($r(b.maxLoan)), sub: 'Over ' + yrs(b.years) + ', ending at age ' + v.endAge + (b.ageAssumed ? ' (age 35 assumed)' : '') },
        { key: 'monthly', label: 'Monthly instalment', value: SG($(b.monthly)), sub: SG(v.instSub) },
        { key: 'price', label: 'Home price this loan supports', value: '≈ ' + SG(v.pTxt), sub: 'What the loan supports at ' + pc(b.ltv) + ', before your savings' + (v.upfront !== null ? ' — about ' + SG($r(v.upfront)) + ' upfront' : '') }];
      const how = [{ label: 'Income, before CPF', sub: b.counted < b.income - 0.5 ? 'Salary and any bonus, commission or rent, a month' : 'A month', value: SG($(b.income)) }]
        .concat(b.counted < b.income - 0.5 ? [{ label: 'Income the bank counts', sub: 'Bonus, commission and rent at 70%', value: SG($(b.counted)) }] : [])
        .concat([{ label: v.msr ? 'The limit: 30% of income' : 'The limit: 55% of income', sub: v.msr ? 'For home loans (MSR)' + (b.kind === 'hdb-loan' ? '' : ', and 55% for all loans (TDSR)') : 'For all loan repayments (TDSR)', value: SG($(b.counted * b.share)) + '/mo' }])
        .concat(b.debts > 0 ? [{ label: 'Loans you already repay', sub: 'They lower it by about ' + SG($r(b.debtsCut)), value: '−' + SG($(b.debts)) + '/mo' }] : [])
        .concat([{ label: 'Stress rate', sub: b.kind === 'hdb-loan' ? 'HDB’s own rate' : 'Banks test at 4% or your rate, whichever is higher', value: v.test + '%' },
          { label: 'Tenure', sub: b.ageCut ? 'Ends at age ' + v.endAge + ': ' + (b.kind === 'hdb-loan' ? 'HDB loans end by 65' : 'the standard loan limit needs the loan to end by 65') : 'The longest standard tenure, ending at age ' + v.endAge, value: yrs(b.years) },
          { key: 'lend2', label: v.lendL || 'The bank may lend about', value: SG($r(b.maxLoan)), cls: 'tot' }]);
      const right = [];
      if (a) { const t = a.top; right.push({ title: 'Your budget with your cash and CPF', rows: [{ label: 'Home price', sub: { funds: 'Your cash and CPF are the limit', income: 'The loan is the limit', payments: 'Payment timing is the limit', choice: 'Your chosen loan is the limit' }[a.limitedBy] || '', value: SG($r(a.budget)) },
        { label: 'Bank loan', value: SG($r(t.loan)) }, { label: 'Cash you’ll need', sub: 'Stamp duty included' + (t.absd > 0 ? ', with ' + SG($(t.absd)) + ' ABSD' : ''), value: SG($(t.cashNeed)) }, { label: 'CPF you’d use', value: SG($(t.cpfUsed)) },
        { label: 'Buyer’s Stamp Duty' + (t.absd > 0 ? ' and ABSD' : ''), sub: 'Usually cash first; CPF may reimburse eligible duty', value: SG($(t.duty)) }].concat(a.saleCounted ? [{ label: 'From your home’s sale', sub: 'Cash and CPF back', value: SG($(a.sale.cash + a.sale.cpf)) }] : []),
        note: 'Your cash ' + SG($(st.cash || 0)) + ' and CPF ' + SG($(st.cpf || 0)) + ' as entered. Legal and valuation fees are not included.' }); }
      else if (ck && ck.state === 'ok') right.push({ title: 'Home price this loan supports', rows: [{ label: 'Home price', sub: 'The loan as ' + pc(b.ltv) + ' of the price', value: '≈ ' + SG(v.pTxt) }, { label: 'Bank loan', value: SG($(ck.loan)) },
        { label: 'Cash, at least', sub: pc(ck.minCash) + ' of the price. MAS rule.', value: SG($(ck.cashMin)) }, { label: 'Cash or CPF', value: SG($(ck.flex)) }, { label: 'Buyer’s Stamp Duty', sub: 'Usually cash first; CPF may reimburse eligible duty', value: SG($(ck.bsd)) },
        { label: 'Upfront, cash and CPF', value: SG($(v.upfront)), cls: 'tot' }], note: 'What the loan supports, before your savings: a loan-based estimate, not your full budget. Stamp duty as a Singapore Citizen buying a first home.' });
      if (v.alt) { const a = v.alt; right.push({ title: 'If the loan ran to age ' + a.endAge, rows: [{ label: 'The bank may lend about', sub: 'Over ' + yrs(a.years), value: SG($r(a.loan)) }, { label: 'Loan limit', sub: 'Of the price, the lower limit past age 65', value: pc(a.ltv) }, { label: 'Cash, at least', sub: 'Of the price', value: pc(a.minCash) },
        { label: 'On a ' + SG(fmtP(a.price)) + ' home', sub: 'Upfront, at least ' + SG($(a.cashMin)) + ' of it in cash', value: SG($(a.down)) }], note: 'A longer loan lowers the share banks lend, so more of the price is paid upfront.' }); }
      return { tool: 'BORROW', checked: checkedOn(), question: 'How much can I borrow?', basis: basisWords(st, null).concat(a ? [SG($(st.cash || 0)) + ' cash', SG($(st.cpf || 0)) + ' CPF'] : []), figures: figures, judge: SG((v.elig ? v.elig + ' ' : '') + v.judge), left: [{ title: 'How the loan is worked out', rows: how, note: 'An estimate of what your income supports, not a bank approval.' }], right: right };
    }
    function sheetSell() {
      const v = view, r = v.r, k = v.k, st = v.st, sv = st.sale;
      const figures = [{ key: 'total', label: 'You get back', value: SG($(r.total)), sub: 'After the loan and ' + SG($(k.selling)) + ' selling costs' + (k.ssd ? ', and ' + SG($(k.ssd)) + ' SSD' : '') },
        { key: 'cash', label: 'Cash in hand', value: r.cpfIn ? SG($(r.cash)) : '—', sub: r.cpfIn ? 'What you can spend freely' : 'Add the CPF used to split the total' },
        { key: 'cpf', label: 'Back into your CPF', value: r.cpfIn ? SG($(r.cpf)) : '—', sub: r.cpfIn ? (r.o55 ? 'Usable for the next home: ' + SG($(r.cpfUsable)) + (r.cpfProvisional ? ' (provisional: an owner is 55 or older)' : '') : 'Usable for the next home, not for the ' + pc(minCashShare()) + ' cash part') : 'The CPF used, with accrued interest' }];
      const rows = [{ label: 'Selling price', value: SG($(r.price)) }, { label: 'Loan repaid', value: '−' + SG($(r.loan)) },
        { label: 'Agent’s fee', sub: r.costs.commissionPct + '% plus 9% GST' + (r.defaults.commission ? ', the usual fee' : ''), value: '−' + SG($(k.agent)) }, { label: 'Legal fees', sub: r.defaults.legal ? 'A typical figure' : 'As entered', value: '−' + SG($(k.legal)) }]
        .concat(k.ssd ? [{ label: 'Seller’s Stamp Duty', sub: pc(r.ssd.rate) + ' of the price', value: '−' + SG($(k.ssd)) }] : [])
        .concat([{ key: 'total2', label: 'You get back', value: SG($(r.total)), cls: 'tot' }])
        .concat(r.cpfIn ? [{ label: 'CPF refunded', sub: 'The CPF used, with accrued interest', value: '−' + SG($(r.cpf)) }, { label: 'Cash in hand', value: SG($(r.cash)), cls: 'tot' }] : []);
      if (r.penalty) rows.splice(2, 0, { label: 'Early repayment penalty', value: '−' + SG($(r.penalty)) });
      const right = [{ title: 'For your next home', rows: r.cpfIn ? [{ label: 'Cash in hand', sub: 'Pays the ' + pc(minCashShare()) + ' cash part a bank loan needs', value: SG($(r.cash)) }, { label: r.o55 ? 'CPF usable again' : 'CPF back', sub: r.o55 ? (r.cpfProvisional ? 'Provisional: the 55+ owners’ refund counts only once CPF’s figure is added' : 'As entered from CPF') : 'For the rest of the down payment and the instalments', value: SG($(r.o55 ? r.cpfUsable : r.cpf)) }] : [{ label: 'Total', sub: 'Split into cash and CPF once the CPF used is entered', value: SG($(r.total)) }],
        note: 'Paid out at completion through the lawyers: the loan first, then the CPF refund to each owner’s CPF account, then the cash. CPF Board decides the actual refund; owners aged 55 or older have theirs go first to their Retirement Account.' }];
      if (v.alerts && v.alerts.length) right.push({ title: 'Worth checking', rows: v.alerts.map((x) => ({ label: SG(x) })) });
      const basis = ['Selling a ' + SG($(r.price)) + ' ' + ({ hdb: 'HDB flat', private: 'private home', ec: 'EC' }[r.type]), SG($(r.loan)) + ' loan still owing' + (r.penalty ? ' plus ' + SG($(r.penalty)) + ' penalty' : ''), r.o55 ? 'an owner is 55 or older' : 'no owner 55 or older', 'agent ' + r.costs.commissionPct + '% plus GST', 'legal fees ' + SG($(k.legal)), r.cpfIn ? 'CPF used ' + SG($(r.cpf)) + ' with interest' : 'CPF used not entered']
        .concat(r.type !== 'hdb' ? [sv.bought ? 'bought ' + day(sv.bought) + (sv.sold ? ', selling ' + day(sv.sold) : '') : sv.held === true ? 'owned long enough for no SSD' : 'no purchase date, so no SSD counted'] : []);
      return { tool: 'SELL', checked: checkedOn(), question: 'What will I get from selling?', basis: basis, figures: figures, judge: SG(v.judge), left: [{ title: 'How it is worked out', rows: rows }], right: right };
    }
    function sheetUpgrade() {
      const v = view, a = v.a, t = a.top, sv = v.sv, bw = v.bw, hx = v.hx;
      const figures = [{ key: 'budget', label: 'Buy up to about', value: SG(v.bTxt), sub: 'Sell first, then buy · ' + (v.u.akind === 'completed' ? 'completed' : 'new-launch') + ' private home' },
        { key: 'upfront', label: 'Upfront it needs', value: SG($r(v.upfront)), sub: 'From your ' + SG($(sv.total)) + ' proceeds' + (v.saved ? ' and savings' : '') },
        { key: 'reserve', label: 'Left in reserve', value: SG($r(v.reserve)), sub: 'After the purchase' }];
      const steps = [{ label: '1 · What is my flat worth?', sub: hx ? (flatName(hx.flatType) + ', Blk ' + hx.block + ' ' + titleCase(hx.street) + ': ' + hx.n + ' recent sales, ' + SG(kTxt(hx.lo)) + ' – ' + SG(kTxt(hx.hi))) : 'Your estimate', value: SG($(sv.price)) },
        { label: '2 · What will I get from selling?', sub: SG($(sv.cash)) + ' cash + ' + SG($(sv.cpf)) + ' CPF' + (sv.o55 ? ' (' + SG($(sv.cpfUsable)) + ' usable' + (sv.cpfProvisional ? ', provisional: an owner is 55 or older' : '') + ')' : '') + ', after the ' + SG($(sv.loan)) + ' loan' + (sv.penalty ? ', ' + SG($(sv.penalty)) + ' penalty' : '') + ' and ' + SG($(sellCosts(sv.r).selling)) + ' of costs', value: SG($(sv.total)) },
        { label: '3 · How much can I borrow?', sub: 'On ' + SG($(bw.income)) + ' a month, over ' + yrs(bw.years), value: SG($r(bw.maxLoan)) },
        { key: 'budget2', label: '4 · So what can I buy?', value: SG(v.bTxt), cls: 'tot' }];
      const right = [{ title: 'At ' + SG(v.bTxt), rows: [{ label: 'Bank loan', value: SG($r(t.loan)) }, { label: 'Cash', sub: 'Stamp duty included' + (t.absd > 0 ? ', with ABSD' : ''), value: SG($(t.cashNeed)) }, { label: 'CPF', value: SG($(t.cpfUsed)) },
        { label: 'Upfront, cash and CPF', value: SG($r(v.upfront)), cls: 'tot' }, { label: 'Monthly instalment', sub: yrs(a.years) + ' at ' + a.ratePct + '%', value: SG($(t.monthly)) }],
        note: 'An estimate, not a bank approval. KPT assumptions: the flat is sold first, then the private home bought; ' + (v.u.reserveKept > 0 ? SG($(v.u.reserveKept)) + ' kept aside, as chosen' : 'no funds kept aside') + '. Legal and valuation fees on the purchase, renovation and moving are not included.' }];
      const basis = ['Selling an HDB flat at ' + SG($(sv.price)), SG($(sv.loan)) + ' loan owing', 'CPF used ' + SG($(sv.cpf)), 'on ' + SG($(bw.income)) + ' a month', v.st.n === 2 ? 'two buyers' : 'buying alone', 'sell first, then buy', (v.u.akind === 'completed' ? 'completed' : 'new-launch') + ' private home'];
      return { tool: 'UPGRADE', checked: checkedOn(), question: 'Upgrade from HDB', basis: basis, figures: figures, judge: SG(v.judge), left: [{ title: 'The four steps', rows: steps }], right: right };
    }
    function sheetNow() { if (!view) return null; return view.tool === 'costhdb' ? sheetCostHdb() : view.tool === 'cost' ? sheetCost() : view.tool === 'borrow' ? sheetBorrow() : view.tool === 'sell' ? sheetSell() : view.tool === 'upgrade' ? sheetUpgrade() : null; }
    root.__f3Sheet = sheetNow;
    if (root.GW_SHEET && (page === 'pay' || page === 'borrow' || page === 'sell' || page === 'upgrade')) {
      root.GW_SHEET.wire(sheetNow);
      box.addEventListener('click', (e) => { if (e.target.closest('[data-save-pdf]')) root.GW_SHEET.print(() => track('pdf_saved', {})); });
    }
    /* ---- How much can I borrow? ---- */
    let lastB = null, lastBudget = null;
    function paintBorrow(st) {
      const b = F.borrow(st, { assumeAge: true }); lastB = b; paintChips(st, null); paintPS(st, b);
      const why = q('[data-why]'), toc = q('[data-to-cost]'), quietB = () => { if (why) why.hidden = true; if (toc) toc.hidden = true; { const th = q('[data-to-homes]'); if (th) th.hidden = true; } lastBudget = null; setBar(''); view = null; pdfBtn(false); };
      { const ni = q('[data-inc-need]'); if (ni) { const two = st.n === 2 && b.state === 'need' && (b.need || []).indexOf('p.1.fixed') >= 0; ni.hidden = !two; ni.textContent = two ? (st.p[0].fixed > 0 ? 'Add the second person’s income to see what you can borrow together.' : 'Add both incomes to see what you can borrow together.') : ''; } }
      if (b.state === 'need') { out.innerHTML = '<p class="f3-eb">' + (st.n === 2 && (b.need || []).indexOf('p.1.fixed') >= 0 && (b.need || []).indexOf('p.0.fixed') < 0 ? 'Add the second person’s income' : st.n === 2 ? 'Type both incomes to begin' : 'Type your income to begin') + '</p>' + row('The bank may lend about', '<span class="f3-dash">—</span>', 'Over the longest tenure your age allows') + row('Monthly instalment', '<span class="f3-dash">—</span>', 'The most banks allow') + row('Home price this loan supports', '<span class="f3-dash">—</span>', 'A loan-based estimate, not your full budget'); quietB(); return; }
      if (b.state === 'invalid') { out.innerHTML = '<p class="f3-eb">Check the figures</p><p class="f3-note">' + esc((b.errors[0] || {}).text || 'Check the figures marked.') + '</p>'; quietB(); return; }
      if (b.state === 'zero') { out.innerHTML = '<p class="f3-eb">No income entered</p>' + row('The bank may lend about', '$0', 'There is no income to lend against. Add a salary, including a co-borrower’s.'); quietB(); return; }
      if (b.state === 'notenure') { out.innerHTML = '<p class="f3-eb">At this age</p><p class="f3-note">' + (b.kind === 'hdb-loan' ? 'No HDB loan tenure fits: HDB loans end by age 65.' : 'No bank loan tenure fits: banks usually end a loan by age ' + root.GW_RULES.bankLtv.maturityAge + '.') + '</p>'; quietB(); return; }
      done();
      const msr = b.binding === 'msr', cap = msr ? '30%' : '55%', test = Math.round(b.testRatePct * 100) / 100, endAge = Math.round(b.age + b.years);
      const price = b.maxLoan / b.ltv, pRound = Math.floor(price / 10000) * 10000, pTxt = pRound >= 1e6 ? '$' + (pRound / 1e6).toFixed(2).replace(/0$/, '') + 'M' : $r(pRound);
      const ck = F.cost({ n: 1, p: [{}], loans: [], pkind: b.kind === 'ec' ? 'ec' : 'completed', price: pRound, homes: 0, ratePct: b.ratePct, years: b.years, loanAmt: Math.min(b.maxLoan, pRound * b.ltv) });
      const upfront = ck.state === 'ok' ? pRound - Math.min(b.maxLoan, pRound * b.ltv) + ck.bsd : null;
      const instSub = (b.ratePct + 0.001 >= test ? cap + ' of income, the most ' + (b.kind === 'hdb-loan' ? 'HDB' : 'banks') + ' allow' + (msr ? ' for home loans' : '') : 'At ' + b.ratePct + '%. Banks test the loan at ' + test + '%, where it takes ' + cap + ' of income') + (b.debts > 0 ? ', after your ' + $(b.debts) + ' of loans' : '');
      const more = F.borrow(Object.assign({}, st, { p: st.p.map((x, k) => (k === 0 ? Object.assign({}, x, { fixed: (x.fixed || 0) + 1000 }) : x)) }), { assumeAge: true });
      const step = more && more.state === 'ok' ? Math.round((more.maxLoan - b.maxLoan) / 1000) * 1000 : 0;
      const jb = judgeBorrow(st, b, step);
      // V3.4: the cash and CPF row turns the loan into a budget (private homes; GW_FIN3.afford, the engine "What can I afford?" used), with the same age assumption as the loan
      const saleIn = st.homes >= 1 && st.plan === 'sell' && st.sale && st.sale.price > 0;   // a sale handed over from What will I get from selling? counts as funds too
      const funds = st.bkind === 'private' && (st.cash !== null || st.cpf !== null || saleIn);
      const cr = q('[data-cashrow]'), cp = q('[data-cpf2]'); let a = null;
      { const cs = q('[data-cash-sum]'); if (cs) cs.textContent = st.bkind === 'private' ? 'Add my cash and CPF' : 'Add my cash and CPF: private homes only'; }
      if (funds) { const A0 = Math.max(21, root.GW_RULES.bankLtv.endAge - root.GW_RULES.bankLtv.standardTenure.private); a = F.afford(Object.assign({}, st, { price: null, cash: st.cash || 0, cpf: st.cpf || 0, p: st.p.map((x, k) => (k < st.n && typeof x.age !== 'number' ? Object.assign({}, x, { age: A0 }) : x)) })); }
      if (cp) cp.hidden = !(a && (a.state === 'ask-cpf' || (a.r && a.r.facts && a.r.facts.cpf && a.r.facts.cpf.applies)));
      { const ds = q('[data-dutywho-sum]'); if (ds) ds.textContent = 'Stamp duty as ' + (st.n === 2 ? 'two buyers' : (({ SC: 'a Singapore Citizen', PR: 'a Permanent Resident', FR: 'a foreigner', FTA: 'a national of a free trade agreement country' })[st.p[0].res] || 'a Singapore Citizen')) + (st.homes >= 1 ? (st.plan === 'sell' ? ', selling a home first' : ', owning a home') : ', buying a first home') + ' · Change'; }
      // HDB loan eligibility (as the HDB and EC loan limit page said it): the loan is then what the income would support if eligible
      const elig = b.elig === 'age' ? 'Singles must be ' + (root.GW_RULES.hdbSingleMinAge || 35) + ' or older to buy a flat with an HDB loan under the Single Singapore Citizen scheme, and the age entered is ' + b.youngest + '. Other schemes may apply: confirm with an HFE letter.'
        : b.elig === 'ceiling' ? 'Household income of ' + $(b.income) + ' a month is above HDB’s loan ceiling of ' + $(b.ceiling) + ' for ' + ({ family: 'families', extended: 'extended families', single: 'singles' }[b.household] || 'your household') + '. You may need a bank loan instead.' : '';
      const lendL = b.kind === 'hdb-loan' ? (elig ? 'HDB could lend, if eligible' : 'HDB may lend about') : 'The bank may lend about';
      const lendRow = (cls) => row(lendL, '<span data-answer' + (a && a.state === 'ok' ? '' : '') + ' data-cap>' + $r(b.maxLoan) + '</span>', 'Over ' + yrs(b.years) + ', ending at age ' + endAge + (b.ageAssumed ? ' (age 35 assumed)' : '') + (st.years && b.years < st.years ? '. You chose ' + yrs(st.years) + '; ' + (b.kind === 'hdb-loan' ? 'HDB loans end by 65' : 'most banks end a loan by ' + root.GW_RULES.bankLtv.maturityAge) : '') + (st.years && b.ltv < 0.75 && b.kind === 'private' ? '. Loan limit ' + pc(b.ltv) + ' of the price at this tenure' : '') + INDIC, cls);
      // a price brought from What will this home cost me?: what that home needs from the loan
      const askP = st.price > 0 && b.kind !== 'hdb-loan' ? F.priceLoan(b, st.price) : null;
      const bNote = brought && brought.k === 'price' && String(raw.price || '').replace(/\D/g, '') === String(brought.v).replace(/\D/g, '') ? '<span data-brought>' + brought.text + '</span> ' : '';
      const priceRow = askP ? row('For the ' + $(askP.price) + ' home', $(askP.limit), bNote + (askP.limit > b.maxLoan + 999 ? 'The loan it allows; ' + $r(askP.limit - b.maxLoan) + ' more than you may borrow' : 'The loan it allows, within what you may borrow'), 'f3-arp') : '';
      let budgetJudge = '';
      if (a && a.state === 'ok') {
        const t = a.top, more10 = F.afford(Object.assign({}, st, { price: null, cpf: st.cpf || 0, cash: (st.cash || 0) + 10000, p: st.p.map((x, k) => (k < st.n && typeof x.age !== 'number' ? Object.assign({}, x, { age: 35 }) : x)) }));
        const d10 = more10 && more10.state === 'ok' ? Math.round((more10.budget - a.budget) / 1000) * 1000 : 0;
        budgetJudge = a.limitedBy === 'funds' ? 'Your cash and CPF are the limit here, not the loan: the loan alone would support about ' + pTxt + '.' + (d10 > 999 ? ' Each extra $10,000 of cash adds about ' + $(d10) + ' to the budget.' : '')
          : a.limitedBy === 'income' ? 'The loan is the limit here, not your cash and CPF.' + (step > 999 ? ' Each extra $1,000 a month of income adds about ' + $(step) + ' to the loan.' : '')
          : a.limitedBy === 'payments' ? 'The timing of the payments is the limit here: your cash and CPF must cover each payment when it is due.' : 'The loan amount you chose is the limit here.';
        out.innerHTML = '<p class="f3-eb">On ' + $(b.income) + ' a month' + (b.joint ? ' between you' : '') + ', with your cash and CPF</p>' +
          row('Your budget, about', '<span data-max data-budget>' + $r(a.budget) + '</span>', 'A ' + (st.akind === 'completed' ? 'completed' : 'new-launch') + ' private home, stamp duty included' + (a.absd ? '' : ''), 'f3-ar1') +
          lendRow('') +
          row('Monthly instalment', '<span data-mon>' + $(t.monthly) + '</span>', 'On a ' + $r(t.loan) + ' loan · ' + yrs(a.years) + ' at ' + a.ratePct + '%') +
          row('Cash you’ll need', '<span data-cashneed>' + $(t.cashNeed) + '</span>', 'Plus <b data-cpfuse>' + $(t.cpfUsed) + '</b> of CPF · ' + $(t.duty) + ' stamp duty included' + (t.absd > 0 ? ' (ABSD ' + $(t.absd) + ')' : '')) +
          (() => { if (!(st.price > 0)) return ''; const A0 = Math.max(21, root.GW_RULES.bankLtv.endAge - root.GW_RULES.bankLtv.standardTenure.private);
            const aq = F.afford(Object.assign({}, st, { cash: st.cash || 0, cpf: st.cpf || 0, p: st.p.map((x, k) => (k < st.n && typeof x.age !== 'number' ? Object.assign({}, x, { age: A0 }) : x)) })), Q = aq && aq.quote;
            if (!Q) return ''; const over = Q.zone === 'over';
            return row('For the ' + $(Q.price) + ' home', '<span data-quote="' + (over ? 'over' : 'ok') + '">' + (over ? $(Q.gap) + ' short' : Q.zone === 'tight' ? 'Within, but tight' : 'Within budget') + '</span>', bNote + 'Loan ' + $r(Q.loan) + ' · cash ' + $(Q.cashNeed) + ' · CPF ' + $(Q.cpfUsed), 'f3-arp'); })() +
          (a.saleCounted ? '<p class="f3-fine">Counts your home’s sale: about ' + $(a.sale.cash) + ' cash and ' + $(a.sale.cpf) + ' back to CPF.</p>' : st.homes >= 1 && st.plan === 'sell' ? '<p class="f3-fine">Your sale isn’t counted yet: add its price, loan and CPF refund under “Add my cash and CPF”.</p>' : '') +
          '<p class="f3-fact">' + budgetJudge + '</p>';
      } else {
        out.innerHTML = '<p class="f3-eb">On ' + $(b.income) + ' a month' + (b.joint ? ' between you' : '') + '</p>' + (elig ? '<p class="f3-alert" data-elig="' + b.elig + '">' + elig + '</p>' : '') +
          lendRow('f3-ar1') +
          row('Monthly instalment', $(b.monthly), instSub) +
          row('Home price this loan supports', '<span class="f3-approx">≈</span> ' + pTxt, 'What the loan supports at ' + pc(b.ltv) + ', before your savings' + (upfront !== null ? ' — about ' + $r(upfront) + ' upfront' : '')) + priceRow +
          (a && a.state === 'ask-cpf' ? '<p class="f3-note">You’ll still own a home, so CPF lets you use only the OA above a set-aside. Add your CPF balances under “Add my cash and CPF” to see your budget.</p>' : '') +
          (a && a.state === 'out-of-reach' ? '<p class="f3-note">' + (a.lever ? 'Your cash and CPF don’t cover the minimum payments yet: about <b>' + $(a.lever.amount) + '</b> more cash would bring a ' + $s(a.lever.forPrice) + ' home within reach.' : 'Your cash and CPF don’t cover the minimum payments yet.') + '</p>' : '') +
          '<p class="f3-fact">' + jb.text + '</p>';
      }
      if (cr && funds && !cr.open && cr.__auto !== true) { cr.open = true; cr.__auto = true; }
      const wl = [];
      wl.push('<li><b>Income:</b> ' + (b.counted < b.income - 0.5 ? $(b.income) + ' a month, with bonus and commission counted at 70%: ' + $(b.counted) + '.' : $(b.income) + ' a month before CPF.') + '</li>');
      wl.push('<li><b>The limit:</b> ' + (msr ? 'up to 30% of income for home-loan repayments (MSR)' + (b.kind === 'hdb-loan' ? '' : ', and 55% for all loans (TDSR)') : 'up to 55% of income for all loan repayments (TDSR)') + ', tested at ' + test + '%.</li>');
      if (b.debtsCut > 999) wl.push('<li><b>Your loans:</b> the ' + $(b.debts) + ' a month you already pay lowers it by about ' + $r(b.debtsCut) + '.</li>');
      wl.push('<li><b>Tenure:</b> ' + yrs(b.years) + (b.joint ? ', using the ' + (b.kind === 'hdb-loan' ? 'average' : 'income-weighted') + ' age of ' + Math.round(b.age * 10) / 10 : '') + (b.ageCut ? ', shorter than ' + b.ageCut.full + ' so it ends by age ' + (b.kind === 'hdb-loan' ? 65 : root.GW_RULES.bankLtv.endAge) : '') + '.</li>');
      (b.notes || []).forEach((n) => wl.push('<li>' + esc(n.text) + '</li>'));
      wl.push('<li>An estimate of what your income supports, not a bank approval. The bank decides.</li>');
      if (why) { why.hidden = false; q('[data-why-sum]').textContent = 'How the ' + $r(b.maxLoan) + ' is worked out'; q('[data-why-out]').innerHTML = wl.join(''); }
      const bud = a && a.state === 'ok' ? Math.floor(a.budget / 1000) * 1000 : null, budTxt = bud !== null ? fmtP(bud) : null;
      // the budget goes on to Budget Search only when the visitor asks to explore (as What can I afford? did)
      { const th = q('[data-to-homes]'); if (th) { th.hidden = bud === null; if (bud !== null) th.textContent = 'See homes within ' + budTxt; if (!th.__w) { th.__w = true; th.addEventListener('click', () => { if (lastBudget && lastBudget.a) { handoff(lastBudget.a, lastBudget.st); if (pendingHand) { try { root.sessionStorage.setItem('kpt.handoff', JSON.stringify(pendingHand)); } catch (e) { /* ignore */ } } } }); } } lastBudget = bud !== null ? { a: a, st: st } : null; }
      if (toc) { toc.hidden = b.kind === 'hdb-loan' || b.kind === 'hdb-bank'; toc.textContent = 'See what a ' + (budTxt || pTxt) + ' home costs me'; toc.dataset.price = String(bud !== null ? bud : pRound); toc.dataset.what = bud !== null ? 'budget' : 'price'; toc.dataset.kind = b.kind === 'ec' ? 'ec' : st.akind === 'completed' && bud !== null ? 'completed' : 'new'; }
      setBar(bud !== null ? '<span class="f3-bm"><span class="k">Your budget, about</span><b>' + $r(a.budget) + '</b><span class="s">' + $(a.top.monthly) + '/mo · loan ' + $r(b.maxLoan) + '</span></span>'
        : '<span class="f3-bm"><span class="k">' + lendL + '</span><b>' + $r(b.maxLoan) + '</b><span class="s">' + $(b.monthly) + '/mo · loan supports ≈ ' + pTxt + '</span></span>');
      view = { tool: 'borrow', st: st, b: b, endAge: endAge, pRound: pRound, pTxt: pTxt, ck: ck, upfront: upfront, instSub: instSub, judge: bud !== null ? budgetJudge : jb.text, alt: bud !== null ? null : jb.alt, test: test, msr: msr, cap: cap, a: bud !== null ? a : null, elig: elig, lendL: lendL };
      pdfBtn(true);
    }
    // the hand-off: the price this loan supports opens What will this home cost me? with it filled in (this tab only)
    { const toc = q('[data-to-cost]'); if (toc) toc.addEventListener('click', () => { const pr = Number(toc.dataset.price).toLocaleString('en-US');
      handTo('pay', { price: pr, pkind: toc.dataset.kind, what: toc.dataset.what || 'price' });
      if (journey) { const s0 = ST.get() || { v: 3, raw: {}, loans: [] }; s0.raw = s0.raw || {}; s0.raw.price = pr; s0.raw.pkind = toc.dataset.kind; ST.set(s0); const sh = SH.get() || {}; sh.buyPrice = s0.raw.price; delete sh.buyFrom; SH.set(sh); } }); }

    // V3.4: the HDB and EC loan limit page's payment schedule (gw-paylist.js, unchanged) moves here with its chip: an HDB flat (resale or new) or a new EC
    const PSH = page === 'borrow' && root.GW_PAYLIST ? q('[data-sched-host]') : null;
    const PS = PSH ? root.GW_PAYLIST.mount(PSH, { key: 'msr', base: '../', title: 'Payments for a flat or EC', em: 'every payment, its amount and when' }) : null;
    let psKind = null;
    function paintFlat(st) {
      const fr = q('[data-flatrow]'); if (!fr) return; fr.hidden = st.bkind !== 'hdb';
      const o = q('[data-flat-out]'), f = st.bkind === 'hdb' ? F.flat(st) : null; if (!o) return;
      if (!f) { o.innerHTML = ''; return; }
      const hdbL = f.scenario === 'hdb-loan', cov = f.cov > 0.5;
      const rr = (l, v, cls) => '<div class="f3-rl' + (cls ? ' ' + cls : '') + '"><div><span>' + l + '</span></div><b>' + v + '</b></div>';
      o.innerHTML = '<div class="f3-rcpt" data-flat>' + rr('Loan limit on the ' + (cov ? 'valuation' : 'price'), $(f.loanLimit) + ' (' + pc(f.ltv) + ' of ' + $(f.base) + ')') + rr('Loan you could take', $(f.loan) + (f.incomeLimited ? ' (your income is the limit)' : '')) +
        rr('To pay beyond the loan', $(f.down), 'tot') + (f.cashOnly > 0.5 ? rr('Of which cash only', $(f.cashOnly)) : '') + rr('Of which cash or CPF OA', $(f.cashOrCpf)) + '</div>' +
        '<p class="f3-fine">' + (hdbL ? (cov ? 'Cash only is the ' + $(f.cov) + ' above the valuation (cash over valuation). An HDB loan needs no minimum cash, so your CPF OA can pay the rest.' : 'An HDB loan needs no minimum cash: your CPF OA can pay the whole amount beyond the loan.')
          : 'Cash only is the ' + pc(f.minCashPct) + ' minimum cash (' + $(f.cashMin) + ')' + (cov ? ' plus the ' + $(f.cov) + ' above the valuation (cash over valuation).' : '.')) + ' The option and exercise fees are paid in cash when you sign; they are part of this amount, not extra.' +
          (f.dutyBase > f.price + 0.5 ? ' The valuation is above the price, so the loan is worked on the price; stamp duty is on the higher, ' + $(f.dutyBase) + '.' : '') + '</p>';
    }
    function paintPS(st, b) {
      paintFlat(st);
      if (!PSH) return; const k = st.bkind === 'ec' ? 'ec' : st.bkind === 'hdb' ? (st.hdbLoan === 'bank' ? 'hdb-bank' : 'hdb-loan') : null;
      PSH.hidden = !k || !PS; if (!k || !PS) return;
      if (k !== psKind) { psKind = k; if (k === 'ec') PS.setKinds(['ec']); else PS.setKinds(['hdb-resale', 'hdb-bto'], { loan: k === 'hdb-bank' ? 'bank' : 'hdb' }); }
      if (k !== 'ec' && b && b.state === 'ok' && PS.suggest) PS.suggest(Math.floor(b.maxLoan / b.ltv / 1000) * 1000);
    }

    /* ---- V3.4: What will I get from selling? ---- */
    const minCashShare = () => root.GW_RULES.bankLtv.standard[0].minCash;   // 5%: MAS, a first bank housing loan
    function sellCosts(r) { const c = r.costs; return { agent: c.commission + c.gst, legal: c.legal, other: c.other || 0, ssd: c.ssd || 0, selling: c.commission + c.gst + c.legal + (c.other || 0) }; }
    function judgeSell(r) {
      const five = pc(minCashShare());
      if (r.loanShortfall > 0) return 'The price doesn’t cover the loan, so there is nothing to carry into a next home: talk to your bank before you commit.';
      if (!r.cpfIn) return 'Once the CPF used is refunded, what is left is cash. A private home needs at least ' + five + ' of its price in cash, and that has to come from the cash part, not the CPF refund.';
      if (r.cash <= 0) return 'The sale leaves no cash after the loan, the CPF refund and the costs, so the ' + five + ' cash a private home needs would have to come from your savings.';
      if (r.o55 && !(r.cpfUsable > 0)) return 'Cash in hand is the figure that shapes your next purchase: until CPF says how much the 55+ owners can use again, none of the refund is counted for it. A private home needs at least ' + five + ' of its price in cash, and that has to come from the ' + $(r.cash) + '.';
      return 'Cash in hand is the figure that shapes your next purchase. The CPF refund still counts' + (r.o55 ? ' (the usable part, ' + $(r.cpfUsable) + ')' : '') + ', but a private home needs at least ' + five + ' of its price in cash, and that has to come from the ' + $(r.cash) + '.';
    }
    function paintSell(st) {
      const r = F.sell(st); paintChips(st, null);
      const why = q('[data-why]'), tob = q('[data-to-borrow]'), quiet = () => { if (why) why.hidden = true; if (tob) tob.hidden = true; setBar(''); view = null; pdfBtn(false); };
      if (r.state === 'need') { out.innerHTML = '<p class="f3-eb">Type a selling price to begin</p>' + row('You get back', '<span class="f3-dash">—</span>', 'After the loan and the selling costs') + row('Cash in hand', '<span class="f3-dash">—</span>', 'What you can spend freely') + row('Back into your CPF', '<span class="f3-dash">—</span>', 'Usable for the next home'); quiet(); return; }
      if (r.state === 'invalid') { out.innerHTML = '<p class="f3-eb">Check the figures</p><p class="f3-note">' + esc(((r.errors || [])[0] || {}).text || 'Check the figures marked.') + '</p>'; quiet(); return; }
      done();
      const k = sellCosts(r), al = [];
      if (r.loanShortfall > 0) al.push('The price doesn’t cover the loan by ' + $(r.loanShortfall) + '. With the selling costs, about ' + $(r.ownCashNeeded) + ' would have to come from your own funds.');
      else if (r.ownCashNeeded > 0) al.push('The costs are more than the cash from the sale: about ' + $(r.ownCashNeeded) + ' from your own cash.');
      if (r.cpfIn && r.cpfShortfall > 0) al.push('The sale doesn’t cover the full CPF refund: ' + $(r.cpfShortfall) + ' isn’t refunded. You don’t top this up in cash if you sell at market value.');
      if (r.cpfIn && r.o55 && r.cpfProvisional) al.push(r.cpfUsable > 0 ? 'An owner is 55 or older: only the younger owners’ ' + $(r.cpfUsable) + ' is counted for the next home until CPF’s figure for what the 55+ owners can use is added.' : 'An owner is 55 or older: none of the CPF refund is counted for the next home until you add what CPF says can be used again (or, for joint owners, the 55+ owners’ share).');
      if (r.type !== 'hdb' && r.ssdMissing && st.sale.held !== true) al.push('No Seller’s Stamp Duty is counted. Owned it less than 4 years? Add the date you bought.');
      out.innerHTML = '<p class="f3-eb">Selling at ' + $(r.price) + '</p>' +
        row('You get back', '<span data-answer data-total>' + $(r.total) + '</span>', 'After the loan' + (r.penalty ? ', the ' + $(r.penalty) + ' repayment penalty' : '') + ' and ' + $(k.selling) + ' selling costs' + (k.ssd ? ', and ' + $(k.ssd) + ' Seller’s Stamp Duty' : ''), 'f3-ar1') +
        (r.cpfIn ? row('Cash in hand', '<span data-cash>' + $(r.cash) + '</span>', 'What you can spend freely') +
          row('Back into your CPF', '<span data-cpf>' + $(r.cpf) + '</span>', r.o55 ? 'Usable for the next home: <b data-cpfuse>' + $(r.cpfUsable) + '</b>' + (r.cpfProvisional ? ' <span class="f3-tag">provisional</span>' : '') : 'Usable for the next home, not for the ' + pc(minCashShare()) + ' cash part')
          : '<p class="f3-nh">Add the CPF used for this home, with its accrued interest, to split this into cash and CPF. <button type="button" class="f3-lnk" data-open-chip="scpf">Add the CPF used</button></p>') +
        (k.ssd ? row('Seller’s Stamp Duty', '<span data-ssd>' + $(k.ssd) + '</span>', 'Sold ' + (r.ssd && r.ssd.heldText ? r.ssd.heldText + ' after buying' : 'within the SSD period') + ': ' + pc(r.ssd.rate) + ', included above') : '') +
        (al.length ? '<ul class="f3-alert">' + al.map((x) => '<li>' + x + '</li>').join('') + '</ul>' : '') +
        '<p class="f3-fact">' + judgeSell(r) + '</p>';
      const wl = ['<li><b>Selling price:</b> ' + $(r.price) + '.</li>', '<li><b>Loan repaid:</b> ' + $(r.loan) + (r.penalty ? ', plus a ' + $(r.penalty) + ' early repayment penalty' : '') + '.</li>',
        '<li><b>Agent’s fee:</b> ' + $(k.agent) + ' (' + r.costs.commissionPct + '% plus 9% GST' + (r.defaults.commission ? ', the usual fee' : '') + ').</li>', '<li><b>Legal fees:</b> ' + $(k.legal) + (r.defaults.legal ? ', a typical figure' : '') + '.</li>']
        .concat(k.ssd ? ['<li><b>Seller’s Stamp Duty:</b> ' + $(k.ssd) + ' (' + pc(r.ssd.rate) + ').</li>'] : [])
        .concat(['<li><b>You get back:</b> ' + $(r.total) + '.</li>'], r.cpfIn ? ['<li><b>CPF refunded</b> (the CPF used, with interest): ' + $(r.cpf) + '; the rest, ' + $(r.cash) + ', is cash.</li>'] : [], ['<li>CPF Board decides the actual refund. If an owner is 55 or older, their refund goes first to their Retirement Account.</li>']);
      if (why) { why.hidden = false; q('[data-why-sum]').textContent = 'How the ' + $(r.total) + ' is worked out'; q('[data-why-out]').innerHTML = wl.join(''); }
      if (tob) tob.hidden = r.loanShortfall > 0;
      setBar('<span class="f3-bm"><span class="k">You get back</span><b>' + $(r.total) + '</b><span class="s">' + (r.cpfIn ? $(r.cash) + ' cash · ' + $(r.cpf) + ' CPF' + (r.o55 ? ' (' + $(r.cpfUsable) + ' usable)' : '') : 'Add the CPF used to split it') + '</span></span>');
      view = { tool: 'sell', st: st, r: r, k: k, judge: judgeSell(r), alerts: al }; pdfBtn(true);
      lastSell = r;
    }
    let lastSell = null;
    // the hand-off: the sale goes on to How much can I borrow? with the cash-and-CPF row open, counted as a home sold before buying (this tab only)
    { const tob = q('[data-to-borrow]'); if (tob) tob.addEventListener('click', () => { handSale(lastSell); }); }
    // Cost -> Borrow ("Check my own borrowing limit"): the price being checked goes with it, nothing else
    $$('[data-open-borrow]').forEach((ob) => ob.addEventListener('click', () => { const pr = mv(raw.price); if (pr > 0) handTo('borrow', { price: Math.round(pr).toLocaleString('en-US') }); }));
    function handSale(r) {
      // V3.7: only the sale goes to the borrowing page (its figures, its own costs); in the journey the shared entries carry as well, as before
      const own0 = r && r.cpfIn && (!r.defaults.commission || !r.defaults.legal || (r.costs.ssd || 0) > 0 || r.penalty > 0 || r.o55), sale = {};
      Object.keys(raw).forEach((k) => { if (/^sale\./.test(k) && raw[k] !== undefined && raw[k] !== '') sale[k] = raw[k]; });
      sale['sale.oCash'] = own0 ? String(Math.round(r.cash)) : ''; sale['sale.oCpf'] = own0 ? String(Math.round(r.cpfUsable)) : '';
      handTo('borrow', { sale: sale });
      if (!journey) return;
      const s0 = ST.get() || { v: 3, raw: {}, loans: [] }; s0.raw = Object.assign({}, s0.raw, raw);
      if (!s0.raw.homes || s0.raw.homes === '0') s0.raw.homes = '1';
      s0.raw.plan = 'sell'; s0.raw.bkind = 'private';
      // the sale's own costs (agent's fee, legal fees, SSD) are kept as figures when they are not the usual ones, so the budget counts the same cash and CPF
      const own = r && r.cpfIn && (!r.defaults.commission || !r.defaults.legal || (r.costs.ssd || 0) > 0 || r.penalty > 0 || r.o55);
      s0.raw['sale.oCash'] = own ? String(Math.round(r.cash)) : ''; s0.raw['sale.oCpf'] = own ? String(Math.round(r.cpfUsable)) : '';
      ST.set(s0);
    }
    // Keep funds aside (V3.5): none by default; six months of the instalment is offered as a choice, never assumed
    function optsUp(k, st) {
      if (k !== 'ures') return [];
      const at = (res) => { const a = F.afford(upSt(Object.assign({}, st, { reserve: res }))); return a.state === 'ok' ? a : null; };
      const a0 = at(0), m6 = a0 ? Math.round(a0.top.monthly * 6 / 1000) * 1000 : 0, a6 = m6 ? at(m6) : null, cur = st.reserve || 0;
      const g = [{ opts: [{ label: 'None', sub: a0 ? 'Buy up to about ' + fmtP(Math.floor(a0.budget / 1000) * 1000) : 'The most your figures allow', set: { reserve: '' }, sel: !(cur > 0) }]
        .concat(m6 ? [{ label: 'Six months of the instalment', sub: 'About ' + $(m6) + (a6 ? ' · buy up to about ' + fmtP(Math.floor(a6.budget / 1000) * 1000) : ''), set: { reserve: m6.toLocaleString('en-US') }, sel: cur === m6 }] : [])
        .concat([{ label: 'Another amount', act: 'cust', sel: cur > 0 && cur !== m6 }]) }];
      g.note = 'Funds kept aside are left out of the purchase, so the budget is worked out without them. This is your choice, not a bank requirement.';
      return g;
    }
    function optsSell(k, st) {
      const r0 = F.sell(st), ok = r0.state === 'ok', back = (ov) => { const r = F.sell(Object.assign({}, st, { sale: Object.assign({}, st.sale, ov) })); return r.state === 'ok' ? r : null; };
      const got = (r) => (r ? 'You get back ' + $(r.total) : '');
      if (k === 'stype') return [{ opts: [['hdb', 'HDB flat', 'Seller’s Stamp Duty rarely applies: the minimum occupation period is longer'], ['private', 'Private home', 'Seller’s Stamp Duty if sold within 3 or 4 years of buying'], ['ec', 'EC', 'Seller’s Stamp Duty if sold within 3 or 4 years of buying']].map((x) => ({ label: x[1], sub: x[2], set: { 'sale.type': x[0] }, sel: st.sale.type === x[0] })) }];
      if (k === 'scpf') return [{ opts: [{ label: 'Type the CPF used', sub: 'With accrued interest, all owners together', act: 'cust', sel: typeof st.sale.cpfRefund === 'number' }, { label: 'Not known yet', sub: 'Shows the total only', set: { 'sale.cpfRefund': '' }, sel: typeof st.sale.cpfRefund !== 'number' }] }];
      if (k === 'scomm') { const g = [{ opts: [1, 1.5, 2].map((x) => ({ label: x + '% plus GST', sub: ok ? got(back({ comm: x })) : '', set: { 'sale.comm': String(x) }, sel: (st.sale.comm === null ? 2 : st.sale.comm) === x })).concat([{ label: 'Another fee', act: 'cust', sel: st.sale.comm !== null && [1, 1.5, 2].indexOf(st.sale.comm) < 0 }]) }]; g.note = 'The fee is agreed with your agent; 2% is common.'; return g; }
      if (k === 'slegal') return [{ opts: [2500, 3000, 3500].map((x) => ({ label: $(x), sub: ok ? got(back({ legal: x })) : '', set: { 'sale.legal': x.toLocaleString('en-US') }, sel: (st.sale.legal === null ? 3000 : st.sale.legal) === x })).concat([{ label: 'Another amount', act: 'cust', sel: st.sale.legal !== null && [2500, 3000, 3500].indexOf(st.sale.legal) < 0 }]) }];
      if (k === 'sssd') return [{ opts: [{ label: 'Owned it long enough', sub: 'No Seller’s Stamp Duty', set: { 'sale.held': 'yes', 'sale.bought': '', 'sale.sold': '' }, sel: st.sale.held === true && !st.sale.bought }, { label: 'Enter the dates', sub: 'Bought from 4 Jul 2025: 4 years; before: 3 years', act: 'cust', set: { 'sale.held': '' }, sel: !!st.sale.bought }] }];
      return [];
    }

    /* ---- V3.4: Upgrade from HDB, the four-step thread ---- */
    const stepOpen = {};   // steps the visitor opened with Change
    // V3.7.3 (Ken): the step being worked on stays open until its Done is pressed. It used to follow the answers: the first unanswered step was the open one,
    // so the first digit of a price (or of the CPF used) "answered" the step and it closed mid-typing. Now typing never completes a step; only Done does.
    let curStep, doneReq = null, doneJust = false;
    // V3.7.3 (Ken, 27 Oct 2026): "Buy first, then sell", with its own three figures side by side: the flat's monthly repayment (when its loan is still running),
    // the cash and the usable CPF available now. The sale proceeds are not counted. The flat's loan makes the new one a second housing loan (MAS: 45% LTV, 25% cash)
    // and its repayment counts in TDSR. A missing figure is asked beside its own field; nothing is assumed to be zero. Sell first (the answer above) is unchanged.
    let bfSeeded = false;
    function paintBuyFirst(st, u, a) {
      const o = q('[data-bfirst-out]'); if (!o) return;
      // the cash and CPF this tab already has (the guided journey's savings) fill the two fields once, to change as needed
      if (!bfSeeded) { bfSeeded = true; [['bfCash', st.cash], ['bfCpf', st.cpf]].forEach((x) => { if (raw[x[0]] === undefined || raw[x[0]] === '') { if (x[1] > 0) { put(x[0], Math.round(x[1]).toLocaleString('en-US')); raw[x[0]] = Math.round(x[1]).toLocaleString('en-US'); } } }); st = Object.assign({}, st, { bfCash: mv(raw.bfCash), bfCpf: mv(raw.bfCpf) }); }
      const rm = root.GW_RULES.absdRefundMonths || 6, L2 = root.GW_RULES.bankLtv.standard[1], L1 = root.GW_RULES.bankLtv.standard[0];
      const flatLoan = st.sale.loan > 0.5, listed = (st.loans || []).filter((l) => l.type === 'home' && l.amt > 0)[0], flatMo = st.upFlatMo > 0 ? st.upFlatMo : listed ? listed.amt : (st.upFlatMo === 0 ? 0 : null);
      const moBox = q('[data-bf-mo]'); if (moBox) moBox.hidden = !flatLoan;
      const need = { upFlatMo: flatLoan && flatMo === null, bfCash: !(typeof st.bfCash === 'number'), bfCpf: !(typeof st.bfCpf === 'number') };
      $$('[data-bf-need]').forEach((p) => { p.hidden = !need[p.dataset.bfNeed]; });
      const loanTxt = flatLoan ? 'The flat’s ' + $(st.sale.loan) + ' loan is still running, so the new loan is a second housing loan: up to ' + pc(L2.ltv) + ' of the price, at least ' + pc(L2.minCash) + ' in cash, and the flat’s repayment counts against your income.' : 'The flat has no loan left, so the usual ' + pc(L1.ltv) + ' limit applies.';
      const sellTxt = a && a.state === 'ok' ? ' Selling first, the answer above is about ' + fmtP(Math.floor(a.budget / 1000) * 1000) + '.' : '';
      if (need.upFlatMo || need.bfCash || need.bfCpf) { o.innerHTML = '<div class="f3-bfres" data-bf-wait><span>Buy first, then sell</span><b>—</b></div><p class="f3-fine">Add the figures marked above to see the buy-first budget. ' + loanTxt + ' While you still own the flat, ABSD on the new home is paid upfront (a married couple with a Singapore Citizen can have it refunded if the flat is sold within ' + rm + ' months, IRAS).</p>'; return; }
      const res = Math.max(0, st.reserve || 0), cash = Math.max(0, st.bfCash - res);
      const k0 = F.afford(Object.assign({}, u, { plan: 'keep', cash: cash, cpf: st.bfCpf, cpfIsUsable: true, sale: Object.assign({}, u.sale, { oCash: null, oCpf: null }), loans: (u.loans || []).concat(flatLoan ? [{ type: 'home', who: 0, amt: flatMo }] : []) }));
      const absdTxt = (t) => (t && t.absd > 0 ? ' ' + $(t.absd) + ' of ABSD is paid upfront (a married couple with a Singapore Citizen can have it refunded if the flat is sold within ' + rm + ' months, IRAS).' : '');
      if (k0.state === 'ok') {
        o.innerHTML = '<div class="f3-bfres"><span>Buy first, then sell, about</span><b data-bf-budget>' + fmtP(Math.floor(k0.budget / 1000) * 1000) + '</b></div><p class="f3-fine">From ' + $(cash) + ' cash' + (res > 0 ? ' (after the ' + $(res) + ' kept aside)' : '') + ' and ' + $(st.bfCpf) + ' CPF, without the flat’s sale proceeds' + (flatLoan ? ', counting its ' + $(flatMo) + ' monthly repayment' : '') + '. ' + loanTxt + absdTxt(k0.top) + sellTxt + '</p>';
      } else {
        o.innerHTML = '<div class="f3-bfres"><span>Buy first, then sell</span><b data-bf-none>No budget</b></div><p class="f3-fine" data-bf-short>' + (k0.state === 'income' || k0.state === 'no-income' ? 'The income left after the flat’s repayment supports no new loan.' : 'With ' + $(cash) + ' cash and ' + $(st.bfCpf) + ' CPF, the cash minimum and the ABSD of a second home leave nothing to buy with before the flat is sold.') + ' ' + loanTxt + sellTxt + '</p>';
      }
    }
    function upSt(st) {
      // the thread's planning conventions (KPT assumptions): the flat is an HDB flat sold first, then a private home is bought; its loan is repaid at the sale;
      // savings not entered count as none; a reserve (none unless the visitor sets one, as in the HDB upgrade planner) is kept out of the cash before the budget is worked out
      const u = Object.assign({}, st, { homes: Math.max(1, st.homes || 0), plan: 'sell', bkind: 'private', akind: st.akind === 'completed' ? 'completed' : 'new', price: null, cash: st.cash || 0, cpf: st.cpf || 0,
        sale: Object.assign({}, st.sale, { type: 'hdb', oCash: null, oCpf: null }), loans: (st.loans || []).filter((l) => l.type !== 'home') });
      const sv = F.sell(u), res = Math.max(0, st.reserve || 0);
      u.reserveKept = 0;
      if (sv.state === 'ok' && sv.cpfIn) {
        const fromSale = Math.min(res, Math.max(0, sv.cash)), fromSaved = Math.min(res - fromSale, u.cash);
        u.sale.oCash = sv.cash - fromSale; u.sale.oCpf = sv.cpfUsable; u.cash -= fromSaved; u.reserveKept = fromSale + fromSaved;
      }
      return u;
    }
    function paintUpgrade(st) {
      const u = upSt(st), sv = F.sell(u), bw = F.borrow(u), hx = flatCtx();
      paintChips(st, null);
      const has1 = st.sale.price > 0, has2 = has1 && typeof st.sale.loan === 'number' && typeof st.sale.cpfRefund === 'number', has3 = bw.state === 'ok';
      const done_ = { worth: has1, sell: has2, borrow: has3 };
      // step answers
      const setA = (key, v, sub) => { const a = q('[data-stv="' + key + '"]'), b = q('[data-sts="' + key + '"]'); if (a) a.innerHTML = v; if (b) b.textContent = sub; };
      if (has1) { const lo = hx && hx.lo, hi = hx && hx.hi; setA('worth', lo && hi ? kTxt(lo) + ' – ' + kTxt(hi).replace('$', '') : $(st.sale.price), lo && hi ? [hx.flatType ? flatName(hx.flatType) : '', 'Blk ' + hx.block + ' ' + titleCase(hx.street || ''), hx.n + ' recent sales', 'using ' + $(st.sale.price)].filter(Boolean).join(' · ') : 'Your estimate of the selling price'); }
      if (has2 && sv.state === 'ok') setA('sell', $(sv.total), $(sv.cash) + ' cash + ' + $(sv.cpf) + ' CPF' + (sv.o55 ? ' (' + $(sv.cpfUsable) + ' usable' + (sv.cpfProvisional ? ', provisional' : '') + ')' : '') + (sv.penalty ? ' · after a ' + $(sv.penalty) + ' penalty' : '') + ' · sold at ' + $(sv.price));
      if (has3) setA('borrow', $r(bw.maxLoan), 'On ' + $(bw.income) + ' a month' + (bw.joint ? ' between you' : '') + ' · age ' + (bw.joint ? Math.round(bw.age) + ' (weighted)' : bw.age) + ' · ' + (bw.debts > 0 ? $(bw.debts) + ' a month of other loans' : 'no other loans'));
      // which step is open: the first one not answered, plus any the visitor opened with Change
      const order = ['worth', 'sell', 'borrow'];
      if (curStep === undefined) curStep = order.filter((k) => !done_[k])[0] || null;   // on arrival: the first step not yet answered
      doneJust = !!doneReq;
      if (doneReq) { const k = doneReq; doneReq = null; if (done_[k]) { stepOpen[k] = false; if (curStep === k || curStep === null) curStep = order.filter((x) => !done_[x] && x !== k)[0] || null; } }   // Done on an unanswered step keeps it open
      const typing = (k) => { const e = q('[data-ste="' + k + '"]'), ae = document.activeElement; return !!e && !e.hidden && !!ae && e.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) && !doneJust; };
      order.forEach((k) => { const ed = stepOpen[k] || k === curStep || typing(k), li = q('[data-step="' + k + '"]'); const a = q('[data-sta="' + k + '"]'), e = q('[data-ste="' + k + '"]');
        if (a) a.hidden = ed || !done_[k]; if (e) e.hidden = !ed; if (li) { li.classList.toggle('done', !!done_[k] && !ed); li.classList.toggle('later', !done_[k] && !ed); } });
      { const li = q('[data-step="budget"]'); if (li) li.classList.toggle('later', !(has2 && has3)); }
      const cl = q('[data-up-costs]'); if (cl && sv.state === 'ok') cl.innerHTML = 'Agent ' + sv.costs.commissionPct + '% plus GST and legal fees of ' + $(sv.costs.legal) + ' are taken off: ' + $(sellCosts(sv.r).selling) + ' in all. To change them, use <a href="../sale-proceeds/" data-gw-go="up-sale-proceeds">What will I get from selling?</a>';
      // the budget
      const why = q('[data-why]'), bf = q('[data-bfirst]'), toc = q('[data-to-cost]'), toh = q('[data-to-homes]');
      const quiet = (msg) => { out.innerHTML = '<p class="f3-eb">Your upgrade budget</p>' + row('Buy up to about', '<span class="f3-dash">—</span>', 'Sell first, then buy · private home') + row('Upfront it needs', '<span class="f3-dash">—</span>', 'From your sale proceeds') + row('Left in reserve', '<span class="f3-dash">—</span>', 'After the purchase') + '<p class="f3-nh">' + msg + '</p>'; [why, bf, toc, toh].forEach((x) => { if (x) x.hidden = true; }); setBar(''); view = null; pdfBtn(false); };
      if (!(has2 && has3)) { quiet(!has1 ? 'Start with step 1: what your flat could sell for.' : !has2 ? 'Next, step 2: the loan still owing and the CPF used for the flat.' : 'Next, step 3: your income and age.'); return; }
      const a = F.afford(u);
      if (a.state !== 'ok') { quiet(a.state === 'out-of-reach' ? 'The proceeds don’t cover the minimum payments for a private home yet.' : 'Check the figures in the steps above.'); return; }
      done();
      const age55 = st.p.slice(0, st.n).some((x) => typeof x.age === 'number' && x.age >= 55);
      const al55 = sv.o55 && sv.cpfProvisional ? 'An owner is 55 or older: ' + (sv.cpfUsable > 0 ? 'only ' + $(sv.cpfUsable) + ' of the CPF refund is counted' : 'none of the CPF refund is counted') + ' until CPF’s figure for what can be used again is added in step 2. The budget is provisional.'
        : !sv.o55 && age55 ? 'You entered an age of 55 or over. If an owner of the flat is 55 or older, say so in step 2: their CPF refund may not all be usable for the next home.' : '';
      const v0res = u.reserveKept, t = a.top, upfront = t.cashNeed + t.cpfUsed, saved = (u.cash || 0) + (u.cpf || 0), funds = (a.sale ? a.sale.cash + a.sale.cpf : 0) + saved, reserve = u.reserveKept + Math.max(0, funds - upfront);
      const bTxt = fmtP(Math.floor(a.budget / 1000) * 1000);
      // the levers, from the same engine: a co-borrower's or a pay rise's $1,000 a month, and $10,000 more (or less) cash
      const inc1 = F.afford(Object.assign({}, u, { p: u.p.map((x, k) => (k === 0 ? Object.assign({}, x, { fixed: (x.fixed || 0) + 1000 }) : x)) })), c10 = F.afford(Object.assign({}, u, { cash: u.cash + 10000 }));
      const dI = inc1.state === 'ok' ? Math.round((inc1.budget - a.budget) / 1000) * 1000 : 0, dC = c10.state === 'ok' ? Math.round((c10.budget - a.budget) / 1000) * 1000 : 0;
      const judge = (a.limitedBy === 'funds' ? 'Your proceeds set the ceiling here, not the loan: the upfront sum uses all of them' + (saved ? ' and your savings' : '') + '.'
        : a.limitedBy === 'income' ? 'Your loan and your proceeds are both used in full at this price: the loan is at its income limit, and the proceeds pay the rest of the price and the stamp duty.'
        : 'The timing of the payments is the limit here.') +
        (dI > 999 ? ' Each extra $1,000 a month of income, including a co-borrower’s, adds about ' + $(dI) + (dC > 999 ? '; each $10,000 kept in reserve takes off about ' + $(dC) : '') + '.' : dC > 999 ? ' Each $10,000 kept in reserve takes off about ' + $(dC) + '.' : '');
      out.innerHTML = '<p class="f3-eb">Your upgrade budget</p>' +
        row('Buy up to about', '<span data-answer data-budget>' + bTxt + '</span>', 'Sell first, then buy · ' + (u.akind === 'completed' ? 'completed' : 'new-launch') + ' private home', 'f3-ar1') +
        row('Upfront it needs', '<span data-upfront>' + $r(upfront) + '</span>', 'From your ' + (sv.o55 ? $(a.sale.cash + a.sale.cpf) + ' of usable proceeds' : $(sv.total) + ' proceeds') + (saved ? ' and ' + $(saved) + ' of savings' : '')) +
        row('Left in reserve', '<span data-reserve>' + $r(reserve) + '</span>', u.reserveKept > 0 ? 'The funds you chose to keep aside' : 'No funds kept aside: tap “Keep funds aside” to set some') +
        (al55 ? '<ul class="f3-alert"><li>' + al55 + '</li></ul>' : '') +
        '<p class="f3-fact">' + judge + '</p>' +
        '<p class="f3-fine f3-kpt">An estimate of the most you could buy, not a bank approval or a comfortable amount to spend. KPT assumptions: you sell first, then buy; no funds kept aside unless you choose some. Purchase legal fees, renovation and moving are not counted.</p>';
      const wl = ['<li><b>The sale:</b> ' + $(sv.price) + ', less the ' + $(sv.loan) + ' loan' + (sv.penalty ? ', a ' + $(sv.penalty) + ' early repayment penalty' : '') + ' and ' + $(sellCosts(sv.r).selling) + ' of selling costs: ' + $(sv.total) + ' (' + $(sv.cash) + ' cash, ' + $(sv.cpf) + ' back to CPF' + (sv.o55 ? ', of which ' + $(sv.cpfUsable) + ' is counted as usable' : '') + ').</li>' + (v0res ? '<li><b>Kept aside:</b> ' + $(v0res) + ', as you chose; it is not used for the purchase.</li>' : ''),
        '<li><b>The loan:</b> about ' + $r(bw.maxLoan) + ' over ' + yrs(bw.years) + ', at ' + pc(bw.share) + ' of income tested at ' + (Math.round(bw.testRatePct * 100) / 100) + '%.</li>',
        '<li><b>At ' + bTxt + ':</b> a ' + $r(t.loan) + ' loan, ' + $(t.cashNeed) + ' in cash and ' + $(t.cpfUsed) + ' of CPF, including ' + $(t.duty) + ' stamp duty' + (t.absd > 0 ? ' (ABSD ' + $(t.absd) + ')' : '') + '.</li>',
        '<li><b>The monthly instalment</b> would be about ' + $(t.monthly) + ' over ' + yrs(a.years) + ' at ' + a.ratePct + '%.</li>',
        '<li>' + (saved ? 'Your savings, ' + $(u.cash) + ' cash and ' + $(u.cpf) + ' CPF, are counted as you entered them on How much can I borrow?.' : 'Savings besides the sale are not counted; add them on How much can I borrow? (Add my cash and CPF).') + '</li>'];
      if (why) { why.hidden = false; q('[data-why-sum]').textContent = 'How the ' + bTxt + ' is worked out'; q('[data-why-out]').innerHTML = wl.join(''); }
      if (bf) { bf.hidden = false; paintBuyFirst(st, u, a); }
      if (toc) { toc.hidden = false; toc.textContent = 'What a ' + bTxt + ' home costs each month'; toc.dataset.price = String(Math.floor(a.budget / 1000) * 1000); toc.dataset.what = 'budget'; toc.dataset.kind = u.akind === 'completed' ? 'completed' : 'new'; }
      if (toh) { toh.hidden = false; toh.textContent = 'See homes around ' + bTxt; }
      setBar('<span class="f3-bm"><span class="k">Buy up to about</span><b>' + bTxt + '</b><span class="s">' + $r(upfront) + ' upfront · ' + $r(reserve) + ' reserve</span></span>');
      view = { tool: 'upgrade', st: st, u: u, a: a, sv: sv, bw: bw, upfront: upfront, reserve: reserve, saved: saved, bTxt: bTxt, judge: judge, hx: hx }; pdfBtn(true);
      // the budget goes on to Budget Search only when the visitor asks to explore
      if (toh && !toh.__w) { toh.__w = true; toh.addEventListener('click', () => { if (view && view.a) { handoff(view.a, view.u); if (pendingHand) { try { root.sessionStorage.setItem('kpt.handoff', JSON.stringify(pendingHand)); } catch (e) { /* ignore */ } } } }); }
    }
    function kTxt(n) { return n >= 1e6 ? '$' + (Math.round(n / 1e4) / 100) + 'M' : '$' + Math.round(n / 1000) + 'k'; }
    function titleCase(x) { return String(x || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }
    function flatName(ft) { return String(ft || '').toLowerCase().replace(/^(\d) room$/, '$1-room').replace(/executive/, 'Executive'); }
    function flatCtx() { try { const c = root.GWJ && root.GWJ.ctx ? root.GWJ.ctx.get() : {}; const H = c && c.hdb; return H && H.lo !== undefined && H.hi !== undefined && H.block ? H : null; } catch (e) { return null; } }
    // Change opens a step; Done closes it again
    box.addEventListener('click', (e) => {
      const c = e.target.closest('[data-stc]'); if (c) { stepOpen[c.dataset.stc] = true; changed(true); setTimeout(() => { const f = q('[data-ste="' + c.dataset.stc + '"] input'); if (f) f.focus(); }, 30); return; }
      const d = e.target.closest('[data-stdone]'); if (d) { doneReq = d.dataset.stdone; changed(true); return; }
      const w = e.target.closest('[data-up-worth]'); if (w) { try { if (root.GWJ && root.GWJ.ctx) root.GWJ.ctx.set({ path: 'upgrade', type: 'hdb' }); } catch (x) { /* ignore */ } }
      const oc = e.target.closest('[data-open-chip]'); if (oc) openChip(oc.dataset.openChip);
    });

    /* ---- What can I afford? ---- */
    let pendingHand = null;
    function paintAfford(st) {
      const a = F.afford(st), cp = q('[data-cpf2]');
      if (cp) cp.hidden = !(a.state === 'ask-cpf' || (a.r && a.r.facts && a.r.facts.cpf && a.r.facts.cpf.applies));
      handoff(null);
      if (a.state === 'hdb') { out.innerHTML = '<p class="f3-k">An HDB flat</p><p class="f3-note">HDB flats follow HDB’s own loan rules. See how much HDB or a bank could lend.</p><div class="f3-cta"><a class="gw-btn pri" href="../tdsr/' + (journey ? '?j=1' : '') + '" data-f3-hdb data-gw-go="fin3-borrow-hdb">How much can I borrow?</a></div>'; setBar(''); const h = out.querySelector('[data-f3-hdb]'); if (h) h.addEventListener('click', () => { raw.bkind = 'hdb'; save(); const s = ST.get(); s.raw.bkind = 'hdb'; ST.set(s); }); return; }
      if (a.state === 'need') { out.innerHTML = preview('Your budget, about', ['Borrowing capacity', 'Monthly mortgage', 'Cash and CPF you’d need', 'What limits it'], a.need); setBar(''); return; }
      if (a.state === 'invalid') { out.innerHTML = '<p class="f3-k">Your budget</p><p class="f3-note">' + esc(((a.r.errors || [])[0] || {}).text || 'Check the figures marked.') + '</p>'; setBar(''); return; }
      if (a.state === 'no-income') { out.innerHTML = '<p class="f3-k">Your budget</p><p class="f3-note">With no income entered there is no bank loan to work out. Add a salary, including a co-buyer’s.</p>'; setBar(''); return; }
      const cap = a.borrow ? a.borrow.max : 0;
      if (a.state === 'income') { out.innerHTML = '<p class="f3-k">You could borrow about</p><p class="f3-v">' + $r(cap) + '</p><p class="f3-s">over ' + yrs(a.borrow.years) + ' · about <b>' + $(a.borrow.monthly) + '</b> a month</p><p class="f3-nh">Add your cash and CPF to see your budget.</p>'; setBar('<span>Borrow about <b>' + $r(cap) + '</b></span>'); return; }
      if (a.state === 'ask-cpf') { out.innerHTML = '<p class="f3-k">Your budget</p><p class="f3-note">You’ll still own a home, so CPF lets you use only the OA above a set-aside. Add your CPF balances to see your budget.</p><div class="f3-cta"><button type="button" class="gw-btn" data-go="cpfBal.0.oa">Add CPF balances</button></div>'; setBar(''); return; }
      if (a.state === 'out-of-reach') { out.innerHTML = '<p class="f3-k">Your budget</p><p class="f3-v f3-vt">Not enough yet</p><p class="f3-note">' + (a.lever ? 'About <b>' + $(a.lever.amount) + '</b> more cash would bring a ' + $s(a.lever.forPrice) + ' home within reach.' : 'Your cash and CPF don’t cover the minimum payments yet.') + '</p>'; setBar(''); return; }
      if (a.state !== 'ok') { out.innerHTML = ''; setBar(''); return; }
      done();
      const t = a.top, LIM = { income: 'your income (what a bank could lend)', funds: 'your cash and CPF', payments: 'the cash and CPF you’ll have when each payment is due', choice: 'the loan amount you chose' };
      const absdTxt = t.absd > 0 ? '<li>Includes ABSD of <b>' + $(t.absd) + '</b>' + (st.homes >= 1 && st.plan !== 'sell' ? ', as you’ll still own a home' : '') + '.</li>' : '';
      let html = '<p class="f3-k">Your budget, about</p><p class="f3-v" data-answer data-max>' + $r(a.budget) + '</p>' +
        '<p class="f3-s">Limited by <b>' + LIM[a.limitedBy] + '</b>.</p><div class="f3-tiles">' +
        tile('Borrowing capacity', $r(cap), 'what your income supports') + tile('Monthly mortgage', $(t.monthly), 'on ' + $r(t.loan) + ' over ' + yrs(a.years) + ' at ' + a.ratePct + '%') +
        tile('Cash you’d need', $(t.cashNeed), 'incl. ' + $(t.duty) + ' stamp duty') + tile('CPF you’d use', $(t.cpfUsed), '') + '</div><ul class="f3-why">' + absdTxt +
        (a.saleCounted ? '<li>Counts your home’s sale: about ' + $(a.sale.cash) + ' cash and ' + $(a.sale.cpf) + ' back to CPF.</li>' : st.homes >= 1 && st.plan === 'sell' ? '<li>Your sale isn’t counted yet: add its price, loan and CPF refund.</li>' : '') +
        (a.beneath && a.beneath.sell && a.beneath.sell.highest ? '<li>Selling first, you could afford up to ' + $r(a.beneath.sell.highest) + '.</li>' : '') +
        (a.estimate ? '<li>Payment dates aren’t checked for a new launch until you add monthly savings. <a href="../payment-planner/" data-f3-pay>See the payments</a>.</li>' : '') + '</ul>';
      if (a.quote) {
        const Q = a.quote, ok = Q.zone !== 'over';
        html += '<div class="f3-quote ' + (ok ? 'ok' : 'over') + '"><p><b>' + $(Q.price) + ':</b> ' + (ok ? (Q.zone === 'tight' ? 'within your budget, but tight.' : 'within your budget.') : Q.projected ? 'covered in total, but ' + $(Q.firstAmt || 0) + ' short when ' + esc(String(Q.firstCause || 'a payment').toLowerCase()) + ' is due.' : '<b>' + $(Q.gap) + ' short</b>' + (Q.cashShort > 0.5 ? ', of which ' + $(Q.cashShort) + ' must be cash.' : '.')) + '</p>' +
          '<p class="f3-fine">Loan ' + $(Q.loan) + ' · ' + $(Q.monthly) + ' a month · cash ' + $(Q.cashNeed) + ' · CPF ' + $(Q.cpfUsed) + '</p>' + (Q.fixes && Q.fixes.length ? '<p class="f3-fine">' + Q.fixes.map((f) => (f.kind === 'price' ? 'A price of ' + $(f.to) + ' fits' : 'About ' + $(f.add) + ' more cash would make it fit')).join('. ') + '.</p>' : '') + '</div>';
      }
      html += '<div class="f3-cta"><a class="gw-btn pri" href="../what-can-i-buy/" data-pa-explore data-gw-go="what-can-i-buy">Explore homes within my budget</a><a class="gw-btn" href="../payment-planner/' + (journey ? '?j=1' : '') + '" data-f3-pay data-gw-go="fin3-pay">Plan the payments</a></div><p class="f3-fine">An estimate from your figures, not a bank approval.</p>';
      out.innerHTML = html;
      $$('[data-f3-pay]', out).forEach((x) => x.addEventListener('click', () => { const s = ST.get() || { raw: {} }; s.raw.pkind = st.akind === 'completed' ? 'completed' : 'new'; if (!(mv(s.raw.price) > 0)) s.raw.price = Math.round(a.budget).toLocaleString('en-US'); ST.set(s); }));
      const ex = out.querySelector('[data-pa-explore]'); if (ex) ex.addEventListener('click', () => { if (pendingHand) { try { root.sessionStorage.setItem('kpt.handoff', JSON.stringify(pendingHand)); } catch (e) { /* ignore */ } } });
      handoff(a, st);
      try { root.sessionStorage.setItem('gw.ans.v1', JSON.stringify({ v: 3, home: st.homes >= 1 ? (st.plan === 'sell' ? 'sell' : 'keep') : 'none' })); } catch (e) { /* ignore */ }
      setBar('<span>Budget about <b>' + $r(a.budget) + '</b> · ' + $(t.monthly) + '/mo</span>');
    }
    // the budget goes on to Budget Search only when the visitor asks to explore (or, on the journey, as it changes), in this tab only
    function handoff(a, st) {
      pendingHand = null;
      try {
        const S1 = root.sessionStorage, old = (() => { try { return JSON.parse(S1.getItem('kpt.handoff')); } catch (e) { return null; } })();
        if (!a || a.state !== 'ok') { if (journey && old && old.from === 'planner') S1.removeItem('kpt.handoff'); return; }
        const ages = st.p.filter((x, k) => k < st.n && typeof x.age === 'number').map((x) => x.age);
        const h = { v: 1, from: 'planner', state: 'ok', budget: { low: a.budget, high: a.budget, single: true }, maxAge: ages.length ? Math.max.apply(null, ages) : null, src: null, j: journey ? 1 : 0 };
        if (old && old.from === 'planner' && !old.edited && old.budget && old.budget.high === h.budget.high) { if (old.find) h.find = old.find; if (old.find2) h.find2 = old.find2; }
        if (journey) S1.setItem('kpt.handoff', JSON.stringify(h)); else pendingHand = h;
      } catch (e) { /* storage unavailable */ }
    }


    // the first two payments and when they fall due: the schedule's own events (with no date yet, counted from the option)
    const SHORT = { otp: 'Booking fee', snp: 'S&P signing', option: 'Option fee', exercise: 'Exercising the option', bsd: 'Stamp duty', absd: 'ABSD', completion: 'Completion' };
    // V3.6 (Ken's audit, 26 Oct): what the buyer prepares at each stage, from the schedule's own events. The buyer's down payment (price less the loan)
    // is paid first, stage by stage; the stamp duty falls within 14 days of the S&P (or the exercise); the bank pays the rest. Nothing is recalculated:
    // the amounts are the schedule's, split at the point the down payment runs out, and they must add up to the card's own totals (else the old list shows).
    function stagesOf(st, c) {
      const dated = !st.noDate && !!st.otp, s = F.schedule(dated ? st : Object.assign({}, st, { noDate: true }));
      if (!s.ok || !s.events || !s.events.length) return null;
      const ev = s.events.filter((e) => e.type === 'pay'), d0 = Date.parse(ev[0].date), buc = F.engineKind(st.pkind) !== 'completed';
      const when = (e) => { if (dated) return day(e.date); const w = Math.round((Date.parse(e.date) - d0) / 6048e5); return w <= 0 ? 'On the option' : w + ' weeks after'; };
      let left = c.down, cashLeft = c.cashMin + (c.cov || 0), bank = 0, bankFrom = null; const rows = [], duty = [];
      ev.forEach((e) => {
        if (e.id === 'bsd' || e.id === 'absd') { duty.push(e); return; }
        const mine = Math.min(e.amount, Math.max(0, left)); left -= mine;
        if (mine > 0.5) { const cash = Math.min(mine, Math.max(0, cashLeft)); cashLeft -= cash; rows.push({ e: e, amt: mine, part: mine < e.amount - 0.5, cash: cash }); }
        if (e.amount - mine > 0.5) { bank += e.amount - mine; if (!bankFrom) bankFrom = e; }
      });
      const dutyAmt = duty.reduce((a, e) => a + e.amount, 0), mineTot = rows.reduce((a, r) => a + r.amt, 0);
      return { rows: rows, duty: duty, dutyAmt: dutyAmt, bank: bank, bankFrom: bankFrom, buc: buc, when: when, dated: dated, first: ev[0], total: mineTot + dutyAmt, ok: Math.abs(mineTot - c.down) < 1 && Math.abs(bank - c.loan) < 1 && Math.abs(dutyAmt - c.duty) < 1 };
    }
    root.__f3Stages = () => (view && view.tool === 'cost' ? stagesOf(view.st, view.c) : null);
    root.__f3Plan = () => (view && view.tool === 'cost' ? planOf(view.st, view.c) : null);
    const STAGE = { otp: 'Booking fee', snp: 'At the S&P', option: 'Option fee', exercise: 'Exercising the option', foundation: 'Foundation stage', frame: 'Framework stage', walls: 'Walls stage', roof: 'Roofing stage', fittings: 'Fittings stage', roads: 'Roads and drains stage', top: 'At TOP', csc: 'At CSC', completion: 'At completion' };
    const BUILD_IDS = ['foundation', 'frame', 'walls', 'roof', 'fittings', 'roads', 'top', 'csc'];
    // V3.7 (Ken, 27 Oct 2026): what the buyer prepares at each stage, from the payment schedule (the source of truth): the buyer's down payment
    // is paid first, stage by stage, then the bank. A new launch or new EC: Booking · S&P and stamp duty (the upfront sum) · During construction · the bank.
    // A completed home: Option and exercise · Stamp duty · Completion · the bank. No percentage is assumed here: every amount is the schedule's.
    function planOf(st, c) {
      const g = stagesOf(st, c); if (!g || !g.ok) return null;
      const wk = (e) => Math.max(0, Math.round((Date.parse(e.date) - Date.parse(g.first.date)) / 6048e5));
      const src = (r) => (r.cash >= r.amt - 0.5 ? 'cash' : r.cash > 0.5 ? $(r.cash) + ' cash, the rest cash or CPF' : 'cash or CPF');
      let firstBuild = true;
      const whenOf = (e) => {
        if (BUILD_IDS.indexOf(e.id) >= 0) { const t = firstBuild ? (g.dated ? 'As the developer calls it, from ' + day(e.date) : 'As the developer calls it, from about ' + wk(e) + ' weeks') : 'As the developer calls it'; firstBuild = false; return t; }
        if (g.dated) return (e.id === 'otp' || e.id === 'option' ? 'On ' : 'By ') + day(e.date);
        if (e.id === 'otp' || e.id === 'option') return 'On the option';
        if (e.id === 'snp' || e.id === 'exercise') return 'Within ' + wk(e) + ' weeks of the option';
        return 'About ' + wk(e) + ' weeks after the option';
      };
      // the same timing, short, for the printed sheet's narrow "when" column
      let firstShort = true;
      const shortOf = (e) => { if (g.dated) return day(e.date); if (e.id === 'otp' || e.id === 'option') return 'On the option'; if (e.id === 'snp' || e.id === 'exercise') return 'Within ' + wk(e) + ' weeks';
        if (BUILD_IDS.indexOf(e.id) >= 0) { const t = firstShort ? 'From ' + wk(e) + ' weeks' : 'As called'; firstShort = false; return t; } return '≈ ' + wk(e) + ' weeks'; };
      const pay = (r) => ({ id: r.e.id, short: shortOf(r.e), label: !g.buc && r.e.id === 'completion' ? 'Balance at completion' : (STAGE[r.e.id] || r.e.label) + (r.part ? ', your share' : ''), pct: r.part ? '' : (r.e.pct ? Math.round(r.e.pct * 100) + '%' : ''), amt: r.amt, when: whenOf(r.e), src: src(r) + (r.part ? '; the bank pays the rest' : '') });
      const dutyWhen = (e) => (g.dated ? 'By ' + day(e.date) : 'Within 14 days of ' + (g.buc ? 'signing the S&P' : 'exercising the option'));
      const duty = g.duty.map((e) => ({ id: e.id, short: g.dated ? day(e.date) : '14 days after ' + (g.buc ? 'S&P' : 'exercise'), label: e.id === 'absd' ? 'ABSD' : 'Buyer’s stamp duty', pct: e.id === 'absd' ? Math.round(c.absdRate * 100) + '%' : '', amt: e.amount, when: dutyWhen(e), src: e.id === 'absd' ? 'usually cash first' : 'usually cash first; CPF may reimburse eligible duty' }));
      const P = g.rows.map(pay), sum = (a) => a.reduce((x, r) => x + r.amt, 0), groups = [];
      if (g.buc) {
        const book = P.filter((r) => r.id === 'otp'), snp = P.filter((r) => r.id === 'snp'), built = P.filter((r) => BUILD_IDS.indexOf(r.id) >= 0);
        if (book.length) groups.push({ key: 'booking', title: 'Booking', rows: book });
        groups.push({ key: 'snp', title: 'S&P and stamp duty', rows: snp.concat(duty) });
        const upfront = sum(book) + sum(snp) + sum(duty);
        groups[groups.length - 1].sub = { label: 'Upfront, in all', amt: upfront };
        if (built.length) groups.push({ key: 'build', title: 'During construction', rows: built });
        const se = g.rows.filter((r) => r.e.id === 'snp')[0], upWeeks = se ? wk(se.e) + 2 : 10;   // the S&P, then stamp duty within 14 days of it
        return { buc: true, groups: groups, upfront: upfront, later: sum(built), total: g.total, bank: g.bank, dated: g.dated, dutyBy: duty.length ? duty[duty.length - 1].when : '', upWeeks: upWeeks, g: g };
      }
      const opt = P.filter((r) => r.id === 'option' || r.id === 'exercise'), rest = P.filter((r) => !(r.id === 'option' || r.id === 'exercise'));
      if (opt.length) groups.push({ key: 'option', title: 'Option and exercise', rows: opt });
      if (duty.length) groups.push({ key: 'duty', title: 'Stamp duty', rows: duty });
      if (rest.length) groups.push({ key: 'completion', title: 'Completion', rows: rest });
      return { buc: false, groups: groups, upfront: sum(opt) + sum(duty), later: sum(rest), total: g.total, bank: g.bank, dated: g.dated, g: g };
    }
    function stagesHtml(st, c) {
      const pl = planOf(st, c); if (!pl) return nextHtml(st);
      // each stage: a heading and its amount on one line; when it falls and how it is paid below, across the full width (no narrow columns)
      const sr = (r, cls) => '<div class="f3-sr' + (cls ? ' ' + cls : '') + '"><div class="f3-sr1"><span class="f3-sl">' + r.label + (r.pct ? ' <em>' + r.pct + '</em>' : '') + '</span><b>' + (r.v || $(r.amt)) + '</b></div>' + (r.when || r.src ? '<p class="f3-sw">' + [r.when, r.src].filter(Boolean).join(' · ') + '</p>' : '') + '</div>';
      let h = '';
      pl.groups.forEach((gr) => { h += '<div class="f3-sg" data-sg="' + gr.key + '"><p class="f3-sgt">' + gr.title + '</p>' + gr.rows.map((r) => sr(r)).join('') + (gr.sub ? sr({ label: gr.sub.label, amt: gr.sub.amt }, 'f3-ssub') : '') + '</div>'; });
      h += sr({ label: 'From you, in all', amt: pl.total }, 'f3-stot');
      if (pl.bank > 0.5) h += '<div class="f3-sg" data-sg="bank"><p class="f3-sgt">Bank loan</p>' + sr({ label: 'The bank pays', amt: pl.bank, when: pl.buc ? 'Stage by stage, as each is called' : 'At completion', src: '' }) + sr({ label: 'Then each month', v: $(c.monthly) + '<small>/mo</small>', when: pl.buc ? 'Once fully drawn; less while it builds up' : 'After completion', src: '' }) + '</div>';
      return '<div class="f3-next f3-stages" data-stages><div class="f3-nh2"><span>When you pay it</span><a href="#" data-to-sched>All payments</a></div>' + h + '</div>';
    }
    function nextHtml(st) {
      const dated = !st.noDate && !!st.otp, s = F.schedule(dated ? st : Object.assign({}, st, { noDate: true }));
      if (!s.ok || !s.events || !s.events.length) return '';
      const ev = s.events.filter((e) => e.type === 'pay').slice(0, 2), d0 = Date.parse(ev[0].date);
      const when = (e, i) => { if (dated) return (i ? 'by ' : '') + day(e.date); const w = Math.round((Date.parse(e.date) - d0) / 6048e5); return w <= 0 ? 'on the option' : w + ' weeks after the option'; };
      const row = (e, i) => '<div class="f3-nr"><span class="f3-nn">' + esc(SHORT[e.id] || e.label) + (e.pct ? ' <em>' + Math.round(e.pct * 100) + '%</em>' : '') + '</span><span class="f3-nw">' + when(e, i) + '</span><b>' + $(e.amount) + '</b></div>';
      return '<div class="f3-next"><div class="f3-nh2"><span>Next payments</span><a href="#" data-to-sched>All payments</a></div>' + ev.map(row).join('') + '</div>';
    }
    // All payments: the option date, the full schedule, the funding check and Ask Ken stay closed until asked for
    const allOpen = () => { const a = q('[data-allpay]'); return !!a && !a.hidden; };
    function allPay(o) { const a = q('[data-allpay]'); if (!a) return; a.hidden = !o; $$('[data-to-sched]').forEach((x) => { x.textContent = o ? 'Hide payments' : 'All payments'; x.classList.toggle('up', o); x.setAttribute('aria-expanded', String(o)); }); }
    root.__f3AllPay = allPay;
    // the judgement on the cost card: which hurdle most buyers meet at this price (upfront, or the income the instalment needs), and that stamp duty is in the cash
    function judgeCost(st, c, inc, mine, up) { const t = judgeCostText(st, c, inc, mine, up); return t ? '<p class="f3-fact">' + t + '</p>' : ''; }
    function judgeCostText(st, c, inc, mine, up) {
      const duty = 'Stamp duty is included.';
      if (mine && c.aboveIncome) return 'Your income is the limit here: a bank would lend about ' + $r(c.incomeCap) + ', so the rest needs more cash or a co-borrower. ' + duty;
      if (!inc || inc.state !== 'ok') return '';
      const yearsOfIncome = up / (inc.income * 12);
      return (yearsOfIncome >= 3 ? 'At this price the upfront sum is the usual hurdle, not the instalment.' : 'At this price the income needed is the usual hurdle, not the upfront sum.') + ' ' + duty;
    }
    /* ---- Payments and dates ---- */
    const fundD = q('[data-fund]'), fundOut = q('[data-fund-out]'), scnD = q('[data-scn]');
    let lastF = null;
    function paintPay(st) {
      const und = !!st.noDate || !st.otp;
      if (P && P.setUndated) P.setUndated(und, F.engineKind(st.pkind));
      const sched = q('[data-sched]'), bd = q('[data-bd]'), cmp = q('[data-cmp]'), lh = q('[data-loan-hint]'), ob = q('.f3-opts [data-open-borrow]');
      const quiet = () => { view = null; pdfBtn(false); const sec0 = q('[data-schsec]'); if (sec0) sec0.hidden = true; [bd, cmp].forEach((x) => { x.hidden = true; }); if (ob) ob.hidden = true; if (lh) lh.textContent = ''; setBar(''); sched.innerHTML = ''; if (scnD) scnD.hidden = true; };
      if (isHdb(st)) { paintHdb(st, quiet); return; }
      const c = F.cost(st); paintChips(st, c);
      if (c.state !== 'ok') {
        out.innerHTML = c.state === 'need' ? '<p class="f3-eb">Type a price to begin</p>' + row('Cash you’ll need', '<span class="f3-dash">—</span>', 'Stamp duty included') + row('CPF used', '<span class="f3-dash">—</span>', '') + row('Monthly instalment', '<span class="f3-dash">—</span>', 'On the bank loan') + row('Income needed', '<span class="f3-dash">—</span>', 'Household, before CPF')
          : '<p class="f3-eb">Check the figures</p><p class="f3-note">' + esc(((c.errors || [])[0] || {}).text || 'Check the figures marked.') + '</p>';
        quiet(); fundOut.innerHTML = '<p class="f3-fine">Enter the price above first.</p>'; return;
      }
      done();
      if (lh) lh.innerHTML = 'Up to ' + $(c.ruleLoan) + ' (' + pc(c.ltv) + ' of the price' + (c.homeLoans ? ', with ' + (c.homeLoans === 1 ? 'a home loan' : 'two home loans') + ' already' : '') + ')' + (c.overLimit ? ' · <b class="f3-warn">above the limit</b>' : '') + '. Leave it blank for the most allowed.';
      const k = q('[data-k="loanAmt"]'); if (k) k.placeholder = 'up to ' + Math.round(c.ruleLoan).toLocaleString('en-US');
      // ---- the three answers ----
      const up = c.down + c.duty, minCash = c.cashMin + c.cov + c.duty, withCpf = st.cpf > 0;
      const cashSub = 'Includes the <b>' + $(c.cashMin) + '</b> minimum cash down payment <span class="f3-tag">MAS rule</span>';
      const cpfSub = withCpf ? (c.cpfLeft > 0.5 ? $(c.cpfLeft) + ' of it stays in CPF' : '') : (c.flex > 0.5 ? 'If you have it, CPF can pay up to ' + $(c.flex) + ' of this' + (st.homes >= 1 ? '; owning another home, only CPF above a set-aside can be used' : '') : '');
      const dutyTxt = '<span data-duty-line>' + (c.absd > 0 ? 'and ' + $(c.bsd) + ' BSD + ' + $(c.absd) + ' ABSD ' + Math.round(c.absdRate * 100) + '%' : 'and ' + $(c.duty) + ' stamp duty') + ', usually cash first; CPF may reimburse eligible duty</span>';
      const inc = F.incomeNeeded(st, c), mine = st.p.slice(0, st.n).some((x) => x.fixed > 0 || x.variable > 0);
      let incRow = '', incBasis = '';
      if (inc && inc.state === 'ok') {
        const basis = 'Before CPF' + (inc.debts > 0 ? ', with ' + $(inc.debts) + '/mo of loans' : ', no other loans') + (c.ratePct < 4 ? ', tested at 4%' : '') + (inc.ageAssumed ? ', loan to 65' : '') + (inc.rule === 'msr' ? ', EC cap 30% of income' : '');
        incBasis = basis;
        incRow = row('Income needed', '<span class="f3-approx">≈</span> ' + r100(inc.income) + '<small>/mth</small>', mine ? (c.aboveIncome ? '<b class="f3-warn">Your income supports about ' + $r(c.incomeCap) + '</b>, so a bank would lend less' : 'Your income covers it') : basis);
      } else if (inc && inc.state === 'out') incRow = row('Income needed', '<span class="f3-dash">—</span>', 'More than an income can support at this age and tenure');
      const alerts = [];
      if (c.overLimit) alerts.push('Above the loan limit: banks lend up to ' + $(c.ruleLoan) + ' here (' + pc(c.ltv) + ' of the price), so that is used.');
      if (st.years && c.years < st.years) alerts.push('You chose ' + yrs(st.years) + '. Most banks end a loan by age ' + root.GW_RULES.bankLtv.maturityAge + ', so ' + yrs(c.years) + ' is used here. MAS allows up to ' + root.GW_RULES.bankLtv.maxTenure.private + ' years for a private home; a bank may decide differently.');
      if (c.lower) { const c0 = F.cost(Object.assign({}, st, { years: null })), more = c0.state === 'ok' && !c0.lower ? (c.down + c.duty) - (c0.down + c0.duty) : 0;
        alerts.push('A lower loan limit applies because ' + (c.lowerWhy === 'age' ? 'the loan runs past age 65' : 'the tenure is over 30 years') + ': banks may lend ' + pc(c.ltv) + ' of the price instead of ' + pc(c0.state === 'ok' ? c0.ltv : 0.75) + ', and at least ' + pc(c.minCash) + ' must be cash' + (more > 0.5 ? '. That is ' + $(more) + ' more from you' + (F.engineKind(st.pkind) !== 'completed' ? ', most of it during construction,' : '') + ' than with ' + yrs(c0.years) + '.' : '.')); }
      if (st.homes >= 1 && st.cpf > 0) alerts.push('While you own another home, only CPF above a set-aside can be used. <button type="button" class="f3-lnk" data-open-fund>Check it</button>');
      // V3.7: a new launch leads with what is needed upfront (booking, the S&P and stamp duty, from the schedule), then what follows during construction
      const pl = planOf(st, c), bucUp = pl && pl.buc && pl.later > 0.5;
      const upRow = bucUp ? row('Needed upfront', '<span data-answer data-upfront>' + $(pl.upfront) + '</span>', 'Booking fee, the S&P payment and <span data-duty-line>' + (c.absd > 0 ? $(c.bsd) + ' BSD + ' + $(c.absd) + ' ABSD ' + Math.round(c.absdRate * 100) + '%' : $(c.duty) + ' stamp duty') + '</span>, ' + (pl.dated ? pl.dutyBy.replace(/^By/, 'by') : 'within about ' + pl.upWeeks + ' weeks of booking') + '<br><span data-later>Then <b>' + $(pl.later) + '</b> during construction · <b>' + $(pl.total) + '</b> from you in all</span>', 'f3-ar1') : '';
      out.innerHTML = '<p class="f3-eb">For a ' + $(c.price) + ' ' + KN[st.pkind] + '</p>' + upRow +
        row('Cash you’ll need', bucUp ? $(c.cash) : '<span data-answer>' + $(c.cash) + '</span>', bucUp ? 'In all, with stamp duty. ' + cashSub : cashSub + '<br>' + dutyTxt, bucUp ? 'f3-ar2' : 'f3-ar1') +
        row('CPF used', $(c.cpfUsed), cpfSub, 'f3-ar2') +
        row('Monthly instalment', $(c.monthly), 'On a ' + $(c.loan) + ' loan · ' + yrs(c.years) + ' at ' + c.ratePct + '%' + (F.engineKind(st.pkind) !== 'completed' ? ', once fully drawn' : '') + INDIC) + incRow + judgeCost(st, c, inc, mine, up) +
        (alerts.length ? '<ul class="f3-alert">' + alerts.map((x) => '<li>' + x + '</li>').join('') + '</ul>' : '') + stagesHtml(st, c);
      $$('[data-open-fund]', out).forEach((x) => x.addEventListener('click', () => { allPay(true); fundD.open = true; try { fundD.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* ignore */ } }));
      $$('[data-to-sched]', out).forEach((x) => { x.textContent = allOpen() ? 'Hide payments' : 'All payments'; x.classList.toggle('up', allOpen()); x.setAttribute('aria-expanded', String(allOpen())); x.addEventListener('click', (e) => { e.preventDefault(); const o = !allOpen(); allPay(o); if (o) { try { q('[data-allpay]').scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (er) { /* ignore */ } } }); });
      bd.hidden = false; cmp.hidden = false; if (ob) ob.hidden = false;
      q('[data-bd-sum]').textContent = 'Where the ' + $(up) + ' goes';
      { const ln = (t, ctx, v, cls) => '<div class="f3-rl' + (cls ? ' ' + cls : '') + '"><div><span>' + t + '</span>' + (ctx ? '<small>' + ctx + '</small>' : '') + '</div><b>' + v + '</b></div>';
        q('[data-bd-out]').innerHTML = '<div class="f3-rcpt">' + ln('Cash, at least', pc(c.minCash) + ' of the price. MAS rule.', $(c.cashMin)) + (c.cov > 0 ? ln('Above the valuation', 'The bank lends on the lower of price and valuation; the gap is cash.', $(c.cov)) : '') +
          ln('Cash or CPF', pc(c.flex / c.price) + ' of the price', $(c.flex)) + ln('Buyer’s stamp duty', 'Usually paid in cash first; CPF may reimburse it if eligible, or pay it directly for some purchases under construction', $(c.bsd)) + (c.absd > 0 ? ln('ABSD ' + Math.round(c.absdRate * 100) + '%', 'Additional buyer’s stamp duty; usually paid in cash first', $(c.absd)) : '') +
          ln('From you, cash and CPF', 'Cash ' + $(c.cash) + ' + CPF ' + $(c.cpfUsed), $(up), 'tot') + ln('Bank loan', pc(c.loan / c.price) + ' of the price', $(c.loan)) + '</div><p class="f3-fine">Legal and valuation fees are not included.</p>'; }
      paintCmp(st, c);
      setBar(bucUp ? '<span class="f3-bm"><span class="k">Needed upfront</span><b>' + $(pl.upfront) + '</b><span class="s">then ' + $(pl.later) + ' · ' + $(c.monthly) + '/mo</span></span>' : '<span class="f3-bm"><span class="k">Cash you’ll need</span><b>' + $(c.cash) + '</b><span class="s">' + $(c.monthly) + '/mo · CPF ' + $(c.cpfUsed) + '</span></span>');
      // ---- the payment schedule: every payment and when it is due (counted from the option until a date is given) ----
      const s = F.schedule(Object.assign({}, st, { noDate: und }));
      const sec = q('[data-schsec]'); if (sec) sec.hidden = !s.ok; const sn = q('[data-sch-note]'); if (sn) sn.textContent = (und ? 'Add the option date for exact dates.' : 'From the option on ' + day(st.otp) + '.') + ' You pay the first ' + $(c.down) + ' of these (your down payment) and the stamp duty; the bank pays the remaining ' + $(c.loan) + ' as each stage falls due.';
      sched.innerHTML = s.ok ? (P ? P.scheduleTableHtml(s) : '') + '<p class="f3-fine">' + (F.engineKind(st.pkind) === 'completed' ? 'Option terms can differ; your option sets the actual amounts and dates.' : 'Construction stages fall due as building progresses; the developer’s notice sets each date.') + '</p>' : '';
      view = { tool: 'cost', st: st, c: c, inc: inc, mine: mine, up: up, judge: judgeCostText(st, c, inc, mine, up), s: s, und: und, incBasis: incBasis, pl: pl, bucUp: bucUp };
      pdfBtn(true);
      paintFund(st);
    }
    // V3.7 (Ken, 27 Oct 2026): an HDB flat, resale or new, answered from GW_FIN3.costHdb (GW_CALC.flatCheck, stampDuty and mortgage; GW_SCHEDULE.hdb).
    // The stages follow HDB's own steps; the buyer's share (the down payment and stamp duty) and the loan reconcile with the engine, or the stages are not shown.
    function hdbPlanOf(st, c) {
      const by = (id) => c.events.filter((e) => e.id === id)[0], groups = [], loanName = c.lender === 'hdb' ? 'The HDB loan' : 'The bank loan';
      const duty = [{ label: 'Buyer’s stamp duty', amt: c.bsd }].concat(c.absd > 0 ? [{ label: 'ABSD', pct: Math.round(c.absdRate * 100) + '%', amt: c.absd }] : []);
      if (c.flat === 'resale') {
        const o = by('option'), x = by('exercise'); if (!o || !x) return null;
        const fees = Math.min(c.down, o.amount + x.amount), rest = c.down - fees, cashRest = Math.max(0, c.cashOnly - fees);
        groups.push({ key: 'otp', title: 'Option to Purchase', rows: [{ label: 'Option fee', v: 'up to ' + $(o.amount), amt: 0, when: 'When the seller grants the option', short: 'On the option', src: 'cash; part of the price' }, { label: 'Exercise fee', v: 'up to ' + $(x.amount), amt: 0, when: o ? x.when : '', short: 'Within 21 days', src: 'cash; part of the price' }] });
        groups.push({ key: 'down', title: 'After HDB accepts the application', rows: [{ label: 'Rest of the down payment', amt: rest, when: 'After you endorse HDB’s resale documents, by the date HDB sets', short: 'As HDB sets', src: cashRest > 0.5 ? $(cashRest) + ' cash, the rest cash or CPF' : 'cash or CPF' }]
          .concat(duty.map((d) => Object.assign({ when: 'Paid through HDB, by completion', short: 'By completion', src: 'from your CPF unless you ask to pay in cash; any shortfall in cash at completion' }, d))) });
        groups[1].sub = { label: 'From you, in all', amt: c.down + c.duty };
        const total = fees + rest + c.duty;
        return { groups: groups, total: total, loanName: loanName, loanWhen: 'At the completion appointment, about ' + root.GW_RULES.hdbPayments.resale.completionWeeks + ' weeks after HDB accepts the application', loanShort: 'At completion', fees: fees, ok: Math.abs(fees + rest - c.down) < 1 && Math.abs(c.down + c.loan - c.price) < 1, signing: null };
      }
      // HDB: the booking fee (by flat size) is part of the down payment; it is paid when booking and deducted from what is payable at the Agreement for Lease
      const dp = by('downpayment'); if (!dp) return null;
      const afl = Math.min(c.down, dp.amount), fee = Math.min(c.bookingFee || 0, afl), aflNet = afl - fee, keys = c.down - afl, aflCash = Math.min(afl, c.cashOnly);
      const ROOM = { 2: '2-room Flexi', 3: '3-room', 4: '4-room or bigger' };
      groups.push({ key: 'book', title: 'Booking', rows: [{ label: 'Booking fee', pct: ROOM[c.room] || '', amt: fee, when: 'When you book your flat', short: 'At booking', src: 'part of the down payment, not extra' }] });
      groups.push({ key: 'afl', title: 'Agreement for Lease', rows: [{ label: 'Rest of the ' + Math.round(dp.pct * 100) + '% down payment', amt: aflNet, when: 'When you sign the Agreement for Lease: ' + $(afl) + ' less the ' + $(fee) + ' booking fee', short: 'At signing', src: aflCash > 0.5 ? 'at least ' + $(aflCash) + ' of the ' + Math.round(dp.pct * 100) + '% in cash, the rest cash or CPF' : 'cash or CPF' }]
        .concat(duty.map((d) => Object.assign({ when: 'When you sign the Agreement for Lease', short: 'At signing', src: 'cash or CPF' }, d))) });
      groups[1].sub = { label: 'Payable at signing', amt: aflNet + c.duty };
      if (keys > 0.5) groups.push({ key: 'keys', title: 'Key collection', rows: [{ label: 'Rest of the down payment', pct: Math.round(keys / c.price * 100) + '%', amt: keys, when: 'Before you collect your keys, when HDB gives the date', short: 'At key collection', src: 'cash or CPF' }] });
      return { groups: groups, total: c.down + c.duty, loanName: loanName, loanWhen: 'When you collect your keys', loanShort: 'At key collection', fee: fee, atSigning: aflNet + c.duty, signing: fee + aflNet + c.duty, keys: keys, ok: Math.abs(fee + aflNet + keys - c.down) < 1 && Math.abs(c.down + c.loan - c.price) < 1 };
    }
    function paintHdb(st, quiet) {
      const c = F.costHdb(st); paintChips(st, c);
      const fineHtml = '<p class="f3-fine">HDB checks your eligibility, the income ceiling and the flat’s lease; they are not checked here. Any CPF housing grant counts as CPF. Legal and HDB fees are not included.</p>';
      if (c.state !== 'ok') {
        out.innerHTML = c.state === 'need' ? '<p class="f3-eb">Type a price to begin</p>' + row('Cash you’ll need', '<span class="f3-dash">—</span>', 'Stamp duty included') + row('CPF used', '<span class="f3-dash">—</span>', '') + row('Monthly instalment', '<span class="f3-dash">—</span>', 'On the loan') : '<p class="f3-eb">Check the figures</p><p class="f3-note">' + esc(((c.errors || [])[0] || {}).text || 'Check the figures marked.') + '</p>';
        quiet(); fundOut.innerHTML = ''; return;
      }
      done(); quiet(); fundOut.innerHTML = '';
      const lh = q('[data-loan-hint]'); if (lh) lh.innerHTML = 'Up to ' + $(c.ruleLoan) + ' (' + pc(c.ltv) + ' of the ' + (c.cov > 0 ? 'valuation' : 'price') + ')' + (c.overLimit ? ' · <b class="f3-warn">above the limit</b>' : '') + '. Leave it blank for the most allowed.';
      const pl = hdbPlanOf(st, c), lname = c.lender === 'hdb' ? 'HDB loan' : 'bank loan', withCpf = st.cpf > 0;
      const cashSub = 'Includes ' + (c.absd > 0 ? $(c.bsd) + ' BSD + ' + $(c.absd) + ' ABSD ' + Math.round(c.absdRate * 100) + '%' : $(c.duty) + ' stamp duty') + ', paid from CPF by default.<br>' +
        (c.lender === 'hdb' ? 'No minimum cash with an HDB loan' + (c.cov > 0 ? ', except the <b>' + $(c.cov) + '</b> above the valuation' : '') + '; CPF can pay all of it.' : 'At least <b>' + $(c.cashMin) + '</b> in cash (' + pc(c.minCash) + ' with a bank loan)' + (c.cov > 0 ? ', and the <b>' + $(c.cov) + '</b> above the valuation' : '') + '.');
      const cpfSub = withCpf ? (c.cpfLeft > 0.5 ? $(c.cpfLeft) + ' of it stays in CPF' : '') : (c.flex > 0.5 ? 'If you have it, CPF can pay up to ' + $(c.flex) + ' of this' : '');
      const bto = c.flat === 'bto', signRow = bto && pl && pl.ok && pl.keys > 0.5 ? row('Needed by signing', '<span data-answer data-upfront>' + $(pl.signing) + '</span>', 'The ' + $(pl.fee) + ' booking fee, then <b data-at-signing>' + $(pl.atSigning) + '</b> payable at the Agreement for Lease (the rest of the down payment and ' + $(c.duty) + ' stamp duty)<br><span data-later>Then <b>' + $(pl.keys) + '</b> at key collection · <b>' + $(pl.total) + '</b> from you in all</span>', 'f3-ar1') : '';
      const alerts = [];
      if (c.overLimit) alerts.push('Above the loan limit: up to ' + $(c.ruleLoan) + ' here (' + pc(c.ltv) + '), so that is used.');
      if (c.capped) alerts.push('You chose ' + yrs(st.years) + '. ' + (c.lender === 'hdb' ? 'An HDB loan runs up to ' + root.GW_RULES.hdbLoan.maxTenureYears + ' years and ends by age ' + root.GW_RULES.hdbLoan.endAge : 'Most banks end a loan by age ' + root.GW_RULES.bankLtv.maturityAge) + ', so ' + yrs(c.years) + ' is used here.');
      if (c.lower) alerts.push('A lower loan limit applies because the bank loan runs past age 65 or over 25 years: ' + pc(c.ltv) + ' of the price, and at least ' + pc(c.minCash) + ' in cash.');
      if (c.lender === 'hdb' && c.loan > 0.5) alerts.push('With an HDB loan, HDB expects you to use your CPF savings above $' + root.GW_RULES.hdbLoan.oaRetain.toLocaleString('en-US') + ' first, so the loan can be smaller than this.' + (c.flat === 'resale' ? ' A lease that doesn’t cover the youngest buyer to age 95 also lowers it.' : ''));
      const incRow = c.loan > 0.5 ? row('Income needed', '<span class="f3-approx">≈</span> ' + r100(c.incomeMsr) + '<small>/mth</small>', 'Household, before CPF; repayments within 30% of income (MSR), tested at ' + Math.round(c.stressRate * 1000) / 10 + '%') : '';
      out.innerHTML = '<p class="f3-eb">For a ' + $(c.price) + ' ' + KN[st.pkind] + '</p>' + signRow +
        row('Cash you’ll need', signRow ? $(c.cash) : '<span data-answer>' + $(c.cash) + '</span>', cashSub, signRow ? 'f3-ar2' : 'f3-ar1') +
        row('CPF used', $(c.cpfUsed), cpfSub, 'f3-ar2') +
        (c.loan > 0.5 ? row('Monthly instalment', $(c.monthly), 'On a ' + $(c.loan) + ' ' + lname + ' · ' + yrs(c.years) + ' at ' + c.ratePct + '%' + (bto ? ', from key collection' : '') + INDIC_HDB) : row('Monthly instalment', '$0', 'No loan')) + incRow +
        (alerts.length ? '<ul class="f3-alert">' + alerts.map((x) => '<li>' + x + '</li>').join('') + '</ul>' : '') + (pl && pl.ok ? hdbStagesHtml(pl, c) : '') + fineHtml;
      setBar(signRow ? '<span class="f3-bm"><span class="k">Needed by signing</span><b>' + $(pl.signing) + '</b><span class="s">' + $(pl.atSigning) + ' at signing · then ' + $(pl.keys) + '</span></span>' : '<span class="f3-bm"><span class="k">Cash you’ll need</span><b>' + $(c.cash) + '</b><span class="s">' + $(c.monthly) + '/mo · CPF ' + $(c.cpfUsed) + '</span></span>');
      view = { tool: 'costhdb', st: st, c: c, pl: pl };
      pdfBtn(true);
    }
    function hdbStagesHtml(pl, c) {
      const sr = (r, cls) => '<div class="f3-sr' + (cls ? ' ' + cls : '') + '"><div class="f3-sr1"><span class="f3-sl">' + r.label + (r.pct ? ' <em>' + r.pct + '</em>' : '') + '</span><b>' + (r.v || $(r.amt)) + '</b></div>' + (r.when || r.src ? '<p class="f3-sw">' + [r.when, r.src].filter(Boolean).join(' · ') + '</p>' : '') + '</div>';
      let h = '';
      pl.groups.forEach((gr) => { h += '<div class="f3-sg" data-sg="' + gr.key + '"><p class="f3-sgt">' + gr.title + '</p>' + gr.rows.map((r) => sr(r)).join('') + (gr.sub ? sr({ label: gr.sub.label, amt: gr.sub.amt }, 'f3-ssub') : '') + '</div>'; });
      if (c.flat === 'bto') h += sr({ label: 'From you, in all', amt: pl.total, src: 'Cash and CPF' }, 'f3-stot');
      if (c.loan > 0.5) h += '<div class="f3-sg" data-sg="bank"><p class="f3-sgt">' + (c.lender === 'hdb' ? 'HDB loan' : 'Bank loan') + '</p>' + sr({ label: pl.loanName + ' pays', amt: c.loan, when: pl.loanWhen }) + sr({ label: 'Then each month', v: $(c.monthly) + '<small>/mo</small>', when: yrs(c.years) + ' at ' + c.ratePct + '%' }) + '</div>';
      return '<div class="f3-next f3-stages" data-stages><div class="f3-nh2"><span>When you pay it</span></div>' + h + '</div>';
    }
    function sheetCostHdb() {
      const v = view, c = v.c, st = v.st, pl = v.pl;
      const figures = [{ key: 'cash', label: 'Cash you’ll need', value: SG($(c.cash)), sub: (c.loan > 0 ? 'After the ' + SG($(c.loan)) + ' ' + (c.lender === 'hdb' ? 'HDB' : 'bank') + ' loan, ' : 'With no loan, ') + (c.cpfUsed > 0 ? 'with ' + SG($(c.cpfUsed)) + ' CPF' : 'with no CPF') + '; stamp duty ' + SG($(c.duty)) + ' included' },
        { key: 'monthly', label: 'Monthly instalment', value: SG($(c.monthly)), sub: c.loan > 0 ? 'On a ' + SG($(c.loan)) + ' loan · ' + yrs(c.years) + ' at ' + c.ratePct + '%' : 'No loan' },
        { key: 'income', label: 'Income needed', value: c.loan > 0 ? '≈ ' + SG(r100(c.incomeMsr)) : '—', sub: 'Household, per month · repayments within 30% of income (MSR)' }];
      if (pl && pl.signing && pl.keys > 0.5) figures[0] = { key: 'upfront', label: 'Needed by signing', value: SG($(pl.signing)), sub: 'The ' + SG($(pl.fee)) + ' booking fee, then ' + SG($(pl.atSigning)) + ' payable at the Agreement for Lease. Then ' + SG($(pl.keys)) + ' at key collection; ' + SG($(pl.total)) + ' from you in all (cash ' + SG($(c.cash)) + ', CPF ' + SG($(c.cpfUsed)) + ').' };
      const receipt = [{ label: 'Down payment', sub: pc(c.down / c.price) + ' of the price' + (c.cov > 0 ? ', with ' + SG($(c.cov)) + ' above the valuation' : ''), value: SG($(c.down)) }, { label: 'Buyer’s Stamp Duty', value: SG($(c.bsd)) }]
        .concat(c.absd > 0 ? [{ label: 'ABSD ' + Math.round(c.absdRate * 100) + '%', value: SG($(c.absd)) }] : [])
        .concat([{ key: 'fromyou', label: 'From you, cash and CPF', sub: 'Cash ' + SG($(c.cash)) + ' + CPF ' + SG($(c.cpfUsed)), value: SG($(c.down + c.duty)), cls: 'tot' }, { key: 'loan', label: c.lender === 'hdb' ? 'HDB loan' : 'Bank loan', sub: pc(c.loan / c.price) + ' of the price', value: SG($(c.loan)) }]);
      const groups = pl && pl.ok ? pl.groups.map((gr) => ({ title: gr.title, rows: gr.rows.map((r) => ({ label: r.label + (r.pct ? (c.flat === 'bto' && r.label === 'Booking fee' ? ', ' : ' ') + r.pct : ''), when: r.short || '', value: SG(r.v || $(r.amt)) })).concat(gr.sub ? [{ label: gr.sub.label, when: '', value: SG($(gr.sub.amt)), cls: 'tot' }] : []) }))
        .concat(c.loan > 0.5 ? [{ title: c.lender === 'hdb' ? 'HDB loan' : 'Bank loan', rows: [{ label: pl.loanName + ' pays', when: pl.loanShort, value: SG($(c.loan)) }] }] : []) : [];
      return { tool: 'COST', checked: checkedOn(), question: 'What will this home cost me?', basis: ['For a ' + SG($(c.price)) + ' ' + KN[st.pkind], (st.n === 2 ? 'two buyers' : RN[st.p[0].res] || 'Singapore Citizen') + ', ' + (st.homes === 0 ? 'first home' : 'owns a home'), (c.loan > 0 ? (c.lender === 'hdb' ? 'HDB loan' : 'bank loan') + ' · ' + c.ratePct + '% a year · ' + yrs(c.years) : 'no loan'), c.cpfUsed > 0 ? 'CPF ' + SG($(c.cpfUsed)) : 'no CPF entered'],
        figures: figures, judge: '', left: [{ title: 'Where the ' + SG($(c.down + c.duty)) + ' goes', rows: receipt, note: 'Legal and HDB fees are not included.' }],
        right: [{ title: 'When you pay it', groups: groups, note: (c.flat === 'resale' ? 'The option and exercise fees (up to ' + SG($(pl ? pl.fees : 5000)) + ') are part of the price, paid in cash. ' : 'The booking fee is part of the down payment and is deducted from what is payable at signing. ') + 'HDB sets the dates. Eligibility, grants and the lease are checked by HDB, not here.' }] };
    }
    // compare another price: the same loan share, rate, tenure, CPF and buyers
    function paintCmp(st, c) {
      const o = q('[data-cmp-out]'), p2 = mv(raw.price2); if (!o) return;
      if (!(p2 > 0)) { o.innerHTML = ''; return; }
      const c2 = F.cost(st, { price: p2, loanAmt: c.typed !== null ? Math.round(c.typed * p2 / c.price) : null });
      if (c2.state !== 'ok') { o.innerHTML = ''; return; }
      const row = (k, a, b) => '<tr><th scope="row">' + k + '</th><td>' + a + '</td><td>' + b + '</td></tr>';
      o.innerHTML = '<table class="f3-cmp"><thead><tr><th></th><th scope="col">' + $s(c.price) + '</th><th scope="col">' + $s(c2.price) + '</th></tr></thead><tbody>' + row('Cash you’ll need', $(c.cash), $(c2.cash)) + row('CPF used', $(c.cpfUsed), $(c2.cpfUsed)) + row('Monthly instalment', $(c.monthly), $(c2.monthly)) + row('Bank loan', $(c.loan), $(c2.loan)) + row('Stamp duty', $(c.duty), $(c2.duty)) + '</tbody></table>' + (c.typed !== null ? '<p class="f3-fine">The same share of the price is borrowed.</p>' : '');
    }
    function paintFund(st) {
      if (!fundD || !P) return;
      const f = F.funding(st); lastF = f.ok ? f : null;
      { const cp = q('[data-cpf2]'), ck = f.i && f.i.cpfCheck; if (cp) cp.hidden = !ck; const co = q('[data-cpf2-out]'); if (co) co.textContent = ck && ck.ok ? 'CPF counted: ' + $(f.i.cpf) + (f.i.cpfPlanned > f.i.cpf + 0.5 ? ' of the ' + $(f.i.cpfPlanned) + ' you entered' : '') + ', the OA above the ' + (ck.sumName === 'BRS' ? 'Basic' : 'Full') + ' Retirement Sum (' + $(ck.setAside) + ').' : ''; }
      if (f.needCpf) { fundOut.innerHTML = '<p class="f3-note">You’ll still own a home when you buy, so CPF lets you use only the OA above a set-aside. Add your CPF balances to check it.</p><div class="f3-cta"><button type="button" class="gw-btn" data-go="cpfBal.0.oa">Add CPF balances</button></div>'; if (scnD) scnD.hidden = true; return; }
      if (scnD) scnD.hidden = !f.ok;
      if (!f.ok) { fundOut.innerHTML = f.need ? '<p class="f3-nh">Add each person’s age and income (in “Who is buying”) to check it:</p>' + need(f.need.filter((k) => k.indexOf('p.') === 0)) : '<p class="f3-note">' + esc(((f.engine && f.engine.invalid) || [{}])[0].text || 'Check the figures above.') + '</p>'; return; }
      const r = f.r, i = f.i;
      const v = Object.assign({}, i, { buyers: i.buyers, bors: i.bors, joint: i.bors.length > 1 ? C.borrowers(i.bors) : null });
      const why = f.capped ? 'income' : 'rule';
      fundOut.innerHTML = P.verdictHtml(r, v).replace(/<a class="pl-link"[^>]*>[^<]*<\/a>/, '') + P.sumHtml(r, v, { view: f.capped ? 'income' : 'rule', cap: f.capped, limit: f.limit, why: why }, false) +
        (r.saleUndecided ? '<p class="f3-note">Sale date not decided: no money from the sale is counted. The home still counts for the loan limit, and its instalment carries on.</p>' : '') +
        (i.saleEst && !i.saleEst.counted && (i.order === 'sell' || (i.order === 'buy' && !i.sale.undecided)) ? '<p class="f3-note">The sale isn’t counted yet: add its price, loan and CPF refund.</p>' : '') +
        P.fundTableHtml(r) + P.instalHtml(r, v);
      paintScn();
    }
    // compare another scenario: the same funding check with another rate, tenure or sale timing; the plan itself never changes
    function paintScn() {
      if (!scnD || !lastF) return;
      const so = q('[data-scn-out]'), sn = q('[data-scn-n]'), st = stOf(readAll()), r = lastF.r;
      const sr = q('[data-scn-sale]'); if (sr) sr.hidden = !(st.homes >= 1 && st.order === 'buy');
      const ri = q('[data-sk="rate"]'), yi = q('[data-sk="years"]'); if (ri) ri.placeholder = String(r.loan.ratePct); if (yi) yi.placeholder = String(r.loan.years);
      const rate = nv(ri && ri.value), years = nv(yi && yi.value), saleC = sr && !sr.hidden ? q('[data-sk="sale"]').value : '';
      let msg = '';
      if (Number.isNaN(rate) || (rate !== null && !(rate >= L.ratePct.min && rate <= L.ratePct.max))) msg = 'Enter a rate between ' + L.ratePct.min + '% and ' + L.ratePct.max + '%.';
      else if (Number.isNaN(years) || (years !== null && !(years >= L.years.min && years <= L.years.max))) msg = 'Enter a tenure between ' + L.years.min + ' and ' + L.years.max + ' years.';
      sn.textContent = msg;
      if (msg || (rate === null && years === null && !saleC)) { so.innerHTML = ''; return; }
      const over = { ratePct: rate !== null ? rate : st.ratePct, years: years !== null ? years : st.years };
      if (saleC === 'sell') over.order = 'sell'; else if (saleC) over.saleWhen = saleC;
      const f2 = F.funding(st, over); if (!f2.ok) { so.innerHTML = '<p class="f3-note">This scenario can’t be worked out with these figures.</p>'; return; }
      const r2 = f2.r, fin = (x) => { const p = x.events.filter((e) => e.type === 'pay' && e.bank > 0); return p.length ? p[p.length - 1].instalment : 0; };
      const row = (k, a, b) => '<tr' + (a !== b ? ' class="chg"' : '') + '><th scope="row">' + k + '</th><td>' + a + '</td><td>' + b + '</td></tr>';
      so.innerHTML = '<table class="f3-cmp"><thead><tr><th></th><th scope="col">Your plan</th><th scope="col">Scenario</th></tr></thead><tbody>' +
        row('Interest rate', r.loan.ratePct + '%', r2.loan.ratePct + '%') + row('Loan tenure', yrs(r.loan.years), yrs(r2.loan.years)) + row('Bank loan', $(r.loan.loanMax), $(r2.loan.loanMax)) +
        row('Monthly mortgage, fully released', $(fin(r)), $(fin(r2))) + (r.duty.absd || r2.duty.absd ? row('ABSD up front', $(r.duty.absd), $(r2.duty.absd)) : '') +
        row('Cash for the payments', $(r.totals.cash), $(r2.totals.cash)) + row('CPF for the payments', $(r.totals.cpf), $(r2.totals.cpf)) + row('Not covered', r.totals.uncovered > 0.5 ? $(r.totals.uncovered) : 'None', r2.totals.uncovered > 0.5 ? $(r2.totals.uncovered) : 'None') + '</tbody></table>';
    }
    if (scnD) { scnD.addEventListener('input', (e) => { if (e.target.dataset.sk) { clearTimeout(scnD.__t); scnD.__t = setTimeout(paintScn, 200); } }); scnD.addEventListener('change', (e) => { if (e.target.dataset.sk) paintScn(); }); }
    if (fundD && /^#funding$/.test(root.location.hash || '')) { allPay(true); fundD.open = true; }   // the earlier "Funding check" address opens the same check
    if (fundD) fundD.addEventListener('toggle', () => { if (fundD.open) track('fin3_fund_open', {}); });
    // the people, money and homes appear on the payments page twice (in "Who is buying" and in the funding check): only the open copy is read
    recalc();
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }
  return { pageHtml };
});
