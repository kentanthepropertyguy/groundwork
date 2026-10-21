#!/usr/bin/env node
/* ==========================================================================
   Interactive Map data. Same raw URA files, same scope (the shared development register, register.js: condos, ECs and cluster housing, each
   development in one class) and the same cell rules as build-project-stats.js (Research); this
   build only adds what the map needs: a project position and size-band cells for TWO markets.
     Primary market   = New Sale (type 1)
     Secondary market = Sub Sale + Resale (types 2 and 3), with the Sub Sale count kept inside every secondary cell
   Raw transactions are never written out. The only record-level rows are the (up to six) most recent sales of a project that has no
   size band with enough sales for a typical price (month, size, price, psf; no unit, floor or buyer information).

   Usage: node tools/market-data/build-map-data.js --raw tools/market-data/raw --out data/map [--projects data/projects] [--as-of 2026-10-05] [--no-validate]

   Output (folder):
     places.json   one row per Research project: id, name, lat, lon (null when URA gave no position), district, segment, sales in the last 12 months
     ev.json       per project: tenure, history, and the cells of both markets (loaded after the first paint)

   Validation (exits non-zero on any mismatch, unless --no-validate): the map's cells are recomputed independently and compared with the
   LIVE Research cells in data/projects/detail. New-sale cells must equal the live sale-1 cells exactly; resale-only and sub-sale-only
   cells (computed here for the check only) must equal live sale-3 and sale-2 cells; every pooled secondary cell must hold exactly
   the live sub-sale count plus the live resale count.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { quantile } = require('./build-bands.js');
const P = require('../../assets/js/kpt-project.js');
const R = require('../../assets/js/kpt-research.js');
const G = require('./register.js');
const SQM_TO_SQFT = 10.7639, WINS = [12, 24, 36], MAX_RECENT = 6;

/* ---------- SVY21 (EPSG:3414) to WGS84: inverse transverse Mercator, Krueger series ---------- */
const SV = { a: 6378137, f: 1 / 298.257223563, lat0: 1 + 22 / 60, lon0: 103 + 50 / 60, k0: 1, FE: 28001.642, FN: 38744.572 };
const svy21 = (() => {
  const n = SV.f / (2 - SV.f), e = Math.sqrt(SV.f * (2 - SV.f)), A = SV.a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const al = [n / 2 - 2 * n ** 2 / 3 + 5 * n ** 3 / 16 + 41 * n ** 4 / 180, 13 * n ** 2 / 48 - 3 * n ** 3 / 5 + 557 * n ** 4 / 1440, 61 * n ** 3 / 240 - 103 * n ** 4 / 140, 49561 * n ** 4 / 161280];
  const be = [n / 2 - 2 * n ** 2 / 3 + 37 * n ** 3 / 96 - n ** 4 / 360, n ** 2 / 48 + n ** 3 / 15 - 437 * n ** 4 / 1440, 17 * n ** 3 / 480 - 37 * n ** 4 / 840, 4397 * n ** 4 / 161280];
  const rad = Math.PI / 180, chi = (phi) => Math.atan(Math.sinh(Math.asinh(Math.tan(phi)) - e * Math.atanh(e * Math.sin(phi))));
  const c0 = chi(SV.lat0 * rad), xi0 = c0 + al.reduce((s, a, j) => s + a * Math.sin(2 * (j + 1) * c0), 0);
  return (E, N) => {
    const xi = (N - SV.FN) / (SV.k0 * A) + xi0, eta = (E - SV.FE) / (SV.k0 * A);
    let xp = xi, ep = eta; be.forEach((b, j) => { const m = 2 * (j + 1); xp -= b * Math.sin(m * xi) * Math.cosh(m * eta); ep -= b * Math.cos(m * xi) * Math.sinh(m * eta); });
    const ch = Math.asin(Math.sin(xp) / Math.cosh(ep)); let phi = ch;
    for (let i = 0; i < 8; i++) phi = Math.atan(Math.sinh(Math.asinh(Math.tan(ch)) + e * Math.atanh(e * Math.sin(phi))));
    return { lat: phi / rad, lon: SV.lon0 + Math.atan2(Math.sinh(ep), Math.cos(xp)) / rad };
  };
})();

