/* ==========================================================================
   GROUNDWORK — navigation and search (R2.1, Ken 9 Oct 2026).
   One search box for every tool and every development, the full menu, and the "Upgrading from HDB" step strip.
   Tools are found by plain words and by the terms people actually type (ABSD, valuation, HDB upgrade, sale proceeds…).
   Developments come from the same public index Research uses (data/projects/index.json), loaded only when someone searches.
   Privacy: what is typed in the search box is never put in a page address and never sent to analytics; a chosen result
   records only which tool or development was opened. Nothing here calculates anything.
   UMD: window.GWN in the browser; Node uses the same entries and markup to write the pages at build time.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GWN = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAIN = 'https://kentanthepropertyguy.com/', LAUNCHES = 'https://kentanthepropertyguy.com/#developments';
  const ASK_MSG = 'Hi Ken, I’m on Groundwork and would like to talk through my property plans. My situation is ____. (Ref KPT-HOME)';
  const ASK = 'https://wa.me/6590908898?text=' + encodeURIComponent(ASK_MSG);

  /* ---------------- icons (line icons, inline, no requests) ---------------- */
  const ICON = {
    mortgage: '<path d="M4 11 12 4l8 7v9H4z"/><path d="M9 20v-5h6v5"/>',
    'stamp-duty': '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
    ssd: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
    'sale-proceeds': '<path d="M4 7h16v10H4z"/><circle cx="12" cy="12" r="2.4"/><path d="M7 7v10M17 7v10" opacity=".45"/>',
    tdsr: '<path d="M4 19h16"/><path d="M6 19V11M10 19V7M14 19v-9M18 19V5"/>',
    msr: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/><path d="M4 12h16" opacity=".45"/>',
    progressive: '<path d="M4 20h16"/><path d="M6 20v-4h3v4M10.5 20v-8h3v8M15 20V8h3v12"/>',
    'hdb-upgrade': '<path d="M3 12 9 7l6 5"/><path d="M5 11v8h8v-8"/><path d="M15 9l3-2 3 2v10h-6"/>',
    'what-can-i-buy': '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/>',
    worth: '<path d="M5 20V12m5 8V7m5 13v-6m5 6V4"/>',
    research: '<path d="M4 20V8l6-4v16M10 20V10l6 3v7M16 20v-6l4 2v4"/><path d="M3 20h18"/>',
    dev: '<path d="M6 20V5h8v15M14 9h4v11"/><path d="M9 8h2M9 11h2M9 14h2M3 20h18"/>',
    guide: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    home: '<path d="M4 11.5 12 5l8 6.5V20h-5v-5h-6v5H4z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    all: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    ext: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M17 14v5H5V7h5"/>',
    chat: '<path d="M5 18.5 6 15a7 7 0 1 1 3 3z"/>',
    doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
  };
  const svg = (k, size) => '<svg viewBox="0 0 24 24" width="' + (size || 22) + '" height="' + (size || 22) + '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICON[k] + '</svg>';

  /* ---------------- everything a visitor can do here ----------------
     name: plain words · tag: the term people know it by · href: from the site root (or a full address) · t: what people type.
     menu: shown in the menu's tool grid · search: found by the search only (a more specific way into a page that is already listed). */
  const ENTRIES = [
    { id: 'stamp-duty', name: 'Stamp duty', tag: 'BSD · ABSD', short: 'What you pay when you buy', href: 'tools/stamp-duty/', icon: 'stamp-duty', menu: 1, quick: 1, sec: 'tools',
      t: ['stamp duty', 'absd', 'bsd', 'buyers stamp duty', 'additional buyers stamp duty', 'buyer stamp duty', 'duty', 'stamp', 'remission', 'absd remission', 'absd refund', 'second property', 'second home', 'third property', 'foreigner', 'pr buying', 'permanent resident', 'tax when buying', 'property purchase tax'] },
    { id: 'mortgage', name: 'Mortgage repayment', quickName: 'Mortgage', tag: 'Monthly instalment', short: 'Instalment and total interest', href: 'tools/mortgage/', icon: 'mortgage', menu: 1, quick: 1, sec: 'tools',
      t: ['mortgage', 'home loan', 'loan repayment', 'monthly repayment', 'monthly instalment', 'instalment', 'installment', 'monthly payment', 'interest', 'interest rate', 'bank loan', 'hdb loan', 'loan', 'amortisation', 'amortization', 'refinance', 'repricing'] },
    { id: 'tdsr', name: 'How much can I borrow?', tag: 'TDSR', short: 'Your loan limit from income and debts', href: 'tools/tdsr/', icon: 'tdsr', menu: 1, quick: 1, sec: 'tools',
      t: ['tdsr', 'total debt servicing ratio', 'how much can i borrow', 'borrow', 'borrowing', 'loan limit', 'loan eligibility', 'max loan', 'maximum loan', 'loan amount', 'affordability', 'afford', 'ltv', 'loan to value', 'income', 'debt', 'stress test', 'medium term rate'] },
    { id: 'msr', name: 'HDB and EC loan limit', tag: 'MSR', short: 'For HDB flats and new ECs', href: 'tools/msr/', icon: 'msr', menu: 1, sec: 'tools',
      t: ['msr', 'mortgage servicing ratio', 'hdb loan', 'hdb loan limit', 'ec', 'executive condo', 'executive condominium', 'hfe', 'hdb flat eligibility', 'bto', 'resale flat loan', 'hdb flat loan', 'hdb borrow'] },
    { id: 'progressive', name: 'New launch payments', tag: 'Progressive payments', short: 'Cash, CPF and loan at each stage', href: 'tools/progressive-payments/', icon: 'progressive', menu: 1, sec: 'tools',
      t: ['progressive payment', 'progressive payments', 'progressive', 'new launch', 'new launch payment', 'payment schedule', 'under construction', 'uncompleted', 'booking fee', 'option fee', 'developer', 'construction stages', 'stages', 'top', 'temporary occupation permit', 'downpayment', 'down payment', 'cash needed'] },
    { id: 'sale-proceeds', name: 'Sale proceeds', tag: 'Cash and CPF back', short: 'What you get back when you sell', href: 'tools/sale-proceeds/', icon: 'sale-proceeds', menu: 1, quick: 1, sec: 'tools',
      t: ['sale proceeds', 'proceeds', 'selling', 'sell', 'sell my flat', 'sell my hdb', 'sell my condo', 'cash proceeds', 'net proceeds', 'cpf refund', 'refund cpf', 'accrued interest', 'cpf accrued interest', 'how much will i get', 'cash from sale', 'agent commission', 'selling costs'] },
    { id: 'ssd', name: 'Selling within 4 years?', tag: 'SSD', short: 'Seller’s Stamp Duty', href: 'tools/ssd/', icon: 'ssd', menu: 1, sec: 'tools',
      t: ['ssd', 'sellers stamp duty', 'seller stamp duty', 'selling stamp duty', 'sell within', 'sell early', 'selling early', 'holding period', 'minimum holding', 'stamp duty selling'] },
    { id: 'hdb-upgrade', name: 'HDB upgrade planner', tag: 'Direct budget calculation', short: 'Your private-home budget if you sell first', href: 'tools/hdb-upgrade/', icon: 'hdb-upgrade', menu: 1, sec: 'tools',
      t: ['hdb upgrade', 'upgrade', 'upgrading', 'upgrader', 'hdb to condo', 'hdb to private', 'upgrade from hdb', 'can i afford to upgrade', 'afford a condo', 'private property budget', 'sell hdb buy condo', 'next home budget', 'budget'] },
    { id: 'what-can-i-buy', name: 'What can this budget buy?', tag: 'Homes that sold around your budget', short: 'What homes around your budget sold for', href: 'tools/what-can-i-buy/', icon: 'what-can-i-buy', menu: 1, sec: 'research',
      t: ['what can i buy', 'budget', 'my budget', 'price range', 'find a condo', 'find a home', 'which condo', 'shortlist', 'space', 'size', 'sq ft', 'square feet', 'older condo', 'newer condo'] },
    { id: 'worth', name: 'Property values & prices', tag: 'HDB, condo and landed sales · asking price', short: 'What comparable homes sold for', href: 'journey/worth/', icon: 'worth', menu: 1, sec: 'research',
      t: ['valuation', 'value', 'home value', 'worth', 'whats my home worth', 'how much is my flat worth', 'how much is my home worth', 'hdb price', 'hdb prices', 'hdb resale', 'resale price', 'resale prices', 'hdb valuation', 'asking price', 'fair price', 'overpriced', 'is the price fair', 'my block', 'block resales', 'recent sales', 'landed', 'landed prices', 'terrace', 'semi d', 'bungalow', 'transacted price', 'property value', 'property values', 'market price', 'market prices', 'home prices', 'house prices', 'condo price', 'condo prices', 'condo value', 'landed sales', 'landed value', 'comparable sales', 'hdb and home prices', 'what is my home worth', 'what is my house worth', 'how much is my house worth', 'what is my property worth', 'home worth'] },
    { id: 'ask-hdb', name: 'Check an HDB asking price', tag: 'Against resales in the block', href: 'journey/worth/#hdb', icon: 'worth', search: 1, sec: 'research',
      t: ['asking price', 'hdb asking price', 'check asking price', 'is the asking price fair', 'resale flat price', 'buying a resale flat', 'cov', 'cash over valuation', 'overpriced'] },
    { id: 'ask-condo', name: 'Check a condo asking price', tag: 'Pick the development, then “Check an asking price”', href: 'research/', icon: 'research', search: 1, sec: 'research',
      t: ['asking price', 'condo asking price', 'check asking price', 'is the asking price fair', 'condo price', 'psf', 'price per square foot', 'overpriced', 'condo valuation'] },
    { id: 'research', name: 'Research a development', tag: 'Prices by size · compare', short: 'Any of 2,000+ private developments', href: 'research/', icon: 'research', start: 1, sec: 'research',
      t: ['research', 'development', 'condo', 'condominium', 'apartment', 'project', 'transactions', 'transacted', 'psf', 'price per square foot', 'compare', 'comparison', 'compare condos', 'condo prices', 'private property', 'ura', 'caveats', 'valuation', 'condo valuation'] },
    { id: 'guide', name: 'Guide me', tag: 'Not sure where to start? Step by step', short: 'Tell us your goal; we take you through it', href: 'journey/', icon: 'guide', start: 1, sec: 'guide',
      t: ['guide', 'guide me', 'help me figure it out', 'figure it out', 'guided', 'guided journey', 'help', 'help me', 'where to start', 'start', 'beginner', 'first time', 'first home', 'first-time buyer', 'steps', 'plan', 'planning', 'what should i do', 'not sure'] },
    { id: 'guide-up', name: 'Upgrade from HDB', tag: 'The complete four-step process: value, proceeds, budget, homes', href: 'journey/#up', icon: 'hdb-upgrade', search: 1, sec: 'guide',
      t: ['hdb upgrade', 'upgrade', 'upgrading', 'upgrade from hdb', 'sell hdb', 'moving', 'move', 'right size', 'rightsizing', 'downsizing', 'downgrade'] },
    { id: 'guide-buy', name: 'Buy a home', tag: 'A first home, or another without selling', href: 'journey/#buy', icon: 'home', search: 1, sec: 'guide',
      t: ['buy', 'buying', 'looking to buy', 'first home', 'first property', 'buy a condo', 'buy a home', 'purchase'] },
    { id: 'guide-sell', name: 'Sell, or check my home’s value', tag: 'What homes like yours sold for, then your proceeds', href: 'journey/worth/', icon: 'worth', search: 1, sec: 'guide',
      t: ['sell', 'selling', 'sell my home', 'sell my flat', 'home value'] },
    { id: 'guide-move', name: 'Other moves', tag: 'Selling a condo or landed home, downsizing', href: 'journey/#move', icon: 'guide', search: 1, sec: 'guide',
      t: ['moving', 'move', 'downsize', 'downsizing', 'right size', 'rightsizing', 'sell condo', 'sell landed', 'sell then buy'] },
    { id: 'directory', name: 'Browse every development', tag: 'A–Z list', href: 'projects/', icon: 'list', start: 1, sec: 'research',
      t: ['browse', 'all developments', 'directory', 'list', 'a to z', 'every development', 'all condos'] },
    { id: 'sample', name: 'Sample research report', tag: 'Jadescape or Thomson Three?', href: 'research/sample/', icon: 'doc', search: 1, sec: 'research',
      t: ['sample', 'report', 'sample report', 'research report', 'detailed research', 'comparison report'] },
    { id: 'launches', name: 'New launches', tag: 'On Ken’s main site', href: LAUNCHES, icon: 'ext', ext: 1,
      t: ['new launches', 'new launch', 'launch', 'launches', 'showflat', 'show flat', 'development guides', 'lucerne grand', 'thomson reserve', 'hougang central', 'preview'] },
    { id: 'main-site', name: 'Ken Tan · The Property Guy', tag: 'Ken’s main site', href: MAIN, icon: 'ext', ext: 1,
      t: ['ken', 'ken tan', 'the property guy', 'about', 'about ken', 'agent', 'property agent', 'huttons', 'main site', 'contact', 'tiktok'] },
    { id: 'ask', name: 'Ask Ken on WhatsApp', tag: 'He replies personally', href: ASK, icon: 'chat', ext: 1,
      t: ['whatsapp', 'ask ken', 'ask', 'contact', 'talk', 'call', 'message', 'speak to agent', 'appointment', 'viewing', 'help me'] },
  ];
  const byId = {}; ENTRIES.forEach((e) => { byId[e.id] = e; });
  // The three ways in, named the same everywhere (header, menu, homepage, footer, search results).
  const SECTIONS = {
    guide: { name: 'Guide me', href: 'journey/', nav: 'journey', q: 'Not sure where to start?', say: 'Pick your goal. We take you through the right tools, step by step.', ids: ['guide-buy', 'guide-up', 'guide-sell', 'guide-move'] },
    tools: { name: 'Tools', href: 'tools/', nav: 'tools', q: 'Know what to work out?', say: 'Calculators for stamp duty, loans, sale proceeds and more.', ids: ['stamp-duty', 'tdsr', 'msr', 'mortgage', 'progressive', 'sale-proceeds', 'ssd', 'hdb-upgrade'] },
    research: { name: 'Research', href: 'research/', nav: 'research', q: 'Looking at a property?', say: 'What homes really sold for, from URA and HDB records.', ids: ['research', 'worth', 'what-can-i-buy', 'directory', 'sample'] },
  };
  const SEC_ORDER = ['guide', 'tools', 'research'];
  const MENU_TOOLS = SECTIONS.tools.ids;
  const QUICK = ['stamp-duty', 'tdsr', 'mortgage', 'sale-proceeds', 'hdb-upgrade'];
  const href = (e, r) => (e.ext ? e.href : (r || '') + e.href);

  /* ---------------- matching tools ---------------- */
  // Audit A5-12: accents are stripped on both sides ("verde" finds Verdé), before anything else is dropped.
  const deaccent = (s) => { const t = String(s || ''); return t.normalize ? t.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : t; };
  const norm = (s) => deaccent(s).toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9&]+/g, ' ').trim();
  // At most one typing slip (one letter missing, extra, or different), used only when nothing matches exactly.
  function oneEdit(a, b) {
    if (a === b) return true; const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, d = 0;
    while (i < la && j < lb) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
    return d + (la - i) + (lb - j) <= 1;
  }
  const TYPO_MIN = 5;   // shorter words are too easily confused with other words
  function scoreText(text, q) {
    const t = norm(text); if (!t || !q) return 0;
    if (t === q) return 100;
    if (q.length >= 2 && t.indexOf(q) === 0) return 72 - Math.min(20, t.length - q.length);
    if (t.length >= 3 && (' ' + q + ' ').indexOf(' ' + t + ' ') >= 0) return 60 + Math.min(20, t.length); // "absd for a pr" contains "absd"
    if (q.length >= 3 && (' ' + t).indexOf(' ' + q) >= 0) return 45;
    if (q.length >= 4 && t.indexOf(q) >= 0) return 30;
    return 0;
  }
  function scoreEntry(e, q) {
    let s = Math.max(scoreText(e.name, q), scoreText(e.tag, q) * 0.9);
    e.t.forEach((x) => { s = Math.max(s, scoreText(x, q)); });
    if (s && e.search) s -= 6; // a specific way into a page: listed after the tool itself
    if (s && e.ext) s -= 4;
    return s;
  }
  function scoredTools(query, max) {
    const q = norm(query); if (!q) return [];
    let hits = ENTRIES.map((e, i) => ({ e, i, s: scoreEntry(e, q) })).filter((x) => x.s > 0);
    if (!hits.length && q.length >= TYPO_MIN && q.indexOf(' ') < 0) {   // "valuaton" → valuation
      hits = ENTRIES.map((e, i) => ({ e, i, s: [e.name, e.tag].concat(e.t).some((x) => norm(x).split(' ').some((w) => w.length >= TYPO_MIN && oneEdit(w, q))) ? 20 - (e.search ? 6 : 0) - (e.ext ? 4 : 0) : 0 })).filter((x) => x.s > 0);
    }
    return hits.sort((a, b) => b.s - a.s || a.i - b.i).slice(0, max || 5);
  }
  const matchTools = (query, max) => scoredTools(query, max).map((x) => x.e);

  /* ---------------- matching developments (the index Research uses) ---------------- */
  // Display names exactly as Research shows them (same rules as KPT_RESEARCH.displayName; a test keeps them equal).
  const ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/;
  const ACRONYMS = { AMO: 1, RVG: 1, JLB: 1, OUE: 1, PLQ: 1, SCK: 1, SKT: 1, TMW: 1, YGK: 1, MKZ: 1 };
  const NAME_FIX = { 'VERD� JOO CHIAT': 'Verdé Joo Chiat', 'ENCHANT�': 'Enchanté' };
  function displayName(name) {
    if (Object.prototype.hasOwnProperty.call(NAME_FIX, name)) return NAME_FIX[name];
    const SMALL = { AT: 1, OF: 1, THE: 1, BY: 1, ON: 1 };
    return String(name || '').split(' ').map((w, i) => {
      if (w === '@' || /\d/.test(w) || ROMAN.test(w) || ACRONYMS[w]) return w;
      if (i > 0 && SMALL[w]) return w.toLowerCase();
      if (w.length <= 2 && /^[A-Z]+$/.test(w)) return w;
      return w.toLowerCase().replace(/(^|[-'(])([a-z])/g, (_, x, y) => x + y.toUpperCase());
    }).join(' ');
  }
  const title = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = (ym) => { const m = /^(\d{4})-(\d{2})$/.exec(ym || ''); return m ? MON[+m[2] - 1] + ' ' + m[1] : ''; };
  const dnorm = (s) => norm(s).replace(/&/g, ' ').replace(/\s+/g, ' ').trim();
  // ix: { fields, rows } from data/projects/index.json. Name matches first (start, then a word, then anywhere), then the street.
  function matchDevs(ix, query, max) {
    const q = dnorm(query); if (q.length < 2 || !ix || !ix.rows) return [];
    const F = {}; ix.fields.forEach((f, i) => { F[f] = i; });
    const qc = q.replace(/ /g, '');
    const out = [];
    // Names are matched as Research shows them (displayName), so a stored name with a lost accent ("VERD\uFFFD") and a corrected one both match.
    const names = ix.rows.map((r) => dnorm(displayName(r[F.name])).replace(/^ +/, ''));
    ix.rows.forEach((r, k) => {
      const n = names[k], nc = n.replace(/ /g, '');
      let s = 0;
      if (n === q || nc === qc) s = 100; else if (n.indexOf(q) === 0 || nc.indexOf(qc) === 0) s = 80; else if ((' ' + n).indexOf(' ' + q) >= 0) s = 60; else if (q.length >= 3 && nc.indexOf(qc) >= 0) s = 40;
      else if (q.length >= 4 && (' ' + dnorm(r[F.street])).indexOf(' ' + q) >= 0) s = 15;
      if (s) out.push({ s, r });
    });
    if (!out.length && qc.length >= TYPO_MIN) {   // "jadscape" → Jadescape: one slip against the start of a name or one of its words
      ix.rows.forEach((r, k) => { const n = names[k], nc = n.replace(/ /g, ''); if (oneEdit(nc.slice(0, qc.length), qc) || oneEdit(nc.slice(0, qc.length + 1), qc) || oneEdit(nc.slice(0, Math.max(0, qc.length - 1)), qc) || n.split(' ').some((w) => w.length >= TYPO_MIN && oneEdit(w, qc))) out.push({ s: 20, r }); });
    }
    return out.sort((a, b) => b.s - a.s || b.r[F.n] - a.r[F.n]).slice(0, max || 6).map((x) => {
      const r = x.r;
      return { id: r[F.id], name: displayName(r[F.name]), street: title(r[F.street]), district: Number(r[F.district]), n: r[F.n], last: r[F.last], byStreet: x.s === 15, score: x.s };
    });
  }
  // Developments with their own site (data/research/sites.json): the configured ones, by name or alias.
  function matchSites(sites, query) {
    const q = dnorm(query); if (q.length < 3 || !sites || !sites.sites) return [];
    return sites.sites.filter((s) => s.url && [s.name].concat(s.aliases || []).some((a) => (' ' + dnorm(a)).indexOf(' ' + q) >= 0)).map((s) => ({ id: s.id, name: s.name, url: s.url, tagline: s.tagline }));
  }

  /* ---------------- markup ---------------- */
  const row = (e, r, cls) => '<a class="' + (cls || 'gw-mi') + '" href="' + esc(href(e, r)) + '"' + (e.ext ? ' target="_blank" rel="noopener"' : '') + ' data-gw-nav-to="' + e.id + '">' + svg(e.icon) + '<span><b>' + esc(e.name) + (e.ext ? ' <i aria-hidden="true">↗</i>' : '') + '</b><small>' + esc(e.tag) + '</small></span></a>';
  // The search box (hidden until the script runs, so there is never a box that does nothing).
  let sxN = 0;
  // kind 'devs': developments only (the "Condo or apartment" box on Property values & market prices).
  function searchHtml(kind, placeholder, after) {
    const id = 'gwsx-' + kind + '-' + (++sxN);
    return '<div class="gw-sx gw-sx-' + kind + '" data-gw-search="' + kind + '"' + (kind === 'devs' ? ' data-gw-devs' : '') + ' hidden><label class="gw-sx-box" for="' + id + 'i">' + svg('search', 20) + '<span class="gw-vh">' + (kind === 'devs' ? 'Search developments' : 'Search tools and developments') + '</span>' +
      '<input id="' + id + 'i" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="' + id + 'l" placeholder="' + esc(placeholder || 'Search a tool or a development') + '"></label>' +
      '<div class="gw-sx-res" id="' + id + 'r" hidden></div>' + (after || '') + '</div>';
  }
  // The full menu: search, then the three ways in (Guide me, Tools, Research) with everything in each, then Ken's other sites.
  // Side by side on a wide screen, one after another on a phone.
  function menuHtml(r) {
    const sec = (k) => { const S = SECTIONS[k]; return '<section class="gw-ms gw-ms-' + k + '"><a class="gw-msh" href="' + r + S.href + '" data-gw-nav-to="' + S.nav + '"><b>' + S.name + '</b><span aria-hidden="true">›</span></a><p class="gw-msq">' + esc(S.q) + '</p>' +
      '<div class="gw-ml">' + S.ids.map((id) => row(byId[id], r)).join('') + '</div>' + (k === 'tools' ? '<a class="gw-mall" href="' + r + 'tools/" data-gw-nav-to="tools">All tools, with what each one does ›</a>' : '') + '</section>'; };
    return '<div class="gw-mx">' + searchHtml('menu', 'Search, e.g. ABSD or Jadescape') +
      '<div class="gw-mx-body" data-gw-menu-body><div class="gw-mcols">' + SEC_ORDER.map(sec).join('') + '</div>' +
      '<div class="gw-mfoot"><a class="gw-mhome" href="' + (r || './') + '" data-gw-nav-to="home">' + svg('home', 18) + 'Home</a>' + row(byId['main-site'], r) + row(byId.launches, r) +
      '<a class="gw-mask" href="' + esc(ASK) + '" target="_blank" rel="noopener" data-gw-nav-to="ask">' + svg('chat', 20) + 'Ask Ken on WhatsApp</a>' +
      // Audit V3-05: one place, on every page, to remove the figures this tab remembers for the tools
      '<p class="gw-mclear"><button type="button" class="gw-link" data-gw-clear-all>Clear my figures</button> <span>Removes the figures this tab remembers for every tool.</span></p></div></div></div>';
  }
  // Homepage: one card for each way in (Guide me is drawn by the page itself; Tools and Research here).
  function doorHtml(k, r, inner, more) {
    const S = SECTIONS[k];
    return '<div class="gw-door gw-door-' + k + '"><p class="gw-lane">' + esc(S.q) + '</p><h2 class="gw-door-t"><a href="' + r + S.href + '" data-gw-nav-to="' + S.nav + '">' + S.name + ' <span aria-hidden="true">›</span></a></h2><p class="gw-door-s">' + esc(S.say) + '</p>' + inner + (more || '') + '</div>';
  }
  // On the three section pages (phones and tablets): the same three names as one row, the current one marked.
  function secSwitch(cur, r) {
    return '<nav class="gw-secs" aria-label="Ways to use Groundwork">' + SEC_ORDER.map((k) => { const S = SECTIONS[k]; return '<a href="' + r + S.href + '" data-gw-nav-to="' + S.nav + '"' + (k === cur ? ' aria-current="page"' : '') + '>' + S.name + '</a>'; }).join('') + '</nav>';
  }
  function researchRows(r) { return '<div class="gw-ml gw-rrows">' + SECTIONS.research.ids.slice(0, 4).map((id) => row(byId[id], r)).join('') + '</div>'; }
  // Homepage quick tools: five tools and "All tools".
  function quickHtml(r) {
    return '<div class="gw-qt">' + QUICK.map((id) => { const e = byId[id]; return '<a href="' + r + e.href + '" data-tool="' + id + '">' + svg(e.icon, 26) + '<b>' + esc(e.quickName || e.name) + '</b><small>' + esc(e.tag) + '</small></a>'; }).join('') +
      '<a href="' + r + 'tools/" data-tool="all">' + svg('all', 26) + '<b>All tools</b><small>Every calculator</small></a></div>';
  }

  /* ---------------- the "Upgrading from HDB" path ---------------- */
  // Four pages that each work on their own; when a visitor follows the path (journey #up, or "HDB flat" when moving),
  // a strip shows where they are and what is next. Kept for this tab only, in the journey context.
  const UP = [['worth', 'Flat value', 'journey/worth/#hdb'], ['sale-proceeds', 'Sale proceeds', 'tools/sale-proceeds/#hdb'], ['hdb-upgrade', 'Budget', 'tools/hdb-upgrade/'], ['what-can-i-buy', 'What it buys', 'tools/what-can-i-buy/']];
  // done: which steps this tab has actually finished (a tick only for those); the current step is marked, the next one offered.
  function stripHtml(cur, r, done) {
    const i = UP.findIndex((x) => x[0] === cur); if (i < 0) return '';
    const nx = UP[i + 1], D = done || {};
    return '<nav class="gw-strip" aria-label="Upgrading from HDB, step ' + (i + 1) + ' of 4" data-gw-strip><div class="gw-strip-h"><b>Upgrading from HDB <span>· Step ' + (i + 1) + ' of 4</span></b><button type="button" class="gw-link" data-gw-strip-off>Hide</button></div><ol>' +
      UP.map((x, k) => { const ok = k !== i && D[x[0]]; return '<li' + (k === i ? ' aria-current="step"' : ok ? ' class="done"' : '') + '><a href="' + r + x[2] + '" data-gw-nav-to="up-' + x[0] + '"><i>' + (ok ? '✓' : k + 1) + '</i>' + x[1] + '</a></li>'; }).join('') + '</ol>' +
      (nx ? '<a class="gw-strip-next" href="' + r + nx[2] + '" data-gw-nav-to="up-' + nx[0] + '">Next: ' + nx[1] + ' ›</a>' : '<span class="gw-strip-next done">Last step. Ken can look at the whole picture with you.</span>') + '</nav>';
  }
  const UP_GO = { worth: 'Start: look up my block', 'sale-proceeds': 'Next: work out my sale proceeds', 'hdb-upgrade': 'Next: work out my budget', 'what-can-i-buy': 'Next: see what it buys' };
  // What this tab has finished on the upgrade path (sessionStorage only; nothing leaves the page).
  // Audit A3-07: the same fingerprint as KPT_MARKET.finStamp (kpt-market.js; a test keeps them equal) of the earlier steps' figures
  // a planner budget used. A budget whose fingerprint no longer matches is out of date, so its step is not ticked.
  const FIN_KEYS = ['homeType', 'sellPrice', 'outstandingLoan', 'cpfPrincipal', 'cpfInterest', 'borrowers.0.age', 'borrowers.0.fixed', 'borrowers.1.age', 'borrowers.1.fixed', 'borrowers.0.variable', 'borrowers.0.rental', 'borrowers.1.variable', 'borrowers.1.rental'];
  function finStamp(storage) {
    let s = {}; try { s = JSON.parse(storage.getItem('gw.fin.v1') || '{}') || {}; } catch (e) { s = {}; }
    const val = (v) => { if (v === undefined || v === null || v === '') return ''; const n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return /^[\d,.\s$]+$/.test(String(v)) && isFinite(n) ? String(n) : String(v); };
    const str = FIN_KEYS.map((k) => k + '=' + val(s[k])).join('|');
    let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  function upDone() {
    const g = (k) => { try { return JSON.parse(root.sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    const C = g('gw.ctx.v1') || {}, F = g('gw.fin.v1') || {}, H = g('kpt.handoff');
    const stale = !!(H && H.from === 'hdb-upgrade' && typeof H.src === 'string' && H.src !== finStamp(root.sessionStorage));
    return { worth: !!(C.hdb && C.hdb.block), // looked up, even when the block had few or no resales
      'sale-proceeds': !!(F.sellPrice && F.homeType === 'hdb'), 'hdb-upgrade': !!g('kpt.hdb.input') && !stale, 'what-can-i-buy': false };
  }
  // Audit A3-07/A5-08/A6-07: "Clear" removes every figure this tab holds for the journey (all gw.* and kpt.* keys). Only which path
  // the visitor is on, and what they own, are kept, so the step strip stays; no figure is kept.
  function clearJourney() {
    const st = root.sessionStorage; if (!st) return;
    try {
      let keep = null; try { const c = JSON.parse(st.getItem('gw.ctx.v1') || 'null'); if (c && (c.path || c.type)) keep = { v: 1, path: c.path || null, type: c.type || null }; } catch (e) { keep = null; }
      const ks = []; for (let i = 0; i < st.length; i++) { const k = st.key(i); if (/^(gw|kpt)\./.test(k)) ks.push(k); }
      ks.forEach((k) => st.removeItem(k));
      if (keep) st.setItem('gw.ctx.v1', JSON.stringify(keep));
    } catch (e) { /* storage blocked */ }
  }

  /* ---------------- browser behaviour ---------------- */
  function mount() {
    if (typeof document === 'undefined') return;
    const KPT = () => root.KPT || { track: function () {} }, track = (n, p) => { try { KPT().track(n, p || {}); } catch (e) { /* analytics unavailable */ } };
    const me = document.querySelector('script[src*="assets/js/gw-nav.js"]');
    const base = me ? me.src.replace(/assets\/js\/gw-nav\.js.*$/, '') : (document.body.dataset.root || './');
    const ctxKey = 'gw.ctx.v1', getCtx = () => { try { return JSON.parse(root.sessionStorage.getItem(ctxKey) || '{}') || {}; } catch (e) { return {}; } };
    const setCtx = (p) => { try { root.sessionStorage.setItem(ctxKey, JSON.stringify(Object.assign(getCtx(), p, { v: 1 }))); } catch (e) { /* storage blocked */ } };

    // ---- the menu ----
    const menus = [].slice.call(document.querySelectorAll('details.gw-menu'));
    const phone = () => root.matchMedia && root.matchMedia('(max-width: 899px)').matches;
    // Audit A5-10: while the phone menu covers the page, the page behind it is inert, so the keyboard stays in the menu.
    const lock = (on) => {
      const L = !!on && phone(); document.documentElement.classList.toggle('gw-lock', L);
      [].slice.call(document.body.children).forEach((el) => { if (el.tagName === 'SCRIPT' || menus.some((d) => el.contains(d))) return; if (L) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
    };
    menus.forEach((d) => {
      d.addEventListener('toggle', () => { lock(d.open); const s = d.querySelector('summary'); if (s) s.setAttribute('aria-expanded', String(d.open)); if (d.open) track('nav_menu_opened', {}); });
      d.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a'); if (a) { d.open = false; lock(false); } });
    });
    if (root.matchMedia) { const mq = root.matchMedia('(max-width: 899px)'); const re = () => lock(menus.some((d) => d.open)); if (mq.addEventListener) mq.addEventListener('change', re); }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menus.forEach((d) => { if (d.open) { d.open = false; lock(false); const s = d.querySelector('summary'); if (s) s.focus(); } }); });
    // Audit A5-10: Tab and Shift+Tab wrap inside the open phone menu (its Close button, search and links).
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !phone()) return; const d = menus.find((x) => x.open); if (!d) return;
      const f = [].slice.call(d.querySelectorAll('summary, a[href], button, input, [tabindex]:not([tabindex="-1"])')).filter((x) => !x.disabled && x.getClientRects().length && !x.closest('[hidden]'));
      if (!f.length) return; const i = f.indexOf(document.activeElement);
      if (i < 0 || (!e.shiftKey && i === f.length - 1) || (e.shiftKey && i === 0)) { e.preventDefault(); (e.shiftKey ? f[f.length - 1] : f[0]).focus(); }
    });
    document.addEventListener('click', (e) => { menus.forEach((d) => { if (d.open && !d.contains(e.target) && !(e.target.closest && e.target.closest('[data-gw-open-search]'))) { d.open = false; lock(false); } }); });
    [].slice.call(document.querySelectorAll('[data-gw-open-search]')).forEach((b) => {
      b.hidden = false;
      b.addEventListener('click', () => { const d = menus[0]; if (!d) return; d.open = true; lock(true); const i = d.querySelector('[data-gw-search] input'); if (i) setTimeout(() => i.focus(), 30); });
    });
    // Where a link from the menu or search goes (the tool or page only, never what was typed).
    document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('[data-gw-nav-to]'); if (a) track('nav_select', { target: a.dataset.gwNavTo, placement: a.closest('[data-gw-search]') ? 'search' : a.closest('.gw-menu') ? 'menu' : 'page' }); });

    // ---- search ----
    let ixP = null, sitesP = null;
    const loadIx = () => ixP || (ixP = fetch(base + 'data/projects/index.json').then((x) => (x.ok ? x.json() : null)).catch(() => { ixP = null; return null; }));
    const loadSites = () => sitesP || (sitesP = fetch(base + 'data/research/sites.json').then((x) => (x.ok ? x.json() : null)).catch(() => null));
    [].slice.call(document.querySelectorAll('[data-gw-search]')).forEach((box) => {
      box.hidden = false;
      const inp = box.querySelector('input'), res = box.querySelector('.gw-sx-res'), body = box.closest('.gw-mx') ? box.closest('.gw-mx').querySelector('[data-gw-menu-body]') : null;
      let active = -1, seq = 0; const devsOnly = box.hasAttribute('data-gw-devs');
      const items = () => [].slice.call(res.querySelectorAll('[role="option"]'));
      const setActive = (k) => { const it = items(); active = it.length ? (k + it.length) % it.length : -1; it.forEach((a, j) => a.setAttribute('aria-selected', String(j === active))); if (active >= 0) { inp.setAttribute('aria-activedescendant', it[active].id); it[active].scrollIntoView({ block: 'nearest' }); } else inp.removeAttribute('aria-activedescendant'); };
      const opt = (k, h, inner, extra) => '<a role="option" id="' + res.id + '-' + k + '" class="gw-sx-r" href="' + esc(h) + '"' + (extra || '') + '>' + inner + '</a>';
      function render(q, devs, sites, loading, failed) {
        const st = devsOnly ? [] : scoredTools(q, devs && devs.length ? 4 : 6), tools = st.map((x) => x.e);
        const all = (sites || []).map((s) => ({ site: s })).concat(devs || []);
        // A development whose name starts with what was typed comes first, unless a tool matches the words exactly (ABSD, mortgage…).
        const devFirst = all.length && ((sites && sites.length) || (all[0].score || 0) >= 80) && !(st[0] && st[0].s >= 90);
        let h = '', k = 0, after = '';
        // Audit A5-27: the listbox holds only options, in labelled groups; the group headings are visual only.
        const group = (label, inner) => '<div role="group" aria-label="' + label + '" style="display:grid;gap:1px"><p class="gw-sx-h" aria-hidden="true">' + label + '</p>' + inner + '</div>';
        const toolsHtml = () => (tools.length ? group('Pages', tools.map((e) => opt(k++, href(e, base), svg(e.icon) + '<span><b>' + esc(e.name) + (e.ext ? ' <i aria-hidden="true">↗</i>' : '') + '</b><small>' + (e.sec ? '<em class="gw-sec gw-sec-' + e.sec + '">' + SECTIONS[e.sec].name + '</em> ' : '') + esc(e.tag) + '</small></span>', ' data-gw-nav-to="' + e.id + '"' + (e.ext ? ' target="_blank" rel="noopener"' : ''))).join('')) : '');
        if (!devFirst) h += toolsHtml();
        if (all.length) h += group('Developments · Research', all.map((d) => d.site
          ? opt(k++, d.site.url, svg('ext') + '<span><b>' + esc(d.site.name) + ' <i aria-hidden="true">↗</i></b><small>Ken’s site for this development</small></span>', ' data-gw-nav-to="site-' + esc(d.site.id) + '" target="_blank" rel="noopener"')
          : opt(k++, base + 'research/#/p/' + encodeURIComponent(d.id), svg('dev') + '<span><b>' + esc(d.name) + '</b><small>' + esc([d.street, 'District ' + d.district, d.n + ' sale' + (d.n === 1 ? '' : 's') + ' in 5 years'].join(' · ')) + '</small></span>', ' data-gw-nav-to="development"')).join(''));
        if (devFirst) h += toolsHtml();
        // Audit A5-11: if the development list couldn't load, say so instead of quietly showing tools only.
        if (failed) after += '<p class="gw-sx-note" data-gw-sx-failed>Development search didn’t load. Check your connection and try again, or <a href="' + base + 'projects/" data-gw-nav-to="directory">browse every development</a>.</p>';
        if (loading) after += '<p class="gw-sx-note">Searching developments…</p>';
        else if (!tools.length && !all.length && !failed) after += '<p class="gw-sx-note">Nothing matches “' + esc(q.slice(0, 40)) + '”. ' + (devsOnly ? 'Try part of the development’s name.' : 'Try a development name, or words like stamp duty, ABSD, mortgage, valuation or HDB upgrade.') + ' Executive condos and cluster houses aren’t covered in Research yet.</p>'; // V2-05
        else if (all.length) after += '<a class="gw-sx-more" href="' + base + 'projects/" data-gw-nav-to="directory">Not listed? Browse every development ›</a>';
        res.innerHTML = (h ? '<div role="listbox" id="' + inp.getAttribute('aria-controls') + '" aria-label="Search results" style="display:grid;gap:1px">' + h + '</div>' : '') + after;
        res.hidden = false; inp.setAttribute('aria-expanded', 'true'); if (body) body.hidden = true;
        setActive(0);
      }
      function clear() { res.hidden = true; res.innerHTML = ''; inp.setAttribute('aria-expanded', 'false'); active = -1; if (body) body.hidden = false; }
      let tmr;
      function run() {
        const q = inp.value.trim(), my = ++seq;
        if (!q) { clear(); return; }
        const needDevs = dnorm(q).length >= 2;
        if (!needDevs) { render(q, [], [], false); return; }
        if (ixP && ixP.__v) { render(q, matchDevs(ixP.__v, q, 6), matchSites(sitesP && sitesP.__v, q), false); return; }
        render(q, [], [], true);
        Promise.all([loadIx(), loadSites()]).then(([ix, st]) => {
          if (!ix) ixP = null; else if (ixP) ixP.__v = ix;   // a failed load is tried again on the next search
          if (sitesP) sitesP.__v = st; if (my !== seq) return; render(q, matchDevs(ix, q, 6), matchSites(st, q), false, !ix);
        });
      }
      inp.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(run, 90); });
      inp.addEventListener('focus', () => { loadIx(); loadSites(); if (inp.value.trim()) run(); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
        else if (e.key === 'Enter') { const it = items(); if (it.length) { e.preventDefault(); (it[active >= 0 ? active : 0]).click(); } else e.preventDefault(); }
        else if (e.key === 'Escape' && inp.value) { e.stopPropagation(); inp.value = ''; clear(); }
      });
      inp.addEventListener('search', () => { if (!inp.value) clear(); });
      [].slice.call(box.querySelectorAll('[data-gw-try]')).forEach((b) => b.addEventListener('click', () => { inp.value = b.dataset.gwTry; inp.focus(); run(); }));
    });

    // Audit V3-05: the Menu's "Clear my figures" removes every figure this tab holds (clearJourney: all gw.* and kpt.* keys; only which
    // path the visitor is on and what they own stay), empties the boxes on this page, then reloads it so no figure is left on screen.
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-gw-clear-all]'); if (!b) return;
      clearJourney();
      [].slice.call(document.querySelectorAll('main input, main textarea')).forEach((x) => { if (!/^(search|checkbox|radio|button|submit|hidden|date)$/.test(x.type)) x.value = x.dataset.default !== undefined ? x.dataset.default : ''; });
      try { root.location.reload(); } catch (x) { /* ignore */ }
    });
    // Every calculator's "Clear them" ([data-clear]) also removes the rest of this tab's journey figures (audit A3-07).
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-clear]')) clearJourney(); });

    // ---- the "Upgrading from HDB" step strip ----
    const path = location.pathname, here = /\/tools\/sale-proceeds\/$/.test(path) ? 'sale-proceeds' : /\/tools\/hdb-upgrade\/$/.test(path) ? 'hdb-upgrade' : /\/tools\/what-can-i-buy\/$/.test(path) ? 'what-can-i-buy' : /\/journey\/worth\/$/.test(path) ? 'worth' : null;
    if (/\/journey\/$/.test(path) && location.hash === '#up') setCtx({ path: 'upgrade' });
    const showStrip = () => {
      const old = document.querySelector('[data-gw-strip]'); if (old) old.remove();
      const C = getCtx(); if (!here || C.path !== 'upgrade' || (here === 'worth' && C.type && C.type !== 'hdb')) return;
      const anchor = document.querySelector('main') || document.body; const host = document.createElement('div'); host.className = 'gw-strip-host'; host.innerHTML = stripHtml(here, base, upDone());
      anchor.insertBefore(host, anchor.firstChild);
      document.documentElement.classList.add('gw-onpath'); // the page's own heading and intro step back so the inputs come first
      const off = host.querySelector('[data-gw-strip-off]'); if (off) off.addEventListener('click', () => { setCtx({ path: null }); host.remove(); document.documentElement.classList.remove('gw-onpath'); });
    };
    showStrip();
    // The four-step page (journey #up): finished steps ticked, the main button points at the next one.
    const upBox = document.querySelector('[data-gw-up]');
    if (upBox) {
      const D = upDone(), keys = UP.map((x) => x[0]); let ni = keys.findIndex((k) => !D[k]); if (ni < 0) ni = keys.length - 1;
      [].slice.call(upBox.querySelectorAll('[data-up-step]')).forEach((li, k) => { const ok = !!D[keys[k]] && k !== ni; li.classList.toggle('done', ok); li.classList.toggle('now', k === ni); const i = li.querySelector('i'); if (i) i.textContent = ok ? '✓' : String(k + 1); });
      const go = upBox.querySelector('[data-gw-up-go]'); if (go) { go.href = base + UP[ni][2]; go.textContent = UP_GO[keys[ni]] + ' ›'; go.dataset.gwGo = 'up-' + keys[ni]; }
    }
    // The moving guide (journey page) tells us when a visitor chooses the HDB upgrade path.
    document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-gw-q]'); if (!b) return; setTimeout(() => { const C = getCtx(), g = b.closest('[data-gw-guide]'); const dir = g && g.querySelector('[data-gw-q="dir"][aria-pressed="true"]'); setCtx({ path: C.type === 'hdb' && !(dir && dir.dataset.gwV === 'smaller') ? 'upgrade' : null }); }, 0); });

    // ---- HDB Upgrade Planner: fill its fields from this tab's other calculations (its calculation is unchanged) ----
    if (here === 'hdb-upgrade' && !/[?&]resume=/.test(location.search)) prefillPlanner();
  }
  function prefillPlanner() {
    let s = {}; try { s = JSON.parse(root.sessionStorage.getItem('gw.fin.v1') || '{}') || {}; } catch (e) { s = {}; }
    const $ = (id) => document.getElementById(id), num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return isFinite(n) && n > 0 ? n : null; };
    const put = (id, v, age) => { const el = $(id), n = num(v); if (!el || el.value || n === null) return false; el.value = age ? String(Math.round(n)) : Math.round(n).toLocaleString('en-SG'); el.dispatchEvent(new Event('input', { bubbles: true })); return true; };
    let used = 0;
    let cpf = 0;
    if (s.homeType === 'hdb') {   // only a sale worked out for an HDB flat
      used += put('salePrice', s.sellPrice); used += put('outstandingLoan', s.outstandingLoan);
      // Audit A3-01: the CPF to refund on the sale (principal plus accrued interest) goes into the planner's refund field.
      const cp = num(s.cpfPrincipal) || 0, ci = num(s.cpfInterest) || 0;
      if (cp + ci > 0 && put('cpfRefundIn', cp + ci)) { used++; cpf = 1; const d = $('cpfRefundIn').closest('details'); if (d) d.open = true; }
    }
    // V1-05: the planner counts fixed pay plus 70% of variable and rental income (its rule line; the MAS 30% haircut), as TDSR does
    const R = root.GW_RULES, keep = (k) => 1 - (R && typeof R[k] === 'number' ? R[k] : 0.3);
    const income = (n) => { const f = num(s['borrowers.' + n + '.fixed']); if (f === null) return null; return f + (num(s['borrowers.' + n + '.variable']) || 0) * keep('variableIncomeHaircut') + (num(s['borrowers.' + n + '.rental']) || 0) * keep('rentalIncomeHaircut'); };
    used += put('age1', s['borrowers.0.age'], true); used += put('income1', income(0));
    if (num(s['borrowers.1.age']) && num(s['borrowers.1.fixed']) && !$('age2').value) { const b = document.querySelector('[data-group="buyers"] [data-value="2"]'); if (b) { b.click(); used += put('age2', s['borrowers.1.age'], true); used += put('income2', income(1)); } }
    if (used) {
      const f = $('salePrice') || $('age1'), note = document.createElement('p');
      note.className = 'gw-prefill'; note.setAttribute('data-gw-prefill', '');
      // Audit A3-13: say exactly what was carried over; selling costs are the planner's own estimate, not Sale proceeds' figures.
      const A = root.KPT_ASSUMPTIONS, costs = A ? Math.round(A.commissionRate * 1000) / 10 + '% commission plus GST and $' + Number(A.saleLegalFees).toLocaleString('en-SG') + ' legal fees' : 'its own estimate';
      const vr = [0, 1].some((n) => num(s['borrowers.' + n + '.variable']) || num(s['borrowers.' + n + '.rental']));
      note.innerHTML = 'Filled in from your other calculations in this tab' + (cpf ? ', including the CPF you’ll refund' : '') + (vr ? '. Income is fixed pay plus 70% of variable and rental income, as banks count it' : '') + '. Selling costs here use this planner’s estimate (' + costs + '), not any changes you made in Sale proceeds. Check each figure before you continue. <button type="button" class="gw-link">Clear them</button>';
      const host = f && f.closest('.kpt-field') ? f.closest('.kpt-field') : null;
      if (host && host.parentNode) host.parentNode.insertBefore(note, host);
      // Audit A5-08: Clear also removes the stored figures, so a reload doesn't fill them in again.
      note.querySelector('button').addEventListener('click', () => { clearJourney(); ['salePrice', 'outstandingLoan', 'cpfRefundIn', 'age1', 'income1', 'age2', 'income2'].forEach((id) => { const el = $(id); if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); } }); note.remove(); });
    }
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }
  return { upDone, finStamp, clearJourney, oneEdit, deaccent, ENTRIES, SECTIONS, SEC_ORDER, doorHtml, researchRows, secSwitch, row, MENU_TOOLS, QUICK, UP, MAIN, LAUNCHES, ASK, ICON, svg, norm, matchTools, scoredTools, matchDevs, matchSites, displayName, menuHtml, searchHtml, quickHtml, stripHtml, href, esc };
});
