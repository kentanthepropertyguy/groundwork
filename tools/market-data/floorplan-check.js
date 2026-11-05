#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — check a developer floor-plan table BEFORE it goes into the private layouts folder (see FLOORPLANS.md).

   It needs no private URA data: it reads the table and the development's published URA sales (data/projects/tx, the same sales Research
   shows) and prints, per development:
     0 import:      the table's header against the columns the engine reads (bedroom-hybrid.js LAYOUT_COLUMNS), and, with --folder, that the
                    private layouts folder really loads this table: every row, through the same loader the refresh uses (loadDb). A table
                    the refresh would drop or shadow is reported here, never discovered after a release.
     1 the table:   rows, issues (bedroom-engine.js loadLayouts: areas, statuses, duplicate codes, sources, levels), and the sizes where
                    layouts of different bedroom groups share an area (on every floor, or only on some URA floor bands)
     2 the sales:   the share whose area fits a layout (layout-quality.js asks for 90% or more) and every recorded size no layout explains
     3 a preview:   each sale decided as bedroom-hybrid.js decides it (bedroom-engine.js classify, and with levels the engine's own
                    layoutsOnFloor and floor-dependent rule), with the published labels standing in for the rental contracts. The stand-in
                    is the engine's previous output, not the contracts: it cannot show whether a contract declares a count, so sizes the
                    floor rule decides against the stand-in are contradictions under the default rule A (with --floor-rule B, listed as "floor rule"
                    for the private run to confirm). The penthouse group is never published as one pricing group. A PREVIEW only:
                    the accepted run on the private URA folder decides.

     node tools/market-data/floorplan-check.js --layouts <table.csv> [--sources <sources.csv>] [--folder <private layouts folder>]
          [--project "URA NAME"] [--site .] [--json <file>]

   The table is the engine's own format (bedroom-engine.js): project,code,bedrooms,variant,sqm,sqft[,levels],source,status,note
   Tables stay private (developer floor-plan facts): never put one in the repository. This prints no unit number.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const E = require('./bedroom-engine.js'), H = require('./bedroom-hybrid.js');
const P_ = require('../../assets/js/kpt-project.js');

const RULES = { explained: 0.9, minCoverage: 0.7, maxAmbiguousShare: 0.2, minSales: 5, months: 24 };
const REQUIRED = ['project', 'code', 'bedrooms', 'variant', 'sqm', 'source', 'status'];
const toIdx = (ym) => Math.floor(ym / 100) * 12 + (ym % 100) - 1;
const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : null);
const uniq = (a) => Array.from(new Set(a));
const groupsOf = (c) => uniq((c.cls === 'C' ? c.groups : c.group != null ? [c.group] : []).map(String)).sort().join('|');

// 0 import: header, and (optional) the folder as the refresh loads it
function header(csv) {
  const h = String(csv).split(/\r?\n/)[0].split(',').map((s) => s.trim().toLowerCase());
  return { columns: h, missing: REQUIRED.filter((c) => h.indexOf(c) < 0), unknown: h.filter((c) => c && H.LAYOUT_COLUMNS.indexOf(c) < 0) };
}
function folderCheck(folder, db) {
  const loaded = H.loadDb([folder]), out = [];
  db.forEach((P, name) => {
    const L = loaded.get(name), want = P.all.length, got = L ? L.all.length : 0;
    if (got !== want) out.push(name + ': the folder loads ' + got + ' of this table\'s ' + want + ' rows' + (got > want ? ' (another file in the folder also has this development)' : ' (the refresh would not use this table)'));
    else if (L && (L.layouts.length !== P.layouts.length || L.layouts.filter((l) => l.levels).length !== P.layouts.filter((l) => l.levels).length)) out.push(name + ': the folder loads the rows differently from the table (used layouts or levels differ)');
    else if (L && L.issues.length > P.issues.length) out.push(name + ': the folder reports ' + (L.issues.length - P.issues.length) + ' more issue(s) than the table, e.g. ' + L.issues.find((s) => P.issues.indexOf(s) < 0) + ' (is this table\'s source in the folder\'s sources.csv?)');
  });
  return out;
}

