# Adding a development's floor plans (sizes by bedroom type)

Developer floor plans tell the bedroom engine which bedroom type each recorded sale size is (`BEDROOM.md`). A development's Research page shows prices by bedroom type only when enough of its resales are classified. This is the repeatable way to add one development's plans.

Developers allow their floor plans to be used on Groundwork (Ken, 24 Oct 2026). The plans and the tables made from them stay **private**: never put either in the repository. The repository holds only the empty `floorplan-template.csv`; a test fails if any other CSV appears beside it.

## 1. Make the table (one development, one CSV)

Start from `floorplan-template.csv`. Add one row per layout the plans show, including every variant:

| Column | What to write |
|---|---|
| `project` | The URA name exactly, as in Research (e.g. `KINGSFORD WATERBAY`). |
| `code` | The plan's type code (`B2`, `B2-P`, `B2-PH`). |
| `bedrooms` | The bedrooms drawn on that plan, a whole number. Count them on the plan; a heading such as "Penthouse" does not say. |
| `variant` | Blank, `pes`, `penthouse`, `study`, `dual-key`, `loft`, `flexi`, `premium` or `other`. A penthouse is its own group: its prices are not compared with typical units. |
| `sqm`, `sqft` | The plan's stated area, as written. The engine uses sqm, or sqft when no sqm is stated. |
| `levels` | The storeys the layout is on, from the developer's unit list or distribution chart (`1-15`, or `16` for top-storey penthouses). Optional. Leave it blank when the documents do not say; never infer it from the URA sales. |
| `source` | An id for the document, listed in `sources.csv`. |
| `status` | `developer` for plans read from the developer's documents. |
| `note` | Anything a reviewer needs, e.g. the page number. |

The column order does not matter: the engine reads each table by its own header. A column name it does not know is reported by the check (step 2), never silently dropped.

Leave out shops, and houses that are not in the development's Research class.

Claude can draft the table from the PDFs. Every row must then be checked against its plan: the type, the area, the bedrooms counted on the drawing, and the storeys in the unit list.

## 2. Check it, before it goes anywhere

```
node tools/market-data/floorplan-check.js --layouts <table.csv> --sources <sources.csv>
```

The check needs no private URA data: it reads the published URA sales that Research already shows. Look for:

- **No IMPORT lines.** The header has every required column and no unknown one.
- **No issues**, and status `developer (publishable)`. Unreadable `levels` are issues.
- **The table explains 90% or more of the recorded sales.** If it doesn't, a size is missing or misread; the check lists every size no layout fits.
- **Sizes whose layouts are in different bedroom groups.** With levels, each is split by URA floor band. A size that is still mixed on a band stays unclassified there. This is expected, and never forced.
- **The preview, with and without levels:**
  - the latest 24 months' coverage against the 70% gate;
  - which bedroom types would be shown;
  - contradictions between the plans and the published rental labels;
  - contradictions at floor-dependent sizes, where the floor's layout differs from the published label. With the engine's default rule they stay unclassified (`--floor-rule B` previews the proposed alternative);
  - the penthouse group, which is never published as one pricing group.

The preview stands in the published labels for the rental contracts. They are the engine's previous output, not the contracts, so the private run in step 4 decides.

## 3. Put it in the private layouts folder (Ken's PC)

1. Copy `<development>.csv` into the private layouts folder. Every `.csv` there except `sources.csv` and `ranges.csv` is read, each by its own header.
2. Add its sources to that folder's `sources.csv`.
3. Run the check again with the folder:

   ```
   node tools/market-data/floorplan-check.js --layouts <table.csv> --sources <sources.csv> --folder <private layouts folder>
   ```

   It must say "the folder loads every row of this table". It reports a table the folder does not load, a second copy of the same development, or sources missing from the folder's `sources.csv`. (Before 5 Nov 2026 a table with a `levels` column loaded no rows at all, and nothing said so.)

## 4. Publish with the next bedroom refresh

Follow `BEDROOM.md`:

1. Classify: `bedroom-hybrid.js --previous …`.
2. Check before accepting:
   - `changes.json`: labels that change, including sizes split by floor band;
   - the report's `contradictions`;
   - the report's `floorDependent` list.
3. Run `build-bedroom-research.js`.
4. Run the transactions refresh, so each sale shows its bedroom type.

The development's Research page, its Map card and Budget Search all read the same outputs. They change only through a normal Groundwork release (tests, release ZIP, approval).

Tests: `tools/market-data/tests/floorplan-check-tests.js` and `tools/market-data/tests/bedroom-levels-tests.js` (synthetic data only).
