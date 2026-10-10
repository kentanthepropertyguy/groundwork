/* ==========================================================================
   GROUNDWORK — What's my home worth? (R1, Ken 9 Oct 2026)
   Recent sales of homes like yours, from official records. Never a valuation, never a single estimated figure.
     HDB:    HDB resale records (data.gov.sg, Open Data Licence). Your block and flat type over the last 24 months;
             your street when your block has fewer than 3 sales; otherwise we say there are too few.
     Condo:  your development in Research (URA records by size), which already does this well.
     Landed: URA records for your street and house type: the last 3 years, or the last 5 if there are fewer than 3.
             Sales are listed with their land price per sq ft and the reasons one figure would mislead.
   Data: data/value/hdb/index.json + t/<town>.json, data/value/landed/index.json + d/<district>.json (built by src/value/build.js).
   What the visitor picks is kept for this browser tab only (GWJ.ctx), so the moving path doesn't ask again.
   It is never sent to analytics; WhatsApp messages carry the home and the plan only, never finances.
   UMD: window.GWV in the browser; Node uses the same functions for tests and to write the page.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GWV = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PHONE = '6590908898', wa = (msg) => 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(msg);
  const HDB_INFO = 'https://www.hdb.gov.sg/cs/infoweb/residential/buying-a-flat/finding-a-flat';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ym = (n) => MON[n % 100 - 1] + ' ' + Math.floor(n / 100);
  const ymAdd = (n, k) => { let y = Math.floor(n / 100), m = n % 100 + k; while (m < 1) { m += 12; y -= 1; } while (m > 12) { m -= 12; y += 1; } return y * 100 + m; };
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const title = (s) => String(s).toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (x, a, b) => a + b.toUpperCase());
  const flatLabel = (t) => /^\d ROOM$/.test(t) ? t[0] + '-room' : title(t);

  /* ---------------- pure: HDB comparable resales ---------------- */
  const HDB_MIN_BLOCK = 3, HDB_MIN_STREET = 5, MID_MIN = 4, STALE_MONTHS = 6;
  // T: a town file. Returns the level used ('block' | 'street' | 'thin' | 'none') and a description of those sales only.
  function hdbComps(T, block, s, t) {
    const R = T.rows, blk = R.filter((r) => r[1] === block && r[2] === s && r[3] === t), st = R.filter((r) => r[2] === s && r[3] === t);
    let level, rows;
    if (blk.length >= HDB_MIN_BLOCK) { level = 'block'; rows = blk; } else if (st.length >= HDB_MIN_STREET) { level = 'street'; rows = st; } else { level = st.length ? 'thin' : 'none'; rows = st; }
    const d = describe(rows, { level, blockN: blk.length, streetN: st.length, latest: T.latestMonth, from: T.windowFrom, price: 9, range: level === 'block' || level === 'street' });
    // A4-11: every sale in the block is old. When the street has more, and more recent, resales of the same flat type, show those too.
    if (level === 'block' && d.stale && st.length >= HDB_MIN_STREET && st.length > blk.length) { const s2 = describe(st, { level: 'street', latest: T.latestMonth, from: T.windowFrom, price: 9, range: true }); if (!s2.stale) d.street = s2; }
    return d;
  }
  function describe(rows, o) {
    const P = rows.map((r) => r[o.price]).sort((a, b) => a - b), d = Object.assign({ n: rows.length, rows }, o);
    if (rows.length) { d.newest = rows.reduce((a, r) => Math.max(a, r[0]), 0); d.oldest = rows.reduce((a, r) => Math.min(a, r[0]), 999999); d.stale = d.newest < ymAdd(o.latest, -STALE_MONTHS); }
    if (o.range && rows.length) {
      d.lo = P[0]; d.hi = P[P.length - 1];
      // A4-10: the middle group leaves out the same number of sales at each end (as close to a quarter as whole sales allow), and its
      // edges are actual sale prices, never in-between figures. It is labelled with its count ("the middle 4 of 6"), not "half".
      if (rows.length >= MID_MIN && o.mid !== false) { const k = Math.floor((P.length + 1) / 4); d.q1 = P[k]; d.q3 = P[P.length - 1 - k]; d.midN = P.length - 2 * k; }
    }
    return d;
  }
  const normBlock = (q) => String(q || '').toUpperCase().replace(/^\s*(BLK|BLOCK)\.?\s*/, '').replace(/\s+/g, '');
  function blockMatches(T, q, max) {
    const b = normBlock(q); if (!b) return [];
    const exact = T.blocks.filter((x) => x[0] === b), starts = T.blocks.filter((x) => x[0] !== b && x[0].indexOf(b) === 0);
    return exact.concat(starts).slice(0, max || 8);
  }
  // Flat types to offer for a block: those sold in the block, then the rest sold on the street, in HDB's order.
  function hdbTypes(T, block, s) {
    const inBlock = new Set(), onStreet = new Set();
    T.rows.forEach((r) => { if (r[2] === s) { onStreet.add(r[3]); if (r[1] === block) inBlock.add(r[3]); } });
    const all = [...new Set([...inBlock, ...onStreet])].sort((a, b) => a - b);
    return { all: all.length ? all : [1, 2, 3, 4, 5], inBlock: [...inBlock].sort((a, b) => a - b) };
  }

  /* ---------------- pure: landed sales on a street ---------------- */
  const LANDED_YEARS = 3, LANDED_MIN = 3;
  // D: a district file. type: 'T','S','D','ST','SS','SD'. latest: the newest month in the URA index.
  function landedComps(D, s, type, latest, first) {
    const all = D.rows.filter((r) => r[1] === s && r[2] === type), from = ymAdd(latest, -(LANDED_YEARS * 12 - 1));
    let rows = all.filter((r) => r[0] >= from), win = 'recent';
    if (rows.length < LANDED_MIN && all.length > rows.length) { rows = all; win = 'all'; }
    const d = describe(rows, { level: 'street', latest, from: win === 'all' ? first : from, price: 4, range: rows.length >= 2, mid: false, win });
    if (rows.length) { const psf = rows.map((r) => r[4] / r[3]).sort((a, b) => a - b); d.psfLo = psf[0]; d.psfHi = psf[psf.length - 1]; }
    return d;
  }
  // A4-14: URA records some streets under more than one district (East Coast Terrace appears in four). Say so, so the visitor picks
  // the district on their own address; a record in an unusual district may be coded that way in the source.
  function splitNote(I, shown) {
    const names = [...new Set(shown.map((x) => x[0]))].filter((n) => I.streets.filter((x) => x[0] === n).length > 1);
    return names.length ? '<p class="gw-vx-why" data-vx-split>' + names.map((n) => esc(title(n)) + ' is recorded in ' + I.streets.filter((x) => x[0] === n).length + ' districts (' + I.streets.filter((x) => x[0] === n).map((x) => 'D' + esc(x[1])).join(', ') + ')').join('; ') + '. Pick the district on your address; a few records may sit in an unusual district in URA’s data.</p>' : '';
  }
  function landedTypes(D, s) { const c = {}; D.rows.forEach((r) => { if (r[1] === s) c[r[2]] = (c[r[2]] || 0) + 1; }); return c; }
  const ABBR = { ST: 'STREET', RD: 'ROAD', AVE: 'AVENUE', AV: 'AVENUE', DR: 'DRIVE', CRES: 'CRESCENT', LOR: 'LORONG', JLN: 'JALAN', TER: 'TERRACE', TCE: 'TERRACE', PL: 'PLACE', CL: 'CLOSE', GDN: 'GARDEN', GDNS: 'GARDENS', HTS: 'HEIGHTS', PK: 'PARK', UPP: 'UPPER', BT: 'BUKIT', LN: 'LANE', GR: 'GROVE', CTRL: 'CENTRAL', E: 'EAST', W: 'WEST', N: 'NORTH', S: 'SOUTH' };
  const normStreet = (q) => String(q || '').toUpperCase().replace(/[.,']/g, '').replace(/\s+/g, ' ').trim();
  function streetMatches(I, q, max) {
    const a = normStreet(q); if (a.length < 2) return [];
    const b = a.split(' ').map((w) => ABBR[w] || w).join(' ');
    const score = (name) => { const n = normStreet(name); for (const x of [a, b]) { if (n.indexOf(x) === 0) return 3; if (n.indexOf(' ' + x) >= 0) return 2; } return n.indexOf(a) >= 0 || n.indexOf(b) >= 0 ? 1 : 0; };
    return I.streets.map((x) => [score(x[0]), x]).filter((x) => x[0]).sort((p, q2) => q2[0] - p[0] || q2[1][2] - p[1][2]).slice(0, max || 6).map((x) => x[1]);
  }
  const LTYPE = { T: 'Terrace', S: 'Semi-detached', D: 'Detached', ST: 'Strata terrace', SS: 'Strata semi-detached', SD: 'Strata detached' };
  const LHOUSE = { T: 'a terrace house', S: 'a semi-detached house', D: 'a detached house', ST: 'a strata terrace house', SS: 'a strata semi-detached house', SD: 'a strata detached house' };
  const tenure = (t) => { if (t === 'FH') return 'Freehold'; const [y, s] = String(t).split('|'); if (!y) return '—'; return +y >= 900 ? y + '-yr' : y + '-yr' + (s ? ' from ' + s : ''); };

  /* ---------------- messages (home and plan only; never finances) ---------------- */
  const hdbMsg = (c) => 'Hi Ken, I own a ' + flatLabel(c.flatType) + ' HDB flat at Blk ' + c.block + ' ' + title(c.street) + '. I’ve looked at recent resales on Groundwork and would like your view on what mine could fetch.';
  const landedMsg = (c) => 'Hi Ken, I own ' + LHOUSE[c.ltype] + ' on ' + title(c.street) + '. I’ve looked at recent sales on Groundwork and would like a personalised assessment of my home.';
  const condoMsg = (dev) => 'Hi Ken, I own ' + (dev ? 'a unit at ' + dev : 'a private condo') + ' and I’d like a view on what it could sell for.';

  /* ---------------- HTML ---------------- */
  const chip = (attr, v, t, on) => '<button type="button" class="gw-chip" ' + attr + '="' + esc(v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + t + '</button>';
  // A6-03: the link holds only Ken's chat address. The message, which names the visitor's home, is opened on tap by gw-wa.js
  // (window.open), so an address that analytics can read never carries it. Without that script the chat opens without the text.
  const kenCta = (o) => '<div class="gw-vx-ken"><div><b>' + esc(o.head) + '</b><p>' + esc(o.text) + '</p></div><a class="gw-btn wa" href="https://wa.me/' + PHONE + '" target="_blank" rel="noopener" data-gw-wa="' + o.ctx + '">' + esc(o.label) + '</a><p class="gw-fine">Optional · your message names your home, nothing about your finances.</p></div>';
  const moveNext = (r) => '<a class="gw-vx-next" href="' + r + 'journey/#move" data-gw-go="move"><b>Thinking of moving?</b><span>Work out what you could afford next, and what it buys ›</span></a>';
  // R2.1: buyers use the same resales to check an asking price (gw-ask.js; loaded on the page, required in Node).
  const ASKM = () => root.GWASK || (typeof require === 'function' ? (() => { try { return require('./gw-ask.js'); } catch (e) { return null; } })() : null);
  const NAVM = () => root.GWN || (typeof require === 'function' ? require('./gw-nav.js') : null);
  const fig = (label, val) => '<div><span>' + label + '</span><b>' + val + '</b></div>';
  function table(head, rows, more, all) {
    const LIM = all ? Infinity : 10;
    return '<div class="gw-vx-tw"><table class="gw-vx-t"><thead><tr>' + head.map((h) => '<th scope="col"' + (h[1] ? ' class="r"' : '') + '>' + h[0] + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((r, i) => '<tr' + (r.cls || i >= LIM ? ' class="' + [r.cls, i >= LIM ? 'more' : ''].filter(Boolean).join(' ') + '"' : '') + (i >= LIM ? ' hidden' : '') + '>' + r.cells.map((c, j) => '<td' + (head[j][1] ? ' class="r"' : '') + '>' + c + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div>' + (rows.length > LIM ? '<button type="button" class="gw-vx-more" data-vx-more>Show all ' + rows.length + ' ' + (more || 'sales') + '</button>' : '');
  }

  // HDB result
  // R2.1: each resale as a dot on one price line, the middle half shaded. Drawn from the same sales as the table, nothing estimated.
  function dotsSvg(d, c, st) {
    const S = d.rows.map((x) => ({ p: x[9], you: st && x[1] === c.block })).sort((p, q) => p.p - q.p);
    const lo = S[0].p, hi = S[S.length - 1].p, pad = (hi - lo) * 0.06 || hi * 0.03, a = lo - pad, b = hi + pad, W = 320, X = (v) => (v - a) / (b - a) * W;
    // Dots stack where prices are close. Many sales (busy streets) get smaller dots, and a tall stack is compressed so the chart
    // never grows past about ten rows; every sale is still drawn.
    const R = S.length > 40 ? 3 : 5, gx = 2 * R + 1, CAP = 10;
    const placed = []; S.forEach((o) => { o.x = X(o.p); let l = 0; while (placed.some((q) => q.l === l && Math.abs(q.x - o.x) < gx)) l++; o.l = l; placed.push(o); });
    const rows = Math.max.apply(null, S.map((o) => o.l)) + 1, dy = rows > CAP ? CAP * (2 * R + 2) / rows : 2 * R + 2;
    const top = 8, base = top + Math.min(rows, CAP) * (2 * R + 2) + 4, H = base + 26, mine = st && S.some((o) => o.you);
    let g = '';
    if (d.q1 !== undefined && d.q3 !== undefined) g += '<rect x="' + X(d.q1).toFixed(1) + '" y="' + (top - 4) + '" width="' + Math.max(3, X(d.q3) - X(d.q1)).toFixed(1) + '" height="' + (base - top + 8) + '" rx="6" fill="#EEF4FC"/>';
    g += '<line x1="' + X(lo).toFixed(1) + '" x2="' + X(hi).toFixed(1) + '" y1="' + (base + 2) + '" y2="' + (base + 2) + '" stroke="#C9CDD8" stroke-width="2" stroke-linecap="round"/>';
    S.forEach((o) => { g += '<circle cx="' + o.x.toFixed(1) + '" cy="' + (base - R + 1 - o.l * dy).toFixed(1) + '" r="' + R + '" fill="' + (mine ? (o.you ? '#16213E' : '#878DA3') : '#16213E') + '" stroke="#fff" stroke-width="' + (R > 3 ? 1.5 : 1) + '"/>'; });
    const lx = X(lo), hx = X(hi);
    g += '<text x="' + lx.toFixed(1) + '" y="' + (base + 20) + '" font-size="11.5" fill="#6B7280" text-anchor="' + (lx < 40 ? 'start' : 'middle') + '">' + esc(money(lo)) + '</text>';
    if (hi !== lo) g += '<text x="' + hx.toFixed(1) + '" y="' + (base + 20) + '" font-size="11.5" fill="#6B7280" text-anchor="' + (hx > W - 40 ? 'end' : 'middle') + '">' + esc(money(hi)) + '</text>';
    return '<svg class="gw-vx-dots" viewBox="-6 0 ' + (W + 12) + ' ' + H + '" role="img" aria-label="' + esc(S.length + ' resales from ' + money(lo) + ' to ' + money(hi) + (d.q1 !== undefined ? ', the middle ' + d.midN + ' from ' + money(d.q1) + ' to ' + money(d.q3) : '')) + '">' + g + '</svg>' +
      '<p class="gw-ask-leg"><span><i class="d"></i>' + (mine ? 'Your block' : 'Each dot is one resale') + '</span>' + (mine ? '<span><i class="d o"></i>Elsewhere on the street</span>' : '') + (d.q1 !== undefined ? '<span><i class="h"></i>Middle ' + d.midN + ' of ' + d.n + '</span>' : '') + '</p>';
  }
  // HDB result. o.path: the visitor is on the "Upgrading from HDB" path, so the next step is offered here, not only at the top.
  function hdbResult(d, c, T, I, r, o) {
    o = o || {};
    const where = 'Blk ' + c.block + ' ' + title(c.street), ft = flatLabel(c.flatType), win = ym(I.windowFrom) + ' – ' + ym(I.latestMonth), st = d.level !== 'block';
    let h = '<div class="gw-vx-res" data-vx-level="' + d.level + '"><p class="gw-ex">' + esc(where) + ' · ' + esc(ft) + '</p>';
    if (d.level === 'block') h += '<h3>' + d.n + ' resales of ' + ft + ' flats in your block in the last 2 years</h3>';
    else if (d.level === 'street') h += '<h3>' + d.n + ' resales of ' + ft + ' flats on ' + esc(title(c.street)) + ' in the last 2 years</h3><p class="gw-vx-why">' + (d.blockN ? 'Only ' + d.blockN + ' in your block, so these are the sales on your street.' : 'None in your block, so these are the sales on your street.') + '</p>';
    else if (d.level === 'thin') h += '<h3>Only ' + d.n + ' resale' + (d.n === 1 ? '' : 's') + ' of ' + ft + ' flats on ' + esc(title(c.street)) + ' in the last 2 years</h3><p class="gw-vx-why">Too few for a fair range, so we list ' + (d.n === 1 ? 'it' : 'them') + ' without one.</p>';
    else h += '<h3>No resales of ' + ft + ' flats on ' + esc(title(c.street)) + ' in the last 2 years</h3><p class="gw-vx-why">HDB registered none from ' + win + '. Check the flat type, or ask Ken for a view.</p>';
    if (d.lo !== undefined) h += '<div class="gw-vx-sum"><span>Sold for</span><b>' + money(d.lo) + ' – ' + money(d.hi) + '</b>' + (d.q1 !== undefined ? '<small>The middle ' + d.midN + ' of ' + d.n + ' sold for ' + money(d.q1) + ' – ' + money(d.q3) + '</small>' : '') + '</div>' + dotsSvg(d, c, st);
    if (d.n) {
      const leases = [...new Set(d.rows.map((x) => x[7]))].sort(), areas = d.rows.map((x) => x[6]).sort((a, b) => a - b);
      h += '<p class="gw-fine">Registered ' + ym(d.oldest) + ' – ' + ym(d.newest) + ' · ' + (areas[0] === areas[areas.length - 1] ? areas[0] + ' sqm' : areas[0] + '–' + areas[areas.length - 1] + ' sqm') + ' · lease began ' + (leases.length === 1 ? leases[0] : leases[0] + '–' + leases[leases.length - 1]) + '</p>';
      if (d.stale) h += '<p class="gw-vx-warn">The most recent of these was registered in ' + ym(d.newest) + '. Prices may have moved since.</p>';
      if (d.street) { const s2 = d.street; h += '<p class="gw-vx-alt" data-vx-street-recent>More recent on ' + esc(title(c.street)) + ': ' + s2.n + ' resales of ' + ft + ' flats in the last 2 years, the latest registered ' + ym(s2.newest) + '. They sold for ' + money(s2.lo) + ' – ' + money(s2.hi) + (s2.q1 !== undefined ? '; the middle ' + s2.midN + ' of ' + s2.n + ' for ' + money(s2.q1) + ' – ' + money(s2.q3) : '') + '.</p>'; }
      const head = [['Registered'], ...(st ? [['Blk']] : []), ['Floor'], ['Sqm', 1], ['Price', 1]];
      const tbl = table(head, d.rows.map((x) => ({ cls: st && x[1] === c.block ? 'you' : '', cells: [ym(x[0]), ...(st ? [esc(x[1]) + (x[1] === c.block ? '<span class="gw-vh"> (your block)</span>' : '')] : []), x[4] + '–' + x[5], x[6], money(x[9])] })), 'sales', d.lo !== undefined);
      h += d.lo !== undefined ? '<details class="gw-vx-all"><summary>See all ' + d.n + ' sales</summary>' + tbl + '</details>' : tbl;
    }
    h += '<p class="gw-vx-note"><b>Past sales, not a valuation.</b> Floor, facing, condition and renovation can put your flat above or below these. HDB gives an official value only to a buyer, after an Option to Purchase.</p>';
    if (o.path) h += '<div class="gw-pathnext"><a class="gw-btn pri" href="' + r + 'tools/sale-proceeds/#hdb" data-gw-go="up-sale-proceeds">Next: your sale proceeds ›</a><span>Step 2 of 4 · the cash and CPF you’d have after selling</span></div>';
    if (d.lo !== undefined && d.n >= 3 && ASKM()) h += ASKM().panelHtml('hdb', { lo: d.lo, q1: d.q1, q3: d.q3, hi: d.hi, n: d.n, midN: d.midN, level: d.level, where, ft }, { title: 'Buying here? Check an asking price' });
    h += kenCta({ head: 'Want a view on your own flat?', text: 'Ken can tell you where yours might sit against these sales, and what would move it.', msg: hdbMsg(c), label: 'Ask Ken what mine could fetch', ctx: 'worth-hdb' });
    if (!o.path) h += moveNext(r);
    h += '<p class="gw-vx-src">HDB resale registrations ' + win + (I.latestMonth === +I.asOf.slice(0, 4) * 100 + +I.asOf.slice(5, 7) ? ' (' + MON[I.latestMonth % 100 - 1] + ' so far)' : '') + ', updated by HDB on ' + fmtDay(I.sourceUpdated) + '. Excludes resales that may not reflect the full market price, such as those between relatives. ' +
      '<a href="' + esc(I.source.url) + '" target="_blank" rel="noopener" data-gw-go="hdb-data">Check on data.gov.sg ›</a> · <a href="' + HDB_INFO + '" target="_blank" rel="noopener" data-gw-go="hdb-info">HDB’s resale information ›</a><br>' + esc(I.attribution) + ' Not endorsed by HDB.</p>';
    return h + '</div>';
  }
  function fmtDay(iso) { const [y, m, dd] = String(iso).slice(0, 10).split('-').map(Number); return dd + ' ' + MON[m - 1] + ' ' + y; }

  // Landed result
  const LIMITS = '<div class="gw-vx-limits"><b>Why we don’t put one figure on a landed home</b><ul>' +
    '<li>Land size and shape differ, even between neighbours.</li>' +
    '<li>The records show the land, not the house: its size, age, condition or whether it has been rebuilt.</li>' +
    '<li>Freehold and leasehold homes sell differently, as do leases with different years left.</li>' +
    '<li>Where it sits on the street, its facing and what the planning rules let you build all move the price.</li>' +
    '<li>Few landed homes sell each year, so a handful of sales can swing the range.</li></ul></div>';
  function landedResult(d, c, I, r) {
    const strata = c.ltype.length === 2, T = LTYPE[c.ltype];
    const span = d.win === 'all' ? 'since ' + ym(I.firstMonth) : 'in the last 3 years';
    let h = '<div class="gw-vx-res" data-vx-win="' + d.win + '"><p class="gw-ex">' + esc(title(c.street)) + ' · District ' + esc(c.district) + ' · ' + esc(T) + '</p>';
    h += '<h3>' + d.n + ' ' + T.toLowerCase() + ' sale' + (d.n === 1 ? '' : 's') + ' on ' + esc(title(c.street)) + ' ' + span + '</h3>';
    if (d.win === 'all') h += '<p class="gw-vx-why">Fewer than ' + LANDED_MIN + ' in the last 3 years, so we show every sale since ' + ym(I.firstMonth) + '.</p>';
    if (d.n >= 2) h += '<div class="gw-vx-figs">' + fig('Sold for', money(d.lo) + ' – ' + money(d.hi)) + fig((strata ? 'Per sq ft of strata area' : 'Per sq ft of land'), money(d.psfLo) + ' – ' + money(d.psfHi)) + '</div>';
    if (d.stale) h += '<p class="gw-vx-warn">The most recent of these was in ' + ym(d.newest) + '. Prices may have moved since.</p>';
    const ST = { 1: 'new sale', 2: 'sub-sale' };
    h += table([['Date · tenure'], [(strata ? 'Strata' : 'Land') + ' sq ft', 1], ['Price · psf', 1]], d.rows.map((x) => ({ cells: [ym(x[0]) + (ST[x[6]] ? ' <i>' + ST[x[6]] + '</i>' : '') + '<small>' + tenure(x[5]) + '</small>', x[3].toLocaleString('en-US'), money(x[4]) + '<small>' + money(x[4] / x[3]) + ' psf</small>'] })));
    h += LIMITS;
    h += kenCta({ head: 'A personal assessment of your home', text: 'Ken looks at these sales against your land, your house and what sets it apart, and talks you through it.', msg: landedMsg(c), label: 'Ask Ken for an assessment', ctx: 'worth-landed' });
    h += moveNext(r);
    h += '<p class="gw-vx-src">URA private residential transaction records, ' + ym(I.firstMonth) + ' – ' + ym(I.latestMonth) + '. Single-house sales only' + (strata ? '; for cluster (strata) houses the area is the strata area URA records' : '; area is land area') + '. A sale URA lists more than once, identically, is counted once. Not endorsed by URA.</p>';
    return h + '</div>';
  }

  // The page body (written at build time; gw-value.js brings it to life). r: path to the site root.
  function pageHtml(r) {
    return '<section class="gw-panel gw-vx" data-gw-value aria-label="Your home">' +
      '<div class="gw-q"><span class="l">What kind of home?</span><div class="gw-chips" role="group" aria-label="What kind of home?">' + chip('data-vx-type', 'hdb', 'HDB flat') + chip('data-vx-type', 'condo', 'Condo or apartment') + chip('data-vx-type', 'landed', 'Landed home') + '</div></div>' +
      // HDB
      '<div class="gw-vx-pane" data-vx-pane="hdb" hidden><div class="gw-vx-f"><label class="gw-fld"><span>Town</span><select data-vx-town><option value="">Loading towns…</option></select></label>' +
      '<label class="gw-fld"><span>Block</span><input data-vx-block type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. 612B" disabled></label></div>' +
      '<div class="gw-vx-sugg" data-vx-blocks></div><div class="gw-q" data-vx-ftypes hidden><span class="l">Flat type</span><div class="gw-chips" role="group" aria-label="Flat type"></div></div>' +
      '<div data-vx-out aria-live="polite"></div></div>' +
      // Condo
      '<div class="gw-vx-pane" data-vx-pane="condo" hidden><div class="gw-fld gw-vx-dev"><span>Your development, or the one you’re buying in</span>' + NAVM().searchHtml('devs', 'Type part of its name, e.g. Jadescape') + '</div>' +
      '<p class="gw-vx-why">Its Research page shows what homes there sold for, by size, and lets you check an asking price against the recent sales of that size. From URA records.</p>' +
      kenCta({ head: 'Want a view on your own unit?', text: 'Facing, stack, floor and condition aren’t in the records. Ken can tell you how they change the picture.', msg: condoMsg(''), label: 'Ask Ken on WhatsApp', ctx: 'worth-condo' }) + moveNext(r) + '</div>' +
      // Landed
      '<div class="gw-vx-pane" data-vx-pane="landed" hidden><div class="gw-vx-f one"><label class="gw-fld"><span>Your street</span><input data-vx-street type="text" autocomplete="off" spellcheck="false" placeholder="e.g. Aida Street" disabled></label></div>' +
      '<div class="gw-vx-sugg" data-vx-streets></div><div class="gw-q" data-vx-ltypes hidden><span class="l">Type of house</span><div class="gw-chips" role="group" aria-label="Type of house"></div></div>' +
      '<div data-vx-out aria-live="polite"></div></div>' +
      '<noscript><p class="gw-vx-why">Looking up sales needs JavaScript. Without it: HDB resale prices are on <a href="https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view">data.gov.sg</a>, condo sales are in <a href="' + r + 'research/">Research</a>, and Ken can give you a view on <a href="' + esc(wa('Hi Ken, I’d like a view on what my home could sell for.')) + '">WhatsApp</a>.</p></noscript>' +
      '</section>';
  }

  /* ---------------- browser behaviour ---------------- */
  function mount() {
    if (typeof document === 'undefined') return;
    const box = document.querySelector('[data-gw-value]'); if (!box) return;
    const KPT = root.KPT || { track: function () {} }, track = (n, p) => { try { KPT.track(n, p || {}); } catch (e) { /* analytics unavailable */ } };
    const ctx = (root.GWJ && root.GWJ.ctx) || { get: () => ({}), set: () => {} };
    const r = document.body.dataset.root || '../../', base = r + 'data/value/';
    const cache = {}, getJson = (u) => cache[u] || (cache[u] = fetch(u).then((x) => { if (!x.ok) throw new Error(x.status); return x.json(); }).catch((e) => { delete cache[u]; throw e; }));
    const $ = (s, el) => (el || box).querySelector(s), $$ = (s, el) => [].slice.call((el || box).querySelectorAll(s));
    const fail = (out, what) => { out.innerHTML = '<p class="gw-vx-warn">The ' + what + ' records didn’t load. Please check your connection and try again' + (what === 'HDB resale' ? ', or see them on <a href="https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view" target="_blank" rel="noopener">data.gov.sg ›</a>' : '.') + '</p>'; };
    const reveal = (el) => { try { const rc = el.getBoundingClientRect(); if (rc.top > window.innerHeight * 0.75 || rc.top < 60) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* ignore */ } };
    const press = (btns, b) => btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    // A6-03: the Ken link's message (it names the home) is handed to gw-wa.js, never written into the link.
    const waSet = (scope, msg) => { const a = scope && scope.querySelector('a[data-gw-wa]'); if (a && root.GW_WA) root.GW_WA.set(a, wa(msg)); };
    waSet($('[data-vx-pane="condo"]'), condoMsg(''));
    box.addEventListener('click', (e) => { const m = e.target.closest && e.target.closest('[data-vx-more]'); if (!m) return; const t = m.previousElementSibling; $$('tr.more', t).forEach((x) => { x.hidden = false; }); m.remove(); });

    // -- type --
    const types = $$('[data-vx-type]'), panes = $$('[data-vx-pane]'), started = {};
    function pickType(v, user) {
      const b = types.filter((x) => x.dataset.vxType === v)[0]; if (!b) return;
      press(types, b); panes.forEach((p) => { p.hidden = p.dataset.vxPane !== v; });
      ctx.set({ type: v });
      if (user) { track('tool_started', { tool_name: 'worth-router', step: 'type', value: v }); try { history.replaceState(null, '', '#' + v); } catch (e) { /* ignore */ } }
      if (v === 'hdb') hdbInit(); else if (v === 'landed') landedInit();
    }
    types.forEach((b) => b.addEventListener('click', () => pickType(b.dataset.vxType, true)));

    // -- HDB --
    const H = { pane: $('[data-vx-pane="hdb"]') }; H.town = $('[data-vx-town]', H.pane); H.block = $('[data-vx-block]', H.pane); H.sugg = $('[data-vx-blocks]', H.pane); H.ft = $('[data-vx-ftypes]', H.pane); H.out = $('[data-vx-out]', H.pane);
    let I = null, T = null, sel = null, hdbReady = null;
    function hdbInit() {
      if (hdbReady) return hdbReady;
      hdbReady = getJson(base + 'hdb/index.json').then((idx) => {
        I = idx; H.town.innerHTML = '<option value="">Choose your town</option>' + I.towns.map((t) => '<option value="' + esc(t.id) + '">' + esc(title(t.name)) + '</option>').join('');
        const c = ctx.get().hdb; if (c && c.town) return setTown(c.town).then(() => { if (!T) return; const m = T.blocks.filter((x) => x[0] === c.block && T.streets[x[1]] === c.street)[0]; if (m) { H.block.value = c.block; chooseBlock(m, false, c.flatType); } });
      }).catch(() => { hdbReady = null; fail(H.out, 'HDB resale'); });
      return hdbReady;
    }
    function setTown(id) {
      H.town.value = id; T = null; sel = null; H.block.value = ''; H.block.disabled = true; H.sugg.innerHTML = ''; H.ft.hidden = true; H.out.innerHTML = '';
      if (!id) return Promise.resolve();
      H.block.placeholder = 'Loading blocks…';
      return getJson(base + 'hdb/t/' + id + '.json?v=' + encodeURIComponent(I.sourceVersion)).then((t) => { if (H.town.value !== id) return; T = t; T.id = id; H.block.disabled = false; H.block.placeholder = 'e.g. ' + T.blocks[Math.floor(T.blocks.length / 2)][0]; }).catch(() => fail(H.out, 'HDB resale'));
    }
    H.town.addEventListener('change', () => { setTown(H.town.value).then(() => { if (T) H.block.focus(); }); });
    function suggestBlocks() {
      sel = null; H.ft.hidden = true; H.out.innerHTML = '';
      if (!T) return; const q = H.block.value; if (!normBlock(q)) { H.sugg.innerHTML = ''; return; }
      const m = blockMatches(T, q, 8);
      if (!m.length) { H.sugg.innerHTML = '<p class="gw-vx-why">No Blk ' + esc(normBlock(q)) + ' in ' + esc(title(T.town)) + ' has been resold since 2017. Check the block number and town.</p>'; return; }
      // One block, on one street, that matches exactly: chosen straight away. Otherwise the visitor picks.
      if (m.length === 1 && m[0][0] === normBlock(q)) { chooseBlock(m[0], true); return; }
      H.sugg.innerHTML = m.map((x, i) => '<button type="button" data-i="' + i + '"><b>' + esc(x[0]) + '</b> ' + esc(title(T.streets[x[1]])) + '</button>').join('');
      $$('button', H.sugg).forEach((b) => b.addEventListener('click', () => { H.block.value = m[+b.dataset.i][0]; chooseBlock(m[+b.dataset.i], true); }));
    }
    let tmr; H.block.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(suggestBlocks, 120); });
    H.block.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(tmr); suggestBlocks(); } });
    function chooseBlock(m, user, presetType) {
      sel = { block: m[0], s: m[1], street: T.streets[m[1]] };
      H.sugg.innerHTML = '<p class="gw-vx-picked">Blk ' + esc(sel.block) + ' ' + esc(title(sel.street)) + ', ' + esc(title(T.town)) + '</p>';
      const ty = hdbTypes(T, sel.block, sel.s), wrap = $('.gw-chips', H.ft);
      wrap.innerHTML = ty.all.map((t) => chip('data-vx-ft', t, flatLabel(I.types[t]))).join(''); H.ft.hidden = false; H.out.innerHTML = '';
      $$('[data-vx-ft]', wrap).forEach((b) => b.addEventListener('click', () => showHdb(+b.dataset.vxFt, true)));
      const want = presetType !== undefined ? I.types.indexOf(presetType) : ty.inBlock.length === 1 ? ty.inBlock[0] : -1;
      if (want >= 0 && ty.all.indexOf(want) >= 0) showHdb(want, user); else if (user) H.ft.querySelector('button').focus();
    }
    function showHdb(t, user) {
      press($$('[data-vx-ft]', H.ft), $$('[data-vx-ft]', H.ft).filter((b) => +b.dataset.vxFt === t)[0]);
      const d = hdbComps(T, sel.block, sel.s, t), c = { town: T.id, block: sel.block, street: sel.street, flatType: I.types[t] };
      H.out.innerHTML = hdbResult(d, c, T, I, r, { path: (ctx.get() || {}).path === 'upgrade' }); waSet(H.out, hdbMsg(c));
      ctx.set({ type: 'hdb', hdb: Object.assign(c, { n: d.n, lo: d.lo, hi: d.hi, level: d.level, asOf: I.sourceVersion }) });
      track('tool_completed', { tool_name: 'hdb-value', level: d.level, count: d.n, flat_type: I.types[t] });
      if (user) reveal(H.out);
    }

    // -- Condo: the development search (gw-nav.js) opens the development in Research; the Ken message stays generic --

    // -- Landed --
    const Lp = { pane: $('[data-vx-pane="landed"]') }; Lp.street = $('[data-vx-street]', Lp.pane); Lp.sugg = $('[data-vx-streets]', Lp.pane); Lp.lt = $('[data-vx-ltypes]', Lp.pane); Lp.out = $('[data-vx-out]', Lp.pane);
    let LI = null, LD = null, lsel = null, landedReady = null;
    function landedInit() {
      if (landedReady) return landedReady;
      landedReady = getJson(base + 'landed/index.json').then((idx) => {
        LI = idx; Lp.street.disabled = false;
        const c = ctx.get().landed; if (c && c.street) { const m = LI.streets.filter((x) => x[0] === c.street && x[1] === c.district)[0]; if (m) { Lp.street.value = title(m[0]); return chooseStreet(m, false, c.ltype); } }
      }).catch(() => { landedReady = null; fail(Lp.out, 'URA landed'); });
      return landedReady;
    }
    function suggestStreets() {
      lsel = null; Lp.lt.hidden = true; Lp.out.innerHTML = ''; if (!LI) return;
      const m = streetMatches(LI, Lp.street.value, 6);
      if (normStreet(Lp.street.value).length < 2) { Lp.sugg.innerHTML = ''; return; }
      if (!m.length) { Lp.sugg.innerHTML = '<p class="gw-vx-why">No landed sales on a street by that name in URA records since ' + ym(LI.firstMonth) + '. Try the street name as it appears on your address.</p>'; return; }
      Lp.sugg.innerHTML = m.map((x, i) => '<button type="button" data-i="' + i + '"><b>' + esc(title(x[0])) + '</b> District ' + esc(x[1]) + ' · ' + x[2] + ' sale' + (x[2] === 1 ? '' : 's') + '</button>').join('') + splitNote(LI, m);
      $$('button', Lp.sugg).forEach((b) => b.addEventListener('click', () => { const x = m[+b.dataset.i]; Lp.street.value = title(x[0]); chooseStreet(x, true); }));
    }
    let lt; Lp.street.addEventListener('input', () => { clearTimeout(lt); lt = setTimeout(suggestStreets, 120); });
    Lp.street.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(lt); suggestStreets(); } });
    function chooseStreet(m, user, presetType) {
      Lp.sugg.innerHTML = '<p class="gw-vx-picked">' + esc(title(m[0])) + ', District ' + esc(m[1]) + '</p>';
      return getJson(base + 'landed/d/' + m[1] + '.json?v=' + encodeURIComponent(LI.sourceVersion)).then((D) => {
        LD = D; const s = D.streets.indexOf(m[0]); lsel = { street: m[0], district: m[1], s };
        const c = landedTypes(D, s), keys = Object.keys(LTYPE).filter((k) => c[k]), wrap = $('.gw-chips', Lp.lt);
        wrap.innerHTML = keys.map((k) => chip('data-vx-lt', k, LTYPE[k] + ' <small>' + c[k] + '</small>')).join(''); Lp.lt.hidden = false; Lp.out.innerHTML = '';
        $$('[data-vx-lt]', wrap).forEach((b) => b.addEventListener('click', () => showLanded(b.dataset.vxLt, true)));
        const want = presetType && c[presetType] ? presetType : keys.length === 1 ? keys[0] : null;
        if (want) showLanded(want, user); else if (user) wrap.querySelector('button').focus();
      }).catch(() => fail(Lp.out, 'URA landed'));
    }
    function showLanded(k, user) {
      press($$('[data-vx-lt]', Lp.lt), $$('[data-vx-lt]', Lp.lt).filter((b) => b.dataset.vxLt === k)[0]);
      const d = landedComps(LD, lsel.s, k, LI.latestMonth, LI.firstMonth), c = { street: lsel.street, district: lsel.district, ltype: k };
      Lp.out.innerHTML = landedResult(d, c, LI, r); waSet(Lp.out, landedMsg(c));
      ctx.set({ type: 'landed', landed: c });
      track('tool_completed', { tool_name: 'landed-sales', window: d.win, count: d.n, home_type: LTYPE[k] });
      if (user) reveal(Lp.out);
    }

    // Start: the address (#hdb, #condo, #landed), else what this tab already told us.
    const h = (location.hash || '').replace('#', ''), saved = ctx.get().type;
    if (['hdb', 'condo', 'landed'].indexOf(h) >= 0) pickType(h, false); else if (saved) pickType(saved, false);
    window.addEventListener('hashchange', () => { const x = (location.hash || '').replace('#', ''); if (['hdb', 'condo', 'landed'].indexOf(x) >= 0) pickType(x, false); });
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }
  return { splitNote, hdbComps, landedComps, hdbTypes, landedTypes, blockMatches, streetMatches, normBlock, hdbResult, landedResult, pageHtml, hdbMsg, landedMsg, condoMsg, flatLabel, title, tenure, ym, money, LTYPE, HDB_MIN_BLOCK, HDB_MIN_STREET, MID_MIN, LANDED_MIN };
});