// one development: P (engine project), rows [[ym, sale, floor, sqm, price, beds, basis, flags]], floorBands
function check(P, rows, floorBands, floorRule) {
  const ruleB = (floorRule || H.FLOOR_RULE) === 'B';   // the engine's floor rule (bedroom-hybrid.js FLOOR_RULE; default 'A')
  const conflicts = new Map(), floorConflicts = [];   // whole-sqm sizes whose layouts fall in different groups
  P.layouts.forEach((l) => { for (let a = Math.ceil(l.iv[0]); a <= Math.floor(l.iv[1]); a++) { const c = E.classify(String(a), P.layouts); if (c.cls === 'C') conflicts.set(a, c.groups.map(String)); } });
  if (P.hasLevels) conflicts.forEach((g, a) => {
    const byBand = floorBands.filter((b) => E.floorBand(b)).map((b) => ({ band: b, c: E.classify(String(a), E.layoutsOnFloor(P.layouts, b)) })).filter((x) => x.c.cls !== 'D');
    floorConflicts.push({ sqm: a, bands: byBand.map((x) => x.band + ' ' + (x.c.cls === 'C' ? x.c.groups.join('/') : x.c.group)) });
  });
  const latest = rows.length ? Math.max.apply(null, rows.map((r) => r[0])) : null;
  const run = (useLevels) => {
    const tiers = { verified: {}, inferred: {}, unclassified: {} }, contradictions = [], floorRule = [], unexplained = {};
    let recent = 0, open = 0; const kept = {}, amb = {};
    rows.forEach((r) => {
      const [ym, sale, fl, sqm, , beds, basis] = r, fr = fl == null ? null : floorBands[fl];
      let lays = P.layouts, floorDep = false;
      if (useLevels && P.hasLevels && E.floorBand(fr)) { const on = E.layoutsOnFloor(P.layouts, fr); if (groupsOf(E.classify(String(sqm), P.layouts)) !== groupsOf(E.classify(String(sqm), on))) { lays = on; floorDep = true; } }
      const lay = E.classify(String(sqm), lays);
      let tier, group = null, possible = [];
      if (lay.cls === 'A' || lay.cls === 'B') {
        const bs = uniq(lays.filter((l) => lay.codes.indexOf(l.code) > -1).map((l) => l.bedrooms));
        if (basis === 'i' && bs.length === 1 && beds !== bs[0] && !(ruleB && floorDep)) { tier = 'unclassified'; possible = uniq([String(lay.group), String(beds)]); contradictions.push({ sqm, floor: fr, plans: bs[0], group: lay.group, rental: beds, codes: lay.codes }); }
        else { tier = 'verified'; group = String(lay.group); if (basis === 'i' && bs.length === 1 && beds !== bs[0]) floorRule.push({ sqm, floor: fr, plans: bs[0], group: lay.group, published: beds, codes: lay.codes }); }
      } else if (basis === 'i' && Number.isInteger(beds) && !(floorDep && lay.cls === 'C' && lay.groups.map(String).indexOf(String(beds)) < 0)) { tier = 'inferred'; group = String(beds); }
      else { tier = 'unclassified'; possible = lay.cls === 'C' ? lay.groups.map(String) : Number.isInteger(beds) ? [String(beds)] : []; if (lay.cls === 'D') unexplained[sqm] = (unexplained[sqm] || 0) + 1; }
      const k = group || 'size ' + sqm; tiers[tier][k] = (tiers[tier][k] || 0) + 1;
      if (sale === 3 && latest != null && toIdx(latest) - toIdx(ym) < RULES.months) {
        recent++;
        if (tier === 'unclassified') { open++; possible.forEach((g) => { amb[g] = (amb[g] || 0) + 1; }); } else kept[group] = (kept[group] || 0) + 1;
      }
    });
    const coverage = recent ? (recent - open) / recent : null, types = {};
    uniq(Object.keys(kept).concat(Object.keys(amb))).forEach((g) => {
      const k = kept[g] || 0, a = amb[g] || 0, share = k + a ? a / (k + a) : null;
      types[g] = { kept: k, ambiguous: a, share: share == null ? null : Math.round(share * 1000) / 1000, shown: g !== 'PH' && coverage != null && coverage >= RULES.minCoverage && k >= RULES.minSales && share != null && share <= RULES.maxAmbiguousShare };
    });
    return { tiers, contradictions, floorRule, unexplained, recent, classified: recent - open, coverage: coverage == null ? null : Math.round(coverage * 1000) / 1000, types };
  };
  const all = rows.length, fits = rows.filter((r) => E.classify(String(r[3]), P.layouts).cls !== 'D').length;
  return { project: P.project, layouts: P.layouts.length, status: P.status, publishable: P.publishable, issues: P.issues, hasLevels: !!P.hasLevels,
    conflicts: Array.from(conflicts.entries()).sort((a, b) => a[0] - b[0]).map(([sqm, g]) => ({ sqm, groups: g })), floorConflicts,
    sales: all, explained: all ? Math.round(fits / all * 1000) / 1000 : null, explainedOk: all ? fits / all >= RULES.explained : false,
    withoutLevels: run(false), withLevels: P.hasLevels ? run(true) : null };
}

function salesOf(site, name) {
  const man = JSON.parse(fs.readFileSync(path.join(site, 'data/projects/tx/manifest.json'), 'utf8')), id = P_.slugify(name);
  const sh = JSON.parse(fs.readFileSync(path.join(site, 'data/projects/tx', P_.shardName(P_.shardOf(id, man.shards)) + '.json'), 'utf8'));
  const p = sh.projects[id]; return { id, rows: p ? p.rows : null, floorBands: man.floorBands, latestMonth: man.latestMonth };
}

