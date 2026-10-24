#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — the brochure extractor's regression over EVERY document read so far. PRIVATE (reads the private document store).

   A change to the extractor is kept only when, across the whole corpus, it makes MORE THAN ONE development better and none worse:
     better  a table that was 'review' becomes 'usable', or (same verdict) explains at least 2 points more of the sales, or has more
             complete rows without explaining less
     worse   'usable' becomes 'review', or (same verdict) explains at least 2 points less, or loses rental agreement by 2 points or more
   This is what stops one-development fixes: a change that helps only one brochure fails the gate (--min-better, default 2).

     node tools/market-data/extractor-corpus.js --docs <docs.csv> --raw <URA folder> --ocr <folder> --text <folder> --baseline <file>
          [--save] [--min-better 2] [--readings text,ocr]
   With no baseline file it records one. --save replaces the baseline after a passing run. Exit status 1 when the gate fails.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const BB = require('./brochure-batch.js');
const FILES = ['extract-positioned.js', 'extract-layouts.js', 'brochure-batch.js', 'layout-quality.js', 'bedroom-engine.js'];
// the extractor's version: the files that decide what a document yields
const version = () => crypto.createHash('sha256').update(FILES.map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\0')).digest('hex').slice(0, 10);

const summary = (q) => Object.fromEntries(Object.keys(q).sort().map((p) => [p, { status: q[p].status, explained: q[p].explained == null ? null : Math.round(q[p].explained * 1000) / 1000, rows: q[p].usableRows, rentalAgree: q[p].rental.agree == null ? null : Math.round(q[p].rental.agree * 1000) / 1000 }]));
function compare(base, now, o) {
  o = Object.assign({ points: 0.02, minBetter: 2 }, o || {});
  const better = [], worse = [], same = [], added = [];
  Object.keys(now).forEach((p) => {
    const a = base[p], b = now[p];
    if (!a) { added.push(p); return; }
    const ex = (b.explained || 0) - (a.explained || 0), ra = a.rentalAgree != null && b.rentalAgree != null ? b.rentalAgree - a.rentalAgree : 0;
    if (a.status === 'extracted' && b.status !== 'extracted') worse.push({ p, why: 'usable -> review' });
    else if (a.status !== 'extracted' && b.status === 'extracted') better.push({ p, why: 'review -> usable' });
    else if (ex <= -o.points) worse.push({ p, why: 'explains ' + Math.round(ex * 1000) / 10 + ' points' });
    else if (ra <= -o.points) worse.push({ p, why: 'rental agreement ' + Math.round(ra * 1000) / 10 + ' points' });
    else if (ex >= o.points) better.push({ p, why: 'explains +' + Math.round(ex * 1000) / 10 + ' points' });
    else if (b.rows > a.rows && ex >= 0) better.push({ p, why: (b.rows - a.rows) + ' more complete rows' });
    else same.push(p);
  });
  const gone = Object.keys(base).filter((p) => !now[p]);
  return { better, worse, same: same.length, added, gone, pass: worse.length === 0 && better.length >= o.minBetter };
}
function run(o) {
  const tmp = fs.mkdtempSync(path.join(o.tmp || os.tmpdir(), 'gw-corpus-'));
  const q = BB.run({ docs: o.docs, raw: o.raw, data: o.data, out: tmp, ocr: o.ocr, text: o.text, readings: o.readings });
  fs.rmSync(tmp, { recursive: true, force: true });
  return { version: version(), at: new Date().toISOString(), developments: summary(q) };
}

module.exports = { version, summary, compare, run };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const bf = arg('baseline');
  if (!arg('docs') || !arg('raw') || !bf) { console.error('Usage: node tools/market-data/extractor-corpus.js --docs <docs.csv> --raw <URA folder> --ocr <folder> --text <folder> --baseline <file> [--save] [--min-better 2]'); process.exit(2); }
  const now = run({ docs: arg('docs'), raw: arg('raw'), ocr: arg('ocr'), text: arg('text'), readings: arg('readings') ? arg('readings').split(',') : undefined });
  const n = Object.keys(now.developments).length, usable = Object.values(now.developments).filter((x) => x.status === 'extracted').length;
  console.log('Extractor ' + now.version + ': ' + n + ' developments read, ' + usable + ' usable tables.');
  if (!fs.existsSync(bf)) { fs.writeFileSync(bf, JSON.stringify(now, null, 1)); console.log('No baseline yet: recorded this run as the baseline.'); process.exit(0); }
  const base = JSON.parse(fs.readFileSync(bf, 'utf8')), c = compare(base.developments, now.developments, { minBetter: Number(arg('min-better', 2)) });
  console.log('Against baseline ' + base.version + ': better ' + c.better.length + ', worse ' + c.worse.length + ', unchanged ' + c.same + (c.added.length ? ', new ' + c.added.length : '') + (c.gone.length ? ', gone ' + c.gone.length : ''));
  c.better.forEach((x) => console.log('  better  ' + x.p + ': ' + x.why));
  c.worse.forEach((x) => console.log('  WORSE   ' + x.p + ': ' + x.why));
  console.log(c.pass ? 'PASS: keep the change.' : 'FAIL: ' + (c.worse.length ? 'it makes ' + c.worse.length + ' development(s) worse' : 'it helps fewer than ' + Number(arg('min-better', 2)) + ' developments') + '.');
  if (c.pass && process.argv.indexOf('--save') > -1) fs.writeFileSync(bf, JSON.stringify(now, null, 1));
  process.exit(c.pass ? 0 : 1);
}
