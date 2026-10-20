/* The scenarios the golden snapshot (golden.json) records. Each is a buyer's situation run through one engine entry point.
   Fixed dates are used throughout, so nothing depends on the day the test runs.
   To add a scenario: add it here, run `node make-golden.js`, and READ the diff of golden.json before committing it. */
'use strict';
const SC = (owned) => ({ res: 'SC', owned: owned || 0 });
const OTP = '2027-03-01';
const buy = (o) => Object.assign({ kind: 'new', otp: OTP, buyers: [SC(0)], age: 35, ratePct: 4, cash: 600000, cpf: 200000, order: 'none' }, o);
module.exports = [
  /* ---- progressive payments (the engine behind New launch payments) ---- */
  ['progressive', 'prog-sc-first-1.8m', { price: 1800000, age: 35, kind: 'private', loans: 0, buyers: [SC(0)] }],
  ['progressive', 'prog-typed-30y-3.5pct', { price: 1800000, age: 35, kind: 'private', loans: 0, years: 30, ratePct: 3.5, buyers: [SC(0)] }],
  ['progressive', 'prog-35y-lower-ltv', { price: 1800000, age: 35, kind: 'private', loans: 0, years: 35, buyers: [SC(0)] }],
  ['progressive', 'prog-second-home', { price: 2200000, age: 40, kind: 'private', loans: 1, buyers: [SC(1)] }],
  ['progressive', 'prog-third-home', { price: 2200000, age: 40, kind: 'private', loans: 2, buyers: [SC(2)] }],
  ['progressive', 'prog-age60-blank', { price: 1800000, age: 60, kind: 'private', loans: 0, buyers: [SC(0)] }],
  ['progressive', 'prog-age70-blank', { price: 1800000, age: 70, kind: 'private', loans: 0, buyers: [SC(0)] }],
  ['progressive', 'prog-ec', { price: 1300000, age: 32, kind: 'ec', loans: 0, buyers: [SC(0)] }],
  ['progressive', 'prog-cpf-given', { price: 1800000, age: 35, kind: 'private', loans: 0, cpf: 200000, buyers: [SC(0)] }],
  ['progressive', 'prog-loan-capped', { price: 1800000, age: 35, kind: 'private', loans: 0, loanCap: 800000, buyers: [SC(0)] }],
  ['progressive', 'prog-joint-sc-pr', { price: 2000000, age: 38, kind: 'private', loans: 0, buyers: [SC(0), { res: 'PR', owned: 0 }] }],
  ['progressive', 'prog-foreigner', { price: 2000000, age: 38, kind: 'private', loans: 0, buyers: [{ res: 'FR', owned: 0 }] }],
  ['progressive', 'prog-company', { price: 3000000, kind: 'private', entity: true }],
  ['progressive', 'prog-company-rate-3.5', { price: 3000000, kind: 'private', entity: true, ratePct: 3.5, years: 25 }],
  ['progressive', 'prog-company-35y', { price: 3000000, kind: 'private', entity: true, years: 35 }],
  ['progressive', 'prog-company-ec', { price: 1300000, kind: 'ec', entity: true }],
  /* ---- stamp duty ---- */
  ['stampDuty', 'duty-sc-first-1.8m', { price: 1800000, kind: 'private', buyers: [SC(0)] }],
  ['stampDuty', 'duty-sc-second', { price: 1800000, kind: 'private', buyers: [SC(1)] }],
  ['stampDuty', 'duty-pr-first', { price: 1800000, kind: 'private', buyers: [{ res: 'PR', owned: 0 }] }],
  ['stampDuty', 'duty-foreigner', { price: 1800000, kind: 'private', buyers: [{ res: 'FR', owned: 0 }] }],
  ['stampDuty', 'duty-couple-second-refund', { price: 2400000, kind: 'private', buyers: [SC(1), SC(1)] }],
  ['stampDuty', 'duty-company', { price: 3000000, kind: 'private', entity: true }],
  ['stampDuty', 'duty-company-ec', { price: 1300000, kind: 'ec', entity: true }],
  /* ---- the Payment timeline engine, individuals ---- */
  ['timeline', 'tl-new-no-sale', buy({ price: 1800000 })],
  ['timeline', 'tl-new-short-of-cash', buy({ price: 1800000, cash: 250000, cpf: 50000, saveMo: 3000 })],
  ['timeline', 'tl-new-spread-dates', buy({ price: 1800000, dates: { mode: 'spread' } })],
  ['timeline', 'tl-new-developer-dates', buy({ price: 1800000, dates: { top: '2031-02-01', csc: '2032-06-01' } })],
  ['timeline', 'tl-new-typed-tenure-rate', buy({ price: 1800000, years: 30, ratePct: 3.4 })],
  ['timeline', 'tl-new-age60', buy({ price: 1500000, age: 60 })],
  ['timeline', 'tl-ec', buy({ kind: 'ec', price: 1300000, age: 32 })],
  ['timeline', 'tl-completed', buy({ kind: 'completed', price: 2000000 })],
  ['timeline', 'tl-completed-date', buy({ kind: 'completed', price: 2000000, dates: { completion: '2027-09-15' } })],
  ['timeline', 'tl-buy-first', buy({ price: 2000000, order: 'buy', buyers: [SC(1)], flatLoan: 'outstanding', sale: { month: 12, cash: 400000, cpf: 150000 }, refund: { assume: true } })],
  ['timeline', 'tl-sell-first-rent', buy({ price: 2000000, order: 'sell', buyers: [SC(1)], sale: { cash: 450000, cpf: 150000 }, rent: { monthly: 3000 } })],
  ['timeline', 'tl-pref-loan', buy({ price: 1800000, prefLoan: 900000 })],
  /* ---- TDSR / MSR ---- */
  ['tdsr', 'tdsr-private-1', { kind: 'private', borrowers: [{ age: 35, fixed: 12000 }], debts: 0, loans: 0 }],
  ['tdsr', 'tdsr-private-joint-debts', { kind: 'private', borrowers: [{ age: 35, fixed: 9000 }, { age: 33, fixed: 7000, variable: 2000 }], debts: 1500, loans: 0 }],
  ['tdsr', 'tdsr-private-age60-blank', { kind: 'private', borrowers: [{ age: 60, fixed: 20000 }], debts: 0, loans: 0 }],
  ['tdsr', 'tdsr-private-age70-blank', { kind: 'private', borrowers: [{ age: 70, fixed: 20000 }], debts: 0, loans: 0 }],
  ['tdsr', 'tdsr-private-quoted-rate', { kind: 'private', borrowers: [{ age: 35, fixed: 12000 }], debts: 0, loans: 0, quotedRatePct: 4.6 }],
  ['tdsr', 'tdsr-hdb', { kind: 'hdb', borrowers: [{ age: 35, fixed: 8000 }], debts: 600, propertyLoans: 0, loans: 0 }],
  ['msr', 'msr-hdb-loan', { scenario: 'hdb-loan', household: 'family', borrowers: [{ age: 33, fixed: 7000 }, { age: 31, fixed: 5000 }], lease: 90 }],
  ['msr', 'msr-hdb-loan-short-lease', { scenario: 'hdb-loan', household: 'family', borrowers: [{ age: 40, fixed: 6000 }], lease: 55 }],
  ['msr', 'msr-hdb-bank', { scenario: 'hdb-bank', borrowers: [{ age: 33, fixed: 7000 }, { age: 31, fixed: 5000 }], otherDebts: 400, loans: 0 }],
  ['msr', 'msr-ec', { scenario: 'ec', borrowers: [{ age: 32, fixed: 8000 }, { age: 31, fixed: 6000 }], otherDebts: 300, loans: 0 }],
  ['msr', 'msr-ec-age70', { scenario: 'ec', borrowers: [{ age: 70, fixed: 15000 }], loans: 0 }],
  /* ---- small utilities ---- */
  ['mortgage', 'mortgage-bank', { loan: 1000000, ratePct: 3.5, years: 30, lender: 'bank' }],
  ['mortgage', 'mortgage-hdb', { loan: 400000, ratePct: 2.6, years: 25, lender: 'hdb' }],
  ['ssd', 'ssd-year-2', { price: 1500000, bought: '2025-03-01', sold: '2027-03-01' }],
  ['saleProceeds', 'sale-hdb', { type: 'hdb', price: 800000, loan: 150000, cpfPrincipal: 200000, cpfInterest: 40000, bought: '2016-01-01', sold: '2027-03-01' }],
  ['saleProceeds', 'sale-private', { type: 'private', price: 1600000, loan: 500000, cpfPrincipal: 300000, cpfInterest: 60000, bought: '2018-01-01', sold: '2027-03-01' }],
  /* ---- What can I afford? (the answer engine) ---- */
  ['assess', 'afford-new-no-home', { kind: 'new', otp: OTP, buyers: [{ res: 'SC', age: 35, fixed: 8000 }, { res: 'SC', age: 33, fixed: 6500 }], cash: 700000, cpf: 250000, home: 'none' }],
  ['assess', 'afford-new-solo-age60', { kind: 'new', otp: OTP, buyers: [{ res: 'SC', age: 60, fixed: 10000 }], cash: 900000, cpf: 300000, home: 'none' }],
  ['assess', 'afford-completed-sell-first', { kind: 'completed', otp: OTP, buyers: [{ res: 'SC', age: 35, fixed: 8500 }, { res: 'SC', age: 33, fixed: 6500 }], cash: 60000, cpf: 0, home: 'sell', order: 'sell', owned: 1, flat: { type: 'hdb', hasLoan: 'yes', instalment: 1200, price: 900000, loan: 150000, cpfRefund: 0 }, ratePct: 4, saveMo: 0 }],
  /* ---- the HDB upgrade engine ---- */
  ['hdbUpgrade', 'hdbup-1', { timing: 'sell-first', residency: 'all-sc', salePrice: 900000, outstandingLoan: 150000, cashSavings: 60000, buyers: [{ age: 35, income: 8500 }, { age: 33, income: 6500 }] }],
  ['hdbUpgrade', 'hdbup-3', { timing: 'sell-first', residency: 'all-sc', salePrice: 1100000, outstandingLoan: 0, cashSavings: 150000, buyers: [{ age: 45, income: 6000 }, { age: 43, income: 4500 }] }],
];
