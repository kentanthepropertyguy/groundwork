// One navigation, the same on every page (25 Oct 2026): Plan My Move · Research · Map · Calculators · New Launches. Run from the site folder:  node tools/financial-tests/nav-tests.js
// Reads the static markup (what a visitor gets before any script runs) of every page that carries the site header.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; } else { fail++; console.log('  FAIL', n, i === undefined ? '' : i); } };
const walk = (d, o = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (/^(\.|node_modules|_)/.test(f.name)) continue; const p = path.join(d, f.name); if (f.isDirectory()) walk(p, o); else if (f.name.endsWith('.html')) o.push(p); } return o; };
const pages = walk(ROOT).filter((f) => /class="gw-links"/.test(fs.readFileSync(f, 'utf8')));
check('at least 17 pages carry the site header (V3.4: the old New launch payments, What can I afford? and HDB and EC loan limit addresses are redirects and carry none)', pages.length >= 17, pages.length);
const strip = (h) => h.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '').replace(/^\//, '');
const resolves = (from, href) => {
  if (/^(https?:|mailto:|tel:|#)/.test(href)) return true;
  const clean = href.split('#')[0].split('?')[0]; if (!clean) return true;
  let t = clean.startsWith('/') ? path.join(ROOT, clean) : path.resolve(path.dirname(from), clean); if (clean.endsWith('/')) t = path.join(t, 'index.html');
  return fs.existsSync(t) || fs.existsSync(path.join(t, 'index.html'));
};
const sig = {};
for (const f of pages) {
  const rel = path.relative(ROOT, f), t = fs.readFileSync(f, 'utf8');
  const hdr = (t.match(/<nav class="gw-links"[^>]*>(.*?)<\/nav>/s) || [])[1] || '';
  const links = [...hdr.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)].map((m) => ({ attrs: m[1], text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), href: (m[1].match(/href="([^"]*)"/) || [])[1] }));
  // V3.9 (Ken, 27 Oct 2026): New Launches, the on-site directory (research/new-launches/), sits between Map and Calculators; still no external launches link
  check(rel + ': header reads Plan My Move · Research · Map · New Launches · Calculators', links.map((l) => l.text).join('|') === 'Plan My Move|Research|Map|New Launches|Calculators' && !/kentanthepropertyguy\.com\/#developments/.test(t) && /(^|\/)research\/new-launches\/$/.test((links.find((l) => l.text === 'New Launches') || {}).href || ''), links.map((l) => l.text));
  { const ft = (t.match(/<footer class="gw-foot">[\s\S]*?<\/footer>/) || [''])[0];
    check(rel + ': the footer is the one place with Ken’s photo and the LIVE line (footer follow-up)', !ft || (/ken-portrait\.jpg/.test(ft) && /class="gw-live"/.test(ft) && (t.replace(ft, '').replace(/<script[\s\S]*?<\/script>/g, '').match(/ken-portrait\.jpg/g) || []).length === 0)); }
  const pm = links.find((l) => l.text === 'Plan My Move'), cl = links.find((l) => l.text === 'Calculators');
  check(rel + ': Plan My Move opens Guide Me at its start (journey/, no path chosen); Calculators keeps the /tools/ address', pm && /(^|\/)journey\/$/.test(pm.href) && cl && /(^|\/)tools\/$/.test(cl.href), [pm, cl]);
  check(rel + ': Map is a top-level header item and opens the one Map', links.filter((l) => /^Map$/.test(l.text)).length === 1 && /(^|\/)research\/map\/$/.test((links.find((l) => /^Map$/.test(l.text)) || {}).href || ''));
  const cur = links.filter((l) => /aria-current/.test(l.attrs)).map((l) => l.text);
  const want = rel === 'tools/what-can-i-buy/index.html' ? ['Research'] : /^tools\//.test(rel) ? ['Calculators'] : /^journey\//.test(rel) ? ['Plan My Move'] : rel === 'research/map/index.html' ? ['Map'] : rel === 'research/new-launches/index.html' ? ['New Launches'] : /^research\//.test(rel) ? ['Research'] : [];
  // the planner, timeline and calculators belong to Calculators; the Guide Me pages (journey/) belong to Plan My Move
  check(rel + ': at most one header item is the current page', cur.length <= 1, cur);
  check(rel + ': current section is ' + (want.join() || 'none until the browser marks it'), cur.join() === want.join() || (!want.length && !cur.length), cur);
  check(rel + ': header links point at pages that exist', links.every((l) => resolves(f, l.href)), links.filter((l) => !resolves(f, l.href)));
  sig[rel] = links.map((l) => strip(l.href).replace(/#.*$/, (h) => h)).join('|');
  // menu: the three sections, in the order of the main navigation, and Map inside Research
  const sec = [...t.matchAll(/<section class="gw-ms gw-ms-([a-z]+)">/g)].map((m) => m[1]);
  check(rel + ': menu sections are Plan My Move, Research, Calculators', sec.join() === 'guide,research,tools', sec);
  const gs = (t.match(/<section class="gw-ms gw-ms-guide">(.*?)<\/section>/s) || [])[1] || '';
  check(rel + ': the Plan My Move column lists the four journeys', [...gs.matchAll(/<a class="gw-mi" href="([^"]*)"/g)].map((x) => x[1].replace(/^(\.\.\/)+|^\//, '')).join('|') === 'journey/#buy|journey/#sell|journey/#up|journey/#move');
  check(rel + ': the menu says Calculators and never Tools or Buy or Sell as a heading', /<b>Calculators<\/b>/.test(t) && !/<b>(Tools|Buy or Sell|Buy|Sell)<\/b>/.test(t));
  const rs = (t.match(/<section class="gw-ms gw-ms-research">(.*?)<\/section>/s) || [])[1] || '';
  check(rel + ': Map stays reachable under Research in the menu', /href="((\.\.\/)*|\/)research\/map\/"/.test(rs));
  const names = [...t.matchAll(/<section class="gw-ms gw-ms-[a-z]+">(.*?)<\/section>/gs)].flatMap((m) => [...m[1].matchAll(/<a class="gw-mi" href="([^"]*)"/g)].map((x) => x[1]));
  check(rel + ': the old prices address is no longer a second menu entry', !names.some((x) => /research\/#\/prices$/.test(x)), names);
  ['research/#/', 'research/#/budget', 'research/#/browse'].forEach((h) => check(rel + ': ' + h + ' is listed once in the menu', names.filter((x) => x.replace(/^(\.\.\/)+|^\//, '') === h).length === 1, names.filter((x) => /research\/#/.test(x))));
  const ts = (t.match(/<section class="gw-ms gw-ms-tools">(.*?)<\/section>/s) || [])[1] || '';
  // V3.8 (Ken 27 Oct 2026): the seven calculators are the Calculators column, in order; Upgrade from HDB is reached through Plan My Move (journey/#up,
  // checked above), not listed as a calculator. The folded pages' old addresses (planner, msr) are not linked, they redirect.
  const tcol = [...ts.matchAll(/<a class="gw-mi" href="[^"]*" data-gw-nav-to="([^"]+)"/g)].map((x) => x[1]);
  check(rel + ': the Calculators column lists the seven calculators, in order', tcol.join('|') === 'payment-planner|tdsr|pledged-assets|mortgage|sale-proceeds|stamp-duty|ssd', tcol);
  check(rel + ': Upgrade from HDB is not listed as a calculator', tcol.indexOf('hdb-upgrade') < 0);
  check(rel + ': What can I afford? and the HDB and EC loan limit are not linked by their old addresses (they redirect to How much can I borrow?)', !/href="((\.\.\/)*|\/)tools\/(planner|msr)\/"/.test(hdr + ts));
  const foot = (t.match(/<nav aria-label="Footer">(.*?)<\/nav>/s) || [])[1] || '';
  const fl = [...foot.matchAll(/<a\b[^>]*>(.*?)<\/a>/gs)].map((m) => m[1]);
  // Footer, final (26 Oct 2026): no footer navigation (the header and menu carry it); the privacy notice is linked at the end of the disclosures
  { const ft = (t.match(/<footer class="gw-foot">[\s\S]*?<\/footer>/) || [''])[0];
    if (ft) check(rel + ': the footer has no navigation list, and links the privacy notice', fl.length === 0 && (rel === 'privacy/index.html' || /href="[^"]*privacy\/">Privacy<\/a>/.test(ft)), fl); }
  const all = [...(hdr + rs + ts + foot + ((t.match(/<footer class="gw-foot">[\s\S]*?<\/footer>/) || [''])[0])).matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  check(rel + ': no dead local link in header, menu or footer', all.every((h) => resolves(f, h)), all.filter((h) => !resolves(f, h)));
}
// stray copies at the root ("index (19).html" and the like) are old duplicates, not pages of the site; they keep whatever header they were saved with
const uniq = new Set(Object.entries(sig).filter(([k]) => !/ \(\d+\)\.html$/.test(k)).map(([, v]) => v)); check('the header is the same list of destinations on every page', uniq.size === 1, [...uniq]);
// phone section row: removed in Design Standard R1; the All Tools page (Package 3)
for (const f of pages) {
  const rel = path.relative(ROOT, f), t = fs.readFileSync(f, 'utf8'), sm = t.match(/<nav class="gw-secs"[^>]*>(.*?)<\/nav>/s);
  // Design Standard R1 (Ken, 28 Oct 2026, D2): the phone section row is removed; the header and the Menu carry the same links
  check(rel + ': no phone section row (.gw-secs)', !sm && !/class="gw-secs"/.test(t));
}
{
  const t = fs.readFileSync(path.join(ROOT, 'tools/index.html'), 'utf8'), main = t.slice(t.indexOf('<main'), t.indexOf('</main>'));
  // V3.8 (Ken 27 Oct 2026): seven equal calculator cards, in his order and names; Upgrade from HDB is in Plan My Move, linked from the section under them
  const tools = [...main.matchAll(/<a class="gw-tc" href="[^"]*" data-tool="([^"]+)"/g)].map((x) => x[1]);
  check('Calculators: the seven calculators, in order', tools.join('|') === 'payment-planner|tdsr|pledged-assets|mortgage|sale-proceeds|stamp-duty|ssd', tools);
  check('Calculators: named as Ken named them', ['Purchase Costs &amp; Timeline', 'How Much Can I Borrow?', 'Pledged &amp; Unpledged Assets', 'Mortgage Instalment', 'Sale Proceeds', 'Buyer’s Stamp Duty', 'Seller’s Stamp Duty'].every((x) => main.indexOf('<b>' + x + '</b>') >= 0));
  check('Calculators: no single-figure text links and no Upgrade card; Plan My Move is the section underneath', !/gw-mone/.test(main) && tools.indexOf('hdb-upgrade') < 0 && /<section class="gw-pmm"[\s\S]*href="\.\.\/journey\/"/.test(main));
  check('Calculators: no badges on the cards', !/<span class="gw-tl-t"><b>[^<]*<\/b><em>/.test(main));
  check('Calculators: nothing that lives under Research is listed here', !tools.some((x) => /^(worth|what-can-i-buy|research)$/.test(x)), tools);
  check('Calculators: the folded pages are not cards of their own', !tools.some((x) => /^(planner|msr)$/.test(x)), tools);
  check('Calculators: no tile opens a journey-marked address', !/j=1/.test(main));
}
// the single source for the labels, and the order the sections are shown in
global.self = global; global.window = global;
let GWN = null; try { global.document = undefined; GWN = require(path.join(ROOT, 'assets/js/gw-nav.js')); } catch (e) { /* browser-only: the markup checks above carry it */ }
if (GWN && GWN.SECTIONS) {
  check('gw-nav.js lists the menu sections Plan My Move, Research, Calculators', GWN.SEC_ORDER && GWN.SEC_ORDER.join() === 'guide,research,tools', GWN.SEC_ORDER);
  check('gw-nav.js lists the main navigation Plan My Move, Research, Map, Calculators', GWN.NAV_ORDER && GWN.NAV_ORDER.join() === 'move,research,map,tools', GWN.NAV_ORDER);
  check('gw-nav.js names them Plan My Move and Calculators', GWN.SECTIONS.move.name === 'Plan My Move' && GWN.SECTIONS.tools.name === 'Calculators' && GWN.SECTIONS.tools.href === 'tools/' && GWN.SECTIONS.move.href === 'journey/');
  // every tool folder is a registered tool with its own address, so the Tools directory can list it
  const dirs = fs.readdirSync(path.join(ROOT, 'tools'), { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(ROOT, 'tools', d.name, 'index.html'))).map((d) => d.name);
  const hrefs = (GWN.ENTRIES || []).map((e) => e.href);
  dirs.forEach((d) => check('tools/' + d + '/ is a registered destination' + (d === 'what-can-i-buy' ? ' (older address of the Research budget search; kept)' : d === 'progressive-payments' ? ' (older address of New launch payments; now a redirect to the Payment timeline)' : d === 'planner' ? ' (What can I afford?: now a redirect to How much can I borrow? with the cash and CPF row)' : d === 'msr' ? ' (HDB and EC loan limit: now a redirect to How much can I borrow? set for HDB)' : ''), d === 'planner' || d === 'msr' || d === 'what-can-i-buy' || d === 'progressive-payments' || hrefs.some((h) => h && h.replace(/\/$/, '') === 'tools/' + d)));
}
console.log('nav-tests: ' + ok + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
