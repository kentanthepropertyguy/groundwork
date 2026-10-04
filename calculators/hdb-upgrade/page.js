/* =====================================================================
   HDB UPGRADE CALCULATOR — PAGE BEHAVIOUR (V1)
   Guided steps, live results, Ken's take, workings and rules list.
   All maths lives in engine.js; all rule values in data/rules/*.js.
   ===================================================================== */
(function () {
  'use strict';

  var R = window.KPT_RULES, A = window.KPT_ASSUMPTIONS.hdbUpgrade, E = window.KPT_HDB_UPGRADE;
  var money = KPT.fmt.money;
  var $ = function (id) { return document.getElementById(id); };
  var form = document.querySelector('[data-kpt-inputs]');
  var THIS_YEAR = new Date().getFullYear();

  /* ---------- helpers ---------- */
  function raw(id) { return String($(id).value || '').replace(/[^0-9.]/g, ''); }
  function num(id) { var v = raw(id); return v === '' ? null : Number(v); }
  function radio(name) { var el = form.querySelector('input[name="' + name + '"]:checked') || document.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : null; }
  function pct(v, dp) { return (v * 100).toFixed(dp == null ? 0 : dp).replace(/\.0+$/, '') + '%'; }
  function approx(v) { return '≈ ' + money(v); }
  function round1k(v) { return Math.round(v / 1000) * 1000; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* Format money fields with commas when the visitor leaves them */
  document.querySelectorAll('.kpt-money .kpt-input').forEach(function (el) {
    el.addEventListener('blur', function () { var v = raw(el.id); if (v !== '') el.value = Number(v).toLocaleString('en-SG'); });
  });

  /* ---------- assumptions: load defaults into the editable fields ---------- */
  var DEF = {
    aRate: A.market.mortgage_rate.value * 100,
    aAgent: A.market.agent_fee_pct.value * 100,
    aSell: A.market.other_selling_costs.value,
    aFees: A.market.purchase_fees_buffer.value,
    pRate: A.planning.rate.value * 100,
    pDti: A.planning.debt_to_income.value * 100,
    pBuf: A.planning.buffer_months.value
  };
  function loadDefaults() {
    Object.keys(DEF).forEach(function (k) {
      $(k).value = (k === 'aSell' || k === 'aFees') ? DEF[k].toLocaleString('en-SG') : String(DEF[k]);
    });
  }
  loadDefaults();
  $('aRate-note').textContent = 'Mortgage rate for the monthly estimate only (default ' + DEF.aRate + '%, as of ' +
    A.market.mortgage_rate.as_of + '). Not a guaranteed or available rate.';
  $('resetA').addEventListener('click', function () { loadDefaults(); update(); });

  function assumptions() {
    function val(id, d) { var v = num(id); return v == null ? d : v; }
    return {
      rate: val('aRate', DEF.aRate) / 100,
      agentFeePct: val('aAgent', DEF.aAgent) / 100,
      otherSelling: val('aSell', DEF.aSell),
      purchaseFees: val('aFees', DEF.aFees),
      bankMaxAge: A.market.bank_max_age.value,
      planRate: val('pRate', DEF.pRate) / 100,
      planDti: val('pDti', DEF.pDti) / 100,
      planBufferMonths: val('pBuf', DEF.pBuf)
    };
  }

  /* ---------- conditional fields ---------- */
  function syncVisibility() {
    $('mop-note').hidden = radio('mop') !== 'no';
    var est = radio('refundMode') === 'estimate';
    $('refund-known').hidden = est;
    $('refund-estimate').hidden = !est;
    var two = radio('buyers') === '2';
    document.querySelector('[data-buyer="2"]').hidden = !two;
    var mixed = two && radio('b1cit') !== radio('b2cit');
    $('married-field').hidden = !mixed;
    $('other-note').hidden = radio('otherProp') !== 'yes';
  }
  document.querySelectorAll('[data-var-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var box = document.querySelector('[data-var="' + b.dataset.varToggle + '"]');
      box.hidden = !box.hidden;
      if (box.hidden) $('b' + b.dataset.varToggle + 'var').value = '';
      update();
    });
  });

  /* ---------- CPF refund (known or approximate) ---------- */
  function refundInfo() {
    if (radio('refundMode') === 'known') {
      var r = num('refund');
      return r == null ? { ok: false, err: 'Enter your CPF refund, or choose "Estimate it".' } : { ok: true, value: r, approx: false };
    }
    var used = num('cpfUsed'), yr = num('yearBought');
    if (used == null || yr == null) return { ok: false, err: 'Enter the CPF used so far and the year you bought.' };
    if (yr < 1960 || yr > THIS_YEAR) return { ok: false, err: 'Check the year you bought.' };
    var est = E.estimateRefund(used, THIS_YEAR - yr, R.cpfHousing.refund_on_sale.accrued_interest_rate, A.cpf_estimator.round_to);
    return { ok: true, value: est, approx: true };
  }

  /* ---------- read and validate each step ---------- */
  function step1() {
    if (radio('mop') !== 'yes') return { ok: false, err: 'Your flat needs to meet its minimum occupation period first.' };
    var price = num('price');
    if (!price) return { ok: false, err: 'Enter your expected selling price.' };
    var ref = refundInfo();
    if (!ref.ok) return ref;
    return { ok: true, price: price, loan: num('loan') || 0, refund: ref.value, refundApprox: ref.approx };
  }
  function step2() {
    var n = radio('buyers') === '2' ? 2 : 1, buyers = [];
    for (var i = 1; i <= n; i++) {
      var age = num('b' + i + 'age'), inc = num('b' + i + 'inc'), v = num('b' + i + 'var') || 0;
      if (age == null || age < 21 || age > 99) return { ok: false, err: 'Enter an age between 21 and 99 for buyer ' + i + '.' };
      if (inc == null) return { ok: false, err: 'Enter the monthly income for buyer ' + i + ' (0 if not working).' };
      if (v > inc) return { ok: false, err: 'Commission or bonus can\'t be more than the total income for buyer ' + i + '.' };
      buyers.push({ cit: radio('b' + i + 'cit'), age: age, income: inc, variable: v });
    }
    if (!buyers.some(function (b) { return b.income > 0; })) return { ok: false, err: 'At least one buyer needs an income for a loan.' };
    if (radio('otherProp') === 'yes') return { ok: false, err: 'This calculator covers buyers who won\'t own another home after selling.' };
    var mixed = n === 2 && buyers[0].cit !== buyers[1].cit;
    return { ok: true, buyers: buyers, married: mixed ? radio('married') === 'yes' : true, debts: num('debts') || 0 };
  }
  function step3() { return { ok: true, oa: num('oa') || 0, cash: num('cash') || 0 }; }
  var STEPS = { 1: step1, 2: step2, 3: step3 };

  /* ---------- step navigation ---------- */
  var done = { 1: false, 2: false, 3: false };
  function stepEl(n) { return document.querySelector('[data-step="' + n + '"]'); }
  function setState(n, state) {
    var el = stepEl(n);
    el.classList.remove('is-open', 'is-done', 'is-locked');
    el.classList.add(state);
  }
  function summary(n) {
    if (n === 1) {
      var s = step1();
      return 'Selling at ' + money(s.price) + ' · loan ' + money(s.loan) + ' · CPF refund ' + (s.refundApprox ? '≈ ' : '') + money(s.refund);
    }
    if (n === 2) {
      var b = step2(), names = { SC: 'Citizen', SPR: 'PR' };
      var who = b.buyers.length === 1 ? '1 buyer (' + names[b.buyers[0].cit] + ')' :
        '2 buyers (' + names[b.buyers[0].cit] + ' + ' + names[b.buyers[1].cit] + ')';
      var inc = b.buyers.reduce(function (t, x) { return t + x.income; }, 0);
      return who + ' · ages ' + b.buyers.map(function (x) { return x.age; }).join(' & ') + ' · ' + money(inc) + '/month' +
        (b.debts ? ' · ' + money(b.debts) + ' other loans' : '');
    }
    var c = step3();
    return 'CPF OA ' + money(c.oa) + ' · cash ' + money(c.cash);
  }
  function showErr(n, msg) { var e = document.querySelector('[data-err="' + n + '"]'); e.textContent = msg || ''; e.hidden = !msg; }

  document.querySelectorAll('[data-next]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var n = +btn.dataset.next, r = STEPS[n]();
      if (!r.ok) { showErr(n, r.err); return; }
      showErr(n, '');
      done[n] = true;
      document.querySelector('[data-summary="' + n + '"]').textContent = summary(n);
      setState(n, 'is-done');
      var nextOpen = [1, 2, 3].filter(function (k) { return !done[k]; })[0];
      if (nextOpen) {
        setState(nextOpen, 'is-open');
        var t = stepEl(nextOpen);
        if (t.getBoundingClientRect().top < 0 || t.getBoundingClientRect().top > window.innerHeight * 0.6) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (window.innerWidth < 900) {
        document.querySelector('.kpt-tool__out').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      update();
    });
  });
  document.querySelectorAll('[data-edit]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var n = +btn.dataset.edit;
      [1, 2, 3].forEach(function (k) {
        if (k === n) setState(k, 'is-open');
        else if (done[k]) {
          document.querySelector('[data-summary="' + k + '"]').textContent = STEPS[k]().ok ? summary(k) : '';
          setState(k, 'is-done');
        } else setState(k, 'is-locked');
      });
    });
  });

  /* ---------- labels ---------- */
  var LIMIT = {
    income: 'Limited by: your income (loan limit)',
    age: 'Limited by: age and loan length',
    cash: 'Limited by: cash for the minimum downpayment',
    funds: 'Limited by: cash + CPF for the downpayment',
    debts: 'Limited by: your existing loan repayments',
    planMonthly: 'Limited by: the 35% monthly comfort limit',
    buffer: 'Limited by: the cash you keep aside'
  };

  /* ---------- main update ---------- */
  var last = null, completedOnce = false;

  function update() {
    syncVisibility();
    var s1 = step1();
    var notes = [];
    resetResults();
    if (!s1.ok) { render(null); return; }

    var s2 = step2(), s3 = step3();
    var allDone = done[1] && done[2] && done[3] && s2.ok;

    if (!allDone) {
      /* partial: show the sale picture only */
      var partial = E.calculate({
        price: s1.price, loan: s1.loan, refund: s1.refund,
        buyers: [{ cit: 'SC', age: 35, income: 1, variable: 0 }], married: true, debts: 0,
        oa: s3.oa, cash: s3.cash, reserve: 0, assumptions: assumptions()
      }, R, A);
      $('r-proceeds').textContent = signed(partial.sale.cashProceeds);
      if (done[3]) { $('r-cash').textContent = approx(partial.funds.cashAvail); $('r-cpf').textContent = approx(partial.funds.cpfAvail); }
      $('workings').hidden = true;
      if (partial.flags.negativeEquity) notes.push(['stop', 'Your selling price is below your outstanding loan. The shortfall would have to be paid in cash before you can sell.']);
      renderNotes(notes);
      return;
    }

    var input = {
      price: s1.price, loan: s1.loan, refund: s1.refund,
      buyers: s2.buyers, married: s2.married, debts: s2.debts,
      oa: s3.oa, cash: s3.cash, reserve: num('reserve') || 0,
      assumptions: assumptions()
    };
    var res = E.calculate(input, R, A);
    res.refundApprox = s1.refundApprox;
    last = res;
    render(res);
  }

  function signed(v) { return v < 0 ? '−' + money(-v).replace('$', '$') : approx(v); }

  function resetResults() {
    ['r-proceeds', 'r-cash', 'r-cpf', 'r-loancap', 'r-upfront', 'r-monthly'].forEach(function (id) { $(id).textContent = '—'; });
  }

  function render(res) {
    var maxEl = $('r-max'), planEl = $('r-plan');
    $('reserve-field').hidden = !res;
    $('r-switch').hidden = !res;
    $('workings').hidden = !res;
    $('r-limit-wrap').hidden = true;
    $('r-plan-limit-wrap').hidden = true;
    $('r-55').hidden = !(res && res.flags && res.flags.age55);
    $('r-max-label').textContent = (res && res.flags && res.flags.age55) ? 'Preliminary maximum upgrade estimate' : 'Estimated maximum based on your numbers';
    $('r-plan-tag').textContent = (res && res.flags && res.flags.age55) ? 'Preliminary planning figure' : 'Recommended planning figure';
    if (!res) {
      maxEl.innerHTML = '<span class="kpt-approx">≈</span>$—'; maxEl.classList.add('is-empty');
      planEl.innerHTML = '<span class="kpt-approx">≈</span>$—'; planEl.classList.add('is-empty');
      renderNotes([]);
      return;
    }

    var notes = [];
    if (res.flags.noLoanPath || !res.max) {
      maxEl.innerHTML = '<span class="kpt-approx">≈</span>$—'; planEl.innerHTML = '<span class="kpt-approx">≈</span>$—';
      notes.push(['stop', 'Based on the ages entered, a bank loan isn\'t likely to be available, so this calculator can\'t estimate a budget. Message me and we\'ll look at other options.']);
      renderNotes(notes);
      return;
    }

    var M = res.max, P = res.plan;
    maxEl.classList.remove('is-empty'); planEl.classList.remove('is-empty');
    maxEl.innerHTML = '<span class="kpt-approx">≈</span>' + money(round1k(M.price));
    planEl.innerHTML = '<span class="kpt-approx">≈</span>' + money(round1k(P.price));
    $('r-max-note').textContent = 'Estimated technical ceiling: what the rules and your numbers roughly allow. Not a bank approval.';
    $('r-limit').textContent = LIMIT[M.limit] || '';
    $('r-limit-wrap').hidden = !LIMIT[M.limit];
    $('r-plan-limit').textContent = LIMIT[P.limit] || '';
    $('r-plan-limit-wrap').hidden = !LIMIT[P.limit];
    $('r-plan-note').textContent = 'The figure I\'d plan around: tested at ' + pct(res.input.assumptions.planRate, 1) +
      ', repayments within ' + pct(res.input.assumptions.planDti) + ' of income, ' + res.input.assumptions.planBufferMonths +
      ' months of repayments kept in cash' + (res.input.reserve ? ' and ' + money(res.input.reserve) + ' set aside' : '') +
      '. My planning assumptions, not a government, bank or financial-advice limit.';

    /* summary rows for the chosen view */
    var view = radio('view') === 'plan' ? P : M;
    $('r-proceeds').textContent = signed(res.sale.cashProceeds);
    $('r-cash').textContent = approx(res.funds.cashAvail);
    $('r-cpf').textContent = approx(res.funds.cpfAvail) + (res.flags.age55 ? '*' : '');
    $('r-loancap').textContent = approx(round1k(view.loanCap));
    $('l-loancap').textContent = 'Estimated loan capacity (' + view.tenure + ' yrs)';
    $('r-upfront').textContent = approx(view.upfront);
    $('r-monthly').textContent = approx(view.monthly);
    $('l-monthly').textContent = 'Estimated monthly mortgage (at ' + pct(res.input.assumptions.rate, 2) + ')';

    /* notes */
    /* 55+ warning is shown directly under the main figure (#r-55) */
    if (res.refundApprox) notes.push(['warn', 'Your CPF refund is a rough estimate. For a reliable result, use the actual figure from your CPF home ownership dashboard.']);
    if (res.flags.negativeEquity) notes.push(['stop', 'Your selling price is below your outstanding loan. The shortfall has been taken from your savings.']);
    else if (res.flags.costsFromSavings) notes.push(['warn', 'Your sale doesn\'t cover the loan, CPF refund and selling costs, so about ' + money(-res.sale.cashProceeds) + ' would come from your savings.']);
    if (res.flags.refundShortfall) notes.push(['info', 'The sale can\'t fully refund your CPF (about ' + money(res.sale.refundShortfall) + ' short). No cash top-up is needed when you sell at market value, but that CPF won\'t be there for your next home.']);
    if (res.absd.remission) notes.push(['info', 'A married Singapore Citizen + PR couple buying their first home jointly may qualify for full ABSD remission, subject to IRAS conditions. We\'ve assumed it applies; if it doesn\'t, ' + pct(R.stampDuty.absd.rates.SPR[0]) + ' ABSD (≈ ' + money(Math.floor(R.stampDuty.absd.rates.SPR[0] * P.price)) + ' at Ken\'s Planning Budget) would be payable.']);
    else if (res.flags.absd) notes.push(['info', 'ABSD of ' + pct(res.absd.rate) + ' applies (≈ ' + money(P.absd) + ' at Ken\'s Planning Budget) because ' + (res.input.buyers.length === 2 ? 'a PR is buying without the married-couple remission.' : 'you\'re buying as a PR.')]);
    if (P.price > 0) notes.push(['info', 'Stamp duty of about ' + money(P.bsd + P.absd) + ' at Ken\'s Planning Budget is due within ' + R.stampDuty.payment.due_within_days + ' days of exercising the option. CPF can pay it, but usually as a reimbursement later, so have this in cash first.']);
    renderNotes(notes);

    renderWorkings(res, view);
    renderTake(res);

    var wa = 'My estimate showed Ken\'s Planning Budget of about ' + money(round1k(P.price)) +
      ' and a maximum of about ' + money(round1k(M.price)) + '.';
    KPT.setWaContext(wa);

    if (!completedOnce) {
      completedOnce = true;
      KPT.completed({
        budget_band: band(M.price), planning_band: band(P.price), limiting_factor: M.limit,
        planning_limit: P.limit, buyers: res.input.buyers.length,
        buyer_profile: res.input.buyers.map(function (b) { return b.cit; }).join('+'),
        age_55_flag: res.flags.age55 ? 'yes' : 'no', refund_estimated: res.refundApprox ? 'yes' : 'no'
      });
    }
  }

  function band(v) {
    if (v < 1000000) return 'under-1m';
    var lo = Math.floor(v / 500000) * 0.5;
    return lo.toFixed(1) + 'm-' + (lo + 0.5).toFixed(1) + 'm';
  }

  function renderNotes(list) {
    var cls = { info: 'kpt-note', warn: 'kpt-note kpt-note--warn', stop: 'kpt-note kpt-note--stop' };
    $('r-notes').innerHTML = list.map(function (n) { return '<p class="' + cls[n[0]] + '">' + n[1] + '</p>'; }).join('');
  }

  /* ---------- the full working, for the selected view ---------- */
  function renderWorkings(res, v) {
    var a = res.input.assumptions, s = res.sale, f = res.funds, inc = res.income, isPlan = v === res.plan;
    var T = { in: '<span class="kpt-tag">You entered</span>', est: '<span class="kpt-tag">Estimate</span>',
              as: '<span class="kpt-tag">Assumption</span>', rule: '<span class="kpt-tag">Rule</span>',
              plan: '<span class="kpt-tag kpt-tag--plan">Planning</span>' };
    function row(label, val, tag, total) { return '<tr' + (total ? ' class="is-total"' : '') + '><td>' + label + (tag || '') + '</td><td>' + val + '</td></tr>'; }
    function tbl(title, rows) { return '<p class="kpt-sub__title" style="margin:16px 0 4px">' + title + '</p><table class="kpt-workings">' + rows.join('') + '</table>'; }
    var gst = R.gst.rate;
    var path = v.path;
    var html = '';
    html += tbl('1. Selling your HDB', [
      row('Selling price', money(s.price), T.in),
      row('Less outstanding loan', '−' + money(s.loan), T.in),
      row('Less CPF refund (back to your CPF)', '−' + money(s.refundPaid), res.refundApprox ? T.est : T.in),
      row('Less agent fee (' + pct(a.agentFeePct, 1) + ' + ' + pct(gst) + ' GST)', '−' + money(s.agentFee), T.as),
      row('Less other selling costs', '−' + money(s.otherSelling), T.as),
      row('Cash proceeds', signed(s.cashProceeds), '', true)
    ]);
    html += tbl('2. What you have for the next home', [
      row('Cash savings', money(f.cashSavings), T.in),
      row('Plus cash proceeds', signed(s.cashProceeds), T.est),
      row('Cash available', money(f.cashAvail), '', true),
      row('CPF OA today', money(f.oa), T.in),
      row('Plus CPF refund', money(s.refundPaid), res.refundApprox ? T.est : T.in),
      row('CPF available' + (res.flags.age55 ? ' (may be lower, 55+)' : ''), money(f.cpfAvail), '', true)
    ]);
    var loanRows = [
      row('Gross monthly income', money(inc.gross), T.in),
      row('Income counted (commission/bonus at ' + pct(1 - R.loanLimits.variable_income_haircut.value) + ')', money(inc.assessed), T.rule),
      row('All debts within ' + pct(R.loanLimits.tdsr.value) + ' of income (TDSR)', money(R.loanLimits.tdsr.value * inc.assessed), T.rule),
      row('Less other loan repayments', '−' + money(inc.debts), T.in),
      row('Available for the mortgage', money(Math.max(0, inc.tdsrMonthly)), '', true),
      row('Income-weighted average age', inc.iwaa.toFixed(1), T.rule),
      row('Loan length used', path.tenure + ' years (' + pct(path.ltv) + ' loan, ' + pct(path.minCash) + ' minimum cash)', T.rule),
      row('Tested at stress rate', pct(R.loanLimits.medium_term_rate_floor.value, 1), T.rule),
      row('Loan the income supports', money(path.capReg), '', !isPlan)
    ];
    if (isPlan) {
      loanRows.push(row('Planning: repayments within ' + pct(a.planDti) + ' of income, at ' + pct(a.planRate, 1), money(Math.max(0, inc.planMonthlyLimit)) + '/mth', T.plan));
      loanRows.push(row('Planning loan limit', money(path.capPlan), '', true));
    }
    html += tbl('3. How much you could borrow', loanRows);
    var buy = [
      row(isPlan ? "Ken's Planning Budget" : 'Maximum upgrade budget', money(v.price), '', false),
      row('Loan (lower of income limit and ' + pct(path.ltv) + ' of price)', money(v.loan), T.est),
      row('Downpayment (price − loan)', money(v.price - v.loan), ''),
      row('…of which must be cash', money(v.minCash), T.rule),
      row('Buyer\'s stamp duty', money(v.bsd), T.rule),
      row('ABSD' + (res.absd.remission ? ' (remitted)' : ''), money(v.absd), T.rule),
      row('Legal and valuation', money(v.fees), T.as),
      row('Upfront funds required', money(v.upfront), '', true)
    ];
    if (isPlan) {
      buy.push(row('Cash buffer kept (' + a.planBufferMonths + ' months)', money(v.buffer), T.plan));
      if (v.reserve) buy.push(row('Renovation / emergency reserve', money(v.reserve), T.in));
    }
    buy.push(row('Monthly mortgage at ' + pct(a.rate, 2), money(v.monthly), T.as));
    if (isPlan) buy.push(row('Monthly mortgage at planning rate ' + pct(a.planRate, 1), money(v.monthlyPlanRate), T.plan));
    html += tbl('4. Buying at ' + (isPlan ? "Ken's Planning Budget" : 'your maximum budget'), buy);
    $('workings-body').innerHTML = html;
  }

  /* ---------- Ken's take: chosen by what's limiting the budget ---------- */
  function renderTake(res) {
    var M = res.max, P = res.plan, a = res.input.assumptions, out = [];
    var gap = M.price - P.price;
    var msg = {
      income: 'Your income, not your savings, is setting the ceiling. Banks test your loan at ' + pct(R.loanLimits.medium_term_rate_floor.value, 0) + ' even when actual rates are lower, so the loan is smaller than many people expect. The real question isn\'t whether you can get the loan, but whether you\'re comfortable with the monthly payment for the full ' + M.tenure + ' years.',
      age: 'Age is shortening your loan to ' + M.tenure + ' years, and that\'s what\'s limiting your budget. A shorter loan means higher repayments for the same amount. If you\'re planning a joint purchase, how the incomes and ages combine can make a real difference, so this is worth planning carefully.',
      cash: 'You have the income for a bigger loan, but cash is the bottleneck: at least ' + pct(M.path.minCash) + ' of the price must be paid in cash, not CPF. A better selling price or more savings will move your budget more than a pay rise would.',
      funds: 'The loan isn\'t holding you back; your downpayment is. Your cash and CPF together set the limit, so your selling price and your CPF refund matter a lot. Every extra dollar from the sale goes almost straight into your budget.',
      debts: 'Your existing loan repayments are taking up the room a mortgage would need. Clearing a car or personal loan before you buy can raise your budget far more than the amount you pay off.'
    };
    out.push(msg[M.limit] || msg.income);
    if (gap > 50000) {
      out.push('The difference between ' + money(round1k(M.price)) + ' and my planning figure of ' + money(round1k(P.price)) +
        ' is the cost of stretching. At the planning budget your repayments stay within ' + pct(a.planDti) +
        ' of income even at ' + pct(a.planRate, 1) + ', and you keep ' + money(round1k(P.buffer)) + ' in cash for the unexpected. For most families, that\'s the more comfortable number to plan around.');
    } else {
      out.push('Your maximum and my planning figure are close, which is a good sign. You\'re not relying on stretching to make the upgrade work.');
    }
    if (res.flags.age55) out.push('Because one of you is 55 or older, part of your CPF refund may go to your Retirement Account first. Treat these numbers as an upper estimate until we check your CPF figures together.');
    else if (res.refundApprox) out.push('Your CPF refund was estimated. The real figure from CPF can move your budget, so it\'s worth checking before you start viewing.');
    var take = $('take');
    take.querySelectorAll(':scope > p').forEach(function (p) { p.remove(); });
    out.forEach(function (t) { var p = document.createElement('p'); p.textContent = t; take.appendChild(p); });
  }

  /* ---------- rules and assumptions list (from the data files) ---------- */
  function renderRules() {
    var L = R.loanLimits, SD = R.stampDuty, C = R.cpfHousing, H = R.hdb, mk = A.market, pl = A.planning;
    var d = KPT.fmt.date;
    function link(u) { return u ? ' · <a href="' + esc(u) + '" target="_blank" rel="noopener">Source</a>' : ''; }
    function r(name, val, kind, meta, src) {
      return '<div class="kpt-rules__row"><span>' + name + ' <span class="kpt-tag' + (kind === 'Planning' ? ' kpt-tag--plan' : '') + '">' + kind + '</span></span><span>' + val + '</span>' +
        '<span class="kpt-rules__meta">' + meta + link(src) + '</span></div>';
    }
    var bands = SD.bsd_residential.bands.map(function (b) { return pct(b.rate); }).join(' / ');
    var rows = [
      r('Total Debt Servicing Ratio', pct(L.tdsr.value), 'Rule', 'MAS · effective ' + d(L.tdsr.effective_from) + ' · checked ' + d(L.checked_on), L.tdsr.source),
      r('Stress-test interest rate (minimum)', pct(L.medium_term_rate_floor.value, 1), 'Rule', 'MAS · effective ' + d(L.medium_term_rate_floor.effective_from) + ' · banks may use a higher rate', L.medium_term_rate_floor.source),
      r('Commission / bonus counted at', pct(1 - L.variable_income_haircut.value), 'Rule', 'MAS TDSR framework (at least 30% haircut)', L.variable_income_haircut.source),
      r('Loan limit, no other housing loan', pct(L.ltv_first_loan.tier_a.ltv) + ' or ' + pct(L.ltv_first_loan.tier_b.ltv), 'Rule', '75% (5% min cash) if ≤30 years and ending by 65; otherwise 55% (10% min cash), up to 35 years · MAS · from ' + d(L.ltv_first_loan.effective_from), L.ltv_first_loan.source),
      r('Buyer\'s stamp duty', bands, 'Rule', 'Marginal bands up to $180k / $360k / $1m / $1.5m / $3m / above · effective ' + d(SD.bsd_residential.effective_from), SD.bsd_residential.source),
      r('ABSD, first home', 'Citizen ' + pct(SD.absd.rates.SC[0]) + ' · PR ' + pct(SD.absd.rates.SPR[0]), 'Rule', 'Highest rate applies to joint buyers. A married Singapore Citizen + PR couple buying their first home jointly may qualify for full remission, subject to IRAS conditions · effective ' + d(SD.absd.effective_from), SD.absd.remission_source),
      r('CPF refund on sale', 'CPF used + ' + pct(C.refund_on_sale.accrued_interest_rate, 1) + ' interest', 'Rule', 'CPF used for the property plus accrued interest generally has to be refunded to CPF when it is sold, after the housing loan is repaid · CPF Board', C.refund_on_sale.source),
      r('Sale proceeds not enough for the refund', 'No cash top-up', 'Rule', 'If the price after repaying the housing loan can\'t cover the full refund, no cash top-up is needed when sold at market value · CPF Board', C.no_cash_top_up_if_sold_at_market_value.source),
      r('Owners aged 55+', 'Retirement Account first', 'Rule', 'Part of the refund may go to the Retirement Account first. The amount depends on the year each owner turned 55, so it isn\'t calculated here; results are marked preliminary · CPF Board', C.refund_age_55_plus_to_ra_first.source),
      r('Minimum occupation period', H.mop_years.standard + ' years (' + H.mop_years.plus + ' for Plus/Prime)', 'Rule', 'HDB · checked ' + d(H.checked_on), H.source),
      r('GST on agent fee', pct(R.gst.rate), 'Rule', 'IRAS · effective ' + d(R.gst.effective_from), R.gst.source),
      r('Mortgage rate (monthly estimate)', pct(mk.mortgage_rate.value, 2), 'Assumption', 'As of ' + mk.mortgage_rate.as_of + '. Not a guaranteed or available rate.', mk.mortgage_rate.reference),
      r('Agent fee', pct(mk.agent_fee_pct.value, 1) + ' + GST', 'Assumption', mk.agent_fee_pct.note),
      r('Other selling costs', money(mk.other_selling_costs.value), 'Assumption', mk.other_selling_costs.note),
      r('Purchase legal and valuation', money(mk.purchase_fees_buffer.value), 'Assumption', mk.purchase_fees_buffer.note),
      r('Latest age banks lend to', String(mk.bank_max_age.value), 'Assumption', mk.bank_max_age.note),
      r('Planning rate', pct(pl.rate.value, 1), 'Planning', 'Ken\'s Planning Budget only'),
      r('Planning share of income', pct(pl.debt_to_income.value), 'Planning', pl.debt_to_income.note),
      r('Planning cash buffer', pl.buffer_months.value + ' months', 'Planning', pl.buffer_months.note)
    ];
    $('rules-list').innerHTML = rows.join('');
  }
  renderRules();

  /* Fill rule-based numbers in the explanatory text from the data files */
  (function fillRuleText() {
    var L = R.loanLimits, pl = A.planning;
    var map = { tdsr: pct(L.tdsr.value), stress: pct(L.medium_term_rate_floor.value, 1), varcount: pct(1 - L.variable_income_haircut.value),
                ltva: pct(L.ltv_first_loan.tier_a.ltv), ltvb: pct(L.ltv_first_loan.tier_b.ltv),
                prate: pct(pl.rate.value, 1), pdti: pct(pl.debt_to_income.value), pbuf: String(pl.buffer_months.value) };
    document.querySelectorAll('[data-rule]').forEach(function (el) { if (map[el.dataset.rule]) el.textContent = map[el.dataset.rule]; });
    $('r-plan-note').textContent = 'Complete the three steps to see your budget. It\'s the figure I\'d plan around: tested at ' + map.prate + ', repayments within ' + map.pdti + ' of income, and ' + map.pbuf +
      ' months of repayments kept in cash. My planning assumptions, not a government, bank or financial-advice limit.';
  })();

  /* live updates */
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  $('reserve').addEventListener('input', update);
  document.querySelectorAll('input[name="view"]').forEach(function (r) { r.addEventListener('change', update); });
  update();
})();
