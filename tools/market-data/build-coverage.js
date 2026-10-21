#!/usr/bin/env node
/* ==========================================================================
   Coverage metadata that must follow the shared development register (register.js) on every data refresh, so nothing is kept by hand:

     1. The names Research leaves out (window.GW_NOT_COVERED in research/index.html): EC and cluster-housing developments that URA lists with strata
        sales but that have no admissible single-home sale, so they are not in the register. Condo names are not listed here (unchanged behaviour).
        Rule: a name with at least one strata transaction of the EC or cluster class that is NOT a row of data/projects/index.json
        (and is not on the reviewed exclude/hold lists).
     2. The plain-language reason for two developments of different classes (registry meta.json, policy.support.unsupportedReasons['different-class']),
        taken from register.js so the wording lives in one place.

   Usage:
     node tools/market-data/build-coverage.js --raw <folder of URA batch-*.json> [--site .]          writes both
     node tools/market-data/build-coverage.js --raw <folder> --check                                  changes nothing; exits non-zero if either is out of date
   Run it after build-project-stats.js (it reads data/projects/index.json). tools/market-data/tests/coverage-tests.js covers it.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const REG = require('./register.js');

const NOT_COVERED_RE = /window\.GW_NOT_COVERED = (\{[^\n]*?\});<\/script>/;

function notCovered(transactions, cfg, pc, indexNames) {
  const tmap = REG.checkConfig(cfg), screen = REG.nameScreen(pc), have = new Set(indexNames), found = { ec: new Set(), cluster: new Set() };
  transactions.forEach((t) => {
    const cls = tmap.get(t.propertyType); if (cls !== 'ec' && cls !== 'cluster') return;
    if (t.typeOfArea !== 'Strata' || !t.project) return;
    const name = REG.shownName(t.project, pc);
    if (have.has(name) || screen(t.project)) return;
    found[cls].add(name);
  });
  const sort = (s) => Array.from(s).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { ec: sort(found.ec), cluster: sort(found.cluster) };
}

const DIFFERENT_CLASS_REASON = 'A condominium, an executive condominium (EC) and a cluster-housing development sell under different rules and at different price levels, so Groundwork does not compare their prices.';

function applyNotCovered(html, list) {
  if (!NOT_COVERED_RE.test(html)) throw new Error('research/index.html has no window.GW_NOT_COVERED line to update.');
  return html.replace(NOT_COVERED_RE, () => 'window.GW_NOT_COVERED = ' + JSON.stringify(list) + ';</script>');
}
// Only this one reason is touched; the rest of meta.json is kept exactly as it is (same key order, same formatting).
function applyMeta(text) {
  const meta = JSON.parse(text), r = meta.policy && meta.policy.support && meta.policy.support.unsupportedReasons;
  if (!r) throw new Error('registry meta.json has no policy.support.unsupportedReasons.');
  r['different-class'] = DIFFERENT_CLASS_REASON;
  return JSON.stringify(meta, null, 1) + (text.endsWith('\n') ? '\n' : '');
}

module.exports = { notCovered, applyNotCovered, applyMeta, DIFFERENT_CLASS_REASON, NOT_COVERED_RE };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const site = path.resolve(arg('site', path.join(__dirname, '..', '..'))), rawDir = arg('raw'), check = process.argv.includes('--check');
  if (!rawDir) { console.error('Pass --raw <folder of URA batch-*.json>.'); process.exit(2); }
  const { flatten } = require('./build-project-stats.js');
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), pc = JSON.parse(fs.readFileSync(path.join(__dirname, 'project-config.json'), 'utf8'));
  const files = fs.readdirSync(rawDir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8')));
  const ix = JSON.parse(fs.readFileSync(path.join(site, 'data/projects/index.json'), 'utf8')), ni = ix.fields.indexOf('name');
  const list = notCovered(flatten(files), cfg, pc, ix.rows.map((r) => r[ni]));
  const pageFile = path.join(site, 'research/index.html'), metaFile = path.join(site, 'data/registry/meta.json');
  const page = fs.readFileSync(pageFile, 'utf8'), meta = fs.readFileSync(metaFile, 'utf8');
  const nextPage = applyNotCovered(page, list), nextMeta = applyMeta(meta);
  console.log('not covered: ec ' + list.ec.length + ', cluster ' + list.cluster.length + (list.ec.length + list.cluster.length ? ' (' + list.ec.concat(list.cluster).slice(0, 6).join(', ') + ')' : ''));
  if (check) {
    const bad = [page !== nextPage && 'research/index.html (GW_NOT_COVERED)', meta !== nextMeta && 'data/registry/meta.json (different-class reason)'].filter(Boolean);
    if (bad.length) { console.error('Out of date: ' + bad.join(', ') + '. Run build-coverage.js without --check.'); process.exit(1); }
    console.log('coverage metadata is up to date');
  } else { fs.writeFileSync(pageFile, nextPage); fs.writeFileSync(metaFile, nextMeta); console.log('written'); }
}
