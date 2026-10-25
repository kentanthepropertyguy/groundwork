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
        # ================= Planner: valuation =================
        ctx, pg, errs = page(br, kw)
        planner(pg)
        check(vn + ': the valuation row is hidden until there is a price', pg.eval_on_selector('[data-valbox]', 'e=>e.hidden'))
        pg.fill('#pa-price', '1,500,000'); settle(pg)
        check(vn + ': ... and appears for a completed home once a price is entered', not pg.eval_on_selector('[data-valbox]', 'e=>e.hidden'))
        base_head = pg.inner_text('[data-head]')
        pg.fill('#pa-val', '1,400,000'); settle(pg)
        head = pg.inner_text('[data-head]')
        check(vn + ': a valuation $100,000 below the price is explained in words', '$100,000 below the price' in head and 'paid in cash' in head, head[:300])
        check(vn + ': ... the loan is worked on the valuation (75% of $1.4m)', '1,050,000' in pg.inner_text('body'), '')
        check(vn + ': ... the answer changed', head != base_head)
        shot(pg, 'planner-valuation-below-' + vn)
        pg.fill('#pa-val', '1,600,000'); settle(pg)
        check(vn + ': a valuation above the price does not raise the loan (worked on the price)', '1,125,000' in pg.inner_text('body') and '1,200,000' not in pg.inner_text('body'))
        pg.fill('#pa-val', '1,500,000'); settle(pg)
        check(vn + ': a valuation equal to the price changes nothing', '1,125,000' in pg.inner_text('body'))
        pg.fill('#pa-val', ''); settle(pg)
        check(vn + ': clearing the valuation returns the answer to the no-valuation figures', pg.inner_text('[data-head]') == base_head)
        pg.fill('#pa-val', '1,400,000'); settle(pg)
        # persistence in the tab (journey state) and carried into the Payment timeline on the journey
        pg.reload(); pg.wait_for_selector('[data-pa]'); settle(pg)
        check(vn + ': the valuation survives a refresh of the tab', pg.input_value('#pa-val') == '1,400,000', pg.input_value('#pa-val'))
        # new launch: no valuation at purchase, the row goes away and a typed valuation is ignored
        pg.click('.pa-chips[data-k="kind"] [data-v="new"]'); settle(pg)
        check(vn + ': a new launch hides the valuation row', pg.eval_on_selector('[data-valbox]', 'e=>e.hidden'))
        check(vn + ': ... and its answer does not mention a valuation', 'valuation' not in pg.inner_text('[data-head]').lower(), pg.inner_text('[data-head]')[:200])
        check(vn + ': no script errors (Planner valuation)', not errs, errs)
        ctx.close()
        # ================= Planner: rental income =================
        ctx, pg, errs = page(br, kw)
        planner(pg, income='5,000', cash='900,000', cpf='600,000')
        pg.fill('#pa-price', '1,500,000'); settle(pg)
        before = pg.inner_text('[data-head]')
        check(vn + ': the rental box is hidden until asked for', pg.eval_on_selector('[data-rentbox="0"]', 'e=>e.hidden'))
        pg.click('[data-rent="0"]'); pg.wait_for_timeout(200)
        check(vn + ': “+ Add rental income” opens its field', not pg.eval_on_selector('[data-rentbox="0"]', 'e=>e.hidden'))
        shot(pg, 'planner-rental-field-' + vn)
        pg.fill('[data-k="buyers.0.rental"]', '4,000'); settle(pg)
        after = pg.inner_text('[data-head]')
        check(vn + ': rental income changes the answer', after != before, (before[:120], after[:120]))
        # same answer as the equivalent fixed income of $5,000 + 70% x $4,000 = $7,800
        pg.fill('[data-k="buyers.0.rental"]', ''); pg.fill('[data-k="buyers.0.fixed"]', '7,800'); settle(pg)
        eq = pg.inner_text('[data-head]')
        pg.fill('[data-k="buyers.0.fixed"]', '5,000'); pg.fill('[data-k="buyers.0.rental"]', '4,000'); settle(pg)
        strip = lambda s: re.sub(r'\d+% of your income', '', s)   # the share of gross income differs by design: the rental is part of the gross income ($9,000), not $7,800
        check(vn + ': $4,000 rental counts as $2,800 (70%): the same answer as $7,800 of fixed income', strip(pg.inner_text('[data-head]')) == strip(eq), (pg.inner_text('[data-head]')[:150], eq[:150]))
        pg.reload(); pg.wait_for_selector('[data-pa]'); settle(pg)
        check(vn + ': rental income survives a refresh and its box stays open', pg.input_value('[data-k="buyers.0.rental"]') == '4,000' and not pg.eval_on_selector('[data-rentbox="0"]', 'e=>e.hidden'))
        # the one contextual line for a buyer who is selling first (no tracking, no extra questions)
        RS = '[data-rentsell]'; NOTE = 'If you’re selling a property, include only rental income you’ll still receive after the sale.'
        check(vn + ': no sell-first line for a buyer who owns nothing', pg.eval_on_selector(RS, 'e=>e.hidden'))
        pg.click('.pa-chips[data-k="owns"] [data-v="one"]'); pg.click('.pa-chips[data-k="home"] [data-v="sell"]'); pg.wait_for_timeout(250)
        check(vn + ': ... nor while it is not yet chosen what happens first', pg.eval_on_selector(RS, 'e=>e.hidden'))
        pg.click('.pa-chips[data-k="order"] [data-v="buy"]'); pg.wait_for_timeout(250)
        check(vn + ': ... nor for a buyer who buys first (the rent continues until the sale)', pg.eval_on_selector(RS, 'e=>e.hidden'))
        pg.click('.pa-chips[data-k="order"] [data-v="sell"]'); pg.wait_for_timeout(250)
        check(vn + ': a buyer who sells first sees the one-line instruction beside the rental field', not pg.eval_on_selector(RS, 'e=>e.hidden') and pg.inner_text(RS).strip() == NOTE, pg.inner_text(RS))
        shot(pg, 'planner-rental-sellfirst-' + vn)
        pg.click('.pa-chips[data-k="owns"] [data-v="none"]'); pg.wait_for_timeout(250)
        check(vn + ': the line goes away again when nothing is being sold', pg.eval_on_selector(RS, 'e=>e.hidden'))
        check(vn + ': the page does not scroll sideways', overflow(pg) <= 1, overflow(pg))
        check(vn + ': no script errors (Planner rental)', not errs, errs)
        ctx.close()
        # ================= Payment timeline: valuation =================
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/payment-planner/'); pg.wait_for_selector('[data-k="cash"]', state='attached'); pg.wait_for_timeout(500)
        check(vn + ': a new launch has no valuation field', not pg.is_visible('[data-k="valuation"]'))
        pg.click('.gw-chips[data-k="kind"] [data-v="completed"]'); pg.wait_for_timeout(300)
        check(vn + ': a completed home offers an optional Bank valuation', pg.is_visible('[data-k="valuation"]'))
        pg.fill('[data-k="price"]', '1,500,000'); pg.fill('[data-k="valuation"]', '1,400,000'); pg.fill('[data-k="otp"]', '2026-11-01'); pg.wait_for_timeout(300)
        pg.click('[data-tab="funding"]'); pg.wait_for_timeout(400)
        for k, v in [('cash', '400,000'), ('cpf', '300,000'), ('borrowers.0.fixed', '21,000'), ('borrowers.0.age', '35'), ('ratePct', '3'), ('years', '30')]: pg.fill('[data-k="%s"]' % k, v)
        pg.wait_for_timeout(900)
        body = pg.inner_text('body')
        check(vn + ': the loan is 75% of the valuation and says so', '$1,050,000' in body and '75% of the bank valuation' in body, '')
        check(vn + ': the cash above the valuation is explained', pg.is_visible('[data-valnote]') and '$100,000' in pg.inner_text('[data-valnote]') and 'cash at completion' in pg.inner_text('[data-valnote]'))
        rows = pg.inner_text('body')
        ex = rows[rows.index('Exercise the option'):rows.index('Buyer’s stamp duty (BSD)')]; co = rows[rows.index('Completion', rows.index('Buyer’s stamp duty (BSD)')):rows.index('Dates count from', rows.index('Buyer’s stamp duty (BSD)'))]
        check(vn + ': the 4% exercise payment is all cash, none from CPF', 'Cash $60,000' in ex and 'CPF' not in ex, ex)
        check(vn + ': CPF is used at completion: cash $95,000 (cash already paid is credited), CPF $280,000, loan $1,050,000', 'Cash $95,000' in co and 'CPF $280,000' in co and 'Bank loan $1,050,000' in co, co)
        shot(pg, 'timeline-valuation-' + vn)
        pg.click('[data-prop-edit]'); pg.wait_for_timeout(400); pg.fill('[data-k="valuation"]', ''); pg.click('[data-tab="funding"]'); pg.wait_for_timeout(900)
        check(vn + ': without a valuation the loan is 75% of the price and the note is gone', '$1,125,000' in pg.inner_text('body') and not pg.query_selector('[data-valnote]'))
        pg.click('[data-prop-edit]'); pg.wait_for_timeout(400); pg.click('.gw-chips[data-k="kind"] [data-v="new"]'); pg.wait_for_timeout(400)
        check(vn + ': switching to a new launch hides the field again', not pg.is_visible('[data-k="valuation"]'))
        check(vn + ': no script errors (Timeline)', not errs, errs)
        ctx.close()
        # ================= Planner -> Timeline on the journey carries the valuation =================
        ctx, pg, errs = page(br, kw)
        planner(pg)
        pg.fill('#pa-price', '1,500,000'); pg.fill('#pa-val', '1,400,000'); settle(pg)
        hand = pg.evaluate("()=>JSON.stringify(Object.keys(sessionStorage))")
        pg.goto(B + '/tools/payment-planner/?j=1'); pg.wait_for_selector('[data-k="cash"]', state='attached'); pg.wait_for_timeout(700)
        vis = pg.is_visible('[data-k="valuation"]')
        check(vn + ': the Payment timeline opened from the Planner carries the price and the valuation', vis and pg.input_value('[data-k="valuation"]') == '1,400,000' and pg.input_value('[data-k="price"]') == '1,500,000', (hand, vis, pg.input_value('[data-k="valuation"]') if vis else None))
        check(vn + ': no script errors (journey handoff)', not errs, errs)
        ctx.close()
        # ================= HDB loan limit: check a specific flat =================
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/msr/'); pg.wait_for_selector('[data-k="scenario"]', state='attached'); pg.wait_for_timeout(500)
        pg.fill('[data-share="borrowers.0.age"]', '35'); pg.fill('[data-share="borrowers.0.fixed"]', '9,000'); pg.wait_for_timeout(500)
        det = pg.query_selector('details:has(summary:text("Check a specific flat"))')
        check(vn + ': “Check a specific flat” is on the HDB loan page and closed by default', det is not None and not det.evaluate('e=>e.open'))
        det.evaluate('e=>e.open=true')
        pg.fill('details[open] [data-k="price"]', '600,000'); pg.fill('details[open] [data-k="valuation"]', '560,000'); pg.wait_for_timeout(700)
        out = pg.inner_text('[data-out]')
        check(vn + ': the flat block shows the loan on the lower value and the cash over valuation', '$40,000' in out and 'over valuation' in out and '$420,000' in out, out[:600])
        fb = pg.inner_text('.gw-flat')
        check(vn + ': HDB loan, $600,000 / $560,000: $180,000 beyond the loan, $40,000 cash only, $140,000 cash or CPF OA', re.search(r'To pay beyond the loan\s*\$180,000', fb) and re.search(r'Of which cash only\s*\$40,000', fb) and re.search(r'Of which cash or CPF OA\s*\$140,000', fb), fb)
        check(vn + ': ... and it says an HDB loan needs no minimum cash, and that the deposit is part of the amount, not extra', 'needs no minimum cash' in fb and 'not extra' in fb and '5% minimum cash' not in fb, fb)
        check(vn + ': no empty bullet in the flat notes', all(x.strip() for x in pg.eval_on_selector_all('.gw-flat li', 'els=>els.map(e=>e.textContent)')))
        pg.click('.gw-chips[data-k="scenario"] [data-v="hdb-bank"]'); pg.wait_for_timeout(500)
        fb2 = pg.inner_text('.gw-flat') if pg.query_selector('.gw-flat') else ''
        check(vn + ': with a bank loan the bank minimum cash still applies', '% minimum cash' in fb2 and 'Of which cash only' in fb2, fb2)
        pg.click('.gw-chips[data-k="scenario"] [data-v="hdb-loan"]'); pg.wait_for_timeout(500)
        shot(pg, 'hdb-flat-check-' + vn)
        pg.click('.gw-chips[data-k="scenario"] [data-v="ec"]'); pg.wait_for_timeout(500)
        check(vn + ': a new EC has no flat check (no valuation at purchase)', not pg.query_selector('details:has(summary:text("Check a specific flat")):visible'))
        check(vn + ': the page does not scroll sideways', overflow(pg) <= 1, overflow(pg))
        check(vn + ': no script errors (HDB loan page)', not errs, errs)
        ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'valuation-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
