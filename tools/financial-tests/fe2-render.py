import os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""Financial Experience V2 browser checks (25 Oct 2026), desktop 1280 and phone 390:
  Payment timeline: first and upfront payments lead, no "Total to pay", payments in three parts; borrower profiles (one or two), who takes the loan,
  the income-weighted age said from the engine; sale timing (during construction, after TOP, not decided) and what each asks; what to prepare;
  the optional scenario comparison. What can I afford?: the preview before any figure. TDSR: one or two borrowers chosen up front.
  The journey carries both borrowers to the timeline. No fixed waits: each step waits for the page to show its result.
  Run from the site folder: python3 tools/financial-tests/fe2-render.py"""
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
def page(br, kw):
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net|onemap\.gov\.sg'), lambda r: r.fulfill(status=200, body=''))
    return ctx, pg, errs
def chip(pg, k, v): pg.evaluate("([k,v])=>{const b=document.querySelector('[data-k=\"'+k+'\"] button[data-v=\"'+v+'\"]'); if(!b) throw new Error('no chip '+k+'='+v); b.click()}", [k, v])
def typ(pg, k, v): pg.fill(f'input[data-k="{k}"]', v)
def until(pg, js, arg=None):
    try: pg.wait_for_function(js, arg=arg, timeout=8000); return True
    except Exception: return False
def vis(pg, sel): return pg.is_visible(sel)
def txt(pg, sel): return pg.inner_text(sel) if pg.query_selector(sel) else ''
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vn, kw in (('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('phone', {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True})):
            # ---------------- Payment timeline ----------------
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/payment-planner/'); pg.wait_for_selector('[data-k="kind"]', state='attached')
            typ(pg, 'price', '1,800,000'); pg.fill('input[data-k="otp"]', '2026-11-02')
            check(vn + ': schedule leads with the first payment and the upfront payments', until(pg, "()=>/Upfront payments/.test((document.querySelector('[data-sched-sum]')||{}).textContent||'')") and 'First payment' in txt(pg, '[data-sched-sum]') and '$419,600' in txt(pg, '[data-sched-sum]'), txt(pg, '[data-sched-sum]'))
            heads = pg.eval_on_selector_all('#pl-sched-table tr.pl-jsec b', 'els=>els.map(e=>e.textContent)')
            check(vn + ': the payments are in three parts, in order', heads == ['Upfront payments', 'During construction', 'At TOP and completion'], heads)
            check(vn + ': no “Total to pay” anywhere on the schedule', 'Total to pay' not in pg.inner_text('body') and not pg.query_selector('#pl-sched-table tfoot'))
            pg.click('[data-tab="funding"]'); pg.wait_for_selector('input[data-k="borrowers.0.age"]', state='visible')
            check(vn + ': one buyer: one borrower profile, no “who takes the loan”', vis(pg, 'input[data-k="borrowers.0.age"]') and not vis(pg, 'input[data-k="borrowers.1.age"]') and not vis(pg, '[data-k="loanWho"]'))
            check(vn + ': the second buyer can be added from the loan section', vis(pg, '[data-add-buyer]'))
            pg.click('[data-add-buyer]')
            check(vn + ': adding a buyer opens the second buyer in the property and a second profile', until(pg, "()=>{const r=document.querySelector('[data-row=\"buyers.1\"]');return r&&!r.hidden}") and vis(pg, 'input[data-k="borrowers.1.age"]') and vis(pg, '[data-k="loanWho"]'))
            pg.click('[data-tab="funding"]')
            typ(pg, 'cash', '400,000'); typ(pg, 'cpf', '200,000'); typ(pg, 'borrowers.0.age', '45'); typ(pg, 'borrowers.0.fixed', '15,000'); typ(pg, 'borrowers.1.age', '38'); typ(pg, 'borrowers.1.fixed', '9,000')
            check(vn + ': two borrowers: the income-weighted age (42.4) and its standard tenure (22 years) are said', until(pg, "()=>/42\\.4/.test((document.querySelector('[data-joint]')||{}).textContent||'')") and '22 years' in txt(pg, '[data-joint]'), txt(pg, '[data-joint]'))
            check(vn + ': two borrowers: the result shows what to prepare, the amount due apart from what pays it', until(pg, "()=>!!document.querySelector('.pl-prep')") and 'Paid from' in txt(pg, '#pl-fund-table thead') and 'Amount due' in txt(pg, '#pl-fund-table thead') and not pg.query_selector('#pl-fund-table tfoot'))
            loan2 = txt(pg, '.pl-sf-loan')
            check(vn + ': two borrowers: the loan is the 75% limit, $1,350,000', '$1,350,000' in loan2, loan2)
            chip(pg, 'loanWho', '0')
            check(vn + ': one of two buyers borrows: one profile, and the line says the loan is on their figures', until(pg, "()=>/Only the first buyer borrows/.test((document.querySelector('[data-joint]')||{}).textContent||'')") and not vis(pg, 'input[data-k="borrowers.1.age"]'))
            chip(pg, 'loanWho', 'both')
            # a home to sell: when the sale completes
            chip(pg, 'buyers.0.owned', '1'); chip(pg, 'order', 'buy')
            check(vn + ': buying first defaults to “Not decided yet”: no sale date, sale price, CPF refund or ABSD refund is asked', until(pg, "()=>{const b=document.querySelector('[data-k=\"saleWhen\"] [data-v=\"unsure\"]');return b&&b.offsetParent&&b.getAttribute('aria-pressed')==='true'}") and not vis(pg, 'input[data-k="saleMonth"]') and not vis(pg, 'input[data-k="salePrice"]') and not vis(pg, 'input[data-k="saleRefund"]') and not vis(pg, 'input[data-k="refundAssume"]'))
            chip(pg, 'saleWhen', 'date')
            check(vn + ': choosing “during construction” asks the timing (5 months after the option to start) and the sale figures', until(pg, "()=>{const i=document.querySelector('input[data-k=\"saleMonth\"]');return i&&i.offsetParent}") and pg.input_value('input[data-k="saleMonth"]') == '5' and vis(pg, 'input[data-k="salePrice"]') and vis(pg, 'input[data-k="refundAssume"]'))
            chip(pg, 'saleWhen', 'afterKeys')
            check(vn + ': after TOP: months after the keys, not after the option', until(pg, "()=>{const i=document.querySelector('input[data-k=\"saleAfterKeys\"]');return i&&i.offsetParent}") and not vis(pg, 'input[data-k="saleMonth"]') and vis(pg, 'input[data-k="salePrice"]'))
            chip(pg, 'saleWhen', 'unsure')
            check(vn + ': not decided: no sale price or CPF refund is asked', until(pg, "()=>{const i=document.querySelector('input[data-k=\"salePrice\"]');return !i.offsetParent}") and not vis(pg, 'input[data-k="saleRefund"]'))
            chip(pg, 'flatLoan', 'none')
            if vis(pg, '[data-k="cover95"]'):
                chip(pg, 'cover95', 'yes'); typ(pg, 'cpfBal.0.oa', '250,000'); typ(pg, 'cpfBal.0.sa', '150,000'); typ(pg, 'cpfBal.1.oa', '120,000'); typ(pg, 'cpfBal.1.sa', '80,000')
            check(vn + ': not decided: the result says no sale money is counted', until(pg, "()=>/Sale date not decided/.test((document.querySelector('[data-result]')||{}).textContent||'')"), txt(pg, '[data-result]')[:200])
            # the optional scenario
            check(vn + ': the scenario comparison is offered, closed', until(pg, "()=>{const d=document.querySelector('[data-scn]');return d&&!d.hidden&&!d.open}"))
            pg.click('[data-scn] summary'); pg.fill('input[data-sk="rate"]', '3')
            check(vn + ': a 3% rate is compared with the plan', until(pg, "()=>/Scenario/.test((document.querySelector('[data-scn-out]')||{}).textContent||'')") and '3%' in txt(pg, '[data-scn-out]') and 'Monthly mortgage' in txt(pg, '[data-scn-out]'), txt(pg, '[data-scn-out]')[:300])
            pg.click('[data-sk="sale"] [data-v="sell"]')
            check(vn + ': selling first instead is compared, with its ABSD', until(pg, "()=>/sell first/.test((document.querySelector('[data-scn-out]')||{}).textContent||'')") and 'ABSD' in txt(pg, '[data-scn-out]'), txt(pg, '[data-scn-out]')[:300])
            pg.fill('input[data-sk="years"]', '60')
            check(vn + ': an impossible tenure is refused, not compared', until(pg, "()=>/between/.test((document.querySelector('[data-scn-n]')||{}).textContent||'')"))
            check(vn + ': the plan itself is unchanged by the scenario', loan2 == txt(pg, '.pl-sf-loan'))
            check(vn + ': no “Total to pay” on the funding screen', 'Total to pay' not in pg.inner_text('body'))
            check(vn + ': no sideways scroll', pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'))
            check(vn + ': timeline: no script errors', not errs, errs)
            ctx.close()
            # ---------------- What can I afford?: the preview before any figure ----------------
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/planner/'); pg.wait_for_selector('.pa-ready', state='attached')
            if vn == 'desktop':
                prev = txt(pg, '[data-pa]') if pg.query_selector('[data-pa]') else pg.inner_text('body')
                check(vn + ': What can I afford? previews the result categories with no number', all(x in prev for x in ['Maximum property budget', 'Estimated bank loan', 'Monthly mortgage', 'Loan tenure']) and pg.inner_text('.pa-ready .gw-ready-v').strip() == '$ —')
                check(vn + ': ... and lists what unlocks it, none ticked yet', pg.locator('.pa-need li').count() == 4 and pg.locator('.pa-need li.done').count() == 0)
                pg.fill('[data-k="buyers.0.age"]', '35')
                check(vn + ': ... and ticks an entry as it is made', until(pg, "()=>document.querySelectorAll('.pa-need li.done').length===1"))
            else:
                check(vn + ': What can I afford? on a phone keeps one line above the form, so age and income stay on the first screen', vis(pg, '.pa-prev-m') and not vis(pg, '.pa-ready') and pg.locator('[data-k="buyers.0.fixed"]').evaluate('e=>e.getBoundingClientRect().bottom') < kw['viewport']['height'])
            check(vn + ': What can I afford?: no script errors', not errs, errs)
            ctx.close()
            # ---------------- TDSR: one or two borrowers, chosen up front ----------------
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/tdsr/'); pg.wait_for_selector('[data-bn]')
            check(vn + ': TDSR: “On my own / With a co-borrower” is the first choice', vis(pg, '[data-bn] [data-bn-v="2"]') and not vis(pg, '[data-row="borrowers.1"]') and not vis(pg, '[data-add="borrowers.1"]'))
            pg.click('[data-bn] [data-bn-v="2"]')
            check(vn + ': TDSR: a co-borrower opens the second profile', until(pg, "()=>!document.querySelector('[data-row=\"borrowers.1\"]').hidden") and pg.get_attribute('[data-bn] [data-bn-v="2"]', 'aria-pressed') == 'true')
            pg.fill('input[data-k="borrowers.0.age"]', '45'); pg.fill('input[data-k="borrowers.0.fixed"]', '15,000'); pg.fill('input[data-k="borrowers.1.age"]', '38'); pg.fill('input[data-k="borrowers.1.fixed"]', '9,000')
            check(vn + ': TDSR: the two incomes are tested together', until(pg, "()=>/\\$[1-9]/.test((document.querySelector('[data-out]')||{}).textContent||'')"))
            pg.click('[data-row="borrowers.1"] [data-remove]')
            check(vn + ': TDSR: removing the co-borrower sets the choice back', until(pg, "()=>document.querySelector('[data-bn] [data-bn-v=\"1\"]').getAttribute('aria-pressed')==='true'"))
            check(vn + ': TDSR: no script errors', not errs, errs)
            ctx.close()
        # ---------------- the journey: both borrowers travel from What can I afford? to the timeline ----------------
        ctx, pg, errs = page(br, {'viewport': {'width': 1280, 'height': 900}}); pg.goto(B + '/tools/planner/?j=1'); pg.wait_for_selector('[data-pa]')
        chip(pg, 'who', 'two'); pg.fill('[data-k="buyers.0.age"]', '45'); pg.fill('[data-k="buyers.0.fixed"]', '15,000'); pg.fill('[data-k="buyers.1.age"]', '38'); pg.fill('[data-k="buyers.1.fixed"]', '9,000')
        until(pg, "()=>{try{const s=JSON.parse(sessionStorage.getItem('gw.fin.v1')||'{}');return s['borrowers.1.age']==='38'}catch(e){return false}}")
        pg.goto(B + '/tools/payment-planner/?j=1#funding'); pg.wait_for_selector('input[data-k="borrowers.1.age"]', state='attached')
        check('journey: the timeline opens with both borrowers’ ages and incomes', until(pg, "()=>{const a=document.querySelector('input[data-k=\"borrowers.1.age\"]');return a&&a.offsetParent&&a.value==='38'}") and pg.input_value('input[data-k="borrowers.0.fixed"]') == '15,000' and pg.input_value('input[data-k="borrowers.1.fixed"]') == '9,000')
        check('journey: no address carries a figure', '45' not in pg.url and '15' not in pg.url.split('#')[0].split('/')[-1])
        check('journey: no script errors', not errs, errs)
        ctx.close(); br.close()
finally:
    srv.terminate()
print('fe2-render: %d passed, %d failed' % (ok, fail))
sys.exit(1 if fail else 0)
