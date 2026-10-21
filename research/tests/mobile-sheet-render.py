"""Browser checks for the mobile Map sheet (390 px) and Research search of registered launches.
Run from the site folder:  python3 research/tests/mobile-sheet-render.py        (set P3_SHOTS=<folder> to also save screenshots)
Starts the site's own server and stubs OneMap, so it needs no internet.
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
def hdr(pg): return (pg.inner_text('.dp h2, .bs h2') if pg.query_selector('.dp h2, .bs h2') else '')
def radios(pg): return pg.evaluate("[...document.querySelectorAll('.rad button')].map(b=>b.dataset.pr+(b.getAttribute('aria-checked')==='true'?'*':'')).join(',')")

PHONE = dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
def box(pg, sel):
    return pg.evaluate("(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom}}", sel)
def vis(pg, sel):   # inside the window and not under the sheet's own top edge
    b = box(pg, sel); return bool(b) and b['h'] > 0 and b['y'] >= 0 and b['b'] <= 844
def sheet(pg): return box(pg, '.bs')
def hash_(pg): return pg.evaluate('location.hash')
def selr(pg): return pg.evaluate("(()=>{const b=document.querySelector('.bs .rad [aria-checked=true]');return b?b.dataset.pr:null})()")
def chip(pg):  # where the selected marker is, against the top of the sheet
    return pg.evaluate("(()=>{const a=document.querySelector('.selchip,.leaflet-marker-icon.sel,.selmk');if(!a)return null;const r=a.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
def setpr(pg, r):
    pg.click(f'.bs .rad button[data-pr="{r}"]'); pg.wait_for_function(f"document.querySelector('.bs .rad [aria-checked=true]').dataset.pr === '{r}'", timeout=4000); pg.wait_for_timeout(500)
def minimise(pg):
    pg.click('.bs [data-dpmin]'); pg.wait_for_selector('.bs.min', timeout=4000); pg.wait_for_timeout(700)
def reopen(pg):
    pg.click('.bs.min [data-dpshow]'); pg.wait_for_function("document.querySelector('.bs') && !document.querySelector('.bs.min')", timeout=4000); pg.wait_for_timeout(500)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    ctx, pg, errs = fresh(br, PHONE); print('\n== Mobile sheet, 390 px')
    for q, nm, kind in [('thomson three', 'Thomson Three', 'dev'), ('horizon green', 'Horizon Green', 'dev'), ('serra residences', 'The Serra Residences', 'launch'), ('bishan mrt', 'Bishan MRT', 'mrt')]:
        tag = q.replace(' ', '-'); print('  --', nm)
        opn(pg); pick(pg, q)
        h = sheet(pg)
        check(f'{nm}: the name is the first thing in the sheet', nm in hdr(pg) and vis(pg, '.bs h2'), hdr(pg))
        check(f'{nm}: the four radius choices are visible without scrolling, 1 km selected', vis(pg, '.bs .rad') and radios(pg) == '500,1000*,2000,3000', radios(pg))
        shot(pg, f'sheet-{tag}-1-open')
        setpr(pg, 2000); t = card(pg)
        check(f'{nm}: 2 km updates the count and the circle', '2 km' in t and circles(pg) >= 1 and (kind == 'mrt' or 'within 2 km' in t), t[:300])
        if kind != 'mrt': check(f'{nm}: the nearby radius is kept in the link', 'nr=2000' in hash_(pg) or 'r=2000' in hash_(pg), hash_(pg))
        # open the details and scroll: the name and the radius stay pinned
        if pg.query_selector('.bs-act [data-dpmore][aria-expanded=false]'): pg.click('.bs-act [data-dpmore]'); pg.wait_for_timeout(450)
        pg.evaluate("document.querySelectorAll('.bs details.sx').forEach(d => d.open = true)"); pg.wait_for_timeout(300)   # the sections open on demand; open them so there is something to scroll
        pg.evaluate("document.querySelector('.bs').scrollTop = 600"); pg.wait_for_timeout(250)
        sb = sheet(pg); rb = box(pg, '.bs .rad')
        check(f'{nm}: scrolled to the details, the radius choices are still at the top of the sheet', rb and sb and rb['y'] - sb['y'] < 170, (rb, sb))
        shot(pg, f'sheet-{tag}-2-scrolled')
        if kind != 'mrt': setpr(pg, 3000); check(f'{nm}: the radius changes from there and the panel stays where it was', selr(pg) == '3000' and pg.evaluate("document.querySelector('.bs').scrollTop") > 100, pg.evaluate("document.querySelector('.bs').scrollTop"))
        else: setpr(pg, 500)
        want = selr(pg); hb = hash_(pg)
        # minimise
        minimise(pg); mb = sheet(pg); cx = chip(pg)
        check(f'{nm}: minimised, the sheet is a slim bar', mb and mb['h'] < 150, mb)
        check(f'{nm}: the name is still in the bar, with a clear way to reopen', nm in pg.inner_text('.bs.min') and 'Show details' in pg.inner_text('.bs.min'), pg.inner_text('.bs.min'))
        check(f'{nm}: the selected location stays on the map, above the bar', cx is not None and cx[1] < mb['y'] and 0 < cx[0] < 390, (cx, mb))
        check(f'{nm}: the radius circle stays', circles(pg) >= 1)
        check(f'{nm}: the radius choice is kept and still in the bar', selr(pg) == want and vis(pg, '.bs.min .rad'), (selr(pg), want))
        check(f'{nm}: minimising does not deselect (same link, search box back)', hash_(pg) == hb and vis(pg, '.mapsearch'), (hash_(pg), hb))
        shot(pg, f'sheet-{tag}-3-minimised')
        # change the radius from the bar, see the map
        setpr(pg, 1000); check(f'{nm}: the radius can be changed from the bar', selr(pg) == '1000' and circles(pg) >= 1)
        # reopen
        reopen(pg); t = card(pg)
        check(f'{nm}: reopening brings back the same selection and radius', nm in hdr(pg) and selr(pg) == '1000' and hash_(pg).split('nr=')[0] != '' , (hdr(pg), selr(pg)))
        shot(pg, f'sheet-{tag}-4-reopened')
        # everything is still reachable
        if kind == 'dev':
            if pg.query_selector('.bs-act [data-dpmore][aria-expanded=false]'): pg.click('.bs-act [data-dpmore]'); pg.wait_for_timeout(450)
            t = card(pg); check(f'{nm}: prices by size, the neighbourhood and the Research link are still there', 'Prices by size' in t and 'amenities' in t.lower() and 'Explore nearby developments' in t and 'RECENT PRICES' in t.upper() and pg.query_selector('.bs a[href*="#/p/"]') is not None, t[:200])
        elif kind == 'launch':
            check(f'{nm}: no price and no marketing link, sources on demand', re.search(r'\$\s?\d', t) is None and pg.query_selector('.bs a[href*="kentanthepropertyguy"]') is None and 'Far East' in t)
        # close is different from minimise
        pg.click('.bs [data-dpclose]'); pg.wait_for_selector('.bs[aria-label="Start"]', timeout=4000); pg.wait_for_timeout(500)
        check(f'{nm}: × closes and clears the selection (no circle, no selection in the link)', circles(pg) == 0 and 'p=' not in hash_(pg) and 'pl=' not in hash_(pg), (circles(pg), hash_(pg)))
        pg.wait_for_timeout(100)
    # switching in one session
    print('  -- switching')
    opn(pg); pick(pg, 'thomson three'); setpr(pg, 2000); minimise(pg)
    pick(pg, 'horizon green'); check('a new selection opens its own sheet (not the minimised one), radius back to 1 km', hdr(pg) == 'Horizon Green' and not pg.query_selector('.bs.min') and selr(pg) == '1000', (hdr(pg), selr(pg)))
    check('only one circle belongs to the new selection', 1 <= circles(pg) <= 2, circles(pg))
    pick(pg, 'bishan mrt'); check('an MRT replaces the development', 'Bishan' in hdr(pg) and 'Horizon' not in card(pg), hdr(pg))
    minimise(pg); pick(pg, '368060'); check('a postal code replaces a minimised sheet and opens in full', not pg.query_selector('.bs.min') and 'Mount Vernon' in card(pg) or 'Bartley' in card(pg), card(pg)[:100])
    pick(pg, 'the serra residences'); check('then a launch, with one panel', len(pg.query_selector_all('.bs')) == 1 and 'Serra' in hdr(pg), hdr(pg))
    minimise(pg); pg.go_back(); pg.wait_for_timeout(600)
    check('going back shows the previous selection open', not pg.query_selector('.bs.min') and len(pg.query_selector_all('.bs')) == 1, hash_(pg))
    check('no page errors', not errs, errs); ctx.close()

    # Research: a registered launch is never a dead end
    for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('390', PHONE)]:
        ctx, pg, errs = fresh(br, kw); print('\n== Research search,', vn)
        def rask(q):
            pg.goto(f'http://127.0.0.1:{P}/research/'); pg.wait_for_selector('#q'); pg.fill('#q', q)
            pg.wait_for_function("(q)=>{const r=document.querySelector('#res');return r&&r.innerText.trim().length>5}", arg=q, timeout=8000); pg.wait_for_timeout(400)
            return pg.inner_text('#res'), pg.eval_on_selector_all('#res button', 'b=>b.map(x=>x.dataset.launch||x.dataset.id||x.dataset.road||"")')
        found = {}
        for q in ('serra', 'serra residences', 'the serra residences'):
            t, ids = rask(q); found[q] = ids; shot(pg, f'research-{q.replace(" ", "-")}-{vn}')
        check(f'{vn}: Serra, Serra Residences and The Serra Residences find the same project', all(v == ['map/#p=the-serra-residences'] for v in found.values()), found)
        t, ids = rask('the serra residences')
        check(f'{vn}: it is a simple result: name, status, no sales yet, View on Map', 'The Serra Residences' in t and 'New launch' in t and 'No sales recorded yet' in t and 'View on Map' in t, t)
        check(f'{vn}: no dead end and no invented price', 'No transactions found' not in t and re.search(r'\$\s?\d', t) is None, t)
        pg.click('#res button[data-launch]'); pg.wait_for_function("location.pathname.endsWith('/research/map/')", timeout=6000); pg.wait_for_function("window.KPT_MAP_APP && window.KPT_MAP_APP.evReady", timeout=15000); pg.wait_for_timeout(600)
        check(f'{vn}: View on Map opens the project on the Map', 'Serra' in hdr(pg) and circles(pg) >= 1, hdr(pg))
        t, ids = rask('chencharu'); check(f'{vn}: a GLS site is found by alias too', ids == ['map/#p=chencharu-close'] and 'Awarded HDB site' in t, (t, ids))
        t, ids = rask('hougang central'); check(f'{vn}: Hougang Central keeps its own-site card, with no second row for the same project', 'Has its own site' in t and 'No sales recorded yet' not in t and 'No transactions found' not in t, (t, ids))
        t, ids = rask('reserve residences'); check(f'{vn}: a project with sales is still found with its sales', any(i and 'launch' not in i and '/' not in i for i in ids), (t, ids))
        t, ids = rask('thomson reserve'); check(f'{vn}: a launch with its own site keeps its existing card, not a second row', 'Has its own site' in t and not any('map/#p=thomson-reserve' in i for i in ids) and 'No sales recorded yet' not in t, (t, ids))
        t, ids = rask('thomson three'); check(f'{vn}: an ordinary development is unchanged and shows no launch group', 'thomson-three' in ids and 'No sales recorded yet' not in t, (t, ids))
        t, ids = rask('zzzzqq'); check(f'{vn}: a name that is nowhere still says so', 'No transactions found' in t, t)
        t, ids = rask('peck hay'); check(f'{vn}: an awarded site with no name', any('peck-hay' in i for i in ids) and 'no project name' in t.lower(), (t, ids))
        check(f'{vn}: no page errors', not errs, errs); ctx.close()
    print(f'\n{ok} passed, {fail} failed')
finally:
    srv.terminate()
sys.exit(1 if fail else 0)
