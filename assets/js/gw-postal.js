/* ==========================================================================
   Groundwork: postal codes. ONE shared module (browser + Node) used by the Map, What Can My Budget Buy? and Property values & market prices,
   so a six-digit code means the same thing everywhere: the same lookup, the same messages, the same way of reading the address.
   - lookup(code): the address OneMap holds for a Singapore postal code (OneMap's public address search; a typed code is sent to OneMap, which also serves the basemap).
   - roadKey / nameKey: the one way a road or a development name is compared (OneMap writes "AVENUE", HDB's records write "AVE").
   - hdbTowns / devMatch: which HDB town or which development an address is. Pure functions over data the caller already holds; no network, no DOM.
   Nothing here values a property. It only finds which one an address is.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GW_POSTAL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ONEMAP = 'https://www.onemap.gov.sg/api/common/elastic/search?returnGeom=Y&getAddrDetails=Y&pageNum=1&searchVal=';
  const nil = (v) => (v && String(v).toUpperCase() !== 'NIL' ? String(v) : '');
  const TITLE = (s) => String(s || '').toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (x, a, b) => a + b.toUpperCase()).replace(/\b(Mrt|Hdb|Lrt|Bto|Ec|U\/c)\b/gi, (w) => (w.toLowerCase() === 'u/c' ? 'U/C' : w.toUpperCase()));

  /* "579600", or "Singapore 579600": a six-digit number is a postal code; sectors run 01 to 82 */
  const code = (q) => { const x = /^\s*(?:s(?:ingapore)?\s*\(?)?(\d{6})\)?\s*$/i.exec(String(q || '')); return x ? x[1] : null; };
  const valid = (c) => { const s = +String(c).slice(0, 2); return s >= 1 && s <= 82; };
  const msg = (st, c) => ({ loading: 'Looking up ' + c + '…', none: 'No address found for postal code ' + c + '. Check the number, or try a road or development name.', invalid: c + ' is not a Singapore postal code. They start with 01 to 82.' }[st] || 'Postal codes could not be looked up just now. Check your connection and try again.');

  /* ---- the lookup: one answer per code, remembered for the page's lifetime (a failure is not remembered) ---- */
  const PC = {}, state = {}, asked = {};   // PC: key -> address; state: code -> loading | ok | none | invalid | error
  const stateOf = (n) => (PC[n] ? 'ok' : state[String(n).split('~')[0]] || 'loading');
  /* -> Promise of { state: 'ok' | 'none' | 'invalid' | 'error', code, list: [{ n, code, title, sub, lat, lon, blk, road, building }] }; `f` is the fetch to use (tests pass their own) */
  function lookup(c, f) {
    if (!valid(c)) { state[c] = 'invalid'; return Promise.resolve({ state: 'invalid', code: c, list: [] }); }
    if (asked[c] && state[c] === 'ok') return asked[c];
    const ff = f || (typeof fetch === 'function' ? fetch : null); if (!ff) { state[c] = 'error'; return Promise.resolve({ state: 'error', code: c, list: [] }); }
    const ctl = typeof AbortController === 'function' ? new AbortController() : null, tm = ctl ? setTimeout(() => ctl.abort(), 7000) : null;
    state[c] = 'loading';
    const p = Promise.resolve(ff(ONEMAP + c, ctl ? { signal: ctl.signal } : undefined)).then((r) => { if (!r || !r.ok) throw new Error('postal ' + (r && r.status)); return r.json(); }).then((d) => {
      if (!d || !Array.isArray(d.results)) throw new Error('postal: no result list');
      const seen = {}, list = [];
      d.results.filter((r) => String(r.POSTAL) === c && isFinite(+r.LATITUDE) && isFinite(+r.LONGITUDE)).forEach((r) => {
        const road = TITLE(r.ROAD_NAME), blk = nil(r.BLK_NO), bld = nil(r.BUILDING), title = [blk, road].filter(Boolean).join(' ') || TITLE(bld) || 'Postal code ' + c, k = title + '|' + bld; if (seen[k]) return; seen[k] = 1;
        const n = list.length ? c + '~' + list.length : c, o = { n, code: c, title, sub: [bld && TITLE(bld) !== title ? TITLE(bld) : '', 'Singapore ' + c].filter(Boolean).join(' · '), lat: +r.LATITUDE, lon: +r.LONGITUDE, blk, road: String(r.ROAD_NAME || ''), building: bld };
        list.push(o); PC[n] = o;
      });
      state[c] = list.length ? 'ok' : 'none'; return { state: list.length ? 'ok' : 'none', code: c, list: list.slice(0, 3) };
    }).catch(() => { state[c] = 'error'; delete asked[c]; return { state: 'error', code: c, list: [] }; }).then((x) => { if (tm) clearTimeout(tm); return x; });
    asked[c] = p; return p;
  }

  /* ---- comparing names ---- */
  // OneMap spells roads out ("AVENUE", "NORTH"); HDB's records abbreviate them ("AVE", "NTH"). Both sides go through this, so they meet in the middle.
  const ABB = [['AVENUE', 'AVE'], ['STREET', 'ST'], ['SAINT', 'ST'], ['ROAD', 'RD'], ['DRIVE', 'DR'], ['CRESCENT', 'CRES'], ['CLOSE', 'CL'], ['PLACE', 'PL'], ['TERRACE', 'TER'], ['LORONG', 'LOR'], ['JALAN', 'JLN'], ['NORTH', 'NTH'], ['SOUTH', 'STH'], ['CENTRAL', 'CTRL'], ['UPPER', 'UPP'], ['BUKIT', 'BT'], ['TANJONG', 'TG'], ['KAMPONG', 'KG'], ['GARDENS', 'GDNS'], ['HEIGHTS', 'HTS'], ['MARKET', 'MKT'], ['COMMONWEALTH', 'CWEALTH'], ['BOULEVARD', 'BLVD'], ['LANE', 'LN'], ['PARK', 'PK']];
  const roadKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().split(' ').map((w) => { const a = ABB.find((x) => x[0] === w); return a ? a[1] : w; }).join(' ');
  // a development's name as people and OneMap both write it: no "(U/C)", no punctuation, no leading "the"
  const nameKey = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '').replace(/^the/, '');

  /* ---- which HDB town: `streets` is data/value/hdb/streets.json, { streets: { roadKey: [town ids] } } ---- */
  const hdbTowns = (res, streets) => { const t = streets && streets.streets && streets.streets[roadKey(res.road)]; return Array.isArray(t) ? t.slice() : []; };

  /* ---- which development: `rows` = the development register (data/registry/index.json: id, name, street, district, ..., aliases); `extra` = more { id, name, aliases } (launches and sites).
     Exact name first (68 of 70 sampled developments matched OneMap's building name this way); a near name counts only on the same road; the same name on two roads is told apart by the road. -> { kind: 'exact' | 'near' | 'none', list: [row] } */
  function devMatch(res, rows, extra) {
    const b = nameKey(res.building); if (!b) return { kind: 'none', list: [] };
    const idx = (rows || []).map((r) => ({ id: r[0], name: r[1], street: r[2], row: r, names: [r[1]].concat(r[12] || []) })).concat((extra || []).map((x) => ({ id: x.id, name: x.name, street: '', row: x, names: [x.name].concat(x.aliases || []) })));
    const rk = roadKey(res.road);
    const ex = idx.filter((x) => x.names.some((n) => nameKey(n) === b));
    if (ex.length) { const onRoad = ex.filter((x) => x.street && roadKey(x.street) === rk); return { kind: 'exact', list: (onRoad.length ? onRoad : ex).map((x) => x.row) }; }
    if (b.length >= 5) { const nr = idx.filter((x) => x.street && roadKey(x.street) === rk && x.names.some((n) => { const k = nameKey(n); return k.length >= 5 && (k.includes(b) || b.includes(k)); })); if (nr.length) return { kind: 'near', list: nr.map((x) => x.row) }; }
    return { kind: 'none', list: [] };
  }
  return { code, valid, msg, lookup, state: stateOf, PC, TITLE, roadKey, nameKey, hdbTowns, devMatch, ONEMAP };
});
