/* ==========================================================================
   GROUNDWORK — MRT today and future MRT on a development's Property Data page (Future MRT Intelligence Phase 2, pilot; Groundwork 01, 6 Nov 2026).
   Shown in the report's "Location & amenities" section, below the map and its nearest-places list.

   Reads ONLY data/transport/v1/ (Claude C, built from approved PRISM V1.1 lines by tools/transit/build-transit-data.js):
     index.json  pinned below by sha256: the PRISM release and each development file with its sha256
     <id>.json   schema gw-transit-v1: stations in service (to the nearest station exit) and stations under construction (to the planned
                 station site), straight-line distances, LTA target years, and the source records
   plus one pinned addition, INTERCHANGES below: a station in service that gains a line under construction (Hougang MRT, Cross Island Line,
   checked on LTA's Cross Island Line page, last updated 4 Aug 2026, on 6 Nov 2026; approved by Groundwork 01, 6 Nov 2026).
   Fails closed: a file that is not the pinned one, or not in the expected form, shows nothing (the rest of the page is unaffected).
   Facts only: names, status, straight-line distances and LTA target years. No ranking, score, forecast, price or value wording.
   Pure helpers work in Node for the tests; mount() is browser only. UMD: window.GW_TRANSIT.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.GW_TRANSIT = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const TR = { SCHEMA: 'gw-transit-v1', INDEX_SCHEMA: 'gw-transit-index-v1', DIR: 'data/transport/v1/',
    INDEX: '9c501e282bea9fea07ef865ae544ce95c7b2f6f20cd54681712a1c70ab49be01' };
  // A station in service that gains a line under construction. Keyed by the in-service station's name; its distance is the in-service one
  // (to today's station exits: the new platforms' entrances are not published). Only facts LTA states.
  const INTERCHANGES = {
    'Hougang MRT': { line: 'Cross Island Line', code: 'CR8', status: 'under_construction', ltaTarget: '2030',
      source: { id: 'LTA_CRL_PAGE', publisher: 'Land Transport Authority (LTA)', title: 'Cross Island Line project page', updated: '2026-08-04', checked: '2026-11-06',
        states: 'Hougang (CR8) is a Cross Island Line Phase 1 interchange station; Phase 1 is expected to be completed by 2030.' },
      approvalRef: 'Groundwork 01, Future MRT Intelligence Phase 2, 6 Nov 2026' },
  };
  const STATUS = { operational: 'In service', under_construction: 'Under construction' };
  const SHOWN_NOT = /apprecia|uplift|capital gain|price|value|valuation|invest|boost|premium|rank|score|percentile|closer than|similar developments|forecast|expected to rise|walk/i;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const metres = (m) => 'about ' + Number(m).toLocaleString('en-SG') + ' m';
  const DATE = (d) => { const p = String(d || '').split('-'); return p.length === 3 ? +p[2] + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] + ' ' + p[0] : ''; };

  /* ---------------- pure: checks ---------------- */
  function checkIndex(x) {
    if (!x || x.schema !== TR.INDEX_SCHEMA || !x.prismRelease || !Array.isArray(x.files)) throw new Error('transit index: schema');
    x.files.forEach((f) => { if (!/^[a-z0-9-]{1,80}$/.test(f.id || '') || f.path !== f.id + '.json' || !/^[0-9a-f]{64}$/.test(f.sha256 || '')) throw new Error('transit index: entry'); });
    return x;
  }
  const dist = (s) => Number.isInteger(s.distanceM) && s.distanceM >= 0 && s.distanceM <= 5000 && s.distanceM % 10 === 0;
  function checkFile(o, entry) {
    if (!o || o.schema !== TR.SCHEMA || o.id !== entry.id || !o.inService || !o.upcoming) throw new Error('transit: schema');
    const S = o.inService.stations, U = o.upcoming.stations;
    if (!Array.isArray(S) || !Array.isArray(U) || !S.length) throw new Error('transit: stations');
    if (!S.every((s) => s.status === 'operational' && s.measuredTo === 'station_exit' && /^(MRT|LRT)$/.test(s.type) && s.name && dist(s))) throw new Error('transit: in service');
    if (!U.every((s) => s.status === 'under_construction' && s.measuredTo === 'station_site' && s.name && s.line && s.code && /^20\d\d$/.test(s.ltaTarget) && dist(s))) throw new Error('transit: upcoming');
    if (!/LTA targets and can change/.test(o.upcoming.note || '')) throw new Error('transit: note');
    const shown = [o.inService.label, o.inService.basis, o.upcoming.label, o.upcoming.basis, o.upcoming.note].concat(S.concat(U).map((s) => [s.name, s.line || '', s.code || ''].join(' ')));
    if (shown.some((t) => SHOWN_NOT.test(t))) throw new Error('transit: wording');
    return o;
  }

  /* ---------------- pure: what is shown ---------------- */
  // today: stations in service, nearest first. future: stations under construction plus interchanges with a line under construction, nearest first.
  function rows(o) {
    const today = o.inService.stations.slice().sort((a, b) => a.distanceM - b.distanceM).map((s) => ({ name: s.name, distanceM: s.distanceM, status: STATUS[s.status], detail: '' }));
    const future = o.upcoming.stations.map((s) => ({ name: s.name, distanceM: s.distanceM, status: STATUS[s.status], line: s.line, code: s.code, ltaTarget: s.ltaTarget, kind: 'new' }));
    o.inService.stations.forEach((s) => { const x = INTERCHANGES[s.name]; if (x) future.push({ name: s.name, distanceM: s.distanceM, status: STATUS[x.status], line: x.line, code: x.code, ltaTarget: x.ltaTarget, kind: 'interchange', ref: x }); });
    future.sort((a, b) => a.distanceM - b.distanceM || (a.kind === 'new' ? -1 : 1));
    return { today, future };
  }
  function sourcesLine(o, R) {
    const by = {}; (o.sources || []).forEach((s) => { by[s.id] = s; });
    const parts = [];
    if (by.LTA_RAIL_EXITS) parts.push('<a href="' + esc(by.LTA_RAIL_EXITS.url) + '" target="_blank" rel="noopener">LTA MRT Station Exit</a> (data.gov.sg)');
    if (by.URA_MP2025_RAIL_STATIONS) parts.push('<a href="' + esc(by.URA_MP2025_RAIL_STATIONS.url) + '" target="_blank" rel="noopener">URA Master Plan 2025 Rail Station Layer</a> (data.gov.sg; amendment of ' + esc(DATE(by.URA_MP2025_RAIL_STATIONS.updated)) + ', accessed ' + esc(DATE(by.URA_MP2025_RAIL_STATIONS.accessed)) + ')');
    const lta = by.LTA_RAIL_PROJECTS, ix = R.future.find((r) => r.kind === 'interchange');
    if (lta || ix) parts.push('LTA, Cross Island Line project page (last updated ' + esc(DATE((lta && lta.updated) || (ix && ix.ref.source.updated))) + ', checked ' + esc(DATE(ix ? ix.ref.source.checked : lta.accessed)) + ')');
    return 'Sources: ' + parts.join('; ') + '. data.gov.sg data under the Singapore Open Data Licence version 1.0. Line, status and target years as LTA states them.';
  }
  function html(o) {
    const R = rows(o), li = (r, fut) => '<li data-gwt-row="' + esc(r.name) + (fut ? '|' + esc(r.code) : '') + '"><div class="gwt-top"><b>' + esc(r.name) + '</b><span class="gwt-d">' + esc(metres(r.distanceM)) + '</span></div>' +
      '<span class="gwt-s">' + (fut ? esc(r.line) + (r.kind === 'interchange' ? ' interchange' : '') + ' (' + esc(r.code) + ') · ' : '') + esc(r.status) + (fut ? ' · <span data-gwt-target>LTA target ' + esc(r.ltaTarget) + '</span>' : '') + '</span>' +
      (r.kind === 'interchange' ? '<span class="gwt-x">New platforms at today’s station. Distance to today’s station exits.</span>' : '') + '</li>';
    return '<div class="gwt" data-gwt="' + esc(o.id) + '"><h3 class="gwt-h">MRT today and future MRT</h3><div class="gwt-cols">' +
      '<div class="gwt-col" data-gwt-today><p class="gwt-k">' + esc(o.inService.label) + '</p><ul class="gwt-list">' + R.today.map((r) => li(r, false)).join('') + '</ul>' +
        '<p class="gwl-fine">' + esc(o.inService.basis.replace(/\.$/, '')) + ' to the nearest station exit.</p></div>' +
      '<div class="gwt-col" data-gwt-future><p class="gwt-k">Future MRT</p><ul class="gwt-list">' + R.future.map((r) => li(r, true)).join('') + '</ul>' +
        '<p class="gwl-fine" data-gwt-note>' + esc(o.upcoming.basis) + ' ' + esc(o.upcoming.note) + '</p></div>' +
      '</div><p class="gwl-fine" data-gwt-src>' + sourcesLine(o, R) + '</p></div>';
  }

  /* ---------------- browser ---------------- */
  function hex(buf) { return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
  function sha256(text) {
    const C = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
    if (!C || typeof TextEncoder === 'undefined') return Promise.reject(new Error('no digest'));   // fail closed: never shown unverified
    return C.digest('SHA-256', new TextEncoder().encode(text)).then(hex);
  }
  const getText = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); });
  let idx = null; const files = {};
  function index(base) {
    if (!idx) { idx = getText(base + TR.DIR + 'index.json?v=' + TR.INDEX.slice(0, 10)).then((t) => sha256(t).then((h) => { if (h !== TR.INDEX) throw new Error('transit index: not the approved file'); return checkIndex(JSON.parse(t)); })); idx.catch(() => { idx = null; }); }
    return idx;
  }
  function load(base, id) {
    return index(base).then((ix) => {
      const e = ix.files.find((f) => f.id === id); if (!e) return null;
      if (!files[id]) { files[id] = getText(base + TR.DIR + e.path + '?v=' + e.sha256.slice(0, 10)).then((t) => sha256(t).then((h) => { if (h !== e.sha256) throw new Error('transit: sha256'); return checkFile(JSON.parse(t), e); })); files[id].catch(() => { delete files[id]; }); }
      return files[id];
    });
  }
  function css(href) { if (document.querySelector('link[href="' + href + '"]')) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
  // sec: the report's Location & amenities section ([data-lg-loc]); o: { id, root ('../'), css (gw-transit.css address with its version) }
  function mount(sec, o) {
    if (!sec || sec.__gwt) return; sec.__gwt = true;
    const base = (o && o.root) || '../';
    return load(base, o.id).then((d) => {
      if (!d || !sec.isConnected) return;
      if (o.css) css(o.css);
      const after = sec.querySelector('[data-gwl]'); if (!after) return;
      after.insertAdjacentHTML('afterend', html(d));
    }).catch(() => { /* fail closed: nothing shown */ });
  }

  return { TR, INTERCHANGES, STATUS, SHOWN_NOT, checkIndex, checkFile, rows, html, metres, mount };
});
