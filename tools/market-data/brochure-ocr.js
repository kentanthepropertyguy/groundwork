#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — read the pages of brochure PDFs that have no text layer (tesseract), and only those. PRIVATE output.

   The text layer (pdftotext -bbox) is read first and kept in <text>/<doc>.html. A page with fewer than minWords words there is a scan
   and gets OCR (150 dpi grey, tesseract --psm 11, one TSV per page: <ocr>/<doc>/p<N>.tsv). Pages already read are never read again.
   mode 'all' also reads the pages that have text; brochure-pipeline.js uses it only for a development whose table is not usable after the
   first pass (some brochures carry a text heading over a plan drawn as an image). Checked over the corpus (extractor-corpus.js): reading
   scans first and everything only where needed gives the same tables as reading every page, at about a third less OCR.

     node tools/market-data/brochure-ocr.js --pdf <file.pdf> --text <folder> --ocr <folder> [--mode scans|all] [--jobs 2]
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const MIN_WORDS = 25;

const docId = (pdf) => path.basename(pdf).replace(/\.pdf$/i, '');
// cached word-position text of a PDF (pdftotext -bbox); returns the file path, or null when the PDF cannot be read
function textOf(pdf, textDir) {
  const f = path.join(textDir, docId(pdf) + '.html');
  if (fs.existsSync(f) && fs.statSync(f).size > 0) return f;
  fs.mkdirSync(textDir, { recursive: true });
  try { cp.execFileSync('pdftotext', ['-bbox', pdf, f], { stdio: 'ignore', timeout: 300000 }); return f; } catch (e) { try { fs.unlinkSync(f); } catch (x) { /* none */ } return null; }
}
// words per page from a -bbox file (page numbers from 1)
function wordsPerPage(bboxFile) {
  if (!bboxFile || !fs.existsSync(bboxFile)) return [];
  return fs.readFileSync(bboxFile, 'utf8').split(/<page\b/).slice(1).map((c) => (c.match(/<word /g) || []).length);
}
function pagesToRead(pdf, o) {
  const per = wordsPerPage(textOf(pdf, o.text)), dir = path.join(o.ocr, docId(pdf));
  let n = per.length;
  if (!n) { try { n = Number((/Pages:\s+(\d+)/.exec(cp.execFileSync('pdfinfo', [pdf], { encoding: 'utf8' })) || [])[1]) || 0; } catch (e) { n = 0; } }
  const want = [];
  for (let p = 1; p <= n; p++) {
    if (fs.existsSync(path.join(dir, 'p' + p + '.tsv')) && fs.statSync(path.join(dir, 'p' + p + '.tsv')).size > 0) continue;
    if (o.mode === 'all' || (per[p - 1] || 0) < (o.minWords || MIN_WORDS)) want.push(p);
  }
  return { pages: n, want, dir };
}
function ocrPage(pdf, dir, p, dpi) {
  return new Promise((resolve) => {
    const img = path.join(dir, 'img' + p);
    const job = cp.spawn('sh', ['-c', 'pdftoppm -r ' + dpi + ' -gray -f ' + p + ' -l ' + p + ' -png "$0" "$1" && tesseract "$1"*.png "$2" --psm 11 tsv >/dev/null 2>&1; rm -f "$1"*.png', pdf, img, path.join(dir, 'p' + p)], { stdio: 'ignore' });
    job.on('exit', (code) => resolve(code === 0));
  });
}
// docs: [pdf paths]; reads at most budgetPages pages in all (the rest wait for the next run); returns per-document counts
async function run(docs, o) {
  o = Object.assign({ jobs: Math.max(1, os.cpus().length), dpi: 150, minWords: MIN_WORDS, mode: 'scans', budgetPages: Infinity }, o);
  const tasks = [], out = [];
  docs.forEach((pdf) => { const t = pagesToRead(pdf, o); fs.mkdirSync(t.dir, { recursive: true }); out.push({ pdf, pages: t.pages, toRead: t.want.length, read: 0 }); t.want.forEach((p) => tasks.push({ pdf, dir: t.dir, p, rec: out[out.length - 1] })); });
  const todo = tasks.slice(0, o.budgetPages === Infinity ? tasks.length : o.budgetPages);
  let i = 0;
  const worker = async () => { while (i < todo.length) { const t = todo[i++]; if (await ocrPage(t.pdf, t.dir, t.p, o.dpi)) t.rec.read++; } };
  await Promise.all(Array.from({ length: o.jobs }, worker));
  out.forEach((r) => { r.waiting = r.toRead - r.read; });
  return out;
}

module.exports = { run, textOf, wordsPerPage, pagesToRead, docId, MIN_WORDS };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  if (!arg('pdf') || !arg('text') || !arg('ocr')) { console.error('Usage: node tools/market-data/brochure-ocr.js --pdf <file.pdf> --text <folder> --ocr <folder> [--mode scans|all] [--jobs N]'); process.exit(2); }
  run([arg('pdf')], { text: arg('text'), ocr: arg('ocr'), mode: arg('mode', 'scans'), jobs: Number(arg('jobs', 0)) || undefined })
    .then((r) => r.forEach((x) => console.log(path.basename(x.pdf) + ': ' + x.pages + ' pages, ' + x.read + ' read by OCR, ' + x.waiting + ' waiting')));
}
