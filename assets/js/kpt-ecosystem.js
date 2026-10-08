/* ==========================================================================
   KPT ecosystem: Research library, compare-two, project directory, project profile, report viewer.
   Plain JS, no dependencies. All identity, search and comparison logic lives in kpt-registry-core.js (shared with the build).
   Every number on these pages is read from generated data (data/registry/*.json); nothing is typed here.
   Views are chosen by <body data-view="...">. Paths are relative to <body data-root="...">.
   ========================================================================== */
(function () {
  'use strict';
  const R = window.KPT_REGISTRY, KPT = window.KPT = window.KPT || {};
  const B = document.body, ROOT = B.dataset.root || './', VIEW = B.dataset.view;
  const X = window.KPTX = {};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r) => (r || document).querySelector(s);
  X.esc = esc; X.root = ROOT;

  /* ---------- data ---------- */
  const cache = {};
  const getJson = (p) => cache[p] || (cache[p] = fetch(ROOT + p, { cache: 'no-cache' }).then((r) => { if (!r.ok) { const e = new Error('nf'); e.status = r.status; throw e; } return r.json(); }));
  X.json = getJson;
  X.boot = () => Promise.all([getJson('data/registry/meta.json'), getJson('data/registry/index.json'), getJson('data/registry/comparisons.json')]).then((a) => ({ meta: a[0], policy: a[0].policy, ix: R.makeIndex(a[1]), comps: a[2] }));

  /* ---------- attribution: keep campaign parameters for the session, never send them anywhere but our own links ---------- */
  const ATTR = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
  X.attr = function () {
    let saved = {}; try { saved = JSON.parse(sessionStorage.getItem('kpt_attr') || '{}'); } catch (e) { saved = {}; }
    const q = new URLSearchParams(location.search), now = {}; ATTR.forEach((k) => { if (q.get(k)) now[k] = q.get(k).slice(0, 100); });
    if (Object.keys(now).length) { saved = now; try { sessionStorage.setItem('kpt_attr', JSON.stringify(saved)); } catch (e) { /* storage unavailable */ } }
    return saved;
  };
  X.track = function (name, params) { if (KPT.track) KPT.track(name, Object.assign({}, params)); };
  X.wa = (policy, kind, p) => R.waLink(policy, kind, p, X.attr());
  X.waRef = (policy, kind, p) => (R.waMessage(policy, kind, p, X.attr()).match(/\(Ref ([^)]*)\)/) || [, ''])[1];
  X.waButton = (policy, kind, p, label, ctx, cls) => '<a class="kpe-btn ' + (cls || 'wa sm') + '" href="' + esc(X.wa(policy, kind, p)) + '" target="_blank" rel="noopener" data-kpt-wa="' + esc(ctx) + '" data-ref="' + esc(X.waRef(policy, kind, p)) + '"' + (p.id ? ' data-project="' + esc(p.id) + '"' : '') + '>' + esc(label) + '</a>';
  // Outbound links to a microsite. Inbound campaign parameters are forwarded unchanged; otherwise KPT is named as the referrer.
  X.outbound = function (url, placement, projectId) {
    const u = new URL(url), a = X.attr();
    if (Object.keys(a).length) Object.keys(a).forEach((k) => u.searchParams.set(k, a[k])); else { u.searchParams.set('utm_source', 'kpt'); u.searchParams.set('utm_medium', 'referral'); u.searchParams.set('utm_campaign', placement); u.searchParams.set('utm_content', projectId); }
    u.searchParams.set('kpt_from', placement);
    return u.toString();
  };

  document.addEventListener('click', (e) => {
    const t = e.target.closest ? e.target.closest('a,button') : null; if (!t) return;
    // A crawlable outbound link carries a clean address in its HTML; attribution is added when it is clicked.
    if (t.dataset.kptOutbound) { try { t.href = X.outbound(t.dataset.kptOutbound, t.dataset.placement || 'directory', t.dataset.kptMs || ''); } catch (x) { /* keep the clean address */ } }
    if (t.dataset.kptWa) { const ev = VIEW === 'profile' || VIEW === 'directory' ? 'project_whatsapp_clicked' : 'research_whatsapp_clicked'; X.track(ev, { context: t.dataset.kptWa, ref: t.dataset.ref, project_id: t.dataset.project || undefined }); }
    else if (t.dataset.kptMs) X.track('microsite_clicked', { project_id: t.dataset.kptMs, destination_host: t.dataset.host, placement: t.dataset.placement });
    else if (t.dataset.kptReport) X.track('research_report_selected', { report: t.dataset.kptReport, pair: t.dataset.pair, source: t.dataset.source });
    else if (t.dataset.kptTt) X.track('tiktok_click', { placement: t.dataset.kptTt });
    else if (t.dataset.kptNav) X.track('nav_click', { target: t.dataset.kptNav, placement: 'header' });
  }, true);

  /* ---------- shared rendering ---------- */
  const LEVEL = { BASIC: ['bs', 'Basic'], FEATURED: ['ft', 'Featured'], MICROSITE: ['ms', 'Microsite'] };
  const badge = (lv) => '<span class="kpe-badge ' + LEVEL[lv][0] + '" title="' + esc({ BASIC: 'Verified basic information and available transaction analysis.', FEATURED: 'More detailed curated information. A content-depth label, not a ranking or endorsement.', MICROSITE: 'Has a dedicated, independently maintained website.' }[lv]) + '">' + LEVEL[lv][1] + '</span>';
  const subline = (o) => [o.street && o.street.replace(/\b\w/g, (c) => c), o.district ? 'District ' + o.district : null, o.seg, o.tenure && o.tenure !== '–' ? o.tenure : null].filter(Boolean).join(' · ');
  const stageText = { 'new-launch': 'New launch', completed: 'Completed', unknown: null };
  const flags = (o) => (o.level !== 'BASIC' ? badge(o.level) : '') + (o.cmp ? '<span class="kpe-tag ok">' + o.cmp + (o.cmp > 1 ? ' comparisons' : ' comparison') + '</span>' : '') + (o.ms === 'configured' ? '<span class="kpe-tag">Own site</span>' : '');
  const draftBadge = '<span class="kpe-badge dr" title="Not approved for publication">Private draft</span>';

  /* ---------- picker: searchable, keyboard friendly, selection by id so a name can never be silently mis-resolved ---------- */
  function picker(host, ctx, o) {
    const id = 'pk' + Math.random().toString(36).slice(2, 7);
    host.innerHTML = '<div class="kpe-field"><label for="' + id + '">' + esc(o.label) + '</label><div class="kpe-slot"></div></div>';
    const slot = $('.kpe-slot', host); let cur = null, sel = -1, results = [];
    const rowHtml = (x) => '<b>' + esc(x.name) + '</b><small>' + esc(subline(x) || [stageText[x.stage], x.note].filter(Boolean).join(' · ') || 'No transaction data in the current dataset') + '</small>';
    function showInput(msg) {
      slot.innerHTML = '<div class="kpe-search"><input class="kpe-input" id="' + id + '" type="text" role="combobox" aria-expanded="false" aria-controls="' + id + 'l" aria-autocomplete="list" autocomplete="off" placeholder="Search by name" value=""><ul class="kpe-list" id="' + id + 'l" role="listbox" hidden></ul></div>' + (msg ? '<p class="kpe-note" role="status">' + esc(msg) + '</p>' : '');
      const inp = $('input', slot), ul = $('ul', slot);
      const close = () => { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); sel = -1; };
      const open = () => {
        const q = inp.value.trim(); if (!q) return close();
        results = R.search(ctx.ix, q, 8).filter((r) => r.id !== o.exclude()).map((r) => ctx.ix.byId.get(r.id));
        const more = R.search(ctx.ix, q).length;
        ul.innerHTML = results.length ? results.map((x, i) => '<li role="option" id="' + id + 'o' + i + '"><button type="button" data-i="' + i + '" aria-selected="false">' + rowHtml(x) + '</button></li>').join('') + (more > results.length ? '<li><small style="padding:8px 12px;display:block;color:#6b7280">' + more + ' match. Keep typing to narrow it down.</small></li>' : '') : '<li><small style="padding:10px 12px;display:block;color:#6b7280">No development with that name in the registry.</small></li>';
        ul.hidden = false; inp.setAttribute('aria-expanded', 'true'); sel = -1;
      };
      inp.addEventListener('input', open);
      inp.addEventListener('keydown', (e) => {
        const btns = ul.querySelectorAll('button'); if (e.key === 'Escape') return close();
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!btns.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length; btns.forEach((b, i) => b.setAttribute('aria-selected', i === sel)); inp.setAttribute('aria-activedescendant', id + 'o' + sel); }
        if (e.key === 'Enter') { e.preventDefault(); if (sel >= 0 && btns[sel]) btns[sel].click(); else if (results.length === 1) btns[0].click(); }
      });
      ul.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) set(results[+b.dataset.i].id, 'search'); });
      document.addEventListener('click', (e) => { if (!host.contains(e.target)) close(); });
    }
    function set(pid, source) {
      cur = ctx.ix.byId.get(pid); if (!cur) return showInput();
      slot.innerHTML = '<div class="kpe-picked"><div><b>' + esc(cur.name) + '</b><small>' + esc(subline(cur) || [stageText[cur.stage], cur.note].filter(Boolean).join(' · ')) + '</small></div><button type="button">Change</button></div>';
      $('button', slot).addEventListener('click', () => { cur = null; showInput(); o.onChange(null); const i = $('input', slot); if (i) i.focus(); });
      if (source !== 'init') X.track('research_project_selected', { project_id: pid, source: 'compare' });
      o.onChange(cur);
    }
    showInput();
    return { set, get: () => cur, message: showInput };
  }

  /* ---------- compare-two ---------- */
  function mountCompare(el, ctx) {
    el.innerHTML = '<div class="kpe-pair"><div id="cmpA"></div><div class="kpe-vs">VS</div><div id="cmpB"></div></div><div class="kpe-result" id="cmpR" aria-live="polite"></div>';
    let A = null, B2 = null; const out = $('#cmpR', el);
    const nameOf = (id) => ctx.ix.byId.get(id).name;
    function url() { const u = new URL(location.href); u.searchParams.delete('a'); u.searchParams.delete('b'); if (A) u.searchParams.set('a', A.id); if (B2) u.searchParams.set('b', B2.id); try { history.replaceState(null, '', u); } catch (e) { /* ignore */ } }
    function render() {
      url(); if (!A || !B2) { out.innerHTML = ''; return; }
      const res = R.compare(ctx.ix, ctx.comps, ctx.policy, A.id, B2.id), why = ctx.policy.support.unsupportedReasons;
      X.track('research_pair_checked', { project_a: A.id, project_b: B2.id, supported: res.state === 'supported', reason: res.reason || 'supported' });
      if (res.state === 'supported') {
        const c = ctx.comps.comparisons.find((x) => x.slug === res.comparison.slug);
        out.innerHTML = '<div class="kpe-state ok"><p class="kpe-kicker" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ok);font-weight:700;margin:0 0 6px">Comparison available</p><h3>' + esc(c.title) + '</h3><p>' + esc(c.verdict) + '</p>' + bestHtml(c) + '<p class="kpe-note">' + freshLine(c) + '</p><div class="kpe-actions"><a class="kpe-btn" href="' + ROOT + c.reportPath + '" data-kpt-report="' + esc(c.slug) + '" data-pair="' + esc(c.pair) + '" data-source="compare">Read the comparison</a>' + draftBadge + '</div></div>';
        return;
      }
      const a = A.name, b = B2.name, items = []; let head = 'This comparison isn’t available yet.', body = '';
      if (res.reason === 'same-project') { head = 'Choose two different developments.'; }
      else if (res.reason === 'no-report') {
        body = '<p>' + esc(why['no-report']) + ' Both developments have enough resale transactions in the current dataset for one to be prepared. Reports are generated only after each project’s facts are sourced and reviewed, so a pair isn’t created automatically.</p>';
        items.push('<a class="kpe-link" href="' + ROOT + 'research/#/compare/' + A.id + '/' + B2.id + '" data-kpt-nav="research-statistical">See the statistical side-by-side in Research</a> (transaction medians only, no interpretation)');
      } else {
        const who = (res.projects || [res.project]).map(nameOf), list = who.length === 2 ? who[0] + ' and ' + who[1] : who[0];
        body = '<p>' + esc(list) + (who.length === 2 ? ' each ' + why[res.reason].replace(/^is /, 'is ').replace(/^has /, 'has ') : ' ' + why[res.reason]) + '</p>';
        if (res.reason === 'new-launch') body += '<p>Resale comparisons need completed projects with resale transactions. If one of these has its own site, that is the best place for current details.</p>';
      }
      [A, B2].forEach((p) => { items.push('<a class="kpe-link" href="' + ROOT + 'projects/p/#/' + p.id + '">' + esc(p.name) + ': project page</a>' + (p.ms === 'configured' ? ' (has its own site)' : '')); });
      out.innerHTML = '<div class="kpe-state no"><h3>' + esc(head) + '</h3>' + body + (res.reason === 'same-project' ? '' : '<p><b>What you can do now</b></p><ul>' + items.map((i) => '<li>' + i + '</li>').join('') + '</ul><p class="kpe-note">No figures are shown for a pair that has no generated report. ' + (res.eligible ? 'Ask Ken if you would like this pair prepared.' : '') + '</p>' + (res.reason === 'same-project' ? '' : '<div class="kpe-actions">' + X.waButton(ctx.policy, 'compare', { a: a, b: b, aId: A.id, bId: B2.id }, 'Ask Ken about ' + a + ' and ' + b, 'compare', 'wa sm') + '</div>')) + '</div>';
    }
    const pa = picker($('#cmpA', el), ctx, { label: 'First development', exclude: () => (B2 ? B2.id : null), onChange: (p) => { A = p; render(); } });
    const pb = picker($('#cmpB', el), ctx, { label: 'Second development', exclude: () => (A ? A.id : null), onChange: (p) => { B2 = p; render(); } });
    // deep links: ?a= and ?b= accept an id or a name; a name that is not exact is never guessed
    const q = new URLSearchParams(location.search);
    [['a', pa], ['b', pb]].forEach((x) => { const v = q.get(x[0]); if (!v) return; if (ctx.ix.byId.has(v)) x[1].set(v, 'init'); else { const r = R.resolve(ctx.ix, v); if (r.status === 'resolved') x[1].set(r.id, 'init'); else if (r.status === 'ambiguous') x[1].message('"' + v + '" matches more than one development. Choose the one you mean.'); else x[1].message('Couldn’t match "' + v + '". Search by name.'); } });
    return { setFirst: (id) => pa.set(id, 'init') };
  }

  const freshLine = (c) => esc('URA transactions to ' + c.freshness.transactionsAsOf + ' · ' + c.freshness.band + ' · last ' + c.freshness.window + ' · report build ' + c.freshness.buildId);
  const bestHtml = (c) => '<div class="kpe-best">' + c.cards.map((cd) => '<div><i>Best for</i><b>' + esc(cd.name) + '</b>' + esc(cd.best) + '</div>').join('') + '</div>';

  /* ---------- library ---------- */
  function libraryCard(c, ctx, source) {
    return '<article class="kpe-card" data-q="' + esc(R.normaliseName([c.title, c.kicker].concat(c.cards.map((x) => x.name), [c.a, c.b]).join(' ')) + ' ' + [c.a, c.b].map((id) => (ctx.ix.byId.get(id) || {}).aliases || []).join(' ')) + '"><p class="kpe-kicker">' + esc(c.kicker) + '</p><h3>' + esc(c.title) + '</h3><p class="kpe-verdict">' + esc(c.verdict) + '</p>' + bestHtml(c) +
      '<p class="kpe-meta">' + freshLine(c) + '</p><details class="kpe-fold"><summary>What this report cannot show</summary><ul>' + c.limitations.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul></details>' +
      '<div class="kpe-actions"><a class="kpe-btn" href="' + ROOT + c.reportPath + '" data-kpt-report="' + esc(c.slug) + '" data-pair="' + esc(c.pair) + '" data-source="' + source + '">Read the comparison</a>' + X.waButton(ctx.policy, 'report', { title: c.title, slug: c.slug }, 'Ask Ken', 'library-card', 'wa sm') + draftBadge + '</div></article>';
  }
  function viewLibrary(ctx) {
    const sec = $('#libList'), count = $('#libCount'), inp = $('#libQ');
    const paint = () => {
      const q = R.normaliseName(inp.value), list = ctx.comps.comparisons.filter((c) => !q || (R.normaliseName([c.title, c.kicker].concat(c.cards.map((x) => x.name)).join(' ') + ' ' + [c.a, c.b].map((id) => ((ctx.ix.byId.get(id) || {}).aliases || []).join(' ')).join(' '))).indexOf(q) >= 0);
      sec.innerHTML = list.length ? list.map((c) => libraryCard(c, ctx, 'library')).join('') : '<div class="kpe-state no"><h3>No comparison matches “' + esc(inp.value) + '”</h3><p>Only pairs with a generated report are listed. Use the compare tool above to check any two developments, or <a class="kpe-link" href="' + ROOT + 'projects/">browse the project directory</a>.</p></div>';
      count.textContent = list.length + (list.length === 1 ? ' comparison' : ' comparisons') + ' available now · every one is a private draft pending review';
    };
    inp.addEventListener('input', paint); paint();
    mountCompare($('#cmp'), ctx);
    $('#dirCount').textContent = ctx.ix.list.length.toLocaleString('en-US');
    X.track('research_library_viewed', {});
    const w = $('#libWa'); if (w) w.innerHTML = X.waButton(ctx.policy, 'library', {}, 'Message Ken on WhatsApp', 'library', 'wa sm');
  }
  function viewCompare(ctx) { mountCompare($('#cmp'), ctx); X.track('research_library_viewed', { page: 'compare' }); }

  /* ---------- directory ---------- */
  function viewDirectory(ctx) {
    const inp = $('#dirQ'), list = $('#dirList'), count = $('#dirCount'), more = $('#dirMore'); let level = 'ALL', onlyCmp = false, limit = 30;
    const rank = (o) => (o.level === 'MICROSITE' ? 0 : o.level === 'FEATURED' ? 1 : o.cmp ? 2 : 3);
    function paint() {
      const q = inp.value.trim(); let rows;
      if (q) { const hits = R.search(ctx.ix, q); rows = hits.map((h) => ctx.ix.byId.get(h.id)); } else rows = ctx.ix.list.slice().sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : 1));
      if (level !== 'ALL') rows = rows.filter((o) => o.level === level); if (onlyCmp) rows = rows.filter((o) => o.cmp > 0);
      const shown = rows.slice(0, limit);
      list.innerHTML = shown.length ? shown.map((o) => '<a class="kpe-row" href="' + ROOT + 'projects/p/#/' + esc(o.id) + '" data-id="' + esc(o.id) + '"><span class="nm">' + esc(o.name) + '<span class="sb">' + esc(subline(o) || [stageText[o.stage], o.note].filter(Boolean).join(' · ') || 'No transaction data in the current dataset') + '</span></span><span class="fl">' + flags(o) + '</span></a>').join('') : '<div class="kpe-state no"><h3>No development found</h3><p>Try fewer words, or check the spelling. Names follow URA’s project names.</p></div>';
      const amb = q && rows.length > 1 ? ' · several developments match, so check the street and district to pick the one you mean' : '';
      count.textContent = rows.length.toLocaleString('en-US') + (rows.length === 1 ? ' development' : ' developments') + amb;
      more.hidden = rows.length <= limit; more.textContent = 'Show ' + Math.min(30, rows.length - limit) + ' more';
    }
    inp.addEventListener('input', () => { limit = 30; paint(); });
    more.addEventListener('click', () => { limit += 30; paint(); });
    document.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', () => { level = b.dataset.lv; document.querySelectorAll('[data-lv]').forEach((x) => x.setAttribute('aria-pressed', x === b)); limit = 30; X.track('project_directory_filtered', { filter: 'level_' + level.toLowerCase() }); paint(); }));
    $('#dirCmp').addEventListener('click', (e) => { onlyCmp = !onlyCmp; e.currentTarget.setAttribute('aria-pressed', onlyCmp); limit = 30; X.track('project_directory_filtered', { filter: 'has_comparison' }); paint(); });
    paint(); X.track('project_directory_viewed', {});
  }

  /* ---------- profile ---------- */
  const STATUS = { verified: ['ok', 'Sources agree'], 'single-source': ['one', 'Single source'], conflict: ['diff', 'Sources differ'] };
  function viewProfile(ctx) {
    const app = $('#app');
    function route() {
      const id = decodeURIComponent((location.hash.match(/^#\/([^/?]+)/) || [, ''])[1]);
      if (!id) { app.innerHTML = '<section class="kpe-hero"><p class="kpt-eyebrow">Projects</p><h1 class="kpt-h1">Which development?</h1><p class="kpt-lede">Pick one to see what is known about it, what Research covers, and where to go next.</p></section><section class="kpe-sec"><div id="pp"></div></section>'; picker($('#pp'), ctx, { label: 'Development', exclude: () => null, onChange: (p) => { if (p) location.hash = '#/' + p.id; } }); return; }
      const row = ctx.ix.byId.get(id); if (!row) { app.innerHTML = '<section class="kpe-hero"><p class="kpt-eyebrow">Projects</p><h1 class="kpt-h1">We couldn’t find that development.</h1><p class="kpt-lede">It may not be in the registry yet, or the link may be out of date.</p><p style="margin-top:16px"><a class="kpe-btn" href="' + ROOT + 'projects/">Search the directory</a></p></section>'; document.title = 'Project not found — Ken Property Tools'; return; }
      (row.level === 'BASIC' && !row.cmp && row.ms == null ? Promise.reject(new Error('basic')) : getJson('data/registry/p/' + id + '.json')).catch(() => null).then((d) => paint(row, d));
    }
    function paint(row, d) {
      document.title = row.name + ' — Ken Property Tools';
      const lv = row.level, facts = d ? d.facts : [{ field: 'district', label: 'District', display: 'District ' + row.district, status: 'verified', sources: [{ ura: true }] }, { field: 'segment', label: 'Market segment', display: row.seg, status: 'verified', sources: [{ ura: true }] }].concat(row.tenure && row.tenure !== '–' ? [{ field: 'tenure', label: 'Tenure', display: row.tenure, status: 'verified', sources: [{ ura: true }] }] : []).concat(row.street ? [{ field: 'street', label: 'Street', display: row.street, status: 'verified', sources: [{ ura: true }] }] : []);
      const cov = d ? d.coverage : { transactions: row.resale ? { resale: row.resale, last: row.last, asOf: ctx.meta.asOf } : null, comparisons: 0 };
      const srcs = d ? d.sources : []; const nref = {}; srcs.forEach((s, i) => { nref[s.n] = i + 1; });
      const cite = (f) => { const l = (f.sources || []).filter((s) => s.n); return l.length ? '<sup>' + l.map((s) => '<a href="#src' + nref[s.n] + '">' + nref[s.n] + '</a>').join(', ') + '</sup>' : ''; };
      const tx = cov.transactions;
      let h = '<p class="kpe-crumbs"><a href="' + ROOT + 'projects/">Projects</a> / ' + esc(row.name) + '</p><h1 class="kpe-title">' + esc(row.name) + '</h1><div class="kpe-layers">' + badge(lv) + (stageText[row.stage] ? '<span class="kpe-tag">' + stageText[row.stage] + '</span>' : '') + (row.cmp ? '<span class="kpe-tag ok">' + row.cmp + ' Research comparison' + (row.cmp > 1 ? 's' : '') + '</span>' : '') + '</div>';
      h += '<p class="kpe-line" style="margin-top:10px">' + esc(subline(row)) + '</p>' + (row.aliases && row.aliases.length ? '<p class="kpe-line">Also known as ' + esc(row.aliases.join(', ')) + '</p>' : '') + (row.note ? '<p class="kpe-line">' + esc(row.note) + '</p>' : '');
      if (d && d.levelNote) h += '<p class="kpe-ribbon"><b>Note.</b> ' + esc(d.levelNote) + '</p>';
      // microsite
      if (d && d.microsite) {
        const m = d.microsite;
        h += '<section class="kpe-sec"><div class="kpe-card kpe-ms"><div class="tx"><h3>' + (m.status === 'configured' ? 'Visit the ' + esc(row.name) + ' site' : m.status === 'planned' ? 'Dedicated site: not live yet' : 'Dedicated site: not connected yet') + '</h3><p>' + esc(m.tagline) + ' ' + (m.status === 'configured' ? 'It is maintained separately, so KPT does not copy its content. Anything updated there appears there straight away.' : m.status === 'planned' ? 'It will be linked here once it is live.' : 'No verified address is on file, so no link is shown.') + '</p></div>' +
          (m.status === 'configured' ? '<a class="kpe-btn" target="_blank" rel="noopener" href="' + esc(X.outbound(m.url, 'project-profile', row.id)) + '" data-kpt-ms="' + esc(row.id) + '" data-host="' + esc(m.host) + '" data-placement="project-profile">Open ' + esc(m.host.split('.').slice(0, 2).join('.')) + ' ↗</a>' : '') + '</div></section>';
      }
      // facts
      h += '<section class="kpe-sec"><h2>What is known</h2><p class="kpe-sub">Facts only, each with how well its sources agree. Nothing here is a recommendation.</p><div class="kpe-card" style="padding-top:12px;padding-bottom:12px"><table class="kpe-facts"><tbody>' +
        facts.map((f) => '<tr><th scope="row">' + esc(f.label.charAt(0).toUpperCase() + f.label.slice(1)) + '</th><td>' + esc(f.display) + cite(f) + ' ' + (STATUS[f.status] && f.status !== 'verified' ? '<span class="kpe-tag ' + STATUS[f.status][0] + '">' + STATUS[f.status][1] + '</span>' : '') + '</td></tr>').join('') + '</tbody></table></div>';
      const unk = d && d.gaps && d.gaps.length ? 'Not known from the sources reviewed: ' + d.gaps.join(', ') + '. ' : '', wh = d && d.withheld && d.withheld.length ? 'Held back until confirmed from an official source: ' + d.withheld.join(', ') + '.' : '';
      if (unk || wh) h += '<p class="kpe-note" style="margin-top:10px">' + esc(unk + wh) + '</p>';
      if (!d) h += '<p class="kpe-note" style="margin-top:10px">This is a basic profile built from URA project data. More detail is added only for projects with sourced, reviewed information.</p>';
      h += '</section>';
      // research
      h += '<section class="kpe-sec"><h2>Research</h2>';
      if (tx) h += '<p class="kpe-sub">' + esc(tx.resale.toLocaleString('en-US')) + ' resale transactions in the URA data, latest ' + esc(tx.last || '') + ' (data to ' + esc(tx.asOf) + ').</p>';
      else h += '<p class="kpe-sub">No transactions for this development are in the current URA dataset, so there is no transaction analysis to show.</p>';
      if (d && d.comparisons.length) {
        h += '<div class="kpe-grid">' + d.comparisons.map((c) => { const lc = ctx.comps.comparisons.find((x) => x.slug === c.slug); return lc ? libraryCard(lc, ctx, 'project') : ''; }).join('') + '</div>';
      } else h += '<div class="kpe-state"><h3>No Research comparison yet</h3><p>Comparisons are generated only for pairs with sourced facts and enough resale data. ' + (tx && tx.resale >= ctx.policy.support.minResaleTransactions ? 'This development has enough resale transactions for one to be prepared.' : '') + '</p></div>';
      h += '<div class="kpe-actions" style="margin-top:14px"><a class="kpe-btn ghost sm" href="' + ROOT + 'research/compare/?a=' + esc(row.id) + '">Compare ' + esc(row.name) + ' with…</a>' + (tx ? '<a class="kpe-btn ghost sm" href="' + ROOT + 'research/#/p/' + esc(row.id) + '">Transaction analysis</a>' : '') + '</div></section>';
      // KPT analysis layer
      if (d && d.fromReports && d.fromReports.length) {
        h += '<section class="kpe-sec"><h2>From the comparisons</h2><p class="kpe-sub">KPT preliminary analysis, prepared with AI assistance, pending review. Taken word for word from the reports.</p><div class="kpe-grid">' + d.fromReports.map((l) => '<div class="kpe-card"><p class="kpe-kicker">Best for, versus ' + esc((ctx.ix.byId.get(l.vs) || {}).name || l.vs) + '</p><p class="kpe-verdict" style="margin:0">' + esc(l.text) + '</p>' + (l.glance && lv === 'FEATURED' ? '<ul class="kpe-note" style="margin:10px 0 0;padding-left:18px">' + l.glance.map((g) => '<li>' + esc(g) + '</li>').join('') + '</ul>' : '') + '</div>').join('') + '</div></section>';
      }
      if (d && d.related && d.related.length) h += '<section class="kpe-sec"><h2>Related</h2><div class="kpe-rows">' + d.related.map((r) => '<a class="kpe-row" href="' + ROOT + 'projects/p/#/' + esc(r.id) + '"><span class="nm">' + esc(r.name) + '<span class="sb">' + esc(r.why) + '</span></span></a>').join('') + '</div></section>';
      // coverage + freshness
      const ly = d ? d.layers : { facts: true, kptAi: false, ken: false };
      h += '<section class="kpe-sec"><h2>How complete is this page?</h2><div class="kpe-card"><table class="kpe-facts"><tbody>' +
        '<tr><th scope="row">Content level</th><td>' + badge(lv) + ' ' + esc(ctx.policy.levels[lv]) + '</td></tr>' +
        '<tr><th scope="row">Facts</th><td>' + (ly.facts ? 'Yes, with sources' : 'URA project data only') + '</td></tr>' +
        '<tr><th scope="row">KPT analysis</th><td>' + (ly.kptAi ? 'Yes, in the comparisons above (pending review)' : 'None yet') + '</td></tr>' +
        '<tr><th scope="row">Ken’s own assessment</th><td>' + (ly.ken ? 'Yes' : 'Not added yet') + '</td></tr>' +
        '<tr><th scope="row">Data freshness</th><td>' + (d && d.freshness.transactionsAsOf ? 'Transactions to ' + esc(d.freshness.transactionsAsOf) : tx ? 'Transactions to ' + esc(ctx.meta.asOf) : 'No transactions') + (d && d.sources.length ? '; facts ' + (d.freshness.factsRetrievedLatest ? 'last retrieved ' + esc(d.freshness.factsRetrievedLatest) : 'retrieval date not recorded') + (d.freshness.undatedSources ? ' (' + d.freshness.undatedSources + ' source' + (d.freshness.undatedSources > 1 ? 's' : '') + ' undated)' : '') : '') + '</td></tr>' +
        '</tbody></table></div></section>';
      if (srcs.length) h += '<section class="kpe-sec" id="sources"><h2>Sources</h2><ol class="kpe-src">' + srcs.map((s, i) => '<li id="src' + (i + 1) + '">' + esc(s.title) + (s.dataset ? '' : s.retrieved ? ', retrieved ' + esc(s.retrieved) : ', retrieval date not recorded') + (s.url ? ' — <a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">link</a>' : '') + '</li>').join('') + '</ol><p class="kpe-note">Secondary sources, cited rather than archived. No official source has been checked.</p></section>';
      h += '<section class="kpe-sec"><div class="kpe-card"><h3>Talk it through</h3><p>If you are considering ' + esc(row.name) + ', Ken can look at your situation.</p><div class="kpe-actions">' + X.waButton(ctx.policy, d && d.microsite && d.microsite.status === 'configured' ? 'microsite' : 'project', { id: row.id, name: row.name }, 'Message Ken on WhatsApp', 'project', 'wa') + '</div></div></section>';
      app.innerHTML = h;
      X.track('project_profile_viewed', { project_id: row.id, content_level: lv });
    }
    window.addEventListener('hashchange', route); route();
  }

  /* ---------- report viewer: the report is shown exactly as built, inside the KPT frame ---------- */
  function viewFrame(ctx) {
    const slug = B.dataset.report, c = ctx.comps.comparisons.find((x) => x.slug === slug); if (!c) return;
    const fr = $('#rpt'), panel = $('#more'), btn = $('#moreBtn');
    const proj = [c.a, c.b].map((id) => ctx.ix.byId.get(id));
    const others = ctx.comps.comparisons.filter((x) => x.slug !== slug && (x.a === c.a || x.b === c.a || x.a === c.b || x.b === c.b));
    getJson('data/registry/p/' + c.a + '.json').then((da) => getJson('data/registry/p/' + c.b + '.json').then((db) => [da, db]).catch(() => [da, null])).catch(() => [null, null]).then((ds) => {
      const rel = {}; ds.forEach((d) => d && (d.related || []).forEach((r) => { if (r.id !== c.a && r.id !== c.b) rel[r.id] = r; }));
      const relRows = Object.keys(rel).map((id) => ({ r: rel[id], row: ctx.ix.byId.get(id) })).filter((x) => x.row);
      panel.innerHTML = '<div class="kpe-panel-in"><div><h2>Keep exploring</h2><ul>' +
        proj.map((p) => '<li><a href="' + ROOT + 'projects/p/#/' + esc(p.id) + '">' + esc(p.name) + ': project page</a></li>').join('') +
        relRows.map((x) => '<li><a href="' + ROOT + 'projects/p/#/' + esc(x.row.id) + '">' + esc(x.row.name) + '</a><small>' + esc(x.r.why) + (x.row.ms === 'configured' ? ' Has its own site.' : '') + '</small></li>').join('') +
        others.map((o) => '<li><a href="' + ROOT + o.reportPath + '" data-kpt-report="' + esc(o.slug) + '" data-pair="' + esc(o.pair) + '" data-source="report">' + esc(o.title) + '</a><small>Another comparison that includes one of these projects.</small></li>').join('') +
        '<li><a href="' + ROOT + 'research/compare/?a=' + esc(c.a) + '&b=">Compare other developments</a></li><li><a href="' + ROOT + 'research/library/">All comparisons</a></li></ul></div>' +
        '<div><h2>Ask Ken</h2><p>Use the buttons inside the report, or start here.</p>' + X.waButton(ctx.policy, 'report', { title: c.title, slug: c.slug }, 'Message Ken on WhatsApp', 'report-frame', 'wa sm') + '<p class="kpe-note" style="margin-top:14px">' + draftBadge + ' KPT preliminary analysis, pending review. Not approved for publication.</p><p class="kpe-note">' + freshLine(c) + '</p></div></div>';
    });
    btn.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; btn.setAttribute('aria-expanded', open); });
    X.track('research_report_viewed', { report: c.slug, pair: c.pair, build_id: c.freshness.buildId, status: c.status });
    fr.addEventListener('load', () => {
      let doc; try { doc = fr.contentDocument; if (!doc) return; } catch (e) { return; }
      doc.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
        if (/^https:\/\/wa\.me\//.test(a.href)) { let ref = ''; try { ref = (decodeURIComponent(a.href.split('text=')[1] || '').match(/Ref ([A-Z0-9-]+)/) || [, ''])[1]; } catch (x) { ref = ''; } X.track('research_whatsapp_clicked', { context: 'report-inline', ref: ref, report: c.slug }); }
      }, true);
    });
  }

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    if (KPT.setContext) KPT.setContext({ tool_name: 'research-v2', tool_category: 'research', project_name: null });
    X.attr();
    X.boot().then((ctx) => {
      ({ library: viewLibrary, compare: viewCompare, directory: viewDirectory, profile: viewProfile, frame: viewFrame }[VIEW] || (() => {}))(ctx);
      B.classList.add('kpe-ready');
    }).catch((e) => { console.error('KPT ecosystem failed to load', e); const m = $('#app') || $('main'); if (m) m.insertAdjacentHTML('afterbegin', '<div class="kpe-state no" style="margin-top:20px"><h3>We couldn’t load this page’s data</h3><p>Please refresh. If you opened the file directly from a folder, run the local preview server instead (node tools/serve-local.js).</p></div>'); });
  });
})();
