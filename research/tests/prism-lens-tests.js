/* Market Lens in PRISM (GW-PRISM-ML-V1-2026-11-07-A1): gw-lens.js against Claude C's export (data/lens/v1), on EVERY report.
   Run from the site folder:  node research/tests/prism-lens-tests.js
   1 the switch is off; the root pin, release, approval and schemas; Claude C's validator passes
   2 integrity, as the page checks it: every shard and report matches the sha256 its parent gives; every id is in the shard sha256(id) names
   3 the universe: 2,509 reports = the PRISM V1.1 (Y2) entries; the 5 protected reports flagged, and never shown
   4 verbatim: every line a page shows is the export's own text (or its own facts-only sentence); figures are read from those sentences
   5 kinds: observed / indicative / facts only; facts only shows no price, comparison or growth; the registry's "no resales" never reads as resale prices
   6 coverage: PRISM pages (full, partial) get the card and lines; unavailable and pending get a Market Lens view; new launches do not
   7 wording: no score, rank, cheap/expensive, over/undervalued, forecast, guarantee, causal "buyers paid for"; every view says past, not future
   8 the Research page loads it with PRISM only, after PRISM's own checks, and every call is guarded */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const SITE = path.resolve(__dirname, '../..');
const L = require(path.join(SITE, 'assets/js/gw-lens.js')), G = require(path.join(SITE, 'assets/js/gw-prism.js'));
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 700)); } };
const buf = (p) => fs.readFileSync(path.join(SITE, p)), sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// ---- 1 switch, pins, validator
check('the switch is off: siteHasMarketLens is false until Groundwork 01 approves it live', L.SWITCH.siteHasMarketLens === false && L.isOn() === false);
const ixb = buf(L.DIR + 'index.json'), ix = JSON.parse(ixb);
check('the root pin is index.json, byte for byte', sha(ixb) === L.PIN.index);
check('release, schema and status are the approved export\'s', !!L.checkIndex(ix) && ix.releaseId === 'lens-v1-2026-11-07-0c5ea9ca20a1');
const man = JSON.parse(buf(L.DIR + 'manifest.json'));
check('the manifest carries Groundwork 01\'s approval GW-PRISM-ML-V1-2026-11-07-A1 and binds the root', man.approvalRef === L.PIN.approval && man.indexSha256 === L.PIN.index);
let v = 0; try { cp.execFileSync('node', [path.join(SITE, 'tools/market-lens/validate-lens.js'), path.join(SITE, L.DIR), path.join(SITE, 'data/prism/v1.1')], { stdio: 'pipe' }); } catch (e) { v = e.status || 1; }
check('Claude C\'s validator passes on this tree (integrity, structure, gates, wording)', v === 0);

// ---- 2 integrity
const R = {}, E = {}; let integ = [];
ix.shards.forEach((ref) => {
  const b = buf(L.DIR + ref.path); if (sha(b) !== ref.sha256) integ.push('shard ' + ref.key);
  const sh = L.checkShard(JSON.parse(b), ref);
  sh.entries.forEach((e) => {
    if (sha(Buffer.from(e.id)).charAt(0) !== ref.key) integ.push('key ' + e.id);
    const rb = buf(L.DIR + e.path); if (sha(rb) !== e.sha256) integ.push('report ' + e.id);
    try { R[e.id] = L.checkReport(JSON.parse(rb), e); E[e.id] = e; } catch (x) { integ.push('check ' + e.id); }
  });
});
check('every shard and report matches its sha256; every id sits in the shard its sha256 names; every report passes the page\'s checks', integ.length === 0, integ.slice(0, 5));

// ---- 3 universe
const pix = JSON.parse(buf('data/prism/v1.1/index.json')), pids = [], pstate = {};
pix.shards.forEach((s) => G.checkShard(JSON.parse(buf('data/prism/v1.1/' + s.path)), s, (id) => sha(Buffer.from(id)).charAt(0)).entries.forEach((e) => { pids.push(e.id); pstate[e.id] = e.state; }));
const ids = Object.keys(R);
check('2,509 reports, exactly the PRISM V1.1 (Y2) entries', ids.length === 2509 && pids.length === 2509 && pids.every((i) => R[i]));
check('Holland Plain and One Chuan Grove are not in this release', !R['holland-plain'] && !R['one-chuan-grove']);
const prot = ids.filter((i) => R[i].protected).sort();
check('the 5 protected reports are flagged and listed in the page code, and nothing else is', prot.join() === L.PROTECTED.slice().sort().join());
check('each report\'s PRISM state is PRISM\'s own', ids.every((i) => R[i].prismState === pstate[i]));

