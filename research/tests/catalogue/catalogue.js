'use strict';
/* ==========================================================================
   4.7 (29 Oct 2026, r4.1 corrections the same evening): the New Launches catalogue removal rule.

   A new, COMPLETE, approved read supersedes everything older:
   * a bedroom type or price band it no longer contains is no longer shown (the file is rebuilt from the newest check, as before);
   * a development with no listings in it (not in the read, or "no units shown") leaves the active catalogue;
   * the private history roster keeps every development, for a future reappearance;
   * nothing is ever called sold out.
   A read that cannot be shown to be complete never removes anything: developments it misses, or reads only in part, keep their
   previous listing with its own date (up to listingRetentionDays). FIND keeps its own rules and reads inventory.json exactly as before.

   readVerdict()  is the read as a whole: complete or not, and why.
   directory()    is the public active list (data/projects/launch-roster.json v2): names, locations and dates of the developments
                  the catalogue may show now. The private history (lib/roster.js, append-only) is kept separately.
   ========================================================================== */
const RO = require('./roster.js');
const DAY = 864e5;
const FULL_MODES = ['merged', 'all'];

/* snap: the private snapshot; prev: the previous snapshot doc (or null); state: refresh state (searchSkipped); S: settings.
   complete:     the read as a whole can be trusted to show what is NOT listed any more (absence may remove a development).
   readsTrusted: the individual project reads can be trusted (a "no units" answer may remove a development). False when the
                 extraction stopped, was not a full read, lost too many projects or units, or many listed projects suddenly
                 came back with no units (the signature of a failed session rather than a market change).
   A skipped launch look-up makes the read incomplete (a development may simply not have been found) but leaves the project
   reads trusted. */
const ZERO_SURGE = (listedBefore) => Math.max(3, Math.ceil(listedBefore * 0.1));
function readVerdict(snap, prev, state, S) {
  const reasons = [], P = (d) => (d.projects || []), units = (d) => P(d).reduce((a, p) => a + (Array.isArray(p.units) ? p.units.length : (p.units || 0)), 0);
  let readsTrusted = true; const bad = (m) => { reasons.push(m); readsTrusted = false; };
  // r4.1: missing or invalid extraction information never authorises a removal
  if (!('stopped' in snap)) bad('the snapshot does not say whether the extraction ran to the end');
  else if (snap.stopped !== null && snap.stopped !== false) bad('the extraction stopped before the end (' + String(snap.stopped) + ')');
  if (typeof snap.mode !== 'string' || FULL_MODES.indexOf(snap.mode) < 0) bad(snap.mode == null || snap.mode === '' ? 'the snapshot does not say which extraction mode was used' : 'not a full read (mode ' + JSON.stringify(snap.mode) + '; only "' + FULL_MODES.join('" or "') + '" count)');
  if (!prev) bad('no earlier read to compare against');
  else {
    const T = S.thresholds, dp = P(prev).length ? (P(prev).length - P(snap).length) / P(prev).length * 100 : 0, du = units(prev) ? (units(prev) - units(snap)) / units(prev) * 100 : 0;
    if (dp > T.incompleteProjectsPct) bad(P(snap).length + ' projects against ' + P(prev).length + ' last time');
    if (du > T.incompleteUnitsStopPct) bad(units(snap) + ' units against ' + units(prev) + ' last time');
    const before = new Map(P(prev).map((p) => [String(p.projectId), p])), listed = (p) => p && p.status === 'ok' && (Array.isArray(p.units) ? p.units.length : p.units) > 0;
    const nLis = P(prev).filter(listed).length, z = P(snap).filter((p) => p.status === 'zero_returned' && listed(before.get(String(p.projectId)))).length;
    if (z >= ZERO_SURGE(nLis)) bad(z + ' projects that had units last time came back with none (at most ' + (ZERO_SURGE(nLis) - 1) + ' is normal)');
  }
  if (state && state.searchSkipped) reasons.push('the launch look-up (title search) was not completed');
  return { complete: reasons.length === 0, readsTrusted, reasons };
}

/* Which developments the catalogue may show after this read.
   doc: the new public inventory (after carry-overs); history: the private history roster after this read;
   verdict: readVerdict(); inRead: Set of slugs that appear in this read at all (including unusable / held / partial ones);
   unusable: Set of slugs whose read this time could not be used (failed, held, partial);
   liveActive: the live active list (v2) or null; now; retentionDays.
   r4.1: age alone never removes. A development whose newest check is over retentionDays old stays active with its prices hidden
   (the catalogue hides them by itself) until a COMPLETE read confirms it is gone. */
