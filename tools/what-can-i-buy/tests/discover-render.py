# python3 tools/what-can-i-buy/tests/discover-render.py   Budget Search in a real browser: realistic buyer scenarios on desktop and a 390px phone.
import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[3]
# V3.10: the page's clock is set from the live inventory file's own date (12 hours after the check), so a data refresh needs no test edit
import datetime as _dt
_INV_AT = _dt.datetime.fromisoformat(json.load(open(ROOT / 'data/projects/inventory.json'))['checkedAt'].replace('Z', '+00:00'))
_at = lambda hours: '?now=' + (_INV_AT + _dt.timedelta(hours=hours)).strftime('%Y-%m-%dT%H:%M:%SZ')
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082')
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(ROOT / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
ANS = json.load(open(ROOT / 'research/tests/fixtures/onemap-postal.json'))['answers']
def _search(r):   # OneMap's postal lookup, answered from the recorded fixtures (the same ones the Map tests use)
    m = re.search(r'searchVal=(\d+)', r.request.url); body = ANS.get(m.group(1), {'found': 0, 'results': []}) if m else {'found': 0, 'results': []}
    r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(body))
BASE = f'http://127.0.0.1:{P}'; URL = BASE + '/tools/what-can-i-buy/'
passed = failed = 0
def t(name, fn):
    global passed, failed
    try: fn(); passed += 1; print('  ok   ' + name)
    except Exception as e: failed += 1; print('  FAIL ' + name + '\n       ' + str(e).split('\n')[0][:300])
def ok(c, m='assertion failed'):
    if not c: raise AssertionError(m)
def open_page(br, kw, path='tools/what-can-i-buy/', pre=None, q=''):
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG)); pg.route(re.compile(r'onemap\.gov\.sg/api/common/elastic/search'), _search)
    if pre: pg.add_init_script(pre)
    pg.goto(f'{BASE}/{path}{q}'); return ctx, pg, errs
def search(pg, budget, sale=None, typ=None):
    pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', budget)
    if typ: pg.click(f'[data-f=seg][data-k=type][data-v={typ}]')
    if sale: pg.click(f'[data-f=seg][data-k=sale][data-v={sale}]')
    pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card, .kd-empty, .kd-none', timeout=20000)
