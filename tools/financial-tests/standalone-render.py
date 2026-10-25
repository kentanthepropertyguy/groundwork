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
    # C1: the consumer journey's What can I afford? is the one reached from a journey (?j=1); opened from Tools it is a standalone calculation (c1-render.py)
    pg.goto(B + '/tools/planner/?j=1'); pg.wait_for_selector('[data-pa]')
    pg.fill('[data-k="buyers.0.age"]', '40'); pg.fill('[data-k="buyers.0.fixed"]', '21,000'); pg.fill('[data-k="cash"]', '100,000'); pg.fill('[data-k="cpf"]', '200,000')
    settle(pg)
AGE, INC = '[data-share="borrowers.0.age"]', '[data-share="borrowers.0.fixed"]'
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        ctx, pg, errs = page(br, kw)
        # ---- the consumer journey has figures in this tab
        journey_figures(pg)
        fin0 = ss(pg, 'gw.fin.v1')
        check(vn + ': the consumer Planner keeps the buyer\'s figures in the tab (journey)', bool(fin0) and fin0.get('borrowers.0.fixed') == '21,000', fin0)
        # ---- 1. a standalone calculator opened from Tools starts blank
        open_(pg, '/tools/', '.gw-tdir')
        pg.click('a.gw-tl[data-tool="tdsr"]'); pg.wait_for_selector(AGE, state='attached'); pg.wait_for_timeout(450)
        check(vn + ': opening a calculator from Tools does not carry a mark', '?j=1' not in pg.url and 'j=1' not in pg.url, pg.url)
        check(vn + ': ... it starts blank', pg.input_value(AGE) == '' and pg.input_value(INC) == '')
        check(vn + ': ... and offers an optional reuse line naming what it would fill', pg.is_visible('[data-reuse]') and 'income' in pg.inner_text('.gw-reuse'), pg.inner_text('.gw-reuse') if pg.query_selector('.gw-reuse') else '')
        # typing in a standalone calculator does not change the shared figures
        pg.fill(AGE, '52'); pg.fill(INC, '9,000'); pg.wait_for_timeout(500)
        check(vn + ': typing in a standalone calculator leaves the journey\'s figures untouched', ss(pg, 'gw.fin.v1') == fin0, ss(pg, 'gw.fin.v1'))
        check(vn + ': ... and the reuse line steps aside once the fields are filled', not pg.is_visible('[data-reuse]'))
        check(vn + ': ... its own entries are kept under its own key', (ss(pg, 'gw.pro.tdsr.v1') or {}).get('borrowers.0.fixed') == '9,000', ss(pg, 'gw.pro.tdsr.v1'))
        # ---- 2. same-page refresh keeps its own entries
        pg.reload(); pg.wait_for_selector(AGE, state='attached'); pg.wait_for_timeout(500)
        check(vn + ': refreshing the calculator keeps its own entries', pg.input_value(AGE) == '52' and pg.input_value(INC) == '9,000', (pg.input_value(AGE), pg.input_value(INC)))
        check(vn + ': ... still no mark in the address and no shared write', 'j=1' not in pg.url and ss(pg, 'gw.fin.v1') == fin0)
        # ---- 3. moving to another standalone calculator does not transfer the figures
        pg.goto(B + '/tools/'); pg.click('a.gw-tl[data-tool="mortgage"]'); pg.wait_for_selector('[data-k]', state='attached'); pg.wait_for_timeout(450)
        vals = pg.eval_on_selector_all('input[data-t="money"],input[data-t="num"]', 'e=>e.map(x=>x.value).filter(v=>v!=="")')
        check(vn + ': another calculator opens without the figures just typed (only its own defaults)', '9,000' not in vals and '52' not in vals, vals)
        pg.goto(B + '/tools/'); pg.click('a.gw-tl[data-tool="tdsr"]'); pg.wait_for_selector(AGE, state='attached'); pg.wait_for_timeout(450)
        check(vn + ': coming back to a calculator from Tools starts a fresh calculation', pg.input_value(AGE) == '' and pg.input_value(INC) == '')
        # ---- 4. optional reuse fills only what is empty
        pg.fill(INC, '5,000')
        pg.wait_for_timeout(300)
        # the reuse line is hidden while the calculation has entries; start fresh again to use it
        pg.click('[data-new]'); pg.wait_for_timeout(400)
        check(vn + ': "New calculation" clears this calculator only (journey figures remain)', pg.input_value(INC) == '' and ss(pg, 'gw.fin.v1') == fin0 and ss(pg, 'gw.pro.tdsr.v1') in (None, {}) or (ss(pg, 'gw.pro.tdsr.v1') or {}).get('borrowers.0.fixed') in (None, ''), (pg.input_value(INC), ss(pg, 'gw.pro.tdsr.v1')))
        check(vn + ': ... and the reuse line is offered again', pg.is_visible('[data-reuse]'))
        pg.click('[data-reuse]'); pg.wait_for_timeout(500)
        check(vn + ': reusing the journey figures fills age and income as typed there', pg.input_value(AGE) == '40' and pg.input_value(INC) == '21,000', (pg.input_value(AGE), pg.input_value(INC)))
        check(vn + ': ... the shared figures are unchanged by reusing them', ss(pg, 'gw.fin.v1') == fin0)
        # ---- 5. journey-marked arrival keeps the connected behaviour
        pg.goto(B + '/tools/tdsr/?j=1'); pg.wait_for_selector(AGE, state='attached'); pg.wait_for_timeout(500)
        check(vn + ': a journey-marked arrival opens with the journey\'s figures', pg.input_value(AGE) == '40' and pg.input_value(INC) == '21,000')
        check(vn + ': ... without the standalone banner or reuse line', not pg.is_visible('[data-reuse]') and pg.query_selector('[data-new]') is None)
        pg.fill(INC, '23,000'); pg.wait_for_timeout(500)
        check(vn + ': ... and what is typed there joins the journey', (ss(pg, 'gw.fin.v1') or {}).get('borrowers.0.fixed') == '23,000')
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

        # ---- 7. the Payment Timeline: standalone fresh, refresh keeps its entries, journey keeps the Planner's figures
        ctx, pg, errs = page(br, kw)
        journey_figures(pg)
        open_(pg, '/tools/', '.gw-tdir'); pg.click('a.gw-tl[data-tool="payment-planner"]'); pg.wait_for_selector('[data-k="cash"]', state='attached'); pg.wait_for_timeout(500)
        check(vn + ': the Payment Timeline opened from Tools starts blank (no Planner figures)', pg.input_value('[data-k="cash"]') == '' and pg.input_value('[data-k="cpf"]') == '' and pg.input_value('[data-k="borrowers.0.fixed"]') == '')
        setv(pg, '[data-k="cash"]', '77,000'); pg.wait_for_timeout(600)
        check(vn + ': it writes only its own key (the journey\'s figures stay as they were)', (ss(pg, 'gw.fin.v1') or {}).get('cash') == '100,000' and (ss(pg, 'gw.pro.payment-planner.v1') or {}).get('cash') == '77,000', (ss(pg, 'gw.fin.v1'), ss(pg, 'gw.pro.payment-planner.v1')))
        pg.reload(); pg.wait_for_selector('[data-k="cash"]', state='attached'); pg.wait_for_timeout(500)
        check(vn + ': refreshing the Payment Timeline keeps its own entries', pg.input_value('[data-k="cash"]') == '77,000', pg.input_value('[data-k="cash"]'))
        pg.evaluate("()=>document.querySelector('[data-pl-new]').click()"); pg.wait_for_selector('[data-k="cash"]', state='attached'); pg.wait_for_timeout(600)
        check(vn + ': "New calculation" on the Payment Timeline starts it blank and leaves the journey figures', pg.input_value('[data-k="cash"]') == '' and (ss(pg, 'gw.fin.v1') or {}).get('cash') == '100,000')
        open_(pg, '/tools/payment-planner/?j=1', '[data-k="cash"]')
        check(vn + ': a journey-marked Payment Timeline opens with the journey\'s cash and CPF', pg.input_value('[data-k="cash"]') == '100,000' and pg.input_value('[data-k="cpf"]') == '200,000', (pg.input_value('[data-k="cash"]'), pg.input_value('[data-k="cpf"]')))
        check(vn + ': no script errors', not errs, errs)
        ctx.close()

        # ---- 8. The old HDB upgrade planner address (24 Oct 2026): redirects to What can I afford? set up for a flat being sold; figures typed into the old planner in this tab are carried over
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/'); pg.wait_for_selector('.gw-tdir')
        pg.evaluate("sessionStorage.setItem('kpt.hdb.input', JSON.stringify({salePrice:900000,outstandingLoan:100000,buyers:[{age:40,income:12000}],cashSavings:150000,residency:'all-sc',timing:'sell-first'}))")
        pg.goto(B + '/tools/hdb-upgrade/'); pg.wait_for_url('**/tools/planner/**', timeout=10000); pg.wait_for_selector('[data-pa]'); pg.wait_for_timeout(800)
        g = lambda k: pg.evaluate("k => { const e = document.querySelector('[data-k=\"' + k + '\"]'); if (!e) return null; return e.dataset.t === 'chip' ? ((e.querySelector('[aria-pressed=true]') || {}).dataset || {}).v : e.value; }", k)
        check(vn + ': the old HDB upgrade planner address opens What can I afford? as a journey page, set up for a home being sold first', '/tools/planner/' in pg.url and 'j=1' in pg.url and g('home') == 'sell' and g('order') == 'sell' and g('flat.type') == 'hdb', (pg.url, g('home'), g('order'), g('flat.type')))
        check(vn + ': ... with the flat, the loan, the buyer and the cash carried over, nothing typed twice', g('flat.price') == '900,000' and g('flat.loan') == '100,000' and g('buyers.0.age') == '40' and g('buyers.0.fixed') in ('12,000', '12000') and g('cash') in ('150,000', '150000'), (g('flat.price'), g('flat.loan'), g('buyers.0.age'), g('buyers.0.fixed'), g('cash')))
        ctx.close()
        ctx, pg, errs = page(br, kw)
        pg.goto(B + '/tools/hdb-upgrade/'); pg.wait_for_url('**/tools/planner/**', timeout=10000); pg.wait_for_selector('[data-pa]'); pg.wait_for_timeout(600)
        check(vn + ': with nothing stored it opens blank, still set up for a home being sold', g('home') == 'sell' and g('flat.price') in ('', None) and g('cash') in ('', None), (g('home'), g('flat.price'), g('cash')))
        check(vn + ': no script errors', not errs, errs)
        ctx.close()

        # ---- 9. Clear all my figures removes the calculators' own entries too
        ctx, pg, errs = page(br, kw)
        open_(pg, '/tools/tdsr/', AGE); pg.fill(AGE, '45'); pg.fill(INC, '8,000'); pg.wait_for_timeout(500)
        check(vn + ': a calculator keeps entries under gw.pro.*', any(k.startswith('gw.pro.') for k in keys(pg)), keys(pg))
        open_(pg, '/tools/planner/', '[data-pa]'); pg.click('[data-pa] [data-gw-clear-all]'); pg.wait_for_timeout(300)
        pg.click('[data-gw-clear-yes]'); pg.wait_for_load_state(); pg.wait_for_timeout(500)
        check(vn + ': "Clear all my figures" leaves no calculator entries', not [k for k in keys(pg) if k.startswith('gw.pro.')], keys(pg))
        ctx.close()
        # ---- 10. All Tools entry: the Payment timeline answers "when and how much" first; its Funding check is a tab inside (the separate "Full payment planning" card is gone, 24 Oct 2026)
        ctx, pg, errs = page(br, kw)
        open_(pg, '/tools/', '.gw-tdir'); pg.click('a.gw-tl[data-tool="payment-planner"]'); pg.wait_for_selector('[data-tab]', state='attached'); pg.wait_for_timeout(500)
        check(vn + ': Payment timeline from All Tools opens on the schedule (when and how much), Funding check optional', pg.get_attribute('[data-tab="schedule"]', 'aria-selected') == 'true' and pg.get_attribute('[data-tab="funding"]', 'aria-selected') == 'false' and 'j=1' not in pg.url)
        pg.click('[data-tab="funding"]'); pg.wait_for_timeout(400)
        check(vn + ': its Funding check is one tap away on the same page, still a fresh calculation', pg.get_attribute('[data-tab="funding"]', 'aria-selected') == 'true' and pg.input_value('[data-k="cash"]') == '')
        open_(pg, '/tools/', '.gw-tdir')
        check(vn + ': All Tools has no second card for the Payment timeline', pg.query_selector('a.gw-tl[data-tool="payment-planner-full"]') is None and pg.locator('a.gw-tl[data-tool="payment-planner"]').count() == 1)
        pg.goto(B + '/tools/payment-planner/#funding'); pg.wait_for_selector('[data-tab]', state='attached'); pg.wait_for_timeout(600)
        check(vn + ': the old "#funding" address still opens the Funding check', pg.get_attribute('[data-tab="funding"]', 'aria-selected') == 'true')
        check(vn + ': no script errors on the entry pages', not errs, errs)
        ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'standalone-render: {ok} passed, {fail} failed')
sys.exit(1 if fail else 0)