function directory(o) {
  const by = new Map(o.history.projects.map((r) => [r.slug, r])), active = [], removed = [], keptDated = [], seen = new Set();
  const why = (slug) => (o.inRead.has(slug) ? 'not listed in this complete read' : 'not in this complete read');
  const unconfirmed = (slug) => !o.verdict.complete || o.unusable.has(slug);
  const keep = (slug) => { if (!by.has(slug)) throw new Error('directory: ' + slug + ' is missing from the history roster'); active.push(by.get(slug)); };
  o.doc.projects.forEach((p) => {
    seen.add(p.slug);
    const listed = p.status === 'ok' && Array.isArray(p.byBedrooms) && p.byBedrooms.length > 0;
    const fromThisRead = Date.parse(p.checkedAt) >= Date.parse(o.doc.checkedAt);
    if (!listed) { removed.push({ slug: p.slug, why: 'no units shown in this read' }); return; }   // (runs.js carries the previous listing instead when the reads are not trusted)
    if (!fromThisRead) {
      if (!unconfirmed(p.slug)) { removed.push({ slug: p.slug, why: why(p.slug) }); return; }
      keptDated.push({ slug: p.slug, checkedAt: p.checkedAt, why: !o.verdict.complete ? 'this read could not be confirmed complete' : 'its read this time could not be used' });
    }
    keep(p.slug);
  });
  // active now, but no longer in the public inventory file (its last check is over retentionDays old, so the file no longer carries it)
  ((o.liveActive && o.liveActive.projects) || []).forEach((r) => {
    if (seen.has(r.slug)) return;
    if (!unconfirmed(r.slug)) { removed.push({ slug: r.slug, why: why(r.slug) }); return; }
    keptDated.push({ slug: r.slug, checkedAt: null, why: 'last check over ' + o.retentionDays + ' days old: shown without prices until a complete read confirms it' });
    keep(r.slug);
  });
  const doc = { v: 2, kind: RO.KIND, scope: 'active', note: 'The developer-listing projects the New Launches catalogue may show now. Names, locations and dates only. A project that leaves the developer listings is removed from this list; nothing here describes availability.',
    asOf: o.doc.checkedAt, projects: active.slice().sort((a, b) => (a.slug < b.slug ? -1 : 1)) };
  return { doc, removed, keptDated, complete: o.verdict.complete };
}

/* A project read as "no units shown" by a read whose project reads are NOT trusted keeps its previous listed entry (from the live
   file), still dated by its own check, up to maxAgeDays. projects: the new public file's projects; liveInv: the live public file. */
function keepUnconfirmedZeros(projects, liveInv, verdict, now, maxAgeDays) {
  const kept = [];
  if (!verdict || verdict.readsTrusted || !liveInv) return { projects, kept };
  const liveBy = new Map(liveInv.projects.map((p) => [p.slug, p]));
  const out = projects.map((p) => {
    const L = liveBy.get(p.slug), at = L && (L.checkedAt || liveInv.checkedAt);
    if (p.status === 'zero_returned' && L && L.status === 'ok' && Array.isArray(L.byBedrooms) && L.byBedrooms.length) {
      kept.push(p.slug);
      // r4.1: a previous listing too old to show leaves the file (prices hidden), never "no units": the untrusted read proves nothing
      return (now - Date.parse(at)) / DAY <= maxAgeDays ? Object.assign({}, L, { checkedAt: at }) : null;
    }
    return p;
  }).filter(Boolean);
  return { projects: out, kept };
}

/* SGT start of a YYYY-MM-DD date. A development's real check is never earlier than this. */
const dayStart = (d) => Date.parse(d + 'T00:00:00+08:00');
/* Does this active entry (no inventory record) qualify to be shown without prices? Its last listing must be over retentionDays old. */
const agedOut = (r, now, retentionDays) => !!r.lastListed && (now - dayStart(r.lastListed)) / DAY > retentionDays;

/* The public active list's contract. o: { inv (the inventory it ships with), history (optional), text (optional), now, retentionDays }.
   r4.1: every current listing in the inventory file (status ok, at least one type, checked in the file's newest read) MUST be in the list;
   an entry with no inventory record is allowed only when its last listing is over retentionDays old (shown without prices). */
function checkDirectory(doc, o) {
  o = o || {};
  const now = o.now != null ? o.now : Date.now(), days = o.retentionDays || 60;
  const errors = [], base = RO.check(Object.assign({}, doc, { v: 1 }));   // same field, privacy and shape rules as the roster
  base.errors.forEach((e) => errors.push(e));
  if (doc.v !== 2 || doc.scope !== 'active') errors.push('not an active list (v2, scope "active")');
  if (o.inv) {
    const ip = new Map(o.inv.projects.map((p) => [p.slug, p])), inList = new Set(doc.projects.map((r) => r.slug));
    doc.projects.forEach((r) => {
      const p = ip.get(r.slug);
      if (!p) { if (!agedOut(r, now, days)) errors.push(r.slug + ' is active but not in the inventory file (and its last listing is not over ' + days + ' days old)'); }
      else if (p.status !== 'ok' || !p.byBedrooms.length) errors.push(r.slug + ' is active without listings');
    });
    o.inv.projects.forEach((p) => {
      if (p.status === 'ok' && Array.isArray(p.byBedrooms) && p.byBedrooms.length && Date.parse(p.checkedAt) >= Date.parse(o.inv.checkedAt) && !inList.has(p.slug)) errors.push(p.slug + ' has a current listing but is missing from the active list');
    });
  }
  if (o.history) { const h = new Set(o.history.projects.map((r) => r.slug)); doc.projects.forEach((r) => { if (!h.has(r.slug)) errors.push(r.slug + ' is active but missing from the private history'); }); }
  if (o.text != null && o.text !== RO.text(doc)) errors.push('layout differs from JSON.stringify(doc, null, 1) + newline');
  return { errors, passed: base.passed + 4 };
}
module.exports = { readVerdict, directory, checkDirectory, keepUnconfirmedZeros, agedOut, dayStart, FULL_MODES, ZERO_SURGE };
