/* ==========================================================================
   GROUNDWORK — which URA rental quarters the bedroom classification uses. Pure functions.

   The standard window is the latest 12 quarters (3 years) of URA rental contracts: approved by Ken on 24 Oct 2026 after a bounded
   comparison of 4, 8, 12, 16 and 20 quarters. 12 classified about 1,083 more recent resales than 8, with no more disagreements with
   layout tables, no more contradictions and no size changing bedroom count. 16 and 20 let rare layouts (penthouses, lofts) through the
   rare-size test.
   Enforced in code, whatever the folder holds: readRaw (build-bedroom.js) reads at most the latest 12 quarter files; any other size
   throws unless the run is marked as a comparison, and a comparison report cannot be made public. fetch-ura-rental.js moves quarters that
   leave the window to a separate private archive folder (never deleted) and brings archived ones back if the window needs them.

   Rental files are named rental-<yyqq>.json (URA's refPeriod, e.g. rental-26q3.json = Jul–Sep 2026). URA serves the past 5 years.
   ========================================================================== */
'use strict';
const WINDOW_QUARTERS = 12;
const FILE = /^rental-(\d{2})q([1-4])\.json$/;

const index = (yy, q) => yy * 4 + (q - 1);
const label = (i) => String(Math.floor(i / 4)).padStart(2, '0') + 'q' + ((i % 4) + 1);
const parse = (name) => { const m = FILE.exec(name); return m ? { name, yyqq: m[1] + 'q' + m[2], i: index(Number(m[1]), Number(m[2])) } : null; };
// the quarter a date falls in, and the last COMPLETED quarter before it (what a refresh on that date can fetch)
const quarterOfDate = (d) => index(d.getUTCFullYear() % 100, Math.floor(d.getUTCMonth() / 3) + 1);
const lastCompleted = (d) => label(quarterOfDate(d) - 1);
// n quarters ending at `last` (yyqq), oldest first
function quartersEnding(last, n) { const m = /^(\d{2})q([1-4])$/.exec(last), end = index(Number(m[1]), Number(m[2])); return Array.from({ length: n }, (x, k) => label(end - n + 1 + k)); }

// files: names in a folder -> the window to read. The window ends at the newest quarter present and spans n quarters; quarters missing
// inside it are reported (a gap lowers coverage, it never changes a bedroom count).
function select(files, n) {
  n = n || WINDOW_QUARTERS;
  const all = files.map(parse).filter(Boolean).sort((a, b) => a.i - b.i);
  if (!all.length) return { quarters: [], files: [], wanted: n, missing: [], archived: [], complete: false };
  const want = quartersEnding(label(all[all.length - 1].i), n), have = new Map(all.map((x) => [x.yyqq, x]));
  const used = want.filter((q) => have.has(q)).map((q) => have.get(q));
  return { quarters: used.map((x) => x.yyqq), files: used.map((x) => x.name), wanted: n, from: want[0], to: want[want.length - 1],
    missing: want.filter((q) => !have.has(q)), archived: all.filter((x) => want.indexOf(x.yyqq) < 0).map((x) => x.yyqq), complete: used.length === n };
}

// A window other than the standard is for comparisons only and must be asked for as one; it can never feed a refresh or a public file.
function windowSize(opt) {
  opt = opt || {};
  const n = opt.rentalQuarters == null ? WINDOW_QUARTERS : Number(opt.rentalQuarters);
  if (!Number.isInteger(n) || n < 1) throw new Error('rental window: ' + opt.rentalQuarters + ' is not a number of quarters');
  if (n !== WINDOW_QUARTERS && !opt.comparison) throw new Error('rental window: the standard is ' + WINDOW_QUARTERS + ' quarters; ' + n + ' is allowed only in a comparison run (comparison: true / --comparison), which never writes public output');
  return n;
}
// how far the window's newest quarter is behind the quarter of the latest sale (0 = same quarter)
function lag(sel, latestYm) { if (!sel.to || latestYm == null) return null; const m = /^(\d{2})q([1-4])$/.exec(sel.to); return index(Math.floor(latestYm / 12) % 100, Math.floor((latestYm % 12) / 3) + 1) - index(Number(m[1]), Number(m[2])); }

module.exports = { WINDOW_QUARTERS, select, windowSize, lag, parse, quartersEnding, lastCompleted, label, index };
