/* ==========================================================================
   GROUNDWORK — "Location & amenities" inside a development's Research report (25 Oct 2026).
   A small map centred on the development, with the Map's own data (data/map/places.json for its position; amen.json and amen-extra.json for
   MRT stations, schools, hawker centres, supermarkets and parks), the Map's own helpers (kpt-map-core.js: hav, distA) and the Map's own
   basemap (OneMap tiles and attribution, as kpt-map-view.js). It is NOT a second map: it shows what is around one development and links to
   the full Map for anything more. Everything loads only when the section comes near the screen, so the report itself is never delayed.
   Distances are straight lines from the development's map position, never walking distances, and say so.
   Pure helpers (nearest, near) work in Node for the tests; mount() is browser only. UMD: window.GW_LOC.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.GW_LOC = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  // The Map's basemap, exactly as kpt-map-view.js (research/tests/locmap-tests.js keeps the two equal).
  const TILES = 'https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png';
  const ATTR = '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" onerror="this.style.display=\'none\'"> <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> &copy; contributors | Singapore Land Authority';
  const RADIUS = 1500;   // what is drawn and listed: within 1.5 km, straight line
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Kinds of place, in the order of the switches. on: shown when the map opens.
  const KINDS = [
    { k: 'mrt', label: 'MRT', on: true, color: '#C8102E' },
    { k: 'school', label: 'Schools', on: false, color: '#5A55D6' },
    { k: 'food', label: 'Food and shops', on: false, color: '#B26B00' },
    { k: 'park', label: 'Parks', on: false, color: '#1F7A3D' },
  ];

  /* ---------------- pure ---------------- */
  // K: kpt-map-core helpers (hav). A station is as near as its nearest exit; a park as near as its nearest boundary point.
  function distTo(K, here, x) {
    if (x.ex && x.ex.length) return Math.min.apply(null, x.ex.map((e) => K.hav(here, { lat: e[0], lon: e[1] })));
    if (x.rings) { let best = Infinity; x.rings.forEach((ring) => ring.forEach((pt) => { const d = K.hav(here, { lat: pt[0], lon: pt[1] }); if (d < best) best = d; })); return best; }
    return K.hav(here, x);
  }
  // Every place of each kind within the radius, nearest first. amen: amen.json; extra: amen-extra.json (may be null).
  function near(K, here, amen, extra, radius) {
    const R = radius || RADIUS, out = { mrt: [], school: [], food: [], park: [] };
    const add = (k, x, name, sub) => { const d = distTo(K, here, x); if (d <= R) out[k].push({ name, sub: sub || '', d, lat: x.lat != null ? x.lat : (x.rings ? x.rings[0][0][0] : null), lon: x.lon != null ? x.lon : (x.rings ? x.rings[0][0][1] : null), x }); };
    ((amen && amen.stations) || []).forEach((s) => add('mrt', s, s.n, s.k === 'LRT' ? 'LRT station' : 'MRT station'));
    ((amen && amen.food) || []).forEach((f) => add('food', f, f.n, 'Hawker centre'));
    ((amen && amen.parks) || []).forEach((p) => add('park', p, p.n, 'Park'));
    ((extra && extra.schools) || []).forEach((s) => add('school', s, s.n, s.lab || 'School'));
    ((extra && extra.shops) || []).forEach((s) => add('food', s, s.n + (s.w ? ', ' + s.w : ''), 'Supermarket'));
    Object.keys(out).forEach((k) => out[k].sort((a, b) => a.d - b.d));
    return out;
  }
  // The few lines under the map: the nearest of each kind, and how many schools are within 1 km. Straight-line, said once.
  function summary(K, N) {
    const L = [], d = (x) => K.distA(x.d);
    if (N.mrt.length) L.push({ k: 'mrt', t: 'Nearest station', v: N.mrt[0].name + ', ' + d(N.mrt[0]) });
    const s1 = N.school.filter((x) => x.d <= 1000);
    if (s1.length) L.push({ k: 'school', t: 'Schools within 1 km', v: s1.length + ' (nearest ' + s1[0].name + ', ' + d(s1[0]) + ')' });
    const hawk = N.food.find((x) => x.sub === 'Hawker centre'), sup = N.food.find((x) => x.sub === 'Supermarket');
    if (hawk) L.push({ k: 'food', t: 'Nearest hawker centre', v: hawk.name + ', ' + d(hawk) });
    if (sup) L.push({ k: 'food', t: 'Nearest supermarket', v: sup.name.split(',')[0] + ', ' + d(sup) });
    if (N.park.length) L.push({ k: 'park', t: 'Nearest park', v: N.park[0].name + ', ' + d(N.park[0]) });
    return L;
  }
  // The development's map position, from places.json (fields + rows), or null.
  function position(places, id) {
    if (!places || !places.rows) return null;
    const F = places.fields, ii = F.indexOf('id'), la = F.indexOf('lat'), lo = F.indexOf('lon');
    const r = places.rows.find((x) => x[ii] === id);
    return r && r[la] != null && r[lo] != null ? { lat: r[la], lon: r[lo] } : null;
  }

  /* ---------------- browser ---------------- */
  const loaded = {};
  function script(src) { if (!loaded[src]) loaded[src] = new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); return loaded[src]; }
  function css(href) { if (document.querySelector('link[href="' + href + '"]')) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
  const json = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  // sec: the report's section ([data-lg-loc]); o: { id, name, root ('../'), mapCore (the kpt-map-core.js address with its version) }
  function mount(sec, o) {
    if (!sec || sec.__gwl) return; sec.__gwl = true;
    const host = sec.querySelector('[data-gwl]'), base = o.root || '../';
    const go = () => {
      if (sec.__gwlGo) return; sec.__gwlGo = true;
      host.innerHTML = '<p class="gwl-wait">Loading the map…</p>';
      Promise.all([json(base + 'data/map/places.json'), json(base + 'data/map/amen.json'), json(base + 'data/map/amen-extra.json'), o.mapCore ? script(o.mapCore) : Promise.resolve()]).then((a) => {
        const here = position(a[0], o.id), K = root.KPT_MAP;
        if (!here || !K) { sec.hidden = true; const sc = document.querySelector('[data-lg-loc-go]'); if (sc) sc.hidden = true; return; }
        const N = near(K, here, a[1], a[2]);
        css(base + 'assets/vendor/leaflet/leaflet.css');
        return script(base + 'assets/vendor/leaflet/leaflet.js').then(() => draw(sec, host, here, N, a[1], a[2], o));
      }).catch(() => { host.innerHTML = '<p class="gwl-wait">The map could not load. <a href="' + esc(base + 'research/map/#p=' + encodeURIComponent(o.id)) + '">Open it on the Map ›</a></p>'; });
    };
    if ('IntersectionObserver' in root) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '400px 0px' }); io.observe(sec); }
    else go();
    sec.__gwlLoad = go;   // the shortcut loads it at once
  }
  function draw(sec, host, here, N, amen, extra, o) {
    const L = root.L, K = root.KPT_MAP, touch = !!(L.Browser && L.Browser.mobile);
    const kinds = KINDS.filter((x) => N[x.k].length), st = {}; kinds.forEach((x) => { st[x.k] = x.on; });
    const lines = summary(K, N);
    host.innerHTML = (kinds.length ? '<div class="gwl-sw" role="group" aria-label="Show on the map">' + kinds.map((x) => '<button type="button" data-gwl-k="' + x.k + '" aria-pressed="' + st[x.k] + '"><i style="background:' + x.color + '"></i>' + esc(x.label) + '</button>').join('') + '</div>' : '') +
      '<div class="gwl-map" data-gwl-map role="region" aria-label="Map of ' + esc(o.name) + ' and what is nearby"></div>' +
      (lines.length ? '<dl class="gwl-near">' + lines.map((l) => '<div data-gwl-near="' + l.k + '"><dt>' + esc(l.t) + '</dt><dd>' + esc(l.v) + '</dd></div>').join('') + '</dl>' : '<p class="gwl-wait">No MRT station, school, hawker centre, supermarket or park within 1.5 km in our map data.</p>') +
      '<p class="gwl-fine">Straight-line distances from the development’s position on the map, not walking routes. ' + srcLine(amen, extra) + '</p>';
    const map = L.map(host.querySelector('[data-gwl-map]'), { zoomControl: true, attributionControl: false, scrollWheelZoom: false, dragging: !touch, tap: false, zoomSnap: 1, minZoom: 13, maxZoom: 18 }).setView([here.lat, here.lon], 16);
    L.tileLayer(TILES, { detectRetina: true, maxZoom: 19, minZoom: 11 }).addTo(map);
    L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution(ATTR).addTo(map);
    const groups = {};
    kinds.forEach((x) => {
      const g = L.layerGroup();
      N[x.k].forEach((p) => {
        if (x.k === 'park' && p.x.rings) L.polygon(p.x.rings, { color: x.color, weight: 1, fillOpacity: 0.15 }).bindTooltip(esc(p.name) + ' · ' + K.distA(p.d)).addTo(g);
        else if (p.lat != null) L.circleMarker([p.lat, p.lon], { radius: 6, color: '#fff', weight: 2, fillColor: x.color, fillOpacity: 1 }).bindTooltip(esc(p.name) + ' · ' + esc(p.sub) + ' · ' + K.distA(p.d)).addTo(g);
      });
      groups[x.k] = g; if (st[x.k]) g.addTo(map);
    });
    L.circle([here.lat, here.lon], { radius: 1000, color: '#16213E', weight: 1, dashArray: '4 6', fill: false, interactive: false }).addTo(map);
    L.circleMarker([here.lat, here.lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#16213E', fillOpacity: 1 }).bindTooltip(esc(o.name), { permanent: true, direction: 'top', offset: [0, -10], className: 'gwl-tip' }).addTo(map);
    host.querySelectorAll('[data-gwl-k]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.gwlK; st[k] = !st[k]; b.setAttribute('aria-pressed', String(st[k]));
      if (st[k]) groups[k].addTo(map); else map.removeLayer(groups[k]);
    }));
    sec.__gwlMap = map;
    // the report can still be settling (fonts, images, the phone's address bar): keep the map's size in step so no tiles are missing
    const el = host.querySelector('[data-gwl-map]');
    if ('ResizeObserver' in root) new root.ResizeObserver(() => map.invalidateSize()).observe(el); else setTimeout(() => map.invalidateSize(), 50);
  }
  function srcLine(amen, extra) {
    const s = ((amen && amen.sources) || []).filter((x) => x.k !== 'areas').concat((extra && extra.sources) || []).filter((x) => x.k !== 'geocode');
    return s.length ? 'Places: ' + s.map((x) => esc(x.by)).filter((v, i, a) => a.indexOf(v) === i).join(', ') + ', from data.gov.sg (Singapore Open Data Licence); positions from OneMap where needed. Basemap: OneMap, Singapore Land Authority.' : '';
  }

  return { TILES, ATTR, RADIUS, KINDS, near, summary, position, distTo, mount };
});
