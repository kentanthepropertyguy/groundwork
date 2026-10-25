/* ==========================================================================
   GROUNDWORK: the overview a recognised property opens in Research (26 Oct 2026).
   "Research a property" has ONE search. When it recognises a development or an HDB block, a short overview appears under it: the typical prices (by bedroom type
   or size for a development, by flat type for an HDB block) and a prominent way into the full Research report. This file only WORDS and LAYS OUT that overview.
   It calculates nothing: the development's rows are the ones gw-records.js already draws (GW_REC.typesHtml / sizesHtml, from the approved bedroom and transaction
   files) and the HDB rows come from GWV.hdbComps (gw-value.js), the same figures the HDB report shows. Landed homes have no overview here: their sales panel
   (gw-value.js) is shown as it is, with no typical price made up for a house.
   The page (research/index.html) fetches the data and calls these functions; the list of what the full report holds names only what exists for that property.
   UMD: window.GW_OVERVIEW in the browser; Node uses the same functions for the tests.
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GW_OVERVIEW = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  // What the full report holds, for the property shown. Only what exists is listed (flags come from the data the page actually found).
  function devFeatures(f) {
    f = f || {};
    return [f.tx ? 'Actual transaction history' : '', f.bed ? 'Bedroom-specific resale prices' : '', f.rent ? 'Rental analysis' : '', 'Market Pulse', 'Asking-price checks', 'Development comparisons'].filter(Boolean);
  }
  function hdbFeatures(f) {
    f = f || {};
    return ['Prices for this block and its street', 'Nearby blocks compared', 'Every past resale', f.rent ? 'HDB rents' : '', 'Asking-price check'].filter(Boolean);
  }
  // The way into the full report: one clear button, then what is inside.
  function fullBox(href, kind, features, lead) {
    return '<div class="gw-ov-full" data-ov-fullbox="' + esc(kind) + '"><div class="gw-ov-fh"><p class="gw-ov-fk">' + esc(lead) + '</p>' +
      '<a class="gw-btn pri gw-ov-go" href="' + esc(href) + '" data-ov-full="' + esc(kind) + '">View Full Research <span aria-hidden="true">›</span></a></div>' +
      '<ul class="gw-ov-ft" aria-label="What the full research holds">' + features.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
  }
  const head = (kicker, name, meta) => '<header class="gw-ov-h"><p class="gw-ov-k">' + esc(kicker) + '</p><h2 class="gw-ov-n" tabindex="-1">' + esc(name) + '</h2>' + (meta ? '<p class="gw-ov-m">' + esc(meta) + '</p>' : '') + '</header>';

  // A development. o: { id, name, kicker, meta, body (GW_REC.typesHtml or sizesHtml output, may be ''), feat }
  function devHtml(o) {
    const body = o.body || '<p class="gw-ov-none" data-ov-none>There are too few recent sales to show a typical price here. The full research lists every sale and what is on the market.</p>';
    return '<section class="gw-ov" data-ov="dev" data-ov-id="' + esc(o.id) + '" aria-label="' + esc(o.name) + ' overview">' + head(o.kicker, o.name, o.meta) +
      '<div class="gw-ov-body">' + body + '</div>' + fullBox('#/p/' + encodeURIComponent(o.id), 'dev', devFeatures(o.feat), 'There is much more behind these figures.') + '</section>';
  }

  // An HDB block. rows: [{ label, level, n, blockN, lo, hi, q1, q3, midN, street, newest }], one per flat type resold at the block or on its street.
  function hdbRowHtml(r) {
    const where = r.level === 'block' ? plural(r.n, 'resale') + ' in this block' : r.level === 'street' ? (r.blockN ? 'Only ' + r.blockN + ' in this block, so ' + plural(r.n, 'resale') + ' on ' + r.street : plural(r.n, 'resale') + ' on ' + r.street) : plural(r.n, 'resale') + ' on ' + r.street + ', too few for a range';
    const price = r.q1 !== undefined ? money(r.q1) + ' – ' + money(r.q3) : r.lo !== undefined ? money(r.lo) + ' – ' + money(r.hi) : r.prices && r.prices.length ? r.prices.map(money).join(', ') : '';
    const sub = r.q1 !== undefined ? 'the middle ' + r.midN + ' of ' + r.n : r.lo !== undefined ? 'lowest – highest' : '';
    return '<li class="gw-ov-row" data-ov-flat="' + esc(r.label) + '"><span class="gw-ov-t">' + esc(r.label) + '</span>' +
      (price ? '<span class="gw-ov-p"><b>' + esc(price) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' : '<span class="gw-ov-p"><small>No range to show</small></span>') +
      '<span class="gw-ov-c">' + esc(where) + '</span></li>';
  }
  // o: { hash, block, streetLabel, townLabel, rows, since (e.g. "Oct 2024"), feat }
  function hdbHtml(o) {
    const rows = o.rows && o.rows.length ? '<section class="gw-ov-sec"><h3 class="gw-ov-sh">What flats here sold for</h3><p class="gw-ov-ss">Resale prices by flat type' + (o.since ? ', registered since ' + esc(o.since) : '') + '. The range is what most of them sold within.</p><ul class="gw-ov-rows">' + o.rows.map(hdbRowHtml).join('') + '</ul>' +
      '<p class="gw-ov-fine">Past resales from HDB records, not current listings or an official HDB valuation.</p></section>'
      : '<p class="gw-ov-none" data-ov-none>HDB records no recent resale in this block or on its street. The full research shows the nearby blocks.</p>';
    return '<section class="gw-ov" data-ov="hdb" aria-label="Blk ' + esc(o.block) + ' ' + esc(o.streetLabel) + ' overview">' + head('HDB flat', 'Blk ' + o.block + ' ' + o.streetLabel, o.townLabel) +
      '<div class="gw-ov-body">' + rows + '</div>' + fullBox(o.hash, 'hdb', hdbFeatures(o.feat), 'The full research for this block goes further.') + '</section>';
  }

  // "Blk 500 Serangoon North Ave 4", "500 serangoon north avenue 4": a block number and a road. Postal codes and development names are handled elsewhere.
  function parseAddress(q) {
    const m = /^\s*(?:(?:blk|block)\.?\s*)?(\d{1,4}[a-z]?)\s+([a-z0-9][a-z0-9 .,'\/-]{2,60}?)\s*$/i.exec(String(q || ''));
    if (!m) return null;
    const road = m[2].replace(/^(?:at|on)\s+/i, '').replace(/[.,]+$/g, '').trim();
    return /[a-z]{3}/i.test(road) ? { block: m[1].toUpperCase(), road } : null;
  }

  return { devFeatures, hdbFeatures, fullBox, devHtml, hdbHtml, hdbRowHtml, parseAddress };
});
