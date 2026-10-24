#!/usr/bin/env node
/* ==========================================================================
   Bedroom-type statistics from URA transactions and private layout tables (see bedroom-engine.js for the method).

     node tools/market-data/build-bedroom.js --raw <folder of URA batch-*.json [+ rental-*.json]> --layouts <folder with layouts.csv, sources.csv>
          --report <private folder> [--public data/projects/bedroom.json] [--allow-secondary] [--to YYYY-MM]
   --to leaves out sales after that month, so the figures match a Research build made from the same or an earlier download.

   --report gets the FULL diagnostic report (per-area counts, candidate layouts, bias and mix checks). It is private: never commit it.
   --public gets ONLY aggregates that pass the display rules below, with no layout codes, no per-sale rows and no source documents.
   Layout tables are private too (developer floor-plan facts); they never go in the repository.

   Display rules (public file), per development and bedroom group:
     - every layout row used is developer-sourced or approved by Ken (status developer|approved); --allow-secondary lifts this for a LOCAL preview only
     - the group's possible resales lost to ambiguity (class C that could be this group), latest two periods, is at most 20%
     - figures follow the existing evidence rules: a typical price needs 5 sales over 3 months (kpt-evidence.js); a Market Pulse reading uses gw-pulse.js's rules
     - a group whose layout mix shifted enough to move its median on its own keeps its counts but loses the price direction
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const E = require('./bedroom-engine.js');
const RW = require('./rental-window.js');
const G = require('./register.js');
const P = require('../../assets/js/kpt-project.js');

const RULES = { maxAmbiguousShare: 0.2, typical: { n: 5, months: 3 } };
const ymToInt = (ym) => Math.floor(ym / 12) * 100 + (ym % 12) + 1;
const ymToS = (ym) => Math.floor(ym / 12) + '-' + String((ym % 12) + 1).padStart(2, '0');

// Rental contracts: only the standard window (rental-window.js: the latest 12 quarter files present) is read, whatever else the folder
// holds. Another size needs opt.comparison (RW.windowSize throws otherwise).
function readRaw(dir, opt) {
  opt = opt || {};
  const files = fs.readdirSync(dir).sort(), tx = [], rent = new Map(), win = RW.select(files, RW.windowSize(opt));
  files.filter((f) => /^batch-\d+\.json$/.test(f)).forEach((f) => (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).Result || []).forEach((p) => (p.transaction || []).forEach((t) => tx.push(Object.assign({ project: p.project, street: p.street, marketSegment: p.marketSegment }, t)))));
  win.files.forEach((f) => (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).Result || []).forEach((p) => { const l = rent.get(p.project) || rent.set(p.project, []).get(p.project); (p.rental || []).forEach((r) => l.push(r)); }));
  return { tx, rent, rentalFiles: win.files.length, rentalWindow: win };
}

function build(raw, db, cfg, pc, opt) {
  opt = opt || {};
  const tmap = G.checkConfig(cfg), screen = G.nameScreen(pc), byName = new Map();
  let latest = 0;
  const cap = opt.to ? (Number(opt.to.slice(0, 4)) * 12 + Number(opt.to.slice(5, 7)) - 1) : Infinity;   // --to YYYY-MM: same data month as the published Research files
  raw.tx.forEach((t) => {
    const a = G.admit(t, t.marketSegment, tmap); if (!a.ok || !t.project || screen(t.project) || a.ym > cap) return;
    latest = Math.max(latest, a.ym);
    if (!db.has(t.project)) return;
    (byName.get(t.project) || byName.set(t.project, []).get(t.project)).push({ cls: a.cls, sale: a.sale, price: a.price, sqm: a.sqm, areaRaw: t.area, psf: a.price / (a.sqm * E.SQFT_PER_SQM), ym: a.ym, floor: t.floorRange && t.floorRange !== '-' ? String(t.floorRange) : null });
  });
  const ctx = { latest, periodMonths: pc.periodMonths || 12, periods: pc.periods || 5, bin: pc.bin || 100 };
  const out = { asOf: opt.asOf || null, latestMonth: ymToS(latest), periods: [0, 1].map((p) => ({ from: ymToS(latest - (p + 1) * ctx.periodMonths + 1), to: ymToS(latest - p * ctx.periodMonths) })), developments: [] };
  db.forEach((L, name) => {
    const rows = byName.get(name) || [];
    const D = { project: name, id: P.slugify(name), layoutStatus: L.status, publishable: L.publishable, layoutIssues: L.issues, sources: L.sources.map((s) => ({ id: s.id, title: s.title, url: s.url, kind: s.kind, retrieved: s.retrieved })) };
    if (!L.layouts.length) { D.state = 'no-layouts'; D.note = 'No usable layout rows (draft or missing).'; out.developments.push(D); return; }
    if (!rows.length) { D.state = 'no-transactions'; out.developments.push(D); return; }
    const sp = G.split(rows); D.cls = sp.cls; D.otherClass = sp.also || null;
    const res = E.analyse(sp.rows, L, ctx, opt);
    D.state = 'analysed'; D.summary = res.summary;
    D.rental = raw.rent.has(name) ? E.rentalCheck(raw.rent.get(name), L.layouts) : null;
    out.developments.push(D);
  });
  return out;
}

// The public aggregates: only what passes the display rules; no layout codes, sources, per-area rows or unclassified detail.
function publicView(rep, opt) {
  opt = opt || {};
  const pub = { v: 1, kind: 'gw-bedroom', asOf: rep.asOf, latestMonth: rep.latestMonth, periods: rep.periods,
    basis: 'Bedroom type is inferred by Groundwork by matching each sale\'s URA floor area to the developer\'s floor-plan areas. URA does not publish bedroom counts. Sales whose area fits layouts with different bedroom counts, or no layout, are left out.',
    rules: { maxAmbiguousShare: RULES.maxAmbiguousShare, typical: RULES.typical }, developments: {} };
  rep.developments.forEach((D) => {
    if (D.state !== 'analysed') return;
    if (!D.publishable && !opt.allowSecondary) return;
    const S = D.summary, groups = [];
    Object.keys(S.groups).forEach((g) => {
      const Gp = S.groups[g], rs = Gp.sales.resale;
      if (rs && rs.ambiguousShare != null && rs.ambiguousShare > RULES.maxAmbiguousShare) return;
      if (!Object.keys(Gp.sales).length) return;
      const sales = {};
      Object.keys(Gp.sales).forEach((s) => {
        const X = Gp.sales[s], c = (k) => ({ n: k.n, act: k.act, last: k.last == null ? null : ymToInt(k.last), psf: k.psf, price: k.price, typical: k.n >= RULES.typical.n && k.act >= RULES.typical.months });
        sales[s] = { all: c(X.all), p0: c(X.periods[0]), p1: c(X.periods[1]) };
      });
      const pr = S.pulse.byGroup[g] || { evidence: 'none' }, mix = S.mix[g];
      const pulse = pr.evidence === 'none' ? { evidence: 'none' } : mix && mix.flag ? { evidence: pr.evidence, dir: null, mixShift: true } : { evidence: pr.evidence, dir: pr.dir, pct: pr.pct, withinNoise: pr.withinNoise };
      groups.push({ g, label: Gp.label, sqft: [Math.round(Gp.sqm[0] * E.SQFT_PER_SQM / 10) * 10, Math.round(Gp.sqm[1] * E.SQFT_PER_SQM / 10) * 10], n: Gp.n, sales, pulse });
    });
    if (!groups.length) return;
    pub.developments[D.id] = { name: D.project, cls: D.cls, status: D.layoutStatus, coverage: { all: S.totals.all.share, resale: S.totals.resale ? S.totals.resale.share : null, p0: S.periods[0] ? S.periods[0].share : null, p1: S.periods[1] ? S.periods[1].share : null }, groups };
  });
  return pub;
}

const pct = (x) => (x == null ? '–' : (Math.round(x * 1000) / 10).toFixed(1) + '%');
const money = (x) => (x == null ? '–' : '$' + String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
function reportText(rep) {
  const L = ['Bedroom-type classification report', 'Data to ' + rep.latestMonth + '. Market Pulse periods: latest ' + rep.periods[0].from + ' to ' + rep.periods[0].to + ', earlier ' + rep.periods[1].from + ' to ' + rep.periods[1].to + '.', ''];
  rep.developments.forEach((D) => {
    L.push('== ' + D.project + '  [layout table: ' + D.layoutStatus + (D.publishable ? ', publishable' : ', NOT publishable until developer-sourced or approved') + ']');
    if (D.layoutIssues.length) L.push('   Layout table issues: ' + D.layoutIssues.join('; '));
    if (D.state !== 'analysed') { L.push('   ' + D.state + (D.note ? ': ' + D.note : ''), ''); return; }
    const S = D.summary, T = S.totals;
    L.push('   Class: ' + D.cls + (D.otherClass ? ' (other classes left out: ' + JSON.stringify(D.otherClass) + ')' : '') + '. Layouts used: ' + S.layouts + '.');
    L.push('   Transactions: ' + T.all.n + '. Classified ' + T.all.classified + ' (' + pct(T.all.share) + '): exact layout ' + T.all.A + ', shared-layout same bedrooms ' + T.all.B + '. Ambiguous ' + T.all.C + ', unmatched ' + T.all.D + '.');
    ['resale', 'sub', 'new'].forEach((s) => { if (T[s]) L.push('     ' + s.padEnd(7) + T[s].n + ' sales, classified ' + pct(T[s].share) + ' (C ' + T[s].C + ', D ' + T[s].D + ')'); });
    L.push('   Resales classified by period: latest ' + pct(S.bias.shareByPeriod[0]) + ', earlier ' + pct(S.bias.shareByPeriod[1]) + '.');
    L.push('   By bedroom type (all sale types / resale; resale latest vs earlier 12 months, median psf):');
    Object.keys(S.groups).forEach((g) => {
      const Gp = S.groups[g], r = Gp.sales.resale, p0 = r ? r.periods[0] : null, p1 = r ? r.periods[1] : null, pr = S.pulse.byGroup[g], mx = S.mix[g];
      L.push('     ' + Gp.label.padEnd(10) + String(Gp.n).padStart(5) + ' / ' + String(r ? r.all.n : 0).padStart(4) + '   latest ' + (p0 ? p0.n + ' @ ' + money(p0.psf && p0.psf[2]) : '–') + '   earlier ' + (p1 ? p1.n + ' @ ' + money(p1.psf && p1.psf[2]) : '–') +
        '   pulse: ' + (pr ? pr.evidence + (pr.dir ? ' ' + pr.dir + ' ' + pr.pct + '%' : '') : '–') + (mx ? '   mix shift ' + mx.tvd + (mx.flag ? ' FLAG' : '') + ' (raw ' + mx.rawPct + '%, same-layout ' + (mx.fixedPct == null ? '–' : mx.fixedPct + '%') + ')' : '') +
        (r && r.ambiguousShare ? '   possible resales lost to ambiguity ' + pct(r.ambiguousShare) : '') + '   areas ' + Gp.sqm.join('–') + ' sqm');
    });
    if (S.unclassified.C.length) L.push('   Ambiguous areas: ' + S.unclassified.C.map((c) => c.sqm + ' sqm x' + c.n + ' (' + c.groups.join('/') + ' via ' + c.codes.join(',') + ')').join('; '));
    if (S.unclassified.D.length) L.push('   Unmatched areas: ' + S.unclassified.D.map((c) => c.sqm + ' sqm x' + c.n + (c.near ? ' (nearest ' + c.near.code + ', ' + c.near.gap + ' sqm off)' : '')).join('; '));
    L.push('   Layouts no sale fitted: ' + (S.layoutCheck.unusedLayouts.join(', ') || 'none') + '. Repeated unmatched areas: ' + (S.layoutCheck.repeatedUnmatched.map((d) => d.sqm).join(', ') || 'none') + '.');
    const b = S.bias;
    L.push('   Bias (resales, two periods): classified ' + b.classified + ', unclassified ' + b.unclassified + '. Median psf ' + money(b.medPsf.classified) + ' vs ' + money(b.medPsf.unclassified) + (b.psfGapPct != null ? ' (' + b.psfGapPct + '%)' : '') + '; median size ' + b.medSqft.classified + ' vs ' + (b.medSqft.unclassified || '–') + ' sq ft; floors 1 to 5: ' + pct(b.lowFloorShare.classified) + ' vs ' + pct(b.lowFloorShare.unclassified) + '.');
    const pb = S.pulse.bands, pg = S.pulse.groups;
    L.push('   Market Pulse, ' + S.pulse.n12 + ' resales in the latest 12 months:');
    L.push('     100 sq ft bands: ' + Object.keys(S.pulse.byBand).length + ' bands, strong ' + pb.strong + ', limited ' + pb.limited + ', none ' + pb.none + '; resales under a strong reading ' + pct(pb.coverStrong) + ', under any reading ' + pct(pb.coverAny));
    L.push('     bedroom types:   ' + Object.keys(S.pulse.byGroup).length + ' types, strong ' + pg.strong + ', limited ' + pg.limited + ', none ' + pg.none + '; resales under a strong reading ' + pct(pg.coverStrong) + ', under any reading ' + pct(pg.coverAny));
    if (D.rental) L.push('   Rental cross-check (' + D.rental.n + ' contracts): declared bedrooms agree with the layouts in range ' + pct(D.rental.agreeShare) + ', conflict ' + D.rental.conflict + ', no layout in range ' + D.rental.noLayout + '. ' + D.rental.ranges.map((r) => r.range + ': ' + Object.keys(r.declared).map((k) => k + 'BR x' + r.declared[k]).join(' ') + ' [layouts ' + (r.layoutBedrooms.join('/') || 'none') + ']').join('; '));
    L.push('');
  });
  return L.join('\n') + '\n';
}

module.exports = { build, publicView, reportText, readRaw, RULES };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const rawDir = arg('raw'), layDir = arg('layouts'), repDir = arg('report'), pubPath = arg('public'), allowSecondary = process.argv.indexOf('--allow-secondary') > -1;
  if (!rawDir || !layDir || !repDir) { console.error('Usage: node tools/market-data/build-bedroom.js --raw <folder> --layouts <folder> --report <private folder> [--public <file>] [--allow-secondary] [--as-of YYYY-MM-DD] [--to YYYY-MM]'); process.exit(2); }
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), pc = JSON.parse(fs.readFileSync(path.join(__dirname, 'project-config.json'), 'utf8'));
  const db = E.loadLayouts(fs.readFileSync(path.join(layDir, 'layouts.csv'), 'utf8'), fs.existsSync(path.join(layDir, 'sources.csv')) ? fs.readFileSync(path.join(layDir, 'sources.csv'), 'utf8') : '');
  const raw = readRaw(rawDir), rep = build(raw, db, cfg, pc, { asOf: arg('as-of'), to: arg('to') });
  fs.mkdirSync(repDir, { recursive: true });
  fs.writeFileSync(path.join(repDir, 'bedroom-report.json'), JSON.stringify(rep, null, 1));
  const text = reportText(rep); fs.writeFileSync(path.join(repDir, 'bedroom-report.txt'), text); console.log(text);
  if (pubPath) { const pub = publicView(rep, { allowSecondary }); fs.mkdirSync(path.dirname(pubPath), { recursive: true }); fs.writeFileSync(pubPath, JSON.stringify(pub)); console.log('Public aggregates: ' + Object.keys(pub.developments).length + ' development(s) -> ' + pubPath + (allowSecondary ? '  (LOCAL PREVIEW: secondary layout tables allowed)' : '')); }
}
