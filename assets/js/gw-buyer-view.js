/* ==========================================================================
   GROUNDWORK — the buyer's view of an answer (one answer, in plain words).
   Takes a result from GW_ANSWER.assess() (and, for a price being judged, the quote already attached to it) and says what a buyer needs to read: ONE headline,
   one short sentence, two supporting figures, where the money comes from when a home is sold, and what each date check is and is not. It does no financial
   arithmetic: every amount is a field GW_ANSWER already worked out (or a sum/difference of two of them, shown as such). Nothing here changes a rule.
   Three questions stay separate, always:
     - estimated affordability   (the headline and sentence: is the money there?)
     - eligibility               (never confirmed here; a bank decides)
     - payment dates             (basis: not checked | standard schedule | your option date | your monthly amounts; outcome: covered | short | projected)
   Shared by the Planner now; Buy, Sell and the professional tools can read the same view. UMD: window.GW_VIEW; Node uses require().
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GW_VIEW = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (n) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
  const $s = (n) => (n >= 1e6 ? '$' + (Math.floor(n / 1e4) / 100).toFixed(2) + 'm' : n >= 1000 ? '$' + Math.floor(n / 1000).toLocaleString('en-US') + 'k' : $(n));
  const $m = (n) => (n >= 1e6 ? (n % 1e4 === 0 ? $s(n).replace(/\.00m$/, 'm').replace(/(\.\d)0m$/, '$1m') : $(n)) : n % 1000 === 0 ? $s(n) : $(n));
  const r100 = (n) => Math.round(n / 100) * 100;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? +m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : (iso || ''); };
  const pc = (x, d) => (Math.round(x * 100 * Math.pow(10, d || 0)) / Math.pow(10, d || 0)) + '%';
  const plural = (n) => n + (n === 1 ? ' year' : ' years');
  const b = (t) => '<b>' + t + '</b>';
  const rateTxt = (res) => pc((res.ratePct === undefined ? 4 : res.ratePct) / 100, 2);

  // the one sentence under the maximum: which limit decided it (wording approved in the Planner, unchanged)
  const LIMIT_TXT = {
    funds: 'Your current budget is limited by your available cash and CPF.',
    income: 'Your current budget is limited by your borrowing capacity.',
    choice: 'Your current budget is limited by the loan amount you chose.',
    payments: 'Your current budget is limited by the cash and CPF you will have when each payment is due.',
  };
  const ELIGIBILITY = {
    label: 'Not confirmed',
    short: 'Eligibility is not confirmed. A bank decides.',
    text: 'Estimated from MAS lending rules. A bank’s own assessment, the property’s valuation and your CPF usage limits are not checked, so this is not a confirmation that you qualify.',
  };

  // The payment-date check, in two parts that are never merged: what the check was BASED ON, and what it FOUND.
  //   basis   'unchecked' (a new launch with no monthly amounts: no date was tested)
  //           'standard'  (a completed home on the standard schedule from today; nothing of the buyer's own timing)
  //           'option'    (a completed home from the option date the buyer entered)
  //           'monthly'   (a new launch, tested with the monthly amounts the buyer entered; stage dates are the earliest each could fall)
  //   result  'none' | 'ok' | 'short' (a payment cannot be met, with the date and amount) | 'projected' (the price is covered, but a later payment is not)
  function datesOf(res, a, o) {
    const kind = res.kind, otpEntered = !!(o && o.otpEntered);
    let basis, label;
    if (!res.checked) { basis = 'unchecked'; label = 'Not checked'; }
    else if (kind === 'new') { basis = 'monthly'; label = 'Your monthly amounts'; }
    else if (otpEntered) { basis = 'option'; label = 'Your option date'; }
    else { basis = 'standard'; label = 'Standard schedule'; }
    const out = { basis: basis, label: label, result: 'none', first: null, summary: '', estimated: basis === 'standard' || basis === 'monthly', hasTable: !!(res.checked && a && a.tl) };
    if (basis === 'unchecked') { out.summary = 'No payment date has been tested yet. Add what goes in each month to check them.'; return out; }
    if (!a) return out;
    if (a.covered === false && a.firstGap) {
      const gapStatic = a.gap > 0.5, firstOk = a.firstAmt > 0, amount = firstOk ? a.firstAmt : (gapStatic ? a.gap : a.peak), cause = String(a.firstCause || a.peakCause || 'a payment').toLowerCase();
      out.first = { date: a.firstGap, amount: amount, cause: cause };
      out.result = gapStatic ? 'short' : 'projected';
      out.summary = gapStatic ? 'First short on ' + b(day(a.firstGap)) + ': ' + b($(r100(amount))) + ' (' + esc(cause) + ').'
        : 'Projected shortfall from ' + b(day(a.firstGap)) + ': ' + b($(r100(amount))) + ' (' + esc(cause) + '). A projection from the amounts you entered, not a shortfall today.';
      return out;
    }
    out.result = 'ok';
    out.summary = basis === 'standard' ? 'Every payment is covered on the standard schedule, starting today.' : basis === 'option' ? 'Every payment is covered from the option date you entered.' : 'Every payment is covered with the monthly amounts you entered. Stages with no date yet are tested at the earliest day they could be called.';
    return out;
  }

  // Where the money comes from when a home is sold first. The sale only helps from the day it completes, so it is shown apart from what is in hand now.
  function saleOf(res, a) {
    const s = res.sale;
    if (res.basis !== 'sell' || !s || !s.counted || !a) return null;
    const cashNow = Math.max(0, a.haveCash - s.cash), cpfNow = Math.max(0, a.haveCpf - s.cpf);
    const out = { now: { cash: cashNow, cpf: cpfNow }, later: { cash: s.cash, cpf: s.cpf }, warning: null, estimated: s.source !== 'entered' };
    const shortCash = s.cash < 0 ? -s.cash : 0;
    const nowTxt = 'You have ' + b($(cashNow)) + ' in cash' + (cpfNow > 0 ? ' and ' + b($(cpfNow)) + ' in CPF' : '') + ' now. ';
    out.html = nowTxt + (shortCash > 0
      ? 'Your sale would not cover its loan and costs, so you would add about ' + b($(shortCash)) + ' of your own cash.'
      : 'Your sale adds about ' + b($(s.cash)) + ' in cash' + (s.cpf > 0 ? ' and ' + b($(s.cpf)) + ' in CPF' : '') + ', but only once it completes.');
    // the first payments (option fee, exercise, stamp duty) fall due soon after signing; if they exceed what is in hand, the sale must complete first. Labelled as a projection.
    const due = a.tl && a.tl.events ? a.tl.events.filter((e) => e.type === 'pay' && /^(option|exercise|bsd)$/.test(e.id)) : [];
    const early = due.reduce((t, e) => t + (e.amount || 0), 0);
    if (due.length && early > cashNow + cpfNow + 0.5) out.warning = 'Projected: the option fee, exercise payment and stamp duty come to ' + b($(r100(early))) + ', more than the ' + b($(cashNow + cpfNow)) + ' you have now. If they fall due before your sale completes, you would be about ' + b($(r100(early - cashNow - cpfNow))) + ' short at that point.';
    return out;
  }

  // The view of one result. `o`: { otpEntered: the buyer typed an option date, twoBuyers }.
  function build(res, o) {
    if (!res || res.state !== 'ok') return null;
    o = o || {};
    const price = !!res.priceIsOwn, a = price ? res.at : (res.atComfortable || res.atHighest), budget = res.budget !== undefined ? res.budget : (res.comfortable !== null ? res.comfortable : res.highest);
    const v = { mode: price ? 'price' : 'max', estimate: true, eligibility: ELIGIBILITY, price: price ? res.price : null, maximum: budget, kind: res.kind, basis: res.basis };
    v.dates = datesOf(res, a, o);
    v.sale = saleOf(res, a);
    const cap = res.borrow && res.borrow.max > 0 ? Math.floor(res.borrow.max / 1e4) * 1e4 : null;
    if (!price) {
      v.kicker = 'Your maximum property budget'; v.tone = 'ok';
      v.headline = $(budget); v.answer = budget;
      v.lead = LIMIT_TXT[res.limitedBy] || LIMIT_TXT.funds;
      v.supports = [
        a ? { k: 'Monthly mortgage', v: $(a.monthly), s: 'Over ' + plural(res.years) + ' at ' + rateTxt(res) } : null,
        cap ? { k: 'Borrowing capacity', v: $s(cap), s: 'The most your income supports' } : null,
      ].filter(Boolean);
      return v;
    }
    // a price being judged: ONE verdict, the money it needs, and the cash part that CPF cannot pay
    const P = res.price, zone = res.zone, need = a.upfront, haveT = a.have, minCash = a.cashOnly;
    v.kicker = 'At ' + $m(P);
    const needLine = 'You need ' + b($(need)) + ' in cash and CPF, at least ' + b($(minCash)) + ' of it in cash' + (v.sale ? '.' : ', and have ' + b($(haveT)) + '.');
    v.need = { total: need, minCash: minCash, have: haveT, shortCash: a.cashShort > 0.5 ? a.cashShort : 0 };
    if (zone === 'comfortable' || zone === 'tight') {
      v.tone = zone === 'tight' ? 'warn' : 'ok'; v.headline = zone === 'tight' ? 'Within your budget, but tight' : 'Within your budget'; v.answer = null;
      v.lead = (zone === 'tight' ? 'Only ' + b($(r100(a.spare))) + ' of cash would be left after buying. ' : (a.spare >= 1000 ? b($(r100(a.spare))) + ' of your cash would stay in hand after buying. ' : 'It uses almost all of your cash and CPF. ')) + needLine;
    } else if (a.gap > 0.5) {
      v.tone = 'over'; v.answer = r100(a.gap); v.headline = $(r100(a.gap)) + ' short'; v.shortfall = r100(a.gap);
      v.lead = needLine + (v.need.shortCash ? ' ' + b($(r100(a.cashShort))) + ' of the shortfall is cash, which CPF cannot cover.' : '') + ' Your maximum is ' + b($(budget)) + '.';
    } else {
      // the price is covered in total, but a dated payment is not: said as a projection, never as a shortfall today
      v.tone = 'over'; v.answer = r100(a.peak || (a.firstAmt || 0)); v.headline = 'Projected shortfall'; v.projected = true;
      v.lead = 'Your cash and CPF cover the price, but not every payment as it falls due' + (v.dates.first ? ': from ' + b(day(v.dates.first.date)) + ' you are projected to be ' + b($(r100(v.dates.first.amount))) + ' short (' + esc(v.dates.first.cause) + ')' : '') + '. Your maximum is ' + b($(budget)) + '.';
    }
    v.supports = [
      { k: 'Bank loan', v: $(a.loan), s: (a.limit === 'choice' ? 'The loan you chose' : a.limit === 'income' ? 'Limited by your income' : pc(a.ltv) + ' of the price') + (cap ? ' · you can borrow up to ' + $s(cap) : '') },
      { k: 'Monthly mortgage', v: $(a.monthly), s: 'Over ' + plural(res.years) + ' at ' + rateTxt(res) + (a.monthlyPct ? ' · ' + pc(a.monthlyPct) + ' of your income' : '') },
    ];
    return v;
  }

  return { build: build, datesOf: datesOf, saleOf: saleOf, LIMIT_TXT: LIMIT_TXT, ELIGIBILITY: ELIGIBILITY, fmt: { $: $, $s: $s, $m: $m, day: day } };
});