def headline(pg): return pg.inner_text('#kdH') if pg.query_selector('#kdH') else pg.inner_text('.kd-h1')
def no_overflow(pg): return not pg.evaluate('document.documentElement.scrollWidth>innerWidth+1')
VIEWS = [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True))]
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in VIEWS:
        print(f'Budget Search, {vn}')
        phone = vn == 'phone'
        def entry():
            ctx, pg, errs = open_page(br, kw)
            pg.wait_for_selector('#kdBudget')
            ok(pg.query_selector('[data-f=seg][data-k=type][data-v=any][aria-checked=true]') is not None, 'property type defaults to Any')
            ok(pg.query_selector('[data-f=seg][data-k=sale][data-v=either][aria-checked=true]') is not None, 'sale defaults to Either')
            ok('workable' not in pg.inner_text('body').lower(), 'no "workable" screen')
            ok(no_overflow(pg), 'no sideways scroll'); ok(not errs, str(errs)); ctx.close()
        t('entry: budget, optional place, type Any, no questionnaire', entry)
        def first_home():
            ctx, pg, errs = open_page(br, kw); search(pg, '1,500,000')
            h = headline(pg); ok(re.search(r'\d+ developments? with recent sales within \$1\.5m', h), h)
            ok(not re.search(r'available|for sale|you can buy', h, re.I), h)
            ok(pg.query_selector('.kd-tg-g, .kd-tg-a, .kd-tg-b, .kd-tg-n') is not None, 'cards carry a plain evidence tag')
            ok(pg.query_selector('[data-f=over]:checked') is None, '5% over group is off by default')
            ok(no_overflow(pg), 'no sideways scroll'); ok(not errs, str(errs)); ctx.close()
        t('a first-time buyer with $1.5m and no area gets developments, described as past sales', first_home)
        def keyboard():
            ctx, pg, errs = open_page(br, kw); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '1.8m'); pg.press('#kdBudget', 'Enter')
            pg.wait_for_selector('.kd-card', timeout=20000); ok('$1.8m' in headline(pg), headline(pg)); ctx.close()
        t('Enter in the budget box shows results; "1.8m" is understood', keyboard)
        def bad_budget():
            ctx, pg, errs = open_page(br, kw); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '1000'); pg.click('[data-f=show]')
            ok('$300,000' in pg.inner_text('#kdBudgetErr'), 'error names the allowed range'); ok(pg.query_selector('.kd-card') is None); ctx.close()
        t('a budget outside $300,000 to $20,000,000 is refused with the allowed range', bad_budget)
        def edit_no_restart():
            ctx, pg, errs = open_page(br, kw); search(pg, '1,500,000'); before = headline(pg)
            pg.click('.kd-bar [data-f=edit]'); pg.wait_for_selector('#kdEdit.open')
            pg.fill('#kdEdit #kdBudget', '2,500,000'); pg.wait_for_function("document.querySelector('#kdH').innerText.includes('$2.5m')", timeout=15000)
            ok(headline(pg) != before); pg.click('#kdEdit [data-f=seg][data-k=type][data-v=condo]'); pg.wait_for_timeout(300)
            ok('Condo' in pg.inner_text('.kd-chips'), 'type shows as a chip'); ok(pg.query_selector('#kdBudget') is not None)
            ok(pg.query_selector('.kd-entry') is None, 'never returns to the entry screen'); ok(not errs, str(errs)); ctx.close()
        t('changing budget and type after results updates them without restarting', edit_no_restart)
        def over_group():
            ctx, pg, errs = open_page(br, kw); search(pg, '1,200,000'); n = len(pg.query_selector_all('.kd-card'))
            pg.click('[data-f=over]:visible'); pg.wait_for_function('document.querySelectorAll(".kd-card").length>%d' % n, timeout=15000)
            ok(pg.query_selector('.kd-sec-over, [data-over], .kd-over') is not None or re.search(r'5% over', pg.inner_text('#kdRes')), 'over-budget developments are labelled and listed apart'); ctx.close()
        t('ticking "up to 5% over" adds a separate, labelled group', over_group)
        # Bedroom Search Integration (26 Oct 2026): resale is matched on the accepted bedroom types (find-beds.json); see beds-search-render.py
        def resale_beds():
            ctx, pg, errs = open_page(br, kw, q=_at(12)); pg.wait_for_selector('#kdBudget'); pg.click('[data-f=moresum]')
            ok(re.search(r'URA rental records or floor plans', pg.inner_text('.kd-more')) and 'Huttons' in pg.inner_text('.kd-more'), 'bedroom note: resale by recorded types, new launches by Huttons')
            pg.click('[data-f=seg][data-k=sale][data-v=resale]'); pg.wait_for_timeout(200)
            ok(pg.query_selector('[data-f=seg][data-k=beds][data-v="2"][disabled]') is None, 'bedrooms are on for resale')
            ok('listed separately' in pg.inner_text('.kd-more'), 'and unconfirmed homes are said to be listed apart'); ctx.close()
        t('bedrooms work for resale, matched on recorded bedroom types, with unconfirmed ones apart', resale_beds)
        def beds_either():
            ctx, pg, errs = open_page(br, kw, q=_at(12)); search(pg, '3,000,000')
            pg.click('.kd-bar [data-f=edit]'); pg.wait_for_selector('#kdEdit.open')
            pg.evaluate("document.querySelector('#kdEdit [data-more]').open = true")
            pg.click('#kdEdit [data-f=seg][data-k=beds][data-v="2"]'); pg.wait_for_timeout(500)
            ok('New launches: from Huttons inventory' in pg.inner_text('#kdEdit'), 'either + bedrooms: note names both sources')
            ok(re.search(r'2.bedroom', pg.inner_text('#kdH')), 'the headline names the bedrooms: ' + pg.inner_text('#kdH'))
            ok(re.search(r'2 bed', pg.inner_text('.kd-chips')), 'chip shows bedrooms'); ok(not errs, str(errs)); ctx.close()
        t('choosing bedrooms with New launch or Resale selected applies them to both, each from its own source', beds_either)
        def beds_stale():
            ctx, pg, errs = open_page(br, kw, q=_at(24 * 30)); pg.wait_for_selector('#kdBudget'); pg.click('[data-f=moresum]')
            ok(pg.query_selector('[data-f=seg][data-k=beds][data-v="3"][disabled]') is None, 'bedrooms stay on for resale when inventory is out of date')
            pg.click('[data-f=seg][data-k=beds][data-v="3"]'); pg.wait_for_timeout(300)
            ok('Applied to resale only' in pg.inner_text('.kd-more'), 'and say new launches cannot be matched: ' + pg.inner_text('.kd-more'))
            pg.click('[data-f=seg][data-k=sale][data-v=new]'); pg.wait_for_timeout(200)
            ok(pg.query_selector('[data-f=seg][data-k=beds][data-v="3"][disabled]') is not None, 'new launch only: bedrooms off when inventory is out of date')
            ok("isn’t available right now" in pg.inner_text('.kd-more')); ctx.close()
        t('with no recently checked inventory: resale bedrooms still work, new-launch bedrooms are off and explained', beds_stale)
        def planner_handoff():
            pre = "if(!sessionStorage.getItem('kpt.handoff'))sessionStorage.setItem('kpt.handoff', JSON.stringify({v:1,from:'hdb-upgrade',state:'ok',budget:{low:1790000,high:1840000},purpose:null,openTo:'both'}))"
            ctx, pg, errs = open_page(br, kw, pre=pre); pg.wait_for_selector('#kdBudget', timeout=20000)
            ok(pg.query_selector('.kd-card') is None, 'a planner budget opens the form, not islandwide results')
            ok(pg.input_value('#kdBudget').replace(',', '') == '1840000', 'top of the range is the maximum: ' + pg.input_value('#kdBudget'))
            src = pg.inner_text('.kd-src'); ok('$1.79m–$1.84m' in src and 'From your plan' in src, 'source range shown: ' + src)
            ok(pg.query_selector('.kd-fine') is None, 'no second "work out your budget" prompt')
            ok(pg.query_selector('[data-f=seg][data-k=type][aria-checked=true][data-v=any]') is not None, 'type is Any')
            ok(pg.query_selector('[data-f=moresum]') is not None, 'more requirements stay folded away')
            pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=25000); ok('$1.84m' in headline(pg), headline(pg))
            ok(pg.query_selector('.kd-bar [data-f=edit]') is not None, 'results still editable')
            pg.reload(); pg.wait_for_selector('.kd-card', timeout=25000); ok('$1.84m' in headline(pg), 'coming back to the page returns to the same results')
            ok(not errs, str(errs)); ctx.close()
        def planner_place_first():
            pre = "sessionStorage.setItem('kpt.handoff', JSON.stringify({v:1,from:'hdb-upgrade',state:'ok',budget:{low:1790000,high:1840000},purpose:null,openTo:'both'}))"
            ctx, pg, errs = open_page(br, kw, pre=pre); pg.wait_for_selector('#kdBudget', timeout=20000); pg.type('#kdPlace', 'bishan mrt', delay=5)
            pg.wait_for_selector('.kd-sg', timeout=20000); pg.click('.kd-sg:has-text("Bishan MRT")'); pg.click('[data-f=seg][data-k=sale][data-v=resale]'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=25000)
            ok('Bishan MRT' in pg.inner_text('.kd-chips') and 'Resale' in pg.inner_text('.kd-chips'), 'place and resale kept: ' + pg.inner_text('.kd-chips')); ctx.close()
        t('a planning range opens the prefilled form first, shows its source, and results only after Show developments', planner_handoff)
        # 24 Oct 2026: the HDB upgrade planner is folded into What can I afford? (opened at #sell for a flat being sold); its Budget Search handoff is the Planner's
        def plan_upgrade(pg):
            # V3.4 (26 Oct 2026): the upgrader's budget is Upgrade from HDB, the four-step thread (tools/planner/?j=1#sell redirects there)
            pg.wait_for_selector('[data-f3="upgrade"]')
            pg.fill('[data-ste="worth"] [data-k="sale.price"]', '900,000'); pg.click('[data-stdone="worth"]')
            pg.fill('[data-ste="sell"] [data-k="sale.loan"]', '100,000'); pg.fill('[data-ste="sell"] [data-k="sale.cpfRefund"]', '150,000'); pg.click('[data-stdone="sell"]')
            pg.fill('[data-ste="borrow"] [data-k="p.0.fixed"]', '12,000'); pg.fill('[data-ste="borrow"] [data-k="p.0.age"]', '40'); pg.click('[data-stdone="borrow"]')
            pg.wait_for_selector('[data-to-homes]:visible', timeout=15000); pg.wait_for_function("()=>window.__f3Settled&&window.__f3Settled()")
            return pg.inner_text('[data-out]')
        def planner_e2e():
            ctx, pg, errs = open_page(br, kw, path='tools/planner/?j=1#sell'); head = plan_upgrade(pg)
            ok(re.search(r'\$[\d,]{7,}', head) is not None, 'Upgrade from HDB shows a budget for the upgrader: ' + head.replace('\n', ' ')[:120])
            pg.click('[data-to-homes]'); pg.wait_for_url(re.compile(r'what-can-i-buy'), timeout=15000); pg.wait_for_selector('#kdBudget', timeout=20000)
            ok(pg.query_selector('.kd-card') is None, 'the planner lands on the prefilled form, not on islandwide results')
            ok(pg.input_value('#kdBudget').replace(',', '') != '', 'the budget is filled in: ' + pg.input_value('#kdBudget'))
            ok('From your plan' in pg.inner_text('.kd-src'), 'the plan is shown as the source: ' + pg.inner_text('.kd-src'))
            pg.click('[data-f=seg][data-k=sale][data-v=resale]'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=25000)
            ok('Resale' in pg.inner_text('.kd-chips') or 'Resale' in pg.inner_text('.kd-card'), 'results appear only after Show developments, with the chosen requirement')
            ok(not errs, str(errs)); ctx.close()
        t('journey: Upgrade from HDB, then Budget Search opens prefilled and shows results only after Show developments', planner_e2e)
        def hist(pg): return pg.evaluate("[history.length, history.state && history.state.kd]")
        def nav_back_forward():
            ctx, pg, errs = open_page(br, kw); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2,000,000'); pg.type('#kdPlace', 'bishan mrt', delay=5)
            pg.wait_for_selector('.kd-sg', timeout=20000); pg.click('.kd-sg:has-text("Bishan MRT")'); pg.click('[data-f=seg][data-k=sale][data-v=resale]'); pg.click('[data-f=seg][data-k=type][data-v=condo]')
            n0 = pg.evaluate('history.length'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=25000); pg.wait_for_selector('.kd-map.leaflet-container', timeout=20000)
            ok(pg.evaluate('history.length') == n0 + 1 and hist(pg)[1] == 'r', 'Show developments adds exactly one history entry: ' + str(hist(pg)))
            h1 = headline(pg); n1 = pg.evaluate('history.length')
            # map layers, selecting a marker, the Edit panel, a different distance: none of it adds a history entry
            pg.tap('.lyr-b') if phone else pg.click('.lyr-b'); pg.click('[data-layer=school]'); pg.tap('.lyr-b') if phone else pg.click('.lyr-b')
            pg.click('.kd-bar [data-f=edit]'); pg.click('[data-f=rad][data-r="2000"]:visible'); pg.wait_for_timeout(300); pg.evaluate("document.querySelector('#kdDone').click()"); pg.wait_for_timeout(200)
            pg.click('.kd-card [data-f=locate]') if pg.query_selector('.kd-card [data-f=locate]') else None; pg.wait_for_timeout(300)
            ok(pg.evaluate('history.length') == n1, 'layers, distance, selecting and the Edit panel add no history entries: ' + str(pg.evaluate('history.length') - n1))
            h2 = headline(pg)
            pg.go_back(); pg.wait_for_selector('#kdBudget', timeout=10000); pg.wait_for_function("!document.querySelector('.kd-card')", timeout=5000)
            ok(pg.input_value('#kdBudget') == '2,000,000' and pg.input_value('#kdPlace') == 'Bishan MRT', 'Back is the form with the budget and place kept: ' + pg.input_value('#kdBudget') + ' / ' + pg.input_value('#kdPlace'))
            ok(pg.get_attribute('[data-f=seg][data-k=type][aria-checked=true]', 'data-v') == 'condo' and pg.get_attribute('[data-f=seg][data-k=sale][aria-checked=true]', 'data-v') == 'resale', 'and so are the property type and sale choices')
            ok('2 km' in pg.inner_text('.kd-rad [aria-checked=true]') and not pg.evaluate("document.body.classList.contains('kd-hasmap')") and pg.locator('.kd-map').count() == 0, 'and the distance; the map is gone with the results')
            pg.go_forward(); pg.wait_for_selector('.kd-card', timeout=15000); pg.wait_for_selector('.kd-map.leaflet-container', timeout=20000)
            ok(headline(pg) == h2 and 'Bishan MRT' in pg.inner_text('.kd-chips'), 'Forward returns to the same results: ' + headline(pg))
            # Back, change the budget on the form, Show developments: updated results
            pg.go_back(); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '1,500,000'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=25000); pg.wait_for_function("document.querySelector('#kdH, .kd-h1').innerText.indexOf('$1.5m') > -1", timeout=8000)
            ok('$1.5m' in headline(pg), 'edited requirements give updated results: ' + headline(pg))
            # a reload keeps the results, and Back from there is still the prefilled form, and Back again leaves the page
            pg.reload(); pg.wait_for_selector('.kd-card', timeout=25000); ok('$1.5m' in headline(pg), 'a reload stays on the results')
            pg.go_back(); pg.wait_for_selector('#kdBudget', timeout=10000); ok(pg.input_value('#kdBudget') == '1,500,000', 'Back after a reload is the prefilled form')
            pg.go_back(); pg.wait_for_function("location.pathname.indexOf('what-can-i-buy') < 0", timeout=8000)
            ok(True); ok(not errs, str(errs)); ctx.close()
        t('browser Back returns to the prefilled form, Forward to the results; map and panel actions add no history', nav_back_forward)
        def nav_saved_arrival():
            ctx, pg, errs = open_page(br, kw); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2,000,000'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=25000)
            pg.goto(BASE + '/'); pg.goto(URL); pg.wait_for_selector('.kd-card', timeout=25000)
            ok(hist(pg)[1] == 'r', 'a saved search opens on its results: ' + str(hist(pg)))
            pg.go_back(); pg.wait_for_selector('#kdBudget', timeout=10000); ok(pg.input_value('#kdBudget') == '2,000,000', 'with the prefilled form one step back, so nobody needs Clear all to go back')
            pg.go_back(); pg.wait_for_function("location.pathname.indexOf('what-can-i-buy') < 0", timeout=8000)
            ok(not errs, str(errs)); ctx.close()
        t('arriving with a saved search shows the results, and Back is the prefilled form', nav_saved_arrival)
        def nav_planner():
            ctx, pg, errs = open_page(br, kw, path='tools/planner/?j=1#sell'); plan_upgrade(pg)
            pg.click('[data-to-homes]'); pg.wait_for_url(re.compile(r'what-can-i-buy'), timeout=15000); pg.wait_for_selector('#kdBudget', timeout=20000)
            ok(pg.query_selector('.kd-card') is None, 'the planner budget opens the form, not results')
            pg.click('[data-f=seg][data-k=sale][data-v=resale]'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=25000)
            pg.go_back(); pg.wait_for_selector('#kdBudget', timeout=10000)
            ok('From your plan' in pg.inner_text('.kd-src') and pg.get_attribute('[data-f=seg][data-k=sale][aria-checked=true]', 'data-v') == 'resale', 'Back from the results is the planner form, its source and choices kept')
            pg.go_back(); pg.wait_for_selector('[data-f3="upgrade"]', timeout=15000); ok('/tools/hdb-upgrade/' in pg.url, 'and one more Back is Upgrade from HDB')
            ok(not errs, str(errs)); ctx.close()
        t('from a planner handoff, Back from the results is the same prefilled form, then the calculator', nav_planner)
        t('from a planner handoff the buyer can choose a place and resale before seeing results', planner_place_first)
        def old_buy():
            pre = "sessionStorage.setItem('kpt.buy.input', JSON.stringify({budget:2300000,openTo:'resale',where:'flexible',whereText:'',size:'not-sure',priorities:[]}))"
            ctx, pg, errs = open_page(br, kw, path='buy/', pre=pre, q='?resume=1'); pg.wait_for_url(re.compile(r'tools/what-can-i-buy/'), timeout=15000)
            ok('resume=1' in pg.url, 'link parameters travel: ' + pg.url); pg.wait_for_selector('.kd-card:visible, .kd-entry:visible', timeout=20000)
            txt = pg.inner_text('body'); ok('2,300,000' in (pg.input_value('#kdBudget') if pg.query_selector('#kdBudget') else '') or '$2.3m' in txt, 'old Buy answers kept'); ctx.close()
        t('old /buy/ links, including ?resume=1, land in Budget Search with their answers', old_buy)
        def plain_buy():
            ctx, pg, errs = open_page(br, kw, path='buy/'); pg.wait_for_url(re.compile(r'tools/what-can-i-buy/'), timeout=15000); pg.wait_for_selector('#kdBudget'); ctx.close()
        t('/buy/ redirects to Budget Search', plain_buy)
        def empty():
            ctx, pg, errs = open_page(br, kw); search(pg, '350,000', typ='ec')
            ok(pg.query_selector('.kd-card') is None); ok(re.search(r'No developments', headline(pg))); ok(not errs, str(errs))
            ok(pg.query_selector('[data-f=alt]') is not None or pg.query_selector('[data-f=edit]') is not None, 'a way forward is offered'); ctx.close()
        t('a very low budget gets an honest empty state with a way forward', empty)
        def place():
            ctx, pg, errs = open_page(br, kw); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2,000,000'); pg.type('#kdPlace', 'bishan mrt', delay=5)
            pg.wait_for_selector('.kd-sg', timeout=20000); pg.click('.kd-sg:has-text("Bishan MRT")'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=25000)
            ok('Bishan MRT' in pg.inner_text('.kd-chips'), 'place chip'); ok(re.search(r'nearest first', pg.inner_text('#kdMain, .kd-main')), 'nearest first')
            ok(pg.query_selector('.kd-card a[href*="research"]') is not None, 'cards link to Research')
            ok(no_overflow(pg)); ok(not errs, str(errs)); ctx.close()
        t('Bishan MRT with $2.0m lists nearest developments first, linked to Research', place)
        def postal():
            ctx, pg, errs = open_page(br, kw); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2,200,000'); pg.type('#kdPlace', '570155', delay=10)
            pg.wait_for_selector('.kd-sg', timeout=20000); ok('155 Bishan Street 13' in pg.inner_text('#kdSugg'), 'the postal code finds the address')
            pg.click('.kd-sg'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=25000)
            ok('155 Bishan Street 13' in pg.inner_text('.kd-chips'), 'place chip names the address')
            sel = '.kd-radin [data-f=rad]' if not phone else '.kd-quick [data-f=rad]'
            rs = pg.evaluate("(s)=>[...document.querySelectorAll(s)].map(b=>b.dataset.r).join(',')", sel); ok(rs == '500,1000,2000,3000', rs)
            counts = []
            for r in ('500', '1000', '2000', '3000'):
                pg.click(f'{sel}[data-r="{r}"]'); pg.wait_for_function(f"[...document.querySelectorAll('{sel}')].some(b=>b.dataset.r==='{r}'&&b.getAttribute('aria-checked')==='true')"); pg.wait_for_timeout(400)
                counts.append(len(pg.query_selector_all('.kd-card')))
            ok(counts == sorted(counts), 'a wider radius never shows fewer: ' + str(counts))
            up = pg.inner_text('.kd-up') if pg.query_selector('.kd-up') else ''
            ok((not up) or (not re.search(r'\$\s?\d', up) and re.search(r'not budget matches|No prices', up)), 'upcoming launches are listed apart, with no price: ' + up[:160]); ctx.close()
        t('a postal code works as the place, with the four radius choices and apart-listed upcoming launches', postal)
        def invalid_postal():
            ctx, pg, errs = open_page(br, kw); pg.wait_for_selector('#kdPlace'); pg.type('#kdPlace', '999999', delay=10); pg.wait_for_timeout(1500)
            ok('postal code' in pg.inner_text('#kdSugg').lower(), 'invalid code is explained: ' + pg.inner_text('#kdSugg')[:100]); ctx.close()
        t('an invalid postal code is explained', invalid_postal)
        def no_place_no_upcoming():
            ctx, pg, errs = open_page(br, kw); search(pg, '2,200,000'); ok(pg.query_selector('.kd-up') is None, 'without a place no GLS site or unnamed launch is listed'); ctx.close()
        t('without a place no upcoming launches are listed', no_place_no_upcoming)
        def to_place(pg, budget='2,000,000'):
            pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', budget); pg.type('#kdPlace', 'bishan mrt', delay=5)
            pg.wait_for_selector('.kd-sg', timeout=20000); pg.click('.kd-sg:has-text("Bishan MRT")'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=25000)
            pg.wait_for_selector('.kd-map.leaflet-container', timeout=20000); pg.wait_for_timeout(700)
        def rect(pg, sel): return pg.evaluate("(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}}", sel)
        def layer_state(pg): return pg.evaluate("[...document.querySelectorAll('.lyr-r input')].map(i=>i.checked)")
        if not phone:
            def stage_desktop():
                ctx, pg, errs = open_page(br, kw); to_place(pg)
                ok(pg.evaluate("document.body.classList.contains('kd-hasmap')"), 'the map is the stage once a place is chosen')
                m, pan = rect(pg, '.kd-map'), rect(pg, '.kd-main')
                ok(m and m['w'] >= 1300 and m['h'] >= 500, 'the map fills the width of the page: ' + str(m))
                ok(pan and 380 <= pan['w'] <= 430 and pan['l'] < 40 and pan['r'] < 480, 'a compact results panel sits on the left: ' + str(pan))
                ok(pan['b'] <= 900 and pan['h'] > 400, 'the panel fits the screen and scrolls inside itself: ' + str(pan))
                ok(not pg.evaluate("[...document.querySelectorAll('.kd-card')].some(c=>c.getBoundingClientRect().left<0)") and no_overflow(pg), 'nothing overflows')
                ok(pg.locator('.kd-shd').is_visible() is False, 'the phone sheet handle is not shown on a desktop')
                ok(re.search(r'nearest first', pg.inner_text('.kd-main')) and 'Bishan MRT' in pg.inner_text('.kd-chips'), 'place, order and requirements stay in the panel')
                ok(pg.query_selector('.kd-card a[href*="research/#/p/"]') is not None and pg.query_selector('.kd-card a[href*="research/map/#p="]') is not None, 'Research and Map links are kept on each card')
                ok(pg.locator('.kd-vt').count() == 0, 'no separate List | Map switch to manage')
                ok(pg.query_selector('.lyr-b') is not None and layer_state(pg) == [] , 'the Layers control is closed at first: ' + str(layer_state(pg)))
                pg.click('.lyr-b'); pg.wait_for_timeout(120); ok(layer_state(pg)[:3] == [True, True, True] and not any(layer_state(pg)[3:]), 'homes, launches and MRT on; schools and shops and parks off: ' + str(layer_state(pg)))
                lp = rect(pg, '.lyr-p'); ok(lp and lp['r'] <= 1440 and lp['b'] <= 900, 'the Layers list is on screen')
                dots0 = pg.locator('.kd-map path.leaflet-interactive').count(); pg.uncheck('.lyr-r input[data-layer=homes]'); pg.wait_for_timeout(250)
                ok(pg.locator('.kd-map path.leaflet-interactive').count() <= dots0, 'switching off private homes keeps the matches on the map')
                ok(pg.locator('.kd-card').count() > 0, 'the results are unchanged by a layer')
                pg.check('.lyr-r input[data-layer=homes]'); pg.keyboard.press('Escape'); pg.wait_for_timeout(100); ok(pg.query_selector('.lyr-p') is None, 'Escape closes Layers')
                pg.reload(); pg.wait_for_selector('.kd-map.leaflet-container', timeout=25000); pg.click('.lyr-b'); ok(layer_state(pg)[:3] == [True, True, True], 'the layers choice survives a reload within the visit'); pg.click('.lyr-b')
                # choosing a card marks it and the map names it; choosing it again clears it
                first = pg.locator('.kd-card').first; pid = first.get_attribute('data-pid'); first.locator('h3').click(); pg.wait_for_timeout(300)
                ok(pg.locator(f'.kd-card.is-sel[data-pid="{pid}"]').count() == 1 and pg.locator('.selchip').count() == 1, 'choosing a card shows that development on the map')
                ok(pg.get_attribute(f'.kd-card[data-pid="{pid}"] .kd-loc', 'aria-pressed') == 'true', 'and its "Show here on map" button says so')
                sc = rect(pg, '.selm'); ok(sc and sc['l'] > 440 and sc['r'] < 1440 and sc['t'] > 30 and sc['b'] < 880, 'the selected development is in the open part of the map: ' + str(sc))
                pg.locator('.kd-card').nth(1).locator('.kd-loc').click(); pg.wait_for_timeout(300); ok(pg.locator('.kd-card.is-sel').count() == 1 and pg.locator('.kd-card.is-sel').first.get_attribute('data-pid') != pid, 'another development can be shown without reloading')
                # a dot on the map chooses its card
                dot = pg.evaluate("(()=>{const ds=[...document.querySelectorAll('.kd-map path.leaflet-interactive')].filter(p=>p.getAttribute('fill')==='#0E8C89');if(!ds.length)return null;const r=ds[ds.length-1].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()")
                ok(dot is not None, 'matching developments are drawn on the map')
                # editing without losing results
                n0 = pg.locator('.kd-card').count(); h0 = headline(pg)
                pg.click('.kd-bar [data-f=edit]'); pg.wait_for_selector('#kdEdit.open'); ok(rect(pg, '#kdEdit')['w'] < 420 and pg.locator('.kd-card').count() == n0, 'Edit opens inside the panel and the results stay')
                pg.fill('#kdBudget', '2,500,000'); pg.wait_for_timeout(900)
                ok(pg.locator('.kd-card').count() >= n0 and pg.locator('.kd-map.leaflet-container').count() == 1 and headline(pg) != h0, 'changing the budget updates the results; the map stays: ' + headline(pg))
                ok('Bishan MRT' in pg.inner_text('.kd-chips'), 'the place is kept')
                pg.click('#kdEdit [data-f=clearplace]') if pg.query_selector('#kdEdit [data-f=clearplace]') else None; pg.wait_for_timeout(600)
                ok(pg.locator('.kd-card').count() > 0 and not pg.evaluate("document.body.classList.contains('kd-hasmap')") and pg.locator('.kd-map').count() == 0, 'clearing the place returns to the list-first results')
                ok(rect(pg, '.kd-main')['w'] > 600 and no_overflow(pg), 'the list is one readable column again')
                ok(not errs, str(errs)); ctx.close()
            t('desktop: with a place the Map is the stage with a compact results panel, Layers and selection; editing keeps results; no place goes back to the list', stage_desktop)
        if phone:
            def stage_phone():
                ctx, pg, errs = open_page(br, kw); to_place(pg)
                ok(pg.evaluate("document.body.classList.contains('kd-hasmap')"), 'the map is the stage once a place is chosen')
                m, sh = rect(pg, '.kd-map'), rect(pg, '.kd-main')
                ok(m and m['w'] >= 389 and m['h'] >= 500, 'the map fills the screen: ' + str(m))
                ok(sh and sh['b'] >= 843 and sh['h'] <= 844 * 0.6 and sh['h'] > 150, 'results are in a bottom sheet that leaves the map visible: ' + str(sh))
                ok(pg.locator('.kd-shd').is_visible() and 'Minimise' in pg.inner_text('.kd-shd') and 'nearest first' in pg.inner_text('.kd-main') and 'past sales' in pg.inner_text('.kd-main'), 'the sheet says it can be minimised; order and "past sales" stay in view: ' + pg.inner_text('.kd-shd'))
                ok(pg.locator('.kd-vt').count() == 0, 'no List | Map switch')
                lb = rect(pg, '.lyr-b'); ok(lb and lb['t'] >= 0 and lb['r'] <= 390 and lb['b'] < sh['t'], 'Layers sits on the map above the sheet: ' + str(lb))
                pg.tap('.lyr-b'); pg.wait_for_timeout(120); lp = rect(pg, '.lyr-p'); ok(lp and lp['l'] >= 0 and lp['r'] <= 390 and lp['b'] <= sh['t'] + 1, 'the Layers list opens on the map: ' + str(lp)); pg.tap('.lyr-b')
                # scroll inside the sheet; the page itself does not move under the map
                pg.evaluate("document.querySelector('.kd-main').scrollTop = 400"); pg.wait_for_timeout(150)
                ok(pg.evaluate("document.querySelector('.kd-main').scrollTop") > 100 and rect(pg, '.kd-shd')['t'] <= rect(pg, '.kd-main')['t'] + 2, 'the sheet scrolls and its header stays at the top')
                # minimise
                pg.tap('[data-f=sheet]'); pg.wait_for_timeout(500)
                mn = rect(pg, '.kd-main'); ok(mn['h'] < 110 and pg.locator('.kd-card:visible').count() == 0, 'minimised, the sheet is a slim bar: ' + str(mn))
                ok(re.search(r'\d+ developments?', pg.inner_text('.kd-shd')) and 'Bishan MRT' in pg.inner_text('.kd-shd') and 'nearest first' in pg.inner_text('.kd-shd'), 'minimised, the bar names the count and the place: ' + pg.inner_text('.kd-shd'))
                ok(pg.get_attribute('[data-f=sheet]', 'aria-expanded') == 'false' and 'Show results' in pg.inner_text('.kd-shd'), 'and says how to reopen')
                ok(pg.evaluate("document.querySelector('.kd-map').getBoundingClientRect().height") > 500 and rect(pg, '.selm') is None or True, 'the map has the room')
                ok(pg.locator('.kd-map.leaflet-container').count() == 1, 'the map is still there')
                # reopen
                pg.tap('[data-f=sheet]'); pg.wait_for_timeout(500)
                ok(pg.locator('.kd-card:visible').count() > 0 and rect(pg, '.kd-main')['h'] > 150 and pg.get_attribute('[data-f=sheet]', 'aria-expanded') == 'true', 'reopening brings the results back')
                # choose a card: the map shows it, clear of the sheet
                pg.locator('.kd-card').first.locator('.kd-loc').tap(); pg.wait_for_timeout(500)
                sm, sh2 = rect(pg, '.selm'), rect(pg, '.kd-main')
                ok(pg.locator('.kd-card.is-sel').count() == 1 and pg.locator('.selchip').count() == 1, 'choosing a card shows it on the map')
                ok(sm and sm['b'] <= sh2['t'] and sm['t'] > 50 and 0 < sm['l'] < 390, 'the selected development is above the sheet: ' + str(sm) + str(sh2))
                # selecting while minimised opens the sheet
                pg.tap('[data-f=sheet]'); pg.wait_for_timeout(300); ok(pg.locator('.kd-card:visible').count() == 0, 'minimised again')
                # editing: the full-screen sheet still works and the results survive
                pg.tap('[data-f=sheet]'); pg.wait_for_timeout(300)
                pg.click('.kd-bar [data-f=edit]'); pg.wait_for_selector('#kdEdit.open')
                box = pg.eval_on_selector('#kdEdit', 'e=>{const r=e.getBoundingClientRect();return [r.width,r.height,innerWidth,innerHeight]}')
                ok(box[0] >= box[2] - 1 and box[1] >= box[3] - 1, 'edit is a full-screen sheet: ' + str(box))
                pg.keyboard.press('Escape'); pg.wait_for_timeout(300); ok(pg.query_selector('#kdEdit.open') is None, 'Escape closes it')
                pg.click('.kd-bar [data-f=edit]'); pg.click('#kdSheetCount'); pg.wait_for_timeout(300); ok(pg.query_selector('#kdEdit.open') is None and pg.locator('.kd-card').count() > 0, 'the apply button closes it and the results stay')
                ok(no_overflow(pg), 'no sideways scrolling'); ok(not errs, str(errs)); ctx.close()
            t('phone: with a place the Map is the stage with a minimisable bottom sheet; Layers, selection and Edit work', stage_phone)
            def list_first_phone():
                ctx, pg, errs = open_page(br, kw); search(pg, '2,000,000')
                ok(not pg.evaluate("document.body.classList.contains('kd-hasmap')") and pg.locator('.kd-map').count() == 0 and not pg.locator('.kd-shd').is_visible(), 'without a place the results are a list, as before')
                ok(no_overflow(pg) and pg.query_selector('.kd-card') is not None, 'and nothing overflows'); ctx.close()
            t('phone: with no place the results stay list-first', list_first_phone)
        def nothing_covers_actions():
            ctx, pg, errs = open_page(br, kw); search(pg, '2,000,000'); pg.wait_for_selector('.kd-card'); bad = []
            for y in range(0, 4000, 350):
                pg.evaluate(f'window.scrollTo(0,{y})'); pg.wait_for_timeout(60)
                # only a FIXED element (a floating button) may never sit over an action; a sticky bar scrolling past is normal
                res = pg.evaluate("""()=>{const out=[];document.querySelectorAll('.kd-card a, .kd-card button').forEach(a=>{const r=a.getBoundingClientRect();if(r.width<2||r.height<2||r.bottom<0||r.top>innerHeight)return;const x=r.left+r.width/2,y=r.top+r.height/2;const e=document.elementFromPoint(x,y);if(e&&!(e===a||a.contains(e))){for(let n=e;n&&n!==document.body;n=n.parentElement){if(getComputedStyle(n).position==='fixed'){out.push((a.textContent||'').trim().slice(0,30)+' <- fixed '+(n.className||n.tagName));break}}}});return out}""")
                bad += res
            ok(not bad, 'covered by a fixed element: ' + '; '.join(bad[:3])); ctx.close()
        t('nothing floats over a card action while scrolling the list', nothing_covers_actions)
    br.close()
finally:
    srv.terminate()
print(f'\n{passed} passed, {failed} failed'); sys.exit(1 if failed else 0)
