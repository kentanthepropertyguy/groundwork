/* ==========================================================================
   GROUNDWORK — Market Lens in PRISM (Groundwork 01, approval GW-PRISM-ML-V1-2026-11-07-A1; Claude C's export lens-v1-2026-11-07-0c5ea9ca20a1).
   Complementary evidence under the five PRISM headings, from Claude C's export (data/lens/v1). The page writes no sentence and computes no
   price: every line is the export's own approved text, rendered verbatim; the page only chooses which lines to show.
   - Switch: siteHasMarketLens (below) is false until Groundwork 01 approves it live. While false nothing here runs and every page is exactly as
     before. "?lens=preview" turns it on for this browser only (live verification); "?lens=off" turns the preview off again.
   - Fail closed, as PRISM V1.1: the root index.json must match its sha256 pin, the shard and the report must match the sha256s the root and
     shard give, and the schemas, release and ids must match. Anything else: no Market Lens content, the page as before.
   - Never on the five protected reports (Hougang Central, Hundred Palms Residences, Kingsford Waterbay, The Quinn, Thomson Three).
   - On a PRISM evidence page: a Market Lens card after the five-dimension pentagon (the export's answer, price, comparison and growth lines,
     labelled observed / indicative / facts only, "past prices, not future ones") and the export's lines inside each of the five dimensions
     (Detailed). The R1 hero, the approved PRISM findings and their wording are untouched.
   - A development PRISM marks unavailable or pending (no PRISM page): a PRISM Analysis view built only from the export, with the R1 hero, strip,
     pentagon and Simple / Detailed; its Property Data page gets the PRISM Analysis tab instead of "not available". New launches keep their
     current pages.
   - No resales at all (the site's own project registry, data/projects/index.json): the export's price, comparison and growth lines are not
     shown and the price reads as facts only ("Too few sales to show a price.", the export's own sentence), so no development is described by
     "resale prices" it has never had.
   Pure helpers (viewOf, figsOf, cornersOf, checks) run in Node for the tests; mount* are browser only. UMD: window.GW_LENS.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.GW_LENS = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const SWITCH = { siteHasMarketLens: false };   // Groundwork 01 turns this on after the live check (one line, one file)
  const PIN = {
    index: '7d5a97a6d7c6583faf3287582af3857c6f6c203dbbd086f76a29887d95ccecba',   // data/lens/v1/index.json, byte for byte
    release: 'lens-v1-2026-11-07-0c5ea9ca20a1', approval: 'GW-PRISM-ML-V1-2026-11-07-A1',
    schema: { index: 'groundwork-market-lens-v1-index', shard: 'groundwork-market-lens-v1-index-shard', report: 'groundwork-market-lens-v1' }
  };
  const DIR = 'data/lens/v1/';
  const PROTECTED = ['hougang-central', 'hundred-palms-residences', 'kingsford-waterbay', 'the-quinn', 'thomson-three'];
  const VIEW_STATES = ['unavailable', 'pending'];   // developments without a PRISM page that get a Market Lens view
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEYS = ['P', 'R', 'I', 'S', 'M'];
  // fixed interface words (not findings)
  const UI = {
    title: 'Market Lens', sub: 'Past prices and activity against similar developments in the district',
    kind: { observed: 'Observed price', indicative: 'Indicative price', facts: 'Facts only' },
    kindNote: { observed: 'From 10 or more resales in the last 24 months.', indicative: 'Estimated by a statistical model from at least 5 sales over five years; not a valuation.', facts: 'Not enough sales to show a price; the facts below still apply.' },
    history: 'This describes past prices, not future ones.', how: 'How this works', years: 'Median resale price per square foot, by year',
    notes: 'Also worth knowing', source: 'Sources', inDim: 'Market Lens', notCompared: 'Not available', factOnly: 'Fact only',
    noPrice: 'Too few sales to show a price.'   // the export's own facts-only sentence
  };
  const SOURCES = { URA_TRANSACTIONS: 'URA transactions', URA_DEVELOPER_SALES: "URA developers' sales", LTA_RAIL_EXITS: 'LTA MRT station exits',
    URA_MP2025_RAIL_STATIONS: 'URA Master Plan 2025 rail stations', LTA_RAIL_PROJECTS: 'LTA rail projects', MOE_P1_2025: 'MOE Primary 1 registration, 2025', GW_UPCOMING: 'URA sale sites' };
  const CLASS = { condo: 'Condo', ec: 'Executive condo', 'strata-landed': 'Strata landed' };
  const noStop = (t) => String(t || '').replace(/\.\s*$/, '');
  const cap = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;

  /* ---------------------------------------------------------------- pure: which of the export's lines a page shows */
  // A candidate for "no resales": a price, no resale in 24 months and no yearly resale figure. The site's registry then decides (resale count 0).
  const noResaleCandidate = (r) => r.price.kind !== 'facts-only' && !r.facts.resales24m && !((r.facts.resalePsfByYear || {}).values || []).some((x) => x);
  function viewOf(r, noResales) {
    const t = r.text || {}, priced = r.price.kind !== 'facts-only' && !noResales;
    const kind = priced ? r.price.kind : 'facts';
    const yrs = r.facts.resalePsfByYear || { labels: [], values: [] };
    return {
      id: r.id, name: r.name, kind, chip: UI.kind[kind], note: UI.kindNote[kind], noResales: !!noResales,
      answer: noResales ? '' : (t.answer || ''),
      price: priced ? t.price : (noResales ? UI.noPrice : t.price),
      comparison: priced ? (t.comparison || '') : '',
      record: priced ? (t.record || '') : '',
      years: noResales ? [] : yrs.labels.map((l, i) => [l, yrs.values[i]]).filter((x) => typeof x[1] === 'number'),
      infrastructure: t.infrastructure || [], supply: t.supply || [], demand: t.demand || '', watch: t.watch || [],
      sources: (r.sourceIds || []).map((k) => SOURCES[k]).filter(Boolean)
    };
  }
  // the lines each PRISM heading takes
  function dimLines(v) {
    return { P: [v.price, v.comparison].filter(Boolean), R: [v.record].filter(Boolean), I: v.infrastructure.slice(), S: v.supply.slice(), M: [v.demand].filter(Boolean) };
  }
  // Figures for a Market Lens view's strip (no PRISM page): numbers read from the export's own sentences, never recomputed
  function figsOf(v) {
    const out = [], i0 = v.infrastructure[0] || '', mrt = /^(.+? (?:MRT|LRT)), about ([\d,.]+ k?m)\b/.exec(i0);
    if (mrt) out.push({ dim: 'I', scope: 'Location', v: mrt[2], unit: 'to ' + mrt[1], cmp: '', when: '', fut: '' });
    const ps = /\$[\d,]+ psf/.exec(v.kind === 'facts' ? '' : v.price || '');
    if (ps) out.push({ dim: 'P', scope: 'This development', v: (v.kind === 'indicative' ? 'About ' : '') + ps[0], unit: v.kind === 'observed' ? 'median resale price, last 24 months' : 'indicative price', cmp: v.comparison ? noStop(v.comparison) : '', when: '', fut: '' });
    const dm = /^([\d,]+) resales? in the last 24 months/.exec(v.demand);
    if (dm && dm[1] !== '0') out.push({ dim: 'M', scope: 'This development', v: dm[1], unit: dm[1] === '1' ? 'resale in the last 24 months' : 'resales in the last 24 months', cmp: '', when: '', fut: '' });
    return out.length >= 2 ? out : [];
  }
  // The pentagon for a Market Lens view: compared where the export compares (price, growth), facts elsewhere, the export's words
  function cornersOf(v, pillars) {
    const name = {}; (pillars || []).forEach(([k, n]) => { name[k] = n; });
    const L = dimLines(v), first = (a) => noStop(a[0] || ''), out = {};
    const ps = /\$[\d,]+ psf/.exec(v.kind === 'facts' ? '' : v.price || '');
    out.P = v.comparison ? { state: 'cmp', word: noStop(v.comparison), fig: ps ? ps[0] + ' · ' + v.chip.toLowerCase() : '' } :
      ps ? { state: 'fact', word: UI.factOnly, fig: ps[0] + ' · ' + v.chip.toLowerCase() } : { state: 'none', word: noStop(v.price) || UI.notCompared, fig: '' };
    const rb = /— (more than|about the same as|less than) similar developments/.exec(v.record);
    out.R = v.record && rb ? { state: 'cmp', word: cap(rb[1]) + ' similar developments', fig: v.record.split(' (adjusted')[0] } : { state: 'none', word: UI.notCompared, fig: '' };
    out.I = L.I.length ? { state: 'fact', word: UI.factOnly, fig: first(L.I) } : { state: 'none', word: UI.notCompared, fig: '' };
    out.S = L.S.length ? { state: 'fact', word: UI.factOnly, fig: first(L.S) } : { state: 'none', word: UI.notCompared, fig: '' };
    out.M = L.M.length ? { state: 'fact', word: UI.factOnly, fig: first(L.M) } : { state: 'none', word: UI.notCompared, fig: '' };
    return KEYS.map((k) => Object.assign({ key: k, name: name[k] || k }, out[k]));
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ym = (s) => { const m = /^(\d{4})-(\d{2})$/.exec(s || ''); return m ? MONTHS[+m[2] - 1] + ' ' + m[1] : (s || ''); };
  const metaOf = (r) => [CLASS[r.class] || '', r.district ? 'District ' + String(+r.district) : '', r.tenure || '', typeof r.facts.homes === 'number' ? r.facts.homes.toLocaleString('en-SG') + ' homes' : ''].filter(Boolean);

  /* ---------------------------------------------------------------- pure: the integrity checks (fail closed) */
  function checkIndex(ix) {
    if (!ix || ix.schemaVersion !== PIN.schema.index || ix.releaseId !== PIN.release || ix.status !== 'approved' || !Array.isArray(ix.shards) || ix.shards.length !== 16) throw new Error('lens index');
    return ix;
  }
  function checkShard(sh, ref) {
    if (!sh || sh.schemaVersion !== PIN.schema.shard || sh.key !== ref.key || !Array.isArray(sh.entries) || sh.entries.length !== ref.entries) throw new Error('lens shard');
    return sh;
  }
  function checkReport(r, e) {
    if (!r || r.schemaVersion !== PIN.schema.report || r.id !== e.id || r.protected !== e.protected || !r.text || !r.price || !r.facts) throw new Error('lens report');
    return r;
  }

  /* ---------------------------------------------------------------- HTML */
  const lines = (a, cls) => a.length ? '<ul class="gml-lines' + (cls ? ' ' + cls : '') + '">' + a.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '';
  const chip = (v) => '<span class="gml-chip gml-chip--' + v.kind + '" data-gml-kind="' + v.kind + '">' + esc(v.chip) + '</span>';
  function yearsHtml(v) {
    if (!v.years.length) return '';
    return '<div class="gml-years"><p class="gml-k">' + esc(UI.years) + '</p><table class="gml-yt"><tbody>' + v.years.map(([l, x]) => '<tr><th scope="row">' + esc(l) + '</th><td>$' + x.toLocaleString('en-SG') + '</td></tr>').join('') + '</tbody></table></div>';
  }
  function cardHtml(v, method, asAt) {
    return '<section class="gml-card" data-gml-card="' + esc(v.id) + '" aria-labelledby="gmlH"><div class="gml-ch"><h2 id="gmlH">' + esc(UI.title) + '</h2>' + chip(v) + '</div>' +
      '<p class="gml-sub">' + esc(UI.sub) + '</p>' + (v.answer ? '<p class="gml-ans" data-gml-answer>' + esc(v.answer) + '</p>' : '') +
      lines([v.price, v.comparison, v.record].filter(Boolean), 'gml-main') + '<p class="gml-note">' + (v.kind === 'facts' ? '' : esc(v.note) + ' ') + esc(UI.history) + '</p>' +
      '<details class="gml-how"><summary>' + esc(UI.how) + '</summary><p>' + esc(method || '') + '</p><p class="gml-src">' + esc(UI.source) + ': ' + esc(v.sources.join(' · ')) + (asAt ? ' · data to ' + esc(ym(asAt)) : '') + '.</p></details></section>';
  }
  function dimBlockHtml(v, k) {
    const L = dimLines(v)[k];
    if (!L.length && !(k === 'R' && v.years.length)) return '';
    return '<div class="gml-dim" data-gml-dim="' + k + '"><p class="gml-k">' + esc(UI.inDim) + (k === 'P' ? ' · ' + esc(v.chip.toLowerCase()) : '') + '</p>' + lines(L) + (k === 'R' ? yearsHtml(v) : '') + '</div>';
  }
  const watchHtml = (v) => v.watch.length ? '<section class="gml-watch" data-gml-watch><p class="gml-k">' + esc(UI.notes) + '</p>' + lines(v.watch) + '</section>' : '';
  function onlyPageHtml(r, v, G, rt, method, asAt) {
    const switchH = G.switchHtml({ id: r.id, name: r.name }, 'prism', rt), meta = metaOf(r);
    const secs = G.PILLARS.map(([k, n]) => '<section class="gml-sec" id="gwp-' + k + '" data-gml-sec="' + k + '"><h3 class="gml-sh"><span class="gwp-pl" aria-hidden="true">' + k + '</span><b>' + esc(n) + '</b></h3>' +
      (dimBlockHtml(v, k) || '<p class="gwp-fine">' + esc(UI.notCompared) + '.</p>') + '</section>').join('');
    return '<div class="gwp-page gwp-page--profile gml-page" data-gwp-page="' + esc(r.id) + '" data-gwp-mode="lens"><div class="gwp-wrap"><header class="gwp-head">' +
      '<nav class="gwp-crumb" aria-label="Breadcrumb"><a href="#/">Research</a><span aria-hidden="true">›</span><span aria-current="page">' + esc(r.name) + '</span></nav>' +
      '<div class="gwp-ttl"><div class="gwp-ht"><h1 class="gwp-h1">' + esc(r.name) + '</h1>' + (meta.length ? '<p class="gwp-meta">' + esc(meta.join(' · ')) + '</p>' : '') + '</div><div class="gwp-acts"></div></div>' + switchH + '</header></div>' +
      '<div class="gwp-wrap">' + cardHtml(v, method, asAt) + '<section class="gwp-dims gml-dims" aria-label="The five PRISM dimensions">' + secs + watchHtml(v) + '</section>' +
      '<p class="gwp-foot">From official records to ' + esc(ym(asAt)) + '. Market Lens describes what past sales show; it is not a valuation, a forecast or a purchase recommendation.</p>' +
      '<section class="gwp-next" aria-label="Where next"><a class="gwp-nx" href="#/p/' + esc(r.id) + '"><b>Property Data</b><span>Prices, sales and rents for ' + esc(r.name) + '</span></a></section></div></div>';
  }

  /* ---------------------------------------------------------------- browser: switch, loading, mounting */
  const store = { get: (k) => { try { return root.localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { if (v === null) root.localStorage.removeItem(k); else root.localStorage.setItem(k, v); } catch (e) { /* unavailable */ } } };
  (function previewFlag() {
    try { const q = new URLSearchParams(root.location.search).get('lens'); if (q === 'preview') store.set('gw.lens.preview', '1'); else if (q === 'off') store.set('gw.lens.preview', null); } catch (e) { /* not a browser */ }
  })();
  const isOn = () => SWITCH.siteHasMarketLens || store.get('gw.lens.preview') === '1';
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const sha = (bytes) => root.crypto && root.crypto.subtle ? root.crypto.subtle.digest('SHA-256', bytes).then(hex) : Promise.reject(new Error('no digest'));
  const getBytes = (u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('http'); return r.arrayBuffer(); });
  const parse = (buf) => JSON.parse(new TextDecoder('utf-8').decode(buf));
  const cache = {};
  let ixP = null, projP = null;
  function index(rt) {
    if (!ixP) ixP = getBytes(rt + DIR + 'index.json').then((b) => sha(b).then((h) => { if (h !== PIN.index) throw new Error('lens pin'); return checkIndex(parse(b)); })).catch((e) => { ixP = null; throw e; });
    return ixP;
  }
  function load(rt, id) {
    if (cache[id]) return cache[id];
    cache[id] = index(rt).then((ix) => sha(new TextEncoder().encode(id)).then((h) => {
      const ref = ix.shards.find((s) => s.key === h.charAt(0)); if (!ref) throw new Error('lens shard ref');
      return getBytes(rt + DIR + ref.path).then((b) => sha(b).then((hs) => {
        if (hs !== ref.sha256) throw new Error('lens shard sha');
        const e = checkShard(parse(b), ref).entries.find((x) => x.id === id); if (!e) return null;
        return getBytes(rt + DIR + e.path).then((rb) => sha(rb).then((hr) => { if (hr !== e.sha256) throw new Error('lens report sha'); return { ix, entry: e, rep: checkReport(parse(rb), e) }; }));
      }));
    })).catch(() => null);
    return cache[id];
  }
  // the site's own registry: a development with no resale at all never shows a resale price (only fetched for the few candidates)
  function resalesKnown(rt, id) {
    if (!projP) projP = fetch(rt + 'data/projects/index.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return projP.then((d) => { if (!d || !Array.isArray(d.fields)) return null; const fi = d.fields.indexOf('id'), fr = d.fields.indexOf('resale'), row = d.rows.find((x) => x[fi] === id); return row ? row[fr] : null; });
  }
  function viewFor(rt, x) {
    if (!noResaleCandidate(x.rep)) return Promise.resolve(viewOf(x.rep, false));
    return resalesKnown(rt, x.rep.id).then((n) => viewOf(x.rep, n === 0 || n === null));   // unknown: treated as none (fail closed)
  }
  const usable = (id, x) => x && x.rep && !x.rep.protected && !x.entry.protected && PROTECTED.indexOf(id) < 0;

  // 1) a PRISM evidence page (after GW_PRISM.show and the R1 hero): the card and the lines inside each dimension
  function mountProfile(app, md, o) {
    o = o || {};
    if (!isOn() || !md || md.mode !== 'profile' || PROTECTED.indexOf(md.id) >= 0) return Promise.resolve(false);
    const rt = o.root || '../';
    return load(rt, md.id).then((x) => {
      if (!usable(md.id, x) || (o.still && !o.still())) return false;
      const page = app.querySelector('.gwp-page[data-gwp-page="' + md.id + '"][data-gwp-mode="profile"]'); if (!page || page.querySelector('[data-gml-card]')) return false;
      return viewFor(rt, x).then((v) => {
        // facts only adds nothing to a PRISM page (PRISM shows its own facts): no card, no lines
        if ((o.still && !o.still()) || v.kind === 'facts') return false;
        const at = page.querySelector('[data-gph-glance]') || page.querySelector('.gph-box') || page.querySelector('.gwp-card');
        const html = cardHtml(v, x.ix.method, x.ix.asAt);
        if (at) at.insertAdjacentHTML('afterend', html); else return false;
        // PRISM's own opening leads this page; the lines below carry the Market Lens figures, so its one-line answer is not repeated
        const ans = page.querySelector('[data-gml-card] [data-gml-answer]'); if (ans) ans.remove();
        KEYS.forEach((k) => { const p = page.querySelector('#gwpDim' + k); if (p) p.insertAdjacentHTML('beforeend', dimBlockHtml(v, k)); });
        const dims = page.querySelector('.gwp-dims'); if (dims) dims.insertAdjacentHTML('beforeend', watchHtml(v));
        page.setAttribute('data-gml', v.kind);
        return true;
      });
    });
  }
  // 2) no PRISM page (unavailable or pending): a Market Lens view. Resolves false when there is none, so the caller goes to Property Data.
  function mountOnly(app, id, o) {
    o = o || {};
    const G = root.GW_PRISM, HERO = root.GW_PRISMHERO;
    if (!isOn() || !G || PROTECTED.indexOf(id) >= 0) return Promise.resolve(false);
    const rt = o.root || '../';
    return load(rt, id).then((x) => {
      if (!usable(id, x) || VIEW_STATES.indexOf(x.rep.prismState) < 0 || (o.still && !o.still())) return false;
      return viewFor(rt, x).then((v) => {
        if (o.still && !o.still()) return false;
        document.title = 'PRISM · ' + x.rep.name + ' — Research — Groundwork';
        app.innerHTML = onlyPageHtml(x.rep, v, G, rt, x.ix.method, x.ix.asAt);
        const page = app.querySelector('.gwp-page[data-gwp-mode="lens"]');
        if (HERO && HERO.mountWith) {
          const figs = figsOf(v), cs = cornersOf(v, G.PILLARS), mrt = /^(.+? MRT), about/.exec(v.infrastructure[0] || '');
          HERO.mountWith(page, { id, name: x.rep.name, op: v.answer ? { kind: 'lens', k: UI.title, head: v.answer } : null, figs, cs, station: mrt ? mrt[1] : null, label: figs.length && figs[0].dim === 'I' ? figs[0].v : '' }, { root: rt, still: o.still, dim: o.dim });
          // the card follows the hero's figures and pentagon, as on a PRISM page
          const gl = page.querySelector('[data-gph-glance]'), card = page.querySelector('[data-gml-card]'); if (gl && card) gl.insertAdjacentElement('afterend', card);
          // the hero already carries the answer: not a second time in the card
          if (v.answer && page.querySelector('.gph-h')) { const a = page.querySelector('[data-gml-answer]'); if (a) a.remove(); }
        }
        page.setAttribute('data-gml', v.kind);
        return true;
      });
    });
  }
  // 3) Property Data of such a development: the PRISM Analysis tab instead of "not available"
  function mountTab(app, id, o) {
    o = o || {};
    const G = root.GW_PRISM;
    if (!isOn() || !G || PROTECTED.indexOf(id) >= 0) return Promise.resolve(false);
    const rt = o.root || '../';
    return load(rt, id).then((x) => {
      if (!usable(id, x) || VIEW_STATES.indexOf(x.rep.prismState) < 0) return false;
      return new Promise((done) => {
        let n = 0;
        const swap = () => {
          if (o.still && !o.still()) return done(false);
          const na = app.querySelector('[data-gwp-na]');
          if (!na) { if (++n < 40) return setTimeout(swap, 125); return done(false); }
          app.querySelectorAll('[data-gwp-na-note]').forEach((e) => e.remove());
          na.insertAdjacentHTML('afterend', G.switchHtml({ id, name: x.rep.name }, 'data', rt)); na.remove();
          done(true);
        };
        swap();
      });
    });
  }

  return { ym, SWITCH, PIN, DIR, PROTECTED, VIEW_STATES, UI, SOURCES, KEYS, isOn, noResaleCandidate, viewOf, dimLines, figsOf, cornersOf, metaOf, checkIndex, checkShard, checkReport,
    cardHtml, dimBlockHtml, watchHtml, onlyPageHtml, load, mountProfile, mountOnly, mountTab, _cache: cache };
});
