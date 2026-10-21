"""Browser checks for the Phase 3 follow-up: one radius on every located selection, postal codes in the site search, complete launch and GLS coverage, developments with a position.
Run from the site folder:  python3 research/tests/followup-render.py        (set P3_SHOTS=<folder> to also save screenshots)
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
    pg.evaluate("(()=>{const d=document.querySelector('details.sx[data-sx=nbr]'); if(d&&!d.open) d.querySelector('summary').click()})()"); pg.wait_for_selector('.rad button:visible', timeout=4000)   # the nearby-developments section is folded until asked for
    pg.click(f'.rad button[data-pr="{r}"]'); pg.wait_for_function(f"document.querySelector('.rad [aria-checked=true]').dataset.pr === '{r}'", timeout=4000); pg.wait_for_timeout(600)
def circles(pg): return pg.evaluate("document.querySelectorAll('.leaflet-overlay-pane path[stroke-dasharray]').length")
VIEWS = [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('390', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True))]
def more(pg, mob):   # on a phone the sheet is a short summary; "Prices & nearby" opens the rest
    if mob and pg.query_selector('[data-dpmore][aria-expanded=false]'): pg.click('.bs-act [data-dpmore]'); pg.wait_for_timeout(450)
def hdr(pg): return (pg.inner_text('.dp h2, .bs h2') if pg.query_selector('.dp h2, .bs h2') else '')
def radios(pg): return pg.evaluate("[...document.querySelectorAll('.rad button')].map(b=>b.dataset.pr+(b.getAttribute('aria-checked')==='true'?'*':'')).join(',')")
def circ(pg): return pg.evaluate("(()=>{const a=document.querySelector('.leaflet-overlay-pane path[stroke-dasharray]');if(!a)return null;const r=a.getBoundingClientRect();return [Math.round(r.x+r.width/2),Math.round(r.width)]})()")
def sel_x(pg): return pg.evaluate("(()=>{const a=document.querySelector('.selchip');if(!a)return null;const r=a.getBoundingClientRect();return Math.round(r.x+r.width/2)})()")
def prices(pg): return pg.evaluate("[...document.querySelectorAll('.sec.pr')].map(x=>x.innerText).join('|')")
def nearby_count(pg): return pg.evaluate("(()=>{const s=document.querySelector('details.sx[data-sx=nbr] .basis')||document.querySelector('.sec.nbr .sh > span:last-child')||document.querySelector('.dp .sh > span:last-child, .bs .sh > span:last-child');return s?s.innerText:''})()")
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in VIEWS:
        ctx, pg, errs = fresh(br, kw); mob = vn != 'desktop'; print('\n== Map radius,', vn)
        # 1-8: the same optional radius on every located selection
        for q, nm, kind in [('570155', '155 Bishan Street 13', 'postal'), ('bartley ridge', 'Bartley Ridge', 'condo'), ('thomson three', 'Thomson Three', 'condo'), ('bishan mrt', 'Bishan MRT', 'mrt'), ("chij st nicholas", "Nicholas", 'school'), ('hundred palms', 'Hundred Palms', 'ec'), ('horizon green', 'Horizon Green', 'cluster'), ('thomson reserve', 'Thomson Reserve', 'launch'), ('serra residences', 'Serra', 'launch'), ('chencharu central', 'Chencharu', 'site'), ('hougang central', 'Hougang Central', 'site')]:
            opn(pg); pick(pg, q); more(pg, mob); t = card(pg); shot(pg, f'followup-{q.replace(" ", "-")}-{vn}')
            check(f'{vn}: {q}: the panel is the right place', nm.lower() in t.lower(), t[:120])
            check(f'{vn}: {q}: the four radius choices, 1 km selected', radios(pg) == '500,1000*,2000,3000', radios(pg))
            c = circ(pg); check(f'{vn}: {q}: a circle is drawn, centred on the selection', c is not None and (sel_x(pg) is None or abs(c[0] - sel_x(pg)) < 8), (c, sel_x(pg)))
            if kind in ('condo', 'ec', 'cluster'):
                check(f'{vn}: {q}: the price details are still there', 'Prices by size' in t and re.search(r'\$\s?[\d,]+', t) is not None, t[:200])
                p0 = prices(pg); radius(pg, 2000)
                check(f'{vn}: {q}: 2 km keeps the circle, says so, and is in the link as nr', circ(pg) is not None and '2 km' in nearby_count(pg) and 'nr=2000' in pg.evaluate('location.hash'), (nearby_count(pg), pg.evaluate('location.hash')))
                check(f'{vn}: {q}: the price comparison is not changed by the map radius', prices(pg) == p0)
                radius(pg, 500); check(f'{vn}: {q}: 500 m works', '500 m' in nearby_count(pg), nearby_count(pg))
            elif kind in ('launch', 'site'):
                check(f'{vn}: {q}: no price is shown', re.search(r'\$\s?\d', t) is None, t[:200])
                radius(pg, 3000); check(f'{vn}: {q}: 3 km works', '3 km' in card(pg) and 'nr=3000' in pg.evaluate('location.hash'), pg.evaluate('location.hash'))
            else:
                radius(pg, 2000); check(f'{vn}: {q}: 2 km works', '2 km' in card(pg))
        check(f'{vn}: no page errors', not errs, errs); ctx.close()

    for vn, kw in VIEWS:
        ctx, pg, errs = fresh(br, kw); mob = vn != 'desktop'; print('\n== Switching in one session,', vn)
        opn(pg); seen = []
        for q, nm in [('570155', 'Bishan Street 13'), ('toa payoh mrt', 'Toa Payoh'), ('rosyth school', 'Rosyth'), ('bartley ridge', 'Bartley Ridge'), ('thomson reserve', 'Thomson Reserve'), ('serra residences', 'Serra'), ('chencharu central', 'Chencharu'), ('bishan mrt', 'Bishan MRT'), ('jadescape', 'Jadescape')]:
            if seen: check(f'{vn}: before {q}: the old circle and panel are there to be replaced', circ(pg) is not None)
            pick(pg, q); more(pg, mob)
            check(f'{vn}: {q}: the panel names the new selection only', nm.lower() in card(pg).lower() and not any(s.lower() in hdr(pg).lower() for s in seen if s.lower() != nm.lower()), (hdr(pg), seen))
            n = pg.evaluate("document.querySelectorAll('.leaflet-overlay-pane path[stroke-dasharray]').length"); check(f'{vn}: {q}: one circle, not a pile of them', 1 <= n <= 2, n)
            check(f'{vn}: {q}: radius starts again at 1 km', radios(pg) == '500,1000*,2000,3000', radios(pg))
            radius(pg, 2000); seen.append(nm)
            if mob and pg.query_selector('.bs.open .grab'): pg.click('.bs.open .grab'); pg.wait_for_timeout(400)   # a phone's expanded sheet covers the search box; fold it as a visitor would
        pg.click('[data-dpclose]'); pg.wait_for_timeout(500); check(f'{vn}: closing the panel removes the circle', circ(pg) is None)
        # a link keeps the nearby radius
        opn(pg, '#p=bartley-ridge&nr=3000'); more(pg, mob); check(f'{vn}: a link with nr=3000 opens at 3 km', radios(pg) == '500,1000,2000,3000*', radios(pg))
        opn(pg, '#p=bartley-ridge&r=2000'); more(pg, mob); check(f'{vn}: the old link (price radius only) opens at the 1 km default', radios(pg) == '500,1000*,2000,3000', radios(pg))
        check(f'{vn}: no page errors', not errs, errs); ctx.close()

    for vn, kw in VIEWS:
        ctx, pg, errs = fresh(br, kw); mob = vn != 'desktop'; print('\n== Coverage,', vn)
        # The Reserve Residences: in both spellings, the Map goes to Jalan Anak Bukit, highlights it, opens the panel
        for q in ('Reserve Residences', 'The Reserve Residences'):
            opn(pg); pick(pg, q); t = card(pg); shot(pg, f'followup-reserve-residences-{vn}')
            check(f'{vn}: {q}: opens The Reserve Residences with its address', 'The Reserve Residences' in t and 'Jalan Anak Bukit' in t and 'not on the map' not in t.lower(), t[:160])
            cx = sel_x(pg); w = pg.evaluate("document.querySelector('#map').getBoundingClientRect().width")
            check(f'{vn}: {q}: the Map is centred on it', cx is not None and 120 < cx < w - 40, (cx, w))
            check(f'{vn}: {q}: the link is the project', 'p=the-reserve-residences' in pg.evaluate('location.hash'), pg.evaluate('location.hash'))
        # Chencharu: HDB, searchable under its names, near Khatib MRT
        for q in ('chencharu central', 'chencharu close'):
            opn(pg); pick(pg, q); t = card(pg); check(f'{vn}: {q} finds Chencharu Close', 'Chencharu Close' in t and 'HDB' in t, t[:200])
        check(f'{vn}: Chencharu Close says what is confirmed and gives no price', 'Chencharu' in t and re.search(r'\$\s?\d', t) is None and ('875' in t or 'homes' in t.lower()), t[:400])
        opn(pg); pick(pg, 'khatib mrt'); more(pg, mob)
        if mob and pg.query_selector('[data-dpmore][aria-expanded=false]'): pg.click('[data-dpmore]')
        t = card(pg); check(f'{vn}: Chencharu Close is listed near Khatib MRT', 'Chencharu Close' in t, t[:300]); shot(pg, f'followup-khatib-{vn}')
        # Hougang Central: now placed
        opn(pg); pick(pg, 'hougang central'); t = card(pg); check(f'{vn}: Hougang Central is on the map (verified parcel)', 'not on the map' not in t.lower() and circ(pg) is not None, t[:200])
        # Serra: three spellings, one project, no microsite needed
        ids = set()
        for q in ('serra residences', 'the serra residences', 'serra novena'):
            opn(pg); pick(pg, q); ids.add(re.search(r'p=([a-z0-9-]+)', pg.evaluate('location.hash')).group(1)); t = card(pg)
        check(f'{vn}: Serra Residences and its official name are one project', ids == {'the-serra-residences'}, ids)
        check(f'{vn}: Serra has a proper panel: developer, homes, sources, no price, no marketing link', 'Far East Organization' in t and '133' in t and re.search(r'\$\s?\d', t) is None and pg.query_selector('.dp a[href*="kentanthepropertyguy"], .bs a[href*="kentanthepropertyguy"]') is None and 'Open project microsite' not in t, t[:300])
        # One Chuan Grove keeps the reported-name distinction; an unnamed site says so
        opn(pg); pick(pg, 'one chuan grove'); t = card(pg); check(f'{vn}: One Chuan Grove says its name is reported', 'reported' in t.lower(), t[:300])
        opn(pg); pick(pg, 'peck hay'); t = card(pg); check(f'{vn}: a GLS site with no marketing name says so', re.search(r'no project name', t, re.I) is not None, t[:200])
        check(f'{vn}: no page errors', not errs, errs); ctx.close()

    for vn, kw in VIEWS:
        ctx, pg, errs = fresh(br, kw); mob = vn != 'desktop'; print('\n== Site search,', vn)
        pg.goto(f'http://127.0.0.1:{P}/'); sel = '[data-gw-search="home"]'
        pg.wait_for_selector(sel + ' input'); check(f'{vn}: the search box says it takes a postal code', 'postal code' in (pg.get_attribute(sel + ' input', 'placeholder') or '').lower())
        def ask(q):
            prev = pg.inner_text(sel + ' .gw-sx-res') if pg.query_selector(sel + ' .gw-sx-res') else ''   # the old answer stays up until the new one replaces it
            pg.fill(sel + ' input', q)
            pg.wait_for_function("(prev)=>{const r=document.querySelector('[data-gw-search=home] .gw-sx-res');return r&&!r.hidden&&r.innerText.length>5&&r.innerText!==prev&&!/Looking up|Searching/.test(r.innerText)}", arg=prev, timeout=8000)
            return pg.inner_text(sel + ' .gw-sx-res'), pg.eval_on_selector_all(sel + ' .gw-sx-res a[role=option]', 'a=>a.map(x=>x.getAttribute("href"))')
        t, h = ask('368060'); shot(pg, f'followup-search-368060-{vn}')
        check(f'{vn}: 368060 gives a resolved address, not "Nothing matches"', 'Mount Vernon' in t and 'Nothing matches' not in t, t)
        check(f'{vn}: a condo goes to its Research page, with View on Map second', 'research/#/p/bartley-ridge' in h[0] and 'research/map/#pl=postal' in h[1] and 'View on Map' in t, h)
        t, h = ask('570155'); check(f'{vn}: an HDB block goes to HDB property values', 'journey/worth/#pc=570155' in h[0] and 'HDB' in t, (t, h))
        t, h = ask('575749'); check(f'{vn}: Jadescape goes to its Research page', 'research/#/p/jadescape' in h[0], h)
        t, h = ask('545688'); check(f'{vn}: an EC goes to its Research page', 'research/#/p/hundred-palms-residences' in h[0] and 'Executive' in t, (t, h))
        t, h = ask('999999'); check(f'{vn}: an invalid code is explained', 'not a Singapore postal code' in t and not h, t)
        t, h = ask('123456'); check(f'{vn}: an unknown code is explained', 'No address found' in t, t)
        t, h = ask('stamp duty'); check(f'{vn}: ordinary words still find the calculators', 'tools/stamp-duty' in ' '.join(h), h)
        t, h = ask('thomson three'); check(f'{vn}: a development name still finds Research', 'research/#/p/thomson-three' in h[0], h)
        t, h = ask('serra residences'); check(f'{vn}: a new launch is found and opens on the Map', 'research/map/#p=the-serra-residences' in h[0], h)
        t, h = ask('chencharu central'); check(f'{vn}: a GLS site is found under its alias', 'research/map/#p=chencharu-close' in h[0], h)
        t, h = ask('zzzzqq'); check(f'{vn}: nothing matches says so without the outdated EC and cluster sentence', 'Nothing matches' in t and 'aren’t covered' not in t and 'Executive condos' not in t, t)
        # the destinations work
        pg.goto(f'http://127.0.0.1:{P}/journey/worth/#pc=570155'); pg.wait_for_selector('[data-vx-pc]')
        pg.wait_for_function("document.querySelector('[data-vx-pcout]').innerText.trim() && !/Looking up/.test(document.querySelector('[data-vx-pcout]').innerText)", timeout=8000); pg.wait_for_timeout(500)
        check(f'{vn}: #pc= on Property values fills the postal box and runs it', pg.input_value('[data-vx-pc]') == '570155' and 'Bishan' in pg.inner_text('[data-vx-pcout]'), pg.inner_text('[data-vx-pcout]'))
        # the search from the Map page itself
        opn(pg); pick(pg, '368060'); check(f'{vn}: the Map takes the same code', 'Bartley' in card(pg) or 'Mount Vernon' in card(pg))
        check(f'{vn}: no page errors', not errs, errs); ctx.close()
    print(f'\n{ok} passed, {fail} failed')
finally:
    srv.terminate()
sys.exit(1 if fail else 0)
