/* ==========================================================================
   KPT Interactive Map: the map itself (Leaflet behind a small interface). Browser only.
   Basemap: OneMap Default tiles, softened with a CSS filter (see kpt-map.css); the OneMap logo and attribution are always shown.
   ========================================================================== */
(function (root) {
  'use strict';
  // Leaflet 1.9.4 GridLayer.redraw() uses the map's unrounded zoom as the tile zoom, so at a fractional zoom a redraw asks for tiles that do not exist.
  L.GridLayer.include({ redraw: function () { if (this._map) { this._removeAllTiles(); const z = this._clampZoom(Math.round(this._map.getZoom())); if (z !== this._tileZoom) { this._tileZoom = z; this._updateLevels(); } this._update(); } return this; } });

  const TILES = 'https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png';
  const ATTR = '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" onerror="this.style.display=\'none\'"> <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> &copy; contributors | Singapore Land Authority';

  root.KPT_MAP_VIEW = function (K, M) {      // K = KPT_MAP (helpers), M = the model made by KPT_MAP.create
    const { esc, icon } = K;
    const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
    let map, tiles, layer, labelsG, selG, el, onSelect, onPlace, cur = {}, failed = false, saved = null, stats = null, loadingEl = null, failEl = null, tileTimer = null;

    function create(container, opts) {
      el = container; onSelect = opts.onSelect; onPlace = opts.onPlace; cur = {}; el.classList.add('kpm-soft');
      map = L.map(el, { zoomControl: false, attributionControl: false, scrollWheelZoom: true, zoomSnap: 1, dragging: true, tap: true, inertia: true });
      tiles = L.tileLayer(TILES, { detectRetina: true, maxZoom: 19, minZoom: 11 }).addTo(map);
      L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution(ATTR).addTo(map);
      layer = L.layerGroup().addTo(map); labelsG = L.layerGroup().addTo(map); selG = L.layerGroup().addTo(map);
      // Basemap health: count real tile loads and errors (Leaflet's 'load' fires even when every tile failed).
      stats = { ok: 0, err: 0 }; failed = false; el.setAttribute('data-tiles', 'loading');
      loadingEl = document.createElement('div'); loadingEl.className = 'tilewait'; loadingEl.textContent = 'Loading the map…'; el.appendChild(loadingEl);
      tiles.on('tileload', () => { stats.ok++; if (stats.ok === 1) { el.setAttribute('data-tiles', 'loaded'); if (loadingEl) { loadingEl.remove(); loadingEl = null; } if (failed) recover(); } });
      tiles.on('tileerror', () => { stats.err++; if (stats.ok === 0 && stats.err >= 3) fail(); });
      clearTimeout(tileTimer); tileTimer = setTimeout(() => { if (stats && stats.ok === 0) fail(); }, 12000);
      map.on('zoomend', () => { if (cur.projects) update({}); }); map.on('moveend', () => { if (cur.projects) drawLabels(); });
      return map;
    }
    function fail() {
      if (failed) return; failed = true; el.setAttribute('data-tiles', 'failed'); if (loadingEl) { loadingEl.remove(); loadingEl = null; }
      el.classList.add('nomap');
      failEl = document.createElement('div'); failEl.className = 'tilefail'; failEl.setAttribute('role', 'status');
      failEl.innerHTML = '<b>The map background could not load.</b> Locations, distances and prices still work. <div class="acts"><button type="button" data-retry>Try again</button></div>';
      el.appendChild(failEl);
      failEl.querySelector('[data-retry]').addEventListener('click', () => { stats.ok = 0; stats.err = 0; failed = false; el.classList.remove('nomap'); failEl.remove(); failEl = null; el.setAttribute('data-tiles', 'loading'); tiles.setUrl(TILES + '?r=' + Date.now(), false); clearTimeout(tileTimer); tileTimer = setTimeout(() => { if (stats.ok === 0) fail(); }, 12000); });
    }
    function recover() { failed = false; el.classList.remove('nomap'); if (failEl) { failEl.remove(); failEl = null; } }

    /* The selected development (its dot and the name chip above it) must sit inside the usable area, i.e. the map minus the search box and the card or bottom sheet.
       Runs after every placement, so a restored view or a sheet that has grown or shrunk (rows added, expanded, resized) never leaves the dot underneath it. */
    const CHIP_UP = 76, DOT_DOWN = 34;   // the chip reaches this far above the dot, the dot, its halo and the OneMap attribution strip this far below
    function keepSelectedInView() {
      const sel = cur.selected && M.BY[cur.selected] && M.BY[cur.selected].pos ? M.BY[cur.selected] : null; if (!sel || !cur.pad || !map) return;
      const pd = cur.pad, sz = map.getSize(), pt = map.latLngToContainerPoint([sel.lat, sel.lon]);
      const top = pd.tl[1] + CHIP_UP, bottom = sz.y - pd.br[1] - DOT_DOWN, left = pd.tl[0], right = sz.x - pd.br[0];   // the dot may sit anywhere in this box
      const clampY = bottom < top ? bottom + 24 : Math.min(Math.max(pt.y, top), bottom), clampX = right < left ? (left + right) / 2 : Math.min(Math.max(pt.x, left), right);
      const dx = Math.round(pt.x - clampX), dy = Math.round(pt.y - clampY);
      if (dx || dy) { map.panBy([dx, dy], { animate: false }); }
    }
    const chipHtml = (t, sub) => `<div class="selchip"><b>${esc(t)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
    function update(o) {
      if (o.keep && saved) o = Object.assign({}, o, { key: saved.key });   // a development with no position: leave the map where the visitor had it
      cur = Object.assign(cur, o);
      layer.clearLayers(); selG.clearLayers();
      if (!map._loaded || o.fit) {
        if (saved && saved.key === o.key) map.setView(saved.center, saved.zoom, { animate: false });
        else if (cur.world) { const pd = cur.pad, sz = map.getSize(), c0 = [1.362, 103.81]; map.setView(c0, sz.x < 600 ? 11 : 12, { animate: false }); const rx = (pd.tl[0] + sz.x - pd.br[0]) / 2, ry = (pd.tl[1] + sz.y - pd.br[1]) / 2, p0 = map.latLngToContainerPoint(c0); map.panBy([Math.round(p0.x - rx), Math.round(p0.y - ry)], { animate: false }); }
        else if (cur.bounds) map.fitBounds(cur.bounds, { paddingTopLeft: cur.pad.tl, paddingBottomRight: cur.pad.br, animate: false, maxZoom: 16 });
        else {
          const f = cur.fitPts, c0 = f[0], pd = cur.pad, sz = map.getSize();
          if (f.length > 1) {   // mirror the other points about the selected one so it ends up exactly in the middle of the visible area
            const pts = [c0]; f.slice(1).forEach((q) => { pts.push(q, [2 * c0[0] - q[0], 2 * c0[1] - q[1]]); });
            map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: pd.tl, paddingBottomRight: pd.br, maxZoom: 16, animate: false });
            if (map.getZoom() < cur.minZoom) map.setView(c0, cur.minZoom, { animate: false });
          } else map.setView(c0, cur.zoom || 15, { animate: false });
          const rx = (pd.tl[0] + sz.x - pd.br[0]) / 2, ry = (pd.tl[1] + sz.y - pd.br[1]) / 2, p0 = map.latLngToContainerPoint(c0);
          map.panBy([Math.round(p0.x - rx), Math.round(p0.y - ry)], { animate: false });
        }
      }
      keepSelectedInView();
      const BY = M.BY, cmp = new Set(cur.cmp || []), tip = (p) => p.up ? `${esc(p.n)} · ${esc(M.upTag(p))}` : `${esc(p.n)}${p.cls && p.cls !== 'condo' ? ' (' + esc(M.CLS[p.cls].short) + ')' : ''} · ${p.t12} sale${p.t12 === 1 ? '' : 's'} in 12 months`, z = map.getZoom(), zs = z <= 12 ? .5 : z <= 13 ? .75 : 1;
      const dot = (p, o2) => { const k = L.circleMarker([p.lat, p.lon], Object.assign(p.up ? { radius: 5 * zs + 1, color: '#2E4FD1', weight: 1.8, fillColor: '#fff', fillOpacity: .95, bubblingMouseEvents: false } : { radius: (3 + Math.min(6, Math.sqrt(p.t12))) * zs, color: '#fff', weight: 1.2, fillColor: '#2E4FD1', fillOpacity: p.t12 ? .5 : .25, bubblingMouseEvents: false }, o2)); if (canHover) k.bindTooltip(tip(p), { className: 'gwtip', direction: 'top', offset: [0, -6] }); /* a touch screen has no hover: the tap selects the dot, and a tooltip would only cover the card and the map */ k.on('click', () => onSelect && onSelect(p.n)); return k; };
      for (const p of cur.projects) if (p.n !== cur.selected && !cmp.has(p.n)) dot(p).addTo(layer);
      for (const n of cmp) { const p = BY[n]; if (p && p.pos) dot(p, { fillColor: '#0E8C89', fillOpacity: .95, weight: 2 }).addTo(layer); }
      if (cur.circle) L.circle([cur.circle.lat, cur.circle.lon], { radius: cur.circle.r, color: '#2E4FD1', weight: 2, opacity: cur.circle.soft ? .55 : .8, dashArray: '7 5', fillColor: '#2E4FD1', fillOpacity: cur.circle.soft ? .02 : .06, interactive: false }).addTo(selG);
      if (cur.areaRings) L.polygon(cur.areaRings, { color: '#14203F', weight: 2, opacity: .75, fillColor: '#2E4FD1', fillOpacity: .05, dashArray: '6 5', interactive: false }).addTo(selG);
      drawLabels();
    }
    const amIcon = (k, hl, small) => L.divIcon({ className: 'amwrap', html: `<div class="am k-${k}${hl ? ' hl' : ''}${small ? ' sm' : ''}">${icon(k, small ? 11 : 14)}</div>`, iconSize: small ? [18, 18] : [24, 24], iconAnchor: small ? [9, 9] : [12, 12] });
    function drawLabels() {
      labelsG.clearLayers(); if (!cur.projects || !map) return;
      const BY = M.BY, EV = M.EV, AM = M.AM, sz = map.getSize(), z = map.getZoom(), placed = [], hit = (r, q) => !(r.x + r.w < q.x || q.x + q.w < r.x || r.y + r.h < q.y || q.y + q.h < r.y), vis = (pt) => pt.x > -20 && pt.y > -20 && pt.x < sz.x + 20 && pt.y < sz.y + 20;
      const label = (pt, text, cls, off = 14) => {
        const w = text.length * 6.6 + 8, left = pt.x + off + w > sz.x - 10, r = { x: left ? pt.x - off - w : pt.x + off, y: pt.y - 9, w, h: 18 }; if (placed.some((q) => hit(r, q))) return false; placed.push(r);
        L.marker(map.containerPointToLatLng(pt), { icon: L.divIcon({ className: 'lbl ' + cls + (left ? ' r' : ''), html: esc(text), iconSize: left ? [w, 18] : null, iconAnchor: left ? [w + off, 9] : [-off, 9] }), interactive: false, keyboard: false }).addTo(labelsG); return true;
      };
      // 1. the selected development or place: a dark chip above the marker
      const sel = cur.selected && BY[cur.selected] && BY[cur.selected].pos ? BY[cur.selected] : null;
      const head = sel ? (() => { const e = EV[cur.selected], ten = e ? (/^99/.test(e.tenure) ? '99-yr' : /^freehold/i.test(e.tenure) ? 'Freehold' : e.tenure) : ''; return { lat: sel.lat, lon: sel.lon, t: sel.n, sub: sel.up ? M.upTag(sel) : `D${Number(sel.district)}${sel.cls && sel.cls !== 'condo' ? ' · ' + M.CLS[sel.cls].short : ''}${ten ? ' · ' + ten : ''}` }; })() : (cur.place && cur.place.lat != null ? { lat: cur.place.lat, lon: cur.place.lon, t: cur.place.label, sub: cur.place.sub } : null);
      if (head) { const pt = map.latLngToContainerPoint([head.lat, head.lon]); L.marker([head.lat, head.lon], { icon: L.divIcon({ className: 'selwrap', html: '<div class="selm"><i class="h"></i><i class="r"></i><i class="d"></i></div>', iconSize: [0, 0], iconAnchor: [0, 0] }), interactive: false, keyboard: false, zIndexOffset: 3000 }).addTo(labelsG); L.marker([head.lat, head.lon], { icon: L.divIcon({ className: 'selwrap', html: chipHtml(head.t, head.sub), iconSize: [0, 0], iconAnchor: [0, 0] }), interactive: false, keyboard: false, zIndexOffset: 3500 }).addTo(labelsG); placed.push({ x: pt.x - 90, y: pt.y - 74, w: 180, h: 56 }, { x: pt.x - 16, y: pt.y - 16, w: 32, h: 32 }); }
      else if (cur.place && cur.place.chipAt) { const pt = map.latLngToContainerPoint(cur.place.chipAt); L.marker(cur.place.chipAt, { icon: L.divIcon({ className: 'selwrap', html: chipHtml(cur.place.label, cur.place.sub), iconSize: [0, 0], iconAnchor: [0, 0] }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(labelsG); placed.push({ x: pt.x - 90, y: pt.y - 60, w: 180, h: 56 }); }
      // 2. amenities listed on the card (nearest MRT, schools, shops, parks)
      const am = cur.amen || [], amIds = new Set(am.map((a) => a.id));
      am.forEach((a) => { const pt = map.latLngToContainerPoint([a.lat, a.lon]); if (!vis(pt)) return; const hl = cur.hl === a.id; L.marker([a.lat, a.lon], { icon: amIcon(a.k, hl), interactive: false, keyboard: false, zIndexOffset: hl ? 900 : 500 }).addTo(labelsG); placed.push({ x: pt.x - 12, y: pt.y - 12, w: 24, h: 24 }); });
      am.forEach((a) => { const pt = map.latLngToContainerPoint([a.lat, a.lon]); if (vis(pt)) label(pt, a.n, 'a k-' + a.k + (cur.hl === a.id ? ' hl' : ''), 16); });
      // 3. nearby comparisons / developments in the list
      (cur.cmp || []).forEach((n) => { const p = BY[n]; if (!p || !p.pos) return; const pt = map.latLngToContainerPoint([p.lat, p.lon]); if (vis(pt)) label(pt, p.n, 't', 12); });
      // 4. ambient: MRT stations from zoom 14, schools from zoom 16 (names only when there is room); never the same ones twice
      if (cur.ambient !== false) {
        const amb = (arr, kind, minZ, nameZ, cls) => { if (z < minZ) return; arr.forEach((s) => { const id = kind + ':' + s.n; if (amIds.has(id)) return; const pt = map.latLngToContainerPoint([s.lat, s.lon]); if (!vis(pt)) return;
          const mk = L.marker([s.lat, s.lon], { icon: amIcon(kind, false, true), keyboard: false, title: s.n, riseOnHover: true }).addTo(labelsG); mk.on('click', (ev) => { L.DomEvent.stopPropagation(ev); onPlace && onPlace(kind, s.n); }); placed.push({ x: pt.x - 9, y: pt.y - 9, w: 18, h: 18 });
          if (z >= nameZ) label(pt, s.n, 'a k-' + kind, 12); }); };
        amb(AM.stations, 'mrt', 14, 16); amb(AM.schools, 'school', 16, 17);
      }
    }
    function hl(id, pan, pad) { if (!map) return; cur.hl = id; drawLabels(); if (pan && id) { const a = (cur.amen || []).find((x) => x.id === id); if (a) map.panInside([a.lat, a.lon], { paddingTopLeft: pad ? pad.tl : [40, 90], paddingBottomRight: pad ? pad.br : [40, 40], animate: true }); } }
    return { create, update, hl, zoom: (d) => map.zoomIn(d), zoomOut: (d) => map.zoomOut(d), get: () => map, destroy: () => { clearTimeout(tileTimer); if (map) { saved = { key: cur.key, center: map.getCenter(), zoom: map.getZoom() }; map.remove(); map = null; } }, failed: () => failed, invalidate: () => map && map.invalidateSize() };
  };
})(typeof self !== 'undefined' ? self : this);
