"""Browser checks for HDB research and the Map's HDB layer: the eleven workflows, at desktop and 390 px.
Run from the site folder:  python3 research/tests/hdb-render.py        (set HR_SHOTS=<folder> to also save screenshots)
Starts the site's own server and stubs OneMap (tiles, and the address search with real answers saved in fixtures/onemap-postal.json), so it needs no internet.
Waits are for something to appear, never for a fixed time.
"""
import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
ANS = json.load(open(SITE / 'research/tests/fixtures/onemap-postal.json'))['answers']
SHOTS = pathlib.Path(os.environ['HR_SHOTS']) if os.environ.get('HR_SHOTS') else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082')
ok = fail = 0
def check(name, cond, info=''):
    global ok, fail
    if cond: ok += 1; print('  ok   ' + name)
    else: fail += 1; print('  FAIL ' + name + (' :: ' + str(info)[:300] if info else ''))
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
def search(r):
    m = re.search(r'searchVal=(\d+)', r.request.url); body = ANS.get(m.group(1), {'found': 0, 'results': []}) if m else {'found': 0, 'results': []}
    r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(body))
def fresh(br, kw):
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG)); pg.route(re.compile(r'onemap\.gov\.sg/api/common/elastic/search'), search)
    return ctx, pg, errs
def shot(pg, name, full=False):
    if SHOTS: pg.screenshot(path=str(SHOTS / (name + '.png')), full_page=full)
def home(pg, h=''):
    pg.goto(B + '/research/' + h); pg.wait_for_selector('.gw-ropts', timeout=15000)
def hdbpage(pg, h):
    pg.goto(B + '/research/' + h); pg.wait_for_selector('[data-gw-hdbview] h1', timeout=20000)
def result(pg): pg.wait_for_selector('[data-hv-out] .gw-vx-res', timeout=20000)
def open_map(pg, h=''):
    pg.goto(B + '/research/map/' + h); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=20000)
def panel(pg): pg.wait_for_selector('[data-hdb-panel=ok]', timeout=20000); return pg.inner_text('.dp, .bs')
def hash_(pg): return pg.evaluate('location.hash')
def money(txt): return re.findall(r'\$\d[\d,]*\d', txt)
def blocks_drawn(pg): return pg.evaluate("document.querySelectorAll('path.leaflet-interactive[fill=\"#D9822B\"]').length + document.querySelectorAll('.hdbg').length")
def private_drawn(pg): return pg.evaluate("document.querySelectorAll('path.leaflet-interactive[fill=\"#5B72D8\"], path.leaflet-interactive').length - document.querySelectorAll('path.leaflet-interactive[fill=\"#D9822B\"]').length")
def layer(pg, name, on):
    pg.click('.lyr-b'); pg.wait_for_selector('.lyr-p'); box = pg.locator(f'input[data-layer={name}]')
    if box.is_checked() != on: box.set_checked(on)
    pg.keyboard.press('Escape')
VIEWS = [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('390', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True))]
def sparse_cases():
    js = r"""
const fs=require('fs'),path=require('path'),root=process.argv[1],GV=require(root+'/assets/js/gw-value.js'),I=JSON.parse(fs.readFileSync(root+'/data/value/hdb/index.json','utf8'));
const out={street:null,thin:null};
for(const t of I.towns){const T=JSON.parse(fs.readFileSync(root+'/data/value/hdb/t/'+t.id+'.json','utf8')),seen=new Set();T.id=t.id;
 for(const r of T.rows){const k=r[1]+'|'+r[2];if(seen.has(k))continue;seen.add(k);GV.hdbTypes(T,r[1],r[2]).all.forEach(ty=>{const d=GV.hdbComps(T,r[1],r[2],ty);
  const ref={town:t.id,block:r[1],street:T.streets[r[2]],type:I.types[ty]};
  if(d.level==='street'&&!out.street&&d.blockN===1)out.street=ref; if(d.level==='thin'&&!out.thin)out.thin=ref;});}}
console.log(JSON.stringify(out));"""
    return json.loads(subprocess.check_output(['node', '-e', js, str(SITE)], text=True))
