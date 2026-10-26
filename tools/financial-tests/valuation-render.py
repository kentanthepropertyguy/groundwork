import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""Package 4 browser checks: the optional bank valuation (Planner price row, Payment timeline, HDB loan check) and rental income in the Planner.
Run from the site folder: python3 tools/financial-tests/valuation-render.py"""
SITE = pathlib.Path(__file__).resolve().parents[2]
SHOTS = os.environ.get('SHOTS')
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
def num(t): return int(re.sub(r'[^\d]', '', t) or 0)
def settle(pg): pg.wait_for_function('window.__paSettled && window.__paSettled()'); pg.wait_for_timeout(300)
def page(br, kw):
    ctx = br.new_context(**kw); pg = ctx.new_page(); pg.set_default_timeout(8000); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e) + ' @' + pg.url))
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    return ctx, pg, errs
def shot(pg, name):
    if SHOTS:   # one tall viewport instead of a stitched full-page capture, so the sticky header appears once, at the top
        w = pg.viewport_size['width']; h = pg.evaluate("()=>document.documentElement.scrollHeight"); pg.set_viewport_size({'width': w, 'height': h}); pg.wait_for_timeout(300)
        pg.screenshot(path=str(pathlib.Path(SHOTS) / (name + '.png'))); pg.set_viewport_size({'width': w, 'height': 1000 if w > 600 else 844})
def overflow(pg): return pg.evaluate("()=>document.documentElement.scrollWidth-document.documentElement.clientWidth")
def planner(pg, kind='completed', income='21,000', cash='300,000', cpf='300,000'):
    pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-pa]')
    pg.fill('[data-k="buyers.0.age"]', '35'); pg.fill('[data-k="buyers.0.fixed"]', income)
    pg.click('.pa-chips[data-k="owns"] [data-v="none"]'); pg.click('.pa-chips[data-k="kind"] [data-v="' + kind + '"]')
    pg.fill('[data-k="cash"]', cash); pg.fill('[data-k="cpf"]', cpf); pg.fill('[data-k="ratePct"]', '3'); pg.fill('[data-k="years"]', '30'); settle(pg)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1280, 'height': 1000})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        # (FE V3, 25 Oct 2026: What can I afford? and the Payment timeline were rebuilt; their checks are in fin3-render.py and fin3-connect-render.py)
        # ================= HDB loan limit: check a specific flat (V3.4: on How much can I borrow?, HDB chip; the old address opens it) =================
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/msr/'); pg.wait_for_selector('[data-f3="borrow"]'); pg.wait_for_timeout(300)
        pg.fill('[data-k="p.0.fixed"]', '9,000'); pg.evaluate("window.__f3OpenChip('age','p.0.age')"); pg.fill('[data-chp="age"] [data-k="p.0.age"]', '35'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
        det = pg.query_selector('[data-flatrow]')
        check(vn + ': “Check a specific flat” is on the HDB loan page and closed by default', det is not None and det.is_visible() and not det.evaluate('e=>e.open'))
        pg.click('[data-flatrow] > summary'); pg.fill('[data-k="flatPrice"]', '600,000'); pg.fill('[data-k="flatVal"]', '560,000'); pg.wait_for_timeout(700)
        fb = pg.inner_text('[data-flat-out]')
        check(vn + ': the flat block shows the loan on the lower value and the cash over valuation', '$40,000' in fb and 'over valuation' in fb and '$420,000' in fb, fb[:600])
        check(vn + ': HDB loan, $600,000 / $560,000: $180,000 beyond the loan, $40,000 cash only, $140,000 cash or CPF OA', re.search(r'To pay beyond the loan\s*\$180,000', fb) and re.search(r'Of which cash only\s*\$40,000', fb) and re.search(r'Of which cash or CPF OA\s*\$140,000', fb), fb)
        check(vn + ': ... and it says an HDB loan needs no minimum cash, and that the deposit is part of the amount, not extra', 'needs no minimum cash' in fb and 'not extra' in fb and '5% minimum cash' not in fb, fb)
        pg.evaluate("window.__f3OpenChip('bkind')"); pg.click('[data-optl="bkind"] .f3-opt:nth-child(3)'); pg.wait_for_timeout(500)
        fb2 = pg.inner_text('[data-flat-out]')
        check(vn + ': with a bank loan the bank minimum cash still applies', '% minimum cash' in fb2 and 'Of which cash only' in fb2, fb2)
        pg.evaluate("window.__f3OpenChip('bkind')"); pg.click('[data-optl="bkind"] .f3-opt:nth-child(2)'); pg.wait_for_timeout(500)
        shot(pg, 'hdb-flat-check-' + vn)
        pg.evaluate("window.__f3OpenChip('bkind')"); pg.click('[data-optl="bkind"] .f3-opt:nth-child(4)'); pg.wait_for_timeout(500)
        check(vn + ': a new EC has no flat check (no valuation at purchase)', not pg.is_visible('[data-flatrow]'))
        check(vn + ': the page does not scroll sideways', overflow(pg) <= 1, overflow(pg))
        check(vn + ': no script errors (HDB loan page)', not errs, errs)
        ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'valuation-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
