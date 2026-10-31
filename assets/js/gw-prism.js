/* ==========================================================================
   GROUNDWORK — PRISM V1 (31 Oct 2026). "PRISM by Groundwork" inside Research.
   Reads ONLY the approved public export in data/prism/v1/ (manifest.json + reports/<id>.json, schema prism-public-v1),
   checks it before showing anything, and draws:
     - a preview card on a development's Research page, and
     - the PRISM investigation at research/#/prism/<id>: one conclusion with its numbers, Why, Watch out, then the full
       five layers on request,
   Research arrangement (Ken, 31 Oct 2026, final): Research keeps its two choices and ONE search. Inside "Research a property", a development
   with an approved PRISM assessment has two views, PRISM Analysis (#/prism/<id>) and Property Data (#/p/<id>, the existing report), with a
   switch between them; Research's own search leads with PRISM for it; every other link (global search, Map, Budget Search, shared #/p/ links)
   opens Property Data as before. The landing explains the five dimensions (landingHtml). Applies
   ONLY to a development whose report has an approved Reveal AND Verdict. A report
   with approved supporting measures but no approved assessment gets no public PRISM entry or page.
   Fails closed: a manifest that is not "approved", a report whose sha256 differs from the manifest, an unknown schema or a
   report that is not an approved release shows NO PRISM at all. It writes no finding of its own: every sentence of
   assessment is approved copy from the report; numbers are the approved metric values, formatted.
   Never shown: score100 (no validated scoring method), Ken's Take (not yet approved), unapproved metrics or copy, and the
   supply measures S3/S4 unless the release itself allows them (allowPublicS3/S4).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GW_PRISM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 'prism-v1-web-1';
  const SCHEMA = 'prism-public-v1';
  const DIR = 'data/prism/v1/';
  const MANIFEST_V = '831114f97c';   // first 10 hex of manifest.json's sha256: a new release changes the address, so caches never mix releases
  const PILLARS = [['P', 'Price Position'], ['R', 'Resale Potential'], ['I', 'Infrastructure & Catalysts'], ['S', 'Supply Pressure'], ['M', 'Market Demand']];
  const SUPPLY_GATE = { 'S.launchedUnsold2km': 'allowPublicS3', 'S.pipeline2km': 'allowPublicS4' };
  const SCOPE = { observed_resale_activity: 'Observed resale activity · project-wide', observed_neighbourhood_market: 'Surrounding resale market' };
  const KIND = { 'completed-condo': 'Condominium', 'awarded-site': 'Awarded site' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SOURCE_NAME = { URA_TRANSACTIONS: 'URA transactions', URA_RENTAL: 'URA rental contracts', URA_DEV_SALES: 'URA developer sales', URA_PIPELINE: 'URA pipeline', URA_DWELLING_UNITS: 'URA dwelling units', URA_SALE_SITES: 'URA Sale Sites', URA_MP2019: 'URA Master Plan 2019 subzones', HDB_PROPERTY: 'HDB property information', HDB_RESALE: 'HDB resale prices', SINGSTAT_RESIDENTS: 'SingStat residents', LTA_RAIL_EXITS: 'LTA station exits', MOE_SCHOOLS: 'MOE schools', NEA_SUPERMARKETS: 'NEA supermarkets', NEA_HAWKERS: 'NEA hawker centres', NPARKS_PARKS: 'NParks parks', ONEMAP: 'OneMap', GW_BEDROOM: 'Groundwork bedroom classification', GW_UPCOMING: 'Groundwork named sites', AMENITIES: 'Amenities (LTA, MOE, NEA, NParks, OneMap)' };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const num = (v, dp) => (isNum(v) ? v.toLocaleString('en-SG', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp == null ? 1 : dp }) : '');
  const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const plural = (n, one, many) => num(n, 0) + ' ' + (n === 1 ? one : (many || one + 's'));
  const ym = (s) => { const m = /^(\d{4})-(\d{2})$/.exec(String(s || '')); return m ? MON[+m[2] - 1] + ' ' + m[1] : null; };
  const day = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? +m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : null; };
  const metres = (m) => (isNum(m) ? (m >= 1000 ? num(m / 1000, 1).replace(/\.0$/, '') + ' km' : num(m, 0) + ' m') : '');
  const money = (v) => (isNum(v) ? '$' + num(v, 0) : '');
  function period(p) {
    if (!p) return '';
    const a = ym(p.start), b = ym(p.end);
    if (a && b) return a === b ? a : a + '–' + b;
    return b || a || '';
  }

  /* ---------------------------------------------------------------- the publication gate (pure; tested in node) */
  function checkManifest(m) {
    if (!m || m.schemaVersion !== SCHEMA) throw new Error('manifest: unknown schema');
    if (m.status !== 'approved' || typeof m.approvalRef !== 'string' || !m.approvalRef || /^TEST/i.test(m.approvalRef)) throw new Error('manifest: not an approved release');
    if (!Array.isArray(m.reports) || !m.reports.length) throw new Error('manifest: no reports');
    m.reports.forEach((r) => {
      if (!r || !/^[a-z0-9-]{1,80}$/.test(r.id) || r.path !== 'reports/' + r.id + '.json' || !/^[0-9a-f]{64}$/.test(r.sha256 || '') || r.approved !== true) throw new Error('manifest: bad report entry');
    });
    return m;
  }
  function checkReport(r, entry) {
    if (!r || r.schemaVersion !== SCHEMA) throw new Error('report: unknown schema');
    if (!entry || r.reportId !== entry.id || !r.subject || r.subject.id !== entry.id) throw new Error('report: id does not match the manifest');
    if (!r.release || r.release.status !== 'approved' || !Array.isArray(r.release.approvedMetrics)) throw new Error('report: not an approved release');
    if (!r.provenance || !r.provenance.approvalRef || /^TEST/i.test(r.provenance.approvalRef)) throw new Error('report: no approval reference');
    if (!r.pillars || typeof r.pillars !== 'object') throw new Error('report: no pillars');
    return r;
  }
  const approved = (x) => !!(x && x.status === 'approved' && x.approval && x.approval.state === 'approved');
  function shown(m, r) {
    if (!m || !m.approval || m.approval.state !== 'approved') return false;
    if (m.status !== 'verified' && m.status !== 'estimated') return false;
    if (m.value === null || m.value === undefined) return false;
    if (r.release.approvedMetrics.indexOf(m.id) < 0) return false;
    if (SUPPLY_GATE[m.id] && r.release[SUPPLY_GATE[m.id]] !== true) return false;   // S3/S4 stay withheld unless the release itself allows them
    return true;
  }

  /* ---------------------------------------------------------------- the view model: only what may be shown */
  function model(r, man) {
    const srcOf = {}; Object.keys(r.pillars).forEach((k) => (Array.isArray(r.pillars[k]) ? r.pillars[k] : []).forEach((m) => { if (m && m.id) srcOf[m.id] = m.sourceIds || []; }));
    const all = {}, pillars = PILLARS.map(([k, name]) => {
      const ms = Array.isArray(r.pillars[k]) ? r.pillars[k] : [];
      const on = ms.filter((m) => shown(m, r)), off = ms.filter((m) => !shown(m, r)).map((m) => m.label).filter(Boolean);
      on.forEach((m) => { all[m.id] = m; });
      return { key: k, name, metrics: on, unpublished: off };
    });
    const assess = approved(r.reveal) && approved(r.verdict) && !!r.reveal.headline && !!r.verdict.headline;
    const text = (a) => (Array.isArray(a) ? a.map((x) => x && x.text).filter((t) => typeof t === 'string' && t) : []);
    const s = r.subject;
    return {
      id: r.reportId, name: s.name, subject: s,
      meta: [s.district ? 'District ' + Number(s.district) : null, s.planningArea || null, KIND[s.kind] || null].filter(Boolean),
      assessment: assess ? {
        reveal: { headline: r.reveal.headline, caveat: r.reveal.caveat || '', uses: r.reveal.uses || [] },
        verdict: { headline: r.verdict.headline, scope: SCOPE[r.verdict.scope] || '', why: text(r.verdict.why), watchOut: text(r.verdict.watchOut), whyUses: (r.verdict.why || []).map((x) => (x.uses || [])[0]) }
      } : null,
      // An approved item that links measures from DIFFERENT datasets is a hidden connection; one resting on a single dataset is supporting
      // context (Ken, 31 Oct 2026). The item, its id and its wording are unchanged; only the heading it sits under follows this rule.
      hidden: (r.hiddenConnections || []).filter(approved).map((h) => {
        const kinds = new Set((h.uses || []).map((u) => (srcOf[u] || []).slice().sort().join('+')).filter(Boolean));
        return { id: h.id, text: h.text, caveat: h.caveat || '', tag: h.evidenceTag, kind: kinds.size >= 2 ? 'connection' : 'context' };
      }),
      question: approved(r.nextBuyerQuestion) && r.nextBuyerQuestion.text ? r.nextBuyerQuestion.text : null,
      pillars, metrics: all,
      count: Object.keys(all).length,
      sources: (r.sources || []).map((x) => ({ id: x.id, publisher: x.publisher, dataset: x.dataset, asAt: x.asAt, updated: x.updated, licence: x.licence ? { name: x.licence.name, url: x.licence.url } : null, attribution: x.attribution, url: x.url })),
      // the "no composite score" limit names an internal field (score100); the page states it in plain words ("There is no overall score")
      // two limits describe how the release is assembled (score100; "only approved metrics carry values"), not the evidence: the page says
      // both in plain words; every limit about the evidence itself is shown as written
      limitations: (r.limitations || []).filter((t) => typeof t === 'string' && !/score100/i.test(t) && !/^Only approved metrics/i.test(t)),
      asOf: r.provenance.sourceAsOf, approvedAt: r.provenance.approvedAt,
      periodsBySource: man && man.dataPeriodsBySource && typeof man.dataPeriodsBySource === 'object' ? man.dataPeriodsBySource : {}
      // never carried: score100, kenTake, unapproved copy or values
    };
  }

  /* ---------------------------------------------------------------- formatting an approved value */
  function value(m) {
    const v = m.value, d = m.detail || {};
    switch (m.unit) {
      case 'months': return m.denominator ? num(v, 0) + ' of ' + num(m.denominator, 0) + ' months' : plural(v, 'month');
      case 'rank': return isNum(d.of) ? ord(v) + ' of ' + num(d.of, 0) : ord(v);
      case 'contracts': return plural(v, 'contract');
      case 'transactions': return plural(v, m.id.indexOf('Resales') > -1 || m.id.indexOf('resales') > -1 || /resale/i.test(m.label) ? 'resale' : 'transaction');
      case 'transactions_minimum': return 'At least ' + num(v, 0);
      case 'resales_per_100_homes_per_year': return num(v, 1) + ' per 100 homes a year';
      case 'supermarkets_within_1km': return plural(v, 'supermarket') + ' within 1 km';
      case 'sites': return plural(v, 'site');
      case 'schools': return plural(v, 'school');
      case 'metres': return metres(v);
      case 'developments': return plural(v, 'development');
      case 'homes': return plural(v, 'home');
      case 'flats': return plural(v, 'flat');
      case 'residents': return plural(v, 'resident');
      case 'pct_change': return (v > 0 ? '+' : '') + num(v, 1) + '%';
      case 'pct_vs_peer_median_psf': return v === 0 ? 'At the peer median' : num(Math.abs(v), 1) + '% ' + (v > 0 ? 'above' : 'below') + ' the peer median';
      case 'SGD': return money(v);
      default: return num(v) + (m.unit ? ' ' + String(m.unit).replace(/_/g, ' ') : '');
    }
  }
  // One short line of the approved detail, for the measures that carry one (names and counts only; never coordinates)
  function detail(m) {
    const d = m.detail; if (!d || typeof d !== 'object') return '';
    const L = [];
    switch (m.id) {
      case 'R.peerRank24': if (isNum(d.peerMedian)) L.push('Peer median ' + num(d.peerMedian, 1)); if (Array.isArray(d.middleHalf) && d.middleHalf.length === 2) L.push('middle half ' + num(d.middleHalf[0], 1) + '–' + num(d.middleHalf[1], 1)); if (Array.isArray(d.nearestPeers) && d.nearestPeers.length) L.push('comparable group includes ' + d.nearestPeers.join(', ')); break;
      case 'R.turnover24': if (d.windows) L.push(['m12', 'm36'].filter((k) => isNum(d.windows[k])).map((k) => (k === 'm12' ? '12 months: ' : '36 months: ') + num(d.windows[k], 1)).join(' · ')); break;
      case 'R.resales12': if (isNum(d.prior12)) L.push(num(d.prior12, 0) + ' in the 12 months before'); break;
      case 'R.paEstablishedTurnover12': if (isNum(d.singapore)) L.push('Singapore: ' + num(d.singapore, 1)); if (isNum(d.developments)) L.push(plural(d.developments, 'development') + ' in the planning area'); break;
      case 'R.resaleAlternatives24_2km': if (isNum(d.developments)) L.push(plural(d.developments, 'development') + (d.scope ? ' (' + d.scope + ')' : '')); break;
      case 'R.threeBedResales24_2km_min': if (isNum(d.classifiedDevelopments) && isNum(d.developments)) L.push(num(d.classifiedDevelopments, 0) + ' of ' + num(d.developments, 0) + ' developments classified by bedroom'); if (isNum(d.resalesInClassifiedDevelopments) && isNum(d.allResales)) L.push(num(d.resalesInClassifiedDevelopments, 0) + ' of ' + num(d.allResales, 0) + ' resales covered'); break;
      case 'R.rentalContracts12': if (Array.isArray(d.byDeclaredBedrooms)) L.push(d.byDeclaredBedrooms.filter((x) => isNum(x.bedrooms) && isNum(x.contracts)).map((x) => x.bedrooms + '-bedroom ' + num(x.contracts, 0) + (isNum(x.medianRent) ? ' (median ' + money(x.medianRent) + ' a month)' : '')).join(' · ')); break;
      case 'I.railStations': if (Array.isArray(d.stations)) L.push(d.stations.map((s) => s.name + ' ' + metres(s.metres)).join(' · ')); break;
      case 'I.primarySchools1km': if (d.nearest && d.nearest.name) L.push('Nearest: ' + d.nearest.name + ' ' + metres(d.nearest.metres)); if (isNum(d.within2km)) L.push(num(d.within2km, 0) + ' within 2 km'); break;
      case 'I.everydayAmenities': if (isNum(d.nearestSupermarketMetres)) L.push('Nearest supermarket ' + metres(d.nearestSupermarketMetres)); if (d.nearestHawker && d.nearestHawker.name) L.push(d.nearestHawker.name + ' ' + metres(d.nearestHawker.metres)); if (d.nearestPark && d.nearestPark.name) L.push(d.nearestPark.name + ' ' + metres(d.nearestPark.metres)); break;
      case 'I.namedSites2km': if (Array.isArray(d.sites)) L.push(d.sites.map((s) => s.name + (s.label ? ' (' + s.label.toLowerCase() + ')' : '') + ' ' + metres(s.metres)).join(' · ')); break;
      case 'S.newSaleDevelopments2km': if (Array.isArray(d.developmentsList) && d.developmentsList.length) L.push(d.developmentsList.map((x) => x.name + (isNum(x.newSales12) ? ', ' + plural(x.newSales12, 'new sale') : '') + ' ' + metres(x.metres)).join(' · ')); break;
      case 'S.recordedDwellingUnits2km': if (isNum(d.developments)) L.push(plural(d.developments, 'development')); if (isNum(d.ecHomes) && d.ecHomes > 0) L.push('including ' + num(d.ecHomes, 0) + ' EC homes'); break;
      case 'M.marketPulse': if (d.sizeBand) L.push(d.sizeBand + (d.direction ? ' · ' + d.direction : '') + (d.strength ? ' · ' + d.strength + ' evidence' : '')); break;
      case 'M.paHdbResales12': if (isNum(d.latest4RoomPlus)) L.push(num(d.latest4RoomPlus, 0) + ' were 4-room or larger'); break;
      case 'M.paPrivateTransactions12': if (d.resales && isNum(d.resales.prior12)) L.push(num(d.resales.prior12, 0) + ' in the 12 months before'); if (d.newSales && isNum(d.newSales.latest12)) L.push(plural(d.newSales.latest12, 'new sale') + ' in the latest 12 months'); break;
      case 'N.hdbFlats2km': if (isNum(d.blocks)) L.push(plural(d.blocks, 'block')); if (isNum(d.rentalFlats)) L.push('including ' + num(d.rentalFlats, 0) + ' rental flats'); if (d.hdbDatasetUpdated) L.push('HDB data updated ' + day(d.hdbDatasetUpdated)); break;
      case 'N.paHdbStock': if (isNum(d.blocks)) L.push(plural(d.blocks, 'block')); break;
      case 'N.paResidents': case 'N.subzoneResidents': if (isNum(d.residents2021)) L.push('June 2021: ' + num(d.residents2021, 0) + (isNum(d.residentsChangePct) ? ' (' + (d.residentsChangePct > 0 ? '+' : '') + num(d.residentsChangePct, 1) + '%)' : '')); break;
      default:
        if (/^P\.peerPosition\./.test(m.id)) { if (isNum(d.subjectMedianPsf) && isNum(d.peerMedianPsf)) L.push(money(d.subjectMedianPsf) + ' psf vs peer median ' + money(d.peerMedianPsf) + ' psf'); if (isNum(d.rank) && isNum(d.of)) L.push(ord(d.rank) + ' of ' + num(d.of, 0) + ' by psf' + (d.tier ? ', ' + d.tier : '')); }
        else if (/^P\.resaleMedian\./.test(m.id)) { if (isNum(d.medianPsf)) L.push(money(d.medianPsf) + ' psf'); if (Array.isArray(d.typicalSqft) && d.typicalSqft.length === 2 && isNum(d.typicalSqft[0])) L.push(d.typicalSqft[0] === d.typicalSqft[1] ? 'about ' + num(d.typicalSqft[0], 0) + ' sq ft' : num(d.typicalSqft[0], 0) + '–' + num(d.typicalSqft[1], 0) + ' sq ft'); }
        else if (/^R\.bedroomResales24\./.test(m.id)) { if (isNum(d.latest12)) L.push(num(d.latest12, 0) + ' in the latest 12 months'); }
    }
    return L.filter(Boolean).join(' · ');
  }
  const srcLine = (m) => (m.sourceIds || []).map((id) => SOURCE_NAME[id] || id).join(', ');

  /* ---------------------------------------------------------------- the opening evidence graphic (V4: benchmark bars, or a two-value strip) */
  function evidence(md) {
    const A = md.assessment, M = md.metrics, t = M['R.turnover24'], pr = M['R.peerRank24'];
    const fig = (v, label, sub) => '<div class="gwp-fig"><b>' + v + '</b><span>' + esc(label) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
    const head = '<p class="gwp-k">PRISM Reveal</p><p class="gwp-rv">' + esc(A.reveal.headline) + '</p>';
    if (t && pr && pr.detail && isNum(pr.detail.peerMedian) && A.reveal.uses.indexOf('R.turnover24') > -1) {
      const peer = pr.detail.peerMedian, top = Math.max(t.value, peer) * 1.12, w = (v) => Math.max(2, Math.round((v / top) * 1000) / 10);
      const bar = (cls, name, v) => '<div class="gwp-bar ' + cls + '"><span class="gwp-bn">' + esc(name) + '</span><span class="gwp-bt" aria-hidden="true"><i style="width:' + w(v) + '%"></i></span><b class="gwp-bv">' + num(v, 1) + '</b></div>';
      const rank = isNum(pr.value) && isNum(pr.detail.of) ? fig(esc(ord(pr.value)) + '<em> of ' + num(pr.detail.of, 0) + '</em>', 'Comparable developments', 'By resale turnover, ' + period(pr.period)) : '';
      return '<div class="gwp-ev" data-gwp-ev="bars">' + head + '<div class="gwp-figs">' + fig(num(t.value, 1), 'Resales per 100 homes a year', 'Annualised, ' + period(t.period)) + rank + '</div>' +
        '<p class="gwp-evk">Against the comparable group</p><div class="gwp-bars" role="img" aria-label="' + esc(md.name + ' ' + num(t.value, 1) + ' resales per 100 homes a year; peer median ' + num(peer, 1)) + '">' +
        bar('me', md.name, t.value) + bar('peer', 'Peer median', peer) + '</div>' +
        '<p class="gwp-evn">Resales per 100 homes a year · ' + esc(period(t.period)) + ' · project-wide · same zero baseline · ' + esc(srcLine(t)) + (A.reveal.caveat ? '. ' + esc(A.reveal.caveat) : '') + '</p></div>';
    }
    const ids = [A.reveal.uses[0], A.verdict.whyUses[0]].filter((id, i, a) => id && M[id] && a.indexOf(id) === i).slice(0, 2);
    if (!ids.length) return '<div class="gwp-ev">' + head + '</div>';
    // a short basis under each value: the qualification that matters (rental flats, the comparison group) and its date
    const sub = (m) => { const d = m.detail || {}; return [m.id === 'N.hdbFlats2km' && isNum(d.rentalFlats) ? 'Includes ' + num(d.rentalFlats, 0) + ' rental flats' : isNum(d.developments) ? plural(d.developments, 'comparable development') : '',
      m.id === 'N.hdbFlats2km' && d.hdbDatasetUpdated ? 'HDB data updated ' + day(d.hdbDatasetUpdated) : period(m.period)].filter(Boolean).join(' · '); };
    const short = (l) => String(l || '').replace(/\s*\([^)]*\)\s*$/, '');
    return '<div class="gwp-ev" data-gwp-ev="strip">' + head + '<div class="gwp-figs">' + ids.map((id) => { const m = M[id]; return fig(esc(m.unit === 'transactions_minimum' ? 'At least ' + num(m.value, 0) : num(m.value, 0)), short(m.label), sub(m)); }).join('') + '</div>' +
      (A.reveal.caveat ? '<p class="gwp-evn">' + esc(A.reveal.caveat) + '</p>' : '') + '</div>';
  }

  /* ---------------------------------------------------------------- HTML */
  const mark = (root, size) => '<img class="gwp-mark" src="' + esc(root) + 'assets/img/prism/prism-mark.png" width="' + size + '" height="' + size + '" alt="PRISM">';
  const brand = (root) => '<div class="gwp-brand">' + mark(root, 52) + '<div><p class="gwp-bname">PRISM <span>by Groundwork</span></p><p class="gwp-bline">Five dimensions. One clearer property decision.</p></div></div>';
  const SHORT = { P: 'Price', R: 'Resale', I: 'Infrastructure', S: 'Supply', M: 'Demand' };
  // Where each measure's evidence lives in the development's Property Data (its own section there), and back. Only measures that are
  // read from that development's own records point there (Ken, 31 Oct 2026: relevant and specific links only).
  const EVIDENCE = [
    [/^R\.(resales12|turnover12|turnover24|activeMonths24|peerRank24)$|^R\.bedroomResales24\./, 'lgTx', 'Sales history'],
    [/^R\.rentalContracts12$/, 'lgRent', 'Rents'],
    [/^P\.(resaleMedian|peerPosition)\./, 'lgTypes', 'Prices by size'],
    [/^M\.marketPulse$/, 'numbers', 'How the price has moved'],
    [/^I\.(railStations|primarySchools1km|everydayAmenities)$/, 'lgLoc', 'Location & amenities']
  ];
  const evidenceOf = (id) => { const e = EVIDENCE.find((x) => x[0].test(id)); return e ? { sec: e[1], label: e[2] } : null; };
  const hasRecords = (md) => !!md.metrics['R.resales12'];   // the development has its own resales, so its Property Data has these sections
  // PRISM Analysis | Property Data, directly under the development's name on both views (links: each view keeps its address and Back/Forward)
  function switchHtml(md, active, root) {
    const tab = (k, href, label, icon) => '<a class="gwp-tab" href="' + href + '" data-gwp-view="' + k + '"' + (k === active ? ' aria-current="page"' : '') + '>' + icon + '<span>' + label + '</span></a>';
    return '<nav class="gwp-tabs" aria-label="' + esc(md.name) + ': views" data-gwp-switch="' + esc(md.id) + '">' + tab('prism', '#/prism/' + esc(md.id), 'PRISM Analysis', mark(root || '../', 20)) +
      tab('data', '#/p/' + esc(md.id), 'Property Data', '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20V12m5 8V7m5 13v-6m5 6V4"/></svg>') + '</nav>';
  }
  // On Property Data: one compact verdict line (replaces the large banner)
  function previewHtml(md, root) {
    if (!md || !md.assessment) return '';   // no approved Reveal + Verdict: no PRISM entry at all
    const A = md.assessment;
    return '<section class="gwp-band" data-gwp-preview="' + esc(md.id) + '"><div class="lg-wrap"><a class="gwp-vl" href="#/prism/' + esc(md.id) + '" data-gwp-open>' + mark(root, 28) +
      '<span class="gwp-vlt"><b>PRISM verdict:</b> ' + esc(A.verdict.headline) + ' <span class="gwp-vlr">· ' + esc(A.reveal.headline) + '</span></span><span class="gwp-vlgo">Open PRISM Analysis ›</span></a></div></section>';
  }
  function metricRow(m, md) {
    const dt = detail(m), p = period(m.period) || (m.sourceIds || []).map((id) => md.periodsBySource[id]).filter(Boolean).join('; '), ev = hasRecords(md) && evidenceOf(m.id);
    return '<div class="gwp-m" data-gwp-metric="' + esc(m.id) + '"><dt>' + esc(m.label) + (m.status === 'estimated' ? ' <span class="gwp-tag">Estimate</span>' : '') + '</dt><dd><b>' + esc(value(m)) + '</b>' +
      (dt ? '<span class="gwp-md">' + esc(dt) + '</span>' : '') + '<span class="gwp-ms">' + esc([p, srcLine(m)].filter(Boolean).join(' · ')) + '</span>' + (m.note && !/\([a-z]+-v\d+\)/i.test(m.note) ? '<span class="gwp-mn">' + esc(m.note) + '</span>' : '') +
      (ev ? '<a class="gwp-evl" href="#/p/' + esc(md.id) + '" data-gwp-evidence="' + ev.sec + '">Evidence: ' + esc(ev.label) + ' <span aria-hidden="true">›</span></a>' : '') + '</dd></div>';
  }
  // Each dimension's headline: its most telling verified figures (approved values, formatted; never a score or a judgement), with a
  // short qualifier. Priority per dimension; a dimension with nothing assessed says so.
  const LEAD = {
    P: ['P.peerPosition.2br', 'P.peerPosition.3br', 'P.peerPosition.1br', 'P.resaleMedian.2br', 'P.resaleMedian.3br', 'P.resaleMedian.1br'],
    R: ['R.peerRank24', 'R.activeMonths24', 'R.resaleAlternatives24_2km', 'R.paEstablishedTurnover12', 'R.turnover24', 'R.resales12', 'R.turnover12'],
    I: ['I.railStations', 'I.everydayAmenities', 'I.primarySchools1km', 'I.namedSites2km'],
    S: ['S.recordedDwellingUnits2km', 'S.newSaleDevelopments2km'],
    M: ['M.marketPulse', 'N.hdbFlats2km', 'M.paPrivateTransactions12', 'M.paHdbResales12', 'N.paResidents']
  };
  function phrase(m) {
    const d = m.detail || {}, v = m.value;
    switch (m.id) {
      case 'R.peerRank24': return value(m) + ' comparable developments';
      case 'R.activeMonths24': return 'A resale in ' + value(m);
      case 'R.resaleAlternatives24_2km': return num(v, 0) + ' condo resales within 2 km';
      case 'R.paEstablishedTurnover12': return num(v, 1) + ' resales per 100 homes in the area';
      case 'I.railStations': return Array.isArray(d.stations) && d.stations[0] ? d.stations[0].name + ' ' + metres(d.stations[0].metres) : value(m);
      case 'S.recordedDwellingUnits2km': return num(v, 0) + ' private homes within 2 km';
      case 'S.newSaleDevelopments2km': return v === 0 ? 'No other development with new sales within 2 km' : plural(v, 'development') + ' with new sales within 2 km';
      case 'M.marketPulse': return (v > 0 ? '+' : '') + num(v, 1) + '% same-size resale prices';
      case 'N.hdbFlats2km': return num(v, 0) + ' HDB flats within 2 km';
      case 'M.paPrivateTransactions12': return num(v, 0) + ' private resales in the planning area';
      case 'M.paHdbResales12': return num(v, 0) + ' HDB resales in the planning area';
      default: return /^P\.peerPosition\.(\d)br$/.test(m.id) ? value(m) + ' (' + m.id.slice(-3, -2) + '-bedroom)' : value(m);
    }
  }
  function qualifier(m) {
    const d = m.detail || {};
    switch (m.id) {
      case 'R.peerRank24': return 'By resale turnover, project-wide · ' + period(m.period);
      case 'I.railStations': case 'I.everydayAmenities': return 'Straight-line distances';
      case 'S.recordedDwellingUnits2km': return 'Homes already recorded, not upcoming supply';
      case 'M.marketPulse': return (d.sizeBand ? d.sizeBand + ' · ' : '') + 'latest 12 months against the 12 before';
      case 'N.hdbFlats2km': return 'A count of flats, not of buyers';
      default: return period(m.period);
    }
  }
  function headline(p) {
    if (!p.metrics.length) return { main: 'Not assessed in this report', sub: '' };
    const by = {}; p.metrics.forEach((m) => { by[m.id] = m; });
    const pick = (LEAD[p.key] || []).map((id) => by[id]).filter(Boolean).concat(p.metrics).filter((m, i, a) => a.indexOf(m) === i);
    const a = phrase(pick[0]), b = pick[1] ? phrase(pick[1]) : '';
    return { main: b && (a + ' · ' + b).length <= 66 ? a + ' · ' + b : a, sub: qualifier(pick[0]) };
  }
  // The five dimensions: one row each with its headline; each opens in place, directly beneath its own row (several may stay open);
  // closed on a first visit. Opened, a dimension shows ALL its approved measures, what it does not assess, and the evidence links.
  function dimsHtml(md) {
    return md.pillars.map((p) => {
      const none = !p.metrics.length, toPrices = none && p.key === 'P' && hasRecords(md), h = headline(p);
      return '<section class="gwp-dim' + (none ? ' gwp-dim--none' : '') + '" id="gwp-' + p.key + '" data-gwp-pillar="' + p.key + '">' +
        '<h3 class="gwp-dimh"><button type="button" class="gwp-dimb" aria-expanded="false" aria-controls="gwpDim' + p.key + '" data-gwp-toggle="' + p.key + '">' +
        '<span class="gwp-pl" aria-hidden="true">' + p.key + '</span><span class="gwp-dn"><b>' + esc(p.name) + '</b><small>' + esc(QUESTION[p.key]) + '</small></span>' +
        '<span class="gwp-hl" data-gwp-headline><b>' + esc(h.main) + '</b>' + (h.sub ? '<small>' + esc(h.sub) + '</small>' : '') + '</span><i class="gwp-chev" aria-hidden="true"></i></button></h3>' +
        '<div class="gwp-dimp" id="gwpDim' + p.key + '" role="region" aria-labelledby="gwpDimL' + p.key + '" hidden><span class="gwp-sr" id="gwpDimL' + p.key + '">' + esc(p.name) + ' in detail</span>' +
        (none ? '<p class="gwp-fine">Not assessed in this report.' + (toPrices ? ' <a class="gwp-evl" href="#/p/' + esc(md.id) + '" data-gwp-evidence="lgTypes">See prices by size in Property Data <span aria-hidden="true">›</span></a>' : '') + '</p>' :
          '<dl class="gwp-ml">' + p.metrics.map((m) => metricRow(m, md)).join('') + '</dl>') +
        (p.unpublished.length ? '<p class="gwp-fine gwp-un"><b>Not assessed in this report:</b> ' + esc(p.unpublished.join('; ')) + '.</p>' : '') + '</div></section>';
    }).join('');
  }
  function layersHtml(md) {
    const list = (kind, title, attr) => { const xs = md.hidden.filter((h) => h.kind === kind); return xs.length ? '<section class="gwp-sec gwp-box" ' + attr + '><p class="gwp-k">' + title + '</p><ul class="gwp-hc">' + xs.map((h) => '<li><p>' + esc(h.text) + '</p>' + (h.caveat ? '<small>' + esc(h.caveat) + '</small>' : '') + '</li>').join('') + '</ul></section>' : ''; };
    const H = list('connection', 'Hidden connections', 'data-gwp-hidden'), C = list('context', 'Supporting context', 'data-gwp-context');
    // "Explore sales by size": the development's own Property Data, at its sizes section (only where it has resales to show)
    const sizes = hasRecords(md) ? '<a class="gwp-sizes" href="#/p/' + esc(md.id) + '" data-gwp-evidence="lgTypes" data-gwp-sizes>Explore sales by size <span aria-hidden="true">›</span></a>' : '';
    const Q = md.question ? '<section class="gwp-sec gwp-box gwp-q" data-gwp-question><p class="gwp-k">Next buyer question</p><p>' + esc(md.question) + '</p>' + sizes + '</section>' : '';
    return (H || C || Q ? '<div class="gwp-two">' + H + C + Q + '</div>' : '') +
      '<section class="gwp-sec gwp-dims" aria-labelledby="gwpDimsH"><div class="gwp-sech"><div><h2 id="gwpDimsH">The five PRISM dimensions</h2><p class="gwp-fine">Each shows a key finding. Open any for its measures, dates and sources. PRISM gives no overall score.</p></div>' +
      '<p class="gwp-all"><button type="button" data-gwp-all="open">Expand all</button><span aria-hidden="true">/</span><button type="button" data-gwp-all="close">Collapse all</button></p></div><div class="gwp-ds">' + dimsHtml(md) + '</div></section>' + sourcesHtml(md);
  }
  function sourcesHtml(md) {
    const used = {}; Object.keys(md.metrics).forEach((k) => (md.metrics[k].sourceIds || []).forEach((s) => { used[s] = 1; }));
    const S = md.sources.filter((s) => used[s.id]);
    return '<details class="gwp-d gwp-src" id="gwp-src" data-gwp-sources><summary><span class="gwp-pn">Sources, data periods and limits</span></summary><div class="gwp-din">' +
      '<ul class="gwp-sl">' + S.map((s) => '<li><b>' + esc(s.publisher) + '</b> · ' + esc(s.dataset) + (s.asAt ? ' · as at ' + esc(ym(s.asAt) || day(s.asAt) || s.asAt) : s.updated ? ' · updated ' + esc(day(s.updated) || s.updated) : '') +
        (s.licence && s.licence.url ? ' · <a href="' + esc(s.licence.url) + '" target="_blank" rel="noopener">' + esc(s.licence.name) + '</a>' : s.licence ? ' · ' + esc(s.licence.name) : '') + (s.attribution ? '<small>' + esc(s.attribution) + '</small>' : '') + '</li>').join('') + '</ul>' +
      (md.limitations.length ? '<p class="gwp-fine"><b>Limits of this evidence</b></p><ul class="gwp-lim">' + md.limitations.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') +
      '<p class="gwp-fine">PRISM V1 · records to ' + esc(ym(md.asOf) || md.asOf) + (md.approvedAt ? ' · published ' + esc(day(md.approvedAt)) : '') + '. Analysis and derived statistics by Groundwork; not endorsed by the data publishers.</p></div></details>';
  }
  // The PRISM Analysis view. o.site: the launch's own site { url } (a launch has no resale report); o.compare: offer Compare.
  function pageHtml(md, o) {
    const root = o.root || '../', A = md.assessment, back = o.backHref || '#/p/' + md.id;
    if (!A) return '';
    const calc = '<a class="lg-btn" href="' + esc(root) + 'tools/payment-planner/" data-gwp-calc>Calculate my purchase</a>';   // a clean start in the existing calculator: nothing is passed to it
    const acts = (o.site && o.site.url ? '<a class="lg-btn" href="' + esc(o.site.url) + '" target="_blank" rel="noopener" data-gwp-site>Open its site ↗</a>' : '') +
      (o.compare ? '<a class="lg-btn" href="#/compare/' + esc(md.id) + '" data-gwp-compare>Compare</a>' : '') + calc;
    const head = '<header class="gwp-head"><nav class="gwp-crumb" aria-label="Breadcrumb"><a href="#/">Research</a><span aria-hidden="true">›</span><span aria-current="page">' + esc(md.name) + '</span></nav>' +
      '<div class="gwp-ttl"><div class="gwp-ht"><h1 class="gwp-h1">' + esc(md.name) + '</h1>' + (md.meta.length ? '<p class="gwp-meta">' + esc(md.meta.join(' · ')) + '</p>' : '') + '</div><div class="gwp-acts">' + acts + '</div></div>' +
      switchHtml(md, 'prism', root) + '<img class="gwp-hero" src="' + esc(root) + 'assets/img/prism/prism-hero.svg" width="600" height="420" alt="" aria-hidden="true"></header>';
    const bar = '<nav class="gwp-bar2" aria-label="On this page" data-gwp-bar><div class="gwp-bar2-in"><button type="button" data-gwp-jump="sum" aria-current="true">Summary</button>' +
      md.pillars.map((p) => '<button type="button" data-gwp-jump="' + p.key + '"' + (p.metrics.length ? '' : ' class="dim"') + '><b>' + p.key + '</b> ' + SHORT[p.key] + '</button>').join('') + '<button type="button" data-gwp-jump="src">Sources</button></div></nav>';
    const next = '<section class="gwp-next" aria-label="Where next"><a class="gwp-nx" href="' + esc(back) + '" data-gwp-back><b>Property Data</b><span>' + (hasRecords(md) ? 'Prices, sales and rents for ' + esc(md.name) : 'Explore the numbers') + '</span></a>' +
      '<a class="gwp-nx" href="' + esc(root) + 'tools/payment-planner/" data-gwp-calc2><b>Calculate my purchase</b><span>Cash, CPF and the monthly instalment</span></a></section>';
    return '<div class="gwp-page" data-gwp-page="' + esc(md.id) + '" data-gwp-mode="assessment"><div class="gwp-wrap">' + head + '</div>' + bar + '<div class="gwp-wrap">' +
      '<div id="gwp-sum" class="gwp-sumh"><div class="gwp-brand gwp-brand--sm">' + mark(root, 28) + '<p><b>PRISM</b> by Groundwork <span>· Five dimensions. One clearer property decision.</span></p></div></div>' +
      '<article class="gwp-card gwp-open"><div class="gwp-v"><p class="gwp-vk">PRISM Verdict' + (A.verdict.scope ? ' · ' + esc(A.verdict.scope) : '') + '</p><h2 class="gwp-vh">' + esc(A.verdict.headline) + '</h2></div>' +
      '<div class="gwp-why"><h3>Why?</h3><ul>' + A.verdict.why.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></div>' +
      (A.verdict.watchOut.length ? '<div class="gwp-wo"><span class="gwp-wi" aria-hidden="true">!</span><div><h3>What should I watch out for?</h3><ul>' + A.verdict.watchOut.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></div></div>' : '') +
      '<div class="gwp-rvl">' + evidence(md) + '</div></article>' + layersHtml(md) +
      '<p class="gwp-foot">From official records to ' + esc(ym(md.asOf) || md.asOf) + '. PRISM describes what the records show; it is not a valuation or a purchase recommendation.</p>' + next + '</div></div>';
  }

  /* ---------------------------------------------------------------- browser: load, verify, mount */
  const cache = { manifest: null, reports: {} };
  function hex(buf) { return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
  function sha256(text) {
    const C = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
    if (!C || typeof TextEncoder === 'undefined') return Promise.reject(new Error('no digest'));   // fail closed: never shown unverified
    return C.digest('SHA-256', new TextEncoder().encode(text)).then(hex);
  }
  function manifest(root) {
    if (!cache.manifest) {
      cache.manifest = fetch(root + DIR + 'manifest.json?v=' + MANIFEST_V).then((r) => { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); }).then(checkManifest);
      cache.manifest.catch(() => { cache.manifest = null; });
    }
    return cache.manifest;
  }
  // The model for one development, or null (not in the release, or anything failed a check)
  function load(root, id) {
    if (!/^[a-z0-9-]{1,80}$/.test(String(id || ''))) return Promise.resolve(null);
    if (cache.reports[id]) return cache.reports[id];
    const p = manifest(root).then((m) => {
      const e = m.reports.find((x) => x.id === id); if (!e) return null;
      return fetch(root + DIR + e.path + '?v=' + e.sha256.slice(0, 10)).then((r) => { if (!r.ok) throw new Error('report ' + r.status); return r.text(); })
        .then((t) => sha256(t).then((h) => { if (h !== e.sha256) throw new Error('report: sha256 does not match the manifest'); return model(checkReport(JSON.parse(t), e), m); }));
    }).catch(() => null);
    cache.reports[id] = p; p.then((x) => { if (x === null) delete cache.reports[id]; });
    return p;
  }
  const settled = {};   // id -> model (or null) once loaded, so a page redraw can place the PRISM parts without waiting
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } }, del: (k) => { try { sessionStorage.removeItem(k); } catch (e) { /* */ } } };
  const offsetTo = (el, extra) => { const y = el.getBoundingClientRect().top + window.scrollY - extra; window.scrollTo(0, Math.max(0, y)); };
  // Property Data (the existing report or launch page): the tabs under the name, one compact verdict line, and on each section whose
  // evidence a published PRISM dimension reads, a link back to that dimension
  function mountPreview(app, id, o) {
    const root = o.root || '../';
    const place = (md) => {
      if (!md || !md.assessment || (o.still && !o.still())) return;
      app.querySelectorAll('[data-gwp-preview], [data-gwp-switch], [data-gwp-back2]').forEach((x) => x.remove());
      const hero = app.querySelector(o.after || 'header.lg-hero'); if (!hero) return;
      hero.insertAdjacentHTML('afterend', previewHtml(md, root));
      const nameAt = hero.querySelector('.lg-id') || hero.querySelector('h1');
      if (nameAt) nameAt.insertAdjacentHTML('afterend', switchHtml(md, 'data', root));
      // back-links: only to dimensions with published measures read from that section
      const secs = {}; Object.keys(md.metrics).forEach((mid) => { const e = evidenceOf(mid); if (e) { const k = mid.charAt(0) === 'N' ? 'M' : mid.charAt(0); secs[e.sec] = secs[e.sec] || k; } });
      if (hasRecords(md)) Object.keys(secs).forEach((sec) => {
        const head = app.querySelector('#' + sec + ' .gwr-head, #' + sec + ' .lg-head'); if (!head) return;
        const k = secs[sec], name = (PILLARS.find((x) => x[0] === k) || [])[1];
        head.insertAdjacentHTML('beforeend', '<a class="gwp-back2" href="#/prism/' + esc(md.id) + '/' + k.toLowerCase() + '" data-gwp-back2="' + k + '">' + mark(root, 18) + '<span>PRISM · ' + esc(name) + ' ›</span></a>');
      });
      app.querySelectorAll('[data-gwp-open], [data-gwp-back2], [data-gwp-switch] [data-gwp-view="prism"]').forEach((a) => a.addEventListener('click', () => { ss.set('gw.prism.from', id); }));
      const goto = ss.get('gw.prism.goto');
      if (goto && goto.indexOf(id + ':sec:') === 0) { ss.del('gw.prism.goto'); const el = app.querySelector('#' + goto.slice((id + ':sec:').length)); if (el) { el.scrollIntoView({ block: 'start' }); return; } }
      if (ss.get('gw.prism.from') === id && o.returning) { const s = app.querySelector('[data-gwp-preview]'); if (s) s.scrollIntoView({ block: 'center' }); ss.del('gw.prism.from'); }
    };
    if (id in settled) { place(settled[id]); return Promise.resolve(settled[id]); }
    return load(root, id).then((md) => { settled[id] = md; place(md); return md; });
  }
  function show(app, id, o) {
    return load(o.root || '../', id).then((md) => {
      if (o.still && !o.still()) return md;
      if (!md || !md.assessment) { if (o.fallback) o.fallback(); return null; }
      settled[id] = md;
      document.title = 'PRISM · ' + md.name + ' — Research — Groundwork';
      app.innerHTML = pageHtml(md, o);
      // evidence links: the development's Property Data, at the section that holds the evidence
      app.querySelectorAll('[data-gwp-evidence]').forEach((a) => a.addEventListener('click', () => ss.set('gw.prism.goto', id + ':sec:' + a.dataset.gwpEvidence)));
      // the dimensions: each opens and closes on its own; the open ones are remembered for this visit (Back/Forward and Property Data
      // round trips return to the same state); a first visit opens none
      const key = 'gw.prism.open:' + id, rows = Array.from(app.querySelectorAll('[data-gwp-toggle]'));
      let full = false;
      const setOpen = (k, on) => { const b = app.querySelector('[data-gwp-toggle="' + k + '"]'), p = b && app.querySelector('#' + b.getAttribute('aria-controls')); if (!p) return; p.hidden = !on; b.setAttribute('aria-expanded', String(on)); b.closest('.gwp-dim').classList.toggle('open', on); };
      const save = () => ss.set(key, rows.filter((b) => b.getAttribute('aria-expanded') === 'true').map((b) => b.dataset.gwpToggle).join(','));
      const opened = () => { if (!full && o.track) { full = true; o.track('full'); } };
      rows.forEach((b) => b.addEventListener('click', () => { const on = b.getAttribute('aria-expanded') !== 'true'; setOpen(b.dataset.gwpToggle, on); save(); if (on) opened(); }));
      app.querySelectorAll('[data-gwp-all]').forEach((b) => b.addEventListener('click', () => { const on = b.dataset.gwpAll === 'open'; rows.forEach((r) => setOpen(r.dataset.gwpToggle, on)); save(); if (on) opened(); }));
      (ss.get(key) || '').split(',').filter((k) => /^[PRISM]$/.test(k)).forEach((k) => setOpen(k, true));
      const src = app.querySelector('[data-gwp-sources]'); if (src) src.addEventListener('toggle', () => { if (src.open) opened(); });
      // print: every dimension in full (the page's printed copy is the whole report)
      const beforePrint = () => rows.forEach((r) => { const p = app.querySelector('#' + r.getAttribute('aria-controls')); if (p) p.setAttribute('data-gwp-print', p.hidden ? '1' : ''); });
      window.addEventListener('beforeprint', beforePrint);
      // the section bar: Summary and Sources move within the page; P/R/I/S/M open that dimension and move to it (the address is not changed)
      const bar = app.querySelector('[data-gwp-bar]'), navH = () => (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gw-navh')) || 58) + (bar ? bar.offsetHeight : 0) + 10;
      const target = (k) => app.querySelector(k === 'sum' ? '#gwp-sum' : k === 'src' ? '#gwp-src' : '#gwp-' + k);
      const go = (k) => { const t = target(k); if (!t) return; if (k === 'src' && !t.open) t.open = true; if (/^[PRISM]$/.test(k)) { setOpen(k, true); save(); opened(); } offsetTo(t, navH()); };
      if (bar) {
        bar.querySelectorAll('[data-gwp-jump]').forEach((b) => b.addEventListener('click', () => go(b.dataset.gwpJump)));
        const mark2 = () => { let cur = 'sum'; ['sum', 'P', 'R', 'I', 'S', 'M', 'src'].forEach((k) => { const t = target(k); if (t && t.getBoundingClientRect().top - navH() < 40) cur = k; });
          bar.querySelectorAll('[data-gwp-jump]').forEach((b) => { const on = b.dataset.gwpJump === cur; if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); if (on && bar.scrollWidth > bar.clientWidth) { const r = b.getBoundingClientRect(), br = bar.getBoundingClientRect(); if (r.left < br.left || r.right > br.right) bar.querySelector('.gwp-bar2-in').scrollLeft += r.left - br.left - 16; } }); };
        let raf = 0; const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark2); };
        window.addEventListener('scroll', onScroll, { passive: true });
        const stop = () => { if (!app.contains(bar)) { window.removeEventListener('scroll', onScroll); window.removeEventListener('hashchange', stop); window.removeEventListener('beforeprint', beforePrint); } }; window.addEventListener('hashchange', stop);
      }
      // a link to one dimension (#/prism/<id>/<p|r|i|s|m>, e.g. from Property Data): that dimension, opened
      if (o.dim && /^[PRISM]$/.test(o.dim)) requestAnimationFrame(() => go(o.dim));
      // Back to Property Data: the browser's own Back when the visitor came from it (it keeps its place), otherwise its address
      app.querySelectorAll('[data-gwp-back]').forEach((a) => a.addEventListener('click', (ev) => {
        if (ss.get('gw.prism.from') === id && o.cameFromReport && o.cameFromReport()) { ev.preventDefault(); history.back(); }
      }));
      if (o.track) o.track('open');
      return md;
    });
  }

  /* ---------------------------------------------------------------- Research's own search leads with PRISM (never the global search) */
  // A launch with its own site in the search results ("Has its own site"): its PRISM Analysis leads, before "Open its site"
  function leadSites(box, o) {
    box.querySelectorAll('.v2-site a[data-kpt-ms]').forEach((a) => {
      const id = a.getAttribute('data-kpt-ms'), card = a.closest('.v2-site');
      if (!card || card.querySelector('[data-gwp-sitelead]')) return;
      load(o.root || '../', id).then((md) => {
        if (!md || !md.assessment || !card.isConnected || card.querySelector('[data-gwp-sitelead]')) return;
        a.insertAdjacentHTML('beforebegin', '<a class="v2-btn pri gwp-sitego" href="#/prism/' + esc(md.id) + '" data-gwp-sitelead>PRISM Analysis ›</a>');
        a.classList.remove('pri');
        card.insertAdjacentHTML('beforeend', '<p class="gwp-sitev"><span class="gwp-k">PRISM Reveal</span> ' + esc(md.assessment.verdict.headline) + '</p>');
      });
    });
  }

  /* ---------------------------------------------------------------- the Research landing: what PRISM is, compactly */
  const ICON = {
    P: '<path d="M5 20V14M10 20V9M15 20V12M20 20V5"/>', R: '<path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/>',
    I: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', S: '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 13l9 4.5 9-4.5"/>',
    M: '<circle cx="8" cy="9" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3 20c.6-3.3 2.6-5 5-5s4.4 1.7 5 5M13.5 17c.5-1.6 1.6-2.6 3-2.6 1.9 0 3.2 1.4 3.5 4"/>'
  };
  const QUESTION = {   // Ken's wording, 31 Oct 2026
    P: 'Am I paying a reasonable price compared with relevant alternatives?', R: 'What evidence suggests future buyers could find this property attractive?',
    I: 'What nearby amenities and upcoming changes matter?', S: 'How much competition could this property face?', M: 'What does actual transaction activity tell us about market demand?'
  };
  const ico = (k) => '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + ICON[k] + '</svg>';
  // The landing (Ken, 31 Oct 2026): the one search is the action; PRISM is explained beside it (education, not navigation); the developments
  // with a PRISM report are offered as plain links under the search, read from the release.
  function landingHtml(root) {
    return '<section class="gwp-land" data-gwp-land aria-labelledby="gwpLandH"><div class="gwp-intro"><img class="gwp-imotif" src="' + esc(root) + 'assets/img/prism/prism-hero.svg" width="600" height="420" alt="" aria-hidden="true">' + brand(root) +
      '<p class="gwp-ilead"><b>The bigger picture behind the numbers.</b> Five dimensions help you understand price, resale, location, supply and demand, with the evidence to explain why.</p>' +
      '<h3 id="gwpLandH">Five questions every property buyer should consider</h3><ul class="gwp-qs">' +
      PILLARS.map(([k, n]) => '<li><span class="gwp-qi">' + ico(k) + '</span><span><b>' + esc(n) + '</b><span>' + esc(QUESTION[k]) + '</span></span></li>').join('') + '</ul></div></section>';
  }
  function mountLanding(home, o) {
    const root = o.root || '../';
    if (!home.querySelector('[data-gwp-land]')) { const at = home.querySelector(o.after); if (at) at.insertAdjacentHTML('afterend', landingHtml(root)); }
    { const sb0 = home.querySelector('#sb'), hint = home.querySelector('#lgCount'); if (sb0 && hint && sb0.nextElementSibling !== hint) sb0.insertAdjacentElement('afterend', hint); }   // "If several match…" belongs to the box
    if (!home.querySelector('[data-gwp-picks]')) {
      const sb = home.querySelector(o.picksAfter || '#lgCount'); if (!sb) return;
      sb.insertAdjacentHTML('afterend', '<div class="gwp-picks" data-gwp-picks hidden><p class="gwp-pk">' + mark(root, 22) + '<span>Explore a PRISM report</span></p><div class="gwp-pl2" data-gwp-picklist></div></div>');
      const box = home.querySelector('[data-gwp-picks]');
      manifest(root).then((m) => Promise.all(m.reports.map((r) => load(root, r.id)))).then((ms) => {
        const ok = ms.filter((x) => x && x.assessment); if (!ok.length) return;
        box.querySelector('[data-gwp-picklist]').innerHTML = ok.map((x) => '<a class="gwp-chip" href="#/prism/' + esc(x.id) + '" data-gwp-open-id="' + esc(x.id) + '">' + esc(x.name) + ' <span aria-hidden="true">›</span></a>').join('');
        box.hidden = false;
      }).catch(() => {});
    }
  }

  return { VERSION, switchHtml, leadSites, layersHtml, dimsHtml, evidenceOf, headline, landingHtml, mountLanding, QUESTION, SCHEMA, DIR, MANIFEST_V, PILLARS, checkManifest, checkReport, approved, shown, model, value, detail, period, evidence, previewHtml, pageHtml, load, mountPreview, show, _cache: cache, _settled: settled };
});
