/* ==========================================================================
   GROUNDWORK — Neighbourhood Intelligence V1 (Master Planning, 4 Nov 2026: Concept 1). Planning-area statistics in Research, kept apart
   from PRISM, which describes one development.
     - research/#/area/<id>: the neighbourhood page. The answer first (three figures, each with its period and qualifier, and one
       warning), the approved insights word for word with their qualifiers, periods and sources, five figure groups that open in place,
       then every source's attribution and the limits.
     - one plain link under the five PRISM dimensions of a development the index lists as in that planning area (no figures in the link:
       every figure needs its qualifier).
   Reads ONLY data/neighbourhood/v1/: index.json (pinned below by sha256: the areas, each area file's sha256 and release id, and its
   verified development file's sha256) and each area file (schema gw-neighbourhood-v1, pinned by the index). Fails closed: a file that is not the
   pinned one, an unknown schema, an insight without its qualifier, a deferred / withheld / not-assessed record carrying a value, any
   coordinate or address field, or a source without its attribution shows no neighbourhood page and no link.
   Never shown: a score, a forecast, a buyer / upgrader / demand count, a value for a deferred (S3) or withheld (S4) record (it reads "Not
   published in this release", never zero or "none"), or a radius view. Every figure carries its period; every source its attribution.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GW_AREA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const NI = { SCHEMA: 'gw-neighbourhood-v1', INDEX_SCHEMA: 'gw-neighbourhood-v1-index', DIR: 'data/neighbourhood/v1/',
    INDEX: '73e557b3d02965e0c082e128a39ea9d3d6f7c247178452c319d76e8f6a30ee5f' };   // the index of Claude C's r2 package (ni-v1-hougang-2026-11-04-r2-65b38e9d8599)
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const n0 = (v) => (isNum(v) ? v.toLocaleString('en-SG', { maximumFractionDigits: 0 }) : '');
  const n1 = (v) => (isNum(v) ? v.toLocaleString('en-SG', { maximumFractionDigits: 1 }) : '');
  const money = (v) => (isNum(v) ? '$' + n0(v) : '');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // dates as a buyer reads them: 2026-10-08 -> 8 Oct 2026; 2025-10 -> Oct 2025 (the text is otherwise the data's own)
  const dates = (t) => String(t || '').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => +d + ' ' + MON[+m - 1] + ' ' + y).replace(/\b(\d{4})-(\d{2})\b/g, (_, y, m) => MON[+m - 1] + ' ' + y);
  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

  /* ---------------------------------------------------------------- checks (fail closed) */
  const FORBIDDEN_KEYS = /^(lat|lng|lon|latitude|longitude|x|y|address|postal|postalCode|coords?|geometry)$/i;   // positions and addresses (OneMap condition: aggregates only)
  function keysOk(o, path) {
    if (Array.isArray(o)) return o.every((x, i) => keysOk(x, path + '[' + i + ']'));
    if (o && typeof o === 'object') return Object.keys(o).every((k) => { if (FORBIDDEN_KEYS.test(k)) throw new Error('neighbourhood: forbidden field ' + path + '.' + k); return keysOk(o[k], path + '.' + k); });
    return true;
  }
  const ITEM_SECTIONS = ['stock', 'activity', 'liquidity', 'upgraderContext', 'futureSupply'];
  const UNPUBLISHED = ['deferred', 'withheld', 'not_assessed'];
  const VALUE_KEYS = ['value', 'value12', 'value24', 'values', 'count', 'sites', 'byType', 'byType12'];
  function checkIndex(ix) {
    if (!ix || ix.schemaVersion !== NI.INDEX_SCHEMA || !Array.isArray(ix.areas)) throw new Error('neighbourhood index: schema');
    ix.areas.forEach((a) => {
      if (!/^[a-z0-9-]{1,40}$/.test(a.id || '') || !a.name || !/^[a-z0-9-]+\.json$/.test(a.path || '') || !/^[0-9a-f]{64}$/.test(a.sha256 || '') || !a.releaseId) throw new Error('neighbourhood index: area');
      if (!/^[a-z0-9-]+\.json$/.test(a.developmentsPath || '') || !/^[0-9a-f]{64}$/.test(a.developmentsSha256 || '')) throw new Error('neighbourhood index: developments file');
    });
    return ix;
  }
  // the verified development list (Claude C, r2: positions inside the Master Plan 2019 boundary; never postal district or name): Registry ids
  // and names only, for the same release, its count stated, no id twice
  function checkDevelopments(x, entry) {
    if (!x || x.area !== entry.name || x.releaseId !== entry.releaseId || !Array.isArray(x.developments) || x.count !== x.developments.length) throw new Error('neighbourhood developments: header');
    keysOk(x, '');
    const ids = x.developments.map((d) => d.registryId);
    if (!ids.every((d) => /^[a-z0-9-]{1,80}$/.test(d || '')) || new Set(ids).size !== ids.length) throw new Error('neighbourhood developments: ids');
    return ids;
  }
  function checkArea(d, entry) {
    if (!d || d.schemaVersion !== NI.SCHEMA) throw new Error('neighbourhood: schema');
    if (d.releaseId !== entry.releaseId) throw new Error('neighbourhood: release id');
    if (!d.area || d.area.type !== 'planning_area' || d.area.name !== entry.name) throw new Error('neighbourhood: area');
    keysOk(d, '');
    const src = {}; (d.sources || []).forEach((s) => { if (!s.id || !s.publisher || !s.dataset || !s.attribution) throw new Error('neighbourhood: source ' + s.id); src[s.id] = s; });
    const items = {}; ITEM_SECTIONS.forEach((k) => (d[k] || []).forEach((it) => { if (!it.id || !it.label || !it.status) throw new Error('neighbourhood: item'); items[it.id] = it; (it.sourceIds || []).forEach((s) => { if (!src[s]) throw new Error('neighbourhood: item source ' + s); }); }));
    // an unpublished record (deferred S3, withheld S4, not assessed) carries no value of any kind, so it can never be drawn as a number
    Object.keys(items).forEach((k) => { const it = items[k]; if (UNPUBLISHED.indexOf(it.status) >= 0 && VALUE_KEYS.some((v) => it[v] != null)) throw new Error('neighbourhood: a value on an unpublished record ' + k); });
    if (!Array.isArray(d.insights) || !d.insights.length) throw new Error('neighbourhood: insights');
    d.insights.forEach((i) => {
      if (!i.id || !i.text || !i.qualifier || !i.period) throw new Error('neighbourhood: insight ' + i.id);
      (i.sourceIds || []).forEach((s) => { if (!src[s]) throw new Error('neighbourhood: insight source ' + s); });
      (i.itemIds || []).forEach((s) => { if (!items[s] || UNPUBLISHED.indexOf(items[s].status) >= 0) throw new Error('neighbourhood: insight item ' + s); });
    });
    return { d, items, src };
  }

  /* ---------------------------------------------------------------- the page */
  const srcNames = (m, ids) => Array.from(new Set((ids || []).map((s) => m.src[s].publisher.replace(/ \([^)]*\)$/, '')))).join(', ');
  const it = (m, id) => m.items[id] || null;
  // the answer first: three figures (homes, condo resale activity, HDB prices), each with its comparison, qualifier and period, and ONE warning
  // (the condo-resale insight's own warning: resale activity is not selling time or price performance)
  function summaryOf(m) {
    const ins = (id) => m.d.insights.find((x) => x.id === id) || null;
    const share = it(m, 'stock.privateShare'), hdb = it(m, 'stock.hdb'), priv = ['stock.privateNonLanded', 'stock.ec', 'stock.landed'].map((k) => it(m, k));
    const L = it(m, 'liquidity.condo'), P = it(m, 'context.hdbMedianPrices'), i1 = ins('insight.1'), i2 = ins('insight.2'), i3 = ins('insight.3'), i5 = ins('insight.5');
    const figs = [];
    if (share && isNum(share.value) && hdb && isNum(hdb.value) && priv.every((x) => x && isNum(x.value)) && i1) {
      const r100 = (v) => Math.round(v / 100) * 100, pt = priv.reduce((s, x) => s + x.value, 0);
      figs.push({ k: 'homes', scope: 'Homes', v: n1(share.value), label: share.label, cmp: 'About ' + n0(r100(hdb.value)) + ' HDB flats and ' + n0(r100(pt)) + ' private homes', q: i1.qualifier, t: dates(i1.period), ids: i1.sourceIds });
    }
    if (L && isNum(L.value) && L.comparison && i2) figs.push({ k: 'condo', scope: 'Condo resales', v: n1(L.value), label: 'resales per 100 homes a year',
      cmp: ['Singapore ' + n1(L.comparison.singapore), cap(L.comparison.rankStatement || '')].filter(Boolean).join(' · '), q: i2.qualifier, t: dates(i2.period), ids: i2.sourceIds });
    const p5 = P && P.values && P.values['5-room'];
    if (p5 && isNum(p5.hougang) && i5) figs.push({ k: 'prices', scope: 'HDB prices', v: money(p5.hougang), label: 'median 5-room resale', cmp: 'Singapore ' + money(p5.singapore), q: i5.qualifier, t: dates(i5.period), ids: i5.sourceIds });
    const warn = i3 ? String(i3.qualifier).split(/(?<=\.)\s/)[0] : '';
    return { figs, warn };
  }
  // the five figure groups: each row is a label, its figure and a line of comparison, period or qualifier, all read from the data
  const per = (x) => dates(x.period12 || x.period || '');
  const row = (label, fig, sub) => ({ label, fig, sub });
  const INCOME = [['atOrAbove10000', 'Households earning $10,000 or more a month from work'], ['atOrAbove15000', 'Households earning $15,000 or more a month from work'],
    ['atOrAbove20000', 'Households earning $20,000 or more a month from work'], ['noEmployedPerson', 'Households with no employed person']];
  const NOT_PUBLISHED = 'Not published in this release', NOT_ASSESSED = 'Not assessed';
  // an unpublished record's own reason, as the data states it, without its leading "Not (yet) published: " / "Not assessed: "
  const why = (t) => cap(String(t || '').replace(/^Not (yet )?(published|assessed):\s*/i, ''));
  function rank(c) { const r = c && c.rank; if (!r || !isNum(r.position)) return ''; return (r.tiedWith && r.tiedWith.length ? 'joint ' : '') + ordinal(r.position) + ' of ' + r.of + ' planning areas'; }
  function rowsOf(m, x) {
    if (UNPUBLISHED.indexOf(x.status) >= 0) return [row(x.label, x.status === 'not_assessed' ? NOT_ASSESSED : NOT_PUBLISHED, why(x.status === 'not_assessed' ? x.missing : x.reason))];
    if (x.status !== 'publishable') return [];
    const id = x.id;
    if (/^stock\./.test(id)) return [row(x.label, id === 'stock.privateShare' ? n1(x.value) : n0(x.value), dates(x.period))];
    if (/^activity\./.test(id)) return [row(x.label, n0(x.value12), n0(x.value24) + ' over 24 months · ' + per(x) + (x.byType12 ? ' · ' + Object.keys(x.byType12).map((k) => k + ' ' + n0(x.byType12[k])).join(', ') : ''))];
    if (/^liquidity\./.test(id)) {
      const c = x.comparison || {}, nb = (c.neighbouringAreas || []).map((a) => a.area + ' ' + n1(a.value)).join(', ');
      const fig = n1(x.value) + (x.unit === 'times' ? ' times' : '');
      return [row(x.label, fig, ['Singapore ' + n1(c.singapore), c.rankStatement ? c.rankStatement : rank(c), nb ? 'Neighbouring areas: ' + nb : '', /^\d/.test(String(x.sample || '')) ? 'Base: ' + x.sample : '', per(x)].filter(Boolean).join(' · '))];
    }
    if (id === 'context.hdbMedianPrices') return Object.keys(x.values || {}).map((t) => { const v = x.values[t]; return row('Median ' + t + ' HDB resale', money(v.hougang), 'Singapore ' + money(v.singapore) + ' · ' + n0(v.n) + ' resales · ' + per(x)); });
    if (id === 'context.income') return INCOME.filter(([k]) => isNum(x.values[k])).map(([k, l]) => row(l, n1(x.values[k]) + '%', 'Singapore ' + n1(x.singapore[k]) + '% · ' + dates(x.period)))
      .concat([row('', '', [x.caveat, x.denominator].filter(Boolean).join(' · '))]);
    if (id === 'context.householdsByDwelling') return Object.keys(x.values || {}).map((k) => row('Resident households: ' + k, n0(x.values[k]), dates(x.period))).concat([row('', '', x.caveat || '')]);
    if (id === 'context.age65') return [row(x.label, n1(x.value) + '%', ['Singapore ' + n1(x.comparison.singapore) + '%', x.earlier ? n1(x.earlier.value) + '% in ' + x.earlier.year : '', dates(x.period), x.caveat].filter(Boolean).join(' · '))];
    if (id === 'context.hdbLargeFlats') return [row(x.label, n1(x.value) + '%', ['Singapore ' + n1(x.comparison.singapore) + '%', x.basis, dates(x.period)].filter(Boolean).join(' · '))];
    if (id === 'supply.knownSites') return (x.sites || []).map((s) => row(x.label, s.name, ['About ' + n0(s.homesApprox) + ' homes', s.status + ', ' + s.awarded, 'completion date ' + (s.expectedCompletion ? dates(s.expectedCompletion) : 'not stated'), x.inSupplyCount === false ? 'not added to any supply count' : ''].filter(Boolean).join(' · ')));
    if (isNum(x.value)) return [row(x.label, n0(x.value), dates(x.period))];
    return [];
  }
  function groupsOf(m) {
    const I = (id) => it(m, id), sec = (k) => m.d[k] || [];
    const hdb = I('stock.hdb'), pv = ['stock.privateNonLanded', 'stock.ec', 'stock.landed'].map(I).filter(Boolean), ah = I('activity.hdb'), ac = I('activity.condo'), lc = I('liquidity.condo'), lh = I('liquidity.hdb');
    const P5 = I('context.hdbMedianPrices') && I('context.hdbMedianPrices').values['5-room'], ks = I('supply.knownSites'), unpub = sec('futureSupply').filter((x) => x.status === 'deferred' || x.status === 'withheld');
    const i1 = m.d.insights.find((x) => x.id === 'insight.1');
    return [
      { k: 'H', name: 'Homes', q: 'How many homes, by type', hl: hdb ? n0(hdb.value) + ' HDB flats · ' + n0(pv.reduce((s, x) => s + x.value, 0)) + ' private homes' : '', sub: i1 ? i1.qualifier : '', items: sec('stock') },
      { k: 'R', name: 'Resales', q: 'How many homes changed hands', hl: ah && ac ? n0(ah.value12) + ' HDB · ' + n0(ac.value12) + ' condo resales' : '', sub: ah ? per(ah) : '', items: sec('activity') },
      { k: 'A', name: 'Resale rates', q: 'How often homes resell, against Singapore', hl: lc && lh ? 'Condos ' + n1(lc.value) + ' · HDB ' + n1(lh.value) + ' per 100 homes a year' : '', sub: lc && lh ? 'Singapore ' + n1(lc.comparison.singapore) + ' and ' + n1(lh.comparison.singapore) + ' · ' + per(lc) : '', items: sec('liquidity') },
      { k: 'C', name: 'Prices, households and residents', q: 'Context, not buying power or demand', hl: P5 ? '5-room HDB median ' + money(P5.hougang) : '', sub: P5 ? 'Singapore ' + money(P5.singapore) + ' · ' + per(I('context.hdbMedianPrices')) : '', items: sec('upgraderContext') },
      { k: 'F', name: 'Future supply', q: 'What is and is not recorded', hl: ks && ks.sites && ks.sites.length ? ks.sites.length + ' known site' + (ks.sites.length === 1 ? '' : 's') + ' · ' + ks.sites.map((s) => s.name).join(', ') : 'No known site recorded',
        sub: unpub.length ? unpub.length + ' supply figure' + (unpub.length === 1 ? '' : 's') + ' not published in this release' : '', items: sec('futureSupply') }
    ];
  }
  const pin = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  function pageHtml(m, o) {
    const d = m.d, name = d.area.name, s = summaryOf(m), root = o.root || '../';
    const fig = (f) => '<div class="gwp-qr-f gwa-f" data-gwa-fig="' + f.k + '"><span class="gwp-qr-s">' + esc(f.scope) + '</span><b>' + esc(f.v) + '</b><span class="gwp-qr-l">' + esc(f.label) + '</span>' +
      '<small class="gwp-qr-c">' + esc(f.cmp) + '</small><small class="gwa-q">' + esc(f.q) + '</small><small class="gwa-t">' + esc(f.t) + '</small></div>';
    const head = '<div class="gwp-wrap"><header class="gwp-head gwa-head"><nav class="gwp-crumb" aria-label="Breadcrumb"><a href="#/">Research</a><span aria-hidden="true">›</span><span aria-current="page">' + esc(name) + '</span></nav>' +
      '<div class="gwp-ttl"><div class="gwp-ht"><h1 class="gwp-h1">' + esc(name) + '</h1><p class="gwp-meta">Planning area · ' + esc(d.vintages && /2019/.test(d.vintages.planningAreas) ? 'Master Plan 2019 boundary' : d.area.boundary) + ' · records to ' + esc(dates(d.dataMonth)) + '</p></div></div></header></div>';
    const sum = '<section class="gwp-qr gwa-sum" data-gwa-summary aria-label="' + esc(name) + ' in short"><div class="gwp-qr-top"><p class="gwp-k">Neighbourhood · ' + esc(name) + ' planning area</p>' +
      '<div class="gwp-qr-fs gwp-qr-fs--' + s.figs.length + '">' + s.figs.map(fig).join('') + '</div>' + (s.warn ? '<p class="gwp-qr-w" data-gwa-warn><b>Watch out:</b> ' + esc(s.warn) + '</p>' : '') + '</div>' +
      '<p class="gwp-qr-n">Figures for the whole planning area, not for any one development. No score and no forecast.</p></section>';
    const finding = (i) => '<li data-gwa-insight="' + esc(i.id) + '"><p class="gwa-it">' + esc(i.text) + '</p><p class="gwa-iq">' + esc(i.qualifier) + '</p><p class="gwa-im">' + esc(dates(i.period)) + ' · ' + esc(srcNames(m, i.sourceIds)) + '</p></li>';
    const n = d.insights.length;
    const finds = '<section class="gwp-sec gwa-fx" aria-labelledby="gwaFindH"><h2 id="gwaFindH">' + (WORDS[n] || n) + ' finding' + (n === 1 ? '' : 's') + '</h2><p class="gwp-fine">' + esc(name) + ' on ' + esc(String(d.vintages && d.vintages.planningAreas || '').replace(/ \(.*\)$/, '')) + ' boundaries' + (d.vintages && d.vintages.residentEstimates2026 ? '; the 2026 resident estimate uses ' + esc(d.vintages.residentEstimates2026.replace(/ \(.*\)$/, '')) : '') + '.</p>' +
      '<ol class="gwa-ins">' + d.insights.map(finding).join('') + '</ol></section>';
    const dl = (rows) => '<dl class="gwa-dl">' + rows.map((r) => '<div' + (r.label ? '' : ' class="gwa-note"') + '><dt>' + esc(r.label) + '</dt><dd>' + (r.fig ? '<b>' + esc(r.fig) + '</b>' : '') + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</dd></div>').join('') + '</dl>';
    const group = (g) => { const rows = [].concat.apply([], g.items.map((x) => rowsOf(m, x))), ids = Array.from(new Set([].concat.apply([], g.items.map((x) => x.sourceIds || []))));
      return '<section class="gwp-dim" id="gwa-' + g.k + '" data-gwa-group="' + g.k + '"><h3 class="gwp-dimh"><button type="button" class="gwp-dimb" aria-expanded="false" aria-controls="gwaG' + g.k + '" data-gwa-toggle="' + g.k + '">' +
        '<span class="gwp-pl" aria-hidden="true">' + g.k + '</span><span class="gwp-dn"><b>' + esc(g.name) + '</b><small>' + esc(g.q) + '</small></span><span class="gwp-hl"><b>' + esc(g.hl) + '</b>' + (g.sub ? '<small>' + esc(g.sub) + '</small>' : '') + '</span><i class="gwp-chev" aria-hidden="true"></i></button></h3>' +
        '<div class="gwp-dimp" id="gwaG' + g.k + '" role="region" aria-label="' + esc(g.name) + ' in detail" hidden>' + dl(rows) + (ids.length ? '<p class="gwp-fine gwa-gs">Sources: ' + esc(srcNames(m, ids)) + ' (attribution below)</p>' : '') + '</div></section>'; };
    const figs = '<section class="gwp-sec gwp-dims gwa-figs" aria-labelledby="gwaFigH"><div class="gwp-sech"><div><h2 id="gwaFigH">The figures</h2><p class="gwp-fine">Each opens for its figures, periods and comparisons.</p></div>' +
      '<p class="gwp-all"><button type="button" data-gwa-all="open">Expand all</button><span aria-hidden="true">/</span><button type="button" data-gwa-all="close">Collapse all</button></p></div><div class="gwp-ds">' + groupsOf(m).map(group).join('') + '</div></section>';
    const srcs = '<details class="gwp-d gwp-src" id="gwa-src" data-gwa-sources><summary><span class="gwp-pn">Sources, data periods and limits</span></summary><div class="gwp-din"><ul class="gwp-sl">' +
      d.sources.map((x) => '<li data-gwa-source="' + esc(x.id) + '"><b>' + esc(x.publisher) + '</b> · ' + esc(x.dataset) + '<small>' + esc(x.attribution) + '</small></li>').join('') + '</ul>' +
      ((d.limitations || []).length ? '<p class="gwp-fine"><b>Limits of this evidence</b></p><ul class="gwp-lim">' + d.limitations.map((t) => '<li>' + esc(cap(t)) + '</li>').join('') + '</ul>' : '') +
      ((d.methodNotes || []).length ? '<p class="gwp-fine"><b>How these figures are made</b></p><ul class="gwp-lim" data-gwa-method>' + d.methodNotes.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') +
      (d.updates ? '<p class="gwp-fine"><b>Updates</b></p><ul class="gwp-lim" data-gwa-updates>' + ['cadence', 'resaleActivity', 'stockAndContext', 'supply'].filter((k) => d.updates[k]).map((k) => '<li>' + esc(cap(d.updates[k])) + '</li>').join('') + '</ul>' : '') +
      '<p class="gwp-fine" data-gwa-release>Neighbourhood Intelligence V1 · ' + esc(d.releaseId) + '. Analysis and derived statistics by Groundwork; not endorsed by the data publishers.</p></div></details>';
    const next = '<section class="gwp-next" aria-label="Where next"><a class="gwp-nx" href="#/" data-gwa-search><b>Research a development</b><span>PRISM Analysis and Property Data for one development</span></a>' +
      '<a class="gwp-nx" href="' + esc(root) + 'tools/payment-planner/" data-gwa-calc><b>Calculate my purchase</b><span>Cash, CPF and the monthly instalment</span></a></section>';
    return '<div class="gwp-page gwa-page" data-gwa-page="' + esc(o.id) + '">' + head + '<div class="gwp-wrap">' + sum + finds + figs + srcs + next + '</div></div>';
  }
  // the link under the five PRISM dimensions: words only, so no figure ever appears without its qualifier
  const linkHtml = (a) => '<a class="gwa-link" href="#/area/' + esc(a.id) + '" data-gwa-link="' + esc(a.id) + '">' + pin + '<span><b>' + esc(a.name) + ' neighbourhood</b><small>Homes, resales, prices and households across the planning area</small></span><i aria-hidden="true">›</i></a>';

  /* ---------------------------------------------------------------- browser: load, verify, mount */
  function hex(buf) { return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
  function sha256(text) {
    const C = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
    if (!C || typeof TextEncoder === 'undefined') return Promise.reject(new Error('no digest'));   // fail closed: never shown unverified
    return C.digest('SHA-256', new TextEncoder().encode(text)).then(hex);
  }
  const getText = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); });
  let idx = null; const areas = {}, devs = {};
  function index(root) {
    if (!idx) { idx = getText(root + NI.DIR + 'index.json?v=' + NI.INDEX.slice(0, 10)).then((t) => sha256(t).then((h) => { if (h !== NI.INDEX) throw new Error('neighbourhood index: not the approved file'); return checkIndex(JSON.parse(t)); })); idx.catch(() => { idx = null; }); }
    return idx;
  }
  function area(root, id) {
    if (!areas[id]) {
      areas[id] = index(root).then((ix) => { const e = ix.areas.find((a) => a.id === id); if (!e) return null;
        return getText(root + NI.DIR + e.path + '?v=' + e.sha256.slice(0, 10)).then((t) => sha256(t).then((h) => { if (h !== e.sha256) throw new Error('neighbourhood: sha256'); return checkArea(JSON.parse(t), e); })); });
      areas[id].catch(() => { delete areas[id]; });
    }
    return areas[id];
  }
  function developments(root, e) {
    if (!devs[e.id]) {
      devs[e.id] = getText(root + NI.DIR + e.developmentsPath + '?v=' + e.developmentsSha256.slice(0, 10)).then((t) => sha256(t).then((h) => { if (h !== e.developmentsSha256) throw new Error('neighbourhood developments: sha256'); return checkDevelopments(JSON.parse(t), e); }));
      devs[e.id].catch(() => { delete devs[e.id]; });
    }
    return devs[e.id];
  }
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  // #/area/<id>: the page, or o.fallback() when the area is not in the approved index or anything fails a check
  function show(app, id, o) {
    const root = o.root || '../';
    return area(root, id).then((m) => {
      if (o.still && !o.still()) return m;
      if (!m) { if (o.fallback) o.fallback(); return null; }
      document.title = m.d.area.name + ' neighbourhood — Research — Groundwork';
      app.innerHTML = pageHtml(m, { root, id });
      // the figure groups: each opens and closes on its own, directly beneath its row; Expand all / Collapse all; remembered for this visit
      const key = 'gw.area.open:' + id, rows = Array.from(app.querySelectorAll('[data-gwa-toggle]'));
      const setOpen = (b, on) => { const p = app.querySelector('#' + b.getAttribute('aria-controls')); p.hidden = !on; b.setAttribute('aria-expanded', String(on)); b.closest('.gwp-dim').classList.toggle('open', on); };
      const save = () => ss.set(key, rows.filter((b) => b.getAttribute('aria-expanded') === 'true').map((b) => b.dataset.gwaToggle).join(','));
      rows.forEach((b) => b.addEventListener('click', () => { setOpen(b, b.getAttribute('aria-expanded') !== 'true'); save(); }));
      app.querySelectorAll('[data-gwa-all]').forEach((b) => b.addEventListener('click', () => { rows.forEach((r) => setOpen(r, b.dataset.gwaAll === 'open')); save(); }));
      const was = (ss.get(key) || '').split(','); rows.forEach((b) => { if (was.indexOf(b.dataset.gwaToggle) >= 0) setOpen(b, true); });
      return m;
    }).catch(() => { if (!(o.still && !o.still()) && o.fallback) o.fallback(); return null; });
  }
  // on a development's PRISM page: the link to its planning area, only when the approved index lists that development
  function mountLink(app, devId, o) {
    const root = o.root || '../';
    return index(root).then((ix) => Promise.all(ix.areas.map((e) => developments(root, e).then((ids) => (ids.indexOf(devId) >= 0 ? e : null)))).then((hit) => {
      const a = hit.find(Boolean); if (!a) return null;
      return area(root, a.id).then((m) => {   // the area page must itself pass its checks before anything links to it
        if (!m || (o.still && !o.still()) || app.querySelector('[data-gwa-link]')) return null;
        const at = app.querySelector('[data-gwp-page="' + devId + '"] .gwp-dims'); if (!at) return null;
        at.insertAdjacentHTML('afterend', linkHtml(a)); return a.id;
      });
    })).catch(() => null);
  }
  return { NI, checkIndex, checkDevelopments, checkArea, summaryOf, groupsOf, rowsOf, pageHtml, linkHtml, dates, show, mountLink, NOT_PUBLISHED, NOT_ASSESSED, _reset: () => { idx = null; [areas, devs].forEach((o) => Object.keys(o).forEach((k) => delete o[k])); } };
});
