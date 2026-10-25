#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — HDB flat rents (owner-declared, HDB-approved), published as data/value/hdb/rent/

     node tools/market-data/fetch-hdb-rent.js is NOT needed: the CSV comes from data.gov.sg's own download API (see fetchCsv below)
     node tools/market-data/build-hdb-rent.js --csv <private rent.csv> --meta <private metadata.json> --site . --out <folder> --report <private folder>
          [--months 24] [--rows (private only)]

   Source: HDB "Renting Out of Flats from Jan 2021" (data.gov.sg d_c9f57187485a850908655db0e8cfe651, Singapore Open Data Licence v1.0):
   rent_approval_date (month HDB approved the rental; not the lease start or signing date), town, block, street_name, flat_type, monthly_rent.
   HDB: "Rental data are indicative only (owner-declared). HDB does not verify the accuracy of the data." No unit numbers, floors or lease
   dates, and none are inferred. Flat types are written as the resale files write them ("4 ROOM").
   Output mirrors data/value/hdb/t/<town>.json so gw-value.js can read rents the way it reads resales:
     <out>/index.json        towns, types, window, source, attribution, and per town x type monthly medians for the whole history (trend)
     <out>/t/<town>.json     AGGREGATES (aggregate(): block / street / town x flat type, latest 12 months, figures only with 5+); with --rows,
                             a PRIVATE build, the rows of the window instead: [ym, block, street index, type index, rent]
   Blocks are matched to the resale files and the Map's block positions on the EXACT (town, block, street) key; a rental block with no
   resale in the window is kept (rents still count) but is never given a position or merged with another block.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const P = require('../../assets/js/kpt-project.js');

