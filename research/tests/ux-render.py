"""Browser checks for the consolidated homepage, navigation and Research release (25 Oct 2026), at desktop and 390 px.
Run from the site folder:  python3 research/tests/ux-render.py      (UX_SHOTS=<folder> also saves screenshots)
Starts the site's own server and stubs OneMap tiles, so it needs no internet (UX_REAL_TILES=1 lets real tiles through for screenshots).
Waits are for something to appear, never for a fixed time.
"""
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
SHOTS = pathlib.Path(os.environ['UX_SHOTS']) if os.environ.get('UX_SHOTS') else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)
REAL = os.environ.get('UX_REAL_TILES') == '1'
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
def fresh(br, kw):
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    if not REAL: pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    return ctx, pg, errs
def shot(pg, name, full=False, el=None):
    if not SHOTS: return
    if el:   # the sticky header would otherwise sit over part of a section captured below it
        pg.add_style_tag(content='.gw-nav{position:static !important}'); pg.locator(el).first.screenshot(path=str(SHOTS / (name + '.png')))
    else: pg.screenshot(path=str(SHOTS / (name + '.png')), full_page=full)
GONE = ['AI-assisted, not reviewed by Ken', 'not reviewed by Ken', 'Please leave income, CPF and debt figures out of the first message']
NAV = ['Plan My Move', 'Research', 'Map', 'New Launches', 'Calculators']   # V3.9 (Ken, 27 Oct 2026): New Launches is the on-site directory, research/new-launches/

