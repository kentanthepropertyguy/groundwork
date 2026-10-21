#!/usr/bin/env node
/* Finds a land parcel's boundary in URA's Master Plan land-use layer (data.gov.sg, "Master Plan 2025 Land Use Layer") and saves it in tools/market-data/sources/parcels.json.
   Why: HDB's sale sites are not in URA's "Sale Sites" dataset, and OneMap's "CHENCHARU (U/C)" label marks a building, not the parcel. A parcel is accepted ONLY when
   its zoning matches (e.g. COMMERCIAL & RESIDENTIAL), it lies near where the site is described, and its area equals the area the tender documents publish (within 0.5%).
   If no parcel or more than one satisfies all three, nothing is written. The saved boundary is what the Map uses (its interior point is the site's position).
     node tools/market-data/extract-parcel.js --mp <master-plan-landuse.geojson> --id chencharu-close --near 1.4157,103.8287 --radius 700 --use "COMMERCIAL & RESIDENTIAL" --area 29450 --area-source "Star Property, 2 Oct 2025" */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'sources/parcels.json'), KX = 111320 * Math.cos(1.35 * Math.PI / 180), KY = 110574;
const ringA = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * KX) * (r[i][1] * KY) - (r[i][0] * KX) * (r[j][1] * KY); return a / 2; };
const polyArea = (p) => Math.abs(ringA(p[0])) - p.slice(1).reduce((s, h) => s + Math.abs(ringA(h)), 0);
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
function centroid(r) { let a = 0, cx = 0, cy = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const x1 = r[j][0] * KX, y1 = r[j][1] * KY, x2 = r[i][0] * KX, y2 = r[i][1] * KY, f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f; } a /= 2; return a ? [cx / (6 * a) / KX, cy / (6 * a) / KY] : r[0]; }
/* feats: GeoJSON features. -> matching polygons [{ poly, area, gpr, luDesc }] */
function find(feats, o) {
  const out = [];
  feats.forEach((f) => {
    const lu = String((f.properties && f.properties.LU_DESC) || '').toUpperCase(); if (lu !== o.use.toUpperCase()) return;
    polysOf(f.geometry).forEach((p) => {
      const c = centroid(p[0]); if (Math.hypot((c[0] - o.near[1]) * KX, (c[1] - o.near[0]) * KY) > o.radius) return;
      const area = polyArea(p); if (Math.abs(area - o.area) / o.area > (o.tol || 0.005)) return;
      out.push({ poly: p, area, gpr: f.properties.GPR || null, luDesc: lu });
    });
  });
  return out;
}
const r6 = (n) => Math.round(n * 1e6) / 1e6;
function main() {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf('--' + k); return i > -1 ? a[i + 1] : null; };
  const mp = get('mp'), id = get('id'), near = (get('near') || '').split(',').map(Number), use = get('use'), area = +get('area');
  if (!mp || !id || near.length !== 2 || !use || !area) { console.error('needs --mp --id --near lat,lon --use "ZONING" --area sqm  [--radius m] [--area-source text]'); process.exit(2); }
  const feats = JSON.parse(fs.readFileSync(mp, 'utf8')).features, hits = find(feats, { near, radius: +(get('radius') || 700), use, area });
  if (hits.length !== 1) { console.error(id + ': ' + hits.length + ' parcels match zoning + place + area (need exactly 1). Nothing written.'); process.exit(1); }
  const h = hits[0], cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { v: 1, parcels: {} };
  cache.parcels[id] = { source: 'URA Master Plan 2025 Land Use Layer (data.gov.sg)', zoning: h.luDesc, gpr: h.gpr, areaSqm: Math.round(h.area), publishedAreaSqm: area, areaSource: get('area-source') || '', extracted: new Date().toISOString().slice(0, 10), rings: h.poly.map((r) => r.map((q) => [r6(q[0]), r6(q[1])])) };
  fs.writeFileSync(OUT, JSON.stringify(cache, null, 1) + '\n'); console.log(id + ': parcel of ' + Math.round(h.area) + ' sqm (published ' + area + ') saved.');
}
if (require.main === module) main();
module.exports = { find, polyArea, centroid };