const DATASET = 'd_c9f57187485a850908655db0e8cfe651';
// the rental file names one town differently from the resale file
const TOWN_ALIAS = { CENTRAL: 'CENTRAL AREA' };
const typeName = (s) => String(s || '').trim().toUpperCase().replace(/-/g, ' ').replace(/\s+/g, ' ');
const ymInt = (s) => { const m = /^(\d{4})-(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 100 + Number(m[2]) : null; };
const toIdx = (v) => Math.floor(v / 100) * 12 + (v % 100) - 1;
const med = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function parseCsv(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim()), head = lines[0].split(','), ix = (k) => head.indexOf(k), bad = [];
  const rows = lines.slice(1).map((l, i) => {
    const c = l.split(','), r = { ym: ymInt(c[ix('rent_approval_date')]), town: TOWN_ALIAS[(c[ix('town')] || '').trim().toUpperCase()] || (c[ix('town')] || '').trim().toUpperCase(), block: (c[ix('block')] || '').trim().toUpperCase(), street: (c[ix('street_name')] || '').trim().toUpperCase(), type: typeName(c[ix('flat_type')]), rent: Number(c[ix('monthly_rent')]) };
    if (!r.ym || !r.town || !r.block || !r.street || !r.type || !(r.rent > 0) || c.length !== head.length) { bad.push(i + 2); return null; }
    return r;
  }).filter(Boolean);
  return { rows, bad };
}
// rows -> public files; resale: {index, towns: {id: townFile}}; positions: onemap-hdb.json rows[townId][street][block]
function build(rows, meta, resale, positions, o) {
  o = Object.assign({ months: 24 }, o || {});
  const latest = rows.reduce((m, r) => Math.max(m, r.ym), 0), from = toIdx(latest) - o.months + 1;
  const types = resale.index.types.slice(); rows.forEach((r) => { if (types.indexOf(r.type) < 0) types.push(r.type); });
  const towns = {}, trend = {}, match = { rows: 0, blockInResale: 0, blockPositioned: 0, rentalOnlyBlocks: new Set(), blocks: new Set(), unknownTown: new Set() };
  rows.forEach((r) => {
    const id = P.slugify(r.town);
    // trend: whole history, town x type x month
    const tk = id + '|' + r.type; (trend[tk] = trend[tk] || {}); (trend[tk][r.ym] = trend[tk][r.ym] || []).push(r.rent);
    if (toIdx(r.ym) < from) return;
    const T = towns[id] || (towns[id] = { v: 1, kind: 'gw-hdb-rent', town: r.town, latestMonth: latest, windowFrom: Math.floor(from / 12) * 100 + (from % 12) + 1, row: ['ym', 'block', 'street', 'type', 'rent'], streets: [], rows: [] });
    let si = T.streets.indexOf(r.street); if (si < 0) { si = T.streets.length; T.streets.push(r.street); }
    T.rows.push([r.ym, r.block, si, types.indexOf(r.type), r.rent]);
    match.rows++;
    const rf = resale.towns[id], key = id + '|' + r.block + '|' + r.street; match.blocks.add(key);
    if (!rf) { match.unknownTown.add(r.town); return; }
    const inResale = rf._keys ? rf._keys : (rf._keys = new Set(rf.rows.map((x) => x[1] + '|' + rf.streets[x[2]])));
    if (inResale.has(r.block + '|' + r.street)) match.blockInResale++; else match.rentalOnlyBlocks.add(key);
    if (positions && positions.rows[id] && positions.rows[id][r.street] && positions.rows[id][r.street][r.block]) match.blockPositioned++;
  });
  Object.values(towns).forEach((T) => T.rows.sort((a, b) => b[0] - a[0] || a[2] - b[2] || String(a[1]).localeCompare(String(b[1]), 'en', { numeric: true }) || a[3] - b[3] || a[4] - b[4]));
  const trendOut = {}; Object.keys(trend).forEach((k) => { trendOut[k] = Object.keys(trend[k]).sort().filter((m) => trend[k][m].length >= AGG_MIN).map((m) => [Number(m), trend[k][m].length, Math.round(med(trend[k][m]))]); });   // a month with fewer than 5 rentals is left out (a gap), never a median of 1–4
  const index = { v: 1, kind: 'gw-hdb-rent', latestMonth: latest, windowFrom: Math.floor(from / 12) * 100 + (from % 12) + 1, historyFrom: rows.reduce((m, r) => Math.min(m, r.ym), Infinity), types,
    towns: Object.keys(towns).sort().map((id) => ({ id, name: towns[id].town, rents: towns[id].rows.length })), trendFields: ['ym', 'n', 'median'], trend: trendOut,
    source: { publisher: 'Housing & Development Board (HDB)', datasetId: DATASET, datasetName: (meta && meta.data && meta.data.name) || 'Renting Out of Flats from Jan 2021', lastUpdatedAt: meta && meta.data && meta.data.lastUpdatedAt, url: 'https://data.gov.sg/datasets/' + DATASET + '/view', licence: { name: 'Singapore Open Data Licence version 1.0', url: 'https://data.gov.sg/open-data-licence' } },
    notes: ['Month = the month HDB approved the rental, not when the lease started or was signed.', 'Flat rentals approved by HDB; the rents are declared by owners and HDB does not verify them.', 'No unit numbers, floors or lease dates are available.'],
    attribution: 'Contains information from "Renting Out of Flats from Jan 2021" accessed on ' + (o.accessed || '') + ' from data.gov.sg, which is made available under the terms of the Singapore Open Data Licence version 1.0.' };
  const report = { rowsInWindow: match.rows, blocksInWindow: match.blocks.size, rowsWhoseBlockHasResales: match.blockInResale, rowsWithMapPosition: match.blockPositioned, rentalOnlyBlocks: match.rentalOnlyBlocks.size, unknownTowns: Array.from(match.unknownTown) };
  return { index, towns, report };
}
// Aggregates for the site (Ken, 25 Oct 2026: no individual rental is published in V1). Per town: every block x flat type, street x flat type
// and town x flat type of the latest 12 approval months, as a count, and as [min, q1, median, q3, max] only with 5+ rentals (fewer: the count
// alone, so no single rental can be read off the file). The town also carries the 12 months before (count and median, with 10+), for a movement.
// Blocks stay keyed by street + block number together; two blocks with the same number on different streets are never merged.
const quant = (s, p) => { const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const fiveOf = (a) => { const s = a.slice().sort((x, y) => x - y); return [s[0], quant(s, 0.25), quant(s, 0.5), quant(s, 0.75), s[s.length - 1]].map(Math.round); };
const AGG_MIN = 5, MOVE_MIN = 10;
function aggregate(T, latest) {
  const li = toIdx(latest), from = li - 11, prev = li - 23, toInt = (i) => Math.floor(i / 12) * 100 + (i % 12) + 1;
  const blk = new Map(), st = new Map(), tw = new Map(), twPrev = new Map(), put = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);
  T.rows.forEach((r) => { const i = toIdx(r[0]); if (i >= from && i <= li) { put(blk, r[2] + '|' + r[1] + '|' + r[3], r[4]); put(st, r[2] + '|' + r[3], r[4]); put(tw, r[3], r[4]); } else if (i >= prev && i < from) put(twPrev, r[3], r[4]); });
  const stat = (a) => (a.length >= AGG_MIN ? [a.length].concat(fiveOf(a)) : [a.length]);
  return { v: 1, kind: 'gw-hdb-rent', town: T.town, latestMonth: latest, from: toInt(from), prevFrom: toInt(prev), aggregates: true,
    fields: { block: ['street', 'block', 'type', 'n', 'min', 'q1', 'median', 'q3', 'max'], street: ['street', 'type', 'n', 'min', 'q1', 'median', 'q3', 'max'], town: ['type', 'n', 'min', 'q1', 'median', 'q3', 'max', 'prevN', 'prevMedian'], note: 'Figures only with 5+ rentals; fewer: the count alone.' },
    streets: T.streets,
    block: Array.from(blk.entries()).map(([k, a]) => { const x = k.split('|'); return [Number(x[0]), x[1], Number(x[2])].concat(stat(a)); }).sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1]), 'en', { numeric: true }) || a[2] - b[2]),
    street: Array.from(st.entries()).map(([k, a]) => { const x = k.split('|'); return [Number(x[0]), Number(x[1])].concat(stat(a)); }).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    town: Array.from(tw.entries()).map(([ti, a]) => { const pv = twPrev.get(ti) || [], s = stat(a); while (s.length < 6) s.push(null); return [Number(ti)].concat(s, [pv.length, pv.length >= MOVE_MIN ? fiveOf(pv)[2] : null]); }).sort((a, b) => a[0] - b[0]) };
}
// data.gov.sg's own download API (the same one build-upcoming.js uses); no key needed
async function fetchCsv(fetchFn) {
  const dl = await (await fetchFn('https://api-open.data.gov.sg/v1/public/api/datasets/' + DATASET + '/poll-download')).json();
  if (!dl.data || !dl.data.url) throw new Error('data.gov.sg gave no download link');
  const csv = await (await fetchFn(dl.data.url)).text();
  const meta = await (await fetchFn('https://api-production.data.gov.sg/v2/public/api/datasets/' + DATASET + '/metadata')).json();
  return { csv, meta };
}

