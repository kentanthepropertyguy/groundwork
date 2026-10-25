"""Consumer Experience V2.1 (26 Oct 2026): fewer portraits and promotions, a calculator's result panel says what it will show before the first
result, and no external New Launches link in the main journey. Desktop and phone. Run from the repo root: python3 research/tests/v21-render.py"""
import sys, os, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.getcwd()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); B = 'http://127.0.0.1:%d' % srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
ok = bad = 0
def chk(name, cond, info=None):
    global ok, bad
    if cond: ok += 1; print('  ok  ', name)
    else: bad += 1; print('  FAIL', name, info)
PORTRAIT = "[...document.querySelectorAll('img')].filter(i => /ken-(portrait|circle)/.test(i.src) && i.offsetParent).length"
CALCS = {'stamp-duty': 'Total stamp duty', 'tdsr': 'Indicative maximum loan', 'msr': 'Indicative maximum loan', 'mortgage': 'Monthly instalment', 'sale-proceeds': 'Cash in hand after costs', 'ssd': 'Seller’s Stamp Duty'}
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('desktop', {'width': 1280, 'height': 900}), ('phone', {'width': 390, 'height': 844})):
        print('\n==', vn); c = br.new_context(viewport=vp, has_touch=vn == 'phone'); pg = c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for path, n in (('/', 0), ('/journey/', 0), ('/journey/worth/', 0), ('/tools/', 0), ('/tools/planner/', 0), ('/tools/payment-planner/', 0), ('/tools/stamp-duty/', 0), ('/research/', 0), ('/privacy/', 0)):
            pg.goto(B + path); pg.wait_for_timeout(900)
            chk(f'{vn}: {path}: {n} portrait(s)', pg.evaluate(PORTRAIT) == n, pg.evaluate(PORTRAIT))
            chk(f'{vn}: {path}: no external New Launches link anywhere on the page', pg.locator('a[href*="kentanthepropertyguy.com/#developments"]').count() == 0)
            chk(f'{vn}: {path}: the footer keeps the credentials', 'CEA R007903D' in pg.inner_text('.gw-foot') and 'L3008899K' in pg.inner_text('.gw-foot'))
            names = pg.inner_text('body').count('Ken Tan'); want = 2 if path == '/privacy/' else 1   # the privacy notice names Ken as the one who handles enquiries
            chk(f'{vn}: {path}: the name appears {want}x (footer credentials), no TikTok badge, no other-sites line', names == want and pg.locator('.gw-live').count() == 0 and pg.locator('.gw-fo').count() == 0, names)
        pg.goto(B + '/'); pg.wait_for_timeout(600)
        chk(vn + ': homepage: no biography band; the data line has no photo or name', pg.locator('.gw-ken').count() == 0 and 'Ken' not in pg.inner_text('.gw-sig'))
        chk(vn + ': the header keeps a small Ask Ken action', pg.locator('.gw-nav a:has-text("Ask Ken"), .gw-nav button:has-text("Ask Ken")').count() >= 1)
        pg.goto(B + '/research/#/p/jadescape'); pg.wait_for_selector('#next', timeout=20000); pg.wait_for_timeout(600)
        chk(vn + ': research report: no portrait', pg.evaluate(PORTRAIT) == 0)
        chk(vn + ': research report: budget plus ONE quiet Ask Ken card holding both messages', pg.locator('#next > *').count() == 2 and pg.locator('#next #wa').count() == 1 and pg.locator('#next #waOwn').count() == 1 and pg.locator('#next .lg-btn.wa').count() == 0 and pg.locator('[data-lg-ov] a:has-text("Ask Ken")').count() == 0)
        for t, words in CALCS.items():
            pg.goto(B + '/tools/' + t + '/'); pg.wait_for_selector('[data-ready]', timeout=15000)
            txt = pg.inner_text('[data-out]')
            chk(f'{vn}: {t}: before a result the panel previews its lines with a dash for each figure, and says what to enter', pg.locator('[data-ready] .gw-ready-rows li').count() >= 2 and '—' in txt and 'Enter ' in txt and not any(ch.isdigit() for ch in txt), txt)
        pg.goto(B + '/tools/stamp-duty/'); pg.wait_for_selector('[data-ready]'); pg.fill('[data-k="price"]', '1,500,000'); pg.wait_for_timeout(600)
        chk(vn + ': stamp duty: with a price, the result replaces the guidance', pg.locator('[data-ready]').count() == 0 and '$' in pg.inner_text('[data-out]'))
        pg.goto(B + '/tools/what-can-i-buy/'); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2000000'); pg.click('button:has-text("Show developments")'); pg.wait_for_selector('#beyond:not([hidden])', timeout=20000)
        chk(vn + ': Budget Search: one quiet Ask Ken line, no portrait or biography', pg.evaluate(PORTRAIT) == 0 and "I'm Ken" not in pg.inner_text('#beyond') and pg.locator('#beyond a').count() == 1)
        c2 = br.new_context(viewport=vp); p2 = c2.new_page(); p2.goto(B + '/'); p2.wait_for_timeout(500); p2.fill('.gw-sx-home input', 'new launch'); p2.wait_for_timeout(800)
        chk(vn + ': searching "new launch" offers the Map, inside Groundwork', p2.locator('a[href*="research/map/"]:has-text("New launches on the Map")').count() >= 1 and p2.locator('[role=listbox] a[href*="kentanthepropertyguy.com/#developments"]').count() == 0); c2.close()
        chk(vn + ': no page errors', not errs, errs[:2]); c.close()
    br.close()
srv.shutdown(); print('\n%d passed, %d failed' % (ok, bad)); sys.exit(1 if bad else 0)
