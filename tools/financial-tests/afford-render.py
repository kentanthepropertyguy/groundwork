import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""Browser checks for the Planner's single result screen, the Explore handoff and the Guide Me / home buy entries.
Run from the site folder:  python3 tools/financial-tests/afford-render.py
Reference: income $21,000, cash $100k, CPF $200k, 2%, 28 years. One headline; no reserve; the buyer's own maximum shows no $0 shortfall."""
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
def money(t):
    m = re.search(r'([\d.,]+)\s*m\b', t)
    if m and '$' in t: return int(float(m.group(1)) * 1_000_000)
    return int(re.sub(r'[^\d]', '', t) or 0)
def page(br, kw):
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    return ctx, pg, errs
def fill(pg, income='21,000', cash='100,000', cpf='200,000'):
    pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-pa]')
    pg.fill('[data-k="buyers.0.age"]', '35'); pg.fill('[data-k="buyers.0.fixed"]', income)
    pg.click('.pa-chips[data-k="owns"] [data-v="none"]'); pg.click('.pa-chips[data-k="kind"] [data-v="completed"]')
    pg.fill('[data-k="cash"]', cash); pg.fill('[data-k="cpf"]', cpf); pg.fill('[data-k="ratePct"]', '2'); pg.fill('[data-k="years"]', '28')
    settle(pg)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        ctx, pg, errs = page(br, kw); fill(pg)
        mx = money(pg.inner_text('[data-max]'))
        check(vn + ': one headline maximum, $1,087,000 (funds-limited, rounded down to the nearest $1,000)', mx == 1_087_000 and '$1,087,000' in pg.inner_text('[data-max]'), pg.inner_text('[data-max]'))
        txt = pg.inner_text('[data-pa]')
        check(vn + ': headline reads "Your maximum property budget"', re.search(r'your maximum property budget', txt, re.I) is not None)
        figs = pg.eval_on_selector_all('.pa-fig', 'e=>e.map(x=>x.innerText.replace(/\\s+/g," ").trim())')
        check(vn + ': three figures under it: borrowing capacity, loan at this price, monthly mortgage', len(figs) == 3 and 'orrowing capacity' in figs[0] and 'oan at this' in figs[1] and 'onthly' in figs[2], figs)
        cap = money(re.sub(r'^[^$]*', '', figs[0])) if figs else 0   # '$2.33m'
        check(vn + ': borrowing capacity is the income figure, about $2.3m, not the headline', 2_250_000 <= cap <= 2_400_000, figs[:1])
        why = pg.inner_text('[data-why]')
        check(vn + ': one sentence says cash and CPF are the limit', 'limited by your available cash and CPF' in why, why)
        check(vn + ': no reserve / comfortable wording on the screen', not re.search(r'comfortabl|cushion|emergency|six months|6 months|reserve', txt, re.I), re.findall(r'.{20}(?:comfortabl|cushion|emergency|reserve).{20}', txt, re.I)[:2])
        check(vn + ': no prominent shortfall at the buyer\'s own maximum', pg.inner_text('[data-status]').strip() == '' or 'short' not in pg.inner_text('[data-status]').lower(), pg.inner_text('[data-status]'))
        # alternative price
        pg.fill('#pa-price', '900,000'); settle(pg)
        st = pg.inner_text('[data-status]')
        check(vn + ': $900,000 is affordable and says so', re.search(r'afford|within|enough|works|covered', st, re.I) is not None, st)
        check(vn + ': $900,000 shows the loan, monthly and cash/CPF needed', pg.inner_text('[data-tiles]').count('$') >= 3, pg.inner_text('[data-tiles]'))
        pg.fill('#pa-price', '1,300,000'); settle(pg)
        st = pg.inner_text('[data-status]'); nx = pg.inner_text('[data-next]')
        check(vn + ': $1,300,000 reports a cash/CPF shortfall in dollars', re.search(r'short|more|need', st, re.I) and st.count('$') >= 1, st)
        check(vn + ': $1,300,000 offers fixes', len(nx) > 20, nx)
        pg.click('[data-reset-price]'); settle(pg)
        check(vn + ': reset returns to the maximum with no status banner', pg.inner_text('[data-status]').strip() == '' and money(pg.inner_text('[data-max]')) == mx)
        # breakdown
        pg.click('[data-how-d] summary' if vn == 'desktop' else '[data-how-d] summary, [data-how] summary')
        dl = pg.evaluate("document.querySelector('[data-how-d],[data-how]').textContent")
        check(vn + ': one breakdown holds the funds price, income capacity and loan used', re.search(r'cash and CPF', dl, re.I) and re.search(r'income', dl, re.I) and re.search(r'loan', dl, re.I), dl[:200])
        check(vn + ': the breakdown keeps the exact figure ($1,087,588) beside the rounded one', '$1,087,588' in dl and 'nearest $1,000' in dl, dl[:300])
        check(vn + ': the breakdown says legal and valuation fees are not included', re.search(r'Not included: legal and valuation fees', pg.inner_text('[data-how-d], [data-how]')) is not None)
        # explore
        h = pg.evaluate("sessionStorage.getItem('kpt.handoff')")
        hd = json.loads(h) if h else {}
        check(vn + ': the plan is handed on with a budget range, from the planner', hd.get('from') == 'planner' and hd.get('budget', {}).get('low', 0) > 0, h)
        check(vn + ': no budget in the Explore link\'s URL', '?' not in (pg.get_attribute('[data-pa-explore]', 'href') or ''), pg.get_attribute('[data-pa-explore]', 'href'))
        pg.click('[data-pa-explore]'); pg.wait_for_url('**/what-can-i-buy/**', timeout=10000); pg.wait_for_selector('#kdBudget', timeout=10000)
        body = pg.inner_text('body')
        check(vn + ': Budget Search opens prefilled "From your plan"', 'From your plan' in body, body[:200])
        check(vn + ': the budget field carries the planner figure', money(pg.input_value('#kdBudget')) == 1_087_000, pg.input_value('#kdBudget'))
        check(vn + ': no budget or typed text in the page URL', not re.search(r'[?&#](budget|b|q)=', pg.url), pg.url)
        # preferences persist: set 3-bedroom resale, show, come back
        pg.click('[data-f=seg][data-k=sale][data-v=new]')
        pg.click('[data-f=show]'); pg.wait_for_selector('#kdH', timeout=15000)
        pg.goto(B + '/tools/what-can-i-buy/'); pg.wait_for_function("document.querySelector('#kdH')||document.querySelector('#kdBudget')", timeout=10000); pg.wait_for_timeout(500)
        check(vn + ': coming back reopens the saved search, not an empty form', pg.query_selector('#kdH') is not None)
        # research budget option shares it
        pg.goto(B + '/research/#/budget'); pg.wait_for_function("document.querySelector('#kdH')||document.querySelector('#kdBudget')", timeout=10000); pg.wait_for_timeout(500)
        bt = pg.inner_text('body'); bv = money(pg.input_value('#kdBudget')) if pg.query_selector('#kdBudget') and pg.is_visible('#kdBudget') else 0
        check(vn + ': Research "What can this budget buy?" picks up the same plan', 'From your plan' in bt or pg.query_selector('#kdH') is not None or bv == 1_087_000, bt[:300])
        check(vn + ': no script errors', not errs, errs)
        ctx.close()
    # income-limited sentence
    ctx, pg, errs = page(br, dict(viewport={'width': 1440, 'height': 900})); fill(pg, income='4,000', cash='400,000', cpf='400,000')
    why = pg.inner_text('[data-why]')
    check('income-limited: sentence names borrowing capacity', 'limited by your borrowing capacity' in why, why)
    ctx.close()
    # Guide Me + home
    ctx, pg, errs = page(br, dict(viewport={'width': 1440, 'height': 900}))
    pg.goto(B + '/journey/#buy'); pg.wait_for_selector('#buy')
    steps = pg.eval_on_selector_all('#buy .gw-step h3', 'e=>e.map(x=>x.innerText)')
    check('Guide Me buy path: budget first, then explore, research, payments, ask Ken', steps[:3] == ['Work out your maximum budget', 'Explore properties within your budget', 'Research the developments that fit'] and len(steps) == 5, steps)
    hrefs = pg.eval_on_selector_all('#buy .gw-step a.gw-btn', 'e=>e.map(x=>x.getAttribute("href"))')
    check('Guide Me buy path links to planner, Budget Search and the Map', hrefs[0].endswith('tools/planner/') and hrefs[1].endswith('what-can-i-buy/') and hrefs[2].endswith('research/map/'), hrefs)
    pg.goto(B + '/'); pg.wait_for_selector('main, .gw-hero')
    allh = pg.eval_on_selector_all('a', 'e=>e.map(x=>x.getAttribute("href")||"")')
    check('home: the buy door leads to the maximum-budget planner', any(h.endswith('tools/planner/') for h in allh))
    check('no page script errors on journey/home', not errs, errs)
    ctx.close(); br.close()
finally:
    srv.terminate()
print(f'\n{ok} passed, {fail} failed')
sys.exit(1 if fail else 0)
