# Bedroom types, URA-first (built locally 24 Oct 2026; not released)

Research by bedroom type (V1, approved by Ken 24 Oct 2026) reads `data/projects/bedroom/`, built from the ACCEPTED snapshot by `build-bedroom-research.js` ("Publishing to Research" below). Nothing else on the site reads these outputs, and Budget Search never infers bedrooms.

## Evidence, in order

1. **URA rental contracts** are the primary evidence (`rental-engine.js`). They cover every development and need no documents. A contract's size is where its sqm band and its sq ft band overlap. A sale whose whole-sqm area (±0.5) touches those contracts is **inferred** when all of these hold:
   - at least 5 contracts cover it;
   - at least 90% of them declare one bedroom count (20+ contracts at 95% is "strong");
   - its exact size sells often enough for those contracts to speak for it: at least 3 contracts' worth (`minExpected`).

   Otherwise the sale is left unclassified, as one of:
   - `mixed`: the contracts declare different bedroom counts;
   - `sparse`: fewer than 5 contracts;
   - `none`: no contract with a bedroom count, including URA's "NA";
   - `unrepresented`: the exact size sells too rarely relative to the contracts covering it.
2. **Developer layout tables** add coverage where rentals leave sales open, and check the rentals (`bedroom-engine.js`, `layout-quality.js`).
   - Every stated area is an interval of ± half its last digit.
   - A table is used only when it passes its URA check: it explains at least 90% of sale areas, has no incomplete rows, and at least 95% of compared rental contracts agree. A table marked `developer` or `approved` is also used.
3. **Never forced.** If the layouts at an area have different bedroom counts, the sale stays unclassified. If a usable table and the rentals disagree at an area, that is a **contradiction**: it is reported for review and never resolved by guessing.

The tiers come from `bedroom-hybrid.js`:
- **verified**: layout table, with no rental contradiction;
- **inferred**: rental contracts;
- **unclassified**: everything else, with a reason.

## The rental window: the latest 12 quarters (standard since 24 Oct 2026)

