/* =====================================================================
   KEN PROPERTY TOOLS — TOOLS REGISTRY
   ---------------------------------------------------------------------
   This one file controls what appears on the homepage, the section
   pages (Calculators, Compare, Projects, Guides) and every
   "Next step" box at the bottom of a tool.

   TO ADD A TOOL:   copy one entry, change the details, set status.
   TO LAUNCH A TOOL: change  status: "coming-soon"  to  status: "live"
   TO FEATURE A TOOL ON THE HOMEPAGE: set  popular: true

   Rules:
   - id        lowercase-with-hyphens, never changes once live
               (it is the tool_name in Google Analytics + Meta)
   - category  "calculator" | "compare" | "project" | "guide"
   - url       path from the site root, ending in /   e.g. "calculators/affordability/"
               OR a full https:// address for an outside site (marketing microsites)
   - updated   "YYYY-MM-DD" — shown as "Updated 2 Oct 2026"
   ===================================================================== */

window.KPT_TOOLS = [

  /* ---------- CALCULATORS ---------- */
  {
    id: "affordability-calculator",
    title: "Affordability Calculator",
    short: "How much property can your income, CPF and cash support?",
    category: "calculator",
    url: "calculators/affordability/",
    status: "coming-soon",
    popular: true
  },
  {
    id: "hdb-upgrade-calculator",
    title: "HDB Upgrade Calculator",
    short: "What your HDB sale frees up, and what you can upgrade to.",
    category: "calculator",
    url: "calculators/hdb-upgrade/",
    status: "live",
    updated: "2026-10-04",
    popular: true
  },
  {
    id: "cash-cpf-calculator",
    title: "Cash & CPF Needed",
    short: "The cash and CPF you need on day one, step by step.",
    category: "calculator",
    url: "calculators/cash-cpf/",
    status: "coming-soon"
  },
  {
    id: "monthly-instalment-calculator",
    title: "Monthly Instalment Calculator",
    short: "Your monthly loan repayment across different interest rates.",
    category: "calculator",
    url: "calculators/monthly-instalment/",
    status: "coming-soon"
  },
  {
    id: "bsd-absd-calculator",
    title: "Stamp Duty Calculator (BSD & ABSD)",
    short: "Buyer's and additional buyer's stamp duty for your profile.",
    category: "calculator",
    url: "calculators/bsd-absd/",
    status: "coming-soon",
    popular: true
  },
  {
    id: "rental-yield-calculator",
    title: "Rental Yield Calculator",
    short: "Gross and net yield after costs, for investment buyers.",
    category: "calculator",
    url: "calculators/rental-yield/",
    status: "coming-soon"
  },

  /* ---------- COMPARISONS ---------- */
  {
    id: "project-vs-project",
    title: "Project vs Project",
    short: "Two developments side by side: price, PSF, location, tenure.",
    category: "compare",
    url: "compare/project-vs-project/",
    status: "coming-soon"
  },
  {
    id: "new-launch-vs-resale",
    title: "New Launch vs Resale",
    short: "Progressive payments vs immediate rental — which fits you?",
    category: "compare",
    url: "compare/new-launch-vs-resale/",
    status: "coming-soon",
    popular: true
  },

  /* ---------- PROJECT ANALYSIS ----------
     Lucerne Grand and Thomson Reserve are live marketing microsites
     (Layer 2) and link OUT for now. Hougang Central is planned, not live. When a full analysis page is built inside
     this hub, change url to "projects/<slug>/".                       */
  {
    id: "lucerne-grand",
    title: "Lucerne Grand",
    short: "Lakeside · CDL. Pricing, unit mix and buyer analysis.",
    category: "project",
    url: "https://lucernegrand.kentanthepropertyguy.com/",
    status: "live"
  },
  {
    id: "thomson-reserve",
    title: "Thomson Reserve",
    short: "Thomson. Pricing, unit mix and buyer analysis.",
    category: "project",
    url: "https://units.thomsonreserve.kentanthepropertyguy.com/",
    status: "live"
  },
  {
    id: "hougang-central",
    title: "Hougang Central",
    short: "Hougang. Analysis for HDB upgraders.",
    category: "project",
    url: "https://hougangcentral.kentanthepropertyguy.com/", /* planned subdomain, NOT live yet */
    status: "coming-soon"
  },

  /* ---------- GUIDES ---------- */
  {
    id: "hdb-upgrader-guide",
    title: "The HDB Upgrader's Guide",
    short: "MOP, timeline, sell-first or buy-first, and the numbers in between.",
    category: "guide",
    url: "guides/hdb-upgrader/",
    status: "coming-soon"
  },
  {
    id: "asset-progression-guide",
    title: "Asset Progression, Explained",
    short: "How owners move from HDB to condo to a second property.",
    category: "guide",
    url: "guides/asset-progression/",
    status: "coming-soon"
  }
];

/* =====================================================================
   JOURNEYS — the "What are you looking to do?" cards on the homepage.
   "tools" is the recommended order. Use tool ids from the list above.
   A tool's "Next step" box suggests other tools from the same journeys.
   ===================================================================== */

window.KPT_JOURNEYS = [
  {
    id: "upgrade-hdb",
    label: "Upgrade from my HDB",
    hint: "Sell, buy, and the timing between",
    tools: ["hdb-upgrade-calculator", "affordability-calculator", "new-launch-vs-resale", "hdb-upgrader-guide"]
  },
  {
    id: "first-condo",
    label: "Buy my first condo",
    hint: "Budget, upfront cash, monthly cost",
    tools: ["affordability-calculator", "cash-cpf-calculator", "monthly-instalment-calculator", "new-launch-vs-resale"]
  },
  {
    id: "afford",
    label: "Check what I can afford",
    hint: "Loan limits, cash, CPF, stamp duty",
    tools: ["affordability-calculator", "cash-cpf-calculator", "bsd-absd-calculator"]
  },
  {
    id: "compare",
    label: "Compare properties",
    hint: "Side-by-side, with the numbers",
    tools: ["project-vs-project", "new-launch-vs-resale", "lucerne-grand"]
  },
  {
    id: "invest",
    label: "Buy for investment",
    hint: "Yield, stamp duty, progression",
    tools: ["rental-yield-calculator", "bsd-absd-calculator", "asset-progression-guide"]
  },
  {
    id: "new-launch",
    label: "Research a new launch",
    hint: "Pricing, PSF and how they compare",
    tools: ["lucerne-grand", "thomson-reserve", "hougang-central", "project-vs-project"]
  }
];
