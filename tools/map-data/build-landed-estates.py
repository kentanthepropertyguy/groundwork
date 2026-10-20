"""Estate names for the landed sales (so a buyer who knows a house by its estate name is not left empty-handed).
URA records many landed sales under an estate or project name (for example "SPRINGWOOD") against ONE street, usually the estate's main road,
not necessarily the road the house is on. This lists, for each such name, the street(s) URA files it under: no counts, no prices, nothing else.
Names URA leaves generic ("LANDED HOUSING DEVELOPMENT") are skipped, and so is any name with no house sale in the months data/value/landed/index.json covers.
The page only ever says what URA says (sales are recorded under this name on this street) and never moves a sale to another road.

Usage: python3 tools/map-data/build-landed-estates.py --raw <folder of URA PMI_Resi_Transaction batch-*.json files> --site <site folder>
Needs: Python 3.8+ (standard library only); the same raw URA files the landed sales were built from (kept outside the site folder).
Writes data/value/landed/estates.json: {v, kind, sourceVersion, estates: [[name, street, district]]}. Run after index.json is rebuilt, then research/tests/landed-near-tests.js.
"""
import argparse, glob, json, pathlib
ap = argparse.ArgumentParser(); ap.add_argument('--raw', required=True); ap.add_argument('--site', required=True)
a = ap.parse_args(); LAND = pathlib.Path(a.site) / 'data/value/landed'
I = json.load(open(LAND / 'index.json'))
HOUSES = {'Terrace', 'Semi-detached', 'Detached', 'Strata Terrace', 'Strata Semi-detached', 'Strata Detached'}   # URA's names for the six landed types
def ym(contract):                                                   # URA contractDate is MMYY
    return (2000 + int(contract[2:])) * 100 + int(contract[:2])
streets = {s[0] for s in I['streets']}; seen = set()
for f in sorted(glob.glob(str(pathlib.Path(a.raw) / 'batch-*.json'))):
    for p in json.load(open(f)).get('Result', []):
        name, street = (p.get('project') or '').strip().upper(), (p.get('street') or '').strip().upper()
        if not name or name == 'LANDED HOUSING DEVELOPMENT' or street not in streets: continue
        for t in p.get('transaction', []):
            if t.get('propertyType') in HOUSES and I['firstMonth'] <= ym(t['contractDate']) <= I['latestMonth']: seen.add((name, street, str(t['district']).zfill(2)))
out = sorted([list(k) for k in seen])
json.dump({'v': 1, 'kind': 'gw-landed-estates', 'sourceVersion': I['sourceVersion'], 'estates': out}, open(LAND / 'estates.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print('estate-street pairs', len(out), 'estate names', len({k[0] for k in out}))
