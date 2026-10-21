/* ==========================================================================
   KPT Interactive Map: the page. Presentation only; every number comes from the generated map data through KPT_MAP (kpt-map-core.js).
   Neighbourhood first (what is around the home), then what it sold for by market and size, then what is worth looking at nearby.
   ========================================================================== */
(function () {
  'use strict';
  const K = window.KPT_MAP, { esc, fmt, fmtM, band, ym, dist, distA, icon, MKT, WINL } = K;
  const $ = (s, r = document) => r.querySelector(s);
  const narrow = () => innerWidth <= 760;
  const BUILD = (document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src) || [])[1] || '1';
  const base = new URL('../../data/map/', location.href).href;
  const getJson = (f) => fetch(base + f + '?v=' + BUILD).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
  const S = { proj: null, start: true, place: null, band: null, rc: {}, hl: null, more: false, radius: 2000, q: '', qi: -1, suggOpen: false };
  let M, view;

  /* ---------------- state and address ---------------- */
  function parseHash() {
    const q = new URLSearchParams(location.hash.replace(/^#\/?/, '')); S.place = null; S.start = true;
    const pl = q.get('pl'), id = q.get('p');
    if (pl && pl.includes(':')) { const i = pl.indexOf(':'); S.place = { t: pl.slice(0, i), n: pl.slice(i + 1) }; S.start = false; }
    else if (id && M.BYID[id]) { if (M.BYID[id].n !== S.proj) loadProject(M.BYID[id].n); S.start = false; }
    if (q.get('r') && S.proj) S.radius = +q.get('r');
  }
  function addr() {
    const q = new URLSearchParams();
    if (S.place) q.set('pl', S.place.t + ':' + S.place.n); else if (!S.start && S.proj) { q.set('p', M.BY[S.proj].id); q.set('r', S.radius); }
    return q.toString() ? '#' + q : location.pathname + location.search;
  }
  let lastHash = location.hash;
  function go(push) { const h = addr(); history[push ? 'pushState' : 'replaceState'](null, '', h); lastHash = location.hash; render(); }
  function loadProject(name) { S.proj = name; S.more = false; S.band = null; S.rc = {}; S.hl = null; S.place = null; S.radius = M.BY[name].pos ? M.defaultRadius(name) : 2000; }
  const onNav = () => { if (location.hash === lastHash) return; lastHash = location.hash; parseHash(); render(); };
  addEventListener('popstate', onNav); addEventListener('hashchange', onNav);

  /* ---------------- search ---------------- */
  const SECH = { area: 'Neighbourhoods', mrt: 'MRT stations', dev: 'Developments', school: 'Schools', road: 'Roads' };
  const SCOL = { area: '#14203F', mrt: '#C9372C', dev: '#2E4FD1', school: '#6D4BC4', road: '#1F7A6B' };
  const glyph = (k, sz = 13) => `<span class="gl" style="background:${SCOL[k] || '#6B7280'}">${icon(k, sz)}</span>`;
  const what = () => `development, ${M.hasRoads() ? 'road, ' : ''}MRT station${M.hasSchools() ? ', school' : ''} or neighbourhood`;
  const noMatch = () => `No match. Try a ${what()}.`;
  function suggHtml(list, id) {
    if (!list.length) return `<div class="sugg" role="listbox" id="${id}"><div class="k">${noMatch()}</div></div>`;
    let last = '', i = 0;
    return `<div class="sugg" role="listbox" id="${id}">${list.map((p) => { const head = p.t !== last ? `<div class="k">${SECH[p.t]}</div>` : ''; last = p.t; const k = i++; return head + `<button type="button" role="option" id="${id}-${k}" aria-selected="${k === S.qi}" data-pick="${p.t}|${esc(p.n)}">${glyph(p.t)}<b>${esc(p.label || p.n)}</b><span class="m">${esc(p.sub)}</span></button>`; }).join('')}</div>`;
  }
  function searchBox() {
    const list = S.suggOpen ? M.places(S.q) : [];
    return `<div class="srch"><label class="vh" for="q">Search a ${what()}</label><input id="q" type="search" autocomplete="off" role="combobox" aria-expanded="${S.suggOpen && list.length > 0}" aria-controls="q-list" aria-autocomplete="list" ${S.qi >= 0 && list[S.qi] ? `aria-activedescendant="q-list-${S.qi}"` : ''} placeholder="${M.hasRoads() ? 'Search a place, road or development' : 'Search a place or development'}" value="${esc(S.q)}"><kbd>/</kbd>${S.suggOpen && S.q.trim() ? suggHtml(list, 'q-list') : ''}</div>`;
  }

  /* ---------------- development card ---------------- */
  const SRC = '<button type="button" class="lnk2" data-sources>Data &amp; sources</button>';
  function aroundHtml(name, per) {
    const g = M.around(name, per);
    return `<div class="around"><div class="h2">Around this home</div>${g.map((x) => `<div class="ag"><span class="agi k-${x.k}">${icon(x.k, 13)}</span><div class="agb"><b>${x.label}</b>${x.items.length ? x.items.map((i) => `<button type="button" class="ai" data-am="${esc(i.id)}"><span class="an">${esc(i.n)}${i.k === 'school' || i.k === 'shop' || (i.k === 'food' && !/food cent|hawker cent|market/i.test(i.n)) ? `<em>${esc(i.k === 'food' ? 'Food centre' : i.sub)}</em>` : ''}</span><span class="ad num">${distA(i.d)}</span></button>`).join('') : `<p class="none">${x.none}</p>`}</div></div>`).join('')}<p class="basis" style="margin:8px 0 0">Straight-line distances from the development, not walking time.${M.hasSchools() ? ' Living near a school does not decide admission.' : ''} ${SRC}</p></div>`;
  }
  const recentHtml = (name, mk) => {
    const rows = M.EV[name].rc && M.EV[name].rc[mk] || []; if (!rows.length) return '';
    const open = !!S.rc[mk];
    return `<button type="button" class="lnk" data-rc="${mk}" aria-expanded="${open}">${open ? 'Hide' : 'See'} the ${rows.length} most recent sale${rows.length === 1 ? '' : 's'} ${open ? '⌃' : '⌄'}</button>${open ? `<div class="rcl">${rows.map((r) => `<div class="rr"><span>${ym(r[0])}</span><span>${r[1].toLocaleString('en-SG')} sq ft</span><span class="num">${fmt(r[2])}</span><span class="num">${fmt(r[3])} psf</span></div>`).join('')}<p class="basis" style="margin:6px 0 0">Individual recorded sales, latest first. Not a typical price.</p></div>` : ''}`;
  };
  function marketHtml(name, mk, ref) {
    const m = M.market(name, mk); if (!m) return '';
    const [lab, sub0] = MKT[mk], sub = sub0 + (mk === 'sec' && M.mainlySub(name) ? ' · mainly sub-sales' : '');
    if (m.win === null) return `<div class="mkt"><div class="mh"><div><b>${lab}</b><span>${sub}</span></div></div><p class="basis" style="margin:0">${m.any36 ? `${m.hist} recorded since ${monthStart()}, latest ${ym(m.last)}. No size has enough sales in the last 36 months (5 over 3 months) to show a typical price.` : `None in the last 36 months. ${m.hist} recorded since ${monthStart()}, latest ${ym(m.last)}.`}</p>${recentHtml(name, mk)}</div>`;
    const sel = (c) => ref && ref.mk === mk && ref.bin === c.bin && (ref.win || 0) === m.win;
    return `<div class="mkt"><div class="mh"><div><b>${lab}</b><span>${sub}</span></div><div class="r"><b>${WINL[m.win][0].toUpperCase() + WINL[m.win].slice(1)}</b><span>${m.count} sale${m.count === 1 ? '' : 's'}</span></div></div>${m.rows.map((c) => `<button type="button" class="band${sel(c) ? ' cmp' : ''}" data-band="${mk}:${c.bin}:${m.win}" aria-pressed="${!!sel(c)}"><div><b>${band(c.bin)}</b><span>${c.n} sale${c.n === 1 ? '' : 's'} · typical ${fmtM(c.pmed)}</span></div><div class="px num">${fmt(c.med)}<small>psf</small></div></button>`).join('')}</div>`;
  }
  const monthStart = () => { const s = String(M.latestMonth || '').split('-'); return s.length === 2 ? K.ym(((+s[0]) - 5) * 100 + (+s[1])) : 'the start of the data'; };
  const idOf = (name) => M.BY[name].id;
  function nearbyHtml(name, nb) {
    const [lab] = nb.ref ? MKT[nb.ref.mk] : [''], refTxt = nb.ref ? `${lab} · ${band(nb.ref.bin)}${nb.ref.win ? ' · ' + WINL[nb.ref.win] : ''}` : '';
    if (nb.mode === 'none') { if (!M.EV[name]) return ''; const nx = S.radius < 2000 ? 2000 : S.radius < 3000 ? 3000 : 5000; return `<div class="sec"><div class="sh"><b>Nearby prices</b>${refTxt ? `<span>${refTxt}</span>` : ''}</div><p class="basis" style="margin:0">No nearby ${M.BY[name].cls === 'condo' ? 'development' : M.CLS[M.BY[name].cls].short + ' development'} has enough recorded sales ${nb.ref ? 'in this size ' : ''}to show prices.</p>${S.radius < 5000 ? `<button type="button" class="lnk" data-radius="${nx}">Look within ${nx / 1000} km ›</button>` : ''}</div>`; }
    const cmp = nb.mode === 'compare';
    const row = (r) => { const inner = `<b>${esc(r.p.n)}</b><span class="m">${dist(r.p.d)} · ${esc(r.e.tenure)} · ${r.theirs.n} sale${r.theirs.n === 1 ? '' : 's'}</span><span class="px num">${fmt(r.theirs.med)}<small>psf</small></span><i aria-hidden="true">›</i>`; return cmp ? `<a class="nb" href="../#/compare/${esc(idOf(name))}/${esc(r.p.id)}">${inner}</a>` : `<button type="button" class="nb" data-dot="${esc(r.p.n)}">${inner}</button>`; };
    return `<div class="sec"><div class="sh"><b>${cmp ? 'Compare with nearby' : 'Nearby prices'}</b><span>${refTxt}</span></div>${nb.list.map(row).join('')}<p class="basis" style="margin:6px 0 0">${cmp ? 'Same market and size, then tenure, lease age and distance. Each side has 2+ sales in 2 months.' : `Surrounding market for context, not a price for ${esc(name)}.`}${M.BY[name].cls === 'condo' ? '' : ` ${esc(M.CLS[M.BY[name].cls].plural.replace(/^./, (c) => c.toUpperCase()))} are only compared with other ${esc(M.CLS[M.BY[name].cls].plural)}.`}</p></div>`;
  }
  // A development that is not a condominium, or whose name also carries another property type: said once, in the prices section.
  function classNote(name) {
    const p = M.BY[name], e = M.EV[name], bits = [];
    if (p.cls === 'ec') bits.push('This is an executive condominium (EC). EC prices are not comparable with private condominium prices, so only other ECs are used for nearby comparisons.');
    else if (p.cls === 'cluster') bits.push('This is a strata landed (cluster housing) development. Its prices are not comparable with condominium prices, so only other cluster-housing developments are used for nearby comparisons.');
    if (e && e.also) { const t = Object.keys(e.also).filter((k) => M.CLS[k]).map((k) => e.also[k] + ' ' + (k === 'condo' ? 'condominium' : M.CLS[k].short) + ' sale' + (e.also[k] === 1 ? '' : 's')); if (t.length) bits.push('The same name also appears in URA records with ' + t.join(' and ') + ' of another property type. They are counted separately and are not in these prices.'); }
    return bits.length ? `<p class="basis" style="margin:8px 0 0">${esc(bits.join(' '))}</p>` : '';
  }
  const areaLine = (name) => { const a = M.AREAOF[name]; return a ? ` · ${esc(a)}` : ''; };
  const closeBtn = '<button type="button" class="close" data-dpclose aria-label="Close">×</button>';
  function devCard(name, mobile) {
    const p = M.BY[name], e = M.EV[name], pos = p.pos;
    const head = `<div class="dp-top"><div style="min-width:0"><h2>${esc(name)}</h2><p class="meta">${M.CLS[p.cls].short ? esc(M.CLS[p.cls].label) + ' · ' : ''}${e ? esc(e.street) + areaLine(name) + ' · ' : ''}District ${Number(p.district)}${e ? ' · ' + esc(e.tenure) : ''}</p></div>${closeBtn}</div>`;
    if (!e) { const body = `<p class="basis">Loading prices…</p>`; return mobile ? `<aside class="bs" aria-label="Selected development"><button type="button" class="grab" data-dpmore aria-label="Expand"></button>${head}${body}</aside>` : `<aside class="dp" aria-label="Selected development"><div class="dp-in">${head}${body}</div></aside>`; }
    const nb = M.nearbyFor(name);
    const prices = `<div class="sec pr"><div class="sh"><b>Prices by size</b><span>Past sales, not a valuation</span></div><div class="mkts">${marketHtml(name, 'sec', nb.ref)}${marketHtml(name, 'new', nb.ref)}<p class="basis" style="margin:2px 0 0">Median price per sq ft by size. Sizes with fewer than 5 sales are not shown.${pos ? ' Select a size to compare nearby.' : ''}</p>${classNote(name)}</div></div>`;
    const nopos = `<p class="basis nopos">Not on the map yet: URA's data has no location for this development, so neighbourhood and nearby prices are not shown.</p>`;
    const open = `<a class="btn b" href="../#/p/${esc(p.id)}">Open Research page ›</a>`;
    const body = pos ? aroundHtml(name, mobile ? (S.more ? 2 : 1) : 2) : nopos;
    if (!mobile) return `<aside class="dp" aria-label="Selected development"><div class="dp-in">${head}${body}${prices}${pos ? nearbyHtml(name, nb) : ''}</div><div class="dp-foot">${open}</div></aside>`;
    const tog = `<button type="button" class="btn g" data-dpmore aria-expanded="${!!S.more}">Prices &amp; nearby ${S.more ? '⌄' : '⌃'}</button>`;
    return `<aside class="bs${S.more ? ' open' : ''}" aria-label="Selected development"><button type="button" class="grab" data-dpmore aria-label="${S.more ? 'Collapse' : 'Expand'}"></button>${head}${body}${S.more ? prices + (pos ? nearbyHtml(name, nb) : '') : ''}<div class="bs-act">${open}${tog}</div></aside>`;
  }

  /* ---------------- place cards: a neighbourhood, an MRT station or a school ---------------- */
  const devRow = (x, withDist = true) => `<button type="button" class="nb" data-pick="dev|${esc(x.p.n)}"><b>${esc(x.p.n)}</b><span class="m">${x.p.cls !== 'condo' ? esc(M.CLS[x.p.cls].short) + ' · ' : ''}${withDist ? distA(x.d) + ' · ' : ''}${esc(x.e.tenure)} · ${x.p.t12 ? x.p.t12 + ' sale' + (x.p.t12 === 1 ? '' : 's') + ' in 12 months' : 'no sales in 12 months'}</span><i aria-hidden="true">›</i></button>`;
  // A road: where to read what landed homes sold for around it (the map itself shows condo prices, never landed sales)
  const roadLanded = (d) => `<a class="nb" href="../../journey/worth/#landed:${encodeURIComponent(d.title)}" data-gw-go="landed" style="margin-top:12px"><b>What landed homes sold for near ${esc(d.title)}</b><span class="m">Sales by street from URA records. Landed sales are not shown on this map.</span><i aria-hidden="true">›</i></a>`;
  function placeCard(pl, mobile) {
    const d = M.placeData(pl); if (!d) return startCard(mobile);
    const head = `<div class="dp-top"><div style="min-width:0"><h2>${esc(d.title)}</h2><p class="meta">${esc(d.meta)}</p></div>${closeBtn}</div>`;
    let body = '';
    if (d.t === 'area') {
      const row = (k, label, txt) => `<div class="ag"><span class="agi k-${k}">${icon(k, 13)}</span><div class="agb"><b>${label}</b><p class="ai2">${txt}</p></div></div>`;
      const nm = (arr, n) => arr.slice(0, n).map((x) => esc(x.n)).join(', ') + (arr.length > n ? ` and ${arr.length - n} more` : '');
      const cnt = (f) => d.sch.filter(f).length, np = cnt(M.isPri), ns = cnt(M.isSec);
      body = `<div class="around"><div class="h2">In this neighbourhood</div>${row('mrt', 'Transport', d.stn.length ? nm(d.stn, 4) : 'No MRT or LRT station inside the boundary')}${M.hasSchools() ? row('school', 'Schools', d.sch.length ? `${np} primary · ${ns} secondary${d.sch.length - np - ns ? ` · ${d.sch.length - np - ns} other` : ''}` : 'None listed') : ''}${row('park', 'Parks', d.pk.length ? nm(d.pk, 2) : 'No park of 0.8 ha or more listed')}</div>`;
      const n = mobile && !S.more ? 0 : 6;
      body += `<div class="sec"><div class="sh"><b>Developments</b><span>${d.devs.length} with recorded sales</span></div>${n ? d.devs.slice(0, n).map((p) => devRow({ p, e: M.EV[p.n] }, false)).join('') + `<p class="basis" style="margin:6px 0 0">Most active in the last 12 months first. Select one to see prices by size.</p>` : ''}</div>`;
    } else {
      body = `<div class="sec" style="margin-top:14px;padding-top:0;border:0"><div class="sh"><b>Developments within ${d.r / 1000} km</b><span>${d.list.length} with recorded sales</span></div>${d.list.length ? d.list.slice(0, mobile && !S.more ? 3 : 6).map((x) => devRow(x)).join('') : '<p class="basis" style="margin:0">None found.</p>'}<p class="basis" style="margin:8px 0 0">${d.t === 'mrt' ? 'Straight-line distance from the nearest exit, not walking time.' : d.t === 'road' ? 'Straight-line distance from the middle of the road, not walking time. The road’s position is approximate, and no house is placed on it.' : 'Straight-line distance, not walking time. Living near a school does not decide admission; check the MOE registration rules.'}</p></div>${d.t === 'road' ? roadLanded(d) : ''}`;
    }
    if (!mobile) return `<aside class="dp" aria-label="${esc(d.title)}"><div class="dp-in">${head}${body}</div></aside>`;
    const more = (d.t === 'area' ? d.devs.length : d.list.length) > 3 ? `<div class="bs-act"><button type="button" class="btn g" data-dpmore aria-expanded="${!!S.more}">${d.t === 'area' ? 'Developments' : 'More developments'} ${S.more ? '⌄' : '⌃'}</button></div>` : '';
    return `<aside class="bs${S.more ? ' open' : ''}" aria-label="${esc(d.title)}"><button type="button" class="grab" data-dpmore aria-label="${S.more ? 'Collapse' : 'Expand'}"></button>${head}${body}${more}</aside>`;
  }
  function startCard(mobile) {
    const inner = `<h2>Explore homes and neighbourhoods</h2><p class="meta" style="margin-top:6px">Search a neighbourhood, ${M.hasRoads() ? 'road, ' : ''}MRT station${M.hasSchools() ? ', school' : ''} or development, or select a dot. Zoom in to see stations${M.hasSchools() ? ' and schools' : ''}.</p><p class="basis" style="margin:10px 0 0">${SRC}</p>`;
    return mobile ? `<aside class="bs" aria-label="Start">${inner}</aside>` : `<aside class="dp dp-start" aria-label="Start"><div class="dp-in">${inner}</div></aside>`;
  }

  /* ---------------- page ---------------- */
  const mode = () => S.place ? 'place' : (S.start || !S.proj) ? 'start' : 'dev';
  function stage() {
    const m = narrow(), md = mode(), shown = md === 'dev' ? S.proj : null, sp = shown && M.BY[shown].pos ? shown : null;
    const legend = `<div class="mapkey" aria-label="Map key"><span><i class="a"></i>Development</span>${sp || md === 'place' ? '<span><i class="s"></i>Selected</span>' : ''}<span><i class="m"></i>MRT</span>${M.hasSchools() ? '<span><i class="sc"></i>School</span>' : ''}${sp && M.EV[sp] ? '<span><i class="t"></i>Nearby comparison</span>' : ''}</div>`;
    const zoom = `<div class="zoomc zc"><button type="button" data-zoom="1" aria-label="Zoom in">+</button><button type="button" data-zoom="-1" aria-label="Zoom out">−</button></div>`;
    const card = md === 'start' ? startCard(m) : md === 'place' ? placeCard(S.place, m) : devCard(shown, m);
    return `<div class="mapstage${m && S.more ? ' more' : ''}"><div id="map" class="map" aria-label="Map of Singapore"></div><div class="mapsearch">${searchBox()}</div>${m ? '' : zoom + legend}${card}</div>`;
  }
  function render() {
    const app = $('#app'); const focusId = document.activeElement && document.activeElement.id; const selStart = document.activeElement && document.activeElement.selectionStart;
    view.destroy(); app.innerHTML = stage();
    document.title = (S.place ? S.place.n + ' · ' : mode() === 'dev' ? S.proj + ' · ' : '') + 'Map · Groundwork';
    const mapEl = $('#map'); if (mapEl) mountMap(mapEl);
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (selStart != null && el.setSelectionRange) try { el.setSelectionRange(selStart, selStart); } catch (e) { /* not a text field */ } } }
  }
  /* the card changes (a size is selected, recent sales are opened) without rebuilding the map: only the markers are refreshed */
  function refreshCard() {
    const card = $('.dp,.bs'); if (!card) return render(); const sc = card.querySelector('.dp-in'), top = sc ? sc.scrollTop : card.scrollTop, m = narrow();
    card.outerHTML = S.place ? placeCard(S.place, m) : devCard(S.proj, m);
    const n = $('.dp,.bs'), s2 = n.querySelector('.dp-in'); if (s2) s2.scrollTop = top; else n.scrollTop = top;
    view.update(mapProps(false));
  }
  const sheetH = () => (($('.bs') || {}).offsetHeight || 300) + 16;
  const DEVPAD = (m) => m ? { tl: [28, S.more ? 16 : 84], br: [28, sheetH()] } : { tl: [48, 84], br: [420, 70] };
  function mapProps(fit) {
    const md = mode(), m = narrow(), pad = DEVPAD(m);
    if (md === 'start' || (md === 'dev' && !M.BY[S.proj].pos)) return { keep: md === 'dev', key: 'start|' + (m ? 'm' : 'd'), projects: M.PM, selected: null, cmp: [], amen: [], world: true, fit, minZoom: 11, pad: m ? { tl: [20, 84], br: [20, (($('.bs') || {}).offsetHeight || 150) + 16] } : { tl: [20, 76], br: [360, 60] } };
    if (md === 'place') {
      const d = M.placeData(S.place); if (!d) return { keep: false, key: 'start|' + (m ? 'm' : 'd'), projects: M.PM, selected: null, cmp: [], amen: [], world: true, fit, minZoom: 11, pad: m ? { tl: [20, 84], br: [20, (($('.bs') || {}).offsetHeight || 150) + 16] } : { tl: [20, 76], br: [360, 60] } };   // a place not found (an old link, or the road files still loading): the whole island, never an error
      if (d.t === 'area') return { key: 'a|' + S.place.n + '|' + (m ? 'm' + (S.more ? 'x' : '') : 'd'), projects: M.PM, selected: null, cmp: [], amen: [], bounds: d.bounds, areaRings: d.a.rings, place: { lat: null, chipAt: d.centre, label: d.title, sub: 'Neighbourhood' }, fit, minZoom: 11, pad };
      const list = d.list.slice(0, m && !S.more ? 3 : 6), cmp = list.map((x) => x.p.n);
      return { key: 'p|' + S.place.t + S.place.n + '|' + (m ? 'm' + (S.more ? 'x' : '') : 'd'), projects: M.PM, selected: null, cmp, amen: [], place: { lat: d.lat, lon: d.lon, label: d.title, sub: d.t === 'mrt' ? 'MRT station' : d.s.lab }, fitPts: [[d.lat, d.lon], ...cmp.map((n) => [M.BY[n].lat, M.BY[n].lon])], zoom: 15, minZoom: 14, fit, pad };
    }
    return mapProps0(fit);
  }
  function mapProps0(fit) {
    const m = narrow(), shown = S.proj, pad = DEVPAD(m);
    const nb = M.EV[shown] ? M.nearbyFor(shown) : { list: [] }, cmp = nb.list.map((r) => r.p.n);
    const gr = M.around(shown, m && !S.more ? 1 : 2), amen = []; gr.forEach((g) => g.items.forEach((i) => amen.push({ id: i.id, k: i.k, n: i.n, lat: i.lat, lon: i.lon, d: i.d })));
    const near = amen.filter((a) => (a.k === 'mrt' || a.k === 'school') && a.d <= 1200).slice(0, 2).map((a) => [a.lat, a.lon]);
    const pts = [shown, ...cmp].map((n) => [M.BY[n].lat, M.BY[n].lon]).concat(near);
    return { key: 'f|' + shown + '|' + S.radius + '|' + (m ? 'm' + (S.more ? 'x' : '') : 'd'), projects: M.PM, selected: shown, cmp, amen, hl: S.hl, fitPts: pts, zoom: 15, minZoom: 14, fit: !!fit, pad };
  }
  function mountMap(el) {
    const sh = $('.bs'); if (sh) $('.mapstage').style.setProperty('--shh', sh.offsetHeight + 'px');
    view.create(el, { onSelect: dotPick, onPlace: placePick });
    const pr = mapProps(true); pr.fit = true; view.update(pr);
  }
  function dotPick(n) { loadProject(n); S.start = false; go(true); }
  function placePick(t, n) { S.start = false; S.more = false; S.hl = null; S.place = { t, n }; go(true); }
  function pickItem(v) { const i = v.indexOf('|'), t = v.slice(0, i), n = v.slice(i + 1); S.suggOpen = false; S.q = ''; S.qi = -1; if (t === 'dev') dotPick(n); else placePick(t, n); }

  /* ---------------- licence notices: generated from what is actually loaded ---------------- */
  function notices() {
    const el = $('#mapSources'); if (!el) return;
    const line = (s) => `${esc(s.name)} (${esc(s.by)}, accessed ${esc(s.accessed)})`;
    const geo = M.AM.sources.filter((s) => s.k === 'geocode'), list = M.AM.sources.filter((s) => s.k !== 'geocode').map(line).join('; ');
    const lic = '<a href="https://data.gov.sg/open-data-licence" target="_blank" rel="noopener noreferrer">Singapore Open Data Licence version 1.0</a>';
    el.innerHTML = `Project locations and prices: URA private residential transaction data (PMI_Resi_Transaction), to ${esc(ym(+String(M.latestMonth).replace('-', '')))}. Developments are private condominiums, executive condominiums (ECs) and strata cluster housing, each compared only with its own type. Neighbourhood data: contains information from ${list}, from <a href="https://data.gov.sg" target="_blank" rel="noopener noreferrer">data.gov.sg</a>, made available under the terms of the ${lic}.` +
      (geo.length ? ` School and supermarket positions: contains information from ${line(geo[0])} from <a href="https://www.onemap.gov.sg" target="_blank" rel="noopener noreferrer">onemap.gov.sg</a>, made available under the terms of the ${lic}.` : '') +
      (M.hasRoads() ? ' Road positions: OneMap, Singapore Land Authority, made available under the terms of the ' + lic + '; one approximate point for each road, never a house.' : '') +
      ` Basemap: OneMap, © contributors | Singapore Land Authority. Distances are straight-line. Not endorsed by any of these agencies.`;
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    if (!M) return;
    const t = e.target.closest('[data-dpclose],[data-dpmore],[data-dot],[data-radius],[data-pick],[data-zoom],[data-band],[data-rc],[data-am],[data-sources]');
    if (!t) { if (!e.target.closest('.srch') && S.suggOpen) { S.suggOpen = false; render(); } return; }
    const d = t.dataset;
    if (t.hasAttribute('data-sources')) { const s = document.getElementById('sources'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (t.hasAttribute('data-dpclose')) { S.start = true; S.more = false; S.place = null; go(true); return; }
    if (t.hasAttribute('data-dpmore')) { S.more = !S.more; go(false); return; }
    if (d.dot) { dotPick(d.dot); return; }
    if (d.radius) { S.radius = +d.radius; go(false); return; }
    if (d.band) { S.band = S.band === d.band ? null : d.band; refreshCard(); return; }
    if (d.rc) { S.rc[d.rc] = !S.rc[d.rc]; refreshCard(); return; }
    if (d.am) { S.hl = S.hl === d.am ? null : d.am; view.hl(S.hl, true, narrow() ? { tl: [28, 84], br: [28, sheetH()] } : { tl: [48, 84], br: [420, 70] }); return; }
    if (d.pick) { pickItem(d.pick); return; }
    if (d.zoom) { if (+d.zoom > 0) view.zoom(1); else view.zoomOut(1); return; }
  });
  document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-am]'); if (t && !narrow() && view) view.hl(t.dataset.am, false); });
  document.addEventListener('mouseout', (e) => { const t = e.target.closest && e.target.closest('[data-am]'); if (t && !narrow() && view) view.hl(S.hl, false); });
  document.addEventListener('keydown', (e) => {
    if (!M) return;
    if (e.key === 'Escape') { if (S.suggOpen) { S.suggOpen = false; render(); } return; }
    if (e.key === '/' && !e.target.matches('input,textarea')) { const i = $('#q'); if (i) { e.preventDefault(); i.focus(); } return; }
    if (e.target.matches('#q')) {
      const list = M.places(S.q);
      if (e.key === 'ArrowDown') { e.preventDefault(); S.qi = Math.min(list.length - 1, S.qi + 1); S.suggOpen = true; render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); S.qi = Math.max(-1, S.qi - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = list[S.qi >= 0 ? S.qi : 0]; if (it) pickItem(it.t + '|' + it.n); }
    }
  });
  document.addEventListener('input', (e) => {
    if (M && e.target.matches('#q')) { S.q = e.target.value; S.qi = -1; S.suggOpen = true; const box = e.target.closest('.srch'), old = box.querySelector('.sugg'); if (old) old.remove(); if (S.q.trim()) box.insertAdjacentHTML('beforeend', suggHtml(M.places(S.q), 'q-list')); }
  });
  document.addEventListener('focusin', (e) => { if (M && e.target.matches('#q') && S.q.trim()) { S.suggOpen = true; const box = e.target.closest('.srch'); if (!box.querySelector('.sugg')) box.insertAdjacentHTML('beforeend', suggHtml(M.places(S.q), 'q-list')); } });
  let rsT, wasNarrow = null; addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (!view || !M) return; const n = narrow(); if (wasNarrow !== null && n !== wasNarrow) { wasNarrow = n; render(); return; } wasNarrow = n; view.invalidate(); view.update(mapProps(false)); }, 150); });   /* a sheet that changes height keeps the selected dot in the usable area */

  /* ---------------- boot ---------------- */
  const app = $('#app');
  const fail = (msg) => { app.innerHTML = `<div class="kpm-state"><h1>The map could not load</h1><p>${esc(msg)} Please refresh the page. If it keeps happening, the Research pages still work: <a href="../">open Research</a>.</p></div>`; };
  Promise.all([getJson('places.json'), getJson('amen.json')]).then(([pl, am]) => {
    M = K.create(pl, am, S); view = window.KPT_MAP_VIEW(K, M); parseHash(); notices(); render();
    window.KPT_MAP_APP = { S, M, view, render, go };
    // Prices load after the first paint; schools and supermarkets only if that file has been cleared for publication (no file, no layer).
    getJson('ev.json').then((ev) => { M.setEvidence(ev); render(); window.KPT_MAP_APP.evReady = true; }).catch(() => fail('Prices could not be loaded.'));
    if (am.extra) getJson(am.extra).then((ex) => { M.setExtra(ex); notices(); render(); }).catch(() => {});
    // Roads (the street positions Property values & prices uses). Without them the search simply has no Roads group.
    const landed = new URL('../../data/value/landed/', location.href).href, getRoad = (f) => fetch(landed + f + '?v=' + BUILD).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([getRoad('geo.json'), getRoad('geo-more.json')]).then(([g, mo]) => { if (!g && !mo) return; M.setRoads(g, mo); notices(); render(); window.KPT_MAP_APP.roadsReady = true; });
  }).catch(() => fail('The map data could not be loaded.'));
})();
