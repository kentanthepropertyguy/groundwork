// One navigation, the same on every page (25 Oct 2026): Plan My Move · Research · Map · Calculators · New Launches. Run from the site folder:  node tools/financial-tests/nav-tests.js
// Reads the static markup (what a visitor gets before any script runs) of every page that carries the site header.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; } else { fail++; console.log('  FAIL', n, i === undefined ? '' : i); } };
const walk = (d, o = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (/^(\.|node_modules|_)/.test(f.name)) continue; const p = path.join(d, f.name); if (f.isDirectory()) walk(p, o); else if (f.name.endsWith('.html')) o.push(p); } return o; };
const pages = walk(ROOT).filter((f) => /class="gw-links"/.test(fs.readFileSync(f, 'utf8')));
check('at least 18 pages carry the site header (the old New launch payments and HDB upgrade planner addresses are redirects and carry none)', pages.length >= 18, pages.length);
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
  check(rel + ': header reads Plan My Move · Research · Map · Calculators (V2.1: no external New Launches link; launches are on the Map)', links.map((l) => l.text).join('|') === 'Plan My Move|Research|Map|Calculators' && !/kentanthepropertyguy\.com\/#developments/.test(t), links.map((l) => l.text));
  { const ft = (t.match(/<footer class="gw-foot">[\s\S]*?<\/footer>/) || [''])[0];
    check(rel + ': the footer is the one place with Ken’s photo and the LIVE line (footer follow-up)', !ft || (/ken-portrait\.jpg/.test(ft) && /class="gw-live"/.test(ft) && (t.replace(ft, '').replace(/<script[\s\S]*?<\/script>/g, '').match(/ken-portrait\.jpg/g) || []).length === 0)); }
  const pm = links.find((l) => l.text === 'Plan My Move'), cl = links.find((l) => l.text === 'Calculators');
  check(rel + ': Plan My Move opens Guide Me at its start (journey/, no path chosen); Calculators keeps the /tools/ address', pm && /(^|\/)journey\/$/.test(pm.href) && cl && /(^|\/)tools\/$/.test(cl.href), [pm, cl]);
  check(rel + ': Map is a top-level header item and opens the one Map', links.filter((l) => /^Map$/.test(l.text)).length === 1 && /(^|\/)research\/map\/$/.test((links.find((l) => /^Map$/.test(l.text)) || {}).href || ''));
  const cur = links.filter((l) => /aria-current/.test(l.attrs)).map((l) => l.text);
  const want = /^tools\//.test(rel) ? ['Calculators'] : /^journey\//.test(rel) ? ['Plan My Move'] : rel === 'research/map/index.html' ? ['Map'] : /^research\//.test(rel) ? ['Research'] : [];
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
  ['planner', 'payment-planner', 'sale-proceeds', 'ssd', 'stamp-duty', 'tdsr', 'msr', 'mortgage'].forEach((id) => {
    const inMenu = new RegExp('href="((\\.\\./)*|/)tools/' + id + '/"').test(t);
    check(rel + ': tool ' + id + ' still has a direct link in the menu or its sections', inMenu);
  });
  check(rel + ': the old HDB upgrade planner is no longer linked (it is folded into What can I afford?; its address redirects)', !/href="((\.\.\/)*|\/)tools\/hdb-upgrade\/"/.test(t));
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
// phone section row: the same four, and the All Tools page (Package 3)
for (const f of pages) {
  const rel = path.relative(ROOT, f), t = fs.readFileSync(f, 'utf8'), sm = t.match(/<nav class="gw-secs"[^>]*>(.*?)<\/nav>/s);
  if (sm) check(rel + ': phone section row reads Plan My Move · Research · Map · Calculators', [...sm[1].matchAll(/<a\b[^>]*>(.*?)<\/a>/gs)].map((x) => x[1].replace(/<[^>]+>/g, '').trim()).join('|') === 'Plan My Move|Research|Map|Calculators');
}
{
  const t = fs.readFileSync(path.join(ROOT, 'tools/index.html'), 'utf8'), main = t.slice(t.indexOf('<main'), t.indexOf('</main>'));
  // 24 Oct 2026: four task sections, each tool once, no badges; the HDB upgrade planner is folded into What can I afford? and "Full payment planning" is no longer a second card for the Payment timeline
  check('All Tools: four task sections', [...main.matchAll(/<h2 id="tg-[a-z]+">(.*?)<\/h2>/g)].map((x) => x[1]).join('|') === 'Plan a property move|Financing|Buying costs|Selling');
  check('All Tools: no sub-headings', !/<h3 id="tg-/.test(main));
  const secOf = (id) => (main.match(new RegExp('aria-labelledby="tg-' + id + '">(.*?)</section>', 's')) || [])[1] || '';
  const toolsIn = (id) => [...secOf(id).matchAll(/<a class="gw-tl" href="[^"]*" data-tool="([^"]+)"/g)].map((x) => x[1]).join('|');
  check('All Tools: Plan a property move holds What can I afford? and the Payment timeline', toolsIn('move') === 'planner|payment-planner', toolsIn('move'));
  check('All Tools: Financing holds How much can I borrow?, HDB and EC loan limit, Mortgage repayment', toolsIn('fin') === 'tdsr|msr|mortgage', toolsIn('fin'));
  check('All Tools: Buying costs holds Stamp duty', toolsIn('cost') === 'stamp-duty', toolsIn('cost'));
  check('All Tools: Selling holds Sale proceeds and Seller’s stamp duty', toolsIn('sell') === 'sale-proceeds|ssd', toolsIn('sell'));
  check('All Tools: the HDB upgrading entry is one line under Plan a property move, into the four-step journey', /<p class="gw-tg-line">.*Upgrading from HDB\?.*href="\.\.\/journey\/#up"/.test(secOf('move')) && !/gw-tg-line/.test(secOf('fin') + secOf('cost') + secOf('sell')));
  check('All Tools: no badges on the cards', !/<span class="gw-tl-t"><b>[^<]*<\/b><em>/.test(main));
  check('All Tools: the Payment timeline card opens the page itself (its funding check is a tab inside), with no second "Full payment planning" card', /href="payment-planner\/" data-tool="payment-planner"/.test(main) && !/payment-planner-full|Full payment planning/.test(main));
  check('All Tools: the Seller’s stamp duty card says what the 4-year question is', /<b>Seller’s stamp duty<\/b>.*?Selling within 4 years\?/s.test(secOf('sell')));
  const tools = [...main.matchAll(/<a class="gw-tl" href="[^"]*" data-tool="([^"]+)"/g)].map((x) => x[1]);
  ['planner', 'tdsr', 'msr', 'mortgage', 'stamp-duty', 'payment-planner', 'sale-proceeds', 'ssd'].forEach((k) => check('All Tools lists ' + k + ' once', tools.filter((x) => x === k).length === 1, tools));
  check('All Tools lists exactly those eight tools', tools.length === 8, tools);
  check('All Tools: nothing that lives under Research is listed here', !tools.some((x) => /^(worth|what-can-i-buy|research)$/.test(x)), tools);
  check('All Tools: no example result and no HDB-in-four-steps sentence', !/1\.09|Example result|four steps/i.test(main));
  check('All Tools: search is kept', /data-gw-search="tools"/.test(main));
  check('All Tools: no tile opens a journey-marked address', !/j=1/.test(main));
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
  dirs.forEach((d) => check('tools/' + d + '/ is a registered destination' + (d === 'what-can-i-buy' ? ' (older address of the Research budget search; kept)' : d === 'progressive-payments' ? ' (older address of New launch payments; now a redirect to the Payment timeline)' : d === 'hdb-upgrade' ? ' (older address of the HDB upgrade planner; now a redirect to What can I afford? set up for a flat being sold)' : ''), d === 'hdb-upgrade' || d === 'what-can-i-buy' || d === 'progressive-payments' || hrefs.some((h) => h && h.replace(/\/$/, '') === 'tools/' + d)));
}
console.log('nav-tests: ' + ok + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