const ymInt = (ym) => Math.floor(ym / 12) * 100 + (ym % 12) + 1;               // months-since-2000*12 -> YYYYMM
const r0 = (v) => Math.round(v), r5 = (v) => Math.round(v * 1e5) / 1e5;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };

function load(rawDir) {
  const files = fs.readdirSync(rawDir).filter((f) => /^batch-\d+\.json$/.test(f)).sort();
  if (!files.length) throw new Error('No batch-*.json files in ' + rawDir);
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8')));
}

function build(docs, cfg, pc, ix, asOf) {
  const tmap = G.checkConfig(cfg), screen = G.nameScreen(pc);
  const xy = new Map(), tx = new Map();
  let latest = 0;
  docs.forEach((doc) => (doc.Result || []).forEach((p) => {
    const name = p.project; if (!name || screen(name)) return;
    if (p.x && p.y && !xy.has(name)) xy.set(name, [Number(p.x), Number(p.y)]);
    (p.transaction || []).forEach((t) => {
      const a = G.admit(t, p.marketSegment, tmap); if (!a.ok) return;
      const sqft = a.sqm * SQM_TO_SQFT; latest = Math.max(latest, a.ym);
      (tx.get(name) || tx.set(name, []).get(name)).push({ s: a.sale, cls: a.cls, price: a.price, sqft, psf: a.price / sqft, bin: Math.floor(sqft / 100) * 100, ym: a.ym });
    });
  }));
  const cell = (rs) => {
    const psf = rs.map((x) => x.psf).sort((a, b) => a - b), pr = rs.map((x) => x.price).sort((a, b) => a - b), mo = new Set(rs.map((x) => x.ym));
    return { n: rs.length, act: mo.size, last: ymInt(Math.max(...mo)), q1: r0(quantile(psf, .25)), med: r0(quantile(psf, .5)), q3: r0(quantile(psf, .75)), pmed: r0(quantile(pr, .5)), sub: rs.filter((x) => x.s === 2).length };
  };
  const cellsFor = (rows, sales) => {
    const sel = rows.filter((x) => sales.includes(x.s)), out = [];
    WINS.forEach((w, wi) => { const by = new Map(); sel.filter((x) => latest - x.ym < w).forEach((x) => (by.get(x.bin) || by.set(x.bin, []).get(x.bin)).push(x)); Array.from(by.keys()).sort((a, b) => a - b).forEach((b) => out.push([b, wi, ...Object.values(cell(by.get(b)))])); });
    return out;      // [bin, win, n, act, last, q1, med, q3, pmed, sub]
  };
  // Recent sales are listed only where no size band supports a typical price in any window (the Research rule: 5 sales over 3 months).
  const recent = (rows, sales, cells) => {
    if (cells.some((c) => c[2] >= 5 && c[3] >= 3)) return [];
    return rows.filter((x) => sales.includes(x.s) && latest - x.ym < 36).sort((a, b) => b.ym - a.ym || b.price - a.price).slice(0, MAX_RECENT).map((x) => [ymInt(x.ym), r0(x.sqft), r0(x.price), r0(x.psf)]);
  };
  const F = ix.fields, byId = new Map(ix.rows.map((r) => { const o = {}; F.forEach((k, i) => { o[k] = r[i]; }); return [o.id, o]; }));
  const places = [], ev = {}, check = [], noXY = [];
  Array.from(tx.keys()).sort().forEach((name) => {
    const id = P.slugify(name), row = byId.get(id); if (!row) return;      // not in the Research index: out of scope
    const D = G.split(tx.get(name)), rows = D.rows, cls = D.cls;      // headline class only; other classes under the same name are counted in `also`
    if (row.cls !== cls) throw new Error('Class differs from the Research index for ' + name + ': ' + row.cls + ' vs ' + cls);
    const isNew = (x) => x.s === 1, isSec = (x) => x.s !== 1;
    const mkNew = cellsFor(rows, [1]), mkSec = cellsFor(rows, [2, 3]);
    const sec = rows.filter(isSec), nw = rows.filter(isNew), s12 = sec.filter((x) => latest - x.ym < 12);
    const lease = (/from (\d{4})/.exec(row.tenLabel) || [])[1];
    ev[id] = { street: R.displayName(row.street), also: D.also, tenure: row.tenLabel, tenGroup: row.tenGroup, lease: lease ? +lease : null,
      tot: { new: nw.length, sub: sec.filter((x) => x.s === 2).length, res: sec.filter((x) => x.s === 3).length },
      lastNew: nw.length ? ymInt(Math.max(...nw.map((x) => x.ym))) : null, lastSec: sec.length ? ymInt(Math.max(...sec.map((x) => x.ym))) : null,
      mk: { new: mkNew, sec: mkSec }, rc: { new: recent(rows, [1], mkNew), sec: recent(rows, [2, 3], mkSec) } };
    const pos = xy.get(name), ll = pos ? svy21(pos[0], pos[1]) : null; if (!ll) noXY.push({ id, name, n: rows.length, last: row.last });
    places.push([id, R.displayName(G.shownName(name, pc)), ll ? r5(ll.lat) : null, ll ? r5(ll.lon) : null, String(row.district), row.seg, nw.filter((x) => latest - x.ym < 12).length, s12.length, s12.filter((x) => x.s === 2).length, cls]);
    check.push({ id, rows });
  });
  return { places, ev, latest, noXY, check, cellsFor, byId };
}

