#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — the repeatable brochure pass, URA-first. PRIVATE inputs and outputs only (raw URA files, developer documents, layout tables).

   URA rental contracts are the primary bedroom evidence and need no documents. This pass only adds coverage where they leave resales open:
     1. sources   brochure-sources.js finds documents in every permitted source (sources.json) and matches them to URA names
     2. before    bedroom-hybrid.js classifies every development with what is already known
     3. queue     brochure-queue.js ranks developments by expected gain (open resales of the latest 24 months a table could settle)
     4. fetch     the top developments' documents are fetched once into the private store (robots.txt obeyed, cached)
     5. read      text layers are read; only pages without one get OCR, within a page budget (the rest wait for the next run);
                  where the table is still not usable, the pages with text get OCR too (plans drawn as images under a text heading)
     6. extract   brochure-batch.js builds and checks each table (usable -> 'extracted'; anything else stays a draft, unused)
     7. after     bedroom-hybrid.js again; the realised gain is measured against the expected gain
   Attempts are recorded per development with the extractor's version, so a failed document is not read again until the extractor changes.

     node tools/market-data/brochure-pipeline.js --raw <URA folder> --layouts <private folder> --store <private store> --out <private folder>
          [--top 30] [--ocr-pages 1500] [--to YYYY-MM] [--offline] [--dry-run]
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const B = require('./bench-rental.js'), H = require('./bedroom-hybrid.js'), S = require('./brochure-sources.js'), QU = require('./brochure-queue.js');
const OC = require('./brochure-ocr.js'), BB = require('./brochure-batch.js'), XC = require('./extractor-corpus.js'), E = require('./bedroom-engine.js');

const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
// docs.csv in the store accumulates every document ever fetched (one row per file)
function mergeDocs(file, add) {
  const old = fs.existsSync(file) ? E.parseCsv(fs.readFileSync(file, 'utf8')) : [], by = new Map(old.map((d) => [d.file, d]));
  add.forEach((d) => by.set(d.file, { project: d.project, file: d.file, source: d.source + '-' + d.id, url: d.url || '', page: d.page || '', page_source: d.page ? d.source + '-page-' + (d.key || '') : '', group: d.group, kind: d.kind, name: d.name || '' }));
  const cols = ['project', 'file', 'source', 'url', 'page', 'page_source', 'group', 'kind', 'name'], cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  fs.writeFileSync(file, cols.join(',') + '\n' + Array.from(by.values()).map((d) => cols.map((c) => cell(d[c])).join(',')).join('\n') + '\n');
  return Array.from(by.values());
}

