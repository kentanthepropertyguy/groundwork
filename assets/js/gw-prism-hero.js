/* ==========================================================================
   GROUNDWORK — PRISM Research hero, Release 1 (Master Planning, 7 Nov 2026; Fable's merged Research page, Claude B integration plan).
   On a PRISM evidence-profile page (#/prism/<id>, mode "profile"): a moving OneMap hero, a strip of up to four figures, a fixed P/R/I/S/M
   pentagon and a Simple / Detailed switch, added AFTER gw-prism.js has drawn and checked the page (its integrity checks are unchanged:
   a failed check means no PRISM page, so no hero).
   It writes no finding and computes no figure. Every sentence and number comes from gw-prism.js's own approved renderer functions on the
   verified model: the opening is the page's approved opening, word for word (quick read headline, Reveal or summary); the figures are the
   buyer explanation's cards (meaning first, never a sign); the pentagon's words are the approved band labels and the dimensions' own
   headlines. A missing measure is left out, never replaced or estimated.
   The two V1 assessment pages (approved Verdicts: Kingsford Waterbay, Hougang Central) are not touched.
   Simple: the hero, the figures, the pentagon, the quick read's findings, Sources. Detailed: the same plus the section bar, the full
   analysis and the five dimensions, unchanged. A link to one dimension (#/prism/<id>/<k>) opens Detailed.
   Map: OneMap's Default tiles, attribution and Web Mercator projection exactly as the homepage (GW_HOME: TILES, ATTR, proj); positions
   from the Map's published files (GW_LOC.position on places.json; station exits from amen.json). A picture, not the Map: no library,
   two tile layers (zoom 14 -> 16), a 1.8 s flight, nothing moving after about 4 s; under reduced motion only the final layer, no motion.
   Not used: the Property DNA 0.2 records, rents, yields in the strip, peer values, D-6 / D-7 wording (Release 2, after Claude C).
   Pure helpers (openingOf, stripOf, cornersOf, geometry) work in Node for the tests; mount() is browser only. UMD: window.GW_PRISMHERO.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.GW_PRISMHERO = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const VERSION = 'prism-hero-r1-1';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const KEYS = ['P', 'R', 'I', 'S', 'M'];
  // fixed interface words (not findings)
  const UI = {
    pill: 'by Groundwork', replay: 'Replay', onMap: 'Open on the Map', noTiles: 'The map could not load. Everything else on this page is unaffected.',
    modes: { simple: 'Simple', detailed: 'Detailed' }, modeLabel: 'How much to show',
    hint: { simple: 'The short version. Switch to Detailed for the full analysis and the five dimensions.', detailed: 'The full analysis, every figure, period and source. Switch to Simple for the short version.' },
    glance: 'The five PRISM dimensions at a glance', glanceSub: 'How it compares with similar developments. Tap one for its evidence.',
    legend: { cmp: 'Compared with similar developments', fact: 'Fact only, not compared', none: 'Not available' },
    shape: 'A fixed shape: every corner is the same distance from the centre, so the shape measures nothing and nothing is added up. There is no overall score.',
    factOnly: 'Fact only', notAssessed: 'Not assessed in this report', open: 'Opens in Detailed'
  };
  const lineOf = (v, k, ms) => ((v && v.profile && v.profile.lines[k]) || []).find((l) => l.measure === ms) || null;

  /* ---------------------------------------------------------------- pure: what the hero says (all from gw-prism.js) */
  // The page's approved opening, exactly as gw-prism.js's pageHtml chooses it for a profile page
  function openingOf(G, md) {
    if (!md || md.mode !== 'profile' || !md.v11) return null;
    const v = md.v11, r = G.reveal11(v), x = G.explain11(v, md.name, r), q = x && G.quick11(v, md.name, r);
    if (q) return { kind: 'quick', k: 'PRISM quick read', head: q.head, r, x, q };
    if (r) return { kind: r.kind === 'reveal' ? 'reveal' : 'summary', k: r.kind === 'reveal' ? 'PRISM Reveal' : 'PRISM summary', head: r.head, r, x: null, q: null };
    return { kind: 'none', k: '', head: '', r: null, x: null, q: null };
  }
  // Up to four figures: the buyer explanation's cards (Location first, then this development, then the neighbourhood). Without them, the
  // approved opening's own figures. Fewer than two: no strip (the page keeps its figures where they are).
  const ORDER = ['I', 'P', 'R', 'M', 'S'];
  function stripOf(op) {
    if (!op) return [];
    let out = [];
    if (op.x && op.x.cards.length) {
      out = op.x.cards.slice().sort((a, b) => ORDER.indexOf(a.dim) - ORDER.indexOf(b.dim))
        .map((c) => ({ dim: c.dim, scope: c.scope, v: c.v, unit: c.unit, cmp: c.cmp, when: c.when, fut: c.fut || '' }));
    } else if (op.r && op.r.figs.length) {
      out = op.r.figs.map((f) => ({ dim: '', scope: '', v: f.v, unit: f.label, cmp: f.sub || '', when: '', fut: '' }));
    }
    return out.length >= 2 ? out.slice(0, 4) : [];
  }
  // The pentagon: one corner per PRISM dimension, in a fixed place. state: 'cmp' (an approved comparison with similar developments),
  // 'fact' (a fact, not compared) or 'none' (the report's own missing state). word / fig: approved text only.
  function cornersOf(G, md, op) {
    const v = md.v11, P = v.positions.P, R = v.positions.R, cards = {}, gap = (k) => {
      const h = G.headline11(v, k);
      if (h && /^(Not available|Not yet assessed)$/.test(h.main)) return { state: 'none', word: h.main, fig: h.sub || '' };
      if (h) return { state: 'fact', word: UI.factOnly, fig: h.main };
      return { state: 'none', word: UI.notAssessed, fig: '' };
    };
    ((op && op.x && op.x.cards) || []).forEach((c) => { cards[c.dim] = c; });
    const name = {}; G.PILLARS.forEach(([k, n]) => { name[k] = n; });
    const out = {};
    // P: the approved Price position band, with the dimension's own headline
    out.P = P && G.headline11(v, 'P') ? { state: 'cmp', word: P.bandLabel, fig: G.headline11(v, 'P').main } : gap('P');
    // R: the approved Resale position band, compared; settling (initial resale wave) as the dimension says it, fact only; the dimension's own headline
    if (R && G.headline11(v, 'R')) {
      const h = G.headline11(v, 'R'), rs = lineOf(v, 'R', 'resale.sustained'), settling = !!(rs && rs.status === 'settling');
      // an initial resale wave is settling, not compared (Claude C data sign-off, 7 Nov 2026): a fact-only marker, same wording and figure
      out.R = { state: settling ? 'fact' : 'cmp', word: settling ? h.sub.split(' · ')[0] : R.bandLabel, fig: h.main };
    } else out.R = gap('R');
    // I: rail today, the approved station-distance band (the explanation's own reading) and figure
    const mrt = lineOf(v, 'I', 'infrastructure.mrt'), rank = mrt && mrt.status === 'available' && mrt.data && mrt.data.rank;
    const hI = G.headline11(v, 'I');
    if (rank && G.XT.card.I.why[rank.band] && (cards.I || hI)) out.I = { state: 'cmp', word: G.XT.card.I.why[rank.band].replace(/\.$/, ''), fig: cards.I ? cards.I.v + ' ' + cards.I.unit : hI.main };
    else out.I = gap('I');
    // S: a fact only (unsold inventory is not available, S3), the dimension's own headline
    { const h = G.headline11(v, 'S'); out.S = h && !/^(Not available|Not yet assessed)$/.test(h.main) ? { state: 'fact', word: UI.factOnly, fig: h.main } : gap('S'); }
    // M: context, not ranked: the quick read's market phrase and the explanation's figure
    if (cards.M) {
      const mk = lineOf(v, 'M', 'market.backdrop'), chg = mk && mk.data && isNum(mk.data.changePct) ? mk.data.changePct : null, key = chg === null ? '' : chg <= -10 ? 'down' : chg >= 10 ? 'up' : 'flat';
      out.M = { state: 'fact', word: key ? G.QT.market[key] : UI.factOnly, fig: cards.M.v + ' ' + cards.M.unit };
    } else out.M = gap('M');
    return KEYS.map((k) => Object.assign({ key: k, name: name[k] }, out[k]));
  }

  /* ---------------------------------------------------------------- pure: map geometry (the homepage's projection, any zoom) */
  // GW_HOME.proj is Web Mercator in pixels at zoom GW_HOME.Z with 256 px tiles; at zoom z the same point is 2^(z - Z) times further out
  function projAt(H, lat, lon, z) { const p = H.proj(lat, lon), f = Math.pow(2, z - H.Z); return { x: p.x * f, y: p.y * f }; }
  // The tiles a layer at zoom z needs so that, placed with the subject at (sx, sy) in a w x h frame and scaled by any s >= sMin, it covers
  // the frame: world pixels [c.x - sx / sMin, c.x + (w - sx) / sMin] and the same vertically
  function tileRange(c, sx, sy, w, h, sMin) {
    const ts = 256, x0 = Math.floor((c.x - sx / sMin) / ts), x1 = Math.floor((c.x + (w - sx) / sMin) / ts), y0 = Math.floor((c.y - sy / sMin) / ts), y1 = Math.floor((c.y + (h - sy) / sMin) / ts), out = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ x, y, left: x * ts - c.x, top: y * ts - c.y });
    return out;
  }
  const FLIGHT = { from: 14, to: 16, ms: 1800, fadeIn: [2.4, 3.2], fadeOut: [2.6, 3.4], sMinTo: 0.6 };   // scale of the zoom-14 layer runs 1 -> 4
  function frame(t) {   // t 0..1 -> the two layers' scale and opacity
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, S = 1 + 3 * e, ramp = (a, b) => Math.max(0, Math.min(1, (S - a) / (b - a)));
    return { s14: S, s16: S / 4, o14: 1 - ramp(FLIGHT.fadeOut[0], FLIGHT.fadeOut[1]), o16: ramp(FLIGHT.fadeIn[0], FLIGHT.fadeIn[1]) };
  }
  // The subject's place in the frame: centred across, and down the middle of the free band (below the text on top, above what sits on
  // the map's bottom edge), with room for its name above it
  // d: the named station's nearest exit relative to the development (zoom-16 pixels), when it can share the frame: the two are centred as a pair
  function anchor(w, band, d) {
    const mid = { x: w / 2, y: (band.top + band.bottom) / 2 + 12 };
    const fits = d && Math.abs(d.x) < w - 120 && Math.abs(d.y) < band.bottom - band.top - 60;
    const x = fits ? mid.x - d.x / 2 : mid.x, y = fits ? mid.y - d.y / 2 : mid.y;
    return { x: Math.round(Math.min(w - 60, Math.max(60, x))), y: Math.round(Math.min(band.bottom - 16, Math.max(band.top + 40, y))) };
  }

  /* ---------------------------------------------------------------- HTML */
  const ICON = {
    I: '<rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 11h12M9 19l-2 2M15 19l2 2"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/>',
    P: '<path d="M3 12l9-9h8v8l-9 9z"/><circle cx="16" cy="8" r="1.2"/>', R: '<path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/>',
    M: '<path d="M5 20V12M10 20V8M15 20V14M20 20V5"/>', S: '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 13l9 4.5 9-4.5"/>'
  };
  const ico = (k) => '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICON[k] || ICON.M) + '</svg>';
  function heroHtml(md, op, o) {
    const r = o.root || '../', at = o.attr || '';
    return '<section class="gph" id="gwp-sum" data-gph="' + esc(md.id) + '" aria-label="PRISM overview of ' + esc(md.name) + '">' +
      '<div class="gph-map" data-gph-map><div class="gph-l" data-gph-l="14" aria-hidden="true"></div><div class="gph-l" data-gph-l="16" aria-hidden="true"></div><svg class="gph-svg" data-gph-svg aria-hidden="true"></svg><div class="gph-ov" data-gph-ov aria-hidden="true"></div>' +
      '<p class="gph-attr" data-gph-attr hidden>' + at + '</p></div>' +
      '<div class="gph-scrim" aria-hidden="true"></div>' +
      '<div class="gph-txt"><div class="gph-id" data-gph-id><p class="gph-pill"><img class="gph-mark" src="' + esc(r) + 'assets/img/prism/prism-mark-original.png" width="20" height="20" alt="">PRISM <span>' + esc(UI.pill) + '</span></p></div></div>' +
      (op && op.head ? '<div class="gph-op" data-gph-opening="' + esc(op.kind) + '"><p class="gph-k">' + esc(op.k) + '</p><p class="gph-h">' + esc(op.head) + '</p></div>' : '') +
      '<div class="gph-tools"><button type="button" class="gph-btn" data-gph-replay hidden>' + esc(UI.replay) + '</button>' +
      '<a class="gph-btn" href="' + esc(r) + 'research/map/#p=' + encodeURIComponent(md.id) + '" data-gph-onmap hidden>' + esc(UI.onMap) + ' <span aria-hidden="true">›</span></a></div>' +
      '<p class="gph-note" data-gph-note hidden>' + esc(UI.noTiles) + '</p></section>';
  }
  function stripHtml(md, figs) {
    if (!figs.length) return '';
    const card = (f) => {
      const inner = '<span class="gph-fi" aria-hidden="true">' + ico(f.dim) + '</span><span class="gph-ft">' + (f.scope ? '<span class="gph-fs">' + esc(f.scope) + '</span>' : '') +
        '<b class="gph-fv">' + esc(f.v) + '</b><span class="gph-fu">' + esc(f.unit) + '</span>' + (f.fut ? '<small class="gph-fx" data-gph-future>' + esc(f.fut) + '</small>' : '') +
        (f.cmp ? '<small class="gph-fd" data-gph-cmp>' + esc(f.cmp) + '</small>' : '') + (f.when ? '<small class="gph-fd gph-fw" data-gph-detail>' + esc(f.when) + '</small>' : '') + '</span>';
      return f.dim ? '<a class="gph-f" href="#/prism/' + esc(md.id) + '/' + f.dim.toLowerCase() + '" data-gph-dim="' + f.dim + '" data-gph-fig>' + inner + '</a>' : '<div class="gph-f" data-gph-fig>' + inner + '</div>';
    };
    return '<div class="gph-strip gph-strip--' + figs.length + '" data-gph-strip>' + figs.map(card).join('') + '</div>';
  }
  function modeHtml(mode) {
    const b = (k) => '<button type="button" data-gph-mode="' + k + '" aria-pressed="' + (k === mode) + '">' + esc(UI.modes[k]) + '</button>';
    return '<div class="gph-modes"><div class="gph-seg" role="group" aria-label="' + esc(UI.modeLabel) + '">' + b('simple') + b('detailed') + '</div><p class="gph-hint" data-gph-hint>' + esc(UI.hint[mode]) + '</p></div>';
  }
  // the pentagon: fixed geometry (all corners at radius RAD), so it measures nothing
  const PG = { w: 260, h: 250, cx: 130, cy: 132, rad: 96 };
  const vert = (i, rr) => { const a = (-90 + i * 72) * Math.PI / 180; return { x: +(PG.cx + rr * Math.cos(a)).toFixed(1), y: +(PG.cy + rr * Math.sin(a)).toFixed(1) }; };
  const ring = (rr) => KEYS.map((_, i) => { const p = vert(i, rr); return p.x + ',' + p.y; }).join(' ');
  const mark = (state, cx, cy, r) => state === 'cmp' ? '<circle class="gph-mk gph-mk--cmp" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>' :
    state === 'fact' ? '<circle class="gph-mk gph-mk--fact" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>' : '<circle class="gph-mk gph-mk--none" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>';
  const markSvg = (state) => '<svg class="gph-lm" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' + mark(state, 8, 8, 5.5) + '</svg>';
  function pentagonSvg(cs) {
    const sp = KEYS.map((_, i) => { const p = vert(i, PG.rad); return '<line x1="' + PG.cx + '" y1="' + PG.cy + '" x2="' + p.x + '" y2="' + p.y + '"/>'; }).join('');
    const vs = cs.map((c, i) => { const p = vert(i, PG.rad), l = vert(i, PG.rad + 20); return '<g class="gph-vx" style="--i:' + i + '">' + (c.state === 'cmp' ? '<circle class="gph-halo" cx="' + p.x + '" cy="' + p.y + '" r="11"/>' : '') + mark(c.state, p.x, p.y, 6) +
      '<text x="' + l.x + '" y="' + (l.y + 5) + '" text-anchor="middle" class="gph-vl">' + c.key + '</text></g>'; }).join('');
    return '<svg class="gph-pg" viewBox="0 0 ' + PG.w + ' ' + PG.h + '" role="img" aria-label="Fixed five-cornered PRISM shape: Price Position, Resale Potential, Infrastructure and Catalysts, Supply Pressure, Market Demand">' +
      '<defs><radialGradient id="gphGlow" cx="50%" cy="52%" r="50%"><stop offset="0" stop-color="#C9B574" stop-opacity=".42"/><stop offset=".62" stop-color="#CBD9F0" stop-opacity=".35"/><stop offset="1" stop-color="#CBD9F0" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="gphFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EEF3FB"/><stop offset=".5" stop-color="#B7C8E6"/><stop offset="1" stop-color="#5E7DB4"/></linearGradient></defs>' +
      '<ellipse class="gph-glow" cx="' + PG.cx + '" cy="' + PG.cy + '" rx="128" ry="120" fill="url(#gphGlow)"/>' +
      '<g class="gph-shape"><polygon class="gph-poly" points="' + ring(PG.rad) + '" fill="url(#gphFill)"/><polygon class="gph-in" points="' + ring(PG.rad * 0.66) + '"/><polygon class="gph-in" points="' + ring(PG.rad * 0.33) + '"/><g class="gph-sp">' + sp + '</g>' +
      '<text x="' + PG.cx + '" y="' + (PG.cy + 4) + '" text-anchor="middle" class="gph-pt">PRISM</text></g>' + vs + '</svg>';
  }
  function glanceHtml(md, cs) {
    const row = (c) => '<li><a class="gph-row gph-row--' + c.state + '" href="#/prism/' + esc(md.id) + '/' + c.key.toLowerCase() + '" data-gph-dim="' + c.key + '" data-gph-corner="' + c.key + '" data-gph-state="' + c.state + '">' + markSvg(c.state) +
      '<span class="gph-rk" aria-hidden="true">' + c.key + '</span><span class="gph-rt"><b>' + esc(c.name) + '</b><span class="gph-rw">' + esc(c.word) + '</span>' + (c.fig ? '<small>' + esc(c.fig) + '</small>' : '') + '</span><i class="gph-rc" aria-hidden="true">›</i></a></li>';
    const used = ['cmp', 'fact', 'none'].filter((s) => cs.some((c) => c.state === s));
    return '<section class="gph-glance" data-gph-glance aria-labelledby="gphGlH"><div class="gph-gh"><h2 id="gphGlH">' + esc(UI.glance) + '</h2><p>' + esc(UI.glanceSub) + '</p></div>' +
      '<div class="gph-gb"><div class="gph-pgw">' + pentagonSvg(cs) + '</div><ul class="gph-rows">' + cs.map(row).join('') + '</ul></div>' +
      '<p class="gph-leg">' + used.map((s) => '<span>' + markSvg(s) + esc(UI.legend[s]) + '</span>').join('') + '</p><p class="gph-shapen">' + esc(UI.shape) + '</p></section>';
  }

  /* ---------------------------------------------------------------- browser */
  const store = { get: (k) => { try { return root.localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { root.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } } };
  const MODE_KEY = 'gw.prism.mode';
  const ss = { get: (k) => { try { return root.sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { root.sessionStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } } };
  const json = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  function mount(app, md, o) {
    o = o || {};
    const G = root.GW_PRISM, H = root.GW_HOME, LOC = root.GW_LOC;
    if (!G || !md || md.mode !== 'profile' || !md.v11 || !md.v11.profile) return null;
    const page = app.querySelector('.gwp-page[data-gwp-page="' + md.id + '"][data-gwp-mode="profile"]');
    if (!page || page.querySelector('[data-gph]')) return null;
    const rt = o.root || '../', op = openingOf(G, md), figs = stripOf(op), cs = cornersOf(G, md, op);
    let mode = o.dim ? 'detailed' : (store.get(MODE_KEY) === 'detailed' ? 'detailed' : 'simple');
    // the header: the crumb stays; the views (tabs) and the actions share one row; the name and its facts move into the hero
    const head = page.querySelector('.gwp-head'), h1 = head.querySelector('.gwp-h1'), meta = head.querySelector('.gwp-meta'), tabs = head.querySelector('.gwp-tabs'), acts = head.querySelector('.gwp-acts');
    const row = document.createElement('div'); row.className = 'gph-nav'; if (tabs) row.appendChild(tabs); if (acts) row.appendChild(acts); head.appendChild(row);
    const sum = page.querySelector('#gwp-sum'); if (sum) { sum.removeAttribute('id'); sum.classList.add('gph-was'); }
    const wrap = page.querySelectorAll('.gwp-wrap')[1] || page.querySelector('.gwp-wrap');
    const box = document.createElement('div'); box.className = 'gph-box';
    box.innerHTML = heroHtml(md, op, { root: rt, attr: H ? H.ATTR : '' }) + stripHtml(md, figs) + modeHtml(mode) + glanceHtml(md, cs);
    wrap.insertBefore(box, wrap.firstChild);
    const idBox = box.querySelector('[data-gph-id]'); if (h1) idBox.appendChild(h1); if (meta) idBox.appendChild(meta);
    // summary first (Master Planning, 4 Nov 2026): the quick read's one warning follows its headline and figures, so it moves up with them
    const warn = page.querySelector('.gwp-qr-top [data-gwp-warn]'); if (warn && figs.length) box.insertBefore(warn, box.querySelector('.gph-modes'));
    // Detailed: the section bar (Summary, P, R, I, S, M, Sources) follows the hero, so the answer stays on the first screen; it sticks from there
    const bar = page.querySelector('[data-gwp-bar]'); if (bar) box.insertAdjacentElement('afterend', bar);
    page.classList.add('gph-on'); page.setAttribute('data-gph-figs', String(figs.length));
    if (figs.length) page.classList.add('gph-has-strip');
    page.setAttribute('data-gph-opening', op ? op.kind : 'none');
    // modes
    const setMode = (m, keep) => {
      mode = m; page.setAttribute('data-gph-mode', m);
      box.querySelectorAll('[data-gph-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gphMode === m)));
      box.querySelector('[data-gph-hint]').textContent = UI.hint[m];
      if (!keep) store.set(MODE_KEY, m);
    };
    setMode(mode, true);
    box.querySelectorAll('[data-gph-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.gphMode)));
    // a figure or a corner: its dimension, opened, in Detailed
    const navH = () => { const bar = page.querySelector('[data-gwp-bar]'); return (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gw-navh')) || 58) + (bar ? bar.offsetHeight : 0) + 10; };
    const openDim = (k) => {
      if (mode !== 'detailed') setMode('detailed');
      const b = page.querySelector('[data-gwp-toggle="' + k + '"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click();
      const t = page.querySelector('#gwp-' + k); if (t) requestAnimationFrame(() => root.scrollTo({ top: t.getBoundingClientRect().top + root.pageYOffset - navH(), behavior: reduced() ? 'auto' : 'smooth' }));
    };
    box.querySelectorAll('a[data-gph-dim]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); openDim(a.dataset.gphDim); }));
    // the pentagon draws itself once, when it comes into view (not at all under reduced motion)
    const gl = box.querySelector('[data-gph-glance]');
    if (gl && !reduced() && 'IntersectionObserver' in root) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); gl.classList.add('in'); } }, { threshold: 0.3 }); io.observe(gl); }
    // the map
    const hero = box.querySelector('[data-gph]');
    if (!H || !LOC) { hero.classList.add('gph--plain'); return { op, figs, cs }; }
    Promise.all([json(rt + 'data/map/places.json'), json(rt + 'data/map/amen.json')]).then((a) => {
      if (!hero.isConnected || (o.still && !o.still())) return;
      const here = LOC.position(a[0], md.id);
      if (!here) { hero.classList.add('gph--plain'); return; }
      const card = (op && op.x && op.x.cards.find((c) => c.dim === 'I')) || null, mrt = lineOf(md.v11, 'I', 'infrastructure.mrt');
      const st = mrt && mrt.status === 'available' && mrt.data && Array.isArray(mrt.data.stations) ? mrt.data.stations[0] : null;
      const sta = st && a[1] && Array.isArray(a[1].stations) ? a[1].stations.find((s) => s.n === st.name) : null;   // the station the report names, never another
      hero.querySelector('[data-gph-onmap]').hidden = false;
      // the flight plays once per visit to a development; coming back (from Property Data, Back) shows the settled map, with Replay
      const key = 'gw.prism.flown:' + md.id, flown = ss.get(key) === '1'; ss.set(key, '1');
      drawMap(hero, H, { here, sta, label: card ? card.v : '', name: md.name, places: a[0], id: md.id, fly: !flown });
    });
    return { op, figs, cs };
  }
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function drawMap(hero, H, d) {
    const box = hero.querySelector('[data-gph-map]'), L14 = box.querySelector('[data-gph-l="14"]'), L16 = box.querySelector('[data-gph-l="16"]'), ov = box.querySelector('[data-gph-ov]'), svg = box.querySelector('[data-gph-svg]');
    const attr = hero.querySelector('[data-gph-attr]'), note = hero.querySelector('[data-gph-note]'), replay = hero.querySelector('[data-gph-replay]');
    let timers = [], raf = 0, lastW = 0, failed = 0, loaded = 0, total = 0;
    const clear = () => { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); };
    function layer(el, z, w, h, a, sMin) {
      const c = projAt(H, d.here.lat, d.here.lon, z); el.innerHTML = ''; el.style.left = a.x + 'px'; el.style.top = a.y + 'px';
      tileRange(c, a.x, a.y, w, h, sMin).forEach((t) => {
        const im = new Image(); im.alt = ''; im.decoding = 'async'; im.draggable = false; total++;
        im.onload = () => { loaded++; im.classList.add('ok'); if (loaded === 1) box.setAttribute('data-tiles', 'loaded'); };
        im.onerror = () => { failed++; if (failed === total) { box.setAttribute('data-tiles', 'failed'); note.hidden = false; } };
        im.src = H.TILES.replace('{z}', z).replace('{x}', t.x).replace('{y}', t.y); im.style.left = t.left + 'px'; im.style.top = t.top + 'px'; el.appendChild(im);
      });
      return c;
    }
    function build(play) {
      clear(); failed = loaded = total = 0; note.hidden = true; box.removeAttribute('data-tiles');
      const w = box.clientWidth, h = box.clientHeight; lastW = w; if (!w || !h) return;
      // the free band: below the name (and, on a desktop, the opening beside it), above the map's bottom edge (the figures and buttons)
      const bt = box.getBoundingClientRect().top, below = (sel) => { const e = hero.querySelector(sel); if (!e) return 0; const r = e.getBoundingClientRect(); return r.height && r.top - bt < h / 2 ? r.bottom - bt : 0; };
      const band = { top: Math.max(below('[data-gph-id]'), below('.gph-op')) + 8, bottom: h - (w >= 720 ? 64 : 34) };
      const p0 = projAt(H, d.here.lat, d.here.lon, 16), exs = d.sta && Array.isArray(d.sta.ex) ? d.sta.ex.map((e) => { const q = projAt(H, e[0], e[1], 16); return { x: q.x - p0.x, y: q.y - p0.y }; }) : [];
      const near0 = exs.sort((p, q) => Math.hypot(p.x, p.y) - Math.hypot(q.x, q.y))[0] || null;
      const a = anchor(w, band, near0), rm = reduced(), fly = play && !rm;
      const c16 = layer(L16, 16, w, h, a, fly ? FLIGHT.sMinTo : 1);
      if (fly) layer(L14, 14, w, h, a, 1); else L14.innerHTML = '';
      attr.hidden = false;
      // the overlay, in the final frame's pixels (zoom 16, scale 1)
      const at = (lat, lon) => { const p = projAt(H, lat, lon, 16); return { x: Math.round(a.x + p.x - c16.x), y: Math.round(a.y + p.y - c16.y) }; };
      const inside = (p, m) => p.x > m && p.x < w - m && p.y > band.top + m && p.y < band.bottom - m;
      ov.innerHTML = ''; svg.innerHTML = ''; svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      const pin = (cls, html, p) => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; e.style.left = p.x + 'px'; e.style.top = p.y + 'px'; ov.appendChild(e); return e; };
      // nearby developments (the Map's own list), as small dots: the nearest 24 in view
      const F = d.places && d.places.fields, rows = F ? d.places.rows : [], ii = F ? F.indexOf('id') : 0, la = F ? F.indexOf('lat') : 0, lo = F ? F.indexOf('lon') : 0;
      const dots = rows.filter((r) => r[ii] !== d.id && r[la] != null).map((r) => at(r[la], r[lo])).filter((p) => inside(p, 6)).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y)).slice(0, 24);
      const dotEls = dots.map((p) => pin('gph-dot', '', p));
      // the station the report names: its nearest exit in the frame, a straight line from the development (the report's distance is a straight line)
      let ex = null; if (d.sta && Array.isArray(d.sta.ex) && d.sta.ex.length) ex = d.sta.ex.map((e) => at(e[0], e[1])).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
      let line = null, stEl = null;
      if (ex && inside(ex, 14)) {
        line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        [['x1', a.x], ['y1', a.y], ['x2', ex.x], ['y2', ex.y]].forEach(([k, v]) => line.setAttribute(k, v));
        const len = Math.hypot(ex.x - a.x, ex.y - a.y); line.setAttribute('class', 'gph-line'); line.style.strokeDasharray = len; line.style.strokeDashoffset = fly ? len : 0; svg.appendChild(line);
        const left = ex.x > w - 190;
        stEl = pin('gph-st' + (left ? ' gph-st--l' : ''), '<i></i><span><b>' + esc(d.sta.n) + '</b>' + (d.label ? '<small>' + esc(d.label) + '</small>' : '') + '</span>', ex);
      }
      const me = pin('gph-me', '<i class="gph-ring"></i><i class="gph-pt"></i><span>' + esc(d.name) + '</span>', a);
      // the station's label never covers the development's: try the other side, then below the exit, else the marker alone
      if (stEl) {
        const hit = () => { const p = me.querySelector('span').getBoundingClientRect(), q = stEl.querySelector('span').getBoundingClientRect(); return !(q.right < p.left - 4 || q.left > p.right + 4 || q.bottom < p.top - 4 || q.top > p.bottom + 4); };
        if (hit()) stEl.classList.toggle('gph-st--l');
        if (hit()) { stEl.classList.remove('gph-st--l'); stEl.classList.add('gph-st--b'); }
        if (hit()) stEl.classList.add('gph-st--x');
      }
      const show = () => { [me, stEl].concat(dotEls).forEach((e, i) => { if (e) e.classList.add('on'); }); if (line) line.style.strokeDashoffset = 0; replay.hidden = false; box.setAttribute('data-flight', 'done'); };
      if (!fly) { L16.style.transform = 'scale(1)'; L16.style.opacity = 1; L14.style.opacity = 0; hero.classList.add('gph--still'); show(); return; }
      hero.classList.remove('gph--still'); box.setAttribute('data-flight', 'flying'); replay.hidden = true;
      const t0 = performance.now();
      const step = (now) => { const t = Math.min(1, (now - t0) / FLIGHT.ms), f = frame(t);
        L14.style.transform = 'scale(' + f.s14 + ')'; L14.style.opacity = f.o14; L16.style.transform = 'scale(' + f.s16 + ')'; L16.style.opacity = f.o16;
        if (t < 1) raf = requestAnimationFrame(step); else { L14.innerHTML = ''; } };
      raf = requestAnimationFrame(step);
      timers.push(setTimeout(() => { me.classList.add('on'); }, FLIGHT.ms));
      timers.push(setTimeout(() => { if (line) line.style.strokeDashoffset = 0; if (stEl) stEl.classList.add('on'); }, FLIGHT.ms + 300));
      timers.push(setTimeout(() => { dotEls.forEach((e) => e.classList.add('on')); replay.hidden = false; box.setAttribute('data-flight', 'done'); }, FLIGHT.ms + 700));
    }
    build(d.fly !== false);
    replay.addEventListener('click', () => build(true));
    let rz = 0; const onResize = () => { if (!hero.isConnected) { root.removeEventListener('resize', onResize); return; } if (box.clientWidth === lastW) return; clearTimeout(rz); rz = setTimeout(() => build(false), 200); };
    root.addEventListener('resize', onResize);
  }

  return { VERSION, UI, KEYS, ORDER, FLIGHT, PG, openingOf, stripOf, cornersOf, projAt, tileRange, frame, anchor, vert, heroHtml, stripHtml, glanceHtml, modeHtml, mount };
});
