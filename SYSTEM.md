# Ken Property Tools — System Rulebook

This file is the single source of truth for how every page on
**tools.kentanthepropertyguy.com** is built. It has two audiences:

- **Ken** — Part A explains how to maintain the site without coding.
- **Claude** — Part B is the rulebook. When Ken says *"Create a new
  [project analysis / calculator / comparison / guide] for X using my Ken
  Property Tools system"*, follow Part B exactly and do not ask Ken to
  re-explain any of it.

Last updated: 4 Oct 2026 (Phase 2 · HDB Upgrade Calculator V1 live · Design v2.1 locked)

---

## PART A — FOR KEN

### The two layers

| Layer | Address | Purpose |
|---|---|---|
| 1. Ken Property Tools (this repo) | `tools.kentanthepropertyguy.com` | Permanent research hub: calculators, comparisons, project analysis, guides |
| 2. Marketing microsites (separate repos) | `lucernegrand.`, `units.thomsonreserve.`; `hougangcentral.` planned (not live) | Campaign landing pages for ads. They link *into* relevant hub tools |

Layer 2 sites are not modified by this repo. They appear in the hub as
"Project site ↗" cards that link out.

### The everyday jobs

| I want to… | Do this |
|---|---|
| Launch a tool that's built | `data/tools.js` → change `status: "coming-soon"` to `status: "live"` |
| Feature a tool on the homepage | `data/tools.js` → add `popular: true` |
| Change the tools shown for a homepage goal | `data/tools.js` → edit that journey's `tools` list (order = step order) |
| Update a project's prices / PSF / availability | `data/projects/<slug>.js` → change the numbers **and** `data_as_of` |
| Change WhatsApp number, TikTok, CEA details | `assets/js/kpt.js` → the `CONFIG` block at the top |
| Change brand colours or fonts | `assets/css/kpt.css` → section 1 "Brand tokens" |
| Add a brand-new tool | Ask Claude, using the sentence above. Claude follows Part B |

After editing on GitHub: **Commit changes** → live in about a minute.

### Checking tracking works

Add `?kpt_debug=1` to any page address, open the browser console
(right-click → Inspect → Console) and every event prints as it happens.
Opening pages from your own computer never sends analytics data, so
testing never pollutes your reports.

### One-time setup checklist

