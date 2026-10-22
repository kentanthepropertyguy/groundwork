/* ==========================================================================
   KPT Interactive Map: the page. Presentation only; every number comes from the generated map data through KPT_MAP (kpt-map-core.js).
   Neighbourhood first (what is around the home), then what it sold for by market and size, then what is worth looking at nearby.
   ========================================================================== */
(function () {
  'use strict';
  const K = window.KPT_MAP, { esc, fmt, fmtM, band, ym, dist, distA, icon, MKT, WINL, help } = K;
  const $ = (s, r = document) => r.querySelector(s);
  const narrow = () => innerWidth <= 760;
  const BUILD = (document.currentScript && /[?&]v=([^&]+)/.exec(document.currentScript.src) || [])[1] || '1';
  const base = new URL('../../data/map/', location.href).href;
  const getJson = (f) => fetch(base + f + '?v=' + BUILD).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
  const LY = window.KPT_MAP_VIEW.layers;
  const S = { proj: null, start: true, place: null, band: null, rc: {}, hl: null, more: false, min: false, am: false, sec: {}, layers: LY.load(), lyrOpen: false, radius: 2000, pr: 1000, nall: false, q: '', qi: -1, suggOpen: false };
  const PCR = {};   // postal code -> the last OneMap answer
  let M, view;

  /* ---------------- state and address ---------------- */
  function parseHash() {
    const q = new URLSearchParams(location.hash.replace(/^#\/?/, '')); S.place = null; S.start = true;
    const pl = q.get('pl'), id = q.get('p');
    if (pl && pl.includes(':')) { const i = pl.indexOf(':'); S.place = { t: pl.slice(0, i), n: pl.slice(i + 1) }; S.start = false; }
    else if (id && M.BYID[id]) { if (M.BYID[id].n !== S.proj) loadProject(M.BYID[id].n); S.start = false; }
    if (q.get('r') && S.proj) S.radius = +q.get('r');
    const nr = +(S.place ? q.get('r') : q.get('nr'));   // the nearby radius; on a development, r is the price-comparison radius
    S.pr = M.RADII.includes(nr) ? nr : 1000; S.nall = false; S.min = false;
  }
  function addr() {
    const q = new URLSearchParams();
    if (S.place) { q.set('pl', S.place.t + ':' + S.place.n); if (S.place.t !== 'area' && S.pr !== 1000) q.set('r', S.pr); } else if (!S.start && S.proj) { q.set('p', M.BY[S.proj].id); if (!M.BY[S.proj].up) q.set('r', S.radius); if (S.pr !== 1000 && M.BY[S.proj].pos) q.set('nr', S.pr); }
    return q.toString() ? '#' + q : location.pathname + location.search;
  }
  let lastHash = location.hash;
  function go(push) { const h = addr(); history[push ? 'pushState' : 'replaceState'](null, '', h); lastHash = location.hash; render(); }
  function loadProject(name) { S.proj = name; S.sec = {}; S.more = false; S.min = false; S.band = null; S.rc = {}; S.hl = null; S.am = false; S.place = null; S.pr = 1000; S.nall = false; S.radius = M.BY[name].pos ? M.defaultRadius(name) : 2000; }
  const onNav = () => { if (location.hash === lastHash) return; lastHash = location.hash; parseHash(); render(); };
  addEventListener('popstate', onNav); addEventListener('hashchange', onNav);

  /* ---------------- search ---------------- */
  const SECH = { area: 'Neighbourhoods', mrt: 'MRT stations', dev: 'Developments', up: 'New launches and sites', school: 'Schools', road: 'Roads', postal: 'Postal code' };
  const SCOL = { area: '#14203F', mrt: '#C9372C', dev: '#2E4FD1', up: '#2E4FD1', school: '#6D4BC4', road: '#1F7A6B', postal: '#0E8C89' };
  const glyph = (k, sz = 13) => `<span class="gl" style="background:${SCOL[k] || '#6B7280'}">${icon({ up: 'dev', postal: 'area' }[k] || k, sz)}</span>`;
  const what = () => `development, ${M.hasRoads() ? 'road, ' : ''}MRT station${M.hasSchools() ? ', school' : ''}, neighbourhood or postal code`;
  const noMatch = () => `No match. Try a ${what()}.`;
  const PCMSG = new Proxy({}, { get: (_, st) => (c) => M.postalMsg(st, c) });
  /* what the search box offers for what is typed: names from the map's own data, or (for a six-digit number) the address OneMap finds for that postal code */
  function suggestions() {
    const code = M.postalCode(S.q); if (!code) return { list: M.places(S.q), msg: '' };
    const r = PCR[code];
    if (!r) { PCR[code] = { state: 'loading', list: [] }; M.lookupPostal(code).then((x) => { PCR[code] = x; if (M.postalCode(S.q) === code && S.suggOpen) refreshSugg(); }); return { list: [], msg: PCMSG.loading(code) }; }
    if (r.state === 'ok') return { list: r.list.map((o) => ({ t: 'postal', n: o.n, label: o.title, sub: o.sub })), msg: '' };
    return { list: [], msg: (PCMSG[r.state] || PCMSG.error)(code) };
  }
  function refreshSugg() { const box = $('.srch'); if (!box) return; const old = box.querySelector('.sugg'); if (old) old.remove(); if (S.q.trim()) { const x = suggestions(); box.insertAdjacentHTML('beforeend', suggHtml(x.list, 'q-list', x.msg)); } }
  function suggHtml(list, id, msg) {
    if (!list.length) return `<div class="sugg" role="listbox" id="${id}"><div class="k pcm"${msg ? ' role="status"' : ''}>${msg ? esc(msg) : noMatch()}</div></div>`;
    let last = '', i = 0;
    return `<div class="sugg" role="listbox" id="${id}">${list.map((p) => { const g = p.g || p.t, head = g !== last ? `<div class="k">${SECH[g]}</div>` : ''; last = g; const k = i++; return head + `<button type="button" role="option" id="${id}-${k}" aria-selected="${k === S.qi}" data-pick="${p.t}|${esc(p.n)}">${glyph(g)}<b>${esc(p.label || p.n)}</b><span class="m">${esc(p.sub)}</span></button>`; }).join('')}</div>`;
  }
  function searchBox() {
    const sg = S.suggOpen && S.q.trim() ? suggestions() : { list: [], msg: '' }, list = sg.list;
    return `<div class="srch"><label class="vh" for="q">Search a ${what()}</label><input id="q" type="search" autocomplete="off" role="combobox" aria-expanded="${S.suggOpen && list.length > 0}" aria-controls="q-list" aria-autocomplete="list" ${S.qi >= 0 && list[S.qi] ? `aria-activedescendant="q-list-${S.qi}"` : ''} placeholder="${M.hasRoads() ? 'Place, postal code or development' : 'Place or development'}" value="${esc(S.q)}"><kbd>/</kbd>${S.suggOpen && S.q.trim() ? suggHtml(list, 'q-list', sg.msg) : ''}</div>`;
  }

  /* ---------------- development card ---------------- */
  const SRC = '<button type="button" class="lnk2" data-sources>Data &amp; sources</button>';
  /* The summary shows the two amenities that matter most for this home: the nearest MRT or LRT station, then the nearest primary school (within 2 km), else the nearest shop or park (within 1 km). Everything else is in the amenities section. */
  function keyAmen(name) {
    const by = {}; M.around(name, 1).forEach((g) => { by[g.id] = g.items[0] || null; });
    const out = []; if (by.tr) out.push(by.tr); if (by.sc && by.sc.d <= 2000) out.push(by.sc);
    if (out.length < 2 && by.sh && by.sh.d <= 1000) out.push(by.sh); if (out.length < 2 && by.pk && by.pk.d <= 1000) out.push(by.pk);
    return out.slice(0, 2);
  }
  const amSub = (i) => (i.k === 'school' || i.k === 'shop' || (i.k === 'food' && !/food cent|hawker cent|market/i.test(i.n)) ? `<em>${esc(i.k === 'food' ? 'Food centre' : i.sub)}</em>` : '');
  const amRow = (i) => `<button type="button" class="ai" data-am="${esc(i.id)}"><span class="an">${esc(i.n)}${amSub(i)}</span><span class="ad num">${distA(i.d)}</span></button>`;
  const keyHtml = (name) => { const k = keyAmen(name); return k.length ? `<div class="around key">${k.map((i) => `<div class="ag"><span class="agi k-${i.k}">${icon(i.k, 13)}</span><div class="agb">${amRow(i)}</div></div>`).join('')}</div>` : ''; };
  function amenBody(name, what) {
    const g = M.around(name, 2);
    return g.map((x) => `<div class="ag"><span class="agi k-${x.k}">${icon(x.k, 13)}</span><div class="agb"><b>${x.label}</b>${x.items.length ? x.items.map(amRow).join('') : `<p class="none">${x.none}</p>`}</div></div>`).join('') + `<p class="basis">Straight-line distances from the ${what || 'development'}, not walking time.${M.hasSchools() ? ' Living near a school does not decide admission.' : ''}</p>`;
  }
  /* A section that opens on demand. Which are open is remembered while the same development stays selected. */
  const amTitle = () => (M.hasSchools() ? 'Transport, schools and amenities' : 'Transport and amenities');
  const sx = (id, title, body) => `<details class="sx" data-sx="${id}"${S.sec[id] ? ' open' : ''}><summary><span>${title}</span></summary><div class="sxb">${body}</div></details>`;
  const PRICE_TIP = 'Median price per sq ft for the size with the most recent sales. Sizes with fewer than 5 sales are not shown. These are past recorded sales from URA, not asking prices or a valuation. Primary (new sale) and secondary (resale and sub-sale) prices are never combined.';
  /* The first fact: the most meaningful recent price, with its market, size, sample and period. Too few sales in any size means no price, only what exists. */
  function leadHtml(name) {
    const l = M.lead(name), tip = help(PRICE_TIP, 'About this price');
    if (l) {
      const c = l.row, sub = l.mk === 'sec' && M.mainlySub(name) ? ' · mainly sub-sales' : '';
      return `<div class="lead"><div class="ld-k">Recent prices${tip}</div><div class="ld-p"><b class="num">${fmt(c.med)}</b><small>psf</small></div><p class="ld-s">${MKT[l.mk][0]}${sub} · ${band(c.bin)} · ${c.n} sale${c.n === 1 ? '' : 's'}, ${WINL[l.mm.win]} · typical ${fmtM(c.pmed)}</p><p class="basis">Past sales, not a valuation.</p></div>`;
    }
    const m = ['sec', 'new'].map((mk) => M.market(name, mk)).filter(Boolean).sort((a, b) => b.hist - a.hist)[0];
    if (!m) return `<div class="lead"><div class="ld-k">Recent prices</div><p class="ld-s">No recorded sales to show.</p></div>`;
    return `<div class="lead"><div class="ld-k">Recent prices${tip}</div><p class="ld-s">Not enough recent sales in any one size to show a typical price. ${m.hist} recorded since ${monthStart()}, latest ${ym(m.last)}.</p></div>`;
  }
  const methBody = () => `<ul class="meth"><li>Prices are past recorded sales from URA, not asking prices or a valuation. A median price per sq ft is shown only for sizes with enough sales; sizes with fewer than 5 sales are not shown.</li><li>Primary (new sale) and secondary (resale and sub-sale) sales are kept apart.</li><li>Nearby homes are chosen in the same market and size, then by tenure, lease age and distance. Each side has 2+ sales in 2 months. ECs and cluster housing are compared only with their own type.</li><li>Distances are in a straight line, not walking time.</li></ul><p class="basis">${SRC}</p>`;
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
    return `<div class="mkt"><div class="mh"><div><b>${lab}</b><span>${sub}</span></div><div class="r"><b>${WINL[m.win][0].toUpperCase() + WINL[m.win].slice(1)}</b><span>${m.count} sale${m.count === 1 ? '' : 's'}</span></div></div>${m.rows.map((c) => `<button type="button" class="band${sel(c) ? ' cmp' : ''}" data-band="${mk}:${c.bin}:${m.win}" aria-pressed="${!!sel(c)}"><div><b>${band(c.bin)}<em class="cnt">${c.n} sale${c.n === 1 ? '' : 's'}</em></b><span>typical ${fmtM(c.pmed)}</span></div><div class="px num">${fmt(c.med)}<small>psf</small></div></button>`).join('')}</div>`;
  }
  const monthStart = () => { const s = String(M.latestMonth || '').split('-'); return s.length === 2 ? K.ym(((+s[0]) - 5) * 100 + (+s[1])) : 'the start of the data'; };
  const idOf = (name) => M.BY[name].id;
  function nearbyHtml(name, nb) {   // the body of the "Compare nearby homes" / "Nearby prices" section
    const [lab] = nb.ref ? MKT[nb.ref.mk] : [''], refTxt = nb.ref ? `${lab} · ${band(nb.ref.bin)}${nb.ref.win ? ' · ' + WINL[nb.ref.win] : ''}` : '';
    if (nb.mode === 'none') { const nx = S.radius < 2000 ? 2000 : S.radius < 3000 ? 3000 : 5000; return `<p class="basis" style="margin:0">No nearby ${M.BY[name].cls === 'condo' ? 'development' : M.CLS[M.BY[name].cls].short + ' development'} has enough recorded sales ${nb.ref ? 'in this size ' : ''}to show prices.</p>${S.radius < 5000 ? `<button type="button" class="lnk" data-radius="${nx}">Look within ${nx / 1000} km ›</button>` : ''}`; }
    const cmp = nb.mode === 'compare';
    const row = (r) => { const inner = `<b>${esc(r.p.n)}</b><span class="m">${dist(r.p.d)} · ${esc(r.e.tenure)} · ${r.theirs.n} sale${r.theirs.n === 1 ? '' : 's'}</span><span class="px num">${fmt(r.theirs.med)}<small>psf</small></span><i aria-hidden="true">›</i>`; return cmp ? `<a class="nb" href="../#/compare/${esc(idOf(name))}/${esc(r.p.id)}">${inner}</a>` : `<button type="button" class="nb" data-dot="${esc(r.p.n)}">${inner}</button>`; };
    return `<p class="basis" style="margin:0 0 4px">${esc(refTxt)}${refTxt ? ' · ' : ''}${cmp ? 'Same market and size, then tenure, lease age and distance.' : `Surrounding market for context, not a price for ${esc(name)}.`}</p>${nb.list.map(row).join('')}`;
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
  const closeBtn = '<button type="button" class="close" data-dpclose aria-label="Close" title="Close and clear the selection">×</button>';
  // Phone sheet: Minimise keeps the selection, marker and radius and leaves a slim bar to reopen; × closes and clears the selection.
  const minBtn = '<button type="button" class="hide" data-dpmin aria-label="Minimise to see the map" title="Minimise to see the map"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>';
  const topBtns = (mobile) => (mobile ? `<span class="acts">${minBtn}${closeBtn}</span>` : closeBtn);
  const minBar = (title, sub, rad) => `<aside class="bs min" aria-label="${esc(title)}, minimised"><div class="mn"><button type="button" class="mn-open" data-dpshow aria-label="Show details for ${esc(title)}"><span class="mt"><b>${esc(title)}</b>${sub ? `<span class="m">${esc(sub)}</span>` : ''}</span><span class="mo">Show details <i aria-hidden="true">⌃</i></span></button>${closeBtn}</div>${rad || ''}</aside>`;
  function devCard(name, mobile) {
    const p = M.BY[name], e = M.EV[name], pos = p.pos;
    const head = `<div class="dp-top"><div style="min-width:0"><h2>${esc(name)}</h2><p class="meta">${M.CLS[p.cls].short ? esc(M.CLS[p.cls].label) + ' · ' : ''}${e ? esc(e.street) + areaLine(name) + ' · ' : ''}District ${Number(p.district)}${e ? ' · ' + esc(e.tenure) : ''}</p></div>${topBtns(mobile)}</div>`;
    if (mobile && S.min) return minBar(name, [M.CLS[p.cls].short ? M.CLS[p.cls].label : '', 'District ' + Number(p.district)].filter(Boolean).join(' · '), pos ? radStrip(name) : '');
    if (!e) { const body = `<p class="basis">Loading prices…</p>`; return mobile ? `<aside class="bs" aria-label="Selected development"><div class="bs-hd"><button type="button" class="grab" data-dpmore aria-label="Expand"></button>${head}</div>${body}</aside>` : `<aside class="dp" aria-label="Selected development"><div class="dp-in">${head}${body}</div></aside>`; }
    if (S.sec.pr === undefined && !M.lead(name)) S.sec.pr = true;   // no typical price to lead with: the sales that do exist are shown straight away
    const nb = M.nearbyFor(name);
    const pricesBody = `<div class="mkts">${marketHtml(name, 'sec', nb.ref)}${marketHtml(name, 'new', nb.ref)}${pos ? '<p class="basis" style="margin:2px 0 0">Select a size to compare nearby.</p>' : ''}${classNote(name)}</div>`;
    const nopos = `<p class="basis nopos">Not on the map yet, so neighbourhood and nearby prices are not shown.${help('URA’s data has no verified location for this development, so it cannot be placed on the map or measured against anything nearby. Its own prices by size are still shown.', 'Why there is no map position')}</p>`;
    const secs = sx('pr', 'Prices by size', pricesBody) + (pos ? sx('cmp', nb.mode === 'compare' ? 'Compare nearby homes' : 'Nearby prices', nearbyHtml(name, nb)) + sx('am', amTitle(), amenBody(name)) + sx('nbr', 'Explore nearby developments', nearHtml(name, mobile)) : '') + sx('meth', 'Data and methodology', methBody());
    const open = `<a class="btn b" href="../#/p/${esc(p.id)}" data-m-full="${esc(p.id)}">Open full analysis ›</a>`;
    const top = leadHtml(name) + (pos ? keyHtml(name) : nopos);
    if (!mobile) return `<aside class="dp" aria-label="Selected development"><div class="dp-in">${head}${top}<div class="sxs">${secs}</div></div><div class="dp-foot">${open}</div></aside>`;
    const tog = `<button type="button" class="btn g" data-dpmore aria-expanded="${!!S.more}">More about this home ${S.more ? '⌄' : '⌃'}</button>`;
    return `<aside class="bs${S.more ? ' open' : ''}" aria-label="Selected development"><div class="bs-hd"><button type="button" class="grab" data-dpmore aria-label="${S.more ? 'Collapse' : 'Expand'}"></button>${head}${pos ? radStrip(name) : ''}</div>${top}${S.more ? `<div class="sxs">${secs}</div>` : ''}<div class="bs-act">${open}${tog}</div></aside>`;
  }

  /* ---------------- explore nearby: the same optional radius on every located selection ----------------
     Secondary to the development's own details, and separate from the price comparison (which keeps its own radius and method). */
  function nearHtml(name, mobile) {   // the body of the "Explore nearby developments" section
    const d = M.placeData({ t: 'dev', n: name }, S.pr); if (!d) return '';
    const all = d.list.map((x) => ({ d: x.d, h: devRow(x) })).concat(d.ups.map((x) => ({ d: x.d, h: upRow(x) }))).sort((a, b) => a.d - b.d), n = all.length, show = S.nall ? all.slice(0, 15) : all.slice(0, 3);
    return `<p class="basis" style="margin:0 0 4px">${n ? n + ' within ' + radText(d.r) : 'None within ' + radText(d.r)} · straight-line distance from this development. The price comparison has its own radius and is not changed by this one.</p>${mobile ? '' : radHtml()}${show.map((x) => x.h).join('')}${n > 3 ? `<button type="button" class="btn g" data-nall style="margin-top:8px">${S.nall ? 'Show fewer' : 'Show ' + (n > 15 ? 'the nearest 15 of ' : 'all ') + n}</button>` : ''}${S.nall && n > 15 ? '<p class="basis">Choose a smaller radius to narrow the list.</p>' : ''}`;
  }

  /* ---------------- a new launch or an awarded GLS site: confirmed information only, never a price ---------------- */
  const srcLink = (x) => /^https?:/.test(x.url) ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.label)}</a>` : esc(x.label);
  function upCard(name, mobile) {
    const p = M.BY[name], u = p.up, ar = M.AREAOF[name] || u.area || '';
    const head = `<div class="dp-top"><div style="min-width:0"><h2>${esc(name)}</h2><p class="meta">${esc(M.upStage(p))}${p.district ? ' · District ' + Number(p.district) : ''}${ar ? ' · ' + esc(ar) : ''}</p></div>${topBtns(mobile)}</div>`;
    if (mobile && S.min) return minBar(name, M.upStage(p), p.pos ? radStrip(name) : '');
    const rows = (u.facts || []).slice(); if (u.tenure && !rows.some((r) => /tenure/i.test(r[0]))) rows.push(['Tenure', u.tenure]);
    const dl = (a) => `<dl class="upf">${a.map((r) => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('')}</dl>`;
    const facts = rows.length ? dl(rows.slice(0, 3)) : '';   // the first facts are the ones that matter; the rest are one tap away
    const notes = [
      u.nameStatus === 'reported' ? `<p class="basis">The name is reported, not yet confirmed by URA or the developer.${help('Chuan Grove is the name URA gives the sites. “One Chuan Grove” is how the project has been reported. It will be updated when the developer confirms the name.', 'About this name')}</p>` : '',
      `<p class="basis">${u.kind === 'gls' ? 'Not yet launched, so there are no sales or prices.' : 'No recorded sales yet, so no prices are shown.'}${help('Prices on this map are past recorded sales from URA. This project has none, and Groundwork does not show or estimate prices for it. It is never counted as a match for a budget.', 'Why there is no price')}</p>`,
      p.pos ? '' : `<p class="basis nopos">Not on the map yet.${help(u.posNote || 'No verified location is available yet, so it is not placed on the map.', 'Why there is no map position')}</p>`
    ].join('');
    const srcs = `<ul class="meth">${(u.src || []).map((x) => `<li>${srcLink(x)}</li>`).join('')}${u.posSrc ? `<li>Location: ${esc(u.posSrc)}</li>` : ''}</ul>`;
    const secs = (rows.length > 3 ? sx('more', 'More project details', dl(rows.slice(3))) : '') + (p.pos ? sx('am', amTitle(), amenBody(name, 'site')) + sx('nbr', 'Explore nearby developments', nearHtml(name, mobile)) : '') + ((u.src && u.src.length) || u.posSrc ? sx('meth', 'Data and sources', srcs) : '');
    const links = (u.ms ? `<a class="btn b" href="${esc(u.ms)}" target="_blank" rel="noopener noreferrer">Open project microsite ↗</a>` : '') + (u.rs ? `<a class="btn ${u.ms ? 'g' : 'b'}" href="../#/p/${esc(u.rs)}" data-m-full="${esc(u.rs)}">Research page ›</a>` : '');
    const top = facts + notes + (p.pos ? keyHtml(name) : '');
    if (!mobile) return `<aside class="dp" aria-label="Selected development"><div class="dp-in">${head}${top}<div class="sxs">${secs}</div></div>${links ? `<div class="dp-foot dp-foot2">${links}</div>` : ''}</aside>`;
    return `<aside class="bs${S.more ? ' open' : ''}" aria-label="Selected development"><div class="bs-hd"><button type="button" class="grab" data-dpmore aria-label="${S.more ? 'Collapse' : 'Expand'}"></button>${head}${p.pos ? radStrip(name) : ''}</div>${top}${S.more && secs ? `<div class="sxs">${secs}</div>` : ''}<div class="bs-act">${links}${secs ? `<button type="button" class="btn g" data-dpmore aria-expanded="${!!S.more}">More about this site ${S.more ? '⌄' : '⌃'}</button>` : ''}</div></aside>`;
  }
  const cardFor = (name, m) => M.BY[name].up ? upCard(name, m) : devCard(name, m);

  /* ---------------- place cards: a neighbourhood, an MRT station, a school, a road or a postal code ---------------- */
  const devRow = (x, withDist = true) => `<button type="button" class="nb" data-pick="dev|${esc(x.p.n)}"><b>${esc(x.p.n)}</b><span class="m">${x.p.cls !== 'condo' ? esc(M.CLS[x.p.cls].short) + ' · ' : ''}${withDist ? distA(x.d) + ' · ' : ''}${esc(x.e.tenure)} · ${x.p.t12 ? x.p.t12 + ' sale' + (x.p.t12 === 1 ? '' : 's') + ' in 12 months' : 'no sales in 12 months'}</span><i aria-hidden="true">›</i></button>`;
  // A road: where to read what landed homes sold for around it (the map itself shows condo prices, never landed sales)
  const roadLanded = (d) => `<a class="nb" href="../../journey/worth/#landed:${encodeURIComponent(d.title)}" data-gw-go="landed" style="margin-top:12px"><b>What landed homes sold for near ${esc(d.title)}</b><span class="m">Sales by street from URA records. Landed sales are not shown on this map.</span><i aria-hidden="true">›</i></a>`;
  const radText = (x) => (x < 1000 ? x + ' m' : x / 1000 + ' km');
  const radHtml = () => `<div class="rad" role="radiogroup" aria-label="Search radius">${M.RADII.map((x) => `<button type="button" role="radio" aria-checked="${x === S.pr}" data-pr="${x}">${radText(x)}</button>`).join('')}</div>`;
  // The same four radius choices, kept at the top of the phone sheet (pinned while the details scroll) and in the minimised bar.
  function radStrip(name) {
    const d = M.placeData({ t: 'dev', n: name }, S.pr); if (!d) return '';
    const n = d.list.length + d.ups.length;
    return `<div class="bs-rad"><div class="rl"><b>Nearby</b><span>${n ? n + ' within ' + radText(d.r) : 'None within ' + radText(d.r)}</span></div>${radHtml()}</div>`;
  }
  const upRow = (x) => `<button type="button" class="nb" data-pick="dev|${esc(x.p.n)}"><b>${esc(x.p.n)}</b><span class="m">${esc(M.upTag(x.p))} · ${distA(x.d)}</span><i aria-hidden="true">›</i></button>`;
  // a postal code that has not been resolved (an old link, or OneMap not answering): said simply, with the way out
  function postalMiss(pl, mobile) {
    const code = String(pl.n).split('~')[0], st = M.postalState(pl.n), msg = st === 'loading' ? PCMSG.loading(code) : (PCMSG[st] || PCMSG.error)(code);
    const inner = `<div class="dp-top"><div style="min-width:0"><h2>Postal code ${esc(code)}</h2><p class="meta" role="status">${esc(msg)}</p></div>${closeBtn}</div>`;
    return mobile ? `<aside class="bs" aria-label="Postal code">${inner}</aside>` : `<aside class="dp dp-start" aria-label="Postal code"><div class="dp-in">${inner}</div></aside>`;
  }
  function placeCard(pl, mobile) {
    const d = M.placeData(pl, S.pr); if (!d) return pl.t === 'postal' ? postalMiss(pl, mobile) : startCard(mobile);
    const head = `<div class="dp-top"><div style="min-width:0"><h2>${esc(d.title)}</h2><p class="meta">${esc(d.meta)}</p></div>${topBtns(mobile)}</div>`;
    if (mobile && S.min) return minBar(d.title, d.meta, d.t === 'area' ? '' : `<div class="bs-rad">${radHtml()}</div>`);
    let body = '';
    if (d.t === 'area') {
      const row = (k, label, txt) => `<div class="ag"><span class="agi k-${k}">${icon(k, 13)}</span><div class="agb"><b>${label}</b><p class="ai2">${txt}</p></div></div>`;
      const nm = (arr, n) => arr.slice(0, n).map((x) => esc(x.n)).join(', ') + (arr.length > n ? ` and ${arr.length - n} more` : '');
      const cnt = (f) => d.sch.filter(f).length, np = cnt(M.isPri), ns = cnt(M.isSec);
      body = `<div class="around"><div class="h2">In this neighbourhood</div>${row('mrt', 'Transport', d.stn.length ? nm(d.stn, 4) : 'No MRT or LRT station inside the boundary')}${M.hasSchools() ? row('school', 'Schools', d.sch.length ? `${np} primary · ${ns} secondary${d.sch.length - np - ns ? ` · ${d.sch.length - np - ns} other` : ''}` : 'None listed') : ''}${row('park', 'Parks', d.pk.length ? nm(d.pk, 2) : 'No park of 0.8 ha or more listed')}</div>`;
      const n = mobile && !S.more ? 0 : 6;
      body += `<div class="sec"><div class="sh"><b>Developments${help('Most active in the last 12 months first. Select one to see prices by size.', 'How developments are ordered')}</b><span>${d.devs.length} with recorded sales</span></div>${n ? d.devs.slice(0, n).map((p) => devRow({ p, e: M.EV[p.n] }, false)).join('') : ''}</div>${d.ups.length && n ? `<div class="sec"><div class="sh"><b>New launches and sites</b><span>${d.ups.length} with no recorded sales</span></div>${d.ups.slice(0, 3).map((p) => `<button type="button" class="nb" data-pick="dev|${esc(p.n)}"><b>${esc(p.n)}</b><span class="m">${esc(M.upTag(p))}</span><i aria-hidden="true">›</i></button>`).join('')}</div>` : ''}`;
    } else {
      const nx = M.RADII[M.RADII.indexOf(d.r) + 1];
      body = `<div class="sec" style="margin-top:14px;padding-top:0;border:0"><div class="sh"><b>Developments within ${radText(d.r)}${help(d.t === 'mrt' ? 'Straight-line distance from the nearest exit, not walking time.' : d.t === 'road' ? 'Straight-line distance from the middle of the road, not walking time. The road’s position is approximate, and no house is placed on it.' : 'Straight-line distance, not walking time. Living near a school does not decide admission; check the MOE registration rules.', 'How distances are measured')}</b><span>${d.list.length} with recorded sales</span></div>${radHtml()}${d.list.length ? d.list.slice(0, mobile && !S.more ? 3 : 6).map((x) => devRow(x)).join('') : `<p class="basis" style="margin:8px 0 0">None with recorded sales within ${radText(d.r)}.</p>${nx ? `<button type="button" class="lnk" data-pr="${nx}">Look within ${radText(nx)} ›</button>` : ''}`}</div>${d.ups && d.ups.length && (!mobile || S.more) ? `<div class="sec"><div class="sh"><b>New launches and sites${help('Launches and awarded government land sale sites with a verified location. They have no recorded sales, so no prices are shown.', 'About these')}</b><span>${d.ups.length} within ${radText(d.r)}</span></div>${d.ups.slice(0, 3).map(upRow).join('')}</div>` : ''}${d.t === 'road' ? roadLanded(d) : ''}`;
    }
    if (!mobile) return `<aside class="dp" aria-label="${esc(d.title)}"><div class="dp-in">${head}${body}</div></aside>`;
    const more = (d.t === 'area' ? d.devs.length : d.list.length + (d.ups ? d.ups.length : 0)) > 3 ? `<div class="bs-act"><button type="button" class="btn g" data-dpmore aria-expanded="${!!S.more}">${d.t === 'area' ? 'Developments' : 'More developments'} ${S.more ? '⌄' : '⌃'}</button></div>` : '';
    return `<aside class="bs${S.more ? ' open' : ''}" aria-label="${esc(d.title)}"><div class="bs-hd"><button type="button" class="grab" data-dpmore aria-label="${S.more ? 'Collapse' : 'Expand'}"></button>${head}</div>${body}${more}</aside>`;
  }
  function startCard(mobile) {
    const inner = `<h2>Explore homes and neighbourhoods</h2><p class="meta" style="margin-top:6px">Search a neighbourhood, ${M.hasRoads() ? 'road, ' : ''}MRT station${M.hasSchools() ? ', school' : ''} or development, or select a dot. Zoom in to see stations${M.hasSchools() ? ' and schools' : ''}.</p><p class="basis" style="margin:10px 0 0">${SRC}</p>`;
    return mobile ? `<aside class="bs" aria-label="Start">${inner}</aside>` : `<aside class="dp dp-start" aria-label="Start"><div class="dp-in">${inner}</div></aside>`;
  }

  /* ---------------- page ---------------- */
  const mode = () => S.place ? 'place' : (S.start || !S.proj) ? 'start' : 'dev';
  function legendHtml() {
    const md = mode(), shown = md === 'dev' ? S.proj : null, sp = shown && M.BY[shown].pos ? shown : null, L = S.layers;
    return `<div class="mapkey" aria-label="Map key">${L.homes ? '<span><i class="a"></i>Development</span>' : ''}${sp || md === 'place' ? '<span><i class="s"></i>Selected</span>' : ''}${L.mrt ? '<span><i class="m"></i>MRT</span>' : ''}${L.school && M.hasSchools() ? '<span><i class="sc"></i>School</span>' : ''}${L.shops ? '<span><i class="sh"></i>Shops and parks</span>' : ''}${sp && M.EV[sp] ? '<span><i class="t"></i>Nearby comparison</span>' : ''}${L.launch && M.UP.some((p) => p.pos) ? '<span><i class="u"></i>New launch or site</span>' : ''}</div>`;
  }
  function stage() {
    const m = narrow(), md = mode(), shown = md === 'dev' ? S.proj : null, sp = shown && M.BY[shown].pos ? shown : null;
    const legend = legendHtml();
    const zoom = `<div class="zoomc zc"><button type="button" data-zoom="1" aria-label="Zoom in">+</button><button type="button" data-zoom="-1" aria-label="Zoom out">−</button></div>`;
    const card = md === 'start' ? startCard(m) : md === 'place' ? placeCard(S.place, m) : cardFor(shown, m);
    return `<div class="mapstage${m && S.more && !S.min ? ' more' : ''}"><div id="map" class="map" aria-label="Map of Singapore"></div><div class="mapsearch">${searchBox()}</div>${LY.html(S.layers, S.lyrOpen, M)}${m ? '' : zoom + legend}${card}</div>`;
  }
  const postalAsked = {};
  function render() {
    const app = $('#app'); const focusId = document.activeElement && document.activeElement.id; const selStart = document.activeElement && document.activeElement.selectionStart;
    view.destroy(); app.innerHTML = stage();
    document.title = (S.place ? (S.place.t === 'postal' && M.PC[S.place.n] ? M.PC[S.place.n].title : S.place.n) + ' · ' : mode() === 'dev' ? S.proj + ' · ' : '') + 'Map · Groundwork';
    const mapEl = $('#map'); if (mapEl) mountMap(mapEl);
    // a shared link to a postal code: look it up once, then draw it
    if (S.place && S.place.t === 'postal' && !M.PC[S.place.n] && M.postalState(S.place.n) === 'loading' && !postalAsked[S.place.n]) { postalAsked[S.place.n] = 1; M.lookupPostal(String(S.place.n).split('~')[0]).then(() => render()); }
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (selStart != null && el.setSelectionRange) try { el.setSelectionRange(selStart, selStart); } catch (e) { /* not a text field */ } } }
  }
  /* the card changes (a size is selected, recent sales are opened) without rebuilding the map: only the markers are refreshed */
  function refreshCard() {
    const card = $('.dp,.bs'); if (!card) return render(); const sc = card.querySelector('.dp-in'), top = sc ? sc.scrollTop : card.scrollTop, m = narrow();
    card.outerHTML = S.place ? placeCard(S.place, m) : cardFor(S.proj, m);
    const n = $('.dp,.bs'), s2 = n.querySelector('.dp-in'); if (s2) s2.scrollTop = top; else n.scrollTop = top;
    view.update(mapProps(false));
  }
  const sheetH = () => (($('.bs') || {}).offsetHeight || 300) + 16;
  const DEVPAD = (m) => m ? { tl: [28, S.more && !S.min ? 16 : 84], br: [28, sheetH()] } : { tl: [48, 84], br: [420, 70] };
  const mapProps = (fit) => Object.assign(mapProps1(fit), { layers: S.layers });
  const evOK = () => { for (const k in M.EV) return true; return false; };   // the prices have arrived, so the card (and the sheet's height) is final
  function mapProps1(fit) {
    const md = mode(), m = narrow(), pad = DEVPAD(m);
    if (md === 'start' || (md === 'dev' && !M.BY[S.proj].pos)) return { keep: md === 'dev', key: 'start|' + (m ? 'm' : 'd'), projects: M.PM, selected: null, cmp: [], amen: [], world: true, fit, minZoom: 11, pad: m ? { tl: [20, 84], br: [20, (($('.bs') || {}).offsetHeight || 150) + 16] } : { tl: [20, 76], br: [360, 60] } };
    if (md === 'place') {
      const d = M.placeData(S.place, S.pr); if (!d) return { keep: false, key: 'start|' + (m ? 'm' : 'd'), projects: M.PM, selected: null, cmp: [], amen: [], world: true, fit, minZoom: 11, pad: m ? { tl: [20, 84], br: [20, (($('.bs') || {}).offsetHeight || 150) + 16] } : { tl: [20, 76], br: [360, 60] } };   // a place not found (an old link, or the road files still loading): the whole island, never an error
      if (d.t === 'area') return { key: 'a|' + S.place.n + '|' + (m ? 'm' + (S.more ? 'x' : '') + (S.min ? 'n' : '') : 'd') + (evOK() ? '' : '|wait'), ready: evOK(), projects: M.PM, selected: null, cmp: [], amen: [], bounds: d.bounds, areaRings: d.a.rings, place: { lat: null, chipAt: d.centre, label: d.title, sub: 'Neighbourhood' }, fit, minZoom: 11, pad };
      const list = d.list.slice(0, m && !S.more ? 3 : 6), cmp = list.map((x) => x.p.n), dl = d.r / 111320, dn = d.r / (111320 * Math.cos(d.lat * Math.PI / 180));
      return { key: 'p|' + S.place.t + S.place.n + '|' + d.r + '|' + (m ? 'm' + (S.more ? 'x' : '') + (S.min ? 'n' : '') : 'd') + (evOK() ? '' : '|wait'), ready: evOK(), projects: M.PM, selected: null, cmp, amen: [], circle: { lat: d.lat, lon: d.lon, r: d.r }, place: { lat: d.lat, lon: d.lon, label: d.title, sub: d.t === 'mrt' ? 'MRT station' : d.s.lab }, fitPts: [[d.lat, d.lon], [d.lat + dl, d.lon], [d.lat - dl, d.lon], [d.lat, d.lon + dn], [d.lat, d.lon - dn]], zoom: 15, minZoom: 11, fit, pad };
    }
    return mapProps0(fit);
  }
  function mapProps0(fit) {
    const m = narrow(), shown = S.proj, pad = DEVPAD(m);
    const nb = M.EV[shown] ? M.nearbyFor(shown) : { list: [] }, cmp = nb.list.map((r) => r.p.n);
    const amen = (S.sec.am && (!m || S.more) ? M.around(shown, 2).reduce((a, g) => a.concat(g.items), []) : keyAmen(shown)).map((i) => ({ id: i.id, k: i.k, n: i.n, lat: i.lat, lon: i.lon, d: i.d }));   // the two that matter, or all of them while the amenities section is open
    const near = amen.filter((a) => (a.k === 'mrt' || a.k === 'school') && a.d <= 1200).slice(0, 2).map((a) => [a.lat, a.lon]);
    const pts = [shown, ...cmp].map((n) => [M.BY[n].lat, M.BY[n].lon]).concat(near);
    const c = M.BY[shown];
    if (S.pr !== 1000) { const dl = S.pr / 111320, dn = S.pr / (111320 * Math.cos(c.lat * Math.PI / 180)); pts.push([c.lat + dl, c.lon], [c.lat, c.lon + dn]); }   // a radius the visitor chose is shown whole
    return { key: 'f|' + shown + '|' + S.radius + '|' + S.pr + '|' + (m ? 'm' + (S.more ? 'x' : '') + (S.min ? 'n' : '') : 'd') + (M.EV[shown] ? '' : '|wait'), ready: !!M.EV[shown], projects: M.PM, selected: shown, cmp, amen, circle: { lat: c.lat, lon: c.lon, r: S.pr, soft: true }, hl: S.hl, fitPts: pts, zoom: 15, minZoom: 14, fit: !!fit, pad };
  }
  function mountMap(el) {
    const sh = $('.bs'); if (sh) $('.mapstage').style.setProperty('--shh', sh.offsetHeight + 'px');
    view.create(el, { onSelect: dotPick, onPlace: placePick, persistPos: true, onSources: openSources });
    const pr = mapProps(true); pr.fit = true; view.update(pr);
  }
  function dotPick(n) { loadProject(n); S.start = false; go(true); }
  function placePick(t, n) { S.start = false; S.more = false; S.min = false; S.hl = null; S.pr = 1000; S.nall = false; S.place = { t, n }; go(true); }
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
      (M.upDoc && M.UP.length ? ` New launches and sites: ${M.upDoc.sources.map(line).join('; ')}. Under-construction launches are placed from OneMap’s address records and awarded sites from the official URA site boundary; a project with no verified location is not placed on the map. Postal codes are looked up through OneMap when typed.` : ' Postal codes are looked up through OneMap when typed.') +
      ` Basemap: OneMap, © contributors | Singapore Land Authority. Distances are straight-line. Not endorsed by any of these agencies.`;
  }

  /* the Layers control alone is redrawn, so the map does not move */
  function drawLayers() { const el = $('.lyr'); if (el) el.outerHTML = LY.html(S.layers, S.lyrOpen, M); }

  /* ---------------- data and sources: one small panel opened from the Map corner, never a page section ---------------- */
  const SP = { open: false, from: null };
  function openSources() {
    const el = document.getElementById('sources'); if (!el) return;
    SP.open = true; SP.from = document.activeElement; el.hidden = false; document.body.classList.add('kpm-srcopen');
    const x = el.querySelector('[data-src-close]'); if (x) x.focus();
  }
  function closeSources(back) {
    const el = document.getElementById('sources'); if (!el || !SP.open) return;
    SP.open = false; el.hidden = true; document.body.classList.remove('kpm-srcopen');
    if (back) { const f = SP.from && SP.from.isConnected ? SP.from : document.querySelector('.m-src'); if (f && f.focus) f.focus(); }
  }
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-src-close]')) closeSources(true); });

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const fl = e.target.closest && e.target.closest('a[data-m-full]');
    if (fl) { try { sessionStorage.setItem('kpt.map.out', JSON.stringify({ id: fl.dataset.mFull, h: location.hash, n: history.length })); } catch (x) { /* Back to Map then opens the Map for that development */ } }
    if (SP.open && !(e.target.closest && (e.target.closest('#sources') || e.target.closest('.m-src')))) closeSources(false);
    if (!M) return;
    const t = e.target.closest('[data-lyr],[data-dpclose],[data-dpmin],[data-dpshow],[data-dpmore],[data-nall],[data-dot],[data-radius],[data-pr],[data-am-more],[data-pick],[data-zoom],[data-band],[data-rc],[data-am],[data-sources]');
    if (!t) { if (S.lyrOpen && !e.target.closest('.lyr')) { S.lyrOpen = false; drawLayers(); } if (!e.target.closest('.srch') && S.suggOpen) { S.suggOpen = false; render(); } return; }
    if (S.lyrOpen && !t.hasAttribute('data-lyr') && !e.target.closest('.lyr')) { S.lyrOpen = false; drawLayers(); }
    const d = t.dataset;
    if (t.hasAttribute('data-lyr')) { S.lyrOpen = !S.lyrOpen; drawLayers(); const b = $('.lyr-b'); if (b) b.focus(); return; }
    if (t.hasAttribute('data-sources')) { openSources(); return; }
    if (t.hasAttribute('data-dpclose')) { S.start = true; S.more = false; S.min = false; S.place = null; go(true); return; }
    if (t.hasAttribute('data-dpmin')) { S.min = true; go(false); return; }
    if (t.hasAttribute('data-dpshow')) { S.min = false; go(false); return; }
    if (t.hasAttribute('data-dpmore')) { S.more = !S.more; go(false); return; }
    if (d.dot) { dotPick(d.dot); return; }
    const keep = (fn) => { const sc = $('.dp-in') || $('.bs'), top = sc ? sc.scrollTop : 0; fn(); const n = $('.dp-in') || $('.bs'); if (n) n.scrollTop = top; };   // a radius change keeps the panel where the visitor was reading
    if (d.radius) { keep(() => { S.radius = +d.radius; go(false); }); return; }
    if (d.pr) { keep(() => { S.pr = +d.pr; go(false); }); return; }
    if (t.hasAttribute('data-nall')) { S.nall = !S.nall; refreshCard(); return; }
    if (t.hasAttribute('data-am-more')) { S.am = !S.am; refreshCard(); return; }
    if (d.band) { S.band = S.band === d.band ? null : d.band; refreshCard(); return; }
    if (d.rc) { S.rc[d.rc] = !S.rc[d.rc]; refreshCard(); return; }
    if (d.am) { S.hl = S.hl === d.am ? null : d.am; view.hl(S.hl, true, narrow() ? { tl: [28, 84], br: [28, sheetH()] } : { tl: [48, 84], br: [420, 70] }); return; }
    if (d.pick) { pickItem(d.pick); return; }
    if (d.zoom) { if (+d.zoom > 0) view.zoom(1); else view.zoomOut(1); return; }
  });
  document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-am]'); if (t && !narrow() && view) view.hl(t.dataset.am, false); });
  document.addEventListener('mouseout', (e) => { const t = e.target.closest && e.target.closest('[data-am]'); if (t && !narrow() && view) view.hl(S.hl, false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && SP.open) { closeSources(true); return; }
    if (!M) return;
    if (e.key === 'Escape') { if (S.lyrOpen) { S.lyrOpen = false; drawLayers(); const b = $('.lyr-b'); if (b) b.focus(); return; } if (S.suggOpen) { S.suggOpen = false; render(); } return; }
    if (e.key === '/' && !e.target.matches('input,textarea')) { const i = $('#q'); if (i) { e.preventDefault(); i.focus(); } return; }
    if (e.target.matches('#q')) {
      const list = suggestions().list;
      if (e.key === 'ArrowDown') { e.preventDefault(); S.qi = Math.min(list.length - 1, S.qi + 1); S.suggOpen = true; render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); S.qi = Math.max(-1, S.qi - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = list[S.qi >= 0 ? S.qi : 0]; if (it) pickItem(it.t + '|' + it.n); else { const c = M.postalCode(S.q); if (c) M.lookupPostal(c).then((x) => { PCR[c] = x; if (x.list[0] && M.postalCode(S.q) === c) pickItem('postal|' + x.list[0].n); else refreshSugg(); }); } }
    }
  });
  document.addEventListener('change', (e) => {
    const c = M && e.target.matches && e.target.matches('[data-layer]') ? e.target : null; if (!c) return;
    S.layers[c.dataset.layer] = c.checked; LY.save(S.layers); view.update({ layers: S.layers }); const k = $('.mapkey'); if (k) k.outerHTML = legendHtml();
  });
  /* a section opened or closed: remembered while the same development stays selected; the amenities section also decides how many amenities are marked on the map */
  document.addEventListener('toggle', (e) => {
    const d = e.target; if (!M || !d.matches || !d.matches('details.sx')) return; const id = d.dataset.sx; if (!!S.sec[id] === d.open) return;
    S.sec[id] = d.open; if (id === 'am' && view) view.update(mapProps(false));
  }, true);
  document.addEventListener('input', (e) => {
    if (M && e.target.matches('#q')) { S.q = e.target.value; S.qi = -1; S.suggOpen = true; const c = M.postalCode(S.q); if (c && PCR[c] && PCR[c].state === 'error') delete PCR[c]; refreshSugg(); }
  });
  document.addEventListener('focusin', (e) => { if (M && e.target.matches('#q') && S.q.trim()) { S.suggOpen = true; const box = e.target.closest('.srch'); if (!box.querySelector('.sugg')) refreshSugg(); } });
  let rsT, wasNarrow = null; addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (!view || !M) return; const n = narrow(); if (wasNarrow !== null && n !== wasNarrow) { wasNarrow = n; render(); return; } wasNarrow = n; view.invalidate(); view.update(mapProps(false)); }, 150); });   /* a sheet that changes height keeps the selected dot in the usable area */

  /* ---------------- boot ---------------- */
  const app = $('#app');
  const fail = (msg) => { app.innerHTML = `<div class="kpm-state"><h1>The map could not load</h1><p>${esc(msg)} Please refresh the page. If it keeps happening, the Research pages still work: <a href="../">open Research</a>.</p></div>`; };
  // New launches and awarded GLS sites (data/map/upcoming.json) load with the places; if that file is missing the Map simply has none of them.
  Promise.all([getJson('places.json'), getJson('amen.json'), getJson('upcoming.json').catch(() => null)]).then(([pl, am, up]) => {
    M = K.create(pl, am, S); M.setUpcoming(up); M.upDoc = up; view = window.KPT_MAP_VIEW(K, M); if (location.hash === '#sources') { try { history.replaceState(null, '', location.pathname + location.search); lastHash = location.hash; } catch (x) { /* ignore */ } SP.pending = true; } parseHash(); notices(); render(); if (SP.pending) openSources();
    window.KPT_MAP_APP = { S, M, view, render, go };
    // Prices load after the first paint; schools and supermarkets only if that file has been cleared for publication (no file, no layer).
    getJson('ev.json').then((ev) => { M.setEvidence(ev); render(); window.KPT_MAP_APP.evReady = true; }).catch(() => fail('Prices could not be loaded.'));
    if (am.extra) getJson(am.extra).then((ex) => { M.setExtra(ex); notices(); render(); }).catch(() => {});
    // Roads (the street positions Property values & prices uses). Without them the search simply has no Roads group.
    const landed = new URL('../../data/value/landed/', location.href).href, getRoad = (f) => fetch(landed + f + '?v=' + BUILD).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([getRoad('geo.json'), getRoad('geo-more.json')]).then(([g, mo]) => { if (!g && !mo) return; M.setRoads(g, mo); notices(); render(); window.KPT_MAP_APP.roadsReady = true; });
  }).catch(() => fail('The map data could not be loaded.'));
})();
