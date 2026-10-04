/* =====================================================================
   HDB UPGRADE CALCULATOR — CALCULATION ENGINE (V1)
   ---------------------------------------------------------------------
   Pure functions, no page code. Reads regulatory values from
   data/rules/*.js and planning/market assumptions from
   data/assumptions/hdb-upgrade.js. Nothing regulatory is hard-coded here.

   Scope (V1): sell the HDB first, then buy ONE private residential
   property with a bank loan. Buyers: 1 or 2, Singapore Citizens and/or
   PRs, owning no other residential property after the sale.
   ===================================================================== */

(function (root) {
  'use strict';

  /* ---------- money maths ---------- */
  function pmt(rate, years, principal) {
    if (principal <= 0 || years <= 0) return 0;
    var r = rate / 12, n = Math.round(years * 12);
    return r === 0 ? principal / n : principal * r / (1 - Math.pow(1 + r, -n));
  }
  function pv(rate, years, monthly) {
    if (monthly <= 0 || years <= 0) return 0;
    var r = rate / 12, n = Math.round(years * 12);
    return r === 0 ? monthly * n : monthly * (1 - Math.pow(1 + r, -n)) / r;
  }

  /* Buyer's Stamp Duty: marginal bands from rules file (rounded down to $1) */
  function bsd(price, bands) {
    var tax = 0, prev = 0;
    for (var i = 0; i < bands.length; i++) {
      var top = bands[i].up_to == null ? Infinity : bands[i].up_to;
      if (price > prev) tax += (Math.min(price, top) - prev) * bands[i].rate;
      prev = top;
    }
    return Math.floor(tax);
  }

  /* ABSD rate for a purchase where buyers own no other residential property.
     Joint buyers: highest applicable rate, unless a married couple with at
     least one Singapore Citizen (first property) — remitted to 0. */
  function absdRate(buyers, married, absdRules) {
    var rates = buyers.map(function (b) { return absdRules.rates[b.cit][0]; });
    var highest = Math.max.apply(null, rates);
    var hasSC = buyers.some(function (b) { return b.cit === 'SC'; });
    if (highest > 0 && buyers.length === 2 && hasSC && married &&
        absdRules.married_sc_spr_first_property_remission) {
      return { rate: 0, remission: true };
    }
    return { rate: highest, remission: false };
  }

  /* Approximate CPF refund: assumes CPF was used evenly over the years owned,
     each year's amount earning accrued interest until the sale. */
  function estimateRefund(principalUsed, yearsOwned, rate, roundTo) {
    if (!(principalUsed > 0)) return 0;
    var n = Math.max(1, Math.round(yearsOwned));
    var factor = (1 + rate) * (Math.pow(1 + rate, n) - 1) / (rate * n);
    var est = principalUsed * factor;
    return Math.round(est / roundTo) * roundTo;
  }

  /* ---------- main calculation ---------- */
  function calculate(input, R, A) {
    var L = R.loanLimits, SD = R.stampDuty;
    var a = input.assumptions;          // already merged: defaults + user edits
    var out = { input: input, flags: {} };

    /* 1. Selling the HDB */
    var gst = R.gst.rate;
    var agentFee = input.price * a.agentFeePct * (1 + gst);
    var sellingCosts = agentFee + a.otherSelling;
    var afterLoan = input.price - input.loan;
    var refundPaid = Math.min(input.refund, Math.max(0, afterLoan));     // no cash top-up rule
    /* If the price doesn't cover the loan, the shortfall must be paid in cash. */
    var cashProceeds = (afterLoan < 0 ? afterLoan : afterLoan - refundPaid) - sellingCosts;
    out.sale = {
      price: input.price, loan: input.loan, afterLoan: afterLoan,
      refundOwed: input.refund, refundPaid: refundPaid,
      refundShortfall: Math.max(0, input.refund - refundPaid),
      agentFee: agentFee, otherSelling: a.otherSelling, sellingCosts: sellingCosts,
      cashProceeds: cashProceeds
    };
    out.flags.negativeEquity = afterLoan < 0;
    out.flags.refundShortfall = out.sale.refundShortfall > 0;
    out.flags.costsFromSavings = cashProceeds < 0;

    /* 2. Funds after the sale */
    var cashAvail = input.cash + cashProceeds;
    var cpfAvail = input.oa + refundPaid;
    out.funds = { cashSavings: input.cash, cashAvail: cashAvail, oa: input.oa, cpfAvail: cpfAvail };

    /* 3. Income, age and loan limits */
    var hair = L.variable_income_haircut.value;
    var gross = 0, assessed = 0, ageW = 0, ageSum = 0, maxAge = 0;
    input.buyers.forEach(function (b) {
      gross += b.income;
      assessed += Math.max(0, b.income - hair * b.variable);
      ageW += b.age * b.income;
      ageSum += b.age;
      maxAge = Math.max(maxAge, b.age);
    });
    var iwaa = gross > 0 ? ageW / gross : ageSum / input.buyers.length;
    var tdsrMonthly = L.tdsr.value * assessed - input.debts;
    var stress = L.medium_term_rate_floor.value;
    var planMonthlyLimit = a.planDti * gross - input.debts;
    out.income = { gross: gross, assessed: assessed, iwaa: iwaa, tdsrMonthly: tdsrMonthly,
                   planMonthlyLimit: planMonthlyLimit, debts: input.debts };
    out.flags.age55 = maxAge >= R.cpfHousing.refund_age_55_plus_to_ra_first.from_age;

    var ta = L.ltv_first_loan.tier_a, tb = L.ltv_first_loan.tier_b;
    var paths = [];
    var tenA = Math.min(ta.max_tenure_years, Math.floor(ta.loan_must_end_by_age - iwaa));
    /* "Age" is reported as the limit only when it materially shortens the
       loan (tenure under 25 years) — otherwise income is the honest answer. */
    if (tenA >= 1) paths.push({ key: 'A', ltv: ta.ltv, minCash: ta.min_cash, tenure: tenA,
                                shortenedByAge: tenA < 25 });
    var tenB = Math.min(tb.max_tenure_years, Math.floor(a.bankMaxAge - iwaa));
    if (tenB >= 1) paths.push({ key: 'B', ltv: tb.ltv, minCash: tb.min_cash, tenure: tenB,
                                shortenedByAge: true });
    paths.forEach(function (p) {
      p.capReg = pv(stress, p.tenure, Math.max(0, tdsrMonthly));
      p.capPlan = Math.min(p.capReg, pv(a.planRate, p.tenure, Math.max(0, planMonthlyLimit)));
    });

    /* 4. Stamp duty profile */
    var ab = absdRate(input.buyers, input.married, SD.absd);
    out.absd = ab;

    /* 5. Search for the highest price that passes every constraint */
    function evaluate(P, path, mode) {
      var cap = mode === 'plan' ? path.capPlan : path.capReg;
      var loan = Math.max(0, Math.min(cap, path.ltv * P));
      var bsdAmt = bsd(P, SD.bsd_residential.bands);
      var absdAmt = Math.floor(ab.rate * P);
      var upfront = P - loan + bsdAmt + absdAmt + a.purchaseFees;
      var minCashAmt = path.minCash * P;
      var buffer = mode === 'plan' ? a.planBufferMonths * (pmt(a.planRate, path.tenure, loan) + input.debts) : 0;
      var reserve = mode === 'plan' ? input.reserve : 0;
      var cashUsable = cashAvail - buffer - reserve;
      return {
        price: P, path: path, loan: loan, loanCap: cap, bsd: bsdAmt, absd: absdAmt,
        fees: a.purchaseFees, upfront: upfront, minCash: minCashAmt,
        buffer: buffer, reserve: reserve, cashUsable: cashUsable,
        cpfNeeded: Math.max(0, upfront - Math.max(0, cashUsable)),
        okCash: cashUsable >= minCashAmt,
        okFunds: cashUsable + cpfAvail >= upfront
      };
    }

    function solve(mode) {
      var best = null;
      paths.forEach(function (path) {
        var lo = 0, hi = 30000000;
        var e0 = evaluate(0, path, mode);
        if (!(e0.okCash && e0.okFunds)) {
          var z = evaluate(0, path, mode); z.limit = 'funds';
          if (!best) best = z;
          return;
        }
        for (var i = 0; i < 60; i++) {
          var mid = (lo + hi) / 2, e = evaluate(mid, path, mode);
          if (e.okCash && e.okFunds) lo = mid; else hi = mid;
        }
        var P = Math.floor(lo / 1000) * 1000;
        var res = evaluate(P, path, mode);
        res.limit = limitingFactor(P, path, mode, tdsrMonthly, planMonthlyLimit);
        if (!best || res.price > best.price) best = res;
      });
      if (!best) return null;
      best.tenure = best.path.tenure;
      best.monthly = pmt(a.rate, best.tenure, best.loan);
      best.monthlyPlanRate = pmt(a.planRate, best.tenure, best.loan);
      return best;
    }

    function limitingFactor(P, path, mode, tdsrM, planM) {
      var next = evaluate(P + 10000, path, mode);
      if (!next.okCash) {
        if (mode === 'plan' && (next.buffer + next.reserve) > 0) {
          var noBuf = cashAvail >= next.minCash;
          if (noBuf) return 'buffer';
        }
        return 'cash';
      }
      var capBinds = next.loan < path.ltv * next.price - 1;
      if (capBinds) {
        if (mode === 'plan' && path.capPlan < path.capReg - 1) return 'planMonthly';
        if (tdsrM <= 0) return 'debts';
        return path.shortenedByAge ? 'age' : 'income';
      }
      return 'funds';
    }

    out.paths = paths;
    out.max = paths.length ? solve('max') : null;
    out.plan = paths.length ? solve('plan') : null;
    out.flags.noLoanPath = !paths.length;
    out.flags.absd = ab.rate > 0;
    return out;
  }

  root.KPT_HDB_UPGRADE = { calculate: calculate, estimateRefund: estimateRefund,
                           bsd: bsd, pmt: pmt, pv: pv, absdRate: absdRate };
})(typeof window !== 'undefined' ? window : globalThis);
