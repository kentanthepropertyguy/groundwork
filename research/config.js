/* Research journey data configuration. Paths are relative to /research/.
   projects : generated project aggregates (tools/market-data/build-project-stats.js writes data/projects/)
   kenNotes : Ken's authored research notes (JSON array). Empty = no Ken's Take is shown anywhere.
     project note : { "scope": "project", "project": "thomson-grand", "note": "...", "status": "Active", "reviewed_on": "2026-10-06", "review_by": "2027-01-06" }
     pair note    : { "scope": "pair", "projects": ["thomson-impressions", "thomson-three"], "note": "...", ... }   (A vs B and B vs A are the same pair)
   A note shows only when status is Active (the default) and today is not past review_by. */
window.KPT_RESEARCH_CONFIG = {
  projects: '../data/projects/',
  kenNotes: '../data/research/ken-notes.json',
};
