# python3 tools/what-can-i-buy/tests/discover-render.py   Budget Search in a real browser: realistic buyer scenarios on desktop and a 390px phone.
import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[3]
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
        def resale_beds():
            ctx, pg, errs = open_page(br, kw, q='?now=2026-10-08T00:00:00Z'); pg.wait_for_selector('#kdBudget'); pg.click('[data-f=moresum]')
            ok(re.search(r'new launches only|Huttons', pg.inner_text('.kd-more')), 'bedroom note says new launches only')
            pg.click('[data-f=seg][data-k=sale][data-v=resale]'); pg.wait_for_timeout(200)
            ok(pg.query_selector('[data-f=seg][data-k=beds][data-v="2"][disabled]') is not None, 'bedrooms are off for resale')
            ok('Not available for resale' in pg.inner_text('.kd-more'), 'and it says why'); ctx.close()
        t('bedrooms are switched off for resale, with the reason', resale_beds)
        def beds_either():
            ctx, pg, errs = open_page(br, kw, q='?now=2026-10-08T00:00:00Z'); search(pg, '3,000,000')
            pg.click('.kd-bar [data-f=edit]'); pg.wait_for_selector('#kdEdit.open')
            pg.evaluate("document.querySelector('#kdEdit [data-more]').open = true")
            pg.click('#kdEdit [data-f=seg][data-k=beds][data-v="2"]'); pg.wait_for_timeout(500)
            ok('Applied to new launches only' in pg.inner_text('#kdEdit'), 'either + bedrooms: note says new launches only')
            ok(re.search(r'2 bed', pg.inner_text('.kd-chips')), 'chip shows bedrooms'); ok(not errs, str(errs)); ctx.close()
        t('choosing bedrooms with New launch or Resale selected says it applies to new launches only', beds_either)
        def beds_stale():
            ctx, pg, errs = open_page(br, kw, q='?now=2026-12-30T00:00:00Z'); pg.wait_for_selector('#kdBudget'); pg.click('[data-f=moresum]')
            ok(pg.query_selector('[data-f=seg][data-k=beds][data-v="3"][disabled]') is not None, 'bedrooms off when inventory is out of date')
            ok("isn’t available right now" in pg.inner_text('.kd-more')); ctx.close()
        t('with no recently checked inventory the bedroom control is off and explained', beds_stale)
        def planner_handoff():
            pre = "sessionStorage.setItem('kpt.handoff', JSON.stringify({v:1,from:'hdb',state:'ok',budget:{low:1500000,high:1800000},purpose:null,openTo:'both'}))"
            ctx, pg, errs = open_page(br, kw, pre=pre); pg.wait_for_selector('.kd-card:visible, .kd-entry:visible', timeout=20000)
            if pg.query_selector('.kd-entry'): ok(pg.input_value('#kdBudget').replace(',', '') in ('1800000', '1500000'), 'budget carried: ' + pg.input_value('#kdBudget'))
            else: ok('$1.8m' in headline(pg) or '$1.5m' in headline(pg), headline(pg))
            ctx.close()
        t('a budget handed over by the HDB planner is carried in', planner_handoff)
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
        if phone:
            def sheet_and_map():
                ctx, pg, errs = open_page(br, kw); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2,000,000'); pg.type('#kdPlace', 'bishan mrt', delay=5)
                pg.wait_for_selector('.kd-sg', timeout=20000); pg.click('.kd-sg:has-text("Bishan MRT")'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=25000)
                ok(pg.query_selector('.kd-vt [data-v=map]:not([disabled])') is not None, 'the Map view is offered once a place is chosen')
                pg.click('.kd-bar [data-f=edit]'); pg.wait_for_selector('#kdEdit.open')
                box = pg.eval_on_selector('#kdEdit', 'e=>{const r=e.getBoundingClientRect();return [r.width,r.height,innerWidth,innerHeight]}')
                ok(box[0] >= box[2] - 1 and box[1] >= box[3] - 1, 'edit is a full-screen sheet: ' + str(box))
                pg.keyboard.press('Escape'); pg.wait_for_timeout(300); ok(pg.query_selector('#kdEdit.open') is None, 'Escape closes it')
                pg.click('.kd-bar [data-f=edit]'); pg.click('#kdSheetCount'); pg.wait_for_timeout(300); ok(pg.query_selector('#kdEdit.open') is None, 'the apply button closes it')
                pg.click('.kd-vt [data-v=map]'); pg.wait_for_selector('.kd-map.leaflet-container', timeout=20000); pg.wait_for_timeout(800)
                r = pg.eval_on_selector('.kd-map', 'e=>{const r=e.getBoundingClientRect();return [r.width,r.height]}'); ok(r[0] > 300 and r[1] > 250, 'map has size: ' + str(r))
                pg.click('.kd-vt [data-v=list]'); pg.wait_for_selector('.kd-card'); ok(no_overflow(pg)); ok(not errs, str(errs)); ctx.close()
            t('phone: edit is a full-screen sheet (Escape and the button close it) and List | Map both work', sheet_and_map)
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
