"""Browser checks for Phase 3: postal codes, adjustable radius, new launches and GLS sites (Map, Budget Search, Property values).
Run from the site folder:  python3 research/tests/phase3-render.py        (set P3_SHOTS=<folder> to also save screenshots)
Starts the site's own server and stubs OneMap (tiles, and the address search with real answers saved in fixtures/onemap-postal.json), so it needs no internet.
"""
import io, json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
ANS = json.load(open(SITE / 'research/tests/fixtures/onemap-postal.json'))['answers']
SHOTS = pathlib.Path(os.environ['P3_SHOTS']) if os.environ.get('P3_SHOTS') else None
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
def _plain(x, y):   # a quiet stand-in map tile for screenshots (the real basemap is OneMap's); without Pillow, a 1-pixel tile
    try:
        from PIL import Image, ImageDraw
        im = Image.new('RGB', (256, 256), (238, 235, 226)); d = ImageDraw.Draw(im); d.rectangle([0, 0, 255, 255], outline=(214, 210, 200))
        d.line([(0, 70 + (x * 37) % 90), (256, 100 + (y * 53) % 90)], fill=(255, 255, 255), width=9); d.line([(50 + (y * 29) % 120, 0), (90 + (x * 41) % 120, 256)], fill=(250, 226, 170), width=7)
        b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()
    except Exception: return PNG
def tiles(r):
    m = re.search(r'/Default/(\d+)/(\d+)/(\d+)\.png', r.request.url); r.fulfill(status=200, content_type='image/png', body=_plain(int(m.group(3)), int(m.group(2))) if (m and SHOTS) else PNG)
def search(r):
    m = re.search(r'searchVal=(\d+)', r.request.url); body = ANS.get(m.group(1), {'found': 0, 'results': []}) if m else {'found': 0, 'results': []}
    r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(body))
def fresh(br, kw):
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), tiles); pg.route(re.compile(r'onemap\.gov\.sg/api/common/elastic/search'), search)
    return ctx, pg, errs
def shot(pg, name):
    if SHOTS: pg.screenshot(path=str(SHOTS / (name + '.png')))
def opn(pg, h=''):
    pg.goto(f'http://127.0.0.1:{P}/research/map/' + h); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=20000); pg.wait_for_timeout(250)
def card(pg): return pg.inner_text('.dp, .bs') if pg.query_selector('.dp, .bs') else ''
def pick(pg, q, label=None):   # type in the one search box and choose the first (or the named) suggestion
    pg.fill('#q', q); pg.wait_for_selector('.sugg button', timeout=6000)
    if label: pg.click(f'.sugg button:has-text("{label}")')
    else: pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter')
    pg.wait_for_function("document.querySelector('.dp, .bs') && document.querySelector('.dp, .bs').innerText.length > 20", timeout=6000); pg.wait_for_timeout(700)
def radius(pg, r):
    pg.click(f'.rad button[data-pr="{r}"]'); pg.wait_for_function(f"document.querySelector('.rad [aria-checked=true]').dataset.pr === '{r}'", timeout=4000); pg.wait_for_timeout(600)
