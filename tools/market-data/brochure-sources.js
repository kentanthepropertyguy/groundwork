#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — where floor-plan documents come from, independent of any one website. PRIVATE inputs and outputs only.

   A private sources.json lists the sources. A source is used only when it records its permission (who allowed it, when, on what terms);
   one without a "permission" entry is skipped and reported. Kinds:
     index          a permitted document index with sitemaps (e.g. cos.sg): each page whose URL fits "page" names a development in its
                    first group (a slug); the page's documents are the links that fit "documents". Pages are read only when needed.
     url-list       a CSV of documents (developer-hosted brochures, etc.): url[,project][,page]. A blank project is read from the file name.
     folder         PDF files in a private folder (e.g. sent by a developer); the development is the file name before "__", or the stem.
     layout-export  a table already in layout form (a bulk data export): project,code,bedrooms[,variant],sqm|sqft[,source]. It skips
                    extraction and goes straight to the URA checks.
   Every name is matched to URA's development names by name-match.js; ambiguous names are reported and never used.

     node tools/market-data/brochure-sources.js --store <private folder> --raw <URA folder> [--offline]
   writes <store>/catalogue.json: { sources: [{id, kind, candidates, matched, ambiguous, unmatched, skipped?}], entries: [...] }
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const N = require('./name-match.js'), F = require('./fetch-cache.js'), E = require('./bedroom-engine.js');
const P_ = require('../../assets/js/kpt-project.js');

const slugName = (s) => decodeURIComponent(String(s)).replace(/[-_]+/g, ' ');
const stem = (f) => path.basename(String(f).split('?')[0]).replace(/\.[A-Za-z0-9]{2,4}$/, '');
// a document's file name as a development name: "Parc-Esta-Brochure" -> "Parc Esta" (common document words removed)
const DOC_WORDS = /\b(e ?brochure|brochure|floor ?plans?|floorplans?|plans?|layouts?|info|information|final|full|combined|blk|block|v\d+|\d{4,})\b/gi;
const docName = (f) => slugName(stem(f)).replace(DOC_WORDS, ' ').replace(/\s+/g, ' ').trim();

const ADAPTERS = {
  index(src, o) {
    const pageRe = new RegExp(src.page), out = [];
    (src.sitemaps || []).forEach((u) => {
      const r = o.fx.get(u, { ext: '.xml', maxAgeDays: src.sitemapMaxAgeDays == null ? 7 : src.sitemapMaxAgeDays });
      if (!r.file) return;
      const xml = fs.readFileSync(r.file, 'utf8'), re = /<loc>([^<]+)<\/loc>/g; let m;
      while ((m = re.exec(xml))) { const pm = pageRe.exec(m[1].trim()); if (pm) out.push({ name: slugName(pm[1]), page: m[1].trim(), key: pm[1] }); }
    });
    return out.map((x) => ({ kind: 'page', name: x.name, page: x.page, key: x.key }));
  },
  'url-list'(src, o) {
    const f = path.resolve(o.store, src.file); if (!fs.existsSync(f)) return [];
    return E.parseCsv(fs.readFileSync(f, 'utf8')).filter((r) => r.url).map((r) => ({ kind: 'pdf', name: r.project || docName(r.url), project: r.project || null, url: r.url, page: r.page || null }));
  },
  folder(src, o) {
    const d = path.resolve(o.store, src.dir); if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter((f) => /\.pdf$/i.test(f)).map((f) => ({ kind: 'pdf', name: f.indexOf('__') > 0 ? slugName(f.split('__')[0]) : docName(f), file: path.join(d, f) }));
  },
  'layout-export'(src, o) {
    const f = path.resolve(o.store, src.file); if (!fs.existsSync(f)) return [];
    const by = new Map(); E.parseCsv(fs.readFileSync(f, 'utf8')).forEach((r) => { if (r.project) (by.get(r.project) || by.set(r.project, []).get(r.project)).push(r); });
    return Array.from(by.entries()).map(([name, rows]) => ({ kind: 'table', name, file: f, rows: rows.length }));
  },
};

function discover(cfg, uraNames, o) {
  const match = N.matcher(uraNames), cat = { generated: new Date().toISOString(), sources: [], entries: [] };
  (cfg.sources || []).forEach((src) => {
    const S = { id: src.id, kind: src.kind, candidates: 0, matched: 0, ambiguous: [], unmatched: 0 };
    cat.sources.push(S);
    if (src.enabled === false) { S.skipped = 'disabled'; return; }
    if (!src.permission || !String(src.permission).trim()) { S.skipped = 'no permission recorded'; return; }
    if (!ADAPTERS[src.kind]) { S.skipped = 'unknown kind ' + src.kind; return; }
    S.permission = src.permission;
    const fx = F.fetcher({ dir: path.join(o.store, 'web'), rateMs: src.rateMs || 2000, offline: o.offline, ignoreRobots: false });
    const list = ADAPTERS[src.kind](src, Object.assign({}, o, { fx }));
    S.candidates = list.length;
    list.forEach((x) => {
      const m = match(x.project || x.name);
      if (!m) { S.unmatched++; return; }
      if (m.ambiguous) { S.ambiguous.push({ name: x.name, could: m.ambiguous }); return; }
      S.matched++;
      cat.entries.push(Object.assign({}, x, { project: m.project, given: x.project || undefined, source: src.id, how: m.how, score: m.score }));
    });
  });
  return cat;
}
const byProject = (cat) => { const m = new Map(); cat.entries.forEach((e) => (m.get(e.project) || m.set(e.project, []).get(e.project)).push(e)); return m; };

