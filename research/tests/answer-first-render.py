import os, pathlib, re, socket, subprocess, sys, time
sys_path_dir = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, sys_path_dir)
from sizepick import pick_dominant, forget_size
from playwright.sync_api import sync_playwright
"""Browser checks for the answer-first Research pages (desktop and phone). Run from the site folder:  python3 research/tests/answer-first-render.py
Class, name, price and the sample-size limit must sit on the first screen; the limits stay next to the number but in few words."""
SITE = pathlib.Path(__file__).resolve().parents[2]
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
ok = fail = 0
def check(n, c, i=''):
    global ok, fail
    if c: ok += 1; print('  ok  ', n)
    else: fail += 1; print('  FAIL', n, i)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
        base = f'http://127.0.0.1:{P}/research/'
        pg.goto(base); pg.wait_for_selector('#q', timeout=15000)
        pg.type('#q', 'horizon green', delay=5)
        pg.wait_for_selector('#res [role=option], #res button, #res a', timeout=10000)
        pg.click('#res >> text=Horizon Green >> nth=0'); pg.wait_for_url('**/research/#/p/horizon-green*', timeout=10000)   # 25 Oct 2026: Research opens the full analysis, never the Map first
        check(vn+': search -> a development opens its full analysis (not the Map)', '/research/#/p/horizon-green' in pg.url and '/map/' not in pg.url, pg.url)
        pg.goto(base + '#/p/horizon-green'); forget_size(pg); pg.reload(); pg.wait_for_selector('#sizeSel', state='attached', timeout=10000)
        check(vn+': with no size chosen, no price is shown for the development, only the question and an at-a-glance summary', pg.query_selector('.lg-ans-v') is None and pg.query_selector('[data-lg-ov]') is not None and 'What size home are you looking at?' in pg.inner_text('#lgPick'))
        pick_dominant(pg); pg.wait_for_selector('[data-lg-ans]', timeout=10000)
        check(vn+': search -> Horizon Green page shows class chip, name and answer', pg.inner_text('[data-lg-cls]') != '' and 'Horizon Green' in pg.inner_text('h1') and pg.query_selector('.lg-ans-v'))
        top = pg.evaluate("[...document.querySelectorAll('.lg-cls,.lg-name,.lg-ans-v,.lg-pill,[data-lg-basis]')].map(e => Math.round(e.getBoundingClientRect().bottom))")
        check(vn+': class, name, price and sample-size line all sit inside the first screen ('+str(max(top))+'px)', max(top) <= (844 if vn == 'phone' else 900), top)
        pill = pg.inner_text('.lg-pill'); fresh = pg.inner_text('[data-lg-fresh]'); basis = pg.inner_text('[data-lg-basis]') if pg.query_selector('[data-lg-basis]') else ''
        check(vn+': the low-sample warning is plain buyer language: how many comparable sales, and to interpret with care ('+str(len(pill))+' characters)', len(pill) <= 70 and re.fullmatch(r'Based on only \d+ comparable resales?\. Interpret with care\.', pill), pill)
        pg.click('#evidence summary'); rule = pg.inner_text('[data-lg-rule]')
        check(vn+': the detail stays one tap away in "How we worked this out": the rule for a typical price and this size\'s sample', re.search(r'needs at least \d+ resales of the same size across at least \d+ months', rule) and re.search(r'\d+ resales? in \d+ months?', rule), rule)
        check(vn+': the data note keeps the period, the retrieval date and the incomplete-month limit in under 130 characters ('+str(len(fresh))+')', len(fresh) <= 130 and 'retrieved' in fresh and 'may be incomplete' in fresh, fresh)
        check(vn+': the price basis stays beside the figure', 'not a valuation' in basis.lower() or 'not a valuation' in pill.lower(), basis)
        h = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)")
        check(vn+': heading size '+str(h), h <= 46)
        check(vn+': no sideways scroll', pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        # size chip changes the answer in place
        before = pg.inner_text('.lg-ans-v'); opts = pg.eval_on_selector_all('#sizeSel option', 'e => e.map(x => x.value)')
        other = [o for o in opts if o and o != pg.input_value('#sizeSel')]
        if other: pg.select_option('#sizeSel', other[0]); pg.wait_for_timeout(300)
        check(vn+': choosing another size updates the answer in place', not other or pg.inner_text('.lg-ans-v') != before)
        # method disclosure present and collapsed by default
        d = pg.query_selector('details:has-text("How we worked this out")'); check(vn+': method sits in a disclosure', d is not None and not d.get_attribute('open'))
        # compare journey
        pg.goto(base + '#/compare/jadescape/thomson-three'); pg.wait_for_selector('.lg-hero', timeout=10000)
        check(vn+': compare page renders', 'Jadescape' in pg.inner_text('h1') and 'Thomson Three' in pg.inner_text('h1'))
        # EC and condo pages
        for slug, cls in [('hundred-palms-residences','ec'), ('jadescape','condo'), ('horizon-green','cluster')]:
            pg.goto(base + '#/p/' + slug); pg.wait_for_selector('[data-lg-cls]', timeout=10000)
            check(vn+': '+slug+' is classed '+cls, pg.get_attribute('[data-lg-cls]', 'data-lg-cls') == cls and pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        check(vn+': no script errors', not errs, errs[:2]); ctx.close()
finally: srv.terminate()
print(ok, 'passed', fail, 'failed')
