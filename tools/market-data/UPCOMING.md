# New launches, GLS sites and postal codes

Phase 3 added two things to the Map, Budget Search and Property values & market prices. This note says where each comes from and how to keep it current.

## 1. The upcoming-project register (new launches and GLS sites)

A launch or an awarded Government Land Sales (GLS) site has no URA sales yet, so it is not in the development register (`data/registry/index.json`, built from URA transactions). It is kept in its own small register and loaded into the Map as a development with **no transactions**:

| File | What it is |
|---|---|
| `tools/market-data/upcoming-register.json` | **Edit this.** One entry per named project, plus the rules for automatic GLS sites. |
| `tools/market-data/build-upcoming.js` | Builds the data file below. |
| `data/map/upcoming.json` | **Generated. Commit it.** Loaded by the Map and by Budget Search. |

What the register never holds: prices, transactions, unit counts or availability. A launch or site is therefore never a budget match, never in a price comparison and never in a "with recorded sales" list. It appears only as "New launch or site" (a hollow marker) when it is near a place, or when searched for by name.

### Fields of an entry

`id`, `name`, `kind` (`launch` or `gls`), `stage` (`awarded`, `under-construction`, ...), `district`, `tenure`, `registry` (the id of its Research page, when it has one), `microsite` (a Groundwork microsite name), `position`, `facts` (label and text pairs), `sources` (label and https address; the developer's own document comes first), `aliases` (other names people search by), `nameStatus: "reported"` when a marketing name comes from news and not from the developer, and `ura` (the URA Sale Sites records the entry stands for).

`position` is how the verified coordinates are found: `{ "type": "onemap", "query": "THOMSON RESERVE", "building": "(U/C)" }` uses OneMap's structured address records for the project (the centre of its blocks); `{ "type": "ura" }` uses the interior point of the URA site boundary; `null` means no verified position, with `positionNote` saying why. **An entry with no verified position stays searchable but is not placed on the Map, and no position is ever guessed.** Hougang Central is the current case (sold by HDB; no boundary in the data we use, and no OneMap record yet).

### Adding a launch

1. Add an entry to `upcoming-register.json`. Use the developer's own document for the facts and list it first under `sources`. If a news report contradicts it, keep the developer's figure and say so in the facts.
2. Run (online, it fills the OneMap positions; offline, point it at saved answers):

       node tools/market-data/build-upcoming.js --as-of YYYY-MM-DD
       node tools/market-data/build-upcoming.js --ura <sale-sites.geojson> --ura-updated YYYY-MM-DD --onemap-cache <cache.json> --as-of YYYY-MM-DD    # offline

3. `node tools/market-data/tests/upcoming-tests.js`, then commit `data/map/upcoming.json` with the register.

### GLS site becomes a named project (no duplicates)

Awarded residential sites are added **automatically** from the URA "Sale Sites" GeoJSON (data.gov.sg, dataset `d_0e2b42f98535686282031a42c9c7b05a`) when they were awarded in the last 12 months and no development in the transaction register sits inside the site boundary. They carry no project name, and are called "<Location> GLS site".

When a site gets a name, add an entry for it and put the URA record under that entry's `ura` (`"DATE_AWARD|LOCATION"`, as in One Chuan Grove). The builder then drops the automatic site, so the site and the named project are one record. Once the project has URA sales, the builder skips it (by id or by name) and the transaction register takes over; delete the entry then. A site you do not want listed goes in `auto.skip`.

### Sources

- URA Sale Sites GeoJSON (data.gov.sg): site boundaries, award dates, land use, area, tenders. HDB-sold sites are not in it.
- OneMap address search (Singapore Land Authority): the position of an under-construction project.
- The developer's own release or document for a launch's facts.

## 2. Postal codes (`assets/js/gw-postal.js`)

One module, used by all three pages, so a six-digit code means the same thing everywhere (same lookup, same messages, same way of reading the address). It only finds *which property an address is*. It never values anything.

- **Lookup:** OneMap's public address search (`elastic/search`), filtered to the exact postal code. A typed code is sent to OneMap, which already serves the Map's basemap. Successful answers are remembered for the page; failures are not. A 7-second timeout, then "Postal codes could not be looked up just now". Sectors 01 to 82 only; anything else is refused without a call.
- **Map and Budget Search:** the address becomes a place; the same radius choices apply (500 m, 1 km, 2 km, 3 km, 1 km by default).
- **Property values:** `devMatch` finds the development (exact name; a near name only on the same road); `hdbTowns` finds the HDB town from `data/value/hdb/streets.json`; a landed street is found by road. A block, ambiguity or a missing match is shown, never guessed. Results are labelled as past sales and indicative, not an official HDB or formal valuation.

### Maintenance

- **`data/value/hdb/streets.json`** maps each HDB road to its town. Rebuild it after any HDB data refresh: `node tools/market-data/build-hdb-streets.js`.
- **Road spellings:** OneMap writes "AVENUE", HDB writes "AVE". The abbreviation table in `gw-postal.js` (`ABB`) reconciles them. If a road fails to match after a refresh, add its abbreviation there and rerun `build-hdb-streets.js`.
- **Tests:** `node research/tests/postal-tests.js` runs against 28 real OneMap answers saved in `research/tests/fixtures/onemap-postal.json`, so it needs no internet. To add a case, save the live response for that code into the fixture.
- If OneMap changes its address endpoint, only `ONEMAP` and `lookup` in `gw-postal.js` change; the three pages follow.
