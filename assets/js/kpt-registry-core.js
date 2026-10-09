/* Registry core (browser + Node). Pure functions: names, search, identity resolution, comparison support, enquiry links.
   One file, used by the build and copied unchanged to the site, so the build and the browser can never disagree.
   Names no project. All project knowledge comes from registry data. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPT_REGISTRY = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Same normalisation as the V11.0 project data layer (tested for equality), so ids and keys agree across Research, the registry and FIND.
  function normaliseName(s) {
    return String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/&/g, ' AND ').replace(/@/g, ' AT ').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const compactName = (s) => normaliseName(s).replace(/ /g, '');
  const slugify = (s) => normaliseName(s).toLowerCase().replace(/ /g, '-');
  const pairKey = (a, b) => (a < b ? a + '~' + b : b + '~' + a);

  // ---- index: compact rows -> objects, with search keys ----
  function makeIndex(data) {
    const f = data.fields, list = data.rows.map((r) => { const o = {}; f.forEach((k, i) => { o[k] = r[i]; }); o.aliases = o.aliases || []; return o; });
    const byId = new Map(), byCompact = new Map();
    list.forEach((o) => {
      byId.set(o.id, o);
      o._keys = [normaliseName(o.name)].concat((o.aliases || []).map(normaliseName)).filter((v, i, a) => v && a.indexOf(v) === i);
      o._tokens = o._keys.map((k) => k.split(' '));
      o._compact = o._keys.map((k) => k.replace(/ /g, ''));
      o._compact.forEach((c) => { if (!byCompact.has(c)) byCompact.set(c, []); const arr = byCompact.get(c); if (arr.indexOf(o.id) < 0) arr.push(o.id); });
    });
    return { list, byId, byCompact, meta: data.meta || {} };
  }

  // ---- search: ranked, never guesses ----
  function search(ix, q, limit) {
    const nq = normaliseName(q); if (!nq) return [];
    const cq = nq.replace(/ /g, ''), qt = nq.split(' '), out = [];
    ix.list.forEach((o) => {
      let best = 0, on = 'name';
      o._keys.forEach((k, i) => {
        let s = 0;
        if (o._compact[i] === cq) s = 100;
        else if (k.indexOf(nq) === 0) s = 80;
        else if (qt.every((t) => o._tokens[i].some((w) => w.indexOf(t) === 0))) s = 60;
        else if (o._compact[i].indexOf(cq) >= 0 && cq.length >= 3) s = 40;
        if (s > best) { best = s; on = i === 0 ? 'name' : 'alias'; }
      });
      if (best) out.push({ id: o.id, score: best + (o.level && o.level !== 'BASIC' ? 1 : 0), matchedOn: on });
    });
    out.sort((a, b) => b.score - a.score || (ix.byId.get(a.id).name < ix.byId.get(b.id).name ? -1 : 1));
    return limit ? out.slice(0, limit) : out;
  }

  // ---- identity: resolved only when exactly one development has that exact name or alias ----
  function resolve(ix, q) {
    const nq = normaliseName(q); if (!nq) return { status: 'empty', ids: [] };
    const hit = ix.byCompact.get(nq.replace(/ /g, ''));
    if (hit && hit.length === 1) return { status: 'resolved', id: hit[0], ids: hit };
    if (hit && hit.length > 1) return { status: 'ambiguous', ids: hit };
    const s = search(ix, q, 8);
    return { status: s.length ? 'suggestions' : 'unresolved', ids: s.map((x) => x.id) };
  }

  // ---- comparison support: a pair is supported only if a generated report exists ----
  function compare(ix, comps, policy, aId, bId, opts) {
    const reason = (code, extra) => Object.assign({ state: 'unsupported', reason: code }, extra || {});
    if (!aId || !bId) return { state: 'incomplete' };
    if (aId === bId) return reason('same-project');
    const A = ix.byId.get(aId), B = ix.byId.get(bId); if (!A || !B) return reason('ambiguous');
    const key = pairKey(aId, bId), hit = (comps.comparisons || []).find((c) => pairKey(c.a, c.b) === key);
    if (hit) return { state: 'supported', comparison: hit };
    const min = (policy.support || {}).minResaleTransactions || 30, side = [];
    [A, B].forEach((p) => {
      if (p.stage === 'new-launch') side.push(['new-launch', p]);
      else if (!p.resale) side.push(['no-transaction-data', p]);
      else if (p.resale < min) side.push(['thin-data', p]);
    });
    if (side.length) return reason(side[0][0], { project: side[0][1].id, projects: side.map((s) => s[1].id), eligible: false });
    return reason('no-report', { eligible: true });
  }

  // ---- enquiry links: short, contextual, and never carry personal finances ----
  const clean = (s, n) => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n || 40);
  function waMessage(policy, kind, p, attr) {
    const e = policy.enquiry, camp = attr && attr.utm_campaign ? clean(attr.utm_campaign, e.maxCampaignChars) : '';
    const tail = (ref) => ' (Ref ' + e.refPrefix + '-' + ref + (camp ? ' · ' + camp : '') + ')';
    if (kind === 'project') return 'Hi Ken, I’m looking at ' + p.name + ' on Groundwork. My situation is ____.' + tail('PRJ-' + p.id);
    if (kind === 'microsite') return 'Hi Ken, I’m looking at ' + p.name + '. I’d like to talk it through.' + tail('MS-' + p.id);
    if (kind === 'compare') return 'Hi Ken, I’m comparing ' + p.a + ' and ' + p.b + ' on Groundwork. Can you compare them for my situation?' + tail('CMP-' + pairKey(p.aId, p.bId).replace('~', '-'));
    if (kind === 'home') return 'Hi Ken, I’m on Groundwork and would like to talk through my property plans. My situation is ____.' + tail('HOME');
    if (kind === 'library') return 'Hi Ken, I’m reading your property comparisons on Groundwork. I’d like your view on ____.' + tail('LIB');
    if (kind === 'report') return 'Hi Ken, I read your ' + p.title + ' comparison. My situation is ____.' + tail('RPT-' + p.slug);
    throw new Error('Unknown enquiry kind: ' + kind);
  }
  function waLink(policy, kind, p, attr) { return 'https://wa.me/' + policy.enquiry.phone + '?text=' + encodeURIComponent(waMessage(policy, kind, p, attr)); }

  return { normaliseName, compactName, slugify, pairKey, makeIndex, search, resolve, compare, waMessage, waLink, clean };
});
