# python3 research/tests/mobile-render.py [base_url]   (needs: pip install playwright; playwright install chromium)
# Mobile (390px) checks for the single-project page: the answer is on the first screen, evidence is collapsed, nothing overflows sideways, evidence opens and works.
import sys, os, socket, subprocess, time, pathlib, atexit
from playwright.sync_api import sync_playwright
# Baseline clean-up (28 Oct 2026): with no base_url this suite expected a server already running on port 8771, which nothing started, so it never ran
# (connection refused). Like the other page suites, it now starts the site's own local server on a free port and stops it when done.
if len(sys.argv) > 1: ROOT_URL = sys.argv[1]
else:
    SITE = pathlib.Path(__file__).resolve().parents[2]
    _s = socket.socket(); _s.bind(('127.0.0.1', 0)); PORT = _s.getsockname()[1]; _s.close()
    _srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(PORT)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    atexit.register(_srv.terminate)
    for _ in range(100):
        try: socket.create_connection(('127.0.0.1', PORT), 0.2).close(); break
        except OSError: time.sleep(0.05)
    ROOT_URL = 'http://127.0.0.1:%d' % PORT
BASE = ROOT_URL.rstrip('/') + '/research/index.html'
# Baseline clean-up (28 Oct 2026): the checks below asserted the V1 project page (#answer with a hero number, size box shown by default, "Treat this as a
# reference." wording), which the approved bedroom-first page (V3.x, kpt-lg.js) replaced. They now assert the same promises on today's page: the name and
# the bedroom choice on the first screen, floor area one tap away ("Search by floor area" opens the size picker), evidence collapsed and opening, no sideways scroll, no errors,
# and, for a development with nothing recent, a plain explanation under its properly written name.
import re
CASES = [('strong recent', '#/p/thomson-grand', None), ('small size typed', '#/p/bartley-ridge', '550'), ('size with no sales', '#/p/thomson-grand', '2600')]
fails = []
def check(ok, msg):
    print(('  ok   ' if ok else '  FAIL ') + msg)
    if not ok: fails.append(msg)
sideways = "document.documentElement.scrollWidth>document.documentElement.clientWidth+1"
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, h, size in CASES:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, body=''))
        if size: ctx.add_init_script("sessionStorage.setItem('kpt.research.size', '%s')" % size)
        pg.goto(BASE + h); pg.wait_for_selector('#lgPick', timeout=8000); pg.wait_for_timeout(400)
        box = lambda sel: pg.locator(sel).first.bounding_box()
        h1, pick = box('h1'), box('#lgPick')
        check(h1 is not None and h1['y'] + h1['height'] < 844, name + ': the development name is on the first screen')
        check(pick is not None and pick['y'] < 844, name + ': the bedroom choice starts on the first screen')
        check(not pg.evaluate(sideways), name + ': no sideways page scroll')
        check(not pg.evaluate("document.getElementById('evidence').open"), name + ': evidence collapsed by default')
        if pg.locator('[data-gwb-area]').first.is_visible(): pg.locator('[data-gwb-area]').first.click(); pg.wait_for_timeout(250)
        check(pg.locator('#sizeSel').first.is_visible(), name + ': floor area is one tap away ("Search by floor area" opens the size picker; already open once a size is set)')
        check(pg.locator('#cmp').count() == 1 and box('#cmp') is not None, name + ': "Compare another development" is on the page')
        pg.locator('#evidence > summary').click(); pg.wait_for_timeout(300)
        check(pg.evaluate("document.getElementById('evidence').open"), name + ': the evidence opens')
        check(not pg.evaluate(sideways), name + ': no sideways scroll with the evidence open')
        check(not errs, name + ': no script errors ' + str(errs[:1]))
        ctx.close()
    # a development with nothing recent: a plain explanation, no figures, under its name as Groundwork writes it everywhere else
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '#/p/3-at-phillips'); pg.wait_for_selector('h1', timeout=8000); pg.wait_for_timeout(600)
    txt = pg.inner_text('#app')
    check('Nothing recent to analyse' in txt and 'we do not draw one' in txt, 'nothing recent (3@Phillips): a plain explanation and no figure')
    check(not pg.evaluate(sideways) and not errs, 'nothing recent (3@Phillips): no sideways scroll, no script errors')
    nm = pg.evaluate("document.querySelector('h1').textContent.trim()")
    check(nm == '3@Phillips', 'nothing recent (3@Phillips): the name is written as on every other page ("3@Phillips"), not in source capitals (got %r)' % nm)
    meta = pg.evaluate("(document.querySelector('h1').parentElement.textContent||'')")
    check('Phillips Avenue' in meta and 'PHILLIPS AVENUE' not in meta, 'nothing recent (3@Phillips): the street is written "Phillips Avenue", not in source capitals')
    ctx.close()
    b.close()
print('\n%d failed' % len(fails)); sys.exit(1 if fails else 0)
