import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""Package 3 browser checks: two experiences. Consumer journeys connect their figures; Professional Tools are independent calculations that keep their own
entries over a refresh, start blank when opened from Tools, never transfer figures to another calculator, and offer an optional reuse. Run from the site folder:
python3 tools/financial-tests/standalone-render.py"""
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
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e) + ' @' + pg.url))
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    return ctx, pg, errs
def ss(pg, k):
    v = pg.evaluate("k=>sessionStorage.getItem(k)", k); return json.loads(v) if v else None
def setv(pg, sel, v): pg.evaluate("([s,v])=>{const e=document.querySelector(s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}", [sel, v])
def keys(pg): return pg.evaluate("()=>Object.keys(sessionStorage)")
def open_(pg, path, sel):
    pg.goto(B + path); pg.wait_for_selector(sel, state='attached'); pg.wait_for_timeout(450)
def journey_figures(pg):
    # V3.4: a journey's figures, typed on What will this home cost me? reached from a journey (?j=1): the price is shared as buyPrice
    pg.goto(B + '/tools/payment-planner/?j=1'); pg.wait_for_selector('[data-f3="pay"]')
    pg.fill('[data-k="price"]', '1,500,000')
    pg.wait_for_function("()=>{try{return JSON.parse(sessionStorage.getItem('gw.fin.v1')||'{}').buyPrice==='1,500,000'}catch(e){return false}}")
PRICE = '[data-share="buyPrice"]'
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        ctx, pg, errs = page(br, kw)
        # ---- the consumer journey has figures in this tab
        journey_figures(pg)
        fin0 = ss(pg, 'gw.fin.v1')
        check(vn + ': the journey keeps the buyer\'s figures in the tab', bool(fin0) and fin0.get('buyPrice') == '1,500,000', fin0)
        # ---- 1. a standalone calculator opened from the Calculators page (V3.4: Stamp duty, a text link under the four questions) starts blank
        open_(pg, '/tools/', '.gw-tdir')
        pg.click('a[data-tool="stamp-duty"]'); pg.wait_for_selector(PRICE, state='attached'); pg.wait_for_timeout(450)
        check(vn + ': opening a calculator from Tools does not carry a mark', '?j=1' not in pg.url and 'j=1' not in pg.url, pg.url)
        check(vn + ': ... it starts blank', pg.input_value(PRICE) == '')
        check(vn + ': ... and offers an optional reuse line naming what it would fill', pg.is_visible('[data-reuse]') and 'price' in pg.inner_text('.gw-reuse'), pg.inner_text('.gw-reuse') if pg.query_selector('.gw-reuse') else '')
        pg.fill(PRICE, '2,000,000'); pg.wait_for_timeout(500)
        check(vn + ': typing in a standalone calculator leaves the journey\'s figures untouched', ss(pg, 'gw.fin.v1') == fin0, ss(pg, 'gw.fin.v1'))
        check(vn + ': ... and the reuse line steps aside once the fields are filled', not pg.is_visible('[data-reuse]'))
        check(vn + ': ... its own entries are kept under its own key', (ss(pg, 'gw.pro.stamp-duty.v1') or {}).get('price') == '2,000,000', ss(pg, 'gw.pro.stamp-duty.v1'))
        # ---- 2. same-page refresh keeps its own entries
        pg.reload(); pg.wait_for_selector(PRICE, state='attached'); pg.wait_for_timeout(500)
        check(vn + ': refreshing the calculator keeps its own entries', pg.input_value(PRICE) == '2,000,000', pg.input_value(PRICE))
        check(vn + ': ... still no mark in the address and no shared write', 'j=1' not in pg.url and ss(pg, 'gw.fin.v1') == fin0)
        # ---- 3. moving to another standalone calculator does not transfer the figures
        pg.goto(B + '/tools/'); pg.click('a[data-tool="mortgage"]'); pg.wait_for_selector('[data-k]', state='attached'); pg.wait_for_timeout(450)
        vals = pg.eval_on_selector_all('input[data-t="money"],input[data-t="num"]', 'e=>e.map(x=>x.value).filter(v=>v!=="")')
        check(vn + ': another calculator opens without the figures just typed (only its own defaults)', '2,000,000' not in vals, vals)
        pg.goto(B + '/tools/'); pg.click('a[data-tool="stamp-duty"]'); pg.wait_for_selector(PRICE, state='attached'); pg.wait_for_timeout(450)
        check(vn + ': coming back to a calculator from Tools starts a fresh calculation', pg.input_value(PRICE) == '')
        # ---- 4. optional reuse fills only what is empty
        pg.fill(PRICE, '900,000'); pg.wait_for_timeout(300)
        pg.click('[data-new]'); pg.wait_for_timeout(400)
        check(vn + ': "New calculation" clears this calculator only (journey figures remain)', pg.input_value(PRICE) == '' and ss(pg, 'gw.fin.v1') == fin0, (pg.input_value(PRICE), ss(pg, 'gw.fin.v1')))
        check(vn + ': ... and the reuse line is offered again', pg.is_visible('[data-reuse]'))
        pg.click('[data-reuse]'); pg.wait_for_timeout(500)
        check(vn + ': reusing the journey figures fills the price as typed there', pg.input_value(PRICE) == '1,500,000', pg.input_value(PRICE))
        check(vn + ': ... the shared figures are unchanged by reusing them', ss(pg, 'gw.fin.v1') == fin0)
        # ---- 5. journey-marked arrival keeps the connected behaviour
        pg.goto(B + '/tools/stamp-duty/?j=1'); pg.wait_for_selector(PRICE, state='attached'); pg.wait_for_timeout(500)
        check(vn + ': a journey-marked arrival opens with the journey\'s figures', pg.input_value(PRICE) == '1,500,000')
        check(vn + ': ... without the standalone banner or reuse line', not pg.is_visible('[data-reuse]') and pg.query_selector('[data-new]') is None)
        pg.fill(PRICE, '1,600,000'); pg.wait_for_timeout(500)
        check(vn + ': ... and what is typed there joins the journey', (ss(pg, 'gw.fin.v1') or {}).get('buyPrice') == '1,600,000')
        check(vn + ': no script errors', not errs, errs)
        ctx.close()

        # ---- 6. the markers: journey links carry them, Tools links do not
        ctx, pg, errs = page(br, kw)
        journey_figures(pg)
        pg.evaluate("()=>document.querySelectorAll('[data-pa-dates]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();sessionStorage.setItem('t.href',a.getAttribute('href'))}))")
        if pg.query_selector('[data-pa-dates]'):
            pg.click('[data-pa-dates]'); pg.wait_for_timeout(200)
            h = pg.evaluate("sessionStorage.getItem('t.href')")
            check(vn + ': the Planner\'s link to the Payment Timeline carries the journey mark', h and 'j=1' in h, h)
        # menu: Buy and Sell columns carry the mark for tools, the Tools column does not
        pg.click('.gw-nav details.gw-menu summary'); pg.wait_for_timeout(300)
        hb = pg.eval_on_selector_all('.gw-ms-buy a[href*="tools/"], .gw-ms-sell a[href*="tools/"]', 'e=>e.map(a=>a.getAttribute("href"))')
        pg.evaluate("()=>document.querySelectorAll('.gw-nav a').forEach(a=>a.addEventListener('click',e=>e.preventDefault(),true))")
        # read the mark as a click would set it: dispatch the click, then read the href
        res = pg.evaluate("""()=>{const o={buy:[],tools:[]};document.querySelectorAll('.gw-ms-buy a[href*="tools/"],.gw-ms-sell a[href*="tools/"]').forEach(a=>{a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));o.buy.push(a.getAttribute('href'))});
          document.querySelectorAll('.gw-ms-tools a[href*="tools/"]').forEach(a=>{a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));o.tools.push(a.getAttribute('href'))});return o}""")
        check(vn + ': menu tool links in Buy and Sell carry the journey mark where they open a calculator', all(('j=1' in x) for x in res['buy'] if re.search(r'tools/(?!what-can-i-buy)[a-z-]+/', x) and 'planner' not in x) or not res['buy'], res['buy'])
        check(vn + ': menu tool links in the Tools column never carry it', res['tools'] and not any('j=1' in x for x in res['tools']), res['tools'])
        ctx.close()

        # ---- 9. Clear all my figures removes the calculators' own entries too
        ctx, pg, errs = page(br, kw)
        open_(pg, '/tools/stamp-duty/', PRICE); pg.fill(PRICE, '1,200,000'); pg.wait_for_timeout(500)
        check(vn + ': a calculator keeps entries under gw.pro.*', any(k.startswith('gw.pro.') for k in keys(pg)), keys(pg))
        open_(pg, '/tools/tdsr/', '[data-f3="borrow"]'); pg.evaluate("()=>document.querySelector('[data-gw-clear-all]').click()"); pg.wait_for_timeout(300)
        pg.evaluate("()=>document.querySelector('[data-gw-clear-yes]').click()"); pg.wait_for_load_state(); pg.wait_for_timeout(500)
        check(vn + ': "Clear all my figures" leaves no calculator entries', not [k for k in keys(pg) if k.startswith('gw.pro.')], keys(pg))
        ctx.close()
        # ---- 10. All Tools entry (FE V3): the Payment timeline opens on the schedule; the funding check is an optional section on the same page; the old #funding address opens it
        ctx, pg, errs = page(br, kw)
        open_(pg, '/tools/', '.gw-tdir'); pg.click('a.gw-tc[data-tool="payment-planner"]'); pg.wait_for_selector('[data-f3="pay"]')
        check(vn + ': Payment timeline from All Tools opens on the schedule, the funding check closed and optional', not pg.evaluate("()=>document.querySelector('[data-fund]').open"))
        open_(pg, '/tools/', '.gw-tdir')
        check(vn + ': All Tools has no second card for the Payment timeline', pg.query_selector('a.gw-tc[data-tool="payment-planner-full"]') is None and pg.locator('a.gw-tc[data-tool="payment-planner"]').count() == 1)
        pg.goto(B + '/tools/payment-planner/#funding'); pg.wait_for_selector('[data-f3="pay"]')
        check(vn + ': the old "#funding" address opens the funding check', pg.wait_for_function("()=>document.querySelector('[data-fund]').open", timeout=8000) is not None)
        check(vn + ': no script errors on the entry pages', not errs, errs)
        ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'standalone-render: {ok} passed, {fail} failed')
sys.exit(1 if fail else 0)
