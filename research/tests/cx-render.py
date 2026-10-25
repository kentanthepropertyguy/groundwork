"""Consumer Experience V2 (26 Oct 2026): the report's shortcut row, the phone's first 5 sales, folded fine print and rents by size,
and the Planner's empty page and monthly amounts. Presentation only; desktop and phone. Run from the repo root: python3 research/tests/cx-render.py [shots]"""
import sys, os, threading, http.server, functools
from playwright.sync_api import sync_playwright
ROOT = os.getcwd(); SH = sys.argv[1] if len(sys.argv) > 1 else None
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); B = 'http://127.0.0.1:%d' % srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
ok = bad = 0
def chk(name, cond, info=None):
    global ok, bad
    if cond: ok += 1; print('  ok  ', name)
    else: bad += 1; print('  FAIL', name, info)
def report(pg, id_='jadescape'):
    pg.goto(B + '/research/#/p/' + id_); pg.wait_for_selector('.lg-back', timeout=20000); pg.wait_for_selector('#lgTx tbody tr', timeout=20000); pg.wait_for_timeout(600)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('desktop', {'width': 1280, 'height': 900}), ('phone', {'width': 390, 'height': 844})):
        mob = vn == 'phone'; print('\n== Research report,', vn)
        c = br.new_context(viewport=vp, has_touch=mob); pg = c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        report(pg)
        rows = pg.locator('#lgTx tbody tr').count()
        chk(vn + ': the sales list starts with ' + ('5' if mob else '15') + ' sales', rows == (5 if mob else 15), rows)
        pg.click('#lgTx [data-gwr-more]'); pg.wait_for_timeout(300)
        chk(vn + ': Show more adds 15', pg.locator('#lgTx tbody tr').count() == rows + 15, pg.locator('#lgTx tbody tr').count())
        pg.select_option('#lgTx [data-gwr-f="sort"]', 'high'); pg.wait_for_timeout(300)
        chk(vn + ': a filter or order change starts again at the first page', pg.locator('#lgTx tbody tr').count() == rows)
        chk(vn + ': every filter is still offered', pg.locator('#lgTx [data-gwr-f]').count() == 5)
        bar = pg.inner_text('[data-lg-jump-bar]')
        chk(vn + ': one shortcut row, naming what is on show', pg.locator('[data-lg-jump-bar]').count() == 1 and 'All home types' in bar and ('Jadescape' in bar or mob))
        chk(vn + ': shortcuts only for parts on the page', all(x in bar for x in ('Prices', 'Sales history', 'Rents', 'Price check', 'Compare')) and 'Market Pulse' not in bar, bar)
        chk(vn + ': the shortcut row is buttons, never section links', pg.locator('[data-lg-jump-bar] a').count() == 0)
        h0 = pg.evaluate('history.length'); u0 = pg.url
        pg.click('.lg-jl:has-text("Rents")'); pg.wait_for_timeout(900)
        top = pg.evaluate("document.getElementById('lgRent').getBoundingClientRect().top")
        chk(vn + ': a shortcut goes to its section, below the header and the row', 0 < top < 200, top)
        chk(vn + ': a shortcut leaves the address and history alone', pg.url == u0 and pg.evaluate('history.length') == h0)
        st = pg.evaluate("getComputedStyle(document.querySelector('.lg-jump')).position"); bt = pg.evaluate("document.querySelector('.lg-jump').getBoundingClientRect().top")
        chk(vn + ': the row stays in view under the header while reading', st == 'sticky' and 0 <= bt < 90, (st, bt))
        if SH: os.makedirs(SH, exist_ok=True); pg.screenshot(path=SH + '/cx-' + vn + '-rents.png')
        chk(vn + ': rents by size fold away when every type has a rent of its own', pg.locator('#lgRent details[data-gwrent-sizes]:not([open])').count() == 1)
        chk(vn + ': the method fine print opens on request; its first line and the licence line stay', pg.locator('#lgRent .lg-finedet:not([open])').count() == 1 and 'Summaries only' in pg.inner_text('#lgRent') and 'Singapore Open Data Licence' in pg.inner_text('#lgRent'))
        pg.click('#lgRent .lg-finedet summary'); pg.wait_for_timeout(200)
        chk(vn + ': opened, the full method is there', 'at least 10 contracts in each year' in pg.inner_text('#lgRent'))
        pg.click('.lg-jl:has-text("Price check")'); pg.wait_for_timeout(900)
        chk(vn + ': Price check opens the asking-price check', pg.is_visible('#lgAsk') and pg.get_attribute('[data-lg-ask]', 'aria-expanded') == 'true')
        pg.click('.lg-jl:has-text("Price check")'); pg.wait_for_timeout(300)
        chk(vn + ': and a second tap keeps it open', pg.is_visible('#lgAsk'))
        # choose a type: the row names it, Market Pulse joins, the sales start on it
        report(pg); pg.click('[data-bed="3"]'); pg.wait_for_selector('#lgPulse', timeout=15000); pg.wait_for_timeout(600)
        bar = pg.inner_text('[data-lg-jump-bar]')
        chk(vn + ': the row names the chosen home type and offers Market Pulse', '3-bedroom' in bar and 'Market Pulse' in bar, bar)
        chk(vn + ': the sales list starts on that type', pg.locator('#lgTx [data-gwr-f="bed"]').input_value() == '3')
        pg.click('.lg-jctx'); pg.wait_for_timeout(900)
        chk(vn + ': the named type takes you back to the chooser', -5 < pg.evaluate("document.getElementById('lgPick').getBoundingClientRect().top") < 220)
        pg.goto(B + '/research/#/p/jadescape'); pg.wait_for_timeout(300); pg.goto(B + '/research/#/compare/jadescape/thomson-three'); pg.wait_for_timeout(1500); pg.go_back(); pg.wait_for_selector('.lg-back', timeout=15000)
        chk(vn + ': Back still returns to the report', '#/p/jadescape' in pg.url)
        pg.goto(B + '/research/#/p/the-continuum'); pg.wait_for_selector('#lgTypes', timeout=20000); pg.wait_for_timeout(600)
        chk(vn + ': without bedroom types the row says "All sizes"', 'All sizes' in pg.inner_text('[data-lg-jump-bar]'))
        chk(vn + ': the page is never wider than the screen', pg.evaluate('document.documentElement.scrollWidth') <= vp['width'], pg.evaluate('document.documentElement.scrollWidth'))
        chk(vn + ': no page errors', not errs, errs[:2]); c.close()

        print('\n== Planner,', vn)
        c = br.new_context(viewport=vp, has_touch=mob); pg = c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-k="buyers.0.age"]'); pg.wait_for_timeout(600)
        chk(vn + ': an empty page keeps the schedule fold and Clear all (both work without an answer)', pg.is_visible('[data-ps-d]') and pg.locator('[data-pa] [data-gw-clear-all]').is_visible())
        chk(vn + ': the age and income are on the first screen', pg.locator('[data-k="buyers.0.fixed"]').evaluate('e=>e.getBoundingClientRect().bottom') < vp['height'])
        chk(vn + ': the monthly amounts open on request', not pg.is_visible('[data-k="saveMo"]') and pg.is_visible('[data-month-add]'))
        pg.fill('[data-k="buyers.0.age"]', '35'); pg.fill('[data-k="buyers.0.fixed"]', '10,000'); pg.click('[data-k="owns"] [data-v="none"]'); pg.fill('[data-k="cash"]', '300,000'); pg.fill('[data-k="cpf"]', '150,000'); pg.wait_for_timeout(1200)
        chk(vn + ': with figures, the answer and the schedule fold are there', '$1,554,000' in pg.inner_text('[data-head]') and pg.is_visible('[data-sched-host]'), pg.inner_text('[data-head]')[:80])
        pg.click('[data-focus="saveMo"]'); pg.wait_for_timeout(500)
        chk(vn + ': "Add monthly amounts" opens them and goes to Cash', pg.is_visible('[data-k="saveMo"]') and pg.evaluate("document.activeElement.dataset.k") == 'saveMo')
        pg.fill('[data-k="saveMo"]', '3,000'); pg.fill('[data-k="cpfMo"]', '2,000'); pg.wait_for_timeout(900)
        chk(vn + ': the payment dates are then checked (the engine is unchanged)', 'Not checked' not in pg.inner_text('[data-head]'))
        pg.reload(); pg.wait_for_selector('[data-k="saveMo"]', state='attached'); pg.wait_for_timeout(900)
        chk(vn + ': amounts entered stay, and show', pg.input_value('[data-k="saveMo"]') == '3,000' and pg.is_visible('[data-k="saveMo"]'))
        chk(vn + ': More options names the option date in words', pg.inner_text('[data-adj-sum]').startswith('Option date '))
        chk(vn + ': no page errors', not errs, errs[:2]); c.close()
    br.close()
srv.shutdown(); print('\n%d passed, %d failed' % (ok, bad)); sys.exit(1 if bad else 0)
