// Packages 2-3: one navigation, Buy · Sell · Research · Map · Tools, the same on every page. Run from the site folder:  node tools/financial-tests/nav-tests.js
// Reads the static markup (what a visitor gets before any script runs) of every page that carries the site header.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; } else { fail++; console.log('  FAIL', n, i === undefined ? '' : i); } };
const walk = (d, o = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (/^(\.|node_modules|_)/.test(f.name)) continue; const p = path.join(d, f.name); if (f.isDirectory()) walk(p, o); else if (f.name.endsWith('.html')) o.push(p); } return o; };
const pages = walk(ROOT).filter((f) => /class="gw-links"/.test(fs.readFileSync(f, 'utf8')));
check('at least 19 pages carry the site header (the old New launch payments address is a redirect and carries none)', pages.length >= 19, pages.length);
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
  check(rel + ': header reads Buy · Sell · Research · Map · Tools · New launches', links.map((l) => l.text).join('|') === 'Buy|Sell|Research|Map|Tools|New launches ↗', links.map((l) => l.text));
  check(rel + ': Map is a top-level header item and opens the one Map', links.filter((l) => /^Map$/.test(l.text)).length === 1 && /(^|\/)research\/map\/$/.test((links.find((l) => /^Map$/.test(l.text)) || {}).href || ''));
  const cur = links.filter((l) => /aria-current/.test(l.attrs)).map((l) => l.text);
  const want = /^tools\//.test(rel) ? ['Tools'] : rel === 'journey/worth/index.html' ? ['Sell'] : rel === 'research/map/index.html' ? ['Map'] : /^research\//.test(rel) ? ['Research'] : [];
  // the planner, timeline and calculators belong to Tools; journey/ pages mark Buy or Sell from the address, in the browser
  check(rel + ': at most one header item is the current page', cur.length <= 1, cur);
  check(rel + ': current section is ' + (want.join() || 'none until the browser marks it'), cur.join() === want.join() || (!want.length && !cur.length), cur);
  check(rel + ': header links point at pages that exist', links.every((l) => resolves(f, l.href)), links.filter((l) => !resolves(f, l.href)));
  sig[rel] = links.map((l) => strip(l.href).replace(/#.*$/, (h) => h)).join('|');
  // menu: the four sections, in order, and Map inside Research
  const sec = [...t.matchAll(/<section class="gw-ms gw-ms-([a-z]+)">/g)].map((m) => m[1]);
  check(rel + ': menu sections are buy, sell, research, tools (guide row sits in the foot)', sec.join() === 'buy,sell,research,tools', sec);
  const rs = (t.match(/<section class="gw-ms gw-ms-research">(.*?)<\/section>/s) || [])[1] || '';
  check(rel + ': Map stays reachable under Research in the menu', /href="((\.\.\/)*|\/)research\/map\/"/.test(rs));
  const names = [...t.matchAll(/<section class="gw-ms gw-ms-[a-z]+">(.*?)<\/section>/gs)].flatMap((m) => [...m[1].matchAll(/<a class="gw-mi" href="([^"]*)"/g)].map((x) => x[1]));
  ['research/#/', 'research/#/prices', 'research/#/budget', 'research/#/browse'].forEach((h) => check(rel + ': ' + h + ' is listed once in the menu', names.filter((x) => x.replace(/^(\.\.\/)+|^\//, '') === h).length === 1, names.filter((x) => /research\/#/.test(x))));
  const ts = (t.match(/<section class="gw-ms gw-ms-tools">(.*?)<\/section>/s) || [])[1] || '';
  ['planner', 'payment-planner', 'hdb-upgrade', 'sale-proceeds', 'ssd', 'stamp-duty', 'tdsr', 'msr', 'mortgage'].forEach((id) => {
    const inMenu = new RegExp('href="((\\.\\./)*|/)tools/' + id + '/"').test(t);
    check(rel + ': tool ' + id + ' still has a direct link in the menu or its sections', inMenu);
  });
  const foot = (t.match(/<nav aria-label="Footer">(.*?)<\/nav>/s) || [])[1] || '';
  const fl = [...foot.matchAll(/<a\b[^>]*>(.*?)<\/a>/gs)].map((m) => m[1]);
  if (rel !== 'research/map/index.html') check(rel + ': footer repeats Buy · Sell · Research · Tools, then Map', fl.slice(0, 5).join('|') === 'Buy|Sell|Research|Tools|Map', fl);
  const all = [...(hdr + rs + ts + foot).matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  check(rel + ': no dead local link in header, menu or footer', all.every((h) => resolves(f, h)), all.filter((h) => !resolves(f, h)));
}
const uniq = new Set(Object.values(sig)); check('the header is the same list of destinations on every page', uniq.size === 1, [...uniq]);
// phone section row: the same five, and the All Tools page (Package 3)
for (const f of pages) {
  const rel = path.relative(ROOT, f), t = fs.readFileSync(f, 'utf8'), sm = t.match(/<nav class="gw-secs"[^>]*>(.*?)<\/nav>/s);
  if (sm) check(rel + ': phone section row reads Buy · Sell · Research · Map · Tools', [...sm[1].matchAll(/<a\b[^>]*>(.*?)<\/a>/gs)].map((x) => x[1].replace(/<[^>]+>/g, '').trim()).join('|') === 'Buy|Sell|Research|Map|Tools');
}
{
  const t = fs.readFileSync(path.join(ROOT, 'tools/index.html'), 'utf8'), main = t.slice(t.indexOf('<main'), t.indexOf('</main>'));
  check('All Tools: two types, Guided planning and Quick calculators', [...main.matchAll(/<h2 id="tg-[a-z]+">(.*?)<\/h2>/g)].map((x) => x[1]).join('|') === 'Guided planning|Quick calculators');
  check('All Tools: Quick calculators are Financing, Purchase costs & payments, Selling', [...main.matchAll(/<h3 id="tg-[a-z]+">(.*?)<\/h3>/g)].map((x) => x[1]).join('|') === 'Financing|Purchase costs &amp; payments|Selling');
  const guided = (main.match(/aria-labelledby="tg-guided">(.*?)<\/section>/s) || [])[1] || '';
  check('All Tools: Guided planning holds What can I afford?, HDB upgrade planner, Full payment planning', [...guided.matchAll(/data-tool="([^"]+)"/g)].map((x) => x[1]).join('|') === 'planner|hdb-upgrade|payment-planner-full', guided.length);
  check('All Tools: Full payment planning opens the existing Payment timeline at its Funding check', /href="payment-planner\/#funding" data-tool="payment-planner-full"/.test(main));
  const tools = [...main.matchAll(/<a class="gw-tl" href="[^"]*" data-tool="([^"]+)"/g)].map((x) => x[1]);
  ['planner', 'hdb-upgrade', 'payment-planner-full', 'tdsr', 'msr', 'mortgage', 'stamp-duty', 'payment-planner', 'sale-proceeds', 'ssd'].forEach((k) => check('All Tools lists ' + k + ' once', tools.filter((x) => x === k).length === 1, tools));
  check('All Tools: nothing that lives under Research is listed here', !tools.some((x) => /^(worth|what-can-i-buy|research)$/.test(x)), tools);
  check('All Tools: no example result and no HDB-in-four-steps sentence', !/1\.09|Example result|four steps/i.test(main));
  check('All Tools: search is kept', /data-gw-search="tools"/.test(main));
  check('All Tools: no tile opens a journey-marked address', !/j=1/.test(main));
}
// the single source for the labels, and the order the sections are shown in
global.self = global; global.window = global;
let GWN = null; try { global.document = undefined; GWN = require(path.join(ROOT, 'assets/js/gw-nav.js')); } catch (e) { /* browser-only: the markup checks above carry it */ }
if (GWN && GWN.SECTIONS) {
  check('gw-nav.js lists the sections Buy, Sell, Research, Tools', GWN.SEC_ORDER && GWN.SEC_ORDER.join() === 'buy,sell,research,tools', GWN.SEC_ORDER);
  check('gw-nav.js lists the main navigation Buy, Sell, Research, Map, Tools', GWN.NAV_ORDER && GWN.NAV_ORDER.join() === 'buy,sell,research,map,tools', GWN.NAV_ORDER);
  // every tool folder is a registered tool with its own address, so the Tools directory can list it
  const dirs = fs.readdirSync(path.join(ROOT, 'tools'), { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(ROOT, 'tools', d.name, 'index.html'))).map((d) => d.name);
  const hrefs = (GWN.ENTRIES || []).map((e) => e.href);
  dirs.forEach((d) => check('tools/' + d + '/ is a registered destination' + (d === 'what-can-i-buy' ? ' (older address of the Research budget search; kept)' : d === 'progressive-payments' ? ' (older address of New launch payments; now a redirect to the Payment timeline)' : ''), d === 'what-can-i-buy' || d === 'progressive-payments' || hrefs.some((h) => h && h.replace(/\/$/, '') === 'tools/' + d)));
}
console.log('nav-tests: ' + ok + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
