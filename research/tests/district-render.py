"""R3 District search (30 Oct 2026) in a real browser at 360, 390, 1024, 1440 and 1920 px:
Research: "District 19" / "D19" / "d 19" list D19's developments (12, then Show more), each opening its own price preview with the list kept; keyboard
(Enter into the list, arrows, Escape); Back and Forward from a full report return to the district list; "Explore District 19 on Map" opens the Map's
district view. Map: #pl=district:N lists the developments recorded in the district, marks them, draws no boundary, and survives Back/Forward; other
districts, an invalid one, and phone layout. Existing searches by name, road, postal code and HDB block still work.
Run from the site folder:  python3 research/tests/district-render.py   (OneMap stubbed from fixtures; no internet needed)
"""
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
ANS = json.load(open(SITE / 'research/tests/fixtures/onemap-postal.json'))['answers']
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082')
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:300] if info else ''))
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
IX = json.load(open(SITE / 'data/projects/index.json')); DI = IX['fields'].index('district')
NDIST = lambda d: sum(1 for r in IX['rows'] if r[DI] == d)
PL = json.load(open(SITE / 'data/map/places.json')); EV = json.load(open(SITE / 'data/map/ev.json'))['projects']
def search(r):
    m = re.search(r'searchVal=(\d+)', r.request.url); body = ANS.get(m.group(1), {'found': 0, 'results': []}) if m else {'found': 0, 'results': []}
    r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(body))
def fresh(br, w):
    mob = w < 500; ctx = br.new_context(viewport={'width': w, 'height': 900 if not mob else 800}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG)); pg.route(re.compile(r'onemap\.gov\.sg/api/common/elastic/search'), search)
    return ctx, pg, errs
def home(pg):
    pg.goto(B + '/research/'); pg.wait_for_selector('#q', timeout=15000); pg.wait_for_timeout(200)
