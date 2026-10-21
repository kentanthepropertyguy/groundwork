# New launches, GLS sites, development positions and postal codes

This note says where the Map's launches, sites and development positions come from, and how to keep them current in one repeatable pass.

## 0. The one refresh pass

A project is one record that moves through stages: **GLS site → named upcoming project → launched development → established development**. The stages are never separate Map entries; the id stays the same and the old names stay searchable as aliases.

Run, in this order (the first three need the internet; the rest work from the saved files):

    node tools/market-data/fetch-onemap-uc.js                  # OneMap's "(U/C)" building records -> sources/onemap-uc.json
    node tools/market-data/fetch-onemap-names.js               # OneMap records by name+road for developments still without a position -> sources/onemap-names.json
    node tools/market-data/refresh-all.js --raw <URA folder> --as-of YYYY-MM-DD    # monthly: includes build-positions.js
    node tools/market-data/build-upcoming.js --as-of YYYY-MM-DD   # -> data/map/upcoming.json (reads the saved OneMap files and sources/parcels.json)

Then `node tools/market-data/tests/upcoming-tests.js`, `node research/tests/map-tests.js`, `python3 research/tests/followup-render.py`, `node research/tests/launch-search-tests.js`, `python3 research/tests/mobile-sheet-render.py`, and commit the data files. `build-upcoming.js` prints a **review list**: OneMap projects under construction that are in no listed site and not in the development register. If one is a home you can verify, add it to the register (section 1).

Offline (for example when a tool cannot reach OneMap): `fetch-onemap-uc.js --from <saved results>` and `fetch-onemap-names.js --from <saved { id: results }>` rebuild the cache from files; `build-upcoming.js --ura <geojson> --ura-updated YYYY-MM-DD --as-of YYYY-MM-DD` takes the URA file.

### What each source can and cannot do

| Source | Gives | Limit |
|---|---|---|
| URA Sale Sites (data.gov.sg `d_0e2b42f98535686282031a42c9c7b05a`) | URA residential and mixed GLS sites: boundary, award date, area, homes, tenderers | **No HDB sites**, and no project names |
| OneMap `(U/C)` records (`sources/onemap-uc.json`) | The marketing name and block positions of projects being built, sales or none | Only once OneMap has the building records; a launch can be days ahead of them |
| OneMap by name and road (`sources/onemap-names.json`) | Positions for completed developments URA gives no coordinates for | First page (10 records) per name; the name and the road must both match |
| URA Master Plan 2025 land-use layer (`sources/parcels.json`) | The parcel of an HDB site, checked against the published site area | Hand-run per site (`extract-parcel.js`); the layer is 190 MB so it is not in the repository |
| The developer's or HDB's own release | Facts, dates, homes | Written into the register by hand, listed first under `sources` |

### Verifying an HDB (or any off-dataset) site

Nothing is placed by eye. `extract-parcel.js` looks for the Master Plan parcel that (1) has the described zoning, (2) lies near the place the release names, (3) has the area the release publishes, within 0.5 %, and (4) is the only such parcel. Its rings are saved to `sources/parcels.json` with the zoning, the area and where the published area came from; the register entry uses `position: { "type": "parcel", "id": "<id>" }`. Do not treat a OneMap `NAME (U/C)` label as the parcel: it marks the buildings under construction, which may be beside the site.

    node tools/market-data/extract-parcel.js --mp <mp2025-landuse.geojson> --id chencharu-close --near 1.416,103.829 --radius 900 --use "COMMERCIAL & RESIDENTIAL" --area 29450 --area-source "HDB release, 22 May 2025"

### Positions for launched developments

URA publishes no coordinates for most new launches. `build-positions.js` (run by `refresh-all.js` after the Map data) fills them from OneMap's own records for the project: the name must match exactly, the postal sector must be in the district URA gives, all records must lie within 600 m of their middle, and the position is that middle. Which developments were placed this way, and from which records, is in `data/map/positions-onemap.json`. Where a development's marketing name is not the name OneMap holds for its building (Newport Residences is the residential part of Newport Plaza; Skywaters Residences is at THE SKYWATERS, 8 Shenton Way), `sources/position-links.json` links them by hand, citing the published source and the postal codes to use; `fetch-onemap-names.js` reads it. Add an entry only when a source states the link. A development OneMap has no record of stays unpositioned: searchable, with prices, but not on the Map and never given a guessed point.

## 1. The upcoming-project register (new launches and GLS sites)

A launch or an awarded Government Land Sales (GLS) site has no URA sales yet, so it is not in the development register (`data/registry/index.json`, built from URA transactions). It is kept in its own register and loaded into the Map as a development with **no transactions**. It needs **no Ken microsite, Huttons price or resale history** to appear.

| File | What it is |
|---|---|
| `tools/market-data/upcoming-register.json` | **Edit this.** Hand-verified entries (any named project, HDB sites, launches OneMap does not list yet) plus the rules for the automatic sites. |
| `tools/market-data/build-upcoming.js` | Builds the data file below. |
| `data/map/upcoming.json` | **Generated. Commit it.** Loaded by the Map, Budget Search, the site search and Research search (a launch with no sales is listed there without prices and opens on the Map). |

