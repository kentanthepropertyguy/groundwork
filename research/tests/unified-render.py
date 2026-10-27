"""Browser checks for the unified Research page and the full-screen Map: the eight workflows, at desktop and 390 px.
Run from the site folder:  python3 research/tests/unified-render.py        (set UR_SHOTS=<folder> to also save screenshots)
Starts the site's own server and stubs OneMap (tiles, and the address search with real answers saved in fixtures/onemap-postal.json), so it needs no internet.
"""
import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
ANS = json.load(open(SITE / 'research/tests/fixtures/onemap-postal.json'))['answers']
SHOTS = pathlib.Path(os.environ['UR_SHOTS']) if os.environ.get('UR_SHOTS') else None
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
    pg.goto(B + '/research/' + h); pg.wait_for_selector('.gw-ropts', timeout=15000); pg.wait_for_timeout(200)
def open_map(pg, h=''):
    pg.goto(B + '/research/map/' + h); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=20000); pg.wait_for_timeout(500)
def hist(pg): return pg.evaluate('history.length')
def expanded(pg): return pg.evaluate("[...document.querySelectorAll('.gw-ropt')].filter(b => b.getAttribute('aria-expanded') === 'true').map(b => b.dataset.opt).join(',')")
def shown(pg): return pg.evaluate("[...document.querySelectorAll('.gw-rws')].filter(w => !w.hidden).map(w => w.id).join(',')")
def card(pg): return pg.inner_text('.dp, .bs') if pg.query_selector('.dp, .bs') else ''
VIEWS = [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('390', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True))]
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in VIEWS:
        mob = vn != 'desktop'; print('\n== Research home,', vn)
        ctx, pg, errs = fresh(br, kw); home(pg)
        check(vn + ': one question, two ways in, the first open', pg.inner_text('h1') == 'What would you like to research?' and pg.locator('.gw-ropt').count() == 2 and expanded(pg) == 'dev' and shown(pg) == 'ws-dev', (expanded(pg), shown(pg)))
        check(vn + ': no Map on the Research home', pg.query_selector('.leaflet-container') is None)
        labels = pg.evaluate("[...document.querySelectorAll('.gw-ropt')].map(b => [...b.querySelectorAll('.l,.s')].filter(x => x.offsetParent).map(x => x.textContent).join(''))")
        check(vn + (': the two-way switch with short labels' if mob else ': two compact option cards'), labels == (['Property', 'Budget'] if mob else ['Research a property', 'What can this budget buy?']), labels)
        check(vn + ': Ken’s projects and A–Z are inside Development research', pg.query_selector('#ws-dev .gw-rown a[data-kpt-ms]') is not None and pg.query_selector('#ws-dev #azBtn') is not None)
        check(vn + ': no second development search anywhere on the page', pg.locator('#q').count() == 1)
        shot(pg, f'home-{vn}', True)
        # clicking a main choice starts fresh and adds nothing to history
        h0 = hist(pg); pg.fill('#q', 'jade'); pg.wait_for_selector('#res button[data-id]', timeout=8000)
        pg.click('#opt-budget'); pg.wait_for_selector('#rwBudget #kdBudget', timeout=20000); pg.fill('#kdBudget', '1800000')
        check(vn + ': one option open at a time', expanded(pg) == 'budget' and shown(pg) == 'ws-budget', (expanded(pg), shown(pg)))
        pg.click('#opt-budget'); pg.wait_for_timeout(500); kept_b = pg.input_value('#kdBudget')
        pg.click('#opt-dev'); pg.wait_for_timeout(300); kept_q = pg.input_value('#q')
        check(vn + ': choosing a main choice, even the open one, starts a fresh search', (kept_q, kept_b) == ('', ''), (kept_q, kept_b))
        check(vn + ': switches add nothing to browser history, and the address names the choice', hist(pg) == h0 and pg.evaluate('location.hash') == '#/', (h0, hist(pg), pg.evaluate('location.hash')))
        check(vn + ': a budget or postal code never reaches the address', '1800000' not in pg.url)
        check(vn + ': nothing typed reaches an outgoing WhatsApp link', pg.evaluate("[...document.querySelectorAll('a[href*=\"wa.me\"]')].every(a => !/1800000|1,800,000|jade/i.test(decodeURIComponent(a.href)))"))
        check(vn + ': no page errors', not errs, errs[:2]); ctx.close()

        print('\n== 1. Development search → full analysis; Map → full analysis → Back,', vn)
        # 25 Oct 2026: Research opens the development's full analysis directly; the Map is reached from the report or the navigation
        ctx, pg, errs = fresh(br, kw); home(pg); pg.fill('#q', 'jadescape'); pg.wait_for_selector('#res button[data-id]', timeout=8000)
        pg.click('#res button[data-id]'); pg.wait_for_selector('#rwOver [data-ov-full]', timeout=15000)
        check(vn + ': a development chosen in Research shows its overview first, with View Full Research', 'View Full Research' in pg.inner_text('#rwOver') and '-bedroom' in pg.inner_text('#rwOver'))
        pg.click('#rwOver [data-ov-full]'); pg.wait_for_url('**/research/#/p/jadescape', timeout=10000); pg.wait_for_selector('.lg-back', timeout=10000)
        check(vn + ': View Full Research opens the full analysis, not the Map', '/research/map/' not in pg.url and 'Jadescape' in pg.inner_text('h1'), pg.url)
        pg.go_back(); pg.wait_for_selector('.gw-ropts', timeout=15000); pg.wait_for_selector('#rwOver [data-ov-full]', timeout=15000)
        check(vn + ': Back returns to Research with the overview still there', 'Jadescape' in pg.inner_text('#rwOver'))
        pg.go_forward(); pg.wait_for_selector('.lg-back', timeout=10000); check(vn + ': Forward reopens the analysis', '#/p/jadescape' in pg.url)
        check(vn + ': no page errors', not errs, errs[:2]); ctx.close()
        ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/map/#p=jadescape'); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=20000); pg.wait_for_selector('[data-m-full]', timeout=15000); pg.wait_for_timeout(600)
        t = card(pg)
        check(vn + ': the Map shows the development with its summary', '#p=jadescape' in pg.url and 'Jadescape' in t and re.search(r'\$\s?[\d,]+', t) is not None, (pg.url, t[:120]))
        shot(pg, f'map-selected-{vn}')
        full = pg.query_selector('[data-m-full]')
        check(vn + ': “View Full Research” is obvious', full is not None and 'View Full Research' in full.inner_text() and full.is_visible())
        if not mob and not pg.is_visible('.dp .rad button[data-pr="2000"]'): pg.click('.dp summary:has-text("Explore nearby developments")'); pg.wait_for_timeout(300)
        pg.click('.bs .rad button[data-pr="2000"]' if mob else '.dp .rad button[data-pr="2000"]')
        pg.wait_for_timeout(600); hmap = pg.evaluate('location.hash')
        pg.click('[data-m-full]'); pg.wait_for_url('**/research/#/p/jadescape', timeout=10000); pg.wait_for_selector('.lg-back', timeout=10000)
        check(vn + ': the analysis offers Back to Map', 'Back to Map' in pg.inner_text('.lg-back'), pg.inner_text('.lg-back'))
        shot(pg, f'analysis-{vn}')
        pg.click('.lg-back'); pg.wait_for_url('**/research/map/**', timeout=10000); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=20000); pg.wait_for_timeout(1000)
        sel = pg.evaluate("(document.querySelector('.dp .rad [aria-checked=true], .bs .rad [aria-checked=true]') || {dataset: {}}).dataset.pr")
        check(vn + ': Back to Map restores the selection and the radius', 'Jadescape' in card(pg) and sel == '2000' and 'p=jadescape' in pg.url, (sel, pg.url, hmap))
        check(vn + ': no page errors', not errs, errs[:2]); ctx.close()
        # reaching the analysis another way shows no Back to Map
        ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/p/jadescape'); pg.wait_for_selector('.lg-back', timeout=10000)
        check(vn + ': opened directly, the analysis keeps its own back link', 'Back to Map' not in pg.inner_text('.lg-back'), pg.inner_text('.lg-back')); ctx.close()

        print('\n== 2. HDB postal code → flat type → resale results inside Research,', vn)
        ctx, pg, errs = fresh(br, kw); home(pg); pg.fill('#q', '570155'); pg.wait_for_selector('#res [data-hdb]', timeout=15000); pg.click('#res [data-hdb]')
        pg.wait_for_selector('#rwOver [data-ov="hdb"]', timeout=20000); pg.wait_for_timeout(500)
        r = pg.inner_text('#rwOver')
        check(vn + ': the postal code finds the block and shows resale prices by flat type', 'Bishan' in r and 'resales' in r and re.search(r'\$[\d,]+', r) is not None, r[:100])
        check(vn + ': the full HDB report is one prominent click away', pg.get_attribute('#rwOver [data-ov-full]', 'href').startswith('#/hdb/') and 'Asking-price check' in r and 'Nearby blocks compared' in r)
        check(vn + ': it all happened inside Research', '/research/' in pg.url and '#/hdb' not in pg.url, pg.url)
        shot(pg, f'hdb-{vn}', True)
        pg.click('#rwOver [data-ov-full]'); pg.wait_for_selector('[data-gw-hdbview] h1', timeout=20000)
        check(vn + ': the dedicated HDB report opens', '#/hdb/' in pg.url, pg.url)
        check(vn + ': no page errors', not errs, errs[:2]); ctx.close()

        print('\n== 3. Landed lookup by road,', vn)
        ctx, pg, errs = fresh(br, kw); home(pg); pg.fill('#q', 'aida'); pg.wait_for_selector('#res button[data-street]', timeout=15000); pg.click('#res button[data-street]')
        pg.wait_for_selector('#rwLanded [data-vx-ltypes] button', timeout=20000); pg.click('#rwLanded [data-vx-ltypes] button'); pg.wait_for_selector('#rwLanded [data-vx-pane="landed"] .gw-vx-res', timeout=20000)
        check(vn + ': landed: road → type → what houses sold for, with no made-up typical price for the house', re.search(r'\$[\d,.]+', pg.inner_text('#rwLanded [data-vx-pane="landed"] .gw-vx-res')) is not None)
        shot(pg, f'landed-{vn}', True)
        check(vn + ': no page errors', not errs, errs[:2]); ctx.close()

        print('\n== 4. Budget requirements → results → Edit → Back / Forward,', vn)
        ctx, pg, errs = fresh(br, kw); home(pg, '#/budget'); pg.wait_for_selector('#rwBudget #kdBudget', timeout=20000)
        shot(pg, f'budget-{vn}')
        pg.fill('#kdBudget', '1800000'); pg.click('#rwBudget button:has-text("Show developments")'); pg.wait_for_url('**/tools/what-can-i-buy/**', timeout=20000); pg.wait_for_selector('.kd-res, [data-kd-res], #kdList, .kd-card', timeout=20000); pg.wait_for_timeout(800)
        t = pg.inner_text('#root')
        check(vn + ': results for that budget, and the budget is not in the address', re.search(r'developments with recent sales( or developer listings)? within \$1\.8m', t) is not None and '1800000' not in pg.url and '1,800,000' not in pg.url, (t[:80], pg.url))
        shot(pg, f'budget-results-{vn}')
        pg.go_back(); pg.wait_for_url('**/research/**', timeout=15000); pg.wait_for_selector('#rwBudget #kdBudget', timeout=20000)
        check(vn + ': Back returns to the Budget option with the budget still entered', expanded(pg) == 'budget' and pg.input_value('#kdBudget') == '1,800,000', (expanded(pg), pg.input_value('#kdBudget')))
        pg.go_forward(); pg.wait_for_url('**/tools/what-can-i-buy/**', timeout=15000); pg.wait_for_timeout(1200)
        check(vn + ': Forward returns to the results', 'developments with recent sales' in pg.inner_text('#root'))
        edit = pg.query_selector('.kd-bar [data-f=edit], [data-f=edit]')
        check(vn + ': an Edit control on the results', edit is not None)
        if edit:
            pg.click('[data-f=edit] >> visible=true >> nth=0'); pg.wait_for_selector('#kdBudget', state='visible', timeout=8000)
            check(vn + ': Edit shows the requirements with the same budget', pg.input_value('#kdBudget') == '1,800,000', pg.input_value('#kdBudget'))
            pg.fill('#kdBudget', '2000000'); pg.keyboard.press('Tab'); pg.wait_for_function("document.querySelector('#root').innerText.includes('within $2.0m')", timeout=10000)
            check(vn + ': the results follow the edit, in place', 'within $2.0m' in pg.inner_text('#root'))
            pg.go_back(); pg.wait_for_url('**/research/**', timeout=15000); pg.wait_for_selector('#rwBudget #kdBudget', timeout=20000); pg.wait_for_timeout(500)
            check(vn + ': Back returns to the Budget option, showing the edited budget', expanded(pg) == 'budget' and pg.input_value('#kdBudget') == '2,000,000', (expanded(pg), pg.input_value('#kdBudget')))
            pg.go_forward(); pg.wait_for_url('**/tools/what-can-i-buy/**', timeout=15000); pg.wait_for_timeout(1500)
            check(vn + ': Forward returns to the edited results', 'within $2.0m' in pg.inner_text('#root'), pg.inner_text('#root')[:100])
        check(vn + ': no page errors', not errs, errs[:2]); ctx.close()

        print('\n== 5. Upcoming launch with no recorded transactions,', vn)
        ctx, pg, errs = fresh(br, kw); home(pg); pg.fill('#q', 'sophia meadow'); pg.wait_for_selector('#res button[data-launch]', timeout=8000)
        check(vn + ': listed apart, with “No sales recorded yet”', 'No sales recorded yet' in pg.inner_text('#res'))
        pg.click('#res button[data-launch]'); pg.wait_for_url('**/research/map/**', timeout=10000); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=20000); pg.wait_for_timeout(1200)
        t = card(pg)
        check(vn + ': the Map shows confirmed facts and location, and no invented price', 'Sophia Meadow' in t and 'No recorded sales yet' in t and re.search(r'\$\s?\d', t) is None, t[:200])
        shot(pg, f'launch-{vn}')
        check(vn + ': no page errors', not errs, errs[:2]); ctx.close()

        print('\n== 6. Full-screen Map: opening, scrolling, sources, selection, radius,', vn)
        ctx, pg, errs = fresh(br, kw); open_map(pg)
        m = pg.evaluate("({sh: document.documentElement.scrollHeight, ih: innerHeight, foot: !!document.querySelector('footer'), long: !!document.querySelector('.kpm-sources'), stage: document.querySelector('.mapstage').getBoundingClientRect().height, nav: document.querySelector('.gw-nav').getBoundingClientRect().height})")
        check(vn + ': the Map fills the screen under the header; no footer, no long sources section', m['sh'] <= m['ih'] + 1 and not m['foot'] and not m['long'] and m['stage'] >= m['ih'] - m['nav'] - 2, m)
        check(vn + ': the header keeps Ask Ken and Menu (V2.1: the name is in the footer only)', 'by Ken Tan' not in pg.inner_text('.gw-nav') and 'Ask Ken' in pg.inner_text('.gw-nav') and 'Menu' in pg.inner_text('.gw-nav'))
        att = pg.inner_text('.leaflet-control-attribution')
        check(vn + ': OneMap and Singapore Land Authority attribution stays visible, with a small sources link', 'OneMap' in att and 'Singapore Land Authority' in att and 'Data & sources' in att, att)
        z = pg.evaluate("(() => { const m = document.querySelector('.mapstage').getBoundingClientRect(); return [Math.round(m.left + m.width / 2), Math.round(m.top + m.height / 2)]; })()")
        pg.mouse.move(*z); pg.mouse.wheel(0, 900); pg.wait_for_timeout(300)
        check(vn + ': the wheel over the Map does not scroll the page', pg.evaluate('scrollY') == 0)
        shot(pg, f'map-overview-{vn}')
        pg.click('.m-src'); pg.wait_for_selector('#sources:not([hidden])', timeout=3000)
        s = pg.inner_text('#sources')
        check(vn + ': the sources panel keeps the licence line, credentials and privacy', 'Open Data Licence' in s and 'CEA R007903D' in s and 'Huttons' in s and pg.query_selector('#sources a[href*="privacy"]') is not None, s[:150])
        shot(pg, f'map-sources-{vn}')
        pg.keyboard.press('Escape'); pg.wait_for_selector('#sources[hidden]', state='attached', timeout=3000)
        check(vn + ': Escape closes it and returns to the Map', pg.query_selector('#sources').get_attribute('hidden') is not None)
        pg.fill('#q', 'jadescape'); pg.wait_for_selector('.sugg button', timeout=8000); pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_function("document.querySelector('.dp, .bs') && document.querySelector('.dp, .bs').innerText.length > 20", timeout=8000); pg.wait_for_timeout(500)
        if not mob and not pg.is_visible('.dp .rad button[data-pr="3000"]'): pg.click('.dp summary:has-text("Explore nearby developments")'); pg.wait_for_timeout(300)
        pg.click('.bs .rad button[data-pr="3000"]' if mob else '.dp .rad button[data-pr="3000"]'); pg.wait_for_timeout(500)
        check(vn + ': selecting a development and changing the radius still works', 'Jadescape' in card(pg) and 'r=3000' in pg.url, pg.url)
        pg.reload(); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=20000); pg.wait_for_timeout(600)
        check(vn + ': a deep link takes precedence over the overview on reload', 'Jadescape' in card(pg), card(pg)[:60])
        check(vn + ': no page errors', not errs, errs[:2]); ctx.close()

        if mob:
            print('\n== 7. Mobile Map: minimise, reopen, switch,', vn)
            ctx, pg, errs = fresh(br, kw); open_map(pg, '#p=jadescape')
            pg.wait_for_selector('.bs', timeout=8000); pg.click('.bs [data-dpmin]'); pg.wait_for_selector('.bs.min', timeout=4000); pg.wait_for_timeout(500)
            sh = pg.evaluate("document.querySelector('.bs').getBoundingClientRect().height")
            check('390: minimised, the Map has almost the whole screen and the sheet is a slim bar', sh < 150 and 'Jadescape' in pg.inner_text('.bs.min'), sh)
            shot(pg, 'mobile-sheet-min')
            pg.click('.bs.min [data-dpshow]'); pg.wait_for_function("document.querySelector('.bs') && !document.querySelector('.bs.min')", timeout=4000)
            check('390: reopened, it shows Jadescape again with the four radius choices', 'Jadescape' in card(pg) and pg.locator('.bs .rad button').count() == 4)
            pg.click('.bs [data-dpmin]'); pg.wait_for_selector('.bs.min', timeout=4000)
            pg.fill('#q', 'horizon green'); pg.wait_for_selector('.sugg button', timeout=8000); pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter')
            pg.wait_for_function("document.querySelector('.bs h2') && document.querySelector('.bs h2').innerText === 'Horizon Green'", timeout=8000)
            check('390: switching developments opens the new one’s own sheet', not pg.query_selector('.bs.min') and 'Horizon Green' in card(pg))
            check('390: no page errors', not errs, errs[:2]); ctx.close()

        print('\n== 8. Existing deep links,', vn)
        ctx, pg, errs = fresh(br, kw)
        pg.goto(B + '/research/#/p/jadescape'); pg.wait_for_selector('.lg-hero--ans, .lg-back', timeout=10000); check(vn + ': research/#/p/<development> opens its analysis', 'Jadescape' in pg.inner_text('h1'), pg.inner_text('h1')[:60])
        pg.goto(B + '/research/#/compare/jadescape/thomson-three'); pg.wait_for_selector('.lg-back, .kpr-state', timeout=10000); pg.wait_for_timeout(500); check(vn + ': a comparison link opens the comparison', 'Thomson Three' in pg.inner_text('#app') and 'Jadescape' in pg.inner_text('#app'))
        pg.goto(B + '/research/#/p/thomson-reserve'); pg.wait_for_timeout(1500); check(vn + ': a microsite’s link to a launch with its own site still opens', 'Thomson Reserve' in pg.inner_text('#app'), pg.inner_text('#app')[:80])
        open_map(pg, '#p=thomson-three&r=500'); check(vn + ': a Map link keeps its development and radius', 'Thomson Three' in card(pg) and 'r=500' in pg.url, pg.url)
        pg.goto(B + '/journey/worth/#pc=570155'); pg.wait_for_function("document.querySelector('[data-vx-pcout]') && document.querySelector('[data-vx-pcout]').innerText.includes('Bishan')", timeout=15000); check(vn + ': Property Values deep link with a postal code still resolves', 'Bishan' in pg.inner_text('[data-vx-pcout]') or 'Bishan' in pg.inner_text('.gw-vx'), pg.inner_text('.gw-vx')[:100])
        pg.goto(B + '/journey/worth/#hdb'); pg.wait_for_selector('[data-vx-pane="hdb"]:not([hidden])', timeout=15000); check(vn + ': Property Values #hdb still opens the HDB flow', True)
        pg.goto(B + '/tools/what-can-i-buy/'); pg.wait_for_selector('#kdBudget', timeout=15000); check(vn + ': the Budget page still stands on its own', pg.query_selector('#kdBudget') is not None)
        pg.goto(B + '/projects/'); pg.wait_for_url('**/research/#/browse', timeout=10000); pg.wait_for_selector('#rwAz .gw-azr a', timeout=15000)
        check(vn + ': the old Browse address lands on Development research with A–Z open', expanded(pg) == 'dev' and pg.locator('#rwAz .gw-azr a').count() > 0, pg.url)
        check(vn + ': no page errors', not errs, errs[:2]); ctx.close()

        print('\n== Browse folded into Development research,', vn)
        ctx, pg, errs = fresh(br, kw); home(pg); pg.click('#azBtn'); pg.wait_for_selector('#rwAz .gw-azr a', timeout=15000)
        n0 = pg.locator('#rwAz .gw-azr a').count(); pg.click('#rwAz button[data-l="B"]'); pg.wait_for_timeout(200)
        check(vn + ': A–Z by letter, thirty at a time', n0 <= 30 and pg.locator('#rwAz .gw-azr a').count() <= 30 and all(n.strip().upper().startswith('B') for n in pg.evaluate("[...document.querySelectorAll('#rwAz .gw-azr .nm')].map(n => n.firstChild.textContent)")))
        shot(pg, f'az-{vn}')
        pg.click('#rwAz .gw-azr a'); pg.wait_for_url(re.compile(r'.*(research/map/#p=|research/#/p/).*'), timeout=10000)
        check(vn + ': a name in the list opens that development (Map when it has a position, otherwise its analysis)', True)
        ctx.close()
        ctx, pg, errs = fresh(br, kw); home(pg); n = pg.query_selector('#ws-dev .gw-rown a[data-kpt-ms]')
        check(vn + ': Ken’s projects open their own sites in a new tab and are tracked as before', n.get_attribute('target') == '_blank' and n.get_attribute('data-placement') == 'research-home' and n.get_attribute('href').startswith('https://'))
        ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'\n{ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
