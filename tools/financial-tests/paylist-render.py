import os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""The basic payment schedule in the pages: What can I afford? (new launch, completed home), the HDB and EC loan limit page (HDB resale, new flat, EC) and the Payment timeline's
split. Only a type and a price are needed; the budget, loan and funding answers do not move; nothing overflows on a phone; the old New launch payments address redirects.
Run from the site folder: python3 tools/financial-tests/paylist-render.py"""
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
def rows(pg): return pg.evaluate("()=>[...document.querySelectorAll('[data-ps-out] .ps-r')].map(r=>({l:r.querySelector('.ps-nm b').textContent,a:r.querySelector('.ps-a').textContent,w:r.querySelector('.ps-w').textContent}))")
def overflow(pg): return pg.evaluate("()=>document.documentElement.scrollWidth-document.documentElement.clientWidth")
def num(t): return int(re.sub(r'[^\d]', '', t) or 0)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1280, 'height': 1000})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('small', dict(viewport={'width': 360, 'height': 740}, is_mobile=True, has_touch=True))]:
        # (FE V3, 25 Oct 2026: What can I afford? and the Payment timeline were rebuilt; their checks are in fin3-render.py and fin3-connect-render.py)
        # ---- HDB and EC loan limit (V3.4: How much can I borrow? with the HDB/EC chip; the old address opens it set for HDB) ----
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/msr/'); pg.wait_for_selector('[data-ps-d]')
        def kind(i): pg.evaluate("window.__f3OpenChip('bkind')"); pg.click('[data-optl="bkind"] .f3-opt:nth-child(%d)' % i); pg.wait_for_timeout(400)
        pg.click('[data-ps-d] summary'); pg.fill('[data-ps-price]', '600,000'); pg.wait_for_timeout(300); r = rows(pg)
        check(vn + ': HDB page: a resale flat lists option, exercise, application fee, HDB fees, balance and stamp duty', [x['l'] for x in r] == ['Option fee', 'Exercise fee', 'Resale application fee', 'Legal fees and other HDB fees', 'Balance of the price', 'Stamp duty'], r)
        check(vn + ': HDB page: option up to $1,000, exercise up to $4,000, balance $595,000 (the fees are part of the price)', r[0]['a'] == 'Up to $1,000' and r[1]['a'] == 'Up to $4,000' and num(r[4]['a']) == 595000, r)
        check(vn + ': HDB page: no date is invented for HDB’s processing', not any(re.search(r'\b(20\d\d)\b', x['w']) for x in r))
        pg.click('.ps-chip[data-v="hdb-bto"]'); pg.wait_for_timeout(300); r = rows(pg)
        check(vn + ': HDB page: a new flat lists application, booking, downpayment, stamp duty and legal fees, balance', [x['l'] for x in r] == ['Application fee', 'Booking fee', 'Downpayment', 'Stamp duty and legal fees', 'Balance of the price'], r)
        check(vn + ': HDB page: an HDB loan means a 10% downpayment', num(r[2]['a']) == 60000 and num(r[4]['a']) == 540000, r)
        kind(3); r = rows(pg)
        check(vn + ': HDB page: a bank loan means a 20% downpayment, and the type you chose stays', num(r[2]['a']) == 120000 and num(r[4]['a']) == 480000 and pg.evaluate("()=>document.querySelector('.ps-chip[aria-pressed=true]').dataset.v") == 'hdb-bto', r)
        kind(4); r = rows(pg)
        check(vn + ': HDB page: a new EC lists the 11 progressive stages, not an HDB list', len(r) == 11 and r[0]['l'].startswith('Option to Purchase') and r[0]['a'] == '$30,000', r[:1])
        kind(2)
        check(vn + ': HDB page: no page overflow', overflow(pg) <= 1, overflow(pg))
        check(vn + ': HDB page: no script errors', not errs, errs); ctx.close()

        # the loan answer does not move when the schedule is used
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/msr/'); pg.wait_for_selector('[data-f3="borrow"]'); pg.evaluate("sessionStorage.clear()"); pg.goto(B + '/tools/tdsr/?x#hdb'); pg.wait_for_selector('[data-ps-d]')
        pg.fill('[data-k="p.0.fixed"]', '7,000'); pg.evaluate("window.__f3OpenChip('age','p.0.age')"); pg.fill('[data-chp="age"] [data-k="p.0.age"]', '35'); pg.keyboard.press('Enter'); pg.wait_for_timeout(600)
        before = pg.inner_text('[data-out]'); pg.click('[data-ps-d] summary'); pg.fill('[data-ps-price]', '700,000'); pg.wait_for_timeout(500)
        check(vn + ': HDB page: the loan limit answer is the same with the schedule open', pg.inner_text('[data-out]') == before)
        ctx.close()

    # ---- the old address ----
    ctx, pg, errs = page(br, dict(viewport={'width': 1280, 'height': 900}))
    pg.goto(B + '/tools/progressive-payments/?j=1#funding'); pg.wait_for_url(re.compile(r'/tools/payment-planner/')); 
    check('Old New launch payments address lands on the Payment timeline and keeps ?j=1 and the anchor', '/tools/payment-planner/?j=1' in pg.url and pg.url.endswith('#funding'), pg.url)
    pg.wait_for_selector('[data-k="price"]'); check('...and What will this home cost me? opens (renamed from Payment timeline, 26 Oct 2026)', 'What will this home cost me?' in pg.title(), pg.title())
    ctx.close()
    ctx = br.new_context(java_script_enabled=False); pg = ctx.new_page(); pg.goto(B + '/tools/progressive-payments/')
    pg.wait_for_url(re.compile(r'/tools/payment-planner/'))
    check('With no JavaScript the old address still reaches the Payment timeline (the page refreshes to it)', '/tools/payment-planner/' in pg.url, pg.url)
    ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'paylist-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
