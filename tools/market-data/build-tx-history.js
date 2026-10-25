#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — individual private transaction history per development (PROPOSED public output; not wired into the site or refresh-all.js).

     node tools/market-data/build-tx-history.js --raw <private URA folder> --snapshot <accepted bedroom snapshot.json> --site .
          --out <folder for the proposed public files> --report <private folder> [--to YYYY-MM]

   One row per URA caveat, as URA gives it: no unit numbers, no exact floors, no exact dates (URA gives month only), never inferred.
   Admission is the register's (register.js admit + name screen + one class per development), so rows are the same records Research counts.
   Row: [ym, sale, floor, sqm, price, beds, basis, flags]
     ym     contract month YYYYMM (new sale: sale date; resale / sub-sale: option exercised)
     sale   1 new sale, 2 sub-sale, 3 resale
     floor  index into the manifest's floorBands (URA bands only), null when URA gives none
     sqm    URA area in whole square metres (sq ft = sqm x 10.7639, approximate; say so)
     price  URA transacted price, S$ (for a discounted new sale this is the price before the discount; flag 1)
     beds   bedroom count for THIS SIZE from the accepted classification snapshot, else null (unknown is shown as unknown)
     basis  'v' developer floor plans (checked against URA), 'i' declared in URA rental contracts for the same size, null unknown
     flags  1 URA also gives a nett price (new sale with discount)   2 PSF unusual for this development and sale type (under 0.6x or over 1.6x
            its median): shown, not removed   4 another record has the same month, sale type, size, floor band and price (URA gives no unit
            number, so two identical sales cannot be told from a repeated record)   8 size atypical for the bedroom type in this development
            (under 2/3 or over 1.5x the type's median size): the label is kept, as in the approved aggregates, and flagged so the page
            can say "unusual size for a <n>-bedroom" 
   A row's bedroom is the per-size decision; passing the aggregate bedroom-completeness gate is NOT required for it and does NOT make it
   verified. Rows newest first.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const G = require('./register.js'), BB = require('./build-bedroom.js'), E = require('./bedroom-engine.js');
const P = require('../../assets/js/kpt-project.js');

const FIELDS = ['ym', 'sale', 'floor', 'sqm', 'price', 'beds', 'basis', 'flags'];
const FLAG = { NETT: 1, PSF: 2, REPEAT: 4, ATYPICAL: 8 };
const LIMITS = { psfLow: 0.6, psfHigh: 1.6, psfMinRows: 5, sizeLow: 2 / 3, sizeHigh: 1.5 };
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// rows of one development: [{ym, sale, floorRange, sqm, areaRaw, price, nett}] ; decide(areaRaw) -> 'v:3' | 'i:3' | null
function buildRows(rows, decide, floorBands) {
  const psfMed = {}; [1, 2, 3].forEach((s) => { const a = rows.filter((t) => t.sale === s).map((t) => t.price / (t.sqm * E.SQFT_PER_SQM)); psfMed[s] = a.length >= LIMITS.psfMinRows ? med(a) : null; });
  const key = (t) => [t.ym, t.sale, t.areaRaw, t.floorRange, t.price].join('|'), seen = new Map();
  rows.forEach((t) => seen.set(key(t), (seen.get(key(t)) || 0) + 1));
  // bedroom per size, and each type's median size (over all of this development's labelled rows)
  const lab = (t) => { const v = decide(String(t.areaRaw)); return v ? { basis: v[0], beds: Number(v.split(':')[1]) } : null; };
  const sizes = {}; rows.forEach((t) => { const l = lab(t); if (l && Number.isInteger(l.beds)) (sizes[l.beds] = sizes[l.beds] || []).push(t.sqm); });
  const typeMed = {}; Object.keys(sizes).forEach((b) => { typeMed[b] = med(sizes[b]); });
  return rows.slice().sort((a, b) => b.ym - a.ym || a.sale - b.sale || b.price - a.price).map((t) => {
    let flags = 0, beds = null, basis = null;
    if (t.nett) flags |= FLAG.NETT;
    const pm = psfMed[t.sale], psf = t.price / (t.sqm * E.SQFT_PER_SQM);
    if (pm && (psf < pm * LIMITS.psfLow || psf > pm * LIMITS.psfHigh)) flags |= FLAG.PSF;
    if (seen.get(key(t)) > 1) flags |= FLAG.REPEAT;
    const l = lab(t);
    if (l && Number.isInteger(l.beds)) {
      const m = typeMed[l.beds];
      if (m && (t.sqm < m * LIMITS.sizeLow || t.sqm > m * LIMITS.sizeHigh)) flags |= FLAG.ATYPICAL;
      beds = l.beds; basis = l.basis;   // the same label the approved bedroom aggregates use, so row counts and type figures agree
    }
    const fi = t.floorRange && t.floorRange !== '-' ? floorBands.indexOf(t.floorRange) : -1;
    return [Math.floor(t.ym / 12) * 100 + (t.ym % 12) + 1, t.sale, fi > -1 ? fi : null, t.sqm, t.price, beds, basis, flags];
  });
}

function run(o) {
  const man = JSON.parse(fs.readFileSync(path.join(o.site, 'data/projects/manifest.json'), 'utf8'));
  const snap = JSON.parse(fs.readFileSync(o.snapshot, 'utf8'));
  if (snap.comparison || (snap.rentalWindow && snap.rentalWindow.quarters !== 12)) throw new Error('the snapshot is not a standard 12-quarter classification run');
  const raw = BB.readRaw(o.raw), cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), pc = JSON.parse(fs.readFileSync(path.join(__dirname, 'project-config.json'), 'utf8'));
  const tmap = G.checkConfig(cfg), screen = G.nameScreen(pc), by = new Map(), cap = o.to ? Number(o.to.slice(0, 4)) * 12 + Number(o.to.slice(5, 7)) - 1 : Infinity;
  let latest = 0;
  raw.tx.forEach((t) => {
    const a = G.admit(t, t.marketSegment, tmap); if (!a.ok || !t.project || screen(t.project) || a.ym > cap) return;
    latest = Math.max(latest, a.ym);
    (by.get(t.project) || by.set(t.project, []).get(t.project)).push({ cls: a.cls, sale: a.sale, price: a.price, sqm: a.sqm, areaRaw: t.area, ym: a.ym, floorRange: t.floorRange, nett: t.nettPrice ? Number(t.nettPrice) : null });
  });
  const ym = Math.floor(latest / 12) + '-' + String(latest % 12 + 1).padStart(2, '0');
  if (ym !== man.latestMonth) throw new Error('URA data month ' + ym + ' differs from the site Research data (' + man.latestMonth + '); build both from the same URA fetch');
  if (snap.latestMonth && snap.latestMonth !== man.latestMonth) throw new Error('the bedroom snapshot is for ' + snap.latestMonth + ', the site for ' + man.latestMonth);
  const shards = {}, stats = { developments: 0, rows: 0, bySale: { 1: 0, 2: 0, 3: 0 }, labelled: { v: 0, i: 0 }, labelledBySale: { 1: 0, 2: 0, 3: 0 }, flags: { nett: 0, psf: 0, repeat: 0, atypical: 0 }, noFloor: 0 };
  by.forEach((list, name) => {
    const s = G.split(list), entry = snap.developments[name], map = (entry && entry.map) || {};
    const rows = buildRows(s.rows, (a) => map[a] || null, man.floorBands);
    const id = P.slugify(name), k = P.shardName(P.shardOf(id, man.shards));
    (shards[k] = shards[k] || { v: 1, kind: 'gw-tx-history', shard: k, projects: {} }).projects[id] = { name, cls: s.cls, rows };
    stats.developments++;
    rows.forEach((r) => { stats.rows++; stats.bySale[r[1]]++; if (r[6]) { stats.labelled[r[6]]++; stats.labelledBySale[r[1]]++; } if (r[2] == null) stats.noFloor++; if (r[7] & 1) stats.flags.nett++; if (r[7] & 2) stats.flags.psf++; if (r[7] & 4) stats.flags.repeat++; if (r[7] & 8) stats.flags.atypical++; });
  });
  const manifest = { v: 1, kind: 'gw-tx-history', latestMonth: man.latestMonth, monthStart: man.monthStart, shards: man.shards, fields: FIELDS, floorBands: man.floorBands,
    sale: { 1: 'New sale', 2: 'Sub-sale', 3: 'Resale' }, basis: { v: 'developer floor plans (checked against URA)', i: 'URA rental records for the same size (inferred)' },
    flags: { 1: 'URA also records a nett price (new sale with discount); the price shown is before the discount', 2: 'PSF unusual for this development and sale type', 4: 'another record has the same month, size, floor band and price (could be two units)', 8: 'size unusual for its bedroom type' },
    bedroomsFrom: { classifiedAsOf: snap.asOf || null, rentalWindow: snap.rentalWindow || null },
    notes: ['Months only: URA gives the contract month, not the day.', 'Floor is a URA floor band; exact floors and unit numbers are not available and are never inferred.', 'Area is URA whole square metres; sq ft is converted and approximate.', 'Bedroom type is inferred by Groundwork, never recorded by URA; unknown where the size could be more than one type.'],
    attribution: man.attribution, counts: { developments: stats.developments, rows: stats.rows } };
  if (o.out) { fs.mkdirSync(o.out, { recursive: true }); fs.writeFileSync(path.join(o.out, 'manifest.json'), JSON.stringify(manifest)); Object.keys(shards).forEach((k) => fs.writeFileSync(path.join(o.out, k + '.json'), JSON.stringify(shards[k]))); }
  if (o.report) { fs.mkdirSync(o.report, { recursive: true }); fs.writeFileSync(path.join(o.report, 'tx-history-report.json'), JSON.stringify(stats, null, 1)); }
  return { manifest, shards, stats };
}

