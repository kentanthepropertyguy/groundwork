# Interactive Map data

The map page is `research/map/`. It reads static files from `data/map/`. Nothing here changes the Research pages or any calculator.

| File | Made by | When | Contents |
|---|---|---|---|
| `places.json`, `ev.json` | `tools/market-data/build-map-data.js` | every month, with the Research build | project positions; size-band cells for Primary (New Sale) and Secondary (Sub Sale + Resale); up to 6 recent sales for thin markets |
| `amen.json` | `tools/map-data/build-amenities.py` | once a year, or when a source dataset is refreshed | MRT/LRT stations (LTA), food centres (NEA), parks (NParks), planning areas (URA), all under the Singapore Open Data Licence v1.0 |
| `amen-extra.json` | same script, `--publish-extra` | once a year, with `amen.json` | schools (MOE) and supermarkets (NEA licences): name, level, position only |

## Monthly (after `build-project-stats.js`, same raw files)
    node tools/market-data/build-map-data.js --raw tools/market-data/raw --out data/map --as-of YYYY-MM-DD
It recomputes every cell and compares it with the live Research cells in `data/projects`. It stops (non-zero exit) on any mismatch, if a Research project is missing, or if the latest month differs.

## Schools and supermarkets
The two source lists (data.gov.sg, Singapore Open Data Licence v1.0) carry no coordinates. Positions come from a one-off OneMap postal-code search (cached in `geocache.json`, kept out of the site folder). OneMap's API terms place its datasets under the same Open Data Licence, which allows copying, distributing and adapting with a source notice, so the positions are published with a OneMap / Singapore Land Authority line in the sources notice. Nothing else from OneMap is stored (no addresses, no postal codes).
To drop the layer without touching code, re-run the script without `--publish-extra` (it then writes the file outside the site folder and sets `"extra": null`); the page works without it.
Non-chain supermarket licensee names are never published (the word "Supermarket" is used instead).

## Notices
The sources notice under the map is generated from the datasets actually loaded (name, owner, access date, licence link). Update `--accessed` when a dataset is re-downloaded. The OneMap logo and attribution are part of the map and must stay.

## Tests
    node research/tests/map-tests.js          # logic and data; set KPT_RAW=<raw folder> to also re-run the build validation
    python3 research/tests/map-render.py      # browser flows, desktop and phone (needs Playwright)
