/* ==========================================================================
   HDB Upgrade — calculation engine (V1: sell-first, private residential,
   SC/PR buyers). Pure functions: no DOM, no storage, no network.
   Regulatory rules come from rules.js; modelling assumptions from assumptions.js.

   Two separate engines share one solver:
   - REGULATORY MAXIMUM: optimises across the valid MAS structures.
   - PLANNING RANGE: one fixed, defined structure (assumptions.planningStructure),
     never optimised for the highest price.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rules.js'), require('./assumptions.js'));
  } else {
    root.KPT_HDB = factory(root.KPT_RULES, root.KPT_ASSUMPTIONS);
  }
})(typeof self !== 'undefined' ? self : this, function (RULES, DEFAULTS) {
  'use strict';

  // ------------------------------------------------------------------ helpers
  function bsd(price) {
    let remaining = price, total = 0;
    for (const band of RULES.bsdBands) {
      const slice = Math.min(remaining, band.width);
      total += slice * band.rate;
      remaining -= slice;
      if (remaining <= 0) break;
    }
    return Math.floor(total);
  }

  function annuityFactor(annualRate, years) {
    const n = Math.round(years * 12);
    if (n <= 0) return 0;
    const r = annualRate / 12;
    return (1 - Math.pow(1 + r, -n)) / r;
  }

  function weightedAge(buyers) {
    const totalIncome = buyers.reduce((s, b) => s + b.income, 0);
    return buyers.reduce((s, b) => s + b.age * b.income, 0) / totalIncome;
  }

  function floorTo(x, step) { return Math.floor(x / step) * step; }

  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  // Largest price P with: P + BSD(P) + ABSD + purchase costs <= (funds - reserve) + loan,
  // where loan = min(LTV * P, loanCap). The left side minus the right side only ever rises
  // with P, so bisection is exact enough.
  function solveMaxPrice(p) {
    const avail = p.funds - p.reserve;
    const f = (P) => P + bsd(P) + p.absdRate * P + p.purchaseCosts - Math.min(p.ltv * P, p.loanCap) - avail;
    if (f(0) > 0) return 0;
    let lo = 0, hi = 100e6;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) <= 0) lo = mid; else hi = mid;
    }
    return lo;
  }

  // One financing scenario: solve the price, then apply the minimum-cash cap.
  function runScenario(s) {
    const loanCap = Math.max(0, s.incomeCap * s.income - s.debts) * annuityFactor(s.rate, s.tenureYears);
    const uncapped = solveMaxPrice({
      funds: s.funds, reserve: s.reserve, loanCap, ltv: s.ltv,
      absdRate: s.absdRate, purchaseCosts: s.purchaseCosts,
    });
    // Minimum cash: cash on hand must cover the reserve plus minCashPct of the price.
    const cashCap = Math.max(0, (s.cashAvailable - s.reserve) / s.minCashPct);
    const capped = uncapped > cashCap;
    const price = capped ? cashCap : uncapped;
    const duties = price > 0 ? bsd(price) + s.absdRate * price : 0;
    const required = price + duties + (price > 0 ? s.purchaseCosts : 0) - (s.funds - s.reserve);
    const loan = Math.max(0, Math.min(required, s.ltv * price, loanCap));
    let binding;
    if (capped) binding = 'minimum-cash';
    else if (loanCap < s.ltv * price - 0.5) binding = 'income';
    else binding = 'cash';
    return {
      price, uncappedPrice: uncapped, loan, loanCap, binding, capped,
      tenureYears: s.tenureYears, ltv: s.ltv, minCashPct: s.minCashPct,
      bsd: price > 0 ? bsd(price) : 0, absd: Math.floor(s.absdRate * price),
    };
  }

  // ------------------------------------------------------------- validation
  function validate(input) {
    const errors = [];
    const need = (cond, field, message) => { if (!cond) errors.push({ field, message }); };
    need(isNum(input.salePrice) && input.salePrice > 0, 'salePrice', 'Enter your expected sale price.');
    need(isNum(input.outstandingLoan) && input.outstandingLoan >= 0, 'outstandingLoan', 'Enter your outstanding loan (0 if none).');
    const buyers = input.buyers;
    need(Array.isArray(buyers) && (buyers.length === 1 || buyers.length === 2), 'buyers', 'Choose one or two buyers.');
    if (Array.isArray(buyers)) {
      buyers.forEach((b, i) => {
        need(b && isNum(b.age) && b.age >= 21 && b.age <= 80, `buyers[${i}].age`, 'Enter an age between 21 and 80.');
        need(b && isNum(b.income) && b.income > 0, `buyers[${i}].income`, 'Enter a gross monthly income.');
      });
    }
    return errors;
  }

  // --------------------------------------------------------------- analyse
  function analyse(input, overrides) {
    const A = Object.assign({}, DEFAULTS, overrides || {});
    const defaultsApplied = [];
    const optional = (key, fallback) => {
      if (input[key] === undefined || input[key] === null || input[key] === '') { defaultsApplied.push(key); return fallback; }
      return input[key];
    };

    const timing = optional('timing', 'sell-first');
    if (timing === 'buy-first') {
      return { state: 'buy-first', planning: null, regulatory: null, longerTenure: null, cash: null,
        flags: [], diagnosis: null, defaultsApplied, assumptions: describeAssumptions(A, []) };
    }

    const errors = validate(input);
    if (errors.length) return { state: 'incomplete', errors, defaultsApplied };

    const residency = optional('residency', 'all-sc');
    const otherMonthlyDebt = optional('otherMonthlyDebt', 0);
    const cashSavings = optional('cashSavings', 0);
    const otherCpfOa = optional('otherCpfOa', 0);
    const refund = (input.cpfRefund === undefined || input.cpfRefund === null || input.cpfRefund === '') ? null : input.cpfRefund;

    const S = input.salePrice, L = input.outstandingLoan, buyers = input.buyers;
    const income = buyers.reduce((s, b) => s + b.income, 0);
    const ageW = weightedAge(buyers);
    const anyAge55 = buyers.some((b) => b.age >= RULES.cpfRetirementAccountAge);
    const hasPR = residency === 'has-pr';
    const absdRate = hasPR ? RULES.absd.anyPermanentResident : RULES.absd.allSingaporeCitizens;

    const sellCost = S * A.commissionRate * (1 + A.gstRate) + A.saleLegalFees;
    const netProceeds = S - L - sellCost;
    const base = {
      weightedAge: ageW, totalIncome: income, otherMonthlyDebt, sellCost, netProceeds,
      funds: netProceeds + cashSavings + otherCpfOa, absdRate,
    };

    const assumptionsList = describeAssumptions(A, defaultsApplied);

    if (netProceeds < 0) {
      return { state: 'no-result', reason: 'proceeds-below-loan', breakdown: base, planning: null,
        regulatory: null, longerTenure: null, cash: null, flags: [], diagnosis: null, defaultsApplied, assumptions: assumptionsList };
    }

    // Cash available for the minimum-cash test. If the CPF refund is unknown, assume the
    // best case (no refund taken out of proceeds) so we never understate cash silently.
    const refundEffective = refund === null ? 0 : Math.min(refund, S - L);
    const cashAvailable = (S - L - refundEffective - sellCost) + cashSavings;

    const common = { funds: base.funds, income, debts: otherMonthlyDebt, absdRate,
      purchaseCosts: A.purchaseCosts, cashAvailable };
    const std = RULES.standardStructure, low = RULES.lowerLtvStructure;
    const stdTenureReg = Math.min(std.maxTenureYears, Math.floor(std.endAgeLimit - ageW));
    const tenureCap = A.planningTenureCap;
    const longerYears = A.longerTenureYears || tenureCap;

    // ---------------------------------------------------- planning range
    const planScenario = (structure, incomeCap) => {
      const isStd = structure === 'standard';
      const regTenure = isStd ? stdTenureReg : low.maxTenureYears;
      return runScenario(Object.assign({}, common, {
        incomeCap, reserve: A.reserve, rate: A.planningRate,
        ltv: isStd ? std.ltv : low.ltv,
        minCashPct: isStd ? std.minCashPct : low.minCashPct,
        tenureYears: Math.max(0, Math.min(regTenure, isStd ? tenureCap : longerYears)),
        structure,
      }));
    };
    const pick = (cap) => {
      const cands = [planScenario('standard', cap)];
      if (A.planningStructure === 'bestOf') cands.push(planScenario('lowerLtv', cap));
      return cands.reduce((a, b) => (b.price > a.price ? b : a));
    };
    const lowRun = pick(A.incomeCapLow), highRun = pick(A.incomeCapHigh);
    const planStructure = A.planningStructure === 'bestOf' ? 'bestOf' : 'standard';

    if (highRun.price <= 0 || lowRun.price <= 0) {
      return { state: 'no-result', reason: lowRun.capped || highRun.capped ? 'cash-short' : 'no-capacity',
        breakdown: base, planning: null, regulatory: null, longerTenure: null,
        cash: { status: 'short' }, flags: [], diagnosis: null, defaultsApplied, assumptions: assumptionsList };
    }

    const rLow = floorTo(lowRun.price, A.roundTo), rHigh = floorTo(highRun.price, A.roundTo);
    const collapsed = lowRun.binding !== 'income' && highRun.binding !== 'income';
    const instalment = (run) => {
      const af = annuityFactor(A.planningRate, run.tenureYears);
      const m = af > 0 ? run.loan / af : 0;
      return { monthly: Math.round(m), pctOfIncome: m / income };
    };
    const planning = {
      structure: planStructure,
      tenureYears: lowRun.tenureYears, ltv: lowRun.ltv, minCashPct: lowRun.minCashPct,
      single: collapsed,
      low: collapsed ? Math.min(rLow, rHigh) : rLow,
      high: collapsed ? Math.min(rLow, rHigh) : rHigh,
      binding: { low: lowRun.binding, high: highRun.binding },
      incomeCaps: { low: A.incomeCapLow, high: A.incomeCapHigh },
      instalment: { low: instalment(lowRun), high: instalment(highRun) },
      duties: { low: { bsd: lowRun.bsd, absd: lowRun.absd }, high: { bsd: highRun.bsd, absd: highRun.absd } },
      debtBorrowingReduction: otherMonthlyDebt > 0
        ? Math.round(otherMonthlyDebt * annuityFactor(A.planningRate, highRun.tenureYears)) : 0,
    };

    // --------------------------------- lender-dependent longer-tenure possibility
    let longerTenure = null;
    if (A.planningStructure === 'standard') {
      const run = planScenario('lowerLtv', A.incomeCapHigh);
      const upTo = floorTo(run.price, A.roundTo);
      if (run.price >= highRun.price * (1 + A.longerTenureMinUpliftPct)) {
        longerTenure = {
          upTo, ltv: low.ltv, minCashPct: low.minCashPct, tenureYears: run.tenureYears,
          requires: ['lender confirmation', 'CPF and Retirement Account position'],
          text: 'Requires lender confirmation, and may also be affected by the buyer\'s CPF/Retirement Account position.',
        };
      }
    }

    // ------------------------------------------------ regulatory maximum
    const regScenario = (structure) => {
      const isStd = structure === 'standard';
      return runScenario(Object.assign({}, common, {
        incomeCap: RULES.tdsrCeiling, reserve: 0, rate: RULES.stressRate,
        ltv: isStd ? std.ltv : low.ltv,
        minCashPct: isStd ? std.minCashPct : low.minCashPct,
        tenureYears: Math.max(0, isStd ? stdTenureReg : low.maxTenureYears),
        structure,
      }));
    };
    const regStd = regScenario('standard'), regLow = regScenario('lowerLtv');
    const regBest = regLow.price > regStd.price ? regLow : regStd;
    const reliesOnLongerTenure = regLow.price > regStd.price;
    const regulatory = {
      max: floorTo(regBest.price, A.roundTo),
      structure: reliesOnLongerTenure ? 'lowerLtv' : 'standard',
      tenureYears: regBest.tenureYears, ltv: regBest.ltv,
      reliesOnLongerTenure,
      perStructure: { standard: floorTo(regStd.price, A.roundTo), lowerLtv: floorTo(regLow.price, A.roundTo) },
      lenderCaveat: reliesOnLongerTenure ? 'This relies on the lower-LTV, longer-tenure structure. Actual lender assessment may be more restrictive.' : null,
    };

    // ----------------------------------------------------- cash downpayment
    let cashStatus;
    const planRuns = [lowRun, highRun];
    if (planRuns.some((r) => r.capped)) cashStatus = 'short';
    else if (refund !== null) cashStatus = 'confirmed';
    else {
      const needed = A.reserve + std.minCashPct * Math.max(lowRun.price, highRun.price);
      cashStatus = cashSavings >= needed ? 'confirmed' : 'not-confirmed';
    }
    const cash = { status: cashStatus, refundProvided: refund !== null,
      cashAvailable: Math.round(cashAvailable), needForHigh: Math.round(A.reserve + std.minCashPct * highRun.price) };

    // ------------------------------------------------------------ diagnosis
    let code;
    if (lowRun.capped || highRun.capped) code = 'minimum-cash';
    else if (collapsed) code = 'cash';
    else if (lowRun.binding === 'income' && highRun.binding === 'income') code = 'income';
    else code = 'mixed';
    const diagnosis = { code, text: DIAGNOSIS_TEXT[code] };

    // ---------------------------------------------------------------- flags
    const flags = [];
    if (anyAge55) flags.push({ code: 'cpf-ra-55', text: 'CPF retirement-account requirements and actual lender assessment can materially affect usable funds and borrowing.' });
    if (reliesOnLongerTenure || longerTenure) flags.push({ code: 'lender-tenure', text: 'Actual lender tenure and assessment may be more restrictive.' });
    if (ageW >= std.endAgeLimit) flags.push({ code: 'no-standard-tenure', text: 'The standard structure leaves no loan term at this age.' });

    const state = anyAge55 ? 'indicative' : (collapsed ? 'single' : 'standard');
    return {
      state, planning, longerTenure, regulatory, cash, diagnosis, flags,
      breakdown: Object.assign({}, base, { cashAvailable: Math.round(cashAvailable) }),
      ui: { showRegulatoryMax: state !== 'indicative', showLongerTenure: !!longerTenure },
      defaultsApplied, assumptions: assumptionsList,
      hasPR, hasDebts: otherMonthlyDebt > 0,
    };
  }

  const DIAGNOSIS_TEXT = {
    income: 'Financing is currently your main constraint: your income limits how much you can borrow more than your cash does.',
    cash: 'Cash is currently your constraint. More income alone would not materially increase this position.',
    mixed: 'At the lower end of this range your income is the limit; towards the upper end, your cash is.',
    'minimum-cash': 'The minimum cash downpayment is limiting this result: more of the purchase has to come from cash rather than CPF.',
  };

  function describeAssumptions(A, defaultsApplied) {
    const list = [
      { id: 'incomeCaps', kind: 'modelling', text: `Planning range allows ${Math.round(A.incomeCapLow * 100)}%–${Math.round(A.incomeCapHigh * 100)}% of gross income for all debt repayments.` },
      { id: 'reserve', kind: 'modelling', text: `$${A.reserve.toLocaleString('en-SG')} is held back as a cash reserve.` },
      { id: 'tenure', kind: 'modelling', text: `Planning loan term is capped at ${A.planningTenureCap} years.` },
      { id: 'rate', kind: 'modelling', text: `Instalments are shown at ${Math.round(A.planningRate * 1000) / 10}% a year.` },
      { id: 'costs', kind: 'modelling', text: 'Selling and purchase costs are our estimates, not government figures.' },
      { id: 'income', kind: 'lender', text: 'Income is counted as entered; lenders may discount variable income.' },
      { id: 'mop', kind: 'default', text: 'Assumes your flat has completed its minimum occupation period.' },
    ];
    const defaults = {
      residency: 'Assumes all buyers are Singapore Citizens.',
      otherMonthlyDebt: 'Assumes no other monthly debt repayments.',
      cashSavings: 'Assumes no other cash savings.',
      otherCpfOa: 'Assumes no other CPF Ordinary Account savings.',
      timing: 'Assumes you sell your flat first.',
    };
    defaultsApplied.forEach((k) => { if (defaults[k]) list.push({ id: 'default-' + k, kind: 'default', text: defaults[k] }); });
    return list;
  }

  // ------------------------------------------------------ WhatsApp message
  function money(n) {
    return n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'm' : '$' + Math.round(n / 1000) + 'k';
  }
  // Only ever carries the estimated figure or a plain scenario label. Never raw inputs.
  function whatsappMessage(result) {
    const intro = 'Hi Ken, I used your HDB upgrade tool';
    switch (result && result.state) {
      case 'standard':
        return `${intro} and got an estimated planning range of around ${money(result.planning.low)}–${money(result.planning.high)}. What would you suggest I look at?`;
      case 'single':
        return `${intro} and got an estimated planning figure of around ${money(result.planning.low)}. What would you suggest I look at?`;
      case 'indicative':
        return `${intro} and got an indicative planning position of around ${result.planning.single ? money(result.planning.low) : money(result.planning.low) + '–' + money(result.planning.high)}. Could we talk through what it means for me?`;
      case 'buy-first':
        return `${intro}. I may be buying before my flat is sold and would like to talk through how that works.`;
      default:
        return `${intro} and my situation needs a closer look. Could we talk it through?`;
    }
  }

  // ------------------------------------------------------------ Ken's Take
  // Selects a take WRITTEN BY KEN whose conditions all match. Returns null if none.
  function selectTake(result, takes) {
    if (!result || !takes || !takes.length) return null;
    const ageW = result.breakdown ? result.breakdown.weightedAge : undefined;
    const matches = (w) => {
      if (w.states && !w.states.includes(result.state)) return false;
      if (w.diagnosis && !(result.diagnosis && w.diagnosis.includes(result.diagnosis.code))) return false;
      if (w.minWeightedAge !== undefined && !(ageW >= w.minWeightedAge)) return false;
      if (w.maxWeightedAge !== undefined && !(ageW <= w.maxWeightedAge)) return false;
      if (w.hasPR !== undefined && w.hasPR !== !!result.hasPR) return false;
      if (w.hasDebts !== undefined && w.hasDebts !== !!result.hasDebts) return false;
      if (w.hasLongerTenure !== undefined && w.hasLongerTenure !== !!result.longerTenure) return false;
      if (w.cashStatus && !(result.cash && w.cashStatus.includes(result.cash.status))) return false;
      return true;
    };
    const hit = takes.find((t) => matches(t.when || {}));
    return hit ? hit.text : null;
  }

  return { analyse, bsd, annuityFactor, weightedAge, whatsappMessage, selectTake, DIAGNOSIS_TEXT };
});
