import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""Package 2 and 3 browser checks: the figures a buyer types are reused between tools, a sale carries from Sale proceeds into the Planner without being counted twice,
and nothing is overwritten, left in the address, or kept after "Clear all my figures". Run from the site folder:  python3 tools/financial-tests/connect-render.py"""
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
def num(t): return int(re.sub(r'[^\d]', '', t) or 0)
def settle(pg): pg.wait_for_function('window.__paSettled && window.__paSettled()'); pg.wait_for_timeout(300)
def page(br, kw):
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    return ctx, pg, errs
def store(pg, k):
    v = pg.evaluate("k=>sessionStorage.getItem(k)", k); return json.loads(v) if v else None
def sale_page(pg, kind='hdb', price='800,000', loan='200,000', cpfp='150,000', cpfi='20,000', more=None, dates=None):
    pg.goto(B + '/tools/sale-proceeds/'); pg.wait_for_selector('[data-out]')
    pg.click(f'.gw-chips[data-k="type"] [data-v="{kind}"]')
    pg.fill('[data-k="price"]', price); pg.fill('[data-k="loan"]', loan); pg.fill('[data-k="cpfPrincipal"]', cpfp); pg.fill('[data-k="cpfInterest"]', cpfi)
    if dates:
        pg.fill('[data-k="bought"]', dates[0]); pg.fill('[data-k="sold"]', dates[1])
    if more:
        pg.evaluate("()=>document.querySelectorAll('main details').forEach(d=>d.open=true)")
        for k, v in more.items(): pg.fill(f'[data-k="{k}"]', v)
    pg.wait_for_timeout(500)
def tool_cash(pg):
    h = pg.inner_text('[data-out] .gw-res-h'); return num(pg.inner_text('[data-out] .gw-res-h b')), h
def watch(pg):
    # copy what is waiting in the tab at the moment "What can I buy next?" is tapped (the Planner removes it once used)
    pg.evaluate("()=>document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('a[data-gw-go=\"planner-sell\"]'))sessionStorage.setItem('t.sell',sessionStorage.getItem('gw.sell.v1')||'')},false)")
def sell_h(pg):
    v = pg.evaluate("()=>sessionStorage.getItem('t.sell')"); return json.loads(v) if v else None
def arrive(pg):
    watch(pg); pg.click('[data-out] a[data-gw-go="planner-sell"]'); pg.wait_for_selector('[data-pa]'); settle(pg)
def planner_sale_numbers(pg):
    # the sale as the buyer sees it counted: "Your sale adds about $X in cash and $Y in CPF" (in the answer once the sale counts)
    t = pg.inner_text('[data-pa]'); m = re.search(r'sale adds about \$([\d,]+) in cash(?: and \$([\d,]+) in CPF)?', t)
    return (num(m.group(1)), num(m.group(2) or '0')) if m else None
def fill_person(pg, income='21,000', cash='100,000', cpf='200,000'):
    pg.fill('[data-k="buyers.0.age"]', '40'); pg.fill('[data-k="buyers.0.fixed"]', income)
    pg.fill('[data-k="cash"]', cash); pg.fill('[data-k="cpf"]', cpf); pg.fill('[data-k="ratePct"]', '2'); pg.fill('[data-k="years"]', '28')
    if pg.is_visible('[data-k="flat.instalment"]') and not pg.input_value('[data-k="flat.instalment"]'): pg.fill('[data-k="flat.instalment"]', '1,500')   # while the home is owned, its loan instalment counts (existing rule)
    settle(pg)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        # ---- 1. Sale proceeds -> Planner, default costs: the Planner works the sale out itself from the same engine
        ctx, pg, errs = page(br, kw); sale_page(pg)
        cash, head = tool_cash(pg)
        check(vn + ': Sale proceeds gives "What can I buy next?" as its main next step', pg.query_selector('[data-out] a.gw-btn.pri[data-gw-go="planner-sell"]') is not None)
        nxt = pg.inner_text('[data-out] .gw-next')
        check(vn + ': the specialist tools stay offered beside it (HDB upgrade planner, new launch)', 'HDB upgrade planner' in nxt and 'new launch' in nxt.lower(), nxt)
        check(vn + ': nothing is left waiting in the tab until the button is tapped', store(pg, 'gw.sell.v1') is None)
        arrive(pg); h = sell_h(pg)
        check(vn + ': hand-over is made when the button is tapped, with the entered figures and no override when the Planner would agree', h and h['type'] == 'hdb' and h['price'] == 800000 and h['loan'] == 200000 and h['cpfRefund'] == 170000 and 'overrideCash' not in h, h)
        check(vn + ': arrival address carries no figures (hash cleared)', pg.url.rstrip('/').endswith('/tools/planner') and '#' not in pg.url, pg.url)
        check(vn + ': hand-over is used once and removed', store(pg, 'gw.sell.v1') is None)
        check(vn + ': "Do you own" = Yes, one; "Sell it"; "Sell first" are set by the button', pg.get_attribute('.pa-chips[data-k="owns"] [data-v="one"]', 'aria-pressed') == 'true' and pg.get_attribute('.pa-chips[data-k="home"] [data-v="sell"]', 'aria-pressed') == 'true' and pg.get_attribute('.pa-chips[data-k="order"] [data-v="sell"]', 'aria-pressed') == 'true')
        vals = {k: pg.input_value(f'[data-k="{k}"]') for k in ['flat.price', 'flat.loan', 'flat.cpfRefund']}
        check(vn + ': sale price, loan and CPF refund arrive filled', vals == {'flat.price': '800,000', 'flat.loan': '200,000', 'flat.cpfRefund': '170,000'}, vals)
        check(vn + ': the arrival says where the figures came from', 'Carried over from Sale proceeds' in pg.inner_text('[data-sale-from]') and pg.is_visible('[data-sale-from]'))
        check(vn + ': income, cash and CPF were NOT invented', pg.input_value('[data-k="cash"]') == '' and pg.input_value('[data-k="buyers.0.fixed"]') == '')
        check(vn + ': now-vs-sale note: cash and CPF here are what you have now', pg.is_visible('.pa-now') and 'counted separately' in pg.inner_text('.pa-now'))
        fill_person(pg)
        sn = planner_sale_numbers(pg)
        check(vn + ': Planner shows the sale as additional cash and CPF equal to Sale proceeds (tie-out)', sn == (cash, 170000), (sn, cash))
        t = pg.inner_text('[data-pa]')
        check(vn + ': current funds and sale proceeds are stated separately', re.search(r'You have \$100,000 in cash and \$200,000 in CPF now', t) is not None and 'only once it completes' in t, t[:400])
        # no duplicate counting: keeping the home removes the sale and nothing else changes
        mx_sell = num(pg.inner_text('[data-max]')) if pg.query_selector('[data-max]') else 0
        pg.click('.pa-chips[data-k="home"] [data-v="keep"]'); settle(pg)
        check(vn + ': "Keep it" removes the sale and its note (not left counted)', planner_sale_numbers(pg) is None and not pg.is_visible('.pa-now'))
        pg.click('.pa-chips[data-k="home"] [data-v="sell"]'); settle(pg)
        check(vn + ': choosing "Sell it" again brings back the same sale figures, once', planner_sale_numbers(pg) == (cash, 170000))
        if vn == 'phone': check('phone: no sideways scroll after arriving', pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'))
        check(vn + ': no script errors on the journey', not errs, errs)
        # ---- shared figures: typed once, reused
        s = store(pg, 'gw.fin.v1') or {}
        check(vn + ': age, income, cash and CPF are shared (tab only)', s.get('borrowers.0.age') == '40' and s.get('borrowers.0.fixed') == '21,000' and s.get('cash') == '100,000' and s.get('cpfOa') == '200,000', s)
        check(vn + ': the shared store holds figures only, never an address or a name', '@' not in json.dumps(s) and 'address' not in json.dumps(s).lower())
        # inside the journey (marked arrival) the figures carry; opened from Tools they do not
        pg.goto(B + '/tools/payment-planner/?j=1'); pg.wait_for_selector('[data-k="cash"]', state='attached'); pg.wait_for_timeout(500)
        check(vn + ': in a journey the Payment Timeline opens with the same cash and CPF', pg.input_value('[data-k="cash"]') == '100,000' and pg.input_value('[data-k="cpf"]') == '200,000', (pg.input_value('[data-k="cash"]'), pg.input_value('[data-k="cpf"]')))
        pg.goto(B + '/tools/payment-planner/'); pg.wait_for_selector('[data-k="cash"]', state='attached'); pg.wait_for_timeout(500)
        check(vn + ': opened from Tools the Payment Timeline starts blank', pg.input_value('[data-k="cash"]') == '' and pg.input_value('[data-k="cpf"]') == '', (pg.input_value('[data-k="cash"]'), pg.input_value('[data-k="cpf"]')))
        pg.goto(B + '/tools/tdsr/?j=1'); pg.wait_for_selector('[data-share="borrowers.0.age"]', state='attached'); pg.wait_for_timeout(500)
        check(vn + ': in a journey How much can I borrow? opens with the same age and income', pg.input_value('[data-share="borrowers.0.age"]') == '40' and pg.input_value('[data-share="borrowers.0.fixed"]') == '21,000', pg.input_value('[data-share="borrowers.0.age"]'))
        pg.goto(B + '/tools/tdsr/'); pg.wait_for_selector('[data-share="borrowers.0.age"]', state='attached'); pg.wait_for_timeout(500)
        check(vn + ': opened from Tools How much can I borrow? starts blank, with an optional reuse line', pg.input_value('[data-share="borrowers.0.age"]') == '' and pg.input_value('[data-share="borrowers.0.fixed"]') == '' and pg.is_visible('[data-reuse]'), pg.input_value('[data-share="borrowers.0.age"]'))
        pg.goto(B + '/tools/hdb-upgrade/'); pg.wait_for_timeout(400)
        check(vn + ': the HDB upgrade planner is still reachable and loads', pg.query_selector('main') is not None)
        ctx.close()
        # ---- 2. custom costs and Seller's Stamp Duty: the Planner takes the tool's own cash and CPF, so the two always agree
        ctx, pg, errs = page(br, kw); sale_page(pg, more={'commissionPct': '1', 'legal': '5,000'})
        cash2, _ = tool_cash(pg)
        arrive(pg); h = sell_h(pg); fill_person(pg)
        check(vn + ': own commission and legal fees travel as the sale\'s own cash and CPF', h and h.get('overrideCash') == cash2 and h.get('overrideCpf') == 170000, (h, cash2))
        check(vn + ': Planner tie-out with own costs', planner_sale_numbers(pg) == (cash2, 170000), (planner_sale_numbers(pg), cash2))
        ctx.close()
        ctx, pg, errs = page(br, kw)
        sale_page(pg, kind='private', price='1,600,000', loan='500,000', cpfp='300,000', cpfi='60,000', dates=('2024-06-01', time.strftime('%Y-%m-%d')))
        cash3, head3 = tool_cash(pg)
        arrive(pg); h = sell_h(pg); fill_person(pg)
        check(vn + ': a private home sold inside the SSD period carries the SSD-inclusive figures', h and h['type'] == 'private' and h.get('overrideCash') == cash3 and 'held' not in h, (h, cash3, head3))
        check(vn + ': Planner tie-out for a private sale with SSD', planner_sale_numbers(pg) == (cash3, 360000), (planner_sale_numbers(pg), cash3))
        ctx.close()
        # ---- 3. never overwrite what the buyer typed; only the sale figures change
        ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-pa]'); fill_person(pg, income='18,500', cash='250,000', cpf='90,000')
        pg.goto(B + '/tools/sale-proceeds/'); pg.wait_for_selector('[data-out]'); pg.fill('[data-k="price"]', '700,000'); pg.fill('[data-k="loan"]', '0'); pg.fill('[data-k="cpfPrincipal"]', '100,000'); pg.fill('[data-k="cpfInterest"]', '10,000'); pg.wait_for_timeout(500)
        arrive(pg)
        check(vn + ': coming back for the sale keeps income, cash, CPF, age and the rates as typed', [pg.input_value(f'[data-k="{k}"]') for k in ['buyers.0.fixed', 'cash', 'cpf', 'buyers.0.age', 'ratePct', 'years']] == ['18,500', '250,000', '90,000', '40', '2', '28'], [pg.input_value(f'[data-k="{k}"]') for k in ['buyers.0.fixed', 'cash', 'cpf']])
        check(vn + ': the sale price follows the sale just worked out', pg.input_value('[data-k="flat.price"]') == '700,000' and pg.input_value('[data-k="flat.cpfRefund"]') == '110,000')
        ctx.close()
        # ---- 4. a deep link with no hand-over, and a stale one that is not used
        ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/planner/#sell'); pg.wait_for_selector('[data-pa]'); settle(pg)
        check(vn + ': /tools/planner/#sell with nothing carried sets only the selling path and invents no figures', pg.get_attribute('.pa-chips[data-k="home"] [data-v="sell"]', 'aria-pressed') == 'true' and pg.input_value('[data-k="flat.price"]') == '' and not pg.is_visible('[data-sale-from]'))
        pg.evaluate("sessionStorage.setItem('gw.sell.v1', JSON.stringify({v:1,type:'hdb',price:999000}))"); pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-pa]'); settle(pg)
        check(vn + ': a waiting hand-over is not used by opening the Planner another way', pg.input_value('[data-k="flat.price"]') != '999,000' and store(pg, 'gw.sell.v1') is not None)
        ctx.close()
        # ---- 5. Clear removes the hand-over and everything else, in this tab
        ctx, pg, errs = page(br, kw); sale_page(pg); arrive(pg); fill_person(pg)
        pg.evaluate("sessionStorage.setItem('gw.sell.v1', JSON.stringify({v:1,type:'hdb',price:1}))")
        pg.click('[data-pa] [data-gw-clear-all]'); pg.click('[data-gw-clear-yes]'); pg.wait_for_load_state(); pg.wait_for_timeout(500)
        left = pg.evaluate("Object.keys(sessionStorage).filter(k=>/^(gw|kpt)\\./.test(k)&&!/^gw\\.(ctx)/.test(k))")
        check(vn + ': "Clear all my figures" leaves no figures, including the sale hand-over', not [k for k in left if k in ('gw.sell.v1', 'gw.fin.v1', 'gw.ans.v1', 'gw.hand.v1', 'gw.plan.v1')], left)
        ctx.close()
        # ---- 6. journey, header and menu
        ctx, pg, errs = page(br, kw); pg.goto(B + '/journey/#sell'); pg.wait_for_timeout(600)
        check(vn + ': the Sell journey panel offers "What can I buy next?" to the Planner', pg.query_selector('a[data-gw-go="planner-sell"][href$="tools/planner/#sell"]') is not None)
        cur = pg.eval_on_selector_all('.gw-links a[aria-current]', 'e=>e.map(x=>x.textContent.trim())')
        check(vn + ': the header marks Sell on the Sell journey', cur == ['Sell'], cur)
        pg.goto(B + '/journey/#buy'); pg.wait_for_timeout(500)
        check(vn + ': ... and Buy on the Buy journey', pg.eval_on_selector_all('.gw-links a[aria-current]', 'e=>e.map(x=>x.textContent.trim())') == ['Buy'])
        pg.goto(B + '/tools/'); pg.wait_for_timeout(600)
        hrefs = pg.eval_on_selector_all('main a', 'e=>e.map(x=>x.getAttribute("href"))')
        miss = [t for t in ['planner', 'payment-planner', 'hdb-upgrade', 'sale-proceeds', 'ssd', 'stamp-duty', 'tdsr', 'msr', 'mortgage', 'progressive-payments'] if not any(h and ('tools/' + t + '/') in (('tools/' + h.split('tools/')[-1]) if 'tools/' in h else 'tools/' + h) for h in hrefs)]
        check(vn + ': the Tools directory still lists every specialist tool', not miss, miss)
        ctx.close()
        ctx, pg, errs = page(br, kw); pg.goto(B + '/research/map/'); pg.wait_for_timeout(800)
        check(vn + ': the Map is still its own page, and Map is the section marked', pg.eval_on_selector_all('.gw-links a[aria-current]', 'e=>e.map(x=>x.textContent.trim())') == ['Map'])
        check(vn + ': no script errors on the Map page', not [e for e in errs if 'Tile' not in e], errs)
        ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'connect-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
