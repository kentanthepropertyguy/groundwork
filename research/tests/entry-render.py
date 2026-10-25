"""Research entry: two choices, one search, answer-first overview, fresh on every choice (desktop + phone).
Serves the site itself; run from the repo root: python3 research/tests/entry-render.py [shots-dir]"""
import sys, os, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.getcwd(); SH = sys.argv[1] if len(sys.argv) > 1 else None
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class Q(H.func):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
B = f'http://127.0.0.1:{PORT}/research/index.html'
ok = bad = 0
def chk(name, cond, info=None):
    global ok, bad
    if cond: ok += 1; print('  ok  ', name)
    else: bad += 1; print('  FAIL', name, info)
def shot(pg, n):
    if SH: os.makedirs(SH, exist_ok=True); pg.screenshot(path=f'{SH}/{n}.png', full_page=False)
def pick(pg, q, sel):
    pg.fill('#q', q); pg.wait_for_selector('.kpr-results ' + sel, timeout=15000); pg.click('.kpr-results ' + sel)
def fresh(b, vp):
    c = b.new_context(viewport=vp, has_touch=vp['width'] < 500); pg = c.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(B); pg.wait_for_selector('#q'); return pg, errs
with sync_playwright() as p:
    b = p.chromium.launch()
    for tag, vp in (('desktop', {'width': 1280, 'height': 900}), ('phone', {'width': 390, 'height': 844})):
        print(tag); pg, errs = fresh(b, vp)
        chk('two choices only', pg.locator('.gw-ropt').count() == 2)
        chk('subtitle exact', 'HDB, condo or landed — prices, past sales, rents and comparisons.' in pg.inner_text('#opt-dev') or pg.inner_html('#opt-dev').count('HDB, condo or landed') == 1)
        chk('old copy gone', 'entries stay when you switch' not in pg.inner_text('body').lower())
        shot(pg, f'{tag}-1-entry')
        pick(pg, 'Jadescape', '[data-id="jadescape"]'); pg.wait_for_selector('#rwOver [data-ov="dev"]')
        t = pg.inner_text('#rwOver'); chk('Jadescape overview: bedroom rows with total price', 'Jadescape' in t and '-bedroom' in t and '$' in t)
        chk('View Full Research is a link to #/p/jadescape', pg.get_attribute('#rwOver [data-ov-full]', 'href') == '#/p/jadescape')
        chk('feature list names transaction history and Market Pulse', 'Actual transaction history' in t and 'Market Pulse' in t and 'Asking-price checks' in t)
        shot(pg, f'{tag}-2-condo')
        pg.click('#opt-dev'); pg.wait_for_timeout(400)
        chk('re-click same choice: fresh', pg.input_value('#q') == '' and pg.locator('#rwOver .gw-ov').count() == 0)
        pick(pg, '575742', '[data-id="jadescape"]'); pg.wait_for_selector('#rwOver [data-ov="dev"]'); chk('575742 -> Jadescape', 'Jadescape' in pg.inner_text('#rwOver h2'))
        pg.fill('#q', 'treasure at tamp'); pg.wait_for_selector('.kpr-results [data-id="treasure-at-tampines"]'); chk('partial name finds Treasure at Tampines', True)
        pick(pg, '550500', '[data-hdb]'); pg.wait_for_selector('#rwOver [data-ov="hdb"]')
        t = pg.inner_text('#rwOver'); chk('550500 -> HDB Blk 500 Serangoon North Avenue 4 with flat types', 'Blk 500' in t and 'Serangoon North Avenue 4' in t and '-room' in t or 'Executive' in t)
        chk('HDB full report link keeps the dedicated page', pg.get_attribute('#rwOver [data-ov-full]', 'href').startswith('#/hdb/serangoon/500/'))
        shot(pg, f'{tag}-3-hdb')
        pg.click('#opt-budget'); pg.wait_for_selector('#ws-budget:not([hidden])', timeout=15000)
        chk('switching to budget clears the property result', pg.locator('#rwOver .gw-ov').count() == 0)
        pg.click('#opt-dev'); pg.wait_for_timeout(400); chk('back to property: fresh', pg.input_value('#q') == '' and pg.locator('#rwOver .gw-ov').count() == 0)
        pg.goto(B + '#/p/jadescape'); pg.wait_for_timeout(2500); chk('direct #/p link opens the full report, no overview', pg.locator('.gw-ov').count() == 0 and '#/p/jadescape' in pg.url)
        pg.goto(B); pg.wait_for_selector('#q'); pick(pg, 'Jadescape', '[data-id="jadescape"]'); pg.wait_for_selector('#rwOver [data-ov-full]'); pg.click('#rwOver [data-ov-full]'); pg.wait_for_timeout(1500)
        chk('View Full Research opens the report', '#/p/jadescape' in pg.url); pg.go_back(); pg.wait_for_timeout(1500); chk('Back returns to the overview', pg.locator('#rwOver .gw-ov').count() == 1)
        pg.goto(B); pg.wait_for_selector('#q'); pick(pg, 'aida', 'button[data-street]'); pg.wait_for_selector('#rwLanded [data-vx-ltypes] button', timeout=20000)
        chk('landed road: sales panel shown in place, no property-specific typical price overview', pg.locator('#rwOver .gw-ov').count() == 0 and pg.locator('#rwLanded .gw-vx-pcout').count() == 1)
        # a development that shows sizes (no reliable bedroom types): the tapped size row is the active size when the full report opens
        pg.goto(B); pg.wait_for_selector('#q'); pick(pg, 'the continuum', '[data-id="the-continuum"]'); pg.wait_for_selector('#rwOver [data-gwr-bin]', timeout=20000)
        rows = pg.locator('#rwOver [data-gwr-bin]'); v = rows.nth(1).get_attribute('data-gwr-bin'); rows.nth(1).click(); pg.wait_for_function("location.hash === '#/p/the-continuum'", timeout=15000); pg.wait_for_selector('.lg-back', timeout=15000); pg.wait_for_timeout(800)
        on = pg.evaluate("[...document.querySelectorAll('[data-gwr-bin][aria-pressed=true]')].map(b => b.dataset.gwrBin)")
        chk('size row tapped in the overview is the active size in Full Research', on == [v], (v, on))
        pg.goto(B); pg.wait_for_selector('#q'); pick(pg, 'Jadescape', '[data-id="jadescape"]'); pg.wait_for_selector('#rwOver [data-gwr-bed]', timeout=20000)
        bd = pg.locator('#rwOver [data-gwr-bed]').nth(1).get_attribute('data-gwr-bed'); pg.locator('#rwOver [data-gwr-bed]').nth(1).click(); pg.wait_for_function("location.hash === '#/p/jadescape'", timeout=15000); pg.wait_for_selector('.lg-back', timeout=15000); pg.wait_for_timeout(800)
        onb = pg.evaluate("[...document.querySelectorAll('[data-bed][aria-pressed=true],[data-gwr-bed][aria-pressed=true]')].map(b => b.dataset.bed || b.dataset.gwrBed)")
        chk('bedroom row tapped in the overview is still the active bedroom type', bd in onb, (bd, onb))
        chk('no page errors', not errs); pg.context.close()
    b.close()
srv.shutdown(); print(f'{ok} passed, {bad} failed'); sys.exit(1 if bad else 0)
