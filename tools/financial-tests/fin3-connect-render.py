import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""Financial Experience V3: the connections the earlier Planner and Timeline tests covered, carried over to the rebuilt pages.
  Sale proceeds -> What can I afford? (#sell): the sale arrives, nothing else is invented, and the figures tie out with Sale proceeds (also with SSD).
  The old HDB upgrade planner address. The budget -> Budget Search (only when Explore is pressed, standalone). A price from Research.
  The C1 rules on the page: the married-couple remission, FTA nationals, a co-buyer's home, CPF balances while a home is kept.
  "Clear all my figures" clears the three calculators. No fixed waits. Run from the site folder: python3 tools/financial-tests/fin3-connect-render.py"""
SITE = pathlib.Path(__file__).resolve().parents[2]
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
def num(t): m = re.search(r'\$([\d,]+)', t or ''); return int(m.group(1).replace(',', '')) if m else None
def page(br, kw):
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net|onemap\.gov\.sg'), lambda r: r.fulfill(status=200, body=''))
    return ctx, pg, errs
def until(pg, js, arg=None, t=8000):
    try: pg.wait_for_function(js, arg=arg, timeout=t); return True
    except Exception: return False
# FE V3.2: an entry behind an assumption chip is opened, typed and closed again
REVEAL = r'''k=>{const f=document.querySelector('[data-k="'+k+'"]');if(!f||(f.checkVisibility?f.checkVisibility():f.offsetParent))return false;const pn=f.closest('[data-chp]');if(pn&&window.__f3OpenChip)window.__f3OpenChip(pn.dataset.chp,k);const cu=f.closest('[data-cust]');if(cu)cu.hidden=false;const d=f.closest('details');if(d)d.open=true;return !!pn}'''
def typ(pg, k, v):
    # the visible copy of the field (a key can appear on a page more than once), once its panel has opened
    opened = pg.evaluate(REVEAL, k); f = pg.locator(f'[data-k="{k}"]:visible').first; f.wait_for(state='visible', timeout=8000); f.fill(v)
    if opened: pg.evaluate("()=>window.__f3OpenChip&&window.__f3OpenChip(null)")
def seg(pg, k, v): pg.evaluate("([k,v])=>{const b=[...document.querySelectorAll('[data-k=\"'+k+'\"] button[data-v=\"'+v+'\"]')].find(x=>x.offsetParent)||document.querySelector('[data-k=\"'+k+'\"] button[data-v=\"'+v+'\"]'); b.click()}", [k, v])
def segv(pg, k): return pg.evaluate("k=>{const b=document.querySelector('[data-k=\"'+k+'\"] [aria-pressed=\"true\"]');return b?b.dataset.v:null}", k)
def val(pg, k): return pg.input_value(f'[data-k="{k}"]')
def out(pg): return pg.inner_text('[data-out]')
def ss(pg, k): v = pg.evaluate("k=>sessionStorage.getItem(k)", k); return json.loads(v) if v else None
budget_ready = "()=>!!document.querySelector('[data-max]')"
settled = "()=>window.__f3Settled&&window.__f3Settled()"
def sale_page(pg, kind='hdb', price='800,000', loan='200,000', cpf='170,000', dates=None):
    # V3.4: What will I get from selling? (the CPF used is one figure, with its accrued interest)
    pg.goto(B + '/tools/sale-proceeds/?j=1'); pg.wait_for_selector('[data-out]'); pg.evaluate("sessionStorage.clear()"); pg.reload(); pg.wait_for_selector('[data-out]')
    if kind != 'hdb': pg.evaluate("window.__f3OpenChip('stype')"); pg.locator('[data-optl="stype"] .f3-opt', has_text={'private': 'Private home', 'ec': 'EC'}[kind]).click()
    pg.fill('[data-k="sale.price"]', price); pg.fill('[data-k="sale.loan"]', loan); typ(pg, 'sale.cpfRefund', cpf)
    if dates: typ(pg, 'sale.bought', dates[0]); typ(pg, 'sale.sold', dates[1])
    until(pg, "()=>window.__f3Settled()&&!!document.querySelector('[data-cash]')")
def sale_cash(pg): return num(pg.inner_text('[data-cash]'))
def arrive(pg):
    pg.click('[data-to-borrow]'); pg.wait_for_selector('[data-f3="borrow"]'); pg.wait_for_function("()=>!!window.__f3OpenChip&&window.__f3Settled&&window.__f3Settled()")   # the page's script has run
DW = "()=>{const d=document.querySelector('[data-dutywho]');if(d)d.open=true}"
def counted(pg):
    m = re.search(r'Counts your home’s sale: about \$([\d,]+) cash and \$([\d,]+) back to CPF', out(pg)); return (int(m.group(1).replace(',', '')), int(m.group(2).replace(',', ''))) if m else None
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vn, kw in (('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('phone', {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True})):
            # ---- 1. What will I get from selling? -> How much can I borrow?, "Add my cash and CPF" (V3.4) ----
            ctx, pg, errs = page(br, kw); sale_page(pg); cash0 = sale_cash(pg)
            check(vn + ': the selling page offers “What can this buy me next?”', pg.is_visible('[data-to-borrow]'))
            arrive(pg)
            check(vn + ': the arrival address carries no figures (hash cleared)', until(pg, "()=>!location.hash") and not re.search(r'\d{3}', pg.url.split('/tools/tdsr/')[-1]), pg.url)
            check(vn + ': a home owned, selling it first, are set, and the cash and CPF row is open', segv(pg, 'homes') == '1' and segv(pg, 'plan') == 'sell' and pg.evaluate("document.querySelector('[data-cashrow]').open"))
            check(vn + ': the sale price, loan and CPF refund (with interest) arrive filled', val(pg, 'sale.price') == '800,000' and val(pg, 'sale.loan') == '200,000' and val(pg, 'sale.cpfRefund') == '170,000', [val(pg, 'sale.price'), val(pg, 'sale.loan'), val(pg, 'sale.cpfRefund')])
            check(vn + ': age, income, cash and CPF are not invented', val(pg, 'p.0.fixed') == '' and val(pg, 'cash') == '')
            typ(pg, 'p.0.age', '40'); typ(pg, 'p.0.fixed', '21,000'); typ(pg, 'cash', '100,000'); typ(pg, 'cpf', '200,000')
            check(vn + ': the sale is counted with the same cash as the selling page and the $170,000 refund (tie-out)', until(pg, "()=>/Counts your home’s sale/.test(document.querySelector('[data-out]').textContent)") and counted(pg) == (cash0, 170000), [counted(pg), cash0])
            seg(pg, 'plan', 'keep')
            check(vn + ': “Keeping it” takes the sale out (not left counted)', until(pg, "()=>!/Counts your home’s sale/.test(document.querySelector('[data-out]').textContent)"))
            seg(pg, 'plan', 'sell')
            check(vn + ': selling first again brings back the same figures', until(pg, "()=>/Counts your home’s sale/.test(document.querySelector('[data-out]').textContent)") and counted(pg) == (cash0, 170000))
            check(vn + ': no script errors (sale)', not errs, errs); ctx.close()
            # ---- 1b. a private home sold within its SSD period: the selling page's SSD-inclusive figures travel as its own ----
            ctx, pg, errs = page(br, kw); sale_page(pg, kind='private', price='1,500,000', loan='600,000', cpf='220,000', dates=('2024-06-01', '2026-10-20')); cash1 = sale_cash(pg)
            check(vn + ': SSD sale: the selling page shows SSD as a line', pg.query_selector('[data-ssd]') is not None)
            arrive(pg); typ(pg, 'p.0.age', '40'); typ(pg, 'p.0.fixed', '21,000'); typ(pg, 'cash', '100,000'); typ(pg, 'cpf', '200,000')
            check(vn + ': SSD sale: the cash counted is the selling page’s own (SSD included)', until(pg, "()=>/Counts your home’s sale/.test(document.querySelector('[data-out]').textContent)") and until(pg, settled) and counted(pg) is not None and counted(pg)[0] == cash1, [counted(pg), cash1])
            typ(pg, 'sale.price', '1,600,000')
            check(vn + ': editing the sale price retires the selling page’s figures (it is worked out here, and SSD needs the held answer)', until(pg, "()=>!/Counts your home’s sale/.test(document.querySelector('[data-out]').textContent)") and pg.is_visible('[data-k="sale.held"]'))
            check(vn + ': no script errors (SSD sale)', not errs, errs); ctx.close()
            # ---- 2. the HDB upgrade address is Upgrade from HDB again (V3.4) ----
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/hdb-upgrade/'); pg.wait_for_selector('[data-f3="upgrade"]')
            check(vn + ': the HDB upgrade address opens the four-step thread', pg.locator('[data-step]').count() == 4)
            check(vn + ': nothing personal in the address', 'price' not in pg.url and 'income' not in pg.url)
            check(vn + ': no script errors (upgrade address)', not errs, errs); ctx.close()
            # ---- 3. the budget -> Budget Search, only when Explore is pressed ----
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-f3="borrow"]')
            typ(pg, 'p.0.age', '35'); typ(pg, 'p.0.fixed', '12,000'); typ(pg, 'cash', '300,000'); typ(pg, 'cpf', '200,000'); until(pg, budget_ready); until(pg, settled)
            b0 = num(pg.inner_text('[data-max]'))
            check(vn + ': nothing is handed to Budget Search while the figures are worked out', ss(pg, 'kpt.handoff') is None)
            check(vn + ': no budget in the Explore link', '?' not in (pg.get_attribute('[data-to-homes]', 'href') or ''))
            pg.click('[data-to-homes]'); pg.wait_for_url('**/what-can-i-buy/**', timeout=10000); pg.wait_for_selector('#kdBudget', timeout=10000)
            h = ss(pg, 'kpt.handoff') or {}
            check(vn + ': pressing Explore hands the budget on, from the planner', h.get('from') == 'planner' and (h.get('budget') or {}).get('high') == b0, h)
            check(vn + ': Budget Search opens “From your plan”', until(pg, "()=>/From your plan/.test(document.body.innerText)"), pg.inner_text('body')[:200])
            check(vn + ': no budget in the address', str(b0) not in pg.url)
            check(vn + ': no script errors (Budget Search)', not errs, errs); ctx.close()
            # ---- 4. a price from Research ----
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/'); pg.evaluate("()=>sessionStorage.setItem('gw.fin.v1', JSON.stringify({buyPrice:'1,500,000', buyFrom:'typical'}))")
            pg.goto(B + '/tools/payment-planner/?j=1'); pg.wait_for_selector('[data-f3="pay"]')
            check(vn + ': a price from Research fills the cost page’s price and says where it came from', until(pg, "()=>document.querySelector('[data-k=\"price\"]').value==='1,500,000'") and 'typical recent price' in pg.inner_text('[data-from-research]'))
            typ(pg, 'price', '1,400,000')
            check(vn + ': changing the price removes the note', until(pg, "()=>document.querySelector('[data-from-research]').hidden"))
            check(vn + ': no price in the address', '1500000' not in pg.url and '1,500,000' not in pg.url)
            ctx.close()
            # ---- 5. C1 rules on the page ----
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-f3="borrow"]'); pg.evaluate(DW)
            seg(pg, 'n', '2'); typ(pg, 'p.0.age', '35'); typ(pg, 'p.0.fixed', '9,000'); typ(pg, 'p.1.age', '33'); typ(pg, 'p.1.fixed', '7,000'); typ(pg, 'cash', '300,000'); typ(pg, 'cpf', '250,000')
            pg.locator('[data-k="p.1.res"]').select_option('PR')
            check(vn + ': a Citizen and a PR buying: the married question appears', until(pg, "()=>{const g=document.querySelector('[data-k=\"couple\"]');return g&&g.offsetParent}"))
            seg(pg, 'couple', 'no'); until(pg, budget_ready); pg.wait_for_function("()=>/ABSD/.test(document.querySelector('[data-out]').textContent)"); notm = num(pg.inner_text('[data-max]'))
            seg(pg, 'couple', 'yes')
            check(vn + ': married: no ABSD (IRAS remits it), so a higher budget', until(pg, "(b)=>{const m=document.querySelector('[data-max]');return m&&parseInt(m.textContent.replace(/\\D/g,''))>b&&!/ABSD/.test(document.querySelector('[data-out]').textContent)}", notm))
            pg.locator('[data-k="p.1.res"]').select_option('SC'); until(pg, budget_ready); pg.wait_for_function("()=>!/ABSD/.test(document.querySelector('[data-out]').textContent)"); sc = num(pg.inner_text('[data-max]'))
            check(vn + ': two Citizens: no married question', not pg.is_visible('[data-k="couple"]'))
            pg.locator('[data-k="p.1.res"]').select_option('FTA')
            check(vn + ': an FTA national pays as a Citizen: the same budget', until(pg, "(b)=>{const m=document.querySelector('[data-max]');return m&&parseInt(m.textContent.replace(/\\D/g,''))===b}", sc))
            pg.locator('[data-k="p.1.res"]').select_option('SC'); seg(pg, 'homes', '1'); seg(pg, 'whose', '1')
            check(vn + ': the second buyer owns a home: CPF balances are asked before any budget (the full OA is not assumed)', until(pg, "()=>!document.querySelector('[data-cpf2]').hidden&&/CPF balances/.test(document.querySelector('[data-out]').textContent)"))
            seg(pg, 'cover95', 'yes'); typ(pg, 'cpfBal.0.oa', '150,000'); typ(pg, 'cpfBal.0.sa', '90,000'); typ(pg, 'cpfBal.1.oa', '120,000'); typ(pg, 'cpfBal.1.sa', '80,000')
            check(vn + ': with the balances: the co-buyer’s home brings ABSD into the budget', until(pg, "()=>/\\(ABSD \\$/.test(document.querySelector('[data-out]').textContent)"), out(pg)[:400])
            check(vn + ': no script errors (C1)', not errs, errs); ctx.close()
            # ---- 6. Clear all my figures ----
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/tdsr/'); pg.wait_for_selector('[data-out]'); typ(pg, 'p.0.age', '35'); typ(pg, 'p.0.fixed', '8,000'); until(pg, "()=>window.__f3Settled&&window.__f3Settled()&&!!sessionStorage.getItem('gw.fin3.v1')")
            pg.evaluate("()=>{const b=document.querySelector('[data-gw-clear-all]'); b.click()}")
            yes = pg.query_selector('[data-gw-clear-yes], .gw-clear-yes, [data-gw-clear-confirm]')
            if yes: pg.evaluate("()=>{const y=document.querySelector('[data-gw-clear-yes], .gw-clear-yes, [data-gw-clear-confirm]'); y.click()}")
            pg.wait_for_function("()=>{try{const s=JSON.parse(sessionStorage.getItem('gw.fin3.v1')||'{}');return !s.raw||!s.raw['p.0.age']}catch(e){return false}}", timeout=8000)
            pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-f3="borrow"]')
            check(vn + ': “Clear all my figures” clears the calculators', val(pg, 'p.0.age') == '' and not pg.is_visible('[data-carry]'))
            ctx.close()
        br.close()
finally:
    srv.terminate()
print('fin3-connect-render: %d passed, %d failed' % (ok, fail))
sys.exit(1 if fail else 0)
