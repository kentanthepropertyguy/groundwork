/* ==========================================================================
   GROUNDWORK — Hold, sell or upgrade? (HSU P4; Master Planning approval, 7 Nov 2026), on journey/compare/.
   Two views in one page: Your figures (#figures) and the comparison (#results). Every figure is GW_ENGINE.compare's (assets/js/
   gw-engine-position.js, on GW_ENGINE's sale, cost and afford blocks and the GW_CALC position primitives). This file adds no formula, rate or
   rule (its one sum is the monthly housing line, the engine's instalment + rent + upkeep added for display; rates are read from GW_RULES,
   GW_FIN3 and the planner's assumptions): it turns the visitor's figures into one gw-case-v1 case and the options, and shows the engine's own answers, words for its states, and
   nothing where the engine gives nothing (an incomplete choice shows today's figures only; a choice that cannot happen shows why).
   Basis (approved): market value at the end, no sale assumed then; cash and CPF earn 0%; prices unchanged unless the visitor says; the position
   is not money to spend; a comparison under the visitor's assumptions, not a recommendation or a forecast.
   Entry: from Plan My Move V2 (?from=pmm), its answers arrive once through an explicit handoff (sessionStorage gw.hsu.handoff, written by
   gw-pmm.js on the tap, read and removed here). Any other arrival starts clean; a reload or Back keeps this tab's own figures (gw.hsu.v1).
   Nothing goes in a URL, analytics or WhatsApp except the view's name. Pure helpers work in Node for the tests; mount() is browser only.
   UMD: window.GW_HSU.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.GW_HSU = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const KEY = 'gw.hsu.v1', HANDOFF = 'gw.hsu.handoff', TOOL = 'hold-sell-upgrade';
  const PERIOD = [1, 10];                       // the engine's own range (gw-engine-position.js PERIOD); shown as choices only
  const ROUND = 1000;                           // "about $207,000": differences are said to the nearest thousand (display only)
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; };
  const $ = (n) => (n < 0 ? '−' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
  const $k = (n) => '$' + (Math.round(Math.abs(n) / ROUND) * ROUND).toLocaleString('en-US');
  const pc = (x, d) => (Math.round(x * Math.pow(10, d || 1)) / Math.pow(10, d || 1)) + '%';
  const yrs = (n) => n + (n === 1 ? ' year' : ' years');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayText = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? (+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1] : ''; };
  const monthText = (ym) => { const m = /^(\d{4})-(\d{2})/.exec(ym || ''); return m ? MON[+m[2] - 1] + ' ' + m[1] : ''; };
  const two = (f) => f.n === '2';
  const isHdb = (f) => f.htype !== 'private';

  /* ---------------- the visitor's figures -> one case and the options (a blank stays blank: the engine asks for it) ---------------- */
  function caseOf(f, today) {
    f = f || {}; today = today || {};
    const n = two(f) ? 2 : 1, people = [];
    for (let k = 0; k < n; k++) {
      const p = { res: f['p' + k + 'res'] || 'SC', income: {} };
      if (num(f['p' + k + 'age']) !== null) p.age = num(f['p' + k + 'age']);
      if (num(f['p' + k + 'inc']) !== null) p.income.fixed = num(f['p' + k + 'inc']);
      people.push(p);
    }
    const c = { schema: 'gw-case-v1', people: people, household: {}, otherLoans: [], owned: [], purchase: { type: 'completed' }, financing: {} };
    if (num(f.cash) !== null) c.household.cash = num(f.cash);
    if (num(f.cpf) !== null) c.household.cpf = num(f.cpf);
    if (n === 2 && (f.couple === 'yes' || f.couple === 'no')) c.household.couple = f.couple === 'yes';
    if (num(f.debts) > 0) c.otherLoans.push({ person: 0, monthly: num(f.debts) });
    const h = { id: 'home', type: isHdb(f) ? 'hdb' : 'private', owners: n === 2 ? (f.hown === '0' ? [0] : f.hown === '1' ? [1] : [0, 1]) : [0], intent: 'keep', sale: {} };
    if (num(f.hval) !== null) h.sale.price = num(f.hval);
    if (num(f.hcpf) !== null) h.sale.cpfRefund = num(f.hcpf);
    if (f.hloan === 'no') h.sale.loan = 0;
    if (f.hloan === 'yes') {
      h.loan = {};
      if (num(f.hmo) !== null) h.loan.monthly = num(f.hmo);
      if (num(f.hrate) !== null) h.loan.ratePct = num(f.hrate);
      if (f.hlender === 'hdb' || f.hlender === 'bank') h.loan.lender = f.hlender;
      if (num(f.howe) !== null) h.sale.loan = num(f.howe);
    }
    if (num(f.hmc) !== null) h.monthlyCosts = num(f.hmc);
    if (h.type === 'private') { if (f.hbought) h.sale.bought = f.hbought; if (today.date) h.sale.sold = today.date; }
    if (h.type === 'hdb') {
      if (f.mop === 'met') h.mop = { met: true };
      else if (f.mop === 'notyet' && f.mopcat && f.mopmon) { h.mop = { category: f.mopcat, completed: f.mopmon }; if (num(f.mopgap) > 0) h.mop.notCountedMonths = num(f.mopgap); }
      // 'unsure', a special case (SERS, an early sale approved by HDB) or not answered: no MOP is given, so Sell and Upgrade ask for it
    }
    c.owned.push(h);
    if (num(f.nprice) !== null) c.purchase.price = num(f.nprice);
    if (num(f.nmc) !== null) c.purchase.monthlyCosts = num(f.nmc);
    return c;
  }
  function optsOf(f, o, today) {
    f = f || {}; o = o || {}; today = today || {};
    const out = { asOf: today.month, pct: {}, sell: {}, oneOff: {} };
    if (num(o.years) !== null) out.years = num(o.years);
    if (num(o.pcur) !== null) out.pct.current = num(o.pcur);
    if (num(o.pnext) !== null) out.pct.next = num(o.pnext);
    if (num(o.pcosts) !== null) out.purchaseCosts = num(o.pcosts);
    if (f.live === 'rent' || f.live === 'buy' || f.live === 'none') out.sell.housing = f.live;
    if (f.live === 'rent' && num(f.rent) !== null) out.sell.rent = num(f.rent);
    if (f.live === 'buy') { if (num(f.sprice) !== null) out.sell.price = num(f.sprice); if (num(f.smc) !== null) out.sell.monthlyCosts = num(f.smc); }
    if (num(o.oneUp) !== null) out.oneOff.upgrade = num(o.oneUp);
    if (num(o.oneSell) !== null) out.oneOff.sell = num(o.oneSell);
    return out;
  }
  // Plan My Move V2's answers (its own keys, gw-pmm.js) -> these figures: only what V2 asked; nothing V2 did not ask is filled in
  function fromPmm(a, homes) {
    a = a || {}; const f = {};
    ['n', 'p0age', 'p0inc', 'p0res', 'p1age', 'p1inc', 'p1res', 'couple', 'cash', 'cpf', 'debts', 'htype', 'hown', 'hloan', 'hmo'].forEach((k) => { if (a[k] !== undefined && a[k] !== null && a[k] !== '') f[k] = a[k]; });
    if (a.sprice !== undefined && a.sprice !== '') f.hval = a.sprice;
    if (a.sloan !== undefined && a.sloan !== '') f.howe = a.sloan;
    if (a.scpf !== undefined && a.scpf !== '') f.hcpf = a.scpf;
    const next = (homes || []).find((h) => h && num(h.price) > 0 && h.type !== 'new');
    if (next) f.nprice = num(next.price);
    return f;
  }

  /* ---------------- words for the engine's answers ---------------- */
  const FIELD = {
    'household.cash': 'your cash', 'household.cpf': 'your CPF Ordinary Account', 'owned[0].sale.price': 'what your home is worth today', 'owned[0].sale.loan': 'the loan still owing',
    'owned[0].loan.monthly': 'your monthly repayment', 'owned[0].loan.lender': 'who the loan is with (HDB or a bank)', 'owned[0].sale.cpfRefund': 'the CPF used for your home, with interest',
    'owned[0].sale.bought': 'the date you bought your home', 'owned[0].mop': 'your flat’s minimum occupation period', 'purchase.price': 'the price of the home you would buy',
    'sell.housing': 'where you would live', 'sell.rent': 'the monthly rent', 'sell.price': 'the price of the smaller home', 'owned[0].monthlyCosts': 'maintenance and property tax for your home',
    'purchase.monthlyCosts': 'maintenance and property tax for the home you would buy', 'sell.monthlyCosts': 'maintenance and property tax for the smaller home',
  };
  const fieldText = (m) => FIELD[m.field] || (/^people\[\d\]\.age$/.test(m.field) ? 'each buyer’s age' : /^people\[\d\]\.income$/.test(m.field) ? 'each buyer’s monthly income' : /^owned\[0\]\.mop\./.test(m.field) ? 'your flat type and key collection month' : 'one more figure');
  const uniq = (xs) => xs.filter((x, i) => xs.indexOf(x) === i);
  const list = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // what each choice is, in words
  function nameOf(k, f, as) {
    const home = isHdb(f) ? 'flat' : 'home';
    if (k === 'hold') return as === 'title' ? 'Hold' : as === 'what' ? 'Keep your ' + home : 'keeping your ' + home;
    if (k === 'sell') {
      if (as === 'title') return 'Sell';
      const w = f.live === 'rent' ? (num(f.rent) !== null ? 'and rent at ' + $(num(f.rent)) + ' a month' : 'and rent') : f.live === 'buy' ? (num(f.sprice) !== null ? 'and buy a ' + $(num(f.sprice)) + ' home' : 'and buy a smaller home') : f.live === 'none' ? 'with no housing cost (as you said)' : '';
      return as === 'what' ? cap(('sell now ' + w).trim()) : (f.live === 'rent' ? 'selling and renting' : f.live === 'buy' ? 'selling and buying smaller' : 'selling');
    }
    return as === 'title' ? 'Upgrade' : as === 'what' ? (num(f.nprice) !== null ? 'Sell first, buy the ' + $(num(f.nprice)) + ' home' : 'Sell first, buy a completed home') : 'upgrading';
  }
  // a choice without an end figure: why, in one sentence (no figure is invented)
  function stateText(k, x, f, r) {
    if (x.status === 'ok' && x.end) return '';
    if (x.reason === 'within-mop' && x.mop) return 'Your flat’s minimum occupation period ends in ' + monthText(x.mop.endsIn) + ' (' + x.mop.monthsLeft + (x.mop.monthsLeft === 1 ? ' month' : ' months') + ' from now). ' + (k === 'upgrade' ? 'Upgrading means selling it first, so it' : 'Selling') + ' waits until then. An earlier sale needs HDB’s approval on appeal, which this page does not assess.';
    if (x.missing && x.missing.some((m) => m.field === 'owned[0].mop')) return 'Tell us whether your flat has passed its minimum occupation period (HDB’s My Flat Dashboard shows it). Special cases, such as a SERS replacement flat or an early sale HDB has approved, are not assessed here.';
    if (x.reason === 'housing') return 'Add where you would live after selling to compare it over ' + yrs(r.years) + '. Until then, only what you would have today is shown.';
    if (x.reason === 'cash-short') return 'Not possible at these figures: the cash needed is about ' + $k(x.checks ? x.checks.cashLeft : 0) + ' more than you would have.';
    if (x.reason === 'cpf-short') return 'Not possible at these figures: the CPF needed is more than you would have.';
    if (x.reason === 'loan-over-limit') return 'Not possible at these figures: the loan needed is above the loan limit.';
    if (x.reason === 'repayment-below-interest') return 'Your monthly repayment does not cover the interest at this rate. Check the repayment, or the rate.';
    if (x.reason === 'no-income') return 'A new loan needs an income. Add each buyer’s monthly income.';
    if (x.status === 'unsupported') return 'Not worked out here yet: ' + ((x.invalid && x.invalid[0] && x.invalid[0].text) || 'this case is not supported') + '';
    if (x.status === 'invalid') return 'Check: ' + uniq((x.invalid || []).map((m) => m.text)).join(' ');
    const miss = uniq((x.missing || []).map(fieldText));
    if (miss.length) return 'Add ' + list(miss) + ' to work this out.';
    if (x.status === 'ok' && !x.end && r.missing.length) return 'Add ' + list(uniq(r.missing.map(fieldText))) + ' to compare over ' + yrs(r.years) + '.';
    return 'Not enough figures yet.';
  }
  const monthlyOf = (x) => (x && x.monthly ? (x.monthly.instalment || 0) + (x.monthly.rent || 0) + (x.monthly.recurring || 0) : null);

  // the answer: one sentence from the ledger's own differences (the comparison under the visitor's assumptions, never a recommendation)
  function answerOf(r, f, o) {
    const ch = r.choices, ids = ['hold', 'sell', 'upgrade'].filter((k) => ch[k] && ch[k].status === 'ok' && ch[k].end);
    const flat = !(num(o && o.pcur) || 0) && !(num(o && o.pnext) || 0);
    const eyebrow = 'After ' + yrs(r.years) + ', ' + (flat ? 'if prices stay where they are' : 'at the price changes you set');
    if (!r.comparable || ids.indexOf('hold') < 0 || ids.length < 2) return { eyebrow: eyebrow, text: null };
    const sorted = ids.slice().sort((a, b) => ch[b].end.position - ch[a].end.position), best = sorted[0];
    const gap = (k) => ch[best].end.position - ch[k].end.position;
    const parts = sorted.slice(1).map((k) => (Math.round(gap(k) / ROUND) ? 'about ' + $k(gap(k)) + ' ahead of ' + nameOf(k, f) : 'about the same as ' + nameOf(k, f)));
    const text = cap(nameOf(best, f)) + ' leaves you ' + parts.join(', and ') + '.';
    return { eyebrow: eyebrow, text: text, best: best, order: sorted };
  }
  function costLine(r) {
    const u = r.choices.upgrade;
    if (!(u && u.status === 'ok' && u.end && u.costs)) return '';
    const s = u.costs.sale || {};
    return 'Upgrading pays ' + $(u.costs.interest) + ' of loan interest over ' + yrs(r.years) + ', ' + $(u.costs.duty) + ' stamp duty, ' + $(s.costs) + ' of selling costs' + (s.ssd ? ', ' + $(s.ssd) + ' Seller’s Stamp Duty' : '') + ' and ' + $(u.costs.purchaseCosts) + ' to buy. What you own at the end is counted at its value.';
  }
  function breakEvenText(r, f, o) {
    const b = r.breakEven && r.breakEven.upgrade, u = r.choices.upgrade;
    if (!b || !b.ok || !u || !u.end) return '';
    const cur = num(o && o.pcur) || 0, tail = ' while your ' + (isHdb(f) ? 'flat' : 'home') + (cur ? ' changes by ' + pc(cur) + ' a year' : ' stays at today’s price') + '. This is arithmetic on your figures, not a forecast.';
    if (b.state === 'ahead') return '<b>Upgrade stays ahead of Hold</b> whatever the new home’s price does. This is arithmetic on your figures, not a forecast.';
    if (b.state === 'beyond') return '<b>Upgrade would need the new home’s price to change by more than ' + pc(b.maxPct, 0) + ' a year</b> to match Hold' + tail;
    if (b.pct >= 0) return '<b>Upgrade catches up with Hold</b> if the new home’s price rises about <b>' + pc(b.pct) + ' a year</b> (' + pc(b.totalPct, 0) + ' over ' + yrs(r.years) + ')' + tail;
    return '<b>Upgrade stays ahead of Hold</b> unless the new home’s price falls more than about <b>' + pc(-b.pct) + ' a year</b> (' + pc(-b.totalPct, 0) + ' over ' + yrs(r.years) + ')' + tail;
  }

  // the summary sheet (Save as PDF), from the same result that draws the page
  function sheetOf(r, f, o, checked) {
    if (!r || !r.choices || !r.choices.hold || !r.choices.hold.end) return null;
    const A = answerOf(r, f, o), ch = r.choices;
    const fig = (k) => { const x = ch[k], e = x.end; return { key: k, label: nameOf(k, f, 'title') + ': position after ' + yrs(r.years), value: e ? $(e.position) : '—', sub: e ? (k === 'hold' ? 'The starting point' : r.vsHold[k] ? $k(r.vsHold[k].position) + (r.vsHold[k].position < 0 ? ' behind Hold' : ' ahead of Hold') : '') : stateText(k, x, f, r).split('. ')[0] }; };
    const rowsOf = (k) => { const e = ch[k].end; return e ? [{ label: 'Home value', value: e.value ? $(e.value) : '—' }, { label: 'Loan left', value: e.loans ? $(e.loans) : '—' }, { label: 'Cash left from today', value: $(e.cash) }, { label: 'CPF left from today', value: $(e.cpf) }, { label: 'Paid for housing', value: $(e.paid.total) }, { label: 'Position', value: $(e.position) }] : [{ label: stateText(k, ch[k], f, r), value: '' }]; };
    return { tool: 'hsu', checked: checked, question: 'Hold, sell or upgrade?',
      basis: [yrs(r.years), (num(o.pcur) || 0) === 0 && (num(o.pnext) || 0) === 0 ? 'prices unchanged' : 'prices: your home ' + pc(num(o.pcur) || 0) + ', the next ' + pc(num(o.pnext) || 0) + ' a year', 'cash and CPF earn 0%', 'market value at the end, no sale assumed', 'a comparison under your assumptions, not a recommendation or a forecast'],
      figures: ['hold', 'sell', 'upgrade'].map(fig), judge: A.text || 'The comparison needs more figures.',
      left: [{ title: 'Hold', rows: rowsOf('hold') }, { title: 'Sell', rows: rowsOf('sell') }], right: [{ title: 'Upgrade', rows: rowsOf('upgrade') }, { title: 'Not money you can spend', rows: [{ label: 'The position includes what you own at its value. Excluded unless entered: renovation, moving and furnishing.', value: '' }] }] };
  }

  /* ================= browser ================= */
  function mount(box) {
    if (!box || typeof document === 'undefined') return;
    const E = root.GW_ENGINE, C = root.GW_CALC, RULES = root.GW_RULES || {}, KPT = root.KPT || { track: function () {} };
    const track = (n, p) => { try { KPT.track(n, Object.assign({ tool_name: TOOL }, p || {})); } catch (e) { /* analytics unavailable */ } };
    const rootPath = (document.body && document.body.dataset.root) || '../../';
    const checked = (() => { const d = new Date(String(RULES.checked || '') + 'T00:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); })();
    const NEW_RATE = root.GW_FIN3 ? root.GW_FIN3.DEFAULT_RATE_PCT : null, BANK_RATE = root.KPT_ASSUMPTIONS ? root.KPT_ASSUMPTIONS.planningRate * 100 : null, MOPY = RULES.hdbMop ? RULES.hdbMop.years : {};
    const waText = 'Hi Ken, I’m comparing holding, selling and upgrading on Groundwork and would like to talk it through.';
    const now = new Date(), pad = (n) => String(n).padStart(2, '0'), today = { date: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()), month: now.getFullYear() + '-' + pad(now.getMonth() + 1) };
    const store = { get: (k) => { try { return root.sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { root.sessionStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }, del: (k) => { try { root.sessionStorage.removeItem(k); } catch (e) { /* ignore */ } } };
    const blank = () => ({ v: 1, f: { n: '1', p0res: 'SC', p1res: 'SC', htype: 'hdb' }, o: {}, from: null });
    // how this page was reached: Plan My Move's explicit handoff, a reload or Back (keep this tab's figures), or anything else (start clean)
    const navType = (() => { try { const e = performance.getEntriesByType('navigation')[0]; return e ? e.type : 'navigate'; } catch (e) { return 'navigate'; } })();
    const fromPmmLink = /(?:^|[?&])from=pmm(?:&|$)/.test(location.search || '');
    let S = blank();
    const hand = store.get(HANDOFF); store.del(HANDOFF);
    if (fromPmmLink && hand && navType === 'navigate') { try { const j = JSON.parse(hand); if (j && j.v === 1) { S.f = Object.assign(S.f, fromPmm(j.a, j.homes)); S.from = 'pmm'; } } catch (e) { /* a bad handoff: start clean */ } }
    else if (navType === 'reload' || navType === 'back_forward') { try { const j = JSON.parse(store.get(KEY) || 'null'); if (j && j.v === 1) S = Object.assign(blank(), j); } catch (e) { /* start clean */ } }
    const save = () => store.set(KEY, JSON.stringify(S));
    let R = null, view = 'figures', started = false, completed = false;

    /* ---------- markup ---------- */
    const chips = (k, opts, o) => '<div class="hsu-chips" role="radiogroup" data-k="' + k + '"' + (o && o.label ? ' aria-label="' + esc(o.label) + '"' : '') + '>' + opts.map((x) => '<button type="button" role="radio" data-v="' + x[0] + '" aria-checked="false">' + esc(x[1]) + '</button>').join('') + '</div>';
    const q = (label, inner, o) => '<div class="hsu-q"' + (o && o.show ? ' data-show="' + o.show + '"' : '') + '><span class="hsu-l">' + label + (o && o.opt ? ' <em>optional</em>' : '') + '</span>' + inner + (o && o.hint ? '<small>' + o.hint + '</small>' : '') + '</div>';
    const money = (k, ph) => '<span class="hsu-in"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="money" placeholder="' + esc(ph || '') + '"></span>';
    const numIn = (k, ph, unit, t) => '<span class="hsu-in"><input type="text" inputmode="' + (t === 'pct' ? 'text' : 'numeric') + '" autocomplete="off" data-k="' + k + '" data-t="' + (t || 'num') + '" placeholder="' + esc(ph || '') + '">' + (unit ? '<i class="u">' + unit + '</i>' : '') + '</span>';
    const monthIn = (k) => '<span class="hsu-in"><input type="month" data-k="' + k + '" data-t="text" max="' + today.month + '"></span>';
    const dateIn = (k) => '<span class="hsu-in"><input type="date" data-k="' + k + '" data-t="text" max="' + today.date + '"></span>';
    const person = (k) => '<fieldset class="hsu-p"' + (k ? ' data-show="n:2"' : '') + '><legend><span data-show="n:1">You</span><span data-show="n:2">Person ' + (k + 1) + '</span></legend><div class="hsu-g3">' +
      q('Age', numIn('p' + k + 'age', 'e.g. ' + (k ? '38' : '40'), 'years')) + q('Monthly income', money('p' + k + 'inc', 'before CPF')) + q('Residency', chips('p' + k + 'res', [['SC', 'Citizen'], ['PR', 'PR']], { label: 'Residency' })) + '</div></fieldset>';
    function figuresHtml() {
      return '<section class="hsu-card" aria-labelledby="hsuF"><h2 class="hsu-t" id="hsuF" tabindex="-1">Your figures</h2>' +
        '<p class="hsu-sub">' + (S.from === 'pmm' ? 'Carried over from Plan My Move. Add what it did not ask, then compare.' : 'Your home today, the home you might buy, and what you have. Figures stay in this browser tab.') + '</p>' +
        '<h3 class="hsu-st">You</h3>' + q('Who is buying?', chips('n', [['1', 'Just me'], ['2', 'Two of us']])) + person(0) + person(1) +
        '<div class="hsu-g3">' + q('Cash you have', money('cash', 'e.g. 150,000')) + q('CPF Ordinary Account', money('cpf', 'e.g. 80,000')) + q('Other monthly loans', money('debts', 'car, personal'), { opt: true }) + '</div>' +
        q('Married, buying in both names?', chips('couple', [['yes', 'Yes'], ['no', 'No']]), { show: 'n:2', opt: true, hint: 'Only changes stamp duty for some couples.' }) +
        '<h3 class="hsu-st">The home you own</h3>' + q('Type', chips('htype', [['hdb', 'HDB flat'], ['private', 'Private home']])) +
        '<div class="hsu-g3">' + q('What it is worth today', money('hval', 'e.g. 700,000'), { hint: 'Not sure? <a href="' + rootPath + 'journey/worth/">See what similar homes sold for</a>' }) + q('CPF used for it, with interest', money('hcpf', 'from the CPF website'), { hint: 'It goes back to your CPF when you sell.' }) + q('Owned by', chips('hown', [['0', 'Person 1'], ['1', 'Person 2'], ['both', 'Both']]), { show: 'n:2' }) + '</div>' +
        q('Still paying a loan on it?', chips('hloan', [['yes', 'Yes'], ['no', 'No, fully paid']])) +
        '<div class="hsu-g3" data-show="hloan:yes">' + q('Loan still owing', money('howe', 'e.g. 150,000')) + q('Monthly repayment', money('hmo', 'e.g. 1,200')) + q('Loan with', chips('hlender', [['hdb', 'HDB'], ['bank', 'A bank']])) + '</div>' +
        q('Its interest rate', numIn('hrate', 'if you know it', '% a year', 'pct'), { show: 'hloan:yes', opt: true, hint: 'Left blank: HDB’s rate (' + pc((RULES.hdbLoanRate || 0) * 100) + ', valid to ' + esc(RULES.ratesValidUntilText || '') + ') or ' + pc(BANK_RATE) + ' for a bank loan (Groundwork’s planning rate).' }) +
        '<div data-show="hdb">' + q('Has it passed its minimum occupation period (MOP)?', chips('mop', [['met', 'Yes'], ['notyet', 'Not yet'], ['unsure', 'Not sure / special case']]), { hint: 'HDB’s My Flat Dashboard shows it. Standard flats ' + MOPY.standard + ' years; Plus and Prime ' + MOPY.plus + '; Fresh Start ' + MOPY.freshStart + '.' }) +
          '<div class="hsu-g3" data-show="mop:notyet">' + q('Flat type', chips('mopcat', [['standard', 'Standard'], ['plus', 'Plus'], ['prime', 'Prime'], ['freshStart', 'Fresh Start']])) + q('Keys collected (or resale completed)', monthIn('mopmon')) + q('Months the whole flat was rented out', numIn('mopgap', '0', 'months'), { opt: true }) + '</div></div>' +
        '<div data-show="private">' + q('Date you bought it', dateIn('hbought'), { hint: 'For Seller’s Stamp Duty: the date you exercised the option (resale) or signed the S&amp;P (new launch).' }) + '</div>' +
        q('Maintenance or S&amp;CC and property tax', money('hmc', 'a month'), { opt: true, hint: 'Compared only when given for every home.' }) +
        '<h3 class="hsu-st">If you upgrade</h3>' + '<div class="hsu-g3">' + q('Price of the completed home you would buy', money('nprice', 'e.g. 1,800,000'), { hint: 'A completed private home. New launches are not compared here yet.' }) + q('Its maintenance and property tax', money('nmc', 'a month'), { opt: true }) + '</div>' +
        '<h3 class="hsu-st">If you sell</h3>' + q('Where would you live?', chips('live', [['rent', 'Rent'], ['buy', 'Buy a smaller home'], ['none', 'No housing cost'], ['', 'Not decided']]), { hint: '“No housing cost” is, for example, living with family.' }) +
        '<div class="hsu-g3" data-show="live:rent">' + q('Monthly rent', money('rent', 'e.g. 3,500')) + '</div>' +
        '<div class="hsu-g3" data-show="live:buy">' + q('Price of the smaller completed home', money('sprice', 'e.g. 1,100,000')) + q('Its maintenance and property tax', money('smc', 'a month'), { opt: true }) + '</div>' +
        '<div class="hsu-nav"><span class="hsu-why" data-why aria-live="polite"></span><button type="button" class="hsu-go" data-see>See my comparison →</button></div></section>';
    }
    const ED = {
      years: () => q('Compare over', '<span class="hsu-in"><select data-k="o.years" data-t="num">' + Array.from({ length: PERIOD[1] - PERIOD[0] + 1 }, (_, i) => PERIOD[0] + i).map((y) => '<option value="' + y + '">' + yrs(y) + '</option>').join('') + '</select></span>'),
      prices: () => '<div class="hsu-g3">' + q('Your home’s price', numIn('o.pcur', '0', '% a year', 'pct')) + q('The new home’s price', numIn('o.pnext', '0', '% a year', 'pct')) + '</div><small>Your own assumption, up or down. Groundwork does not forecast prices.</small>',
      live: () => q('Where would you live after selling?', chips('live', [['rent', 'Rent'], ['buy', 'Buy smaller'], ['none', 'No housing cost'], ['', 'Not decided']])) + '<div class="hsu-g3" data-show="live:rent">' + q('Monthly rent', money('rent', 'e.g. 3,500')) + '</div><div class="hsu-g3" data-show="live:buy">' + q('Price of the smaller home', money('sprice', '')) + q('Its maintenance', money('smc', 'a month'), { opt: true }) + '</div>',
      rates: () => q('Your current loan’s rate', numIn('hrate', 'leave blank for the default', '% a year', 'pct')) + '<small>The new loan uses Groundwork’s ' + pc(NEW_RATE) + ' planning rate (the MAS test rate), the same as the calculators.</small>',
      costs: () => q('Legal and valuation when buying', money('o.pcosts', '5,000')) + '<small>An estimate: lawyers and banks quote their own.</small>',
      upkeep: () => '<div class="hsu-g3">' + q('Your home', money('hmc', 'a month')) + q('The home you would buy', money('nmc', 'a month')) + q('The smaller home', money('smc', 'a month')) + '</div><small>Maintenance or S&amp;CC, property tax and insurance. Compared only when given for every home held.</small>',
      oneoff: () => '<div class="hsu-g3">' + q('If you upgrade', money('o.oneUp', 'renovation, moving')) + q('If you sell', money('o.oneSell', 'moving, furnishing')) + '</div>',
    };
    function chipsHtml(r) {
      const f = S.f, o = S.o, cur = num(o.pcur) || 0, nx = num(o.pnext) || 0, lf = r && r.choices && r.choices.hold && r.choices.hold.homes && r.choices.hold.homes[0];
      const rate = lf && lf.loanToday ? pc(lf.ratePct, 2) : num(f.hrate) !== null ? pc(num(f.hrate), 2) : '', ra = r && r.choices && (r.choices.hold.assumptions || []).find((a) => a.key === 'owned[0].loan.ratePct');
      const ch = [['years', 'Over ' + yrs(r ? r.years : 5)], ['prices', 'Prices: your home ' + pc(cur) + ' · new home ' + pc(nx) + ' a year'], ['live', 'If you sell: ' + (f.live === 'rent' ? 'rent' + (num(f.rent) !== null ? ' ' + $(num(f.rent)) + '/mo' : '') : f.live === 'buy' ? 'buy smaller' : f.live === 'none' ? 'no housing cost' : 'not decided')],
        ['rates', 'Rates: your loan ' + (rate || '—') + (ra && ra.basis === 'rule' ? ' (HDB, to ' + (RULES.ratesValidUntilText || '') + ')' : ra && ra.basis === 'convention' ? ' (planning rate)' : '') + ' · new loan ' + pc(NEW_RATE)], ['costs', 'Buying costs ' + $(num(o.pcosts) !== null ? num(o.pcosts) : (root.KPT_ASSUMPTIONS || {}).purchaseCosts || 0)],
        ['upkeep', 'Maintenance' + (num(f.hmc) !== null || num(f.nmc) !== null ? ': ' + [f.hmc, f.nmc].filter((x) => num(x) !== null).map((x) => $(num(x))).join(' · ') + '/mo' : ': not added')], ['oneoff', 'Renovation and moving: ' + (num(o.oneUp) !== null || num(o.oneSell) !== null ? 'added' : 'not added')]];
      return '<div class="hsu-as" role="group" aria-label="Your assumptions">' + ch.map((c) => '<button type="button" class="hsu-a" data-ed="' + c[0] + '" aria-expanded="false">' + esc(c[1]) + '</button>').join('') + '<span class="hsu-a fixed">Cash and CPF earn 0%</span></div><div class="hsu-ed" data-edbox hidden></div>';
    }
    function resultsShell() {
      return '<section class="hsu-card hsu-res" aria-labelledby="hsuR"><h2 class="hsu-vh" id="hsuR" tabindex="-1">Your comparison</h2><div class="hsu-top"><p data-figs></p><button type="button" class="hsu-lnk" data-change>Change figures</button></div>' +
        '<div data-answer aria-live="polite"></div><div data-sum></div><div class="hsu-cols" data-cols></div><p class="hsu-note" data-note></p><div data-be></div><div data-chips></div></section>' +
        '<details class="hsu-w" data-workings><summary>How this is worked out</summary><div class="in" data-work></div></details>' +
        '<div class="hsu-act"><button type="button" class="hsu-go" data-pdf>Save as PDF</button><a class="hsu-ken" href="https://wa.me/6590908898?text=' + encodeURIComponent(waText) + '" target="_blank" rel="noopener" data-gw-wa="hsu" data-hsu-ken>Talk it through with Ken</a></div>';
    }

    /* ---------- state <-> inputs ---------- */
    const qs = (s) => box.querySelector(s), qa = (s) => [].slice.call(box.querySelectorAll(s));
    const getK = (k) => (k.indexOf('o.') === 0 ? S.o[k.slice(2)] : S.f[k]);
    const setK = (k, v) => { if (k.indexOf('o.') === 0) S.o[k.slice(2)] = v; else S.f[k] = v; };
    function fill() {
      qa('[data-k]').forEach((el) => {
        const k = el.dataset.k, v = getK(k);
        if (el.classList.contains('hsu-chips')) el.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === (v === undefined || v === null ? '' : v))));
        else if (el.tagName === 'SELECT') el.value = String(num(v) !== null ? num(v) : 5);
        else if (document.activeElement !== el) el.value = v === undefined || v === null ? '' : (el.dataset.t === 'money' && num(v) !== null ? Math.round(num(v)).toLocaleString('en-US') : String(v));
      });
      const f = S.f, ok = { 'n:1': !two(f), 'n:2': two(f), 'hloan:yes': f.hloan === 'yes', hdb: isHdb(f), private: !isHdb(f), 'mop:notyet': f.mop === 'notyet', 'live:rent': f.live === 'rent', 'live:buy': f.live === 'buy' };
      qa('[data-show]').forEach((el) => { el.hidden = !ok[el.dataset.show]; });
    }

    /* ---------- the engine ---------- */
    function compute() { R = E && typeof E.compare === 'function' ? E.compare(caseOf(S.f, today), optsOf(S.f, S.o, today)) : null; return R; }
    // the figures needed before a comparison can start (Hold's own); everything else each column asks for itself
    function baseNeeds() {
      const f = S.f, out = [];
      if (num(f.hval) === null) out.push('what your home is worth');
      if (f.hloan !== 'yes' && f.hloan !== 'no') out.push('whether you still pay a loan on it');
      if (f.hloan === 'yes' && (num(f.howe) === null || num(f.hmo) === null)) out.push('the loan owing and the monthly repayment');
      if (num(f.cash) === null) out.push('your cash'); if (num(f.cpf) === null) out.push('your CPF');
      return out;
    }

    /* ---------- painting the comparison ---------- */
    function card(k, r) {
      const x = r.choices[k], f = S.f, e = x.end, t = x.today, mo = monthlyOf(x), vs = r.vsHold[k];
      const why = stateText(k, x, f, r), H = x.homes && x.homes[0];
      const head = '<div class="hd"><h3>' + nameOf(k, f, 'title') + '</h3><p class="what">' + esc(nameOf(k, f, 'what')) + '</p>' +
        (e ? '<p class="hsu-pos" data-pos="' + k + '">' + $(e.position) + '</p>' + (k === 'hold' || vs ? '<span class="hsu-diff" data-diff="' + k + '">' + (k === 'hold' ? 'Starting point' : Math.round(vs.position / ROUND) ? $k(vs.position) + (vs.position < 0 ? ' behind Hold' : ' ahead of Hold') : 'About the same as Hold') + '</span>' : '') : '<p class="hsu-wait" data-state="' + k + '">' + esc(why) + '</p>') + '</div>';
      const rows = [];
      if (mo !== null) rows.push(['grp', 'Each month'], ['Housing', $(mo), 'mo']);
      if (t) rows.push(['grp', 'Today'], ['Cash', $(t.cash), 'cash'], ['CPF', $(t.cpf), 'cpf']);
      if (e) rows.push(['grp', 'In ' + yrs(r.years)], ['Home value', e.value ? $(e.value) : '—', 'value'], ['Loan left', H ? $(e.loans) : '—', 'loan'], ['Paid for housing', $(e.paid.total), 'paid']);
      const body = rows.length ? '<ul class="hsu-rows">' + rows.map((w) => (w[0] === 'grp' ? '<li class="grp">' + w[1] + '</li>' : '<li><span>' + w[0] + '</span><b data-row="' + k + '.' + w[2] + '">' + w[1] + '</b></li>')).join('') + '</ul>' : '';
      return '<article class="hsu-c' + (k === 'hold' ? ' base' : '') + '" data-col="' + k + '">' + head + (body ? '<details class="hsu-more" data-more="' + k + '"><summary>' + nameOf(k, f, 'title') + ': ' + (e ? 'cash, CPF and loan' : 'what you would have today') + '</summary>' + body + '</details>' : '') + '</article>';
    }
    function summary(r) {
      return '<ul class="hsu-sum" aria-label="The three choices">' + ['hold', 'sell', 'upgrade'].map((k) => {
        const x = r.choices[k], e = x.end, vs = r.vsHold[k], mo = monthlyOf(x);
        return '<li data-sum="' + k + '"><span class="n">' + nameOf(k, S.f, 'title') + '<small>' + (mo !== null && e ? $(mo) + ' a month' : '') + '</small></span>' +
          (e ? '<span class="v"><b>' + $(e.position) + '</b><small>' + (k === 'hold' ? 'Starting point' : vs ? (Math.round(vs.position / ROUND) ? $k(vs.position) + (vs.position < 0 ? ' behind' : ' ahead') : 'About the same') : '') + '</small></span>' : '<span class="v w">' + (x.reason === 'housing' ? 'Add where you’d live' : x.reason === 'within-mop' ? 'Within MOP' : x.status === 'stop' ? 'Not possible' : 'Needs figures') + '</span>') + '</li>';
      }).join('') + '</ul>';
    }
    function workings(r) {
      const ch = r.choices, ids = ['hold', 'sell', 'upgrade'], f = S.f, cell = (k, fn) => { const e = ch[k].end; return e ? fn(e, ch[k]) : '—'; };
      const tr = (label, fn, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + label + '</td>' + ids.map((k) => '<td>' + cell(k, fn) + '</td>').join('') + '</tr>';
      let h = '<div class="tbl"><table><thead><tr><th>After ' + yrs(r.years) + '</th><th>Hold</th><th>Sell</th><th>Upgrade</th></tr></thead><tbody>' +
        tr('Home value', (e) => (e.value ? $(e.value) : '—')) + tr('Less the loan left', (e) => (e.loans ? $(e.loans) : '—')) + tr('= Your equity', (e) => $(e.equity)) +
        tr('Plus cash left from today', (e) => $(e.cash)) + tr('Plus CPF left from today', (e) => $(e.cpf)) +
        tr('Less instalments', (e) => $(e.paid.instalments)) + tr('Less rent', (e) => $(e.paid.rent)) + tr('Less maintenance and tax', (e) => $(e.paid.recurring)) + tr('Less renovation and moving', (e) => $(e.paid.oneOff)) +
        tr('Your position', (e) => $(e.position), 'tot') + '</tbody></table></div>';
      const p = [];
      const s = (ch.sell.today && ch.sell.today.sale) || (ch.upgrade.today && ch.upgrade.today.sale);
      if (s) p.push('<b>The sale.</b> ' + $(s.price) + ', less the ' + $(s.loan) + ' loan, ' + $(s.costs) + ' of agent’s commission with GST and legal fees' + (s.ssd ? ', ' + $(s.ssd) + ' Seller’s Stamp Duty' : '') + (s.penalty ? ', a ' + $(s.penalty) + ' early repayment penalty' : '') + ', gives ' + $(s.total) + ': ' + $(s.cpf) + ' back to CPF and ' + $(s.cash) + ' in cash. Your loan is repaid at today’s balance.');
      const u = ch.upgrade, pu = u.today && u.today.purchase, nh = u.homes && u.homes[0];
      if (pu && nh) p.push('<b>The new home.</b> ' + $(pu.price) + ' with a ' + $(pu.loan) + ' bank loan (' + pc((u.blocks.cost.figures.ltv || 0) * 100, 0) + ' loan limit) over ' + yrs(nh.years) + ' at ' + pc(nh.ratePct, 2) + ', ' + $(u.monthly.instalment) + ' a month; ' + $(pu.cashNeeded) + ' in cash and ' + $(pu.cpfUsed) + ' of CPF for the down payment and duty; ' + $(pu.bsd) + ' Buyer’s Stamp Duty' + (pu.absd ? ' and ' + $(pu.absd) + ' ABSD' : ', no ABSD (you sell first)') + '; ' + $(pu.purchaseCosts) + ' legal and valuation (an estimate you can change).' + (u.checks && u.checks.budget ? ' Your budget on these figures goes up to about ' + $k(u.checks.budget) + '.' : ''));
      const hh = ch.hold.homes && ch.hold.homes[0];
      if (hh && hh.loanToday) p.push('<b>Your current loan.</b> ' + $(hh.loanToday) + ' at ' + pc(hh.ratePct, 2) + (num(f.hrate) === null ? (f.hlender === 'hdb' ? ' (HDB’s rate, valid to ' + esc(RULES.ratesValidUntilText || '') + ')' : ' (Groundwork’s planning rate; use your own if you know it)') : '') + ': repaid in about ' + yrs(Math.ceil(hh.termMonths / 12)) + ' at your repayment.');
      const mopA = (ch.sell.assumptions || []).concat(ch.upgrade.assumptions || []).find((a) => a.key === 'owned[0].mop');
      if (isHdb(f)) p.push('<b>Minimum occupation period.</b> ' + (mopA ? 'Your flat is past it (' + (f.mop === 'met' ? 'as you said' : 'worked out from its type and key collection') + '). ' : (ch.sell.mop ? 'It ends in ' + monthText(ch.sell.mop.endsIn) + '. ' : 'Not given yet. ')) + 'HDB: Standard flats ' + MOPY.standard + ' years, Plus and Prime ' + MOPY.plus + ', Fresh Start ' + MOPY.freshStart + ', from key collection or resale completion; a household with a Citizen owner may buy private property only after it. Checked ' + esc(RULES.hdbMop ? dayText(RULES.hdbMop.checked) : '') + '.');
      p.push('<b>Left out.</b> ' + r.excluded.map((x) => x.text).join(' ') + ' Your home’s value is today’s figure changed by your price assumption; nothing is sold at the end.');
      p.push('<b>Not advice.</b> A comparison of three choices under your figures and assumptions, not a recommendation, a valuation or a price forecast. Your bank, HDB, CPF Board and your lawyer confirm the actual figures. Rules checked ' + esc(checked) + '.');
      return h + p.map((t) => '<p>' + t + '</p>').join('');
    }
    function paintResults() {
      const r = R; if (!r || !qs('[data-cols]')) return;
      const f = S.f, A = answerOf(r, f, S.o);
      qs('[data-figs]').innerHTML = '<b>Your figures:</b> ' + esc([(isHdb(f) ? 'HDB flat ' : 'Home ') + (num(f.hval) !== null ? $(num(f.hval)) : ''), f.hloan === 'yes' && num(f.howe) !== null ? 'loan ' + $(num(f.howe)) + (num(f.hmo) !== null ? ' at ' + $(num(f.hmo)) + '/mo' : '') : f.hloan === 'no' ? 'no loan' : '', num(f.cash) !== null ? 'cash ' + $(num(f.cash)) : '', num(f.cpf) !== null ? 'CPF ' + $(num(f.cpf)) : '', num(f.nprice) !== null ? 'next home ' + $(num(f.nprice)) : ''].filter(Boolean).join(' · '));
      const glob = r.missing.length ? '<p class="hsu-miss" data-global>To compare all three, add ' + esc(list(uniq(r.missing.map(fieldText)))) + '.</p>' : '';
      const mopX = ['sell', 'upgrade'].map((k) => r.choices[k]).find((x) => x.reason === 'within-mop' && x.mop);
      const none = mopX && r.choices.hold.end ? 'Only keeping your flat can be worked out now: it is within its minimum occupation period until ' + monthText(mopX.mop.endsIn) + '.' : 'Not enough figures to compare yet.';
      qs('[data-answer]').innerHTML = '<p class="hsu-eb">' + esc(A.eyebrow) + '</p>' + (A.text ? '<p class="hsu-ans" data-ans>' + esc(A.text) + '</p>' + (costLine(r) ? '<p class="hsu-sub2">' + esc(costLine(r)) + '</p>' : '') : '<p class="hsu-ans" data-ans>' + esc(none) + '</p>') + glob +
        '<p class="hsu-lab" data-label>A comparison under your assumptions, not a recommendation or a price forecast.</p>';
      qs('[data-sum]').innerHTML = summary(r);
      qs('[data-cols]').innerHTML = ['hold', 'sell', 'upgrade'].map((k) => card(k, r)).join('');
      qs('[data-note]').textContent = 'Your position = what you own, less what you owe, plus the cash and CPF left from today, less everything paid for housing. It includes your home’s value, so it is not money you can spend.';
      const be = breakEvenText(r, f, S.o); qs('[data-be]').innerHTML = be ? '<div class="hsu-be" data-breakeven>' + be + '</div>' : '';
      const open = qs('[data-ed][aria-expanded="true"]'), openKey = open ? open.dataset.ed : null;
      if (!qs('[data-chips] .hsu-as') || !openKey) qs('[data-chips]').innerHTML = chipsHtml(r);
      else qa('[data-ed]').forEach((b) => { const tmp = document.createElement('div'); tmp.innerHTML = chipsHtml(r); const nb = tmp.querySelector('[data-ed="' + b.dataset.ed + '"]'); if (nb) b.textContent = nb.textContent; });
      qs('[data-work]').innerHTML = workings(r);
      wide();
      if (!completed && r.comparable) { completed = true; track('tool_completed', { step: 'results' }); }
    }
    // desktop: the three columns with their rows open; a phone: the summary first, each choice's rows behind its own section
    const mq = root.matchMedia ? root.matchMedia('(min-width: 861px)') : null;
    function wide() { const w = !mq || mq.matches; qa('[data-more]').forEach((d) => { d.open = w; }); }
    if (mq && mq.addEventListener) mq.addEventListener('change', wide);

    /* ---------- views ---------- */
    function go(v, how) {
      if (v === 'results' && baseNeeds().length) v = 'figures';
      view = v;
      box.innerHTML = v === 'results' ? resultsShell() : figuresHtml();
      qa('input[data-t="money"]').forEach(wireMoney);
      update();
      const h = '#' + v;
      try { if (how === 'push' && location.hash !== h) history.pushState({ hsu: v }, '', h); else if (how !== 'pop' && location.hash !== h) history.replaceState({ hsu: v }, '', h); } catch (e) { /* history blocked */ }
      if (how === 'push' || how === 'pop') { const t = qs('.hsu-t, .hsu-vh'); const top = box.getBoundingClientRect().top + root.scrollY - 70; if (root.scrollY > top) root.scrollTo({ top: top, behavior: 'auto' }); if (t) try { t.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
      track('journey_step', { journey: TOOL, step: v });
    }
    function update() { compute(); fill(); if (view === 'results') { paintResults(); fill(); } save(); }
    function wireMoney(x) { if (root.GW_MONEY && !x.__w) { x.__w = 1; root.GW_MONEY.wire(x, { parse: (t) => { const r = C ? C.parseMoney(t) : { value: num(t) }; return r && typeof r.value === 'number' ? r.value : null; }, max: C && C.LIMITS ? C.LIMITS.money.max : undefined }); } }

    /* ---------- events ---------- */
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k] [data-v]');
      if (b && box.contains(b)) { setK(b.closest('[data-k]').dataset.k, b.dataset.v); if (!started) { started = true; track('tool_started'); } update(); return; }
      if (e.target.closest('[data-see]')) {
        const need = baseNeeds(); const w = qs('[data-why]');
        if (need.length) { if (w) w.textContent = 'Add ' + list(need) + ' first.'; return; }
        go('results', 'push'); return;
      }
      if (e.target.closest('[data-change]')) { go('figures', 'push'); return; }
      const ed = e.target.closest('[data-ed]');
      if (ed) {
        const was = ed.getAttribute('aria-expanded') === 'true', boxEd = qs('[data-edbox]');
        qa('[data-ed]').forEach((x) => x.setAttribute('aria-expanded', 'false'));
        if (was) { boxEd.hidden = true; boxEd.innerHTML = ''; return; }
        ed.setAttribute('aria-expanded', 'true'); boxEd.innerHTML = ED[ed.dataset.ed](); boxEd.hidden = false;
        boxEd.querySelectorAll('input[data-t="money"]').forEach(wireMoney); fill();
        const first = boxEd.querySelector('input, select, button'); if (first) try { first.focus(); } catch (x) { /* ignore */ }
        return;
      }
      if (e.target.closest('[data-pdf]')) { if (root.GW_SHEET) root.GW_SHEET.print(() => track('pdf_saved')); return; }
    });
    const onInput = (e) => {
      const x = e.target; if (!x.dataset || !x.dataset.k) return;
      const t = x.dataset.t, v = x.value.trim();
      setK(x.dataset.k, v === '' ? '' : t === 'money' || t === 'num' || t === 'pct' ? (num(v) === null ? '' : num(v)) : v);
      if (!started) { started = true; track('tool_started'); }
      update();
    };
    box.addEventListener('input', onInput); box.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' || e.target.type === 'month' || e.target.type === 'date') onInput(e); });
    root.addEventListener('popstate', () => { const h = (location.hash || '').replace('#', ''); if ((h === 'figures' || h === 'results') && h !== view) go(h, 'pop'); });
    if (root.GW_SHEET) root.GW_SHEET.wire(() => sheetOf(R, S.f, S.o, checked));
    const want = (location.hash || '').replace('#', '') === 'results' ? 'results' : 'figures';
    go(want, 'load');
  }
  if (typeof document !== 'undefined') { const run = () => mount(document.querySelector('[data-hsu]')); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run(); }
  return { KEY, HANDOFF, caseOf, optsOf, fromPmm, answerOf, stateText, breakEvenText, costLine, sheetOf, nameOf, monthlyOf, mount };
});
