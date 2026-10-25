#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — private-home rents from URA rental contracts (PROPOSED public output; not wired into the site or refresh-all.js).

     node tools/market-data/build-rent-research.js --raw <private URA folder> --snapshot <accepted bedroom snapshot.json> --site .
          --out <folder for proposed public files> --report <private folder> [--to YYYY-MM] [--yield] [--rows]   (--yield and --rows: PRIVATE builds only)

   Source: URA PMI_Resi_Rental — contracts submitted to IRAS for stamp duty: lease COMMENCEMENT month (mmyy), bedrooms as declared
   (absent for some contracts: kept as unknown), monthly rent, and the floor area as a 100 sq ft band and a 10 sqm band (never an exact
   size). No unit numbers, floors or addresses. These are completed contracts, never asking rents. The rental files read are the classification
   window (rental-window.js: the latest 12 quarters); rents use only the latest 12 lease months of it, the trend the 12 quarters.
   Per development (register names only):
     types   per declared bedroom count, latest 12 months: n, active months, latest month, rent [min, q1, median, q3, max], the sq ft bands
             seen; evidence 'typical' (5+ contracts over 3+ months, the site's typical-price rule), 'limited' (5+ in fewer months), else counts only.
             No rent amount is ever written for fewer than 5 contracts (25 Oct 2026): a count alone, for types and for sizes.
     bands   per bedroom count and 100 sq ft band, latest 12 months, with 10+ contracts: [q1, median, q3] and n — what an asking-rent
             check compares with (same bedrooms, same size band); a check is never offered against fewer than 10
     trend   per bedroom count: quarterly [quarter, n, median] for quarters with 5+ contracts (development-level series are thin; most
             quarters will be missing and that is shown, not filled)
     rows    latest 12 months: [lease month YYYYMM, bedrooms|null, sqft band low, sqft band high, rent]. PRIVATE ONLY (--rows): Ken, 25 Oct
             2026: no individual rental contracts are published in V1; the site gets aggregates only.
     sizes   (Claude B, 25 Oct 2026) per 100 sq ft band, ALL contracts of that band whatever their bedrooms (the same size, so comparable),
             latest 12 months: n, active months, evidence (the same typical / limited rule) and rent [min, q1, median, q3, max]: what the page
             offers where a bedroom count has too few contracts. Never another bedroom count standing in.
     moves   (Claude B, 25 Oct 2026) per bedroom count, its most-rented 100 sq ft band: the median of the latest 12 lease months against the 12
             months before, for the SAME bedrooms and the SAME band only, with 10+ contracts on each side (the Market Pulse idea: one size, so a
             change in which sizes were let doesn't move it). Fewer: no movement is given.
     yield   (--yield only; NOT for publication until Ken approves: the Research policy line says "no appreciation, yield or forecast")
             GROSS yield only = 12 x median rent / median resale price, for the SAME development, SAME bedroom count and SAME 100 sq ft
             band: rents of the latest 12 months (5+), resales whose bedroom label (accepted snapshot) matches and whose size is strictly
             inside the band (5+ in 12 months, else 24 months, said). Not net: no costs, vacancy, tax, fees or financing.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const BB = require('./build-bedroom.js'), G = require('./register.js'), E = require('./bedroom-engine.js'), TX = require('./build-tx-history.js');
const P = require('../../assets/js/kpt-project.js');

const RULES = { typical: { n: 5, months: 3 }, limited: { n: 5, months: 1 }, minPublish: 5, bandMin: 10, trendMin: 5, months: 12, yieldMin: 5, moveMin: 10 };
const q = (s, p) => { const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const five = (a) => { const s = a.slice().sort((x, y) => x - y); return [s[0], q(s, 0.25), q(s, 0.5), q(s, 0.75), s[s.length - 1]].map((v) => Math.round(v)); };
const band = (s) => { const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(String(s || '')); return m ? [Number(m[1]), Number(m[2])] : null; };
const ymOf = (s) => { const m = /^(\d{2})(\d{2})$/.exec(String(s || '')); return m ? (2000 + Number(m[2])) * 12 + Number(m[1]) - 1 : null; };
const toInt = (ym) => Math.floor(ym / 12) * 100 + (ym % 12) + 1;
const qOf = (ym) => String(Math.floor(ym / 12) % 100).padStart(2, '0') + 'q' + (Math.floor((ym % 12) / 3) + 1);

// one rental record -> {ym, beds|null, lo, hi (sq ft band), rent} or null when unusable
function contract(r) {
  const ym = ymOf(r.leaseDate), b = band(r.areaSqft), rent = Number(r.rent), beds = /^\d+$/.test(String(r.noOfBedRoom)) ? Number(r.noOfBedRoom) : null;
  if (ym == null || !b || !(rent > 0)) return null;
  return { ym, beds: beds != null && beds >= 1 && beds <= 10 ? beds : null, lo: b[0], hi: b[1], rent };
}
function evidence(n, act) { return n >= RULES.typical.n && act >= RULES.typical.months ? 'typical' : n >= RULES.minPublish && act >= RULES.limited.months ? 'limited' : 'counts'; }   // under 5: counts only, never an amount

// cs: contracts of one development (window already applied); latest: last lease month; sales: [{ym, sale, sqm, price, beds}] (beds from the snapshot)
function development(cs, latest, sales, opt) {
  opt = opt || {};
  const from = latest - RULES.months + 1, recent = cs.filter((c) => c.ym >= from && c.ym <= latest);
  const out = { window: { from: toInt(from), to: toInt(latest) }, n: recent.length, unknownBeds: recent.filter((c) => c.beds == null).length, types: [], bands: [], trend: {}, rows: [] };
  const byBeds = new Map(); recent.forEach((c) => { if (c.beds != null) (byBeds.get(c.beds) || byBeds.set(c.beds, []).get(c.beds)).push(c); });
  Array.from(byBeds.keys()).sort((a, b) => a - b).forEach((b) => {
    const l = byBeds.get(b), act = new Set(l.map((c) => c.ym)).size, ev = evidence(l.length, act);
    const bands = {}; l.forEach((c) => { const k = c.lo + '-' + c.hi; bands[k] = (bands[k] || 0) + 1; });
    out.types.push(Object.assign({ beds: b, n: l.length, act, last: toInt(Math.max.apply(null, l.map((c) => c.ym))), evidence: ev, sqftBands: bands }, ev !== 'counts' ? { rent: five(l.map((c) => c.rent)) } : {}));
    Object.keys(bands).forEach((k) => {
      const bl = l.filter((c) => c.lo + '-' + c.hi === k); if (bl.length < RULES.bandMin) return;
      const f = five(bl.map((c) => c.rent)); out.bands.push({ beds: b, sqft: k.split('-').map(Number), n: bl.length, rent: [f[1], f[2], f[3]], range: [f[0], f[4]] });
    });
  });
  const allBeds = new Set(cs.filter((c) => c.beds != null).map((c) => c.beds));
  allBeds.forEach((b) => {
    const byQ = new Map(); cs.filter((c) => c.beds === b).forEach((c) => (byQ.get(qOf(c.ym)) || byQ.set(qOf(c.ym), []).get(qOf(c.ym))).push(c.rent));
    const series = Array.from(byQ.entries()).filter(([, a]) => a.length >= RULES.trendMin).sort().map(([k, a]) => [k, a.length, five(a)[2]]);
    if (series.length) out.trend[b] = series;
  });
  out.rows = recent.slice().sort((a, b) => b.ym - a.ym || a.rent - b.rent).map((c) => [toInt(c.ym), c.beds, c.lo, c.hi, c.rent]);
  const bySize = new Map(); recent.forEach((c) => { const k = c.lo + '-' + c.hi; (bySize.get(k) || bySize.set(k, []).get(k)).push(c); });
  out.sizes = Array.from(bySize.keys()).sort((a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0])).map((k) => {
    const l = bySize.get(k), act = new Set(l.map((c) => c.ym)).size, ev = evidence(l.length, act);
    return Object.assign({ sqft: k.split('-').map(Number), n: l.length, act, evidence: ev }, ev !== 'counts' ? { rent: five(l.map((c) => c.rent)) } : {});
  });
  out.moves = [];
  byBeds.forEach((l, b) => {
    const cnt = {}; l.forEach((c) => { const k = c.lo + '-' + c.hi; cnt[k] = (cnt[k] || 0) + 1; });
    const k = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x] || Number(x.split('-')[0]) - Number(y.split('-')[0]))[0], lo = Number(k.split('-')[0]), hi = Number(k.split('-')[1]);
    const now = l.filter((c) => c.lo === lo && c.hi === hi).map((c) => c.rent);
    const prev = cs.filter((c) => c.beds === b && c.lo === lo && c.hi === hi && c.ym >= from - 12 && c.ym < from).map((c) => c.rent);
    if (now.length < RULES.moveMin || prev.length < RULES.moveMin) return;
    const a = five(prev)[2], z = five(now)[2];
    out.moves.push({ beds: b, sqft: [lo, hi], prevN: prev.length, prev: a, n: now.length, now: z, pct: Math.round((z / a - 1) * 1000) / 10 });
  });
  out.moves.sort((x, y) => x.beds - y.beds);
  if (opt.yield) out.yield = grossYield(recent, sales || [], latest);
  return out;
}
// same development, same bedroom count, same 100 sq ft band; resale sizes strictly inside the band
function grossYield(recent, sales, latest) {
  const res = [], groups = new Map();
  recent.forEach((c) => { if (c.beds == null) return; const k = c.beds + '|' + c.lo + '|' + c.hi; (groups.get(k) || groups.set(k, []).get(k)).push(c.rent); });
  groups.forEach((rents, k) => {
    if (rents.length < RULES.yieldMin) return;
    const [b, lo, hi] = k.split('|').map(Number);
    const fit = (w) => sales.filter((t) => t.sale === 3 && t.beds === b && t.ym > latest - w && t.ym <= latest && t.sqm * E.SQFT_PER_SQM > lo && t.sqm * E.SQFT_PER_SQM < hi);
    let w = 12, s = fit(12); if (s.length < RULES.yieldMin) { w = 24; s = fit(24); }
    if (s.length < RULES.yieldMin) return;
    const rent = five(rents)[2], price = five(s.map((t) => t.price))[2];
    res.push({ beds: b, sqft: [lo, hi], rentN: rents.length, rent, saleN: s.length, saleMonths: w, price, gross: Math.round((12 * rent / price) * 10000) / 100 });
  });
  return res.sort((a, b) => a.beds - b.beds || a.sqft[0] - b.sqft[0]);
}