try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2))]:
            phone = vn == 'phone'
            print('\n== 1. Homepage and Plan My Move,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/'); pg.wait_for_selector('.gw-doors3')
            links = pg.eval_on_selector_all('.gw-nav .gw-links a', 'as => as.map(a => a.textContent.replace("↗", "").trim())')
            check(vn + ': main navigation reads Plan My Move · Research · Map · New Launches · Calculators', links == NAV, links)
            doors = pg.eval_on_selector_all('.gw-door3', 'as => as.map(a => [a.getAttribute("href"), a.innerText.split("\\n")[0]])')
            check(vn + ': three entry points: buy, sell, research', [d[0] for d in doors] == ['journey/#buy', 'journey/#sell', 'research/'], doors)
            mf = pg.locator('a.gw-mapf'); check(vn + ': the Map is a visible feature with "Explore on Map"', mf.count() == 1 and mf.is_visible() and 'Explore on Map' in mf.inner_text() and mf.get_attribute('href') == 'research/map/')
            body = pg.inner_text('body'); check(vn + ': the three removed sentences are gone', not any(g in body for g in GONE), [g for g in GONE if g in body])
            check(vn + ': the sample report link stays', pg.locator('a[data-kpt-sample]').count() >= 1)
            check(vn + ': the page does not scroll sideways', pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
            shot(pg, f'01-home-{vn}', full=False)
            if phone:
                pg.locator('.gw-menu summary').first.click(); pg.wait_for_selector('.gw-menu[open] .gw-mfoot')
                mtxt = pg.inner_text('.gw-menu[open]'); check(vn + ': the menu says Plan My Move and Calculators, not Buy or Sell / Tools', 'Plan My Move' in mtxt and 'Calculators' in mtxt and 'Buy or Sell' not in mtxt)
                shot(pg, f'02-menu-{vn}'); pg.locator('.gw-menu summary').first.click()
                go = pg.locator('.gw-menu .gw-mi[href="journey/"]').first
            else:
                go = pg.locator('.gw-links a[data-kpt-nav="journey"]')
            if phone: pg.goto(B + '/'); pg.wait_for_selector('.gw-doors3'); pg.locator('.gw-menu summary').first.click(); pg.wait_for_selector('.gw-menu[open] .gw-mfoot'); go = pg.locator('.gw-menu[open] a[href="journey/"]').first
            go.click(); pg.wait_for_selector('.gw-paths')
            paths = pg.eval_on_selector_all('.gw-path b', 'bs => bs.map(b => b.textContent)')
            check(vn + ': Plan My Move opens Guide Me with the four choices', pg.url.rstrip('/').endswith('/journey') and len(paths) == 4 and paths[2] == 'Upgrade from HDB' and paths[3] == 'Sell and buy again', paths)
            check(vn + ': at the start, not scrolled past the choices, no path open', pg.evaluate('scrollY') < 5 and pg.locator('.gw-panel.on, .gw-path[aria-expanded="true"]').count() == 0)
            check(vn + ': Plan My Move is marked as the current section', pg.locator('[data-kpt-nav="journey"][aria-current="page"], .gw-secs [data-gw-nav-to="journey"][aria-current="page"]').count() >= 1)
            shot(pg, f'03-plan-my-move-{vn}')
            pg.locator('.gw-path[data-gw-path="sell"]').click(); pg.wait_for_function("location.hash === '#sell'")
            check(vn + ': a chosen path still deep-links (#sell)', pg.locator('#sell').is_visible())
            pg.goto(B + '/journey/#up'); pg.wait_for_selector('#up'); check(vn + ': journey/#up still opens the upgrade path', pg.locator('#up').is_visible())
            pg.goto(B + '/tools/'); pg.wait_for_selector('h1'); check(vn + ': the directory is "Calculators" at /tools/ (V3.4: four questions)', pg.inner_text('h1') == 'Calculators')
            check(vn + ': no page errors', not errs, errs); ctx.close()

            print('\n== 2. Research opens the analysis; bedrooms first,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/'); pg.wait_for_selector('.gw-ropts', timeout=15000)
            res = pg.evaluate("(() => { try { return window.KPTR && true } catch (e) { return false } })()")
            pg.goto(B + '/research/#/p/jadescape'); pg.wait_for_selector('#lgPick', timeout=20000)
            check(vn + ': a development opens its full analysis, not the Map', '/research/map/' not in pg.url and 'Jadescape' in pg.inner_text('h1'), pg.url)
            pick = pg.inner_text('#lgPick'); check(vn + ': "How many bedrooms?" leads', 'How many bedrooms?' in pick)
            check(vn + ': floor area is one quiet link, its picker closed', pg.locator('[data-gwb-area]').is_visible() and pg.locator('#gwbArea').is_hidden())
            check(vn + ': no bedroom is chosen for the visitor', pg.locator('#lgPick [aria-pressed="true"]').count() == 0)
            check(vn + ': the report\'s WhatsApp area no longer asks visitors to leave out income, CPF and debt (presentation only)', 'leave income, CPF and debt' not in pg.inner_text('body'))
            shot(pg, f'04-bedrooms-{vn}', el='#lgPick')
            pg.locator('[data-gwb-area]').click(); pg.wait_for_selector('#gwbArea:not([hidden]) #sizeSel')
            check(vn + ': "Search by floor area" opens the size picker in place', pg.locator('#sizeSel').is_visible() and pg.get_attribute('[data-gwb-area]', 'aria-expanded') == 'true')
            shot(pg, f'05-floor-area-{vn}', el='#lgPick')
            pg.goto(B + '/research/#/p/1-canberra'); pg.wait_for_selector('#lgPick', timeout=20000)
            check(vn + ': without bedroom data the size picker is shown directly', 'How many bedrooms?' not in pg.inner_text('#lgPick') and pg.locator('#sizeSel').is_visible())
            check(vn + ': no page errors', not errs, errs); ctx.close()

            print('\n== 3. Location & amenities, and on to the Map,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/p/jadescape'); pg.wait_for_selector('#lgPick', timeout=20000)
            check(vn + ': Leaflet is not loaded until the section is needed', pg.evaluate('!window.L'))
            sc = pg.locator('[data-lg-loc-go]'); check(vn + ': the report has a Location & amenities shortcut', sc.count() == 1 and sc.is_visible())
            sc.click(); pg.wait_for_selector('#lgLoc .gwl-map.leaflet-container', timeout=20000); pg.wait_for_selector('#lgLoc .gwl-near')
            near = pg.inner_text('#lgLoc .gwl-near'); check(vn + ': centred on the development, nearest station named with a straight-line distance', 'Nearest station' in near and 'Marymount' in near, near[:200])
            check(vn + ': says straight-line, never walking', 'not walking routes' in pg.inner_text('#lgLoc') and 'walk' not in near.lower())
            chips = pg.locator('#lgLoc [data-gwl-k]'); check(vn + ': a few restrained switches (MRT on; schools, food and shops, parks off)', chips.count() >= 3 and pg.get_attribute('#lgLoc [data-gwl-k="mrt"]', 'aria-pressed') == 'true')
            n0 = pg.locator('#lgLoc .leaflet-interactive').count(); pg.locator('#lgLoc [data-gwl-k="school"]').click(); pg.wait_for_function('n => document.querySelectorAll("#lgLoc .leaflet-interactive").length > n', arg=n0)
            check(vn + ': switching schools on adds them to the map', pg.locator('#lgLoc .leaflet-interactive').count() > n0)
            h = pg.evaluate("document.querySelector('#lgLoc .gwl-map').getBoundingClientRect().height"); check(vn + ': the map does not take over the screen', h <= (300 if phone else 400), h)
            check(vn + ': the page does not scroll sideways', pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
            if REAL: pg.locator('#lgLoc').scroll_into_view_if_needed(); pg.wait_for_function("document.querySelectorAll('#lgLoc .leaflet-tile-loaded').length > 3 && !document.querySelector('#lgLoc .leaflet-tile:not(.leaflet-tile-loaded)')", timeout=30000)
            cover = pg.evaluate("(() => { const m = document.querySelector('#lgLoc .gwl-map').getBoundingClientRect(); return [...document.querySelectorAll('#lgLoc .leaflet-tile-loaded')].some(t => { const r = t.getBoundingClientRect(); return r.right >= m.right - 2 && r.bottom >= m.bottom - 2; }) })()")
            check(vn + ': the basemap fills the whole map (no missing tiles)', cover or not REAL)
            shot(pg, f'06-location-{vn}', el='#lgLoc')
            full = pg.locator('#lgLoc [data-gwl-full]'); check(vn + ': "Explore the full Map" opens the Map at this development', full.get_attribute('href') == 'map/#p=jadescape')
            full.click(); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=25000)
            check(vn + ': the full Map opens', '/research/map/' in pg.url)
            pg.go_back(); pg.wait_for_selector('#lgPick', timeout=20000); check(vn + ': Back returns to the report', 'Jadescape' in pg.inner_text('h1'))
            check(vn + ': no page errors', not errs, errs); ctx.close()

            print('\n== 4. Map → development → full Research,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/map/#p=jadescape'); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=25000)
            pg.wait_for_selector('a[data-m-full="jadescape"]', state='attached', timeout=20000)
            pg.evaluate("document.querySelector('a[data-m-full=\"jadescape\"]').click()"); pg.wait_for_selector('#lgPick', timeout=20000)
            check(vn + ': the Map opens the development\'s full analysis directly', '#/p/jadescape' in pg.url and 'Jadescape' in pg.inner_text('h1'))
            pg.go_back(); pg.wait_for_function("location.pathname.indexOf('/research/map/') >= 0", timeout=20000); check(vn + ': Back returns to the Map', True)
            check(vn + ': no page errors', not errs, errs); ctx.close()

            print('\n== 5. Check an asking price,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/p/jadescape'); pg.wait_for_selector('#lgPick', timeout=20000)
            pg.locator('[data-lg-ask]').first.click(); pg.wait_for_selector('#lgAsk:not([hidden])')
            A = json.loads(pg.get_attribute('#lgAsk', 'data-ask')); b = max(A['bands'], key=lambda x: x.get('n', 0)); size = b['bin'] + 50
            def ask(price):
                pg.fill('#lgAsk [data-ask-size]', str(size)); pg.fill('#lgAsk [data-ask-price]', ''); pg.fill('#lgAsk [data-ask-price]', str(int(price)))
                pg.wait_for_selector('#lgAsk .gw-ask-v'); return pg.inner_text('#lgAsk [data-ask-out]')
            pg.fill('#lgAsk [data-ask-size]', str(size)); pg.fill('#lgAsk [data-ask-price]', ''); pg.click('#lgAsk [data-ask-price]'); pg.keyboard.type('2942400')
            check(vn + ': the asking price takes its commas as it is typed', pg.input_value('#lgAsk [data-ask-price]') == '2,942,400', pg.input_value('#lgAsk [data-ask-price]'))
            o = ask(b['med'] * size); check(vn + ': at the median: "Within recent comparable sale range"', o.startswith('Within recent comparable sale range'), o[:120])
            for w in ['Asking', 'Recent range', 'Median', 'Size band', 'Sales', 'last 12 months']: check(vn + ': the figure "' + w + '" is shown', w in o)
            check(vn + ': one quiet line instead of the yellow panel', pg.locator('#lgAsk .gw-ask-note').count() == 0 and 'Recent sales are a guide, not a valuation.' in pg.inner_text('#lgAsk'))
            shot(pg, f'07-asking-within-{vn}', el='#lgAsk')
            o = ask(b['hi'] * size * 1.6); check(vn + ': far above: "Above …" with the gap named', o.startswith('Above recent comparable sale range') and '% above the highest sale' in o, o[:120])
            sv = pg.evaluate("(() => { const s = document.querySelector('#lgAsk .gw-ask-svg'), r = s.getBoundingClientRect(), c = [...s.querySelectorAll('circle,text')].map(e => e.getBoundingClientRect()); return c.every(b => b.left >= r.left - 1 && b.right <= r.right + 1) })()")
            check(vn + ': every marker and label stays inside the chart', sv)
            shot(pg, f'08-asking-above-{vn}', el='#lgAsk')
            o = ask(b['lo'] * size * 0.8); check(vn + ': below: "Below recent comparable sale range"', o.startswith('Below recent comparable sale range'), o[:120])
            check(vn + ': the typed figures stay out of the address', str(size) not in pg.url.split('#/p/')[-1].replace('jadescape', ''))
            check(vn + ': the WhatsApp action is still there', pg.locator('#lgAsk [data-ask-wa]').is_visible())
            check(vn + ': no page errors', not errs, errs); ctx.close()

            print('\n== 6. HDB asking price, with each resale as a dot,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/hdb/bishan/155/bishan-st-13/5-room'); pg.wait_for_selector('[data-hv-out] .gw-vx-res', timeout=20000)
            inp = pg.locator('[data-hv-out] [data-ask-price]').first; inp.fill('1,500,000'); pg.wait_for_selector('[data-hv-out] .gw-ask-v')
            o = pg.inner_text('[data-hv-out] [data-ask-out]'); check(vn + ': HDB answers first too', re.match(r'(Above|Within|Below) recent comparable sale range', o) is not None, o[:120])
            check(vn + ': each resale drawn as a dot (from the sales listed on the page)', pg.locator('[data-hv-out] [data-ask-out] .gw-ask-svg circle').count() > 2 and 'Each dot is one sale' in o)
            shot(pg, f'09-asking-hdb-{vn}', el='[data-hv-out] .gw-apc')
            check(vn + ': no page errors', not errs, errs); ctx.close()
        br.close()
finally:
    srv.terminate()
print(f'\nux-render: {ok} passed, {fail} failed')
raise SystemExit(1 if fail else 0)