/* ---------- validation against the live Research cells ---------- */
function validate(out, projDir) {
  const man = JSON.parse(fs.readFileSync(path.join(projDir, 'manifest.json'), 'utf8')), shards = {}; let tested = 0, bad = []; const miss = [];
  const live = (id) => { const sh = P.shardName(P.shardOf(id, man.shards)); const d = shards[sh] || (shards[sh] = JSON.parse(fs.readFileSync(path.join(projDir, 'detail', sh + '.json'), 'utf8'))); return d.projects[id]; };
  const key = (c) => c[0] + ':' + c[1] + ':' + c[2];                                   // sale:bin:win
  out.check.forEach(({ id, rows }) => {
    const L = live(id); if (!L) return miss.push(id);
    const lc = new Map(L.cells.filter((c) => c[2] <= 2).map((c) => [key(c), c]));      // [sale,bin,win,n,act,top,last,min,q1,med,q3,max]
    const cmpRow = (mine, sale) => {                                                    // mine: [bin,win,n,act,last,q1,med,q3,...]
      const seen = new Set();
      mine.forEach((m) => { const k = sale + ':' + m[0] + ':' + m[1], l = lc.get(k); tested++; seen.add(k); if (!l || l[3] !== m[2] || l[4] !== m[3] || l[6] !== m[4] || l[8] !== m[5] || l[9] !== m[6] || l[10] !== m[7]) bad.push(id + ' ' + k); });
      lc.forEach((l, k) => { if (k.startsWith(sale + ':') && !seen.has(k)) bad.push(id + ' ' + k + ' (live cell missing from the map build)'); });
    };
    cmpRow(out.ev[id].mk.new, 1);
    cmpRow(out.cellsFor(rows, [3]), 3);
    cmpRow(out.cellsFor(rows, [2]), 2);
    out.ev[id].mk.sec.forEach((m) => {                                                  // pooled secondary = live sub + live resale
      const k2 = '2:' + m[0] + ':' + m[1], k3 = '3:' + m[0] + ':' + m[1], a = lc.get(k2), b = lc.get(k3); tested++;
      if (m[2] !== (a ? a[3] : 0) + (b ? b[3] : 0) || m[9] !== (a ? a[3] : 0) || m[4] !== Math.max(a ? a[6] : 0, b ? b[6] : 0)) { bad.push(id + ' pooled ' + k2); return; }
      if (!a || !b) { const o = a || b; if (m[5] !== o[8] || m[6] !== o[9] || m[7] !== o[10]) bad.push(id + ' pooled ' + k2 + ' (single-source cell differs from the live cell)'); }
      else if (m[6] < Math.min(a[9], b[9]) || m[6] > Math.max(a[9], b[9]) || m[5] < Math.min(a[7], b[7]) || m[7] > Math.max(a[11], b[11])) bad.push(id + ' pooled ' + k2 + ' (pooled quartiles outside the live cells)');
    });
  });
  return { tested, bad, miss };
}

