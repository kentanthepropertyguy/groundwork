import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""C1 browser checks (24 Oct 2026): the four accuracy corrections on the pages, and the entry-point rule for What can I afford?.
  B1 married couple and FTA nationality; B2 homes owned per buyer; B3 CPF for a second home; B4 borrowing capacity on the budget's basis and the buy-first instalment;
  standalone (from Tools: starts blank, shares nothing) and journey (?j=1: shares). Desktop 1440 and phone 390. Run from the site folder:
  python3 tools/financial-tests/c1-render.py"""
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
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=b''))
    return ctx, pg, errs
def settle(pg): pg.wait_for_function('window.__paSettled && window.__paSettled()'); pg.wait_for_timeout(300)
def chip(pg, k, v):   # a script click: the sticky header can cover a chip on a long form; the page listens to the same click
    pg.evaluate("([k,v])=>{const b=document.querySelector('[data-k=\"'+k+'\"] button[data-v=\"'+v+'\"]'); if(!b) throw new Error('no chip '+k+'='+v); b.click()}", [k, v])
def typ(pg, k, v): pg.fill(f'input[data-k="{k}"]', v)
def budget(pg): return num(pg.inner_text('[data-max]')) if pg.query_selector('[data-max]') else None
def ss(pg, k): v = pg.evaluate("k=>sessionStorage.getItem(k)", k); return json.loads(v) if v else None
def opt(pg, d):   # the option date (More options) fixes the year of CPF's retirement sums
    pg.evaluate("d=>{const det=document.querySelector('[data-adj]'); if(det) det.open=true; const e=document.querySelector('input[data-k=\"otp\"]'); e.value=d; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}))}", d)
def couple_page(pg, res2):
    chip(pg, 'who', 'two'); chip(pg, 'kind', 'completed'); opt(pg, '2026-11-01')
    typ(pg, 'buyers.0.age', '35'); typ(pg, 'buyers.0.fixed', '8000'); typ(pg, 'buyers.1.age', '34'); typ(pg, 'buyers.1.fixed', '7000')
    chip(pg, 'buyers.1.res', res2); chip(pg, 'owns', 'none'); chip(pg, 'owns2', 'none'); typ(pg, 'cash', '250000'); typ(pg, 'cpf', '150000'); settle(pg)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        # ---------------- What can I afford? ----------------
        ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-pa]')
        couple_page(pg, 'PR')
        check(vn + ': B1 the married question appears for a Citizen + PR', pg.is_visible('[data-k="couple"]'))
        b0 = budget(pg); chip(pg, 'couple', 'yes'); settle(pg); b1 = budget(pg)
        check(vn + ': B1 married: $1,432,000 (ABSD remitted), not $1,221,000', (b0, b1) == (1221000, 1432000), (b0, b1))
        pg.evaluate("()=>{const d=document.querySelector('[data-how-d]'); if(d) d.open=true}")
        check(vn + ': B1 the working says the ABSD is remitted for a married couple', 'remitted in full at stamping' in pg.inner_text('[data-how]'))
        chip(pg, 'couple', 'no'); settle(pg); check(vn + ': B1 not married: back to $1,221,000', budget(pg) == 1221000, budget(pg))
        chip(pg, 'buyers.1.res', 'SC'); settle(pg); check(vn + ': B1 two Citizens: no married question (it changes nothing)', not pg.is_visible('[data-k="couple"]'))
        chip(pg, 'buyers.1.res', 'FR'); settle(pg); check(vn + ': B1 a foreigner gets the FTA question', pg.is_visible('[data-k="buyers.1.fta"]'))
        chip(pg, 'buyers.1.fta', 'yes'); settle(pg); check(vn + ': B1 an FTA national pays as a Citizen: $1,432,000', budget(pg) == 1432000, budget(pg))
        chip(pg, 'buyers.1.fta', 'no'); chip(pg, 'buyers.1.res', 'SC'); settle(pg)
        # B2: the second buyer owns a home, the first does not
        chip(pg, 'owns2', 'one'); settle(pg)
        check(vn + ': B2 the second buyer’s home brings up the home questions', pg.is_visible('[data-k="home"]'))
        chip(pg, 'home', 'keep'); chip(pg, 'flat.hasLoan', 'no'); typ(pg, 'cpf', '0'); settle(pg)
        pg.evaluate("()=>{const d=document.querySelector('[data-how-d]'); if(d) d.open=true}")
        check(vn + ': B2 the co-buyer’s home counts for ABSD (20%)', '(20%)' in pg.inner_text('[data-how]'), pg.inner_text('[data-how]')[:0])
        chip(pg, 'owns', 'one'); settle(pg)
        check(vn + ': B2 both own: “Do you own that home together?” is asked', pg.is_visible('[data-k="homeJoint"]'))
        check(vn + ': B2 ... and no answer is shown until it is answered', 'together' in pg.inner_text('[data-pa]').lower() and budget(pg) is None or pg.query_selector('.pa-head.held') is not None)
        chip(pg, 'homeJoint', 'yes'); settle(pg); check(vn + ': B2 answered: the budget is drawn', budget(pg) is not None)
        # B3: keeping the home with CPF planned
        typ(pg, 'cpf', '240000'); settle(pg)
        check(vn + ': B3 the CPF balances are asked while a home is kept', pg.is_visible('[data-cpf2]'))
        check(vn + ': B3 ... and the answer waits for them (the full OA is not assumed)', 'CPF balances' in pg.inner_text('[data-pa]'))
        ctx.close()
        ctx, pg, errs2 = page(br, kw); errs += errs2; pg.goto(B + '/tools/planner/'); pg.wait_for_selector('[data-pa]')
        chip(pg, 'who', 'two'); chip(pg, 'kind', 'completed'); opt(pg, '2026-11-01')
        typ(pg, 'buyers.0.age', '45'); typ(pg, 'buyers.0.fixed', '9000'); typ(pg, 'buyers.1.age', '43'); typ(pg, 'buyers.1.fixed', '7000')
        chip(pg, 'owns', 'one'); chip(pg, 'owns2', 'one'); chip(pg, 'homeJoint', 'yes'); chip(pg, 'home', 'keep'); chip(pg, 'flat.hasLoan', 'yes'); typ(pg, 'flat.instalment', '1100')
        typ(pg, 'cash', '400000'); typ(pg, 'cpf', '240000'); settle(pg)
        typ(pg, 'cpfBal.0.oa', '120000'); typ(pg, 'cpfBal.0.sa', '70000'); typ(pg, 'cpfBal.1.oa', '120000'); typ(pg, 'cpfBal.1.sa', '70000'); chip(pg, 'cover95', 'yes'); settle(pg)
        check(vn + ': B3 with the 2026 Basic Retirement Sum the budget is $724,000 (not $827,000)', budget(pg) == 724000, budget(pg))
        pg.evaluate("()=>{const d=document.querySelector('[data-asm-d]'); if(d) d.open=true}")
        check(vn + ': B3 the assumptions say what CPF counted and why', 'CPF counted: $159,600' in pg.inner_text('[data-pa]'))
        chip(pg, 'cover95', 'unsure'); settle(pg); check(vn + ': B3 not sure about 95: the Full Retirement Sum, $519,000', budget(pg) == 519000, budget(pg))
        # B4: selling, not sure yet: borrowing capacity on the kept-home basis
        chip(pg, 'cover95', 'yes'); chip(pg, 'home', 'sell'); typ(pg, 'flat.price', '600000'); typ(pg, 'flat.loan', '150000'); typ(pg, 'flat.cpfRefund', '250000'); chip(pg, 'order', 'unsure')
        typ(pg, 'flat.instalment', '2000'); typ(pg, 'cpf', '0'); typ(pg, 'cash', '300000'); typ(pg, 'buyers.0.age', '38'); typ(pg, 'buyers.1.age', '36'); settle(pg)
        cap = pg.evaluate("()=>{const f=[...document.querySelectorAll('.pa-fig')].find(x=>/Borrowing capacity/i.test(x.textContent)); return f? f.querySelector('.v').textContent : ''}")
        check(vn + ': B4 borrowing capacity counts the flat’s instalment ($1.35m, not $1.74m)', cap.startswith('$1.34m') or cap.startswith('$1.35m'), cap)
        # the 55+ owner's share of the refund
        typ(pg, 'buyers.0.age', '56'); settle(pg); check(vn + ': minor: an owner 55+ is asked for their share of the CPF refund', pg.is_visible('[data-k="flat.cpfRefund55"]'))
        # entry point: standalone from Tools, journey with ?j=1
        check(vn + ': standalone: nothing written to the shared figures', ss(pg, 'gw.fin.v1') is None, ss(pg, 'gw.fin.v1'))
        pg.goto(B + '/tools/'); pg.click('a.gw-tl[data-tool="planner"]'); pg.wait_for_selector('[data-pa]'); pg.wait_for_timeout(500)
        check(vn + ': standalone: opened again from Tools it starts blank (the last client’s figures are gone)', pg.input_value('[data-k="buyers.0.age"]') == '' and pg.input_value('[data-k="cash"]') == '', pg.input_value('[data-k="buyers.0.age"]'))
        typ(pg, 'buyers.0.age', '41'); typ(pg, 'buyers.0.fixed', '9000'); settle(pg); pg.reload(); pg.wait_for_selector('[data-pa]'); pg.wait_for_timeout(500)
        check(vn + ': standalone: a refresh keeps its own entries', pg.input_value('[data-k="buyers.0.age"]') == '41')
        check(vn + ': standalone: “New calculation” is offered', pg.is_visible('[data-pa-new]'))
        pg.click('[data-pa-new]'); pg.wait_for_selector('[data-pa]'); pg.wait_for_timeout(500)
        check(vn + ': standalone: “New calculation” clears it', pg.input_value('[data-k="buyers.0.age"]') == '')
        pg.goto(B + '/tools/planner/?j=1'); pg.wait_for_selector('[data-pa]'); typ(pg, 'buyers.0.age', '42'); typ(pg, 'buyers.0.fixed', '9500'); settle(pg)
        check(vn + ': journey (?j=1): the figures are shared for the next step', (ss(pg, 'gw.fin.v1') or {}).get('borrowers.0.age') == '42', ss(pg, 'gw.fin.v1'))
        pg.goto(B + '/tools/tdsr/?j=1'); pg.wait_for_selector('[data-share="borrowers.0.age"]', state='attached'); pg.wait_for_timeout(500)
        check(vn + ': journey: the next calculator opens with them', pg.input_value('[data-share="borrowers.0.age"]') == '42')
        if vn == 'phone': check('phone: What can I afford? has no sideways scroll', pg.goto(B + '/tools/planner/') is not None and pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'))
        ctx.close()
        # ---------------- Payment timeline ----------------
        ctx, pg, errs3 = page(br, kw); errs += errs3; pg.goto(B + '/tools/payment-planner/'); pg.wait_for_selector('[data-k="kind"]', state='attached')
        typ(pg, 'price', '1500000'); pg.evaluate("()=>document.querySelector('[data-add=\"buyers.1\"]').click()"); chip(pg, 'buyers.1.res', 'PR'); pg.wait_for_timeout(400)
        check(vn + ': timeline B1 the married question appears for a Citizen + PR', pg.is_visible('[data-k="couple"]'))
        sl = lambda: [l for l in pg.inner_text('[data-plan]').split('\n') if l.startswith('Stamp duty on')]
        check(vn + ': timeline B1 the schedule screen shows the stamp duty line', len(sl()) == 1, sl())
        chip(pg, 'couple', 'yes'); pg.wait_for_timeout(600)
        check(vn + ': timeline B1 married: no ABSD on the schedule', sl() and 'ABSD' not in sl()[0], sl())
        chip(pg, 'couple', 'no'); pg.wait_for_timeout(600); check(vn + ': timeline B1 not married: ABSD 5% on the schedule', sl() and '(5%)' in sl()[0], sl())
        pg.evaluate("()=>{const t=document.querySelector('[data-tab=funding]'); if(t) t.click(); document.querySelectorAll('details').forEach(d=>d.open=true)}"); pg.wait_for_timeout(300)
        chip(pg, 'buyers.1.res', 'SC'); chip(pg, 'buyers.0.owned', '1'); chip(pg, 'buyers.1.owned', '1'); chip(pg, 'order', 'sell'); pg.wait_for_timeout(400)
        check(vn + ': timeline B2 both own: “Who owns the home you are selling?”', pg.is_visible('[data-k="saleOwners"]'))
        chip(pg, 'order', 'buy'); chip(pg, 'flatLoan', 'outstanding'); pg.wait_for_timeout(300)
        check(vn + ': timeline B4 buying first with the loan owed: its instalment is asked', pg.is_visible('[data-k="flatInstal"]'))
        typ(pg, 'cpf', '150000'); pg.wait_for_timeout(400)
        check(vn + ': timeline B3 buying first with CPF: the balances are asked', pg.is_visible('.pl-cpf2'))
        if vn == 'phone': check('phone: Payment timeline has no sideways scroll', pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'))
        ctx.close()
        check(vn + ': no script errors', not errs, errs)
    br.close()
finally:
    srv.terminate()
print('c1-render: %d passed, %d failed' % (ok, fail))
sys.exit(1 if fail else 0)
