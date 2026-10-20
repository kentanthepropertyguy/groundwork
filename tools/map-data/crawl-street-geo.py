#!/usr/bin/env python3
"""Step 1 of 2 for the street-position index (the nearby landed sales on Research > Property values & prices).
Asks OneMap's public search (Singapore Land Authority) where each street is, and keeps the raw answers in a cache file OUTSIDE the site folder.
Step 2, build-street-geo.py, turns that cache into data/value/landed/geo.json and geo-more.json.

Needs
  * Python 3.8+ (standard library only) and internet access to https://www.onemap.gov.sg (no key, no account; the search is public)
  * the site's own data/value/landed/index.json (URA landed sales, already in the site): every street named there is looked up
  * OPTIONAL --roadnames <file>: URA "Master Plan 2019 Road Name layer" (data.gov.sg, GeoJSON, Singapore Open Data Licence v1.0). Only used to
    also look up streets that have no landed sale, so a typed street with no sale can still be placed. Without it the index still builds,
    with fewer such streets (geo-more.json is shorter). The file used for the published index had 12,232 features, sha256
    5e9b7e7084caab35a5198dcbcc4b82f1e56e2722029b17dcf6f907b52d512fcd.

Usage   python3 tools/map-data/crawl-street-geo.py --site <site folder> --cache <folder outside the site>/street-cache.jsonl [--roadnames <geojson>] [--workers 4]
Safe to stop and re-run: finished lookups are kept and skipped. Polite by design (4 requests at a time, short pauses, identifying User-Agent).
Exits 0 only when every lookup finished; otherwise it says how many are left and exits 1, and a re-run picks those up. About 3,300 lookups, 10 to 20 minutes.
"""
import argparse, concurrent.futures as cf, json, pathlib, re, threading, time, urllib.parse, urllib.request
ap = argparse.ArgumentParser(); ap.add_argument('--site', required=True); ap.add_argument('--cache', required=True); ap.add_argument('--roadnames'); ap.add_argument('--workers', type=int, default=4)
a = ap.parse_args(); SITE = pathlib.Path(a.site); CACHE = pathlib.Path(a.cache)
if SITE in CACHE.resolve().parents: raise SystemExit('Keep the cache outside the site folder: it is raw OneMap output and is not published.')
LAND = json.load(open(SITE / 'data/value/landed/index.json'))
def norm(s): return re.sub(r'\s+', ' ', str(s).upper().replace('.', '').replace("'", '')).strip()   # same spelling the builder uses
def variant(s):
    # URA writes "ST. ANNE'S WOOD"; OneMap writes "SAINT ANNE'S WOOD". Keep the apostrophe and spell Saint out for those names.
    v = re.sub(r'\s+', ' ', str(s).upper().replace('.', '')).strip()
    return re.sub(r'^ST\b', 'SAINT', v)
HEAD = ('JALAN', 'LORONG', 'UPPER', 'LOWER', 'EAST', 'WEST', 'NORTH', 'SOUTH', 'BUKIT', 'KAMPONG', 'TANJONG')
queries = []
for s in LAND['streets']:
    queries.append(('E', norm(s[0])))                      # the street itself, up to 5 pages of answers
    if "'" in s[0] or s[0].upper().startswith('ST.'): queries.append(('E', variant(s[0])))
stems = set()                                              # first words / name stems, so streets OneMap lists under a slightly different name are still found
for s in LAND['streets']:
    w = norm(s[0]).split(' ')
    if len(w[0]) >= 4 and w[0] not in HEAD: stems.add(w[0])
    if len(w) > 1 and w[0] in HEAD: stems.add(w[0] + ' ' + w[1])
if a.roadnames:
    for f in json.load(open(a.roadnames))['features']:
        t = norm(f['properties'].get('TEXTSTRING') or '')
        if len(t) >= 4 and not re.search(r'\d', t): stems.add(t)
queries += [('S', t) for t in sorted(stems)]
queries = list(dict.fromkeys(queries))
done = set()
if CACHE.exists():
    for line in CACHE.open():
        try: r = json.loads(line); done.add((r['k'], r['q']))
        except Exception: pass
todo = [q for q in queries if q not in done]
print('lookups', len(queries), 'to do', len(todo), flush=True)
CACHE.parent.mkdir(parents=True, exist_ok=True)
lock = threading.Lock(); out = CACHE.open('a'); cnt = [0]; failed = [0]
def fetch(q, page):
    url = 'https://www.onemap.gov.sg/api/common/elastic/search?' + urllib.parse.urlencode({'searchVal': q, 'returnGeom': 'Y', 'getAddrDetails': 'Y', 'pageNum': page})
    for n in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'groundwork-street-index/1.0 (offline build)'}), timeout=30) as r: return json.load(r)
        except Exception: time.sleep(2 + 3 * n)
    return None
def job(item):
    k, q = item; maxp = 5 if k == 'E' else 3
    d = fetch(q, 1)
    if d is None: failed[0] += 1; return
    res = d.get('results', [])
    for p in range(2, min(d.get('totalNumPages', 1), maxp) + 1):
        time.sleep(0.25); dd = fetch(q, p)
        if dd is None: failed[0] += 1; return
        res += dd.get('results', [])
    rows = [[r.get('ROAD_NAME'), r.get('POSTAL'), round(float(r['LATITUDE']), 5), round(float(r['LONGITUDE']), 5), r.get('BLK_NO')] for r in res]
    with lock:
        out.write(json.dumps({'k': k, 'q': q, 'found': d.get('found'), 'rows': rows}) + '\n'); out.flush(); cnt[0] += 1
        if cnt[0] % 200 == 0: print('done', cnt[0], flush=True)
    time.sleep(0.2)
with cf.ThreadPoolExecutor(a.workers) as ex: list(ex.map(job, todo))
print('finished', cnt[0], 'not finished', failed[0], flush=True)
raise SystemExit(1 if failed[0] else 0)
