/* KPT DISCOVER UI V1: the Budget Search page (tools/what-can-i-buy/). Presentation and wiring only: every matching rule is in kpt-discover.js, the data and wording of evidence come from kpt-find.js,
 * and the place search, distances and map are the Map's own (KPT_MAP, KPT_MAP_VIEW, gw-postal.js), loaded only when the buyer starts typing a place.
 * Nothing typed here (budget, place, size) is sent to analytics, WhatsApp or put in an address. The search is remembered in this tab only (sessionStorage, with the handoff).
 */
(function () {
  'use strict';
  const CFG = window.KPD_CFG, FI = window.KPT_FIND, D = window.KPT_DISCOVER, M = window.KPT_MARKET;
  KPT.setContext({ tool_name: 'what-can-i-buy', tool_category: 'research', project_name: null });
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const params = new URLSearchParams(location.search);
  const REVIEW = CFG.review || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);   // ?inventory= and ?now= work only on localhost or in test mode, never on the live site
  const MAP_V = CFG.MAP_V, RADII = D.T.radii, NEAR_TYPES = ['dev', 'mrt', 'area', 'road', 'school', 'postal'];
  const BUDGET_ERR = 'Enter a budget between $300,000 and $20,000,000.';
  const money = (n) => Number(n).toLocaleString('en-SG');
  const nowMs = () => (REVIEW && isFinite(Date.parse(params.get('now') || '')) ? Date.parse(params.get('now')) : Date.now());

  /* ------------------------------------------------------------------ state */
  const BLANK = { budget: null, over: false, type: 'any', sale: 'either', minSize: null, tenure: 'any', beds: null };
  const S = { req: Object.assign({}, BLANK), near: null, mode: 'entry', edit: false, view: 'list', shown: {}, helps: {}, sel: null, errBudget: '', pendingWhere: '', draftBudget: '', moreOpen: false };
  let ix, invDoc, sitesDoc, dataReady = null, handoff = null, NM = null, nmLoad = null, nmView = null, nmHost = null, nmLayer = null, nmSig = '', NR = null, lastRes = null, seenKey = {};

  /* ------------------------------------------------------------------ data */
  const get = (u, opts) => fetch(u, opts).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  function loadData() {
    if (dataReady) return dataReady;
    dataReady = Promise.all([get(CFG.FIND_URL), get(CFG.INV_URL, { cache: 'no-cache' }), get(CFG.SITES_URL)]).then((a) => {
      ix = FI.prepare(a[0]); invDoc = a[1];
      sitesDoc = (a[2] && Array.isArray(a[2].sites) ? a[2].sites : []).filter((x) => x && x.stage === 'new-launch' && x.status === 'configured' && /^https:\/\//.test(x.url || '') && x.id && x.name);
    });
    return dataReady;
  }
  const inventory = () => FI.prepareInventory(invDoc, nowMs());

  /* ------------------------------------------------------------------ the Map's place search (loaded on demand) */
  const addCss = (href) => { if (!document.querySelector('link[href="' + href + '"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); } };
  const addJs = (src) => new Promise((ok, no) => { const x = document.createElement('script'); x.src = src; x.onload = ok; x.onerror = () => no(new Error(src)); document.head.appendChild(x); });
  function loadNear() {
    if (nmLoad) return nmLoad;
    const g = (u, must) => fetch(u + '?v=' + MAP_V).then((r) => { if (!r.ok) throw new Error(u); return r.json(); }).catch((e) => { if (must) throw e; return null; });
    addCss('../../assets/vendor/leaflet/leaflet.css'); addCss('../../assets/css/kpt-map.css?v=' + MAP_V);
    nmLoad = Promise.all([addJs('../../assets/vendor/leaflet/leaflet.js').then(() => addJs('../../assets/js/gw-postal.js?v=' + MAP_V)).then(() => addJs('../../assets/js/kpt-map-core.js?v=' + MAP_V)).then(() => addJs('../../assets/js/kpt-map-view.js?v=' + MAP_V)), g('../../data/map/places.json', true), g('../../data/map/amen.json', true), g('../../data/map/upcoming.json')])
      .then((a) => {
        NM = window.KPT_MAP.create(a[1], a[2], { band: null, radius: 1000 }); NM.setUpcoming(a[3]);   // launches and awarded GLS sites join the same place index as the Map's
        return Promise.all([g('../../data/value/landed/geo.json'), g('../../data/value/landed/geo-more.json'), a[2].extra ? g('../../data/map/' + a[2].extra) : null])
          .then((b) => { if (b[0] || b[1]) NM.setRoads(b[0], b[1]); if (b[2]) NM.setExtra(b[2]); return NM; });
      }).catch((e) => { nmLoad = null; throw e; });
    return nmLoad;
  }
  const NEAR_BASIS = { dev: 'the development', mrt: 'the station', area: 'the centre of the neighbourhood', road: 'one point on the road', school: 'the school', postal: 'the address' };
  /** One chosen place -> its point and the straight-line distance to every mapped development within the widest radius (the Map's haversine). */
  function resolveNear(n) {
    if (!NM) return null;
    let o = null;
    if (n.t === 'dev') { const p = NM.BY[n.n]; if (p && p.pos) o = { label: p.n, sub: 'Development', lat: p.lat, lon: p.lon }; }
    else { const pd = NM.placeData({ t: n.t, n: n.n }); if (pd) o = n.t === 'area' ? { label: pd.title, sub: 'Neighbourhood', lat: pd.centre[0], lon: pd.centre[1], rings: pd.a.rings, bounds: pd.bounds } : { label: pd.title, sub: pd.meta, lat: pd.lat, lon: pd.lon }; }
    if (!o) return null;
    const dist = {}, pos = {}, c = { lat: o.lat, lon: o.lon }, far = RADII[RADII.length - 1];
    NM.PM.forEach((p) => { pos[p.id] = 1; const d = window.KPT_MAP.hav(c, p); if (d <= far) dist[p.id] = d; });
    return Object.assign(o, { key: n.t + '|' + n.n, basis: NEAR_BASIS[n.t] || 'the place', dist, pos });
  }
  const nearInput = () => (S.near && NR && NR.key === S.near.t + '|' + S.near.n ? { dist: NR.dist, pos: NR.pos, radius: S.near.r, label: NR.label } : null);
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
    const list = NM.places(t).filter((x) => NEAR_TYPES.indexOf(x.t) > -1 && (x.t !== 'dev' || (NM.BY[x.n] && NM.BY[x.n].pos)));
    box.innerHTML = list.length ? list.map((x, i) => `<button type="button" role="option" class="kd-sg" id="kdSg${i}" data-f="pick" data-t="${esc(x.t)}" data-n="${esc(x.n)}"><b>${esc(x.label || x.n)}</b><span>${esc(sugSub(x))}</span></button>`).join('') : '<p class="kd-sgn">No match. Try a postal code, road, MRT station, neighbourhood or development.</p>';
  }
  function typedPlace(v) {
    nearErr = '';
    if (String(v).trim() && !NM) loadNear().then(() => { const i = $('kdPlace'); if (i) suggest(i.value); }).catch(() => { nmLoad = null; const i = $('kdPlace'); if (i) suggest(i.value); });
    suggest(v);
  }
  function pickPlace(t, n) {
    return loadNear().then(() => {
      const next = { t, n, r: S.near ? S.near.r : 1000 }, nr = resolveNear(next);
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
    if (!handoff || !handoff.budget || handoff.budget.high !== S.req.budget || !handoff.budget.single) { next.budget = { low: S.req.budget, high: S.req.budget, single: true }; next.edited = true; }
    handoff = next; M.writeHandoff(window.sessionStorage, next);
  }
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
    if (h && h.budget && h.budget.high > 0) return { req: Object.assign({}, BLANK, { budget: Math.round(h.budget.high) }), near: null, from: h.from, range: h.budget.high > h.budget.low ? { low: h.budget.low, high: h.budget.high } : null };
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
    return [it.sale === 'new' ? 'New launch' : 'Resale', CLS[it.cls] || null, place || null, 'District ' + Number(it.district), String(it.tenure || '').replace(/ yrs /, ' years ').replace(/^(\d+ years) from/, '$1 from') || null].filter(Boolean).join(' · ');
  }
  const TAG = { typical: ['g', 'Typical prices within your maximum'], some: ['a', 'Some sales within your maximum'], huttons: ['b', 'Huttons inventory within your maximum'], over: ['n', 'Up to 5% over your maximum'] };
  function cardHtml(it) {
    const u = it.ura, nm = FI.displayName(it.name), id = esc(it.id), tag = TAG[it.tier];
    let ev = '', n = '';
    if (u) {
      ev = `<p class="kd-ev"><span>${it.sale === 'new' ? 'Developer sales (URA)' : 'Recent sales (URA)'}</span>, ${esc(sizeText(u.bandLo, u.bandHi))} · middle half <b>${esc(p2(u.q1) + '–' + p2(u.q3))}</b></p>`;
      n = `<p class="kd-n">${u.n} sale${u.n === 1 ? '' : 's'} · latest ${esc(ymLabel(u.last))}</p>`;
    }
    let inv = '';
    if (it.inv) {
      const iv = it.inv;
      if (iv.state === 'match' || (it.tier === 'over' && iv.from)) inv = `<p class="kd-inv"><span>Huttons inventory · checked ${esc(iv.when || '')}</span> ${esc(bedsNoun(iv.types))} homes from around <b>${esc(p2(iv.from))}</b></p>`;
      else if (iv.state === 'nomatch') inv = `<p class="kd-inv kd-inv-no"><span>Huttons inventory · checked ${esc(iv.when || '')}</span> none at your maximum${S.req.minSize ? ' and size' : ''}</p>`;
      else if (iv.state === 'zero') inv = `<p class="kd-inv kd-inv-no"><span>Huttons inventory · checked ${esc(iv.when || '')}</span> no units shown</p>`;
    }
    const research = u ? `<a data-f="go" data-id="${id}" href="../../research/#/p/${id}/${it.sale}">Research page ›</a>` : '';
    const map = `<a data-f="go" data-id="${id}" href="../../research/map/#p=${id}">View on Map ›</a>`;
    return `<article class="kd-card${S.sel === it.id ? ' is-sel' : ''}" data-pid="${id}"><h3>${esc(nm)}</h3><p class="kd-meta">${esc(meta(it))}</p>${ev}${n}${inv}<p><span class="kd-tag kd-tg-${tag[0]}">${tag[1]}</span></p><div class="kd-acts">${research}${map}</div></article>`;
  }

  /* ------------------------------------------------------------------ the requirements form (one component: the entry screen, the desktop panel and the phone sheet) */
  const seg = (k, opts, cur, extra) => `<div class="kd-seg" role="radiogroup" data-k="${k}"${extra || ''}>${opts.map((o) => `<button type="button" role="radio" aria-checked="${String(o[0]) === String(cur)}" data-f="seg" data-k="${k}" data-v="${o[0]}"${o[2] ? ' disabled' : ''}>${esc(o[1])}</button>`).join('')}</div>`;
  const help = (k, text) => `<button type="button" class="kd-i" data-f="help" data-k="${k}" aria-expanded="${!!S.helps[k]}" aria-label="More about this">ⓘ</button><p class="kd-hp" data-hp="${k}"${S.helps[k] ? '' : ' hidden'}>${esc(text)}</p>`;
  const radChips = () => (S.near ? `<div class="kd-rad" role="radiogroup" aria-label="Distance">${RADII.map((x) => `<button type="button" role="radio" aria-checked="${x === S.near.r}" data-f="rad" data-r="${x}">${esc(FI.radiusText(x))}</button>`).join('')}</div>` : '');
  function bedsBlock(inv) {
    const r = S.req, usable = D.inventoryUsable(inv);
    let note, off = false;
    if (r.sale === 'resale') { off = true; note = 'Not available for resale: the sales records don’t include bedrooms, and we never work them out from size.'; }
    else if (!usable) { off = true; note = 'Bedroom matching uses recently checked Huttons inventory for new launches, which isn’t available right now.'; }
    else if (r.beds && r.sale === 'either') note = 'Applied to new launches only. Resale isn’t filtered by bedrooms.';
    else if (r.beds) note = 'Matched on Huttons inventory, so only new launches with a matching bedroom type are listed.';
    else note = 'For new launches only, from Huttons inventory. Resale can’t be filtered by bedrooms.';
    return `<div class="kd-f"><span class="kd-l">Bedrooms <small>optional</small></span>${seg('beds', [['', 'Any'], [1, '1'], [2, '2'], [3, '3'], [4, '4+']].map((o) => (o[0] !== '' && off ? o.concat([true]) : o)), r.beds || '', off ? ' aria-disabled="true"' : '')}<p class="kd-note">${esc(note)}</p></div>`;
  }
  function overToggle(counts) {
    const n = counts && !S.req.over && counts.over ? ` <i>${counts.over} more</i>` : '';
    return `<label class="kd-tick"><input type="checkbox" data-f="over"${S.req.over ? ' checked' : ''}><span>Also show developments up to 5% over my maximum${n}<small>Listed separately, never mixed in</small></span></label>`;
  }
  function formHtml(entry) {
    const r = S.req, inv = inventory(), counts = lastRes && lastRes.counts;
    const bud = `<div class="kd-f"><label class="kd-l" for="kdBudget">Maximum budget</label><div class="kd-in"><span class="kd-pre">$</span><input id="kdBudget" type="text" inputmode="numeric" autocomplete="off" placeholder="${entry ? 'e.g. 1,800,000' : ''}" value="${esc(S.draftBudget)}" aria-describedby="kdBudgetErr"></div><p class="kd-err" id="kdBudgetErr" role="alert">${esc(S.errBudget)}</p>${entry ? '<p class="kd-note">The most you’d spend.</p>' : ''}${entry ? '' : overToggle(counts)}</div>`;
    const placeVal = S.near && NR ? NR.label : S.pendingWhere;
    const where = `<div class="kd-f"><label class="kd-l" for="kdPlace">Where? <small>optional</small></label><div class="kd-in kd-place"><span class="kd-pre" aria-hidden="true">⌕</span><input id="kdPlace" type="search" autocomplete="off" maxlength="60" role="combobox" aria-expanded="false" aria-controls="kdSugg" aria-autocomplete="list" placeholder="${entry ? 'Road, MRT, neighbourhood, development or postal code' : 'Road, MRT, area, development or postal code'}" value="${esc(placeVal)}">${S.near ? '<button type="button" class="kd-x" data-f="clearplace" aria-label="Clear place">✕</button>' : ''}</div><div class="kd-sugg" id="kdSugg" role="listbox" hidden></div>${nearErr ? `<p class="kd-err" role="status">${esc(nearErr)}</p>` : ''}${S.near ? `<p class="kd-radl">Distance from ${esc(NR ? NR.label : 'the place')}</p>${radChips()}` : (entry ? '<p class="kd-note">Choose a place to search within 500 m, 1 km, 2 km or 3 km of it.</p>' : '')}</div>`;
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
  const placeLine = () => (S.near && NR ? 'Within ' + FI.radiusText(S.near.r) + ' of ' + NR.label : '');
  function chips() {
    const r = S.req, out = [['Max ' + m2(r.budget), 'budget']];
    if (S.near && NR) out.push([NR.label + ' · ' + FI.radiusText(S.near.r), 'place']);
    if (r.type !== 'any') out.push([{ condo: 'Condo', ec: 'EC', cluster: 'Cluster' }[r.type], 'type']);
    if (r.sale !== 'either') out.push([r.sale === 'new' ? 'New launch' : 'Resale', 'sale']);
    if (r.minSize) out.push([money(r.minSize) + '+ sq ft', 'size']);
    if (r.tenure !== 'any') out.push([r.tenure === 'free' ? 'Freehold or 900+ year lease' : '99-year', 'tenure']);
    if (r.beds) out.push([(r.beds === 4 ? '4+' : r.beds) + ' bed', 'beds']);
    return `<div class="kd-chips">${out.map((c) => `<button type="button" class="kd-chip" data-f="edit" data-focus="${c[1]}">${esc(c[0])}</button>`).join('')}</div>`;
  }
  function headline(res) {
    const r = res.req, c = res.counts, N = c.projects, max = m2(r.budget);
    if (!N) return `No developments with recent sales within ${max}`;
    const allHut = c.typical + c.some === 0 && c.huttons > 0;
    if (allHut && r.beds && r.sale === 'new') return `${N} new launch${N === 1 ? '' : 'es'} with ${bedWord(r.beds)} homes from Huttons inventory within ${max}`;
    if (allHut) return `${N} new launch${N === 1 ? '' : 'es'} in Huttons inventory within ${max}`;
    return `${N} development${N === 1 ? '' : 's'} with recent sales within ${max}`;
  }
  function subLine(res) {
    const c = res.counts, bits = [];
    if (S.near && NR) bits.push(placeLine());
    bits.push(S.near && NR ? 'nearest first' : 'typical prices first');
    bits.push('past sales, not homes for sale');
    let s = bits.join(' · ');
    const tiers = [];
    if (c.typical && (c.some || c.huttons)) tiers.push(c.typical + ' with typical prices within your maximum');
    if (c.some) tiers.push(c.some + ' with only some sales within it');
    if (c.huttons) tiers.push(c.huttons + ' from Huttons inventory');
    return `<p class="kd-sub">${esc(s)}</p>${tiers.length ? `<p class="kd-sub kd-tiers">${esc(tiers.join(' · '))}</p>` : ''}`;
  }
  const NEW_NOTE = 'Developer sales recorded by URA. These don’t show what is still available; Huttons inventory is added where we have it.';
  function groupHtml(g, key) {
    const shown = S.shown[key] || 5, items = g.items, name = g.sale === 'new' ? 'New launch' : 'Resale';
    const left = items.length - shown;
    return `<div class="kd-g"><div class="kd-gh"><h3>${name}</h3><span>${items.length}</span></div>${g.sale === 'new' ? `<p class="kd-gn">${esc(NEW_NOTE)}</p>` : ''}${items.slice(0, shown).map(cardHtml).join('')}${left > 0 ? `<button type="button" class="kd-more-b" data-f="more" data-key="${esc(key)}">Show ${Math.min(left, 20)} more${left > 20 ? ' (' + left + ' left)' : ''} <span aria-hidden="true">⌄</span></button>` : ''}</div>`;
  }
  function listHtml(res) {
    const secs = D.sections(res.items), multi = secs.length > 1 || (secs[0] && secs[0].cls !== 'condo');
    let h = '';
    secs.forEach((s) => {
      h += `<section class="kd-sec" data-cls="${s.cls}">` + (multi ? `<h2 class="kd-ch">${esc(CLS_H[s.cls])}</h2>${CLS_NOTE[s.cls] ? `<p class="kd-gn">${esc(CLS_NOTE[s.cls])}</p>` : ''}` : '') + s.groups.map((g) => groupHtml(g, s.cls + '|' + g.sale)).join('') + '</section>';
    });
    if (res.req.over && res.over.length) {
      const key = 'over', shown = S.shown[key] || 5, left = res.over.length - shown;
      h += `<section class="kd-sec kd-over"><h2 class="kd-ch">Up to 5% over your maximum</h2><p class="kd-gn">Their recent sales start above ${esc(m2(res.req.budget))} but within 5% of it. Listed apart from the developments above.</p>${res.over.slice(0, shown).map(cardHtml).join('')}${left > 0 ? `<button type="button" class="kd-more-b" data-f="more" data-key="over">Show ${Math.min(left, 20)} more <span aria-hidden="true">⌄</span></button>` : ''}</section>`;
    }
    return h;
  }
  function emptyHtml(res) {
    const alts = D.alternatives(ix, res.req.near ? Object.assign({}, res.req) : res.req, { inv: inventory() });
    return `<div class="kd-empty"><p>Try one of these:</p>${alts.length ? `<ul>${alts.map((a) => `<li><button type="button" class="kd-link" data-f="alt" data-id="${a.id}">${esc(a.label)}</button> <span>${a.count} ${a.count === 1 ? 'development' : 'developments'}</span></li>`).join('')}</ul>` : '<p class="kd-note">Raise the maximum or change a requirement under Edit search.</p>'}<p class="kd-note">Or <a href="#" data-f="ken">ask Ken what may work</a>.</p></div>`;
  }
  function unplacedHtml(res) {
    const u = res.unplaced; if (!u.length) return '';
    const names = {}, list = u.filter((i) => !names[i.id] && (names[i.id] = 1));
    return `<details class="kd-unp"><summary>${list.length} more fit${list.length === 1 ? 's' : ''} your maximum but ${list.length === 1 ? 'has' : 'have'} no verified map position</summary><p class="kd-gn">Not confirmed to be within ${esc(FI.radiusText(S.near.r))} of ${esc(NR.label)}, so not sorted by distance.</p><ul>${list.map((i) => `<li>${i.ura ? `<a data-f="go" data-id="${esc(i.id)}" href="../../research/#/p/${esc(i.id)}/${i.sale}">${esc(FI.displayName(i.name))}</a>` : `<b>${esc(FI.displayName(i.name))}</b>`}<span>${i.sale === 'new' ? 'New launch' : 'Resale'}</span></li>`).join('')}</ul></details>`;
  }
  function upcomingHtml(res) {
    if (!(S.near && NR && NM) || res.req.sale === 'resale') return '';
    const have = {}; res.items.concat(res.unplaced).forEach((i) => { have[i.id] = 1; });
    const self = S.near.t === 'dev' && NM.BY[S.near.n] ? NM.BY[S.near.n].id : '', ids = {}, rows = [];
    (sitesDoc || []).forEach((x) => { if (x.id === self || have[x.id] || typeof x.lat !== 'number' || typeof x.lon !== 'number') return; const d = window.KPT_MAP.hav({ lat: NR.lat, lon: NR.lon }, x); if (d <= S.near.r) { ids[x.id] = 1; rows.push({ name: x.name, d, url: x.url, ext: true, tag: x.tagline || '' }); } });
    NM.UP.forEach((p) => { if (!p.pos || p.id === self || have[p.id] || ids[p.id]) return; const d = window.KPT_MAP.hav({ lat: NR.lat, lon: NR.lon }, p); if (d <= S.near.r) rows.push({ name: p.n, d, url: p.up && p.up.ms ? p.up.ms : '../../research/map/#p=' + p.id, ext: !!(p.up && p.up.ms), tag: NM.upStage(p) }); });
    if (!rows.length) return '';
    rows.sort((a, b) => a.d - b.d);
    return `<section class="kd-sec kd-up"><h2 class="kd-ch">Upcoming launches within ${esc(FI.radiusText(S.near.r))}</h2><p class="kd-gn">No prices here yet, so these are possibilities, not budget matches.</p><ul class="kd-ul">${rows.map((x) => `<li><a href="${esc(x.url)}"${x.ext ? ' target="_blank" rel="noopener"' : ''} data-f="go">${esc(x.name)}${x.ext ? ' <span aria-hidden="true">↗</span>' : ''}</a><span>${esc(kmText(x.d) + (x.tag ? ' · ' + x.tag : ''))}</span></li>`).join('')}</ul></section>`;
  }
  const METHOD = ['Your budget is your maximum. A development is listed when its URA sales in the last 12 months, at your minimum size or larger, include prices at or under it, with at least 3 such sales, one of them in the last 6 months.',
    '“Typical prices within your maximum” means the middle half of those sales is at or under it. “Some sales within your maximum” means only part of the range is, and typical prices are higher.',
    'These are past sales, not homes for sale, and not a valuation. New-launch sales don’t show whether units remain; where Huttons inventory was checked recently it is shown separately, with the date.',
    'Distances are in a straight line. Bedrooms are matched only for new launches, from Huttons inventory, and are never worked out from size. Condos, ECs and cluster housing are never mixed.',
    'The optional “up to 5% over” list shows developments whose recent sales start just above your maximum. It is never mixed into the main list.'];
  function resultsHtml(res) {
    const r = res.req, body = res.state === 'ok' ? listHtml(res) : emptyHtml(res);
    return `<div class="kd-lead"><p class="kd-eye">I’m looking to buy</p><h1 class="kd-h1" id="kdH">${esc(headline(res))}</h1>${res.state === 'ok' ? subLine(res) : ''}</div>
      ${chips()}<div class="kd-bar"><div class="kd-barrow"><button type="button" class="kd-btn kd-ghost" data-f="edit" aria-expanded="${S.edit}">Edit search</button>${S.near ? `<div class="kd-radin">${radChips()}</div>` : ''}<div class="kd-vt" role="radiogroup" aria-label="View"><button type="button" role="radio" aria-checked="${S.view === 'list'}" data-f="view" data-v="list">List</button><button type="button" role="radio" aria-checked="${S.view === 'map'}" data-f="view" data-v="map"${S.near ? '' : ' disabled'}>Map</button></div></div></div>
      ${S.near ? `<div class="kd-quick">${radChips()}</div>` : ''}<div class="kd-quick2">${overToggle(res.counts)}</div>
      ${S.view === 'map' && S.near ? '<p class="kd-mhint" id="kdMhint"></p>' : ''}${body}${res.state === 'ok' ? unplacedHtml(res) + upcomingHtml(res) : ''}
      <details class="kd-meth"><summary>How these are matched</summary><div class="inner">${METHOD.map((t) => `<p>${esc(t)}</p>`).join('')}</div></details>`;
  }

  /* ------------------------------------------------------------------ map (the Map's own view; one Leaflet map kept alive across re-renders) */
  function destroyMap() { if (nmView) { try { nmView.destroy(); } catch (e) { /* already gone */ } } nmView = null; nmHost = null; nmLayer = null; nmSig = ''; }
  function syncMap(res) {
    const slot = $('kdMapSlot'), ni = nearInput();
    if (!ni || !res) { destroyMap(); return; }
    if (!slot || !NM || !window.KPT_MAP_VIEW || !window.L) return;
    if (!nmHost) { nmHost = document.createElement('div'); nmHost.className = 'kd-map'; }
    slot.appendChild(nmHost);
    if (!nmView) {
      nmView = window.KPT_MAP_VIEW(window.KPT_MAP, NM); nmView.create(nmHost, { onSelect: mapPick, onPlace: () => {} });
      if (window.matchMedia && matchMedia('(pointer: coarse)').matches) nmView.get().dragging.disable();
    }
    const names = []; res.items.forEach((i) => { const p = NM.BYID[i.id]; if (p && p.pos && names.indexOf(p.n) < 0) names.push(p.n); });
    const selName = S.sel && NM.BYID[S.sel] ? NM.BYID[S.sel].n : null, sig = NR.key + '|' + ni.radius + '|' + names.join(',') + '|' + (selName || '');
    nmView.invalidate && nmView.invalidate();
    if (sig === nmSig) return;
    nmSig = sig;
    const mp = nmView.get(), c = [NR.lat, NR.lon], bnd = L.latLng(c[0], c[1]).toBounds(ni.radius * 2);
    if (!nmLayer) nmLayer = L.layerGroup().addTo(mp);
    nmLayer.clearLayers();
    L.circle(c, { radius: ni.radius, color: '#2E4FD1', weight: 2, opacity: .8, dashArray: '7 5', fillColor: '#2E4FD1', fillOpacity: .07, interactive: false }).addTo(nmLayer);
    L.circleMarker(c, { radius: 7, color: '#fff', weight: 2.5, fillColor: '#14203F', fillOpacity: 1, bubblingMouseEvents: false }).bindTooltip(NR.label, { className: 'gwtip', direction: 'top', offset: [0, -6] }).addTo(nmLayer);
    nmView.update({ key: sig, projects: [], selected: selName, cmp: names.filter((n) => n !== selName), amen: [], areaRings: NR.rings || null, bounds: bnd, fit: true, minZoom: 11, ambient: false, pad: { tl: [18, 18], br: [18, 18] } });
  }
  function mapPick(name) {   // a dot on the map -> its card (phone: shown under the map; desktop: scrolled to in the list)
    const p = NM && NM.BY[name]; if (!p) return;
    S.sel = p.id; renderResults();
    if (window.matchMedia && matchMedia('(min-width: 900px)').matches) { const el = document.querySelector('#kdRes [data-pid="' + p.id + '"]'); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('is-hl'); void el.offsetWidth; el.classList.add('is-hl'); } }
  }

  /* ------------------------------------------------------------------ rendering */
  function reqNow() { return Object.assign({}, S.req, { near: nearInput() }); }
  function compute() {
    if (!S.req.budget || !ix) { lastRes = null; return null; }
    lastRes = D.search(ix, reqNow(), { inv: inventory() });
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
    document.body.dataset.kdView = mapOn ? S.view : 'list';
    if (S.view === 'map' && S.near) { const sel = S.sel && res.items.concat(res.over).find((i) => i.id === S.sel), box = $('kdMsel'); if (box) box.innerHTML = sel ? cardHtml(sel) : '<p class="kd-mhint">Tap a dot to see the development.</p>'; }
    syncMap(res);
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
      root.innerHTML = `<div class="kd-entry"><p class="kd-eye">I’m looking to buy</p><h1 class="kd-h1">What are you looking for?</h1><p class="kd-lede">Tell us your maximum and where. Add requirements if you have them, and change any of it later without starting again.</p><div id="kdForm" class="kd-form"></div><p class="kd-fine">Not sure of your budget? <a href="../hdb-upgrade/">Work out your planning position first ›</a></p></div>`;
      $('kdForm').innerHTML = formHtml(true); bindInputs(); return;
    }
    root.className = 'kd is-results' + (S.edit ? ' is-edit' : '');
    root.innerHTML = `<div class="kd-cols"><div class="kd-main"><div id="kdEdit" class="kd-edit${S.edit ? ' open' : ''}" role="region" aria-label="Edit your search"><div class="kd-edit-h"><b>Edit your search</b><span>Results update as you change things</span><button type="button" class="kd-sheetx" data-f="done" aria-label="Close">✕</button></div><div id="kdForm" class="kd-form"></div><div class="kd-sheetbar"><button type="button" class="kd-btn" data-f="done" id="kdSheetCount"></button></div></div><div id="kdRes"></div></div><aside class="kd-mapcol" id="kdMapCol" hidden><div class="kd-mapbox"><div id="kdMapSlot" class="kd-mapslot"></div><div class="kd-msel" id="kdMsel"></div></div></aside></div>`;
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
    persist();
  }
  function show() {
    if (!applyBudget(true)) { const i = $('kdBudget'); if (i) i.focus(); return; }
    $('root').innerHTML = '<p class="kd-load">Loading…</p>';
    loadData().then(() => { S.mode = 'results'; S.edit = false; S.shown = {}; renderAll(); persist(); const h = $('kdH'); if (h && h.scrollIntoView) window.scrollTo({ top: 0 }); });
  }
  function onClick(e) {
    const t = e.target.closest ? e.target.closest('[data-f]') : null; if (!t || !t.dataset) return; const f = t.dataset.f;
    if (f === 'go') { KPT.track('find_research_click', { project_id: t.dataset.id }); return; }
    if (f === 'show') { show(); return; }
    if (f === 'seg') {
      const k = t.dataset.k; let v = t.dataset.v; if (k === 'beds') v = v ? Number(v) : null;
      S.req[k] = v;
      if (k === 'sale' && v === 'resale') S.req.beds = null;
      if (S.mode === 'results') commit(true); else { renderForm(); bindInputs(); }
      return;
    }
    if (f === 'rad') { const r = Number(t.dataset.r); if (S.near && RADII.indexOf(r) > -1 && r !== S.near.r) { S.near.r = r; commit(true); const b = Array.prototype.slice.call(document.querySelectorAll('#kdRes [data-f=rad][aria-checked=true]')).filter((x) => x.offsetParent)[0]; if (b) b.focus(); } return; }
    if (f === 'pick') { pickPlace(t.dataset.t, t.dataset.n).then(() => { if (S.mode === 'entry') { renderForm(); bindInputs(); } }); return; }
    if (f === 'clearplace') { S.near = null; NR = null; S.pendingWhere = ''; S.sel = null; if (S.view === 'map') S.view = 'list'; if (S.mode === 'results') commit(true); else { renderForm(); bindInputs(); } return; }
    if (f === 'help') { S.helps[t.dataset.k] = !S.helps[t.dataset.k]; t.setAttribute('aria-expanded', String(!!S.helps[t.dataset.k])); const p = document.querySelector('[data-hp="' + t.dataset.k + '"]'); if (p) p.hidden = !S.helps[t.dataset.k]; return; }
    if (f === 'moresum') { S.moreOpen = !t.parentNode.open; return; }
    if (f === 'more') { S.shown[t.dataset.key] = (S.shown[t.dataset.key] || 5) + 20; renderResults(); return; }
    if (f === 'view') { if (t.disabled) return; S.view = t.dataset.v; nmSig = ''; renderResults(); window.scrollTo({ top: 0 }); return; }
    if (f === 'edit') {
      S.edit = !S.edit || !!t.dataset.focus; const el = $('kdEdit'); if (el) el.classList.toggle('open', S.edit); $('root').classList.toggle('is-edit', S.edit); lockPage(S.edit);
      document.querySelectorAll('[data-f=edit][aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', String(S.edit)));
      const fo = { budget: 'kdBudget', place: 'kdPlace', size: 'kdMin' }[t.dataset.focus]; if (S.edit && fo && $(fo)) { if (fo === 'kdMin' && !document.querySelector('[data-more]').open) document.querySelector('[data-more]').open = true; $(fo).focus(); }
      return;
    }
    if (f === 'done') { e.preventDefault(); closeEdit(true); return; }
    if (f === 'reset') { S.req = Object.assign({}, BLANK, { budget: S.req.budget }); S.near = null; NR = null; S.pendingWhere = ''; S.sel = null; S.view = 'list'; commit(true); return; }
    if (f === 'alt') {
      const id = t.dataset.id, r = S.req;
      if (id === 'over') r.over = true; else if (id === 'radius') { const next = RADII.find((x) => x > S.near.r); if (next) S.near.r = next; }
      else if (id === 'size') r.minSize = null; else if (id === 'tenure') r.tenure = 'any'; else if (id === 'beds') r.beds = null; else if (id === 'type') r.type = 'any'; else if (id === 'sale') r.sale = 'either';
      else if (id === 'place') { S.near = null; NR = null; S.view = 'list'; }
      commit(true); return;
    }
    if (f === 'ken') { e.preventDefault(); const k = $('kenBeyond'); if (k) k.click(); return; }
  }

  /* ------------------------------------------------------------------ start */
  function restorePlace(near, where) {
    if (near && NEAR_TYPES.indexOf(near.t) > -1 && RADII.indexOf(Number(near.r)) > -1 && typeof near.n === 'string') {
      return loadNear().then(() => (near.t === 'postal' ? NM.lookupPostal(String(near.n).split('~')[0]) : null)).then(() => { const nr = resolveNear(near); if (nr) { NR = nr; S.near = { t: near.t, n: near.n, r: Number(near.r) }; } else nearErr = 'We couldn’t find that place again, so this covers all of Singapore.'; }).catch(() => { nmLoad = null; nearErr = 'Place search isn’t available just now, so this covers all of Singapore.'; });
    }
    if (where) {   // an answer from the earlier Buy journey: placed only when exactly one place matches; otherwise the buyer chooses from the suggestions
      S.pendingWhere = where;
      return loadNear().then(() => {
        const list = NM.places(where).filter((x) => NEAR_TYPES.indexOf(x.t) > -1 && (x.t !== 'dev' || (NM.BY[x.n] && NM.BY[x.n].pos)));
        if (list.length === 1) { const nr = resolveNear({ t: list[0].t, n: list[0].n, r: 1000 }); if (nr) { NR = nr; S.near = { t: list[0].t, n: list[0].n, r: 1000 }; S.pendingWhere = ''; } }
      }).catch(() => { nmLoad = null; });
    }
    return Promise.resolve();
  }
  function start() {
    handoff = M.readHandoff(window.sessionStorage);
    const init = initial();
    if (init) { S.req = Object.assign({}, BLANK, init.req); if (init.req.budget) S.draftBudget = money(init.req.budget); S.view = 'list'; }
    if (init && S.req.budget && D.clean(S.req).budget) {
      $('root').innerHTML = '<p class="kd-load">Loading…</p>';
      loadData().then(() => restorePlace(init.near, init.where)).then(() => { S.mode = 'results'; renderAll(); if (!init.near && !init.where) persist(); });
    } else { S.mode = 'entry'; renderAll(); loadData(); }
  }
  // Ken: a quiet, generic WhatsApp link (no budget, place or search in it)
  const BEYOND_WA = 'Hi Ken, I was using Groundwork and have a question.';
  const kb = $('kenBeyond'); if (kb) kb.href = KPT.waLink({ message: BEYOND_WA });
  window.__kd = { S, state: () => S, res: () => lastRes, parseBudget };
  start();
})();
