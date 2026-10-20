"""Neighbourhood layer for the Interactive Map. Built once a year (or when a source dataset is refreshed), offline, from data.gov.sg downloads.

Open layer (published): MRT/LRT stations (LTA), food centres (NEA), parks (NParks), planning areas (URA Master Plan 2019).
  All are Singapore Open Data Licence v1.0 and carry their own coordinates.
Second layer (schools from MOE, supermarkets from NEA licences): both datasets are Singapore Open Data Licence v1.0 but carry no coordinates, so positions come from
  a one-off OneMap postal-code search (geocache.json). OneMap's API terms place its datasets under the same licence (copy, distribute, adapt, commercial use, with
  a source notice), so with --publish-extra the file is written into --out and carries a OneMap/SLA source line that the page shows in its notice.
  Without --publish-extra the file is written to --extra-out (outside the site folder) and the layer stays off. Dropping the layer needs no code change.

Usage: python3 tools/map-data/build-amenities.py --in <folder of downloads> --out data/map --extra-out <private folder> [--accessed "20 October 2026"]
Input files: mrt_exits.geojson hawker.geojson parks.geojson planning_areas.geojson schools.csv supermarkets.csv geocache.json
Output holds names, levels and positions only: no principal, phone, email or licence numbers; non-chain supermarket licensee names are never published.
"""
import argparse, csv, json, pathlib, re
from shapely.geometry import shape
ap = argparse.ArgumentParser(); ap.add_argument('--in', dest='inp', required=True); ap.add_argument('--out', required=True); ap.add_argument('--extra-out', required=True); ap.add_argument('--accessed', default='20 October 2026'); ap.add_argument('--publish-extra', action='store_true', help='write the schools/supermarkets file into --out and switch the layer on')
args = ap.parse_args(); A = pathlib.Path(args.inp); OUT = pathlib.Path(args.out); EXTRA = pathlib.Path(args.extra_out); OUT.mkdir(parents=True, exist_ok=True); EXTRA.mkdir(parents=True, exist_ok=True)
ACR = {'JLG', 'CHIJ', 'SJI', 'ACS', 'RI', 'NUS', 'NTU', 'SOTA', 'NYJC', 'RJC', 'VJC', 'TJC', 'HCI', 'AJC', 'CJC', 'DHS', 'SAJC', 'MOE', 'ITE', 'SIM', 'EJC', 'IJC', 'JJC', 'MJC', 'PJC', 'SRJC', 'YIJC', 'TPJC', 'NJC', 'ST', 'NTUC', 'CCK', 'AMK', 'TPY'}
def title(s):
    s = re.sub(r'\s+', ' ', str(s)).strip(); out = []
    for i, w in enumerate(s.split(' ')):
        if re.sub(r'[^A-Za-z]', '', w) in ACR and w not in ('ST',): out.append(w.upper() if re.sub(r'[^A-Za-z]', '', w) in ACR else w)
        elif w == 'ST.' or w == 'ST': out.append('St.' if w == 'ST.' else 'St')
        elif w in ('OF', 'THE', 'AND', 'AT') and i: out.append(w.lower())
        else: out.append(re.sub(r"(^|[-(/])([a-z])", lambda m: m.group(1) + m.group(2).upper(), w.lower()))
    return ' '.join(out)
r5 = lambda v: round(v, 5)

# ---- MRT / LRT stations: one record per station, nearest-exit distances are computed at runtime
mx = json.load(open(A / 'mrt_exits.geojson')); st = {}
for f in mx['features']:
    n = f['properties']['STATION_NA']; lon, lat = f['geometry']['coordinates'][:2]; st.setdefault(n, []).append((lat, lon))
stations = []
for n, ex in sorted(st.items()):
    nm = title(re.sub(r' (MRT|LRT) STATION$', '', n)); kind = 'LRT' if n.endswith('LRT STATION') else 'MRT'
    la = sum(e[0] for e in ex) / len(ex); lo = sum(e[1] for e in ex) / len(ex)
    stations.append(dict(n=nm + ' ' + kind, k=kind, lat=r5(la), lon=r5(lo), ex=[[r5(a), r5(b)] for a, b in ex]))
# ---- schools (MOE general information; coordinates by postal geocode)
gc = json.load(open(A / 'geocache.json')); schools = []; miss = 0
def level(code):
    c = code.strip(); m = re.match(r'^(.*?)(?: \(([^)]*)\))?$', c); base, rg = m.group(1).strip(), (m.group(2) or '').replace('-', '\u2013')
    b = base.lower()
    if b == 'primary': return dict(lv='Primary', sub='Primary', lab='Primary school', rg=rg)
    if b == 'secondary': return dict(lv='Secondary', sub='Secondary', lab='Secondary school', rg=rg)
    if b.startswith('junior college'): return dict(lv='Junior college', sub='Junior college', lab='Junior college', rg=rg)
    if b.startswith('mixed'): return dict(lv='Mixed level', sub=rg or 'Mixed level', lab='Mixed level school' + (' (' + rg + ')' if rg else ''), rg=rg)
    return dict(lv=title(base), sub=title(base), lab=title(base), rg=rg)
for r in csv.DictReader(open(A / 'schools.csv')):
    g = gc.get(r['postal_code'].strip())
    if not g: miss += 1; continue
    schools.append(dict(n=title(r['school_name']), lat=r5(g[0]), lon=r5(g[1]), **level(r['mainlevel_code'])))
