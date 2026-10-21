#!/usr/bin/env node
/* ==========================================================================
   Registry names for the shared development register. Every development in data/projects/index.json (condos, ECs, cluster housing) gets a
   directory row in data/registry/index.json, and every row carries its class in a trailing "cls" field. Existing rows (including the curated
   ones) are kept exactly as they are; only missing developments are added, as plain URA-data rows (level BASIC) built the same way as the rest.

   Usage: node tools/market-data/build-registry-classes.js [--projects data/projects] [--registry data/registry] [--check]
   --check changes nothing and exits non-zero if the registry would change (use it in the release checks).
   ========================================================================== */
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };

function update(projects, registry) {
  const PF = projects.fields, pc = (n) => PF.indexOf(n), RF = registry.fields.slice();
  if (RF.indexOf('cls') < 0) RF.push('cls');
  const rc = (n) => RF.indexOf(n), pById = new Map(projects.rows.map((r) => [r[pc('id')], r]));
  const out = [], notes = { added: 0, classed: 0, differs: [] };
  registry.rows.forEach((r) => {
    const row = r.slice(); while (row.length < RF.length) row.push(null);
    const p = pById.get(row[rc('id')]);
    if (p) {
      row[rc('cls')] = p[pc('cls')] || 'condo'; notes.classed++;
      const same = row[rc('street')] === p[pc('street')] && String(row[rc('district')]) === String(p[pc('district')]) && row[rc('seg')] === p[pc('seg')] && row[rc('tenure')] === p[pc('tenLabel')] && row[rc('resale')] === p[pc('resale')] && row[rc('last')] === p[pc('last')];
      if (!same) notes.differs.push(row[rc('id')]);
    }
    out.push(row);
  });
  const have = new Set(out.map((r) => r[rc('id')]));
  projects.rows.forEach((p) => {
    if (have.has(p[pc('id')])) return;
    const row = new Array(RF.length).fill(null);
    row[rc('id')] = p[pc('id')]; row[rc('name')] = p[pc('name')]; row[rc('street')] = p[pc('street')]; row[rc('district')] = p[pc('district')]; row[rc('seg')] = p[pc('seg')];
    row[rc('tenure')] = p[pc('tenLabel')]; row[rc('stage')] = 'unknown'; row[rc('level')] = 'BASIC'; row[rc('resale')] = p[pc('resale')]; row[rc('last')] = p[pc('last')];
    row[rc('cmp')] = 0; row[rc('aliases')] = []; row[rc('cls')] = p[pc('cls')] || 'condo';
    out.push(row); notes.added++;
  });
  out.sort((a, b) => (a[rc('id')] < b[rc('id')] ? -1 : 1));
  return { doc: Object.assign({}, registry, { fields: RF, rows: out }), notes };
}
module.exports = { update };

if (require.main === module) {
  const root = path.join(__dirname, '..', '..'), pd = arg('projects', path.join(root, 'data/projects')), rd = arg('registry', path.join(root, 'data/registry'));
  const projects = JSON.parse(fs.readFileSync(path.join(pd, 'index.json'), 'utf8')), registry = JSON.parse(fs.readFileSync(path.join(rd, 'index.json'), 'utf8'));
  const res = update(projects, registry), text = JSON.stringify(res.doc), file = path.join(rd, 'index.json');
  console.log('registry rows: ' + registry.rows.length + ' -> ' + res.doc.rows.length + ' (added ' + res.notes.added + ', classed ' + res.notes.classed + ', rows whose URA facts differ from the project index: ' + res.notes.differs.length + ')');
  if (process.argv.includes('--check')) { if (fs.readFileSync(file, 'utf8') !== text) { console.error('The registry index is out of date; run build-registry-classes.js.'); process.exit(1); } console.log('registry index is up to date'); }
  else fs.writeFileSync(file, text);
}