module.exports = { run, buildRows, FIELDS, FLAG, LIMITS };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  if (!arg('raw') || !arg('snapshot') || !arg('site')) { console.error('Usage: node tools/market-data/build-tx-history.js --raw <URA folder> --snapshot <snapshot.json> --site . --out <folder> --report <private folder> [--to YYYY-MM]'); process.exit(2); }
  let r; try { r = run({ raw: arg('raw'), snapshot: arg('snapshot'), site: path.resolve(arg('site')), out: arg('out'), report: arg('report'), to: arg('to') }); } catch (e) { console.error('Stopped: ' + e.message); process.exit(2); }
  const S = r.stats, p = (a, b) => (Math.round((a / b) * 1000) / 10) + '%';
  console.log(S.developments + ' developments, ' + S.rows + ' rows (new ' + S.bySale[1] + ', sub ' + S.bySale[2] + ', resale ' + S.bySale[3] + '). Bedroom shown on ' + (S.labelled.v + S.labelled.i) + ' (' + p(S.labelled.v + S.labelled.i, S.rows) + '; floor plans ' + S.labelled.v + ', rental records ' + S.labelled.i + '); resales ' + p(S.labelledBySale[3], S.bySale[3]) + '. Flags: nett ' + S.flags.nett + ', unusual PSF ' + S.flags.psf + ', identical record ' + S.flags.repeat + ', size atypical for type ' + S.flags.atypical + '; no floor band ' + S.noFloor + '.');
}