What the register never holds: prices, transactions, unit counts or availability. A launch or site is therefore never a budget match, never in a price comparison and never in a "with recorded sales" list. It appears as "New launch or site" (a hollow marker) when it is near a place, in the nearby list of a selected place or development, or when searched for by name or alias.

### Fields of an entry

`id`, `name`, `kind` (`launch`, `gls` for a site that is a named project in its own right, or `project` for a URA site that OneMap now lists under a marketing name), `agency` (`HDB` for an HDB site; URA is the default), `stage` (`awarded`, `under-construction`, `launched`), `district`, `tenure`, `registry` (the id of its Research page, when it has one), `microsite` (only when one exists; with none, the panel shows no marketing link), `position`, `facts` (label and text pairs), `sources` (label and https address; the developer's own document comes first), `aliases` (other names people search by, such as "Serra Residences" for "The Serra Residences"), `nameStatus: "reported"` (the name is reported but not confirmed).

`position` is how the verified coordinates are found: `{ "type": "onemap", "query": "THOMSON RESERVE", "building": "(U/C)" }` uses OneMap's records for the project (the centre of its blocks); `{ "type": "parcel", "id": "chencharu-close" }` uses the verified Master Plan parcel in `sources/parcels.json`; `{ "type": "ura" }` uses the interior point of the URA site boundary; `null` means no verified position, with `positionNote` saying why. An entry with no verified position stays searchable but is not placed on the Map.

### Adding a launch

1. Add an entry to `upcoming-register.json`. Use the developer's own document for the facts and list it first under `sources`. If a news report contradicts it, keep the developer's figure and say so in the facts.
2. Run `node tools/market-data/build-upcoming.js --as-of YYYY-MM-DD`.
3. `node tools/market-data/tests/upcoming-tests.js`, then commit `data/map/upcoming.json` with the register.

### Automatic sites, at any age

Residential and mixed-use sites in URA's "Sale Sites" file are listed **at any age**, until they are resolved: a development with URA sales sits inside the site, its URA completion year has passed, it is listed under an entry's `ura` (`"DATE_AWARD|LOCATION"`), or it is in `auto.resolved` in the register (`"DATE_AWARD|LOCATION": reason`). When OneMap lists one project name "(U/C)" inside the site boundary, the site takes that name (same id, kind `project`, and the old "<Location> GLS site" name kept as an alias); otherwise it is called "<Location> GLS site" and says it has no project name yet. Put a site you do not want in `auto.skip`.

When a named project gets its first URA sale, the transaction register takes over: the builder and the Map skip the entry by id or name, so it never appears twice. Delete the entry then (the builder warns).

### Remaining limits

- HDB residential, mixed-use and EC sites are in no dataset: each is added by hand with a verified parcel (Chencharu Close and Hougang Central are).
- A launch OneMap has no building record for yet is added by hand until it does.
- The OneMap and parcel caches change only when a person runs the fetch scripts.

## 2. Postal codes (`assets/js/gw-postal.js`)

One module, used by all three pages, so a six-digit code means the same thing everywhere (same lookup, same messages, same way of reading the address). It only finds *which property an address is*. It never values anything.

- **Lookup:** OneMap's public address search (`elastic/search`), filtered to the exact postal code. A typed code is sent to OneMap, which already serves the Map's basemap. Successful answers are remembered for the page; failures are not. A 7-second timeout, then "Postal codes could not be looked up just now". Sectors 01 to 82 only; anything else is refused without a call.
- **Site search (homepage, header, menu):** `gw-nav.js` loads this module only when a six-digit code is typed, then sends the address where it belongs: HDB block or landed home → `journey/worth/#pc=<code>` (Property values opens it), condo/EC/cluster → its Research page, launch or site → the Map, any other address → the Map; "View on Map" is always the second choice. Keyword searches are unchanged.
- **Map and Budget Search:** the address becomes a place; the same radius choices apply (500 m, 1 km, 2 km, 3 km, 1 km by default).
- **Property values:** `devMatch` finds the development (exact name; a near name only on the same road); `hdbTowns` finds the HDB town from `data/value/hdb/streets.json`; a landed street is found by road. A block, ambiguity or a missing match is shown, never guessed. Results are labelled as past sales and indicative, not an official HDB or formal valuation.

### Maintenance

- **`data/value/hdb/streets.json`** maps each HDB road to its town. Rebuild it after any HDB data refresh: `node tools/market-data/build-hdb-streets.js`.
- **Road spellings:** OneMap writes "AVENUE", HDB writes "AVE". The abbreviation table in `gw-postal.js` (`ABB`) reconciles them. If a road fails to match after a refresh, add its abbreviation there and rerun `build-hdb-streets.js`.
- **Tests:** `node research/tests/postal-tests.js` runs against 30 real OneMap answers saved in `research/tests/fixtures/onemap-postal.json`, so it needs no internet. To add a case, save the live response for that code into the fixture.
- If OneMap changes its address endpoint, only `ONEMAP` and `lookup` in `gw-postal.js` change; the three pages follow.