function run(o) {
  const man = JSON.parse(fs.readFileSync(path.join(o.site, 'data/projects/manifest.json'), 'utf8'));
  const raw = BB.readRaw(o.raw), win = raw.rentalWindow;
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), pc = JSON.parse(fs.readFileSync(path.join(__dirname, 'project-config.json'), 'utf8'));
  const tmap = G.checkConfig(cfg), screen = G.nameScreen(pc), reg = new Map();
  raw.tx.forEach((t) => { const a = G.admit(t, t.marketSegment, tmap); if (a.ok && t.project && !screen(t.project)) (reg.get(t.project) || reg.set(t.project, []).get(t.project)).push(a); });
  const snap = o.snapshot ? JSON.parse(fs.readFileSync(o.snapshot, 'utf8')) : { developments: {} };
  const cap = o.to ? Number(o.to.slice(0, 4)) * 12 + Number(o.to.slice(5, 7)) - 1 : Infinity;
  let latest = 0; const cons = new Map(), dropped = { badRecord: 0, notRegistered: 0, afterCap: 0 }, unregistered = new Set();
  raw.rent.forEach((list, name) => list.forEach((r) => {
    const c = contract(r); if (!c) { dropped.badRecord++; return; }
    if (c.ym > cap) { dropped.afterCap++; return; }
    if (!reg.has(name)) { dropped.notRegistered++; unregistered.add(name); return; }
    latest = Math.max(latest, c.ym); (cons.get(name) || cons.set(name, []).get(name)).push(c);
  }));
  const shards = {}, stats = { developments: 0, contracts: 0, recent: 0, unknownBeds: 0, typicalTypes: 0, limitedTypes: 0, countOnlyTypes: 0, devsWithTypical: 0, bandsForCheck: 0, devsWithBand: 0, yields: 0, devsWithYield: 0, unregisteredNames: unregistered.size, dropped };
  cons.forEach((cs, name) => {
    const s = G.split(reg.get(name).map((a) => Object.assign({}, a))), map = (snap.developments[name] || {}).map || {};
    const sales = o.yield ? s.rows.map((a) => ({ ym: a.ym, sale: a.sale, sqm: a.sqm, price: a.price, beds: map[String(a.sqm)] ? Number(map[String(a.sqm)].split(':')[1]) : null })) : [];
    const d = development(cs, latest, sales, { yield: o.yield });
    if (!d.n) return;
    if (!o.rows) delete d.rows;   // aggregates only on the site (Ken, 25 Oct 2026)
    const id = P.slugify(name), k = P.shardName(P.shardOf(id, man.shards));
    (shards[k] = shards[k] || { v: 1, kind: 'gw-rent', shard: k, projects: {} }).projects[id] = Object.assign({ name, cls: s.cls }, d);
    stats.developments++; stats.contracts += cs.length; stats.recent += d.n; stats.unknownBeds += d.unknownBeds;
    d.types.forEach((t) => { stats[t.evidence === 'typical' ? 'typicalTypes' : t.evidence === 'limited' ? 'limitedTypes' : 'countOnlyTypes']++; });
    if (d.types.some((t) => t.evidence === 'typical')) stats.devsWithTypical++;
    stats.bandsForCheck += d.bands.length; if (d.bands.length) stats.devsWithBand++;
    if (d.yield) { stats.yields += d.yield.length; if (d.yield.length) stats.devsWithYield++; }
  });
  const manifest = { v: 1, kind: 'gw-rent', latestLeaseMonth: toInt(latest), rentalWindow: { from: win.from, to: win.to, quarters: win.quarters.length }, months: RULES.months, shards: man.shards, rules: RULES,
    fields: Object.assign(o.rows ? { row: ['leaseMonth', 'beds', 'sqftLo', 'sqftHi', 'rent'] } : {}, { rent: ['min', 'q1', 'median', 'q3', 'max'], band: ['q1', 'median', 'q3'], bandRange: ['min', 'max'], trend: ['quarter', 'n', 'median'], move: ['beds', 'sqft', 'prevN', 'prev', 'n', 'now', 'pct'], size: ['sqft', 'n', 'act', 'evidence', 'rent'] }),
    contracts: o.rows ? 'listed (private build)' : 'aggregates only: no individual rental contract is published',
    basis: 'URA private residential rental contracts submitted to IRAS for stamp duty (completed contracts, not asking rents). Month = lease commencement. Bedrooms as declared in the contract; size is URA\'s 100 sq ft band, not an exact area.',
    attribution: 'Contains information from URA private residential rental contract data (PMI_Resi_Rental) from the URA Data Service, made available under the terms of the Singapore Open Data Licence version 1.0. Analysis by Groundwork. Not endorsed by URA.',
    yieldIncluded: !!o.yield, counts: { developments: stats.developments } };
  if (o.out) { fs.mkdirSync(o.out, { recursive: true }); fs.writeFileSync(path.join(o.out, 'manifest.json'), JSON.stringify(manifest)); Object.keys(shards).forEach((k) => fs.writeFileSync(path.join(o.out, k + '.json'), JSON.stringify(shards[k]))); }
  if (o.report) { fs.mkdirSync(o.report, { recursive: true }); fs.writeFileSync(path.join(o.report, 'rent-report.json'), JSON.stringify(stats, null, 1)); }
  return { manifest, shards, stats };
}

module.exports = { run, development, grossYield, contract, RULES };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  if (!arg('raw') || !arg('site')) { console.error('Usage: node tools/market-data/build-rent-research.js --raw <URA folder> --site . [--snapshot <file>] [--out <folder>] [--report <folder>] [--to YYYY-MM] [--yield]'); process.exit(2); }
  const r = run({ raw: arg('raw'), snapshot: arg('snapshot'), site: path.resolve(arg('site')), out: arg('out'), report: arg('report'), to: arg('to'), yield: process.argv.indexOf('--yield') > -1, rows: process.argv.indexOf('--rows') > -1 });
  console.log(JSON.stringify(r.stats));
}
