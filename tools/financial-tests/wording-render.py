import os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""Package 4 wording pass: guidance shows only when it applies, and the answer is short with its figures in tiles.
Run from the site folder: python3 tools/financial-tests/wording-render.py"""
SITE = pathlib.Path(__file__).resolve().parents[2]
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082')
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
ok = fail = 0
def check(n, c, i=''):
    global ok, fail
    if c: ok += 1; print('  ok  ', n)
    else: fail += 1; print('  FAIL', n, i)
def settle(pg): pg.wait_for_function('window.__paSettled && window.__paSettled()'); pg.wait_for_timeout(300)
def page(br, kw):
    ctx = br.new_context(**kw); pg = ctx.new_page(); pg.set_default_timeout(8000); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e) + ' @' + pg.url))
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    return ctx, pg, errs
def vis(pg, text): return pg.evaluate("(t)=>[...document.querySelectorAll('small,p,span')].some(e=>e.offsetParent!==null&&e.children.length===0&&e.textContent.includes(t))", text)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1280, 'height': 1000})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        # (FE V3, 25 Oct 2026: What can I afford? and the Payment timeline were rebuilt; their checks are in fin3-render.py and fin3-connect-render.py)
        # ---- HDB and EC loan limit (V3.4: on How much can I borrow?, HDB chip; the old address opens it) ----
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/msr/'); pg.wait_for_selector('[data-f3="borrow"]'); pg.wait_for_timeout(300)
        def inc(v): pg.fill('[data-k="p.0.fixed"]', v); pg.wait_for_timeout(500)
        def age(v): pg.evaluate("window.__f3OpenChip('age','p.0.age')"); pg.fill('[data-chp="age"] [data-k="p.0.age"]', v); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
        def hh(v): pg.evaluate("window.__f3OpenChip('bkind')"); pg.locator('[data-optl="bkind"] .f3-opt', has_text=re.compile('^' + v)).click(); pg.evaluate("window.__f3OpenChip(null)"); pg.wait_for_timeout(400)
        def out(): return pg.inner_text('[data-out]')
        def elig(): e = pg.query_selector('[data-out] [data-elig]'); return e.get_attribute('data-elig') if e else ''
        inc('9,000'); age('35')
        pg.evaluate("window.__f3OpenChip('bkind')"); ol = pg.inner_text('[data-optl="bkind"]'); pg.evaluate("window.__f3OpenChip(null)")
        check(vn + ': HDB loan limit: the household choices name HDB’s ceiling each ($16,000, $24,000, $8,000 a month)', all(x in ol for x in ['$16,000 a month', '$24,000 a month', '$8,000 a month']), ol[:300])
        check(vn + ': HDB loan limit: Family at $9,000: the loan leads, no eligibility line', elig() == '' and 'HDB may lend about' in out())
        hh('Single, 35'); so = out()
        check(vn + ': HDB loan limit: Single, $9,000 against the $8,000 ceiling: eligibility leads, not the loan', elig() == 'ceiling' and '$8,000' in so and 'singles' in so, so[:300])
        check(vn + ': HDB loan limit: the loan is kept, labelled as if eligible, with the price it supports', 'HDB could lend, if eligible' in so and '$569,000' in so and 'Home price this loan supports' in so, so[:400])
        age('32'); ao = out()
        check(vn + ': HDB loan limit: Single at 32 leads with the age requirement', elig() == 'age' and 'Singles must be 35 or older' in ao, ao[:300])
        check(vn + ': HDB loan limit: it names the age entered and refers to HFE', 'age entered is 32' in ao and 'HFE' in ao, ao[:420])
        hh('Family'); check(vn + ': HDB loan limit: Family at 32 is unchanged (the loan leads)', elig() == '' and 'HDB may lend about' in out())
        age('35'); hh('Extended family'); eo = out()
        check(vn + ': HDB loan limit: Extended at $9,000 is under its $24,000 ceiling, so the loan leads', elig() == '', eo[:200])
        inc('25,000'); eo = out()
        check(vn + ': HDB loan limit: Extended at $25,000 is over $24,000: eligibility leads', elig() == 'ceiling' and '$24,000' in eo and 'extended families' in eo, eo[:300])
        hh('Family'); fo = out()
        check(vn + ': HDB loan limit: Family at $25,000 is over $16,000: eligibility leads', elig() == 'ceiling' and '$16,000' in fo and 'families' in fo, fo[:300])
        inc('16,000'); fo = out()
        check(vn + ': HDB loan limit: Family at exactly $16,000 is not over the ceiling: the loan leads', elig() == '' and 'HDB may lend about' in fo, fo[:160])
        inc('25,000'); pg.evaluate("window.__f3OpenChip('bkind')"); pg.click('[data-optl="bkind"] .f3-opt:nth-child(3)'); pg.wait_for_timeout(500)
        check(vn + ': HDB loan limit: an HDB flat with a bank loan has no HDB ceiling, so the loan leads', elig() == '' and 'The bank may lend about' in out())
        pg.evaluate("window.__f3OpenChip('bkind')"); pg.click('[data-optl="bkind"] .f3-opt:nth-child(2)'); pg.wait_for_timeout(500); inc('9,000')
        why = pg.evaluate("document.querySelector('[data-why-out]').textContent")
        check(vn + ': HDB loan limit: How it is worked out names the 30% limit and HDB’s 65 cut-off', '30% of income' in why and 'Tenure' in why, why[:300])
        check(vn + ': HDB loan limit: no page overflow', pg.evaluate("()=>document.documentElement.scrollWidth-document.documentElement.clientWidth") <= 1)
        check(vn + ': HDB loan limit: no script errors', not errs, errs)
        ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'wording-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