async function run(o) {
  const t0 = Date.now(), store = o.store, cfg = readJson(path.join(store, 'sources.json'), { sources: [] }), version = XC.version();
  const data = B.loadAll(o.raw), names = Array.from(data.dev.keys());
  const extracted = path.join(store, 'extracted'), textDir = path.join(store, 'text'), ocrDir = path.join(store, 'ocr');
  fs.mkdirSync(extracted, { recursive: true });
  // 1. sources
  const cat = S.discover(cfg, names, { store, offline: o.offline });
  fs.writeFileSync(path.join(store, 'catalogue.json'), JSON.stringify(cat, null, 1));
  const byProj = S.byProject(cat);
  // 2. before
  const before = H.run({ raw: o.raw, layouts: o.layouts, extracted, out: path.join(o.out, 'before'), to: o.to, asOf: o.asOf }).report;
  // 3. queue
  const attemptsFile = path.join(store, 'attempts.json'), attempts = readJson(attemptsFile, {});
  const queue = QU.rank(before, data.dev, byProj, attempts, { version }), chosen = queue.filter((x) => x.state === 'queued').slice(0, o.top || 30);
  const report = { at: new Date().toISOString(), extractor: version, latestMonth: before.latestMonth, sources: cat.sources.map((s) => ({ id: s.id, kind: s.kind, matched: s.matched, ambiguous: s.ambiguous.length, skipped: s.skipped })), queueTotals: QU.totals(queue), chosen: chosen.map((x) => x.project) };
  if (o.dryRun) { report.queue = queue.slice(0, 200); return report; }
  // 4. fetch
  const entries = [].concat.apply([], chosen.map((x) => byProj.get(x.project) || []));
  const got = S.documentsFor(entries, cfg, { store, offline: o.offline });
  report.fetchLog = got.log;
  const allDocs = mergeDocs(path.join(store, 'docs.csv'), got.docs);
  const mine = (p) => allDocs.filter((d) => d.project === p && fs.existsSync(d.file));
  // 5. read (scans first, within the page budget, in queue order)
  const pdfs = [].concat.apply([], chosen.map((x) => mine(x.project).filter((d) => d.kind !== 'table').map((d) => d.file)));
  let budget = o.ocrPages == null ? 1500 : o.ocrPages;
  const ocr1 = await OC.run(pdfs, { text: textDir, ocr: ocrDir, budgetPages: budget });
  budget -= ocr1.reduce((n, r) => n + r.read, 0);
  // 6. extract
  let q = BB.run({ docs: path.join(store, 'docs.csv'), data, out: extracted, ocr: ocrDir, text: textDir, merge: true, projects: chosen.map((x) => x.project) });
  // 5b. a development whose table is not usable yet: read its pages that do have text too (plans drawn as images), then extract again
  const empty = chosen.filter((x) => q[x.project] && q[x.project].status !== 'extracted').map((x) => x.project);
  if (empty.length && budget > 0) {
    const more = [].concat.apply([], empty.map((p) => mine(p).filter((d) => d.kind !== 'table').map((d) => d.file)));
    const ocr2 = await OC.run(more, { text: textDir, ocr: ocrDir, mode: 'all', budgetPages: budget });
    if (ocr2.some((r) => r.read)) q = Object.assign(q, BB.run({ docs: path.join(store, 'docs.csv'), data, out: extracted, ocr: ocrDir, text: textDir, merge: true, projects: empty }));
    report.ocrSecondPass = ocr2.map((r) => ({ doc: path.basename(r.pdf), read: r.read, waiting: r.waiting }));
  }
  report.ocr = ocr1.map((r) => ({ doc: path.basename(r.pdf), pages: r.pages, read: r.read, waiting: r.waiting }));
  // 7. after
  const after = H.run({ raw: o.raw, layouts: o.layouts, extracted, out: path.join(o.out, 'after'), to: o.to, asOf: o.asOf, previous: path.join(o.out, 'before', 'snapshot.json') });
  const q2 = new Map(QU.rank(after.report, data.dev, byProj, {}, { version }).map((x) => [x.project, x]));
  report.results = chosen.map((x) => {
    const y = q2.get(x.project) || {}, k = q[x.project], waiting = (report.ocr || []).filter((r) => mine(x.project).some((d) => path.basename(d.file) === r.doc)).reduce((n, r) => n + r.waiting, 0);
    const status = !mine(x.project).length ? 'no documents fetched' : !k ? 'not read' : k.status;
    attempts[x.project] = { version, status: waiting && status !== 'extracted' ? 'waiting for OCR' : status, at: report.at };
    return { project: x.project, status, waitingPages: waiting, expectedGain: x.expectedGain, recentResales: x.recentResales, coverageBefore: x.coverageNow, coverageAfter: y.coverageNow,
      gained: y.coverageNow != null ? Math.round((y.coverageNow - x.coverageNow) * x.recentResales) : 0, table: k ? { rows: k.usableRows, explained: k.explained, rentalAgree: k.rental.agree, compared: k.rental.compared, reasons: k.reasons } : null,
      contradictions: ((after.report.developments.find((d) => d.project === x.project) || {}).contradictions || []).length };
  });
  fs.writeFileSync(attemptsFile, JSON.stringify(attempts, null, 1));
  report.changes = after.changes ? { sizesChangedBedrooms: after.changes.contradictions.length, coverageGains: after.changes.coverageGains.length, coverageDrops: after.changes.coverageDrops.length } : null;
  report.minutes = Math.round((Date.now() - t0) / 6000) / 10;
  fs.writeFileSync(path.join(o.out, 'pipeline-report.json'), JSON.stringify(report, null, 1));
  return report;
}

module.exports = { run, mergeDocs };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  if (!arg('raw') || !arg('layouts') || !arg('store') || !arg('out')) { console.error('Usage: node tools/market-data/brochure-pipeline.js --raw <URA folder> --layouts <private folder> --store <private store> --out <private folder> [--top 30] [--ocr-pages 1500] [--to YYYY-MM] [--offline] [--dry-run]'); process.exit(2); }
  run({ raw: arg('raw'), layouts: arg('layouts'), store: arg('store'), out: arg('out'), top: Number(arg('top', 30)), ocrPages: Number(arg('ocr-pages', 1500)), to: arg('to'), asOf: arg('as-of'), offline: process.argv.indexOf('--offline') > -1, dryRun: process.argv.indexOf('--dry-run') > -1 }).then((r) => {
    const T = r.queueTotals;
    console.log('Extractor ' + r.extractor + ', data to ' + r.latestMonth + '. ' + T.unresolved + ' of ' + T.recentResales + ' resales (latest 24 months) unclassified; ' + T.queued + ' developments queued (could add at most ' + T.queuedGain + ').');
    if (!r.results) { console.log('Dry run: would read ' + r.chosen.join(', ')); return; }
    const sum = (f) => r.results.reduce((n, x) => n + f(x), 0);
    r.results.forEach((x) => console.log((x.status === 'extracted' ? 'USABLE ' : x.status.padEnd(7).slice(0, 7) + ' ') + x.project.padEnd(30) + ' expected +' + String(x.expectedGain).padStart(3) + '  gained +' + String(x.gained).padStart(3) + '  coverage ' + Math.round(x.coverageBefore * 100) + '% -> ' + Math.round((x.coverageAfter || 0) * 100) + '%' + (x.waitingPages ? '  (' + x.waitingPages + ' pages wait for OCR)' : '') + (x.table && x.status !== 'extracted' && x.table.reasons.length ? '  — ' + x.table.reasons.join('; ') : '')));
    console.log('Expected at most +' + sum((x) => x.expectedGain) + ' recent resales; gained +' + sum((x) => x.gained) + ' (' + r.results.filter((x) => x.status === 'extracted').length + ' of ' + r.results.length + ' tables usable). ' + r.minutes + ' min.');
  });
}
