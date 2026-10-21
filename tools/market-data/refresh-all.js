#!/usr/bin/env node
/* ==========================================================================
   Monthly data refresh in the one correct order, so every page works from the same development register (condos, ECs, cluster housing).

     node tools/market-data/refresh-all.js --raw <folder of URA batch-*.json> --as-of YYYY-MM-DD [--site .]

   Steps (each is also runnable on its own; see the file header of each):
     1. build-project-stats.js   Research project data (index, detail, peers, search, manifest) -> data/projects
     2. build-map-data.js        Map positions and cells                                          -> data/map/places.json, ev.json
     2b. build-positions.js     Positions for launched developments URA gives no coordinates for (OneMap's own project records) -> data/map/places.json, positions-onemap.json
                                 (reads sources/onemap-uc.json and sources/onemap-names.json; refresh those first, with network: fetch-onemap-uc.js, then fetch-onemap-names.js, then build-upcoming.js after this)
     3. build-find-index.js      FIND index                                                       -> data/projects/find.json
     4. build-registry-classes.js  Registry rows and their class                                  -> data/registry/index.json
     5. build-suggest.js         Research "Compare with" suggestions                              -> data/research/suggest.json
     6. build-coverage.js        Not-covered names (research/index.html) and the registry's different-class wording
   Kept as they are: data/projects/inventory.json, the live manifest attribution wording (the builder's own text is a PENDING placeholder),
   curated registry rows, data/map/amen*.json.
   After it: run the tests, then bump the asset hashes. Nothing here needs a manual edit.
   ========================================================================== */
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const site = path.resolve(arg('site', path.join(__dirname, '..', '..'))), raw = arg('raw'), asOf = arg('as-of');
if (!raw || !asOf) { console.error('Usage: node tools/market-data/refresh-all.js --raw <folder> --as-of YYYY-MM-DD [--site .]'); process.exit(2); }
const md = (f) => path.join(site, 'tools/market-data', f), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-refresh-'));
const run = (label, script, args) => { console.log('== ' + label); const r = cp.spawnSync('node', [md(script)].concat(args), { cwd: site, stdio: 'inherit' }); if (r.status !== 0) { console.error(label + ' failed (exit ' + r.status + '). Nothing after this step was run.'); process.exit(r.status || 1); } };
const copy = (from, to) => fs.cpSync(from, to, { recursive: true });

const livePath = path.join(site, 'data/projects/manifest.json');
const live = fs.existsSync(livePath) ? JSON.parse(fs.readFileSync(livePath, 'utf8')) : null;
run('Research project data', 'build-project-stats.js', ['--raw', raw, '--out', path.join(tmp, 'projects'), '--as-of', asOf, '--report', path.join(tmp, 'projects-report.txt')]);
const mp = path.join(tmp, 'projects/manifest.json'), man = JSON.parse(fs.readFileSync(mp, 'utf8'));
if (live && live.attribution && !/^PENDING/.test(live.attribution)) { man.attribution = live.attribution; fs.writeFileSync(mp, JSON.stringify(man)); }
else if (/^PENDING/.test(man.attribution || '')) console.warn('WARNING: the manifest attribution is still the PENDING placeholder. Set the agreed URA wording before publishing.');
const dp = path.join(site, 'data/projects');
fs.rmSync(path.join(dp, 'detail'), { recursive: true, force: true }); fs.rmSync(path.join(dp, 'peers'), { recursive: true, force: true });
['manifest.json', 'index.json', 'search.json'].forEach((f) => fs.copyFileSync(path.join(tmp, 'projects', f), path.join(dp, f)));
['detail', 'peers'].forEach((d) => copy(path.join(tmp, 'projects', d), path.join(dp, d)));
run('Map data', 'build-map-data.js', ['--raw', raw, '--out', path.join(tmp, 'map'), '--projects', 'data/projects', '--as-of', asOf, '--report', path.join(tmp, 'map-nopos.txt')]);
['places.json', 'ev.json'].forEach((f) => fs.copyFileSync(path.join(tmp, 'map', f), path.join(site, 'data/map', f)));
run('Map positions from OneMap', 'build-positions.js', []);
run('FIND index', 'build-find-index.js', ['--raw', raw, '--project-data', 'data/projects', '--out', path.join(dp, 'find.json'), '--as-of', asOf]);
run('Registry classes', 'build-registry-classes.js', []);
run('Compare suggestions', 'build-suggest.js', []);
run('Coverage metadata', 'build-coverage.js', ['--raw', raw]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('Refresh complete. Now run the tests and bump the asset hashes.');
