# python3 research/tests/mobile-render.py [base_url]   (needs: pip install playwright; playwright install chromium)
# Mobile (390px) checks for the single-project page: the answer is on the first screen, evidence is collapsed, nothing overflows sideways, evidence opens and works.
import sys
from playwright.sync_api import sync_playwright
BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8771').rstrip('/') + '/research/index.html'
CASES = [('strong recent', '#/p/thomson-grand', None, 'around $'), ('thin recent', '#/p/bartley-ridge', '550', 'Treat this as a reference.'),
         ('older only', '#/p/3-at-phillips', None, 'none in the last 12 months'), ('no size evidence', '#/p/thomson-grand', '2600', 'none recorded around this size')]
fails = []
def check(ok, msg):
    print(('  ok   ' if ok else '  FAIL ') + msg)
    if not ok: fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, h, size, expect in CASES:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        if size: ctx.add_init_script("sessionStorage.setItem('kpt.research.size', '%s')" % size)
        pg.goto(BASE + h); pg.wait_for_selector('#answer', timeout=8000); pg.wait_for_timeout(300)
        head = pg.locator('#answer .kpr-a-hero').bounding_box(); cmp_ = pg.locator('#cmp').bounding_box()
        check(expect in pg.inner_text('#answer'), name + ': answer text present')
        check(head is not None and head['y'] + head['height'] < 844, name + ': headline answer is visible on the first screen (no scrolling)')
        check(cmp_ is not None and cmp_['y'] < 844 * 1.6, name + ': "Compare another project" is within about one and a half screens')
        check(pg.locator('#sizeIn').is_visible(), name + ': size input is visible by default (not behind a toggle)')
        check(not pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth+1"), name + ': no sideways page scroll')
        check(not pg.evaluate("document.getElementById('evidence').open"), name + ': evidence collapsed by default')
        pg.locator('#evidence > summary').click(); pg.wait_for_timeout(300)
        check(pg.evaluate("document.getElementById('evidence').open") and pg.locator('#evidence .kpr-rows').count() > 0 or name == 'no size evidence', name + ': "See why" opens the evidence')
        check(not pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth+1"), name + ': no sideways scroll with evidence open')
        if pg.locator('#evidence .kpr-row').count():
            pg.locator('#evidence .kpr-row').first.click(); pg.wait_for_timeout(400)
            check(pg.evaluate("document.getElementById('evidence').open"), name + ': choosing a size inside the evidence keeps it open')
        check(not errs, name + ': no console errors ' + str(errs[:1]))
        hy = lambda sel: pg.locator(sel).bounding_box()['y']
        check(hy('#answer') < hy('#evidence') < hy('#wa'), name + ': order is answer, then How KPT analysed this, then the Ken handoff')
        ctx.close()
    # desktop (1280): same simplified hierarchy, hero number on one line, no overflow, two-column answer
    for name, h, size in [('desktop strong', '#/p/thomson-grand', None), ('desktop thin', '#/p/bartley-ridge', '550')]:
        ctx = b.new_context(viewport={'width': 1280, 'height': 900}); pg = ctx.new_page()
        if size: ctx.add_init_script("sessionStorage.setItem('kpt.research.size', '%s')" % size)
        pg.goto(BASE + h); pg.wait_for_selector('#answer', timeout=8000); pg.wait_for_timeout(300)
        hero = pg.locator('#answer .kpr-a-hero').bounding_box(); viz = pg.locator('#answer .kpr-a-viz').bounding_box(); main = pg.locator('#answer .kpr-a-main').bounding_box()
        check(not pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth+1"), name + ': no sideways scroll')
        check(hero['height'] < 90, name + ': hero number stays on one line')
        check(viz['x'] > main['x'] + main['width'] - 2, name + ': answer and visual sit side by side')
        check(pg.locator('#answer').bounding_box()['width'] <= 1000, name + ': content width tightened to 1000px')
        check(not pg.evaluate("document.getElementById('evidence').open"), name + ': evidence collapsed by default')
        ctx.close()
    b.close()
print('\n%d failed' % len(fails)); sys.exit(1 if fails else 0)
