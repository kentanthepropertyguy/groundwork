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
        # ---- What can I afford? ----
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-ps-d]')
        check(vn + ': Planner: the schedule is there from the start, closed, with no income, cash or CPF entered', pg.evaluate("()=>!document.querySelector('[data-ps-d]').open"))
        head0 = pg.inner_text('[data-head]')
        pg.click('[data-ps-d] summary'); pg.fill('[data-ps-price]', '1,800,000'); pg.wait_for_timeout(300)
        r = rows(pg)
        check(vn + ': Planner: a new launch shows its 11 stages from the price alone', len(r) == 11 and r[0]['a'] == '$90,000' and r[1]['a'] == '$270,000', r[:2])
        check(vn + ': Planner: construction stages carry no date', all('construction' in x['w'] for x in r[3:9]) and not any(re.search(r'\b20\d\d\b', x['w']) for x in r), [x['w'] for x in r])
        check(vn + ': Planner: the budget answer is untouched by the schedule', pg.inner_text('[data-head]') == head0)
        pg.click('.pa-chips[data-k="kind"] [data-v="completed"]'); pg.wait_for_timeout(500); r = rows(pg)
        check(vn + ': Planner: a completed home shows option, exercise, stamp duty and completion, not construction stages', [x['l'] for x in r] == ['Option fee', 'Exercise the option', 'Buyer’s stamp duty (BSD)', 'Completion'] and r[0]['a'] == '$18,000' and r[3]['a'] == '$1,710,000', r)
        pg.click('.pa-chips[data-k="kind"] [data-v="hdb"]'); pg.wait_for_timeout(500)
        check(vn + ': Planner: an HDB flat sends you to the HDB page instead of a private schedule', pg.evaluate("()=>!!document.querySelector('[data-sched-host] .ps-msg a[href=\"../msr/\"]') && !document.querySelector('[data-sched-host] .ps-r')"))
        pg.click('.pa-chips[data-k="kind"] [data-v="new"]'); pg.wait_for_timeout(400)
        check(vn + ': Planner: the price you typed stays when the type changes back', pg.input_value('[data-ps-price]') == '1,800,000' and len(rows(pg)) == 11)
        pg.reload(); pg.wait_for_selector('[data-ps-d]'); pg.wait_for_timeout(400)
        check(vn + ': Planner: the schedule price is kept for this tab', pg.input_value('[data-ps-price]') == '1,800,000')
        # a full answer still works beside it, and its price seeds the schedule only until one is typed there
        pg.evaluate("()=>sessionStorage.clear()"); pg.reload(); pg.wait_for_selector('[data-pa]')
        pg.fill('[data-k="buyers.0.age"]', '35'); pg.fill('[data-k="buyers.0.fixed"]', '21,000')
        pg.click('.pa-chips[data-k="owns"] [data-v="none"]'); pg.click('.pa-chips[data-k="kind"] [data-v="completed"]')
        pg.fill('[data-k="cash"]', '300,000'); pg.fill('[data-k="cpf"]', '300,000'); pg.fill('[data-k="ratePct"]', '3'); pg.fill('[data-k="years"]', '30'); settle(pg)
        budget = pg.inner_text('[data-head]'); pg.fill('#pa-price', '1,500,000'); settle(pg)
        pg.click('[data-ps-d] summary'); pg.wait_for_timeout(300)
        check(vn + ': Planner: the property price you check seeds the schedule', pg.input_value('[data-ps-price]') == '1,500,000' and rows(pg)[3]['a'] == '$1,425,000', rows(pg))
        pg.fill('[data-ps-price]', '1,200,000'); pg.wait_for_timeout(300); settle(pg)
        check(vn + ': Planner: typing a price in the schedule does not change the answer to the price checked above', '1,500,000' in pg.input_value('#pa-price') and rows(pg)[3]['a'] == '$1,140,000')
        check(vn + ': Planner: no page overflow', overflow(pg) <= 1, overflow(pg))
        check(vn + ': Planner: no script errors', not errs, errs); ctx.close()

        # ---- HDB and EC loan limit ----
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/msr/'); pg.wait_for_selector('[data-ps-d]')
        pg.click('[data-ps-d] summary'); pg.fill('[data-ps-price]', '600,000'); pg.wait_for_timeout(300); r = rows(pg)
        check(vn + ': HDB page: a resale flat lists option, exercise, application fee, HDB fees, balance and stamp duty', [x['l'] for x in r] == ['Option fee', 'Exercise fee', 'Resale application fee', 'Legal fees and other HDB fees', 'Balance of the price', 'Stamp duty'], r)
        check(vn + ': HDB page: option up to $1,000, exercise up to $4,000, balance $595,000 (the fees are part of the price)', r[0]['a'] == 'Up to $1,000' and r[1]['a'] == 'Up to $4,000' and num(r[4]['a']) == 595000, r)
        check(vn + ': HDB page: no date is invented for HDB’s processing', not any(re.search(r'\b(20\d\d)\b', x['w']) for x in r))
        pg.click('.ps-chip[data-v="hdb-bto"]'); pg.wait_for_timeout(300); r = rows(pg)
        check(vn + ': HDB page: a new flat lists application, booking, downpayment, stamp duty and legal fees, balance', [x['l'] for x in r] == ['Application fee', 'Booking fee', 'Downpayment', 'Stamp duty and legal fees', 'Balance of the price'], r)
        check(vn + ': HDB page: an HDB loan means a 10% downpayment', num(r[2]['a']) == 60000 and num(r[4]['a']) == 540000, r)
        pg.click('.gw-chips[data-k="scenario"] [data-v="hdb-bank"]'); pg.wait_for_timeout(400); r = rows(pg)
        check(vn + ': HDB page: a bank loan means a 20% downpayment, and the type you chose stays', num(r[2]['a']) == 120000 and num(r[4]['a']) == 480000 and pg.evaluate("()=>document.querySelector('.ps-chip[aria-pressed=true]').dataset.v") == 'hdb-bto', r)
        pg.click('.gw-chips[data-k="scenario"] [data-v="ec"]'); pg.wait_for_timeout(400); r = rows(pg)
        check(vn + ': HDB page: a new EC lists the 11 progressive stages, not an HDB list', len(r) == 11 and r[0]['l'].startswith('Option to Purchase') and r[0]['a'] == '$30,000', r[:1])
        pg.click('.gw-chips[data-k="scenario"] [data-v="hdb-loan"]'); pg.wait_for_timeout(300)
        check(vn + ': HDB page: no page overflow', overflow(pg) <= 1, overflow(pg))
        check(vn + ': HDB page: no script errors', not errs, errs); ctx.close()

        # the loan answer does not move when the schedule is used
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/msr/'); pg.wait_for_selector('[data-k="scenario"]', state='attached'); pg.wait_for_timeout(400)
        pg.fill('[data-share="borrowers.0.age"]', '35'); pg.fill('[data-share="borrowers.0.fixed"]', '7,000'); pg.wait_for_timeout(600)
        before = pg.inner_text('[data-out]'); pg.click('[data-ps-d] summary'); pg.fill('[data-ps-price]', '700,000'); pg.wait_for_timeout(500)
        check(vn + ': HDB page: the loan limit answer is the same with the schedule open', pg.inner_text('[data-out]') == before)
        ctx.close()

        # ---- Payment timeline ----
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/payment-planner/'); pg.wait_for_selector('[data-k="price"]'); pg.fill('[data-k="price"]', '2,000,000'); pg.wait_for_timeout(800)
        check(vn + ': Timeline: the split is offered under the schedule, closed', pg.evaluate("()=>{const d=document.querySelector('[data-split-d]');return !!d&&!d.open}"))
        pg.click('[data-split-d] summary'); pg.wait_for_timeout(300)
        check(vn + ': Timeline: it opens and stays open', pg.evaluate("()=>document.querySelector('[data-split-d]').open"))
        t = pg.inner_text('[data-split-d]')
        check(vn + ': Timeline: minimum cash, cash or CPF, loan limit and final instalment from the price alone', all(x in t for x in ['$100,000 (5%)', '$400,000', '$1,500,000 (75%)', '$7,161 a month']), t[:300])
        check(vn + ': Timeline: each stage’s loan and instalment (the old New launch payments figures)', 'bank loan $100,000' in t and 'Monthly instalment after this stage: $477' in t and 'Monthly instalment after this stage: $5,729' in t)
        check(vn + ': Timeline: stamp duty is outside the stages', 'Stamp duty of $69,600' in t)
        pg.evaluate("()=>document.querySelector('.gw-chips[data-k=\"kind\"] [data-v=\"completed\"]').click()")
        pg.wait_for_timeout(600)
        check(vn + ': Timeline: a completed home has no construction split', pg.query_selector('[data-split-d]') is None)
        check(vn + ': Timeline: no page overflow', overflow(pg) <= 1, overflow(pg))
        check(vn + ': Timeline: no script errors', not errs, errs); ctx.close()

    # ---- the old address ----
    ctx, pg, errs = page(br, dict(viewport={'width': 1280, 'height': 900}))
    pg.goto(B + '/tools/progressive-payments/?j=1#funding'); pg.wait_for_url(re.compile(r'/tools/payment-planner/')); 
    check('Old New launch payments address lands on the Payment timeline and keeps ?j=1 and the anchor', '/tools/payment-planner/?j=1' in pg.url and pg.url.endswith('#funding'), pg.url)
    pg.wait_for_selector('[data-k="price"]'); check('...and the Payment timeline opens', pg.title().startswith('Payment timeline'), pg.title())
    ctx.close()
    ctx = br.new_context(java_script_enabled=False); pg = ctx.new_page(); pg.goto(B + '/tools/progressive-payments/')
    pg.wait_for_url(re.compile(r'/tools/payment-planner/'))
    check('With no JavaScript the old address still reaches the Payment timeline (the page refreshes to it)', '/tools/payment-planner/' in pg.url, pg.url)
    ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'paylist-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
