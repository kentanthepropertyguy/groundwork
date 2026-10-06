// node research/tests/page-render-tests.js — runs the REAL research/index.html script (router, loaders, renderers) against the REAL generated data
// in a stubbed DOM, and checks what the page would actually display. This is the test that catches "valid result shown as 'couldn't load'":
// the pure-module tests cannot see page render errors. KPT_ROOT=/path/to/site to test another build. Skipped if data/projects is absent.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = process.env.KPT_ROOT || path.join(__dirname, '../..');
let pass = 0, fail = 0;
const t = async (n, f) => { try { await f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
if (!fs.existsSync(path.join(root, 'data/projects/manifest.json'))) { console.log('  skip no data/projects'); process.exit(0); }

const html = fs.readFileSync(path.join(root, 'research/index.html'), 'utf8');
const inline = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const lib = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function el(store) {
  const e = { innerHTML: '', textContent: '', value: '', href: '', dataset: {}, style: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, focus() {}, scrollIntoView() {}, setAttribute() {}, getAttribute: () => null, appendChild() {}, remove() {},
    querySelector: () => el(), querySelectorAll: () => [], closest: () => null };
  return e;
}
// Render one route in a fresh page. Returns {html, errors, title}.
async function render(hash, opts) {
  opts = opts || {};
  const els = {}, errors = [], app = el();
  const store = {};
  const document = { title: '', body: { dataset: {}, classList: { add() {}, remove() {} } }, head: { appendChild() {} }, createElement: () => el(), getElementById: (id) => (id === 'app' ? app : (els[id] = els[id] || el())), querySelector: () => el(), querySelectorAll: () => [], addEventListener() {} };
  const location = { hash, href: 'http://localhost/research/index.html' + hash, pathname: '/research/index.html' };
  const events = [];
  const fetch = (u) => { const p = new URL(u, 'http://localhost/').pathname; const f = path.join(root, p); return fs.promises.readFile(f, 'utf8').then((s) => ({ ok: true, status: 200, json: () => JSON.parse(s) }), () => ({ ok: false, status: 404, json: () => { throw new Error('404'); } })); };
  const ctx = { document, location, fetch, URL, console: { log() {}, info() {}, warn() {}, error: (...a) => errors.push(a.map(String).join(' ').slice(0, 300)) }, setTimeout, clearTimeout, Promise, Date, JSON, Math, Array, Object, String, Number, RegExp, Error, Set, Map, encodeURIComponent, decodeURIComponent, isNaN, parseInt, parseFloat,
    sessionStorage: { getItem: () => (opts.size || null), setItem() {}, removeItem() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  ctx.window = ctx; ctx.self = ctx; ctx.addEventListener = () => {}; ctx.scrollTo = () => {}; ctx.innerWidth = 390; ctx.dataLayer = []; ctx.navigator = { userAgent: 'node' };
  ctx.KPT = { setContext() {}, track: (e, p) => events.push([e, p]), waLink: (o) => 'https://wa.me/x?text=' + encodeURIComponent((o && o.message) || '') };
  vm.createContext(ctx);
  ['assets/js/kpt-project.js', 'assets/js/kpt-research.js', 'assets/js/kpt-intel.js', 'data/research/config.js'].forEach((f) => vm.runInContext(lib(f), ctx, { filename: f }));
  if (opts.breakIntel) ctx.KPTIntel.analyse = () => { throw new Error('boom'); };
  if (opts.staleScript) ctx.KPT_RESEARCH.BUILD = opts.staleScript;
  vm.runInContext(inline, ctx, { filename: 'research/index.html' });
  for (let i = 0; i < 200; i++) { await new Promise((r) => setTimeout(r, 15)); if (app.innerHTML && !/kpr-skel/.test(app.innerHTML)) break; }
  await new Promise((r) => setTimeout(r, 30));
  return { html: app.innerHTML, errors, title: document.title, events, wa: els.wa && els.wa.href };
}
const CANT = /couldn’t load|couldn't load|couldn’t find/;

(async () => {
  console.log('Page render: AMO Residence vs Thomson Impressions (no shared sale type)');
  for (const h of ['#/compare/amo-residence/thomson-impressions', '#/compare/thomson-impressions/amo-residence']) {
    await t(h + ' renders the valid "no like-for-like evidence" page, not the load-error page', async () => {
      const r = await render(h);
      assert.ok(!CANT.test(r.html), 'shows the load-error page. Console: ' + r.errors.join(' | '));
      assert.strictEqual(r.errors.length, 0, r.errors.join(' | '));
      assert.ok(/No like-for-like transaction evidence found/.test(r.html));
      assert.ok(/No shared sale type/.test(r.html)); assert.ok(/AMO Residence/.test(r.html) && /Thomson Impressions/.test(r.html));
      assert.ok(/resale sales/.test(r.html) && /new sales and sub-sales/.test(r.html));
      assert.ok(!/id="interp"/.test(r.html), 'no interpretation section for a no-evidence page');
    });
  }
  await t('same routes with a saved size focus (sessionStorage) still render, and with a sale suffix in the hash', async () => {
    for (const h of ['#/compare/amo-residence/thomson-impressions', '#/compare/thomson-impressions/amo-residence', '#/compare/amo-residence/thomson-impressions/resale', '#/compare/amo-residence/thomson-impressions/new']) for (const size of ['1000', '2600', 'abc']) { const r = await render(h, { size }); assert.ok(!CANT.test(r.html) && /No like-for-like/.test(r.html), h + ' size=' + size + ' ' + r.errors.join('|')); }
  });
  await t('analytics for this page carry only project IDs, overlap class (no sale type or window), and nothing typed', async () => {
    const r = await render('#/compare/amo-residence/thomson-impressions'); const ev = r.events.find((x) => x[0] === 'research_comparison_viewed'); assert.ok(ev, JSON.stringify(r.events));
    assert.strictEqual(JSON.stringify(Object.keys(ev[1]).sort().map((k) => [k, ev[1][k]])), JSON.stringify([['overlap', 'none'], ['project_a', 'amo-residence'], ['project_b', 'thomson-impressions']]));
  });
  await t('WhatsApp link names the two projects only', async () => { const r = await render('#/compare/amo-residence/thomson-impressions'); assert.ok(/AMO%20Residence%20vs%20Thomson%20Impressions/.test(r.wa), r.wa); });

  await t('stale-copy guard: a page/script build mismatch shows a refresh message, never the misleading load-error page', async () => {
    const r = await render('#/compare/amo-residence/thomson-impressions', { staleScript: 'old' }); assert.ok(/needs a refresh/.test(r.html) && !CANT.test(r.html), r.html.slice(0, 120));
    const ok = await render('#/compare/amo-residence/thomson-impressions'); assert.ok(!/needs a refresh/.test(ok.html));
  });
  await t('page and script carry the same build stamp, and assets and data requests are versioned with it', async () => {
    const R = require(path.join(root, 'assets/js/kpt-research.js')), m = html.match(/const BUILD = '([^']+)'/); assert.ok(m && m[1] === R.BUILD, 'page ' + (m && m[1]) + ' vs script ' + R.BUILD);
    ['kpt-research.css', 'kpt-project.js', 'kpt-research.js', 'kpt-intel.js', 'config.js'].forEach((f) => assert.ok(new RegExp(f.replace('.', '\\.') + '\\?v=' + R.BUILD.replace(/\./g, '\\.')).test(html), f + ' not versioned'));
    assert.ok(/'v=' \+ BUILD/.test(html));
  });

  console.log('Page render: single-project page, two layers');
  const answerOf = (h) => { const i = h.indexOf('id="answer"'); return h.slice(i, h.indexOf('</section>', i)); };
  const textOf = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const JARGON = /middle psf|median|quartile|percentile|interquartile|\bband\b|sample|distribution|standard deviation/i;
  await t('STRONG recent evidence: layer 1 leads with the number and facts; evidence is collapsed behind "See transaction details"', async () => {
    const r = await render('#/p/thomson-grand'); assert.strictEqual(r.errors.length, 0, r.errors.join('|'));
    const a = textOf(answerOf(r.html)); assert.ok(/Around 1,300–1,399 sqft/.test(a)); assert.ok(/Recent sales: around \$1,882 psf/.test(a)); assert.ok(/13 sales across 8 of the last 12 months\./.test(a)); assert.ok(/Historical range: \$1,635–\$1,858 psf/.test(a) && /Most active size recently/i.test(a) && /most commonly transacted size in the last 12 months/.test(a) && /Good recent evidence/.test(a) && !/\(13 sales\)|Historically|approximate/.test(a)); assert.ok(!/Try a different size/.test(a));
    assert.ok(/class="kpr-focus kpr-focus--open"/.test(answerOf(r.html)) && /id="sizeIn"/.test(answerOf(r.html)) && !/<details[^>]*kpr-focus/.test(answerOf(r.html)), 'size control must be visible by default');
    assert.ok(/Compare another project →/.test(a) && /Check another size/.test(a) && !/Get Ken's view/.test(a), 'Ken CTA now lives in the handoff, after the disclosure');
    assert.ok(r.html.indexOf('id="evidence"') < r.html.indexOf('id="wa"') && /Looking at a particular unit\?/.test(r.html) && /The transactions can't tell us its facing, layout or whether its asking price is justified\./.test(textOf(r.html)) && /Only the project name is sent to WhatsApp, nothing you typed\./.test(r.html));
    assert.ok(!/Project research/.test(r.html) && !/kpr-handoff[^>]*box-shadow/.test(r.html));
    assert.ok(r.html.indexOf('id="answer"') < r.html.indexOf('id="evidence"'), 'answer must come first');
    assert.ok(/<details class="kpr-d kpr-evidence" id="evidence">/.test(r.html), 'evidence must be collapsed by default'); assert.ok(/How KPT analysed this →/.test(r.html) && /Size · recency · price history · floor bands · transaction activity/.test(r.html) && !/See why →|See transaction details/.test(r.html));
  });

  console.log('Page render: Project Intelligence V1 (What KPT found + How KPT analysed this)');
  const foundOf = (h) => { const m = h.match(/<div class="kpr-found"[\s\S]*?<\/ul><\/div>/); return m ? m[0] : ''; };
  const items = (h) => (foundOf(h).match(/<li data-ins="[^"]*">([\s\S]*?)<\/li>/g) || []).map((x) => textOf(x).trim());
  const chk = (h) => { const i = h.indexOf('class="kpr-chk"'); return i < 0 ? '' : textOf(h.slice(i, h.indexOf('<section class="kpr-sec', i))); };
  const BANNED = /\b(liquid|illiquid|active|quiet|appreciat\w*|depreciat\w*|premium|discount|fair value|comparables?|rose|fell|undervalued|overvalued|bargain|hot|cheap)\b/i;
  const six = [['Thomson Grand default', '#/p/thomson-grand', undefined, ['13 of the 19 recent sales were around 1,300–1,399 sqft.', '99-year lease from 2010, with about 83 years remaining.']],
    ['Bartley Ridge 550', '#/p/bartley-ridge', '550', ['The middle half of resale sales here (since Sep 2021) were between 495 and 1,033 sqft. 550 sqft is within that range. 4 of the 243 sales were in the 500–599 sqft band.', 'The nearest size with firmer recent evidence is 400–499 sqft (9 sales across 6 months).', '99-year lease from 2012, with about 85 years remaining.']],
    ['Leedon Green default', '#/p/leedon-green', undefined, ['Recent sales were spread across 5 size bands. The most sales (3 of 11) were in 800–899 sqft, level with 1,000–1,099 sqft.', 'Also recorded since Sep 2021: 391 new-sale (developer) and 33 sub-sale transactions. They are priced differently, so they are shown separately, not mixed in.']],
    ['Grand Dunman default', '#/p/grand-dunman', undefined, ['Recent sales were spread across 16 size bands. The most sales (13 of 72) were in 2,100–2,199 sqft, level with 1,700–1,799 sqft.', 'Only new-sale and sub-sale transactions are recorded so far. There are no resale transactions yet.', '99-year lease from 2022, with about 95 years remaining.']],
    ['Thomson Grand 1,050', '#/p/thomson-grand', '1050', ['The middle half of resale sales here (since Sep 2021) were between 1,023 and 1,410 sqft. 1,050 sqft is within that range. 8 of the 99 sales were in the 1,000–1,099 sqft band.', '13 of the 19 recent sales across the project were around 1,300–1,399 sqft.', '99-year lease from 2010, with about 83 years remaining.']],
    ['3@Phillips default', '#/p/3-at-phillips', undefined, []]];
  for (const [name, h, size, want] of six) {
    await t('approved Layer-1 output, exactly: ' + name, async () => {
      const r = await render(h, { size }); assert.strictEqual(r.errors.length, 0, r.errors.join('|')); const got = items(r.html);
      assert.deepStrictEqual(got, want); if (!want.length) assert.ok(!/What KPT found/.test(r.html), 'no block at all when nothing qualifies');
    });
  }
  await t('block sits inside the answer, after the hero and before the size control; max 3 items; no banned judgement words', async () => {
    for (const [, h, size] of six) { const r = await render(h, { size }); const a = answerOf(r.html); if (foundOf(r.html)) { assert.ok(a.indexOf('class="kpr-a-grid"') < a.indexOf('class="kpr-found"') && a.indexOf('class="kpr-found"') < a.indexOf('class="kpr-a-actions"')); assert.ok(items(r.html).length <= 3); assert.ok(/<h2 class="kpr-found-h"[^>]*>What KPT found<\/h2>/.test(a)); } assert.ok(!BANNED.test(items(r.html).join(' ')), h + ' ' + items(r.html).join(' ')); assert.ok(!BANNED.test(chk(r.html).replace(/Transaction activity/g, '')), h + ' checklist: ' + chk(r.html).match(BANNED)); }
  });
  await t('Layer 1 never carries S5/S6/S1/S10 or the lease-start caveat', async () => {
    for (const [, h, size] of six) { const r = await render(h, { size }); const f = items(r.html).join(' '); assert.ok(!/previous 12 months|floor bands|in the last 12 months across the project|First new sale recorded|counted from the lease start year/.test(f), f); }
  });
  await t('S3 never restates the hero when every recent sale sits in the hero band (and never duplicates S2b)', async () => {
    const r = await render('#/p/bartley-ridge', { size: '550' }); assert.ok(!/spread across 10 size bands/.test(items(r.html).join(' ')));
  });
  await t('How KPT analysed this: collapsed by default, five areas, checklist first, existing evidence kept after it', async () => {
    const r = await render('#/p/thomson-grand'); const ev = r.html.slice(r.html.indexOf('id="evidence"')); assert.ok(/<details class="kpr-d kpr-evidence" id="evidence">/.test(r.html));
    ['size', 'recency', 'price', 'floors', 'activity'].forEach((k) => assert.ok(new RegExp('data-area="' + k + '"').test(ev), 'missing area ' + k));
    assert.ok(ev.indexOf('class="kpr-chk"') < ev.indexOf("What's happening here") && ev.indexOf('class="kpr-chk"') > -1);
    const c = chk(r.html); assert.ok(/Different units, floors and dates: not a measure of how any one unit changed\./.test(c) && /does not show what a floor is worth/.test(c) && /counted from the lease start year, not the completion year/.test(c), c);
    assert.ok(/previous 12 months was \$1,765–\$1,812 psf \(10 sales\), so the two ranges overlap/.test(c));
  });
  await t('absence lines: checked-but-insufficient areas say so explicitly (3@Phillips, Bartley Ridge)', async () => {
    const c = chk((await render('#/p/3-at-phillips')).html); assert.ok(/Not enough recent sales to say which size sells most\./.test(c) && /Not enough sales in both periods for a reliable comparison\./.test(c) && /Not enough sales across floor bands to say\./.test(c) && /No resale sales in the last 12 months\. The latest in the project was/.test(c), c);
    const b = chk((await render('#/p/bartley-ridge', { size: '550' })).html); assert.ok(/Not enough sales in both periods/.test(b) && /Not enough sales across floor bands/.test(b));
  });
  await t('new-sale project: price history and floors say "not compared" (not "not enough"), and first new sale is labelled as in-data, not launch', async () => {
    const c = chk((await render('#/p/grand-dunman')).html); assert.ok(/Not compared across periods for new-sale transactions\./.test(c) && /Not compared by floor for new-sale transactions\./.test(c) && /First new sale recorded: Jul 2023\./.test(c) && /not the project’s launch/.test(c), c);
  });
  await t('lease caveat applies to every leasehold project; freehold and 999-year get no lease line', async () => {
    assert.ok(/counted from the lease start year/.test(chk((await render('#/p/bartley-ridge', { size: '550' })).html)));
    assert.ok(!/Lease/.test(chk((await render('#/p/leedon-green')).html)) && !/Lease/.test(chk((await render('#/p/3-at-phillips')).html)));
  });
  await t('typed size never reaches analytics or WhatsApp via the new block', async () => { const r = await render('#/p/bartley-ridge', { size: '550' }); assert.ok(!r.events.some((e) => JSON.stringify(e).indexOf('550') > -1)); assert.ok(r.wa === undefined || r.wa.indexOf('550') === -1); });
  await t('if the intelligence module throws, the page still renders the answer (no block, no checklist)', async () => {
    const r = await render('#/p/thomson-grand', { breakIntel: true }); assert.ok(/id="answer"/.test(r.html) && !/What KPT found/.test(r.html) && /id="evidence"/.test(r.html));
  });
  await t('layer 1 uses no analytical jargon (no "middle PSF", "median", "band", "sample")', async () => { for (const [h, size] of [['#/p/thomson-grand'], ['#/p/bartley-ridge', '550'], ['#/p/3-at-phillips'], ['#/p/thomson-grand', '2600'], ['#/p/thomson-grand', '1050']]) { const r = await render(h, { size }); const a = textOf(answerOf(r.html).replace(/<div class="kpr-found"[\s\S]*?<\/ul><\/div>/, '')).replace(/Looking at a particular size\?.*?(?=Next|Try|$)/, ''); const m = a.match(JARGON); assert.ok(!m, h + ' ' + size + ': "' + (m && m[0]) + '" in ' + a.slice(0, 300)); } });
  await t('every piece of the previous page is still there inside layer 2', async () => {
    const r = await render('#/p/thomson-grand'); const ev = r.html.slice(r.html.indexOf('id="evidence"')); ["What's happening here", 'Sales, last 12 months', 'Middle PSF (approx.)', 'Size matters', 'kpr-rows', 'kpr-panel', 'By floor band', 'over time', 'History across all sizes', 'Market context', "What the transactions don't tell you"].forEach((k) => assert.ok(ev.indexOf(k) > -1 || ev.indexOf(k.replace("'", '&#39;')) > -1, 'missing in layer 2: ' + k));
  });
  await t('THIN recent evidence (Bartley Ridge, ~500 sqft): says plainly the evidence is thin and shows the history range', async () => {
    const r = await render('#/p/bartley-ridge', { size: '550' }); const a = textOf(answerOf(r.html)); assert.ok(/Around 500–599 sqft/.test(a) && /Recent sales: around \$1,594 psf/.test(a) && /The size you asked about/i.test(a) && /Limited recent evidence/.test(a) && /Only 1 sale in the last 12 months\. Treat this as a reference\./.test(a) && /Historical range: \$1,415–\$1,591 psf/.test(a) && !/Most active size recently/i.test(a), a.slice(0, 500));
    assert.ok(/kpr-a-recent-thin/.test(r.html));
  });
  await t('NO RECENT size evidence but older evidence exists: no recent price, latest month, older caveat', async () => {
    for (const [h, size] of [['#/p/thomson-grand', '1050'], ['#/p/3-at-phillips']]) { const r = await render(h, { size }); const a = textOf(answerOf(r.html)); assert.ok(/Recent sales: none in the last 12 months/.test(a) && /latest sale around this size was in/.test(a), a.slice(0, 300)); assert.ok(!/Recent sales: around/.test(a)); assert.ok(/may not reflect today's prices/.test(a)); assert.ok(/kpr-a-older/.test(r.html)); }
  });
  await t('OLDER evidence only: truthful eyebrow (never "Most active size recently"), strength label, no recent price, same simplified order', async () => {
    const r = await render('#/p/3-at-phillips'); const a = textOf(answerOf(r.html)); assert.ok(/Older evidence only/.test(a) && !/Most active size recently/i.test(a) && /Recent sales: none in the last 12 months/.test(a) && /Compare another project/.test(a));
    assert.ok(r.html.indexOf('id="answer"') < r.html.indexOf('id="evidence"') && r.html.indexOf('id="evidence"') < r.html.indexOf('id="wa"'));
  });
  await t('NO USEFUL size evidence: says so, offers the nearest sizes as buttons, gives no mixed overall price', async () => {
    const r = await render('#/p/thomson-grand', { size: '2600' }); const a = textOf(answerOf(r.html)); assert.ok(/Recent sales: none recorded around this size/.test(a) && /Around 2,600–2,699 sqft/.test(a)); assert.ok(/would mix different unit sizes/.test(a)); assert.ok(!/Recent sales: around/.test(a));
    assert.ok(/class="kpr-link" type="button" data-bin="\d+"/.test(answerOf(r.html)), 'nearest sizes must be clickable'); assert.ok(/kpr-a-no-size/.test(r.html)); assert.ok(/Compare another project/.test(a) && /Not enough comparable evidence/.test(a) && !/Most active size recently/i.test(a));
  });
  await t("Ken's Take is absent with the empty notes file, and the sale type stays visible above the answer", async () => { const r = await render('#/p/thomson-grand'); assert.ok(!/Ken's Take/.test(r.html.replace(/Get Ken's view/g, ''))); assert.ok(r.html.indexOf('Showing resale sales') > -1 && r.html.indexOf('Showing resale sales') < r.html.indexOf('id="answer"')); const m = await render('#/p/19-nassim'); assert.ok(/data-sale="new"/.test(m.html) && /data-sale="resale"/.test(m.html) && m.html.indexOf('data-sale="new"') < m.html.indexOf('id="answer"')); });
  await t('the size control now sits inside the answer, and no size or typed text reaches analytics or WhatsApp', async () => { const r = await render('#/p/bartley-ridge', { size: '550' }); assert.ok(answerOf(r.html).indexOf('Check another size') > -1 && /id="sizeClear"/.test(answerOf(r.html))); assert.ok(r.wa === undefined || r.wa.indexOf('550') === -1); assert.ok(!r.events.some((e) => JSON.stringify(e).indexOf('550') > -1)); });
  await t('comparison page is unchanged by this work (no answer card, still has its verdict)', async () => { const r = await render('#/compare/thomson-impressions/thomson-three'); assert.ok(!/id="answer"/.test(r.html) && /id="verdict"/.test(r.html) && /id="interp"/.test(r.html)); });

  console.log('Page render: other comparisons and projects still render (no regressions)');
  const GOOD = [['#/compare/thomson-impressions/thomson-three', /Good recent overlap for comparison/], ['#/compare/thomson-three/thomson-impressions', /Good recent overlap for comparison/], ['#/compare/thomson-grand/thomson-impressions', /Limited recent overlap/], ['#/compare/bartley-ridge/botanique-at-bartley', /What the numbers suggest/]];
  for (const [h, re] of GOOD) await t(h + ' renders', async () => { const r = await render(h); assert.ok(!CANT.test(r.html) && re.test(r.html), r.errors.join('|')); assert.strictEqual(r.errors.length, 0); });
  await t('project pages render', async () => { for (const h of ['#/p/thomson-grand', '#/p/amo-residence', '#/p/amo-residence/new', '#/p/thomson-impressions']) { const r = await render(h); assert.ok(!CANT.test(r.html) && /<h1/.test(r.html), h + ' ' + r.errors.join('|')); } });
  await t('genuinely missing data still gets the load-error page', async () => { const r = await render('#/compare/amo-residence/does-not-exist'); assert.ok(/couldn’t load that comparison/.test(r.html)); const p = await render('#/p/does-not-exist'); assert.ok(/couldn’t find that project/.test(p.html)); });

  console.log('Page render: every kind of no-shared-evidence pair on real data');
  await t('~60 real pairs across sale-type shapes (new-only, sub-sale, resale-only, thin) all render without the load-error page, both orders', async () => {
    const P = require(path.join(root, 'assets/js/kpt-project.js')), idx = JSON.parse(fs.readFileSync(path.join(root, 'data/projects/index.json'), 'utf8')), rows = idx.rows.map((x, k) => P.rowObject(idx, k));
    const pick = (f, k) => rows.filter(f).sort((a, b) => b.n - a.n).slice(0, k).map((x) => x.id);
    const ids = [].concat(pick((x) => x.new > 0 && !x.resale && !x.sub, 4), pick((x) => x.sub > 0, 3), pick((x) => x.resale > 0 && !x.new && !x.sub, 4), pick((x) => x.n <= 2, 2)); let n = 0;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j += 2) { for (const h of ['#/compare/' + ids[i] + '/' + ids[j], '#/compare/' + ids[j] + '/' + ids[i]]) { const r = await render(h); n++; assert.ok(!CANT.test(r.html) && /id="verdict"/.test(r.html), h + ' ' + r.errors.join('|')); } }
    assert.ok(n >= 40, 'only ' + n);
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
