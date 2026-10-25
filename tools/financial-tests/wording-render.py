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
        # ---- Planner ----
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-pa]')
        pg.fill('[data-k="buyers.0.age"]', '35'); pg.fill('[data-k="buyers.0.fixed"]', '21,000')
        pg.click('.pa-chips[data-k="owns"] [data-v="none"]'); pg.click('.pa-chips[data-k="kind"] [data-v="completed"]')
        pg.fill('[data-k="cash"]', '300,000'); pg.fill('[data-k="cpf"]', '300,000'); pg.fill('[data-k="ratePct"]', '3'); pg.fill('[data-k="years"]', '30'); settle(pg)
        check(vn + ': Planner: the home-loan-instalment hint is hidden when you own no property', not vis(pg, 'Leave out home loan instalments'))
        pg.click('.pa-chips[data-k="owns"] [data-v="one"]'); pg.wait_for_timeout(300)
        check(vn + ': Planner: ...and shown once you own one', vis(pg, 'Leave out home loan instalments'))
        pg.click('.pa-chips[data-k="owns"] [data-v="none"]'); pg.wait_for_timeout(300)
        check(vn + ': Planner: one CPF line under the CPF field, no second paragraph', not pg.query_selector('.pa-cpfhint') and vis(pg, 'We don’t check CPF’s limits'))
        pg.fill('#pa-price', '1,500,000'); settle(pg)
        figs = pg.eval_on_selector_all('.pa-fig', 'e=>e.map(x=>x.querySelector(".k").innerText)')
        check(vn + ': Planner: a price shows three tiles: cash and CPF needed, loan, monthly mortgage', figs == ['Cash and CPF needed', 'Bank loan', 'Monthly mortgage'], figs)
        why = pg.inner_text('[data-why]')
        check(vn + ': Planner: the lead is one short sentence', len(why) < 70 and why.count('$') == 1, why)
        check(vn + ': Planner: the monthly mortgage line gives each fact on its own line', pg.eval_on_selector_all('.pa-fig', 'e=>e[2].querySelectorAll(".s p").length') == 2)
        check(vn + ': Planner: no page overflow', pg.evaluate("()=>document.documentElement.scrollWidth-document.documentElement.clientWidth") <= 1)
        check(vn + ': Planner: no script errors', not errs, errs)
        ctx.close()
        # ---- HDB and EC loan limit ----
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/msr/'); pg.wait_for_selector('[data-k="scenario"]', state='attached'); pg.wait_for_timeout(500)
        pg.fill('[data-share="borrowers.0.age"]', '35'); pg.fill('[data-share="borrowers.0.fixed"]', '9,000'); pg.wait_for_timeout(600)
        check(vn + ': HDB loan limit: Family shows only the family ceiling', vis(pg, '$16,000 a month') and not vis(pg, '$8,000 a month') and not vis(pg, '$24,000 a month') and not vis(pg, 'Singles must be 35'))
        pg.click('.gw-chips[data-k="household"] [data-v="single"]'); pg.wait_for_timeout(400)
        check(vn + ': HDB loan limit: Single shows the singles ceiling and the age rule', vis(pg, '$8,000 a month') and vis(pg, 'Singles must be 35') and not vis(pg, '$16,000 a month'))
        so = pg.inner_text('[data-out]')
        check(vn + ': HDB loan limit: Single, $9,000 against the $8,000 ceiling: eligibility leads, not the loan', so.strip().startswith('HDB loan eligibility') and 'Income above the ceiling' in so and '$8,000' in so.split('Theoretical')[0], so[:200])
        check(vn + ': HDB loan limit: the loan is kept, labelled theoretical, with the price it supports', 'Theoretical maximum loan, if the ceiling were met' in so and '$569,366' in so and 'Price that theoretical loan supports' in so and 'Indicative maximum loan' not in so)
        # Single under 35: the age requirement leads (purchase eligibility, not a loan figure); the loan is kept as theoretical
        pg.fill('[data-share="borrowers.0.age"]', '32'); pg.wait_for_timeout(500); ao = pg.inner_text('[data-out]')
        check(vn + ': HDB loan limit: Single at 32 leads with the age requirement, as purchase eligibility', ao.strip().startswith('HDB purchase eligibility') and 'Singles age requirement not met' in ao, ao[:160])
        check(vn + ': HDB loan limit: it says a bank loan does not change it, names the age entered and refers to HFE', 'a bank loan does not change it' in ao and 'age entered is 32' in ao and 'HFE' in ao and 'must be 35 or older' in ao, ao[:420])
        check(vn + ': HDB loan limit: the loan is kept, labelled theoretical, not as the result', 'Theoretical maximum HDB loan, if the requirements were met' in ao and 'Indicative maximum loan' not in ao and 'Price that theoretical loan supports' in ao)
        check(vn + ': HDB loan limit: the age note is not repeated in the bullets', ao.count('Singles need to be 35 or older') == 0)
        pg.fill('[data-share="borrowers.0.age"]', '35'); pg.wait_for_timeout(500)
        pg.fill('[data-share="borrowers.0.fixed"]', '9,000'); pg.wait_for_timeout(500)
        pg.click('.gw-chips[data-k="household"] [data-v="family"]'); pg.fill('[data-share="borrowers.0.age"]', '32'); pg.wait_for_timeout(500)
        check(vn + ': HDB loan limit: Family at 32 is unchanged (the loan leads; the singles age line stays a note)', pg.inner_text('[data-out]').strip().startswith('Indicative maximum loan'))
        pg.fill('[data-share="borrowers.0.age"]', '35'); pg.click('.gw-chips[data-k="household"] [data-v="single"]'); pg.wait_for_timeout(500)
        pg.click('.gw-chips[data-k="household"] [data-v="extended"]'); pg.wait_for_timeout(400)
        check(vn + ': HDB loan limit: Extended shows only its own ceiling', vis(pg, '$24,000 a month') and not vis(pg, '$8,000 a month'))
        eo = pg.inner_text('[data-out]')
        check(vn + ': HDB loan limit: Extended at $9,000 is under its $24,000 ceiling, so the loan leads', eo.strip().startswith('Indicative maximum loan') and 'Theoretical' not in eo, eo[:120])
        pg.fill('[data-share="borrowers.0.fixed"]', '25,000'); pg.wait_for_timeout(600); eo = pg.inner_text('[data-out]')
        check(vn + ': HDB loan limit: Extended at $25,000 is over $24,000: eligibility leads', eo.strip().startswith('HDB loan eligibility') and '$24,000' in eo.split('Theoretical')[0] and 'extended families' in eo, eo[:200])
        pg.click('.gw-chips[data-k="household"] [data-v="family"]'); pg.wait_for_timeout(500); fo = pg.inner_text('[data-out]')
        check(vn + ': HDB loan limit: Family at $25,000 is over $16,000: eligibility leads', fo.strip().startswith('HDB loan eligibility') and '$16,000' in fo.split('Theoretical')[0] and 'families' in fo, fo[:200])
        pg.fill('[data-share="borrowers.0.fixed"]', '16,000'); pg.wait_for_timeout(600); fo = pg.inner_text('[data-out]')
        check(vn + ': HDB loan limit: Family at exactly $16,000 is not over the ceiling: the loan leads', fo.strip().startswith('Indicative maximum loan'), fo[:120])
        pg.fill('[data-share="borrowers.0.fixed"]', '9,000'); pg.wait_for_timeout(600)
        pg.click('.gw-chips[data-k="scenario"] [data-v="hdb-bank"]'); pg.wait_for_timeout(500)
        check(vn + ': HDB loan limit: an HDB flat with a bank loan has no HDB ceiling, so the loan leads', pg.inner_text('[data-out]').strip().startswith('Indicative maximum loan'))
        pg.click('.gw-chips[data-k="scenario"] [data-v="hdb-loan"]'); pg.wait_for_timeout(500)
        pg.click('.gw-chips[data-k="household"] [data-v="family"]'); pg.wait_for_timeout(400)
        out = pg.inner_text('[data-out]')
        check(vn + ': HDB loan limit: the maximum loan is still the answer at the top', out.strip().startswith('Indicative maximum loan'), out[:80])
        check(vn + ': HDB loan limit: the other-loans note is short and the lease note says what to do', 'HDB also looks at your other loans, so it may lend less than this.' in out and 'Add the remaining lease' in out, out)
        tn = pg.inner_text('[data-tenure-note]')
        check(vn + ': HDB loan limit: the tenure line has no filler sentence', 'A shorter tenure is allowed' not in tn and 'An HDB loan runs up to 25 years' in tn, tn)
        check(vn + ': HDB loan limit: no page overflow', pg.evaluate("()=>document.documentElement.scrollWidth-document.documentElement.clientWidth") <= 1)
        check(vn + ': HDB loan limit: no script errors', not errs, errs)
        ctx.close()
        # ---- Payment timeline ----
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/payment-planner/'); pg.wait_for_selector('[data-k="cash"]', state='attached'); pg.wait_for_timeout(500)
        pg.click('.gw-chips[data-k="kind"] [data-v="completed"]'); pg.wait_for_timeout(300)
        pg.fill('[data-k="price"]', '1,500,000'); pg.fill('[data-k="otp"]', '2026-11-01'); pg.wait_for_timeout(300)
        pg.click('[data-tab="funding"]'); pg.wait_for_timeout(400)
        for k, v in [('cash', '60,000'), ('cpf', '300,000'), ('borrowers.0.fixed', '21,000'), ('borrowers.0.age', '35'), ('ratePct', '3'), ('years', '30')]: pg.fill('[data-k="%s"]' % k, v)
        pg.wait_for_timeout(900)
        body = pg.inner_text('body')
        check(vn + ': Timeline: the funding intro is one short line', 'Optional. An estimate from the figures you enter, not a bank approval.' in body and 'Everything stays on this device.' not in body)
        check(vn + ': Timeline: the shortfall is stated with its total, and the stage table keeps its allocations', re.search(r'\$[\d,]+ not covered in total', body) is not None and 'Not covered' in body and 'Each payment, and what pays it' in body and 'Total to pay' not in body)
        check(vn + ': Timeline: the monthly mortgage tile has a short qualifier', 'Estimate, not a bank instalment.' in body)
        check(vn + ': Timeline: no page overflow', pg.evaluate("()=>document.documentElement.scrollWidth-document.documentElement.clientWidth") <= 1)
        check(vn + ': Timeline: no script errors', not errs, errs)
        ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'wording-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
