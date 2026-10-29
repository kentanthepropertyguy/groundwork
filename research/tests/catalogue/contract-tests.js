#!/usr/bin/env node
// Repository contract checks (r4.1): run from (or against) a normal Groundwork checkout.
//   GW_SITE=. node research/tests/catalogue/contract-tests.js   (from the site folder; every inventory refresh PR and every deployment must pass it)
// Uses the checkout's OWN files only: data/projects/launch-roster.json must be the active list (v2), or the check fails. There is no
// fallback to a packaged copy. For a pre-release trial against an older checkout only, GW_LIST=<file> names the list to check; the
// output then says so on its first line, and that run is never a deployment check.
// The catalogue code checked is always the checkout's own assets/js/gw-catalogue.js.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RO = require('./roster.js'), CAT = require('./catalogue.js'), PKG = __dirname;
const SITE = process.env.GW_SITE;
if (!SITE || !fs.existsSync(path.join(SITE, 'data', 'projects', 'inventory.json'))) { console.error('Set GW_SITE to a Groundwork checkout (it must contain data/projects/inventory.json).'); process.exit(2); }
const site = (...p) => path.join(SITE, ...p), txt = (f) => fs.readFileSync(f, 'utf8'), rd = (f) => JSON.parse(txt(f));
const siteCode = site('assets', 'js', 'gw-catalogue.js'), C = require(path.resolve(siteCode));
let pass = 0, fail = 0; const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' - ' + e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
const kf = txt(site('assets', 'js', 'kpt-find.js')), inv = rd(site('data', 'projects', 'inventory.json')), find = rd(site('data', 'projects', 'find.json'));
const own = site('data', 'projects', 'launch-roster.json'), listFile = process.env.GW_LIST ? path.resolve(process.env.GW_LIST) : own;
const list = fs.existsSync(listFile) ? rd(listFile) : null, num = (k) => { const m = new RegExp(k + ':\\s*(\\d+)').exec(kf); return m ? Number(m[1]) : null; };
// r4.2: development classes for the Property Type filter: the checkout's registry, plus its reviewed file (a pre-release trial may use the package's)
const regFile = site('data', 'registry', 'index.json'), reg = fs.existsSync(regFile) ? rd(regFile) : null;
const ownCls = site('data', 'projects', 'catalogue-classes.json'), clsFile = ownCls;
const reviewed = fs.existsSync(clsFile) ? rd(clsFile) : null, classes = C.classMap ? C.classMap(reg, reviewed) : {};
const NOW = Date.now(), M = list ? C.build({ inventory: inv, roster: list, list, classes, now: NOW }) : [];
console.log((process.env.GW_LIST ? 'PRE-RELEASE TRIAL (not a deployment check): list from GW_LIST ' + listFile : 'Deployment check: the checkout\'s own data/projects/launch-roster.json') +
  '\nClasses: ' + (clsFile === ownCls ? 'the checkout\'s data/projects/catalogue-classes.json' : 'the package\'s catalogue-classes.json (pre-release trial)') + '\nCheckout: ' + SITE + '\nCatalogue code: ' + (fs.existsSync(siteCode) ? 'the checkout\'s assets/js/gw-catalogue.js' : 'the package reference core'));

t('the checked list is the active list (v2, scope "active")', () => { if (!list) throw new Error(listFile + ' is missing'); eq([list.v, list.kind, list.scope], [2, 'kpt-launch-roster', 'active']); });
t('the catalogue cadence equals FIND\'s (invCadenceDays 14)', () => eq(num('invCadenceDays'), C.CFG.cadenceDays));
t('the catalogue price limit (60 days) is not shorter than FIND\'s window (invMaxDays)', () => { const w = num('invMaxDays'); if (!(w > 0 && C.CFG.priceLimitDays >= w)) throw new Error('invMaxDays ' + w); });
t('district names equal kpt-find.js DISTRICT_AREAS', () => { const i = kf.indexOf('const DISTRICT_AREAS = {'), j = kf.indexOf('};', i); if (i < 0) throw new Error('DISTRICT_AREAS not found'); eq(vm.runInNewContext('(' + kf.slice(kf.indexOf('{', i), j + 1) + ')'), C.DISTRICT_AREAS); });
t('inventory.json is the approved public v2 file', () => { eq([inv.v, inv.kind, Array.isArray(inv.projects)], [2, 'kpt-huttons-public-inventory', true]); if (!isFinite(Date.parse(inv.checkedAt))) throw new Error('checkedAt'); });
t('the active list passes its contract (fields, privacy, layout; every entry has a current listing, or is shown without prices after 60 days)', () => eq(CAT.checkDirectory(list, { inv, text: txt(listFile), now: NOW }).errors, []));
t('every valid current listing in inventory.json (status ok, at least one type, from its newest read) is in the active list', () => {
  const inList = new Set(list.projects.map((r) => r.slug));
  eq(inv.projects.filter((p) => p.status === 'ok' && p.byBedrooms.length && Date.parse(p.checkedAt) >= Date.parse(inv.checkedAt) && !inList.has(p.slug)).map((p) => p.slug), []); });
