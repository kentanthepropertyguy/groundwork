/* KPT project directory: search every development by name and open it in Research. Plain JS, no dependencies.
   Names come from data/registry/index.json; developments with their own site come from data/research/sites.json.
   Nothing about a development is typed here. */
(function () {
  'use strict';
  const R = window.KPT_REGISTRY, KPT = window.KPT = window.KPT || {}, B = document.body, ROOT = B.dataset.root || './';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s) => document.querySelector(s);
  const get = (p) => fetch(ROOT + p).then((r) => { if (!r.ok) throw new Error('nf'); return r.json(); });
  const track = (n, p) => { if (KPT.track) KPT.track(n, p || {}); };
  (function () { try { const k = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'], q = new URLSearchParams(location.search), now = {}; k.forEach((n) => { if (q.get(n)) now[n] = q.get(n).slice(0, 100); }); if (Object.keys(now).length) sessionStorage.setItem('kpt_attr', JSON.stringify(now)); } catch (e) { /* storage unavailable */ } })();
  // Same display names as Research search (URA records names in capitals).
  const nameOf = (o) => (window.KPT_RESEARCH && !/[a-z]/.test(o.name) ? window.KPT_RESEARCH.displayName(o.name) : o.name);
  const subline = (o) => [o.street, o.district ? 'District ' + o.district : null, o.seg, o.tenure && o.tenure !== '–' ? o.tenure : null].filter(Boolean).join(' · ');
  function href(url, id) {
    let saved = {}; try { saved = JSON.parse(sessionStorage.getItem('kpt_attr') || '{}'); } catch (e) { saved = {}; }
    const u = new URL(url);
    if (Object.keys(saved).length) Object.keys(saved).forEach((k) => u.searchParams.set(k, saved[k])); else { u.searchParams.set('utm_source', 'kpt'); u.searchParams.set('utm_medium', 'referral'); u.searchParams.set('utm_campaign', 'directory'); u.searchParams.set('utm_content', id); }
    u.searchParams.set('kpt_from', 'directory'); return u.toString();
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest ? e.target.closest('a[data-kpt-ms]') : null; if (!a) return;
    try { a.href = href(a.getAttribute('href'), a.dataset.kptMs); } catch (x) { /* keep the clean address */ }
    track('microsite_clicked', { project_id: a.dataset.kptMs, destination_host: a.dataset.host, placement: 'directory' });
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    Promise.all([get('data/registry/index.json'), get('data/research/sites.json').catch(() => ({ sites: [] }))]).then((a) => {
      const ix = R.makeIndex(a[0]), sites = {}; (a[1].sites || []).forEach((s) => { sites[s.id] = s; });
      const inp = $('#dirQ'), list = $('#dirList'), count = $('#dirCount'), more = $('#dirMore'); let limit = 30, browse = false; // search-first: the full A–Z list appears only when asked for
      const own = (o) => sites[o.id] && sites[o.id].url;
      function row(o) {
        const s = sites[o.id], tag = own(o) ? '<span class="fl"><span class="kpe-tag">Own site ↗</span></span>' : '';
        const sub = subline(o) || [o.stage === 'new-launch' ? 'New launch' : null, o.note].filter(Boolean).join(' · ');
        const inner = '<span class="nm">' + esc(nameOf(o)) + (sub ? '<span class="sb">' + esc(sub) + '</span>' : '') + '</span>' + tag;
        return own(o) ? '<a class="kpe-row" href="' + esc(s.url) + '" target="_blank" rel="noopener" data-kpt-ms="' + esc(o.id) + '" data-host="' + esc(s.host || '') + '">' + inner + '</a>'
          : '<a class="kpe-row" href="' + ROOT + 'research/#/p/' + esc(o.id) + '">' + inner + '</a>';
      }
      function paint() {
        const q = inp.value.trim();
        const rows = q ? R.search(ix, q).map((h) => ix.byId.get(h.id)) : ix.list.slice().sort((x, y) => (own(y) ? 1 : 0) - (own(x) ? 1 : 0) || (x.name < y.name ? -1 : 1));
        if (!q && !browse) {
          const ownRows = rows.filter(own);
          list.innerHTML = ownRows.map(row).join('');
          count.textContent = ix.list.length.toLocaleString('en-US') + ' developments. Start typing a name above' + (ownRows.length ? ', or open a new launch with its own site below.' : '.');
          more.hidden = false; more.textContent = 'Or browse all ' + ix.list.length.toLocaleString('en-US') + ' A–Z';
          return;
        }
        list.innerHTML = rows.length ? rows.slice(0, limit).map(row).join('') : '<div class="kpe-state"><h3>No development found under that name</h3><p>Try fewer letters, or another spelling.</p></div>';
        count.textContent = rows.length.toLocaleString('en-US') + (rows.length === 1 ? ' development' : ' developments') + (q && rows.length > 1 ? ' · several match, so check the street and district' : '');
        more.hidden = rows.length <= limit; more.textContent = 'Show ' + Math.min(30, rows.length - limit) + ' more';
      }
      inp.addEventListener('input', () => { limit = 30; paint(); }); more.addEventListener('click', () => { if (!browse && !inp.value.trim()) { browse = true; limit = 30; } else limit += 30; paint(); });
      paint(); track('project_directory_viewed', {}); B.classList.add('kpe-ready');
    }).catch(() => { const l = $('#dirList'); if (l) l.innerHTML = '<div class="kpe-state no"><h3>We couldn’t load the directory</h3><p>Please refresh. You can also <a href="' + ROOT + 'research/">search from the Research page</a>.</p></div>'; });
  });
})();
