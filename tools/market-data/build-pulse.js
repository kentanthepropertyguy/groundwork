#!/usr/bin/env node
/* The Map's one-line market snapshot -> data/map/pulse.json.
   One compact record per development, made by the SAME module the Research page uses (assets/js/gw-pulse.js) from the SAME detail records,
   with the sale type and size band Research opens a development on (analyseProject's own default). So the Map line and the Research
   report cannot disagree; research/tests/pulse-tests.js checks every development against it.
   Reads data/projects only. No network. Run after the Research project data is refreshed (refresh-all.js does):  node tools/market-data/build-pulse.js
   Record: { s: sale type, e: evidence s|l|n, d: direction h|l|s|'', c: median change %, a: sales in 12 months, b: sales in the 12 months before, l: latest sale month }.
   Developments with no transactions are left out. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..'), DIR = path.join(ROOT, 'data/projects');
const PULSE = require(path.join(ROOT, 'assets/js/gw-pulse.js')), R = require(path.join(ROOT, 'assets/js/kpt-research.js'));
function build(manifest, projects) {
  const rows = {}; let n = 0;
  Object.keys(projects).sort().forEach((id) => {
    const p = projects[id], M = R.analyseProject(p, manifest, {});
    const c = PULSE.compact(PULSE.compute(p, manifest, { sale: M.sale && M.sale.selected, bin: M.focus && M.focus.bin != null ? M.focus.bin : undefined }));
    if (c) { rows[id] = c; n++; }
  });
  return { v: 1, kind: 'gw-pulse', rule: PULSE.VERSION, asOf: manifest.asOf, latestMonth: manifest.latestMonth, count: n, rows };
}
if (require.main === module) {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')), projects = {};
  fs.readdirSync(path.join(DIR, 'detail')).filter((f) => /\.json$/.test(f)).forEach((f) => Object.assign(projects, JSON.parse(fs.readFileSync(path.join(DIR, 'detail', f), 'utf8')).projects));
  const out = build(manifest, projects);
  fs.writeFileSync(path.join(ROOT, 'data/map/pulse.json'), JSON.stringify(out) + '\n');
  console.log('data/map/pulse.json: ' + out.count + ' developments (rule ' + out.rule + ', data to ' + out.latestMonth + ').');
}
module.exports = { build };
