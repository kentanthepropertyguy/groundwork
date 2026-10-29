#!/usr/bin/env node
// Repository contract checks: run from (or against) a normal Groundwork checkout.
//   GW_SITE=. node research/tests/catalogue/contract-tests.js   (from the site folder; every inventory refresh PR must pass it)
// Uses the checkout's own files; nothing is written. If the checkout has no data/projects/launch-roster.json yet, the package's roster is checked instead (and the output says so).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RO = require('./roster.js'), PKG = __dirname;
const SITE = process.env.GW_SITE, C = SITE ? require(path.resolve(SITE, 'assets/js/gw-catalogue.js')) : null;
if (!SITE || !fs.existsSync(path.join(SITE, 'data', 'projects', 'inventory.json'))) { console.error('Set GW_SITE to a Groundwork checkout (it must contain data/projects/inventory.json).'); process.exit(2); }
const site = (...p) => path.join(SITE, ...p), txt = (f) => fs.readFileSync(f, 'utf8'), rd = (f) => JSON.parse(txt(f));
let pass = 0, fail = 0; const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' - ' + e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
const kf = txt(site('assets', 'js', 'kpt-find.js')), inv = rd(site('data', 'projects', 'inventory.json')), find = rd(site('data', 'projects', 'find.json'));
const rosterFile = fs.existsSync(site('data', 'projects', 'launch-roster.json')) ? site('data', 'projects', 'launch-roster.json') : path.join(PKG, '..', '..', '..', 'data', 'projects', 'launch-roster.json');
const roster = rd(rosterFile), num = (k) => { const m = new RegExp(k + ':\\s*(\\d+)').exec(kf); return m ? Number(m[1]) : null; };
console.log('Checkout: ' + SITE + '\nRoster checked: ' + (path.resolve(rosterFile).startsWith(path.resolve(SITE)) ? 'the checkout\'s own' : 'the package\'s (the checkout has none yet)'));

t('the catalogue cadence equals FIND\'s (invCadenceDays 14)', () => eq(num('invCadenceDays'), C.CFG.cadenceDays));
t('the catalogue price limit (60 days) is not shorter than FIND\'s window (invMaxDays)', () => { const w = num('invMaxDays'); if (!(w > 0 && C.CFG.priceLimitDays >= w)) throw new Error('invMaxDays ' + w); });
t('district names equal kpt-find.js DISTRICT_AREAS', () => { const i = kf.indexOf('const DISTRICT_AREAS = {'), j = kf.indexOf('};', i); if (i < 0) throw new Error('DISTRICT_AREAS not found'); eq(vm.runInNewContext('(' + kf.slice(kf.indexOf('{', i), j + 1) + ')'), C.DISTRICT_AREAS); });
t('inventory.json is the approved public v2 file', () => { eq([inv.v, inv.kind, Array.isArray(inv.projects)], [2, 'kpt-huttons-public-inventory', true]); if (!isFinite(Date.parse(inv.checkedAt))) throw new Error('checkedAt'); });
t('the roster passes its own contract and holds every inventory project', () => eq(RO.check(roster, { inv, text: txt(rosterFile) }).errors, []));
t('roster location facts agree with find.json or the inventory\'s reviewed details', () => { const fp = new Map(find.projects.map((p) => [p.id, p])), rs = new Map(roster.projects.map((r) => [r.slug, r])), bad = [];
  inv.projects.forEach((p) => { const r = rs.get(p.slug), f = fp.get(p.slug), want = p.district ? [p.district, p.region, p.tenure] : f ? [f.d, f.seg, f.tl] : null;
    if (!want) bad.push(p.slug + ' (no location facts)'); else if (JSON.stringify([r.district, r.region, r.tenure]) !== JSON.stringify(want)) bad.push(p.slug); });
  eq(bad, []); });
t('the four featured entries are on /research/new-launches/, in order, with the same links', () => { const html = txt(site('research', 'new-launches', 'index.html')), got = [];
  html.replace(/href="([^"]+)"[^>]*data-kpt-ms="([^"]+)"/g, (m, h, id) => { got.push({ id, href: h }); });
  eq(got, rd(path.join(PKG, 'fixtures', 'inputs', 'featured-20261029.json')).featured); });
t('the derived model builds for every roster project with location facts and no provider name', () => { const M = C.build({ inventory: inv, roster, now: Date.now() });
  eq(M.length, roster.projects.length); if (M.some((r) => !r.districtName || !r.regionLabel)) throw new Error('missing labels'); if (/huttons/i.test(JSON.stringify(M) + JSON.stringify(roster))) throw new Error('provider name'); });
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exitCode = fail ? 1 : 0;