# ---- supermarkets (NEA licence list) and hawker / food centres (NEA)
BR = [('FAIRPRICE', 'FairPrice'), ('COLD STORAGE', 'Cold Storage'), ('SHENG SIONG', 'Sheng Siong'), ('GIANT', 'Giant'), ('U STARS', 'U Stars'), ('DONKI', 'Don Don Donki'), ('PRIME', 'Prime'), ('MEIDI', 'Meidi-ya'), ('MARKET PLACE', 'Market Place'), ('REDMART', 'RedMart'), ('MUSTAFA', 'Mustafa')]
def brand(s):
    u = s.upper()
    for k, v in BR:
        if k in u: return v
    return 'Supermarket'   # licensee names of non-chain shops can be sole proprietors' names: never published
shops = []; seen = set()
for r in csv.DictReader(open(A / 'supermarkets.csv')):
    g = gc.get(r['postal_code'].strip())
    if not g: continue
    bd = r['building_name'].strip(); where = title(bd) if bd and bd.lower() != 'na' else title((r['block_house_num'].strip() + ' ' + r['street_name'].strip()).strip())
    k = (brand(r['licensee_name']), r['postal_code'])
    if k in seen: continue
    seen.add(k); shops.append(dict(n=brand(r['licensee_name']), w=where, lat=r5(g[0]), lon=r5(g[1])))
hk = json.load(open(A / 'hawker.geojson')); food = []
for f in hk['features']:
    lon, lat = f['geometry']['coordinates'][:2]
    nm = f['properties']['NAME']; m = re.search(r'\(([^)]*)\)', nm)
    nm = re.sub(r'^\d+[A-Za-z]?\s+', '', m.group(1)) if m else nm
    food.append(dict(n=title(nm), lat=r5(lat), lon=r5(lon)))
# ---- parks: polygons simplified (about 20 m), exterior ring only; playgrounds and tiny green strips excluded
pk = json.load(open(A / 'parks.geojson')); parks = []
def pname(n):
    n = re.sub(r' PK$', ' Park', n.strip()); n = re.sub(r' OS$', ' Open Space', n); return title(n)
for f in pk['features']:
    p = f['properties']; nm = p['NAME'].strip()
    if nm.endswith(' PG') or 'PLAYGROUND' in nm or p['SHAPE_1.AREA'] < 8000: continue
    g = shape(f['geometry']); c = g.representative_point()
    gs = g.simplify(0.0002, preserve_topology=True); polys = list(gs.geoms) if gs.geom_type == 'MultiPolygon' else [gs]
    rings = [[[r5(y), r5(x)] for x, y in pl.exterior.coords] for pl in polys if pl.area > 0]
    parks.append(dict(n=pname(nm), a=round(p['SHAPE_1.AREA']), rings=rings))
# ---- planning areas (URA Master Plan 2019): polygons simplified (about 45 m)
pa = json.load(open(A / 'planning_areas.geojson')); areas = []; geoms = {}
for f in pa['features']:
    nm = title(f['properties']['PLN_AREA_N']); g = shape(f['geometry']).simplify(0.0004, preserve_topology=True)
    polys = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
    geoms[nm] = g; b = g.bounds
    areas.append(dict(n=nm, region=title(f['properties']['REGION_N']), b=[r5(b[1]), r5(b[0]), r5(b[3]), r5(b[2])], rings=[[[r5(y), r5(x)] for x, y in pl.exterior.coords] for pl in polys]))
SRC = lambda k, name, by, id_, note=None: dict(k=k, name=name, by=by, id=id_, accessed=args.accessed, **({'note': note} if note else {}))
open_out = dict(v=1, accessed=args.accessed, extra='amen-extra.json' if args.publish_extra else None, stations=stations, food=food, parks=parks, areas=areas, sources=[
    SRC('stations', 'LTA MRT Station Exit (GEOJSON)', 'Land Transport Authority', 'd_b39d3a0871985372d7e1637193335da5'),
    SRC('food', 'Hawker Centres (GEOJSON)', 'National Environment Agency', 'd_4a086da0a5553be1d89383cd90d07ecd'),
    SRC('parks', 'NParks Parks and Nature Reserves', 'National Parks Board', 'd_77d7ec97be83d44f61b85454f844382f'),
    SRC('areas', 'Master Plan 2019 Planning Area Boundary (No Sea)', 'Urban Redevelopment Authority', 'd_4765db0e87b9c86336792efe8a1f7a66')])
held_out = dict(v=1, accessed=args.accessed, schools=schools, shops=shops, sources=[
    SRC('schools', 'General information of schools', 'Ministry of Education', 'd_688b934f82c1059ed0a6993d2a829089', 'no coordinates in the dataset; positions from OneMap'),
    SRC('shops', 'List of Supermarket Licences', 'National Environment Agency', 'd_11edd0117280c5776651d7891114c88c', 'no coordinates in the dataset; positions from OneMap'),
    SRC('geocode', 'OneMap Search (positions of schools and supermarkets from their postal codes)', 'Singapore Land Authority', 'onemap.gov.sg')])
(OUT / 'amen.json').write_text(json.dumps(open_out, separators=(',', ':'), ensure_ascii=False))
((OUT if args.publish_extra else EXTRA) / 'amen-extra.json').write_text(json.dumps(held_out, separators=(',', ':'), ensure_ascii=False))
print('published:', {k: len(v) for k, v in open_out.items() if isinstance(v, list)}, (OUT / 'amen.json').stat().st_size // 1024, 'KB')
print('held back:', {k: len(v) for k, v in held_out.items() if isinstance(v, list)}, (EXTRA / 'amen-extra.json').stat().st_size // 1024, 'KB', '| postal codes not geocoded:', miss)
