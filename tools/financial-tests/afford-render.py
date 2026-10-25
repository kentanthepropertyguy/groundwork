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
        check(vn + ': two supporting figures: monthly mortgage and borrowing capacity', len(figs) == 2 and 'onthly mortgage' in figs[0] and 'orrowing capacity' in figs[1], figs)
        cap = money(re.sub(r'^[^$]*', '', figs[1])) if len(figs) > 1 else 0   # '$2.41m'
        check(vn + ': borrowing capacity is the income figure, about $2.4m, not the headline', 2_250_000 <= cap <= 2_450_000, figs[-1:])
        why = pg.inner_text('[data-why]')
        check(vn + ': one sentence says cash and CPF are the limit', 'limited by your available cash and CPF' in why, why)
        check(vn + ': no reserve / comfortable wording on the screen', not re.search(r'comfortabl|cushion|emergency|six months|6 months|reserve', txt, re.I), re.findall(r'.{20}(?:comfortabl|cushion|emergency|reserve).{20}', txt, re.I)[:2])
        # the three checks stay separate and never overstate
        dl = pg.inner_text('[data-dateline]')
        check(vn + ': payment dates say what they were based on (standard schedule), not "verified"', 'Standard schedule' in dl and not re.search(r'verified|payments checked', dl, re.I), dl)
        check(vn + ': eligibility is said once, as not confirmed', 'not confirmed' in pg.inner_text('[data-elig]').lower(), pg.inner_text('[data-elig]'))
        check(vn + ': no "approved / qualify / guaranteed" claim anywhere in the answer', not re.search(r'guarantee|you qualify|you are eligible|approved', pg.inner_text('[data-head]'), re.I), pg.inner_text('[data-head]')[:200])
        check(vn + ': payment dates, assumptions and the working are closed by default', pg.eval_on_selector_all('[data-how] details', 'e=>e.length>=3&&e.every(x=>!x.open)'))
        check(vn + ': no slider is needed to try a price (a plain field)', pg.query_selector('[data-range]') is None and pg.query_selector('#pa-price') is not None)
        # a price: ONE answer for that price
        pg.fill('#pa-price', '900,000'); settle(pg)
        hd = pg.inner_text('[data-answer]')
        check(vn + ': $900,000 is affordable and says so in the headline', 'Within your budget' in hd, hd)
        f2 = pg.eval_on_selector_all('.pa-fig', 'e=>e.map(x=>x.innerText.replace(/\\s+/g," ").trim())')
        check(vn + ': $900,000 shows cash and CPF needed, the loan and the monthly mortgage as three figures', len(f2) == 3 and 'Cash and CPF needed' in f2[0] and 'ank loan' in f2[1] and 'onthly mortgage' in f2[2] and f2[1].count('$') >= 1, f2)
        check(vn + ': $900,000 states the cash and CPF needed and the minimum cash in the first figure', re.search(r'Cash and CPF needed \$246,600 At least \$66,600 in cash', f2[0]) is not None and 'You have $300,000' in f2[0], f2[0])
        check(vn + ': $900,000 lead is one short sentence, not the figures', pg.inner_text('[data-why]').strip() == '$33,400 of your cash would stay in hand after buying.', pg.inner_text('[data-why]'))
        check(vn + ': no second price card or status banner is drawn', pg.inner_text('[data-tiles]').strip() == '' and pg.inner_text('[data-status]').strip() == '')
        pg.fill('#pa-price', '1,300,000'); settle(pg)
        hd = pg.inner_text('[data-answer]'); nx = pg.inner_text('[data-next]')
        check(vn + ': $1,300,000 reports the cash/CPF shortfall in dollars as the headline', re.search(r'^\$[\d,]+ short$', hd.strip()) is not None, hd)
        check(vn + ': $1,300,000 offers fixes', len(nx) > 20, nx)
        pg.fill('#pa-price', '2,500,000'); settle(pg)
        hd = pg.inner_text('[data-answer]'); wy = pg.inner_text('[data-why]')
        check(vn + ': $2.5m: headline is the specific shortfall, $419,600', hd.strip() == '$419,600 short', hd)
        check(vn + ': $2.5m: states the minimum cash ($219,600) and the cash CPF cannot cover ($119,600)', '$119,600' in wy and 'CPF cannot cover' in wy and 'At least $219,600 in cash' in pg.inner_text('.pa-figs').replace('\n', ' '), wy)
        dl = pg.inner_text('[data-dateline]')
        check(vn + ': $2.5m: the first date that fails is named with its amount', re.search(r'First short on .*\$25,000', dl) is not None, dl)
        pg.click('[data-open-dates]'); pg.wait_for_timeout(200)
        check(vn + ': "See dates" opens the schedule with the exercise payment', pg.eval_on_selector('[data-dates-d]', 'e=>e.open') and 'Exercise' in pg.inner_text('[data-dates-d]'))
        pg.click('[data-reset-price]'); settle(pg)
        check(vn + ': reset returns to the maximum', money(pg.inner_text('[data-max]')) == mx and pg.inner_text('[data-status]').strip() == '')
        # breakdown
        pg.click('[data-how-d] summary')
        dl = pg.evaluate("document.querySelector('[data-how-d]').textContent")
        check(vn + ': one breakdown holds the funds price, income capacity and loan used', re.search(r'cash and CPF', dl, re.I) and re.search(r'income', dl, re.I) and re.search(r'loan', dl, re.I), dl[:200])
        check(vn + ': the breakdown keeps the exact figure ($1,087,588) beside the rounded one', '$1,087,588' in dl and 'nearest $1,000' in dl, dl[:300])
        check(vn + ': the breakdown says legal and valuation fees are not included', re.search(r'Not included: legal and valuation fees', pg.inner_text('[data-how-d]')) is not None)
        pg.click('[data-asm-d] summary')
        asm = pg.inner_text('[data-asm-d]')
        check(vn + ': assumptions state eligibility is not confirmed and CPF is as entered, and hold the tenure', 'Eligibility is not confirmed' in asm and 'CPF is as you entered it' in asm and 'Loan tenure' in asm, asm[:300])
        # explore
        # M1 (25 Oct 2026): a standalone calculation hands nothing to Budget Search until the visitor presses Explore
        check(vn + ': standalone: nothing is handed to Budget Search while the figures are only being worked out', pg.evaluate("sessionStorage.getItem('kpt.handoff')") is None, pg.evaluate("sessionStorage.getItem('kpt.handoff')"))
        check(vn + ': no budget in the Explore link\'s URL', '?' not in (pg.get_attribute('[data-pa-explore]', 'href') or ''), pg.get_attribute('[data-pa-explore]', 'href'))
        pg.click('[data-pa-explore]'); pg.wait_for_url('**/what-can-i-buy/**', timeout=10000); pg.wait_for_selector('#kdBudget', timeout=10000)
        body = pg.inner_text('body')
        h = pg.evaluate("sessionStorage.getItem('kpt.handoff')"); hd = json.loads(h) if h else {}
        check(vn + ': pressing Explore hands the plan on with a budget range, from the planner', hd.get('from') == 'planner' and hd.get('budget', {}).get('low', 0) > 0 and hd.get('j') == 0, h)
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
    # M1: a budget worked out in a standalone calculation is not inherited by Budget Search when it is opened another way (menu, search, typed address)
    ctx, pg, errs = page(br, dict(viewport={'width': 1440, 'height': 900})); fill(pg)
    check('standalone then Budget Search by another route: a maximum was calculated', money(pg.inner_text('[data-max]')) == 1_087_000)
    pg.goto(B + '/tools/what-can-i-buy/'); pg.wait_for_function("document.querySelector('#kdH')||document.querySelector('#kdBudget')", timeout=10000); pg.wait_for_timeout(500)
    inh = pg.inner_text('body'); bv2 = money(pg.input_value('#kdBudget')) if pg.query_selector('#kdBudget') and pg.is_visible('#kdBudget') else 0
    check('standalone then Budget Search by another route: no "From your plan" and no inherited budget', 'From your plan' not in inh and bv2 != 1_087_000 and pg.evaluate("sessionStorage.getItem('kpt.handoff')") is None, [bv2, inh[:160]])
    ctx.close()
    # selling first: what is in hand now is kept apart from what the sale adds only once it completes
    ctx, pg, errs = page(br, dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)); fill(pg, cash='100,000', cpf='200,000')
    pg.click('.pa-chips[data-k="owns"] [data-v="one"]'); pg.click('.pa-chips[data-k="home"] [data-v="sell"]')
    pg.click('.pa-chips[data-k="flat.hasLoan"] [data-v="yes"]'); pg.fill('[data-k="flat.instalment"]', '1,200')
    pg.fill('[data-k="flat.price"]', '900,000'); pg.fill('[data-k="flat.loan"]', '150,000'); pg.fill('[data-k="flat.cpfRefund"]', '280,000')
    pg.click('.pa-chips[data-k="order"] [data-v="sell"]'); settle(pg)
    smx = money(pg.inner_text('[data-max]'))
    check('sale: the maximum counts the sale (well above the $1,087,000 without it) and says income is the limit', smx > 3_000_000 and 'borrowing capacity' in pg.inner_text('[data-why]'), [smx, pg.inner_text('[data-why]')])
    sl = pg.inner_text('[data-sale-line]')
    check('sale: says what you have NOW ($100,000 cash, $200,000 CPF) and that the sale adds more only once it completes', 'You have $100,000 in cash and $200,000 in CPF now' in sl and 'only once it completes' in sl and '$280,000' in sl, sl)
    pg.fill('#pa-price', '3,400,000'); settle(pg)
    sw = pg.inner_text('[data-sale-warn]') if pg.query_selector('[data-sale-warn]') else ''
    check('sale: at $3.4m the option fee, exercise and stamp duty ($313,600) exceed what is in hand now and are flagged as a projection', 'Projected' in sw and '$313,600' in sw and 'before your sale completes' in sw, sw)
    # the early payments are cash (CPF cannot pay an option fee or reimburse the seller; it is released at completion), so they are compared with the $100,000 of cash, not cash + CPF
    pg.fill('#pa-price', '1,400,000'); settle(pg)
    sw = pg.inner_text('[data-sale-warn]') if pg.query_selector('[data-sale-warn]') else ''
    check('sale: at $1.4m the early payments ($110,600) exceed the $100,000 of cash in hand (CPF is not counted), so they are flagged', 'Projected' in sw and '$110,600' in sw and 'paid in cash' in sw, sw)
    pg.fill('#pa-price', '1,200,000'); settle(pg)
    check('sale: at $1.2m the price is within budget, the early payments ($92,600) fit the cash in hand, so no projection is shown', 'Within your budget' in pg.inner_text('[data-answer]') and pg.query_selector('[data-sale-warn]') is None, pg.inner_text('[data-answer]'))
    check('sale: the need line does not mix the sale into "have"', 'and have' not in pg.inner_text('[data-why]'), pg.inner_text('[data-why]'))
    check('sale: no script errors', not errs, errs); ctx.close()
    # a new launch: dates are NOT checked until the monthly amounts are entered; then they are labelled as theirs
    ctx, pg, errs = page(br, dict(viewport={'width': 1440, 'height': 900})); fill(pg)
    pg.click('.pa-chips[data-k="kind"] [data-v="new"]'); pg.fill('#pa-price', '1,000,000'); settle(pg)
    dl = pg.inner_text('[data-dateline]')
    check('new launch: dates read "Not checked" and offer the monthly amounts, never "covered"', 'Not checked' in dl and 'Add monthly amounts' in dl and 'Covered' not in dl, dl)
    pg.fill('[data-k="saveMo"]', '2,000'); pg.fill('[data-k="cpfMo"]', '1,500'); settle(pg)
    dl = pg.inner_text('[data-dateline]')
    check('new launch: with monthly amounts the check is labelled as using them', 'Your monthly amounts' in dl, dl)
    ctx.close()
    # completed home: an option date typed by the buyer changes the label from "standard schedule"
    ctx, pg, errs = page(br, dict(viewport={'width': 1440, 'height': 900})); fill(pg); pg.fill('#pa-price', '900,000'); settle(pg)
    check('option date: standard schedule until the buyer types a date', 'Standard schedule' in pg.inner_text('[data-dateline]'), pg.inner_text('[data-dateline]'))
    pg.click('[data-adj] summary'); pg.fill('[data-k="otp"]', '2027-01-15'); pg.dispatch_event('[data-k="otp"]', 'change'); settle(pg)
    check('option date: the check says it is from the date entered', 'Your option date' in pg.inner_text('[data-dateline]'), pg.inner_text('[data-dateline]'))
    ctx.close()
    # a price arriving from Research (the shared store, never the address)
    ctx, pg, errs = page(br, dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))
    pg.goto(B + '/tools/planner/'); pg.evaluate("sessionStorage.setItem('gw.fin.v1', JSON.stringify({buyPrice: '2480000', buyFrom: 'typical'}))"); pg.goto(B + '/tools/planner/?j=1');   # C1: Research's links arrive marked as a journey pg.wait_for_selector('[data-pa]'); pg.wait_for_timeout(400)
    ih = pg.inner_text('[data-head]')
    check('Research price: before any entries the page names the price and asks only for age and income', 'Can you afford this price?' in ih and 'age and income' in ih and '2,480,000' not in pg.url, ih[:240])
    pg.fill('[data-k="buyers.0.age"]', '35'); pg.fill('[data-k="buyers.0.fixed"]', '21,000'); pg.click('.pa-chips[data-k="owns"] [data-v="none"]'); pg.click('.pa-chips[data-k="kind"] [data-v="completed"]')
    pg.fill('[data-k="cash"]', '100,000'); pg.fill('[data-k="cpf"]', '200,000'); settle(pg)
    hj = pg.evaluate("sessionStorage.getItem('kpt.handoff')"); hjd = json.loads(hj) if hj else {}
    check('journey (?j=1): the budget goes on to Budget Search as the figures change, marked as a journey', hjd.get('from') == 'planner' and hjd.get('j') == 1 and hjd.get('budget', {}).get('low', 0) > 0, hj)
    check('Research price: the answer is for that price ($413,600 short at $2.48m), with no slider to move', pg.inner_text('[data-answer]').strip() == '$413,600 short' and '$2.48m' in pg.inner_text('[data-head]').lower(), pg.inner_text('[data-head]')[:160])
    check('Research price: the source is named as a past-sales price, not a valuation or listing', 'typical recent price in past sales' in pg.inner_text('[data-price-from]') and 'not a valuation' in pg.inner_text('[data-price-from]'), pg.inner_text('[data-price-from]'))
    pg.fill('#pa-price', '2,000,000'); settle(pg)
    check('Research price: changing the price removes the source note', pg.is_hidden('[data-price-from]'))
    check('Research price: no price in the address, analytics or WhatsApp link', '2480000' not in pg.url and '2,480,000' not in (pg.get_attribute('[data-ask-wa]', 'href') or '') and '2480000' not in (pg.get_attribute('[data-ask-wa]', 'href') or ''))
    check('Research price: no script errors', not errs, errs); ctx.close()
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
