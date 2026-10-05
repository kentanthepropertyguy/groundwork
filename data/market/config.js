/* Market data configuration — the ONE switch between test and production data.
   mode 'test'       : illustrative files in data/market/test/ — a TEST DATA banner is shown on the page.
   mode 'production' : published Google Sheet (public-export tabs as CSV), else the bundled snapshot in
                       data/market/snapshot/. The snapshot is empty until real market data is added. */
window.KPT_MARKET_CONFIG = {
  mode: 'production',
  testBase: '../../data/market/test/',
  snapshotBase: '../../data/market/snapshot/',
  sheet: { bands: '', shortlist: '', settings: '' },   // paste the "Publish to web → CSV" links here for production
  routeStatsBase: '../../data/market/route-stats/',          // engine input (aggregates from tools/market-data/build-route-stats.js)
  testRouteStatsBase: '../../data/market/test/route-stats/', // illustrative synthetic route stats, used when mode is 'test'
  kenNotes: '../../data/market/ken-notes.json',               // Ken's authored notes (JSON array); empty = no Ken's Take shown
  testKenNotes: '../../data/market/test/ken-notes.json',
  compareReady: false,                                  // flip to true when the comparison tool exists
};
