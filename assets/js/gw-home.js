/* ==========================================================================
   GROUNDWORK — the homepage map preview (Homepage V1.1, Master Planning 6 Nov 2026; Fable prototype v1.1).
   In the hero: three developments to try, a light map of the area around them and the selected development's figures.
   Data: data/map/home.json, written from the Map's own published data and logic by tools/map-data/build-home-preview.js (the figures
   are the Map card's: the market and size band it leads with for the last 12 months). Nothing on this page is typed in: names, places,
   figures, months and links all come from that file. A development without a 12-month typical price says so.
   Basemap: OneMap's Default tiles and OneMap's own attribution (logo, OneMap © contributors | Singapore Land Authority), the same tiles
   as the Map (assets/js/kpt-map-view.js, unchanged); on a high-density screen OneMap's Default_HD tiles one zoom level up at half size.
   No library: tiles are plain images in one layer, moved with a CSS transform; only the tiles the preview can show are requested (half a
   tile of margin). Motion is CSS only and stops under prefers-reduced-motion. Analytics: the development's id only.
   Pure helpers (proj, tilesFor, view) work in Node for the tests; mount() is browser only. UMD: window.GW_HOME.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.GW_HOME = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  // The Map's basemap (kpt-map-view.js) and OneMap's published attribution (onemap.gov.sg/docs/maps, "you MUST include the OneMap logo and attribution")
  const TILES = 'https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png';
  // On a high-density screen: OneMap's own HD basemap (same docs page, same attribution) one zoom level up at half size, so roads and
  // station names stay sharp and readable on a phone (the Map's Default tiles at half size make its labels about half as large)
  const TILES_HD = 'https://www.onemap.gov.sg/maps/tiles/Default_HD/{z}/{x}/{y}.png';
  const LOGO = 'https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png';
  const ATTR = '<img src="' + LOGO + '" alt="" width="20" height="20" onerror="this.style.display=\'none\'">&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
  const Z = 14, TS = 256;            // the preview's scale: zoom 14, 256 px tiles (a high-density screen gets zoom 15 at 128 px)
  const CLS = { condo: 'Condominium', ec: 'Executive Condominium', cluster: 'Cluster housing' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');
  const short = (n) => n >= 1e6 ? '$' + String(Math.round(n / 1e4) / 100) + 'm' : '$' + Math.round(n / 1000).toLocaleString('en-SG') + 'k';   // $1.78m, $990k
  const band = (b) => b.toLocaleString('en-SG') + '–' + (b + 99).toLocaleString('en-SG') + ' sq ft';
  const month = (ym) => { const m = /^(\d{4})-?(\d{2})$/.exec(String(ym || '')); return m ? MON[+m[2] - 1] + ' ' + m[1] : ''; };

  /* ---------------- pure ---------------- */
  // Web Mercator, in pixels at the preview's zoom (Z, 256 px tiles)
  function proj(lat, lon) {
    const n = Math.pow(2, Z), s = Math.sin(lat * Math.PI / 180);
    return { x: (lon + 180) / 360 * n * TS, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n * TS };
  }
  // A local origin for the page: the middle of the featured developments, in whole pixels
  function local(doc) { const f = doc.featured, c = proj(f.reduce((a, x) => a + x.lat, 0) / f.length, f.reduce((a, x) => a + x.lon, 0) / f.length); return { x: Math.round(c.x), y: Math.round(c.y) }; }
  // The tiles a w x h view centred on c needs (half a tile of margin), at zoom z with tiles of size ts (preview pixels)
  function tilesFor(c, w, h, hd) {
    const z = hd ? Z + 1 : Z, ts = hd ? TS / 2 : TS, m = ts / 2, out = [];
    const x0 = Math.floor((c.x - w / 2 - m) / ts), x1 = Math.floor((c.x + w / 2 + m) / ts), y0 = Math.floor((c.y - h / 2 - m) / ts), y1 = Math.floor((c.y + h / 2 + m) / ts);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ k: z + '/' + x + '/' + y, z, x, y, left: x * ts, top: y * ts, size: ts, src: (hd ? TILES_HD : TILES).replace('{z}', z).replace('{x}', x).replace('{y}', y) });
    return out;
  }
  // What the page says for one development: all from home.json
  function view(f, doc, r) {
    const L = f.lead, sec = !L || L.mk === 'sec', count = sec ? f.s12 : f.p12;
    const what = sec ? (f.sub12 > 0 ? 'resales and sub-sales' : 'resales') : 'new sales';
    const n = L ? (L.mk === 'sec' ? (L.sub > 0 ? L.n + ' resales and sub-sales' : L.n + ' resales') : L.n + ' new sales') : '';
    return {
      id: f.id, name: f.name,
      meta: ['District ' + f.district, f.street, CLS[f.cls] || CLS.condo].filter(Boolean).join(' · '),
      psf: L ? money(L.psf) : null, psfSub: L ? ['typical price per sq ft', band(L.bin) + ' homes'] : null,
      count: count, countSub: [what + ' in the', 'last 12 months'],
      hint: L ? short(L.price) + ' typical for ' + band(L.bin) + ' (' + n + ') · URA records to ' + month(doc.latestMonth) + ' · past sales, not a valuation'
        : 'Not enough sales in one size in the last 12 months for a typical price · URA records to ' + month(doc.latestMonth),
      label: L ? money(L.psf) + ' psf · ' + count + ' ' + (sec ? 'resales' : 'new sales') : count + ' ' + (sec ? 'resales' : 'new sales') + ' in 12 months',
      research: r + 'research/#/prism/' + encodeURIComponent(f.id),
      map: r + 'research/map/#p=' + encodeURIComponent(f.id),
    };
  }

  /* ---------------- browser ---------------- */
  function mount(sec) {
    if (!sec || typeof document === 'undefined') return;
    const r = (document.body && document.body.dataset.root) || '';
    const box = sec.querySelector('[data-gh-map]'), pv = sec.querySelector('[data-gh-pv]'), chipsEl = sec.querySelector('[data-gh-chips]'), open = sec.querySelector('[data-gh-open]');
    if (!box || !pv || !chipsEl) return;
    const KPT = root.KPT || { track: function () {} }, track = (n, p) => { try { KPT.track(n, p || {}); } catch (e) { /* analytics unavailable */ } };
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hd = (root.devicePixelRatio || 1) >= 1.5;
    const layer = document.createElement('div'); layer.className = 'gh-tiles'; layer.setAttribute('aria-hidden', 'true');
    const pins = document.createElement('div'); pins.className = 'gh-pins'; pins.setAttribute('aria-hidden', 'true');
    const attr = document.createElement('div'); attr.className = 'gh-attr'; attr.innerHTML = ATTR;
    box.insertBefore(layer, box.firstChild); box.appendChild(pins); box.appendChild(attr);
    let doc = null, cur = null, origin = null, O = { x: 0, y: 0 }, ok = 0, err = 0, failed = false;
    const loaded = {};

    function place() {
      if (!origin) return;
      const W = box.clientWidth, H = box.clientHeight, t = 'translate(' + Math.round(W / 2 - origin.x + O.x) + 'px,' + Math.round(H / 2 - origin.y + O.y) + 'px)';
      layer.style.transform = t; pins.style.transform = t;
      tilesFor(origin, W, H, hd).forEach((tl) => {
        if (loaded[tl.k]) return; loaded[tl.k] = 1;
        const im = new Image(); im.alt = ''; im.decoding = 'async'; im.width = tl.size; im.height = tl.size;
        im.style.left = (tl.left - O.x) + 'px'; im.style.top = (tl.top - O.y) + 'px'; im.style.width = im.style.height = tl.size + 'px';
        im.onload = () => { im.classList.add('ok'); ok++; if (ok === 1) box.setAttribute('data-tiles', 'loaded'); };
        im.onerror = () => { err++; if (!ok && err >= 3) fail(); };
        im.src = tl.src; layer.appendChild(im);
      });
    }
    function fail() { if (failed) return; failed = true; box.setAttribute('data-tiles', 'failed'); }

    function select(id, user) {
      const f = doc.featured.find((x) => x.id === id); if (!f || cur === id) return;
      cur = id; const v = view(f, doc, r);
      box.classList.add('gh-sel');
      chipsEl.querySelectorAll('[data-gh-id]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.ghId === id)));
      pins.querySelectorAll('.gh-pin').forEach((k) => { const on = k.dataset.ghId === id; k.classList.toggle('on', on); k.setAttribute('aria-pressed', String(on)); });
      pins.querySelectorAll('.gh-lbl').forEach((l) => l.classList.toggle('on', l.dataset.for === id));
      origin = proj(f.lat, f.lon);
      if (open) { open.href = v.map; open.setAttribute('aria-label', 'Explore ' + f.name + ' on the Map'); }
      const html = '<p class="gw-lane gh-o">Selected development</p><h2 class="gh-n">' + esc(v.name) + '</h2><p class="gh-meta">' + esc(v.meta) + '</p>' +
        '<div class="gh-kv">' + (v.psf ? '<div><b data-gh-psf>' + esc(v.psf) + '</b><small>' + v.psfSub.map(esc).join('<br>') + '</small></div>' : '<div><b>—</b><small>no typical price for the last 12 months</small></div>') +
        '<div><b data-gh-count>' + esc(String(v.count)) + '</b><small>' + v.countSub.map(esc).join('<br>') + '</small></div></div>' +
        '<p class="gh-hint" data-gh-hint>' + esc(v.hint) + '</p>' +
        '<p class="gh-acts"><a class="gw-btn pri" href="' + esc(v.research) + '" data-gh-research data-gw-nav-to="research">Research ' + esc(v.name) + ' ›</a></p>';
      if (reduce || !user) {
        pv.innerHTML = html;
        // the first view is placed at once (no slide in from nowhere); later selections glide unless motion is reduced
        if (!user) { box.classList.add('gh-now'); place(); void box.offsetWidth; requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove('gh-now'))); } else place();
        return;
      }
      place(); pv.classList.add('gh-swap'); setTimeout(() => { pv.innerHTML = html; pv.classList.remove('gh-swap'); }, 180);
      track('home_preview_select', { development: id });
    }

    function draw(d) {
      doc = d;
      // the background dots: not interactive, dimmed once a development is selected
      // positions are kept relative to the middle of the three (world pixels run to millions, which blurs round marks into diamonds)
      O = local(d);
      d.dots.forEach((p) => { const q = proj(p[0], p[1]), s = document.createElement('span'); s.className = 'gh-dot'; s.style.left = (q.x - O.x) + 'px'; s.style.top = (q.y - O.y) + 'px'; s.title = p[2]; pins.appendChild(s); });
      d.featured.forEach((f) => {
        const q = proj(f.lat, f.lon), v = view(f, d, r), lx = (q.x - O.x) + 'px', ly = (q.y - O.y) + 'px';
        const l = document.createElement('span'); l.className = 'gh-lbl'; l.dataset.for = f.id; l.style.left = lx; l.style.top = ly; l.setAttribute('aria-hidden', 'true');
        l.innerHTML = esc(f.name) + '<small>' + esc(v.label) + '</small>'; pins.appendChild(l);
        const b = document.createElement('button'); b.type = 'button'; b.className = 'gh-pin'; b.dataset.ghId = f.id; b.style.left = lx; b.style.top = ly;
        b.setAttribute('aria-label', f.name + ' on the map'); b.setAttribute('aria-pressed', 'false'); b.tabIndex = -1;   // pointer only: the chips above are the keyboard way (a pin can sit outside the preview)
        b.addEventListener('click', () => select(f.id, true)); pins.appendChild(b);
      });
      chipsEl.innerHTML = '<span>Try</span>' + d.featured.map((f) => '<button type="button" data-gh-id="' + esc(f.id) + '" aria-pressed="false">' + esc(f.name) + '</button>').join('');
      chipsEl.querySelectorAll('[data-gh-id]').forEach((c) => c.addEventListener('click', () => select(c.dataset.ghId, true)));
      chipsEl.hidden = false; box.hidden = false; sec.classList.add('gh-ready');
      select(d.featured[0].id, false);
      setTimeout(() => { if (!ok && !failed) fail(); }, 12000);
    }

    // the map's size follows the page (the figures beside it, the window): tiles are placed again, without a slide
    let rt = 0; const again = () => { clearTimeout(rt); rt = setTimeout(() => { box.classList.add('gh-now'); place(); void box.offsetWidth; box.classList.remove('gh-now'); }, 60); };
    if (root.ResizeObserver) new root.ResizeObserver(again).observe(box); else root.addEventListener('resize', again);
    fetch(r + 'data/map/home.json', { cache: 'no-cache' }).then((x) => { if (!x.ok) throw new Error(x.status); return x.json(); }).then(draw).catch(() => {
      // no data: the preview steps aside; the journeys, search and the Explore on Map link remain
      sec.classList.add('gh-off'); box.hidden = true; pv.innerHTML = '<p class="gh-hint"><a href="' + r + 'research/map/">Explore every development on the Map ›</a></p>';
    });
  }
  if (typeof document !== 'undefined') { const run = () => mount(document.querySelector('[data-gw-home]')); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run(); }
  return { proj, local, tilesFor, view, TILES, TILES_HD, ATTR, LOGO, Z };
});
