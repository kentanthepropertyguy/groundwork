'use strict';
/* ==========================================================================
   The permanent New Launches roster (data/projects/launch-roster.json), kept up to date by the fortnightly refresh (4.6, 29 Oct 2026).

   Every developer-listing project Groundwork has ever shown, with its location facts and three dates:
   firstSeen, lastChecked (newest approved file that contained it) and lastListed (newest approved file in which it had units).
   * Append-only: a project is never removed or renamed away; dates never move backwards.
   * A project missing from a new file keeps everything it had. Missing never means sold out (the roster has no status at all).
   * No prices, bands, counts, unit details or availability ever enter this file (check() refuses them).
   * Public names use normal title casing; a brand styling replaces it only when config\display-names.json records it as verified.
   The website decides what to show from the roster plus the current inventory file; this module only keeps the list.
   ========================================================================== */
// Standalone (no other toolkit file needed), so the same file can be used by the website's own tests.
const sgtDate = (iso) => new Date(Date.parse(iso) + 8 * 3600e3).toISOString().slice(0, 10);   // the Singapore calendar date of a check

const KIND = 'kpt-launch-roster', INV_KIND = 'kpt-huttons-public-inventory';
const FORBIDDEN = /price|band|ceil|unit|count|avail|status|sold|floor|stack|psf|bedroom/i;
const SMALL = new Set(['at', 'on', 'of', 'by', 'and', 'the', 'in', 'a']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* Normal title casing. Words with a digit or "@" (8@BT, 1866) are left as listed; apostrophes and hyphens start a new capital (J'Den, Ritz-Carlton). */
function titleCase(name) {
  return String(name).trim().split(/\s+/).map((w, i) => {
    if (/[0-9@]/.test(w)) return w;
    const lw = w.toLowerCase();
    if (i > 0 && SMALL.has(lw)) return lw;
    return lw.replace(/(^|['\-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
  }).join(' ').replace(/\s+-\s+Singapore$/i, '');
}
/* exceptions: config\display-names.json { "<slug>": { "displayName": "...", "verifiedOn": "YYYY-MM-DD", "source": "..." } }; only verified entries count. */
function displayName(slug, name, exceptions) {
  const e = exceptions && exceptions[slug];
  return e && e.displayName && DATE.test(e.verifiedOn || '') && e.source ? e.displayName : titleCase(name);
}
function emptyRoster() {
  return { v: 1, kind: KIND, note: 'Every developer-listing project Groundwork has seen. No prices, sizes, counts or availability. Append-only: entries are never removed without a recorded decision.', builtFrom: [], projects: [] };
}
const later = (a, b) => (!a ? b : !b ? a : (a > b ? a : b));

/* prev: the live roster (or null the first time); inv: the newly approved public inventory file;
   loc(slug, p): {district, region, tenure, tenureGroup, street} for a project (its own reviewed fields, else find.json); exceptions as above. */
function update(prev, inv, loc, exceptions) {
  if (!inv || inv.v !== 2 || inv.kind !== INV_KIND || !Array.isArray(inv.projects) || !isFinite(Date.parse(inv.checkedAt))) throw new Error('not an approved public inventory file (v2)');
  const base = prev ? JSON.parse(JSON.stringify(prev)) : emptyRoster(), by = new Map(base.projects.map((r) => [r.slug, r]));
  const ch = { added: [], listed: [], rechecked: [], renamed: [], relocated: [], notInRead: [] }, seen = new Set();
  inv.projects.forEach((p) => {
    seen.add(p.slug);
    const day = sgtDate(p.checkedAt), listed = p.status === 'ok' && Array.isArray(p.byBedrooms) && p.byBedrooms.length > 0, L = loc(p.slug, p);
    if (!L || !L.district || !L.region || !L.tenure) throw new Error('no location facts for ' + p.slug);
    const facts = { district: String(L.district), region: L.region, tenure: L.tenure, tenureGroup: L.tenureGroup, street: L.street || null, locSource: L.locSource || null };
    let r = by.get(p.slug);
    if (!r) { r = Object.assign({ slug: p.slug, name: p.name, displayName: displayName(p.slug, p.name, exceptions) }, facts, { firstSeen: day, lastChecked: day, lastListed: listed ? day : null }); by.set(p.slug, r); ch.added.push(p.slug); return; }
    if (day > r.lastChecked) ch.rechecked.push(p.slug);
    r.lastChecked = later(r.lastChecked, day);
    if (listed) { if (!r.lastListed || day > r.lastListed) ch.listed.push(p.slug); r.lastListed = later(r.lastListed, day); }
    if (p.name !== r.name) { ch.renamed.push(p.slug + ': ' + r.name + ' -> ' + p.name); r.name = p.name; }
    const dn = displayName(p.slug, p.name, exceptions); if (dn !== r.displayName) { if (ch.renamed.indexOf(p.slug) < 0) ch.renamed.push(p.slug + ': display ' + r.displayName + ' -> ' + dn); r.displayName = dn; }
    if (facts.district !== r.district || facts.region !== r.region || facts.tenure !== r.tenure) { ch.relocated.push(p.slug); }
    Object.assign(r, facts);
  });
  by.forEach((r, s) => { if (!seen.has(s)) ch.notInRead.push(s + ' (last checked ' + r.lastChecked + ')'); });
  base.projects = Array.from(by.values()).sort((a, b) => (a.slug < b.slug ? -1 : 1));
  if (base.builtFrom.indexOf(inv.checkedAt) < 0) base.builtFrom.push(inv.checkedAt);
  return { doc: base, changes: ch };
}
const text = (doc) => JSON.stringify(doc, null, 1) + '\n';

/* The roster's own contract. prev (optional): the live roster, for the append-only checks. inv (optional): every project in it must be in the roster. */
function check(doc, o) {
  o = o || {};
  const errors = [], E = (m) => errors.push(m); let passed = 0; const P = () => { passed++; };
  if (!doc || doc.v !== 1 || doc.kind !== KIND || !Array.isArray(doc.projects)) { E('not a roster file (v1)'); return { errors, passed }; }
  P();
  if (/huttons/i.test(JSON.stringify(doc))) E('the internal inventory provider is named in the roster'); else P();
  const slugs = doc.projects.map((r) => r.slug);
  if (slugs.some((s, i) => i && s <= slugs[i - 1])) E('projects are not sorted and unique by slug'); else P();
  doc.projects.forEach((r) => {
    Object.keys(r).forEach((k) => { if (FORBIDDEN.test(k)) E(r.slug + ': forbidden field ' + k); });
    if (!/^[a-z0-9-]+$/.test(r.slug || '')) E('bad slug ' + r.slug);
    if (!r.name || !r.displayName) E(r.slug + ': missing name');
    if (!/^(0[1-9]|1\d|2[0-8])$/.test(String(r.district))) E(r.slug + ': district ' + r.district);
    if (['CCR', 'RCR', 'OCR'].indexOf(r.region) < 0) E(r.slug + ': region ' + r.region);
    if (!r.tenure) E(r.slug + ': tenure missing');
    if (!DATE.test(r.firstSeen || '') || !DATE.test(r.lastChecked || '') || (r.lastListed != null && !DATE.test(r.lastListed))) E(r.slug + ': dates must be YYYY-MM-DD');
    if (r.firstSeen > r.lastChecked) E(r.slug + ': first seen after last checked');
    if (r.lastListed && (r.lastListed > r.lastChecked || r.lastListed < r.firstSeen)) E(r.slug + ': last listed outside first seen .. last checked');
    if (/#\d|\d{2}-\d{2,3}\b/.test(r.name + ' ' + r.displayName)) E(r.slug + ': looks like a unit number');
  });
  P();
  if (o.prev && Array.isArray(o.prev.projects)) {
    const now = new Map(doc.projects.map((r) => [r.slug, r]));
    o.prev.projects.forEach((p) => {
      const r = now.get(p.slug);
      if (!r) return E('append-only: ' + p.slug + ' was removed');
      if (r.firstSeen !== p.firstSeen) E('append-only: ' + p.slug + ' first seen changed');
      if (r.lastChecked < p.lastChecked) E('append-only: ' + p.slug + ' last checked moved backwards');
      if ((p.lastListed || '') > (r.lastListed || '')) E('append-only: ' + p.slug + ' last listed moved backwards');
    });
    P();
  }
  if (o.inv && Array.isArray(o.inv.projects)) {
    const have = new Set(slugs); o.inv.projects.forEach((p) => { if (!have.has(p.slug)) E('inventory project ' + p.slug + ' is not in the roster'); }); P();
  }
  if (o.text != null && o.text !== text(doc)) E('layout differs from JSON.stringify(doc, null, 1) + newline'); else if (o.text != null) P();
  return { errors, passed };
}
function summary(ch) {
  const n = (a) => a.length;
  return n(ch.added) + ' new, ' + n(ch.rechecked) + ' re-checked, ' + n(ch.notInRead) + ' not in this read (kept as they were; never treated as sold out)' +
    (n(ch.renamed) ? ', ' + n(ch.renamed) + ' name change(s)' : '') + (n(ch.relocated) ? ', ' + n(ch.relocated) + ' location change(s): review' : '');
}
module.exports = { sgtDate, KIND, titleCase, displayName, emptyRoster, update, check, text, summary };
