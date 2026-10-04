/* =====================================================================
   PROJECT DATA — EXAMPLE
   One file per project: data/projects/<slug>.js
   Update prices, PSF and availability here. The page redraws itself;
   no design changes needed.

   Always update data_as_of when you change numbers. It is shown on
   the page as "Data as of ...", which is a key trust signal.
   All figures below are placeholders, not real project data.
   ===================================================================== */

window.KPT_PROJECT = {
  slug: "example-residences",
  name: "Example Residences",
  district: "D00",
  location: "Example Road",
  developer: "Example Developer",
  tenure: "99-year leasehold",
  total_units: 500,
  launch_date: "2026-11",
  top_date: "2030",
  data_as_of: "2026-10-04",
  avg_psf: 2300,

  /* Key-number tiles at the top of the page (any label/value you like) */
  facts: [
    { label: "Average PSF", value: "$2,300", note: "Launch weekend" },
    { label: "Tenure", value: "99-year" },
    { label: "Total units", value: "500" },
    { label: "Expected TOP", value: "2030" }
  ],

  unit_types: [
    { type: "2-Bedroom", size_sqft: "650–700", price_from: 1500000, psf_from: 2250, available: 40 },
    { type: "3-Bedroom", size_sqft: "900–1,000", price_from: 2100000, psf_from: 2200, available: 60 },
    { type: "4-Bedroom", size_sqft: "1,200–1,300", price_from: 2800000, psf_from: 2150, available: null }
  ],

  /* Nearby projects for the PSF comparison bars */
  comparables: [
    { name: "Nearby Project A", psf: 2450, note: "2024 launch" },
    { name: "Nearby Project B", psf: 2150, note: "Resale, 2019 TOP" },
    { name: "Nearby Project C", psf: 1950, note: "Resale, 2012 TOP" }
  ],

  sources: ["Developer price list", "URA caveats"]
};