/* ---------- documents for chosen developments (pages read, PDFs fetched; all private) ---------- */
// Within a page, likely floor-plan documents first; at most maxDocs per development.
const docRank = (u) => (/floor|plan|layout/i.test(u) ? 0 : /brochure/i.test(u) ? 1 : /price|payment|form|terms|eoi|application|guide|site.?plan|elevation|spec/i.test(u) ? 3 : 2);
function documentsFor(entries, cfg, o) {
  const docs = [], log = [], srcOf = new Map((cfg.sources || []).map((s) => [s.id, s]));
  const fxs = new Map(), fxFor = (src) => fxs.get(src.id) || fxs.set(src.id, F.fetcher({ dir: path.join(o.store, 'web'), rateMs: src.rateMs || 2000, offline: o.offline })).get(src.id);
  const maxDocs = o.maxDocs || 6, maxMb = o.maxMb || 150;
  const projects = new Map(); entries.forEach((e) => (projects.get(e.project) || projects.set(e.project, []).get(e.project)).push(e));
  projects.forEach((list, project) => {
    let found = [];
    list.forEach((e) => {
      const src = srcOf.get(e.source); if (!src) return;
      const fx = fxFor(src);
      if (e.kind === 'table') { found.push({ project, kind: 'table', file: e.file, name: e.name, source: e.source, url: '', page: '', group: e.source }); return; }
      if (e.kind === 'pdf' && e.file) { found.push({ project, kind: 'pdf', file: e.file, source: e.source, url: '', page: '', group: e.source + ':' + P_.slugify(e.name) }); return; }
      if (e.kind === 'pdf') { found.push({ project, kind: 'pdf', url: e.url, source: e.source, page: e.page || '', group: e.source + ':' + (e.page || P_.slugify(project)), key: P_.slugify(project) }); return; }
      // a page: read it (cached) and take its document links
      const r = fx.get(e.page, { ext: '.html' });
      if (!r.file) { log.push({ project, page: e.page, status: r.status }); return; }
      const html = fs.readFileSync(r.file, 'utf8'), re = new RegExp(src.documents, 'g'); let m; const urls = new Set();
      while ((m = re.exec(html))) { try { urls.add(new URL(m[1].replace(/&amp;/g, '&'), e.page).href); } catch (err) { /* bad link */ } }
      Array.from(urls).forEach((u) => found.push({ project, kind: 'pdf', url: u, source: e.source, page: r.file, pageUrl: e.page, group: e.source + ':' + e.key, key: e.key }));
      if (!urls.size) log.push({ project, page: e.page, status: 'no documents on the page' });
    });
    found.sort((a, b) => (a.kind === 'table' ? -1 : 0) - (b.kind === 'table' ? -1 : 0) || docRank(a.url || a.file || '') - docRank(b.url || b.file || ''));
    found = found.slice(0, maxDocs);
    found.forEach((d) => {
      if (d.kind === 'pdf' && !d.file) {
        const id = (d.key || P_.slugify(project)) + '__' + stem(d.url).replace(/[^A-Za-z0-9_.@\-]+/g, '_');
        const file = path.join(o.store, 'pdf', id + '.pdf');
        const src = srcOf.get(d.source), r = fxFor(src).get(d.url, { file, maxAgeDays: 3650 });
        if (!r.file) { log.push({ project, url: d.url, status: r.status, code: r.code }); return; }
        if (fs.statSync(r.file).size > maxMb * 1048576) { log.push({ project, url: d.url, status: 'too large' }); return; }
        d.file = r.file; d.id = id;
      } else d.id = d.id || (P_.slugify(project) + '__' + stem(d.file));
      docs.push(d);
    });
  });
  return { docs, log };
}

module.exports = { discover, byProject, documentsFor, ADAPTERS, docName };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const store = arg('store'), raw = arg('raw');
  if (!store || !raw) { console.error('Usage: node tools/market-data/brochure-sources.js --store <private folder> --raw <URA folder> [--offline]'); process.exit(2); }
  const B = require('./bench-rental.js'), cfg = JSON.parse(fs.readFileSync(path.join(store, 'sources.json'), 'utf8'));
  const names = Array.from(B.loadAll(raw).dev.keys());
  const cat = discover(cfg, names, { store, offline: process.argv.indexOf('--offline') > -1 });
  fs.writeFileSync(path.join(store, 'catalogue.json'), JSON.stringify(cat, null, 1));
  cat.sources.forEach((s) => console.log(s.id.padEnd(18) + s.kind.padEnd(14) + (s.skipped ? 'SKIPPED: ' + s.skipped : s.candidates + ' candidates, ' + s.matched + ' matched to URA names, ' + s.ambiguous.length + ' ambiguous, ' + s.unmatched + ' not a URA development')));
  console.log(byProject(cat).size + ' of ' + names.length + ' URA developments have at least one document source.');
}