def district(pg, q):
    pg.fill('#q', ''); pg.fill('#q', q); pg.wait_for_selector('[data-lg-district]', timeout=15000); pg.wait_for_timeout(150)
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
MAPREADY = 'window.KPT_MAP_APP && window.KPT_MAP_APP.evReady'
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        # ---- Research: the district panel at every width ----
        for w in [360, 390, 1024, 1440, 1920]:
            vn = f'{w}px'; ctx, pg, errs = fresh(br, w); home(pg)
            for q in ['District 19', 'D19', 'd 19', 'district19']:
                district(pg, q)
                t = pg.inner_text('[data-lg-district]')
                check(f'{vn}: "{q}" opens District 19', 'District 19 · generally Hougang, Punggol, Serangoon Gardens' in t and f'{NDIST("19")} developments with sales' in t, t)
            check(f'{vn}: never "No transactions found"; no Map-search row', 'No transactions found' not in pg.inner_text('#res') and pg.locator('[data-pc-maprow]').count() == 0)
            check(f'{vn}: the 12 most-sold first, then Show more', pg.locator('[data-lg-dlist] button[data-id]').count() == 12 and pg.locator('[data-lg-dmore]').count() == 1)
            check(f'{vn}: no sideways scroll; rows within the screen', pg.evaluate(NOOVER) and pg.evaluate("[...document.querySelectorAll('[data-lg-dlist] button')].every(b => b.getBoundingClientRect().right <= innerWidth + 1)"))
            pg.click('[data-lg-dmore]'); pg.wait_for_timeout(200)
            check(f'{vn}: Show more adds 12 and moves focus to the first new row', pg.locator('[data-lg-dlist] button[data-id]').count() == 24 and pg.evaluate("document.activeElement === document.querySelectorAll('[data-lg-dlist] button')[12]"))
            # keyboard: Enter goes into the list, arrows move, Escape returns
            district(pg, 'D19'); pg.focus('#q'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
            first = pg.evaluate("document.activeElement.dataset.id"); pg.keyboard.press('ArrowDown'); second = pg.evaluate("document.activeElement.dataset.id")
            pg.keyboard.press('ArrowUp'); pg.keyboard.press('ArrowUp'); back_in = pg.evaluate("document.activeElement.id")
            check(f'{vn}: keyboard: Enter into the list, arrows move, Up from the first row returns to the search', first and second and first != second and back_in == 'q', [first, second, back_in])
            pg.keyboard.press('Enter'); pg.keyboard.press('ArrowDown'); pg.keyboard.press('Escape')
            check(f'{vn}: Escape returns to the search box', pg.evaluate("document.activeElement.id") == 'q')
            # a development opens its own price preview; the district list stays
            pg.keyboard.press('Enter'); pg.keyboard.press('ArrowDown'); pid = pg.evaluate("document.activeElement.dataset.id"); pg.keyboard.press('Enter')
            pg.wait_for_selector('#rwOver [data-ov="dev"]', timeout=20000); pg.wait_for_timeout(300)
            check(f'{vn}: a row (Enter) opens that development\'s price preview, the list kept and the row marked', pg.locator('[data-lg-dlist] button').count() == 12 and pg.get_attribute(f'[data-lg-dlist] button[data-id="{pid}"]', 'aria-current') == 'true' and pg.locator('#rwOver .gwr-row2, #rwOver [data-ov="dev"]').count() >= 1)
            check(f'{vn}: the preview shows the development\'s own prices and View Full Research', '$' in pg.inner_text('#rwOver') and pg.locator(f'#rwOver [href*="#/p/{pid}"]').count() >= 1, pg.inner_text('#rwOver')[:200])
            # Back / Forward through the full report
            pg.click(f'#rwOver [href*="#/p/{pid}"] >> nth=0'); pg.wait_for_selector('[data-lg="project"]', timeout=20000); pg.wait_for_timeout(300)
            pg.go_back(); pg.wait_for_selector('[data-lg-district]', timeout=15000); pg.wait_for_timeout(300)
            check(f'{vn}: Back from the full report returns to the District 19 list', pg.input_value('#q') == 'D19' and pg.locator('[data-lg-dlist] button').count() == 12 and 'District 19' in pg.inner_text('[data-lg-district]'))
            pg.go_forward(); pg.wait_for_selector('[data-lg="project"]', timeout=20000); pg.wait_for_timeout(300)   # the report finishes loading before the next Back
            check(f'{vn}: Forward opens the report again', f'#/p/{pid}' in pg.url)
            pg.go_back(); pg.wait_for_selector('[data-lg-district]', timeout=15000)
            # the Map link
            href = pg.get_attribute('[data-lg-dmap]', 'href')
            check(f'{vn}: "Explore District 19 on Map"', href == 'map/#pl=district:19' and pg.inner_text('[data-lg-dmap]').startswith('Explore District 19 on Map'), href)
            check(f'{vn}: no script errors', not errs, errs[:2]); ctx.close()
        # ---- Research: other districts and the range ----
        ctx, pg, errs = fresh(br, 1440); home(pg)
        for q, n in [('D1', '01'), ('D06', '06'), ('District 28', '28'), ('dist 10', '10')]:
            district(pg, q); t = pg.inner_text('[data-lg-district]')
            check(f'"{q}": District {int(n)} with its {NDIST(n)} developments', f'District {int(n)} ·' in t and f'{NDIST(n)} development' in t, t)
        district(pg, 'D06'); check('D06: all 3 listed, no Show more', pg.locator('[data-lg-dlist] button').count() == NDIST('06') and pg.locator('[data-lg-dmore]').count() == 0)
        district(pg, 'D29'); check('D29: "Singapore’s postal districts run from D01 to D28."', 'D01 to D28' in pg.inner_text('#res'))
        # ---- existing searches unchanged ----
        pg.fill('#q', 'jadescape'); pg.wait_for_selector('#res button[data-id="jadescape"]', timeout=10000); check('a development name still finds it', pg.locator('[data-lg-district]').count() == 0)
        pg.fill('#q', ''); pg.fill('#q', 'aida'); pg.wait_for_selector('#res button[data-street]', timeout=15000); check('a road still finds the road', True)
        pg.fill('#q', ''); pg.fill('#q', '570155'); pg.wait_for_selector('#res [data-hdb]', timeout=15000); check('a six-digit postal code still finds the HDB block', 'Bishan' in pg.inner_text('#res'))
        pg.fill('#q', ''); pg.fill('#q', 'Blk 155 Bishan Street 13'); pg.wait_for_selector('#res [data-hdb]', timeout=15000); check('an HDB block address still finds the block', 'Blk 155 Bishan Street 13' in pg.inner_text('#res'))
        pg.fill('#q', ''); pg.fill('#q', 'Dover'); pg.wait_for_timeout(1500); check('"Dover" is a normal search, not a district', pg.locator('[data-lg-district]').count() == 0)
        check('existing searches: no script errors', not errs, errs[:2]); ctx.close()
        # ---- Map: the district view ----
        want19 = sum(1 for r in PL['rows'] if r[PL['fields'].index('district')] == '19' and r[PL['fields'].index('id')] in EV)   # ev.json is keyed by development id
        for w in [1440, 390]:
            vn = f'map {w}px'; ctx, pg, errs = fresh(br, w)
            pg.goto(B + '/research/map/#pl=district:19'); pg.wait_for_function(MAPREADY, timeout=30000); pg.wait_for_timeout(800)
            card = pg.inner_text('.dp, .bs')
            check(f'{vn}: District 19, labelled as developments recorded there', card.startswith('District 19') and 'Developments recorded in postal District 19' in card and 'Not a district boundary' in card, card[:200])
            check(f'{vn}: the count is the Map\'s own D19 developments with recorded sales ({want19})', f'{want19} with recorded sales' in card, card[:300])
            check(f'{vn}: no boundary drawn (no outline), the district\'s developments marked', pg.locator('.leaflet-overlay-pane path[stroke-dasharray]').count() == 0 and pg.evaluate("document.querySelectorAll('.leaflet-overlay-pane path[fill=\"#0E8C89\"]').length") >= 50)
            check(f'{vn}: the tab title and address', pg.title().startswith('District 19 · Map') and 'pl=district' in pg.url)
            if w < 500:
                pg.click('.bs-act [data-dpmore]'); pg.wait_for_timeout(500); check(f'{vn}: Developments opens the list on a phone', pg.locator('.bs .nb').count() >= 8)
            name = pg.inner_text('.nb >> nth=0').split('\n')[0]; pg.click('.nb >> nth=0'); pg.wait_for_timeout(1200)
            check(f'{vn}: a development opens its own card and prices', 'p=' in pg.url and name in pg.inner_text('.dp, .bs'), pg.url)
            pg.go_back(); pg.wait_for_timeout(1200); check(f'{vn}: Back returns to District 19', 'district' in pg.url and pg.inner_text('.dp h2, .bs h2') == 'District 19', pg.url)
            pg.go_forward(); pg.wait_for_timeout(1200); check(f'{vn}: Forward to the development again', 'p=' in pg.url)
            check(f'{vn}: no sideways scroll; no script errors', pg.evaluate(NOOVER) and not errs, errs[:2]); ctx.close()
        ctx, pg, errs = fresh(br, 1440)
        for d in ['1', '06', '28']:
            pg.goto(B + '/research/map/#pl=district:' + d); pg.wait_for_function(MAPREADY, timeout=30000); pg.wait_for_timeout(600)
            check(f'map: District {int(d)}', pg.inner_text('.dp h2, .bs h2') == f'District {int(d)}', pg.inner_text('.dp, .bs')[:80])
        for bad in ['29', 'abc', '0']:
            pg.goto(B + '/research/map/#pl=district:' + bad); pg.reload(); pg.wait_for_function(MAPREADY, timeout=30000); pg.wait_for_timeout(600)
            check(f'map: district:{bad} falls back to the whole island, no error', 'Explore homes and neighbourhoods' in pg.inner_text('.dp, .bs'), pg.inner_text('.dp, .bs')[:80])
        # the Research link lands on the district view
        home(pg); district(pg, 'D19'); pg.click('[data-lg-dmap]'); pg.wait_for_function(MAPREADY, timeout=30000); pg.wait_for_timeout(600)
        check('Research → "Explore District 19 on Map" → the Map\'s District 19', pg.inner_text('.dp h2') == 'District 19')
        pg.go_back(); pg.wait_for_selector('#q', timeout=15000); check('Back from the Map returns to Research', '/research/' in pg.url and '/map/' not in pg.url)
        check('map: no script errors', not errs, errs[:2]); ctx.close()
        # ---- R3b: the homepage search, the top-bar Search, Research's #/district/N and the Map's own search ----
        for w in [360, 390, 1024, 1440, 1920]:
            vn = f'{w}px'; ctx, pg, errs = fresh(br, w)
            pg.goto(B + '/'); pg.wait_for_selector('[data-gw-search] input:visible', timeout=15000)
            hi = pg.locator('[data-gw-search] input:visible').first; hi.click(); pg.keyboard.type('d19', delay=40)
            pg.wait_for_selector('a[data-gw-nav-to="district"]:visible', timeout=10000)
            box = pg.locator('a[data-gw-nav-to="district"]:visible').first.inner_text()
            check(f'{vn}: homepage search "d19": District 19 in Research and on the Map, never "Nothing matches"', 'District 19' in box and 'Hougang' in box and pg.locator('a[data-gw-nav-to="district-map"]:visible').count() == 1 and 'Nothing matches' not in pg.inner_text('body'), box)
            pg.keyboard.press('Enter'); pg.wait_for_selector('[data-lg-district="19"]', timeout=20000); pg.wait_for_timeout(300)
            check(f'{vn}: Enter opens Research with District 19 listed; the address settles on #/', pg.input_value('#q') == 'District 19' and pg.locator('[data-lg-dlist] button').count() == 12 and pg.url.endswith('/research/#/'), pg.url)
            pg.go_back(); pg.wait_for_timeout(800); check(f'{vn}: Back returns to the homepage', pg.url.rstrip('/') == B, pg.url)
            check(f'{vn}: homepage: no sideways scroll; no script errors', pg.evaluate(NOOVER) and not errs, errs[:2]); ctx.close()
        ctx, pg, errs = fresh(br, 1440)
        pg.goto(B + '/research/#/p/bartley-ridge'); pg.wait_for_selector('[data-lg="project"]', timeout=20000)
        pg.click('[data-gw-open-search]'); pg.wait_for_timeout(300); pg.keyboard.type('District 5', delay=30); pg.wait_for_selector('a[data-gw-nav-to="district"]:visible', timeout=10000)
        pg.locator('a[data-gw-nav-to="district"]:visible').first.click(); pg.wait_for_selector('[data-lg-district="05"]', timeout=20000)
        check('top-bar Search on a report: "District 5" opens Research with District 5 listed', 'District 5 · generally Pasir Panjang, Clementi' in pg.inner_text('[data-lg-district]'))
        pg.goto(B + '/'); pg.wait_for_selector('[data-gw-search] input:visible'); hi = pg.locator('[data-gw-search] input:visible').first; hi.click(); pg.keyboard.type('D19', delay=30)
        pg.wait_for_selector('a[data-gw-nav-to="district-map"]:visible', timeout=10000); pg.locator('a[data-gw-nav-to="district-map"]:visible').first.click(); pg.wait_for_function(MAPREADY, timeout=30000); pg.wait_for_timeout(500)
        check('homepage search: "District 19 on the Map" opens the Map\'s District 19', pg.inner_text('.dp h2') == 'District 19')
        for q in ['Dover', 'jadescape', 'stamp duty', '19']:
            pg.goto(B + '/'); pg.wait_for_selector('[data-gw-search] input:visible'); hi = pg.locator('[data-gw-search] input:visible').first; hi.click(); pg.keyboard.type(q, delay=20); pg.wait_for_timeout(1500)
            check(f'homepage search "{q}": no district result', pg.locator('a[data-gw-nav-to="district"]:visible').count() == 0)
        for h, want in [('#/district/19', '19'), ('#/district/1', '01'), ('#/District/28', '28')]:
            pg.goto(B + '/research/' + h); pg.wait_for_selector(f'[data-lg-district="{want}"]', timeout=20000)
            check(f'Research {h} lists District {int(want)}', pg.locator('[data-lg-district]').count() == 1)
        c2, p2, e2 = fresh(br, 1440); p2.goto(B + '/research/#/district/29'); p2.wait_for_selector('#q', timeout=15000); p2.wait_for_timeout(600)   # a fresh tab
        check('Research #/district/29 is the plain Research home', p2.input_value('#q') == '' and p2.locator('[data-lg-district]').count() == 0, repr(p2.input_value('#q'))); c2.close()
        check('site search: no script errors', not errs, errs[:2]); ctx.close()
        for w in [1440, 390]:
            vn = f'map search {w}px'; ctx, pg, errs = fresh(br, w)
            pg.goto(B + '/research/map/'); pg.wait_for_function(MAPREADY, timeout=30000); pg.wait_for_timeout(400)
            pg.click('.mapsearch input'); pg.keyboard.type('D19', delay=40); pg.wait_for_selector('.sugg button[data-pick^="district|"]', timeout=10000)
            check(f'{vn}: "D19" offers District 19', 'District 19' in pg.inner_text('.mapsearch') and 'postal district' in pg.inner_text('.mapsearch').lower() and not pg.evaluate("(() => { const e = document.querySelector('.sugg button b'); return e.scrollWidth > e.clientWidth; })()"), pg.inner_text('.mapsearch')[:120])
            pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_timeout(1200)
            check(f'{vn}: choosing it opens the District 19 view', 'district' in pg.url and pg.inner_text('.dp h2, .bs h2') == 'District 19', pg.url)
            pg.fill('.mapsearch input', ''); pg.click('.mapsearch input'); pg.keyboard.type('Bishan', delay=30); pg.wait_for_timeout(500)
            check(f'{vn}: other Map searches unchanged ("Bishan": neighbourhood and MRT, no district)', 'Bishan' in pg.inner_text('.mapsearch') and 'postal district' not in pg.inner_text('.mapsearch').lower())
            check(f'{vn}: no script errors', not errs, errs[:2]); ctx.close()
        br.close()
finally:
    srv.terminate()
print('district-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
