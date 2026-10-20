"""Approximate street positions for the nearby-landed-sales answer. Built once (and when URA's landed data is refreshed), offline.

Source: OneMap's public search (Singapore Land Authority), queried once per street name. OneMap's API terms place its data under the Singapore Open Data
Licence v1.0, with a source notice, which the page shows. Nothing here is a house or a sale: each street is ONE point (the position OneMap gives the road),
so every distance on the page is "about". Two files are written next to the landed sales:
  geo.json       every street URA records landed sales on: [name, district, lat, lon, planning area]   (loaded only when a search needs neighbours)
  geo-more.json  other named streets, only so that a street with no sale can be placed:  [name, lat, lon, planning area]   (loaded only when a typed street has no sale)

Step 2 of 2 (step 1 is tools/map-data/crawl-street-geo.py, which makes the cache from OneMap and lists what it needs).
Usage: python3 tools/map-data/build-street-geo.py --cache <the cache file(s) step 1 wrote> --site <site folder> [--accessed "20 October 2026"]
Reads from the site: data/value/landed/index.json (URA landed sales) and data/map/amen.json (planning-area outlines, for the area name). Standard library only.
The cache holds the raw OneMap answers (kept outside the site folder). A street OneMap cannot place is left out and counted in geo.json "unplaced".
Set --accessed to the day step 1 was run: it is stored in the files. Run research/tests/landed-near-tests.js afterwards.
"""
import argparse, json, math, pathlib, re, statistics
ap = argparse.ArgumentParser(); ap.add_argument('--cache', nargs='+', required=True); ap.add_argument('--site', required=True); ap.add_argument('--accessed', default='20 October 2026')
a = ap.parse_args(); SITE = pathlib.Path(a.site); LAND = SITE / 'data/value/landed'
I = json.load(open(LAND / 'index.json')); AM = json.load(open(SITE / 'data/map/amen.json'))
def norm(s):
    # one spelling per street: no dots or apostrophes, no "(ROAD)" tag, and Saint written St (URA records St., OneMap writes Saint)
    s = re.sub(r'\s*\(ROAD\)\s*$', '', str(s).upper().replace('.', '').replace("'", ''))
    return re.sub(r'\bSAINT\b', 'ST', re.sub(r'\s+', ' ', s)).strip()
# postal sector (first two digits of a postal code) -> district: the standard Singapore table
SECT = {}
for d, secs in {1: '01-06', 2: '07-08', 3: '14-16', 4: '09-10', 5: '11-13', 6: '17', 7: '18-19', 8: '20-21', 9: '22-23', 10: '24-27', 11: '28-30', 12: '31-33', 13: '34-37', 14: '38-41', 15: '42-45', 16: '46-48', 17: '49-50,81', 18: '51-52', 19: '53-55,82', 20: '56-57', 21: '58-59', 22: '60-64', 23: '65-68', 24: '69-71', 25: '72-73', 26: '77-78', 27: '75-76', 28: '79-80'}.items():
    for part in secs.split(','):
        lo, _, hi = part.partition('-'); hi = hi or lo
        for s in range(int(lo), int(hi) + 1): SECT['%02d' % s] = '%02d' % d
def district_of(postal):
    return SECT.get(str(postal)[:2]) if re.fullmatch(r'\d{6}', str(postal or '')) else None
def inside(lat, lon, ring):
    c = False; j = len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i]; yj, xj = ring[j]
        if (xi > lon) != (xj > lon) and lat < (yj - yi) * (lon - xi) / (xj - xi) + yi: c = not c
        j = i
    return c
def area_at(lat, lon):
    for ar in AM['areas']:
        b = ar['b']
        if lat < b[0] or lat > b[2] or lon < b[1] or lon > b[3]: continue
        if any(inside(lat, lon, r) for r in ar['rings']): return ar['n']
    return None
def hav(p, q):
    R = 6371008.8; la1, la2 = math.radians(p[0]), math.radians(q[0]); dla = la2 - la1; dlo = math.radians(q[1] - p[1])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(min(1, math.sqrt(h)))
# ---- the raw answers: road name -> every position OneMap gave it (with the postal code, when it was an address)
pts = {}   # name -> list of (lat, lon, district or None, is_road_point)
done_q = {}
for f in a.cache:
    for line in open(f):
        try: r = json.loads(line)
        except Exception: continue
        done_q[(r['k'], r['q'])] = r
        for road, postal, lat, lon, blk in r['rows']:
            if not road: continue
            nm = norm(road)
            pts.setdefault(nm, set()).add((round(lat, 4), round(lon, 4), district_of(postal), postal in (None, 'NIL', '')))
