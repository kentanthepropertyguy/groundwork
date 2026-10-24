# Monthly data refresh

One command rebuilds every page's data from the same development register (condos, ECs and cluster housing; `register.js` decides what is admitted and which class a development belongs to):

    node tools/market-data/refresh-all.js --raw <folder of the URA batch-*.json files> --as-of YYYY-MM-DD

It runs, in order: Research project data, Map data, FIND index, registry rows and their class, "Compare with" suggestions, the coverage metadata (the names Research leaves out on `research/index.html`, and the registry's different-class wording), and the market pulse for the Map (`data/map/pulse.json`, written by `build-pulse.js` from the same module and records as the Research report; `node research/tests/pulse-tests.js` checks every development). Nothing needs a manual edit afterwards.

It keeps `data/projects/inventory.json`, the agreed URA attribution wording in the live manifest (the project builder's own text is a PENDING placeholder), curated registry rows and `data/map/amen*.json`.

After it:

    node tools/market-data/tests/coverage-tests.js      # the generated pieces follow the register
    node tools/market-data/tests/project-tests.js
    node tools/market-data/tests/find-index-tests.js --raw <same folder>
    KPT_RAW=<same folder> node research/tests/map-tests.js
    node tools/market-data/build-coverage.js --raw <same folder> --check
    node tools/market-data/build-registry-classes.js --check

then bump the asset version hashes for any changed script. Adding or removing a property type from a class is done in `tools/market-data/config.json` (`classes`) only; `propertyTypes` must stay equal to the condo class (the build stops with a clear message if they differ).

## Also keep current (not part of `refresh-all.js`)

- Launches, sites and development positions are one pass (section 0 of `UPCOMING.md`): `fetch-onemap-uc.js`, `fetch-onemap-names.js`, this refresh, then `build-upcoming.js`.
- `node tools/market-data/build-upcoming.js --as-of YYYY-MM-DD` after editing `upcoming-register.json` or when URA publishes new Sale Sites; commit `data/map/upcoming.json`. See `UPCOMING.md`.
- `node tools/market-data/build-hdb-streets.js` after any HDB resale data refresh (HDB road to town, used by postal-code search on Property values).
- HDB block positions for the Map layer, after any HDB resale data refresh: `node tools/market-data/fetch-onemap-hdb.js` (live OneMap, only blocks not already saved; add `--retry` for the ones it could not place, and run it again if it reports blocks "not answered"), then `node tools/market-data/build-hdb-map.js`. Commit `sources/onemap-hdb.json` and `data/map/hdb.json`, report the coverage line, and run `node research/tests/hdb-tests.js`. Blocks OneMap cannot place stay out of the file; never fill them in by hand.
- `node tools/market-data/tests/upcoming-tests.js`, `node research/tests/postal-tests.js` and `node research/tests/hdb-tests.js`.
