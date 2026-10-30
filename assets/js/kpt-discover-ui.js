/* KPT DISCOVER UI V1: the Budget Search page (tools/what-can-i-buy/). Presentation and wiring only: every matching rule is in kpt-discover.js, the data and wording of evidence come from kpt-find.js,
 * and the place search, distances and map are the Map's own (KPT_MAP, KPT_MAP_VIEW, gw-postal.js), loaded only when the buyer starts typing a place.
 * Nothing typed here (budget, place, size) is sent to analytics, WhatsApp or put in an address. The search is remembered in this tab only (sessionStorage, with the handoff).
 * Bedrooms on resale (26 Oct 2026): kpt-discover-beds.js (KPT_BEDS) over data/projects/find-beds.json, loaded only once a bedroom count is chosen with resale
 * included. Confirmed matches are the list; "bedrooms not confirmed" is its own group; developments without bedroom records are counted, never listed as a match.
 * Without that file (or if it is not from the same URA download as find.json) the page behaves exactly as before.
 */
(function () {
  'use strict';
  const CFG = window.KPD_CFG, FI = window.KPT_FIND, D = window.KPT_DISCOVER, M = window.KPT_MARKET, KB = window.KPT_BEDS || null;
  KPT.setContext({ tool_name: 'what-can-i-buy', tool_category: 'research', project_name: null });
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const params = new URLSearchParams(location.search);
  const REVIEW = CFG.review || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);   // ?inventory= and ?now= work only on localhost or in test mode, never on the live site
  // EMB: the requirements form hosted inside the Research page (research/). Only the form lives there; Show developments opens this page's results. BASE is the path to the site root.
  const EMB = !!CFG.embed, BASE = CFG.ROOT || '../../';
  const MAP_V = CFG.MAP_V, RADII = D.T.radii, NEAR_TYPES = ['dev', 'mrt', 'area', 'road', 'school', 'postal'];
  const BUDGET_ERR = 'Enter a budget between $300,000 and $20,000,000.';
  const money = (n) => Number(n).toLocaleString('en-SG');
  const nowMs = () => (REVIEW && isFinite(Date.parse(params.get('now') || '')) ? Date.parse(params.get('now')) : Date.now());

  /* ------------------------------------------------------------------ state */
  const BLANK = { budget: null, over: false, type: 'any', sale: 'either', minSize: null, tenure: 'any', beds: null };
  const S = { req: Object.assign({}, BLANK), near: null, mode: 'entry', edit: false, view: 'list', shown: {}, helps: {}, sel: null, errBudget: '', pendingWhere: '', draftBudget: '', moreOpen: false, sheetMin: false, layers: null, lyrOpen: false, open: {}, unconfOpen: false, sort: null };
  let invLoaded = false, srcLine = '', ix, findDoc = null, bx = null, bedsState = CFG.BEDS_URL && KB ? 'idle' : 'off', bedsLoad = null, invDoc, sitesDoc, dataReady = null, handoff = null, NM = null, nmLoad = null, nmView = null, nmHost = null, nmLayer = null, nmSig = '', nmBase = '', wasStage = false, NR = null, lastRes = null, seenKey = {};

  /* ------------------------------------------------------------------ data */
  const get = (u, opts) => fetch(u, opts).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  function loadData() {
    if (dataReady) return dataReady;
    dataReady = Promise.all([get(CFG.FIND_URL), get(CFG.INV_URL, { cache: 'no-cache' }), get(CFG.SITES_URL), get(BASE + 'data/projects/index.json'), get(BASE + 'data/map/upcoming.json?v=' + MAP_V)]).then((a) => {
      readDest(a[3], a[4]);
      findDoc = a[0]; ix = FI.prepare(a[0]); invDoc = a[1];
      sitesDoc = (a[2] && Array.isArray(a[2].sites) ? a[2].sites : []).filter((x) => x && x.stage === 'new-launch' && x.status === 'configured' && /^https:\/\//.test(x.url || '') && x.id && x.name);
      invLoaded = true; dataLoaded();   // Research fix (27 Oct 2026): the form drawn before the listings arrived is brought up to date (it was left showing them as missing)
    });
    return dataReady;
  }
  const inventory = () => FI.prepareInventory(invDoc, nowMs());
  /* Results layout (Ken, 28 Oct 2026). Where a development can be opened, and what it is, from the files Research and the Map already use:
     data/projects/index.json (every development with a Research page: its class, condo / EC / cluster, and URA's tenure) and data/map/upcoming.json (launches with
     their own Research and Map entries). A development in neither gets no link, never a dead one. Nothing here is new data. */
  let PIX = null, UPIDS = null;
  function readDest(idx, up) {
    try {
      if (idx && Array.isArray(idx.fields) && Array.isArray(idx.rows)) { const f = idx.fields, ci = f.indexOf('id'), cc = f.indexOf('cls'), ct = f.indexOf('tenLabel'); PIX = {}; idx.rows.forEach((r) => { PIX[r[ci]] = { cls: r[cc] || 'condo', tl: r[ct] || '' }; }); }
      if (up && Array.isArray(up.items)) { UPIDS = {}; up.items.forEach((x) => { if (x && x.id) UPIDS[x.id] = 1; }); }
    } catch (e) { PIX = PIX || null; }
  }
  const clsMap = () => { if (!PIX) return null; const o = {}; Object.keys(PIX).forEach((k) => { o[k] = PIX[k].cls; }); return o; };
  let CLSM = null; const ctxNow = () => ({ inv: inventory(), cls: CLSM || (CLSM = clsMap()) });
  /** a Research page / Map entry exists: every development in find.json is in the project index; a listing-only one needs to be in it or in the upcoming list */
  const hasDest = (it) => !!((PIX && PIX[it.id]) || (UPIDS && UPIDS[it.id]) || (!PIX && it.ura));
  /* The listings have just loaded (or failed to): redraw only the bedroom control wherever it is drawn (the entry form, the Research form, the edit panel), so nothing typed,
     focused or open is disturbed. A bedroom choice for new launches only is kept when the listings are usable and cleared, visibly, when they are not. */
  function dataLoaded() {
    const usable = D.inventoryUsable(inventory());
    if (!usable && S.req.sale === 'new' && S.req.beds) { S.req.beds = null; if (S.mode === 'results') { commit(true); return; } }
    document.querySelectorAll('[data-bedsblk]').forEach((el) => { el.outerHTML = bedsBlock(inventory()); });
  }
  /* Resale by bedrooms: find-beds.json, fetched the first time a bedroom count is chosen with resale included. 'off' = keep today's behaviour. */
  const bedsWanted = () => !!(S.req.beds && S.req.sale !== 'new');
  const bedsOn = () => bedsState !== 'off';   // the resale bedroom choice is offered (it may still be loading)
  function loadBeds() {
    if (bedsState === 'off') return Promise.resolve(null);
    if (bedsLoad) return bedsLoad;
    bedsState = 'loading';
    bedsLoad = Promise.all([loadData(), get(CFG.BEDS_URL)]).then((a) => { bx = KB.prepare(a[1], findDoc); bedsState = bx ? 'ready' : 'off'; return bx; });
    return bedsLoad;
  }
  /** Data for the current requirements: find.json and inventory always, find-beds.json only when bedrooms apply to resale. */
  const dataFor = () => (bedsWanted() ? loadData().then(loadBeds) : loadData());

  /* ------------------------------------------------------------------ the Map's place search (loaded on demand) */
  const addCss = (href) => { if (!document.querySelector('link[href="' + href + '"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); } };
  const addJs = (src) => new Promise((ok, no) => { const x = document.createElement('script'); x.src = src; x.onload = ok; x.onerror = () => no(new Error(src)); document.head.appendChild(x); });
  function loadNear() {
    if (nmLoad) return nmLoad;
    const g = (u, must) => fetch(u + '?v=' + MAP_V).then((r) => { if (!r.ok) throw new Error(u); return r.json(); }).catch((e) => { if (must) throw e; return null; });
    addCss(BASE + 'assets/vendor/leaflet/leaflet.css'); addCss(BASE + 'assets/css/kpt-map.css?v=' + MAP_V);
    nmLoad = Promise.all([addJs(BASE + 'assets/vendor/leaflet/leaflet.js').then(() => addJs(BASE + 'assets/js/gw-postal.js?v=' + MAP_V)).then(() => addJs(BASE + 'assets/js/kpt-map-core.js?v=' + MAP_V)).then(() => addJs(BASE + 'assets/js/kpt-map-view.js?v=' + MAP_V)), g(BASE + 'data/map/places.json', true), g(BASE + 'data/map/amen.json', true), g(BASE + 'data/map/upcoming.json')])
      .then((a) => {
        NM = window.KPT_MAP.create(a[1], a[2], { band: null, radius: 1000 }); NM.setUpcoming(a[3]);   // launches and awarded GLS sites join the same place index as the Map's
        return Promise.all([g(BASE + 'data/value/landed/geo.json'), g(BASE + 'data/value/landed/geo-more.json'), a[2].extra ? g(BASE + 'data/map/' + a[2].extra) : null])
          .then((b) => { if (b[0] || b[1]) NM.setRoads(b[0], b[1]); if (b[2]) NM.setExtra(b[2]); return NM; });
      }).catch((e) => { nmLoad = null; throw e; });
    return nmLoad;
  }
  // R3c (Ken, 30 Oct 2026): a postal district ("D19", "District 19": the Map's search, which uses the site's one district definition in gw-nav.js) is a place with
  // NO centre point and NO radius: the developments whose recorded district it is. Every radius place (road, MRT, address…) works as before.
  const isDist = (n) => !!(n && n.t === 'district');
  const PICK_TYPES = NEAR_TYPES.concat(['district']);
  const NEAR_BASIS = { dev: 'the development', mrt: 'the station', area: 'the centre of the neighbourhood', road: 'one point on the road', school: 'the school', postal: 'the address' };
  /** One chosen place -> its point and the straight-line distance to every mapped development within the widest radius (the Map's haversine). */
  function resolveNear(n) {
    if (!NM) return null;
    let o = null;
    if (isDist(n)) { const pd = NM.placeData({ t: 'district', n: n.n }); return pd ? { key: 'district|' + n.n, label: pd.title, sub: 'Postal district', district: pd.d } : null; }   // no point, no distances
    if (n.t === 'dev') { const p = NM.BY[n.n]; if (p && p.pos) o = { label: p.n, sub: 'Development', lat: p.lat, lon: p.lon }; }
    else { const pd = NM.placeData({ t: n.t, n: n.n }); if (pd) o = n.t === 'area' ? { label: pd.title, sub: 'Neighbourhood', lat: pd.centre[0], lon: pd.centre[1], rings: pd.a.rings, bounds: pd.bounds } : { label: pd.title, sub: pd.meta, lat: pd.lat, lon: pd.lon }; }
    if (!o) return null;
    const dist = {}, pos = {}, c = { lat: o.lat, lon: o.lon }, far = RADII[RADII.length - 1];
    NM.PM.forEach((p) => { pos[p.id] = 1; const d = window.KPT_MAP.hav(c, p); if (d <= far) dist[p.id] = d; });
    return Object.assign(o, { key: n.t + '|' + n.n, basis: NEAR_BASIS[n.t] || 'the place', dist, pos });
  }
  const nearInput = () => (S.near && !isDist(S.near) && NR && NR.key === S.near.t + '|' + S.near.n ? { dist: NR.dist, pos: NR.pos, radius: S.near.r, label: NR.label } : null);
  const districtInput = () => (isDist(S.near) && NR && NR.key === 'district|' + S.near.n ? NR.district : null);
  const distMapHref = () => (districtInput() ? BASE + 'research/map/#pl=district:' + Number(districtInput()) : '');
  const subParts = (label, sub) => { const p = String(sub || '').split(' · '); let type = p[0] || '', area = p[1] || ''; if (area && String(label).indexOf(area) > -1) area = ''; if (type && (String(label).trim().split(/\s+/).pop().toLowerCase() === type.split(/\s+/)[0].toLowerCase() || String(label).toLowerCase().indexOf(type.toLowerCase()) > -1)) type = ''; return { type, area }; };
  const sugSub = (x) => { const q = subParts(x.label || x.n, x.sub); return [q.type, q.area].filter(Boolean).join(' · '); };
  let nearErr = '';
  function suggest(q) {
    const box = $('kdSugg'), inp = $('kdPlace'); if (!box || !inp) return;
    const t = String(q || '').trim();
    if (!t) { box.hidden = true; box.innerHTML = ''; inp.setAttribute('aria-expanded', 'false'); return; }
    box.hidden = false; inp.setAttribute('aria-expanded', 'true');
    if (!NM) { box.innerHTML = nmLoad ? '<p class="kd-sgn">Loading places…</p>' : '<p class="kd-sgn">Place search isn’t available just now. You can still search all of Singapore.</p>'; return; }
    const code = NM.postalCode(t);   // a six-digit number is a postal code: OneMap resolves it (the Map’s own lookup)
    if (code) {
      box.innerHTML = '<p class="kd-sgn" role="status">' + esc(NM.postalMsg('loading', code)) + '</p>';
      NM.lookupPostal(code).then((r) => { const i = $('kdPlace'), b = $('kdSugg'); if (!i || !b || i.value.trim() !== t) return;
        b.innerHTML = r.state === 'ok' ? r.list.map((x, k) => `<button type="button" role="option" class="kd-sg" id="kdSg${k}" data-f="pick" data-t="postal" data-n="${esc(x.n)}"><b>${esc(x.title)}</b><span>${esc(x.sub)}</span></button>`).join('') : '<p class="kd-sgn" role="status">' + esc(NM.postalMsg(r.state, code)) + '</p>'; });
      return;
    }
    const list = NM.places(t).filter((x) => PICK_TYPES.indexOf(x.t) > -1 && (x.t !== 'dev' || (NM.BY[x.n] && NM.BY[x.n].pos)));
    box.innerHTML = list.length ? list.map((x, i) => `<button type="button" role="option" class="kd-sg" id="kdSg${i}" data-f="pick" data-t="${esc(x.t)}" data-n="${esc(x.n)}"><b>${esc(x.label || x.n)}</b><span>${esc(sugSub(x))}</span></button>`).join('') : '<p class="kd-sgn">No match. Try a postal code, road, MRT station, neighbourhood or development.</p>';
  }
  function typedPlace(v) {
    nearErr = '';
    if (String(v).trim() && !NM) loadNear().then(() => { const i = $('kdPlace'); if (i) suggest(i.value); }).catch(() => { nmLoad = null; const i = $('kdPlace'); if (i) suggest(i.value); });
    suggest(v);
  }
  function pickPlace(t, n) {
    return loadNear().then(() => {
      const next = isDist({ t }) ? { t, n, r: null } : { t, n, r: S.near && S.near.r ? S.near.r : 1000 }, nr = resolveNear(next);
      if (!nr) { nearErr = 'We couldn’t place that on the map. Please try another.'; renderAll(); return; }
      NR = nr; S.near = next; S.pendingWhere = ''; nearErr = ''; S.sel = null; commit(true);
    }).catch(() => { nearErr = 'Place search isn’t available just now. You can still search all of Singapore.'; renderAll(); });
  }

  /* ------------------------------------------------------------------ remembered search (this tab only) */
  function snapshot() { const r = S.req; return { v: 2, req: { budget: r.budget, over: !!r.over, type: r.type, sale: r.sale, minSize: r.minSize, tenure: r.tenure, beds: r.beds }, near: S.near ? { t: S.near.t, n: S.near.n, r: S.near.r } : null }; }
  function persist() {
    if (!S.req.budget) return;
    const base = handoff || { v: 1, from: 'search', state: 'ok', budget: { low: S.req.budget, high: S.req.budget, single: true }, purpose: null, openTo: 'both', size: 'not-sure', where: 'flexible', whereText: '', priorities: [] };
    const next = Object.assign({}, base, { find2: snapshot() });
    // a planner's range stays as it was while its top is still the maximum
    if (!handoff || !handoff.budget || handoff.budget.high !== S.req.budget) { next.budget = { low: S.req.budget, high: S.req.budget, single: true }; next.edited = true; }
    handoff = next; M.writeHandoff(window.sessionStorage, next);
  }
  /* The form and its results are two entries of this one page, so Back from the results is the form (with every requirement kept) and Forward is the results again.
     Only that step makes an entry: editing, zooming, layers, selecting and opening panels never add one. */
  const hs = () => { try { const st = history.state; return st && (st.kd === 'f' || st.kd === 'r') ? st : null; } catch (e) { return null; } };
  function setHist(kd, push) {
    const st = { kd: kd, snap: kd === 'r' ? snapshot() : null };
    try { if (push) history.pushState(st, ''); else history.replaceState(st, ''); } catch (e) { /* history not available: Back simply leaves the page */ }
  }
  function toForm() {
    destroyMap(); document.body.classList.remove('kd-hasmap'); delete document.body.dataset.kdView; wasStage = false;
    S.mode = 'entry'; S.edit = false; S.sel = null; S.sheetMin = false; S.lyrOpen = false; S.errBudget = ''; lockPage(false);
    S.draftBudget = S.req.budget ? money(S.req.budget) : '';
    if (!(handoff && handoff.budget && handoff.budget.high === S.req.budget)) srcLine = '';   // "From your plan" only while the budget is still the plan's
    renderAll(); window.scrollTo({ top: 0 });
  }
  function toResults(snap) {
    const go = () => { S.mode = 'results'; S.edit = false; S.shown = {}; S.sel = null; S.lyrOpen = false; renderAll(); persist(); window.scrollTo({ top: 0 }); };
    if (snap && snap.req) {
      S.req = Object.assign({}, BLANK, snap.req); S.draftBudget = S.req.budget ? money(S.req.budget) : ''; S.near = null; NR = null; nearErr = ''; S.pendingWhere = '';
      dataFor().then(() => restorePlace(snap.near)).then(go);
    } else dataFor().then(go);
  }
  addEventListener('popstate', (e) => {
    const st = e.state && (e.state.kd === 'f' || e.state.kd === 'r') ? e.state : null; if (EMB || !st || !S.ready) return;
    if (st.kd === 'f') { if (S.mode !== 'entry') toForm(); } else toResults(st.snap);
  });
  const SIZE_BEDS = { '1br': 1, '2br': 2, '3br': 3, '3br-study': 3, '4br-plus': 4 };
  /** Starting requirements from whatever the buyer arrived with: a saved search, a planner budget, or the answers of the earlier Buy journey (read, never discarded). */
  function initial() {
    const h = handoff, ss = window.sessionStorage;
    if (h && h.find2 && h.find2.req) return { req: Object.assign({}, BLANK, h.find2.req), near: h.find2.near, from: h.from };
    let buy = null;
    if (h && h.from === 'buy') buy = h; else if (params.get('resume')) { try { buy = JSON.parse(ss.getItem('kpt.buy.input')); } catch (e) { buy = null; } if (buy) buy = Object.assign({}, buy, { budget: { high: Number(buy.budget) } }); }
    if (buy) {
      const pr = buy.priorities || [], r = Object.assign({}, BLANK, { budget: buy.budget && buy.budget.high ? Math.round(buy.budget.high) : null, sale: buy.openTo === 'new' ? 'new' : buy.openTo === 'resale' ? 'resale' : 'either',
        beds: SIZE_BEDS[buy.size] || null, tenure: pr.indexOf('freehold') > -1 ? 'free' : 'any' });
      return { req: r, near: null, where: buy.where && buy.where !== 'flexible' ? String(buy.whereText || '').trim().slice(0, 60) : '', from: 'buy' };
    }
    if (h && h.budget && h.budget.high > 0) return { req: Object.assign({}, BLANK, { budget: Math.round(h.budget.high) }), near: null, from: h.from, planner: true, range: h.budget.high > h.budget.low ? { low: h.budget.low, high: h.budget.high } : null, single: !(h.budget.high > h.budget.low) };
    return null;
  }

  /* ------------------------------------------------------------------ text helpers */
  const m2 = (v) => '$' + (Math.round(v / 10000) / 100).toFixed(2).replace(/0$/, '') + 'm', p2 = FI.p2, ymLabel = FI.ymLabel;
  const sizeText = (lo, hi) => money(lo) + '–' + money(hi) + ' sq ft';
  const CLS = { ec: 'Executive Condominium', cluster: 'Cluster housing' };
  const CLS_H = { condo: 'Condominiums', ec: 'Executive Condominiums', cluster: 'Cluster housing (strata landed)' };
  const CLS_NOTE = { ec: 'A different property type with its own buyer rules and price levels, shown on its own.', cluster: 'Strata landed homes in a gated development, with their own price levels, shown on its own.' };
  const kmText = (d) => (d < 50 ? 'on the spot' : d < 1000 ? 'about ' + (Math.round(d / 10) * 10) + ' m' : (d / 1000).toFixed(1) + ' km');
  const bedWord = (b) => (b === 4 ? '4+ bedroom' : b + '-bedroom');
  const bedsNoun = (types) => FI.typeNoun ? types.map((t) => FI.typeNoun(t.bedrooms)).join(', ') : '';
  function meta(it) {
    const place = S.near && NR && it.dist != null ? kmText(it.dist) + ' from ' + NR.label : '';
    return [it.sale === 'new' ? 'New launch' : 'Resale', CLS[it.cls] || null, place || null, 'District ' + Number(it.district), tenureText(it) + (it.mixed ? ' (mixed tenure in the records)' : '')].filter(Boolean).join(' · ');
  }
  const TAG = { typical: ['g', 'Typical prices within your maximum'], some: ['a', 'Some sales within your maximum'], huttons: ['b', 'Developer listings within your maximum'], over: ['n', 'Up to 5% over your maximum'] };
  /* bedroom wording (resale): the basis is always named, as on Research; "not confirmed" is never worded as a match */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ymS = (s) => { const m = /^(\d{4})-(\d{2})$/.exec(String(s || '')); return m ? MON[Number(m[2]) - 1] + ' ' + m[1] : ''; };
  const basisWord = (b) => (!b ? '' : b.verified && !b.inferred ? 'bedrooms from floor plans' : b.inferred && !b.verified ? 'bedrooms from URA rental records' : 'bedrooms from floor plans and URA rental records');
  const bedsNow = () => (lastRes && lastRes.beds ? lastRes.beds : null);
  const bedLabel = (n, plus) => (plus ? n + '+ bedroom' : n + '-bedroom');
  const cap1 = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  function bedsEv(it) {
    const u = it.ura, b = it.beds, w = bedLabel(b.count, bedsNow() && bedsNow().orMore);
    if (b.state === 'insufficient') {
      const k = u.identified, x = u.could;
      return `<p class="kd-ev"><span>Resales that could be ${esc(w)} (URA)</span>, ${esc(sizeText(u.bandLo, u.bandHi))} · middle half <b>${esc(p2(u.q1) + '–' + p2(u.q3))}</b></p><p class="kd-n">${k ? esc(k + ' of ' + x + ' recent resale' + (x === 1 ? '' : 's') + ' identified as ' + w) : 'Bedrooms not shown in the records for these sizes'} · latest ${esc(ymLabel(u.last))}</p>`;
    }
    const g = b.group && Number(b.group) !== b.count ? bedLabel(Number(b.group), false) : w;   // "4+" shows the type that matched
    const range = b.sized ? sizeText(u.bandLo, u.bandHi) : money(u.sqft[0]) + '–' + money(u.sqft[1]) + ' sq ft';
    const price = b.sized ? `middle half <b>${esc(p2(u.q1) + '–' + p2(u.q3))}</b>` : `typical <b>${esc(p2(u.med))}</b> · middle half ${esc(p2(u.q1) + '–' + p2(u.q3))}`;
    const when = u.from && u.to ? ymS(u.from) + '–' + ymS(u.to) : 'latest ' + ymLabel(u.last);
    return `<p class="kd-ev"><span>${esc(cap1(g))} resales (URA)${b.sized ? ' at your minimum size' : ''}</span>, ${esc(range)} · ${price}</p><p class="kd-n">${u.n} sale${u.n === 1 ? '' : 's'} · ${esc(when)}${u.basis ? ' · ' + esc(basisWord(u.basis)) : ''}</p>`;
  }
  /* ------------------------------------------------------------------ results layout (Ken, 28 Oct 2026): a comparison table on a desktop, compact expandable cards on a phone and in the map panel.
     Presentation only: every item, count, price and safeguard is the search's own (kpt-discover.js, kpt-discover-beds.js). The evidence that used to fill each card
     (sales counts, dates, the bedroom basis, the tier) is kept in each row's details, opened by choosing the development. */
  /* names as people write them (display only; ids, links and data unchanged): "People's" not "People'S", "St Regis" not "ST Regis", "Citylife@Tampines", "Duet at Emily" */
  function nice(n) {
    let s = FI.displayName(n).replace(/([A-Za-z])'S\b/g, "$1's");
    s = s.split(' ').map((w, i) => (i > 0 && /^(Of|At|By|On|And)$/.test(w) ? w.toLowerCase() : /^(LA|LE|DE|MI|MY|ST|FE|NO)$/.test(w) ? w.charAt(0) + w.charAt(1).toLowerCase() : w)).join(' ');
    return s.replace(/@([A-Za-z][A-Za-z-]*)/g, (m, q) => '@' + (/^[A-Z]{2,3}$/.test(q) ? q : q.replace(/(^|-)([a-z])/g, (x, a, b) => a + b.toUpperCase()).replace(/^([A-Z])([A-Z]+)\b/, (x, a, b) => a + b.toLowerCase())));
  }
  const Mx = (v) => (Math.round(v / 10000) / 100).toFixed(2);
  const M2 = (v) => '$' + Mx(v) + 'M';                                                     // $1.74M
  const Mr = (a, b) => (Math.abs(a - b) < 5000 ? M2(a) : '$' + Mx(a) + '–' + Mx(b) + 'M');   // $1.52–1.86M
  const sqft = (lo, hi) => (lo && hi ? money(lo) + '–' + money(hi) + ' sq ft' : '');
  /* Tenure (Ken, 28 Oct): from URA's own tenure record, "99 yrs lease commencing from 2018", kept as find.json's label ("99 yrs from 2018"). That year is the LEASE
     COMMENCEMENT, not TOP or completion: it is shown as such and nothing (age, TOP) is ever worked out from it. No year on record: "99-year leasehold", never a guessed
     date. 999-year and other long leases keep their own length; only a recorded freehold is called Freehold. */
  function tenureText(it) {
    let t = String(it.tenure || ''); if (!/from \d{4}|freehold/i.test(t) && PIX && PIX[it.id] && /^\d+ yrs from \d{4}$/.test(PIX[it.id].tl)) t = PIX[it.id].tl;   // a listing-only development: URA's own tenure, when the index has it
    if (/freehold/i.test(t)) return 'Freehold';
    let m = /^(\d+) yrs from (\d{4})$/.exec(t); if (m) return m[1] + '-year lease from ' + m[2];
    m = /^(\d+) yrs\b/.exec(t); if (m) return m[1] + '-year leasehold';
    return 'Tenure not on record';
  }
  const bedSpan = (ty) => { const b = ty.map((t) => t.bedrooms).sort((x, y) => x - y), w = (n) => (n === 0 ? 'Studio' : n + (n >= 5 ? '+' : '')), lo = b[0], hi = b[b.length - 1]; return lo === hi ? (lo === 0 ? 'Studio' : w(lo) + ' BR') : w(lo) + '–' + w(hi) + ' BR'; };
  const unconfOf = (it) => !!(it.beds && it.beds.state === 'insufficient');
  /** What a row shows: the size range of the matching homes and one price figure, and the number it sorts on. Nothing here changes which developments match. */
  function facts(it) {
    const u = it.ura, b = it.beds;
    if (it.sale === 'new' && it.inv && it.inv.types && it.inv.types.length) {
      const ty = it.inv.types, lo = Math.min.apply(null, ty.map((t) => t.lo || 1e9)), hi = Math.max.apply(null, ty.map((t) => t.hi || 0));
      return { size: (S.req.beds ? '' : bedSpan(ty) + ' · ') + (lo < 1e9 && hi ? sqft(lo, hi) : ''), price: 'from ' + M2(it.inv.from), sortP: it.inv.from, sizeLo: lo < 1e9 ? lo : null };
    }
    if (!u) return { size: '', price: '', sortP: Infinity };
    if (b && b.state === 'reliable' && !b.sized && has(u.med)) return { size: sqft(u.sqft[0], u.sqft[1]), price: M2(u.med), sortP: u.med, sizeLo: u.sqft[0] || null, some: it.tier === 'some' };   // the typical (median) price of that bedroom type
    return { size: sqft(u.bandLo, u.bandHi), price: Mr(u.q1, u.q3), sortP: u.q1, sizeLo: u.bandLo || null, some: it.tier === 'some' };   // only part of the range within the maximum: said on the row, never upgraded   // the middle half of recent resales
  }
  const has = (x) => typeof x === 'number' && isFinite(x);
  /* the check date of most of a group's listings, said once in its heading line; a row says its own only when it differs */
  function groupWhen(items) {
    const n = {}; let best = null; items.forEach((i) => { const w = i.inv && i.inv.when; if (w) { n[w] = (n[w] || 0) + 1; if (!best || n[w] > n[best]) best = w; } });
    const of = items.filter((i) => i.inv && i.inv.when === best);
    return { when: best, late: of.some((i) => i.inv.late), past: of.length > 0 && of.every((i) => i.inv.past) };
  }
  /* What opening a development adds, and only that: the summary row already says the name, district, tenure, size and price, so the panel never repeats them.
     URA methodology is in "How these are matched", not here. */
  function detailsHtml(it) {
    const u = it.ura, b = it.beds, out = [];
    if (it.sale === 'new' && it.inv && it.inv.types && it.inv.types.length) {
      if (it.inv.types.length > 1) out.push(`<ul class="kd-invt">${it.inv.types.map((t) => `<li><span>${esc(FI.typeNoun ? FI.typeNoun(t.bedrooms) : t.bedrooms + '-bedroom')}</span>${t.lo ? ' · ' + esc(sizeText(t.lo, t.hi)) : ''} · from <b>${esc(M2(t.floor))}</b></li>`).join('')}</ul>`);
      if (it.hist && hasDest(it)) out.push('<p class="kd-n">Past developer sales are on its Research page.</p>');
    } else if (u) {
      const when = u.from && u.to ? ymS(u.from) + '–' + ymS(u.to) : 'latest ' + ymLabel(u.last), rs = (n) => n + ' resale' + (n === 1 ? '' : 's');
      if (b && b.state === 'insufficient') out.push(`<p class="kd-n">${u.identified ? esc(u.identified + ' of ' + u.could + ' recent resales identified as ' + bedWord(b.count)) : 'The records don’t show bedrooms for these sizes'} · ${esc(when)}</p>`);
      else if (b && b.state === 'reliable' && !b.sized && has(u.med)) out.push(`<p class="kd-n">Middle half ${esc(Mr(u.q1, u.q3))} · based on ${esc(rs(u.n))}, ${esc(when)}</p>`);
      else out.push(`<p class="kd-n">Based on ${esc(rs(u.n))}, ${esc(when)}</p>`);
    }
    return out.join('');
  }
  function rowHtml(it, gw, unconf) {
    const f = facts(it), id = esc(it.id), key = esc(it.id + '|' + it.sale), open = !!S.open[it.id + '|' + it.sale], nm = nice(it.name), go = hasDest(it);
    const dist = S.near && NR && it.dist != null ? kmText(it.dist) : '';
    // links only where Research and the Map have the development (a listing-only one may have neither: then no link, never a dead one)
    const research = !go ? '' : `<a data-f="go" data-id="${id}"${it.sale === 'resale' && it.beds && it.beds.state === 'reliable' && it.beds.group ? ` data-bed="${esc(it.beds.group)}"` : ''} href="../../research/#/p/${id}${it.sale === 'new' ? (it.hist ? '/new' : '') : '/' + it.sale}" aria-label="${esc('Research: ' + nm)}">Research</a>`;
    const map = go ? `<a data-f="go" data-id="${id}" href="../../research/map/#p=${id}" aria-label="${esc('Map: ' + nm)}">Map</a>` : '';
    const loc = stageOn() && NM && NM.BYID[it.id] && NM.BYID[it.id].pos ? `<button type="button" class="kd-link kd-loc" data-f="locate" data-id="${id}" aria-pressed="${S.sel === it.id}">Show here on map</button>` : '';
    const iv = it.inv, own = it.sale === 'new' && iv && gw && iv.when && iv.when !== gw.when ? `Checked ${iv.when}${iv.past ? ', as shown then' : ''}` : '';
    const note = f.some ? 'Some sales within your max' : own, more = detailsHtml(it);
    return `<tr class="kd-card kd-row${S.sel === it.id ? ' is-sel' : ''}${unconf ? ' kd-unc' : ''}${open ? ' is-open' : ''}" data-pid="${id}" data-sale="${it.sale}">`
      + `<td class="kd-rnc"><h3 class="kd-rn"><button type="button" class="kd-rt" data-f="row" data-key="${key}" aria-expanded="${open}">${esc(nm)}</button>${dist ? `<span class="kd-rdist">${esc(dist)}</span>` : ''}</h3></td>`
      + `<td class="kd-rdi">D${esc(String(Number(it.district)))}</td><td class="kd-rten">${esc(tenureText(it))}</td><td class="kd-rs">${S.req.beds && !unconf ? `<span class="kd-rbed">${esc(bedShort())} · </span>` : ''}${esc(f.size)}</td>`
      + `<td class="kd-rp"><b>${esc(f.price)}</b>${note ? `<small>${esc(note)}</small>` : ''}</td>`
      + `<td class="kd-ac"><div class="kd-acts">${loc}${research}${map}</div></td></tr>`
      + (more ? `<tr class="kd-rxr${open ? ' is-open' : ''}" data-for="${key}"${open ? '' : ' hidden'}><td colspan="6"><div class="kd-rx">${more}</div></td></tr>` : '');
  }
  /* Sorting (Ken, 28 Oct 2026): by any column, both ways, over every matching row of a section before "Show more", and within that section only.
     Missing values go last whichever way. It is order only: never which developments match. Lowest price first by default; nearest first with a place. */
  const SORT_OPTS = [['price', 'asc', 'price, low to high'], ['price', 'desc', 'price, high to low'], ['name', 'asc', 'name, A to Z'], ['name', 'desc', 'name, Z to A'], ['district', 'asc', 'district, low to high'], ['district', 'desc', 'district, high to low'],
    ['size', 'asc', 'size, small to large'], ['size', 'desc', 'size, large to small'], ['tenure', 'asc', 'tenure, freehold first'], ['tenure', 'desc', 'tenure, freehold last'], ['match', 'asc', 'best match'], ['near', 'asc', 'distance, nearest first']];
  const sortNow = () => (S.sort && (S.sort !== 'near' || nearInput()) ? S.sort : (nearInput() ? 'near' : 'price'));
  const dirNow = () => (S.sort && sortNow() === S.sort && S.dir === 'desc' ? 'desc' : 'asc');
  /* tenure order: Freehold, then 999-year, then 99-year, then other leases; within each, the later lease start first and no start year last. Lease start is never TOP or age. */
  function tenureKey(it) { const t = tenureText(it); if (t === 'Freehold') return [0, 0]; const m = /^(\d+)-year lease(?: from (\d{4})|hold)$/.exec(t); if (!m) return null; const y = Number(m[1]); return [y === 999 ? 1 : y === 99 ? 2 : 3, m[2] ? -Number(m[2]) : null]; }
  function sortVals(it, k) {
    const f = facts(it), nm = nice(it.name).toLowerCase();
    if (k === 'price') return has(f.sortP) ? [f.sortP, nm] : null;
    if (k === 'name') return [nm];
    if (k === 'district') return Number(it.district) ? [Number(it.district), nm] : null;
    if (k === 'size') return has(f.sizeLo) ? [f.sizeLo, nm] : null;
    if (k === 'tenure') { const t = tenureKey(it); return t ? [t[0], t[1], nm] : null; }
    if (k === 'near') return it.dist == null ? null : [it.dist];
    return [];
  }
  function sorted(items) {
    const k = sortNow(), d = dirNow() === 'desc' ? -1 : 1, idx = new Map(items.map((x, i) => [x, i]));
    if (k === 'match') return items.slice();
    const V = new Map(items.map((x) => [x, sortVals(x, k)]));
    return items.slice().sort((a, b) => {
      const va = V.get(a), vb = V.get(b);
      if (!va || !vb) return !va && !vb ? idx.get(a) - idx.get(b) : !va ? 1 : -1;   // nothing to sort on: last, either way
      for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const x = va[i], y = vb[i]; if (x == null && y == null) continue; if (x == null) return 1; if (y == null) return -1;   // a missing part (e.g. no lease year): last, either way
        const c = typeof x === 'string' ? x.localeCompare(y) : x - y; if (c) return c * d;
      }
      return idx.get(a) - idx.get(b);
    });
  }
  const sortCtl = () => { const cur = sortNow() + ':' + dirNow(); return `<label class="kd-sort"><span class="kd-sortl">Sorted by</span><span class="kd-sortm">Sort by</span> <select data-f="sort" aria-label="Sort these developments">${SORT_OPTS.filter((o) => o[0] !== 'near' || (S.near && NR)).map((o) => `<option value="${o[0]}:${o[1]}"${cur === o[0] + ':' + o[1] ? ' selected' : ''}>${esc(o[2])}</option>`).join('')}</select></label>`; };
  const bedShort = () => (S.req.beds === 4 ? '4BR+' : S.req.beds + 'BR');
  const sizeHead = (sale) => (S.req.beds ? bedShort() + ' size' : sale === 'new' ? 'Bedrooms · size' : 'Size');
  /* the column headings sort (desktop): real buttons in <th>, aria-sort on the active one; a second press reverses it */
  function thead(sale, over, unconf, grp) {
    const cols = [['name', 'Development'], ['district', 'District'], ['tenure', 'Tenure'], ['size', unconf ? 'Size' : sizeHead(sale)], ['price', over ? 'Price' : sale === 'new' ? 'Asking price' : 'Resale price']], k = sortNow(), d = dirNow();
    return `<thead class="kd-th"><tr>${cols.map((c) => { const on = k === c[0], nd = on && d === 'asc' ? 'descending' : 'ascending';
      return `<th scope="col"${c[0] === 'price' ? ' class="r"' : ''}${on ? ` aria-sort="${d === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" class="kd-sh" data-f="hsort" data-k="${c[0]}" data-grp="${esc(grp)}" aria-label="${esc('Sort by ' + c[1].toLowerCase() + ', ' + nd)}">${esc(c[1])}${on ? `<span class="kd-arr" aria-hidden="true">${d === 'asc' ? '▲' : '▼'}</span>` : ''}</button></th>`; }).join('')}<th scope="col"><span class="kd-vh">Links</span></th></tr></thead>`;
  }
  const moreBtn = (key, left) => (left > 0 ? `<button type="button" class="kd-more-b" data-f="more" data-key="${esc(key)}">Show ${Math.min(left, 30)} more${left > 30 ? ' (' + left + ' left)' : ''} <span aria-hidden="true">⌄</span></button>` : '');
  const PAGE = 20;

  /* ------------------------------------------------------------------ the requirements form (one component: the entry screen, the desktop panel and the phone sheet) */
  const seg = (k, opts, cur, extra) => `<div class="kd-seg" role="radiogroup" data-k="${k}"${extra || ''}>${opts.map((o) => `<button type="button" role="radio" aria-checked="${String(o[0]) === String(cur)}" data-f="seg" data-k="${k}" data-v="${o[0]}"${o[2] ? ' disabled' : ''}>${esc(o[1])}</button>`).join('')}</div>`;
  const help = (k, text) => `<button type="button" class="kd-i" data-f="help" data-k="${k}" aria-expanded="${!!S.helps[k]}" aria-label="More about this">ⓘ</button><p class="kd-hp" data-hp="${k}"${S.helps[k] ? '' : ' hidden'}>${esc(text)}</p>`;
  const radChips = () => (S.near && !isDist(S.near) ? `<div class="kd-rad" role="radiogroup" aria-label="Distance">${RADII.map((x) => `<button type="button" role="radio" aria-checked="${x === S.near.r}" data-f="rad" data-r="${x}">${esc(FI.radiusText(x))}</button>`).join('')}</div>` : '');
  function bedsBlock(inv) {
    const r = S.req, usable = D.inventoryUsable(inv), loading = !invLoaded;
    let note, off = false;
    if (bedsOn() && r.sale !== 'new') {   // resale by bedroom type: Research's own types, from the accepted classification
      const RES = 'Resales are matched on bedroom types from URA rental records or floor plans; where those don’t confirm it, they’re listed separately.';
      note = r.sale === 'resale' ? RES : r.beds && !usable && !loading ? 'Applied to resale only: new launches can’t be matched on bedrooms just now.' : RES + ' New launches: from new-launch listings.';
    }
    else if (r.sale === 'resale') { off = true; note = CFG.BEDS_URL ? 'Bedroom matching for resale isn’t available just now.' : 'Not available for resale: the sales records don’t include bedrooms, and we never work them out from size.'; }
    else if (loading && r.sale === 'new') note = 'Matched on new-launch listings (loading).';   // still loading: the choice can be made now and is kept
    else if (!usable && !loading) { off = true; note = 'Bedroom matching uses recently updated new-launch listings, which aren’t available right now.'; }
    else if (r.beds && r.sale === 'either') note = CFG.BEDS_URL ? 'Applied to new launches only: resale bedroom matching isn’t available just now.' : 'Applied to new launches only. Resale isn’t filtered by bedrooms.';
    else if (r.beds) note = 'Matched on new-launch listings, so only new launches with a matching bedroom type are listed.';
    else if (r.sale === 'new' && bedsOn()) note = 'Matched on the bedroom types in new-launch listings.';   // resale has its own bedroom matching: never say it can't be filtered
    else note = 'For new launches only, from new-launch listings. Resale can’t be filtered by bedrooms.';
    return `<div class="kd-f" data-bedsblk><span class="kd-l">Bedrooms <small>optional</small></span>${seg('beds', [['', 'Any'], [1, '1'], [2, '2'], [3, '3'], [4, '4+']].map((o) => (o[0] !== '' && off ? o.concat([true]) : o)), r.beds || '', off ? ' aria-disabled="true"' : '')}<p class="kd-note">${esc(note)}</p></div>`;
  }
  function overToggle(counts) {
    const n = counts && !S.req.over && counts.over ? ` <i>(${counts.over} more)</i>` : '';
    return `<label class="kd-tick"><input type="checkbox" data-f="over"${S.req.over ? ' checked' : ''}><span>Include developments up to 5% over budget${n}</span></label>`;   // still listed apart, in their own section
  }
  function formHtml(entry) {
    const r = S.req, inv = inventory(), counts = lastRes && lastRes.counts;
    const bud = `<div class="kd-f"><label class="kd-l" for="kdBudget">Maximum budget</label><div class="kd-in"><span class="kd-pre">$</span><input id="kdBudget" type="text" inputmode="numeric" autocomplete="off" placeholder="${entry ? 'e.g. 1,800,000' : ''}" value="${esc(S.draftBudget)}" aria-describedby="kdBudgetErr"></div><p class="kd-err" id="kdBudgetErr" role="alert">${esc(S.errBudget)}</p>${entry ? '<p class="kd-note">The most you’d spend.</p>' : ''}${entry ? '' : overToggle(counts)}</div>`;
    const placeVal = S.near && NR ? NR.label : S.pendingWhere;
    const where = `<div class="kd-f"><label class="kd-l" for="kdPlace">Where? <small>optional</small></label><div class="kd-in kd-place"><span class="kd-pre" aria-hidden="true">⌕</span><input id="kdPlace" type="search" autocomplete="off" maxlength="60" role="combobox" aria-expanded="false" aria-controls="kdSugg" aria-autocomplete="list" placeholder="${entry ? 'Road, MRT, neighbourhood, development or postal code' : 'Road, MRT, area, development or postal code'}" value="${esc(placeVal)}">${S.near ? '<button type="button" class="kd-x" data-f="clearplace" aria-label="Clear place">✕</button>' : ''}</div><div class="kd-sugg" id="kdSugg" role="listbox" hidden></div>${nearErr ? `<p class="kd-err" role="status">${esc(nearErr)}</p>` : ''}${S.near ? (isDist(S.near) ? '<p class="kd-radl">Every development recorded in this postal district</p>' : `<p class="kd-radl">Distance from ${esc(NR ? NR.label : 'the place')}</p>${radChips()}`) : (entry ? '<p class="kd-note">Choose a place to search within 500 m, 1 km, 2 km or 3 km of it.</p>' : '')}</div>`;
    const typ = `<div class="kd-f"><span class="kd-l">Property type ${help('type', 'Condominiums, ECs and cluster housing are different property types with their own rules and prices, so each is shown on its own and never mixed.')}</span>${seg('type', [['any', 'Any'], ['condo', 'Condo'], ['ec', 'EC'], ['cluster', 'Cluster']], r.type)}</div>`;
    const sale = `<div class="kd-f"><span class="kd-l">New launch or resale</span>${seg('sale', [['new', 'New launch'], ['resale', 'Resale'], ['either', 'Either']], r.sale)}</div>`;
    const more = `<details class="kd-more" data-more${S.moreOpen || r.minSize || r.tenure !== 'any' || r.beds ? ' open' : ''}><summary data-f="moresum">More requirements <small>size, tenure, bedrooms</small></summary><div class="kd-fgrid">
      <div class="kd-f"><label class="kd-l" for="kdMin">Minimum size</label><div class="kd-in"><input id="kdMin" type="text" inputmode="numeric" autocomplete="off" placeholder="Optional" value="${r.minSize ? money(r.minSize) : ''}" aria-label="Minimum size in square feet"><span class="kd-suf">sq ft</span></div></div>
      <div class="kd-f"><span class="kd-l">Tenure</span>${seg('tenure', [['any', 'Any'], ['free', 'Freehold or 900+ yr'], ['lease', '99-year']], r.tenure)}</div>
      ${bedsBlock(inv)}</div></details>`;
    const go = entry ? '<button type="button" class="kd-btn kd-go" data-f="show">Show developments →</button>' : `<div class="kd-apply"><button type="button" class="kd-btn" data-f="done" id="kdDone">${esc(doneText())}</button><button type="button" class="kd-link" data-f="reset">Clear all</button></div>`;
    return `<div class="kd-grid2">${bud}${where}</div>${typ}${sale}${more}${go}`;
  }
  const doneText = () => { const c = lastRes ? lastRes.counts.projects : 0; return 'Show ' + c + (c === 1 ? ' development' : ' developments'); };

  /* ------------------------------------------------------------------ results */
  const invUsable = () => D.inventoryUsable(inventory());
  /* new launches asked for, but the listings can't be used (missing, or past the 21-day window): said once, plainly; past developer sales are never put in their place */
  const invGone = (res) => (res.req.sale !== 'resale' && invLoaded && !invUsable() ? `<p class="kd-gn kd-invgone">New launches are listed only from recent developer listings, which couldn’t be loaded just now${res.req.sale === 'either' ? ', so only resale is shown' : ''}. Past developer sales are on each development’s <a href="${BASE}research/">Research page</a>.</p>` : '');
  const placeLine = () => (districtInput() ? 'In ' + NR.label + ' · developments recorded in this postal district' : S.near && NR ? 'Within ' + FI.radiusText(S.near.r) + ' of ' + NR.label : '');
  function chips() {
    const r = S.req, out = [];
    if (r.beds) out.push([r.beds === 4 ? '4+ bedrooms' : r.beds === 1 ? '1 bedroom' : r.beds + ' bedrooms', 'more']);
    out.push(['Up to ' + M2(r.budget).replace(/\.00M$/, 'M').replace(/(\.\d)0M$/, '$1M'), 'budget']);
    if (districtInput()) out.push([NR.label, 'place']); else if (S.near && NR) out.push([NR.label + ' · ' + FI.radiusText(S.near.r), 'place']);
    out.push([{ any: 'All property types', condo: 'Condo', ec: 'EC', cluster: 'Cluster housing' }[r.type] || 'All property types', 'type']);
    out.push([r.sale === 'new' ? 'New launch' : r.sale === 'resale' ? 'Resale' : 'New launch and resale', 'sale']);
    if (r.minSize) out.push([money(r.minSize) + '+ sq ft', 'size']);
    if (r.tenure !== 'any') out.push([r.tenure === 'free' ? 'Freehold or 900+ year lease' : '99-year', 'tenure']);
    return `<div class="kd-chips">${out.map((c) => `<button type="button" class="kd-chip" data-f="edit" data-focus="${c[1]}">${esc(c[0])}</button>`).join('')}</div>`;
  }
  /* Ken (28 Oct): one plain headline. N counts confirmed matches only (bedrooms "not confirmed" are their own collapsed group, never counted); how the matches break down is in "How these are matched". */
  function headline(res) {
    const r = res.req, N = res.counts.projects;
    if (!N && r.sale === 'new' && !invUsable()) return 'Developer listings couldn’t be loaded just now';
    if (!N) return 'No developments match your search';
    return N + (N === 1 ? ' development matches your search' : ' developments match your search');
  }
  function subLine(res) { return S.near && NR ? `<p class="kd-sub">${esc(placeLine())}${sortNow() === 'near' ? ' · nearest first' : ''}${districtInput() ? ` · <a href="${esc(distMapHref())}" data-kd-dmap>See it on the Map ›</a>` : ''}</p>` : ''; }
  /* the breakdown that used to sit under the headline: kept, in the method note */
  function breakdown(res) {
    const c = res.counts, t = [];
    if (c.typical) t.push(c.typical + ' resale development' + (c.typical === 1 ? '' : 's') + ' with typical prices within your maximum');
    if (c.some) t.push(c.some + ' with only some sales within it (typical prices are higher; marked “Some sales within your max”)');
    if (c.huttons) t.push(c.huttons + ' new launch' + (c.huttons === 1 ? '' : 'es') + ' from developer listings');
    if (res.beds && c.insufficient) t.push(c.insufficient + ' not confirmed as ' + bedWord(res.req.beds) + ' (listed apart, not counted)');
    return t.length ? 'This search: ' + t.join('; ') + '.' : '';
  }
  const RES_NOTE = 'Estimates from past URA transactions, not current listings.';
  function groupNote(g) {
    if (g.sale !== 'new') return `<p class="kd-gn">${esc(RES_NOTE)}</p>`;
    const gw = groupWhen(g.items);
    return `<p class="kd-gn kd-inv">Developer listings · Checked ${esc(gw.when || '')}${gw.late ? ' · may have changed since' : ''}. Indicative asking prices${gw.past ? ' (as shown then)' : ''}. Availability may have changed.</p>`;
  }
  function tableHtml(items, key, sale, over, unconf) {
    const shown = S.shown[key] || PAGE, list = sorted(items), gw = sale === 'new' || over ? groupWhen(items.filter((i) => i.sale === 'new')) : null;
    return `<table class="kd-tbl" data-sale="${sale}" data-grp="${esc(key)}">${thead(sale, over, unconf, key)}<tbody class="kd-tb">${list.slice(0, shown).map((it) => rowHtml(it, gw, unconf)).join('')}</tbody></table>${moreBtn(key, list.length - shown)}`;
  }
  function groupHtml(g, key) {
    const name = g.sale === 'new' ? 'New launch developments' : 'Resale developments';
    return `<div class="kd-g" data-sale="${g.sale}"><div class="kd-gh"><h3>${name} <span class="kd-cnt">${g.items.length}</span></h3>${sortCtl()}</div>${groupNote(g)}${tableHtml(g.items, key, g.sale)}</div>`;
  }
  function listHtml(res) {
    const secs = D.sections(res.items), multi = secs.length > 1 || (secs[0] && secs[0].cls !== 'condo');
    let h = '';
    secs.forEach((s) => {
      h += `<section class="kd-sec" data-cls="${s.cls}">` + (multi ? `<h2 class="kd-ch">${esc(CLS_H[s.cls])}</h2>${CLS_NOTE[s.cls] ? `<p class="kd-gn">${esc(CLS_NOTE[s.cls])}</p>` : ''}` : '') + s.groups.map((g) => groupHtml(g, s.cls + '|' + g.sale)).join('') + '</section>';
    });
    if (res.req.over && res.over.length) {
      const sales = res.over.map((i) => i.sale), mixed = sales.indexOf('new') > -1 && sales.indexOf('resale') > -1;
      h += `<section class="kd-sec kd-over"><div class="kd-gh"><h2 class="kd-ch">Up to 5% over your maximum <span class="kd-cnt">${res.over.length}</span></h2></div><p class="kd-gn">Their recent resales or listed prices start above ${esc(m2(res.req.budget))} but within 5% of it. Listed apart from the developments above.</p>${tableHtml(res.over, 'over', mixed ? 'resale' : sales[0], true)}</section>`;
    }
    return h;
  }
  /* Bedrooms not confirmed: resales within the maximum that COULD be the chosen count. Their own group, collapsed, after the matches, never counted as one. */
  function unconfHtml(res) {
    const b = res.beds; if (!b) return '';
    const w = bedWord(res.req.beds), list = b.insufficient;
    let h = '';
    if (list.length) {
      const secs = D.sections(list), multi = secs.length > 1 || (secs[0] && secs[0].cls !== 'condo');
      h += `<details class="kd-sec kd-unconf"${S.unconfOpen ? ' open' : ''}><summary data-f="unconfsum"><span class="kd-ch">Not confirmed as ${esc(w)}</span> <span class="kd-cnt">${list.length}</span></summary><p class="kd-gn">Bedroom type not confirmed: these resales could be ${esc(w)}, but the records don’t say. Check the floor plan. Not counted in the ${res.counts.projects} above.</p>`;
      secs.forEach((s) => { const its = s.groups.reduce((a, g) => a.concat(g.items), []); h += (multi ? `<h3 class="kd-uch">${esc(CLS_H[s.cls])}</h3>` : '') + tableHtml(its, 'unconf|' + s.cls, 'resale', false, true); });
      h += '</details>';
    }
    const u = b.unclassified.count;
    if (u) h += `<p class="kd-gn kd-uncl">${u} more development${u === 1 ? ' has' : 's have'} resales within your maximum, but ${u === 1 ? 'its' : 'their'} records don’t show bedrooms. <button type="button" class="kd-link" data-f="alt" data-id="beds">Show any bedroom</button></p>`;
    return h;
  }
  /* why so few: what a bedroom choice left out, counted by reason (in the method note, not in front of the answer) */
  const WHY = { above: 'no {w} resale, confirmed or possible, within your maximum', small: '{w} homes smaller than your minimum size', stale: 'no {w} resale in the last 6 months', absent: 'no recent {w} resale on record' };
  function excludedText(res) {
    const b = res.beds; if (!b) return '';
    const by = {}; Object.keys(b.excluded).forEach((k) => { const r = ['above', 'small', 'stale', 'absent'].find((x) => k.split('/').indexOf(x) > -1) || 'above'; by[r] = (by[r] || 0) + b.excluded[k]; });
    const w = bedWord(res.req.beds), parts = ['above', 'small', 'stale', 'absent'].filter((k) => by[k]).map((k) => by[k] + ' with ' + WHY[k].replace('{w}', w));
    return parts.length ? 'With ' + w + ' chosen, these resale developments were left out: ' + parts.join('; ') + '. “No recent resale on record” doesn’t mean a development has no such homes.' : '';
  }
  function emptyHtml(res) {
    const q = res.req.near ? Object.assign({}, res.req) : res.req, ctx = ctxNow();
    const alts = res.beds && KB ? KB.alternatives(ix, bx, q, ctx) : D.alternatives(ix, q, ctx);
    return `<div class="kd-empty"><p>Try one of these:</p>${alts.length ? `<ul>${alts.map((a) => `<li><button type="button" class="kd-link" data-f="alt" data-id="${a.id}">${esc(a.label)}</button> <span>${a.count} ${a.count === 1 ? 'development' : 'developments'}</span></li>`).join('')}</ul>` : '<p class="kd-note">Raise the maximum or change a requirement under Edit search.</p>'}<p class="kd-note">Or <a href="#" data-f="ken">ask Ken what may work</a>.</p></div>`;
  }
  function unplacedHtml(res) {
    const u = res.unplaced; if (!u.length) return '';
    const names = {}, list = u.filter((i) => !names[i.id] && (names[i.id] = 1));
    return `<details class="kd-unp"><summary>${list.length} more fit${list.length === 1 ? 's' : ''} your maximum but ${list.length === 1 ? 'has' : 'have'} no verified map position</summary><p class="kd-gn">Not confirmed to be within ${esc(FI.radiusText(S.near.r))} of ${esc(NR.label)}, so not sorted by distance.</p><ul>${list.map((i) => `<li>${i.ura ? `<a data-f="go" data-id="${esc(i.id)}" href="../../research/#/p/${esc(i.id)}/${i.sale}">${esc(nice(i.name))}</a>` : `<b>${esc(nice(i.name))}</b>`}<span>${i.sale === 'new' ? 'New launch' : 'Resale'}${i.beds && i.beds.state === 'insufficient' ? ' · bedrooms not confirmed' : ''}</span></li>`).join('')}</ul></details>`;
  }
  function upcomingHtml(res) {
    if (!(S.near && NR && NM) || isDist(S.near) || res.req.sale === 'resale') return '';
    const have = {}; res.items.concat(res.unplaced).forEach((i) => { have[i.id] = 1; });
    const self = S.near.t === 'dev' && NM.BY[S.near.n] ? NM.BY[S.near.n].id : '', ids = {}, rows = [];
    (sitesDoc || []).forEach((x) => { if (x.id === self || have[x.id] || typeof x.lat !== 'number' || typeof x.lon !== 'number') return; const d = window.KPT_MAP.hav({ lat: NR.lat, lon: NR.lon }, x); if (d <= S.near.r) { ids[x.id] = 1; rows.push({ name: x.name, d, url: x.url, ext: true, tag: x.tagline || '' }); } });
    NM.UP.forEach((p) => { if (!p.pos || p.id === self || have[p.id] || ids[p.id]) return; const d = window.KPT_MAP.hav({ lat: NR.lat, lon: NR.lon }, p); if (d <= S.near.r) rows.push({ name: p.n, d, url: p.up && p.up.ms ? p.up.ms : '../../research/map/#p=' + p.id, ext: !!(p.up && p.up.ms), tag: NM.upStage(p) }); });
    if (!rows.length) return '';
    rows.sort((a, b) => a.d - b.d);
    return `<section class="kd-sec kd-up"><h2 class="kd-ch">Upcoming launches within ${esc(FI.radiusText(S.near.r))}</h2><p class="kd-gn">No prices here yet, so these are possibilities, not budget matches.</p><ul class="kd-ul">${rows.map((x) => `<li><a href="${esc(x.url)}"${x.ext ? ' target="_blank" rel="noopener"' : ''} data-f="go">${esc(x.name)}${x.ext ? ' <span aria-hidden="true">↗</span>' : ''}</a><span>${esc(kmText(x.d) + (x.tag ? ' · ' + x.tag : ''))}</span></li>`).join('')}</ul></section>`;
  }
  const METHOD = ['Your budget is your maximum. Resale: a development is listed when its URA resales in the last 12 months, at your minimum size or larger, include prices at or under it, with at least 3 such sales, one of them in the last 6 months.',
    'For resale, “Typical prices within your maximum” means the middle half of those sales is at or under it. “Some sales within your maximum” means only part of the range is, and typical prices are higher.',
    'Resale figures are past sales, not homes for sale, and not a valuation. New launches are listed only from developer listings checked in the last 21 days (the check date is shown once for each group): the bedroom types and sizes listed, with indicative asking prices at or under your maximum. Past developer sales are never used as current prices; they stay on each development’s Research page as price history.',
    'Distances are in a straight line. Bedrooms are matched only for new launches, from new-launch listings, and are never worked out from size. Condos, ECs and cluster housing are never mixed.',
    'The optional “up to 5% over” list shows developments whose recent resales or listed prices start just above your maximum. It is never mixed into the main list.'];
  const BEDS_METHOD = 'Bedrooms: for resale, a development is matched on the bedroom types its Research page shows, worked out from URA rental records or developers’ floor plans (URA doesn’t record bedrooms with a sale), and only where enough of its resales are identified. Where they aren’t, resales that could be that size are listed separately as “not confirmed”. For new launches, bedrooms come from recently updated new-launch listings. Studios and penthouses don’t count as a number of bedrooms. Condos, ECs and cluster housing are never mixed.';
  function method(res) {
    let m = METHOD;
    if (bedsOn() && res.req.sale !== 'new') { m = METHOD.slice(); m[3] = 'Distances are in a straight line. ' + BEDS_METHOD; const x = excludedText(res); if (x) m.push(x); }
    m = m.concat(['Resale prices: with a bedroom count chosen and enough of its resales identified, the price shown is the typical (median) resale price of that bedroom type in the last 12 months. Otherwise it is the middle half of the development’s recent resales at your size, shown as a range; a single figure is never made up. “Some sales within your max” marks developments whose typical prices are above your maximum.',
      'New launches: “from” is the lowest listed price of the bedroom types within your maximum; the check date is shown once for each group, and on a row only when it differs.']);
    const b = breakdown(res); return b ? [b].concat(m) : m;
  }
  function resultsHtml(res) {
    const body = res.state === 'ok' ? listHtml(res) : emptyHtml(res);
    return `<div class="kd-lead"><h1 class="kd-h1" id="kdH">${esc(headline(res))}</h1>${subLine(res)}${invGone(res)}</div>
      <div class="kd-bar"><div class="kd-barrow">${chips()}<button type="button" class="kd-editb" data-f="edit" aria-expanded="${S.edit}">Edit search <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 6h9M15 6h2M3 14h3M9 14h8"/><circle cx="13.5" cy="6" r="1.8"/><circle cx="7.5" cy="14" r="1.8"/></svg></button></div>${S.near ? `<div class="kd-radin">${radChips()}</div>` : ''}</div>
      ${S.near && !isDist(S.near) ? `<div class="kd-quick">${radChips()}</div>` : ''}<div class="kd-quick2">${overToggle(res.counts)}</div>
      ${body}${unconfHtml(res)}${res.state === 'ok' || (res.beds && res.counts.insufficient) ? unplacedHtml(res) + upcomingHtml(res) : ''}
      <details class="kd-meth"><summary>How these are matched</summary><div class="inner">${method(res).map((t) => `<p>${esc(t)}</p>`).join('')}</div></details>`;
  }

  /* ------------------------------------------------------------------ map (the Map's own view; one Leaflet map kept alive across re-renders) */
  const stageOn = () => !!(S.near && NR && nearInput());
  const isPhone = () => !!(window.matchMedia && matchMedia('(max-width: 899px)').matches);
  const LYR = () => (window.KPT_MAP_VIEW && window.KPT_MAP_VIEW.layers) || null;
  function destroyMap() { if (nmView) { try { nmView.destroy(); } catch (e) { /* already gone */ } } if (nmHost && nmHost.parentNode) nmHost.parentNode.removeChild(nmHost); nmView = null; nmHost = null; nmLayer = null; nmSig = ''; nmBase = ''; }
  /* the part of the map not covered by the results panel (left, on a desktop) or the bottom sheet (on a phone) */
  function stagePad() {
    if (isPhone()) { const m = document.querySelector('.kd-main'); return { tl: [18, 64], br: [18, (m ? m.offsetHeight : 0) + 16] }; }
    return { tl: [440, 64], br: [18, 40] };
  }
  function syncMap(res) {
    const slot = $('kdMapSlot'), ni = nearInput();
    if (!ni || !res) { destroyMap(); return; }
    if (!slot || !NM || !window.KPT_MAP_VIEW || !window.L) return;
    if (!nmHost) { nmHost = document.createElement('div'); nmHost.className = 'kd-map'; }
    slot.appendChild(nmHost);
    if (!nmView) {
      nmView = window.KPT_MAP_VIEW(window.KPT_MAP, NM); nmView.create(nmHost, { onSelect: mapPick, onPlace: () => {} });
      if (!S.layers && LYR()) S.layers = LYR().load();
    }
    const names = []; res.items.forEach((i) => { const p = NM.BYID[i.id]; if (p && p.pos && names.indexOf(p.n) < 0) names.push(p.n); });
    const selName = S.sel && NM.BYID[S.sel] ? NM.BYID[S.sel].n : null;
    const base = NR.key + '|' + ni.radius + '|' + names.join(',') + '|' + (isPhone() ? 'p' + (S.sheetMin ? 'n' : 'o') : 'd'), sig = base + '|' + (selName || '');
    nmView.invalidate && nmView.invalidate();
    if (sig === nmSig) return;
    const refit = base !== nmBase; nmSig = sig; nmBase = base;
    const mp = nmView.get(), c = [NR.lat, NR.lon], bnd = L.latLng(c[0], c[1]).toBounds(ni.radius * 2);
    if (!nmLayer) nmLayer = L.layerGroup().addTo(mp);
    nmLayer.clearLayers();
    L.circle(c, { radius: ni.radius, color: '#2E4FD1', weight: 2, opacity: .8, dashArray: '7 5', fillColor: '#2E4FD1', fillOpacity: .07, interactive: false }).addTo(nmLayer);
    L.circleMarker(c, { radius: 7, color: '#fff', weight: 2.5, fillColor: '#14203F', fillOpacity: 1, bubblingMouseEvents: false }).bindTooltip(NR.label, { className: 'gwtip', direction: 'top', offset: [0, -6] }).addTo(nmLayer);
    // matches are the teal dots; every other private home and launch is quiet context (not clickable), shown or hidden by the Layers control
    nmView.update({ key: sig, projects: NM.PM, quiet: true, layers: S.layers || undefined, selected: selName, cmp: names.filter((n) => n !== selName), amen: [], areaRings: NR.rings || null, bounds: bnd, fit: refit, minZoom: 11, pad: stagePad() });
  }
  /* the Layers control and the key beside it share the Map's choices for this visit */
  function drawLayers() {
    const host = $('kdLyr'); if (!host) return; const LY = LYR();
    if (!(stageOn() && NM && LY)) { host.innerHTML = ''; return; }
    if (!S.layers) S.layers = LY.load();
    host.innerHTML = LY.html(S.layers, S.lyrOpen, NM);
  }
  function drawKey() {
    const host = $('kdKey'); if (!host) return; if (!(stageOn() && NM && S.layers)) { host.innerHTML = ''; return; }
    const L2 = S.layers;
    host.innerHTML = `<div class="mapkey" aria-label="Map key"><span><i class="t"></i>Matches your search</span>${S.sel ? '<span><i class="s"></i>Selected</span>' : ''}${L2.homes ? '<span><i class="a"></i>Other private homes</span>' : ''}${L2.mrt ? '<span><i class="m"></i>MRT</span>' : ''}${L2.school && NM.hasSchools() ? '<span><i class="sc"></i>School</span>' : ''}${L2.shops ? '<span><i class="sh"></i>Shops and parks</span>' : ''}${L2.launch && NM.UP.some((p) => p.pos) ? '<span><i class="u"></i>New launch or site</span>' : ''}</div>`;
  }
  /* a card or a dot is chosen: the card is marked, the map shows the development; on a phone the sheet opens so the card is in view */
  function selectDev(id, scroll) {
    S.sel = S.sel === id && !scroll ? null : id; if (S.sel && S.sheetMin) { S.sheetMin = false; applySheet(); }
    renderResults();
    if (S.sel && scroll) { const el = document.querySelector('#kdRes [data-pid="' + S.sel + '"]'); if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.classList.remove('is-hl'); void el.offsetWidth; el.classList.add('is-hl'); } }
  }
  function mapPick(name) { const p = NM && NM.BY[name]; if (p) selectDev(p.id, true); }
  function applySheet() {
    const cols = document.querySelector('.kd-cols'), b = document.querySelector('[data-f=sheet]'); if (cols) cols.classList.toggle('is-min', !!S.sheetMin);
    if (b) { b.setAttribute('aria-expanded', String(!S.sheetMin)); const t = b.querySelector('.kd-shc'); if (t) t.textContent = S.sheetMin ? 'Show results' : 'Minimise'; }
  }

  /* ------------------------------------------------------------------ rendering */
  function reqNow() { return Object.assign({}, S.req, { near: nearInput(), district: districtInput() }); }
  function compute() {
    if (!S.req.budget || !ix) { lastRes = null; return null; }
    if (bedsState === 'off' && CFG.BEDS_URL && S.req.sale === 'resale' && S.req.beds) S.req.beds = null;   // resale bedroom data unavailable: never show a bedroom chip that isn't applied
    const cx = ctxNow(); lastRes = KB ? KB.search(ix, bedsState === 'ready' ? bx : null, reqNow(), cx) : D.search(ix, reqNow(), cx);
    window.__kdRes = lastRes;
    return lastRes;
  }
  function renderResults() {
    const res = compute(), root = $('kdRes'); if (root && !ix) { root.innerHTML = '<div class="kd-empty"><p>We couldn’t load the sales data just now. Refresh to try again, or <a href="../../projects/">browse every development</a>.</p></div>'; return; }
    if (!root || !res) return;
    root.innerHTML = resultsHtml(res);
    const dn = $('kdDone'); if (dn) dn.textContent = doneText();
    const sa = $('kdSheetCount'); if (sa) sa.textContent = doneText();
    const mapOn = !!(S.near && nearInput());
    $('kdMapCol').hidden = !mapOn;
    document.body.classList.toggle('kd-hasmap', mapOn);
    document.body.dataset.kdView = mapOn ? 'stage' : 'list';
    const sh = $('kdShT'); if (sh) sh.textContent = res.counts.projects + (res.counts.projects === 1 ? ' development' : ' developments'); const ss = $('kdShS'); if (ss) ss.textContent = placeLine() + ' · nearest first';
    applySheet();
    if (mapOn && !wasStage) window.scrollTo({ top: 0 });   // the map is a full-screen stage: start at its top
    wasStage = mapOn;
    syncMap(res); drawLayers(); drawKey();
    const key = JSON.stringify([S.req.type, S.req.sale, !!S.near, FI.bucket(res.counts.projects)]);
    if (!seenKey[key]) { seenKey[key] = 1; KPT.track('find_shown', { budget_band: bandOf(S.req.budget), result_bucket: FI.bucket(res.counts.projects), area_filter: !!S.near, sale_groups: S.req.sale === 'either' ? 'resale+new' : S.req.sale, property_type: S.req.type }); }
  }
  function renderForm() {
    const el = $('kdForm'); if (!el) return;
    el.innerHTML = formHtml(S.mode === 'entry');
    const t = S.mode === 'entry' ? null : null; void t;
    syncMap(lastRes);
  }
  function renderAll() {
    const root = $('root'), bey = $('beyond'); if (bey) bey.hidden = S.mode === 'entry';
    if (S.mode === 'entry') {
      root.className = 'kd is-entry';
      root.innerHTML = `<div class="kd-entry">${EMB ? '' : '<p class="kd-eye">I’m looking to buy</p><h1 class="kd-h1">What are you looking for?</h1><p class="kd-lede">Tell us your maximum and where. Add requirements if you have them, and change any of it later without starting again.</p>'}${srcLine ? `<p class="kd-src">${esc(srcLine)}</p>` : ''}<div id="kdForm" class="kd-form"></div>${srcLine ? '' : '<p class="kd-fine">Not sure of your budget? <a href="' + BASE + 'tools/tdsr/#cash">Work out what you can afford first ›</a></p>'}</div>`;
      $('kdForm').innerHTML = formHtml(true); bindInputs(); return;
    }
    root.className = 'kd is-results' + (S.edit ? ' is-edit' : '');
    root.innerHTML = `<div class="kd-cols${S.sheetMin ? ' is-min' : ''}"><div class="kd-main"><div class="kd-shd"><button type="button" class="kd-shb" data-f="sheet" aria-expanded="${!S.sheetMin}" aria-controls="kdRes"><span class="kd-grab" aria-hidden="true"></span><span class="kd-shl"><b id="kdShT"></b><span id="kdShS"></span></span><span class="kd-shc">${S.sheetMin ? 'Show results' : 'Minimise'}</span></button></div><div id="kdEdit" class="kd-edit${S.edit ? ' open' : ''}" role="region" aria-label="Edit your search"><div class="kd-edit-h"><b>Edit your search</b><span>Results update as you change things</span><button type="button" class="kd-sheetx" data-f="done" aria-label="Close">✕</button></div><div id="kdForm" class="kd-form"></div><div class="kd-sheetbar"><button type="button" class="kd-btn" data-f="done" id="kdSheetCount"></button></div></div><div id="kdRes"></div></div><aside class="kd-mapcol" id="kdMapCol" hidden><div class="kd-mapbox kpm"><div id="kdMapSlot" class="kd-mapslot"></div><div id="kdLyr"></div><div id="kdKey"></div><div class="zoomc zc"><button type="button" data-f="zoom" data-d="1" aria-label="Zoom in">+</button><button type="button" data-f="zoom" data-d="-1" aria-label="Zoom out">−</button></div></div></aside></div>`;
    compute();
    $('kdForm').innerHTML = formHtml(false); bindInputs(); renderResults();
  }
  const bandOf = (b) => { const step = 200000; if (b < 600000) return 'under-0.6m'; if (b >= 4000000) return '4m-plus'; const lo = Math.floor(b / step) * step; return (lo / 1e6).toFixed(1) + '-' + ((lo + step) / 1e6).toFixed(1) + 'm'; };

  /* ------------------------------------------------------------------ inputs */
  function typedAmt(raw) { const t = String(raw == null ? '' : raw).replace(/[^0-9.]/g, ''); if (!t) return ''; const i = t.indexOf('.'), ip = (i < 0 ? t : t.slice(0, i)).replace(/^0+(?=\d)/, ''); return ip ? Number(ip).toLocaleString('en-SG') : '0'; }
  /** "2,300,000", "2.3m", "$2.3 million", "850k". Returns { value } or { error } or { empty }. */
  function parseBudget(s) {
    let t = String(s == null ? '' : s).trim(); if (!t) return { empty: true };
    if (/[-−–]/.test(t)) return { error: 'Amounts can’t be negative.' };
    t = t.replace(/^(s\$|\$)\s*/i, '').replace(/\s+/g, '').replace(/,/g, '');
    let mult = 1; const suf = /^(.*?)(k|m|mil|million)$/i.exec(t); if (suf) { mult = /^k$/i.test(suf[2]) ? 1e3 : 1e6; t = suf[1]; }
    if (!/^\d+(\.\d+)?$/.test(t)) return { error: BUDGET_ERR };
    const v = Math.round(parseFloat(t) * mult); return v >= D.T.minBudget && v <= D.T.maxBudget ? { value: v } : { error: BUDGET_ERR };
  }
  let budgetTimer = null;
  function applyBudget(final) {
    const inp = $('kdBudget'); if (!inp) return false;
    const p = parseBudget(inp.value);
    if (p.value) { S.errBudget = ''; const e = $('kdBudgetErr'); if (e) e.textContent = ''; if (p.value !== S.req.budget) { S.req.budget = p.value; if (S.mode === 'results') commit(false); } return true; }
    if (final) { S.errBudget = p.empty ? BUDGET_ERR : p.error; const e = $('kdBudgetErr'); if (e) e.textContent = S.errBudget; }
    return false;
  }
  function applyMin(inp) {
    const n = Number(String(inp.value).replace(/[^0-9]/g, '')); S.req.minSize = n >= 100 && n <= 20000 ? n : null;
    if (S.mode === 'results') commit(false);
  }
  function bindInputs() {
    const root = $('root');
    root.oninput = (e) => {
      const t = e.target;
      if (t.id === 'kdBudget') { t.value = /[a-z.]/i.test(t.value) ? t.value.replace(/[^0-9.,a-z\s$]/gi, '').slice(0, 20) : typedAmt(t.value); S.draftBudget = t.value; clearTimeout(budgetTimer); if (S.mode === 'results') budgetTimer = setTimeout(() => applyBudget(false), 450); }
      else if (t.id === 'kdPlace') { if (S.near && NR && t.value !== NR.label) { /* typing over a chosen place: keep it until another is picked */ } S.pendingWhere = t.value; typedPlace(t.value); }
      else if (t.id === 'kdMin') { clearTimeout(budgetTimer); budgetTimer = setTimeout(() => applyMin(t), 450); }
    };
    root.onchange = (e) => {
      const t = e.target;
      if (t.id === 'kdBudget') { clearTimeout(budgetTimer); applyBudget(true); }
      else if (t.id === 'kdMin') { clearTimeout(budgetTimer); applyMin(t); }
      else if (t.dataset && t.dataset.f === 'over') { S.req.over = !!t.checked; S.shown.over = 0; commit(true); }
      else if (t.dataset && t.dataset.f === 'sort') { const v = String(t.value).split(':'); S.sort = v[0]; S.dir = v[1] === 'desc' ? 'desc' : 'asc'; S.shown = {}; renderResults(); const sel = document.querySelector('#kdRes [data-f=sort]'); if (sel) sel.focus(); }   // order of the rows shown only
    };
    root.onkeydown = (e) => {
      const t = e.target; if (!t || !t.matches) return;
      if (e.key === 'Escape' && S.edit && !(t.id === 'kdPlace' && root.querySelector('#kdSugg .kd-sg')) && !t.matches('.kd-sg')) { e.preventDefault(); closeEdit(false); return; }
      if (e.key === 'Enter' && (t.id === 'kdBudget' || t.id === 'kdMin')) { e.preventDefault(); clearTimeout(budgetTimer); if (t.id === 'kdBudget') applyBudget(true); else applyMin(t); if (S.mode === 'entry') show(); return; }
      if (t.id === 'kdPlace') {
        const opts = root.querySelectorAll('#kdSugg .kd-sg');
        if (e.key === 'Enter') { e.preventDefault(); if (opts.length === 1) opts[0].click(); } else if (e.key === 'ArrowDown' && opts.length) { e.preventDefault(); opts[0].focus(); } else if (e.key === 'Escape') suggest('');
      } else if (t.matches('.kd-sg')) {
        const opts = Array.prototype.slice.call(root.querySelectorAll('#kdSugg .kd-sg')), i = opts.indexOf(t);
        if (e.key === 'ArrowDown' && i < opts.length - 1) { e.preventDefault(); opts[i + 1].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? opts[i - 1] : $('kdPlace')).focus(); } else if (e.key === 'Escape') { $('kdPlace').focus(); suggest(''); }
      }
    };
    root.addEventListener('focusin', (e) => { if (e.target && e.target.id === 'kdPlace' && !NM) loadNear().catch(() => { nmLoad = null; }); });
    root.onclick = onClick;
  }
  function closeEdit(toTop) {
    if (!S.edit) return; S.edit = false; $('kdEdit').classList.remove('open'); $('root').classList.remove('is-edit'); lockPage(false);
    document.querySelectorAll('[data-f=edit][aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if (toTop && document.querySelector('.kd-bar')) window.scrollTo({ top: 0 });
    else { const b = document.querySelector('.kd-bar [data-f=edit]'); if (b && b.offsetParent) b.focus(); }
  }
  const lockPage = (on) => document.documentElement.classList.toggle('gw-lock', !!on && window.matchMedia && matchMedia('(max-width: 899px)').matches);
  /** A requirement changed: recompute, redraw the results, remember the search. `form` = the form needs to redraw as well (its segmented controls, bedroom note, radius chips). */
  function commit(form) {
    if (S.mode === 'results') { S.shown = {}; if (form) { const keep = document.activeElement && document.activeElement.id; renderForm(); bindInputs(); if (keep && $(keep) && /^kd(Budget|Min|Place)$/.test(keep)) $(keep).focus(); } renderResults(); }
    persist(); const st = hs(); if (st && st.kd === 'r' && S.mode === 'results') setHist('r', false);
  }
  function show() {
    if (!applyBudget(true)) { const i = $('kdBudget'); if (i) i.focus(); return; }
    // Hosted in Research: remember the search for this tab, then open the results page (Back returns here with the form as it was).
    if (EMB) { persist(); try { window.sessionStorage.setItem('kpt.find.from', 'research'); } catch (e) { /* the results page then keeps its own prefilled form one step back */ } location.href = BASE + 'tools/what-can-i-buy/'; return; }
    $('root').innerHTML = '<p class="kd-load">Loading…</p>';
    dataFor().then(() => { S.mode = 'results'; S.edit = false; S.shown = {}; renderAll(); persist(); setHist('r', true); const h = $('kdH'); if (h && h.scrollIntoView) window.scrollTo({ top: 0 }); });
  }
  function onClick(e) {
    const card = e.target.closest ? e.target.closest('.kd-card[data-pid]') : null;   // a card (not one of its links or buttons) chooses that development on the map
    if (card && stageOn() && !e.target.closest('a,button,summary,input,label')) { selectDev(card.dataset.pid, false); return; }
    const t = e.target.closest ? e.target.closest('[data-f]') : null; if (!t || !t.dataset) return; const f = t.dataset.f;
    if (f === 'locate') { selectDev(t.dataset.id, true); const b = document.querySelector('#kdRes [data-f=locate][data-id="' + t.dataset.id + '"]'); if (b) b.focus(); return; }
    if (f === 'zoom') { if (nmView) { if (Number(t.dataset.d) > 0) nmView.zoom(1); else nmView.zoomOut(1); } return; }
    if (f === 'sheet') { S.sheetMin = !S.sheetMin; applySheet(); nmSig = ''; nmBase = ''; syncMap(lastRes); return; }
    if (f === 'go') { try { window.sessionStorage.setItem('kpt.pulse.for', 'buy'); if (t.dataset.bed) { window.sessionStorage.removeItem('kpt.research.size'); window.sessionStorage.setItem('kpt.research.bed', t.dataset.bed); } } catch (x) { /* the Research page then shows its default order */ } KPT.track('find_research_click', { project_id: t.dataset.id }); return; }   // Market pulse: a buyer's question comes first on the report
    if (f === 'show') { show(); return; }
    if (f === 'seg') {
      const k = t.dataset.k; let v = t.dataset.v; if (k === 'beds') v = v ? Number(v) : null;
      S.req[k] = v;
      if (k === 'sale' && v === 'resale' && !bedsOn()) S.req.beds = null;
      if (k === 'sale' && v === 'new' && invLoaded && !D.inventoryUsable(inventory())) S.req.beds = null;   // the control is off there: nothing hidden stays applied
      if (bedsWanted() && bedsState === 'idle') { const go = () => { if (S.mode === 'results') commit(true); else { renderForm(); bindInputs(); } }; loadBeds().then(go, go); if (S.mode !== 'results') { renderForm(); bindInputs(); } return; }
      if (S.mode === 'results') commit(true); else { renderForm(); bindInputs(); }
      return;
    }
    if (f === 'rad') { const r = Number(t.dataset.r); if (S.near && RADII.indexOf(r) > -1 && r !== S.near.r) { S.near.r = r; commit(true); const b = Array.prototype.slice.call(document.querySelectorAll('#kdRes [data-f=rad][aria-checked=true]')).filter((x) => x.offsetParent)[0]; if (b) b.focus(); } return; }
    if (f === 'pick') { pickPlace(t.dataset.t, t.dataset.n).then(() => { if (S.mode === 'entry') { renderForm(); bindInputs(); } }); return; }
    if (f === 'clearplace') { S.near = null; NR = null; S.pendingWhere = ''; S.sel = null; if (S.view === 'map') S.view = 'list'; if (S.mode === 'results') commit(true); else { renderForm(); bindInputs(); } return; }
    if (f === 'help') { S.helps[t.dataset.k] = !S.helps[t.dataset.k]; t.setAttribute('aria-expanded', String(!!S.helps[t.dataset.k])); const p = document.querySelector('[data-hp="' + t.dataset.k + '"]'); if (p) p.hidden = !S.helps[t.dataset.k]; return; }
    if (f === 'moresum') { S.moreOpen = !t.parentNode.open; return; }
    if (f === 'more') { S.shown[t.dataset.key] = (S.shown[t.dataset.key] || PAGE) + 30; renderResults(); return; }
    if (f === 'row') {   // choosing a development opens its details (and, with the map, shows it there)
      const k = t.dataset.key, card = t.closest('.kd-card'); S.open[k] = !S.open[k];
      if (card && stageOn()) { S.sel = card.dataset.pid; if (S.sheetMin) { S.sheetMin = false; applySheet(); } }
      renderResults(); const b = document.querySelector('#kdRes [data-f=row][data-key="' + k.replace(/"/g, '') + '"]'); if (b) b.focus(); return;   // its details are the next table row
    }
    if (f === 'hsort') {   // a column heading: press again to reverse; the focus stays on it
      const k = t.dataset.k, g = t.dataset.grp; S.dir = sortNow() === k && dirNow() === 'asc' ? 'desc' : 'asc'; S.sort = k; S.shown = {}; renderResults();   // a new order starts again at its first page
      const b = document.querySelector('#kdRes [data-f=hsort][data-k="' + k + '"][data-grp="' + String(g).replace(/"/g, '') + '"]'); if (b) b.focus(); return;
    }
    if (f === 'unconfsum') { S.unconfOpen = !t.parentNode.open; return; }
    if (f === 'view') { if (t.disabled) return; S.view = t.dataset.v; nmSig = ''; renderResults(); window.scrollTo({ top: 0 }); return; }
    if (f === 'edit') {
      S.edit = !S.edit || !!t.dataset.focus; const el = $('kdEdit'); if (el) el.classList.toggle('open', S.edit); $('root').classList.toggle('is-edit', S.edit); lockPage(S.edit);
      document.querySelectorAll('[data-f=edit][aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', String(S.edit)));
      const fo = { budget: 'kdBudget', place: 'kdPlace', size: 'kdMin' }[t.dataset.focus]; if (S.edit && fo && $(fo)) { if (fo === 'kdMin' && !document.querySelector('[data-more]').open) document.querySelector('[data-more]').open = true; $(fo).focus(); }
      else if (S.edit && t.dataset.focus === 'more') { const m = document.querySelector('#kdEdit [data-more]'); if (m) { m.open = true; const b = m.querySelector('[data-k=beds] [aria-checked=true]'); if (b) b.focus(); } }
      return;
    }
    if (f === 'done') { e.preventDefault(); closeEdit(true); return; }
    if (f === 'reset') { S.req = Object.assign({}, BLANK, { budget: S.req.budget }); S.near = null; NR = null; S.pendingWhere = ''; S.sel = null; S.view = 'list'; commit(true); return; }
    if (f === 'alt') {
      const id = t.dataset.id, r = S.req;
      if (id === 'over') r.over = true; else if (id === 'radius' && S.near && S.near.r) { const next = RADII.find((x) => x > S.near.r); if (next) S.near.r = next; }
      else if (id === 'size') r.minSize = null; else if (id === 'tenure') r.tenure = 'any'; else if (id === 'beds') r.beds = null; else if (id === 'type') r.type = 'any'; else if (id === 'sale') r.sale = 'either';
      else if (id === 'place') { S.near = null; NR = null; S.view = 'list'; }
      commit(true); return;
    }
    if (f === 'ken') { e.preventDefault(); const k = $('kenBeyond'); if (k) k.click(); return; }
  }

  /* ------------------------------------------------------------------ start */
  function restorePlace(near, where) {
    if (near && isDist(near) && /^\d{1,2}$/.test(String(near.n)) && +near.n >= 1 && +near.n <= 28) {
      return loadNear().then(() => { const nr = resolveNear({ t: 'district', n: String(+near.n) }); if (nr) { NR = nr; S.near = { t: 'district', n: String(+near.n), r: null }; } else nearErr = 'We couldn’t find that district again, so this covers all of Singapore.'; }).catch(() => { nmLoad = null; });
    }
    if (near && NEAR_TYPES.indexOf(near.t) > -1 && RADII.indexOf(Number(near.r)) > -1 && typeof near.n === 'string') {
      return loadNear().then(() => (near.t === 'postal' ? NM.lookupPostal(String(near.n).split('~')[0]) : null)).then(() => { const nr = resolveNear(near); if (nr) { NR = nr; S.near = { t: near.t, n: near.n, r: Number(near.r) }; } else nearErr = 'We couldn’t find that place again, so this covers all of Singapore.'; }).catch(() => { nmLoad = null; nearErr = 'Place search isn’t available just now, so this covers all of Singapore.'; });
    }
    if (where) {   // an answer from the earlier Buy journey: placed only when exactly one place matches; otherwise the buyer chooses from the suggestions
      S.pendingWhere = where;
      return loadNear().then(() => {
        const list = NM.places(where).filter((x) => PICK_TYPES.indexOf(x.t) > -1 && (x.t !== 'dev' || (NM.BY[x.n] && NM.BY[x.n].pos)));
        if (list.length === 1) { const nx = isDist(list[0]) ? { t: 'district', n: list[0].n, r: null } : { t: list[0].t, n: list[0].n, r: 1000 }, nr = resolveNear(nx); if (nr) { NR = nr; S.near = nx; S.pendingWhere = ''; } }
      }).catch(() => { nmLoad = null; });
    }
    return Promise.resolve();
  }
  const plannerLine = (init) => 'From your plan: ' + (init.range ? m2(init.range.low) + '–' + m2(init.range.high) + '. The top of the range is filled in as your maximum.' : 'about ' + m2(S.req.budget) + '.');
  // Hosted in Research: always the requirements form, prefilled from the saved search or a planner's budget; nothing is shown until Show developments.
  function embedStart() {
    handoff = M.readHandoff(window.sessionStorage);
    const init = initial();
    if (init) { S.req = Object.assign({}, BLANK, init.req); if (init.req.budget) S.draftBudget = money(init.req.budget); S.view = 'list'; }
    const valid = !!(init && S.req.budget && D.clean(S.req).budget);
    if (valid && init.planner) srcLine = plannerLine(init);
    S.mode = 'entry'; renderAll(); S.ready = true;
    const ld = loadData();   // Research fix: the listings load as soon as the form is shown (before, a fresh form in Research loaded nothing until Show developments)
    if (valid) ld.then(() => (init.near || init.where ? restorePlace(init.near, init.where) : null)).then(() => { if (S.mode === 'entry' && (S.near || S.pendingWhere) && !document.activeElement.matches('input')) renderAll(); });
  }
  function start() {
    if (EMB) { embedStart(); return; }
    handoff = M.readHandoff(window.sessionStorage);
    const st = hs();   // coming back to this page through Back, Forward or a reload: the entry says whether it was the form or the results
    let init = initial();
    if (st && st.kd === 'r' && st.snap && st.snap.req && st.snap.req.budget) init = { req: Object.assign({}, BLANK, st.snap.req), near: st.snap.near, from: init && init.from };
    if (init) { S.req = Object.assign({}, BLANK, init.req); if (init.req.budget) S.draftBudget = money(init.req.budget); S.view = 'list'; }
    const valid = !!(init && S.req.budget && D.clean(S.req).budget);
    if (valid && init.planner) {   // a budget from a planner: the buyer chooses area and type first, then Show developments (never straight to islandwide results)
      srcLine = plannerLine(init);
      S.mode = 'entry'; renderAll(); loadData(); if (!st) setHist('f', false); S.ready = true; return;
    }
    if (valid && !(st && st.kd === 'f')) {
      $('root').innerHTML = '<p class="kd-load">Loading…</p>';
      dataFor().then(() => restorePlace(init.near, init.where)).then(() => {
        S.mode = 'results'; renderAll(); if (!init.near && !init.where) persist();
        // a saved search opens on its results, with the prefilled form one step back; arriving from the Research form, the form is the Research page itself, so this entry is simply the results
        if (!st) { let fromR = false; try { fromR = window.sessionStorage.getItem('kpt.find.from') === 'research'; window.sessionStorage.removeItem('kpt.find.from'); } catch (e) { fromR = false; } if (fromR) setHist('r', false); else { setHist('f', false); setHist('r', true); } }
        S.ready = true;
      });
    } else if (valid) {   // Back to the form: every requirement is still there
      $('root').innerHTML = '<p class="kd-load">Loading…</p>';
      loadData().then(() => restorePlace(init.near, init.where)).then(() => { S.mode = 'entry'; if (!(handoff && handoff.budget && handoff.budget.high === S.req.budget)) srcLine = ''; renderAll(); S.ready = true; });
    } else { S.mode = 'entry'; renderAll(); loadData(); if (!st) setHist('f', false); S.ready = true; }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-lyr]');
    if (b) { S.lyrOpen = !S.lyrOpen; drawLayers(); const nb = document.querySelector('.lyr-b'); if (nb) nb.focus(); return; }
    if (S.lyrOpen && !(e.target.closest && e.target.closest('.lyr'))) { S.lyrOpen = false; drawLayers(); }
  });
  document.addEventListener('change', (e) => {
    const c = e.target.matches && e.target.matches('[data-layer]') ? e.target : null; if (!c || !S.layers) return;
    S.layers[c.dataset.layer] = c.checked; LYR().save(S.layers); if (nmView) nmView.update({ layers: S.layers }); drawKey();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.lyrOpen) { S.lyrOpen = false; drawLayers(); const nb = document.querySelector('.lyr-b'); if (nb) nb.focus(); } });
  let rzT; addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (nmView && lastRes) { nmSig = ''; nmBase = ''; syncMap(lastRes); } }, 200); });
  // Ken: a quiet, generic WhatsApp link (no budget, place or search in it)
  const BEYOND_WA = 'Hi Ken, I was using Groundwork and have a question.';
  const kb = $('kenBeyond'); if (kb) kb.href = KPT.waLink({ message: BEYOND_WA });
  // Research (26 Oct 2026): choosing "What can this budget buy?" again starts a fresh entry. What was typed and not yet searched is cleared; a budget handed over by a
  // calculator, and a search the visitor saved by pressing Show developments, are still what the form starts from (embedStart reads them again).
  function resetEmbed() {
    if (!EMB) return;
    S.req = Object.assign({}, BLANK); S.near = null; S.pendingWhere = ''; S.draftBudget = ''; S.errBudget = ''; S.moreOpen = false; S.edit = false; S.sel = null; S.helps = {}; srcLine = '';
    embedStart();
  }
  window.__kd = { S, state: () => S, res: () => lastRes, parseBudget, embed: EMB, reset: resetEmbed, beds: () => bedsState };
  start();
})();
