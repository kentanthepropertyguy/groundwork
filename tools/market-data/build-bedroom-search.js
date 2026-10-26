#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — Budget Search by bedroom count, resale (data side, 25 Oct 2026; PROPOSED, not wired into any page).

     node tools/market-data/build-bedroom-search.js --raw <private URA folder> --snapshot <private accepted snapshot.json> --site . --report <private folder>
          [--out data/projects/find-beds.json]

   Classification is NOT redone here. It reuses, unchanged:
     - the accepted 12-quarter classification (the snapshot) and build-bedroom-research.js build(): the completeness gate and the published
       bedroom-type figures, so a "confirmed" type here is exactly a type Research shows, with the same figures;
     - bedroom-research's decider() and possibleFor() for every sale's label, and for the bedroom counts an unclassified size could be;
     - find.json's window (latest 12 months), 100 sq ft bands, row layout and 3-sale minimum cell.
   Refuses: anything build-bedroom-research.js refuses; site bedroom figures that differ from this run (a different URA download: rebuild
   them first, refresh-all.js --snapshot); band counts that differ from data/projects/find.json (same fetch, same transactions).

   Output (aggregates only; the same information the site already publishes in data/projects/bedroom and data/projects/tx):
     projects[id] = { c: classified share of the latest-24-month resales (the gate's coverage; null = not classified),
                      t: { "<bedrooms>": { s: "ok", f: Research figures, b: bands }  confirmed: passes the approved completeness gate
                                       | { s: "few"|"mixed"|"coverage"|"possible", m: bands, x, k }  not confirmed (why below) },
                      u: bands of resales with no bedroom evidence at all }
       ok        the type Research publishes (gate passed). f = { p: [min, q1, median, q3, max], n, act, last, from, to, win, sqft: [lo, hi], v, i }.
                 b = its own resales of the last 12 months, by band (used only when a minimum size cuts through the type).
       few       classified resales of this count exist, but under 5 in 24 months (or not 5 over 3 months).
       mixed     too many resales that could be this count are unclassified (over 20% of the possible ones).
       coverage  under 70% of the development's recent resales are classified, so no type is confirmed there.
       possible  no size is classified with this count, but unclassified sizes could be it (rental contracts or neighbouring sizes).
                 m = the last 12 months' resales that COULD be this count: classified as it, plus unclassified sizes whose possible counts include it;
                 x = how many such resales (all bands), k = how many of them are identified as this count.
     Bands: [bin, n, act, last, q1, med, q3] exactly as find.json (bands of under 3 sales are not written).
     Studios and penthouse groups are classified but are not bedroom counts; they never match a count and are not "unknown" either.
   The private report lists every development and the status of each count.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const BR = require('./build-bedroom-research.js'), E = require('./bedroom-engine.js'), B = require('./bench-rental.js'), H = require('./bedroom-hybrid.js');
const { quantile } = require('./build-bands.js');
const P = require('../../assets/js/kpt-project.js');

const VERSION = 'bedroom-search-v1';
const WINDOW = 12, BIN = 100, MIN_CELL = 3, COUNTS = /^[1-9]$/;   // bedroom counts only (studio "0" and "PH" are not counts)
const SQFT = E.SQFT_PER_SQM;
const ymInt = (ym) => Math.floor(ym / 12) * 100 + (ym % 12) + 1;
const ymS = (ym) => Math.floor(ym / 12) + '-' + String((ym % 12) + 1).padStart(2, '0');

// rows of sales -> find.json bands; returns [rows written, sales left out because their band had under 3]
function bands(sales) {
  const by = new Map(); sales.forEach((t) => { const k = Math.floor((t.sqm * SQFT) / BIN) * BIN; (by.get(k) || by.set(k, []).get(k)).push(t); });
  const out = []; let cut = 0;
  Array.from(by.keys()).sort((a, b) => a - b).forEach((k) => {
    const g = by.get(k); if (g.length < MIN_CELL) { cut += g.length; return; }
    const pr = g.map((x) => x.price).sort((a, b) => a - b), months = new Set(g.map((x) => x.ym));
    out.push([k, g.length, months.size, ymInt(Math.max.apply(null, Array.from(months))), Math.round(quantile(pr, 0.25)), Math.round(quantile(pr, 0.5)), Math.round(quantile(pr, 0.75))]);
  });
  return [out, cut];
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
function siteBedroom(site) {
  const dir = path.join(site, 'data/projects/bedroom'), man = readJson(path.join(dir, 'manifest.json')), all = {};
  fs.readdirSync(dir).filter((f) => /^s\d+\.json$/.test(f)).forEach((f) => Object.assign(all, readJson(path.join(dir, f)).projects));
  return { man, all };
}
const figKey = (x) => JSON.stringify([x.g, x.n, x.act, x.last, x.win, x.price, x.sqft]);

function build(o) {
  const site = path.resolve(o.site || '.');
  const pub = BR.build(o);   // every check of build-bedroom-research.js, and the published figures
  const mine = {}; Object.values(pub.shards).forEach((sh) => Object.assign(mine, sh));
  const live = siteBedroom(site);
  if (live.man.latestMonth !== pub.meta.latestMonth || live.man.classifiedAsOf !== pub.meta.classifiedAsOf) throw new Error('data/projects/bedroom is from another run (' + live.man.latestMonth + ' / ' + live.man.classifiedAsOf + '). Rebuild it first with refresh-all.js --snapshot.');
  const a = Object.keys(mine).sort(), b = Object.keys(live.all).sort();
  const diff = a.filter((id) => !live.all[id] || JSON.stringify(((live.all[id].resale || {}).types || []).map(figKey)) !== JSON.stringify(((mine[id].resale || {}).types || []).map(figKey))).concat(b.filter((id) => !mine[id]));
  if (diff.length) throw new Error('data/projects/bedroom differs from this run for ' + diff.length + ' developments (e.g. ' + diff.slice(0, 3).join(', ') + '): it was built from another URA download. Rebuild it first with refresh-all.js --snapshot.');
  const find = readJson(path.join(site, 'data/projects/find.json'));
  if (find.latestMonth !== pub.meta.latestMonth) throw new Error('find.json is for ' + find.latestMonth + ', not ' + pub.meta.latestMonth);
  const findById = new Map(find.projects.map((p) => [p.id, p]));

  const snap = readJson(o.snapshot), { dev, rent } = B.loadAll(o.raw, {});
  const cap = Number(pub.meta.latestMonth.slice(0, 4)) * 12 + Number(pub.meta.latestMonth.slice(5, 7)) - 1;
  const projects = {}, report = [], tally = { developments: 0, classified: 0, counts: {} };
  dev.forEach((D, name) => {
    const id = P.slugify(name), fp = findById.get(id);
    if (!fp || !(fp.resale || []).length) return;   // Budget Search can list a resale only from find.json's resale rows
    const rows = D.rows.filter((t) => t.ym <= cap).map((t) => Object.assign({ project: name }, t));
    const recent = rows.filter((t) => t.sale === 3 && t.ym > cap - WINDOW);
    // same transactions and bands as find.json, or stop
    const chk = new Map(); recent.forEach((t) => { const k = Math.floor((t.sqm * SQFT) / BIN) * BIN; chk.set(k, (chk.get(k) || 0) + 1); });
    fp.resale.forEach((r) => { if (chk.get(r[0]) !== r[1]) throw new Error('find.json and this run disagree for ' + name + ' at ' + r[0] + ' sq ft (' + r[1] + ' vs ' + (chk.get(r[0]) || 0) + '): not the same URA download'); });
    const entry = D.cls === 'cluster' ? null : snap.developments[name], rec = { id, name, cls: D.cls, recent: recent.length };
    tally.developments++;
    if (!entry) { projects[id] = { c: null, t: {}, u: bands(recent)[0] }; rec.status = D.cls === 'cluster' ? 'cluster housing: not classified' : 'not in the accepted classification'; report.push(rec); return; }
    tally.classified++;
    const decide = BR.decider(entry), lab = new Map(BR.possibleFor(entry, rows, rent.get(name) || []).map((m) => [m.sqm, m]));
    const gate = H.completeness({ mapping: Array.from(lab.values()) }, rows, cap, { months: BR.RULES.gateMonths, minCoverage: BR.RULES.minCoverage, maxAmbiguousShare: BR.RULES.maxAmbiguousShare, minSales: BR.RULES.minSales });
    const area = (t) => String(t.areaRaw != null ? t.areaRaw : t.sqm);
    const tx = recent.map((t) => { const d = decide(t), m = lab.get(area(t)) || {}; return Object.assign({}, t, { group: d.group, possible: d.group == null ? (m.possible || []) : [] }); });
    const shown = {}; ((mine[id] && mine[id].resale && mine[id].resale.types) || []).forEach((x) => { shown[x.g] = x; });
    const published = (rec.published = Object.keys(shown));
    const counts = Array.from(new Set(tx.map((t) => t.group).filter((g) => g != null).concat(...tx.map((t) => t.possible)).concat(Object.keys(gate.types)).concat(published))).filter((g) => COUNTS.test(g)).sort();
    const t = {}; rec.counts = {};
    counts.forEach((g) => {
      let s;
      if (shown[g]) s = 'ok';
      else if (gate.coverage == null || gate.coverage < BR.RULES.minCoverage) s = 'coverage';
      else if (!gate.types[g]) s = 'possible';
      else if (gate.types[g].share != null && gate.types[g].share > BR.RULES.maxAmbiguousShare) s = 'mixed';
      else s = 'few';
      if (s === 'ok') {
        const x = shown[g];
        t[g] = { s, f: { p: x.price, n: x.n, act: x.act, last: x.last, from: x.from, to: x.to, win: x.win, sqft: x.sqft, v: x.basis.verified, i: x.basis.inferred }, b: bands(tx.filter((y) => y.group === g))[0] };
      } else {
        const could = tx.filter((y) => y.group === g || (y.group == null && y.possible.indexOf(g) > -1)), m = bands(could)[0];
        if (!m.length) { rec.counts[g] = s + ' (no band of 3+ recent resales)'; return; }
        t[g] = { s, m, x: could.length, k: could.filter((y) => y.group === g).length };
      }
      rec.counts[g] = s; tally.counts[s] = (tally.counts[s] || 0) + 1;
    });
    const u = bands(tx.filter((y) => y.group == null && !y.possible.length))[0];
    projects[id] = { c: gate.coverage == null ? null : Math.round(gate.coverage * 1000) / 1000, t, u };
    rec.coverage = projects[id].c; report.push(rec);
  });
  const meta = { v: 1, kind: 'gw-find-beds', version: VERSION, asOf: find.asOf, latestMonth: pub.meta.latestMonth, window: find.window, bin: BIN, minCell: MIN_CELL,
    fields: ['bin', 'n', 'act', 'last', 'q1', 'med', 'q3'], classifiedAsOf: pub.meta.classifiedAsOf, rentalWindow: pub.meta.rentalWindow, rules: BR.RULES, sale: 'resale',
    status: { ok: 'confirmed: the bedroom type Research shows (approved completeness gate)', few: 'too few resales identified with this count', mixed: 'too many resales that could be this count are unclassified',
      coverage: 'under 70% of this development\'s recent resales are classified', possible: 'no size classified with this count; some unclassified sizes could be it' },
    basis: pub.meta.basis, counts: tally };
  return { meta, projects, report };
}

function write(o, r) {
  const out = path.resolve(o.out || path.join(o.site || '.', 'data/projects/find-beds.json'));
  fs.writeFileSync(out, JSON.stringify(Object.assign({}, r.meta, { projects: r.projects })));
  if (o.report) { fs.mkdirSync(o.report, { recursive: true }); fs.writeFileSync(path.join(o.report, 'bedroom-search-report.json'), JSON.stringify({ meta: r.meta, developments: r.report }, null, 1)); }
  return out;
}

module.exports = { VERSION, bands, build, write };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const o = { raw: arg('raw'), snapshot: arg('snapshot'), site: arg('site', '.'), report: arg('report'), out: arg('out') };
  if (!o.raw || !o.snapshot || !o.report) { console.error('Usage: node tools/market-data/build-bedroom-search.js --raw <private URA folder> --snapshot <accepted snapshot.json> --site . --report <private folder> [--out <file>]'); process.exit(2); }
  let r; try { r = build(o); } catch (e) { console.error(e.message); process.exit(2); }
  const f = write(o, r);
  console.log('Bedroom search: ' + r.meta.counts.developments + ' resale developments, ' + r.meta.counts.classified + ' classified; counts ' + JSON.stringify(r.meta.counts.counts) + ' -> ' + path.relative(process.cwd(), f));
}