function main() {
  const raw = arg('raw', path.join(__dirname, 'raw')), outDir = arg('out', path.join(__dirname, '../../data/map')), projDir = arg('projects', path.join(__dirname, '../../data/projects'));
  const asOf = arg('as-of', new Date().toISOString().slice(0, 10)), cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), pc = JSON.parse(fs.readFileSync(path.join(__dirname, 'project-config.json'), 'utf8'));
  const ix = JSON.parse(fs.readFileSync(path.join(projDir, 'index.json'), 'utf8')), man = JSON.parse(fs.readFileSync(path.join(projDir, 'manifest.json'), 'utf8'));
  const out = build(load(raw), cfg, pc, ix, asOf);
  const ids = new Set(out.places.map((r) => r[0])), missing = ix.rows.filter((r) => !ids.has(r[ix.fields.indexOf('id')]));
  if (missing.length) { console.error('Research projects missing from the map build: ' + missing.length); process.exit(1); }
  const seenNames = new Map(); out.places.forEach((r) => { if (seenNames.has(r[1])) { console.error('Two developments share the map name "' + r[1] + '": ' + seenNames.get(r[1]) + ' and ' + r[0]); process.exit(1); } seenNames.set(r[1], r[0]); });
  if (ymInt(out.latest).toString().replace(/^(\d{4})(\d{2})$/, '$1-$2') !== man.latestMonth) { console.error('Latest month differs from Research (' + ymInt(out.latest) + ' vs ' + man.latestMonth + '); build from the same raw files.'); process.exit(1); }
  if (!process.argv.includes('--no-validate')) {
    const v = validate(out, projDir);
    console.log('validation against live Research cells: ' + v.tested + ' cells checked, ' + v.bad.length + ' mismatches' + (v.miss.length ? ', ' + v.miss.length + ' projects without a live record' : ''));
    if (v.bad.length || v.miss.length) { console.error(v.bad.slice(0, 20).join('\n')); process.exit(1); }
  }
  fs.mkdirSync(outDir, { recursive: true });
  const meta = { v: 1, asOf, latestMonth: man.latestMonth, source: 'URA transactions (PMI_Resi_Transaction)' };
  fs.writeFileSync(path.join(outDir, 'places.json'), JSON.stringify(Object.assign({}, meta, { fields: ['id', 'name', 'lat', 'lon', 'district', 'seg', 'p12', 's12', 'sub12', 'cls'], rows: out.places })));
  fs.writeFileSync(path.join(outDir, 'ev.json'), JSON.stringify(Object.assign({}, meta, { cellFields: ['bin', 'win', 'n', 'act', 'last', 'q1', 'med', 'q3', 'pmed', 'sub'], projects: out.ev })));
  const kb = (f) => Math.round(fs.statSync(path.join(outDir, f)).size / 1024) + ' KB';
  console.log(out.places.length + ' projects (' + (out.places.length - out.noXY.length) + ' with a position, ' + out.noXY.length + ' without); places.json ' + kb('places.json') + ', ev.json ' + kb('ev.json'));
  const rep = arg('report', null); if (rep) fs.writeFileSync(rep, 'Projects without a URA position (searchable, never placed on the map):\n' + out.noXY.sort((a, b) => b.n - a.n).map((x) => x.name + '\t' + x.n + ' sales\tlatest ' + x.last).join('\n') + '\n');
}
if (require.main === module) main();
module.exports = { svy21, build, validate };
