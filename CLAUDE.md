# Groundwork: project development instructions

Groundwork (tools.kentanthepropertyguy.com) is a static site: plain HTML, CSS and JavaScript on GitHub Pages, no build step. These are the standing rules for any change, by a person or by Claude. Read them before editing.

## Answer first. Let people explore further.

This is the product principle. It applies to every page, current and future. Keep the interface simple even when the calculation behind it is sophisticated.

1. **The answer comes first.** The first screen, on a phone as well as a desktop, shows what the visitor came for: the development name and its property class, the price or evidence, or the matching developments. Background, method and explanation come after it.
2. **One predictable layout.** Use the Guide Me pages as the reference: one column, a stable search or selection control at the top, results below it, the same heading sizes, widths and spacing as the rest of Groundwork. Do not invent a new page layout, a new dashboard or a second navigation. Pages need not have identical functionality, only the same feel.
3. **Headings are modest.** Page title about 44px on desktop and 32px on a phone, section headings about 32px and 24px. Large display type never pushes the answer below the first phone screen.
4. **Explanations go in disclosures.** Methodology, definitions and long caveats live in a short contextual note or a "How this works" disclosure. Do not delete them, and do not put them in front of the answer.
5. **Limits stay next to the number.** Sample size, price basis (past sales, not a valuation, not a listing) and data-quality limits are shown beside the figure they qualify, in one plain line. Never only in a disclosure, and never repeated in several places.
6. **Fewer cards.** A card needs a reason: it holds one result the visitor will act on. Do not wrap every block in a card.
7. **Explore further, never in the way.** Secondary controls (radius, size, map, compare) sit under the answer and change it in place, without a page reload.
8. **Same rules for every property class.** Condominiums, Executive Condominiums (ECs), cluster housing and mixed developments get the same layout and the same wording discipline. A class is always shown, and prices of different classes are never pooled or compared with each other.
9. **Check it on a 390px phone** (and a desktop) before calling a change finished: what does the visitor see on the first screen?

## Data and meaning (do not change without being asked)

- Development classes come from the shared register (`tools/market-data/register.js`): `condo`, `ec`, `cluster`. Only that file decides admission and class.
- A "typical price" needs at least 5 sales across at least 3 months in a size band (`assets/js/kpt-evidence.js`); weaker evidence is labelled limited, not hidden.
- Past transaction prices are not active listings and not valuations. Say so briefly where prices are shown.
- Distances are straight-line and say so. A place with no map position is counted and named, never silently dropped.
- Analytics are bucketed and anonymous. Typed text, locations, budgets and development names are never sent to analytics or WhatsApp.
- Postal codes have ONE implementation, `assets/js/gw-postal.js` (OneMap lookup, messages, road and development matching); the Map, Budget Search and Property values all call it. Do not write a second lookup. It identifies a property; it never values one, and results from it are labelled past sales, not a valuation.
- The Map's radius is `RADII` in `kpt-map-core.js` (500 m, 1 km, 2 km, 3 km; 1 km default, never widened silently). New launches and GLS sites live in `data/map/upcoming.json` (see `tools/market-data/UPCOMING.md`): no prices or transactions, never a budget match, and an item without a verified position is searchable but not placed on the Map. The radius is offered on EVERY located selection (address, MRT, school, road, development, launch, site) through `placeData`; for a development it is the secondary "Explore nearby" section, with its own link key `nr`, and never changes the price comparison (`r`). The site search (`gw-nav.js`) takes postal codes through the same `gw-postal.js`; its version string inside `gw-nav.js` must be the hash of that file (postal-tests.js checks it). Launches and positions are one repeatable pass: see `tools/market-data/UPCOMING.md` section 0.
- Phone Map sheet (`.bs`): the name, essentials and the radius choices are pinned at the top (`.bs-hd`); the chevron minimises to a slim bar (`S.min`, keeps selection, marker, circle and radius), and × closes and clears. A new selection always opens in full. Research search lists registered launches from `upcoming.json` apart from transaction results (`KPTLG.findLaunches`), never with a price. Tests: `research/tests/mobile-sheet-render.py`, `research/tests/launch-search-tests.js`.
- Reuse before writing: the Map (`assets/js/kpt-map-core.js`, `kpt-map-view.js`) owns place search and map drawing, the Research engines own price evidence, `kpt-find.js` owns the budget shortlist. Other pages call them; they do not copy them.

## Working rules

- Every script and stylesheet reference carries `?v=<10 hex characters of the file's sha256>`; change a file and its references change with it. The Map files use one shared date version instead, and the budget tool must request the same one (a test checks).
- Data is rebuilt only with `tools/market-data/refresh-all.js` (see `tools/market-data/REFRESH.md`); do not hand-edit generated files.
- Run the test suites for what you touched, compare with the previous results, and fix a failure rather than editing its test. Browser tests stub the OneMap tiles, so look at the real Map once after a release.
- Keep releases small and independently testable. Do not bundle unrelated work (for example calculator retirement or Exit Analysis) into a UX or data change.