function print(R, id) {
  const L = [], typ = (t) => Object.keys(t).sort().map((g) => (g === 'PH' ? 'penthouse' : g + '-bed') + ' ' + t[g].kept + ' kept / ' + t[g].ambiguous + ' could be (' + (t[g].share == null ? '-' : Math.round(t[g].share * 100) + '%') + ')' + (g === 'PH' ? ' never published as a group' : t[g].shown ? ' SHOWN' : ' withheld')).join('; ');
  L.push('== ' + R.project + ' (' + id + ')');
  L.push('Table: ' + R.layouts + ' layouts, status ' + R.status + (R.publishable ? ' (publishable)' : ' (NOT publishable: every row must be developer or approved)') + (R.hasLevels ? ', with levels' : ', no levels') + (R.issues.length ? '\n  ISSUES: ' + R.issues.join('\n          ') : ', no issues'));
  if (R.conflicts.length) L.push('Sizes whose layouts are in different bedroom groups: ' + R.conflicts.map((c) => c.sqm + ' sqm (' + c.groups.join('/') + ')').join(', '));
  R.floorConflicts.forEach((c) => L.push('  ' + c.sqm + ' sqm by URA floor band: ' + c.bands.join('; ')));
  L.push('Sales: ' + R.sales + ' recorded; the table explains ' + pct(R.explained * R.sales, R.sales) + '% (needs 90%)' + (R.explainedOk ? '' : '  <-- CHECK the table'));
  const u = R.withoutLevels.unexplained; if (Object.keys(u).length) L.push('  sizes no layout fits: ' + Object.keys(u).map((a) => a + ' sqm x' + u[a]).join(', '));
  [['Preview without levels', R.withoutLevels], R.withLevels ? ['Preview with levels (the engine reads them from 5 Nov 2026)', R.withLevels] : null].filter(Boolean).forEach(([h, x]) => {
    L.push(h + ':');
    L.push('  verified ' + JSON.stringify(x.tiers.verified) + '; inferred (published rental labels) ' + JSON.stringify(x.tiers.inferred));
    if (Object.keys(x.tiers.unclassified).length) L.push('  unclassified ' + JSON.stringify(x.tiers.unclassified));
    if (x.contradictions.length) L.push('  contradictions (plans vs published rental labels): ' + x.contradictions.length + ' ' + JSON.stringify(x.contradictions.map((c) => c.sqm + ' sqm' + (c.floor ? ' floors ' + c.floor : '') + ': plans ' + c.group + ', rental ' + c.rental)));
    if (x.floorRule.length) L.push('  floor rule (the floor\'s layout replaces a published label; the private run confirms a contract declares it): ' + x.floorRule.length + ' ' + JSON.stringify(uniq(x.floorRule.map((c) => c.sqm + ' sqm floors ' + c.floor + ': ' + c.published + ' -> ' + c.group))));
    L.push('  latest 24 months: ' + x.classified + ' of ' + x.recent + ' resales classified = ' + Math.round(x.coverage * 1000) / 10 + '% (gate 70%' + (x.coverage >= RULES.minCoverage ? ', passes' : ', FAILS') + ')');
    L.push('  types: ' + typ(x.types));
  });
  return L.join('\n');
}

if (require.main === module) {
  const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : null; };
  if (!arg('layouts')) { console.error('Usage: node tools/market-data/floorplan-check.js --layouts <table.csv> [--sources <sources.csv>] [--folder <private layouts folder>] [--project "URA NAME"] [--site .] [--json <file>] [--floor-rule A|B]'); process.exit(2); }
  const site = path.resolve(arg('site') || '.'), csv = fs.readFileSync(arg('layouts'), 'utf8'), hd = header(csv);
  let stop = false;
  if (hd.missing.length) { console.log('IMPORT: the header lacks ' + hd.missing.join(', ') + '. Columns: ' + H.LAYOUT_COLUMNS.join(',')); stop = true; }
  if (hd.unknown.length) { console.log('IMPORT: column(s) the engine does not read: ' + hd.unknown.join(', ') + ' (check the spelling; they are dropped)'); stop = true; }
  const db = E.loadLayouts(csv, arg('sources') ? fs.readFileSync(arg('sources'), 'utf8') : ''), out = [];
  if (!arg('sources')) console.log('(no --sources: every row\'s source will be reported as not listed)');
  if (arg('folder')) { const f = folderCheck(arg('folder'), db); f.forEach((s) => console.log('IMPORT: ' + s)); if (f.length) stop = true; else console.log('Import: the folder loads every row of this table.'); }
  else console.log('(no --folder: the import into the private layouts folder is not checked; run again with --folder after copying the table there)');
  db.forEach((P) => {
    if (arg('project') && P.project !== arg('project')) return;
    const S = salesOf(site, P.project);
    if (!S.rows) { console.log('== ' + P.project + ': no published sales under ' + S.id + ' (check the URA name)'); return; }
    const R = check(P, S.rows, S.floorBands, arg('floor-rule')); out.push(Object.assign({ id: S.id, latestMonth: S.latestMonth }, R)); console.log(print(R, S.id) + '\n');
  });
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
  if (stop) process.exitCode = 1;
}
module.exports = { check, header, folderCheck, salesOf, RULES };