print('queries', len(done_q), 'road names seen', len(pts))
# ---- a position for every street URA records landed sales on
def place(name, dist):
    cand = sorted(pts.get(name, set()), key=repr)    # sorted, so the same cache always gives the same files
    roadpts = [(la, lo, d) for la, lo, d, isroad in cand if isroad]
    addr = [(la, lo, d) for la, lo, d, isroad in cand if not isroad and d == dist]
    if addr: return ('postal', (statistics.median([x[0] for x in addr]), statistics.median([x[1] for x in addr])))
    return ('road', roadpts)
placed, ambiguous, unplaced = {}, [], []
for name, dist, n in I['streets']:
    kind, v = place(norm(name), dist)
    if kind == 'postal': placed[(name, dist)] = v
    elif len(v) == 1: placed[(name, dist)] = (v[0][0], v[0][1])
    elif len(v) > 1: ambiguous.append((name, dist, v))
    else: unplaced.append((name, dist, n))
# same name recorded in several districts with several road points: pick, for each district, the point nearest the middle of the district's other streets
cent = {}
for d in {k[1] for k in placed}:
    xs = [v for k, v in placed.items() if k[1] == d]; cent[d] = (statistics.median([x[0] for x in xs]), statistics.median([x[1] for x in xs]))
for name, dist, v in ambiguous:
    if dist in cent:
        best = min(v, key=lambda x: hav((x[0], x[1]), cent[dist]))
        if hav((best[0], best[1]), cent[dist]) <= 6000: placed[(name, dist)] = (best[0], best[1]); continue
    unplaced.append((name, dist, 0))
# a street placed far from the rest of its district is more likely a name clash than a real position: leave it out
far = []
for k, v in list(placed.items()):
    c = cent.get(k[1])
    if c and hav(v, c) > 9000: far.append(k); del placed[k]
sales_by = {(s[0], s[1]): s[2] for s in I['streets']}
unplaced_sales = sum(sales_by[(n, d)] for n, d, _ in unplaced) + sum(sales_by[k] for k in far)
streets = sorted([[k[0], k[1], round(v[0], 4), round(v[1], 4), area_at(v[0], v[1])] for k, v in placed.items()], key=lambda x: (x[0], x[1]))
src = 'Street positions: OneMap, Singapore Land Authority (Singapore Open Data Licence v1.0). One approximate point for each street, not a house.'
json.dump({'v': 1, 'kind': 'gw-landed-street-geo', 'accessed': a.accessed, 'source': src, 'sourceVersion': I['sourceVersion'], 'placed': len(streets), 'unplaced': len(unplaced) + len(far), 'unplacedSales': unplaced_sales, 'sales': I['transactions'], 'streets': streets}, open(LAND / 'geo.json', 'w'), separators=(',', ':'), ensure_ascii=False)
# ---- other named streets (so a street with no sale can still be placed)
have = {norm(s[0]) for s in I['streets']}; more = []
for nm, cand in sorted(pts.items()):
    if nm in have or not re.search(r'\b(ROAD|STREET|AVENUE|DRIVE|CRESCENT|CLOSE|LANE|WALK|GROVE|PLACE|TERRACE|PARK|VIEW|WAY|HILL|RISE|GARDEN|GARDENS|HEIGHTS|LORONG|JALAN|BOULEVARD|LINK|CIRCLE|GREEN|LOOP|SQUARE|VALE|VILLE|ROW|CENTRAL)\b', nm): continue
    rp = [(la, lo) for la, lo, d, isroad in cand if isroad]
    ap_ = [(la, lo) for la, lo, d, isroad in cand if not isroad]
    # one position per name; a name OneMap returns in several places is kept once per place, 2 km apart at least (an honest pick list, not a guess)
    group = []
    for la, lo in sorted(rp or ap_):
        if all(hav((la, lo), g) > 2000 for g in group): group.append((la, lo))
    for la, lo in group[:3]: more.append([nm, round(la, 4), round(lo, 4), area_at(la, lo)])
more.sort(key=lambda x: (x[0], x[1]))
json.dump({'v': 1, 'kind': 'gw-landed-street-geo-more', 'accessed': a.accessed, 'source': src, 'streets': more}, open(LAND / 'geo-more.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print('geo.json streets', len(streets), 'unplaced', len(unplaced) + len(far), '(sales on them', unplaced_sales, 'of', I['transactions'], ') geo-more', len(more))
for u in unplaced[:25]: print('  unplaced', u)
for k in far[:10]: print('  far', k)
