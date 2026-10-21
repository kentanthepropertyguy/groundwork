# Monthly data refresh

One command rebuilds every page's data from the same development register (condos, ECs and cluster housing; `register.js` decides what is admitted and which class a development belongs to):

    node tools/market-data/refresh-all.js --raw <folder of the URA batch-*.json files> --as-of YYYY-MM-DD

It runs, in order: Research project data, Map data, FIND index, registry rows and their class, "Compare with" suggestions, and the coverage metadata (the names Research leaves out on `research/index.html`, and the registry's different-class wording). Nothing needs a manual edit afterwards.

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

- `node tools/market-data/build-upcoming.js --as-of YYYY-MM-DD` after editing `upcoming-register.json` or when URA publishes new Sale Sites; commit `data/map/upcoming.json`. See `UPCOMING.md`.
- `node tools/market-data/build-hdb-streets.js` after any HDB resale data refresh (HDB road to town, used by postal-code search on Property values).
- `node tools/market-data/tests/upcoming-tests.js` and `node research/tests/postal-tests.js`.