t('active-list location facts agree with find.json or the inventory\'s reviewed details', () => { const fp = new Map(find.projects.map((p) => [p.id, p])), ip = new Map(inv.projects.map((p) => [p.slug, p])), bad = [];
  list.projects.forEach((r) => { const p = ip.get(r.slug), f = fp.get(r.slug), want = p && p.district ? [p.district, p.region, p.tenure] : f ? [f.d, f.seg, f.tl] : null;
    if (!want) bad.push(r.slug + ' (no location facts)'); else if (JSON.stringify([r.district, r.region, r.tenure]) !== JSON.stringify(want)) bad.push(r.slug); });
  eq(bad, []); });
t('the four featured entries are on /research/new-launches/, in order, with the same links', () => { const html = txt(site('research', 'new-launches', 'index.html')), got = [];
  html.replace(/href="([^"]+)"[^>]*data-kpt-ms="([^"]+)"/g, (m, h, id) => { got.push({ id, href: h }); });
  eq(got, rd(path.join(PKG, 'fixtures', 'inputs', 'featured-20261029.json')).featured); });
t('the site\'s catalogue shows every development in the active list, and nothing outside it, with labels and no provider name', () => {
  eq(M.map((r) => r.slug).sort(), list.projects.map((r) => r.slug).sort()); if (M.some((r) => !r.districtName || !r.regionLabel)) throw new Error('missing labels'); if (/huttons/i.test(JSON.stringify(M) + JSON.stringify(list))) throw new Error('provider name'); });
t('the catalogue never shows a development whose latest check has no units, and never a price older than 60 days', () => {
  const z = inv.projects.filter((p) => p.status !== 'ok').map((p) => p.slug); eq(M.filter((r) => z.indexOf(r.slug) >= 0).map((r) => r.slug), []);
  eq(M.filter((r) => r.types.length && C.freshness(r.lastChecked, NOW) === 'hidden').map((r) => r.slug), []); });
t('r4.2: the reviewed classes file is valid and never contradicts the registry', () => {
  if (!reviewed) throw new Error(clsFile + ' is missing'); eq([reviewed.v, reviewed.kind], [1, 'kpt-catalogue-classes']);
  const F = reg.fields, i = F.indexOf('id'), c = F.indexOf('cls'), rg = {}, bad = []; reg.rows.forEach((r) => { rg[r[i]] = r[c]; });
  Object.keys(reviewed.classes).forEach((k) => { const e = reviewed.classes[k]; if (['condo', 'ec'].indexOf(e.cls) < 0 || !e.basis) bad.push(k + ' (invalid)'); else if (rg[k] && rg[k] !== e.cls) bad.push(k + ' (registry says ' + rg[k] + ')'); });
  eq(bad, []); if (/huttons/i.test(JSON.stringify(reviewed))) throw new Error('provider name'); });
t('r4.2: the Property Type filter shows only classified developments under a type; All Residential shows every one', () => {
  const n = (p) => M.filter((r) => C.matches(r, { ptype: p })).length, un = M.filter((r) => !r.cls).map((r) => r.slug);
  eq(n('all'), M.length); eq(n('condo') + n('ec') + M.filter((r) => r.cls === 'cluster').length + un.length, M.length);
  console.log('       note: ' + n('condo') + ' Condo & Apartment, ' + n('ec') + ' EC, ' + un.length + ' unclassified' + (un.length ? ' (All Residential only; add a reviewed entry: ' + un.join(', ') + ')' : '') + '; ' + M.filter((r) => r.cls === 'cluster').length + ' cluster housing'); });
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exitCode = fail ? 1 : 0;