The classification reads URA rental contracts from the **latest 12 quarters** only (`rental-window.js`, `WINDOW_QUARTERS = 12`).
- **Why 12.** It was chosen from a bounded comparison of 4, 8, 12, 16 and 20 quarters. 12 classified more resales than 8 (76.2% of the latest 24 months' resales, up from 72.4%), with the same 8 disagreements with layout tables, the same 3 contradictions and no size changing bedroom count. At 16 and 20 quarters, rare layouts (penthouses, lofts) begin to pass the rare-size test, and disagreements rose from 8 to 26.
- **Enforced in code, whatever the folder holds.**
  - `readRaw` (`build-bedroom.js`), used by every bedroom tool, reads at most the latest 12 `rental-yyqq.json` files present. Older or stray files are ignored, so a refresh cannot widen the window by accident.
  - Any other size throws unless the run is explicitly a comparison (`--rental-quarters N --comparison`).
  - A comparison run cannot write `--public` output, and `publicView` refuses a report whose window is not the standard.
  - Every report records its window (`rentalWindow`: quarters used, missing quarters, how far it lags the sales data) and prints it.
- **Archive, kept apart.** `fetch-ura-rental.js` keeps the URA folder at exactly the window's quarters:
  - quarters that leave the window move to `<URA folder>/../rental-archive` (never deleted);
  - archived quarters the window needs are moved back.

  URA serves only the past 5 years, so the archive is the only copy of older quarters. Keep it for later testing.

## Measures: never read one as another (`bedroom-metrics.js`)

- **A. Coverage.** The share of sales that have a type, by period, segment, rental volume and reason. It says nothing about correctness.
- **B. Sales agreement.** Rental-inferred sales compared, sale by sale, with layout tables that explain 90%+ of a development's sale areas. That test does not use rentals, so tables are not chosen for agreeing with the rental engine. This is the only sales-level measure, and it covers only developments with a table.
- **C. Rental consistency.** Held-out rental *contracts* predicted from the others: random halves and a time split. It measures how consistently declarations repeat for a size. It is **not** sales accuracy and must never be presented as such.

## The brochure pass (`brochure-pipeline.js`): repeatable, source-independent, ranked by gain

```
node tools/market-data/brochure-pipeline.js --raw <URA folder> --layouts <private folder> --store <private store> --out <private folder> \
     --top 25 --ocr-pages 700 [--to YYYY-MM] [--dry-run]
```

1. **Sources** (`brochure-sources.js`, private `<store>/sources.json`). A source is used only when it records its permission (who allowed it, when, on what terms). Kinds:
   - `index`: a document index with sitemaps, such as cos.sg;
   - `url-list`: developer-hosted PDFs;
   - `folder`: files supplied directly;
   - `layout-export`: a table already in layout form, which skips extraction.

   Names are matched to URA names by `name-match.js`: exact, or exact once qualifier words are dropped. A name that fits two developments is never matched. robots.txt is obeyed and every fetch is cached (`fetch-cache.js`).
2. **Queue** (`brochure-queue.js`). A development's expected gain is its resales in the latest 24 months that are still unclassified, less those a document cannot settle (equal-area layouts with different counts, and contradictions). This is an upper bound. The realised gain is measured after the run.
3. **Read** (`brochure-ocr.js`). The text layer is read first; only pages without one get OCR, within a page budget. A development whose table is still not usable gets OCR of its text pages too. Pages read once are never read again.
4. **Extract** (`extract-positioned.js`, `brochure-batch.js`).
   - Labels are paired with areas by position, with unit-distribution charts and floor-plan titles filling the gaps.
   - Documents from different places (for example two index pages with one name) are checked apart, so a namesake's brochure cannot contaminate a table.
5. **Attempts** are recorded with the extractor version (`attempts.json`). A failed document is retried only when the extractor changes.

**Extractor changes** must pass `extractor-corpus.js` over every document read so far: the change must make at least 2 developments better and none worse. This is what stops one-brochure fixes. One per-page reading rule was tried, helped one development only, and was not kept.

## Refresh (manual for now: the URA-first steps are not in `refresh-all.js` until Ken approves wiring them in)

After each URA refresh, run these two steps in order:

```
URA_ACCESS_KEY=xxxx node tools/market-data/fetch-ura-rental.js --out <private URA folder>
node tools/market-data/bedroom-hybrid.js --raw <private URA folder> --layouts <private layouts> --extracted <private store>/extracted \
     --out <private reports>/<as-of> --to <data month YYYY-MM> --as-of <date> --previous <last accepted snapshot.json>
node tools/market-data/bedroom-metrics.js --raw <private URA folder> --report <private reports>/<as-of>/hybrid-report.json \
     --layouts <private layouts> --extracted <private store>/extracted --out <private reports>/<as-of>
```

1. **Fetch** (`fetch-ura-rental.js`). It fetches missing quarters and fetches the latest 2 again, because contracts reach URA after the lease starts. It then moves quarters outside the window to the archive. If URA has not published the last completed quarter yet, the window ends a quarter earlier. `--organise-only` reorganises the folder without the network.
2. **Classify** (`bedroom-hybrid.js --previous`). It prints `Rental contracts: 12 of 12 quarters (from–to)`.
   - A missing quarter is named.
   - A window more than one quarter behind the sales data says to run the fetch.
   - `changes.json` lists sizes whose bedroom count changed, coverage drops of 5+ points, new developments and contradictions.
3. **Check before accepting.**
   - The window is 12 of 12.
   - No size changed bedroom count, or each change has been looked at.
   - Contradictions have not risen.
   - Sales agreement with layout tables (`bedroom-metrics.js` B) shows no new disagreements.
   - Then keep the new `snapshot.json` as the next `--previous`.

**If a step is skipped.** Skipping the fetch only leaves the window stale: it ends at the newest quarter present, and the run says so. It never widens. Files copied into the URA folder by hand are ignored by the classification and moved to the archive by the next fetch.

The brochure pass is paused (Ken, 24 Oct 2026). Run it only when asked; it resumes where its page budget stopped.

## Publishing to Research (`build-bedroom-research.js`, V1)

Run after a classification run has been ACCEPTED (the checks above), with the same URA download as the Research data:

```
node tools/market-data/build-bedroom-research.js --raw <private URA folder> --snapshot <accepted snapshot.json> --site . --report <private folder>
```

- It does not classify. Each sale takes the accepted run's decision for its area (`v:` floor plans, `i:` URA rental records, null unclassified); the statistics are `bedroom-engine.js`'s (`analyse`, `cell`, `reading`).
- It refuses a comparison snapshot, any window but 12 quarters, a data month different from `data/projects/manifest.json`, and a `--report` folder inside the site.
- Published (`data/projects/bedroom/manifest.json` + `sNN.json`, sharded like `data/projects/detail`): aggregates only, resales only, per development and bedroom type. The gate is `bedroom-hybrid.js completeness()` (Claude C's review, 24 Oct 2026), applied unchanged:
  - the development has at least 70% of its latest-24-month resales classified;
  - the type has at least 5 classified resales in that window;
  - at most 20% of the type's POSSIBLE recent resales are unclassified. Every unclassified size carries `possible` (private): the counts declared by at least 10% of the URA rental contracts touching it (all declared counts under 5 contracts), else the counts of the nearest classified sizes below and above. The publish step works it out from the accepted snapshot and the same 12 rental quarters (`possibleFor`), so the URA folder must hold those quarters; the layout side of a contradiction (3 sizes) is the one part it cannot see without the layout tables.
  - A shown type also meets the typical-price rule (5 sales over 3 months) within 12 or 24 months. Types with under 5 classified recent resales are named, without figures; types withheld for coverage or ambiguity are not named.
  - Price movement is the Market Pulse reading on the type's most-sold 100 sq ft band (resales of that type in that band, inside the sizes shown), and only when the development's classified share is at least 70% in both years and differs by at most 15 points.
- The private report lists every development with what was published or withheld, and why.

## Private, always

URA raw files (the URA folder and `rental-archive`), the API key, documents, layout tables, `docs.csv`, the catalogue and every per-sale report stay outside the repository. Developers allow their floor plans to be used on Groundwork (Ken, 24 Oct 2026), but these tools publish nothing. `bedroom-hybrid.js --public` writes only aggregates per type, in the `gw-bedroom` v2 shape with each type's verified/inferred basis. Layout-verified types are written by default; `--allow-rental` adds rental-inferred ones. That file is a proposal for a later, approved release.

Tests: `tests/rental-window-tests.js`, `tests/rental-engine-tests.js`, `tests/brochure-pipeline-tests.js`, `tests/bedroom-engine-tests.js`, `tests/extract-layouts-tests.js`.
