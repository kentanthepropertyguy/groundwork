#!/usr/bin/env node
/* ==========================================================================
   Layout tables from many developer documents at once, checked against URA. PRIVATE inputs and outputs only: brochures are the developers'
   copyright and are never published; only aggregate statistics ever leave the private folder.

     node tools/market-data/brochure-batch.js --docs <docs.csv> --raw <URA folder> --out <private folder> [--ocr <folder>] [--text <folder>]
          [--merge] [--projects "A;B"]

   docs.csv: project,file,source,url[,page,page_source,group,kind,name]   (written by brochure-sources.js; project = URA name)
     kind 'pdf' (default): words with positions from the text layer (pdftotext -bbox, cached in --text) and, where <ocr>/<doc>/p<N>.tsv
       exist, from OCR of the scanned pages. Three readings are tried: text layer only, OCR only, and page by page (the text layer where the
       page has one, else its OCR) — the reading with the most complete rows is kept.
     kind 'table': rows of an export already in layout form (project = name, code, bedrooms, variant, sqm, sqft).
   group: documents from one place (one index page, one folder) are read together; when a development has documents from SEVERAL places,
   each place is checked on its own first and only places whose table passes are combined (a page about another development with the same
   name never contaminates the table).
   Then layout-quality.js checks the table against URA's sales and rental records. Output: <out>/<project id>.csv (status 'extracted' when the
   check says usable, else 'draft'), <out>/sources.csv rows, <out>/quality.json (--merge keeps entries for developments not in this run).
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const E = require('./bedroom-engine.js'), XP = require('./extract-positioned.js'), Q = require('./layout-quality.js'), B = require('./bench-rental.js'), OC = require('./brochure-ocr.js');
const P = require('../../assets/js/kpt-project.js');

const READINGS = ['text', 'combined', 'ocr'];   // the readings tried, in tie order (o.readings can narrow it, e.g. for a regression baseline)
const complete = (rows) => rows.filter((r) => r.bedrooms != null && (r.sqm || r.sqft)).length;
function ocrPages(dir) {
  const m = new Map(); if (!dir || !fs.existsSync(dir)) return m;
  fs.readdirSync(dir).forEach((f) => { const k = /^p(\d+)\.tsv$/.exec(f); if (k && fs.statSync(path.join(dir, f)).size > 0) m.set(Number(k[1]), XP.fromTsv(fs.readFileSync(path.join(dir, f), 'utf8'))); });
  return m;
}
function readDoc(doc, o) {
  o = o || {};
  const file = doc.file, out = { file, kind: doc.kind || 'pdf', text: [], ocr: [], combined: [] };
  if (out.kind === 'table') {
    const rows = E.parseCsv(fs.readFileSync(file, 'utf8')).filter((r) => r.project === (doc.name || doc.project));
    out.rows = rows.map((r) => ({ code: r.code, bedrooms: String(r.bedrooms).trim() === '' ? null : Number(r.bedrooms), variant: r.variant || '', sqm: r.sqm || '', sqft: r.sqft || '', note: 'from a layout export' }));
    out.use = 'table'; out.chart = new Map(); return out;
  }
  let textPages = [];
  try {
    let tf = o.text ? OC.textOf(file, o.text) : null;
    if (!o.text) { tf = path.join(os.tmpdir(), 'gwbb-' + process.pid + '.html'); cp.execFileSync('pdftotext', ['-bbox', file, tf], { stdio: 'ignore', timeout: 300000 }); }
    if (tf) { textPages = XP.fromBbox(fs.readFileSync(tf, 'utf8')); if (!o.text) fs.unlinkSync(tf); } else out.textError = 'text layer unreadable';
  } catch (e) { out.textError = e.message.split('\n')[0]; }
  const om = ocrPages(o.ocr && path.join(o.ocr, OC.docId(file)));
  const ocrList = Array.from(om.keys()).sort((a, b) => a - b).map((k) => om.get(k));
  const n = Math.max(textPages.length, om.size ? Math.max.apply(null, Array.from(om.keys())) : 0), combinedPages = [];
  // page by page: the text layer where the page has one, else its OCR. (Choosing per page whichever reading gives more rows was tried and
  // helped one development only, so it failed extractor-corpus.js's gate and was not kept.)
  for (let p = 1; p <= n; p++) { const t = textPages[p - 1]; combinedPages.push(t && t.words.length >= OC.MIN_WORDS ? t : om.get(p) || t || { w: 600, h: 800, words: [] }); }
  out.text = XP.extractPages(textPages); out.ocr = om.size ? XP.extractPages(ocrList) : []; out.combined = om.size ? XP.extractPages(combinedPages) : [];
  out.pages = n; out.ocrPages = om.size;
  // most complete rows wins; on a tie the exact text layer first, then page by page, then OCR alone
  out.use = (o.readings || READINGS).reduce((best, k) => (complete(out[k]) > complete(out[best]) ? k : best), 'text');
  out.rows = out[out.use];
  out.chart = new Map(); [textPages, ocrList].forEach((pg) => { if (pg && pg.length) XP.stackChart(pg).forEach((v, k) => { if (!out.chart.has(k)) out.chart.set(k, v); }); });
  return out;
}

// one development's table from a list of read documents, checked against URA
function build(project, list, D, rentals) {
  const m = Q.merge(list.map((r) => r.rows.map((x) => Object.assign({ source: r.source }, x))));
  // fill gaps from the unit distribution chart (code -> sqm) and from floor-plan titles (code -> bedrooms); never overwrite, report disagreement
  const chart = new Map(); list.forEach((r) => r.chart.forEach((v, k) => { if (!chart.has(k)) chart.set(k, Object.assign({ source: r.source }, v)); }));
  const titles = new Map(); list.forEach((r) => { if (r.page && fs.existsSync(r.page)) XP.titleBedrooms(fs.readFileSync(r.page, 'utf8')).forEach((v, k) => { if (!titles.has(k)) titles.set(k, Object.assign({ source: r.pageSource || r.source }, v)); }); });
  const find = (code) => m.rows.find((x) => x.code.toLowerCase() === code.toLowerCase());
  chart.forEach((v, code) => { const r = find(code); if (!r) m.rows.push({ code, bedrooms: null, variant: '', sqm: v.sqm, sqft: '', source: v.source, note: 'area from the unit distribution chart' + (v.consistent ? '' : ' (most common of ' + JSON.stringify(v.values) + ')') }); else if (!r.sqm && !r.sqft) { r.sqm = v.sqm; r.note = (r.note ? r.note + '; ' : '') + 'area from the unit distribution chart'; } else if (r.sqm && r.sqm !== v.sqm) r.note = (r.note ? r.note + '; ' : '') + 'chart says ' + v.sqm + ' sqm'; });
  titles.forEach((v, code) => { const r = find(code); if (!r) return; if (r.bedrooms == null) { r.bedrooms = v.bedrooms; if (!r.variant && v.variant) r.variant = v.variant; r.note = (r.note ? r.note + '; ' : '') + 'bedrooms from the floor-plan title'; } else if (r.bedrooms !== v.bedrooms) r.note = (r.note ? r.note + '; ' : '') + 'title says ' + v.bedrooms + ' bedrooms'; });
  // a PES / roof / (P) variant of a type ("A1-P", "B2-R", "C1(P)") takes its base type's bedroom count, said in the row; the checks then test it
  m.rows.forEach((r) => { if (r.bedrooms != null) return; const mm = /^(.+?)(?:-[PR]\d?|\(P\))$/.exec(r.code), base = mm && find(mm[1]); if (base && base.bedrooms != null) { r.bedrooms = base.bedrooms; r.note = (r.note ? r.note + '; ' : '') + 'bedrooms from base type ' + base.code; } });
  m.rows = m.rows.filter((r) => !/chart says|title says/.test(r.note || ''));   // two developer sources disagree: left out, reported in the quality file
  const csvRows = m.rows.map((r) => ({ project, code: r.code, bedrooms: r.bedrooms == null ? '' : r.bedrooms, variant: r.variant || '', sqm: r.sqm || '', sqft: r.sqft || '', source: r.source, note: r.note || '' }));
  const asLayouts = E.loadLayouts(toCsv(csvRows, 'draft'), '').get(project) || { all: [] };
  const qc = Q.check(asLayouts.all, D ? D.rows : [], rentals || []);
  return { csvRows, qc, conflicts: m.conflicts.map((c) => c.code), status: qc.verdict === 'usable' ? 'extracted' : 'draft' };
}
const rank = (b) => (b.status === 'extracted' ? 2 : 0) + (b.qc.explained || 0);
function chooseGroups(project, list, D, rentals) {
  const groups = new Map(); list.forEach((r) => (groups.get(r.group || 'all') || groups.set(r.group || 'all', []).get(r.group || 'all')).push(r));
  if (groups.size === 1) return Object.assign(build(project, list, D, rentals), { groups: null });
  const each = Array.from(groups.entries()).map(([g, l]) => ({ g, l, b: build(project, l, D, rentals) }));
  const ok = each.filter((x) => x.b.status === 'extracted');
  let pick;
  if (ok.length > 1) { const all = build(project, [].concat.apply([], ok.map((x) => x.l)), D, rentals); pick = all.status === 'extracted' ? Object.assign(all, { used: ok.map((x) => x.g) }) : null; }
  if (!pick) { const best = each.slice().sort((a, b) => rank(b.b) - rank(a.b))[0]; pick = Object.assign(best.b, { used: [best.g] }); }
  pick.groups = each.map((x) => ({ group: x.g, status: x.b.status, explained: x.b.qc.explained, rows: x.b.qc.usableRows, used: pick.used.indexOf(x.g) > -1 }));
  return pick;
}

function run(o) {
  let docs = E.parseCsv(fs.readFileSync(o.docs, 'utf8'));
  if (o.projects) { const want = new Set(o.projects); docs = docs.filter((d) => want.has(d.project)); }
  const { dev, rent } = o.data || B.loadAll(o.raw), byProject = new Map();
  docs.forEach((d) => { if (!d.file || !fs.existsSync(d.file)) return; const r = readDoc(d, o); Object.assign(r, { source: d.source, url: d.url, page: d.page, pageSource: d.page_source, group: d.group || '' }); (byProject.get(d.project) || byProject.set(d.project, []).get(d.project)).push(r); });
  fs.mkdirSync(o.out, { recursive: true });
  const qf = path.join(o.out, 'quality.json'), sf = path.join(o.out, 'sources.csv');
  const quality = o.merge && fs.existsSync(qf) ? JSON.parse(fs.readFileSync(qf, 'utf8')) : {};
  const srcRows = o.merge && fs.existsSync(sf) ? fs.readFileSync(sf, 'utf8').split(/\r?\n/).slice(1).filter((l) => l.trim() && !byProject.has(E.parseCsv('a,b\n' + l)[0].b)) : [];
  const runQuality = {};
  byProject.forEach((list, project) => {
    const D = dev.get(project), b = chooseGroups(project, list, D, rent.get(project) || []);
    fs.writeFileSync(path.join(o.out, P.slugify(project) + '.csv'), toCsv(b.csvRows, b.status) + '\n');
    runQuality[project] = quality[project] = Object.assign({ status: b.status, documents: list.map((r) => ({ file: path.basename(r.file), group: r.group || undefined, used: r.use, pages: r.pages, ocrPages: r.ocrPages, textRows: complete(r.text), ocrRows: complete(r.ocr), combinedRows: complete(r.combined), error: r.textError || undefined })), conflicts: b.conflicts, groups: b.groups || undefined }, b.qc);
    list.forEach((r) => srcRows.push([r.source, project, 'Developer document: ' + path.basename(r.file), r.url || '', new Date().toISOString().slice(0, 10), r.kind === 'table' ? 'layout-export' : 'developer-brochure', 'auto-extracted (' + r.use + '); private'].map(cell).join(',')));
  });
  fs.writeFileSync(qf, JSON.stringify(quality, null, 1));
  fs.writeFileSync(sf, 'id,project,title,url,retrieved,kind,note\n' + uniq(srcRows).join('\n') + '\n');
  return o.merge ? runQuality : quality;
}
const uniq = (a) => Array.from(new Set(a));
const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function toCsv(rows, status) { return 'project,code,bedrooms,variant,sqm,sqft,source,status,note\n' + rows.map((r) => [r.project, r.code, r.bedrooms, r.variant, r.sqm, r.sqft, r.source, (r.bedrooms === '' || (!r.sqm && !r.sqft)) ? 'draft' : status, r.note].map(cell).join(',')).join('\n'); }
const pct = (x) => (x == null ? '–' : (Math.round(x * 1000) / 10) + '%');
const line = (p, x) => (x.status === 'extracted' ? 'USABLE ' : 'review ') + p.padEnd(28) + ' rows ' + String(x.usableRows).padStart(3) + '/' + String(x.rows).padStart(3) + '  explains ' + pct(x.explained).padStart(6) + ' of ' + x.sales + ' sales  rental agree ' + pct(x.rental.agree) + ' of ' + x.rental.compared + ' compared' + (x.reasons.length ? '  — ' + x.reasons.join('; ') : '');

module.exports = { READINGS, run, readDoc, build, chooseGroups, toCsv, line };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  if (!arg('docs') || !arg('raw') || !arg('out')) { console.error('Usage: node tools/market-data/brochure-batch.js --docs <docs.csv> --raw <URA folder> --out <private folder> [--ocr <folder>] [--text <folder>] [--merge] [--projects "A;B"]'); process.exit(2); }
  const q = run({ docs: arg('docs'), raw: arg('raw'), out: arg('out'), ocr: arg('ocr'), text: arg('text'), merge: process.argv.indexOf('--merge') > -1, projects: arg('projects') ? arg('projects').split(';').map((s) => s.trim()) : null });
  Object.keys(q).forEach((p) => console.log(line(p, q[p])));
}
