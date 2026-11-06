/* ==========================================================================
   GROUNDWORK — Plan My Move V2: one guided journey (Master Planning, 6 Nov 2026), on journey/ in place of the checklist.
   Four steps in one shell: 1 My Situation · 2 My Budget · 3 My Options · 4 My Plan. Back and Continue, visible progress, one set of answers.
   Every figure comes from GW_ENGINE (assets/js/gw-engine.js, the shared engine adapter): borrow, afford (the maximum budget), sale and cost.
   This file adds no formula, rate or rule: it turns the visitor's answers into one gw-case-v1 case and shows the engines' own answers;
   when the answers are not enough, it says what is missing and shows no figure.
   State: this browser tab only (sessionStorage gw.pmm.v2); steps are history entries (#situation, #budget, #options, #plan), so Back,
   Forward and reload work. Nothing goes in a URL, analytics or WhatsApp except the step's name. Standalone calculators are not touched.
   Budget Search gets the budget only when the visitor taps "Explore homes" (kpt.handoff, its existing contract) and opens with
   ?plan=v2, so it shows "Part of your Plan My Move" and the way back (gw-nav.js PLAN.v2).
   Pure helpers work in Node for the tests (caseOf, sheetOf, stepDone, nextSteps); mount() is browser only. UMD: window.GW_PMM.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.GW_PMM = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const KEY = 'gw.pmm.v2';
  const STEPS = [['situation', 'My Situation', 'My current home and plans'], ['budget', 'My Budget', 'How much I can afford'], ['options', 'My Options', 'Homes that fit me'], ['plan', 'My Plan', 'A personalised next step']];
  const SIT = [['first', 'First home', 'No home now'], ['own', 'Own a home', 'Keep it, buy another'], ['upgrade', 'Upgrade', 'Sell, buy bigger'], ['right', 'Right-size', 'Sell, buy smaller']];
  const WHEN = [['1', 'Within 1 year'], ['2', '1–2 years'], ['5', '2–5 years'], ['unsure', 'Not sure yet']];
  const RES = [['SC', 'Citizen'], ['PR', 'PR'], ['FR', 'Foreigner']];
  const PTYPE = [['new', 'New launch'], ['completed', 'Completed home'], ['unsure', 'Not sure']];
  const MAX_HOMES = 3;
  const UI = { scrollPad: 70, nameMax: 60 }; // layout only: the space kept above the card when a step opens, the longest home name
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, '')); return isFinite(n) ? n : null; };
  const $ = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const selling = (a) => a.sit === 'upgrade' || a.sit === 'right';
  const owning = (a) => a.sit === 'own' || selling(a);
  const two = (a) => a.n === '2';

  /* ---------------- answers -> one gw-case-v1 case (no figure is made up: a blank stays blank) ---------------- */
  function caseOf(a, ptype, price) {
    a = a || {};
    const n = two(a) ? 2 : 1, people = [];
    for (let k = 0; k < n; k++) {
      const p = { age: num(a['p' + k + 'age']), res: a['p' + k + 'res'] || 'SC', income: { fixed: num(a['p' + k + 'inc']) } };
      if (num(a['oa' + k]) !== null || num(a['sa' + k]) !== null) p.cpf = { oa: num(a['oa' + k]), sa: num(a['sa' + k]) };
      if (p.age === null) delete p.age; if (p.income.fixed === null) p.income = {};
      people.push(p);
    }
    const c = { schema: 'gw-case-v1', people, household: {}, otherLoans: [], owned: [], purchase: {}, financing: {} };
    if (num(a.cash) !== null) c.household.cash = num(a.cash);
    if (num(a.cpf) !== null) c.household.cpf = num(a.cpf);
    if (n === 2 && (a.couple === 'yes' || a.couple === 'no')) c.household.couple = a.couple === 'yes';
    if (a.c95 === 'yes' || a.c95 === 'no') c.household.cover95 = a.c95 === 'yes';
    if (num(a.debts) > 0) c.otherLoans.push({ person: 0, monthly: num(a.debts) });
    if (owning(a)) {
      const h = { id: 'home', type: a.htype === 'private' ? 'private' : 'hdb', owners: n === 2 ? (a.hown === 'both' ? [0, 1] : a.hown === '1' ? [1] : [0]) : [0], loan: a.hloan === 'yes' ? { monthly: num(a.hmo) } : null, intent: selling(a) ? 'sell' : 'keep' };
      if (selling(a)) { h.sale = {}; ['price', 'loan', 'cpfRefund'].forEach((k, i) => { const v = num(a[['sprice', 'sloan', 'scpf'][i]]); if (v !== null) h.sale[k] = v; }); }
      c.owned.push(h);
    }
    c.purchase.type = ptype;
    if (price !== undefined) c.purchase.price = price;
    if (selling(a)) c.purchase.order = 'sell-first';
    return c;
  }

  /* ---------------- what each step still needs (in the visitor's words) ---------------- */
  // returns [{ key, text }] for the fields a step cannot do without; an empty list = the step is complete
  function stepNeeds(step, a, ask) {
    a = a || {}; const out = [], need = (k, t) => { if (a[k] === undefined || a[k] === null || a[k] === '') out.push({ key: k, text: t }); };
    const who = (k) => (two(a) ? 'Person ' + (k + 1) + '’s ' : 'Your ');
    if (step === 'situation') {
      need('sit', 'Choose your situation.'); need('n', 'Say who is buying.');
      for (let k = 0; k < (two(a) ? 2 : 1); k++) { need('p' + k + 'age', who(k) + 'age.'); need('p' + k + 'inc', who(k) + 'monthly income (0 if none).'); }
      if (owning(a)) {
        need('htype', 'The type of home you own.'); if (two(a)) need('hown', 'Who owns it.'); need('hloan', 'Whether you are still paying a home loan on it.');
        if (a.hloan === 'yes' && !(num(a.hmo) > 0)) out.push({ key: 'hmo', text: 'Enter your existing monthly housing loan repayment to calculate your borrowing amount.' });
      }
    }
    if (step === 'budget') {
      need('ptype', 'Choose what you are buying.'); need('cash', 'Your cash for the purchase (0 if none).'); need('cpf', 'Your CPF Ordinary Account for the purchase (0 if none).');
      if (selling(a)) { need('sprice', 'The price you expect to sell at.'); need('sloan', 'The loan still owing on it (0 if none).'); need('scpf', 'The CPF used for it, with interest (from the CPF website).'); }
      (ask || []).forEach((k) => need(k, k.indexOf('oa') === 0 ? 'Ordinary Account balance.' : 'Special Account balance.'));
    }
    return out;
  }

  /* ---------------- next steps for the plan (rule-based wording, no figures) ---------------- */
  function nextSteps(a, R) {
    a = a || {}; const s = [];
    if (R && R.budget) s.push('Ask a bank for an in-principle approval: it confirms the loan before you commit.');
    if (selling(a)) s.push('Line up the sale and the purchase: selling first is how your budget is worked out here.');
    if (selling(a) && a.htype !== 'private') s.push('Check HDB’s resale timeline and your minimum occupation period before you list.');
    if (a.sit === 'own') s.push('Keeping your home means ABSD on the next one: check whether the numbers still work for you.');
    if ((a.homes || []).length) s.push('Compare your shortlisted homes side by side in Research before viewings.');
    else s.push('Shortlist two or three developments within your budget in Budget Search.');
    s.push('Talk the plan through with Ken: timing, pricing and what to watch for.');
    return s.slice(0, 4);
  }

  /* ---------------- the summary sheet (Save as PDF), from the answers on screen ---------------- */
  function sheetOf(a, R, checked) {
    if (!R || !R.budget) return null;
    const sit = (SIT.find((x) => x[0] === a.sit) || [])[1] || '', who = two(a) ? 'two buyers' : 'one buyer';
    const homes = (R.homes || []).filter((h) => h && h.ok);
    return { tool: 'pmm', checked: checked, question: 'My property plan', basis: [sit + ', ' + who, (a.ptype === 'unsure' ? 'new launch or completed home' : a.ptype === 'new' ? 'new launch' : 'completed home'), selling(a) ? 'sell first, then buy' : 'no home sold'],
      figures: [{ key: 'budget', label: 'Maximum budget', value: $(R.budget.value), sub: R.budget.sub }, { key: 'loan', label: 'Bank loan at that price', value: $(R.budget.loan), sub: $(R.budget.monthly) + ' a month' },
        { key: 'cash', label: 'Cash needed upfront', value: $(R.budget.cash), sub: R.budget.cpf > 0 ? 'plus ' + $(R.budget.cpf) + ' of CPF' : 'no CPF used' }],
      judge: R.budget.judge,
      left: [{ title: 'Your situation', rows: R.facts.map((f) => ({ label: f[0], value: f[1] })) }].concat(R.sale ? [{ title: 'Your sale', rows: [{ label: 'After the loan and costs', value: $(R.sale.total) }, { label: 'As cash', value: R.sale.cash !== null ? $(R.sale.cash) : '—' }, { label: 'Back to CPF', value: R.sale.cpf !== null ? $(R.sale.cpf) : '—' }] }] : []),
      right: (homes.length ? [{ title: 'Homes you are considering', rows: homes.map((h) => ({ label: esc(h.name || 'A home'), sub: $(h.price) + ' · ' + (h.type === 'new' ? 'new launch' : 'completed'), value: $(h.cash) + ' cash' })) }] : [])
        .concat([{ title: 'Your next steps', rows: nextSteps(a, R).map((t, i) => ({ label: (i + 1) + '. ' + t, value: '' })) }]) };
  }
  // a step counts as done when it has nothing left to answer (My Options is optional)
  function stepDone(step, a, R) { if (step === 'options') return !!(a && a.optSeen); if (step === 'plan') return false; return stepNeeds(step, a, R && R.ask).length === 0 && (step !== 'budget' || !!(R && R.budget)); }

  /* ================= browser ================= */
  function mount(box) {
    if (!box || typeof document === 'undefined') return;
    const E = root.GW_ENGINE, C = root.GW_CALC, RULES = root.GW_RULES || {}, KPT = root.KPT || { track: function () {} };
    const track = (n, p) => { try { KPT.track(n, p || {}); } catch (e) { /* analytics unavailable */ } };
    const rootPath = (document.body && document.body.dataset.root) || '../';
    // the rules' check date in words, as on the calculators ("9 Oct 2026")
    const checked = (() => { const d = new Date(String(RULES.checked || '') + 'T00:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); })();
    const load = () => { try { const j = JSON.parse(root.sessionStorage.getItem(KEY) || 'null'); return j && j.v === 1 ? j : null; } catch (e) { return null; } };
    const S = load() || { v: 1, a: { p0res: 'SC', p1res: 'SC' }, homes: [] };
    S.a = S.a || {}; S.homes = Array.isArray(S.homes) ? S.homes : [];
    const save = () => { try { root.sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked: the journey still works on this page */ } };
    // older links into the checklist land on the matching situation, never over answers already given
    const old = (location.hash || '').replace('#', '');
    // only "Upgrade from HDB" says enough to choose for the visitor; #buy, #sell and #move (upgrade or right-size?) open on an unanswered Step 1
    const oldLink = (h) => { if (h === 'own') { location.replace(rootPath + 'journey/worth/' + (location.search || '')); return true; } if (!S.a.sit && h === 'up') { S.a.sit = 'upgrade'; S.a.htype = 'hdb'; } return false; };
    if (oldLink(old)) return;
    if (!S.a.sit) { try { const cx = JSON.parse(root.sessionStorage.getItem('gw.ctx.v1') || '{}') || {}; if (cx.type === 'hdb' || cx.type === 'condo') S.a.htype = S.a.htype || (cx.type === 'hdb' ? 'hdb' : 'private'); } catch (e) { /* none */ } }
    const idxOf = (h) => STEPS.findIndex((x) => x[0] === h);
    let R = {};   // the engines' answers for the current entries

    /* ---------- markup ---------- */
    const chips = (k, opts, o) => '<div class="pmm-chips' + (o && o.cls ? ' ' + o.cls : '') + '" role="radiogroup" data-k="' + k + '">' + opts.map((x) => '<button type="button" role="radio" data-v="' + x[0] + '" aria-checked="false"><b>' + esc(x[1]) + '</b>' + (x[2] ? '<small>' + esc(x[2]) + '</small>' : '') + '</button>').join('') + '</div>';
    const q = (label, inner, o) => '<div class="pmm-q"' + (o && o.show ? ' data-show="' + o.show + '"' : '') + ' data-q="' + (o && o.k || '') + '"><span class="pmm-l">' + label + (o && o.opt ? ' <em>optional</em>' : '') + '</span>' + inner + (o && o.hint ? '<small class="pmm-h">' + o.hint + '</small>' : '') + '<small class="pmm-need" data-need-for="' + (o && o.k || '') + '" hidden></small></div>';
    const money = (k, ph) => '<span class="pmm-in"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" data-k="' + k + '" data-t="money" placeholder="' + esc(ph || '') + '"></span>';
    const numIn = (k, ph, unit) => '<span class="pmm-in"><input type="text" inputmode="numeric" autocomplete="off" data-k="' + k + '" data-t="num" placeholder="' + esc(ph || '') + '">' + (unit ? '<i class="u">' + unit + '</i>' : '') + '</span>';
    const person = (k) => '<fieldset class="pmm-p"' + (k ? ' data-show="n:2"' : '') + '><legend><span data-show="n:1">You</span><span data-show="n:2">Person ' + (k + 1) + '</span></legend><div class="pmm-g2">' +
      q('Age', numIn('p' + k + 'age', 'e.g. ' + (k ? '34' : '36'), 'years'), { k: 'p' + k + 'age' }) + q('Monthly income', money('p' + k + 'inc', 'e.g. ' + (k ? '6,000' : '8,000')), { k: 'p' + k + 'inc', hint: 'Before CPF. 0 if none.' }) + '</div>' +
      q('Residency', chips('p' + k + 'res', RES, { cls: 'pmm-sm' }), { k: 'p' + k + 'res' }) + '</fieldset>';
    function stepHtml(st) {
      if (st === 'situation') return '<h2 class="pmm-t" tabindex="-1">My Situation</h2><p class="pmm-sub">Tell us about your home and plans, so the budget and options fit you.</p>' +
        q('My current situation', chips('sit', SIT, { cls: 'pmm-4' }), { k: 'sit' }) +
        q('Who is buying?', chips('n', [['1', 'Just me'], ['2', 'Two of us']], { cls: 'pmm-sm' }), { k: 'n' }) +
        '<div class="pmm-ps">' + person(0) + person(1) + '</div>' +
        q('Married, buying in both names?', chips('couple', [['yes', 'Yes'], ['no', 'No']], { cls: 'pmm-sm' }), { k: 'couple', show: 'n:2', opt: true, hint: 'Only changes stamp duty for some couples. Not answered, it is not assumed.' }) +
        '<div class="pmm-home" data-show="owning">' + '<p class="pmm-st">The home you own</p>' +
          q('Type', chips('htype', [['hdb', 'HDB flat'], ['private', 'Private home']], { cls: 'pmm-sm' }), { k: 'htype' }) +
          q('Owned by', chips('hown', [['0', 'Person 1'], ['1', 'Person 2'], ['both', 'Both']], { cls: 'pmm-sm' }), { k: 'hown', show: 'n:2' }) +
          q('Still paying a home loan on it?', chips('hloan', [['yes', 'Yes'], ['no', 'No, fully paid']], { cls: 'pmm-sm' }), { k: 'hloan' }) +
          q('Its monthly repayment', money('hmo', 'a month'), { k: 'hmo', show: 'hloan:yes' }) + '</div>' +
        q('When do you plan to move?', chips('when', WHEN, { cls: 'pmm-sm' }), { k: 'when', opt: true });
      if (st === 'budget') return '<h2 class="pmm-t" tabindex="-1">My Budget</h2><p class="pmm-sub">Your maximum budget from your income, cash and CPF' + (selling(S.a) ? ', and your sale' : '') + '. Change any figure and it updates.</p>' +
        '<div class="pmm-budget"><div class="pmm-bin">' +
        q('What are you buying?', chips('ptype', PTYPE, { cls: 'pmm-sm' }), { k: 'ptype', hint: 'A private home. Looking at an HDB flat? <a href="https://www.hdb.gov.sg/cs/infoweb/residential/buying-a-flat/working-out-your-flat-budget/budget-for-flat" target="_blank" rel="noopener">HDB’s flat budget calculator</a>.' }) +
        '<div class="pmm-g2">' + q('Cash for the purchase', money('cash', 'e.g. 150,000'), { k: 'cash' }) + q('CPF Ordinary Account you can use', money('cpf', 'e.g. 120,000'), { k: 'cpf' }) + '</div>' +
        q('Other monthly loan repayments', money('debts', 'car, personal, cards'), { k: 'debts', opt: true }) +
        '<div class="pmm-home" data-show="selling"><p class="pmm-st">Your sale</p>' +
          q('Expected selling price', money('sprice', 'e.g. 700,000'), { k: 'sprice', hint: 'Not sure? <a href="' + rootPath + 'journey/worth/?plan=v2" data-pmm-worth>See what similar homes sold for ›</a>' }) +
          '<div class="pmm-g2">' + q('Loan still owing', money('sloan', '0 if none'), { k: 'sloan' }) + q('CPF used for it, with interest', money('scpf', 'from the CPF website'), { k: 'scpf', hint: 'CPF website › Home ownership. It goes back to your CPF when you sell.' }) + '</div></div>' +
        '<div class="pmm-home" data-show="askcpf"><p class="pmm-st">CPF while you keep your home</p><p class="pmm-note">CPF Board sets aside part of your CPF while you still own a home. Your balances show how much of it can go into this one.</p>' +
          '<div class="pmm-g2">' + q('<span data-show="n:2">Person 1: </span>Ordinary Account', money('oa0', 'balance'), { k: 'oa0' }) + q('<span data-show="n:2">Person 1: </span>Special Account', money('sa0', 'balance'), { k: 'sa0' }) + '</div>' +
          '<div class="pmm-g2" data-show="n:2">' + q('Person 2: Ordinary Account', money('oa1', 'balance'), { k: 'oa1' }) + q('Person 2: Special Account', money('sa1', 'balance'), { k: 'sa1' }) + '</div>' +
          q('Does the lease of the home you keep run past age 95?', chips('c95', [['yes', 'Yes'], ['no', 'No']], { cls: 'pmm-sm' }), { k: 'c95', opt: true, hint: 'Not answered, the larger set-aside is used.' }) + '</div>' +
        '</div><div class="pmm-res" data-res aria-live="polite"></div></div>';
      if (st === 'options') return '<h2 class="pmm-t" tabindex="-1">My Options</h2><p class="pmm-sub">Find homes within your budget, and check the ones you like.</p>' +
        '<div class="pmm-opts"><a class="pmm-opt" href="' + rootPath + 'tools/what-can-i-buy/?plan=v2" data-pmm-explore><b>Explore homes within your budget</b><span data-explore-sub>Sizes and developments, as a list and on a map.</span><i>›</i></a>' +
        '<a class="pmm-opt" href="' + rootPath + 'research/" data-pmm-research data-gw-go="research" data-pulse-for="buy"><b>Research a development</b><span>Recent sales, rents and how prices have moved. Compare two side by side.</span><i>›</i></a>' +
        (selling(S.a) && S.a.htype === 'hdb' ? '<a class="pmm-opt" href="' + rootPath + 'tools/hdb-upgrade/" data-pmm-hdbup><b>Upgrading from HDB, in detail</b><span>The HDB upgrade planner: your flat’s value, sale proceeds, budget and timing on one page.</span><i>›</i></a>' : '') + '</div>' +
        '<p class="pmm-st">Homes you are considering</p><p class="pmm-note">Add a price to see the cash, loan and monthly instalment for that home, from the same calculations as your budget.</p>' +
        '<div class="pmm-homes" data-homes></div><button type="button" class="pmm-add" data-add-home>+ Add a home</button>';
      if (st === 'plan') return '<h2 class="pmm-t" tabindex="-1">My Plan</h2><p class="pmm-sub">Your answers and results in one place.</p><div data-plan></div>';
      return '';
    }
    function shell() {
      box.innerHTML = '<div class="pmm-top"><ol class="pmm-steps" aria-label="Plan My Move progress">' + STEPS.map((x, i) => '<li data-si="' + x[0] + '"><a href="#' + x[0] + '" data-go="' + x[0] + '"><i>' + (i + 1) + '</i><span>' + esc(x[1]) + '</span></a></li>').join('') + '</ol></div>' +
        '<div class="pmm-body"><section class="pmm-card" data-card aria-labelledby="pmmT"><p class="pmm-k" data-k-step></p><div data-step></div>' +
        '<div class="pmm-nav"><button type="button" class="pmm-back" data-back>← Back</button><span class="pmm-why" data-why aria-live="polite"></span><button type="button" class="pmm-next" data-next>Continue →</button></div></section>' +
        '<aside class="pmm-side" aria-label="My journey"><p class="pmm-sh">My journey</p><ol data-side>' + STEPS.map((x) => '<li data-sj="' + x[0] + '"><a href="#' + x[0] + '" data-go="' + x[0] + '"><b>' + esc(x[1]) + '</b><span data-sj-sub>' + esc(x[2]) + '</span></a></li>').join('') + '</ol>' +
        '<p class="pmm-fine">Your answers stay in this browser tab. <button type="button" class="pmm-lnk" data-restart>Start again</button></p></aside></div>';
    }

    /* ---------- state <-> inputs ---------- */
    const qs = (s) => box.querySelector(s), qa = (s) => [].slice.call(box.querySelectorAll(s));
    function fill() {
      qa('[data-k]').forEach((el) => {
        const k = el.dataset.k, v = S.a[k];
        if (el.classList.contains('pmm-chips')) el.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
        else if (el.tagName === 'INPUT' && document.activeElement !== el) el.value = v === undefined || v === null ? '' : (el.dataset.t === 'money' && num(v) !== null ? Math.round(num(v)).toLocaleString('en-US') : String(v));
      });
    }
    function visible() {
      const a = S.a, ok = { 'n:1': !two(a), 'n:2': two(a), owning: owning(a), selling: selling(a), 'hloan:yes': a.hloan === 'yes', askcpf: !!(R.ask && R.ask.length) };
      qa('[data-show]').forEach((el) => { el.hidden = !ok[el.dataset.show]; });
    }

    /* ---------- the engines ---------- */
    function compute() {
      const a = S.a; R = { facts: facts(a) };
      if (!E) return R;
      const types = a.ptype === 'unsure' ? ['new', 'completed'] : a.ptype ? [a.ptype] : [];
      const bw = E.borrow(caseOf(a, types[0] || 'completed'));
      if (bw.status === 'ok') R.borrow = bw.figures;
      if (selling(a)) { const sl = E.sale(caseOf(a, types[0] || 'completed')); if (sl.status === 'ok') R.sale = sl.figures; R.saleBlock = sl; }
      const runs = types.map((t) => ({ t: t, b: E.afford(caseOf(a, t)) }));
      const ask = []; runs.forEach((x) => { const v = x.b.value || {}; if (v.state === 'ask-cpf' && v.cpfNeed && v.cpfNeed.missing) v.cpfNeed.missing.forEach((m) => { const k = m.replace('.', ''); if (ask.indexOf(k) < 0) ask.push(k); }); });
      R.ask = ask; R.runs = runs;
      const ok = runs.filter((x) => x.b.status === 'ok' && x.b.figures.budget > 0);
      if (ok.length === runs.length && ok.length) {
        // not sure of the type: the lower budget leads, both are said (no budget is ever raised by an unanswered choice)
        const lead = ok.slice().sort((x, y) => x.b.figures.budget - y.b.figures.budget)[0], v = lead.b.value, top = v.top;
        R.budget = { value: lead.b.figures.budget, type: lead.t, loan: top.loan, monthly: top.monthly, cash: top.cashNeed, cpf: top.cpfUsed, duty: top.duty, absd: top.absd, limitedBy: lead.b.figures.limitedBy, estimate: !!v.estimate,
          both: ok.length === 2 ? ok.map((x) => [x.t, x.b.figures.budget]) : null, assumptions: lead.b.assumptions, provisional: lead.b.provisional, years: lead.b.figures.years, ratePct: lead.b.figures.ratePct };
        R.budget.sub = lead.t === 'new' ? 'New launch' : 'Completed home';
        R.budget.judge = judge(R.budget);
      } else if (runs.some((x) => x.b.status === 'stop')) R.stop = runs.find((x) => x.b.status === 'stop').b;
      R.homes = S.homes.map((h) => homeOf(h));
      return R;
    }
    function judge(B) {
      return B.limitedBy === 'funds' ? 'Your cash and CPF set the limit here: banks could lend more on your income.' : B.limitedBy === 'income' ? 'Your income sets the limit here: it is the most banks lend on it.' : B.limitedBy === 'payments' ? 'The timing of the payments sets the limit here.' : 'Your figures set the limit here.';
    }
    function homeOf(h) {
      const price = num(h.price); if (!(price > 0) || !E) return { ok: false, name: h.name, why: price > 0 ? '' : 'Add its price.' };
      const t = h.type === 'new' ? 'new' : 'completed', c = E.cost(caseOf(S.a, t, price));
      if (c.status !== 'ok') return { ok: false, name: h.name, why: c.missing.length ? 'Finish My Budget first.' : 'This price can’t be worked out with your answers.' };
      const v = c.value;
      return { ok: true, name: h.name, price: price, type: t, cash: v.cash, cpf: v.cpfUsed, loan: v.loan, monthly: v.monthly, duty: v.duty, absd: v.absd, within: R.budget ? price <= R.budget.value : null };
    }
    function facts(a) {
      const f = [], sit = SIT.find((x) => x[0] === a.sit);
      if (sit) f.push(['Situation', sit[1] + ' · ' + sit[2].toLowerCase()]);
      if (a.n) f.push(['Buying', two(a) ? 'Two of you' : 'On your own']);
      if (owning(a) && a.htype) f.push(['Your home', (a.htype === 'private' ? 'Private home' : 'HDB flat') + (a.hloan === 'yes' ? ', with a home loan' : a.hloan === 'no' ? ', fully paid' : '')]);
      const w = WHEN.find((x) => x[0] === a.when); if (w) f.push(['Moving', w[1]]);
      return f;
    }

    /* ---------- painting ---------- */
    let cur = 'situation';
    function paintResults() {
      const el = qs('[data-res]'); if (!el) return;
      const a = S.a, B = R.budget, needs = stepNeeds('budget', a, R.ask).concat(stepNeeds('situation', a));
      if (B) {
        const rows = [['Bank loan at that price', $(B.loan), $(B.monthly) + ' a month over ' + B.years + ' years at ' + B.ratePct + '%'], ['Cash needed upfront', $(B.cash), B.cpf > 0 ? 'plus ' + $(B.cpf) + ' of CPF' : 'No CPF used'], ['Stamp duty, in that', $(B.duty), B.absd > 0 ? 'Includes ' + $(B.absd) + ' ABSD' : 'No ABSD']];
        el.innerHTML = '<div class="pmm-ans"><p class="pmm-ek">Your maximum budget</p><p class="pmm-big" data-budget>' + $(B.value) + '</p><p class="pmm-bs">' + esc(B.sub) + '</p>' +
          (B.both ? '<p class="pmm-both" data-both>' + (B.both[0][1] === B.both[1][1] ? 'The same for a new launch or a completed home.' : 'New launch up to ' + $(B.both.find((x) => x[0] === 'new')[1]) + ' · completed home up to ' + $(B.both.find((x) => x[0] === 'completed')[1]) + '. The lower one leads.') + '</p>' : '') +
          rows.map((r) => '<div class="pmm-row"><span>' + r[0] + '<small>' + r[2] + '</small></span><b>' + r[1] + '</b></div>').join('') +
          (R.sale ? '<div class="pmm-row"><span>From your sale<small>After the loan and costs' + (R.sale.cash !== null ? ': ' + $(R.sale.cash) + ' cash, ' + $(R.sale.cpf) + ' to CPF' : '') + '</small></span><b data-sale>' + $(R.sale.total) + '</b></div>' : '') +
          '<p class="pmm-judge">' + esc(B.judge) + '</p>' +
          '<details class="pmm-how"><summary>How this is worked out</summary><ul>' + (B.assumptions || []).map((x) => '<li>' + esc(assumeText(x)) + '</li>').filter(Boolean).join('') + (B.provisional || []).map((p) => '<li>' + esc(p.note) + '</li>').join('') +
          (selling(a) ? '<li>Your home is sold first; the sale counts once it completes.</li>' : '') + (B.estimate ? '<li>For a new launch, whether your cash and CPF cover each payment on time is not checked here: that needs your monthly savings (Purchase Costs &amp; Timeline shows it).</li>' : '') + '<li>Legal and valuation fees, renovation and furnishing are not included.</li><li>' + esc('Planning estimates from MAS, IRAS, CPF and HDB rules' + (checked ? ' as checked ' + checked : '') + '. Not a bank offer.') + '</li></ul></details></div>';
      } else if (R.stop) {
        const why = R.stop.reason === 'no-income' ? 'With no income entered there is no loan to work out. Add an income, including a co-borrower’s.' : 'At these figures no home price fits: the cash and CPF don’t cover the upfront costs of even the lowest price.';
        el.innerHTML = '<div class="pmm-ans pmm-wait"><p class="pmm-ek">Your maximum budget</p><p class="pmm-wh">No budget at these figures</p><p class="pmm-note">' + esc(why) + '</p></div>';
      } else {
        el.innerHTML = '<div class="pmm-ans pmm-wait" data-wait><p class="pmm-ek">Your maximum budget</p><p class="pmm-wh">' + (needs.length ? 'Waiting for ' + (needs.length === 1 ? 'one answer' : needs.length + ' answers') : 'Working it out') + '</p>' +
          (needs.length ? '<ul class="pmm-nl">' + needs.slice(0, 4).map((n) => '<li>' + esc(n.text) + '</li>').join('') + '</ul>' : '') +
          (R.borrow ? '<div class="pmm-row"><span>Banks may lend about<small>On your income, over ' + R.borrow.years + ' years</small></span><b data-borrow>' + $(R.borrow.maxLoan) + '</b></div>' : '') + '</div>';
      }
    }
    function assumeText(x) {
      const k = x.key;
      if (k === 'financing.ratePct') return 'Interest rate ' + x.value + '% (Groundwork’s planning rate; banks quote their own).';
      if (k === 'financing.years') return 'Loan tenure ' + x.value + ' years: the longest your age allows, ending by 65.';
      if (k === 'ltvJointSeparateLoans') return 'Two borrowers’ separate housing loans are each counted (the bank confirms).';
      if (k === 'purchase.valuation') return 'The valuation is taken as the price.';
      if (/^people\[\d\]\.res$/.test(k)) return 'Residency taken as Singapore Citizen.';
      if (k === 'people.age') return 'Age taken as ' + x.value + '.';
      return '';
    }
    function paintHomes() {
      const el = qs('[data-homes]'); if (!el) return;
      el.innerHTML = S.homes.map((h, i) => { const r = R.homes[i] || {};
        return '<div class="pmm-hm" data-hi="' + i + '"><div class="pmm-g3"><label class="pmm-q"><span class="pmm-l">Name <em>optional</em></span><span class="pmm-in"><input type="text" maxlength="' + UI.nameMax + '" data-hk="name" placeholder="e.g. a development"></span></label>' +
          '<label class="pmm-q"><span class="pmm-l">Price</span><span class="pmm-in"><i>$</i><input type="text" inputmode="decimal" data-hk="price" data-t="money" placeholder="e.g. 1,800,000"></span></label>' +
          '<div class="pmm-q"><span class="pmm-l">Type</span><div class="pmm-chips pmm-sm" data-hk="type">' + PTYPE.slice(0, 2).map((x) => '<button type="button" role="radio" data-v="' + x[0] + '" aria-checked="' + ((h.type || 'completed') === x[0]) + '"><b>' + x[1] + '</b></button>').join('') + '</div></div></div>' +
          '<div class="pmm-hr" data-hr>' + homeRes(r) + '</div><button type="button" class="pmm-lnk pmm-rm" data-rm>Remove</button></div>'; }).join('');
      qa('[data-hi]').forEach((d) => { const h = S.homes[+d.dataset.hi]; d.querySelector('[data-hk="name"]').value = h.name || ''; const p = d.querySelector('[data-hk="price"]'); p.value = num(h.price) ? Math.round(num(h.price)).toLocaleString('en-US') : ''; wireMoney(p); });
      const add = qs('[data-add-home]'); if (add) add.hidden = S.homes.length >= MAX_HOMES;
    }
    function homeRes(r) {
      if (!r.ok) return '<p class="pmm-note">' + esc(r.why || 'Add its price.') + '</p>';
      return '<span class="pmm-tag ' + (r.within ? 'in' : 'over') + '">' + (r.within === null ? '' : r.within ? 'Within your budget' : 'Above your budget') + '</span>' +
        '<div class="pmm-mini"><span><small>Cash upfront</small><b>' + $(r.cash) + '</b></span><span><small>CPF</small><b>' + $(r.cpf) + '</b></span><span><small>Bank loan</small><b>' + $(r.loan) + '</b></span><span><small>Monthly</small><b>' + $(r.monthly) + '</b></span><span><small>Stamp duty</small><b>' + $(r.duty) + '</b></span></div>';
    }
    function paintHomeResults() { qa('[data-hi]').forEach((d) => { const i = +d.dataset.hi, hr = d.querySelector('[data-hr]'); if (hr) hr.innerHTML = homeRes(R.homes[i] || {}); }); }
    function paintPlan() {
      const el = qs('[data-plan]'); if (!el) return;
      const a = S.a, B = R.budget, H = (R.homes || []).filter((h) => h.ok);
      el.innerHTML = '<div class="pmm-sum">' +
        '<section><h3>Your situation</h3>' + R.facts.map((f) => '<div class="pmm-row"><span>' + esc(f[0]) + '</span><b>' + esc(f[1]) + '</b></div>').join('') + '</section>' +
        '<section><h3>Your budget</h3>' + (B ? '<p class="pmm-big" data-plan-budget>' + $(B.value) + '</p><p class="pmm-bs">' + esc(B.sub) + ' · bank loan ' + $(B.loan) + ' · ' + $(B.monthly) + ' a month · ' + $(B.cash) + ' cash upfront' + (B.cpf > 0 ? ' and ' + $(B.cpf) + ' of CPF' : '') + '</p><p class="pmm-judge">' + esc(B.judge) + '</p>' : '<p class="pmm-note">Finish My Budget to see it here. <a href="#budget" data-go="budget">Go to My Budget ›</a></p>') +
          (R.sale ? '<div class="pmm-row"><span>From your sale<small>After the loan and costs</small></span><b>' + $(R.sale.total) + '</b></div>' : '') + '</section>' +
        '<section><h3>Homes you are considering</h3>' + (H.length ? H.map((h) => '<div class="pmm-row"><span>' + esc(h.name || 'A home') + '<small>' + $(h.price) + ' · ' + (h.type === 'new' ? 'new launch' : 'completed') + ' · ' + (h.within ? 'within your budget' : 'above your budget') + '</small></span><b>' + $(h.cash) + '<small>cash upfront · ' + $(h.monthly) + '/mo</small></b></div>').join('') : '<p class="pmm-note">None yet. <a href="#options" data-go="options">Add one in My Options ›</a></p>') + '</section>' +
        '<section><h3>Your next steps</h3><ol class="pmm-next-l">' + nextSteps(Object.assign({}, a, { homes: H }), R).map((t) => '<li>' + esc(t) + '</li>').join('') + '</ol></section></div>' +
        '<div class="pmm-acts">' + (B ? '<button type="button" class="pmm-next" data-pdf>Save as PDF</button>' : '') + '<a class="pmm-ken" href="https://wa.me/6590908898" target="_blank" rel="noopener" data-pmm-ken data-gw-wa="pmm-plan">Talk it through with Ken</a></div>';
    }
    function paintNav() {
      const i = idxOf(cur);
      qs('[data-k-step]').textContent = 'Step ' + (i + 1) + ' of ' + STEPS.length;
      qa('[data-si]').forEach((li) => { const k = idxOf(li.dataset.si), d = k < i || stepDone(li.dataset.si, S.a, R); li.classList.toggle('done', d && k !== i); li.toggleAttribute('aria-current', k === i); if (k === i) li.setAttribute('aria-current', 'step'); });
      qa('[data-sj]').forEach((li) => { const k = idxOf(li.dataset.sj); li.classList.toggle('now', k === i); li.classList.toggle('done', k !== i && stepDone(li.dataset.sj, S.a, R)); const sub = li.querySelector('[data-sj-sub]'); sub.textContent = sideSub(li.dataset.sj); });
      const back = qs('[data-back]'), next = qs('[data-next]');
      back.disabled = i === 0; next.hidden = i === STEPS.length - 1; next.textContent = i === STEPS.length - 2 ? 'See my plan →' : 'Continue →';
    }
    function sideSub(st) {
      const a = S.a;
      if (st === 'situation' && stepDone('situation', a, R)) return R.facts.slice(0, 2).map((f) => f[1].split(' · ')[0]).join(' · ');
      if (st === 'budget' && R.budget) return 'Budget about ' + $(R.budget.value);
      if (st === 'options' && R.homes && R.homes.some((h) => h.ok)) return R.homes.filter((h) => h.ok).length + (R.homes.filter((h) => h.ok).length === 1 ? ' home' : ' homes') + ' checked';
      return STEPS[idxOf(st)][2];
    }
    function update() {
      compute(); fill(); visible();
      if (cur === 'budget') paintResults();
      if (cur === 'options') { paintHomeResults(); const sub = qs('[data-explore-sub]'); if (sub) sub.textContent = R.budget ? 'Up to ' + $(R.budget.value) + ': sizes and developments, as a list and on a map.' : 'Sizes and developments, as a list and on a map.'; }
      paintNav(); clearNeeds(); save();
    }
    function clearNeeds() { qa('[data-need-for]').forEach((n) => { n.hidden = true; n.textContent = ''; const qq = n.closest('.pmm-q'); if (qq) qq.classList.remove('pmm-needf'); }); const w = qs('[data-why]'); if (w) w.textContent = ''; }
    function showNeeds(list) {
      list.forEach((n) => { const m = qs('[data-need-for="' + n.key + '"]'); if (!m) return; m.hidden = false; m.textContent = n.text; m.closest('.pmm-q').classList.add('pmm-needf'); });
      const w = qs('[data-why]'); if (w) w.textContent = list.length === 1 ? 'One answer to add above.' : list.length + ' answers to add above.';
      const first = list.map((n) => qs('[data-need-for="' + n.key + '"]')).find((m) => m && !m.closest('[hidden]'));
      if (first) { first.closest('.pmm-q').scrollIntoView({ block: 'center', behavior: 'smooth' }); const f = first.closest('.pmm-q').querySelector('input, button'); if (f) try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
    }
    function go(st, how) {
      if (idxOf(st) < 0) st = 'situation';
      // a later step opens only once the earlier ones are complete (My Options is optional)
      for (let k = 0; k < idxOf(st); k++) { const s0 = STEPS[k][0]; if (s0 !== 'options' && !stepDone(s0, S.a, R)) { st = s0; break; } }
      cur = st; S.step = st; if (st === 'options') S.a.optSeen = true;
      qs('[data-step]').innerHTML = stepHtml(st);
      qa('[data-step] input[data-t="money"]').forEach(wireMoney);
      update();
      if (st === 'options') paintHomes();
      if (st === 'plan') paintPlan();
      const h = '#' + st;
      try { if (how === 'push' && location.hash !== h) history.pushState({ pmm: st }, '', h); else if (how !== 'pop' && location.hash !== h) history.replaceState({ pmm: st }, '', h); } catch (e) { /* history blocked */ }
      if (how === 'push' || how === 'pop') { const t = qs('.pmm-t'); const top = box.getBoundingClientRect().top + root.scrollY - UI.scrollPad; if (root.scrollY > top) root.scrollTo({ top: top, behavior: 'auto' }); if (t) try { t.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
      track('journey_step', { journey: 'plan-my-move', step: st });
    }
    function wireMoney(x) { if (root.GW_MONEY && !x.__w) { x.__w = 1; root.GW_MONEY.wire(x, { parse: (t) => { const r = C ? C.parseMoney(t) : { value: num(t) }; return r && typeof r.value === 'number' ? r.value : null; }, max: C && C.LIMITS ? C.LIMITS.money.max : undefined }); } }

    /* ---------- events ---------- */
    shell();
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k] [data-v]');
      if (b && box.contains(b)) { const k = b.closest('[data-k]').dataset.k; S.a[k] = b.dataset.v; if (k === 'n' && b.dataset.v === '1' && S.a.hown && S.a.hown !== '0') S.a.hown = '0'; update(); return; }
      const hb = e.target.closest('[data-hk="type"] [data-v]');
      if (hb) { const i = +hb.closest('[data-hi]').dataset.hi; S.homes[i].type = hb.dataset.v; hb.parentNode.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-checked', String(x === hb))); update(); return; }
      if (e.target.closest('[data-add-home]')) { S.homes.push({ name: '', price: '', type: S.a.ptype === 'new' ? 'new' : 'completed' }); update(); paintHomes(); const last = qa('[data-hi]').pop(); if (last) last.querySelector('[data-hk="price"]').focus(); return; }
      if (e.target.closest('[data-rm]')) { S.homes.splice(+e.target.closest('[data-hi]').dataset.hi, 1); update(); paintHomes(); return; }
      const g = e.target.closest('[data-go]');
      if (g) { e.preventDefault(); go(g.dataset.go, 'push'); return; }
      if (e.target.closest('[data-next]')) {
        const need = cur === 'situation' || cur === 'budget' ? stepNeeds(cur, S.a, R.ask) : [];
        if (need.length) { update(); showNeeds(need); track('journey_blocked', { journey: 'plan-my-move', step: cur, missing: need.length }); return; }
        if (cur === 'budget' && !R.budget) { const w = qs('[data-why]'); if (w) w.textContent = R.stop ? 'No budget at these figures: change them above, or talk to Ken.' : 'Your budget is still being worked out.'; return; }
        go(STEPS[idxOf(cur) + 1][0], 'push'); return;
      }
      if (e.target.closest('[data-back]')) { const prev = STEPS[Math.max(0, idxOf(cur) - 1)][0]; if (history.state && history.state.pmm && history.state.pmm === cur && idxOf(cur) > 0 && root.sessionStorage.getItem('gw.pmm.nav') === '1') history.back(); else go(prev, 'push'); return; }
      if (e.target.closest('[data-restart]')) { try { root.sessionStorage.removeItem(KEY); } catch (x) { /* ignore */ } S.a = { p0res: 'SC', p1res: 'SC' }; S.homes = []; go('situation', 'push'); track('journey_restart', { journey: 'plan-my-move' }); return; }
      if (e.target.closest('[data-pdf]')) { if (root.GW_SHEET) root.GW_SHEET.print(() => track('pdf_saved', { tool_name: 'plan-my-move' })); return; }
      if (e.target.closest('[data-pmm-explore]') && R.budget) {
        // Budget Search's own handoff contract (kpt-market.js readHandoff): the budget only, on this tap, in this tab
        const ages = (caseOf(S.a, 'completed').people || []).map((p) => p.age).filter((x) => typeof x === 'number');
        try { root.sessionStorage.setItem('kpt.handoff', JSON.stringify({ v: 1, from: 'planner', state: 'ok', budget: { low: R.budget.value, high: R.budget.value, single: true }, maxAge: ages.length ? Math.max.apply(null, ages) : null, src: null, j: 1 })); } catch (x) { /* storage blocked */ }
        track('tool_selected', { tool: 'what-can-i-buy', placement: 'plan-my-move' });
      }
    });
    box.addEventListener('input', (e) => {
      const x = e.target;
      if (x.dataset.k) { S.a[x.dataset.k] = x.value.trim() === '' ? '' : (x.dataset.t === 'money' || x.dataset.t === 'num' ? (num(x.value) === null ? '' : num(x.value)) : x.value); update(); return; }
      if (x.dataset.hk) { const i = +x.closest('[data-hi]').dataset.hi; S.homes[i][x.dataset.hk] = x.dataset.hk === 'price' ? num(x.value) : x.value.slice(0, UI.nameMax); compute(); paintHomeResults(); paintNav(); save(); }
    });
    root.addEventListener('popstate', () => { const h = (location.hash || '').replace('#', ''); if (idxOf(h) >= 0 && h !== cur) go(h, 'pop'); });
    root.addEventListener('hashchange', () => {
      const h = (location.hash || '').replace('#', '');
      if (idxOf(h) >= 0) { if (h !== cur) go(h, 'pop'); return; }
      // an older link followed on this page (the menu's Buy / Sell / Upgrade from HDB): the same as arriving with it
      if (h && !oldLink(h)) go(h === 'up' && !stepDone('situation', S.a, R) ? 'situation' : cur, 'replace');
    });
    if (root.GW_SHEET) root.GW_SHEET.wire(() => sheetOf(Object.assign({}, S.a, { homes: (R.homes || []).filter((h) => h.ok) }), R, checked));
    // a step's own Back (data-back) uses the browser's history only for entries this page pushed
    try { root.sessionStorage.setItem('gw.pmm.nav', '1'); } catch (e) { /* ignore */ }
    compute();
    const want = idxOf(old) >= 0 ? old : (S.step || 'situation');
    go(want, 'load');
  }
  if (typeof document !== 'undefined') { const run = () => mount(document.querySelector('[data-pmm]')); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run(); }
  return { STEPS, SIT, caseOf, stepNeeds, stepDone, nextSteps, sheetOf, mount, KEY };
});
