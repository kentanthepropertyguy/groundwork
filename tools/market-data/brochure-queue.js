#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — which developments' documents to read next: ranked by how many recent resales they could classify. Pure ranking + CLI.

   URA rental contracts classify most resales on their own (rental-engine.js). A layout table can only add the resales they leave open, so
   a development's EXPECTED GAIN is the number of its resales in the latest 24 months (the two Market Pulse periods) that are still
   unclassified, less those a document cannot settle:
     - sizes where a checked table already holds layouts with DIFFERENT bedroom counts (a document cannot separate equal areas), and
     - contradictions between a checked table and the rentals (those need a person's review, not another document).
   Developments that already have a checked table, have no document source, whose source pages held no documents (looked at again after
   90 days), or whose documents this extractor version already failed on are listed apart. The figure is an upper bound: what is gained is measured after the run (brochure-pipeline.js reports both).
   ========================================================================== */
'use strict';
const WINDOW = 24;

// report: bedroom-hybrid report; dev: Map(name -> {rows}); sources: Map(name -> entries); attempts: {name: {version, status}}
function rank(report, dev, sources, attempts, o) {
  o = Object.assign({ window: WINDOW, version: null, minCoverage: 0.7, recheckDays: 90 }, o || {});
  let latest = 0; dev.forEach((D) => D.rows.forEach((t) => { if (t.ym > latest) latest = t.ym; }));
  if (report.latestMonth) latest = Number(report.latestMonth.slice(0, 4)) * 12 + Number(report.latestMonth.slice(5, 7)) - 1;   // the report's own last month
  const from = latest - o.window + 1, out = [];
  report.developments.forEach((d) => {
    const D = dev.get(d.project); if (!D) return;
    const map = new Map(d.mapping.map((m) => [m.sqm, m]));
    let recent = 0, open = 0, gain = 0, fixedC = 0, contra = 0, all = 0, allOpen = 0;
    const why = {};
    D.rows.forEach((t) => {
      if (t.sale !== 3) return;
      const m = map.get(String(t.areaRaw != null ? t.areaRaw : t.sqm)), unresolved = !m || m.group == null;
      all++; if (unresolved) allOpen++;
      if (t.ym < from || t.ym > latest) return;
      recent++; if (!unresolved) return;
      open++;
      const r = (m && m.reason) || 'no decision';
      if (d.layoutsTrusted && /different bedroom counts/.test(r)) { fixedC++; return; }
      if (r === 'contradiction') { contra++; return; }
      gain++; const k = r.replace(/^.*rental /, 'rental: ').replace(/^no layout fits; /, ''); why[k] = (why[k] || 0) + 1;
    });
    if (!recent) return;
    const src = sources.get(d.project) || [], att = attempts && attempts[d.project];
    // a source page with no documents is a source fact, not an extractor one: it is looked at again only after o.recheckDays
    const empty = att && att.status === 'no documents fetched' && (Date.now() - Date.parse(att.at || 0)) / 864e5 < o.recheckDays;
    const state = d.layoutsTrusted ? 'has checked table' : !src.length ? 'no document source' : empty ? 'no documents at source' : att && att.version === o.version && att.status !== 'extracted' && att.status !== 'waiting for OCR' ? 'tried with this extractor' : gain ? 'queued' : 'nothing to gain';
    const now = (recent - open) / recent, best = (recent - open + gain) / recent;
    out.push({ project: d.project, cls: d.cls, state, recentResales: recent, unresolved: open, expectedGain: gain, sameAreaDifferentBeds: fixedC, contradictions: contra,
      coverageNow: Math.round(now * 1000) / 1000, coverageAtBest: Math.round(best * 1000) / 1000, unlocks: now < o.minCoverage && best >= o.minCoverage, why,
      allResales: all, allUnresolved: allOpen, sources: src.map((e) => e.source + (e.how === 'exact' ? '' : ' (' + e.how + ')')) });
  });
  out.sort((a, b) => b.expectedGain - a.expectedGain || b.allUnresolved - a.allUnresolved || (a.project < b.project ? -1 : 1));
  return out;
}
// the same list, summed: how much of the open recent resales the queue could reach at best
function totals(list) {
  const s = (f, l) => (l || list).reduce((n, x) => n + f(x), 0), q = list.filter((x) => x.state === 'queued');
  return { developments: list.length, recentResales: s((x) => x.recentResales), unresolved: s((x) => x.unresolved), queued: q.length, queuedGain: s((x) => x.expectedGain, q),
    byState: list.reduce((m, x) => { m[x.state] = (m[x.state] || 0) + 1; return m; }, {}) };
}

module.exports = { rank, totals, WINDOW };

if (require.main === module) {
  const fs = require('fs'), path = require('path'), B = require('./bench-rental.js'), S = require('./brochure-sources.js');
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  if (!arg('report') || !arg('raw') || !arg('store')) { console.error('Usage: node tools/market-data/brochure-queue.js --report <hybrid-report.json> --raw <URA folder> --store <private folder> [--top 30]'); process.exit(2); }
  const report = JSON.parse(fs.readFileSync(arg('report'), 'utf8')), dev = B.loadAll(arg('raw')).dev;
  const cat = JSON.parse(fs.readFileSync(path.join(arg('store'), 'catalogue.json'), 'utf8')), af = path.join(arg('store'), 'attempts.json');
  const list = rank(report, dev, S.byProject(cat), fs.existsSync(af) ? JSON.parse(fs.readFileSync(af, 'utf8')) : {}, { version: require('./extractor-corpus.js').version() });
  const t = totals(list);
  console.log(t.unresolved + ' of ' + t.recentResales + ' resales in the latest 24 months are unclassified; ' + t.queued + ' developments queued, which could add at most ' + t.queuedGain + '. ' + JSON.stringify(t.byState));
  list.filter((x) => x.state === 'queued').slice(0, Number(arg('top', 30))).forEach((x, i) => console.log(String(i + 1).padStart(3) + '. ' + x.project.padEnd(30) + ' gain ' + String(x.expectedGain).padStart(4) + ' of ' + String(x.recentResales).padStart(4) + ' recent resales  coverage ' + Math.round(x.coverageNow * 100) + '% -> at best ' + Math.round(x.coverageAtBest * 100) + '%' + (x.unlocks ? '  (could reach the 70% publication bar)' : '') + '  ' + JSON.stringify(x.why)));
}