// ---- registry: no resales at all (data/projects/index.json)
const pr = JSON.parse(buf('data/projects/index.json')), fi = pr.fields.indexOf('id'), fr = pr.fields.indexOf('resale'), resales = {};
pr.rows.forEach((x) => { resales[x[fi]] = x[fr]; });
const noRes = (r) => L.noResaleCandidate(r) && !(resales[r.id] > 0);
const V = {}; ids.forEach((i) => { V[i] = L.viewOf(R[i], noRes(R[i])); });
const nr = ids.filter((i) => V[i].noResales);
console.log('    no resales at all (registry), price withheld: ' + nr.length + ' (' + nr.filter((i) => pstate[i] === 'new_launch').length + ' PRISM new launches)');
check('no development without a single resale is shown a price, a comparison or "resale prices"', nr.every((i) => V[i].kind === 'facts' && !V[i].comparison && !V[i].record && !V[i].answer && V[i].price === L.UI.noPrice));
check('a development the registry shows with resales keeps its export price', ids.filter((i) => R[i].price.kind !== 'facts-only' && !nr.includes(i)).every((i) => V[i].kind === R[i].price.kind));

// ---- 4 verbatim
const allText = (r) => { const t = r.text; return [t.answer, t.price, t.comparison, t.record, t.demand].concat(t.infrastructure || [], t.supply || [], t.watch || []).filter(Boolean); };
const verb = ids.filter((i) => { const ok1 = [V[i].answer, V[i].price, V[i].comparison, V[i].record, V[i].demand].concat(V[i].infrastructure, V[i].supply, V[i].watch).filter(Boolean).every((t) => allText(R[i]).indexOf(t) >= 0 || t === L.UI.noPrice); return !ok1; });
check('every line a page shows is the export\'s own sentence (or its own facts-only sentence), unchanged', verb.length === 0, verb.slice(0, 5));
const figBad = ids.filter((i) => L.figsOf(V[i]).some((f) => !allText(R[i]).some((t) => t.indexOf(f.v.replace(/^About /, '')) >= 0)));
check('every figure in a Market Lens view\'s strip is read from the export\'s own sentences', figBad.length === 0, figBad.slice(0, 5));
const cBad = ids.filter((i) => L.cornersOf(V[i], G.PILLARS).some((c) => c.state === 'cmp' && c.key === 'P' && !V[i].comparison || c.state === 'cmp' && c.key === 'R' && !V[i].record || ['I', 'S', 'M'].includes(c.key) && c.state === 'cmp'));
check('the pentagon compares only where the export compares (price, growth); location, supply and demand are facts only', cBad.length === 0, cBad.slice(0, 5));

// ---- 5 kinds
const kinds = {}; ids.forEach((i) => { kinds[V[i].kind] = (kinds[V[i].kind] || 0) + 1; });
console.log('    shown kinds ' + JSON.stringify(kinds) + ' (export: observed 694, indicative 1,000, facts only 815)');
check('facts only: no price figure, comparison or growth line; observed and indicative are labelled as such', ids.every((i) => V[i].kind !== 'facts' || (!V[i].comparison && !V[i].record && !/\$[\d,]+ psf/.test(V[i].price))) &&
  ids.every((i) => V[i].kind === 'facts' || (V[i].kind === 'observed' ? /median resale price/.test(V[i].price) : /Indicative/.test(V[i].price))));
check('an indicative price always says it is indicative, with its sales and period', ids.filter((i) => V[i].kind === 'indicative').every((i) => /^About \$[\d,]+ psf\. Indicative: estimated from \d+ sales between/.test(V[i].price)));

