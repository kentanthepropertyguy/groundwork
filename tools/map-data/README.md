# Interactive Map data

The map page is `research/map/`. It reads static files from `data/map/`. Nothing here changes the Research pages or any calculator.

| File | Made by | When | Contents |
|---|---|---|---|
| `places.json`, `ev.json` | `tools/market-data/build-map-data.js` | every month, with the Research build | project positions; size-band cells for Primary (New Sale) and Secondary (Sub Sale + Resale); up to 6 recent sales for thin markets |
| `amen.json` | `tools/map-data/build-amenities.py` | once a year, or when a source dataset is refreshed | MRT/LRT stations (LTA), food centres (NEA), parks (NParks), planning areas (URA), all under the Singapore Open Data Licence v1.0 |
| `amen-extra.json` | same script, `--publish-extra` | once a year, with `amen.json` | schools (MOE) and supermarkets (NEA licences): name, level, position only |
| `data/value/landed/geo.json`, `geo-more.json` | `tools/map-data/crawl-street-geo.py` then `build-street-geo.py` | when URA's landed data is refreshed (new streets) | one approximate OneMap position per street, for the nearby landed sales on Property values & prices. See below |

## Monthly (after `build-project-stats.js`, same raw files)
    node tools/market-data/build-map-data.js --raw tools/market-data/raw --out data/map --as-of YYYY-MM-DD
It recomputes every cell and compares it with the live Research cells in `data/projects`. It stops (non-zero exit) on any mismatch, if a Research project is missing, or if the latest month differs.

## Schools and supermarkets
The two source lists (data.gov.sg, Singapore Open Data Licence v1.0) carry no coordinates. Positions come from a one-off OneMap postal-code search (cached in `geocache.json`, kept out of the site folder). OneMap's API terms place its datasets under the same Open Data Licence, which allows copying, distributing and adapting with a source notice, so the positions are published with a OneMap / Singapore Land Authority line in the sources notice. Nothing else from OneMap is stored (no addresses, no postal codes).
To drop the layer without touching code, re-run the script without `--publish-extra` (it then writes the file outside the site folder and sets `"extra": null`); the page works without it.
Non-chain supermarket licensee names are never published (the word "Supermarket" is used instead).

## Street positions for nearby landed sales (rebuild when URA's landed data is refreshed)
`data/value/landed/geo.json` (streets with landed sales) and `geo-more.json` (other named streets) give each street ONE approximate point. They are built from OneMap's public search (Singapore Land Authority, Singapore Open Data Licence v1.0; the page shows the notice). Run after `data/value/landed/index.json` changes, in this order:

    python3 tools/map-data/crawl-street-geo.py --site . --cache ../street-cache.jsonl --roadnames <MP2019 road-name geojson>
    python3 tools/map-data/build-street-geo.py --site . --cache ../street-cache.jsonl --accessed "<today, e.g. 20 October 2026>"
    node research/tests/landed-near-tests.js

What it needs: Python 3.8+ (standard library only); internet access to onemap.gov.sg (public search, no key); the site's own `data/value/landed/index.json` and `data/map/amen.json`. The road-name file is optional: URA "Master Plan 2019 Road Name layer" (data.gov.sg, GeoJSON). It only adds streets with no sale, so a typed street can still be placed; without it `geo-more.json` is shorter. The published index used a 12,232-feature file with sha256 `5e9b7e70…2d512fcd`.
Keep the cache OUTSIDE the site folder (raw OneMap output, never published; the crawler refuses a cache inside the site). The crawl is resumable (re-run after an interruption), takes 10 to 20 minutes, and exits non-zero if any lookup did not finish. Step 2 reports streets it could not place (they are left out of the answer, never guessed). Check the tests afterwards: the Springwood Crescent and busy-street cases must still pass.

**Where else the street positions are used.** The same two files give the road search: the Map's search, the shared Groundwork search, the Research search and Browse all offer a road, and a road leads to what landed homes sold for around it (Property values & prices, address `#landed:<Road>`) and to its place on the Map (`#pl=road:<Road> (<Area>)`). Nothing extra to build: refreshing the street positions refreshes them all.

## Estate names for landed sales (rebuild with the landed sales)
URA files many landed sales under an estate name (for example SPRINGWOOD, on Jalan Mat Jambol), not under the road a house is on. `data/value/landed/estates.json` lists those names with the street URA files them under (no counts, no prices); the nearby-sales answer uses it for one plain sentence when a searched street starts with an estate name. Rebuild when the landed sales are rebuilt:

    python3 tools/map-data/build-landed-estates.py --raw <folder of the URA PMI_Resi_Transaction batch-*.json files> --site .
    node research/tests/landed-near-tests.js

Needs Python 3.8+ (standard library only) and the same raw URA files the landed sales were built from (kept outside the site folder).

## Notices
The sources notice under the map is generated from the datasets actually loaded (name, owner, access date, licence link). Update `--accessed` when a dataset is re-downloaded. The OneMap logo and attribution are part of the map and must stay.

## Tests
    node research/tests/map-tests.js          # logic and data; set KPT_RAW=<raw folder> to also re-run the build validation
    python3 research/tests/map-render.py      # browser flows, desktop and phone (needs Playwright)
