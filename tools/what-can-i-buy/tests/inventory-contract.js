'use strict';
/* Huttons inventory data contract (V3.10, 27 Oct 2026; written from Claude C's spec in FOR-CLAUDE-B-14-DAY-CADENCE.md, section 3.1).
   Checks the SHAPE of data/projects/inventory.json, never its content, so any approved refresh passes and nothing here needs editing when the data
   changes. No dependencies. Run: node tools/what-can-i-buy/tests/inventory-contract.js data/projects/inventory.json   (exit 1 on any failure)
   Also usable from other tests: require('./inventory-contract.js').check(text) returns a list of errors ([] when the file is valid). */
const KEYS = ['checkedAt', 'kind', 'projects', 'source', 'tool', 'v'];
const PROJECT_KEYS = ['byBedrooms', 'checkedAt', 'name', 'slug', 'status'];
const REVIEWED_KEYS = ['district', 'region', 'tenure', 'tenureGroup'];            // a project URA does not list carries its reviewed details
const OPTIONAL_KEYS = ['street'];
const TYPE_KEYS = ['bands', 'bedrooms', 'ceiling', 'label'];
const STATUS = ['ok', 'zero_returned'];
const LABEL = (n) => (n === 0 ? 'Studio' : n === 1 ? '1 bedroom' : n >= 5 ? '5+ bedrooms' : n + ' bedrooms');
// names that would mean unit-level data had leaked (never allowed anywhere in the file)
const FORBIDDEN = /^(unit|units|unitNo|unitNumber|stack|floor|level|price|prices|psf|count|unitsShown|unitCount|available|sold|listing|listings|private|raw)$/i;
const UNIT_NO = /#\s?\d{1,3}-\d{1,4}/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function check(text) {
  const e = [], err = (m) => e.push(m);
  let doc; try { doc = JSON.parse(text); } catch (x) { return ['not valid JSON']; }
  if (text !== JSON.stringify(doc, null, 1) + '\n') err('layout: the file must be exactly JSON.stringify(doc, null, 1) plus a final newline');
  if (UNIT_NO.test(text)) err('a unit number appears in the file');
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return e.concat('the top level must be an object');
  const keys = Object.keys(doc).sort(); if (keys.join() !== KEYS.join()) err('header keys must be exactly ' + KEYS.join(', ') + ' (found ' + keys.join(', ') + ')');
  if (doc.v !== 2) err('v must be 2'); if (doc.kind !== 'kpt-huttons-public-inventory') err('kind must be kpt-huttons-public-inventory');
  if (typeof doc.tool !== 'string' || !doc.tool) err('tool must be a non-empty string'); if (typeof doc.source !== 'string' || !doc.source) err('source must be a non-empty string');
  if (typeof doc.checkedAt !== 'string' || !ISO.test(doc.checkedAt)) err('checkedAt must be an ISO UTC time');
  const fileAt = Date.parse(doc.checkedAt);
  if (!Array.isArray(doc.projects) || !doc.projects.length) return e.concat('projects must be a non-empty list');
  const slugs = doc.projects.map((p) => (p && p.slug) || '');
  if (slugs.slice().sort().join('\n') !== slugs.join('\n')) err('projects must be sorted by slug');
  if (new Set(slugs).size !== slugs.length) err('project slugs must be unique');
  doc.projects.forEach((p, i) => {
    const at = 'project ' + (p && p.slug ? p.slug : '#' + i) + ': ';
    if (!p || typeof p !== 'object') { err(at + 'not an object'); return; }
    const k = Object.keys(p);
    k.forEach((x) => { if (PROJECT_KEYS.indexOf(x) < 0 && REVIEWED_KEYS.indexOf(x) < 0 && OPTIONAL_KEYS.indexOf(x) < 0) err(at + 'unexpected field ' + x); if (FORBIDDEN.test(x)) err(at + 'unit-level field ' + x); });
    PROJECT_KEYS.forEach((x) => { if (!(x in p)) err(at + 'missing ' + x); });
    if (typeof p.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) err(at + 'slug must be lower-case words joined by hyphens');
    if (typeof p.name !== 'string' || !p.name.trim()) err(at + 'name must be a non-empty string');
    if (STATUS.indexOf(p.status) < 0) err(at + 'status must be ok or zero_returned');
    if (typeof p.checkedAt !== 'string' || !ISO.test(p.checkedAt)) err(at + 'checkedAt must be an ISO UTC time');
    else if (isFinite(fileAt) && Date.parse(p.checkedAt) > fileAt) err(at + 'checkedAt is later than the file\'s');
    // reviewed details: all four together (a project URA does not list), or none (URA supplies them); street only alongside them
    const rv = REVIEWED_KEYS.filter((x) => x in p);
    if (rv.length && rv.length !== REVIEWED_KEYS.length) err(at + 'reviewed details must be complete: ' + REVIEWED_KEYS.join(', '));
    if ('street' in p && !rv.length) err(at + 'street appears only with reviewed details');
    if (rv.length === REVIEWED_KEYS.length) {
      if (!/^(0[1-9]|1\d|2[0-8])$/.test(String(p.district))) err(at + 'district must be 01 to 28');
      if (['CCR', 'RCR', 'OCR'].indexOf(p.region) < 0) err(at + 'region must be CCR, RCR or OCR');
      if (typeof p.tenureGroup !== 'number') err(at + 'tenureGroup must be a number');
      if (typeof p.tenure !== 'string' || !p.tenure) err(at + 'tenure must be a non-empty string');
      if ('street' in p && (typeof p.street !== 'string' || !p.street)) err(at + 'street must be a non-empty string');
    }
    if (!Array.isArray(p.byBedrooms)) { err(at + 'byBedrooms must be a list'); return; }
    if (p.status === 'zero_returned' && p.byBedrooms.length) err(at + 'zero_returned must have no bedroom types');
    if (p.status === 'ok' && !p.byBedrooms.length) err(at + 'ok must have at least one bedroom type');
    const seen = {};
    p.byBedrooms.forEach((b, j) => {
      const bt = at + 'type ' + j + ': ';
      if (!b || typeof b !== 'object') { err(bt + 'not an object'); return; }
      const bk = Object.keys(b).sort(); if (bk.join() !== TYPE_KEYS.join()) err(bt + 'fields must be exactly ' + TYPE_KEYS.join(', '));
      if (!Number.isInteger(b.bedrooms) || b.bedrooms < 0 || b.bedrooms > 5) err(bt + 'bedrooms must be 0 (studio) to 5 (5 or more)');
      else { if (b.label !== LABEL(b.bedrooms)) err(bt + 'label must be "' + LABEL(b.bedrooms) + '"'); if (seen[b.bedrooms]) err(bt + 'bedroom type repeated'); seen[b.bedrooms] = 1; }
      if (!Number.isInteger(b.ceiling) || b.ceiling <= 0 || b.ceiling % 50000) err(bt + 'ceiling must be on the $50k grid');
      if (!Array.isArray(b.bands) || !b.bands.length) { err(bt + 'bands must be a non-empty list'); return; }
      let prev = -1;
      b.bands.forEach((x) => {
        if (!Array.isArray(x) || x.length !== 2 || !Number.isInteger(x[0]) || !Number.isInteger(x[1])) { err(bt + 'a band must be [size, price]'); return; }
        if (x[0] <= 0 || x[0] % 100) err(bt + 'band start must be on the 100 sq ft grid');
        if (x[0] <= prev) err(bt + 'bands must be in increasing size'); prev = x[0];
        if (x[1] <= 0 || x[1] % 50000) err(bt + 'band price must be on the $50k grid');
        if (Number.isInteger(b.ceiling) && x[1] > b.ceiling) err(bt + 'band price above the ceiling');
      });
    });
  });
  return e;
}
module.exports = { check };
if (require.main === module) {
  const fs = require('fs'), f = process.argv[2] || 'data/projects/inventory.json';
  let text; try { text = fs.readFileSync(f, 'utf8'); } catch (x) { console.log('inventory-contract: cannot read ' + f); process.exit(1); }
  const e = check(text);
  if (e.length) { e.slice(0, 50).forEach((m) => console.log('  FAIL ' + m)); console.log('inventory-contract: ' + f + ' FAILED (' + e.length + ' problem' + (e.length === 1 ? '' : 's') + ')'); process.exit(1); }
  console.log('inventory-contract: ' + f + ' passes (' + JSON.parse(text).projects.length + ' projects)');
}