module.exports = { parseCsv, build, aggregate, fetchCsv, typeName, DATASET, AGG_MIN };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const site = path.resolve(arg('site', '.'));
  (async () => {
    let csv, meta;
    if (arg('csv')) { csv = fs.readFileSync(arg('csv'), 'utf8'); meta = arg('meta') ? JSON.parse(fs.readFileSync(arg('meta'), 'utf8')) : null; }
    else { const r = await fetchCsv(globalThis.fetch); csv = r.csv; meta = r.meta; if (arg('save')) { fs.mkdirSync(arg('save'), { recursive: true }); fs.writeFileSync(path.join(arg('save'), 'rent.csv'), csv); fs.writeFileSync(path.join(arg('save'), 'metadata.json'), JSON.stringify(meta)); } }
    const p = parseCsv(csv), idx = JSON.parse(fs.readFileSync(path.join(site, 'data/value/hdb/index.json'), 'utf8')), towns = {};
    idx.towns.forEach((t) => { towns[t.id] = JSON.parse(fs.readFileSync(path.join(site, 'data/value/hdb/t', t.id + '.json'), 'utf8')); });
    const pos = JSON.parse(fs.readFileSync(path.join(site, 'tools/market-data/sources/onemap-hdb.json'), 'utf8'));
    const r = build(p.rows, meta, { index: idx, towns }, pos, { months: Number(arg('months', 24)), accessed: arg('accessed', new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)) });   // the Singapore date
    // the site gets aggregates; --rows (a PRIVATE build only) writes the individual rentals instead
    const rowsOut = process.argv.indexOf('--rows') > -1;
    if (!rowsOut) { r.index.aggregates = true; r.index.notes = r.index.notes.concat(['Aggregates only: no individual rental is published. Figures need 5+ rentals.']); }
    if (arg('out')) { fs.mkdirSync(path.join(arg('out'), 't'), { recursive: true }); fs.writeFileSync(path.join(arg('out'), 'index.json'), JSON.stringify(r.index)); Object.keys(r.towns).forEach((id) => fs.writeFileSync(path.join(arg('out'), 't', id + '.json'), JSON.stringify(rowsOut ? r.towns[id] : aggregate(r.towns[id], r.index.latestMonth)))); }
    if (arg('report')) { fs.mkdirSync(arg('report'), { recursive: true }); fs.writeFileSync(path.join(arg('report'), 'hdb-rent-report.json'), JSON.stringify(Object.assign({ parsed: p.rows.length, badLines: p.bad.length }, r.report), null, 1)); }
    console.log('Parsed ' + p.rows.length + ' rents (' + p.bad.length + ' bad lines). ' + JSON.stringify(r.report));
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