- [ ] Create repo `ken-property-tools`, upload all files
- [ ] Settings → Pages → Deploy from branch `main`, folder `/ (root)`
- [ ] DNS: add a `CNAME` record `tools` → `<your-github-username>.github.io`
- [ ] Settings → Pages → tick **Enforce HTTPS** once the certificate appears
- [ ] Upload a 1200×630 share image to `assets/images/brand/og-default.jpg`
- [ ] GA4 → Admin → Custom definitions → register the custom dimensions
      listed in B6 (otherwise parameters won't appear in reports)
- [ ] GA4 → Admin → Events → mark `whatsapp_click` as a **key event**
- [ ] Meta Events Manager → check `Contact` events arrive from this domain

### What GitHub Pages can't do (by design)

- No server, database, logins or form inbox. Enquiries go via WhatsApp.
- The repo is **public**. Never upload client data, CRM exports or internal notes.
- One custom domain per repo, so each microsite stays its own repo.
- No real redirects. If a URL ever has to change, leave a small page at the
  old address that forwards (Claude can make one).
- Keep images under ~300 KB each; site limit is about 1 GB.

---

## PART B — FOR CLAUDE: THE RULEBOOK

### B1. Stack (non-negotiable)

- Plain HTML, CSS and vanilla JavaScript. Hosted on GitHub Pages.
- **No** React, Next.js, Vue, Tailwind, npm packages, bundlers, build steps,
  databases or frameworks. No new third-party scripts beyond GA4, Meta Pixel
  and Google Fonts without Ken's approval.
- Every page links the shared files; never copy their contents into a page:
  - `assets/css/kpt.css` — all styling
  - `data/tools.js` — the registry (`window.KPT_TOOLS`, `window.KPT_JOURNEYS`)
  - `assets/js/kpt.js` — analytics, header/footer, CTAs, WhatsApp, events
- Data files are `.js` files that set a `window.` variable (not `.json`), so
  pages also work when opened directly from a computer.
- **Relative paths only** (`../../assets/...`), never root paths (`/assets/...`).
  Exception: `404.html`.
- Page-specific CSS is allowed in a small `<style>` block only when no
  shared class fits. If a pattern will be reused, add it to `kpt.css` instead.

### B2. Folder structure

```
ken-property-tools/
├── index.html                    homepage
├── SYSTEM.md                     this file
├── CNAME  .nojekyll  404.html  robots.txt  sitemap.xml  README.md
├── calculators/index.html        section page (auto-lists category)
│   └── <slug>/index.html         one calculator
├── compare/index.html
│   └── <slug>/index.html
├── projects/index.html
│   └── <slug>/index.html
├── guides/index.html
│   └── <slug>/index.html
├── privacy/index.html
├── data/
│   ├── tools.js                  registry + journeys
│   ├── projects/<slug>.js        one data file per project
│   ├── rules/                    shared GOVERNMENT rules (regulatory only)
│   │   ├── stamp-duty.js         BSD bands, ABSD rates, remission, payment timing
│   │   ├── loan-limits.js        TDSR, stress-test rate, LTV tiers, tenure
│   │   ├── cpf-housing.js        CPF refund, accrued interest, 55+ rules, retirement sums
│   │   ├── hdb.js                MOP
│   │   └── gst.js                GST rate
│   └── assumptions/              KPT estimates & planning assumptions (NOT rules)
│       └── hdb-upgrade.js        mortgage rate, selling costs, fees, Ken's Planning Budget
├── assets/
│   ├── css/kpt.css
│   ├── js/kpt.js
│   └── images/
│       ├── brand/                logo, favicon, og-default.jpg
│       └── projects/<slug>/      project images, og.jpg
└── templates/                    starter pages (noindex, blocked in robots.txt)
    ├── calculator/index.html
    ├── project/index.html
    ├── compare/index.html
    └── guide/index.html
```

Every page is a folder containing `index.html`, so URLs are clean:
`tools.kentanthepropertyguy.com/calculators/affordability/`.

### B3. Naming

- **Slug** (folder name): lowercase, hyphens, no dates. `hdb-upgrade`, `lucerne-grand`.
- **Tool id** (registry `id` and `data-tool-name`): descriptive, unique,
  permanent once live. Calculators end in `-calculator`, guides in `-guide`,
  projects use the project slug, comparisons use the slug.
  e.g. `hdb-upgrade-calculator`, `lucerne-grand`, `new-launch-vs-resale`.
- **Never rename a live id** — it would split the analytics history.

### B4. Recipe: adding any new tool

1. Copy `templates/<type>/index.html` to `<section>/<slug>/index.html`.
   Template depth matches real depth, so `../../` paths work unchanged.
2. On `<body>`, set `data-page-type`, `data-tool-name`, `data-tool-title`,
   `data-tool-category`, and for projects `data-project-name`.
3. Fill in `<title>`, meta description, canonical URL and og tags.
   **Delete the `noindex` line and the `.kpt-template-note` paragraph.**
   Replace every piece of template copy with consumer-facing wording (B8a).
4. Write the content (see B5 for each type).
5. Add the entry to `data/tools.js` with `status: "live"` and `updated`.
   Add it to one or more journeys if it fits a homepage goal.
6. Add the URL to `sitemap.xml`.
7. Check: mobile layout at 390px, `?kpt_debug=1` shows the view event,
   `tool_started` on first input, `tool_completed` on result, and the
   WhatsApp link opens with the right message.
8. Deliver the new/changed files only, with a one-line list of what to upload where.

### B5. Page types and their standard layout

Every page, top to bottom:
`data-kpt-header` → `data-kpt-breadcrumb` → hero (eyebrow, h1, lead, "as of"
date) → **content** → `data-kpt-cta` → `data-kpt-next` → disclaimer →
`data-kpt-footer` → scripts.

**Calculator**
- Inputs in a `<form class="kpt-form" data-kpt-inputs>` (required for `tool_started`).
- Result in `.kpt-result` beside inputs (`.kpt-tool` grid), with the
  `data-kpt-cta data-cta="after-result"` immediately under the result.
- Calculate live as inputs change; sensible Singapore defaults pre-filled.
- After showing a result call `KPT.completed({...})` and
  `KPT.setWaContext('My estimate showed …')` so Ken sees the numbers in WhatsApp.
- "Ken's take" box + "How this is calculated" section with official sources.
- Government rules (ABSD, BSD, TDSR, MSR, LTV, stress-test rate) come from
  `data/rules/*.js` — never hard-code them in a calculator. If the file is
  unfilled, fill it from IRAS/MAS/HDB official pages with `effective_from`,
  `source` and `verified_on`, and show "Rates effective <date>" on the page.

**Project analysis**
- Data in `data/projects/<slug>.js` (copy `_example.js`). Loaded before `kpt.js`.
- Project name, location and the written analysis go **in the HTML** (SEO).
  Changing numbers go in the data file.
- Standard blocks: key-number tiles `data-kpt-facts`, Ken's take, pricing
  table `data-kpt-units`, sources `data-kpt-sources`, PSF comparison bars
  `data-kpt-comparables`, details table using `data-kpt-field="<key>"`,
  written sections, CTA `data-cta="after-analysis"`.
- Always show `Data as of` from `data_as_of`.
- Never state figures that aren't sourced. Unknown → `null` (shows "—").

**Comparison**
- Short answer tiles ("A suits… / B suits…") → `.kpt-table--compare`
  side-by-side table → Ken's take → trade-offs prose → CTA `data-cta="after-comparison"`.
- Interactive comparisons follow the calculator rules for inputs/events.

**Guide**
- `<article class="kpt-prose">`, contents box `.kpt-toc`, short sections,
  at least one Ken's take, links to relevant calculators, CTA `data-cta="end-of-guide"`.

### B6. Analytics (handled by kpt.js — do not add tracking code to pages)

IDs (in `CONFIG`): GA4 `G-PGTYDENS24` · Meta Pixel `525622514314902`.
Every event goes to both GA4 (`gtag event`) and Meta (`trackCustom`).

| Event | Fires when | Extra params |
|---|---|---|
| `project_view` / `tool_view` / `comparison_view` / `guide_view` | page loads (by `data-page-type`) | — |
| `journey_select` | homepage goal tapped | `journey` |
| `tool_started` | first change inside `[data-kpt-inputs]` | — |
| `tool_completed` | `KPT.completed()` after visitor has interacted (once per visit) | anything passed, e.g. `result_value` |
| `whatsapp_click` | any `[data-kpt-wa]` link (+ Meta standard `Contact`) | `cta_location`, `journey` |
| `tiktok_click` | any `[data-kpt-tiktok]` link | `cta_location` |
| `microsite_click` | outbound card to a Layer 2 site | `target_tool` |
| `related_tool_click` | "Next step" or journey-path card | `target_tool`, `from` |

Standard params on every event: `page_type`, `tool_name`, `tool_category`,
`project_name` (when set).
GA4 custom dimensions to register (event scope): `tool_name`,
`tool_category`, `project_name`, `page_type`, `cta_location`, `journey`,
`target_tool`. For the HDB Upgrade Calculator also: `budget_band`, `planning_band`,
`limiting_factor`, `planning_limit`, `buyers`, `buyer_profile`, `age_55_flag`,
`refund_estimated`. Never send exact incomes, prices or other personal figures
to analytics — only rounded bands and categories.

New event names: lowercase_with_underscores, verb at the end
(`*_view`, `*_click`, `*_started`, `*_completed`). Add them to this table.

Layer 2 microsites should load the same GA4 and Pixel IDs so a visitor's
path across subdomains shows as one journey (same root domain).

### B7. WhatsApp CTA

- Number: `6590908898`. Built automatically from `data-kpt-wa` elements.
- Tone: helpful, never pushy. No "Act now", "Limited units", countdowns,
  pop-ups, or sticky "Contact me" bars. CTAs appear after value is delivered.
- Default headings (by page type, in `kpt.js`):
  - calculator: "Want me to run this on your actual numbers?"
  - project: "Want to understand the options for you?"
  - compare: "Need help comparing the numbers?"
  - guide: "I can help you work through your actual situation."
  Override per box with `data-cta-heading` / `data-cta-text`.
- Message templates (auto):
  - calculator: *Hi Ken, I was using your {title} and would like some help with my situation.*
  - project: *Hi Ken, I was looking through your {project} analysis and would like to understand the options.*
  - compare: *Hi Ken, I was using your {title} comparison and would like help comparing the numbers.*
  - guide: *Hi Ken, I was reading your {title} and have a few questions about my situation.*
  - Each ends with any `KPT.setWaContext()` text and ` (ref: {tool_name})`
    so the lead source can be tagged in the CRM.
- Override a page's message with `data-wa-message` on `<body>`.
- Every CTA box also offers TikTok LIVE (nightly 8–9.30pm, `@kennx8898`).

### B8. Design system — v2.1 (LOCKED)

**Status: approved and locked by Ken on 4 Oct 2026.** Every new page and tool
uses this system as-is. Do not redesign, restyle, add new colours, fonts or
component looks, or "refresh" the visual language unless Ken explicitly asks
for a design change. New needs are met by reusing the components below; if a
genuinely new component is required, build it from the existing tokens and
patterns, add it to `kpt.css`, and document it here.

The homepage and the calculator template are the visual reference pages.

**Direction:** an Apple-inspired premium product interface, not a property
agent site and not a bank form. Do not copy Apple's website; use the
principles. The visitor should think "Ken has actually analysed this."

**Principles**
- Generous white space. On desktop, sections sit ~96px apart; on phones ~56px.
- Strong hierarchy: one very large headline, a calm lead line, then content.
- Fewer borders. Separate things with space, soft shadows and surface
  colour, not outlines. Hairlines (`--line`) only inside lists and tables.
- **Not everything is a card.** Cards are for things that genuinely group or
  are chosen (journey choices, featured tools, projects, the calculator
  panel, tables). Long sets of tools use `.kpt-list` / `.kpt-list--2`
  typographic rows. Closing CTAs and Ken's take are typography on the page.
- Soft neutral background (`--bg` #F5F5F7) with white cards (`--surface`).
- Rounded everything: cards 18–24px, inputs 14px, buttons and badges are pills.
- Subtle depth: `--shadow-1` at rest, `--shadow-2` on hover. Never heavy.
- Restrained colour. Neutrals do most of the work.
  - **Navy** `--navy`: key numbers, selected states, primary buttons, the
    project's own bar in comparisons. Never large filled panels.
  - **Gold**: reserved for the letter inside the navy K monogram. Nowhere else.
    Eyebrows and small labels are grey/navy, not gold.
  - **WhatsApp green** `--wa` for WhatsApp buttons only.
  - `--good` / `--bad` only for positive/negative numbers.
- Smooth, subtle motion: cards lift 3px on hover, buttons press to 97%,
  panels fade up. Respect reduced-motion settings (already in kpt.css).

**Typography**
- One sans-serif family: system font (SF Pro on Apple devices) with Inter
  as the web font elsewhere. Load only `Inter:wght@400..700` from Google Fonts.
  No serif fonts.
- Headlines bold (700) with tight tracking; h1 up to 72px desktop / 36px phone.
- Body 17px. Numbers use tabular figures.

**Calculators should feel like a consumer product, not a form**
- Inputs are large soft wells (`.kpt-input`, 58px tall, 22px bold text),
  no borders; focus shows a navy ring.
- Use segmented controls (`.kpt-segment`) for 2–4 choices, sliders
  (`.kpt-range`) with the live value shown in the label, money fields
  wrapped in `.kpt-money`.
- The whole tool is ONE white instrument panel (`.kpt-tool`): inputs on the
  left, result on the right on desktop (stacked on phones), divided by a hairline.
- The result (`.kpt-result`) is the visual hero: the number up to ~104px, navy,
  with supporting rows underneath.
- The WhatsApp CTA sits quietly inside the panel under the result (smaller
  heading, one green button, TikTok as a text link). Available, never louder
  than the result.
- Calculator pages use a modest hero (h1 ≤ 52px) so the tool is the first big thing.
- Calculate live; no "Calculate" button unless unavoidable.

**Layouts**
- Mobile-first at 390px; tap targets ≥ 44px; full-width buttons on small phones.
- Desktop must use the width properly (content up to 1200px): two-column
  calculator (inputs left, sticky result + CTA right), 3-column card grids,
  two-column journey path panel. Never a stretched phone layout.
- Homepage hero is centred; inner pages are left-aligned.

**Ken's take — signature component.** Editorial, not a card: a 2px navy
rule, the K monogram + "Ken's take" + byline on the left (desktop), the insight
in large type on the right. Once per page, after the main result/content:

```html
<aside class="kpt-take">
  <div class="kpt-take__head">
    <img class="kpt-take__photo" src="../../assets/images/brand/ken-headshot.jpg" width="240" height="240" alt="Ken Tan">
    <p class="kpt-take__label">Ken's take</p>
    <p class="kpt-take__by">Ken Tan · Property agent since 2007</p>
  </div>
  <p>The insight. One to three short paragraphs, plain English, with a view.</p>
</aside>
```

(The `src` path above is for pages two folders deep, e.g. `calculators/<slug>/`.)

**Personal branding — LOCKED (approved by Ken, 4 Oct 2026).** The homepage
portrait treatment (desktop and mobile), the Ken's take author photo, the byline
"Ken Tan · Property agent since 2007", and the photo rules below are final.
Do not change them unless Ken explicitly asks.

**Photography of Ken — strict rules**
- Use only Ken's real photographs. **Never** AI-generate, regenerate, beautify,
  retouch, restyle, filter, colour-grade or otherwise change his appearance.
  Allowed edits: cropping and resizing only.
- Originals are kept untouched in `assets/images/brand/originals/`
  (`TUP_1206.jpg` full-length studio portrait, `headshot-tiktok.png` round headshot).
  Make new crops from these; never overwrite them.
- Approved crops:
  - `ken-portrait-hero.jpg` — waist/chest-up from TUP_1206, homepage hero on desktop.
    Right column, **no card or frame**: Ken stands in a soft pool of white light
    (radial glow) that absorbs the photo's white studio background, with only the
    outer background edges feathered. Caption below, centred: "Ken Tan" /
    "Property agent since 2007".
  - `ken-portrait-mobile.jpg` — head-and-shoulders from TUP_1206, shown as a
    52px circle beside his name on phones so the tools stay high on the page.
  - `ken-headshot.jpg` — from headshot-tiktok.png, inside the white ring; the
    small author photo in Ken's take (48px circle).
- Alt text: "Ken Tan" (or "Ken Tan, property agent").

**Footer** (drawn by kpt.js): roomy on phones — 2-column link list with
large tap targets, legal block separated by a hairline.

**Guided calculators** (kpt.css section 18): for tools with more than ~5
inputs, use progressive steps (`.kpt-form--steps` → `.kpt-step` with
`is-open` / `is-done` / `is-locked`, a summary line and an Edit button), not one
long form. Supporting pieces: `.kpt-sub` (grouped sub-fields), `.kpt-row2`,
`.kpt-note` / `--warn` / `--stop`, `.kpt-pill` (limiting factor), `.kpt-figure2`
(second headline figure), `.kpt-approx` (quiet "≈"), `.kpt-details` +
`.kpt-workings` (full working), `.kpt-rules` (rules list).
Reference implementation: `calculators/hdb-upgrade/`.

**Components** (all in `kpt.css`): `.kpt-card`, `.kpt-tiles/.kpt-tile`,
`.kpt-result`, `.kpt-form/.kpt-field/.kpt-input/.kpt-money/.kpt-segment/.kpt-range`,
`.kpt-table`, `.kpt-bars`, `.kpt-take` (Ken's take), `.kpt-asof`,
`.kpt-sources`, `.kpt-disclaimer`, `.kpt-cta`, `.kpt-btn--wa/--primary/--ghost`,
`.kpt-prose`, `.kpt-toc`, `.kpt-band`, `.kpt-list`, `.kpt-tool`. Reuse these; don't invent look-alikes.

**Trust rules:** every data page shows a date; every number has a source;
every calculator explains its assumptions; every page has a disclaimer.

**Voice:** plain English, first person ("I"), short sentences, no hype words
("unbeatable", "don't miss out", "golden opportunity").

Formatting numbers: use `KPT.fmt.money()`, `.psf()`, `.pct()`, `.num()`, `.date()`.

### B7a. Rules vs assumptions (every calculator)

- **Government rules** live only in `data/rules/*.js`. Every value carries its
  official `source`, `effective_from` and `checked_on`. Never hard-code a rule in
  a page or engine; read it from the data file.
- **Estimates and planning assumptions** live in `data/assumptions/<tool>.js`,
  clearly labelled, dated where market-based, and editable on the page.
- On screen, every number is one of: **You entered**, **Estimate**,
  **Assumption**, **Rule** or **Planning** (use `.kpt-tag` / `.kpt-tag--plan`).
- Each calculator page ends with a "Rules and assumptions used" list generated
  from the data files (`.kpt-rules`), so it updates when the files change.
- Put a tool's maths in its own `engine.js` (pure functions, no page code) and
  page behaviour in `page.js`. The engine can then be tested on its own.
- **Ken's Planning Budget** is the standard name for KPT's conservative planning
  figure. Always describe it as a planning scenario, never as a government,
  MAS, bank or financial-advice threshold.

### B8a. Consumer-facing wording (every page)

Visitors are home buyers and owners, not developers. Everything they can see
is written for them.

- **Titles and H1s describe the visitor's question or outcome**, in plain
  English. Prefer "How much property can you afford?" or "HDB Upgrade
  Calculator: what can you upgrade to?" over "Affordability Tool v1".
- **Leads and meta descriptions** say who it's for and what they'll learn,
  in one or two sentences.
- **No technical or template wording on a live page:** no "template",
  "example", "placeholder", "module", "tool_name", "[slug]", "Lorem", "TBC",
  "Replace this…", "Example only" labels, or field names copied from data files.
- **Labels are human:** "Purchase price", "Your monthly income",
  "Loan-to-value" (with a short plain-English help line when a term is jargon).
- **Result labels read as answers:** "You'll need about", "Your monthly
  instalment", not "Output" or "Result value".
- **Registry entries** (`title`, `short` in `data/tools.js`) follow the same
  rules — they appear on the homepage and in "Next step".
- Before delivering any page, search it for the banned words above.

### B9. SEO

- `<title>`: "{Page name}: {benefit} · Ken Property Tools", under 60 chars.
- Meta description under 155 chars, says who it's for and what they'll learn.
- Canonical URL with trailing slash on every page.
- One `<h1>`. Headline facts and written analysis in HTML, not only via JS.
- `og:image` 1200×630; project pages use `assets/images/projects/<slug>/og.jpg`.
- Add every live page to `sitemap.xml`.
- When a Layer 2 microsite and a hub page cover the same project, the copy
  that should rank gets the canonical; the other points its canonical to it.

### B10. Compliance

- Footer (automatic) shows Ken Tan, CEA Reg R007903D, Huttons Asia Pte Ltd
  and agency licence L3008899K (`CONFIG.agencyLicence`).
- Don't present estimates as advice or guarantees. Don't claim returns.
- Don't use developer logos or copy developer marketing text verbatim;
  summarise and cite.

### B11. Integrating existing standalone sites (later phases — not yet)

1. **Link** (done): registry entries with external `url`, shown as "Project site ↗".
2. **Shared tracking**: add the GA4 + Pixel IDs and the same event names
   (`whatsapp_click`, `tiktok_click`, `project_view`) to the microsite.
3. **Hub analysis page** (optional): build `projects/<slug>/` from the
   project template, change the registry `url` to `projects/<slug>/`, and
   have the microsite link to it for "full analysis". Set canonicals per B9.

Do not modify Layer 2 microsites unless Ken explicitly asks.

### B12. Phase log

- **Phase 1 (4 Oct 2026):** foundation — skeleton, homepage, kpt.css, kpt.js,
  registry, templates, rule stubs, SYSTEM.md. No live calculators yet.
- **Design v2 (4 Oct 2026):** product-style visual system (B8). Applied to the
  homepage and calculator template first; other templates' markup to follow
  after review (they already inherit the new kpt.css).
- **Design v2.1 (4 Oct 2026):** fewer cards, calculator as one instrument panel,
  editorial Ken's take, roomier footer, gold reserved for the K monogram.
  **Approved and locked as the KPT design system.**
- **Photography added (4 Oct 2026):** Ken's real portrait in the homepage hero
  (large on desktop, small on phones) and as the Ken's take author photo.
  Crops only; originals preserved (see B8 "Photography of Ken").
  Desktop portrait refined to sit frameless in a soft white glow.
  **Personal branding approved and locked.**
- **Phase 2 — HDB Upgrade Calculator V1 live (4 Oct 2026).** `calculators/hdb-upgrade/`
  (index.html, engine.js, page.js). Sell-first, private residential only, 1–2
  buyers (SC/PR), maximum budget + Ken's Planning Budget, limiting-factor
  analysis, dynamic Ken's take. 55+ buyers flagged, not modelled. Rules verified
  4 Oct 2026 (ABSD/remission and 2026 BRS/FRS independently confirmed by Ken).
  `tool_completed` sends budget_band, planning_band, limiting_factor,
  planning_limit, buyers, buyer_profile, age_55_flag, refund_estimated.
- **HDB Upgrade Calculator V1.1 (4 Oct 2026, pre-launch corrections):** Ken's
  Planning Budget is now the PRIMARY figure ("Recommended planning figure");
  the maximum is shown second as the "estimated technical ceiling". Owners 55+:
  results labelled preliminary with an explicit CPF warning; no single FRS
  figure is applied (retirement sums depend on the year each member turned 55).
  CPF refund rule sourced from CPF Board only. Citizen + PR ABSD wording:
  "may qualify for full ABSD remission, subject to IRAS conditions".
  Rule for future tools: when a tool shows both a maximum and Ken's Planning
  Budget, the Planning Budget leads.
- **Phase 1 complete (4 Oct 2026).** Next: Phase 2 — first live tools. The
  project, comparison and guide templates still use pre-v2.1 markup for the
  Ken's take block (it renders correctly via the legacy styles); switch each to
  the `kpt-take__head` markup when that template is first used for a live page.