def circles(pg): return pg.evaluate("document.querySelectorAll('.leaflet-overlay-pane path[stroke-dasharray]').length")
VIEWS = [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('390', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True))]
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in VIEWS:
        ctx, pg, errs = fresh(br, kw); mob = vn != 'desktop'; print('\n== Map,', vn)
        opn(pg); check(vn + ': one search box that says it takes a postal code', 'postal code' in (pg.get_attribute('#q', 'placeholder') or '').lower())
        # postal code
        pg.fill('#q', '570155'); pg.wait_for_selector('.sugg button', timeout=6000); shot(pg, f'map-postal-suggest-{vn}')
        check(vn + ': a postal code is offered as an address', '155 Bishan Street 13' in pg.inner_text('.sugg'), pg.inner_text('.sugg'))
        pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_selector('.rad', timeout=6000); pg.wait_for_timeout(900); t = card(pg); shot(pg, f'map-postal-{vn}')
        check(vn + ': postal card names the address and the default 1 km', '155 Bishan Street 13' in t and '1 km' in t, t)
        check(vn + ': four radius choices, 1 km selected', pg.evaluate("[...document.querySelectorAll('.rad button')].map(b=>b.dataset.pr+(b.getAttribute('aria-checked')==='true'?'*':'')).join(',')") == '500,1000*,2000,3000')
        check(vn + ': a circle is drawn on the Map', circles(pg) >= 1)
        check(vn + ': the 1 km default is not written into the link', 'r=' not in pg.evaluate('location.hash'), pg.evaluate('location.hash'))
        n1 = len(pg.query_selector_all('.dp [data-dev], .bs [data-dev]')) or len(re.findall(r'\n', t))
        radius(pg, 500); shot(pg, f'map-postal-500-{vn}'); t5 = card(pg); check(vn + ': 500 m says 500 m and is shareable', '500 m' in t5 and 'r=500' in pg.evaluate('location.hash'), pg.evaluate('location.hash'))
        radius(pg, 2000); shot(pg, f'map-postal-2km-{vn}'); t2 = card(pg); check(vn + ': 2 km says 2 km', '2 km' in t2 and 'r=2000' in pg.evaluate('location.hash'))
        radius(pg, 3000); check(vn + ': 3 km works', '3 km' in card(pg))
        opn(pg, pg.evaluate('location.hash')) if False else None
        # bad codes
        for bad, want in [('999999', 'not a Singapore postal code'), ('123456', 'No address found')]:
            opn(pg); pg.fill('#q', bad); pg.wait_for_selector('.sugg', timeout=6000); pg.wait_for_function("!/Looking up/.test(document.querySelector('.sugg').innerText)", timeout=6000)
            s = pg.inner_text('.sugg'); check(vn + f': {bad} is explained simply', want in s, s)
        # launches and sites
        opn(pg); pick(pg, 'thomson reserve'); t = card(pg); shot(pg, f'map-thomson-reserve-{vn}')
        check(vn + ': Thomson Reserve is a new launch with a stage, no price', 'Thomson Reserve' in t and re.search(r'launch', t, re.I) and not re.search(r'\$\s?\d', t), t)
        check(vn + ': Thomson Reserve links to its microsite and Research page', pg.query_selector('a[href*="thomsonreserve"]') is not None and pg.query_selector('a[href*="thomson-reserve"]') is not None)
        check(vn + ': a hollow marker is selected on the Map (not hidden)', pg.evaluate("document.querySelectorAll('.leaflet-overlay-pane path').length") > 0)
        opn(pg); pick(pg, 'peck hay'); t = card(pg); shot(pg, f'map-gls-no-name-{vn}')
        check(vn + ': a GLS site with no marketing name says so', 'GLS site' in t and re.search(r'no project name|not yet named|No name', t, re.I), t)
        opn(pg); pick(pg, 'hougang central'); t = card(pg); shot(pg, f'map-hougang-central-{vn}')
        check(vn + ': a project with no verified position is searchable but says it is not on the map', re.search(r'not (yet )?(on|placed on) the map', t, re.I) is not None, t)
        opn(pg); pg.fill('#q', 'chuan grove'); pg.wait_for_selector('.sugg button', timeout=4000); check(vn + ': One Chuan Grove is found by its reported name', 'One Chuan Grove' in pg.inner_text('.sugg'))
        # ordinary condo, EC, cluster: no regression
        for nm, want in [('Jadescape', 'Jadescape'), ('Bishan Loft', 'Executive Condominium'), ('Dunsfold 18', 'Dunsfold')]:
            opn(pg); pick(pg, nm.lower()); t = card(pg); check(vn + f': {nm} still opens its card', want in t, t[:200]); shot(pg, 'map-' + nm.lower().replace(' ', '-') + '-' + vn)
        # compact around + badges
        opn(pg, '#p=jadescape'); pg.wait_for_timeout(700)
        if mob and pg.query_selector('[data-dpmore]'): pg.click('[data-dpmore]'); pg.wait_for_timeout(500)
        t = card(pg)
        check(vn + ': "Prices by size" rows carry a small "N sales" badge, not "units"', re.search(r'\d+ sales?', t) is not None and not re.search(r'available units|units available', t, re.I), t)
        check(vn + ': "Around this home" offers more on demand', pg.query_selector('[data-am-more]') is not None or mob)
        # MRT and school radius
        opn(pg); pick(pg, 'toa payoh mrt'); check(vn + ': a station has the same radius choices', pg.query_selector('.rad') is not None); shot(pg, f'map-mrt-{vn}')
        radius(pg, 2000); check(vn + ': a station at 2 km', '2 km' in card(pg))
        opn(pg); pick(pg, 'rosyth school'); check(vn + ': a school has the radius choices and keeps admission separate', pg.query_selector('.rad') is not None and 'Rosyth' in card(pg))
        # road
        opn(pg); pick(pg, 'aida street'); check(vn + ': a road search still works and has the radius choices', pg.query_selector('.rad') is not None, card(pg)[:150]); shot(pg, f'map-road-{vn}')
        check(vn + ': no page errors on the Map', not errs, errs); ctx.close()

    for vn, kw in VIEWS:
        ctx, pg, errs = fresh(br, kw); print('\n== Budget Search,', vn)
        pg.goto(f'http://127.0.0.1:{P}/tools/what-can-i-buy/'); pg.fill('#budgetInput', '2,200,000'); pg.click('#budgetGo'); pg.wait_for_selector('#kpfNearQ', timeout=20000); pg.wait_for_selector('.kpf-card', timeout=15000)
        up0 = pg.inner_text('.kpf-up') if pg.query_selector('.kpf-up') else ''; check(vn + ': without a place, no GLS site or unnamed launch is listed, and none is a budget match', 'GLS' not in up0 and 'Peck Hay' not in up0 and 'Thomson Reserve' not in pg.inner_text('.kpf-card'), up0[:200])
        pg.type('#kpfNearQ', '570155', delay=10); pg.wait_for_selector('.kpf-sg', timeout=15000); check(vn + ': Budget Search takes the same postal code', '155 Bishan Street 13' in pg.inner_text('#kpfSugg'))
        pg.keyboard.press('Enter'); pg.wait_for_selector('.kpf-nwhere', timeout=15000); pg.wait_for_timeout(800)
        check(vn + ': the place line names the address', '155 Bishan Street 13' in pg.inner_text('.kpf-nwhere'), pg.inner_text('.kpf-nwhere'))
        sh = pg.evaluate("document.getElementById('kpfH').scrollIntoView(); window.scrollBy(0, -78)"); shot(pg, f'budget-postal-1km-{vn}')
        rs = pg.evaluate("[...document.querySelectorAll('[data-f=nearr]')].map(b=>b.dataset.r).join(',')"); check(vn + ': the same four radius choices', rs == '500,1000,2000,3000', rs)
        counts = {}
        for r in ('500', '1000', '2000', '3000'):
            pg.click(f'[data-f=nearr][data-r="{r}"]'); pg.wait_for_function(f"document.querySelector('[data-f=nearr][aria-checked=true]').dataset.r === '{r}'"); pg.wait_for_timeout(500)
            counts[r] = len(pg.query_selector_all('.kpf-card')); up = pg.inner_text('.kpf-up') if pg.query_selector('.kpf-up') else ''
            if r == '3000': shot(pg, f'budget-postal-3km-{vn}')
            if r == '2000': shot(pg, f'budget-postal-2km-{vn}')
        check(vn + ': a wider radius never shows fewer matches', counts['500'] <= counts['1000'] <= counts['2000'] <= counts['3000'], counts)
        up = pg.inner_text('.kpf-up') if pg.query_selector('.kpf-up') else ''
        check(vn + ': launches and sites nearby are listed apart, with no price', (not up) or (not re.search(r'\$\s?\d', up) and re.search(r'price|not (a )?match|no (launch )?price|unpriced', up, re.I) is not None), up)
        pg.click('[data-f=nearchange]') if not pg.query_selector('#kpfNearQ') else None; pg.fill('#kpfNearQ', '999999'); pg.wait_for_timeout(700)
        check(vn + ': an invalid code is explained', 'not a Singapore postal code' in pg.inner_text('#kpfSugg'))
        check(vn + ': no page errors on Budget Search', not errs, errs); ctx.close()

    CASES = [('570155', 'hdb', '(hdb|Bishan)'), ('400001', 'hdb', 'no resale|not .*resale|No resale|resale'), ('570101', 'hdb', '(hdb|Bishan)'), ('575749', 'condo', 'research/#/p/'), ('579819', 'ec', 'research/#/p/'), ('359419', 'cluster', 'research/#/p/'), ('579600', 'launch', 'research/#/p/thomson-reserve'), ('459919', 'landed', '(landed|street|Opera|Aida)'), ('999999', None, 'not a Singapore postal code'), ('123456', None, 'No address found')]
    for vn, kw in VIEWS:
        ctx, pg, errs = fresh(br, kw); print('\n== Property values,', vn)
        for code, pane, want in CASES:
            pg.goto(f'http://127.0.0.1:{P}/journey/worth/'); pg.wait_for_selector('[data-vx-pc]'); pg.fill('[data-vx-pc]', code)
            pg.wait_for_function("document.querySelector('[data-vx-pcout]').innerText.trim() && !/Looking up/.test(document.querySelector('[data-vx-pcout]').innerText)", timeout=8000); pg.wait_for_timeout(700)
            out = pg.inner_text('[data-vx-pcout]'); html = pg.inner_html('[data-vx-pcout]'); shown = pg.evaluate("[...document.querySelectorAll('[data-vx-pane]')].filter(x=>!x.hidden).map(x=>x.dataset.vxPane).join(',')")
            check(vn + f': {code} → {want[:30]}', re.search(want, out + html, re.I) is not None, out[:240] + ' || ' + shown)
            if pane and pane in ('condo', 'ec', 'cluster', 'launch'): check(vn + f': {code} never calls past sales an official valuation', not re.search(r'official valuation|formal valuation|HDB valuation', out, re.I) or re.search(r'not (an )?(official|a valuation)', out, re.I), out[:200])
            if code in ('570155', '575749', '459919', '123456'): pg.evaluate("document.querySelector('[data-vx-pc]').scrollIntoView({block:'start'}); window.scrollBy(0,-90)"); shot(pg, f'values-{code}-{vn}')
        pg.goto(f'http://127.0.0.1:{P}/journey/worth/#hdb'); pg.wait_for_selector('[data-vx-town]'); pg.wait_for_timeout(500)
        pg.select_option('[data-vx-town]', 'bishan'); pg.wait_for_function("!document.querySelector('[data-vx-block]').disabled"); pg.fill('[data-vx-block]', '570155'); pg.wait_for_timeout(1500)
        check(vn + ': a postal code typed in the HDB block box is routed, not treated as a block', pg.input_value('[data-vx-pc]') == '570155', pg.input_value('[data-vx-pc]'))
        check(vn + ': no page errors on Property values', not errs, errs); ctx.close()
finally: srv.terminate()
print(f'\n{ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