// ---- 6 coverage
const shownOnProfile = ids.filter((i) => ['full', 'partial'].includes(pstate[i]) && !R[i].protected && V[i].kind !== 'facts').length;
const lensViews = ids.filter((i) => L.VIEW_STATES.includes(pstate[i]) && !R[i].protected);
console.log('    PRISM pages with Market Lens lines: ' + shownOnProfile + '; Market Lens views (no PRISM page): ' + lensViews.length + '; new launches unchanged: ' + ids.filter((i) => pstate[i] === 'new_launch').length);
check('every PRISM evidence page with a Market Lens price gets the card and lines; facts only adds nothing there (PRISM shows its own facts); never the 5 protected', shownOnProfile > 1500 && /v\.kind === 'facts'\) return false;/.test(fs.readFileSync(path.join(SITE, 'assets/js/gw-lens.js'), 'utf8')), shownOnProfile);
check('unavailable and pending developments (271) get a Market Lens view; new launches (139) keep their current pages', lensViews.length === 271 && L.VIEW_STATES.join() === 'unavailable,pending');
const lv = lensViews.map((i) => L.onlyPageHtml(R[i], V[i], G, '../', ix.method, ix.asAt));
check('a Market Lens view: the PRISM Analysis tab current, the five PRISM headings, Property Data next, mode "lens"', lv.every((h, k) => /data-gwp-mode="lens"/.test(h) && /data-gwp-view="prism" aria-current="page"/.test(h) && (h.match(/data-gml-sec="[PRISM]"/g) || []).length === 5 && h.indexOf('href="#/p/' + lensViews[k] + '"') >= 0));

// ---- 7 wording
const BANNED = /\bscore|\/ ?100|\brank|overpriced|undervalued|\bcheap|expensive|forecast(?!, or a purchase)|will (?:rise|fall)|guarantee|\bKen\b|paying for|buyers have been/i;
const pages = ids.map((i) => text(L.cardHtml(V[i], ix.method, ix.asAt) + L.KEYS.map((k) => L.dimBlockHtml(V[i], k)).join('') + L.watchHtml(V[i])));
const bw = pages.map((t, k) => [ids[k], t.replace('not a valuation, a forecast or a purchase recommendation', '')]).filter(([, t]) => BANNED.test(t)).map(([i, t]) => i + ': ' + (BANNED.exec(t) || [''])[0]);
check('no score, rank, cheap/expensive, over/undervalued, forecast, guarantee, Ken view or causal "buyers paid for" wording anywhere a page shows', bw.length === 0, bw.slice(0, 5));
check('every card says it describes past prices, not future ones; a Market Lens view says it is not a valuation, a forecast or a recommendation', pages.every((t) => t.indexOf('This describes past prices, not future ones.') >= 0) && lv.every((h) => /not a valuation, a forecast or a purchase recommendation/.test(h)));
check('the above-similar wording is neutral (Groundwork 01 correction): no reason is given for a gap', ids.filter((i) => /above similar/.test(V[i].comparison)).every((i) => /^Resale prices are about \d+% above similar developments in District \d+\.$/.test(V[i].comparison)));
const neg = ids.filter((i) => /rose -|rose 0%/.test(V[i].record));
console.log('    open wording item for Claude C: ' + neg.length + ' growth lines read "Prices rose -N%" or "rose 0%"');

// ---- 8 the Research page
const page = buf('research/index.html').toString(), tpl = /<template id="gwLazy-prism">(.*?)<\/template>/.exec(page)[1], tag = (f) => sha(buf(f)).slice(0, 10);
check('the PRISM bundle loads gw-lens.css and gw-lens.js after the hero, with current version tags', tpl.indexOf('gw-lens.css?v=' + tag('assets/css/gw-lens.css')) > tpl.indexOf('gw-prism-hero.js') && tpl.indexOf('gw-lens.js?v=' + tag('assets/js/gw-lens.js')) > tpl.indexOf('gw-lens.css'));
check('Market Lens mounts only after PRISM (and the hero), inside guards; with no view the fallback is Property Data, as before',
  /GW_PRISMHERO\.mount\([^\n]*\n[^\n]*\n\s*try \{ if \(md && window\.GW_LENS\) GW_LENS\.mountProfile\(/.test(page) && /if \(!window\.GW_LENS\) return go\(\);\s*\n\s*GW_LENS\.mountOnly\([^\n]*\.then\(\(ok\) => \{ if \(!ok\) return go\(\);[^\n]*\.catch\(go\); \}/.test(page) && /GW_LENS\.mountTab\(\$app, id/.test(page));
check('no other page loads Market Lens (the Map, the calculators and the homepage are untouched)', ['research/map/index.html', 'index.html', 'tools/index.html', 'journey/index.html'].every((f) => !/gw-lens/.test(buf(f).toString())));

console.log('\n' + ok + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