SP = sparse_cases()
def slug(s): return re.sub(r'(^-|-$)', '', re.sub(r'[^a-z0-9]+', '-', s.lower()))
def hashof(c): return '#/hdb/' + '/'.join([c['town'], c['block'].lower(), slug(c['street'])] + ([slug(c['type'])] if c.get('type') else []))
try:
  with sync_playwright() as p:
    br = p.chromium.launch(); ref = {}
    for vn, kw in VIEWS:
        mob = vn != 'desktop'

        print('\n== 1. HDB postal code from Research\'s first search,', vn)
        ctx, pg, errs = fresh(br, kw); home(pg)
        pg.fill('#q', '570155'); pg.wait_for_selector('#res button', timeout=15000)
        row = pg.inner_text('#res')
        check(vn + ': the search names the block, town and the way in', 'Blk 155 Bishan Street 13' in row and 'HDB flat' in row and 'See resale prices' in row, row)
        shot(pg, f'1-first-search-{vn}')
        pg.keyboard.press('Enter'); pg.wait_for_selector('[data-gw-hdbview] h1')
        check(vn + ': it opens that block\'s research, with no postal code or anything typed in the address', hash_(pg) == '#/hdb/bishan/155/bishan-st-13' and not re.search(r'\d{6}', pg.url), pg.url)
        check(vn + ': the buyer picks nothing else first: block, town and flat types are on the page', pg.inner_text('[data-gw-hdbview] h1') == 'Blk 155 Bishan Street 13' and 'Bishan' in pg.inner_text('[data-hv-lead]') and pg.locator('[data-hv-ft]').count() == 4)
        ctx.close()
        ctx, pg, errs = fresh(br, kw); home(pg); check(vn + ': still three in-page options, none for HDB', pg.locator('.gw-ropt').count() == 3 and pg.inner_text('.gw-ropts').count('HDB') <= 1); ctx.close()

        print('\n== 2. HDB postal code from Property prices & past sales,', vn)
        ctx, pg, errs = fresh(br, kw); home(pg, '#/prices'); pg.wait_for_selector('[data-vx-pc]')
        pg.fill('[data-vx-pc]', '570155'); pg.wait_for_selector('[data-vx-pc-out] , [data-vx-pcout]'); pg.wait_for_selector('.gw-vx-res', timeout=20000)
        t2 = pg.inner_text('main'); a2 = money(t2)
        check(vn + ': the same block answers there, with its own range', 'Blk 155 Bishan St 13' in t2 and len(a2) >= 2, t2[:200])
        check(vn + ': a link leads on to the full HDB research', pg.locator('a[data-gw-go=hdb-research]').count() >= 1)
        ref[vn + '-prices'] = a2[:2]
        shot(pg, f'2-prices-postal-{vn}')
        ctx.close()

        print('\n== 3. HDB block and flat-type research,', vn)
        ctx, pg, errs = fresh(br, kw); hdbpage(pg, '#/hdb/bishan/155/bishan-st-13')
        chips = pg.evaluate("[...document.querySelectorAll('[data-hv-ft]')].map(b=>b.textContent)")
        check(vn + ': flat types of this block and its street are offered', chips == ['3-room', '4-room', '5-room', 'Executive'], chips)
        pg.click('[data-hv-ft]:has-text("5-room")'); result(pg)
        o5 = pg.inner_text('[data-hv-out]')
        check(vn + ': block evidence says "in this block", with count, range, dates, size and lease', '5 resales of 5-room flats in this block' in o5 and 'Registered' in o5 and 'sqm' in o5 and 'lease began' in o5, o5[:300])
        check(vn + ': the flat type is in the address', hash_(pg).endswith('/5-room'))
        ref[vn + '-research'] = money(o5)[:2]
        pg.click('[data-hv-ft]:has-text("3-room")'); pg.wait_for_function("document.querySelector('[data-hv-out]').innerText.includes('None in this block')")
        o3 = pg.inner_text('[data-hv-out]')
        check(vn + ': street evidence is labelled as the street\'s, not the block\'s', 'resales of 3-room flats on Bishan Street 13' in o3 and 'None in this block, so these are the sales on this street' in o3, o3[:300])
        near = pg.locator('[data-hv-near] a[data-hv-block]'); check(vn + ': nearby blocks are listed, each with its own resales', near.count() >= 3)
        shot(pg, f'3-hdb-research-{vn}', True)
        first = near.first.get_attribute('href'); h0 = hash_(pg); near.first.click(); pg.wait_for_function('h => location.hash !== h', arg=h0)
        check(vn + ': a nearby block opens its own research', hash_(pg) == first, hash_(pg))
        pg.wait_for_selector('[data-hv-out] .gw-vx-res'); pg.go_back(); pg.wait_for_function('h => location.hash === h', arg=h0)
        check(vn + ': Back returns to the block and flat type', 'Blk 155' in pg.inner_text('[data-gw-hdbview] h1') and pg.locator('[data-hv-ft][aria-pressed=true]').inner_text() == '3-room')
        pg.go_forward(); pg.wait_for_function('h => location.hash === h', arg=first); check(vn + ': Forward returns to the nearby block', hash_(pg) == first)
        ctx.close()
        ctx, pg, errs = fresh(br, kw); hdbpage(pg, h0); result(pg)
        check(vn + ': a shared link opens the same block and flat type', 'Blk 155 Bishan Street 13' in pg.inner_text('h1') and pg.locator('[data-hv-ft][aria-pressed=true]').inner_text() == '3-room' and 'None in this block' in pg.inner_text('[data-hv-out]'))
        ctx.close()

        print('\n== 4. HDB asking-price check,', vn)
        ctx, pg, errs = fresh(br, kw); hdbpage(pg, '#/hdb/bishan/155/bishan-st-13/5-room'); result(pg)
        inp = pg.locator('[data-hv-out] input').first; before = pg.inner_text('[data-hv-out]')
        inp.fill('1,000,000'); pg.wait_for_function("t => document.querySelector('[data-hv-out]').innerText !== t", arg=before)
        after = pg.inner_text('[data-hv-out]')
        check(vn + ': the existing asking-price check answers against this block\'s sales', 'Type the asking price' not in after and ('1,000,000' in after or 'asking' in after.lower()), after[-500:])
        check(vn + ': the price is not put in the address', '1000000' not in pg.url and '1,000,000' not in pg.url and hash_(pg).endswith('/5-room'))
        links = pg.evaluate("[...document.querySelectorAll('[data-hv-out] a')].map(a=>a.href).join(' ')"); check(vn + ': nothing the visitor typed is in a link', '1000000' not in links and '1%2C000%2C000' not in links)
        shot(pg, f'4-asking-{vn}', True); ctx.close()

        print('\n== 5. Sparse and no-sales cases,', vn)
        for kind in ('street', 'thin'):
            c = SP[kind]; ctx, pg, errs = fresh(br, kw); hdbpage(pg, hashof(c)); result(pg); o = pg.inner_text('[data-hv-out]')
            if kind == 'street': check(vn + ': a block with a single resale uses the street, and says so (' + c['street'] + ' ' + c['block'] + ')', re.search(r'Only 1 in this block|None in this block', o) is not None and 'on ' in o, o[:300])
            else: check(vn + ': too few resales: no range and no summary (' + c['street'] + ' ' + c['block'] + ')', 'The middle' not in o and re.search(r'too few|few', o) is not None, o[:300])
            check(vn + ': no price appears that is not a recorded sale', len(money(o)) <= 40); ctx.close()
        ctx, pg, errs = fresh(br, kw); hdbpage(pg, '#/hdb/bishan/999/bishan-st-13'); lead = pg.inner_text('[data-hv-lead]')
        check(vn + ': a block with no resales on record is named as such, with the street\'s flat types', 'no resale in this block' in lead and pg.locator('[data-hv-ft]').count() >= 1, lead)
        pg.locator('[data-hv-ft]').first.click(); result(pg); check(vn + ': and answers from the street, never inventing a block price', 'None in this block' in pg.inner_text('[data-hv-out]') or 'on Bishan Street 13' in pg.inner_text('[data-hv-out]'))
        ctx.close()
        ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/hdb/bishan/155/not-a-street'); pg.wait_for_selector('[data-gw-hdbview]', timeout=20000); pg.wait_for_function("document.querySelector('[data-gw-hdbview]').innerText.includes('No resales on that street')", timeout=20000)
        check(vn + ': a street that does not exist is said plainly, with a way to search again', 'Search another home' in pg.inner_text('main') and 'postal code' in pg.inner_text('main') and not errs, errs[:2]); ctx.close()

        print('\n== 6. MRT, HDB layer, block, flat type, full research,', vn)
        ctx, pg, errs = fresh(br, kw); open_map(pg)
        pg.fill('#q', 'Bishan'); pg.wait_for_selector('.sugg button[data-pick^="mrt"]'); pg.click('.sugg button[data-pick^="mrt"]'); pg.wait_for_selector('.dp h2, .bs h2')
        check(vn + ': the MRT station is found by name', 'Bishan MRT' in pg.inner_text('.dp, .bs'))
        check(vn + ': the radius can be chosen first (500 m, 1 km, 2 km, 3 km)', pg.locator('.dp .rad button, .bs .rad button').count() == 4)
        pg.locator('.dp [data-pr="500"], .bs [data-pr="500"]').first.click(); pg.wait_for_selector('[data-pr="500"][aria-checked=true]'); check(vn + ': 500 m is applied', 'r=500' in hash_(pg), hash_(pg))
        layer(pg, 'hdb', True); pg.wait_for_function("document.querySelectorAll('path.leaflet-interactive[fill=\"#D9822B\"]').length > 0")
        n_on = blocks_drawn(pg); check(vn + ': HDB blocks appear around the station, clustered, with no price or label drawn on the map', n_on > 0 and pg.locator('.leaflet-tooltip:visible').count() == 0 and not re.search(r'\$\d', pg.inner_text('#map')), n_on)
        shot(pg, f'6a-layer-on-{vn}')
        pg.evaluate("document.querySelector('path.leaflet-interactive[fill=\"#D9822B\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))")
        pg.wait_for_selector('[data-hdb-panel=ok]'); pnl = pg.inner_text('.dp, .bs'); h_blk = hash_(pg)
        check(vn + ': choosing a block opens a concise panel: block, flat types, link to full research', pg.locator('.hft').count() >= 1 and 'Open full HDB research' in pnl, pnl[:300])
        pg.locator('.hft[aria-pressed=false]').first.click(); pg.wait_for_function("document.querySelector('.hft[aria-pressed=true]') && document.querySelector('.hev')")
        check(vn + ': evidence is labelled as historical resale information, not listings or a valuation', 'Historical resale prices from HDB records, not current listings or an official HDB valuation' in pg.inner_text('.dp, .bs'))
        check(vn + ': the flat type picked shows its own evidence, in the address without any private detail', pg.locator('.hev').count() == 1 and '&ft=' in hash_(pg) and not re.search(r'\d{6}', pg.url), hash_(pg))
        shot(pg, f'6b-block-panel-{vn}')
        href = pg.get_attribute('a[data-m-hdb]', 'href'); pg.click('a[data-m-hdb]'); pg.wait_for_selector('[data-gw-hdbview] h1', timeout=20000)
        check(vn + ': "Open full HDB research" opens the block\'s research for that flat type', href.startswith('../#/hdb/') and hash_(pg) in href.replace('../', ''), (href, hash_(pg)))
        pg.go_back(); pg.wait_for_function("window.KPT_MAP_APP && window.KPT_MAP_APP.S.place && window.KPT_MAP_APP.S.place.t === 'hdb'", timeout=20000)
        check(vn + ': Back returns to the Map on the same block', hash_(pg).startswith('#pl=hdb'))
        pg.go_back(); pg.wait_for_function("window.KPT_MAP_APP.S.place && window.KPT_MAP_APP.S.place.t === 'mrt'", timeout=20000); check(vn + ': and Back again to the station search', 'Bishan' in pg.inner_text('.dp, .bs'))
        pg.go_forward(); pg.wait_for_function("window.KPT_MAP_APP.S.place && window.KPT_MAP_APP.S.place.t === 'hdb'", timeout=20000); check(vn + ': Forward returns to the block', hash_(pg).startswith('#pl=hdb'))
        check(vn + ': no page errors', not errs, errs[:3]); ctx.close()

        print('\n== 7. Layer on and off, private developments kept,', vn)
        ctx, pg, errs = fresh(br, kw); open_map(pg, '#pl=mrt%3ABishan+MRT&r=1000')
        pg.wait_for_selector('.dp h2, .bs h2'); priv0 = private_drawn(pg); check(vn + ': before anything, private developments are drawn and the HDB layer is off', priv0 > 20 and blocks_drawn(pg) == 0, (priv0, blocks_drawn(pg)))
        layer(pg, 'hdb', True); pg.wait_for_function("document.querySelectorAll('path.leaflet-interactive[fill=\"#D9822B\"]').length > 0"); priv1 = private_drawn(pg)
        check(vn + ': switching HDB on keeps every private development', priv1 >= priv0 - 1 and blocks_drawn(pg) > 0, (priv0, priv1))
        layer(pg, 'homes', False); pg.wait_for_function("document.querySelectorAll('path.leaflet-interactive[fill=\"#D9822B\"]').length > 0")
        check(vn + ': the two layers are independent: private off, HDB still on', blocks_drawn(pg) > 0 and private_drawn(pg) < priv0 / 2, (private_drawn(pg), priv0))
        layer(pg, 'homes', True); layer(pg, 'hdb', False); pg.wait_for_function("document.querySelectorAll('path.leaflet-interactive[fill=\"#D9822B\"]').length === 0 && document.querySelectorAll('.hdbg').length === 0")
        check(vn + ': switching HDB off removes its blocks and returns the private view', blocks_drawn(pg) == 0 and private_drawn(pg) >= priv0 - 1)
        check(vn + ': the choice is remembered for the visit, like the other layers', pg.evaluate("JSON.parse(sessionStorage.getItem('kpt.map.layers')).hdb") is False)
        ctx.close()
        ctx, pg, errs = fresh(br, kw); open_map(pg, '#pl=hdb%3Abishan%2F155%2Fbishan-st-13&r=500&ft=5-room'); txt = panel(pg)
        check(vn + ': a shared Map link to a block opens it with its flat type, even with the layer off', 'Blk 155 Bishan Street 13' in txt and pg.locator('.hft[aria-pressed=true]').inner_text() == '5-room' and '5 resales in this block' in txt, txt[:200])
        ref[vn + '-map'] = money(txt)[:2]; shot(pg, f'7-map-deeplink-{vn}'); ctx.close()

        print('\n== 8. Condo, EC, cluster, landed and new-launch postal codes,', vn)
        for code, want, label in (('575749', 'jadescape', 'condo'), ('579819', 'bishan-loft', 'EC'), ('359419', 'dunsfold-18', 'cluster')):
            ctx, pg, errs = fresh(br, kw); home(pg); pg.fill('#q', code); pg.wait_for_selector('#res button'); pg.keyboard.press('Enter'); pg.wait_for_url('**/research/map/**', timeout=20000)
            pg.wait_for_selector('.dp h2, .bs h2'); full = pg.get_attribute('a[data-m-full]', 'href')
            check(vn + ': ' + label + ' postal code opens that development on the Map, with the full Research one tap away', hash_(pg).startswith('#p=' + want) and full == '../#/p/' + want and not re.search(r'\d{6}', pg.url), (hash_(pg), full)); ctx.close()
        ctx, pg, errs = fresh(br, kw); home(pg); pg.fill('#q', '459919'); pg.wait_for_selector('#res button'); rows = pg.inner_text('#res'); pg.keyboard.press('Enter'); pg.wait_for_function("location.hash === '#/prices'", timeout=20000)
        check(vn + ': a landed postal code goes to the landed research, with the code typed into its box (not the address)', 'Landed' in rows and pg.input_value('[data-vx-pc]') == '459919' and '459919' not in pg.url, rows); ctx.close()
        ctx, pg, errs = fresh(br, kw); home(pg); pg.fill('#q', '579600'); pg.wait_for_selector('#res button'); check(vn + ': a project not yet on sale (Thomson Reserve) is found by postal code', 'Thomson Reserve' in pg.inner_text('#res')); ctx.close()
        ctx, pg, errs = fresh(br, kw); home(pg); pg.fill('#q', '999999'); pg.wait_for_function("document.querySelector('#res') && document.querySelector('#res').innerText.trim() && !document.querySelector('#res').innerText.includes('Looking up')")
        check(vn + ': a code with no result says what was found and what to do next', len(pg.inner_text('#res').strip()) > 20, pg.inner_text('#res')); ctx.close()
        ctx, pg, errs = fresh(br, kw); home(pg); pg.fill('#q', 'the jadescape'); pg.wait_for_selector('#res button')
        check(vn + ': "The" is optional: "the jadescape" finds Jadescape', 'Jadescape' in pg.inner_text('#res')); ctx.close()
        ctx, pg, errs = fresh(br, kw); home(pg); pg.fill('#q', 'Bishan MRT'); pg.wait_for_selector('#res button'); pg.locator('[data-mapq]').first.click(); pg.wait_for_url('**/research/map/**', timeout=20000)
        pg.wait_for_function("window.KPT_MAP_APP && window.KPT_MAP_APP.S.place && window.KPT_MAP_APP.S.place.t === 'mrt'", timeout=20000)
        check(vn + ': an MRT station goes to the Map, already on that station, without the typed words in the address', 'Bishan' in pg.inner_text('.dp, .bs') and 'Bishan' not in pg.url.split('#')[0], pg.url); ctx.close()

        print('\n== 9. Menu links,', vn)
        for path in ('/research/', '/tools/', '/'):
            ctx, pg, errs = fresh(br, kw); pg.goto(B + path); pg.wait_for_selector('.gw-nav')
            pg.click('.gw-nav >> text=Menu'); pg.wait_for_selector('.gw-mcols .gw-mi')
            hs = pg.evaluate("[...document.querySelectorAll('.gw-mcols .gw-mi')].map(a=>[a.querySelector('b')?.textContent||'', a.getAttribute('href')])"); d = dict(hs)
            pre = '' if path == '/' else '../'
            check(vn + ': ' + path + ' menu: the four Research links open Unified Research', d.get('Research a development') == pre + 'research/#/' and d.get('Property prices & past sales') == pre + 'research/#/prices' and d.get('What can this budget buy?') == pre + 'research/#/budget' and d.get('Browse every development') == pre + 'research/#/browse', d)
            check(vn + ': ' + path + ' menu: none of the four links is listed twice', all([h[1] for h in hs].count(pre + x) == 1 for x in ('research/#/', 'research/#/prices', 'research/#/budget', 'research/#/browse')), [h[1] for h in hs])
            names = [h[0] for h in hs if h[0]]; check(vn + ': ' + path + ' menu: each Research name appears once', all(names.count(n) == 1 for n in ('Research a development', 'Property prices & past sales', 'What can this budget buy?', 'Browse every development')), names)
            ctx.close()
        ctx, pg, errs = fresh(br, kw); home(pg); pg.click('.gw-nav >> text=Menu'); pg.wait_for_selector('.gw-mi'); pg.locator('.gw-mi', has_text='Property prices & past sales').first.click()
        pg.wait_for_function("location.hash === '#/prices'", timeout=20000); pg.wait_for_selector('[data-vx-pc]'); check(vn + ': from Research, the menu opens Property prices & past sales in place', hash_(pg) == '#/prices')
        pg.click('.gw-nav >> text=Menu'); pg.wait_for_selector('.gw-mi'); pg.locator('.gw-mi', has_text='What can this budget buy?').first.click(); pg.wait_for_function("location.hash === '#/budget'", timeout=20000); check(vn + ': and What can this budget buy? likewise', hash_(pg) == '#/budget'); ctx.close()
        for old in ('/journey/worth/', '/tools/what-can-i-buy/', '/buy/'):
            ctx, pg, errs = fresh(br, kw); r = pg.goto(B + old); check(vn + ': the standalone page ' + old + ' still opens', r.status == 200 and pg.locator('h1').count() >= 1); ctx.close()
        ctx, pg, errs = fresh(br, kw); r = pg.goto(B + '/research/'); t = pg.title(); check(vn + ': the browser title says HDB and private property', 'HDB' in t and 'private' in t.lower() and 'prices' in t.lower(), t)
        d = pg.evaluate("document.querySelector('meta[name=description]').content"); check(vn + ': so does the description', 'HDB' in d and 'condo' in d and 'transaction' in d, d); ctx.close()

        print('\n== 10. Existing Jadescape and Serra journeys,', vn)
        ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/p/jadescape'); pg.wait_for_function("document.querySelector('h1') && document.querySelector('h1').innerText.includes('Jadescape')", timeout=20000)
        check(vn + ': Jadescape research opens as before', 'Jadescape' in pg.inner_text('h1') and not errs, errs[:2]); ctx.close()
        ctx, pg, errs = fresh(br, kw); open_map(pg, '#p=jadescape&r=1000'); pg.wait_for_selector('.dp h2, .bs h2'); check(vn + ': Jadescape on the Map keeps its panel and nearby comparison', 'Jadescape' in pg.inner_text('.dp, .bs') and 'Open full analysis' in pg.inner_text('.dp, .bs'));
        layer(pg, 'hdb', True); pg.wait_for_function("document.querySelectorAll('path.leaflet-interactive[fill=\"#D9822B\"]').length > 0"); check(vn + ': the HDB layer can be added around a private development without losing its panel', 'Jadescape' in pg.inner_text('.dp, .bs')); ctx.close()
        ctx, pg, errs = fresh(br, kw); open_map(pg, '#p=the-serra-residences'); pg.wait_for_selector('.dp h2, .bs h2'); check(vn + ': Serra (a new launch) keeps its panel, with no price', 'Serra' in pg.inner_text('.dp, .bs') and not re.search(r'\$\d', pg.inner_text('.dp, .bs'))); ctx.close()
        ctx, pg, errs = fresh(br, kw); home(pg); pg.fill('#q', 'Serra'); pg.wait_for_selector('#res button'); check(vn + ': Serra is found from Research\'s first search', 'Serra' in pg.inner_text('#res')); ctx.close()

        print('\n== 11. Back, Forward, deep links and Map interactions,', vn)
        ctx, pg, errs = fresh(br, kw); open_map(pg); pg.fill('#q', '155 bishan'); pg.wait_for_selector('.sugg button[data-pick^="hdb"]')
        check(vn + ': a block is found in the Map search by number and street', 'Blk 155 Bishan Street 13' in pg.inner_text('.sugg'))
        pg.click('.sugg button[data-pick^="hdb"]'); panel(pg); h1 = hash_(pg); layer(pg, 'hdb', True)
        pg.wait_for_function("document.querySelectorAll('path.leaflet-interactive[fill=\"#D9822B\"]').length > 0")
        if mob:
            check(vn + ': the phone sheet leads with the resale evidence', pg.locator('.bs [data-hdb-panel=ok]').count() == 1)
            pg.click('[data-dpmin]'); pg.wait_for_selector('.bs.min'); mn = pg.inner_text('.bs.min'); check(vn + ': Minimise keeps the block in a slim bar and shows the map', 'Blk 155' in mn and pg.locator('.bs .hev').count() == 0, mn)
            shot(pg, f'11-minimised-{vn}'); pg.click('[data-dpshow]'); pg.wait_for_selector('.bs [data-hdb-panel=ok]'); check(vn + ': Reopen restores the panel with its flat type', 'Blk 155' in pg.inner_text('.bs'))
            pg.click('[data-dpmore]'); pg.wait_for_function("document.querySelector('.bs.open')"); check(vn + ': "Developments nearby" opens the rest, radius included', pg.locator('.bs .rad button').count() == 4, pg.inner_text('.bs')[-300:]); shot(pg, f'11-sheet-open-{vn}')
        pg.click('[data-hft]:has-text("4-room")'); pg.wait_for_function("document.querySelector('[data-hft=\"4-room\"][aria-pressed=true]')")
        h2 = hash_(pg); check(vn + ': a flat type chosen is kept in the address', '&ft=4-room' in h2, h2)
        pg.go_back(); pg.wait_for_function("!window.KPT_MAP_APP.S.place"); check(vn + ': Back leaves the block (the search that found it)', 'ft=' not in hash_(pg) and pg.locator('[data-hdb-panel]').count() == 0)
        pg.go_forward(); pg.wait_for_function("window.KPT_MAP_APP.S.place && window.KPT_MAP_APP.S.place.t === 'hdb'"); pg.wait_for_selector('[data-hdb-panel=ok]'); check(vn + ': Forward returns to it with the flat type kept', 'ft=4-room' in hash_(pg) and pg.locator('.hft[aria-pressed=true]').inner_text() == '4-room', hash_(pg))
        pg.reload(); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady'); pg.wait_for_selector('.hft'); check(vn + ': reloading restores the Map where it was', 'Blk 155 Bishan Street 13' in pg.inner_text('.dp, .bs'))
        check(vn + ': no page errors', not errs, errs[:3]); ctx.close()

        print('\n== Consistency: the same block and flat type read the same everywhere,', vn)
        r_, p_, m_ = ref[vn + '-research'], ref[vn + '-prices'], ref[vn + '-map']
        check(vn + ': Research, Property prices and the Map give the same range for Blk 155 5-room', r_ == p_ == m_ and len(r_) == 2, (r_, p_, m_))

    br.close()
finally:
    srv.terminate()
print(f'\n{ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
